import { prisma } from "@/lib/db";
import type {
  Channel,
  ConversationStatus,
  Message,
} from "@prisma/client";
import { getLLMProvider } from "./providers";
import { getTool } from "./tools";
import type { ToolContext, ToolDefinition, ToolResult } from "./types";
import type { RetrievedSource, Intent } from "./types";
import {
  ensureLead,
  extractLeadFields,
  getLeadForConversation,
  missingFields,
  nextQuestion,
  applyRawAnswer,
} from "./lead";
import { enqueueJob } from "@/lib/automation/jobs";
import { audit } from "@/lib/observability/audit";

export interface AgentMessageInput {
  orgId: string;
  customerId: string;
  conversationId: string;
  channel: Channel;
  message: string;
}

export interface AgentResult {
  assistantMessageId: string;
  assistantContent: string;
  intent: Intent;
  confidence: number;
  toolCalls: { name: string; status: string }[];
  escalated: boolean;
  escalationId?: string;
  status: ConversationStatus;
  sources: RetrievedSource[];
}

const MAX_TOOL_ITERATIONS = 6;

interface BaseContext {
  intent: { intent: Intent; confidence: number; entities?: Record<string, string> };
  customerMessage: string;
  history: { role: "customer" | "assistant" | "human"; content: string }[];
  toolResults: { tool: string; result: ToolResult }[];
  sources: RetrievedSource[];
}

export async function handleCustomerMessage(
  input: AgentMessageInput,
): Promise<AgentResult> {
  const started = Date.now();
  const provider = getLLMProvider();

  // Load context.
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: input.orgId },
  });
  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: input.customerId },
  });

  // Persist the incoming customer message.
  await prisma.message.create({
    data: {
      conversationId: input.conversationId,
      role: "CUSTOMER",
      content: input.message,
      metadata: JSON.stringify({ channel: input.channel }),
    },
  });

  const history = await loadHistory(input.conversationId);

  // 1) Classify intent. A live provider outage must not crash the conversation —
  //    it degrades to a graceful human escalation instead.
  let intentResult: BaseContext["intent"];
  try {
    intentResult = await provider.classifyIntent(
      input.message,
      history.map((h) => h.content),
    );
  } catch (e) {
    return providerFailureResult(
      input,
      "AI provider unavailable during intent classification",
      e,
    );
  }
  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: { intent: intentResult.intent, aiConfidence: intentResult.confidence, updatedAt: new Date() },
  });

  const ctx: ToolContext = {
    orgId: input.orgId,
    organization,
    customer,
    conversationId: input.conversationId,
  };

  const base: BaseContext = {
    intent: intentResult,
    customerMessage: input.message,
    history,
    toolResults: [],
    sources: [],
  };

  // 2) Lead qualification is a dedicated multi-turn flow. Continue it when the
  //    conversation already has an in-progress lead, regardless of intent.
  const existingLead = await getLeadForConversation(input.conversationId);
  const leadInProgress =
    existingLead && (existingLead.status === "NEW" || existingLead.status === "NEEDS_MORE_INFO");

  if (
    intentResult.intent === "lead_qualification" ||
    (leadInProgress && intentResult.intent !== "human_request")
  ) {
    return runLeadFlow(input, ctx, base);
  }

  // 3) Support tool-calling loop.
  return runSupportLoop(input, ctx, base, started);
}

async function runLeadFlow(
  input: AgentMessageInput,
  ctx: ToolContext,
  base: BaseContext,
): Promise<AgentResult> {
  const fields = extractLeadFields(input.message);
  const leadBefore = await getLeadForConversation(input.conversationId);
  if (leadBefore) {
    applyRawAnswer(input.message, fields, missingFields(leadBefore)[0]);
  }
  await ensureLead(input.orgId, input.customerId, input.conversationId, fields);
  const lead = await getLeadForConversation(input.conversationId);

  const missing = missingFields(lead);
  if (missing.length > 0) {
    const question = nextQuestion(lead);
    const content = question ?? "Could you tell me a bit more about your needs?";
    const msg = await createAssistantMessage(input.conversationId, content);
    return {
      assistantMessageId: msg.id,
      assistantContent: content,
      intent: base.intent.intent,
      confidence: base.intent.confidence,
      toolCalls: [],
      escalated: false,
      status: "AI_ACTIVE",
      sources: [],
    };
  }

  // Enough info: qualify, sync CRM, dispatch automation.
  const toolCalls: { name: string; status: string }[] = [];
  const sources: RetrievedSource[] = [];

  const qualify = getTool("qualify_lead")!;
  const q = await runTool(qualify, {
    name: lead?.name,
    email: lead?.email,
    company: lead?.company,
    companySize: lead?.companySize,
    problem: lead?.problem,
    budgetRange: lead?.budgetRange,
    timeline: lead?.timeline,
  }, ctx);
  toolCalls.push({ name: "qualify_lead", status: q.status });

  const score = (q.result.data as { score?: number; status?: string }) ?? {};
  const qualified = score.status === "QUALIFIED";

  if (qualified && lead?.email) {
    const [firstName = "", lastName = ""] = (lead.name ?? "").split(" ");
    const contact = getTool("create_crm_contact")!;
    const c = await runTool(contact, {
      email: lead.email,
      firstName,
      lastName,
      company: lead.company,
    }, ctx);
    toolCalls.push({ name: "create_crm_contact", status: c.status });

    const deal = getTool("create_crm_deal")!;
    const d = await runTool(deal, {
      name: `${lead.company ?? "New customer"} — AI customer support`,
      stage: "qualified",
    }, ctx);
    toolCalls.push({ name: "create_crm_deal", status: d.status });

    await enqueueJob({
      orgId: input.orgId,
      type: "LEAD_QUALIFICATION",
      idempotencyKey: `lead:${input.conversationId}:qualified`,
      payload: {
        conversationId: input.conversationId,
        leadId: lead.id,
        email: lead.email,
        company: lead.company,
        score: score.score,
      },
    });

    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: "QUALIFIED", qualifiedAt: new Date() },
    });
  }

  const content = qualified
    ? `Thanks ${lead?.name?.split(" ")[0] ?? "you"}! Based on what you've shared, your request looks like a great fit. I've logged your details and our sales team will reach out within one business day to schedule a call.`
    : `Thanks for the details! I've captured your information. A member of our team will follow up shortly to continue the conversation.`;

  const msg = await createAssistantMessage(input.conversationId, content);
  return {
    assistantMessageId: msg.id,
    assistantContent: content,
    intent: base.intent.intent,
    confidence: base.intent.confidence,
    toolCalls,
    escalated: false,
    status: qualified ? "AI_ACTIVE" : "AI_ACTIVE",
    sources,
  };
}

async function runSupportLoop(
  input: AgentMessageInput,
  ctx: ToolContext,
  base: BaseContext,
  started: number,
): Promise<AgentResult> {
  const provider = getLLMProvider();
  const toolCalls: { name: string; status: string }[] = [];
  let escalated = false;
  let escalationId: string | undefined;
  let finalContent = "";

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const stepInput = {
      intent: base.intent,
      customerMessage: base.customerMessage,
      history: base.history,
      toolResults: base.toolResults,
      sources: base.sources,
    };

    let decision;
    try {
      decision = await provider.planStep(stepInput);
    } catch (e) {
      return providerFailureResult(input, "AI provider unavailable during tool planning", e);
    }

    if (decision.type === "respond") {
      try {
        finalContent =
          decision.content && decision.content.length > 0
            ? decision.content
            : await provider.generateResponse(stepInput);
      } catch (e) {
        return providerFailureResult(input, "AI provider unavailable during response generation", e);
      }
      break;
    }

    if (decision.type === "escalate") {
      const esc = await createEscalation(
        input.orgId,
        input.conversationId,
        decision.reason,
        decision.summary,
      );
      escalated = true;
      escalationId = esc.id;
      finalContent =
        "This request needs a quick review from our team before I can complete it. A member of our team will be in touch shortly.";
      break;
    }

    if (decision.type === "tool_call") {
      const tool = getTool(decision.tool);
      if (!tool) {
        finalContent = "I ran into an unexpected issue. Let me connect you with our team.";
        const esc = await createEscalation(
          input.orgId,
          input.conversationId,
          "Unknown tool requested by agent",
          `Agent requested tool "${decision.tool}" which is not registered.`,
        );
        escalated = true;
        escalationId = esc.id;
        break;
      }

      const { result, status } = await runTool(tool, decision.args, ctx);
      toolCalls.push({ name: tool.name, status });

      if (tool.name === "search_knowledge_base" && result.ok) {
        base.sources = extractSources(result);
      }
      if (tool.name === "escalate_to_human") {
        escalated = true;
        escalationId = (result.data as { escalationId?: string })?.escalationId;
      }

      base.toolResults.push({ tool: tool.name, result });

      // Refund threshold → escalate rather than continue blindly.
      if (tool.name === "refund_order" && !result.ok && (result.data as { requiresApproval?: boolean })?.requiresApproval) {
        const esc = await createEscalation(
          input.orgId,
          input.conversationId,
          "Refund amount exceeds approval threshold",
          `Customer requested a refund above the configured approval threshold.`,
        );
        escalated = true;
        escalationId = esc.id;
        finalContent =
          "That refund amount is above what I can approve automatically, so I've sent it to our team for review. They'll be in touch shortly.";
        break;
      }
    }
  }

  if (!finalContent) {
    finalContent = "Thanks for your message. Is there anything else I can help with?";
  }

  await audit(input.orgId, {
    event: "ai.request",
    integration: "CORE",
    conversationId: input.conversationId,
    status: "SUCCESS",
    durationMs: Date.now() - started,
    metadata: { intent: base.intent.intent, tools: toolCalls.map((t) => t.name) },
  });

  let status: ConversationStatus = "AI_ACTIVE";
  if (escalated) status = "NEEDS_HUMAN_REVIEW";

  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: { status, escalationReason: escalated ? "Human review required" : null },
  });

  const msg = await createAssistantMessage(input.conversationId, finalContent);
  return {
    assistantMessageId: msg.id,
    assistantContent: finalContent,
    intent: base.intent.intent,
    confidence: base.intent.confidence,
    toolCalls,
    escalated,
    escalationId,
    status,
    sources: base.sources,
  };
}

async function runTool(
  tool: ToolDefinition,
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<{ result: ToolResult; status: string; durationMs: number }> {
  const startedAt = Date.now();
  let args = rawArgs;
  let validationError: string | undefined;

  const parsed = tool.schema.safeParse(rawArgs);
  if (!parsed.success) {
    validationError = parsed.error.issues.map((i) => i.message).join("; ");
    args = {};
  }

  let result: ToolResult;
  try {
    result = validationError
      ? { ok: false, error: `Invalid arguments: ${validationError}` }
      : await tool.execute(args, ctx);
  } catch (e) {
    result = { ok: false, error: e instanceof Error ? e.message : "Tool execution failed" };
  }

  const durationMs = Date.now() - startedAt;

  await prisma.toolCall.create({
    data: {
      conversationId: ctx.conversationId,
      name: tool.name,
      arguments: JSON.stringify(args),
      result: result ? JSON.stringify(result) : null,
      status: result.ok ? "SUCCESS" : "FAILED",
      error: result.ok ? null : result.error,
      durationMs,
    },
  });

  if (!result.ok) {
    await audit(ctx.orgId, {
      event: `tool.${tool.name}.failed`,
      integration: "CORE",
      conversationId: ctx.conversationId,
      status: "FAILED",
      durationMs,
      metadata: { error: result.error },
    });
  }

  return { result, status: result.ok ? "success" : "failed", durationMs };
}

async function createEscalation(
  orgId: string,
  conversationId: string,
  reason: string,
  summary: string,
) {
  return prisma.escalation.create({
    data: { orgId, conversationId, reason, aiSummary: summary, status: "OPEN" },
  });
}

/**
 * Degrade a live-provider outage to a graceful human escalation: log the
 * failure, flag the conversation for review, and give the customer a friendly
 * message rather than crashing the request.
 */
async function providerFailureResult(
  input: AgentMessageInput,
  reason: string,
  error: unknown,
): Promise<AgentResult> {
  const message = error instanceof Error ? error.message : "Unknown provider error";
  await audit(input.orgId, {
    event: "ai.provider.failed",
    integration: "CORE",
    conversationId: input.conversationId,
    status: "FAILED",
    metadata: { reason, error: message },
  });

  const esc = await createEscalation(
    input.orgId,
    input.conversationId,
    reason,
    "The AI provider returned an error and could not process the request. A human should review.",
  );
  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: { status: "NEEDS_HUMAN_REVIEW", escalationReason: reason },
  });

  const content =
    "I'm having a temporary issue right now. I've flagged your request for our team, and someone will follow up shortly.";
  const msg = await createAssistantMessage(input.conversationId, content);

  return {
    assistantMessageId: msg.id,
    assistantContent: content,
    intent: "general_support",
    confidence: 0,
    toolCalls: [],
    escalated: true,
    escalationId: esc.id,
    status: "NEEDS_HUMAN_REVIEW",
    sources: [],
  };
}

async function createAssistantMessage(
  conversationId: string,
  content: string,
): Promise<Message> {
  return prisma.message.create({
    data: { conversationId, role: "ASSISTANT", content },
  });
}

async function loadHistory(conversationId: string) {
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });
  return messages.map((m) => ({
    role: (m.role === "CUSTOMER" ? "customer" : m.role === "HUMAN" ? "human" : "assistant") as
      | "customer"
      | "assistant"
      | "human",
    content: m.content,
  }));
}

function extractSources(result: ToolResult): RetrievedSource[] {
  if (!result.ok) return [];
  const data = result.data as
    | { chunkId: string; documentTitle: string; content: string; score: number }[]
    | undefined;
  if (!Array.isArray(data)) return [];
  return data.map((d) => ({
    chunkId: d.chunkId,
    documentTitle: d.documentTitle,
    content: d.content,
    score: d.score,
  }));
}

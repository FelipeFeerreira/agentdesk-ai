import { prisma } from "@/lib/db";
import type { Channel } from "@prisma/client";
import { handleCustomerMessage } from "@/lib/ai/agent";
import type { AgentResult } from "@/lib/ai/agent";

export interface IncomingMessage {
  orgId: string;
  channel: Channel;
  /** Stable identifier of the sender on that channel (phone number, visitor id). */
  channelUserId: string;
  content: string;
  /**
   * Per-send id supplied by the client/channel (web chat send id, WhatsApp
   * message id). Used for idempotent ingestion — a replay returns the exact
   * same stored reply instead of re-running the agent.
   */
  clientMessageId?: string;
  /** Optional customer metadata to attach when creating a new customer. */
  name?: string;
  email?: string;
  phone?: string;
}

export interface IncomingResult {
  /** True when the same clientMessageId had already been processed. */
  duplicate: boolean;
  conversationId: string;
  /** null when no AI reply was produced (e.g. a human owns the conversation). */
  result: AgentResult | null;
}

function replayResult(content: string): AgentResult {
  return {
    assistantMessageId: "",
    assistantContent: content,
    intent: "general_support",
    confidence: 0,
    toolCalls: [],
    escalated: false,
    status: "AI_ACTIVE",
    sources: [],
  };
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

async function findReplyAfter(
  conversationId: string,
  existing: { id: string; createdAt: Date },
) {
  return prisma.message.findFirst({
    where: {
      conversationId,
      id: { not: existing.id },
      role: { in: ["ASSISTANT", "HUMAN"] },
      createdAt: { gte: existing.createdAt },
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Unified message ingestion shared by Web Chat and WhatsApp.
 *
 * Responsibilities:
 *  - resolve the customer and the open conversation
 *  - idempotent ingestion keyed on the per-send id (atomic via a unique index)
 *  - conversation state machine: the AI only runs while the conversation is
 *    AI_ACTIVE; while a human owns it (or it awaits review) the message is
 *    still recorded but never answered by the model.
 */
export async function handleIncomingMessage(
  input: IncomingMessage,
): Promise<IncomingResult> {
  // 1) Resolve or create the customer.
  let customer = await prisma.customer.findFirst({
    where:
      input.channel === "WHATSAPP"
        ? { orgId: input.orgId, whatsappId: input.channelUserId }
        : { orgId: input.orgId, externalId: input.channelUserId },
  });
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        orgId: input.orgId,
        ...(input.channel === "WHATSAPP"
          ? { whatsappId: input.channelUserId, phone: input.channelUserId }
          : { externalId: input.channelUserId }),
        name: input.name ?? "Web visitor",
        email: input.email,
      },
    });
  }

  // 2) Resolve or create an open conversation.
  let conversation = await prisma.conversation.findFirst({
    where: {
      orgId: input.orgId,
      customerId: customer.id,
      channel: input.channel,
      status: { notIn: ["RESOLVED"] },
    },
    orderBy: { updatedAt: "desc" },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { orgId: input.orgId, customerId: customer.id, channel: input.channel, status: "AI_ACTIVE" },
    });
  }

  // 3) Idempotency: a replay of the same send returns the stored reply.
  if (input.clientMessageId) {
    const existing = await prisma.message.findFirst({
      where: { conversationId: conversation.id, clientMessageId: input.clientMessageId },
    });
    if (existing) {
      const reply = await findReplyAfter(conversation.id, existing);
      return {
        duplicate: true,
        conversationId: conversation.id,
        result: reply ? replayResult(reply.content) : null,
      };
    }
  }

  // 4) State machine: the AI only answers conversations it owns.
  if (conversation.status !== "AI_ACTIVE") {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "CUSTOMER",
        content: input.content,
        clientMessageId: input.clientMessageId,
        metadata: JSON.stringify({ channel: input.channel }),
      },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });
    return { duplicate: false, conversationId: conversation.id, result: null };
  }

  // 5) Run the agent (it persists the customer message with the send id).
  try {
    const result = await handleCustomerMessage({
      orgId: input.orgId,
      customerId: customer.id,
      conversationId: conversation.id,
      channel: input.channel,
      message: input.content,
      clientMessageId: input.clientMessageId,
    });
    return { duplicate: false, conversationId: conversation.id, result };
  } catch (e) {
    // Concurrent duplicate that raced past the pre-check: replay the stored reply.
    if (isUniqueViolation(e) && input.clientMessageId) {
      const existing = await prisma.message.findFirst({
        where: { conversationId: conversation.id, clientMessageId: input.clientMessageId },
      });
      const reply = existing ? await findReplyAfter(conversation.id, existing) : null;
      return { duplicate: true, conversationId: conversation.id, result: reply ? replayResult(reply.content) : null };
    }
    throw e;
  }
}

export function extractWebchatId(): string {
  return `web_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

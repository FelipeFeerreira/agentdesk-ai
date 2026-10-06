/**
 * OpenAI-backed LLM provider.
 *
 * Uses the OpenAI chat completions API with function/tool calling so the model
 * selects real tools (never invents data). Structured outputs keep intent
 * classification and argument schemas strict.
 *
 * The same `LLMProvider` interface is implemented by `DemoProvider`, so the
 * agent loop is identical whether running offline or against a live model.
 */
import OpenAI from "openai";
import { z } from "zod";
import type { z as zt } from "zod";
import { tools } from "../tools";
import type {
  AgentStepInput,
  Intent,
  IntentResult,
  LLMProvider,
  StepDecision,
} from "../types";
import { SYSTEM_PROMPT } from "../prompt";

function getClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({
    apiKey: key,
    ...(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {}),
  });
}

function toFunctionDefinition() {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: z.toJSONSchema(t.schema as zt.ZodTypeAny),
  }));
}

const INTENTS: { value: Intent; description: string }[] = [
  { value: "order_status", description: "Customer asks where their order is or its status." },
  { value: "refund_request", description: "Customer wants a refund for an order." },
  { value: "refund_policy", description: "Customer asks about the refund or return policy." },
  { value: "shipping_question", description: "Customer asks about shipping or delivery." },
  { value: "pricing_question", description: "Customer asks about pricing or plans." },
  { value: "lead_qualification", description: "A prospective buyer describing their company and need (sales inquiry)." },
  { value: "human_request", description: "Customer asks to speak to a human." },
  { value: "general_support", description: "Any other support question." },
  { value: "unsupported", description: "Out-of-scope or inappropriate request." },
];

export class OpenAIProvider implements LLMProvider {
  name = "openai";
  isDemo = false;

  private get model() {
    return process.env.OPENAI_MODEL || "gpt-4o-mini";
  }

  async classifyIntent(message: string, history: string[]): Promise<IntentResult> {
    const client = getClient();
    if (!client) throw new Error("OPENAI_API_KEY is not configured");

    const res = await client.chat.completions.create({
      model: this.model,
      temperature: 0,
      messages: [
        { role: "system", content: "You classify customer messages into intents. Respond with JSON: { \"intent\": string, \"confidence\": number, \"orderNumber\": string | null }." },
        ...history.slice(-8).map((m) => ({ role: "user" as const, content: m })),
        {
          role: "user",
          content: `Classify this message. Valid intents: ${INTENTS.map((i) => i.value).join(", ")}. Message: "${message}"`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const raw = res.choices[0]?.message?.content ?? "{}";
    try {
      const parsed = JSON.parse(raw);
      const intent = INTENTS.some((i) => i.value === parsed.intent)
        ? (parsed.intent as Intent)
        : "general_support";
      return {
        intent,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
        entities: parsed.orderNumber ? { orderNumber: String(parsed.orderNumber) } : undefined,
      };
    } catch {
      return { intent: "general_support", confidence: 0.4 };
    }
  }

  async planStep(input: AgentStepInput): Promise<StepDecision> {
    const client = getClient();
    if (!client) throw new Error("OPENAI_API_KEY is not configured");

    const messages = buildMessages(input);
    const res = await client.chat.completions.create({
      model: this.model,
      temperature: 0.1,
      messages,
      tools: toFunctionDefinition().map((f) => ({ type: "function" as const, function: f })),
      tool_choice: "auto",
    });

    const msg = res.choices[0]?.message;
    if (msg?.tool_calls && msg.tool_calls.length > 0) {
      const call = msg.tool_calls[0] as {
        function?: { name?: string; arguments?: string };
      };
      const fn = call.function ?? { name: "", arguments: "{}" };
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(fn.arguments || "{}");
      } catch {
        args = {};
      }
      return { type: "tool_call", tool: fn.name ?? "", args };
    }
    return { type: "respond", content: msg?.content ?? "I'm not sure how to help with that." };
  }

  async generateResponse(input: AgentStepInput): Promise<string> {
    const client = getClient();
    if (!client) throw new Error("OPENAI_API_KEY is not configured");

    const messages = [
      ...buildMessages(input),
      {
        role: "system" as const,
        content:
          "Write a concise, professional, customer-facing reply using ONLY the information from the tool results and knowledge sources above. If information is unavailable, say so honestly and offer to escalate. Never invent data.",
      },
    ];
    const res = await client.chat.completions.create({
      model: this.model,
      temperature: 0.3,
      messages,
    });
    return res.choices[0]?.message?.content ?? "I'm sorry, I couldn't generate a response.";
  }
}

function buildMessages(input: AgentStepInput) {
  const history = input.history
    .slice(-10)
    .map((m) => ({
      role: m.role === "customer" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));

  const toolResultBlock = input.toolResults
    .map((t) => `Tool ${t.tool} returned: ${JSON.stringify(t.result)}`)
    .join("\n");

  const sourceBlock = input.sources
    .map((s, i) => `[Source ${i + 1} — ${s.documentTitle}]\n${s.content}`)
    .join("\n\n");

  return [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...history,
    {
      role: "user" as const,
      content: `Latest customer message: "${input.customerMessage}"\n\nIntent: ${input.intent.intent} (confidence ${input.intent.confidence})\n${toolResultBlock ? `\nTool results so far:\n${toolResultBlock}` : ""}\n${sourceBlock ? `\nKnowledge sources:\n${sourceBlock}` : ""}`,
    },
  ];
}

export { getClient };

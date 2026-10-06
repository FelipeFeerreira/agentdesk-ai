import type { z } from "zod";
import type { Customer, Organization } from "@prisma/client";

export interface ToolContext {
  orgId: string;
  organization: Organization;
  customer: Customer;
  conversationId: string;
}

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  /** Whether this tool result should be shown to the customer verbatim. */
  citations?: string[];
}

export type ToolDefinition = {
  name: string;
  description: string;
  sensitive?: boolean;
  schema: z.ZodTypeAny;
  execute(args: unknown, ctx: ToolContext): Promise<ToolResult>;
};

export type Intent =
  | "order_status"
  | "refund_request"
  | "refund_policy"
  | "shipping_question"
  | "pricing_question"
  | "lead_qualification"
  | "human_request"
  | "general_support"
  | "unsupported";

export interface IntentResult {
  intent: Intent;
  confidence: number;
  entities?: Record<string, string>;
}

export type StepDecision =
  | { type: "tool_call"; tool: string; args: Record<string, unknown> }
  | { type: "respond"; content: string }
  | { type: "escalate"; reason: string; summary: string };

export interface RetrievedSource {
  chunkId: string;
  documentTitle: string;
  content: string;
  score: number;
}

export interface AgentStepInput {
  intent: IntentResult;
  customerMessage: string;
  history: { role: "customer" | "assistant" | "human"; content: string }[];
  toolResults: { tool: string; result: ToolResult }[];
  sources: RetrievedSource[];
  leadState?: Record<string, unknown>;
}

export interface LLMProvider {
  name: string;
  isDemo: boolean;
  /** Accumulated token usage across calls (live providers only). */
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  classifyIntent(message: string, history: string[]): Promise<IntentResult>;
  planStep(input: AgentStepInput): Promise<StepDecision>;
  generateResponse(input: AgentStepInput): Promise<string>;
}

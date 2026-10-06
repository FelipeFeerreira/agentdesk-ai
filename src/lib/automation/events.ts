import { z } from "zod";

/**
 * The single automation event contract between AgentDesk and n8n.
 *
 * Every outbound automation is one versioned envelope:
 *   { eventId, type, version, organizationId, timestamp, payload }
 * and n8n routes on `type`. Payloads are strictly validated on BOTH sides so
 * neither system relies on arbitrary structures.
 */
export const AUTOMATION_EVENT_VERSION = 1 as const;

export const automationEventTypeSchema = z.enum([
  "LEAD_QUALIFIED",
  "SUPPORT_ESCALATED",
  "LEAD_FOLLOW_UP",
  "KNOWLEDGE_UPDATE",
]);
export type AutomationEventType = z.infer<typeof automationEventTypeSchema>;

// --- Per-type payload schemas ----------------------------------------------

export const leadQualifiedPayloadSchema = z.object({
  leadId: z.string().min(1),
  conversationId: z.string().min(1),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email(),
  phone: z.string().optional(),
  company: z.string().optional(),
  companySize: z.number().int().positive().optional(),
  budget: z.string().optional(),
  timeline: z.string().optional(),
  problem: z.string().optional(),
  score: z.number(),
});
export type LeadQualifiedPayload = z.infer<typeof leadQualifiedPayloadSchema>;

export const supportEscalatedPayloadSchema = z.object({
  conversationId: z.string().min(1),
  escalationId: z.string().optional(),
  reason: z.string().min(1),
  summary: z.string().min(1),
  customerEmail: z.string().email().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("HIGH"),
});
export type SupportEscalatedPayload = z.infer<typeof supportEscalatedPayloadSchema>;

export const leadFollowUpPayloadSchema = z.object({
  leadId: z.string().min(1),
  email: z.string().email(),
  company: z.string().optional(),
  followUpDelayHours: z.number().nonnegative().default(24),
});
export type LeadFollowUpPayload = z.infer<typeof leadFollowUpPayloadSchema>;

export const knowledgeUpdatePayloadSchema = z.object({
  documentId: z.string().optional(),
  title: z.string().min(1),
  content: z.string().min(1),
  source: z.string().default("n8n"),
  contentHash: z.string().optional(),
});
export type KnowledgeUpdatePayload = z.infer<typeof knowledgeUpdatePayloadSchema>;

// --- Envelope ---------------------------------------------------------------

function envelope<T extends AutomationEventType, P extends z.ZodTypeAny>(type: T, payload: P) {
  return z.object({
    eventId: z.string().min(1),
    type: z.literal(type),
    version: z.literal(AUTOMATION_EVENT_VERSION),
    organizationId: z.string().min(1),
    timestamp: z.string(),
    payload,
  });
}

export const automationEventSchema = z.discriminatedUnion("type", [
  envelope("LEAD_QUALIFIED", leadQualifiedPayloadSchema),
  envelope("SUPPORT_ESCALATED", supportEscalatedPayloadSchema),
  envelope("LEAD_FOLLOW_UP", leadFollowUpPayloadSchema),
  envelope("KNOWLEDGE_UPDATE", knowledgeUpdatePayloadSchema),
]);
export type AutomationEvent = z.infer<typeof automationEventSchema>;

/** Build a validated automation envelope with a fresh id + timestamp. */
export function buildAutomationEvent<T extends AutomationEventType>(
  type: T,
  organizationId: string,
  payload: Record<string, unknown>,
): AutomationEvent {
  return automationEventSchema.parse({
    eventId: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
    type,
    version: AUTOMATION_EVENT_VERSION,
    organizationId,
    timestamp: new Date().toISOString(),
    payload,
  }) as AutomationEvent;
}

/** Map an internal background-job type to its automation event type. */
export function jobTypeToEventType(type: string): AutomationEventType | null {
  switch (type) {
    case "LEAD_QUALIFICATION":
      return "LEAD_QUALIFIED";
    case "SUPPORT_ESCALATION":
      return "SUPPORT_ESCALATED";
    case "FOLLOW_UP":
      return "LEAD_FOLLOW_UP";
    case "KB_INGESTION":
      return "KNOWLEDGE_UPDATE";
    default:
      return null;
  }
}

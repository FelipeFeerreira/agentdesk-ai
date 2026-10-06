import { z } from "zod";

/**
 * Organization-level settings. Stored as JSON on `Organization.settings`.
 * All thresholds used by the agent (escalation, refund approval, retrieval)
 * are editable here so the behaviour is transparent and configurable.
 */
export const organizationSettingsSchema = z
  .object({
    ai: z
      .object({
        model: z.string().min(1),
        temperature: z.number().min(0).max(2),
        maxResponseLength: z.number().int().min(1),
        escalationConfidenceThreshold: z.number().min(0).max(1),
      })
      .partial(),
    business: z
      .object({
        supportHours: z.string().min(1),
        refundApprovalThresholdUsd: z.number().min(0),
        defaultLanguage: z.string().min(1),
      })
      .partial(),
    knowledge: z
      .object({
        retrievalLimit: z.number().int().min(1),
        similarityThreshold: z.number().min(0).max(1),
      })
      .partial(),
    automation: z
      .object({
        followUpDelayHours: z.number().min(0),
        maxRetries: z.number().int().min(0),
      })
      .partial(),
  })
  .partial();

export type OrganizationSettings = {
  ai: {
    model: string;
    temperature: number;
    maxResponseLength: number;
    escalationConfidenceThreshold: number;
  };
  business: {
    supportHours: string;
    refundApprovalThresholdUsd: number;
    defaultLanguage: string;
  };
  knowledge: {
    retrievalLimit: number;
    similarityThreshold: number;
  };
  automation: {
    followUpDelayHours: number;
    maxRetries: number;
  };
};

export const defaultSettings: OrganizationSettings = {
  ai: {
    model: "gpt-4o-mini",
    temperature: 0.2,
    maxResponseLength: 900,
    escalationConfidenceThreshold: 0.6,
  },
  business: {
    supportHours: "9:00-18:00",
    refundApprovalThresholdUsd: 100,
    defaultLanguage: "en",
  },
  knowledge: {
    retrievalLimit: 4,
    similarityThreshold: 0.2,
  },
  automation: {
    followUpDelayHours: 24,
    maxRetries: 3,
  },
};

export function parseSettings(raw: string): OrganizationSettings {
  let parsed: unknown = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }
  const partial = organizationSettingsSchema.parse(parsed);
  return deepMerge(defaultSettings, partial) as OrganizationSettings;
}

export function serializeSettings(settings: OrganizationSettings): string {
  return JSON.stringify(settings);
}

function deepMerge<T>(base: T, partial: unknown): T {
  if (Array.isArray(base)) return base;
  if (base && typeof base === "object" && partial && typeof partial === "object") {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [k, v] of Object.entries(partial as Record<string, unknown>)) {
      const existing = (base as Record<string, unknown>)[k];
      if (existing && typeof existing === "object" && v && typeof v === "object") {
        out[k] = deepMerge(existing, v);
      } else {
        out[k] = v;
      }
    }
    return out as T;
  }
  return (partial === undefined ? base : (partial as T));
}

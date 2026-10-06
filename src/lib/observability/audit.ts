import { prisma } from "@/lib/db";
import type { AuditStatus } from "@prisma/client";

export interface AuditInput {
  event: string;
  integration?: string;
  conversationId?: string;
  status?: AuditStatus;
  durationMs?: number;
  retryCount?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Write a sanitized audit log entry. Metadata is JSON-stringified; callers are
 * responsible for never passing secrets/tokens/private raw payloads.
 */
export async function audit(
  orgId: string,
  input: AuditInput,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        orgId,
        event: input.event,
        integration: input.integration ?? null,
        conversationId: input.conversationId ?? null,
        status: input.status ?? "SUCCESS",
        durationMs: input.durationMs ?? null,
        retryCount: input.retryCount ?? 0,
        metadata: input.metadata ? JSON.stringify(sanitize(input.metadata)) : "{}",
      },
    });
  } catch (e) {
    // Never let audit logging break the primary business flow.
    console.error("[audit] failed to write audit log:", e);
  }
}

/** Recursively strip obvious secret-shaped keys before logging. */
function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/token|secret|password|api[_-]?key|authorization/i.test(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = sanitize(v);
      }
    }
    return out;
  }
  return value;
}

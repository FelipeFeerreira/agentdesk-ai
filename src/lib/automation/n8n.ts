import { prisma } from "@/lib/db";
import type { WorkflowType } from "@prisma/client";

export class N8nUnavailableError extends Error {
  constructor(message = "n8n webhook unavailable") {
    super(message);
    this.name = "N8nUnavailableError";
  }
}

export interface AutomationResult {
  ok: boolean;
  demo: boolean;
  error?: string;
}

/**
 * Dispatch a business event to n8n (or the local demo provider when no webhook
 * URL is configured). The webhook URL is treated as the single entrypoint; the
 * concrete n8n workflow routing lives in the shipped workflow JSON files.
 */
export async function triggerN8n(
  type: WorkflowType,
  payload: Record<string, unknown>,
): Promise<AutomationResult> {
  const url = process.env.N8N_WEBHOOK_URL;
  if (!url) {
    // Demo mode: simulate a successful n8n dispatch and persist an audit trail.
    await prisma.auditLog.create({
      data: {
        orgId: payload.orgId as string,
        event: `n8n.${type.toLowerCase()}`,
        integration: "N8N",
        status: "SUCCESS",
        metadata: JSON.stringify({ demo: true, type }),
      },
    });
    return { ok: true, demo: true };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new N8nUnavailableError(`n8n responded ${res.status}`);
    }
    return { ok: true, demo: false };
  } catch (e) {
    throw new N8nUnavailableError(
      e instanceof Error ? e.message : "n8n webhook unavailable",
    );
  }
}

import { createHmac } from "crypto";
import { prisma } from "@/lib/db";
import type { AutomationEvent } from "./events";

export class N8nUnavailableError extends Error {
  constructor(message = "n8n webhook unavailable") {
    super(message);
    this.name = "N8nUnavailableError";
  }
}

export interface AutomationResult {
  ok: boolean;
  demo: boolean;
  eventId: string;
  error?: string;
}

/**
 * Dispatch a single, validated automation event to the n8n entry webhook.
 *
 * One endpoint, one versioned envelope — n8n routes internally on `event.type`.
 * The request is signed with HMAC-SHA256 (`x-agentdesk-signature`) so n8n can
 * verify authenticity. When no webhook is configured (demo mode), the event is
 * recorded locally and clearly labelled as simulated.
 */
export async function dispatchAutomationEvent(
  event: AutomationEvent,
): Promise<AutomationResult> {
  const url = process.env.N8N_WEBHOOK_URL;
  if (!url) {
    await prisma.auditLog.create({
      data: {
        orgId: event.organizationId,
        event: `automation.${event.type.toLowerCase()}`,
        integration: "N8N",
        status: "SUCCESS",
        metadata: JSON.stringify({ demo: true, eventId: event.eventId, type: event.type, version: event.version }),
      },
    });
    return { ok: true, demo: true, eventId: event.eventId };
  }

  const body = JSON.stringify(event);
  const secret = process.env.N8N_WEBHOOK_SECRET ?? "";
  const signature = `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // HMAC for custom verification, plus a shared-secret header so n8n can
        // use its native "Header Auth" credential on the entry webhook.
        "x-agentdesk-signature": signature,
        "x-agentdesk-secret": secret,
        "x-agentdesk-event": event.type,
        "x-agentdesk-version": String(event.version),
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new N8nUnavailableError(`n8n responded ${res.status}`);
    }
    return { ok: true, demo: false, eventId: event.eventId };
  } catch (e) {
    throw new N8nUnavailableError(e instanceof Error ? e.message : "n8n webhook unavailable");
  }
}

import { createHmac, timingSafeEqual } from "crypto";

/**
 * WhatsApp Cloud API integration.
 *
 * Implemented here: webhook verification, inbound message parsing, outbound
 * message sending, signature verification, and idempotency guidance. The demo
 * path (no credentials) is handled by `inbox.ts` + the web chat.
 */

const GRAPH_API = "https://graph.facebook.com/v21.0";

export function verifyWebhookVerification(
  mode: string,
  token: string,
  challenge: string,
): string | null {
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!expected) return null;
  if (mode === "subscribe" && token === expected) return challenge;
  return null;
}

export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export interface InboundWhatsAppMessage {
  id: string;
  from: string; // phone number
  text: string;
  timestamp: string;
}

/**
 * Extract inbound text messages from a Meta webhook payload.
 * Returns an empty array for non-message events (status updates, etc.).
 */
export function parseWebhookEvent(body: {
  entry?: { changes?: { value?: { messages?: { id: string; from: string; text?: { body: string }; timestamp: string }[] } }[] }[];
}): InboundWhatsAppMessage[] {
  const messages: InboundWhatsAppMessage[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        if (msg.text?.body) {
          messages.push({
            id: msg.id,
            from: msg.from,
            text: msg.text.body,
            timestamp: msg.timestamp,
          });
        }
      }
    }
  }
  return messages;
}

export interface SendMessageResult {
  ok: boolean;
  demo: boolean;
  messageId?: string;
  error?: string;
}

export async function sendWhatsAppMessage(
  to: string,
  text: string,
): Promise<SendMessageResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    // Demo mode — the message is already persisted locally by the agent.
    return { ok: true, demo: true, messageId: `wa_demo_${Date.now().toString(36)}` };
  }

  try {
    const res = await fetch(
      `${GRAPH_API}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: text },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) {
      const textRes = await res.text().catch(() => "");
      throw new Error(`WhatsApp send failed (${res.status}): ${textRes}`);
    }
    const data = (await res.json()) as { messages?: { id: string }[] };
    return { ok: true, demo: false, messageId: data.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, demo: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

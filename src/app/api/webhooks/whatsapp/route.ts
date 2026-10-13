import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  parseWebhookEvent,
  sendWhatsAppMessage,
  verifyWebhookSignature,
  verifyWebhookVerification,
} from "@/lib/messaging/whatsapp";
import { handleIncomingMessage } from "@/lib/messaging/inbox";
import { audit } from "@/lib/observability/audit";
import { isDemoMode } from "@/lib/security/mode";

const MAX_BODY_BYTES = 256 * 1024; // Meta webhook payloads are small

/**
 * WhatsApp Cloud API webhook.
 *
 * GET  — Meta webhook verification handshake.
 * POST — inbound messages + status updates.
 *
 * Security: outside demo mode the app authentication secret is REQUIRED and the
 * HMAC signature MUST verify; otherwise nothing is processed. Demo mode skips
 * signature enforcement only when no secret is configured (and still verifies
 * if one happens to be present).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode") ?? "";
  const token = searchParams.get("hub.verify_token") ?? "";
  const challenge = searchParams.get("hub.challenge") ?? "";

  const result = verifyWebhookVerification(mode, token, challenge);
  if (result) return new Response(result, { status: 200 });
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const signature = request.headers.get("x-hub-signature-256") ?? "";
  const secret = process.env.WHATSAPP_APP_SECRET;

  if (!isDemoMode()) {
    // Connected mode: a configured secret and a valid signature are mandatory.
    if (!secret) {
      return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
    }
    if (!verifyWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else if (secret && !verifyWebhookSignature(rawBody, signature)) {
    // Demo mode with a secret present: still enforce it.
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Malformed webhook body" }, { status: 400 });
  }

  const messages = parseWebhookEvent(
    body as Parameters<typeof parseWebhookEvent>[0],
  );

  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) return NextResponse.json({ ok: true });

  for (const msg of messages) {
    const result = await handleIncomingMessage({
      orgId: org.id,
      channel: "WHATSAPP",
      channelUserId: msg.from,
      content: msg.text,
      clientMessageId: `wa:${msg.id}`,
      phone: msg.from,
    });

    // Conflicting or in-flight receipts are ignored (Meta will not resend on 200).
    if (result.conflict || result.inProgress) continue;

    if (!result.duplicate && result.result?.assistantContent) {
      const sent = await sendWhatsAppMessage(msg.from, result.result.assistantContent);
      if (!sent.ok) {
        await audit(org.id, {
          event: "whatsapp.send.failed",
          integration: "WHATSAPP",
          conversationId: result.conversationId ?? undefined,
          status: "FAILED",
          metadata: { error: sent.error },
        });
      }
    }
  }

  // Acknowledge so Meta does not retry; delivery/retry is handled separately.
  return NextResponse.json({ ok: true });
}

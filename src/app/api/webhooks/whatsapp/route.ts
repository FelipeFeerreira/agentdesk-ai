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

/**
 * WhatsApp Cloud API webhook.
 *
 * GET  — Meta webhook verification handshake.
 * POST — inbound messages + status updates (signature-verified, idempotent).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode") ?? "";
  const token = searchParams.get("hub.verify_token") ?? "";
  const challenge = searchParams.get("hub.challenge") ?? "";

  const result = verifyWebhookVerification(mode, token, challenge);
  if (result) {
    return new Response(result, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  // Signature verification (required in production when a secret is set).
  const signature = request.headers.get("x-hub-signature-256") ?? "";
  if (process.env.WHATSAPP_APP_SECRET && !verifyWebhookSignature(rawBody, signature)) {
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
    // Idempotency: message id is the idempotency key.
    const result = await handleIncomingMessage({
      orgId: org.id,
      channel: "WHATSAPP",
      channelUserId: msg.from,
      content: msg.text,
      idempotencyKey: `wa:${msg.id}`,
      phone: msg.from,
    });

    // Reply back to the customer on WhatsApp.
    if (!result.duplicate && result.result?.assistantContent) {
      const sent = await sendWhatsAppMessage(msg.from, result.result.assistantContent);
      if (!sent.ok) {
        await audit(org.id, {
          event: "whatsapp.send.failed",
          integration: "WHATSAPP",
          conversationId: result.conversationId,
          status: "FAILED",
          metadata: { error: sent.error },
        });
      }
    }
  }

  // Always acknowledge quickly so Meta does not retry.
  return NextResponse.json({ ok: true });
}

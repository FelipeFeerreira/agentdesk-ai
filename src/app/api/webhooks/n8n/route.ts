import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { ingestDocument } from "@/lib/rag/ingest";
import { automationEventSchema } from "@/lib/automation/events";
import { audit } from "@/lib/observability/audit";

/**
 * Inbound webhook for n8n → AgentDesk events (e.g. the Knowledge Base Update
 * workflow sends extracted document text here for ingestion).
 *
 * Accepts the same versioned envelope AgentDesk emits, validated with the
 * shared `automationEventSchema`. When `N8N_WEBHOOK_SECRET` is set, the
 * `x-agentdesk-signature` HMAC header is verified.
 */
export async function POST(request: Request) {
  const raw = await request.text();

  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (secret) {
    const signature = request.headers.get("x-agentdesk-signature") ?? "";
    const expected = `sha256=${createHmac("sha256", secret).update(raw, "utf8").digest("hex")}`;
    const ok =
      signature.length === expected.length &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!ok) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }

  const parsed = automationEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid event", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }
  const event = parsed.data;

  const org = await prisma.organization.findUnique({ where: { id: event.organizationId } });
  if (!org) return NextResponse.json({ error: "Unknown organization" }, { status: 404 });

  switch (event.type) {
    case "KNOWLEDGE_UPDATE": {
      const { title, content, source } = event.payload;
      try {
        const id = await ingestDocument({
          orgId: org.id,
          title,
          source: source || "n8n",
          type: "MANUAL",
          text: content,
        });
        await audit(org.id, {
          event: "n8n.knowledge_update",
          integration: "N8N",
          status: "SUCCESS",
          metadata: { eventId: event.eventId, documentId: id },
        });
        return NextResponse.json({ ok: true, documentId: id });
      } catch (e) {
        await audit(org.id, {
          event: "n8n.knowledge_update",
          integration: "N8N",
          status: "FAILED",
          metadata: { eventId: event.eventId, error: e instanceof Error ? e.message : "ingestion failed" },
        });
        return NextResponse.json({ error: "Ingestion failed" }, { status: 500 });
      }
    }
    default:
      await audit(org.id, {
        event: `n8n.${event.type.toLowerCase()}`,
        integration: "N8N",
        status: "SKIPPED",
        metadata: { eventId: event.eventId },
      });
      return NextResponse.json({ ok: true, handled: false });
  }
}

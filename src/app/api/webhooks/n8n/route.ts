import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ingestDocument } from "@/lib/rag/ingest";
import { enqueueJob } from "@/lib/automation/jobs";
import { audit } from "@/lib/observability/audit";

/**
 * Inbound webhook endpoint for n8n workflows (e.g. the "Knowledge Base Update"
 * workflow sends extracted document text here for ingestion).
 */
const schema = z.object({
  type: z.string().trim().min(1).max(64),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) return NextResponse.json({ error: "No workspace" }, { status: 500 });

  const p = parsed.data.payload as Record<string, unknown>;

  switch (parsed.data.type) {
    case "kb_ingestion": {
      const title = typeof p.title === "string" ? p.title : "Imported document";
      const text = typeof p.content === "string" ? p.content : "";
      if (!text) return NextResponse.json({ error: "No content" }, { status: 400 });
      try {
        const id = await ingestDocument({
          orgId: org.id,
          title,
          source: "n8n",
          type: "MANUAL",
          text,
        });
        await audit(org.id, { event: "n8n.kb_ingestion", integration: "N8N", status: "SUCCESS", metadata: { documentId: id } });
        return NextResponse.json({ ok: true, id });
      } catch (e) {
        await audit(org.id, { event: "n8n.kb_ingestion", integration: "N8N", status: "FAILED", metadata: { error: String(e) } });
        return NextResponse.json({ error: "Ingestion failed" }, { status: 500 });
      }
    }
    default:
      await enqueueJob({
        orgId: org.id,
        type: "GENERIC",
        idempotencyKey: `n8n:${parsed.data.type}:${JSON.stringify(p).length}`,
        payload: p,
      });
      return NextResponse.json({ ok: true });
  }
}

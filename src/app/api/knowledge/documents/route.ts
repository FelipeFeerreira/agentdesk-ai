import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { ingestDocument, extractText } from "@/lib/rag/ingest";
import { audit } from "@/lib/observability/audit";
import type { DocType } from "@prisma/client";

const MANUAL_SCHEMA = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(50_000),
});

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

function detectType(filename: string): DocType | null {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "pdf") return "PDF";
  if (ext === "md" || ext === "markdown") return "MARKDOWN";
  if (ext === "txt" || ext === "text") return "TEXT";
  return null;
}

export async function POST(request: Request) {
  const user = await requireUser();
  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "No file provided." }, { status: 400 });
      }
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: "File exceeds 10 MB limit." }, { status: 413 });
      }
      const type = detectType(file.name);
      if (!type) {
        return NextResponse.json(
          { error: "Unsupported file type. Use PDF, TXT, or Markdown." },
          { status: 415 },
        );
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const text = await extractText(type, file.type, buffer);
      const docId = await ingestDocument({
        orgId: user.orgId,
        title: file.name.replace(/\.[^.]+$/, ""),
        source: file.name,
        type,
        text,
      });
      await audit(user.orgId, { event: "knowledge.ingest", integration: "RAG", status: "SUCCESS", metadata: { documentId: docId } });
      return NextResponse.json({ ok: true, id: docId });
    }

    // Manual text document.
    const body = await request.json();
    const parsed = MANUAL_SCHEMA.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Title and content are required." }, { status: 400 });
    }
    const docId = await ingestDocument({
      orgId: user.orgId,
      title: parsed.data.title,
      source: "manual",
      type: "MANUAL",
      text: parsed.data.content,
    });
    await audit(user.orgId, { event: "knowledge.ingest", integration: "RAG", status: "SUCCESS", metadata: { documentId: docId } });
    return NextResponse.json({ ok: true, id: docId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ingestion failed.";
    await audit(user.orgId, { event: "knowledge.ingest", integration: "RAG", status: "FAILED", metadata: { error: message } });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const user = await requireUser();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const doc = await prisma.knowledgeDocument.findFirst({
    where: { id, orgId: user.orgId },
  });
  if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });

  await prisma.knowledgeChunk.deleteMany({ where: { documentId: id } });
  await prisma.knowledgeDocument.delete({ where: { id } });
  await audit(user.orgId, { event: "knowledge.delete", integration: "RAG", status: "SUCCESS", metadata: { documentId: id } });

  return NextResponse.json({ ok: true });
}

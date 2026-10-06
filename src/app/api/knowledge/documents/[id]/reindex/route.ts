import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { chunkText } from "@/lib/rag/chunker";
import { persistChunks } from "@/lib/rag/ingest";

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await ctx.params;

  const doc = await prisma.knowledgeDocument.findFirst({
    where: { id, orgId: user.orgId },
    include: { chunks: { orderBy: { index: "asc" } } },
  });
  if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Reconstruct full text from existing chunks, then re-chunk + re-embed.
  const text = doc.chunks.map((c) => c.content).join("\n\n");
  if (!text) {
    return NextResponse.json({ error: "Document has no extractable text to reindex." }, { status: 400 });
  }

  await prisma.knowledgeDocument.update({
    where: { id },
    data: { status: "PROCESSING", error: null },
  });

  try {
    const chunkCount = await persistChunks(id, user.orgId, chunkText(text));
    await prisma.knowledgeDocument.update({ where: { id }, data: { status: "READY", error: null } });
    return NextResponse.json({ ok: true, chunkCount });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Reindex failed.";
    await prisma.knowledgeDocument.update({ where: { id }, data: { status: "FAILED", error: message } });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { chunkText } from "@/lib/rag/chunker";
import { getEmbedder } from "@/lib/rag/embedder";

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

  // Reconstruct full text, re-chunk and re-embed in place.
  const text = doc.chunks.map((c) => c.content).join("\n\n");
  if (!text) {
    return NextResponse.json({ error: "Document has no extractable text to reindex." }, { status: 400 });
  }

  await prisma.knowledgeDocument.update({ where: { id }, data: { status: "PROCESSING", error: null } });
  await prisma.knowledgeChunk.deleteMany({ where: { documentId: id } });

  const chunks = chunkText(text);
  const embedder = getEmbedder();

  await prisma.$transaction(
    chunks.map((content, index) =>
      prisma.knowledgeChunk.create({
        data: { documentId: id, orgId: user.orgId, content, index, embedding: "[]" },
      }),
    ),
  );

  const created = await prisma.knowledgeChunk.findMany({
    where: { documentId: id },
    orderBy: { index: "asc" },
  });
  for (const chunk of created) {
    const embedding = await embedder.embed(chunk.content);
    await prisma.knowledgeChunk.update({
      where: { id: chunk.id },
      data: { embedding: JSON.stringify(embedding) },
    });
  }

  await prisma.knowledgeDocument.update({ where: { id }, data: { status: "READY", error: null } });

  return NextResponse.json({ ok: true, chunkCount: chunks.length });
}

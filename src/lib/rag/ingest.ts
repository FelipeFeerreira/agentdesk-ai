import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import type { DocType } from "@prisma/client";
import { chunkText } from "./chunker";
import { getEmbedder } from "./embedder";
import { isPgvectorEnabled } from "./store";

export interface IngestInput {
  orgId: string;
  title: string;
  source: string;
  type: DocType;
  text: string;
}

function contentHash(text: string): string {
  return createHash("sha256").update(text.replace(/\s+/g, " ").trim()).digest("hex");
}

/**
 * Full document ingestion pipeline:
 * text → normalize → content-hash → chunk → embed → persist.
 *
 * Guarantees:
 *  - duplicate indexing is avoided by a per-org content hash (idempotent re-upload)
 *  - when pgvector is enabled the native `embeddingVector` column is populated
 *  - failures mark the document FAILED with a visible reason (retry by re-upload/reindex)
 */
export async function ingestDocument(input: IngestInput): Promise<string> {
  const hash = contentHash(input.text);

  const existing = await prisma.knowledgeDocument.findFirst({
    where: { orgId: input.orgId, contentHash: hash },
  });

  // Idempotent: the exact same content is already indexed.
  if (existing && existing.status === "READY") {
    return existing.id;
  }

  const document = existing
    ? await prisma.knowledgeDocument.update({
        where: { id: existing.id },
        data: { title: input.title, source: input.source, type: input.type, status: "PROCESSING", error: null },
      })
    : await prisma.knowledgeDocument.create({
        data: {
          orgId: input.orgId,
          title: input.title,
          source: input.source,
          type: input.type,
          status: "PROCESSING",
          contentHash: hash,
        },
      });

  try {
    const chunks = chunkText(input.text);
    if (chunks.length === 0) {
      throw new Error("Document contained no extractable text.");
    }
    await persistChunks(document.id, input.orgId, chunks);

    await prisma.knowledgeDocument.update({
      where: { id: document.id },
      data: { status: "READY" },
    });

    return document.id;
  } catch (err) {
    await prisma.knowledgeDocument.update({
      where: { id: document.id },
      data: {
        status: "FAILED",
        error: err instanceof Error ? err.message : "Unknown ingestion error",
      },
    });
    throw err;
  }
}

/**
 * Replace a document's chunks: delete old chunks, embed the new ones, and — when
 * pgvector is enabled — populate the native `embeddingVector` column. Used by
 * both ingestion and reindexing so the two paths can never drift.
 */
export async function persistChunks(
  documentId: string,
  orgId: string,
  chunks: string[],
): Promise<number> {
  await prisma.knowledgeChunk.deleteMany({ where: { documentId } });

  const embedder = getEmbedder();
  const pgvector = isPgvectorEnabled();

  for (let index = 0; index < chunks.length; index++) {
    const content = chunks[index];
    const embedding = await embedder.embed(content);
    const created = await prisma.knowledgeChunk.create({
      data: { documentId, orgId, content, index, embedding: JSON.stringify(embedding) },
    });

    if (pgvector) {
      const vector = `[${embedding.join(",")}]`;
      await prisma.$executeRaw`
        UPDATE "KnowledgeChunk"
        SET "embeddingVector" = ${vector}::vector
        WHERE id = ${created.id}
      `;
    }
  }
  return chunks.length;
}

/**
 * Extract raw text from a file buffer based on its declared type.
 * Supports plain text, markdown and PDF (via pdf-parse).
 */
export async function extractText(
  type: DocType,
  mimeType: string,
  buffer: Buffer,
): Promise<string> {
  if (type === "TEXT" || type === "MARKDOWN") {
    return buffer.toString("utf-8");
  }
  if (type === "PDF") {
    const { parsePdf } = await import("./pdf");
    return parsePdf(buffer);
  }
  if (mimeType.startsWith("text/")) {
    return buffer.toString("utf-8");
  }
  throw new Error(`Unsupported document type: ${mimeType || type}`);
}

import { prisma } from "@/lib/db";
import type { DocType } from "@prisma/client";
import { chunkText } from "./chunker";
import { getEmbedder } from "./embedder";

export interface IngestInput {
  orgId: string;
  title: string;
  source: string;
  type: DocType;
  text: string;
}

/**
 * Full document ingestion pipeline:
 * text -> normalize -> chunk -> embed -> persist (KnowledgeDocument + chunks).
 */
export async function ingestDocument(input: IngestInput): Promise<string> {
  const document = await prisma.knowledgeDocument.create({
    data: {
      orgId: input.orgId,
      title: input.title,
      source: input.source,
      type: input.type,
      status: "PROCESSING",
    },
  });

  try {
    const chunks = chunkText(input.text);
    if (chunks.length === 0) {
      throw new Error("Document contained no extractable text.");
    }

    const embedder = getEmbedder();
    await prisma.$transaction(
      chunks.map((content, index) =>
        prisma.knowledgeChunk.create({
          data: {
            documentId: document.id,
            orgId: input.orgId,
            content,
            index,
            embedding: "[]",
          },
        }),
      ),
    );

    const created = await prisma.knowledgeChunk.findMany({
      where: { documentId: document.id },
      orderBy: { index: "asc" },
    });

    for (const chunk of created) {
      const embedding = await embedder.embed(chunk.content);
      await prisma.knowledgeChunk.update({
        where: { id: chunk.id },
        data: { embedding: JSON.stringify(embedding) },
      });
    }

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

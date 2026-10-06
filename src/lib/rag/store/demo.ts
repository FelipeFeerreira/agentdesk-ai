import { prisma } from "@/lib/db";
import { cosineSimilarity } from "../embedder";
import type { RetrievedChunk, RetrieveOptions, VectorStore } from "./types";

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * In-process cosine-similarity retrieval over the JSON `embedding` column.
 * Used for the zero-dependency demo (SQLite), where a vector index is not
 * available. Functionally identical to pgvector at demo scale.
 */
export class DemoVectorStore implements VectorStore {
  readonly kind = "demo" as const;

  async retrieve(
    orgId: string,
    queryEmbedding: number[],
    opts: RetrieveOptions,
  ): Promise<RetrievedChunk[]> {
    const chunks = await prisma.knowledgeChunk.findMany({
      where: { orgId, document: { status: "READY" } },
      include: { document: true },
    });
    if (chunks.length === 0) return [];

    return chunks
      .map((chunk) => {
        let embedding: number[] = [];
        try {
          embedding = JSON.parse(chunk.embedding);
        } catch {
          embedding = [];
        }
        const score = embedding.length ? cosineSimilarity(queryEmbedding, embedding) : 0;
        return { chunk, score };
      })
      .filter((s) => s.score >= opts.threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.limit)
      .map((s) => ({
        chunkId: s.chunk.id,
        documentId: s.chunk.documentId,
        documentTitle: s.chunk.document.title,
        content: s.chunk.content,
        score: round(s.score),
      }));
  }
}

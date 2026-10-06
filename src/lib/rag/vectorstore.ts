import { prisma } from "@/lib/db";
import { cosineSimilarity, getEmbedder } from "./embedder";
import { parseSettings } from "@/lib/settings";

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  score: number;
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  queryEmbedding: number[];
}

/**
 * Semantic retrieval over an organization's indexed knowledge chunks.
 *
 * Default implementation loads chunks and computes cosine similarity in-process,
 * which works identically on SQLite (demo) and PostgreSQL. At production scale
 * this is swapped for pgvector's `<=>` index query — see docs/rag.md.
 */
export async function retrieveChunks(
  orgId: string,
  query: string,
): Promise<RetrievalResult> {
  const embedder = getEmbedder();
  const queryEmbedding = await embedder.embed(query);

  const chunks = await prisma.knowledgeChunk.findMany({
    where: { orgId, document: { status: "READY" } },
    include: { document: true },
  });

  if (chunks.length === 0) {
    return { chunks: [], queryEmbedding };
  }

  const scored = chunks
    .map((chunk) => {
      let embedding: number[];
      try {
        embedding = JSON.parse(chunk.embedding);
      } catch {
        embedding = [];
      }
      const score = embedding.length
        ? cosineSimilarity(queryEmbedding, embedding)
        : 0;
      return { chunk, score };
    })
    .sort((a, b) => b.score - a.score);

  const settings = await getOrgSettingsSafe(orgId);
  const limit = settings.knowledge.retrievalLimit;
  const threshold = settings.knowledge.similarityThreshold;

  const chunks2: RetrievedChunk[] = scored
    .filter((s) => s.score >= threshold)
    .slice(0, limit)
    .map((s) => ({
      chunkId: s.chunk.id,
      documentId: s.chunk.documentId,
      documentTitle: s.chunk.document.title,
      content: s.chunk.content,
      score: round(s.score),
    }));

  return { chunks: chunks2, queryEmbedding };
}

async function getOrgSettingsSafe(orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  return parseSettings(org?.settings ?? "{}");
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

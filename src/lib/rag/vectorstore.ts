import { prisma } from "@/lib/db";
import { getEmbedder } from "./embedder";
import { getVectorStore } from "./store";
import { parseSettings } from "@/lib/settings";
import type { RetrievedChunk } from "./store/types";

export type { RetrievedChunk } from "./store/types";

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  queryEmbedding: number[];
}

/**
 * Semantic retrieval over an organization's indexed knowledge chunks.
 *
 * Backend is chosen by `getVectorStore()`:
 *   - demo/SQLite  → in-process cosine over the JSON `embedding` column
 *   - production   → pgvector `<=>` over the native `embeddingVector` column
 *
 * The dimension of the embedding must match the configured provider/column
 * (OpenAI text-embedding-3-small = 1536).
 */
export async function retrieveChunks(
  orgId: string,
  query: string,
): Promise<RetrievalResult> {
  const embedder = getEmbedder();
  const queryEmbedding = await embedder.embed(query);

  const settings = await getOrgSettingsSafe(orgId);
  const store = getVectorStore();

  const chunks = await store.retrieve(orgId, queryEmbedding, {
    limit: settings.knowledge.retrievalLimit,
    threshold: settings.knowledge.similarityThreshold,
  });

  return { chunks, queryEmbedding };
}

async function getOrgSettingsSafe(orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  return parseSettings(org?.settings ?? "{}");
}

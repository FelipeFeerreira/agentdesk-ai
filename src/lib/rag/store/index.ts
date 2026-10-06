import { DemoVectorStore } from "./demo";
import { PostgresVectorStore } from "./postgres";
import type { VectorStore } from "./types";

let cached: VectorStore | null = null;

/**
 * pgvector retrieval is opt-in (`USE_PGVECTOR=true`) so the default SQLite demo
 * never assumes a vector column exists.
 */
export function isPgvectorEnabled(): boolean {
  return process.env.USE_PGVECTOR === "true";
}

export function getVectorStore(): VectorStore {
  if (cached) return cached;
  cached = isPgvectorEnabled() ? new PostgresVectorStore() : new DemoVectorStore();
  return cached;
}

export type { RetrievedChunk, RetrieveOptions, VectorStore } from "./types";

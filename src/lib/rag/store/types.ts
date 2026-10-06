export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  score: number;
}

export interface RetrieveOptions {
  limit: number;
  threshold: number;
}

/**
 * Storage backend for semantic retrieval.
 *
 * - `DemoVectorStore` computes cosine similarity in-process (SQLite/demo).
 * - `PostgresVectorStore` runs a real pgvector `<=>` query (production).
 *
 * Both return the same shape, so the RAG layer is backend-agnostic.
 */
export interface VectorStore {
  readonly kind: "demo" | "pgvector";
  retrieve(
    orgId: string,
    queryEmbedding: number[],
    opts: RetrieveOptions,
  ): Promise<RetrievedChunk[]>;
}

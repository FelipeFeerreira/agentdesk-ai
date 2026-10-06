-- AgentDesk AI — production RAG upgrade (PostgreSQL + pgvector)
--
-- The application runs out-of-the-box on SQLite with in-process cosine
-- similarity (see src/lib/rag/vectorstore.ts). At production scale, switch to
-- PostgreSQL + pgvector and apply this migration to move retrieval onto an
-- indexed vector column. The retrieval code already sits behind a provider
-- abstraction, so this is a drop-in storage change, not a code rewrite.
--
-- Prerequisites:
--   1. docker compose up -d db        (pgvector/pgvector:pg16 image)
--   2. DATABASE_URL=postgresql://agentdesk:agentdesk@localhost:5432/agentdesk
--   3. npx prisma db push            (creates the base schema from schema.prisma)

-- 1. Add a native vector column alongside the JSON embedding used in demo mode.
ALTER TABLE "KnowledgeChunk"
  ADD COLUMN IF NOT EXISTS "embeddingVector" vector(384);

-- 2. Backfill the vector column from the JSON embedding.
UPDATE "KnowledgeChunk"
SET "embeddingVector" = "embedding"::json::text::vector
WHERE "embeddingVector" IS NULL;

-- 3. Index for fast approximate nearest-neighbour retrieval.
CREATE INDEX IF NOT EXISTS "KnowledgeChunk_embedding_idx"
  ON "KnowledgeChunk"
  USING ivfflat ("embeddingVector" vector_cosine_ops)
  WITH (lists = 100);

-- 4. Example retrieval query (cosine similarity, top-k):
-- SELECT "documentId", 1 - ("embeddingVector" <=> $1) AS score
-- FROM "KnowledgeChunk"
-- ORDER BY "embeddingVector" <=> $1
-- LIMIT 4;

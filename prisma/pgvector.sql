-- AgentDesk AI — production RAG (PostgreSQL + pgvector)
--
-- Demo mode runs on SQLite with in-process cosine similarity and deterministic
-- embeddings (see src/lib/rag/store/demo.ts). Production uses PostgreSQL +
-- pgvector with OpenAI embeddings via src/lib/rag/store/postgres.ts.
--
-- Prerequisites:
--   1. docker compose up -d db            (pgvector/pgvector:pg16 image)
--   2. CREATE EXTENSION IF NOT EXISTS vector;
--   3. npx prisma db push                 (base schema from schema.prisma)
--   4. psql ... -f prisma/pgvector.sql    (this file)
--   5. .env: USE_PGVECTOR=true, EMBEDDING_PROVIDER=openai, OPENAI_API_KEY=..., DATABASE_URL=postgres...
--
-- IMPORTANT — dimension: OpenAI text-embedding-3-small = 1536. The vector
-- column MUST match the active embedding provider. The demo embedder (384) is
-- for SQLite only; do not mix it with a 1536 pgvector column.

CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Native vector column alongside the JSON embedding used in demo mode.
ALTER TABLE "KnowledgeChunk"
  ADD COLUMN IF NOT EXISTS "embeddingVector" vector(1536);

-- 2. Index for fast approximate nearest-neighbour cosine retrieval.
--    HNSW gives better recall/latency than ivfflat without a training step.
CREATE INDEX IF NOT EXISTS "KnowledgeChunk_embeddingVector_hnsw"
  ON "KnowledgeChunk"
  USING hnsw ("embeddingVector" vector_cosine_ops);

-- 3. Backfill any chunks that already have a JSON embedding.
--    (Ingestion writes embeddingVector directly when USE_PGVECTOR=true; this
--     covers rows created while pgvector was disabled.)
UPDATE "KnowledgeChunk"
SET "embeddingVector" = ("embedding"::json)::text::vector
WHERE "embeddingVector" IS NULL
  AND "embedding" IS NOT NULL
  AND "embedding" <> '[]'
  AND json_array_length("embedding"::json) = 1536;

-- 4. Retrieval query used by PostgresVectorStore (parameterised, score = 1 - distance):
-- SELECT c.id, c."documentId", d.title, c.content,
--        (1 - (c."embeddingVector" <=> $1::vector)) AS score
-- FROM "KnowledgeChunk" c
-- JOIN "KnowledgeDocument" d ON d.id = c."documentId"
-- WHERE c."orgId" = $2 AND d.status = 'READY' AND c."embeddingVector" IS NOT NULL
--   AND (1 - (c."embeddingVector" <=> $1::vector)) >= $3
-- ORDER BY c."embeddingVector" <=> $1::vector
-- LIMIT $4;

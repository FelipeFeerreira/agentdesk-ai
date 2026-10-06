# RAG — Retrieval-Augmented Generation

## Pipeline

```
Document (PDF / TXT / Markdown / manual)
  → text extraction
  → normalization + content hash (deduplication)
  → chunking (paragraph/sentence, ~1200 chars, 200 overlap)
  → embeddings
  → vector store
  → semantic retrieval (top-k above similarity threshold)
  → context
  → LLM
  → cited answer
```

## Components

| File | Responsibility |
| --- | --- |
| `lib/rag/ingest.ts` | `ingestDocument()` (hash dedup) + `persistChunks()` — chunks + embeddings + vector column |
| `lib/rag/chunker.ts` | `chunkText()` — paragraph/sentence split with overlap + hard max |
| `lib/rag/embedder.ts` | `DemoEmbedder` (deterministic, 384) / `OpenAIEmbedder` (`text-embedding-3-small`, 1536) |
| `lib/rag/store/` | `VectorStore` abstraction: `DemoVectorStore` + `PostgresVectorStore` |
| `lib/rag/vectorstore.ts` | `retrieveChunks()` — backend-agnostic public API |

## Vector store abstraction

`getVectorStore()` returns the backend based on configuration:

| Backend | When | Similarity | Storage |
| --- | --- | --- | --- |
| `DemoVectorStore` | default (`USE_PGVECTOR` not `true`) | in-process cosine | JSON `embedding` column (SQLite) |
| `PostgresVectorStore` | `USE_PGVECTOR=true` | pgvector `<=>` (HNSW index) | native `embeddingVector vector(1536)` |

Both return the same `RetrievedChunk[]`, so the rest of the system is
backend-agnostic.

## Dimensions — important

| Provider | Dimension | Notes |
| --- | --- | --- |
| `DemoEmbedder` | **384** | deterministic hash embedding; SQLite demo only |
| OpenAI `text-embedding-3-small` | **1536** | production |

The pgvector column is `vector(1536)`. **Do not mix** the 384-dim demo embedder
with a 1536-dim pgvector column — production must use `EMBEDDING_PROVIDER=openai`.

## Deduplication

`ingestDocument()` computes a sha256 of the normalized text and stores it as
`KnowledgeDocument.contentHash` (unique per org). Re-uploading identical content
is idempotent — it returns the existing document instead of creating duplicates.
Reindexing (`POST /api/knowledge/documents/[id]/reindex`) deletes and recreates
chunks, so stale/duplicate chunks never accumulate; document deletion removes its
chunks (and therefore its vectors).

## Production setup (PostgreSQL + pgvector)

```bash
docker compose up -d db                 # pgvector/pgvector:pg16
# .env:
#   DATABASE_URL=postgresql://agentdesk:agentdesk@localhost:5432/agentdesk
#   EMBEDDING_PROVIDER=openai
#   OPENAI_API_KEY=sk-...
#   USE_PGVECTOR=true

npm run prisma:pg:schema                # regenerate schema.postgresql.prisma (parity)
npx prisma db push                      # base schema
psql "$DATABASE_URL" -f prisma/pgvector.sql   # vector column + HNSW index
npm run db:seed
```

The demo (SQLite) path is unchanged and never requires any of this.

## Honest retrieval

The agent only cites sources whose score exceeds the configured
`similarityThreshold`. If retrieval confidence is poor, the agent says it could
not find a confident answer instead of inventing one.

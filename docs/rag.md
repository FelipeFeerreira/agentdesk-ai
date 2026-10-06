# RAG — Retrieval-Augmented Generation

## Pipeline

```
Document (PDF / TXT / Markdown / manual)
  → text extraction
  → normalization
  → chunking (paragraph/sentence, ~1200 chars, 200 overlap)
  → embeddings
  → vector store (SQLite JSON in demo, pgvector in production)
  → semantic retrieval (top-k above similarity threshold)
  → context
  → LLM
  → cited answer
```

## Components

| File | Responsibility |
| --- | --- |
| `lib/rag/ingest.ts` | `ingestDocument()` — creates `KnowledgeDocument` + chunks + embeddings |
| `lib/rag/chunker.ts` | `chunkText()` — paragraph/sentence split with overlap + hard max |
| `lib/rag/embedder.ts` | `demoEmbed` (deterministic) / `OpenAIEmbedder` (`text-embedding-3-small`) |
| `lib/rag/vectorstore.ts` | `retrieveChunks()` — semantic retrieval with score + citations |

## Demo vs production embeddings

The demo embedder is a deterministic, hash-based bag-of-words embedding with
stopword removal and light stemming. It requires no network and produces
meaningful cosine similarity for overlapping vocabulary — sufficient to
demonstrate the full pipeline offline.

Production uses OpenAI `text-embedding-3-small` (set `EMBEDDING_PROVIDER=openai`
and `OPENAI_API_KEY`).

## Demo vs production retrieval

| | Demo | Production |
| --- | --- | --- |
| Store | SQLite, `embedding` JSON column | PostgreSQL, native `vector` column |
| Similarity | in-process cosine | pgvector `<=>` (IVFFlat index) |
| Scale | fine for a handful of documents | indexed ANN search |

To switch to pgvector: `docker compose up -d db`, point `DATABASE_URL` at it,
`npx prisma db push`, then apply `prisma/pgvector.sql`. The retrieval call site
(`vectorstore.ts`) is the single place to swap the backend — the rest of the
system is unaffected.

## Honest retrieval

The agent only cites sources that exceed the configured `similarityThreshold`.
If retrieval confidence is poor, the agent says it could not find a confident
answer instead of hallucinating one.

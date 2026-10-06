import { prisma } from "@/lib/db";
import type { RetrievedChunk, RetrieveOptions, VectorStore } from "./types";

interface Row {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  score: number;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Real pgvector retrieval over the native `embeddingVector` column.
 *
 * Requires: PostgreSQL with the `pgvector` extension, the `embeddingVector`
 * column + index created by `prisma/pgvector.sql`, `USE_PGVECTOR=true`, and an
 * embedding provider whose dimension matches the column (1536 for OpenAI
 * `text-embedding-3-small`).
 *
 * The column is not part of the Prisma model (it is added by raw migration), so
 * retrieval uses a parameterised raw query. Score = 1 - cosine distance.
 */
export class PostgresVectorStore implements VectorStore {
  readonly kind = "pgvector" as const;

  async retrieve(
    orgId: string,
    queryEmbedding: number[],
    opts: RetrieveOptions,
  ): Promise<RetrievedChunk[]> {
    const vector = `[${queryEmbedding.join(",")}]`;

    const rows = await prisma.$queryRaw<Row[]>`
      SELECT
        c.id                          AS "chunkId",
        c."documentId"                AS "documentId",
        d.title                       AS "documentTitle",
        c.content                     AS "content",
        (1 - (c."embeddingVector" <=> ${vector}::vector))::float8 AS "score"
      FROM "KnowledgeChunk" c
      JOIN "KnowledgeDocument" d ON d.id = c."documentId"
      WHERE c."orgId" = ${orgId}
        AND d.status = 'READY'
        AND c."embeddingVector" IS NOT NULL
        AND (1 - (c."embeddingVector" <=> ${vector}::vector)) >= ${opts.threshold}
      ORDER BY c."embeddingVector" <=> ${vector}::vector ASC
      LIMIT ${opts.limit}
    `;

    return rows.map((r) => ({
      chunkId: r.chunkId,
      documentId: r.documentId,
      documentTitle: r.documentTitle,
      content: r.content,
      score: round(Number(r.score)),
    }));
  }
}

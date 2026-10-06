// Generates prisma/schema.postgresql.prisma from prisma/schema.prisma by
// switching the datasource provider. This guarantees the demo (SQLite) and
// production (PostgreSQL) schemas can never drift.
//
//   node scripts/generate-postgres-schema.mjs
//   npm run prisma:pg:schema
import { readFileSync, writeFileSync } from "node:fs";

const SOURCE = "prisma/schema.prisma";
const TARGET = "prisma/schema.postgresql.prisma";

const source = readFileSync(SOURCE, "utf8");

if (!source.includes('provider = "sqlite"')) {
  throw new Error(`Expected provider = "sqlite" in ${SOURCE}`);
}

const header = [
  "// GENERATED FILE — do not edit by hand.",
  "// Source of truth: prisma/schema.prisma (SQLite demo).",
  "// Regenerate with: npm run prisma:pg:schema",
  "// Provider is switched to PostgreSQL for production (see prisma/pgvector.sql).",
  "",
].join("\n");

const output = header + source.replace('provider = "sqlite"', 'provider = "postgresql"');

writeFileSync(TARGET, output);
console.log(`Generated ${TARGET}`);

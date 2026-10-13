import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import "@testing-library/jest-dom/vitest";

// Point Prisma at the exclusive test database created by global setup.
// Runs before each test file is imported, so the Prisma client instantiates
// with the correct URL. Falls back to the value already in the environment.
if (!process.env.DATABASE_URL) {
  const pointer = resolve("prisma/.test-dbs/current.json");
  if (existsSync(pointer)) {
    try {
      const { url } = JSON.parse(readFileSync(pointer, "utf8")) as { url: string };
      if (url) process.env.DATABASE_URL = url;
    } catch {
      // ignore — Prisma will surface a clear error if the URL is missing
    }
  }
}

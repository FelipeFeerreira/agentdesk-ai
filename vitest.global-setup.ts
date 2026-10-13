import { rmSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * Prepares an EXCLUSIVE SQLite database for this test run.
 *
 *  - unique file name per invocation → two concurrent runs never delete or
 *    share each other's database;
 *  - never touches the development database;
 *  - the resolved URL is propagated to workers both via `process.env` and a
 *    per-run pointer file (belt and braces for pool isolation);
 *  - uses the local Prisma binary (no npx/network).
 */
const TEST_DIR = resolve("prisma/.test-dbs");
const POINTER = resolve(TEST_DIR, "current.json");

export default function globalSetup() {
  mkdirSync(TEST_DIR, { recursive: true });

  const runId = `${process.pid}-${Date.now()}`;
  const fileName = `test-${runId}.db`;
  const url = `file:./.test-dbs/${fileName}`; // relative to the Prisma schema dir
  const absPath = resolve(TEST_DIR, fileName);

  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${absPath}${suffix}`;
    if (existsSync(file)) rmSync(file, { force: true });
  }

  const prismaBin = resolve("node_modules/prisma/build/index.js");
  if (!existsSync(prismaBin)) {
    throw new Error(`Prisma CLI not found at ${prismaBin}. Run: npm install`);
  }

  try {
    execFileSync(
      process.execPath,
      [prismaBin, "db", "push", "--skip-generate", "--accept-data-loss"],
      { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit" },
    );
  } catch (e) {
    throw new Error(
      `Failed to prepare the test database (${url}). ` +
        `Ensure @prisma/client is generated (npx prisma generate) and ${TEST_DIR} is writable.\n` +
        `${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // Propagate to workers (env is inherited by forked workers; the pointer file
  // is the fallback read by vitest.setup.ts).
  process.env.DATABASE_URL = url;
  writeFileSync(POINTER, JSON.stringify({ url, file: absPath, at: new Date().toISOString() }));

  return () => {
    for (const suffix of ["", "-journal", "-wal", "-shm"]) {
      const file = `${absPath}${suffix}`;
      if (existsSync(file)) rmSync(file, { force: true });
    }
    if (existsSync(POINTER)) rmSync(POINTER, { force: true });
  };
}

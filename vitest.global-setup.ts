import { rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * Prepares an isolated SQLite database for the test run.
 *
 * Guarantees:
 *  - uses a dedicated file (prisma/test.db), never the development database;
 *  - deletes any previous test DB (+ journal/WAL) first, so a locked or
 *    half-written file can never cause a "Schema engine error";
 *  - invokes the local Prisma binary directly (no `npx` resolution/network).
 *
 * Because the same fixed path is reused, concurrent runs in the same working
 * directory are not supported — CI and local runs are serialised by design.
 */
export default function globalSetup() {
  const testDb = resolve("prisma/test.db");
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const file = `${testDb}${suffix}`;
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
      {
        env: { ...process.env, DATABASE_URL: "file:./test.db" },
        stdio: "inherit",
      },
    );
  } catch (e) {
    throw new Error(
      `Failed to prepare the test database at ${testDb}. ` +
        `Ensure the @prisma/client is generated (npx prisma generate) and the directory is writable.\n` +
        `${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

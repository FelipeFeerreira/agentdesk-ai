import { rmSync } from "node:fs";
import { execSync } from "node:child_process";

/**
 * Resets the dedicated test database (prisma/test.db) and applies the schema
 * before each test run, so DB-backed tests are fully isolated from dev data.
 */
export default function globalSetup() {
  rmSync("prisma/test.db", { force: true });
  rmSync("prisma/test.db-journal", { force: true });

  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "inherit",
  });
}

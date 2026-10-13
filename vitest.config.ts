import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    testTimeout: 20_000,
    // SQLite has a single writer; running test files in parallel against the
    // shared test DB causes "Socket timeout" lock contention. Serialize files.
    fileParallelism: false,
    setupFiles: ["./vitest.setup.ts"],
    globalSetup: ["./vitest.global-setup.ts"],
    env: {
      DATABASE_URL: "file:./test.db",
    },
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

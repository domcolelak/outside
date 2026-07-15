import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    environment: "node",
    pool: "forks",
    maxWorkers: 1,
    include: ["e2e/**/*.e2e.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

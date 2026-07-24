import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    environment: "node",
    pool: "threads",
    maxWorkers: 1,
    include: ["lib/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts", "proxy.ts"],
      exclude: ["lib/**/*.test.ts"],
      reporter: ["text", "json-summary"],
      thresholds: {
        statements: 50,
        branches: 45,
        functions: 50,
        lines: 58,
      },
    },
  },
});

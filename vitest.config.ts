import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: [],
    // Soften parallel DB setup races across suites (roles/plans upserts)
    poolOptions: {
      threads: { maxThreads: 4, minThreads: 1 },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

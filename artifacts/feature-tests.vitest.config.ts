import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Explicitly authorized feature regressions only; default runners stay disabled.
export default defineConfig({
  resolve: { alias: { "@": resolve(process.cwd(), "src") } },
  test: {
    environment: "node",
    include: [
      "src/engine/commander-artifact-expansion.test.ts",
      "src/engine/underdog-unit-experience.test.ts",
    ],
    testTimeout: 20000,
    restoreMocks: true,
  },
});

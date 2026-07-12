import { defineConfig } from "vitest/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src")
    }
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    restoreMocks: true,
    // The default 5s per-test timeout is too tight for the CPU-heavy suites
    // (the single-player multi-round soak, map-render tests) that run in
    // parallel with the lightweight `src/server/*` store tests: under CPU
    // contention on constrained CI/containers those trivial tests get starved
    // and spuriously time out (a bare createRoom "taking" 5s). Raising the cap
    // absorbs the scheduling jitter without masking real hangs — a genuinely
    // stuck test still fails at 20s, and the runner's own step caps bound the AI.
    testTimeout: 20_000,
    hookTimeout: 20_000
  }
});

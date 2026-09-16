import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
export default defineConfig({
  resolve: { alias: { "@": resolve(process.cwd(), "src") } },
  test: { environment: "node", include: ["src/engine/computer/card-policy.test.ts", "src/engine/computer/choice-policy.test.ts"],
    testTimeout: 20000, maxWorkers: 1 },
});

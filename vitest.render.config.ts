import { defineConfig } from "vitest/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Separate config for the map-picture generator (scripts/render-symmetric-maps.test.ts).
 * Kept out of the default `vitest run` (whose include is `src/**`) so the
 * artifact renderer never runs in CI; regenerate the PNGs with
 * `npm run render:maps`.
 */
export default defineConfig({
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  test: {
    environment: "node",
    globals: true,
    include: ["scripts/**/*.test.ts"],
  },
});

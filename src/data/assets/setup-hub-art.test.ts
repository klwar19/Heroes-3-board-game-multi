/**
 * The Setup Hub's four painted box panels (Game mode · Heroes & Draft · Map ·
 * Advanced settings) — SETUP_HUB_ART.
 *
 * These assert the PANELS, not just their filenames: every box resolves to a
 * real 3:2 landscape webp big enough to render crisply at the box size, and —
 * the design contract the CSS text plate depends on — the LOWER band of each
 * panel is genuinely dark (mean luma < 40, and darker than the panel's middle
 * band), so the title/summary always reads over the art without a solid text
 * background. A regenerated panel that forgets the dark lower third fails
 * here. Regenerate via scripts/codex-gen-art.ps1 (prompts in the CLAUDE.md
 * Setup Hub section), then normalize to 1024-wide q82 webp.
 */
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { SETUP_HUB_ART } from "./homm-assets";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const BOXES = ["mode", "heroes", "map", "advanced"] as const;

function panelFile(box: (typeof BOXES)[number]): string {
  return path.join(REPO_ROOT, "public", SETUP_HUB_ART[box].replace(/^\//, ""));
}

/** Mean greyscale luma of a horizontal band (fractions of the height). */
async function bandLuma(file: string, from: number, to: number): Promise<number> {
  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  let count = 0;
  for (let y = Math.floor(from * info.height); y < Math.floor(to * info.height); y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      sum += data[y * info.width + x];
      count += 1;
    }
  }
  return sum / count;
}

describe("Setup Hub panel art (SETUP_HUB_ART)", () => {
  it("every box resolves to a real landscape webp on disk at a useful size", async () => {
    for (const box of BOXES) {
      const file = panelFile(box);
      expect(existsSync(file), `${box}: ${SETUP_HUB_ART[box]} missing on disk`).toBe(true);
      // Not a stub/truncated file, not an uncompressed monster.
      const bytes = statSync(file).size;
      expect(bytes, `${box}: suspiciously small`).toBeGreaterThan(20_000);
      expect(bytes, `${box}: recompress before committing`).toBeLessThan(400_000);
      const meta = await sharp(file).metadata();
      expect(meta.format, box).toBe("webp");
      expect(meta.width ?? 0, `${box}: too small to render crisply`).toBeGreaterThanOrEqual(900);
      // 3:2 landscape — the CSS box uses aspect-ratio: 3/2 so the baked-in
      // frame is never cropped; a portrait or square regen would be.
      const ratio = (meta.width ?? 0) / (meta.height ?? 1);
      expect(ratio, `${box}: not ~3:2 landscape`).toBeGreaterThan(1.4);
      expect(ratio, `${box}: not ~3:2 landscape`).toBeLessThan(1.6);
    }
  });

  it("keeps the lower band dark — the text plate's readability contract", async () => {
    for (const box of BOXES) {
      const file = panelFile(box);
      const bottom = await bandLuma(file, 0.78, 0.97);
      const middle = await bandLuma(file, 0.33, 0.66);
      // Shipped panels measure 11–15; anything under 40 still reads fine
      // under the CSS shade, while a panel with a bright lower third fails.
      expect(bottom, `${box}: lower band too bright for the title plate`).toBeLessThan(40);
      expect(bottom, `${box}: lower band should be the panel's darkest zone`).toBeLessThan(middle);
    }
  });
});

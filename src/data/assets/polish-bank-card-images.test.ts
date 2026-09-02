import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  POLISH_CREATURE_BANK_CARD_NAMES,
  POLISH_CREATURE_BANK_UNIT_SIDES
} from "@/data/map/creature-banks";

function publicAsset(path: string): string {
  return fileURLToPath(new URL(`../../../public${path}`, import.meta.url));
}

describe("Polish Banks guardian and reward scans", () => {
  it("ships every supplied card as a distinct compressed WebP", () => {
    const entries = Object.entries(POLISH_CREATURE_BANK_UNIT_SIDES);
    expect(entries).toHaveLength(31); // 11 guardian cards + 5 reward families × 4 sizes
    expect(Object.keys(POLISH_CREATURE_BANK_CARD_NAMES)).toHaveLength(31);
    const paths = entries.map(([, side]) => side.cardImage!);
    expect(new Set(paths).size).toBe(31);
    for (const [key, side] of entries) {
      expect(POLISH_CREATURE_BANK_CARD_NAMES[key], `${key} needs its printed display name`).toBeTruthy();
      expect(side.cardImage).toMatch(/^\/assets\/polish-banks\/(guardian|reward)-.+\.webp$/);
      const file = publicAsset(side.cardImage!);
      expect(existsSync(file), `${side.cardImage} must exist`).toBe(true);
      const bytes = statSync(file).size;
      expect(bytes, `${side.cardImage} must not be a placeholder`).toBeGreaterThan(20_000);
      expect(bytes, `${side.cardImage} must remain compressed and web-sized`).toBeLessThan(50_000);
    }
    const totalBytes = paths.reduce((sum, assetPath) => sum + statSync(publicAsset(assetPath)).size, 0);
    expect(totalBytes, "all 31 readable Polish bank cards must stay lightweight together").toBeLessThan(1_100_000);
  });
});

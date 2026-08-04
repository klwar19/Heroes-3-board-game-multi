import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";

function onDisk(assetPath: string): string {
  return fileURLToPath(new URL(`../../../public${assetPath}`, import.meta.url));
}

describe("statistic card faces", () => {
  it("every statistic card's face image exists on disk", () => {
    let seen = 0;
    for (const card of Object.values(cardLibrary)) {
      if (card.kind !== "statistic") continue;
      seen += 1;
      const img = card.assets?.cardImage;
      expect(img, `${card.id} needs a cardImage`).toBeTruthy();
      const file = onDisk(img!);
      expect(existsSync(file), `${img} (${card.id}) must exist`).toBe(true);
      expect(statSync(file).size, `${img} must be real art`).toBeGreaterThan(10_000);
    }
    expect(seen).toBeGreaterThanOrEqual(8); // 4 base + 4 empowered
  });

  it("EVERY empowered statistic uses its own DISTINCT empowered face (not the base art)", () => {
    const img = (id: string) => cardLibrary[id]?.assets?.cardImage;
    // All four printed "Empowered" scans now ship (the wiki serves one per stat),
    // so no empowered statistic may fall back to its base face any more.
    for (const stat of ["attack", "defense", "power", "knowledge"]) {
      expect(img(`stat.${stat}.empowered`)).toBe(`/assets/statistics-${stat}-empowered.webp`);
      // The whole point: the empowered face differs from the base face.
      expect(img(`stat.${stat}.empowered`)).not.toBe(img(`stat.${stat}`));
      expect(img(`stat.${stat}`)).toBe(`/assets/statistics-${stat}.webp`);
    }
  });
});

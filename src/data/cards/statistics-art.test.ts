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

  it("Defense and Knowledge empowered cards use a DISTINCT empowered face (not the base art)", () => {
    const img = (id: string) => cardLibrary[id]?.assets?.cardImage;
    expect(img("stat.defense.empowered")).toBe("/assets/statistics-defense-empowered.webp");
    expect(img("stat.knowledge.empowered")).toBe("/assets/statistics-knowledge-empowered.webp");
    // The whole point of the fix: the empowered face differs from the base face.
    expect(img("stat.defense.empowered")).not.toBe(img("stat.defense"));
    expect(img("stat.knowledge.empowered")).not.toBe(img("stat.knowledge"));
  });

  it("Attack and Power empowered reuse the base face (documented: no separate scan in the source set)", () => {
    const img = (id: string) => cardLibrary[id]?.assets?.cardImage;
    expect(img("stat.attack.empowered")).toBe(img("stat.attack"));
    expect(img("stat.power.empowered")).toBe(img("stat.power"));
  });
});

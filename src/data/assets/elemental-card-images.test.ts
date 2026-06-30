import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { coreUnitDefinitions } from "@/data/factions/units";

const EXPECTED = {
  air: {
    tier: "bronze",
    few: [2, 0, 4, 8],
    pack: [3, 0, 4, 8],
    neutral: [2, 0, 3, 7],
    cost: 7,
    school: "Air"
  },
  earth: {
    tier: "golden",
    few: [2, 2, 2, 5],
    pack: [3, 2, 2, 5],
    neutral: [3, 2, 5, 4],
    cost: 16,
    school: "Earth"
  },
  fire: {
    tier: "silver",
    few: [2, 1, 4, 5],
    pack: [3, 1, 4, 5],
    neutral: [3, 1, 3, 6],
    cost: 13,
    school: "Fire"
  },
  water: {
    tier: "silver",
    few: [2, 0, 5, 6],
    pack: [3, 0, 5, 6],
    neutral: [2, 1, 4, 5],
    cost: 10,
    school: "Water"
  }
} as const;

function stats(side: { attack: number; defense: number; health: number; initiative: number }) {
  return [side.attack, side.defense, side.health, side.initiative];
}

function onDisk(assetPath: string): string {
  return fileURLToPath(new URL(`../../../public${assetPath}`, import.meta.url));
}

describe("summoned Elemental card faces", () => {
  it("matches every Few, Pack, and Neutral wiki column", () => {
    for (const [slug, expected] of Object.entries(EXPECTED)) {
      const unit = coreUnitDefinitions[`neutral.${slug}_elementals`];
      expect(stats(unit.few!)).toEqual(expected.few);
      expect(stats(unit.pack!)).toEqual(expected.pack);
      expect(stats(unit.neutral!)).toEqual(expected.neutral);
      expect(unit.few!.cost).toEqual({});
      expect(unit.pack!.cost).toEqual({});
      expect(unit.neutral!.cost).toEqual({ gold: expected.cost });

      const printedText = `Immune to Magic Arrow and ${expected.school} Magic spells. This unit deals elemental damage.`;
      for (const side of [unit.few!, unit.pack!, unit.neutral!]) {
        expect(side.abilityText).toContain(printedText);
        expect(side.abilities).toEqual([
          "elemental-damage",
          `${slug}-elemental-immunity`
        ]);
      }
    }
  });

  it("ships distinct Few/Pack/Neutral faces and one shared art panel per creature", () => {
    for (const [slug, expected] of Object.entries(EXPECTED)) {
      const unit = coreUnitDefinitions[`neutral.${slug}_elementals`];
      const faces = [unit.few!.cardImage, unit.pack!.cardImage, unit.neutral!.cardImage];
      expect(new Set(faces).size).toBe(3);
      expect(unit.few!.cardImage).toBe(`/assets/units-conflux-bronze-${slug}_elementals-few.webp`);
      expect(unit.pack!.cardImage).toBe(`/assets/units-conflux-bronze-${slug}_elementals-pack.webp`);
      expect(unit.neutral!.cardImage).toBe(
        `/assets/units-neutral-${expected.tier}-${slug}_elementals.webp`
      );

      for (const asset of [
        ...faces,
        `/assets/units-elemental-art-${slug}.webp`
      ]) {
        const file = onDisk(asset!);
        expect(existsSync(file), `${asset} must exist`).toBe(true);
        expect(statSync(file).size, `${asset} must contain real art`).toBeGreaterThan(100_000);
      }
    }
  });

  it("keeps the corrected stat layout and official legend glyphs reproducible", () => {
    const compositor = fileURLToPath(
      new URL("../../../scripts/build-elemental-cards.mjs", import.meta.url)
    );
    const source = readFileSync(compositor, "utf8");
    // Neutral numbers must stay on the lower baselines of their taller cells;
    // the old 286/441/596/750 sequence climbed into the icon above.
    expect(source).toContain('[282, 455, 625, 790]');
    expect(source).not.toContain('[286, 441, 596, 750]');
    for (const glyph of ["unit_ground", "unit_passive"] as const) {
      expect(
        existsSync(fileURLToPath(new URL(`../../../scripts/card-glyphs/${glyph}.svg`, import.meta.url))),
        `${glyph} legend glyph`
      ).toBe(true);
      expect(source).toContain(`glyphDataUri("${glyph}")`);
    }
  });
});

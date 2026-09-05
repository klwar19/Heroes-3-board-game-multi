import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { hasMediaFile, mediaFileInfo } from "@/lib/media-manifest";
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


// 2026-08 wiki refresh: all twelve faces below (4 summon Few + 4 summon Pack +
// 4 Neutral guards) are now the REAL printed scans, pulled by
// scripts/fetch-unit-art-refresh.py. The wiki names the two card sets apart —
// `units-summoned-bronze-<slug>-few|pack.webp` (printed "Air Elementals",
// CONFLUX 075/080, "# FEW"/"# PACK", no cost band) versus
// `units-neutral-<tier>-<slug singular>_elemental.webp` (printed "Air
// Elemental", STRETCH GOALS 076/197, gold cost). HONEST LIMIT: no test here
// reads the printed pixels, so what is pinned is the path mapping, the size
// floor, and that the three faces per creature are pairwise distinct FILES —
// a cross-assignment (summon scan written to the neutral name) would still have
// to be caught by eye. Re-running scripts/build-elemental-cards.mjs would
// overwrite these scans with the composited fall-backs; its reproducibility is
// still pinned here.
describe("summoned Elemental card faces", () => {
  it("matches every Few, Pack, and Neutral wiki column", () => {
    for (const [slug, expected] of Object.entries(EXPECTED)) {
      // Few/Pack are summon-only Conflux cards. The single-sided Neutral card
      // is a separate recruitable card and must never be merged into that
      // summon definition.
      const summon = coreUnitDefinitions[`conflux.${slug}_elementals`];
      const neutral = coreUnitDefinitions[`neutral.${slug}_elementals`];
      expect(stats(summon.few!)).toEqual(expected.few);
      expect(stats(summon.pack!)).toEqual(expected.pack);
      expect(stats(neutral.neutral!)).toEqual(expected.neutral);
      expect(summon.few!.cost).toEqual({});
      expect(summon.pack!.cost).toEqual({});
      expect(neutral.neutral!.cost).toEqual({ gold: expected.cost });

      const printedText = `Immune to Magic Arrow and ${expected.school} Magic spells. This unit deals elemental damage.`;
      for (const side of [summon.few!, summon.pack!, neutral.neutral!]) {
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
      const summon = coreUnitDefinitions[`conflux.${slug}_elementals`];
      const neutral = coreUnitDefinitions[`neutral.${slug}_elementals`];
      const faces = [summon.few!.cardImage, summon.pack!.cardImage, neutral.neutral!.cardImage];
      expect(new Set(faces).size).toBe(3);
      expect(summon.few!.cardImage).toBe(`/assets/units-conflux-bronze-${slug}_elementals-few.webp`);
      expect(summon.pack!.cardImage).toBe(`/assets/units-conflux-bronze-${slug}_elementals-pack.webp`);
      expect(neutral.neutral!.cardImage).toBe(
        `/assets/units-neutral-${expected.tier}-${slug}_elementals.webp`
      );

      for (const asset of [
        ...faces,
        `/assets/units-elemental-art-${slug}.webp`
      ]) {
        expect(hasMediaFile(asset!), `${asset} must be published — run npm run media:publish`).toBe(true);
        expect(mediaFileInfo(asset!)!.bytes, `${asset} must contain real art`).toBeGreaterThan(100_000);
      }

      // The three faces must be three DIFFERENT files, not one scan copied under
      // three names (the cheapest form of the summon/neutral mix-up). The
      // manifest's md5 IS the byte identity, so this needs no local media.
      const digests = faces.map((asset) => mediaFileInfo(asset!)!.md5);
      expect(new Set(digests).size, `${slug} faces must be distinct images`).toBe(3);
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

  it("ships the REAL printed Air Elemental Few/Pack cards (not a composited placeholder)", () => {
    // The committed source scans (github.com/Heegu-sama/Homm3BG, assets/cards).
    for (const variant of ["few", "pack"] as const) {
      const src = fileURLToPath(
        new URL(`../../../scripts/elemental-real-cards/air_elementals-${variant}.webp`, import.meta.url)
      );
      expect(existsSync(src), `real Air ${variant} source scan`).toBe(true);
      expect(statSync(src).size, `real Air ${variant} scan must be real art`).toBeGreaterThan(100_000);
    }
    // The compositor must build Air Few/Pack FROM the real scan — a test fails if
    // someone reverts Air to the composited placeholder.
    const compositor = fileURLToPath(new URL("../../../scripts/build-elemental-cards.mjs", import.meta.url));
    const source = readFileSync(compositor, "utf8");
    expect(source).toContain("realCards");
    expect(source).toContain("air_elementals-few.webp");
    expect(source).toContain("air_elementals-pack.webp");
    expect(source).toContain("buildRealCard");
  });
});

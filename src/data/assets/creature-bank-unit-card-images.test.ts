import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { CREATURE_BANK_UNIT_SIDES } from "@/data/map/creature-banks";

const EXPECTED = {
  "neutral.familiars": ["units-inferno-bronze-familiars-few.webp", "units-creature-bank-familiars.webp"],
  "neutral.skeletons": ["units-necropolis-bronze-skeletons-few.webp", "units-creature-bank-skeletons.webp"],
  "neutral.zombies": ["units-necropolis-bronze-zombies-few.webp", "units-creature-bank-zombies.webp"],
  "neutral.wraiths": ["units-necropolis-bronze-wraiths-few.webp", "units-creature-bank-wraiths.webp"],
  "neutral.vampires": ["units-necropolis-silver-vampires-few.webp", "units-creature-bank-vampires.webp"],
  "neutral.dwarves": ["units-rampart-bronze-dwarves-few.webp", "units-creature-bank-dwarves.webp"],
  "neutral.medusas": ["units-dungeon-silver-medusas-few.webp", "units-creature-bank-medusas.webp"],
  "neutral.dragon_flies": ["units-fortress-bronze-dragon_flies-few.webp", "units-creature-bank-dragon_flies.webp"],
  "neutral.water_elementals": ["units-conflux-bronze-water_elementals-few.webp", "units-creature-bank-water_elementals.webp"],
  "neutral.gold_golems": ["units-neutral-golden-gold_golems.webp", "units-creature-bank-gold_golems.webp"],
  "neutral.diamond_golems": ["units-neutral-golden-diamond_golems.webp", "units-creature-bank-diamond_golems.webp"],
  "neutral.griffins": ["units-castle-bronze-griffins-few.webp", "units-creature-bank-griffins.webp"],
  "neutral.nagas": ["units-tower-golden-nagas-few.webp", "units-creature-bank-nagas.webp"],
  "neutral.cyclopes": ["units-stronghold-golden-cyclopes-few.webp", "units-creature-bank-cyclopes.webp"],
  "neutral.black_dragons": ["units-dungeon-golden-black_dragons-few.webp", "units-creature-bank-black_dragons.webp"],
  "neutral.gold_dragons": ["units-rampart-golden-gold_dragons-few.webp", "units-creature-bank-gold_dragons.webp"],
  "neutral.faerie_dragons": ["units-neutral-azure-faerie_dragons.webp", "units-creature-bank-faerie_dragons.webp"],
  "neutral.crystal_dragons": ["units-neutral-azure-crystal_dragons.webp", "units-creature-bank-crystal_dragons.webp"]
} as const;

function asset(name: string): string {
  return fileURLToPath(new URL(`../../../public/assets/${name}`, import.meta.url));
}

describe("Creature Bank unit card faces", () => {
  it("gives all 18 unique bank units a dedicated no-cost face", () => {
    expect(Object.keys(CREATURE_BANK_UNIT_SIDES).sort()).toEqual(Object.keys(EXPECTED).sort());
    const images = Object.entries(EXPECTED).map(([unitDefId, [, output]]) => {
      const side = CREATURE_BANK_UNIT_SIDES[unitDefId];
      expect(side.cost, unitDefId).toEqual({});
      expect(side.cardImage, unitDefId).toBe(`/assets/${output}`);
      expect(existsSync(asset(output)), output).toBe(true);
      const size = statSync(asset(output)).size;
      // Real card art (not a tiny placeholder), but compressed: lossy WebP keeps
      // every bank face in the same size band as the rest of /public/assets. A
      // regression back to lossless encoding would blow past this ceiling
      // (lossless rebuilds these at 600KB–1.1MB), so the upper bound is what
      // actually enforces the compression this audit applied.
      expect(size, output).toBeGreaterThan(100_000);
      expect(size, output).toBeLessThan(450_000);
      return side.cardImage;
    });
    expect(new Set(images).size).toBe(images.length);
  });

  it("keeps the real source illustration (lossy re-encode stays within a tiny delta)", async () => {
    // The faces are now lossy WebP (quality 94), so the illustration is no longer
    // byte-identical to the source scan — but it must still BE that scan, only
    // recompressed. We assert the mean absolute per-channel difference over the
    // illustration window is tiny. Observed deltas are < 1.5; a wrong or garbled
    // illustration would diverge by tens to hundreds, so this both permits the
    // compression and still fails if the art is swapped, blanked, or corrupted.
    for (const [unitDefId, [source, output]] of Object.entries(EXPECTED)) {
      const metadata = await sharp(asset(source)).metadata();
      const width = metadata.width!;
      const height = metadata.height!;
      const region = {
        left: Math.round((190 / 743) * width),
        top: Math.round((185 / 1040) * height),
        width: Math.round((480 / 743) * width),
        height: Math.round((520 / 1040) * height)
      };
      const [before, after] = await Promise.all([
        sharp(asset(source)).extract(region).raw().toBuffer(),
        sharp(asset(output)).extract(region).raw().toBuffer()
      ]);
      expect(after.length, `${unitDefId} buffer length`).toBe(before.length);
      let total = 0;
      for (let i = 0; i < before.length; i += 1) total += Math.abs(before[i] - after[i]);
      const meanAbsDiff = total / before.length;
      expect(meanAbsDiff, `${unitDefId} illustration delta`).toBeLessThan(4);
    }
  });
});

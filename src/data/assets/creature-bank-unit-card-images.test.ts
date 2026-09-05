import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { hasMediaFile, localMediaPath, mediaFileInfo } from "@/lib/media-manifest";
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

const assetUrlOf = (name: string) => `/assets/${name}`;

describe("Creature Bank unit card faces", () => {
  it("gives all 18 unique bank units a dedicated no-cost face", () => {
    expect(Object.keys(CREATURE_BANK_UNIT_SIDES).sort()).toEqual(Object.keys(EXPECTED).sort());
    const images = Object.entries(EXPECTED).map(([unitDefId, [, output]]) => {
      const side = CREATURE_BANK_UNIT_SIDES[unitDefId];
      expect(side.cost, unitDefId).toEqual({});
      expect(side.cardImage, unitDefId).toBe(`/assets/${output}`);
      expect(hasMediaFile(assetUrlOf(output)), `${output} — run npm run media:publish`).toBe(true);
      const size = mediaFileInfo(assetUrlOf(output))!.bytes;
      // Real card art (not a tiny placeholder), but compressed: lossy WebP keeps
      // every bank face in the same size band as the rest of /public/assets.
      // As of 2026-08-04 these are the GENUINE printed NAVAL BATTLES scans
      // imported by scripts/fetch-wiki-art-round3.py at q94/method=6, which land
      // at 184–212KB — comfortably inside the band the previous crop-and-overlay
      // composites occupied, so the bounds did not need to move. The floor still
      // rejects a deck-back/placeholder swap; the ceiling still rejects a
      // regression to lossless encoding (which rebuilds these at 600KB–1.1MB).
      expect(size, output).toBeGreaterThan(100_000);
      expect(size, output).toBeLessThan(450_000);
      return side.cardImage;
    });
    expect(new Set(images).size).toBe(images.length);
  });

  it("shows each creature's OWN illustration (nearest-match against all 18 sources)", async () => {
    // Each bank face must depict the SAME creature as its faction/neutral card.
    //
    // Why this is a nearest-match test and not an absolute threshold: until
    // 2026-08-04 these faces were composites built by cropping the faction scan,
    // so the illustration window was near-identical to it (delta < 1.5) and a
    // tight absolute bound worked. They are now the GENUINE printed NAVAL BATTLES
    // scans — photographs of physical cards, with gloss, perspective and a
    // slightly different crop — so the same-creature delta rose to 8.5–19.9.
    // A single absolute bound can no longer discriminate: the largest matching
    // delta (nagas, 19.9) EXCEEDS the smallest mismatching one (a Crypt
    // Skeletons face measured against Zombies' art, 18.1 — both are dark
    // Necropolis undead on the same palette). A threshold loose enough to pass
    // nagas would therefore pass a skeletons/zombies swap, which is exactly the
    // bug this test exists to catch.
    //
    // So instead of a magic number we assert the ARGMIN: of all 18 candidate
    // source illustrations, the closest to each bank face must be its own. That
    // is self-calibrating (no bound to retune when art is re-imported) and
    // strictly discriminating — swapping any two faces makes both rows fail.
    // Observed margin between the correct source and the runner-up is 7.7 at the
    // tightest (skeletons vs zombies) and ~22 typically.
    const region = (width: number, height: number) => ({
      left: Math.round((190 / 743) * width),
      top: Math.round((185 / 1040) * height),
      width: Math.round((480 / 743) * width),
      height: Math.round((520 / 1040) * height)
    });

    const entries = Object.entries(EXPECTED);
    // Both halves of every pair must be PUBLISHED (media-manifest.json) — this
    // half holds on a checkout with no media at all.
    for (const [unitDefId, [source, output]] of entries) {
      expect(hasMediaFile(assetUrlOf(source)), `${unitDefId} source ${source} — run npm run media:publish`).toBe(true);
      expect(hasMediaFile(assetUrlOf(output)), `${unitDefId} face ${output} — run npm run media:publish`).toBe(true);
    }

    // The pixel comparison below needs the real BYTES, so it runs only on a
    // checkout that pulled the media (npm run media:pull).
    const localFiles = new Map<string, string>();
    for (const [, [source, output]] of entries) {
      for (const name of [source, output]) {
        const file = localMediaPath(assetUrlOf(name));
        if (!file) return;
        localFiles.set(name, file);
      }
    }

    // Every image is normalised to the printed card size AND to 3 channels
    // (several faction faces carry an alpha channel, the imported scans do not)
    // so all 18 windows are directly comparable pixel-for-pixel.
    const illustrationOf = (name: string) =>
      sharp(localFiles.get(name)!).resize(743, 1040).removeAlpha().extract(region(743, 1040)).raw().toBuffer();
    const sources = await Promise.all(
      entries.map(async ([unitDefId, [source]]) => ({ unitDefId, pixels: await illustrationOf(source) }))
    );

    for (const [unitDefId, [, output]] of entries) {
      const face = await illustrationOf(output);
      const scored = sources
        .map(({ unitDefId: candidate, pixels }) => {
          expect(pixels.length, `${candidate} buffer length`).toBe(face.length);
          let total = 0;
          for (let i = 0; i < face.length; i += 1) total += Math.abs(face[i] - pixels[i]);
          return { candidate, delta: total / face.length };
        })
        .sort((a, b) => a.delta - b.delta);
      expect(scored[0].candidate, `${unitDefId} nearest illustration (got ${scored[0].candidate})`).toBe(unitDefId);
      // Blank/garbled art would collapse toward every source at once; require a
      // real gap between the right creature and the next-best one.
      expect(scored[1].delta - scored[0].delta, `${unitDefId} margin over runner-up`).toBeGreaterThan(3);
    }
  });
});

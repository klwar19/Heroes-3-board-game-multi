import { existsSync, readFileSync, statSync } from "node:fs";
import { hasMediaFile, localMediaPath, mediaExtensionOf, mediaFileInfo } from "@/lib/media-manifest";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { coreUnitDefinitions } from "@/data/factions/units";
import { DISPLAY_ONLY_ABILITIES } from "@/data/units/abilities";

// The 25 single-sided Neutral guards that once had blank wiki faces. Each one
// ships a dedicated `units-neutral-<tier>-<slug>.webp`. Mapping is asserted
// explicitly so a wrong tier/slug (e.g. a gold unit pointed at a bronze frame)
// fails here.
//
// 2026-08 wiki refresh: the fan wiki now publishes REAL printed scans for every
// one of these 25 guards, and scripts/fetch-unit-art-refresh.py replaced the
// files with them (verified card-by-card against the stats/costs below). The
// composited fall-backs from scripts/build-placeholder-neutral-cards.mjs are no
// longer what ships — so re-running THAT builder would clobber the real scans.
// Its reproducibility (slug table + legend glyph sources) is still pinned at the
// bottom of this file so the fall-back path cannot rot.
const EXPECTED = {
  "neutral.leprechaun": "/assets/units-neutral-bronze-leprechaun.webp",
  "neutral.satyrs": "/assets/units-neutral-silver-satyrs.webp",
  "neutral.steel_golems": "/assets/units-neutral-silver-steel_golems.webp",
  "neutral.fangarm": "/assets/units-neutral-silver-fangarm.webp",
  "neutral.oceanids": "/assets/units-neutral-bronze-oceanids.webp",
  "neutral.seamen": "/assets/units-neutral-bronze-seamen.webp",
  "neutral.sea_dogs": "/assets/units-neutral-bronze-sea_dogs.webp",
  "neutral.ayssids": "/assets/units-neutral-silver-ayssids.webp",
  "neutral.sorceresses": "/assets/units-neutral-silver-sorceresses.webp",
  "neutral.nix": "/assets/units-neutral-golden-nix.webp",
  "neutral.haspids": "/assets/units-neutral-golden-haspids.webp",
  "neutral.goblins": "/assets/units-neutral-bronze-goblins.webp",
  "neutral.wolf_raiders": "/assets/units-neutral-bronze-wolf_raiders.webp",
  "neutral.orcs": "/assets/units-neutral-bronze-orcs.webp",
  "neutral.ogres": "/assets/units-neutral-silver-ogres.webp",
  "neutral.thunderbirds": "/assets/units-neutral-silver-thunderbirds.webp",
  "neutral.cyclopes": "/assets/units-neutral-golden-cyclopes.webp",
  "neutral.behemoths": "/assets/units-neutral-golden-behemoths.webp",
  "neutral.sprites": "/assets/units-neutral-bronze-sprites.webp",
  "neutral.ice_elementals": "/assets/units-neutral-bronze-ice_elementals.webp",
  "neutral.storm_elementals": "/assets/units-neutral-bronze-storm_elementals.webp",
  "neutral.energy_elementals": "/assets/units-neutral-silver-energy_elementals.webp",
  "neutral.magma_elementals": "/assets/units-neutral-silver-magma_elementals.webp",
  "neutral.magic_elementals": "/assets/units-neutral-golden-magic_elementals.webp",
  "neutral.phoenixes": "/assets/units-neutral-azure-phoenixes.webp"
} as const;

const NEW_NEUTRAL_RULES = {
  "neutral.leprechaun": {
    tier: "bronze", type: "ground", stats: [2, 0, 3, 5], gold: 4,
    abilities: ["attack-roll-advantage"],
    abilityText: "[unit_attack] Roll 2 Attack dice and resolve the higher one."
  },
  "neutral.satyrs": {
    tier: "silver", type: "ground", stats: [3, 0, 5, 7], gold: 10,
    abilities: ["satyr-map-morale-roll"],
    abilityText: "[map_effect] Once per turn. Roll an Attack die. On a \"+1\", gain [morale_positive]."
  },
  "neutral.steel_golems": {
    tier: "silver", type: "ground", stats: [3, 2, 3, 5], gold: 12,
    abilities: ["reduce-spell-and-specialty-damage-2"],
    abilityText: "[unit_passive] Reduce [damage] taken by this unit from [spell] or Specialty by 2 — to a minimum of 0."
  },
  "neutral.fangarm": {
    tier: "silver", type: "flying", stats: [3, 1, 5, 8], gold: 11,
    abilities: ["fangarm-nondamage-immunity"],
    abilityText: "[unit_passive] Ignore all [spell] and Specialty effects other than [damage]."
  }
};

function repoFile(relPath: string): string {
  return fileURLToPath(new URL(`../../../${relPath}`, import.meta.url));
}

/**
 * Manifest-level "this is a real raster webp": the extension plus the decoded
 * dimensions `npm run media:publish` records for every image it could read.
 * A stray/empty file never carries width/height.
 */
function looksLikeRealWebp(assetPath: string): boolean {
  const info = mediaFileInfo(assetPath);
  return mediaExtensionOf(assetPath) === "webp" && (info?.width ?? 0) > 0 && (info?.height ?? 0) > 0;
}

/** RIFF container, bytes 8..12 spell "WEBP" — needs the real bytes. */
function isWebp(file: string): boolean {
  const head = readFileSync(file).subarray(0, 12);
  return head.subarray(0, 4).toString("ascii") === "RIFF" && head.subarray(8, 12).toString("ascii") === "WEBP";
}

describe("blank-wiki neutral card faces", () => {
  it("transcribes the four new cards' tiers, types, stats, costs, abilities, and symbolic rules text", () => {
    for (const [id, expected] of Object.entries(NEW_NEUTRAL_RULES)) {
      const def = coreUnitDefinitions[id];
      const side = def?.neutral;
      expect(def?.tier, id).toBe(expected.tier);
      expect(def?.type, id).toBe(expected.type);
      expect(side && [side.attack, side.defense, side.health, side.initiative], id).toEqual(expected.stats);
      expect(side?.cost.gold, id).toBe(expected.gold);
      expect(side?.abilities, id).toEqual(expected.abilities);
      expect(side?.abilityText, id).toBe(expected.abilityText);
    }
  });

  it("does NOT list Satyrs or Fangarm as display-only — their abilities are now engine-wired (CLAUDE.md §2)", () => {
    // Both units now have implemented ability tags; they must NOT appear in the
    // display-only registry (that would be a false stub declaration).
    expect("neutral.satyrs#neutral" in DISPLAY_ONLY_ABILITIES, "neutral.satyrs must NOT be display-only").toBe(false);
    expect("neutral.fangarm#neutral" in DISPLAY_ONLY_ABILITIES, "neutral.fangarm must NOT be display-only").toBe(false);
  });

  it("assigns each guard its dedicated Neutral-tier face, not a faction Few/Pack crop", () => {
    for (const [id, expectedPath] of Object.entries(EXPECTED)) {
      const def = coreUnitDefinitions[id];
      expect(def, id).toBeTruthy();
      expect(def.neutral?.cardImage, id).toBe(expectedPath);
      // Never a faction Few/Pack expansion crop — the old placeholder behaviour.
      expect(expectedPath, id).not.toMatch(/units-(cove|stronghold|conflux)-/);
    }
  });

  it("ships every generated card as a real, compressed WebP", () => {
    for (const [id, assetPath] of Object.entries(EXPECTED)) {
      expect(hasMediaFile(assetPath), `${id} -> ${assetPath} — run npm run media:publish`).toBe(true);
      expect(looksLikeRealWebp(assetPath), `${id} must be a valid WebP`).toBe(true);
      // The RIFF magic itself needs the real bytes (npm run media:pull).
      const file = localMediaPath(assetPath);
      if (file) {
        expect(isWebp(file), `${id} must be a valid WebP`).toBe(true);
      }
      const size = mediaFileInfo(assetPath)!.bytes;
      // Lower bound proves a rendered card (not a stray/empty file); upper bound
      // proves the compression pass actually ran — a LOSSLESS re-encode of these
      // frames lands at 600 KB-1.1 MB, so the ceiling is what catches that
      // regression. Band widened 220_000 -> 260_000 for the 2026-08 wiki refresh:
      // the real printed scans encode at q94 to ~186-220 KB (the composited
      // fall-backs they replaced were ~90-190 KB), which left no headroom.
      expect(size, `${id} must contain a rendered card`).toBeGreaterThan(40_000);
      expect(size, `${id} must stay compressed`).toBeLessThan(260_000);
    }
  });

  it("wears the dedicated neutral Evil Eyes scan, never the Dungeon Few face (wrong baked stats)", () => {
    // A real board scan, NOT composed by the placeholder builder — so it is
    // pinned here standalone instead of in EXPECTED. The old cardImage was the
    // Dungeon FEW face, whose printed A3/D0/I5 contradicted the neutral side.
    const expectedPath = "/assets/units-neutral-bronze-evil_eyes.webp";
    const side = coreUnitDefinitions["neutral.evil_eyes"]?.neutral;
    expect(side?.cardImage).toBe(expectedPath);
    expect(hasMediaFile(expectedPath), `${expectedPath} — run npm run media:publish`).toBe(true);
    expect(looksLikeRealWebp(expectedPath), "must be a valid WebP").toBe(true);
    expect(mediaFileInfo(expectedPath)!.bytes, "must contain a rendered card").toBeGreaterThan(40_000);
    // The RIFF magic itself needs the real bytes (npm run media:pull).
    const file = localMediaPath(expectedPath);
    if (file) {
      expect(isWebp(file), "must be a valid WebP").toBe(true);
    }
  });

  it("keeps the shared-art compositor and every legend glyph source reproducible", () => {
    const builder = readFileSync(repoFile("scripts/build-placeholder-neutral-cards.mjs"), "utf8");
    for (const id of Object.keys(EXPECTED)) {
      expect(builder, `${id} builder entry`).toContain(`slug: "${id.split(".")[1]}"`);
    }
    for (const glyph of [
      "attack",
      "damage",
      "defense",
      "health_points",
      "map_effect",
      "morale_positive",
      "spell",
      "unit_attack",
      "unit_flying",
      "unit_ground",
      "unit_other",
      "unit_passive",
      "unit_retaliation"
    ]) {
      expect(existsSync(repoFile(`scripts/card-glyphs/${glyph}.svg`)), glyph).toBe(true);
    }
    for (const source of ["leprechaun.png", "satyrs.png", "steel_golems.png", "fangarm.png"]) {
      const file = repoFile(`scripts/neutral-unit-art/${source}`);
      expect(existsSync(file), source).toBe(true);
      expect(statSync(file).size, source).toBeGreaterThan(1_000_000);
    }
    expect(builder).toContain("unitTypeMark(card)");
    expect(builder).toContain("const cleanFrame = await cleanNeutralFrame(card.tier)");
    expect(builder).not.toContain('<rect x="86"');
  });
});

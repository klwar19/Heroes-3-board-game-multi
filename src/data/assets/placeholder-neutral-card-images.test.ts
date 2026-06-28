import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { coreUnitDefinitions } from "@/data/factions/units";
import { DISPLAY_ONLY_NEUTRAL_ABILITIES } from "@/data/units/abilities";

// The 25 single-sided Neutral guards whose wiki faces are blank. Each one now
// ships a dedicated `units-neutral-<tier>-<slug>.webp` composed by
// scripts/build-placeholder-neutral-cards.mjs from the exact faction creature
// illustration inside the matching Neutral tier frame — NOT the faction Few/Pack
// art. Mapping is asserted explicitly so a wrong tier/slug (e.g. a gold unit
// pointed at a bronze frame) fails here.
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

function onDisk(assetPath: string): string {
  return fileURLToPath(new URL(`../../../public${assetPath}`, import.meta.url));
}

function repoFile(relPath: string): string {
  return fileURLToPath(new URL(`../../../${relPath}`, import.meta.url));
}

function isWebp(file: string): boolean {
  // RIFF container, bytes 8..12 spell "WEBP".
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
    expect("neutral.satyrs" in DISPLAY_ONLY_NEUTRAL_ABILITIES, "neutral.satyrs must NOT be display-only").toBe(false);
    expect("neutral.fangarm" in DISPLAY_ONLY_NEUTRAL_ABILITIES, "neutral.fangarm must NOT be display-only").toBe(false);
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
      const file = onDisk(assetPath);
      expect(existsSync(file), `${id} -> ${assetPath}`).toBe(true);
      expect(isWebp(file), `${id} must be a valid WebP`).toBe(true);
      const size = statSync(file).size;
      // Lower bound proves a rendered card (not a stray/empty file); upper bound
      // proves the compression pass actually ran (a quality-94 encode of these
      // frames lands ~160-310 KB).
      expect(size, `${id} must contain a rendered card`).toBeGreaterThan(40_000);
      expect(size, `${id} must stay compressed`).toBeLessThan(220_000);
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
  });
});

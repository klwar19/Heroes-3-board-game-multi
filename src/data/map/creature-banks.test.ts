import { describe, expect, it } from "vitest";
import {
  CREATURE_BANK_IDS,
  CREATURE_BANK_UNIT_SIDES,
  CREATURE_BANKS,
  STACK_TOKEN_STATS,
  STACK_TOKENS_BY_DIFFICULTY,
  stackTokenDelta,
  type CreatureBankId
} from "./creature-banks";
import { coreUnitDefinitions } from "@/data/factions/units";
import { DISPLAY_ONLY_BANK_ABILITIES, unitAbilities } from "@/data/units/abilities";

/**
 * Locks the Creature Bank data to rulebook pages 84-85 and the fan-wiki
 * "Creature Bank" stat columns. A typo in a stat, a wrong defender, or an
 * un-wired ability tag fails here.
 */
describe("Creature Bank definitions", () => {
  it("has the twelve banks split into six Far and six Near tiles", () => {
    expect(CREATURE_BANK_IDS).toHaveLength(12);
    const far = CREATURE_BANK_IDS.filter((id) => CREATURE_BANKS[id].tier === "far");
    const near = CREATURE_BANK_IDS.filter((id) => CREATURE_BANKS[id].tier === "near");
    expect(far.sort()).toEqual(
      ["crypt", "dragon_fly_hive", "dwarven_treasury", "imp_cache", "medusa_stores", "shipwreck"].sort()
    );
    expect(near.sort()).toEqual(
      ["cyclops_stockpile", "derelict_ship", "dragon_utopia", "griffin_conservatory", "naga_bank", "pyramid"].sort()
    );
  });

  it("fields exactly the rulebook defenders for each bank", () => {
    const expected: Record<CreatureBankId, string[]> = {
      imp_cache: ["neutral.familiars", "neutral.familiars", "neutral.familiars", "neutral.familiars"],
      crypt: ["neutral.skeletons", "neutral.zombies", "neutral.wraiths", "neutral.vampires"],
      dwarven_treasury: ["neutral.dwarves", "neutral.dwarves", "neutral.dwarves", "neutral.dwarves"],
      medusa_stores: ["neutral.medusas", "neutral.medusas", "neutral.medusas", "neutral.medusas"],
      dragon_fly_hive: [
        "neutral.dragon_flies",
        "neutral.dragon_flies",
        "neutral.dragon_flies",
        "neutral.dragon_flies"
      ],
      shipwreck: ["neutral.wraiths", "neutral.wraiths", "neutral.wraiths", "neutral.wraiths"],
      derelict_ship: [
        "neutral.water_elementals",
        "neutral.water_elementals",
        "neutral.water_elementals",
        "neutral.water_elementals"
      ],
      pyramid: ["neutral.gold_golems", "neutral.gold_golems", "neutral.diamond_golems", "neutral.diamond_golems"],
      griffin_conservatory: ["neutral.griffins", "neutral.griffins", "neutral.griffins", "neutral.griffins"],
      naga_bank: ["neutral.nagas", "neutral.nagas", "neutral.nagas", "neutral.nagas"],
      cyclops_stockpile: ["neutral.cyclopes", "neutral.cyclopes", "neutral.cyclopes", "neutral.cyclopes"],
      dragon_utopia: [
        "neutral.black_dragons",
        "neutral.gold_dragons",
        "neutral.faerie_dragons",
        "neutral.crystal_dragons"
      ]
    };
    for (const id of CREATURE_BANK_IDS) {
      expect(CREATURE_BANKS[id].units).toEqual(expected[id]);
    }
  });

  it("only fields units that exist and have a bank stat card", () => {
    for (const id of CREATURE_BANK_IDS) {
      for (const unitDefId of CREATURE_BANKS[id].units) {
        expect(coreUnitDefinitions[unitDefId], `${unitDefId} must be a real unit`).toBeTruthy();
        expect(CREATURE_BANK_UNIT_SIDES[unitDefId], `${unitDefId} must have a bank side`).toBeTruthy();
      }
    }
  });
});

describe("Creature Bank unit cards", () => {
  // Stats transcribed from the wiki "Creature Bank" columns (atk/def/hp/init/type).
  const expected: Record<string, [number, number, number, number, string]> = {
    "neutral.familiars": [1, 0, 2, 5, "ground"],
    "neutral.skeletons": [1, 0, 2, 4, "ground"],
    "neutral.zombies": [1, 0, 2, 3, "ground"],
    "neutral.wraiths": [2, 0, 3, 5, "flying"],
    "neutral.vampires": [2, 0, 3, 6, "flying"],
    "neutral.dwarves": [2, 1, 3, 3, "ground"],
    "neutral.medusas": [3, 0, 3, 6, "ranged"],
    "neutral.dragon_flies": [3, 0, 2, 8, "flying"],
    "neutral.water_elementals": [3, 0, 5, 6, "ground"],
    "neutral.gold_golems": [3, 1, 4, 4, "ground"],
    "neutral.diamond_golems": [3, 1, 5, 5, "ground"],
    "neutral.griffins": [3, 0, 4, 8, "flying"],
    "neutral.nagas": [4, 1, 5, 6, "ground"],
    "neutral.cyclopes": [5, 1, 5, 8, "ranged"],
    "neutral.black_dragons": [5, 2, 5, 9, "flying"],
    "neutral.gold_dragons": [5, 2, 6, 10, "flying"],
    "neutral.faerie_dragons": [4, 2, 6, 15, "flying"],
    "neutral.crystal_dragons": [6, 2, 6, 16, "ground"]
  };

  it("matches the wiki bank stats exactly", () => {
    for (const [unitDefId, [attack, defense, health, initiative, type]] of Object.entries(expected)) {
      const side = CREATURE_BANK_UNIT_SIDES[unitDefId];
      expect(side, unitDefId).toBeTruthy();
      expect([side.attack, side.defense, side.health, side.initiative, side.type], unitDefId).toEqual([
        attack,
        defense,
        health,
        initiative,
        type
      ]);
      // Bank cards have no recruitment cost (they are not recruitable).
      expect(Object.keys(side.cost)).toHaveLength(0);
    }
  });

  it("only claims engine-wired ability tags (CLAUDE.md rule 2)", () => {
    for (const [unitDefId, side] of Object.entries(CREATURE_BANK_UNIT_SIDES)) {
      for (const tag of side.abilities) {
        const ability = unitAbilities[tag];
        expect(ability, `${unitDefId}: ability "${tag}" must be defined`).toBeTruthy();
        expect(ability.implementationStatus, `${unitDefId}: ability "${tag}" must be implemented`).toBe("implemented");
      }
    }
  });

  it("declares every display-only ability and never leaves decorative text undeclared (CLAUDE.md rule 2)", () => {
    for (const [unitDefId, side] of Object.entries(CREATURE_BANK_UNIT_SIDES)) {
      const hasText = Boolean(side.abilityText);
      const hasWired = side.abilities.length > 0;
      const declaredDisplayOnly = unitDefId in DISPLAY_ONLY_BANK_ABILITIES;
      if (hasText && !hasWired) {
        // Text describing an effect with nothing wired MUST be declared display-only.
        expect(declaredDisplayOnly, `${unitDefId}: decorative abilityText must be declared display-only`).toBe(true);
      }
      if (!hasText) {
        // No printed ability => not a stub => must not be flagged display-only.
        expect(declaredDisplayOnly, `${unitDefId}: has no ability text and must not be display-only`).toBe(false);
      }
    }
  });

  it("wires the abilities that match an existing engine effect", () => {
    expect(CREATURE_BANK_UNIT_SIDES["neutral.skeletons"].abilities).toEqual(["phoenix-rebirth"]);
    expect(CREATURE_BANK_UNIT_SIDES["neutral.zombies"].abilities).toEqual(["zombie-resilience-weak"]);
    expect(CREATURE_BANK_UNIT_SIDES["neutral.vampires"].abilities).toEqual(["bank-vampire-life-drain"]);
    // Medusa Stores: ignore-retaliation always + the while-Stacked paralysis.
    expect(CREATURE_BANK_UNIT_SIDES["neutral.medusas"].abilities).toEqual([
      "ignores-retaliation",
      "bank-medusa-paralyze-stacked"
    ]);
    expect(CREATURE_BANK_UNIT_SIDES["neutral.dragon_flies"].abilities).toEqual(["dragon-fly-retaliation-penalty-2"]);
    expect(CREATURE_BANK_UNIT_SIDES["neutral.water_elementals"].abilities).toEqual(["magic-elemental-immunity"]);
    expect(CREATURE_BANK_UNIT_SIDES["neutral.gold_golems"].abilities).toEqual(["reduce-spell-damage-2"]);
    expect(CREATURE_BANK_UNIT_SIDES["neutral.diamond_golems"].abilities).toEqual(["reduce-spell-damage-3"]);
    expect(CREATURE_BANK_UNIT_SIDES["neutral.griffins"].abilities).toEqual(["unlimited-retaliation"]);
    expect(CREATURE_BANK_UNIT_SIDES["neutral.nagas"].abilities).toEqual(["ignores-retaliation"]);
    expect(CREATURE_BANK_UNIT_SIDES["neutral.gold_dragons"].abilities).toEqual(["dragon-line-attack-3"]);
    // The Cyclops Stockpile card prints no ability at all.
    expect(CREATURE_BANK_UNIT_SIDES["neutral.cyclopes"].abilities).toEqual([]);
    expect(CREATURE_BANK_UNIT_SIDES["neutral.cyclopes"].abilityText).toBeUndefined();
  });

  it("wires the formerly display-only bank abilities (CLAUDE.md: no decorative features)", () => {
    // Every one of these once sat in DISPLAY_ONLY_BANK_ABILITIES doing nothing.
    expect(CREATURE_BANK_UNIT_SIDES["neutral.familiars"].abilities).toEqual(["bank-familiar-power-drain"]);
    expect(CREATURE_BANK_UNIT_SIDES["neutral.wraiths"].abilities).toEqual(["bank-wraith-attack-discard"]);
    expect(CREATURE_BANK_UNIT_SIDES["neutral.dwarves"].abilities).toEqual(["bank-stacked-defense-token"]);
    expect(CREATURE_BANK_UNIT_SIDES["neutral.black_dragons"].abilities).toEqual(["bank-black-dragon-stacked-attack"]);
    expect(CREATURE_BANK_UNIT_SIDES["neutral.faerie_dragons"].abilities).toEqual(["bank-faerie-dragon-spell-lock"]);
    expect(CREATURE_BANK_UNIT_SIDES["neutral.crystal_dragons"].abilities).toEqual(["bank-stacked-defense-token"]);
    // The registry is now empty: nothing decorative remains on a bank card.
    expect(Object.keys(DISPLAY_ONLY_BANK_ABILITIES)).toHaveLength(0);
  });
});

describe("Creature Bank rewards", () => {
  it("scales resource rewards by the number of Stacked defenders", () => {
    expect(CREATURE_BANKS.imp_cache.buildReward(2)).toEqual({ type: "GAIN_RESOURCES", gold: 5 });
    expect(CREATURE_BANKS.crypt.buildReward(3)).toEqual({ type: "GAIN_RESOURCES", gold: 12 });
    expect(CREATURE_BANKS.dwarven_treasury.buildReward(2)).toEqual({ type: "GAIN_RESOURCES", gold: 13 });
    expect(CREATURE_BANKS.naga_bank.buildReward(1)).toEqual({ type: "GAIN_RESOURCES", gold: 12, valuables: 3 });
    expect(CREATURE_BANKS.cyclops_stockpile.buildReward(2)).toEqual({
      type: "GAIN_RESOURCES",
      buildingMaterials: 12,
      valuables: 4
    });
  });

  it("gives the Medusa Stores base plus a gold-or-valuables CHOICE per Stacked defender", () => {
    // Wiki: "6 gold and 1 valuables. 3 gold OR 1 valuables for every Stacked unit."
    expect(CREATURE_BANKS.medusa_stores.buildReward(0)).toEqual({
      type: "SEQUENCE",
      interactions: [{ type: "GAIN_RESOURCES", gold: 6, valuables: 1 }]
    });
    const reward = CREATURE_BANKS.medusa_stores.buildReward(2);
    expect(reward.type).toBe("SEQUENCE");
    if (reward.type !== "SEQUENCE") return;
    expect(reward.interactions[0]).toEqual({ type: "GAIN_RESOURCES", gold: 6, valuables: 1 });
    const choices = reward.interactions.slice(1);
    expect(choices).toHaveLength(2);
    for (const choice of choices) {
      expect(choice).toEqual({
        type: "CHOOSE_ONE",
        options: [
          { label: "Gain 3 gold", interaction: { type: "GAIN_RESOURCES", gold: 3 } },
          { label: "Gain 1 valuables", interaction: { type: "GAIN_RESOURCES", valuables: 1 } }
        ]
      });
    }
  });

  it("grants POSITIVE morale, scaled gold, and a scaled search for the sea banks", () => {
    // Wiki shows a <morale_positive> token for both the Shipwreck and the
    // Derelict Ship — a morale bonus, not the penalty the code once granted.
    expect(CREATURE_BANKS.shipwreck.buildReward(2)).toEqual({
      type: "SEQUENCE",
      interactions: [
        { type: "GAIN_MORALE", amount: 1 },
        { type: "GAIN_RESOURCES", gold: 9 },
        { type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 2 }
      ]
    });
    expect(CREATURE_BANKS.derelict_ship.buildReward(1)).toEqual({
      type: "SEQUENCE",
      interactions: [
        { type: "GAIN_MORALE", amount: 1 },
        { type: "GAIN_RESOURCES", gold: 9 },
        { type: "SEARCH_SHARED_DECK", deckId: "spells", count: 1 }
      ]
    });
  });

  it("builds the Dragon Utopia base reward plus one Artifact/Spell choice per Stacked defender", () => {
    const reward = CREATURE_BANKS.dragon_utopia.buildReward(2);
    expect(reward.type).toBe("SEQUENCE");
    if (reward.type !== "SEQUENCE") return;
    expect(reward.interactions[0]).toEqual({ type: "GAIN_RESOURCES", gold: 40 });
    expect(reward.interactions[1]).toEqual({ type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 3 });
    const choices = reward.interactions.slice(2);
    expect(choices).toHaveLength(2);
    expect(choices.every((step) => step.type === "CHOOSE_ONE")).toBe(true);
  });

  it("gains a Few normally and a Stacked Pack (2+ Stacked defenders) from the unit banks", () => {
    // Dragon Fly Hive → Dragon Flies; Griffin Conservatory → Griffins. A Pack is
    // the game's "Stacked" version, gained only when at least 2 defenders Stacked.
    expect(CREATURE_BANKS.dragon_fly_hive.rewardStatus).toBe("implemented");
    expect(CREATURE_BANKS.dragon_fly_hive.buildReward(0)).toEqual({
      type: "GAIN_UNIT",
      unitDefId: "fortress.dragon_flies",
      side: "few"
    });
    expect(CREATURE_BANKS.dragon_fly_hive.buildReward(1)).toEqual({
      type: "GAIN_UNIT",
      unitDefId: "fortress.dragon_flies",
      side: "few"
    });
    expect(CREATURE_BANKS.dragon_fly_hive.buildReward(2)).toEqual({
      type: "GAIN_UNIT",
      unitDefId: "fortress.dragon_flies",
      side: "pack"
    });

    expect(CREATURE_BANKS.griffin_conservatory.rewardStatus).toBe("implemented");
    expect(CREATURE_BANKS.griffin_conservatory.buildReward(1)).toEqual({
      type: "GAIN_UNIT",
      unitDefId: "castle.griffins",
      side: "few"
    });
    expect(CREATURE_BANKS.griffin_conservatory.buildReward(3)).toEqual({
      type: "GAIN_UNIT",
      unitDefId: "castle.griffins",
      side: "pack"
    });
  });

  it("only fields units whose gained card exists with the Few/Pack side it grants", () => {
    // The gain-a-unit reward hands out a recruitable card, which must have the side.
    for (const id of ["dragon_fly_hive", "griffin_conservatory"] as const) {
      const reward = CREATURE_BANKS[id].buildReward(2);
      expect(reward.type).toBe("GAIN_UNIT");
      if (reward.type !== "GAIN_UNIT") continue;
      const def = coreUnitDefinitions[reward.unitDefId];
      expect(def, reward.unitDefId).toBeTruthy();
      expect(def.few, `${reward.unitDefId} few`).toBeTruthy();
      expect(def.pack, `${reward.unitDefId} pack`).toBeTruthy();
    }
  });

  it("marks the Pyramid extra partial (only the base Search runs)", () => {
    expect(CREATURE_BANKS.pyramid.rewardStatus).toBe("partial");
    expect(CREATURE_BANKS.pyramid.buildReward(3)).toEqual({ type: "SEARCH_SHARED_DECK", deckId: "spells", count: 5 });
  });
});

describe("Stack Tokens", () => {
  it("uses the rulebook per-difficulty token counts", () => {
    expect(STACK_TOKENS_BY_DIFFICULTY).toEqual({ easy: 1, normal: 2, hard: 3, impossible: 4 });
  });

  it("modifies a unit by +1 to a stat or +2 to initiative", () => {
    expect(STACK_TOKEN_STATS).toEqual(["attack", "defense", "health", "initiative"]);
    expect(stackTokenDelta("attack")).toBe(1);
    expect(stackTokenDelta("defense")).toBe(1);
    expect(stackTokenDelta("health")).toBe(1);
    expect(stackTokenDelta("initiative")).toBe(2);
  });
});

import { describe, expect, it } from "vitest";
import {
  CREATURE_BANK_IDS,
  CREATURE_BANKS,
  POLISH_CREATURE_BANK_IDS,
  POLISH_CREATURE_BANKS,
  POLISH_CREATURE_BANK_UNIT_SIDES
} from "./creature-banks";

describe("Polish Banks printed set", () => {
  it("keeps the official game at 12 banks and supplies exactly 10 Far + 10 Near Polish banks", () => {
    expect(CREATURE_BANK_IDS).toHaveLength(12);
    expect(CREATURE_BANKS.imp_cache.buildReward(3)).toEqual({ type: "GAIN_RESOURCES", gold: 6 });
    expect(POLISH_CREATURE_BANK_IDS).toHaveLength(20);
    expect(POLISH_CREATURE_BANK_IDS.filter((id) => POLISH_CREATURE_BANKS[id].tier === "far")).toHaveLength(10);
    expect(POLISH_CREATURE_BANK_IDS.filter((id) => POLISH_CREATURE_BANKS[id].tier === "near")).toHaveLength(10);
    expect(POLISH_CREATURE_BANKS.imp_cache.buildReward(3)).toEqual({ type: "GAIN_RESOURCES", gold: 8 });
  });

  it("uses the new Zombies only in Graveyard", () => {
    expect(POLISH_CREATURE_BANKS.graveyard.units).toEqual(Array(6).fill("neutral.zombies"));
    expect(POLISH_CREATURE_BANKS.graveyard.unitSideKeys).toEqual(Array(6).fill("guardian:zombies"));
    expect(POLISH_CREATURE_BANKS.crypt.unitSideKeys).toBeUndefined();
    expect(POLISH_CREATURE_BANKS.ruins.unitSideKeys?.[1]).toBeUndefined();
    expect(POLISH_CREATURE_BANK_UNIT_SIDES["guardian:zombies"]).toMatchObject({
      attack: 1, defense: 0, health: 2, initiative: 3, abilities: ["zombie-resilience"]
    });
  });

  it("pins all eleven supplied guardian stat lines", () => {
    const stats: Record<string, [number, number, number, number]> = {
      "guardian:black-dragon": [5, 1, 6, 9], "guardian:evil-eyes": [2, 1, 2, 6],
      "guardian:fire-elementals": [3, 1, 3, 6], "guardian:gold-dragon": [4, 1, 7, 9],
      "guardian:green-dragon": [4, 1, 5, 7], "guardian:liches": [3, 0, 4, 6],
      "guardian:red-dragon": [4, 1, 6, 8], "guardian:steel-golems": [3, 1, 3, 5],
      "guardian:vampire-lords": [3, 0, 4, 7], "guardian:wolf-riders": [2, 0, 5, 7],
      "guardian:zombies": [1, 0, 2, 3]
    };
    for (const [key, [attack, defense, health, initiative]] of Object.entries(stats)) {
      expect(POLISH_CREATURE_BANK_UNIT_SIDES[key]).toMatchObject({ attack, defense, health, initiative });
    }
  });

  it("pins Black Tower's one guardian and fixed Artifact pile for every size", () => {
    const expected = [
      ["guardian:green-dragon", 5, "artifacts-minor", 2],
      ["guardian:red-dragon", 6, "artifacts-minor", 3],
      ["guardian:gold-dragon", 7, "artifacts-major", 2],
      ["guardian:black-dragon", 8, "artifacts-major", 3]
    ] as const;
    for (const size of [1, 2, 3, 4] as const) {
      const [sideKey, gold, deckId, count] = expected[size - 1];
      expect(POLISH_CREATURE_BANKS.black_tower.buildUnits?.(size)).toHaveLength(1);
      expect(POLISH_CREATURE_BANKS.black_tower.buildUnits?.(size)[0]?.bankSideKey).toBe(sideKey);
      expect(POLISH_CREATURE_BANKS.black_tower.buildReward(size)).toEqual({
        type: "SEQUENCE",
        interactions: [
          { type: "GAIN_RESOURCES", gold },
          { type: "SEARCH_SHARED_DECK", deckId, count }
        ]
      });
    }
  });

  it("pins every size-specific unit reward face and its single Empower token", () => {
    const banks = [
      ["dragon_fly_hive", "neutral.wyverns", "wyverns"],
      ["wolves_den", "neutral.cyclopes", "cyclopes"],
      ["red_tower", "neutral.phoenixes", "fire-birds"],
      ["training_grounds", "neutral.titans", "giants"],
      ["griffin_conservatory", "neutral.archangels", "angels"]
    ] as const;
    for (const [bankId, unitDefId, family] of banks) {
      for (const size of [1, 2, 3, 4] as const) {
        expect(POLISH_CREATURE_BANKS[bankId].buildReward(size)).toEqual({
          type: "SEQUENCE",
          interactions: [
            { type: "GAIN_UNIT", unitDefId, side: "bank", bankSideKey: `reward:${family}:${size}` },
            { type: "GAIN_ABILITY_EMPOWER_TOKEN", force: true }
          ]
        });
        expect(POLISH_CREATURE_BANK_UNIT_SIDES[`reward:${family}:${size}`]).toBeTruthy();
      }
    }
  });

  it("pins all twenty printed I–IV reward stat lines", () => {
    const stats: Record<string, [number, number, number, number][]> = {
      angels: [[4, 1, 5, 10], [4, 2, 5, 10], [4, 2, 6, 10], [5, 2, 6, 10]],
      cyclopes: [[4, 0, 5, 6], [4, 0, 6, 6], [4, 1, 5, 6], [5, 1, 5, 6]],
      "fire-birds": [[4, 0, 6, 9], [4, 1, 5, 9], [4, 1, 6, 9], [5, 1, 6, 9]],
      giants: [[4, 0, 7, 7], [4, 1, 6, 7], [4, 1, 6, 7], [5, 1, 7, 7]],
      wyverns: [[4, 0, 6, 8], [4, 0, 7, 8], [4, 1, 6, 8], [4, 1, 7, 8]]
    };
    for (const [family, rows] of Object.entries(stats)) {
      rows.forEach(([attack, defense, health, initiative], index) => {
        expect(POLISH_CREATURE_BANK_UNIT_SIDES[`reward:${family}:${index + 1}`]).toMatchObject({
          attack, defense, health, initiative
        });
      });
    }
  });

  it("keeps Mansion player-choice Artifact search and Utopia capped at Major", () => {
    expect(POLISH_CREATURE_BANKS.mansion.buildReward(4)).toEqual({
      type: "SEQUENCE",
      interactions: [
        { type: "GAIN_RESOURCES", gold: 15, valuables: 2, buildingMaterials: 4 },
        { type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 4 }
      ]
    });
    expect(JSON.stringify(POLISH_CREATURE_BANKS.dragon_utopia.buildReward(4))).toContain('"maxArtifactTier":"major"');
  });

  it("uses the corrected Graveyard payout and the printed Pyramid Search (6)", () => {
    expect(POLISH_CREATURE_BANKS.graveyard.buildReward(2)).toEqual({
      type: "SEQUENCE",
      interactions: [
        { type: "GAIN_MORALE", amount: -1 },
        { type: "GAIN_RESOURCES", gold: 10 }
      ]
    });
    expect(POLISH_CREATURE_BANKS.pyramid.buildReward(2)).toEqual({
      type: "SEQUENCE",
      interactions: [
        { type: "SEARCH_SHARED_DECK", deckId: "spells", count: 5 },
        { type: "REMOVE_THEN_SEARCH_REPEAT", times: 2, searchCount: 6 }
      ]
    });
  });

  it("names the Steel Golem bank Experimental Shop", () => {
    expect(POLISH_CREATURE_BANKS.training_grounds.name).toBe("Experimental Shop");
  });

  it("treats Medusa's printed 3X-gold OR X-valuables as one whole reward choice", () => {
    expect(POLISH_CREATURE_BANKS.medusa_stores.buildReward(3)).toEqual({
      type: "SEQUENCE",
      interactions: [
        { type: "GAIN_RESOURCES", gold: 6, valuables: 1 },
        {
          type: "CHOOSE_ONE",
          options: [
            { label: "Gain 9 gold", interaction: { type: "GAIN_RESOURCES", gold: 9 } },
            { label: "Gain 3 valuables", interaction: { type: "GAIN_RESOURCES", valuables: 3 } }
          ]
        }
      ]
    });
  });
});

import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cardLibrary } from "@/data/cards/library";
import { coreBuildingDefinitions, coreFactionDefinitions, coreHeroDefinitions, startingTileByFaction } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities } from "@/data/units/abilities";
import { unitSoundKey, type UnitSoundAction } from "@/data/unit-sounds";
import { applyAction, createAdventureGameState } from "./index";
import { startAdventureRound } from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import type { GameAction, GameState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

describe("Cove faction wiring", () => {
  it("registers the faction with its starting tile, eight buildings, two heroes and seven units", () => {
    const faction = coreFactionDefinitions.cove;
    expect(faction).toBeDefined();
    expect(faction.id).toBe("cove");
    expect(faction.startingTileId).toBe("S9");
    expect(startingTileByFaction.cove).toBe("S9");
    expect(faction.color).toBeTruthy();

    expect(faction.buildings).toEqual([
      "cove.city_hall",
      "cove.citadel",
      "cove.mage_guild",
      "cove.dwelling_bronze",
      "cove.dwelling_silver",
      "cove.dwelling_gold",
      "cove.thieves_guild",
      "cove.pub"
    ]);
    expect(faction.units).toEqual([
      "cove.oceanids",
      "cove.seamen",
      "cove.sea_dogs",
      "cove.ayssids",
      "cove.sorceresses",
      "cove.nix",
      "cove.haspids"
    ]);
    // Only the two fully-wired heroes are registered (see the deferral note).
    expect(faction.heroes).toEqual(["astra", "cassiopeia"]);
  });
});

describe("Cove units", () => {
  it("carries the wiki stats on each side (spot-checks)", () => {
    expect(coreUnitDefinitions["cove.oceanids"].few).toMatchObject({ attack: 2, defense: 0, health: 3, initiative: 6, cost: { gold: 2 } });
    expect(coreUnitDefinitions["cove.nix"].pack).toMatchObject({ attack: 6, defense: 2, health: 8, initiative: 7, cost: { gold: 20, valuables: 1 } });
    expect(coreUnitDefinitions["cove.haspids"].pack).toMatchObject({ attack: 7, defense: 3, health: 8, initiative: 12, cost: { gold: 30, valuables: 2 } });
    expect(coreUnitDefinitions["cove.sea_dogs"].few?.type ?? coreUnitDefinitions["cove.sea_dogs"].type).toBe("ranged");
  });

  it("wires every side's abilities to implemented engine tags — no decorative ones", () => {
    const expected: Record<string, { few: string[]; pack: string[] }> = {
      "cove.oceanids": { few: [], pack: ["immune-all-spells"] },
      "cove.seamen": { few: [], pack: ["seamen-plunder"] },
      "cove.sea_dogs": { few: ["ignore-combat-penalties"], pack: ["ignores-retaliation", "ignore-combat-penalties"] },
      "cove.ayssids": { few: [], pack: ["ayssid-pounce"] },
      "cove.sorceresses": { few: ["sorceress-weakness-few"], pack: ["sorceress-weakness-on-attack"] },
      "cove.nix": { few: [], pack: ["nix-damage-cap"] },
      "cove.haspids": { few: ["haspid-vengeance"], pack: ["wyvern-poison-cube-pack"] }
    };
    for (const [unitId, sides] of Object.entries(expected)) {
      const def = coreUnitDefinitions[unitId];
      expect(def, unitId).toBeDefined();
      expect(def.faction).toBe("cove");
      expect(def.few?.abilities ?? [], `${unitId} few`).toEqual(sides.few);
      expect(def.pack?.abilities ?? [], `${unitId} pack`).toEqual(sides.pack);
      // Every listed ability resolves to an implemented engine effect.
      for (const abilityId of [...sides.few, ...sides.pack]) {
        const ability = unitAbilities[abilityId];
        expect(ability, abilityId).toBeDefined();
        expect(ability.implementationStatus, abilityId).toBe("implemented");
        expect(ability.effect?.type, abilityId).toBeTruthy();
      }
    }
  });

  it("registers the four new Cove ability effects as implemented", () => {
    const newAbilities: Record<string, string> = {
      "seamen-plunder": "ON_KILL_GAIN_RESOURCE",
      "ayssid-pounce": "SECOND_ATTACK_ONE_ADJACENT_TO_SELF",
      "nix-damage-cap": "CAP_DAMAGE_PER_ATTACK",
      "haspid-vengeance": "ATTACK_BONUS_IF_FLIPPED"
    };
    for (const [abilityId, effectType] of Object.entries(newAbilities)) {
      const ability = unitAbilities[abilityId];
      expect(ability, abilityId).toBeDefined();
      expect(ability.implementationStatus, abilityId).toBe("implemented");
      expect(ability.effect?.type, abilityId).toBe(effectType);
    }
    // The Ayssid follow-up is the kill-gated variant.
    expect(unitAbilities["ayssid-pounce"].effect).toMatchObject({ requiresTargetRemoved: true });
  });

  it("has a combat voice for every unit/action (SFX present)", () => {
    for (const unitId of coreFactionDefinitions.cove.units) {
      const def = coreUnitDefinitions[unitId];
      const actions: UnitSoundAction[] =
        def.type === "ranged"
          ? ["attack", "shoot", "defend", "hurt", "death", "move"]
          : ["attack", "defend", "hurt", "death", "move"];
      for (const action of actions) {
        expect(unitSoundKey(unitId, action), `${unitId}:${action}`).toBeTruthy();
      }
    }
  });
});

describe("Cove heroes", () => {
  it("registers Astra and Cassiopeia with implemented starting abilities and specialties", () => {
    for (const [heroId, klass, type, ability] of [
      ["astra", "Navigator", "magic", "ability.luck"],
      ["cassiopeia", "Captain", "might", "ability.tactics"]
    ] as const) {
      const hero = coreHeroDefinitions[heroId];
      expect(hero, heroId).toBeDefined();
      expect(hero.faction).toBe("cove");
      expect(hero.class).toBe(klass);
      expect(hero.type).toBe(type);
      expect(cardLibrary[hero.startingAbilityCardId], `${heroId} ability ${ability}`).toBeDefined();
      expect(hero.startingAbilityCardId).toBe(ability);
      // PC portrait is hosted locally (scripts/fetch-cove-art.py); no board scan yet.
      expect(hero.portrait).toBe(`/assets/hero_portraits-${heroId}.webp`);
      expect(hero.boardScan).toBeUndefined();
      expect(existsSync(fileURLToPath(new URL(`../../public${hero.portrait}`, import.meta.url))), `${heroId} portrait file`).toBe(true);
      for (const specialtyId of Object.values(hero.specialtyCardIds)) {
        const card = cardLibrary[specialtyId];
        expect(card, specialtyId).toBeDefined();
        expect(card.kind).toBe("hero-specialty");
        expect(card.implementationStatus, specialtyId).toBe("implemented");
      }
    }
  });

  it("does NOT register the four deferred Cove heroes (kept out, not stubbed)", () => {
    for (const heroId of ["casmetra", "jeremy", "miriam", "zilare"]) {
      expect(coreHeroDefinitions[heroId], heroId).toBeUndefined();
    }
  });
});

describe("Cove buildings", () => {
  it("reuses the standard implemented effects for the core buildings", () => {
    expect(coreBuildingDefinitions["cove.citadel"].effect).toMatchObject({ type: "UNLOCK_REINFORCE" });
    expect(coreBuildingDefinitions["cove.mage_guild"].effect).toMatchObject({ type: "MAGE_GUILD" });
    expect(coreBuildingDefinitions["cove.mage_guild"].spellBookCost).toBe(5);
    expect(coreBuildingDefinitions["cove.dwelling_bronze"]).toMatchObject({
      name: "Bay",
      cost: { gold: 4, buildingMaterials: 3, valuables: 1 },
      effect: { type: "UNLOCK_RECRUIT_TIER", tier: "bronze" }
    });
    expect(coreBuildingDefinitions["cove.dwelling_silver"].effect).toMatchObject({ type: "UNLOCK_RECRUIT_TIER", tier: "silver" });
    expect(coreBuildingDefinitions["cove.dwelling_gold"].effect).toMatchObject({ type: "UNLOCK_RECRUIT_TIER", tier: "gold" });
  });

  it("gives the City Hall its Astrologers'-round gold/experience choice", () => {
    const cityHall = coreBuildingDefinitions["cove.city_hall"];
    expect(cityHall.cost).toEqual({ gold: 10, buildingMaterials: 4 });
    expect(cityHall.implementationStatus).toBe("implemented");
    expect(cityHall.effect).toMatchObject({
      type: "ASTROLOGERS_ROUND_CHOICE",
      options: [
        { gold: 4 },
        { experience: 1, removeArtifactFromHand: true }
      ]
    });
  });

  it("marks the two not-yet-wired faction buildings honestly", () => {
    for (const id of ["cove.thieves_guild", "cove.pub"]) {
      expect(coreBuildingDefinitions[id].implementationStatus, id).toBe("not-implemented");
      expect(coreBuildingDefinitions[id].effect?.type, id).toBe("NOT_IMPLEMENTED");
    }
  });
});

describe("Cove adventure setup", () => {
  function coveGame(seed: string): GameState {
    return createAdventureGameState({
      seed,
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Astra", factionId: "cove", heroDefId: "astra" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
  }

  it("seats a Cove player with their town and main hero", () => {
    const state = coveGame("cove-setup");
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1");
    expect(town, "Cove player should own a town").toBeTruthy();
    expect(town?.factionId).toBe("cove");
    expect(Object.values(state.heroes).some((hero) => hero.controllerId === "p1")).toBe(true);
  });

  it("queues the City Hall choice for the Cove player on the Astrologers' round", () => {
    const state = coveGame("cove-cityhall-queue");
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1");
    expect(town, "Cove town").toBeTruthy();
    if (!town!.buildings.includes("cove.city_hall")) {
      town!.buildings.push("cove.city_hall");
    }
    state.pendingChoice = null;
    if (state.adventure) {
      state.adventure.rewardQueue = [];
    }
    state.round = 2; // even rounds are Astrologers' rounds
    startAdventureRound(state);
    const queued =
      state.adventure?.rewardQueue.some(
        (reward) => reward.kind === "city-hall-choice" && reward.playerId === "p1" && reward.buildingId === "cove.city_hall"
      ) ?? false;
    expect(queued).toBe(true);
  });

  /** Drives the City Hall choice straight off the reward queue (no turn machinery). */
  function openCityHallChoice(seed: string, hand: string[]): GameState {
    const state = coveGame(seed);
    state.players.p1.hand = hand;
    state.players.p1.discard = [];
    state.pendingChoice = null;
    if (!state.adventure) {
      throw new Error("no adventure state");
    }
    state.adventure.rewardQueue = [{ playerId: "p1", kind: "city-hall-choice", buildingId: "cove.city_hall" }];
    pumpAdventureQueues(state);
    return state;
  }

  it("City Hall pays 4 gold (the only option offered with no Artifact in hand)", () => {
    const state = openCityHallChoice("cove-cityhall-gold", ["stat.attack"]);
    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE" || choice.context !== "city-hall") {
      throw new Error("expected the Cove City Hall choice");
    }
    expect(choice.cityHall?.options).toHaveLength(1); // artifact option filtered out
    const goldBefore = state.players.p1.resources.gold;
    const next = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 0 });
    expect(next.players.p1.resources.gold).toBe(goldBefore + 4);
  });

  it("City Hall can spend an Artifact for 1 experience when one is held", () => {
    const state = openCityHallChoice("cove-cityhall-xp", ["artifact.centaurs_axe"]);
    const hero = Object.values(state.heroes).find((candidate) => candidate.controllerId === "p1" && candidate.kind === "main");
    expect(hero).toBeTruthy();
    const xpBefore = hero!.experience;
    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE" || choice.context !== "city-hall") {
      throw new Error("expected the Cove City Hall choice");
    }
    // With an Artifact in hand both options are offered; index 1 is the cost option.
    expect(choice.cityHall?.options).toHaveLength(2);
    const next = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 1 });
    const heroAfter = Object.values(next.heroes).find((candidate) => candidate.controllerId === "p1" && candidate.kind === "main");
    expect(next.players.p1.hand).not.toContain("artifact.centaurs_axe");
    expect(next.players.p1.discard).toContain("artifact.centaurs_axe");
    expect(heroAfter!.experience).toBe(xpBefore + 1);
  });
});

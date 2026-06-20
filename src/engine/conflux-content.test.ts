import { describe, expect, it } from "vitest";
import { TOWN_BUILDING_IMAGES } from "@/data/assets/homm-assets";
import { cardLibrary } from "@/data/cards/library";
import { coreBuildingDefinitions, coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities } from "@/data/units/abilities";
import { getActivationSpellPowerBoost } from "./unit-abilities";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  makeCombatUnitFromArmy
} from "./index";
import { startAdventureRound } from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import type { CombatUnitState, GameAction, GameState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 30;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function unitWith(abilities: string[]): CombatUnitState {
  return { abilities } as CombatUnitState;
}

describe("Conflux content", () => {
  it("wires the faction to its eight town buildings, three heroes, seven units, cards, and art slots", () => {
    const faction = coreFactionDefinitions.conflux;
    expect(faction).toBeDefined();
    expect(faction.startingTileId).toBe("S8");
    expect(faction.buildings).toEqual([
      "conflux.city_hall",
      "conflux.citadel",
      "conflux.mage_guild",
      "conflux.dwelling_bronze",
      "conflux.dwelling_silver",
      "conflux.dwelling_gold",
      "conflux.garden_of_life",
      "conflux.magic_university"
    ]);
    expect(Object.keys(TOWN_BUILDING_IMAGES.conflux ?? {})).toHaveLength(8);
    for (const building of faction.buildings) {
      expect(coreBuildingDefinitions[building].assets?.image, `${building} art`).toContain("/assets/town/conflux_");
    }

    expect(faction.heroes).toEqual(["erdamon", "monere", "pasis"]);
    for (const heroId of faction.heroes) {
      const hero = coreHeroDefinitions[heroId];
      expect(hero, heroId).toBeDefined();
      expect(hero.faction).toBe("conflux");
      expect(hero.portrait, `${heroId} portrait`).toBeTruthy();
      expect(cardLibrary[hero.startingAbilityCardId], `${heroId} ability`).toBeDefined();
      for (const specialtyId of Object.values(hero.specialtyCardIds)) {
        const specialty = cardLibrary[specialtyId];
        expect(specialty, `${heroId} specialty ${specialtyId}`).toBeDefined();
        // Every shipped Conflux specialty must actually be implemented.
        expect(specialty?.implementationStatus, specialtyId).toBe("implemented");
      }
    }

    expect(faction.units).toEqual([
      "conflux.sprites",
      "conflux.storm_elementals",
      "conflux.ice_elementals",
      "conflux.energy_elementals",
      "conflux.magma_elementals",
      "conflux.magic_elementals",
      "conflux.phoenixes"
    ]);
    for (const unitId of faction.units) {
      const unit = coreUnitDefinitions[unitId];
      expect(unit.few?.cardImage, `${unit.id} few art`).toBeTruthy();
      expect(unit.pack?.cardImage, `${unit.id} pack art`).toBeTruthy();
    }
  });

  it("City Hall income is 4 gold OR Search(3) the Spell deck (wiki-verified)", () => {
    expect(coreBuildingDefinitions["conflux.city_hall"].effect).toMatchObject({
      type: "RESOURCE_ROUND_CHOICE",
      options: [{ gold: 4 }, { searchSpellDeck: 3 }]
    });
    expect(coreBuildingDefinitions["conflux.city_hall"].cost).toEqual({ gold: 10, buildingMaterials: 3 });
  });

  it("Garden of Life is implemented; Magic University is honestly not-implemented", () => {
    const garden = coreBuildingDefinitions["conflux.garden_of_life"];
    expect(garden.implementationStatus).toBe("implemented");
    expect(garden.effect).toMatchObject({ type: "ROUND_START_FREE_SPRITE", unitDefId: "conflux.sprites" });

    const university = coreBuildingDefinitions["conflux.magic_university"];
    expect(university.implementationStatus).toBe("not-implemented");
    expect(university.effect?.type).toBe("NOT_IMPLEMENTED");
  });

  it("carries the implemented elemental / phoenix / sprite ability tags on the right sides", () => {
    // Elementals reuse the already-wired elemental passives on both sides.
    expect(coreUnitDefinitions["conflux.storm_elementals"].few?.abilities).toEqual([
      "elemental-damage",
      "air-elemental-immunity"
    ]);
    expect(coreUnitDefinitions["conflux.storm_elementals"].pack?.abilities).toContain("storm-elemental-air-power");
    expect(coreUnitDefinitions["conflux.magma_elementals"].pack?.abilities).toContain("magma-elemental-earth-power");
    // Sprites: only the Pack ignores retaliation.
    expect(coreUnitDefinitions["conflux.sprites"].few?.abilities).toEqual([]);
    expect(coreUnitDefinitions["conflux.sprites"].pack?.abilities).toEqual(["ignores-retaliation"]);
    // Phoenix Few = rebirth + fire immunity; Pack = line attack + fire immunity.
    expect(coreUnitDefinitions["conflux.phoenixes"].few?.abilities).toEqual([
      "phoenix-rebirth",
      "phoenix-fire-immunity"
    ]);
    expect(coreUnitDefinitions["conflux.phoenixes"].pack?.abilities).toEqual([
      "dragon-line-attack-2",
      "phoenix-fire-immunity"
    ]);
    // The four new elemental spell-power abilities resolve to an implemented effect.
    for (const id of [
      "storm-elemental-air-power",
      "ice-elemental-water-power",
      "energy-elemental-fire-power",
      "magma-elemental-earth-power"
    ]) {
      expect(unitAbilities[id]?.implementationStatus, id).toBe("implemented");
      expect(unitAbilities[id]?.effect?.type, id).toBe("ON_ACTIVATION_SPELL_POWER_FIRST_CAST");
    }
  });

  it("flips Storm/Ice elementals ground→ranged and Energy ground→flying when reinforced (per-side type)", () => {
    const checks: { id: string; few: string; pack: string }[] = [
      { id: "conflux.storm_elementals", few: "ground", pack: "ranged" },
      { id: "conflux.ice_elementals", few: "ground", pack: "ranged" },
      { id: "conflux.energy_elementals", few: "ground", pack: "flying" }
    ];
    for (const { id, few, pack } of checks) {
      const fewUnit = makeCombatUnitFromArmy({ id: "a-few", unitDefId: id, side: "few" }, "p1", "u-few", 0);
      const packUnit = makeCombatUnitFromArmy({ id: "a-pack", unitDefId: id, side: "pack" }, "p1", "u-pack", 1);
      expect(fewUnit?.type, `${id} few`).toBe(few);
      expect(packUnit?.type, `${id} pack`).toBe(pack);
    }
    // Magma Elementals stay ground on both sides.
    const magma = makeCombatUnitFromArmy({ id: "a-magma", unitDefId: "conflux.magma_elementals", side: "pack" }, "p1", "u-magma", 0);
    expect(magma?.type).toBe("ground");
  });

  it("places the Conflux starting tile and town for a seated Conflux player", () => {
    const state = createAdventureGameState({
      seed: "conflux-setup",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Erdamon", factionId: "conflux", heroDefId: "erdamon" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1");
    expect(town, "Conflux player should own a town").toBeTruthy();
    expect(town?.factionId).toBe("conflux");
    const hero = Object.values(state.heroes).find((candidate) => candidate.controllerId === "p1");
    expect(hero, "Conflux player should have a main hero").toBeTruthy();
  });

  it("Garden of Life lets a Conflux player recruit a free Sprites Few each round", () => {
    const state = createAdventureGameState({
      seed: "conflux-garden",
      rollFirstPlayer: false,
      players: [
        { id: "p1", name: "Pasis", factionId: "conflux", heroDefId: "pasis" },
        { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
      ]
    });
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1");
    if (!town) {
      throw new Error("no Conflux town");
    }
    if (!town.buildings.includes("conflux.garden_of_life")) {
      town.buildings.push("conflux.garden_of_life");
    }
    state.pendingChoice = null;
    if (state.adventure) {
      state.adventure.rewardQueue = [];
    }
    // Round 3 is a Resource round (odd > 1).
    state.round = 3;
    const goldBefore = state.players.p1.resources.gold;
    const spritesBefore = state.players.p1.army.filter((unit) => unit.unitDefId === "conflux.sprites").length;
    startAdventureRound(state);
    pumpAdventureQueues(state);

    const recruit = getLegalActions(state, "p1").find((legal) => legal.label.includes("Recruit Sprites"));
    expect(recruit, "the free-Sprites recruit option should be offered").toBeTruthy();
    const next = applyOk(state, recruit!.action);
    pumpAdventureQueues(next);

    const spritesAfter = next.players.p1.army.filter((unit) => unit.unitDefId === "conflux.sprites" && unit.side === "few").length;
    expect(spritesAfter).toBe(spritesBefore + 1);
    // It was free — gold is unchanged by the recruit itself (resource-round income
    // may have been gained, but no gold was spent on the unit).
    expect(next.players.p1.resources.gold).toBeGreaterThanOrEqual(goldBefore);
  });
});

// ---------------------------------------------------------------------------
// Conflux Pack Elementals: "+1 power to the first <school> Magic spell you cast
// during this Activation" — school-scoped, only while that unit is active.
// ---------------------------------------------------------------------------

describe("Conflux elemental school spell-power boost", () => {
  it("getActivationSpellPowerBoost is school-aware", () => {
    // The Storm Elemental boost lands only on an Air spell.
    expect(getActivationSpellPowerBoost(unitWith(["storm-elemental-air-power"]), ["air"])).toBe(1);
    expect(getActivationSpellPowerBoost(unitWith(["storm-elemental-air-power"]), ["fire"])).toBe(0);
    expect(getActivationSpellPowerBoost(unitWith(["storm-elemental-air-power"]), ["any"])).toBe(0);
    expect(getActivationSpellPowerBoost(unitWith(["storm-elemental-air-power"]))).toBe(0);
    // The Magma Elemental boost lands only on an Earth spell.
    expect(getActivationSpellPowerBoost(unitWith(["magma-elemental-earth-power"]), ["earth"])).toBe(1);
    expect(getActivationSpellPowerBoost(unitWith(["magma-elemental-earth-power"]), ["air"])).toBe(0);
    // The Magi (school-less) boost still lands on any school.
    expect(getActivationSpellPowerBoost(unitWith(["magi-power-boost"]), ["fire"])).toBe(1);
    expect(getActivationSpellPowerBoost(unitWith(["magi-power-boost"]))).toBe(1);
  });

  /**
   * Cast a hand Lightning Bolt (Air spell; power 0 → 2 damage, power 1 → 3).
   * The active unit `unit_p1_griffins` carries the ability under test.
   */
  function castLightningBolt(setup: (state: GameState) => void): GameState {
    const state = createInitialGameState("conflux-spell-power-seed");
    state.players.p1.hand = ["spell.lightning_bolt"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const target = state.combat!.units.unit_p2_vampires;
    target.maxHealth = 20;
    target.damage = 0;
    setup(state);
    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        !legal.action.fromScroll &&
        legal.action.cardId === "spell.lightning_bolt" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p2_vampires"
    );
    expect(cast, "hand cast of Lightning Bolt at the target should be legal").toBeTruthy();
    return passAllReactions(applyOk(state, cast!.action));
  }

  it("an ordinary active unit casting Lightning Bolt deals 2 (no boost)", () => {
    const next = castLightningBolt(() => {});
    expect(next.combat!.units.unit_p2_vampires.damage).toBe(2);
  });

  it("a Storm Elemental Pack active unit gives its first Air spell +1 power (deals 3)", () => {
    const next = castLightningBolt((state) => {
      state.combat!.units.unit_p1_griffins.abilities = ["storm-elemental-air-power"];
    });
    expect(next.combat!.units.unit_p2_vampires.damage).toBe(3);
  });

  it("no boost when the Storm Elemental is on the board but NOT the active unit", () => {
    const next = castLightningBolt((state) => {
      state.combat!.units.unit_p1_crusaders.abilities = ["storm-elemental-air-power"];
      state.combat!.units.unit_p1_griffins.abilities = [];
    });
    expect(next.combat!.units.unit_p2_vampires.damage).toBe(2);
  });

  it("no boost for a Magma Elemental (Earth) casting an Air spell — wrong school", () => {
    const next = castLightningBolt((state) => {
      state.combat!.units.unit_p1_griffins.abilities = ["magma-elemental-earth-power"];
    });
    expect(next.combat!.units.unit_p2_vampires.damage).toBe(2);
  });
});

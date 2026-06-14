import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { neutralUnitIdsByTier } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities } from "@/data/units/abilities";
import { unitSoundKey } from "@/data/unit-sounds";
import { getSpecialtyDamageReduction, getSpellDamageReduction } from "./unit-abilities";
import type { CombatUnitState, GameAction, GameState, UnitId } from "./state";

/**
 * Steel Golems (neutral, silver): same Iron Golem voice; stats A3/D2/H3/I5 for
 * 12 gold; "Reduce any damage this unit takes from spells or Specialty by 2 — to
 * a minimum of 0." Unlike the Iron/Gold/Diamond Golems (spell damage only),
 * they also soften Hero-Specialty damage (Xyron's Inferno, Solmyr's Chain
 * Lightning).
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function findPlay(state: GameState, cardId: string, unitId: UnitId) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      legal.action.target?.type === "unit" &&
      legal.action.target.unitId === unitId
  );
}

const unitWith = (abilities: string[]) => ({ abilities }) as CombatUnitState;

describe("Steel Golem — data wiring", () => {
  const def = coreUnitDefinitions["neutral.steel_golems"];

  it("exists as a silver neutral ground unit with the wiki stats", () => {
    expect(def).toBeTruthy();
    expect(def.faction).toBe("neutral");
    expect(def.tier).toBe("silver");
    expect(def.type).toBe("ground");
    expect(def.neutral).toMatchObject({
      attack: 3,
      defense: 2,
      health: 3,
      initiative: 5,
      cost: { gold: 12 },
      abilities: ["reduce-spell-and-specialty-damage-2"]
    });
  });

  it("joins the silver neutral guard pool", () => {
    expect(neutralUnitIdsByTier.silver).toContain("neutral.steel_golems");
    expect(neutralUnitIdsByTier.bronze).not.toContain("neutral.steel_golems");
  });

  it("ships no card art yet (board falls back to the named frame)", () => {
    expect(def.neutral?.cardImage).toBeUndefined();
  });

  it("wires an implemented spell-or-Specialty reduction ability", () => {
    const ability = unitAbilities["reduce-spell-and-specialty-damage-2"];
    expect(ability.implementationStatus).toBe("implemented");
    expect(ability.effect).toEqual({ type: "REDUCE_SPELL_AND_SPECIALTY_DAMAGE", amount: 2 });
  });

  it("reuses the Iron Golem voice set", () => {
    expect(unitSoundKey("neutral.steel_golems", "attack")).toBe("units/iron-golem-attack");
    expect(unitSoundKey("neutral.steel_golems", "death")).toBe("units/iron-golem-death");
    expect(unitSoundKey("neutral.steel_golems", "move")).toBe("units/iron-golem-move");
  });
});

describe("Steel Golem — reduction helpers", () => {
  it("reduces both spell and Specialty damage by 2", () => {
    const steel = unitWith(["reduce-spell-and-specialty-damage-2"]);
    expect(getSpellDamageReduction(steel)).toBe(2);
    expect(getSpecialtyDamageReduction(steel)).toBe(2);
  });

  it("ordinary spell-reducing golems never soften Specialty damage", () => {
    const iron = unitWith(["reduce-spell-damage-2"]);
    expect(getSpellDamageReduction(iron)).toBe(2);
    expect(getSpecialtyDamageReduction(iron)).toBe(0);
  });
});

describe("Steel Golem — spell damage reduction (Magic Arrow scroll)", () => {
  function arrowAt(abilities: string[]): GameState {
    const state = createInitialGameState("steel-arrow");
    state.players.p1.hand = [];
    state.players.p1.scrolls = [{ id: "scroll_1", spellCardIds: ["spell.magic_arrow"] }];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const target = state.combat!.units.unit_p2_vampires;
    target.abilities = abilities;
    target.maxHealth = 20;
    target.damage = 0;
    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.fromScroll === "scroll_1" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p2_vampires"
    );
    return passAllReactions(applyOk(state, cast!.action));
  }

  it("a Steel Golem shrugs off a 1-damage Magic Arrow (1 − 2 → 0)", () => {
    expect(arrowAt(["reduce-spell-and-specialty-damage-2"]).combat!.units.unit_p2_vampires.damage).toBe(0);
  });
});

describe("Steel Golem — Specialty damage reduction (Xyron's Inferno)", () => {
  function blastAt(abilities: string[]): GameState {
    const state = createInitialGameState("steel-xyron");
    state.players.p1.hand = ["specialty.xyron.6"];
    state.players.p2.hand = [];
    const target = state.combat!.units.unit_p2_vampires;
    target.abilities = abilities;
    target.maxHealth = 20;
    target.damage = 0;
    const play = findPlay(state, "specialty.xyron.6", "unit_p2_vampires");
    expect(play, "Xyron VI should be playable").toBeTruthy();
    return applyOk(state, play!.action);
  }

  it("a Steel Golem takes 0 from the 1-damage blast (1 − 2 → 0)", () => {
    expect(blastAt(["reduce-spell-and-specialty-damage-2"]).combat!.units.unit_p2_vampires.damage).toBe(0);
  });

  it("an Iron Golem (spells only) still takes the full Specialty damage", () => {
    // Regression guard: the Iron Golem's "reduce spell damage" must NOT apply to
    // Hero-Specialty damage — only the Steel Golem's passive does.
    expect(blastAt(["reduce-spell-damage-2"]).combat!.units.unit_p2_vampires.damage).toBe(1);
  });
});

describe("Steel Golem — Specialty damage reduction (Solmyr's Chain Lightning)", () => {
  function chainAt(abilities: string[]): GameState {
    const state = createInitialGameState("steel-chain");
    state.players.p1.hand = ["specialty.solmyr.6"];
    state.players.p2.hand = [];
    // skeletons(13) is the primary bolt; vampires(14)/dread_knights(9) chain.
    state.combat!.units.unit_p2_skeletons.position = 13;
    state.combat!.units.unit_p2_vampires.position = 14;
    state.combat!.units.unit_p2_dread_knights.position = 9;
    state.combat!.units.unit_p1_marksmen.position = 0;
    state.combat!.units.unit_p1_griffins.position = 1;
    state.combat!.units.unit_p1_crusaders.position = 2;
    for (const unit of Object.values(state.combat!.units)) {
      unit.maxHealth = 20;
      unit.damage = 0;
    }
    state.combat!.units.unit_p2_skeletons.abilities = abilities;
    const play = findPlay(state, "specialty.solmyr.6", "unit_p2_skeletons");
    expect(play, "Solmyr VI should target the primary").toBeTruthy();
    return applyOk(state, play!.action);
  }

  it("a Steel Golem primary takes 0 from the 2-damage bolt (2 − 2 → 0)", () => {
    expect(chainAt(["reduce-spell-and-specialty-damage-2"]).combat!.units.unit_p2_skeletons.damage).toBe(0);
  });

  it("an Iron Golem primary takes the full 2 (Specialty is not its spell reduction)", () => {
    expect(chainAt(["reduce-spell-damage-2"]).combat!.units.unit_p2_skeletons.damage).toBe(2);
  });
});

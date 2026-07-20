import { describe, expect, it } from "vitest";

import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities } from "@/data/units/abilities";
import {
  applyAction,
  createInitialGameState,
  getLegalActions,
  unitDealsElementalDamage
} from "./index";
import { getDamageCapPerAttack, getDamageCapPerSpell } from "./unit-abilities";
import type { CombatUnitState, GameAction, GameEvent, GameState, PlayerId } from "./state";

/**
 * Fuyuki Casters — engine-enforced buffs:
 *   • elemental-damage (attack cannot be raised by attack cards / Attack tokens)
 *   • casters-damage-cap (≤1 damage from each single attack OR Spell)
 *   • magi-power-boost (kept Leycraft)
 *
 * Each claim fails if its wiring is removed; CONTROLs prove the opposite.
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

function settle(state: GameState): GameState {
  let current = state;
  let safety = 60;
  while (safety > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
    safety -= 1;
    if (current.reactionWindow) {
      current = passAllReactions(current);
      continue;
    }
    const choice = current.pendingChoice;
    if (choice?.type === "ATTACK_DIE_REROLL") {
      current = applyOk(current, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: choice.playerId,
        choiceId: choice.id,
        candidateIndex: 0
      });
    }
  }
  return current;
}

function unitWith(abilities: string[]): CombatUnitState {
  return { abilities } as CombatUnitState;
}

function setActive(state: GameState, playerId: PlayerId, unitId: string): void {
  state.activePlayerId = playerId;
  state.combat!.activeUnitId = unitId;
}

function rangedDuel(options: {
  attackerAttack?: number;
  defenderAbilities?: string[];
  rolls: number[];
}): GameState {
  const state = createInitialGameState("fuyuki-casters-attack-seed");
  const attacker = state.combat!.units.unit_p1_marksmen;
  attacker.abilities = [];
  attacker.attack = options.attackerAttack ?? 10;
  attacker.position = 1;

  const defender = state.combat!.units.unit_p2_skeletons;
  defender.abilities = options.defenderAbilities ?? [];
  defender.position = 13;
  defender.defense = 0;
  defender.maxHealth = 20;
  defender.damage = 0;

  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.combat!.dice.scriptedRolls = options.rolls;
  state.combat!.dice.rollCount = 0;
  setActive(state, "p1", "unit_p1_marksmen");

  return settle(
    applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_skeletons"
    })
  );
}

describe("Fuyuki Casters — shipped ability tags", () => {
  it("Few and Pack carry elemental-damage, casters-damage-cap, and magi-power-boost", () => {
    const def = coreUnitDefinitions["fuyuki.casters"];
    expect(def).toBeDefined();
    for (const side of [def.few!, def.pack!]) {
      expect(side.abilities).toEqual(
        expect.arrayContaining(["elemental-damage", "casters-damage-cap", "magi-power-boost"])
      );
      expect(side.abilities).not.toContain("reduce-spell-damage-1");
      for (const id of side.abilities) {
        expect(unitAbilities[id]?.implementationStatus, id).toBe("implemented");
      }
    }
  });

  it("casters-damage-cap is a 1-damage attack+spell hard cap", () => {
    expect(unitAbilities["casters-damage-cap"].effect).toMatchObject({
      type: "CAP_DAMAGE_PER_ATTACK",
      amount: 1,
      includeSpells: true
    });
  });
});

describe("Fuyuki Casters — elemental damage", () => {
  it("reads as an elemental-damage dealer (CONTROL: plain unit does not)", () => {
    const state = createInitialGameState("fuyuki-casters-elemental-read");
    const unit = state.combat!.units.unit_p1_marksmen;
    unit.abilities = ["elemental-damage"];
    expect(unitDealsElementalDamage(state, unit)).toBe(true);
    unit.abilities = [];
    expect(unitDealsElementalDamage(state, unit)).toBe(false);
    unit.abilities = ["magi-power-boost"];
    expect(unitDealsElementalDamage(state, unit)).toBe(false);
  });
});

describe("Fuyuki Casters — Leyline Barrier (damage cap 1)", () => {
  it("getDamageCapPerAttack / getDamageCapPerSpell report amount 1", () => {
    expect(getDamageCapPerAttack(unitWith(["casters-damage-cap"]))?.amount).toBe(1);
    expect(getDamageCapPerSpell(unitWith(["casters-damage-cap"]))?.amount).toBe(1);
    expect(getDamageCapPerSpell(unitWith(["nix-damage-cap"]))).toBeNull(); // Nix spells uncapped
    expect(getDamageCapPerAttack(unitWith([]))).toBeNull();
  });

  it("clamps a single attack to 1 damage (CONTROL: without the ability full damage lands)", () => {
    const capped = rangedDuel({ attackerAttack: 10, defenderAbilities: ["casters-damage-cap"], rolls: [0] });
    expect(capped.combat!.units.unit_p2_skeletons.damage).toBe(1);
    expect(
      capped.eventLog.some(
        (event: GameEvent) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "casters-damage-cap"
      )
    ).toBe(true);

    const control = rangedDuel({ attackerAttack: 10, defenderAbilities: [], rolls: [0] });
    expect(control.combat!.units.unit_p2_skeletons.damage).toBe(10);
  });

  it("does not change a hit that is already ≤1", () => {
    const next = rangedDuel({ attackerAttack: 1, defenderAbilities: ["casters-damage-cap"], rolls: [0] });
    expect(next.combat!.units.unit_p2_skeletons.damage).toBe(1);
    expect(
      next.eventLog.some(
        (event: GameEvent) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "casters-damage-cap"
      )
    ).toBe(false);
  });

  function castImplosionAt(targetAbilities: string[], power: number): number {
    const state = createInitialGameState(`fuyuki-casters-implosion-${power}-${targetAbilities.join(",") || "none"}`);
    state.players.p1.hand = ["spell.implosion", "stat.power", "stat.power"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    const target = state.combat!.units.unit_p2_skeletons;
    target.abilities = targetAbilities;
    target.maxHealth = 30;
    target.damage = 0;
    const cast = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.implosion" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p2_skeletons"
    );
    expect(cast, "Implosion should be legal").toBeTruthy();
    const casted = applyOk(state, cast!.action);
    casted.stack[0]!.modifiers.spellPowerBonus = power;
    casted.players.p1.hand = [];
    return passAllReactions(casted).combat!.units.unit_p2_skeletons.damage;
  }

  it("clamps a single Spell hit to 1 (CONTROL: plain unit takes full Implosion)", () => {
    // Power 3 Implosion deals 4 without a cap (wiki ladder).
    expect(castImplosionAt([], 3)).toBe(4);
    expect(castImplosionAt(["casters-damage-cap"], 3)).toBe(1);
  });

  it("CONTROL: Nix Hardened Shell still leaves Spell damage uncapped", () => {
    expect(getDamageCapPerSpell(unitWith(["nix-damage-cap"]))).toBeNull();
    // Same Implosion that Casters clamp to 1 still lands full 4 through Nix.
    expect(castImplosionAt(["nix-damage-cap"], 3)).toBe(4);
  });
});

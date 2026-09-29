import { describe, expect, it } from "vitest";

import { getActiveAttackBonus, hasActiveIgnoresDefense } from "./active-effects";
import { makeCombatUnitFromArmy } from "./adventure";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { getAttackRollMode } from "./legal-actions";
import type { CombatUnitState, GameAction, GameState } from "./state";

/**
 * Jabarkas (Stronghold, Orcs specialist) — USER RULINGS 2026-09-29:
 *  I  — your Orcs ignore the ADJACENT ranged combat penalty and get +1 Attack
 *       when the target is adjacent; the long-range penalty stays.
 *  IV — the selected unit's Health +1 this Combat, doubled for Orcs.
 *  VI — your Orcs ignore enemy Defense when the target is adjacent.
 * Board (4x5): Orcs at 9 are adjacent to the Skeletons at 13, not to the
 * Vampires at 14; from the back row (1) they shoot the Dread Knights at 18
 * back-row-to-back-row (the long-range penalty).
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAll(state: GameState): GameState {
  let current = state;
  let safety = 30;
  while (safety-- > 0 && current.reactionWindow) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function orcsCombat(seed: string, hand: string[], orcsPosition = 9): GameState {
  const state = createInitialGameState(seed);
  const units = state.combat!.units;
  delete units.unit_p1_marksmen;
  const orcs = makeCombatUnitFromArmy(
    { id: "army_orcs", unitDefId: "stronghold.orcs", side: "pack" },
    "p1",
    "unit_p1_orcs",
    orcsPosition,
    "binh",
  );
  if (!orcs) throw new Error("Orcs definition missing");
  units.unit_p1_orcs = orcs;
  for (const unit of Object.values(units)) {
    unit.activatedThisRound = false;
    unit.attackedThisActivation = false;
    unit.movedThisActivation = false;
  }
  state.players.p1.hand = [...hand];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_orcs";
  return state;
}

function play(state: GameState, cardId: string, targetUnitId?: string): GameState {
  const legal = getLegalActions(state, "p1").find(
    (candidate) =>
      candidate.action.type === "PLAY_CARD" &&
      candidate.action.cardId === cardId &&
      (targetUnitId === undefined ||
        (candidate.action.target?.type === "unit" && candidate.action.target.unitId === targetUnitId)),
  );
  expect(legal, `${cardId} should be playable`).toBeTruthy();
  return applyOk(state, legal!.action);
}

const unitsOf = (state: GameState) => state.combat!.units as Record<string, CombatUnitState>;

/** Damage the Skeletons take from one Orcs strike with the scripted Attack dice. */
function strikeSkeletons(state: GameState, rolls: number[]): number {
  const units = unitsOf(state);
  units.unit_p2_skeletons.maxHealth = 20;
  units.unit_p2_skeletons.damage = 0;
  state.combat!.dice.scriptedRolls = rolls;
  state.combat!.dice.rollCount = 0;
  const next = passAll(
    applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_orcs", defenderId: "unit_p2_skeletons" }),
  );
  return unitsOf(next).unit_p2_skeletons.damage;
}

describe("Jabarkas Orcs I — no adjacent penalty, +1 Attack vs an adjacent target", () => {
  it("waives only the adjacent penalty and adds +1 Attack only against an adjacent target", () => {
    const before = orcsCombat("jab-1-before", ["specialty.jabarkas.1"]);
    const u0 = unitsOf(before);
    expect(getAttackRollMode(u0.unit_p1_orcs, u0.unit_p2_skeletons, before), "CONTROL: adjacent shooter penalty").toBe("disadvantage");

    const after = play(before, "specialty.jabarkas.1");
    const u = unitsOf(after);
    expect(getAttackRollMode(u.unit_p1_orcs, u.unit_p2_skeletons, after)).toBe("normal");
    expect(getActiveAttackBonus(after, { attacker: u.unit_p1_orcs, defender: u.unit_p2_skeletons, attackKind: "melee" })).toBe(1);
    expect(
      getActiveAttackBonus(after, { attacker: u.unit_p1_orcs, defender: u.unit_p2_vampires, attackKind: "ranged" }),
      "no bonus against a non-adjacent target",
    ).toBe(0);
    // Only the Orcs: another friendly unit gets nothing.
    expect(getActiveAttackBonus(after, { attacker: u.unit_p1_crusaders, defender: u.unit_p2_skeletons, attackKind: "melee" })).toBe(0);
  });

  it("keeps the long-range (back row to back row) penalty", () => {
    const state = play(orcsCombat("jab-1-long", ["specialty.jabarkas.1"], 1), "specialty.jabarkas.1");
    const u = unitsOf(state);
    expect(getAttackRollMode(u.unit_p1_orcs, u.unit_p2_dread_knights, state)).toBe("disadvantage");
  });

  it("an adjacent strike rolls one die at +1 Attack (observable damage vs CONTROL)", () => {
    // Dice [0, -1]: the penalised CONTROL keeps the lower (-1); Orcs I rolls one die (0).
    const control = strikeSkeletons(orcsCombat("jab-1-hit-off", []), [0, -1]);
    const boosted = strikeSkeletons(play(orcsCombat("jab-1-hit-on", ["specialty.jabarkas.1"]), "specialty.jabarkas.1"), [0, -1]);
    expect(boosted - control, "+1 from the die, +1 Attack").toBe(2);
  });
});

describe("Jabarkas Orcs IV — +1 Health, doubled for the Orcs", () => {
  it("gives the Orcs +2 and any other unit +1", () => {
    const state = orcsCombat("jab-4", ["specialty.jabarkas.4"]);
    const orcsHp = unitsOf(state).unit_p1_orcs.maxHealth;
    expect(unitsOf(play(state, "specialty.jabarkas.4", "unit_p1_orcs")).unit_p1_orcs.maxHealth).toBe(orcsHp + 2);
    const other = orcsCombat("jab-4-other", ["specialty.jabarkas.4"]);
    const crusadersHp = unitsOf(other).unit_p1_crusaders.maxHealth;
    expect(unitsOf(play(other, "specialty.jabarkas.4", "unit_p1_crusaders")).unit_p1_crusaders.maxHealth).toBe(crusadersHp + 1);
  });
});

describe("Jabarkas Orcs VI — ignore Defense against an adjacent target", () => {
  it("ignores Defense only when the target is adjacent, and only for the Orcs", () => {
    const state = play(orcsCombat("jab-6", ["specialty.jabarkas.6"]), "specialty.jabarkas.6");
    const u = unitsOf(state);
    expect(hasActiveIgnoresDefense(state, u.unit_p1_orcs, u.unit_p2_skeletons)).toBe(true);
    expect(hasActiveIgnoresDefense(state, u.unit_p1_orcs, u.unit_p2_vampires), "non-adjacent target").toBe(false);
    expect(hasActiveIgnoresDefense(state, u.unit_p1_crusaders, u.unit_p2_skeletons), "not an Orcs unit").toBe(false);
  });

  it("the adjacent strike deals the Skeletons' Defense more damage (observable vs CONTROL)", () => {
    const control = strikeSkeletons(orcsCombat("jab-6-hit-off", []), [0, 0]);
    const pierced = strikeSkeletons(play(orcsCombat("jab-6-hit-on", ["specialty.jabarkas.6"]), "specialty.jabarkas.6"), [0, 0]);
    const skeletonsDefense = unitsOf(orcsCombat("jab-6-def", [])).unit_p2_skeletons.defense;
    expect(skeletonsDefense).toBeGreaterThan(0);
    expect(pierced - control).toBe(skeletonsDefense);
  });
});

import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState } from "./state";

/**
 * Korbac's Dragon Flies IV (permanent): "After your unit attacks and the enemy
 * unit survives, immediately start a turn with your Dragon Flies, even if they
 * already acted this round." USER 2026-09-26: a defender that is still on the
 * board survived — a Pack→Few flip or a lost (Creature Bank) Stack Token still
 * counts — and it must keep working in every later attack / combat.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passWindows(state: GameState): GameState {
  let next = state;
  for (let guard = 0; guard < 20 && (next.reactionWindow || next.pendingChoice); guard += 1) {
    const pass = (["p1", "p2"] as const)
      .flatMap((playerId) => getLegalActions(next, playerId))
      .find((legal) => legal.action.type === "PASS_REACTION");
    if (!pass) break;
    next = applyOk(next, pass.action);
  }
  return next;
}

type DefenderSetup = { variant?: "few" | "pack"; maxHealth?: number; stackToken?: boolean; retaliated?: boolean };

function board(withKorbac: boolean, defender: DefenderSetup = {}): GameState {
  const state = createInitialGameState("korbac-iv-seed");
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.players.p1.permanents = withKorbac ? ["specialty.korbac.4"] : [];
  const units = state.combat!.units;
  const marksmen = units.unit_p1_marksmen;
  marksmen.position = 14;
  marksmen.type = "ground";
  marksmen.attack = 1;
  marksmen.defense = 0;
  marksmen.maxHealth = 20;
  marksmen.abilities = [];
  marksmen.activatedThisRound = false;
  marksmen.attackedThisActivation = false;
  // The Dragon Flies: p1's Griffins stand in (already acted this round).
  const flies = units.unit_p1_griffins;
  flies.unitDefId = "fortress.dragon_flies";
  flies.cardName = "Dragon Flies";
  flies.position = 0;
  flies.activatedThisRound = true;
  units.unit_p1_crusaders.position = 1;
  const target = units.unit_p2_skeletons;
  target.position = 13;
  target.attack = 1;
  target.defense = 0;
  target.abilities = [];
  target.variant = defender.variant ?? "few";
  target.maxHealth = defender.maxHealth ?? 30;
  if (defender.stackToken) target.stackToken = "health";
  if (defender.retaliated) target.retaliatedThisRound = true;
  units.unit_p2_vampires.position = 10;
  units.unit_p2_dread_knights.position = 9;
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = marksmen.id;
  state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0, 0, 0];
  state.combat!.dice.rollCount = 0;
  return state;
}

const attack: GameAction = { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" };

function afterAttack(state: GameState): GameState {
  return passWindows(applyOk(state, attack));
}

describe("Korbac's Dragon Flies IV", () => {
  it.each<[string, DefenderSetup]>([
    ["a plain survivor", {}],
    ["a survivor that already retaliated this round", { retaliated: true }],
    ["a Pack flipped to its Few side", { variant: "pack", maxHealth: 1 }],
    ["a unit that lost its Stack Token", { maxHealth: 1, stackToken: true }]
  ])("starts a Dragon Flies turn after %s (CONTROL: no permanent → no turn)", (_label, setup) => {
    const withKorbac = afterAttack(board(true, setup));
    const target = withKorbac.combat!.units.unit_p2_skeletons;
    expect(target.damage < target.maxHealth, "the defender survived").toBe(true);
    expect(withKorbac.combat!.activeUnitId).toBe("unit_p1_griffins");
    expect(withKorbac.combat!.units.unit_p1_griffins.activatedThisRound).toBe(false);

    const control = afterAttack(board(false, setup));
    expect(control.combat!.activeUnitId).not.toBe("unit_p1_griffins");
  });
});

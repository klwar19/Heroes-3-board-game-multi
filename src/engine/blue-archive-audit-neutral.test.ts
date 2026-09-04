import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, NEUTRAL_PLAYER_ID } from "./index";
import type { CombatUnitState, GameAction, GameState } from "./state";

/**
 * Blue Archive audit (2026-09-03): a Kivotos unit can be NEUTRAL-owned — a
 * classic-theme Calamity Wave from wave 2 may arrive as a faction WARBAND drawn
 * from every playable faction (adventure.ts `drawWaveArmy`), Blue Archive
 * included. Yuuka's Calculated Cover used to open a "combat-step" OPTION_CHOICE
 * owned by the NEUTRAL seat after the guard's own attack; no seat can answer it
 * and no neutral auto-resolver exists for that context, so the table froze.
 * The fix declines the optional reposition for a neutral attacker. This spec
 * drives a real one-guard neutral fight and asserts the fight keeps flowing.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function neutralFightWithGuard(reshape: (guard: CombatUnitState) => void): GameState {
  let state = createAdventureGameState({ seed: "ba-neutral-yuuka", difficulty: "normal", rollFirstPlayer: false });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  state = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:9:1" });
  const armyUnit = state.players.p1.army[0];
  state = applyOk(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: armyUnit.id, position: 13 });
  for (const unit of Object.values(state.combat!.units)) {
    unit.initiative = 99;
  }
  state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
  const guard = Object.values(state.combat!.units).find((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)!;
  reshape(guard);
  return state;
}

const guardOf = (state: GameState): CombatUnitState =>
  Object.values(state.combat!.units).find((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)!;
const preyOf = (state: GameState): CombatUnitState =>
  Object.values(state.combat!.units).find((unit) => unit.controllerId === "p1")!;

/** Drives p1's Defends / passes / pre-activation pauses until the guard has attacked. */
function driveUntilGuardAttacked(state: GameState): GameState {
  for (let safety = 40; safety > 0; safety -= 1) {
    if (guardOf(state).attackedThisActivation || !state.combat) {
      return state;
    }
    if (state.reactionWindow) {
      state = applyOk(state, { type: "PASS_REACTION", playerId: state.reactionWindow.priorityPlayerId });
      continue;
    }
    const pre = state.combat.pendingNeutralStep;
    if (pre?.kind === "pre-activation") {
      state = applyOk(state, { type: "CONTINUE_NEUTRAL_STEP", playerId: pre.reactingPlayerId ?? "p1" });
      continue;
    }
    const active = state.combat.activeUnitId ? state.combat.units[state.combat.activeUnitId] : null;
    if (active && active.controllerId === "p1" && !state.pendingChoice) {
      state = applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: active.id });
      continue;
    }
    break;
  }
  return state;
}

describe("Blue Archive audit — a NEUTRAL-owned Yuuka never strands the table", () => {
  it("Calculated Cover on a neutral guard declines the reposition instead of opening an unanswerable choice", () => {
    const initial = neutralFightWithGuard((guard) => {
      guard.type = "ground";
      guard.abilities = ["kivotos-calculated-cover"];
      guard.attack = 6; // a real hit, so the post-attack follow-up really runs
      guard.maxHealth = 30;
      guard.damage = 0;
      guard.initiative = 1;
      guard.position = 9; // adjacent to the prey at 13
    });
    // The prey must SURVIVE the blow, or the combat ends before any follow-up runs.
    preyOf(initial).maxHealth = 30;
    preyOf(initial).damage = 0;
    const state = driveUntilGuardAttacked(initial);
    const guard = guardOf(state);
    const prey = preyOf(state);

    // The guard really struck (the ability's trigger fired) ...
    expect(guard.attackedThisActivation, "the neutral Yuuka attacked").toBe(true);
    expect(prey.damage).toBeGreaterThan(0);
    // ... and nothing is parked on the seat nobody can play.
    expect(state.pendingChoice?.playerId).not.toBe(NEUTRAL_PLAYER_ID);
    expect(
      state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context === "combat-step",
      "no combat-step reposition choice may be open after a neutral attack"
    ).toBe(false);
    // The guard did not move either — declining is a stay, not a hidden step.
    expect(guard.position).toBe(9);
  });

  it("CONTROL: a player-owned Yuuka still gets the optional reposition after her attack", () => {
    const state = createAdventureGameState({ seed: "ba-neutral-yuuka-control", difficulty: "normal", rollFirstPlayer: false });
    let current = state;
    if (current.players.p1.needsHandRefresh || current.players.p1.canMulligan) {
      current = applyOk(current, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    current = applyOk(current, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:9:1" });
    const armyUnit = current.players.p1.army[0];
    current = applyOk(current, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: armyUnit.id, position: 13 });
    for (const unit of Object.values(current.combat!.units)) {
      unit.initiative = unit.controllerId === "p1" ? 99 : 1;
    }
    current = applyOk(current, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
    const yuuka = preyOf(current);
    const guard = guardOf(current);
    yuuka.abilities = ["kivotos-calculated-cover"];
    yuuka.type = "ground";
    guard.position = 9;
    guard.maxHealth = 30;
    guard.damage = 0;
    for (let safety = 10; safety > 0 && current.combat?.pendingNeutralStep; safety -= 1) {
      current = applyOk(current, { type: "CONTINUE_NEUTRAL_STEP", playerId: "p1" });
    }
    expect(current.combat!.activeUnitId).toBe(yuuka.id);
    current = applyOk(current, { type: "ATTACK_UNIT", playerId: "p1", attackerId: yuuka.id, defenderId: guard.id });
    for (let safety = 20; safety > 0 && current.reactionWindow; safety -= 1) {
      current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
    }
    expect(current.pendingChoice).toMatchObject({ type: "OPTION_CHOICE", context: "combat-step", playerId: "p1" });
  });
});

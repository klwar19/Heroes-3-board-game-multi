import { describe, expect, it } from "vitest";
import { isAdjacent } from "./battlefield";
import { applyAction, createAdventureGameState, NEUTRAL_PLAYER_ID } from "./index";
import { planNeutralActivation } from "./neutral-ai";
import type { CombatUnitState, GameAction, GameState } from "./state";

/**
 * Regression: a NEUTRAL guard (monster) that MOVES onto/through a battlefield
 * token — most importantly a Fire Wall (e.g. Luna's specialty, or the Fire Wall
 * spell) — must be burned exactly like a player-controlled unit is. The neutral
 * activation used to set `unit.position` directly, bypassing the token walk, so a
 * monster "moved in, showed the token, and lost NO HP at all". Both neutral
 * movement paths (plain move, and move-and-attack) now walk the tokens.
 *
 * Each test asserts the OBSERVABLE outcome — the guard's HP dropping — and fails
 * if the token-walk wiring is removed (the guard's damage stays 0). The board is
 * 4 columns × 5 rows (position = row * 4 + column).
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Sets up a one-guard neutral fight with the player's unit deployed at 13. */
function neutralFightWithGuard(reshape: (guard: CombatUnitState) => void): GameState {
  let state = createAdventureGameState({ seed: "neutral-fire-wall", difficulty: "normal", rollFirstPlayer: false });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  state = applyOk(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: "h:9:1" });
  const armyUnit = state.players.p1.army[0];
  state = applyOk(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: armyUnit.id, position: 13 });
  // The player unit acts first (frozen high initiative) so the guard still sits
  // on its starting space when its own activation comes up.
  for (const unit of Object.values(state.combat!.units)) {
    unit.initiative = 99;
  }
  state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
  const guard = Object.values(state.combat!.units).find((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)!;
  reshape(guard);
  return state;
}

function guardOf(state: GameState): CombatUnitState {
  return Object.values(state.combat!.units).find((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)!;
}
function preyOf(state: GameState): CombatUnitState {
  return Object.values(state.combat!.units).find((unit) => unit.controllerId === "p1")!;
}

/**
 * Drives p1's defends and pre-activation pauses until `predicate` holds (e.g. a
 * destination choice opens, or the guard has moved) or the fight settles.
 */
function driveUntil(state: GameState, predicate: (state: GameState) => boolean): GameState {
  let safety = 40;
  while (safety > 0) {
    safety -= 1;
    if (predicate(state)) {
      return state;
    }
    if (
      state.pendingChoice?.type === "OPTION_CHOICE" &&
      state.pendingChoice.context === "neutral-destination"
    ) {
      return state;
    }
    if (state.reactionWindow) {
      state = applyOk(state, { type: "PASS_REACTION", playerId: state.reactionWindow.priorityPlayerId });
      continue;
    }
    const pre = state.combat?.pendingNeutralStep;
    if (pre?.kind === "pre-activation") {
      state = applyOk(state, { type: "CONTINUE_NEUTRAL_STEP", playerId: pre.reactingPlayerId ?? "p1" });
      continue;
    }
    const active = state.combat?.activeUnitId ? state.combat.units[state.combat.activeUnitId] : null;
    if (active && active.controllerId === "p1" && !state.pendingChoice) {
      state = applyOk(state, { type: "DEFEND_UNIT", playerId: "p1", unitId: active.id });
      continue;
    }
    break;
  }
  return state;
}

describe("a neutral guard is burned by a Fire Wall when it MOVES (regression)", () => {
  it("move-and-attack: a monster that moves in over a Fire Wall LOSES HP, then attacks", () => {
    let state = neutralFightWithGuard((guard) => {
      guard.type = "ground";
      guard.abilities = [];
      guard.attack = 1;
      guard.maxHealth = 30; // survives the burn so we observe HP loss, not removal
      guard.damage = 0;
      guard.initiative = 1; // acts after the player unit
      guard.position = 5; // cell 9 (a prey-neighbour) is one step below it
    });
    const prey = preyOf(state);
    prey.maxHealth = 30;
    prey.damage = 0;
    prey.attack = 0; // its retaliation deals 0, isolating the wall's burn on the guard
    state.combat!.dice.scriptedRolls = Array(30).fill(0);
    state.combat!.dice.rollCount = 0;

    // A Fire Wall (2 damage) sits on cell 9 — a landing cell adjacent to the prey.
    state.combat!.battlefieldTokens = [
      { id: "fw_move_attack", kind: "fire_wall", position: 9, controllerId: "p1", damage: 2 }
    ];

    state = driveUntil(state, () => false);
    const choice = state.pendingChoice;
    expect(choice?.type, "the guard must be offered where to move to attack").toBe("OPTION_CHOICE");
    if (choice?.type !== "OPTION_CHOICE") {
      return;
    }
    expect(choice.context).toBe("neutral-destination");
    const cells = choice.neutralDestination!.positions;
    const wallIndex = cells.indexOf(9);
    expect(wallIndex, "cell 9 (the Fire Wall) is a legal landing cell").toBeGreaterThanOrEqual(0);
    expect(guardOf(state).damage, "unburned before it moves").toBe(0);

    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: wallIndex });

    const guard = guardOf(state);
    // The observable outcome: the guard LOST HP to the wall (before the fix its
    // position was set directly, so it took none).
    expect(guard.position).toBe(9);
    expect(guard.damage).toBe(2);
    // The wall really fired at THIS guard for its full damage.
    expect(
      state.eventLog.some(
        (event) =>
          event.type === "BATTLEFIELD_TOKEN_TRIGGERED" &&
          event.kind === "fire_wall" &&
          event.unitId === guard.id &&
          event.amount === 2
      )
    ).toBe(true);
    // ...and, surviving, it still attacked its fixed target.
    expect(
      state.eventLog.some((event) => event.type === "UNIT_ATTACK_DECLARED" && event.defenderId === prey.id)
    ).toBe(true);
  });

  it("plain move: a monster that cannot reach its prey is still burned stepping onto a wall", () => {
    let state = neutralFightWithGuard((guard) => {
      guard.type = "ground";
      guard.abilities = [];
      guard.maxHealth = 30;
      guard.damage = 0;
      guard.initiative = 1;
      guard.position = 1;
    });
    // Park the prey far away and impossible to reach this turn, so the guard just
    // MOVES toward it (a "move" intent, no attack — hence no retaliation to muddy
    // the burn). Its move destination is whatever the AI picks; we place the wall
    // exactly there so the guard is burned wherever it stops.
    const prey = preyOf(state);
    prey.position = 19;
    const guard = guardOf(state);
    const intent = planNeutralActivation(state, state.combat!, guard);
    expect(intent.kind, "an unreachable prey means a plain move, not an attack").toBe("move");
    if (intent.kind !== "move") {
      return;
    }
    expect(isAdjacent(intent.destination, prey.position), "the guard cannot reach the prey to attack").toBe(false);

    state.combat!.battlefieldTokens = [
      { id: "fw_move", kind: "fire_wall", position: intent.destination, controllerId: "p1", damage: 3 }
    ];
    state.combat!.dice.scriptedRolls = Array(20).fill(0);
    state.combat!.dice.rollCount = 0;

    state = driveUntil(state, (s) => guardOf(s).damage > 0);

    const moved = guardOf(state);
    expect(moved.position).toBe(intent.destination);
    expect(moved.damage).toBe(3); // burned for the wall's full damage, nothing else
    expect(
      state.eventLog.some(
        (event) =>
          event.type === "BATTLEFIELD_TOKEN_TRIGGERED" &&
          event.kind === "fire_wall" &&
          event.unitId === moved.id &&
          event.amount === 3
      )
    ).toBe(true);
  });

  it("CONTROL: with no Fire Wall on its path the same guard takes no move damage", () => {
    let state = neutralFightWithGuard((guard) => {
      guard.type = "ground";
      guard.abilities = [];
      guard.maxHealth = 30;
      guard.damage = 0;
      guard.initiative = 1;
      guard.position = 1;
    });
    const prey = preyOf(state);
    prey.position = 19;
    const guard = guardOf(state);
    const intent = planNeutralActivation(state, state.combat!, guard);
    expect(intent.kind).toBe("move");
    // No tokens on the board at all.
    state.combat!.battlefieldTokens = [];
    state.combat!.dice.scriptedRolls = Array(20).fill(0);
    state.combat!.dice.rollCount = 0;

    state = driveUntil(state, (s) => guardOf(s).movedThisActivation);

    const moved = guardOf(state);
    expect(moved.movedThisActivation).toBe(true);
    expect(moved.damage).toBe(0);
  });
});

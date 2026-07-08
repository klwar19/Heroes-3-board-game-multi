import { describe, expect, it } from "vitest";
import { isAdjacent } from "./battlefield";
import { applyAction, createAdventureGameState, createInitialGameState, NEUTRAL_PLAYER_ID } from "./index";
import { planNeutralActivation } from "./neutral-ai";
import type { CombatUnitState, GameAction, GameState, UnitGrade, UnitType } from "./state";

/**
 * BINH house rule (engine-enforced; every test fails if its wiring is removed):
 * when a neutral guard must MOVE to reach the target it will attack and several
 * legal cells reach it, the attacking player picks which cell it lands on. It
 * still attacks the rules-fixed target (target selection is unchanged) — only
 * the landing cell becomes the player's choice. This composes with the existing
 * "the player breaks a target tie" choice: pick the target, then the cell.
 *
 * The board is 4 columns × 5 rows (position = row * 4 + column); ground units
 * move up to 3 spaces on an obstacle-free field. (Same model as
 * neutral-must-attack.test.ts.)
 */

// ---------------------------------------------------------------------------
// Unit level: the planNeutralActivation intent
// ---------------------------------------------------------------------------

function place(
  state: GameState,
  id: string,
  controllerId: string,
  grade: UnitGrade,
  type: UnitType,
  position: number
): CombatUnitState {
  const unit = state.combat!.units[id];
  if (!unit) {
    throw new Error(`scenario expects unit ${id} in the initial combat`);
  }
  unit.controllerId = controllerId;
  unit.grade = grade;
  unit.type = type;
  unit.position = position;
  unit.activatedThisRound = false;
  unit.movedThisActivation = false;
  unit.attackedThisActivation = false;
  return unit;
}

function onlyUnits(state: GameState, units: CombatUnitState[], obstacles: number[] = []): void {
  const map: Record<string, CombatUnitState> = {};
  for (const unit of units) {
    map[unit.id] = unit;
  }
  state.combat!.units = map;
  state.combat!.obstacles = obstacles;
}

describe("neutral move-to-attack destination choice (intent)", () => {
  it("offers the player the destination when several legal cells reach the target", () => {
    const state = createInitialGameState("neutral-dest-many");
    const guard = place(state, "unit_p2_skeletons", NEUTRAL_PLAYER_ID, "bronze", "ground", 0);
    // A single lone enemy three spaces away: the guard must step next to it, and
    // more than one legal cell is adjacent-and-reachable.
    const prey = place(state, "unit_p1_griffins", "p1", "bronze", "ground", 9);
    onlyUnits(state, [guard, prey]);

    const intent = planNeutralActivation(state, state.combat!, guard);

    expect(intent.kind).toBe("choose-destination");
    if (intent.kind === "choose-destination") {
      // The target is fixed by the rules; only the cell is the player's choice.
      expect(intent.defenderId).toBe(prey.id);
      expect(intent.destinations.length).toBeGreaterThan(1);
      // Every offered cell is a real attack space adjacent to the prey.
      expect(intent.destinations.every((cell) => isAdjacent(cell, prey.position))).toBe(true);
    }
  });

  it("CONTROL: with only ONE legal landing cell it moves-and-attacks directly (no prompt)", () => {
    const state = createInitialGameState("neutral-dest-one");
    // Guard at the top edge (col 3), prey in the opposite-top corner (0). Only
    // cell 1 is BOTH adjacent to the prey AND within the guard's 3-space reach;
    // cell 4 (the prey's other neighbour) is 4 steps away — unreachable. So there
    // is exactly one legal landing cell and no choice is offered.
    const guard = place(state, "unit_p2_skeletons", NEUTRAL_PLAYER_ID, "bronze", "ground", 3);
    const prey = place(state, "unit_p1_griffins", "p1", "bronze", "ground", 0);
    onlyUnits(state, [guard, prey]);

    const intent = planNeutralActivation(state, state.combat!, guard);

    expect(intent.kind).toBe("move-and-attack");
    if (intent.kind === "move-and-attack") {
      expect(intent.defenderId).toBe(prey.id);
      expect(intent.destination).toBe(1);
      expect(isAdjacent(intent.destination, prey.position)).toBe(true);
    }
  });

  it("CONTROL: an already-adjacent guard just attacks — no move, no destination prompt", () => {
    const state = createInitialGameState("neutral-dest-adjacent");
    const guard = place(state, "unit_p2_skeletons", NEUTRAL_PLAYER_ID, "bronze", "ground", 0);
    const prey = place(state, "unit_p1_griffins", "p1", "bronze", "ground", 1); // adjacent
    onlyUnits(state, [guard, prey]);

    const intent = planNeutralActivation(state, state.combat!, guard);
    expect(intent).toEqual({ kind: "attack", defenderId: prey.id });
  });

  it("commits to a forced destination (the player's pick) rather than re-offering it", () => {
    const state = createInitialGameState("neutral-dest-forced");
    const guard = place(state, "unit_p2_skeletons", NEUTRAL_PLAYER_ID, "bronze", "ground", 0);
    const prey = place(state, "unit_p1_griffins", "p1", "bronze", "ground", 9);
    onlyUnits(state, [guard, prey]);

    // First plan surfaces the choice; then the player's forced cell is honoured.
    const open = planNeutralActivation(state, state.combat!, guard);
    expect(open.kind).toBe("choose-destination");
    const cells = open.kind === "choose-destination" ? open.destinations : [];
    const chosen = cells[cells.length - 1]; // a non-default cell

    const forced = planNeutralActivation(state, state.combat!, guard, prey.id, chosen);
    expect(forced).toEqual({ kind: "move-and-attack", destination: chosen, defenderId: prey.id });
  });
});

// ---------------------------------------------------------------------------
// Obstacles (ground must path around; flyers pass over) and ranged (no prompt)
// ---------------------------------------------------------------------------

/**
 * Scenario: guard at 2, prey at 10, one Combat Obstacle at 6 (a neighbour of the
 * prey). Cells 9 and 11 (prey neighbours) are reachable by BOTH ground and flying;
 * cell 6 is a neighbour too but nobody may LAND on an obstacle; cell 14 (the
 * fourth neighbour) is reachable ONLY by a flyer crossing the obstacle. So the
 * obstacle changes what a GROUND guard is offered, while a FLYER reaches past it.
 */
describe("neutral destination choice respects obstacles (ground) and flight", () => {
  it("a GROUND guard's offer drops an obstacle cell — the choice is obstacle-aware", () => {
    // No obstacle: cell 6 (a reachable prey-neighbour) IS among the offers.
    const open = createInitialGameState("neutral-dest-ground-open");
    const g1 = place(open, "unit_p2_skeletons", NEUTRAL_PLAYER_ID, "bronze", "ground", 2);
    const p1 = place(open, "unit_p1_griffins", "p1", "bronze", "ground", 10);
    onlyUnits(open, [g1, p1], []);
    const openIntent = planNeutralActivation(open, open.combat!, g1);
    expect(openIntent.kind).toBe("choose-destination");
    const openCells = openIntent.kind === "choose-destination" ? openIntent.destinations : [];
    expect(openCells, "cell 6 is a legal landing spot with no obstacle").toContain(6);

    // Obstacle on cell 6: it is no longer a legal landing spot, so the offer omits
    // it — the same guard/prey, only the obstacle changed the destinations.
    const blocked = createInitialGameState("neutral-dest-ground-blocked");
    const g2 = place(blocked, "unit_p2_skeletons", NEUTRAL_PLAYER_ID, "bronze", "ground", 2);
    const p2 = place(blocked, "unit_p1_griffins", "p1", "bronze", "ground", 10);
    onlyUnits(blocked, [g2, p2], [6]);
    const blockedIntent = planNeutralActivation(blocked, blocked.combat!, g2);
    expect(blockedIntent.kind).toBe("choose-destination");
    if (blockedIntent.kind === "choose-destination") {
      expect(blockedIntent.destinations, "no offered cell is the obstacle").not.toContain(6);
      // Every offered cell is still adjacent to the prey and none is the obstacle.
      expect(blockedIntent.destinations.every((cell) => isAdjacent(cell, p2.position))).toBe(true);
      // The offer genuinely shrank because of the obstacle (subset of the open one).
      expect(blockedIntent.destinations.every((cell) => openCells.includes(cell))).toBe(true);
      expect(blockedIntent.destinations.length).toBeLessThan(openCells.length);
    }
  });

  it("a FLYING guard reaches a landing cell ACROSS the obstacle that a ground guard cannot", () => {
    // Ground guard, obstacle at 6: cell 14 (behind the prey/obstacle) is NOT reachable.
    const ground = createInitialGameState("neutral-dest-fly-ground");
    const gg = place(ground, "unit_p2_skeletons", NEUTRAL_PLAYER_ID, "bronze", "ground", 2);
    const gp = place(ground, "unit_p1_griffins", "p1", "bronze", "ground", 10);
    onlyUnits(ground, [gg, gp], [6]);
    const groundIntent = planNeutralActivation(ground, ground.combat!, gg);
    const groundCells = groundIntent.kind === "choose-destination" ? groundIntent.destinations : [];
    expect(groundCells, "a ground guard cannot reach cell 14 past the obstacle").not.toContain(14);

    // Flying guard, SAME obstacle: it flies over cell 6 and can land on 14.
    const flying = createInitialGameState("neutral-dest-fly-flying");
    const fg = place(flying, "unit_p2_skeletons", NEUTRAL_PLAYER_ID, "bronze", "flying", 2);
    const fp = place(flying, "unit_p1_griffins", "p1", "bronze", "ground", 10);
    onlyUnits(flying, [fg, fp], [6]);
    const flyIntent = planNeutralActivation(flying, flying.combat!, fg);
    expect(flyIntent.kind).toBe("choose-destination");
    if (flyIntent.kind === "choose-destination") {
      expect(flyIntent.destinations, "a flyer reaches cell 14 across the obstacle").toContain(14);
      // A flyer still cannot LAND on the obstacle itself.
      expect(flyIntent.destinations, "nobody lands on the obstacle cell").not.toContain(6);
      expect(flyIntent.destinations.every((cell) => isAdjacent(cell, fp.position))).toBe(true);
    }
  });

  it("a RANGED guard never gets a destination prompt — it shoots from where it stands", () => {
    const state = createInitialGameState("neutral-dest-ranged");
    // A ranged guard three spaces from a lone enemy: no move-to-attack, no prompt.
    const guard = place(state, "unit_p2_skeletons", NEUTRAL_PLAYER_ID, "bronze", "ranged", 0);
    const prey = place(state, "unit_p1_griffins", "p1", "bronze", "ground", 9);
    onlyUnits(state, [guard, prey], []);

    const intent = planNeutralActivation(state, state.combat!, guard);
    expect(intent.kind).not.toBe("choose-destination");
    expect(intent).toEqual({ kind: "attack", defenderId: prey.id });
  });
});

// ---------------------------------------------------------------------------
// End to end: the player's pick actually lands the guard on the chosen cell
// ---------------------------------------------------------------------------

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Sets up a one-guard neutral fight with the player's unit deployed at 13. */
function neutralFightWithGuard(reshape: (guard: CombatUnitState) => void): GameState {
  let state = createAdventureGameState({ seed: "neutral-dest-e2e", difficulty: "normal", rollFirstPlayer: false });
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

/** Drives p1's defends / pre-activation pauses until the guard's destination
 *  choice opens (or the fight settles). */
function driveToGuardChoice(state: GameState): GameState {
  let safety = 30;
  while (safety > 0) {
    safety -= 1;
    if (state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context === "neutral-destination") {
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

describe("neutral move-to-attack destination choice (end to end)", () => {
  it("lands the guard on the CELL the player picked, and it attacks the target", () => {
    let state = neutralFightWithGuard((guard) => {
      guard.type = "ground";
      guard.abilities = [];
      guard.attack = 1;
      guard.initiative = 1; // acts after the player unit
      guard.position = 5; // two rows above the prey at 13: it must step in
    });
    const prey = Object.values(state.combat!.units).find((unit) => unit.controllerId === "p1")!;
    prey.maxHealth = 20;
    prey.damage = 0;
    state.combat!.dice.scriptedRolls = Array(20).fill(0);
    state.combat!.dice.rollCount = 0;

    state = driveToGuardChoice(state);

    const choice = state.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    if (choice?.type !== "OPTION_CHOICE") {
      return;
    }
    expect(choice.context).toBe("neutral-destination");
    expect(choice.playerId).toBe("p1"); // the ATTACKING player chooses
    expect(choice.neutralDestination?.defenderId).toBe(prey.id);
    const cells = choice.neutralDestination!.positions;
    expect(cells.length).toBeGreaterThan(1);

    // Pick a NON-default cell (the last one). The engine's own default is the
    // cell closest to the attacker, so landing on this one proves the player's
    // pick — not the AI — drove the destination.
    const chosenIndex = cells.length - 1;
    const chosenCell = cells[chosenIndex];
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: chosenIndex });

    const guard = Object.values(state.combat!.units).find((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)!;
    expect(guard.position).toBe(chosenCell); // it landed EXACTLY where the player chose
    expect(isAdjacent(chosenCell, prey.position)).toBe(true);
    // ...and it still attacked its fixed target, per the rules.
    expect(
      state.eventLog.some((event) => event.type === "UNIT_ATTACK_DECLARED" && event.defenderId === prey.id)
    ).toBe(true);
  });
});

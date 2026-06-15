import { describe, expect, it } from "vitest";
import { isAdjacent } from "./battlefield";
import { createInitialGameState } from "./index";
import { planNeutralActivation } from "./neutral-ai";
import type { CombatUnitState, GameState, UnitGrade, UnitType } from "./state";
import { NEUTRAL_PLAYER_ID } from "./state";

/**
 * Rulebook, Combat Round Structure: "Neutral Units controlled by an opposing
 * player must always attack if possible." A neutral unit may never trudge
 * toward an out-of-reach favourite while a different enemy stands ready to be
 * struck — it attacks the enemy it CAN reach this activation, and only moves
 * without attacking when it can reach no one.
 *
 * The board is 4 columns × 5 rows (position = row * 4 + column). Ground/flying
 * units move up to 3 spaces, so the far corner (19) is unreachable from the
 * near corner (0): the closest space adjacent to it is 6 away.
 */

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

/** Trim the board down to exactly these combatants on an obstacle-free field. */
function onlyUnits(state: GameState, units: CombatUnitState[]): void {
  const map: Record<string, CombatUnitState> = {};
  for (const unit of units) {
    map[unit.id] = unit;
  }
  state.combat!.units = map;
  state.combat!.obstacles = [];
}

describe("neutral units must attack if possible (rulebook AI)", () => {
  it("a bronze that cannot reach another bronze attacks an in-range silver instead", () => {
    // The user's exact case: same-tier bronze is out of reach, a higher-tier
    // silver is adjacent. The neutral must hit the silver, not walk at the bronze.
    const state = createInitialGameState("must-attack-1");
    const attacker = place(state, "unit_p2_skeletons", NEUTRAL_PLAYER_ID, "bronze", "ground", 0);
    const unreachableBronze = place(state, "unit_p1_crusaders", "p1", "bronze", "ground", 19);
    const inRangeSilver = place(state, "unit_p1_griffins", "p1", "silver", "ground", 1);
    onlyUnits(state, [attacker, unreachableBronze, inRangeSilver]);

    const intent = planNeutralActivation(state, state.combat!, attacker);

    // Engine-enforced: it attacks the reachable silver — the old AI would have
    // returned { kind: "move" } toward the higher-priority but unreachable bronze.
    expect(intent).toEqual({ kind: "attack", defenderId: inRangeSilver.id });
  });

  it("moves-and-attacks a reachable silver rather than approaching an unreachable bronze", () => {
    const state = createInitialGameState("must-attack-2");
    const attacker = place(state, "unit_p2_skeletons", NEUTRAL_PLAYER_ID, "bronze", "ground", 0);
    const unreachableBronze = place(state, "unit_p1_crusaders", "p1", "bronze", "ground", 19);
    // Silver three spaces away: the unit can step adjacent and strike this turn.
    const reachableSilver = place(state, "unit_p1_griffins", "p1", "silver", "ground", 9);
    onlyUnits(state, [attacker, unreachableBronze, reachableSilver]);

    const intent = planNeutralActivation(state, state.combat!, attacker);

    expect(intent.kind).toBe("move-and-attack");
    if (intent.kind === "move-and-attack") {
      expect(intent.defenderId).toBe(reachableSilver.id);
      expect(isAdjacent(intent.destination, reachableSilver.position)).toBe(true);
    }
  });

  it("still honours tier priority among targets it can reach (same tier beats higher tier)", () => {
    // Both enemies are adjacent and attackable, so the must-attack filter keeps
    // both: the rulebook tier order must then pick the same-tier bronze.
    const state = createInitialGameState("must-attack-3");
    const attacker = place(state, "unit_p2_skeletons", NEUTRAL_PLAYER_ID, "bronze", "ground", 0);
    const sameTierBronze = place(state, "unit_p1_crusaders", "p1", "bronze", "ground", 1);
    const higherTierSilver = place(state, "unit_p1_griffins", "p1", "silver", "ground", 4);
    onlyUnits(state, [attacker, sameTierBronze, higherTierSilver]);

    const intent = planNeutralActivation(state, state.combat!, attacker);

    expect(intent).toEqual({ kind: "attack", defenderId: sameTierBronze.id });
  });

  it("moves toward its top-priority target only when it can reach no one to attack", () => {
    const state = createInitialGameState("must-attack-4");
    const attacker = place(state, "unit_p2_skeletons", NEUTRAL_PLAYER_ID, "bronze", "ground", 0);
    // Both enemies hug the far corner — neither can be struck this activation.
    const farBronze = place(state, "unit_p1_crusaders", "p1", "bronze", "ground", 19);
    const farSilver = place(state, "unit_p1_griffins", "p1", "silver", "ground", 18);
    onlyUnits(state, [attacker, farBronze, farSilver]);

    const intent = planNeutralActivation(state, state.combat!, attacker);

    // It approaches (does not pass) — but it is moving, not attacking, because
    // nothing was attackable.
    expect(intent.kind).toBe("move");
  });

  it("ranged units shoot their priority target at any distance (no reachability filter)", () => {
    // Ranged units hit from anywhere on this board, so the must-attack filter
    // never trims their pool: they still target by pure tier priority.
    const state = createInitialGameState("must-attack-5");
    const attacker = place(state, "unit_p2_skeletons", NEUTRAL_PLAYER_ID, "bronze", "ranged", 0);
    const farSameTierBronze = place(state, "unit_p1_crusaders", "p1", "bronze", "ground", 19);
    const nearHigherTierSilver = place(state, "unit_p1_griffins", "p1", "silver", "ground", 2);
    onlyUnits(state, [attacker, farSameTierBronze, nearHigherTierSilver]);

    const intent = planNeutralActivation(state, state.combat!, attacker);

    expect(intent).toEqual({ kind: "attack", defenderId: farSameTierBronze.id });
  });
});

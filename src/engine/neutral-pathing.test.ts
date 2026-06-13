import { describe, expect, it } from "vitest";
import { createInitialGameState } from "./index";
import { getBattlefieldDistance } from "./battlefield";
import { getLegalMoveDestinations } from "./legal-actions";
import { planNeutralActivation } from "./neutral-ai";
import { NEUTRAL_PLAYER_ID } from "./state";

/**
 * Regression for the "a neutral guard just never moves" bug. The board is
 * 4 columns × 5 rows (position = row * 4 + column). A neutral melee unit is
 * boxed into the top-right corner with the only opening leading *away* from
 * its target in straight-line terms — every square it can reach this turn is
 * the same or farther as the crow flies, so the old straight-line AI passed
 * forever. Walking the real path around the wall does close the gap.
 */
describe("neutral AI walks around blockers instead of freezing", () => {
  it("moves a corner-boxed neutral that no straight-line step could help", () => {
    const state = createInitialGameState("pathing-seed");
    const combat = state.combat!;

    const neutral = combat.units.unit_p1_crusaders; // a ground unit (range 3)
    const target = combat.units.unit_p2_skeletons;
    neutral.controllerId = NEUTRAL_PLAYER_ID;
    neutral.position = 3; // top-right corner
    neutral.activatedThisRound = false;
    neutral.movedThisActivation = false;
    neutral.attackedThisActivation = false;
    target.position = 0; // top-left corner — Manhattan distance 3 away

    // Keep exactly these two combatants and wall off the direct row.
    combat.units = { [neutral.id]: neutral, [target.id]: target };
    combat.obstacles = [2, 6];

    // Precondition: no reachable square is straight-line closer than standing
    // still — exactly the situation the old AI mis-handled.
    const reachable = getLegalMoveDestinations(combat, neutral, state);
    const here = getBattlefieldDistance(neutral.position, target.position);
    expect(reachable.length).toBeGreaterThan(0);
    expect(reachable.every((square) => getBattlefieldDistance(square, target.position) >= here)).toBe(true);

    // The fixed AI still steps around the wall toward the target.
    const intent = planNeutralActivation(state, combat, neutral);
    expect(intent.kind).toBe("move");
  });

  it("still passes when a neutral is completely walled away from its target", () => {
    const state = createInitialGameState("pathing-seed-2");
    const combat = state.combat!;
    const neutral = combat.units.unit_p1_crusaders;
    const target = combat.units.unit_p2_skeletons;
    neutral.controllerId = NEUTRAL_PLAYER_ID;
    neutral.position = 0;
    neutral.activatedThisRound = false;
    neutral.movedThisActivation = false;
    neutral.attackedThisActivation = false;
    target.position = 3;
    combat.units = { [neutral.id]: neutral, [target.id]: target };
    // Seal the neutral into the top-left corner: both its only exits blocked.
    combat.obstacles = [1, 4];

    const intent = planNeutralActivation(state, combat, neutral);
    expect(intent.kind).toBe("pass");
  });
});

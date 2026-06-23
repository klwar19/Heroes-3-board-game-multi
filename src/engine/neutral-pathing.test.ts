import { describe, expect, it } from "vitest";
import { createInitialGameState } from "./index";
import { getBattlefieldDistance } from "./battlefield";
import { getLegalMoveDestinations } from "./legal-actions";
import { pickNeutralTarget, planNeutralActivation } from "./neutral-ai";
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

/**
 * Choosing WHICH target to go for must count the same walking distance the
 * movement does: a ground unit walled off the straight line should prefer the
 * enemy it can actually reach soonest, not the one that merely looks closest.
 * Flying units pass over the blockers, so for them the count is the crow-flies
 * distance. Board (4 cols x 5 rows): position = row*4 + col.
 *   0  1  2  3
 *   4  5  6  7
 *   8  9 10 11
 */
describe("neutral target choice counts walking distance around other units", () => {
  // Neutral N at 9 weighs two same-tier enemies: A at 1 (straight-line 2 — the
  // nearer as the crow flies) and B at 7 (straight-line 3). A friendly unit
  // sits at 5, walling off the short hop N->5->1 up to A — so on foot A is 4
  // steps away while B is only 3. A ground unit must prefer B; a flyer, passing
  // over the blocker, still prefers A.
  function twoTargetSandbox(neutralType: "ground" | "flying") {
    const state = createInitialGameState("neutral-distance-seed");
    const combat = state.combat!;
    const neutral = combat.units.unit_p1_crusaders;
    const near = combat.units.unit_p2_skeletons; // target A (crow-flies nearer)
    const far = combat.units.unit_p2_vampires; // target B (crow-flies farther)
    const wall = combat.units.unit_p1_griffins; // friendly blocker (never a target)

    neutral.controllerId = NEUTRAL_PLAYER_ID;
    neutral.type = neutralType;
    neutral.position = 9;
    neutral.activatedThisRound = false;
    neutral.movedThisActivation = false;
    neutral.attackedThisActivation = false;

    // Same tier, so tier priority ties and pure distance decides between them.
    near.grade = "bronze";
    far.grade = "bronze";
    near.position = 1;
    far.position = 7;

    // A NEUTRAL ally (so it is never itself a target) seals 5, the one square
    // that would let N reach A in a single step.
    wall.controllerId = NEUTRAL_PLAYER_ID;
    wall.position = 5;

    combat.units = {
      [neutral.id]: neutral,
      [near.id]: near,
      [far.id]: far,
      [wall.id]: wall
    };
    combat.obstacles = [];
    return { combat, neutral, near, far, wall };
  }

  it("a ground neutral targets the unit nearer to WALK to, not the nearer as the crow flies", () => {
    const { combat, neutral, near, far } = twoTargetSandbox("ground");
    // Precondition: A really is the straight-line-nearer of the two.
    expect(getBattlefieldDistance(neutral.position, near.position)).toBeLessThan(
      getBattlefieldDistance(neutral.position, far.position)
    );
    // But the blocking unit makes A 4 steps away vs B's 3, so it picks B.
    expect(pickNeutralTarget(combat, neutral)?.id).toBe(far.id);
  });

  it("a flying neutral passes over the blocking unit and picks the crow-flies-nearer target", () => {
    const { combat, neutral, near } = twoTargetSandbox("flying");
    expect(pickNeutralTarget(combat, neutral)?.id).toBe(near.id);
  });

  it("with the blocking unit gone the ground neutral picks the crow-flies-nearer target (control)", () => {
    const { combat, neutral, near, wall } = twoTargetSandbox("ground");
    const units = { ...combat.units };
    delete units[wall.id];
    combat.units = units; // nothing blocks the short path now
    expect(pickNeutralTarget(combat, neutral)?.id).toBe(near.id);
  });
});

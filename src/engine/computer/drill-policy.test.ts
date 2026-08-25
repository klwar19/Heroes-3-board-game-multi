import { describe, expect, it } from "vitest";
import type { GameAction, GameState, PlayerVisibleState } from "../state";
import { scoreMapAction } from "./map-policy";
import type { ComputerObservation } from "./types";

/**
 * DRILL_UNIT rank proximity: the old score only CLAIMED to prefer "cards close
 * to the next rank" — no unit-experience field was ever read, so a card 1 XP
 * from a rank-up drilled no sooner than a fresh one. Pinned by the score
 * DELTA on the same unit at two experience values (bronze thresholds 5/9/...).
 */

function stateWithArmy(experience: number): GameState {
  return {
    seed: "drill-policy-test",
    round: 4,
    eventCounter: 0,
    combat: null,
    heroes: {},
    players: {
      p2: {
        resources: { gold: 14, buildingMaterials: 0, valuables: 0 },
        army: [
          {
            id: "a1",
            unitDefId: "castle.halberdiers",
            side: "few",
            experience,
          },
        ],
        hand: [],
        deck: [],
        discard: [],
      },
    },
  } as unknown as GameState;
}

function drillScore(state: GameState): number {
  const observation: ComputerObservation = {
    playerId: "p2",
    state: state as unknown as PlayerVisibleState,
    legalActions: [],
  };
  const scored = scoreMapAction(observation, {
    type: "DRILL_UNIT",
    playerId: "p2",
    heroId: "h1",
    armyUnitId: "a1",
  } as GameAction);
  if (!scored) throw new Error("expected DRILL_UNIT to be scored");
  return scored.score;
}

describe("DRILL_UNIT — rank proximity is actually read", () => {
  it("a card 1 XP short of its next veteran rank drills ahead of a fresh one", () => {
    const nearRank = drillScore(stateWithArmy(4)); // bronze rank 1 at 5 XP
    const fresh = drillScore(stateWithArmy(0));
    expect(nearRank).toBeGreaterThan(fresh);
    // Both stay in the idle-time band: above END_TURN (300), below real
    // objective marches (700+) — drilling never displaces a march.
    expect(fresh).toBeGreaterThan(300);
    expect(nearRank).toBeLessThan(700);
  });
});

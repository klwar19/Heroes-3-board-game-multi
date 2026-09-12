import { describe, expect, it } from "vitest";
import { createAdventureGameState } from "./adventure-setup";
import { startAdventureRound } from "./adventure";
import {
  applyUnderdogUnitExperience,
  UNDERDOG_UNIT_XP_GAP
} from "./unit-experience";
import type { ArmyUnitState, GameState } from "./state";

function unit(id: string, unitDefId: string, experience?: number): ArmyUnitState {
  return { id, unitDefId, side: "few", ...(experience !== undefined ? { experience } : {}) };
}

function fixture(): GameState {
  const state = createAdventureGameState({
    seed: "underdog-xp",
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "Leader", factionId: "castle" as never, heroDefId: "catherine" },
      { id: "p2", name: "Trailing", factionId: "necropolis" as never }
    ]
  });
  state.adventure!.unitExperience = true;
  state.players.p1.army = [unit("l1", "castle.archangels", 13)];
  state.players.p2.army = [
    unit("t1", "necropolis.ghost_dragons", 3),
    unit("t2", "necropolis.skeletons")
  ];
  return state;
}

describe("underdog unit experience", () => {
  it("trains every unit of a seat whose best top-tier veteran trails by more than the gap", () => {
    const state = fixture();
    applyUnderdogUnitExperience(state);
    // 13 - 3 = 10 > 9: the trailing seat's WHOLE army gains 1 XP.
    expect(state.players.p2.army.map((armyUnit) => armyUnit.experience)).toEqual([4, 1]);
    // The leader gains nothing.
    expect(state.players.p1.army[0]!.experience).toBe(13);
    expect(
      state.eventLog.some(
        (event) => event.type === "EVENT_NOTE" && event.playerId === "p2" && event.message.includes("Underdog")
      )
    ).toBe(true);
  });

  it("stops at the threshold and resumes when the leader pulls ahead again", () => {
    const state = fixture();
    state.players.p2.army[0]!.experience = 13 - UNDERDOG_UNIT_XP_GAP; // gap exactly 9
    applyUnderdogUnitExperience(state);
    expect(state.players.p2.army[0]!.experience).toBe(4);
    expect(state.players.p2.army[1]!.experience).toBeUndefined();
    // The leader trains further: the gap re-opens and the boost resumes.
    state.players.p1.army[0]!.experience = 14;
    applyUnderdogUnitExperience(state);
    expect(state.players.p2.army[0]!.experience).toBe(5);
    expect(state.players.p2.army[1]!.experience).toBe(1);
  });

  it("compares only gold/azure cards, skips eliminated seats, and no-ops with the rule off", () => {
    const state = fixture();
    // A huge BRONZE veteran on the trailing seat does not close the gold gap...
    state.players.p2.army.push(unit("t3", "necropolis.skeletons", 40));
    // ...and an eliminated leader stops driving the comparison.
    applyUnderdogUnitExperience(state);
    expect(state.players.p2.army[0]!.experience).toBe(4);

    const eliminated = fixture();
    eliminated.players.p1.eliminated = true;
    applyUnderdogUnitExperience(eliminated);
    expect(eliminated.players.p2.army[0]!.experience).toBe(3);

    const off = fixture();
    off.adventure!.unitExperience = false;
    applyUnderdogUnitExperience(off);
    expect(off.players.p2.army[0]!.experience).toBe(3);
  });

  it("runs at every adventure round start", () => {
    const state = fixture();
    state.round = 4;
    startAdventureRound(state);
    expect(state.players.p2.army[0]!.experience).toBe(4);
    expect(state.players.p2.army[1]!.experience).toBe(1);
  });
});

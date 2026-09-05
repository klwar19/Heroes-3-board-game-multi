import { describe, expect, it, vi, afterEach } from "vitest";
import {
  trainReplayPolicy,
  replayPolicyKey,
  type ReplayPolicyModel,
} from "./replay-model";
import bundled from "./learned-policy.json";
import * as mapPolicy from "./map-policy";
import { chooseComputerAction } from "./policy";
import { createAdventureGameState } from "../adventure-setup";
import type { PlayerVisibleState, GameAction } from "../state";
const context = {
  stage: "midgame",
  faction: "fortress",
  combat: "map",
  pressure: false,
};
const preferred = {
  type: "BUILD_STRUCTURE",
  buildingId: "fortress.city_hall",
  playerId: "p2",
  townId: "town_p2",
} as GameAction;
const other = {
  type: "BUILD_STRUCTURE",
  buildingId: "fortress.dwelling_silver",
  playerId: "p2",
  townId: "town_p2",
} as GameAction;
const original = structuredClone(bundled);
afterEach(() => {
  Object.assign(bundled, original);
  vi.restoreAllMocks();
});
function observation() {
  const state = createAdventureGameState({
    seed: "learned-choice",
    playerCount: 2,
    events: false,
    rollFirstPlayer: false,
  });
  state.round = 5;
  state.players.p2.factionId = "fortress";
  state.players.p2.resources.gold = 30;
  return {
    playerId: "p2",
    state: state as unknown as PlayerVisibleState,
    legalActions: [
      { label: "income", action: preferred },
      { label: "silver", action: other },
    ],
  };
}
describe("replay model used by live policy", () => {
  it("changes the actual close choice from independent winning/losing evidence", () => {
    vi.spyOn(mapPolicy, "scoreMapAction").mockImplementation((_o, a) => ({
      score: a === other ? 602 : 600,
      policy: "test-close-building",
    }));
    Object.assign(bundled, { version: 1, matches: 0, samples: 0, weights: {} });
    expect(chooseComputerAction(observation())?.action).toEqual(other);
    const trained = trainReplayPolicy(
      [0, 1, 2, 3, 4].flatMap((i) => [
        {
          matchId: "win" + i,
          context,
          action: preferred,
          outcome: "win" as const,
        },
        {
          matchId: "loss" + i,
          context,
          action: other,
          outcome: "loss" as const,
        },
      ]),
    );
    Object.assign(bundled, trained);
    expect(chooseComputerAction(observation())?.action).toEqual(preferred);
    // A materially higher baseline decision cannot be overridden by learning.
    vi.spyOn(mapPolicy, "scoreMapAction").mockImplementation((_o, a) => ({
      score: a === other ? 650 : 600,
      policy: "test-safety-margin",
    }));
    expect(chooseComputerAction(observation())?.action).toEqual(other);
  });
  it("does not learn from repetition in one game or contradictory seat outcomes", () => {
    const sample = {
      matchId: "one",
      context,
      action: preferred,
      outcome: "win" as const,
    };
    expect(trainReplayPolicy(Array(100).fill(sample)).weights).toEqual({});
    const mixed = [0, 1, 2].flatMap((i) => [
      { ...sample, matchId: String(i) },
      { ...sample, matchId: String(i), outcome: "loss" as const },
      { ...sample, matchId: String(i) },
    ]);
    expect(trainReplayPolicy(mixed).weights).toEqual({});
    const learned = trainReplayPolicy(
      [0, 1, 2].map((i) => ({ ...sample, matchId: String(i) })),
    );
    expect(
      learned.weights[replayPolicyKey(context, preferred)!].bias,
    ).toBeGreaterThan(0);
    expect((bundled as ReplayPolicyModel).version).toBe(1);
  });
});

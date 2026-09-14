import { describe, expect, it, vi, afterEach } from "vitest";
import bundled from "./learned-policy.json";
import selfPlay from "./self-play-policy.json";
import { learnedActionBias, LEARNED_BIAS_LIMIT, SELF_PLAY_MODEL_WEIGHT } from "./learned-policy";
import { chooseComputerAction } from "./policy";
import * as mapPolicy from "./map-policy";
import { createAdventureGameState } from "../adventure-setup";
import { replayDecisionFacts } from "./replay-context";
import { replayPolicyKey } from "./replay-model";
import type { GameAction, GameState, PlayerVisibleState } from "../state";

const originalRanked = structuredClone(bundled);
const originalSelfPlay = structuredClone(selfPlay);
afterEach(() => {
  Object.assign(bundled, originalRanked);
  Object.assign(selfPlay, originalSelfPlay);
  vi.restoreAllMocks();
});

const build = (buildingId: string) =>
  ({ type: "BUILD_STRUCTURE", buildingId, playerId: "p2", townId: "town_p2" }) as GameAction;
const hall = build("fortress.city_hall");
const silver = build("fortress.dwelling_silver");
const gold = build("fortress.dwelling_gold");
/** The situation-free fallback key the live bias resolves for the hall. */
let KEY = "";

function fixture() {
  const state = createAdventureGameState({ seed: "self-play-learning", playerCount: 2, events: false, rollFirstPlayer: false });
  state.round = 5;
  state.players.p2.factionId = "fortress";
  state.players.p2.resources.gold = 30;
  const facts = replayDecisionFacts(state as unknown as GameState, "p2", hall);
  KEY = replayPolicyKey({ stage: "midgame", faction: "fortress", combat: "map", pressure: false, conditions: facts.conditions }, facts.action)!;
  return () => ({
    playerId: "p2",
    state: state as unknown as PlayerVisibleState,
    legalActions: [
      { label: "hall", action: hall },
      { label: "silver", action: silver },
      { label: "gold", action: gold },
    ],
  });
}

/** hall 600, silver 602 (top), gold 560 — outside the ±12 close band. */
function closeScores() {
  vi.spyOn(mapPolicy, "scoreMapAction").mockImplementation((_o, a) => ({
    score: a === silver ? 602 : a === hall ? 600 : 560,
    policy: "test-close-building",
  }));
}

describe("self-play exploration stays inside the close band", () => {
  it("explores only among same-type candidates within 12 points of the top", () => {
    closeScores();
    const observation = fixture();
    // random() < rate → explore; the second draw picks the LAST close candidate.
    const draws = [0, 0.99];
    const explore = { rate: 1, random: () => draws.shift() ?? 0.99 };
    const decision = chooseComputerAction(observation(), { learned: "none", explore });
    expect(decision?.action).toEqual(hall);
    expect(decision?.policy).toMatch(/^explore:/);
    // The 560 candidate is never reachable: only two candidates are close.
    for (let index = 0; index < 20; index += 1) {
      const pick = chooseComputerAction(observation(), { learned: "none", explore: { rate: 1, random: () => index / 20 } });
      expect(pick?.action).not.toEqual(gold);
    }
  });

  it("CONTROL: rate 0 / no explore option keeps the deterministic top pick", () => {
    closeScores();
    const observation = fixture();
    expect(chooseComputerAction(observation(), { learned: "none" })?.action).toEqual(silver);
    expect(chooseComputerAction(observation(), { learned: "none", explore: { rate: 0, random: () => 0 } })?.action).toEqual(silver);
    // random() above the rate: no exploration this decision.
    expect(chooseComputerAction(observation(), { learned: "none", explore: { rate: 0.1, random: () => 0.5 } })?.action).toEqual(silver);
  });
});

describe("learned model selection", () => {
  it("'none' ignores a ranked weight that 'all' and 'ranked' apply", () => {
    closeScores();
    const observation = fixture();
    Object.assign(bundled, { version: 1, matches: 3, samples: 3, weights: {
      [KEY]: { wins: 3, losses: 0, matches: 3, bias: 6 },
    } });
    // +6 lifts the hall (600) above the silver dwelling (602).
    expect(chooseComputerAction(observation())?.action).toEqual(hall);
    expect(chooseComputerAction(observation(), { learned: "ranked" })?.action).toEqual(hall);
    expect(chooseComputerAction(observation(), { learned: "none" })?.action).toEqual(silver);
  });

  it("the self-play model votes at half weight and only under 'all'", () => {
    closeScores();
    const observation = fixture();
    Object.assign(bundled, { version: 1, matches: 0, samples: 0, weights: {} });
    Object.assign(selfPlay, { version: 1, matches: 6, samples: 6, weights: {
      [KEY]: { wins: 6, losses: 0, matches: 6, bias: 6 },
    } });
    expect(learnedActionBias(observation(), hall, "all")).toBe(6 * SELF_PLAY_MODEL_WEIGHT);
    expect(learnedActionBias(observation(), hall, "ranked")).toBe(0);
    expect(learnedActionBias(observation(), hall, "none")).toBe(0);
    // +3 beats the 2-point gap under "all" but not under "ranked".
    expect(chooseComputerAction(observation())?.action).toEqual(hall);
    expect(chooseComputerAction(observation(), { learned: "ranked" })?.action).toEqual(silver);
  });

  it("both models together never leave the ±8 band", () => {
    const observation = fixture();
    Object.assign(bundled, { version: 1, matches: 3, samples: 3, weights: { [KEY]: { wins: 3, losses: 0, matches: 3, bias: 8 } } });
    Object.assign(selfPlay, { version: 1, matches: 6, samples: 6, weights: { [KEY]: { wins: 6, losses: 0, matches: 6, bias: 8 } } });
    expect(learnedActionBias(observation(), hall)).toBe(LEARNED_BIAS_LIMIT);
    Object.assign(selfPlay, { version: 1, matches: 6, samples: 6, weights: { [KEY]: { wins: 0, losses: 6, matches: 6, bias: -8 } } });
    expect(learnedActionBias(observation(), hall)).toBe(8 - 8 * SELF_PLAY_MODEL_WEIGHT);
  });

  it("the committed self-play model is inert until trained (production decisions unchanged)", () => {
    closeScores();
    const observation = fixture();
    expect(originalSelfPlay.matches).toBe(0);
    expect(Object.keys(originalSelfPlay.weights)).toHaveLength(0);
    expect(chooseComputerAction(observation())?.action).toEqual(chooseComputerAction(observation(), { learned: "ranked" })?.action);
  });
});

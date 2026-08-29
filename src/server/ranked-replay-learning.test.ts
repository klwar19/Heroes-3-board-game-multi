import { describe, expect, it } from "vitest";
import type { GameAction } from "@/engine";
import type { RankedReplay, RankedReplayEntry } from "./ranked-replay";
import { aggregateStrategicPreferences, extractStrategicDecisionSamples } from "./ranked-replay-learning";

const move = (type: GameAction["type"], playerId = "p1") => ({ type, playerId }) as GameAction;

function replay(matchId: string, winnerPlayerId: "p1" | "p2", captureStart: RankedReplay["captureStart"] = "adventure-start"): RankedReplay {
  const entry: RankedReplayEntry = {
    sequence: 1,
    round: 2,
    phase: "player-turn",
    actorPlayerId: "p1",
    source: "human",
    action: move("MOVE_HERO"),
    legalActions: [move("MOVE_HERO"), move("END_TURN")],
    beforeStateHash: "00000001",
    afterStateHash: "00000002",
    events: [],
    learningContext: {
      stage: "opening",
      domains: ["opening", "map-movement"],
      legalAlternativeCount: 2,
      underPressure: false,
      pressureSignals: [],
    },
  };
  return {
    format: "homm3bg-ranked-replay-v1",
    schemaVersion: 1,
    engineSignature: "test",
    matchId,
    startedAt: new Date(0).toISOString(),
    finishedAt: new Date(1).toISOString(),
    captureStart,
    winnerPlayerId,
    initialState: {} as RankedReplay["initialState"],
    entries: [entry],
    byteLength: 1,
    truncated: false,
  };
}

describe("ranked replay strategic learning extraction", () => {
  it("labels outcomes but never labels unchosen alternatives as mistakes", () => {
    const [sample] = extractStrategicDecisionSamples(replay("one", "p1"));
    expect(sample.terminalOutcome).toBe("win");
    expect(sample.unchosenAlternatives).toEqual([move("END_TURN")]);
    expect(sample.completeTrajectory).toBe(true);
  });

  it("does not invent opening evidence from a mid-match recovery capture", () => {
    expect(extractStrategicDecisionSamples(replay("partial", "p1", "mid-match-recovery"))).toEqual([]);
  });

  it("requires corroboration across matches before recommending a pattern", () => {
    expect(aggregateStrategicPreferences([replay("1", "p1")])).toEqual([]);
    const evidence = ["1", "2", "3", "4", "5"].map((id) => replay(id, "p1"));
    expect(aggregateStrategicPreferences(evidence)).toEqual([
      expect.objectContaining({ distinctMatches: 5, wins: 5, recommendation: "prefer" }),
    ]);
  });
});

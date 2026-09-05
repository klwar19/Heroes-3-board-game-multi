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
  it("keeps a conflicted match neutral regardless of repeated later winner moves", () => {
    const mixed = replay("mixed", "p1");
    const entry = mixed.entries[0];
    mixed.entries = [entry, { ...entry, sequence: 2, actorPlayerId: "p2" }, { ...entry, sequence: 3 }];
    // Make a continuous record so opening exclusion cannot hide the voting bug.
    mixed.entries.forEach((e) => { e.beforeStateHash = "same"; e.afterStateHash = "same"; });
    expect(aggregateStrategicPreferences([mixed], 1)).toEqual([]);
    mixed.entries.reverse();
    expect(aggregateStrategicPreferences([mixed], 1)).toEqual([]);
  });

  it("does not call a hash-discontinuous opening a complete trajectory", () => {
    const broken = replay("gap", "p1");
    broken.entries.push({ ...broken.entries[0], sequence: 2, beforeStateHash: "gap" });
    expect(extractStrategicDecisionSamples(broken)).toEqual([]);
  });

  it("attributes interleaved fights by ID and omits unresolved fights", () => {
    const r = replay("parallel", "p1", "mid-match-recovery");
    const base = r.entries[0];
    const fight = (sequence: number, id: string): RankedReplayEntry => ({
      ...base, sequence, learningContext: {
        ...base.learningContext!, stage: "midgame", domains: ["neutral-combat"],
        combat: { id, kind: "neutral", ownLivingUnits: 2, enemyLivingUnits: 2, ownRemainingHealth: 8, enemyRemainingHealth: 8 },
      },
    });
    r.entries = [fight(1, "a"), fight(2, "b"), fight(3, "b"), fight(4, "a"), fight(5, "unfinished")];
    r.entries[2].events = [{ id: "b-end", type: "COMBAT_ENDED", combatContextId: "b", winnerPlayerId: "p1", defeatedPlayerId: "neutrals", reason: "all-enemy-units-defeated" }];
    r.entries[3].events = [{ id: "a-end", type: "COMBAT_ENDED", combatContextId: "a", winnerPlayerId: "neutrals", defeatedPlayerId: "p1", reason: "retreat" }];
    expect(extractStrategicDecisionSamples(r).map((s) => [s.sequence, s.decisionOutcome])).toEqual([[1, "loss"], [2, "win"], [3, "win"], [4, "loss"]]);
  });

  it("excludes ambiguous legacy parallel combat instead of guessing a winner", () => {
    const r = replay("legacy-parallel", "p1", "mid-match-recovery");
    const base = r.entries[0];
    const context = { ...base.learningContext!, stage: "midgame" as const, domains: ["neutral-combat" as const] };
    r.entries = [
      { ...base, sequence: 1, learningContext: context, events: [{ id: "a-start", type: "NEUTRAL_COMBAT_STARTED", combatContextId: "a", playerId: "p1", heroId: "h1", fieldId: "f1", difficulty: 1, unitDefIds: [] }] },
      { ...base, sequence: 2, learningContext: context, events: [{ id: "b-start", type: "NEUTRAL_COMBAT_STARTED", combatContextId: "b", playerId: "p2", heroId: "h2", fieldId: "f2", difficulty: 1, unitDefIds: [] }] },
      { ...base, sequence: 3, learningContext: context, events: [{ id: "a-end", type: "COMBAT_ENDED", combatContextId: "a", winnerPlayerId: "p1", defeatedPlayerId: "neutrals", reason: "all-enemy-units-defeated" }] },
    ];
    expect(extractStrategicDecisionSamples(r)).toEqual([]);
  });

  it("does not list the chosen move as an alternative because JSON key order differs", () => {
    const r = replay("key-order", "p1");
    r.entries[0].legalActions[0] = { playerId: "p1", type: "MOVE_HERO" } as GameAction;
    expect(extractStrategicDecisionSamples(r)[0].unchosenAlternatives).toEqual([move("END_TURN")]);
  });

  it("labels outcomes but never labels unchosen alternatives as mistakes", () => {
    const [sample] = extractStrategicDecisionSamples(replay("one", "p1"));
    expect(sample.terminalOutcome).toBe("win");
    expect(sample.decisionOutcome).toBe("win");
    expect(sample.outcomeBasis).toBe("match");
    expect(sample.unchosenAlternatives).toEqual([move("END_TURN")]);
    expect(sample.completeTrajectory).toBe(true);
  });

  it("credits combat choices to their battle result instead of blindly using the match result", () => {
    const wonMatchAfterLosingBattle = replay("battle-local", "p1", "mid-match-recovery");
    wonMatchAfterLosingBattle.entries[0] = {
      ...wonMatchAfterLosingBattle.entries[0]!,
      round: 9,
      phase: "combat",
      learningContext: {
        stage: "late-game",
        domains: ["pvp-combat"],
        legalAlternativeCount: 2,
        underPressure: false,
        pressureSignals: [],
      },
      events: [{
        id: "battle-ended",
        type: "COMBAT_ENDED",
        winnerPlayerId: "p2",
        defeatedPlayerId: "p1",
        reason: "all-enemy-units-defeated",
      }],
    };

    const [sample] = extractStrategicDecisionSamples(wonMatchAfterLosingBattle);
    expect(sample.terminalOutcome).toBe("win");
    expect(sample.decisionOutcome).toBe("loss");
    expect(sample.outcomeBasis).toBe("battle");
  });

  it("does not let an actor-less system step split a battle's outcome attribution", () => {
    // Legacy captures recorded NO combat context for a system (actor-less)
    // entry taken mid-fight. Treating it as "not in combat" reset the segment,
    // so every decision BEFORE it was credited to the match result instead of
    // the battle it belonged to.
    const lostBattleWonMatch = replay("system-mid-fight", "p1", "mid-match-recovery");
    const fight = (sequence: number, overrides: Partial<RankedReplayEntry>): RankedReplayEntry => ({
      ...lostBattleWonMatch.entries[0]!,
      sequence,
      round: 9,
      phase: "combat",
      learningContext: {
        stage: "late-game",
        domains: ["pvp-combat"],
        legalAlternativeCount: 2,
        underPressure: false,
        pressureSignals: [],
      },
      ...overrides,
    });
    lostBattleWonMatch.entries = [
      fight(1, {}),
      fight(2, {
        actorPlayerId: null,
        source: "system",
        action: { type: "ADVANCE_COMPUTER" } as GameAction,
        legalActions: [],
        learningContext: {
          stage: "late-game",
          domains: ["map-movement"],
          legalAlternativeCount: 0,
          underPressure: false,
          pressureSignals: [],
        },
      }),
      fight(3, {
        events: [{
          id: "battle-ended",
          type: "COMBAT_ENDED",
          winnerPlayerId: "p2",
          defeatedPlayerId: "p1",
          reason: "all-enemy-units-defeated",
        }],
      }),
    ];
    const samples = extractStrategicDecisionSamples(lostBattleWonMatch);
    expect(samples.map((sample) => sample.sequence)).toEqual([1, 3]);
    expect(samples.map((sample) => sample.decisionOutcome)).toEqual(["loss", "loss"]);
    expect(samples.map((sample) => sample.outcomeBasis)).toEqual(["battle", "battle"]);
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

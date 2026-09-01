import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  type GameState,
  type RoomMembershipState,
} from "@/engine";
import {
  RANKED_REPLAY_MAX_BYTES,
  appendRankedReplayEntry,
  createRankedReplay,
  rankedClashReplayEligible,
  rankedReplayEnabled,
  sanitizeReplayState,
} from "./ranked-replay";
import {
  captureRankedReplayAction,
  discardRankedReplay,
  peekRankedReplay,
  takeFinishedRankedReplay,
} from "./ranked-replay-buffer";
import { storeRankedReplay } from "./ranked-replay-store";

const cleanupDirs: string[] = [];
afterEach(() => {
  for (const directory of cleanupDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function rankedGame(seed = "ranked-replay-test"): GameState {
  const state = createAdventureGameState({ seed, rollFirstPlayer: false, events: false });
  state.room = {
    hosted: true,
    ranked: true,
    hostClientId: "private-client-1",
    ownerClientId: "private-client-1",
    ownerUserId: "account-1",
    passwordHash: "secret-hash",
    chatSeq: 1,
    chat: [{ seq: 1, clientId: "private-client-1", name: "Alice", seat: "p1", text: "secret chat", kind: "chat", at: 1 }],
    members: [
      { clientId: "private-client-1", userId: "account-1", name: "Alice", seat: "p1", isHost: true },
      { clientId: "private-client-2", userId: "account-2", name: "Bob", seat: "p2", isHost: false },
    ],
    matchSeats: {
      p1: { userId: "account-1", name: "Alice" },
      p2: { userId: "account-2", name: "Bob" },
    },
  } as RoomMembershipState;
  return state;
}

describe("Ranked Clash replay capture", () => {
  it("collects Ranked Clash only and has an operator kill switch", () => {
    const ranked = rankedGame();
    expect(rankedClashReplayEligible(ranked)).toBe(true);
    const casual = structuredClone(ranked);
    casual.room!.ranked = false;
    expect(rankedClashReplayEligible(casual)).toBe(false);
    const coop = structuredClone(ranked);
    coop.gameMode = "coop";
    expect(rankedClashReplayEligible(coop)).toBe(false);
    const solo = structuredClone(ranked);
    solo.sessionMode = "single-player";
    expect(rankedClashReplayEligible(solo)).toBe(false);

    expect(rankedReplayEnabled(undefined)).toBe(true);
    expect(rankedReplayEnabled("true")).toBe(true);
    expect(rankedReplayEnabled("false")).toBe(false);
    expect(rankedReplayEnabled("0")).toBe(false);
  });

  it("keeps capture eligible through a combat result screen and stops only when the adventure ends", () => {
    const combatResult = rankedGame("ranked-transient-combat-result");
    combatResult.phase = "game-over";
    combatResult.combat = {} as NonNullable<GameState["combat"]>;
    expect(combatResult.combat).not.toBeNull();
    expect(combatResult.adventure?.winnerPlayerId).toBeNull();
    expect(rankedClashReplayEligible(combatResult)).toBe(true);

    const afterCombatAcknowledgement = structuredClone(combatResult);
    afterCombatAcknowledgement.phase = "player-turn";
    expect(rankedClashReplayEligible(afterCombatAcknowledgement)).toBe(true);

    const finishedAdventure = structuredClone(afterCombatAcknowledgement);
    finishedAdventure.adventure!.winnerPlayerId = "p1";
    expect(rankedClashReplayEligible(finishedAdventure)).toBe(false);
  });

  it("removes chat, credentials and real identity from the initial gameplay state", () => {
    const clean = sanitizeReplayState(rankedGame());
    expect(Array.isArray(clean.eventLog)).toBe(true);
    expect(clean.room?.passwordHash).toBeUndefined();
    expect(clean.room?.chat).toBeUndefined();
    expect(JSON.stringify(clean)).not.toMatch(/secret chat|secret-hash|account-1|private-client-1|Alice|Bob/);
    expect(clean.room?.members.map((member) => member.seat)).toEqual(["p1", "p2"]);
  });

  it("records the chosen action, all current legal alternatives, entropy, clock, events and state hashes", () => {
    const before = rankedGame("ranked-decision");
    const legal = getLegalActions(before, before.activePlayerId);
    expect(legal.length).toBeGreaterThan(0);
    const action = legal[0]!.action;
    const result = applyAction(before, action, { entropy: "recorded-entropy", now: 123456 });
    expect(result.errors).toEqual([]);
    const replay = appendRankedReplayEntry(createRankedReplay(before, 123000), before, action, result, {
      entropy: "recorded-entropy",
      now: 123456,
    });
    expect(replay.entries).toHaveLength(1);
    expect(replay.entries[0]).toEqual(
      expect.objectContaining({
        action,
        entropy: "recorded-entropy",
        now: 123456,
        actorPlayerId: before.activePlayerId,
        source: "human",
        beforeStateHash: expect.stringMatching(/^[0-9a-f]{8}$/),
        afterStateHash: expect.stringMatching(/^[0-9a-f]{8}$/),
        learningContext: expect.objectContaining({
          stage: "opening",
          domains: expect.arrayContaining(["opening"]),
          legalAlternativeCount: legal.length,
        }),
      }),
    );
    expect(replay.entries[0]!.legalActions).toContainEqual(action);
    expect(replay.byteLength).toBeLessThan(RANKED_REPLAY_MAX_BYTES);
  });

  it("stops before the byte budget instead of growing without limit", () => {
    const before = rankedGame("ranked-cap");
    const action = getLegalActions(before, before.activePlayerId)[0]!.action;
    const result = applyAction(before, action);
    const replay = createRankedReplay(before);
    replay.byteLength = RANKED_REPLAY_MAX_BYTES - 1;
    const capped = appendRankedReplayEntry(replay, before, action, result);
    expect(capped.truncated).toBe(true);
    expect(capped.truncationReason).toBe("byte-limit");
    expect(capped.entries).toHaveLength(0);
  });

  it("keeps the built-in buffer outside snapshots and returns it exactly once at finish", () => {
    const roomId = "ranked-buffer-room";
    discardRankedReplay(roomId);
    const before = rankedGame("ranked-buffer-seed");
    const action = getLegalActions(before, before.activePlayerId)[0]!.action;
    const result = applyAction(before, action, { entropy: "buffer-entropy", now: 88 });
    captureRankedReplayAction(roomId, before, action, result, { entropy: "buffer-entropy", now: 88 }, true);
    expect(peekRankedReplay(roomId)?.entries).toHaveLength(1);
    expect((before as GameState & { rankedReplay?: unknown }).rankedReplay).toBeUndefined();
    const finished = takeFinishedRankedReplay(roomId, before.seed, 99, "p1");
    expect(finished?.entries).toHaveLength(1);
    expect(finished?.winnerPlayerId).toBe("p1");
    expect(takeFinishedRankedReplay(roomId, before.seed, 100)).toBeNull();
  });

  it("starts at the exact round-1 adventure state instead of waiting for the first combat", () => {
    const roomId = "ranked-round-one-start";
    discardRankedReplay(roomId);
    const adventure = rankedGame("ranked-round-one-seed");
    adventure.round = 1;
    const lobby = structuredClone(adventure);
    lobby.adventure = null;
    lobby.phase = "setup";
    const startAction = { type: "START_ADVENTURE", playerId: "p1" } as Parameters<typeof applyAction>[1];
    captureRankedReplayAction(
      roomId,
      lobby,
      startAction,
      { state: adventure, events: [], errors: [] },
      { now: 77 },
      true,
    );

    const started = peekRankedReplay(roomId);
    expect(started).toMatchObject({
      matchId: adventure.seed,
      captureStart: "adventure-start",
      entries: [],
      initialState: { round: 1 },
    });

    const action = getLegalActions(adventure, adventure.activePlayerId)[0]!.action;
    const result = applyAction(adventure, action, { now: 78 });
    captureRankedReplayAction(roomId, adventure, action, result, { now: 78 }, true);
    expect(peekRankedReplay(roomId)?.entries).toHaveLength(1);
  });

  it("stores one bounded final file on the built-in backend and deduplicates by match id", async () => {
    const directory = mkdtempSync(join(tmpdir(), "homm3bg-replay-store-test-"));
    cleanupDirs.push(directory);
    const state = rankedGame("ranked-store-seed");
    const replay = createRankedReplay(state, 1);
    const env = { HOMM3BG_RANKED_REPLAY_ENABLED: "true", HOMM3BG_REPLAY_DIR: directory };
    expect(await storeRankedReplay(state.seed, replay, env)).toEqual({ stored: true });
    expect(await storeRankedReplay(state.seed, replay, env)).toEqual({ stored: false, reason: "duplicate" });
    const file = join(directory, `${encodeURIComponent(state.seed).replace(/%/g, "_")}.json`);
    expect(JSON.parse(readFileSync(file, "utf8")).matchId).toBe(state.seed);
  });
});

import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  factionCrestAsset,
  MAX_TABLE_REACTIONS,
  TABLE_REACTION_FLOOD_LIMIT,
  TABLE_REACTIONS,
  type GameAction,
  type GameState
} from "./index";

// ---------------------------------------------------------------------------
// Table reactions (emotes): a purely social broadcast that flows through
// applyAction into the synced ring buffer `state.tableReactions`. Each test
// pins a rule a regression would break, with a mutation control alongside.
// ---------------------------------------------------------------------------

function makeGame(): GameState {
  return createAdventureGameState({ seed: "reaction-test", difficulty: "normal", rollFirstPlayer: false });
}

function apply(state: GameState, action: GameAction, actorClientId?: string) {
  return applyAction(state, action, actorClientId ? { actorClientId } : {});
}

function expectOk(state: GameState, action: GameAction, actorClientId?: string): GameState {
  const result = apply(state, action, actorClientId);
  expect(result.errors.map((error) => error.message).join("; ")).toBe("");
  return result.state;
}

function expectRejected(state: GameState, action: GameAction, actorClientId?: string): string {
  const before = state.tableReactions ?? [];
  const result = apply(state, action, actorClientId);
  expect(result.errors.length).toBeGreaterThan(0);
  // A rejected reaction never touches the buffer.
  expect(result.state.tableReactions ?? []).toEqual(before);
  return result.errors[0]?.message ?? "";
}

/** A game with two joined members (Alice, Bob), open table. */
function tableWithTwo(): GameState {
  let state = makeGame();
  state = expectOk(state, { type: "JOIN_ROOM", clientId: "c1", name: "Alice" });
  state = expectOk(state, { type: "JOIN_ROOM", clientId: "c2", name: "Bob" });
  return state;
}

describe("sending a table reaction", () => {
  it("records the reaction attributed to the sending member", () => {
    let state = tableWithTwo();
    state = expectOk(state, { type: "SEND_TABLE_REACTION", clientId: "c1", reactionId: "greet" });

    expect(state.tableReactions).toHaveLength(1);
    const reaction = state.tableReactions![0];
    expect(reaction.reactionId).toBe("greet");
    expect(reaction.name).toBe("Alice");
    expect(reaction.clientId).toBe("c1");
    expect(reaction.seq).toBe(1);
  });

  it("is never seat- or turn-gated: an observer may react on anyone's turn", () => {
    // Bob (c2) holds no seat and it is not his turn, yet his reaction lands —
    // reactions carry no seat playerId, so roomActionGuard/turn checks skip it.
    let state = tableWithTwo();
    state = expectOk(state, { type: "SEND_TABLE_REACTION", clientId: "c2", reactionId: "wow" }, "c2");
    expect(state.tableReactions?.map((entry) => entry.name)).toEqual(["Bob"]);
    expect(state.tableReactions?.[0].seat).toBe("observer");
  });

  it("rejects an unknown reaction id (control: a known id is accepted)", () => {
    const state = tableWithTwo();
    expectRejected(state, { type: "SEND_TABLE_REACTION", clientId: "c1", reactionId: "not_a_reaction" });
    // Control: the very same flow with a real palette id succeeds.
    expectOk(state, { type: "SEND_TABLE_REACTION", clientId: "c1", reactionId: TABLE_REACTIONS[0].id });
  });

  it("requires membership when a room exists (control: a member is accepted)", () => {
    const state = tableWithTwo();
    expectRejected(state, { type: "SEND_TABLE_REACTION", clientId: "stranger", reactionId: "greet" });
    // Control: an actual member of the same room reacts fine.
    expectOk(state, { type: "SEND_TABLE_REACTION", clientId: "c2", reactionId: "greet" });
  });

  it("attributes the seat's faction crest to the reaction", () => {
    let state = tableWithTwo();
    // Host and seat Alice at p1, then give p1 a faction so the crest resolves.
    state = expectOk(state, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true });
    state = expectOk(state, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c1", seat: "p1" });
    state.players.p1.factionId = "necropolis";

    state = expectOk(state, { type: "SEND_TABLE_REACTION", clientId: "c1", reactionId: "greet" }, "c1");
    const reaction = state.tableReactions![0];
    expect(reaction.seat).toBe("p1");
    expect(reaction.factionId).toBe("necropolis");
    expect(factionCrestAsset(reaction.factionId)).toBe("/assets/town-icon-necropolis.webp");
  });
});

describe("reaction guards", () => {
  it("caps a single client's flood but lets another client's reaction through", () => {
    let state = tableWithTwo();
    // c1 sends the flood limit back-to-back — all accepted.
    for (let i = 0; i < TABLE_REACTION_FLOOD_LIMIT; i += 1) {
      state = expectOk(state, { type: "SEND_TABLE_REACTION", clientId: "c1", reactionId: "laugh" });
    }
    // The next consecutive one from c1 is refused (dominance guard).
    expectRejected(state, { type: "SEND_TABLE_REACTION", clientId: "c1", reactionId: "laugh" });
    // A different client breaks the streak...
    state = expectOk(state, { type: "SEND_TABLE_REACTION", clientId: "c2", reactionId: "wow" });
    // ...and now c1 may react again (the last N are no longer all c1's).
    state = expectOk(state, { type: "SEND_TABLE_REACTION", clientId: "c1", reactionId: "laugh" });
    expect(state.tableReactions!.length).toBeGreaterThan(TABLE_REACTION_FLOOD_LIMIT);
  });

  it("never grows the buffer past MAX_TABLE_REACTIONS (oldest dropped)", () => {
    let state = tableWithTwo();
    // Alternate senders so the flood cap never trips, and overflow the cap.
    const total = MAX_TABLE_REACTIONS + 6;
    for (let i = 0; i < total; i += 1) {
      const clientId = i % 2 === 0 ? "c1" : "c2";
      state = expectOk(state, { type: "SEND_TABLE_REACTION", clientId, reactionId: "greet" });
    }
    expect(state.tableReactions).toHaveLength(MAX_TABLE_REACTIONS);
    // seq is monotonic + unique, and the OLDEST were dropped (kept the newest).
    const seqs = state.tableReactions!.map((entry) => entry.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(Math.min(...seqs)).toBe(total - MAX_TABLE_REACTIONS + 1);
    expect(Math.max(...seqs)).toBe(total);
  });
});

describe("no-room fallback", () => {
  it("accepts a reaction with a name fallback when there is no room at all", () => {
    // A bare game (no JOIN_ROOM) still accepts a reaction, attributed to the
    // sent name with no seat — the isolated / true-solo path.
    let state = makeGame();
    expect(state.room).toBeUndefined();
    state = expectOk(state, { type: "SEND_TABLE_REACTION", clientId: "solo", reactionId: "wow", name: "Solo" });
    expect(state.tableReactions).toHaveLength(1);
    expect(state.tableReactions![0].name).toBe("Solo");
    expect(state.tableReactions![0].seat).toBeNull();
    expect(state.tableReactions![0].factionId).toBeNull();
  });
});

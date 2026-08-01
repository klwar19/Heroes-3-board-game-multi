/**
 * Single-player SAVE SLOTS 窶・the server half (shared module + built-in store).
 * The PartyKit edge wiring (same shared helpers at the same seams) is pinned in
 * single-player-save-edge.test.ts.
 *
 * Every claim carries a CONTROL that fails if its guard is removed:
 * - the save fetch returns the RAW state (the redacted per-seat frame hides
 *   even the owner's own deck order, so it can never serve as a save);
 * - both surfaces are OWNER-only and SOLO-room-only;
 * - a load is an atomic whole-state swap into the SAME room that keeps the
 *   LIVE room membership (never the saved one) and announces itself.
 */
import { describe, expect, it } from "vitest";
import {
  createAdventureGameState,
  createAdventureLobbyState,
  redactStateForSeat,
  type GameState
} from "@/engine";
import {
  createRoom,
  getRoomSnapshot,
  getSinglePlayerSaveState,
  loadSinglePlayerSave,
  restoreRoom,
  submitRoomAction
} from "./game-room-store";
import { prepareSinglePlayerLoad, singlePlayerSaveAccess } from "./single-player-save";

function uniqueRoom(name: string): string {
  // NOT `sp-` prefixed: the store types a bare `sp-` room id as single-player
  // at creation, which would turn the multiplayer CONTROL room solo.
  return `savetest-${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A started single-player adventure (1 human + 1 AI seat). */
function soloGame(seed: string): GameState {
  return createAdventureGameState({
    seed,
    scenarioId: "skirmish",
    playerCount: 2,
    rollFirstPlayer: false,
    sessionMode: "single-player",
    computerOpponents: 1
  });
}

/** A started plain 2-human multiplayer adventure (the scope CONTROL). */
function multiplayerGame(seed: string): GameState {
  return createAdventureGameState({ seed, scenarioId: "skirmish", playerCount: 2, rollFirstPlayer: false });
}

function withOwner(state: GameState, owner: { userId?: string; clientId: string }): GameState {
  state.room = {
    hosted: true,
    hostClientId: owner.clientId,
    members: [{ clientId: owner.clientId, name: "Owner", seat: "p1", isHost: true, ...(owner.userId ? { userId: owner.userId } : {}) }],
    visibility: "private",
    ranked: false,
    ...(owner.userId ? { ownerUserId: owner.userId } : {}),
    ownerClientId: owner.clientId
  };
  return state;
}

describe("singlePlayerSaveAccess", () => {
  it("solo-only: a multiplayer table is refused outright (CONTROL)", () => {
    const state = withOwner(multiplayerGame("access-mp"), { clientId: "owner-c" });
    expect(singlePlayerSaveAccess(state, { clientId: "owner-c" })).toEqual({
      ok: false,
      reason: "Save slots exist only for single-player games."
    });
  });

  it("verified owner: the account matches, any other account or guest is refused", () => {
    const state = withOwner(soloGame("access-user"), { clientId: "owner-c", userId: "owner-u" });
    expect(singlePlayerSaveAccess(state, { userId: "owner-u" }).ok).toBe(true);
    expect(singlePlayerSaveAccess(state, { userId: "other-u" }).ok).toBe(false);
    // A guest claiming the owner's clientId does not bypass the account bind.
    expect(singlePlayerSaveAccess(state, { clientId: "owner-c" }).ok).toBe(false);
  });

  it("guest owner: the minting tab's clientId matches, another client is refused", () => {
    const state = withOwner(soloGame("access-guest"), { clientId: "owner-c" });
    expect(singlePlayerSaveAccess(state, { clientId: "owner-c" }).ok).toBe(true);
    expect(singlePlayerSaveAccess(state, { clientId: "intruder-c" }).ok).toBe(false);
  });

  it("a ranked room is refused even if it somehow claimed solo mode (belt-and-braces)", () => {
    const state = withOwner(soloGame("access-ranked"), { clientId: "owner-c" });
    state.room!.ranked = true;
    expect(singlePlayerSaveAccess(state, { clientId: "owner-c" }).ok).toBe(false);
  });
});

describe("prepareSinglePlayerLoad", () => {
  it("grafts the LIVE room membership onto the loaded state and announces the load", () => {
    const current = withOwner(soloGame("load-current"), { clientId: "owner-c" });
    const saved = soloGame("load-current");
    saved.round = 5;
    saved.room = { hosted: true, hostClientId: "stale-c", members: [{ clientId: "stale-c", name: "Stale", seat: "p1", isHost: false }] };
    const savedBytes = JSON.stringify(saved);

    const outcome = prepareSinglePlayerLoad(current, saved, { clientId: "owner-c" });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.state.round).toBe(5);
    // The live room object wins 窶・the stale saved membership never comes back.
    expect(outcome.state.room).toBe(current.room);
    const tail = outcome.state.eventLog[outcome.state.eventLog.length - 1];
    expect(tail.type).toBe("EVENT_NOTE");
    expect("message" in tail ? tail.message : "").toContain("loaded a saved game (round 5)");
    // Loading prepares a detached timeline. The browser-owned checkpoint stays
    // byte-for-byte reusable and never absorbs live room membership or events.
    expect(JSON.stringify(saved)).toBe(savedBytes);
    expect(outcome.state).not.toBe(saved);
  });

  it("CONTROL: refuses a non-single-player snapshot, and refuses loading into a multiplayer room", () => {
    const soloCurrent = withOwner(soloGame("load-scope"), { clientId: "owner-c" });
    const mpSave = multiplayerGame("load-scope-mp");
    expect(prepareSinglePlayerLoad(soloCurrent, mpSave, { clientId: "owner-c" }).ok).toBe(false);

    const mpCurrent = withOwner(multiplayerGame("load-into-mp"), { clientId: "owner-c" });
    const soloSave = soloGame("load-into-mp-save");
    expect(prepareSinglePlayerLoad(mpCurrent, soloSave, { clientId: "owner-c" }).ok).toBe(false);
  });

  it("CONTROL: refuses the wrong actor on a live solo room", () => {
    const current = withOwner(soloGame("load-actor"), { clientId: "owner-c" });
    const saved = soloGame("load-actor");
    expect(prepareSinglePlayerLoad(current, saved, { clientId: "intruder-c" }).ok).toBe(false);
  });

  it("allows a recycled FRESH memberless lobby (recovery), refuses one someone already joined", () => {
    const fresh = createAdventureLobbyState({ seed: "load-fresh" });
    const saved = soloGame("load-fresh-save");
    expect(prepareSinglePlayerLoad(fresh, saved, { clientId: "owner-c" }).ok).toBe(true);

    const joined = createAdventureLobbyState({ seed: "load-joined" });
    joined.room = { hosted: false, hostClientId: null, members: [{ clientId: "someone", name: "Someone", seat: "p1", isHost: false }] };
    expect(prepareSinglePlayerLoad(joined, soloGame("load-joined-save"), { clientId: "owner-c" }).ok).toBe(false);
  });
});

describe("built-in store: getSinglePlayerSaveState / loadSinglePlayerSave", () => {
  function seedSoloRoom(roomId: string): GameState {
    createRoom({ roomId, sessionMode: "single-player", computerOpponents: 1 });
    // A real JOIN first: it stamps single-player ownership onto the live room
    // exactly like production (first owner binds the private room) — and a
    // hosted room only accepts a restore from a member.
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "owner-c", name: "Owner" }, "owner-c");
    restoreRoom(roomId, soloGame(roomId), "owner-c");
    return getRoomSnapshot(roomId).state;
  }

  it("the save fetch returns the RAW state 窶・the redacted frame could never restore it (CONTROL)", () => {
    const roomId = uniqueRoom("raw");
    const live = seedSoloRoom(roomId);

    const result = getSinglePlayerSaveState(roomId, "owner-c");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Raw: the owner's own deck order is intact and matches the live room.
    expect(result.state.players.p1.deck).toEqual(live.players.p1.deck);
    expect(result.state.players.p1.deck.length).toBeGreaterThan(0);
    expect(result.state.players.p1.deck).not.toContain("hidden");
    // CONTROL (the WHY of the server surface): the frame a client receives has
    // the deck order hidden even from the owner, so a client-side capture can
    // never faithfully restore a game.
    expect(redactStateForSeat(live, "p1").players.p1.deck.every((card) => card === "hidden")).toBe(true);

    // Owner-only: a stranger gets nothing.
    expect(getSinglePlayerSaveState(roomId, "intruder-c").ok).toBe(false);
  });

  it("loads a saved snapshot back into the SAME room: whole-state swap, version bump, live membership kept", () => {
    const roomId = uniqueRoom("load");
    seedSoloRoom(roomId);
    const before = getRoomSnapshot(roomId);

    const fetched = getSinglePlayerSaveState(roomId, "owner-c");
    expect(fetched.ok).toBe(true);
    if (!fetched.ok) return;
    const saved = JSON.parse(JSON.stringify(fetched.state)) as GameState;
    saved.round = 7;

    const outcome = loadSinglePlayerSave(roomId, saved, "owner-c");
    expect(outcome.loaded).toBe(true);
    const after = getRoomSnapshot(roomId);
    expect(after.version).toBe(before.version + 1);
    expect(after.state.round).toBe(7);
    expect(after.state.room?.members?.some((member) => member.clientId === "owner-c")).toBe(true);
    const tail = after.state.eventLog[after.state.eventLog.length - 1];
    expect(tail.type).toBe("EVENT_NOTE");

    // CONTROLs: wrong actor and non-solo rooms are refused, room untouched.
    const rejected = loadSinglePlayerSave(roomId, saved, "intruder-c");
    expect(rejected.loaded).toBe(false);
    expect(getRoomSnapshot(roomId).version).toBe(after.version);
  });

  it("CONTROL: a multiplayer room exposes neither surface", () => {
    const roomId = uniqueRoom("mp");
    createRoom({ roomId });
    restoreRoom(roomId, multiplayerGame(roomId));
    expect(getSinglePlayerSaveState(roomId, "owner-c").ok).toBe(false);
    const attempt = loadSinglePlayerSave(roomId, soloGame(`${roomId}-save`), "owner-c");
    expect(attempt.loaded).toBe(false);
  });
});

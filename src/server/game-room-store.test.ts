import { describe, expect, it } from "vitest";
import { createAdventureGameState, createAdventureLobbyState } from "@/engine";
import { getRoomSnapshot, resetRoom, restoreRoom, submitRoomAction } from "./game-room-store";

/** A fresh id per case so disk-persisted rooms from earlier runs never bleed in. */
function uniqueRoom(name: string): string {
  return `test-${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

describe("room recovery (restoreRoom)", () => {
  it("re-seeds a fresh lobby with a cached in-progress game", () => {
    const roomId = uniqueRoom("restore");
    const lobby = getRoomSnapshot(roomId);
    expect(lobby.state.phase).toBe("setup");
    expect(Boolean(lobby.state.setupLobby)).toBe(true);

    const saved = createAdventureGameState({ seed: "restore-seed", difficulty: "normal", rollFirstPlayer: false });
    expect(saved.phase).not.toBe("setup");

    const restored = restoreRoom(roomId, saved);
    expect(restored.state.phase).toBe(saved.phase);
    expect(restored.state.seed).toBe(saved.seed);
    expect(restored.version).toBeGreaterThan(lobby.version);

    // The room now holds the recovered game.
    expect(getRoomSnapshot(roomId).state.phase).toBe(saved.phase);
  });

  it("never clobbers a game already in progress", () => {
    const roomId = uniqueRoom("noclobber");
    const first = createAdventureGameState({ seed: "first-game", difficulty: "normal", rollFirstPlayer: false });
    restoreRoom(roomId, first);

    const second = createAdventureGameState({ seed: "second-game", difficulty: "normal", rollFirstPlayer: false });
    const result = restoreRoom(roomId, second);

    // Refused — the room still holds the first game.
    expect(result.state.seed).toBe(first.seed);
  });

  it("refuses to restore a bare lobby (nothing to recover)", () => {
    const roomId = uniqueRoom("barelobby");
    const before = getRoomSnapshot(roomId);
    const result = restoreRoom(roomId, createAdventureLobbyState({ seed: "another-lobby" }));
    // No real game in the payload, so the room is left untouched.
    expect(result.version).toBe(before.version);
    expect(result.state.phase).toBe("setup");
  });
});

describe("room membership through the store", () => {
  it("carries host and seats across a game reset", () => {
    const roomId = uniqueRoom("carry");
    getRoomSnapshot(roomId); // create the room (fresh lobby)
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "Host" });
    const hosted = submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true }).snapshot;
    expect(hosted.state.room?.hosted).toBe(true);

    const reset = resetRoom(roomId, { mode: "adventure" });
    expect(reset.state.room?.hosted).toBe(true);
    expect(reset.state.room?.hostClientId).toBe("c1");
    expect(reset.state.room?.members.some((member) => member.clientId === "c1")).toBe(true);
  });

  it("enforces seat ownership end-to-end when actorClientId is supplied", () => {
    const roomId = uniqueRoom("seatlock");
    // Seed a started game into the room (restore over the fresh lobby).
    restoreRoom(roomId, createAdventureGameState({ seed: "store-seat", difficulty: "normal", rollFirstPlayer: false }));
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "P1" });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c2", name: "P2" });
    submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true });
    submitRoomAction(roomId, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c1", seat: "p1" });
    submitRoomAction(roomId, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c2", seat: "p2" });

    // The p2 occupant cannot end p1's turn; the wrong-seat owner cannot either.
    expect(submitRoomAction(roomId, { type: "END_TURN", playerId: "p1" }, "c2").result.errors.length).toBeGreaterThan(0);
    expect(submitRoomAction(roomId, { type: "END_TURN", playerId: "p2" }, "c1").result.errors.length).toBeGreaterThan(0);

    // The p1 occupant may end p1's turn.
    const allowed = submitRoomAction(roomId, { type: "END_TURN", playerId: "p1" }, "c1");
    expect(allowed.result.errors).toHaveLength(0);
    expect(allowed.snapshot.state.activePlayerId).toBe("p2");
  });
});

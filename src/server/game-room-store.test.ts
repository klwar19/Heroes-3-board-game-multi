import { describe, expect, it } from "vitest";
import { createAdventureGameState, createAdventureLobbyState } from "@/engine";
import { getRoomSnapshot, restoreRoom } from "./game-room-store";

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

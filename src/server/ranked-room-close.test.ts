/**
 * After a real RANKED win/loss is attributed, the room is force-closed so a
 * rematch cannot reuse the same table (seed / matchSeats edge cases that leave
 * MMR unaccounted). Casual, single-player and unfinished games stay open.
 */
import { afterEach, describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState } from "@/engine";
import {
  closeRoom,
  createRoom,
  forceCloseRoom,
  getRoomSnapshot,
  submitRoomAction
} from "./game-room-store";
import { detectFinishedMatch } from "./match-report";

const roomsToClose: string[] = [];

afterEach(() => {
  for (const roomId of roomsToClose.splice(0)) {
    forceCloseRoom(roomId);
  }
});

describe("ranked room auto-close after match", () => {
  it("forceCloseRoom deletes the room (system close works without a host)", () => {
    const roomId = `ranked-force-${Date.now()}`;
    roomsToClose.push(roomId);
    createRoom({ roomId, name: "Force Close", createdByName: "Host" });
    // Host the table so a normal close would need authority.
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "Host" });
    submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true });
    // Stranger cannot close a hosted room.
    expect(closeRoom(roomId, "stranger").closed).toBe(false);
    // System force-close bypasses the host gate.
    expect(forceCloseRoom(roomId, "ranked match finished").closed).toBe(true);
    // Room is gone — recreate succeeds as a fresh lobby.
    const recreated = createRoom({ roomId, name: "Again", createdByName: "Host" });
    expect(recreated.state.phase).toBe("setup");
    forceCloseRoom(roomId);
  });

  it("a ranked finish produces ranked:true (close gate); casual produces ranked:false", () => {
    const base = createAdventureGameState({
      seed: "ranked-close-contract",
      playerCount: 2,
      rollFirstPlayer: false,
      rotateStartTiles: false,
      players: [
        { id: "p1", name: "Alice", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Bob", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
    base.room = {
      hosted: true,
      hostClientId: "c1",
      ranked: true,
      members: [
        { clientId: "c1", name: "Alice", seat: "p1", isHost: true, userId: "u_alice" },
        { clientId: "c2", name: "Bob", seat: "p2", isHost: false, userId: "u_bob" }
      ],
      matchSeats: {
        p1: { userId: "u_alice", name: "Alice" },
        p2: { userId: "u_bob", name: "Bob" }
      }
    };
    const after = applyAction(
      base,
      { type: "GIVE_UP", playerId: "p2" },
      { now: 2_000_000, actorClientId: "c2", actorUserId: "u_bob" }
    );
    expect(after.errors).toEqual([]);
    expect(after.state.adventure?.winnerPlayerId).toBe("p1");

    const rankedMatch = detectFinishedMatch(base, after.state);
    expect(rankedMatch?.ranked).toBe(true);

    // CONTROL: casual still records W/L but ranked is false → auto-close must not fire.
    const casualPrev = structuredClone(base);
    casualPrev.room = { ...casualPrev.room!, ranked: false };
    const casualNext = structuredClone(after.state);
    casualNext.room = { ...casualNext.room!, ranked: false };
    expect(detectFinishedMatch(casualPrev, casualNext)?.ranked).toBe(false);
  });

  it("host-driven closeRoom still works (manual close path intact)", () => {
    const roomId = `manual-close-${Date.now()}`;
    roomsToClose.push(roomId);
    createRoom({ roomId, name: "Manual", createdByName: "Host" });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "Host" });
    submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true });
    expect(closeRoom(roomId, "c1").closed).toBe(true);
  });

  it("CONTROL: getRoomSnapshot after force-close is gone / not the old game", () => {
    const roomId = `gone-${Date.now()}`;
    roomsToClose.push(roomId);
    createRoom({ roomId, name: "Gone", createdByName: "Host" });
    forceCloseRoom(roomId, "test");
    // getRoomSnapshot recreates an empty lobby when the id is requested again —
    // the finished ranked game state must NOT come back.
    const snap = getRoomSnapshot(roomId);
    expect(snap.state.adventure?.winnerPlayerId ?? null).toBeNull();
    expect(snap.state.phase).toBe("setup");
    forceCloseRoom(roomId);
  });
});

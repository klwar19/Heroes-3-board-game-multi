import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAdventureGameState, createAdventureLobbyState } from "@/engine";
import {
  closeRoom,
  createRoom,
  getRoomSnapshot,
  listRooms,
  resetRoom,
  restoreRoom,
  STALE_ROOM_TTL_MS,
  submitRoomAction
} from "./game-room-store";

/** A fresh id per case so disk-persisted rooms from earlier runs never bleed in. */
function uniqueRoom(name: string): string {
  return `test-${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The same persist dir the store reads (no HOMM3BG_ROOM_DIR set under vitest). */
const persistDir = process.env.HOMM3BG_ROOM_DIR ?? join(tmpdir(), "homm3bg-rooms");

function entryFor(roomId: string, viewerClientId?: string) {
  return listRooms(viewerClientId).find((entry) => entry.roomId === roomId) ?? null;
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

  it("carries the room name and creation stamp across a game reset", () => {
    const roomId = uniqueRoom("namekeep");
    const created = createRoom({ roomId, name: "Friday Night", createdByName: "Binh" });
    expect(created.state.room?.name).toBe("Friday Night");
    const createdAt = created.createdAt;

    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "Binh" });
    const reset = resetRoom(roomId, { mode: "adventure" });
    // The name survives (carried via state.room) and the creation stamp is not re-minted.
    expect(reset.state.room?.name).toBe("Friday Night");
    expect(reset.createdAt).toBe(createdAt);
    expect(reset.createdByName).toBe("Binh");
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

describe("lobby directory (listRooms / createRoom)", () => {
  it("lists a created room with its name, host, and member counts", () => {
    const roomId = uniqueRoom("dir");
    createRoom({ roomId, name: "Binh's Game", createdByName: "Binh" });

    let entry = entryFor(roomId);
    expect(entry).not.toBeNull();
    expect(entry?.name).toBe("Binh's Game");
    expect(entry?.createdByName).toBe("Binh");
    expect(entry?.inProgress).toBe(false); // fresh setup lobby
    expect(entry?.memberCount).toBe(0);
    expect(entry?.hosted).toBe(false);

    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "Binh" });
    submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true });
    submitRoomAction(roomId, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c1", seat: "p1" });

    entry = entryFor(roomId);
    expect(entry?.memberCount).toBe(1);
    expect(entry?.seatedCount).toBe(1);
    expect(entry?.hosted).toBe(true);
    expect(entry?.hostName).toBe("Binh");

    // canClose is per-viewer: the host may close a hosted room, others may not.
    expect(entryFor(roomId, "c1")?.canClose).toBe(true);
    expect(entryFor(roomId, "stranger")?.canClose).toBe(false);
    expect(entryFor(roomId)?.canClose).toBe(false); // no viewer → not closeable
  });

  it("reflects a live SET_ROOM_NAME rename in the directory", () => {
    const roomId = uniqueRoom("rename");
    createRoom({ roomId });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "Alice" });
    // Default label before naming.
    expect(entryFor(roomId)?.name).toBe(`Room ${roomId}`);

    submitRoomAction(roomId, { type: "SET_ROOM_NAME", clientId: "c1", name: "Renamed" });
    expect(entryFor(roomId)?.name).toBe("Renamed");
  });

  it("mints a unique id when none is given and never overwrites an existing room", () => {
    const a = createRoom({ name: "A" });
    const b = createRoom({ name: "B" });
    expect(a.roomId).not.toBe(b.roomId);
    expect(entryFor(a.roomId)?.name).toBe("A");
    expect(entryFor(b.roomId)?.name).toBe("B");

    // Re-creating a pinned, existing id returns the existing room (no clobber):
    // its members and original name are untouched, NOT replaced.
    submitRoomAction(a.roomId, { type: "JOIN_ROOM", clientId: "c1", name: "Keep" });
    const again = createRoom({ roomId: a.roomId, name: "Should Not Replace" });
    expect(again.state.room?.members.some((m) => m.clientId === "c1")).toBe(true);
    expect(again.state.room?.name).toBe("A"); // unchanged: never renamed to "Should Not Replace"
  });
});

describe("closing a room (closeRoom)", () => {
  it("lets the host close a hosted room and refuses everyone else", () => {
    const roomId = uniqueRoom("close");
    createRoom({ roomId, name: "Closable" });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "Host" });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c2", name: "Guest" });
    submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true });

    // A non-host (and a stranger) cannot close it.
    expect(closeRoom(roomId, "c2").closed).toBe(false);
    expect(closeRoom(roomId, "stranger").closed).toBe(false);
    expect(entryFor(roomId)).not.toBeNull(); // still there

    // The host can.
    expect(closeRoom(roomId, "c1").closed).toBe(true);
    expect(entryFor(roomId)).toBeNull(); // gone from the directory
  });

  it("lets any member close an open table but not an outsider", () => {
    const roomId = uniqueRoom("closeopen");
    createRoom({ roomId });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "A" });

    expect(closeRoom(roomId, "outsider").closed).toBe(false);
    expect(closeRoom(roomId, "c1").closed).toBe(true);
    expect(entryFor(roomId)).toBeNull();
  });

  it("is idempotent when the room is already gone", () => {
    const roomId = uniqueRoom("closegone");
    expect(closeRoom(roomId).closed).toBe(true);
  });
});

describe("stale-room expiry", () => {
  /** Writes a record straight to the persist dir with a chosen updatedAt. */
  function seedDiskRoom(roomId: string, updatedAt: string, members: { clientId: string; name: string }[]) {
    if (!existsSync(persistDir)) {
      mkdirSync(persistDir, { recursive: true });
    }
    const state = createAdventureLobbyState({ seed: `stale-${roomId}` });
    state.room = {
      hosted: false,
      hostClientId: null,
      members: members.map((m) => ({ ...m, seat: "observer" as const, isHost: false }))
    };
    const record = { roomId, version: 1, createdAt: updatedAt, updatedAt, state };
    writeFileSync(join(persistDir, `${roomId}.json`), JSON.stringify(record));
  }

  it("prunes an empty room idle past the TTL but keeps a recent one", () => {
    const oldEmpty = uniqueRoom("oldempty");
    const freshEmpty = uniqueRoom("freshempty");
    const oldStamp = new Date(Date.now() - STALE_ROOM_TTL_MS - 60_000).toISOString();
    const freshStamp = new Date().toISOString();
    seedDiskRoom(oldEmpty, oldStamp, []);
    seedDiskRoom(freshEmpty, freshStamp, []);

    const ids = listRooms().map((entry) => entry.roomId);
    expect(ids).not.toContain(oldEmpty); // pruned
    expect(ids).toContain(freshEmpty); // kept (recent)
    // The pruned room's file is deleted too.
    expect(existsSync(join(persistDir, `${oldEmpty}.json`))).toBe(false);
  });

  it("never prunes an idle room that still has members", () => {
    const oldOccupied = uniqueRoom("oldoccupied");
    const oldStamp = new Date(Date.now() - STALE_ROOM_TTL_MS - 60_000).toISOString();
    seedDiskRoom(oldOccupied, oldStamp, [{ clientId: "c1", name: "Stayed" }]);

    expect(listRooms().map((entry) => entry.roomId)).toContain(oldOccupied);
  });
});

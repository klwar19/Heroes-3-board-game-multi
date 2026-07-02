import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createAdventureLobbyState, getLegalActions } from "@/engine";
import {
  closeRoom,
  createRoom,
  getRoomSnapshot,
  handleRoomDisconnect,
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

  it("only a member may restore over a HOSTED lobby (an outsider cannot stomp it)", () => {
    const roomId = uniqueRoom("restoreauth");
    getRoomSnapshot(roomId);
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "Host" });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c2", name: "Guest" });
    submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true });
    const before = getRoomSnapshot(roomId);
    const fabricated = createAdventureGameState({ seed: "fabricated", difficulty: "normal", rollFirstPlayer: false });

    // An outsider (and an anonymous caller) bounce off — the hosted lobby stays.
    for (const actor of ["stranger", undefined] as const) {
      const denied = restoreRoom(roomId, fabricated, actor);
      expect(denied.version).toBe(before.version);
      expect(denied.state.phase).toBe("setup");
    }

    // Any member of the hosted table may push the recovered game (the CONTROL —
    // recovery can come from whichever participant's tab reconnects first).
    const restored = restoreRoom(roomId, fabricated, "c2");
    expect(restored.state.seed).toBe("fabricated");
    expect(restored.version).toBeGreaterThan(before.version);
  });
});

describe("room membership through the store", () => {
  it("carries host and seats across a game reset", () => {
    const roomId = uniqueRoom("carry");
    getRoomSnapshot(roomId); // create the room (fresh lobby)
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "Host" });
    const hosted = submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true }).snapshot;
    expect(hosted.state.room?.hosted).toBe(true);

    const reset = resetRoom(roomId, { mode: "adventure" }, "c1").snapshot;
    expect(reset.state.room?.hosted).toBe(true);
    expect(reset.state.room?.hostClientId).toBe("c1");
    expect(reset.state.room?.members.some((member) => member.clientId === "c1")).toBe(true);
  });

  it("refuses a hosted-room reset from anyone but the host (mirrors closeRoom)", () => {
    const roomId = uniqueRoom("resetauth");
    getRoomSnapshot(roomId);
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "Host" });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c2", name: "Guest" });
    submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true });
    const before = getRoomSnapshot(roomId);

    // A guest, and an anonymous caller, both bounce off — the game is untouched.
    for (const actor of ["c2", undefined] as const) {
      const denied = resetRoom(roomId, { mode: "adventure" }, actor);
      expect(denied.reset).toBe(false);
      expect(denied.reason).toMatch(/host/i);
      expect(denied.snapshot.version).toBe(before.version);
      expect(denied.snapshot.state.seed).toBe(before.state.seed);
    }

    // The host's own reset goes through (the CONTROL for the guard above).
    const allowed = resetRoom(roomId, { mode: "adventure" }, "c1");
    expect(allowed.reset).toBe(true);
    expect(allowed.snapshot.state.seed).not.toBe(before.state.seed);
  });

  it("carries the room name and creation stamp across a game reset", () => {
    const roomId = uniqueRoom("namekeep");
    const created = createRoom({ roomId, name: "Friday Night", createdByName: "Binh" });
    expect(created.state.room?.name).toBe("Friday Night");
    const createdAt = created.createdAt;

    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "Binh" });
    const reset = resetRoom(roomId, { mode: "adventure" }).snapshot;
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

  it("keeps player 2's settlement reroll and tile rotation with player 2 when player 2 is host", () => {
    const roomId = uniqueRoom("p2-host-far-tile");
    let seeded = createAdventureGameState({ seed: "p2-host-far", difficulty: "normal", rollFirstPlayer: false });
    for (const player of Object.values(seeded.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    seeded.activePlayerId = "p2";
    seeded.heroes.hero_p2.spaceId = "h:7:2";
    seeded.heroes.hero_p2.movementPoints = 5;
    seeded.adventure!.farTilesOpenedByPlayer!.p2 = 1;
    seeded.adventure!.farTileScriptedDraws = ["F4", "F1"];

    const placed = applyAction(seeded, {
      type: "PLACE_TILE",
      playerId: "p2",
      heroId: "hero_p2",
      supplyIndex: 0,
      centerRow: 6,
      centerCol: 4
    });
    expect(placed.errors).toHaveLength(0);
    seeded = placed.state;
    expect(seeded.pendingChoice).toMatchObject({ playerId: "p2", context: "far-tile-flip" });
    restoreRoom(roomId, seeded);

    // Joining player 2 first makes them the host — the reported failure mode.
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c2", name: "P2 Host" });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "P1 Guest" });
    submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: "c2", hosted: true });
    submitRoomAction(roomId, { type: "ASSIGN_SEAT", clientId: "c2", targetClientId: "c1", seat: "p1" });
    submitRoomAction(roomId, { type: "ASSIGN_SEAT", clientId: "c2", targetClientId: "c2", seat: "p2" });

    let choice = getRoomSnapshot(roomId).state.pendingChoice!;
    expect(
      submitRoomAction(
        roomId,
        { type: "CHOOSE_OPTION", playerId: "p2", choiceId: choice.id, optionIndex: 1 },
        "c1"
      ).result.errors.length
    ).toBeGreaterThan(0);

    let accepted = submitRoomAction(
      roomId,
      { type: "CHOOSE_OPTION", playerId: "p2", choiceId: choice.id, optionIndex: 1 },
      "c2"
    );
    expect(accepted.result.errors).toHaveLength(0);
    expect(accepted.snapshot.state.pendingChoice).toMatchObject({ playerId: "p2", context: "far-tile-flip" });

    choice = accepted.snapshot.state.pendingChoice!;
    accepted = submitRoomAction(
      roomId,
      { type: "CHOOSE_OPTION", playerId: "p2", choiceId: choice.id, optionIndex: 0 },
      "c2"
    );
    expect(accepted.result.errors).toHaveLength(0);
    expect(accepted.snapshot.state.adventure!.pendingTileChoice?.playerId).toBe("p2");

    const rotation = getLegalActions(accepted.snapshot.state, "p2").find(
      (legal) => legal.action.type === "SET_TILE_ROTATION"
    );
    expect(rotation).toBeTruthy();
    expect(submitRoomAction(roomId, rotation!.action, "c1").result.errors.length).toBeGreaterThan(0);
    expect(submitRoomAction(roomId, rotation!.action, "c2").result.errors).toHaveLength(0);
  });

  it("does not let a player-2 host answer player 1's City Hall choice", () => {
    const roomId = uniqueRoom("p2-host-city-hall");
    const seeded = createAdventureGameState({ seed: "city-hall-owner", difficulty: "normal", rollFirstPlayer: false });
    seeded.phase = "choice";
    seeded.priorityPlayerId = "p1";
    seeded.pendingChoice = {
      id: "choice_city_hall_owner",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "Choose your City Hall income",
      options: [{ label: "Gain 2 gold" }],
      context: "city-hall",
      cityHall: { options: [{ label: "Gain 2 gold", gold: 2 }] },
      returnPhase: "player-turn"
    };
    const goldBefore = seeded.players.p1.resources.gold;
    restoreRoom(roomId, seeded);

    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c2", name: "P2 Host" });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "P1 Guest" });
    submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: "c2", hosted: true });
    submitRoomAction(roomId, { type: "ASSIGN_SEAT", clientId: "c2", targetClientId: "c1", seat: "p1" });
    submitRoomAction(roomId, { type: "ASSIGN_SEAT", clientId: "c2", targetClientId: "c2", seat: "p2" });

    const choiceAction = {
      type: "CHOOSE_OPTION" as const,
      playerId: "p1",
      choiceId: "choice_city_hall_owner",
      optionIndex: 0
    };
    expect(submitRoomAction(roomId, choiceAction, "c2").result.errors.length).toBeGreaterThan(0);
    const allowed = submitRoomAction(roomId, choiceAction, "c1");
    expect(allowed.result.errors).toHaveLength(0);
    expect(allowed.snapshot.state.players.p1.resources.gold).toBe(goldBefore + 2);
    expect(allowed.snapshot.state.players.p2.resources.gold).toBe(seeded.players.p2.resources.gold);
  });

  it("keeps a map event/visit selection with its owning player", () => {
    const roomId = uniqueRoom("event-choice-owner");
    const seeded = createAdventureGameState({ seed: "event-choice-owner", difficulty: "normal", rollFirstPlayer: false });
    const fieldId = seeded.heroes.hero_p1.spaceId!;
    seeded.phase = "player-turn";
    seeded.activePlayerId = "p1";
    seeded.adventure!.pendingVisit = {
      heroId: "hero_p1",
      playerId: "p1",
      fieldId,
      steps: [
        {
          type: "CHOOSE_ONE",
          prompt: "Choose this event's reward",
          options: [
            { label: "Gain 1 gold", steps: [{ type: "GAIN_RESOURCES", gold: 1 }] },
            { label: "Gain 1 movement", steps: [{ type: "GAIN_MOVEMENT", amount: 1 }] }
          ]
        }
      ]
    };
    const goldBefore = seeded.players.p1.resources.gold;
    restoreRoom(roomId, seeded);

    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c2", name: "P2 Host" });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "P1 Guest" });
    submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: "c2", hosted: true });
    submitRoomAction(roomId, { type: "ASSIGN_SEAT", clientId: "c2", targetClientId: "c1", seat: "p1" });
    submitRoomAction(roomId, { type: "ASSIGN_SEAT", clientId: "c2", targetClientId: "c2", seat: "p2" });

    const eventAction = getLegalActions(getRoomSnapshot(roomId).state, "p1").find(
      (legal) => legal.action.type === "RESOLVE_VISIT_STEP" && legal.action.optionIndex === 0
    )?.action;
    expect(eventAction).toBeTruthy();
    expect(submitRoomAction(roomId, eventAction!, "c2").result.errors.length).toBeGreaterThan(0);

    const allowed = submitRoomAction(roomId, eventAction!, "c1");
    expect(allowed.result.errors).toHaveLength(0);
    expect(allowed.snapshot.state.players.p1.resources.gold).toBe(goldBefore + 1);
    expect(allowed.snapshot.state.adventure!.pendingVisit).toBeNull();
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

  it("lets ANYONE close an open table (a fresh session no longer owns it)", () => {
    const roomId = uniqueRoom("closeopen");
    createRoom({ roomId });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "A" });

    // An outsider (e.g. the SAME person on a new browser session with a fresh
    // clientId) can close an open table — the fix for undeletable rooms. The
    // hosted test above is the control that a hosted room still refuses them.
    expect(closeRoom(roomId, "outsider").closed).toBe(true);
    expect(entryFor(roomId)).toBeNull();
  });

  it("lets a member close their own open table too", () => {
    const roomId = uniqueRoom("closeopen-self");
    createRoom({ roomId });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "c1", name: "A" });
    expect(closeRoom(roomId, "c1").closed).toBe(true);
    expect(entryFor(roomId)).toBeNull();
  });

  it("is idempotent when the room is already gone", () => {
    const roomId = uniqueRoom("closegone");
    expect(closeRoom(roomId).closed).toBe(true);
  });
});

describe("presence cleanup on disconnect (handleRoomDisconnect)", () => {
  it("keeps one computer from being counted as many after rejoining", () => {
    const roomId = uniqueRoom("ghosts");
    createRoom({ roomId, name: "Rejoin" });

    // Same computer joins, leaves (tab close → stream drop), then rejoins under a
    // NEW per-tab client id — the exact "keep joining back and forth" loop.
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "tab-1", name: "Solo" });
    expect(entryFor(roomId)?.memberCount).toBe(1);

    handleRoomDisconnect(roomId, "tab-1"); // the stream for tab-1 dropped
    expect(entryFor(roomId)?.memberCount).toBe(0);

    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "tab-2", name: "Solo" });
    handleRoomDisconnect(roomId, "tab-2");
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "tab-3", name: "Solo" });

    // Without the reap this would read 3; the ghosts are gone, so it is 1.
    const entry = entryFor(roomId);
    expect(entry?.memberCount).toBe(1);
    expect(entry?.memberCount).not.toBe(3);

    // An emptied, abandoned room is closeable again by anyone browsing the lobby.
    handleRoomDisconnect(roomId, "tab-3");
    expect(entryFor(roomId)?.memberCount).toBe(0);
    expect(entryFor(roomId, "any-browser")?.canClose).toBe(true);
  });

  it("broadcasts the corrected snapshot to the other clients in the room", () => {
    const roomId = uniqueRoom("disc-broadcast");
    createRoom({ roomId });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "a", name: "A" });
    const before = submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "b", name: "B" }).snapshot;

    handleRoomDisconnect(roomId, "b");
    const after = getRoomSnapshot(roomId);
    expect(after.version).toBeGreaterThan(before.version); // a new frame was produced
    expect(after.state.room?.members.map((member) => member.clientId)).toEqual(["a"]);
  });

  it("never reaps a seated player on a hosted-game disconnect (no lost turns)", () => {
    const roomId = uniqueRoom("disc-seated");
    restoreRoom(roomId, createAdventureGameState({ seed: "disc-seat", difficulty: "normal", rollFirstPlayer: false }));
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "host", name: "Host" });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "p2", name: "Two" });
    submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: "host", hosted: true });
    submitRoomAction(roomId, { type: "ASSIGN_SEAT", clientId: "host", targetClientId: "host", seat: "p1" });
    submitRoomAction(roomId, { type: "ASSIGN_SEAT", clientId: "host", targetClientId: "p2", seat: "p2" });

    // p2's socket blips: their seat (and its action authority) must survive.
    handleRoomDisconnect(roomId, "p2");
    const snapshot = getRoomSnapshot(roomId);
    expect(snapshot.state.room?.members.find((member) => member.clientId === "p2")?.seat).toBe("p2");
    // The seat lock still binds p2's seat to client "p2" alone — nobody else can
    // act for it, and p2 cannot act for p1.
    expect(submitRoomAction(roomId, { type: "END_TURN", playerId: "p2" }, "host").result.errors.length).toBeGreaterThan(0);
    expect(submitRoomAction(roomId, { type: "END_TURN", playerId: "p1" }, "p2").result.errors.length).toBeGreaterThan(0);
    // ...and the seated owner still acts for their own seat.
    expect(submitRoomAction(roomId, { type: "END_TURN", playerId: "p1" }, "host").result.errors).toHaveLength(0);
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

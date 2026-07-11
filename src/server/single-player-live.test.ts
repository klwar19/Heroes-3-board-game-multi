/**
 * Live single-player wiring over BOTH backends: the computer runner settles
 * inside the same transaction as the triggering human action (built-in store
 * submitRoomAction; PartyKit socket action path), resets preserve the
 * single-player session, and the fresh-room-only creation rules hold — an
 * established room can never be flipped into a private single-player one.
 * Each claim fails if its wiring is removed, with a multiplayer CONTROL.
 */
import { describe, expect, it } from "vitest";
import GameRoomServer, { type RoomSnapshot } from "../../party/index";
import {
  computerDecisionOwner,
  createAdventureLobbyState,
  sessionModeOf,
  type GameState
} from "@/engine";
import { createRoom, listRooms, resetRoom, submitRoomAction } from "./game-room-store";

function uniqueId(name: string): string {
  return `${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

describe("single-player over the built-in store", () => {
  it("mints a non-guessable private room id (128 random bits, not the public suffix)", () => {
    const created = createRoom({ sessionMode: "single-player", computerOpponents: 1 });
    expect(created.roomId).toMatch(/^sp-[0-9a-f]{32}$/);
  });

  it("one human pick settles every computer seat inside the same action transaction", () => {
    const roomId = uniqueId("sp-live");
    createRoom({ roomId, sessionMode: "single-player", computerOpponents: 2 });

    const joined = submitRoomAction(
      roomId,
      { type: "JOIN_ROOM", clientId: "owner-1", name: "Owner" },
      "owner-1"
    );
    expect(joined.result.errors).toEqual([]);
    // Human first dibs: joining alone triggers no computer picks.
    expect(
      joined.snapshot.state.setupLobby!.seats.slice(1).every((seat) => !seat.factionId)
    ).toBe(true);

    const picked = submitRoomAction(
      roomId,
      { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" },
      "owner-1"
    );
    expect(picked.result.errors).toEqual([]);
    // The SAME response already carries the computers' completed setup.
    const seats = picked.snapshot.state.setupLobby!.seats;
    expect(seats.every((seat) => seat.factionId && seat.heroDefId)).toBe(true);
    expect(new Set(seats.map((seat) => seat.factionId)).size).toBe(3);

    // Start builds immediately (no ready check) and the runner settles all
    // computer work it owes before the response returns.
    const started = submitRoomAction(
      roomId,
      { type: "START_ADVENTURE", playerId: "p1" },
      "owner-1"
    );
    expect(started.result.errors).toEqual([]);
    expect(started.snapshot.state.setupLobby).toBeNull();
    expect(started.snapshot.state.adventure).not.toBeNull();
    expect(computerDecisionOwner(started.snapshot.state)).toBeNull();
  });

  it("a reset keeps the single-player session, seats and privacy (rematch)", () => {
    const roomId = uniqueId("sp-reset");
    createRoom({ roomId, sessionMode: "single-player", computerOpponents: 3 });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "owner-1", name: "Owner" }, "owner-1");

    const outcome = resetRoom(roomId, {}, "owner-1");
    expect(outcome.reset).toBe(true);
    const state = outcome.snapshot.state;
    expect(sessionModeOf(state)).toBe("single-player");
    expect(state.setupLobby?.seats).toHaveLength(4);
    expect(state.controllers?.p2?.kind).toBe("computer");
    expect(state.controllers?.p4?.kind).toBe("computer");
    // The private room membership (owner, visibility) carried across.
    expect(state.room?.visibility).toBe("private");
    expect(state.room?.members[0]?.seat).toBe("p1");
    expect(listRooms().some((room) => room.roomId === roomId)).toBe(false);
  });

  it("a reset can NOT flip an established room into single-player (fresh-room-only)", () => {
    const roomId = uniqueId("mp-noflip");
    createRoom({ roomId });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "player-1", name: "Alice" }, "player-1");

    const flipped = resetRoom(roomId, { sessionMode: "single-player", computerOpponents: 2 }, "player-1");
    expect(flipped.reset).toBe(true);
    expect(sessionModeOf(flipped.snapshot.state)).toBe("multiplayer");
    expect(flipped.snapshot.state.controllers).toBeUndefined();

    // CONTROL: a memberless fresh lobby (the implicit-creation flow) may still
    // become single-player through the same reset path.
    const freshId = uniqueId("mp-fresh");
    createRoom({ roomId: freshId });
    const created = resetRoom(freshId, { sessionMode: "single-player", computerOpponents: 2 });
    expect(sessionModeOf(created.snapshot.state)).toBe("single-player");
  });
});

// ---------------------------------------------------------------------------
// PartyKit edge server
// ---------------------------------------------------------------------------

type EdgeRoom = ConstructorParameters<typeof GameRoomServer>[0];
type EdgeConnection = Parameters<GameRoomServer["onConnect"]>[0];

type MockConnection = { id: string; uri: string; received: string[]; send: (data: string) => void };

function makeConnection(id: string, query: string): MockConnection {
  const received: string[] = [];
  return {
    id,
    uri: `https://example.partykit.dev/parties/main/room?${query}`,
    received,
    send: (data: string) => received.push(data)
  };
}

function makeEdgeRoom(roomId: string, seedState: GameState | null) {
  const storage = new Map<string, unknown>();
  if (seedState) {
    storage.set("snapshot", {
      roomId,
      version: 7,
      updatedAt: new Date().toISOString(),
      state: seedState
    } satisfies RoomSnapshot);
  }
  const connections = new Set<MockConnection>();
  const room = {
    id: roomId,
    storage: {
      get: async (key: string) => storage.get(key),
      put: async (key: string, value: unknown) => {
        storage.set(key, value);
      },
      delete: async (key: string) => storage.delete(key)
    },
    broadcast: (data: string) => {
      for (const connection of connections) {
        connection.send(data);
      }
    },
    getConnections: () => connections.values(),
    context: { parties: {} }
  };
  return { room: room as unknown as EdgeRoom, connections, storage };
}

function lastSnapshotOf(conn: MockConnection): RoomSnapshot {
  for (let i = conn.received.length - 1; i >= 0; i -= 1) {
    const message = JSON.parse(conn.received[i]) as { snapshot?: RoomSnapshot };
    if (message.snapshot) {
      return message.snapshot;
    }
  }
  throw new Error(`${conn.id} received no snapshot`);
}

/** A single-player lobby snapshot as it exists after the owner joined. */
function ownedSinglePlayerState(seed: string): GameState {
  const state = createAdventureLobbyState({
    seed,
    scenarioId: "skirmish",
    sessionMode: "single-player",
    computerOpponents: 2
  });
  state.room = {
    hosted: true,
    hostClientId: "owner-1",
    visibility: "private",
    ranked: false,
    ownerClientId: "owner-1",
    members: [{ clientId: "owner-1", name: "Owner", seat: "p1", isHost: true }]
  };
  return state;
}

describe("single-player over the PartyKit edge", () => {
  it("the FIRST connection's ?singlePlayer marker creates a private single-player room", async () => {
    const { room, connections } = makeEdgeRoom("edge-sp-create", null);
    const server = new GameRoomServer(room);
    await server.onStart();
    const owner = makeConnection("owner-conn", "clientId=owner-1&singlePlayer=2");
    connections.add(owner);
    server.onConnect(owner as unknown as EdgeConnection);

    const snapshot = lastSnapshotOf(owner);
    expect(sessionModeOf(snapshot.state)).toBe("single-player");
    expect(snapshot.state.setupLobby?.seats.map((seat) => seat.name)).toEqual([
      "Player 1",
      "Computer 1",
      "Computer 2"
    ]);
  });

  it("a later connection's marker can NOT flip an existing room (CONTROL)", async () => {
    const multiplayer = createAdventureLobbyState({ seed: "edge-sp-noflip" });
    const { room, connections } = makeEdgeRoom("edge-sp-noflip", multiplayer);
    const server = new GameRoomServer(room);
    await server.onStart();
    const intruder = makeConnection("intruder-conn", "clientId=x-1&singlePlayer=3");
    connections.add(intruder);
    server.onConnect(intruder as unknown as EdgeConnection);

    expect(sessionModeOf(lastSnapshotOf(intruder).state)).toBe("multiplayer");
  });

  it("an edge action settles the computer seats in the same serialized transaction", async () => {
    const { room, connections } = makeEdgeRoom("edge-sp-action", ownedSinglePlayerState("edge-sp-action"));
    const server = new GameRoomServer(room);
    await server.onStart();
    const owner = makeConnection("owner-conn", "clientId=owner-1");
    connections.add(owner);
    server.onConnect(owner as unknown as EdgeConnection);

    await server.onMessage(
      JSON.stringify({
        type: "action",
        action: { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" },
        actorClientId: "owner-1"
      }),
      owner as unknown as EdgeConnection
    );

    const seats = lastSnapshotOf(owner).state.setupLobby!.seats;
    expect(seats.every((seat) => seat.factionId && seat.heroDefId)).toBe(true);
    expect(new Set(seats.map((seat) => seat.factionId)).size).toBe(3);
  });

  it("an edge reset preserves the single-player session; an established room refuses the flip", async () => {
    const { room, connections } = makeEdgeRoom("edge-sp-reset", ownedSinglePlayerState("edge-sp-reset"));
    const server = new GameRoomServer(room);
    await server.onStart();
    const owner = makeConnection("owner-conn", "clientId=owner-1");
    connections.add(owner);
    server.onConnect(owner as unknown as EdgeConnection);

    await server.onMessage(
      JSON.stringify({ type: "reset", mode: "adventure", actorClientId: "owner-1" }),
      owner as unknown as EdgeConnection
    );
    const rematch = lastSnapshotOf(owner);
    expect(sessionModeOf(rematch.state)).toBe("single-player");
    expect(rematch.state.setupLobby?.seats).toHaveLength(3);
    expect(rematch.state.controllers?.p2?.kind).toBe("computer");
    expect(rematch.state.room?.visibility).toBe("private");

    // CONTROL: a hosted MULTIPLAYER room with members refuses the flip even
    // from its own host.
    const mp = createAdventureLobbyState({ seed: "edge-mp-noflip" });
    mp.room = {
      hosted: true,
      hostClientId: "host-1",
      members: [{ clientId: "host-1", name: "Host", seat: "p1", isHost: true }]
    };
    const mpRoom = makeEdgeRoom("edge-mp-noflip", mp);
    const mpServer = new GameRoomServer(mpRoom.room);
    await mpServer.onStart();
    const host = makeConnection("host-conn", "clientId=host-1");
    mpRoom.connections.add(host);
    mpServer.onConnect(host as unknown as EdgeConnection);
    await mpServer.onMessage(
      JSON.stringify({
        type: "reset",
        mode: "adventure",
        sessionMode: "single-player",
        computerOpponents: 2,
        actorClientId: "host-1"
      }),
      host as unknown as EdgeConnection
    );
    expect(sessionModeOf(lastSnapshotOf(host).state)).toBe("multiplayer");
  });
});

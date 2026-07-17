/**
 * OPTIONAL "Undo moves" mode on the PartyKit EDGE backend (party/index.ts),
 * exercised through the real `onMessage` WebSocket action path — the same path
 * production uses. Both backends call the shared undo-history helpers at the
 * same seams; this pins the edge wiring so it cannot silently diverge from the
 * built-in store (covered in undo-history.test.ts).
 */
import { beforeEach, describe, expect, it } from "vitest";
import GameRoomServer, { type RoomSnapshot } from "../../party/index";
import {
  createAdventureGameState,
  getLegalActions,
  type GameAction,
  type GameState
} from "@/engine";
import { __resetUndoHistoriesForTests, undoDepth } from "./undo-history";

beforeEach(() => {
  __resetUndoHistoriesForTests();
});

type MockConnection = { id: string; uri: string; received: string[]; send: (data: string) => void };
type EdgeRoom = ConstructorParameters<typeof GameRoomServer>[0];
type EdgeConnection = Parameters<GameRoomServer["onConnect"]>[0];

function makeConnection(id: string, clientId: string): MockConnection {
  const received: string[] = [];
  return {
    id,
    uri: `https://example.partykit.dev/parties/main/room?clientId=${clientId}`,
    received,
    send: (data: string) => received.push(data)
  };
}

function makeEdgeRoom(roomId: string, seedState: GameState, version = 7) {
  const storage = new Map<string, unknown>();
  storage.set("snapshot", {
    roomId,
    version,
    updatedAt: new Date().toISOString(),
    state: seedState
  } satisfies RoomSnapshot);
  const connections = new Set<MockConnection>();
  const room = {
    get id() {
      return roomId;
    },
    storage: {
      get: async (key: string) => storage.get(key),
      put: async (key: string, value: unknown) => {
        storage.set(key, value);
      },
      delete: async (key: string) => storage.delete(key),
      setAlarm: async () => {},
      getAlarm: async () => null,
      deleteAlarm: async () => {}
    },
    broadcast: (data: string) => {
      for (const connection of connections) connection.send(data);
    },
    getConnections: () => connections.values(),
    context: { parties: {} }
  };
  return { room: room as unknown as EdgeRoom, connections, storage };
}

function stored(storage: Map<string, unknown>): RoomSnapshot {
  return storage.get("snapshot") as RoomSnapshot;
}

/** A hosted 2-human adventure owned by owner-1 (seat p1), undo ON or OFF. */
function hostedGame(seed: string, undoMoves: boolean): GameState {
  const state = createAdventureGameState({
    seed,
    scenarioId: "skirmish",
    playerCount: 2,
    rollFirstPlayer: false,
    undoMoves
  });
  state.room = {
    hosted: true,
    hostClientId: "owner-1",
    members: [{ clientId: "owner-1", name: "Owner", seat: "p1", isHost: true }]
  };
  return state;
}

function firstLegalAction(state: GameState): GameAction {
  const offers = getLegalActions(state, "p1");
  const refresh = offers.find((legal) => legal.action.type === "REFRESH_HAND");
  if (refresh && refresh.action.type === "REFRESH_HAND") {
    const player = state.players.p1!;
    const limit = player.needsHandRefresh ? 4 : 5;
    const over = Math.max(0, player.hand.length - limit);
    return { ...refresh.action, discardCardIds: player.hand.slice(0, over) };
  }
  const first = offers[0];
  if (!first) throw new Error("no legal action for p1");
  return first.action;
}

function clone(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

async function connectOwner(server: GameRoomServer, connections: Set<MockConnection>): Promise<MockConnection> {
  const owner = makeConnection("owner-conn", "owner-1");
  connections.add(owner);
  server.onConnect(owner as unknown as EdgeConnection);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return owner;
}

describe("PartyKit edge: undo mode via onMessage", () => {
  it("UNDO_MOVE restores the EXACT prior state (deep-equal minus the undo feed event)", async () => {
    const seed = hostedGame("edge-restore", true);
    const before = clone(seed);
    const { room, connections, storage } = makeEdgeRoom("edge-undo-restore", seed);
    const server = new GameRoomServer(room);
    await server.onStart();
    const owner = await connectOwner(server, connections);

    const action = firstLegalAction(before);
    await server.onMessage(
      JSON.stringify({ type: "action", action, actorClientId: "owner-1" }),
      owner as unknown as EdgeConnection
    );
    expect(undoDepth("edge-undo-restore")).toBe(1);
    const midVersion = stored(storage).version;

    await server.onMessage(
      JSON.stringify({ type: "action", action: { type: "UNDO_MOVE", playerId: "p1" }, actorClientId: "owner-1" }),
      owner as unknown as EdgeConnection
    );

    const after = stored(storage);
    expect(after.version).toBe(midVersion + 1);
    const tail = after.state.eventLog[after.state.eventLog.length - 1];
    expect(tail.type).toBe("MOVES_UNDONE");

    const afterCmp = { ...clone(after.state), eventLog: after.state.eventLog.slice(0, -1) };
    delete afterCmp.eventCounter;
    const beforeCmp = { ...before };
    delete beforeCmp.eventCounter;
    expect(afterCmp).toEqual(beforeCmp);
    expect(undoDepth("edge-undo-restore")).toBe(0);
  });

  it("CONTROL: with the option OFF, UNDO_MOVE is rejected and no history is kept", async () => {
    const seed = hostedGame("edge-off", false);
    const before = clone(seed);
    const { room, connections, storage } = makeEdgeRoom("edge-undo-off", seed);
    const server = new GameRoomServer(room);
    await server.onStart();
    const owner = await connectOwner(server, connections);

    await server.onMessage(
      JSON.stringify({ type: "action", action: firstLegalAction(before), actorClientId: "owner-1" }),
      owner as unknown as EdgeConnection
    );
    expect(undoDepth("edge-undo-off")).toBe(0);
    const versionAfterAction = stored(storage).version;

    owner.received.length = 0;
    await server.onMessage(
      JSON.stringify({ type: "action", requestId: "u1", action: { type: "UNDO_MOVE", playerId: "p1" }, actorClientId: "owner-1" }),
      owner as unknown as EdgeConnection
    );
    // The stored version did not advance (no restore happened).
    expect(stored(storage).version).toBe(versionAfterAction);
    // The sender got an error reply naming the off mode.
    const reply = owner.received.map((raw) => JSON.parse(raw)).find((message) => message.type === "action-result" && message.requestId === "u1");
    expect(reply?.errors?.[0]?.message).toBe("Undo mode is off for this game.");
  });

  it("CONTROL: a non-member cannot undo on a hosted table", async () => {
    const seed = hostedGame("edge-stranger", true);
    const before = clone(seed);
    const { room, connections, storage } = makeEdgeRoom("edge-undo-stranger", seed);
    const server = new GameRoomServer(room);
    await server.onStart();
    const owner = await connectOwner(server, connections);

    // A real action so there IS something on the stack to (attempt to) undo.
    await server.onMessage(
      JSON.stringify({ type: "action", action: firstLegalAction(before), actorClientId: "owner-1" }),
      owner as unknown as EdgeConnection
    );
    const versionAfterAction = stored(storage).version;
    expect(undoDepth("edge-undo-stranger")).toBe(1);

    const stranger = makeConnection("stranger-conn", "stranger-c");
    connections.add(stranger);
    server.onConnect(stranger as unknown as EdgeConnection);
    await new Promise((resolve) => setTimeout(resolve, 0));
    stranger.received.length = 0;
    await server.onMessage(
      JSON.stringify({ type: "action", requestId: "s1", action: { type: "UNDO_MOVE", playerId: "p1" }, actorClientId: "stranger-c" }),
      stranger as unknown as EdgeConnection
    );
    // Rejected: version untouched, history intact, error names the member gate.
    expect(stored(storage).version).toBe(versionAfterAction);
    expect(undoDepth("edge-undo-stranger")).toBe(1);
    const reply = stranger.received.map((raw) => JSON.parse(raw)).find((message) => message.type === "action-result" && message.requestId === "s1");
    expect(reply?.errors?.[0]?.message).toBe("Only a member of this room can undo.");
  });
});

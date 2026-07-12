/**
 * The paced single-player computer pump on BOTH backends, exercised the way
 * PRODUCTION runs it — not via the synchronous test drains.
 *
 * PartyKit edge: Durable Object alarms drive the pump, and PartyKit THROWS on
 * any `Party.id` access inside `onAlarm` (a documented limitation the runtime
 * enforces with an `inAlarm` flag). The harness here reproduces that flag
 * faithfully, so the suite fails if alarm-reachable code ever touches
 * `this.room.id` again — the exact bug that froze every deployed AI turn after
 * its first visible step ("the computer keeps saying it's taking its turn /
 * sits on a tile rotation and nothing happens").
 *
 * Built-in store: the pump is a setTimeout that dies with the process; a room
 * restored mid-computer-turn must be revived by a reconnecting client
 * (subscribeToRoom self-heal), because no human action is legal to wake it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import GameRoomServer, { type RoomSnapshot } from "../../party/index";
import {
  applyAction,
  computerDecisionOwner,
  createAdventureGameState,
  getLegalActions,
  type GameAction,
  type GameState,
} from "@/engine";
import { computerPumpOwed, driveComputerPlayers } from "./computer-runner";
import {
  cancelComputerPump,
  createRoom,
  drainComputerPumpSync,
  ensureComputerPump,
  getRoomSnapshot,
  submitRoomAction,
  subscribeToRoom,
} from "./game-room-store";

// ---------------------------------------------------------------------------
// Shared: drive the HUMAN (p1) with a minimal round-1 script until a computer
// seat owes the next decision (its start-tile rotation / first turn).
// ---------------------------------------------------------------------------

const HUMAN_SCRIPT: GameAction["type"][] = [
  "SET_TILE_ROTATION",
  "REFRESH_HAND",
  "END_TURN",
];

function nextHumanAction(state: GameState): GameAction {
  const offers = getLegalActions(state, "p1");
  for (const type of HUMAN_SCRIPT) {
    const hit = offers.find((legal) => legal.action.type === type);
    if (!hit) continue;
    if (hit.action.type === "REFRESH_HAND") {
      const player = state.players.p1!;
      const limit = player.needsHandRefresh ? 4 : 5;
      const over = Math.max(0, player.hand.length - limit);
      return { ...hit.action, discardCardIds: player.hand.slice(0, over) };
    }
    return hit.action;
  }
  throw new Error(
    `no scripted human action among: ${offers.map((legal) => legal.action.type).join(", ")}`,
  );
}

/** A fresh 1-computer adventure advanced to "the computer owes a decision". */
function stateWithComputerOwed(seed: string): GameState {
  let state = createAdventureGameState({
    seed,
    scenarioId: "skirmish",
    playerCount: 2,
    sessionMode: "single-player",
  });
  let guard = 0;
  while (guard++ < 40 && !computerDecisionOwner(state)) {
    const result = applyAction(state, nextHumanAction(state));
    expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
    state = result.state;
  }
  expect(computerDecisionOwner(state)).toBe("p2");
  return state;
}

// ---------------------------------------------------------------------------
// PartyKit edge harness with FAITHFUL alarm semantics
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
    send: (data: string) => received.push(data),
  };
}

function makeAlarmEdgeRoom(roomId: string, seedState: GameState) {
  const storage = new Map<string, unknown>();
  storage.set("snapshot", {
    roomId,
    version: 7,
    updatedAt: new Date().toISOString(),
    state: seedState,
  } satisfies RoomSnapshot);
  const connections = new Set<MockConnection>();
  const flags = { inAlarm: false, failNextPut: false };
  let alarmAt: number | null = null;
  const room = {
    // PartyKit's runtime wrapper: `Party.id` THROWS while an alarm handler
    // runs. Any onAlarm-reachable `this.room.id` read crashes the tick.
    get id() {
      if (flags.inAlarm) {
        throw new Error("You can not access `Party.id` in the `onAlarm` handler.");
      }
      return roomId;
    },
    storage: {
      get: async (key: string) => storage.get(key),
      put: async (key: string, value: unknown) => {
        if (flags.failNextPut) {
          flags.failNextPut = false;
          throw new Error("simulated storage hiccup");
        }
        storage.set(key, value);
      },
      delete: async (key: string) => storage.delete(key),
      setAlarm: async (at: number) => {
        alarmAt = at;
      },
      getAlarm: async () => alarmAt,
      deleteAlarm: async () => {
        alarmAt = null;
      },
    },
    broadcast: (data: string) => {
      for (const connection of connections) {
        connection.send(data);
      }
    },
    getConnections: () => connections.values(),
    context: { parties: {} },
  };
  /** Fire the pending alarm exactly like PartyKit: consume it, flag inAlarm. */
  const fireAlarm = async (server: GameRoomServer): Promise<void> => {
    alarmAt = null;
    flags.inAlarm = true;
    try {
      await server.onAlarm();
    } finally {
      flags.inAlarm = false;
    }
  };
  return {
    room: room as unknown as EdgeRoom,
    connections,
    storage,
    fireAlarm,
    alarmPending: () => alarmAt !== null,
    /** Drop the pending alarm, as a crashed/expired alarm chain would. */
    clearAlarm: () => {
      alarmAt = null;
    },
    /** Make the NEXT storage.put throw (a one-off persistence hiccup). */
    failNextPut: () => {
      flags.failNextPut = true;
    },
  };
}

function storedSnapshot(storage: Map<string, unknown>): RoomSnapshot {
  return storage.get("snapshot") as RoomSnapshot;
}

/** Single-player room membership, as the live creation flow stamps it. */
function withOwnedRoom(state: GameState): GameState {
  state.room = {
    hosted: true,
    hostClientId: "owner-1",
    visibility: "private",
    ranked: false,
    ownerClientId: "owner-1",
    members: [{ clientId: "owner-1", name: "Owner", seat: "p1", isHost: true }],
  };
  return state;
}

describe("PartyKit alarm computer pump (Party.id is unreadable in onAlarm)", () => {
  it("alarm ticks play the WHOLE computer turn to completion and re-arm themselves", async () => {
    const seed = withOwnedRoom(stateWithComputerOwed("pump-alarm-turn"));
    const { room, connections, storage, fireAlarm, alarmPending } = makeAlarmEdgeRoom(
      "edge-pump-alarm",
      seed,
    );
    const server = new GameRoomServer(room);
    await server.onStart();
    const owner = makeConnection("owner-conn", "clientId=owner-1");
    connections.add(owner);
    server.onConnect(owner as unknown as EdgeConnection);

    expect(computerPumpOwed(storedSnapshot(storage).state)).toBe(true);

    let lastVersion = storedSnapshot(storage).version;
    let ticks = 0;
    while (computerPumpOwed(storedSnapshot(storage).state) && ticks < 400) {
      ticks += 1;
      // The old code threw here ("You can not access `Party.id` …"), so the
      // pump died on its FIRST tick and the AI froze mid-turn forever.
      await fireAlarm(server);
      const now = storedSnapshot(storage);
      expect(now.version, `tick ${ticks} made no progress`).toBeGreaterThan(lastVersion);
      lastVersion = now.version;
      if (computerPumpOwed(now.state)) {
        expect(alarmPending(), `tick ${ticks} did not re-arm the alarm`).toBe(true);
      }
    }

    // The computer's whole turn resolved: nobody owes an automated decision.
    expect(computerDecisionOwner(storedSnapshot(storage).state)).toBeNull();
    expect(ticks).toBeGreaterThan(0);
  });

  it("onConnect re-arms a LOST pump (self-heal), and not when no computer owes work (CONTROL)", async () => {
    // A room stuck mid-computer-turn with NO alarm pending (crashed tick /
    // pre-fix deploy): the human reloading the page must revive it.
    const stuck = withOwnedRoom(stateWithComputerOwed("pump-alarm-heal"));
    const stuckRoom = makeAlarmEdgeRoom("edge-pump-heal", stuck);
    const stuckServer = new GameRoomServer(stuckRoom.room);
    await stuckServer.onStart();
    expect(stuckRoom.alarmPending()).toBe(false);
    const owner = makeConnection("owner-conn", "clientId=owner-1");
    stuckRoom.connections.add(owner);
    stuckServer.onConnect(owner as unknown as EdgeConnection);
    await vi.waitFor(() => expect(stuckRoom.alarmPending()).toBe(true));

    // CONTROL: the human owns the next decision — a connect arms nothing.
    // (Settle any computer work a random seat order may open at game start.)
    const fresh = createAdventureGameState({
      seed: "pump-alarm-heal-idle",
      scenarioId: "skirmish",
      playerCount: 2,
      sessionMode: "single-player",
    });
    const idle = withOwnedRoom(driveComputerPlayers(fresh).state);
    expect(computerPumpOwed(idle)).toBe(false);
    const idleRoom = makeAlarmEdgeRoom("edge-pump-heal-idle", idle);
    const idleServer = new GameRoomServer(idleRoom.room);
    await idleServer.onStart();
    const idleOwner = makeConnection("owner-conn", "clientId=owner-1");
    idleRoom.connections.add(idleOwner);
    idleServer.onConnect(idleOwner as unknown as EdgeConnection);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(idleRoom.alarmPending()).toBe(false);
  });

  it("ANY client message (health ping) and an HTTP poll re-arm a lost pump without a reload", async () => {
    const stuck = withOwnedRoom(stateWithComputerOwed("pump-alarm-msg-heal"));
    const { room, connections, clearAlarm, alarmPending } = makeAlarmEdgeRoom(
      "edge-pump-msg-heal",
      stuck,
    );
    const server = new GameRoomServer(room);
    await server.onStart();
    const owner = makeConnection("owner-conn", "clientId=owner-1");
    connections.add(owner);
    server.onConnect(owner as unknown as EdgeConnection);
    await vi.waitFor(() => expect(alarmPending()).toBe(true));

    // The alarm chain dies (crashed tick / runtime gave up on retries). The
    // human does NOT reload — their socket just health-pings.
    clearAlarm();
    expect(alarmPending()).toBe(false);
    await server.onMessage(
      JSON.stringify({ type: "ping", knownVersion: 1 }),
      owner as unknown as EdgeConnection,
    );
    await vi.waitFor(() => expect(alarmPending()).toBe(true));

    // The client's http-recovery poll heals it the same way.
    clearAlarm();
    expect(alarmPending()).toBe(false);
    await server.onRequest(
      new Request("https://example.partykit.dev/parties/main/edge-pump-msg-heal?clientId=owner-1") as never,
    );
    await vi.waitFor(() => expect(alarmPending()).toBe(true));
  });

  it("a FAILED alarm tick re-arms the pump instead of killing the chain", async () => {
    const stuck = withOwnedRoom(stateWithComputerOwed("pump-alarm-tick-fail"));
    const { room, connections, storage, fireAlarm, alarmPending, failNextPut } = makeAlarmEdgeRoom(
      "edge-pump-tick-fail",
      stuck,
    );
    const server = new GameRoomServer(room);
    await server.onStart();
    const owner = makeConnection("owner-conn", "clientId=owner-1");
    connections.add(owner);
    server.onConnect(owner as unknown as EdgeConnection);
    await vi.waitFor(() => expect(alarmPending()).toBe(true));

    // One-off persistence hiccup: without the catch+re-arm, onAlarm throws and
    // (once the runtime's few retries are spent) the AI freezes mid-turn.
    failNextPut();
    await fireAlarm(server); // must not reject
    expect(alarmPending(), "failed tick did not re-arm the pump").toBe(true);

    // The next tick recovers and makes real progress.
    const before = storedSnapshot(storage).version;
    await fireAlarm(server);
    expect(storedSnapshot(storage).version).toBeGreaterThan(before);
    if (computerPumpOwed(storedSnapshot(storage).state)) {
      expect(alarmPending()).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Built-in store: a lost setTimeout pump is revived by a (re)subscribe
// ---------------------------------------------------------------------------

describe("built-in store computer pump self-heal", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("subscribeToRoom revives a room frozen mid-computer-turn after the pump timer was lost", () => {
    vi.useFakeTimers();
    const roomId = `sp-pump-${Math.random().toString(36).slice(2, 10)}`;
    createRoom({ roomId, sessionMode: "single-player", computerOpponents: 1 });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "owner-1", name: "Owner" }, "owner-1");
    submitRoomAction(
      roomId,
      { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" },
      "owner-1",
    );
    submitRoomAction(roomId, { type: "START_ADVENTURE", playerId: "p1" }, "owner-1");
    drainComputerPumpSync(roomId);

    // Human plays its round-1 turn through the real action route.
    let guard = 0;
    while (guard++ < 40 && !computerPumpOwed(getRoomSnapshot(roomId).state)) {
      const action = nextHumanAction(getRoomSnapshot(roomId).state);
      const outcome = submitRoomAction(roomId, action, "owner-1");
      expect(outcome.result.errors, outcome.result.errors.map((error) => error.message).join("; ")).toEqual([]);
    }
    expect(computerPumpOwed(getRoomSnapshot(roomId).state)).toBe(true);

    // Simulate the restart/crash: the pending pump timer is gone.
    cancelComputerPump(roomId);
    const stuckVersion = getRoomSnapshot(roomId).version;
    vi.advanceTimersByTime(30_000);
    expect(getRoomSnapshot(roomId).version).toBe(stuckVersion); // frozen without the fix's revival

    // A client (re)opens the SSE stream — the subscribe self-heal re-arms it.
    const versions: number[] = [];
    const unsubscribe = subscribeToRoom(roomId, (snapshot) => versions.push(snapshot.version));
    vi.advanceTimersByTime(30_000);
    expect(versions.length).toBeGreaterThan(0);
    expect(getRoomSnapshot(roomId).version).toBeGreaterThan(stuckVersion);
    // The pump ran the computer turn to completion, not just one step.
    expect(computerPumpOwed(getRoomSnapshot(roomId).state)).toBe(false);
    expect(computerDecisionOwner(getRoomSnapshot(roomId).state)).toBeNull();

    unsubscribe();
    cancelComputerPump(roomId);
  });

  it("ensureComputerPump never postpones a pending timer and skips idle rooms (CONTROL)", () => {
    vi.useFakeTimers();
    const roomId = `sp-pump-idle-${Math.random().toString(36).slice(2, 10)}`;
    createRoom({ roomId, sessionMode: "single-player", computerOpponents: 1 });
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "owner-1", name: "Owner" }, "owner-1");
    // Setup lobby: computers bulk-settle inside actions; no pump is owed.
    expect(computerPumpOwed(getRoomSnapshot(roomId).state)).toBe(false);
    const before = getRoomSnapshot(roomId).version;
    ensureComputerPump(roomId);
    vi.advanceTimersByTime(30_000);
    expect(getRoomSnapshot(roomId).version).toBe(before);
  });
});

/**
 * CO-OP MODE — step 2, the SERVER half: an AI seat in an ORDINARY MULTIPLAYER
 * room really plays itself, on BOTH backends.
 *
 * Before step 2 the paced computer pump was only ever reached from a private
 * single-player room, so a multiplayer lobby that added computer opponents
 * (co-op step 1) built a table whose AI seats never moved. What is asserted
 * here is the OBSERVABLE outcome, not "a pump was armed": the humans end their
 * turns, nobody touches the room again, and the ROUND WRAPS with the turn back
 * on a human seat — which can only happen if the computer seat took and
 * finished its own turn.
 *
 * Both backends are driven the way PRODUCTION drives them: the built-in store
 * through its real `setTimeout` chain (fake timers), the PartyKit edge through
 * its real Durable Object alarm chain (with `Party.id` unreadable inside
 * `onAlarm`, exactly as the runtime enforces).
 *
 * CONTROL in both: an all-human multiplayer room in the SAME flow never arms
 * the pump and never changes version on its own.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import GameRoomServer, { type RoomSnapshot } from "../../party/index";
import {
  computerDecisionOwner,
  createAdventureLobbyState,
  getLegalActions,
  type GameAction,
  type GameState,
  type PlayerId
} from "@/engine";
import { computerPumpOwed } from "./computer-runner";
import {
  cancelComputerPump,
  createRoom,
  getRoomSnapshot,
  submitRoomAction
} from "./game-room-store";

function uniqueId(name: string): string {
  return `${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// A minimal human round-1 script (the single-player-pump.test.ts recipe,
// widened to whichever human seat is active).
// ---------------------------------------------------------------------------

const HUMAN_SCRIPT: GameAction["type"][] = [
  "ACKNOWLEDGE_FIRST_PLAYER_ROLL",
  "SET_TILE_ROTATION",
  "REFRESH_HAND",
  "END_TURN"
];

const HUMAN_SEATS: Record<PlayerId, string> = { p1: "client-a", p2: "client-b" };

function nextHumanAction(state: GameState, seat: PlayerId): GameAction | null {
  const offers = getLegalActions(state, seat);
  for (const type of HUMAN_SCRIPT) {
    const hit = offers.find((legal) => legal.action.type === type);
    if (!hit) continue;
    if (hit.action.type === "REFRESH_HAND") {
      const player = state.players[seat]!;
      const limit = player.needsHandRefresh ? 4 : 5;
      const over = Math.max(0, player.hand.length - limit);
      return { ...hit.action, discardCardIds: player.hand.slice(0, over) };
    }
    return hit.action;
  }
  const visit = offers.find((legal) => legal.action.type === "RESOLVE_VISIT_STEP");
  return visit ? visit.action : null;
}

/**
 * The human seats to try, ACTIVE seat first — an off-turn human still owes the
 * opening first-player ceremony, which is exactly what a table whose AI seat
 * won the roll is parked on.
 */
function humanSeatOrder(state: GameState): PlayerId[] {
  const active = state.activePlayerId as PlayerId;
  return HUMAN_SEATS[active] ? [active, "p1", "p2"] : ["p1", "p2"];
}

/** Which seats have already ended a turn (round-1 progress, from the feed). */
function seatsThatEndedATurn(state: GameState): Set<string> {
  return new Set(
    state.eventLog
      .filter((event) => event.type === "TURN_ENDED")
      .map((event) => (event as { playerId?: string }).playerId ?? "")
  );
}

/** The lobby actions that build the table under test (co-op or the CONTROL). */
function lobbyScript(options: { coop: boolean; computers: number }): Array<[GameAction, string]> {
  const script: Array<[GameAction, string]> = [
    [{ type: "JOIN_ROOM", clientId: "client-a", name: "Alice" }, "client-a"],
    [{ type: "JOIN_ROOM", clientId: "client-b", name: "Bob" }, "client-b"]
  ];
  if (options.coop) {
    script.push([
      { type: "SET_GAME_OPTIONS", playerId: "p1", options: { gameMode: "coop" } },
      "client-a"
    ]);
  }
  if (options.computers > 0) {
    script.push([
      { type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: options.computers },
      "client-a"
    ]);
  }
  // Determinism: both backends apply every action with FRESH server entropy, so
  // the first-player ROLL (and therefore who plays last in round 1) is random.
  // The shipped manual player-order option fixes the seating AND skips the
  // opening ceremony, so the AI seat is reliably the last turn of round 1.
  script.push([
    {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: {
        playerOrderMode: "manual",
        manualPlayerOrder: options.computers > 0 ? ["p1", "p2", "p3"] : ["p1", "p2"]
      }
    },
    "client-a"
  ]);
  script.push(
    [
      { type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" },
      "client-a"
    ],
    [
      { type: "CHOOSE_FACTION", playerId: "p2", factionId: "rampart", heroDefId: "gelu" },
      "client-b"
    ],
    [{ type: "START_ADVENTURE", playerId: "p1" }, "client-a"]
  );
  return script;
}

// ===========================================================================
// Built-in store backend (Next.js in-process): the real setTimeout pump
// ===========================================================================

describe("co-op step 2 — the computer pump drives a MULTIPLAYER room (built-in store)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function buildRoom(options: { coop: boolean; computers: number }): string {
    const roomId = uniqueId(options.computers > 0 ? "coop-live" : "coop-control");
    createRoom({ roomId });
    for (const [action, clientId] of lobbyScript(options)) {
      const outcome = submitRoomAction(roomId, action, clientId);
      expect(
        outcome.result.errors,
        `${action.type}: ${outcome.result.errors.map((error) => error.message).join("; ")}`
      ).toEqual([]);
    }
    return roomId;
  }

  it("2 humans + 1 computer: the AI seat takes its OWN turn and the round wraps, untouched", () => {
    vi.useFakeTimers();
    const roomId = buildRoom({ coop: true, computers: 1 });

    const built = getRoomSnapshot(roomId).state;
    expect(built.gameMode, "the built table really is co-op").toBe("coop");
    expect(built.controllers?.p3?.kind).toBe("computer");
    // Step 1's alliance: the two humans are allies, the AI seat is not.
    expect(built.playerTeams).toEqual({ p1: "coop-humans", p2: "coop-humans", p3: "coop-ai" });
    expect(built.round).toBe(1);

    // Both humans play their round-1 turns. While the AI seat owes a side
    // window of its own (its forced start-tile rotation blocks the whole
    // table), let the server's own timer clear it — exactly as production
    // interleaves them.
    let guard = 0;
    while (guard++ < 100) {
      const current = getRoomSnapshot(roomId).state;
      const ended = seatsThatEndedATurn(current);
      if (current.round > 1 || (ended.has("p1") && ended.has("p2"))) break;
      const seat = humanSeatOrder(current).find((candidate) =>
        Boolean(nextHumanAction(current, candidate))
      );
      if (!seat) {
        expect(computerDecisionOwner(current), "nobody can act — the table froze").toBeTruthy();
        vi.advanceTimersByTime(5_000);
        continue;
      }
      const outcome = submitRoomAction(roomId, nextHumanAction(current, seat)!, HUMAN_SEATS[seat]);
      expect(
        outcome.result.errors,
        outcome.result.errors.map((error) => error.message).join("; ")
      ).toEqual([]);
    }

    const owed = getRoomSnapshot(roomId).state;
    expect(owed.round, "still round 1 — only the AI seat's turn is left").toBe(1);
    expect(owed.activePlayerId, "the AI seat holds the turn now").toBe("p3");
    expect(computerDecisionOwner(owed)).toBe("p3");
    expect(computerPumpOwed(owed), "…and the multiplayer room armed the pump").toBe(true);
    const versionBefore = getRoomSnapshot(roomId).version;

    // NOBODY touches the room from here — only the server's own timer chain.
    vi.advanceTimersByTime(10 * 60_000);

    const after = getRoomSnapshot(roomId);
    expect(after.version, "the pump committed its own frames").toBeGreaterThan(versionBefore);
    // The observable: the AI seat finished its turn, so the round wrapped and
    // play is back on a human seat with nothing owed to the computer.
    expect(after.state.round).toBe(2);
    expect(Object.keys(HUMAN_SEATS)).toContain(after.state.activePlayerId);
    expect(computerDecisionOwner(after.state)).toBeNull();
    expect(computerPumpOwed(after.state)).toBe(false);

    cancelComputerPump(roomId);
  });

  it("CONTROL: an ALL-HUMAN clash room in the same flow never arms the pump", () => {
    vi.useFakeTimers();
    const roomId = buildRoom({ coop: false, computers: 0 });

    const built = getRoomSnapshot(roomId).state;
    expect(built.gameMode).toBeUndefined();
    expect(built.controllers).toBeUndefined();

    // Play p1's whole round-1 turn, then stop: p2 is a human and nothing may
    // move on its own.
    let guard = 0;
    while (guard++ < 20 && getRoomSnapshot(roomId).state.activePlayerId === "p1") {
      const current = getRoomSnapshot(roomId).state;
      const action = nextHumanAction(current, "p1");
      expect(action, "p1 should still have a scripted action").toBeTruthy();
      const outcome = submitRoomAction(roomId, action!, "client-a");
      expect(
        outcome.result.errors,
        outcome.result.errors.map((error) => error.message).join("; ")
      ).toEqual([]);
    }
    const idle = getRoomSnapshot(roomId);
    expect(idle.state.activePlayerId).toBe("p2");
    expect(computerPumpOwed(idle.state)).toBe(false);

    vi.advanceTimersByTime(10 * 60_000);
    expect(getRoomSnapshot(roomId).version, "no pump ran").toBe(idle.version);
    expect(getRoomSnapshot(roomId).state.activePlayerId).toBe("p2");
  });
});

// ===========================================================================
// PartyKit edge backend: the real Durable Object alarm chain
// ===========================================================================

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

function makeAlarmEdgeRoom(roomId: string, seedState: GameState) {
  const storage = new Map<string, unknown>();
  storage.set("snapshot", {
    roomId,
    version: 1,
    updatedAt: new Date().toISOString(),
    state: seedState
  } satisfies RoomSnapshot);
  const connections = new Set<MockConnection>();
  const flags = { inAlarm: false };
  let alarmAt: number | null = null;
  const room = {
    // PartyKit's runtime wrapper: `Party.id` THROWS while an alarm handler runs.
    get id() {
      if (flags.inAlarm) {
        throw new Error("You can not access `Party.id` in the `onAlarm` handler.");
      }
      return roomId;
    },
    storage: {
      get: async (key: string) => storage.get(key),
      put: async (key: string, value: unknown) => {
        storage.set(key, value);
      },
      delete: async (key: string) => storage.delete(key),
      setAlarm: async (at: number) => {
        alarmAt = at;
      },
      getAlarm: async () => alarmAt,
      deleteAlarm: async () => {
        alarmAt = null;
      }
    },
    broadcast: (data: string) => {
      for (const connection of connections) {
        connection.send(data);
      }
    },
    getConnections: () => connections.values(),
    context: { parties: {} }
  };
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
    alarmPending: () => alarmAt !== null
  };
}

function storedSnapshot(storage: Map<string, unknown>): RoomSnapshot {
  return storage.get("snapshot") as RoomSnapshot;
}

describe("co-op step 2 — the computer pump drives a MULTIPLAYER room (PartyKit edge)", () => {
  async function send(
    server: GameRoomServer,
    connection: MockConnection,
    action: GameAction,
    actorClientId: string
  ): Promise<void> {
    await server.onMessage(
      JSON.stringify({ type: "action", action, actorClientId }),
      connection as unknown as EdgeConnection
    );
  }

  it("2 humans + 1 computer: the alarm chain drains the AI seat's whole turn", async () => {
    const lobby = createAdventureLobbyState({ seed: "edge-coop-live", scenarioId: "skirmish" });
    const harness = makeAlarmEdgeRoom("edge-coop-live", lobby);
    const server = new GameRoomServer(harness.room);
    await server.onStart();
    const alice = makeConnection("conn-a", "clientId=client-a");
    const bob = makeConnection("conn-b", "clientId=client-b");
    harness.connections.add(alice);
    harness.connections.add(bob);
    server.onConnect(alice as unknown as EdgeConnection);
    server.onConnect(bob as unknown as EdgeConnection);

    for (const [action, clientId] of lobbyScript({ coop: true, computers: 1 })) {
      await send(server, clientId === "client-a" ? alice : bob, action, clientId);
    }
    const built = storedSnapshot(harness.storage).state;
    expect(built.gameMode).toBe("coop");
    expect(built.controllers?.p3?.kind).toBe("computer");
    // The edge bulk-settled the computer seat's SETUP pick inside the actions.
    expect(built.adventure).not.toBeNull();
    expect(built.round).toBe(1);

    let guard = 0;
    while (guard++ < 100) {
      const current = storedSnapshot(harness.storage).state;
      const ended = seatsThatEndedATurn(current);
      if (current.round > 1 || (ended.has("p1") && ended.has("p2"))) break;
      const seat = humanSeatOrder(current).find((candidate) =>
        Boolean(nextHumanAction(current, candidate))
      );
      if (!seat) {
        // The AI seat owes a side window (its forced start-tile rotation blocks
        // the table): the room's own alarm clears it, no browser involved.
        expect(computerDecisionOwner(current), "nobody can act — the table froze").toBeTruthy();
        await harness.fireAlarm(server);
        continue;
      }
      const clientId = HUMAN_SEATS[seat];
      await send(
        server,
        clientId === "client-a" ? alice : bob,
        nextHumanAction(current, seat)!,
        clientId
      );
    }
    const owed = storedSnapshot(harness.storage).state;
    expect(owed.round, "still round 1 — only the AI seat's turn is left").toBe(1);
    expect(owed.activePlayerId).toBe("p3");
    expect(computerDecisionOwner(owed)).toBe("p3");
    // The action transaction armed the alarm on this MULTIPLAYER room.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(harness.alarmPending()).toBe(true);

    // Fire the alarm chain only — no browser message reaches the room again.
    let steps = 0;
    while (computerPumpOwed(storedSnapshot(harness.storage).state) && steps++ < 256) {
      expect(harness.alarmPending()).toBe(true);
      const versionBefore = storedSnapshot(harness.storage).version;
      await harness.fireAlarm(server);
      expect(storedSnapshot(harness.storage).version).toBeGreaterThan(versionBefore);
    }
    expect(steps, "the alarm chain really did the work").toBeGreaterThan(0);

    const after = storedSnapshot(harness.storage).state;
    expect(after.round).toBe(2);
    expect(Object.keys(HUMAN_SEATS)).toContain(after.activePlayerId);
    expect(computerDecisionOwner(after)).toBeNull();
  });

  it("CONTROL: an ALL-HUMAN clash room arms no alarm at all", async () => {
    const lobby = createAdventureLobbyState({ seed: "edge-coop-control", scenarioId: "skirmish" });
    const harness = makeAlarmEdgeRoom("edge-coop-control", lobby);
    const server = new GameRoomServer(harness.room);
    await server.onStart();
    const alice = makeConnection("conn-a", "clientId=client-a");
    const bob = makeConnection("conn-b", "clientId=client-b");
    harness.connections.add(alice);
    harness.connections.add(bob);
    server.onConnect(alice as unknown as EdgeConnection);
    server.onConnect(bob as unknown as EdgeConnection);

    for (const [action, clientId] of lobbyScript({ coop: false, computers: 0 })) {
      await send(server, clientId === "client-a" ? alice : bob, action, clientId);
    }
    let guard = 0;
    while (guard++ < 20 && storedSnapshot(harness.storage).state.activePlayerId === "p1") {
      const current = storedSnapshot(harness.storage).state;
      const action = nextHumanAction(current, "p1");
      expect(action, "p1 should still have a scripted action").toBeTruthy();
      await send(server, alice, action!, "client-a");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(storedSnapshot(harness.storage).state.activePlayerId).toBe("p2");
    expect(computerPumpOwed(storedSnapshot(harness.storage).state)).toBe(false);
    expect(harness.alarmPending()).toBe(false);
  });
});

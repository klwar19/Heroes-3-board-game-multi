/**
 * Production-faithful PartyKit run of the whole single-player game START:
 * room created by the first connection's ?singlePlayer marker, faction pick,
 * START_ADVENTURE, then the human's round-1 script interleaved with real
 * alarm ticks — under BOTH runtime restrictions PartyKit enforces inside
 * onAlarm (`Party.id` AND `Party.context.parties` throw), and with COLD
 * alarm wakes: with `hibernate: true` the Durable Object can be evicted
 * between any two ticks, so every third alarm here fires on a freshly
 * constructed server (onStart, then onAlarm — exactly the runtime's alarm()
 * order). Fails loudly on the reported bug shape: "the AI says it is taking
 * its turn and nothing happens" = pump owed with no alarm pending.
 */
import { describe, expect, it } from "vitest";
import GameRoomServer, { type RoomSnapshot } from "../../party/index";
import {
  computerDecisionOwner,
  getLegalActions,
  isPrivateSinglePlayer,
  type GameAction,
  type GameState,
} from "@/engine";
import {
  computerPumpOwed,
  settleComputerVisibleStep,
} from "./computer-runner";
import { STALE_ROOM_TTL_MS } from "./lobby-registry";

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

function makeRealisticEdgeRoom(roomId: string) {
  const storage = new Map<string, unknown>();
  const connections = new Set<MockConnection>();
  const flags = { inAlarm: false };
  let alarmAt: number | null = null;
  const room = {
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
      },
    },
    broadcast: (data: string) => {
      for (const connection of connections) {
        connection.send(data);
      }
    },
    getConnections: () => connections.values(),
    context: {
      // Real PartyKit: context.parties ALSO throws inside onAlarm.
      get parties() {
        if (flags.inAlarm) {
          throw new Error("You can not access `Party.context.parties` in the `onAlarm` handler.");
        }
        return {};
      },
    },
  };
  return {
    room: room as unknown as EdgeRoom,
    connections,
    storage,
    flags,
    alarmPending: () => alarmAt !== null,
    clearAlarm: () => {
      alarmAt = null;
    },
  };
}

const HUMAN_SCRIPT: GameAction["type"][] = ["SET_TILE_ROTATION", "REFRESH_HAND", "END_TURN"];

function nextHumanAction(state: GameState): GameAction | null {
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
  return null;
}

function storedSnapshot(storage: Map<string, unknown>): RoomSnapshot {
  return storage.get("snapshot") as RoomSnapshot;
}

async function runEdgeGameStart(tag: string, opponents: number, coldEvery: number): Promise<string | null> {
  const { room, connections, storage, flags, alarmPending, clearAlarm } = makeRealisticEdgeRoom(`edge-${tag}`);
  let server = new GameRoomServer(room);
  await server.onStart();
  const owner = makeConnection("owner-conn", `clientId=owner-1&singlePlayer=${opponents}`);
  connections.add(owner);
  server.onConnect(owner as unknown as EdgeConnection);
  // Let the creation flow's voided persist land before acting.
  await new Promise((resolve) => setTimeout(resolve, 0));

  const act = async (action: GameAction) => {
    await server.onMessage(
      JSON.stringify({ type: "action", action, actorClientId: "owner-1" }),
      owner as unknown as EdgeConnection,
    );
  };
  await act({ type: "JOIN_ROOM", clientId: "owner-1", name: "Owner" } as GameAction);
  await act({ type: "CHOOSE_FACTION", playerId: "p1", factionId: "castle", heroDefId: "catherine" } as GameAction);
  await act({ type: "START_ADVENTURE", playerId: "p1" } as GameAction);

  let alarmFires = 0;
  for (let step = 0; step < 700; step += 1) {
    const snapshot = storedSnapshot(storage);
    if (!snapshot) return "no snapshot persisted";
    const state = snapshot.state;
    // Every computer-owned window is advanced by the authoritative alarm.
    if (computerPumpOwed(state)) {
      if (!alarmPending()) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (!alarmPending()) {
          const reason = settleComputerVisibleStep(state).reason ?? "no alarm pending";
          return `FROZEN at step ${step}: computer pump owed but not advancing (owner=${computerDecisionOwner(state)}, round=${state.round}, active=${state.activePlayerId}, reason=${reason})`;
        }
      }
      alarmFires += 1;
      if (coldEvery > 0 && alarmFires % coldEvery === 0) {
        server = new GameRoomServer(room);
        await server.onStart();
      }
      clearAlarm();
      flags.inAlarm = true;
      try {
        await server.onAlarm();
      } catch (error) {
        return `onAlarm THREW at step ${step}: ${(error as Error).message}`;
      } finally {
        flags.inAlarm = false;
      }
      continue;
    }
    if (computerDecisionOwner(state)) {
      return `owner=${computerDecisionOwner(state)} but no server pump is owed (phase=${state.phase})`;
    }
    if (state.round >= 2 && state.activePlayerId === "p1" && !state.adventure?.pendingTileChoice) {
      return null; // survived the beginning of the game
    }
    const action = nextHumanAction(state);
    if (!action) {
      const offers = getLegalActions(state, "p1").map((legal) => legal.action.type);
      if (offers.length > 0) return null;
      return `human has NO legal actions (round=${state.round})`;
    }
    await act(action);
    const after = storedSnapshot(storage).state;
    if (computerPumpOwed(after) && !alarmPending()) {
      return `action ${action.type} left computer work owed WITHOUT arming the alarm (round=${after.round})`;
    }
  }
  return "did not finish within 700 steps";
}

describe("single-player game start over the PartyKit edge (alarm-paced, cold wakes)", () => {
  it("plays through round 1 into round 2 without ever freezing", async () => {
    // Integration smoke over real games (random entropy each run): confirms the
    // whole start path never freezes end-to-end. The deterministic regression
    // guards for the underlying stall fix live in computer-runner.test.ts (the
    // combat-pause fingerprint + no-progress-retry tests, mutation-checked).
    const failures: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      for (const opponents of [1, 2, 3]) {
        const failure = await runEdgeGameStart(`t${i}-o${opponents}`, opponents, 3);
        if (failure) failures.push(`[t${i} opp=${opponents}] ${failure}`);
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  }, 180000);
});

describe("single-player rooms never leak into the public lobby (edge)", () => {
  function storageOf(roomId: string) {
    return makeRealisticEdgeRoom(roomId);
  }

  it("a marker-LESS first connection to an sp- room still creates a PRIVATE single-player room", async () => {
    // The ?singlePlayer= marker is read from localStorage, so it can be absent
    // on first connect (storage blocked/cleared, an sp- link opened fresh). With
    // no marker the only thing that keeps this from becoming a PUBLIC listed
    // lobby is the sp- id prefix default.
    const { room, storage } = storageOf("sp-deadbeefcafe0001");
    const server = new GameRoomServer(room);
    await server.onStart();
    const conn = makeConnection("owner-1", "clientId=owner-1"); // NO singlePlayer marker
    server.onConnect(conn as unknown as EdgeConnection);
    const snap = storedSnapshot(storage);
    expect(snap.state.sessionMode).toBe("single-player");
    // Private for every reporting/listing read (reportToLobby deregisters it).
    expect(isPrivateSinglePlayer(snap.state)).toBe(true);
  });

  it("CONTROL: a marker-less connection to a NORMAL room id creates a public multiplayer lobby", async () => {
    const { room, storage } = storageOf("room-public-0001");
    const server = new GameRoomServer(room);
    await server.onStart();
    const conn = makeConnection("owner-1", "clientId=owner-1");
    server.onConnect(conn as unknown as EdgeConnection);
    const snap = storedSnapshot(storage);
    expect(snap.state.sessionMode).not.toBe("single-player");
    expect(isPrivateSinglePlayer(snap.state)).toBe(false);
  });

  it("onStart discards an ABANDONED single-player snapshot past the idle TTL (Gap A)", async () => {
    const { room, storage } = storageOf("sp-abandoned000001");
    // Create a real single-player room first.
    const server0 = new GameRoomServer(room);
    await server0.onStart();
    server0.onConnect(makeConnection("owner-1", "clientId=owner-1&singlePlayer=1") as unknown as EdgeConnection);
    const live = storedSnapshot(storage);
    expect(live.state.sessionMode).toBe("single-player"); // sanity

    // Backdate the persisted snapshot beyond the stale TTL, then wake a FRESH DO
    // (hibernation eviction): onStart must reclaim the dead game's storage.
    storage.set("snapshot", {
      ...live,
      updatedAt: new Date(Date.now() - (STALE_ROOM_TTL_MS + 60_000)).toISOString()
    });
    const woken = new GameRoomServer(room);
    await woken.onStart();
    expect(storage.has("snapshot")).toBe(false);

    // CONTROL: a FRESH single-player snapshot survives the same wake.
    storage.set("snapshot", { ...live, updatedAt: new Date().toISOString() });
    const woken2 = new GameRoomServer(room);
    await woken2.onStart();
    expect(storage.has("snapshot")).toBe(true);
  });
});

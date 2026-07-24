/**
 * Edge reproduction of the deployed single-player / long-session bug: a
 * signed-in player's 10-minute socket ticket expires while the websocket stays
 * open, then Cloudflare hibernation evicts the Durable Object. The woken
 * instance's in-memory verified-identity memoization is empty, so the reconnect
 * re-verifies the (now expired) ticket over HTTP, gets null, and degrades the
 * actor to a GUEST — after which the hosted seat guard rejects EVERY action
 * ("That seat belongs to a verified account") until a page refresh mints a
 * fresh ticket.
 *
 * Fix A persists a token→identity record to the room's Durable Object storage
 * on every successful verify, and falls back to it when a later verify fails —
 * so a once-verified ticket keeps acting for THIS room across a cold wake. This
 * suite drives the real party over a COLD WAKE (a freshly-constructed server
 * over the SAME storage, the runtime's eviction behaviour) with a fake verifier
 * that returns an identity while "valid" and null once "expired".
 *
 * The isolation is a HOSTED MULTIPLAYER room bound to a verified account — so
 * only Fix A (the storage cache), not the single-player guard exemption (Fix B,
 * pinned in src/engine/verified-identity-seats.test.ts), can make the woken
 * action apply. The mutation control is the warm step: with the token never
 * verified (nothing cached), the woken action is rejected as a guest — proving
 * the cache never grants identity for a token that never successfully verified.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import GameRoomServer, { type RoomSnapshot } from "../../party/index";
import { applyAction, createAdventureGameState, type GameAction, type GameState } from "@/engine";

type EdgeRoom = ConstructorParameters<typeof GameRoomServer>[0];
type EdgeConnection = Parameters<GameRoomServer["onConnect"]>[0];
type EdgeRequest = Parameters<GameRoomServer["onRequest"]>[0];

type MockConnection = { id: string; uri: string; received: string[]; send: (data: string) => void };

const APP_URL = "https://app.example";

function makeConnection(id: string, query: string): MockConnection {
  const received: string[] = [];
  return {
    id,
    uri: `https://rooms.example.partykit.dev/parties/main/room?${query}`,
    received,
    send: (data: string) => received.push(data)
  };
}

/** A shared storage Map so a fresh server instance is a genuine COLD WAKE. */
function makeEdgeRoom(roomId: string) {
  const storage = new Map<string, unknown>();
  const connections = new Set<MockConnection>();
  let alarmAt: number | null = null;
  const room = {
    id: roomId,
    env: { HOMM3BG_APP_URL: APP_URL },
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
    getConnections: () => connections.values()
  };
  return { room: room as unknown as EdgeRoom, connections, storage };
}

function storedSnapshot(storage: Map<string, unknown>): RoomSnapshot {
  return storage.get("snapshot") as RoomSnapshot;
}

/**
 * A hosted MULTIPLAYER game where p1 is bound to verified account uA (member
 * clientId cA) and p2 to uB, seated by a separate host — the exact shape whose
 * seat guard refuses a guest that only claims cA.
 */
function seatedHostedGame(): GameState {
  const apply = (state: GameState, action: GameAction, actor: { clientId?: string; userId?: string } = {}) => {
    const result = applyAction(state, action, {
      ...(actor.clientId ? { actorClientId: actor.clientId } : {}),
      ...(actor.userId ? { actorUserId: actor.userId } : {})
    });
    if (result.errors.length > 0) {
      throw new Error(result.errors.map((error) => error.message).join("; "));
    }
    return result.state;
  };
  let state = createAdventureGameState({ seed: "hib-seat", difficulty: "normal", rollFirstPlayer: false });
  state = apply(state, { type: "JOIN_ROOM", clientId: "hClient", name: "Host" });
  state = apply(state, { type: "SET_ROOM_HOSTED", clientId: "hClient", hosted: true });
  state = apply(state, { type: "JOIN_ROOM", clientId: "cA", name: "Alice" }, { clientId: "cA", userId: "uA" });
  state = apply(state, { type: "JOIN_ROOM", clientId: "cB", name: "Bob" }, { clientId: "cB", userId: "uB" });
  state = apply(state, { type: "ASSIGN_SEAT", clientId: "hClient", targetClientId: "cA", seat: "p1" });
  state = apply(state, { type: "ASSIGN_SEAT", clientId: "hClient", targetClientId: "cB", seat: "p2" });
  if (state.activePlayerId !== "p1") {
    throw new Error(`expected p1 to be active, got ${state.activePlayerId}`);
  }
  return state;
}

function seedSnapshot(storage: Map<string, unknown>, roomId: string, state: GameState): void {
  storage.set("snapshot", {
    roomId,
    version: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    state
  } satisfies RoomSnapshot);
}

/** The verify-token callback the edge posts to. Identity while `valid`, else null. */
function installVerifier(valid: () => boolean): void {
  globalThis.fetch = vi.fn(async () => {
    if (!valid()) {
      return { ok: false, json: async () => null } as unknown as Response;
    }
    return {
      ok: true,
      json: async () => ({ userId: "uA", nickname: "Alice", isAdmin: false })
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

const getRequest = (roomId: string, clientId: string, token: string): EdgeRequest =>
  ({
    method: "GET",
    url: `https://rooms.example.partykit.dev/parties/main/${roomId}?clientId=${clientId}&token=${token}`,
    json: async () => null
  }) as unknown as EdgeRequest;

const actionFrame = (action: GameAction, actorClientId: string) =>
  JSON.stringify({ type: "action", action, actorClientId });

describe("verified identity survives hibernation (edge storage cache — Fix A)", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("a woken instance whose ticket EXPIRED still applies the verified seat's action", async () => {
    const roomId = "mp-hibernation-1";
    const { room, connections, storage } = makeEdgeRoom(roomId);
    seedSnapshot(storage, roomId, seatedHostedGame());

    let ticketValid = true;
    installVerifier(() => ticketValid);

    // Instance 1: the signed-in player is connected; a GET carrying the VALID
    // ticket warms (write-through) the storage identity cache.
    let server = new GameRoomServer(room);
    await server.onStart();
    await server.onRequest(getRequest(roomId, "cA", "tokA"));
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalled(); // live verify happened

    // The ticket expires while the socket stays open, then Cloudflare evicts the
    // Durable Object: a fresh instance over the SAME storage, verifier now null.
    ticketValid = false;
    server = new GameRoomServer(room);
    await server.onStart();

    const conn = makeConnection("cA-conn", "clientId=cA&token=tokA");
    connections.add(conn);
    await server.onMessage(actionFrame({ type: "END_TURN", playerId: "p1" }, "cA"), conn as unknown as EdgeConnection);

    const after = storedSnapshot(storage).state;
    expect(after.activePlayerId).toBe("p2"); // the action APPLIED — no guest lockout
    expect(storedSnapshot(storage).version).toBe(6);

    // Steady-state fast path: the recall primed an in-memory mirror, so a
    // SECOND action for the same lapsed ticket must not pay another failed
    // HTTP verify round-trip (it would otherwise tax every action for the
    // rest of the session). Count only the verify-token calls — the party's
    // lobby/match reporting shares the fetch mock.
    const verifyCalls = () =>
      vi
        .mocked(globalThis.fetch)
        .mock.calls.filter(([input]) => String(input).includes("/api/auth/verify-token")).length;
    const before = verifyCalls();
    await server.onMessage(actionFrame({ type: "END_TURN", playerId: "p2" }, "cA"), conn as unknown as EdgeConnection);
    expect(verifyCalls()).toBe(before);
  });

  it("CONTROL: a ticket that NEVER verified stays a guest and is rejected (cache grants nothing)", async () => {
    const roomId = "mp-hibernation-2";
    const { room, connections, storage } = makeEdgeRoom(roomId);
    seedSnapshot(storage, roomId, seatedHostedGame());

    // The ticket never verifies (nothing is ever written to the cache) — the
    // ONLY difference from the test above is the missing warm step.
    installVerifier(() => false);

    const server = new GameRoomServer(room);
    await server.onStart();

    const conn = makeConnection("cA-conn", "clientId=cA&token=tokA");
    connections.add(conn);
    await server.onMessage(actionFrame({ type: "END_TURN", playerId: "p1" }, "cA"), conn as unknown as EdgeConnection);

    const after = storedSnapshot(storage).state;
    expect(after.activePlayerId).toBe("p1"); // rejected — turn unchanged
    // The rejection the client sees is exactly the seat-identity refusal.
    const reply = conn.received
      .map((raw) => JSON.parse(raw) as { type: string; errors?: { message: string }[] })
      .find((message) => message.type === "action-result");
    expect(reply?.errors?.[0]?.message).toContain("verified account");
  });

  it("the identity cache is bounded and entries expire (no unbounded storage growth)", async () => {
    // A light structural check that the cache write prunes: warm many distinct
    // tickets and assert the stored map never exceeds the cap.
    const roomId = "mp-hibernation-3";
    const { room, storage } = makeEdgeRoom(roomId);
    seedSnapshot(storage, roomId, seatedHostedGame());
    installVerifier(() => true);
    const server = new GameRoomServer(room);
    await server.onStart();
    for (let i = 0; i < 80; i += 1) {
      await server.onRequest(getRequest(roomId, "cA", `tok-${i}`));
    }
    const cache = storage.get("verified-identity-cache") as Record<string, unknown> | undefined;
    expect(cache).toBeTruthy();
    expect(Object.keys(cache ?? {}).length).toBeLessThanOrEqual(64);
  });
});

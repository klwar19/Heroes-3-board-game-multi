import { describe, expect, it } from "vitest";
import GameRoomServer, { type RoomSnapshot } from "../../party/index";
import { getRoomSnapshot, restoreRoom, submitRoomAction, subscribeToRoom } from "./game-room-store";
import { createInitialGameState } from "@/engine";
import { WAR_MACHINE_CARD_IDS } from "@/data/cards/permanents";
import type { GameState } from "@/engine";

/**
 * War machines over the ACTUAL multiplayer transport — not just the reducer.
 *
 * Two backends carry the same GameState and both are exercised here:
 *   - the PartyKit edge server (party/index.ts): a Durable Object that loads
 *     its state, applies a client's `action` message through the engine, and
 *     broadcasts the new snapshot to every connected socket; and
 *   - the in-process room store (src/server/game-room-store.ts): the Next.js
 *     API/SSE backend, where submitRoomAction notifies every subscribed client.
 *
 * Each test seeds a real player-vs-player combat, drives a war-machine action
 * from one client through the server, and asserts BOTH connected clients see
 * the synced result — proving the machines work end to end in multiplayer, not
 * only in a single in-memory reducer call.
 */

// ---------------------------------------------------------------------------
// Shared PvP combat seed
// ---------------------------------------------------------------------------

/** A real `player`-context PvP combat between p1 (attacker) and p2 (defender). */
function pvpCombatState(seed: string): GameState {
  const state = createInitialGameState(seed);
  state.combat!.context = {
    kind: "player",
    attackerHeroId: "hero_p1",
    defenderHeroId: "hero_p2",
    fieldId: "field_center"
  };
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.players.p1.permanents = [];
  state.players.p2.permanents = [];
  return state;
}

/** Make `unitId` (owned by `owner`) the uniquely slowest enemy, tanky enough to read. */
function singleSlowest(state: GameState, owner: "p1" | "p2", unitId: string): void {
  const units = state.combat!.units;
  let next = 8;
  for (const id of Object.keys(units)) {
    if (units[id].controllerId === owner) {
      units[id].initiative = id === unitId ? 1 : next--;
    }
  }
  units[unitId].maxHealth = 12;
  units[unitId].damage = 0;
}

// ---------------------------------------------------------------------------
// PartyKit edge server (mock Durable Object room + two client sockets)
// ---------------------------------------------------------------------------

type MockConnection = { id: string; received: string[]; send: (data: string) => void };

function makeConnection(id: string): MockConnection {
  const received: string[] = [];
  return { id, received, send: (data: string) => received.push(data) };
}

/** Latest GameState a client received over any server message (snapshot or result). */
function latestState(conn: MockConnection): GameState {
  for (let i = conn.received.length - 1; i >= 0; i -= 1) {
    const message = JSON.parse(conn.received[i]) as { snapshot?: RoomSnapshot };
    if (message.snapshot) {
      return message.snapshot.state;
    }
  }
  throw new Error(`${conn.id} received no snapshot`);
}

/** The last action-result a client got back for its own submitted action. */
function lastActionResult(conn: MockConnection): { errors: { message: string }[]; snapshot: RoomSnapshot } {
  for (let i = conn.received.length - 1; i >= 0; i -= 1) {
    const message = JSON.parse(conn.received[i]) as {
      type: string;
      errors?: { message: string }[];
      snapshot: RoomSnapshot;
    };
    if (message.type === "action-result") {
      return { errors: message.errors ?? [], snapshot: message.snapshot };
    }
  }
  throw new Error(`${conn.id} received no action-result`);
}

type EdgeRoom = ConstructorParameters<typeof GameRoomServer>[0];
type EdgeConnection = Parameters<GameRoomServer["onConnect"]>[0];

/** A mock PartyKit room whose broadcast fans out to a live connection set. */
function makeEdgeRoom(roomId: string, seedState: GameState) {
  const storage = new Map<string, unknown>();
  storage.set("snapshot", {
    roomId,
    version: 1,
    updatedAt: new Date().toISOString(),
    state: seedState
  } satisfies RoomSnapshot);

  const connections = new Set<MockConnection>();
  const room = {
    id: roomId,
    storage: {
      get: async (key: string) => storage.get(key),
      put: async (key: string, value: unknown) => {
        storage.set(key, value);
      }
    },
    broadcast: (data: string) => {
      for (const connection of connections) {
        connection.send(data);
      }
    }
  };
  return { room: room as unknown as EdgeRoom, connections };
}

async function bootEdgeRoom(roomId: string, seedState: GameState) {
  const { room, connections } = makeEdgeRoom(roomId, seedState);
  const server = new GameRoomServer(room);
  await server.onStart();

  const client1 = makeConnection("client1");
  const client2 = makeConnection("client2");
  connections.add(client1);
  connections.add(client2);
  // Each client receives the current snapshot when it attaches.
  server.onConnect(client1 as unknown as EdgeConnection);
  server.onConnect(client2 as unknown as EdgeConnection);

  return { server, client1, client2 };
}

describe("PartyKit edge server — war machines sync to every client", () => {
  it("both clients receive the seeded PvP combat snapshot on connect", async () => {
    const { client1, client2 } = await bootEdgeRoom("edge-connect", pvpCombatState("edge-connect"));
    expect(latestState(client1).combat?.context.kind).toBe("player");
    expect(latestState(client2).combat?.context.kind).toBe("player");
  });

  it("plays EVERY war machine from hand and both clients see it enter play", async () => {
    for (const cardId of WAR_MACHINE_CARD_IDS) {
      const seed = pvpCombatState(`edge-play-${cardId}`);
      seed.players.p1.hand = [cardId];
      // The freshly-built combat opens with p1's griffins activating, so the
      // permanent is a legal "put into play" right away.

      const { server, client1, client2 } = await bootEdgeRoom(`edge-play-${cardId}`, seed);
      await server.onMessage(
        JSON.stringify({
          type: "action",
          requestId: "r1",
          action: { type: "PLAY_CARD", playerId: "p1", cardId, mode: "basic", target: { type: "none" } }
        }),
        client1 as unknown as EdgeConnection
      );

      // The acting client's request succeeded...
      expect(lastActionResult(client1).errors).toEqual([]);
      // ...and BOTH clients now see the machine in p1's permanents.
      expect(latestState(client1).players.p1.permanents, cardId).toContain(cardId);
      expect(latestState(client2).players.p1.permanents, cardId).toContain(cardId);
    }
  });

  it("a Ballista's round-start shot resolves on the server and reaches both clients", async () => {
    const seed = pvpCombatState("edge-ballista");
    seed.players.p1.permanents = ["war_machine.ballista"];
    seed.players.p2.permanents = ["war_machine.ballista"];
    singleSlowest(seed, "p2", "unit_p2_dread_knights");
    singleSlowest(seed, "p1", "unit_p1_crusaders");
    seed.combat!.activeUnitId = null;
    seed.activePlayerId = "p1";

    const { server, client1, client2 } = await bootEdgeRoom("edge-ballista", seed);
    await server.onMessage(
      JSON.stringify({ type: "action", requestId: "r1", action: { type: "END_COMBAT_ROUND", playerId: "p1" } }),
      client1 as unknown as EdgeConnection
    );

    for (const client of [client1, client2]) {
      const state = latestState(client);
      expect(state.combat!.units.unit_p2_dread_knights.damage).toBe(1);
      expect(state.combat!.units.unit_p1_crusaders.damage).toBe(1);
    }
  });

  it("an illegal war-machine action is rejected without broadcasting a new state", async () => {
    const seed = pvpCombatState("edge-illegal");
    // p1 holds no Cannon, so trying to play one must fail and change nothing.
    const { server, client1, client2 } = await bootEdgeRoom("edge-illegal", seed);
    const versionBefore = latestState(client2);
    const receivedBefore = client2.received.length;

    await server.onMessage(
      JSON.stringify({
        type: "action",
        requestId: "r1",
        action: { type: "PLAY_CARD", playerId: "p1", cardId: "war_machine.cannon", mode: "basic", target: { type: "none" } }
      }),
      client1 as unknown as EdgeConnection
    );

    expect(lastActionResult(client1).errors.length).toBeGreaterThan(0);
    // No broadcast went out to the other client; its state is untouched.
    expect(client2.received.length).toBe(receivedBefore);
    expect(latestState(client1).players.p1.permanents).not.toContain("war_machine.cannon");
    expect(versionBefore.players.p1.permanents).not.toContain("war_machine.cannon");
  });
});

// ---------------------------------------------------------------------------
// In-process room store (Next.js API/SSE backend) — two subscribed clients
// ---------------------------------------------------------------------------

describe("In-process room store — war machine fire notifies every subscriber", () => {
  it("broadcasts a Ballista round-start shot to both subscribed clients", () => {
    const roomId = `store-ballista-${Math.random().toString(36).slice(2)}`;
    // A fresh room opens as a setup lobby; restoreRoom swaps in our PvP combat
    // (it only overwrites a fresh lobby, never a live game).
    getRoomSnapshot(roomId);

    const seed = pvpCombatState(roomId);
    seed.players.p1.permanents = ["war_machine.ballista"];
    singleSlowest(seed, "p2", "unit_p2_dread_knights");
    seed.combat!.activeUnitId = null;
    seed.activePlayerId = "p1";
    restoreRoom(roomId, seed);

    const client1: GameState[] = [];
    const client2: GameState[] = [];
    const unsub1 = subscribeToRoom(roomId, (snapshot) => client1.push(snapshot.state));
    const unsub2 = subscribeToRoom(roomId, (snapshot) => client2.push(snapshot.state));

    const { result } = submitRoomAction(roomId, { type: "END_COMBAT_ROUND", playerId: "p1" });
    expect(result.errors).toEqual([]);

    for (const updates of [client1, client2]) {
      expect(updates.length).toBeGreaterThan(0);
      expect(updates.at(-1)!.combat!.units.unit_p2_dread_knights.damage).toBe(1);
    }

    unsub1();
    unsub2();
  });
});

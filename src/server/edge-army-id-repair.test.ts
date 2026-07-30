/**
 * PartyKit edge server — the reducer's duplicate-army-id REPAIR must be adopted
 * even when the triggering action is REJECTED.
 *
 * applyAction validates against a repaired CLONE whenever the stored state
 * carries duplicate army-unit ids, and documents that "that copy is returned
 * even on failure so the stored room heals on the next action". The edge used
 * to drop the returned state on a rejection: the room kept serving the
 * UNREPAIRED state (the ids every client held) while every legality check ran
 * against the repaired clone — so once ids were renamed by the repair, unit
 * commands referencing the served ids were rejected with the generic
 * "That action is not legal in the current game state." on every click,
 * forever, with the version never moving (so the client's stale-state resync
 * never fired either). The built-in store heals on every read; the edge now
 * adopts the repair (bump + persist + broadcast) on the rejected path too.
 */
import { describe, expect, it } from "vitest";
import GameRoomServer, { type RoomSnapshot } from "../../party/index";
import { createAdventureGameState } from "@/engine";
import { hasDuplicateArmyUnitIds } from "@/engine/adventure";

type EdgeRoom = ConstructorParameters<typeof GameRoomServer>[0];
type EdgeConnection = Parameters<GameRoomServer["onConnect"]>[0];

type MockConnection = { id: string; uri: string; received: string[]; send: (data: string) => void };

function makeConnection(id: string, clientId: string): MockConnection {
  const received: string[] = [];
  return {
    id,
    uri: `https://example.partykit.dev/parties/main/room?clientId=${clientId}`,
    received,
    send: (data: string) => received.push(data)
  };
}

function makeEdgeRoom(roomId: string, snapshot: RoomSnapshot) {
  const storage = new Map<string, unknown>();
  storage.set("snapshot", snapshot);
  const connections = new Set<MockConnection>();
  const room = {
    id: roomId,
    env: {},
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

describe("PartyKit edge server — duplicate-army-id repair on a REJECTED action", () => {
  it("adopts, persists and broadcasts the repaired state instead of diverging from every client", async () => {
    const state = createAdventureGameState({ seed: "edge-army-repair", rollFirstPlayer: false });
    // Corrupt the stored room the way the legacy id scheme could: two army
    // cards sharing one id.
    const army = state.players.p1.army;
    expect(army.length).toBeGreaterThan(1);
    army[1].id = army[0].id;
    expect(hasDuplicateArmyUnitIds(state)).toBe(true);

    const { room, connections, storage } = makeEdgeRoom("edge-army-repair", {
      roomId: "edge-army-repair",
      version: 7,
      updatedAt: new Date().toISOString(),
      state
    });
    const server = new GameRoomServer(room);
    await server.onStart();
    const player = makeConnection("conn-a", "client-a");
    connections.add(player);

    // An action the reducer REJECTS (no combat is open, so no unit can hold).
    await server.onMessage(
      JSON.stringify({
        type: "action",
        requestId: "req-reject",
        actorClientId: "client-a",
        action: { type: "END_ACTIVATION", playerId: "p1", unitId: "nope" }
      }),
      player as unknown as EdgeConnection
    );

    const frames = player.received.map((raw) => JSON.parse(raw) as { type: string } & Record<string, unknown>);
    const result = frames.find((frame) => frame.type === "action-result") as
      | { errors: unknown[]; version: number }
      | undefined;
    expect(result).toBeDefined();
    expect((result!.errors as unknown[]).length).toBeGreaterThan(0);

    // The repair was ADOPTED: version bumped, the persisted + broadcast state
    // carries unique ids again. Before the fix nothing was persisted or
    // broadcast on a rejection, and the reply stayed at version 7.
    expect(result!.version).toBe(8);
    const persisted = storage.get("snapshot") as RoomSnapshot;
    expect(persisted.version).toBe(8);
    expect(hasDuplicateArmyUnitIds(persisted.state)).toBe(false);
    const broadcast = frames.find((frame) => frame.type === "snapshot") as
      | { snapshot: RoomSnapshot }
      | undefined;
    expect(broadcast).toBeDefined();
    expect(broadcast!.snapshot.version).toBe(8);
    expect(hasDuplicateArmyUnitIds(broadcast!.snapshot.state)).toBe(false);

    // CONTROL: a rejection on a HEALTHY room stays a pure no-op — no version
    // bump, nothing persisted or broadcast.
    player.received.length = 0;
    await server.onMessage(
      JSON.stringify({
        type: "action",
        requestId: "req-reject-2",
        actorClientId: "client-a",
        action: { type: "END_ACTIVATION", playerId: "p1", unitId: "nope" }
      }),
      player as unknown as EdgeConnection
    );
    const second = player.received.map((raw) => JSON.parse(raw) as { type: string } & Record<string, unknown>);
    const secondResult = second.find((frame) => frame.type === "action-result") as
      | { errors: unknown[]; version: number }
      | undefined;
    expect(secondResult).toBeDefined();
    expect((secondResult!.errors as unknown[]).length).toBeGreaterThan(0);
    expect(secondResult!.version).toBe(8);
    expect(second.find((frame) => frame.type === "snapshot")).toBeUndefined();
    expect((storage.get("snapshot") as RoomSnapshot).version).toBe(8);
  });
});

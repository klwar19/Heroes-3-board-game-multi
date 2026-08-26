/**
 * Large/high-seat-count rooms can exceed the legacy Durable Object KV
 * backend's 128 KiB per-value limit. The edge server must keep committing and
 * survive a cold wake instead of returning the generic pre-commit failure.
 */
import { describe, expect, it } from "vitest";
import GameRoomServer, { type RoomSnapshot } from "../../party/index";
import { createInitialGameState, type GameEvent } from "@/engine";

type EdgeRoom = ConstructorParameters<typeof GameRoomServer>[0];
type EdgeConnection = Parameters<GameRoomServer["onConnect"]>[0];
type MockConnection = { id: string; uri: string; received: string[]; send: (data: string) => void };

function connection(id: string): MockConnection {
  const received: string[] = [];
  return {
    id,
    uri: `https://example.partykit.dev/parties/main/large-room?clientId=${id}`,
    received,
    send: (data) => received.push(data)
  };
}

function makeSizeLimitedRoom(roomId: string, snapshot: RoomSnapshot) {
  const storage = new Map<string, unknown>([["snapshot", snapshot]]);
  const connections = new Set<MockConnection>();
  const encoder = new TextEncoder();
  const byteLength = (value: unknown) =>
    value instanceof Uint8Array ? value.byteLength : encoder.encode(JSON.stringify(value)).byteLength;
  const room = {
    id: roomId,
    env: {},
    storage: {
      get: async (key: string) => storage.get(key),
      put: async (key: string, value: unknown) => {
        if (byteLength(value) > 128 * 1024) {
          throw new RangeError("Values cannot be larger than 131072 bytes.");
        }
        storage.set(key, value);
      },
      delete: async (key: string) => storage.delete(key),
      setAlarm: async () => {},
      getAlarm: async () => null,
      deleteAlarm: async () => {}
    },
    broadcast: (data: string) => {
      for (const peer of connections) peer.send(data);
    },
    getConnections: () => connections.values(),
    context: { parties: {} }
  };
  return { room: room as unknown as EdgeRoom, storage, connections };
}

function latestSnapshot(peer: MockConnection): RoomSnapshot {
  for (let index = peer.received.length - 1; index >= 0; index -= 1) {
    const frame = JSON.parse(peer.received[index]!) as { type: string; snapshot?: RoomSnapshot };
    if (frame.type === "snapshot" && frame.snapshot) return frame.snapshot;
  }
  throw new Error("No snapshot frame received.");
}

describe("PartyKit large-room snapshot persistence", () => {
  it("chunks a snapshot above 128 KiB, commits more actions, and restores it after a cold wake", async () => {
    const roomId = "large-six-player-room";
    const state = createInitialGameState(roomId);
    state.eventLog = Array.from({ length: 220 }, (_, index) => ({
      id: `evt_${index + 1}`,
      type: "EVENT_NOTE",
      message: `${index}:${"large-map-history-".repeat(70)}`
    })) as GameEvent[];
    const initial: RoomSnapshot = {
      roomId,
      version: 7,
      updatedAt: new Date().toISOString(),
      state
    };
    expect(new TextEncoder().encode(JSON.stringify(initial)).byteLength).toBeGreaterThan(128 * 1024);

    const { room, storage, connections } = makeSizeLimitedRoom(roomId, initial);
    let server = new GameRoomServer(room);
    await server.onStart();
    const alice = connection("alice");
    connections.add(alice);
    await server.onMessage(
      JSON.stringify({
        type: "action",
        requestId: "large-1",
        actorClientId: "alice",
        action: { type: "JOIN_ROOM", clientId: "alice", name: "Alice" }
      }),
      alice as unknown as EdgeConnection
    );

    const firstManifest = storage.get("snapshot") as { format?: string; bank?: string; chunkCount?: number };
    expect(firstManifest).toMatchObject({ format: "room-snapshot-chunks-v1", bank: "a" });
    expect(firstManifest.chunkCount).toBeGreaterThan(1);
    expect(latestSnapshot(alice).version).toBe(8);

    const bob = connection("bob");
    connections.add(bob);
    await server.onMessage(
      JSON.stringify({
        type: "action",
        requestId: "large-2",
        actorClientId: "bob",
        action: { type: "JOIN_ROOM", clientId: "bob", name: "Bob" }
      }),
      bob as unknown as EdgeConnection
    );
    expect(storage.get("snapshot")).toMatchObject({ format: "room-snapshot-chunks-v1", bank: "b" });

    // A fresh instance reproduces Durable Object hibernation/cold wake and must
    // reconstruct the complete authoritative state from the manifest/chunks.
    server = new GameRoomServer(room);
    await server.onStart();
    const recovered = connection("observer");
    connections.add(recovered);
    await server.onMessage(JSON.stringify({ type: "sync" }), recovered as unknown as EdgeConnection);
    const restored = latestSnapshot(recovered);
    expect(restored.version).toBe(9);
    expect(restored.state.eventLog).toHaveLength(222);
    expect(restored.state.eventLog[0]).toMatchObject({ id: "evt_1", type: "EVENT_NOTE" });
    expect(restored.state.room?.members.map((member) => member.name).sort()).toEqual(["Alice", "Bob"]);
  });
});

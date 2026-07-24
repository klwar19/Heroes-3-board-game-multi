/**
 * Single-player SAVE SLOTS on the PartyKit EDGE backend (party/index.ts),
 * exercised through the real `onRequest` HTTP path 窶・the same path production
 * uses. Both backends call the shared single-player-save helpers at the same
 * seams; this pins the edge wiring so it cannot silently diverge from the
 * built-in store (covered in single-player-save.test.ts).
 */
import { describe, expect, it } from "vitest";
import GameRoomServer, { type RoomSnapshot } from "../../party/index";
import { createAdventureGameState, type GameState } from "@/engine";

type EdgeRoom = ConstructorParameters<typeof GameRoomServer>[0];
type EdgeRequest = Parameters<GameRoomServer["onRequest"]>[0];

function makeEdgeRoom(roomId: string, seedState: GameState, version = 7) {
  const storage = new Map<string, unknown>();
  storage.set("snapshot", {
    roomId,
    version,
    updatedAt: new Date().toISOString(),
    state: seedState
  } satisfies RoomSnapshot);
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
    broadcast: () => {},
    getConnections: () => [][Symbol.iterator](),
    context: { parties: {} }
  };
  return { room: room as unknown as EdgeRoom, storage };
}

function stored(storage: Map<string, unknown>): RoomSnapshot {
  return storage.get("snapshot") as RoomSnapshot;
}

/** A started solo adventure owned (guest identity) by owner-c on seat p1. */
function soloGame(seed: string): GameState {
  const state = createAdventureGameState({
    seed,
    scenarioId: "skirmish",
    playerCount: 2,
    rollFirstPlayer: false,
    sessionMode: "single-player",
    computerOpponents: 1
  });
  state.room = {
    hosted: true,
    hostClientId: "owner-c",
    members: [{ clientId: "owner-c", name: "Owner", seat: "p1", isHost: true }],
    visibility: "private",
    ranked: false,
    ownerClientId: "owner-c"
  };
  return state;
}

function postRequest(roomId: string, body: unknown): EdgeRequest {
  return {
    method: "POST",
    url: `https://example.partykit.dev/parties/main/${roomId}`,
    headers: new Headers(),
    json: async () => body
  } as unknown as EdgeRequest;
}

describe("PartyKit edge: single-player save slots via onRequest", () => {
  it("spSave returns the RAW state to the owner and refuses a stranger (CONTROL)", async () => {
    const seed = soloGame("edge-sp-save");
    const { room } = makeEdgeRoom("edge-sp-save-room", seed);
    const server = new GameRoomServer(room);
    await server.onStart();

    const ownerReply = await server.onRequest(postRequest("edge-sp-save-room", { spSave: true, actorClientId: "owner-c" }));
    expect(ownerReply.status).toBe(200);
    const payload = (await ownerReply.json()) as { spSave?: boolean; state: GameState; version: number };
    // The stale-edge marker: the client refuses any reply without it (an older
    // deploy would answer with a generic REDACTED snapshot instead).
    expect(payload.spSave).toBe(true);
    expect(payload.version).toBe(7);
    // RAW: the owner's own deck order is intact (a redacted frame hides it).
    expect(payload.state.players.p1.deck).toEqual(seed.players.p1.deck);
    expect(payload.state.players.p1.deck).not.toContain("hidden");

    const strangerReply = await server.onRequest(
      postRequest("edge-sp-save-room", { spSave: true, actorClientId: "intruder-c" })
    );
    expect(strangerReply.status).toBe(403);
  });

  it("spLoad swaps the room's game to the saved snapshot (version bump, live membership kept); wrong actor rejected", async () => {
    const seed = soloGame("edge-sp-load");
    const { room, storage } = makeEdgeRoom("edge-sp-load-room", seed);
    const server = new GameRoomServer(room);
    await server.onStart();

    const saved = JSON.parse(JSON.stringify(seed)) as GameState;
    saved.round = 9;
    saved.room = { hosted: true, hostClientId: "stale-c", members: [{ clientId: "stale-c", name: "Stale", seat: "p1", isHost: false }] };

    const intruder = await server.onRequest(
      postRequest("edge-sp-load-room", { spLoad: true, state: saved, actorClientId: "intruder-c" })
    );
    expect(intruder.status).toBe(403);
    expect(stored(storage).version).toBe(7);

    const reply = await server.onRequest(
      postRequest("edge-sp-load-room", { spLoad: true, state: saved, actorClientId: "owner-c" })
    );
    expect(reply.status).toBe(200);
    // The applied-marker: an older deploy would return a plain snapshot
    // WITHOUT loading — the client must be able to tell the difference.
    const replyPayload = (await reply.json()) as { spLoad?: boolean; snapshot?: { version: number } };
    expect(replyPayload.spLoad).toBe(true);
    expect(replyPayload.snapshot?.version).toBe(8);
    const after = stored(storage);
    expect(after.version).toBe(8);
    expect(after.state.round).toBe(9);
    // The live room membership wins over the stale saved one.
    expect(after.state.room?.members?.some((member) => member.clientId === "owner-c")).toBe(true);
    expect(after.state.room?.members?.some((member) => member.clientId === "stale-c")).toBe(false);
    const tail = after.state.eventLog[after.state.eventLog.length - 1];
    expect(tail.type).toBe("EVENT_NOTE");
  });

  it("CONTROL: a multiplayer room exposes neither surface on the edge", async () => {
    const state = createAdventureGameState({
      seed: "edge-sp-scope",
      scenarioId: "skirmish",
      playerCount: 2,
      rollFirstPlayer: false
    });
    state.room = {
      hosted: true,
      hostClientId: "owner-c",
      members: [{ clientId: "owner-c", name: "Owner", seat: "p1", isHost: true }]
    };
    const { room, storage } = makeEdgeRoom("edge-sp-scope-room", state);
    const server = new GameRoomServer(room);
    await server.onStart();

    const save = await server.onRequest(postRequest("edge-sp-scope-room", { spSave: true, actorClientId: "owner-c" }));
    expect(save.status).toBe(403);
    const load = await server.onRequest(
      postRequest("edge-sp-scope-room", { spLoad: true, state: soloGame("edge-sp-scope-save"), actorClientId: "owner-c" })
    );
    expect(load.status).toBe(403);
    expect(stored(storage).version).toBe(7);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import GameRoomServer, { type RoomSnapshot } from "../../party/index";
import { createAdventureGameState } from "@/engine";
import { createRankedReplay } from "./ranked-replay";

type EdgeRoom = ConstructorParameters<typeof GameRoomServer>[0];

afterEach(() => vi.unstubAllGlobals());

describe("PartyKit ranked match durable report outbox", () => {
  it("keeps the replay after a failed upload and deletes it only after durable acknowledgement", async () => {
    const state = createAdventureGameState({ seed: "durable-report", playerCount: 2, rollFirstPlayer: false });
    state.room = {
      hosted: true,
      ranked: true,
      hostClientId: "c1",
      members: [
        { clientId: "c1", name: "Alice", seat: "p1", isHost: true, userId: "u1" },
        { clientId: "c2", name: "Bob", seat: "p2", isHost: false, userId: "u2" },
      ],
    };
    const snapshot: RoomSnapshot = { roomId: "durable-report", version: 1, updatedAt: new Date().toISOString(), state };
    const replay = createRankedReplay(state, 1);
    const encodedInitial = new TextEncoder().encode(JSON.stringify(replay.initialState));
    const chunkBytes = 96 * 1024;
    const initialChunkCount = Math.ceil(encodedInitial.byteLength / chunkBytes);
    const { initialState: _initialState, entries: _entries, ...header } = replay;
    const storage = new Map<string, unknown>([
      ["snapshot", snapshot],
      ["ranked-replay-meta", { ...header, initialChunkCount, entryCount: 0 }],
      ["ranked-match-report-outbox-v1", {
        format: "homm3bg-ranked-match-report-outbox-v1",
        match: {
          matchId: replay.matchId,
          ranked: true,
          participants: [
            { accountId: "u1", nickname: "Alice", result: "win" },
            { accountId: "u2", nickname: "Bob", result: "loss" },
          ],
        },
        replayRequired: true,
        attempts: 0,
        createdAt: new Date(1).toISOString(),
      }],
    ]);
    for (let index = 0; index < initialChunkCount; index += 1) {
      storage.set(`ranked-replay-initial-${index}`, encodedInitial.slice(index * chunkBytes, (index + 1) * chunkBytes));
    }
    const alarms: number[] = [];
    const room = {
      id: "durable-report",
      env: {
        HOMM3BG_RANKED_REPLAY_ENABLED: "true",
        HOMM3BG_APP_URL: "https://app.example",
        HOMM3BG_MATCH_REPORT_KEY: "shared",
      },
      storage: {
        get: async (key: string) => storage.get(key),
        put: async (key: string, value: unknown) => { storage.set(key, value); },
        delete: async (key: string) => storage.delete(key),
        setAlarm: async (at: number) => { alarms.push(at); },
        getAlarm: async () => null,
        deleteAlarm: async () => {},
      },
      broadcast: () => {},
      getConnections: () => [],
      context: { parties: {} },
    } as unknown as EdgeRoom;

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "REPLAY_STORE_UNAVAILABLE" }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ applied: true, replayStored: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const server = new GameRoomServer(room);
    await server.onStart();
    await server.onAlarm();
    expect(storage.has("ranked-match-report-outbox-v1")).toBe(true);
    expect(storage.has("ranked-replay-meta")).toBe(true);
    expect(alarms.length).toBeGreaterThan(0);

    await server.onAlarm();
    expect(storage.has("ranked-match-report-outbox-v1")).toBe(false);
    expect(storage.has("ranked-replay-meta")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const uploaded = JSON.parse(String(fetchMock.mock.calls[1]![1]?.body));
    expect(uploaded.matchId).toBe("durable-report");
    expect(uploaded.replay.entries).toEqual([]);
  });
});

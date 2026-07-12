// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectRoom, requestCloseRoom } from "./realtime";

const partySocketMock = vi.hoisted(() => ({
  instances: [] as {
    close: ReturnType<typeof vi.fn>;
    reconnect: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    options: unknown;
    emit: (type: string, event?: unknown) => void;
  }[]
}));

vi.mock("partysocket", () => {
  class FakePartySocket {
    close = vi.fn();
    reconnect = vi.fn();
    send = vi.fn();
    options: unknown;
    private listeners = new Map<string, ((event: unknown) => void)[]>();

    constructor(options: unknown) {
      this.options = options;
      partySocketMock.instances.push(this);
    }

    addEventListener(type: string, listener: (event: unknown) => void) {
      const list = this.listeners.get(type) ?? [];
      list.push(listener);
      this.listeners.set(type, list);
    }

    emit(type: string, event: unknown = {}) {
      for (const listener of this.listeners.get(type) ?? []) {
        listener(event);
      }
    }
  }

  return { default: FakePartySocket };
});

/**
 * `requestCloseRoom` must let a PLATFORM ADMIN close ANY room. On the built-in
 * backend the same-origin httpOnly session cookie carries the admin role, so
 * nothing extra is needed. On the cross-origin PartyKit edge the browser cannot
 * send that cookie, so the admin's short-lived socket ticket must ride on the
 * request `?token=` for the edge to verify — this pins that wiring.
 */
describe("requestCloseRoom — admin session reaches the transport", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ closed: true })
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.NEXT_PUBLIC_PARTYKIT_HOST;
    vi.restoreAllMocks();
  });

  it("attaches the session ticket to the PartyKit DELETE URL", async () => {
    process.env.NEXT_PUBLIC_PARTYKIT_HOST = "rooms.example.partykit.dev";
    const getToken = vi.fn(async () => "admin-ticket");

    const result = await requestCloseRoom("room-42", "client-abc", getToken);
    expect(result.closed).toBe(true);

    expect(getToken).toHaveBeenCalledTimes(1);
    const url = String(vi.mocked(globalThis.fetch).mock.calls[0][0]);
    const parsed = new URL(url);
    expect(parsed.host).toBe("rooms.example.partykit.dev");
    expect(parsed.searchParams.get("clientId")).toBe("client-abc");
    // The verified ticket the edge resolves the admin from.
    expect(parsed.searchParams.get("token")).toBe("admin-ticket");
  });

  it("the built-in backend hits the same-origin API route and never needs a ticket", async () => {
    // No PARTYKIT host → built-in path. getSocketToken must NOT be called (the
    // cookie authenticates the admin same-origin).
    const getToken = vi.fn(async () => "unused");
    await requestCloseRoom("room-42", "client-abc", getToken);

    expect(getToken).not.toHaveBeenCalled();
    const url = String(vi.mocked(globalThis.fetch).mock.calls[0][0]);
    expect(url).toBe("/api/rooms/room-42");
  });
});

/**
 * Hosted edge rooms redact snapshots by verified actor. If HTTP polling or the
 * recovery fetch omits the socket ticket, a signed-in player/admin can receive
 * an observer-redacted frame and miss the Event choice currently waiting on
 * their seat.
 */
describe("connectRoom - PartyKit snapshot identity", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    partySocketMock.instances.length = 0;
    process.env.NEXT_PUBLIC_PARTYKIT_HOST = "rooms.example.partykit.dev";
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ roomId: "room-42", version: 1, updatedAt: "now", state: {} })
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.NEXT_PUBLIC_PARTYKIT_HOST;
    vi.restoreAllMocks();
  });

  it("attaches the session ticket to PartyKit fetchSnapshot and restoreRoom URLs", async () => {
    const getToken = vi.fn(async () => "player-ticket");
    const connection = connectRoom(
      "room-42",
      { onSnapshot: vi.fn(), onStatus: vi.fn() },
      "client-abc",
      getToken
    );

    await connection.fetchSnapshot();
    await connection.restoreRoom({} as never);

    expect(getToken).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(globalThis.fetch).mock.calls) {
      const parsed = new URL(String(call[0]));
      expect(parsed.host).toBe("rooms.example.partykit.dev");
      expect(parsed.searchParams.get("clientId")).toBe("client-abc");
      expect(parsed.searchParams.get("token")).toBe("player-ticket");
    }
    connection.close();
  });
});

/**
 * Hosted-room reconnect healing. The server's synchronous connect frame is the
 * zero-trust OBSERVER view at the room's CURRENT version; if nothing changed
 * while the socket was down, no later broadcast is due — so without a
 * seat-authoritative refetch the player's own hand/Pandora cards stayed masked
 * until someone changed the room state. The transport must also report every
 * drop (onDropped) so the app can re-join a membership the server reaped.
 */
describe("connectRoom — PartyKit drop/reconnect handling", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    partySocketMock.instances.length = 0;
    process.env.NEXT_PUBLIC_PARTYKIT_HOST = "rooms.example.partykit.dev";
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ roomId: "room-42", version: 7, updatedAt: "now", state: {} })
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.NEXT_PUBLIC_PARTYKIT_HOST;
    vi.restoreAllMocks();
  });

  it("reports drops, and refetches a SEAT-AUTHORITATIVE snapshot on re-open (never on first open)", async () => {
    const onSnapshot = vi.fn();
    const onDropped = vi.fn();
    const connection = connectRoom(
      "room-42",
      { onSnapshot, onStatus: vi.fn(), onDropped },
      "client-abc",
      async () => "player-ticket"
    );
    const socket = partySocketMock.instances.at(-1)!;

    // First open: the server's connect frame is on its way — no extra fetch.
    socket.emit("open");
    await Promise.resolve();
    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
    expect(onDropped).not.toHaveBeenCalled();

    // Transient drop: the app is told, so it can re-arm its join guard.
    socket.emit("close");
    expect(onDropped).toHaveBeenCalledTimes(1);

    // Reconnect: the seat-redacted HTTP snapshot is fetched and delivered as a
    // seat-authoritative frame (accepted even at the SAME version).
    socket.emit("open");
    await vi.waitFor(() => expect(onSnapshot).toHaveBeenCalledTimes(1));
    expect(onSnapshot.mock.calls[0][1]).toEqual({ source: "http-recovery", seatAuthoritative: true });
    expect((onSnapshot.mock.calls[0][0] as { version: number }).version).toBe(7);
    const url = new URL(String(vi.mocked(globalThis.fetch).mock.calls[0][0]));
    expect(url.searchParams.get("clientId")).toBe("client-abc");
    expect(url.searchParams.get("token")).toBe("player-ticket");

    connection.close();
  });
});

describe("connectRoom - PartyKit acknowledgement and health protocol", () => {
  beforeEach(() => {
    partySocketMock.instances.length = 0;
    process.env.NEXT_PUBLIC_PARTYKIT_HOST = "rooms.example.partykit.dev";
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_PARTYKIT_HOST;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("accepts state only from the broadcast and resolves a small acknowledgement", async () => {
    const onSnapshot = vi.fn();
    const connection = connectRoom("room-42", { onSnapshot, onStatus: vi.fn() }, "client-abc");
    const socket = partySocketMock.instances.at(-1)!;
    socket.emit("open");
    const resultPromise = connection.submitAction({ type: "END_TURN", playerId: "p1" } as never);
    const actionFrame = JSON.parse(String(socket.send.mock.calls.at(-1)![0])) as { requestId: string };
    socket.emit("message", {
      data: JSON.stringify({ type: "snapshot", snapshot: { roomId: "room-42", version: 2, updatedAt: "now", state: {} } })
    });
    socket.emit("message", {
      data: JSON.stringify({ type: "action-result", requestId: actionFrame.requestId, version: 2, errors: [], notices: ["ok"] })
    });
    await expect(resultPromise).resolves.toMatchObject({ version: 2, errors: [], notices: ["ok"] });
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    connection.close();
  });

  it("pings a silent visible socket and syncs when the server is newer", () => {
    vi.useFakeTimers();
    const connection = connectRoom("room-42", { onSnapshot: vi.fn(), onStatus: vi.fn() }, "client-abc");
    const socket = partySocketMock.instances.at(-1)!;
    socket.emit("open");
    vi.advanceTimersByTime(35_000);
    expect(socket.send.mock.calls.map((call) => JSON.parse(String(call[0])).type)).toContain("ping");
    socket.emit("message", { data: JSON.stringify({ type: "pong", version: 3, viewerSeat: "p1" }) });
    expect(JSON.parse(String(socket.send.mock.calls.at(-1)![0])).type).toBe("sync");
    connection.close();
  });

  it("probes immediately when a long-suspended tab wakes", () => {
    vi.useFakeTimers();
    const connection = connectRoom("room-42", { onSnapshot: vi.fn(), onStatus: vi.fn() }, "client-abc");
    const socket = partySocketMock.instances.at(-1)!;
    socket.emit("open");

    vi.setSystemTime(Date.now() + 40_000);
    window.dispatchEvent(new Event("focus"));

    const frameTypes = socket.send.mock.calls.map((call) => JSON.parse(String(call[0])).type);
    expect(frameTypes.slice(-2)).toEqual(["sync", "ping"]);
    connection.close();
  });

  it("recovers the seat snapshot and replaces a half-dead socket after a pong timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      roomId: "room-42", version: 4, updatedAt: "now", state: {}
    })));
    vi.stubGlobal("fetch", fetchMock);
    const onSnapshot = vi.fn();
    const onDropped = vi.fn();
    const connection = connectRoom("room-42", { onSnapshot, onStatus: vi.fn(), onDropped }, "client-abc");
    const socket = partySocketMock.instances.at(-1)!;
    socket.emit("open");
    await vi.advanceTimersByTimeAsync(40_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onDropped).toHaveBeenCalledTimes(1);
    expect(socket.reconnect).toHaveBeenCalledWith(4000, "health timeout");
    expect(onSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ version: 4 }),
      { source: "http-recovery", seatAuthoritative: true }
    );

    // A close/error pair from the same failed transport is one logical drop.
    socket.emit("close");
    socket.emit("error");
    expect(onDropped).toHaveBeenCalledTimes(1);
    // The watchdog already performed recovery, so the replacement socket's
    // open event must not issue a duplicate HTTP snapshot request.
    socket.emit("open");
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    connection.close();
  });
});

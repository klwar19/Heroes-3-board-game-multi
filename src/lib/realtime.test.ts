// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACTION_PROCESSING_TIMEOUT_MS,
  ACTION_RECEIPT_PROBE_MS,
  ACTION_RECEIPT_TIMEOUT_MS,
  connectRoom,
  MAX_ACTION_RESENDS,
  requestCloseRoom,
  SEAT_REHEAL_COOLDOWN_MS,
  shouldReconnectForSeatRejection
} from "./realtime";
import { VERIFIED_SEAT_REJECTION_MESSAGE } from "@/engine";

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

/**
 * Self-heal a lapsed verified identity. Over a long hosted session the edge can
 * lose our verified identity (Cloudflare hibernation wipes its token cache AND
 * the 10-minute socket ticket has expired), degrading a signed-in actor to a
 * guest and rejecting every seat action with VERIFIED_SEAT_REJECTION_MESSAGE.
 * The transport reconnects (re-running the async query → a fresh ticket) instead
 * of forcing the player to refresh — bounded so a genuine refusal can't spin.
 */
describe("seat-rejection self-heal decision (pure)", () => {
  it("matches only the seat-identity rejection, and respects the cooldown", () => {
    const seatErr = [{ message: VERIFIED_SEAT_REJECTION_MESSAGE }];
    // Fires when past the cooldown since the last heal.
    expect(shouldReconnectForSeatRejection(seatErr, 0, 100_000)).toBe(true);
    // Suppressed while still within the cooldown of the last heal.
    expect(shouldReconnectForSeatRejection(seatErr, 100_000, 100_000 + 1_000)).toBe(false);
    // Fires again exactly at the cooldown boundary.
    expect(shouldReconnectForSeatRejection(seatErr, 100_000, 100_000 + SEAT_REHEAL_COOLDOWN_MS)).toBe(true);
    // An ordinary rules error is never a re-auth trigger.
    expect(shouldReconnectForSeatRejection([{ message: "You don't have enough gold." }], 0, 100_000)).toBe(false);
    // No errors → nothing to heal.
    expect(shouldReconnectForSeatRejection([], 0, 100_000)).toBe(false);
  });
});

describe("connectRoom — PartyKit self-heals a lapsed verified seat", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    partySocketMock.instances.length = 0;
    process.env.NEXT_PUBLIC_PARTYKIT_HOST = "rooms.example.partykit.dev";
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ roomId: "room-42", version: 9, updatedAt: "now", state: {} })
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.NEXT_PUBLIC_PARTYKIT_HOST;
    vi.restoreAllMocks();
  });

  const rejectOnce = async (
    connection: ReturnType<typeof connectRoom>,
    socket: (typeof partySocketMock.instances)[number],
    message: string
  ) => {
    const resultPromise = connection.submitAction({ type: "END_TURN", playerId: "p1" } as never);
    const frame = JSON.parse(String(socket.send.mock.calls.at(-1)![0])) as { requestId: string };
    socket.emit("message", {
      data: JSON.stringify({
        type: "action-result",
        requestId: frame.requestId,
        version: 9,
        errors: [{ code: "ACTION_NOT_LEGAL", message }]
      })
    });
    await resultPromise;
  };

  it("reconnects EXACTLY once (per cooldown) on the seat-identity rejection", async () => {
    const connection = connectRoom(
      "room-42",
      { onSnapshot: vi.fn(), onStatus: vi.fn() },
      "client-abc",
      async () => "player-ticket"
    );
    const socket = partySocketMock.instances.at(-1)!;
    socket.emit("open");

    await rejectOnce(connection, socket, VERIFIED_SEAT_REJECTION_MESSAGE);
    expect(socket.reconnect).toHaveBeenCalledTimes(1);
    expect(socket.reconnect).toHaveBeenCalledWith(4000, "seat re-auth");

    // A second rejection within the cooldown must NOT spin the socket.
    await rejectOnce(connection, socket, VERIFIED_SEAT_REJECTION_MESSAGE);
    expect(socket.reconnect).toHaveBeenCalledTimes(1);
    connection.close();
  });

  it("CONTROL: an ordinary rules rejection never reconnects", async () => {
    const connection = connectRoom(
      "room-42",
      { onSnapshot: vi.fn(), onStatus: vi.fn() },
      "client-abc",
      async () => "player-ticket"
    );
    const socket = partySocketMock.instances.at(-1)!;
    socket.emit("open");
    await rejectOnce(connection, socket, "You don't have enough gold.");
    expect(socket.reconnect).not.toHaveBeenCalled();
    connection.close();
  });

  it("CONTROL: a guest (no token provider) never reconnects — a reconnect can't mint a ticket it lacks", async () => {
    const connection = connectRoom("room-42", { onSnapshot: vi.fn(), onStatus: vi.fn() }, "client-abc");
    const socket = partySocketMock.instances.at(-1)!;
    socket.emit("open");
    await rejectOnce(connection, socket, VERIFIED_SEAT_REJECTION_MESSAGE);
    expect(socket.reconnect).not.toHaveBeenCalled();
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

  it("keeps a received late-game action pending beyond the short no-response deadline", async () => {
    vi.useFakeTimers();
    const connection = connectRoom("room-42", { onSnapshot: vi.fn(), onStatus: vi.fn() }, "client-abc");
    const socket = partySocketMock.instances.at(-1)!;
    socket.emit("open");

    const resultPromise = connection.submitAction({ type: "END_TURN", playerId: "p1" } as never);
    const actionFrame = JSON.parse(String(socket.send.mock.calls.at(-1)![0])) as { requestId: string };
    let settled = false;
    void resultPromise.finally(() => {
      settled = true;
    });

    vi.advanceTimersByTime(ACTION_RECEIPT_TIMEOUT_MS - 1);
    socket.emit("message", {
      data: JSON.stringify({ type: "action-received", requestId: actionFrame.requestId })
    });
    vi.advanceTimersByTime(ACTION_RECEIPT_TIMEOUT_MS + 1);
    await Promise.resolve();
    expect(settled).toBe(false);

    socket.emit("message", {
      data: JSON.stringify({
        type: "action-result",
        requestId: actionFrame.requestId,
        version: 2,
        errors: []
      })
    });
    await expect(resultPromise).resolves.toMatchObject({ version: 2, errors: [] });
    connection.close();
  });

  it("still fails a received action if processing itself exceeds the extended deadline", async () => {
    vi.useFakeTimers();
    const connection = connectRoom("room-42", { onSnapshot: vi.fn(), onStatus: vi.fn() }, "client-abc");
    const socket = partySocketMock.instances.at(-1)!;
    socket.emit("open");

    const resultPromise = connection.submitAction({ type: "END_TURN", playerId: "p1" } as never);
    const actionFrame = JSON.parse(String(socket.send.mock.calls.at(-1)![0])) as { requestId: string };
    socket.emit("message", {
      data: JSON.stringify({ type: "action-received", requestId: actionFrame.requestId })
    });
    const rejection = expect(resultPromise).rejects.toThrow(/received the action but could not finish/i);
    // Keep the independent socket-health watchdog satisfied so this assertion
    // isolates the action-processing deadline.
    await vi.advanceTimersByTimeAsync(35_000);
    socket.emit("message", { data: JSON.stringify({ type: "pong", version: 0 }) });
    await vi.advanceTimersByTimeAsync(ACTION_PROCESSING_TIMEOUT_MS - 35_000);
    await rejection;
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

  it("delivers RTT quality samples on pong and on action ack (metrics sampling stays off)", async () => {
    vi.useFakeTimers();
    const onQuality = vi.fn();
    const connection = connectRoom("room-42", { onSnapshot: vi.fn(), onStatus: vi.fn(), onQuality }, "client-abc");
    const socket = partySocketMock.instances.at(-1)!;
    socket.emit("open");

    // Health ping → pong: the sample carries the measured round-trip.
    vi.advanceTimersByTime(35_000);
    vi.advanceTimersByTime(120); // network delay before the pong lands
    socket.emit("message", { data: JSON.stringify({ type: "pong", version: 0 }) });
    expect(onQuality).toHaveBeenCalledTimes(1);
    expect(onQuality.mock.calls[0][0]).toMatchObject({ rttMs: 120 });

    // Action submit → ack: the felt-latency sample of active play.
    const resultPromise = connection.submitAction({ type: "END_TURN", playerId: "p1" } as never);
    const actionFrame = JSON.parse(String(socket.send.mock.calls.at(-1)![0])) as { requestId: string };
    vi.advanceTimersByTime(80);
    socket.emit("message", {
      data: JSON.stringify({ type: "action-result", requestId: actionFrame.requestId, version: 1, errors: [] })
    });
    await expect(resultPromise).resolves.toMatchObject({ version: 1 });
    expect(onQuality).toHaveBeenCalledTimes(2);
    const ackSample = onQuality.mock.calls[1][0] as { rttMs?: number };
    expect(ackSample.rttMs).toBeGreaterThanOrEqual(80);
    connection.close();
  });

  it("survives pong and ack without an onQuality handler (optional callback)", async () => {
    vi.useFakeTimers();
    const connection = connectRoom("room-42", { onSnapshot: vi.fn(), onStatus: vi.fn() }, "client-abc");
    const socket = partySocketMock.instances.at(-1)!;
    socket.emit("open");
    vi.advanceTimersByTime(35_000);
    socket.emit("message", { data: JSON.stringify({ type: "pong", version: 0 }) });
    const resultPromise = connection.submitAction({ type: "END_TURN", playerId: "p1" } as never);
    const actionFrame = JSON.parse(String(socket.send.mock.calls.at(-1)![0])) as { requestId: string };
    socket.emit("message", {
      data: JSON.stringify({ type: "action-result", requestId: actionFrame.requestId, version: 1, errors: [] })
    });
    await expect(resultPromise).resolves.toMatchObject({ version: 1 });
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

/**
 * Action-level self-healing: "The room did not answer in time" used to be the
 * END of a submit — one send, 15 s of passive waiting, then a user-visible
 * error, even though the frame (or the socket under it) was simply lost. On a
 * receipt-capable server (which proves the requestId dedupe ledger — the
 * ledger shipped BEFORE the receipt), the transport now probes a silent
 * submit, replaces the suspect socket, and re-sends the SAME frame; the server
 * answers a repeat from the ledger, so a re-send can never double-apply. The
 * 15 s receipt / 60 s processing deadlines are UNCHANGED — recovery only works
 * inside them.
 */
describe("connectRoom — PartyKit action receipt probe & dedupe-safe re-send", () => {
  beforeEach(() => {
    partySocketMock.instances.length = 0;
    process.env.NEXT_PUBLIC_PARTYKIT_HOST = "rooms.example.partykit.dev";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ roomId: "room-42", version: 5, updatedAt: "now", state: {} })))
    );
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_PARTYKIT_HOST;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  type Socket = (typeof partySocketMock.instances)[number];

  /** Prove the room server acks actions (submit → receipt → result). */
  const primeReceiptLatch = async (connection: ReturnType<typeof connectRoom>, socket: Socket) => {
    const first = connection.submitAction({ type: "END_TURN", playerId: "p1" } as never);
    const frame = JSON.parse(String(socket.send.mock.calls.at(-1)![0])) as { requestId: string };
    socket.emit("message", { data: JSON.stringify({ type: "action-received", requestId: frame.requestId }) });
    socket.emit("message", {
      data: JSON.stringify({ type: "action-result", requestId: frame.requestId, version: 2, errors: [] })
    });
    await first;
  };

  const framesMatching = (socket: Socket, raw: string) =>
    socket.send.mock.calls.filter((call) => String(call[0]) === raw);

  it("probes a silent submit, replaces the socket, and re-sends the SAME frame on reopen", async () => {
    vi.useFakeTimers();
    const onDropped = vi.fn();
    const connection = connectRoom("room-42", { onSnapshot: vi.fn(), onStatus: vi.fn(), onDropped }, "client-abc");
    const socket = partySocketMock.instances.at(-1)!;
    socket.emit("open");
    await primeReceiptLatch(connection, socket);

    const resultPromise = connection.submitAction({ type: "END_TURN", playerId: "p1" } as never);
    const rawFrame = String(socket.send.mock.calls.at(-1)![0]);
    const frame = JSON.parse(rawFrame) as { requestId: string };

    // A few silent seconds: the probe treats the socket as suspect and runs
    // the same recovery the pong-timeout watchdog does.
    await vi.advanceTimersByTimeAsync(ACTION_RECEIPT_PROBE_MS);
    expect(socket.reconnect).toHaveBeenCalledWith(4000, "action receipt timeout");
    expect(onDropped).toHaveBeenCalledTimes(1);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);

    // The replacement socket opens → the SAME frame (same requestId) goes out
    // again, so the server's dedupe ledger governs the repeat.
    socket.emit("open");
    expect(framesMatching(socket, rawFrame)).toHaveLength(2);

    // Receipt + result over the fresh socket settle the ORIGINAL promise.
    socket.emit("message", { data: JSON.stringify({ type: "action-received", requestId: frame.requestId }) });
    socket.emit("message", {
      data: JSON.stringify({ type: "action-result", requestId: frame.requestId, version: 3, errors: [] })
    });
    await expect(resultPromise).resolves.toMatchObject({ version: 3, errors: [] });
    connection.close();
  });

  it("CONTROL: an old room server (no receipt ever seen) keeps the plain single-send 15 s behaviour", async () => {
    vi.useFakeTimers();
    const connection = connectRoom("room-42", { onSnapshot: vi.fn(), onStatus: vi.fn() }, "client-abc");
    const socket = partySocketMock.instances.at(-1)!;
    socket.emit("open");

    const resultPromise = connection.submitAction({ type: "END_TURN", playerId: "p1" } as never);
    const rawFrame = String(socket.send.mock.calls.at(-1)![0]);
    const rejection = expect(resultPromise).rejects.toThrow(/did not answer in time/i);

    await vi.advanceTimersByTimeAsync(ACTION_RECEIPT_TIMEOUT_MS - 1);
    // No probe, no reconnect, no duplicate frame — an old server has no dedupe
    // ledger, so a repeat could double-apply.
    expect(socket.reconnect).not.toHaveBeenCalled();
    expect(framesMatching(socket, rawFrame)).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(2);
    await rejection;
    connection.close();
  });

  it("a socket flap re-sends the pending frame on reopen and the ledger's answer settles it", async () => {
    const connection = connectRoom("room-42", { onSnapshot: vi.fn(), onStatus: vi.fn() }, "client-abc");
    const socket = partySocketMock.instances.at(-1)!;
    socket.emit("open");
    await primeReceiptLatch(connection, socket);

    const resultPromise = connection.submitAction({ type: "END_TURN", playerId: "p1" } as never);
    const rawFrame = String(socket.send.mock.calls.at(-1)![0]);
    const frame = JSON.parse(rawFrame) as { requestId: string };

    // The transport flaps: the frame handed to the dying socket is lost, and
    // the reopened socket re-sends it without waiting for any timer.
    socket.emit("close");
    socket.emit("open");
    expect(framesMatching(socket, rawFrame)).toHaveLength(2);

    // The server (having already applied the first copy) answers the repeat
    // from its ledger — the original promise settles with that outcome.
    socket.emit("message", {
      data: JSON.stringify({ type: "action-result", requestId: frame.requestId, version: 7, errors: [] })
    });
    await expect(resultPromise).resolves.toMatchObject({ version: 7, errors: [] });
    connection.close();
  });

  it("caps re-sends per request, so a flapping socket cannot spam the same frame", async () => {
    const connection = connectRoom("room-42", { onSnapshot: vi.fn(), onStatus: vi.fn() }, "client-abc");
    const socket = partySocketMock.instances.at(-1)!;
    socket.emit("open");
    await primeReceiptLatch(connection, socket);

    const resultPromise = connection.submitAction({ type: "END_TURN", playerId: "p1" } as never);
    const rawFrame = String(socket.send.mock.calls.at(-1)![0]);
    const frame = JSON.parse(rawFrame) as { requestId: string };

    for (let flap = 0; flap < MAX_ACTION_RESENDS + 2; flap += 1) {
      socket.emit("close");
      socket.emit("open");
    }
    expect(framesMatching(socket, rawFrame)).toHaveLength(1 + MAX_ACTION_RESENDS);

    socket.emit("message", {
      data: JSON.stringify({ type: "action-result", requestId: frame.requestId, version: 4, errors: [] })
    });
    await expect(resultPromise).resolves.toMatchObject({ version: 4 });
    connection.close();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectRoom, requestCloseRoom } from "./realtime";

const partySocketMock = vi.hoisted(() => ({
  instances: [] as { close: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn>; options: unknown }[]
}));

vi.mock("partysocket", () => {
  class FakePartySocket {
    close = vi.fn();
    send = vi.fn();
    options: unknown;

    constructor(options: unknown) {
      this.options = options;
      partySocketMock.instances.push(this);
    }

    addEventListener() {}
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

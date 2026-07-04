import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestCloseRoom } from "./realtime";

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

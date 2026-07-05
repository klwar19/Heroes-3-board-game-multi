import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The SAME-ORIGIN admin room delete forwards to the PartyKit edge with the app's
 * own server-held credentials — the reliable replacement for the cross-origin
 * browser → edge socket-ticket close that kept refusing admins with "Only
 * members of this room can close it". The app has already verified the admin
 * from the cookie before calling this; here we only prove it carries BOTH
 * credentials the edge accepts (a minted ticket AND HOMM3BG_ADMIN_KEY) to the
 * right edge URL, so at least one works on any deployment.
 */
vi.mock("./accounts/account-store-instance", () => ({
  getAccountBackend: () => ({
    mintSocketTicket: (session: string | null) => (session ? "ticket-for-admin" : null)
  })
}));

const PRIOR_HOST = process.env.NEXT_PUBLIC_PARTYKIT_HOST;
const PRIOR_KEY = process.env.HOMM3BG_ADMIN_KEY;

beforeEach(() => {
  process.env.NEXT_PUBLIC_PARTYKIT_HOST = "heroes3bg-rooms.example.partykit.dev";
});

afterEach(() => {
  // Restore the exact vars this file mutates (never a whole-object reassignment,
  // which can leak the fake host into sibling test files sharing the worker and
  // make their real DELETE route attempt a live fetch → a hang).
  if (PRIOR_HOST === undefined) delete process.env.NEXT_PUBLIC_PARTYKIT_HOST;
  else process.env.NEXT_PUBLIC_PARTYKIT_HOST = PRIOR_HOST;
  if (PRIOR_KEY === undefined) delete process.env.HOMM3BG_ADMIN_KEY;
  else process.env.HOMM3BG_ADMIN_KEY = PRIOR_KEY;
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("closeEdgeRoomAsAdmin", () => {
  it("DELETEs the edge room with a minted ticket AND the admin key", async () => {
    process.env.HOMM3BG_ADMIN_KEY = "break-glass-secret";
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => ({ closed: true })
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { closeEdgeRoomAsAdmin } = await import("./edge-close");
    const result = await closeEdgeRoomAsAdmin("room-4psxet", "admin-session");

    expect(result).toEqual({ forwarded: true, closed: true, reason: undefined });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/parties/main/room-4psxet");
    // The ticket rides on the URL (edge reads ?token=), the key in the body.
    expect(url).toContain("token=ticket-for-admin");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(init.body as string)).toEqual({ adminKey: "break-glass-secret" });
  });

  it("still forwards (ticket only) when no admin key is configured — the Supabase zero-config path", async () => {
    delete process.env.HOMM3BG_ADMIN_KEY;
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => ({ closed: true })
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { closeEdgeRoomAsAdmin } = await import("./edge-close");
    const result = await closeEdgeRoomAsAdmin("room-9", "admin-session");

    expect(result.closed).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("token=ticket-for-admin");
    expect(JSON.parse(init.body as string)).toEqual({});
  });

  it("surfaces the edge's refusal reason instead of a silent success", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: false,
      json: async () => ({ closed: false, reason: "Only members of this room can close it." })
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { closeEdgeRoomAsAdmin } = await import("./edge-close");
    const result = await closeEdgeRoomAsAdmin("room-9", "admin-session");
    expect(result).toEqual({ forwarded: true, closed: false, reason: "Only members of this room can close it." });
  });

  it("reports forwarded:false when no edge is configured (built-in store path)", async () => {
    delete process.env.NEXT_PUBLIC_PARTYKIT_HOST;
    const { closeEdgeRoomAsAdmin, partyKitConfigured } = await import("./edge-close");
    expect(partyKitConfigured()).toBe(false);
    expect(await closeEdgeRoomAsAdmin("room-9", "admin-session")).toEqual({ forwarded: false, closed: false });
  });
});

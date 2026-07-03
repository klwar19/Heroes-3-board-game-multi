import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { httpTokenVerifier, memoizeVerifier, type VerifiedIdentity } from "./verified-actor";

// ---------------------------------------------------------------------------
// The verified-actor seam the PartyKit edge uses to bind a signed-in player to
// their seat (Phase 2). The party can't read the app's httpOnly cookie
// cross-origin, so it resolves the socket's raw token via a callback to
// /api/auth/verify-token. The resolution logic is isomorphic and tested here
// with (a) an injected fake fetch and (b) the REAL verify-token route + account
// store, so it is proven end-to-end offline.
// ---------------------------------------------------------------------------

const ACCOUNT_DIR = mkdtempSync(join(tmpdir(), "homm3bg-verify-actor-"));
process.env.HOMM3BG_ACCOUNT_DIR = ACCOUNT_DIR;
process.env.HOMM3BG_MAIL_TRANSPORT = "capture";

function resetStore() {
  (globalThis as Record<string, unknown>).__homm3bgAccountStore = undefined;
  (globalThis as Record<string, unknown>).__homm3bgIpRate = undefined;
  rmSync(join(ACCOUNT_DIR, "accounts.json"), { force: true });
}

beforeEach(resetStore);
afterEach(resetStore);

type FakeResponse = { ok: boolean; json: () => Promise<unknown> };
function fakeFetch(response: FakeResponse | (() => Promise<never>)) {
  const calls: string[] = [];
  const impl = async (input: string) => {
    calls.push(input);
    if (typeof response === "function") {
      return response();
    }
    return response;
  };
  return { impl, calls };
}

describe("httpTokenVerifier", () => {
  it("resolves a valid token to its verified identity", async () => {
    const { impl, calls } = fakeFetch({ ok: true, json: async () => ({ userId: "u1", nickname: "Gelu" }) });
    const verify = httpTokenVerifier("https://app.example/", impl);
    expect(await verify("tok")).toEqual({ userId: "u1", nickname: "Gelu" });
    // Trailing slash trimmed, endpoint path appended.
    expect(calls[0]).toBe("https://app.example/api/auth/verify-token");
  });

  it("degrades to null (guest) on every failure mode — never throws, never grants", async () => {
    const empty = httpTokenVerifier("https://app.example", fakeFetch({ ok: true, json: async () => ({}) }).impl);
    // No token at all → null without a call.
    expect(await empty(undefined)).toBeNull();
    expect(await empty("")).toBeNull();

    // A non-2xx (bad/expired token) → null.
    const rejected = httpTokenVerifier("https://app.example", fakeFetch({ ok: false, json: async () => ({}) }).impl);
    expect(await rejected("tok")).toBeNull();

    // A 200 with { userId: null } (the route's guest shape) → null.
    const guestShape = httpTokenVerifier("https://app.example", fakeFetch({ ok: true, json: async () => ({ userId: null }) }).impl);
    expect(await guestShape("tok")).toBeNull();

    // A thrown network error → null, not a rejection.
    const thrown = httpTokenVerifier("https://app.example", fakeFetch(async () => {
      throw new Error("network down");
    }).impl);
    expect(await thrown("tok")).toBeNull();
  });
});

describe("memoizeVerifier", () => {
  it("caches a positive result but re-checks a negative one", async () => {
    let hits = 0;
    const identity: VerifiedIdentity = { userId: "u1", nickname: "Gelu" };
    const base = async (token: string | undefined | null) => {
      hits += 1;
      return token === "good" ? identity : null;
    };
    const verify = memoizeVerifier(base);

    expect(await verify("good")).toEqual(identity);
    expect(await verify("good")).toEqual(identity);
    expect(hits).toBe(1); // second call served from cache

    // A negative result is NOT cached — a token that later becomes valid must work.
    expect(await verify("bad")).toBeNull();
    expect(await verify("bad")).toBeNull();
    expect(hits).toBe(3);
  });

  it("stays bounded, evicting the oldest positive entry", async () => {
    let hits = 0;
    const base = async (token: string | undefined | null) => {
      hits += 1;
      return { userId: String(token), nickname: String(token) };
    };
    const verify = memoizeVerifier(base, 2);
    await verify("a");
    await verify("b");
    await verify("c"); // evicts "a"
    hits = 0;
    await verify("b"); // still cached
    await verify("c"); // still cached
    expect(hits).toBe(0);
    await verify("a"); // was evicted → re-verified
    expect(hits).toBe(1);
  });
});

describe("end-to-end through the real /api/auth/verify-token route", () => {
  it("resolves a genuine session token and rejects a bogus one", async () => {
    const route = await import("@/app/api/auth/verify-token/route");
    const { getAccountStore } = await import("@/server/accounts/account-store-instance");
    const store = getAccountStore();
    const profile = store.ensureAdminAccount({ nickname: "Kilgor", email: "kilgor@erathia.io", password: "barbarian9" });
    store.setRole(profile.id, "player");
    const { token } = store.login({ identifier: "Kilgor", password: "barbarian9" });

    // A fetch shim that routes the party's callback straight into the real route
    // handler — proving the resolver and the endpoint agree end-to-end.
    const routeFetch = async (_input: string, init?: { body?: string }) => {
      const request = new Request("http://x/api/auth/verify-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: init?.body ?? "{}"
      });
      const response = await route.POST(request);
      return { ok: response.ok, json: () => response.json() };
    };

    const verify = httpTokenVerifier("http://x", routeFetch);
    expect(await verify(token)).toEqual({ userId: profile.id, nickname: "Kilgor" });
    // A forged/unknown token resolves to guest (null), never a seat.
    expect(await verify("not-a-real-token")).toBeNull();
  });

  it("resolves a short-lived socket TICKET the same way (the PartyKit edge path)", async () => {
    const verifyRoute = await import("@/app/api/auth/verify-token/route");
    const socketRoute = await import("@/app/api/auth/socket-token/route");
    const { getAccountStore } = await import("@/server/accounts/account-store-instance");
    const store = getAccountStore();
    const profile = store.ensureAdminAccount({ nickname: "Tarnum", email: "tarnum@erathia.io", password: "wanderer3" });
    store.setRole(profile.id, "player");
    const { token: sessionToken } = store.login({ identifier: "Tarnum", password: "wanderer3" });

    // The browser mints a socket ticket same-origin (session cookie present).
    const socketRes = await socketRoute.GET(
      new Request("http://x/api/auth/socket-token", { headers: { cookie: `homm3bg_session=${sessionToken}` } })
    );
    const ticket = (await socketRes.json()).token as string;
    expect(ticket).toBeTruthy();
    // The ticket is NOT the session token — the long-lived credential stays secret.
    expect(ticket).not.toBe(sessionToken);

    // The party verifies the ticket via the callback → the same verified identity.
    const routeFetch = async (_input: string, init?: { body?: string }) => {
      const response = await verifyRoute.POST(
        new Request("http://x/api/auth/verify-token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: init?.body ?? "{}"
        })
      );
      return { ok: response.ok, json: () => response.json() };
    };
    const verify = httpTokenVerifier("http://x", routeFetch);
    expect(await verify(ticket)).toEqual({ userId: profile.id, nickname: "Tarnum" });
  });
});

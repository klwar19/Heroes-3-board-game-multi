import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Lobby chat always uses the app's same-origin route. That route selects the
 * durable PartyKit board server-side when configured, avoiding a browser CORS
 * dependency while preserving one shared feed.
 */

const PARTY_HOST = "heroes3bg-rooms.example.partykit.dev";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

function stubFetch(payload: unknown) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", (url: string) => {
    calls.push(String(url));
    return Promise.resolve({ ok: true, json: () => Promise.resolve(payload) } as Response);
  });
  return calls;
}

describe("lobby-chat client transport routing", () => {
  it("GET stays same-origin when a PartyKit host is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_PARTYKIT_HOST", PARTY_HOST);
    const calls = stubFetch({ messages: [] });
    const { fetchLobbyChat } = await import("./lobby-chat-client");

    await fetchLobbyChat();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe("/api/lobby-chat");
  });

  it("POST stays same-origin when a PartyKit host is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_PARTYKIT_HOST", PARTY_HOST);
    const calls = stubFetch({ message: { seq: 1, clientId: "c1", name: "Ada", text: "hi", at: 0 } });
    const { postLobbyChat } = await import("./lobby-chat-client");

    await postLobbyChat({ clientId: "c1", name: "Ada", text: "hi" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe("/api/lobby-chat");
  });

  it("CONTROL: falls back to the Next /api route when no host is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_PARTYKIT_HOST", "");
    const calls = stubFetch({ messages: [] });
    const { fetchLobbyChat } = await import("./lobby-chat-client");

    await fetchLobbyChat();
    expect(calls).toEqual(["/api/lobby-chat"]);
  });
});

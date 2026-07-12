import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The lobby-chat client must route to the durable PartyKit lobby-chat object
 * when a PartyKit host is configured (the Vercel-edge deployment), NOT the Next
 * `/api/lobby-chat` serverless route whose in-memory board is empty on a cold
 * invocation — the "lobby chat shows no message" bug. With no host it falls back
 * to the Next route (the single-server built-in backend).
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
  it("GETs the PartyKit lobby-chat object when a host is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_PARTYKIT_HOST", PARTY_HOST);
    const calls = stubFetch({ messages: [] });
    const { fetchLobbyChat } = await import("./lobby-chat-client");

    await fetchLobbyChat();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(`https://${PARTY_HOST}/parties/lobby-chat/directory`);
  });

  it("POSTs to the PartyKit lobby-chat object when a host is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_PARTYKIT_HOST", PARTY_HOST);
    const calls = stubFetch({ message: { seq: 1, clientId: "c1", name: "Ada", text: "hi", at: 0 } });
    const { postLobbyChat } = await import("./lobby-chat-client");

    await postLobbyChat({ clientId: "c1", name: "Ada", text: "hi" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(`https://${PARTY_HOST}/parties/lobby-chat/directory`);
  });

  it("CONTROL: falls back to the Next /api route when no host is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_PARTYKIT_HOST", "");
    const calls = stubFetch({ messages: [] });
    const { fetchLobbyChat } = await import("./lobby-chat-client");

    await fetchLobbyChat();
    expect(calls).toEqual(["/api/lobby-chat"]);
  });
});

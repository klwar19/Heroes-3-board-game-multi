import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import type { LobbyChatMessage } from "@/server/lobby-chat";

/** Reset the process-wide lobby-chat singleton so each test starts empty. */
function resetBoard() {
  (globalThis as Record<string, unknown>).__homm3bgLobbyChat = undefined;
}

beforeEach(() => {
  resetBoard();
  delete process.env.NEXT_PUBLIC_PARTYKIT_HOST;
});
afterEach(() => {
  resetBoard();
  delete process.env.NEXT_PUBLIC_PARTYKIT_HOST;
  vi.unstubAllGlobals();
});

function postRequest(body: unknown): Request {
  return new Request("http://x/api/lobby-chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("/api/lobby-chat route", () => {
  it("POST stores a line and GET returns it", async () => {
    const posted = await POST(postRequest({ clientId: "c1", name: "Alice", text: "hi lobby" }));
    expect(posted.status).toBe(200);
    const postedBody = (await posted.json()) as { message: LobbyChatMessage };
    expect(postedBody.message.text).toBe("hi lobby");
    expect(postedBody.message.name).toBe("Alice");

    const listed = await GET();
    const listedBody = (await listed.json()) as { messages: LobbyChatMessage[] };
    expect(listedBody.messages.map((m) => m.text)).toEqual(["hi lobby"]);
  });

  it("POST rejects an empty message with 400 (control: a real one is 200)", async () => {
    const empty = await POST(postRequest({ clientId: "c1", name: "Alice", text: "   " }));
    expect(empty.status).toBe(400);
    expect((await empty.json()).error).toMatch(/message/i);

    const ok = await POST(postRequest({ clientId: "c1", name: "Alice", text: "real" }));
    expect(ok.status).toBe(200);
  });

  it("relays GET and POST to PartyKit server-side when the edge host is configured", async () => {
    process.env.NEXT_PUBLIC_PARTYKIT_HOST = "https://rooms.example.partykit.dev/ignored-path";
    const edgeFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) =>
      Response.json(
        init?.method === "POST"
          ? { message: { seq: 1, clientId: "c1", name: "Alice", text: "edge", at: 1 } }
          : { messages: [] }
      )
    );
    vi.stubGlobal("fetch", edgeFetch);

    expect((await GET()).status).toBe(200);
    expect((await POST(postRequest({ clientId: "c1", name: "Alice", text: "edge" }))).status).toBe(200);
    expect(edgeFetch).toHaveBeenCalledTimes(2);
    expect(String(edgeFetch.mock.calls[0][0])).toBe(
      "https://rooms.example.partykit.dev/parties/lobbychat/directory"
    );
    expect(edgeFetch.mock.calls[1][1]?.method).toBe("POST");
  });

  it("returns a useful 503 instead of leaking a network failure to the browser", async () => {
    process.env.NEXT_PUBLIC_PARTYKIT_HOST = "rooms.example.partykit.dev";
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network down"); }));

    const response = await POST(postRequest({ clientId: "c1", name: "Alice", text: "hi" }));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/unreachable/i);
  });
});

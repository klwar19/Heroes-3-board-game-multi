import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "./route";
import type { LobbyChatMessage } from "@/server/lobby-chat";

/** Reset the process-wide lobby-chat singleton so each test starts empty. */
function resetBoard() {
  (globalThis as Record<string, unknown>).__homm3bgLobbyChat = undefined;
}

beforeEach(resetBoard);
afterEach(resetBoard);

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
});

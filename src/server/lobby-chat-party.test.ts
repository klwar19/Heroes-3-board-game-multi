import { describe, expect, it } from "vitest";
import LobbyChatServer from "../../party/lobby-chat";
import type { LobbyChatMessage } from "./lobby-chat";

/**
 * Exercises the lobby-chat Durable Object's HTTP surface (party/lobby-chat.ts)
 * — the durable feed that replaces the Next `/api/lobby-chat` in-memory board on
 * the PartyKit edge (where a serverless route's process global is empty on a
 * cold invocation, so a posted line vanishes before the next poll — the bug this
 * object fixes). PartyKit's runtime types are `import type`-only, so the class
 * runs under plain vitest; only its `LobbyChatBoard` + storage shell execute.
 */

type RoomCtor = ConstructorParameters<typeof LobbyChatServer>[0];
type ChatRequest = Parameters<LobbyChatServer["onRequest"]>[0];

/** A Map-backed stand-in for Durable Object storage (structured-clone on write). */
function makeFakeRoom(id = "directory") {
  const store = new Map<string, unknown>();
  const room = {
    id,
    storage: {
      async get<T>(key: string): Promise<T | undefined> {
        return store.has(key) ? (structuredClone(store.get(key)) as T) : undefined;
      },
      async put(key: string, value: unknown): Promise<void> {
        store.set(key, structuredClone(value));
      },
      async delete(key: string): Promise<boolean> {
        return store.delete(key);
      }
    }
  };
  return { room: room as unknown as RoomCtor, store };
}

function chatRequest(method: string, body?: unknown): ChatRequest {
  const url = new URL("https://heroes3bg-rooms.partykit.dev/parties/lobby-chat/directory");
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(url, init) as unknown as ChatRequest;
}

async function listVia(server: LobbyChatServer): Promise<LobbyChatMessage[]> {
  const response = await server.onRequest(chatRequest("GET"));
  expect(response.status).toBe(200);
  const data = (await response.json()) as { messages: LobbyChatMessage[] };
  return data.messages;
}

describe("lobby-chat Durable Object (party/lobby-chat.ts)", () => {
  it("stores a posted line and serves it back from GET (the vanishing-message fix)", async () => {
    const { room } = makeFakeRoom();
    const server = new LobbyChatServer(room);
    await server.onStart();

    // Before the fix, an in-memory serverless board would answer this GET empty.
    expect(await listVia(server)).toHaveLength(0);

    const post = await server.onRequest(chatRequest("POST", { clientId: "c1", name: "Ada", text: "hello lobby" }));
    expect(post.status).toBe(200);
    const posted = (await post.json()) as { message: LobbyChatMessage };
    expect(posted.message.text).toBe("hello lobby");

    const messages = await listVia(server);
    expect(messages).toHaveLength(1);
    expect(messages[0].name).toBe("Ada");
    expect(messages[0].text).toBe("hello lobby");
  });

  it("survives hibernation: a new instance reloads the feed from storage", async () => {
    const { room, store } = makeFakeRoom();
    const first = new LobbyChatServer(room);
    await first.onStart();
    await first.onRequest(chatRequest("POST", { clientId: "c1", name: "Ada", text: "persist me" }));

    // A second instance over the SAME storage (as after a Durable Object wakes).
    const second = new LobbyChatServer({ id: room.id, storage: room.storage } as unknown as RoomCtor);
    await second.onStart();
    const messages = await listVia(second);
    expect(messages.map((m) => m.text)).toEqual(["persist me"]);
    expect(store.has("messages")).toBe(true);

    // A new line after reload keeps a strictly increasing seq (no collision with
    // the restored history).
    await second.onRequest(chatRequest("POST", { clientId: "c2", name: "Bo", text: "second" }));
    const after = await listVia(second);
    expect(after.map((m) => m.text)).toEqual(["persist me", "second"]);
    expect(after[1].seq).toBeGreaterThan(after[0].seq);
  });

  it("returns a 400 with the reason on an invalid post (empty text)", async () => {
    const { room } = makeFakeRoom();
    const server = new LobbyChatServer(room);
    await server.onStart();

    const response = await server.onRequest(chatRequest("POST", { clientId: "c1", name: "Ada", text: "   " }));
    expect(response.status).toBe(400);
    expect((await response.json()) as { error: string }).toHaveProperty("error");
    expect(await listVia(server)).toHaveLength(0);
  });

  it("answers the CORS preflight and rejects unknown methods", async () => {
    const { room } = makeFakeRoom();
    const server = new LobbyChatServer(room);
    await server.onStart();

    const preflight = await server.onRequest(chatRequest("OPTIONS"));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe("*");

    const bad = await server.onRequest(chatRequest("PUT", {}));
    expect(bad.status).toBe(405);
  });
});

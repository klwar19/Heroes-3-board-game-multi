import type * as Party from "partykit/server";
import { LobbyChatBoard, LobbyChatError, type LobbyChatMessage } from "@/server/lobby-chat";

/**
 * The lobby-chat Durable Object — the edge backend's answer to the built-in
 * store's in-memory `LobbyChatBoard` (served over `/api/lobby-chat`). On the
 * PartyKit edge the Next.js API routes run as short-lived serverless functions,
 * so a process-wide in-memory board is empty on most cold invocations — a posted
 * line never survives to the next poll, and the lobby chat "shows no message".
 * This one fixed object (addressed at the singleton id `/parties/lobbychat/
 * directory`, mirroring the room directory in party/lobby.ts) holds the shared
 * feed so every browser sees the same lines.
 *
 * The bounds / flood / sanitise rules live in the shared, unit-tested
 * `LobbyChatBoard`; this class is just its HTTP + storage shell. The feed
 * survives hibernation via Durable Object storage.
 */

const STORAGE_KEY = "messages";

export default class LobbyChatServer implements Party.Server {
  /** The feed persists across hibernation; reloaded in onStart. */
  readonly options: Party.ServerOptions = { hibernate: true };

  private board = new LobbyChatBoard();

  constructor(readonly room: Party.Room) {}

  async onStart(): Promise<void> {
    const stored = (await this.room.storage.get<LobbyChatMessage[]>(STORAGE_KEY)) ?? [];
    this.board = new LobbyChatBoard({ messages: stored });
  }

  private async persist(): Promise<void> {
    await this.room.storage.put(STORAGE_KEY, this.board.list());
  }

  /**
   * Plain HTTP, mirroring the built-in `/api/lobby-chat` surface so the client
   * uses one shape on both backends:
   *  - GET  → `{ messages }` (oldest → newest)
   *  - POST { clientId, name, text } → `{ message }`, or `{ error }` (400)
   *
   * The browser GETs this from a different origin than the `*.partykit.dev` host,
   * so every response carries CORS headers exactly like the room directory object.
   */
  async onRequest(request: Party.Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method === "GET") {
      // list() drops lines older than one day; re-persist so hibernation does
      // not revive expired messages on the next cold start.
      const before = (await this.room.storage.get<LobbyChatMessage[]>(STORAGE_KEY))?.length ?? 0;
      const messages = this.board.list();
      if (messages.length !== before) {
        await this.persist();
      }
      return jsonWithCors({ messages });
    }

    if (request.method === "POST") {
      const body = (await request.json().catch(() => null)) as
        | { clientId?: unknown; name?: unknown; text?: unknown }
        | null;
      try {
        const message = this.board.post({
          clientId: body?.clientId,
          name: body?.name,
          text: body?.text
        });
        // post() also prunes expired lines; persist the whole feed.
        await this.persist();
        return jsonWithCors({ message });
      } catch (error) {
        const reason = error instanceof LobbyChatError ? error.message : "Could not send the message.";
        return jsonWithCors({ error: reason }, 400);
      }
    }

    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }
}

/** Public lobby feed (no credentials), so a wildcard origin is safe. */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};

function jsonWithCors(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: CORS_HEADERS });
}

LobbyChatServer satisfies Party.Worker;

"use client";

import PartySocket from "partysocket";
import type { AdventurePlayerConfig, EngineResult, GameAction, GameDifficulty, GameMode, GameState } from "@/engine";

/**
 * Room transport layer. Two backends share one interface:
 *
 *  - PartyKit (Cloudflare Durable Objects): one object per room, WebSockets
 *    at the edge. Enabled by setting NEXT_PUBLIC_PARTYKIT_HOST to the host
 *    printed by `npx partykit deploy` (e.g. heroes3bg-rooms.<user>.partykit.dev).
 *  - The built-in Next.js API routes (in-memory room store + SSE stream),
 *    used automatically when no PartyKit host is configured.
 */

export type GameRoomSnapshot = {
  roomId: string;
  version: number;
  updatedAt: string;
  state: GameState;
  /** Server store generation — changes when the host process restarted. */
  bootId?: string;
};

export type RoomResetOptions = {
  mode?: GameMode;
  difficulty?: GameDifficulty;
  scenarioId?: string;
  players?: AdventurePlayerConfig[];
};

export type RoomConnectionHandlers = {
  onSnapshot: (snapshot: GameRoomSnapshot) => void;
  onStatus: (status: string) => void;
};

export type RoomConnection = {
  /** Stops the stream/socket and releases resources. */
  close: () => void;
  submitAction: (action: GameAction) => Promise<{ snapshot: GameRoomSnapshot; result: EngineResult }>;
  resetRoom: (options: RoomResetOptions) => Promise<GameRoomSnapshot>;
  fetchSnapshot: () => Promise<GameRoomSnapshot>;
};

export function getPartyKitHost(): string | null {
  const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST;
  return host && host.trim().length > 0 ? host.trim() : null;
}

export function connectRoom(roomId: string, handlers: RoomConnectionHandlers): RoomConnection {
  const host = getPartyKitHost();
  return host ? connectPartyRoom(host, roomId, handlers) : connectApiRoom(roomId, handlers);
}

// ---------------------------------------------------------------------------
// PartyKit backend (WebSockets to a Durable Object per room)
// ---------------------------------------------------------------------------

type PartyServerMessage =
  | { type: "snapshot"; snapshot: GameRoomSnapshot }
  | {
      type: "action-result";
      requestId?: string;
      errors: { code: string; message: string }[];
      snapshot: GameRoomSnapshot;
    };

function partyHttpUrl(host: string, roomId: string): string {
  const protocol = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  return `${protocol}://${host}/party/${encodeURIComponent(roomId)}`;
}

function connectPartyRoom(host: string, roomId: string, handlers: RoomConnectionHandlers): RoomConnection {
  const socket = new PartySocket({ host, room: roomId });
  const pending = new Map<
    string,
    (reply: Extract<PartyServerMessage, { type: "action-result" }>) => void
  >();
  let requestCounter = 0;

  handlers.onStatus("connecting (edge)");

  socket.addEventListener("open", () => {
    handlers.onStatus("live (edge)");
  });
  socket.addEventListener("close", () => {
    handlers.onStatus("edge socket reconnecting");
  });
  socket.addEventListener("error", () => {
    handlers.onStatus("edge socket reconnecting");
  });
  socket.addEventListener("message", (event) => {
    let message: PartyServerMessage;
    try {
      message = JSON.parse(event.data as string) as PartyServerMessage;
    } catch {
      return;
    }

    if (message.type === "snapshot") {
      handlers.onSnapshot(message.snapshot);
      handlers.onStatus(`live (edge) v${message.snapshot.version}`);
      return;
    }

    if (message.type === "action-result") {
      if (message.requestId) {
        pending.get(message.requestId)?.(message);
        pending.delete(message.requestId);
      }
      if (message.errors.length === 0) {
        handlers.onSnapshot(message.snapshot);
      }
    }
  });

  return {
    close: () => {
      socket.close();
      pending.clear();
    },
    submitAction: (action) =>
      new Promise((resolve, reject) => {
        requestCounter += 1;
        const requestId = `req_${requestCounter}_${Date.now().toString(36)}`;
        const timeout = window.setTimeout(() => {
          pending.delete(requestId);
          reject(new Error("The room did not answer in time."));
        }, 15000);

        pending.set(requestId, (reply) => {
          window.clearTimeout(timeout);
          resolve({
            snapshot: reply.snapshot,
            result: {
              state: reply.snapshot.state,
              events: [],
              errors: reply.errors.map((error) => ({
                code: error.code as EngineResult["errors"][number]["code"],
                message: error.message
              }))
            }
          });
        });

        socket.send(JSON.stringify({ type: "action", requestId, action }));
      }),
    resetRoom: async (options) => {
      const response = await fetch(partyHttpUrl(host, roomId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true, ...options })
      });
      if (!response.ok) {
        throw new Error("Could not reset the room.");
      }
      return (await response.json()) as GameRoomSnapshot;
    },
    fetchSnapshot: async () => {
      const response = await fetch(partyHttpUrl(host, roomId), { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Could not load room.");
      }
      return (await response.json()) as GameRoomSnapshot;
    }
  };
}

// ---------------------------------------------------------------------------
// Built-in Next.js API backend (in-memory store + SSE stream)
// ---------------------------------------------------------------------------

function connectApiRoom(roomId: string, handlers: RoomConnectionHandlers): RoomConnection {
  const source = new EventSource(`/api/rooms/${encodeURIComponent(roomId)}/stream`);
  // The server pings every 20s with a real data event. A stream that stayed
  // silent for much longer is half-dead (idle proxies, sleeping laptops) even
  // when the browser never fired onerror — fall back to polling until the
  // EventSource reconnects.
  let lastMessageAt = Date.now();
  let streamErrored = false;

  const fetchSnapshot = async (): Promise<GameRoomSnapshot> => {
    const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Could not load room.");
    }
    return (await response.json()) as GameRoomSnapshot;
  };

  source.onmessage = (message) => {
    lastMessageAt = Date.now();
    streamErrored = false;
    try {
      const payload = JSON.parse(message.data) as GameRoomSnapshot | { ping: true };
      if ("ping" in payload) {
        return;
      }
      if (payload && payload.state) {
        handlers.onSnapshot(payload);
        handlers.onStatus(`live v${payload.version}`);
      }
    } catch {
      // Ignore malformed frames.
    }
  };
  source.onerror = () => {
    streamErrored = true;
    handlers.onStatus("stream reconnecting");
  };

  const pollId = window.setInterval(() => {
    const stale = Date.now() - lastMessageAt > 45000;
    if (!streamErrored && !stale) {
      return;
    }
    fetchSnapshot()
      .then((snapshot) => {
        handlers.onSnapshot(snapshot);
        handlers.onStatus(`live (poll) v${snapshot.version}`);
      })
      .catch(() => handlers.onStatus("room sync failed"));
  }, 4000);

  // Waking up from a background tab or laptop sleep: resync immediately
  // instead of waiting for the next poll window.
  const onWake = () => {
    if (document.visibilityState === "hidden") {
      return;
    }
    fetchSnapshot()
      .then((snapshot) => handlers.onSnapshot(snapshot))
      .catch(() => {
        /* The regular poll keeps retrying. */
      });
  };
  window.addEventListener("focus", onWake);
  document.addEventListener("visibilitychange", onWake);

  return {
    close: () => {
      source.close();
      window.clearInterval(pollId);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    },
    submitAction: async (action) => {
      const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      if (!response.ok) {
        throw new Error("Server rejected the action request.");
      }
      return (await response.json()) as { snapshot: GameRoomSnapshot; result: EngineResult };
    },
    resetRoom: async (options) => {
      const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true, ...options })
      });
      if (!response.ok) {
        throw new Error("Could not reset the room.");
      }
      return (await response.json()) as GameRoomSnapshot;
    },
    fetchSnapshot
  };
}

import {
  getRoomSnapshot,
  handleRoomDisconnect,
  markRoomClientConnected,
  markRoomClientDisconnected,
  subscribeToRoom,
  type GameRoomSnapshot
} from "@/server/game-room-store";
import { sessionProfile } from "@/server/accounts/http";
import { redactSnapshotForViewer } from "@/server/redact-snapshot";

export const dynamic = "force-dynamic";

type RoomContext = {
  params: Promise<{
    roomId: string;
  }>;
};

/**
 * Server-Sent Events stream: pushes every room snapshot the moment an action
 * is applied, so all seats see opponents' map moves and combats in real time.
 * Clients fall back to polling when the stream drops.
 */
export async function GET(request: Request, context: RoomContext) {
  const { roomId } = await context.params;
  const decodedRoomId = decodeURIComponent(roomId);
  // The stable per-tab client id (see src/lib/identity.ts) travels on the stream
  // URL so that when this connection drops we can reap that client's stale
  // membership — otherwise one computer that joins, leaves and rejoins piles up
  // ghost members and inflates the room's head count.
  const clientId = new URL(request.url).searchParams.get("clientId") ?? undefined;
  // Per-connection redaction (Phase 2): resolve this connection's VERIFIED
  // identity from the session cookie once, then redact every frame to its own
  // seat so a devtools reader on the socket never sees another seat's hidden
  // info. Guests fall back to the clientId; open tables are not redacted.
  const viewerUserId = (() => {
    try {
      return sessionProfile(request)?.id;
    } catch {
      return undefined;
    }
  })();
  const viewer = { clientId, userId: viewerUserId };
  const redact = (snapshot: GameRoomSnapshot): GameRoomSnapshot => redactSnapshotForViewer(snapshot, viewer);
  const encoder = new TextEncoder();

  let unsubscribe = () => {};
  let keepAlive: ReturnType<typeof setInterval> | undefined;
  // Reap the disconnecting client's ephemeral membership exactly once, whether
  // the teardown arrives via the request `abort` signal or the stream `cancel`.
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    unsubscribe();
    if (keepAlive) {
      clearInterval(keepAlive);
    }
    // Presence first (the host-while-connected rule reads it), then the
    // ephemeral-membership reap.
    markRoomClientDisconnected(decodedRoomId, clientId);
    handleRoomDisconnect(decodedRoomId, clientId);
  };

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      // Snapshot frames are redacted to this connection's seat; a `closed` frame
      // and the keep-alive ping are passed through untouched.
      const sendSnapshot = (snapshot: GameRoomSnapshot) => send(snapshot.closed ? snapshot : redact(snapshot));

      // Presence: this clientId now holds a live stream on the room (backs the
      // host-while-connected authority for reset/close).
      markRoomClientConnected(decodedRoomId, clientId);
      sendSnapshot(getRoomSnapshot(decodedRoomId));
      unsubscribe = subscribeToRoom(decodedRoomId, sendSnapshot);

      // A real data event (not an SSE comment) so clients can tell a live
      // stream from a half-dead connection: no ping for a while means the
      // socket silently died and the client falls back to polling.
      keepAlive = setInterval(() => {
        try {
          send({ ping: true, at: Date.now() });
        } catch {
          // Stream already closed; cancel() handles cleanup.
        }
      }, 20000);

      request.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      });
    },
    cancel() {
      cleanup();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}

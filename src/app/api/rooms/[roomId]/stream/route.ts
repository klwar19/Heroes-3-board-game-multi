import { getRoomSnapshot, subscribeToRoom } from "@/server/game-room-store";

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
  const encoder = new TextEncoder();

  let unsubscribe = () => {};
  let keepAlive: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      send(getRoomSnapshot(decodedRoomId));
      unsubscribe = subscribeToRoom(decodedRoomId, send);

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
        unsubscribe();
        if (keepAlive) {
          clearInterval(keepAlive);
        }
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      });
    },
    cancel() {
      unsubscribe();
      if (keepAlive) {
        clearInterval(keepAlive);
      }
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

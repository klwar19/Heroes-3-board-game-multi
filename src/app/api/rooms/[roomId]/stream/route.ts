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

      keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          // Stream already closed; cancel() handles cleanup.
        }
      }, 25000);

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

export const dynamic = "force-dynamic";

/**
 * Garrison Wars two-seat relay for the built-in backend (no PartyKit host
 * configured, e.g. `next dev`): the same host/guest forwarding as
 * party/garrison.ts, over Server-Sent Events + POST. It lives in this server
 * process's memory, so it only pairs browsers talking to the same Node
 * process — deployments use the PartyKit party instead.
 */

type Role = "host" | "guest";
type Seat = { id: string; role: Role; send: (frame: string) => void };
type Hub = Map<string, Seat[]>;

const MAX_FRAME = 256 * 1024;
const CODE = /^[A-Z0-9]{4,8}$/;
const CLIENT = /^[A-Za-z0-9_-]{6,64}$/;

function hub(): Hub {
  const holder = globalThis as typeof globalThis & { __garrisonRelay?: Hub };
  holder.__garrisonRelay ??= new Map();
  return holder.__garrisonRelay;
}

type Context = { params: Promise<{ code: string }> };

/** The room code from the path ("" when it is not valid percent-encoding). */
async function roomCode(context: Context): Promise<string> {
  try {
    return decodeURIComponent((await context.params).code).toUpperCase();
  } catch {
    return "";
  }
}

export async function GET(request: Request, context: Context) {
  const code = await roomCode(context);
  const clientId = new URL(request.url).searchParams.get("clientId") ?? "";
  if (!CODE.test(code) || !CLIENT.test(clientId)) return new Response("Bad request", { status: 400 });
  const rooms = hub();
  const encoder = new TextEncoder();
  let seat: Seat | null = null;
  let keepAlive: ReturnType<typeof setInterval> | undefined;
  const leave = () => {
    if (keepAlive) clearInterval(keepAlive);
    if (!seat) return;
    const left = seat;
    seat = null;
    const seats = (rooms.get(code) ?? []).filter((other) => other !== left);
    if (seats.length) rooms.set(code, seats);
    else rooms.delete(code);
    for (const other of seats) other.send(JSON.stringify({ k: "peer", role: left.role, present: false }));
  };
  const stream = new ReadableStream({
    start(controller) {
      const push = (frame: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${frame}\n\n`));
        } catch {
          leave();
        }
      };
      const seats = (rooms.get(code) ?? []).filter((other) => other.id !== clientId);
      const taken = new Set(seats.map((other) => other.role));
      const role: Role | null = !taken.has("host") ? "host" : !taken.has("guest") ? "guest" : null;
      if (!role) {
        push(JSON.stringify({ k: "full" }));
        controller.close();
        return;
      }
      seat = { id: clientId, role, send: push };
      rooms.set(code, [...seats, seat]);
      push(JSON.stringify({ k: "hello", role }));
      for (const other of seats) {
        push(JSON.stringify({ k: "peer", role: other.role, present: true }));
        other.send(JSON.stringify({ k: "peer", role, present: true }));
      }
      keepAlive = setInterval(() => push(JSON.stringify({ k: "ping" })), 20000);
      request.signal.addEventListener("abort", () => {
        leave();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      });
    },
    cancel() {
      leave();
    }
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" }
  });
}

export async function POST(request: Request, context: Context) {
  const code = await roomCode(context);
  // A frame is at most MAX_FRAME characters; refuse far bigger bodies before reading them.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_FRAME * 4) return new Response("Too large", { status: 413 });
  const body = (await request.json().catch(() => null)) as { clientId?: unknown; frame?: unknown } | null;
  const clientId = typeof body?.clientId === "string" ? body.clientId : "";
  const frame = typeof body?.frame === "string" ? body.frame : "";
  if (!CODE.test(code) || !CLIENT.test(clientId) || !frame || frame.length > MAX_FRAME) return new Response("Bad request", { status: 400 });
  const seats = hub().get(code) ?? [];
  if (!seats.some((seat) => seat.id === clientId)) return new Response("Not seated", { status: 409 });
  for (const seat of seats) if (seat.id !== clientId) seat.send(frame);
  return new Response(null, { status: 204 });
}

import type * as Party from "partykit/server";

/**
 * Garrison Wars online duels: a two-seat relay. The first browser in a room
 * is the host (it runs the authoritative simulation), the second the guest;
 * every frame one sends is forwarded to the other. No game state lives here —
 * the host's lockstep batches are small (a few frames a second), so a match
 * costs the edge almost nothing.
 */

type Role = "host" | "guest";

const MAX_FRAME = 256 * 1024;

export default class GarrisonRelay implements Party.Server {
  private readonly roles = new Map<string, Role>();

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection): void {
    const taken = new Set(this.roles.values());
    const role: Role | null = !taken.has("host") ? "host" : !taken.has("guest") ? "guest" : null;
    if (!role) {
      conn.send(JSON.stringify({ k: "full" }));
      conn.close();
      return;
    }
    this.roles.set(conn.id, role);
    conn.send(JSON.stringify({ k: "hello", role }));
    for (const [id, other] of this.roles) {
      if (id !== conn.id) conn.send(JSON.stringify({ k: "peer", role: other, present: true }));
    }
    this.room.broadcast(JSON.stringify({ k: "peer", role, present: true }), [conn.id]);
  }

  onMessage(message: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection): void {
    if (typeof message !== "string" || message.length > MAX_FRAME || !this.roles.has(sender.id)) return;
    this.room.broadcast(message, [sender.id]);
  }

  onClose(conn: Party.Connection): void {
    const role = this.roles.get(conn.id);
    if (!role) return;
    this.roles.delete(conn.id);
    this.room.broadcast(JSON.stringify({ k: "peer", role, present: false }));
  }

  onError(conn: Party.Connection): void {
    this.onClose(conn);
  }
}

GarrisonRelay satisfies Party.Worker;

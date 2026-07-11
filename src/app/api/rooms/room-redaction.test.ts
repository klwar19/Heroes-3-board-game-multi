import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Per-connection redaction through the real HTTP surface (Phase 2, plan §D2
 * step 5). A second connection's frame must never contain another seat's hand
 * ids — asserted on the SERIALIZED frame the route returns, not the rendered
 * DOM. A CONTROL on an OPEN table proves the redaction is gated to hosted rooms
 * (open tables keep the full shared frame the client redacts locally).
 */
const ROOM_DIR = mkdtempSync(join(tmpdir(), "homm3bg-redact-rooms-"));
process.env.HOMM3BG_ROOM_DIR = ROOM_DIR;

let roomCounter = 0;

function resetStore() {
  (globalThis as Record<string, unknown>).__homm3bgRoomStore = undefined;
  (globalThis as Record<string, unknown>).__homm3bgRoomListeners = undefined;
}
beforeEach(resetStore);
afterEach(resetStore);

/** A room whose STATE is a real 2-player game (players carry hands + decks). */
async function makeGameRoom(hosted: boolean): Promise<{ roomId: string }> {
  const { createRoom, submitRoomAction } = await import("@/server/game-room-store");
  roomCounter += 1;
  const roomId = `redact-room-${roomCounter}`;
  createRoom({
    roomId,
    players: [
      { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
  submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "cA", name: "Alice" });
  submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "cB", name: "Bob" });
  if (hosted) {
    submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: "cA", hosted: true });
    submitRoomAction(roomId, { type: "ASSIGN_SEAT", clientId: "cA", targetClientId: "cA", seat: "p1" });
    submitRoomAction(roomId, { type: "ASSIGN_SEAT", clientId: "cA", targetClientId: "cB", seat: "p2" });
  }
  return { roomId };
}

function getRequest(roomId: string, clientId: string): Request {
  return new Request(`http://x/api/rooms/${roomId}?clientId=${clientId}`);
}

describe("GET /api/rooms/[roomId] redacts a hosted room per connection", () => {
  it("Bob's frame hides Alice's hand ids but shows his own (privacy + control)", async () => {
    const route = await import("./[roomId]/route");
    const { getRoomSnapshot } = await import("@/server/game-room-store");
    const { roomId } = await makeGameRoom(true);

    // The unredacted server truth (what a leak would expose).
    const truth = getRoomSnapshot(roomId).state;
    const aliceHand = truth.players.p1.hand;
    const bobHand = truth.players.p2.hand;
    expect(aliceHand.length).toBeGreaterThan(0);
    expect(bobHand.length).toBeGreaterThan(0);

    const res = await route.GET(getRequest(roomId, "cB"), { params: Promise.resolve({ roomId }) });
    const frame = await res.json();
    const serialized = JSON.stringify(frame);

    // PRIVACY: none of Alice's real hand ids appear in Bob's frame; the count is
    // preserved as "hidden" placeholders.
    expect(frame.state.players.p1.hand.every((c: string) => c === "hidden")).toBe(true);
    expect(frame.state.players.p1.hand).toHaveLength(aliceHand.length);
    // Cards that are legitimately public elsewhere (each shared deck starts with
    // one face-up card on its discard pile) can coincide with a hidden hand id, so
    // they are exempt from the "must not appear" check.
    const publicDiscardCards = new Set(
      Object.values(truth.decks).flatMap((deck) => deck.discardPile as string[])
    );
    for (const cardId of aliceHand) {
      // A distinctive id from Alice's hand must not be anywhere in Bob's frame.
      if (!bobHand.includes(cardId) && !publicDiscardCards.has(cardId)) {
        expect(serialized).not.toContain(`"${cardId}"`);
      }
    }

    // CONTROL: Bob's OWN hand is fully present.
    expect(frame.state.players.p2.hand).toEqual(bobHand);
  });

  it("redacts BOTH the snapshot AND result.state in the action response", async () => {
    const actions = await import("./[roomId]/actions/route");
    const { getRoomSnapshot } = await import("@/server/game-room-store");
    const { roomId } = await makeGameRoom(true);
    const truth = getRoomSnapshot(roomId).state;
    const aliceHand = truth.players.p1.hand;
    const bobHand = truth.players.p2.hand;

    // Bob (seat p2) submits an always-legal re-JOIN; the response must hide
    // Alice's hand in BOTH the snapshot and the EngineResult's `state`.
    const req = new Request(`http://x/api/rooms/${roomId}/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: { type: "JOIN_ROOM", clientId: "cB", name: "Bob" }, actorClientId: "cB" })
    });
    const res = await actions.POST(req, { params: Promise.resolve({ roomId }) });
    const body = await res.json();

    expect(body.snapshot.state.players.p1.hand.every((c: string) => c === "hidden")).toBe(true);
    // result.state is the full GameState — it must be redacted too, or it leaks.
    expect(body.result.state.players.p1.hand.every((c: string) => c === "hidden")).toBe(true);
    expect(body.result.state.players.p1.hand).toHaveLength(aliceHand.length);
    // Bob's own hand survives in both.
    expect(body.result.state.players.p2.hand).toEqual(bobHand);
  });

  it("an OPEN table is NOT redacted — the full shared frame is returned (gating control)", async () => {
    const route = await import("./[roomId]/route");
    const { getRoomSnapshot } = await import("@/server/game-room-store");
    const { roomId } = await makeGameRoom(false); // open table

    const truth = getRoomSnapshot(roomId).state;
    const res = await route.GET(getRequest(roomId, "cB"), { params: Promise.resolve({ roomId }) });
    const frame = await res.json();

    // Open tables keep the full state (the client redacts locally), so both
    // hands are the real ids — proving redaction is gated to HOSTED rooms.
    expect(frame.state.players.p1.hand).toEqual(truth.players.p1.hand);
    expect(frame.state.players.p2.hand).toEqual(truth.players.p2.hand);
  });
});

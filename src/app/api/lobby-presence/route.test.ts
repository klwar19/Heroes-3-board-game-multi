import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "./route";
import type { PresenceEntry } from "@/server/lobby-presence";

/** Reset the process-wide presence singleton so each test starts empty. */
function resetBoard() {
  (globalThis as Record<string, unknown>).__homm3bgLobbyPresence = undefined;
}

beforeEach(resetBoard);
afterEach(resetBoard);

function postRequest(body: unknown): Request {
  return new Request("http://x/api/lobby-presence", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("/api/lobby-presence route", () => {
  it("POST heartbeat registers a player and GET lists them", async () => {
    const beat = await POST(postRequest({ clientId: "c1", name: "Alice" }));
    expect(beat.status).toBe(200);

    const listed = await GET();
    const body = (await listed.json()) as { players: PresenceEntry[] };
    expect(body.players.map((p) => p.name)).toEqual(["Alice"]);
    // With no session cookie the server treats the heartbeat as a GUEST — the
    // control that the verified flag is decided server-side, not from the body.
    expect(body.players[0].verified).toBe(false);
  });

  it("ignores a forged verified flag in the body (accounts off ⇒ everyone is a guest)", async () => {
    // A malicious client cannot promote itself by sending userId/verified — the
    // route never reads them; it resolves the account from the cookie only.
    await POST(postRequest({ clientId: "c1", name: "Mallory", userId: "u_admin", verified: true }));
    const body = (await (await GET()).json()) as { players: PresenceEntry[] };
    expect(body.players[0].verified).toBe(false);
    expect(JSON.stringify(body.players[0])).not.toContain("u_admin");
  });

  it("carries the room a player reports being in", async () => {
    await POST(postRequest({ clientId: "c1", name: "Alice", roomId: "r1", roomName: "Friday Night" }));
    const body = (await (await GET()).json()) as { players: PresenceEntry[] };
    expect(body.players[0].roomId).toBe("r1");
    expect(body.players[0].roomName).toBe("Friday Night");
  });

  it("POST leave drops the player (control: a fresh heartbeat re-adds them)", async () => {
    await POST(postRequest({ clientId: "c1", name: "Alice" }));
    await POST(postRequest({ clientId: "c1", leave: true }));
    expect(((await (await GET()).json()) as { players: PresenceEntry[] }).players).toHaveLength(0);

    await POST(postRequest({ clientId: "c1", name: "Alice" }));
    expect(((await (await GET()).json()) as { players: PresenceEntry[] }).players).toHaveLength(1);
  });

  it("POST rejects a heartbeat with no client id (400)", async () => {
    const bad = await POST(postRequest({ name: "Nobody" }));
    expect(bad.status).toBe(400);
  });
});

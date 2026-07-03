import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * End-to-end proof that the room ACTIONS route threads a VERIFIED account id
 * (Phase 2 — verified-identity seats) from the httpOnly session cookie into the
 * engine — the "sign-in ↔ seat" wiring. The route resolves the account id
 * server-side (unforgeable — a client cannot set it), so `joinRoom` binds the
 * member to that account and a `requireAuth` table refuses a guest. Point both
 * singletons (accounts + rooms) at throwaway dirs BEFORE importing the modules.
 */
const ACCOUNT_DIR = mkdtempSync(join(tmpdir(), "homm3bg-vseat-accts-"));
const ROOM_DIR = mkdtempSync(join(tmpdir(), "homm3bg-vseat-rooms-"));
process.env.HOMM3BG_ACCOUNT_DIR = ACCOUNT_DIR;
process.env.HOMM3BG_ROOM_DIR = ROOM_DIR;
process.env.HOMM3BG_MAIL_TRANSPORT = "capture";

const SESSION_COOKIE = "homm3bg_session";
let roomCounter = 0;

function resetSingletons() {
  (globalThis as Record<string, unknown>).__homm3bgAccountStore = undefined;
  (globalThis as Record<string, unknown>).__homm3bgIpRate = undefined;
  (globalThis as Record<string, unknown>).__homm3bgRoomStore = undefined;
  (globalThis as Record<string, unknown>).__homm3bgRoomListeners = undefined;
  rmSync(join(ACCOUNT_DIR, "accounts.json"), { force: true });
}

beforeEach(resetSingletons);
afterEach(resetSingletons);

/** A confirmed player account's `{ token, userId }` via the account store. */
async function playerAccount(nickname: string, email: string): Promise<{ token: string; userId: string }> {
  const { getAccountStore } = await import("@/server/accounts/account-store-instance");
  const store = getAccountStore();
  // ensureAdminAccount creates a CONFIRMED account without a mail round-trip;
  // demote to an ordinary player so this is a plain signed-in user.
  const profile = store.ensureAdminAccount({ nickname, email, password: "swordfish7" });
  store.setRole(profile.id, "player");
  const { token } = store.login({ identifier: nickname, password: "swordfish7" });
  return { token, userId: profile.id };
}

async function freshRoomId(): Promise<string> {
  const { getRoomSnapshot } = await import("@/server/game-room-store");
  roomCounter += 1;
  const roomId = `vseat-room-${roomCounter}`;
  getRoomSnapshot(roomId); // materialise the room
  return roomId;
}

function actionRequest(
  roomId: string,
  action: unknown,
  opts: { cookie?: string; actorClientId?: string } = {}
): Request {
  return new Request(`http://x/api/rooms/${roomId}/actions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(opts.cookie ? { cookie: opts.cookie } : {}) },
    body: JSON.stringify({ action, ...(opts.actorClientId ? { actorClientId: opts.actorClientId } : {}) })
  });
}

describe("verified seats ↔ rooms: POST /api/rooms/[roomId]/actions binds the session account", () => {
  it("stamps the verified account id onto the joining member (control: no cookie → guest)", async () => {
    const route = await import("./[roomId]/actions/route");
    const { token, userId } = await playerAccount("Gelu", "gelu@erathia.io");

    // Signed-in: the route reads the cookie and passes the verified id to the
    // engine, which binds it onto the member — even though the body never sent it.
    const roomA = await freshRoomId();
    const signedIn = await route.POST(
      actionRequest(roomA, { type: "JOIN_ROOM", clientId: "tab-1", name: "Gelu" }, { cookie: `${SESSION_COOKIE}=${token}`, actorClientId: "tab-1" }),
      { params: Promise.resolve({ roomId: roomA }) }
    );
    const signedInBody = await signedIn.json();
    const boundMember = signedInBody.snapshot.state.room.members.find((m: { clientId: string }) => m.clientId === "tab-1");
    expect(boundMember.userId).toBe(userId);

    // Control: the identical request WITHOUT the cookie is a guest — no account
    // id is bound (a spoofed body cannot supply one).
    const roomB = await freshRoomId();
    const guest = await route.POST(
      actionRequest(roomB, { type: "JOIN_ROOM", clientId: "tab-1", name: "Gelu" }, { actorClientId: "tab-1" }),
      { params: Promise.resolve({ roomId: roomB }) }
    );
    const guestBody = await guest.json();
    const guestMember = guestBody.snapshot.state.room.members.find((m: { clientId: string }) => m.clientId === "tab-1");
    expect(guestMember.userId).toBeUndefined();
  });

  it("a requireAuth table refuses a guest JOIN through the route but admits a signed-in player", async () => {
    const route = await import("./[roomId]/actions/route");
    const { submitRoomAction } = await import("@/server/game-room-store");
    const { token } = await playerAccount("Kilgor", "kilgor@erathia.io");

    // Host locks the table to verified accounts (host is a guest clientId; the
    // require-auth flag is host-controlled, not account-gated to set).
    const roomId = await freshRoomId();
    submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: "host", name: "Host" });
    submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: "host", hosted: true });
    submitRoomAction(roomId, { type: "SET_ROOM_REQUIRE_AUTH", clientId: "host", requireAuth: true });

    // A guest join (no cookie) is rejected by the engine's verified-account gate.
    const guest = await route.POST(
      actionRequest(roomId, { type: "JOIN_ROOM", clientId: "guest", name: "Sneak" }, { actorClientId: "guest" }),
      { params: Promise.resolve({ roomId }) }
    );
    const guestBody = await guest.json();
    expect(guestBody.result.errors.length).toBeGreaterThan(0);
    expect(guestBody.result.errors[0].message).toContain("verified account");

    // The signed-in player joins the very same locked table.
    const signedIn = await route.POST(
      actionRequest(roomId, { type: "JOIN_ROOM", clientId: "member", name: "Kilgor" }, { cookie: `${SESSION_COOKIE}=${token}`, actorClientId: "member" }),
      { params: Promise.resolve({ roomId }) }
    );
    const signedInBody = await signedIn.json();
    expect(signedInBody.result.errors).toHaveLength(0);
    expect(signedInBody.snapshot.state.room.members.some((m: { clientId: string }) => m.clientId === "member")).toBe(true);
  });
});

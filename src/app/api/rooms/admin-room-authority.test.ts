import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * End-to-end proof that a signed-in PLATFORM ADMIN can close ANY room through
 * the real HTTP route — the "connect admin ↔ rooms" wiring. The route resolves
 * admin-ness from the httpOnly session cookie (server-side, unforgeable), so a
 * guest cannot claim it. Point both singletons (accounts + rooms) at throwaway
 * dirs BEFORE importing the route modules.
 */
const ACCOUNT_DIR = mkdtempSync(join(tmpdir(), "homm3bg-admin-accts-"));
const ROOM_DIR = mkdtempSync(join(tmpdir(), "homm3bg-admin-rooms-"));
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

/** A confirmed admin's session token (raw), via the account store singleton. */
async function adminToken(): Promise<string> {
  const { getAccountStore } = await import("@/server/accounts/account-store-instance");
  const store = getAccountStore();
  store.ensureAdminAccount({ nickname: "Overlord", email: "boss@erathia.io", password: "dungeon12" });
  return store.login({ identifier: "Overlord", password: "dungeon12" }).token;
}

/** A hosted room owned by `hostClientId` (the admin is a stranger to it). */
async function makeHostedRoom(hostClientId: string): Promise<string> {
  const { getRoomSnapshot, submitRoomAction } = await import("@/server/game-room-store");
  roomCounter += 1;
  const roomId = `admin-route-room-${roomCounter}`;
  getRoomSnapshot(roomId);
  submitRoomAction(roomId, { type: "JOIN_ROOM", clientId: hostClientId, name: "Owner" });
  submitRoomAction(roomId, { type: "SET_ROOM_HOSTED", clientId: hostClientId, hosted: true });
  return roomId;
}

function deleteRequest(roomId: string, cookie?: string): Request {
  return new Request(`http://x/api/rooms/${roomId}`, {
    method: "DELETE",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ actorClientId: "admin-stranger" })
  });
}

describe("admin ↔ rooms: DELETE /api/rooms/[roomId] honours a platform-admin session", () => {
  it("an admin session closes a hosted room it does not own (control: no cookie → 403)", async () => {
    const route = await import("./[roomId]/route");
    const token = await adminToken();

    // Control: the very same request WITHOUT the admin cookie is a stranger and
    // is refused (the hosted room is protected).
    const roomA = await makeHostedRoom("owner-1");
    const guest = await route.DELETE(deleteRequest(roomA), { params: Promise.resolve({ roomId: roomA }) });
    expect(guest.status).toBe(403);
    expect((await guest.json()).closed).toBe(false);

    // With the admin's session cookie, the same stranger clientId closes it.
    const roomB = await makeHostedRoom("owner-2");
    const admin = await route.DELETE(deleteRequest(roomB, `${SESSION_COOKIE}=${token}`), {
      params: Promise.resolve({ roomId: roomB })
    });
    expect(admin.status).toBe(200);
    expect((await admin.json()).closed).toBe(true);
  });

  it("a NON-admin (ordinary player) session does not gain room-wipe power", async () => {
    const route = await import("./[roomId]/route");
    const { getAccountStore } = await import("@/server/accounts/account-store-instance");
    const store = getAccountStore();
    // A confirmed ordinary player (role: player), logged in.
    const admin = store.ensureAdminAccount({ nickname: "Temp", email: "temp@erathia.io", password: "temp1234" });
    store.setRole(admin.id, "player");
    const token = store.login({ identifier: "Temp", password: "temp1234" }).token;

    const room = await makeHostedRoom("owner-3");
    const res = await route.DELETE(deleteRequest(room, `${SESSION_COOKIE}=${token}`), {
      params: Promise.resolve({ roomId: room })
    });
    // A signed-in player is still a stranger to this room → refused.
    expect(res.status).toBe(403);
    expect((await res.json()).closed).toBe(false);
  });
});

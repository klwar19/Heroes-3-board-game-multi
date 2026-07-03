import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NextResponse } from "next/server";

// Point the account store at a throwaway dir and enable the dev mail echo BEFORE
// the route modules (and their singleton) are dynamically imported below.
const ACCOUNT_DIR = mkdtempSync(join(tmpdir(), "homm3bg-auth-routes-"));
process.env.HOMM3BG_ACCOUNT_DIR = ACCOUNT_DIR;
process.env.HOMM3BG_MAIL_TRANSPORT = "capture";
process.env.HOMM3BG_ADMIN_EMAIL = "boss@erathia.io";

const SESSION_COOKIE = "homm3bg_session";

function jsonRequest(url: string, body: unknown, cookie?: string): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body)
  });
}

function cookieFrom(response: NextResponse): string {
  const value = response.cookies.get(SESSION_COOKIE)?.value ?? "";
  return `${SESSION_COOKIE}=${value}`;
}

async function freshStore() {
  // Reset the process-wide singleton + its on-disk file + the IP-rate map so
  // each test starts empty.
  (globalThis as Record<string, unknown>).__homm3bgAccountStore = undefined;
  (globalThis as Record<string, unknown>).__homm3bgIpRate = undefined;
  rmSync(join(ACCOUNT_DIR, "accounts.json"), { force: true });
}

beforeEach(freshStore);
afterEach(() => rmSync(join(ACCOUNT_DIR, "accounts.json"), { force: true }));

describe("auth API routes — register → confirm → login → session", () => {
  it("walks the full happy path and sets a working session cookie", async () => {
    const register = await import("./register/route");
    const login = await import("./login/route");
    const confirm = await import("./confirm/route");
    const session = await import("./session/route");

    // Register: 200, unconfirmed, dev echo carries the confirm link.
    const regRes = await register.POST(
      jsonRequest("http://x/api/auth/register", {
        nickname: "Roland",
        email: "roland@erathia.io",
        password: "swordsman1"
      })
    );
    expect(regRes.status).toBe(200);
    const regBody = (await regRes.json()) as { profile: { emailConfirmed: boolean }; devConfirmLink?: string };
    expect(regBody.profile.emailConfirmed).toBe(false);
    expect(regBody.devConfirmLink).toContain("/api/auth/confirm?token=");

    // Login before confirming → 403.
    const early = await login.POST(jsonRequest("http://x/api/auth/login", { identifier: "Roland", password: "swordsman1" }));
    expect(early.status).toBe(403);
    expect((await early.json()).error).toBe("EMAIL_NOT_CONFIRMED");

    // Follow the confirmation link (GET) → redirect to /login?confirmed=1.
    const confirmRes = await confirm.GET(new Request(regBody.devConfirmLink!));
    expect(confirmRes.status).toBe(307);
    expect(confirmRes.headers.get("location")).toContain("/login?confirmed=1");

    // Now login → 200 + Set-Cookie.
    const ok = await login.POST(jsonRequest("http://x/api/auth/login", { identifier: "roland@erathia.io", password: "swordsman1" }));
    expect(ok.status).toBe(200);
    const cookie = cookieFrom(ok);
    expect(cookie).not.toBe(`${SESSION_COOKIE}=`);

    // Session endpoint with the cookie returns the profile; without it, null.
    const withCookie = await session.GET(new Request("http://x/api/auth/session", { headers: { cookie } }));
    expect((await withCookie.json()).profile.nickname).toBe("Roland");
    const anon = await session.GET(new Request("http://x/api/auth/session"));
    expect((await anon.json()).profile).toBeNull();
  });

  it("returns distinct 409 codes for duplicate nickname vs email", async () => {
    const register = await import("./register/route");
    await register.POST(jsonRequest("http://x", { nickname: "Gem", email: "gem@erathia.io", password: "beacon12" }));

    const dupNick = await register.POST(jsonRequest("http://x", { nickname: "gem", email: "other@erathia.io", password: "beacon12" }));
    expect(dupNick.status).toBe(409);
    expect((await dupNick.json()).error).toBe("NICKNAME_TAKEN");

    const dupEmail = await register.POST(jsonRequest("http://x", { nickname: "Solmyr", email: "GEM@erathia.io", password: "beacon12" }));
    expect(dupEmail.status).toBe(409);
    expect((await dupEmail.json()).error).toBe("EMAIL_TAKEN");
  });

  it("availability endpoint reports taken vs free and rate-limits per IP", async () => {
    const register = await import("./register/route");
    const availability = await import("./availability/route");
    await register.POST(jsonRequest("http://x", { nickname: "Crag", email: "crag@erathia.io", password: "hammer42" }));

    const taken = await availability.POST(jsonRequest("http://x", { nickname: "Crag", email: "crag@erathia.io" }));
    const body = (await taken.json()) as { nickname: { available: boolean }; email: { available: boolean } };
    expect(body.nickname.available).toBe(false);
    expect(body.email.available).toBe(false);

    // Blow past the 30/min IP budget → eventually 429.
    let sawRateLimit = false;
    for (let i = 0; i < 35; i += 1) {
      const res = await availability.POST(jsonRequest("http://x", { nickname: `Name${i}` }));
      if (res.status === 429) {
        sawRateLimit = true;
        break;
      }
    }
    expect(sawRateLimit).toBe(true);
  });
});

describe("auth API routes — password reset via emailed link", () => {
  it("resets the password and the new one signs in (old one fails)", async () => {
    const register = await import("./register/route");
    const confirm = await import("./confirm/route");
    const login = await import("./login/route");
    const requestReset = await import("./request-reset/route");
    const reset = await import("./reset/route");
    const { getAccountStore } = await import("@/server/accounts/account-store-instance");

    const reg = await register.POST(jsonRequest("http://x", { nickname: "Adela", email: "adela@erathia.io", password: "cleric-99" }));
    const link = (await reg.json()).devConfirmLink as string;
    await confirm.GET(new Request(link));

    const reqRes = await requestReset.POST(jsonRequest("http://x", { email: "adela@erathia.io" }));
    expect(reqRes.status).toBe(200); // always ok

    // Read the reset link from the capture mailbox (dev transport).
    const resetMail = getAccountStore().outbox.find((m) => m.kind === "reset" && m.to === "adela@erathia.io")!;
    const token = new URL(resetMail.link).searchParams.get("token")!;
    const resetRes = await reset.POST(jsonRequest("http://x", { token, password: "cleric-100" }));
    expect(resetRes.status).toBe(200);

    const oldPw = await login.POST(jsonRequest("http://x", { identifier: "Adela", password: "cleric-99" }));
    expect(oldPw.status).toBe(401);
    const newPw = await login.POST(jsonRequest("http://x", { identifier: "Adela", password: "cleric-100" }));
    expect(newPw.status).toBe(200);
  });
});

describe("admin API route — authorization", () => {
  async function confirmedLogin(nickname: string, email: string, password: string): Promise<string> {
    const register = await import("./register/route");
    const confirm = await import("./confirm/route");
    const login = await import("./login/route");
    const reg = await register.POST(jsonRequest("http://x", { nickname, email, password }));
    const link = (await reg.json()).devConfirmLink as string;
    await confirm.GET(new Request(link));
    const ok = await login.POST(jsonRequest("http://x", { identifier: email, password }));
    return cookieFrom(ok as NextResponse);
  }

  it("denies a normal player and allows the configured admin email", async () => {
    const players = await import("../admin/players/route");

    // Anonymous → 403.
    const anon = await players.GET(new Request("http://x/api/admin/players"));
    expect(anon.status).toBe(403);

    // Normal player → 403 (the control that matters most).
    const playerCookie = await confirmedLogin("Grunt", "grunt@erathia.io", "footman-1");
    const denied = await players.GET(new Request("http://x/api/admin/players", { headers: { cookie: playerCookie } }));
    expect(denied.status).toBe(403);

    // The HOMM3BG_ADMIN_EMAIL account (auto-promoted) → 200 with the roster.
    const adminCookie = await confirmedLogin("Boss", "boss@erathia.io", "overlord-7");
    const allowed = await players.GET(new Request("http://x/api/admin/players", { headers: { cookie: adminCookie } }));
    expect(allowed.status).toBe(200);
    const roster = (await allowed.json()) as { players: { nickname: string }[] };
    expect(roster.players.map((p) => p.nickname).sort()).toEqual(["Boss", "Grunt"]);
  });

  it("lets an admin ban a player (that player can no longer sign in) but not ban themselves", async () => {
    const players = await import("../admin/players/route");
    const login = await import("./login/route");

    const playerCookie = await confirmedLogin("Target", "target@erathia.io", "peasant-3");
    const adminCookie = await confirmedLogin("Boss", "boss@erathia.io", "overlord-7");

    // Find the target's id from the admin roster.
    const roster = (await (await players.GET(new Request("http://x", { headers: { cookie: adminCookie } }))).json()) as {
      players: { id: string; nickname: string }[];
    };
    const target = roster.players.find((p) => p.nickname === "Target")!;
    const admin = roster.players.find((p) => p.nickname === "Boss")!;

    const ban = await players.POST(jsonRequest("http://x", { action: "ban", accountId: target.id, reason: "afk" }, adminCookie));
    expect(ban.status).toBe(200);

    // Banned player cannot sign in.
    const blocked = await login.POST(jsonRequest("http://x", { identifier: "Target", password: "peasant-3" }));
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).error).toBe("ACCOUNT_BANNED");

    // Admin self-ban is refused.
    const selfBan = await players.POST(jsonRequest("http://x", { action: "ban", accountId: admin.id }, adminCookie));
    expect(selfBan.status).toBe(403);

    // A non-admin cannot ban anyone.
    const playerBan = await players.POST(jsonRequest("http://x", { action: "ban", accountId: admin.id }, playerCookie));
    expect(playerBan.status).toBe(403);
  });
});

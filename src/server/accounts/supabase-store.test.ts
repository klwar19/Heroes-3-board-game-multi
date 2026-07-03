import { beforeEach, describe, expect, it } from "vitest";
import { FakePostgrest } from "./__fixtures__/fake-postgrest";
import { CaptureMailer, type OutboundMail } from "./mailer";
import { PostgrestClient, PostgrestError } from "./postgrest";
import { ACCOUNTS_TABLE, MATCHES_TABLE, SESSIONS_TABLE, SupabaseAccountStore, TOKENS_TABLE } from "./supabase-store";
import { AccountError } from "./types";

/**
 * The Supabase/Postgres account backend, exercised end-to-end against an
 * in-memory PostgREST emulator with REAL Postgres semantics (unique keys 409
 * with code 23505, DELETE returns the consumed rows, ignore-duplicates drops
 * conflicts). The headline property — the one the file-backed store cannot
 * give a serverless deploy — is pinned by driving TWO independent store
 * instances against the SAME database: what one instance writes, the other
 * sees.
 */

function makeClock(start = 1_700_000_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

function tokenFromLink(mail: OutboundMail | null): string {
  return new URL(mail!.link).searchParams.get("token")!;
}

async function codeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error) {
    return error instanceof AccountError ? error.code : "UNEXPECTED";
  }
  return "NO_THROW";
}

const VALID = { nickname: "Catherine", email: "cat@erathia.io", password: "griffins7" };

describe("SupabaseAccountStore — Postgres-backed accounts", () => {
  let db: FakePostgrest;
  let mailer: CaptureMailer;
  let clock: ReturnType<typeof makeClock>;
  let store: SupabaseAccountStore;

  const makeStore = (overrides: Partial<ConstructorParameters<typeof SupabaseAccountStore>[0]> = {}) =>
    new SupabaseAccountStore({
      url: "https://project.supabase.co",
      serviceRoleKey: "service-role-secret",
      mailer,
      now: clock.now,
      fetchImpl: db.fetch,
      baseUrl: "https://erathia.example",
      ...overrides
    });

  beforeEach(() => {
    db = new FakePostgrest();
    mailer = new CaptureMailer();
    clock = makeClock();
    store = makeStore();
  });

  it("register → confirm → login → session resolves, all as table rows", async () => {
    const { profile, needsConfirmation, confirmation } = await store.register(VALID, "https://from-request.example");
    expect(needsConfirmation).toBe(true);
    expect(profile.emailConfirmed).toBe(false);
    // The account is a real row; only the password HASH is stored.
    expect(db.rows(ACCOUNTS_TABLE)).toHaveLength(1);
    expect(db.rows(ACCOUNTS_TABLE)[0].password_hash).not.toContain(VALID.password);
    // The configured baseUrl wins over the request origin for the mail link.
    expect(confirmation!.link).toContain("https://erathia.example/api/auth/confirm?token=");

    await expect(codeOf(() => store.login({ identifier: VALID.email, password: VALID.password }))).resolves.toBe(
      "EMAIL_NOT_CONFIRMED"
    );
    await store.confirmEmail(tokenFromLink(confirmation));
    const { token } = await store.login({ identifier: "Catherine", password: VALID.password });
    const session = await store.getSessionProfile(token);
    expect(session?.nickname).toBe("Catherine");
    // Only the digest of the session token is stored.
    expect(db.rows(SESSIONS_TABLE).some((row) => row.digest === token)).toBe(false);
  });

  it("what one server instance writes, another instance sees (the serverless fix)", async () => {
    const { confirmation } = await store.register(VALID);
    await store.confirmEmail(tokenFromLink(confirmation));
    const { token } = await store.login({ identifier: VALID.email, password: VALID.password });

    // A COLD-STARTED second instance (fresh in-memory state, same database).
    const other = makeStore();
    const seen = await other.getSessionProfile(token);
    expect(seen?.nickname).toBe("Catherine");
    // …and its logout is global: the first instance stops accepting the token.
    await other.logout(token);
    expect(await store.getSessionProfile(token)).toBeNull();
  });

  it("distinguishes NICKNAME_TAKEN from EMAIL_TAKEN — including on a unique-key race", async () => {
    await store.register(VALID);
    await expect(codeOf(() => store.register({ ...VALID, email: "other@erathia.io" }))).resolves.toBe("NICKNAME_TAKEN");
    await expect(codeOf(() => store.register({ ...VALID, nickname: "Gem" }))).resolves.toBe("EMAIL_TAKEN");
    // Case-insensitivity via the normalised key columns.
    await expect(codeOf(() => store.register({ ...VALID, nickname: "catherine", email: "x@y.io" }))).resolves.toBe(
      "NICKNAME_TAKEN"
    );
  });

  it("auto-confirm mode: register is immediately sign-in-able, no token row, no mail", async () => {
    const auto = makeStore({ autoConfirmNewAccounts: true });
    const { needsConfirmation, confirmation } = await auto.register(VALID);
    expect(needsConfirmation).toBe(false);
    expect(confirmation).toBeNull();
    expect(mailer.outbox).toHaveLength(0);
    expect(db.rows(TOKENS_TABLE)).toHaveLength(0);
    const { token } = await auto.login({ identifier: VALID.email, password: VALID.password });
    expect((await auto.getSessionProfile(token))?.nickname).toBe("Catherine");
  });

  it("sessions expire, slide only past half-life, and die with a ban", async () => {
    const { confirmation } = await store.register(VALID);
    await store.confirmEmail(tokenFromLink(confirmation));
    const { token, profile } = await store.login({ identifier: VALID.email, password: VALID.password });

    // Within the first half of the ttl nothing is rewritten.
    const expiryBefore = db.rows(SESSIONS_TABLE)[0].expires_at as number;
    clock.advance(10 * 24 * 60 * 60 * 1000); // 10 of 30 days
    await store.getSessionProfile(token);
    expect(db.rows(SESSIONS_TABLE)[0].expires_at).toBe(expiryBefore);
    // Past the half-life the expiry slides forward.
    clock.advance(10 * 24 * 60 * 60 * 1000); // day 20
    await store.getSessionProfile(token);
    expect(db.rows(SESSIONS_TABLE)[0].expires_at as number).toBeGreaterThan(expiryBefore);

    // A ban kills the live session immediately.
    await store.banAccount(profile.id, "cheating");
    expect(await store.getSessionProfile(token)).toBeNull();
    await expect(codeOf(() => store.login({ identifier: VALID.email, password: VALID.password }))).resolves.toBe(
      "ACCOUNT_BANNED"
    );
    // CONTROL: unban restores login.
    await store.unbanAccount(profile.id);
    expect((await store.login({ identifier: VALID.email, password: VALID.password })).token).toBeTruthy();
  });

  it("a session past its ttl is rejected and reaped", async () => {
    const { confirmation } = await store.register(VALID);
    await store.confirmEmail(tokenFromLink(confirmation));
    const { token } = await store.login({ identifier: VALID.email, password: VALID.password });
    clock.advance(31 * 24 * 60 * 60 * 1000);
    expect(await store.getSessionProfile(token)).toBeNull();
    expect(db.rows(SESSIONS_TABLE)).toHaveLength(0);
  });

  it("socket tickets verify across instances and expire fast, without sliding", async () => {
    const { confirmation } = await store.register(VALID);
    await store.confirmEmail(tokenFromLink(confirmation));
    const { token } = await store.login({ identifier: VALID.email, password: VALID.password });

    const ticket = await store.mintSocketTicket(token);
    expect(ticket).toBeTruthy();
    // The verify-token endpoint may be served by ANY instance.
    const other = makeStore();
    expect((await other.getVerifiedProfile(ticket))?.nickname).toBe("Catherine");
    // A ticket outlives nothing: 10 minutes later it is gone; the session lives.
    clock.advance(11 * 60_000);
    expect(await other.getVerifiedProfile(ticket)).toBeNull();
    expect((await other.getVerifiedProfile(token))?.nickname).toBe("Catherine");
    // A guest / garbage token verifies to null.
    expect(await store.mintSocketTicket("garbage")).toBeNull();
    expect(await store.getVerifiedProfile("garbage")).toBeNull();
  });

  it("password reset: emailed token sets the new password, confirms, and revokes every session", async () => {
    const { confirmation } = await store.register(VALID);
    await store.confirmEmail(tokenFromLink(confirmation));
    const { token } = await store.login({ identifier: VALID.email, password: VALID.password });

    await store.requestPasswordReset(VALID.email, "https://app.example");
    const resetMail = mailer.latestFor(VALID.email, "reset")!;
    expect(resetMail.link).toContain("https://erathia.example/reset-password?token=");
    await store.resetPassword(tokenFromLink(resetMail), "newpassword9");

    expect(await store.getSessionProfile(token)).toBeNull(); // old session dead
    await expect(codeOf(() => store.login({ identifier: VALID.email, password: VALID.password }))).resolves.toBe(
      "INVALID_CREDENTIALS"
    );
    expect((await store.login({ identifier: VALID.email, password: "newpassword9" })).token).toBeTruthy();
    // Unknown email is silent (no enumeration).
    await expect(store.requestPasswordReset("nobody@erathia.io")).resolves.toBeUndefined();
  });

  it("email tokens are one-time and expire; resend is cooldown-limited ACROSS instances", async () => {
    const { confirmation } = await store.register(VALID);
    const token = tokenFromLink(confirmation);
    await store.confirmEmail(token);
    await expect(codeOf(() => store.confirmEmail(token))).resolves.toBe("TOKEN_INVALID"); // consumed
    await expect(codeOf(() => store.confirmEmail("garbage"))).resolves.toBe("TOKEN_INVALID");

    // Fresh unconfirmed account for the expiry + cooldown paths.
    const second = { nickname: "Gem", email: "gem@erathia.io", password: "unicorns8" };
    const reg2 = await store.register(second);
    clock.advance(25 * 60 * 60 * 1000); // > 24h ttl
    await expect(codeOf(() => store.confirmEmail(tokenFromLink(reg2.confirmation)))).resolves.toBe("TOKEN_EXPIRED");

    // The register mail stamped last_confirm_sent_at — a DIFFERENT instance
    // still refuses an immediate resend (the column, not process memory).
    await store.resendConfirmation(second.email);
    const other = makeStore();
    await expect(codeOf(() => other.resendConfirmation(second.email))).resolves.toBe("RATE_LIMITED");
    clock.advance(61_000);
    await other.resendConfirmation(second.email);
    const latest = mailer.latestFor(second.email, "confirm")!;
    await other.confirmEmail(tokenFromLink(latest));
    // Silent for unknown and for already-confirmed addresses.
    await expect(other.resendConfirmation("nobody@erathia.io")).resolves.toBeUndefined();
    await expect(other.resendConfirmation(second.email)).resolves.toBeUndefined();
  });

  it("availability probes and contact updates work against the table", async () => {
    await store.register(VALID);
    const result = await store.checkAvailability({ nickname: "catherine", email: "new@erathia.io" });
    expect(result.nickname?.available).toBe(false);
    expect(result.email?.available).toBe(true);

    const id = db.rows(ACCOUNTS_TABLE)[0].id as string;
    const updated = await store.updateContact(id, { discord: "cat#0001" });
    expect(updated.contact.discord).toBe("cat#0001");
    expect((await store.getProfileById(id))?.contact.discord).toBe("cat#0001");
    await expect(codeOf(() => store.updateContact("u_missing", {}))).resolves.toBe("NOT_FOUND");
  });

  it("admin: ensureAdminAccount bootstraps a confirmed admin and never overwrites its password", async () => {
    const admin = await store.ensureAdminAccount({ nickname: "Overlord", email: "admin@erathia.io", password: "sceptre-99" });
    expect(admin.role).toBe("admin");
    expect(admin.emailConfirmed).toBe(true);
    expect((await store.login({ identifier: "Overlord", password: "sceptre-99" })).profile.role).toBe("admin");

    // Re-running (every boot) keeps the account and does NOT reset the password.
    await store.ensureAdminAccount({ nickname: "Overlord", email: "admin@erathia.io", password: "different-pw-1" });
    expect((await store.login({ identifier: "Overlord", password: "sceptre-99" })).token).toBeTruthy();

    // Promoting an existing registered player by email works too.
    await store.register(VALID);
    const promoted = await store.promoteToAdminByEmail(VALID.email);
    expect(promoted?.role).toBe("admin");
    expect(await store.promoteToAdminByEmail("nobody@erathia.io")).toBeNull();

    const listed = await store.adminListAccounts();
    expect(listed.map((p) => p.nickname)).toEqual(["Catherine", "Overlord"]);

    // setRole + deleteAccount round-trip.
    const cat = listed.find((p) => p.nickname === "Catherine")!;
    expect((await store.setRole(cat.id, "player")).role).toBe("player");
    await store.deleteAccount(cat.id);
    await expect(codeOf(() => store.deleteAccount(cat.id))).resolves.toBe("NOT_FOUND");
    expect(db.rows(ACCOUNTS_TABLE)).toHaveLength(1);
  });

  it("records a match once: Elo moves, W/L counters bump, duplicates are no-ops", async () => {
    const a = await store.ensureAdminAccount({ nickname: "Alpha", email: "a@erathia.io", password: "password1" });
    const b = await store.ensureAdminAccount({ nickname: "Beta", email: "b@erathia.io", password: "password2" });

    const first = await store.recordMatchResult({
      matchId: "room-1:game-1",
      participants: [
        { accountId: a.id, result: "win" },
        { accountId: b.id, result: "loss" }
      ]
    });
    expect(first.applied).toBe(true);
    const winner = (await store.getProfileById(a.id))!;
    const loser = (await store.getProfileById(b.id))!;
    // The observable outcome: ratings MOVED in the right directions (1200 ± 16
    // for an even pairing) and the tallies advanced.
    expect(winner.mmr).toBe(1216);
    expect(loser.mmr).toBe(1184);
    expect(winner.wins).toBe(1);
    expect(winner.losses).toBe(0);
    expect(loser.losses).toBe(1);
    expect(winner.matches).toBe(1);

    // The match row is the idempotency gate AND the history record.
    expect(db.rows(MATCHES_TABLE)).toHaveLength(1);
    const participants = db.rows(MATCHES_TABLE)[0].participants as { nickname: string; result: string }[];
    expect(participants.map((p) => `${p.nickname}:${p.result}`)).toEqual(["Alpha:win", "Beta:loss"]);

    // CONTROL: reporting the same matchId again (retry, race, both backends)
    // applies nothing — ratings and tallies stay put.
    const dup = await store.recordMatchResult({
      matchId: "room-1:game-1",
      participants: [
        { accountId: a.id, result: "win" },
        { accountId: b.id, result: "loss" }
      ]
    });
    expect(dup.applied).toBe(false);
    expect((await store.getProfileById(a.id))!.mmr).toBe(1216);
    expect((await store.getProfileById(a.id))!.wins).toBe(1);
  });

  it("hall of fame: best first, banned accounts excluded", async () => {
    const a = await store.ensureAdminAccount({ nickname: "Alpha", email: "a@erathia.io", password: "password1" });
    const b = await store.ensureAdminAccount({ nickname: "Beta", email: "b@erathia.io", password: "password2" });
    const c = await store.ensureAdminAccount({ nickname: "Gamma", email: "c@erathia.io", password: "password3" });
    await store.recordMatchResult({
      matchId: "m1",
      participants: [
        { accountId: a.id, result: "win" },
        { accountId: b.id, result: "loss" },
        { accountId: c.id, result: "loss" }
      ]
    });
    expect((await store.hallOfFame()).map((p) => p.nickname)).toEqual(["Alpha", "Beta", "Gamma"]);
    await store.banAccount(b.id);
    expect((await store.hallOfFame()).map((p) => p.nickname)).toEqual(["Alpha", "Gamma"]);
  });

  it("prune sweeps expired sessions, tickets and tokens", async () => {
    const { confirmation } = await store.register(VALID);
    await store.confirmEmail(tokenFromLink(confirmation));
    const { token } = await store.login({ identifier: VALID.email, password: VALID.password });
    await store.mintSocketTicket(token);
    await store.requestPasswordReset(VALID.email);
    expect(db.rows(SESSIONS_TABLE).length).toBe(2); // session + ticket
    expect(db.rows(TOKENS_TABLE).length).toBe(1); // reset token
    clock.advance(31 * 24 * 60 * 60 * 1000);
    await store.prune();
    expect(db.rows(SESSIONS_TABLE)).toHaveLength(0);
    expect(db.rows(TOKENS_TABLE)).toHaveLength(0);
  });

  it("wire hygiene: every request authenticates with the service-role key", async () => {
    await store.register(VALID);
    expect(db.requests.length).toBeGreaterThan(0);
    for (const request of db.requests) {
      expect(request.headers.apikey).toBe("service-role-secret");
      expect(request.headers.authorization).toBe("Bearer service-role-secret");
    }
  });
});

describe("PostgrestClient — error mapping", () => {
  it("maps a 409/23505 to isUniqueViolation and encodes eq filter values", async () => {
    const db = new FakePostgrest();
    const client = new PostgrestClient("https://project.supabase.co", "key", db.fetch);
    await client.insert(ACCOUNTS_TABLE, { id: "u_1", nickname_key: "x", email: "x@y.io" });
    let caught: unknown;
    try {
      await client.insert(ACCOUNTS_TABLE, { id: "u_1", nickname_key: "z", email: "z@y.io" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PostgrestError);
    expect((caught as PostgrestError).isUniqueViolation).toBe(true);

    // Values with URL-hostile characters round-trip through encodeURIComponent.
    const rows = await client.select<{ id: string }>(ACCOUNTS_TABLE, { email: "x@y.io" });
    expect(rows.map((r) => r.id)).toEqual(["u_1"]);
  });
});

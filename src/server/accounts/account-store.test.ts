import { beforeEach, describe, expect, it } from "vitest";
import { AccountStore } from "./account-store";
import { CaptureMailer, type OutboundMail } from "./mailer";
import { AccountError } from "./types";

// A controllable clock so token/session expiry is exercised deterministically.
function makeClock(start = 1_700_000_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

function tokenFromLink(mail: OutboundMail | null): string {
  return new URL(mail!.link).searchParams.get("token")!;
}

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof AccountError ? error.code : "UNEXPECTED";
  }
  return "NO_THROW";
}

const VALID = { nickname: "Catherine", email: "cat@erathia.io", password: "griffins7" };

describe("AccountStore — registration + mail confirmation", () => {
  let mailer: CaptureMailer;
  let store: AccountStore;
  let clock: ReturnType<typeof makeClock>;

  beforeEach(() => {
    mailer = new CaptureMailer();
    clock = makeClock();
    store = new AccountStore({ mailer, now: clock.now, baseUrl: "https://erathia.example" });
  });

  it("creates an unconfirmed account and emails a confirmation LINK", () => {
    const { profile, confirmation } = store.register(VALID);
    expect(profile.nickname).toBe("Catherine");
    expect(profile.emailConfirmed).toBe(false);
    expect(profile.role).toBe("player");
    // A real mail with a real, followable link was produced — not a silent stub.
    expect(mailer.outbox).toHaveLength(1);
    expect(confirmation!.kind).toBe("confirm");
    expect(confirmation!.link).toContain("https://erathia.example/api/auth/confirm?token=");
    expect(confirmation!.text).toContain(confirmation!.link);
  });

  it("distinguishes 'nickname taken' from 'email already registered'", () => {
    store.register(VALID);
    expect(codeOf(() => store.register({ ...VALID, email: "other@erathia.io" }))).toBe("NICKNAME_TAKEN");
    expect(codeOf(() => store.register({ ...VALID, nickname: "Gem" }))).toBe("EMAIL_TAKEN");
    // Case-insensitive on both keys.
    expect(codeOf(() => store.register({ ...VALID, nickname: "catherine", email: "x@y.io" }))).toBe("NICKNAME_TAKEN");
    expect(codeOf(() => store.register({ ...VALID, nickname: "Gem", email: "CAT@ERATHIA.IO" }))).toBe("EMAIL_TAKEN");
  });

  it("auto-confirm mode: registration is immediately sign-in-able, no mail is issued", () => {
    const auto = new AccountStore({ mailer, now: clock.now, autoConfirmNewAccounts: true });
    const { profile, needsConfirmation, confirmation } = auto.register(VALID);
    expect(needsConfirmation).toBe(false);
    expect(confirmation).toBeNull();
    expect(profile.emailConfirmed).toBe(true);
    expect(mailer.outbox).toHaveLength(0);
    // The whole point: the player can sign in straight away — no inbox required.
    const { token } = auto.login({ identifier: VALID.email, password: VALID.password });
    expect(auto.getSessionProfile(token)?.nickname).toBe("Catherine");
    // CONTROL: the default store still gates sign-in on the emailed confirmation.
    store.register(VALID);
    expect(codeOf(() => store.login({ identifier: VALID.email, password: VALID.password }))).toBe("EMAIL_NOT_CONFIRMED");
  });

  it("blocks sign-in until the email is confirmed, then allows it", () => {
    const { confirmation } = store.register(VALID);
    expect(codeOf(() => store.login({ identifier: VALID.email, password: VALID.password }))).toBe("EMAIL_NOT_CONFIRMED");

    store.confirmEmail(tokenFromLink(confirmation));
    const { token, profile } = store.login({ identifier: VALID.email, password: VALID.password });
    expect(profile.emailConfirmed).toBe(true);
    expect(store.getSessionProfile(token)?.nickname).toBe("Catherine");
  });

  it("lets a confirmed user sign in by nickname OR email; rejects a wrong password", () => {
    const { confirmation } = store.register(VALID);
    store.confirmEmail(tokenFromLink(confirmation));
    expect(store.login({ identifier: "Catherine", password: "griffins7" }).token).toBeTruthy();
    expect(store.login({ identifier: "cat@erathia.io", password: "griffins7" }).token).toBeTruthy();
    expect(codeOf(() => store.login({ identifier: "Catherine", password: "wrong-pw1" }))).toBe("INVALID_CREDENTIALS");
    // Unknown identifier is the SAME error (no account enumeration on login).
    expect(codeOf(() => store.login({ identifier: "nobody", password: "whatever1" }))).toBe("INVALID_CREDENTIALS");
  });

  it("expires the confirmation token after its TTL", () => {
    const { confirmation } = store.register(VALID);
    clock.advance(25 * 60 * 60 * 1000); // > 24h default
    expect(codeOf(() => store.confirmEmail(tokenFromLink(confirmation)))).toBe("TOKEN_EXPIRED");
  });

  it("rejects a reused or garbage confirmation token", () => {
    const { confirmation } = store.register(VALID);
    const token = tokenFromLink(confirmation);
    store.confirmEmail(token);
    expect(codeOf(() => store.confirmEmail(token))).toBe("TOKEN_INVALID"); // already used
    expect(codeOf(() => store.confirmEmail("garbage"))).toBe("TOKEN_INVALID");
  });

  it("resend is cooldown-limited, supersedes the old link, and is silent for unknown/confirmed emails", () => {
    store.register(VALID);
    expect(mailer.outbox).toHaveLength(1);
    // Immediate resend within cooldown is refused.
    expect(codeOf(() => store.resendConfirmation(VALID.email))).toBe("RATE_LIMITED");
    clock.advance(61_000);
    store.resendConfirmation(VALID.email);
    // The resend issues a NEW link that works (only the latest is valid).
    const latest = mailer.latestFor(VALID.email, "confirm")!;
    store.confirmEmail(tokenFromLink(latest));
    // Unknown / already-confirmed emails produce no mail and no error.
    const before = mailer.outbox.length;
    store.resendConfirmation("ghost@nowhere.io");
    clock.advance(61_000);
    store.resendConfirmation(VALID.email); // now confirmed → silent no-op
    expect(mailer.outbox.length).toBe(before);
  });
});

describe("AccountStore — sessions", () => {
  it("resolves a live session and clears it on logout", () => {
    const store = new AccountStore();
    const { confirmation } = store.register(VALID);
    store.confirmEmail(new URL(confirmation!.link).searchParams.get("token")!);
    const { token } = store.login({ identifier: VALID.email, password: VALID.password });
    expect(store.getSessionProfile(token)).not.toBeNull();
    store.logout(token);
    expect(store.getSessionProfile(token)).toBeNull();
    expect(store.getSessionProfile(undefined)).toBeNull();
  });

  it("expires a session after its TTL", () => {
    const clock = makeClock();
    const store = new AccountStore({ now: clock.now, sessionTtlMs: 1000 });
    const { confirmation } = store.register(VALID);
    store.confirmEmail(new URL(confirmation!.link).searchParams.get("token")!);
    const { token } = store.login({ identifier: VALID.email, password: VALID.password });
    expect(store.getSessionProfile(token)).not.toBeNull();
    clock.advance(1001);
    expect(store.getSessionProfile(token)).toBeNull();
  });

  it("slides expiry for an ACTIVE session (used past half-life), so activity keeps you signed in", () => {
    const clock = makeClock();
    const store = new AccountStore({ now: clock.now, sessionTtlMs: 1000 });
    const { confirmation } = store.register(VALID);
    store.confirmEmail(new URL(confirmation!.link).searchParams.get("token")!);
    const { token } = store.login({ identifier: VALID.email, password: VALID.password });
    // Touch the session past its half-life: expiry renews to now + ttl.
    clock.advance(600);
    expect(store.getSessionProfile(token)).not.toBeNull();
    // 1500ms after login — past the ORIGINAL 1000ms expiry (the control above
    // proves an untouched session is dead by now) — the slid session lives on.
    clock.advance(900);
    expect(store.getSessionProfile(token)).not.toBeNull();
    // And the slid expiry is still a real one: a long absence ends it.
    clock.advance(1001);
    expect(store.getSessionProfile(token)).toBeNull();
  });
});

describe("AccountStore — socket tickets (Phase 2, cross-origin edge auth)", () => {
  function confirmedSession() {
    const clock = makeClock();
    const store = new AccountStore({ now: clock.now, socketTicketTtlMs: 1000 });
    const { confirmation } = store.register(VALID);
    store.confirmEmail(tokenFromLink(confirmation));
    const { token, profile } = store.login({ identifier: VALID.email, password: VALID.password });
    return { store, clock, sessionToken: token, accountId: profile.id };
  }

  it("mints a ticket that resolves to the account, then expires on its own TTL", () => {
    const { store, clock, sessionToken, accountId } = confirmedSession();
    const ticket = store.mintSocketTicket(sessionToken)!;
    expect(ticket).toBeTruthy();
    expect(store.getSocketTicketProfile(ticket)?.id).toBe(accountId);
    // getVerifiedProfile accepts EITHER a ticket or a raw session token.
    expect(store.getVerifiedProfile(ticket)?.id).toBe(accountId);
    expect(store.getVerifiedProfile(sessionToken)?.id).toBe(accountId);

    // The ticket is short-lived: past its TTL it no longer resolves…
    clock.advance(1001);
    expect(store.getSocketTicketProfile(ticket)).toBeNull();
    // …but the underlying session (30-day default here) still does — proving the
    // ticket has its OWN short lifetime, not the session's.
    expect(store.getSessionProfile(sessionToken)?.id).toBe(accountId);
  });

  it("refuses to mint for a missing/invalid session (guest → no ticket)", () => {
    const { store } = confirmedSession();
    expect(store.mintSocketTicket("not-a-session")).toBeNull();
    expect(store.mintSocketTicket(undefined)).toBeNull();
  });

  it("revokes live tickets when the account is banned (a banned user can't reach the edge)", () => {
    const { store, sessionToken, accountId } = confirmedSession();
    const ticket = store.mintSocketTicket(sessionToken)!;
    expect(store.getSocketTicketProfile(ticket)).not.toBeNull();
    store.banAccount(accountId, "cheating");
    expect(store.getSocketTicketProfile(ticket)).toBeNull();
  });

  it("keeps tickets OUT of the persisted snapshot (they are ephemeral)", () => {
    const { store, sessionToken } = confirmedSession();
    store.mintSocketTicket(sessionToken);
    const snapshot = store.toJSON() as unknown as Record<string, unknown>;
    // The snapshot shape is unchanged — no socketTickets key leaks into it.
    expect("socketTickets" in snapshot).toBe(false);
  });
});

describe("AccountStore — hygiene (the persisted snapshot stays bounded)", () => {
  it("prunes expired sessions and email tokens out of the snapshot; live rows survive", () => {
    const clock = makeClock();
    const store = new AccountStore({ now: clock.now, sessionTtlMs: 1000, tokenTtlMs: 1000 });
    const { confirmation } = store.register(VALID);
    store.confirmEmail(new URL(confirmation!.link).searchParams.get("token")!);
    store.login({ identifier: VALID.email, password: VALID.password });
    // A second account leaves its confirmation token pending.
    store.register({ nickname: "Gem", email: "gem@erathia.io", password: "unicorns8" });

    // Control: while live, both the session and the pending token persist.
    const live = store.toJSON();
    expect(live.sessions).toHaveLength(1);
    expect(live.tokens).toHaveLength(1);

    // Past both TTLs the abandoned rows are swept — even though neither token
    // nor session was ever presented again (the old lazy-delete never fired).
    clock.advance(1001);
    const pruned = store.toJSON();
    expect(pruned.sessions).toHaveLength(0);
    expect(pruned.tokens).toHaveLength(0);
    // Accounts themselves are of course untouched.
    expect(pruned.accounts).toHaveLength(2);
  });

  it("caps the Hall of Fame payload at the requested limit (best players first)", () => {
    const store = new AccountStore();
    for (const [nickname, email] of [
      ["Alpha", "alpha@erathia.io"],
      ["Bravo", "bravo@erathia.io"],
      ["Carol", "carol@erathia.io"]
    ] as const) {
      const { confirmation } = store.register({ nickname, email, password: "longsword9" });
      store.confirmEmail(new URL(confirmation!.link).searchParams.get("token")!);
    }
    const bravo = store.adminListAccounts().find((a) => a.nickname === "Bravo")!;
    store.recordMatchResult({ matchId: "hof-cap", participants: [{ accountId: bravo.id, result: "win" }] });

    // Unlimited view (the control): all three, Bravo first (highest MMR after a win).
    expect(store.hallOfFame().map((p) => p.nickname)).toEqual(["Bravo", "Alpha", "Carol"]);
    // The cap keeps the BEST rows, dropping from the bottom.
    expect(store.hallOfFame(2).map((p) => p.nickname)).toEqual(["Bravo", "Alpha"]);
  });

  it("caps the recorded-match idempotency log, evicting the OLDEST matchIds first", () => {
    const store = new AccountStore({ maxRecordedMatches: 3 });
    const { confirmation } = store.register(VALID);
    store.confirmEmail(new URL(confirmation!.link).searchParams.get("token")!);
    const id = store.adminListAccounts()[0].id;
    const report = (matchId: string) =>
      store.recordMatchResult({ matchId, participants: [{ accountId: id, result: "win" }] });

    for (const matchId of ["m1", "m2", "m3"]) {
      expect(report(matchId).applied).toBe(true);
    }
    // Still inside the window: a duplicate is the idempotent no-op.
    expect(report("m1").applied).toBe(false);
    // A fourth match evicts the oldest id (m1) and keeps the newest three.
    expect(report("m4").applied).toBe(true);
    expect(store.toJSON().recordedMatches).toEqual(["m2", "m3", "m4"]);
    // The recent ids still dedupe.
    expect(report("m4").applied).toBe(false);
  });
});

describe("AccountStore — availability + password reset", () => {
  let mailer: CaptureMailer;
  let store: AccountStore;
  let clock: ReturnType<typeof makeClock>;

  beforeEach(() => {
    mailer = new CaptureMailer();
    clock = makeClock();
    store = new AccountStore({ mailer, now: clock.now });
  });

  it("reports nickname and email availability distinctly", () => {
    store.register(VALID);
    expect(store.checkAvailability({ nickname: "Catherine" }).nickname).toEqual({ available: false });
    expect(store.checkAvailability({ nickname: "Roland" }).nickname).toEqual({ available: true });
    expect(store.checkAvailability({ email: "cat@erathia.io" }).email).toEqual({ available: false });
    expect(store.checkAvailability({ email: "new@erathia.io" }).email).toEqual({ available: true });
    expect(store.checkAvailability({ nickname: "ab" }).nickname?.available).toBe(false); // invalid → unavailable
  });

  it("resets a password via the emailed link and revokes old sessions", () => {
    const { confirmation } = store.register(VALID);
    store.confirmEmail(tokenFromLink(confirmation));
    const first = store.login({ identifier: VALID.email, password: VALID.password });
    expect(store.getSessionProfile(first.token)).not.toBeNull();

    store.requestPasswordReset(VALID.email);
    const resetMail = mailer.latestFor(VALID.email, "reset")!;
    expect(resetMail.link).toContain("/reset-password?token=");
    store.resetPassword(new URL(resetMail.link).searchParams.get("token")!, "new-password-2");

    // Old session is dead; old password fails; new password works.
    expect(store.getSessionProfile(first.token)).toBeNull();
    expect(codeOf(() => store.login({ identifier: VALID.email, password: VALID.password }))).toBe("INVALID_CREDENTIALS");
    expect(store.login({ identifier: VALID.email, password: "new-password-2" }).token).toBeTruthy();
  });

  it("does NOT reveal whether an email exists on reset request (anti-enumeration)", () => {
    store.register(VALID);
    // Unknown address: no throw, no mail.
    expect(() => store.requestPasswordReset("stranger@nowhere.io")).not.toThrow();
    expect(mailer.latestFor("stranger@nowhere.io", "reset")).toBeUndefined();
    // Known address: a reset mail IS issued.
    store.requestPasswordReset(VALID.email);
    expect(mailer.latestFor(VALID.email, "reset")).toBeTruthy();
  });

  it("password reset confirms a still-unconfirmed account", () => {
    store.register(VALID); // never confirmed
    store.requestPasswordReset(VALID.email);
    const resetMail = mailer.latestFor(VALID.email, "reset")!;
    store.resetPassword(new URL(resetMail.link).searchParams.get("token")!, "reset-me-99");
    // Controlling the mailbox proves ownership → now signable-in.
    expect(store.login({ identifier: VALID.email, password: "reset-me-99" }).token).toBeTruthy();
  });
});

describe("AccountStore — admin", () => {
  function confirmedUser(store: AccountStore, over: Partial<typeof VALID> = {}) {
    const input = { ...VALID, ...over };
    const { profile, confirmation } = store.register(input);
    store.confirmEmail(tokenFromLink(confirmation));
    return profile;
  }

  it("auto-promotes the configured admin email on registration", () => {
    const store = new AccountStore({ adminEmail: "BOSS@erathia.io" });
    const boss = confirmedUser(store, { nickname: "Boss", email: "boss@erathia.io" });
    const player = confirmedUser(store, { nickname: "Grunt", email: "grunt@erathia.io" });
    expect(store.isAdmin(boss.id)).toBe(true);
    expect(store.isAdmin(player.id)).toBe(false); // control
  });

  it("promotes an existing account to admin by email", () => {
    const store = new AccountStore();
    const player = confirmedUser(store);
    expect(store.isAdmin(player.id)).toBe(false);
    expect(store.promoteToAdminByEmail("CAT@erathia.io")?.role).toBe("admin");
    expect(store.isAdmin(player.id)).toBe(true);
    expect(store.promoteToAdminByEmail("ghost@nowhere.io")).toBeNull();
  });

  it("bans an account: login refused, live sessions killed, unban restores", () => {
    const store = new AccountStore();
    const player = confirmedUser(store);
    const { token } = store.login({ identifier: VALID.email, password: VALID.password });
    expect(store.getSessionProfile(token)).not.toBeNull();

    store.banAccount(player.id, "griefing");
    expect(store.getSessionProfile(token)).toBeNull(); // session invalidated
    expect(codeOf(() => store.login({ identifier: VALID.email, password: VALID.password }))).toBe("ACCOUNT_BANNED");

    store.unbanAccount(player.id);
    expect(store.login({ identifier: VALID.email, password: VALID.password }).token).toBeTruthy();
  });

  it("deletes an account, freeing its nickname and email", () => {
    const store = new AccountStore();
    const player = confirmedUser(store);
    store.deleteAccount(player.id);
    expect(store.getProfileById(player.id)).toBeNull();
    // Nickname + email are free to reuse.
    expect(store.checkAvailability({ nickname: VALID.nickname }).nickname?.available).toBe(true);
    expect(store.checkAvailability({ email: VALID.email }).email?.available).toBe(true);
    expect(codeOf(() => store.deleteAccount(player.id))).toBe("NOT_FOUND");
  });
});

describe("AccountStore — Hall of Fame + match results", () => {
  function confirmedUser(store: AccountStore, over: Partial<typeof VALID>) {
    const input = { ...VALID, ...over };
    const { profile, confirmation } = store.register(input);
    store.confirmEmail(new URL(confirmation!.link).searchParams.get("token")!);
    return profile;
  }

  it("moves MMR/wins/losses to the exact expected numbers and reorders the Hall of Fame", () => {
    const store = new AccountStore();
    const a = confirmedUser(store, { nickname: "Alpha", email: "a@e.io" });
    const b = confirmedUser(store, { nickname: "Bravo", email: "b@e.io" });

    // Before: equal MMR, tie broken by nickname → Alpha first.
    expect(store.hallOfFame().map((p) => p.nickname)).toEqual(["Alpha", "Bravo"]);

    const result = store.recordMatchResult({
      matchId: "room1-seed",
      participants: [
        { accountId: b.id, result: "win" },
        { accountId: a.id, result: "loss" }
      ]
    });
    expect(result.applied).toBe(true);

    const alpha = store.getProfileById(a.id)!;
    const bravo = store.getProfileById(b.id)!;
    // Observable outcome (not just "a row moved"): exact Elo numbers.
    expect(bravo.mmr).toBe(1216);
    expect(alpha.mmr).toBe(1184);
    expect(bravo.wins).toBe(1);
    expect(alpha.losses).toBe(1);
    expect(bravo.matches).toBe(1);
    // The Hall of Fame ordering flipped: Bravo now outranks Alpha.
    expect(store.hallOfFame().map((p) => p.nickname)).toEqual(["Bravo", "Alpha"]);
  });

  it("is idempotent on matchId (a duplicate report changes nothing)", () => {
    const store = new AccountStore();
    const a = confirmedUser(store, { nickname: "Alpha", email: "a@e.io" });
    const b = confirmedUser(store, { nickname: "Bravo", email: "b@e.io" });
    const report = {
      matchId: "same-id",
      participants: [
        { accountId: b.id, result: "win" as const },
        { accountId: a.id, result: "loss" as const }
      ]
    };
    store.recordMatchResult(report);
    const mmrAfterFirst = store.getProfileById(b.id)!.mmr;
    const second = store.recordMatchResult(report);
    expect(second.applied).toBe(false);
    expect(store.getProfileById(b.id)!.mmr).toBe(mmrAfterFirst); // unchanged
    expect(store.getProfileById(b.id)!.matches).toBe(1); // not double-counted
  });

  it("excludes banned accounts from the Hall of Fame", () => {
    const store = new AccountStore();
    const a = confirmedUser(store, { nickname: "Alpha", email: "a@e.io" });
    confirmedUser(store, { nickname: "Bravo", email: "b@e.io" });
    store.banAccount(a.id);
    expect(store.hallOfFame().map((p) => p.nickname)).toEqual(["Bravo"]);
  });
});

describe("AccountStore — persistence round-trip", () => {
  it("restores accounts so a user can still sign in after reload", () => {
    const source = new AccountStore();
    const { confirmation } = source.register(VALID);
    source.confirmEmail(new URL(confirmation!.link).searchParams.get("token")!);

    const restored = new AccountStore();
    restored.loadJSON(JSON.parse(JSON.stringify(source.toJSON())));

    // Password hash survived → login works against the reloaded store.
    expect(restored.login({ identifier: VALID.email, password: VALID.password }).token).toBeTruthy();
    // Uniqueness indices rebuilt → the nickname is still taken.
    expect(restored.checkAvailability({ nickname: VALID.nickname }).nickname?.available).toBe(false);
  });
});

describe("AccountStore — ensureAdminAccount (env admin bootstrap)", () => {
  function makeStore() {
    return new AccountStore({ mailer: new CaptureMailer(), now: makeClock().now });
  }

  const ADMIN = { nickname: "Overlord", email: "boss@erathia.io", password: "dungeon12" };

  it("creates a CONFIRMED admin that can log in immediately (control: a normal register cannot)", () => {
    const store = makeStore();
    const profile = store.ensureAdminAccount(ADMIN);
    expect(profile.role).toBe("admin");
    expect(profile.emailConfirmed).toBe(true);
    // The seeded admin logs in straight away — no email round-trip.
    expect(store.login({ identifier: ADMIN.nickname, password: ADMIN.password }).token).toBeTruthy();

    // Control: an ordinary registration is NOT confirmed and cannot log in yet.
    store.register({ nickname: "Peasant", email: "p@erathia.io", password: "villager1" });
    expect(codeOf(() => store.login({ identifier: "Peasant", password: "villager1" }))).toBe("EMAIL_NOT_CONFIRMED");
  });

  it("promotes an EXISTING account (by email) to a confirmed admin, keeping its password", () => {
    const store = makeStore();
    store.register({ nickname: "Solmyr", email: ADMIN.email, password: "genielamp1" });
    // Before: a player, unconfirmed.
    expect(store.checkAvailability({ email: ADMIN.email }).email?.available).toBe(false);

    const profile = store.ensureAdminAccount({ ...ADMIN, nickname: "DifferentNick" });
    expect(profile.role).toBe("admin");
    expect(profile.emailConfirmed).toBe(true);
    // The OWNER's password is untouched (we never overwrite it), and now works.
    expect(store.login({ identifier: ADMIN.email, password: "genielamp1" }).token).toBeTruthy();
  });

  it("is idempotent — a second call promotes the same single account, no duplicate", () => {
    const store = makeStore();
    const first = store.ensureAdminAccount(ADMIN);
    const again = store.ensureAdminAccount(ADMIN);
    expect(again.id).toBe(first.id);
    expect(store.adminListAccounts().filter((a) => a.role === "admin")).toHaveLength(1);
  });

  it("un-bans and re-confirms a matched account so a banned admin can return", () => {
    const store = makeStore();
    const created = store.ensureAdminAccount(ADMIN);
    store.banAccount(created.id, "mistake");
    expect(store.getProfileById(created.id)?.bannedAt).toBeTruthy();
    // Re-running the bootstrap clears the ban and keeps admin.
    const restored = store.ensureAdminAccount(ADMIN);
    expect(restored.bannedAt).toBeUndefined();
    expect(restored.role).toBe("admin");
  });
});

describe("AccountStore — email link origin (no need to preconfigure the URL)", () => {
  const clock = makeClock();

  it("uses the per-request origin when no baseUrl is configured", () => {
    const store = new AccountStore({ mailer: new CaptureMailer(), now: clock.now }); // no baseUrl
    const { confirmation } = store.register(
      { nickname: "Vercel", email: "v@erathia.io", password: "deploys11" },
      "https://my-heroes-app.vercel.app"
    );
    expect(confirmation!.link).toBe(
      `https://my-heroes-app.vercel.app/api/auth/confirm?${confirmation!.link.split("?")[1]}`
    );
    expect(confirmation!.link).toContain("https://my-heroes-app.vercel.app/api/auth/confirm?token=");
    expect(confirmation!.link).not.toContain("localhost");
  });

  it("a configured baseUrl wins over the request origin (canonical domain)", () => {
    const store = new AccountStore({ mailer: new CaptureMailer(), now: clock.now, baseUrl: "https://heroes.example" });
    const { confirmation } = store.register(
      { nickname: "Canon", email: "c@erathia.io", password: "canonical1" },
      "https://preview-123.vercel.app"
    );
    expect(confirmation!.link).toContain("https://heroes.example/api/auth/confirm?token=");
    expect(confirmation!.link).not.toContain("vercel.app");
  });

  it("password reset links honour the request origin too", () => {
    const mailer = new CaptureMailer();
    const store = new AccountStore({ mailer, now: clock.now }); // no baseUrl
    store.register({ nickname: "Reset", email: "r@erathia.io", password: "resets-99" }, "https://app.example.net");
    store.requestPasswordReset("r@erathia.io", "https://app.example.net");
    const reset = mailer.latestFor("r@erathia.io", "reset")!;
    expect(reset.link).toContain("https://app.example.net/reset-password?token=");
  });

  it("falls back to localhost only when neither a baseUrl nor an origin is available", () => {
    const store = new AccountStore({ mailer: new CaptureMailer(), now: clock.now }); // no baseUrl, no origin
    const { confirmation } = store.register({ nickname: "Local", email: "l@erathia.io", password: "devmode11" });
    expect(confirmation!.link).toContain("http://localhost:3000/api/auth/confirm?token=");
  });
});

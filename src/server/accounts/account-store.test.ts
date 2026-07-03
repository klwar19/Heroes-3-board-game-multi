import { beforeEach, describe, expect, it } from "vitest";
import { AccountStore } from "./account-store";
import { CaptureMailer, type OutboundMail } from "./mailer";
import { AccountError } from "./types";

// A controllable clock so token/session expiry is exercised deterministically.
function makeClock(start = 1_700_000_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

function tokenFromLink(mail: OutboundMail): string {
  return new URL(mail.link).searchParams.get("token")!;
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
    expect(confirmation.kind).toBe("confirm");
    expect(confirmation.link).toContain("https://erathia.example/api/auth/confirm?token=");
    expect(confirmation.text).toContain(confirmation.link);
  });

  it("distinguishes 'nickname taken' from 'email already registered'", () => {
    store.register(VALID);
    expect(codeOf(() => store.register({ ...VALID, email: "other@erathia.io" }))).toBe("NICKNAME_TAKEN");
    expect(codeOf(() => store.register({ ...VALID, nickname: "Gem" }))).toBe("EMAIL_TAKEN");
    // Case-insensitive on both keys.
    expect(codeOf(() => store.register({ ...VALID, nickname: "catherine", email: "x@y.io" }))).toBe("NICKNAME_TAKEN");
    expect(codeOf(() => store.register({ ...VALID, nickname: "Gem", email: "CAT@ERATHIA.IO" }))).toBe("EMAIL_TAKEN");
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
    store.confirmEmail(new URL(confirmation.link).searchParams.get("token")!);
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
    store.confirmEmail(new URL(confirmation.link).searchParams.get("token")!);
    const { token } = store.login({ identifier: VALID.email, password: VALID.password });
    expect(store.getSessionProfile(token)).not.toBeNull();
    clock.advance(1001);
    expect(store.getSessionProfile(token)).toBeNull();
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
    store.confirmEmail(new URL(confirmation.link).searchParams.get("token")!);
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
    source.confirmEmail(new URL(confirmation.link).searchParams.get("token")!);

    const restored = new AccountStore();
    restored.loadJSON(JSON.parse(JSON.stringify(source.toJSON())));

    // Password hash survived → login works against the reloaded store.
    expect(restored.login({ identifier: VALID.email, password: VALID.password }).token).toBeTruthy();
    // Uniqueness indices rebuilt → the nickname is still taken.
    expect(restored.checkAvailability({ nickname: VALID.nickname }).nickname?.available).toBe(false);
  });
});

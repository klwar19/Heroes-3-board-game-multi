/**
 * AccountStore — the self-hosted account backend (register / confirm / login /
 * reset / profile / admin / ratings). In-memory indices with the same optional
 * disk persistence the room store uses, behind a narrow method surface so a
 * Supabase/Postgres adapter can replace it later (plan §D1) without the API
 * routes or UI changing.
 *
 * Design choices that make it testable to the CLAUDE.md bar:
 *  - `now()` is injectable, so token/session expiry is exercised deterministically.
 *  - The `Mailer` is injectable, so the confirmation/reset LINK is observable —
 *    the mail flow is proven end-to-end (register → read link → confirm), not
 *    just "a token row was written".
 *  - All security-sensitive maths lives in crypto.ts / elo.ts (their own tests).
 */
import {
  generateAccountId,
  generateToken,
  hashPassword,
  hashToken,
  verifyPassword
} from "./crypto";
import { computeRatings, ELO_START, type EloParticipant } from "./elo";
import {
  buildConfirmMail,
  buildResetMail,
  CaptureMailer,
  type Mailer,
  type OutboundMail
} from "./mailer";
import {
  AccountError,
  toProfile,
  toSelfProfile,
  type AccountProfile,
  type AccountRecord,
  type AccountRole,
  type EmailToken,
  type SelfProfile,
  type SessionRecord
} from "./types";
import { normalizeEmail, normalizeNicknameKey, validateContact, validateEmail, validateNickname, validatePassword } from "./validation";

export type AccountStoreOptions = {
  /** Injectable clock (epoch ms). Defaults to Date.now. */
  now?: () => number;
  /** Mail transport. Defaults to an in-memory CaptureMailer. */
  mailer?: Mailer;
  /** Absolute origin used to build email links. */
  baseUrl?: string;
  /** Session lifetime (ms). Default 30 days. */
  sessionTtlMs?: number;
  /** Email token (confirm/reset) lifetime (ms). Default 24h. */
  tokenTtlMs?: number;
  /** Registering with this email (case-insensitive) is auto-promoted to admin. */
  adminEmail?: string;
  /** Minimum gap between confirmation resends per email (ms). Default 60s. */
  resendCooldownMs?: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

type RateWindow = { count: number; resetAt: number };

export type MatchParticipantInput = {
  accountId: string;
  result: "win" | "loss" | "draw" | "abandon";
};

export type RecordMatchResult = {
  matchId: string;
  /** False when the matchId was already recorded (idempotent no-op). */
  applied: boolean;
  changes: { accountId: string; mmrBefore: number; mmrAfter: number }[];
};

export class AccountStore {
  private readonly accounts = new Map<string, AccountRecord>();
  private readonly byNickname = new Map<string, string>();
  private readonly byEmail = new Map<string, string>();
  private readonly tokens = new Map<string, EmailToken>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly recordedMatches = new Set<string>();
  private readonly rateWindows = new Map<string, RateWindow>();
  private readonly lastResendAt = new Map<string, number>();

  private readonly now: () => number;
  private readonly mailer: Mailer;
  private readonly baseUrl: string;
  private readonly sessionTtlMs: number;
  private readonly tokenTtlMs: number;
  private readonly adminEmail: string | undefined;
  private readonly resendCooldownMs: number;

  constructor(options: AccountStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.mailer = options.mailer ?? new CaptureMailer();
    this.baseUrl = (options.baseUrl ?? "http://localhost:3000").replace(/\/+$/, "");
    this.sessionTtlMs = options.sessionTtlMs ?? 30 * DAY_MS;
    this.tokenTtlMs = options.tokenTtlMs ?? DAY_MS;
    this.adminEmail = options.adminEmail ? normalizeEmail(options.adminEmail) : undefined;
    this.resendCooldownMs = options.resendCooldownMs ?? 60_000;
  }

  /** Exposed only so dev/tests can read the captured outbox when using CaptureMailer. */
  get outbox(): readonly OutboundMail[] {
    return this.mailer instanceof CaptureMailer ? this.mailer.outbox : [];
  }

  // -------------------------------------------------------------------------
  // Registration + email confirmation (mail linking)
  // -------------------------------------------------------------------------

  /**
   * Create an account (unconfirmed) and email a confirmation link. Enforces the
   * two distinct uniqueness errors the owner requires. Does NOT log the user in
   * — they confirm first (`confirmEmail`).
   */
  register(input: { nickname: unknown; email: unknown; password: unknown; contact?: unknown }): {
    profile: SelfProfile;
    /** The confirmation mail just sent (link is `.link`). */
    confirmation: OutboundMail;
  } {
    const nickname = validateNickname(input.nickname);
    const email = validateEmail(input.email);
    const password = validatePassword(input.password);
    const contact = validateContact(input.contact);

    const nicknameKey = normalizeNicknameKey(nickname);
    if (this.byNickname.has(nicknameKey)) {
      throw new AccountError("NICKNAME_TAKEN", "That nickname is already taken.");
    }
    if (this.byEmail.has(email)) {
      throw new AccountError("EMAIL_TAKEN", "That email is already registered.");
    }

    const id = generateAccountId();
    const record: AccountRecord = {
      id,
      nickname,
      nicknameKey,
      email,
      passwordHash: hashPassword(password),
      role: this.adminEmail && email === this.adminEmail ? "admin" : "player",
      contact,
      mmr: ELO_START,
      wins: 0,
      losses: 0,
      matches: 0,
      createdAt: new Date(this.now()).toISOString(),
      emailConfirmed: false
    };
    this.accounts.set(id, record);
    this.byNickname.set(nicknameKey, id);
    this.byEmail.set(email, id);

    const confirmation = this.issueEmail(record, "confirm");
    return { profile: toSelfProfile(record), confirmation };
  }

  /** Confirm an account via its emailed token. Consumes the token. */
  confirmEmail(rawToken: string): { profile: SelfProfile } {
    const token = this.consumeToken(rawToken, "confirm");
    const record = this.accounts.get(token.accountId);
    if (!record) {
      throw new AccountError("TOKEN_INVALID", "This confirmation link is no longer valid.");
    }
    record.emailConfirmed = true;
    return { profile: toSelfProfile(record) };
  }

  /**
   * Re-send a confirmation link (cooldown-limited). Silent no-op when the email
   * is unknown or already confirmed — so this cannot be used to probe which
   * addresses exist or are confirmed.
   */
  resendConfirmation(rawEmail: unknown): void {
    let email: string;
    try {
      email = validateEmail(rawEmail);
    } catch {
      return;
    }
    const id = this.byEmail.get(email);
    if (!id) {
      return;
    }
    const record = this.accounts.get(id);
    if (!record || record.emailConfirmed) {
      return;
    }
    const last = this.lastResendAt.get(email) ?? 0;
    const nowMs = this.now();
    if (nowMs - last < this.resendCooldownMs) {
      throw new AccountError(
        "RATE_LIMITED",
        "Please wait before requesting another confirmation email.",
        Math.ceil((this.resendCooldownMs - (nowMs - last)) / 1000)
      );
    }
    // issueEmail stamps lastResendAt (see below), so the cooldown window covers
    // the mail sent at registration too — not just resend-to-resend.
    this.issueEmail(record, "confirm");
  }

  // -------------------------------------------------------------------------
  // Availability (owner requires distinct "nickname taken" / "email registered")
  // -------------------------------------------------------------------------

  checkAvailability(input: { nickname?: unknown; email?: unknown }): {
    nickname?: { available: boolean; reason?: string };
    email?: { available: boolean };
  } {
    const out: { nickname?: { available: boolean; reason?: string }; email?: { available: boolean } } = {};
    if (input.nickname != null && input.nickname !== "") {
      try {
        const nickname = validateNickname(input.nickname);
        out.nickname = { available: !this.byNickname.has(normalizeNicknameKey(nickname)) };
      } catch (error) {
        out.nickname = { available: false, reason: error instanceof AccountError ? error.message : "Invalid nickname." };
      }
    }
    if (input.email != null && input.email !== "") {
      try {
        const email = validateEmail(input.email);
        out.email = { available: !this.byEmail.has(email) };
      } catch {
        out.email = { available: false };
      }
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Login / sessions
  // -------------------------------------------------------------------------

  /**
   * Authenticate by nickname OR email + password. Rate-limited per identifier.
   * Requires a confirmed, non-banned account. Returns the raw session token
   * (goes into the cookie) and the owner's profile.
   */
  login(input: { identifier: unknown; password: unknown }): { token: string; profile: SelfProfile } {
    const identifier = typeof input.identifier === "string" ? input.identifier.trim() : "";
    const password = typeof input.password === "string" ? input.password : "";
    if (!identifier || !password) {
      throw new AccountError("INVALID_CREDENTIALS", "Enter your nickname/email and password.");
    }
    this.enforceRate(`login:${identifier.toLowerCase()}`, 10, 5 * 60_000);

    const record = this.findByIdentifier(identifier);
    // Always run a verify to keep timing similar whether or not the account
    // exists (a tiny anti-enumeration measure on the login path).
    const ok = record ? verifyPassword(password, record.passwordHash) : verifyPassword(password, DUMMY_HASH);
    if (!record || !ok) {
      throw new AccountError("INVALID_CREDENTIALS", "Invalid nickname/email or password.");
    }
    if (record.bannedAt) {
      throw new AccountError("ACCOUNT_BANNED", record.banReason ? `Account banned: ${record.banReason}` : "This account is banned.");
    }
    if (!record.emailConfirmed) {
      throw new AccountError("EMAIL_NOT_CONFIRMED", "Confirm your email before signing in — check your inbox.");
    }
    const token = this.createSession(record.id);
    return { token, profile: toSelfProfile(record) };
  }

  /** Resolve a raw session token to the owner's profile, or null. Slides expiry. */
  getSessionProfile(rawToken: string | undefined | null): SelfProfile | null {
    const record = this.resolveSession(rawToken);
    return record ? toSelfProfile(record) : null;
  }

  /** Resolve a raw session token to the internal account record, or null. */
  private resolveSession(rawToken: string | undefined | null): AccountRecord | null {
    if (!rawToken) {
      return null;
    }
    const digest = hashToken(rawToken);
    const session = this.sessions.get(digest);
    if (!session) {
      return null;
    }
    if (session.expiresAt <= this.now()) {
      this.sessions.delete(digest);
      return null;
    }
    const record = this.accounts.get(session.accountId);
    if (!record || record.bannedAt) {
      // A banned or deleted account's live sessions stop working immediately.
      this.sessions.delete(digest);
      return null;
    }
    return record;
  }

  logout(rawToken: string | undefined | null): void {
    if (!rawToken) {
      return;
    }
    this.sessions.delete(hashToken(rawToken));
  }

  // -------------------------------------------------------------------------
  // Password reset (mail linking, second flow)
  // -------------------------------------------------------------------------

  /**
   * Email a reset link. Always succeeds from the caller's view (no account
   * enumeration): a token+mail is issued ONLY if the address exists, but the
   * response is identical either way.
   */
  requestPasswordReset(rawEmail: unknown): void {
    let email: string;
    try {
      email = validateEmail(rawEmail);
    } catch {
      return;
    }
    const id = this.byEmail.get(email);
    if (!id) {
      return;
    }
    const record = this.accounts.get(id);
    if (!record) {
      return;
    }
    this.issueEmail(record, "reset");
  }

  /** Set a new password via a reset token; consumes it and revokes all sessions. */
  resetPassword(rawToken: string, newPassword: unknown): { profile: SelfProfile } {
    const password = validatePassword(newPassword);
    const token = this.consumeToken(rawToken, "reset");
    const record = this.accounts.get(token.accountId);
    if (!record) {
      throw new AccountError("TOKEN_INVALID", "This reset link is no longer valid.");
    }
    record.passwordHash = hashPassword(password);
    // A reset implies the address is controlled → also confirm it if pending,
    // and kill every existing session (a stolen session must not survive a reset).
    record.emailConfirmed = true;
    this.revokeAllSessions(record.id);
    return { profile: toSelfProfile(record) };
  }

  // -------------------------------------------------------------------------
  // Profile
  // -------------------------------------------------------------------------

  updateContact(accountId: string, rawContact: unknown): SelfProfile {
    const record = this.requireAccount(accountId);
    record.contact = validateContact(rawContact);
    return toSelfProfile(record);
  }

  getProfileById(accountId: string): AccountProfile | null {
    const record = this.accounts.get(accountId);
    return record ? toProfile(record) : null;
  }

  // -------------------------------------------------------------------------
  // Admin
  // -------------------------------------------------------------------------

  isAdmin(accountId: string): boolean {
    return this.accounts.get(accountId)?.role === "admin";
  }

  /** Admin/self email-inclusive listing (never exposes hashes or tokens). */
  adminListAccounts(): SelfProfile[] {
    return [...this.accounts.values()]
      .sort((a, b) => a.nickname.localeCompare(b.nickname))
      .map(toSelfProfile);
  }

  setRole(accountId: string, role: AccountRole): AccountProfile {
    const record = this.requireAccount(accountId);
    record.role = role;
    return toProfile(record);
  }

  /** Promote by email — used by the seed-admin script and env bootstrap. */
  promoteToAdminByEmail(rawEmail: string): AccountProfile | null {
    const email = normalizeEmail(rawEmail);
    const id = this.byEmail.get(email);
    if (!id) {
      return null;
    }
    return this.setRole(id, "admin");
  }

  /**
   * Idempotently ensure a CONFIRMED admin account exists (env-driven bootstrap;
   * the credentials come from the deployment environment, never the repo). If an
   * account already matches the email or nickname it is promoted to a confirmed,
   * un-banned admin with its password left untouched (the owner's); otherwise a
   * fresh confirmed admin is created directly (no email round-trip — it is
   * server-seeded). Safe to call on every boot. Throws AccountError only on a
   * genuinely invalid nickname/email/password, which the caller catches so the
   * app still runs without the bootstrap.
   */
  ensureAdminAccount(input: { nickname: unknown; email: unknown; password: unknown }): AccountProfile {
    const email = validateEmail(input.email);
    const nickname = validateNickname(input.nickname);
    const nicknameKey = normalizeNicknameKey(nickname);

    const existingId = this.byEmail.get(email) ?? this.byNickname.get(nicknameKey);
    if (existingId) {
      const record = this.requireAccount(existingId);
      record.role = "admin";
      record.emailConfirmed = true;
      delete record.bannedAt;
      delete record.banReason;
      return toProfile(record);
    }

    const password = validatePassword(input.password);
    const id = generateAccountId();
    const record: AccountRecord = {
      id,
      nickname,
      nicknameKey,
      email,
      passwordHash: hashPassword(password),
      role: "admin",
      contact: {},
      mmr: ELO_START,
      wins: 0,
      losses: 0,
      matches: 0,
      createdAt: new Date(this.now()).toISOString(),
      emailConfirmed: true
    };
    this.accounts.set(id, record);
    this.byNickname.set(nicknameKey, id);
    this.byEmail.set(email, id);
    return toProfile(record);
  }

  banAccount(accountId: string, reason?: string): AccountProfile {
    const record = this.requireAccount(accountId);
    record.bannedAt = new Date(this.now()).toISOString();
    record.banReason = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 200) : undefined;
    this.revokeAllSessions(accountId);
    return toProfile(record);
  }

  unbanAccount(accountId: string): AccountProfile {
    const record = this.requireAccount(accountId);
    delete record.bannedAt;
    delete record.banReason;
    return toProfile(record);
  }

  deleteAccount(accountId: string): void {
    const record = this.accounts.get(accountId);
    if (!record) {
      throw new AccountError("NOT_FOUND", "No such account.");
    }
    this.accounts.delete(accountId);
    this.byNickname.delete(record.nicknameKey);
    this.byEmail.delete(record.email);
    this.revokeAllSessions(accountId);
    for (const [digest, token] of this.tokens) {
      if (token.accountId === accountId) {
        this.tokens.delete(digest);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Hall of Fame + match results (rating groundwork; auto-report is Phase 6)
  // -------------------------------------------------------------------------

  hallOfFame(): AccountProfile[] {
    return [...this.accounts.values()]
      .filter((r) => !r.bannedAt)
      .map(toProfile)
      .sort((a, b) => b.mmr - a.mmr || b.wins - a.wins || a.nickname.localeCompare(b.nickname));
  }

  /**
   * Apply a finished match's ratings idempotently (same matchId → no-op).
   * Winner-takes-field Elo (elo.ts). Abandon counts as a loss for the leaver;
   * draws leave MMR unchanged but still count as a match played.
   */
  recordMatchResult(input: { matchId: string; participants: MatchParticipantInput[] }): RecordMatchResult {
    if (this.recordedMatches.has(input.matchId)) {
      return { matchId: input.matchId, applied: false, changes: [] };
    }
    const eloInputs: EloParticipant[] = [];
    for (const p of input.participants) {
      const record = this.accounts.get(p.accountId);
      if (!record) {
        continue;
      }
      if (p.result === "win") {
        eloInputs.push({ id: p.accountId, rating: record.mmr, result: "win" });
      } else if (p.result === "loss" || p.result === "abandon") {
        eloInputs.push({ id: p.accountId, rating: record.mmr, result: "loss" });
      }
      // draws contribute no rating pairing.
    }
    const ratings = computeRatings(eloInputs);
    const changes: RecordMatchResult["changes"] = [];
    for (const p of input.participants) {
      const record = this.accounts.get(p.accountId);
      if (!record) {
        continue;
      }
      const before = record.mmr;
      const after = ratings.get(p.accountId) ?? before;
      record.mmr = after;
      record.matches += 1;
      if (p.result === "win") {
        record.wins += 1;
      } else if (p.result === "loss" || p.result === "abandon") {
        record.losses += 1;
      }
      changes.push({ accountId: p.accountId, mmrBefore: before, mmrAfter: after });
    }
    this.recordedMatches.add(input.matchId);
    return { matchId: input.matchId, applied: true, changes };
  }

  // -------------------------------------------------------------------------
  // Persistence (mirrors game-room-store: serialize maps, rebuild indices)
  // -------------------------------------------------------------------------

  toJSON(): AccountStoreSnapshot {
    return {
      version: 1,
      accounts: [...this.accounts.values()],
      tokens: [...this.tokens.values()],
      sessions: [...this.sessions.values()],
      recordedMatches: [...this.recordedMatches]
    };
  }

  loadJSON(snapshot: AccountStoreSnapshot | null | undefined): void {
    if (!snapshot || snapshot.version !== 1) {
      return;
    }
    this.accounts.clear();
    this.byNickname.clear();
    this.byEmail.clear();
    this.tokens.clear();
    this.sessions.clear();
    this.recordedMatches.clear();
    for (const record of snapshot.accounts) {
      this.accounts.set(record.id, record);
      this.byNickname.set(record.nicknameKey, record.id);
      this.byEmail.set(record.email, record.id);
    }
    for (const token of snapshot.tokens) {
      this.tokens.set(token.digest, token);
    }
    for (const session of snapshot.sessions) {
      this.sessions.set(session.digest, session);
    }
    for (const matchId of snapshot.recordedMatches ?? []) {
      this.recordedMatches.add(matchId);
    }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private issueEmail(record: AccountRecord, purpose: "confirm" | "reset"): OutboundMail {
    const raw = generateToken();
    const nowMs = this.now();
    // A fresh token supersedes any prior one of the same purpose for this account.
    for (const [digest, token] of this.tokens) {
      if (token.accountId === record.id && token.purpose === purpose) {
        this.tokens.delete(digest);
      }
    }
    this.tokens.set(hashToken(raw), {
      digest: hashToken(raw),
      accountId: record.id,
      purpose,
      createdAt: nowMs,
      expiresAt: nowMs + this.tokenTtlMs
    });
    if (purpose === "confirm") {
      // Drives the resend cooldown (register's mail counts as the first send).
      this.lastResendAt.set(record.email, nowMs);
    }
    const link =
      purpose === "confirm"
        ? `${this.baseUrl}/api/auth/confirm?token=${encodeURIComponent(raw)}`
        : `${this.baseUrl}/reset-password?token=${encodeURIComponent(raw)}`;
    const mail = purpose === "confirm" ? buildConfirmMail(record.email, link, nowMs) : buildResetMail(record.email, link, nowMs);
    void this.mailer.sendMail(mail);
    return mail;
  }

  private consumeToken(rawToken: string, purpose: "confirm" | "reset"): EmailToken {
    if (typeof rawToken !== "string" || !rawToken) {
      throw new AccountError("TOKEN_INVALID", "This link is invalid.");
    }
    const digest = hashToken(rawToken);
    const token = this.tokens.get(digest);
    if (!token || token.purpose !== purpose) {
      throw new AccountError("TOKEN_INVALID", "This link is invalid or has already been used.");
    }
    if (token.expiresAt <= this.now()) {
      this.tokens.delete(digest);
      throw new AccountError("TOKEN_EXPIRED", "This link has expired — request a new one.");
    }
    this.tokens.delete(digest);
    return token;
  }

  private createSession(accountId: string): string {
    const raw = generateToken();
    const nowMs = this.now();
    this.sessions.set(hashToken(raw), {
      digest: hashToken(raw),
      accountId,
      createdAt: nowMs,
      expiresAt: nowMs + this.sessionTtlMs
    });
    return raw;
  }

  private revokeAllSessions(accountId: string): void {
    for (const [digest, session] of this.sessions) {
      if (session.accountId === accountId) {
        this.sessions.delete(digest);
      }
    }
  }

  private findByIdentifier(identifier: string): AccountRecord | undefined {
    const asEmail = identifier.includes("@") ? this.byEmail.get(normalizeEmail(identifier)) : undefined;
    const asNick = this.byNickname.get(normalizeNicknameKey(identifier));
    const id = asEmail ?? asNick;
    return id ? this.accounts.get(id) : undefined;
  }

  private requireAccount(accountId: string): AccountRecord {
    const record = this.accounts.get(accountId);
    if (!record) {
      throw new AccountError("NOT_FOUND", "No such account.");
    }
    return record;
  }

  private enforceRate(key: string, limit: number, windowMs: number): void {
    const nowMs = this.now();
    const window = this.rateWindows.get(key);
    if (!window || window.resetAt <= nowMs) {
      this.rateWindows.set(key, { count: 1, resetAt: nowMs + windowMs });
      return;
    }
    if (window.count >= limit) {
      throw new AccountError("RATE_LIMITED", "Too many attempts — please wait a moment.", Math.ceil((window.resetAt - nowMs) / 1000));
    }
    window.count += 1;
  }
}

export type AccountStoreSnapshot = {
  version: 1;
  accounts: AccountRecord[];
  tokens: EmailToken[];
  sessions: SessionRecord[];
  recordedMatches?: string[];
};

// A fixed scrypt hash of a random string, used to spend comparable CPU on a
// login attempt for a non-existent account (see login()). Its plaintext is
// unknown, so it never matches.
const DUMMY_HASH = hashPassword(generateToken());

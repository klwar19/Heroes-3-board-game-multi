/**
 * SupabaseAccountStore — the production account backend on Supabase Postgres
 * (plan §D1), implementing the same `AccountBackend` surface as the built-in
 * `AccountStore` but with every account, session, socket ticket, email token
 * and match result a REAL table row behind PostgREST:
 *
 *  - registrations survive restarts and serverless cold starts (the bug the
 *    file-backed store has on multi-instance hosts: an account written by one
 *    lambda was invisible to another);
 *  - sessions and socket tickets are shared across instances, so a login on
 *    one instance is valid everywhere (including the PartyKit verify-token
 *    callback, which may hit ANY instance);
 *  - uniqueness (nickname/email) is enforced by Postgres unique indexes, so
 *    two concurrent registrations can never both win;
 *  - match idempotency rides the `match_id` primary key via
 *    insert-ignore-duplicates, so a double-reported game applies once.
 *
 * All the validation, hashing, token, Elo and mail-composition logic is the
 * SAME code the built-in store runs (validation.ts / crypto.ts / elo.ts /
 * mailer.ts) — only persistence differs. Per-identifier login rate limiting
 * and the resend cooldown are cross-instance where it matters (cooldown via
 * the `last_confirm_sent_at` column); the login attempt counter is in-memory
 * per instance (a best-effort brake, backed up by scrypt cost).
 *
 * Schema: supabase/schema.sql (run it once in the Supabase SQL editor).
 */
import type { AccountBackend, RegisterOutcome } from "./backend";
import { computeRatings, ELO_START, type EloParticipant } from "./elo";
import { isLadderExemptNickname, LADDER_EXEMPT_NICKNAME_COUNT } from "./ladder-policy";
import { HALL_OF_FAME_ORDER_CLAUSE } from "./leaderboard-order";
import type { MatchParticipantInput, RecordMatchResult } from "./account-store";
import {
  claimRowId,
  claimRowsLikePattern,
  matchClaimFingerprint,
  type MatchClaimOutcome
} from "@/server/match-claim";
import {
  generateAccountId,
  generateToken,
  hashPassword,
  hashToken,
  verifyPassword
} from "./crypto";
import {
  buildAccountActionLink,
  buildConfirmMail,
  buildResetMail,
  type Mailer,
  type OutboundMail
} from "./mailer";
import { PostgrestClient, PostgrestError } from "./postgrest";
import {
  AccountError,
  toProfile,
  toSelfProfile,
  type AccountContact,
  type AccountProfile,
  type AccountRecord,
  type AccountRole,
  type SelfProfile
} from "./types";
import {
  normalizeEmail,
  normalizeNicknameKey,
  validateContact,
  validateEmail,
  validateNickname,
  validatePassword
} from "./validation";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Table names (one Supabase project can host other apps — keep them prefixed). */
export const ACCOUNTS_TABLE = "homm3bg_accounts";
export const SESSIONS_TABLE = "homm3bg_sessions";
export const TOKENS_TABLE = "homm3bg_email_tokens";
export const MATCHES_TABLE = "homm3bg_matches";

type AccountRow = {
  id: string;
  nickname: string;
  nickname_key: string;
  email: string;
  password_hash: string;
  role: AccountRole;
  contact: AccountContact | null;
  mmr: number;
  wins: number;
  losses: number;
  matches: number;
  created_at: string;
  email_confirmed: boolean;
  banned_at: string | null;
  ban_reason: string | null;
  /** Epoch ms of the last confirmation mail (resend cooldown, cross-instance). */
  last_confirm_sent_at: number | null;
};

type SessionRow = {
  digest: string;
  account_id: string;
  /** "session" (30d, sliding) or "ticket" (short-lived socket ticket). */
  kind: "session" | "ticket";
  created_at: number;
  expires_at: number;
};

type TokenRow = {
  digest: string;
  account_id: string;
  purpose: "confirm" | "reset";
  created_at: number;
  expires_at: number;
};

function rowToRecord(row: AccountRow): AccountRecord {
  return {
    id: row.id,
    nickname: row.nickname,
    nicknameKey: row.nickname_key,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    contact: row.contact ?? {},
    mmr: row.mmr,
    wins: row.wins,
    losses: row.losses,
    matches: row.matches,
    createdAt: row.created_at,
    emailConfirmed: row.email_confirmed,
    ...(row.banned_at ? { bannedAt: row.banned_at } : {}),
    ...(row.ban_reason ? { banReason: row.ban_reason } : {})
  };
}

export type SupabaseAccountStoreOptions = {
  /** Supabase project URL, e.g. https://<project>.supabase.co */
  url: string;
  /** The SERVICE-ROLE key (server-only secret; bypasses row-level security). */
  serviceRoleKey: string;
  mailer: Mailer;
  /** Injectable clock (epoch ms). Defaults to Date.now. */
  now?: () => number;
  /** Injectable fetch (tests drive a fake PostgREST). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  adminEmail?: string;
  autoConfirmNewAccounts?: boolean;
  sessionTtlMs?: number;
  socketTicketTtlMs?: number;
  tokenTtlMs?: number;
  resendCooldownMs?: number;
};

type RateWindow = { count: number; resetAt: number };

export class SupabaseAccountStore implements AccountBackend {
  private readonly db: PostgrestClient;
  private readonly mailer: Mailer;
  private readonly now: () => number;
  private readonly baseUrl: string | undefined;
  private readonly adminEmail: string | undefined;
  private readonly autoConfirmNewAccounts: boolean;
  private readonly sessionTtlMs: number;
  private readonly socketTicketTtlMs: number;
  private readonly tokenTtlMs: number;
  private readonly resendCooldownMs: number;
  /** Per-instance login attempt brake (same numbers as the built-in store). */
  private readonly rateWindows = new Map<string, RateWindow>();

  constructor(options: SupabaseAccountStoreOptions) {
    this.db = new PostgrestClient(options.url, options.serviceRoleKey, options.fetchImpl ?? fetch);
    this.mailer = options.mailer;
    this.now = options.now ?? Date.now;
    this.baseUrl = options.baseUrl ? options.baseUrl.replace(/\/+$/, "") : undefined;
    this.adminEmail = options.adminEmail ? normalizeEmail(options.adminEmail) : undefined;
    this.autoConfirmNewAccounts = options.autoConfirmNewAccounts ?? false;
    this.sessionTtlMs = options.sessionTtlMs ?? 30 * DAY_MS;
    this.socketTicketTtlMs = options.socketTicketTtlMs ?? 10 * 60_000;
    this.tokenTtlMs = options.tokenTtlMs ?? DAY_MS;
    this.resendCooldownMs = options.resendCooldownMs ?? 60_000;
  }

  get mailerDelivers(): boolean {
    return this.mailer.delivers;
  }

  // -------------------------------------------------------------------------
  // Registration + email confirmation
  // -------------------------------------------------------------------------

  async register(
    input: { nickname: unknown; email: unknown; password: unknown; contact?: unknown },
    origin?: string
  ): Promise<RegisterOutcome> {
    const nickname = validateNickname(input.nickname);
    const email = validateEmail(input.email);
    const password = validatePassword(input.password);
    const contact = validateContact(input.contact);
    const nicknameKey = normalizeNicknameKey(nickname);

    // Friendly pre-checks for the two distinct owner-required errors. The
    // unique indexes below remain the authority under a concurrent race.
    if (await this.nicknameExists(nicknameKey)) {
      throw new AccountError("NICKNAME_TAKEN", "That nickname is already taken.");
    }
    if (await this.emailExists(email)) {
      throw new AccountError("EMAIL_TAKEN", "That email is already registered.");
    }

    const nowMs = this.now();
    const row: AccountRow = {
      id: generateAccountId(),
      nickname,
      nickname_key: nicknameKey,
      email,
      password_hash: hashPassword(password),
      role: this.adminEmail && email === this.adminEmail ? "admin" : "player",
      contact,
      mmr: ELO_START,
      wins: 0,
      losses: 0,
      matches: 0,
      created_at: new Date(nowMs).toISOString(),
      email_confirmed: this.autoConfirmNewAccounts,
      banned_at: null,
      ban_reason: null,
      last_confirm_sent_at: null
    };
    try {
      await this.db.insert(ACCOUNTS_TABLE, row);
    } catch (error) {
      // Two registrations raced past the pre-checks: Postgres decided. Report
      // WHICH key lost so the player still gets the specific message.
      if (error instanceof PostgrestError && error.isUniqueViolation) {
        if (await this.emailExists(email)) {
          throw new AccountError("EMAIL_TAKEN", "That email is already registered.");
        }
        throw new AccountError("NICKNAME_TAKEN", "That nickname is already taken.");
      }
      throw error;
    }

    const record = rowToRecord(row);
    if (this.autoConfirmNewAccounts) {
      return { profile: toSelfProfile(record), needsConfirmation: false, confirmation: null };
    }
    const confirmation = await this.issueEmail(record, "confirm", origin);
    return { profile: toSelfProfile(record), needsConfirmation: true, confirmation };
  }

  async confirmEmail(rawToken: string): Promise<{ profile: SelfProfile }> {
    const token = await this.consumeToken(rawToken, "confirm");
    const updated = await this.db.update<AccountRow>(ACCOUNTS_TABLE, { email_confirmed: true }, { id: token.account_id });
    if (updated.length === 0) {
      throw new AccountError("TOKEN_INVALID", "This confirmation link is no longer valid.");
    }
    return { profile: toSelfProfile(rowToRecord(updated[0])) };
  }

  async resendConfirmation(rawEmail: unknown, origin?: string): Promise<void> {
    let email: string;
    try {
      email = validateEmail(rawEmail);
    } catch {
      return;
    }
    const account = await this.findByEmail(email);
    // Silent for unknown or already-confirmed addresses (no enumeration probe).
    if (!account || account.email_confirmed) {
      return;
    }
    const nowMs = this.now();
    const last = account.last_confirm_sent_at ?? 0;
    if (nowMs - last < this.resendCooldownMs) {
      throw new AccountError(
        "RATE_LIMITED",
        "Please wait before requesting another confirmation email.",
        Math.ceil((this.resendCooldownMs - (nowMs - last)) / 1000)
      );
    }
    await this.issueEmail(rowToRecord(account), "confirm", origin);
  }

  async checkAvailability(input: { nickname?: unknown; email?: unknown }): Promise<{
    nickname?: { available: boolean; reason?: string };
    email?: { available: boolean };
  }> {
    const out: { nickname?: { available: boolean; reason?: string }; email?: { available: boolean } } = {};
    if (input.nickname != null && input.nickname !== "") {
      try {
        const nickname = validateNickname(input.nickname);
        out.nickname = { available: !(await this.nicknameExists(normalizeNicknameKey(nickname))) };
      } catch (error) {
        out.nickname = { available: false, reason: error instanceof AccountError ? error.message : "Invalid nickname." };
      }
    }
    if (input.email != null && input.email !== "") {
      try {
        const email = validateEmail(input.email);
        out.email = { available: !(await this.emailExists(email)) };
      } catch {
        out.email = { available: false };
      }
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Login / sessions / socket tickets
  // -------------------------------------------------------------------------

  async login(input: { identifier: unknown; password: unknown }): Promise<{ token: string; profile: SelfProfile }> {
    const identifier = typeof input.identifier === "string" ? input.identifier.trim() : "";
    const password = typeof input.password === "string" ? input.password : "";
    if (!identifier || !password) {
      throw new AccountError("INVALID_CREDENTIALS", "Enter your nickname/email and password.");
    }
    this.enforceRate(`login:${identifier.toLowerCase()}`, 10, 5 * 60_000);

    const row = await this.findByIdentifier(identifier);
    // Constant-cost verify whether or not the account exists (anti-enumeration).
    const ok = row ? verifyPassword(password, row.password_hash) : verifyPassword(password, DUMMY_HASH);
    if (!row || !ok) {
      throw new AccountError("INVALID_CREDENTIALS", "Invalid nickname/email or password.");
    }
    if (row.banned_at) {
      throw new AccountError("ACCOUNT_BANNED", row.ban_reason ? `Account banned: ${row.ban_reason}` : "This account is banned.");
    }
    if (!row.email_confirmed) {
      throw new AccountError("EMAIL_NOT_CONFIRMED", "Confirm your email before signing in — check your inbox.");
    }
    const token = await this.createSession(row.id, "session", this.sessionTtlMs);
    // Opportunistic hygiene: each successful login sweeps expired rows so the
    // sessions/tokens tables stay bounded without a cron.
    void this.prune().catch(() => undefined);
    return { token, profile: toSelfProfile(rowToRecord(row)) };
  }

  async logout(rawToken: string | undefined | null): Promise<void> {
    if (!rawToken) {
      return;
    }
    await this.db.delete(SESSIONS_TABLE, { digest: hashToken(rawToken) });
  }

  async getSessionProfile(rawToken: string | undefined | null): Promise<SelfProfile | null> {
    const row = await this.resolveSession(rawToken);
    return row ? toSelfProfile(rowToRecord(row)) : null;
  }

  async mintSocketTicket(rawSessionToken: string | undefined | null): Promise<string | null> {
    const account = await this.resolveSession(rawSessionToken);
    if (!account) {
      return null;
    }
    return this.createSession(account.id, "ticket", this.socketTicketTtlMs);
  }

  async getVerifiedProfile(rawToken: string | undefined | null): Promise<SelfProfile | null> {
    return (await this.getSocketTicketProfile(rawToken)) ?? (await this.getSessionProfile(rawToken));
  }

  private async getSocketTicketProfile(rawTicket: string | undefined | null): Promise<SelfProfile | null> {
    if (!rawTicket) {
      return null;
    }
    const digest = hashToken(rawTicket);
    const tickets = await this.db.select<SessionRow>(SESSIONS_TABLE, { digest, kind: "ticket" });
    const ticket = tickets[0];
    if (!ticket) {
      return null;
    }
    if (ticket.expires_at <= this.now()) {
      await this.db.delete(SESSIONS_TABLE, { digest });
      return null;
    }
    const account = await this.findById(ticket.account_id);
    if (!account || account.banned_at) {
      await this.db.delete(SESSIONS_TABLE, { digest });
      return null;
    }
    return toSelfProfile(rowToRecord(account));
  }

  /** Resolve a session token to its live account row (sliding expiry), or null. */
  private async resolveSession(rawToken: string | undefined | null): Promise<AccountRow | null> {
    if (!rawToken) {
      return null;
    }
    const digest = hashToken(rawToken);
    const sessions = await this.db.select<SessionRow>(SESSIONS_TABLE, { digest, kind: "session" });
    const session = sessions[0];
    if (!session) {
      return null;
    }
    const nowMs = this.now();
    if (session.expires_at <= nowMs) {
      await this.db.delete(SESSIONS_TABLE, { digest });
      return null;
    }
    const account = await this.findById(session.account_id);
    if (!account || account.banned_at) {
      // A banned or deleted account's live sessions stop working immediately.
      await this.db.delete(SESSIONS_TABLE, { digest });
      return null;
    }
    // Sliding expiry, renewed only past the half-life (one write per ttl/2, not
    // per request) — same rule as the built-in store.
    if (session.expires_at - nowMs < this.sessionTtlMs / 2) {
      await this.db.update(SESSIONS_TABLE, { expires_at: nowMs + this.sessionTtlMs }, { digest });
    }
    return account;
  }

  private async createSession(accountId: string, kind: "session" | "ticket", ttlMs: number): Promise<string> {
    const raw = generateToken();
    const nowMs = this.now();
    const row: SessionRow = {
      digest: hashToken(raw),
      account_id: accountId,
      kind,
      created_at: nowMs,
      expires_at: nowMs + ttlMs
    };
    await this.db.insert(SESSIONS_TABLE, row);
    return raw;
  }

  // -------------------------------------------------------------------------
  // Password reset
  // -------------------------------------------------------------------------

  async requestPasswordReset(rawEmail: unknown, origin?: string): Promise<void> {
    let email: string;
    try {
      email = validateEmail(rawEmail);
    } catch {
      return;
    }
    const account = await this.findByEmail(email);
    if (!account) {
      return;
    }
    await this.issueEmail(rowToRecord(account), "reset", origin);
  }

  async resetPassword(rawToken: string, newPassword: unknown): Promise<{ profile: SelfProfile }> {
    const password = validatePassword(newPassword);
    const token = await this.consumeToken(rawToken, "reset");
    // A reset implies the address is controlled → also confirm it if pending.
    const updated = await this.db.update<AccountRow>(
      ACCOUNTS_TABLE,
      { password_hash: hashPassword(password), email_confirmed: true },
      { id: token.account_id }
    );
    if (updated.length === 0) {
      throw new AccountError("TOKEN_INVALID", "This reset link is no longer valid.");
    }
    // A stolen session must not survive a password reset (tickets included).
    await this.db.delete(SESSIONS_TABLE, { account_id: token.account_id });
    return { profile: toSelfProfile(rowToRecord(updated[0])) };
  }

  // -------------------------------------------------------------------------
  // Profile / admin
  // -------------------------------------------------------------------------

  async updateContact(accountId: string, rawContact: unknown): Promise<SelfProfile> {
    const contact = validateContact(rawContact);
    const updated = await this.db.update<AccountRow>(ACCOUNTS_TABLE, { contact }, { id: accountId });
    if (updated.length === 0) {
      throw new AccountError("NOT_FOUND", "No such account.");
    }
    return toSelfProfile(rowToRecord(updated[0]));
  }

  async getProfileById(accountId: string): Promise<AccountProfile | null> {
    const account = await this.findById(accountId);
    return account ? toProfile(rowToRecord(account)) : null;
  }

  /** Public profile by (case-insensitive) nickname — the /players page. */
  async getProfileByNickname(nickname: string): Promise<AccountProfile | null> {
    if (typeof nickname !== "string" || !nickname.trim()) {
      return null;
    }
    const row = await this.findByNicknameKey(normalizeNicknameKey(nickname));
    return row ? toProfile(rowToRecord(row)) : null;
  }

  async adminListAccounts(): Promise<SelfProfile[]> {
    const rows = await this.db.select<AccountRow>(ACCOUNTS_TABLE, {}, { order: "nickname.asc" });
    return rows.map((row) => toSelfProfile(rowToRecord(row)));
  }

  async setRole(accountId: string, role: AccountRole): Promise<AccountProfile> {
    const updated = await this.db.update<AccountRow>(ACCOUNTS_TABLE, { role }, { id: accountId });
    if (updated.length === 0) {
      throw new AccountError("NOT_FOUND", "No such account.");
    }
    return toProfile(rowToRecord(updated[0]));
  }

  async promoteToAdminByEmail(rawEmail: string): Promise<AccountProfile | null> {
    const email = normalizeEmail(rawEmail);
    const updated = await this.db.update<AccountRow>(ACCOUNTS_TABLE, { role: "admin" }, { email });
    return updated.length ? toProfile(rowToRecord(updated[0])) : null;
  }

  async ensureAdminAccount(input: { nickname: unknown; email: unknown; password: unknown }): Promise<AccountProfile> {
    const email = validateEmail(input.email);
    const nickname = validateNickname(input.nickname);
    const nicknameKey = normalizeNicknameKey(nickname);

    const existing = (await this.findByEmail(email)) ?? (await this.findByNicknameKey(nicknameKey));
    if (existing) {
      const updated = await this.db.update<AccountRow>(
        ACCOUNTS_TABLE,
        { role: "admin", email_confirmed: true, banned_at: null, ban_reason: null },
        { id: existing.id }
      );
      return toProfile(rowToRecord(updated[0] ?? existing));
    }

    const password = validatePassword(input.password);
    const nowMs = this.now();
    const row: AccountRow = {
      id: generateAccountId(),
      nickname,
      nickname_key: nicknameKey,
      email,
      password_hash: hashPassword(password),
      role: "admin",
      contact: {},
      mmr: ELO_START,
      wins: 0,
      losses: 0,
      matches: 0,
      created_at: new Date(nowMs).toISOString(),
      email_confirmed: true,
      banned_at: null,
      ban_reason: null,
      last_confirm_sent_at: null
    };
    try {
      await this.db.insert(ACCOUNTS_TABLE, row);
      return toProfile(rowToRecord(row));
    } catch (error) {
      if (error instanceof PostgrestError && error.isUniqueViolation) {
        // Raced a concurrent boot doing the same bootstrap — promote whichever
        // row won instead of failing the boot.
        const winner = (await this.findByEmail(email)) ?? (await this.findByNicknameKey(nicknameKey));
        if (winner) {
          const updated = await this.db.update<AccountRow>(
            ACCOUNTS_TABLE,
            { role: "admin", email_confirmed: true, banned_at: null, ban_reason: null },
            { id: winner.id }
          );
          return toProfile(rowToRecord(updated[0] ?? winner));
        }
      }
      throw error;
    }
  }

  async banAccount(accountId: string, reason?: string): Promise<AccountProfile> {
    const banReason = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 200) : null;
    const updated = await this.db.update<AccountRow>(
      ACCOUNTS_TABLE,
      { banned_at: new Date(this.now()).toISOString(), ban_reason: banReason },
      { id: accountId }
    );
    if (updated.length === 0) {
      throw new AccountError("NOT_FOUND", "No such account.");
    }
    // Kill every live session AND socket ticket immediately.
    await this.db.delete(SESSIONS_TABLE, { account_id: accountId });
    return toProfile(rowToRecord(updated[0]));
  }

  async unbanAccount(accountId: string): Promise<AccountProfile> {
    const updated = await this.db.update<AccountRow>(ACCOUNTS_TABLE, { banned_at: null, ban_reason: null }, { id: accountId });
    if (updated.length === 0) {
      throw new AccountError("NOT_FOUND", "No such account.");
    }
    return toProfile(rowToRecord(updated[0]));
  }

  async deleteAccount(accountId: string): Promise<void> {
    // Explicit child deletes first (works even without ON DELETE CASCADE).
    await this.db.delete(SESSIONS_TABLE, { account_id: accountId });
    await this.db.delete(TOKENS_TABLE, { account_id: accountId });
    const deleted = await this.db.delete<AccountRow>(ACCOUNTS_TABLE, { id: accountId });
    if (deleted.length === 0) {
      throw new AccountError("NOT_FOUND", "No such account.");
    }
  }

  // -------------------------------------------------------------------------
  // Hall of Fame + match results
  // -------------------------------------------------------------------------

  async hallOfFame(limit = 100): Promise<AccountProfile[]> {
    const rows = await this.db.select<AccountRow>(
      ACCOUNTS_TABLE,
      { banned_at: null },
      // WINS lead — the one ordering both backends share (leaderboard-order.ts).
      { order: HALL_OF_FAME_ORDER_CLAUSE, limit: Math.max(0, limit) + LADDER_EXEMPT_NICKNAME_COUNT }
    );
    return rows
      .filter((row) => !isLadderExemptNickname(row.nickname))
      .map((row) => toProfile(rowToRecord(row)))
      .slice(0, Math.max(0, limit));
  }

  async recordMatchResult(input: {
    matchId: string;
    participants: MatchParticipantInput[];
    ranked?: boolean;
  }): Promise<RecordMatchResult> {
    // A NORMAL (casual) game records win/loss but does not move MMR: skip the
    // Elo pairing so every rating stays put (see match-report.ts).
    const ranked = input.ranked !== false;
    // Resolve the participants' current ratings first (deleted accounts drop out).
    const rows = new Map<string, AccountRow>();
    for (const p of input.participants) {
      if (!rows.has(p.accountId)) {
        const row = await this.findById(p.accountId);
        if (row) {
          rows.set(p.accountId, row);
        }
      }
    }
    const eloInputs: EloParticipant[] = [];
    if (ranked) {
      for (const p of input.participants) {
        const row = rows.get(p.accountId);
        if (!row || isLadderExemptNickname(row.nickname)) {
          continue;
        }
        if (p.result === "win") {
          eloInputs.push({ id: p.accountId, rating: row.mmr, result: "win", ...(p.placement ? { placement: p.placement } : {}), ...(p.mmrRole ? { mmrRole: p.mmrRole } : {}) });
        } else if (p.result === "loss" || p.result === "abandon") {
          eloInputs.push({ id: p.accountId, rating: row.mmr, result: "loss", ...(p.placement ? { placement: p.placement } : {}), ...(p.mmrRole ? { mmrRole: p.mmrRole } : {}) });
        }
      }
    }
    const ratings = computeRatings(eloInputs);
    const changes: RecordMatchResult["changes"] = [];
    const summary: {
      accountId: string;
      nickname: string;
      result: MatchParticipantInput["result"];
      mmrBefore: number;
      mmrAfter: number;
    }[] = [];
    for (const p of input.participants) {
      const row = rows.get(p.accountId);
      if (!row || isLadderExemptNickname(row.nickname)) {
        continue;
      }
      const before = row.mmr;
      const after = ratings.get(p.accountId) ?? before;
      changes.push({ accountId: p.accountId, mmrBefore: before, mmrAfter: after });
      summary.push({ accountId: p.accountId, nickname: row.nickname, result: p.result, mmrBefore: before, mmrAfter: after });
    }

    // The idempotency gate: the match_id primary key decides exactly ONE
    // reporter wins; every duplicate insert comes back empty and applies nothing.
    const inserted = await this.db.insert<{ match_id: string }>(
      MATCHES_TABLE,
      { match_id: input.matchId, recorded_at: new Date(this.now()).toISOString(), participants: summary },
      { ignoreDuplicates: true }
    );
    if (inserted.length === 0) {
      return { matchId: input.matchId, applied: false, changes: [] };
    }

    for (const p of input.participants) {
      const row = rows.get(p.accountId);
      if (!row || isLadderExemptNickname(row.nickname)) {
        continue;
      }
      const after = ratings.get(p.accountId) ?? row.mmr;
      await this.db.update(
        ACCOUNTS_TABLE,
        {
          mmr: after,
          matches: row.matches + 1,
          wins: row.wins + (p.result === "win" ? 1 : 0),
          losses: row.losses + (p.result === "loss" || p.result === "abandon" ? 1 : 0)
        },
        { id: p.accountId }
      );
    }
    return { matchId: input.matchId, applied: true, changes };
  }

  /**
   * Dual-claim ladder report (durable across serverless instances): each
   * claimer inserts a reserved claim-row into the matches table; when two
   * distinct participants agree on the fingerprint, recordMatchResult runs.
   */
  async claimMatchResult(input: {
    claimerAccountId: string;
    matchId: string;
    participants: MatchParticipantInput[];
    ranked?: boolean;
  }): Promise<MatchClaimOutcome> {
    const ranked = input.ranked !== false;
    const claim = { matchId: input.matchId, ranked, participants: input.participants };
    const fingerprint = matchClaimFingerprint(claim);

    // Already fully recorded?
    const existing = await this.db.select<{ match_id: string }>(
      MATCHES_TABLE,
      { match_id: input.matchId },
      { limit: 1 }
    );
    if (existing.length > 0) {
      return { status: "already-recorded" };
    }

    // Park this claimer's row (idempotent per claimer).
    const rowId = claimRowId(input.matchId, input.claimerAccountId);
    await this.db.insert(
      MATCHES_TABLE,
      {
        match_id: rowId,
        recorded_at: new Date(this.now()).toISOString(),
        participants: {
          kind: "dual-claim",
          fingerprint,
          ranked,
          claimerAccountId: input.claimerAccountId,
          participants: input.participants
        }
      },
      { ignoreDuplicates: true }
    );

    // List every claim row for this matchId (prefix match via PostgREST like).
    const claims = await this.db.select<{
      match_id: string;
      participants: {
        kind?: string;
        fingerprint?: string;
        ranked?: boolean;
        claimerAccountId?: string;
        participants?: MatchParticipantInput[];
      };
    }>(MATCHES_TABLE, {}, { filters: [`match_id=like.${claimRowsLikePattern(input.matchId)}`] });

    const agreeing = claims.filter(
      (row) => row.participants?.kind === "dual-claim" && row.participants.fingerprint === fingerprint
    );
    if (agreeing.length < 2) {
      // Conflicting fingerprints from other claimers count as non-agreeing.
      const anyConflict = claims.some(
        (row) =>
          row.participants?.kind === "dual-claim" &&
          row.participants.fingerprint &&
          row.participants.fingerprint !== fingerprint
      );
      if (anyConflict && agreeing.length === 0) {
        return { status: "rejected", detail: "Claim conflicts with an earlier report for this match." };
      }
      return {
        status: "pending",
        detail: `Waiting for ${2 - agreeing.length} more participant(s) to confirm.`
      };
    }

    const result = await this.recordMatchResult({
      matchId: input.matchId,
      ranked,
      participants: input.participants
    });
    if (!result.applied) {
      return { status: "already-recorded", result };
    }
    return { status: "recorded", result };
  }

  // -------------------------------------------------------------------------
  // Hygiene
  // -------------------------------------------------------------------------

  /** Delete every expired session, ticket and email token (bounded tables). */
  async prune(): Promise<void> {
    const nowMs = this.now();
    await this.db.delete(SESSIONS_TABLE, {}, { filters: [`expires_at=lt.${nowMs}`] });
    await this.db.delete(TOKENS_TABLE, {}, { filters: [`expires_at=lt.${nowMs}`] });
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async nicknameExists(nicknameKey: string): Promise<boolean> {
    return (await this.findByNicknameKey(nicknameKey)) !== null;
  }

  private async emailExists(email: string): Promise<boolean> {
    return (await this.findByEmail(email)) !== null;
  }

  private async findById(id: string): Promise<AccountRow | null> {
    const rows = await this.db.select<AccountRow>(ACCOUNTS_TABLE, { id }, { limit: 1 });
    return rows[0] ?? null;
  }

  private async findByEmail(email: string): Promise<AccountRow | null> {
    const rows = await this.db.select<AccountRow>(ACCOUNTS_TABLE, { email }, { limit: 1 });
    return rows[0] ?? null;
  }

  private async findByNicknameKey(nicknameKey: string): Promise<AccountRow | null> {
    const rows = await this.db.select<AccountRow>(ACCOUNTS_TABLE, { nickname_key: nicknameKey }, { limit: 1 });
    return rows[0] ?? null;
  }

  private async findByIdentifier(identifier: string): Promise<AccountRow | null> {
    if (identifier.includes("@")) {
      const byEmail = await this.findByEmail(normalizeEmail(identifier));
      if (byEmail) {
        return byEmail;
      }
    }
    return this.findByNicknameKey(normalizeNicknameKey(identifier));
  }

  /**
   * Issue a confirm/reset token + mail: supersede prior tokens of the same
   * purpose, store only the digest, stamp the resend cooldown, then send the
   * mail fire-and-forget (a delivery failure is logged, never breaks the
   * account write — the player can always request a fresh link).
   */
  private async issueEmail(record: AccountRecord, purpose: "confirm" | "reset", origin?: string): Promise<OutboundMail> {
    const raw = generateToken();
    const nowMs = this.now();
    await this.db.delete(TOKENS_TABLE, { account_id: record.id, purpose });
    const token: TokenRow = {
      digest: hashToken(raw),
      account_id: record.id,
      purpose,
      created_at: nowMs,
      expires_at: nowMs + this.tokenTtlMs
    };
    await this.db.insert(TOKENS_TABLE, token);
    if (purpose === "confirm") {
      // The register mail counts as the first send (cross-instance cooldown).
      await this.db.update(ACCOUNTS_TABLE, { last_confirm_sent_at: nowMs }, { id: record.id });
    }
    const link = buildAccountActionLink(purpose, raw, this.baseUrl, origin);
    const mail = purpose === "confirm" ? buildConfirmMail(record.email, link, nowMs) : buildResetMail(record.email, link, nowMs);
    try {
      const pending = this.mailer.sendMail(mail);
      if (pending && typeof (pending as Promise<void>).then === "function") {
        (pending as Promise<void>).catch((error) => {
          console.error(`[mail] failed to send ${purpose} email to ${record.email}:`, error);
        });
      }
    } catch (error) {
      console.error(`[mail] failed to send ${purpose} email to ${record.email}:`, error);
    }
    return mail;
  }

  /** Atomically consume a one-time token (DELETE … RETURNING). */
  private async consumeToken(rawToken: string, purpose: "confirm" | "reset"): Promise<TokenRow> {
    if (typeof rawToken !== "string" || !rawToken) {
      throw new AccountError("TOKEN_INVALID", "This link is invalid.");
    }
    const deleted = await this.db.delete<TokenRow>(TOKENS_TABLE, { digest: hashToken(rawToken), purpose });
    const token = deleted[0];
    if (!token) {
      throw new AccountError("TOKEN_INVALID", "This link is invalid or has already been used.");
    }
    if (token.expires_at <= this.now()) {
      throw new AccountError("TOKEN_EXPIRED", "This link has expired — request a new one.");
    }
    return token;
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

// Constant-cost dummy for login attempts against unknown identifiers.
const DUMMY_HASH = hashPassword(generateToken());

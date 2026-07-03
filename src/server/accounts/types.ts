/**
 * Account system types (expansion plan Phase 1 — accounts, store, admin, mail).
 *
 * This is the self-hosted, offline-testable account backend. The plan's §D1
 * names Supabase as the *production* auth/database; this store is the same
 * pattern the room layer already uses (`src/server/game-room-store.ts`): an
 * in-memory + on-disk store behind a narrow interface, so a Supabase/Postgres
 * adapter can drop in later exactly like the PartyKit-vs-built-in transport
 * split — without the account UI, API routes or engine caring which backend is
 * live. Nothing here touches `GameState`, `GameAction` or the engine protocol
 * (plan §0 rule 7 — auth data stays OUT of the synced snapshot).
 */

/** A registered account's platform role. Admins govern from the /admin panel. */
export type AccountRole = "player" | "admin";

/**
 * Public-facing profile: everything that may be shown to other players and is
 * safe to hand to the client. Never carries the password hash, tokens or the
 * raw email (email stays private to the owner and admins).
 */
export type AccountProfile = {
  id: string;
  nickname: string;
  role: AccountRole;
  /** How other players can reach this person (optional, owner-editable). */
  contact: AccountContact;
  /** Competitive record (Hall of Fame). Groundwork; auto-reporting is Phase 6. */
  mmr: number;
  wins: number;
  losses: number;
  matches: number;
  /** ISO timestamp the account was created. */
  createdAt: string;
  /** True once the confirmation link has been followed (mail linking). */
  emailConfirmed: boolean;
  /** Set when an admin bans the account; login is refused while present. */
  bannedAt?: string;
  banReason?: string;
};

/** Owner-editable contact fields ("so other players can reach you"). */
export type AccountContact = {
  discord?: string;
  facebook?: string;
  note?: string;
};

/**
 * Internal account record (server-only). The password hash, email and token
 * digests live here and NEVER leave the server; `toProfile()` strips them.
 */
export type AccountRecord = {
  id: string;
  nickname: string;
  /** Case-folded nickname, the uniqueness key. */
  nicknameKey: string;
  /** Normalised (lower-cased, trimmed) email, the second uniqueness key. */
  email: string;
  /** scrypt password hash string (see crypto.ts `hashPassword`). */
  passwordHash: string;
  role: AccountRole;
  contact: AccountContact;
  mmr: number;
  wins: number;
  losses: number;
  matches: number;
  createdAt: string;
  emailConfirmed: boolean;
  bannedAt?: string;
  banReason?: string;
};

/**
 * A one-time email token (confirmation or password reset). Only the SHA-256
 * digest of the token is stored, so a leaked store dump cannot be used to
 * confirm or reset an account — the raw token exists only in the emailed link.
 */
export type EmailToken = {
  /** SHA-256 hex digest of the raw token. */
  digest: string;
  accountId: string;
  purpose: EmailTokenPurpose;
  createdAt: number;
  expiresAt: number;
};

export type EmailTokenPurpose = "confirm" | "reset";

/** A live login session. The cookie carries the raw token; we store its digest. */
export type SessionRecord = {
  /** SHA-256 hex digest of the raw session token. */
  digest: string;
  accountId: string;
  createdAt: number;
  expiresAt: number;
};

/**
 * Error codes the store throws (as `AccountError`). The API layer maps these to
 * HTTP statuses and the UI maps them to specific, human messages — the owner's
 * requirement that "nickname taken" and "email already registered" are
 * distinguishable (plan §D1).
 */
export type AccountErrorCode =
  | "NICKNAME_INVALID"
  | "EMAIL_INVALID"
  | "PASSWORD_WEAK"
  | "NICKNAME_TAKEN"
  | "EMAIL_TAKEN"
  | "INVALID_CREDENTIALS"
  | "EMAIL_NOT_CONFIRMED"
  | "ACCOUNT_BANNED"
  | "TOKEN_INVALID"
  | "TOKEN_EXPIRED"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "FORBIDDEN"
  | "CONTACT_INVALID";

export class AccountError extends Error {
  readonly code: AccountErrorCode;
  /** Optional retry hint (seconds) for RATE_LIMITED. */
  readonly retryAfter?: number;
  constructor(code: AccountErrorCode, message?: string, retryAfter?: number) {
    super(message ?? code);
    this.name = "AccountError";
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

/** Convert an internal record to the safe public profile. */
export function toProfile(record: AccountRecord): AccountProfile {
  return {
    id: record.id,
    nickname: record.nickname,
    role: record.role,
    contact: { ...record.contact },
    mmr: record.mmr,
    wins: record.wins,
    losses: record.losses,
    matches: record.matches,
    createdAt: record.createdAt,
    emailConfirmed: record.emailConfirmed,
    ...(record.bannedAt ? { bannedAt: record.bannedAt, banReason: record.banReason } : {})
  };
}

/**
 * The owner's own view of their account — the public profile plus the private
 * email (shown only to the account holder and admins).
 */
export type SelfProfile = AccountProfile & { email: string };

export function toSelfProfile(record: AccountRecord): SelfProfile {
  return { ...toProfile(record), email: record.email };
}

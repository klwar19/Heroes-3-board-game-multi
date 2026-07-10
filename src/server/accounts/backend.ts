/**
 * The account backend surface the API routes program against (plan §D1's
 * "one interface, swappable backend" — the same shape as the room transport
 * split). Two implementations ship:
 *
 *  - `AccountStore` (account-store.ts) — the built-in, in-memory + on-disk
 *    store. Synchronous methods; structurally satisfies this interface because
 *    every return type here is `T | Promise<T>`.
 *  - `SupabaseAccountStore` (supabase-store.ts) — the production Postgres
 *    backend over Supabase's PostgREST API. Fully async; every account,
 *    session, email token and match result is a real table row, so identity
 *    survives restarts and is shared across serverless instances.
 *
 * Routes must `await` every call (awaiting a non-promise is a no-op), so the
 * two backends are interchangeable behind `getAccountBackend()`.
 */
import type { OutboundMail } from "./mailer";
import type { MatchParticipantInput, RecordMatchResult } from "./account-store";
import type { AccountProfile, AccountRole, SelfProfile } from "./types";

type MaybePromise<T> = T | Promise<T>;

export type RegisterOutcome = {
  profile: SelfProfile;
  /** False when the account was auto-confirmed (sign in straight away). */
  needsConfirmation: boolean;
  /** The confirmation mail just sent (link is `.link`); null when auto-confirmed. */
  confirmation: OutboundMail | null;
};

export interface AccountBackend {
  /** Whether the configured mail transport actually delivers to an inbox. */
  readonly mailerDelivers: boolean;

  register(
    input: { nickname: unknown; email: unknown; password: unknown; contact?: unknown },
    origin?: string
  ): MaybePromise<RegisterOutcome>;
  confirmEmail(rawToken: string): MaybePromise<{ profile: SelfProfile }>;
  resendConfirmation(rawEmail: unknown, origin?: string): MaybePromise<void>;
  checkAvailability(input: { nickname?: unknown; email?: unknown }): MaybePromise<{
    nickname?: { available: boolean; reason?: string };
    email?: { available: boolean };
  }>;

  login(input: { identifier: unknown; password: unknown }): MaybePromise<{ token: string; profile: SelfProfile }>;
  logout(rawToken: string | undefined | null): MaybePromise<void>;
  getSessionProfile(rawToken: string | undefined | null): MaybePromise<SelfProfile | null>;
  mintSocketTicket(rawSessionToken: string | undefined | null): MaybePromise<string | null>;
  getVerifiedProfile(rawToken: string | undefined | null): MaybePromise<SelfProfile | null>;

  requestPasswordReset(rawEmail: unknown, origin?: string): MaybePromise<void>;
  resetPassword(rawToken: string, newPassword: unknown): MaybePromise<{ profile: SelfProfile }>;

  updateContact(accountId: string, rawContact: unknown): MaybePromise<SelfProfile>;
  getProfileById(accountId: string): MaybePromise<AccountProfile | null>;
  /** Public profile lookup by (case-insensitive) nickname — the /players page. */
  getProfileByNickname(nickname: string): MaybePromise<AccountProfile | null>;

  adminListAccounts(): MaybePromise<SelfProfile[]>;
  setRole(accountId: string, role: AccountRole): MaybePromise<AccountProfile>;
  promoteToAdminByEmail(rawEmail: string): MaybePromise<AccountProfile | null>;
  ensureAdminAccount(input: { nickname: unknown; email: unknown; password: unknown }): MaybePromise<AccountProfile>;
  banAccount(accountId: string, reason?: string): MaybePromise<AccountProfile>;
  unbanAccount(accountId: string): MaybePromise<AccountProfile>;
  deleteAccount(accountId: string): MaybePromise<void>;

  hallOfFame(limit?: number): MaybePromise<AccountProfile[]>;
  recordMatchResult(input: {
    matchId: string;
    participants: MatchParticipantInput[];
    /**
     * Whether this match moves MMR. Defaults to true (back-compat). When false
     * (a NORMAL/casual table) the win/loss + matches-played are still recorded,
     * but every account's rating is left untouched.
     */
    ranked?: boolean;
  }): MaybePromise<RecordMatchResult>;
}

/**
 * Platform auth feature flag (expansion plan §D1).
 *
 * Accounts are additive: the entire login/session stack keys off
 * NEXT_PUBLIC_SUPABASE_URL being configured at build time. Absent (local dev,
 * CI, vitest, playwright) the app runs exactly as before accounts existed —
 * guest clientId + free-text display name, no login wall. Present, the login
 * screen offers real sign-in (Phase 1) and pre-game routes require a session.
 *
 * Keep every auth-dependent branch behind this ONE helper so "guest mode
 * stays byte-for-byte intact" remains greppable and testable.
 */
export function authEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

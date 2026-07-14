/**
 * Platform auth feature flag (expansion plan §D1).
 *
 * Accounts are additive and OFF by default: with no auth env configured the app
 * runs exactly as before accounts existed — guest clientId + free-text display
 * name, no login wall. That default is what keeps the existing test suites, the
 * Playwright e2e flow, and `npm run dev` with zero env vars byte-for-byte
 * intact.
 *
 * Two ways to turn accounts ON (either flips the same login wall + auth UI):
 *  - `NEXT_PUBLIC_ACCOUNTS_ENABLED=1` — the self-hosted account backend that
 *    ships in this repo (`src/server/accounts/*`), no external service required.
 *  - `NEXT_PUBLIC_SUPABASE_URL` — reserved for the future Supabase adapter
 *    (same UI, swapped store), per the plan's §D1.
 *
 * Keep every auth-dependent branch behind this ONE helper so "guest mode stays
 * intact" remains greppable and testable.
 */
export function authEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) || process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED === "1";
}

/**
 * Guest login is TEMPORARILY disabled. While this is true and accounts are
 * enabled, the entry screen hides the "Continue as guest" bridge (showing a
 * "temporarily disabled — please register or sign in" notice instead) and the
 * menu no longer lets a previously-chosen guest through — every signed-out
 * visitor is sent to /login to register or sign in. Account sign-in and
 * registration are UNAFFECTED (this flag never touches the account path).
 *
 * Flip back to `false` to restore the guest bridge — that is the whole "undo"
 * for this feature, deliberately kept to one boolean.
 *
 * Inert when accounts are OFF (`authEnabled()` false): a guest-only deployment
 * — and the CI / e2e suites — have no account path, so guest MUST stay the way
 * in there; every guest branch this flag guards lives behind `authEnabled()`.
 */
export const GUEST_LOGIN_DISABLED = true;

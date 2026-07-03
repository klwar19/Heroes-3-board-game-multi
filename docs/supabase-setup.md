# Supabase / Postgres setup — accounts, sessions, mail, and the ladder

This is the owner's runbook for turning the deployment into a **real
multiplayer platform**: durable player accounts, login sessions that survive
restarts and serverless cold starts, working email verification, and automatic
win/loss + Elo tracking per account.

## What is implemented (and what backs it)

| Feature | Where it lives | Test that fails if removed |
| --- | --- | --- |
| Postgres account backend (register / confirm / login / reset / profiles / roles / bans) | `src/server/accounts/supabase-store.ts` over PostgREST (`postgrest.ts`, zero-dependency) | `supabase-store.test.ts` (runs against a faithful in-memory PostgREST emulator) |
| Cross-instance sessions + PartyKit socket tickets as table rows | same | `supabase-store.test.ts` ("what one server instance writes, another instance sees") |
| Mail policy: production with **no** mail transport auto-confirms registrations instead of stranding players | `shouldAutoConfirmAccounts` (`mailer.ts`), applied in `account-store-instance.ts` | `mailer-select.test.ts`, `account-store.test.ts` ("auto-confirm mode") |
| Automatic match results: game-over → win/loss + Elo, once per game | `src/server/match-report.ts`, hooked in `game-room-store.ts` (built-in) and `party/index.ts` → `/api/matches/report` (edge) | `match-report.test.ts`, `api/matches/report/route.test.ts` |
| Match history rows (who, result, MMR before/after) | `homm3bg_matches` table | `supabase-store.test.ts` ("records a match once") |

**Not implemented / limits (say it plainly):**

- The room store itself (live game snapshots) still lives in the built-in
  in-memory/disk store or PartyKit Durable Objects — Postgres holds *identity*
  (accounts, sessions, match results), not live game state. Use PartyKit for
  the realtime rooms on serverless deploys.
- Login attempt rate-limiting is per instance (in-memory) on the Supabase
  backend; scrypt cost is the real brake. The resend cooldown IS cross-instance
  (a column).
- Draws/abandons are supported by the API but the auto-detector only reports
  decisive `winnerPlayerId` endings today; a game that ends without a winner
  seat ranks nobody.
- If two different games finish at the exact same moment and share an account,
  one rating update can be computed from a stale read (classic read-modify-
  write). Match idempotency is race-safe (Postgres PK); concurrent *different*
  matches touching the same account are a documented small-scale risk.

## Step 1 — create the Supabase project and tables

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. Open **SQL Editor → New query**, paste the whole of
   [`supabase/schema.sql`](../supabase/schema.sql), **Run**. It is idempotent —
   re-running is safe. RLS is enabled with no policies, so the anon key can
   touch nothing; only the service-role key (server) can.

## Step 2 — set the environment variables

On the Next.js deployment (Vercel → Project → Settings → Environment Variables,
or your server's env):

```bash
# Turns the login wall + auth UI on (either flag works; URL implies it)
NEXT_PUBLIC_SUPABASE_URL="https://<project>.supabase.co"
# Server-only secret (Supabase Dashboard → Settings → API → service_role).
# NEVER expose this to the browser; it bypasses row-level security.
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
```

With BOTH set, every auth route stores to Postgres. With either missing the app
falls back to the built-in file store (and logs a warning if the URL alone is
set).

Optional but recommended:

```bash
# Ready-to-use admin account, ensured on every boot (created if missing,
# promoted if present; its password is never overwritten once set):
HOMM3BG_ADMIN_NICKNAME="Overlord"
HOMM3BG_ADMIN_EMAIL="you@example.com"
HOMM3BG_ADMIN_PASSWORD="change-me-please"   # min 8 chars
```

## Step 3 — make email verification REAL (or consciously skip it)

Supabase hosts the *database*; it does not send this app's emails. Pick one:

- **Resend (easiest, serverless-friendly).** Free tier ≈ 100 mails/day.
  ```bash
  HOMM3BG_MAIL_API_KEY="re_xxxxxxxxxxxx"
  HOMM3BG_MAIL_FROM="Erathia Server <no-reply@yourdomain.com>"
  ```
- **Any SMTP provider** (Gmail app password, Mailgun, Brevo, your own MTA):
  ```bash
  HOMM3BG_SMTP_HOST="smtp.example.com"
  HOMM3BG_SMTP_USER="postmaster@example.com"
  HOMM3BG_SMTP_PASS="app-password"
  HOMM3BG_SMTP_FROM="Erathia Server <no-reply@example.com>"
  ```
- **Nothing.** With no delivering transport configured, a **production** server
  now AUTO-CONFIRMS new accounts (and logs a warning) instead of pointing
  players at an inbox that will never receive anything — registration and
  sign-in just work. Set `HOMM3BG_REQUIRE_EMAIL_CONFIRMATION=1` to force the
  old strict behaviour anyway, or `=0` to auto-confirm even in dev.

In local dev (`next dev`) nothing changes: the confirm link is printed to the
server console and echoed into the register response ("Dev mode: confirm now").

## Step 4 — the ladder (win/loss/Elo per account)

Nothing to configure on the built-in backend: when a game reaches its terminal
state (`GAME_WON`), every seat bound to a **verified account** gets a win or
loss, Elo moves (K=32, winner-takes-field), and the Hall of Fame + profile pages
show it. A match ranks only when at least two distinct signed-in accounts held
seats — guests, observers and solo games never rank.

**PartyKit edge deploys need one shared secret**, because the room Durable
Object has no database access and reports back to the app:

```bash
# On the Next.js deployment:
HOMM3BG_MATCH_REPORT_KEY="<long random string>"
# On the PartyKit party (partykit.json vars or `npx partykit deploy --var ...`):
HOMM3BG_APP_URL="https://your-app.example"        # already needed for Phase 2 seats
HOMM3BG_MATCH_REPORT_KEY="<same long random string>"
```

Unset ⇒ edge match reporting is off (a finished edge game logs a warning and
records nothing); the built-in backend keeps working regardless.

## Step 5 — verify the deployment

1. Register two accounts (two browsers). With mail configured you get real
   inbox links; without it you land straight in the menu.
2. Redeploy or restart the server. Sign in again — the accounts are still
   there (Postgres, not tmpdir). Check Supabase → Table Editor →
   `homm3bg_accounts`.
3. Play a hosted game to the end with both accounts seated. Check
   `homm3bg_matches` for the row and `/hall-of-fame` for the moved ratings.

## Where the data lives

| Table | Contents |
| --- | --- |
| `homm3bg_accounts` | one row per account: nickname, normalised email, scrypt hash, role, contact, MMR/W/L/matches, ban state |
| `homm3bg_sessions` | login sessions (30-day sliding) and short-lived PartyKit socket tickets — SHA-256 digests only |
| `homm3bg_email_tokens` | one-time confirm/reset tokens — digests only |
| `homm3bg_matches` | one row per ranked game: matchId (= the game's unique seed), timestamp, participants with results and MMR before/after |

Passwords are scrypt (N=16384) hashes; session/reset/confirm tokens are stored
only as SHA-256 digests — a database leak replays nothing.

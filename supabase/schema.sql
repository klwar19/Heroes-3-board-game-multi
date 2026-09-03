-- Heroes 3 Board Game Multi — Supabase / Postgres schema
-- ---------------------------------------------------------------------------
-- Run this ONCE in your Supabase project (Dashboard → SQL Editor → New query →
-- paste → Run). It is idempotent (IF NOT EXISTS everywhere), so re-running is
-- safe. Full setup runbook: docs/supabase-setup.md.
--
-- The app talks to these tables over PostgREST with the SERVICE-ROLE key from
-- the server only. Row Level Security is ENABLED with NO policies, which means
-- the public anon key can read/write NOTHING — the service role bypasses RLS.
-- Never ship the service-role key to a browser.

-- Player accounts. Passwords are scrypt hashes; emails are normalised
-- (lower-cased) before insert; nickname_key is the case-folded uniqueness key.
create table if not exists public.homm3bg_accounts (
  id text primary key,
  nickname text not null,
  nickname_key text not null unique,
  email text not null unique,
  password_hash text not null,
  role text not null default 'player' check (role in ('player', 'admin')),
  contact jsonb not null default '{}'::jsonb,
  mmr integer not null default 1200,
  wins integer not null default 0,
  losses integer not null default 0,
  matches integer not null default 0,
  created_at text not null,
  email_confirmed boolean not null default false,
  banned_at text,
  ban_reason text,
  last_confirm_sent_at bigint
);

-- Operator-designated proof/load accounts never carry ladder history. Safe to
-- re-run: application code also keeps these exact nicknames out of future MMR
-- and W/L updates.
update public.homm3bg_accounts
set mmr = 1200, wins = 0, losses = 0, matches = 0
where lower(nickname) in (
  'r1proofa8160618',
  'proofa1788188791',
  'proofb1788188791',
  'r1battlea8170184',
  'r1proofb8160618',
  'r1livea8160074'
);

-- Login sessions (kind = 'session', 30-day sliding) and short-lived PartyKit
-- socket tickets (kind = 'ticket', ~10 min). Only SHA-256 digests are stored —
-- a database dump cannot be replayed to impersonate anyone.
create table if not exists public.homm3bg_sessions (
  digest text primary key,
  account_id text not null references public.homm3bg_accounts (id) on delete cascade,
  kind text not null default 'session' check (kind in ('session', 'ticket')),
  created_at bigint not null,
  expires_at bigint not null
);
create index if not exists homm3bg_sessions_account_idx on public.homm3bg_sessions (account_id);
create index if not exists homm3bg_sessions_expiry_idx on public.homm3bg_sessions (expires_at);

-- One-time email tokens (confirmation / password reset), digest-only.
create table if not exists public.homm3bg_email_tokens (
  digest text primary key,
  account_id text not null references public.homm3bg_accounts (id) on delete cascade,
  purpose text not null check (purpose in ('confirm', 'reset')),
  created_at bigint not null,
  expires_at bigint not null
);
create index if not exists homm3bg_email_tokens_account_idx on public.homm3bg_email_tokens (account_id);
create index if not exists homm3bg_email_tokens_expiry_idx on public.homm3bg_email_tokens (expires_at);

-- Finished-match history. The primary key IS the idempotency gate: a game
-- reported twice (both backends, retries, races) applies exactly once.
-- `participants` is the full summary: [{accountId, nickname, result,
-- mmrBefore, mmrAfter}, ...].
create table if not exists public.homm3bg_matches (
  match_id text primary key,
  recorded_at text not null,
  participants jsonb not null default '[]'::jsonb
);

-- Private AI-training replays for Ranked Clash. One bounded JSON payload is
-- inserted only when the match finishes; it never rides live room snapshots.
-- The app service role is the only reader/writer (RLS with no public policy).
create table if not exists public.homm3bg_ranked_replays (
  match_id text primary key references public.homm3bg_matches (match_id) on delete cascade,
  recorded_at text not null,
  schema_version integer not null,
  engine_signature text not null,
  action_count integer not null check (action_count >= 0 and action_count <= 2000),
  byte_length integer not null check (byte_length >= 0 and byte_length <= 4000000),
  truncated boolean not null default false,
  payload jsonb not null
);
-- Keep existing projects aligned when replay retention is expanded. Merely
-- re-running CREATE TABLE IF NOT EXISTS does not update an older constraint.
alter table public.homm3bg_ranked_replays
  drop constraint if exists homm3bg_ranked_replays_byte_length_check;
alter table public.homm3bg_ranked_replays
  add constraint homm3bg_ranked_replays_byte_length_check
  check (byte_length >= 0 and byte_length <= 4000000);
create index if not exists homm3bg_ranked_replays_recorded_idx
  on public.homm3bg_ranked_replays (recorded_at);

-- Lock everything down: RLS on, no policies ⇒ anon/authenticated see nothing;
-- the server's service-role key bypasses RLS by design.
alter table public.homm3bg_accounts enable row level security;
alter table public.homm3bg_sessions enable row level security;
alter table public.homm3bg_email_tokens enable row level security;
alter table public.homm3bg_matches enable row level security;
alter table public.homm3bg_ranked_replays enable row level security;

-- Order & Chaos tally boards, stored per ACCOUNT (like ranked MMR).
-- One best row per (account, board). board_key is the engine's board id
-- (src/engine/garrison/order-chaos/scores.ts ocBoardKey): all-time boards
-- `all:endless`, `all:daily`, `all:campaign`, `all:raid:r3`; day boards
-- `day:<YYYY-MM-DD>:endless`, `day:<day>:raid:r3`, `day:<day>:daily:<setup>`.
-- The app keeps only today's and yesterday's day rows (it deletes older ones).
-- `nickname` is a fallback copy: board reads show the account's current
-- nickname from homm3bg_accounts and leave banned accounts out.
create table if not exists public.homm3bg_oc_scores (
  account_id text not null references public.homm3bg_accounts (id) on delete cascade,
  board_key text not null check (char_length(board_key) <= 64),
  nickname text not null,
  score integer not null check (score >= 0),
  wave integer not null check (wave >= 0),
  kills integer not null check (kills >= 0),
  ticks integer not null check (ticks >= 0),
  hero text,
  day text not null,
  posted_at bigint not null,
  primary key (account_id, board_key)
);
-- A board page: its rows best first (score, then earliest post).
create index if not exists homm3bg_oc_scores_board_idx
  on public.homm3bg_oc_scores (board_key, score desc, posted_at asc);
-- The daily cleanup of old day boards.
create index if not exists homm3bg_oc_scores_day_idx
  on public.homm3bg_oc_scores (day);

-- Server-only like every homm3bg table: RLS on with no policies, so the
-- anon/authenticated keys see nothing; the app's service-role key bypasses RLS.
alter table public.homm3bg_oc_scores enable row level security;

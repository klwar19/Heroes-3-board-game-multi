# Pro-Game Platform Expansion Plan

**Login screen → Main menu → Game menu → Real game** — accounts with email
confirmation, lobby + in-game chat, a real main menu, open/locked multiplayer
rooms, Hall of Fame with MMR, an admin role, a named server ("Erathia"), a
reorganized game-options screen with granular BINH/WOG toggles, loading screens
with progress bars, and an art/sound slot system so every visual can be upgraded
later with generated art — without rewriting code.

This document is written to be executed **by an AI agent (e.g. Opus), one phase
per session**, on this exact codebase. Every claim about the current code below
was verified against the repo on the date of writing; file:line references are
real. Do not re-explore what §1 already answers.

---

## 0. Rules for the executing agent (read first, non-negotiable)

These restate and extend the repository `CLAUDE.md`. They apply to every phase.

1. **"Done" = enforced AND tested.** A feature is done only if the code actually
   executes it and a named test fails when the logic is removed. A button that
   renders but does nothing, a "chat" that doesn't deliver, an "MMR" column that
   never updates — these are stubs. If you ship a stub, say so in the first
   sentence of your report and mark it clearly in code.
2. **Test the observable outcome, not the artifact.** "Row inserted" is a data
   check; "after B beats A, A's MMR went 1200→1184 and B's 1200→1216, and the
   Hall of Fame renders them in the new order" is the real one.
3. **Lead reports with what does NOT work.** No ✅/"fully implemented" language
   without a named passing test.
4. **One phase per session.** Finish a phase (all exit criteria checked, `npm
   test && npm run typecheck && npm run lint && npm run build` green) before
   starting the next. Phases are ordered by dependency — do not skip ahead.
5. **Never break guest/dev mode.** All existing tests, the Playwright e2e suite,
   and `npm run dev` with zero env vars must keep working after every phase.
   Auth is additive and feature-flagged (§3 D1): no Supabase env → the app runs
   exactly as today (guest names, no login wall).
6. **Bump `ENGINE_PROTOCOL_VERSION`** (`src/engine/version.ts`) whenever you add
   a `GameAction`, change `GameSetupOptions`/state schema, or change reducer
   semantics — otherwise a stale PartyKit deploy silently rejects new actions
   (README "Deploying" section). Both halves (Vercel + PartyKit) deploy
   together via `.github/workflows/deploy-partykit.yml`.
7. **Keep chat, presence, and stats OUT of `GameState`.** Every accepted game
   action re-broadcasts the entire `GameState` to every connection
   (`party/index.ts` `broadcastSnapshot`); adding chat messages to it would
   re-send the whole chat log on every move and churn the engine version.
   Chat/presence/stats are separate message types and stores (§3 D4, D5).
8. **Secrets never enter the repo.** Admin credentials, SMTP keys, JWT secrets,
   `MATCH_REPORT_SECRET` — env vars only. The plan tells the owner (BINH) what
   to configure by hand in §9.

Verification commands (run before claiming any phase complete):

```bash
npm test               # vitest, all engine + component tests
npm run typecheck
npm run lint
npm run build
npm run test:e2e       # playwright, requires the dev server buildable
```

---

## 1. Where the code stands today (verified inventory — do not re-explore)

### Stack and shape

- Next.js 16 App Router + React 19, TypeScript. No Tailwind, no CSS modules —
  one global stylesheet `src/app/globals.css` (~12k lines) with design tokens on
  `:root` (`--bg`, `--gold #d5a84f`, `--surface`, `--felt`, `--wood-1/2`…), dark
  gold "board game table" theme. Shared button classes `.commandButton`
  (`.primary`/`.ghost`/`.danger`), icons from `lucide-react`.
- The whole client is a **state machine in `src/app/page.tsx` (~4,500 lines)**
  with five render branches, in order:
  1. no `?room=` → `LobbyScreen` (room browser, `src/components/lobby.tsx`);
  2. room chosen, snapshot not loaded → plain-text loading block
     (`page.tsx:3287`, the ONLY "loading screen" today);
  3. adventure setup → `SetupLobbyScreen` (`src/components/adventure/screen.tsx:5128`)
     with tabs "Heroes & draft" (`DraftFlowPanel`) and "Game options"
     (`GameOptionsPanel`, `screen.tsx:3833`);
  4. adventure map; 5. combat.
- Other routes: `/credits` (static prose), `/designer` (map designer),
  `/commander-preview`, `/specialty-preview` (dev art previews).
- Music/sound systems exist and are good: `src/lib/music.ts`
  (`useBackgroundMusic(scene)`, scenes `"menu" | "map" | "combat"`),
  `src/lib/sound.ts` + `public/sounds/manifest.json` (~1,000 clips, documented
  in `docs/sound-mapping.md`). Menu art already in `public/assets/ui/`
  (`map-backdrop.jpg`, `setup-wallpaper.jpg`, `new-game-button.png`…), loaded
  via `assetUrl()` (`src/lib/asset-url.ts`).
- Assets: `public/assets` ≈ 205 MB, `public/sounds` ≈ 21 MB, ~2,600 files.

### Multiplayer

- Two interchangeable transports behind one interface (`src/lib/realtime.ts`:
  `RoomConnection` — `submitAction/resetRoom/fetchSnapshot/restoreRoom`):
  - **PartyKit** (Cloudflare Durable Objects) when `NEXT_PUBLIC_PARTYKIT_HOST`
    is set: one DO per room (`party/index.ts`, `GameRoomServer`, hibernating,
    snapshot persisted under storage key `"snapshot"`), a **singleton lobby
    directory DO** (`party/lobby.ts`, id `"directory"`), a **singleton shared
    map library DO** (`party/maps.ts`, id `"catalog"`, max 200 maps). Rooms are
    created implicitly on first connect. Rooms self-report directory records to
    the lobby DO (`reportToLobby`) only when a directory-relevant field changes.
  - **Built-in** (default, dev): Next API routes + in-memory
    `globalThis` map + SSE (`src/server/game-room-store.ts`,
    `src/app/api/rooms/**`), best-effort disk persistence to tmpdir, 6h
    stale-room expiry.
  - Directory logic is shared isomorphic code (`src/server/lobby-registry.ts`:
    `LobbyRoomRecord`, `RoomDirectoryEntry`, `LobbyRegistry`) so both backends
    derive identical room lists. Client polls `fetchRoomList()` every 5s.
- **Identity is guest-only and forgeable**: a per-tab `clientId`
  (`src/lib/identity.ts`, sessionStorage) plus a free-text display name
  (localStorage). Seat locking exists (engine `state.room`,
  `src/engine/room.ts`: `JOIN_ROOM`, `ASSIGN_SEAT`, `KICK_MEMBER`,
  `TRANSFER_HOST`, `SET_ROOM_HOSTED`, `SET_ROOM_NAME`) with **open table**
  (free seat switching) vs **hosted** (host assigns seats) modes — but the
  guard's own comment (`room.ts:390`) says it is *not* a defence against a
  forged clientId. **Auth is the declared next milestone**
  (`docs/multiplayer-platform-plan.md` Step 4).
- **Known privacy debt (documented, unfixed):** every snapshot broadcast is the
  FULL `GameState`; hands/decks are redacted only at render time by
  `getPlayerView` (`src/engine/player-view.ts`). Anyone reading WebSocket
  frames in devtools sees everything.
- **Admin today:** env `HOMM3BG_ADMIN_KEY` on the servers +
  `localStorage["homm3bg.adminKey"]` in a browser lets a reset/close wipe any
  table. No accounts, no roles.
- **What does not exist at all (verified by exhaustive search):** login/auth,
  accounts, sessions, chat, MMR/Elo/stats/win-loss records, leaderboard,
  teams/alliances, i18n, loading progress UI, server/shard concept.
  `.env.example` line 1 explicitly reserves Supabase vars "for later phases".

### Game options today (`GameSetupOptions`, `src/engine/state.ts:6919`)

Fields: `scenarioId`, `playerCount?`, `ruleset` (`"legacy" | "binh"`),
`wog?` (`{enabled, commanders, newObjects, newCreatures}`), `victoryMode?`,
`pvpTroopLoss?`, `creatureBanks?`, `events?`, `spellBook?`, `parallelTurns?`,
`farTileOpening?`, `farTilesPerPlayer?`, `difficulty`, `startingResources`,
`startingProduction`, `startingUnitTiers` (legacy), `startingUnits?`,
`startingBuildings`, `customMap?`, `customMapName?`.

Rendered as toggle-button rows in `GameOptionsPanel` (`screen.tsx:3833-4323`),
all dispatched through one `SET_GAME_OPTIONS` action. Known gaps to fix while
reorganizing: **`creatureBanks` has NO UI control** (engine-only; verified — no
component references it), and the `events` doc-comment in `state.ts` claims
"default ON" while the UI (`screen.tsx:4019`, `?? false`), its tooltip, and
CLAUDE.md all say default OFF — the type comment is the stale one; fix the
comment, keep OFF.

The BINH ruleset is currently ONE toggle bundling: split Basic/Expert spell +
Minor/Major/Relic artifact decks, Wisdom/Estates discounts, unit stat tweaks
(Griffins/Marksmen/Skeleton-HP…), deck extras. WOG is a sub-option of BINH.
`docs/binh-mode-progress.md` lists the full bundle.

### Tests

Vitest (node env; component tests self-configure jsdom): ~38 `*.test.tsx` +
large engine suites. Playwright e2e in `tests/e2e/` (8 specs, Chromium,
dev-server on :3000). CI deploys PartyKit on push to the production branch.

---

## 2. Target experience (what "a real game" means here)

```
┌────────────┐   ┌───────────────┐   ┌──────────────────────┐   ┌──────────┐
│ LOGIN      │──▶│ MAIN MENU     │──▶│ MULTIPLAYER LOBBY    │──▶│ ROOM /   │
│ register   │   │ Single (grey) │   │ server: Erathia      │   │ GAME MENU│──▶ GAME
│ confirm    │   │ Multiplayer   │   │ room list + create   │   │ seats,   │   (map,
│ profile    │   │ Hall of Fame  │   │ lobby CHAT           │   │ options, │   combat,
│ forgot pw  │   │ Credits       │   │ hall of fame link    │   │ room CHAT│   room CHAT)
└────────────┘   │ Logout        │   └──────────────────────┘   └──────────┘
                 └───────────────┘
       every screen: themed background art slot + menu music + loading screens with progress
```

- Full-screen background art on login/menu/lobby (slot-based, replaceable,
  §3 D7), `useBackgroundMusic("menu")` everywhere pre-game.
- Rooms: **Open** (today's open table — free seat/team switching, casual and
  testing) and **Locked** (today's hosted table — 1 account = 1 seat, host
  controls everything). Both already exist in the engine; the expansion binds
  them to verified accounts and gives them a real creation dialog.
- Hall of Fame: every registered nick with wins / losses / matches / MMR,
  sortable, backed by server-recorded match results.
- Admin: BINH's account can delete any room, delete/ban any nick, moderate
  chat — from an in-app admin panel, not localStorage keys.
- Server browser: one server today — **Erathia** — architected so adding
  "Server 2" later is configuration, not code.

---

## 3. Architecture decisions (settled — do not re-litigate mid-phase)

### D1. Accounts & auth = Supabase (Postgres + Auth), feature-flagged

**Choice:** Supabase — email/password auth with built-in **email confirmation
links**, password reset, a Postgres database for profiles/matches/ratings, row
level security, and a generous free tier. It was already the designated
database/auth in `BUILD_BLUEPRINT.md` and `.env.example` reserves its vars.
Client SDK: `@supabase/supabase-js` + `@supabase/ssr` (cookie-based sessions
that work with Next App Router server components and API routes).

**Rejected alternatives:** rolling our own (bcrypt + JWT + SMTP + reset flows =
weeks of security-sensitive work for zero product value), NextAuth/Auth.js
(would still need a database + email provider; Supabase gives DB + mail in one),
Clerk/Auth0 (paid tiers, external lock-in for a non-profit fan project).

**Email:** Supabase's built-in mailer works out of the box for development
(rate-limited ~3-4 emails/hour — fine for testing). Before public launch,
plug a free SMTP provider (Resend/Brevo free tier) into Supabase Auth SMTP
settings — configuration only, no code change (§9 owner checklist).

**Feature flag:** all auth UI and enforcement key off
`NEXT_PUBLIC_SUPABASE_URL` being set. Absent (dev, CI, vitest, playwright) →
the app behaves exactly as today: guest `clientId` + display name, no login
wall. Present → login required to reach the main menu. This is the single most
important constraint for not breaking the existing test suites.

**Duplicate nick/email UX (explicit owner requirement):** registration shows
"nickname already taken" / "email already registered" specifically. Nickname
uniqueness is checked against `profiles` (case-insensitive unique index) via a
rate-limited availability endpoint. Email duplication: Supabase deliberately
obscures this on `signUp` to prevent account enumeration; we implement a
rate-limited server-side pre-check RPC to honor the owner's UX requirement,
accepting the (documented) enumeration trade-off — acceptable for a non-profit
fan game.

### D2. Verified identity threading (userId beside clientId)

Today every authorization decision keys off client-claimed `actorClientId`.
The fix, applied at the transport boundary on BOTH backends:

- Client attaches the Supabase **access token (JWT)** to every connection and
  request: PartyKit `PartySocket({query: {clientId, token}})`; built-in backend
  via the session cookie (`@supabase/ssr`) or an `Authorization` header.
- **PartyKit** verifies the JWT in `onBeforeConnect`/`onRequest` (static
  verification against the Supabase JWT secret / JWKS — env
  `SUPABASE_JWT_SECRET` on the party; `jose` runs fine on workers). The
  verified `userId` + `nickname` are stamped into the connection state; a
  spoofed `actorClientId` no longer matters because the server overwrites the
  actor identity with the verified one.
- **Built-in backend** does the same in the API routes.
- Engine `RoomMember` gains `userId?: string` and `roomActionGuard` prefers it
  over `clientId` when present (guest mode still passes `clientId` only —
  engine stays isomorphic and testable without any network).
- **This closes the documented trust boundary** (`room.ts:390`) and unlocks the
  per-recipient snapshot redaction fix (Phase 2): once a connection is bound to
  a seat, `getPlayerView(state, seat)` can run server-side per connection.

### D3. Servers/shards: named lobby partitions ("Erathia")

A "server" = a named partition of the room directory + chat, NOT a separate
deployment. Implementation: the lobby DO is already addressed by id
(`/parties/lobby/directory`); generalize the id to `directory:<serverId>` and
prefix room ids `<serverId>-<roomId>`. A static config
(`src/data/servers.ts`: `[{id:"erathia", name:"Erathia", open:true}]`) drives
the server-select UI. Adding "Server 2" later = one array entry (each server
gets its own lobby singleton + chat room; game-room DOs are already one-per-room
and scale horizontally regardless). Ratings stay global across servers (one
`profiles` row per account) — simplest and matches "many servers, one identity".

### D4. Chat: dedicated realtime channels, never in GameState

- **Lobby chat:** lives in the per-server lobby singleton (extend
  `party/lobby.ts` or a sibling `party/chat.ts` — prefer a sibling so the
  directory DO stays small): WebSocket per lobby visitor, ring buffer of the
  last 200 messages in DO storage, message = `{id, userId, nickname, text, ts}`.
- **Room chat:** new message types on the existing room DO
  (`ClientMessage`/`ServerMessage` unions in `party/index.ts` — e.g.
  `{type:"chat", text}` / `{type:"chat-log", messages}`), ring buffer of the
  last 500 per room under its own storage key (NOT inside the game snapshot),
  broadcast to room connections alongside (not inside) snapshots. Works in
  setup lobby, adventure, and combat because the room connection is the same.
- **Built-in backend parity:** same message shapes over the existing SSE stream
  + a POST endpoint, store in the room record's sibling map (in-memory).
- Rate limit (e.g. 5 msgs/10s/user), max length 500 chars, server-side
  sanitation (plain text only). Sender identity is the **verified** userId
  (D2); guests (flag off) chat under their display name.
- Admin/moderation: admin can delete a message (tombstone broadcast) and mute a
  user per room/lobby (Phase 7).

### D5. Match results, MMR, Hall of Fame: server-reported, DB-stored

- **Source of truth for "game over"** is the engine: win conditions already
  resolve in-engine (README "Win conditions"; eliminations, conquest, grail…).
  The room server (both backends) detects the transition into a finished state
  inside its action pipeline (NOT the client), assembles
  `{matchId, serverId, roomId, startedAt, finishedAt, ranked, participants:
  [{userId, seat, faction, result: win|loss|draw|abandon}]}` and POSTs it once
  to `POST /api/match-results` authenticated by shared secret
  `MATCH_REPORT_SECRET` (env on PartyKit + Next). `matchId` = roomId + game
  seed → unique constraint makes reporting idempotent.
- **Ranked gate:** a match is `ranked` only if the room was **Locked (hosted)**
  and ≥2 distinct verified accounts finished it. Open rooms and solo/guest
  tables record nothing (they're the casual/testing mode by design).
- **MMR = Elo, K=32, start 1200**, computed in a single Postgres function
  (transactional with the match insert; multiplayer games pairwise vs winner or
  simple winner-takes-field — Phase 6 fixes the exact formula and tests it).
  Stored on `profiles` (`mmr`, `wins`, `losses`, `matches`).
- **Hall of Fame** = a read-only page querying a `hall_of_fame` view (nickname,
  wins, losses, matches, mmr), sortable, paginated, cached ~60s.
- Guests never appear: no account, no row.

### D6. Scale verdict: keep PartyKit/Durable Objects, fix the two real limits

PartyKit (Cloudflare DOs) is the right architecture for this game's scale
(hundreds of concurrent rooms = hundreds of isolated DOs; the platform shards
them natively; hibernation keeps idle rooms free). **Do not migrate carriers.**
PartyKit's OSS/vendor status (acquired by Cloudflare) is a watch-item, but the
code is already portable: all room/directory/map logic lives in isomorphic
`src/server/*` + `src/engine/*` modules; `party/*.ts` are thin shells that
could be re-hosted on raw Cloudflare Workers + DOs with modest effort.

The two REAL technical limits to fix (Phase 2 + Phase 9):

1. **Snapshot size vs DO storage and message limits.** A late-game adventure
   `GameState` (7-field tiles, 4 players, decks, 500-entry event log
   `EVENT_LOG_LIMIT`, combat) is serialized whole on every action, stored under
   ONE storage key (classic DO storage values cap at ~128 KiB) and broadcast
   whole to every connection (workers WS messages cap at ~1 MiB). Nobody has
   measured it. **Phase 2 adds a size-regression test** (serialize a seeded
   late-game fixture, record bytes, alert threshold); if >100 KiB, implement
   chunked storage (`snapshot:0..n`) and/or gzip via `CompressionStream` before
   store/broadcast. Per-recipient redaction (Phase 2) also shrinks frames.
2. **Full-state re-broadcast bandwidth.** Acceptable now; if it becomes the
   bottleneck at scale, the upgrade path is per-connection diffs (jsondiffpatch
   or hand-rolled path patches) — deliberately deferred to Phase 9, measured
   first.

Static assets (226 MB in `public/`) are served by Vercel's CDN — fine — but
Phase 3's loading screen adds per-screen preload manifests so the game stops
popping images, and Phase 9 audits formats (webp/avif, `sharp` is already a
dev dependency). Repo growth: prefer new art in webp at bounded resolutions;
consider git-lfs only if the repo passes ~1 GB (not now, it complicates the
Vercel/CI pipeline).

The singleton lobby/chat DOs are per-server (D3), bounded by directory-write
frequency (rooms report only on signature change) — fine for hundreds of rooms
per server. If a server community outgrows one lobby DO, add servers.

### D7. UI: real routes + one shell + slot-based art/sound

- Break the single-page state machine into **routes**: `/login`, `/menu`,
  `/play` (server+room browser), keep the room/game under `/` with `?room=`
  exactly as today (deep links keep working; the in-room state machine
  `page.tsx` branches 2-5 stay). New screens are NEW components — do not grow
  `page.tsx` (4.5k lines) or `screen.tsx` (5.3k lines) further; extracting the
  existing branches into components is a stretch goal (Phase 9), not required.
- **`MenuShell` component:** full-bleed background art slot + vignette +
  centered panel + footer credit line, used by login/menu/lobby/hall-of-fame.
  Hooks `useBackgroundMusic("menu")`.
- **Art slots (`src/data/ui-art.ts`):** a typed registry mapping slot ids →
  `{src, alt, size}` — e.g. `login-backdrop`, `menu-backdrop`,
  `lobby-backdrop`, `button-frame`, `panel-frame`, `loading-banner`,
  `server-emblem-erathia`. Components consume slots, never hardcoded paths.
  Upgrading art later = dropping a new file at the manifest path (or editing
  one registry line) — zero component changes. Document required
  aspect-ratios/sizes per slot in the registry comments so image-gen prompts
  can target them (the repo already has this culture: `docs/*-art-prompts.md`).
  Ship the first pass with existing assets (`map-backdrop.jpg`,
  `setup-wallpaper.jpg`) and CSS-framed panels — slots make them replaceable.
- **Loading screens (`LoadingScreen` component):** used for (a) joining a room
  (replaces the plain-text `loadingRoot`, `page.tsx:3287`) and (b) entering the
  adventure. Real progress = preloading the screen's asset manifest
  (`Image()` promises resolved / total) + transport sync status; H3-flavored
  frame + progress bar + rotating tips, all slot-driven.
- **Sound:** new UI cues reuse `playLibrarySound` keys (`ui/*` already exists
  in `public/sounds/manifest.json` — including a `ui/chat` cue, unused today).

### D8. Granular rules: presets resolve to flags, engine reads flags

The owner wants BINH split into individually tickable options. Today ~everything
branches on `ruleset === "binh"`. Refactor:

- New shape inside `GameSetupOptions`:

  ```ts
  rules?: {
    preset: "legacy" | "binh" | "custom";
    splitDecks: boolean;      // Basic/Expert spells + Minor/Major/Relic artifacts + BINH deck extras
    unitChanges: boolean;     // BINH unit stat tweaks (Griffins/Marksmen/Skeleton HP…)
    abilityChanges: boolean;  // BINH ability/discount tweaks (Wisdom/Estates…)
    // spellBook, wog, events, parallelTurns, creatureBanks stay top-level (already separate)
  }
  ```

- One resolver `resolveRules(options): ResolvedRules` (pure, in
  `src/engine/`), memoized on state init. Presets: `legacy` → all false,
  `binh` → all true; `custom` → the ticks. **Old snapshots and the `ruleset`
  field keep working forever**: absent `rules` resolves from `ruleset` (the
  compatibility test is mandatory).
- Migration is mechanical but wide: inventory every `ruleset` read
  (`grep -rn '"binh"' src/engine src/data`), classify each into
  splitDecks/unitChanges/abilityChanges, swap to the resolved flag. Every flag
  gets behavior tests WITH controls (flag off ⇒ printed value, flag on ⇒ BINH
  value) — the existing BINH tests are the template, they mostly need
  re-pointing at flags.
- WOG stays gated as today (its own object, already granular:
  `newCreatures/commanders/newObjects`) but becomes available whenever
  `splitDecks`-equivalent preset allows — Phase 8 decides whether WOG requires
  full BINH or merely `custom` (recommendation: allow under any preset,
  it's already an independent module).

---

## 4. Data model (Supabase Postgres)

```sql
-- profiles: one row per auth user, created by trigger on auth.users insert
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nickname    text not null,
  contact     jsonb not null default '{}',       -- {discord?: string, facebook?: string, note?: string}
  role        text not null default 'player',    -- 'player' | 'admin'
  mmr         integer not null default 1200,
  wins        integer not null default 0,
  losses      integer not null default 0,
  matches     integer not null default 0,
  banned_at   timestamptz,
  ban_reason  text,
  created_at  timestamptz not null default now()
);
create unique index profiles_nickname_ci on profiles (lower(nickname));

-- matches: idempotent server-reported results
create table matches (
  id           text primary key,                 -- roomId + game seed
  server_id    text not null,                    -- 'erathia'
  ranked       boolean not null,
  started_at   timestamptz,
  finished_at  timestamptz not null default now(),
  raw          jsonb not null                    -- full report payload for audit/replay
);
create table match_participants (
  match_id   text references matches(id) on delete cascade,
  user_id    uuid references profiles(id) on delete cascade,
  seat       text not null,
  faction    text,
  result     text not null,                      -- 'win' | 'loss' | 'draw' | 'abandon'
  mmr_before integer,
  mmr_after  integer,
  primary key (match_id, user_id)
);

create view hall_of_fame as
  select nickname, mmr, wins, losses, matches
  from profiles where banned_at is null
  order by mmr desc;
```

RLS: `profiles` readable by all authenticated (public directory), writable only
by owner (nickname/contact) — role/mmr/wins/losses/ban columns only via
service-role functions. `matches*` insert only via the service-role
`report_match(payload)` RPC that also runs the Elo update in one transaction.
Availability check: `rpc check_availability(nickname, email)` (security
definer, rate-limited at the API route).

Admin bootstrap: no hardcoded account. A seeding script
(`scripts/seed-admin.ts`, run locally by the owner with the service key) or a
one-line SQL (`update profiles set role='admin' where id = ...`) promotes the
owner's registered account; §9 documents the exact steps.

New env vars (add to `.env.example` with comments, values never committed):

| Var | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + local | client auth; ABSENT ⇒ guest mode |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (server only) | match reporting, admin ops |
| `SUPABASE_JWT_SECRET` | PartyKit | verify tokens on the edge |
| `MATCH_REPORT_SECRET` | PartyKit + Vercel | authenticates room→API match reports |
| `HOMM3BG_ADMIN_KEY` | (existing) | keep as break-glass override |

---

## 5. Phases

Dependency graph (F = frontend-only, no auth dependency):

```
P0 foundations ─▶ P1 accounts ─▶ P2 verified identity ─▶ P5 chat ─▶ P7 admin
      │                              │                      
      ├──────▶ P3 menu shell (F) ────┤                   P6 MMR/HoF (needs P2)
      └──────▶ P8 options menu (F, anytime after P0)     P9 scale (last)
P4 lobby v2 needs P3; chat parts of P4 need P5's channel (can ship room list first)
```

Recommended session order: **P0 → P3 → P8 → P1 → P2 → P4 → P5 → P6 → P7 → P9**
(frontend wins first — visible progress with zero external setup — then the
auth chain). P8 can also slot anywhere later if content work is more urgent.

---

### Phase 0 — Foundations: routing skeleton, MenuShell, art slots, flags

**Goal:** the screen flow exists end-to-end in guest mode; nothing else changes.

Steps:
1. Create `src/data/ui-art.ts` (slot registry, D7) seeded with existing assets;
   `src/data/servers.ts` (`erathia`).
2. Create `src/components/menu/menu-shell.tsx` (backdrop slot, panel, footer,
   `useBackgroundMusic("menu")`) and `src/components/menu/loading-screen.tsx`
   (progress = preloaded/total + status line; exported hook
   `usePreloadAssets(slotIds)`).
3. Routes: `/menu` (main menu: Single player disabled-greyed, Multiplayer →
   `/play`, Hall of Fame → `/hall-of-fame` placeholder "coming with accounts",
   Credits → `/credits`, Logout hidden in guest mode), `/play` (renders the
   EXISTING `LobbyScreen` inside `MenuShell` with a server badge "Erathia"),
   `/login` (guest-mode: a "Continue as guest" name form that writes the
   existing localStorage display name and forwards to `/menu`).
4. Landing behavior: `/` without `?room=` redirects to `/menu` (keep `?room=`
   deep links rendering the room exactly as today). Update the top-bar nav in
   `src/app/layout.tsx` (Menu / Credits).
5. Replace the plain-text joining block (`page.tsx:3287`) with `LoadingScreen`.
6. Feature-flag helper `src/lib/auth-mode.ts`: `authEnabled()` =
   `!!process.env.NEXT_PUBLIC_SUPABASE_URL`.

Tests (new): `menu-shell.test.tsx` (slots render, disabled button is disabled),
`loading-screen.test.tsx` (progress advances as preloads resolve — fake
Image), route smoke tests; e2e: `tests/e2e/menu-flow.spec.ts` (guest: land →
menu → play → create room → setup lobby appears; `?room=` deep link bypasses
menu). All existing tests must stay green (`LobbyScreen` is reused, not
forked).

Exit criteria: guest flow login→menu→play→room works with zero env vars; e2e
suite green; no `page.tsx` growth beyond the loading-block swap.

---

### Phase 1 — Accounts: register, confirm email, login, profile, admin role

**Goal:** real accounts behind the flag; guest mode untouched.

> **STATUS: SHIPPED (2026-07-03) — with a deliberate backend divergence from
> §D1.** Register / email-confirm / login / password-reset / profile / admin all
> run and are engine-tested (see the changelog entry below for the exact test
> files). The one departure from the plan: instead of Supabase, this shipped a
> **self-hosted, offline-testable account backend** (`src/server/accounts/*`) —
> the SAME in-memory + on-disk-persisted store pattern the room layer already
> uses (`game-room-store.ts`), behind a narrow interface. Why: Supabase glue
> could only be *mocked* in this repo's offline test suite (no project, no
> network), and CLAUDE.md rule 1 forbids shipping wired-but-untested code as
> "done". The store is written so a Supabase/Postgres adapter drops in later
> exactly like the PartyKit-vs-built-in transport split — the API routes and UI
> never learn which backend is live. The `NEXT_PUBLIC_SUPABASE_URL` flag still
> flips accounts on (reserved for that adapter); a new
> `NEXT_PUBLIC_ACCOUNTS_ENABLED=1` flips on the built-in backend today.
> **NOT done here (later phases, unchanged):** verified userId on the wire +
> per-connection redaction (Phase 2), real SMTP transport (the mailer is a
> pluggable seam; dev logs/captures the link — production SMTP is the documented
> swap), and automatic match-result reporting feeding MMR (Phase 6 — the store's
> `recordMatchResult` + Elo exist and are tested, but nothing calls them from a
> finished game yet, so the Hall of Fame shows the roster at the 1200 start).

Steps (as planned; the Supabase-specific ones were realised via the self-hosted
store per the status note above):
1. `npm i @supabase/supabase-js @supabase/ssr`. Client factory
   `src/lib/supabase.ts` (browser + server helpers; returns null when flag
   off). Owner does the §9 project setup checklist first (or you mock in dev).
2. Apply §4 schema as versioned SQL in `supabase/migrations/…` (checked in),
   including the `auth.users → profiles` trigger and RPCs.
3. `/login` (flag on): tabs **Sign in** / **Register**. Register = nickname +
   email + password (+ optional contact fields Discord/Facebook, stored to
   `profiles.contact` — with helper text "so other players can reach you").
   On submit: availability RPC first (specific "nickname taken" / "email
   already registered" errors, owner requirement), then `signUp` with
   `emailRedirectTo` → `/login?confirmed=1`; show "check your inbox" state.
   Sign-in errors surface Supabase's message ("Invalid login credentials",
   "Email not confirmed") verbatim but styled. Forgot-password link uses
   Supabase reset flow (`/reset-password` route).
4. Session: `@supabase/ssr` cookie session; `/menu` and `/play` redirect to
   `/login` when flag on and signed out; Logout button calls `signOut` →
   `/login`. Nickname becomes the display name everywhere the current
   localStorage name is read (`src/lib/identity.ts` gains
   `getIdentity(): {clientId, displayName, userId?, token?}`).
5. Profile editor: a small `/profile` route (nickname read-only for now,
   contact fields editable) linked from the main menu.
6. Admin seeding: `scripts/seed-admin.ts` (service key, promotes an email to
   role=admin) + §9 doc. No credentials in the repo.

Tests: component tests for both tabs (error rendering for taken nick, wrong
password, unconfirmed email — Supabase client mocked); an integration test for
the availability RPC route (mocked supabase server client); e2e stays in guest
mode (CI has no Supabase) — add one flag-on e2e that runs only when
`PW_SUPABASE=1` locally.
Exit criteria: with a real Supabase project configured, a new user can
register, receive a confirmation email, confirm, log in, set Discord contact,
log out; wrong password / duplicate nick / duplicate email each show their
specific message; guest mode (flag off) byte-for-byte unchanged in CI.

---

### Phase 2 — Verified identity on the wire + per-connection redaction

**Goal:** close the two documented trust/privacy gaps (D2); measure snapshots.

> **STATUS: SHIPPED (2026-07-03) — with the same self-hosted divergence as
> Phase 1.** Both documented gaps are closed and engine-tested (each claim has a
> test that fails if the wiring is removed, with a forged-id / guest-table /
> open-table control):
> - **Verified-identity seats.** `RoomMember.userId` + `RoomMembershipState.
>   requireAuth` + the `SET_ROOM_REQUIRE_AUTH` action; `roomActionGuard` binds a
>   signed-in actor by their verified account id (a spoofed `actorClientId` no
>   longer grants a seat) and refuses a guest acting for a verified seat; one
>   account = one seat (a second tab rebinds to the same member); `joinRoom`
>   stamps the id. `ENGINE_PROTOCOL_VERSION` bumped 14 → 15. Tests:
>   `verified-identity-seats.test.ts`.
> - **Transport binding.** The built-in backend reads the verified id from the
>   httpOnly session cookie in `/api/rooms/**` (`verified-seat-authority.test.ts`).
>   The PartyKit edge — which per §D2 cannot read that cookie cross-origin —
>   verifies a short-lived **socket ticket** the client mints same-origin
>   (`/api/auth/socket-token`) via a callback to `/api/auth/verify-token`. The
>   divergence from the plan: the ticket + callback replace Supabase's client-held
>   JWT, because the self-hosted session (Phase 1) is httpOnly-cookie-only. The
>   isomorphic resolver + both routes are tested (`verified-actor.test.ts`,
>   `account-store.test.ts` ticket cases); the actual Workers socket handshake is
>   deploy-only-verifiable, like the rest of `party/index.ts`.
> - **Per-connection redaction.** `redactStateForSeat` (built ON `getPlayerView`,
>   so the two never drift) redacts each hosted-room frame to the recipient's own
>   seat on every surface of both backends. It keeps the frame a `GameState` the
>   existing client renders unchanged — `redact-state.test.ts` proves
>   `getPlayerView(redacted, seat)` deep-equals `getPlayerView(state, seat)`, and
>   `room-redaction.test.ts` asserts on the serialized frame. Open tables keep the
>   shared full-frame fast path.
> - **Snapshot size guard.** `state-size.test.ts` records a seeded 4-player game
>   (~27 KiB) against a 100 KiB budget — well under the ~128 KiB DO value cap, so
>   gzip/chunking is NOT needed yet (the test is the tripwire that says when it is).
>
> Env for the edge: set `HOMM3BG_APP_URL` on the PartyKit party (the app origin it
> calls back for token verification); unset ⇒ the edge stays guest-only, unchanged.

Steps:
1. Thread `token` through `connectRoom`/`connectPartyRoom`/`connectApiRoom`
   (`src/lib/realtime.ts`) and the lobby/maps fetches.
2. PartyKit: verify JWT in `onBeforeConnect`/`onRequest` (`jose`,
   `SUPABASE_JWT_SECRET`); attach `{userId, nickname}` to connection state;
   in `onMessage`, override any client-claimed actor identity with the
   verified one before `applyAction`. Flag off / no token ⇒ current guest
   behavior (explicitly allowed; hosted rooms created by signed-in users can
   set `requireAuth: true` to reject guest joins — room-level option).
3. Built-in backend: same verification in `src/app/api/rooms/**` routes.
4. Engine: `RoomMember.userId?`, `roomActionGuard` prefers userId; "1 account
   = 1 seat" invariant in Locked rooms (a userId may hold at most one seat;
   second tab joins as the same member). Bump `ENGINE_PROTOCOL_VERSION`.
5. **Per-connection redaction:** on broadcast, send each connection
   `getPlayerView(state, itsSeat)` instead of the raw state (both backends).
   The redactor exists (`src/engine/player-view.ts`); the work is the
   per-connection seat bookkeeping + making the client consume the view shape
   on the socket path + keeping observers on the observer view. This also
   shrinks frames (D6).
6. **Snapshot size guard:** new test `src/engine/state-size.test.ts` —
   serialize a seeded 4-player late-game fixture, log bytes, assert under an
   explicit budget constant (start 100 KiB; if the fixture already exceeds it,
   implement gzip via `CompressionStream` in `party/index.ts`
   storage+broadcast in THIS phase and store chunked `snapshot:<i>` keys).

Tests: engine tests for the userId guard + one-seat invariant (with forged-id
controls: claimed clientId ≠ verified userId is rejected); transport tests for
redaction (a second connection's frames never contain another hand's card ids
— assert on the serialized frame, not the rendered DOM); size test above.
Exit criteria: forging `actorClientId` no longer grants a seat when auth is on;
devtools on a second client shows redacted frames; documented gap notes in
`docs/multiplayer-platform-plan.md` updated to "fixed, see tests X/Y".

---

### Phase 3 — Main menu & loading polish (can run right after P0)

**Goal:** the pre-game screens feel like a studio game.

Steps: style pass on `/menu`, `/login`, `/play` inside `MenuShell` — layered
backdrop + panel frames + H3-flavored buttons (CSS on existing tokens; art via
slots), hover/press sounds (`playLibrarySound("ui/…")`), animated transitions
(CSS only), version + non-profit footer. Loading screen gets rotating flavor
tips and per-screen preload manifests (menu backdrop, lobby art, faction
emblems). Credits page gets the same shell.
Tests: snapshot-free component assertions (slots consumed, sounds fired via
mock), e2e visual smoke.
Exit criteria: owner-visible: opening the app lands on a themed menu with
music; all buttons present (Single player greyed); loading bar visibly
progresses on room join.

---

### Phase 4 — Multiplayer lobby v2: server badge, room list, create dialog

**Goal:** the real multiplayer front door.

Steps:
1. Server select strip (one card: Erathia — emblem slot, online-count badge
   from the lobby DO's connection count; D3's id plumbing:
   lobby singleton id `directory:erathia`, room ids `erathia-…`; keep
   backwards compatibility by treating un-prefixed ids as erathia).
2. Room list upgrade (`src/components/lobby.tsx` or a v2 sibling): columns —
   name, host, players `seated/total`, mode chip **Open**/**Locked**, status
   (Setting up / In progress / Round N), join button; filters (hide
   in-progress, search by name); auto-refresh stays 5s polling (fine), plus
   refresh button.
3. **Create-room dialog:** name, mode (Open = `hosted:false` free seat
   switching, for casual/testing; Locked = `hosted:true`, host assigns seats,
   1 nick 1 seat — reuses the ENGINE's existing two modes, `SET_ROOM_HOSTED`
   at creation), max players, optional `requireAuth` (P2). Creating a Locked
   room seats the creator as host (existing `JOIN_ROOM`+`SET_ROOM_HOSTED`
   semantics — verify order in `src/engine/room.ts` tests).
4. Directory record already carries `hosted` (`lobby-registry.ts`) — surface
   it; add `serverId` to `LobbyRoomRecord`.

Tests: lobby v2 component tests (mode chips, filters, create dialog dispatch);
`lobby-registry` tests extended for serverId; e2e: create Locked room → second
browser context joins → cannot self-seat → host assigns seat (this e2e already
half-exists in room-panel coverage; extend `tests/e2e/`).
Exit criteria: two browsers: one creates a Locked room from the dialog, the
other joins from the list and is seat-locked; Open room allows free switching;
list shows both with correct chips.

---

### Phase 5 — Chat: lobby + in-game

**Goal:** talk everywhere (D4).

Steps:
1. `party/chat.ts` (per-server singleton `chat:<serverId>`): WS chat with a
   200-message ring buffer in storage; built-in-backend twin (in-memory + SSE
   endpoint `/api/chat/[serverId]`). Client `src/lib/chat.ts` mirrors the
   `realtime.ts` backend-picking pattern.
2. Room chat: extend `ClientMessage`/`ServerMessage` in `party/index.ts` with
   `chat`/`chat-log` (+ the SSE/POST twin in `src/app/api/rooms/**`); 500-msg
   ring buffer under its own DO storage key; identity = verified userId when
   auth on, display name otherwise.
3. UI: `ChatPanel` component — docked panel in `/play` (lobby chat); in-room
   chat as a collapsible drawer available in ALL THREE in-room screens (setup
   lobby, adventure map, combat — mount it once in `page.tsx` chrome, outside
   the five-branch switch), unread badge, `ui/chat` sound cue on receive
   (exists in the sound manifest, currently unused), Enter-to-send, timestamps.
4. Rate limit + 500-char cap server-side; simple client echo suppression.

Tests: ring-buffer/rate-limit unit tests (isomorphic module, both backends
share it — follow the `lobby-registry.ts` pattern); component test (send
renders optimistically, unread badge increments when drawer closed); e2e:
two contexts exchange lobby + room messages.
Exit criteria: two browsers chat in the lobby and inside a running game
(including during combat); a third joining the room sees the last messages;
reloading keeps history (PartyKit path); rate limit provably enforced (test).

---

### Phase 6 — Match results, MMR, Hall of Fame

**Goal:** persistent competition (D5).

Steps:
1. Isomorphic `src/server/match-report.ts`: detect finished game inside the
   action pipeline (engine exposes the terminal state — locate the win/
   elimination resolution in `src/engine/` and export a
   `getMatchOutcome(state)` selector), build the idempotent report, POST with
   `MATCH_REPORT_SECRET` (PartyKit `fetch` to the Vercel API; built-in backend
   calls the handler directly).
2. `POST /api/match-results`: verify secret → service-role RPC
   `report_match(payload)` (insert + Elo in one transaction; duplicate matchId
   = no-op). Elo: winner vs each loser pairwise, K=32, floor 100 — the exact
   formula lives in ONE pure function `src/server/elo.ts` with table-driven
   tests (2p win/loss, 4p, draw/abandon rules: abandon = loss, others
   unaffected? — DECIDE in-code with a comment + test, recommendation:
   abandon counts as a loss for the leaver only, no MMR gain for others in
   unfinished games).
3. Hall of Fame page `/hall-of-fame` (MenuShell): rank, nickname, MMR, W/L,
   matches; sortable; pagination; "unranked until 5 ranked matches" chip.
   Flag off ⇒ friendly "accounts disabled on this deployment" panel.
4. Post-game screen surfaces the MMR delta to participants.

Tests: `elo.test.ts` (property: zero-sum per pair; monotonicity); RPC handler
test (idempotency — same matchId twice mutates once; **observable outcome
test:** report a ranked match, assert both profiles' mmr/wins/losses moved to
the exact expected numbers, then assert hall_of_fame ordering flipped);
`getMatchOutcome` engine test seeded to a real conquest finish (fails if
detection wiring is removed).
Exit criteria: finish a real Locked 2-account game on a configured deployment
→ both Hall of Fame rows update correctly; unranked/open games provably do NOT
write (control test).

---

### Phase 7 — Admin panel & moderation

**Goal:** BINH governs the platform from the UI.

Steps:
1. `/admin` route, gated on `profiles.role === 'admin'` (server-checked; 404
   for others). Sections: **Rooms** (all servers: list via lobby DOs, force-
   close any room — reuse the existing `HOMM3BG_ADMIN_KEY` wipe path but
   trigger it server-side from a verified-admin API route), **Players**
   (search profiles; delete account [service role, cascades]; ban/unban with
   reason — banned users fail login gate + socket verification), **Chat**
   (delete message → tombstone broadcast; mute user in lobby/room).
2. Enforcement points: ban check in the JWT verification path (P2) on both
   backends; deleted rooms broadcast the existing `closed` frame.
3. Audit log table (`admin_actions`) — every admin op recorded.

Tests: authorization tests FIRST (non-admin gets 404/denied on every admin
route — the control matters more than the happy path); ban blocks login and
socket connect (mocked); force-close drops connected clients to the lobby
(reuses existing `closed`-frame tests as template).
Exit criteria: admin account can close any live room, ban a nick (that user
can no longer sign in), delete a nick; every op appears in the audit table; a
regular account can do none of it (tested).

---

### Phase 8 — Game-options menu reorganization (granular rules, studio feel)

**Goal:** the create-scenario screen the owner described (D8).

Steps:
1. **Engine first:** add `rules` to `GameSetupOptions` + `resolveRules()`
   (D8). Inventory every `ruleset === "binh"` branch (grep in `src/engine`,
   `src/data`) → classify into `splitDecks` / `unitChanges` /
   `abilityChanges` → swap reads. Compatibility: absent `rules` derives from
   `ruleset`; old snapshots load unchanged (test with a committed legacy
   fixture). Bump `ENGINE_PROTOCOL_VERSION`.
2. Per-flag behavior tests with controls (e.g. `unitChanges:false` ⇒ Few
   Griffins printed 2 attack; `true` ⇒ 3 — re-point the existing BINH tests;
   every flag needs at least one moved-value assertion per §0 rule 2).
3. **UI reorganization** of `GameOptionsPanel` (`screen.tsx:3833`): group into
   tabs/sections — **Rules** (preset selector Legacy/BINH/Custom + the three
   ticks + Spell Book + WOG module ticks), **Scenario** (map, players,
   difficulty, win condition, PvP cost), **Economy** (resources, production,
   units, buildings), **Optional modules** (Events, Creature Banks —
   ADD THE MISSING `creatureBanks` TOGGLE, Parallel turns, tile options).
   Fix the Events `?? false` default mismatch (`screen.tsx:4019`) while there.
   Every control gets a one-line rules tooltip. Section frames + toggle
   buttons consume art slots (D7) so real button/frame art can drop in later.
4. Non-host/observer view stays read-only summary (exists today — preserve).

Tests: options panel component tests (preset→ticks resolve, custom persists,
sections render; dispatched `SET_GAME_OPTIONS` shape asserted); engine
resolver tests incl. legacy-snapshot compatibility; e2e: flip Custom + one
flag, start game, observe the flag's effect (e.g. Griffin stat on the unit
card) — the observable-outcome bar.
Exit criteria: a host can run "BINH but printed unit stats" (splitDecks on,
unitChanges off) and the game provably plays that way; Legacy/BINH presets
byte-identical to today's two modes (regression suite green); creatureBanks
finally has a UI switch.

---

### Phase 9 — Scale & performance hardening (last, measured)

**Goal:** the D6 watch-items, driven by measurements not guesses.

Steps: run the size guard across seeded early/mid/late fixtures and a real
long game; implement gzip+chunking if not already forced in P2; evaluate
per-connection diff frames ONLY if bandwidth measurably hurts; code-split the
monolith (dynamic-import the combat/adventure branches out of `page.tsx`;
target: menu route ships without the 4.5k-line table bundle); asset audit
(convert stragglers to webp/avif via `sharp` script, cap dimensions, verify
Vercel cache headers); lobby DO write-frequency check under a 50-room
synthetic test; document git-lfs decision point (~1 GB repo).
Exit criteria: recorded before/after numbers in this doc's changelog (bundle
KB for /menu, snapshot bytes, frame bytes); no functional regressions (full
suite + e2e green).

---

## 6. What this plan deliberately does NOT cover (say so, per CLAUDE.md)

- **Single player vs AI** — the button ships greyed out by design.
- **Friends/parties, private messages, matchmaking queues** — Hall of Fame +
  room list is the competitive surface for now.
- **Replays** — `matches.raw` stores the report, not the action log; a replay
  system would build on the event log later.
- **i18n** — copy stays English; do not hardcode NEW strings in ways that
  block extraction later (prefer one constants module per screen).
- **Payment/donations** — never (non-profit constraint in BUILD_BLUEPRINT).
- **Migrating off PartyKit** — explicitly rejected for now (D6); portability
  is preserved instead.

## 7. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Supabase email rate limits during testing | Built-in mailer for dev only; §9 SMTP before launch; resend-confirmation button with cooldown |
| Late-game snapshot already >128 KiB on DO storage | Measured in P2 step 6; gzip+chunking is in-scope there, not deferred |
| `ruleset` refactor (P8) touches many engine files | Mechanical classification + per-flag control tests + legacy-fixture compatibility test; presets must reproduce today's modes exactly |
| Guest mode regressions while adding auth | Flag-off CI is the default; every phase's exit criteria include the existing suites green |
| Account enumeration via availability check | Rate-limited endpoint; documented, owner-accepted trade-off (D1) |
| Version skew between Vercel and PartyKit | Existing `ENGINE_SIGNATURE` banner + CI deploy workflow; bump protocol version per §0.6 |
| Singleton lobby/chat DO contention | Per-server partitioning (D3); rooms report on signature change only |

## 8. Suggested commit/PR slicing per phase

One PR per phase, one logical commit per numbered step where practical. PR
description template: **What does NOT work yet** (first), what runs + the
named tests, screenshots/GIFs for UI phases, env/setup changes for the owner.

## 9. Owner (BINH) setup checklist — humans only, agents cannot do these

1. Create a Supabase project (free tier). Copy URL + anon key + service-role
   key + JWT secret.
2. Vercel env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `MATCH_REPORT_SECRET` (any long random
   string). PartyKit env (`npx partykit env add`): `SUPABASE_JWT_SECRET`,
   `MATCH_REPORT_SECRET`, keep `HOMM3BG_ADMIN_KEY`.
3. Supabase Auth settings: enable email confirmations; set site URL to the
   Vercel domain; add `/login` redirect URLs.
4. (Before public launch) plug a free SMTP provider (e.g. Resend) into
   Supabase Auth → SMTP, so confirmation mails are not rate-limited.
5. Register your own account in the app, then run
   `npx tsx scripts/seed-admin.ts your-email@example.com` (Phase 1 ships it)
   — that account becomes the admin. No password ever lives in the repo.
6. When Phase 1 lands: run the SQL migrations (`supabase db push` or the
   dashboard SQL editor, files under `supabase/migrations/`).

## 10. Changelog

- 2026-07-03 — initial plan authored (grounded against the repo as of this
  date; §1 inventory verified by direct code inspection).
- 2026-07-03 — **Phase 0 shipped** (menu shell, pre-game routes, art slots,
  loading screens; guest flow end-to-end, zero env vars).
- 2026-07-03 — **Phase 1 shipped** (accounts, store, admin, mail linking) on a
  **self-hosted backend** rather than Supabase (see the Phase 1 status note for
  the why; guest mode is byte-for-byte unchanged and stays the CI default).
  What runs and where the failing-if-removed tests live:
  - `src/server/accounts/` — the store + primitives. `crypto.ts` (scrypt
    password hash + one-time/session tokens; `crypto.test.ts`), `validation.ts`
    (nickname/email/password/contact rules; `validation.test.ts`), `elo.ts`
    (K=32 winner-takes-field ratings; `elo.test.ts`), `mailer.ts` (pluggable
    transport — capture/console shipped, SMTP is the documented production
    swap), `account-store.ts` (`account-store.test.ts`: register → confirm →
    login, distinct nickname-taken vs email-registered errors, login-blocked-
    until-confirmed, token/session expiry with a fake clock, password reset that
    revokes old sessions, ban kills live sessions + blocks login, delete frees
    the nick/email, idempotent `recordMatchResult` moving MMR 1200→1216/1184 and
    reordering the Hall of Fame, persistence round-trip).
  - `src/app/api/auth/*` + `src/app/api/admin/players` +
    `src/app/api/hall-of-fame` — the routes (`auth-routes.test.ts` drives the
    real handlers: full happy path with a working session cookie, distinct 409s,
    IP rate-limited availability, reset-via-emailed-link, and admin authorization
    with the non-admin-denied CONTROL). Verified additionally over real HTTP
    against `next start`.
  - `src/lib/auth-client.ts`, `src/lib/identity.ts` (`getIdentity()` +
    account cache; `identity.test.ts`), `src/lib/auth-mode.ts`
    (`NEXT_PUBLIC_ACCOUNTS_ENABLED` OR `NEXT_PUBLIC_SUPABASE_URL`).
  - UI: `/login` Sign-in/Register tabs + confirm + forgot-password
    (`account-auth.test.tsx`; guest form preserved when the flag is off),
    `/profile`, `/admin`, `/reset-password`, Hall-of-Fame wired to real data,
    `/menu` logout/profile/admin. `scripts/seed-admin.ts` + `.env.example`
    document the owner setup.
  - Full suite green: 3695 vitest tests, typecheck, lint, `next build`.
- 2026-07-03 — **Foundation hardening pass** (durability + scale groundwork for
  a growing player base; each item has a failing-if-removed test):
  - **Atomic persistence** (`src/server/atomic-file.ts`, used by the accounts,
    room and shared-map stores): snapshots now write temp-file + rename, so a
    crash mid-write can no longer truncate `accounts.json` (the entire user DB)
    or a room file. `atomic-file.test.ts`.
  - **AccountStore hygiene**: expired sessions/tokens + spent rate windows are
    pruned on every persist (the snapshot no longer grows a dead row per
    abandoned visitor); the `recordedMatches` idempotency log is FIFO-capped
    (default 10 000); sessions now really SLIDE (renewed past half-life —
    the doc had promised it, the code didn't do it); the public Hall of Fame
    payload is capped at the top 100. `account-store.test.ts` ("hygiene").
  - **Auth abuse bounds**: `/api/auth/register` (10/10 min/IP — each register
    fires a real email) and `/api/auth/login` (20/5 min/IP — rotating
    identifiers burned scrypt CPU) are now IP rate-limited like the other
    probe routes, and the IP window map sweeps its expired rows. The ipRate
    map is resolved through `globalThis` per call so test resets really work.
    `auth-routes.test.ts` ("per-IP rate limits").
  - **Broadcast/lobby scale**: room snapshot fan-out clones once per action
    instead of once per LISTENER (was O(state × clients) JSON roundtrips);
    the lobby's disk scan caches parsed room files by mtime+size instead of
    re-parsing every room on every 5 s poll. `game-room-store.test.ts`
    ("lobby disk-scan cache").
  - **UI**: the room browser gains a filter box (name/host/creator) once the
    list reaches 6 rooms (`lobby.test.tsx`); the table chat panel closes on
    Escape (`chat-panel.test.tsx`).
- 2026-07-03 — **Phase 2 shipped** (verified-identity seats + per-connection
  wire redaction) on the self-hosted backend (ticket callback in place of a
  Supabase JWT; see the Phase 2 status note). Both documented trust/privacy gaps
  are closed, each pinned by a failing-if-removed test with a forged-id /
  guest-table / open-table control:
  - **Engine** (`src/engine/room.ts`, `state.ts`, `reducer.ts`, `player-view.ts`,
    `version.ts`): `RoomMember.userId`, `RoomMembershipState.requireAuth`, the
    `SET_ROOM_REQUIRE_AUTH` action, the verified-first `roomActionGuard`, the
    one-account-one-seat `joinRoom`, `seatForViewer`, and `redactStateForSeat`.
    Protocol bumped 14 → 15. Tests: `verified-identity-seats.test.ts`,
    `redact-state.test.ts`, `state-size.test.ts`.
  - **Built-in backend**: `/api/rooms/**` resolve the verified id from the session
    cookie and redact every returned snapshot to the requester's seat
    (`verified-seat-authority.test.ts`, `room-redaction.test.ts`).
  - **PartyKit edge**: socket-ticket auth (`/api/auth/socket-token` +
    `/api/auth/verify-token`, the isomorphic `src/server/verified-actor.ts`
    resolver) and per-connection redacted broadcast; the ticket store cases live
    in `account-store.test.ts`, the resolver + route chain in
    `verified-actor.test.ts`. The Workers socket handshake itself is deploy-only,
    like the rest of `party/index.ts`.
  - **Client**: `connectRoom` threads a `SocketTokenProvider`; the signed-in
    player mints a ticket per (re)connect for the cross-origin edge, while the
    built-in backend rides the same-origin cookie.
  - Full suite green: 3806 vitest tests, typecheck, lint.

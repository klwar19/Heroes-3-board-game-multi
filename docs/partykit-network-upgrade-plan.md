# PartyKit Network Upgrade — Advice Evaluation & Implementation Plan

- Status: **PLAN ONLY — nothing in this document is implemented.** It exists so a
  later agent can implement the slices below one at a time. Every "already done"
  claim cites the file that proves it; re-verify citations before building on them.
- Audit date: 2026-07-15 (repository state on branch
  `claude/partykit-network-upgrade-plan-q064db`, forked from `main`).
- Input: an external 9-point advice list (partysocket, optimistic UI, throttling,
  payload shrinking/MessagePack, room geolocation, CDN cache verification,
  preconnect, edge image optimization, WebSocket init placement).
- Relationship to `docs/multiplayer-performance-scaling-upgrade-plan.md` (the
  "scaling plan"): that document remains the **sequencing authority** for the
  room transport, browser rendering, and lobby scaling. This document does NOT
  replace it. It (a) grades the external advice against the current code so
  nobody re-implements what already exists, and (b) adds five small,
  independent network slices (N1–N5) that the scaling plan does not cover.
  Where an advice item overlaps a scaling-plan phase, the verdict here says so
  and defers to that phase — do not fork a second delta/compression effort.

## 0. Leading with what does NOT change and what is deliberately rejected

- No transport rewrite, no protocol change, no engine (`src/engine`) rule change
  is proposed here. Slices N1–N5 are additive and individually revertible.
- **Full optimistic UI (client-side prediction + rollback) is REJECTED as
  impossible-by-design in this codebase** — not merely deferred. See §1.2. Only
  a bounded, presentation-only "pending action echo" is planned (N2).
- MessagePack/binary encoding, Cloudflare Image Resizing, per-room region
  segmentation, and message throttling are rejected or N/A for this game
  (§1.3–§1.8, §3). Do not implement them off the back of the advice list.
- The scaling plan's already-implemented Slice A (partysocket + health
  ping/pong + ack-only action results + snapshot arbiter + watchdog) is treated
  as fact and NOT re-planned; its "Next implementation order" (cue extraction,
  lobby push, render isolation, retry persistence, protocol v2 last) stands.

## 1. Verdict on each advice item (graded against the actual code)

### 1.1 "Use `partysocket`, not native WebSockets" — ALREADY DONE

`src/lib/realtime.ts` imports `PartySocket` (line 3) and the room transport is
built on it, including pieces the advice doesn't even mention:

- automatic reconnection with an async `query` re-resolved per (re)connect so an
  expired socket ticket is re-minted (`buildQuery`, realtime.ts ~line 224);
- application-level health `ping`/`pong` with a 35 s silence probe, 5 s pong
  timeout, forced `socket.reconnect()` and a parallel seat-authoritative HTTP
  recovery fetch (realtime.ts ~lines 428–472, `refetchSeatSnapshot` ~line 293);
- wake/focus resync (`onWake`), drop detection re-arming the join guard, and a
  version-gated `sync` request when a pong reveals a newer server version.

Behaviour is pinned in `src/lib/realtime.test.ts` (ping/pong, wake probe,
ack-only results, recovery refetch). **Nothing to do.** An implementing agent
must not swap or wrap this layer.

### 1.2 "Optimistic UI — apply locally, roll back on rejection" — ADAPT (bounded); full prediction REJECTED

Why full client-side prediction cannot work here (do not attempt it):

1. **Randomness is server-salted per action, on purpose.** The engine derives
   every random outcome from seeded RNG, but the authoritative server mints
   fresh crypto entropy for EVERY action (`ReducerOptions.entropy`,
   `src/engine/reducer.ts` lines ~474–480, applied at ~18297 via
   `setActiveEntropy`; rationale documented in `src/engine/random.ts` lines
   7–30). This is an anti-cheat property: a client that knew the game seed must
   NOT be able to predict dice, shuffles, or tile flips. A predicting client is
   therefore guaranteed-wrong on any action that touches a die or a shuffle.
2. **The client does not have the true state.** Hosted frames are seat-redacted
   server-side (`redactSnapshotForActor`, `party/index.ts` line 610): deck
   order, opponents' hands, face-down tiles are masked. A local reducer run on
   redacted state diverges immediately for draws/reveals.
3. **Rollback cost is disproportionate.** The reducer is ~18.6 k lines with
   deep cascades (a move can trigger a visit, a draw, a combat). Reconciling a
   mispredicted cascade against the authoritative broadcast is exactly the
   "weird behavior" class of bug this repo's rules exist to prevent.

What the advice is really after is *felt* latency. The correct adaptation for a
turn-based, server-authoritative game is **instant presentation-level
acknowledgment with zero authoritative prediction** — slice N2. Note the
codebase already does this for the highest-frequency case: a player's own hero
move renders an instant client-side path arrow (see CLAUDE.md, single-player
section: "A human's own move keeps its instant path arrow").

### 1.3 "Throttle high-frequency data (cursors, drags, 15–30/s)" — N/A

There is no continuous stream to throttle: no shared cursors, no drag
coordinates, no per-frame positions. Clients send discrete game actions; the
server broadcasts on state change only. The only recurring chatter is (a) the
35 s health ping (already minimal; `ping` returns `pong` without serializing a
snapshot — scaling plan §7.3) and (b) the lobby's 3 s HTTP polling, which is
already scheduled to become push in scaling-plan Phase 2. **Nothing to do
here; do not add throttling machinery.**

### 1.4 "Shrink payloads — send diffs; consider MessagePack" — COVERED BY SCALING PLAN (deltas), REJECT MessagePack for now; one new cheap slice added (N4)

- **Diffs**: this is scaling-plan Phase 4 (protocol v2 seat-redacted JSON-patch
  commits with full-snapshot recovery), deliberately sequenced AFTER
  exactly-once ingestion, lobby push, and render isolation are measured. That
  sequencing was chosen to avoid changing the wire format while ingestion
  correctness was still being stabilized — keep it. Do not start a second,
  competing delta implementation from this document.
- **MessagePack**: rejected at this time. The snapshot is text-heavy JSON
  (ids, names, event log strings) where MessagePack's wins are small;
  Cloudflare/PartyKit WebSockets can negotiate `permessage-deflate`, and the
  scaling plan (§10.4) already requires inspecting real production compression
  before adding any application-level encoding. A binary format would also make
  the privacy/redaction test surface (scan serialized frames for hidden info)
  and on-call debugging materially harder for an unmeasured gain. Revisit only
  with production frame-size measurements in hand, after Phase 4.
- **What IS worth doing now**: the measured frame is dominated by the event
  log — the scaling plan's audit (§3) measured a representative late-game
  snapshot at 49,553 bytes with ~22.1 KiB (~45%) being `eventLog`
  (`EVENT_LOG_LIMIT = 500`, `src/engine/events.ts` line 11). Every hosted
  action re-sends that tail to every connection — including trivially small
  intents: `SEND_CHAT` is an engine action (`src/engine/chat.test.ts`), so one
  chat line costs a full ~48 KiB × N-connections broadcast. Slice N4 below
  trims the *broadcast* event tail behind a flag without touching storage,
  as a safe pre-Phase-4 experiment.

### 1.5 "Understand room geolocation" — ACKNOWLEDGE; no per-room fix exists; adopt the observable half (N3)

Correct as stated: the room Durable Object is created near the first connector
(the room creator), and a cross-continent friend joining later pays
cross-planet RTT on every action. For THIS product there is no actionable
segmentation — rooms are friend lobbies, not region-shardable pools, and
PartyKit `0.0.115` exposes no per-room location-hint API (`partykit.json` has
no such field). What we CAN do is stop this from being invisible: the client
already measures socket RTT (`room.health.pong` with `durationMs`,
realtime.ts ~line 371) but only when metric sampling is enabled
(`NEXT_PUBLIC_PERFORMANCE_METRICS_SAMPLE_RATE`, off by default —
`src/lib/performance-metrics.ts`). Slice N3 surfaces a lightweight
connection-quality indicator so "laggy" reports become diagnosable. Document
(in the lobby/help copy, optional) that the room lives near its creator.

### 1.6 "Verify cache HITs / set Cache-Control" — ALREADY DONE; keep the 7-day TTL (do NOT copy the advice's 1-year value)

- `scripts/sync-assets-to-r2.sh` stamps `Cache-Control: public, max-age=604800`
  on every object (`R2_CACHE_CONTROL` default) and lets rclone set
  Content-Type; `.github/workflows/sync-media-r2.yml` auto-syncs on push and
  purges the Cloudflare cache on `main`. Verification curls (incl.
  `cf-cache-status` and the `/cdn-check.txt` health object) are in the runbook
  `docs/cloudflare-custom-domain-cdn-plan.md` — use that, don't re-invent.
- **Do not raise to `max-age=31536000, immutable`** as the advice suggests:
  media keys are overwritten in place (same filename on art replacement), and a
  purge only clears the EDGE — browsers holding a 1-year immutable copy would
  show stale art until users hard-refresh. Filename content-hashing would be
  required first, which is a whole art-pipeline change with no current need.
  7 days + purge-on-main is the correct trade-off; leave it.

### 1.7 "Pre-connect to the media domain" — ALREADY DONE for the CDN; MISSING for the PartyKit host → slice N1

`src/components/asset-preconnect.tsx` already emits `preconnect` +
`dns-prefetch` for the CDN origin — including the subtlety the advice misses
(a second `crossorigin` preconnect for the CORS connection pool when fonts are
CDN-served). But **no hint exists for `NEXT_PUBLIC_PARTYKIT_HOST`**, and the
room page's first contact with the edge is a cross-origin HTTPS snapshot fetch
plus the WSS upgrade (`page.tsx` ~line 3512 effect: `connectRoom` +
`connection.fetchSnapshot()` in parallel). Warming DNS+TCP+TLS to the party
host during initial page load shaves a full connection setup (often 100–300 ms
cross-region) off first join and every cold reload. This is slice N1 — the
single cheapest genuinely-new win in the advice list.

### 1.8 "Edge image optimization (Cloudflare Image Resizing, WebP/AVIF)" — MOSTLY DONE; REJECT the paid resizer; small cleanup slice (N5)

Current media reality (measured on this branch): `public/assets` is 237 MiB —
1,442 `.webp`, 75 `.gif`, 67 `.png`, 26 `.jpg`; only 23 files exceed 500 KiB
(battlefield boards, a few town/hero art pieces). The heavy lifting (WebP
conversion) already happened (`scripts/png-to-webp.mjs` exists for exactly
this). Cloudflare Image Resizing is a paid feature solving a problem this
project no longer has — rejected. Slice N5 converts the remaining oversized
PNGs and audits `loading="lazy"`/`decoding="async"` on image-dense panels.
Constraint: every reference must keep flowing through `assetUrl()`
(`src/lib/asset-url.ts`) — `src/lib/asset-url-coverage.test.ts` fails on raw
literals, and renames must land in the same commit as their reference updates.

### 1.9 "Move WebSocket init outside React state / high in the tree" — ALREADY EFFECTIVELY SATISFIED; the real cost is bundle parse (scaling plan Phase 3.4)

The connection is created in a top-level `page.tsx` effect keyed only on
`roomId`/`clientId` (~line 3512), not buried in a slow-rendering child, and the
initial HTTP snapshot fetch races the socket open. What actually delays first
contact is JavaScript startup: the audited entry bundle is ~1.69 MiB raw /
374 KiB gzip (scaling plan §3) that must parse before the effect runs. That is
scaling-plan Phase 3.4 (code splitting) — implement it there, not here. The
actionable kernel of this advice item is the N1 preconnect (the handshake
overlaps bundle parse), plus one micro-adjustment folded into N1: emit the
preconnect from the root layout so it's in the initial HTML, not discovered
after hydration.

## 2. New work: slices N1–N5 (priority order, each independently shippable)

Ground rules for every slice (repo law, see CLAUDE.md):

- A slice is DONE only if the behaviour is engine/UI-enforced AND a named test
  fails when the wiring is removed. No decorative claims.
- Each slice is a separate small PR-sized change with its own flag/revert path.
- Run `npm run lint`, `npm run typecheck`, `npm run test` (vitest) before
  claiming completion; `party/` changes additionally need
  `npm run deploy:partykit` at release time (a Vercel deploy alone does NOT
  update the edge — documented footgun, CLAUDE.md single-player section).

### N1 — Preconnect to the PartyKit host (smallest, do first)

- **What**: a `PartyPreconnect` component beside `AssetPreconnect`, rendered in
  `src/app/layout.tsx`, emitting for the party origin
  (`https://<NEXT_PUBLIC_PARTYKIT_HOST>`):
  `<link rel="preconnect">` (credentialed pool — the WSS upgrade),
  `<link rel="preconnect" crossorigin>` (anonymous CORS pool — the snapshot
  `fetch`), and `<link rel="dns-prefetch">` (fallback). Mirror the dual-pool
  pattern and comment style of `asset-preconnect.tsx` (its font branch explains
  why both pools are needed). Reuse `getPartyKitHost()` from
  `src/lib/realtime.ts` for the host string, but note it returns a bare host —
  derive the scheme the same way `partyProtocol()` does (http for
  localhost/127.*, else https); consider exporting a tiny
  `partyOriginUrl()` helper from realtime.ts so the logic isn't duplicated.
- **Renders nothing** when no PartyKit host is configured (built-in backend is
  same-origin; a preconnect would be a no-op hint at best).
- **Test** (must fail if wiring removed): a component test à la the
  asset-preconnect pattern — host set → all three links present with correct
  href/crossorigin split; host unset → renders null. Stub the env var the same
  way existing tests handle `NEXT_PUBLIC_*` (module re-import or injection —
  follow `asset-url.test.ts` precedent).
- **Risk**: none to gameplay (pure `<head>` hint). Do not add `crossorigin` to
  the credentialed link — the two pools are separate on purpose.
- **Non-goal**: do not "pre-open" the actual WebSocket from the layout; the
  socket needs roomId/ticket and belongs to the room effect.

### N2 — Pending-action echo (the honest version of "optimistic UI")

- **What**: instant, presentation-only feedback in the click→ack window,
  keyed by the action `requestId` that `submitAction` already mints
  (realtime.ts ~line 487). Three concrete behaviours:
  1. **In-flight latch**: while an action of a given type/target is pending,
     the initiating control shows a subtle busy state and duplicate submits of
     the SAME action are suppressed client-side. First: AUDIT what double-click
     protection already exists in `page.tsx` around `submitAction` — add only
     what's missing; do not double-guard.
  2. **Card-play echo**: on `PLAY_CARD` submit, the card visually leaves the
     hand into a dimmed "in flight" presentation slot immediately; it is
     restored on an error result and simply dropped when the authoritative
     snapshot lands (the real state then shows the played card's effects).
  3. **Ack latency capture**: reuse the already-recorded
     `room.action.acknowledged` duration to drive the echo's "slow network"
     styling (e.g. after 400 ms show a spinner), so the echo doubles as the
     user-visible symptom of N3's RTT chip.
- **Hard boundaries** (these make it safe): the echo NEVER mutates or predicts
  `GameState`, never gates prompts/legal actions, never suppresses the
  authoritative snapshot's presentation, and always self-clears on ack, error,
  snapshot accept, or the existing 15 s submit timeout. Rollback is therefore
  "remove a CSS state", not state reconciliation.
- **Where**: a pure helper `src/lib/pending-action-echo.ts` (track/expire
  entries by requestId; pure functions so it's unit-testable) + thin wiring in
  `page.tsx` `submitAction` and the hand panel. Keep the helper free of React.
- **Tests** (fail-if-removed): unit tests for the helper (add → resolve-on-ack,
  restore-on-error, expire-on-timeout, clear-on-snapshot); a component/render
  test that a submitted card is marked in-flight and restored on error. CONTROL:
  with the echo module not wired, hand rendering is unchanged (guards against
  the echo becoming load-bearing).
- **Explicit non-goals**: no optimistic hero movement beyond the existing
  instant path arrow; no optimistic dice/draw/combat outcomes (§1.2); no echo
  for actions submitted by other seats.

### N3 — Connection-quality surface (RTT chip)

- **What**: expose the transport's measured latency to the player instead of
  only to sampled telemetry. Extend `RoomConnectionHandlers` with an optional
  `onQuality?: (q: { rttMs?: number; at: number }) => void`; call it (a) on
  every `pong` with `Date.now() - pingSentAt` (the value already computed at
  realtime.ts ~line 374 for metrics) and (b) on every `action-result` with the
  ack round-trip (already computed for `room.action.acknowledged`). This works
  with metrics sampling OFF — do not couple it to `metricsSampled`.
- **UI**: a small chip near the existing `syncStatus` indicator: green <150 ms,
  yellow <400 ms, red above; tooltip "Game room responds in ~N ms. The room
  lives near its creator — distant players see higher numbers." Keep it
  read-only presentation; no thresholds drive behaviour.
- **Note**: pongs only flow after 35 s of silence, so during active play the
  ack round-trip is the primary sample — that's fine (it's the number the
  player actually feels). Do NOT shorten the ping interval to feed the chip;
  idle Durable Objects must stay hibernation-friendly (scaling plan §7.3/§15).
- **Tests**: realtime.test.ts additions — pong delivers rttMs to the handler;
  action ack delivers rttMs; no `onQuality` handler → no crash (optional
  callback). UI render test for the chip's threshold classes.

### N4 — Broadcast event-log tail trim (flagged experiment; the safe payload win)

- **What**: hosted rooms currently rebroadcast up to 500 `eventLog` entries in
  every per-connection frame (~45% of a late-game snapshot, §1.4). Add a party
  env flag `HOMM3BG_BROADCAST_EVENT_TAIL` (integer; absent/0 = off = today's
  behaviour). When set (e.g. 150), outgoing frames in
  `party/index.ts` (`broadcastSnapshot` → `snapshotForConnection` →
  `redactSnapshotForActor` — trim in ONE shared spot so the HTTP GET,
  connect frame, and broadcast all agree) carry only the last K events.
  **Storage keeps the full 500** — the trim is wire-only, so nothing about
  persistence, reports, or the built-in backend changes.
- **Why it's safe (verify each before shipping, they are the acceptance
  bar)**: the client's exactly-once presentation is cursor-based
  (`src/lib/presentation-event-window.ts`): duplicate frames produce no events,
  and a counter gap is treated as log rotation — history is primed and live
  overlays rebuilt from STATE, not replayed from old events (scaling plan
  ledger + §9.1). A shorter tail just makes "rotation" more common. The known
  product trade-off: the on-screen feed's scrollback after a reload/reconnect
  shortens to K entries — pick K with the feed UX in mind (the feed is the ONLY
  consumer that wants depth; presentation needs recency only).
- **Tests** (fail-if-removed, each with a flag-off CONTROL): party-level test
  (pattern: `single-player-pump.test.ts` harness) asserting a >K-events room
  broadcasts exactly the last K in version order with state/version untouched,
  while flag-off broadcasts the full log; a client test asserting a frame whose
  event tail starts past the cursor primes without replay (extend
  `presentation-event-window.test.ts` if a gap-size case isn't already pinned);
  privacy unchanged (`redactSnapshotForActor` runs before/around the trim —
  add an assertion that trimming never resurrects redacted content).
- **Rollout**: enable on a staging room with
  `NEXT_PUBLIC_PERFORMANCE_METRICS_SAMPLE_RATE=1` and compare
  `room.frame.in`/`room.serialization` byte metrics before/after; ship the
  default-on value only if late-game frames shrink ≥25% with no feed/overlay
  regressions in a two-browser e2e pass. If Phase 4 (protocol v2 deltas) later
  ships, this flag becomes redundant — delete it then.

### N5 — Finish the media diet (no new infrastructure)

- **What**: (a) convert the ~23 remaining >500 KiB files (battlefield boards
  `public/assets/board/*.png`, a few town/hero pieces) to WebP via the existing
  `scripts/png-to-webp.mjs`, updating every reference through `assetUrl()` in
  the same commit (`asset-url-coverage.test.ts` + `globals.css` CDN-redirect
  coverage keep this honest; grep for the old filenames — some art is
  referenced from CSS and data files, not only TSX). Verify visual parity for
  alpha/gradient-heavy boards before deleting originals; keep any file where
  WebP artifacts are visible at the game's render size. (b) audit the
  image-dense panels (hand, decks, army, town window, card zoom) for
  `loading="lazy"` + `decoding="async"` on off-screen images; add where missing
  — measure with the existing render tests untouched (attributes are inert in
  jsdom; assert their presence, not their effect).
- **Rejected within this slice**: AVIF re-encode of the whole library (decode
  cost on low-end phones + 237 MiB re-churn through the R2 sync for marginal
  bytes over WebP) and Cloudflare Image Resizing (§1.8). The R2 sync workflow
  needs no change — new keys upload automatically on push.

## 3. Consolidated rejected/deferred register (so nobody re-litigates)

| Advice / idea | Verdict | Reason (short) |
| --- | --- | --- |
| Switch to `partysocket` | Done long ago | realtime.ts is built on it (§1.1) |
| Full optimistic prediction + rollback | **Rejected permanently** | Server-salted per-action entropy + seat redaction make correct prediction impossible by design (§1.2) |
| Throttle/debounce WS messages | N/A | Turn-based; no high-frequency stream exists (§1.3) |
| Diff/patch frames | Deferred to scaling-plan Phase 4 | Sequencing authority; don't fork it (§1.4) |
| MessagePack / binary frames | Rejected for now | Text-heavy payload, unmeasured deflate, privacy-test and debugging cost (§1.4) |
| Per-room region control | Impossible today | No PartyKit per-room location hint; rooms are friend lobbies (§1.5) |
| `max-age=31536000, immutable` on media | Rejected | In-place overwrites + edge-only purge would strand stale art in browsers (§1.6) |
| Cloudflare Image Resizing | Rejected | Paid; library is already WebP-dominant and game-sized (§1.8) |
| Pre-opening the WS before the room page | Rejected | Socket needs roomId/ticket; N1 preconnect captures the real saving (§1.9/N1) |
| Shorter ping interval to feed the RTT chip | Rejected | Would fight Durable Object hibernation; ack RTT suffices (N3) |

## 4. Sequencing and interaction with the scaling plan

1. **N1** (preconnect) and **N3** (RTT chip) — anytime, independent, no risk to
   the scaling plan's phases. Good first PRs.
2. **N2** (pending echo) — independent of scaling-plan Phase 3, but if Phase 3's
   presentation extraction is in flight, land the pure helper first and wire the
   hand-panel echo after the extraction settles (avoid editing page.tsx regions
   being moved).
3. **N4** (event tail) — conceptually a Phase-4 precursor; safe behind its flag
   at any time AFTER confirming the presentation-event-window gap tests exist.
   Delete the flag when protocol v2 ships.
4. **N5** (media) — anytime; touches no transport code.
5. Everything else the advice list raises is either done or owned by the
   scaling plan's existing "Next implementation order" — do not reorder it from
   here.

## 5. Measurement protocol (before/after, per slice)

- Enable client sampling in a staging session:
  `NEXT_PUBLIC_PERFORMANCE_METRICS_SAMPLE_RATE=1`; listen for
  `homm3bg:performance` CustomEvents (see `src/lib/performance-metrics.ts`).
  Relevant series: `room.action.input` → `room.action.acknowledged`
  (felt latency; N2's target), `room.frame.in.bytes` and server
  `room.serialization`/`room.broadcast` (N4's target), `room.health.pong`
  (N3's source).
- N1 has no in-app metric: verify via browser devtools connection timing
  (the room page's first party-host request should show 0 ms DNS/TLS when the
  hint fired) on a cold load against production.
- Keep the scaling plan's SLOs unchanged (no refresh-required desyncs, no
  duplicate presentation, p75 INP < 200 ms).

## 6. Suite/regression gate for any slice touching transport or party code

`src/lib/realtime.test.ts`, `src/lib/room-snapshot-arbiter.test.ts`,
`src/lib/presentation-event-window.test.ts`, `src/server/single-player-pump.test.ts`,
`src/server/single-player-edge-start.test.ts`, `src/server/edge-action-race.test.ts`,
`src/server/single-player-privacy.test.ts`, plus the full `npm run test` +
`npm run typecheck` + `npm run lint`. Two-browser e2e (`tests/e2e`) for N2/N4
before enabling by default. Party-side changes are NOT live until
`npm run deploy:partykit` runs — verify `serverSignature` parity after deploy.

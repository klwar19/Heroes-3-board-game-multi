# CLAUDE.md — rules for AI/automated contributors

These apply to every automated contributor (Claude Code, including claude.ai/code
in the browser). They exist because past work shipped non-functional "decorative"
abilities and then summarized them as complete. Treat these as hard requirements,
not suggestions.

## 1. "Done" means engine-enforced AND tested

A gameplay rule, unit ability, card effect, hero specialty, or building effect is
**done only if both** are true:
1. the engine actually executes it, and
2. a test fails if that logic is removed.

If you cannot do both, it is **NOT done**. Say so explicitly in your reply, leave
it clearly marked not-implemented, and stop — do **not** paste the printed rules
text into a display field and move on. Pasted-but-inert text is a stub, never a
feature.

### 1a. Test the EFFECT, not the artifact (how the "done" bar is actually met)

A passing data check is not coverage. These five habits catch the bugs an
"is it wired? is there a test?" audit greenlights anyway:

1. **Assert the observable game outcome, not an intermediate value.** "Token
   placed, amount X" is a data check; "defense went 3→1" / "damage rose by 2" is
   the real one. A test must fail if the logic is *wrong*, not just *absent*.
2. **A surprising test value is a lead, not noise.** If an assertion fails on a
   number you were sure of, explain the discrepancy before changing the
   expectation to match reality — that reconciliation is often where a bug hides.
3. **Cross-check siblings that share a mechanic** (e.g. every Corrosion/Attack
   token source). Divergence in how they encode the same thing (sign, magnitude,
   code path) is a smell.
4. **Audit the consumer, not just the producer.** Several producers can each look
   fine while the single shared reader they feed is broken and untested.
5. **Prefer an invariant over N one-offs** where one exists (e.g. "a Corrosion
   token always *lowers* effective defense, never raises it") — it guards every
   producer at once.

**Auditing content?** Use the `/audit-content` command (`.claude/commands/`),
which operationalises these five habits across *every* category (units, spells,
specialties, artifacts, abilities, buildings, banks, map tiles) — not just the one
you came in for. It exists because a prior audit reported green while Deemer's
Meteor Shower / Resurrection were broken: they were wired and had tests, but the
tests asserted the printed tier numbers instead of whether the damage/cost moved
with spell power, and no test compared the specialty to its scaling twin (the
Frost Ring spell). An "is it wired? is there a test?" pass is **not** an audit;
audit the behaviour and mutation-check every "verified" claim.

## 2. Every card/unit definition must state exactly what the engine implements

A human must be able to read a definition and know precisely what runs.

- **Units** (`src/data/factions/units.ts`): the `abilities: [...]` array is the
  *complete, literal* list of engine-wired effects for that side — no more, no
  less. `abilityText` is printed-card flavor/reference only and is **never**
  proof that something works.
  - If `abilityText` describes anything the engine does NOT do, add a comment on
    that side stating exactly what runs, e.g.
    `// engine: ignore-combat-penalties only; the +1 Power activation is display-only`.
  - A side with `abilities: []` does **nothing** mechanically, whatever its
    `abilityText` says. It is a stub.
- **Cards** (`src/data/cards/*`): `effect` + `implementationStatus` are the truth.
  Use `implementationStatus: "not-implemented"` (with a no-op effect) for anything
  not wired. Never set `"implemented"` unless the effect actually executes.
- Known display-only abilities must be **declared in one explicit registry**
  (e.g. `DISPLAY_ONLY_ABILITIES`) so a stub is a conscious, reviewable entry — not
  something a reader has to reverse-engineer.

## 3. Required enforcement (now in the repo)

`src/data/factions/ability-text-enforcement.test.ts` asserts, for EVERY unit
side in `coreUnitDefinitions` (few/pack/neutral, all factions + neutral decks):
- every `abilities` tag resolves to a `unitAbilities` entry with
  `implementationStatus: "implemented"`;
- a side with effect-describing `abilityText` and empty `abilities` must be
  declared in `DISPLAY_ONLY_ABILITIES` (a conscious stub, engine does NOT run
  it) or in `ENGINE_RULE_WIRED_ABILITY_TEXT` (implemented as a dedicated engine
  rule keyed off the unit — e.g. the neutral Skeletons' Necropolis reinforce —
  with the wiring and covering test named in the value);
- registry hygiene: no entries for nonexistent sides, no display-only entry for
  a side without text, no engine-rule entry whose side gained wired tags, no
  side in both registries.

New decorative unit text now fails CI until consciously declared. The Creature
Bank side-space has the same invariant in `src/data/map/creature-banks.test.ts`.
**Limit (rule #1a still applies):** this proves text is declared and tagged,
not that a wired ability BEHAVES correctly — behaviour stays pinned by the
per-mechanic tests, and an audit still means mutation-checking those.

## 4. How to report work (no dressing up)

- Lead with what does **NOT** work / what is display-only. Caveats go first, never
  in a footnote.
- Do not use ✓/✅ or words like "complete", "fully implemented", or "no decorative
  features" for anything you cannot back with a named, passing test.
- If you took a shortcut or shipped a stub, say that in the first sentence.

## Where this file lives / why it works on the web

This is the repository-root `CLAUDE.md`. Claude Code auto-loads it as context at
the start of every session, including claude.ai/code in the browser. The web
environment clones the repo fresh each session, so **only what is committed to the
default branch (`main`) takes effect there.** Keep this file committed on `main`.
Nested `CLAUDE.md` files in subdirectories are also loaded when working in those
folders; per-user `~/.claude/CLAUDE.md` does **not** persist on the web.

## Static media & CDN (how art/sound/font files ship)

`public/` in git is the source of truth; production serves media from the
Cloudflare R2 CDN at `https://cdn.hamthefirt.xyz` (runbook + live status:
`docs/cloudflare-custom-domain-cdn-plan.md`). What an AI contributor must know:

- **Adding/replacing a file under `public/assets|sounds|fonts` is enough** —
  `.github/workflows/sync-media-r2.yml` auto-uploads on every push (branches:
  new keys only, so previews work; `main`: full sync + cache purge). Never
  hand-edit the bucket; manual fallback is `npm run sync:assets`.
- **Replaced media busts the CDN edge cache AUTOMATICALLY via `?v=` versioning**
  (2026-08-04): every CDN asset URL carries `?v=<media version>` — a build-time
  hash of every media file's path+size (`src/lib/asset-media-version.ts`, set as
  `NEXT_PUBLIC_ASSET_VERSION` in next.config.ts, appended by `assetUrl()` AND
  the globals.css redirect destinations). Any art change → new URLs on the next
  Vercel deploy → fresh bytes everywhere, with NO Cloudflare purge token.
  Background: replaced files keep their URL, and without the (never-configured)
  `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ZONE_ID` purge secrets the edge served
  OLD bytes for up to 7 days — whichever URLs happened to be edge-cached at
  upload time stayed stale while the rest looked fine (the 2026-08-04 "spell
  scans still old but other art works" report). LIMITS: a same-size byte-level
  replacement does not move the version (nil in practice for webp/mp3), and a
  media change invalidates EVERY media URL at once (one-time cold edge per art
  deploy — deliberate). The rclone `NotImplemented` ERROR lines in the sync
  logs are retry noise, not upload failures.
- Code referencing media MUST go through `assetUrl()` (`src/lib/asset-url.ts`)
  — a raw `/assets/…` literal in a consumption position fails
  `src/lib/asset-url-coverage.test.ts`. `globals.css` url() refs are covered
  by the `next.config.ts` CDN redirects instead (`src/lib/asset-cdn.ts`).
- `partykit.json`'s `HOMM3BG_APP_URL` (canonical: `https://hamthefirt.xyz`)
  must stay in lockstep with the `HOMM3BG_APP_URL` GitHub Actions secret —
  the secret OVERRIDES the json at deploy time.

## Desktop command HUD (in-game layout, ≥1101px) — what runs vs. limits

A CSS-only layout for the two IN-GAME table screens on a real desktop. It lives
in ONE `@media (min-width: 1101px)` block (`globals.css`, section "DESKTOP
COMMAND HUD", immediately BEFORE the phone block) and every selector carries
`:not(.phoneMode)`, so phone mode and every viewport below 1101px are untouched.
Nothing here changes an engine rule; the only JSX is a collapse trigger.

What runs: the top row (HUD + resources) is `position: sticky` and one row tall
on the MAP screen; the town/hero/army `.leftRail` (218px) and the shared-deck
`.advDecksBottom` library (`--desktop-library-width`, a narrow
`clamp(104px, 6.2vw, 116px)` strip of stacked deck/discard pairs with the four
Neutral tiers on a 2×32px grid) become fixed side rails; the hand
`.playerCardBar` becomes a fixed 198px bottom tray, with the prompt/reaction
trays, chat dock, helper chip and reaction bar all lifted above it; the site
masthead/footer collapse for a live table (`.appShell:has(.tableMenuInline)`).
The in-game table controls (seat switcher, Room panel, status, music/UI-mode
toggles, game controls, single-player saves) collapse behind ONE `Table`
trigger (`.tableControlsToggle` → `.controlsOpen` on `.tableMenu`, page.tsx),
and the join-by-room-ID row leaves the band (the invite link inside the Room
panel is the in-game way to share a table). Wiring is pinned in
`src/app/page-phone-mode.test.tsx` ("in-game table controls — the collapse
trigger": trigger present in-game on BOTH screens, aria-expanded + class flip,
lobby CONTROL with no trigger and the join row kept).

The map hand tray's HAND-STEP DIRECTIVES (2026-07-27): the mandatory
start-of-turn draw / over-limit discard / opening-Mulligan / discard-pick
controls and warnings live in `.handDirectives` (page.tsx), a SIBLING of the
one-line `.handTopBar` — NOT inside it. On the desktop HUD it re-anchors as a
fixed HoMM3 scroll banner centered ABOVE the hand tray (z 60, the prompt-tray
band; art `/assets/ui/ornate/banner-command.webp`, buttons on
`button-plate[-gold].webp` — gold plate = the primary action), because inside
the fixed one-card tray the hand cards PAINTED OVER the mandatory "Draw new"
button (elementFromPoint hit a card image — the button was unclickable). The
cost-picker and play-confirm rows float in the same spot for the same reason.
An OPEN `.chatDock.open` shares that band at z 200, so a `:has()` rule slides
the banner to the map's right half while chat is open (no-:has browsers just
get the old overlap). Below 1101px and in phone mode the SAME element renders
in flow above the hand cards. DOM contract pinned in
`src/app/page-phone-mode.test.tsx` ("hand-step directives banner": container
outside the header + `.mandatory` while the draw is owed, with a draw-taken
CONTROL); the visible half is a real-browser concern.

Leading with what does NOT work / deliberate limits:
- **jsdom cannot compute CSS**, so only the wiring above is unit-pinned. Every
  visible claim (sticky, fixed rails, the panel's anchor) is a real-browser
  concern; there is NO e2e spec for this layout yet.
- **The fixed rails float over the WHOLE viewport band**, not just the mid row.
  Any full-width row that stays in the flow must be inset to the map column's
  gutters or its first/last ~218px sit under a rail — today only `.errorBanner`
  is still such a row (`margin: 0 (library+8px) 0 226px`), and a NEW full-width
  child of `.adventureRoot` needs the same inset. The two former members of that
  list are no longer in the flow (2026-07-27, below): the event log rides the
  command band as a popover and the PvP notice is `fixed`.
- **The EVENT LOG is a command-band popover on a non-phone table** (2026-07-27):
  `page.tsx` passes `<LogDrawer>` into `AdventureHud`'s `eventLogControl` slot
  (a `.advHudButtons` child) instead of rendering it as a full-width row, and
  renders the classic bottom strip only in phone mode. Open, it paints a
  `.logPopover` — `position: fixed` in the ≥1101px block because the desktop
  command band scrolls horizontally (`overflow-x: auto` clips BOTH axes, the
  left-rail fly-out bug), `position: absolute` under the band below 1101px where
  nothing clips. `max-height` is clamped off `--desktop-hand-height` so the
  chronicle can never run under the fixed hand tray. Two consequences to keep:
  the ornate chronicle skin (gold `evt` chips on leather rows, ornate-kit §5)
  is keyed on `.adventureRoot .logDrawer` — a DESCENDANT selector, since the
  drawer is no longer a direct child on desktop; and the collapsed bar keeps its
  one-line live ticker (`.logToggleLatest`) everywhere EXCEPT the desktop 96px
  pill, which shows only the `EVENT LOG` tag. The drawer now starts CLOSED on
  every surface (it used to auto-open in single player).
- **The PvP pre-battle notice is `fixed` on the desktop HUD only** (2026-07-27):
  `.preBattlePanel` keeps its in-flow row (and its `position: relative; z-index:
  4` claw guard) below 1101px and in phone mode, because the command band there
  wraps to an unknown height and a fixed notice would cover the player's own
  resources — which this window exists to keep in view. The ≥1101px block lifts
  it to a centered top notice (z 94) so readying up no longer shoves the map and
  hand down a row. It is `role="dialog" aria-modal="false"` — deliberately NOT
  modal: the point is to keep building/recruiting while it is open. KNOWN
  OVERLAP: the notice shares the top-center band with the prompt tray (z 60) and
  paints over it — acceptable because the prep window is the exclusive
  interaction for both sides, but a tray that does open behind it is hidden.
  Verified in a real browser at 1600×900 (fixed, clear of both the 62px band and
  the hand tray, `elementFromPoint` hits the Accept button) and at 1000×800
  (still `position: relative; z-index: 4` in the flow).
- **The open controls panel is `position: absolute` against the top row.** The
  MAP top row is sticky (positioned) so it anchors naturally; the COMBAT top row
  is a plain static grid and needs the explicit
  `.tableRoot:not(.adventureRoot):not(.phoneMode) > .tableTopRow { position: relative }`
  — without it `top: calc(100% + 6px)` resolves against the initial containing
  block and the panel (with its own trigger) lands a full viewport below,
  off-screen.
- **The room-password gate is deliberately EXEMPT from the collapse**
  (`.roomPasswordRow`): a joiner following a direct link into a locked, running
  table must be able to type the password without first finding a menu button.
- **z-index band stays under the overlays**: top row 55, controls panel 88, room
  manager 90, hand 48, library 42, left rail 36 — all below the documented
  chat dock 200 / hub backdrop 210 / hero info 220 / mod windows 230. The two
  2026-07-27 command-band overlays join the same band: the event-log popover 92
  and the PvP pre-battle notice 94 — the notice sits ABOVE the collapsed
  controls panel (88) and the room manager (90) on purpose, since it must be
  answered before the fight can start, and stays under the chat dock.
  EXCEPTIONS (2026-07-27 fly-out fix): while a town/hero/unit-deck/commander
  fly-out board is open, `.leftRail:has(.heroDropBackdrop)` lifts the rail to
  205 (above the chat 200 — an open board is a modal interaction with a dimming
  backdrop); the opponent-info backdrop is 205 for the same reason; the card
  ZOOM overlay is 300 (a card can be zoomed from inside any window and the zoom
  is a transient click-to-close reader); the helper coach strip stays 900.
- **The fly-out boards are `position: fixed` on the desktop HUD** (2026-07-27):
  the fixed rail scrolls (`overflow-y: auto` — which clips BOTH axes), and the
  `.heroDrop` board opens at `left: calc(100% + 12px)`, i.e. entirely inside the
  clipped overflow — the "hero / unit deck open and show NOTHING" bug. The
  ≥1101px block re-anchors the board `position: fixed` beside the rail (fixed
  escapes an ancestor's overflow clip; no transformed ancestor exists on that
  chain). Below 1101px the board keeps the classic absolute fly-out. The
  OpponentInfoModal instead PORTALS to `<body>` (opponent-info.tsx) — rendered
  inline it was trapped in the rail's stacking context (z 36) and the fixed hand
  tray covered its Hero section (the HeroInfoModal precedent).
- **The rail's grid track is pinned** (`grid-template-columns: minmax(0, 1fr)`):
  the lone auto track used to be sized by the tiles' min-content (portrait +
  label ≈ 228px), grew past the 218px rail, and clipped every tile's right edge.
- Below 1101px NOTHING of this applies and the trigger is hidden, so the classic
  expanded table menu is the only surface there.

## Phone UI mode (per-device layout choice) — what runs vs. limits

At the very start of the app flow (the main menu `/menu` and the multiplayer
lobby `/play`) — and, for a direct-link / mid-game joiner who skips the menu,
once per browser on every table branch too — the game asks **"How are you
playing?" — Computer mode or Phone mode** (`UiModePrompt`, device detection
only pre-highlights the recommendation; it renders only while the preference is
unset so it never double-asks). The choice lives in
`localStorage["binh-ui-mode"]` (`src/lib/ui-mode-preference.ts`, helper-coach
pattern; never in GameState, never sent to the server) and is switchable any
time via the 📱/💻 toggle in the table menu. Phone mode = `.phoneMode` class +
`data-phone-tab` on the branch `<main>` (page.tsx) + a bottom `PhoneTabBar`;
ALL phone rules live in one delimited block at the end of `globals.css`, every
selector prefixed `.phoneMode` — with the preference unset or "computer" not
one rule can match, which is the engine of the "desktop unchanged" guarantee
(pinned by CONTROL tests). Tabs show ONE full-screen panel at a time over the
SAME DOM the desktop lays out side by side: adventure = Map · (Battle) · Hand
(count badge + a pulsing "Draw!/Discard!" chip while the mandatory hand step
is pending) · Army · Decks · Menu; combat = Board · (Map) · Hand · Menu.
Fixed overlays (prompts, reaction tray, dice, chat, feed) stay reachable from
every tab and are re-anchored above the tab bar. The hex map gained real
two-finger pinch zoom/pan (`map-pinch.ts` pure math + `HexMapBoard` pointer
wiring; mouse/single-finger paths byte-identical). The chat dock starts
collapsed in phone mode (and collapses once when the mode flips to phone);
`layout.tsx` exports the default viewport plus `viewportFit: "cover"` for
safe-area insets; the site header/footer collapse under `.phoneMode` via
`:has` (graceful no-op on old browsers).

**Phone mode never LOADS the game-preparation scene video** (2026-08-08): the
map-setup lobby's `SetupSceneArt` (`src/components/adventure/setup-scene.tsx`)
does not MOUNT its `<video>` (`setup-scene-playlist-v6.mp4`, ~2MB) in phone mode
— a `display: none` video with `preload="auto"` still downloads, so CSS could not
fix this. The painted still `.setupSceneIllustration` (the video's own poster art,
same inset/z-index) is already underneath, so the scene is never a blank hole.
The gate reads the LIVE preference (`useUiModePreference`), so the in-game
📱/💻 toggle unmounts/remounts it mid-session, PLUS a synchronous
`getUiModePreference()` seed for the first render (the hook hydrates in an effect,
and one mounted frame is enough to start the fetch; safe because the lobby only
ever renders client-side — `page.tsx`'s `state` starts null). Computer mode and an
UNSET preference are byte-identical to before. Pinned in
`src/components/adventure/setup-scene.test.tsx` ("phone mode never loads the
video": no `<video>` at all + still art present, the mid-session toggle both ways,
the first-render pass via `renderToStaticMarkup`, and a computer/unset CONTROL).
The MAIN MENU video is a different file and deliberately unchanged.

Leading with what does NOT run / deliberate limits:
- **jsdom cannot compute CSS**, so the wiring (class/attribute/tab bar, prompt
  precedence, pinch camera) is pinned in `src/app/page-phone-mode.test.tsx`,
  `src/lib/ui-mode-preference.test.ts`, `ui-mode-prompt.test.tsx`,
  `phone-tab-bar.test.tsx`, `map-pinch.test.ts`, `map-pinch-gesture.test.tsx` —
  and the VISIBLE effect (panels actually swapping, desktop control) is pinned
  in the real browser by `tests/e2e/phone-ui-mode.spec.ts`. Both halves are
  the feature's test bar; keep both.
- Card-flight FX that land in a hidden panel (e.g. a draw while the Hand tab
  is closed) play to an off-screen anchor — cosmetic only, state is right.
- No phone-specific Town window / map designer / menu-page layouts yet
  (generic modal + column CSS only), no PWA/fullscreen/orientation lock, no
  landscape-specific rearrangement (the battlefield/map simply fit both
  orientations via dvh caps), no hand peek strip on the Map tab.
- The e2e config seeds `binh-ui-mode`/`binh-helper-coach` as ANSWERED for all
  other specs (playwright.config.ts storageState) — the first-visit prompts
  otherwise block every lobby click (the coach prompt already did before this
  feature); `phone-ui-mode.spec.ts` opts back into a clean slate because the
  prompt itself is under test. The Next dev-tools badge is pinned top-right
  (`devIndicators` in next.config.ts) so its portal cannot swallow tab taps.

## Current known stubs (display-only, NOT implemented)

Nothing is display-only today: `DISPLAY_ONLY_ABILITIES` is EMPTY and
`ENGINE_RULE_WIRED_ABILITY_TEXT` holds exactly `neutral.skeletons#neutral` (its
Necropolis-reinforce text runs as a dedicated engine rule, not an ability tag).
The machine truth is those two registries plus
`src/data/factions/ability-text-enforcement.test.ts` (the Creature Bank twin is
`DISPLAY_ONLY_BANK_ABILITIES`, also empty). The former Tower / Conflux / Factory
hold-outs are all wired and pinned per-mechanic
(`expansion-creature-abilities.test.ts`, `decorative-faction-abilities.test.ts`,
`conflux-content.test.ts`, `conflux-ciele-specialty.test.ts`,
`conflux-tarnum-specialty.test.ts`, `factory-unit-abilities.test.ts`,
`factory-gold-abilities.test.ts`, `factory-content.test.ts`,
`hero-specialty-levels.test.ts`). Re-verify any prose claim against those
registries and `src/data/factions/units.ts` before trusting it.

## Morale Cards (Battlefield expansion, OPTIONAL rule) — what runs vs. printed nuances

Lobby option `GameSetupOptions.moraleCards` (default OFF): every morale gain/loss
draws from two shuffled decks (9 positive / 8 negative) instead of the ±1 token.
Data `src/data/cards/morale.ts`, engine `src/engine/morale-cards.ts` wired through
`reducer.ts` / `adventure-reducer.ts` / `adventure.ts` / `legal-actions.ts`;
pinned in `morale-card-effects.test.ts`, `morale-cards.test.ts`,
`ability-dice-events.test.ts`, `morale-card-cue.test.ts`,
`morale-card-overlay.test.tsx`, `combat-morale-panel.test.tsx`.
LIMITS: the two Battlefield-Symbol cards (`morale.positive.replace_adventure_card`,
`morale.negative.put_token`) are excluded from the decks
(`BATTLEFIELD_ONLY_MORALE_CARD_IDS`); "Combat Power" clauses are inert in regular
games; `morale.positive.remove_token` is a documented engine reading (remove one
NEGATIVE combat token from an own unit).

## Parallel turns (OPTIONAL house rule, multiplayer only) — what runs vs. limits

Engine in `src/engine/parallel-turns.ts` (predicates, the stop/collapse, the
transactional bystander guard) wired through `adventure-reducer.ts` (END_TURN /
movement / rotation chaining), `legal-actions.ts` (open-turn gating + the
bystander quiet-action set), `reducer.ts` (the applyAction fingerprint backstop)
and `adventure.ts` (`flagField` steal hook, quiet-filtered reachable paths).
Lobby option `GameSetupOptions.parallelTurns` (0 = off, 1–12 rounds; Game
options UI). Behaviour is pinned in `src/engine/parallel-turns.test.ts` — every
claim below has a test that fails if the wiring is removed, each with an
ordered-mode or unowned-target CONTROL.

- While `turn.mode === "parallel"` every live player's turn is open at once:
  move, build, refresh, end turn independently; the round wraps when everyone
  has ended (`turn.completedPlayerIds`, reused from the sandbox machinery).
- The exclusive interaction machinery stays a strict SINGLETON (one combat, one
  pendingChoice/visit/tile rotation/Necromancy window at a time). While one is
  open for player A, everyone else gets ONLY the quiet set: steps onto "open"
  (trigger-free) fields, the start-of-turn hand steps, and — outside combats —
  town/morale actions (which queue/park, never interrupt). Everything else
  (visits, discoveries, battles, card plays, searches, END_TURN) waits with a
  "wait until …" rejection. Safety is transactional, not enumerative: a
  bystander action that touches the interaction fingerprint
  (`parallelSlotSignature`) is rejected WHOLE in `applyAction`, so a
  mis-classified action can only fail cleanly, never corrupt an open battle.
- Shared-deck draws are therefore strictly first-come-first-served (arrival
  order through the single reducer + the reward-queue FIFO) — no card can be
  handed out twice; round-start effects (income, Events, Astrologers,
  start-of-turn hand dividers) resolve clockwise from seat 1 exactly like
  ordered play. `pumpAdventureQueues`' start-turn-hand divider requeue ignores
  other dividers (N players queue N dividers — they must not chase each other
  forever). Round 1's forced home-tile rotations chain one at a time in seat
  order (`beginNextPendingStartTileRotation`). A round that draws an **Event or
  Astrologers proclamation** raises the round-start EVENT BARRIER
  (`adventure.eventResolution`): the whole table pauses to resolve the event
  FIRST — even the quiet set is off, no seat may move/draw/build until every
  player has resolved it — then normal play resumes (see the Event-deck section).
- The mode STOPS — `PARALLEL_TURNS_STOPPED` warning to the whole table, then
  classic one-at-a-time turns forever — when (a) a PvP battle starts
  (`startPlayerCombat` / the garrison prompt), (b) a serious PvP interaction
  resolves: taking a flag FROM a live player (`flagField` chokepoint — covers
  walking onto an enemy mine/settlement/town AND the View Earth capture; hand
  discards are deliberately NOT serious), or (c) the chosen period ends. On a
  PvP stop the aggressor becomes the active player and the battle resolves
  normally; players who had already ended stay ended (the rotation skips them,
  wrapping only when nobody live still owes a turn) and nobody's start-of-turn
  re-runs mid-round (no second mandatory draw).
- Deliberate LIMITS (documented, not bugs): only ONE battle can run at a time
  (the physical game has one battle board) — a second fight, and any visit or
  card play, waits for the open interaction; town actions stay blocked during
  combats exactly like ordered play. Ordered games (`parallelTurns` 0/absent),
  solo tables and legacy snapshots are untouched — every parallel predicate
  no-ops when the mode is off.

## Undo moves (OPTIONAL debug/testing mode, default OFF) — what runs vs. limits

Lobby option `GameSetupOptions.undoMoves` (frozen onto `adventure.undoMoves`): a
room member may roll the game back one applied action, bounded to the last
`UNDO_HISTORY_LIMIT` (10). Debug aid, not a normal-play feature. History + restore
live SERVER-SIDE only in `src/server/undo-history.ts` (both backends); pinned in
`undo-history.test.ts`, `undo-history-edge.test.ts`, `undo-button.test.tsx`,
`game-options-tabs.test.tsx`.
LIMITS: default OFF = zero behaviour change; the history NEVER enters GameState or
a player view (only the public `MOVES_UNDONE` feed line); restore is a WHOLE-state
swap; a redone action re-rolls the same seeded dice.

## Single player vs computer opponents (EXPERIMENTAL) — what runs vs. limits

Menu → Single player mints a PRIVATE room (128-bit `sp-` id, never in a lobby
directory, never MMR-reported, no AFK votes or turn clocks; only the first owner
may join). One human (`p1`) + 1–3 computer seats (`state.controllers`,
`sessionMode: "single-player"`). Engine `src/engine/computer/*`, server pump
`src/server/computer-runner.ts`, wired into BOTH backends' action transactions
after the AFK settle. Contract:
`docs/single-player-computer-opponents-plan.md`. Tests: `computer-runner.test.ts`,
`single-player-live.test.ts`, `single-player-combat-resolve.test.ts`,
`single-player-privacy.test.ts`, `window.test.ts`, `control.test.ts`,
`computer-move-replay.test.ts`, `hero-position-override.test.tsx`,
`map-navigation.test.ts`, `army-strength.test.ts`, `computer-battle-report.test.ts`,
`opponent-turn-overlay.test.tsx`, `single-player-pump.test.ts`,
`single-player-edge-start.test.ts`, `single-player-soak.test.ts`,
`single-player-premium-rush.test.ts`, `single-player-opening.test.ts`.

- **The paced pump is alarm-safe and self-healing.** PartyKit THROWS on any
  `Party.id` read inside `onAlarm` (which froze every deployed AI after its first
  step); `onAlarm` uses the snapshot's own `roomId` and both backends re-arm through
  `ensureComputerPump` (edge: `onConnect`, every inbound socket message, the HTTP
  GET poll; store: `subscribeToRoom` / `restoreRoom` / the GET route), a thrown tick
  retrying at 5s. DEPLOY NOTE: `party/index.ts` reaches production ONLY via
  `npm run deploy:partykit`.
- **No stall on a "no measurable progress" action**: `progressFingerprint` also
  captures the combat-pause identity, and a no-progress-but-no-error apply DISCARDS
  that candidate and tries the next instead of stalling.
- **Objective-seeking map play**: an unbounded multi-source BFS distance field
  (`objectiveDistanceField`, `computer/map-navigation.ts`) so the hero never
  oscillates; guard engagement uses the engine's own Quick-Combat rule
  (`canBeatGuardedField`), PvP engagement `shouldEngageEnemy` (ratio 0.85,
  `computer/army-strength.ts`). Teleport networks are reverse edges in the BFS
  (known fields only). Visit / Event / post-combat windows are scored so the runner
  never freezes; `computerDecisionOwner` falls through to drive
  `ACKNOWLEDGE_COMBAT_END`. Deferred: hiding multiplayer-only invite affordances on
  the SP table page.
- **Everything else is a SCORE LAYER over already-legal actions** (so nothing can
  produce an illegal move): expansion tempo, dwelling-first economy
  (`development.test.ts`), crown discipline (`expertCrownNudge`), printed-ladder
  spell aiming (`card-policy.test.ts`), Defend-instead-of-suicidal-poke
  (`combat-policy.test.ts`), the home-tile drain and premium-economy rush
  (`armyCoversPremiumEconomyGuard` / `premiumEconomyEngageCap`,
  `market-policy.test.ts`), free seizures within reach, Necromancy outranking
  `SKIP_NECROMANCY` (`mulligan-necromancy.test.ts`), Legion / banked-discount /
  Learning pricing (`legion-learning.test.ts`) and per-turn REVISIT memory
  (`memory.test.ts`).
- **Guaranteed first-battle wins (smoothing house rule)**: a computer seat's first
  TWO eligible neutral-guard battles are flawless one-round wins at
  `finalizeCombatStart` → `applyComputerGuaranteedWin`
  (`computer/guaranteed-wins.ts`), resolving through the NORMAL victory path plus a
  `COMPUTER_GUARANTEED_WIN` feed line. Abuse guards: guard FIELDS only at difficulty
  I/II the hero's level already covers, never banks / PvP / human seats /
  multiplayer / PvP-Neutral-Control, Quick Combat never consumes a slot, and the map
  policy never reads the feature. `guaranteed-wins.test.ts`.
- **Temp Empowered Attack/Defense cards (house rule #2)**: at the start of every
  NON-PvP combat a computer seat fights it draws 1 temporary Attack + 1 Defense
  statistic card, Empowered for that fight and removed at combat end
  (`applyComputerCombatBoost`, `combat.computerBoost`; cleanup at the top of
  `finalizeAdventureCombat`). LIMIT: a seat eliminated mid-combat skips the cleanup.
- **Computer battles resolve IMMEDIATELY off-screen; movement is REPLAYED behind an
  accept-gate.** The whole turn settles inside the human's action transaction; the
  ONE exception is a PvP fight the AI opens. The human sees one
  `OpponentTurnOverlay` recapping each battle (`buildComputerBattleReport`) and
  gating the replay (`computer-move-replay.ts`, `REPLAY_STEP_MS` 900,
  `heroPositionOverrides`). Pure presentation, cancelled the instant the human acts.
- Computer actions use trusted in-process authority
  (`ReducerOptions.computerActorPlayerId`, never client-deserializable) and
  `ASSIGN_SEAT` refuses computer seats. Anti-freeze: `computerDecisionOwner` names a
  seat only for a REAL owed window; the runner has retry dedup, a no-progress guard
  and a 256-step cap.

## PvP Neutral Control (OPTIONAL mode, multiplayer only) — what runs vs. limits

Lobby `GameSetupOptions.pvpNeutralControl` (default OFF, multiplayer only) with the
`pvpNeutralControlMustAttack` sub-toggle (default ON). Every NEUTRAL combat (guard
fields AND banks) is played by the NEXT live player clockwise from the fighter
(`neutralCombatControllerId`, `src/engine/neutral-control.ts`, derived from the
live-only `turnOrder`). Offers come from `addControlledNeutralUnitActions` and
execute AS the neutral seat via `asNeutralSeatCommand` so attribution, retaliation
and friendly checks match the AI pipeline verbatim; the controller breaks
activation ties and answers every Neutral-owned decision (the pump re-stamps it).
Pinned in `pvp-neutral-control.test.ts` (each claim with a mode-off / wrong-seat
CONTROL).
LIMITS: the War Zealot Magic Mirror still auto-USES (only its redirect target is
picked); token "other actions" are offered in FREE mode only, and Genie Wish /
Summon Demons never (they read the CONTROLLER's own deck); the in-combat menu is
IDENTICAL for a field and a bank — only the pre-battle SORT differs
(`combat.pendingNeutralPlacement` on a field, none for a bank's fixed corners);
Berserk and the Astrologers frenzy override both modes; a neutral Harpy's fly-back
is the controller's choice in FREE mode only; the continue-or-retreat window, the
pre-activation pause and every reward stay the FIGHTER's; the mode never changes
`unit.controllerId`. Sub-toggle ON = only attacks / distance-closing steps / hold
when boxed in; OFF = the full PvP menu plus tokens. Cross-mode seams: the
controller is a parallel-turns participant, the fighter's turn clock pauses while
the guards' slot is open, the AFK driver can play a dropped controller's slot, and
`eliminatePlayer` hands an open neutral-side choice back to the neutral seat.

## Multiplayer ladder & turn discipline (MMR, quit penalty, 10-min turns) — what runs vs. limits

Every finished win/loss funnels through `declareAdventureWinner` and is REPORTED
(`detectFinishedMatch`, `src/server/match-report.ts`) on a hosted table with ≥2
verified accounts, casual games included; only a `ranked` match recomputes Elo
(`accounts/elo.ts`). `room.matchSeats` is frozen at map build so a leaver is
reported as **abandon**. All time controls are CLOSED-table only
(`timeControlsActive`, `afk.ts`): the AFK vote-kick, the 30-minute auto-kick and the
10-minute per-turn budget (`TURN_TIME_LIMIT_MS`, `resolveTurnTimeout`) never run on
an OPEN table. Pinned in `match-report.test.ts`, `match-claim.test.ts`,
`match-report-giveup.test.ts`, `afk-vote.test.ts`, `turn-timeout.test.ts`,
`overlays.test.tsx`, `room-membership.test.ts`, `lobby-registry.test.ts`,
`room-password.test.ts`, `account-store.test.ts`.
LIMITS: a game nobody finishes reports nothing and OPEN tables are never recorded; a
turn-clock pause forgives the WHOLE budget; timeout triggers are CLIENT-fired
(server-validated) and a timed-out seat is ended, never eliminated; room join
passwords are a casual gate (a salted `hashRoomPassword`, redacted in views), NOT
cryptographic secrecy.

## WOG Commanders (optional module, BINH-only) — what runs vs. adaptations

Lobby: WOG crest + "Commanders" module (`WogModOptions.commanders`, default OFF).
Content `src/data/commanders.ts`, engine `src/engine/commanders.ts` wired through
setup/adventure/reducer/legal-actions/permanents/runes; pinned in
`wog-commanders.test.ts`, `wog-commander-casts.test.ts`,
`wog-commander-combos.test.ts`.

Leading with the adaptations / deliberate limits:
- The WoG PC 5-tier primary-skill layer did NOT ship (design history in
  `docs/wog-commanders-plan.md` §4–5); the shipped system is grades 0–3 per stat
  plus 15 combination skills.
- **Stat points from hero level-ups** (`commanderGradePointsForLevelUp` /
  `awardCommanderGradePoints`, spent by `COMMANDER_GRADE_UP`): 1 per level-up, 2 at
  the MILESTONE levels 3 & 6 — 2 & 5 for the Castle Paladin
  (`commanderDoublePointLevels`); 8 points to level 7.
- **Grades 0–3** (`COMMANDER_GRADE_VALUES`, base A2/D1/H4/dmg0/Pow0/Spd5): a grade's
  bonus replaces the earlier one, never sums. Defense = 1/2/2/3 with the Defend-die
  token on grade II ONLY (`COMMANDER_DEFENSE_TOKEN_GRADE`); Damage = N extra ATTACK
  DICE (`getMightDiceCount` / `mightDiceAttackBonus`, at most one "−1" counts, so
  they push through Defense); Magic = Power 0/0/1/2, ward 0/−1/−1/−3 and
  ongoing-effect immunity from grade 1 (`COMMANDER_MAGIC_ONGOING_IMMUNE_GRADE`) — a
  grade-0 commander is NOT immune.
- **15 combination skills** (`COMMANDER_COMBOS`, one per stat pair) unlock at one
  stat grade 3 + the other ≥ 2 (2+2 and 3+1 stay locked); each REUSES an existing
  arm (Death Stare, Charge, `ignores-retaliation`, a ranged-TYPE flip,
  `MINIMUM_ATTACK_DIE`, `unlimited-retaliation`, `DEFENSE_REDUCTION_ON_ATTACK`,
  Fearsome, `SECOND_ATTACK_ALL_ADJACENT_TO_SELF`, `FIRE_SHIELD_DAMAGE`, Block,
  `SECOND_ATTACK_SAME_TARGET_AFTER_RETALIATION`, Paralyzing Touch, Regeneration,
  `teleport-move`), pinned with a locked CONTROL one grade below.
- **Deployment cap**: with the module on `combatUnitLimit` = 4 army units, the
  commander being the 5th body (module off = the classic 5).
- **Specialty adaptations** (conscious rewrites): Paladin Wise = early milestones;
  Temple Guardian = twice per COMBAT a Spell may exceed the per-round limit; Brute =
  +2 gold after a won combat; Soul Eater = Paralysis immunity; Shaman and Sea
  Marshal = an owner-picked +1 Attack OR +1 Defense stance (`commander.stance`);
  Astral Spirit = 1 damage to every enemy neutral at combat start
  (`applyElementalScourge`); Rune Keeper = +1 Rune when attacked AND when it moves;
  Hierophant = a post-combat restore of ONE bronze/silver casualty; Ogre Leader =
  the player aims the Ballista; Artificer = war machines cost 5 less.
- **Casts**: once per combat ROUND, FREE during the commander's own activation, and
  a cast ENDS that activation's MOVEMENT (`movementLockedThisActivation`).
  EXCEPTION: Hierophant Shield and Ogre Leader Stone Skin are INSTANT REACTIONS in
  the open attack window (`commanderCastIsInstantReaction` →
  `USE_COMMANDER_CAST_REACTION`), never touching movement (Shield is not offered
  against a ranged-TYPE attacker). Readings: Cure cleanses ALL negative
  tokens/effects, Animate Dead heals a flat 2, Bloodlust / Precision scale Pow 0 =
  +1 adjacent-only, 1 = +1 anywhere, 2 = +2, this round only.
- **Scope**: only the MAIN hero's combats, auto-placed, full health each combat,
  only DEATH persists (revive for 2 + 2×hero level gold). Tierless both ways
  (tier-gated spells never target it, the neutral AI hits it LAST) and it COUNTS for
  win/loss (`livingControllerIds`).
- **Empty unit deck**: the BINH starting-army restock is WITHHELD while a commander
  that stood in the fight SURVIVED (`restoreStartingArmyIfEmpty`'s
  `commanderStandsIn`), so a main hero with an empty deck fights commander-only; a
  fight the commander cannot join keeps the classic restock.
- Renames: Cove Corsair → Sea Marshal, Factory Engineer → Artificer, Bulwark Frost
  Warlord → Rune Keeper. Presentation: per-cast H3 spell FX (`commanderCastFxPlan`,
  `commander-fx.test.ts`) and a level-up popup PORTALLED to `<body>` at z 236 with
  `.commanderLevelUpScroll` as its only scroller (jsdom cannot compute CSS —
  `commander-card.test.tsx`, `commander-level-up-layout.test.ts`); voices keyed by
  slug in `commanderVoices` (`unit-sounds.test.ts`).

### Commander Artifacts (`wog.artifacts` + `wog.commanders`) — 10 slot items

Ten artifacts bound PERMANENTLY into weapon / armor / trinket slots. Single registry
`src/data/wog/commander-artifacts.ts` (`COMMANDER_ARTIFACT_SPECS`); state
`CommanderPlayerState.artifacts`; folds in `commanders.ts`; the map-only
`BIND_COMMANDER_ARTIFACT` (`cost.removeSelf`) also grants one REGULAR same-grade
Artifact (`grantRegularArtifactOfSameGrade` — a forced grant, deliberately outside
the BINH tier gate and the Polish Random Artifacts roll). Deck gate:
`wog.enabled && wog.artifacts && wog.commanders`. Pinned in
`wog-commander-artifacts.test.ts`, `commander-card.test.ts`.
LIMITS: WoG's per-victory INCREMENTAL bonuses are NOT modeled (fixed printed bonus);
Bow of Seeking and Slava's Ring of Power are NOT shipped; binding is permanent (no
unbind/swap, one per slot) and survives death + revive.
The ten: `iron_cudgel` +1 Attack · `axe_of_smashing` +2 Attack · `doomsday_blade` +3
Attack · `sword_of_sharpness` +1 Might die · `hardened_shield` +1 Defense ·
`mithril_mail` +2 Health · `helm_of_immortality` free revive at combat end ·
`boots_of_haste` +1 Initiative · `pendant_of_sorcery` cast Power +1 ·
`dragon_eye_ring` line attack (`dragon-line-attack-3`).

### WOG Artifacts (optional module, BINH-only) — what runs vs. adaptations

Lobby `WogModOptions.artifacts` (default OFF; needs `wog.enabled && wog.artifacts`).
Five ORIGINAL board-adapted hero Artifact cards (`src/data/wog/artifacts.ts`),
deck-joined in `makeSharedDecks` via `withWog(...)`, always registered in
`src/data/cards/library.ts`; pinned in `wog-artifacts.test.ts`,
`src/data/wog/wog-artifacts.test.ts`.
ADAPTATION: WoG's incremental / transform / summon behaviours are NOT modeled — each
card REUSES an already-wired arm with WoG flavour as its name and art: Magic Wand
(minor, mapOnly, remove → Search (1) Artifact), Gate Key (+1 / remove for +2
movement), Crimson Shield (+2/+3 defender reaction), Warlord's Banner (+2/+3
attacker), Dragonheart (relic +3/+5, the remove side leaving the game). The WOG and
anime artifact sets coexist in the same shared decks.

### WOG New Objects (`wog.newObjects`, BINH-only) — what runs vs. adaptations

SEVEN authentic-WoG map objects shipped as single-hex Field Overrides
(`src/data/wog/field-overrides.ts` package `"wog"`, `src/data/wog/locations.ts`,
menus built by `buildWogFieldVisitStep`). Default OFF ⇒ byte-identical. Pinned in
`src/engine/wog-objects.test.ts`.
Each is a board-adapted READING (the printed `summary` states what runs): Emerald
Tower (guarded Ⅲ, then pay 3 gold for +1 commander stat point — only with
`wog.commanders` — or 2 gold for +1 hero XP); Mirror of the Home-Way (flat
pay-2-gold Town teleport); Junk Merchant (tier-priced sells 2/3/4 + a paid
Search (1)); Fishing Well (PAY_TO 1 gold → `ATTACK_DIE_TABLE`); Living Skull (Listen
= Search (1) Ability, or Smash = +2 gold and `SMASH_WOG_SKULL` latching the hex
inert for everyone); Adventure Cave (escalating Ⅰ→Ⅱ→Ⅲ, `field.wogCaveWins`, cleared
after the 3rd win); Altar of the Gods (3 valuables → +1 morale / +2 XP / +1
commander point). Emerald Tower's win and the Cave's 3rd win also drop a random
not-in-play commander-artifact card (`grantCommanderArtifactReward`). All seven are
Location-Token protected.

## Unit Experience / veterancy (OPTIONAL rule; lobby toggle + WOG module + anime module) — what runs vs. limits

Board adaptation of the WoG Unit Experience System. THREE surfaces set ONE flag
frozen onto `adventure.unitExperience`: `GameSetupOptions.unitExperience`,
`wog.unitExperience`, `anime.unitExperience` (all default OFF ⇒ every fold is an
exact no-op). Data `src/data/units/experience.ts`, read layer
`src/engine/unit-experience.ts`, wired through `makeCombatUnitFromArmy` /
`applyUnitCurrentSide`, `finalizeAdventureCombat`, `DRILL_UNIT` and every
reinforce/Stack site. Pinned in `unit-experience.test.ts`,
`unit-rank-badge.test.tsx`, `board.test.tsx`, `game-options-tabs.test.tsx`.
- XP: after a WON combat the surviving DEPLOYED cards gain
  `unitExperienceForWonCombat` (guard = Field Difficulty, bank = max(2, Stacked),
  PvP = 2), riding the CARD (`ArmyUnitState.experience`).
- Four ranks (`UNIT_RANK_THRESHOLDS` bronze 3/6/10/14, silver 4/8/13/18, gold+azure
  5/10/16/22); each unit has a 4-step schedule (`rankScheduleFor`) whose steps are
  EITHER stats (`UNIT_STAT_STEPS`) OR one already-implemented ability appended at
  runtime by `withRankAbilities` (printed card data is never edited).
- Dilution: a Few→Pack reinforce HALVES the XP at every site and each Polish Stack
  layer costs 1, always emitting `UNIT_XP_DILUTED`; the Hierophant First Aid flip-up
  never dilutes. Drill: 2 gold for +1 XP in an OWN Town, once per own turn.
- LIMITS: **Quick Combat trains nobody**; Clone tokens and specialty covers ignore
  ranks; the AI drills from surplus gold but is not a veterancy planner.

## Neutral Rank-Up (OPTIONAL, WOG/anime flag) — what runs vs. limits

NEUTRAL guards gain the EXISTING veteran ranks as the game ages. ONE boolean from
`wog.neutralRankUp` / `anime.neutralRankUp` frozen onto `adventure.neutralRankUp`;
constants and reads all in `src/engine/unit-experience.ts`
(`NEUTRAL_ROUNDS_RANK_CAP` 2, `NEUTRAL_STACK_RANK` 1, `applyNeutralRoundsRank`,
`neutralStackRankFold`). Pinned in `neutral-rank-up.test.ts`, `board.test.tsx`,
`game-options-tabs.test.tsx`.
- ROUNDS half: at the one non-bank mint seam (`revealNeutralArmy`) every guard folds
  to `min(2, rankForXp(tier, round-1))` — bronze r4/r7, silver r5/r9, gold+azure
  r6/r11 — capped at Veteran by mirroring a CAPPED virtual XP. Rounds 1–3 unchanged.
- STACKS half: a bank defender CARRYING a Stack Token fights at Seasoned (bank
  branch of `applyUnitCurrentSide`); absorbing the token reverts it. Banks never
  round-rank, so the halves never stack.
- LIMITS: Quick Combat and the polish-quick-combat strength read IGNORE ranks (a
  FOUGHT-OUT fight gets harder, never a skipped one); rewards/XP are UNCHANGED; the
  AI ignores ranks; the only preview is the veteran badge on the combat card.

## Calamity Waves · Raid Bosses · The Dungeon (OPTIONAL modules, WOG + anime surfaces) — what runs vs. limits

Three PvE modules, each with TWO surfaces resolving to ONE frozen field
(`wog.monsterWaves|raidBosses|dungeon`, `anime.*`). Shared settings on both option
types: `waveCadence` (3|4|5, default 4), `pveTheme` (classic|doom|random, default
classic), `wavePressure`, `waveDefeatLimit` (0|2|3, default 0 = no elimination),
`raidBossSpawnRound` (4|5|6, default 5), `dungeonDepth` (5|10),
`dungeonDescentCost` (0|1|2, default 1) — a DESIGNED MAP may direct all of them
(designer-first at every read). Engine `src/engine/pve-content.ts` +
`monster-waves.ts` / `raid-bosses.ts` / `dungeon.ts` + `combat-board-art.ts`; boss
data `src/data/anime/bosses.ts`. Pinned in `monster-waves.test.ts`,
`raid-bosses.test.ts`, `boss-abilities.test.ts`, `dungeon.test.ts`,
`game-options-tabs.test.tsx`, `map-preset-editor.test.tsx`, `board.test.tsx`,
`anime-coexistence-soak.test.ts`. Default OFF ⇒ byte-identical.

Leading with what does NOT run (all three): no guild rank points, no fate/karma; a
CLASSIC army is a real `NEUTRAL_ARMY_TABLE` draw while a DOOM army is MINTED
(`bankGuard`, never recycled/swappable, but NOT gradeless — it keeps its tier); a
designed map's theme WINS over the mod window without repainting it, and `"random"`
resolves ONCE from the game seed; no pre-battle swap windows and no computer
guaranteed-win; the AI does not MARCH toward these sites (it fights its waves and
answers menus where it stands); all three hexes are Location-Token protected
(`TOKEN_FORBIDDEN_LOCATIONS`); there are no designer MAP OBJECTS (control is at the
PRESET level, the "PvE encounter director" editor group); the two dedicated
battlefields are stamped server-side by `isPveEncounterCombat` →
`assignCombatBoardArt`, the PvE check running BEFORE the sea check; a boss
`cardImage` must point at its OWN id (four Doom bosses shipped cross-wired).

**Calamity Waves**: every Nth round EVERY live seat fights a wave army at round
start, announced the round before and resolved in seat order behind the SAME
round-start event barrier. Each assault is a neutral combat at the main hero's
position (`context.waveAssault`, difficulty 0, `unlimitedRounds`, no retreat), paid
by `waveEconomyProfile(pressure)`. Any non-win PILLAGES (gold loss, the brutal
morale hit, and the flagged mine/settlement nearest the home town overrun with a
difficulty-Ⅰ guard re-seeded) and bumps `player.waveDefeats`; with
`waveDefeatLimit` 2 or 3 that ELIMINATES the seat, so the pump drops the remaining
assaults once a winner is set. Each wave carries a deterministic BATTLE EVENT
(`waveBattleEventFor`) folded in at `revealNeutralArmy`, CANCELLED for a seat whose
`wavePreparedFor` matches — set by the **Calamity Gate** (the first revealed
Far-band Blocked Field, `placeCalamityGate`, no Creature Banks option needed).

**Raid Bosses**: multi-layer world bosses minted gradeless (`bankUnit` + `bossUnit`)
whose `armyStacks` ARE the health bars, shed by the boss branch of
`markUnitRemovedIfNeeded` with excess damage carrying. `scheduledBossPool` serves
the frozen theme's list only. Three new arms: **Enrage** (`boss-enrage`,
`requiresLayersAtMost: 1`), **Devour** (`boss-devour`, `targetGradeAtMost: "bronze"`)
and **Fear** (`boss-fear`, MORALE_LOCK — morale cannot be USED while it lives;
gains untouched). At the spawn round the highest-difficulty REVEALED plain guard
field becomes a **Rift Lair**; the fight is difficulty-0 with a minion escort and
WOUNDS PERSIST to `adventure.raidBosses[id]` whatever the outcome. Each broken layer
pays 2 gold at the removal chokepoint; the kill pays 5 gold + a relic search and
clears the lair; ignored, the boss regrows +1 layer every 4th round. Designer
`preset.raidBosses.bosses` (cap 6, `RAID_BOSS_ABILITY_CHOICES`) REPLACE the pool.

**The Dungeon**: ONE repeatable delve site placed at the tile-rotation seam (the
first Near-band tile with a Blocked Field; no Creature Banks option needed). MOVEMENT
is the limiter (the once-per-turn latch is gone), each door carrying a
`SPEND_HERO_MOVEMENT` step for the frozen descent cost. `adventure.dungeonSite`
holds `maxFloor` / `descentCost` / `floorBosses` (any built-in or custom boss via
`resolveBossDefinition`). Ordinary floors offer TWO rooms + Leave, seeded by (game
seed, THEME, floor) so the layout is SHARED and unrerollable; the floor den then
opens at REAL difficulty min(floor+1, 7) — so it pays normal hero AND unit XP —
never Quick Combat. Floors 5/10 field LAYERED bosses minted FRESH each attempt. A
win advances and pays the reward ladder; a loss loses nothing. All the visit-step
kinds are auto-resolving, so no AI or AFK seat can stall. LIMITS: a 5-floor
expedition never reaches the floor-10 relic rung; FREE descent removes the movement
limiter; a hand-edited warden typo fields a PLAIN party (never a stall); the plan's
bank-corner formation and spike-pit tokens are NOT modeled.

## Event deck (Fortress expansion, OPTIONAL rule) — what runs vs. printed nuances

`GameSetupOptions.events` (default OFF, multiplayer only — a solo table never gets the
deck). All 20 published Fortress Events in `src/data/cards/events.ts`; engine
`drawEventCard` / `resolveEventCard` / `applyEventVisitStep` (adventure.ts), drawn at
the start of each Resource Round AFTER income with the drawer rotating clockwise.
`EVENTS_NOT_IMPLEMENTED` is empty. `event-deck.test.ts`, `event-cards.test.ts`,
`event-market-cards.test.ts`, `round-start-event-barrier.test.ts`,
`astrologers-barrier-recovery.test.ts`.
**Round-start EVENT BARRIER** (both event types, ordered AND parallel): while
`adventure.eventResolution` is set ONLY the player whose event choice is open may act
(`isRoundStartEventBarrierActive` / `roundStartEventResolver` in `parallel-turns.ts`),
cleared by a trailing sentinel in `pumpAdventureQueues`; recovery guards cover a
mid-resolution elimination, a zero-option City-Hall choice, a reconnect and the
drawer-owned shared bookkeeping rewards.
Deliberate readings: an early-game **Relic lock** (HOUSE RULE) keeps Relics out of
Event-GIVEN Artifacts before `EVENT_RELIC_MIN_ROUND` (5); Den of Thieves resolves for the
DRAWER only; A Shady Auction is sequential-but-hidden; earned Searches resolve in the
earning player's slot while a Treasure-die FACE Search queues at the END; Magical Forest
contributions are masked; Cursed Swamp's "cheapest unit" is the lowest gold-equivalent
printed cost of the CURRENT side; Marketplace is the resource exchange ONLY
(`TRADING_POST.tradesOnly`).

## Mine-guard reinforcement (OPTIONAL "Global" house rule, default OFF) — what runs vs. limits

House rule `mine-guard-reinforcement` (`src/engine/house-rules.ts`, category
`"global"`, default OFF in both modes): every fought-out neutral guard fight on a
**Mine field** fields ONE EXTRA random bronze neutral, folded into `drawGuardArmy`
by `mineGuardReinforcementDraws` and recycled to the bronze discard like any guard.
Pinned in `mine-guard-reinforcement.test.ts`, `game-options-tabs.test.tsx`.
LIMITS: reward / XP / difficulty are UNTOUCHED; Quick Combat and level auto-wins are
unaffected; Creature Banks / waves / bosses / floors never call `drawGuardArmy`; the
AI ignores it.

## Mine army defense (OPTIONAL "Global" house rule, default OFF) — what runs vs. limits

House rule `mine-army-defense` (category `"global"`, default OFF): an enemy Hero
walking onto YOUR flagged Mine opens the settlement-style defense window — pay 3
gold and defend with your UNITS **and your CARDS**. A flagged-mine arm in
`garrisonDefenderFor` + `garrisonDefenseCost` mine=3 over the existing
`pendingGarrison` flow; the cards waiver is ONE derived context flag
(`CombatContext.garrisonCardsAllowed`, set inside `startPlayerCombat` from
`garrisonDefenseKeepsCards`) read at the single hand-lock seam
`isHandLockedInCombat`. The heroless Mine defender may also CONCEDE
(`isHerolessMineDefender`) — the ONE heroless garrison that can. Pinned in
`mine-army-defense.test.ts`, `computer/visit-event-policy.test.ts`.
LIMITS: View Earth remote capture is NOT intercepted; a Mine with a LIVE guard
fights the guard first; a broke owner is never asked; everything gated on a HERO
(Tactics, Retreat/Surrender, commander / equipment / hero-grade folds) stays off;
every OTHER heroless garrison stays units-only.

## Official-rules switch-over (2026-07-25) — three OLD readings became opt-in house rules

Three readings the printed rules contradict were replaced by the OFFICIAL rule with
the OLD behaviour behind a house rule; pinned in
`official-rules-house-rules.test.ts` plus the per-mechanic suites.
- **`elemental-damage-no-die`** (combat, OFF in both modes). OFFICIAL: elemental
  damage only ignores Defense — the die IS rolled and ±⚔ cards apply. ONE seam
  `elementalLocksAttack` in `getAttackStackDetails`
  (`elemental-fixed-damage.test.ts`, `summon-elemental.test.ts`).
- **`discovery-border-gate`** (combat; `default: true` in BINH,
  `legacyDefault: false`, an INDEPENDENT editable toggle NOT part of the Polish
  package). ON: discovering/opening a face-down Tile needs an OPEN border (Redwood
  Observatory / Speculum bypass). Seams `heroCanDiscoverTileAcrossBorders` +
  `canHeroReachPlacementCenter`; MOVEMENT is untouched either way. NOTE: because
  BINH defaults it ON, the SP-AI immediate-access discovery variants are a no-op on
  a default BINH table.
- **`deck-access-hero-level`** (decks, OFF in both modes). OFFICIAL: deck access is
  decided by the TILE the main hero stands on alone (Ⅰ–Ⅲ basic/Minor, Ⅳ–Ⅴ
  expert/Major, Ⅵ–Ⅶ expert/Relic, weaker tiers still allowed). Seams
  `canDrawExpertSpells` + `artifactDeckAccess` (ruleset.ts). KNOWN CONSEQUENCE:
  buying Expert spells means walking the main hero onto a Ⅳ+ tile first.

## The Resource die's "2 valuables" face is a BINH house rule now (2026-08-07)

USER RULE: the 2-valuables result is removed for BINH ONLY; the base game must still
roll it. House rule `resource-die-single-valuables` (category `global`, **default
true in BINH, absent ⇒ OFF in Legacy**), one seam `resourceDieFaces(state)`
returning `SINGLE_VALUABLES_RESOURCE_DIE_FACES` or `PRINTED_RESOURCE_DIE_FACES` in
the same face ORDER; the old `RESOURCE_DIE_FACES` const is GONE so a stale reader
fails to compile. Every consumer takes the state-aware read and the UI cube takes
`MapDiceOverlay.resourceLayout`. Pinned in `resource-die-valuables.test.ts`,
`overlays.test.tsx`.
LIMITS: a LEGACY snapshot with no frozen flag now rolls the PRINTED die (the
demanded change); "Set the Resource die" offers one pick per DISTINCT face (5 capped
/ 6 printed); the Polish reduced-starting-bonus high-face reroll is live on
valuables again; the AI is not re-scored.

## Recent-gameplay-fixes batch (2026-08-06): 15 commits, audited — what runs vs. limits

Fifteen codex commits landed after a full audit (protocol v19; `npm run deploy:partykit`
required). AUDIT REVERTS: b9a0b7bc's Ⅶ-field identity lock and its
`grailAsUtopia:"always"` conversion (they destroyed the Grail dig — see the Grail →
Utopia section, which supersedes the surviving guard-swap half); the tournament combat
SANDBOX split-deck change (the sandbox reads legacy defaults, so split decks silently
DESTROYED cards); accc1900's blanket map gate on `CREATE_ACTIVE_EFFECT`.
What shipped: Golden Bow / Necklace of Dragonteeth sides flagged `combatOnly`; house rule
`eversmoking-ring-of-sulfur-major` (decks; ON in BINH, OFF in Legacy); tournament games
force `split-decks` at the `setGameOptions` lobby seam only
(`tournament-split-decks.test.ts`); Polish Stack purchases charge printed valuables; the
Crown of Dragontooth refreshes exactly ONE Book Spell; the Obelisk **Grail-clue** offer
(`GRAIL_TILE_SCRY`, once per player per Obelisk, picked by clicking a glowing face-down
hex whose face can still be a Grail OR a Utopia — `obelisk-house-rule.test.ts`); a Tome's
split-deck selection (SUPERSEDED 2026-08-11); bank Stack-Token stats reroll so no stat
lands more than twice; Halberdier Parry requires `discardCardId` plus a tray tile; house
rule `initiative-specialty-draw` (abilities; ON in BINH, OFF in Legacy);
`combatIsHopeless` retreats a doomed neutral fight with a TIERED threat ratio (1.35×
wounded, 2× unwounded); the **instant card gain/recovery lifecycle** (map plays +
`drawOnly`/`utilityOnly` window joins that never OPEN one — SUPERSEDED 2026-08-08; the
in-flight ledgers `recoveryInFlightCardIds` / `castInFlightCardIds` keep a resolving card
out of its own recovery pool, so a played card can never pick ITSELF); and the computer
first-player ceremony pause (`ACKNOWLEDGE_FIRST_PLAYER_ROLL`, gated by the ONE shared
`firstPlayerCeremonyPending` read by legal-actions AND `computerDecisionOwner`).

## "Instant (any time)" cards inside a reaction window (2026-08-07)

Printed `combatAnytime` instants (Gerwulf's Ballista discard, Frost Ring, Meteor
Shower, the Tarnum-Dungeon row blast) were offered off-turn with no window open but
were unreachable INSIDE one — and with nothing else window-opening in hand no window
opened at all, so the blow, the Retaliation Attack and its damage resolved inside ONE
`ATTACK_UNIT`. ONE seam: `combatAnytimeInstantWindowJoins` (legal-actions.ts) is
appended to `getLegalReactionsForTrigger` for BOTH fighters in EVERY window, with
`LegalAction.windowJoinOnly` (read by the shared `reactionOfferOpensWindow`) marking
joins that may not OPEN one; the reducer's PLAY_CARD tail runs
`advanceReactionWindowAfterPlay` for the PRIORITY player so the spent card drops out.
Artillery is also offered to the ATTACKING side.
`combat-instant-reaction-windows.test.ts`. SUPERSEDED 2026-08-08 (the OPENER half
only) — inside an ATTACK window either participant now opens it.
LIMITS: never an opener outside an attack window; not widened past the printed
`combatAnytime` flag (`combatOnly` turn plays and printed-trigger reactions stay out
via `cardHasPrintedTriggerMatch`; `mapOnly` is an ABSOLUTE bar; exclusions live in the
registry `DOCUMENTED_WINDOW_EXCLUSIONS`); the tray lists only unit-target /
target-less joins; a computer seat PASSES.

## A printed FOLLOW-UP attack gives the ATTACKER a window too (2026-08-07)

Every follow-up attack already declared through `openDeclaredAttackWindow`, so printed
reactions on both sides had a real pre-hit window; the hole was the attacker's
TRIGGER-FREE instants, flagged `windowJoinOnly` on the theory that "the other side had
its whole activation" — false for a follow-up the ENGINE declares mid-resolution. ONE
predicate `followUpAttackInstantOpener` returns the ATTACKING side's controller for a
`UNIT_ATTACK_DECLARED` carrying `abilityAttack`; both call sites read it
(`follow-up-attack-reaction-windows.test.ts`). SUPERSEDED 2026-08-08 by the broader
"Every instant OPENS an attack window" rule.
SCOPE: effect damage (splash, detonate, Dreadnought allocation) declares no attack and
opens no window; scoped to `abilityAttack`, deliberately excluding the Marksmen/Elves
`DOUBLE_ATTACK` and the Sandworm cube re-attack; a NEUTRAL attacker gains nothing.

## An "[unit_attack]" reroll ability fires ONCE PER ATTACK (2026-08-10)

USER RULING: "Minotaurs neutral can reroll -1 more than once, WHICH IS WRONG. ATTACK
icon abilities activate only once per attack." `onlyOnRoll` gates WHEN an ability may
fire; `rerollsPerAttack` is a hard budget EVERY use spends. Three seams:
`countAvailableRerolls` (now plain `source.remaining`), `rerollPendingChoice` and
`autoResolveNeutralReroll` (whose loop now terminates on the spent budget). The
violator list is exactly the `ATTACK_DIE_REROLL` family (`minotaur-reroll`,
`attack-die-reroll`, `yukikaze-torpedo-run`, `champion-move-reroll`).
`attack-icon-once-per-attack.test.ts`.
JUDGEMENT CALL: the Crusaders' printed "every 0" is read as "every die showing 0 in
this one roll", so their reroll is also once per attack (the old `reducer.test.ts`
case was flipped). UNCHANGED: the `[unit_passive]` `REROLL_ALL_MINUS_ONE` still
repeats, `attack-roll-advantage` is a roll MODE, the budget re-arms PER ATTACK, and
non-ability sources keep their own spend semantics. KNOWN LATENT GAP:
`REROLL_ALL_MINUS_ONE` reaches an ATTACK die only inside the
`hasRollTwoDiceApplyBoth` branch — no shipped unit has the exposed shape.

## Every instant OPENS an attack window · medic draw play on your own turn (2026-08-08)

USER RULING: "instant abilities should be able to be played before counter attack,
when attack and when defend, all of them … I still can't use card like Rion
speciality, not for heal, just for draw effect." Two seams:
`reactionOfferOpensWindow` (legal-actions.ts) now returns TRUE for `drawOnly` /
`utilityOnly` / `windowJoinOnly` offers when the trigger is `UNIT_ATTACK_DECLARED`
(primary, retaliation and printed follow-up alike, for EITHER participant) — both
gates that read it move together; and `addPlayableCardActions` offers a target-less
`drawOnly` PLAY_CARD twin for a medic face whose printed heal has NO legal target
(Rion I / Astra I print `damagedOnly`), resolved by `playCard`'s existing
`action.drawOnly` branch. `instant-abilities-attack-windows.test.ts`.
LIMITS: ONLY attack windows changed (a cast / activation / die-settled window still
pauses for nothing); the bare positive-Morale TOKEN keeps its
Retaliation-Attack-only opener; MORE PAUSES by design (an empty hand opens nothing,
Pass resumes byte-identically); the own-turn medic twin is withheld when a real heal
target exists; the AI PASSES and prices the medic play at 300. FLIPPED expectations in
`combat-instant-reaction-windows.test.ts`, `follow-up-attack-reaction-windows.test.ts`,
`medic-specialty-heal-draw.test.ts`, `neutral-reaction-pause.test.ts`,
`bulwark-heroes.test.ts`.

## An EMPOWERED ability's Expert side never spends a crown — every seam (2026-08-10)

USER REPORT: "empowered necromancy: STILL ASK TO CHOOSE BETWEEN BASIC AND EXPERT, AND
EXPERT STILL COST CROWN." The crown half was NOT reproducible for Necromancy; the
demanded sweep found it in EIGHT OTHER seams. The prompt collapse is PER-CARD via ONE
registry `EXPERT_SUPERSEDES_BASIC_CARD_IDS` (ruleset.ts) read through
`empoweredExpertSupersedesBasic` at both mode-building seams (`addNecromancyPlays`,
`getPlayableModesForCard`, kept in lockstep); its ONLY entry is `ability.necromancy`
(Learning, Pathfinding, Eagle Eye and Tactics keep their choice for a reason recorded
at the registry). FIXED seams: `playerCanUseArtilleryVolley` / `spendArtilleryExpert`,
the First Aid twin, `discardSchoolPermanentForExpert`, `applySchoolFetchExpert` +
`getSchoolFetchExpertActions` + `useSchoolFetchExpert`, both map-spell-boost tiles, the
map Mysticism expert recall, and `payOptionCardCost` / `canAffordCardCost` plus the
three mirroring crown reads in `overlays.tsx`. Pinned in
`empowered-expert-crown-free.test.ts` (a library-derived sweep through the real
PLAY_CARD pipeline and a real reaction window).
LIMITS: `empoweredAbilities` may hold STATISTIC ids and every seam keys off the CARD
ID, so those get the identical waiver; the Cannon's expert shot is deliberately NOT
waived; server-side, so `npm run deploy:partykit`.

## A cast whose only reactions are JOIN-ONLY froze the whole table (2026-08-10)

Game-breaking: a Spell "discarded without dealing dmg", then nobody could act. ROOT
CAUSE: `performSpellCast` probed "does anyone react?" with
`reactionPlayerOrder(...) === 0` and then IGNORED `openReactionWindowForTrigger`'s
return value; that function applies a SECOND gate (`reactionOfferOpensWindow`) which,
outside an attack window, is FALSE for bare Morale-token spends and every `drawOnly` /
`utilityOnly` / `windowJoinOnly` instant — so the Spell was already discarded, the
stack item stayed `pending` forever and every activation was blocked. The everyday
trigger is simply HOLDING a positive Morale token. FIX (one seam):
`performSpellCast` branches on `openReactionWindowForTrigger`'s own return value — no
window ⇒ `resolveTopStack`. **When adding a new window-opening call site, read the
return value; never re-probe with `reactionPlayerOrder`.**
`spell-cast-window-freeze.test.ts`. LIMITS: no rule changed (only stranded ⇒
resolved); the join-only reading is untouched; games already frozen are not repaired.

## EVERY card-gain instant works on the map AND in an attack window (2026-08-10)

USER REPORT: "Solmyr 4 can't be used in map => I ALREADY TOLD U TO MAKE ALL INSTANT
CARDS LIKE THAT CAN BE USED IN MAP AND AS REACTION WINDOW." Earlier sweeps walked only
`timing === "instant"` draw/recovery faces, missing TIMING (`specialty.solmyr.4` and
`specialty.ingham.6` shipped `timing: "combat"`) and EFFECT KIND (the deck DIG / SEARCH
families had a map play but no window join). FIX: (1) DATA — Solmyr IV becomes
`timing: "instant"` with no phaseLimit, the shared `ignoreDefenseOrDrawSpecialty`
generator becomes `timing: "instant"` KEEPING `phaseLimit: ["combat"]`; (2) ONE
resolution per effect shared by both paths (`resolveDeckDigKeepOne` / `-KeepMatching` /
`resolveDrawTopArtifactPlay` / `resolveSearchDeckThenReshuffle` +
`openCombatRemoveThenSearchChoice`), the seven kinds joining
`isDeckGainReactionUtility` → `isInstantReactionUtility` + `isEffectLegalForTrigger`;
(3) `DECK_SEARCH` now PARKS a window (`advanceReactionWindowAfterPlay` pauses, the
`RESOLVE_DECK_SEARCH` tail resumes — keep both halves together).
`instant-card-gain-legality.test.ts` (a library-derived sweep plus
`DOCUMENTED_WINDOW_EXCLUSIONS`, every entry asserted genuinely withheld).
LIMITS: `wog.artifact.magic_wand` option 0 stays map-only; a card whose OTHER side
matches the window's printed trigger offers nothing else there; the AI never spends one
(610 < `PASS_REACTION` 1_050); `timing: "map"` / `"town"` faces are out of scope.

## AI opening route · multi-target combat rules · border-free hexes (2026-08-09, protocol v24)

The `fix-ai-map-combat-rules` batch + audit (`npm run deploy:partykit` owed): Chain
Lightning needs 3 living PLACED units (its last two differing bolts open a
`chain-lightning` ABILITY_TARGET_CHOICE), Deemer's Meteor Shower is an EXACT
multi-target effect, the Catapult needs an adjacent PAIR, banks / PvE Gates / Field
Override hexes are ALWAYS border-free in render AND movement
(`fieldNeverWearsBorders` — the invisible-wall fix; the `showBankBorders` toggle is
REMOVED), the AI banks two home payoffs on turn 1 and enters an opened Ⅱ–Ⅲ tile by
turn 3 (`bestHomeOpeningObjective`), and a hero on a STANDALONE Monolith is
selectable again. `frost-ring-meteor-shower.test.ts`, `catapult-siege.test.ts`,
`map-navigation.test.ts`, `single-player-opening.test.ts`.

## Random Town defenders match the printed card (2026-08-04)

The Ⅶ Random Town's default defense is the printed card: ONE BRONZE Pack (a player
CHOICE) + TWO silver Packs + TWO gold FEWS from a faction not in play
(`randomTownGuardDraws`, seeded); difficulty Ⅶ whatever a designer stamps, with Walls
+ a Gate and NO Arrow Tower (`random-town-defenders.test.ts`).
LIMIT: the bronze pick opens a window only for a HUMAN defense controller — the AI and
every single-player table take `randomTownDefaultBronzePackId` (highest printed Pack
cost); the printed multiplayer faction-PICK roll is NOT modeled.

## Grail → Utopia conversion: at the DIG, never the dug field, full reward (2026-08-09)

The conversion fires when a Grail is TAKEN (dug), the dug field never turns
(`adventure.grailTakenFieldId`), and a converted extra Grail pays the NORMAL Utopia
reward. Engine `applyGrailTakenConversion` / `grailTakenConversionTarget` /
`grailConversionActive` + the `materializeTileFields` reveal branch (protocol v23);
`grail-converted-utopia.test.ts`, `polish-grail-utopia.test.ts`, `grail-mode.test.ts`.
LIMITS: `grailAsUtopia: "always"` is a LEGACY ALIAS of `after-dig-utopia` and swaps NO
guards before a dig; a converted site never feeds the `defeat-dragon-utopia` VP
objective, the Dragon-Hunt win or a Dragon-Conqueror capture.

## A Subterranean Gate crossing SLIPS PAST the far guard — it never clears it (2026-08-07)

USER RULE: travelling through the gate means no combat on the other side, but staying
and entering later IS a fight. `performHeroStep` passes a `gateTravel` flag into
`resolveHeroArrival`, whose guarded-field arm returns early with a note leaving the
guard intact (`designed-gate-links.test.ts`).
LIMITS: the pass is PER TRAVEL and collects nothing (the hex is not visited); teleport
NETWORK arrivals are UNCHANGED and still FIGHT.

## A Tome's dig is ONE play, then a two-button deck pick (2026-08-11, protocol v28)

USER RULING: "should work like 1 description, then allow to choose basic or expert deck
after wards with 2 buttons." ONE play offer, then a `spell-deck-pick` OPTION_CHOICE with
the crown spent at the PICK; two seams keyed off the same `tomeDigDeckOptions`
(`effectSupportsExpertOption`, `resolveEagleEyeDig` / `resolveSpellDeckPick`), rendered
by the generic `PromptTray` (`tome-deck-pick.test.ts`, `tome-deck-pick-ui.test.tsx`).
LIMITS: no pick unless `split-decks` is on, the Expert deck has cards and a crown is
payable (or the Tome is Empowered); Eagle Eye's LEVEL dig keeps both plays.

## Town teleports read ownership FLAG-first, so a CAPTURED Town works (2026-08-10)

The Castle Gate and the WOG Mirror read `TownState.controllerId`, which the engine
DELIBERATELY never flips on capture — control lives on `field.flagOwnerId`. ONE shared
read backs all three call sites: `isOwnTownOrSettlementField` (adventure.ts), flag-first
with `controllerId` as the fall-back for an UNFLAGGED field only
(`castle-gate-teleport.test.ts`, `wog-objects.test.ts`).
NOTE for fixtures: setup already flags each home Town's field, so `town.controllerId`
alone no longer takes control away — move the field flag.

## Diplomacy's skip costs a crown · Dragon Utopia guards use the table (2026-07-27)

Two shipped readings replaced by the printed card / the difficulty table (not toggles).
Diplomacy's matching-level skip is its EXPERT side, so it spends from the SHARED
`expertUsesSpentThisRound` budget unless Empowered — CONSEQUENCE: crowns start at hero
level 2, so a level-1 hero can no longer skip a difficulty-1 guard
(`tactics-diplomacy.test.ts`). The Dragon Utopia's default guards are the whole Field
Difficulty Ⅶ row (real DECK draws, not necessarily dragons, and pre-battle swappable);
the `utopiaGuards: "four"` mode keeps the minted four-dragon party
(`creature-bank-guards.test.ts`). REWARDS (2026-08-13): the Ⅶ FIELD pays 20 gold + two
Search (3); the Creature-Bank TOKEN pays a FIXED 40 gold + Search (3)/(5)/(5), so
Stacked defenders affect only the FIGHT (`dragon-utopia-artifact-reward.test.ts`).

## Ⅶ Utopia / Grail reward STACKING — warned, never blocked (2026-08-03)

One clear of a Ⅶ objective field CAN stack the built-in reward, a centre-hex reward/VP,
a hidden hex event's reward/VP and `objectives.utopiaBonusSearch` (now read by EVERY
paying Ⅶ Utopia branch). Deliberate, so both surfaces WARN instead: ONE pure derivation
`viiObjectiveRewardStacks` / `viiRewardStackWarnings` (`map-preset.ts`) feeds a designer
alert line and a map-pick banner line (`vii-objective-reward-stacking.test.ts`).
LIMIT: only a Ⅶ objective the design is CERTAIN to host is warned, and only Grail /
Dragon Utopia fields are covered.

## Atomic Necromancy window · Luck lasts the round · printed Treasure dice (2026-07-28)

- **The after-combat Necromancy window is an ATOMIC TRANSACTION.** Every prompt is built
  by ONE `openNecromancyWindow` and the deferred reward is a typed
  `pendingNecromancy.deferredReward` (`field-visit` / `creature-bank` / `wave` /
  `raid-boss` / `dungeon-floor`), so the bank reward, a wave payout, a boss kill and a
  floor advance are ALL frozen behind the window, with the Freelancer's Guild bounty,
  Soul Reformer, Bounty Hunter's Eye and Equipment gold queued as `visit-steps`;
  `pumpAdventureQueues` returns early while it is open. `remaining` is
  `min(2, cards held)`, so both Necromancy copies can be played and layered with Legion
  pieces before "Resolve bonuses and continue" (still `SKIP_NECROMANCY`); offers this
  window BANKED expire on Resolve (`pendingNecromancy.discountIds`). The AI is
  repriced: `REDEEM_REINFORCEMENT_DISCOUNT` scores 1_135/1_130 while it is open, between
  the card play (1_140) and the exit (1_120) — `necromancy.test.ts`,
  `mulligan-necromancy.test.ts`. LIMIT: a PvP DEFENDER who wins opens the window during
  the ATTACKER's turn.
- **Luck (basic AND expert) lasts until the END OF THE GAME ROUND**
  (`duration: { type: "current-game-round" }`, expired by
  `expireEffectsForGameRoundEnd` at the round wrap, then released by
  `releaseEndedOngoingCards`), so map-die rerolls are one Treasure + one Resource per
  ROUND. Pinned END-TO-END on the LAST seat in `prophecy-diplomacy-artifacts.test.ts`
  (the only shape that discriminates the old turn-scoped rule). KNOWN LIMIT: the Battle
  Test SANDBOX never expires it.
- **An Ongoing card can be ended early** (`DISCARD_ONGOING_CARD`), routed by the SHARED
  `releaseEndedOngoingCards` so a recalled ongoing Spell returns to hand or the SPELL
  BOOK, never the discard (`reducer.test.ts`).
- **A Treasure chest rolls the dice PRINTED ON ITS FIELD**
  (`TileFieldDefinition.treasureDice` → `MapFieldState.treasureDice`; a designer field
  rolls 1) — `reported-bugs-regression.test.ts`. Also: `&N1`'s "?" cabin is a Trading
  Post, `#N1`'s Tree of Knowledge is level Ⅳ, neutral Minotaurs are Few 6 / Neutral 7
  Initiative, a wave assault no longer overwrites `activePlayerId`, and
  `computerDecisionOwner` drives a COMPUTER PvP-Neutral-Control seat's guard placement.

## Torosar's Ballista specialty is the PRINTED card again (2026-08-11)

The engine did not implement the printed cards (the committed scans are the truth). FIX
is DATA ONLY (`src/data/cards/adventure.ts`): I is the shared buy-or-fire `CHOOSE_ONE`
("Pay 5 gold to gain a Ballista — OR — Activate your Ballista"), identical to
Tarnum-Castle I and Gerwulf I; IV drops the invented activation and takes
`timing: "map"`; VI becomes `grant: "combat"` (`torosar-ballista-specialty.test.ts`).
LIMITS: I now COSTS 5 gold and needs a Ballista in play for its combat side; IV is
map-only, VI combat-only, and both still sit in the Ongoing tray for their grant's life
(that IS the printed card). The 2026-08-10 Ongoing-tray hold was NOT the bug.

## Ash's Bloodlust IV cube lasts the WHOLE combat (2026-08-12)

USER RULING: "ASH SPECIALITY IV IS ONGOING AND PLACE BLACK CUBE MEANS THAT UNIT CAN
NEVER RETALIATE … I AND VI ARE INSTANT." The cube was `retaliatedThisRound`, which
`resetCombatRound` clears; IV now also carries the NEW `CANNOT_RETALIATE`
ActiveEffectModifier read by `unitHasCannotRetaliateEffect` at BOTH retaliation gates
(`shouldRetaliate`, `qualifiesForPreemptiveRetaliation`) ABOVE the unlimited-retaliation
escapes (`ash-bloodlust-specialty.test.ts`, `page-ash-bloodlust.test.tsx`).
LIMITS: I and VI keep the round-scoped cube; dispelling IV lifts the lock with the buff,
while a Cure-family cube removal does NOT unlock a unit still under IV.

## Aiming spells hit the Arrow Tower — and never MOVE it (2026-08-12, protocol v27)

USER RULING: aiming spells (Magic Arrow, Lightning, Slow…) must be castable on the Arrow
Tower. The ENGINE always allowed it — the bug was UI (the Tower sits at position −1 with
no cell), so `BattlefieldBoard` resolves `arrowTowerTargetAction` from the SAME per-unit
maps the cells read. ENGINE FIX: the Teleport Spell and the Necklace of Swiftness really
MOVED it, so `effectRelocatesUnitOnBoard` / `arrowTowerRefusesEffect` (`siege.ts`) drops
it from both target builders (`arrow-tower-spell-targets.test.ts`).
LIMITS: it is a real SILVER card (tier gates still apply); Chain Lightning, the
Catapult/Cannon, Clone and space-target blasts still never reach it. KNOWN LATENT GAP:
`getOrthogonalNeighbors(-1)` returns PHANTOM neighbours `[3, 0]`.

## Polish combat towns, MGQ balance + its audit (2026-08-13, protocol v29)

The `e4c134b1` commit + audit (`npm run deploy:partykit` owed): `polish-grail-utopia`
left the lobby (legacy-compat only) while the two artifact re-tier switches joined the
Polish list; Factory's Mana Generator costs 4 gold; MGQ's starting slots draw RANDOMLY
without replacement and its Four Spirits choice reaches the NEUTRAL deployment window
(gates scoped by `playerMainHeroInCombat`); Jessie's Spear Wall is fixed effect damage;
Sonya's +1 Defense is round 1 only; Factory Bounty Hunters' combat-start Mark is a
player PICK; a crown may pay a Power card's EXPERT value on an "up to N" cost.
`mgq-spirits.test.ts`, `factory-unit-abilities.test.ts`, `factory-content.test.ts`.
AUDIT FIX (frozen-table class): a NEUTRAL-controlled Bounty Hunter / Disciplinary
Committee opened a pendingChoice owned by `NEUTRAL_PLAYER_ID` nobody could answer —
the neutral seat now takes the deterministic pick (`applyDisciplinarySanction`).

## PvP prep shopping is truly SIMULTANEOUS — the opponent's open Search no longer freezes you (2026-08-14)

USER REPORT: "WHEN PLAYER GET ATTACKED BY ANOTHER PLAYER: WHY CANT I BUY UNITS THEN
UPGRADE, OR THEN BUY SPELLS." The lone-shopper spree was already green; the bug was
SIMULTANEITY — the moment the OTHER fighter's purchase opened an exclusive interaction
(a spell-buy Search `pendingChoice`, a Legion `pendingVisit`), the bystander branches
collapsed this fighter's offers to NOTHING. FIX (two seams, one rule): a participant
still `inCombatPrep` keeps their TOWN ACTION offers (`addTownActions`) while ANOTHER
player's pendingChoice or pendingVisit is open — safe because those purchases are
handler-validated, touch only the actor's own state, and anything they queue waits
FIFO. Also fixed: the Blacksmith and Magic University offer blocks are gated on
`!state.combat`, matching handlers that refuse any open combat (dead buttons in prep).
`pvp-prep-simultaneous-shopping.test.ts`, `pvp-precombat.test.ts` (its old "offered
nothing at all" reading is superseded), `src/app/page-pvp-prep-shopping.test.tsx`.
LIMITS: card plays, ACCEPT_COMBAT and the escapes stay withheld while a foreign
interaction is open; your OWN open Search still gates you; outside prep nothing moved;
no `window.ts` lockstep change and no protocol bump.

## A live ongoing card is NEVER in the discard pile (2026-08-10, protocol v25)

USER RULE: show ongoing spells/abilities/artifacts in a window while their effect runs
and only then discard them. Most already ran; the hole was the other direction. ONE
seam: `holdLiveOngoingCardsFromDiscard` (active-effects.ts) is called in `applyAction`'s
tail immediately before `releaseEndedOngoingCards` (the two are now a pair) and pulls a
card out of its owner's discard whenever a LIVE, non-instant, card-sourced
`activeEffects` entry names it. It fixes the two paths that create their effect LATER
than the play action: Fortune played on the map with a power source in hand, and
Shackles of War played in the PvP prep window (`ongoing-cards-in-play.test.ts`,
`ongoing-tray.test.tsx`).
LIMITS: the existing "Permanents & Ongoing" tray IS the window (no second window was
built); combat-scoped holds live until the fight is ACKNOWLEDGED; instants, permanents,
removed cards and shared-deck casts are untouched; legacy snapshots migrate silently
with one cosmetic edge (a second copy may be held if the effect's card was REMOVED — no
card is created or destroyed).

## Specialties & combat reactions · summon/recruit elemental split (2026-07-31)

Two audited codex commits: the reaction batch resolves in the PLAYER'S declared order;
the bare positive-Morale token opens a window ONLY on a Retaliation Attack though its
spends join any open one; Familiars' Mana Leech is the CASTER'S chosen discard paid
BEFORE the held Spell casts (`familiar-choose-discard`); expert Mysticism/Knowledge
never returns the recall card itself (`recallSpell.sourceCardId`); summon elementals are
separate `summonOnly` `conflux.*` definitions while `neutral.*_elementals` are the
recruitable guards (`isRecruitableNeutralUnit` gates deck BUILDS and every RECRUIT
surface, deliberately not the generic `drawFromNeutralDeck` pull); Pandora's Gift:
Income raises the real production track; "Ignore the Attack die" zeroes the whole rolls
array. `unit-ability-interactions.test.ts`, `morale-in-combat.test.ts`,
`knowledge-recall-instants.test.ts`.
TWO CLAIMS HERE WERE LATER REVERTED AS WRONG: the "Torosar I/IV/VI are game-round
Ballista grants" reading (see the Torosar section) and "Eagle Eye's find MUST be taken"
(the printed card offers take-or-discard on both sides — `resolveEagleEyeDig` sets
`allowDiscard: true`, `eagle-eye-combat.test.ts`).

## Gate shield · Artillery instant · Grail build button · Spell-Book labels (2026-08-03)

**Gate shield** (house rule, always on in a siege): a DEFENDING unit on its own Gate
SHIELDS it — ONE backstop `defenderOnFortification` at the top of `destroyFortification`
(siege.ts) plus offer-side filters (`gate-shield.test.ts`). **Artillery (basic) is an
instant REACTION** when your unit is attacked (`artilleryCardReactions`;
`artillery-reaction.test.ts`). A unit REMOVED while its blow is parked no longer attacks
from beyond the grave (an early guard in `resolveAttackStackItem`). **"Build the Grail"
finally has a button** (`HeroActionsDock` reads the existing `BUILD_GRAIL` offer).

## The frozen-table class: "That action is not legal…" forever (2026-07-31)

A table where NOBODY can act (or the client's rendered state diverged). Five fixes;
protocol v16 so a STALE edge shows the out-of-date banner instead of the symptom.
`computerDecisionOwner` (`computer/window.ts`) now MIRRORS `getLegalActions`' window
precedence — **keep window.ts in LOCKSTEP with legal-actions' gate order**; runner stall
recovery applies ONE do-least window-resolving action (`computer/stall-recovery.ts`); a
dead-candidate ability-target choice is skippable; the edge adopts the reducer's
duplicate-army-id repair on REJECTED actions; and the client resyncs unconditionally
after a rejection (`ingestServerStateSafely`, the `"resync"` snapshot source).
`window.test.ts`, `stall-recovery.test.ts`, `edge-army-id-repair.test.ts`,
`page-snapshot-resilience.test.tsx`.
LIMITS: recovery never answers a HUMAN-owned window; the `playerOwnsWarMachine`
view-vs-state flip and the orphaned `pendingGarrison` on defender elimination stay open.

## Transport self-healing: receipt probe, dedupe-safe re-send, durable ledger (2026-07-30b)

A receipt probe at `ACTION_RECEIPT_PROBE_MS` (5s) runs the pong-watchdog recovery, every
socket (re)open re-sends unsettled frames verbatim (≤ `MAX_ACTION_RESENDS` 2), and the
edge's outcome ledger (`answered-actions`, newest 64) is recorded BEFORE persist in the
SAME coalesced storage write under BOTH the verified userId and the clientId
(`realtime.test.ts`, `edge-action-race.test.ts`, `verified-actor.test.ts`).
CRITICAL LIMIT: **every re-send is gated on an explicit DURABILITY HANDSHAKE**
(`durable: true` on `action-received`), never the plain receipt — an older edge sends
receipts with an in-memory ledger, so gating on the receipt would apply an action TWICE
across a frontend-only deploy.

## Explorers hand step · Settlement-reroll option · Cannon vs walls · Secondary-hero defeat · transport receipt (2026-07-30)

Explorers (Astrologers) is a two-step hand sequence — `REFRESH_HAND` then the mandatory
`RESOLVE_EXPLORERS_DISCARD` (one empower per 3), round-PARITY gated by
`explorersHandStepActive`, with the turn-timeout driver taking both steps so a table
cannot freeze; Ⅱ–Ⅲ tile identity rerolls are the `far-tile-rerolls` HOUSE RULE and the
old `GameSetupOptions.farTileSettlementReroll` is REMOVED (do not reintroduce it); the
Stack-Token default is the official guaranteed difficulty count with the old roll behind
`bank-stack-chance-80`; the Cannon may shoot a Wall/Gate as the besieger; a DEFEATED
Secondary Hero is removed from the game (its death withholds the winner's automatic
visit on a "visitable" field, while flags transfer and a carried Grail passes to the
Main Hero). `astrologers-recruit-explorers.test.ts`, `turn-timeout.test.ts`,
`far-tile-flip.test.ts`, `catapult-siege.test.ts`, `surrender-retreat.test.ts`.

## Settlement capture choices · two Necromancy copies · timed reward choices (2026-07-28)

Capturing a founded settlement opens the full SETTLEMENT_CHOICE (any resource, reinforce
a bronze/silver Few at half cost, or — with `polish-unit-stacks` — ONE Stack layer at
half printed gold; picking reinforce or a Stack DESTROYS the resource token); a
Necropolis hero may own TWO Necromancy cards via the Amplifier fetch only; a designer
timed event may be a `choice` raising the round-start EVENT BARRIER; Legacy disembarking
no longer ends movement while BINH keeps both coastline halts; and the Calamity/Dungeon
Gates are REACHABLE via ONE shared `BLOCKED_FIELD_CARVE_LOCATIONS` /
`isBlockedFieldCarve` list read by `canCrossEdge`, `heroFieldSealedForDiscovery` AND the
board's `borderlessSlots`. Two new default-OFF "Global" house rules:
`no-secondary-heroes` and `free-neutral-combat-extend` (which removes the only bound on
a fought combat's length). `siege-tokens.test.ts`, `custom-setup.test.ts`,
`module-gate-reachability.test.ts`, `pvp-prep-town-actions.test.ts`.

## First-round hand discards, Angel Wings, morale −2, Search top-of-discard (2026-07-25)

Four fixes to shipped behaviour (not toggles): a round-1 hand-refresh discard goes to the
BOTTOM of your own deck; every shared deck starts with one card face-up on its discard
pile, so the first search offers the take-the-top option; Angel Wings walks THROUGH
fields via the new `HERO_PASS_ANY_FIELD` modifier
(`GAIN_HERO_MOVEMENT.passAnyFieldThisTurn`, read as `passAnyField` in `classifyHeroStep`
— deliberately NOT granted to Fly or Dessa's Logistics VI, and yellow borders are still
not crossed); double-negative morale settles only the SECOND token, leaving −1; and a
Search returning 2+ revealed cards lets the searcher pick which sits face up
(`openDiscardTopPick`). `first-round-hand-discard.test.ts`,
`shared-deck-discard-seed.test.ts`, `map-movement-spells.test.ts`,
`spell-discard-pick.test.ts`.

## Falling back after a defeat costs no extra movement (2026-07-27)

`moveDefeatedHeroHome` no longer zeroes `hero.movementPoints` on either arm, so a beaten
Hero keeps its remaining points — consistent with RETREAT, which never touched movement
(`defeated-hero-retreat-choice.test.ts`, `surrender-retreat.test.ts`).
CONSEQUENCE: the same waiver applies to SURRENDER (considered and accepted); nothing else
about a defeat changes, and the retreat CHOICE still cannot be dodged.

## "The deck ran out" never ends a draw (2026-07-26) — one seam per deck kind

Every own-deck dig runs through **`digFromOwnDeckTop`** and every shared-deck top pull
through **`reshuffleSharedDeckIfEmpty`** (`decks.ts`): an emptied deck shuffles its
discard back in and keeps drawing (`deck-reshuffle-on-empty.test.ts`). CALLER CONTRACT:
cards a dig has already taken/rejected are held ASIDE until the dig ends, so at most ONE
reshuffle happens and a "dig until X" scan always terminates; all in-flight cards are
held OUT of their own reshuffle (`inFlightCardIds`).
LIMIT: **peeks are not draws** — the Thieves' Guild "look at the top 2" still needs 2
real cards.

## Beginning-of-player-turn draws resolve after the hand phase (2026-07-26)

Round effects resolve first, then the active player completes `REFRESH_HAND`, and only
then are beginning-of-your-TURN buildings queued (`refreshHand` calls
`queueTurnStartBuildingChoices`) — Necromancy Amplifier, Portal of Summoning, Mana Vortex.
CONSEQUENCES (deliberate, `siege-tokens.test.ts`): PASSING the turn without drawing
FORFEITS that turn's building prompt, and a turn-start card gain lands AFTER the
hand-limit snapshot, so a fetch can leave the hand one over the limit until next turn.

## Table info & readability pass (2026-07-25) — presentation only

No engine change; every value shown is already public. A Pack card names the Few side it
flips to (`unitFlipSidePreview`, derived through `applyUnitSideRules`; null for
Few/Neutral, bank/boss, Clone or a specialty cover — rank folds and Polish layers
deliberately NOT applied); the opponent window adds public counts + the browsable
discard pile; a PvM watcher sees the FIGHTER's resources; the name/HP plate is capped at
76% so it cannot cover the printed Initiative. `unit-flip-side-preview.test.ts`,
`opponent-info.test.tsx`, `board-card-hud-width.test.ts`.

## Innate flat Attack bonuses reach the card, not just the dice (2026-08-10)

A Haspid flipping Pack→Few did not SHOW its +2 Attack (a pure display gap). ONE shared
seam `getInnateFlatAttackBonus(unit, isRetaliation)` (`unit-abilities.ts`) folds the
INNATE flat Attack bonuses (`ATTACK_BONUS_IF_FLIPPED`, `OWN_ATTACK_FLAT_BONUS`,
`FLAT_ATTACK_BONUS`) and is called by the attack resolver AND every display read
(`innate-flat-attack-display.test.ts`, `haspid-flip-attack-display.test.tsx`).
LIMITS: only that class is shown (target-conditional / per-activation / positional
bonuses stay off the card though the resolver applies them); it is the OWN-attack
reading; the flip PREVIEW carries the bonus in the separate `flippedAttackBonus` field.

## Creature Banks (Naval Battles optional rule) — what runs vs. what is deferred

Data `src/data/map/creature-banks.ts` (12 banks, `creature-banks.test.ts`), combat in
`creature-bank-combat.test.ts`, abilities in `creature-bank-abilities.test.ts`, UI in
`creature-bank-board.test.tsx` / `board.test.tsx`. Lobby option `creatureBanks`. One
line per sub-rule:
- **Placement**: discovering a Far (Ⅱ–Ⅲ) or Near (Ⅳ–Ⅴ) tile with a Blocked Field
  offers a token from the matching pile (a Subterranean cavern draws from the NEAR
  pile — BINH house rule); the token is PEEKED onto `tile.reservedBankId` BEFORE
  rotation and consumed by id only after placement.
- **Bank fights**: no Quick Combat, no experience, guards pinned to the four board
  CORNERS with the attacker in the central six cells (`CREATURE_BANK_GUARD_CORNERS` /
  `CREATURE_BANK_ATTACKER_CELLS` via the shared `placementCellsFor`); HOUSE RULE — a
  bank DOES obey the one-Round limit and the spend-1-MP extension.
- **Gradeless both ways**: a `bankUnit` guard ranks targets by DISTANCE only (keeping
  the ranged rules) and is itself targeted LAST; tier-gated spells can never touch it
  (`effectIsTierGated` + `gradeRankOfUnit`).
- **Stack Tokens**: the official rule guarantees the Scenario Difficulty count (Easy 1
  … Impossible 4); `bank-stack-chance-80` (default OFF) rolls each at 80%. A token
  gives +1 attack/defense/health or +2 initiative and absorbs one lethal blow.
- **"Gain a unit" rewards** (Dragon Fly Hive / Griffin Conservatory): the dedicated
  BANK card — never the faction or Neutral-deck twin, never a Polish layer — plus
  (X ≥ 2) a chosen real `ArmyUnitState.stackToken`; that card is tierless, has no
  veteran track, cannot flip, and does NOT occupy the same-named unit's recruit slot.
  Both banks also grant an **Ability Empower token** (`USE_ABILITY_EMPOWER_TOKEN` on a
  non-Empowered hand Ability → crown-free Expert forever —
  `ability-empower-token.test.ts`, `empowered-ability.test.ts`).
- **Bank abilities** are all engine-wired (`DISPLAY_ONLY_BANK_ABILITIES` is EMPTY) and
  every "while Stacked" gate lives in ONE place (`getUnitAbilityDefinitions` hides a
  `requiresStacked` ability until the token is there). All twelve rewards are
  engine-resolved, the Pyramid's extra via `REMOVE_THEN_SEARCH_REPEAT`.
- **Polish house rules** (all default OFF in both modes; the lobby's "Enable all Polish
  rules" is derived from `category === "polish"`): `polish-bank-sizes` (peek TWO tokens,
  roll each size with seeded Attack dice, a mandatory A / B / "Leave it blocked" BEFORE
  rotation; size = the GUARANTEED count of Stacked defenders, no clamp, normal reward),
  `polish-unit-stacks` (persistent layers priced by `polishUnitStackCost` = the card's
  REINFORCEMENT price + its tier number, caps bronze 3 / silver 2 / gold 1, +1 Attack
  while any layer remains, each absorbing a lethal blow), `polish-spell-book`
  (refreshed/used Book Spells, casting consumes a "Cast a Spell" unless Intelligence is
  held, a Spell IN EFFECT can never be refreshed early, and a Book Spell may be refreshed
  only ONCE per game round — `polishBookSpellEffectIsLive` /
  `polishBookSpellRefreshBlocked`; Genie Wish runs the PRINTED dig and never refreshes a
  Book Spell), plus `polish-reduced-starting-bonus`, `polish-rule-111`,
  `polish-reduced-surrender`, `polish-random-artifacts` (needs `split-decks`),
  `polish-pandora-search`, `polish-wait` and `polish-quick-combat`.
  `polish-bank-sizes.test.ts`, `polish-unit-stacks.test.ts`,
  `polish-stack-reinforcement-price.test.ts`, `polish-stack-features.test.ts`,
  `polish-spell-book.test.ts`, `polish-house-rules-extra.test.ts`,
  `polish-quick-combat.test.ts`.
- **NO Quick Combat on Ⅵ/Ⅶ fields — EVER, either rule** (USER RULE): ONE cap
  `QUICK_COMBAT_MAX_FIELD_DIFFICULTY` = 5 / `quickCombatAllowedAtDifficulty`
  (`src/engine/polish-quick-combat.ts`) gates the classic level auto-win, the Polish
  strength shortcut and both display reads. Polish Quick Combat otherwise keys off
  ARMY strength (5 strongest cards vs `2×FieldDifficulty + X`), making an uncovered
  fight MANDATORY even for a high-level hero.
- **Tournament Morale "Search again"** (with Morale Cards OFF): spend the positive
  token to discard the revealed cards and re-run the same Search (X) —
  `tournament-morale-search-again.test.ts`, `deck-search-mode-modal.test.tsx`.
DEFERRED: bank units still carry the underlying unit's `grade` field for placement and
display, but it never grants them a tier in play.

## Monolith & Whirlpool Tokens (Conflux/Cove, map-designer content) — what runs vs. readings

Location Tokens per rulebook p.35/83, placeable ONLY through the map designer
(`CustomMapTilePlan.token`). Engine `resolveTokenTeleport` / `resolveGateTeleport`
(adventure.ts) + `offerPendingTokenPlacement` / `place-map-token` + `applyCustomMapTokens`;
data `src/data/map/locations.ts`. CANONICAL forms: an ON-tile teleporter is a `plan.token`,
an OFF-tile one a standalone `CustomMapObject`, and dragging across that boundary CONVERTS
between them. **Teleport Gates are Monoliths WITH a colour** — one network per colour (cap
`MAX_GATES_PER_PAIR` 8), never crossing colours or joining Monoliths. `map-tokens.test.ts`,
`map-objects.test.ts`, `map-designer.test.tsx`, `gate-object-board.test.tsx`.
READINGS/LIMITS: the plain colourless Monolith is RETIRED from the palette (legacy maps
still work); the whirlpool "lose 1 unit" is the traveller's pick; own-hero destinations are
skipped while ENEMY-hero ones are OFFERED (PvP on arrival); a token may cover ANY field
except a Creature Bank / blocked hex / another teleporter / a PvE-module gate / a live
guard / a Town (`TOKEN_FORBIDDEN_LOCATIONS`); terrain is enforced; whirlpools cap at 3.

## Designer guards, outposts & one-way monoliths (map-designer content, 2026-07) — what runs vs. limits

Six features on `CustomMapPreset` / `CustomMapTilePlan` / `CustomMapObject`
(`CustomGuardSpec`, `CustomCenterHexPlan`, `OnewayExitMode`; the shared `GuardSpecEditor`):
a Ⅵ–Ⅶ **center-hex editor** (`plan.centerHex` = guard / reward / vp, paid once by
`grantCenterHexBonus`); **guards on EVERY single-hex placement**
(`applyCustomGuardToField` / `clearCustomGuard`); a **teleport ARRIVAL now FIGHTS** the
exit's guard bank-style (`RESOLVE_TELEPORT_ARRIVAL` → `setTeleportArrivalHook`, difficulty
0, no XP, unlimited rounds) or starts a PvP battle, a WIN clearing the guard but never
re-opening the teleport; **every teleport travel offers "Stay here"**; **yellow border
edges on standalone object hexes**; **outposts** — Garrison (flagged, 3-gold ARMY-only
defense), Keymaster's Tent, Barrier — STANDALONE-only; and **one-way monoliths** in 4
colours with random / certain / mix exit modes. `vii-field-designation.test.ts`,
`map-objects.test.ts`, `outpost-objects.test.ts`, `teleport-arrival-rule.test.ts`.
LIMITS: no XP from outpost / one-way / teleport-object fights
(`isBankStyleGuardLocation`); an exact-army guard is never Quick-Combat or Diplomacy
skipped; a Barrier never carries a guard; the center-hex bonus pays ONCE.

## Map objects Global|Specific, hex events & guard visibility (2026-07) — what runs vs. limits

Three designer systems: per-kind **Global | Specific** plans
(`CustomMapTilePlan.objectPlans.{obelisk,mine}` = guard / reward / vp / break flags /
winCondition, merged FIELD-BY-FIELD over the global setting); a designer **"first clear
wins"** trigger (`fireDesignerWinCondition` at the `beginFieldVisit` seam); and invisible
**hex events** (`CustomMapPreset.hexEvents`, cap `MAX_HEX_EVENTS` 24, carved to
`adventure.hexEvents`; an armed guard opens a REAL fight via `setHexEventEncounterHook`,
then message + reward/VP through the shared `payDesignerFieldReward`, mode "first" or
"each-player", optional `replaceVisit`). In game a designer-altered object opens the
`designedGuardInspectFloat`. `map-object-plans.test.ts`, `map-designer.test.tsx`,
`map-floats-board.test.tsx`.
LIMITS: Obelisk ROLE stays map-wide; Grail / Utopia / Random Town SPECIFIC is the
center-hex editor; an ambush guard is beaten ONCE globally and overwrites a guard already
there; `replaceVisit` suppresses only the TRIGGERING entry; hex events are redacted from
player views but present in engine state; the win-condition tick is an instant-win
foot-gun by design.

## Underground designation (per-tile layer override, map designer) — what runs vs. limits

Any far/near/center/sea plan may be marked `underground?: true` on BOTH
`CustomMapTilePlan` and `MapTileState` (copied by `applyDesignedUnderground`): the tile
becomes topologically a cavern — reachable ONLY through a Subterranean Gate — while KEEPING
its band identity (group, back art, guard tiers, Creature-Bank pile, token legality). ONE
seam: `planIsUnderground` / `tileLayer` (adventure.ts). **AUDIT RULE: never inline a
`group === "subterranean"` LAYER check — use `tileLayer` / `planIsUnderground`; keep the
GROUP check only for BAND semantics.** `underground-designation.test.ts`,
`subterranean-gate-planning.test.ts`, `map-designer.test.tsx`.
LIMITS: the flag is stripped from `starting` and printed `subterranean` plans
(`UNDERGROUND_LAYER_GROUPS`); band content stays band (the FAR pile for a flagged Far
tile); designed gate links belong to any UNDERGROUND-layer plan only.

## Field Overrides & multi-pin tiles (global system; Anime mod content) — what runs vs. limits

`GameSetupOptions.fieldOverrides` (default OFF; auto-ON when a designed map carries
`plan.fieldOverride(s)` pins). Mechanism is CORE (`src/data/map/field-overrides.ts`
registry + `src/engine/field-overrides.ts` + `tile-hex-placements.ts`); the Anime and
WoG mods only register content kinds (WOG: 3 objects, package `"wog"`; Anime: 13
across `anime-xianxia` / `anime-isekai`, 2 of them Equipment outfitters gated by
`requiresModule: "equipment"`). On tile reveal the override places FIRST (before
Subterranean Gates → Creature Banks → teleport tokens); pool draws obey
`fieldOverridePlacement`. A tile may carry MULTIPLE overrides + tokens
(`plan.tokens` / `plan.fieldOverrides`; legacy singulars fold in) and a carved override
hex is Location-Token protected. Pinned in `field-overrides.test.ts`,
`tile-hex-placements.test.ts`, `map-tokens.test.ts`, `map-designer.test.tsx`,
`anime-locations.test.ts`, `anime-field-override-board.test.tsx`.
LIMITS: pool kinds stamped on face-down tiles are readable in raw snapshots (no
player-view masking in V1); no standalone off-tile override objects; `linh_tuyen` is +1
movement only; no override kind may claim `starting` tiles;
`FIELD_OVERRIDE_ART_PLACEHOLDERS` is EMPTY (a future art-less kind must be declared).

**Also shipped (anime modules on the same spine; every OTHER `AnimeModOptions` flag is
types + lobby state only — `docs/anime-mod-plan.md` is the contract):**
- **`anime.xianxiaArtifacts`** — 5 ORIGINAL Pháp Bảo Artifact cards
  (`src/data/anime/artifacts.ts`) joining the shared decks under the usual gates: Túi
  Càn Khôn (+1 materials income), Tụ Linh Bàn (+2 gold CONDITIONAL on the main hero
  standing in an own Town — the new `resourceRoundGain.requiresHeroInTown`), Phong Hỏa
  Luân (+2/+3 movement), Tru Tiên Kiếm (+2/+3 attacker reaction), Bát Quái Kính (+1/+2
  defender reaction). `anime-artifacts.test.ts`. NOT shipped: Đông Hoàng Chung, Truyền
  Âm Ngọc Giản, and the fancier halves of the five.
- **`anime.cultivation`** — a per-hero Realm track (`hero.cultivationRealm`, absent ===
  0) + the Heavenly Tribulation. Realms 1–2 advance automatically on level-up /
  bank-win; grants are +1 hand limit, 1 free Attack-die reroll per combat and +1 spell
  Power at realm 3, reached ONLY via the `HEAVEN_TRIBULATION` map action (a seeded
  3-die gauntlet whose "−1"s pay a cheapest-first army-card toll).
  `src/engine/anime-cultivation.ts`, `anime-cultivation.test.ts`. ADAPTATIONS: no
  Foundation-Pill path, Core Formation gates on `player.bankWins`, the toll is a card
  loss/flip, and realm NAMES are presentation-only and faction-owned.
- **`anime.heroGrades`** — a shared Merit→grade 0–3 track plus a 3-tier × 3-node tree
  (`src/data/anime/hero-grades.ts`, `src/engine/anime-hero-grades.ts`). Five Merit
  sources funnel through ONE arm `gainGradeProgress`; crossing a threshold (`[3,7,12]`,
  a DATA array) auto-grades-up. Nodes are passives and non-card SKILLS reusing the
  commander cast machinery. Grade NAMES wear faction-owned REGISTERS resolved by
  `heroGradeRegisterKey` — an enabled town flag never relabels another faction's hero.
  LIMITS: label art is deferred; combat skills are the MAIN hero's fights only.
- **`anime.equipment`** — always-on hero ITEMS in four slots (one per slot; buying into
  an occupied slot REPLACES with no refund). 36 items in three GRADES costing 4/6/8
  gold (`EQUIPMENT_GRADE_COST`), each BOTH a slot item AND an Artifact-deck CARD
  (`equipment-cards.ts`, joined only with the flag) played as a mapOnly
  `EQUIP_HERO_EQUIPMENT` that also grants a REGULAR same-grade Artifact. Read layer
  `src/engine/anime-equipment.ts`; pinned in `anime-equipment.test.ts`,
  `anime-equipment-cards.test.ts`, `equipment.test.ts`. Every fold REUSES a proven seam.
  LIMITS: **same-slot twins do NOT stack** (the equipment spell-power fold tops out at
  +1 and hand-limit at +2); buying is ONLY through the two outfitter Field Overrides;
  combat items are the MAIN hero's fights only; 9 icons are procedural placeholders.
  REGISTER-AWARE SHOPS: either outfitter also offers the VISITING hero's register line
  (`equipmentRegisterLineFor`), with `equipmentPackagesForFaction` special-casing
  hidden_leaf → `shinobi`, azur_lane → `kansen`, heavenly_demon → `modao` AHEAD of the
  register switch (each shares a register with another town). FUTURE TOWN RECIPE: a
  `factionVisualRegister` entry lights up an existing line with no shop edit; bespoke
  gear needs a new package returned from `equipmentPackagesForFaction`.
- **Cross-mod COEXISTENCE GATES (§3.8)**: (a) a scripted 2-human game to round 6
  serializes IDENTICALLY with `anime` absent / undefined / all-false
  (`anime-coexistence.test.ts`); (b) an ALL-ON fixed-seed soak reaches round 6 with no
  stalls (`src/server/anime-coexistence-soak.test.ts`); (c) mixed packages do not
  cross-talk; (d) display coexistence (`anime-coexistence-display.test.tsx`). KNOWN
  LIMIT: the two Equipment MARKETS are gated OUT of the designer palette (pool only).
- **Forced Battle Events (§3.12)**: a fight on a particular MAP FIELD runs scripted
  events at combat-start and/or a round-start. Mechanism CORE
  (`src/data/map/combat-scripts.ts` registry + `src/engine/combat-scripts.ts`, fired in
  `finalizeCombatStart` and `advanceCombatRound`, both idempotent); four effect kinds
  (`environment-stat`, `damage-pulse`, `place-obstacles`, `announce`); V1 content = the
  two Bí Cảnh scripts (`combat-scripts.test.ts`). LIMITS: V1 is FULLY AUTOMATIC (no
  script opens a window — the anti-AI-freeze design), NEUTRAL fights only, no obstacle
  auto-pick, no designer/campaign attachment surface yet.
- **The visual-novel STORY system (foundation)**: bilingual scene data
  (`src/data/story/scenes.ts`), the language preference (`src/lib/story-language.ts`),
  the `StoryOverlay` component, and ONE trigger — the designer timed event
  `{ kind: "story", sceneId }` fired as a table-wide `STORY_SCENE_TRIGGERED`, popped
  once per event id and never on reconnect (`scenes.test.ts`,
  `story-overlay.test.tsx`, `custom-setup.test.ts`). LIMITS: no karma/fate deltas, no
  music, no e2e.
- **STORY-MODE campaign hub + Chapter 1 of FOUR campaigns** (Jianghu Chronicle, Bin's
  Otherworld Chronicle, Restoration of Erathia, The Grand Convergence). Registry
  `src/data/story/campaigns.ts`, progress store `src/lib/campaign-progress.ts`, PURE
  triggers `src/lib/campaign-triggers.ts`, the `/story` route. The chapter's config is
  APPLIED once per room by pushing `SET_GAME_OPTIONS` + `CHOOSE_FACTION` through the
  NORMAL pipeline, which needed `buildAdventureFromLobby` to stop DROPPING `anime` +
  `fieldOverrides` (defaults OFF ⇒ a plain lobby is byte-identical;
  `campaigns.test.ts`, `campaign-triggers.test.ts`,
  `src/server/campaign-setup-injection.test.ts`). LIMITS: only Chapter 1 of each is
  PLAYABLE; protagonists are PRESENTATION over a CORE faction stand-in; `mapPresetId`
  is unused; only shipped anime flags may be set true on a playable chapter.

## Anime Towns (`anime.isekaiTowns` / `anime.xianxiaTowns`) & themed mod UI — what runs vs. limits

FIVE complete playable factions behind the two town flags (default OFF ⇒
byte-identical; `isPlayableFaction(id, animeOptions)` gates every pick surface):
**Fuyuki City**, **Hidden Leaf Village** and **Azur Lane Naval Base**
(`anime.isekaiTowns`) plus **Azure Breeze Sect** and **Heavenly Demon Palace**
(`anime.xianxiaTowns`). Each ships a 7-unit roster (every ability tag a REUSE except
those below), 8 buildings on SHARED archetypes (zero new `TownBuildingEffect` types),
2–5 heroes with their OWN specialties, a starting tile, a 7-bar board, a capitol icon
and a WOG commander. Data `src/data/anime/towns.ts`; pinned in `towns.test.ts`,
`hidden-leaf-content.test.ts`, `azur-lane-content.test.ts`,
`heavenly-demon-content.test.ts`, plus `src/server/hidden-leaf-live.test.ts`,
`azur-lane-live.test.ts`, `heavenly-demon-live.test.ts`.
LIMITS: the Battle-Test sandbox never offers an anime faction; Hidden Leaf ships 3
heroes, not the plan's 6; 9 equipment icons remain procedural placeholders.
The dedicated NEW engine arms: Fuyuki Casters' `casters-damage-cap` (≤1 damage per
single attack OR Spell, `CAP_DAMAGE_PER_ATTACK.includeSpells` —
`fuyuki-casters.test.ts`); Hidden Leaf's `jinchuriki-chakra-burst`
(`AFTER_ATTACK_SPLASH` 1 effect damage to every OTHER adjacent unit, friend and foe,
on OWN attacks only — `after-attack-splash.test.ts`); Azur Lane's
`kansen-full-barrage` (`AFTER_ATTACK_SPLASH` with `around: "target"` + `enemiesOnly`),
`kansen-fleet-formation` (`ADJACENT_ALLY_ATTACK_AURA` +1 Attack on allies' own
declared attacks), Belfast's **Royal Salvo** (the new commander cast kind
`enemy-damage`) and Enterprise's **Lucky E** specialty (hand instants whose die halves
join the reroll windows via `LUCKY_E_SPECIALTY_SOURCES`) — `kansen-abilities.test.ts`,
with the First-Aid window keyed off the `first-aid` SPECIALTY id
(`playerHasLivingFirstAidCommander`) so Belfast opens it too; and Heavenly Demon's
`heavenly-demon-blood-siphon` (heal after an own attack that really dealt damage) and
`heavenly-demon-reap` (a stacking Attack bonus when an adjacent unit is removed) —
`heavenly-demon-abilities.test.ts`.
Hero specialties: each anime hero owns its OWN set — unit specialists double on a gold
unit their OWN faction fields, medics are themed clones via `rethemedSpecialty` (they
previously borrowed Catherine's / Gelu's sets, whose doubling could never fire).
**Themed mod UI (visual registers)**: `src/data/faction-theme.ts` maps a faction to
`classic` / `anime` / `wuxia` with a per-register lexicon and a `theme-<register>`
class + `--mod-*` vars on the hero board, town window/board, army panel and every mod
window; the hero footer's words, realm name and grade title resolve from the OWNING
faction, never from whichever package flags are enabled. Heavenly Demon shares the
wuxia chrome with bespoke `modao` realm/grade registers; Azur Lane keeps the `anime`
register with a bespoke `kansen` grade register and a naval `factionUiLexicon` — NAMES
only. The hero-systems row opens POP-UP WINDOWS (shared `heroSystemModal` portal): the
grade skill tree, the equipment paper-doll (drag-drop over the real `EQUIP_HERO_ITEM` /
`UNEQUIP_HERO_ITEM`, replaced gear moving to `equipmentInventory`), the
commander-artifact window, and the **Unit Experience Board**
(`unit-experience-window.tsx` — per card the XP on the tier's REAL thresholds, the
rank-by-rank stat DELTAS, live folded stats, the ELITE ability text and the
engine-offered Drill / Reinforce / Stack actions; `unit-rank-badge.test.tsx`,
`hero-board.test.tsx`).

## Setup Hub — the four-box map-setup lobby (2026-07) — what runs vs. limits

The map-setup lobby (`SetupLobbyScreen`, `screen.tsx`) is FOUR painted icon boxes —
**Game mode · Heroes & Draft · Map · Advanced settings** — each opening ONE popup
window, plus the Start button; it replaced the two-tab layout and applies to single
player too. Pure PRESENTATION over the existing lobby actions, so no engine rule
changed. Components `SetupHub` / `GameModeModal` / `HeroesDraftModal` /
`AdvancedSettingsModal`, the shell `setup-hub-window.tsx`, `map-pick-modal.tsx` (+
`DifficultyChessBar`), `map-shape-preview.tsx` (the ONE home of `GROUP_COLORS`,
`flowerOutline` and the shared `planTileArt` resolver the designer also calls),
`setup-summary-rail.tsx` and the pure `setup-hub-summary.ts`. Pinned in
`setup-hub.test.tsx`, `setup-hub-summary.test.ts`, `map-pick-modal.test.tsx`,
`map-shape-preview.test.tsx`, and `tests/e2e/setup-hub-phone.spec.ts`.

### Box ownership + the summary rail — the four boxes are ONE screen

Three rules (the first two fix real bugs): a box never writes another box's key
(`customMode` belongs to the Game-mode box alone — a designed-map pick used to throw the
table into "Custom setup file"); ONE reading of "a designed map is in play",
`designedMapInPlay(options)` = `Boolean(options.customMap?.length)`, shared by the Map
box, the "✓ In play" marks and the classic picker; and the always-visible
`SetupSummaryRail` renders all four boxes' values from the SAME derivations.
LIMITS: the Advanced window still hosts the whole classic `GameOptionsPanel`, so several
rows are duplicate surfaces (each carrying a `SameChoiceAsBoxNote`); the hub window is a
true MODAL (the seat switcher sits behind its backdrop, and `HeroInfoModal` had to start
PORTALING to `<body>`); the difficulty bar transitions `transform` ONLY — do NOT re-add
a transition to `border-color` / `background` / `filter`, whose lag left the gold ring on
the old piece; per-map difficulty exists ONLY on designed maps.

## Cinematic main menu (2026-08-08) — what runs vs. limits

`/menu` is a full-bleed looping video backdrop with one stack of art buttons in FOUR
local-state views (main → singlePlayer / multiplayer / miscellaneous; Back never
navigates); Scenario mints the private `sp-` room directly (`createSinglePlayerRoom`)
and Campaign links to `/story`. `src/app/menu/page.test.tsx`,
`main-menu-media.test.ts`, `main-menu-video-motion.test.ts`.
LIMITS: **Co-op IS A PLACEHOLDER** (`/play` reads no query params); every button's label
is BAKED INTO its art, so a missing `aria-label` or webp leaves a nameless button; a
NARROW viewport (≤820px) never MOUNTS the video (`useVideoBackdropAllowed`, a
`useSyncExternalStore` over `matchMedia` whose SERVER snapshot is `false` — do NOT
"simplify" it to `useState` + setState-in-effect); `prefers-reduced-motion` works only
because no `display` on the video carries `!important` and the reduced-motion rule stays
LAST in source order; RE-ENCODING THE LOOP must preserve frames/fps/duration or the
seamless loop breaks (`compress-media.mjs` skips mp4).

## First-round rules, Cove City Hall & bank/opponent UI (BINH house rules) — what runs

Six additions: a round-1 hand discard returns to the BOTTOM of your own deck; every
shared deck starts with one card face-up on its discard pile so the first search offers
the take-the-top option; `cove.city_hall` fires on the RESOURCE round like every other
City Hall (`RESOURCE_ROUND_CHOICE`, the unused `ASTROLOGERS_ROUND_CHOICE` removed); a
tile's Creature Bank is PEEKED and reserved before rotation; a bank field draws NO
borders, which opens its outer edge for Tile DISCOVERY only
(`heroFieldSealedForDiscovery` takes a bank exception while `isOuterEdgeSealed` is
untouched and MOVING out across a Tile edge stays blocked); and the opponent-info dock /
modal render an opponent's PUBLIC state. `first-round-hand-discard.test.ts`,
`shared-deck-discard-seed.test.ts`, `cove-content.test.ts`, `adventure.test.ts`,
`opponent-info.test.tsx`.

## Pre-hit heals vs Spells/specialties & map-designer timed events — what runs

Pre-hit heals (First Aid Tent, First Aid ability, Cure) fire against damaging SPELLS and
specialty blasts: a `SPELL_CAST_STARTED` window whose cast would damage a player's units
(`playerThreatenedByPendingDamage`) offers `preHitHealReactions`, and Frost Ring / Meteor
Shower plays are DEFERRED onto the stack (`tryDeferSpecialtyDamageForHeals`) with a
synthetic window ONLY when a threatened player can heal (`pre-hit-heal-reactions.test.ts`).
LIMIT: that synthetic window is NOT a Spell cast, so Resistance, Knowledge/Mysticism
recall, Power boosts and the Brimstone cube stay gated to a real `CAST_SPELL` stack item.
Map-designer **timed events** are freeform (`CustomMapPreset.timedEvents`, cap
`MAX_TIMED_EVENTS` 32): any round 1–30 × any effect (resources positive OR NEGATIVE
floored at 0, hero XP through the normal `gainExperience` pipeline, Search, clear-cubes,
±1 morale, movement, dice, a note), an optional `repeatEveryRounds` (2–10), and
`clear_tile_cubes` (chosen bands, NEVER a Creature Bank or the Grail / Dragon Utopia
fields; a re-opened field with a printed `difficulty` re-fights fresh guards). Fired by
`applyCustomMapTimedEvents` at round start (`custom-setup.test.ts`,
`map-event-overlay.test.tsx`).

## A "+movement" card is playable DURING a neutral combat (2026-08-11)

USER RULING: "Boots of speed - you shoold be able to add '+1 movement' during the combat,
Fix for all." ONE shared read `heroMovementTopUpHeroId(state, playerId)` (effects.ts)
backs the OFFER (`isOptionEffectPlayable`'s `GAIN_HERO_MOVEMENT` case + the `mapOnly`
skip in `addOptionPlays`), the `playCard` backstop and the GRANT; detection is by EFFECT
KIND, never a card-id list (`combat-hero-movement-topup.test.ts`).
SCOPE/LIMITS: NEUTRAL combats the player is fighting (banks included) for the hero in the
fight — NOT the sandbox, NOT PvP, and NOT a reaction-window join (it never OPENS a
window); map SPELLS are out of scope. BUG FIXED in the same seam: played DURING a combat
the points go straight to the fighting hero, because the two-hero "which Hero?" pick is a
reward the frozen queue could not answer (the MAP play still opens the pick).

## Neutral-combat & Sorrow refinements (BINH house rules) — what runs

Expert Mysticism played into the kept-open activation-skip window also recalls the "pow"
cards paid for a Sorrow (`combat.pendingActivationSkipRecall.powerCardIds`; basic
Mysticism and Knowledge leave them spent — `rampart-inferno-spells.test.ts`); a +Movement
card may be played in a neutral combat's `awaitingContinue` window to buy another round
(`heroMovementGrantOption` detects the side by EFFECT KIND wherever it sits in a
CHOOSE_ONE — `neutral-combat-movement-extend.test.ts`); and the attacking player PICKS a
neutral's move destination when several legal cells reach its rules-fixed target
(`choose-destination` → `neutral-destination` OPTION_CHOICE, obstacle-aware via
`getReachableDestinations` — `neutral-move-destination.test.ts`).

## Manual guard relocation, first-round Mulligan, Wait/Defend queue, altered-guard warning — what runs

`GameSetupOptions.manualGuardControl` (default OFF) also gives the FIGHTER the pre-battle
formation SORT, with ONE new rule: a SHOOTER is restricted to `DEFENDER_BACKLINE`
(`neutralFormationCellsForGuard`, manual-only), plus `AUTO_NEUTRAL_PLACEMENT`;
`GameSetupOptions.startingHandMulligan` (**default ON**) now gates ONLY the round-1 hand
step (OFF = round-1 `REFRESH_HAND` rejects a non-empty discard) and the per-card
`MULLIGAN_CARD` flow is RETIRED; `getActivationOrder` RE-QUEUES a Waited unit at the
round's TAIL as DISPLAY ONLY (`getActivationStep` unchanged); and `field.designedGuard` +
`designedGuardPreview` drive an amber map marker and a move-confirm warning whose button
becomes "Attack" (LIMIT: a teleport onto an altered field is not gated).
`manual-guard-control.test.ts`, `starting-hand-mulligan.test.ts`,
`combat-activation-order.test.ts`, `designed-guard-preview.test.ts`.

## Medic specialty map draw-only play + paralysis cleanse in the window (2026-08-04)

ALREADY WORKING (now pinned): the reaction-window heal, including before the
COUNTER-ATTACK. FIXED: a face whose `effect.removeParalysis` is set now also accepts a
full-health PARALYSED unit as a target; and ONE shared read `healDrawOnlyRider(effect)`
(legal-actions.ts) backs both the map OFFER (`addTurnCardActions`) and the RESOLUTION
(`playCard`'s target-less draw branch), so a medic instant is playable on the MAP purely
for its printed draw rider — the gate opens EXACTLY 13 cards
(`specialty.rion.{1,4,6}`, `specialty.astra.1` and the `aoko` / `sirius` / `molian`
clones), enumerated by a library sweep (`medic-specialty-heal-draw.test.ts`).
LIMITS: a medic face with NO printed draw rider stays combat-only; the AI scores the map
play at 300.

## Medic VI draws BEFORE it discards · draw riders join open windows (2026-08-06)

USER RULING: "first you draw cards, then discards, and should work as reaction even when
there is no need to heal." Rion VI (and clones) now carries a post-draw
`HEAL_DAMAGE.thenDiscard` rider read by `drawRiderThenDiscard` and resolved through
`openHandDiscardChoice` — NOT the up-front `cost.discardCards`, so the drawn cards are
legal pitch candidates and the card is playable as the LAST card in hand. A library sweep
proves every implemented draw-rider Instant can join an open window; it caught Deemer IV /
Zydar I (`powerCrossOverOnly`) and Sorcery / Scales / Tunic, which now offer a basic-only
"(draw only)" join (`medic-specialty-heal-draw.test.ts`).
LIMITS: the draw-only twin is `utilityOnly`, so the trap-twin dedupe removes it whenever
the REAL face is offered; ~~"a draw rider never OPENS a window"~~ is SUPERSEDED
2026-08-08 (it opens an ATTACK window now).

## Combat draw-only abilities, Knowledge recall & value-based Power costs (BINH house rules) — what runs

- **Combat draw-only Sorcery / Offense / Armorer**: on your own combat activation these
  "+stat/+Power, then draw" abilities may be played JUST for the draw with no window open
  — the stat fizzles, only the rider resolves (`combatDrawOnly`, basic only; fired in
  `playCard` when `!state.reactionWindow && state.stack.length === 0`).
  `sorcery-draw-rider.test.ts`. EXTENDED 2026-08-08 to target-less medic heal faces.
- **Sorcery banks +Power for the next spell if the unit has not moved**
  (`combatStats.pendingDrawRiderSpellPower`, consumed in `performSpellCast`).
- **Knowledge / Mysticism recall ANY spell, combat AND map.** In combat: the
  `RECALL_SPELL` reaction to `SPELL_CAST_STARTED` plus the attack-window instant recall.
  On the map every resolved map Spell offers a recall — BASIC takes it back FREE;
  **Knowledge's EXPERT side is no longer offered on the map** (its only rider is a
  combat-round limit bonus, so paying a crown was a trap), while **Mysticism** works there
  (`phaseLimit` gained `"map"`, still never a plain map PLAY) and its EXPERT side also
  returns every other discardable card played into that cast (`recallPlayedCardIds`).
  Wired in `offerMapSpellKnowledgeRecall` + `processPendingVisit`
  (`map-spell-cast.test.ts`, `knowledge-recall-instants.test.ts`). **Dimension Door
  offers the recall BEFORE the teleport** (its destination pick can open a FIGHT that
  would strand the reward), deferring the effect to a `map-spell-effect` reward. KNOWN
  DEAD TWIN: `playCard` keeps a second copy of this offer for a non-tiered map Spell
  (unreachable today, and it enumerates only the FIRST `RECALL_SPELL` card).
- **Map Power-tier spells cast then add Power** (View Air / View Earth / Dimension Door /
  Fly / Water Walk / Town Portal): a single **Cast**, then a `map-spell-boost` window
  offering the same Power sources combat uses — hand/Book discards enumerated one offer
  per printed "+Power" SIDE (`spellPowerSidesOfCard`), School-of-Magic expert, Basic X
  Magic expert (+3, which CONSUMES its source — permanent discarded or hand card played,
  announced in the label and the feed, per the USER RULING "if use expert, must discard,
  on hand or on permanent" — `basic-magic-expert.test.ts`), a matching **Tome**
  (`tome-max`), or "Resolve now". Printed side costs are honoured (removeSelf →
  `removed`, a mandatory cost-discard window) and the COST channel
  (`spellPowerValueOfCard`) collapses to the best HONEST side (never a removeSelf one);
  the choice carries `effectivePower` (Orb doubling shown, applied once at resolve). UI:
  `MapSpellBoostModal` renders as the combat REACTION TRAY with a live "next breakpoint"
  readout. Map casts share the non-combat spell LIFECYCLE (`noteMapSpellCast`,
  `src/engine/spell-lifecycle.ts`) but never touch the combat-round limit. The OFFER GATE
  hides a destination-gated Spell no reachable tier can afford. KNOWN LIMIT (both
  directions): that gate values a hand card through the flat cost channel, so Power living
  in a cost-bearing / removeSelf side is under-counted. Both Spell Books are pinned in
  `map-spell-book-parity.test.ts`. **Dimension Door is a WHO-travels window then a hex
  click** (USER REQUEST): a `dimension-door-hero` OPTION_CHOICE (one per own deployed Hero
  with a legal destination + "Cancel (no teleport)"), then the destination is picked by
  CLICKING A GLOWING HEX. Teleport legality is BYTE-IDENTICAL; Cancel NEVER refunds the
  Spell; the engine still fills `options` index-aligned with `destinations` for the AFK
  driver / AI / accessibility — do not drop that alignment
  (`map-spell-choice-board.test.tsx`, `computer/choice-policy.test.ts`).
- **Expert Power payment (crown) works for combat reactions too**: `costCardModes` flow
  through `PLAY_REACTION` / `PLAY_REACTIONS` → `applyReactionPlayCore` →
  `payOptionCardCost`, `canAffordCardCost` greedily assigns crowns on map AND combat, and
  the reaction cost pickers show a per-source Crown toggle
  (`lethal-save-sources.test.ts`, `overlays.test.tsx`).

## A hosted client hid every Neutral-deck FETCH · Tarnum VI on the map (2026-08-11)

BUG 1 (a whole CLASS): the "search the Neutral Unit deck for X" halves read `drawPile`
directly, but a HOSTED client's frame masks every draw pile to `HIDDEN_CARD_ID`, so the
client filtered the fetch out of its OWN offers. `neutralDeckHas` (adventure.ts) is now
masked-frame aware (a masked pile means UNKNOWN unless the copy is PROVABLY in a visible
army) and BOTH `legal-actions.ts` reads call it. **When a legality gate must read a
shared deck's CONTENTS, go through `neutralDeckHas` — a bare `drawPile.includes` is FALSE
on every hosted client.** BUG 2: `TARNUM_OVERLIMIT_SEARCH` had no `isMapPlayableEffect`
case, so Tarnum (Conflux) VI had no map play (on the map only its two Searches resolve).
`tarnum-specialties-audit.test.ts` (a family sweep of all 18 Tarnum cards plus the first
EFFECT test for Tarnum-Stronghold's Offense I/IV/VI).

## Reinforcement discounts unified: stacking Legion + banked Necromancy (2026-07-27) — what runs vs. limits

Legion vouchers, the Necromancy half-cost and the Hill Fort −3 are ONE additive pipeline
(`reinforceCostFor` / `legionVoucherDiscount` / `bankReinforcementDiscount` /
`redeemReinforcementDiscount`, `REDEEM_REINFORCEMENT_DISCOUNT`,
`addBankedReinforcementActions`): a half source halves the printed gold first, then every
flat discount is SUBTRACTED. The OLD "biggest single source wins, pay now" behaviour
survives behind the house rule `immediate-reinforcement-prompts` (**default OFF in BOTH
modes**). `legion-artifacts.test.ts`, `necromancy.test.ts`,
`map-tile-effects-audit.test.ts`.
LIMITS: unredeemed banks die the moment ANY of your heroes takes a step (so "play Legion,
then walk to the town" LOSES the voucher); playing Necromancy is now a commitment; the
toggle does NOT restore the Hill Fort's bank; `REDEEM_REINFORCEMENT_DISCOUNT` is
handler-validated and refuses combat AND off-turn.

## The Hill Fort opens its own reinforce window (2026-08-06) — what runs vs. limits

Reported: "Fort on the Hill didn't do anything." The engine was fine — the SURFACE was
invisible (one opaque bank option emitting NO event and wiped by any hero step).
`HILL_FORT` now always resolves through `resolveHillFort` and its legal-actions branch
builds one priced option per eligible bronze/silver Few card plus Skip; paying runs the
normal `reinforceArmyUnit` path with real feed events. PRICING is UNCHANGED
(`reinforceCostFor(…, flatGoldDiscount = 3)`, Legion vouchers folding on top).
`hill-fort-window.test.ts`.
LIMITS: the Hill Fort is now-or-never in EITHER reading of
`immediate-reinforcement-prompts`; it is a one-use `visitable` field, so only a CLEARED
cube re-opens it; a legacy `hill-fort` bank is still redeemable.

## Legion vouchers on NEUTRAL-Unit recruits (2026-08-03) — what runs vs. limits

Reported: "ALL Legion artifacts should give the option to reduce cost when recruiting
NEUTRAL units" — they never did. ONE pricing seam `neutralRecruitCost` (adventure.ts) =
the printed NEUTRAL cost minus a printed reduction, then `applyRecruitGoldDiscount`; every
such surface uses it for the gate, the LABEL and the spend, calling
`consumeRecruitVoucherFor` once the card joins the army (Elemental Conflux, Portal of
Summoning, Charlie and his Circus, the Den of Thieves and Mercenary Camp Events, Cyra's /
Oidana's Diplomacy). ONE menu seam: the auto-resolving `NEUTRAL_RECRUIT_MENU` visit step,
which also offers each HELD Legion piece inline (`USE_LEGION_RECRUIT_DISCOUNT` — discard,
bank for that unit, RE-OPEN the menu, so distinct pieces stack);
`bankRecruitDiscountVoucher` is the SINGLE writer (`legion-neutral-recruit.test.ts`).
LIMITS: the map Legion "pick a unit" prompt is deliberately UNCHANGED; a voucher is
reserved for ONE unit; the AI never spends a piece here; EXCLUDED and unchanged —
Pandora's half-cost recruits, the settlement-capture arm, the Necromancy / Hill Fort
banks and the Polish Stack offers.

## Map spell-power bank, map notice icons, teleport-guard bank fights & Rule 111 UI — what runs

An `ADD_SPELL_POWER` draw-rider played on the map banks its +Power onto
`player.mapSpellPowerBank` (the starting Power of the next map Power-tier cast, consumed
WHOLE), zero in combat, with a hero MOVE as its only expiry seam
(`map-spell-power-bank.test.ts`); the Polish "Cast a Spell" is NEVER a Power source (a
crash fix); a designer guard on a single-hex teleporter fights BANK-style
(`isTeleportObjectGuardLocation`: no Quick Combat, no XP, and — per the USER RULE —
`CombatContext.unlimitedRounds`, so no round limit and no MP-to-extend); map-visit notices
show reward CHIPS (`noticeRewardsFromEvents`); and the Rule 111 tray is a two-column
either/or over the existing `CHOOSE_OPTION` actions (`rule-111-choice-art.test.tsx`).

## Map UX & rules batch (2026-07) + audit fixes — what runs vs. limits

`TILE_ROTATION_SEAL_GATE_ENABLED = false` disables the rotation seal-off reject and the
doorway gate (yellow arcs still seal MOVEMENT); spell searches take only the face-up TOP
discard (the "take ANY acquirable discarded spell" invention was REVERTED per explicit
user demand, with the legacy `spell-discard-top` path KEPT so an in-flight choice resolves
but never CREATED); the SPLIT-deck spells search is a ONE-STEP up-front decision (USER
DEMAND: `deckPick.upFront` + `discardTops` + `fetchSchools` before any card is revealed —
`basic-magic-fetch.test.ts`); the deck-search menu is HONEST about a standing Scouting
override (`searchCountOverrideLabel` mirrors `applySearchCountEffects` without consuming
it); manual guard control is FREE play; two-way exit modes ride Gates AND Monoliths
(`two-way-exit-modes.test.ts`); and the Far pool never carries an Obelisk tile. AUDIT: the
`map-spell-boost` / `visions-boost` / `fortune-boost` labels name PRIVATE hand cards and
are masked for non-owners.

## Map settings defaults (designer → lobby, seed-at-pick) — what runs vs. limits

Three OPTIONAL defaults on `CustomMapPreset` that SEED the lobby when the map is picked —
`difficulty`, `farTileOpening`, `farTilesPerPlayer` (0–6) — each hoisting 1:1 onto the
same-named `GameSetupOptions` field through the EXISTING machinery
(`PresetForcedOptionKey` / `applyCustomMapPresetToOptions` /
`revertCustomMapPresetOptions` / `sanitizeCustomMapPreset` + the build-time apply-once
`explicit` skip set), with two new rows in `map-preset-editor.tsx`
(`custom-setup.test.ts`, `map-preset-editor.test.tsx`).
LIMITS: these are SOFT defaults — a host's later `SET_GAME_OPTIONS` edit WINS (victory
mode / VP / round limit stay MAP-AUTHORITATIVE); `preset.roundLimit` ends the game ONLY
with Victory Points enabled; additional-tile TYPES are not configurable.

## Map designer upgrade (designed gates/borders/locks/obelisks/objects/Ⅶ/VP) — what runs vs. limits

Seven map-only features on `CustomMapPreset` / `CustomMapTilePlan`, applied at map pick;
UI in `map-designer.tsx` / `map-preset-editor.tsx`. One line each:
1. **Designed gate links** (`plan.gateLinks`, cap `MAX_DESIGNED_GATE_LINKS` 24): both
   halves carve at the DESIGNED hexes with no pick-on-reveal
   (`designed-gate-links.test.ts`).
2. **Yellow borders PER EDGE, ON by default** (`DESIGNER_BORDER_SEALING_ENABLED = true`;
   `plan.borderEdges` codes `footprintIndex*6 + absoluteDirection`): each edge seals
   movement / discovery / placement / AI except Expert Pathfinding, stored ABSOLUTE so it
   survives rotation (`designed-borders.test.ts`).
3. **Fixed starting-tile orientation** (`lockRotation` + `rotation`)
   — `start-tile-rotation.test.ts`.
4. **Obelisk roles** (`preset.obelisks`): `monolith` / `bonus` / `victory-only`
   (`obelisk-roles.test.ts`).
5. **One-hex objects** (`preset.objects`): standalone Monoliths, 4 colored Teleport-Gate
   networks, one-way halves, the three outposts and a PINNED Creature Bank (always
   border-free — `creature-bank-objects.test.ts`).
6. **Ⅶ-field designation** (`viiField`): forces the difficulty-7 objective whatever tile
   lands there, BLOCKING the start on a victory-vs-design conflict; an UNPINNED grail /
   utopia slot now also draws a tile that PRINTS it (`designationCenterTile`) so art and
   field agree (`vii-field-designation.test.ts`).
7. **Victory Points** (`preset.victoryPoints`): a round-limit OR victory-completion
   trigger scoring the rulebook table from an event-sourced ledger, also switchable from
   the lobby via `applyLobbyVictoryPoints` (`victory-points.test.ts`).
LIMITS: standalone Whirlpools are REFUSED (on-tile only); the AI routes through teleport
networks but not face-down landings; Obelisk role is MAP-WIDE; a Ⅶ override drops the
printed field's trappings; VP with a conquest victory and no round limit ends only by
last-faction-standing (scored immediately); there is no "dig the Grail" VP objective.

### Custom win conditions (map-designer + lobby, additional early-end trigger)

`CustomMapPreset.customWinConditions` / `GameSetupOptions.customWinConditions`: the FIRST
live player in `turnOrder` to satisfy ANY active condition WINS IMMEDIATELY — an
ADDITIONAL early-end trigger layered on the normal victory mode, checked by
`checkCustomWinConditions` (adventure.ts) from the reducer's post-action tail. Nine kinds
with clamped params (`control-towns` 2–8, `flag-mines` 2–12, `hero-level` 2–7, `gold`
20–500, `artifacts` 1–10, `buildings` 8–15, `obelisks` 1–4, `defeat-heroes` 1–6,
`defeat-dragon-utopia`); the metrics ARE the Victory-Points readers — never duplicate a
metric. Lobby is ADD-only, UNION at build (`mergeCustomWinConditions`, cap 4).
`custom-win-conditions.test.ts`.
LIMITS: the check SKIPS while a combat is open (the game never ends mid-battle);
`obelisks` only accrues in GRAIL victory mode; conditions are PUBLIC; a condition already
met at setup is an instant-win foot-gun the min-clamps only reduce.

## Map designer 2026-07b: landmark bans, Pack guards, Random Settlement Ⅶ, hold-with-Grail (+ audit) — what runs vs. limits

Three merged branches: face-down landmark BANS (best-effort at setup with the
`MAP_SECRET_FEATURE_FALLBACK` note; rejected on a face-up plan), "One of these tiles"
working FACE-DOWN as a secret (the only way to put an Obelisk on a Ⅱ–Ⅲ slot, since the
random Far pool strips them), Pack guards (`+ Pack I–III` only — no azure Pack exists, and
an un-mintable Pack slot falls back to a same-tier NEUTRAL), `customGuardLevel` stamped
for EVERY designer level guard, Random Settlement Ⅶ, control VP rows and hold-with-Grail
progress (`adventure.holdWithGrailProgress`, one shared read `playerPossessesGrail` in
`victory-points.ts` — never re-implement it). `tile-exclude-and-level-packs.test.ts`,
`random-settlement-hold-grail.test.ts`.
LIMITS: a faction-locked NAMED pack of the wrong faction CONVERTS to a same-tier Pack in
the locked faction; a designer guard WINS, so a level guard on a Random Town draws a level
army instead of the rolled-faction party; at most ONE seat holds a hold-with-Grail counter
and a lapsed round DELETES it.

## Ⅱ–Ⅲ placement counts PHYSICAL touch at freeform seams (2026-08-03)

On a saved designer map no Ⅱ–Ⅲ tile could ever be placed: the designer drops tiles freely,
so they touch at NON-interlocking offsets while `canPlaceTileAt` counted touching with
`tileCentersAdjacent`. FIX (`canPlaceTileAt` + `farTilePlacementCenters`, candidates from
`tileTouchNeighbors` — all 18 distance-3 offsets): touch is `tileFootprintsTouch`, and a
slot that does NOT interlock with two tiles is legal ONLY where the touched tiles span two
different sublattice colours (`far-tile-freeform-touch.test.ts`).
LIMITS: a notch between two SAME-colour tiles keeps the strict interlock demand, and the
built-in scenario layouts have ZERO freeform touch pairs, so standard games are unchanged.

## Ⅱ–Ⅲ hand-tile TYPE choice (OPTIONAL, lobby + map preset, default OFF) — 2026-08-08

`GameSetupOptions.farTileTypeChoice` (default OFF ⇒ byte-identical) +
`CustomMapPreset.farTileTypeChoice` / `farTileTypeChoices` (a designer soft default that
may RESTRICT the kind list): placing a HELD Ⅱ–Ⅲ supply tile opens a TYPE menu (gold /
stone / crystal mine, settlement, "No preference") and the engine draws a seeded-random
pool tile OF that kind. Vocabulary + classification live in ONE leaf
`src/engine/far-tile-types.ts`, riding the existing `pendingFarTileFlip` machine as
`offerMode: "type-choice"`; protocol v22 (`far-tile-type-choice.test.ts`).
LIMITS: the menu leaks pool AVAILABILITY to the table; it composes with, never replaces,
`far-tile-rerolls`; supply-path only; no new AI policy.

## Far-tile rerolls and single-player AI (2026-07-31)

Ⅱ–Ⅲ tile replacement is ONE BINH house rule, `far-tile-rerolls`, covering both the
Ore/material-tile replacement and the Settlement-plan replacement (Official/Legacy keep the
drawn tile). Do NOT reintroduce a separate setup or map-preset switch. Also: Event AI
decisions use public value/cost information; a defending computer PREPARES before resolving
PvP prep; and "gold development" means recruiting an actual Gold unit — non-Gold spending
is suppressed until it is recruited, with the seeded premium-rush benchmarks asserting real
`UNIT_RECRUITED` events.

## Polish Set Artifacts (OPTIONAL house rule, default OFF) — engine + UI (2026-08-07)

Eleven Artifact SETS. A player's PIECE COUNT is how many DISTINCT member cards they still
own; at 2 pieces the set's first listed effect switches on, at 3 the first two, and so on —
cumulative and simultaneous, never a choice. House rule `polish-set-artifacts` (category
`polish`, **default OFF in BOTH modes**). Data `src/data/cards/artifact-sets.ts`, read
layer `src/engine/artifact-sets.ts` (a LEAF module), wiring in `adventure.ts` (income +
recruit discount), `legal-actions.ts` (offers, the attack-window pop-up, roll mode, spell
power), `reducer.ts` (the two handlers, the spell-damage fold, the drain lock, the tier
sync), `adventure-reducer.ts` and `player-view.ts`. Protocol v21, then v26 for the pop-up
ruling — `npm run deploy:partykit` owed. Pinned in `artifact-sets.test.ts`. The contract
every surface reads: `PlayerState.artifactSetStatus` (public: `pieces` / `activeTiers` /
`memberCount`), three feed events, and every activation as an ordinary `getLegalActions`
offer.

Leading with what does NOT run / the deliberate readings:
- **No set member is missing** (`SET_ARTIFACT_MEMBERS_NOT_IN_GAME` is EMPTY, kept so a
  future memberless entry is conscious). **"Whole Deck" = deck + hand + discard + IN-PLAY
  permanents + the Ongoing tray** (a REMOVED card never counts; only DISTINCT members).
- **The set status is PUBLIC — a designed leak** per the user's "to be seen all the time
  for every player"; it rides REAL state because a hosted client could never recompute it,
  and `redactStateForSeat` deliberately does NOT strip it.
- **No set tier ever opens an engine WINDOW.** Every activation is an OPTIONAL
  handler-validated action (`SELECT_ARTIFACT_SET_UNIT` / `USE_ARTIFACT_SET_POWER`); the
  only pendingChoice is the Diplomat's Cloak scry, answered by the ordinary
  `CHOOSE_OPTION` path, so no AI / AFK lockstep change was needed.
- **"At the beginning of the combat" means BEFORE THE FIGHTING BEGINS** (2026-08-10):
  `combat.round === 1` was the WHOLE battle here, so it is now `combatStartWindowOpen`
  (`src/engine/combat-timing.ts`: round 1, no outcome, NO unit has activated / moved /
  attacked — the same `combatFightingHasBegun` read `pvpEscapeWindowOpen` uses). The timing
  is DECLARED IN THE DATA (`ArtifactSetTier.timing = "combat-start"` on Angelic Alliance 2,
  Ironfist 2, Armor of the Damned 2, pinned against the printed text both ways), and
  `legal-actions.ts` surfaces ONLY those tiers in the guards' pre-activation pause so they
  stay reachable. KNOWN LIMIT: in a PvP fight with a faster opponent and no pause the
  window can close before that side clicks.
- **"Rolls 2 dice and resolves the higher RESULT" is ONE roll, offered as a POP-UP**
  (2026-08-11 USER RULING: "This feature should work only once — it is an instant, so work
  as pop up window"). It is now an INSTANT offered inside the open `UNIT_ATTACK_DECLARED`
  window of the unit ABOUT TO ROLL, riding the parked stack item
  (`ResolutionStackItemModifiers.artifactSetAttackAdvantage`) re-asserted in
  `getAttackStackDetails` AFTER the declaration-time `rollMode` and BEFORE the two FORCED
  disadvantages; `timing: "attack-window"` is likewise DECLARED IN THE DATA. SCOPE: TWO
  tiers print the line — Angelic Alliance 3 (bound to its tier-2 pick) and Power of the
  Dragon Father 2 (any own unit); Armor of the Damned's LOWER-result mirror is untouched. A
  RETALIATION Attack qualifies; an unspent charge OPENS the window (otherwise it is
  unreachable in a neutral fight); its surface is the instant TRAY, never the dock. KNOWN
  LIMIT: a holder of BOTH sets is offered both instants on one roll and the second burns
  its charge for nothing.
- Power of the Dragon Father prints NO selection tier (targets picked at USE time); "During
  an attack the selected enemy unit …" (Armor of the Damned 3 & 4) is read as a
  CURRENT-COMBAT-ROUND debuff; Pendant of Reflection is AUTO-applied (locked onto the cast's
  stack item in `makeStackItem`, floored at `spellMinUsefulPower`); Titan's Thunder's zap is
  SPELL damage through `reducedSpellDamage` (so a ward can cancel it, and its bronze/silver
  tiers cannot reach a TIERLESS bank guard or commander); Statue of Legion is ONE flat
  once-per-GAME-ROUND gold discount at `totalRecruitGoldDiscount` that STACKS with Legion
  vouchers; Cornucopia pays on the RESOURCE round while Golden Goose pays on EVERY round;
  **the AI never seeks a set**; the Diplomat's Cloak scry never lifts a card off the deck;
  `ATTACK_ROLL_ADVANTAGE` is a NEW ActiveEffectModifier read at `getAttackRollMode` after
  the FORCED disadvantages and before the ranged penalty; **default OFF ⇒ byte-identical**.

What runs, set by set: **Angelic Alliance** (6) — 2 select an own unit → +1 Initiative; 3
the POP-UP one-roll advantage; 4 a Defense token; 5 +1 Attack; 6 +1 Defense (3–6 bound to
the tier-2 pick, each once per combat). **Power of the Dragon Father** (7) — 2 the same
pop-up; 3 Defense token; 4 all your units take 1 less Spell damage; 5 +1 Attack; 6 +1
Defense; 7 a SECOND stacking −1 Spell damage. **Titan's Thunder** (4) — 2/3/4 once per
combat, 1 Spell damage to an enemy of at most bronze / silver / any tier. **Ironfist of the
Ogre** (3) — 2 +2 Initiative; 3 a 1-damage Fire Shield for the round. **Armor of the
Damned** (4) — 2 select an ENEMY → −1 Initiative; 3 it rolls with disadvantage this round;
4 it attacks at −1. **Pendant of Reflection** (2) — the first enemy Spell each combat
resolves at −1 Power. **Wizard's Well** (2) — once per round, draw 1 then discard 1.
**Diplomat's Cloak** (2) — once per round, look at a Neutral deck's top card and leave it or
send it to the bottom. **Cornucopia** (3) — +2 materials each Resource round, +1 valuable at
3. **Statue of Legion** (5) — a once-per-round −1/−2/−3/−4 gold recruit or reinforce
discount. **Golden Goose** (3) — +2 gold every round, +4 at 3 pieces.

### The ART + UI half (2026-08-07, the follow-up commit)

- **ART**: 11 set CARD faces at `public/assets/set-artifacts/cards/<setId>.webp` (743×1040,
  `fit: contain`) and 11 ICONS at `…/icons/<setId>.webp` (256×256), both paths DERIVED from
  the set id (`artifactSetCardImage` / `artifactSetIconImage`) so a file and its set cannot
  drift; rebuild with `node scripts/build-set-artifact-art.mjs --src <drop>` (the masters
  are not committed; its `SOURCES` table records which raw file became which set).
  `set-artifact-images.test.ts`.
- **Set status display**: `ArtifactSetPanel` shows every seat's ACTIVE sets (pieces ≥ 2) as
  the set card face with an `N/M` badge beside the Ongoing/Permanent tray on BOTH table
  screens, zooming to a ✔/✖ line per tier; it re-derives nothing.
- **Set icons on member cards**: `CardFrame` adds the corner badge only when the card is a
  member AND the rule is on, via `ArtifactSetIconsProvider` (default false), so with no
  provider it returns the bare `<img>` byte-identically. Two shared helpers do all of it —
  `CardSetFrame` (a face in normal flow) and `CardSetCornerBadge` (a positioned tile whose
  face FILLS it) — never per-surface markup.
- **Action surfaces**: the two MAP tiers render in `HeroActionsDock`, the scry falls through
  to the generic `PromptTray`, and the COMBAT tiers go through the **set-powers window**
  (2026-08-08, the "too many boxes" report): `artifactSetPowerGroups` groups offers by POWER
  (skipping `timing: "attack-window"` tiers, whose only surface is the reaction tray), one
  `Set powers (N)` button opens a portalled window, and a power with several targets ARMS
  the board — the armed value is only the group KEY, so the board always dispatches the
  offer the engine is making now (`ArtifactSetArmingProvider`).
- **Edge rails on the combat card**: `.boardCardStatTokens` (signed chips per changed stat)
  and `.boardCardEffectIcons` (the Defense-token disc from ANY source, one owning-set icon
  per live effect via the presentation-only `ActiveEffectDefinition.artifactSetId`, and a
  generic two-dice glyph for a NON-set roll effect) — `unit-effect-icons.test.tsx`.
LIMITS: jsdom cannot compute CSS, so nothing proves a pixel and there is no e2e; the panel
shows ACTIVE sets only; nothing new is added to the AI; the badge rides EVERY member card
face everywhere, and a card whose scan is MISSING wears none; `fx.tsx`'s card-FLIGHT face is
built outside React and is unbadged BY DESIGN; a PLAYER-scoped set passive gets no unit
icon; the effect rails are `pointer-events: none`, so their `title` tooltips never fire.
`artifact-set-ui.test.tsx`, `artifact-set-card-surfaces.test.tsx`,
`src/app/page-artifact-sets.test.tsx`.

### A HOSTED client under-counted its own pieces (2026-08-08 bugfix)

On a HOSTED table even the VIEWER'S OWN `deck` is `HIDDEN_CARD_ID` placeholders, so
`artifactSetPieceCount` (which derives from card ZONES) read 2 for a 6-piece holder and the
browser offered no buttons while the server offered all four tiers. FIX: when an owned zone
contains `HIDDEN_CARD_ID` the count takes `player.artifactSetStatus` when it is HIGHER than
the visible zones prove (`max`, not `??`, capped at the member count); `HIDDEN_CARD_ID`
moved to `state.ts` so `artifact-sets.ts` stays a leaf (`artifact-sets.test.ts`,
`page-artifact-sets.test.tsx`).
LIMITS: an UNMASKED read is byte-identical; the same fix covers the MAP tiers; the round-1
window remains a real trap. WHY THE OLD TESTS WERE GREEN: they read offers off the FULL
server state, never a redacted seat frame.

### The badge on EVERY card-face surface (2026-08-08 bugfix)

The badge was drawn by only `CardFrame` and the zoom reader, so every surface painting a
card face with a RAW `<img>` showed a member bare. Fixed by routing them all through the ONE
shared `CardSetFrame` / `CardSetCornerBadge` pair — never per-surface markup. Fixed surfaces
(all `screen.tsx`): the shared Artifact deck's discard top, the player's own discard top,
the pile browser, the market's sell-from-hand tiles, the Pandora card row + kept strip, the
visit-reward / discard-pick tiles (`VisitRewardArt` gained an optional `cardId`, set only
where the art really IS a card face), the Shady Auction lot and the face-up event pool
(`artifact-set-card-surfaces.test.tsx`).
NOT badged by design: `fx.tsx`'s card-flight face, `CardFrame`'s art-less fallbacks, the set
PANEL's own card art, and surfaces a core Artifact can never reach.

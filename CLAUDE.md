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

Most items this list previously named (the Tower hold-outs) have since been
wired and are covered by a test that fails if the logic is removed:
- `tower.genies` few & pack — "discard from deck, take a Spell" → `genie-spell-draw-few`
  / `genie-spell-draw-pack` (`DECK_DISCARD_TAKE_SPELL`); see
  `src/engine/expansion-creature-abilities.test.ts` ("Genie Wish").
- `tower.magi` pack — "+1 Power to the first spell you cast this round" →
  `magi-power-boost`; see `src/engine/decorative-faction-abilities.test.ts`.
- `tower.gargoyles` / `tower.titans` — the ongoing-effect immunity →
  `gargoyle-spell-ward` / `titan-ignore-ongoing`; see
  `src/engine/expansion-creature-abilities.test.ts` ("Gargoyle / Titan
  ongoing-effect immunity").
- `tower.iron_golems` — spell-damage reduction → `reduce-spell-damage-1` /
  `reduce-spell-damage-2`; see `src/engine/decorative-faction-abilities.test.ts`.
- Solmyr I/IV/VI, Cyra IV/VI, Torosar I/IV/VI — now implemented;
  `src/engine/hero-specialty-levels.test.ts` asserts "has no remaining
  not-implemented hero specialty" and `src/engine/tower-hero-specialties.test.ts`
  exercises each. (`PENDING_TOWER_SPECIALTIES` no longer exists.)

Conflux — now fully engine-wired (no display-only unit clauses left):
- `conflux.{storm,ice,energy,magma}_elementals` (Few & Pack) — the FACTION
  (recruitable) elementals do NOT carry the Magic-Arrow/school immunity or the
  "deals elemental damage" trait: per the verbatim 3-column wiki card those
  belong to the separate NEUTRAL guard (`neutral.*_elementals`) column ALONE.
  The faction Few has no abilities; the faction Pack has ONLY its "[activation]
  +1 Power to the first <School> spell" rider. The earlier wiring (which copied
  the neutral guard's `elemental-damage` + `<school>-elemental-immunity` onto the
  faction Few/Pack) was a transcription fabrication and has been removed —
  enforced in `conflux-content.test.ts` (faction Few = [], Pack = activation only;
  the neutral guard keeps the passives as the control).
- `conflux.magic_elementals` (Few & Pack) — "Attack all adjacent [enemy] units"
  is now wired via the generic `SECOND_ATTACK_ALL_ADJACENT_TO_SELF` multi-attack
  queue: a full separate follow-up attack at the unit's OWN (buffable) Attack
  against every other adjacent unit — the Few hits friend AND foe
  (`magic-elemental-attack-all`, `includeAllies`), the Pack enemies only
  (`magic-elemental-attack-all-enemies`). The Pack's "Ignore any Spell effects"
  is the shared full spell immunity (`immune-all-spells`, which also covers Magic
  Arrows) and "damage from Specialty" is `immune-specialty-damage` (the Azure
  Dragon combo). Per the verbatim wiki card the faction Magic Elementals carry NO
  "deals elemental damage" line on EITHER side and no separate Magic-Arrow line —
  the earlier `elemental-damage` + Magic-Arrow-only wiring was a fabrication and
  has been removed. Engine-enforced in `conflux-content.test.ts` ("Conflux Magic
  Elementals abilities", with the Few/Pack divergence as the mutation control).
- Erdamon is the **Magma Elementals** specialist (wiki: "The effect doubles for
  the Magma Elementals unit"), NOT an all-Elementals generalist — the earlier
  all-Elementals doubling on I/IV was a deviation and has been corrected to match
  the card (`conflux-content.test.ts`, with the other Elementals as the control).
- Conflux heroes now shipped: the three unit-specialist Planeswalkers (Erdamon,
  Monere, Pasis) AND **Luna** the Fire Wall Elementalist — I/VI place the shared
  `fire_wall` battlefield token at a FIXED 1/3 damage (`PLACE_FIRE_WALL_FIXED`),
  IV is the spell-economy choice (map discard recall OR a +2-Power spell-cast
  reaction). All I/IV/VI implemented + tested (`conflux-content.test.ts`). Conflux
  PC portraits (incl. Luna and Tarnum) are now downloaded to `/public/assets`.
- **Ciele** (Magic Arrow Elementalist) is now shipped — Magic Arrow is a
  STARTING_ONLY spell, so a cast copy lands in the player's OWN discard pile, NOT
  the shared Spell deck; both I and IV read that own discard (the earlier
  shared-Spell-deck wiring meant neither could ever find the arrow in real play).
  I is an `<instant>` recall of a Magic Arrow from your discard to hand, playable
  on the map AND in combat (`TAKE_FROM_DISCARD` filtered to Magic Arrow,
  `allowInCombat`). IV casts a Magic Arrow from your OWN discard for FREE over the
  limit (the `CAST_FROM_SPELL_DISCARD` pipeline with `ownDiscard`, `spellId`-
  filtered — the arrow stays in your discard, the specialty cycles to discard).
  VI deals 2 damage; each with a +Power reaction alternative. The tests seed the
  PLAYER's own discard and keep a CONTROL proving a Magic Arrow in the shared
  Spell-deck discard is NOT castable. See `conflux-ciele-specialty.test.ts`.
- **Tarnum (Conflux)** (Enchanters Elementalist) is now shipped — all I/IV/VI
  engine-wired and covered by `conflux-tarnum-specialty.test.ts` (each level fails
  if its wiring is removed):
  - I — `Search(1) Spell` with the new `CARD_DECK_SEARCH.allowRemove` flag: the
    revealed Spell can be KEPT into hand OR REMOVED from the game (the deck-search
    pipeline now carries `allowRemove` through `openSharedDeckSearch` /
    `revealSharedDeckSearch` / the DECK_SEARCH choice and offers a "Remove …"
    pick). The control proves a normal Search offers no Remove.
  - IV — `CONVERT_ARMY_UNIT` extended with a `goldCost` and an optional from-unit:
    "Pay 10 gold → the unique neutral Enchanters card" (or draw). Gated on gold
    and the `unique` one-Enchanters limit.
  - VI — the over-limit multi-cast subsystem (`TARNUM_OVERLIMIT_SEARCH`): an
    **Instant** playable on your turn, off-turn in the instant window, OR as a
    reaction inside an open attack window. It opens a per-search deck choice
    (`TARNUM_SEARCH` pendingChoice): twice, the caster picks ONE Spell deck —
    basic or expert — to Search 1 card from. Each taken card is flagged
    (`combatStats.tarnumOverlimitCards`) for a FREE cast over the per-round limit
    (never bumps `spellsCastThisRound`; forgery-validated in `castSpell` AND
    `applyReactionPlayCore`), returning to the shared Spell deck top OR discard —
    the caster's choice via `CAST_SPELL.tarnumReturn` / `PLAY_REACTION.tarnumReturn`
    — instead of the caster's own discard. A flagged spell casts only when "their
    type allows it" in the open window: a combat spell (Fireball) during your own
    activation, a trigger-free instant anytime (both via `addSpellActions`), and an
    attack/defense-changing reaction instant (Bless, Curse, Bloodlust…) in the
    reaction/instant window via a dedicated free over-limit pass in
    `getLegalReactionsForTrigger`. Used AS a reaction in an attack window, playing
    VI runs the Search inside the still-open window and then re-derives its offers
    (`refreshReactionWindowLegalReactions`) so a just-Searched applicable instant
    can be cast into the SAME window; a Searched spell that does not fit just stays
    in hand. The flag clears at combat start and each combat round. All covered in
    `conflux-tarnum-specialty.test.ts` (per-search choice, both/same deck, the
    on-turn vs off-turn split, the reaction-window cast with a graded CONTROL that
    the flag is what lifts the limit, AND the in-window search-and-cast flow).

Factory (expansion) — unit Few/Pack card art is now the REAL board-game scans
(was fake PC-portrait placeholders); the abilities are being wired off those scans
(read the card, not a wiki). WIRED + engine-enforced (a test in
`factory-unit-abilities.test.ts` / `factory-combat.test.ts` fails if removed;
`factory-content.test.ts` pins which sides carry which id):
- Halflings — Few/Pack `attack-roll-advantage`; Pack also `halfling-precise-shot`
  (a "+1" roll drops a Corrosion token, -1 Defense). The "resolve the higher"
  advantage OVERRIDES the ranged Combat penalty (adjacent / backline-to-backline):
  the Factory Halfling has no "Ignore combat penalties" waiver (unlike the neutral
  core Halfling), so under a penalty it still rolls two dice and keeps the HIGHER,
  not the penalty's lower — the `ATTACK_ROLL_ADVANTAGE` branch resolves before the
  penalty in `getAttackRollMode`. Enforced (with plain-ranged-unit CONTROLs) in
  `factory-unit-abilities.test.ts` ("advantage overrides the ranged Combat
  penalty"). The Shaman's Puppet forced-disadvantage still beats advantage.
- Mechanics — all sides `mechanics-line-attack-1/2` ("Attack 2 spaces in a line",
  SECOND_ATTACK_BEHIND_TARGET); Few/Pack also `mechanics-repair-1/2` (repair an
  adjacent mechanical unit — Automatons/Dreadnoughts — the Pack falling back to
  +1 Attack). The Neutral guard has only the reach.
- Armadillos — Pack `armadillo-initiative-amplify` (AMPLIFY_INITIATIVE_INCREASE:
  any positive Initiative increase gets +1 more). Few/Neutral have no printed
  ability (genuinely `[]`, not a stub).
- Automatons — Pack `ignores-retaliation`; Neutral `automaton-detonate-1`.
- Sandworms — Neutral `sandworm-strike-again` (attack an adjacent target again).
- Bounty Hunters — Few/Pack `bounty-hunter-mark-1/2` (Mark the strongest enemy at
  combat start; +1/+2 Attack vs Marked units). Mark target selection is
  auto-resolved (deterministic), not a player prompt.

The former "STILL display-only" Factory hold-outs have since ALL been wired
(pinned in `factory-content.test.ts` "every former Factory display-only stub is
now an implemented, engine-wired ability", behaviour + CONTROLs in
`factory-gold-abilities.test.ts`):
- Automaton Few — cube-scaled Detonate → `automaton-place-cube` +
  `automaton-detonate-cubes` (faction-cube subsystem).
- Sandworm Pack — cube-fuelled extra attack → `sandworm-cube-gain` +
  `sandworm-cube-attack`.
- Bounty Hunter Neutral — pre-emptive + ranged retaliation →
  `bounty-hunter-preemptive` (`PREEMPTIVE_RETALIATION`).
- Couatl Few/Pack — activated invulnerability until next activation →
  `couatl-invulnerability-few` (ends the turn) / `-pack` (free); Couatl Neutral
  genuinely has no printed ability.
- Dreadnought Few/Pack/Neutral — splash allocation instead of attacking →
  `dreadnought-splash-1` (1/1, up to 2 units) / `dreadnought-splash-2` (2/1/1,
  up to 3).
No Factory unit side is display-only anymore.
Factory buildings use the real thelazy.net PC building art and are wired to their
shared archetype effects (`factory-content.test.ts` "ships the 7 board-game
buildings…"); the PC-only special buildings (Mana Generator spell-points, Grail
Lightning Rod, Pen horde) are NOT modeled as distinct effects.

This section is maintained by hand, but the rule #3 enforcement test now
exists (`src/data/factions/ability-text-enforcement.test.ts`): the machine
truth is `DISPLAY_ONLY_ABILITIES` (currently EMPTY — no unit side is
display-only) plus `ENGINE_RULE_WIRED_ABILITY_TEXT` (currently exactly
`neutral.skeletons#neutral`, whose Necropolis-reinforce text runs as a
dedicated rule, not an ability tag). Re-verify any prose claim here against
those registries and `src/data/factions/units.ts` before trusting it. The
Creature Bank system tracks its own display-only items in the section below.

## Morale Cards (Battlefield expansion, OPTIONAL rule) — what runs vs. printed nuances

Lobby option `GameSetupOptions.moraleCards` (default OFF). With it on, every
morale gain/loss draws from two shuffled decks instead of using the ±1 token
(regular-game rules from the expansion rulebook: DRAW 1, not the expansion
modes' Search (2)). Data in `src/data/cards/morale.ts` (crops from the provided
contact sheet); engine in `src/engine/morale-cards.ts` plus wiring in
`reducer.ts` / `adventure-reducer.ts` / `adventure.ts` / `legal-actions.ts`.
Behaviour is pinned in `src/engine/morale-card-effects.test.ts` (observable
outcomes with CONTROLs) and `morale-cards.test.ts` (gain flow).

Leading with what does NOT run:
- **`morale.positive.replace_adventure_card` and `morale.negative.put_token`
  are never in play.** Both print the expansion's Battlefield Symbol, and the
  rulebook removes/ignores such cards in regular games ("Adventure cards" and
  the unit-borne morale marker exist only in its Adventure/Skirmish modes).
  They are excluded from the shuffled decks via
  `BATTLEFIELD_ONLY_MORALE_CARD_IDS` (definitions stay, `not-implemented`, with
  the exclusion pinned in `morale-card-effects.test.ts`). The regular decks are
  therefore 9 positive / 8 negative.
- **"Combat Power" clauses are inert in regular games** (the roll exists only
  in the expansion's Adventure mode): `combat_bonus` offers only its +1 Attack /
  +1 Defense picks, and `next_roll_minus_one` can only come first on an Attack
  or Defense (Defend-die) roll. Both documented at the definitions.
- **`morale.positive.remove_token` is a documented engine reading**: the
  printed marker is Battlefield-mode-only, so in regular games it removes one
  NEGATIVE combat token (Weakness/Corrosion/Paralysis) from an own unit.
- Deck exhaustion with every card face-up is a silent no-op gain (rare:
  positive is capped at 2/player; the rulebook's fall-back-to-tokens is NOT
  modeled). Map-side attack-die rolls (Scholar) deliberately don't trigger
  `reroll_plus_one`; the Leprechaun event pool roll deliberately doesn't
  trigger `roll_one_less` (the event, not the player, rolls it).

Rulebook flow (all engine-enforced): positive gain cancels a held Negative
card first, else draws; **negative gain is absorbed by discarding a held
Positive card first** (oldest, deterministic), else draws face-up; a resolved/
cancelled/absorbed card always returns to the BOTTOM of its deck (no morale
discard zone — the legacy discardPile only reshuffles in for old snapshots);
held cards are public (face-up beside the hero) so player views never mask
them; positive cards cap at 2 (discard-down choice). Negative cards resolve
automatically the first time their printed situation occurs; only
`skip_activation` keeps re-rolling (one Attack die before each of the holder's
activations, -1 skips) until it actually skips, exactly as printed.

Wiring map (positive): `combat_draw` at combat start; `reroll_die` a reroll
source; `set_attack_die_plus` a SET source in the same window (never spent by
a plain reroll — `AttackRerollSource.setDieFace`, `REROLL_PENDING_CHOICE
.useSetDie`). `reroll_die` is ALSO offered on the holder's own MAP dice —
the Resource/Treasure result windows plus the Scholar and Sea Chest/Jetsam
Attack-die branch rolls (`moraleRerollCardOption` in adventure.ts, resolved
via the `CONSUME_MORALE_CARD` visit step) — standing in for the ±1 token's
"Reroll any Die you have thrown" while the rule is on; the Obelisk die (its
face locks once for every visitor) and the specific-face gambles (Satyr,
Leprechaun pool) stay out, and BOTH set-die cards stay combat/ability-roll
scoped ("best/worst face" is undefined for a map branch table). Pinned in
`morale-card-effects.test.ts` ("Reroll a Die (map dice)", with straight-
through CONTROLs). Both — plus the generic "Reroll a die" artifacts (Cards of
Prophecy, Diplomat's Ring, Ambassador's Sash) and the positive morale token —
are ALSO offered on an ABILITY's own roll (Death Stare, the Thunderbird/
Wyvern extra die, extra-die Paralysis, the Ghost Dragon knock-back) via the
ability-roll reroll window: the same `ATTACK_DIE_REROLL` pending choice with
an `abilityRoll` context. A reroll re-throws ALL that ability's dice
(whole-roll, like Bron's), the set-die flips the die that most helps the
ability's SUCCESS WINDOW (a Death Stare wants "-1"s, not high faces), and the
kept roll resumes the post-attack follow-up tail exactly where it paused
(`runPostAttackFollowUps` step table — its order is serialized in the choice,
keep it stable). Attack-roll-specific pools (unit reroll abilities, the Ammo
Cart, Luck/Fortune/Mirth effects) deliberately stay OFF ability rolls; rolls
that fire mid-resolution (the Dwarven resistance die, the defensive soak, the
Medusa retaliation gaze, the skip-activation check) cannot pause so they get
no window. All pinned in `ability-dice-events.test.ts`.
`redraw_hand` via `SPEND_MORALE redraw`; `combat_bonus` /
`remove_token` via `SPEND_MORALE combat-bonus / remove-token` during the
holder's own combat (offers in `addMoraleActions`, buttons in the hand panel).
`combat_bonus` (the +1 Attack / +1 Defense combat-long buff) is ALSO offered as
an instant-window reaction inside an open attack window (`getLegalReactionsForTrigger`
on `UNIT_ATTACK_DECLARED`; the +Attack pick is withheld only on the player's own
Misfortune-locked attack), so a defender can add +1 Defense in response to an
incoming hit; the window refreshes after the spend (`refreshReactionWindowLegalReactions`
in the `SPEND_MORALE` dispatch) so the used card drops out — pinned in
`morale-card-effects.test.ts` ("is playable as an INSTANT-WINDOW REACTION");
`repeat_search` opens a post-Search offer (`morale-repeat-search` choice —
discard the gained card, re-run the same Search (X); the gained card is masked
from other viewers in `player-view.ts`). (Negative): `search_one` forces the
next 2+-card shared-deck Search to 1 (`revealSharedDeckSearch`);
`set_attack_die_minus` flips the holder-worst die of the next attack roll —
and of the holder's own post-attack ABILITY rolls (Death Stare & co., where
"worst" is judged against the ability's success window, so it may be a no-op
flip on a stare that already shows "-1"s);
`next_roll_minus_one` latches -1 onto the next attack roll (stack modifier,
survives window rerolls) or Defend-die roll, whichever first — deliberately
NOT onto ability rolls (the card names Attack/Defense/Combat-Power ROLLS);
`roll_one_less` drops one die from the next 2+-dice Treasure roll (incl. the
Crypt gamble), 2+-dice Attack roll (advantage/disadvantage collapse to one
straight die — mandatory even where that helps, e.g. under disadvantage or the
Crypt's experience-face gamble) or the 2-dice Death Stare (one lone die then
petrifies — mandatory-even-when-it-helps again); `reroll_plus_one` forcibly
rerolls the holder's next "+1" Attack die (attack rolls incl. window rerolls
and the just-set +1 of `set_attack_die_plus`, the Defend die, the
skip-activation check die, and EVERY ability die the holder rolls — the
post-attack rolls above plus the Dwarven resistance die, the defensive soak
and the Medusa gaze); `random_combat_discard` at combat start.
Ability-die curse behaviour is pinned in `ability-dice-events.test.ts`.

Presentation layer (pure UI over the wiring above, no engine change): every
`MORALE_CARD_DRAWN`/`_USED`/`_DISCARDED` event pops the `MoraleCardOverlay`
(card art + holder + a plain-words "what happened" line, gold vs red-shake
styling) on the map AND combat screens, with the converted H3
`effects/good-morale`/`bad-morale` sting — good/bad picked by whether the
moment favors the holder (a cancelled Negative card sounds GOOD, an absorbed
Positive sounds BAD), the positive-limit tidy-up stays a quiet feed line, and
the generic feed sound is suppressed for these events so nothing double-plays.
Cue builder + per-card hint/outcome texts in
`src/components/table/morale-card-cue.ts` (`morale-card-cue.test.ts`,
`morale-card-overlay.test.tsx`). In combat the `CombatMoralePanel`
(`combat-morale-panel.tsx`, extracted from page.tsx) lists the viewer's held
cards with live use buttons driven by the engine's `SPEND_MORALE` offers
(combat-bonus / remove-token / redraw; hint text for cards whose use is
offered elsewhere, e.g. the reroll window) plus the opposing fighter's public
held cards (`combat-morale-panel.test.tsx`); the map `MoraleCardsDock` also
shows other seats' held cards.

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

Lobby option `GameSetupOptions.undoMoves` (Game options → Mode & Rules, default
OFF). Purpose: manual testing / bug-hunting — with it ON a player may roll the
whole game back to the state before a recent action. NOT a normal-play feature.
Engine flag frozen onto `adventure.undoMoves` at setup; the history + restore
live entirely SERVER-SIDE in `src/server/undo-history.ts`, wired into BOTH
backends (`submitRoomAction` in `game-room-store.ts`; the PartyKit edge's
WS `onMessage` + HTTP POST action paths in `party/index.ts`). Behaviour pinned in
`src/server/undo-history.test.ts` (module + built-in store, with CONTROLs),
`src/server/undo-history-edge.test.ts` (the PartyKit `onMessage` path, real
harness), `src/components/adventure/undo-button.test.tsx` (map HUD button renders
ONLY under the option) and `src/components/adventure/game-options-tabs.test.tsx`
(the lobby toggle). Each guardrail has a failing-if-removed CONTROL.

Leading with what does NOT run / deliberate limits:
- **Default OFF = ZERO behaviour change.** With the option off/absent (every
  legacy snapshot) no snapshot is ever recorded and an `UNDO_MOVE` action is
  rejected ("Undo mode is off for this game."). Pinned with CONTROLs on both
  backends.
- **The undo history NEVER enters GameState** — it is a bounded per-room stack of
  full pre-action serialized snapshots kept in the `undo-history` module's
  in-memory Map alone. It is never broadcast, never serialized into a room
  snapshot, and never reaches a player view (no hidden-info leak, no snapshot
  bloat). Only the public `MOVES_UNDONE` feed line (player + count, no secrets)
  rides in `eventLog`, so every rewind is visibly announced (feed + warning cue),
  never silent.
- **Bounded to the last `UNDO_HISTORY_LIMIT` (10) actions**, oldest dropped.
- **WHO may undo**: any current member of the room (open/legacy table → anyone;
  hosted table → a member matched by verified `userId` first, else per-tab
  `clientId`). Justification: the whole table opted into the debug toggle and the
  feed line keeps it visible; a non-member is rejected ("Only a member of this
  room can undo.").
- **WHAT is one undo step**: one human action applied through the server action
  transaction. Restore is a WHOLE-state swap, so undoing across an open combat /
  pending choice / reward queue rolls them all back atomically (no replay). In
  single-player, AI pump steps that ran between two human actions roll back
  together with the preceding human action (they are not their own undo points);
  after a restore the paced pump is re-derived (`cancelComputerPump` +
  `ensureComputerPump`) so it re-arms iff the restored state still owes a move —
  an undo around a computer turn cannot leave the pump frozen.
- **Seeded RNG**: a redone action reproduces the same server entropy per action,
  so a redo re-rolls the same dice — expected, not a bug.
- The history is cleared on room close / reset / ranked force-close (both
  backends). On the PartyKit edge it also does not survive Durable Object
  hibernation/eviction (it is in-memory) — a documented limit acceptable for a
  debug aid.

## Single player vs computer opponents (EXPERIMENTAL) — what runs vs. limits

Menu → Single player → `/single-player` mints a PRIVATE room (128-bit `sp-` id,
never in any lobby directory, never MMR/match-reported, no AFK votes or turn
clocks; only the first owner may join — engine-enforced in `joinRoom`). One
human (`p1`) plus 1–3 computer seats (`state.controllers`, persisted;
`sessionMode: "single-player"`). Engine in `src/engine/computer/*`, server pump
in `src/server/computer-runner.ts`, wired into BOTH backends' action
transactions (store `submitRoomAction`; PartyKit WS+HTTP paths) after the AFK
settle. Plan/contract: `docs/single-player-computer-opponents-plan.md`; tests:
`computer-runner.test.ts`, `single-player-live.test.ts`,
`single-player-combat-resolve.test.ts`, `single-player-privacy.test.ts`,
`window.test.ts`, `control.test.ts`, `computer-move-replay.test.ts`,
`hero-position-override.test.tsx`, `map-navigation.test.ts`,
`army-strength.test.ts`, `computer-battle-report.test.ts`,
`opponent-turn-overlay.test.tsx`, `single-player-pump.test.ts`.

- **The paced pump is alarm-safe and self-healing (production freeze FIXED).**
  On the deployed PartyKit edge the pump runs on Durable Object alarms, and
  PartyKit THROWS on any `Party.id` read inside `onAlarm` — the old handler
  read `this.room.id` when stamping the new snapshot, so the FIRST alarm tick
  crashed, the alarm was never re-armed, and every deployed AI froze after its
  first visible step ("keeps saying it's taking a turn", "sits on a tile
  rotation forever"). `onAlarm` now uses the snapshot's own `roomId` (and
  `metric()` goes through `roomIdSafe()`), and BOTH backends self-heal a lost
  pump: the edge re-arms in `onConnect`, on EVERY inbound socket message (the
  client health-pings after ~35s of silence, so a frozen table revives without
  a reload) and on the HTTP GET poll — all via `ensureComputerPump` (only when
  no alarm is pending — never postponing a due tick); a THROWN alarm tick
  (storage/broadcast hiccup) logs and re-arms at a 5s retry pace instead of
  letting Cloudflare's few retries exhaust the chain; the built-in store
  re-arms on `subscribeToRoom` / `restoreRoom` / the GET snapshot route (its
  setTimeout dies with the process). Pinned in `single-player-pump.test.ts`
  with a PartyKit-faithful harness whose `room.id` getter throws while
  `inAlarm`: the whole-AI-turn alarm-loop test fails if the `this.room.id`
  read comes back, and each self-heal / failed-tick re-arm test fails if its
  wiring is removed (mutation-checked). `single-player-edge-start.test.ts`
  additionally plays the WHOLE game start (room creation marker → faction pick
  → START_ADVENTURE → round 1 → round 2) through real alarm ticks with COLD
  wakes (a freshly-evicted object on every third tick) and both alarm-banned
  properties (`Party.id`, `Party.context.parties`) throwing.
  DEPLOY NOTE: `party/index.ts` reaches production ONLY via
  `npm run deploy:partykit` — a Vercel deploy alone leaves the old edge (and
  its frozen-AI bug) running.
- **The pump no longer stalls on a "no measurable progress" action (the REAL
  game-start freeze).** Distinct from the alarm-crash above: `driveComputerPlayers`
  compares a `progressFingerprint` before/after each applied action and, if it
  is unchanged, used to STALL the whole pump immediately — so the AI turn froze
  ("says it's taking its turn and does nothing") whenever the policy's top pick
  was a fingerprint no-op. Two fixes, each mutation-checked in
  `computer-runner.test.ts`: (1) `progressFingerprint` now captures the
  combat-pause identity (`combat.pendingNeutralStep` kind/unit/reactor,
  `combat.pendingNeutralPlacement`, and per-unit `reactionPauseAcked`) — a
  `CONTINUE_NEUTRAL_STEP` that resumes a "pre-activation" reaction pause only
  clears that pause and acks the unit (activeUnitId/positions unchanged), so
  without this the real step read as no-progress; this was hit in
  computer-vs-computer PvP and neutral fights right at game start. (2) On a
  no-progress-but-no-error apply the runner now DISCARDS that candidate (it is
  already in `attempted`) and tries the next legal action instead of stalling,
  reaching the explicit "no safe legal action" stall only when every candidate
  is exhausted (bounded: `attempted` grows, the legal set shrinks, `maxSteps`
  backstops). Reproduced pre-fix at ~2-3% of game starts with 1–3 opponents;
  360+ real-game starts clean post-fix.

Leading with what does NOT run (deliberate limits):
- **Objective-seeking, fighting map play — with limits.** The policy now plays a
  real map turn: it builds/recruits (already scored in `map-policy.ts`), and its
  hero MARCHES toward the nearest worthwhile objective instead of wandering, via
  an unbounded multi-source BFS distance field from the objectives
  (`src/engine/computer/map-navigation.ts`, `objectiveDistanceField`) — a step is
  scored by how much it shrinks that distance, so the potential strictly
  decreases and the hero never oscillates (the old "back and forth" bug; pinned
  in `map-navigation.test.ts` "stops wandering"). Objectives are unowned
  towns/flaggable/visitable fields, **beatable neutral guards** and **beatable
  enemy heroes**. Guard engagement is grounded in the engine's own Quick-Combat
  rule — `canBeatGuardedField` engages when `neutralBattleLevel >= difficulty`
  (a strict `>` is a guaranteed Quick-Combat win, `==` an even fight it takes);
  a guard above the hero's level is avoided (no drawn-guard strength read yet).
  Enemy-hero (PvP) engagement is gated by an army-strength comparison
  (`src/engine/computer/army-strength.ts`, `shouldEngageEnemy`, ratio 0.85 — "not
  afraid" of a roughly even trade); the real combat is still dice-resolved, so
  luck decides the actual outcome. Exploration toward face-down tiles, known
  Creature-Bank strength reads (`canBeatCreatureBank`), free re-flag of enemy
  mines, and garrison assault of enemy towns when army-comparable are all
  wired. When no objective is reachable the hero ends its turn (no wandering).
  Event / Astrologers visit menus and post-combat gates (Necromancy skip,
  Commander First Aid, settlement income, auctions with modest bids, place-
  creature-bank, garrison defend-when-funded) are scored so the runner never
  freezes on a computer-owned exclusive window — pinned in
  `visit-event-policy.test.ts` and `computer-runner.test.ts` ("Events /
  exclusive visits"). A critical latent bug is fixed: a finished combat parks
  the game in the `"game-over"` phase until it is acknowledged, and
  `computerDecisionOwner` used to short-circuit on that phase — so the FIRST map
  combat the AI won froze the whole game. It now falls through to drive the
  fighter's `ACKNOWLEDGE_COMBAT_END` while a non-sandbox combat notice is still
  open (pinned in `computer-runner.test.ts` "marches into a neutral fight … and
  recovers", which stalls if the fix is reverted). Multi-round economy memory
  (`GameState.computerMemory`, sticky objectives + army/income/magic focus),
  advanced formation tactics (screen/backline placement, improving tactics
  swaps, focus-fire), and a fixed-seed multi-round soak + reconnect suite
  (`single-player-soak.test.ts`) are wired. STILL deferred: hide multiplayer-
  only invite/share affordances on the SP table page; optional nightly long soak.
- **Teleport networks, mod FO, equipment, permanents (2026-07 AI upgrade).** The
  march BFS adds reverse edges for Monolith / Whirlpool / colored Gate / one-way
  entrance→exit (known fields only; `listKnownTeleportDestinations` +
  `objectiveDistanceField`; tests in `map-navigation.test.ts`). Visit menus
  still pick the landing nearest the primary. Equipment outfitters and WOG FO
  hexes are conditional visitables; Keymaster tents that open still-blocking
  Barriers are elevated. `BIND_COMMANDER_ARTIFACT` / `EQUIP_HERO_EQUIPMENT` /
  `GAIN_GRADE_PROGRESS` score as permanent packages (~740–810). Polish Wait,
  smarter `SPEND_MORALE`, and map-spell-boost option ranking are wired. V1
  limits: no face-down portal landings in the BFS, no whirlpool unit-toll EV,
  no full Neutral Rank-Up engagement rewrite.
- **Expansion tempo, dwelling-first economy, crown & Power discipline,
  high-value combat trades** — all score-layer heuristics over already-legal
  actions (the engine rules are untouched, so nothing here can produce an
  illegal move). Map: the hero collects payoffs within this turn's walking
  reach first, but when every known payoff is out of reach it flips the
  face-down tile / places a held Ⅱ–Ⅲ supply tile instead of trekking
  (`explorationActionScore`); an adjacent doorway also out-values a distant
  leftover as the MARCH target, harder still when no beatable fight exists
  anywhere (post-loss recovery — the boost keeps a beaten army expanding
  instead of parking), and the sticky march objective is cleared on every
  `ACKNOWLEDGE_COMBAT_END` so a LOST fight forces a fresh plan (pinned in
  `map-navigation.test.ts` "expansion push …" + `memory.test.ts`). Economy:
  while saving for the Silver/Gold dwelling, side buildings that would eat the
  dwelling fund wait (mirror of the recruit treasury guard), and Spell-Book /
  Magic-University purchases wait for the army core plus Wisdom-in-hand or
  surplus gold (`development.test.ts`). Cards: the round's LAST crown is never
  spent on a map convenience (basic twin wins; combat saves/stats/damage still
  spend it — `expertCrownNudge`); a +1-Power discard on a pending damage cast
  is paid only when it moves the printed ladder, stops once the hit is lethal,
  and pays up eagerly when one more Power converts the cast into a removal
  (`pendingSpellBoostImpact`); damage spells aim by the PRINTED ladder — spell
  damage is not reduced by Defense — so casts hunt the high-value unit and
  still finish a dying one (`card-policy.test.ts`, each with CONTROLs).
  Combat: a high-value unit in lethal reach Defends instead of a suicidal
  0-damage poke that invites a lethal retaliation (real strikes still always
  win; chaff keeps trading — `combat-policy.test.ts`). Every claim above is
  mutation-checked: removing the wiring fails the named test.
- **Home-tile drain + premium-economy rush** (map heuristics, engine untouched;
  each claim mutation-checked). Home tile: while the main hero still stands on
  its OWN tile Ⅰ and any sweepable payoff remains there, `primaryMapObjective`
  RESTRICTS the pool to those remaining home payoffs, so all three opening items
  (free symbol + guarded treasure + guarded income mine) are drained EVERY game
  before conquest / Far / sticky commits can pull the hero off — the old
  round-3 sweep cap is gone and home difficulty-1/2 guards stay engageable
  through the drain (`map-navigation.test.ts`). Premium economy — settlement /
  gold mine / valuables mine — waives the neutral-only opening refusals (it is
  the Far economy the expansion is FOR): the AI hits difficulty-3 of them ASAP,
  not afraid of unit losses, calibrated off the real `NEUTRAL_ARMY_TABLE`
  field-3 parties — three bronze **Packs** alone take lv3 on easy/normal/hard,
  Impossible (pure 3-silver wall) needs Packs + one silver body
  (`armyCoversPremiumEconomyGuard` / `premiumEconomyEngageCap`); a coverable
  premium fight outranks side neutrals and drives a multi-turn march before
  round 6, with resource need steering gold vs. valuables. A soft engagement
  unlock lets three bronze Packs + even one silver body reach the silver guard
  cap (the classic path still needs two silver bodies). Economy: true-surplus
  valuables (target + 2, e.g. a valuables mine) now sell for gold before the
  Gold dwelling instead of rotting, the last dwelling-needed valuable still
  protected (`map-policy.ts` `tradeUtility`, `market-policy.test.ts`). Pinned
  across `map-navigation.test.ts`, `army-strength.test.ts`,
  `market-policy.test.ts`, `visit-event-policy.test.ts` (the last also covering
  the already-shipped Polish sized-bank A/B chooser — the AI takes the best
  beatable rolled size, else leaves the field blocked).
- **Guaranteed first-battle wins (smoothing house rule)**: a computer seat's
  first TWO eligible neutral-guard battles are guaranteed flawless one-round
  wins — at the combat-start chokepoint (`finalizeCombatStart` →
  `applyComputerGuaranteedWin`, `src/engine/computer/guaranteed-wins.ts`) every
  guard falls before any unit acts, the AI army takes zero damage/losses, and
  the outcome resolves through the NORMAL victory path (XP by difficulty,
  Freelancer's Guild gold, guard-card recycling, field visit — all real; the
  human's battle recap shows a normal won fight plus the explicit
  `COMPUTER_GUARANTEED_WIN` event/feed line). Leading with what it does NOT do
  (the abuse guards — the map policy never reads the feature, so the AI cannot
  seek fights to exploit it): guard FIELDS only at difficulty I/II that the
  hero's own `neutralBattleLevel` already covers (the AI keeps its natural
  level-I-then-level-II ladder — level-II guards come from the II–III tiles it
  explores/places); Creature Banks, PvP fights, human seats, multiplayer
  sessions and PvP-Neutral-Control fights never qualify; Quick Combat
  (level > difficulty) resolves before combat opens and never consumes a slot;
  from the third eligible battle on the seat fights every battle normally. The
  per-seat counter persists on `GameState.computerGuaranteedWins`. Each claim
  (both wins, the limit, and every scope CONTROL) is mutation-checked in
  `src/engine/computer/guaranteed-wins.test.ts`.
- **Temp Empowered Attack/Defense cards (smoothing house rule #2)**: at the
  start of every NON-PvP combat a computer seat fights (guard fields AND
  Creature Banks), it draws 1 temporary Attack + 1 temporary Defense statistic
  card into hand, both Empowered for that fight (crown-free Expert — the ids
  temporarily join `player.empoweredAbilities`), and BOTH are removed from the
  game at combat end wherever they landed (hand/discard/deck) — never kept.
  The AI plays them through the normal reaction pipeline (the e2e test proves
  an Expert play with ZERO crowns). Never in PvP battles, sandbox fights,
  human seats, multiplayer sessions or PvP-Neutral-Control fights; a
  guaranteed-win fight injects nothing; a genuinely owned twin card and a
  pre-existing Empower mark survive the cleanup. Hook `finalizeCombatStart` →
  `applyComputerCombatBoost` (`src/engine/computer/combat-boost.ts`), cleanup
  at the top of `finalizeAdventureCombat`; tracked on
  `combat.computerBoost`. HONEST LIMIT: a seat eliminated mid-combat skips
  the cleanup (the dead seat's cards no longer matter). Mutation-checked with
  scope CONTROLs in `src/engine/computer/combat-boost.test.ts`.
- **Smarter map/card play (2026-07 pass)** — each claim mutation-checked:
  the start-of-turn refresh now VOLUNTARILY cycles junk (≤3 cards, only with
  real replacement supply; a Necropolis seat without a playable Necromancy /
  Vidomina specialty in hand digs harder — `mulligan-necromancy.test.ts`);
  playing Necromancy in the after-combat window now OUTRANKS
  `SKIP_NECROMANCY` (the old ~600-vs-1120 scores made the AI skip its faction
  engine after EVERY win — a real bug, same test file); tile rotations chase
  the NEEDED resource payoff (premium fields weighted by
  `premiumEconomyResourceBonus`, materials mines when the next dwelling needs
  materials — `map-navigation.test.ts` "chases the NEEDED resource payoff");
  a main hero with NOTHING beatable on the map STAGES adjacent to the nearest
  future fight instead of standing still turn after turn (`collectStagingObjectives`,
  entry still blocked while unbeatable — `map-navigation.test.ts` "fallback
  staging"); Legion vouchers are played for the discount in EVERY phase (a piece
  is withheld once it has already banked — see the reinforcement-discount
  section for what "already banked" means in each reading), a banked
  Necromancy / Hill Fort offer is redeemed (`REDEEM_REINFORCEMENT_DISCOUNT`,
  score 820 reinforce / 760 stack — no bespoke "hold it and stack Legion first"
  planning, so the AI may walk and lose an unredeemed bank), and Learning is priced as an A-tier
  climb engine below hero level 6 with the expert full-level pick preferred
  when a crown is spare (`legion-learning.test.ts`); a REVISIT_FIELD is noted
  in per-turn memory so a Stables (its +1 MP refunds the revisit cost) can no
  longer loop the runner to its 256-step cap (`memory.test.ts`). Gold-dwelling
  tempo is pinned in `single-player-premium-rush.test.ts`: on Normal, three of
  the eight fixed seeds build the Gold dwelling BEFORE round 9 (R7/R7/R8) and
  7/8 by R11 — floors 2 and 5; the map's premium-economy placement decides the
  per-seed ceiling, so an every-seed-before-R9 floor would be dishonest.
- **Free seizures & anti-parking (2026-07 sp-ai pass)** — each claim
  mutation-checked in `map-navigation.test.ts` (behavioural floors in
  `single-player-premium-rush.test.ts`): a level-covered difficulty-1 neutral
  is ALWAYS engageable (the establish-core / bronze-rush refusals now gate
  difficulty ≥ 2 only — no multi-turn park before an easy fight); unguarded
  mines / symbols / free towns within this turn's MP outrank a fair fight as
  primary (`freeSeizuresWithinReach`; premium-economy commits and strictly
  closer Quick-Combat freebies still divert — `fightOutranksFreeSeize`);
  the multi-source march scoops free pickups ONLY along the committed path
  (a pickup no farther from the primary than the hero — a nearer pickup in
  the OPPOSITE direction must never reverse the march); the keep-clear move
  penalty applies to LIVE guards only (`isFieldGuarded` — a black-cubed /
  own-flagged difficulty field is an ordinary corridor cell, not a wall);
  and an idle SECONDARY hero parked one cell ahead of the main inside a
  one-lane corridor sidesteps out (`ALLY_UNBLOCK_SCORE` — single-step moves
  can never end on an allied hero, so the blockade would otherwise deadlock
  the march for the rest of the game).
- **Computer battles resolve IMMEDIATELY and off-screen; movement is REPLAYED
  behind an accept-gate, with a battle recap.**
  The whole computer turn (movement AND its neutral/bank combats) settles inside
  the human's action transaction, so the human never watches an AI fight or waits
  on one — the settled response already carries the result. The ONE exception is
  a PvP fight (a computer attacking the human): the runner leaves that combat
  OPEN for the human to play (emergent from `computerDecisionOwner` returning
  null on a human-owned combat slot; pinned in
  `single-player-combat-resolve.test.ts`, AI-only-resolves vs PvP-stops-open).
  Because the turn settles at once, when it arrives the human is shown ONE
  prompt — the `OpponentTurnOverlay` (`src/components/table/opponent-turn-overlay.tsx`)
  — that first RECAPS each AI battle (win/loss + the reward claimed, built purely
  from the settled event log by `buildComputerBattleReport` in
  `src/components/table/computer-battle-report.ts`) and then, when the opponents
  also moved, gates the map replay behind an explicit "Watch their moves →"
  click. Only on accept does the client REPLAY each computer hero's walk SLOWLY
  (`REPLAY_STEP_MS` = 900ms, deliberately slow), one cell at a time, one hero at
  a time: `computer-move-replay.ts` (`buildComputerMoveReplay` filters to
  computer heroes and orders the frames; `useComputerMoveReplay` paces them),
  rendered via a `heroPositionOverrides` prop on `HexMapBoard` (the pawn draws at
  the replay cell) plus a "Computer N is moving…" badge. Nothing on the map
  animates until the human accepts, so no opponent moves behind their back. It is
  PURE PRESENTATION over the already-authoritative state — it never gates rules
  progression — and is cancelled the instant the human acts or a combat opens
  (including a PvP fight the AI opens, which clears the overlay and drops the
  human straight into the defense). A human's own move keeps its instant path
  arrow. Pinned in `computer-move-replay.test.ts`,
  `hero-position-override.test.tsx`, `computer-battle-report.test.ts` and
  `opponent-turn-overlay.test.tsx`. Deeper presentation (a per-decision think
  delay / server-paced intermediate broadcasts) is still deferred.
- Computer actions use trusted in-process authority
  (`ReducerOptions.computerActorPlayerId`, never client-deserializable); a
  client cannot forge a computer-seat action, and `ASSIGN_SEAT` refuses
  computer seats (one-human invariant, reasserted on EVERY lobby seat resize in
  `resizeLobbySeats`).
- Anti-freeze: `computerDecisionOwner` returns a seat only for a REAL owed
  window (wait-vs-drive: human-owned interactions and open combats make bots
  wait, never a false stall); the runner has per-fingerprint retry dedup, a
  no-progress guard and a 256-step cap — a stall logs and persists progress.
- Rematch ("New adventure", no vote needed) preserves the single-player session
  + seat count on both backends; an ESTABLISHED room can never be reset-flipped
  into single-player (fresh memberless lobbies only — the PartyKit implicit
  creation flow via the first connection's `?singlePlayer=` marker).

## PvP Neutral Control (OPTIONAL mode, multiplayer only) — what runs vs. limits

Lobby option `GameSetupOptions.pvpNeutralControl` (default OFF, Game options
"play" tab; multiplayer only — a solo table never gets it), with the
`pvpNeutralControlMustAttack` sub-toggle (default ON). With the mode on, every
NEUTRAL combat (guard fields AND Creature Banks) plays like a PvP battle: the
NEXT live player clockwise from the fighter — `neutralCombatControllerId` in
`src/engine/neutral-control.ts`, derived from the live-only `turnOrder` so
eliminations hand the guards to the next seat (or back to the AI) automatically;
NOT related to the WOG Commanders module — PLAYS the Neutral units. The engine
pump stops on each guard's activation exactly like on a PvP unit's, and that
player drives it with the normal unit actions (offered by
`addControlledNeutralUnitActions` in `legal-actions.ts`, executed AS the neutral
seat via `asNeutralSeatCommand` in `reducer.ts` so attack attribution,
retaliation and friendly checks match the AI pipeline verbatim). They also break
the guards' activation-order ties (`advanceActiveUnit`) and answer every
Neutral-owned decision the fight opens — ability follow-ups (Lich/Magog splash
targets, Magic Mirror redirect), attack-die reroll windows, and the guards'
"[activation]" ability choices (Enchanter heal pick, Faerie Bolt target, via
`maybeOpenPlayerActivationChoice`) — the pump re-stamps any NEUTRAL-owned
pendingChoice to the controller instead of auto-resolving. The controller is
notified (`NEUTRAL_CONTROL_ASSIGNED` event → feed line + a controller-only
overlay). Behaviour pinned in `src/engine/pvp-neutral-control.test.ts` (each
claim with a mode-off / wrong-seat CONTROL).

Leading with what does NOT run / deliberate limits:
- **The War Zealot Magic Mirror still auto-USES** (the printed reflect is read
  as always-on; declining is never right) — but its redirect TARGET pick goes
  to the controller like every other follow-up.
- **Token "other actions" (Ogre Bloodlust / Sorceress Weakness,
  `PLACE_TOKEN_ACTION`) ARE offered on the controller's FREE-mode menu** (user
  rule "mode free: do whatever" / "use token"; `addControlledNeutralTokenActions`):
  the offer is issued for the controlling seat and re-stamped to the neutral seat
  (`asNeutralSeatCommand` now also wraps `USE_UNIT_ABILITY`), and the target-pick
  choice it opens is a NEUTRAL-owned choice the pump hands back to the controller
  — exactly like the guards' [activation] follow-ups. They are NOT offered in
  MUST-ATTACK mode ("cant … use token"). The deck-digging (Genie Wish) and Summon
  Demons other-actions stay OFF a controlled guard on every menu — they read the
  CONTROLLER's own deck / removed units, not the neutral side, so handing them
  over would be a bug/exploit, and the AI never used them. Passive/triggered
  abilities still fire normally.
- **The IN-COMBAT menu is IDENTICAL for a normal guard FIELD and a Creature
  BANK** — both obey the `pvpNeutralControlMustAttack` toggle (must-attack: a
  bank guard must attack too; free: "keeps its corner as start but can do
  whatever it wants", token included). Banks differ ONLY in the pre-battle SORT
  below.
- **Pre-battle formation SORT** (`combat.pendingNeutralPlacement`, user rule
  "sorting or moving neutral formation before battle, just like defender"): on a
  normal guard FIELD, once the neutral army is revealed and auto-placed, the
  controller gets a setup window (`PLACE_NEUTRAL_GUARD` to move a guard to an
  empty defender cell or swap two guards within the defender zone;
  `FINISH_NEUTRAL_PLACEMENT` to start the battle — then Tactics, then round 1) —
  offered whenever ≥2 living guards stand (mirrors the Tactics threshold). A
  **Creature Bank CANNOT sort** — its guards keep their fixed corner deployment
  (`placeCreatureBankGuards`), so no sort window opens.
- **Berserk and the Astrologers Werewolf frenzy override both toggle modes**
  (the spell/frenzy menu binds a controlled guard exactly like a player unit).
- **A neutral Harpy's "Strike and Return" fly-back is the CONTROLLER's choice in
  FREE mode** (`pvpNeutralControlMustAttack` OFF, and under Manual guard control,
  which is always free play): after a moved-then-struck guard with the
  `harpy-return` ability, the fly-back-or-stay `combat-reposition` OPTION_CHOICE
  is opened NEUTRAL-owned and re-stamped to the controller like every other
  neutral follow-up — an eliminated controller hands it back to the neutral seat
  (`isNeutralSideCombatChoice` covers a neutral `combat-reposition`), the AFK
  driver default-answers it (plain `CHOOSE_OPTION`), and a computer controller
  scores it through the generic OPTION_CHOICE policy (never a stall). In
  MUST-ATTACK mode (rulebook spirit) the guard still AUTO-returns — no "stay" is
  offered (deliberate, wired at `concludeAttackerActivation`). With no human
  driver (plain AI / computer fighter / mode off) the auto-return is
  byte-identical. Pinned in `pvp-neutral-control.test.ts` (free vs must-attack,
  eliminated-controller hand-back) and `manual-guard-control.test.ts` (the
  fighter's choice + mode-off / computer-fighter CONTROLs).
- The continue-or-retreat window, the pre-activation reaction pause (which no
  longer previews an intent under this mode — a human hasn't decided yet; the
  pause can coexist with the controller's open choice, each resolving
  independently) and every reward stay the FIGHTER's, exactly as before.
- The mode never changes `unit.controllerId` — guards stay the NEUTRAL seat's
  for rewards, win/loss and every rules read; only the acting SEAT differs.

The `pvpNeutralControlMustAttack` sub-toggle (applies to normal guard FIELDS AND
Creature Banks alike — the bank differs only in the no-sort setup, above):
- **ON (default, rulebook spirit)**: a guard that can strike now gets ONLY its
  attacks (no Defend, no token, no move, no hold); one that can reach a strike by
  moving gets only those landing cells; otherwise only steps that strictly CLOSE
  the walked distance to some enemy — no wandering to run down the neutral round
  limit; hold only when boxed in.
- **OFF**: the controller plays the guards with NO constraint — the full PvP
  menu (move anywhere legal, attack, defend, hold after acting) PLUS the token
  "other actions" (Bloodlust / Weakness) — "do whatever".

Cross-mode seams (each pinned):
- **Parallel turns**: the controller IS a participant of the open fight
  (`parallelInteractionBlocker` returns null for them), so their unit commands
  and answers pass the bystander fingerprint backstop; every other seat stays a
  plain bystander.
- **Turn clock**: the fighter's 10-minute clock pauses while the guards' slot
  (or a controller-owned choice) is open (`turnClockPausedFor`); the controller
  has no clock of their own — a staller is removed by the AFK vote / idle-kick
  path, whose driver can now play a dropped controller's guard slot out with
  default unit commands and default-answer `CHOOSE_ABILITY_TARGET` /
  `CHOOSE_PENDING_ROLL` (both added to `RESOLVING_ACTION_TYPES`, `afk-drop.ts`).
- **Elimination**: `eliminatePlayer` hands a dead controller's open
  neutral-side choice BACK to the NEUTRAL seat (`isNeutralSideCombatChoice`)
  instead of dropping it mid-attack; the next action's pump re-stamps it to the
  new next-clockwise seat, or the AI resolves it when nobody live remains.

Mode off / solo / legacy snapshots: the rulebook Neutral AI plays the guards
unchanged (`executeNeutralActivation`), with the fighter breaking its ties and
picking its landing cells exactly as before.

## Multiplayer ladder & turn discipline (MMR, quit penalty, 10-min turns) — what runs vs. limits

Leading with what does NOT run: a game that never reaches a winner (every seat
walks away before anything triggers the last-standing win) reports nothing; OPEN
tables are never recorded (their members hold no seats, so results cannot be
attributed); a turn-clock pause forgives the seat's WHOLE 10-minute budget
(fresh stamp), not just the paused interval; and the timeout/auto-kick triggers
are CLIENT-fired (server-validated) — with zero connected clients nothing fires,
which is fine because nobody is waiting.

- **Every finished win/loss is RECORDED; only a RANKED game moves MMR.** All
  victory modes funnel through `declareAdventureWinner` (conquest, grail,
  dragon-hunt, dragon-conqueror, last-faction-standing after eliminations/
  give-ups/AFK kicks), so `detectFinishedMatch` (`src/server/match-report.ts`)
  reports them all on a hosted table with ≥2 verified accounts, a winner AND a
  loser — **including a NORMAL/casual table** (`room.ranked === false`), so a
  give-up or quit shows up as a win/loss on the profile even in a casual game.
  The match carries a `ranked` flag: `recordMatchResult` bumps wins/losses/
  matches for every reported game but recomputes Elo ONLY when `ranked` (a
  NORMAL game leaves every rating untouched — pinned with W/L-moves-MMR-doesn't
  tests on both account backends AND the `/api/matches/report` route). Elo is
  winner-takes-field (`accounts/elo.ts`); "abandon" scores as a loss on BOTH
  account backends. An absent `ranked` flag (legacy rooms) stays ranked.
- **Losing or quitting loses points.** `buildAdventureFromLobby` freezes
  `room.matchSeats` (seat → account) at map build; at game end the reporter
  unions that snapshot with the live members, so LEAVE_ROOM, stepping down to
  observer or a host kick mid-game is reported as **abandon** instead of
  vanishing. A replacement account seated mid-game gets the seat's real result;
  the deserter still gets the abandon. Pinned in `match-report.test.ts`
  (leaver / stepped-down / replacement / winner-seat cases, with a no-snapshot
  legacy CONTROL proving the snapshot is what closes the quit-to-dodge hole).
- **All time controls are CLOSED-table only** (`timeControlsActive(state)` =
  `Boolean(state.room?.hosted)`, `afk.ts`). The AFK vote-kick, the 30-minute
  certain auto-kick AND the 10-minute per-turn timer run ONLY on a CLOSED
  (hosted) table — the ranked/serious mode. An OPEN table is the casual /
  single-browser mode and carries NO time pressure at all: nobody is voted out,
  auto-kicked or force-shifted for taking their time (user rule "remove all time
  constraint in open game, keep it in closed game"). Gated at the source —
  `startAfkVote` / `forceAfkKick` throw on an open table, `turnClockRunningSeats`
  returns `[]` — and in the UI (the `AfkVotePanel` renders nothing on an open
  table). A table later hosted picks the clocks up on its next action. Pinned
  with open-table CONTROLs in `afk-vote.test.ts`, `turn-timeout.test.ts`,
  `overlays.test.tsx`.
- **10-minute turn budget** (`TURN_TIME_LIMIT_MS`; engine in `afk.ts`,
  `afk-drop.ts`, `resolveTurnTimeout` in `adventure-reducer.ts`): even an
  actively-clicking seat gets 10 minutes per OPEN turn (`afk.turnOpenSince`,
  maintained by `applyTurnClockBookkeeping` on every server-stamped action;
  ordered AND parallel modes). The clock PAUSES (re-stamps, checked on BOTH
  sides of each action), and thereby RESETS on exit, while the seat is blocked:
  **ANY open battle it is in** (the fighter's OWN neutral combat, a PvP battle,
  or a PvP-Neutral-Control guard slot — user rule "the 10-minute limit resets
  when in battle", so combat time never eats the map-turn budget), another
  seat's exclusive interaction, or the round-start event barrier. On expiry any
  live client fires `FORCE_TURN_TIMEOUT` (the server re-checks its own clock
  and the pause state); the shared forced-resolution driver then
  default-resolves the seat's pending inputs, retreats any still-open fight (a
  safety net — a battle pauses the clock, so a timeout cannot normally arm
  mid-fight), and ends the turn through the normal `endTurnAdventure` —
  Pandora/Logistics end-turn prompts and the no-base elimination clock run
  exactly as if End Turn was pressed by hand. The player is NOT eliminated (the
  AFK vote / 30-minute kick remain the removal path), driver-issued auto-answers
  do NOT refresh the target's AFK idle clock, and force-ending the LAST open
  parallel turn wraps the round WITHOUT consuming the seat's fresh next turn.
  Pinned in `turn-timeout.test.ts` (a NEUTRAL fight pauses-then-times-out-off-map
  CONTROL, plus too-early / paused / wrong-seat / open-table CONTROLs); the
  countdown chip + client auto-fire live in `overlays.tsx`
  (`overlays.test.tsx`).
- **Who is here / who joined.** A genuinely NEW `JOIN_ROOM` announces itself —
  a forced system chat line plus a feed toast — with verified accounts named
  by nickname and guests honestly labeled "guest — name"; reconnects/rebinds
  re-emit the event with `newMember: false` and stay silent so refreshes never
  spam (`room-membership.test.ts`, `chat.test.ts`). The lobby directory carries
  a bounded per-room roster (host first, guests dashed + labeled,
  `MAX_DIRECTORY_MEMBERS`) so players can see who is in which room — and who
  hosts it — before joining (`lobby-registry.test.ts`).
- **Public profiles.** `GET /api/players/[nickname]` (rate-limited; banned →
  404) serves the PUBLIC profile — rating, W/L record, member-since, the
  owner-editable contact fields, never the email — and `/players/[nickname]`
  renders it, linked from Hall of Fame rows and verified room-member names
  (`account-store.test.ts` "looks up a PUBLIC profile by nickname").
- **Match reporting survives a missing edge key (dual-claim).** Finished games
  normally report from the PartyKit edge via `HOMM3BG_MATCH_REPORT_KEY` (now
  falling back to `HOMM3BG_ADMIN_KEY` on both the party and `/api/matches/report`
  so a deployment that only set the admin key still records). When neither the
  edge nor its key is available, a BROWSER dual-claim is the backup: each
  signed-in participant POSTs `/api/matches/claim` once on the game-over
  transition (`maybeClaimFinishedMatch`, `src/lib/match-claim-client.ts`); the
  server PARKS the first claim and records W/L only when a SECOND distinct
  participant confirms the identical fingerprint (`src/server/match-claim.ts`,
  both account backends). Ranked rooms are forced CLOSED at creation (open
  tables store no seats, so the ladder cannot attribute a result), and
  `healVerifiedMembership` backfills a guest-stamped `matchSeats.userId` so a
  leaver is still attributed. Pinned in `match-claim.test.ts` +
  `match-report-giveup.test.ts` (a closed ranked give-up → a recordable
  FinishedMatch), each with a single-claimer / non-participant CONTROL.
- **Room join passwords (casual join-gate).** A room may carry a join password
  (`SET_ROOM_PASSWORD`, host-only on a hosted table, any member on an open one;
  `room.ts`). The engine stores ONLY a salted, dependency-free HASH
  (`hashRoomPassword`, cyrb53), never the plaintext, and `getPlayerView` redacts
  even the hash to `PASSWORD_REDACTED` in every view. A NEW joiner must supply
  the matching password in `JOIN_ROOM` (the host and reconnecting members are
  exempt); and — for a locked room — `roomActionGuard` lets ONLY members (who
  supplied it) take game actions, even on an OPEN table where seats are
  otherwise free. HONESTY: this is a casual Warcraft-III-style gate, NOT
  cryptographic secrecy — the full room state is broadcast, so a weak password
  is brute-forceable by anyone inspecting the transport; its real job is keeping
  uninvited people out of the lobby's Join flow. UI: a host set/clear control in
  the room panel, a per-room join-password prompt (`page.tsx`), and a lobby
  lock badge (`RoomDirectoryEntry.locked`, a boolean only). Pinned in
  `room-password.test.ts` (set/clear, the join gate with wrong/absent CONTROLs,
  the members-only action gate with a no-password CONTROL, and the view
  redaction) and `lobby-registry.test.ts` (the `locked` flag).

## WOG Commanders (optional module, BINH-only) — what runs vs. adaptations

Lobby: WOG crest + "Commanders" module (`WogModOptions.commanders`, default
OFF). Content in `src/data/commanders.ts`, engine in `src/engine/commanders.ts`
wired through setup/adventure/reducer/legal-actions/permanents/runes; behaviour
pinned in `src/engine/wog-commanders.test.ts` + `wog-commander-casts.test.ts`
+ `wog-commander-combos.test.ts` (observable outcomes with CONTROLs; each
fails if its wiring is removed).

### Commander Artifacts (`wog.artifacts` + `wog.commanders`) — 10 slot items

Ten commander artifacts (8 authentic WoG + 2 grade-fill weapons — every slot now
spans minor/major/relic) worn by the COMMANDER, not the hero, acquired from the
shared Artifact decks and bound PERMANENTLY into three slots — weapon / armor /
trinket. Binding ALSO grants one REGULAR (non-commander, non-equipment) Artifact
of the same grade (minor/major/relic) into hand — a FIXED-grade compensation for
the removed card via `grantRegularArtifactOfSameGrade` (adventure.ts): it honours
artifact uniqueness (skips one any seat already holds) but DELIBERATELY sits
outside the BINH tier-progression gate AND the Polish Random Artifacts roll (it is
a forced grant, not a player Search); a null grant leaves a feed note. Data + the
SINGLE-SOURCE registry are in
`src/data/wog/commander-artifacts.ts` (`COMMANDER_ARTIFACT_SPECS`, keyed by card
id — carries the slot AND the wired effect; the card definitions are generated
from it); state on `CommanderPlayerState.artifacts` (public, no player-view
masking); engine folds live in `src/engine/commanders.ts` (`makeCommanderCombatUnit`
/ `commanderCastPower` / `finalizeCommandersAfterCombat`), the bind effect
(`BIND_COMMANDER_ARTIFACT`) in `reducer.ts` + `legal-actions.ts`. Behaviour pinned
in `src/engine/wog-commander-artifacts.test.ts` (every claim an OBSERVABLE combat/
economy outcome with a CONTROL, mutation-checked) + the chip render in
`src/components/commander-card.test.tsx`.

LEAD with the adaptations / deliberate limits:
- **WoG's per-victory INCREMENTAL bonuses are NOT modeled** — each artifact grants
  a FIXED printed bonus.
- **Bow of Seeking and Slava's Ring of Power are NOT shipped** (no clean engine
  arm for their WoG behaviours yet).
- **Binding is PERMANENT by design** — no unbind, no swap; it survives the
  commander's death and revive (the revive cost formula is unchanged), and one
  artifact per slot (an occupied slot is not offered and a forged play is
  rejected).
- **Commander-scope is unchanged** — the artifacts affect only the MAIN hero's
  commander in the fights the commander already joins.

The 10 artifacts (each `tags` states EXACTLY the wired effect, CLAUDE.md §2):
- weapon `iron_cudgel` (minor) — +1 Attack (flat fold; grade-fill).
- weapon `axe_of_smashing` (major) — +2 Attack (flat fold).
- weapon `doomsday_blade` (relic) — +3 Attack (flat fold; grade-fill).
- weapon `sword_of_sharpness` (major) — +1 Might attack die (appends
  `commander-might-1`, riding the Damage-grade Might-dice machinery — so both the
  real roll AND the lethal-save preview read it).
- armor `hardened_shield` (minor) — +1 Defense.
- armor `mithril_mail` (major) — +2 Health.
- armor `helm_of_immortality` (relic) — a commander that dies in combat revives
  FREE at combat end (death never persists, no gold), via the free-revive branch
  in `finalizeCommandersAfterCombat`.
- trinket `boots_of_haste` (minor) — +1 Initiative.
- trinket `pendant_of_sorcery` (major) — command cast Power +1 (folded in
  `commanderCastPower` beside the Magic-grade ladder — lifts the cast tier without
  touching the Magic-grade ability package).
- trinket `dragon_eye_ring` (relic) — the commander's attacks also strike the
  space directly behind the target (appends the Gold-Dragon line-attack arm
  `dragon-line-attack-3`).

Bind flow: the card's only play is a map-only, own-turn `BIND_COMMANDER_ARTIFACT`
option (`cost.removeSelf`) legal only with the Commanders module on, a commander
present (a DEAD commander binds for later) and the slot EMPTY; resolving removes
the card FROM THE GAME (never the discard), sets the slot, and emits
`COMMANDER_ARTIFACT_BOUND`, then grants the same-grade regular Artifact (above).
THREE-WAY DECK GATE: the ten cards join the shared
Artifact deck(s) ONLY when `wog.enabled && wog.artifacts && wog.commanders` are
all on (dead cards without a commander) — id lists `wogCommanderArtifact*Ids`
joined in `makeSharedDecks` beside the Task-1 hero-artifact join (split tiers +
legacy single deck), registered in `src/data/cards/library.ts`, and excluded from
the `moduleGated` sets in `deck-coverage.test.ts` / `combat-sandbox-cards.test.ts`.
They coexist with the anime Pháp Bảo artifacts in the same decks; the anime
Equipment Iron-Blood Sword's per-player first-attack +1 STACKS with a bound Axe on
the commander's first attack (the sword keys off the attacker's controller, and
the commander is that player's unit — pinned as +3 total).

Leading with what does NOT run / deliberate readings:
- **The WoG PC reference layer did NOT ship**: the 5-tier primary skills and
  the PC numbers in `docs/wog-commanders-plan.md` §4–5 are design history. The
  shipped system is grades 0–3 per stat plus the 15 combination skills below.
- **Stat points from level-ups** (`commanderGradePointsForLevelUp`,
  `awardCommanderGradePoints`): every hero level-up awards the commander stat
  POINTS to spend (one point raises one stat by one grade). A normal level-up
  gives 1 point; the two MILESTONE levels give 2 — levels 3 & 6 for everyone
  EXCEPT the Castle Paladin, whose Wise specialty pulls the milestones EARLIER
  to levels 2 & 5 (`commanderDoublePointLevels`). A full run to level 7 is 8
  points either way. Points live in `commander.gradePoints`; `COMMANDER_GRADE_UP`
  spends ONE to raise a single stat (max grade 3). Pinned in
  `wog-commanders.test.ts` ("stat points from the hero's level": the point
  schedule, the spend, the Paladin milestone shift, the legal-action offers).
- **Stats are grades 0–3** (`COMMANDER_GRADE_VALUES`): every stat STARTS at
  grade 0 (the base line A2/D1/H4/dmg0/Pow0/Spd5). A grade's bonus over the
  base is the value shown, never summed with earlier grades: +1/+2 at grade
  I/II; grade III is adjusted per the user spec — Attack +3 (5), Health +4 (8),
  Speed +5 (Initiative 10). Two stats work differently:
  - **Defense = 1/2/2/3** (NOT +3 at III). Grade II is the "+1 def when
    attacked" tier: Defense 2 PLUS a permanent Defense token
    (`commander-defense-token`, `SELF_DEFENSE_TOKEN` — the commander rolls the
    Defend die when attacked, +1 on a "+1" face). Grade III is a reliable flat
    Defense 3 with NO die (the token is on grade II ONLY —
    `COMMANDER_DEFENSE_TOKEN_GRADE`). Pinned in `wog-commanders.test.ts`
    ("Defense grade II Defense token", with grade-I no-token / grade-III no-die
    CONTROLs).
  - **Damage = extra ATTACK DICE, not a flat bonus.** At Damage grade N the
    commander rolls N ADDITIONAL attack dice (0/1/2/3) alongside its normal
    attack die on every attack; each extra "+1" face raises the attack value,
    and AT MOST ONE "−1" counts (`getMightDiceCount` / `mightDiceAttackBonus`,
    rolled once per attack in `finishResolvedAttack` and reused by the
    lethal-save preview). Because they are attack dice they ride the attack
    value BEFORE Defense (they can push through Defense; a fully-blocked hit is
    still 0). Pinned in `wog-commanders.test.ts` (the "Might" case, with the
    "at most one −1" and the push-through-Defense CONTROLs).
  The Magic ladder (user spec — grade 0 buys NOTHING but the cast itself):
  Power **0/0/1/2** (`COMMANDER_GRADE_VALUES.magic`; cast tiers cap at "Power
  2+"), Spell ward **0/1/1/3** (`COMMANDER_MAGIC_SPELL_DAMAGE_REDUCTION` — no
  `reduce-spell-damage-*` id at all at grade 0, `-1/-1/-3` from grade 1),
  ongoing-effect immunity from **grade 1** (`titan-ignore-ongoing`, gate
  `COMMANDER_MAGIC_ONGOING_IMMUNE_GRADE` = 1 — a grade-0-Magic commander is NOT
  immune and takes full Spell damage). So grade 0 = the once-per-round cast
  only; grade 1 = -1 ward + ongoing immunity; grade 2 = +Power 1; grade 3 =
  Power 2 + -3 ward. Pinned in `wog-commanders.test.ts` ("the Magic grade
  package", with grade-0 full-damage / not-immune CONTROLs) and the injection
  test.
- **15 combination skills** (`COMMANDER_COMBOS`, one per stat pair): a combo
  unlocks once ONE stat of its pair is grade 3 and the OTHER at least grade 2
  (either orientation; 2+2 and 3+1 stay locked). Death Stare (DMG+MAG,
  `gorgon-death-stare`) and Charge (DMG+SPD, `commander-charge`) kept their
  original wiring; the other 13 (plan §5, board-adapted): No Enemy Retaliation
  (ATK+MAG, `ignores-retaliation`), Sharpshooter/Can Shoot (ATK+SPD — the
  unit's TYPE flips to ranged in `makeCommanderCombatUnit`, no ability tag),
  Mighty Blow/max damage (ATK+DMG, `MINIMUM_ATTACK_DIE` 1 — the own die always
  counts +1), Endless Retaliation (DEF+HP, `unlimited-retaliation`), Crushing
  Strike/-50% Defense (ATK+DEF, `DEFENSE_REDUCTION_ON_ATTACK` 2), Fearsome
  (ATK+HP, Paralysis on an own "-1" die), Whirlwind Strike (DEF+DMG,
  `SECOND_ATTACK_ALL_ADJACENT_TO_SELF`), Fire Shield (DEF+MAG, passive
  `FIRE_SHIELD_DAMAGE` 1), Block (DEF+SPD, a "-1" defensive die fully blocks
  the hit), Double Strike (HP+DMG, `SECOND_ATTACK_SAME_TARGET_AFTER_
  RETALIATION`), Paralyzing Touch (HP+MAG, extra die "0" Paralyzes),
  Regeneration (HP+SPD, heal 1 on activation), Battle Teleport (MAG+SPD,
  `teleport-move` MOVE_ANYWHERE — the user-spec "can move anywhere in battle",
  replacing WoG's Fly). Each behaviour + a locked CONTROL one grade below is
  pinned in `wog-commander-combos.test.ts`. With ~8 points over a full run one
  combo is comfortably reachable (grade a stat to 3 = 3 points, its partner to
  2 = 2 points) and a second is possible if the builds overlap — a deliberate
  build choice.
- **Deployment cap**: with the module on, `combatUnitLimit` = 4 army units
  (both neutral and PvP setups) — the commander IS the 5th body. Module off =
  the classic 5 (pinned with a CONTROL in `wog-commanders.test.ts`).
- **UI**: the CARD face (`CommanderCardFace`) keeps the classic HoMM3 spell
  icons (`public/assets/spell-icons/`) for the cast/combo chips and overlays the
  REAL stat numbers on the frame wells plus the Might-dice / Power badges. The
  read-only STATS view (`CommanderStatsPanel`, used by the map card AND the
  combat inspect/zoom — `board.tsx` / `zoom.tsx`) instead uses the AUTHENTIC WoG
  comm3 symbols (`public/assets/commander-icons/stat-*.jpg` for the six stats,
  `combo-<tag>.jpg` for the fifteen skills, downloaded from
  heroesofmightandmagic.com/wakeofgods/pics/comds; existence pinned in
  `wog-commander-combos.test.ts`). It spells out each grade bonus (base + grade
  delta), the Defense-token "+1 def when attacked" tier, the Damage DICE, a
  Magic Power ladder with the current tier + spell ward highlighted (grade 0
  reads "cast only — no ward, not immune"), and every combination skill with its
  symbol + full text (render smoke-tested in `commander-card.test.tsx`). Combat
  inspect also shows the Might dice + Power inline. On level-up the map card's
  point picker lists each stat with a plain-words "what you gain" line
  (`gradeUpBenefit`); one click spends one point on a stat and the count ticks
  down. Unspent points pulse/blink the dock tile.
- **Presentation (sfx + animation, all engine-event-driven, tested where pure):**
  the card FACE now carries an animated **rainbow frame spark** (a rotating
  rainbow ring + travelling white spark tracing the border; hidden for a fallen
  commander; `.commanderRainbowFrame` in globals.css). Every command ability
  animates + sounds in combat: `COMMANDER_CAST_USED` (the activation cast AND the
  Shield / Stone Skin reaction) reuses the matching H3 spell's sprite + sound
  over the target via `commanderCastFxPlan` (`src/data/commander-fx.ts`, Animate
  Dead falls back to a heal shimmer), and `COMMANDER_SPECIALTY_TRIGGERED` plays a
  themed sting (`commanderSpecialtySound`) — both wired in `page.tsx`'s combat FX
  loop; the mapping is pinned in `commander-fx.test.ts`. A hero level-up that
  awards commander points fires `COMMANDER_POINTS_AWARDED` and pops a celebratory
  **level-up popup** (`CommanderLevelUpOverlay`, slam-in + fanfare) carrying the
  clearer `CommanderLevelUpPicker`: one clearly-separated, per-stat-accent-
  coloured option showing the grade jump, the numeric value change and the
  benefit (render + click tested in `commander-card.test.tsx`).
- **Battlefield voices**: a commander has no unit definition, so its combat
  voice is keyed by slug in `commanderVoices` (`unit-sounds.ts`,
  `commanderSoundKey`); the table passes `commander:<slug>` as the voice id
  (`commanderVoiceId`) and `unitSoundKey` routes it. Per the user spec:
  Castle=Swordsman, Rampart=Monk, Tower=Sorceress(Sea Witch), Inferno=move
  Gargoyle/hurt-death-defend Pixie/attack Magi, Dungeon=Minotaur,
  Necropolis=move Zombie/hurt-defend-death Lich/attack Lich-melee,
  Stronghold=Ogre, Fortress=Gnoll, Conflux=hurt-death-defend Pixie/move-attack
  Efreet, Factory=Cove Seamen, Cove=Sea Dogs, Bulwark=Jotunns. Pinned in
  `unit-sounds.test.ts`.
- **Specialty adaptations** (each engine-enforced, but a conscious rewrite of
  the WoG printed passive): Paladin Wise = the two MILESTONE (2-point) level-ups
  come early, at hero level 2 & 5 instead of 3 & 6 (not 150% XP); Temple Guardian
  Mana Magician = twice per COMBAT a Spell may
  exceed the per-round limit (this game has no mana pool; a burned charge
  converts into `spellLimitBonusThisRound` so the limit never dips below the
  count); Brute Soul Reformer = flat +2 gold after each WON combat (no XP→gold
  pools); Soul Eater Undead = Paralysis-token immunity; Shaman Superior Combat
  AND Sea Marshal Battle Stance = the owner picks the commander's combat stance
  (+1 Attack OR +1 Defense) on the commander card OUTSIDE combat, baked into the
  unit at each combat's setup (default +1 Attack; `commander.stance`); Astral
  Spirit **Elemental Scourge** = at the start of a combat vs neutral units,
  EVERY enemy neutral unit takes 1 damage (`applyElementalScourge`, effect
  damage through the normal removal path, every neutral combat incl. banks —
  this REPLACED the old "Pacifist" flee specialty; pinned in
  `wog-commanders.test.ts` with a module-off and a non-Conflux CONTROL); Rune
  Keeper Rune Ritual = +1 Rune EVERY time the commander is attacked AND +1 EVERY
  time it MOVES (`applyCommanderRuneRitual` on the attack, `applyCommanderRuneOnMove`
  in `moveUnit`; NO once-per-combat cap any more — user spec "when he move or get
  attacked, also gain rune +1"; retaliations don't count as being attacked;
  pinned in `wog-commanders.test.ts` with a Paladin CONTROL for both halves);
  Hierophant First Aid = post-combat window restoring ONE bronze/silver
  casualty (died card returns — a Neutral-side card is pulled back OUT of its
  tier discard so it is never duplicated; a Pack that fell to Few flips back);
  Ogre Leader Ballista Master = the player aims the Ballista's round-start
  shot (the Gerwulf `BALLISTA_CHOOSE_TARGET` freedom, granted passively);
  Artificer Tinkerer = war machines cost 5 less gold (min 0) at both shops.
- **Roster renames** (user spec): Cove Corsair → Sea Marshal, Factory Engineer
  → Artificer, Bulwark Frost Warlord → Rune Keeper (slugs/assets unchanged).
- **Commander scope**: it fights ONLY the main hero's combats (garrison
  defenses and secondary-hero fights get none), is AUTO-placed at combat start
  (own backline first, then frontline; bank fights use the six central cells)
  rather than hand-placed, enters every combat at full health, and only DEATH
  persists (revive anywhere on your map turn for 2 + 2x hero level gold).
- **Tierless both ways** (bank-guard convention): tier-gated spells (Blind…)
  never target a commander, and the neutral AI hits it LAST.
- **Ongoing-effect immunity is a Magic grade-1+ perk** (titan-style, gate
  `COMMANDER_MAGIC_ONGOING_IMMUNE_GRADE` = 1): from grade 1 even FRIENDLY ongoing
  buffs skip the commander, so the buff-type command casts exclude an
  ongoing-IMMUNE commander from their target lists up front
  (`commanderUnitImmuneToOngoing`). A grade-0-Magic commander is NOT immune — an
  ongoing cast (e.g. an enemy Slow) CAN land on it, and it takes full Spell
  damage; the cast-candidate exclusion and the effect application both key off
  the actual immunity, pinned with grade-0 CONTROLs in `wog-commanders.test.ts`
  and `wog-commander-casts.test.ts`. Tokens are NOT ongoing effects — a commander
  can still be Paralyzed (unless Soul Eater).
- **Cast readings**: the cast is once per combat round, FREE during the
  commander's own activation. Per the user spec a cast ENDS the commander's
  MOVEMENT for that activation (it may still attack, but no longer move —
  `movementLockedThisActivation`, gated in `getLegalMoveDestinations` so
  MOVE_UNIT / MOVE_AND_ATTACK / the Battle-Teleport MOVE_ANYWHERE are all
  blocked; pinned in `wog-commander-casts.test.ts`). The lone EXCEPTION is the
  two **instant-reaction** defend buffs below, which are played off-turn and
  never touch movement.
  Cure's cleanse removes ALL negative tokens+effects (not one); Animate Dead
  heals a flat 2 (the bronze/silver/gold ladder IS the Power scaling);
  Counterstrike = unlimited retaliation for the round (tier-laddered);
  Haste/Slow riders compare effective Initiative at attack time (+1 vs slower
  / -1 vs faster, on the buffed/slowed unit's own attacks); Fire Shield
  durations are 1 round / whole combat / 2 rounds by Power; Rune Mend spends
  the per-combat Rune pool (1/2/2 → heal 1/2/3) and never revokes an
  already-latched Rune Level (that pool is add-only by design); Field Repair's
  "mechanical" = the engine's `isMechanicalUnit` (Factory Automatons /
  Dreadnoughts); Shield shares the Shield SPELL's `DEFENSE_VS_ATTACKER_TYPE`
  semantics (a ranged-TYPE unit attacking adjacent is still not "melee").
- **Hierophant Shield & Ogre Leader Stone Skin are INSTANT REACTIONS**, NOT
  activation casts (user spec "the defend buff of 2 commanders is instant
  reaction"). Keyed off `commanderCastIsInstantReaction` (`effect.kind ===
  "defense-buff"`): removed from the activation offer (`commanderCastAvailable`
  returns false for them) and instead offered to the ATTACKED unit's controller
  in the open attack window (`commanderDefenseReactionUnit` →
  `USE_COMMANDER_CAST_REACTION`, resolved via `applyCommanderCastReaction` +
  `advanceReactionWindowAfterPlay`). They buff the attacked unit's Defense
  BEFORE the hit resolves (a `current-combat-round` effect folds into the
  triggering attack, like Interference), stay once-per-combat-round, cost no
  activation and never lock movement. Shield (vs melee) is NOT offered against a
  ranged-TYPE attacker (its `DEFENSE_VS_ATTACKER_TYPE` would do nothing); Stone
  Skin (vs all) is offered against any attacker. Pinned in
  `wog-commander-casts.test.ts` with a pass-the-reaction CONTROL, the melee-only
  gate, and a once-per-round CONTROL.
- **Dungeon Brute Bloodlust (melee) & Tower Temple Guardian Precision (ranged)**
  now scale Pow 0 = +1 (target must be ADJACENT to the commander), Pow 1 = +1
  (anywhere), Pow 2 = +2 (anywhere), always THIS round only
  (`adjacentBelowPower: 1`, `amountByPower: [1, 1, 2]`; user spec). Precision
  keeps its "ignore ranged penalties" rider. Pinned in
  `wog-commander-casts.test.ts` (targeting-adjacency + amount, each with a
  no-cast CONTROL).
- **Might (Damage grade)** rolls N EXTRA attack dice (N = Damage grade 0/1/2/3)
  on the commander's attacks AND retaliations, folded into the attack value
  beside the normal die (each "+1" raises the attack; at most one "−1" counts).
  Because they are attack dice they interact with Defense and stay under
  per-attack damage caps (Cove Nix). Charge fires on its own attacks after
  moving, never on retaliations. Death Stare reuses `gorgon-death-stare`
  verbatim (2 dice, double "-1" destroys the side). The ATTACK_ROLLED event
  carries the extra dice as `mightRolls` so the combat UI can show them.
- The commander COUNTS for win/loss (`livingControllerIds`): an army can fight
  on through its commander, and killing a side needs the commander dead too.
- **Empty unit deck vs the commander (2026-07 fix, house rule)**: the BINH
  "empty unit deck is replaced with the starting units" restock is WITHHELD
  while a commander that stood in the fight SURVIVED it — the commander must
  fall too (`restoreStartingArmyIfEmpty`'s `commanderStandsIn` option, fed by
  `finalizeCommandersAfterCombat`'s survivor set at both combat-END seams and
  by `commanderMarchesWithHero` at the combat-START seams). A main hero with an
  EMPTY deck therefore fights commander-only: combat setup offers "Ready for
  battle (commander only)" with zero placed units
  (`commanderStandsInCurrentCombat` relaxes `finishCombatPlacement` + the
  legal-actions offer). This also fixed the First Aid duplication bug: the
  restock plus the Hierophant/Belfast revive used to put TWO copies of the same
  casualty into the deck. DELIBERATE LIMIT: a fight the commander cannot join
  (secondary-hero fights, garrison defenses) keeps the classic combat-start
  restock — setup needs a placeable body there. Pinned in
  `wog-commanders.test.ts` ("empty unit deck restock requires the commander to
  fall too" + "commander-only combat start"), each claim with a CONTROL,
  mutation-checked.
- `COMMANDER_GRADE_UP` / `REVIVE_COMMANDER` / `COMMANDER_FIRST_AID` are
  handler-validated actions (self-validating; usable outside combat without a
  legal-actions membership match). While `pendingCommanderFirstAid` is open,
  the owner's map actions are gated to answering it (Necromancy-style);
  `eliminatePlayer` clears an eliminated seat's window.

### WOG Artifacts (optional module, BINH-only) — what runs vs. adaptations

Lobby `WogModOptions.artifacts` (default OFF; gated exactly like `commanders` —
active only when `wog.enabled && wog.artifacts`). Five ORIGINAL, board-adapted
"Wake of Gods" hero Artifact cards in `src/data/wog/artifacts.ts`; deck-join in
`makeSharedDecks` (a `withWog(...)` beside the anime `withAnime(...)`, gated on
`wog.enabled && wog.artifacts`), library registration in
`src/data/cards/library.ts` (ALWAYS registered so lookups resolve; deck-join
only when on). Behaviour pinned in `src/engine/wog-artifacts.test.ts`
(observable outcomes + CONTROLs, each fails if its wiring is removed) and data/
art hygiene in `src/data/wog/wog-artifacts.test.ts`.

Leading with what does NOT run / adaptations: WoG's printed artifacts carry
per-victory INCREMENTAL bonuses and special behaviours (transform one artifact
into another, lock a Town, summon a dragon, …) — NONE of that is modeled. Each
card is a clean REUSE of an already-wired arm (no new engine rule), with the WoG
flavour as its name/art only. Art is the committed manual-derived faces at
`public/assets/wog/artifacts/<slug>.webp` (no rules text on the face, no
placeholder registry — all five ship with real art). Commander-specific
artifacts arrive in a LATER task and are NOT part of this module.

What runs (each mutation-checked; default OFF ⇒ byte-identical Artifact decks):
- **Magic Wand** (minor, mapOnly instant) — remove the card (leaves the game) to
  Search (1) the Artifact deck (`CARD_DECK_SEARCH`, Surcoat-of-Counterpoise arm).
- **Gate Key** (minor, instant) — +1 movement, OR remove for +2 movement
  (`GAIN_HERO_MOVEMENT`, Boots family — so also offered as a neutral-combat
  continue-window movement top-up).
- **Crimson Shield** (major, defender reaction) — +2 defense, OR remove for +3
  (`ADD_COMBAT_STAT` on `UNIT_ATTACK_DECLARED`/opponent).
- **Warlord's Banner** (major, attacker reaction) — +2 attack, OR remove for +3
  (`ADD_COMBAT_STAT` on `UNIT_ATTACK_DECLARED`/self).
- **Dragonheart** (relic, attacker reaction) — +3 attack, OR remove for +5
  (same arm, relic-tier numbers). The remove side leaves the game (→ `removed`,
  never the discard) — pinned by an explicit zone assertion.
The three reactions ride the SAME per-tier split/legacy Artifact decks and
tier/uniqueness gates as core artifacts; the relic shares the core relic deck's
level/source access gate. Cross-mod (§3.8): the WOG and anime Pháp Bảo artifact
sets join those same shared decks side by side (the deck-join composes
`withWog(withAnime(...))`), neither displacing the other nor the core cards —
pinned by the both-mods-on deck-join tests in `wog-artifacts.test.ts` and by the
all-on coexistence soak (`anime-coexistence-soak.test.ts`, `artifacts: true` in
the every-WOG-module config).

### WOG New Objects (`wog.newObjects`, BINH-only) — what runs vs. adaptations

SEVEN authentic-WoG adventure-map objects shipped as single-hex **Field
Overrides** (the GLOBAL override mechanism — `src/data/wog/field-overrides.ts`
registers the 7 kinds as package `"wog"`, `src/data/wog/locations.ts` merges
their locations into `locationDefinitions`; the dynamic/context-filtered visit
menus are built in `beginFieldVisit`'s `buildWogFieldVisitStep`, mirroring the
anime package). Default OFF ⇒ byte-identical (the wog package returns false from
`fieldOverridePackageAllowed` unless `wog.enabled && wog.newObjects`, so no pool
membership, no palette surprise). Behaviour pinned in
`src/engine/wog-objects.test.ts` (each claim mutation-checked, with CONTROLs).

Leading with what does NOT run / deliberate adaptations:
- **Only 7 of WoG's many scripted objects ship.** God's Altars beyond the one
  below, the Colosseum, Fishing Wells' variable catch, etc. are NOT modeled;
  each shipped object is a board-adapted READING (the printed `summary` states
  exactly the wired effect).
- **Emerald Tower's creature-enchanting is REPLACED by commander/hero training.**
  WoG's tower enchants a creature stack; here it is guarded (difficulty Ⅲ,
  stamped via the registry's `guard`) and, after the win, opens a City-Hall-style
  CHOOSE_ONE: "Pay 3 gold: +1 commander stat point" — offered ONLY when
  `wog.commanders` is on AND the visitor has a commander (context-filtered arm
  absent otherwise) — via the SAME `commander.gradePoints` bump +
  `COMMANDER_POINTS_AWARDED` event the level-up uses (the point is then spendable
  through `COMMANDER_GRADE_UP`); "Pay 2 gold: +1 hero experience" through the
  normal `gainExperience` pipeline (level-ups, bumps ride it); or Leave. Both
  paid arms are PAY_TO (gold-gated at offer AND resolution). As a REVISITABLE hex
  the beaten guard is cleared on the win (the FO branch of the beginFieldVisit
  guard-clear) so re-entry is a peaceful menu, not a re-fight.
- **Mirror of the Home-Way is a flat pay-2-gold Town teleport** (WoG's full
  Town-Portal price/movement table is NOT modeled). Visit: "Pay 2 gold: teleport
  to one of your Towns/Settlements" (the visitor picks when several are reachable,
  reusing the Town-Portal `TELEPORT_HERO` machinery) or Leave; with no reachable
  Town (zero owned, or every destination occupied by another hero) the pay arm is
  absent. No free teleport without paying; arrival never re-triggers.
- **Junk Merchant is tier-priced sells + a paid search** (WoG's 32-artifact fixed
  trade table is NOT modeled). Visit CHOOSE_ONE: one "Sell <artifact> (<tier>):
  gain N gold" arm per hand Artifact — minor 2 / major 3 / relic 4, the card
  leaving the game (Trading-Post sell semantics: hand → removed pile), the whole
  sell set absent with no Artifact in hand — plus "Pay 4 gold: Search (1) the
  Artifact deck" (the shared-deck search pipeline, so the normal BINH tier gates
  apply) and Leave.
- **Fishing Well is a fixed Attack-die gamble** (WoG's variable catch is NOT
  modeled). A STATIC `PAY_TO(1 gold)` → `ATTACK_DIE_TABLE` (no dynamic menu —
  the interaction lives on the location def, like the anime Gambling Den): +1 →
  +1 valuables, 0 → 2 gold back (net even), −1 → nothing. Revisitable, once per
  visit; a broke hero / decline pays nothing.
- **Living Skull is a Listen/Smash CHOOSE_ONE with a permanent destruction
  latch** (WoG's scripted lore is NOT modeled). "Listen" = Search (1) the Ability
  deck (repeatable). "Smash" = +2 gold, then the new `SMASH_WOG_SKULL` leaf sets
  `field.wogSkullSmashed` — the hex is INERT for EVERYONE thereafter (no menu on
  any later visit, any player). The latch mirrors `centerHexClaimed`.
- **Adventure Cave is an escalating repeatable fight** (WoG's dungeon crawl is
  NOT modeled). Guarded Ⅰ on first entry; each WIN pays a scaling reward (win 1:
  +3 gold, win 2: a Treasure die, win 3: Search (1) the Artifact deck) and
  RE-GUARDS one difficulty higher (Ⅰ→Ⅱ→Ⅲ, `applyCustomGuardToField`) — after the
  3rd win it is cleared for good (`clearCustomGuard`). `field.wogCaveWins` counts
  the wins; the whole reward/re-guard flow is `handleWogAdventureCaveVisit` in
  `beginFieldVisit`, BEFORE the generic FO guard-clear (which would just clear it).
  All reward leaves are auto-resolving so a computer win never parks on a window.
- **Altar of the Gods is a pay-3-valuables blessing** (WoG's full sacrifice table
  is NOT modeled). `PAY_TO(3 valuables)` → CHOOSE_ONE: +1 morale, +2 hero XP
  (`gainExperience`), or — only with `wog.commanders` on AND a commander — +1
  commander stat point (`GAIN_COMMANDER_POINTS`). Plain revisitable (1 MP); NO
  per-round latch (deliberate — the 3-valuables cost gates each visit).
- **Commander-artifact BONUS on reward locations** (user spec "some location that
  gives rewards also adds a bonus commander artifact along with it"): with
  `wog.enabled && wog.commanders` on and a commander present, the **Emerald
  Tower** guard win AND the **Adventure Cave** 3rd win ALSO drop ONE random
  NOT-in-play commander-artifact card into the winner's hand (the normal bindable
  card — unchanged bind flow). `freeCommanderArtifactCardIds` scans every player's
  hand/discard/deck/removed, every commander's bound slots, AND every shared deck
  draw/discard pile (so a `wog.artifacts` deck-join copy is never duplicated); if
  all 8 are in play the grant is a no-op with a feed note. `grantCommanderArtifactReward`
  in `beginFieldVisit`.
- **Art: only Emerald Tower's hex sprite is an authentic WoG scan**; the other
  six (Mirror, Junk Merchant, Fishing Well, Living Skull, Adventure Cave, Altar of
  the Gods) are codex-generated late-90s-HoMM3-style hexes. All seven ship WITH
  512×512 webp art on disk (`public/assets/wog/field-overrides/<slug>.webp`), so
  NO glyph placeholder is registered (art wins).

What runs (each with a failing-if-removed test in `wog-objects.test.ts`): the
7 kinds register under package `"wog"` with art on disk and locations in
`locationDefinitions`; pool/palette listing includes wog kinds ONLY with
`wog.enabled + newObjects` (CONTROLs: each flag off; anime-on-but-wog-off does
NOT leak wog kinds; both-on lists BOTH packages — coexistence); a carved wog hex
is Location-Token-protected; every visit effect above with its CONTROLs (the
gamble branch table keyed off the rolled face, the skull latch inert-for-a-second-
visitor, the cave Ⅰ→Ⅱ→Ⅲ ladder + stays-cleared, the altar's commander-gated arm,
the commander-artifact grant with a commanders-off / all-in-play / held-copy
CONTROL); a wog designer pin survives the map-registry sanitize round-trip and
auto-enables `wog.enabled + newObjects` at setup (`customMapHasWogFieldOverridePins`,
mirroring the anime pins twin at the three `adventure-setup.ts` sites). The
all-on coexistence soak (`anime-coexistence-soak.test.ts`) runs `newObjects:
true`; AI seats meet the wog objects and the generic visit-menu scoring resolves
every arm (the leaves `GAIN_COMMANDER_POINTS` / `SELL_HAND_ARTIFACT` /
`SMASH_WOG_SKULL` are auto-resolving — kept OUT of `stepNeedsInput`; the cave's
reward leaves too).

## Unit Experience / veterancy (OPTIONAL rule; lobby toggle + WOG module + anime module) — what runs vs. limits

Board adaptation of the WoG Unit Experience System (UES; ues.shtml + the
CREXPBON table). THREE equivalent surfaces activate ONE shared engine flag,
frozen onto `adventure.unitExperience` at setup: the lobby
`GameSetupOptions.unitExperience` (Game options → Optional systems, default
OFF), `wog.enabled && wog.unitExperience` (WOG Mod options row), and
`anime.enabled && anime.unitExperience` (types + resolution only — like the
other anime flags there is no anime lobby UI yet). Data in
`src/data/units/experience.ts`, engine read layer in
`src/engine/unit-experience.ts`, wired through `makeCombatUnitFromArmy` +
`applyUnitCurrentSide` (stat/ability folds), `finalizeAdventureCombat` (the XP
award), the reducer/legal-actions (`DRILL_UNIT`) and every Few→Pack / Stack
upgrade site (dilution). Behaviour pinned in `src/engine/unit-experience.test.ts`
(off/rank/lost-fight CONTROLs; the award call, the attack fold and the
rank-ability grant are mutation-checked), UI in `unit-rank-badge.test.tsx`,
`board.test.tsx` ("veteran-rank badge") and `game-options-tabs.test.tsx`.

Leading with what does NOT run / deliberate limits:
- **Quick Combat trains nobody** — the army never deploys, so an auto-win pays
  no unit XP. Fighting a battle out by hand is the deliberate way to drill
  troops (a real strategic trade-off, documented, not a bug).
- **Clone tokens and Sandro's-Cloak covers ignore ranks**: a Clone is built as
  a fresh XP-less copy (the existing `permanentAttackBonus` precedent), and a
  specialty cover replaces stats wholesale, suppressing the rank folds while it
  is on top (same read as the permanent bonuses).
- **Every unit has its own rank SCHEDULE** (`rankScheduleFor`): a unique one
  where authored (`UNIT_RANK_SCHEDULES`), else a flavour-template fill
  (`FLAVOUR_ABILITIES`). A schedule is 4 steps, each EITHER stats OR one
  ability (never both), matching one of three templates — standard (1 ability),
  strong (2), rare (3). Ability ranks draw from `ELITE_UNIT_RANK_ABILITIES` /
  `LEGEND_UNIT_RANK_ABILITIES` plus the track pools; every granted id REUSES an
  already-implemented ability (no new engine effects; registry hygiene — real
  unit, implemented, not already printed on the side — is pinned by test).
- **The Hierophant First Aid flip-up never dilutes** — it restores THIS
  battle's own casualties, not fresh recruits (the one reinforce-shaped
  exception, pinned with the reinforce halving as its control).
- **The AI drills from surplus gold** (`map-policy.ts` DRILL_UNIT, score ~325+
  when gold ≥ 10) and prefers silver/gold bodies; it is still not a full
  veterancy planner (no multi-round XP dilution strategy).
- **Badge art now ships as real webp icons**: per-rank badges
  (`/assets/ui/unit-rank-{seasoned,veteran,elite,legend}.webp`,
  `unitRankBadgeImage`) and per-ability icons (`/assets/ui/rank-ability/*.webp`,
  `unitRankAbilityIcon`) — Codex-generated, drawn on the badge / board window
  (the old CSS carets are the text fallback).

What runs (each with a failing-if-removed test):
- **XP awards (WoG "survivors of a hero-led won battle train")**: after a WON
  combat the winner's surviving DEPLOYED army cards each gain XP — neutral
  guard fights pay the Field Difficulty, Creature Banks pay max(2, Stacked
  count), PvP wins pay a flat 2 (`unitExperienceForWonCombat`). Dead cards,
  undeployed cards, summons/temporaries/commanders and the loser get nothing;
  each card is awarded once (clone-safe Set). XP rides the CARD
  (`ArmyUnitState.experience`) and survives Pack→Few casualty flips.
- **Four named ranks 1–4 (Seasoned / Veteran / Elite / Legend) with tier-scaled
  thresholds** (`UNIT_RANK_NAMES`, `MAX_UNIT_RANK` = 4, `UNIT_RANK_THRESHOLDS`):
  bronze 3/6/10/14, silver 4/8/13/18, gold/azure 5/10/16/22 — higher tiers rank
  slower. Stats accumulate ONLY on a schedule's stats ranks, drawing the tier's
  ordered `UNIT_STAT_STEPS` (bronze +Def / +Atk / +Health&Init; silver +Def /
  +Atk / +Health; gold/azure +Atk / +Def / +Health), so a rank spent on an
  ability adds no stats. Folded at combat-unit build AND on every mid-combat
  printed-side recompute, so a Pack→Few flip keeps its rank.
- **Abilities at the schedule's ability ranks** (not fixed at one rank): each
  ability rank grants ONE not-already-printed id from that unit's schedule step
  (e.g. Champions `ignores-retaliation`, Behemoths `wog-nightmare-fear`,
  Phoenixes `wog-fire-shield-1`, Nagas/Cerberi/Hydras `unlimited-retaliation`,
  Jotunns `reduce-spell-damage-1`, Dreadnoughts `ignore-paralysis`), appended to
  the unit's runtime `abilities` (deduped) by `withRankAbilities` — never edits
  printed card data, so the ability-text enforcement invariant is untouched.
- **Dilution (WoG Crexpmod "upgrades cost experience")**: reinforcing Few→Pack
  HALVES the card's XP at every reinforce site (settlement, Hill Fort, town
  Population batch, the shared `reinforceArmyUnit` helper, and the mid-combat
  Summon-Demons reinforce, which re-syncs the fighting unit's folds); each
  purchased Polish Unit Stack layer costs 1 XP. Every dilution emits
  `UNIT_XP_DILUTED` so the loss is never silent.
- **Drill (new board mechanic)**: `DRILL_UNIT` — with the main hero in an OWN
  Town, pay 2 gold for +1 XP on one army card, once per own turn; maxed cards
  are not offered. Handler-validated like HERO_TRAIN; `UNIT_DRILLED` event.
- **Presentation**: `UNIT_RANK_UP` / `UNIT_DRILLED` / `UNIT_XP_DILUTED` feed
  lines (`formatEvent`); rank badges on army rows (`ArmyPanel`, with the
  rank-FOLDED stats and an XP-progress tooltip), on combat cards
  (`board.tsx`, mirrored `unitRank`/`unitExperience`) and in the zoom/inspect
  lines (`zoom.tsx`).
- **Default OFF ⇒ byte-identical**: with the rule off no card ever carries
  `experience`, so every fold is an exact no-op and no award/dilution/Drill
  runs (off-CONTROLs pinned; legacy snapshots unaffected).

## Neutral Rank-Up (OPTIONAL, WOG/anime flag) — what runs vs. limits

An OPTIONAL module where NEUTRAL guard units gain the EXISTING Unit-Experience
veteran ranks as the game ages, and Creature-Bank Stacked defenders fight one
rank up. ONE boolean, two module surfaces resolving to ONE frozen adventure
field (mirroring the `unitExperience` precedent):
`WogModOptions.neutralRankUp` (active when `wog.enabled && wog.neutralRankUp`)
and `AnimeModOptions.neutralRankUp` (active when `anime.enabled &&
anime.neutralRankUp`; types + resolution only, no anime lobby UI), frozen onto
`adventure.neutralRankUp` at setup (`neutralRankUpOn` in `adventure-setup.ts`;
absent/undefined = OFF for legacy snapshots). Lobby: ONE row in the WOG Mod
options window (`screen.tsx`). It REUSES the veterancy machinery verbatim (no
parallel rank table): `unitRankFold` / `combatUnitRankFold` / `withRankAbilities`
+ the tier-scaled `UNIT_RANK_THRESHOLDS` + `UNIT_STAT_STEPS` + per-unit
schedules. Read layer + constants in ONE place: `src/engine/unit-experience.ts`
(`NEUTRAL_ROUNDS_RANK_CAP` = 2, `NEUTRAL_STACK_RANK` = 1, `neutralRankUpActive`,
`neutralRoundsRank`, `neutralRoundsMirrorXp`, `applyNeutralRoundsRank`,
`neutralStackRankFold`). Behaviour pinned in `src/engine/neutral-rank-up.test.ts`
(every claim mutation-checked; both folds independently mutation-verified) +
the badge in `src/components/table/board.test.tsx` + the lobby row in
`src/components/adventure/game-options-tabs.test.tsx`.

Leading with what does NOT run / deliberate limits:
- **Quick Combat and the polish-quick-combat strength read DELIBERATELY ignore
  ranks** — a level auto-win / a strength-covered Quick Combat still resolves
  before any guard acts, exactly like the existing "veteran ranks ignored" line.
  The module makes a FOUGHT-OUT fight harder, never a skipped one.
- **The AI engagement heuristics ignore ranks** — the map policy still reasons
  by field difficulty / level, so a computer hero may walk into a now-harder
  fight; it just fights it (no bespoke rank-aware avoidance).
- **XP/reward for beating a ranked guard is UNCHANGED** — rewards are
  difficulty-based; the fold raises guard STATS only and never touches
  `combat.context.difficulty` (pinned: "reward driver is UNTOUCHED").
- **Banks are EXCLUDED from the ROUNDS half** — a Creature-Bank defender never
  round-ranks (their own-stats balance is separate); `applyNeutralRoundsRank`
  no-ops on any `bankUnit` (pinned at round 12). Banks carry only the STACKS
  half, and the two never stack.
- **Rounds 1-3 are COMPLETELY unchanged even with the module ON** — virtual XP
  = `round - 1` is below every tier's first threshold, so `applyNeutralRoundsRank`
  is a no-op (round-1 CONTROL identical to off).
- **No map-side preview beyond the combat badge** — the ranked guard's veteran
  badge renders on its COMBAT card (the same `unit.unitRank` badge player armies
  use, in `board.tsx`) so the player sees it at placement; there is no new
  map-hex rank marker. The lobby row's description is the discovery surface.
- **Sandbox / PvP / summons untouched**; the computer guaranteed-win smoothing
  still auto-wins its two eligible fights (the win wipes the ranked guards at
  combat-start regardless — pinned). Under PvP-Neutral-Control the controlled
  guards DO fight ranked (emergent — the controller simply drives stronger
  guards).

What runs (each with a failing-if-removed test):
- **ROUNDS half** (mid-game ramp): at the ONE non-bank mint seam
  (`revealNeutralArmy` in `adventure-reducer.ts` — plain neutral cards,
  Random-Town faction packs AND designer level/exact armies all funnel through
  it) every guard is folded to `min(NEUTRAL_ROUNDS_RANK_CAP, rankForXp(tier,
  round-1))` via `applyNeutralRoundsRank`. Tier-scaled: bronze Seasoned r4 /
  Veteran r7, silver r5/r9, gold+azure r6/r11. The stat/ability delta is the
  SAME player veterancy grants (observable: a round-7 bronze guard's Defense
  rises by the Veteran fold and the rank ability is appended). It CAPS at
  Veteran (round-30 bronze is still rank 2, Attack unchanged — no Elite/Legend
  leak) by mirroring a CAPPED virtual XP onto `unit.unitExperience`
  (`neutralRoundsMirrorXp` clamps below the rank-3 threshold), so a mid-combat
  Random-Town Pack→Few recompute (`applyUnitCurrentSide` → `combatUnitRankFold`)
  reproduces the exact capped rank.
- **STACKS half**: a Creature-Bank defender CARRYING a Stack Token fights at
  `NEUTRAL_STACK_RANK` (Seasoned), folded in the bank-recompute branch of
  `applyUnitCurrentSide` (`unit-transforms.ts`) keyed off the UNDERLYING unit
  def's tier/schedule (`neutralStackRankFold` — bank draws mint `tier:
  "bronze"`, so the card's own grade is ignored). The `neutralRankUp` flag is
  threaded there via `unitSideRuleOverrides` (`ruleset.ts`); the fold is gated
  on the LIVE token, so absorbing it (`markUnitRemovedIfNeeded`, stackToken →
  null) reverts the defender to a plain bank card. The Stack-Token +1 stat and
  the lethal-blow absorb are UNCHANGED (the rank is on top). Threads through the
  real `buildCreatureBankCombatUnits` (pinned with Polish size 4 = all-Stacked).
- **Default OFF ⇒ byte-identical**: neither half is reached (the freeze leaves
  `adventure.neutralRankUp` absent, `neutralRankUpActive` false, the bank
  override false), so no fold runs — an exact-equality CONTROL.

## Calamity Waves · Raid Bosses · The Dungeon (OPTIONAL modules, WOG + anime surfaces) — what runs vs. limits

Three PvE-pressure modules from the anime plan (§6.6 / §6.5 / §6.7.3), each with
TWO tick surfaces resolving to ONE frozen adventure field (the
`unitExperience`/`neutralRankUp` precedent): `wog.monsterWaves|raidBosses|dungeon`
(rows in the WOG mod window) and `anime.monsterWaves|raidBosses|dungeon` (rows in
the Anime mod window; these anime flags existed as unshipped types and are now
SHIPPED). `waveCadence` (3|4|5, chip row shown while waves are ticked, default 4)
exists on both option types; the designed-map preset override wins. SIX shared
PvE settings ride the same two surfaces (chip rows / theme cards in both mod
windows, `pve-content.ts` labels; sanitised in `setGameOptions` for wog and in
`resolveAnimeOptions` for anime): `pveTheme` ("classic" | "doom" | "random",
default classic), `wavePressure` ("standard" | "brutal", default standard),
`waveDefeatLimit` (0 | 2 | 3, default 0 = no elimination),
`raidBossSpawnRound` (4|5|6, default 5), `dungeonDepth` (5|10, default 10) and
`dungeonDescentCost` (0|1|2 movement, default 1). A DESIGNED MAP may direct all
of them from its own preset (`preset.pveTheme`, `preset.monsterWaves.{cadence,
pressure,defeatLimit}`, `preset.raidBosses.spawnRound`, `preset.dungeon.{maxFloor,
descentCost,floorBosses}`) — designer-first at every read, sanitised by
`sanitizeCustomMapPreset` (so the map-registry save/load round-trip carries them)
and surfaced in the map-pick banner by `describeCustomMapPresetEntries`. Default
OFF ⇒ byte-identical (legacy snapshots unaffected; every frozen field is stamped
only when it differs from the historical default). Engine:
`src/engine/pve-content.ts` (theme resolution, the wave battle-event rotation,
the pressure profile, the themed field art path) + `monster-waves.ts` /
`raid-bosses.ts` / `dungeon.ts` (pure helpers, incl. `dungeonFloorCapOf` /
`dungeonDescentCostOf`) + `combat-board-art.ts` (`isPveEncounterCombat` and the
two theme-locked battlefields) +
wiring in `adventure.ts` (round-start hooks, gate/lair/dungeon visits,
pillage/rewards, `drawPveThemedArmy`), `adventure-reducer.ts` (assault/lair/floor
combat opens, the wave battle-event fold at reveal, the placement→draw seam
branches, finalize outcome routing), `combat-units.ts` (boss layer shed +
layer-break payout). Boss data: `src/data/anime/bosses.ts`. Behaviour pinned in
`monster-waves.test.ts`, `raid-bosses.test.ts`, `boss-abilities.test.ts`,
`dungeon.test.ts` (every claim mutation-checked with off/side CONTROLs), the
lobby rows in `game-options-tabs.test.tsx`, the designer sections in
`map-preset-editor.test.tsx`, the board art in `board.test.tsx`, and all three
flags run in the all-on `anime-coexistence-soak.test.ts`.

Leading with what does NOT run / deliberate limits (ALL three):
- **No guild rank points, no fate/karma** (those modules are unshipped — the
  plan's "+1 rank point" / "fate" reward clauses are dropped, stated here).
- **A CLASSIC-theme wave/boss/floor army is a core-neutral draw**
  (`isekaiNeutrals` is unshipped; the plan itself names this fallback): a real
  `NEUTRAL_ARMY_TABLE` level draw from the live tier decks, recycled at combat
  end like any guard.
- **A DOOM-theme army is MINTED, not drawn.** `drawPveThemedArmy` mints seeded
  `doom.*` cards straight from `DOOM_UNIT_IDS_BY_TIER` with `bankGuard: true`
  (verified: the doom units are ALWAYS in `coreUnitDefinitions`, so they mint with
  real stats even with the separate "Doom neutrals" DECK option off). What
  `bankGuard` buys, and all it buys: the minted copies are never recycled into a
  shared Neutral discard pile at combat end (there is no physical card), and the
  pre-battle draw-swap / redraw windows that only operate on DECK-DRAWN guards
  see nothing to swap. It does NOT make the unit gradeless — that is `bankUnit`,
  which a themed draw does not set — so a doom guard keeps its printed tier:
  tier-gated spells still reach it, the neutral AI still targets by tier, and
  Neutral Rank-Up still round-ranks it, exactly like a classic draw.
- **A designed map's `preset.pveTheme` WINS over both mod windows** — and the
  mod-window theme card is NOT repainted to say so: it keeps showing the lobby's
  own pick while the game plays the map's theme (a UI honesty limit shared with
  `waveCadence`; the map's theme IS named in the map-pick banner, "PvE theme:
  Doom invasion"). "Lobby" is the editor's default card (field absent ⇒ the
  lobby pick stands). Pinned in `monster-waves.test.ts` ("the wave director
  freezes designer-first").
- **`pveTheme` is frozen at setup only when a PvE module is on**
  (`adventure.pveTheme`; absent ⇒ "classic" everywhere). `"random"` is resolved
  ONCE from the game seed by `resolvePveEncounterTheme` (FNV hash, never
  `Math.random`/`Date.now`) so a reload cannot reroll it — pinned with a
  Math.random mutation control in `raid-bosses.test.ts`.
- **No pre-battle swap windows on waves/bosses/floors** (Judge Dread / Groovy
  Satyr / Visions / Rule 111 stay ordinary-guard offers), and **no computer
  guaranteed-win** ever applies (explicit context exclusions + the difficulty-0
  gates; the dungeon's real difficulty needed the explicit clause — CONTROL in
  `dungeon.test.ts`).
- **Boss art is now REAL painted art** (ImageGen masters in
  `scripts/anime-art/raw/bosses/` + `PROMPTS.md`, deterministically framed by
  `scripts/build-raid-dungeon-art.mjs`; pipeline + per-file contract in
  `docs/raid-dungeon-art.md`). The compositor bakes each boss's NAME, TITLE and
  one health pip per layer into `<id>.webp`, so a `cardImage` must point at its
  OWN id — the four Doom bosses shipped CROSS-WIRED (Baron Warden wore the
  Cyberdemon Prime face and 6 pips, etc.) and are now pinned per-boss in
  `boss-abilities.test.ts` ("each boss card face is its OWN id's file"). Every
  DESIGNER custom boss still wears the shared `custom_boss.webp` face;
  `rift_lair_field.webp` / `dungeon_gate_field.webp` remain unreferenced
  classic-art aliases for old snapshots.
- **`spider_overmind`'s "suppressing fire" needs ADJACENCY**: its
  `magic-elemental-attack-all-enemies` arm is
  `SECOND_ATTACK_ALL_ADJACENT_TO_SELF`, and the boss is a RANGED body pinned
  back-center, so the splash only fires once melee closes on it. The printed
  summary oversells it; the `abilityText` states exactly what runs.
- **The AI does not MARCH toward lairs/the Dungeon/the Calamity Gate** (no
  objective-field entries): computer seats fight their waves through the normal
  runner, and answer lair/gate menus when they stand there (visit scoring:
  challenge only with `playerArmyStrength ≥ 8`, delve at ≥ 4 — `map-policy.ts`,
  scored by STEP TYPE not label, so the "Continue (1 movement)" prefixes are
  invisible to it); no bespoke route-planning toward the sites in V1.
- **All three module hexes are Location-Token protected** (`TOKEN_FORBIDDEN_LOCATIONS`
  now lists `calamity_gate` / `dungeon_gate` / `rift_lair` beside `creature_bank`):
  each site's field id is LATCHED in adventure state, so letting a designer
  Monolith/Whirlpool/Gate token overwrite the hex would leave the latch pointing at
  a teleporter and silently kill the module for the rest of the game. Pinned via
  `tokenPlacementCandidates` in `monster-waves.test.ts`.
- **No `boss_lair` / `dungeon` / `calamity_gate` DESIGNER MAP OBJECTS yet** (the
  plan's §6.5.3(b) hex-pinned lair): designer control ships at the PRESET level
  instead — the "PvE encounter director" editor group (renamed from "Waves &
  Raid bosses") holds the theme override, per-wave armies + cadence + pressure +
  loss limit (`preset.monsterWaves`), custom bosses + the spawn-round override
  (`preset.raidBosses`) and the Dungeon campaign block (`preset.dungeon`); the
  scheduled spawn still picks its own field, and both the Dungeon and the
  Calamity Gate place themselves via the tile-rotation seam.
- **Waves, Rift Lairs and Dungeon floors are fought on TWO dedicated
  battlefields** — `pve-calamity-classic` / `pve-calamity-doom`
  (`public/assets/board/battlefield-4x5-pve-calamity-*[-scenery].webp`, 2500×2000
  + 2500×520 like every other board, built by `scripts/build-pve-battlefields.mjs`
  from committed ImageGen masters, with the 5×4 grid drawn IN CODE at exactly
  500px so it can never drift off the twenty logical cells). Selection is
  SERVER-AUTHORITATIVE, not client guesswork: `isPveEncounterCombat` reads the
  combat CONTEXT marks (`waveAssault` / `raidBossId` / `dungeonFloor`) and
  `assignCombatBoardArt` stamps `combat.boardArtId` at combat creation, forced by
  the frozen `adventure.pveTheme`; the two ids never enter the random open-field
  pool. Ordinary guards, Creature Banks, sieges, naval fights, PvP and the
  sandbox are untouched (CONTROLs in `monster-waves.test.ts` +
  `board.test.tsx`). The board also draws a small "Calamity encounter" plate
  (`.pveBattlefieldTitle`) — pure presentation, pinned as DOM wiring in
  `board.test.tsx`. LIMIT: the PvE check runs BEFORE the sea check, so a wave
  assault on a water hex shows the calamity board, not the ship board (flavour
  only — no rules read).

**Calamity Waves** (`monsterWaves`): every Nth round (cadence; wave k = round
k×N), EVERY live seat fights a wave army at round start — announced the round
BEFORE ("the Gate groans"), resolved in seat order behind the SAME round-start
event barrier the Fortress Event uses (one barrier spans Event + waves: the
trailing sentinel is lifted and re-appended after the assault steps — exactly
ONE sentinel, pinned). While an assault COMBAT is open the barrier's resolver
read is null — the fight's own machinery (reactions, PvP-Neutral-Control,
placement) governs who acts, and `computerDecisionOwner` falls through to its
combat block so an AI seat's assault is driven (the `!state.combat` guard —
reverting it hangs the whole table, pinned in monster-waves.test.ts); in
parallel mode bystanders keep the usual quiet set during that fight, exactly
like any open combat. Each assault is a normal neutral combat at the MAIN
hero's position: `context.waveAssault`, difficulty 0 (no level XP — the wave
pays its own reward), `unlimitedRounds` (fought to the end; no retreat window).
Rewards/pillage come from `waveEconomyProfile(pressure)`: **standard** = win 2
gold + 1 main-hero XP (+ one Treasure die from wave 3 on), pillage 3 gold;
**brutal** = win 3 gold + 2 XP (+ the Treasure die from wave 2 on), pillage 5
gold AND −1 morale. On a win Freelancer's Guild / Necromancy fire as on any
fought neutral win, but the post-win FIELD VISIT is SKIPPED (the hero merely
stands there) and Necromancy opens with no deferred fieldId (bank precedent).
ANY non-win = PILLAGE: the gold loss (floored at 0), the brutal morale hit, and
the flagged mine/settlement NEAREST the home town is overrun — flag removed,
`everFlagged`/cube reset, a difficulty-Ⅰ guard re-seeded (re-fight → re-flag
re-earns the first-flag reward, the clear-cubes precedent); the hero never
bounces (no retreat step-back, no move-home — the assault came TO them). A seat
with no main hero on the map is pillaged directly. Every pillage bumps
`player.waveDefeats`, and with `waveDefeatLimit` 2 or 3 reaching it ELIMINATES
that seat (the only wave rule that can). Because the pillage runs inside
`finalizeAdventureCombat`, that elimination can END the game mid-queue
(last-faction-standing): the `wave-assault` pump branch therefore DROPS the
remaining assaults once `adventure.winnerPlayerId` is set, so the winner is not
dragged into a pointless fight that would clear the `game-over` phase — pinned
with a no-limit CONTROL in `monster-waves.test.ts`.
Each numbered wave also carries a real BATTLE EVENT — a deterministic
three-entry rotation per theme (`waveBattleEventFor`: classic War Drums / Shield
Wall / Stampede, doom Berserk Pack / Infernal Hide / Teleport Ambush) folded
into the minted invaders' Attack / Defense / Initiative at
`revealNeutralArmy`, with a `MONSTER_WAVE_BATTLE_EVENT` feed line. It is
CANCELLED for a seat holding `wavePreparedFor === wave` (see the Calamity Gate
below); both halves are pinned by comparing the actual minted stats (the feed
line alone passes with the fold deleted, so the effect assertion is the pin).
A **Calamity Gate** map object anchors the module: the FIRST revealed Far-band
Blocked Field is converted at rotation (`placeCalamityGate`, `location:
"calamity_gate"`, `monsterWaves.gateFieldId`, one per map, theme-skinned hex art)
— it does NOT need the Creature Banks option, it just carves ahead of the token
pile, and the carve clears terrain/border edges so the hex is really walkable.
Walking in — or Revisiting later for 1 MP — sets only THAT player's `wavePreparedFor` to
`floor(round / cadence) + 1` — the next numbered wave — and opens no choice, so
no seat, AI or AFK driver can stall on it. The flag clears when that wave
resolves either way. Wave army level = min(5, wave+1); the designed-map preset
(`monsterWaves.waves[k]`, the CustomGuardSpec vocabulary incl. exact armies and
"packs" level draws) replaces wave k's draw for every seat. Eliminated seats'
queued assaults drop; an eliminated mid-queue table still lifts the barrier.

**Raid Bosses** (`raidBosses`): persistent multi-layer world bosses. A boss is
a bespoke-stat LAYERED monster (`src/data/anime/bosses.ts` — the CLASSIC pool is
Goblin King 3 / Colossal Titan 5 / Abyss Kraken 4 / Calamity Dragon 6 / Avatar
of Erebos 7 bars; the DOOM pool is Cyberdemon Prime 6 bars (line-attack +
Enrage) / Spider Overmind 5 bars (adjacent-splash + Undying Resilience) —
`scheduledBossPool` serves the frozen theme's list ONLY, so a classic game can
never roll a doom boss nor a doom game an Erathian one (pinned at the SPAWN, not
just the pool), while a designer custom list still REPLACES either) minted
gradeless (`bankUnit` + `bossUnit`): its `armyStacks` ARE the
health bars, shed UNCONDITIONALLY by the boss branch of
`markUnitRemovedIfNeeded` (no Unit-Stacks rule needed; excess damage carries;
minted stats survive — the bank branch of `applyUnitCurrentSide` no-ops on the
synthetic `boss.<id>` def). Tier-gated spells can't touch it, the neutral AI
ranks it by distance, and `applyNeutralRoundsRank` skips it. THREE new ability
arms ship (mutation-checked in `boss-abilities.test.ts`): **Enrage**
(`boss-enrage` — FLAT_ATTACK_BONUS +2 gated by the NEW
`requiresLayersAtMost: 1` on `getUnitAbilityDefinitions`, switching on LIVE at
the last bar), **Devour** (`boss-devour` — the DEATH_STARE_ON_DICE machinery
with diceCount 1 / onRoll +1 / NEW `targetGradeAtMost: "bronze"`: one "+1" die
removes a surviving bronze side outright; silver+ and gradeless targets are
never threatened — no die is even thrown; rides the ability-roll
reroll/set-die windows for free), and **Fear** (`boss-fear` — NEW MORALE_LOCK:
while a living enemy Fear unit stands, morale cannot be USED — the +1 token and
Positive Morale cards are withheld from `addMoraleActions`, the reaction-window
combat bonus, BOTH reroll-source builders (attack + ability windows) and
`spendMorale` rejects a forged spend; gains/draws untouched; unlocks the moment
it dies). Schedule: the arrival round is the lobby chip 4|5|6 (default 5, frozen
onto `adventure.raidBossSpawnRound` only when it differs from 5) and the
announcement is always `spawnRound − 1`; a designed map's
`raidBosses.spawnRound` (2–30) still beats the lobby, clamped at setup — the
highest-difficulty REVEALED plain
guard field (objectives/flags/banks/outposts/teleports/hero-hexes excluded,
center bands preferred) converts to a **Rift Lair** (`field.riftLair`, location
`rift_lair`, printed guard cleared — the boss IS the guard); nothing revealed ⇒
retry every round. Entering = a confirm menu (Challenge / Withdraw — withdraw
stays at the mouth; the lair is revisitable for 1 MP); the fight is
difficulty-0 (no XP, bank precedent) with the boss pinned back-center + a
minion escort (`minionCount` draws off the `minionLevel` table row). WOUNDS
PERSIST: remaining layers write back to `adventure.raidBosses[id]` at finalize
whatever the outcome (and across snapshots — round-trip pinned). Every layer
broken pays the FIGHTER 2 gold AT ONCE through the real removal chokepoint (+
the per-player `layerBreaks` ledger); the kill pays 5 gold + a relic-tier
Artifact search (split deck when present; the normal BINH search gates apply)
and clears the lair (black cube; later visits inert). Ignored, the boss regrows
+1 layer every 4th round, capped at printed layers. DESIGNER custom bosses
(preset `raidBosses.bosses`, cap 6, editor group "PvE encounter director"):
name + per-layer stats (clamped to `CUSTOM_BOSS_LIMITS`) + layers 1–8 + type +
abilities from the curated implemented whitelist `RAID_BOSS_ABILITY_CHOICES`
(sanitizer-filtered, dedupe, every id pinned implemented) — a custom list
REPLACES the catalog pool for that map's scheduled spawn, and a custom def
reusing a catalog id replaces that boss. PvP-Neutral-Control plays the boss via
the unchanged controller machinery (emergent).

**The Dungeon** (`dungeon`): ONE repeatable delve site per map. It NO LONGER
requires the Creature Banks option (the old coupling is gone): placement still
rides the tile-rotation seam — the FIRST Near-band tile revealed with a Blocked
Field carves the gate (`location: "dungeon_gate"`) INSTEAD of offering a bank —
but that branch sits AHEAD of the token-pile read, so with banks OFF (no piles
at all) the site places exactly the same. Nothing is peeked/consumed from the
bank piles; later Near tiles offer banks normally; a map whose Near blocked
fields never reveal simply never hosts it (a stated deviation from the plan's "at
setup"). Pinned by driving the real rotation with `creatureBanks: false` and then
opening the floor-1 menu — the frozen flag alone proved nothing.
Per player: `dungeonFloor` (1..the floor cap). **The once-per-turn latch is GONE**
(`dungeonDelveRound` is dead state, kept only for legacy snapshots): MOVEMENT is
the limiter. Entering the field pays the walk, a later delve is the ordinary
1-MP Revisit, and after a WIN a `DUNGEON_CONTINUE` reward step re-opens the menu
for the NEXT floor immediately, whose door options each carry a
`SPEND_HERO_MOVEMENT` step for the frozen DESCENT COST — so a hero can chain
floors while movement lasts ("Continue (1 movement) — …" labels). With less than
the descent cost left the continuation is refused with a note and the new floor
is simply saved for a later turn; "Leave the Dungeon" is always free.
**Campaign direction (`adventure.dungeonSite`, frozen at setup; absent fields =
the historical 10 floors / 1 movement, so legacy snapshots are unchanged):**
`maxFloor` 5|10 read through `dungeonFloorCapOf` (the cap floor is the
repeatable bottom AND the Conqueror floor), `descentCost` 0|1|2 read through
`dungeonDescentCostOf` (label "free descent" at 0, and NO `SPEND_HERO_MOVEMENT`
step is emitted), and `floorBosses` — designer wardens for floors 5/10 naming
ANY built-in boss (`RAID_BOSSES` + `DUNGEON_FLOOR_BOSSES`, 11 ids) or a custom
boss authored in `preset.raidBosses.bosses`, resolved through the ordinary
`resolveBossDefinition` so a warden works even with the Raid Bosses module OFF.
Three DELIBERATE limits: a 5-floor expedition crowns floor 5 (its MAJOR-artifact
rung + the DUNGEON CONQUERED title) — the floor-10 relic rung is simply never
reached; FREE descent removes the movement limiter entirely, so a delve is
bounded only by winning (each floor is still a real fight, and the AI stops at
`playerArmyStrength < 4`); and `sanitizeDungeonPreset` keeps ANY ≤40-char
warden string, so a hand-edited typo cannot be resolved and that floor fields a
PLAIN party instead of a boss (never a stall — the editor only offers real ids).
All three halves — the carry into `dungeonSite`, the warden actually on the
board, and the free/2-movement descent — are mutation-checked in
`dungeon.test.ts`. Ordinary floors offer TWO rooms + Leave (the user-spec
door crawl), now seeded by (game seed, THEME, floor) — a SHARED layout every
player sees, no longer per-player, and abandoning cannot reroll it. Classic rooms:
treasure vault (+gold), forgotten shrine (PAY_TO 2 gold → +1 morale), whispering
wall (a REAL bilingual story scene via the auto `PLAY_STORY_SCENE` step —
`dungeon_whispers_first/deep` in scenes.ts, deliberately art-less — then +1 XP),
abandoned camp (+1 MP), and a cursed reliquary (+2 valuables, −1 morale — NEW,
so the classic pool is 5 rooms now, not 4). The DOOM pool replaces all five (UAC
supply cache, berserker altar, soul sphere, short-range teleporter, trapped armor
cache) and is likewise mechanically real. The chosen room resolves, THEN the
floor den opens: `context.dungeonFloor`, REAL difficulty min(floor+1, 7) — the
grind site pays normal hero AND unit XP — never Quick Combat, normal round-limit
rules, normal defender-rows formation (the plan's bank-corner formation is
dropped: variable party sizes don't fit 4 corners — stated deviation; the plan's
spike-pit combat tokens are NOT modeled either). Floors 5/10 skip the doors and
field the LAYERED floor bosses — a designer warden if the map named one, else
themed: classic Minotaur of the Depths / Floor
Wyrm (2 bars each), doom Baron Warden (2 bars, damage cap + Enrage) / Cyberdemon
Tyrant (3 bars, line attack + ignores retaliation) — §6.5.2 anatomy, minted
FRESH each attempt (the Dungeon deals fair, no boss-wound bookkeeping), with a
themed minion escort (a doom floor fields `doom.*` minions). Win: floor+1 + the
reward ladder (gold → valuables → minor/major artifact searches; floor 5 = a
major search, floor 10 = a relic search; the DUNGEON CONQUERED title fires once
on the CAP floor) unshifted to the queue front;
the conquered bottom floor stays repeatable for a fallback (Treasure die + 3
gold). Loss/retreat: nothing lost, the hero stays at the gate and may retry
(paying the Revisit MP). Visit-step kinds `RAID_BOSS_FIGHT` /
`DUNGEON_FLOOR_FIGHT` / `DUNGEON_CONTINUE` (auto, opening combats or re-opening
the door menu via registered hooks — the hex-event-hook pattern) and
`PLAY_STORY_SCENE` (auto, fires STORY_SCENE_TRIGGERED); none pause for input, so
AFK defaults and AI seats resolve every dungeon/lair menu through the normal
CHOOSE_ONE machinery (the AI scores by step TYPE, so the "Continue (free
descent)" / "(2 movement)" prefixes are invisible to it; the MP cost bounds the
chain unless the map set descent FREE, where only losing/army strength does).

## Event deck (Fortress expansion, OPTIONAL rule) — what runs vs. printed nuances

A separate system from the Astrologers Proclaim deck (do not confuse the two).
Data in `src/data/cards/events.ts` (all 20 published Fortress Events, real card
scans fetched by `scripts/fetch-events-art.py`); engine in `src/engine/adventure.ts`
(`drawEventCard` / `resolveEventCard` / `applyEventVisitStep`); toggle
`GameSetupOptions.events` (Game options UI, **default OFF** — an opt-in optional
rule — and "multiplayer only": even switched On, a solo table never gets the
deck; the deck's absence in `state.decks` IS the off switch). A drawn Event pops
the `EventDrawnOverlay` on every client (drawer named, resolves clockwise from
them) plus a feed line. Timing per the rulebook p.15-16: drawn at the start of each Resource
Round AFTER income; the drawer rotates clockwise per draw; effects resolve in
clockwise order starting with the drawer (the FIFO reward queue is the order).
Tests: `event-deck.test.ts` (flow/toggle/rotation/secrecy), `event-cards.test.ts`
and `event-market-cards.test.ts` (every card's observable effect, each failing if
its wiring is removed). `EVENTS_NOT_IMPLEMENTED` is empty — no display-only
Events ship; that registry is the only legal home for a future unwireable one.

**Round-start EVENT BARRIER (both event types, ordered AND parallel play).** When
a round draws an Event (this deck) or an Astrologers proclamation, the WHOLE table
pauses to resolve it FIRST — the Fortress Event is drawn at the FRONT of the
round-start reward queue (before City Hall / resource-die / war-machine offers,
`startAdventureRound`), and while `adventure.eventResolution` is set the ONLY
player who may act is the one whose event choice is currently open. Every other
player is frozen — no quiet move, no start-of-turn draw, no town/morale action, no
ending the turn — until every player has resolved it (enforced in `applyAction`
and offered as `[]` in `legal-actions`; the read helper is
`isRoundStartEventBarrierActive`/`roundStartEventResolver` in `parallel-turns.ts`).
A trailing `round-start-events-resolved` sentinel reward (always LAST, since event
follow-ups `unshift` ahead of it) clears the barrier in `pumpAdventureQueues`,
after which the normal flow (City Halls, turn-start effects, first-turn hand,
turns) proceeds. Automatic Resource income is still applied inline BEFORE the
Event (rulebook p.15), so a player has fresh Resources to spend in the event's own
markets/auctions; only the player-facing steps wait behind the barrier. Instant
proclamations (Dead Silence, movement/morale buffs) queue nothing and raise no
barrier. Pinned in `round-start-event-barrier.test.ts` (Event side: freeze,
event-before-City-Hall ordering, ordered mode, a real Resource-round wrap, and a
no-barrier CONTROL) and `astrologers-parallel-turns.test.ts` (Astrologers side),
each with a CONTROL where the same action succeeds once the barrier lifts.

**Barrier RECOVERY (the barrier may freeze the table, but never strand it).**
Three guards keep a mid-resolution table recoverable, each pinned in
`astrologers-barrier-recovery.test.ts` (fails if the guard is removed):
(1) `eliminatePlayer` drops EVERY interaction the eliminated seat owns — its
queued rewards and open `pendingVisit` (as before) AND an open `pendingChoice`
(returning cards a DECK_SEARCH / Visions scry / Pandora scry had lifted out of
a shared deck — the Pandora scry's undecided AND kept cards go back on TOP of
the draw pile, pinned in `pandora-cards.test.ts` "eliminating the scrying
player mid-scry destroys NO shared-deck cards" — restoring `phase`), plus an
owned `pendingNecromancy`/`pendingFarTileFlip` — so
a seat eliminated mid-resolution (AFK kick, concede) hands the slot to the next
seat in order and the barrier still lifts after the last LIVE seat. (2) A
round-start City-Hall choice whose every option was context-filtered away
(e.g. Cove's remove-an-Artifact arm with no Artifact in hand) is SKIPPED in
`pumpAdventureQueues`, never opened as a zero-option prompt nobody (not even
the AFK-drop driver) could answer. (3) A client that (re)connects mid-barrier
still gets the proclamation/Event overlay: the first-snapshot priming marks the
draw event "seen", so `reconnectRoundStartCues` (components/table/utils.ts,
pinned in `reconnect-round-start-cue.test.ts`) rebuilds the cue from live state
for exactly the barrier-up window — reconnects after resolution stay replay-free.
(4) A mid-Event elimination (AFK kick / concede while a Fortress Event is
resolving) must not leak the shared display: the drawer-owned TABLE bookkeeping
rewards (`EVENT_POOL_CLEANUP`, `EVENT_AUCTION_OPEN`/`_RESOLVE` — playerId-
agnostic steps) are handed to the next live seat instead of being dropped with
the seat's own rewards (`isSharedEventBookkeepingReward`, applied in
`eliminatePlayer` AND in `pumpAdventureQueues`' eliminated-owner skip for
pre-fix snapshots); the dead seat's secret auction bid is scrubbed so it can
never win a lot into a dead hand, and an un-answered 1-for-1 Marketplace deal
they proposed is voided (queued ANSWER steps fall through cleanly — an
already-open Accept button becomes a no-op). Pinned in `event-deck.test.ts`
("Event resolution survives a mid-Event elimination"), each fix
mutation-checked.

Engine readings / deviations a reviewer should know (all deliberate, commented at
the wiring site):
- **Early-game Relic lock (HOUSE RULE)**: Events that GIVE Artifact cards — the
  Shady Auction's lots, the Artifact Merchant's pool AND its discard-top offer,
  Messenger with Supplies' draws, a Magical Forest "draw and view" contribution
  (whose menu option is also hidden when the lock leaves nothing drawable) —
  offer minor/major Artifacts only before round 5; Relics join the offers from
  round `EVENT_RELIC_MIN_ROUND` (= 5, `src/engine/adventure.ts`) on. With split
  decks the Relic deck drops out of the weighted pick; a legacy single Artifact
  deck redraws past Relic cards (tucked under, never consumed). Event-granted
  SEARCHES of the Artifact deck keep the normal BINH progression gates instead,
  and a Relic contributed from a player's own hand stays legal in the Forest
  pool. Pinned in `event-market-cards.test.ts` ("Event — early-game Relic
  lock") with round-5 CONTROLs; mutation-checked.
- **Den of Thieves** resolves for the DRAWER only — its printed "you" with no
  pass-around clause, read like Artifact Merchant's "you" (which the rulebook's
  own example pins to the drawer).
- **A Shady Auction** bids are sequential-but-hidden rather than physically
  simultaneous: each seat picks a gold bid in turn; the amount is stored in
  `adventure.events.auction.bids`, masked in other players' views
  (`player-view.ts`) and logged without the amount, then revealed all at once at
  the lot's resolution. Single highest pays and takes; a tie or all-zero round
  discards the lot.
- **Search timing**: Searches earned by Cursed Swamp's remove-Spells option, the
  Market of Time / School / Garden remove loops and the Withered Hermit pay
  option resolve INSIDE the earning player's slot (front-of-queue rewards —
  `EVENT_SEARCH_FRONT`). A Search granted by a rolled Treasure-die FACE (Crypt's
  gamble, Cursed Swamp's roll, a taken Leprechaun die) queues at the END of the
  round-start queue instead — the engine-wide treasure-face convention the
  Astrologers dice share.
- **Crypt's 2-die gamble** ("any experience face — gain nothing") is its own
  roll: Luck rerolls / Cards-of-Prophecy die-sets do not hook it (they do hook
  Cursed Swamp's standard 2-Treasure-dice roll).
- **Magical Forest** contributions are face-down: pool entries are masked for
  everyone in player views (after the shuffle even the contributor cannot tell
  which entry is theirs); a drawn-and-viewed contribution is shown privately to
  the contributor only. Taking from the pool is a seeded-random pick.
- **Mercenary Camp** "up to 2 from one of the chosen decks" = draw 2 / draw 1 /
  none, all from ONE Neutral deck (Azure included — no printed exclusion;
  Prison's "except for Azure" IS enforced). Recruits pay the printed Neutral
  cost; leftovers recycle to their tier discard piles (engine convention for
  returned Neutral draws).
- **Garden of Revelation** "draw 4 from your discard pile" takes the TOP 4; the
  closing "discard all cards from hand and draw up to your hand limit" runs
  AFTER the earned Searches, in printed order.
- **Cursed Swamp** "cheapest unit" = lowest gold-equivalent printed cost of the
  card's CURRENT side (materials/valuables valued at Trading Post rates); ties
  break by army order. A discarded Neutral-side card recycles to its tier
  discard pile like a combat casualty.
- **Spell/Artifact market draws** ("draw the top Spell/Artifact card") draw
  across BINH's split decks weighted by remaining size — the odds of one
  combined physical deck. A low-level hero may therefore buy an Expert spell at
  the Library/Laboratory/Shrine (an event special-offer; the usual search gates
  are not applied to buying, only the duplicate/uniqueness gate is).
- **Marketplace** "Trade resources using Trading Post rules" is the resource
  exchange ONLY (`TRADING_POST.tradesOnly` hides the sell-a-card / war-machine /
  scroll options at the menu AND at the action guards). The 1-for-1 deal is one
  proposal per player's own resolution; the other players answer immediately
  (the answers cut the reward queue), first accept wins.
- Leftover revealed cards shuffle back into their decks (rulebook default);
  Shrine of the Magic Thought's leftovers go to the Spell discard pile and
  Messenger's declined pair to the Artifact discard pile, as printed.

## Mine-guard reinforcement (OPTIONAL "Global" house rule, default OFF) — what runs vs. limits

House rule `mine-guard-reinforcement` (registry `src/engine/house-rules.ts`,
category `"global"` — a NEW house-rule group whose lobby header carries the map
glyph `REWARD_GLYPH_ICONS.map`). Default OFF in BOTH binh AND legacy (an opt-in
difficulty tweak). Engine: `mineGuardReinforcementDraws` folded into `drawGuardArmy`
(`src/engine/adventure.ts`). Behaviour pinned in
`src/engine/mine-guard-reinforcement.test.ts` (each claim mutation-checked with a
rule-OFF / non-mine CONTROL) + the lobby row in
`src/components/adventure/game-options-tabs.test.tsx`.

When ON, every fought-out neutral guard fight on a **Mine field** (all resource
types — gold / valuables / materials share `location === "mine"`) fields ONE
EXTRA random neutral BRONZE creature drawn from the bronze Neutral deck, on top of
the normal guard army. It composes with EVERY base guard branch (level draw AND
designer exact / custom / level armies) and with a RE-fight of a re-guarded mine
(all funnel through `drawGuardArmy`). The extra bronze is a plain non-bankGuard
draw, so it recycles to the bronze discard at combat end via the shared
guard-recycle seam (`finalizeAdventureCombat`) like every other guard.

Leading with what does NOT run / deliberate limits:
- **Reward / XP / difficulty are UNTOUCHED** — the extra is appended AFTER
  `combat.context.difficulty` is fixed and only makes the fought army bigger; the
  fight's difficulty-based reward is byte-identical (pinned "reward unchanged").
- **Quick Combat / level auto-wins are unaffected** — they resolve BEFORE the army
  deploys (the rule makes a FOUGHT-OUT fight harder, never a skipped one), same as
  the Neutral Rank-Up reading.
- **Creature Banks are NOT mines** — banks reveal via `buildCreatureBankDraws`, a
  separate mint the rule never reaches (waves / raid bosses / dungeon floors never
  call `drawGuardArmy` either); only real guard-field fights on a mine qualify.
- **The AI ignores it** — the map policy still reasons by field difficulty / level,
  so a computer hero just fights the (harder) mine.
- **Flagged-mine free re-flags (no fight) are untouched**, and PvP-Neutral-Control /
  manual guard control compose automatically (the extra body is just another guard).
- **Placement caps gracefully**: the 8-cell defender zone seats a legit mine army
  (≤ 6 designer units + 1); an over-full hand-edited map leaves the surplus at its
  default cell (`placeNeutralUnits`) — no crash, no stall.

## Mine army defense (OPTIONAL "Global" house rule, default OFF) — what runs vs. limits

House rule `mine-army-defense` (registry `src/engine/house-rules.ts`, category
`"global"`, default OFF in BOTH binh AND legacy — an opt-in tweak). When ON, an
enemy Hero walking onto YOUR already-flagged Mine no longer re-flags it for free:
YOU (the owner) get the settlement-style defense window — pay 3 gold and defend
with your UNITS **and your CARDS** (only your Hero is missing), or let it fall.
Engine: a flagged-mine arm in `garrisonDefenderFor` + a `garrisonDefenseCost`
mine=3 (`adventure-reducer.ts`), reusing the EXISTING `pendingGarrison` /
`openGarrisonPromptIfNeeded` / `resolveGarrisonChoice` / `startPlayerCombat` flow
verbatim (the same one a town/settlement/designer-Garrison uses). Behaviour pinned
in `src/engine/mine-army-defense.test.ts` (each claim mutation-checked with a
rule-OFF / wrong-owner CONTROL), the AI twin in
`src/engine/computer/visit-event-policy.test.ts`, and the lobby row in
`src/components/adventure/game-options-tabs.test.tsx`.

**The CARDS half (2026-07-25)** is ONE flag on the combat context —
`CombatContext.garrisonCardsAllowed` — DERIVED inside `startPlayerCombat` from
`garrisonDefenseKeepsCards(state, field)` (a heroless defense of a `mine` with the
rule on; never passed in by a caller, so it cannot be set anywhere else) and read
at the SINGLE hand-lock seam `isHandLockedInCombat` (`legal-actions.ts`), which
every legal-action offer AND every reducer backstop already consults — so the
waiver can never be honoured by one surface and refused by another. The SAME
predicate builds the prompt wording ("defend with your units and your cards"), so
what the owner is promised is exactly what the fight allows. What this does NOT
lift: everything gated on a HERO being in the fight stays off for every heroless
defense — Tactics (`defenderHeroId != null`), Retreat / Surrender / Shackles, and
the commander / equipment / hero-grade folds (`commanders.ts`,
`anime-equipment.ts`, `anime-hero-grades.ts` all key off the context hero). Every
OTHER heroless garrison defense (town / settlement / captured Utopia / Grail site /
designer Garrison object) is untouched and stays units-only — pinned as a CONTROL
here and in `secondary-heroes.test.ts`. Both halves are mutation-checked: the
WIRING (a real walk-in stamps the flag and unlocks the owner's hand) and the
EFFECT (a heroless Mine defender is offered the Resurrection Deck card in the
lethal-save window and it really cancels the killing blow — the CONTROL without
the flag offers nothing and the Pack flips to Few).

**RETREAT (2026-07-25)**: the heroless Mine defender may CONCEDE so the fight can
end quickly instead of being played out to the last unit — the ONE heroless
garrison defense that can. `isHerolessMineDefender` (adventure-reducer.ts, the
same "heroless + `garrisonCardsAllowed`" predicate `isHandLockedInCombat` now
reads, so cards and Retreat can never disagree about who this side is) relaxes
BOTH the `giveUpCombat` "A hero must be present to give up." throw and the
`addGiveUpCombatActions` offer gate. It is the NORMAL give-up settlement — the
casualties taken so far stay lost, survivors are KEPT (it does not forfeit the
army), the hand is discarded instead in keep-troops mode — and it moves NO hero,
because there is no hero in this fight to send home. Retreat/Surrender for every
other heroless garrison, and `escapePvpCombat`'s own hero requirement, are
UNCHANGED. Pinned in `mine-army-defense.test.ts` ("Retreat from a heroless Mine
defense": the predicate scoping, the concede outcome + survivor kept + hero never
moves, and a no-flag CONTROL that still throws).

Leading with what does NOT run / deliberate limits:
- **View Earth remote capture is NOT intercepted** — it flags directly through
  `resolveViewEarthCapture` (a separate path from `resolveHeroArrival`), so a
  remote View Earth steal of a flagged mine stays a free capture (documented, not
  a bug). Only a physical WALK-IN (or a Dimension Door arrival, which shares
  `resolveHeroArrival`) opens the defense.
- **A Mine with a LIVE neutral guard fights the guard FIRST** — `isFieldGuarded`
  is checked before the garrison prompt in `resolveHeroArrival`, and a re-seeded
  mine (pillage) clears `flagOwnerId`, so the defense arm (`Boolean(field.flagOwnerId)`)
  never fires on a guarded mine; that fight is unchanged.
- **A broke owner (< 3 gold) is never asked** — the mine falls undefended, exactly
  like today's walk-in (the shared `openGarrisonPromptIfNeeded` gold gate).
- **Default OFF ⇒ byte-identical** — with the rule off the walk-in re-flags the
  mine for free (the classic behaviour), no prompt.
- **Outcome rides the generic garrison seam**: winning the defense keeps the mine
  with the owner and repels the attacker; declining OR losing flags it for the
  attacker with the normal production transfer (`finalizeAdventureCombat` →
  `beginFieldVisit`'s mine branch → `applyMineFlag`) — no mine-specific finalize
  code. Losing a mine defense never triggers the last-town elimination (a mine is
  not a town-category location).
- **AI**: the `context: "garrison"` choice scorer now reads the real
  `pendingGarrison.goldCost` (3 for a mine, 8 for a town) instead of a hardcoded
  8, so a computer owner defends a cheap mine it would concede at a town's fee;
  town/settlement scoring is byte-identical (goldCost 8). The map policy's
  free-reflag-of-enemy-mines objective may now walk into this fight — no stall
  (the engine offers legal actions either way; the AI just answers the prompt).

## Official-rules switch-over (2026-07-25) — three OLD readings became opt-in house rules

Three engine readings the printed/official rules contradict were replaced by the
OFFICIAL rule, with the OLD behaviour preserved behind a NEW house rule. Two of
them (`elemental-damage-no-die`, `deck-access-hero-level`) stay **default OFF in
BOTH binh and legacy** (a table that changes nothing plays the official rule).
The third, **`discovery-border-gate`, defaults `true` in BINH (default OFF in
Legacy) but is an INDEPENDENT, editable toggle** (see its bullet) — so BINH's
default tile-discovery is the require-open-border reading, but a table may switch
it off, and it is NOT part of the Polish package. (An earlier five-session
iteration force-locked it ON in BINH / the Polish package; the shipped branch
reverted that to a plain editable toggle.) Each rule is one boolean read at ONE
seam, with the CONTROL behaviour pinned.

- **`elemental-damage-no-die`** (category combat). OFFICIAL (OFF): elemental damage
  does exactly ONE thing — it ignores the target's Defense value (printed Defense,
  Defense tokens and Defense cards alike). The attack is otherwise normal: the
  Attack die IS rolled and +⚔ / −⚔ cards (Bloodlust, Bless, Weakness, Attack
  tokens…) change the value like on any other attack. ON: the old reading — the die
  is skipped AND positive card/token bonuses are clamped away (debuffs still bite).
  ONE seam: `elementalLocksAttack` in `getAttackStackDetails` (reducer.ts); the
  `ignoreDefense` half stays unconditional in both readings. Behaviour + the
  house-rule CONTROLs in `elemental-fixed-damage.test.ts` (every shipped elemental
  side, driven from the unit data) and `summon-elemental.test.ts` (attack maths,
  Attack tokens, Moandor's granted elemental damage).
- **`discovery-border-gate`** (category combat — BINH house-rules panel under
  "Combat & map rules"; placement pinned in `game-options-tabs.test.tsx`).
  **`default: true` in BINH (`legacyDefault: false`), an INDEPENDENT editable
  toggle — Rule 111 and the other Polish rules never change or lock it, and it is
  NOT part of the Polish package.** When ON: DISCOVERING a face-down Tile — or
  OPENING a new Ⅱ–Ⅲ one — needs an OPEN border between the Hero's field and the
  tile (a printed yellow arc, designer whole arc, or a designed per-edge line
  seals it), with a Redwood Observatory / Speculum as the bypass. When OFF:
  adjacency alone suffices (the printed-rules reading). BINH defaults it ON but a
  table may switch it off — an explicit `false` wins in every mode (no force-lock;
  `resolveHouseRules` / `houseRuleEnabled` no longer coerce it). Two seams:
  `heroCanDiscoverTileAcrossBorders` (takes the STATE) and
  `canHeroReachPlacementCenter`. **Movement is UNTOUCHED** — yellow borders still
  seal every step in both readings, and the Surface/Subterranean divide still
  blocks discovery either way. Behaviour pinned in
  `official-rules-house-rules.test.ts` (BINH default-ON, an explicit `false`
  DISABLES it even in BINH, Legacy default-OFF) and `adventure.test.ts`; the
  ON-path map fixtures live in `designed-borders.test.ts` / `map-objects.test.ts`
  and the bank-exception case in `creature-bank-objects.test.ts`. NOTE: because
  BINH DEFAULTS this ON, the SP-AI "immediate-access" discovery variants
  (`computer/map-navigation.ts`) are a no-op on a default BINH table and only
  change Legacy / rule-off games. Its two siblings below stay default-OFF
  (official).
- **`deck-access-hero-level`** (category decks). OFFICIAL (OFF): which Spell /
  Artifact decks a Search may reach is decided by the TILE the (main) hero stands
  on and nothing else — starting & far Ⅰ–Ⅲ = basic Spells / Minor artifacts, near
  Ⅳ–Ⅴ = expert Spells / Major artifacts, centre Ⅵ–Ⅶ = expert Spells / Relic
  artifacts; weaker tiers stay allowed, so a centre tile can still Search Minors.
  A "tile-agnostic" Search (playing an Artifact, activating the Mage Guild) reads
  the same main-hero tile — that is what those call sites already pass. ON: the old
  BINH progression unlocks ride on TOP — expert Spells at hero level ≥ 4 or once
  ANY Ⅳ–Ⅴ tile is revealed anywhere or while holding Eagle Eye / Wisdom / a Basic
  X Magic, and Major/Relic artifacts at level ≥ 4 / ≥ 6 with an artifact source.
  Two seams: `canDrawExpertSpells` and `artifactDeckAccess` (ruleset.ts) — so
  `eligibleSpellDecks` / `eligibleArtifactDecks` and every consumer follow. Pinned
  in `official-rules-house-rules.test.ts` (per-band deck lists, both flags default
  OFF in binh AND legacy) and the recast `ruleset.test.ts` pairs.
  KNOWN CONSEQUENCE (deliberate): the Mage-Guild purchase is a TOWN-TOKEN action
  playable from anywhere, and a Town sits on a Ⅰ tile — so under the official rule
  buying Expert spells means **walking the main hero onto a Ⅳ+ tile first** and
  spending the token there (standing in the Town reaches Basic only). The
  `ignoreKeyCards` Mage-Guild strictness only means anything while the house rule
  is ON.

## The Resource die's "2 valuables" face is a BINH house rule now (2026-08-07)

USER RULE, verbatim: "the 2 valuables result removed from the resource die
completely: MUST MAKE IT BINH HOUSE RULE ONLY, MAKE BASE GAME STILL BE ABLE TO
ROLL THE 2 VALUABLE RESULT." The engine had HARDCODED the printed "2 valuables"
face down to 1 for EVERY mode (a comment in `RESOURCE_DIE_FACES` called it a
house rule, but no toggle existed). It is now the BINH-only house rule
`resource-die-single-valuables` (`house-rules.ts`, category `global`, **`default:
true` in BINH, no `legacyDefault` ⇒ OFF in Legacy / the base game**; editable in
either mode). Behaviour pinned in `src/engine/resource-die-valuables.test.ts`
(each claim mutation-checked with a toggle CONTROL) plus the cube in
`src/components/table/overlays.test.tsx`.

ONE seam: `resourceDieFaces(state)` (adventure.ts) returns
`SINGLE_VALUABLES_RESOURCE_DIE_FACES` (2/4 materials, **1/1** valuables, 3/6 gold)
with the rule on, else `PRINTED_RESOURCE_DIE_FACES` (…, **1/2** valuables, …).
Face ORDER is identical between the two, so die-cube face indexes line up. The
old `RESOURCE_DIE_FACES` const is GONE on purpose — a stale reader fails to
compile instead of silently rolling the wrong die. Every consumer takes the
state-aware read: `rollResourceDice`, `setResourceDieOptions` (the
Cards-of-Prophecy "set the die" picks), the Pandora Income permanent die, and the
three Event dice (Mischievous Leprechaun pool + roll, Withered Hermit gamble +
pay). The UI cube takes the faces as the new `MapDiceOverlay.resourceLayout` prop
(page.tsx passes `resourceDieFaces(state)`; the default is the printed die).

Leading with the consequences / limits:
- **A LEGACY snapshot with no frozen flag now rolls the PRINTED die** — that is
  the user-demanded behaviour change, and it applies to in-flight legacy games
  (the frozen `adventure.houseRules` of a game started before this rule has no
  entry, so the mode default decides). A BINH game is unchanged (default ON).
- **"Set the Resource die" offers ONE pick per DISTINCT face**, so the picks are
  5 on the capped die (the two 1-valuables faces dedupe) and 6 on the printed die
  (the distinct "2 valuables" is a real, separately pickable option).
- **The Polish reduced-starting-bonus high-face reroll is LIVE on valuables
  again.** `isHighResourceDieFace` is a pure FACE predicate (6 gold / 4 materials
  / 2 valuables); its valuables clause was dead while the table hardcoded the cap
  and is now active on the printed die — a rolled 2-valuables is rerolled away,
  while 1 valuables is kept (the reroll targets the AMOUNT, not the resource).
  Bounded on both dice (2 materials / 1 valuables / 3 gold always remain).
- **The AI is not re-scored** — no computer policy reads the die table; a seat
  simply gains what it rolls.

## Recent-gameplay-fixes batch (2026-08-06): 15 commits, audited — what runs vs. limits

Fifteen codex commits landed together after a full audit (protocol bumped to
v19 — new actions/state below; a stale PartyKit edge shows the out-of-date
banner, `npm run deploy:partykit` still required). Leading with what the audit
REVERTED or fixed, then what each commit ships.

Audit reverts / fixes on top of the branch (each mutation-checked):
- **b9a0b7bc's Ⅶ-field identity lock and `grailAsUtopia:"always"` Grail→Utopia
  conversion were REVERTED** — they DESTROYED the Grail dig (the "always" mode
  converted the Grail FIELD to a Dragon Utopia, so the Grail victory was
  unwinnable and legacy saves broke). The shipped reading: under
  `grailAsUtopia:"always"` the field STAYS a diggable Grail but its guards are
  the Utopia dragons (`drawGuardArmyBase` → `drawDragonUtopiaArmy`); a
  designated `viiField:"grail"` still BEATS a printed Dragon Utopia (pinned in
  `vii-field-designation.test.ts` + `polish-grail-utopia.test.ts` — the dig
  completes, no shared-deck-search rewards leak). **The "always" guard-swap half
  is itself SUPERSEDED (2026-08-07)** — see "Grail → Utopia conversion" below:
  "always" is now a legacy alias of `after-dig-utopia` and swaps NO guards
  before a Grail is taken. The Ⅶ-field-identity-lock revert stands.
- **The tournament combat SANDBOX split-deck change was REVERTED** to legacy
  single decks: the sandbox's rules layer reads legacy defaults with
  `adventure: null`, so split decks were unreachable by every search there —
  dead searches silently DESTROYED cards (`combat-sandbox-setup.test.ts`).
  Real tournament GAMES do split (below).
- **accc1900's blanket map gate on `CREATE_ACTIVE_EFFECT` options was
  REVERTED** — it also killed legitimate map plays (Pathfinding, Crest of
  Valor). The two genuinely combat-only faces are flagged individually.
- The first-player ceremony gate, the Parry UI, the in-flight card contract
  and the AI regressions each needed fixes — noted per commit below.

What each commit ships:
- **Golden Bow timing** (`accc1900`): Golden Bow's ignore-penalties+attack
  side and Necklace of Dragonteeth's spell side are `combatOnly: true` — both
  were offered on the map where their effect could never apply (trap plays).
- **Ammo Cart tie** (`09884fcc`): test-only — pins the Ammo Cart reroll offer
  on a Creature-Bank guard initiative tie.
- **Ring of Sulfur re-tier** (`93ccc1cc`): house rule
  `eversmoking-ring-of-sulfur-major` (decks; default ON in BINH, OFF in
  Legacy) — the printed-Minor ring sorts/prices as a MAJOR artifact, the
  Torso-of-Legion pattern verbatim (static `artifactTier: "major"` = the
  rule-ON reading; `effectiveArtifactTier` returns the printed "minor" when
  OFF). AUDIT FIX: the branch left the static tier/tags "minor", failing the
  deck-coverage invariant. The card face stays the printed minor scan.
- **Tournament split decks** (`84d766d4`, extended 2026-08-08): a Tournament
  game plays with the BINH split Spell/Artifact decks. AUDIT FIXES: the
  `tournamentMode` MASTER toggle forces `houseRules["split-decks"] = true` at
  the `setGameOptions` seam (the branch set it only in the setup-hub button
  payload, so the Advanced-panel path missed it); an explicit houseRules
  payload still wins; the preset no longer flips `torso-of-legion-major`.
  **2026-08-08 — the GRANULAR path and the missing TICK**: the four tournament
  rules are individually toggleable, and assembling the package that way (the
  "Tournament rules" collapsible, no master click) reached tournamentMode
  all-on with a SINGLE-deck game — the bans applied, the decks did not, and
  nothing on screen said so. Both halves fixed: (a) the force MOVED to the
  master-resync block in `setGameOptions` (which also now re-derives on
  `tournamentObservatoryRerotate` — with the observatory ticked LAST the master
  flag never re-derived at all), so ANY path that turns the full package on
  applies it — master toggle, mode card, or the last granular tick; (b)
  `split-decks` is now a fifth visible TICK in the Tournament rules panel
  ("Divided Spell & Artifact decks", `screen.tsx`), the SAME house rule the
  BINH list shows — both rows read/write one setting, and un-ticking it is a
  plain houseRules payload the tournament seam never re-forces. Pinned in
  `tournament-split-decks.test.ts` (built game carries
  artifacts-minor/major/relic + spells-expert; granular all-four path; a
  PARTIAL package CONTROL that stays single-deck; un-tick stays off) and
  `game-options-tabs.test.tsx` (the row renders in `.tournamentRuleGrid` and
  dispatches `houseRules: {"split-decks": …}`, with a Legacy-defaults-OFF
  CONTROL). LIMIT: the force lives at the LOBBY seam only — a DIRECT
  `createAdventureGameState({ tournamentMode: true })` with no `houseRules`
  still builds one mixed Spell deck and one Artifact deck (no player path
  reaches it; every UI/lobby route goes through `setGameOptions`).
- **Unit-Stack valuables** (`87f3379c`): a Polish Stack purchase charges AND
  displays the side's printed valuables — folded into the Polish Unit Stacks
  section above.
- **Dragontooth one-spell** (`37a6b452`): the Crown of Dragontooth's Polish
  Spell Book side refreshes exactly ONE used Book Spell, not the whole used
  side (`polish-spell-book.test.ts`).
- **Utopia identity + Obelisk Grail clues** (`b9a0b7bc`, largely reverted —
  above): what SURVIVES is the **Obelisk Grail-clue offer** — in Grail
  victory mode an Obelisk visit may inspect ONE face-down tile
  (`GRAIL_TILE_SCRY` visit step): the owner privately sees the tile's real
  face, then hides it again. ONCE per player per Obelisk (the anti-farm
  latch rides the existing `alreadyHere` visit dedupe), never mid-combat and
  only while the hero stands on the Obelisk (`queueGrailClue` guards); a
  monolith-role Obelisk APPENDS its teleport step after the clue. The step
  bakes `tileDefId`/`tileRotation` into its payload because the owner's
  PLAYER VIEW masks every face-down tile to "hidden" — the art renders from
  the step, and other seats' views render nothing
  (`obelisk-house-rule.test.ts`, `obelisk-grail-clue-art.test.tsx`).
  **2026-08-10 (user rule, house rule / map design).** LIMITS FIRST: the pick
  now DELIBERATELY leaks that every offered tile hosts a Ⅶ objective — only
  face-down tiles whose resolved face can still be a **Grail OR a Dragon
  Utopia** are choosable (designation first, else the printed difficulty-7
  field; `isFaceDownGrailClueChoice`), so the scry only has to answer WHICH of
  them is the Grail; a Utopia-only map still offers NO clue (the gate is
  unchanged — a hidden Grail must really exist), so there is never a dead
  prompt. The tile is picked BY CLICKING its glowing face-down hexes on the map
  (`grailClueTargets` in screen.tsx, the Observatory pattern); the tray shows
  only the hint + "Do not inspect a tile". No protocol change: the engine's
  `options` stay index-aligned and labelled (AFK driver / AI scorer /
  screen readers), the click dispatches the very same `RESOLVE_VISIT_STEP`, and
  the picker is detected from its option STEPS. jsdom cannot compute CSS, so the
  glow itself is unverified — only the class/click contract is pinned.
- **Tome split-deck selection** (`5a094c7c`): a Tome's "take a Spell" on a
  split-deck table opens a basic-vs-expert deck pick (the expert deck honours
  the crown gate) instead of always digging basic (`tome-artifacts.test.ts`).
- **Bank Stack-Token duplicate cap** (`f649035f`): the four bank defenders'
  random Stack-Token stats reroll so no stat lands more than TWICE per bank
  (bounded reroll loop, 64-iteration backstop — AUDIT FIX: the branch loop
  could spin unbounded on a degenerate RNG). Pinned across 250 seeds in
  `creature-bank-combat.test.ts` (per-trial count still 4; exact pairs occur).
- **Halberdier Parry selectable discard** (`2b27ead9`):
  `USE_UNIT_DIE_IGNORE` now REQUIRES `discardCardId` — the player picks WHICH
  hand card pays the Parry (one offer per distinct card; a legacy
  no-discardCardId or not-in-hand forgery is rejected —
  `halberdier-parry.test.ts`). AUDIT FIX: the branch shipped NO UI surface —
  the reaction tray now renders a Parry tile per distinct hand card
  (CardFrame + "Parry", `overlays.test.tsx`).
- **Gelu VI draw house rule** (`2949bb20`): house rule
  `initiative-specialty-draw` (abilities; default ON in BINH, OFF in Legacy)
  — initiative-only specialty cards (incl. Gelu VI) may be discarded to draw
  1 card instead of the Initiative buff. The card TAGS label the draw side
  "House rule: …" so a rule-off table is not promised an option it lacks
  (`initiative-specialty-houserule.test.ts` sweeps the tags).
- **AI avoids doomed neutral fights** (`518003f6`): `combatIsHopeless`
  (computer/combat-policy.ts) retreats a clearly lost neutral fight instead
  of feeding the whole army. AUDIT FIXES: the ≤2-unit clause's threat ratio
  is TIERED on a real wound — 1.35× once wounded/with casualties, 2× while
  still unwounded (an unwounded retreat at the first continue window makes
  the map policy immediately send the army back in, an enter→retreat loop;
  a severe 2× mismatch still retreats cold, which is the commit's own pinned
  Mummies case); and the home-tile opening sweep keeps an equal-level home
  guard engageable (`map-navigation.ts` — the Impossible bronze cap
  otherwise refused the difficulty-2 home guard forever).
- **Instant card gain/recovery lifecycle** (`3071a80c`, the largest): every
  implemented instant draw/recovery face now works on the MAP (a draw-only
  twin per printed side, skipping faces that are already real map plays —
  DRAW_CARDS / RESHUFFLE / GAIN_HERO_MOVEMENT / mapOnly — and honouring
  printed per-option conditions) AND joins an EXISTING open reaction window
  as a `drawOnly`/`utilityOnly` reaction. Those flagged reactions NEVER open
  a window of their own (`reactionOfferOpensWindow` — without it a held
  Offense/Armorer would pause every enemy attack; the bare morale draw keeps
  its retaliation-only exception); a printed `mapOnly` face stays an
  ABSOLUTE bar for reaction joins (Shield of Naval Glory's sea side).
  Scholar/recovery picks exclude cards still RESOLVING: per-player in-flight
  ledgers (`recoveryInFlightCardIds` mirrors `castInFlightCardIds`;
  `modifiers.playedCardIds` rides the stack) filter TAKE_FROM_DISCARD /
  polish-used pools by OCCURRENCE (a genuine second copy stays takeable),
  and the in-window RESHUFFLE branch holds in-flight discard entries OUT of
  their own reshuffle. CONSEQUENCE (deliberate, Scholar-pinned): **a played
  card can never pick ITSELF out of its own TAKE_FROM_DISCARD window** — the
  Mystic Orb of Mana / Crown of the Five Seas take-back windows shrink by
  one where the played artifact used to be its own candidate (their tests
  updated to the new reading). AUDIT FIXES: three `stackInFlightCardIds`
  call sites passed the wrong player; a card with ANY side genuinely
  matching the window's printed trigger gets NO trigger-free utility joins
  for its other sides (`cardHasPrintedTriggerMatch` — the join would be a
  strictly-worse TRAP TWIN of the real reaction; Kriv I's rune-fizzling
  drawOnly twin masked the printed attack reaction and lost the
  softens-the-triggering-attack behaviour); GAIN_MORALE (Leadership) and
  TAKE_FROM_DISCARD (Scholar) keep their HISTORICAL unflagged
  window-OPENING status — a held Leadership must still be playable on an
  attack with no other reaction at the table — while all other joins are
  flagged non-opening (`reactionOfferOpensWindow`); the UI batch tray now
  threads `drawOnly` through group keys/labels/dispatch; the AI scores a
  drawOnly play at a flat 300 (`card.draw-rider-only`) so it never dumps a
  real combat instant for its rider. This SUPERSEDES the medic "no combat
  draw-only offer" limit, the Kriv I/IV exemption, AND the "Scholar/
  Leadership are the ONLY trigger-free instants allowed into an open window"
  scope (all recorded in place).
- **Computer-controlled neutral tactics** (`12b69a8e`): a computer
  PvP-Neutral-Control seat plays the guards with better target/landing
  picks through the existing controller machinery (score-layer only).
- **Computer winner ceremony pause** (`e25f6359`): when the opening
  first-player roll is won by a COMPUTER seat, the table pauses behind the
  ceremony overlay until a human dismisses it (`ACKNOWLEDGE_FIRST_PLAYER_ROLL`
  / `adventure.openingFirstPlayerRollPending`) — the AI no longer starts
  moving behind the announcement. AUDIT FIXES (the frozen-table class):
  the gate is the ONE shared predicate `firstPlayerCeremonyPending`
  (first-player.ts) re-deriving "a live human exists" — read by
  legal-actions AND `computerDecisionOwner` (window.ts stays in lockstep),
  so a table whose last human gives up before dismissing can never freeze;
  the client dismiss picks a LIVE HUMAN seat (an observer or computer-seat
  viewer could never clear it before); the reconnect restore no longer
  depends on the bounded event log (a synthetic id stands in); and the
  server drive scripts (`single-player-pump.test.ts` /
  `single-player-edge-start.test.ts`) acknowledge the ceremony so
  computer-won-roll seeds don't stall the harness.

## "Instant (any time)" cards inside a reaction window (2026-08-07)

Reported: "I should be able to use the card ballista (all speciality, ability...)
before counter attack as reaction window. Actually, all instant effects should be
able to be used as reaction window like that." Leading with the limits.

THE BUG (reproduced): off-turn with NO window open the engine already offered
every printed `combatAnytime` face (Gerwulf's discard-the-Ballista damage,
Adelaide's / Glacius' Frost Ring, Deemer's Meteor Shower, Tarnum-Dungeon's row
blast) — `getOffTurnCombatReactions` → the combat branch. But `getLegalActions`
returns ONLY the window's own list once a reaction window is open, and
`isCombatCardWindowOpen` switches the whole off-turn card pass off while a
window/stack is live. So those instants were unreachable in a window — and with
nothing else window-opening in hand NO window opened at all: the blow, the
Retaliation Attack and its damage all resolved inside ONE `ATTACK_UNIT` action,
leaving literally no moment to fire the Ballista before the counter-attack.

THE RULE (one seam): `combatAnytimeInstantWindowJoins` (legal-actions.ts) is
appended to `getLegalReactionsForTrigger` for BOTH fighters in EVERY window.
**SUPERSEDED 2026-08-08 — the OPENER half only** (see "Every instant OPENS an
attack window" below): it used to read "only the side about to be HIT may OPEN
an attack window with one", with the `LegalAction.windowJoinOnly` flag (the
action-type-agnostic twin of `utilityOnly`/`drawOnly`, read by the ONE shared
`reactionOfferOpensWindow` predicate) marking every other side/window as
join-only. Inside an ATTACK window EITHER participant now opens it; outside one
(a cast / activation / die-settled window) the flags still withhold the opener
exactly as described here, and every other claim in this section stands. The
reducer's PLAY_CARD tail now runs `advanceReactionWindowAfterPlay` when the
PRIORITY player plays in a window (the First Aid Tent `USE_ACTIVE_EFFECT`
precedent), so the spent card drops out of the refreshed offers and the parked
attack resumes; the priority gate keeps a parallel-turns bystander's quiet card
play from ever resetting someone else's window. Artillery is now also offered to
the ATTACKING side of an open window (join-only), so it can soften the unit about
to counter-attack.

Leading with what does NOT work / deliberate scope:
- **Never an opener outside an attack window**: a held Meteor Shower does not
  pause every Spell cast, unit activation or die-settled window at the table (it
  only JOINS them). CONTROL-pinned in both directions. (Still true after the
  2026-08-08 widening — that widening is scoped to `UNIT_ATTACK_DECLARED`.)
- **Not widened past the printed `combatAnytime` flag.** A `combatOnly` TURN play
  is not an instant and stays out — Gerwulf I's "Activate your Ballista",
  Gerwulf IV's free 1 damage, Gerwulf VI's ongoing "you aim the Ballista" — and a
  face with a printed reaction trigger is already a real reaction through the
  ordinary variant loop (Tarnum-Dungeon VI's "+2 attack"); giving it a join would
  be a strictly-worse trap twin (`cardHasPrintedTriggerMatch`). Casting a SPELL
  off-turn stays gated behind Intelligence (a printed rule). `mapOnly` remains an
  ABSOLUTE bar. All of this is a conscious registry
  (`DOCUMENTED_WINDOW_EXCLUSIONS` in the test), not silence.
- **A cost-bearing join is a payable TEMPLATE, not a one-click play**: the engine
  offers the Frost Ring with no `costCardIds`, and the shared submit path's cost
  picker attaches the payment (`normalizeActionForMatch` ignores `costCardIds` for
  PLAY_CARD, so the enriched play matches the offer). Pinned end-to-end.
- **UI: the tray lists only unit-target / target-less joins.** Space-target joins
  (Frost Ring's ring centre, the row blast) are ~20 offers, one per board cell;
  the reaction tray does not render twenty look-alike tiles, so their in-window
  pick surface stays the board's existing space-target arming — real-browser
  territory, NOT verified here.
- **A computer seat still PASSES rather than firing one** (its combat-damage band
  640–860 sits below PASS_REACTION 1_050) — unchanged behaviour, pinned so it can
  never become a stall; the AFK/turn-timeout driver closes the window with Pass.
- **`specialty.tarnum_dungeon.6` opt 0 needs a "Dragons" unit on the board**, so
  the sweep's fixture cannot offer it (0 offers off-turn AND in-window — the
  invariant holds trivially); its existence is still pinned by the registry test.

Pinned in `src/engine/combat-instant-reaction-windows.test.ts` (17 tests: the
retaliation-window open + offer with a no-Ballista CONTROL where the whole
exchange resolves at once, the shot REMOVING the retaliator so the counter never
lands, the survive-and-counter event ORDER, the spent-card refresh with an
"every offer executes" loop, the payable-template contract, the attacker-side
Artillery join, both "does not pause" CONTROLs, the driver/AI non-stall pair, and
the sweep + exclusion registry + mapOnly/hand-lock CONTROLs) and the tray tile in
`src/components/table/overlays.test.tsx`. Mutation-checked: removing the join
block fails 6, flagging the attacked side join-only fails 5, dropping the
`windowJoinOnly` read fails 6, removing the reducer tail fails 3, removing the
attacker-Artillery block fails 1, widening the opener past attack windows fails 1,
widening the filter to `combatOnly` fails 3, and removing the tray tiles fails 1.

## A printed FOLLOW-UP attack gives the ATTACKER a window too (2026-08-07)

Reported: "Phoenix breath attack — it's a separate attack and you should be able
to play instant cards before this attack (similar with other attacks of this
second-attack type like dragon...). This sometimes works but sometimes not, very
buggy." Leading with what was already right, then the one real hole.

ALREADY CORRECT (verified, now pinned for the first time): every follow-up attack
is declared through `declareAbilityAttack` → `declareAttack` →
`openDeclaredAttackWindow`, exactly like a primary or Retaliation Attack. So the
DEFENDING side's printed reactions (Armorer, Bless…) always got a real pre-hit
window on the second hit, and so did the ATTACKER's printed attack buffs (Offense,
Bloodlust — they match the `UNIT_ATTACK_DECLARED` trigger). No queue member
resolved as bare damage.

THE BUG: the attacker's TRIGGER-FREE instants. 31d6c866 flagged the attacking
side's `combatAnytime` joins and Artillery `windowJoinOnly` — "the other side had
its whole activation to play the card". That holds for a PRIMARY attack (the
attacker chose to declare it, with the on-turn card pass open right up to that
moment) but is FALSE for a follow-up, which the ENGINE declares mid-resolution
with no moment in between. So a Phoenix/dragon owner could fire the Ballista
discard / a Frost Ring / a Meteor Shower / Artillery before their FIRST hit but
never before their SECOND — and in a NEUTRAL fight, where the guards never open a
window, no window opened for the second attack at all. Holding Offense → a
window; holding a Ballista → none. Exactly the reported intermittency.

THE RULE (one seam): `followUpAttackInstantOpener` (legal-actions.ts) returns the
ATTACKING side's controller for a `UNIT_ATTACK_DECLARED` event carrying
`abilityAttack`; that side then joins the `instantJoinOpenerIds` set beside the
attacked side, and its Artillery offers drop `windowJoinOnly`. Both call sites
read the ONE predicate, so they cannot drift. **SUPERSEDED 2026-08-08** by the
broader "Every instant OPENS an attack window" rule below — this narrower
predicate is still wired and still correct, but every attack window now opens
for either participant's playable instant, so it no longer decides anything on
its own.

Leading with what does NOT change / deliberate scope:
- ~~**A PRIMARY attack still never pauses for the attacker's own instant**~~ —
  SUPERSEDED 2026-08-08: it does now (the user ruling "when attack and when
  defend, all of them"). A Spell cast, a unit activation and a die-settled
  window still pause for nothing, CONTROL-pinned in both files.
- **Effect damage is untouched**: the Chakra Burst / Full Barrage
  `AFTER_ATTACK_SPLASH`, Magog splash, Automaton detonate and the Dreadnought
  allocation are not attacks, declare no `UNIT_ATTACK_DECLARED`, and open no
  window — CONTROL-pinned.
- **Scoped to `abilityAttack`**, i.e. the printed "second attack" family the
  report names: `SECOND_ATTACK_BEHIND_TARGET` (Phoenix `dragon-line-attack-2`,
  Gold/Black Dragons `-3`, the commander's Dragon Eye Ring, Factory Mechanics),
  the Lich Death Cloud, the Hydra/Ayssid extra strike, the attack-all queue
  (Magic Elementals, Whirlwind Strike, Cerberi), Wolf Raiders'
  after-retaliation strike and the Arachnotron's queued volleys. DELIBERATELY
  OUT: the Marksmen/Elves ranged double-shot (`DOUBLE_ATTACK`) and the Factory
  Sandworm's cube re-attack — neither carries `abilityAttack`; the double-shot
  is one printed volley at the same target, and the Sandworm's repeat is a
  fresh action its own player declares (so that player DID have the moment).
- **A NEUTRAL attacker gains nothing** (the neutral seat has no PlayerState, so
  the opener id matches no player) and the follow-up's own maths, ordering and
  retaliation parking are unchanged.
- **A computer seat still PASSES** rather than firing (its combat-damage band
  sits below `PASS_REACTION` 1_050) — unchanged, pinned so it can never become a
  stall; the AFK / turn-timeout driver closes the new window with Pass too.

Pinned in `src/engine/follow-up-attack-reaction-windows.test.ts` (12 tests: the
repro with a nobody-else-can-react CONTROL, the instant resolving BEFORE the
second hit's damage, Artillery, a shot that removes the second target dropping
the parked follow-up, the Gold Dragon `-3` twin, the Wolf Raiders family, the
defender-side window really lowering the second hit with a pass-it CONTROL, the
primary-attack / splash / cast scope CONTROLs, and the AI + AFK non-stall pair).
Mutation-checked: neutering `followUpAttackInstantOpener` fails 7, reverting only
the Artillery call site fails 4, reverting only the instant-join call site fails
4, and dropping the `abilityAttack` scope fails 6 (including the primary-attack
CONTROL). NOTE: the primary-attack CONTROL was FLIPPED on 2026-08-08 (below), so
that last mutation count no longer holds.

## Every instant OPENS an attack window · medic draw play on your own turn (2026-08-08)

USER RULING, verbatim: "instant abilities should be able to be played before
counter attack, when attack and when defend, all of them, FIX PROPERLY. and now
I still can't use card like Rion speciality, not for heal, just for draw effect,
choice never appear properly." Two gaps, both reproduced before the fix.

**GAP A — nothing opened the window.** The 2026-08-06/07 batches let a
trigger-free instant JOIN a reaction window but never OPEN one: the flagged
`drawOnly` / `utilityOnly` joins (Rion and every other draw rider) and, for the
"wrong" side, the `combatAnytime` instants and Artillery
(`LegalAction.windowJoinOnly`). The justification was "the other side had its
whole activation to play the card". In a NEUTRAL fight the guards hold no cards
and open nothing either, so with only such an instant in hand NO window opened
at all — the blow, the Retaliation Attack and every point of damage resolved
inside ONE `ATTACK_UNIT` action. Reproduced: a guard's shot at a defender holding
only Rion I, with nothing wounded, left the medic unplayable for the whole fight.

**GAP B — the medic had no own-turn combat play.** On your own activation the
draw-only PLAY_CARD twin (the Offense/Armorer/Sorcery path) deliberately excluded
`HEAL_DAMAGE`. Rion I / Astra I print a `damagedOnly` target, so with nothing
wounded they yielded ZERO offers — unplayable in combat, full stop. Reproduced.

**THE RULE — ONE seam per gap:**
- `reactionOfferOpensWindow` (legal-actions.ts) now returns TRUE for
  `windowJoinOnly` / `drawOnly` / `utilityOnly` offers when the trigger is
  `UNIT_ATTACK_DECLARED` — primary, Retaliation Attack and printed follow-up
  alike, for EITHER combat participant. Both gates that read this predicate
  (the utility-strip tail in `getLegalReactionsForTrigger` and
  `openReactionWindowForTrigger` in reducer.ts) move together, which is what
  keeps them from disagreeing. `followUpAttackInstantOpener` and the per-side
  `instantJoinOpenerIds` set are still wired and still correct; they are simply
  subsumed by the broader rule.
- `addPlayableCardActions` (legal-actions.ts) offers a target-less
  `drawOnly: true` PLAY_CARD twin for a plain medic face whose real play yielded
  NO targets, on the owner's own activation — the `healDrawOnlyRider` read the
  map offer already used. Resolution rides `playCard`'s existing `action.drawOnly`
  branch (`instantDrawOnlyRider` already covers `HEAL_DAMAGE`).

Leading with what does NOT work / deliberate scope:
- **ONLY attack windows changed.** A held Meteor Shower / Rion / Offense still
  never pauses a Spell cast, a unit ACTIVATION or a die-settled window — those
  offers stay pure joins there. CONTROL-pinned in three files.
- **The bare positive-Morale TOKEN is NOT widened.** The ruling names instant
  ABILITY CARDS, and a token is held by nearly every seat nearly always, so it
  keeps its Retaliation-Attack-only opener. CONTROL-pinned.
- **MORE PAUSES, by design.** Attacking or defending while holding any playable
  instant now stops the exchange for a confirm/Pass — including on your OWN
  primary attack. That is the ruling; it is the cost of "all of them". The
  window still opens ONLY when the holder has at least one genuinely playable
  offer (an empty hand is CONTROL-pinned to open nothing), and Pass resumes the
  parked attack byte-identically (attack maths, ordering and retaliation parking
  are untouched).
- **The own-turn medic twin is withheld when a real heal target exists** — a
  heal draws too, so a draw-only twin beside it would be a strictly-worse trap
  button. CONTROL-pinned.
- **No per-CHOOSE_ONE-option medic twin.** Every shipped CHOOSE_ONE medic (Rion
  IV/VI and clones) targets ANY friendly unit, and a friendly body must stand for
  your activation to be open at all, so such a twin could never be reached;
  unreachable offer code is what this repo's rules forbid. A future `damagedOnly`
  CHOOSE_ONE face needs it added WITH a test (noted at the offer site).
- **The AI still PASSES** in every one of these windows (its combat-damage and
  `card.draw-rider-only` bands sit below `PASS_REACTION` 1_050) and prices the
  new own-turn medic play at the flat **300** — so a computer seat never dumps a
  heal for a draw and can never stall. The AFK / turn-timeout driver closes the
  new windows with Pass. Both pinned, plus a full AI-vs-AI exchange with both
  seats holding instants driven to settlement.

Pinned in `src/engine/instant-abilities-attack-windows.test.ts` (17 tests: both
repros, the empty-hand no-pause CONTROL, the attacker's own primary window, both
sides in one window, the retaliation window, a follow-up window, an END-TO-END
real NEUTRAL guard fight, the own-turn medic draw play + its wounded-unit and
CHOOSE_ONE CONTROLs + the AI score, the three non-stall cases and the three
scope CONTROLs). Mutation-checked: reverting the `reactionOfferOpensWindow`
widening fails 10 tests across 5 files; removing the `healDrawOnlyRider` twin
fails 2.

FLIPPED EXPECTATIONS elsewhere (each justified in place, in its test comment):
`combat-instant-reaction-windows.test.ts` ("holding Artillery does not pause your
OWN declared attack" → it does now; the rest reach the retaliation window through
a new `declaredPastPrimary` helper), `follow-up-attack-reaction-windows.test.ts`
("a PRIMARY attack still does not pause…" → it does now),
`medic-specialty-heal-draw.test.ts` ("a lone medic card never OPENS a window of
its own" → it does now — that WAS the reported bug; and the Rion IV
nothing-to-fix CONTROL now asserts no unit-TARGETED offer rather than no offer at
all), `neutral-reaction-pause.test.ts` ("a trigger-free 'Draw a card' instant
never forces a reaction window open" → it opens one now, optionally, with Pass
always offered) and `bulwark-heroes.test.ts` (the non-Bulwark holder is still
never offered the real RUNE reaction; its draw-only twin now joins).

## EVERY card-gain instant works on the map AND in an attack window (2026-08-10)

Reported: "Solmyr 4 can't be used in map => STILL VERY BUGGY, I ALREADY TOLD U TO
MAKE ALL INSTANT CARDS LIKE THAT CAN BE USED IN MAP AND AS REACTION WINDOW, CHECK
ALL." Leading with the limits.

**WHY THE 2026-08-06/08 BATCHES MISSED IT.** Their sweep walked only
`timing === "instant"` cards, and only the `DRAW_CARDS` / `TAKE_FROM_DISCARD`
faces plus the "then draw N" riders. Two axes were invisible to it:
- **TIMING.** `specialty.solmyr.4` ("Discard up to 3 cards from your Might and
  Magic deck and return 1 of them to your hand" — pure card manipulation, no
  combat clause at all) and `specialty.ingham.6` ("… — OR — Draw 1 card") both
  shipped as `timing: "combat"` + `phaseLimit: ["combat"]`. That is exactly the
  gate `addTurnCardActions` (map: instant/ongoing/map only) and
  `allowTriggerlessUtility` (window join: `timing === "instant"`) key off, so
  NEITHER card could be played on the map or in a window at all — the report.
- **EFFECT KIND.** The deck DIG / SEARCH families had a map play but no window
  join: `DECK_DIG_KEEP_ONE`, `DECK_DIG_KEEP_MATCHING`, `SEARCH_DECK_THEN_RESHUFFLE`,
  `DRAW_TOP_ARTIFACT`, `CARD_DECK_SEARCH`, `EAGLE_EYE_DIG`,
  `REMOVE_HAND_CARD_THEN_SEARCH` (22 faces).

**THE FIX, in three parts.**
1. **DATA (the two mis-timed cards).** `specialty.solmyr.4` is `timing:
   "instant"` with NO phaseLimit (the Jeddite-dig shape); the shared
   `ignoreDefenseOrDrawSpecialty` generator (Ingham VI) is `timing: "instant"`
   KEEPING `phaseLimit: ["combat"]` — the shape every other
   "<combat effect> — OR — Draw N" specialty already had (Catherine VI, Gelu VI…),
   so its combat side stays combat-gated while its printed draw reaches the map.
2. **ONE resolution per effect, shared by both paths.** Four helpers in
   `reducer.ts` — `resolveDeckDigKeepOne` / `resolveDeckDigKeepMatching` /
   `resolveDrawTopArtifactPlay` / `resolveSearchDeckThenReshuffle`, plus the
   extracted `openCombatRemoveThenSearchChoice` — are called by `playCard` AND by
   `applyReactionPlayCore`, so a window join can never behave differently from
   the same card played on your own turn. `DECK_DIG_KEEP_ONE` also joined the
   `DECK_DIG_KEEP_MATCHING` case of `isOptionEffectPlayable` (which is what
   `isMapPlayableEffect` reads), and the seven kinds joined
   `isDeckGainReactionUtility` → `isInstantReactionUtility` +
   `isEffectLegalForTrigger` (each gated on there really being something to gain,
   so a join can never spend the card for an empty dig).
3. **DECK_SEARCH now parks a window** (new): `advanceReactionWindowAfterPlay`
   pauses on a `DECK_SEARCH` pendingChoice as well as an `OPTION_CHOICE`, and the
   `RESOLVE_DECK_SEARCH` dispatcher grew the CHOOSE_OPTION tail's twin. Without
   BOTH halves a Search instant played as the LAST card in hand closed the window
   "all-pass" and resolved the parked blow under an unanswered Search (the
   2026-08-06 Scholar shape) — and without the tail alone the window is stranded
   open forever. Keep them together.

Leading with what does NOT work / deliberate limits:
- **`wog.artifact.magic_wand` option 0 still never joins a window** — a printed
  `mapOnly` face is an ABSOLUTE bar (the Shield-of-Naval-Glory rule). Its map
  play works.
- **A card whose OTHER side matches the open window's printed trigger still
  offers nothing else there** — the shared trap-twin dedupe
  (`cardHasPrintedTriggerMatch`). So Kriv VI's "draw 2" is withheld in an ATTACK
  window (option 1 is a printed "React to an enemy attack") and the Surcoat of
  Counterpoise's Search side is withheld in a CAST window (option 0 is its
  printed spell-cancel). Both are correct: the printed reaction is what belongs
  in that window.
- **MORE PAUSES.** Holding any card-gain instant now stops an attack for a
  confirm/Pass, and a Search/dig join parks the exchange until its choice is
  answered. That is the ruling; Pass resumes the parked attack byte-identically.
- **The AI never spends one**: a card-gain effect scores in the map-search band
  (610), below `PASS_REACTION` (1_050), so a computer seat keeps the card — and
  the AFK / turn-timeout driver closes the window with Pass. Both pinned so
  neither can become a stall.
- **`timing: "map"` and `timing: "town"` card-gain faces are out of scope** (a
  printed Map card is map-only by definition; `ability.wisdom` is a town action).
- **The one behaviour change beyond the offers**: Solmyr IV losing
  `phaseLimit`/`timing: "combat"` means it no longer needs your own unit's
  activation to be played mid-combat — it is an Instant, like Jeddite's dig.

Pinned in `src/engine/instant-card-gain-legality.test.ts` (20 tests; the file's
older sweeps are kept and still pass). The new half is a LIBRARY-DERIVED sweep
over BOTH axes — every implemented non-map/town face carrying any of the ten
card-gain effect kinds must have a map play AND a join in an open
`UNIT_ATTACK_DECLARED` window — plus `DOCUMENTED_WINDOW_EXCLUSIONS`, a registry
whose every entry is itself asserted to be genuinely withheld (no dead
exclusions). Behaviour tests: Solmyr IV's map dig and its in-window dig with the
parked blow landing only afterwards, Ingham VI's map draw with its combat-only
side as the CONTROL, Jeddite/Tazar resolving in-window, the Search park/resume
round trip, and the AI + AFK non-stall pair. Mutation-checked: reverting
Solmyr IV's timing fails 6, reverting the Ingham generator fails 3, dropping
`DECK_DIG_KEEP_ONE` from `isOptionEffectPlayable` fails 2, neutering the
reaction-resolution block fails 4, dropping `isDeckGainReactionUtility` fails 7,
reverting the `DECK_SEARCH` pause fails 1 and removing the `RESOLVE_DECK_SEARCH`
resume tail fails 1.

## AI opening route · multi-target combat rules · border-free hexes (2026-08-09, protocol v24)

The `fix-ai-map-combat-rules` batch + its audit (audit fixes marked). Protocol
bumped to **v24** — `npm run deploy:partykit` owed, or a stale edge rejects the
new movement/legality reads with "not legal" errors.

- **Chain Lightning needs 3 living PLACED units** (the spell, Solmyr I/VI): the
  cast names the selected unit + the 2 closest, so with fewer bodies no offer
  exists and a forged play is rejected with the printed requirement
  (`getTargetsForCard` + the `assertLegal` message; unplaced/removed units and
  the −1-position Arrow Tower never count). The FINAL two differing bolts
  (max-Power 2/1) now open the `chain-lightning` ABILITY_TARGET_CHOICE — the
  caster may put the larger bolt on either closest unit
  (`advanceChainLightning`'s `remainingValuesDiffer`). Helper coach explains
  both. Pinned in `library-cards.test.ts` / `tower-hero-specialties.test.ts`.
- **Deemer's Meteor Shower is an EXACT multi-target effect, not an "up to"
  blast**: the chosen centre must have its printed count of living adjacent
  picks (I = 1, VI = 2) or the play is not offered and a forged one is rejected
  (`addOptionPlays` filter, scoped to `specialty.deemer.*` — Frost Ring /
  Fireball / space-target cards keep their own rules; the reaction-window joins
  route through the same seam). AUDIT: five pre-existing fixtures elsewhere
  (pvp-reaction-stop, enemy-turn-instant-windows, pre-hit-heal-reactions) had
  single-adjacent Deemer stagings and were updated to satisfy the printed
  picks. Pinned in `frost-ring-meteor-shower.test.ts`.
- **Catapult needs an adjacent PAIR**: the round-start fire offer was already
  gated; `resolveWarMachineOption` now also throws before paying when no two
  adjacent targets exist (stale/forged clients). `catapult-siege.test.ts`.
- **Banks / PvE Gates / Field Override hexes are ALWAYS border-free — render
  AND movement** (the `showBankBorders` toggle is REMOVED): see the reworked
  Creature-Bank border bullet. AUDIT FIX (invisible walls): the branch hid the
  designer lines but movement still sealed them — `fieldNeverWearsBorders` in
  `isDesignedEdgeSealedBetween` is the edge-level early-out (per-side gating
  was dead: an inner edge's two encodings fold to ONE canonical code).
- **AI two-turn opening route** (`bestHomeOpeningObjective`,
  map-navigation.ts): on tile Ⅰ the hero banks the two nearest of the three
  stock payoffs (resource / treasure / mine) on turn 1, leaving the payoff that
  is an open expansion DOORWAY for turn 2 — then opens a Ⅱ–Ⅲ tile and ENTERS it
  before any second discovery (`map.finish-home-before-discover/place`,
  `map.enter-opened-tile-before-more-discovery`, `map.enter-first-opened-tile`
  930, all rounds ≤3). AUDIT FIX: the 930 entry boost bypasses moveScore's
  can-beat read, so it is now gated on a SAFE entry (unguarded or
  `canBeatGuardedField`, no enemy hero on the hex) — otherwise a beaten hero
  fell back home and the boost re-armed, a repeated-suicide loop. Pinned in
  `map-navigation.test.ts` ("enter-first-opened-tile boost — safe entries
  only") + `single-player-opening.test.ts` (every faction: two payoffs turn 1,
  all by turn 2, expansion entered by turn 3). CONSEQUENCE (measured, floors
  re-based in `single-player-premium-rush.test.ts`): the Impossible gold-BODY
  fast tail moved R10→R12; every other benchmark floor is unchanged.
- **A hero on a STANDALONE Monolith is selectable again** (AUDIT, user
  report): the standalone-hex pawn was hardcoded `pointer-events: none`, so
  every click fell through to the teleport hex ("you select the monolith
  instead of the hero") — it now takes the tile-pawn's click-to-switch wiring
  (`hero-position-override.test.tsx`, with an opponent-pawn CONTROL).
- Menu polish: `/story` Back returns to `/menu?view=singlePlayer` (the Single
  Player submenu), not the obsolete standalone `/single-player` screen.

## Random Town defenders match the printed card (2026-08-04)

The Ⅶ Random Town's DEFAULT defense army is now the printed Stretch-Goals card:
**ONE Pack of BRONZE-tier units** (the card's bronze-star slot, given to "the
player who controls the defense during this Combat") **+ TWO Packs of SILVER-tier
units + TWO Fews of GOLD-tier units**, all from the faction not in play
(`randomTownGuardDraws`, adventure.ts). BEFORE it was 1 bronze Pack + 2 silver
Packs + 2 gold PACKS, with the strongest bronze silently standing in for the
choosable slot — so the change makes that bronze body a real player CHOICE (with
a cost-based default) and flips the two gold bodies from Pack to FEW. Unchanged and re-pinned: the field is difficulty **Ⅶ** whatever a designer
stamps (`startNeutralEncounter`), the fight adds **Walls + a Gate and NO Arrow
Tower** (`arrowTowerUnitId: null`, deterministic gate column), and the faction is
picked SEEDED-random (`adventureRandom`, never `Math.random`) from the playable
factions NOT in play — in every mode, so single player already matched the user's
"random from those not participating".

Leading with what does NOT run / deliberate limits:
- **The choosable bronze Pack only ever opens a window for a HUMAN defense
  controller** — a PvP-Neutral-Control seat or the manual-guard-control fighter
  (`neutralCombatControllerId`). The Neutral AI, a COMPUTER controller and EVERY
  single-player table (`sessionMode === "single-player"`) instead take the
  DEFAULT with no pause: the faction's **highest printed Pack cost** bronze unit
  (materials/valuables at Trading Post rates, ties keep roster order —
  `randomTownDefaultBronzePackId`, the user rule "just set the [brown/bronze]
  unit as the one with the highest cost").
- **The multiplayer printed faction PICK is still not modeled** — the card has
  every player roll 2 Attack dice with the highest roller choosing the faction
  (or drawing a Town Card). The engine keeps its seeded pick for every mode; only
  the DEFENDER Pack is a real player choice.
- **No bespoke UI**: the pick renders through the generic OPTION_CHOICE prompt
  tray (context `random-town-pack`), one button per bronze candidate.
- **Never strands the setup**: the choice is created NEUTRAL-owned and re-stamped
  to the controller by the reducer pump like every other neutral-side follow-up;
  it is registered in `isNeutralSideCombatChoice`, so an eliminated controller
  hands it BACK to the Neutral seat, and with nobody live left to take the guards
  `autoResolveRandomTownPackChoice` (reducer pump) keeps the default and reveals.
- A faction short of a printed body for a slot falls back to a same-tier NEUTRAL
  draw (`packDrawWithNeutralFallback` / `fewDrawWithNeutralFallback`, the designer
  "packs" level-guard precedent), so the fight always fields the printed five
  bodies. Every shipped faction has 3 bronze, 2 silver and 2+ gold Pack/Few
  sides, so the fallback is a safety net today, not a live path.

Pinned in `src/engine/random-town-defenders.test.ts` (the minted combat units'
sides/tiers/stats, the highest-cost bronze default with a cheapest-bronze CONTROL
and a per-faction cost-table sweep — Heavenly Demon's dearest bronze is the MIDDLE
roster entry, so a "last bronze" reading fails it —, the not-in-play + determinism faction CONTROLs, the
Ⅶ + Walls/Gate/no-Arrow-Tower pins, the single-player no-pause case, the human
controller's pick actually minting their unit, and the eliminated-controller
auto-resolve) plus the composition pin in `creature-bank-guards.test.ts`.

## Grail → Utopia conversion: at the DIG, never the dug field, full reward (2026-08-09)

Three rules, applied to BOTH surfaces (the `polish-grail-utopia` house rule AND
the map-editor `objectives.hiddenGrailUtopia` package) and to the designer
`grailAsUtopia` knob: the conversion fires when a Grail is TAKEN (dug), the dug
field itself never turns, and — since 2026-08-09 (protocol **v23**; the earlier
2026-08-07 reading made a converted site reward-FREE) — a converted extra Grail
**pays the normal Utopia field reward** while staying excluded from
original-objective credit. A stale PartyKit edge shows the out-of-date banner;
`npm run deploy:partykit` required.
Engine: `applyGrailTakenConversion` / `grailTakenConversionTarget` /
`grailConversionActive` + the `materializeTileFields` reveal branch
(`src/engine/adventure.ts`), the Dragon-Hunt fast path in `adventure-reducer.ts`.
Pinned in `src/engine/grail-converted-utopia.test.ts` (every claim
mutation-checked, both surfaces + the knob + classic) plus the reworked cases in
`polish-grail-utopia.test.ts` and the converted-site cases in
`grail-mode.test.ts`.

Leading with what CHANGED / the deliberate limits:
- **`grailAsUtopia: "always"` is a LEGACY ALIAS of `after-dig-utopia`** and
  its pre-dig hybrid is GONE. It used to make EVERY Grail field fight the Utopia
  dragon party from round 1 while still digging (the 2026-08-06 audit reading, one
  section above); "only act like utopia AFTER A GRAIL IS TAKEN" forbids exactly
  that, so the `drawGuardArmyBase` guard swap was deleted — an undug Grail field
  draws its normal Grail guards in every mode. Saved maps still load (the id is
  kept and resolves to the after-dig conversion). No shipped scenario/map sets it.
- **A CONVERTED extra Grail pays the NORMAL Utopia field bundle** (2026-08-09,
  reversing the 2026-08-07 reward-free reading): the fixed Search 3 / 5 / 5
  Artifact ladder plus the surface's own gold (Polish 20 / plain 10 / package 0)
  and, under the field-rules package, the Morale / Ability-Empower token pick.
  `field.grailConverted` stays purely an ORIGIN marker for objective
  bookkeeping. Designer-authored rewards on that hex (centre-hex reward/VP, hex
  events) still pay on top — they resolve in `beginFieldVisit` before the
  handler, as always.
- **A converted site is still NOT an ORIGINAL objective for victory purposes**:
  no `recordVpUtopiaDefeat` credit, so it never feeds the
  `defeat-dragon-utopia` VP objective or custom win condition; no Dragon-Hunt
  instant win (guarded at BOTH seams — `handleDragonUtopiaVisit`'s mode branch
  and the reducer's post-combat fast path); no Dragon-Conqueror capture/flag, so
  it can never become a hold-to-win stronghold — under those two modes it falls
  through to the plain reward branch instead (the visit-handler guards are
  REACHABLE because the designer `grailAsUtopia` knob works WITHOUT the
  field-rules package; pinned in `grail-mode.test.ts`, both modes with a
  real-Utopia CONTROL). DELIBERATE: on a map whose ONLY Utopias are converted
  Grails, a Dragon-Hunt / Dragon-Conqueror victory is unreachable and the game
  ends by conquest / last-faction-standing instead. (The package seeds real
  Utopias alongside its Grails, so this is a hand-built-map edge.)
- **The DUG field never turns**, enforced by id (`adventure.grailTakenFieldId`)
  at BOTH conversion seams — the field sweep and the tile-reveal branch — so even
  a re-materialize of its tile (a rotation) leaves it a spent Grail dig site
  (black cube, no `grailDiggable`, no `grailConverted`).
- **A spent (black-cubed) extra Grail CONVERTS but is not resurrected**
  (2026-08-09, USER REPORT "this field was an empty grail field (but it should
  have changed to utopia after digging grail from 2nd tile)"). It used to be
  SKIPPED, so whether the map's other Grail turned at all depended on the
  accident of having cleared its guards first — a cleared one sat there as an
  inert Grail for the rest of the game. It now takes the same conversion, and
  KEEPS its Black Cube: a beaten site is never re-fought (that would re-pay hero
  experience — and now the Utopia reward — for guards already beaten). Pinned in
  `grail-converted-utopia.test.ts` ("an extra Grail whose guards ALREADY fell
  converts too — and stays spent", with the unfought extra Grail as the CONTROL
  that becomes a fresh, still-fightable Utopia).
- **Legacy snapshots**: `grailFieldCleared` is now only a legacy MIRROR (it used
  to be the pre-dig trigger). `grailConversionActive` honours it only once
  `grail.status` proves the Token was really taken, so a mid-game v19 snapshot
  that cleared a guard but has not dug stops converting on reveal. Fields that
  ALREADY converted in such a game keep their `dragon_utopia` location and, having
  no `grailConverted` marker, still pay the old reward — that game keeps its old
  reading, by design.
- One extra tidy-up, unconditional in every mode: taking the Grail clears
  `grailDiggable` from every OTHER Grail field. Only one Token exists, so an
  armed flag there was selling a 1-MP Revisit that resolved to nothing.

What runs (each with a failing-if-removed test):
- The conversion trigger is the DIG (`handleGrailVisit`'s revisit branch), never
  the guard clear. `grailTakenConversionTarget` is the ONE place the package and
  the knob resolve, so the two surfaces cannot drift: `after-dig-empty` →
  `empty_field`; `after-dig-utopia` / `always` / either package flag →
  a normally-rewarded `dragon_utopia`; nothing set → classic (an extra Grail
  stays a Grail dig site, byte-identical to before).
- A converted field is a REAL fight: `difficulty 7`, black cube cleared, and its
  guards come from the Utopia draw (the package's table row + one Black Dragon;
  `drawDragonUtopiaArmy` on a plain map). Pre-dig the same field draws Grail
  guards — the tests discriminate on the Black Dragon / the four-dragon party.
- A Grail site whose tile was still face-down / in the Far supply at dig time
  converts on REVEAL (`materializeTileFields`, using the conversion frozen at the
  dig in `adventure.grailTakenConversion`), and a reveal BEFORE any dig does not.
- Hygiene: every carve that rewrites a hex's identity (teleport tokens, gates,
  banks, the Calamity Gate, the Dungeon, Field Overrides) drops `grailConverted`
  with the rest of the old identity.
- UI honesty: the map-editor row is "Extra Grail site after the dig" with
  "→ Utopia" / "→ empty" / "Always (legacy)" chips and per-chip tooltips naming
  the Search 3 / 5 / 5 payout; the lobby/designer banner line reads "After the
  Grail is taken, other Grail tiles become Utopias (Search 3 / 5 / 5)". The
  hidden-package section no longer claims "there is no after-dig conversion"
  (it always had one).

## A Subterranean Gate crossing SLIPS PAST the far guard — it never clears it (2026-08-07)

USER RULE, verbatim: "when you choose option 'travel through the gate', there
should be no combat on the other side -> true, but it's a one time bonus. If you
stay and then enter later (or someone else) there is a fight." THE BUG: crossing
OUT through a linked Subterranean Gate ran `autoWinArrivalGuard` (adventure.ts),
which `clearCustomGuard`-ed the far half and logged "swept aside … automatic
victory" — so the FIRST traveller destroyed a designer gate guard permanently,
for the whole table. Fixed at ONE seam: `performHeroStep` no longer sweeps; it
passes a `gateTravel` flag into `resolveHeroArrival`, whose guarded-field arm
returns early with a note (`noteGateTravelSlipsPastGuard`) instead of calling
`startNeutralEncounter`. The guard object is untouched, so `isFieldGuarded`
stays true and every later arrival takes the normal path. Pinned in
`src/engine/designed-gate-links.test.ts` ("designed gate links — guarded
halves", 8 cases).

Leading with what does NOT change / deliberate limits:
- **The pass is PER TRAVEL, not once-ever.** A hero may cross the tunnel back
  and forth (the crossing is the free 0-MP "one Field" step) and never fight;
  it also never gains anything, because the guarded hex is not visited. The
  alternative "strictly one free pass, fight from the second" reading was
  considered and rejected — the user's "one time bonus" is glossed by their own
  next sentence ("if you STAY and then ENTER later … there is a fight"), i.e.
  the bonus belongs to the travel, not to the field.
- **Teleport NETWORK arrivals are UNCHANGED and still FIGHT** (Monolith /
  Teleport Gate / Whirlpool / one-way, `RESOLVE_TELEPORT_ARRIVAL`, the
  2026-07-24 rule). Only the linked-gate WALK slips past. Note the user's phrase
  "option 'travel through the gate'" is literally the colored-Gate travel label
  (adventure.ts:10645); the subterranean gate has no such menu. The fix was
  scoped to the subterranean gate because that is the ONLY place where "no
  combat on the other side" was ever true.
- **No visit either**: a guarded field is never visited on arrival, so the pass
  does not collect the gate's own `SUBTERRANEAN_GATE` step (the free other-layer
  tile reveal — which the traveller has already seen, having come from there),
  and `lastVisitedField` stays at the ORIGIN half, so a retreat from a later
  fight on that hex bounces back down the tunnel.
- **A hero may PARK on a live-guarded gate hex.** That is the documented
  `clear_tile_cubes` precedent (a re-armed guard under a stationary hero): the
  gate's location category is `empty`, so no Resolve/Revisit is offered, moving
  off and END_TURN both work, and the hero must step off and back on to fight.
- **AI limit (not a stall)**: a beatable guarded gate exit is a `"guard"`
  objective, and a computer hero whose march ENDS with the gate crossing arrives
  without fighting and then sits at objective distance 0 — the potential field
  scores every step away as negative, so it ends its turn rather than
  oscillating (`objectiveDistanceField` is strictly decreasing). It fights the
  guard only when it approaches from the same layer. Guarded gate halves exist
  only on designer maps, so this is a niche park, never a freeze; the full
  `computer/` + single-player suites are green.
- **UI/doc honesty**: the designer's ⚔ Guards tooltip on a gate link now says
  the crossing slips past and the guard stays. Two neighbouring designer hints
  and two `state.ts` doc comments that still promised a teleport-network
  "auto-win" were stale since 2026-07-24 and were corrected in the same pass
  (text only, no behaviour).

What runs (each case fails if the wiring is removed): (a) crossing out arrives
with `combat === null`, `field.difficulty` still 4 and a "slips past" note (no
"swept aside"); (b) the same hero stepping off and back on opens the neutral
fight; (c) another player's hero walking in opens it; (d) a second crossing is
fight-free again and the guard is still live; (e) CONTROL — an unguarded far
half is byte-identical to before (free 0-MP crossing, no note); (f) the guarded
exit emits no `FIELD_VISITED` and does not move `lastVisitedField`, with an
unguarded crossing as the in-test control that DOES; plus the own-layer
approach still fighting, and a no-stall case (no REVISIT offer, MOVE_HERO
offered, END_TURN accepted). MUTATION-CHECKED: restoring `clearCustomGuard`
fails 4; dropping the early `return` so the pass falls into the visit fails 5
(including (f)).

## Town teleports read ownership FLAG-first, so a CAPTURED Town works (2026-08-10)

Reported: "cannot teleport via Castle Gate from captured opponents town to my
settlement/town." Inferno's Castle Gate (both halves) AND the WOG Mirror of the
Home-Way read a Town's ownership off `TownState.controllerId`, which the engine
DELIBERATELY never flips on capture — control lives on `field.flagOwnerId`, and
no engine path assigns `controllerId` after setup. So a Town you captured was
neither a legal ORIGIN nor a legal DESTINATION, and a Town an enemy captured
FROM you still counted as yours (a free teleport into enemy hands).

ONE shared read now backs all three call sites: `isOwnTownOrSettlementField`
(`adventure.ts` — the LEAF of the two modules, since `adventure-reducer` imports
`adventure` and not the reverse), flag-first with `controllerId` as the
fall-back for an UNFLAGGED field ONLY. That is the same reading
`townPortalDestinations` uses. `legal-actions.ts`'s Castle Gate offer and the
reducer's guard both call it instead of keeping their own inline copies — that
duplicate is exactly how the two drifted apart.

LIMITS: destination categories are UNCHANGED (a Town field backed by a
TownState, or a flagged Settlement — never a Ⅶ Random Town), and neither
teleport gained an occupancy check it did not already have (the Castle Gate has
none; the Mirror keeps its own). NOTE for future fixtures: setup ALREADY flags
each home Town's field for its owner, so `town.controllerId = "x"` alone no
longer takes control away — move the field flag too (one pre-existing
`wog-objects.test.ts` CONTROL relied on the buggy read and was corrected).
Pinned in `src/engine/castle-gate-teleport.test.ts` (real capture path, both
directions, plus still-enemy-Town / captured-from-you / classic own-Town
CONTROLs) and `wog-objects.test.ts` ("Town ownership is flag-first"); each
mutation-checked — reverting the reducer read fails 4, reverting only the
legal-actions read fails 4, reverting only the Mirror read fails 2.

## Diplomacy's skip costs a crown · Dragon Utopia guards use the table (2026-07-27)

Two shipped readings replaced by the printed card / the Field Difficulty table.
Neither is a toggle — the previous behaviour was wrong.

- **Diplomacy's matching-level skip is its EXPERT side, so it needs a crown.**
  The card prints "Expert: skip Combat with Neutral Units on a field whose
  Difficulty equals your Hero's level… Empowered: use either side without
  spending a crown", but the engine used to offer the skip for FREE to anyone
  holding the card. `canUseDiplomacySkip` (adventure-reducer.ts) now gates the
  offer — at the plain encounter AND after a Polish-Quick-Combat "Fight" — on an
  unspent Expert use, and `resolveDiplomacySkipChoice` spends one
  (`expertUsesSpentThisRound`, the SHARED per-game-round crown budget) unless
  the ability is Empowered. The pop-up says which it is. CONSEQUENCE, stated
  because it is a real loss: **crowns start at hero level 2**
  (`EXPERT_USES_BY_LEVEL[1] === 0`), so a level-1 hero can no longer skip a
  difficulty-1 guard at all, and a spent crown closes the skip for the rest of
  the round. Pinned in `tactics-diplomacy.test.ts` (the offer gate with a
  no-crown CONTROL, the spend, the Empowered crown-free path, and "spends from
  the SHARED Expert budget" — a second matching-level fight that same round gets
  no offer, with a crown-to-spare CONTROL).
- **The Dragon Utopia's default guards are the whole difficulty row, not four
  dragons.** `dragonUtopiaGuards` "by-difficulty" (the DEFAULT) now draws the
  COMPLETE Field Difficulty Ⅶ table row from the Neutral decks, tiers included
  (Easy 1 azure / Normal 2 azure / Hard 1 gold + 2 azure / Impossible 2 gold +
  2 azure) — `drawDragonUtopiaArmy` → `drawNeutralArmy`; it no longer trims a
  minted dragon party to a count. LEAD WITH THE CONSEQUENCES: the guards are
  therefore **not necessarily dragons** (the gold bodies never are, and 3 of the
  8 azure cards are not), they are real DECK draws — so they leave their tier
  deck for the fight and recycle to its discard at combat end, and (carrying no
  `bankGuard` flag) they CAN be swapped by the pre-battle Judge Dread / Groovy
  Satyr / Visions windows, which the minted party never offered. The themed
  encounter is still available: the lobby "4 dragons" / designer
  `objectives.utopiaGuards: "four"` mode keeps the fixed four-dragon party
  (Azure + Rust + Crystal + Faerie, featured lead randomised per game to Azure
  or Rust), minted with `bankGuard` so the azure deck is never touched. Round
  limit, XP and every reward are unchanged (the Ⅶ exemption keys off the FIELD,
  and the level-7 jump off `difficulty >= 7`). Pinned in
  `creature-bank-guards.test.ts` (per-difficulty counts + tiers, the four-dragon
  CONTROL, and "conserves the Neutral decks" — the table draw shrinks the piles
  by exactly its count while the minted party leaves them untouched and stays
  flagged, so neither mode can consume or CREATE a card).
- **The Ⅶ Dragon-Utopia FIELD pays a FIXED Search (3) + two Search (5) = exactly
  THREE Artifact cards. The Creature-Bank Dragon Utopia TOKEN is UNCHANGED**
  (user rule 2026-08-03, "Utopia VII field Is still giving too much artifacts.
  Should be 3. First you take Search(3) and then 2 times Search(5) (search
  properly according to VI-VII tile)" — scoped by an explicit follow-up veto: "I
  ONLY SAID TO DO FOR VII, ESPECIALLY ONLY FOR POLISH RULE AND MAP DESIGN, NOT
  CHANGE THE FUCKING CREATURE BANK"). Lead with the scope, because the two
  surfaces now deliberately DISAGREE:
  - **Ⅶ objective FIELD** — the map-designed / hidden Grail & Dragon Utopia
    package, the `polish-grail-utopia` house rule, AND the plain conquest/grail Ⅶ
    field: the fixed ladder `VII_DRAGON_UTOPIA_ARTIFACT_SEARCH_COUNTS` =
    `[3, 5, 5]` queued by `queueDragonUtopiaArtifactSearches` (adventure.ts —
    deliberately NOT in creature-banks.ts, so nothing implies the bank shares it).
    Two behaviour changes here: the hidden/Polish package used to pay **two
    Search (3)** (2 artifacts), and the plain branch used to take the shared
    Lvl-VII `giveCreatureBankConsolation` (10 gold + a **hardcoded**
    `artifacts-relic` Search (2), which bypassed the eligible-deck pick). Both now
    pay three `"artifacts"`-FAMILY searches — that family routing IS the "search
    properly according to VI-VII tile" half: on a centre tile the deck pick really
    offers Minor/Major/**Relic**. Each search is pinned to the visiting hero+field
    so a Secondary Hero's win still reads the Ⅵ–Ⅶ band. The **GRAIL** keeps the
    consolation unchanged.
  - **Creature-Bank `dragon_utopia` TOKEN** — the PRINTED card, untouched: 40 gold
    + Search (3) + **X × CHOOSE_ONE(Search (5) Artifact | Search (5) Spell)**,
    X = the number of Stacked defenders (incl. the Polish rolled bank size), so up
    to five Artifacts on Impossible. That scaling and the Artifact-or-Spell choice
    are the printed rule and stay.
  Untouched everywhere: the gold per surface (40 bank / 10 plain / legacy 20
  Polish), the Morale-or-Ability-token pick, the guard modes (`utopiaGuards` four
  vs by-difficulty only pick the army), Dragon Hunt (the win is the reward) and
  Dragon Conqueror (the capture is the reward — no artifacts, only the opt-in
  `objectives.utopiaBonusSearch`, which still appends its EXTRA search on top of
  the three; default absent ⇒ exactly three). Pinned in
  `dragon-utopia-artifact-reward.test.ts`: the real pipeline reveals 3/5/5 on the
  Ⅶ field and the winner ends with exactly +3 Artifact cards, with CONTROLs for
  Easy-vs-Impossible sameness, the plain branch's family routing, both guard
  modes, the bonus knob — plus TWO bank CONTROLs proving the ladder never leaks
  there (the printed 1+X shape at every Stacked count 0–4, and an Impossible X=4
  bank win through the atomic Necromancy deferral revealing 3/5/5/5/5 for **five**
  Artifacts). The bank's own printed shape is also still pinned in
  `src/data/map/creature-banks.test.ts` ("…plus one Artifact/Spell choice per
  Stacked defender").
- **Also in this batch:** `REVISIT_FIELD` finally has a human button (the
  `HeroActionsDock`), so a hero that starts its turn standing on a Monolith can
  travel without walking off and back — the hex tooltip promised "step on (or
  Revisit for 1 MP)" with no surface to do it. Because a player may field a
  Secondary Hero, two Revisit offers can arrive at once; the engine label names
  the acting hero (`whichHero` in legal-actions.ts) whenever more than one hero
  is on the map, and only then, so the single-hero label is unchanged. Pinned in
  `secondary-heroes.test.ts` ("Revisit offers name WHICH hero acts", with a
  lone-hero CONTROL) and `hero-actions-dock.test.tsx` (both buttons render under
  distinct keys and each dispatches its OWN hero).

## Ⅶ Utopia / Grail reward STACKING — warned, never blocked (2026-08-03)

Reported: "so many things that can change utopia or grail fields right now" — do
the payouts pile up? They DO, and every one of them is deliberate, so nothing was
nerfed or blocked. The MATRIX for ONE clear of a Ⅶ objective field, verified
empirically in `src/engine/vii-objective-reward-stacking.test.ts` (each pair
asserts the COMBINED observable outcome, so a change to either half fails):

- **Built-in** — Ⅶ Dragon Utopia: 10 gold on a plain Ⅶ field (0 under the
  designer/hidden field-rules package, 20 under the legacy `polish-grail-utopia`
  house rule) + the fixed Search 3 / 5 / 5 Artifact ladder + the
  Morale-or-Ability-Empower pick. Ⅶ Grail: arms the dig (the dig itself pays 20
  gold under the package, else `objectives.grailDigReward`), or — outside Grail
  Hunt — 10 gold + a Search (2) Relic (`giveCreatureBankConsolation`).
- **+ centre-hex reward / VP** (`plan.centerHex`, via `grantCenterHexBonus`) —
  pays IN FULL on top, once (the `centerHexClaimed` latch survives a revisit /
  re-capture; the Grail's dig on a later visit does NOT re-pay it).
- **+ a hidden hex event's reward / VP on that same hex** (`preset.hexEvents`,
  via `payDesignerFieldReward`) — pays IN FULL on top, before the field's own
  visit ("first" mode once, "each-player" once per player). A `replaceVisit`
  event instead SUPPRESSES the objective's own payout for that entry.
- **+ `objectives.utopiaBonusSearch`** (opt-in, Utopia only) — an extra Artifact
  Search. **BUG FIXED**: it was read ONLY by the plain-mode branch, so on a
  DESIGNATED Ⅶ Utopia (which auto-activates the field-rules package — exactly
  the map a designer sets the knob for) it silently paid NOTHING while the
  map-pick banner still advertised "Dragon Utopia bonus: Search(N) Artifacts".
  Every paying Ⅶ Utopia branch now reads it; Dragon Hunt still does not (that
  clear wins outright, so there is no turn left to spend it). Repro + control in
  the test above ("STACK C", mutation-checked).
- A fully loaded Ⅶ Utopia therefore pays SIX Artifact Searches and both gold
  packages from one clear. Deliberate — hence the two warnings.

Warnings (both from ONE pure derivation, `viiObjectiveRewardStacks` /
`viiRewardStackWarnings` in `map-preset.ts`, so the surfaces cannot disagree):
- **MAP DESIGNER**: a line per stacked Ⅶ field in the existing alert panel beside
  the Ⅶ victory-vs-design conflicts (`map-designer.tsx`, `.designerObjectAlert`),
  naming the objective, its row/col, what it already pays and which extras stack.
  Never a block. The designer takes the preset's `objectives` block as a new prop
  purely to see the bonus-Search knob.
- **PLAYER**: one line in the map-pick banner
  (`describeCustomMapPresetEntries(preset, tiles)` — the second arg is NEW; the
  line rides the TILES, so both banner call sites now render even when the preset
  itself carries no other condition).

Leading with the deliberate LIMITS of the warning:
- It reports only a Ⅶ objective the design is CERTAIN to host — a `viiField`
  designation, an exact tile pin, or a "one of these tiles" list whose EVERY
  candidate prints the same objective. A plain/mixed random centre slot is not
  warned (whether it even becomes a Grail/Utopia is unknown at design time).
- A centre tile's Ⅶ objective is always slot 0 — the tile's own centre hex
  (verified across every centre tile definition) — so a hex event stacks exactly
  when it sits on the plan's own row/col, rotation-proof. An event on a RING hex
  is a different field and is not reported.
- Only Grail / Dragon Utopia Ⅶ fields are covered (a Ⅶ Random Town / Settlement
  pays no comparable built-in reward). The `map-preset-editor` summary still
  takes the preset alone (no tiles), so the stack line appears in the designer's
  alert panel and the lobby banner, not in that collapsible summary.
- SUPERSEDED (2026-08-07): the two conversion functions
  (`applyGrailAfterDigConversion` / `applyPolishGrailFightConversion`) are gone,
  replaced by ONE `applyGrailTakenConversion` (which, since 2026-08-09, converts
  a black-cubed site too — keeping its cube, so it is never re-fought). NOTE
  (2026-08-09): a converted extra Grail pays the normal Utopia bundle again
  (see "Grail → Utopia conversion" below), so a map with an extra Grail under
  `grailAsUtopia`/the package CAN yield a second Utopia payday at runtime — but
  the design-time stacking WARNING still reports only a REAL printed /
  designated Ⅶ Utopia (whether an extra Grail ever converts depends on a dig
  the designer cannot foresee).

## Atomic Necromancy window · Luck lasts the round · printed Treasure dice (2026-07-28)

Reported-bug batch. Leading with what does NOT work / the deliberate limits:

- **The after-combat Necromancy window is now an ATOMIC TRANSACTION, not a
  one-card decision, and NOTHING it withholds lands until the explicit Resolve**
  ("Resolve bonuses and continue" — still the `SKIP_NECROMANCY` action id, kept
  for protocol compatibility). Every fought-combat prompt is built by ONE
  `openNecromancyWindow` (adventure-reducer.ts), and the reward it defers is
  stored as a typed `pendingNecromancy.deferredReward` — `field-visit`,
  `creature-bank`, `wave`, `raid-boss` or `dungeon-floor`. So the Creature-Bank
  reward, a Calamity-Wave payout, a Raid-Boss kill + lair clear and a Dungeon
  floor's advancement are ALL frozen behind the window now (the bank's reward
  used to be paid before the prompt), together with the Freelancer's Guild
  bounty, Soul Reformer, Bounty Hunter's Eye and the Equipment win gold, which
  are queued as `visit-steps` instead of granted inline. `pumpAdventureQueues`
  returns early while the window is open — the queue is genuinely parked, so a
  round-start wave queue stops until the winner resolves. `remaining` is
  `min(2, cards held)`, so a Necropolis hero may play BOTH held Necromancy
  copies (ability + a Vidomina specialty) into the same window, and may layer
  Legion pieces / gold cards (`isNecromancySupportPlay`) and redeem the resulting
  offers before resolving.
  - **Unredeemed offers this window banked EXPIRE on Resolve** — otherwise the
    exploit is back (collect the field reward, then reinforce). The sweep reads
    `pendingNecromancy.discountIds` (stamped as each card is played), so a bank
    the window did NOT create survives; snapshots written before that field
    existed keep the old source-wide sweep. Pinned in `necromancy.test.ts`
    ("Resolve expires the offers THIS window banked, and only those").
  - **The AI had to be repriced or it threw the card away every win**: the exit
    scores 1_120, so at the ordinary 820/760 redeem score a computer seat played
    Necromancy (1_140), banked the half-gold offer and then scored the Resolve
    above the redeem. `REDEEM_REINFORCEMENT_DISCOUNT` now scores 1_135/1_130
    while the window is open — between the card play and the exit, so it plays
    every card, then redeems, then resolves (`mulligan-necromancy.test.ts`, with
    an outside-the-window CONTROL).
  - LIMIT: a PvP DEFENDER who wins now opens the window during the ATTACKER's
    turn, which freezes the attacker until the defender resolves. That is the
    intended atomicity, and the defender can act (the window's branch in
    `getAdventureLegalActions` is reached whoever is active), but it is a real
    turn-order interruption.
- **Luck (basic AND expert) lasts until the END OF THE GAME ROUND**, not the
  player's turn (`duration: { type: "current-game-round" }` on both sides of
  `ability.luck`). It therefore survives combat end AND the holder's own turn
  end, and the round wrap's `startAdventureRound` →
  `expireEffectsForGameRoundEnd` pass is what ends it — after which the shared
  `releaseEndedOngoingCards` pass moves the physical card out of the Ongoing tray
  to its owner's discard. Both halves are pinned END-TO-END through the REAL
  `END_TURN` round wrap in `prophecy-diplomacy-artifacts.test.ts` ("a LAST-seat
  holder's Luck is gone the moment the ROUND wraps"). That test gives Luck to the
  LAST seat on purpose — it is the only shape that tells this rule from the old
  turn-scoped one, because the wrap runs `startAdventureRound` (round expiry) AND
  `startPlayerTurn(seat 1)` (turn expiry) in the SAME action, so a first-seat
  holder's Luck vanishes under either rule. **What the old rule actually got
  wrong, and what this fixes:** a NON-first seat's Luck survived the round wrap
  and stayed live into the new round until that seat next acted. The map-die
  rerolls are therefore one Treasure + one Resource
  per ROUND. Verified by throwaway probe (not shipped) to behave identically when
  played on the map in rounds 1 and 2, with 2 and 3 seats, in single-player
  against a computer, under parallel turns, and when played mid-combat.
  **KNOWN LIMIT — the Battle Test combat SANDBOX never expires it**: a
  sandbox state has no `adventure`, so no game round ever wraps and
  `expireEffectsForGameRoundEnd` is never reached (`expireEffectsForCombatEnd`
  deliberately does not list `current-game-round`, because Luck MUST survive an
  adventure combat). The sandbox's rounds are COMBAT rounds, so there is no
  "round end" there to hang it on. This is unchanged from the old turn-scoped
  rule, whose expiry pass (`startPlayerTurn`) is likewise adventure-only — but it
  does mean a tester using Battle Test sees Luck stay on the table for good.
- **An Ongoing card can be ended early** (`DISCARD_ONGOING_CARD` →
  `discardOngoingCardVoluntarily`, offered per held card beside the permanent
  discards). It kills the card's live effects and then hands the card to the
  SHARED `releaseEndedOngoingCards` router, so it returns to the zone that card
  belongs to — a Knowledge/Mysticism-recalled ongoing Spell goes back to the hand
  or the SPELL BOOK, never the discard (pushing it straight to the discard leaked
  a Book Spell into the deck cycle). Pinned in `reducer.test.ts`.
- **A Treasure chest rolls the number of dice PRINTED ON ITS FIELD**, not one
  derived from its tile: `TileFieldDefinition.treasureDice` (1 | 2) is copied to
  `MapFieldState.treasureDice` by `materializeTileFields` and read in
  `beginFieldVisit`. Every GUARDED chest outside a starting tile prints 2 (Ⅱ/Ⅳ
  guards); starting-tile chests (guard Ⅰ) and every UNGUARDED chest print 1. A
  designer field reusing the symbol carries no count, so it rolls 1. Pinned in
  `reported-bugs-regression.test.ts`; the printed "2" is NOT drawn on the hex.
- **Also in this batch:** `&N1`'s "?" cabin is a Trading Post, not a Treasure
  chest; `#N1`'s Tree of Knowledge is a level-Ⅳ guarded field; Neutral Minotaurs
  briefly dropped to Initiative 6 here, but the printed wiki card is 7 —
  corrected back 2026-07-29 (Few 6 / Neutral 7,
  `reported-bugs-regression.test.ts`); a Calamity-Wave assault no longer
  overwrites `activePlayerId` when it finalizes (waves interrupt round start —
  they are not turns); `computerDecisionOwner` drives a COMPUTER PvP-Neutral-
  Control seat's guard placement and guard activations (their units stay
  `controllerId = NEUTRAL_PLAYER_ID`, so the ordinary active-unit lookup could
  not see it); and the combat board/inspector printed live Attack/Defense/
  Initiative totals (2026-07-29: the board CARD now shows compact up/down
  arrows per changed stat — the INSPECTOR keeps the numeric live totals,
  `board.test.tsx`).

## A live ongoing card is NEVER in the discard pile (2026-08-10, protocol v25)

USER RULE: "when ongoing spells/abilities/artifacts are ongoing — like Luck,
Water Walk, Pathfinding — show their cards in a window (with constant effects)
and only when the effect is gone put them on a discard." Most of that already
ran (`ongoingCards` + `releaseEndedOngoingCards`); the hole was the OTHER
direction. Protocol bumped to **v25** — `npm run deploy:partykit` owed.

Leading with what does NOT change / deliberate limits:
- **The Ongoing tray is the window — NO new window was built.** The existing
  "Permanents & Ongoing" tray already renders each held card's FACE on the map
  AND combat screens, for every seat (a public zone; player views never mask
  `ongoingCards`), with the full card (its printed effect text) one click away
  via the shared zoom. Once the engine gap below was closed the user's ask is
  satisfied by that surface; a second redundant window was deliberately NOT
  added.
- **Nothing new is mandatory**: the pass moves cards between two existing zones
  at the shared action tail — no new action, no window, no AI/AFK surface.
- **Combat-scoped holds live until the fight is ACKNOWLEDGED**, not the moment
  the outcome is set (a retreat leaves the combat open, so a combat-long card is
  still in play then — see the Shackles case below).
- **The instant durations, permanents, removed cards and shared-deck casts are
  untouched** (nothing to hold: an instant shows nothing, a permanent is already
  a visible zone, a removed / Scroll / Helm-from-the-Spell-deck cast leaves no
  card in the owner's discard).
- **Legacy snapshots migrate silently**: a saved game whose card is in the
  discard while its effect runs has it pulled into the tray on the next action.
  Known cosmetic edge (documented, not fixed): if a card that created a live
  effect was REMOVED from the game while a SECOND copy sits in the discard, the
  pass holds that second copy instead — no card is created or destroyed, and it
  returns to the discard when the effect ends.

What runs (each mutation-checked in `src/engine/ongoing-cards-in-play.test.ts`;
removing the wiring fails 5 engine tests + the Shackles case):
- **ONE seam**: `holdLiveOngoingCardsFromDiscard` (active-effects.ts), called in
  `applyAction`'s tail immediately before `releaseEndedOngoingCards` — the two
  are now a pair (hold what is live, release what has ended). It pulls a card out
  of its owner's discard whenever a LIVE, non-instant, card-sourced
  `activeEffects` entry names it, skipping effect ids an Ongoing entry already
  tracks (so a second copy is never swept up by the first copy's effect and a
  Knowledge/Mysticism-marked `returnTo` is kept).
- **The two paths it fixes** (both create their effect LATER than the play
  action, so the per-play `holdOngoingCardIfEffectCreated` hooks could not see
  it): **Fortune** played on the map with a power source in hand (its Power
  prompt creates the reroll effect when ANSWERED), and **Shackles of War** played
  in the PvP prep window (its combat-long "cannot Surrender" lock —
  `library-cards.test.ts` carries the flipped expectation).
- **A library-derived invariant** guards the class, not just those two: the test
  gives p1 every implemented card in turn, plays EVERY offer the engine makes for
  it on the map (≈250 plays) and in combat (≈835 plays), answers any follow-up
  option prompt, and asserts no live card-sourced effect is ever represented by a
  card lying in the discard. LIMIT: only cards those two fixtures make playable
  are exercised (coverage floors are asserted so it cannot silently degenerate).
- **Card-count conservation, the expiry seam and the voluntary end** are pinned
  (exactly one copy at every step; the card reaches the discard once, when the
  effect ends; `DISCARD_ONGOING_CARD` still ends a newly-held card and routes it
  to its own zone), with CONTROLs: a Fortune with no power source (no prompt) was
  ALREADY held by the old hook, and a plain instant (Estates) still goes straight
  to the discard.
- **Display pinned end-to-end** in `src/components/table/ongoing-tray.test.tsx`:
  a real map play of Pathfinding shows the card face in the tray, opens full
  size, is visible to another seat without that seat getting the owner's "end
  this effect" control, and leaves the tray for the discard only once the effect
  is gone.

## Specialties & combat reactions · summon/recruit elemental split (2026-07-31)

Two audited codex commits. Leading with what does NOT run / deliberate limits:
- **The reaction-batch resolves in the PLAYER'S declared order** (the engine no
  longer reorders +Power plays first; the tray shows a numbered play-order badge
  and keeps declaration order). Power played AFTER a power-scaled instant still
  lands via the `powerScaledAttackInstants` re-scale records, but the order shown
  IS the order resolved.
- **The bare positive-Morale token opens a reaction window ONLY on a Retaliation
  Attack** (`openReactionWindowForTrigger`'s morale-only gate): its draw /
  discard-redraw spends join EVERY already-open window (so Leadership's token,
  gained in-window, is spendable there — `unit-ability-interactions.test.ts`),
  but a mere held token must not pause every attack/cast at the table. The
  retaliation window is the deliberate exception (the retaliating side's only
  pre-roll moment — both directions pinned in `morale-in-combat.test.ts`, one
  offer only, never a duplicate look-alike button).
- **Scholar/Leadership are the ONLY trigger-free instants allowed into an open
  window** — SUPERSEDED 2026-08-06 by the instant-lifecycle batch (its own
  section): every implemented instant draw/recovery face now JOINS an open
  window as a flagged non-opening reaction, while Scholar/Leadership keep
  their historical window-OPENING status. Scholar's
  discard-pick still resolves inside the window and the CHOOSE_OPTION dispatch
  re-derives + re-opens the window offers (passed players get to react again).
- **Familiars' "Mana Leech" is the CASTER'S chosen discard, paid BEFORE the held
  Spell casts** (`familiar-choose-discard` COMBAT_HAND_DISCARD with a deferred
  `tollSpell`, replacing the old random-discard-after-cast; scroll/Book/deck/
  Tarnum casts stay exempt — not "from hand"). The Pegasi toll then chains into
  the Familiar tax, and the deferred cast now preserves `optionIndex` /
  `fromOwnDiscard` / school-expert flags (previously dropped — a CHOOSE_ONE
  spell deferred by Pegasi lost its chosen option). AFK/AI answer it via the
  existing first-offer / lowest-value paths (no random arm to mis-fire).
- **Expert Mysticism/Knowledge recall never returns the recall card itself**
  (`recallSpell.sourceCardId`; one occurrence skipped, a genuine second copy
  played as support still returns — `knowledge-recall-instants.test.ts`).
- **Torosar I/IV/VI are all game-round Ballista grants** playable on the MAP
  before a combat (banked `EXTRA_BALLISTA` active effect, `current-game-round`
  duration): I grants only, IV also activates up to two, VI activates all —
  the old "pay 5 gold / activate one" CHOOSE_ONE reading is gone (Tarnum-Castle
  and Gerwulf keep it — theirs print it). Map-timing for EVERY war-machine
  specialty is pinned in `war-machine-specialty-map-timing.test.ts`.
- **Summon elementals are separate `summonOnly` definitions**
  (`conflux.{air,earth,fire,water}_elementals` carry the Few/Pack summon forms;
  `neutral.*_elementals` are single-sided recruitable guards): the Summon spells
  mint the conflux ids and `isRecruitableNeutralUnit` gates the neutral-deck
  BUILDS and every RECRUIT surface — deliberately NOT the generic
  `drawFromNeutralDeck` top pull (the Visions scry and draw-style effects ride
  it; a filtering pop would silently destroy cards, and no summon-only id can
  enter a deck in the first place). The five neutral guard faces (incl. Steel
  Golems) are now the real board scans (`elemental-card-images.test.ts`;
  the files sit in `compress-media.mjs`'s protected q94 exclude family).
- ~~**Eagle Eye's find MUST be taken into hand** (the "discard it" arm was not
  printed; offer + resolver both enforce it).~~ **WRONG — REVERTED 2026-08-08.**
  The claim was a transcription error: the committed card scan
  (`public/assets/abilities-eagle_eye.webp`) reads, on BOTH sides, "Draw cards
  from the Spell deck until you find a Basic/Expert Spell card. **Take it into
  your hand or discard it.** Reshuffle the rest of the cards back to the Spell
  deck." (the wiki page agrees). The take-only reading forced a hero to accept
  a Spell they did not want — the user-reported "Eagle Eye did not propose to
  discard the card". `resolveEagleEyeDig` (reducer.ts) now always offers the
  printed second option and sets `allowDiscard: true`, so the plain dig behaves
  exactly like a Tome's School-filtered dig: the pitched Spell goes to that
  DECK's discard pile (the split-deck Expert dig to `spells-expert`'s), never
  to the hero's hand and never out of the game. Pinned in
  `eagle-eye-combat.test.ts` ("offers the PRINTED discard branch" + the EXPERT
  twin, each asserting the pile the card lands in, with a take-it CONTROL);
  mutation-checked (restoring the school-gated `allowDiscard` fails 2).
  Unchanged: the dedup rule still digs PAST a Spell the hero already owns, so
  the discard arm is not a way to cycle a duplicate into view.
- **Pandora's Gift: Income raises the real production track** while in play
  (`pandoraIncomeProductionBonus`, removed at EVERY permanent-exit path incl.
  the limit squeeze; legacy snapshots without the field keep the old flat
  round-start payment — the round-start read is gated on the bonus's absence).
- **"Ignore the Attack die" zeroes the whole rolls array** so die-face-keyed
  abilities (Death Stare "-1"s, reroll_plus_one "+1"s) can no longer fire off a
  cancelled face.
- **AUDIT fixes on top** (this batch's cherry-pick audit): the branch's
  `reinforceCostFor` rewrite silently removed the documented
  `immediate-reinforcement-prompts` rule-ON "competing discounts" pricing —
  REVERTED (the old-rule min-compare stays, `necromancy.test.ts` old-rule
  cases + the both-readings case in `map-tile-effects-audit.test.ts`); a stale
  branch expectation reverting main's phone "End turn" tab was dropped; the
  duplicated OpponentInfoDock/OpponentBar from the page.tsx merge was removed;
  the morale-draw offer is deduped to ONE button per window (the Morale CARDS
  combat-bonus reaction still OPENS its window as documented); and the branch's
  filtering `drawFromNeutralDeck` pop was reverted to the plain pull (above).

## Gate shield · Artillery instant · Grail build button · Spell-Book labels (2026-08-03)

Batch audited together with the Ⅵ/Ⅶ Quick-Combat cap (its own bullet in the
Creature-Banks section) and the map-designer UX / morale-box commits already on
main. Leading with the limits, then what runs (each engine claim
mutation-checked).

- **Gate shield (house rule, always on in a siege)**: a DEFENDING unit standing
  on its own Gate SHIELDS it — the Gate cannot be destroyed while occupied.
  ONE backstop guards every destruction path (`defenderOnFortification` at the
  top of `destroyFortification`, siege.ts: Catapult/Cannon, melee demolish,
  Earthquake, splash), plus offer-side filters so no dead button is shown: the
  melee-demolish offer (`addFortificationActions`), the Catapult splash targets
  (`splashTargets`) and the Cannon target list (`cannonTargetIds`) all skip an
  occupied Gate — the unit standing there stays an ORDINARY target. Defenders
  could always stop on the Gate ("not an Obstacle to the defending player");
  the board now renders a unit standing there normally and offers the empty
  Gate as a move target (`board.tsx`, presentation over the real MOVE_UNIT
  offer). Walls are unaffected (nobody can stand on one; the Arrow Tower sits
  at position −1). Pinned in `gate-shield.test.ts` (the real MOVE onto the
  Gate, the destroy backstop, Catapult/Cannon/demolish filters, each with an
  empty-Gate CONTROL).
- **Artillery (basic) is an instant REACTION when your unit is attacked**: the
  attacked side's owner may fire the ballista shot (1 effect damage to the
  slowest enemy) into the open attack window, BEFORE the exchange — offered
  per tied lowest-initiative enemy like the on-turn play
  (`artilleryCardReactions`, a dedicated block beside the First Aid heal in
  `getLegalReactionsForTrigger`; resolution re-validates the
  lowest-initiative filter in `applyReactionPlayCore`). The expert side still
  rides the war-machine Ballista only. Pinned in
  `artillery-reaction.test.ts` (offer + no-card CONTROL, shot-lands-before-
  the-hit event order).
- **A unit REMOVED while its blow is parked no longer attacks from beyond the
  grave** (audit fix found via the Artillery reaction — the first mechanism
  that can kill an attacker inside its own attack window): an early guard in
  `resolveAttackStackItem` drops the parked attack of a dead attacker,
  mirroring the pre-emptive-retaliation cancel — a cancelled ordinary
  retaliation hands the activation back to the original attacker, a cancelled
  pre-emptive counter lands the parked original blow, and a Pack the shot
  merely FLIPPED keeps fighting (still alive, the exchange proceeds with the
  flipped side). Pinned in `artillery-reaction.test.ts` ("no attack from
  beyond the grave", with a healthy-attacker CONTROL whose blow still lands).
- **"Build the Grail" finally has a button** (`HeroActionsDock`): the engine
  has ALWAYS offered `BUILD_GRAIL` (map-maker `grailBuildAt` / the hidden
  Grail-Utopia package), but no component rendered it — the action was
  unreachable in the UI. The dock button reads the legal-action offer only
  (no re-derivation) and dispatches the exact payload
  (`hero-actions-dock.test.tsx`, with a not-carrying CONTROL).
- **Game-UI polish (presentation only)**: the Mage Guild / Spell Book shortcut
  labels are restyled "<n> gold: Buy spell — search (n)" with inline gold-coin
  / sparkle glyphs in the Spell Book modal — the engine label stays plain text
  and is kept as the button's aria-label, so accessible names (and tests) are
  unchanged; "Enable all Polish rules" now pulls in `split-decks` as its
  companion (unblocking the dependent Random Artifacts in the same dispatch —
  `game-options-tabs.test.tsx`); the helper-coach tips panel defaults to the
  bottom-RIGHT corner instead of dead center; the siege Arrow-Tower panel
  flows in-document below the board on every viewport (it used to float over
  the right rail's inspect/command buttons at some layouts). jsdom cannot
  compute CSS, so the arrow-tower/coach position halves are unpinned.

## The frozen-table class: "That action is not legal…" forever (2026-07-31)

Live report (round 6, single player): the game "crashes" — every combat click
(attack, hold) rejected with the generic "That action is not legal in the
current game state." The transport fixes below could not touch it because the
class is NOT transport: it is a table where NOBODY can act (or where the
client's rendered state silently diverged from the server's). Five fixes ship
together, each mutation-checked; protocol bumped to v16 so a STALE PartyKit
edge now shows the "room server out of date" banner instead of producing
exactly this symptom silently (`npm run deploy:partykit` is still required —
a Vercel deploy alone leaves the old edge running the old rules).

Leading with what does NOT work / deliberate limits:
- **The stall recovery only takes curated do-least actions** (window resolvers,
  pass-reaction, hold/defend/end-turn — `RECOVERY_TYPE_PREFERENCE` in
  `src/engine/computer/stall-recovery.ts`). A stall whose only offers are
  outside that set (or whose offer list is EMPTY) stays a logged stall — it
  never blind-fires retreats/surrenders/card plays, and it never answers a
  HUMAN-owned window.
- **Structural view-vs-state legality flips are NOT fixed here** (single-player
  rooms are HOSTED — `room.ts:302` — so clients hold per-seat REDACTED states):
  the confirmed `playerOwnsWarMachine` flip (own deck masked → a dead
  BUY_WAR_MACHINE offer that always rejects) remains open, and the "resync"
  recovery cannot heal it (re-fetching re-ingests the same redacted content).
  Flagged as its own task.
- **`eliminatePlayer` still leaves an orphaned `pendingGarrison`** when the
  DEFENDER is eliminated mid-prompt; `computerDecisionOwner` now skips
  eliminated owners (so it can no longer freeze every computer seat), but the
  engine-level decline cleanup is a separate task.
- **PvP prep + a still-open `pendingVisit` can coexist** (teleport-arrival
  fights, queue pumping during prep) and such a visit is shadowed by the combat
  dispatcher until the fight ends — the owner mismatch no longer freezes the
  pump (combat-first ordering below), but the underlying coexistence is not
  untangled here.
- **The soak matrix still doesn't cover the freeze configs** (waves cadence 3 +
  Necropolis AI, raid bosses, dungeon, manual guard control) — flagged as a
  task; the shapes are pinned by unit tests instead.

What runs (each with a failing-if-removed test):
- **`computerDecisionOwner` now mirrors `getLegalActions`' window precedence**
  (`src/engine/computer/window.ts`, pinned in `window.test.ts`). The reported
  freeze: on a round-start barrier round (waves/Astrologers), a COMPUTER seat's
  after-wave Necromancy window was invisible — `roundStartEventResolver` reads
  only pendingChoice/pendingVisit, and the barrier branch returned that null
  UNCONDITIONALLY, so nobody owned the window, the pump never drove it, the
  human's legal set was `[]`, and every click rejected forever. Now: a named
  resolver still rules; a null resolver FALLS THROUGH to the normal gates.
  Also fixed in the same rewrite: an open COMBAT outranks a human-owned map
  window (a queued wave assault could never deploy while the human held a
  First-Aid window); map windows resolve in legal-actions' own order
  (First Aid gates Necromancy, not "any computer owner wins"); the WOG
  commander pre-combat sort head is honored (was: fall-through claimed the
  active unit's computer owner → stall); a reactor-less guard-walk pause
  belongs to the attacking fighter (legal-actions' own default); eliminated
  owners of paired windows no longer null the whole table. Keep window.ts in
  LOCKSTEP with legal-actions' gate order when editing either.
- **Runner stall recovery** (`src/engine/computer/stall-recovery.ts`, wired in
  `settleComputerVisibleStep`, pinned in `stall-recovery.test.ts` +
  `computer-runner-stall-recovery.test.ts`): when the policy yields nothing
  for a computer-owned window ("no safe legal action" — previously a permanent
  freeze inside human-participant combat, where ADVANCE_COMPUTER is withheld
  and single player has no AFK/turn-clock recovery), the runner applies ONE
  do-least window-resolving action through the normal rules pipeline (progress
  required via `progressFingerprint`, so a no-op recovery can never loop), logs
  it, and continues.
- **A mandatory ability-target choice whose every candidate died is skippable**
  (offer side `legal-actions.ts`, resolver `chooseAbilityTarget`;
  `ability-target-dead-candidates.test.ts` with a living-candidate CONTROL that
  keeps the mandatory pick and rejects a forged skip). Also: an empty
  attack-die-reroll candidate list no longer THROWS inside getLegalActions
  (which failed every action from every seat).
- **The edge adopts the reducer's duplicate-army-id repair on REJECTED actions**
  (`party/index.ts` WS + HTTP paths, `edge-army-id-repair.test.ts` with a
  healthy-room CONTROL): applyAction validates against a repaired clone and
  returns it even on failure; dropping it (the old edge behaviour) left the
  room serving ids that no longer matched what every legality check validated
  against — unit commands rejected forever at an unchanging version. The
  built-in store already healed on read.
- **The client's rendered table can no longer freeze behind the arbiter**
  (`page.tsx` `ingestServerStateSafely` + the unconditional rejected-action
  resync with the new `"resync"` snapshot source;
  `page-snapshot-resilience.test.tsx`, `room-snapshot-arbiter.test.ts`): a
  throw anywhere in the ~2000-line presentation derivation used to skip the
  final setState while the snapshot arbiter had ALREADY committed the version —
  rendered state frozen, every click rejected, and the old
  version-mismatch-only resync never fired (versions matched). Now the frame
  commits without that window's cosmetics, any rejected action refetches
  unconditionally, and the arbiter accepts a `"resync"`-source frame ONCE per
  version even after the hosted seat-upgrade latch is spent (all other sources
  keep the duplicate drop — CONTROL-pinned).

## Transport self-healing: receipt probe, dedupe-safe re-send, durable ledger (2026-07-30b)

"The room did not answer in time" kept recurring in live play even with the
transport receipt deployed: a submit was ONE send followed by 15 s of passive
waiting, so a frame lost to a half-dead socket (laptop sleep, NAT drop, edge
migration) always became a user-visible error — and in single player it broke
the ADVANCE_COMPUTER cadence (the "AI got interrupted" reports). Leading with
what does NOT change / deliberate limits:
- **Every re-send is gated on an explicit DURABILITY HANDSHAKE**, not merely on
  the receipt: the edge stamps `durable: true` on `action-received` to advertise
  that its dedupe ledger survives an instance restart, and only that flag
  unlocks the probe and the re-send. A receipt WITHOUT the flag changes nothing
  (CONTROL-pinned in both directions). This is what makes a FRONTEND-ONLY deploy
  safe — Vercel ships minutes before the PartyKit edge, and a failed
  deploy-partykit workflow can leave that gap open indefinitely (it happened on
  2026-07-28): the older edge sends receipts but keeps its ledger in memory
  only, so a repeat waking a fresh instance would apply the action TWICE. Never
  gate a re-send on the plain receipt. Consequence: a session's very FIRST
  action has no probe protection (the flag is not known yet).
- **The 15 s receipt / 60 s processing deadlines are UNCHANGED** — recovery
  works only INSIDE them, so a genuinely unreachable room errors at the same
  moment it always did, and `PENDING_ECHO_TTL_MS` (75 s) still covers the sum.
- **PartyKit sockets only**: the built-in backend's HTTP action path has no
  requestId, so no dedupe and no re-send there.
- **A slow identity verify can degrade that action to guest**: the app verify
  callback now has a hard deadline (`VERIFY_TOKEN_TIMEOUT_MS` = 5 s,
  `verified-actor.ts`) so a hung/cold app can no longer stall every action
  behind an unbounded fetch; the storage identity cache (Fix A) and the
  dual-key ledger absorb the identity flap.

What runs (each claim mutation-checked — `realtime.test.ts`,
`room-action-concurrency.test.ts`, `edge-action-race.test.ts`,
`verified-actor.test.ts`):
- **Receipt probe** (`ACTION_RECEIPT_PROBE_MS` 5 s, realtime.ts): a submit with
  no receipt runs the pong-watchdog recovery (seat-snapshot refetch +
  `socket.reconnect`) instead of idling toward the 15 s error — active play
  heals a dead socket in ~5 s instead of the 35–40 s ping watchdog.
- **Dedupe-safe re-send**: every socket (re)open re-sends unsettled action
  frames verbatim (same requestId, ≤ `MAX_ACTION_RESENDS` 2 per request) — the
  server answers a repeat from its ledger, so a result lost with the old socket
  settles with the ORIGINAL outcome, and a frame that never arrived simply
  arrives.
- **The ledger is DURABLE and identity-flap-proof** (party/index.ts): applied
  outcomes are recorded BEFORE persist and ride the SAME coalesced storage
  write as the snapshot (`answered-actions` key, newest 64), so a retry that
  wakes a fresh instance never re-applies — and that persistence is exactly
  what `durable: true` promises the client above, so the two must ship
  together; outcomes record under BOTH the verified userId and the clientId, so
  a verify that fails on one send and succeeds on the repeat still dedupes.
  Rejections stay in-memory (replaying a rejected action just re-rejects it).
  The ledger is wiped with the room.

## Explorers hand step · Settlement-reroll option · Cannon vs walls · Secondary-hero defeat · transport receipt (2026-07-30)

Four codex commits landed with an audit (5 audit fixes on top, each mutation-
checked). Leading with what does NOT run / deliberate limits:

- **A computer seat never earns the Explorers empower** — it resolves the
  mandatory discard step with zero discards (the safe default), and junk cards
  it cycles inside REFRESH_HAND earn no credit (only `RESOLVE_EXPLORERS_DISCARD`
  discards count). Documented limit, mirrors the round-1 mulligan AI stance.
- **The `.cardPopover` fixed-centering is pinned by a static CSS test only**
  (`battle-card-popover-layout.test.ts`) — jsdom cannot compute the layout, and
  no real-browser spec covers it yet.
- **`action-received` needs a PartyKit deploy** (`npm run deploy:partykit`) —
  until then the deployed edge sends no receipt and clients simply keep the old
  15 s behaviour (the protocol is backward compatible both ways).
- **The reopened-field "Resolve" offer is withheld while the field's re-armed
  guard stands** (audit fix: `clear_tile_cubes` re-seeds printed guards, and
  resolving from the occupied hex would skip the fight) — the hero must step
  off and re-enter to fight it.

What runs (each with a failing-if-removed test):
- **Explorers (Astrologers) is a real two-step hand sequence**: REFRESH_HAND
  draws to the limit first, then the NEW mandatory `RESOLVE_EXPLORERS_DISCARD`
  (0–N discards, one empower per 3) — End turn is withheld and refused while
  either step is owed (`astrologers-recruit-explorers.test.ts`). AUDIT fixes:
  the sequence is round-PARITY gated (`explorersHandStepActive`, the ONE shared
  read — "during this round" like Sanctuary/Mages, so round 3 gets the classic
  refresh back); the turn-timeout driver takes both steps itself before ending
  the turn (`afk-drop.ts` — without this a timed-out seat could NEVER be
  force-ended during an Explorers round and the table froze;
  `turn-timeout.test.ts` "Explorers round", mutation-checked); `eliminatePlayer`
  clears the hand-step flags, and the pending flag never hijacks a seat whose
  turn is not open.
- **Ⅱ–Ⅲ tile identity rerolls are the `far-tile-rerolls` HOUSE RULE now**
  (2026-07-31; BINH default ON, Legacy OFF = the official "the revealed tile is
  final"): the 2nd-tile Settlement reroll AND the one-time Ore-Mine reroll ride
  ONE gate in `presentFarTileOffersOrFinalize`. The old standalone
  `GameSetupOptions.farTileSettlementReroll` option (and its map-preset soft
  default) is REMOVED — do not reintroduce a separate setup or map-preset
  switch. An in-flight legacy snapshot's frozen `adventure.farTileSettlementReroll`
  keeps deciding for THAT game in either direction (`far-tile-flip.test.ts`,
  `far-tile-reveal.test.ts`).
- **Stack-Token default flip**: the official guaranteed difficulty count is the
  default; the old roll survives as the opt-in `bank-stack-chance-80` house rule
  (80%, default OFF in BOTH modes) — see the Creature-Banks section.
- **The Cannon may shoot a Wall/Gate in a siege** (besieger only, never the
  town defender's own fortifications; `catapult-siege.test.ts` "Cannon").
- **A DEFEATED Secondary Hero is removed from the game** (like the surrender
  sacrifice — it never retreats home; `surrender-retreat.test.ts`). Its death is
  not a coupon for a one-shot prize: on a "visitable" field the winner's
  automatic post-win visit is withheld (the reward stays on the open field for
  the 1-MP Resolve). AUDIT fixes: every OTHER category still transfers —
  mine/town/settlement flags capture normally, so a 10-gold Secondary is never
  a capture-denial shield — and a defeated Grail-CARRYING Secondary hands the
  Grail to the owner's Main Hero instead of orphaning `carrierHeroId` (which
  would have killed the Grail victory for the whole table).
- **Freshly reopened one-use fields are resolvable in place**: a timed/round
  event clearing the Black Cube under a stationary hero offers "Resolve <field>"
  (1 MP, the REVISIT_FIELD path; clickable on the hex) — guarded-field exception
  above (`map-floats-board.test.tsx`).
- **Late-game transport receipt**: the edge answers every WS action with an
  immediate `action-received`, and the client splits its deadline — 15 s for the
  receipt, then 60 s for processing (`realtime.test.ts`); the pending-echo TTL
  covers both (75 s).
- **Morale-overflow prompt renders from the engine's legal actions** (hidden
  while an exclusive choice owns the interaction, reappears after — the spend
  is handler-validated and the overflow field persists, so nothing is lost;
  `morale-overflow-prompt.test.tsx`).
- **Map-overlay downsizing**: field-symbol modules ≤0.62·HEX_SIZE and a compact
  dungeon-floor badge (`map-overlay-scale.test.tsx`).

## Settlement capture choices · two Necromancy copies · timed reward choices (2026-07-28)

Two commits' worth of rules work plus its audit. Leading with what does NOT work
/ the deliberate limits:

- **The `borderlessSlots` guard does nothing for a REGISTRY Field Override** —
  its real customer is the PvE Gates below. Both override legality reads
  (`fieldOverrideMayCoverFieldDef` / `fieldOverrideMayCoverField`) refuse a
  `blocked` location, and on EVERY non-starting tile all 81 `outerImpassable`
  arcs sit on a `blocked_field` (probed). Starting tiles do print arcs on
  ordinary fields (S4 slot 6) but no override kind lists the `starting` group.
  So a WOG/anime override hex has no printed border to hide, and
  `anime-starting-tiles.test.ts`'s "a Field Override removes its printed ring"
  drives `getTileBorderSegments` directly, not a board.
- **A hero STANDING on a Blocked-Field carve still cannot open/place a NEW tile
  from there** (`canHeroReachPlacementCenter`, adventure.ts — two
  `isOuterEdgeSealed(adventure, heroField)` reads). That is the Creature Bank's
  long-standing scope, deliberately unchanged: the carve exception covers
  CROSSING and DISCOVERY only, so `isOuterEdgeSealed` keeps its slot-primitive
  invariant. The second read is additionally behind the `discovery-border-gate`
  house rule (BINH-default, Legacy-optional).
- **A SUBTERRANEAN GATE carved onto a Blocked Field keeps the same wart, on
  purpose.** `gateMayCoverField` (adventure.ts) does not exclude `blocked_field`,
  so when the ring hex nearest the partner tile happens to be the blocked one the
  gate lands there and is drawn ringed + sealed against its own layer's
  neighbouring tile (it stays reachable from INSIDE its tile and across the
  linked pair, which is what the module needs). It is NOT in
  `BLOCKED_FIELD_CARVE_LOCATIONS`: dropping only its ring would advertise an edge
  movement still refuses, and opening the edge is a movement change to a
  heavily-tested subsystem nobody reported. Fix it as its own task (prefer a
  non-blocked candidate hex, or take the full carve exception) — not silently.
- **`free-neutral-combat-extend` removes the ONLY bound on a fought neutral
  combat's length** (movement was that bound). A computer fighter in a
  mutual-zero-damage stalemate keeps continuing until the runner's 256-step cap
  logs a stall. Opt-in, default OFF, so no default table can reach it.
- **A settlement conqueror who picks "reinforce" (or a Stack) DESTROYS the
  resource token**: `removeSettlementProduction` strips the old owner's level and
  clears `field.settlementResource`, and the reinforce arm never sets a new one —
  so that settlement pays income to nobody until it changes hands again (its own
  owner cannot re-open the choice; `beginFieldVisit` guards a re-visit).
- **The two-copy Necromancy rule is the AMPLIFIER ONLY.** A plain Ability-deck
  Search still refuses a duplicate (`canAcquireSharedDeckCard` is unchanged), so
  a Necropolis hero holding one copy can take the second from the building and
  from nowhere else. The resolution-level cap check returns SILENTLY (no feed
  line) — reachable only if a copy arrives between the prompt and the answer.
- **The Cover of Darkness hand-rail button is client wiring with no unit test**
  (page.tsx precedent): the engine action, its once-per-round gate and the 1–2
  card cycle are pinned in `cover-of-darkness.test.ts`; the button, its 2-card
  selection cap and its confirm path are not.

What runs (each engine claim has a failing-if-removed test):
- **Two new "Global" house rules**, default OFF in BOTH binh and legacy
  (`house-rules.ts`, lobby rows pinned in `game-options-tabs.test.tsx`):
  `no-secondary-heroes` (Prison pays its printed 3-gold fallback, the Tavern
  offers only Decline, the 10-gold town hire is withheld, and every creation
  seam — `CREATE_SECONDARY_HERO` + `hireSecondaryHero` — refuses;
  `secondary-heroes.test.ts`) and `free-neutral-combat-extend` (the
  continue-or-retreat window costs no movement point;
  `neutral-combat-movement-extend.test.ts`). A designed map may SEED both from
  `CustomMapPreset.houseRules` — soft defaults, apply-once, host-editable, with
  the usual revert symmetry (`custom-setup.test.ts`, `map-preset-editor.test.tsx`).
- **Capturing a founded settlement now opens the full SETTLEMENT_CHOICE** instead
  of auto-inheriting the founder's resource: the captor may pick ANY resource
  (the old owner's level is stripped first), reinforce a bronze/silver Few at half
  cost, or — with `polish-unit-stacks` on — buy ONE Stack layer at half the
  printed gold (rounded up, gold-only, the `BUY_UNIT_STACK` sibling's
  `spendRecruitResources` path, so the Freelancer's Guild substitutes; no Legion
  voucher folds, matching every other special offer). The first-ever flag is still
  the only free one (`everFlagged`). `settlement-income.test.ts`.
- **A Necropolis hero may own TWO Necromancy cards** (the deck holds exactly two)
  via the Necromancy Amplifier's turn-start fetch; the offer and the resolver both
  cap at two and both refuse a non-Necropolis faction (`siege-tokens.test.ts`).
- **A designer timed event may be a `choice`**: every live seat picks one reward
  from 2–4 entries of the Obelisk-bonus vocabulary (`applyCustomMapTimedEvents` →
  a `visit-steps` CHOOSE_ONE per seat). Any timed event that QUEUES per-player
  work now raises the round-start EVENT BARRIER, so the table waits while each
  seat answers, and one shared sentinel (de-duped in
  `beginRoundStartEventBarrier`) lifts it behind whatever Astrologers / Events /
  waves queued first. Pinned end-to-end in `custom-setup.test.ts` (frozen seat
  has zero legal actions, both seats paid, barrier lifts, plus a
  queues-nothing CONTROL).
- **Legacy: disembarking (sea→land) no longer ends movement**; embarking still
  does. BINH deliberately keeps BOTH coastline halts, so the default table is
  unchanged (`seaStepHalts`, `sea-tile-terrain.test.ts`,
  `astrologers-combat-cards.test.ts`; both RULESET_DESCRIPTIONS updated).
- **D-S1 (Heavenly Demon seat) attaches the shared field-symbol modules** — its
  art is atmosphere-only (verified: no baked icons, unlike A-S1/W-S1/L-S1/P-S1),
  so its starting resource / treasure / mine symbols and guard numerals were
  invisible (`anime-starting-tiles.test.ts`, `field-symbol-modules.test.ts`).
- **The Calamity Gate / Dungeon Gate are finally REACHABLE** (reported bug: "the
  Dungeon one has borders all around it, can't access"). Both are carved ONTO a
  printed Blocked Field, and every sealed outer arc sits on exactly such a slot —
  so although `placeCalamityGate` / `placeDungeonSite` already cleared the
  FIELD-level blockers (water terrain, designer `borderEdges`), the tile
  DEFINITION's ring + arc still walled the hex: `canCrossEdge` refused entry from
  the neighbouring Tile and the board drew a full ring. Only `creature_bank` was
  exempt. The three carves now share ONE list —
  `BLOCKED_FIELD_CARVE_LOCATIONS` / `isBlockedFieldCarve` (adventure.ts) — read
  by `canCrossEdge`, `heroFieldSealedForDiscovery` AND the board's
  `borderlessSlots` set, so a future carve cannot fix one surface and forget the
  others. (2026-08-09: the bank's `showBankBorders` toggle is REMOVED — banks,
  Gates and Field Override hexes are ALWAYS border-free, see the Creature-Bank
  border bullet.) Pinned in
  `module-gate-reachability.test.ts` (walk in / walk out / discover, per
  location, with a plain-Blocked-Field CONTROL that still walls off, and
  `isOuterEdgeSealed` asserted UNCHANGED) and `module-gate-board.test.tsx` (the
  hex really loses its 6 drawn lines on a real board, blocked-field CONTROL).
- **Audit fixes on top** (each mutation-checked): the PvP pre-battle prep window
  no longer OFFERS the "during your turn" building uses or the Secondary-Hero
  hire — `activateTownBuilding` / `hireSecondaryHero` both throw "Town actions
  cannot interrupt a combat.", so those were 8 dead buttons (and the new Cover of
  Darkness hand-rail button was one of them); the invariant is pinned in
  `pvp-prep-town-actions.test.ts` ("offers nothing it cannot execute" — every
  offered action is applied and must not error — with a no-combat CONTROL that
  the same three offers exist AND work. `RESOLVE_VISIT_STEP` is
  handler-validated, so `resolveSettlementChoice` now rejects an out-of-range
  resource index (a forged `-1` flagged the settlement for free and wrote
  `production["undefined"] = NaN`); and the hand rail's cover-of-darkness confirm
  always returns instead of falling through to `REFRESH_HAND` when its offer
  vanished mid-pick (a parallel-turn attack withdraws every town action).

## First-round hand discards, Angel Wings, morale −2, Search top-of-discard (2026-07-25)

Four fixes to shipped behaviour (not toggles — the previous behaviour was wrong):

- **Angel Wings now walks through fields.** The relic prints "can move through any
  fields WITHOUT RESOLVING THEM. The last visited field must be resolved normally",
  but only granted `HERO_MOVE_THROUGH` (blocked fields), so a guarded / visitable /
  flaggable field mid-path still stopped the hero and opened its fight or visit.
  It now ALSO grants the new `HERO_PASS_ANY_FIELD` modifier (effect flag
  `GAIN_HERO_MOVEMENT.passAnyFieldThisTurn`), read as the `passAnyField` movement
  capability: every branch of `classifyHeroStep` that would return "stop" returns
  "encounter" instead (the existing Pathfinding pass-through machinery — walk over
  it, resolve ONLY if the walk ends there). Blocked fields / Barriers stay
  "pass-only" (never a landing) and an allied hero's field stays "pass-only".
  Scoped to Angel Wings: **Fly and Dessa's Logistics VI print blocked fields only
  and deliberately do NOT get it** (data + behaviour CONTROL). Yellow borders are
  NOT crossed (the card says nothing about them). Pinned in
  `map-movement-spells.test.ts` ("walks OVER a guarded field …", "walks OVER an
  unvisited location and an enemy-flagged mine …", plus the Fly/Dessa CONTROL).
- **Double-negative morale leaves the marker at −1, not 0.** Paying the end-of-turn
  hand dump at −2 settles the SECOND negative token only: `player.morale = -1` with
  a `MORALE_CHANGED { amount: 1, total: -1 }` feed line (it used to hand out a free
  full recovery to neutral). `map-tile-effects-audit.test.ts`.
- **A shared discard pile always shows a card.** Setup flips one face-up per
  shared deck; keeping that true is split across two seams (decks.ts
  `refillSharedDeckDiscards`). DISPLAY: `getPlayerView` calls it with NO `before`
  arg on the render clone, so every empty discard is seeded for viewing — a pile
  never LOOKS empty even mid-choice or on an imported state (five-session branch
  added this rendering pass + its `player-view.ts` call). AUTHORITATIVE: the
  action tail calls `refillSharedDeckDiscards(nextState, base)` (`reducer.ts`)
  with the PRE-action state, and two limits keep the real state honest: it
  re-seeds only a pile that HELD a card when the action started (never one that
  was ALREADY empty — so an effect that returned / reshuffled a card onto a deck's
  draw TOP, Tarnum VI's return-to-top or an Eagle Eye / Tome dig-reshuffle, is
  DRAWN next instead of flipped face-up into the discard), and a deck whose draw
  pile is also empty is left alone. Silent by design (the pile is rendered; a feed
  line per flip would be noise). `shared-deck-discard-seed.test.ts` (incl. the
  display-vs-authoritative split) + the take-the-top case in `reducer.test.ts`;
  the return-to-top / reshuffle protection is pinned in
  `conflux-tarnum-specialty.test.ts`, `eagle-eye-combat.test.ts`,
  `tome-artifacts.test.ts` and `pandora-cards.test.ts`.
- **Search (X): the searcher chooses which card sits face up.** When a Search puts
  2+ revealed cards BACK (X ≥ 3 keeping one), `openDiscardTopPick`
  (adventure-reducer.ts) opens a pick — the chosen card goes on TOP of that deck's
  discard pile, the rest underneath — before the post-Search repeat offers. Works
  for EVERY shared deck family; a Search returning a single card opens nothing.
  It re-uses the dormant `spell-discard-top` context/state (so an in-flight choice
  from an older build still resolves) and is masked for other viewers in
  `player-view.ts`. NOTE: taking FROM a discard pile is still the face-up TOP only
  — the reverted "take any discarded spell" feature is NOT back.
  `spell-discard-pick.test.ts`.

## Falling back after a defeat costs no extra movement (2026-07-27)

Losing a fight relocates the beaten Hero to a friendly Town/Settlement; that
relocation is NOT an additional movement cost. `moveDefeatedHeroHome`
(adventure-reducer.ts) no longer zeroes `hero.movementPoints` on EITHER arm — the
auto-home arm or the two-or-more-destinations retreat CHOICE — so the points left
after the Hero's normal approach/combat deductions survive, and a beaten Hero may
keep marching that turn. This makes defeat consistent with the behaviour RETREAT
has always had: the `COMBAT_RETREATED` branch steps the Hero back to
`lastVisitedField` without touching its movement. Pinned in
`defeated-hero-retreat-choice.test.ts` (every arm asserts the surviving points,
plus "the beaten Hero can still march out of the Town it fell back to" with a
movement-genuinely-spent CONTROL that is offered no move) and
`surrender-retreat.test.ts`; mutation-checked (re-adding either `= 0` fails four
tests).

Leading with what this deliberately changes / does NOT change:
- **The same waiver applies to SURRENDER** (a paid escape that also calls
  `moveDefeatedHeroHome`), so surrendering is now "pay the toll → fall back home
  with your army AND your remaining movement". Considered and accepted: reaching
  a surrender needs an actual PvP engagement, so it is not a cheap Town Portal.
- **Nothing else about a defeat changes** — the gold toll, the −1 morale, the
  VP/hero-defeat credit, the empty-army restock and the winner's experience are
  all untouched.
- **The retreat CHOICE still cannot be dodged**: the beaten Hero waits on the
  fight field with its movement intact, but an open `pendingVisit` returns early
  in `legal-actions.ts`, so no move is offered until the destination is picked.
- **A Hero with no retreat field leaves the map** (`spaceId = null`) still
  holding movement. Safe: every map-action loop skips a hero without a
  `spaceId`.

## "The deck ran out" never ends a draw (2026-07-26) — one seam per deck kind

Reported bug: **Jeddite's Mysterious Warlock I could not be played at all with
0 cards in the deck**, however full the discard pile was — the offer keyed off
`deck.length > 0` and the dig popped the deck raw. The printed card says "Draw
up to 3 cards from your deck", and the board-game rule for an emptied deck is to
shuffle the discard pile back in and keep drawing. Fixed as a CLASS, not a
one-off: every own-deck dig now runs through **`digFromOwnDeckTop`** and every
shared-deck top-pull through **`reshuffleSharedDeckIfEmpty`** (both in
`decks.ts`). Behaviour pinned in `src/engine/deck-reshuffle-on-empty.test.ts`
(20 cases, every claim mutation-checked, each with a CONTROL).

**Caller contract (this is what makes a dig terminate):** cards a dig has
already taken/rejected are held ASIDE by the caller and land in the discard pile
only once the dig ends. A card discarded back mid-dig would be shuffled in and
dealt again — a "dig until X" scan would never finish. With them held, nothing
is added to the discard while a dig runs, so at most ONE reshuffle can happen.
This mirrors `revealSharedDeckSearch`, which already did it for Searches.

**Every in-flight card is held OUT of its own reshuffle.** A Spell, its
Cast-a-Spell enabler, and any support cards can already be in the discard while
their cast/reaction/draw riders are still resolving. A naive reshuffle could
return any of them to hand before bookkeeping finishes. Callers therefore pass
the full `inFlightCardIds` set through `drawCardsForPlayer` /
`digFromOwnDeckTop`; the helper protects one occurrence per entry while genuine
duplicate copies still shuffle normally. This covers direct draw-only plays,
map boosts, combat reactions, after-cast draws, and ongoing-map-spell handling.

Fixed (each was dead or short at an empty pile; each has a failing-if-removed
test): **own deck** — Mysterious Warlock I/VI `DECK_DIG_KEEP_MATCHING` (offer
gate AND dig; its `CARDS_DRAWN` event now reports `reshuffledDiscard` truthfully
instead of a hardcoded `false`), Solmyr's Chain Lightning IV
`DECK_DIG_KEEP_ONE`, Adrienne's Fire Magic IV `SEARCH_DECK_THEN_RESHUFFLE` (a
Search (3) now really reveals 3), the Conflux Magic University dig (reshuffled
mid-scan, not only at the start); **shared decks** — Tazar's War Hero VI
`DRAW_TOP_ARTIFACT` (offer gate, the reducer's deck menu AND the draw), the Witch
Hut reveal, the Necromancy Amplifier fetch, Tarnum (Conflux) VI's Search(1)
Spell (offer + pull), Polish draw-and-choose Minor Artifacts, and reveal-until
Minor Artifact. `DRAW_TOP_ARTIFACT` now also reports its
`reshuffledDiscard` event flag truthfully. `drawCardsForPlayer` and the Genie
Wish dig share the same seam.

Leading with what deliberately does NOT reshuffle:
- **Peeks are not draws.** The Thieves' Guild "look at the top 2 of any deck"
  still needs 2 cards actually sitting on that draw pile (you cannot look at two
  cards that are not there; reshuffling is triggered by drawing, not looking).
- **Mana Vortex** shuffles the whole discard in up front, so a short reveal
  there means the player genuinely owns fewer cards.

## Beginning-of-player-turn draws resolve after the hand phase (2026-07-26)

Timing is now explicit: **beginning-of-the-round** effects still resolve first
(including City Hall / Wall of Knowledge changes that can force a discard),
then the active player completes `REFRESH_HAND`, and only then are
**beginning-of-your-turn** buildings queued. This covers Necromancy Amplifier,
Portal of Summoning (and its anime equivalents), and Mana Vortex. In
particular, Mana Vortex builds its discard choice from the settled
post-refresh hand, so a card drawn in that turn's hand phase can be selected.
`start-turn-hand` remains the round/start divider; `refreshHand` calls
`queueTurnStartBuildingChoices` after its discard-then-draw transaction.

Leading with the consequences of moving the queue point (both deliberate, both
pinned):
- **The buildings are now queued by `REFRESH_HAND` alone, so PASSING forfeits
  them.** Ending a turn without taking the draw stays legal and deliberate ("a
  deliberate pass, never a forgotten draw" — `mandatory-draw-six-rounds.test.ts`
  pins the End-turn offer AND the pass going through unspent), and the AFK /
  turn-timeout driver ends turns the same way. A seat that passes therefore gets
  no Necromancy Amplifier / Portal of Summoning / Mana Vortex prompt that turn
  — the rulebook resolves them "after drawing", so no draw means no prompt.
  BEFORE this change they were queued at turn start and fired regardless; this
  is a real behaviour change, now a conscious one. Pinned in
  `siege-tokens.test.ts` ("a seat that ends its turn WITHOUT drawing forfeits
  that turn's building prompt", with the next-turn CONTROL).
- **A turn-start building's card gain now lands AFTER the hand-limit snapshot**
  (e.g. a Necromancy Amplifier fetch onto a just-filled hand leaves it one over
  the limit for that turn, with no forced discard-down). That matches every
  other mid-turn card gain in this engine — only the start-of-turn snapshot
  enforces the limit, and the NEXT turn's snapshot forces the discard-down. It
  is a real change from the old ordering, where the same fetch was folded into
  the snapshot.

## Table info & readability pass (2026-07-25) — presentation only

No engine change; every value shown is already public in player views.

- **A Pack card names the Few side it flips to.** `unitFlipSidePreview`
  (unit-transforms.ts) derives the other printed side through `applyUnitSideRules`
  — the SAME numbers the real flip produces, house-rule buffs and the per-side
  melee/ranged TYPE switch included. Rendered as a quiet dashed strip in the combat
  inspector (`.inspectFlipSide`) and as a line in the enlarged card view. Null (so
  nothing renders) for a Few/Neutral side, a Creature-Bank / boss card, a Clone or
  a card under a specialty cover. Veteran-rank folds and Polish Stack layers are
  deliberately NOT applied — it is the printed card the player is about to see.
  `unit-flip-side-preview.test.ts` + `board.test.tsx`.
- **The opponent window adds public counts + the discard pile:** cards in hand,
  cards in deck, discard size, crowns left/total this combat round, and the main
  hero's movement points — plus the whole (public) discard pile browsable newest
  first with the face-up top ringed. `opponent-info.test.tsx`.
- **Watching a PvM fight shows the FIGHTER's resources.** The combat command dock
  used to report the VIEWER's own spell/crown counters even when another seat was
  playing out a neutral fight ("anyone may watch"), which is meaningless noise. It
  now follows the fighter — name-labelled, with their hero Level, Spell x/y,
  crowns left/total, Morale and hero MP (2026-07-31: the hand COUNT left the
  dock for the glyph metric row; it lives in the Opponent-info window) —
  whenever the viewer is not a participant (attacker, defender or a living
  unit's controller). A participant's own dock is unchanged. `board.test.tsx`.
- **The card name/HP plate no longer covers the printed initiative.**
  `.boardCardHud` was `max-width: 100%`, so a long name ("Neutral Iron Golems")
  spanned the card bottom and hid the bottom entry of the left stat rail —
  Initiative. Capped at 76% (right-anchored, name ellipsizes). jsdom cannot compute
  CSS, so the contract is pinned in `board-card-hud-width.test.ts`.

## Creature Banks (Naval Battles optional rule) — what runs vs. what is deferred

Added in `src/data/map/creature-banks.ts` (data, tested in
`creature-banks.test.ts`) and wired through the combat engine (tested in
`src/engine/creature-bank-combat.test.ts`) with map/combat UI in
`screen.tsx` / `board.tsx` (badge tested in `board.test.tsx`). Leading with what
is NOT done:

**Implemented and engine-enforced (a test fails if removed):**
- **Polish house-rules rollout — current limit:** `polish-bank-sizes`,
  `polish-unit-stacks`, `polish-spell-book`, plus the newer variants
  `polish-reduced-starting-bonus`, `polish-rule-111`, `polish-reduced-surrender`,
  `polish-random-artifacts`, `polish-pandora-search`, `polish-wait`, and
  `polish-quick-combat` are
  implemented and default OFF in both BINH and Legacy. The existing stash-style
  Spell Book and Polish Spell Book are mutually exclusive; enabling Polish
  forces the old toggle off. The multi-round all-rules computer soak and Polish
  economy policy cover the first three; the newer ones are pinned in
  `polish-house-rules-extra.test.ts` (pure helpers + setup/surrender/wait/
  Pandora CONTROLs). Rolled bank sizes specifically are inert when the base
  `creatureBanks` option is off; the lobby greys that toggle out in that case.
  `polish-random-artifacts` requires split Artifact decks and is greyed out when
  `split-decks` is off; it also upgrades Polish Pandora Search by +1 card on a
  "+1" die. Random Artifacts rolls at every Artifact acquisition chokepoint
  (shared-deck Search, dig, black market, event merchant/messenger draws) via
  `polish-random-artifacts.ts`. Audit pass (2026-07, each fix mutation-checked
  in `polish-house-rules-extra.test.ts`): the access LATCH from the roll can
  never outlive its acquisition — taking the discard top, a zero-candidate /
  empty-reveal Search, and eliminating the owner mid-Search/mid-visit all clear
  it (a stale latch silently reused the old roll for the NEXT acquisition);
  Rule 111 is pinned end-to-end (offer only on the OWN home tile at difficulty
  I, swap consumes the once-per-game token, skip does not; rule-off /
  foreign-tile / already-used CONTROLs) and now CHAINS after the Groovy Satyr /
  Judge Dread / Visions pre-battle swap windows instead of being silently
  skipped by them (`revealNeutralArmyAfterSwapWindows`); `polish-wait`'s Waited
  re-activation runs a REDUCED start-of-activation package (no second
  regeneration / poison cube / Fire Wall burn / negative-morale skip check /
  "[activation]" ability reset — only the Paralysis skip still applies) and the
  adventure pump enters the Waited phase even when the active unit dies without
  acting (the corpse-drop path used to end the round over pending Wait tokens);
  a mid-Pandora-Search elimination returns every lifted Pandora card to the
  deck; the Wait and mid-fight Surrender buttons render in the combat command
  dock (`board.tsx` COMMAND_ACTION_TYPES — engine offers existed with no UI
  surface). KNOWN LIMIT: the sandbox-only "Start next combat round" button can
  still skip pending waiters (test mode, deliberate); the reduced starting
  bonus's Minor-Artifact draw returns skipped non-minors under the pile without
  a reshuffle.
- **The reduced starting bonus's "keep 1 of 2 Minor Artifacts" pick shows the
  CARD FACES** (2026-08-10, reported "please make artifacts with graphic - not
  only text"): its `RESOLVE_DRAW_CHOOSE_MINOR` step already carried the whole
  reveal (`drawn` + `keepIndexes`), so the tray reuses the Polish Pandora
  Search's card row verbatim — `KEEP_ONE_DRAWN_STEP_KINDS` in
  `PromptTray` (screen.tsx) maps BOTH resolution steps to that row, with only
  the hint/button wording differing (`data-row-kind="artifact"`). PRESENTATION
  ONLY: the engine is untouched, the click dispatches the SAME
  `RESOLVE_VISIT_STEP` optionIndex the text button did, and the drawn ids stay
  masked from other seats by the existing owner-only `pendingVisit.steps`
  redaction. The OUTER "Starting bonus (Reduced)" prompt is unchanged (no cards
  are on the table yet, so it keeps its artifact/resource glyph tiles), and the
  reduced mode's other option (roll for resources) is not a card pick. jsdom
  cannot compute CSS, so only the DOM contract is pinned
  (`reduced-starting-bonus-artifact-choice.test.tsx`, 6 cases with masking +
  outer-prompt + plain-CHOOSE_ONE CONTROLs); the row's sideways scrolling is a
  real-browser concern.
- **NO Quick Combat on Ⅵ/Ⅶ fields — EVER, either rule** (user rule 2026-08-03,
  fixing the recurring "there is STILL a Quick Combat option on VI/VII"
  complaint). A centre-band guard (difficulty 6–7) is ALWAYS fought out: neither
  the classic `level > difficulty` auto-win NOR the Polish strength shortcut
  applies. ONE shared cap — `QUICK_COMBAT_MAX_FIELD_DIFFICULTY` = 5 /
  `quickCombatAllowedAtDifficulty` in `src/engine/polish-quick-combat.ts` —
  gates every seam: the classic branch and the Polish outcome in
  `startNeutralEncounter`, plus the two display reads
  (`heroMoveResolvesAsQuickCombat`, `polishQuickCombatFieldInfo` returns null on
  Ⅵ/Ⅶ). Diplomacy's matching-level skip is untouched (it is a separate crown
  card, not Quick Combat). Pinned in `polish-quick-combat.test.ts` (Ⅵ fights
  rule-on AND rule-off, with a fully-covered Ⅴ CONTROL that still gets the
  choice — proving it is the difficulty cap, not coverage, that forces the
  fight; mutation-checked).
- **Polish strength-based Quick Combat (`polish-quick-combat`, default OFF;
  tournament community sheet).** With it ON, Quick Combat at an ordinary guard
  FIELD (Ⅰ–Ⅴ only — Ⅵ/Ⅶ never qualify, above) keys off the ARMY, not hero
  level: the 5
  strongest cards (bronze 1 / silver 2 / gold 3 / azure 4; faction Pack ×2;
  +0.5 per `polish-unit-stacks` layer; a recruited NEUTRAL card counts 1× its
  tier — a single group, and azure exists only as Neutrals, matching the
  sheet's flat "azure 4") must reach `2×FieldDifficulty + X` (easy 1 / normal
  2 / hard 3 / impossible 4; +1 whenever the Unit-Stacks machinery
  `armyUnitStacksActive` is on), equal-or-higher qualifying. Covered + no
  Experience possible (level above the field; Secondary
  Heroes never gain XP) → MANDATORY auto-resolved Quick Combat (same
  QUICK_COMBAT_WON path — Freelancer's Guild bounty, field visit, no XP, no
  Necromancy). Covered + Experience possible → a `polish-quick-combat`
  pendingChoice (fight or quick). At the EXACT field level the strength shortcut
  STAYS on the table (the five-session branch REMOVED the earlier 2026-07-28
  `level !== difficulty` carve-out): a covered matching-level fight offers Quick
  Combat FIRST, and choosing "Fight" then opens the matching-level Cyra's
  Diplomacy choice (whose "Fight" opens combat) — pinned in
  `polish-quick-combat.test.ts`. NOT covered → the fight is mandatory even for a hero whose
  level beats the field (the classic level auto-win is replaced). Deliberate
  limits: Banks, bank-style outpost/teleport guards and designer EXACT armies
  keep their own no-Quick-Combat rules; the threshold reads the PLAIN scenario
  difficulty (no Astrologers easing); the strength read uses printed tiers
  (Sandro-cloak covers / veteran ranks ignored) and the CURRENT army (an
  emptied army reads 0 even though placement would restore the starting army);
  the AI answers the optional choice by preferring the certain Quick Combat
  (pinned in `choice-policy.test.ts`), and its map-policy engagement heuristics still reason
  by level (it may walk into a real fight it expected to skip — it just fights
  it). Engine in `src/engine/polish-quick-combat.ts`, wiring in
  `startNeutralEncounter`; every claim mutation-checked with rule-off /
  below-threshold CONTROLs in `polish-quick-combat.test.ts` (the sheet's
  worked examples 2×3+2+1=9 and 2×5+3=13 included).
- **Tournament Morale "Search again" (Tournament Book p.54)**: on a table with
  ANY tournament flag frozen onto adventure state (master mode or a granular
  rule) and Morale CARDS off, a player looking at their own revealed Search
  cards may spend the positive Morale token (overflow first) to discard ALL
  revealed cards and perform the same Search (X) again — re-run off
  `DECK_SEARCH.baseCount`, preserving the Tarnum `allowRemove` privilege; the
  Random-Artifacts latch clears so the re-run rolls fresh. Offered in
  legal-actions inside the open DECK_SEARCH and rendered as a button in
  `SearchModal` (its only surface — the modal covers the table). With Morale
  Cards ON the printed repeat_search CARD flow is the only repeat (SPEND_MORALE
  repeat-search throws). Pinned in `tournament-morale-search-again.test.ts`
  (offer/spend/re-run + non-tournament and no-token CONTROLs) and the button in
  `deck-search-mode-modal.test.tsx`.
- With `polish-unit-stacks` ON, a faction Pack card — or a recruited NEUTRAL
  card — at its own Citadel may buy persistent Stack layers with the Population
  flow. One Stack costs that side's printed gold cost plus its tier number
  (bronze +1 / silver +2 / gold +3; azure counted as gold) **plus the side's
  printed VALUABLES** (2026-08 — the same valuables fee a Few→Pack reinforce of
  that unit pays; a side printing no valuables adds none, building materials
  never join the cost; `polishUnitStackCost`, pinned per-tier in
  `polish-unit-stacks.test.ts` and named in the town/army purchase labels).
  Recruit/reinforce percentage discounts do not apply to the base price, but
  the purchase still pays through the recruit path (Legion `{kind:"stack"}`
  vouchers + Freelancer's Guild substitution — see the Stack COST extensions
  bullet below). Caps are bronze 3 / silver 2 / gold 1
  (azure as gold → 1) — always the ARMY table, even for a unit whose bank-guard
  twin punches higher. Every layer keeps that side's stats and ability. While
  at least one layer remains the card has exactly +1 Attack; lethal damage
  removes one full health layer and carries every excess point through
  additional layers (a Neutral has no Pack→Few flip: once its layers and body
  are spent the card is removed as usual, and a survivor syncs its remaining
  layers back to the army card). Rebirth
  fires first, Creature Bank `stackToken` abilities remain isolated, Pack→Few
  drops the layers, survivors sync back after combat, and keep-troops PvP keeps
  the pre-combat investment. The town row, army panel, and combat card share the
  generated `public/assets/ui/polish-unit-stacks-coin.webp` count badge, coloured
  by the stack COUNT (1 brown / 2 silver / 3 gold — `armyStackBadge.count-N`).
  Covered by `polish-unit-stacks.test.ts`, `town-recruit-shortcut.test.tsx`, and
  `board.test.tsx`. Computer policy buys Stack layers only from surplus after
  completing its core army; the purchase is optional and opens no mandatory AI
  window.
- Stack COST extensions (`polish-stack-features.test.ts`, each with a rule-off
  CONTROL). Leading with the limits: the special offers below price their Stack
  at offer time and do NOT fold Legion vouchers (only the town Population
  purchase does); the neutral-Skeletons free-bronze reward deliberately does NOT
  gain a Stack arm (its printed text grants only the flip); the AI scores the
  new options generically (no bespoke policy). What runs: Necropolis City
  Hall's "reinforce 1 bronze free" pick also offers a FREE Stack on a bronze
  Pack/Neutral card (and stays offered when only a Stack target exists);
  Necromancy's after-combat play also sells ONE Stack at half gold rounded down
  (basic bronze/silver, expert any tier — since 2026-07-27 that sale is the
  BANKED `REDEEM_REINFORCEMENT_DISCOUNT` offer, not an immediate prompt, and the
  card is spent when PLAYED, not only when the Stack lands; the old
  spend-on-landing prompt is the `immediate-reinforcement-prompts` toggle — see
  the reinforcement-discount section below); Rampart Saplings and the Cove Pub extend their Astrologers'-round
  deals to ONE Stack (half gold rounded up / −3 gold, same tier lists); Conflux
  Garden of Life's freebie can be a FREE Stack on the owned Sprites Pack; ALL
  Stack purchases now pay through the recruit path, so the Freelancer's Guild
  substitutes materials/valuables for missing gold; a Legion piece can be
  reserved for (and is consumed by) one card's Stack purchase (`{kind:"stack"}`
  voucher target — a reinforce voucher never bleeds onto a Stack); and the
  Astrologers' Terrible Plague is WEAKENED by Stacks — a Stacked pack sheds one
  layer (`ARMY_STACK_LOST` with a reason) instead of flipping to Few. ONLY the
  Plague is weakened: Pandora's Silver-Muster reverse shares the
  `FLIP_PACK_TO_FEW` step but keeps the plain whole flip (`step.source`
  disambiguates; pinned with a CONTROL in the same test file).
- With `polish-spell-book` ON, starting Magic Arrows leave the M&M deck and
  become refreshed Book Spells; Might heroes receive one Cast a Spell card and
  Magic heroes two. Every owned Spell acquisition goes to the Book, while
  temporary Tarnum casts and Scrolls retain their normal zones. Casting consumes
  one Cast a Spell from hand and moves only the chosen Spell refreshed→used;
  the whole used side refreshes at the beginning of each game round. EXCEPTION
  (user rule 2026-07): while an Intelligence effect is held (combat-long), the
  holder selects and casts a refreshed Book Spell directly — no Cast a Spell
  needed or consumed (the offer strips `castEnablerCardId`; the free path lives
  in `consumePolishSpellBookCast`; limit unchanged: basic 1/round, expert +1).
  Knowledge returns the Cast card but not the Spell, Mysticism refreshes the
  cast Spell, and discard-recovery artifacts refresh used Book Spells — every one
  of those refreshes now obeys the "IN EFFECT" section below. Ciele
  I/IV and both Crown of Dragontooth options have Book-specific
  paths; **Genie Wish does NOT any more** (user ruling 2026-08-04 — refreshing a
  Book Spell, e.g. Dimension Door, every fight was far too strong): under Polish
  it runs the PRINTED dig like every other mode — dig `count` off your own deck,
  take one takeable card to HAND, the rest to the discard — and since owned Spells
  live in the Book the takeable card is a **"Cast a Spell" enabler**
  (`isWishTakeable` in `runGenieDeckDraw`, one predicate for both modes; the
  `genie-take-spell` multi-pick and `resolveGenieTakeSpell` are now mode-free).
  Its offer/trigger gating therefore MIRRORS the non-book rule: offered whenever
  the deck (or the discard that reshuffles in) has a card to dig, and NOT offered
  on an empty deck+discard — a used Book Spell is now irrelevant to it. Pinned in
  `polish-spell-book.test.ts` ("Genie Wish digs the deck and takes a Cast a
  Spell — it NEVER refreshes a Book Spell", with a no-enabler-in-the-top-3
  CONTROL, a nothing-used-still-offered case and an empty-deck CONTROL); the
  non-book behaviour is unchanged (`expansion-creature-abilities.test.ts`).
- **"IN EFFECT" — the third Book section** (user ruling 2026-08-04): a Book Spell
  whose cast left a LIVE lasting effect (Water Walk / Fly "this turn", a
  combat-long Haste) is neither refreshed nor plain-used — it sits in effect, like
  a played Luck ability in the Ongoing tray, and **NO refresh source may return it
  to the refreshed side until that effect ends**. ONE shared read —
  `polishBookSpellEffectIsLive` (`polish-spell-book.ts`, matching a live
  `activeEffects` entry sourced from that card id, plus the classic Ongoing tray) —
  gates every path: the round-start whole-side refresh (`startAdventureRound`,
  which also MOVED to after the round-end expiry pass so a round-scoped Book Spell
  still refreshes in the same round start its effect ends), `refreshPolishUsedSpell`
  (Mysticism recall, the Clone return, the cancel paths — refused with a feed note)
  and the discard-recovery "Refresh a Spell in your Spell Book" pick (candidate
  filter + a forged-pick backstop). When the effect ends at its own duration seam
  (turn start / round end / combat end) the card becomes an ordinary used Book
  Spell and refreshes normally. Pinned in `polish-spell-book.test.ts` ("a Spell IN
  EFFECT cannot be refreshed": the round-start case then the post-expiry refresh,
  the recovery offer+pick with a plainly-used Spell as the in-test control, the
  Mysticism case, and an INSTANT Book Spell CONTROL that still refreshes).
  NOT changed: the Mage Guild's Rolling Spells still UNINSCRIBES a used Book Spell
  (a paid removal, not a refresh) without consulting this gate. The NON-book
  (physical card) game needed no fix and is now pinned: an ongoing spell mid-effect
  sits in `ongoingCards`, never the discard, so no recall/recovery path can reach
  it (Knowledge only MARKS its `returnTo`) — `polish-spell-book.test.ts` ("Ongoing
  spells mid-effect stay in play (no Book)", with a resolved-instant CONTROL that
  IS recoverable).
- **ONCE PER ROUND — a single Book Spell may be refreshed only once per game
  round** (user rule 2026-08-07). Part of the Polish Spell Book MODE itself, NOT a
  separate house-rule toggle: with the mode on, every MID-ROUND refresh source may
  return a given Book Spell to the refreshed side at most once per game round.
  State is `player.polishSpellsRefreshedThisRound?: CardId[]` (optional — absent on
  legacy snapshots = nothing blocked; NOT masked in player views, and nothing to
  mask: a refresh moves a card off the public face-up `spellBookUsed` side and
  already appends a public `SPELL_RETURNED_TO_HAND` event). ONE shared read beside
  the "in effect" gate — `polishBookSpellRefreshBlocked` (`polish-spell-book.ts`,
  returning `"in-effect" | "already-refreshed" | null`) plus the candidate helper
  `midRoundRefreshablePolishUsedSpells` — so offers and resolution can never
  disagree. Gated sources (the complete mid-round set; every other used→refreshed
  transition in the repo belongs to a classic/stash Book, not the Polish one):
  `refreshPolishUsedSpell` (reducer.ts — Mysticism at cast resolution, the
  attack-window deferred recall, the cast-window instant recall, the Clone refund
  and the spell-cancel path, all five through that one helper) and the
  discard-recovery "Refresh a Spell in your Spell Book" pick (Crown of
  Dragontooth's recover arm, Helm of the Alabaster Unicorn, Rib Cage, Crown of the
  Five Seas, Thunder Helmet, Ciele I's Magic-Arrow filter — candidate filter in
  `openDiscardPick`, playability gates in `legal-actions.ts`, and a resolution
  backstop with a feed note in the `discard-pick` `CHOOSE_OPTION` branch).
  Leading with what it deliberately does NOT do:
  - **The ROUND-START whole-used-side refresh is exempt** — it IS the round
    mechanism: it reads the marker-free `refreshablePolishUsedSpells` and, only
    AFTER refreshing, clears every player's markers (the order matters; clearing
    first would make the exemption structurally true and untestable).
  - **Mysticism's OFFER is not withheld** — exactly like the in-effect gate, only
    the refresh HALF is refused (with a feed note); the recall still hands the
    "Cast a Spell" enabler back, which is why the reaction stays playable.
  - **A recovery card whose every used Book Spell is spent is not playable at
    all** (its playability gate reads the same filtered pool) — the pre-existing
    reading for an all-in-effect Book, kept consistent.
  - **Counted per physical COPY**: the marker list keeps multiplicity and the
    budget is how many copies of that Spell the Book holds, so a player genuinely
    holding two copies refreshes each once. LIMIT: a Spell UNINSCRIBED mid-round
    (Rolling Spells / Crown option B) and re-acquired the same round keeps the
    old copy's spent marker — conservative, unpinned, effectively unreachable
    since a newly gained Spell enters the REFRESHED side.
  - **Knowledge is unaffected** (it returns only the Cast a Spell enabler, never
    the Spell), and so is the MAP recall path (`offerMapSpellKnowledgeRecall`
    under Polish never refreshes a Book Spell). Rolling Spells is a paid REMOVAL,
    not a refresh, and still ignores both gates.
  - **Non-Polish games are untouched** (no Book, no markers) — CONTROL-pinned.
  Pinned in `polish-spell-book.test.ts` ("a Spell can be refreshed only ONCE per
  round", 8 cases): the Mysticism refresh-then-refuse round trip, the recovery
  offer dropping the spent Spell while a DIFFERENT one stays offered, the stale-
  pick resolution backstop, the round-start exemption + marker clear + a fresh
  next-round refresh, the cross-source Mysticism→Dragontooth refusal, the
  nothing-left playability gate with a cleared-marker CONTROL, the two-copies
  case, and a rule-OFF CONTROL. Mutation-checked: deleting the `already-refreshed`
  branch fails 7, deleting the discard-pick marker write fails 4, deleting
  `refreshPolishUsedSpell`'s marker write fails 1, deleting the round-start clear
  fails 1, and subjecting the round-start refresh to the limit fails 1. The Mage
  Guild searches 3, may grant/buy Cast cards, grants Cast at levels V/VII when
  built, and offers once-per-round 3-gold Rolling Spells (return one owned Spell,
  Search 2). The Spell deck remains merged even when Artifact decks split. The
  existing painted Book UI/art is reused and shows refreshed/used counts; Book
  Spells cannot be burned for Power, while Cast a Spell keeps its printed +1
  Power alternative. Covered by `polish-spell-book.test.ts` and Book modal/hand
  UI tests.
- With `polish-bank-sizes` ON, a bank-eligible reveal peeks the top TWO tokens
  (or one when the pile has one), rolls each candidate's size with seeded Attack
  dice (the sheet table: −1→Ⅰ, 0→Ⅱ, +1→Ⅲ, −2 OR +2→Ⅳ), and opens a MANDATORY
  pre-rotation choice — A / B / **Leave it blocked** (a single candidate offers
  Place / Leave it blocked) — and only then offers tile rotation. Declining sets
  `tile.reservedBankDeclined`, so the post-rotation placement step is skipped
  and the pile stays intact (it was only peeked). The full bank-before-rotate
  chain also runs when the reveal comes through a Subterranean Gate entry OR a
  Monolith/Teleport-Gate token travel into a face-down tile (both routed through
  the same `onMapTileRevealHook` → `beginTileRotation`; pinned in
  `subterranean-gate-choice.test.ts` and `map-tokens.test.ts` "reserves its
  Creature Bank BEFORE rotation").
  The seat's FIRST Ⅱ–Ⅲ (Far) opening rolls ONE die per candidate (a single die
  only reaches Ⅰ–Ⅲ); every later Far opening and every Near bank rolls two.
  Only the chosen token is removed by id after rotation; the unchosen peek
  stays exactly where it was. The house rule ONLY sets the number of Stacked
  defenders — otherwise the bank is a NORMAL Creature Bank. The **size is the
  GUARANTEED count of Stacked defenders**: size N places a standard random-stat
  Stack Token (+1 Attack/Defense/Health or +2 Initiative, absorbing one lethal
  blow — rulebook p.67) on exactly N of the bank's four guards. The normal
  official rule instead guarantees the Scenario Difficulty count (Easy 1 /
  Normal 2 / Hard 3 / Impossible 4); the optional BINH
  `bank-stack-chance-80` toggle rolls each candidate at 80%. There is NO size
  clamp (every bank can roll Ⅳ = all
  four Stacked) and NO bespoke coin-layer system. **Win rewards are the NORMAL
  bank reward** (`bank.buildReward(X)` with X = the Stacked count = size): the
  same per-bank payout the rulebook scales by X — size Ⅳ simply means all four
  defenders were Stacked. The two unit banks (Dragon Fly Hive / Griffin
  Conservatory) grant the FEW card either way — plain, or (X ≥ 2) carrying a real
  rulebook Stack Token (`ArmyUnitState.stackToken`, the actual game "Stacked"
  unit) — plus the Empower pick, exactly like an ordinary bank win. NEVER the
  Pack side, and NEVER an army-stack layer, so `armyUnitStacksActive` is
  `polish-unit-stacks` ONLY (Polish Bank Sizes no longer activates the army-stack
  machinery) and the reward token stays independent of Polish layers even with
  both rules on. The size marker's coin is coloured
  by size (Ⅰ black / Ⅱ brown / Ⅲ silver / Ⅳ gold, the v1.2 sheet colours) and
  shows the size number; each Stacked defender shows the normal stat Stack Token
  badge. Covered by `polish-bank-sizes.test.ts` (guaranteed-count with an
  official difficulty-count CONTROL, no-clamp, normal-token absorb, and normal-reward routing, each
  mutation-checked), the bank combat/ability controls, and the bank DOM cases in
  `creature-bank-board.test.tsx` / `board.test.tsx`.
- The 12 banks' defenders, bank-card stats (their OWN stats, no tier — distinct
  from Few/Pack/Neutral), and resource/morale/search rewards scaled by the
  number of Stacked defenders (X). The two sea banks (Shipwreck, Derelict Ship)
  grant NEGATIVE morale (−1; a haunted-wreck house reading), and the Medusa Stores
  per-Stack bonus is a CHOICE of +3 gold OR +1 valuables (not both); both are
  pinned in `creature-banks.test.ts`.
- Gradeless targeting: a bank card carries NO tier ("grade 0"), so the neutral
  AI's same-tier priority can't apply — a bank guard (the `bankUnit` flag) ranks
  its candidate targets purely by distance and attacks the NEAREST. It KEEPS the
  universal ranged rules (a ranged guard still hunts ranged targets first; an
  engaged one must hit an adjacent enemy) — only the tier ordering is dropped.
  Conversely, a bank guard card AS A TARGET is no-tier too, so a graded neutral
  attacker hits it LAST (behind every graded enemy, exactly like a summoned
  unit) — `isNoTierTarget` in `neutral-ai.ts`. Wired in `neutral-ai.ts`
  (`isGradelessNeutralAttacker` / `isNoTierTarget`), tested in
  `creature-bank-combat.test.ts` ("are gradeless and target the nearest enemy"
  and "a gradeless bank-guard card is targeted LAST"), each with a graded
  CONTROL that diverges.
- Tier-specific spells/specialties cannot target a bank defender: with no tier it
  fails every grade gate (Blind, Berserk, Frenzy, Disrupting Ray, Forgetfulness,
  Sorrow/Skip-Activation, Slayer, …). Enforced both at targeting (a tier-gated
  card never offers a bank guard — `effectIsTierGated` in `legal-actions.ts`) and
  at resolution (`gradeRankOfUnit` ranks a bank unit above every grade in both
  `legal-actions.ts` and `reducer.ts`, so a forced cast fizzles). Tested in
  `creature-bank-combat.test.ts` ("exempt from tier-specific spells") with a
  graded CONTROL.
- "Gain a unit" rewards: the Dragon Fly Hive (Dragon Flies) and Griffin
  Conservatory (Griffins) add their dedicated CREATURE BANK card to the army
  for free. They never grant the similarly named faction or Neutral-deck card,
  and never grant a Polish Unit-Stack layer even with `polish-unit-stacks` on
  (a DIFFERENT mechanism). The `GAIN_UNIT` interaction carries `side:"bank"` +
  `stacked:x>=2`; if eligible, resolution first opens a four-option choice
  (+1 Attack/Defense/Health or +2 Initiative), then places that chosen REAL
  rulebook Stack Token (`ArmyUnitState.stackToken`) on the awarded bank card.
  In combat the token folds one stat (+1 Attack/Defense/
  Health or +2 Initiative) into the card (`makeCombatUnitFromArmy` /
  `applyUnitCurrentSide`, mirrored onto `CombatUnitState.stackToken`); the SHARED
  absorb path (`markUnitRemovedIfNeeded`, keyed on `stackToken` alone, no longer
  gated on `bankUnit`) discards it FOREVER to soak one lethal blow, then it syncs
  back to the army card at combat end. Tested in `creature-banks.test.ts`,
  `polish-bank-sizes.test.ts` (the don't-confuse-Polish CONTROL) and end-to-end in
  `creature-bank-combat.test.ts` ("adds the gained Dragon Flies card to the army"
  + "the bank card carries a chosen Stack Token": choose, fold, absorb, and the survivor
  sync-back with an un-absorbed CONTROL).
  **What a `side:"bank"` ARMY card is and is NOT** (the reward became a real
  `bankUnit` in combat — `makeCombatUnitFromArmy` stamps the flag — so it
  inherits every gradeless bank rule, in the player's favour and against it;
  each item below is what the engine actually does today):
  - **Tierless BOTH ways, exactly like a bank guard**: tier-gated spells and
    riders (Blind / Berserk / Frenzy / Slayer / Disrupting Ray / a graded Death
    Stare follow-up) can never target it, grade-matched lethal-save cards
    (`CANCEL_LETHAL_ATTACK`) are never offered for it, and the neutral AI hits
    it LAST. `gradeRankOfUnit` reads `bankUnit` → no grade.
  - **A fallen bank card is NOT restorable by the commander First Aid window**
    (`collectFirstAidCandidates` skips `bankUnit`). That is a correctness gate,
    not just scope: the option builder derives its restored side from
    `armyUnit.side`/`unit.variant`, and a bank card would have come back as a
    plain FEW faction card.
  - **No veteran track.** `makeCombatUnitFromArmy` zeroes its `experience` and
    `armyUnitRankInfo` returns null, so the PRODUCERS refuse it too:
    `grantArmyUnitExperience` no-ops on a bank card (no post-combat XP, no
    `UNIT_RANK_UP` line) and `drillableArmyUnits` never offers it (a forged
    `DRILL_UNIT` throws "A Creature Bank card has no veteran track"). Pinned in
    `unit-experience.test.ts` ("a won Creature Bank card stays out of the
    veteran tracks"), with the same creature as a recruited NEUTRAL card as the
    CONTROL that still ranks and still drills.
  - **No Few/Pack flip, no Polish Stack layers, no Sandro's-Cloak transform**
    (no printed side carries `bank`, and `playTransformCard` rejects it), and
    **no BINH side-rule tweak** (`applyUnitSideRules` is bypassed — the bank
    face's printed stats are the whole card). A defeat removes it from the game
    (it is not recycled to a Neutral tier discard, which is right — it is not a
    Neutral-deck card).
  - **It does NOT occupy the same-named unit's recruit slot**: every "already in
    your army" ownership read (town recruit offer + `populationAction`, Garden
    of Life, Legion discount targets, the AI's dwelling score) skips bank cards,
    so a Castle player who wins the Griffin Conservatory can still recruit
    Castle Griffins. That collision is the bug this change fixed — the reward
    used to add a SECOND `castle.griffins` / `fortress.dragon_flies` Few card.
  - **Known consequence, not fixed**: the bank face prints `cost: {}`, so the
    "cheapest army card" reads (the Cursed Swamp Event's automatic discard and
    the Heavenly Tribulation toll's cheapest-first ordering) value it at 0 gold
    and pick it FIRST. Pricing a costless card would be an invention, so it is
    documented rather than special-cased.
  - **The Stacked reward is a MANDATORY player choice** (no decline branch), so
    a computer winner must be able to answer it: the generic CHOOSE_ONE scorer
    ranks all four token options in the `RECRUIT_FREE` utility band — pinned in
    `computer/visit-event-policy.test.ts` ("answers the Hive/Conservatory token
    choice instead of stalling on it").
  - **Latent, currently unreachable**: `applyUnitCurrentSide`'s bank branch adds
    the Neutral-Rank-Up STACKS fold whenever `neutralRankUp` is on and a live
    `stackToken` is present. No call site can reach it for a PLAYER's bank card
    (the token is nulled before the absorb recompute, and the flip / Polish-layer
    / transform recomputes are all impossible for this card), so today it only
    ever folds on a real bank DEFENDER — but a future recompute path would
    silently rank up a player's reward card.
  HOUSE-RULE bonus: each of these two banks ALSO grants an **Ability Empower
  token** (the `GAIN_ABILITY_EMPOWER_TOKEN` interaction, additive in the reward
  `SEQUENCE`; `player.abilityEmpowerToken`, max storage 1 — a surplus gain while
  already holding 1 forces an auto-use pick on a hand Ability, or is wasted with
  no eligible hand Ability). The token is spent ANYTIME (map, combat participant,
  parallel bystander) via the handler-validated `USE_ABILITY_EMPOWER_TOKEN` on
  one non-Empowered Ability currently IN HAND (hand-only — a discard-pile
  ability is not a target; the old instant `EMPOWER_ABILITY` hand+discard pick
  is a legacy path kept for residual steps). Spending adds the card id to
  `player.empoweredAbilities`, which lets its Expert side be played WITHOUT
  spending a crown for the rest of the game — `abilityExpertIsCrownFree` /
  `canPlayExpertMode` (`ruleset.ts`) are honoured at every Expert-use gate
  (legal-actions offers + reducer guards/spends for reactions, map plays,
  Tactics, Wisdom and Learning). Map HUD chip + combat panel buttons ride the
  engine's legal-action offers only. Designer field rewards can also grant the
  token (`CustomFieldReward.abilityEmpowerToken`, `force: true` — works even
  with the bank house rule off). Tested in `ability-empower-token.test.ts`
  (spend → crown-free Expert, hand-only CONTROL, forged-spend CONTROL, both
  surplus flows), `empowered-ability.test.ts` (the crown-free Expert play, with
  a graded CONTROL), `creature-bank-combat.test.ts` ("a win gains the unit AND
  an Ability Empower token") and `designer-field-rewards.test.ts` (the designer
  grant with a bank-rule-OFF CONTROL).
- Stack Tokens: the official rule guarantees the Scenario Difficulty count
  (Easy 1 / Normal 2 / Hard 3 / Impossible 4), each on a distinct defender.
  `bank-stack-chance-80` is an optional BINH combat house rule (default OFF in
  BINH and Legacy): with it ON, each of those tokens lands at 80%, so the count
  may be lower. A landed token gives +1 attack/defense/health or +2 initiative;
  a Stacked defender absorbs one lethal blow by discarding its token and carrying
  the leftover damage (`markUnitRemovedIfNeeded`). The board shows a gold badge
  naming each token's stat. Tested in `creature-bank-combat.test.ts` (official
  exact count plus the opt-in 80% distribution CONTROL).
- Bank combat: no Quick Combat, no experience; win marks a Black Cube and grants
  the reward. HOUSE RULE (overrides the rulebook): a bank DOES obey the one-Round
  time limit and the spend-1-MP-to-extend rule, exactly like a normal neutral
  fight.
- Battlefield formation (HOUSE RULE): a Creature Bank fight uses a special
  layout — the four guardians are pinned to the four board CORNERS
  (`CREATURE_BANK_GUARD_CORNERS` = 0/3/16/19) and the attacker deploys in the
  central SIX squares (`CREATURE_BANK_ATTACKER_CELLS` = 5/6/9/10/13/14), not the
  usual front/back rows. The shared `placementCellsFor` (engine, legal-actions,
  and `board.tsx` all consume it) and `placeCreatureBankGuards` enforce it;
  tested in `creature-bank-combat.test.ts` ("battlefield formation").
- Placement: with the rule on (`creatureBanks`, default ON), discovering a
  Far (II-III) or Near (IV-V) Map Tile with a Blocked Field offers the
  discovering player a Creature Bank token from the matching shuffled pile
  (`creatureBankTokensFar`/`Near`); accepting carves the Blocked Field into a
  bank (`placeCreatureBank`). The offer is gated on the tile GROUP
  (`creatureBankTierForGroup`): Far→Far pile, Near→Near pile, and — BINH house
  rule — a **Subterranean cavern also offers a bank, drawing from the NEAR pile**.
  Sea/center/starting tiles never trigger it — including sea tiles that DO carry a
  Blocked Field / impassable terrain (e.g. the Cove tile W1). A cavern's bank
  lands on its Blocked Field. The tile-reveal chain is now **bank-then-gate**
  (`continueRevealAfterBank`): the discovering player answers the Creature Bank
  prompt FIRST, then the Subterranean Gate exit is fixed (cycle/confirm when ≥2
  candidate hexes, else auto-carve on the nearest free hex — a bank already
  placed is skipped). Verified in `subterranean-gate-choice.test.ts` (a cavern
  gets a Near bank; `revealPastBank` passes the bank prompt to reach the gate
  exit step). Gate-isolation tests (`subterranean-gates.test.ts`,
  `designed-gate-links.test.ts`) turn banks off to pin the carve directly. A bank is
  reachable only from within its own Tile — you can walk in to fight, but it is
  never a route across a Tile edge to the outside (enforced in `canCrossEdge`,
  even for Pathfinding).
- Bank-card abilities that map to a wired engine effect: Skeletons (rebirth),
  Zombies (resilience), Vampires (life drain), Medusas + Nagas (ignore
  retaliation), Dragon Flies (-2 retaliation attack), Water Elementals (Magic
  Arrow immunity), Gold/Diamond Golems (spell-damage reduction), Griffins
  (unlimited retaliation), Gold Dragons (line breath). Cyclops Stockpile prints
  no ability.
- The former display-only hold-outs are now ALL engine-wired and covered by a
  test that fails if the logic is removed
  (`src/engine/creature-bank-abilities.test.ts`):
  - Imp Cache Familiars — while Stacked, every enemy spell loses 1 Power
    (`bank-familiar-power-drain`).
  - Crypt/Shipwreck Wraiths — on their own attack, the enemy discards 1 card
    (`bank-wraith-attack-discard`; not gated on Stacked).
  - Dwarven Treasury Dwarves / Dragon Utopia Crystal Dragons — while Stacked,
    roll the Defend die like a Defense token (`bank-stacked-defense-token`).
  - Dragon Utopia Black Dragons — while Stacked, +3 Attack
    (`bank-black-dragon-stacked-attack`).
  - Dragon Utopia Faerie Dragons — while Stacked, the enemy cannot cast Spells
    (`bank-faerie-dragon-spell-lock`; blocked at legal-actions AND backstopped at
    resolution).
  - Medusa Stores Medusas — while Stacked, the attack also Paralyzes
    (`bank-medusa-paralyze-stacked`; the ignore-retaliation half always runs).
  The "while Stacked" gate lives in ONE place — `getUnitAbilityDefinitions`
  hides any ability flagged `requiresStacked` until the unit carries a Stack
  Token — so the effect switches off the instant the token is discarded.

**Display-only bank-card abilities:** none. `DISPLAY_ONLY_BANK_ABILITIES`
(`src/data/units/abilities.ts`) is now empty; it remains the explicit, reviewable
home any FUTURE decorative bank clause must be declared in.

All twelve bank rewards are now engine-resolved (`rewardStatus: "implemented"`).
The Pyramid's per-Stack extra — "up to X times, remove 1 Spell/Ability/Artifact
card from hand or discard pile, then Search (5) the matching deck" — runs via the
`REMOVE_THEN_SEARCH_REPEAT` interaction/visit-step (an optional, Done-exitable
loop built in `processPendingVisit`, mirroring `REMOVE_UP_TO`). It is covered by
a test that fails if the logic is removed (`creature-banks.test.ts` for the data
and `creature-bank-combat.test.ts` "Pyramid: a Stacked win …" end-to-end).

**NOT implemented at all (deferred):**
- Bank units still carry the underlying unit's `grade` field for placement and
  display, but it never grants them a tier in play: the gradeless TARGETING/AI
  rules above treat a bank card as no-tier ("grade 0") on BOTH axes — its guard
  targets the nearest, and as a target it is hit LAST — and tier gates exempt it
  via `gradeRankOfUnit`. (The "gain a Stacked unit" reward is NO LONGER a deferred
  house reading: army cards now carry a real rulebook Stack Token via
  `ArmyUnitState.stackToken` — the dedicated bank card is granted Stacked,
  never a faction/Neutral-deck card. See the "Gain a unit" rewards bullet above.)

## Monolith & Whirlpool Tokens (Conflux/Cove, map-designer content) — what runs vs. readings

Location Tokens per rulebook p.35/83, placeable ONLY through the map designer
(`CustomMapTilePlan.token`; no standard scenario ships them). Data in
`src/data/map/locations.ts` (`monolith`, `whirlpool`, category "revisitable"),
engine in `src/engine/adventure.ts` (`resolveTokenTeleport`, `resolveGateTeleport`
and the map-token section) + `adventure-reducer.ts` (`offerPendingTokenPlacement`,
`place-map-token`), setup in `adventure-setup.ts` (`applyCustomMapTokens`).
Behaviour pinned in `src/engine/map-tokens.test.ts` + `map-objects.test.ts`
(observable outcomes — hero position, army size, field state — each
mutation-checked with CONTROLs), the designer UI in `map-designer.test.tsx`, the
board art in `gate-object-board.test.tsx`, save round-trip in
`map-registry.test.ts`.

**CANONICAL forms (one per location — kills the "2 hex 2 effects" class of bug):**
an ON-tile teleporter is a TILE TOKEN (`CustomMapTilePlan.token`, kind
`"monolith" | "whirlpool" | "gate"`); an OFF-tile one is a STANDALONE
`CustomMapObject`. The designer never WRITES a tile-slot object any more — an
armed/dragged teleporter dropped ON a tile writes/moves a `plan.token`, dropped
OFF every tile writes/keeps a standalone object, and dragging one from tile↔off-
tile CONVERTS between the two canonical forms in one batched
`onChange`+`onObjectsChange` (guard dropped with a hint when object→token; pair
always preserved). Legacy saved presets carrying a tile-slot object STILL carve
exactly as before (`applyCustomMapObjects`).

**Teleport Gates (colored Gates) are Monoliths WITH a color** — one per-color
teleport NETWORK each (1 red, 2 blue, 3 green, 4 violet), NEVER connecting across colors or to
Monoliths (and Monoliths/Obelisks never join a gate pair). A gate TILE TOKEN
REQUIRES its `pair`; monolith/whirlpool tokens must NOT carry one (sanitisers
drop/strip violations — `sanitizeTileToken` in `map-registry.ts`). Gate tokens
use the Monolith LAND legality everywhere (`tokenMayCoverFieldDef` / the
`faceDownTokenKinds` land groups now include `"gate"`), carve via
`carveColoredGateField` (its own gate field), and travel like the Monolith
network partitioned by `gatePair` — FULL parity, face-down tiles included:
`resolveGateTeleport` offers every OTHER same-color gate — carved FIELDS (minus
hero-occupied ones) AND same-color gate tokens still riding FACE-DOWN tiles
(`coloredGateDestinations` / `countColoredGates`, the Monolith
`mapTokenDestinations` / `countMapTokens` mirror). Since the 2026-07-24 rule
every entry opens a travel-vs-stay offer (see rule 3a below): 1 free → [Travel,
Stay], 2+ free → the destinations + "Stay here", <2 same-color gates → inert
note, all-own-occupied → fizzle; arrival never re-triggers. A guarded gate
fought ON ENTRY still gates the travel; a guarded gate reached by ARRIVAL is now
FOUGHT bank-style (rule 3 — no longer auto-swept), and an enemy-hero destination
starts a PvP battle. On the board EVERY teleport-object field (tile-carved or standalone) —
Teleport Gate, Monolith, Whirlpool AND one-way Monolith halves — draws the SAME
designer-parity mark the map editor uses (user request 2026-07): the object's
own UNDISTORTED token art (`teleportGateImage` — 1 red / 2 blue / 3 green /
4 violet, renamed from yellow — / `monolithTokenImage` / `whirlpoolTokenImage` /
`onewayMonolithImage`) inside an identifying ring (pair-colored, gold for
Monolith/Whirlpool) + a pair-number badge on the colored networks, and a
designer guard's level numeral stays visible on the hex even in art mode
(`teleportHexMark` in screen.tsx, the `gateHexMark` generalisation — the old
full-hex `preserveAspectRatio="none"` stretch is retired; pinned in
`gate-object-board.test.tsx` "designer-parity marks"); gates are labeled
"Teleport Gate" in the UI. LIMIT (updated 2026-07): a tile may host multiple
tokens on DISTINCT slots; gate TOKENS (like every single-hex placement) may now
carry a designer guard (see the "Designer guards, outposts & one-way monoliths"
section below); the per-color cap is `MAX_GATES_PER_PAIR` (8), counted across
BOTH sources (plan gate tokens + gate objects) for the lone-gate / over-cap
warnings (`validateCustomMapObjects`).

Leading with what does NOT run / deliberate readings:
- **The plain (colorless) Monolith is RETIRED from the designer palette**
  (2026-07): every NEW two-way teleporter is a colored Teleport Gate; one-way
  monoliths are their own objects (section below). LEGACY saved maps with
  Monolith tokens/objects still carve, travel and render exactly as before
  (the Monolith network, the "monolith" Obelisk role and the anime
  `tran_phap_truyen_tong` override are untouched); the whirlpool-only ADD
  picker and the retired palette button are pinned in `map-designer.test.tsx`.
  With 3+ monoliths the offer lists every destination + "Stay here"; with
  exactly 2 it is [Travel, Stay] (the 2026-07-24 rule replaced the old automatic
  travel — see rule 3a in the "Designer guards, outposts & one-way monoliths"
  section).
- **"Lose 1 unit from your unit Deck" is the traveller's pick** of one army
  card (the card names no unit); a Neutral-side card recycles to its tier
  discard pile like a combat casualty. An empty army loses nothing (noted).
- **Own-hero destinations are skipped, ENEMY-hero destinations are OFFERED**
  (2026-07-24 rule; the p.83 "skip the movement if you would be stepping onto an
  ALLIED Hero"): a token the traveller's OWN hero stands on is not offered and
  the 3-whirlpool die rerolls its number; a token an ENEMY hero stands on IS
  offered (travelling there starts a PvP battle on arrival, rule 3). With no
  free/enemy destination the travel fizzles with a note. The AI's known-teleport
  read (`listKnownTeleportDestinations`, no traveller context) still blocks ANY
  occupied hex — conservative, so it never plans a jump onto an occupied cell.
- **A token may cover ANY field except a Creature Bank / blocked hex / another
  teleporter / a PvE-module gate / a live guard** (user rule 2026-08-02 — the old
  "victory/economy anchor" fence over Settlements, Mines, Obelisks, the Grail and
  the Dragon Utopia is GONE; `TOKEN_FORBIDDEN_LOCATIONS` now holds only the
  genuinely unsafe set: `subterranean_gate` / `monolith` / `whirlpool` / `gate`
  (never stack on another teleporter), `creature_bank` (the explicit exception),
  and the three PvE latches `calamity_gate` / `dungeon_gate` / `rift_lair`).
  STILL excluded, in BOTH the design-time (`tokenMayCoverFieldDef`) and runtime
  (`tokenMayCoverField`) helpers so they never disagree: **guarded fields** (a
  live guard / printed `difficulty` — overwriting one would erase a live guard
  for free, and keeping it out of the set at BOTH times keeps the reserved-hex
  auto-place vs. runtime candidate check consistent), **Towns** (the
  `category === "town"` guard — replacing a Town field would orphan its
  TownState), Field-Override hexes (Location-Token protected), and a hex a hero
  stands on (runtime only). Terrain is enforced: monolith/gate = land hex,
  whirlpool = sea hex. Pinned in `map-tokens.test.ts` ("teleport-token placement
  is unrestricted except Bank / blocked / teleporter / guard": an unguarded
  Mine/Settlement/Obelisk/Grail/Dragon Utopia now accepts a Monolith AND a Gate,
  with a Bank / blocked / guarded-mine / calamity-gate CONTROL).
- **Cross-layer monoliths are allowed** (a designer may knowingly link the
  Surface and the Underground — a Town-Portal-like exception to the
  gate-only-crossing rule; the teleport never consults `canCrossEdge`).
- The designer caps whirlpools at 3 (the physical numbered tokens; the engine
  falls back to traveller's-pick if a hand-edited save exceeds it) and allows
  at most ONE token per tile.

What runs (each with a failing-if-removed test):
- Designer: token per tile — face-up tiles pin a legal slot (picker filtered by
  `legalTokenSlotsForTileDef`), face-down tiles carry a pending token placed on
  discovery. Lone-token maps show the "needs at least 2 to work" warning; a
  lone token in play is inert with the same note. Tokens survive save/load
  (`sanitizeTile`) and are validated again at setup (illegal slots dropped).
  A placed token (monolith OR whirlpool) is DRAGGABLE from ANY tile to ANY
  compatible tile in all four orientation combinations — face-up↔face-up,
  face-up→face-down, face-down→face-up, face-down→face-down — with a plain click
  still opening the token panel. EVERY tile target lands `{ kind, (pair,) slot }`
  on an exact hex: a face-up target's hovered legal printed slot, or one of a
  face-down tile's seven PHYSICAL flower hexes (gated by `faceDownTokenKinds` —
  sea⇒whirlpool, other land groups⇒monolith, starting seats accept none). A
  face-down `slot` pins the physical board hex: setup resolves it to an absolute
  `pendingToken.preferredSpaceId` (`applyCustomMapTokens`), rotating the hidden
  tile in the designer counter-rotates the slot so the pinned hex never moves,
  and the board back renders the token on that exact hex. While dragging, a
  bright PLACE reticle marks the one hex the release will take, with a
  gold/blue legend. A cross-tile move is ONE atomic `onChange` and never changes
  the token COUNT, so the whirlpool supply cap is unaffected; a tile already
  carrying a token stays off-limits. A monolith/gate token dragged OFF every
  tile CONVERTS to a standalone object; a standalone/legacy object dragged ONTO
  a tile converts to a `plan.token`. Wired in `commitTokenMove` /
  `commitTokenDrop` / `commitObjectDrop` / `computeTileTokenTargets` (the shared
  tile-target computation), pinned in `map-designer.test.tsx` ("tile-carried
  token direct manipulation" + "canonical teleporter conversions") and in a real
  browser by `tests/e2e/map-designer-token-drag.spec.ts` (the pointer-grab hex
  under the token art is invisible to jsdom).
- Discovery: revealing a pending-token tile places the token on the designer's
  reserved hex AUTOMATICALLY when it is legal after the reveal rotation
  (`preferredSpaceId` in `offerPendingTokenPlacement`); when random printed
  content makes that hex illegal — or for a LEGACY pending token with no
  reservation — the DISCOVERING player places it on "a Field of your choosing"
  (`place-map-token` choice, glowing candidates; single candidate auto-places,
  zero drops the token). It waits behind the Subterranean-Gate and Creature-Bank
  prompts on the same reveal; gates and tokens never cover each other.
- Travel: entering (or Revisiting, 1 MP) a token teleports to another token of
  the kind. Arrival does NOT re-trigger (no ping-pong). Whirlpool numbers are
  the die faces +1/0/-1 (assigned in plan order); with exactly 3 whirlpools the
  Attack die decides, rerolling the origin's number, per the printed rule.
  Each whirlpool travel then costs the unit toll.
- Travel into a face-down tile (Monoliths, Whirlpools AND colored Gates alike):
  the tile flips for FREE, the traveller rotates it (a Ⅱ–Ⅲ tile runs the standard
  keep/reroll flip), places the destination token (automatic on a legal reserved
  hex, otherwise their pick), and arrives on it
  (`pendingTokenTeleport`; whirlpool toll after arrival — a Gate takes NONE). A
  colored-Gate `TOKEN_TELEPORT_REVEAL` carries its `pair`, so the placement
  carves the SAME-color partner gate (per-color isolation holds through the
  reveal — a red network never reveals a blue/monolith pending tile, and the
  Monolith network never reveals a pending gate). Elimination mid-flow
  auto-places the token (gate carved with its pair) and cancels only the dead
  seat's travel. The gate face-down flow is pinned in `map-objects.test.ts`
  ("Colored Gate travel into a face-down (pending) gate tile" — the both-listed
  pick, the size-2 lone-carved+pending network, per-color/monolith isolation
  CONTROLs, and the mid-flow elimination auto-place).

## Designer guards, outposts & one-way monoliths (map-designer content, 2026-07) — what runs vs. limits

Six features on `CustomMapPreset` / `CustomMapTilePlan` / `CustomMapObject`.
Types in `state.ts` (`CustomGuardSpec`, `CustomCenterHexPlan`,
`OnewayExitMode`), sanitizers in `map-preset.ts` + `src/server/map-registry.ts`,
engine in `adventure.ts` / `adventure-reducer.ts` / `adventure-setup.ts`,
designer UI in `map-designer.tsx` (shared `GuardSpecEditor`). Pinned in
`vii-field-designation.test.ts`, `map-objects.test.ts`,
`outpost-objects.test.ts`, `designed-gate-links.test.ts`,
`map-registry.test.ts`, `map-designer.test.tsx`, `gate-object-board.test.tsx`
(each behaviour mutation-checked, CONTROLs included).

Leading with what does NOT run / deliberate limits:
- **Outposts (Garrison / Keymaster's Tent / Barrier) are STANDALONE-only**
  (`OUTPOST_OBJECT_KINDS`): a tile-slot/token form is rejected by the
  sanitizer + `validateCustomMapObjects` — they live out of every tile by
  design. One-way monoliths exist in BOTH forms (standalone object AND tile
  token); standalone whirlpools stay refused as before.
- **A Barrier never fights** — it is a wall, not a guard post: the sanitizer
  strips any `guard` off a barrier (and off a one-way EXIT); entry is blocked at
  `classifyHeroStep` unless the hero's owner holds a same-color Tent flag, and
  with the flag the step is an ordinary walk (no visit, no reward).
- **A garrison defense is ARMY-only** (settlement-style): the defender picks
  units only — no hand cards, no hero — and pays 3 gold (towns keep 8;
  `garrisonDefenseCost`). Declining hands the flag over without a fight.
- **No XP from outpost / one-way / teleport-object fights**
  (`isBankStyleGuardLocation`): garrison, Keymaster's Tent, one-way ENTRANCE
  guards AND every single-hex teleport object (Monolith / Teleport Gate /
  Whirlpool) fight BANK-style — no Quick Combat, no experience (combat
  difficulty 0), and NO round limit (`CombatContext.unlimitedRounds` — the
  reducer's round-limit check skips it, no MP-to-extend). A guard assigned to a
  teleport gateway must be truly fought to pass — a high-level hero cannot
  Quick-Combat past it. The guard army still draws at its designed level / exact
  list (`customGuardLevel` / `customGuardUnits`); only Quick Combat, XP and the
  round limit are dropped.
- **An exact-army guard is never Quick-Combat or Diplomacy skipped** — the
  designed army always deploys and fights (minted at fight time from
  `field.customGuardUnits` in `drawGuardArmy`); its difficulty (for XP where
  XP applies) derives from the army's tiers
  (`customGuardArmyDifficulty`: any azure body = Ⅶ, else bronze 1 / silver 2 /
  gold 3 points mapped onto the `NEUTRAL_ARMY_TABLE` rows, capped Ⅵ).
- **The center-hex bonus pays ONCE, to the first clearer** — `centerHexClaimed`
  latches; a later re-capture (Town changing hands) never re-pays. VP is
  recorded unconditionally but SCORES only in VP mode.

What runs (each pinned by a test that fails if the wiring is removed):
- **1. Ⅵ–Ⅶ center-hex editor** (`CustomMapTilePlan.centerHex` =
  `{ guard?, reward?, vp? }`): clicking a Ⅵ–Ⅶ center tile always shows the
  center-hex box — it works on PRINTED objectives (Cyclops Stockpile, Temple of
  the Sea, settlement…) exactly like on the three Ⅶ designations
  (Town/Grail/Utopia). GUARD = level Ⅰ–Ⅶ or an exact army (up to
  `MAX_CUSTOM_GUARD_UNITS` = 6 neutral-deck unit cards, shared
  `GuardSpecEditor`); REWARD = gold/materials/valuables (≤50 each), Treasure
  dice (≤3), Spell/Ability/Artifact deck Searches (≤5 each, with an optional
  Times×Search multiplier), plus the SPECIAL arms (all `CustomFieldReward`
  surfaces — center hexes, objects, tokens, settlements, hex events): ±1
  morale, an Ability Empower token (`force` — granted even with the bank house
  rule off), a free one-shot Statistic-empower menu (hand+discard), main-hero
  XP (≤5), movement (≤3) and Resource dice (≤3) — every special arm a REUSE of
  an existing auto-resolving/menu VisitStep, so AI seats and AFK defaults
  resolve them (`designer-field-rewards.test.ts`, each arm with a CONTROL);
  VP ≤10.
  `materializeTileFields` stamps it on the difficulty-7 field;
  `grantCenterHexBonus` (ONE seam, top of `beginFieldVisit` — reached only
  after the guards are dealt with) pays resources inline and queues dice/
  Searches as a `visit-steps` reward. Legacy `viiFieldReward`/`viiBonus`
  snapshots fold in (`foldLegacyViiBonus`, shared claim latch).
  `vii-field-designation.test.ts`.
- **2. Guards on EVERY single-hex placement** (`CustomGuardSpec`
  `{ level?: 1-7 } | { units: [...] }`): tile TOKENS (monolith / whirlpool /
  Teleport Gate / one-way), standalone OBJECTS, BOTH subterranean gate-link
  halves (`CustomMapGateLink.gateGuard`/`entranceGuard`, per-half ⚔ editor in
  the link rows) and the center hex — one shared stamp
  (`applyCustomGuardToField`). A hero must FIGHT to enter; a WIN clears the
  guard for good (`clearCustomGuard`), a loss/retreat leaves it.
- **3. Teleport ARRIVAL now FIGHTS the exit's guard / starts a PvP battle**
  (2026-07-24 user rule — REPLACES the earlier 2026-07 "auto-win the exit's
  guard" reading): a hero teleporting through a teleport-network exit
  (Monolith, Teleport Gate, Whirlpool, one-way monolith, obelisk-as-monolith)
  onto a hex with a LIVE designed guard must FIGHT it — bank-style, no
  auto-sweep (`RESOLVE_TELEPORT_ARRIVAL` → `setTeleportArrivalHook` →
  `startNeutralEncounter(..., { teleportArrival: true })`: difficulty 0, no
  Quick Combat, no XP, unlimited rounds). A WIN clears the guard but does NOT
  re-open the teleport (arrival never re-triggers — no ping-pong); a RETREAT
  bounces the hero back to the ORIGIN teleporter (`lastVisitedField`); a defeat
  homes them like any lost fight; the guard stays intact on a non-win. A
  destination now occupied by an ENEMY hero is OFFERED and travelling there
  starts a normal PvP battle (the walk-onto-enemy flow — parallel stop, defense
  prompts); an OWN-hero destination stays skipped. **Scope guard:** stepping OUT
  through a linked SUBTERRANEAN GATE is a WALK, not the network, and instead
  SLIPS PAST the guard without clearing it (2026-08-07 — see "A Subterranean
  Gate crossing slips past the far guard" below). Pinned in
  `teleport-arrival-rule.test.ts` (guarded-arrival fight +
  win-clears + retreat-bounces + PvP + own-hero-skip, each with a CONTROL) and
  the updated `map-objects.test.ts` / `map-tokens.test.ts` / `obelisk-roles.test.ts`.
- **3a. Every teleport travel offers "Stay here"** (2026-07-24 rule): entering
  or Revisiting a teleporter opens a travel-vs-stay offer (even the formerly
  AUTOMATIC single-destination / 2-Monolith / Whirlpool-die / random / mix
  cases) — the LAST option is always "Stay here" (empty steps → the AI scorer
  reads it as leave/cancel). A random/mix roll resolves ONLY when travel is
  chosen (the deferred-roll shapes wrap the roll behind a `committed` re-entry
  of the same `TOKEN_TELEPORT`/`GATE_TELEPORT`/`ONEWAY_TELEPORT` step, so a Stay
  never consumes/leaks the die). A hero that Stays (or arrives) on a teleporter
  may Revisit (1 MP) on a later turn to re-open the offer — works for all three
  canonical forms (tile tokens, carved fields, standalone objects). Pinned in
  `teleport-arrival-rule.test.ts` ("Stay here + Revisit") and the updated token
  travel suites.
- **4. Yellow border edges on standalone object hexes**
  (`CustomMapObject.borderEdges`, absolute dirs 0-5 →
  `MapFieldState.borderEdges`): the 🖌 border tool paints object-hex edges
  exactly like tile edges; each sealed edge blocks movement/discovery both
  ways (`isDesignedEdgeSealedBetween` inside `canCrossEdge` +
  `heroCanDiscoverTileAcrossBorders`), rendered with the same gold casing.
- **5. Outposts** (standalone, always revealed, optional bank-style guard,
  winner FLAGS it): **Garrison** — connects tiles as a walkable junction; the
  winner flags it (single owner + light-blue ring); a flagged garrison offers
  its owner a 3-gold ARMY-only defense when an enemy walks in
  (`garrisonDefenderFor` → the settlement defense flow, `pending.goldCost`).
  **Keymaster's Tent** — colored (pair 1-4); EVERY visitor who clears it flags
  it (multi-flag `extraFlagOwnerIds` — flagging never steals the previous
  owner's key); holding a tent flag opens same-color **Barriers**
  (`playerHoldsTentFlag`). `outpost-objects.test.ts`.
- **6. One-way monoliths** (4 colors, `oneway_entrance` / `oneway_exit`,
  standalone or tile token): only the ENTRANCE may carry a guard (bank-style,
  above); winning teleports to a same-color EXIT per the entrance's
  `exitMode` — **random** (seeded die among free exits), **certain** (traveller
  picks, default), **mix** (exits flagged `alwaysPickable` are offered up
  front + one "Roll the die" option over the rest; degenerates gracefully —
  all-always = certain, none-always = random, resolved at CHOICE time via
  `ONEWAY_RANDOM_EXIT` so the pick leaks nothing). Own-hero exits are skipped,
  an ENEMY-occupied exit is OFFERED (PvP on arrival, rule 3); no exit on the
  map / all-own-occupied = inert note. Every exit offer also carries "Stay here"
  (rule 3a). Arrival never re-triggers, and a still-standing exit guard is now
  FOUGHT bank-style on arrival (rule 3 — no longer swept). Exits are one-way:
  standing ON an exit offers no travel. `map-objects.test.ts` ("one-way
  monolith" suites).
- **7. Teleport Gate reskin** (was "Colored Gate"): per-color PORTAL art on
  the board, the palette and tokens (`teleportGateImage`, 1 red / 2 blue /
  3 green / 4 violet — pair 4 renamed from yellow, `gatePairColor`); the
  location is labeled "Teleport Gate"; the plain (colorless) Monolith is
  RETIRED from the designer palette (legacy maps unaffected — see the
  Monolith section above). One-way monoliths use their own per-color art
  (`onewayMonolithImage`); outposts theirs (`outpostObjectImage`).
  `map-designer.test.tsx`, `gate-object-board.test.tsx`.

## Map objects Global|Specific, hex events & guard visibility (2026-07) — what runs vs. limits

Three designer systems on top of the exact-army/Times×Search branch (whose audit
fixed the pack-survivor persistence, the `viiFields` face-down leak and the
lethal HP-strip — see `map-design-features.test.ts` / `fortress-faction.test.ts`).
Engine in `map-preset.ts` (sanitizers), `adventure.ts` (materialize folds, the
`beginFieldVisit` designer seam), `adventure-setup.ts` (plan carry + hex-event
carve); UI in `map-preset-editor.tsx` (Map objects group), `map-designer.tsx`
(pick flow, popover sections, badges/markers), `screen.tsx` (inspect float).
Pinned in `map-object-plans.test.ts` (engine, mutation-checked with CONTROLs),
`map-designer.test.tsx`, `map-preset-editor.test.tsx`, `map-floats-board.test.tsx`.

Leading with what does NOT run / deliberate limits:
- **Obelisk ROLE stays map-wide** (face-down tiles hide which is which); a
  SPECIFIC obelisk plan overrides guard/reward/VP/break/win only. Mines are one
  kind ("mines all types" share the config — no per-resource split).
- **SPECIFIC eligibility is conservative**: face-up tiles must PRINT the
  location; a face-down tile qualifies only when a Secret landmark guarantees a
  mine (obelisk secrets qualify for obelisks). A plan on a random face-down
  tile would be inert, so the pick never offers one.
- **Grail / Dragon Utopia / Random Town SPECIFIC = the center-hex editor**
  (pick a Ⅵ–Ⅶ center tile; its `centerHex` guard/reward/VP/win covers the
  designated OR printed objective). Their map-wide knobs stay under Victory &
  scoring (contextual to the Win condition — unchanged).
- **Hex-event ambush degradations**: the guard is beaten ONCE globally
  (each-player mode re-pays only the message/reward/VP); an event stamped on an
  already-cleared field springs fight-less; the ambush overwrites a designer
  guard already on that field (designer foot-gun, sanitizer cannot see it).
- **`replaceVisit` suppresses only the TRIGGERING entry** — later entries visit
  normally (not a permanent field replacement).
- **Hex events are invisible but not cryptographic**: player VIEWS redact both
  `adventure.hexEvents` and `mapPreset.hexEvents` (pinned), but the engine
  state carries them — same class as other designer secrets.
- **The win-condition tick is an instant-win foot-gun** by design (same as
  custom win conditions): a `winCondition` on a home-tile object ends the game
  on the first visit. The removed win-condition kinds (control-towns /
  flag-mines / obelisks / defeat-dragon-utopia) are EDITOR-only removals — the
  engine + sanitizer still honour them on legacy maps, and a legacy row still
  renders/edits (its kind joins the row's select).

What runs (each behaviour has a failing-if-removed test):
- **Global|Specific per object kind** (Obelisks · Mines · Settlements · Random
  Town/center): `CustomMapTilePlan.objectPlans.{obelisk,mine}`
  (`CustomObjectFieldPlan` = guard/reward/vp/break flags/winCondition,
  `sanitizeObjectPlans`), per-tile settlement plan + centerHex gained
  `winCondition`. Materialize folds SPECIFIC over global FIELD-BY-FIELD (an
  unset field falls back — the settlement-plan semantic;
  `mergeObjectBreakFlags`), stamps rewards via the shared
  `stampDesignerFieldReward`/designer-reward latch and `designerWinCondition`.
- **Designer "first clear wins"**: `fireDesignerWinCondition` at the
  `beginFieldVisit` seam (after the reward grant) declares the visitor winner
  `viaVictoryCondition` — VP mode routes to scoring, eliminated seats are
  skipped, `declareAdventureWinner` idempotence holds.
- **Hex events** (`CustomMapPreset.hexEvents`, cap `MAX_HEX_EVENTS` 24, one per
  hex): carved to `adventure.hexEvents` keyed by space id (only hexes on a
  placed tile footprint / carved standalone hex — the designer warns, setup
  drops the rest). Trigger runs FIRST in `beginFieldVisit`: an armed guard
  stamps as a designed guard + opens a REAL fight via the registered
  `setHexEventEncounterHook` (straight to combat placement — never
  Quick-Combat/Diplomacy skipped on the surprise; a LATER attempt on the
  now-public guard runs the normal guarded-field flow, where Quick Combat may
  apply); reaching a visit with the guard stamped marks it beaten and sweeps
  the remnants (one seam covers fought/Quick-Combat/Diplomacy wins). Then
  message (feed note) + reward/VP via the shared `payDesignerFieldReward`
  (factored out of `grantCenterHexBonus`), `mode` "first" (record deleted on
  fire) or "each-player" (per-player latch).
- **Designer UX**: the preset editor's "Map objects" group (renamed from "Map
  locations") — 🌍 Global | 📍 Specific tabs per kind (specific lists per-tile
  plans with summaries + "Pick a tile on the map"; a no-eligible-tile state
  shows a ⚠ warning instead of a dead button). The object-plan pick arms
  `MapDesigner.pickRequest`: eligible tiles pulse green, others dim,
  Esc/banner-cancel disarms, an eligible click opens the tile popover (which
  gained "Special obelisk/mine (this tile)" sections — shown ONLY on eligible
  tiles — plus 🏁 win ticks on settlement/center sections). Tiles with specific
  settings wear a ⚔ (🏁⚔ with a win) badge. HEX EVENTS have ONE surface, the
  BOARD (2026-07 — the preset editor's old per-event card section AND its
  "Place an event on the map" pick flow are REMOVED; the editor keeps only a
  one-line count note, `pickRequest` is object-plan-only again): a "Hidden
  event" button in the board's Objects palette (glyph
  `DESIGNER_UI_ICONS.hexEvent`) arms placement — every placed-tile hex AND
  every standalone object hex glows (the event is invisible in game, so it
  SHARES its hex with whatever is printed there; only another event blocks a
  cell, one per hex) — a click places, disarms, and opens the event's own
  docked editor (message / ambush GuardSpecEditor / FieldRewardEditor + VP /
  first-vs-each-player + replaceVisit chips / remove). A placed marker is a
  subtle violet image hex with a full hover tooltip: click opens the editor,
  drag moves it to any other legal hex (object-drag lifecycle: 6px promote,
  hover preview + PLACE reticle, Escape aborts, trailing click suppressed).
  Pinned in `map-designer.test.tsx` ("specific object plans & hex events":
  marker + tooltip, palette arm/place incl. a standalone object hex, editor
  edit/remove, drag move) and `map-preset-editor.test.tsx` (the editor carries
  only the count note — no cards, no pick button).
- **Guard visibility in game**: clicking a designer-altered object that is NOT
  a move target opens the `designedGuardInspectFloat` — exact army (grouped
  labels), level, unclaimed first-clear reward/VP — the move-confirm warning's
  touch-friendly twin (which still covers in-reach hexes).

## Underground designation (per-tile layer override, map designer) — what runs vs. limits

The designer may mark ANY far/near/center/sea tile plan `underground?: true` on
BOTH `CustomMapTilePlan` and `MapTileState` (copied plan→tile at setup by
`applyDesignedUnderground`, face-down included). The tile is then topologically a
cavern — reachable ONLY through a Subterranean Gate, sealed from the Surface at
every other edge — while KEEPING its band identity (group, back art/numeral,
guard tiers, Creature-Bank pile, token legality). "A cavern topologically, but
with printed band content."

- **The ONE seam is `tileLayer` / `planIsUnderground`** (`adventure.ts`).
  `planIsUnderground(plan)` = `group === "subterranean" || (underground === true &&
  group !== "starting")`; `tileLayer(tile)` delegates to it. Everything downstream
  follows AUTOMATICALLY off that one bit: `mapFieldLayer` → `canCrossEdge`'s layer
  check (movement, the AI's `objectiveDistanceField`, Dimension Door reach),
  `recomputeSubterraneanGates` + `planGateChoiceForReveal` (auto-pairing,
  one-gate-per-tile, pick-on-reveal), the discovery gate (`DISCOVER_TILE` /
  `canHeroDiscoverAdjacentTile`), and the preview twin `isCavernPlacement` →
  `planSubterraneanGates` / `unreachableUndergroundCenters`. Never inline a
  `group === "subterranean"` LAYER check — use the predicate.
- **BAND-vs-LAYER audit rule (for future contributors):** every
  `"subterranean"` comparison is either BAND semantics (back art `tileBandLabel`,
  `planBackLabel`/`planGroupLabel`, the `subBand` palette filter,
  `creatureBankTierForGroup`'s NEAR-pile house rule, `VALID_TILE_GROUPS`) — keep
  the GROUP check — or LAYER semantics (gate carve/pair, cross-layer seal,
  standalone-hex layer inference, designer gate-link eligibility, the unreachable
  ring) — use `tileLayer`/`planIsUnderground`. A flagged Far tile still draws the
  FAR bank pile and the "Ⅱ–Ⅲ" back; only its topology flips.

Leading with the DELIBERATE v1 limits:
- **`underground` is stripped from `starting` (seat/home tiles stay Surface — the
  opening ceremony, seat balance and first-discovery flow assume it) and from
  printed `subterranean` plans (redundant).** Only far/near/center/sea keep it,
  as a literal `true` — enforced in BOTH the persistence sanitiser
  (`sanitizeTile`, `src/server/map-registry.ts`) and the setup validator
  (`validateCustomMapPlan`, `adventure-setup.ts`) against `UNDERGROUND_LAYER_GROUPS`.
  Legacy maps / snapshots (field absent) behave byte-for-byte as before.
- **Band content stays band (topology only).** Back art keeps the band back (no
  fake cavern art), the Creature-Bank pile stays keyed by GROUP (a flagged Far
  tile draws the FAR pile; the printed-cavern NEAR-pile house rule stays
  cavern-only), guards/tokens stay band-legal. Whirlpool/Monolith/Teleport-Gate
  token networks remain layer-agnostic (cross-layer links already legal),
  untouched.
- **Designed gate links now belong to any UNDERGROUND-layer plan** (a flagged
  Far tile links to a touching Surface tile exactly like a cavern);
  `validateCustomMapPlan` + `sanitizeTile` KEEP them for a flagged plan and drop
  them from a plain (Surface) plan.

Designer UX: the far/near/center/sea popover gains an "Underground layer" toggle
(writes `plan.underground`; NOT offered on starting/subterranean); a flagged
tile's outline strokes the Underground purple + carries `data-underground` while
keeping its `data-band-group` band label, participates in the cavern gate-link
rows / "+ Gate" button, and gets the red unreachable ring when isolated. In game
(`screen.tsx`) a flagged tile's hexes carry `data-underground` (an always-on CSS
cue, the layer is not secret) and the face-down discovery hint / gate
ascend-descend labels/art fire via the predicate switch.

Behaviour is pinned in `src/engine/underground-designation.test.ts` (layer seam,
setup plan→tile copy, cross-layer movement seal, auto-paired + designed-link gate
carve, discovery, each with a plain-Far CONTROL), the preview==engine parity +
unreachable cases in `subterranean-gate-planning.test.ts`, the sanitiser
(`map-registry.test.ts`), the validator (`custom-setup.test.ts`), the designer UI
(`map-designer.test.tsx`), the in-game cue (`subterranean-gate-board.test.tsx`),
and the AI distance-field seal (`computer/map-navigation.test.ts`) — every claim
mutation-checked.

## Field Overrides & multi-pin tiles (global system; Anime mod content) — what runs vs. limits

`GameSetupOptions.fieldOverrides` (default OFF; auto-ON when a designed map
carries `plan.fieldOverride(s)` pins). Mechanism is CORE (`src/data/map/
field-overrides.ts` registry + `src/engine/field-overrides.ts` +
`tile-hex-placements.ts`); the Anime mod AND the Wake of Gods mod only register
content kinds (WOG: `src/data/wog/field-overrides.ts` — 3 objects, package
`"wog"`, gated on `wog.enabled && wog.newObjects`; see the "WOG New Objects"
bullet). Anime content
(`src/data/anime/field-overrides.ts` — 13 Ninefold objects across two packages,
9 `anime-xianxia` + 4 `anime-isekai`: 11 are pool/palette-gated by the Anime mod
alone (8 xianxia + 3 isekai), and 2 are the Equipment outfitters (Rèn Binh Các +
Adventurer Outfitter) gated on `anime.equipment` via `requiresModule` (§3.13).
Their locations are always in `locationDefinitions` and visits ride the normal
interaction pipeline; every wave-2 kind is a PURE REUSE of the existing
`LocationInteraction` vocabulary — `thuong_hoi_tram`/`capsule_lab` a
Trading-Post/War-Machine shop, `song_bac_quan` a `PAY_TO`+`ATTACK_DIE_TABLE`
gamble, `dai_luyen_khi`/`urahara_shop`/`onsen_ryokan` `CHOOSE_ONE` menus —
effect-tested in `src/engine/anime-locations.test.ts`; `tran_phap_truyen_tong`
joins the real Monolith network. **Art status (2026-07): ALL 13 kinds ship real
512×512 hex art** (`image` set; wave-2 kinds keep their `glyph` as a text
fallback the UI never draws while art exists). The 5 wave-1 hexes were
REGENERATED on-register — the earlier files were mismatched stock-like scenes
(a reading nook, a lighthouse…), not the described locations.
`FIELD_OVERRIDE_ART_PLACEHOLDERS` is now legitimately EMPTY; the
art-or-placeholder + "art wins over glyph" invariant stays pinned in
`field-overrides.test.ts`, `anime-field-override-board.test.tsx` and
`map-designer.test.tsx` via a test-only registered art-less kind. A FUTURE
art-less kind must be declared in the placeholder set; pipeline:
`scripts/place-anime-assets.mjs` + `scripts/anime-art/ART-TODO.md`.) On
tile reveal the
override places FIRST (before Subterranean Gates → Creature Banks → teleport
tokens), pool draws obey `fieldOverridePlacement` (random / manual /
manual-or-refuse; designer pins never refuse), and every Far/Near/Center
face-down tile gets ≥1 pool draw while content is available. A tile may carry
MULTIPLE overrides + tokens (`plan.tokens` / `plan.fieldOverrides`, canonical
arrays; legacy singulars fold in) on DISTINCT slots — the engine drains the
whole `pendingTokens` / `pendingFieldOverrides` queues on reveal. A carved
override hex is Location-Token-protected (no token/gate/second override may
overwrite it — `isFieldOverrideLocation` at every legality gate), and
elimination mid-placement-choice drops the queue and auto-places waiting
tokens (never strands the reveal chain). Pinned in
`src/engine/field-overrides.test.ts`, `tile-hex-placements.test.ts`,
`map-tokens.test.ts` ("multi-token tiles"), `map-registry.test.ts`,
`map-designer.test.tsx` (each behaviour mutation-checked).

Leading with what does NOT run / deliberate limits:
- **Pool override kinds stamped on face-down tiles are readable in raw
  snapshots** (like designer tokens; no player-view masking in V1).
- **Several anime gameplay modules beyond Field Overrides have now shipped** —
  enumerated in the "Also shipped" bullets below (`anime.xianxiaArtifacts`,
  `anime.cultivation`, `anime.heroGrades`, `anime.equipment`, Forced Battle Events,
  and the story/campaign spine); the REMAINING `AnimeModOptions` flags stay
  types/lobby-only (closing note at the end of this bullet). FIRST shipped:
  `anime.xianxiaArtifacts` (Pháp Bảo — 5 ORIGINAL
  Artifact cards, `src/data/anime/artifacts.ts`). Default OFF ⇒ byte-identical
  Artifact decks; ON ⇒ they join the shared Artifact deck(s) (split minor/major/
  relic AND legacy single), riding the same tier/uniqueness gates as core
  artifacts, and always resolve in the card library. What runs (each printed as
  exactly its wired behaviour — no display-only clauses; each mutation-checked in
  `src/engine/anime-artifacts.test.ts`): Túi Càn Khôn = +1 building-materials
  income permanent (remove for +1 materials/+1 valuables); Tụ Linh Bàn = +2 gold
  income CONDITIONAL on the main hero standing in a Town of yours (the NEW
  `resourceRoundGain.requiresHeroInTown` flag, gated at the one income chokepoint
  in `startAdventureRound` via `mainHeroInOwnTown`; unconditional cards
  unaffected — CONTROL-pinned); Phong Hỏa Luân = +2/+3 `GAIN_HERO_MOVEMENT` map
  card (also auto-offered as a neutral-combat continue-window movement top-up);
  Tru Tiên Kiếm = attacker +2/+3 attack reaction; Bát Quái Kính = defender +1/+2
  defense reaction. NOT shipped: Đông Hoàng Chung (army-wide Armored) and Truyền
  Âm Ngọc Giản (remote allied-hero trade) are designed-not-shipped (await new
  arms), and the fancier halves (cleave-exhaust, spell-cancel, bronze-init aura)
  are deferred — see `docs/anime-mod-plan.md` §5.10 V1 STATUS. Art (2026-07):
  all 5 ship REAL 743×1040 card faces built by
  `scripts/build-anime-artifact-cards.mjs` (editable SVG sources under
  `scripts/anime-art/editable/artifacts/`, ornate keyed frame + ink-wash
  masters under `raw/artifacts/`; keep face text in lockstep with the effects).
  `ANIME_ARTIFACT_ART_PLACEHOLDERS` is now EMPTY (a future face-less card must
  be declared there to route to the deck back).
  No lobby UI toggles the anime modules yet — they are set via the setup
  `anime` options payload. Every OTHER `AnimeModOptions` flag (towns, neutrals,
  destiny, …) is still types + lobby state only; `docs/anime-mod-plan.md` is
  the design contract.
- **Also shipped: `anime.cultivation`** (per-hero Cultivation Realm track +
  Heavenly Tribulation, §5.6; read-layer `src/engine/anime-cultivation.ts`,
  behaviour pinned in `src/engine/anime-cultivation.test.ts` + the realm chip in
  `src/components/hero-board.test.tsx`, every grant mutation-checked). Default
  OFF ⇒ nothing stamped, no offers, no events (byte-identical). Realm lives on
  the MAIN hero (`hero.cultivationRealm?`, lazily stamped, absent === realm 0;
  `hero.tribulationWon?` / `hero.tribulationAttemptedRound?` optional). Realms 1
  (Foundation, level ≥ 3) and 2 (Core Formation, level ≥ 5 AND a bank win)
  advance AUTOMATICALLY on level-up / bank-win, one `CULTIVATION_REALM_ADVANCED`
  feed event each. Grants: **+1 hand limit** (folded at the single
  `effectiveHandLimit` site; `permanentHandLimitBonus` stays permanent-only,
  documented); **1 free Attack-die reroll/combat** (standing `AttackRerollSource`
  with `cultivation` flag + `combatStats.cultivationRerollUsed` cleared in
  `makeCombatShell`, honouring every existing reroll-window rule); **+1 spell
  Power** (realm 3, folded beside the Pandora bonus at
  `standingSpellPower` / `resolvedSpellPowerForStackItem`). Realm 3 is reached
  ONLY via the `HEAVEN_TRIBULATION` map action (never forced, ≤ once per own
  turn; the human surface is the map `HeroActionsDock` button, offered only when
  the engine does — `hero-actions-dock.test.tsx`): a seeded 3-Attack-die
  `pendingVisit` gauntlet — each "−1" pays a
  cheapest-first army-card toll (Pack→Few via `FLIP_PACK_TO_FEW` source
  `"tribulation"`, else lost with recycle), survive with ≥1 card → realm 3 +
  Search(1) Artifact, emptied army → retry next turn. As a standard `pendingVisit`
  it inherits parallel-turn gating, the fingerprint backstop, AFK/timeout
  default-resolution and `eliminatePlayer` cleanup (each verified). ADAPTATIONS
  (documented at each wiring site): no Foundation-Pill path (Elixir Pills unshipped
  ⇒ level-3 only); Core Formation gate is "≥1 CREATURE BANK won" (Secret Realms
  unshipped) via a new mod-agnostic `player.bankWins?` counter incremented on
  EVERY bank-win finalize (never module-gated — a default table gains the optional
  field after a bank win, nothing else reads it yet); toll = card loss/flip (map
  cards have no HP). Cross-mod seams tested: Polish Unit Stacks (a Stacked-Pack
  toll sheds a layer, `ARMY_STACK_LOST`, not a flip), the ORIGINAL stash-style AND
  Polish Spell Books (the +1 Power lands on a Book cast via the shared chokepoint),
  WOG Commanders (the reroll behaves as a normal attack-window source, Might dice
  untouched), and mixed anime packages (an isekai module on changes nothing).
  Grant magnitudes are pegged to existing precedents (Pandora hand/Power bonuses,
  the morale reroll source) so xianxia content shares ONE power scale with core /
  WOG / isekai.
  Realm NAMES are presentation-only and faction-owned: classic heroes use
  Novice/Adept/Master/Archmage, anime heroes Awakened/Adept/Ascendant/
  Transcendent, Azure Breeze uses the cultivation ladder, and Heavenly Demon
  uses its bespoke Blood Refinement/Demon Foundation/Demon Core/Devil Soul
  (`cultivationRealmLabel`). The numeric realm and every grant above are shared.
- **Also shipped: `anime.heroGrades`** (Hero Grades — a per-hero Merit→grade 0-3
  track + a 3-tier × 3-node passive/skill tree; SHARED by every hero, independent
  of Cultivation). Default OFF ⇒ byte-identical. Read-layer
  `src/engine/anime-hero-grades.ts`, data `src/data/anime/hero-grades.ts`,
  behaviour pinned in `src/engine/anime-hero-grades.test.ts` (each claim
  mutation-checked) + the hero-board chip/picker (`hero-board.test.tsx`) + the
  combat reaction tile (`overlays.test.tsx`). Leading with what does NOT run /
  limits: **HERO_TRAIN + Forced March now HAVE a human map button** — the compact
  `HeroActionsDock` under the hero board (with the Cultivation Tribulation), each
  shown only while `getLegalActions` offers it and dispatching the exact payload
  (`hero-actions-dock.test.tsx`); the grade PICKER + combat command dock remain
  the surfaces for grade-ups and combat/reaction skills; **the AI will accept a
  Training Manual PAY_TO when gold allows and play `GAIN_GRADE_PROGRESS` cards
  promptly** (score ~740+); **per-package fancy grade-label art/fonts are deferred** (the
  register text is bilingual plain text); **combat skills are the MAIN hero's
  fights only** (garrison/secondary offer none — commander-scope). What runs: five
  Merit sources funnel through ONE arm (`gainGradeProgress`) — +1/level-up, the
  two enlightenment-hex riders (+1 on top of the printed reward, runtime-gated so
  module-OFF is byte-identical), HERO_TRAIN (2 MP→+1, once/turn), the Training
  Manual item (bought 2 gold at the two guild shops, played for +2 then removed;
  NEVER decked — `animeNeverDeckedCardIds`), and the generic `GAIN_GRADE_PROGRESS`
  card payload. Crossing a threshold ([3,7,12], a DATA array) auto-grades-up (+1
  point, one event/grade). The tree (pick 1 per tier): passives (Bounty Hunter's
  Eye +1 gold/win, Provisioner +1 materials, Deep Pockets +1 hand — stacks with
  Cultivation Foundation, Arcane Insight +1 Power, Tactician +2 gold) and
  non-card SKILLS with cooldowns (Battle Focus/Iron Will reactions, War Cry
  active — combat once/combat; Forced March map active once/round) reusing the
  commander cast buff machinery. Grade NAMES wear faction-owned REGISTERS
  (core/xianxia/isekai, plus bespoke `kansen` ship rarity for **azur_lane** and
  `modao` demonic titles for **heavenly_demon**), while mechanics/state never
  change with the label. Enabled town-package flags NEVER relabel another
  faction's hero: Castle remains Recruit/Veteran/Champion/Legend even in a
  xianxia-only game; mixed tables resolve each seat independently through
  `heroGradeRegisterKey`. Bespoke faction branches are checked first, then
  `factionGradeRegister` supplies the normal family. Pinned in
  `anime-hero-grades.test.ts` and the hero-board table tests, including classic,
  Fuyuki, Azure Breeze, Azur Lane, and Heavenly Demon controls. EXTENSIBILITY: no literal tier count in engine logic (all
  derives from the threshold array length); pure helpers `gradeForMerit` /
  `pickableNodesFrom` are tested with a 4-tier fixture; "add a tier" = append a
  threshold + nodes + one entry per register (§3.11 recipe). Magnitudes pegged to
  existing precedents (Brute gold, Cart/artifact income, Pandora hand/Power,
  commander reaction buffs, Boots movement).
- **Also shipped: `anime.equipment`** (Equipment — always-on hero ITEMS in four
  slots weapon/armor/accessory/mount, one per slot, buying into an occupied slot
  REPLACES with no refund; §3.13). 36 items across three GRADES I/II/III
  (minor/major/relic), cost 4/6/8 gold DERIVED from grade
  (`EQUIPMENT_GRADE_COST`). Each item is BOTH an always-on slot item AND an
  Artifact-deck CARD (`src/data/anime/equipment-cards.ts`, generated from the
  catalog): the cards join the shared Artifact deck(s) — split per-tier AND legacy
  single — ONLY when `anime.enabled && anime.equipment` (`makeSharedDecks`); playing
  one is a mapOnly `EQUIP_HERO_EQUIPMENT` (`cost.removeSelf`) that equips
  permanently, REMOVES the card from the game, and grants one REGULAR (non-equipment,
  non-commander) Artifact of the SAME grade into hand via the shared
  `grantRegularArtifactOfSameGrade` (uniqueness-respecting, null→feed note; sits
  OUTSIDE the BINH tier-progression gate and the Polish Random Artifacts roll on
  purpose — a fixed-grade compensation, not a Search). Default OFF ⇒ byte-identical
  (no shop in the pool, no cards in the deck). Read-layer
  `src/engine/anime-equipment.ts`, data `src/data/anime/equipment.ts`, behaviour
  pinned in `src/engine/anime-equipment.test.ts` + the deck-join/play + grant
  semantics in `src/engine/anime-equipment-cards.test.ts` (each claim
  mutation-checked) + the catalog in `src/data/anime/equipment.test.ts` + the
  hero-board chips (`hero-board.test.tsx`). Leading with what does NOT run / limits:
  **the 6 CLASSIC-line and 3 SHINOBI-line items (2026-07) ship PROCEDURAL
  PLACEHOLDER art, not hand-drawn illustrations** — committed grade-tinted
  monogram inventory icons under the ornate Artifact-card frame with the full
  rules text; the other 27 items have painted/vector art. Heavenly Demon's three
  former monograms were replaced by painted masters and are no longer in this
  limitation. `ANIME_EQUIPMENT_ART_PLACEHOLDERS` stays EMPTY (the placeholders
  are real files on disk, not glyph fallbacks). **The AI buys equipment** when the
  outfitter menu is open (empty slot or upgrade-grade, gold ≥ cost+6) and **marches
  to outfitters** when surplus + an empty slot (`wantsEquipmentShop`); it still
  never auto-replaces same/worse grade. **same-slot twins do NOT stack** —
  Cosmos Pendant + Spirit Focus (both accessory,
  +1 spell Power) and Twin-Tail Ribbon + Eternal Sash (both accessory, +1 hand
  limit) share the ONE accessory slot, so only one is ever worn (the earlier
  summaries wrongly claimed the cross-stack; corrected + pinned). The equipment
  spell-power fold therefore tops out at +1 and the hand-limit fold at +2
  (Guild-Issue Mail is armor). **NO
  map-action button for EQUIPMENT in this slice** — buying is only through the two
  outfitter Field Overrides; the hero board is a read-only chip display for items.
  (The other hero map actives — HERO_TRAIN / Forced March (§3.11) and the Heavenly
  Tribulation (§5.6) — DO now have a human button via the map `HeroActionsDock`;
  only equipment purchase does not.) **Art (2026-07): all 36 items ship 512×512
  inventory icons** (`public/assets/anime/equipment/`, drawn on the hero-board chip
  — `.hbEquipIcon`, art wins over the slot glyph; the 18 base/shared anime items,
  6 kansen items, and 3 modao items have real art, while the 6 classic + 3 shinobi
  items remain PROCEDURAL placeholders; `scripts/build-kansen-equipment-icons.mjs`
  owns the naval vector set. `ANIME_EQUIPMENT_ART_PLACEHOLDERS`
  is EMPTY, a future art-less item must be declared there for the glyph fallback)
  **plus a framed Artifact-CARD face each** (`public/assets/anime/equipment/cards/<slug>.webp`);
  **no designer pin for the outfitters** (pool-placed only); **combat items are the
  MAIN hero's fights only** (commander-scope; a garrison fight gets neither —
  CONTROL). **UI POLISH (§3.13, 2026-07):** a shared grade chip family
  (`.equipGradeChip.gradeI/II/III`, tinted with the app's EXISTING bronze/silver/gold
  `.tierDot` hues — no new colours; component `src/components/equip-grade-chip.tsx`)
  renders on the hero paper-doll slots + bag rows, the outfitter shop rows (the buy
  label now names the grade), and the WOG commander-artifact window / stats panel
  (grade = the artifact's tier, minor→I/major→II/relic→III). The paper-doll bag is
  GROUPED by slot with a package flavour tag (classic/xianxia/isekai/shared) per
  item and an "upgrade waiting" hint when a higher-grade bag item exists for a
  filled slot (pure presentation; no new engine action). The hero + commander
  windows already carry the faction `theme-<register>` class (verified). What runs
  (36 items, each a proven-seam reuse pegged to a core
  magnitude): Iron-Blood Sword = your units' FIRST declared attack each combat +1
  Attack (a per-combat one-shot folded UNCLAMPED in `getAttackStackDetails` beside
  the combat-script delta, consumed at `finishResolvedAttack` when the attack
  lands; NOT on retaliations); Black Tortoise Mail = the FIRST incoming declared
  attack each combat resolves at −1 Attack (same site, off the attacker); Cosmos
  Pendant = +1 spell Power (`standingSpellPower`, stacks with Cultivation Nascent
  + Arcane Insight → +3); Adventurer's Blade = +1 gold after a won combat (the
  Bounty-Hunter's-Eye hook, stacks to +2 with the grade node); Guild-Issue Mail =
  +1 hand limit (`effectiveHandLimit`, stacks with Foundation + Deep Pockets →
  +3); Supply Satchel = +1 building materials each Resources round (the
  `resourceRoundGain` income loop). The other 12 reuse the same seams — wave-2:
  Marshal's War Horn (commander pre-combat SORT, `wog.commanders`-gated),
  Veteran's Standard (+1 EXTRA Unit-XP/win, `unitExperience`-gated), Windrider
  Saddle (+1 MP each turn refresh), Spirit Crane Mount (free commander revive,
  `wog.commanders`-gated), Blade of the Trial (+1 Attack in combat round 1),
  Alchemist's Satchel (+1 gold/round AND +1 win gold); Miku: Neon Microphone (+1
  first-Spell Power), Stage Costume (first-hit Defense token), Twin-Tail Ribbon
  (+1 hand limit); grade-fill: Lucky Coin (+1 win gold), Spirit Focus (+1 spell
  Power), Eternal Sash (+1 hand limit). CLASSIC LINE (2026-07, package `classic`,
  6 items, 2 per grade, all four slots — each a PURE seam reuse; relics COMBINE two
  seams like Alchemist's Satchel): Crusader's Poleaxe (weapon I, first-attack +1 —
  Iron-Blood Sword seam), Coinward Talisman (accessory I, +1 win gold), Ironbark
  Cuirass (armor II, first-hit Defense token — Stage Costume seam), Courser's
  Barding (mount II, +1 MP refresh — Windrider seam), Horn of Plenty (accessory III,
  +1 win gold AND +1 materials/round), Warden's Aegis (armor III, first-incoming −1
  AND a Defense token). No new engine effect kinds — each fold's item-id list in
  `src/engine/anime-equipment.ts` gained the new id; behaviour pinned per item in
  `anime-equipment.test.ts` (each fails if its fold id is removed). WIN-GOLD still
  caps at +3 (weapon Adventurer's Blade + armor Alchemist's Satchel + ONE accessory
  — Lucky Coin / Coinward Talisman / Horn of Plenty share the accessory slot); the
  spell-Power and hand-limit accessory twins do NOT stack (same slot, above).
  SHINOBI LINE (2026-07, package `shinobi`, Hidden Leaf Village's BESPOKE 3-item
  register line — swarm/mobility/control, each a PURE seam reuse; the relic COMBINES
  two seams): Kunai Pouch (weapon I, first-declared-attack +1 — Iron-Blood Sword
  seam, shares the weapon slot), Body-Flicker Tabi (mount II, +1 MP each turn refresh
  — Windrider Saddle seam, shares the mount slot), Sage Chakra Charm (accessory III,
  +1 spell Power AND +1 hand limit — the accessory spell-Power + hand-limit folds,
  and so shares the ONE accessory slot with the other spell-power / hand-limit
  accessories — same-slot twins still don't stack). No new fold kinds — each id
  joined an existing fold's item-id list; behaviour pinned per item in
  `anime-equipment.test.ts`, the catalog count (36) + register matrix in
  `equipment.test.ts`.
  KANSEN LINE (2026-07, package `kansen`, Azur Lane Naval Base's BESPOKE 6-item
  register line — 2 per grade across all four slots, each a PURE seam reuse; the
  two relics COMBINE two seams): Oxygen Torpedo (weapon I, first-declared-attack
  +1 — Iron-Blood Sword seam), Manjuu Piggy Bank (accessory I, +1 win gold —
  Lucky Coin seam; the win-gold cap stays +3 = weapon + armor + ONE accessory),
  Repair Toolkit (armor II, first-incoming-hit Defense token — Stage Costume
  seam), Beaver Squad Tag (mount II, +1 MP each turn refresh — Windrider Saddle
  seam, shares the mount slot), SG Radar (accessory III, +1 spell Power AND +1
  hand limit — the Sage Chakra Charm relic pair, shares the ONE accessory slot;
  same-slot twins still don't stack), Retrofit Blueprint (weapon III relic,
  first-declared-attack +1 AND round-1 attacks +1 — the Iron-Blood Sword + Blade
  of the Trial seams combined, so the FIRST attack in round 1 is +2; not on
  retaliations, the round-1 half gone from round 2, shares the weapon slot). No
  new fold kinds — each id joined an existing fold's item-id list; UNLIKE the
  classic/shinobi procedural placeholders these ship REAL vector naval icons +
  card faces (`ANIME_EQUIPMENT_ART_PLACEHOLDERS` stays EMPTY). Behaviour pinned
  per item in `anime-equipment.test.ts`, the catalog count (36) + register matrix
  in `equipment.test.ts`.
  MODAO LINE (2026-07, package `modao`, Heavenly Demon Palace's BESPOKE 3-item
  register line — one item per grade, each a PURE seam reuse): Blood Demon Saber
  (weapon I, first-declared-attack +1), Bonefiend Plate (armor II, first-incoming
  hit grants a Defense token), and Demon Heart (accessory III, +1 spell Power AND
  +1 hand limit). All three use dedicated painted masters under
  `scripts/anime-art/raw/artifacts/equipment-masters/`; the equipment-card builder
  can target an individual slug and derives both the 512×512 icon and framed face
  from that master. No new fold kinds; behavior and the faction-only shop line are
  pinned in `anime-equipment.test.ts` / `equipment.test.ts`.
  MARKETS: two single-hex Field Overrides — Rèn Binh Các (Blacksmith, xianxia, ⚒) +
  Adventurer Outfitter (isekai, 🎒), both selling the shared Satchel; the shop menu
  is a dynamic `CHOOSE_ONE` of `BUY_EQUIPMENT` options built in `beginFieldVisit`
  (owned item ⇒ absent; affordability gold-gated like PAY_TO in legal-actions + a
  reducer backstop; the leaf deducts gold + equips). REGISTER-AWARE SHOPS (2026-07):
  on top of a shop's own exclusives + shared gear, EITHER outfitter ALSO offers the
  VISITING hero's register line (`equipmentRegisterLineFor` off `factionVisualRegister`,
  deduped) — a classic faction sees the classic line at both shops, azure_breeze
  (wuxia) the xianxia line, fuyuki (anime) the isekai line, hidden_leaf its OWN
  bespoke shinobi line (Kunai Pouch / Body-Flicker Tabi / Sage Chakra Charm) and
  azur_lane its OWN bespoke kansen line (Oxygen Torpedo / Repair Toolkit / SG
  Radar / Manjuu Piggy Bank / Beaver Squad Tag / Retrofit Blueprint), while
  heavenly_demon gets Blood Demon Saber / Bonefiend Plate / Demon Heart. Hidden Leaf
  AND Azur Lane both SHARE the `anime` visual register with
  Fuyuki, so the register switch alone cannot tell them apart:
  `equipmentPackagesForFaction` special-cases hidden_leaf → `["shinobi"]` and
  azur_lane → `["kansen"]` AHEAD of the switch, or either would fall through to
  Fuyuki's isekai line. Heavenly Demon is likewise special-cased to `modao`
  AHEAD of the shared wuxia register, while Azure Breeze stays `anime-xianxia`.
  So a wuxia visitor sees
  isekai-exclusive gear ONLY at the shop that sells it (never as a register line),
  and classic items appear ONLY for classic visitors. Matrix + grade-in-label pinned
  in `anime-equipment.test.ts` ("register-aware shops (§3.13 matrix)"). FUTURE-TOWN
  RECIPE: a new town only needs a `factionVisualRegister` entry to light up an
  existing register line at every outfitter (no shop edit); for bespoke gear, add
  items in a new package + return it from `equipmentPackagesForFaction` (Hidden Leaf's
  `shinobi`, Azur Lane's `kansen`, and Heavenly Demon's `modao` are the worked examples of the bespoke
  branch). GATING:
  `FieldOverrideDefinition.requiresModule`
  (new) + a `moduleEnabled` predicate on `listFieldOverrideDefinitions` — with
  `anime.equipment` off the two outfitters appear in NO pool/listing
  (CONTROL-pinned); the 11 existing kinds carry no `requiresModule` and are
  unaffected. DOCUMENTED SWAP: the original "Courier's Charm +1 MP/turn" idea
  became the Supply Satchel because no clean per-turn movement-income chokepoint
  existed (the Boots family grants movement as a one-shot CARD, not a standing
  drip) — a per-turn movement item awaits that arm. AI buys into an EMPTY slot
  from surplus (`gold ≥ cost + 6`) else leaves (no stall, no auto-replace).
- **Also shipped: the cross-mod COEXISTENCE GATES (§3.8)** — the blanket
  guarantees that base game + WOG + xianxia + isekai + Polish all thread into ONE
  coherent game (different displays/power systems, one engine). Four gates, each
  mutation-checked where meaningful:
  - **(a) master byte-identical-when-off CONTROL** (`src/engine/anime-coexistence.test.ts`):
    a scripted 2-human game driven to round 6 serializes IDENTICALLY (setup AND
    final state, event log included) whether `anime` is absent, `undefined`, or
    `DEFAULT_ANIME_OPTIONS` (all-false) — proving the default-off spine adds zero
    behavioural surface. A `enabled:true` build is the sensitivity control (its
    serialized state diverges).
  - **(b) the ALL-ON soak** (`src/server/anime-coexistence-soak.test.ts`,
    reusing `single-player-soak-helpers.ts`): a fixed-seed single-player game with
    EVERY shipped anime module (`enabled, xianxiaArtifacts, cultivation,
    heroGrades, equipment` + global `fieldOverrides`), EVERY WOG module, Creature
    Banks, Polish Unit-Stacks + Bank-Sizes, Morale Cards and the stash Spell Book
    reaches round 6 with ZERO stalls / negative resources (a shorter round-4
    variant swaps in the mutually-exclusive Polish Spell Book; a 3-opponent run
    for breadth). Soft-asserts anime systems are LIVE (overrides carved, Merit/
    grade/realm progression fires). Soft note: equipment equips only when a seat
    both reaches an outfitter and has surplus gold — the soak may still see 0
    equips on unlucky maps (pathing + gold), not a coexistence failure.
  - **(c) mixed-package no-cross-talk CONTROL** (`src/engine/anime-coexistence.test.ts`):
    carving an ISEKAI field-override kind (content present) leaves the xianxia
    Cultivation/Grade event sequence byte-identical to a xianxia-only run, and the
    grade-name register keys off the owning FACTION, not module flags or carved
    content (the same flags with an Azure Breeze owner are the mutation control).
  - **(d) display coexistence** (`src/components/anime-coexistence-display.test.tsx`):
    a hero board renders realm + grade + all-three equipment chips simultaneously
    with no collision; the map-designer Field Override palette lists a xianxia AND
    an isekai kind together; the hero-actions dock renders under the all-on config.
  - **KNOWN LIMIT surfaced by gate (d):** the two Equipment MARKETS
    (`ren_binh_cac` / `adventurer_outfitter`, `requiresModule:"equipment"`) are
    deliberately gated OUT of the ungated map-designer palette (a conscious §3.13
    decision, pinned in `src/engine/anime-equipment.test.ts` "the DESIGNER-palette
    style listing … also hides the outfitters"). So a designer cannot pin an
    equipment outfitter today — a designer-pinned outfitter is not modeled, and
    the coexistence slice did NOT flip that behaviour (it would contradict the
    prior CONTROL). The outfitters still reach a game via the pool draw when
    `anime.equipment` is on.
- **Also shipped: Forced Battle Events (scripted combats, §3.12)** — a fight on a
  particular MAP FIELD runs SCRIPTED EVENTS (an environment stat modifier, an
  obstacle formation, a timed damage pulse, a flavor announce) at combat-start
  and/or a chosen round-start. Mechanism CORE (`src/data/map/combat-scripts.ts`
  registry + `src/engine/combat-scripts.ts` hook), content a package
  (`src/data/anime/combat-scripts.ts`). Default OFF / non-scripted field ⇒
  byte-identical. Leading with what does NOT run / limits: **V1 is FULLY
  AUTOMATIC — no script effect opens a player window or choice** (the deliberate
  anti-AI-freeze design: nothing new to score, `parallelSlotSignature` untouched);
  **NEUTRAL fights only** (guard fields AND Creature Banks — `context.kind
  "neutral"`; PvP and the combat sandbox fire nothing, CONTROL-pinned); **no
  obstacle auto-pick** (`place-obstacles` takes explicit empty cells); **no
  designer/campaign attachment surface yet** (scripts attach only by a package
  registering off a location id — the growth path is data: a designer `scriptId`
  and campaign set-pieces); **Creature-Bank support is by mechanism, not
  content** (no bank-script ships). What runs (each mutation-checked in
  `src/engine/combat-scripts.test.ts`): the four effect kinds — `environment-stat`
  (combat-long stat modifier read LIVE at attack/defense resolution, the Crag Hack
  `proclamationGroundAttackBonus` seam; added unclamped), `damage-pulse` (effect
  damage through the removal path, the `applyElementalScourge` seam),
  `place-obstacles` (empty cells → `combat.obstacles`, movement already
  obstacle-aware), `announce` (a `COMBAT_SCRIPT_TRIGGERED` feed line —
  `formatEvent` case + `combat-start` cue — so every event announces itself).
  Trigger: combat-start in `finalizeCombatStart` (after `applyCommanderCombatStart`,
  idempotent via `combat.combatScripts.startApplied`); round-start in
  `advanceCombatRound` after the round increments (idempotent via `roundsFired[]`).
  V1 content = the two **Bí Cảnh** scripts on `anime.bi_canh` (Spirit Mist: all
  RANGED units both sides −1 Attack combat-long; Earthvein Surge: round-2 pulse 1
  to the attacker side), gated on `"enabled"` since the anime location only exists
  under the mod. Effects are per-combat; nothing persists to the next fight.
- **No standalone (off-tile) override objects** — on-tile pins only.
- **`linh_tuyen` is +1 movement only** (cleanse not wired, documented at the
  definition); no override kind may claim `starting` tiles (setup skips
  starting plans — enforced by a registry test).
- The lobby "Field Overrides" row lives under Game options; enabling an
  anime-package pin map auto-flips BINH + the Anime crest at map pick/setup.
- **Also shipped (FOUNDATION only): the visual-novel STORY system** (§11 /
  §3.2). Leading with what does NOT run: **no campaign hooks** (`on_start`/
  `on_victory`/… are the next step, §12), **no karma/fate/flag deltas on
  choices** (the destiny substrate is unshipped — those fields are kept OUT of
  the `StoryChoice` type on purpose), **no music** (the overlay reuses the
  existing `adventure/new-week` open sting only, no new sound files), **no e2e**
  (jsdom only), and — 2026-07 — **all referenced story art now SHIPS on disk**
  (backgrounds 16:9 + transparent sprite cutouts under `public/assets/story/…`;
  `STORY_ART_PLACEHOLDERS` is now EMPTY — a future referenced-but-unshipped
  asset path must be declared there so the overlay keeps its theme-tinted
  gradient / initial-letter avatar fallback instead of a broken `<img>`; the
  fallback path stays pinned in `story-overlay.test.tsx` via a forced-placeholder
  mock). What RUNS (each mutation-checked): the bilingual EN/VI scene data +
  registry (`src/data/story/scenes.ts`, `scenes.test.ts` — 2 themed demo scenes,
  registry integrity + art-or-declared-placeholder invariant); the language
  preference (`src/lib/story-language.ts`, default "en", SSR-safe,
  `story-language.test.ts`); the `StoryOverlay` component
  (`src/components/table/story-overlay.tsx`, `story-overlay.test.tsx` — typewriter
  complete-then-advance on click/Space, Skip, history log, EN/VI toggle,
  `nextSceneId` choice chaining in-session, `onDone` at the true end, the
  package theme class `.xianxiaTheme`/`.isekaiTheme`/`.classicTheme` stamped on the component
  ROOT per §3.6 — never the table root); and ONE trigger path — the map-designer
  timed event `{ kind: "story", sceneId }` (`CustomMapPreset.timedEvents` union
  in `state.ts`; sanitized in `map-preset.ts` — unknown `sceneId` dropped;
  round-trip in `map-registry.test.ts`; `applyCustomMapTimedEvents` fires a
  table-wide `STORY_SCENE_TRIGGERED` — engine + wrong-round CONTROL in
  `custom-setup.test.ts`; editor dropdown + scene select in
  `map-preset-editor.tsx`/`.test.tsx`). The client (`page.tsx`) pops the overlay
  ONCE per event id and never on reconnect (the exact MapEventOverlay seen-set /
  prime semantics); story events are table-wide, so eliminated-seat skipping is a
  verified no-op for them.
- **Also shipped: the STORY-MODE campaign hub + Chapter 1 of FOUR campaigns**
  (§12 / §3.3 — the campaign shell around the story system above): the Jianghu
  Chronicle (xianxia), Bin's Otherworld Chronicle (isekai), **Restoration of
  Erathia** (the CLASSIC board-game campaign — `theme: "classic"`, painted
  late-90s chrome, NO anime modules; protagonist Queen Catherine, stand-in
  Castle) and **The Grand Convergence** (the EVERYTHING-TOGETHER crossover: its
  ch-1 injects ALL shipped anime modules + Field Overrides + **WOG
  `{enabled, commanders}`** + **`houseRules: {"polish-unit-stacks": true}`** on
  one map — `CampaignChapterSetup` gained optional `wog` (resolved against
  `DEFAULT_WOG_OPTIONS` to the full record `GameSetupOptions.wog` wants) +
  `houseRules` passthroughs, folded into the `SET_GAME_OPTIONS` injection).
  Client presentation + localStorage around the existing `sp-` room flow, PLUS
  the setup injection below (one small engine change: `buildAdventureFromLobby`
  now carries the lobby's `anime` + `fieldOverrides` into the built game).
  Leading with what does NOT run: **only Chapter 1 of each campaign is
  PLAYABLE** (chapters 2–7 are DATA — `playable:false`, no `setup`, empty
  `scenes` — rendering "in development" once the unlock chain reaches them);
  **protagonists are PRESENTATION** (the playable seat uses a CORE faction
  stand-in: **Jianghu ch-1 = Rampart, Bin ch-1 = Tower, Erathia ch-1 = Castle,
  Convergence ch-1 = Rampart**, anime towns are unshipped); **`mapPresetId` is
  unused** (standard map generation in V1); and **no routes/karma/cheat
  picks/quest-log** (§13 deferred, campaign-only). Only shipped anime flags may
  be set true on a playable chapter (allowlist `{enabled, cultivation,
  xianxiaArtifacts, heroGrades, equipment}` + the global `fieldOverrides`
  toggle) — a dead flag fails `campaigns.test.ts`. Every campaign carries
  codex-generated banner `cover` art (`public/assets/story/covers/<id>.webp`,
  drawn on the /story card, on-disk-pinned in `campaigns.test.ts`). What RUNS
  (each mutation-checked): the campaign registry (`src/data/story/campaigns.ts`
  — four campaigns, 7 bilingual chapters each, `chapterRoomOptions`;
  `campaigns.test.ts`), the ch-1 intro/victory/defeat scenes in `scenes.ts`
  (`scenes.test.ts`; Erathia scenes use the `classic` theme + the
  catherine/kendal sprites + erathia-shore background, Convergence reuses the
  xianxia assets), the progress store (`src/lib/campaign-progress.ts` —
  per-campaign completion + unlock chain, per-room binding +
  intro/outcome/**setupApplied** markers, SSR-safe;
  `campaign-progress.test.ts`), the PURE triggers in
  `src/lib/campaign-triggers.ts` — `campaignSceneToFire` (state+binding+markers →
  scene, UNBOUND-room CONTROL) AND `campaignSetupActions` (chapter →
  `SET_GAME_OPTIONS` + `CHOOSE_FACTION`, LOCKED-chapter CONTROL;
  `campaign-triggers.test.ts`), the `/story` route (theme-scoped campaign cards +
  EN/VI toggle + Begin flow; `src/app/story/page.test.tsx`), the **Story-mode
  entry on `/single-player`** (moved OFF the main menu 2026-07 per user request;
  a Homm3BG spell icon — `/assets/spell-icons/teleport.png` — marks it;
  `single-player/page.test.tsx` + the menu ABSENCE pinned in
  `menu/page.test.tsx`), and the thin table wiring in `page.tsx` (a bound room
  pops intro/outro through the EXISTING `storyCue`/`StoryOverlay` pipeline once per
  room; a game-over win calls `markChapterCompleted`).
- **SETUP INJECTION — a chapter's config is now APPLIED (was carried-only).**
  The Begin flow mints a standard `sp-` room (opponent count only); once the human
  is seated in the setup lobby the table page pushes `campaignSetupActions(chapter,
  seat)` — `SET_GAME_OPTIONS` (the chapter's `anime` + global `fieldOverrides` +
  `difficulty`) then `CHOOSE_FACTION` (protagonist's core faction + its first hero,
  PRESELECTED) — through the NORMAL action pipeline (no new server surface), once
  per room (persisted `setupApplied` marker + a ref). The player still sees the
  normal setup screen and may change any pick before starting. The engine change
  it needed: `buildAdventureFromLobby` had been DROPPING `anime` + `fieldOverrides`
  when building the game from a lobby (only the direct `createAdventureGameState`
  path carried them), so a lobby-set toggle never reached the started game — now
  carried through (defaults OFF ⇒ a plain lobby is byte-identical). Pinned
  end-to-end in `src/server/campaign-setup-injection.test.ts`: a room built with
  the Jianghu ch-1 options STARTS with `anime.enabled + cultivation +
  xianxiaArtifacts + fieldOverrides` ON and the Rampart seat, with a plain
  `/single-player` room (injects nothing) as the all-default CONTROL.

## Anime Towns (`anime.isekaiTowns` / `anime.xianxiaTowns`) & themed mod UI — what runs vs. limits

FIVE COMPLETE playable factions behind the two anime town module flags (default
OFF ⇒ byte-identical; `isPlayableFaction(id, animeOptions)` gates every pick
surface — lobby grids, draft rolls, computer seats, Random-Town defenders):
**Fuyuki City** (`fuyuki`, isekai), **Hidden Leaf Village** (`hidden_leaf`,
isekai) and **Azur Lane Naval Base** (`azur_lane`, isekai) all behind
`anime.isekaiTowns`, plus **Azure Breeze Sect** (`azure_breeze`, wuxia) and
**Heavenly Demon Palace** (`heavenly_demon`, modao) behind
`anime.xianxiaTowns`. Each ships a
7-unit roster (every ability tag a REUSE of an already-implemented engine
ability — pinned per-side in `src/data/anime/towns.test.ts` and, for Hidden Leaf /
Azur Lane, `src/data/anime/hidden-leaf-content.test.ts` /
`src/data/anime/azur-lane-content.test.ts`; the TWO dedicated new abilities (both
from Fuyuki/Hidden Leaf — Azur Lane adds NONE, every tag a reuse) are
the Fuyuki Casters' `casters-damage-cap`, a ≤1-damage-per-single
attack OR Spell hard cap via `CAP_DAMAGE_PER_ATTACK.includeSpells` — both
Casters sides also carry `elemental-damage`, so they join the die-proof
inventory in `elemental-fixed-damage.test.ts`; behaviour + Nix
spells-stay-uncapped CONTROLs in `fuyuki-casters.test.ts` — and Hidden Leaf's
`jinchuriki-chakra-burst`, an `AFTER_ATTACK_SPLASH` arm pinned in
`src/engine/after-attack-splash.test.ts`, detailed in the Hidden Leaf paragraph
below), 8 buildings on the
SHARED building-effect archetypes (City-Hall choice, dwellings, Mage Guild,
Portal Summon, Artifact Smith, Hall of Valhalla, resource die — nothing bespoke),
2–5 heroes each with portraits on disk (all five factions real — the last
Hidden Leaf placeholders were replaced 2026-07, below), a starting tile
(`A-S1` / `W-S1` / `L-S1` / `P-S1` / `D-S1`), a designed
town board whose bars are seven real contiguous panorama slices (empty↔full
pairs, `townBoardSpecs.barTileImages`), a capitol icon on the same
`town-icon-<faction>.webp` convention as every classic faction
(`scripts/build-anime-town-icons.mjs`), and a WOG commander (Astral Regent /
Sword Saint / Might Guy / Belfast / Demon Ancestor) reusing the Brute / Temple-Guardian /
shaman-Haste cast arms and the `vanguard-marshal` / `superior-combat` / `first-aid`
specialty machinery verbatim (Might Guy triple-reuses `superior-combat` as "Eight
Gates"; Belfast reuses the Tower Temple Guardian's Precision cast AND the Rampart
Hierophant's `first-aid` post-combat window — see the Azur Lane paragraph below).

**Hidden Leaf Village (`hidden_leaf`, isekai — the third town).** Shares
`anime.isekaiTowns` with Fuyuki (NO new `AnimeModOptions` field, NO new lobby
row — the isekaiTowns row description names both). Leading with what does NOT run
/ deliberate limits:
- **ALL Hidden Leaf art is now REAL (anime shinobi) — the placeholder era is
  over.** 14 Few/Pack unit faces built by `scripts/build-hidden-leaf-unit-cards.mjs`
  from frame-free masters under `scripts/anime-art/raw/hidden-leaf/units/` +
  painted stat icons (kunai / shield / leaf / ninja-move); its `CARDS` table
  (stats / dual Few-Pack costs / rules) is kept in LOCKSTEP with
  `src/data/anime/towns.ts` — re-verify on any stat change. Board-game hierarchy
  (title · left stats · art · dual Few/Pack costs on the Few face · `# PACK`
  only on Pack · rules); leaf-green chrome. The 3 hero portraits, town
  empty/full panoramas, 7 board bars, L-S1 tile, town icon and the Might Guy
  commander card are real Codex art normalized/sliced by
  `scripts/build-hidden-leaf-art-post.mjs` (+ `build-commander-cards.mjs`
  `might_guy`); specialty portraits for Naruto/Sasuke crop Jinchuriki/Jonin.
  `scripts/build-hidden-leaf-placeholder-art.mjs` is DELETED (it would clobber
  the real art). ONE placeholder set remains: the 3 `shinobi` equipment
  inventory icons are still procedural monograms (see the Equipment section).
  Content tests only assert the files EXIST at the right size, never that they
  are final.
- **3 heroes, not the plan's 6** (§6.2 lists six; the other three are deferred
  exactly like the other two towns' rosters).
- **Susanoo's "Armored" is the real `nix-damage-cap` ≤2-per-single-attack arm,
  not a flavor "cap 2 damage" narrative** — the Nix damage-cap seam, so a Spell
  still bypasses it (Susanoo Pack layers `titan-ignore-ongoing` on top).
- **Genin's "Teamwork Formation" ships as the flat own-attack
  `wog-attack-when-attacking-1` arm** (the azure Outer Disciples Pack twin), NOT
  the plan's adjacent-to-TARGET variant (a NEW-lite param, deferred; abilityText
  states only what runs).
- **Medical-Nin's token-removal variant is NOT shipped** — its Pack is the plain
  `enchanter-heal-or-buff` [activation] Enchanter heal/buff pick.
- **No bespoke commander substitution machinery** (the plan's phoenix-rebirth
  twin) — Might Guy ships the `superior-combat` owner-picked stance ("Eight
  Gates") instead, a triple-reuse (Fortress Shaman → Sword Saint → Might Guy).
- **The Battle-Test combat sandbox still excludes every anime faction**
  (inherited — its `isPlayableFaction` call passes no anime options).

What runs (each pinned in `src/data/anime/hidden-leaf-content.test.ts`, plus the
named behaviour test): the 7-unit roster (3 bronze / 2 silver / 2 gold, every tag
already-implemented) — Genin Squad (bronze) Few `[]` / Pack
`wog-attack-when-attacking-1`; Medical-Nin (bronze) Few `[]` / Pack
`enchanter-heal-or-buff`; Anbu Black Ops (bronze RANGED) Few
`ignore-combat-penalties` / Pack `ignore-combat-penalties` + `teleport-move`;
Jonin (silver RANGED) Few `ignore-combat-penalties` / Pack
`ignore-all-combat-penalties` + `ignores-retaliation`; Giant Toad (silver) Few
`commander-defense-token` / Pack `commander-defense-token` + `automaton-detonate-1`;
Jinchuriki (gold) Few `jinchuriki-chakra-burst` / Pack
`magic-elemental-attack-all-enemies`; Susanoo Avatar (gold) Few `nix-damage-cap`
/ Pack `nix-damage-cap` + `titan-ignore-ongoing`. The ONE new engine arm is
`jinchuriki-chakra-burst` (`AFTER_ATTACK_SPLASH`, amount 1): after this unit's
OWN declared attack resolves, deal 1 EFFECT damage to EVERY other adjacent unit —
friend AND foe — with NO retaliation, unreduced by Defense, routed through the
normal effect-damage/removal path; it fires on OWN attacks ONLY (never on a
retaliation) and, being effect damage not an attack, is NOT capped by
nix/casters damage caps (CONTROL-pinned in `src/engine/after-attack-splash.test.ts`).
8 buildings on the SHARED archetypes (Mission Board City-Hall choice; Ninja
Academy / Forest of Death / Sanctum of the Tailed Beast dwellings; Village Walls
reinforce; Scroll Vault Mage Guild; Chunin Exam Arena Hall-of-Valhalla; Summoning
Pact Shrine Portal-Summon — zero new TownBuildingEffect types), a 7-bar board
(`townBoardSpecs.hidden_leaf`, one two-building bar). 3 heroes with own-portrait
specialties I/IV/VI: Naruto (might, doubles on its OWN "Jinchuriki"), Sasuke
(might, doubles on "Jonin"), Tsunade (magic, "Hundred Healings" — a
faction-agnostic medic clone via `rethemedSpecialty`, no unit doubling). Might Guy
commander (`might_guy`, `COMMANDER_SLUG_BY_FACTION.hidden_leaf`) = the shaman-Haste
cast ("Body Flicker", `commander-cast-shaman`) + `superior-combat` ("Eight
Gates"), Monk voice. Starting tile L-S1 (mirrors A-S1). Its BESPOKE `shinobi`
equipment line (3 items — Kunai Pouch / Body-Flicker Tabi / Sage Chakra Charm) is
`anime.equipment`-gated, joins the shared Artifact deck like every equipment item,
and is offered as Hidden Leaf's register line at BOTH outfitters via the §3.13
special-case (`equipmentPackagesForFaction` returns `["shinobi"]` for hidden_leaf
AHEAD of the register switch, since it shares the `anime` register with Fuyuki —
see the Equipment section). Live-play coverage:
`src/server/hidden-leaf-live.test.ts` drives a fixed-seed single-player game with
BOTH seats on hidden_leaf to round 5 with no stall / no negative resource, soft-
asserting its units are recruited and Might Guy is on the field; the all-on
`anime-coexistence-soak.test.ts` now also runs with both town flags available.

**Azur Lane Naval Base (`azur_lane`, isekai — the fourth town; 2026-07 UPGRADED).**
Shares `anime.isekaiTowns` with Fuyuki / Hidden Leaf (NO new `AnimeModOptions`
field, NO new lobby row — the isekaiTowns row description names all three isekai
towns). Its seven units are NAMED shipgirls. The 2026-07 upgrade replaced the
original all-reuse rollout with FOUR bespoke engine mechanics + an all-new
Codex-painted production art suite. Leading with what does NOT run / deliberate
limits:
- **The First-Aid window refactor stands** — the WOG commander First Aid
  post-combat window is keyed off the `first-aid` SPECIALTY id
  (`playerHasLivingFirstAidCommander` in `commanders.ts`), so Belfast opens it
  too; the Rampart Hierophant is unchanged (mutation-checked in
  `wog-commanders.test.ts`).
- **`kansen-fleet-formation` is veterancy-only** (Unicorn's rank signature) — no
  printed side carries the aura; and the aura buffs OWN declared attacks only
  (never a Retaliation Attack), the carrier never buffs itself.
- **Lucky E's die halves are HELD-card offers, not normal plays** — the
  specialty's reroll/set-die halves live in the Attack-die reroll window
  (`LUCKY_E_SPECIALTY_SOURCES`, the Diplomat's-Ring pattern; hand-locked combats
  block them); only the proactive stat halves are ordinary reaction plays. VI's
  two halves share ONE card — spending either retires the other.
- **Royal Salvo is effect damage, not a Spell** — no Retaliation, ignores
  Defense, per-attack caps AND spell wards; ongoing-effect immunity never blocks
  it (it is instant). Adjacent-only below Power 1; 2 damage at Power 2.
- **The Battle-Test combat sandbox still excludes every anime faction**
  (inherited — its `isPlayableFaction` call passes no anime options).

What runs (data pins in `src/data/anime/azur-lane-content.test.ts`, the FOUR new
mechanics behaviourally in `src/engine/kansen-abilities.test.ts` — each with
CONTROLs, mutation-checked — the commander refactor in
`src/engine/wog-commanders.test.ts`, live AI play in
`src/server/azur-lane-live.test.ts`):
- **`kansen-full-barrage`** (NEW engine arm): the AFTER_ATTACK_SPLASH machinery
  extended with `around: "target"` + `enemiesOnly` — after the unit's own
  declared attack resolves, 1 effect damage to every OTHER enemy adjacent to the
  ATTACKED unit (the target itself takes only the attack; never on a
  Retaliation Attack). Printed on Honolulu's Pack; Laffey's veterancy signature.
  The Chakra Burst around-self read is the anchor CONTROL and is unchanged.
- **`kansen-fleet-formation`** (NEW engine arm): `ADJACENT_ALLY_ATTACK_AURA` —
  friendly units adjacent to the carrier get +1 Attack on their own declared
  attacks (live positional read in `getAttackStackDetails`; two carriers stack).
- **Belfast "Royal Salvo"** (NEW commander-cast kind `enemy-damage`,
  `commander-cast-belfast`): the module's first OFFENSIVE command — 1/1/2 effect
  damage to an enemy unit by Power, through the shared ability-damage path.
- **Enterprise "Lucky E"** (NEW specialty): I/IV/VI hand instants whose die
  halves join the owner's Attack-die reroll window AND the post-attack
  ability-roll window — I/VI a reroll, IV/VI a set-die-to-"+1"; taking a half
  plays/discards the card. Proactive halves are plain ADD_COMBAT_STAT picks
  (I defense-only, IV/VI attack+defense). Enterprise is NO LONGER a
  unit-doubling might specialist (Bismarck/Nagato remain).
The 7-unit roster (3 bronze / 2 silver / 2 gold) — Laffey (bronze) Few `[]` /
Pack `ignores-retaliation`; Javelin (bronze) Few `[]` / Pack `commander-charge`;
Honolulu (bronze RANGED) Few `ignore-combat-penalties` / Pack +
`kansen-full-barrage` (2026-07, was the flat +1); Unicorn (silver) Few
`enchanter-heal-or-buff` / Pack + `unicorn-spell-ward-aura`; Yukikaze (silver)
Few `commander-defense-token` / Pack + `ignores-retaliation`; Prinz Eugen (gold)
Few `nix-damage-cap` / Pack + `unlimited-retaliation`; I-19 (gold) Few
`ignores-retaliation` + `teleport-move` / Pack + `sandworm-strike-again`.
ART (2026-07): the whole suite is Codex-PAINTED production art — masters live in
`scripts/anime-art/raw/azur-lane/**` (generated with the desktop Codex CLI's
image_gen; the official wiki refs from the GITIGNORED
`scripts/anime-art/refs/azur-lane/` are fed via `-i` so every shipgirl keeps her
exact identity). `scripts/build-azur-lane-unit-cards.mjs` renders the 14 unit
faces in the full BOARD-GAME hierarchy (title + anchor seal + tier medallion ·
left painted stat rail · art window + type chip · Few dual-cost band / # PACK ·
rules panel; navy/ivory/brass "white-glove Royal Navy" chrome; per-SIDE masters —
Few = base skin, Pack = an alt/retrofit skin of the SAME girl) plus the
Bismarck/Nagato specialty portrait crops
(`/assets/anime/units/portraits/azur-lane-{prinz-eugen,yukikaze}.webp`;
Enterprise wears the Fortune die emblem for Lucky E).
`scripts/build-azur-lane-art.mjs` is now a masters COMPOSITOR (the old
procedural-SVG suite is retired): panorama pair = ONE painted dawn-harbor scene
in two states (empty graded lots → the SAME scene fully built, the full version
generated by feeding the empty PNG back through image_gen `-i`), sliced into the
7 board bars; the P-S1 tile = a painted aerial naval-island night scene masked
into the hex flower with the printed S4 field symbols overlaid; town icon crop;
5 painted hero portraits; the Belfast commander card; the 6 kansen equipment
icons (painted, keyed); and the new rank-ability icons
(`/assets/ui/rank-ability/{full-barrage,fleet-formation}.webp` + the Royal Salvo
cast icon). 8 buildings on the SHARED archetypes (Naval Command
HQ City-Hall choice; Escort Docks / Cruiser Shipyard / Capital Ship Berth
dwellings; Fortified Anchorage reinforce; Naval Research Academy Mage Guild;
Munitions Workshop Artifact Smith; Combat Exercise Waters Hall-of-Valhalla — zero
new TownBuildingEffect types), a 7-bar board (`townBoardSpecs.azur_lane`, one
two-building bar). 5 heroes with own-portrait specialties I/IV/VI: Enterprise
carries the bespoke "Lucky E" dice specialty (above); Bismarck ("Iron Blood
Oath", doubles Prinz Eugen) and Nagato ("Big Seven Resolve", doubles Yukikaze)
are MIGHT specialists doubling shipgirls the faction actually FIELDS; plus two
MAGIC medic/support clones (`rethemedSpecialty`, no unit doubling): Akashi
("Emergency Repairs", a Gem First-Aid clone) and Sirius ("Flawless Service", a
Rion medic clone). Belfast commander (`belfast`,
`COMMANDER_SLUG_BY_FACTION.azur_lane`) = the bespoke "Royal Salvo" enemy-damage
cast (above) + `first-aid` ("Impeccable Service"), her bespoke Japanese Azur
Lane voice clips (the Sea Witch set is only the dead documented fallback in
`commanderVoices` — `commanderSoundKey` short-circuits "belfast" to
`azur-lane/voices/belfast/*` first), Magic-Arrow cast fx. Starting tile P-S1 (an S4-layout clone, mirrors A-S1). Its BESPOKE
`kansen` equipment line (6 items, 2 per grade across all four slots — Oxygen
Torpedo / Manjuu Piggy Bank / Repair Toolkit / Beaver Squad Tag / SG Radar /
Retrofit Blueprint) is `anime.equipment`-gated, joins the shared Artifact deck
like every equipment item, ships Codex-painted icons (2026-07, replacing the
vector set),
and is offered as Azur Lane's register line at BOTH outfitters via the §3.13
special-case (`equipmentPackagesForFaction` returns `["kansen"]` for azur_lane
AHEAD of the visual-family fallback — the same bespoke branch as hidden_leaf's `shinobi`,
since both share the `anime` register with Fuyuki — see the Equipment section).
Azur Lane ALSO wears a bespoke `kansen` HERO-GRADE name register
(Common/Rare/Elite/Super Rare — `Thường/Hiếm/Tinh Nhuệ/Siêu Hiếm`, via
`BESPOKE_FACTION_GRADE_REGISTERS` checked ahead of the normal faction map, same
shared-package precedent) and a naval UI LEXICON (Fleet Rating / Rigging & Gear /
Flagship Regalia / Fleet roster / Tactical drill / Fleet Training Board,
`factionUiLexicon`) over the SAME "anime" VISUAL register it keeps (CSS theme
unchanged) — NAMES only, mechanics/state untouched; pinned in
`anime-hero-grades.test.ts` (the kansen register, isekai-only + both-packages,
with a hidden_leaf→isekai CONTROL) and `azur-lane-content.test.ts` (the lexicon
words + a fuyuki generic-anime CONTROL).
With the Unit-Experience rule on, the seven shipgirls carry BESPOKE fleet-lore
veterancy rank schedules (`UNIT_RANK_SCHEDULES` in
`src/data/units/experience-rank-abilities.ts`; bronze `standard`, silver/gold
`strong` — the faction-peer shape) instead of generic defensive fillers:
signatures are Laffey → `kansen-full-barrage` (2026-07; the bespoke
around-target salvo — her impossible rate of fire; `sandworm-strike-again`
stays the alternative), Unicorn → `kansen-fleet-formation` at slot 2 (2026-07;
the carrier escort aura) after `wraith-heal-1` (self-repair), Yukikaze →
`attack-roll-advantage-passive` (twin Attack dice, keep
the higher — the luckiest ship), Prinz Eugen → `zombie-resilience` (die-roll soak
= unsinkable). DELIBERATE
deviation from the raw intent: the ranged-only `DOUBLE_ATTACK` arm is INERT on a
melee `ground` body, so Javelin/I-19 take `commander-max-damage` /
`wog-no-negative-attack-roll` (functional) rather than `double-attack-low-roll`
(which would never fire). Pinned in `azur-lane-content.test.ts` ("Fleet veterancy
— bespoke rank schedules"): exact per-unit choice arrays (mutation control — a
revert to fillers fails), an azur_lane-scoped hygiene loop (implemented,
non-Stacked, not printed on either side = no wasted rank), every choice id has an
explicit `UNIT_RANK_ABILITY_ICONS` entry resolving to a file on disk, and a
BEHAVIOURAL fold (Yukikaze R1 +1 Defense, R2 grants Twin Attack Dice, with a
below-threshold CONTROL that grants neither).
Live-play coverage: `src/server/azur-lane-live.test.ts` drives a fixed-seed
single-player game with BOTH seats on azur_lane to round 5 with no stall / no
negative resource, soft-asserting its units are recruited and Belfast is on the
field (its `first-aid` fires in play); the all-on `anime-coexistence-soak.test.ts`
runs with both town flags available.

**Heavenly Demon Palace (`heavenly_demon`, modao — the fifth town / second
xianxia town).** Shares `anime.xianxiaTowns` with Azure Breeze (no new option or
lobby row) and ships as a complete evil cultivation faction: 7 units (3 bronze /
2 silver / 2 gold), 8 shared-archetype buildings, five heroes, D-S1, a contiguous
seven-bar palace board, and Demon Ancestor. Exact content and asset wiring are
pinned in `src/data/anime/heavenly-demon-content.test.ts`.

The roster reuses proven abilities except for two focused engine arms, each with
behavioral controls in `src/engine/heavenly-demon-abilities.test.ts`:
`heavenly-demon-blood-siphon` heals Blood Disciples after their own attack
actually deals damage (never on retaliation or a fully soaked hit), and
`heavenly-demon-reap` gives the Demon Avatar a stacking combat Attack bonus when
an adjacent unit is removed. Gu Witches, Shadow Wraiths, Corpse Puppets, Bone
Reavers and Ghost King otherwise compose existing penalty-ignore, paralysis,
no-retaliation, defense-token, detonation, charge, regeneration and unlimited-
retaliation seams. Five heroes are Xuedao / Guiyan / Xuanming (own-faction unit
specialists) plus Yaoji / Molian (magic support clones). Demon Ancestor reuses
the Brute Bloodlust cast as Blood Frenzy and the implemented `undead` specialty;
its cast/specialty behavior is pinned in `wog-commanders.test.ts`.

The faction shares wuxia visual chrome and Stage/Cultivation progress words, but
its realm/grade names are bespoke `modao`: Blood Refinement → Devil Soul and
Blood Adept → Heavenly Demon. Its equipment register is likewise faction-only:
Blood Demon Saber / Bonefiend Plate / Demon Heart at both outfitters. Two WOG
commander artifacts add Blood Patriarch's Saber (+2 Attack) and Demon Heart
Talisman (+1 command-cast Power and +1 Initiative); these remain gated by the
normal `wog.enabled && wog.artifacts && wog.commanders` deck join.

ART: `scripts/build-heavenly-demon-art.mjs` composes the 14 unit faces, five
1086×1448 WebP hero portraits, commander card, palace panoramas/bars, tile and
icon from masters under `scripts/anime-art/raw/heavenly-demon/`. Every Few/Pack
unit face now has a distinct master; the former five mirrored lower-tier Pack
faces were replaced by dedicated formation scenes. `scripts/build-equipment-cards.mjs`
derives the three modao icons/faces from painted masters, and
`scripts/build-commander-weapon-cards.mjs` does the same for the two demonic WOG
artifacts. Prompt provenance sits beside every new master. Live-play coverage in
`src/server/heavenly-demon-live.test.ts` runs three fixed seeds with both seats
on the faction and cultivation/grades/equipment enabled, reaching round 5 with
no stalls or invariant violations while asserting real roster and
commander/progression activity.

Leading with what does NOT run / deliberate limits:
- **The combat sandbox never offers the anime factions** (its
  `isPlayableFaction` call passes no anime options — conservative).
- **Unit voices**: Fuyuki now ships 37 normalized Fate/unlimited codes clips
  (five core actions for all seven lines, plus Archer/Caster shoot lines;
  `public/sounds/fuyuki/README.md` documents the exact source map), with its
  former H3 assignments retained only as missing-asset fallbacks. Azure Breeze,
  Hidden Leaf and Heavenly Demon ship a dedicated 109-clip
  curated pack (`docs/anime-town-audio.md`) wired to
  `units/<town>-<unit>-<action>` keys — every action per unit, shoot for the
  four ranged units, pinned by exact-key tests in `unit-sounds.test.ts`. Azur
  Lane keeps its Japanese voice clips (see its own section).
- **Hero specialties**: each anime hero owns its OWN specialty set —
  Bin = Sabers specialist, Qingyun = True Inheritors specialist (the three
  generic unit-specialist generators, doubling LIVE on their own faction's gold
  unit); Aoko / Lingxi = themed clones (`rethemedSpecialty`) of the fully
  generic Rion medic / Gem First-Aid sets. They previously borrowed
  Catherine's / Gelu's sets whose doubling (and Gelu IV's "discard a Pack of
  Elves" trade) could never fire in these factions — dead clauses, fixed and
  pinned in `towns.test.ts` ("might specialists double on a unit of their OWN
  faction"). All face-less (native specialty renderer, hero's own portrait).

**Themed mod UI (visual registers).** `src/data/faction-theme.ts` maps a faction
to a register — `classic` / `anime` (fuyuki, hidden_leaf, azur_lane) / `wuxia`
(azure_breeze, heavenly_demon) — with a per-register lexicon (Hero Grade/Spirit Rank/Martial Path, Unit deck/Servant
roster/Sect retinue, Drill/Field training/Cultivate, …). The register stamps
`theme-<register>` + `--mod-*` CSS vars on the hero board, town window/board,
army panel and every mod-system window, so the three registers genuinely look
different (leather ridge / astral glass / jade double borders + register art).
The hero footer's Level/XP words, realm name and grade title resolve from the
owning faction, never from whichever package flags happen to be enabled.
Heavenly Demon deliberately shares the wuxia visual chrome and Stage/Cultivation
words, but uses bespoke `modao` realm and grade-name registries.
The hero-systems row on the hero board opens POP-UP WINDOWS (portal, shared
`heroSystemModal` shell): the Hero-Grade skill tree, the Hero-Equipment
paper-doll (drag-drop + accessible Equip/Unequip buttons over the REAL
`EQUIP_HERO_ITEM`/`UNEQUIP_HERO_ITEM` reducer actions — replaced gear moves to
the hero's `equipmentInventory` bag, never vanishes; forged unowned/wrong-slot
actions rejected, pinned in `anime-equipment.test.ts`), the commander-artifact
window (bind via the engine's PLAY_CARD offers only), **and the Unit Experience
Board (below)**.

**Unit Experience Board window.** The veterancy board is a BUTTON that opens a
pop-up window like the other systems — from the hero board's systems row
(`HeroBoard`, needs `legalActions` for live controls) AND from the army panel
(`ArmyPanel`). Per army card it shows: XP on the tier's REAL thresholds
(milestoned progress track), the rank-by-rank stat DELTAS (not just the
cumulative total), the live folded stats (`base → folded` per stat, Polish-Stack
and permanent bonuses included), the signature ELITE ability with its FULL rules
text (active at rank 3 / locked below), and the engine-offered Drill / Reinforce
/ Stack actions (never invented — the exact `legalActions` entries). Read-only
without `onAction` (opponent info). Pinned in
`src/components/adventure/unit-rank-badge.test.tsx` (window content from real
tier data + Drill dispatch + rule-off CONTROL) and `hero-board.test.tsx`
(systems-row button + CONTROL). Component:
`src/components/adventure/unit-experience-window.tsx`.

## Setup Hub — the four-box map-setup lobby (2026-07) — what runs vs. limits

The map-setup lobby (`SetupLobbyScreen`, `screen.tsx`) is FOUR large icon boxes in
a centered 2×2 grid — **Game mode · Heroes & Draft · Map · Advanced settings** —
each opening ONE popup window and summarizing the table's current choice
underneath, with the classic Start button below them. It REPLACED the old two-tab
layout ("Heroes & draft" / "Game options"). Pure PRESENTATION over the existing
lobby actions: every control still dispatches the same `SET_GAME_OPTIONS` /
`CHOOSE_FACTION` / `SET_DRAFT_FORMAT` / `SET_COMPUTER_OPPONENTS` /
`START_ADVENTURE` payloads, so no engine rule changed. Applies to single-player
too (it shares the component). The boxes are full-bleed PAINTED PANELS
(2026-07-25, replacing the icon-in-a-circle look): `SETUP_HUB_ART` in
`homm-assets.ts` — four codex-image_gen oil-painted 3:2 panels (war-council
emblem / mounted knight / campaign map / arcanist's workbench, ornate frame
baked in, lower third kept dark for the title plate; on-disk pinned in
`src/data/assets/setup-hub-art.test.ts`, regenerate via
`scripts/codex-gen-art.ps1`) with a bottom text plate, staggered entrance,
ember-breath rim and a hover light-sweep + art zoom (all CSS, disabled under
`prefers-reduced-motion`). The small `SETUP_HUB_ICONS` spell-book icons remain
the summary rail's (`SetupSummaryRail`) chip icons only. The Map window pins
"Play this map" in an always-visible `.mapPickApplyBar` under the detail
column's own scroll area (sticky over the sheet scroll in phone mode) — it
must never sit below the fold of a long description/conditions list.

Components: `SetupHub` / `GameModeModal` / `HeroesDraftModal` /
`AdvancedSettingsModal` + the extracted `GameModeSection` and `SeatCountControl`
(all in `screen.tsx`); the shared popup shell
`src/components/adventure/setup-hub-window.tsx`; the Map window
`src/components/adventure/map-pick-modal.tsx` (+ its `DifficultyChessBar`); the
read-only preview `src/components/adventure/map-shape-preview.tsx` (now the ONE
home of `GROUP_COLORS` + `flowerOutline`, which `map-designer.tsx` imports); the
right-of-scene summary rail `src/components/adventure/setup-summary-rail.tsx`; the
pure derivations `src/components/adventure/setup-hub-summary.ts`. Behaviour is
pinned in `setup-hub.test.tsx`, `setup-hub-summary.test.ts`,
`map-pick-modal.test.tsx`, `map-shape-preview.test.tsx` (each claim
mutation-checked with CONTROLs) plus the real-browser half
`tests/e2e/setup-hub-phone.spec.ts` (jsdom cannot compute CSS).

### Box ownership + the summary rail — the four boxes are ONE screen

(2026-07-31: the cross-window strip that used to sit INSIDE every hub window is
retired; its consolidated live view now lives in ONE always-visible
`SetupSummaryRail` pinned to the RIGHT of the painted setup scene — the boxes
themselves show only their titles there, so a half-transparent right rail is the
at-a-glance summary, each chip one click into its box. The hub windows carry no
summary strip anymore — pinned in `setup-hub.test.tsx` "Setup Hub — the summary
rail".)

Three rules keep the four windows from reading as four unconnected screens (each
mutation-checked; the first two fix real bugs, not cosmetics):

1. **A box never writes another box's key.** `customMode` — the key that makes
   the Game-mode box's Custom card active and that `advancedSettingsChanged`
   short-circuits on — belongs to the Game-mode box ALONE. Both map pickers
   (`MapPickModal.applyEntry`, the classic `MapPicker`) used to send it: a
   designed-map pick sent `customMode: true`, so choosing a map silently threw a
   BINH/Legacy/Tournament table into "Custom — your saved setup" and the Advanced
   box stopped reporting anything but "Custom setup file"; a built-in pick sent
   `customMode: false`, dropping a deliberately chosen Custom mode. Neither
   payload carries it any more (pinned in `map-pick-modal.test.tsx` with an
   explicit "the payload has no customMode key" assertion, and in
   `setup-draft-ui.test.tsx` for the classic picker).
2. **One reading of "a designed map is in play"** — `designedMapInPlay(options)`
   = `Boolean(options.customMap?.length)`, which is exactly what
   `createAdventureGameState` builds from. The Map box, the Map window's list /
   "✓ In play" marks and the classic picker all take it, so a 0-tile plan can no
   longer be marked in play in one surface while the Map box (and the real game)
   still show the scenario sheet. Both pickers additionally REFUSE an empty saved
   map (`designedMapBlockers`) — applying it would have been a silent no-op.
3. **The right-of-scene summary rail shows all four boxes' live values**
   (`SetupSummaryRail`, fed by the pure `setupHubNavItems`): a half-transparent
   `position: fixed` panel (`.setupSummaryRail`, z 9 — above the full-screen
   `.setupHubGrid` scene layer at z 8 that would otherwise steal its clicks, far
   below the hub-window backdrop at 210), vertically centered on the right edge,
   with all four chips actionable (each opens its box's window; no "you are here"
   chip — none is current on the scene). Because it reads the SAME derivations the
   boxes render, it can never disagree with them — that shared reading IS the
   connection, always visible without opening a window. Hidden under `.phoneMode`
   (the phone 2×2 box grid is the surface there). Pure presentation: it dispatches
   only the box-open callback.

Two smaller de-duplications ride along:
- The **Custom-setting FILE panel** (`PersonalCustomSettingsPanel`) now exists
  ONCE, in the Game-mode window, and renders in EVERY mode — saving is what puts
  the table in Custom mode (`saveToFile` sends `customMode: true`), so gating it
  behind already being in Custom mode was circular. Its old second copy inside
  the Map & Setup picker kept its own name field, so a name typed in one was
  ignored by the other's Save button. The picker now links to the Game-mode box
  instead (CONTROL-pinned in `setup-hub.test.tsx`).
- The **Map window warns what a map pick does to the SEATS** — a designed map
  opens the count it was built for and a scenario sheet clamps to its own
  ceiling, so closing seats take their faction/hero picks with them. Predicted
  with the engine's own `clampSeatCount` (now exported for exactly this), never a
  UI re-implementation.

Leading with what does NOT run / deliberate limits:
- **The Advanced window still hosts the WHOLE classic `GameOptionsPanel`** (all
  four tabs), so its mode grid, Map picker, seat count and difficulty CHIP row
  are DUPLICATE SURFACES of the Game-mode / Map / Heroes boxes. They are the SAME
  components over the SAME `setupLobby.options`, so they cannot disagree, and
  each duplicated row now carries a `SameChoiceAsBoxNote` naming the owning box
  and jumping to it (the seat-count note renders only when the control itself
  does — a scenario with one legal seat count shows neither).
- **The hub window is a true MODAL**: the top-bar seat switcher (the local
  hot-seat convenience on an open table) is behind its backdrop, so switching
  seats needs the window closed. The Heroes window says so on a hot-seat table
  instead of leaving the player hunting; the e2e mirrors that flow.
- **The Advanced box's "Default vs Customized" badge compares only
  ADVANCED-owned keys** against a fresh LOBBY baseline for the active mode
  (`advancedSettingsChanged`): mode-box keys (customMode/ruleset/tournament*/wog/
  anime) and map-box keys (scenarioId/playerCount/customMap*/difficulty) never
  count. `customMode` short-circuits to "Custom setup file" (a loaded setting
  file IS a customized setup) — which is honest only because a map pick can no
  longer set that key behind the player's back (rule 1 above). LIMIT: the badge
  therefore says nothing about the map/mode/difficulty; the strip is where those
  are read. LIMIT: the baseline is the LOBBY baseline — a raw
  `defaultGameSetupOptions(scenario)` object, only reachable through a direct
  `createAdventureGameState` build, differs in `startingBuildings` and would read
  "Customized". (A fresh lobby pre-builds Citadel / Mage Guild / Bronze Dwelling;
  folding that in is what keeps an untouched table reading "Default".)
- **The map preview draws the REAL printed tile graphics (2026-07-25)** — no
  longer an outline-only sketch. `MapShapePreview` renders one `<image>` per tile
  in a background layer (before every outline, so a neighbour's art box can never
  cover an already-drawn ring) using the board's OWN art geometry: a
  `3·hexWidth × 5·hexSize` flower bounding box, `preserveAspectRatio="none"`, and
  `rotate(60°·rotation)` on face-up scans. The band-coloured `flowerOutline` ring,
  the seat numbers (now with a dark casing so they read over art) and the dashed
  underground stroke all stay on top; the band FILL drops to 0.10/0.14 opacity
  where art exists (the board's own `.hexCell.withArt` lens reading) and keeps its
  full 0.16/0.28 where it does not. `.mapShapePreviewSvg` grew 170px → 230px.
  Which graphic a tile shows comes from ONE shared resolver,
  `planTileArt` / `planTileArtRotation` in `map-shape-preview.tsx` — which the map
  DESIGNER board now also calls (its inline copy is gone), together with
  `planBackLabel` / `planBackArt` / `SEA_BAND_NUMERAL` / `SUB_BAND_NUMERAL`, all
  MOVED there from `map-designer.tsx` (which re-exports the two `planBack*` for its
  existing call sites) — so preview and designer can never disagree. Rules: a seat
  tile and every face-DOWN slot wear the band-correct printed BACK
  (`tileBackImage`, so a sea/underground Ⅵ–Ⅶ never wears the Ⅳ–Ⅴ back); a face-UP
  slot shows its pinned tile's own face scan (a face-up "one of these tiles" slot
  shows its FIRST candidate); a plain random face-up slot has no art and falls back
  to the band colour alone. A BUILT-IN scenario sheet pins only the shape (the tile
  in each slot is drawn at setup, and a seat's home tile depends on the faction), so
  every tile of a scenario preview wears its band's BACK — literally the physical
  board as it is laid out. STILL not drawn: guards, objects, tokens, field symbols,
  the Ⅵ–Ⅶ designations. Sea / underground slots in a built-in `layout` carry no
  band, so they take the Ⅳ–Ⅴ back. Pinned in `map-shape-preview.test.tsx`
  (per-band backs, the shared resolver's four rules, the image geometry, the
  art-before-outline layer order, the art-less fill CONTROL, rotation + its
  printed-back CONTROL) and `map-pick-modal.test.tsx`; verified in a real browser
  (all back webps 200 OK, 7/18-tile previews, per-band hrefs).
- **BUG FIXED — the difficulty bar's gold ring could stay on the OLD piece**
  (2026-07-25, reproduced on the deployed app). `.difficultyChessBtn` transitioned
  `border-color` + `background` and its `img` transitioned `filter` — the three
  properties carrying the whole "this is your difficulty" signal. When those
  transitions do not advance, the class had correctly moved (verified: `.selected`,
  `aria-pressed`, and the UNtransitioned `color` / `box-shadow` were all on the new
  button) while the gold ring, lighter fill and un-greyed chess piece stayed frozen
  on the previous one — so picking a map with difficulty Normal still READ as
  Impossible. FIX: the bar transitions `transform` ONLY; the picked state is
  expressed purely by untransitioned properties, plus a solid `outline` ring that
  cannot lag. Do NOT re-add a transition to `border-color` / `background` / `filter`
  here. jsdom cannot compute CSS, so the visible half was verified in a real
  browser (transitionProperty === "transform"; the ring moves with the class in
  the same frame).
- **The difficulty bar marks the SELECTED map's own difficulty** with a blue
  "map" tag (`.difficultyChessBtn.mapSet`, `DifficultyChessBar`'s `mapDifficulty`
  prop) so clicking through the list visibly moves something even before "Play
  this map" commits it — the gold `.selected` ring keeps following the LIVE lobby
  value only, and the two never land on one button. Pinned in
  `map-pick-modal.test.tsx` with a no-authored-difficulty CONTROL.
- **The difficulty bar says whether the SELECTED map brings a difficulty**
  (`.mapPickDifficultyNote`, 2026-07-25). The bar edits the LOBBY difficulty and
  deliberately does not move when you click through the list: only a map whose
  AUTHOR set one in the designer carries a difficulty, and it is applied by "Play
  this map", never by previewing. The note now says which of the two the selected
  map is ("X sets Hard — Play this map applies it, and you can still change it
  afterwards" / "X brings no difficulty of its own, so this stays on your pick"),
  so an unchanged bar reads as an answer instead of a dead control. Presentation
  only — it reads `record.preset.difficulty`, the seed-at-pick machinery in the
  "Map settings defaults" section is unchanged. HONEST LIMIT: all four built-in
  scenario sheets ship IDENTICAL setup values (same `startingResources` /
  `startingProduction` / `startingUnits` / `startingBuildings` /
  `farTiles.perPlayer`, and `defaultGameSetupOptions` hardcodes
  `difficulty: "impossible"`), so picking a built-in sheet has nothing of its own
  to apply — per-map difficulty exists ONLY on designed maps. Pinned in
  `map-pick-modal.test.tsx` ("says whether the SELECTED map brings a difficulty of
  its own", with the built-in sheet as the CONTROL).
- **The Map window's difficulty bar is the ONLY chess-piece surface**
  (`DIFFICULTY_CHESS_ICONS`, Pawn=Easy / Knight=Normal / Rook=Hard /
  King=Impossible). The icons are REAL painted art (2026-07-25, replacing the
  earlier procedural SVG→sharp silhouettes): `scripts/build-difficulty-chess-icons.mjs`
  cuts all four from ONE committed master sheet,
  `scripts/chess-art/difficulty-chess-master.webp` (provenance + the
  regeneration prompt in `scripts/chess-art/README.md`) — so they share a
  sculpt, a metal and a light direction. The cut is a border FLOOD FILL keyed on
  near-pure black (`FIELD_LEVEL` 12), never a luminance threshold: a generous
  threshold walks up each piece's shadow side and hollows it out, leaving an
  icon that only looks right over a dark panel. All four are scaled by one
  factor onto one baseline, so the set keeps a real Staunton set's proportions —
  which means the icon heights run pawn < ROOK < KNIGHT < king and deliberately
  do NOT track the difficulty order. Pinned in
  `src/data/assets/difficulty-chess-icons.test.ts` (256×256 + margins, the
  solid-cut fill ratio with the hollow cut as its measured control — 0.87–0.92
  vs 0.32–0.37 — the shared baseline and the chess proportions);
  mutation-checked by rebuilding at `FIELD_LEVEL` 60, which fails it.
- **No new map filters beyond source / player-count / name search**, and the
  designed-map list keeps the classic `validateCustomMapPlan` gate (an invalid map
  previews but cannot be applied).
- **Z-INDEX**: the hub backdrop sits at 210 — above the docked table chat (200),
  which used to cover a window's bottom-left corner. The two dialogs that open
  from INSIDE a hub window (hero info, normally 120; the WOG/Anime mod windows,
  130) are lifted to 220 / 230 for exactly that window's lifetime via
  `body:has(.setupHubBackdrop)`, so no other screen's stacking changes. Escape
  closes only the TOPMOST dialog (`SetupHubWindow` defers while a
  `.heroInfoBackdrop` / `.wogWindowBackdrop` is mounted). `HeroInfoModal` also
  had to start PORTALING to `<body>`: rendered inline it stayed trapped in the
  lobby's stacking context (`.setupLobby` z-index 1) and drew UNDER the window
  with its close button unclickable, whatever z-index it carried (pinned by the
  `parentElement === document.body` assertion in `setup-hub.test.tsx`).
- **Narrow viewports (≤820px) flow from the top instead of centering** and
  reserve `56vh` of bottom padding: the chat dock is fixed bottom-left at up to
  380px wide, so on a narrow column the centered auto-margins would park the
  Start button under the dock AND move it every time the dock grew a line.
- **Phone mode**: the boxes stay 2×2 (smaller), and a hub window becomes a
  full-screen sheet with the Map layout stacked (list above, preview + info
  below). Those rules live in the `.phoneMode` block at the end of `globals.css`;
  the WINDOW ones take the `body:has(main.phoneMode)` form because the window
  portals to `<body>`, outside `<main>` (same `:has` dependency as the header
  collapse — a graceful no-op on old browsers).
- Bonus fix: `screen.tsx` referenced a `/assets/spell-icons/view-air.png` that
  never existed (a broken image on the Mulligan option row) — now the real
  `view_air.png`.

## Cinematic main menu (2026-08-08) — what runs vs. limits

`/menu` is a full-bleed looping video backdrop with the logo top-left and ONE
compact stack of art buttons on the right, in FOUR views (2026-08-09 —
"village refresh" added the singlePlayer submenu): **main** (Single player ·
Multiplayer · Map Editor · Miscellaneous · Logout) → **singlePlayer**
(Scenario · Campaign · Back) → **multiplayer** (Skirmish · Battle Test · Co-op ·
Back) → **miscellaneous** (Hall of Fame · Credits · Profile · Admin when the
account is an admin · Back). `view` is local component state (`useState`),
never routing — Back returns without a navigation. **Scenario mints the
private `sp-` computer room straight from the menu** (`createSinglePlayerRoom`
→ `/?room=…`, error surfaced in `.mainMenuScenarioError`); Campaign links to
`/story`; the classic `/single-player` page still exists (its two mode cards
were replaced by the same art buttons) and stays the Story-mode entry surface.
A **compact icon-only `MusicToggle`** (`.menuMusicToggle`, 2026-08-09) is
pinned near the top-right corner — `top: 54px` clears the Next DEV-TOOLS badge
that next.config.ts pins to the exact corner — and drives the same
localStorage-backed music store as the in-game table toggle (pinned in
`page.test.tsx`: compact form + the store really flips). Otherwise pure
presentation: no engine rule, no server call beyond the existing session
fetch + the Scenario room mint. Pinned in `src/app/menu/page.test.tsx`,
`src/app/menu/main-menu-media.test.ts` and
`src/app/menu/main-menu-video-motion.test.ts`.

Leading with what does NOT work / deliberate limits:
- **CO-OP IS A PLACEHOLDER, NOT A MODE.** There is no co-op anything in the
  engine, and `/play/page.tsx` reads NO query params — it always renders the
  ADVENTURE `RoomBrowser`. So `href="/play?mode=co-op"` lands on the very same
  lobby **Skirmish** does and the query string is inert. The button is labelled
  NOT IMPLEMENTED at its definition; the test asserts the href only so the
  placeholder cannot rot into a broken route. Wiring a real co-op mode, or
  dropping the button, is an open decision.
- **Profile is no longer gated to signed-in accounts** (it was, before the
  redesign — it is now a permanent entry in Miscellaneous so the submenu keeps
  its five-button shape). `/profile` handles that itself: accounts OFF →
  redirect to `/menu` (so for a guest the button visibly bounces straight
  back), signed out with accounts ON → `/login`. Never a crash, but a guest can
  click a button that returns them to where they were.
- **Every button's label is BAKED INTO its art** — there is no text node, so the
  accessible name is the element's `aria-label` and a dropped label leaves a
  nameless control. `page.test.tsx` walks all four views (17 buttons, admin
  included) asserting a non-empty `aria-label` plus `alt=""` + `aria-hidden` on
  the art. A missing webp is likewise not a cosmetic gap but a BLANK button,
  which is why the files are pinned on disk.
- **jsdom cannot compute CSS**, so nothing here proves a pixel: the two
  `.mainMenuShell` CSS blocks (one near the top of `globals.css`, one appended at
  the very end) are unverified by any browser test, and the first block still
  carries rules for classes the JSX no longer renders (`.menuNavIcon`,
  `.menuNavText`, `.menuNavLabel`, `.menuNavHeroArt`, `.menuNavButtonHeroes`,
  `.menuNavLogout`) plus three rules the end block overrides. Inert, not deleted.
- **The end block sits AFTER the delimited PHONE UI MODE block**, breaking that
  block's "last thing in the file" convention. Harmless today — every selector is
  `.mainMenuShell`-scoped and the menu shell never carries `.phoneMode` — but a
  future rule added there could beat a phone rule.
- The site masthead and footer notice are hidden on this page
  (`.appShell:has(.mainMenuShell) > .topBar/.footerNotice`), and the two stale
  assertions in `tests/e2e/menu-flow.spec.ts` — a `toBeDisabled()` on Single
  player (a `<Link>`, not a disabled button) and a `heading` named "Heroes III —
  The Board Game" (the shell renders the wordmark IMAGE, no `<h1>`, since the
  page passes no `title`) — predate this redesign and are unfixed. E2E does not
  run in CI (only `deploy-partykit` / `sync-media-r2`), so they are inert.

What runs (each with a failing-if-removed test, all mutation-checked):
- **The loop autoplays MUTED** (`autoPlay muted loop playsInline`, `poster`,
  `preload="auto"`): a missing `muted` means browsers block autoplay outright and
  the backdrop silently dies. The mp4 carries NO audio track at all.
- **The still art slot renders UNDER the video, always** (`MenuShell` used to
  render one OR the other): it is the fallback that shows through on a slow or
  failed video load, an unsupported codec, under reduced motion, and on a narrow
  viewport (below). It costs no extra request — it is the same file the video
  fetches as its `poster`. On the main menu that file is the dedicated
  `main-menu-fallback.webp` (1600×1069), passed via `MenuShell`'s `videoFallback`
  prop; a screen that passes no `videoFallback` keeps its still ART SLOT.
- **A NARROW viewport (≤820px) never MOUNTS the loop, so it never downloads it**
  (`useVideoBackdropAllowed`, menu-shell.tsx). The branch shipped this as a
  CSS-only `@media (max-width: 820px) { … display: none }` claiming "no video
  decoding" — but this repo already learned (the setup-scene playlist) that a
  `display: none` video with `preload="auto"` still fetches the WHOLE file, so
  CSS could not fix it. The CSS rule is kept as belt-and-braces (it stops the
  decode) with an honest comment; the gate is the unmounted element. It is a
  `useSyncExternalStore` over `matchMedia` whose **server snapshot is `false`**,
  because MenuShell IS server-rendered and a server frame cannot know the
  viewport: emitting the `<video>` into the SSR HTML would let the preload
  scanner start a phone's download before React ever hydrates. React uses that
  same snapshot during HYDRATION, so the server frame and the hydrating render
  agree (no mismatch) and a wide viewport gets the loop on the very next render —
  one render against a download that takes seconds, with the still already
  painted. The subscription mounts/unmounts it across the breakpoint, and a
  missing `matchMedia` assumes a wide viewport (the historical behaviour). Do NOT
  "simplify" this to `useState` + a setState-in-effect: that is the shape
  `react-hooks/set-state-in-effect` rejects. Screens that pass no `videoBackdrop`
  are untouched. Pinned in `menu-shell.test.tsx` ("a narrow viewport never loads
  the backdrop video": no `<video>` at all + still art present, a wide CONTROL, a
  `renderToStaticMarkup` server-frame case, the mid-session resize both ways,
  listener cleanup, the no-matchMedia fallback, and a no-videoBackdrop CONTROL);
  mutation-checked — dropping the gate fails 3, a `true` server snapshot fails
  the server-frame case, a subscription that never listens fails 2.
- **`prefers-reduced-motion: reduce` really hides the video** (revealing that
  still). This was BROKEN as shipped: the reduced-motion rule sat near the top of
  `globals.css` and the end block then set `display: block !important` on the
  same selector, so the 20-second loop played for everyone. A media query carries
  NO specificity, so the fix has two halves — no `!important` on any `display`
  for the video, and the reduced-motion rule must come LAST in source order among
  the video's `display` declarations. Both are pinned by a CSS-TEXT test
  (`main-menu-video-motion.test.ts`), the only way to see a cascade tie in jsdom.
  Do not move that rule earlier or re-add `!important`.
- **MEDIA WEIGHT is capped by test.** The generated art shipped at ~22MB for one
  cold visit (13 buttons at 1536×1024 / 114–311KB, backdrop 1920×1080 / 19.3MB);
  it is now 768×512 webp q82 (26–74KB; the village-refresh additions —
  scenario / campaign / battle-test-fire / co-op-tactics — were recompressed to
  the same q82 standard on 2026-08-09, and the replaced battle-test / co-op /
  vs-computer / single-player-campaign files were DELETED as unreferenced)
  plus a 2.2MB CRF-28 mp4 and the 306KB fallback still — and
  a narrow viewport skips the mp4 entirely. The buttons never paint wider than
  ~310 CSS px (`.menuShellPanel.bare` is `clamp(230px, 24vw, 310px)` and
  `.menuNavArt` is `contain`-fitted), so 768px is already ≥2× for retina.
  `main-menu-media.test.ts` enforces webp + alpha + a 768px width ceiling + a
  512px floor + per-file and whole-set byte ceilings; for the mp4: a 6MB
  ceiling, `moov` before `mdat` (faststart) and NO audio atom; and for
  `main-menu-fallback.webp` a 340KB ceiling with a 1280–1920px width band (it is
  fetched on EVERY visit as the poster, and IS the whole backdrop on a narrow
  viewport). The still was re-encoded with the repo's own scenery standard —
  sharp `{ quality: 80, effort: 6, smartSubsample: true }`, dimensions and alpha
  unchanged (401KB → 306KB, SSIM 0.966); it is an already-lossy master, so a
  bigger saving costs visible quality on a full-bleed, ken-burns-zoomed plate.
- **RE-ENCODING THE LOOP: preserve the frames or the seamless loop breaks.** The
  v6 file is authored to meet itself (1280×720, 24fps, 19.9167s, 478 frames,
  ~2.2MB, silent). Use
  `ffmpeg -i <src> -an -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p
  -fps_mode passthrough -movflags +faststart <out>` and re-verify frame count,
  fps, duration and that the first packet is a keyframe against the SOURCE before
  committing. `scripts/compress-media.mjs` deliberately skips mp4 — never point it
  at this file.

## First-round rules, Cove City Hall & bank/opponent UI (BINH house rules) — what runs

Six additions; each engine rule fails a named test if its wiring is removed.

- **First-round hand discards return to your OWN deck, not the discard pile.**
  During round 1 (`state.round === 1`) a card discarded in the opening hand
  refresh (`refreshHand`, `adventure-reducer.ts`) is placed at the BOTTOM of the
  player's `deck` (index 0; the top is the last element) instead of on
  `player.discard` — so an early mulligan does not strand cards in the discard
  for the whole first deck cycle, and (bottom placement) the immediate
  draw-up-to-limit never just hands the same cards back. From round 2 on, discards
  go to the discard pile as normal. Pinned in `first-round-hand-discard.test.ts`
  (round-1 → deck / later-round → discard CONTROL) and `adventure.test.ts`.
- **Each shared deck starts with one card face-up on its discard pile.** At game
  setup (`makeSharedDecks`, `adventure-setup.ts`) every shared deck (Abilities,
  Spells, Artifacts — and their BINH split variants spells-expert /
  artifacts-minor/major/relic) flips its top card onto its discard pile, so each
  discard pile shows one card from round 1. No card is lost — it stays in the
  deck's discard/draw cycle. CONSEQUENCE (a real effect, not decoration): because
  the discard-top is now non-empty, the FIRST search of a deck offers the normal
  "Search the deck, or take its top discard?" option (`openSharedDeckSearch`) —
  the seeded card is a genuine, takeable discard card (subject to
  `canAcquireSharedDeckCard`; a low-level hero only ever searches its allowed-tier
  deck, so it never reaches a high-tier seed's take-option). Pinned in
  `shared-deck-discard-seed.test.ts` (one card of the right kind on every shared
  discard, deck total conserved) and `adventure.test.ts`.
- **Cove City Hall fires on the RESOURCE round, not the Astrologers' round.**
  `cove.city_hall` (`core.ts`) is now a `RESOURCE_ROUND_CHOICE` (the 4-gold /
  remove-an-Artifact-for-1-XP choice) like every other faction's City Hall,
  overriding its printed "each Astrologers' round". The now-unused
  `ASTROLOGERS_ROUND_CHOICE` effect type + its handlers were removed. Pinned in
  `cove-content.test.ts` (queues on round 3 / a round-2 Astrologers CONTROL that
  stays silent) and `describe.test.ts`.
- **A tile's Creature Bank is drawn (known) BEFORE the tile is rotated.** On
  reveal, `beginTileRotation` (`adventure-reducer.ts`) calls
  `reserveCreatureBankForTile`, which normally PEEKS the top token of the
  matching tier pile and stashes it on `tile.reservedBankId`; Polish Bank Sizes
  instead stores both rolled peeks in `tile.reservedBankOptions`, opens the
  mandatory A/B choice immediately, and keeps only the chosen candidate before
  rotation becomes legal. This is still a peek, never a pop: the chosen token is
  consumed by id only after rotation places it, so a Blocked Field lost to a
  Subterranean Gate cannot strand a token. The rotation preview then shows the
  chosen bank's art/name/coin on its Blocked Field. Pinned in
  `creature-bank-combat.test.ts` ("reserved (known) before the tile is rotated":
  reservedBankId set before rotation with the pile intact; the placed bank EQUALS
  the reserved one on accept; decline leaves the pile intact; both clear the
  reservation).
- **A Creature Bank field draws NO borders — ALWAYS (2026-08-09; the old
  `showBankBorders` toolbar toggle is REMOVED).** `getTileBorderSegments`
  (`borders.ts`) suppresses EVERY line touching a bank / Gate-carve / Field
  Override hex — the printed ring/arc AND designer `extraBorders`/`borderEdges`,
  whichever hex frame encoded them (`segmentTouchesSuppressedSlot` filters by
  physical adjacency). MOVEMENT matches (the invisible-wall audit fix):
  `fieldNeverWearsBorders` (adventure.ts — bank / `isBlockedFieldCarve` /
  `isFieldOverrideLocation`) is an edge-level early-out in
  `isDesignedEdgeSealedBetween`, because per-side gating was DEAD for tile-level
  inner edges — the edge's two encodings fold to ONE canonical code, so the
  plain neighbour's frame still matched and sealed a crossing the board no
  longer drew. Pinned in `multi-target.test.ts` ("a placed Creature Bank stays
  border-free"), `module-gate-board.test.tsx` (designer edges removed too) and
  `designed-borders.test.ts` ("designer edges never seal a runtime border-free
  hex" — bank/gates/FO open BOTH ways, a sibling designed edge still seals as
  the scope CONTROL). CONSEQUENCE (deliberate): a designer yellow edge drawn
  touching a hex that later carves into a bank/Gate/Field Override is INERT for
  movement AND invisible — the designer wall gives way to the runtime object.
  - **The bank being border-free OPENS its outer edge for Tile discovery.** A
    bank replaces a Blocked Field whose slot usually keeps a sealed `outerImpassable`
    arc, which used to block a hero standing on the bank from flipping the
    adjacent face-down Tile. Since a bank now reads as fully open, the discovery
    gate takes a bank exception: `heroFieldSealedForDiscovery` (`adventure.ts`) =
    `isOuterEdgeSealed` UNLESS the hero's field is a `creature_bank`, used by
    `revealTileForHero` (the `DISCOVER_TILE` handler) and `canHeroDiscoverAdjacentTile`
    (the legal-actions offer). `isOuterEdgeSealed` itself is untouched (its
    slot-primitive invariant holds). Discovery only reveals the Tile; MOVING out
    of a bank across a Tile edge stays blocked by the bank's own `canCrossEdge`
    rule ("reachable only from within its own Tile"). Pinned in `adventure.test.ts`
    ("lets a hero standing on a (border-free) Creature Bank discover across that
    edge", with the plain-sealed-field refusal as the in-test CONTROL).
- **Opponent info panel (map AND combat).** `OpponentInfoDock` / `OpponentInfoModal`
  (`components/adventure/opponent-info.tsx`) render a per-opponent button that
  opens a read-only panel of that opponent's PUBLIC state — resources (+income),
  hero (level + `HeroBoard`), current unit deck (`ArmyPanel`) and buildings — all
  already public (player-view masks only hands/decks/spell-books), so this is a
  pure presentation layer with no engine change. Rendered in the map left rail and
  the combat card strip (`page.tsx`). Render-tested in `opponent-info.test.tsx`.

## Pre-hit heals vs Spells/specialties & map-designer timed events — what runs

Two additions; each engine claim fails a named test if its wiring is removed.

- **Pre-hit heals (First Aid Tent, First Aid ability, Cure) fire against
  damaging Spells AND specialty blasts, not only declared attacks.** A
  `SPELL_CAST_STARTED` window whose pending cast would damage a player's units
  (primary target, predicted blast, or Chain Lightning primary —
  `playerThreatenedByPendingDamage`) offers that player the shared heal package
  (`preHitHealReactions`); a non-damaging cast (Haste) never opens a forced heal
  window. Frost Ring / Meteor Shower specialties (`AREA_DAMAGE_PICK_ADJACENT` /
  `AREA_DAMAGE_ALL_ADJACENT` card plays) are DEFERRED onto the resolution stack
  (`tryDeferSpecialtyDamageForHeals`) with a synthetic `SPELL_CAST_STARTED`
  window ONLY when a threatened player can actually heal — otherwise damage
  lands immediately as before. Cure as a reaction scales off standing spell
  Power and runs its cleanse; it counts against the per-round Spell limit.
  LIMITS: the synthetic specialty window is NOT a Spell cast — Resistance,
  Knowledge/Mysticism recall, Power boosts and the Brimstone cube are all gated
  to a real `CAST_SPELL` stack item (their reducer branches would no-op, eating
  the card). War-machine discard damage keeps its immediate path. Pinned in
  `pre-hit-heal-reactions.test.ts` (heal-before-damage event order, the
  no-heal/no-pause CONTROL, and the spell-hate gate with a real-Spell CONTROL).
- **Map-designer timed events are freeform** (`CustomMapPreset.timedEvents`, cap
  `MAX_TIMED_EVENTS` = 32): any round 1–30 × any effect — resources (positive =
  every player GAINS; NEGATIVE = every player LOSES that much, the treasury
  floored at 0 so a player never goes negative; clamp −50..50, ≥1 nonzero),
  hero **experience** (clamp 1–5, every live player's MAIN hero gains it through
  the NORMAL `gainExperience` pipeline — level-ups, hand-limit / expert-use
  bumps, Ability searches, specialty cards, commander points, Learning all
  ride it, never a hand-incremented level), deck Search, clear-cubes (Windmill
  also re-opens Factory Prospector, Water Wheel also Derrick), ±1 morale,
  +movement (stacks on the round's refreshed MPs), Treasure/Resource dice
  (queued per live player), or a feed note. Any entry may also carry an optional
  **`repeatEveryRounds`** (int 2–10): it fires at `round`, then every N rounds
  after (`round`, `round+N`, `round+2N`, …) for the rest of the game (HoMM3
  weekly events) — absent = a one-shot, byte-identical to a legacy preset; each
  firing appends a DISTINCT `MAP_PRESET_TRIGGERED` id so the overlay never
  swallows a repeat (`isTimedEventDue`). Eliminated
  seats and their heroes are skipped. Fired by `applyCustomMapTimedEvents` at
  round start; sanitization clamps amounts, keeps `repeatEveryRounds` only as an
  int ≥2 (99→10, 1 / non-int DROPPED → one-shot), keeps a legacy positive-only
  resources entry byte-identical, and drops unknown kinds
  (`custom-setup.test.ts`, `map-preset.ts`). A second cube-clear kind,
  **`clear_tile_cubes`**, re-opens EVERY black cube on Tiles of chosen groups
  (player-facing bands Ⅰ / Ⅱ–Ⅲ / Ⅳ–Ⅴ / Ⅵ–Ⅶ / Sea / Underground, filtered by
  `MapTileState.group`) with an optional "skip tiles containing a Settlement"
  flag — but NEVER a Creature Bank (it keeps its defeat cube — hard rule) nor
  the Grail / Dragon Utopia victory fields (conservative safety, mirroring the
  token-placement exclusions); standalone designer hexes (no backing tile) are
  skipped naturally. INTENDED consequence: a re-opened field with a printed
  `difficulty` flips `isFieldGuarded` back to true, so it re-fights fresh guards
  and re-earns its reward — the designer's re-open tool. Sanitizer dedupes /
  drops invalid groups (empty → effect dropped) and keeps the flag only as a
  real `=== true`; band labels live in `TILE_GROUP_BAND_LABELS` (adventure.ts,
  Sea/Underground disambiguated from the shared Ⅳ–Ⅴ back numeral). Pinned in
  `custom-setup.test.ts` (group filter, bank/victory exclusions, settlement flag
  with its control, re-guard, no-preset twin, sanitizer) and
  `map-preset-editor.test.tsx` (group chips + skip-settlement checkbox). Each
  firing pops the ornate
  `MapEventOverlay` on every client (one card per batch, once per event id,
  never replayed on reconnect — `map-event-overlay.test.tsx`); the editor's
  per-event cards (round rail, kind dropdown, a "Repeat" every-N-rounds select,
  params incl. negative resource losses + the experience amount, a live preview
  that spells the schedule "round 4, then every 3 rounds" and "lose N gold",
  warnings) are pinned in `map-preset-editor.test.tsx`. The designer's face-down tiles
  draw band-correct printed BACKS (sea/underground Ⅵ–Ⅶ never wear Ⅳ–Ⅴ art;
  `planBackArt`, `map-designer.test.tsx`).

## Neutral-combat & Sorrow refinements (BINH house rules) — what runs

Three engine-enforced additions; each fails a named test if its wiring is removed.

- **Mysticism EXPERT recalls the "pow" cards paid for a Sorrow.** A silver/gold
  Sorrow is paid with power-source ("pow") cards. When the caster then plays
  Mysticism into the kept-open activation-skip window, Mysticism's expert side
  ("also take back all other cards played together with it") now sweeps those pow
  cards back to hand along with the Sorrow — not just the Sorrow. The paid cards
  are captured on `combat.pendingActivationSkipRecall.powerCardIds` when the
  window is held open and returned from the discard in the RECALL_SPELL take-back
  handler (reducer.ts). Knowledge and BASIC Mysticism leave the pow cards spent
  (the control). Pinned in `rampart-inferno-spells.test.ts` ("expert Mysticism
  recalls every pow card paid for the Sorrow", with a basic-Mysticism control).

- **A +Movement card can extend a neutral combat.** Boots of Speed, the Logistics
  ability's expert side, Dessa's Logistics IV/VI, Shield of Naval Glory's sea
  side, AND Equestrian's Gloves' "+1 movement" side — normally map-only — may be
  played in a neutral combat's
  continue-or-retreat window (`awaitingContinue`) to top up `hero.movementPoints`,
  so a hero OUT of movement can buy another round (spend 1 on
  `CONTINUE_NEUTRAL_COMBAT`) instead of being forced to retreat. Optional: the
  player chooses to use it or not at the end of each round. `heroMovementGrantOption`
  (effects.ts) detects the movement side by EFFECT KIND (`GAIN_HERO_MOVEMENT`),
  wherever it sits in a `CHOOSE_ONE` — so the Gloves' movement side at option
  index 1 is caught exactly like Boots' at index 0; the offer lives in the
  awaitingContinue gate (legal-actions.ts, gated on the same expert-use / sea-tile
  conditions the reducer checks); playCard waives `mapOnly` ONLY for that exact
  window (`continueMovementTopUp`) and keeps the window open afterwards. Pinned in
  `neutral-combat-movement-extend.test.ts` (Boots, Equestrian's Gloves, and the
  expert-only Logistics sibling, with a normal-combat control that mapOnly still
  holds) and the UI in `combat-round-over-prompt.test.tsx`.

- **The player picks a neutral's move destination.** When a neutral must MOVE to
  reach the target it will attack and several legal cells reach it, the attacking
  player picks which — a `choose-destination` intent (`neutral-ai.ts`) →
  `neutral-destination` OPTION_CHOICE (reducer.ts) → resume the activation with
  the picked cell forced. It still attacks the rules-fixed target (target
  selection is unchanged); only the landing cell is the player's choice. A single
  legal cell needs no prompt (move-and-attack directly), and an already-adjacent
  guard just attacks. The offered cells are the obstacle-aware reachable set
  (`getLegalMoveDestinations` → `getReachableDestinations`): a GROUND guard's
  offer drops cells blocked or severed by Combat Obstacles, a FLYING guard's
  offer includes cells reachable only by crossing over obstacles (but never a
  cell it cannot land on), and a RANGED guard shoots from where it stands and is
  never prompted. Composes with the existing "player breaks a target tie" choice:
  pick the target, THEN the cell. Board cells are clickable (board.tsx, reusing
  the teleport cell-picker). Pinned in `neutral-move-destination.test.ts`
  (unit-level intents, the obstacle/flying/ranged cases each with a control, and
  an end-to-end test proving the guard lands on the CELL the player picked), the
  composition in `adventure.test.ts`, and the board wiring in `board.test.tsx`.

## Manual guard relocation, first-round Mulligan, Wait/Defend queue, altered-guard warning — what runs

Four additions; each engine rule fails a named test if its wiring is removed.

- **Manual guard control now RELOCATES the guards pre-battle**
  (`GameSetupOptions.manualGuardControl`, default OFF). On top of the existing
  mid-combat command, the FIGHTER now first gets the pre-battle formation-SORT
  window (the same `pendingNeutralPlacement` machinery PvP Neutral Control uses):
  `openNeutralPlacementWindow` opens for `neutralCombatControllerId` (pvp ??
  manual), so the fighter may move/swap the revealed guards within the defender's
  two rows, or "Let the AI place them" (`AUTO_NEUTRAL_PLACEMENT` — resets to the
  rulebook `placeNeutralUnits` auto-placement, window stays open). ONE new rule:
  a SHOOTER (ranged unit) is restricted to `DEFENDER_BACKLINE` — `placeNeutralGuard`
  and `addNeutralPlacementActions` gate the move AND the swap partner through
  `neutralFormationCellsForGuard` (manual-only via `neutralPlacementIsManual`, i.e.
  the controller IS the fighter — a PvP opponent keeps ANY defender-row cell and
  gets no auto-reset). The board drag narrows the drop highlights to a dragged
  shooter's back-row cells (`onDragStart`/`onDragEnd` added to `beginUnitPointerDrag`).
  Computer fighters never open the window (`manualGuardControllerId` returns null).
  Pinned in `manual-guard-control.test.ts` (open/shooter/swap/auto-reset, each with
  a CONTROL) and `pvp-neutral-control.test.ts` (the PvP-side CONTROLs: no shooter
  restriction, no AI-reset offer).
- **First-round hand Mulligan** (`GameSetupOptions.startingHandMulligan`,
  **default ON**; frozen onto `adventure.startingHandMulligan`, absent/undefined
  treated as ON for legacy snapshots). It now gates ONLY the round-1
  start-of-turn hand step: **ON** = the "Discard and draw new" option is offered
  in round 1 (normal play — discards return to the BOTTOM of your own deck per
  the first-round-discard rule above); **OFF** = round-1 `REFRESH_HAND` rejects a
  non-empty discard (draw-only opening hand), enforced in `refreshHand` (a forced
  over-limit `needsHandRefresh` discard still runs so a hand effect cannot trap
  the seat). The old per-card `MULLIGAN_CARD` "replace up to
  `FIRST_ROUND_MULLIGAN_LIMIT` cards after the draw" flow is **retired**:
  `finalizeStartOfTurnHand` seeds `firstRoundMulligansLeft = 0`, so
  `canMulliganStartingHand` is always false and the action is never offered (the
  handler stays for legacy snapshots). Pinned in `starting-hand-mulligan.test.ts`
  (default-on R1 discard allowed, mode-off rejects, round-2 / forced-refresh
  CONTROLs).
- **Wait/Defend combat-queue markers (Polish Wait presentation).** The initiative
  rail (`getActivationOrder`) now RE-QUEUES a Waited unit at the TAIL of the round
  (highest wait token first) instead of stranding it in the greyed "done" bucket —
  so the queue shows waited units re-activating last, like the PC game. DISPLAY
  ONLY (the engine order via `getActivationStep` is unchanged; byte-identical when
  nothing waited). The rail marks a Waited card with an hourglass (+ wait token, un-
  greyed with an amber ring) and a Defending card with a shield; the board unit
  card gains an hourglass "Wait" badge. Pinned in `combat-activation-order.test.ts`
  (the tail re-queue, highest-token-first, with an unwaited CONTROL),
  `initiative-rail.test.tsx` and `board.test.tsx`.
- **Designer altered-guard: shown on the map + a pre-attack warning.** A field
  whose neutral guard was set by the MAP DESIGNER (a custom army, a custom level,
  or a map-wide settlement/obelisk guard) now carries `field.designedGuard` (set by
  `applyCustomGuardToField` + the center-hex stamp, cleared with the guard; a
  printed guard is NEVER flagged). `designedGuardPreview(field)` returns the exact
  army (custom units) or just the Field-Difficulty level (a level/settlement army
  is drawn at fight time). The map hex gets an amber outline + a gear marker and a
  tooltip listing the army; the move-confirm float warns with the army and its
  button becomes "Attack" (Cancel backs out with no move) for an altered fight
  only. LIMIT: the warning rides the deliberate map-move confirm — a teleport
  (Dimension Door) onto an altered field is not gated. Pinned in
  `designed-guard-preview.test.ts` (marker + preview, printed-guard CONTROL),
  `obelisk-roles.test.ts` (settlement integration) and `map-floats-board.test.tsx`
  (the map marker + the warn/Attack float, with a printed-guard CONTROL).

## Medic specialty map draw-only play + paralysis cleanse in the window (2026-08-04)

Reported on Rion (Battlefield Medic): "Its an instant, I should be able to play
it before counter attack (reaction window heal). In fact I should be able to play
it also in adventure map to draw cards — just skip the first effect (similar to
offense and armourer)." Leading with what was ALREADY working, then the two
genuine holes that were fixed. Behaviour pinned in
`src/engine/medic-specialty-heal-draw.test.ts` (each claim mutation-checked with
a CONTROL).

- **ALREADY WORKING (no change, now pinned for the first time): the
  reaction-window heal, including before the COUNTER-ATTACK.** Rion I/IV/VI (and
  Astra's Cure, Gem's First Aid IV, every rethemed clone) were already in the
  shared `preHitHealReactions` package via the effect-shape scan in
  `instantHealSpellReactions` — offered on the `UNIT_ATTACK_DECLARED` window of
  an incoming attack AND on the RETALIATION's own window
  (`triggerEvent.isRetaliation`), with `applyReactionPlayCore`'s heal branch
  landing the mend BEFORE the paused hit resolves. Verified end-to-end: a Pack
  one point from a lethal counter-attack survives un-flipped with the heal and is
  flipped down without it.
- **FIXED — the "Remove paralysis" side was unplayable in the window on an
  undamaged unit.** `instantHealSpellReactions` filtered candidate targets on
  `damage > 0` alone, so Rion IV/VI's printed cleanse (and the Pendant of Second
  Sight's) could never be aimed at the full-health PARALYSED unit it exists to
  free. A face whose `effect.removeParalysis` is set now also accepts a unit
  carrying a Paralysis token; the damage gate still applies to plain heals (a
  nothing-wounded, nothing-paralysed board offers no medic reaction — CONTROL).
- **FIXED — the medic instants are now playable on the adventure MAP purely for
  their draw rider.** ONE shared read, `healDrawOnlyRider(effect)`
  (`legal-actions.ts`), returns the printed "then draw N cards" of a
  `HEAL_DAMAGE` / `HEAL_DAMAGE_AND_REMOVE_EFFECTS` face and is used by BOTH the
  offer (`addTurnCardActions` — one top-level offer, plus one per printed
  CHOOSE_ONE side, each paying that side's printed cost) and the resolution
  (`playCard`'s target-less draw branch), so they cannot disagree. Bypasses the
  card's combat `phaseLimit` exactly like the combat draw-only Offense/Armorer/
  Sorcery play bypasses its window. **The gate opens EXACTLY 13 cards** (pinned
  by an enumeration test over the whole card library): `specialty.rion.{1,4,6}`,
  `specialty.astra.1`, and the rethemed clones `specialty.aoko.{1,4,6}`,
  `specialty.sirius.{1,4,6}`, `specialty.molian.{1,4,6}`. A medic face with NO
  printed draw rider (Astra IV/VI, Gem IV, Vial of Lifeblood, Pendant of Second
  Sight) stays combat-only — CONTROL-pinned.
- **SWEEP (both halves, derived from the card library — not a per-card list).**
  (a) Heal reactions: an invariant test drives EVERY implemented card carrying a
  `HEAL_DAMAGE` / `HEAL_DAMAGE_AND_REMOVE_EFFECTS` face (25 today — Cure, First
  Aid, Rion/Astra/Gem and all their clones, Vial of Lifeblood, Pendant of Second
  Sight, Shaman's Puppet) through a real declared attack and asserts each is
  offered in the window, so a NEW heal card joins the invariant automatically.
  Nothing was stranded. NOTE (SUPERSEDED 2026-08-06 — see the draw-then-discard
  section below): Rion VI used to need a spare hand card, because its printed
  discard was an up-front `cost.discardCards`; it is now a post-draw
  `thenDiscard` rider, so VI is offered and playable as the LAST card in hand.
  (b) Draw riders: the ONLY other combat-only instants carrying one are
  Offense / Armorer / Sorcery + Armor of Wonder / Scales / Tunic
  (`ADD_COMBAT_STAT` / `ADD_SPELL_POWER` — already map draw-only), Shield of
  Naval Glory (`GAIN_HERO_MOVEMENT`, already map-playable), Deemer IV
  (`RESHUFFLE_DISCARD_THEN_DRAW`, already map-playable) and Kriv I/IV
  (`GAIN_RUNES`) — **the Kriv exemption was SUPERSEDED by the instant-lifecycle
  batch (2026-08, below)**: `instantDrawOnlyRider` now covers `GAIN_RUNES`, so
  the rune sides ARE offered as draw-only map plays (the runes fizzle, the draw
  resolves — Kriv IV's dedicated "become Rune-Empowered" MAP side stays its own
  separate real play).
- Deliberate LIMITS: the resolution gate is the TARGET-LESS play, never "no
  combat", so a Dwarf-negated or effect-ignoring combat play (both of which drop
  the resolved target while `action.target` still names a unit) keeps its
  existing no-op behaviour and draws NOTHING; the old "no combat draw-only
  offer" limit is likewise SUPERSEDED — first by the instant-lifecycle batch (a
  medic draw rider joins an EXISTING open reaction window as a `drawOnly`
  reaction) and then, **2026-08-08, twice more**: that join now also OPENS an
  attack window (see "Every instant OPENS an attack window" below), and a medic
  face whose printed heal has NO target is offered as a target-less draw-only
  play on the owner's OWN combat activation too (`healDrawOnlyRider` twin in
  `addPlayableCardActions`); and the AI scores the
  new map play at a deliberately low **300** (`card-policy.ts`, below the
  ~590-610 map economy/search families) so a Rion/Aoko/Sirius/Molian seat never
  dumps the specialty it wants for a combat heal — a real in-combat heal still
  outranks it (CONTROL).

## Medic VI draws BEFORE it discards · draw riders join open windows (2026-08-06)

User ruling: "Battle medic speciality I IV VI — first you draw cards, then
discards, and should work as reaction even when there is no need to heal, only
for card drawing effects. Check for other drawing cards too, they dont need
effects." Behaviour pinned in `src/engine/medic-specialty-heal-draw.test.ts`
(every claim mutation-checked, with CONTROLs) + the recast Rion VI cases in
`hero-specialty-levels.test.ts`.

Leading with what does NOT change / the deliberate limits:
- ~~**A draw rider still NEVER OPENS a reaction window of its own**~~ —
  **SUPERSEDED 2026-08-08** (see "Every instant OPENS an attack window" below).
  It used to read: the medic joins an ALREADY-open window; with nothing wounded
  and no other reaction at the table the attack resolves un-paused. That WAS the
  bug the user re-reported ("choice never appear properly") — in a neutral fight
  nothing else opens a window either. A draw rider now opens an ATTACK window
  (only an attack window; a cast / activation / die-settled window is
  unchanged).
- **No duplicate look-alike offer.** The draw-only twin is `utilityOnly`, so the
  shared trap-twin dedupe removes it whenever the REAL face is offered in the
  same window (a wounded unit ⇒ exactly ONE medic offer, the targeted heal; a
  pairable spell ⇒ exactly the real Sorcery Power plays). Both directions pinned.
- **Kriv's trap-twin suppression is untouched**: a card with a side that REALLY
  matches the window's printed trigger still gets no trigger-free utility joins.
  Only the CONDITIONAL "+Power crosses into an attack window" pseudo-match no
  longer counts as such a match (`powerCrossOverOnly`) — it was suppressing the
  OTHER side's draw on Deemer IV / Zydar I, which then offered nothing at all.
- **Two `applyDrawRiderThenDiscard` call sites are UNREACHABLE today and so
  unpinned** (kept, and commented as such, so a future `thenDiscard` face cannot
  silently lose its discard): `playCard`'s generic `drawOnly` branch and the
  `HEAL_DAMAGE_AND_REMOVE_EFFECTS` branch (no shipped Cure face prints a
  post-draw discard). NOTE 2026-08-08: the `drawOnly` PLAY_CARD BRANCH itself is
  now reachable for a medic face (the new own-turn combat draw-only twin), but
  its DISCARD line still is not — every `thenDiscard` face is a CHOOSE_ONE medic
  whose options always have a target, so it never takes the twin. The
  `hasPairableSpell` `!drawOnly` clause is likewise an unpinned safety guard (no
  spell-kind card carries a draw rider today).
- The AI is unchanged: both the map/combat `PLAY_CARD` and the in-window
  `PLAY_REACTION` draw-only plays already scored a flat **300**
  (`card.draw-rider-only`), below every real play — now pinned for the reaction.

What runs (each with a failing-if-removed test):
- **Rion VI (and the Aoko / Sirius / Molian clones) draws FIRST, then discards.**
  The printed "… then draw 2 cards and discard 1 card from your hand" is now a
  post-draw rider — `HEAL_DAMAGE.thenDiscard` (`state.ts`), read by the ONE
  shared `drawRiderThenDiscard` (`legal-actions.ts`) and resolved through the
  existing `openHandDiscardChoice` picker at every seam (reaction heal, reaction
  draw-only join, combat/map unit-targeted play, target-less map draw-only play)
  — NOT the up-front `cost.discardCards` it used to be. Consequences: the two
  cards it DRAWS are legal candidates for the pitch, and the specialty is
  offered and playable as the **LAST card in hand** (an affordability-gated cost
  made it dead there — the reported bug). The nested picker resolves inside a
  still-open reaction window (the Scholar precedent) and the window survives.
  A library invariant fails if a NEW face gates a draw RIDER behind an up-front
  discard cost; Charm of Mana's "**Discard** 2, then draw 3" (the draw is the
  whole effect, and the printed order really is discard-first) keeps its cost.
- **Every implemented draw-rider Instant can join an already-open window** — a
  library-derived sweep over all 83 of them (Bulwark holder, so Kriv's
  rune reaction is live), so a new one joins automatically. Two gaps it caught
  and fixed: Deemer IV / Zydar I (the Power pseudo-match above) and Sorcery /
  Scales of the Greater Basilisk / Tunic of the Cyclops King, whose "+Power" half
  is withheld in an attack window unless a pairable spell instant is held — which
  used to hide the printed DRAW with it. Those three now offer a basic-only
  "(draw only)" join straight into `reactions`, deduped away again as soon as the
  real Power play lands.
- **The paralysis-cleanse / reaction-heal behaviour from 2026-08-04 is unchanged**
  and still pinned (the heal lands before the counter-attack, a full-health
  PARALYSED unit is a legal cleanse target, the map draw-only play).

## Combat draw-only abilities, Knowledge recall & value-based Power costs (BINH house rules) — what runs

Five additions; each engine rule fails a named test if its wiring is removed.

- **Combat draw-only Sorcery / Offense / Armorer.** On your own combat
  activation (the active unit is yours and has not attacked), Sorcery
  (`ADD_SPELL_POWER`) / Offense / Armorer (`ADD_COMBAT_STAT`) — each a
  "+stat/+Power, then draw a card" ability — may be played JUST for the draw,
  with no attack/spell window open. The stat/Power fizzles (no stack, no target),
  only the "then draw" rider resolves. Offered as `combatDrawOnly` in
  `legal-actions.ts` (basic only — a fizzled stat wastes no crown); the draw
  fires in `playCard` when `!state.reactionWindow && state.stack.length === 0`.
  Pinned in `sorcery-draw-rider.test.ts` ("Combat draw-only …", with an
  off-turn CONTROL and the stat-fizzles assertion). **EXTENDED 2026-08-08 to
  medic heal faces**: a `HEAL_DAMAGE` face with a printed draw rider whose real
  play has NO legal target (Rion I / Astra I print `damagedOnly`, so nothing
  wounded = no target) is offered on the same own-activation terms as a
  target-less `drawOnly` twin — see "Every instant OPENS an attack window"
  above. It is WITHHELD whenever a real heal target exists (a heal draws too, so
  the twin would be a strictly-worse duplicate).
- **Sorcery banks +Power for the next spell if the unit has not moved.** A
  draw-only Sorcery played before the active unit has moved
  (`!movedThisActivation`) banks its Power on
  `combatStats.pendingDrawRiderSpellPower`; the NEXT spell cast consumes it in
  `performSpellCast` (folded into `stackItem.modifiers.spellPowerBonus`). Cleared
  on consume and each combat round. Pinned in `sorcery-draw-rider.test.ts` (bank
  + cast lands the +Power, with an already-moved CONTROL that banks nothing).
- **Knowledge / Mysticism recall ANY spell — combat AND map.** In combat
  the recall is the pre-existing `RECALL_SPELL` reaction to `SPELL_CAST_STARTED`
  (any spell you cast) and the attack-window instant recall; both basic and
  expert are offered whenever the caster holds Knowledge (crown for expert).
  Pinned in `knowledge-recall-instants.test.ts` (cast-window basic + expert,
  attack-window instants). On the map — where there is no per-turn spell limit —
  every resolved map Spell (View Air, Dimension Door, Fly, Town Portal, Water
  Walk, …) offers a recall from EVERY `RECALL_SPELL` card in hand: BASIC takes
  the Spell back for FREE (no crown). **Knowledge's EXPERT side is no longer
  offered on the map (2026-07-27)** — its only expert rider is a combat-round
  spell-limit bonus, which buys nothing outside combat, so paying a crown for it
  was a trap (the `map-movement-spells.test.ts` case that used to pin it is now
  the CONTROL asserting it is absent even with crowns in hand). **Mysticism**
  works on the map instead (`phaseLimit` gained `"map"`; it is still never a
  plain map PLAY — its `trigger` keeps it out of the card-play list): basic is
  the same free recall, and EXPERT (1 crown) additionally returns every other
  discardable card played into that cast — the hand power cards, a consumed
  School/Basic-Magic source, a Tome — from the discard to hand
  (`recallPlayedCardIds`, multiplicity preserved; a `removed`-zone card stays
  removed). Empowered Knowledge still recalls with its printed limit bonus.
  Wired in `offerMapSpellKnowledgeRecall` (adventure-reducer, the live path for
  all six tiered map spells) + `processPendingVisit`
  (`KNOWLEDGE_RECALL_MAP_SPELL` with a `mode`). Pinned in
  `map-spell-cast.test.ts` ("basic Mysticism … no crown", "expert Mysticism also
  recovers discardable support cards", the Tome case, and "regular Knowledge
  offers only its free basic recall" as the CONTROL),
  `map-movement-spells.test.ts` and `view-spells.test.ts`.
  **Dimension Door offers the recall BEFORE the teleport (2026-07-31).** Every
  OTHER map spell offers the recall AFTER its effect, which is fine because none
  opens a combat. Dimension Door's teleport resolves through a destination pick
  that can drop the hero into a FIGHT, so the after-effect recall reward was
  STRANDED behind that combat and only surfaced once the whole fight was played
  out (the reported bug). Now `applyMapSpellAtPower` special-cases a
  `DIMENSION_DOOR` best-tier effect: it offers the recall FIRST — exactly like a
  combat cast — then defers the teleport to a new `map-spell-effect` reward
  (`AdventureReward` union in state.ts; handled in `pumpAdventureQueues`, which
  calls the extracted `finalizeMapSpellEffect`). Because the recall reward is
  queued ahead of the effect reward, it always resolves first. CONNECTED FIX:
  recalling a Polish-Book Dimension Door hands the "Cast a Spell" enabler back
  to hand BEFORE the fight, so it is available to cast a Book spell in that
  combat (the combat cast-a-spell path itself is unchanged — offered whenever
  the caster's own unit activation window is open and a Cast a Spell is in hand,
  pinned in `polish-spell-book.test.ts`). When no recall card is in hand the
  effect resolves synchronously (unchanged). Pinned in `map-movement-spells.test.ts`
  ("Knowledge after a map Spell" reordered + "offers the recall BEFORE the
  teleport fight, never stranded behind the combat" — a live guarded landing;
  the immediate `pendingChoice === null` + pending recall discriminates the
  reorder from the old after-effect ordering).
  KNOWN DEAD TWIN: `playCard` in reducer.ts keeps a second copy of this offer
  for a non-tiered map Spell. Every map-playable Spell is currently tiered, so
  that copy is unreachable; it also only enumerates the FIRST `RECALL_SPELL`
  card in hand, so if a flat map Spell is ever added, make it match
  `offerMapSpellKnowledgeRecall` before relying on it.
  **Dimension Door is WHO-travels window → click the hex (2026-08-04).** User
  request: "you just need a window with Main Hero / Secondary Hero / Cancel, then
  you select location from the map accordingly" — the old flow listed EVERY
  reachable destination as a labeled button ("Teleport to Empty Field (2 fields
  away)" ×N). `openDimensionDoorChoice` now opens the `dimension-door-hero`
  OPTION_CHOICE on EVERY cast (it used to skip straight to the destinations with
  a lone eligible Hero): one option per own deployed Hero that has ≥1 legal
  destination at the RESOLVED Power, plus a trailing "Cancel (no teleport)".
  Answering with a Hero opens the unchanged `dimension-door` choice, whose
  destination is picked by CLICKING A GLOWING HEX (`pendingMapChoiceTargets` in
  screen.tsx — the `place-map-token` pattern, already wired); a dedicated
  PromptTray branch renders only the hint + Cancel there, so the destination
  buttons are gone from the UI. Leading with the LIMITS: teleport legality is
  BYTE-IDENTICAL (`dimensionDoorDestinations` untouched — same layer gate, same
  blocked/allied-hero rules, same `RESOLVE_TELEPORT_ARRIVAL`-style guard fight on
  a guarded landing) and the recall-BEFORE-teleport ordering above is unchanged
  (the recall resolves before even the Hero window opens); **Cancel NEVER refunds
  the Spell** at either step — the cast-then-boost pipeline already spent it, and
  the label says so; the engine still fills `options` with the per-destination
  labels index-aligned with `destinations` (Cancel last) because the AFK driver,
  the AI scorer and accessibility read them — only the tray stops rendering them,
  so do not drop that alignment; a hex standing for two options stays
  button-only (the pre-existing ambiguity guard); and the AI scores the Hero
  window through the GENERIC option tail ("Main Hero" +15 beats "Cancel" +8 —
  no bespoke policy), while the AFK/turn-timeout driver prefers the
  cancel-labelled offer and so ends the whole flow in ONE step (nobody moves,
  Spell stays spent) — neither can stall. Pinned in
  `map-movement-spells.test.ts` ("the WHO-travels window": the Main/Secondary/
  Cancel shape, a lone-Main-Hero CONTROL that the window still opens, a
  walled-in Hero omitted, hero-step Cancel moves nobody + no refund, and "lands
  the chosen Hero on the EXACT hex picked" — it picks the LAST candidate so a
  destinations[0] resolver fails), the secondary-teleports/main-untouched
  CONTROL in the same file, `map-spell-choice-board.test.tsx` (hero buttons at
  step 1; at step 2 ONLY the hint + Cancel — the "…fields away" labels asserted
  ABSENT — plus the hex click and the Cancel index dispatch) and
  `computer/choice-policy.test.ts` ("answers the Dimension Door hero window with
  a Hero, never Cancel"). All four halves mutation-checked.
- **Map Power-tier spells cast then add Power (like combat / Visions).** View
  Air, View Earth, Dimension Door, Fly, Water Walk and Town Portal are a single
  **Cast** action — no up-front tier pick / cost picker. The spell is spent,
  then a `map-spell-boost` window offers the same Power sources combat uses:
  hand/Book power-source discards, **School of Magic expert** (discard the
  permanent for +2 over the free basic +1, needs crown), and **Basic X Magic
  expert** (+3, once per cast, needs a crown — offered from BOTH the in-play
  fetch permanent AND a Basic X Magic card held in hand; USER RULING 2026-07-23
  "if use expert, must discard, on hand or on permanent": using it CONSUMES
  that source — the permanent is discarded, the hand card is played to the
  discard, both to the owner's DISCARD pile (recycles into their deck, never
  removed from the game), and every surface SAYS so (the offer labels + the
  CARD_PLAYED feed line) because a silent consumption reads as "my Basic Magic
  stopped working". The full lifecycle — basic fetch works → expert consumes →
  redraw + replay restores the fetch — is pinned in `basic-magic-expert.test.ts`
  "lifecycle"; combat parity via `USE_SCHOOL_FETCH_EXPERT`) — or "Resolve now".
  Highest printed tier with `minPower ≤ final Power` resolves (Orb doubling
  applied at resolve). Starting Power = standingSpellPower (school basic,
  Astrologers, Pandora, cultivation / grade / equipment) + specialty school
  auras + map Sorcery/Scales bank. Printed CHOOSE_ONE tiers stay as the effect
  table only. Pinned in `map-spell-cast.test.ts` (School expert, Basic Magic
  expert, wrong-school CONTROL) + `view-spells.test.ts` +
  `map-movement-spells.test.ts`.
  **Per-SIDE card offers (2026-07-26 overhaul, combat parity):** a hand power
  card is enumerated one offer per printed "+Power" SIDE
  (`spellPowerSidesOfCard` in effects.ts) — the Tunic of the Cyclops King
  offers BOTH "+2" and "+1, draw 1" (the collapsed single-value read that hid
  the +2 was the reported bug), Scales both "+3" and "+1, draw 1"; the draw
  rider fires only on the side actually played. Printed side costs are
  honoured: "Remove this card: +5" (Orb of Driving Rain / Silt / … on a
  matching-school spell) sends the card to `removed`, never the discard;
  Titan's Cuirass "Discard 1 card: +4" opens a MANDATORY cost-discard window
  (`mapSpellBoost.costDiscards` — Resolve is withheld, a forged resolve throws,
  an empty hand forgives); Breastplate of Brimstone's "up to 3, +1 each" joins
  the offers as optional cost discards. Expert sides honour the Empower crown
  waiver (`canPlayExpertMode` / `abilityExpertIsCrownFree` — an Empowered
  Sorcery plays its +2 crown-free on the map). The COST channel
  (`spellPowerValueOfCard`, Sorrow / lethal saves / pickers) now collapses to
  the best HONEST side: highest cost-free amount (Tunic pays 2, no draw — like
  its twin Scales' 3) and never a removeSelf side (discarding a relic for its
  +5 while it recycled was an exploit). All pinned in `map-spell-cast.test.ts`
  ("every printed power side is offered" + "cost valuation", each with
  CONTROLs).
  **Tome of X in the map tray (2026-07-27):** a matching Tome held in hand is
  offered as a `tome-max` boost — discard it to lift the cast straight to the
  spell's top breakpoint, the map timing window for the Tome's printed option B
  ("resolve at maximum Power without paying"). It is the SAME school gate combat
  uses (`schoolOnly` vs the spell's `spellSchools`, an `"any"` spell qualifies;
  a wrong-school Tome is not offered — CONTROL), it is a basic play (no crown),
  and it joins `inFlightCardIds` so expert Mysticism can buy it back. The
  option's `combatOnly` flag still keeps it out of the generic map card list —
  the open cast IS its only map window. Pinned in `map-spell-cast.test.ts`.
  **Orb doubling is shown, not just applied:** the choice now carries
  `effectivePower` (raw `power` × `getSchoolPowerMultiplier`) so the tray reads
  the number the cast will actually resolve at; the stored `power` stays RAW and
  `applyMapSpellAtPower` multiplies once at resolve (no double-count). The
  offer-exhaustion gate and the Tome's target both use the multiplied value.
  **UI:** the boost window is `MapSpellBoostModal`
  (`src/components/table/map-spell-boost-modal.tsx`) — since 2026-07-27 it is
  the combat REACTION TRAY (`.reactionTray.mapSpellPowerTray`, no modal
  backdrop, the map stays visible), one tile per source with a one-click "Add
  +N Power" and a "Commit Power & Cast" pass button. The printed tier LADDER was
  removed with the tier picker; because that also removed the "what does more
  Power buy" readout, the live meter now names the NEXT unreached breakpoint
  ("Next at Power 2: …", or "Highest effect reached") — otherwise adding Power
  is a blind choice. Every source tile still SAYS what it consumes (the
  "Expert — 1 crown" / "discards the permanent" / "discards the Tome" chips).
  Presentation only: every tile dispatches the exact index-aligned
  CHOOSE_OPTION, PromptTray excludes the context (three spots in screen.tsx).
  Pinned in `map-spell-boost-modal.test.tsx` (both Tunic sides render +
  dispatch, the next-tier readout + maxed CONTROL, cost window withholds
  Resolve, non-owner waiting strip, PromptTray-renders-nothing CONTROL).
  **Both Spell Books:** old stash Book may burn one Book Spell for +1 Power
  (once/turn) and Knowledge can return a Book-cast map Spell to the Book;
  Polish Book needs Cast a Spell to cast, never burns Book Spells for Power
  (spare Cast a Spell may still +1), Knowledge returns only Cast a Spell (spell
  stays used), lasting Fly stays used not ongoing — pinned in
  `map-spell-book-parity.test.ts` (each system + CONTROLs).
  **Map casts share the non-combat spell LIFECYCLE (2026-07-26).** A map cast
  now runs `noteMapSpellCast` (`src/engine/spell-lifecycle.ts`): it counts as a
  Spell cast THIS TURN (so Astrologers' Grim Warlock "+1 Power to the first
  spell each turn" lands on the first map Spell only — its starting Power is
  read BEFORE the counter moves) and fires ongoing `DRAW_ON_SPELL_CAST` riders.
  It calls `markEquipmentFirstSpellCast` for parity, but that is a NO-OP on the
  map: the Neon Microphone charge is gated on the hero being in combat, so a map
  cast can never eat it. It deliberately does NOT touch the
  combat-round spell limit / `anySpellCastThisRound`. Astrologers' Crazy Wizard
  (`maybeReturnFirstSpellToHand`, same module, shared with the combat path) now
  also returns the first RESOLVED map Spell to hand — but never an ONGOING one
  (Fly / Water Walk are held out of the discard, so there is nothing to return
  and the once-per-player charge is not spent). Pinned in `map-spell-cast.test.ts`
  ("Map casts share the non-combat spell lifecycle", each mutation-checked).
  **At the highest useful tier the window still offers "+Power, draw" riders**
  (combat parity) and nothing else — pure Power that can no longer raise the
  tier is filtered out (`map-spell-cast.test.ts`, "at the highest useful tier").
  **The OFFER GATE hides a map Spell no reachable tier can afford.** A
  destination-gated Spell (Dimension Door / Town Portal / View Earth) is offered
  only when SOME tier is both effect-playable (a landing / a controlled
  destination / a capturable enemy Mine in range — `dimensionDoorDestinations` /
  `townPortalDestinations` / `capturableEnemyMinesWithin`) AND affordable
  (`canAffordCardCost`). The affordability read must therefore agree with the
  cast's own starting Power: it counts standingSpellPower + `getSchoolPowerBonus`
  + the map bank + hand power sources, plus the crown-gated School-of-Magic
  expert half, the Basic X Magic +3 fetch, and (Polish Book) each SPARE "Cast a
  Spell" beyond the one the cast itself consumes. Each of those four is pinned
  with a CONTROL that hides the cast when the source is missing
  (`view-spells.test.ts` "View Earth reach scales with the Power paid",
  `map-spell-book-parity.test.ts` "a SPARE Cast a Spell pays the +1 …").
  KNOWN LIMIT (both directions, unfixed): the gate values a hand card through
  the flat cost channel (`spellPowerValueOfCard`), not through the per-SIDE
  read the boost window uses, so a card whose Power lives in a cost-BEARING or
  removeSelf side is under-counted — Sandals of the Saint ("discard X: +X" /
  "remove: +4") is valued at 0, so it cannot rescue a destination-gated Spell
  from being hidden, and Breastplate of Brimstone counts only its free +1. The
  opposite (offering a cast that then falls a tier short) is possible too. Only
  the Polish spare-enabler case above is corrected, because those cards sit in
  every Polish hand; the rest is a single relic's edge.
- **Expert Power payment (crown) works for combat reactions too.** The same
  value-based `powerCost` costs paid in combat — Sorrow's silver/gold skip,
  Alamar's / Jeddite's lethal-save Resurrection, any future one — accept
  `costCardModes` through the reaction path (`PLAY_REACTION` / `PLAY_REACTIONS`
  → `applyReactionPlayCore` → `payOptionCardCost`), so one Expert Power card +
  a crown reaches a Power-2 cost. Affordability (`canAffordCardCost`) greedily
  assigns available crowns to the sources that gain most, on the map AND in
  combat. The reaction cost pickers (`overlays.tsx` batch tray +
  `SpellBookSaveTile`) show a per-source Crown toggle and count each expert cost
  card against the crown budget. Pinned in `lethal-save-sources.test.ts` (silver
  save paid with one Expert Power + crown; a no-crown CONTROL rejects it) and
  `overlays.test.tsx` (the Crown toggle emits `costCardModes` and the engine
  accepts it, with a no-crown CONTROL that hides the toggle).

## Reinforcement discounts unified: stacking Legion + banked Necromancy (2026-07-27) — what runs vs. limits

Legion vouchers, the Necromancy half-cost and the Hill Fort −3 used to be RIVAL
sources resolved by "take the single biggest"; Necromancy and the Hill Fort also
forced a blocking pick-and-pay prompt on the spot. They are now ONE additive
pipeline. (The Hill Fort's own prompt CAME BACK on 2026-08-06 — as the default,
rule-independently — because banking it was invisible; see its section below.
Everything about the additive PRICING here still applies to it.) The OLD behaviour is preserved behind the new house rule
`immediate-reinforcement-prompts` (registry `src/engine/house-rules.ts`,
category `abilities`, **default OFF in BOTH binh and legacy** — so an untouched
table plays the NEW reading; the lobby row renders from the registry and is
pinned in `game-options-tabs.test.tsx`). Engine: `reinforceCostFor` /
`legionVoucherDiscount` / `bankReinforcementDiscount` /
`reinforcementDiscountCostFor` / `redeemReinforcementDiscount` (adventure.ts),
`redeemReinforcementDiscountAction` + `performHeroStep` (adventure-reducer.ts),
`addBankedReinforcementActions` (legal-actions.ts). Behaviour pinned in
`legion-artifacts.test.ts`, `necromancy.test.ts`,
`extra-heroes-batch2-specialties.test.ts` and `map-tile-effects-audit.test.ts`.
HONEST LIMIT on that coverage: the old readings are kept as explicit rule-ON
regression suites in `legion-artifacts.test.ts` / `necromancy.test.ts` /
`map-tile-effects-audit.test.ts` (they simply flip the flag on the old cases),
but the Vidomina specialty case in `extra-heroes-batch2-specialties.test.ts`
pins the NEW behaviour only — it has no rule-ON twin.

Leading with what does NOT work / the deliberate limits:
- **Unredeemed banks die the moment ANY of your heroes takes a step.** Movement
  — including a free Subterranean-Gate crossing and a SECONDARY hero's step — is
  the new expiry seam for Legion vouchers, the `legionDiscountCardIdsUsed`
  ledger and the Necromancy/Hill-Fort banks. So "play Legion, then walk to the
  town" now LOSES the voucher (recruiting is a town-token action playable from
  anywhere, so the fix is to play the piece after moving). Under the old toggle
  they instead survive movement and expire at the owner's next turn.
- **Playing Necromancy is now a commitment.** The card resolves to the discard
  when played, even if the bank is never affordable; the old "kept unless it
  actually upgrades a unit" rule is only in the toggle. Same for Vidomina's
  I/VI specialty cards (`extra-heroes-batch2-specialties.test.ts`).
- **The now-or-never PROMPT is gone; the window is not.** The old Necromancy
  prompt forced the pick-and-pay on the spot. The bank replaces it — but since
  2026-07-28 the after-combat window is an ATOMIC transaction (see that
  section): the withheld reward lands only on the explicit Resolve, and a bank
  this window created and did NOT redeem EXPIRES there. So a Necromancy bank is
  still effectively use-it-now. (The Hill Fort bank that used to survive to
  later turns is GONE — 2026-08-06, its own section below.)
- **Three things the old-behaviour toggle does NOT restore** (stated in the
  rule's own lobby description): the HILL FORT always opens its own
  pick-and-pay window and never banks (2026-08-06, below); it prices through
  the shared `reinforceCostFor(…, flatGoldDiscount = 3)` seam in BOTH readings,
  so a Legion voucher reserved for that unit applies there too (the old bespoke
  `hillFortCost` helper ignored vouchers and has been deleted — it was left
  wired to nothing); and a half-ALL source (Isra) still halves the non-gold
  resources even when the flat discount wins the gold.
- **The AI has no bank strategy** — see the single-player section: it redeems
  when it can afford to. The one place it is deliberately ordered is the atomic Necromancy
  window, where the redeem is scored between the card play and the Resolve
  (1_135/1_130 vs 1_140/1_120) because resolving expires the offer — without
  that repricing the AI threw its Necromancy card away after every win.

What runs (each mutation-checked):
- **Distinct Legion pieces STACK by addition** with each other and with the
  building/location sources (`legionVoucherDiscount` sums per distinct `cardId`;
  toggle ON = the largest single voucher). The SAME physical piece can never
  bank twice before movement, even after Scholar returns it — the
  `player.legionDiscountCardIdsUsed` ledger is the guard, read by BOTH the
  legal-action offer and `bankRecruitDiscountVoucher`.
- **Source first, flats second.** `reinforceCostFor` halves the PRINTED gold for
  a half source (Necromancy floor / settlement ceil / Isra), then subtracts the
  flat total (Hill Fort / Cove Pub / Champions' Stables / every Legion voucher)
  from what remains. Toggle ON restores the "cheaper of half vs flat wins" read.
- **Necromancy BANKS instead of prompting**
  (`player.reinforcementDiscounts: ReinforcementDiscountBank[]`, a new optional
  PlayerState field — absent on legacy snapshots = old behaviour, nothing to
  mask in player views since a played card is public): a half-gold-round-down
  offer (basic bronze/silver, expert any tier incl. azure, `allowStack` for a
  Polish Unit-Stack layer). Redeeming is the new
  `REDEEM_REINFORCEMENT_DISCOUNT` action, offered per army card from the map
  Army panel with the real charged price in the label. **The HILL FORT no
  longer banks at all (2026-08-06)** — it opens its own window instead; see
  "The Hill Fort opens its own reinforce window" below. The `"hill-fort"` bank
  `source` and its redeem path stay wired for in-flight legacy snapshots.
- **`REDEEM_REINFORCEMENT_DISCOUNT` is handler-validated**, so its handler is
  the only gate: it refuses during combat AND off-turn
  (`hasOpenAdventureTurn`) — without the turn gate a forged action could flip a
  Few to a Pack in the middle of an opponent's turn, e.g. as an enemy hero walks
  onto a mine you are about to defend (pinned with a forged-off-turn rejection +
  an own-turn CONTROL in `legion-artifacts.test.ts`).

## The Hill Fort opens its own reinforce window (2026-08-06) — what runs vs. limits

Reported: "Fort on the Hill didn't do anything. It should give a pop up similar
to Necromancy allowing to choose the unit you reinforce or skip." DIAGNOSIS: the
engine was not broken — the SURFACE was invisible. With
`immediate-reinforcement-prompts` OFF (the default) the visit offered ONE opaque
option, "Bank Hill Fort reinforcement discount (-3 gold; expires when you move)",
which created a `ReinforcementDiscountBank` and emitted **no event at all**: the
visit closed, the feed said nothing, the board looked identical. Spending it
meant noticing that a per-card reinforce button had appeared inside the map Army
panel, and the bank was wiped the moment ANY of that player's heroes took a step
(`performHeroStep`). Verified by probe before the change: the bank WAS created and
`addBankedReinforcementActions` DID offer "Hill Fort: reinforce Halberdiers
(free)" / "… Crusaders (7 gold)".

Now: `HILL_FORT` always resolves through `resolveHillFort`
(adventure-reducer.ts), and its `legal-actions.ts` branch always builds one
priced option per eligible bronze/silver Few card — `Reinforce <unit> (<cost>) —
Hill Fort −3 gold` — plus Skip. Paying runs the normal
`reinforceArmyUnit` path, so the card flips Few→Pack at once, resources are
spent, a reserved Legion voucher is consumed, and `RESOURCES_SPENT` +
`UNIT_RECRUITED` land in the feed. Pricing is UNCHANGED (the same
`reinforceCostFor(…, flatGoldDiscount = 3)` seam: −3 first, then every flat
Legion voucher), so a table's economics do not move — only the timing and the
visibility.

Leading with what does NOT work / deliberate limits:
- **The Hill Fort is now-or-never.** There is no bank to carry to a Town or a
  later turn, in EITHER reading of `immediate-reinforcement-prompts` (the toggle
  no longer touches the Hill Fort at all — its lobby description says so). A card
  you cannot afford standing on the hex is a card you do not get.
- **The Hill Fort is a one-use `visitable` field** (black cube on the visit), so
  there is no 1-MP Revisit re-open; what re-opens the window is a CLEARED cube
  (the designer `clear_tile_cubes` timed event / a re-opened field), pinned as
  such.
- **Nothing was made cheaper or dearer**, and the bank machinery is untouched:
  Necromancy's atomic after-combat window still banks, and a legacy `hill-fort`
  bank sitting in an in-flight snapshot is still redeemable from the Army panel
  (`ReinforcementDiscountBank.source` keeps the `"hill-fort"` member).
- **No new UI code.** The window renders through the existing pendingVisit
  prompt tray, whose fallback title is already "Hill Fort: choose"; the map
  Army-panel redeem button simply stops appearing for Hill Fort banks.
- **The AI is not re-scored.** `resolveVisitStepScore`'s existing `HILL_FORT`
  branch (1_130, minus optionIndex) already ranked this exact window shape, and
  legal-actions still gates affordability, so a computer seat reinforces the
  first eligible card it can pay for and takes the Skip exit otherwise. Net
  behaviour is close to the old bank→redeem pair (which scored 1_130 then 820),
  so no bespoke policy and no "hold it for a better card" planning.

What runs (pinned in `src/engine/hill-fort-window.test.ts`, each case naming the
line whose removal fails it; the PRICING half stays in
`map-tile-effects-audit.test.ts`):
- the window's offer shape (per-unit priced options + Skip, gold tier never
  offered, no bank offer, nothing banked);
- paying flips the CHOSEN card (an un-chosen decoy stays a Few), spends printed
  gold − 3, and emits `UNIT_RECRUITED` + `RESOURCES_SPENT`;
- a reserved Legion voucher folds on top (Crusaders 10 − 3 − 4 = 3), with a
  no-voucher CONTROL at 7 gold;
- Skip pays nothing, flips nothing, banks nothing, and still cubes the field;
- an unaffordable card is never offered and the lone Skip explains itself
  ("Skip (no bronze or silver Few unit you can afford to reinforce)"), with an
  afford-it CONTROL that gets the offer and the plain "Skip";
- the window is IDENTICAL with the house rule ON (loop over both readings);
- a cleared cube re-opens it;
- a computer seat reinforces rather than skipping, and a BROKE computer seat plus
  the shared forced-resolution driver (`nextTurnTimeoutAction`, the AFK-kick /
  10-minute-timeout path) both take the Skip exit — so the window can never
  strand an automated seat. HONEST LIMIT on that last pair: the "reinforces"
  case does not discriminate the dedicated `HILL_FORT` AI score branch (deleting
  it leaves the generic 1_090+ visit-pick tail, still above the 1_050 decline) —
  the branch only fixes the pick ORDER; it IS discriminated by reverting the
  window itself.
- Parallel turns / eliminations needed no new wiring: the window is an ordinary
  `pendingVisit` step, so the bystander gates and `eliminatePlayer`'s
  pendingVisit cleanup already cover it (verified by reading, not re-pinned).

## Legion vouchers on NEUTRAL-Unit recruits (2026-08-03) — what runs vs. limits

Reported bug: "Elemental Conflux did not allow me to use the Legion piece in my
hand to reduce the cost of the recruited unit. Actually ALL Legion artifacts
should give the option to reduce cost when recruiting NEUTRAL units." They never
did — the discount pipeline only ever reached the town roster (recruit/reinforce/
Stack), and a Neutral-Unit recruit read the printed cost raw. Behaviour pinned in
`src/engine/legion-neutral-recruit.test.ts` (each claim mutation-checked with a
no-voucher / no-piece / excluded-offer CONTROL).

**ONE pricing seam.** `neutralRecruitCost(state, playerId, unitDefId,
goldReduction?)` (adventure.ts) = the printed NEUTRAL-side cost, minus a printed
reduction (Oidana IV's −4 gold) FIRST, then `applyRecruitGoldDiscount` (every
distinct Legion voucher, ADDED). Every "recruit a Neutral for its printed cost"
surface uses it for the affordability gate, the offer LABEL and the actual spend,
and calls `consumeRecruitVoucherFor` once the card joins the army — so the three
can never disagree and the voucher is single-use. Discounted surfaces: **Elemental
Conflux**, **Portal of Summoning**, **Charlie and his Circus** (Astrologers),
the **Den of Thieves** and **Mercenary Camp** Events, and **Cyra's / Oidana's
Diplomacy** recruit side.

**The map Legion "pick a unit" prompt is deliberately UNCHANGED** — a Neutral-deck
card is NOT a pre-bankable target (`legionDiscountTargets` keeps only the town
roster / army / Stack arms; its only edit is the explanatory NOTE, so its output
is byte-identical to before). Adding them was tried and REVERTED because it broke
two things: the prompt filled with the whole Neutral deck and printed a second,
ambiguous "Recruit Marksmen" (most faction creatures have a Neutral twin card —
`legion-discount-ui.test.tsx` caught it), and a computer seat then banked its
voucher on a Neutral card it never buys, delaying its Gold-dwelling rush on the
fixed seeds (`single-player-premium-rush.test.ts` caught it). Pre-banking would
buy nothing anyway: see the limits below.

**ONE menu seam + the inline play.** The five visit-based surfaces build their
CHOOSE_ONE through the new auto-resolving `NEUTRAL_RECRUIT_MENU` visit step
(each candidate carries that surface's own recruit leaf; `decline` its own
bookkeeping; `verb` keeps the Den of Thieves' printed "Buy …" wording;
`skipWhenEmpty` preserves each surface's pre-existing "nothing affordable ⇒ no
prompt" behaviour). It also offers each HELD Legion piece inline
(`USE_LEGION_RECRUIT_DISCOUNT`: discard the piece, bank its voucher for that
unit, RE-OPEN the menu) — because banking beforehand cannot work at a field
reached by MOVING (movement is the bank's expiry seam) and an open visit offers
no card plays at all. Re-opening is what lets **distinct pieces stack** and keeps
Decline reachable. **Diplomacy** carries the same inline offer inside its own
`diplomacy-recruit` pendingChoice (`diplomacyRecruit.legionPlays`, appended AFTER
the recruit + "Recruit none" options so every pre-existing index keeps its
meaning; `openDiplomacyRecruitChoice` is the split-out re-open that never draws
again). `bankRecruitDiscountVoucher` is the SINGLE writer of a voucher for all
three surfaces (the map pick, the visit menu, Diplomacy).

Leading with what does NOT work / deliberate limits:
- **A voucher is reserved for ONE unit.** Playing a piece inline then recruiting
  a DIFFERENT candidate wastes it (the menu's own prices make that visible, and
  the option label names the unit).
- **The AI never spends a Legion piece on a neutral recruit.**
  `USE_LEGION_RECRUIT_DISCOUNT` scores 10 in `map-policy.ts` (below a plain
  recruit's 28/12) and the Diplomacy inline options score `CHOICE_BASE + 2`
  (below decline's +8) in `choice-policy.ts`. Deliberate on both counts: the
  option RE-OPENS the same menu, so a competitive score could cycle the whole
  hand of pieces before buying — and keeping the pre-existing option scores
  untouched is what keeps the fixed-seed single-player runs
  (`single-player-premium-rush.test.ts`) byte-identical. Bounded either way
  (each use consumes a card).
- **Two clicks per piece** (play the piece → the menu re-opens → recruit). That
  re-open is what makes stacking AND Decline both reachable; there is no
  single-click multi-piece combo.
- **EXCLUDED, unchanged (they print their own price and fold no voucher):**
  Pandora's Gift half-cost Neutral recruits (`openNeutralRecruitOffer` /
  `NEUTRAL_RECRUIT_RESOLVE`, still `halfRecruitCostRoundedUp` — CONTROL-pinned
  with an identical label AND gold spent whether or not a voucher is banked for
  that exact unit, and no inline offer either), the settlement-capture half-cost
  arm, the Necromancy / Hill Fort banked reinforcement offers, and the Polish
  Unit-Stack special offers. FREE neutral recruits (Pandora's free draw,
  Unexpected Reinforcements, the Skeletons reward) and Gelu/Dracon/Tarnum's
  fixed-gold `CONVERT_ARMY_UNIT` fetch are not printed-cost recruits and are
  untouched.
- **Portal of Summoning's option label gained the unit name** ("Recruit Air
  Elementals (7 gold)" instead of "Recruit for 7 gold") — cosmetic, the prompt
  already named the drawn card.
- The inline offer names the player's own hand cards. On a VISIT that is already
  safe (a non-owner's view gets `pendingVisit.steps: []`,
  `getVisiblePendingVisit`); Diplomacy's choice is otherwise public, so
  `player-view` scrubs exactly its trailing Legion options to "Play a card from
  hand" and hides their `cardId`, keeping the recruit/decline labels visible as
  before.

## Map spell-power bank, map notice icons, teleport-guard bank fights & Rule 111 UI — what runs

Five additions; each engine claim fails a named test if its wiring is removed.

- **Map spell-power bank (Sorcery / Scales on the MAP).** The combat "+Power,
  then draw" bank (`combatStats.pendingDrawRiderSpellPower`) has a MAP twin:
  playing an `ADD_SPELL_POWER` draw-rider on the map banks its +Power onto
  `player.mapSpellPowerBank` and draws a card. That bank is the **starting
  Power** of the next map Power-tier cast (cast-then-boost window above) — a
  banked +1 alone auto-resolves View Air at the materials tier with no power
  cards in hand. Zero in combat (`mapSpellPowerBankAvailable`); consumed WHOLE
  when the cast opens (tier surplus is not refunded). **Since 2026-07-27 the
  owner's next turn no longer clears it** — a hero **move** is now its only
  expiry seam (`performHeroStep`, unconditional: this half is NOT under the
  `immediate-reinforcement-prompts` toggle), so a banked +Power survives a turn
  boundary if nobody walks. CHOOSE_ONE draw-rider artifacts (Scales / Tunic /
  Armor of Wonder) stay map-playable draw-only. Pinned in
  `map-spell-power-bank.test.ts` (bank + cast, clear-on-move, the whole-bank
  consume, "does not clear … merely because a new turn starts", Scales, no-bank
  CONTROL).
- **Polish "Cast a Spell" is NEVER a Power source (crash fix).** The enabler is
  excluded from `cardCanBoostPower` / `spellPowerValueOfCard`, so it never appears
  as a map-spell-boost discard (or a combat Power cost). Its combat `asPowerBoost`
  discard stays. Pinned in `map-spell-power-bank.test.ts`.
- **A teleport-gateway guard fights BANK-style (no Quick Combat, no XP, no
  Round limit).** A designer guard on a single-hex Monolith / Teleport Gate /
  Whirlpool (`isTeleportObjectGuardLocation`) must be truly fought to pass — a
  high-level hero can no longer Quick-Combat past it — and the fight grants no
  experience (combat difficulty 0), like a Creature-Bank guard. Since 2026-07
  (user rule "Monoliths with guards should have no limit combat rounds, as
  default") it ALSO carries `CombatContext.unlimitedRounds` like a designer
  OUTPOST: the round-limit / continue-or-retreat window never opens, no
  MP-to-extend — the fight runs until one side falls. The dedicated branch in
  `startNeutralEncounter` pins `customGuardLevel` so the difficulty-0 fight
  still draws the real designed guards. Pinned in `map-objects.test.ts` (a
  guarded Gate / Monolith opens a difficulty-0 bank-style fight, exact-army AND
  level, the no-QUICK_COMBAT assertion as the mutation control, and the
  "rolls straight into round 2" unlimited-rounds case). 2026-07-24: a guard
  reached by teleport ARRIVAL (not just entry) is now fought the SAME bank-style
  way via the `teleportArrival` context branch — see rule 3 in the "Designer
  guards, outposts & one-way monoliths" section.
- **Map-visit notice = reward chips, not a "mass of text".** A treasure-chest /
  mine / resource visit's outcome is shown as a compact row of icon chips
  (resource token / experience / morale glyph + a short "+N" or "+N/turn" income
  label) built from the visit's follow-on events by `noticeRewardsFromEvents`
  (`utils.ts`, pure), instead of the old `formatEvent` bullet list — the dice
  cube overlay still animates the roll, and the chips are its RESULT. A mine
  (no dedicated notice art) now wears its RESOURCE token instead of the pickaxe
  emoji (`cue.iconImage`). Chips REPLACE the text lines; an outcome with no
  material chip (e.g. an Artifact Search) falls back to text. Pinned in
  `notice-rewards.test.ts` (the chip derivation with CONTROLs) and
  `overlays.test.tsx` ("renders reward chips … and a mine's resource token").
- **Rule 111 tray (Polish house rule) = a two-column either/or.** The
  `PromptTray` (`screen.tsx`) renders the Rule-111 choice as a purpose-built
  layout — a "Use Rule 111: replace the Guard" swap on the LEFT, the drawn
  guard's card face with an "Accept the guard" button on the RIGHT — instead of
  a flat row of look-alike buttons. Pure presentation over the existing
  `CHOOSE_OPTION` accept (optionIndex 0) / replace (1..N) actions. Pinned in
  `rule-111-choice-art.test.tsx`.

## Map UX & rules batch (2026-07) + audit fixes — what runs vs. limits

Nine changes shipped together; a follow-up audit fixed the holes marked (AUDIT
FIX). Each engine claim fails a named test if its wiring is removed.

- **Free tile rotation (seal gate OFF).** `TILE_ROTATION_SEAL_GATE_ENABLED =
  false` (`adventure-reducer.ts`): every rotation of a revealed/placed tile is
  offered AND Confirmable — the "border lines seal the tile off" hard reject and
  the placing-hero doorway gate are both disabled. Yellow arcs still seal
  MOVEMENT after materialize (untouched), the pure geometry helpers
  (`isTileRotationConnected` / `canHeroReachPlacedTile`) stay live for AI
  scoring, and flipping the flag back to `true` restores both gates. Pinned in
  `adventure.test.ts` ("offers every far-tile rotation …") and the e2e rotate
  flow.
- **Spell searches take only the face-up TOP discard, like every other deck**
  (REVERTED per the explicit 2026-07-21 user demand — the ef3b0ac "take ANY
  acquirable discarded spell + pick the face-up top" invention was never
  requested and is gone). `openSharedDeckSearch` offers at most ONE discard take,
  the `discardTopId` path (still `canAcquireSharedDeckCard`-filtered), for Spell
  decks exactly as for Abilities/Artifacts — no `discardPickCardIds`, no per-card
  menu. `resolveDeckSearch` pushes ALL unkept revealed cards straight back to the
  discard (no `spell-discard-top` face-up pick is ever opened). LEGACY-RESOLUTION
  SAFETY (a live room could still hold an in-flight `spell-discard-top` choice
  when the server updates): the `chooseOption` handler, the `eliminatePlayer`
  parked-card return, and the `spellDiscardTopPick` type are KEPT so such a
  choice still resolves — but it is never CREATED again. The morale
  repeat-search / Pendant-of-Courage post-Search offers (`maybeOpenPostSearchOffers`)
  predate ef3b0ac and are unchanged. Pinned in `spell-discard-pick.test.ts`
  (single top-only take, a buried acquirable spell NOT offered = the user's
  CONTROL, the take, the school-fetch-still-after-it, and the legacy in-flight
  resolution) and `deck-search-mode-modal.test.tsx` (top-discard face + grouping).
- **The SPLIT-deck spells family search is a ONE-STEP up-front decision** (USER
  DEMAND 2026-07: "choose discard, search or school of magic" BEFORE any card is
  revealed — never "choose search spell, then the draw school of magic appear
  with that"). `beginSharedDeckSearchNow`'s deck-pick for the `"spells"` family
  is ENRICHED (`deckPick.upFront` + `discardTops` + `fetchSchools`): its options
  run [Search (N) Basic Spells | Search (N) Expert Spells | Take the top discard
  (per acquirable deck top) | Draw the first <School> Magic spell (per Basic X
  Magic in play)]. Committing to a Search reveals DIRECTLY (a held Scouting
  still prompts in between; `openSharedDeckSearch`'s `modeResolved` skips the
  old second "Search or draw from a School?" step, carried through the Scouting
  prompt); the school draw scans Basic THEN Expert (`performSchoolFetchFromDecks`)
  and a no-match draw leaves an EVENT_NOTE instead of failing silently. A LEGACY
  in-flight deck-pick (no `upFront`) still resolves the old two-step way; the
  single-eligible-deck flow and the artifacts family keep their existing shape.
  The enriched pick renders in `DeckSearchModeModal` (deck backs / discard faces
  / the Basic X Magic card face), routed there like `deck-search-mode`. Pinned
  in `basic-magic-fetch.test.ts` ("One-step spells deck-pick": the single
  up-front offer, the straight-to-reveal CONTROL = the reported bug, the
  Basic→Expert scan, the empty-note, Scouting, the discard take, the Polish-Book
  destination, and the legacy resolution).
- **The deck-search menu's "Search (N)" tile is HONEST about a standing
  Scouting override.** A `SEARCH_COUNT_OVERRIDE` (a pre-played Scouting) is
  consumed only at REVEAL (`applySearchCountEffects`), never when the up-front
  discard/fetch menu is built — so a lingering override left the tile reading
  "Search (2)" while the Search then peeked 3 (the reported Derelict Ship bug).
  `openSharedDeckSearch` now labels the Search tile with the EFFECTIVE reveal
  count and names its source — "Search (3) — Scouting override (base 2)" —
  via `searchCountOverrideLabel` (mirrors `applySearchCountEffects` exactly so
  label == reveal); the override is still NOT consumed by the label read, so an
  up-front discard/fetch keeps it intact for a later search. The Astrologers
  `SPELL_SEARCH_WIDEN` path bumps `baseCount` itself, so it stays the plain
  "Search (4)" phrasing (label == reveal, no "override" note). The bank Search
  COUNT itself is honest end-to-end (X = Stacked defenders = size). Pinned in
  `deck-search-label-honesty.test.ts` (bank X→reveal, override label + reveal,
  Astrologers control, school-fetch controller scoping). Presentation: the
  `DeckSearchModeModal` now GROUPS the look-alike tiles under headings (Search
  the deck / take the top discard / draw from your School of Magic) — visual
  only, option indices unchanged — pinned in `deck-search-mode-modal.test.tsx`.
- **Manual guard control is FREE play.** `neutralControlMustAttack` returns
  false without PvP Neutral Control — the manual fighter may move, attack,
  Defend, Wait (polish-wait), hold or use tokens; only a REAL PvP Neutral
  Control opponent is bound by `pvpNeutralControlMustAttack`. (AUDIT FIX): the
  read is per-combat — with the PvP option ON but nobody left to take the
  guards (`pvpNeutralControllerId` null), the manual fighter still gets free
  play, never the sub-toggle. Polish-wait re-activation and Astrologers frenzy
  keep their own force-attack paths. Pinned in `manual-guard-control.test.ts`
  (free-control cases + the PvP-corner case with a live-opponent CONTROL).
- **Two-way exit modes on Gates AND Monoliths** (shared one-way vocabulary:
  certain / random / mix + always-pickable destinations, default certain =
  classic traveller-picks): stored on the origin field
  (`onewayExitMode`/`onewayAlwaysPickable`), read in `resolveGateTeleport` /
  `resolveTokenTeleport`. Since the 2026-07-24 rule the 3-whirlpool die, the
  2-monolith travel, and the random/mix roll are all wrapped behind a
  travel-vs-stay offer first (rule 3a — the roll resolves only when travel is
  chosen, never leaked on a Stay); mix still rolls its random pick ONCE per
  committed travel. (AUDIT FIX ×3):
  a face-down designed token KEEPS its mode when the reveal places it
  (`placeMapToken` now carries the extras for gate + monolith, like one-way); a
  "mix" always-pickable destination that is still a PENDING token on a
  face-down tile is offered up front (`tokenDestinationAlwaysPickable` — the
  shipped code read a non-existent field and pending tiles always fell into the
  roll pool); and STANDALONE gate/monolith objects share the whole vocabulary
  (sanitizer + `applyCustomMapObjects` + designer object panel + token↔object
  conversion carry). Pinned in `two-way-exit-modes.test.ts` (reveal parity,
  pending-tile mix, standalone carve + sanitizer, each with CONTROLs).
- **Far (Ⅱ–Ⅲ) pool never carries an Obelisk tile** (house rule; Obelisks live
  on Ⅳ–Ⅴ Near): the far pool filter strips obelisk-bearing tiles (Factory &F1)
  at setup, and the Grail obelisk shortfall pulls from the NEAR pool only (12
  near obelisk tiles exist — supply is safe). Designer exact pins bypass the
  pool. Pinned in `far-pool-no-obelisk.test.ts` +
  `expansion-content.test.ts` (catalog minus the obelisk far tiles).
- **Power-boost windows are MASKED for other viewers** (AUDIT FIX): the
  `map-spell-boost`, `visions-boost` and `fortune-boost` option labels name the
  caster's PRIVATE hand cards ("Discard <card> …"), so `player-view` scrubs
  labels + payload card ids for non-owners (visions/fortune had leaked since
  they shipped — the new window copied it; all three are masked at the one
  chokepoint). Pinned in `map-spell-cast.test.ts` ("hidden-info safety").
- **VP surrender note + scoring menu (pure UI over engine-real rules):** the
  pre-battle escape button and the VP dock note that surrender awards the
  opponent 1 VP — the ENGINE side (`recordVpSurrender`, 1 VP vs the full 3 VP
  main-hero defeat) predates this batch and stays pinned in
  `victory-points.test.ts`; the scoring overlay gains Close + "Go to main menu".
- **Presentation only:** treasure/resource/attack die GET chips on visit
  notices (`noticeRewardsFromEvents`, `notice-rewards.test.ts`), Polish
  Unit-Stack badges on the combat placement panel
  (`placement-panel.test.tsx`), and face-down tiles render EVERY pending token
  (multi-token tiles, whirlpools included — public designer info) instead of
  only the legacy first entry (`screen.tsx`).
- **LIMIT (AI):** computer seats answer the new `map-spell-boost` choice
  through the GENERIC option scorer (bounded — each boost pick shrinks the offer
  list — but greedy: no bespoke tier-value policy), and the AI never sets
  designer exit modes.

## Map settings defaults (designer → lobby, seed-at-pick) — what runs vs. limits

Three OPTIONAL defaults a designed map may carry on `CustomMapPreset` to SEED the
lobby when that map is picked — `difficulty?: GameDifficulty`,
`farTileOpening?: boolean`, `farTilesPerPlayer?: number` (0–6) — each hoisting
1:1 onto the same-named `GameSetupOptions` field. They ride the EXISTING
preset→lobby machinery in `map-preset.ts` (extended, not rebuilt): the three keys
were added to `PresetForcedOptionKey` / `presetForcedOptionKeys` /
`applyCustomMapPresetToOptions` (seed) / `revertCustomMapPresetOptions` (restore
scenario default when the map is dropped/swapped) / `customMapPresetIsActive` /
`sanitizeCustomMapPreset`, plus the build-time apply-once `explicit` skip set in
`adventure-setup.ts` `createAdventureGameState`. Editor UI: two new sections in
`map-preset-editor.tsx` — a Difficulty chip row (`MAP_PRESET_DIFFICULTY_OPTIONS`,
Easy…Impossible, re-click clears) and an "Additional Ⅱ–Ⅲ tiles" row
(Default/On/Off + a Default/0–6 per-player count that hides when opening is Off).
Pinned in `custom-setup.test.ts` (seed-on-pick + host-edit-wins, direct-build
seeding with a legacy CONTROL, build apply-once, revert, sanitizer clamps/drops,
banner lines), `map-preset-editor.test.tsx` (the two controls write onChange, a
sibling field survives, Off hides the count), and the persistence round-trip in
`map-registry.test.ts` (registry sanitizes the preset through
`sanitizeCustomMapPreset`).

Semantics / deliberate limits:
- **SOFT defaults, apply-once**: the preset seeds these three onto the lobby at
  PICK (`setGameOptions` customMap block, no skip). A host's later
  `SET_GAME_OPTIONS` edit of difficulty/far-tiles then WINS — the lobby path
  passes every option to the build, so they land in the build-time `explicit`
  skip set and the preset never re-forces them. A DIRECT build that omits a field
  lets the preset fill it (the seeding path). Difficulty is a soft default like
  victory mode — the host may change all three after pick; VP + round limit stay
  MAP-AUTHORITATIVE (below), unchanged.
- **Victory mode / VP / round-limit were ALREADY on the preset + editor** (this
  task only ADDED difficulty + far-tiles). `preset.roundLimit` ends the game ONLY
  when Victory Points is enabled (`adventure.ts` round-wrap: `if (vpConfig &&
  roundLimit && …)`); with VP off it stays a mere "suggested length". The editor
  already surfaces that coupling (the round-limit section relabels "Round limit
  (hard end)" ↔ "Suggested length (rounds)" off `vpOn`, with a matching hint), and
  the round-limit+VP end + the banner wording are already pinned in
  `victory-points.test.ts` (VP-on-ends / VP-off-suggestion-only / no-limit-no-end,
  and the `describeCustomMapPresetEntries` round-limit lines) — no new coupling
  test or editor coupling change was needed.
- **Additional-tile TYPES are NOT configurable** — only on/off + per-player count.
  The Ⅱ–Ⅲ supply pool composition stays the engine default (a truly-random tile is
  rolled from `farTilePool` when a player opens one).
- **No custom "hold a town for X rounds" win conditions** — the victory default
  picks among the four existing modes (conquest / grail / dragon-hunt /
  dragon-conqueror = the capture-and-hold mode); the VP `objectives`
  (control-towns / flag-mines / hero-level / defeat-utopia) already live under
  `victoryPoints` config and stay there.
- **Sanitizer**: garbage difficulty dropped (kept only if one of the 4 literals);
  `farTilesPerPlayer` clamps 99→6, −1→0, a non-number DROPPED (never a silent 0);
  `farTileOpening` kept only as a real boolean. Legacy presets (fields absent)
  are byte-identical after sanitize and behave exactly as before.

## Map designer upgrade (designed gates/borders/locks/obelisks/objects/Ⅶ/VP) — what runs vs. limits

Seven map-only features on `CustomMapPreset` / `CustomMapTilePlan` (applied when
the map is picked). Preset-editor + tile-popover UI in `map-designer.tsx` /
`map-preset-editor.tsx`; the new rows/warnings carry Heegu-sama/Homm3BG board
glyphs via `REWARD_GLYPH_ICONS` (`homm-assets.ts`) through `assetUrl()`.

Leading with what does NOT run / deliberate limits:
- **Standalone (off-tile) Whirlpool teleporters are REFUSED** — a Whirlpool must
  sit on a tile (its token); Monoliths (legacy), Teleport Gates, one-way
  monolith halves and the three outposts (Garrison / Keymaster's Tent /
  Barrier — standalone-ONLY, see the "Designer guards, outposts & one-way
  monoliths" section) may be standalone objects. A standalone hex touching BOTH
  layers is also rejected (`map-objects.test.ts`).
- **CANONICAL forms (see the "Monolith & Whirlpool Tokens" section):** an ON-tile
  teleporter is a `CustomMapTilePlan.token` (kind monolith/whirlpool/gate); an
  OFF-tile one is a standalone `CustomMapObject`. The designer never writes NEW
  tile-slot objects — dropping a teleporter on a tile writes/moves a token,
  dropping it off every tile writes a standalone object, and dragging one across
  that boundary converts between the two forms. A LEGACY tile-slot object in a
  saved preset still carves exactly as before (`applyCustomMapObjects`), and a
  face-down / forbidden-slot tile-slot object is dropped with a problem
  (`map-objects.test.ts`).
- **The map AI DOES route through teleport networks** (Monolith / Whirlpool /
  colored Gate / one-way entrance→exit / obelisk-monolith-role / anime
  `tran_phap`): `objectiveDistanceField` adds reverse edges from
  `listKnownTeleportDestinations` (known fields only — face-down pending landings
  excluded in V1; no whirlpool unit-toll EV). Destination menus still pick the
  landing nearest the primary objective. Safety: a full SP turn over Gate +
  Monolith hexes must not stall (`map-objects.test.ts`).
- **Obelisk role is MAP-WIDE, never per-Obelisk** (face-down tiles hide which is
  which); every role still credits the Holy-Grail dig identically
  (`obelisk-roles.test.ts` "dig progress is role-independent").
- **A monolith-role Obelisk / Monolith does NOT re-trigger on ARRIVAL** — the dig
  credit + reward fire only on deliberate ENTRY, before the teleport; landing on
  one via a teleport is inert (no ping-pong, no re-credit).
- **A Ⅶ-field override drops the printed field's trappings** — forcing a centre
  slot's difficulty-7 field to Town/Grail/Utopia keeps the difficulty-7 guard and
  the terrain but discards the printed objective's resource/faction/amount
  (`materializeTileFields`, `vii-field-designation.test.ts`).
- **The Grail-capacity conflict check is CONSERVATIVE about Near/Far overflow** —
  it counts face-down Near/Far slots optimistically as Grail hosts (setup
  soft-fills a tight layout from the pool rather than hard-failing), so it only
  BLOCKS a design that truly cannot host 2 dig sites (`vii-field-designation.test.ts`
  "Near/Far overflow rescues it").
- **VP with a conquest-style victory + NO round limit ends only by
  last-faction-standing** — which, with VP on, ends the game SCORED immediately
  (the survivor completes the condition and earns the completion VP; only live
  seats are scored, so the survivor wins with a full breakdown — no playing out
  the remaining rounds with no opponent left). With VP off it stays the classic
  instant unscored win (`victory-points.test.ts` "with no round limit … does NOT
  end" + "Last-faction-standing under VP mode").
- **No "dig the Grail" VP objective** — deliberately omitted from the four kinds
  (control N towns / flag N mines-settlements / reach hero level N / defeat a
  Dragon Utopia): the base table's "Completed the victory condition" row already
  credits a Grail win, so a dig objective would double-count.
- **The fixed-orientation feed line is presentation-only** — the real lock is the
  engine placing the home tile at its designed `rotation` and refusing every
  opening rotation for that seat; `START_TILE_ORIENTATION_FIXED` is just the
  notice (`start-tile-rotation.test.ts` cases 1/3/5).

What runs (each pinned by a test that fails if the wiring is removed):
- **1. Designed gate links** (`CustomMapTilePlan.gateLinks`): pin cavern↔Surface
  gates at chosen hexes with NO practical limit — one cavern may link ANY number
  of touching Surface tiles, AND the SAME Surface tile several times at distinct
  boundary pairs (several gates along one shared edge); the only bound is the
  sanitiser cap `MAX_DESIGNED_GATE_LINKS` = 24 (effectively unlimited). The engine
  carves BOTH halves at the DESIGNED hexes (not the auto-nearest — a designer plan
  bypasses one-gate-per-tile via a per-plan half lookup keyed off its pinned hex,
  so same-pair siblings each get their own gate); a pinned link opens NO
  pick-on-reveal choice (for every one of the multiple gates). Validation
  (`validateCustomMapPlan`, mirrored in the pure `planSubterraneanGates` preview):
  a link to a non-touching/absent Surface is dropped with a problem; a PINNED pair
  colliding with an already-accepted link's hex (this cavern's OR another's — two
  gate halves can never share a board hex) is dropped with a problem naming it; an
  UNPINNED duplicate to a surface already linked unpinned is merged away.
  Designer UX: per-LINK popover rows (each with ↻ Move + Unlink) plus a "+ Gate"
  button that pins a second gate to an already-linked surface at the first free
  pair (disabled when the edge is full); a gate-token drag offers EVERY touching
  surface (incl. already-linked ones), minus pairs colliding with sibling pins,
  and moves only the grabbed entry. `designed-gate-links.test.ts`,
  `subterranean-gate-planning.test.ts` (preview == engine, incl. the five-surface
  and double-gate cases and `unreachableUndergroundCenters`),
  `map-designer.test.tsx`, `map-registry.test.ts`.
- **2. Yellow borders — PER EDGE (ON by default).** `DESIGNER_BORDER_SEALING_ENABLED
  = true` in `adventure.ts`: setup copies plan borders onto live tiles so they
  RENDER in game AND seal movement / discovery / placement. Legal on ANY group
  including starting Ⅰ Town tiles (`applyDesignedBorders` on the home-tile path).
  Flip the flag to `false` to keep designer data but stop live sealing/draw
  (gated suites in `designed-borders.test.ts` / `map-objects.test.ts` /
  `computer/map-navigation.test.ts` switch with it). Printed tile borders
  (`outerImpassable`, internal lines) are unaffected either way.
  (`CustomMapTilePlan.borderEdges`, canonical
  edge codes `footprintIndex*6 + absoluteDirection` in the rotation-0 board
  frame; 30 distinct edges per 7-hex flower, inner edges included): drawn freely
  edge-by-edge on the board (armed 🖌 tool — click an edge to seal, click again
  to remove, drag to paint/erase a stroke; the panel shows a count + Clear).
  Each single edge seals movement / discovery / new-tile placement / AI —
  everything but Expert Pathfinding — via the `canCrossEdge` +
  `heroCanDiscoverTileAcrossBorders` + placement-reach chokepoints; stored
  ABSOLUTE so it survives rotation + a face-down random draw, and a LINKED gate
  crossing beats it. Rendered bold everywhere (dark casing under a gold core,
  `.tileBorderCasing`/`.tileBorderLine`). The legacy whole-arc `extraBorders`
  (absolute dirs 0-5, 3-edge outer arcs) stays fully engine-enforced for old
  saves; the designer now writes ONLY `borderEdges`, folding legacy arcs in on a
  plan's first border edit. Standalone OBJECT hexes take border edges too
  (2026-07, `CustomMapObject.borderEdges` → `MapFieldState.borderEdges` —
  same tool, same seal, same rendering; see the "Designer guards, outposts &
  one-way monoliths" section). `designed-borders.test.ts` (arc + edge
  suites), `map-navigation.test.ts` (AI), `map-registry.test.ts` (round-trip),
  `map-designer.test.tsx` (draw/erase/stroke/conversion UI),
  `map-objects.test.ts` (object-hex edges).
- **3. Fixed starting-tile orientation** (`lockRotation` + `rotation`): a locked
  seat's home tile is placed at the designed rotation and owes NO opening
  rotation; the opening chain skips it in seat order (no stall), the reducer
  rejects a rotation targeting it, and the lock holds with the ceremony off.
  `start-tile-rotation.test.ts`.
- **4. Obelisk roles** (`CustomMapPreset.obelisks`, absent = classic locked die):
  `monolith` (all Obelisks + Monolith tokens = one teleport network, always STOPS
  the hero, Revisit 1 MP, lone = inert), `bonus` (a fixed reward —
  morale/search/resources/movement/dice, never farmable on re-entry), or
  `victory-only` (no reward, still a dig marker). `obelisk-roles.test.ts`.
- **5. One-hex objects** (`CustomMapPreset.objects`, the CANONICAL OFF-tile form):
  standalone off-tile hexes (layer inferred from the touched tile) — Monoliths
  (legacy) and 4 colored Teleport-Gate NETWORKS (each color its own teleport
  network, separate from Monoliths; up to `MAX_GATES_PER_PAIR` = 8 of a color
  across plan tokens + objects), plus — 2026-07 — one-way monolith halves and
  the three outposts (Garrison / Keymaster's Tent / Barrier), and — with the
  empower-token batch — a **pinned Creature Bank** (`kind: "creature_bank"`,
  STANDALONE-only like the outposts): a REQUIRED `bankId` (one of the 12
  published banks) carves a real bank fight at that hex (normal bank combat +
  reward; optional `bankSize` pins the Polish Stacked count when that rule is
  on). A bank pin never carries a designer guard / first-clear reward / yellow
  borders — a bank is ALWAYS border-free, so it never seals movement or tile
  discovery (stale smuggled edges are stripped at carve;
  `creature-bank-objects.test.ts`, with a garrison-keeps-borders CONTROL).
  Optional guards
  (level 1-7 OR an exact army) run the real neutral-battle flow on teleporters
  (a level>difficulty Quick-Combat win teleports + clears; a loss/retreat
  leaves the guard) and BANK-style (no XP, unlimited rounds) on outposts /
  one-way entrances — see the "Designer guards, outposts & one-way monoliths"
  section. An ON-tile teleporter is instead a `CustomMapTilePlan.token` (see
  the "Monolith & Whirlpool Tokens" section) — the designer no longer writes
  new tile-slot objects, but a LEGACY tile-slot object in a saved preset still
  carves. `map-objects.test.ts`, `outpost-objects.test.ts`.
- **6. Ⅶ-field designation** (a centre plan's `viiField` town/dragon_utopia/grail):
  forces the difficulty-7 objective field whatever tile lands there (face-up at
  setup, face-down on reveal, masked in other views until then); a victory-vs-
  design conflict BLOCKS the start (lobby intact) with live warnings; the knobs
  `grailObelisksRequired` / `utopiaGuards` / `utopiaBonusSearch` tune the dig /
  Utopia. The centre hex additionally takes a designer guard / reward / VP
  bonus (`CustomMapTilePlan.centerHex`) with or without a designation — see
  the "Designer guards, outposts & one-way monoliths" section.
  `vii-field-designation.test.ts`.
  **An UNPINNED slot's Grail / Dragon Utopia designation now decides its TILE
  DRAW too** (2026-08-09, USER REPORT "2nd tile - Grail - was mix of utopia and
  grail"): such a slot used to pop an arbitrary centre tile, so the hidden
  package regularly put a "grail" identity on C1 (which PRINTS a Dragon Utopia),
  on C5 (a Random Town) or on &C1 (an Airship Yard) — `materializeTileFields`
  forced the FIELD while the board kept showing the printed tile, so the hex
  pictured one objective and played as another (the rotation preview, which draws
  the printed field def, sided with the picture). `designationCenterTile`
  (adventure-setup.ts) draws a tile that PRINTS the designation, making the FORCE
  override a no-op. LIMITS: only `grail` / `dragon_utopia` are matched (`town` /
  `settlement` are printed on many centre tiles); an EXPLICIT `tileDefId` / "one
  of" pin is never swapped (an authored mismatch is the designer's choice — the
  override still wins); a `playerViiPick` slot picks AFTER its tile was drawn, so
  that pick can still mismatch the art; and an exhausted pool falls back to the
  old random draw with the override forcing the field as before. FACE-UP slots
  are out of scope — validation refuses one that names no tile.
- **7. Victory Points** (`CustomMapPreset.victoryPoints`): a round-limit OR
  victory-completion end trigger scores the full rulebook VP table via an
  event-sourced ledger (heroes defeated, buildings, hero levels, flagged mines/
  settlements, artifacts, + up to 4 designer objectives + completion VP),
  tie-broken by completer then turn order; a live "if scored now" standings dock
  + a game-over scoring overlay (`victory-points-panel.tsx`) read the same pure
  `computeVictoryPoints`. `victory-points.test.ts`. VP can ALSO be enabled from
  the lobby Game options (Mode & Rules tab, directly below Game mode, default
  OFF) via `GameSetupOptions.victoryPoints` + an optional
  `victoryPointsRoundLimit` round-limit select — `applyLobbyVictoryPoints`
  (`adventure-setup.ts`) injects an `{ enabled: true }` block (and the clamped
  round limit) into the EFFECTIVE preset at build time, so the same downstream
  system lights up on ANY map. A designed preset that already enables VP stays
  authoritative (its config/round-limit win; an explicit lobby
  `victoryPoints: false`/absent never disables it). Lobby wiring is pinned in
  `victory-points.test.ts` (lobby build path + setGameOptions) and the UI row in
  `game-options-tabs.test.tsx`.

Glyph polish (Task 7): the Obelisk fixed-bonus kind, the VP objective rows, the
live VP breakdown rows (experience/gold/artifact/attack-defense by label) and the
designer warnings' red-cross conflict / green-tick all-clear are tagged with
Homm3BG glyphs. Monochrome symbol glyphs are lightened in CSS to read on the dark
panels; the tick/cross keep their own colour. Icon presence is pinned in
`map-preset-editor.test.tsx`, `victory-points-panel.test.tsx`,
`map-designer.test.tsx`.

Tier-band outline colours (designer only): each tile's flower outline
(`GROUP_COLORS`, `.designerFlowerOutline`) is stroked by its band's MAX unit tier
— Ⅰ bronze `#b46f33` / Ⅱ–Ⅲ silver `#c7ccd6` / Ⅳ–Ⅴ gold `#e7b73c` / Ⅵ–Ⅶ azure
`#3f7fd6` (reusing the app's `.tierDot`/`.neutralDeck` grade hues), Sea light-blue
`#8fd8ff`, Underground kept purple `#7a5a9e`; the palette-button borders share
them. A compact `.designerBandLegend` (six swatches + `TILE_GROUP_BAND_LABELS`
numerals, now re-exported from `@/engine`) sits under the tile palette. Because
Near-gold ≈ the selection gold `#ffd766` and Sea ≈ the secret-pin blue `#9ad0ff`,
the `.selected`/`.secret` modifiers gained a stronger halo so an override always
reads over its band. The IN-GAME yellow movement borders
(`getTileBorderSegments`/`.tileBorderLine`) are untouched. Pinned in
`map-designer.test.tsx` ("tier-band outline colours + legend": per-band stroke,
the six-swatch legend, and a selected-overrides-band CONTROL).

### Custom win conditions (map-designer + lobby, additional early-end trigger)

A designed map (and, per-game, the lobby host) may author CUSTOM WIN CONDITIONS
(`CustomMapPreset.customWinConditions` / `GameSetupOptions.customWinConditions`,
`CustomWinCondition` in `state.ts`). ENGINE RULE: the FIRST live player — iterated
in `turnOrder` — to satisfy ANY active condition WINS IMMEDIATELY, an ADDITIONAL
early-end trigger layered on top of the normal victory mode (it does NOT replace
it). Engine: `checkCustomWinConditions` (`adventure.ts`, next to
`declareAdventureWinner`), called from the reducer's post-action tail
(`reducer.ts`, right after `runAdventureAutomations` and before
`ensureCombatActivation` — the ONE seam every action on every backend funnels
through). Behaviour pinned in `src/engine/custom-win-conditions.test.ts` (each
claim mutation-checked, with no-condition / below-threshold / VP-off CONTROLs).

Nine kinds (params clamped by `sanitizeCustomWinConditions`, map-preset.ts):
`control-towns` (count 2–8 — the home town counts, so a min of 2 avoids an
instant win), `flag-mines` (2–12, mines+settlements combined), `hero-level`
(main hero, 2–7), `gold` (treasury, 20–500), `artifacts` (own N, 1–10),
`buildings` (Buildings in controlled Towns, 8–15 — the reader is VP scoring's
own `controlledBuildingCount`; min 8 because the default opening is 3 Buildings
and a preset can force at most 7, so an 8 floor can't instant-win at setup),
`obelisks` (visit N Obelisks, 1–4 matching the grail dig knob — reuses the
per-player `grail.obelisksVisited` tally, so HONEST LIMIT: it only accrues in
GRAIL victory mode, a silent no-op on any other mode), `defeat-heroes` (1–6,
main+secondary combined), `defeat-dragon-utopia` (no param).

What runs (each with a failing-if-removed test):
- **Any-of, first-to-satisfy**: conditions are evaluated in LIST ORDER for the
  reason string; players in `turnOrder` (deterministic tie-break, documented).
  The `GAME_WON` reason is `completed a custom win condition: <describe>` where
  `<describe>` = `describeCustomWinCondition` (the SINGLE source for the editor
  preview, the 🏁 map-pick banner line, the lobby list, and this reason — it
  lives in `victory-points.ts`, NOT map-preset.ts, so `adventure.ts` can import
  it without the map-preset→adventure cycle).
- **The metrics ARE the Victory-Points readers** (reuse invariant): `mainHeroOf`,
  `townsControlledBy`, `flaggedMineSettlementCount`, `artifactCountOf` are
  exported from `victory-points.ts` and shared verbatim; gold is `resources.gold`;
  `defeat-heroes` = `vpLedger.mainHeroDefeats.length + secondaryHeroDefeats`
  (main once per opponent, VP-consistent; tolerates an absent ledger on legacy
  snapshots); `defeat-dragon-utopia` = the distinct count of
  `vpLedger.utopiaDefeatedFieldIds` (older boolean `utopiaDefeated` snapshots read
  as one). Never duplicate a metric — same numbers as VP scoring is the invariant.
- **Combat-deferred**: the check SKIPS while a combat is open (`state.combat`), so
  a threshold crossed mid-battle resolves on the next map-side action
  (`ACKNOWLEDGE_COMBAT_END` and co. flow through the same tail) — the game is
  never ended mid-fight. Pinned with an open-combat guard test + an
  acknowledge-lands-the-win test.
- **VP interplay**: the winner is declared through `declareAdventureWinner(…,
  { viaVictoryCondition: true })`, so with VP mode OFF it is an INSTANT win (HUD +
  GAME_WON, reason verbatim) exactly like the Grail, and with VP mode ON it
  auto-routes to `endGameByVictoryPoints` (the completer earns the completion VP,
  the most-VP seat wins, the VP_SCORING overlay fires). Both behaviours are free.
- **Lobby is ADD-only, UNION at build**: `applyLobbyCustomWinConditions`
  (adventure-setup.ts, chained after `applyLobbyVictoryPoints`) merges the map's
  own list FIRST + the lobby-added list, exact-duplicate deduped, capped at
  `MAX_CUSTOM_WIN_CONDITIONS` (4) via the shared pure `mergeCustomWinConditions`.
  A map-authored condition is NEVER removed by the lobby. `setGameOptions` stores
  the sanitised host list on `lobby.options.customWinConditions` and emits
  `GAME_OPTIONS_CHANGED`.
- **Public by design**: conditions ride `adventure.mapPreset`, which `player-view.ts`
  does not mask — every seat can read them (unchanged; stated, not altered).
- **Idempotent / live-only**: the win-declared guard makes a re-check a no-op (no
  second GAME_WON); an ELIMINATED player satisfying a condition never wins
  (the liveness skip mirrors last-faction-standing).

UI: the map editor's "🏁 Custom win conditions" section (`map-preset-editor.tsx`,
`CUSTOM_WIN_CONDITION_OPTIONS` / `defaultCustomWinCondition`, add/retype/param/
remove up to 4) and the lobby "Custom win condition" section (`screen.tsx`
**Match tab**, directly below the "Win condition" victory-mode selector — beside
the game's other winning conditions, NOT on Mode & Rules: map-set conditions
read-only + "map"-tagged, host add/remove dispatching
`SET_GAME_OPTIONS { customWinConditions }`, Add disabled at the effective cap).
Pinned in `map-preset-editor.test.tsx` and `game-options-tabs.test.tsx` (incl. a
placement test: on Match after the Win condition row, absent from Mode & Rules).

Deliberate LIMITS (documented, not bugs):
- **`defeat-dragon-utopia` counts DISTINCT cleared Utopias (1–6)**: the VP ledger
  tracks `utopiaDefeatedFieldIds` (deduped by fieldId; sanitizer clamps 1–6,
  reader in `adventure.ts`), so the condition needs N distinct Utopia fields
  defeated and never counts the same field twice; a second Utopia still face-down
  when the first fell is converted correctly. (Older boolean-only `utopiaDefeated`
  snapshots count as one.)
- **Instant-win foot-gun**: a condition already met at setup ends the game on the
  first action — the designer's responsibility. The min-clamps REDUCE but cannot
  eliminate it (e.g. a preset `startingResources` gold can exceed the gold
  condition's 20 minimum; control-towns' min of 2 keeps the lone home town from
  being an instant win, but a designed second town could still trip it).
- **Never ends mid-battle** (the combat-deferred reading above) — a crossing
  during combat waits for the next map-side action, by design.

## Map designer 2026-07b: landmark bans, Pack guards, Random Settlement Ⅶ, hold-with-Grail (+ audit) — what runs vs. limits

Three merged branches (exclude-and-level-packs; Random-Settlement-Ⅶ / control-VP
/ hold-with-Grail; yellow-border re-enable — see the borders bullet in the "Map
designer upgrade" section, now ON by default incl. starting Ⅰ tiles, with the
pinned-center "Always visible" face-up/face-down flip in `map-designer.tsx`),
audited together. Behaviour pinned in `tile-exclude-and-level-packs.test.ts`,
`random-settlement-hold-grail.test.ts` and `map-designer.test.tsx` (each claim
mutation-checked; audit fixes noted inline).

Leading with what does NOT run / deliberate limits:
- **Landmark bans are best-effort at setup**, exactly like the include-Secret:
  an exhausted filtered pool falls back to an unfiltered draw with the
  `MAP_SECRET_FEATURE_FALLBACK` table note (never an empty board hole). Exact
  pins and one-of lists ignore bans (the designer already named the tile), and
  a ban lives only on a face-down non-starting slot — the validator REJECTS a
  face-up plan carrying one, so the designer UI clears bans on every face-up
  transition (exact face-up pin, mode switch, the center "Always visible" flip
  — audit fix: the flip used to leave a stale ban that hard-blocked the lobby).
- **"One of these tiles" works FACE-DOWN (secret) as well as face-up** (2026-07):
  the designer's "One of" mode now carries an "Always visible ON/OFF" flip
  (mirroring the center exact-pin flip) — ON places a random tile from the list
  revealed, OFF places one HIDDEN until discovery (even the designer can't tell
  which). `tileSlotMode` classifies a face-down `oneOfTileDefIds` plan (no
  exact `tileDefId`) as one-of so the list stays editable, and the board flower
  reads as a secret (blue halo + 🔒 "1 of N" badge). This is the ONLY way to put
  an Obelisk on a Ⅱ–Ⅲ Far slot as a secret — the random Far pool strips Obelisks
  (the far-pool house rule), but a one-of/exact pin bypasses the pool. Engine /
  validator / sanitizers already honoured a face-down one-of (only the designer
  UI surfaced it face-up); the redacted-while-face-down id + obelisk-Far case are
  pinned in `custom-setup.test.ts` (CONTROL: a plain random Far slot never draws
  an Obelisk), the sanitizer keep in `map-registry.test.ts`, and the flip /
  classification / editability / secret badge in `map-designer.test.tsx`. The
  candidate LIST stays readable in `adventure.mapPreset` (unchanged — the
  existing design for designer secrets, like `secretFeatures`); only the
  RESOLVED live-tile id is redacted in player views.
- **No azure Pack exists in the unit data** (azure is Neutral-only): the guard
  editor offers "+ Pack I–III" only (data-driven — the chip returns by itself
  if an azure Pack ever ships), and ANY Pack slot that cannot mint a Pack — an
  azure slot in a hand-edited save, a locked faction lacking the tier, a
  table row's azure bodies under a "packs" level guard — mints a same-tier
  NEUTRAL instead (audit fix; pre-fix a normal-difficulty level-Ⅶ "packs"
  guard fielded ZERO bodies, and a `random-pack:azure` slot pushed the derived
  difficulty to Ⅶ while minting nothing).
- **A faction-locked NAMED pack of the wrong faction converts** at fight time
  to a random Pack of the SAME tier in the locked faction (audit fix — it was
  silently dropped, shrinking the fought army below the difficulty/XP its
  entries derived; the concrete-lock sanitiser still strips contradicting
  names at save time, so this arm mostly serves `packFaction: "random"`).
- **`customGuardLevel` is now stamped for EVERY designer level guard** (not
  just bank-style objects), so `drawGuardArmy` draws the DESIGNED level even
  where the fight difficulty is forced (bank-style 0). CONSEQUENCE (designer
  guard wins, deliberate): a designed LEVEL guard on a Random Town draws a
  level army instead of the classic rolled-faction party, and on a
  grail-as-utopia "always" dig site instead of the Utopia dragons.
- **A "packs" level guard reads the SAME eased table row as its Neutral twin**
  (`neutralArmyDifficulty` — audit fix: it read the raw scenario difficulty,
  ignoring the Astrologers "Rulebook" easing every other neutral draw honours).
- **Random Settlement Ⅶ is printed-style machinery, not a new flow**: the
  designation forces `{ location: "settlement", difficulty: 7 }` — guarded
  settlements are already printed content (F1 prints a difficulty-3 one), so
  the fight→`SETTLEMENT_CHOICE` (resource pick)→flag→income path is the
  existing one; `field.randomSettlement` only tags it so the hold-with-grail
  `random-settlement` target can tell it from printed settlements.
- **hold-with-grail control reads are flag-based** (`playerControlsField`:
  flag, or the unflagged field of an own TownState); "starting-town" means a
  Town whose `TownState.controllerId` is the player AND whose field they still
  control — a captured home town stops counting via the flag.
- **Grail possession is ONE shared read** — `playerPossessesGrail` in
  `victory-points.ts` (audit de-dup; adventure.ts re-exports it): carried by
  an own hero, or built on a field the player controls. Digging alone,
  conquering a dig site, and "delivered" never count (delivery is the grail
  win path; completion VP covers the completer). Feeds BOTH the
  `grailPossessionVp` scoring row and every hold-with-grail tick — never
  re-implement this read.
- **Abstract hold-with-grail progress** (`adventure.holdWithGrailProgress`,
  keyed per condition) ticks at round start inside `tickSettlementHoldControl`;
  at most ONE seat holds a counter (possessing the Grail is exclusive), a
  round where nobody qualifies DELETES the entry (no stale progress), and the
  win is declared by the reducer-tail `checkCustomWinConditions` (so it obeys
  the never-mid-battle deferral). Field-stamped holds (`holdRoundsToWin` +
  `holdRequiresGrail` on settlements / Random Towns / center objectives) keep
  their own per-field counter and reset it any round possession lapses.
- **Control VP rows**: per-field `settlementBonusVp` (tile settlement plan OR
  `centerHex.controlVp` on a Ⅶ Settlement / Random Town) scores while flagged;
  map-wide `randomTowns.vp` stacks ON TOP per controlled Random Town. Both are
  VP-mode-only presentation of already-public state.
- **Landmark bans survive onto the placed tile** (`MapTileState.excludeFeatures`)
  so the Gold/valuables resource-pick tile reassignment also refuses a banned
  landmark when swapping the tile def.

## Ⅱ–Ⅲ placement counts PHYSICAL touch at freeform seams (2026-08-03)

Reported on the saved map "Brave New World (2P)(WIP)": not one Ⅱ–Ⅲ tile could
ever be placed — the map DESIGNER drops tiles freely, so its tiles touch at
NON-interlocking offsets, and `canPlaceTileAt` counted "touching two tiles"
with `tileCentersAdjacent`, which only recognises the 6 interlocking
same-sublattice offsets (a physically touching cross-sublattice neighbour
counted as ZERO). Fix (`canPlaceTileAt` + `farTilePlacementCenters` in
adventure.ts, candidates now scanned from `tileTouchNeighbors` — all 18
distance-3 offsets, hex.ts): touch is `tileFootprintsTouch`, and a slot that
does NOT interlock with two tiles is legal ONLY where the touched tiles span
two different sublattice colors (a freeform seam, where no interlocking slot
exists at all). LIMITS: a notch between two SAME-color tiles keeps the strict
interlock demand (a skewed drop can never spoil a properly fillable hole), and
all four built-in scenario layouts have ZERO freeform touch pairs (probed), so
standard games are byte-identical. Pinned + mutation-checked both ways in
`src/engine/far-tile-freeform-touch.test.ts` (the seam placement, a
touch-only-one CONTROL, and the same-color-hole CONTROL that fails under a
blanket physical-touch relaxation).

## Ⅱ–Ⅲ hand-tile TYPE choice (OPTIONAL, lobby + map preset, default OFF) — 2026-08-08

`GameSetupOptions.farTileTypeChoice` (Game options row, default OFF ⇒
byte-identical, exact-equality CONTROL pinned) + `CustomMapPreset.
farTileTypeChoice`/`farTileTypeChoices` (designer soft-default seeding the
lobby like `farTileOpening`, with an optional RESTRICTED kind list — e.g.
["crystal","gold"]). With it ON, placing a HELD Ⅱ–Ⅲ supply tile opens a TYPE
menu instead of a blind draw: gold mine / stone (ore) mine / crystal
(valuables) mine / settlement / "No preference" — the engine then draws a
seeded-random pool tile OF that kind. Vocabulary + classification live in ONE
leaf module `src/engine/far-tile-types.ts` (the three landmark predicates
MOVED there and are re-exported from `adventure-reducer.ts`, so the menu can
never classify a tile differently from the Settlement guarantee / Ore-Mine
reroll). Rides the existing `pendingFarTileFlip` machine as `offerMode:
"type-choice"` (persisted `typeOptions` map so menu and resolution cannot
drift); protocol v22. Behaviour pinned in `far-tile-type-choice.test.ts`
(20 tests, 13 mutations killed) + the UI rows in `game-options-tabs.test.tsx`
/ `map-preset-editor.test.tsx` + the registry round-trip.

Leading with what does NOT run / deliberate limits:
- **The menu leaks pool AVAILABILITY to the whole table** (an exhausted kind
  drops out; every seat can read that) — accepted, matches the sibling blind
  menu; never WHICH tiles or their order.
- **Composes with (never replaces) `far-tile-rerolls`** — on a default BINH
  table a chosen STONE tile still opens the keep-or-reroll window after the
  draw; all kinds exhausted ⇒ classic random draw with a
  `MAP_SECRET_FEATURE_FALLBACK` note.
- **Supply-path only**: discovering a face-down Ⅱ–Ⅲ tile already on the map
  keeps its printed identity (pinned through real DISCOVER_TILE).
- **No new AI policy** (the existing far-tile-flip label scorer picks
  settlement > mine); the AFK/timeout driver answers "No preference".

## Far-tile rerolls and single-player AI (2026-07-31)

- **Ⅱ–Ⅲ tile replacement is one BINH house rule**:
  `far-tile-rerolls` controls both Ore/material-tile replacement and the
  replacement offered when the drawn tile cannot satisfy a Settlement plan.
  Official/Legacy rules keep the drawn tile; BINH enables the replacement
  behavior. Do not reintroduce a separate setup or map-preset switch.
- **Event AI decisions use public value and cost information**: Shady Auction
  bids scale with the revealed artifact's keep value and preserve a treasury
  reserve; card, mercenary, neutral-unit, gamble, discard, and pooled-resource
  event choices protect valuable holdings and compare real printed costs.
- **A defending computer prepares before resolving PvP prep**: while a human
  attack is pending, useful legal Town/build/card actions outrank combat-prep
  exit actions. The AI then accepts, retreats, surrenders, or gives up once no
  beneficial preparation remains.
- **Gold development means recruiting an actual Gold unit**: after unlocking
  the Gold dwelling, development targets preserve the cheapest Gold unit's
  printed inputs and a gold cushion, while non-Gold population/build spending
  is suppressed until that unit is recruited. Seeded premium-rush benchmarks
  assert actual `UNIT_RECRUITED` events, not merely the dwelling unlock.
## Polish Set Artifacts (OPTIONAL house rule, default OFF) — engine + UI (2026-08-07)

Eleven Artifact SETS. A player's PIECE COUNT for a set is how many DISTINCT
member cards they still own; at 2 pieces the set's first listed effect switches
on, at 3 the first two, and so on — cumulative and simultaneous, never a choice.
House rule `polish-set-artifacts` (category `polish`, **default OFF in BOTH binh
and legacy**; the lobby's Polish "Enable all" picks it up automatically because
that button is derived from `category === "polish"`). Data
`src/data/cards/artifact-sets.ts`, read layer `src/engine/artifact-sets.ts`
(a LEAF module), wiring in `adventure.ts` (income + recruit discount),
`legal-actions.ts` (offers, roll mode, spell power), `reducer.ts` (the two
handlers, the spell-damage fold, the drain lock, the tier-change sync),
`adventure-reducer.ts` (combat reset + the scry answer), `player-view.ts` (the
public status + scry masking). Protocol bumped to **v21** — `npm run
deploy:partykit` is owed after this lands, or a stale edge rejects the two new
actions. Behaviour pinned in `src/engine/artifact-sets.test.ts` (61 tests);
**26 mutations applied, 26 killed.**

### The ART + UI half (2026-08-07, the follow-up commit)

Leading with what does NOT work / the deliberate limits:
- **jsdom cannot compute CSS**, so NOTHING here proves a pixel. Every test below
  asserts the DOM element, its image URL and its dispatch — never that the set
  panel is visible, that the corner badge is unclipped, or that the command dock
  is not overflowing. There is no e2e spec for this layout.
- **SUPERSEDED (2026-08-08) — the dock no longer floods with one button per
  (power × target).** That WAS the shipped reading ("a full Angelic Alliance with
  the pick made is 5 buttons") and the user reported it as "too many boxes"; the
  combat surface is now ONE entry button + a window + board aiming (see the
  "combat set-powers window" entry below). The two MAP tiers are unchanged.
- **The set panel shows ACTIVE sets only** (pieces ≥ 2). A set at 1 piece grants
  nothing, so showing it would advertise a bonus that does not exist — there is
  no "1/6, keep collecting" progress row.
- **The map buttons live in the `HeroActionsDock`**, whose header still reads
  "Hero actions" though a set power is not a hero action; it is the map HUD's
  only generic offer surface.
- **Nothing new is added to the AI.** The dock/panel are presentation over the
  existing offers; a computer seat still ignores every set tier (engine-half
  limit, unchanged).
- **The set icon is drawn by `CardFrame`, so it appears on EVERY member card
  face everywhere** — hand, trays, piles, discard tops, opponent windows. That is
  deliberate (a piece must be recognisable wherever it is seen), but it means the
  badge also rides tiny 34–44px thumbnails where it is mostly a colour hint. A
  card whose scan is MISSING (the `SpecialtyCard` / named-text fallback) returns
  before the badge wrapper and wears none — theoretical today, since all 41
  members are core Artifacts with real scans.

What runs (each pinned by a test that fails if the wiring is removed;
**8 mutations applied, 8 killed**):
- **ART.** 11 set CARD faces at `public/assets/set-artifacts/cards/<setId>.webp`
  (743×1040, the repo's Artifact card-face size, `fit: contain` so the printed
  per-tier rules text at the bottom is never cropped) and 11 set ICONS at
  `…/icons/<setId>.webp` (256×256, transparent). Both paths are DERIVED from the
  set id (`artifactSetCardImage` / `artifactSetIconImage` in
  `src/data/cards/artifact-sets.ts`), so a file and its set cannot drift; both
  are wrapped in `assetUrl()` at every render site. Rebuild with
  `node scripts/build-set-artifact-art.mjs --src <the author's asset drop>` —
  the 2–3.5MB PNG masters are deliberately NOT committed, and that script's
  `SOURCES` table records which raw file became which set. On-disk pins (format,
  exact dimensions, alpha, a not-a-stub byte floor) in
  `src/data/assets/set-artifact-images.test.ts`; `compress-media.mjs` prices the
  family at q85 like every other text-bearing card face.
  **Every icon→set match is PROVABLE, not guessed**: each icon is the artwork
  inside its own set card's art window, verified by eye against all 11 cards. Two
  raw filenames did not name their set and are now resolved: `Obraz4.png` (an
  Office auto-export name) is **Titan's Thunder**, the lightning sword — NOT a
  generic set badge; and `miasto-dobrobytu.png` ("city of prosperity") is
  **Cornucopia**, the gem-filled horn — NOT Golden Goose, which has its own
  golden-goose statue icon. `Pedant of Reflection.png` is the author's typo (the
  card's own printed title reads "Pendant").
- **SET STATUS DISPLAY** (`ArtifactSetPanel`,
  `src/components/adventure/artifact-set-panel.tsx`): every seat's active sets as
  their set CARD face with an `N/M` pieces badge, mounted beside the Ongoing /
  Permanent tray on the MAP **and** the COMBAT screen ("to be seen all the time
  for every player"). Clicking one zooms the full card through the existing
  `zoomContent` overlay with a ✔/✖ line per printed tier. It renders EVERY
  player's sets because the count is public engine state; it re-derives nothing
  (the numbers come straight off `PlayerState.artifactSetStatus`).
- **SET ICONS ON MEMBER CARDS**: `CardFrame` (`src/components/table/seats.tsx`)
  wraps its `<img>` in `.cardSetFrame` and adds the corner `.cardSetIcon` when —
  and only when — the card is a set member AND the rule is on. The rule reaches
  it through `ArtifactSetIconsProvider`
  (`src/components/table/artifact-set-badge.tsx`, default `false`), mounted on
  both table screens; with no provider or the rule off, `CardFrame` returns
  byte-identically the bare `<img>` it always did, so every other screen and
  every isolated card-face test is untouched.
- **ACTION SURFACES — no orphan offers.** The two MAP tiers (Wizard's Well
  draw-then-discard, Diplomat's Cloak scry — the latter once per Neutral deck,
  each with its own React key) render in `HeroActionsDock`; the
  `artifact-set-scry` OPTION_CHOICE falls through to the GENERIC `PromptTray`
  (it is excluded nowhere) — pinned by clicking both printed answers. The COMBAT
  tiers go through the window below (they are deliberately NOT in
  `COMMAND_ACTION_TYPES` any more; a test asserts that, because re-adding them
  re-floods the dock).
- **THE COMBAT SET-POWERS WINDOW (2026-08-08, the user's "too many boxes"
  report).** `src/components/table/artifact-set-powers.tsx`: the pure
  `artifactSetPowerGroups(legalActions)` groups the engine's offers by the POWER
  they activate (key `select:<setId>` / `use:<setId>:<tier>[:<neutralTier>]`),
  every offer landing in exactly one group. `ArtifactSetPowerMenu` renders ONE
  `Set powers (N)` button at the bottom of the command dock (nothing at all when
  the engine offers no set activation), opening a `heroSystemModal`-shell window
  (portalled to `<body>`) with ONE row per power — set icon, set name, printed
  tier text, piece threshold. A row whose group has ≤1 target dispatches that
  offer and closes; a row with several targets ARMS the board instead: the window
  closes, `.battleCell.artifactSetTarget` glows on exactly that power's legal
  units, an aim banner appears, and clicking a unit dispatches THAT unit's own
  engine offer. Escape / the banner's Cancel / the dock's `Cancel <set>` button
  disarm, and the board auto-disarms the moment the armed power stops being
  offered. The armed value is only the group KEY, so the board always dispatches
  the offer the engine is making in the current render — never a frozen payload.
  The round-1 "at the beginning of the combat select 1 unit" tiers ride this same
  flow, which is the user's "pop-up, then choose the unit on the battlefield".
  Arming is shared by ONE context, `ArtifactSetArmingProvider`, mounted inside
  `ArtifactSetIconsProvider` (so `page.tsx` keeps its single mount and the dock
  and the board can never disagree); with no provider each component falls back
  to a local slot, which is why a test that drives dock→board must wrap both.
- **SET ICON ON THE ENLARGED CARD (2026-08-08).** `ZoomCardVisual` (`zoom.tsx`)
  wraps the zoomed face in `.cardSetFrame.zoomSetFrame` and adds the SAME
  `ArtifactSetBadge` when `useCardArtifactSetId(content.cardId)` resolves —
  identical context gate, identical asset, just sized up. `ZoomContent` gained an
  optional `cardId` (set by `cardZoomContent`), so a `zoomContent` call with a
  hand-built image (the set panel's own card view, unit zooms) carries no badge.
  Rule off / non-member / no provider ⇒ no wrapper, byte-identical old DOM.
- **STAT TOKENS ON THE CARD EDGE (2026-08-08).** Beside the four chevrons inside
  the HUD pill, a `.boardCardStatTokens` rail on the card's OUTER edge shows one
  signed chip per changed stat (`+2` Attack, `-1` Defense, `+2` Initiative, the
  HP delta), from the SAME `attackDelta` / `defenseDelta` / `healthDelta` /
  `initiativeDelta` values the chevrons use — nothing re-derived. It sits outside
  the card art, so it cannot cover the printed stat rail, the name plate or the
  HUD (whose 76% cap stays a contract, `board-card-hud-width.test.ts`).
- **LIVE-EFFECT ICONS BESIDE THE CREATURE (2026-08-10).** The mirror rail on the
  card's OUTER LEFT edge (`.boardCardEffectIcons`, `src/components/table/
  unit-effect-icons.tsx`; the right rail says how much a stat moved, this one
  says WHO granted it). Pure presentation over already-public state, re-derived
  every render by `unitEffectIcons(state, unit)`, so an icon appears and vanishes
  exactly with its source. What it draws: (a) the printed **Defense-token disc**
  (`COMBAT_TOKEN_IMAGES.defense`) whenever `unit.defenseToken` is set, from ANY
  source — a Defend action, a set tier, commander Defense grade II, an equipment
  first-hit grant; (b) one **owning-set icon** (`artifactSetIconImage`) per live
  Set-Artifact effect on that unit, tooltipped "Angelic Alliance (set) — rolls 2
  Attack dice, keeps the higher"; (c) a **generic two-dice glyph** for an
  advantage/disadvantage roll effect from a NON-set source (Shaman's Puppet, the
  Nightmare's Fear), withheld when a set icon already carries that same modifier.
  Enabled by ONE new field, `ActiveEffectDefinition.artifactSetId` (state.ts) —
  presentation METADATA, no rule reads it — stamped at the two reducer sites that
  create set effects (`selectArtifactSetUnit`, `pushArtifactSetUnitEffect`);
  absent on every non-set effect and every legacy snapshot, which simply draws no
  set icon. **WHAT ALREADY RENDERED before this**: combat TOKENS (Attack /
  Weakness / Corrosion / Paralysis + poison cubes) as `TokenChips` on the card,
  and stat SWINGS on the right rail — but a Defense token showed ONLY a shield on
  the initiative rail plus inspector text, and a Set-Artifact bonus showed nothing
  on the board at all. Leading with the LIMITS: **jsdom cannot compute CSS**, so
  only the DOM contract is pinned — position, clipping and "clear of the printed
  stat rail / name plate / HUD" are real-browser concerns with no e2e; the rail is
  `pointer-events: none` like its sibling so it can never swallow a battlefield-cell
  click, **which also means the native `title` tooltip does not fire on hover** (the
  attribute is the accessible text and the tests' contract — the icon is the
  at-a-glance signal, the unit inspector stays the text surface); a set bonus that
  is purely a stat change shows TWICE (anonymous chip right, set icon left — by
  design); PLAYER-scoped set passives (Dragon Father's spell-damage reduction) are
  a fold, not a unit effect, so they get no icon (the set status panel is their
  surface); and a printed `ATTACK_ROLL_ADVANTAGE` **ability** (Factory Halflings)
  is not an active effect and draws nothing. Pinned in
  `src/components/table/unit-effect-icons.test.tsx` (9 — the set-sourced advantage
  with its exact tooltip, the selection tier's initiative bonus, two live effects =
  two icons, a NON-participant seat seeing the same rail, effect-ended / legacy-
  untagged / plain-unit / token-spent CONTROLs, the engine's own tier-4 Defense
  token, and the non-set dice glyph). **4 mutations applied, 4 killed** (untag
  `pushArtifactSetUnitEffect` → 2 fail; untag `selectArtifactSetUnit` → 1; drop the
  board rail → 7; drop the defense-token branch → 2; drop the generic glyph → 1).
- **Test files**: `src/components/table/artifact-set-ui.test.tsx` (23 — panel,
  badge, the zoom badge, both docks, the scry tray, the one-entry dock, the
  grouped window, single-click vs board aiming, Cancel, plus a sweep driving
  EVERY offer a 6-piece / two-own-unit Angelic Alliance emits through the real
  window/board flow), `src/components/table/board.test.tsx` (the edge stat-token
  rail with a no-effect CONTROL), `src/app/page-artifact-sets.test.tsx` (2 — the
  real `page.tsx` MOUNTS, which no component test can catch) and
  `src/data/assets/set-artifact-images.test.ts` (3). Every one carries a
  rule-OFF CONTROL. **5 further mutations applied, 5 killed** (flat dock types
  restored → 3 fail; the menu removed → 6; the board target lookup neutered → 3;
  the zoom badge dropped → 1; the stat-token rail renamed → 1).

### A HOSTED client under-counted its own pieces (2026-08-08 bugfix)

Reported: "For Angelic Alliance — for now not working during combat." REPRODUCED
in a real neutral fight: the server offered the 4 bound Angelic Alliance tiers,
the browser offered ZERO. Root cause — `artifactSetPieceCount` derives the count
from the player's card ZONES, but on a HOSTED table (every single-player room and
every CLOSED multiplayer table; `redactSnapshotForViewer` gates on `room.hosted`)
the client holds a per-seat REDACTED frame in which even the VIEWER'S OWN `deck`
is a row of `HIDDEN_CARD_ID` placeholders — deck ORDER is secret from everyone,
including its owner. A player holding all 6 pieces with 4 still in the deck read
as **2** pieces in the browser, so the client activated only tier 2 and rendered
no buttons at all for tiers 3-6 — while the status panel kept showing the true
"6/6 · 5 effects", because IT reads the synced `artifactSetStatus`.

ONE seam: when an owned zone contains `HIDDEN_CARD_ID`, `artifactSetPieceCount`
takes `player.artifactSetStatus` (real PlayerState, deliberately NOT stripped by
`redactStateForSeat`) when it is HIGHER than the visible zones prove — `max`, not
`??`, so a status that has not caught up can never LOWER a count the visible cards
already justify; capped at the set's member count. `HIDDEN_CARD_ID` moved to
`state.ts` (the types leaf) so `artifact-sets.ts` can stay a leaf; `player-view.ts`
re-exports it.

Leading with the limits / why it is safe:
- **An UNMASKED read is byte-identical**: no placeholder ⇒ the branch is skipped
  and the zone scan alone decides. So the SERVER (and an OPEN, unredacted table)
  is untouched, `syncArtifactSetTiers` cannot drift, and the client can still only
  offer what the reducer's own re-derivation accepts.
- **Same fix covers the MAP tiers** (Wizard's Well / Diplomat's Cloak), which had
  the identical hole on a hosted table.
- **The round-1 window is unchanged and still a real trap**: the printed "at the
  beginning of the combat" selection is offered in combat ROUND 1 only, and tiers
  3-6 are bound to it — miss round 1 and the set does nothing for that fight.
  Deliberate, documented, not the bug.
- WHY THE EXISTING TESTS WERE GREEN: `artifact-sets.test.ts` built its combats
  in-process and read `artifactSetPowerOffers` / `getLegalActions` off the FULL
  server state — never off a redacted seat frame — so the whole hosted path was
  unexercised. Closed by a new describe block that derives the offers from
  `redactStateForSeat(state, "p1")` (what the browser does) and applies them to
  the server state. Pinned in `artifact-sets.test.ts` ("a hosted (redacted) client
  offers what the server accepts", 5 cases) + `page-artifact-sets.test.tsx`
  ("a hosted (redacted) battle table still shows the set powers button" — the real
  page, the real dock). Mutation-checked: restoring the plain zone scan fails 3,
  dropping the visible-count floor fails 1.

### The badge on EVERY card-face surface (2026-08-08 bugfix)

Reported: "No icon on this sword in small window, check all for set icon
attached." The badge was drawn by exactly TWO components — `CardFrame` and the
zoom reader — so the many surfaces that paint a card face with a RAW `<img>`
showed a set member bare. Fixed by routing them all through ONE shared pair in
`artifact-set-badge.tsx` (never per-surface badge markup): **`CardSetFrame`**
wraps a face that sits in normal flow (`.cardSetFrame` is `position: relative;
display: inline-flex`, so it sizes to the face), and **`CardSetCornerBadge`**
hangs the badge on an already-positioned tile whose face FILLS it — the
`.empoweredBadgeOverlay` precedent — because a content-sized wrapper would break a
`position: absolute; inset: 0` or `width: 100%` face. `CardFrame` and
`ZoomCardVisual` now use `CardSetFrame` too, so there is one implementation.

Fixed surfaces (all `screen.tsx`): the shared **Artifact deck's discard top** and
the player's **own discard top** (corner badge — the face is `inset: 0`), the
**pile browser** (corner badge), the **market's sell-from-hand** tiles (corner
badge; `.marketSellCard` gained `position: relative` for it — the face is
`width: 100%`), the **Pandora card row** + its kept strip, the **visit-reward /
discard-pick tiles** (`VisitRewardArt` gained an optional `cardId`, set only where
the art really IS a card's face — never for unit portraits, tile scans, resource
glyphs or the Legion "which unit" options), the **Shady Auction lot** and the
**face-up event pool** (all four wrapped).

Leading with what is NOT badged / limits:
- **`fx.tsx`'s card-FLIGHT face** (`makeCardFaceElement`) builds its `<img>` with
  `document.createElement`, outside React, so it can never read the context gate
  and stays unbadged BY DESIGN (a ~600ms animation, not a readable card).
- **`CardFrame`'s art-less fallbacks** (`cardFaceFallback` / the native
  `SpecialtyCard`) return before the wrapper. Theoretical only — all 41 members
  are core Artifacts with real scans.
- **The set PANEL's own card art is deliberately unbadged** (it shows the SET
  card, not a member face), and so are surfaces a core Artifact can never reach:
  hero-board equipment icons (anime equipment only), the commander-artifact bag,
  morale cards, the Spell Book page, unit/tile thumbs.
- **A bare `zoomContent({ image })` call still cannot badge** — only
  `zoomCard()` / `cardZoomContent()` set `content.cardId`.
- jsdom cannot compute CSS, so WHERE each badge lands (unclipped, over the art,
  clear of a count chip) is a real-browser concern; only the DOM contract is
  pinned, in `src/components/adventure/artifact-set-card-surfaces.test.tsx`
  (19 cases, every EFFECT with a rule-OFF control that asserts the same face is
  still rendered). Mutation-checked: removing the four `CardSetCornerBadge` calls
  fails 4, neutering `CardSetFrame` inside screen.tsx fails 4, dropping `cardId`
  from `rewardArtForId` fails 1.

The engine half's contract, unchanged, is what all of the above reads:
`PlayerState.artifactSetStatus` (public, per set: `pieces` / `activeTiers` /
`memberCount`), mirrored onto every player view; the three feed events
`ARTIFACT_SET_TIERS_CHANGED` / `ARTIFACT_SET_UNIT_SELECTED` /
`ARTIFACT_SET_POWER_USED` (all with `formatEvent` lines); and every activation as
an ordinary `getLegalActions` offer.

Leading with what does NOT run / the deliberate readings:
- **NO set member is missing.** All 41 members named by the mod sheet resolve to
  real Artifact cards (Titan's Gladius and Ogre's Club of Havoc live in
  `sample.ts`, the rest in `artifacts.ts`; both feed `cardLibrary`).
  `SET_ARTIFACT_MEMBERS_NOT_IN_GAME` is therefore EMPTY — it exists so a FUTURE
  member without a card is a conscious, reviewable entry rather than a silent
  drop, and the registry-hygiene test pins that no id in it actually exists.
- **"Whole Deck" is read as deck + hand + discard + IN-PLAY permanents + the
  Ongoing tray.** Losing a set bonus by PLAYING one of its members (Eversmoking
  Ring of Sulfur is both a Cornucopia piece and an income permanent) would be
  absurd, and those two zones are exactly where a played artifact lives instead
  of the discard. A card REMOVED from the game never counts. Only DISTINCT
  members count (two copies of one card are one piece).
- **The set status is PUBLIC — a designed leak.** Every seat sees every player's
  piece count and active-tier count, per the user's "to be seen all the time for
  every player". That reveals that N members sit SOMEWHERE in a player's pool,
  including their private deck and hand; it never reveals WHICH zone, WHICH
  members, or anything else about those zones. It rides REAL state
  (`PlayerState.artifactSetStatus`, synced at the `applyAction` tail like
  `syncAbilitySuppression`) rather than a view-time recompute, because a hosted
  client only holds a redacted frame with the opponents' zones masked and could
  never recompute it — `redactStateForSeat` deliberately does NOT strip it.
- **No new engine WINDOW is ever opened by a set tier.** Every activation is an
  OPTIONAL player-initiated action (`SELECT_ARTIFACT_SET_UNIT` /
  `USE_ARTIFACT_SET_POWER`, both handler-validated), so a seat that ignores every
  offer can never stall. The only pendingChoice the feature can create is the
  Diplomat's Cloak two-option scry, owned by the ACTING seat and answered by the
  ordinary `CHOOSE_OPTION` path — so `computerDecisionOwner`'s existing
  pendingChoice gate, the AFK/turn-timeout driver's `RESOLVING_ACTION_TYPES` and
  the generic OPTION_CHOICE scorer all already cover it with NO lockstep change
  (pinned: a computer seat and `nextTurnTimeoutAction` both close it).
- **"At the beginning of the combat" now means BEFORE THE FIGHTING BEGINS —
  `combat.round === 1` was NOT enough (2026-08-10 user report, REPRODUCED).**
  The old gate was the round counter alone; but in this engine a default neutral
  fight IS one round, extended a round at a time, so "round 1" was the WHOLE
  battle. Verified before the fix: the selection was offered by `getLegalActions`
  and ACCEPTED by the reducer after the player's own unit had already attacked,
  and again at the continue-or-retreat window with the entire round resolved —
  i.e. you picked "at the beginning of the combat" knowing exactly how the fight
  had gone. It is now gated by `combatStartWindowOpen`
  (`src/engine/combat-timing.ts`): combat round 1, no outcome, and NO unit has
  activated / moved / attacked. That is the SAME `combatFightingHasBegun` read
  `pvpEscapeWindowOpen` uses for the no-casualties PvP flee — extracted into that
  leaf module so the two can never drift.
  - The timing is **DECLARED IN THE DATA**, not inferred: `ArtifactSetTier.timing
    = "combat-start"` on the three tiers whose printed line says "at the
    beginning / at the start of the combat" (Angelic Alliance 2, Ironfist 2,
    Armor of the Damned 2). The old gate keyed off `effect.kind ===
    "select-unit"`, which happened to cover exactly those three but would have let
    a FUTURE beginning-of-the-combat tier run all fight. An invariant test pins
    the printed text ⇔ `timing` agreement in BOTH directions.
  - **Not over-locked**: every tier printing "Once per combat" / "during an
    attack" is untouched and still usable in round 4 with everyone bloodied
    (CONTROL-pinned on Titan's Thunder's zap and on Angelic Alliance's bound
    tier 5).
  - **Reachability** (this is why the fix needed a second seam): in a neutral
    fight the guards' pre-activation pause is often the only moment the human is
    offered anything before the first swing, so `legal-actions.ts` surfaces
    ONLY the `timing: "combat-start"` tiers in that pause
    (`addArtifactSetActions(..., combatStartOnly)`). Pinned by driving a REAL
    neutral encounter through placement into a guard-opened round 1. Deployment
    itself is NOT a window — `combat.units` is still empty while `combat.setup`
    is set, so there is no unit to select.
  - **KNOWN LIMIT**: in a PvP fight where the opponent's unit is faster AND no
    pre-activation pause opens (the off-turn side holds no reaction), the window
    can close before that side clicks. Both sides DO get the offer in the frame
    between placement finishing and the first act; there is no dedicated
    combat-start prompt, and adding one would mean pausing every PvP fight.
  Still true: once per combat per set, an OPTIONAL action that never opens a
  window, and it lays a real combat-duration `INITIATIVE_BONUS` so the activation
  order genuinely shifts (pinned by `getActivationOrder`, not by a field read).
  All of it in `artifact-sets.test.ts` ("'at the beginning of the combat' closes
  when the fighting starts", 11 cases incl. the two repros, the redacted-client
  parity, the two-fights re-arm and the data invariant) plus the board
  auto-disarm in `artifact-set-ui.test.tsx`. Mutation-checked: restoring the
  round-only gate fails 5 across both files, dropping one tier's `timing` fails
  8, removing the pause offer fails the reachability case, and neutering
  `combatFightingHasBegun` fails 8 (4 of them in the PvP-escape suites — the
  proof the predicate is genuinely shared).
- **Power of the Dragon Father prints NO selection tier**, so its four "your
  selected unit" tiers pick their target AT USE TIME (any own unit). Angelic
  Alliance / Armor of the Damned bind to their own selection tier's pick and are
  unusable until it is made; Ironfist tier 3 re-picks freely because its printed
  text says "Select 1 of your units" again.
- **"During an attack the selected enemy unit …" (Armor of the Damned 3 & 4) is
  read as a CURRENT-COMBAT-ROUND debuff**, not a reaction inside the attack
  window — the closest existing duration without adding a reaction seam. So a
  cursed enemy that attacks twice in one round suffers it twice.
- **Pendant of Reflection is AUTO-applied, not an optional pick** (the Magic
  Mirror "auto-USE" precedent — draining an enemy cast is never worse). The
  drain is LOCKED onto the cast's stack item in `makeStackItem` and the
  once-per-combat charge is spent there, so the preview, every in-window re-read
  and the resolution all subtract the same number. Unlike the Pegasi drain it
  floors at the spell's WEAKEST useful effect (`spellMinUsefulPower`), per the
  printed text.
- **Titan's Thunder's zap is SPELL damage** routed through `reducedSpellDamage`
  and the normal removal path, so a Golem's "reduce spell damage" passive or a
  Dragon Father ward can cancel it. Its bronze / bronze-or-silver tiers use the
  shared `gradeRankOfUnit`, under which a Creature-Bank defender and a WOG
  commander are TIERLESS and therefore unreachable at tiers 2–3; tier 4 ("any
  tier") does reach them.
- **Statue of Legion is ONE flat once-per-GAME-ROUND gold discount of (active
  tiers) on ANY recruit/reinforce**, added at the shared
  `totalRecruitGoldDiscount` seam and spent by `consumeRecruitVoucherFor`. It is
  NOT reserved for a unit, so it lands on whichever purchase comes first that
  round. It STACKS with Legion vouchers by addition — deliberate: the set's
  members ARE the Legion pieces, and playing one as a voucher leaves it in the
  discard where it still counts toward the set.
- **Cornucopia pays on the RESOURCE round; Golden Goose pays on EVERY round**
  (including Astrologers rounds) — that wording difference is real and is the
  reason the two income hooks sit at different points in `startAdventureRound`.
- **The AI never seeks a set.** No map-policy or card-policy scoring reads set
  membership, so a computer seat neither hoards members nor spends its
  once-per-combat tiers; it only answers the scry window through the generic
  scorer. Documented, not a bug.
- **The Diplomat's Cloak scry NEVER lifts a card off the deck** — it looks at the
  top card and only MOVES it (to the bottom) if the player says so, re-checking
  the id first. So no card can be destroyed by the window and `eliminatePlayer`
  needs no return branch for the new context (pinned).
- **`ATTACK_ROLL_ADVANTAGE` is a NEW ActiveEffectModifier**, the mirror of
  `ATTACK_ROLL_DISADVANTAGE`, read at the single `getAttackRollMode` chokepoint:
  after the two FORCED disadvantages (Shaman's Puppet, Nightmare's Fear, which
  still win) and BEFORE the ranged combat penalty, which it therefore overrides —
  the same precedence the printed Halfling ability has.
- **Default OFF ⇒ byte-identical.** Every export returns 0/[]/false, no state
  field is written, no event is emitted and no action is legal (all pinned as
  CONTROLs).

What runs, set by set (each pinned by a named test that fails if the wiring is
removed; the engine effect kind is named in `src/data/cards/artifact-sets.ts`):
- **Angelic Alliance** (6): 2 select an own unit → +1 Initiative for the combat;
  3 that unit rolls 2 Attack dice and keeps the higher; 4 it gains a Defense
  token; 5 +1 Attack; 6 +1 Defense. Tiers 3–6 are bound to the tier-2 pick, each
  once per combat.
- **Power of the Dragon Father** (7): 2 advantage roll; 3 Defense token; 4 all
  your units take 1 less Spell damage; 5 +1 Attack; 6 +1 Defense; 7 a SECOND
  stacking −1 Spell damage (2 total). Targets are free-picked at use time.
- **Titan's Thunder** (4): 2/3/4 once per combat each, 1 Spell damage to a
  selected enemy of at most bronze / silver / any tier.
- **Ironfist of the Ogre** (3): 2 select an own unit → +2 Initiative; 3 give a
  freely-picked own unit a 1-damage Fire Shield for the combat round.
- **Armor of the Damned** (4): 2 select an ENEMY unit → −1 Initiative; 3 that
  enemy rolls with disadvantage this round; 4 that enemy attacks at −1 this
  round.
- **Pendant of Reflection** (2): the first enemy Spell each combat resolves at
  −1 Spell Power (auto, floored at the spell's weakest effect).
- **Wizard's Well** (2): once per round, draw 1 then discard 1 (a map action
  using the shared `openHandDiscardChoice`).
- **Diplomat's Cloak** (2): once per round, look at the top card of a Neutral
  deck of your choice and leave it on top or send it to the bottom.
- **Cornucopia** (3): +2 building materials each Resource round; +1 valuable at 3.
- **Statue of Legion** (5): a once-per-round −1/−2/−3/−4 gold recruit or
  reinforce discount.
- **Golden Goose** (3): +2 gold at the start of EVERY round; +4 at 3 pieces.

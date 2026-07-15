# Phone UI mode — plan & contract

Status: **Phase 1 implemented** on this branch (see "What ships in Phase 1" — every
claim there is backed by a named test). Later phases are design, NOT promises;
anything not listed as shipped is NOT implemented.

## 0. The ask (user spec, condensed)

- Optimize UI/UX for phones. Question raised: "still need horizontal? if better?"
- **Before the game begins, ask the player: Computer mode or Phone mode.**
- In phone mode the layout may change completely — tabs / small windows are fine —
  so that nothing is blocked or unreadable, but it must stay smooth and nice.
- **The current computer layout must not change at all.**

## 1. Answers to the open design questions

### Portrait or landscape? (the "still need horizontal?" question)

**Portrait-first, both supported, neither forced.** Reasoning:

- Phones are held vertically; browser chrome (URL bar) eats far more of the
  short axis in landscape (~390×750 usable portrait vs ~840×320 landscape on a
  typical 6.1" phone). 320px of height is not enough for board + hand + prompts
  no matter how we arrange them, so landscape cannot be the *primary* target.
- The tab model (one full-screen panel at a time, bottom tab bar) works in both
  orientations without a separate layout: panels are flex/dvh-sized, not
  fixed-height.
- Combat is the one screen that genuinely benefits from landscape (the board is
  a 5:4 rectangle). Phone-mode CSS caps the battlefield with
  `max-width: calc((100dvh - <chrome>) * 5/4)` so rotating to landscape
  automatically gives the biggest board that fits — no separate landscape
  layout needed, rotation is simply rewarded.
- We never lock or nag about orientation (a `screen.orientation.lock()` call
  requires fullscreen, fails on iOS Safari, and annoys users). Deferred idea: a
  small dismissible "rotate for a bigger board" chip in combat portrait.

### Why an explicit mode choice instead of pure responsive CSS?

- The user explicitly wants a choice, and it protects the desktop experience by
  construction: **phone mode is opt-in, per browser** — with the preference
  unset or "computer", the markup and CSS the desktop sees are byte-identical
  to before this feature (guarded by control tests).
- A media query cannot tell a small desktop window from a phone, and players on
  tablets/touch laptops legitimately want either. Detection only picks the
  *recommended* button in the prompt; the player decides.
- Per-device (localStorage), not per-account: the same account on desktop +
  phone wants different modes on each device.

### Where does the mode live?

`localStorage["binh-ui-mode"]` = `"computer" | "phone"`, unset until answered —
exactly the existing `binh-helper-coach` pattern (`src/lib/helper-coach-preference.ts`):
null-until-answered, cross-tab `storage` event + same-tab CustomEvent, a
`useUiModePreference()` hook. It is pure presentation: **never** in `GameState`,
never sent to the server, no engine change at all.

## 2. Current layout facts (from code, 2026-07)

- The whole table is ONE component: `Home()` in `src/app/page.tsx` (~6.1k lines)
  with four render branches: map-setup lobby (`tableRoot adventureRoot setupPhase`),
  Battle-Test setup (`… sandboxSetupPhase`), the adventure map
  (`tableRoot adventureRoot`, page.tsx ~4950), and the combat table
  (`tableRoot`, page.tsx ~5860).
- Adventure map branch: `.tableTopRow` (AdventureHud + 250px `tableMenu`) →
  `.adventureMidRow` (244px `.leftRail` dock + `.mapColumn` with the SVG
  `HexMapBoard`) → `.advDecksBottom` (shared decks) → `.adventureHand` (own
  deck + permanents + hand). Chat/log/prompts are fixed overlays.
- Combat branch: `.tableTopRow` (`.combatCardStrip`: opponent bar, player dock,
  `HandFan`, morale panel + 250px `tableMenu`) → `.tableMidRow`
  (`.boardColumn`: `InitiativeRail` + `BattlefieldBoard` + `EffectsRail`;
  optional 248px `.placementColumn` during deployment; 320px `.rightRail`:
  `HeroBoard`s (sandbox), `InspectPanel`, `CommandDock`).
- The battlefield is already fluid (`width:100%; aspect-ratio:5/4;` 1fr grid
  tracks) — it shrinks on its own; the phone problem is everything AROUND it.
- The hex map is an SVG with a `{x, y, scale}` camera (buttons + opt-in wheel
  zoom, clamp 0.45–2.6). Single-finger pan already works on touch
  (`touch-action:none` + Pointer Events). **No pinch zoom existed.**
- Existing `max-width` media queries collapse the grids to one long scroll
  column below ~1020px — that is today's de-facto "phone layout": everything
  stacked, nothing reachable without scrolling past everything else. That is
  what phone mode replaces.
- All CSS is one global stylesheet (`src/app/globals.css`, desktop-first).
  Component render tests are vitest + RTL with `// @vitest-environment jsdom`
  per file; real-browser e2e specs live in `tests/e2e` (Playwright, dev server).

## 3. Architecture

### 3.1 Mode core (`src/lib/ui-mode-preference.ts`)

- `type UiMode = "computer" | "phone"`.
- `getUiModePreference() / setUiModePreference(v)` — localStorage +
  `binh-ui-mode-change` CustomEvent (same-tab) + `storage` event (cross-tab).
- `detectRecommendedUiMode()` — `(pointer: coarse)` AND short viewport side
  ≤ 820px → `"phone"`, else `"computer"`. Used ONLY to pre-highlight the
  recommended button; never auto-applies.
- `useUiModePreference()` → `{ preference, uiMode, recommended, setPreference,
  ready }`. `uiMode` is `"computer"` until the player explicitly picks
  `"phone"` — an unanswered prompt changes nothing, which is what keeps the
  desktop bit-identical.

### 3.2 The pre-game prompt (`src/components/table/ui-mode-prompt.tsx`)

- `UiModePrompt` renders on ALL four table branches (so "before the game
  begins" covers the setup lobby, and a mid-game joiner still gets asked once).
  Shows only while `ready && preference === null`; a forced pick (no dismiss),
  two buttons — 💻 Computer / 📱 Phone — with a "Recommended for this device"
  badge from `detectRecommendedUiMode()`, and a footnote that the choice is
  per-browser and switchable any time from the table menu.
- While the mode prompt is unanswered the helper-coach lobby prompt is held
  back (page.tsx gates it), so two modals never stack; it appears on the next
  render after the mode is chosen.
- `UiModeToggle` — one 📱/💻 button in the `tableMenu` status row (next to
  `MusicToggle`); in phone mode `tableMenu` is the "Menu" tab, so the same
  control serves both modes.

### 3.3 Layout switching — CSS-scoped, zero desktop delta

- Phone mode = `.phoneMode` class + `data-phone-tab="…"` attribute on the
  branch's `<main>`; ALL phone rules in one delimited block at the end of
  `globals.css`, every selector prefixed `.phoneMode` (or
  `.appShell:has(.phoneMode)` for the global header/footer, which collapse to
  reclaim vertical space; `:has` is supported by every mobile browser we
  target, and without it the header simply stays — nothing breaks).
- The existing DOM regions are NOT restructured, duplicated, or conditionally
  re-parented — the same components render in the same order; phone CSS re-lays
  them out and the active tab decides which region is visible. Game logic,
  presentation timing, sockets: untouched. In computer mode not one phone rule
  can match (no `.phoneMode` ancestor), which is the "never affect the desktop"
  guarantee, enforced by control tests.
- `PhoneTabBar` (`src/components/table/phone-tab-bar.tsx`): fixed bottom bar,
  `role="tablist"`, 44px+ touch targets, safe-area padding, per-tab badge/
  attention dot. Rendered only when `uiMode === "phone"`, only on the map and
  combat branches.

### 3.4 Tabs per surface

Adventure map (`data-phone-tab`): **Map · Hand · Army · Decks · Menu**
- Always visible: compact sticky `AdventureHud` (one scrollable row — round,
  phase, resources, End turn) + every fixed overlay (prompts, dice, feed, chat).
- Map: `.mapColumn` fills the viewport between HUD and tab bar (`dvh`-based);
  map toolbar stays; FarTileTray overlays the map as on desktop.
- Hand: `.adventureHand` becomes a full-width column — hand cards in a
  thumbable grid, then permanents, then own deck/discard/Spell Book. The Hand
  tab shows a count badge and pulses with a "Draw!" chip while the mandatory
  start-of-turn hand step (or a forced discard) is pending, so the gate that
  blocks the whole turn is never invisible.
- Army: the `.leftRail` dock (town/hero/army fly-outs open full-width instead
  of to the right, morale cards, opponent info).
- Decks: `.advDecksBottom` shared decks, full-width, scrollable.
- Menu: the `tableMenu` column (seat switch, room panel, music, UI-mode toggle,
  new-adventure) full-width.
- During a visible combat, a **Battle** tab entry appears (mirrors the existing
  "Return to the battle" banner button / `combatTab` state).

Combat (`data-phone-tab`): **Board · Hand · Menu** (+ **Map** entry in
adventure fights, mirroring the "View the adventure map" banner button)
- Board: `InitiativeRail` as a horizontally scrollable chip row, the fluid
  battlefield capped to fit BOTH axes (portrait: full width; landscape:
  `max-width` from dvh so it never overflows), then — stacked under the board —
  `CommandDock` (attack/defend/wait actions, floated first via CSS `order`),
  `EffectsRail`, `InspectPanel`, sandbox `HeroBoard`s, and during deployment
  the `PlacementPanel` (its pointer-drag already works on touch). `LogDrawer`
  stays at the bottom of the stack.
- Hand: the `.combatCardStrip` full-width — `HandFan` (wrapping grid instead of
  a 178px fan), `PlayerDock`, permanents, morale panel, opponent bar/info.
- Menu: as above.
- Reaction windows, prompt trays, dice, result modals are fixed overlays —
  visible from ANY tab, re-styled as full-width bottom sheets sitting above the
  tab bar (`bottom: calc(tabbar + safe-area)`, `max-height` + scroll).

Setup lobby & Battle-Test setup: no tabs — phone CSS collapses them to one
column with full-width cards/buttons. The mode prompt lives here in the normal
flow ("before game begin").

### 3.5 Map pinch zoom (`src/components/adventure/map-pinch.ts`)

Two-finger pinch zoom + two-finger pan for the hex map SVG:
- Pure math module — `clientToViewBox()` (the `xMidYMid meet` mapping) and
  `pinchCamera(start, current, rect, viewBox)` which scales about the moving
  pinch midpoint (the map point under your fingers stays under your fingers),
  clamped to the existing 0.45–2.6 range. Fully unit-tested (anchor invariant,
  clamp, degenerate inputs).
- `HexMapBoard` tracks active pointers; a second finger cancels the pan drag
  and enters pinch; releasing back to one finger ends the gesture (no jump).
  Mouse behaviour (click-to-move, drag threshold, wheel lock) is untouched —
  single-pointer paths are exactly the old code. Works in both UI modes (it is
  a touch gesture; it cannot fire on a mouse).

### 3.6 Small platform bits

- `src/app/layout.tsx` gains an explicit `viewport` export =
  `{ width: "device-width", initialScale: 1, viewportFit: "cover" }` — the
  first two are Next's defaults made explicit; `viewportFit` enables
  `env(safe-area-inset-*)` for the tab bar on notched phones. No visual change
  on desktop.
- `.phoneMode` sets `touch-action: manipulation` on buttons (kills the 300ms
  double-tap-zoom delay) — scoped to phone mode only.

### 3.7 What building it actually surfaced (all shipped + tested/e2e-verified)

- **Every bottom-anchored floater had to clear the tab bar.** The chat dock,
  helper-coach chip, emote React bar, market chip/panel, prompt/reaction trays
  and the "Skip animation" control all dock at `bottom:~16px` — exactly where
  the tab bar lives, and their z-indexes swallow tab taps. One consolidated
  `.phoneMode` lift moves them above the bar (found by the e2e run, not by
  eyeballing — each was a real interception).
- **The chat dock starts collapsed in phone mode** (and collapses once when
  the mode flips computer→phone — the prompt can be answered AFTER the dock
  mounted). An open chat eats half a phone screen and floated over dialogs;
  desktop keeps its start-open behaviour bit-for-bit (`chat-panel.tsx`,
  initializer + edge-triggered effect on the preference).
- **The setup lobby's own coach prompt is z-trapped** inside `.setupLobby`
  (`z-index: 1` stacking context), so the chat dock (z 200) painted over its
  buttons. Phone mode lifts the lobby via
  `.phoneMode .setupLobby:has(.helperCoachBackdrop)` while that prompt is
  open. (The trap also exists on narrow desktop windows — pre-existing,
  deliberately not touched.)
- **The whole e2e suite was already blocked by the coach prompt** (added a day
  earlier): every lobby click timed out on `helperCoachBackdrop intercepts
  pointer events` (verified on the pre-change baseline). Fixed for the entire
  suite by seeding both first-visit answers through
  `playwright.config.ts use.storageState`; `phone-ui-mode.spec.ts` opts back
  into a clean slate because the prompts ARE its subject. Also repaired the
  stale "Start the adventure" → "New Game" button name in three older specs
  (`adventure-flow`, `setup-draft` — 0/4 → 4/4 green — and
  `astrologers-proclamation`).
- **The Next dev-tools badge sits exactly on the phone Map tab** (bottom-left
  portal, dev-only) and swallowed its taps — pinned to `top-right` via
  `devIndicators` in `next.config.ts`.
- **Landscape battlefield fit**: a landscape phone has ~220px for the whole
  battlefield frame and the decorative scenery band alone eats ~100px, so in
  `.phoneMode` + `(orientation: landscape)` the band is dropped and the frame
  height-capped — the full 5×4 grid fits between HUD and tab bar (verified by
  screenshot at 844×390). Portrait keeps the full art.

## 4. What ships in Phase 1 (this branch) — with the tests that pin it

Leading with what does **NOT** run (deferred, see §6): no PWA/fullscreen, no
orientation hint chip, no hand peek strip on the Map tab, no phone-specific
Town window / map-designer / menu-page layouts (generic modal + column CSS
only), no per-decision auto tab switching. Known cosmetic limit: card-flight
FX aimed at a panel that is on a CLOSED tab (e.g. a draw animating toward the
hand while the Map tab is up) fly to an off-screen anchor — the state is
correct, only that flight's landing point is unseen; the hand badge still
updates.

| Shipped behaviour | Pinned by |
| --- | --- |
| Preference core: unset→null, set/persist, cross-source sync, recommended-mode detection matrix, hook | `src/lib/ui-mode-preference.test.ts` |
| Prompt: shows only while unanswered, forced pick, recommended badge follows detection, choosing persists + applies, never re-shows once answered | `src/components/table/ui-mode-prompt.test.tsx` |
| Tab bar: tabs render with labels/badges/attention, click switches `aria-selected`, fires `onSelect` | `src/components/table/phone-tab-bar.test.tsx` |
| Page wiring (the real thing): with `binh-ui-mode=phone`, the map branch `<main>` carries `phoneMode` + `data-phone-tab`, the tab bar renders, clicking tabs flips the attribute, Hand badge/attention reflects the pending hand step; combat branch ditto (Board/Hand/Menu); **CONTROL: computer mode renders NO `phoneMode` class, NO tab bar, NO `data-phone-tab`** — the desktop-unchanged guarantee; the mode prompt appears in the setup lobby before start and suppresses the coach prompt while open | `src/app/page-phone-mode.test.tsx` |
| Pinch math: anchor invariant, midpoint pan, clamps, `meet` letterboxing, degenerate guards | `src/components/adventure/map-pinch.test.ts` |
| Pinch wiring: two touch pointers on the SVG change the camera transform (zoom in/out about the midpoint); one pointer still pans exactly as before (CONTROL) | `src/components/adventure/map-pinch-gesture.test.tsx` |
| Real-browser layout effect (CSS actually hides/shows panels): on a 390×844 touch viewport in phone mode the pre-game prompt appears with Phone recommended, the tab bar is visible, and EACH tab swap is asserted by computed visibility (map/hand/decks/army/menu); the site header collapses; CONTROL: choosing Computer on the same phone-shaped device keeps the desktop side-by-side layout with zero phone chrome | `tests/e2e/phone-ui-mode.spec.ts` (Playwright; run via `npm run test:e2e`) — all 3 green against the dev server, 2026-07-15 |

jsdom cannot compute CSS visibility — that is exactly why the e2e spec exists;
the jsdom page test pins the class/attribute/tab-bar *wiring*, the e2e spec
pins the *visual effect*. Both must stay.

## 5. UX details & edge cases handled in Phase 1

- Mandatory hand step never hidden: Hand-tab attention pulse + "Draw!" chip
  (wired off the same `canMulligan`/`needsHandRefresh` reads the hand bar uses).
- All engine prompts (`PromptTray`, `ReactionTray`, search/reroll/result
  modals, dice) are fixed overlays → reachable from every tab; phone CSS only
  re-anchors them above the tab bar and caps their height with inner scroll.
- Chat dock and event feed float above the tab bar in phone mode.
- Deployment: board + placement panel share the Board tab (stacked), so
  touch-drag / tap-to-place both see their target.
- PvP prep, observers, parallel-turn bystanders: no special casing needed —
  those flows live in banners/panels that are visible on every tab or inside
  already-covered regions.
- Switching mode mid-game is instant and safe (pure class/attribute change);
  the toggle lives in the Menu tab / table menu.
- Tab state is per-surface (`map` remembers its tab, combat starts on Board)
  and purely local — it never touches game state.

## 6. Later phases (design only — NOT implemented)

1. **Phone Town window**: the two-page town board as a full-screen phone sheet
   with per-section accordion instead of the desktop popup.
2. **Landscape refinements**: side tab rail in landscape; "rotate for a bigger
   board" dismissible chip in combat portrait.
3. **Map tab hand peek**: a 1-row mini hand strip over the map bottom edge with
   jump-to-Hand.
4. **Menu/lobby/browser pages**: dedicated phone pass for `/menu`, `/play`,
   room browser, hall of fame (they are partially responsive already).
5. **Map designer on phone**: out of scope until requested.
6. **PWA**: manifest + icons + install prompt + fullscreen; haptics on dice.
7. **Deep links / restore last tab per room.**
8. Auto tab attention for more gates (e.g. pulse Board when a reaction window
   is open and the player sits on Menu) — Phase 1 covers the hand step; the
   fixed overlays already cover the rest functionally.

## 7. Risk notes for reviewers

- The only shared-file edits are: `page.tsx` (className/attribute plumbing, the
  prompt/tab-bar mounts, coach-prompt gate), `screen.tsx` (`HexMapBoard`
  pointer handlers for pinch), `layout.tsx` (viewport export), `globals.css`
  (append-only `.phoneMode` block + prompt/tab-bar styles). Everything else is
  new files. No engine, server, or data change of any kind.
- The desktop-unchanged guarantee is tested (the CONTROL cases in
  `page-phone-mode.test.tsx` and the e2e spec), not just asserted.
- `:has()` usage degrades gracefully (header stays visible on ancient
  browsers; layout still works).

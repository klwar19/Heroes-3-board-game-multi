# Anime mod — ONE mod, two theme packages: **Ninefold Realms** (xianxia) × **Otherworld Gate** (isekai) — design + implementation plan

> **STATUS (updated 2026-07-18): the mod SPINE + a first wave of gameplay
> systems are SHIPPED — engine-wired and covered by tests that fail if the
> logic is removed. Much of the ROSTER/CONTENT below is still a *proposal*.**
>
> **Shipped (default OFF, byte-identical when off; each with mode-off CONTROLs;
> the machine-truth is the code/tests, this list is the map):**
> - **Field Override system** (§3.10 / §9b) + **13 Ninefold single-hex
>   locations** (§5.5 / §5.8) — global mechanism, `GameSetupOptions.fieldOverrides`.
> - **Pháp Bảo artifacts** — 5 original cards, `anime.xianxiaArtifacts` (§5.10 / P0c).
> - **Cultivation & Heavenly Tribulation** — `anime.cultivation` (§5.6).
> - **Hero Grades** (Merit ladder + passive/skill tree) — `anime.heroGrades` (§3.11).
> - **Equipment** (always-on hero items + outfitter hexes) — `anime.equipment` (§3.13).
> - **Forced Battle Events** (scripted NEUTRAL combats, core mechanism) — §3.12.
> - **Visual-novel Story system** (§11) + **campaign hub & Chapter 1 of BOTH
>   campaigns** with live setup-injection (§12).
> - **Cross-mod coexistence gates** (§3.8) — base + WOG + Polish + both anime
>   packages thread into ONE game (all-on soak green).
>
> See `docs/anime-mod-session-2026-07.md` for the shipped-systems table + the
> art-TODO pointer, and CLAUDE.md's "Field Overrides & multi-pin tiles" section
> for the per-system what-runs-vs-limits detail.
>
> **Still PROPOSAL (engine-shaped in this doc, NOT implemented):** the anime
> TOWNS and their units/heroes/commanders (Fuyuki City P1, Azure Breeze P6,
> Hidden Leaf P9, Blood Demon Cult P10, Azur Lane P16), isekai + xianxia
> NEUTRALS and banks (P2 / P7), the Adventurers' Guild + quest vocabulary (P3),
> Calamity Waves (P4), Raid Bosses (P5), Traps + Quest Guards (P8), the Dungeon
> (P12), Elixir Pills + Secret Realms (P7), the destiny/karma substrate + titles
> + Gods (P11), and campaign chapters 2–7 (P13–P15). The editable Fuyuki City /
> Azure Breeze unit-card ART proofs remain art-only under `scripts/anime-art/`
> (outside `public/assets`, not playable).
>
> Per CLAUDE.md, nothing is "done" until it is engine-enforced AND covered by a
> test that fails when the logic is removed.
>
> **This document MERGES two formerly separate plans into one mod** (per the
> user's direction: "make them part of a whole mod … can select either, and
> work together as a whole"): the wuxia/xianxia plan (previously
> `docs/wuxia-mod-plan.md`, now a pointer stub — its `WuxiaModOptions` design
> is superseded by the unified `AnimeModOptions` below, and ALL of its content
> lives on here as the **Ninefold Realms package**, §5) and the anime/isekai
> brainstorm (user-provided *"anime_theme"* Word doc — three anime-styled
> factions, map objects, neutral monsters — normalized here as the
> **Otherworld Gate package**, §6, together with the systems the brainstorm
> didn't cover: Adventurer Guild, Raid Bosses, Monster Waves, Traps, the
> Dungeon, gods, and the isekai campaign with **Bin** and his cheat system).

**Reference material:** the *"Wuxia / Xianxia Expansion — Ninefold Realms /
Cửu Giới Tu Tiên"* brainstorm and the *"anime_theme"* brainstorm (both Word
docs, design notes only). Both are locked into engine-shaped slices here.

**Naming & flavor conventions.** Two registers, one rule set:
- **Ninefold Realms** content: EN primary + Vietnamese secondary in italics —
  **Foundation Establishment** (*Trúc cơ*), **Chen Fan** (*Trần Phàm*).
- **Otherworld Gate** content: the source-material names **verbatim**
  (Laffey, Saber, Jonin, Goblin Slayer…), with Japanese-romaji secondary
  flavor in italics where it helps — **the Dungeon** (*Meikyū*), **Hikari**
  (*Akatsuki no Megami*).
- Campaign/story text is bilingual **EN/VI** for BOTH packages (the shared
  story system is bilingual by construction, §11).

**Naming decision (user's call, 2026-07-16): the source anime names ship
directly.** This is a personal single-player project, so the isekai package
uses its source names as the real display names — **Fuyuki City** and the
Servant classes, the **Hidden Leaf Village** roster, the **Azur Lane**
shipgirls, **Goblin Slayer**'s party, **Titans**, **Hollows**, **Pacifista**,
**Capsule Corp Lab**, **Urahara's Shop** — exactly as the brainstorm wrote
them. Internal ids and asset filenames stay plain descriptive slugs, and all
display names/flavor live in per-package dictionaries
(`src/data/anime/terms.ts`) purely as engineering hygiene: if a rename is
ever wanted (say, for a public release) it is a data-only string swap, no
engine or asset-id change. Generated art may depict the source characters
faithfully (recognizable renditions); never trace or copy official art files
themselves.

---

## 0. Rules for the executing agent (read first, non-negotiable)

1. **CLAUDE.md governs.** "Done" = engine-executed + a test that fails if the
   logic is removed (effect-level, not data checks — CLAUDE.md §1a). Anything
   shipped display-only goes in the explicit registries
   (`DISPLAY_ONLY_ABILITIES` / `EVENTS_NOT_IMPLEMENTED`-style) and is led
   with in the report.
2. **Default OFF, byte-identical when off.** Every module gates on
   `AnimeModOptions`; legacy snapshots and tables that never touch the
   toggles behave identically. Every feature ships with mode-off CONTROL
   tests. All new `GameState`/`PlayerState` fields are optional
   (zero-migration, the Polish-rules precedent).
2b. **Single-player FIRST.** The primary audience is the user's own
   single-player table (one human + computer seats). Every module must be
   fully playable solo — the Events-deck "multiplayer only" gating is
   explicitly NOT copied anywhere in this mod. Multiplayer keeps working
   (the engine is shared and every seam in §16 stays tested), but no feature
   may be designed in a way that needs a second human to function, and the
   §17 AI gates are release-blocking, not nice-to-have.
3. **One mod, one spine.** The two packages share ONE options block, ONE
   story system, ONE campaign hub, ONE destiny/karma substrate, ONE quest
   vocabulary, ONE skin architecture and ONE new-arm ledger (§19). Never
   build a per-package copy of anything in §3. A shared arm is built once,
   parameterized; the second consumer wires data only.
4. **Reuse before invent.** §19 inventories the genuinely-new engine surface;
   everything else maps to an existing effect id / interaction / step. Do not
   add a second way to do something the engine already does.
5. **Single-player AI is a gate, not an afterthought.** Every new
   pendingChoice/visit/battle window must be scored by the computer policy
   before the phase ships (§17) — the repo has a documented history of AI
   freezes on unscored windows.
6. **Ship order is §20.** One phase = one PR-sized slice landing green
   (`npm run lint && npm run typecheck && npm test`), art included or
   explicitly placeholdered via the registries.

---

## 1. Product contract — one crest, two packages, full à la carte

A **mod** in the WOG sense: a BINH-only bundle behind ONE crest in the lobby,
with individually-toggleable modules, plus a **Story mode** hub (solo
campaigns) entered from the main menu. The lobby panel groups the modules
into two **theme packages** with quick-select buttons — **"Ninefold Realms"**
and **"Otherworld Gate"** — plus **"Everything"**; the packages are
*presets over the same flat toggles*, so any mix is legal: a table can run
xianxia towns with isekai Monster Waves, or the Adventurers' Guild alone.
"Select either, and work together as a whole" is therefore structural: either
package plays standalone, and §8 defines what additionally lights up when
both are on.

| Toggle (`AnimeModOptions`) | Pkg | Default | One-line contract |
| --- | --- | --- | --- |
| `anime.enabled` | — | OFF | Master switch (crest). Enabling under Legacy auto-switches to BINH (WOG precedent, `src/engine/index.ts:2749-2773`). Stamps the `.animeMode` skin base (§15). |
| `anime.xianxiaTowns` | 九 | OFF | Adds the 4 xianxia factions to the faction pick: **Azure Breeze Sect**, **Yaoguai Valley**, **Blood Demon Cult**, **Outer Court** (§5.1–5.4). Full BINH towns (7 unit lines, 7 buildings, 6 heroes, tile, board, Commander §7). |
| `anime.secretRealms` | 九 | OFF | 6 **Secret Realm** Creature Banks join the Far/Near piles; full `polish-bank-sizes` grade integration (§5.8). Requires `creatureBanks` (greyed otherwise, `screen.tsx:5510` pattern). |
| `anime.xianxiaNeutrals` | 九 | OFF | ~15 xianxia neutral creature cards join the Neutral decks (§5.8; data mirror of `src/data/wog.ts`). |
| `anime.elixirPills` | 九 | OFF | **Elixir Pills** consumable mini-deck — Alchemy Pavilion, Secret Realms, quests (§5.9). Morale-cards data pattern. |
| `anime.cultivation` | 九 | OFF | Per-hero **Cultivation Realm track** + **Heavenly Tribulation** breakthrough gauntlet (§5.6). |
| `anime.destiny` | 九 | OFF | **Destiny & Karma**: the shared karma/fate substrate (§3.4) + **Mandate of Heaven** / **Demon Emperor** titles (§5.7). |
| `anime.isekaiTowns` | 門 | OFF | Adds the isekai factions: **Fuyuki City** and the **Hidden Leaf Village** (V1), the **Azur Lane Naval Base** (stretch) (§6.1–6.3). **Bin** ships as a Fuyuki City hero, playable on any table — single-player included. |
| `anime.isekaiNeutrals` | 門 | OFF | ~15 isekai neutral cards (the goblin family, slimes, **Titans**, **Hollows**, **Pacifista** — §6.8) + 4 isekai **Creature Banks** (bank half requires `creatureBanks`). |
| `anime.guild` | 門 | OFF | The **Adventurers' Guild**: global commission board, per-player ranks F→S with perks, rank-A **Party Member** unique neutrals (§6.4). Map-independent. |
| `anime.monsterWaves` | 門 | OFF | **Calamity Waves**: scheduled monster invasions; every live seat fights a themed wave army; loss = pillage (§6.6). Cadence select (3rd/4th/5th round). Works in single-player. |
| `anime.raidBosses` | 門 | OFF | **Raid Bosses**: persistent multi-layer world bosses — announced spawns or designer **Rift Lairs**, wounds persist between attempts, escalate if ignored, pay per layer broken (§6.5). |
| `anime.dungeon` | 門 | OFF | **The Dungeon** (*Meikyū*): one repeatable multi-floor delve per map, per-player floor progress, floor bosses, scaling rewards (§6.7.3). Requires `creatureBanks`. |
| `anime.gods` | 門 | OFF | **Patron Blessings**: pick a patron deity (small passive + once-per-game Miracle); the antagonist god's wave hook (§6.9). Also lights the §3.4 substrate. |
| `anime.fieldOverrides` | both | OFF | **Single-hex Field Overrides** (§3.10 / §9b): on Far/Near/Center (and optional other groups) tile reveal, a catalog object may replace one legal hex with a real location (random place / manual pick / manual-or-refuse). Designer may pin overrides on face-up tiles or face-down pending hexes. Map-setup choice for placement mode. |
| `anime.xianxiaArtifacts` | 九 | OFF | Ninefold **Pháp Bảo** artifact cards join the Artifact deck(s) (§5.10). |
| `anime.heartDemon` | 九 | OFF | **Tâm Ma** (*Heart Demon*) combat status token + Evil-sect / spell producers (§5.11). |
| *(designer content — no toggle)* | both | n/a | **Quest Guards** (§9), **Field Override palette** (§9b) and **Traps** (§6.7.1) are map-designer objects usable once `anime.enabled` (field overrides also need `fieldOverrides` or a designer pin); **Rift Lair** objects additionally need `raidBosses` (dropped with a setup problem otherwise). Story timed-events ride the existing designer machinery (§11). |
| Story mode | both | n/a | The campaign hub: **"The Jianghu Chronicle"** (Chen Fan, §12.1) and **"Bin's Otherworld Chronicle"** (Bin, §12.2), plus the stretch convergence arc (§12.3). Menu entry, single-player infrastructure. |

Module dependency edges (enforced in the lobby UI like `creatureBanks` →
`polish-bank-sizes`): `secretRealms` and `dungeon` and the bank half of
`isekaiNeutrals` require `creatureBanks`; `elixirPills` is required for the
Alchemy Pavilion's pill shop and the Guild Shop's pill stock (both fall back
gracefully, stated on the definitions); `destiny` OR `gods` activates the
shared substrate (§3.4); Party Member recruiting requires `isekaiNeutrals`;
karma-gated quests are inert without the substrate (documented in the
designer). Everything else is independent — including cross-package mixes.
The **WOG mod is a separate, composable crest**: all three option blocks
(WOG + both anime packages) on one table is a supported, tested
configuration — §3.9.

**Ranked/MMR policy:** anime tables record W/L like any table; `ranked`
stays whatever the room set. No Elo special-casing (mod flags are just game
options). On the primary single-player tables this is moot — `sp-` rooms
are never match-reported (existing invariant).

---

## 2. Setting & world build — one cosmology (presentation layer)

One world, two continents, one catastrophe. When the heavenly seal cracked,
outer-realm demons and strange qi poured into the mortal lands of the
**Jianghu** (west) — and the same fracture tore a **Gate** over the young
continent of **Restia** (east, across the sea). The two packages are the two
shores of one event, which is why they can share a table, a karma axis, and
eventually a campaign finale.

- **West (Ninefold Realms):** orthodox **sects**, **demonic cults**,
  **yaoguai** bloodlines and **merchant guilds** race for elixir pills,
  spirit stones and a seat on the path of immortal cultivation.
- **East (Otherworld Gate):** the **Divine Accord** forbids gods from acting
  directly; they may only *invest* power in mortals. **Hikari, Goddess of
  the Dawn Gate** plays by the rules — her whole remaining divinity is
  invested in her one summon, **Bin**, a modern gamer (the cheat system,
  §13). **Erebos, God of the Silent End** cheats: his "natural disasters"
  (Calamity Waves) and "wild beasts" (Raid Bosses) are Accord-skirting
  interventions. The **Adventurers' Guild** is Restia's real government:
  ranks F→S, commission boards, the receptionist **Guild Girl**, guildmaster
  **Baldur**. The **goblin problem** is the continent's gritty corner:
  individually trivial, collectively its deadliest force, hunted by one
  silent specialist (**Goblin Slayer**, §6.4.4). The **Dungeon** under the
  old capital is the Guild's living: floors, floor bosses, fair deals. And
  scattered across Restia stand the summoned enclaves — a Grail-War city, a
  shinobi village, a shipgirl harbor — pulled through the Gate from other
  worlds (the isekai conceit that lets the source rosters exist here
  as-is).

**Resource flavor is a pure re-skin** — label/tooltip subtitles under the
skin classes only (§15); resource ids, icon semantics and every engine read
are untouched. Two dictionaries in `src/data/anime/terms.ts`:

| Engine resource | Ninefold Realms (VI) | Otherworld Gate (JP register) |
| --- | --- | --- |
| Gold | Spirit Stones (*Linh thạch*) | Guild Marks |
| Building materials | Spirit Timber & Iron (*Linh mộc/linh thiết*) | Scrap & Timber |
| Valuables | Heaven-and-Earth Treasures (*Thiên tài địa bảo*) | Magicite |
| Spell cards | Arcane Arts (*Pháp thuật*) | Grimoire Pages |
| Artifact cards | Dharma Treasures (*Pháp bảo*) | Drops (*loot*) |
| Ability cards | Cultivation Manuals (*Công pháp*) | Skills |
| Morale | Dao Heart (*Đạo tâm*) | Party Spirit |
| War machines | Array Engines (*Trận khí*) | Siege Rigs |

Global-term application rule (§15): the resource subtitles use the xianxia
set when only xianxia modules are on, the isekai set when only isekai
modules are on, and stay OFF (canonical names) when both packages are active
— per-CONTENT flavor subtitles always render in their own register. Printed
card faces keep their real names everywhere.

---

## 3. The shared spine (build once; both packages consume)

### 3.1 Plumbing
`AnimeModOptions` + `DEFAULT_ANIME_OPTIONS` beside `WogModOptions`
(`src/engine/state.ts:114-126`); `anime?: AnimeModOptions` on
`GameSetupOptions` (`state.ts:8794` neighbourhood) — all booleans default
false, plus `waveCadence?: 3 | 4 | 5`. Lobby: a second crest row + "Mod
options" sub-panel in `GameOptionsPanel` cloning the WOG rows
(`screen.tsx:5793-5846`, panel at `:6006`), with the two package
quick-selects at the top. Merge/validation beside the `next.wog` block
(`engine/index.ts:2749`); Legacy force-disables
(`engine/index.ts:1730-1732`, `2733`). Gate helpers in `src/engine/anime.ts`
— `animeEnabled(state)`, `animeModuleEnabled(state, "guild" | …)` — the
single read every feature goes through (`commandersModuleEnabled` pattern,
`src/engine/commanders.ts:53`).

### 3.2 Visual-novel story system (one system, per-package themes)
Detailed in §11. The scene registry, overlay component, trigger set and
designer hooks are package-agnostic; each scene carries a
`theme?: "xianxia" | "isekai"` styling hint (ink-wash chrome vs. anime
dialogue-box chrome). Bilingual EN/VI by construction.

### 3.3 Campaign hub (one shell, N campaigns)
Detailed in §12. One `/story` route + menu entry; a **campaign registry**
lists both campaigns (and later the convergence arc); per-campaign progress
namespaced `localStorage["binh-campaign:<campaignId>"]`. Chapter definitions,
`sp-` room reuse, Golden-Finger-style picks and the System quest-log are ONE
shell with per-campaign data.

### 3.4 Destiny substrate (one currency, two skins)
`player.destiny?: { karma: number; fate: number }` (both public), activated
by `anime.destiny` OR `anime.gods`. **Karma** (−6…+6) moves ONLY on
enumerable engine events, each a named trigger with a test; alignment tags
(`alignment?: "orthodox" | "demonic"`) live on mod content definitions only —
core content carries none and never moves karma. **Fate** (0…5) incomes:
|karma| milestones (2/4/6, first crossing), quest/commission rewards marked
`fateReward`, Tribulation wins, title/S-rank income. Fate spends (all REUSE
of existing plumbing, offered exactly where morale cards already surface):
1 = reroll one of your own dice in any open reroll window (joins the
morale-card `AttackRerollSource` list, map dice included); 2 = set your
attack die to its best face (`setDieFace` source); 2 = +1 Power on your
pending cast; 3 = lethal save (Alamar/Jeddite pipeline); 1 = +1 MP on your
map turn. Labels skin per package (*Khí Vận*/karma vs **Divine
Favor**/Heroism); when both packages are on the axis is ONE number with both
income sets (§8.3).

### 3.5 Quest vocabulary (one predicate/reward language)
The Quest Guard object (§9) and the Guild commissions (§6.4.2) share ONE
predicate vocabulary — `pay-gold` / `pay-resources` / `deliver-unit-tier` /
`hero-level ≥ N` / `own-mines ≥ N` / `own-settlements ≥ N` /
`defeat-banks ≥ N` (one new per-player bank-wins counter) /
`hold-artifact-class` / `karma-at-least/at-most` (inert without the
substrate, designer-documented) — plus three additions landing with this
mod: `win-vs-family` (win a combat against a named creature family — §6.8's
`family` tags, also stamped on xianxia neutrals), `flawless-win` (win with
zero own removals), `guild-rank ≥ N` (inert without `guild`). **Rewards**
map 1:1 onto existing interactions: resources, XP, morale, movement,
`SEARCH_SHARED_DECK`, artifact draw, `RECRUIT_FREE`, `EMPOWER_ABILITY`,
Elixir Pills (pills on), +fate (substrate on).

### 3.6 Skin architecture
`animeEnabled` stamps `.animeMode` on the table root (shared chrome). Each
package's content chrome scopes under `.xianxiaTheme` / `.isekaiTheme`
content classes stamped on that package's OWN components (cards, docks,
overlays) — never on the root — so mixing packages can't collide. All rules
live in one delimited `globals.css` block, every selector prefixed, zero
effect when off (the `.phoneMode` discipline; CONTROL-pinned). §15 has the
visual language.

### 3.7 Shared-arm policy
Every new ability/effect arm used by content from both packages is built
ONCE, parameterized, and listed in §19 with both consumers named. The second
consumer wires **data only**. (Chief cases: `ATTACK_BONUS_ADJACENT_ALLY`,
the die-face→token arm, `PLACE_TOKEN_ACTION` token variants, the charge unit
tag, the `requiresNotMoved` gate.)

### 3.8 The standing integration gates — LANDED
From P2 on, every phase re-runs: (a) the master byte-identical-when-off
CONTROL (scripted game event-log identical to `main` with `anime` absent);
(b) a fixed-seed single-player soak with **every module of both packages
AND every WOG module ON** reaching round 6 with zero stalls (joins
`single-player-soak.test.ts`); (c) the mixed-package CONTROL (one module
from each package on — no cross-talk).

**STATUS (shipped):** all four gates landed and green:
- **(a) master byte-identical-when-off CONTROL** — `src/engine/anime-coexistence.test.ts`.
  A scripted 2-human game to round 6 serializes IDENTICALLY (setup AND final
  state + event log) across `anime` absent / `undefined` / `DEFAULT_ANIME_OPTIONS`;
  a `enabled:true` build is the sensitivity control.
- **(b) the ALL-ON soak** — `src/server/anime-coexistence-soak.test.ts` (reuses
  `single-player-soak-helpers.ts`). Every shipped anime module + `fieldOverrides`
  + every WOG module + Creature Banks + Polish Unit-Stacks/Bank-Sizes + Morale
  Cards + stash Spell Book → round 6, zero stalls / negative resources; a
  round-4 variant swaps in the mutually-exclusive Polish Spell Book; a 3-opponent
  breadth run. Soft-asserts anime systems are live (overrides carved, Merit/grade/
  realm progression). HONEST LIMIT: the AI declines the optional outfitter shop,
  so it never buys Equipment in the soak (documented, not a coexistence bug).
- **(c) mixed-package no-cross-talk CONTROL** — `src/engine/anime-coexistence.test.ts`.
  An isekai field-override kind carved leaves the xianxia Cultivation/Grade event
  sequence byte-identical; the grade register keys off MODULE FLAGS not carved
  CONTENT (an isekai module flag flip is the mutation control → "core" fallback).
- **(d) display coexistence** — `src/components/anime-coexistence-display.test.tsx`.
  Realm + grade + equipment chips render together; the designer palette lists a
  xianxia and an isekai kind together; the hero-actions dock renders under all-on.
  KNOWN LIMIT surfaced: the two Equipment MARKETS (`requiresModule:"equipment"`)
  are deliberately gated out of the ungated designer palette (pinned in
  `src/engine/anime-equipment.test.ts`) — not flipped here to avoid contradicting
  that prior CONTROL; the outfitters still reach a game via the pool draw.

### 3.10 Field Overrides — single-hex replacement (SHARED spine, headline map feature)

**Product ask (locked):** a **single hex may replace any legal hex on a tile**
with a real map object that has **actual visit mechanics** (no decorative
stubs, no weird carve side-effects). There are **many** override kinds
(mod content + future core); placement is:

1. **Map designer pin** — face-up tile: exact slot at setup; face-down tile:
   pending override on a preferred physical hex (same reservation pattern as
   `plan.token` / `preferredSpaceId`), carved after reveal+rotation.
2. **Map-setup / lobby policy** — when `anime.fieldOverrides` is ON (or a
   future core-wide toggle), face-down Far / Near / Center tiles without a
   designer pin may draw from a **per-group override pool** at setup
   (stamped as `tile.pendingFieldOverride`). On reveal, placement is:
   - `random` — engine picks a legal candidate hex (seeded);
   - `manual` — discovering player picks a glowing legal hex (must place);
   - `manual-or-refuse` — player may pick a hex OR decline (token drops,
     pool entry is **not** returned — spent).
3. **Tile-group awareness** — each override kind declares which groups may
   host it (`far` / `near` / `center` / `sea` / `subterranean` / optionally
   `starting`). A Far-only kind never lands on a Center tile. Sea kinds
   demand water terrain; land kinds refuse water — REUSE
   `tokenMayCoverFieldDef` terrain split (or a shared `fieldMayHostOverride`).
4. **No weird behavior** — a carve **only** rewrites `field.location` (+
   optional `difficulty` / resource wipe) through one helper
   `carveFieldOverride` that mirrors `carveMapTokenField` (clears cubes,
   flags, bankId, gate links, grail dig, etc.). Visit flow is the normal
   `beginFieldVisit` → `LocationInteraction` pipeline. Guards use the
   standard neutral battle. Teleport-style overrides either REUSE the
   Monolith network (`location: "monolith"`) or join a named parallel
   network with the same destination rules — never a half-wired special
   case. AI treats override hexes as ordinary fields (pathfinding already
   reads location category).
5. **Coexistence (SHIPPED as multi-pin)** — a tile may host **multiple**
   overrides **and** multiple teleport tokens as long as every placement
   claims a **different** hex slot (never stacked); a same-slot collision is
   a designer problem (dropped at sanitize, first wins). A **carved** override
   hex is protected exactly like a Location Token: no token, Subterranean
   Gate half, or second override may overwrite it
   (`isFieldOverrideLocation` in the token/gate/override legality checks).
   Creature Banks still only land on Blocked Fields after reveal (unchanged);
   an override never targets a reserved bank hex after the bank is placed
   (order: rotation → bank offer → override placement, or override first
   only on non-blocked candidates — engine chooses **override before bank**
   on candidates that are not blocked, so a Blocked Field stays free for
   the bank offer).
6. **Map designer UX** — **Mod panel** button (sibling to the existing
   object/token tools): lists Field Override kinds filtered by active
   package toggles / `anime.enabled`, drag-or-arm onto a tile hex (face-up
   writes `plan.fieldOverride = { kind, slot }`; face-down writes the same
   with physical slot reservation). Standalone off-tile overrides are
   **out of V1** (on-tile only; Quest Guards / Rift Lairs stay the
   standalone object path in §9 / §6.5).
7. **Default OFF** — no pending overrides, no pool draw, designer pins on
   a map whose table has the module off are **dropped at setup with a
   problem note** (same honesty as Rift Lair without `raidBosses`).

**Types (engine-shaped):**

```ts
// GameSetupOptions / AnimeModOptions
fieldOverrides?: boolean;
/** How non-designer overrides place on reveal. Default "manual-or-refuse". */
fieldOverridePlacement?: "random" | "manual" | "manual-or-refuse";

// CustomMapTilePlan
fieldOverride?: { kind: FieldOverrideKindId; slot?: number };

// MapTileState (runtime)
pendingFieldOverride?: {
  kind: FieldOverrideKindId;
  preferredSpaceId?: MapSpaceId;
  /** true = came from the random pool (placement mode applies); false = designer pin (auto if legal, else manual fallback, no refuse). */
  fromPool?: boolean;
};

// Catalog entry (src/data/anime/field-overrides.ts + future core)
FieldOverrideDefinition {
  id, locationId, name, package?: "xianxia"|"isekai"|"shared",
  tileGroups: TileGroup[],
  terrain: "land"|"water"|"any",
  /** Optional neutral guard difficulty stamped on carve (1–7). */
  guard?: number,
  /** Cover policy — default = same forbidden set as Location Tokens. */
  coverPolicy?: "token-legal",
  implementationStatus: "implemented"|"not-implemented"
}
```

**Seams reused (do not reinvent):** `applyCustomMapTokens` /
`offerPendingTokenPlacement` / `place-map-token` OPTION_CHOICE /
`tokenMayCoverFieldDef` / `carveMapTokenField` / designer token drag /
sanitize of `plan.token`. Field overrides are a **sibling** of teleport
tokens, not a second teleporter system.

### 3.9 WOG mod compatibility (per the user: a hard requirement)

WOG is its own crest — `WogModOptions { enabled, commanders, newObjects,
newCreatures }` (`src/engine/state.ts:114-126`, `newCreatures` defaults ON).
The anime mod never reads or writes `wog.*`; instead it composes, and the
composition is tested:

- **Commanders** (`wog.commanders`): every anime/xianxia town gets its
  Commander through the SAME toggle and setup path as core factions (§7 —
  the bijection test grows to "every playable faction"; no anime-side
  commander switch). Commanders fight in **wave, Raid-Boss and Dungeon
  battles** whenever the MAIN hero fights (the existing commander-scope
  rule); the 4-army-unit deployment cap applies in those fights exactly as
  in any combat; and the tierless-both-ways convention holds — **Devour is
  bronze-gated so it can never remove a commander**, and boss/wave minions
  target the commander LAST (bank-guard convention). Each claim ships with
  a wog-on test in the owning phase.
- **Neutral decks** (`wog.newCreatures`): the WOG 15-card roster and both
  anime neutral slices merge additively into the Bronze/Silver/Gold/Azure
  decks through the one existing merge path. `family`/alignment reads
  ignore untagged cards, so a "goblin cull" commission or a karma trigger
  can never false-match a WOG card. Test: all three slices ON → deal/
  recycle clean, no false family matches, wave tables never starve.
- **Map objects** (`wog.newObjects`): WOG objects and the anime designer
  objects (Quest Guards, Traps, Rift Lairs) coexist on one map — the
  designer palette shows each behind its own gate; setup materializes both
  through the standalone-object path with no slot contention (one object
  per hex stays the invariant).
- **Gate:** §3.8(b) runs with all WOG modules on, and P1's content test
  includes a `wog.commanders`-on seat for the new town.

---

### 3.11 Hero Grades (shared system, `anime.heroGrades`) — SHIPPED

A per-hero power ranking that fits EVERY hero (core factions and both anime
packages) and coexists with Cultivation (§5.6) and the WOG/Polish rules as an
independent track. **Default OFF ⇒ byte-identical.** Engine: the leaf read-layer
`src/engine/anime-hero-grades.ts`; data `src/data/anime/hero-grades.ts`;
behaviour pinned in `src/engine/anime-hero-grades.test.ts` (every claim
mutation-checked with CONTROLs), the hero-board chip/picker in
`src/components/hero-board.test.tsx`, and the combat reaction tile in
`src/components/table/overlays.test.tsx`.

**State (MAIN hero, optional/lazily-stamped, PUBLIC):** `hero.gradeProgress`
(Merit), `hero.grade` (0..cap), `hero.gradePoints` (unspent picks),
`hero.gradeNodes` (picked node ids), `hero.heroTrainedRound`; plus
`combatStats.heroSkillsUsedThisCombat` and `player.heroSkillUsedRound`
(cooldowns). Absent === 0/none, so legacy snapshots load unchanged.

**Merit → grade** (`gainGradeProgress`, the ONE shared arm): thresholds live in a
DATA array `HERO_GRADE_MERIT_THRESHOLDS = [3, 7, 12]` — grade 1 at 3 Merit, 2 at
7, 3 at 12 (a widening 3/+4/+5 ladder: early grades from a couple of level-ups or
hex visits, grade 3 a real investment). Crossing a threshold from ANY source
auto-grades-up (+1 grade, +1 point, one `HERO_GRADE_ADVANCED` feed event per
grade).

**Merit sources (all funnel through the one arm):**
1. **Level-ups** — +1 Merit per hero level-up (beside the Cultivation level-up
   hook in `gainExperience`).
2. **Hex riders** — `anime.dai_luyen_khi` + `anime.ngo_dao_thach` grant +1 Merit
   IN ADDITION to their printed reward when on (runtime-gated at the visit-build
   seam, so the module-OFF visit is byte-identical — CONTROL-pinned).
3. **`HERO_TRAIN`** (handler-validated map action) — spend 2 MP → +1 Merit, once
   per own turn.
4. **Training Manual** (`anime.item.training_manual`, kind artifact/minor) — NOT
   in any deck (declared in `animeNeverDeckedCardIds`, excluded from the
   deck-coverage / sandbox invariants); bought for 2 gold at the Merchant Guild
   Post AND Urahara's Shop (a module-gated appended `PAY_TO` → `GAIN_HAND_CARD`);
   played on the map → +2 Merit, then removed from the game (`removeSelf`).
5. **Generic payload** — the `GAIN_GRADE_PROGRESS { amount }` effect kind the
   Manual uses is generic; any future card can carry it (that IS the arm).

**The tree — 3 tiers × 3 nodes, pick 1 per tier** (`HERO_GRADE_PICK`,
handler-validated: unspent point, tier ≤ grade, tier not full, node exists).
Passives are always-on; **skills are used actively / as reactions, NOT via
cards**, with cooldowns:
- Tier 1 — Bounty Hunter's Eye (P, +1 gold after a won combat), Provisioner (P,
  +1 building materials each Resources round), Battle Focus (S reaction, +1
  Attack on your unit's declared attack, once/combat).
- Tier 2 — Deep Pockets (P, +1 hand limit — stacks observably with Cultivation
  Foundation, +2 total), Iron Will (S reaction, +1 Defense when your unit is
  attacked, once/combat), Forced March (S map-active, +1 movement, once/round).
- Tier 3 — Arcane Insight (P, +1 spell Power), War Cry (S combat-active during
  your unit's activation, +1 Attack this activation, once/combat), Tactician (P,
  +2 gold each Resources round).

Skills are non-card offers: map/combat actives via legal-actions (`USE_HERO_SKILL`,
surfaced as a combat command button / the map `HeroActionsDock` button for the
Forced March map-active), reactions via
`getLegalReactionsForTrigger` beside the commander defense reaction
(`USE_HERO_SKILL_REACTION`, attribution + window advance exactly like
`applyCommanderCastReaction`, rendered as a bespoke reaction-tray tile). Combat
skills apply in the MAIN hero's combats only (commander-scope convention;
garrison/secondary fights offer none). The +stat buffs reuse the commander cast
machinery (an `ATTACK_BONUS`/`DEFENSE_BONUS` active effect — `current-combat-round`
for reactions folding into the triggering attack, `current-activation` for War
Cry).

**Grade-name REGISTERS (one mechanic, package-specific NAMES)** — mirrors the §2
resource-subtitle rule. Three bilingual registers indexed by grade 0..N in
`src/data/anime/hero-grades.ts`: **core** (Recruit → Veteran → Champion →
Legend), **xianxia** (Võ Giả → Cao Thủ → Tông Sư → Truyền Kỳ) and **isekai**
(Rank F → C → A → S). Resolution (`heroGradeRegisterKey`): when EXACTLY ONE
package's modules are active table-wide (module sets `XIANXIA_MODULE_FLAGS` /
`ISEKAI_MODULE_FLAGS`; the package-neutral `enabled`/`heroGrades`/`destiny` count
for neither) that package's register labels ALL heroes; when both or neither, fall
back to the player's FACTION family (`FACTION_GRADE_REGISTER`, every current
faction = core; a future anime town adds one data entry). The chip + picker use
the resolved register; **mechanics/state never change with the label.**

**Extensibility (pure data).** No literal tier number in engine logic: the grade
cap, tier gating, picker grouping and register-length checks all derive from
`HERO_GRADE_MERIT_THRESHOLDS.length`. The catalog is grouped by `tier` with any
number of nodes per tier; pick-1-per-tier is `HERO_GRADE_PICKS_PER_TIER` (a future
per-tier count is a one-line data change). The pure helpers `gradeForMerit` and
`pickableNodesFrom` take the thresholds/catalog as parameters and are tested with
a 4-tier fixture. **"Add a tier" recipe:** append a threshold to
`HERO_GRADE_MERIT_THRESHOLDS`, add the tier's nodes to `HERO_GRADE_NODES`, and
append ONE entry to every register in `HERO_GRADE_REGISTERS` (a test pins register
length === tier count + 1).

**Magnitudes-pegging (ONE power scale).** gold-after-win +1 ← Brute Soul-Reformer
(+2) softened; Resources-round +1 materials ← Inexhaustible Cart of Ore; +2 gold
← a major-artifact income tier; +1 hand limit ← Pandora / Cultivation Foundation;
+1 spell Power ← Pandora / Cultivation Nascent Soul; +1 Attack/Defense skill ←
commander Precision/Shield reaction buffs; +1 movement ← Boots-of-Speed (single
point).

**AI (no stalls).** `HERO_GRADE_PICK` scores high in map-policy (spend the point
immediately, prefer a passive at the lowest tier — no window to freeze on);
`HERO_TRAIN` / Forced March score just above `END_TURN` (taken only when idle);
War Cry scores in combat-policy just above a real attack (buff then strike); the
reaction skills score above `PASS_REACTION` in card-policy (use, don't hoard).
Optional offers auto-pass on AFK/timeout with no extra wiring.

**Adaptations / deliberate limits (leading with what does NOT run):** HERO_TRAIN
and Forced March now have a human MAP button — the compact `HeroActionsDock`
under the hero board (alongside the Cultivation Heavenly Tribulation), each shown
only while `getLegalActions` offers it and dispatching the exact payload (pinned
in `hero-actions-dock.test.tsx`); the reaction/combat grade skills still ride the
combat command dock. The AI does not specifically seek the Training Manual at a
shop (it declines the optional PAY_TO from surplus by default; buying it is a
human play). Per-package fancy grade-label fonts/art are deferred (the register
text is bilingual plain text).

### 3.12 Forced Battle Events (scripted combats) — SHIPPED (V1)

A "certain battles do certain things" system: a fight on a particular MAP FIELD
runs SCRIPTED EVENTS — a combat-long environment effect, an obstacle formation,
a timed damage pulse, or a flavor announcement — at combat-start and/or a chosen
round-start. **Default OFF ⇒ byte-identical** (a non-scripted field runs nothing;
the mechanism no-ops when the fought field carries no script). Architecture
mirrors the Field Override split (§3.10): the **mechanism is CORE**, content is a
**package**.

- **Registry (CORE, owns no scripts):** `src/data/map/combat-scripts.ts` —
  `CombatScriptDefinition { id, name:{en,vi}, locationId, requiresModule?, events, summary }`;
  `CombatScriptEvent { at:"combat-start"|"round-start", round?, effects[], announce:{en,vi} }`;
  the effect vocabulary below. `registerCombatScriptDefinitions` / `combatScriptsForLocation`.
- **Engine hook (CORE):** `src/engine/combat-scripts.ts` — resolves the fought
  field's location (`combat.context.fieldId` → `adventure.fields[id].location`),
  gates by `requiresModule`, and fires events. `combatScriptStatDelta` is the
  live read consumed by the attack/defense resolution.
- **Content (Anime package):** `src/data/anime/combat-scripts.ts` — the V1 Bí Cảnh
  scripts. Registered via a side-effect import from the engine hook (mirrors
  `field-overrides`).
- **Tests:** `src/engine/combat-scripts.test.ts` — every claim mutation-checked
  with a CONTROL (module-off / wrong-round / non-scripted / melee / PvP / sandbox).

**V1 is FULLY AUTOMATIC — the deliberate anti-AI-freeze design.** No script effect
opens a player window, choice or prompt, so the runner has nothing new to score
(proved: a computer seat fights a scripted Bí Cảnh to a win with no stall, and the
parallel-turns bystander fingerprint `parallelSlotSignature` is untouched — a
scripted combat is already the exclusive singleton interaction). Every event still
ANNOUNCES itself with a `COMBAT_SCRIPT_TRIGGERED` event (feed line + a
`combat-start` cue + `formatEvent` case) so players SEE "something happens".

**ScriptEffect vocabulary (only kinds with a proven engine seam ship):**
1. `environment-stat` — a combat-long stat modifier on a side (`attacker` /
   `defender` = the Neutral guards / `both`), optionally narrowed to one
   `unitType`, on `attack` or `defense`. Stored on `combat.combatScripts.statModifiers`
   and read LIVE at resolution (the Crag Hack `proclamationGroundAttackBonus`
   precedent), so it survives Pack→Few flips / specialty recomputes. Added
   UNCLAMPED (an environmental penalty bites an elemental unit; a bonus is not a
   "buffable attack card").
2. `damage-pulse` — N effect-damage to every living unit of a side, through the
   normal removal path (the Astral Spirit `applyElementalScourge` precedent;
   `source:{type:"system"}`, `damageKind:"effect"`, a 1-HP unit dies and
   `finishCombatIfNeeded` closes a wipe).
3. `place-obstacles` — push the given EMPTY board cells into `combat.obstacles`
   (movement is already obstacle-aware; the number-array is read live). Occupied
   cells are skipped.
4. `announce` — pure feed-line flavor (every event announces anyway).

**Trigger wiring (documented positions):** combat-start events fire in
`finalizeCombatStart` AFTER `applyCommanderCombatStart`, before the first
war-machine round (idempotent across its Wayfarer/tactics re-entries via
`combat.combatScripts.startApplied`); round-start events fire in
`advanceCombatRound` after `combat.round` is incremented (idempotent per round via
`roundsFired[]`), and once from the combat-start pass for the opening round.
**Scope:** NEUTRAL combats only — guard FIELDS **and** Creature Banks (both are
`context.kind:"neutral"`); PvP and the combat sandbox carry no fought-field
location and fire nothing (CONTROL-pinned). Every effect is per-combat; nothing
persists into the next fight.

**`requiresModule` choice:** anime locations only exist when the mod is on (their
Field Override content is master-`enabled`-gated), so the Bí Cảnh scripts gate on
`"enabled"` to MATCH — a game without anime never has a `anime.bi_canh` field to
fight on anyway, and the gate makes "module off ⇒ nothing" trivially true.

**V1 content — Bí Cảnh (Secret Realm), the only current anime kind with a guard:**
- **Linh Vụ (Spirit Mist)** — combat-start `environment-stat`: ALL RANGED units
  (both sides) −1 Attack for the whole battle.
- **Địa Mạch Trào Dâng (Earthvein Surge)** — round-start round 2 `damage-pulse`:
  1 effect damage to every unit of the ATTACKER's (the intruding hero's) side.
- (Two scripts on one location — the registry supports several per location, and
  a script supports several events.)

**Leading with what does NOT ship / deliberate limits:**
- **No V1 player-facing script effect** (no windows/choices) — pick-a-cell
  obstacle placement, "choose an environment", branching scripts are all growth.
- **No obstacle auto-pick** — `place-obstacles` takes explicit candidate cells
  (deterministic); a seeded auto-pick from the empty deploy zone is future work.
- **Creature-Bank support is by MECHANISM, not content** — a bank fight is
  `context.kind:"neutral"`, so a script keyed off a bank field's location would
  fire; there is no anime bank-script yet (banks are their own location kind).
- **No designer / campaign attachment surface yet** — scripts attach only by a
  content package registering off a location id. The intended growth path is
  data: a map-designer `scriptId` field on a placed field, and campaign
  set-pieces registering scripts on their scenario's locations — no new engine
  vocabulary needed for either, only content.

**Growth path (data-only unless noted):** future guarded content (isekai lairs,
raid arenas, campaign boss fields) attaches scripts by registering off their
location id; new effect kinds extend the `CombatScriptEffect` union with the same
"prove a reuse seam, test the observable" bar; a player-facing kind would be the
first to add a window (and its AI scoring). The `requiresModule` field already
generalises the gate to any `AnimeModOptions` flag.

### 3.13 Equipment (shared system, `anime.equipment`) — SHIPPED (V1)

Always-on hero ITEMS, distinct from Artifact cards: an item sits in one of a MAIN
hero's three slots (**weapon / armor / accessory**) and its effect runs while
equipped — never in hand, never cast, never discarded. SHARED by both packages
and every hero; independent of Hero Grades (§3.11) and Cultivation (§5.6) — all
three tracks coexist on the same hero. **Default OFF ⇒ byte-identical** (no shop
in the pool, no state stamped, every read returns 0/false/{}). Engine: the leaf
read-layer `src/engine/anime-equipment.ts`; data `src/data/anime/equipment.ts`;
behaviour pinned in `src/engine/anime-equipment.test.ts` (every claim
mutation-checked with CONTROLs), the catalog in `src/data/anime/equipment.test.ts`,
and the hero-board chips in `src/components/hero-board.test.tsx`.

**State (MAIN hero, optional/lazily-stamped, PUBLIC):** `hero.equipment?:
Partial<Record<slot,string>>` (slot → item id); plus per-combat charge flags
`combatStats.equipmentFirstAttackUsed` / `equipmentIncomingAttackUsed` (cleared in
`makeCombatShell`). Absent === nothing equipped, so legacy snapshots load
unchanged and player-view never strips it.

**Slot & replace rules.** Three slots, one item each. Buying into an OCCUPIED slot
REPLACES the previous item — the old item is gone, **no refund** (stated at the
buy step and pinned). `equipEquipment` is the one slot mutator; it emits a public
`EQUIPMENT_EQUIPPED` feed line (`replacedId` names the overwritten item).

**V1 catalog — 6 items, every effect a proven-seam REUSE pegged to a core
magnitude:**

| Item | Slot | Pkg | Cost | Effect (exactly what runs) | Seam / peg |
|------|------|-----|-----:|----------------------------|-----------|
| Iron-Blood Sword (Thiết Huyết Kiếm) | weapon | xianxia | 4 | your units' FIRST declared attack each combat +1 Attack | `getAttackStackDetails` unclamped delta, beside the combat-script delta; consumed at `finishResolvedAttack` |
| Black Tortoise Mail (Huyền Vũ Giáp) | armor | xianxia | 4 | the FIRST incoming declared attack each combat resolves at −1 Attack | same site (−1 off the attacker when the defender's owner holds the mail) |
| Cosmos Pendant (Càn Khôn Bội) | accessory | xianxia | 5 | +1 spell Power | `standingSpellPower` chokepoint (stacks with Cultivation Nascent + Arcane Insight) |
| Adventurer's Blade | weapon | isekai | 4 | +1 gold after each won combat | the Brute/Bounty-Hunter's-Eye win-gold hook (stacks to +2 with the grade node) |
| Guild-Issue Mail | armor | isekai | 4 | +1 hand limit | `effectiveHandLimit` (stacks with Cultivation Foundation + Deep Pockets → +3) |
| Supply Satchel (Túi Tiếp Tế) | accessory | shared | 5 | +1 building materials each Resources round | the `resourceRoundGain` income loop `startAdventureRound` uses |

The two combat items are **main-hero-scope** (commander convention,
`playerMainHeroInCombat`): a garrison defense / secondary-hero fight gets neither
(CONTROL-pinned). They are per-combat one-shots — the +1 rides only the first
qualifying DECLARED attack (never a retaliation, which neither benefits nor spends
the charge) and is consumed when that attack LANDS (past the lethal-save gate, so
the preview and the resolved hit agree).

**Markets — two new single-hex Field Overrides.** Rèn Binh Các (Blacksmith,
`anime-xianxia`, glyph ⚒) sells the 3 xianxia items; Adventurer Outfitter
(`anime-isekai`, glyph 🎒) sells the 3 isekai items; BOTH sell the shared Supply
Satchel. The shop menu is built dynamically in `beginFieldVisit`'s shop-append
seam (the Training-Manual pattern): a `CHOOSE_ONE` with one `BUY_EQUIPMENT
{equipmentId}` option per item the hero does NOT already own (owned ⇒ option
absent), plus "Leave". Affordability is gold-gated like a PAY_TO — legal-actions
skips an unaffordable buy (poor ⇒ option absent) and the reducer CHOOSE_ONE
backstop refuses a forged one; the `BUY_EQUIPMENT` leaf deducts the gold and
equips (replace = overwrite). Both locations carve as a NONE base (revisitable, 1
MP) so a module-off visit opens no menu.

**`requiresModule` gate (the mechanism that keeps the shops OFF when equipment is
off).** `FieldOverrideDefinition` gained `requiresModule?: keyof AnimeModOptions`;
the two outfitter kinds carry `requiresModule: "equipment"`.
`listFieldOverrideDefinitions` gained a `moduleEnabled?` predicate — a kind with
`requiresModule` is listed ONLY when the predicate allows it, and with NO predicate
it is EXCLUDED (safe default). The live pool builds
(`assignPoolFieldOverrides` / `ensurePoolFieldOverrideOnReveal`) pass
`moduleEnabled: (m) => animeModuleEnabled(state, m)`, so the outfitters join the
random pool exactly when `anime.equipment` is on and appear in NO listing
otherwise (CONTROL-pinned). The 11 existing kinds carry no `requiresModule` and are
unaffected (CONTROL). This same field generalises to gate any future module's
override content.

**AI.** In the visit policy (`map-policy.ts` CHOOSE_ONE branch) a `BUY_EQUIPMENT`
option scores above the shop's Leave option ONLY into an EMPTY slot and from
genuine surplus (`gold ≥ cost + 6`); otherwise it scores below Leave, so the seat
buys from surplus or exits cleanly (no stall, no auto-replace, drive-tested). The
AI never seeks the shop specifically.

**UI.** The hero board renders one `.hbEquip` chip per equipped item (slot glyph +
EN/VI name), beside the realm/grade chips; module-off renders nothing (CONTROL).

**Adaptations / deliberate limits (leading with what does NOT run):**
- **No map-action BUTTONS for EQUIPMENT in this slice** — buying is only through
  the outfitter visit; the hero board is a read-only display for items. (The other
  hero map actives — HERO_TRAIN, Forced March, Heavenly Tribulation — DO now have
  a human button via the map `HeroActionsDock`; only equipment purchase does not.)
- **Art-later** — all 6 items ship WITHOUT a card face (declared in
  `ANIME_EQUIPMENT_ART_PLACEHOLDERS`; the UI falls back to the slot glyph). Drop a
  `.webp` under `public/assets/anime/equipment/<slug>.webp` and remove the id.
- **No designer pin for the outfitters in V1** — they are pool-placed only (the
  designer palette passes no `moduleEnabled` predicate, so a `requiresModule` kind
  is hidden there). A designer surface is future data work.
- **The Courier's-Charm → Supply-Satchel swap (documented).** The original sketch
  had a "+1 movement point per turn" accessory (Courier's Charm), but no clean
  once-per-turn movement-income chokepoint was established (unlike the Boots
  family, which grants movement as a one-shot CARD, not a standing per-turn
  drip). Rather than invent a new arm for a cosmetic item, V1 ships the Supply
  Satchel (+1 building materials each Resources round) on the ALREADY-PROVEN
  `resourceRoundGain` seam. A per-turn movement item is a growth item once a
  standing movement-income arm exists.

**Growth path (data-mostly):** more items are pure catalog rows on the six proven
seams (attack/defense one-shots, spell Power, win-gold, hand limit, income);
per-slot fancy art/fonts and a designer pin are UI/data work; a per-turn movement
item awaits a standing movement-income arm; multi-item set bonuses would be the
first to add a NEW read (and its test bar). Magnitudes stay on the ONE power scale
shared with core / Hero Grades / Cultivation, so a new item never out-scales the
existing precedents.

---

## 4. Mod plumbing (Phase 0)

Everything in §3.1 plus: crest asset `public/assets/ui/anime-crest.webp`
(generated, §14); `.animeMode` scaffold + the two term dictionaries; the
package quick-select buttons; tests — options round-trip, Legacy force-off,
crest render, quick-select = the exact module group, and the §3.8(a) master
CONTROL.

---

## 5. Package: **Ninefold Realms** (*Cửu Giới*) — the xianxia half

*(Carried in full from the former wuxia plan; toggle names updated to the
unified block. Stats are first-pass playtest numbers tuned against existing
curves — bronze ≈ A1-2/D1/H2-3, gold ≈ A4-6/D2-3/H6-8; locking them is a
playtest gate. Ability columns cite the mechanism: REUSE = existing effect
id/kind; SHARED = a §3.7 cross-package arm; NEW = a §19 ledger arm.)*

### 5.0 What one town costs (applies to EVERY town in this plan, both packages)

Per new faction: `FactionId` union (`src/data/factions/types.ts:3-15`) + a
`TileContent` value (`src/data/map/types.ts:6-16` + `ALL_TILE_CONTENT`,
`tiles.ts:32`) + `coreFactionDefinitions` entry (`core.ts:2687`) + 7 unit
lines (`units.ts`, ability tags in `src/data/units/abilities.ts:1144`) + 7
buildings (`coreBuildingDefinitions`, `core.ts:164`, effects from the
`TownBuildingEffect` union `types.ts:120-290`) + 6 heroes
(`coreHeroDefinitions`, `core.ts:1319`) + 18 specialty cards
(`src/data/cards/adventure.ts`, `specialty.<hero>.{1,4,6}`) + a starting tile
(`src/data/map/expansion-tiles.ts`, art `public/assets/board/tiles/`) + a
town board spec (`src/data/towns/boards.ts:257+`) + a Commander (§7) + a
`<faction>-content.test.ts` mirroring `factory-content.test.ts` (art-on-disk,
playable wiring, hero→specialty→unit mapping, castle-twin mutation controls).
Lobby pick and `adventure-setup.ts` derive automatically from
`coreFactionDefinitions` + `isPlayableFaction` — but availability must
additionally gate on the package's towns toggle, which is NEW surface: extend
the lobby faction filter (`screen.tsx:7310`, `7378`) and the random/draft
pool (`screen.tsx:6992-6994`), with mode-off CONTROLs. Starting (Ⅰ) tiles are
faction-fixed and never pooled (`tiles.ts:39`).

**Authenticity rule:** each town keeps its brainstorm's visual identity
(lean-into vs avoid lists in §14) so no town reads as a re-skinned existing
faction.

### 5.1 Azure Breeze Sect (*Thanh Phong Tông*) — orthodox sword cultivators

Jade green / cloud white. Disciplined mid-tempo army: formation, retaliation,
support. Avoid: European castle knights.

| Line (level, tier, type; proof stats A/D/H/I) | Few | Pack | Mechanism |
| --- | --- | --- | --- |
| **Outer Sect Disciples** (*Ngoại môn đệ tử*) — L1, bronze, **ground**; 2/1/2/5 | — | **Sword Array**: +1 Attack while adjacent to a friendly unit | SHARED `ATTACK_BONUS_ADJACENT_ALLY` |
| **Inner Sect Swordsmen** (*Nội môn kiếm sĩ*) — L2, bronze, **ground**; 2/1/2/7 → 2/1/2/9 | Ignore combat penalties | same, higher Initiative statline | REUSE `ignore-combat-penalties` |
| **Spirit Crane** (*Linh Cầm*) — L3, silver, melee **flying**; 3/1/3/10 → 4/2/4/11 | Flying; high Initiative | same + **Wingbeat**: after dealing melee damage, push the target 1 space directly away if that space is free | REUSE `flying` / NEW `PUSH_TARGET_AWAY_1` |
| **Sect Protectors** (*Hộ tông hộ pháp*) — L4, silver, **ground**; 3/2/4/4 | Defense token (roll the Defend die when attacked) | Unlimited retaliation | REUSE `SELF_DEFENSE_TOKEN` / `unlimited-retaliation` |
| **True Inheritors** (*Chân truyền đệ tử*) — L5, gold, **ground**; 5/2/6/7 | Charge (+1 Attack on an attack after moving) | Charge + ignores retaliation | SHARED charge unit tag (generalize `commander-charge`) / REUSE `ignores-retaliation` |
| **Core Formation Master** (*Kim Đan Chân Nhân*) — L6, gold, **ranged magic**; 4/2/5/6 → 5/3/6/6 | **Magic Attack**: ranged; ignore combat penalties | same + **Talisman Aura**: when an adjacent ally is attacked and its Defense roll is 0 or −1, that ally gains +1 Defense | REUSE `ignore-combat-penalties` / NEW `ADJACENT_ALLY_DEFENSE_ON_ROLL` |
| **Mountain Guardian** (*Thủ sơn linh thú*) — L7, gold, **ground**; 5/3/8/3 → **6**/3/8/3 | **Verdant Pulse**: at the start of your turn, heal this unit and every adjacent allied unit 1 Health | same + on removal, heal every adjacent allied unit 1 | NEW `START_TURN_HEAL_SELF_AND_ADJACENT` / `ON_REMOVAL_HEAL_ADJACENT` |

Buildings: **Closed-Door Chamber** (*Bế quan thất*, City Hall —
`RESOURCE_ROUND_CHOICE` {4 gold | 1 XP}), 3 dwellings (**Outer Courtyard /
Sword Hall / Immortal Peak** — `UNLOCK_RECRUIT_TIER`), **Sect Grand Array**
(Citadel — `UNLOCK_REINFORCE`), **Scripture Repository** (*Tàng kinh các* —
`MAGE_GUILD`), **Alchemy Pavilion** (*Luyện đan các* — NEW `ELIXIR_SHOP`:
once per round pay 2 gold → draw 1 Elixir Pill; with `elixirPills` OFF the
building is a `RESOURCE_ROUND_CHOICE` {1 valuables | heal-1-visit}, stated
on the definition).

Heroes (each specialty maps to a named pattern; all I/IV/VI
implemented-or-not-shipped, never display-only): **Qingyun** (*Thanh Vân*,
might — Sword Array: I +1 Attack to a unit adjacent to an ally on attack,
mightSpecialtyOne pattern; IV/VI scale targets/amount), **Shi Jian** (*Thạch
Kiên*, might — Sect Protector defense twins), **Li Feng** (*Lý Phong*, might
— effect doubles for Outer Sect Disciples, Erdamon pattern exact), **Dan
Qing** (*Đan Thanh*, magic — heal/Power economy; VI = free pill draw per
combat, pills module), **Mo Xiang** (*Mặc Hương*, magic — Search economy,
Knowledge/recall patterns), **Wu Ming** (*Vô Danh*, magic — reinforce/
stack-layer discounts, map-economy specialty).

### 5.2 Yaoguai Valley (*Yêu Thú Cốc*) — spirit beasts

Amber / moss. Big bodies, control, terrain. Avoid: Fortress lizards, Western
beasts.

| Line | Few | Pack | Mechanism |
| --- | --- | --- | --- |
| **Spirit Foxes** (*Linh hồ*) — bronze, ground, high Init | — | Dodge: roll the Defend die when attacked | REUSE `SELF_DEFENSE_TOKEN` |
| **Tiger Yaoguai** (*Hổ yêu*) — bronze, ground | — | Fear: a "−1" on its own attack die Paralyzes the target | SHARED die-face→token arm (paralysis @ "−1"; Fearsome-combo twin) |
| **Serpent Yaoguai** (*Xà yêu*) — silver, ranged | Venom: a "+1" attack die places a Corrosion token | same + ignores retaliation | SHARED die-face→token arm (`halfling-precise-shot` twin) |
| **White Cranes** (*Bạch hạc*) — silver, flying | — | Wind dance: teleport-move | REUSE `teleport-move` (`MOVE_ANYWHERE`) |
| **Dragon Horse** (*Long mã*) — gold, ground | Charge | Charge + any positive Initiative increase gets +1 more | SHARED charge tag / REUSE `AMPLIFY_INITIATIVE_INCREASE` (Armadillo) |
| **Nine-Tailed Fox** (*Cửu vĩ hồ*) — gold, flying | [activation] Charm: place a Paralysis token on an adjacent enemy | Nine tails: full second attack against every adjacent enemy | SHARED `PLACE_TOKEN_ACTION` paralysis variant / REUSE `SECOND_ATTACK_ALL_ADJACENT_TO_SELF` (enemies-only) |
| **Black Dragon** (*Huyền long*) — gold, flying | Line breath | Breath + reduce spell damage 1 | REUSE (Gold Dragon breath / `reduce-spell-damage-1`) |

Buildings: **Beast Elixir Furnace** (City Hall — `RESOURCE_ROUND_CHOICE`
{3 gold | 1 valuables}), 3 dwellings, **Beast Vault** (Citadel —
`UNLOCK_REINFORCE` + bronze reinforce discount, Saplings-cousin archetype),
**Spirit Shrine** (`MAGE_GUILD`), **Transformation Pill Hall** (*Hóa yêu
đan* — NEW `GRANT_UNIT_STACK`: once per game, give one bronze army card a
permanent Stack layer; third activator of `armyUnitStacksActive`,
`house-rules.ts:255` precedent — see §5.6).

Heroes: **Valley Lord** (might; one beast line doubles — Erdamon), **Beast
Tamer** (might; reinforce discounts), **Dragon Rider** (might; charge/gold
buffs), **Fox Enchantress** (magic; paralysis/charm casts), **Ancient
Yaoguai** (magic; gold-tier control), **Beast Alchemist** (magic; casualty →
valuables/pill conversion).

### 5.3 Blood Demon Cult (*Huyết Ma Giáo*) — heretical glass cannon

Crimson / black. Aggression, forced discard, self-harm for power. Avoid:
plain Inferno fire.

| Line | Few | Pack | Mechanism |
| --- | --- | --- | --- |
| **Cult Initiates** (*Tà giáo tân đồ*) — bronze, ground | — | Blood tithe: on removal, owner gains 1 gold | NEW `ON_REMOVAL_OWNER_RESOURCE` |
| **Blood Thralls** (*Huyết nô*) — bronze, ground, high A / low D | — | Life drain 1 | REUSE (Vampire life drain) |
| **Blood Illusionists** (*Huyết ảo thuật sư*) — silver, ranged | A "+1" attack die places a Weakness token | [activation] place a Weakness token (Sorceress action) | SHARED die-face→token arm / REUSE `PLACE_TOKEN_ACTION` |
| **Demon Children** (*Ma đồng*) — silver, flying | — | Nightmare whisper: on its attack the enemy discards 1 card | REUSE `bank-wraith-attack-discard` (exact) |
| **Blood Venerables** (*Huyết ma tôn giả*) — gold, ground | Blood sacrifice: [activation] take 1 damage → +2 Attack this activation | same + ignores retaliation | NEW `SELF_DAMAGE_ATTACK_BOOST` |
| **Demonized Form** (*Hóa ma thể*) — gold, ground | Ongoing-effect immunity | While carrying a Stack layer: +3 Attack | REUSE `titan-ignore-ongoing` / `bank-black-dragon-stacked-attack` + `requiresStacked` |
| **Demon Dragon Avatar** (*Ma long hóa thân*) — gold, flying | Line breath | Breath + ignores retaliation | REUSE |

Buildings: **Blood Pool** (*Huyết trì*, City Hall — `RESOURCE_ROUND_CHOICE`
{3 gold | 1 valuables **and** −1 morale} — the morale-costed option is a
small NEW `CityHallOption` field), 3 dwellings, **Demon Seal** (Citadel —
`UNLOCK_REINFORCE`), **Heretical Scripture Hall** (`MAGE_GUILD`), **Blood
Altar** (*Huyết đàn* — NEW `BLOOD_ALTAR` town action: once per round remove
a hand card or an army unit card → 2 gold, or a Search (1) of its matching
deck; karma −1 per use when the substrate is on).

Heroes: **Cult Master** (might; sacrifice economy), **Blood Blade** (might;
damage twins), **Thrall Commander** (might; bronze swarm die-for-resource),
**Blood Seal Sorcerer** (magic; discard-fueled Power — Ciele own-discard
patterns), **Illusion Demon** (magic; Weakness/control), **Qi Deviation
Elder** (magic; VI = once per combat cast one spell over the limit, then
your first spell next round gets −1 Power — rider composed on the existing
over-limit machinery, Tarnum precedent).

### 5.4 Outer Court (*Ngoại Vực Ma Cung*) — outer-realm demons

Violet / star-black. Spell economy, mobility, alien elites. Avoid: Conflux
elemental colors.

| Line | Few | Pack | Mechanism |
| --- | --- | --- | --- |
| **Outer-Realm Thralls** (*Ngoại vực nô lệ*) — bronze, ground | — | +1 Power to your first spell each round | REUSE `magi-power-boost` (exact) |
| **Void Afterimages** (*Không gian mạt ảnh*) — bronze, flying | Teleport-move | Teleport-move + ignores retaliation | REUSE |
| **Demon Eyes** (*Ma nhãn*) — silver, ranged | Mark the strongest enemy at combat start; +1 Attack vs Marked | +2 vs Marked | REUSE `bounty-hunter-mark-1/2` (exact) |
| **Void Parasites** (*Trùng không yêu*) — silver, ground | Second attack vs ALL adjacent units (allies included) | enemies only | REUSE (Magic Elemental Few/Pack split, exact) |
| **Heavenly Demon Envoys** (*Thiên ma sứ*) — gold, flying | Magic Arrow immunity | + ongoing-effect immunity | REUSE (Water Elemental / `gargoyle-spell-ward`) |
| **Domain Lords** (*Vực chủ*) — gold, ground | high stats, no ability | While carrying a Stack layer: the enemy cannot cast Spells | REUSE `bank-faerie-dragon-spell-lock` + `requiresStacked` |
| **Outer-Heaven Dragon** (*Ngoại thiên long*) — gold, flying | Line breath | Breath + immune to Specialty damage | REUSE (`immune-specialty-damage`) |

Buildings: **Star Chart** (*Tinh đồ*, City Hall — `RESOURCE_ROUND_CHOICE`
{4 gold | flip one adjacent face-down tile marker for free — a NEW
lightweight `CityHallOption`}), 3 dwellings, **Realm-Breach Platform**
(Citadel — `UNLOCK_REINFORCE` + NEW rider: once per neutral combat,
extending the round costs 0 MP — a waiver on the existing
`CONTINUE_NEUTRAL_COMBAT` spend), **Outer Dantian** (`MAGE_GUILD`),
**Spatial Gate** (*Cổng không gian* — NEW `TOWN_GATE_TRAVEL`: 1 MP, move
your hero between two owned towns that both have the building, once per
turn).

Heroes: **Demon General** (might; mark & execute), **Outer Disciple**
(might; unit Power boosts), **Domain Vassal** (might; spell-lock support),
**Realm Breaker** (magic; Town-Portal-family recalls), **Void Mage** (magic;
combat teleport riders), **Ancient Outer Shade** (magic; VI = scoped
Tarnum-lite: once per combat, search a Spell deck (1), the taken spell may
be cast over the limit this combat — REUSE `TARNUM_OVERLIMIT` pipeline with
fixed parameters).

### 5.5 Nine Provinces Merchant Guild (*Thương Hội Cửu Châu*) — map module, NOT a town

Shared map content: **Merchant Guild Post** locations (Trading Post
interaction + paid neutral-card hire — REUSE `TRADING_POST` +
`PAY_TO`+`RECRUIT_FREE`), **Brotherhood Gambling Den** (Crypt-cousin
`ATTACK_DIE_TABLE` gamble, `locations.ts:407` family), and 2–3 Guild quest
lines via Quest Guards (§9). Promotion to a full town is out of scope.

### 5.6 Cultivation & Breakthrough (`anime.cultivation`)

**Unit breakthrough (presentation + one activator).** Polish **Unit Stacks**
ARE the unit-level cultivation mechanic: buying a Stack layer is the
Few→Pack→Stacked "breakthrough" fantasy. Under the xianxia skin the stack
coin badges render as realm glyphs (**Qi Refinement / Foundation / Core** —
*Luyện khí / Trúc cơ / Kim đan*) — pure skin over
`polish-unit-stacks-coin.webp`'s slot. The **Transformation Pill Hall**
(§5.2) becomes the third activator of `armyUnitStacksActive`
(`src/engine/house-rules.ts:255`); purchasing stays gated on
`polish-unit-stacks` exactly as today.

**Hero Cultivation Realm track** (per hero, optional
`hero.cultivationRealm?: 0|1|2|3`):

| Realm | Reach it by | Permanent grant (engine read) |
| --- | --- | --- |
| Qi Refinement (*Luyện khí*) | start | — |
| Foundation (*Trúc cơ*) | hero level 3, or consume a Foundation Pill | +1 hand limit |
| Core Formation (*Kim đan*) | hero level 5 AND ≥1 Secret Realm won (§8.6: a Dungeon floor-5 first-clear also satisfies it) | 1 free attack-die reroll per combat (standing `AttackRerollSource`) |
| Nascent Soul (*Nguyên anh*) | hero level 7 AND a won Heavenly Tribulation | +1 Power on your spell casts |

**Heavenly Tribulation** (*Độ kiếp*): offered (never forced) when the
Nascent threshold is met, on the player's own map turn: a seeded
3-Attack-dice gauntlet resolved as a pendingChoice flow (no battlefield) —
each die at "−1" deals 1 damage to a chosen army unit (normal removal path);
survive all three → breakthrough + draw 1 Artifact. Decline/failure = retry
next turn. Realm state is public (hero board).

**SHIPPED** (`src/engine/anime-cultivation.ts` read-layer + wiring across
`adventure.ts` / `adventure-reducer.ts` / `legal-actions.ts` / `reducer.ts`;
UI in `hero-board.tsx`; behaviour pinned in `src/engine/anime-cultivation.test.ts`
and the realm chip in `src/components/hero-board.test.tsx`, every grant
mutation-checked with a realm-below CONTROL). Track state lives on the MAIN hero
(`hero.cultivationRealm?`, lazily stamped — absent === realm 0, so module-off +
legacy snapshots never carry it; realm 3 sets `hero.tribulationWon?`, the once-
per-turn gate is `hero.tribulationAttemptedRound?`). Realms 1–2 advance
AUTOMATICALLY on hero level-up and on a bank-win finalize (one feed event per
realm, `CULTIVATION_REALM_ADVANCED`). Grants: **+1 hand limit** folded at the
single effective-hand-limit site (`effectiveHandLimit`); **1 free Attack-die
reroll/combat** as a standing `AttackRerollSource` (`cultivation` discriminator,
per-combat `combatStats.cultivationRerollUsed` cleared in `makeCombatShell`,
obeying every existing reroll-window rule incl. the Spirit-of-Oppression
lockout); **+1 spell Power** folded beside the Pandora flat bonus at the shared
`standingSpellPower` / `resolvedSpellPowerForStackItem` chokepoints. The
Tribulation is a `HEAVEN_TRIBULATION` handler-validated map action opening a
`pendingVisit` (the standard exclusive-interaction singleton, so parallel-turn
bystander gating, the fingerprint backstop, AFK/timeout default-resolution and
`eliminatePlayer` cleanup all cover it for free — verified by tests).

**Design principle (one power scale):** the grant magnitudes are deliberately
pegged to existing perk precedents — +1 hand limit = the Pandora
`handLimitBonus` magnitude, one free reroll/combat = the morale-token /
artifact reroll-source scale, +1 Power = the Pandora `spellPowerBonus` scale —
so cultivation (xianxia flavour) coexists on the SAME balance scale as the core
board game, WOG and isekai content rather than introducing a new power tier.

**ADAPTATIONS (deviate from the sketch above; each documented at the wiring
site):**
- **No Foundation-Pill path** — Elixir Pills are not shipped (`anime.elixirPills`
  is types/lobby only), so realm 1 advances by hero level 3 ALONE. The "consume a
  Foundation Pill" alternative is deferred until pills ship.
- **Core Formation gate = "≥1 CREATURE BANK won"** (not "≥1 Secret Realm won" —
  Secret Realm banks / the Dungeon are not shipped). A new mod-agnostic
  `player.bankWins?` counter (optional, additive) is incremented on EVERY bank-win
  finalize (never gated on any module — a default table gains the field after a
  bank win, nothing else reads it yet; it also seeds the future §3.5
  `defeat-banks ≥ N` quest vocabulary).
- **Toll reading = card loss, not HP damage.** Map-side army cards carry no HP, so
  each "−1" die is paid by the player's cheapest-first pick of one army card: a
  Pack flips to Few (reusing `FLIP_PACK_TO_FEW` with `source: "tribulation"`) and
  any other card is lost with the standard recycle — the same Plague /
  Monolith-toll conventions. Survive with ≥1 card → breakthrough + a Search(1)
  Artifact draw (the Creature-Bank reward machinery); an emptied army fails and
  may retry next turn.

**Cross-mod seams (each tested in `anime-cultivation.test.ts`):**
- **Polish Unit Stacks** — a Tribulation toll on a STACKED Pack sheds ONE Stack
  layer (`ARMY_STACK_LOST`, the Plague convention: Stacks ARE the unit-level
  cultivation) instead of flipping; an unstacked Pack still flips (source-
  disambiguated exactly like Plague vs Pandora Silver-Muster).
- **Spell Book (both worlds)** — the Nascent +1 Power lands on a cast from the
  ORIGINAL stash-style Spell Book (BINH default) exactly as on a hand cast
  (shared resolution chokepoint), and rides the same standing chokepoint under
  the mutually-exclusive `polish-spell-book` mode.
- **WOG Commanders** — the Core Formation reroll behaves as a normal attack-window
  source in a commander fight (no crash, offered exactly once; the commander's
  own Might dice are a separate mechanism, untouched).
- **Mixed anime packages** — cultivation reads only its own `anime.cultivation`
  flag + hero/player state, so an isekai module being on does not change any
  cultivation event or grant.

### 5.7 Destiny & Karma titles (`anime.destiny`)

Rides the §3.4 substrate. Xianxia karma sources: +1 win vs a demonic-aligned
guard/bank / complete a Quest Guard / "righteous" story options; −1 win vs
an orthodox-aligned guard / each Blood Altar use / "demonic" options /
opening a PvP battle against a player whose army strength is below 60% of
yours ("bullying the weak" — REUSE `src/engine/computer/army-strength.ts`
comparison). **Mandate of Heaven** (*Chân Mệnh Thiên Tử*) / **Demon
Emperor** (*Ma Đế*): at each Astrologers round, karma ≥ +4 (highest,
incumbent wins ties) holds the Mandate; ≤ −4 mirror-holds Demon Emperor.
Either title: +1 fate at each Astrologers round + a public chip. Bounty:
winning a PvP battle against a title holder steals 2 fate and vacates the
title until the next check. Pure state reads; no hidden information.

**The Transmigrator is campaign-only** (§13): System quest-log and cheat
picks never appear in multiplayer (a "Destiny draft" multiplayer variant is
§22 stretch, NOT scoped).

### 5.8 Secret Realms, xianxia neutrals, locations

**Secret Realm banks** (`anime.secretRealms`): 6 new
`CreatureBankDefinition`s (`src/data/map/creature-banks.ts:303` shape;
defenders from the xianxia neutral pool; `buildReward` from the
`LocationInteraction` vocabulary) joining the Far/Near piles when on:

| Bank (tier) | Guards (flavor) | Reward sketch (vocab) |
| --- | --- | --- |
| **Ruined Sect Grounds** (*Phế tích tông môn*, far) | rogue disciples + an elder | Search Ability (X-scaled) + gold |
| **Yaoguai Den** (*Yêu động*, far) | beasts | `GAIN_UNIT` (Spirit Foxes; Pack when X≥2) + `EMPOWER_ABILITY` (Hive/Conservatory twin) |
| **Demon Cavern** (*Ma huyệt*, near) | cultists + thralls | Artifact draw + morale gamble (`ATTACK_DIE_TABLE`) |
| **Ancient Alchemy Hall** (*Đan các cổ*, near) | pill golems | Elixir Pills ×(1+X/2) (valuables fallback when pills off) |
| **Heavenly Sword Tomb** (*Thiên kiếm mộ*, near) | sword spirits | `EMPOWER_ABILITY` + gold |
| **Outer-Realm Fracture** (*Ngoại vực rạn nứt*, near) | Outer Court elites | Expert-spell `SEARCH_SHARED_DECK` (5) |

Polish grade integration: with `polish-bank-sizes` on, Secret Realms roll
sizes Ⅰ–Ⅳ exactly like core banks; the sizes display as realm grades —
**Mortal / Mystic / Earth / Heaven** (*Phàm / Huyền / Địa / Thiên*) — under
the xianxia skin (label-only). Each bank supplies its
`buildPolishCreatureBankReward` row (`creature-banks.ts:363`); guards obey
`polishBankGuardLayerCap`; `polishBankMaxSize` clamps apply unchanged.
Alignment tags (§3.4): Demon Cavern/Fracture demonic, Sect Grounds/Sword
Tomb orthodox.

**Xianxia neutral slice** (`anime.xianxiaNeutrals`,
`src/data/anime/xianxia-neutrals.ts` mirroring `src/data/wog.ts`): ~15
cards, all abilities REUSE/SHARED, each with a `family` tag (§3.5) — bronze
Rogue Cultivator / Mountain Bandits / Spirit Jackals / Wandering Daoist;
silver Qi Refinement Expert / Hidden Fox / Wandering Gallant / Cult
Neophytes; gold Core-Formation Old Monster / Sword Fiend / Ancient Yaoguai /
Illusion Spirit; azure Ancient Deity Remnant / Failed Ascendant Shade /
Outer-Realm Venerable.

**Map locations** — classic xianxia single-hex objects (Field Override
catalog, §3.10 / §9b). Each is a real `locationDefinitions` entry with a
full `LocationInteraction`; placement is ONLY via Field Override (designer
or pool), never printed on stock tiles in V1.

| Location (VI) | HoMM3 twin | Engine reading (V1) | Tile groups |
| --- | --- | --- | --- |
| **Bí Cảnh** (*Secret Realm*) | Dragon Utopia (lite) | Visitable; optional guard difficulty **5** (2 silver + 1 gold flavor — engine stamps `difficulty: 5`). On win/visit: `SEARCH_SHARED_DECK` artifacts count 1 **twice** (`times: 2` → keep two) + `GAIN_RESOURCES` valuables 5 (*Thiên Tài Địa Bảo*). Distinct from the 6 **Secret Realm banks** above (those join bank piles); this is the single-hex field form. | far, near, center |
| **Kiếm Trủng** (*Sword Mound*) | Warrior's Tomb | Visitable: `SEARCH_SHARED_DECK` artifacts count 1 (free keep-one) + `GAIN_MORALE` −1 (next-combat morale; regular morale token / morale-card path). Printed tomb is Search×2 + −2; this is the softer twin. | far, near |
| **Linh Tuyền** (*Spirit Spring*) | Fountain of Youth | Visitable: `GAIN_MOVEMENT` +1 **and** clear **negative army status** for the visiting hero — engine reading: discard one held **Negative morale card** if any (morale-cards on), else remove one negative morale **token**; combat tokens do not persist on the map so no combat-token cleanse here. CONTROL: no-negative visitor still gets +1 MP. | far, near, starting |
| **Ngộ Đạo Thạch** (*Enlightenment Stone*) | Learning Stone / Scholar hybrid | Visitable, costs the normal visit stop (MP already spent to enter): `SEARCH_SHARED_DECK` **abilities** count **2** (look 2, keep 1, rest reshuffle — existing Search pipeline). Printed Learning Stone is +1 XP; this is the enlightenment twin. | far, near |
| **Trận Pháp Truyền Tống** (*Teleportation Array*) | Two-Way Monolith (user said Subterranean Gate; **mechanics match Monolith**) | Revisitable: carves as `location: "monolith"` so it joins the **existing Monolith teleport network** (1 free travel / revisit 1 MP, traveller picks when 3+, occupied skipped) — **zero new travel code** in V1, no weird parallel network. Skin label/art is the Array. A future separate Array-only network is stretch. | far, near, center, subterranean |

**Wave 2 — SHIPPED** (3 more xianxia + the first 3 isekai, all PURE REUSE of
the existing `LocationInteraction` vocabulary; no new engine arm). Effect tests:
`src/engine/anime-locations.test.ts`. These 6 kinds ship WITHOUT hex art yet:
each carries a `glyph` fallback and is declared in
`FIELD_OVERRIDE_ART_PLACEHOLDERS` (`src/data/anime/field-overrides.ts`) — drop a
`.webp` + set `image` + delete from that set to promote to full art. The
art-or-placeholder invariant and the glyph fallback (board icon mode + designer
overlay) are pinned in `field-overrides.test.ts`,
`anime-field-override-board.test.tsx`, and `map-designer.test.tsx`.

| Location | Package | HoMM3 twin | Engine reading (V1) | Tile groups |
| --- | --- | --- | --- | --- |
| **Trạm Thương Hội** (*Merchant Guild Post*, §5.5) | xianxia | Trading Post | Revisitable `TRADING_POST` — resource exchange + sell-card / war-machine (NOT `tradesOnly`). | far, near |
| **Sòng Bạc Quán** (*Gambling Den*, §5.5) | xianxia | Crypt/Sea Chest gamble | Visitable `PAY_TO` 2 gold → `ATTACK_DIE_TABLE` (+1 → 5 gold, 0 → 2 back, −1 → −1 morale). | far, near |
| **Đài Luyện Khí** (*Qi Refinement Platform*) | xianxia | — | Visitable `CHOOSE_ONE`: Meditate → `GAIN_MORALE` +1, or Push → `ATTACK_DIE_TABLE` experience gamble. **V1 REUSE reading** (§0 rule 4): the earlier "pay 1 MP → +1 Attack token next combat" needs a NEW engine arm and is NOT shipped. | far, near |
| **Capsule Corp Lab** (*Dragon Ball*) | isekai | War Machine Factory | Revisitable `WAR_MACHINE_SHOP` — buy a war machine at the lower price. | far, near, center |
| **Urahara's Shop** (*Bleach*) | isekai | curio counter | Revisitable `CHOOSE_ONE`: pay 3 gold → Search(1) Artifact, or pay 1 gold → 1 Treasure die (both `PAY_TO`). | far, near, center |
| **Hot Spring Inn** (*Onsen*) | isekai | Fountain of Youth | Visitable `CHOOSE_ONE`: `GAIN_MORALE` +1, or `GAIN_MOVEMENT` +1 (no youth/cleanse arm). | far, near |

Still on the earlier sketch, NOT yet shipped: **Foundation Stone** (free
reinforce, Hill Fort family) and **Outer-Realm Rift** (guarded teleport —
designer pin). The **Qi Refinement Platform**'s original "+1 Attack token" reading
awaits a new engine arm (see the V1 reuse note above).

### 5.9 Elixir Pills (`anime.elixirPills`)

Data pattern = Morale Cards (`src/data/cards/elixir-pills.ts` → spread into
`library.ts:19`; deck built like `makeMoraleDecks`; held on
`player.elixirPills?: CardId[]`, public face-up, cap 3 with discard-down).
10 cards: Healing Pill ×2 (combat: heal a unit 2), Qi Burst ×2 (combat: +1
Attack for the combat — morale `combat_bonus` twin), Mind-Calming ×2 (remove
one negative token OR cancel a just-drawn Negative morale card — ordering
defined at the wiring: pill offer first, absorb second), Foundation Pill ×2
(map: −2 gold on one reinforce/Stack purchase; counts as the Foundation
realm trigger), Cloud-Stepping ×1 (map: +1 MP), **Deity Transformation** ×1
(combat: after this unit's activation it may activate again this round at
−1 Attack — the one heavy card; ships LAST within its phase and is cut to a
registered `not-implemented` no-op if the second-activation machinery slips
— consciously, per CLAUDE.md). Acquisition: Alchemy Pavilion, Secret Realms,
quest/commission rewards, the Guild Shop (§8.2). Timing: combat pills
through the morale-cards SPEND/reaction seams (`addMoraleActions` twin); map
pills on your own turn.

### 5.10 Pháp Bảo — xianxia Artifact cards (`anime.xianxiaArtifacts`)

Join the shared Artifact deck(s) when the module is on (same split-deck
gates as core Artifacts). Data in `src/data/anime/artifacts.ts`, each with
`effect` + `implementationStatus`. **Weapons / Armor / Boots / Misc** map
to existing artifact slots.

| Artifact (VI) | Slot | Engine reading |
| --- | --- | --- |
| **Tru Tiên Kiếm** (*Heaven-Slaying Sword*) | Weapon | Hero +1 Attack (standing artifact stat). **Once per combat:** when an allied **Gold** unit attacks, exhaust this card to grant that attack `SECOND_ATTACK_BEHIND_TARGET` / Cleave for that strike only (REUSE line-breath / Mechanics behind-target arm; exhaust = flipped face, refreshes next combat). |
| **Bát Quái Kính** (*Bagua Mirror*) | Misc | Hero +1 Defense. **Reaction:** when an enemy Hero **casts a Spell** in combat, exhaust to **cancel** that spell (spell goes to the caster's discard with no effect — REUSE interrupt/cancel window pattern; if none exists cleanly, ships as `not-implemented` until the cancel arm lands). |
| **Đông Hoàng Chung** (*Eastern Bell*) | Armor | All allied units gain **Armored**: −1 physical damage from unit attacks (REUSE / SHARED damage-reduction arm — Iron Golem `reduce-*-damage` family parameterized to physical-only, or a new `ARMORED_KEYWORD` if physical vs spell split is required). |
| **Phong Hỏa Luân** (*Wind & Fire Wheels*) | Boots | Hero +1 Movement on the map (Boots of Speed family). In combat, allied **Bronze** units +1 Initiative (standing combat-stat aura). |
| **Túi Càn Khôn** (*Cosmic Bag*) | Misc | Resource Phase: +1 building material (Endless Sack of Wood twin — income rider). |
| **Tụ Linh Bàn** (*Spirit Gathering Board*) | Misc | Resource Phase: if the hero is in a **Town**, that player gains +2 gold (town-stationed income rider). |
| **Truyền Âm Ngọc Giản** (*Sound Transmission Jade*) | Misc | Once per round, Adventure Phase: trade resources and/or Artifact cards with **any allied hero** regardless of distance (NEW `REMOTE_ALLY_TRADE` arm; multiplayer only has meaning with ≥2 human/AI seats on the same team — on free-for-all tables the "allied" set is empty and the card is inert with a note). |

#### 5.10 — V1 STATUS (P0c shipped)

**SHIPPED (5 cards, engine-wired + mutation-checked, `src/data/anime/artifacts.ts`,
tests `src/engine/anime-artifacts.test.ts` + `src/data/anime/anime-artifacts.test.ts`).**
These are ORIGINAL cards, so the printed text is exactly what runs — no
display-only clauses. They deck-join only when `anime.xianxiaArtifacts` is on
(default OFF ⇒ byte-identical decks) and always resolve in the card library:

- **Túi Càn Khôn** (Cosmic Bag, minor, income permanent): "At the beginning of
  each Resources round, gain 1 building materials. — OR — Remove this card, then
  gain 1 building materials and 1 valuables." (Inexhaustible-Cart family;
  `resourceRoundGain`.)
- **Tụ Linh Bàn** (Spirit Gathering Board, minor, income permanent): "At the
  beginning of each Resources round, if your main Hero is in one of your Towns,
  gain 2 gold. — OR — Remove this card, then gain 3 gold." Conditional income
  runs off the NEW `resourceRoundGain.requiresHeroInTown` flag, gated at the
  single income chokepoint (`startAdventureRound` → `mainHeroInOwnTown`).
- **Phong Hỏa Luân** (Wind & Fire Wheels, major, instant): "Your Hero gains +2
  movement. — OR — Remove this card, then your Hero gains +3 movement."
  (`GAIN_HERO_MOVEMENT`; because it is a movement effect it is ALSO auto-offered
  in a neutral combat's continue-or-retreat window as a movement top-up — pinned.)
  The plan's "In combat, allied Bronze units +1 Initiative" aura is a DEFERRED
  fancy half (not printed, not run).
- **Tru Tiên Kiếm** (Heaven-Slaying Sword, relic, instant combat reaction):
  "Discard 1 card to gain +3 attack. — OR — +2 attack." (Sword-of-Judgement
  family, `ADD_COMBAT_STAT` on your unit's declared attack.) The plan's
  once-per-combat Gold-unit cleave/exhaust half is DEFERRED (not printed).
- **Bát Quái Kính** (Bagua Mirror, major, instant combat reaction): "Discard 1
  card to gain +2 defense. — OR — +1 defense." (Sentinel's-Shield family, one
  tier softer.) The plan's enemy-spell CANCEL half is DEFERRED — it needs the
  interrupt/cancel arm, which does not exist cleanly yet (not printed, not run).

**DESIGNED, NOT SHIPPED (waiting on their arms):**
- **Đông Hoàng Chung** (Eastern Bell) — army-wide Armored (−1 physical damage):
  needs a physical-only damage-reduction arm (Iron-Golem family parameterised or
  a new `ARMORED_KEYWORD`).
- **Truyền Âm Ngọc Giản** (Sound Transmission Jade) — remote allied-hero trade:
  needs the NEW `REMOTE_ALLY_TRADE` arm (and only meaningful with team seats).

### 5.11 Tâm Ma (*Heart Demon*) status token (`anime.heartDemon`)

A unique **negative combat token** (sibling of Paralysis / Weakness /
Corrosion), placed by Evil-sect units and certain Spells when the module is
on.

**Effect (engine-enforced):** when a unit carrying **Tâm Ma** becomes the
active unit, **before** its activation menu: roll one Attack die.
- Face **"0" / blank** → activation proceeds normally; token is **removed**
  after the roll.
- Face **"+1" or "−1"** (any hit / non-blank) → the unit takes **1 direct
  damage** (effect damage, normal removal path), its activation **ends
  immediately** (no move/attack/ability), and the token is **removed**.

Producers (data-only once the token arm exists): Blood Demon Cult units /
selected demonic Spells. Token is public on the unit. Mode-off: no producer
offers the place action; a snapshot that somehow carries the token is
cleared at combat start.

### 5.12 Heavenly Tribulation — Expert Destruction spell **and** cultivation gauntlet

Two distinct features share the name (do not collapse them):

1. **Spell card** *Heavenly Tribulation* (*Thiên Kiếp*) — Expert Destruction
   Magic, cost **3 Power**. Effect: target a **2×2** combat area (REUSE
   area-pick patterns from Fireball / Meteor family; if the board has no
   2×2 primitive, implement as "primary cell + three chosen adjacent toward
   a corner" with a fixed shape helper). **All** units (allied and enemy)
   in the area take **2 Magic Damage**. Each of **your** units that
   **survives** gains a permanent **+1 Attack token** for the rest of the
   combat (breakthrough). Deck join gated on xianxia spell slice / towns.
2. **Cultivation gauntlet** (§5.6) — map-side 3-die breakthrough when
   reaching Nascent Soul. Unrelated card; same flavor, different system.

### 5.13 Đoạt Xá (*Soul Possession*) — Evil Sect Magic Hero specialty

Used by a specific **Blood Demon Cult** magic hero (data row on that
roster). **Play when one of your Bronze units is destroyed in combat:**
immediately replace it with an **identical-tier enemy Bronze** unit from
the enemy's **reserve / removed / not-yet-deployed** pool if available
(engine reading: take one Bronze card from the opponent's army deck or
casualty area that matches a living enemy bronze line — if none, the
specialty fizzles). You **control** the stolen unit for the **remainder of
this combat** only (it does not join your army map-side; on combat end it
returns / is removed per normal casualty rules). NEW arm
`SOUL_POSSESSION_ON_BRONZE_DEATH` with a mode-off and "no bronze available"
CONTROL.

---

## 6. Package: **Otherworld Gate** (*Isekai no Mon*) — the isekai half

*(The isekai brainstorm normalized to the engine: the Word doc's PC-style
statlines — Init/Mov/HP, movement stats, "Line of Sight", "Mana" — do not
exist here. Every unit is re-keyed to Few/Pack sides with
attack/defense/health/initiative/cost, tiers bronze/silver/gold, and every
ability mapped to a mechanism. Anchor stat points: Phoenix gold A6/D2/H7/I12,
Enchanters gold A4/D1/H5/I5.)*

### 6.1 Fuyuki City (*Fuyuki-shi*) — the Holy Grail War town (flagship)

Violet / antique gold. Powerful independent singles, burst, spell economy.
The seven unit lines are the seven **Servant classes** of the Grail War.
Lean into leyline-lit city nights, ritual circles, Command Seals,
translucent "spirit" shimmer on gold units; avoid generic European castle
look.

| Line (tier, type) | Few | Pack | Mechanism |
| --- | --- | --- | --- |
| **Assassins** — bronze, ground (A2/D1/H2/I7) | — | Presence Concealment: +1 Defense against ranged-TYPE attackers | REUSE `DEFENSE_VS_ATTACKER_TYPE` (Shield-spell semantics) |
| **Riders** — bronze, ground (A2/D1/H2/I6) | — | Trample: a "+1" on its own attack die Paralyzes the target | SHARED die-face→token arm (paralysis @ "+1") |
| **Lancers** — bronze, ground (A2/D1/H3/I5) | Gáe Bolg (docx Reach): attack 2 spaces in a line | same + ignores retaliation (docx No Retaliation) | REUSE `mechanics-line-attack` / `ignores-retaliation` |
| **Archers** — silver, ranged (A3/D2/H3/I5) | Ignore combat penalties | same + if it has NOT moved this activation, a full second attack on the same target | REUSE `ignore-combat-penalties`; REUSE `SECOND_ATTACK_SAME_TARGET_AFTER_RETALIATION` + NEW `requiresNotMoved` gate param |
| **Casters** — silver, ranged (A2/D2/H3/I4) | +1 Power to your first spell each round | same + reduce spell damage 1 | REUSE `magi-power-boost` / `reduce-spell-damage-1` |
| **Sabers** — gold, ground (A5/D3/H5/I6) | Excalibur (docx Cleave): also attack the unit behind the target | same + Charge | REUSE `SECOND_ATTACK_BEHIND_TARGET` / SHARED charge tag |
| **Berserkers** — gold, ground (A6/D2/H7/I4) | God Hand: once per combat, when health drops to 0 set it to 1 | same + immune to all Spells (Mad Enhancement) | REUSE `phoenix-rebirth` (`abilities.ts:2120`) / `immune-all-spells` (Magic Elemental Pack) |

Buildings: **Leyline Nexus** (City Hall — the docx building, normalized to
this game's economy: `RESOURCE_ROUND_CHOICE` {4 gold | 1 XP}); dwellings
**Church on the Hill / Mage's Workshop / Throne of Heroes**
(`UNLOCK_RECRUIT_TIER`); **Command Seals** (Citadel — `UNLOCK_REINFORCE`);
**Clock Tower Archive** (`MAGE_GUILD`); **Summoning Circle** (unique — NEW
`SUMMON_GACHA`, §19: once per round pay 2 gold → roll the Attack die: "−1" =
draw a bronze Neutral card free; "0" = choose a bronze Neutral draw OR 1
gold back; "+1" = draw a silver Neutral card free. The gacha trope as dice;
drawn cards join via the normal Neutral-draw path, leftovers recycle per
engine convention; composes `PAY_TO` + `ATTACK_DIE_TABLE` + the
Mercenary-Camp draw path — the composition is the one new arm).

Heroes:

| Hero | Type | Specialty hook (pattern) |
| --- | --- | --- |
| **Bin, the Otherworlder** (*ihōjin*) | magic | The multiplayer-legal slice of the cheat fantasy: I "Status Screen" — draw 1 card at each combat start; IV "Save Scum" — once per combat, reroll any one of your own dice (standing `AttackRerollSource`, morale-card seam); VI "Admin Rights" — once per combat, cast one Spell over the per-round limit (fixed-parameter REUSE of the `TARNUM_OVERLIMIT` pipeline — the Ancient-Outer-Shade twin, §5.4) |
| **Shirou Emiya** | might | Tracing (docx): discard 1 Might card → +1 Attack for an allied unit's activation (discard-fueled patterns); IV/VI scale amount/uses. Starts with Armorer (docx) via the normal starting-ability data |
| **Rin Tohsaka** | magic | Jewel Magecraft (docx): +1 damage riders on damage spells (Deemer/Solmyr damage-ladder family). Starts with Mysticism (docx) |
| **Illyasviel** | magic | Berserker economy: rebirth-adjacent heals / God-Hand riders (unitHealthSpecialty pattern) |
| **Kiritsugu, the Magus Killer** | might | Mark & execute: +Attack vs the marked strongest enemy (bounty-mark family) |
| **Lord El-Melloi II** | magic | Summon economy: Summoning-Circle discounts / extra rolls (map-economy specialty) |

### 6.2 Hidden Leaf Village (*Konohagakure*) — the shinobi town

Leaf green / slate. Swarm tempo, mobility, battlefield control, trap
synergy. Lean into masks, scarves, headbands, hand-sign sigils, forest
canopy; avoid samurai plate.

| Line (tier, type) | Few | Pack | Mechanism |
| --- | --- | --- | --- |
| **Genin Squad** — bronze, ground | — | Swarm (docx): +1 Attack while another friendly Genin Squad is adjacent to the TARGET | SHARED `ATTACK_BONUS_ADJACENT_ALLY` (`adjacentTo: "target"` — the param the docx motivates) |
| **Medical-Nin** — bronze, ground | [activation] heal an adjacent unit 1 | [activation] heal 2 OR remove one negative token from it (docx First Aid: "remove negative status tokens") | REUSE Enchanter heal-pick; token-removal pick = NEW-lite param on the same choice |
| **Anbu Black Ops** — bronze, ranged | Ignore combat penalties (docx Obstacle Master) | same + teleport-move (body flicker) | REUSE / REUSE `teleport-move` |
| **Jonin** — silver, ranged | Versatile (docx): ignore combat penalties (no penalty adjacent) | same + ignores retaliation | REUSE `ignore-combat-penalties` / `ignores-retaliation` |
| **Giant Toad Summon** — silver, ground | Defense token (docx Block, normalized — "half damage" has no engine read; the Defend die is the tanking mechanic) | same + on removal, deal 1 damage to adjacent enemies (smoke-burst) | REUSE `SELF_DEFENSE_TOKEN` / `ON_REMOVAL_DAMAGE_ADJACENT` |
| **Jinchuriki** — gold, ground | Frenzy (docx): after its attack, deal 1 damage to every other adjacent unit (friend AND foe) | Full second attack against every adjacent enemy (tailed-beast cloak) | NEW `AFTER_ATTACK_SPLASH` / REUSE `SECOND_ATTACK_ALL_ADJACENT_TO_SELF` (enemies-only) |
| **Susanoo Avatar** — gold, ground | Armored (docx "ignore 1 damage from every source", normalized): each attack against it deals at most 2 damage | same + ongoing-effect immunity (docx "cannot be moved by Spells/Keywords") | REUSE the Cove Nix per-attack damage cap / `titan-ignore-ongoing` |

Buildings: **Mission Board** (City Hall — `RESOURCE_ROUND_CHOICE` {3 gold |
1 valuables}); dwellings **Ninja Academy / Forest of Death / Sanctum of the
Tailed Beast**; **Village Walls** (Citadel — `UNLOCK_REINFORCE`); **Scroll
Vault** (`MAGE_GUILD`); **Chunin Exam Arena** (unique, docx name — once per
round pay 2 gold → Search (2) the Ability deck; pure
`PAY_TO`+`SEARCH_SHARED_DECK` composition — the docx's "level-ups offer more
skills" translated to this game's skill economy).

Heroes: **Naruto Uzumaki** (might; Jinchuriki-line twins — unit-line
specialty), **Sasuke Uchiha** (might; Jonin/assassination —
ignores-retaliation riders), **Kakashi Hatake** (magic; Copy Ninja —
Knowledge/recall economy), **Tsunade** (magic; heals/Medical-Nin riders; her
Katsuyu summon flavors VI), **Shikamaru Nara** (might; trap strategy — I:
your Creature-Bank/Dungeon combats start with one friendly spike-pit token
placed (§6.7.2); IV/VI scale count/damage), **Jiraiya** (magic; Giant Toad +
summon economy).

### 6.3 Azur Lane Naval Base (*Bōkyaku no Minato*) — the shipgirl town (stretch)

Navy / white-steel. Ranged superiority, escort formations, sea synergy with
Cove content and the Abyss Kraken boss. Ships LAST; listed so its shared
arms are planned once. The docx roster, engine-shaped:

| Line (tier, type) | Ability (docx → engine) | Mechanism |
| --- | --- | --- |
| **Laffey** — bronze, ranged, high Init | Sleepy: while she has NOT moved this activation, roll the Defend die when attacked | REUSE `SELF_DEFENSE_TOKEN` + SHARED `requiresNotMoved` gate |
| **Javelin** — bronze, ground | Dodge: roll the Defend die when attacked | REUSE `SELF_DEFENSE_TOKEN` |
| **Sirius** — bronze, ground | Bodyguard: adjacent allies gain +1 Defense against ranged-TYPE attackers | NEW aura arm `ADJACENT_ALLY_RANGED_GUARD` (the one true aura, attack-time stat read like §7's sword-formation) |
| **Noshiro** — silver, ground | Strike and Return, normalized (move-after-attack has no engine read): ignores retaliation; Pack + Charge | REUSE / SHARED charge tag |
| **Unicorn** — silver, ranged, flying | Heal: [activation] heal an adjacent unit 1 / 2 | REUSE Enchanter heal-activation ladder |
| **Nagato** — gold, ranged | Big Seven: attack-roll advantage; Pack + line attack behind the target (salvo) | REUSE `ATTACK_ROLL_ADVANTAGE` / `mechanics-line-attack` |
| **Amagi** — gold, ground | Tactician, normalized from a passive aura to an action: [activation] place an Initiative-down token on an adjacent enemy; Pack + Defense token | SHARED `PLACE_TOKEN_ACTION` variant / REUSE |

Unique building **Wisdom Cube Laboratory** (docx name + mechanic, re-costed):
once per round pay 1 valuables → draw 2 from your own deck, keep 1, discard 1
(NEW `PAY_DRAW_FILTER`). Heroes: **Honolulu** (might; docx — a standing
attack-die reroll for SILVER units, a silver-scoped `AttackRerollSource`),
**Yukikaze** (magic; "Nanoda!", docx normalized — once per combat round, an
instant-reaction +1 Defense for an attacked friendly bronze unit, the
Hierophant-Shield reaction seam), plus **Enterprise** (might), **Belfast**
(magic), **Akagi** (magic), **Bismarck** (might) — sketched at P16.

### 6.4 The Adventurers' Guild (`anime.guild`)

The package's identity system, deliberately **map-independent**: no placed
building is required (a designer Guild-Hall location is optional flavor,
§6.8), so it works on every map.

**6.4.1 What does NOT run / deliberate limits (lead):** no guild PvP
(no stealing claimed commissions, no rank duels) in V1; ranks confer NO
combat stats (every perk is economy/reroll/recruit); commission
auto-verification means no "turn in at the counter" trip (a hard mode is
§22 stretch); solo and OPEN tables get the Guild (PvE content, no
time-control interaction).

**6.4.2 Commission board.** `adventure.guild = { board: CommissionCard[],
claims: Record<PlayerId, CardId | null>, rankPoints: Record<PlayerId,
number> }`. The board holds 3 face-up commissions from a ~16-card
**commission deck** (`src/data/anime/commissions.ts`, morale-cards data
pattern); it refreshes (unclaimed cards cycle to the bottom, refill to 3) at
each **Astrologers round** (`state.round % 2 === 0`, the engine's cadence
read, `reducer.ts:3323`). A player holds ONE claim, taken as a quiet map
action (first-come-first-served through the single reducer — the shared-deck
convention); completing it (§3.5 predicates: kill a guard ≥ difficulty N,
clear a bank, `win-vs-family` goblins ("goblin cull"), flag a
mine/settlement, deliver resources, flip 2 face-down tiles, hero level ≥ N,
`flawless-win`) auto-resolves like Quest Guards: pay any deliver-cost, grant
the printed reward (gold/XP; higher tiers +fate when the substrate is on),
+1–2 **rank points**, cycle the card, refill. Abandoning a claim is free but
returns it face-down. Everything is public.

**6.4.3 Ranks F→S.** Thresholds on lifetime rank points: F 0 / E 2 / D 5 /
C 9 / B 14 / A 20 / S 27. Points: commissions (+1, hard +2), wave battle won
(+1), raid-boss layer broken (+1 each) / kill (+2), Dungeon floor
first-clear (+1). Perks are cumulative, each an engine read with a
rank-below CONTROL:

| Rank | Perk (mechanism) |
| --- | --- |
| E | +1 gold on every commission turn-in |
| D | **Guild Shop**: once per round, pay 2 gold → Search (1) the Ability or basic-Spell deck (choice) — `PAY_TO`+`SEARCH_SHARED_DECK`; stocks Elixir Pills too when `elixirPills` is on (§8.2, data-only) |
| C | +1 morale whenever one of your Calamity-Wave battles starts (routes through normal morale gain — with Morale Cards on, that IS a card draw) |
| B | one free attack-die reroll per combat vs NEUTRAL armies (standing `AttackRerollSource`) |
| A | may recruit **Party Members** (§6.4.4) |
| S | +1 fate each Astrologers round while held (substrate on; +1 gold instead when off — stated on the definition) + a public **S-Rank** seat chip (Mandate-style) |

**6.4.4 Party Members (the Goblin Slayer cast, rank-A recruits).**
Unique neutral cards (the Enchanters pattern —
`src/data/factions/units.ts:1986`; recruit via `CONVERT_ARMY_UNIT` +
`goldCost` + `unique`, `src/data/cards/adventure.ts:2318-2344`), recruitable
at any own town while rank A+, one of each per player:

- **Goblin Slayer** — silver, ground (A3/D2/H4/I5, ~14 gold). *Only ever
  goblins:* +2 Attack against goblin-family units (bounty-mark REUSE keyed
  to the `family` flag instead of the mark token); ignores retaliation.
- **Priestess** — bronze, ranged (A1/D1/H3/I4, ~8 gold). [activation] heal
  an adjacent unit 1 OR remove one negative token — her miracles
  (Medical-Nin twin — the shared param'd choice).
- **High Elf Archer** — silver, ranged (A3/D1/H3/I7, ~13 gold). Ignore
  combat penalties + attack-roll advantage when she has not moved
  (advantage REUSE + the `requiresNotMoved` gate).

**Dwarf Shaman** and **Lizard Priest** round out the party at P16 (stretch);
until then they are campaign NPCs only. The party is also the isekai
campaign's VN cast (§12.2) — the cards double as story characters.

### 6.5 Raid Bosses (`anime.raidBosses`)

**6.5.1 What does NOT run / deliberate limits (lead):** ONE battle at a time
(the physical board) — a raid is sequential attempts by individual players,
never a simultaneous multi-army fight; the co-op fantasy comes from
**persistent wounds** (your failed attempt leaves the boss broken for the
next seat). Bosses do NOT move in V1 (they lair; roaming is §22 stretch —
map pressure belongs to Waves). Boss kills grant NO experience beyond the
printed reward (the bank precedent). Quick Combat never applies.

**6.5.2 Boss anatomy (stack-layer reuse).** A boss is a special card in
`src/data/anime/bosses.ts` — NOT in the neutral decks — with its OWN
statline and **N phase layers** riding the existing army-stack layer
machinery (`state.ts:104/4909`; `markUnitRemovedIfNeeded` carry-through):
lethal damage removes one full layer and carries excess, so a 6-layer dragon
is honestly "6 health bars" with zero new damage code. Phase behavior:
abilities may gate on layers via `requiresStacked` plus one NEW mirror gate
`requiresLayersAtMost` (§19) — e.g. **Enrage** (+2 Attack) at ≤1 layer.
Bosses fight with 2–4 minion cards from the wave/neutral pools; the
battlefield uses the Creature-Bank formation machinery (`placementCellsFor`)
with the boss pinned to the back-center cell.

V1 roster (5): **Goblin King** (3 layers; each layer break refills a goblin
minion — bank-guard placement reuse), **Colossal Titan** (5 layers, slow;
**Devour** — §19, the docx Bite normalized: on a "+1" attack die a BRONZE
target side is removed outright — the `gorgon-death-stare` dice-removal
machinery, tier-gated), **Abyss Kraken** (4 layers, sea hex —
Cove/Naval-Base synergy), **Calamity Dragon** (6 layers, flying, line
breath — REUSE), **Avatar of Erebos** (7 layers; campaign final + optional
superboss on any table; Fear aura §6.8, Enrage).

**6.5.3 Spawn, persistence, escalation, payout.**
`adventure.raidBosses[bossInstanceId] = { defId, fieldId, layersLeft,
layerBreaks: Record<PlayerId, number>, spawnedRound }`. Spawns: (a) lobby
schedule — round 5 (and round 9 on big maps) picks the highest-difficulty
revealed non-objective field nearest map center and converts it to a **Rift
Lair** field, announced ONE round ahead (overlay + feed, "the sky cracks");
(b) designer-placed `boss_lair` object (a `CustomMapObjectKind` union arm
beside monolith/gate, `state.ts:9134` + sanitize list `map-preset.ts:162`)
with a chosen boss + round. Entering the lair = a normal neutral-combat
entry behind a confirm prompt; the boss side is rebuilt from `layersLeft`
each attempt (wounds persist, including across snapshots); win/retreat/loss
resolve through normal combat-end paths. Every layer broken pays the breaker
immediately (2 gold + 1 rank point); the kill pays the killer the printed
reward (relic-tier artifact draw + gold + fate/rank) — the participation
ledger makes "soften it so I can finish it" a real play. On a solo table the
computer seats engage and chip layers too (§17), so the shared-raid arc
plays out single-player as well. Escalation: an unslain boss regrows +1
layer (to its printed cap) every 4th round, announced. With **PvP Neutral Control** on, the next-clockwise player
PLAYS the boss — the existing controller machinery covers it verbatim (the
mode's best moment; lobby tooltip says so).

### 6.6 Calamity Waves (`anime.monsterWaves`)

**6.6.1 What does NOT run / deliberate limits (lead):** wave battles are
**normal neutral combats fought by your main hero** ("the hero rushes to the
defense") — the PvP garrison machinery (`adventure-reducer.ts:856-973`) is
deliberately NOT reused for neutral waves in V1: no 8-gold garrison
decision, no town-board siege visual. One battle at a time: assaults resolve
in seat order behind the round-start barrier. A wave never destroys
buildings or eliminates a player (the loss stake is economic). No
pay-to-skip in the base module (Erebos's Bargain, §6.9.3, is the gods-module
version of that fantasy).

**6.6.2 Schedule & announcement.** Lobby cadence select (every 3rd/4th/5th
round; default 4th, first wave round 4). The round BEFORE a wave, an
announcement overlay + feed line fires ("the Gate groans…"), so players can
position. On the wave round, waves resolve at round start as a barrier
event: REUSE the round-start EVENT BARRIER machinery
(`adventure.eventResolution` / `isRoundStartEventBarrierActive`) with a wave
resolution queue — explicit order pinned by test: income → Fortress Event
(if any) → **wave assaults in seat order** → City Halls → turns.

**6.6.3 The assault.** Each live seat fights a **wave army**: composition
from a wave table derived from `NEUTRAL_ARMY_TABLE` (`adventure.ts:143`)
rows — wave 1 ≈ a difficulty-2 party, wave 2 ≈ 3, capping ≈ 5 — with a
**theme** rotating per wave (goblin horde → Hollow parade → rift demons →
mixed + a miniboss card), themes drawn from the isekai neutral slice; with
`isekaiNeutrals` OFF the table falls back to core neutral cards (stated
limit, not a blocker); §8.4 adds xianxia themes. Win: 2 gold + 1 XP + 1 rank
point (+ a Treasure-die roll from wave 3 on). Loss or retreat: **pillage** —
lose 3 gold (floored at 0), and your owned mine/settlement nearest your home
town is overrun: flag removed, a difficulty-1 guard re-seeded on the field
(re-guarding reuses normal guarded-field state; re-flagging is the normal
fight later).

**6.6.4 Cross-mode seams (each pinned):** parallel turns — the wave queue
rides the barrier (nobody acts until waves resolve; Astrologers/Event
precedent). PvP Neutral Control — the next-clockwise seat plays the wave
army. Morale cards work normally in wave fights (rank C injects +1 morale).
Turn clock pauses during wave battles. AFK/timeout — the forced-resolution
driver retreats the fight (taking the pillage); a wave can never strand the
table. Elimination mid-wave — the dead seat's pending assault drops
(`eliminatePlayer` reward-queue precedent). Single-player — the AI fights
its waves through the normal runner (§17 gate).

### 6.7 Traps (designer content) & the Dungeon (`anime.dungeon`)

**6.7.1 Map traps.** New `CustomMapObjectKind` `"trap"` (union
`state.ts:9134` + sanitize allow-list + `validateCustomMapObjects`
acceptance — the §9 wiring inventory applies file-for-file): a single-hex
HIDDEN object with `trapKind: "pit" | "snare" | "mimic" | "warp"` and (warp
only) a designer-linked destination hex. **Hidden means masked**: stripped
from every player view (`player-view.ts` — the auction-bid/Forest-pool
masking precedent) and rendered nowhere until triggered. A hero ENTERING the
hex triggers it (one-shot; the object converts to a visible sprung-trap
marker, cubed): **pit** — the owner picks one army unit to take 1 damage
(normal removal path) and movement ends; **snare** — movement ends +
remaining MP to 0; **mimic** — lose 2 gold ("the chest bites"); **warp** —
teleport to the linked hex (token-teleport arrival path, never
re-triggering). **Trap Sense**: a hero with expert Pathfinding sees trap
hexes within 1 space rendered with a warning glyph (a visibility read, not a
disarm). Designer cap `MAX_TRAPS` = 12; validator warns when a trap sits on
the only path to a start (reachability-warning REUSE). AI: the computer path
scorer treats KNOWN (triggered/sensed) traps as +cost and otherwise walks
into hidden ones like a human — no omniscience (pinned by a policy test).

**6.7.2 Combat traps (battlefield tokens).** A **spike-pit** battlefield
token — a `fire_wall` sibling in the existing battlefield-token machinery
(`legal-actions.ts:2531`; `battlefield-obstacle-spells.test.ts` semantics:
damage on enter/stop; per-token `damage` verified parameterized) with
`kind: "spike_pit"`, damage 1, whole-combat duration, own art. Pre-placed at
combat start: goblin-family Creature-Bank fights and Dungeon floors place 2
on defender-approach cells (data on the bank/floor definition); Shikamaru's
specialty (§6.2) places friendly ones. No new damage code.

**6.7.3 The Dungeon (one per map, repeatable, per-player floors).** A
special site placed like a Creature Bank on a Near tile's Blocked Field at
setup when `anime.dungeon` is on (or designer-pinned). Per player:
`player.dungeonFloor?: number` (starts 1). Entering (1 MP, own turn, once
per turn) fights **your** next floor: a guard party of difficulty
`min(floor + 1, 7)` (the bank-guard draw machinery) + 2 spike-pits; floors 5
and 10 add a **floor boss** (Minotaur of the Depths / the Floor Wyrm —
2-layer mini-bosses using §6.5.2 anatomy). Win: floor++, reward ladder
(gold → valuables → minor→major artifact draws; floor 5 = major + 1 rank
point; floor 10 = relic + "Dungeon Conqueror" feed title + fate); fights
grant normal XP (it is the grind site). Loss/retreat: nothing lost but the
wounds (the Dungeon deals fair — no pillage). Bank battlefield formation; no
Quick Combat; `polish-bank-sizes` rolls do NOT apply (fixed per-floor
difficulty is the point — stated limit).

### 6.8 Isekai neutrals, banks & locations (`anime.isekaiNeutrals`)

**Neutral slice** (`src/data/anime/isekai-neutrals.ts`, mirroring
`src/data/wog.ts`; ~15 cards; every card carries `family?: "goblin" |
"undead" | "rift" | …` for waves/commissions/Goblin Slayer):

- **Goblin family** (the world-build backbone): bronze **Goblin Scouts**
  (SHARED `ATTACK_BONUS_ADJACENT_ALLY`), bronze **Hobgoblin Brutes** (plain
  statline), silver **Goblin Champion** (ignores retaliation), silver
  **Goblin Shaman** ([activation] Weakness token — `PLACE_TOKEN_ACTION`
  REUSE), gold **Goblin Lord** (his attack forces a 1-card discard —
  `bank-wraith-attack-discard` REUSE; +1 Attack while adjacent to a goblin —
  SHARED arm).
- **Slimes**: bronze **Slime Swarm** (resilience — Zombie REUSE), silver
  **Giant Slime** (reduce spell damage 1), gold **Sovereign Slime** (life
  drain + ongoing-effect immunity — the "reincarnated as a slime" gag).
- **Titans** — gold (Attack on Titan): slow, huge; **Devour** (§19 arm,
  shared with the Colossal Titan boss — the docx Bite, normalized from
  "instantly kills 1 Bronze unit on a successful hit" to a die-gated
  removal: a "+1" die removes a bronze target side outright).
- **Hollows** — bronze (Bleach): flying; **Fear** (docx: "Heroes fighting
  Hollows cannot use Morale tokens") — the enemy cannot USE morale while a
  Fear unit lives (token spends and morale-card plays/spends/reactions
  gated; draws/gains still happen) — NEW `MORALE_LOCK` (§19; wired at the
  `SPEND_MORALE` / `addMoraleActions` / reaction-offer gates, with a "draws
  still occur" assertion + mode-off CONTROL).
- **Pacifista** — gold (One Piece): ranged; Laser (docx "hits in a straight
  3-hex line") = line-breath REUSE; mechanical flag (`isMechanicalUnit` —
  Field-Repair/Mechanic synergy).
- Rounding out: bronze **Dire Wolves** (charge), silver **Harpy Matron**
  (flying, ignores retaliation), silver **Cultist Choir** (+1 Power to its
  side's first spell — `magi-power-boost` REUSE), gold **Parade Lich**
  (lich splash REUSE), azure **Rift Tyrant** (Devour + Fear — the
  wave-finale miniboss).

**Isekai Creature Banks** (4, joining Far/Near piles; full
`polish-bank-sizes` rows + `buildPolishCreatureBankReward` entries):
**Goblin Nest** (far; goblins; gold + morale; a `win-vs-family` commission
target; spike-pits pre-placed §6.7.2), **Slime Pit** (far; slimes;
valuables), **Hollow Shrine** (near; Hollows — Fear inside; artifact draw +
morale gamble `ATTACK_DIE_TABLE`), **Dimensional Breach** (near, docx name
and reward kept; rift demons; a Relic-tier artifact draw + valuables,
scaled by X).

**Map locations** (`locationDefinitions`, placed via isekai tiles/designer):
**Capsule Corp Lab** (visitable, docx: give up the rest of your turn →
Search (2) the Ability deck — the skip-turn-for-tech trade as reward +
END_TURN force), **Urahara's Shop** (revisitable, docx verbatim: pay 2 gold
→ reveal the top 3 of an Artifact deck, buy up to one at printed cost — the
Artifact-Merchant peek-and-buy machinery relocated to a map site),
**Guild Hall** (optional flavor; visiting = one free re-roll of the
commission board — quiet action).

### 6.9 Gods & Blessings (`anime.gods`)

**6.9.1 What does NOT run (lead):** gods never fight, never spawn units,
and have no hidden-agenda mechanics — V1 is one public pick + one
once-per-game button each + one wave hook. The full divine drama is the
campaign's job. Erebos is not pickable.

**6.9.2 Patron pick.** At game start (a per-seat pendingChoice in the setup
flow; AFK default = Godless), each player publicly picks: **Hikari (Dawn)**
— passive: your first LOST wave battle skips the pillage (mercy); Miracle:
in combat, fully heal one own unit + cleanse its negative tokens/effects
(Cure-cleanse REUSE). **Tekkai (Forge)** — passive: war machines cost 2 less
(Artificer twin); Miracle: one building purchase costs no materials.
**Raiju (Storm)** — passive: +1 MP on each Astrologers round; Miracle:
teleport your hero to an owned town (Town-Portal-family REUSE). **Godless**
— +2 gold now. Miracles are handler-validated once-per-game actions
(Commander-revive pattern); public chips mark picks.

**6.9.3 Erebos's Bargain (waves hook).** When gods+waves are both on:
during the wave-announcement round any player may take the Mark (quiet
action): their next assault is skipped (the wave passes over) — cost: −1
morale, −2 karma when the substrate is on, and S-rank/title fate income
pauses that round (heresy is noticed). One Bargain per wave table-wide
(first come). Pay-to-skip, priced in story currency.

**6.9.4 Favor & titles.** Miracles and S-rank feed the §3.4 substrate. No
separate isekai title beyond the S-Rank chip — the Mandate/Demon-Emperor
titles (§5.7) simply also exist when `destiny` is on (same axis; §8.3).

---

## 7. Commanders (rides `wog.commanders` gating; one table for all seven towns)

The Commander system is faction-keyed and the per-commander surface is small
(verified): `COMMANDER_SLUGS` + `commanderDefinitions`
(`src/data/commanders.ts:47`, `:489`), `COMMANDER_SLUG_BY_FACTION` (`:779`),
`COMMANDER_CAST_FX_KEY` + `COMMANDER_SPECIALTY_SOUND`
(`src/data/commander-fx.ts:17`, `:59`), `commanderVoices`
(`src/data/unit-sounds.ts:180-207`), card art
`public/assets/units-commander-<slug>.webp` (`scripts/build-commander-cards.mjs`).
Grades 0–3, the 15 combos, icons and the point schedule are global — zero
work. The integrity test `wog-commanders.test.ts:119` (12-faction bijection)
becomes "every playable faction has exactly one commander" (19 with all
seven towns), keeping the bijection assertion. When WOG Commanders is ON and
a player picks a mod town, the commander arrives through the existing setup
path (`adventure-setup.ts:1916-1922`) — no mod-specific setup code.

| Town | Commander | Cast (existing `CommanderCastEffect` arm) | Specialty (NEW id + engine case) |
| --- | --- | --- | --- |
| Azure Breeze | **Sword Saint** (*Kiếm Thánh*) | *Sword Array Edict* — `attack-buff` (Bloodlust semantics, Pow-laddered) | `sword-formation`: +1 Attack while adjacent to ≥1 friendly unit (attack-time stat read) |
| Yaoguai Valley | **Fox Sage** (*Hồ Tiên*) | *Bewitching Gaze* — `initiative-shift` (Slow rider) | `wild-blessing`: at the start of a combat vs neutrals, one friendly unit gains +1 Attack for the combat (auto-picks strongest; `applyElementalScourge` wiring twin) |
| Blood Demon Cult | **Demon Patriarch** (*Ma Tổ*) | *Blood Frenzy* — `attack-buff` with a 1-damage self-cost rider (parameter, not a new kind) | `blood-pact`: whenever the commander destroys an enemy side, its owner gains 1 gold (soul-reformer twin) |
| Outer Court | **Void Envoy** (*Hư Không Sứ*) | *Time Dilation* — `initiative-shift` (Haste rider on own unit) | `void-veil`: ongoing-effect immunity from Magic grade 0 (per-slug override of `COMMANDER_MAGIC_ONGOING_IMMUNE_GRADE`) |
| Fuyuki City | **Ruler (Jeanne)** — the Grail War's arbiter class as the extra body | *Command Seal* — `attack-buff` | `contracted-blade`: +1 Attack while adjacent to a friendly GOLD unit (attack-time stat read) |
| Hidden Leaf Village | **Might Guy** | *Body Flicker* — `initiative-shift` (Haste rider; the Eight Gates read as tempo) | `substitution`: once per combat, when his health would drop to 0, set it to 1 (`phoenix-rebirth` wiring twin on the commander unit — the substitution-jutsu log gag) |
| Azur Lane Naval Base | **Vestal** — the repair ship | *Emergency Repairs* — `defense-buff` (INSTANT REACTION, the Hierophant-Shield seam) | `supply-line`: +2 gold after each won combat (soul-reformer twin) |

New cast kinds needed: **none**. New specialty ids: 7 (union members +
cases in `src/engine/commanders.ts`, mirrored on the existing 12). Voices
map to existing sets in `commanderVoices` (Sword Saint → Swordsman, Fox Sage
→ Pixie/Sorceress mix, Demon Patriarch → Lich/Ogre mix, Void Envoy →
Efreet, Ruler (Jeanne) → Monk, Might Guy → Ogre, Vestal → Sea Dogs) — zero
new sound files. Tests join
`wog-commanders.test.ts` / `wog-commander-casts.test.ts` with per-claim
CONTROLs (one grade below / module-off / non-mod faction).

---

## 8. Cross-package synergy — "work together as a whole"

Every item below is **additive data behind BOTH gates** — nothing here
changes a rule when one side is off, and each ships with a one-side-off
CONTROL test. This section is the "whole mod" dividend:

1. **Commissions know the west** (`guild` + xianxia content): the commission
   deck gains xianxia entries — "clear a Secret Realm", "win vs the yaoguai
   family" — via the same predicates; xianxia neutrals carry `family` tags
   from birth (§5.8).
2. **The Guild Shop stocks pills** (`guild` + `elixirPills`): rank D's shop
   adds "2 gold → draw 1 Elixir Pill" (data row on the shop definition).
3. **One karma axis, stacked incomes** (`destiny` + `gods`/`guild`): karma
   sources union; Mandate/Demon-Emperor (destiny) and the S-Rank chip
   (guild) coexist as independent titles on one axis; Erebos's Bargain costs
   −2 karma; fate incomes stack (both title incomes can be held at once —
   an intentional "living legend" build).
4. **Waves speak xianxia** (`monsterWaves` + `xianxiaNeutrals`): two wave
   themes join the rotation — a **yaoguai stampede** and a **blood-cult
   raid** — drawn from the xianxia neutral slice (wave-table data rows).
5. **A western Raid Boss** (`raidBosses` + `xianxiaNeutrals`): **Ancient
   Deity Remnant** joins the boss registry as a 5-layer boss whose minions
   come from the xianxia azure pool.
6. **Cultivation meets the Dungeon** (`cultivation` + `dungeon`): the Core
   Formation realm gate's "≥1 Secret Realm won" is satisfied by a Dungeon
   floor-5 first-clear too (one predicate union, §5.6).
7. **Pills fight everywhere** (`elixirPills`): combat pills ride the morale
   seams, so they are automatically playable in wave, boss and Dungeon
   fights — no extra wiring, pinned by one test each.
8. **Designers mix freely**: Quest Guards may gate on `guild-rank ≥ N` and
   `karma`, traps and Rift Lairs may sit on xianxia maps, story timed-events
   may fire scenes from either register — the shared vocabularies (§3.5,
   §11) make cross-theme maps first-class.
9. **One cosmology, two campaigns** (§12): shared background lore, light
   cross-references, and the stretch convergence arc where Bin and Chen Fan
   meet.

---

## 9. Quest Guard (shared designer object) — single hex, place anywhere, quest → reward

**Companion headline feature:** Field Overrides (§3.10 / §9b) — on-tile
single-hex replacements with real mechanics. Quest Guard remains the
**standalone / quest-gated** object; Field Override is the **tile-hex
replace** path (including random/manual on reveal).

The Quest Guard map-maker feature is shared by both packages. Engine seams are
verified and mostly exist: standalone one-hex objects already mint a real
`MapFieldState` with an optional guard 1–7 running the full
neutral-battle/quick-combat flow, and "win → `beginFieldVisit` → the field's
`LocationInteraction`" is automatic (`adventure-setup.ts:1300-1360`,
`adventure-reducer.ts:861/3542`, `adventure.ts:3563`).

**Definition** (new `CustomMapObjectKind` `"quest_guard"`, `state.ts:9134` —
the union is explicitly open — plus the sanitize allow-list
`CUSTOM_MAP_OBJECT_KINDS`, `map-preset.ts:162`):

```ts
{ kind: "quest_guard",
  placement,                      // standalone (any free land hex) OR tile token form
  quest: { kind: QuestKind, amount?, tier?, resource? },   // §3.5 vocabulary
  reward: QuestReward,            // §3.5 constrained vocab → LocationInteraction
  guard?: 0..7,                   // 0 = pure quest gate (cannot be fought)
  fightCompletes?: boolean,       // default false: beating the guard clears the HEX, not the reward
  scope?: "once" | "per-player",  // default "once" (black cube)
  storySceneId?: string }         // §11 hook — a VN beat on completion
```

**Flow**: entering the hex opens a `QUEST_GUARD` pendingVisit — quest, live
progress ("2/3 mines"), and the legal picks: *Complete* (predicate met; pays
costs, grants reward, cubes the field, fires `storySceneId`) / *Fight the
guard* (when `guard ≥ 1`; a normal neutral battle — a win opens the hex; the
reward also grants only if `fightCompletes`) / *Leave*. A `guard: 0` gate is
impassable until completed (classic Quest Guard) — the validator warns when
a 0-guard gate makes a start unreachable (REUSE the reachability warning,
`adventure-setup.ts:1249`).

**Wiring inventory** (verified seams): union arm + allow-list +
`validateCustomMapObjects` acceptance (`adventure-setup.ts:1139`) +
materialization beside the gate/monolith branch (`:1300`, the `location`
write at `:1347`, guard difficulty at `:1358`) + a `quest_guard`
`LocationDefinition` + `QUEST_GUARD` interaction/step (`map/types.ts:81`,
`interactionToSteps` `adventure.ts:2147`, `processPendingVisit`
`adventure.ts:3774`) + `isMapObjectLocation` (`adventure.ts:5805`) +
designer palette/arm/config popover (`map-designer.tsx` ~665-1428; quest
editor mirrors the timed-events editor) + board art/icon + per-player
once-cubes for `scope:"per-player"` (settlement-cube precedent).
Cross-cutting: pendingVisit already blocks parallel-turns bystanders;
`eliminatePlayer` must clear an open quest prompt (barrier-recovery
precedent); the AFK driver default-answers *Leave*.

### 9b. Field Overrides — designer Mod panel + reveal placement (SHARED)

Full contract in §3.10. Implementation checklist (each bullet fails a named
test if removed):

1. **Catalog** `src/data/anime/field-overrides.ts` (+ merge hook for future
   core kinds): ids, `locationId`, tileGroups, terrain, optional guard,
   package tag. Ninefold V1 kinds: `bi_canh`, `kiem_trung`, `linh_tuyen`,
   `ngo_dao_thach`, `tran_phap_truyen_tong` (§5.8). Isekai kinds land with
   their package (Capsule Lab / Urahara Shop / … as override forms of §6.8
   locations).
2. **Locations** always registered in `locationDefinitions` (Factory
   precedent) so a carved field always resolves; **placement** gated on
   `anime.fieldOverrides` or a designer pin on a map loaded with the module.
3. **`carveFieldOverride(adventure, spaceId, kind)`** — single chokepoint;
   wipe like `carveMapTokenField`; stamp `location` + optional `difficulty`.
4. **Setup** `applyCustomMapFieldOverrides` — face-up pins carve immediately;
   face-down pins → `pendingFieldOverride`; when module on, remaining
   far/near/center face-down tiles may receive a **pool** draw (seeded,
   at most one pending override per tile; density default = every
   non-starting supply tile gets a roll with 100% for V1 simplicity, or a
   designer "override density" later).
5. **Reveal** `offerPendingFieldOverridePlacement` — after rotation settles,
   before or after bank offer per §3.10 order; random / manual /
   manual-or-refuse; designer pins never refuse.
6. **Lobby** rows under Anime Mod: master `fieldOverrides` + placement mode
   select. Greyed when `anime.enabled` is off (or auto-enables field
   overrides when a designed map has pins — prefer explicit toggle + setup
   drop of pins with problem when off).
7. **Map designer Mod panel** — button opens a side panel: Field Override
   palette (package-filtered), arm → click tile hex to set
   `plan.fieldOverride`, clear control, face-down physical-hex pin, conflict
   warning vs `plan.token` same slot. Round-trip sanitize in `map-preset.ts`
   / `map-registry.ts`.
8. **Board art** — placeholder glyph per kind until art ships; integrity
   tests allow declared placeholders in a registry.
9. **AI** — if `manual` / `manual-or-refuse` window is computer-owned, policy
   picks the highest-value candidate (prefer empty / resource symbol over
   mine) or refuses only when every candidate is a valued economy hex and
   mode allows refuse; scored so the runner never freezes.
10. **CONTROLs** — module off → no pool, designer pins dropped; teleport
    token still works; bank offer still works; main CONTROL of §3.8.

**Shipped status (audit pass) — what runs vs. limits.** Leading with limits:

- **Pool override kinds on face-down tiles are visible in raw snapshots**
  (stamped at setup like designer tokens; a determined player inspecting the
  transport can read what a hidden tile will offer). Deliberate V1 trade-off —
  masking would need player-view surgery for marginal secrecy.
- **`linh_tuyen` no longer claims `starting` tiles** — setup skips starting
  plans (their fields materialize only at the opening rotation), so a starting
  pin could never apply; the designer no longer offers one.
- **Designer multi-token editing** — every pin drags/edits individually
  (drag state carries `tokenIndex`); mode flips (random/secret/face-up) and
  the face-down rotation counter-compensation map **every** pin, retargeting
  face-up tokens to distinct legal slots and dropping ones the new tile
  cannot host (same as the old singular semantics, per pin).
- **Engine invariants pinned by tests** (`field-overrides.test.ts`,
  `map-tokens.test.ts`, `subterranean-gate-choice.test.ts`, each
  mutation-checked): the reveal chain pauses ONLY on a choice the override
  offer itself opened; resolving/refusing a manual placement never re-draws
  another pool override (no endless window); a carved override hex refuses
  tokens / gate halves / later overrides (empty-sibling CONTROL); a tile's
  whole `pendingTokens` queue places on reveal (nothing leaks); eliminating
  the placing seat mid-choice drops the override queue and auto-places the
  waiting designed token instead of stranding the tile.

---

## 10. Polish Spell Book compatibility

The mod adds no second spell system — it composes with `polish-spell-book`
(and the default stash Book) via a compatibility contract, tested with
book-on/off CONTROLs in every phase that touches spells:

- All mod Mage-Guild-archetype buildings ARE `MAGE_GUILD` effects, so Search
  (3), buy-a-Cast-card, Rolling Spells and the level V/VII Cast grants apply
  unchanged.
- Every mod effect granting an owned Spell routes through `gainOwnedCard`
  (`src/engine/polish-spell-book.ts:26`); Elixir Pills are NOT spells and
  never enter the Book.
- The three over-limit specialties (Qi Deviation Elder VI, Ancient Outer
  Shade VI, **Bin VI**) must count casts exactly like the Tarnum flag under
  the Book's Cast-card economy (a Cast card is still consumed; only the
  per-round limit is waived) — pinned with a Book-on test each.
- Skin: Book modal subtitles per active package (label-only).

---

## 11. Visual-novel story system (shared presentation system)

> **FOUNDATION SHIPPED (2026-07-17).** The presentation spine is engine/UI-wired
> and covered by tests that fail if the wiring is removed. Leading with what does
> **NOT** run yet:
> - **No campaign hooks.** `on_start` / `on_victory` / `on_defeat` / `on_round:N`
>   / `on_quest_complete` scene triggers are the NEXT step (§12) — this slice
>   ships ONLY the map-designer timed-event trigger path.
> - **No karma/fate/flag deltas on choices.** The destiny substrate (§3.4) is
>   unshipped, so those fields are deliberately kept OUT of the `StoryChoice`
>   type; a choice carries only bilingual `text` + optional `nextSceneId`. The
>   campaign step adds what it consumes.
> - **No music.** `music?` is not modeled (the stated ship limit); the overlay
>   reuses the existing `adventure/new-week` open sting only (no new sound files).
> - **No e2e.** jsdom/unit tests only this step; a browser smoke is deferred.
> - **All art is placeholdered.** No file exists under `public/assets/story/…`
>   yet — every referenced sprite/background is declared in
>   `STORY_ART_PLACEHOLDERS` (`src/data/story/scenes.ts`) and the overlay falls
>   back to a theme-tinted gradient background / an initial-letter avatar chip
>   (never a broken `<img>`). Drop a `.webp` + remove its path from the set to
>   promote it.
>
> **What runs (each pinned by a test that fails if the wiring is removed):**
> - Data model + registry `src/data/story/scenes.ts` — `StoryScene` /
>   `StoryLine` / `StoryChoice`, bilingual EN/VI by construction, 2 themed demo
>   scenes (one xianxia with a 2-way choice chaining via `nextSceneId` to a tiny
>   follow-up, one isekai) that double as sample content AND fixtures. Registry
>   integrity + the art-or-declared-placeholder invariant pinned in
>   `src/data/story/scenes.test.ts`.
> - Language preference `src/lib/story-language.ts`
>   (`localStorage["binh-story-lang"]`, default "en", SSR-safe; the
>   `ui-mode-preference` pattern) — `src/lib/story-language.test.ts`.
> - Component `StoryOverlay` (`src/components/table/story-overlay.tsx`):
>   theme-tinted backdrop, two sprite slots (placeholder → avatar chip),
>   nameplate, typewriter (click/Space: first press completes, next advances),
>   Skip, history log, EN/VI toggle, choice buttons (a `nextSceneId` choice
>   continues in the SAME session), `onDone` at the true end; `.xianxiaTheme`
>   / `.isekaiTheme` stamped on the component ROOT (never the table root, §3.6).
>   Behaviour pinned in `src/components/table/story-overlay.test.tsx` (jsdom).
> - Trigger path — designer timed events: `CustomMapPreset.timedEvents` gains
>   `{ kind: "story", sceneId }` (union in `state.ts`; sanitized in
>   `map-preset.ts` — an unknown sceneId is dropped; round-trip in
>   `map-registry.test.ts`); `applyCustomMapTimedEvents` fires a table-wide
>   `STORY_SCENE_TRIGGERED` event; the client (`page.tsx`) pops the overlay
>   ONCE per event id, never replayed on reconnect (the exact MapEventOverlay
>   seen-set/prime semantics). Editor dropdown + scene-id select in
>   `map-preset-editor.tsx`. Engine emission + sanitize pinned in
>   `custom-setup.test.ts` (with a wrong-round CONTROL); editor UI in
>   `map-preset-editor.test.tsx`. Story events are table-wide, so eliminated-seat
>   skipping is a verified no-op for them.

There is no narrative infrastructure today (verified — closest hooks:
`EventDrawnOverlay`, `overlays.tsx:2571`, preset `notes`/timed `note`
events). The mod adds ONE, package-agnostic:

- **Data** (`src/data/story/scenes.ts`): `StoryScene { id, theme?, background,
  music?, lines: StoryLine[], choices? }`; `StoryLine { speaker, sprite?,
  expression?, side?, text: { en: string; vi: string } }`; `StoryChoice
  { text: {en,vi}, karmaDelta?, fateDelta?, flag?, nextSceneId? }`.
  Bilingual EN/VI by construction; overlay language toggle persisted as
  `localStorage["binh-story-lang"]` (helper-coach pattern). Liberation Serif
  already covers Vietnamese diacritics; decorative heading fonts must
  include the VI subset or fall back.
- **Component** `StoryOverlay` (`src/components/table/story-overlay.tsx`):
  full-bleed background, up to two character sprites (enter/exit slide,
  dim-inactive), nameplate, typewriter text (click/Space to advance, Skip,
  history log, EN/VI toggle), choice buttons; `theme` picks ink-wash vs
  dialogue-box chrome. Driven by the standard cue pipeline (`page.tsx` cue
  state → keyed overlay → `onDone`), sounds via `playLibrarySound`.
- **Triggers**: (a) campaign hooks (§12) — scene ids on chapter events
  (`on_start`, `on_victory`, `on_defeat`, `on_round: N`,
  `on_quest_complete`); (b) map-designer — `CustomMapPreset.timedEvents`
  gains `{ kind: "story", sceneId }` (union at `state.ts:8998-9013`) and
  Quest Guards carry `storySceneId` — designer-triggered scenes broadcast as
  a cue every client dismisses independently (multiplayer-safe,
  MapEventOverlay semantics, never replayed on reconnect); (c) reconnect —
  an undismissed campaign scene rebuilds from live state
  (`reconnectRoundStartCues` pattern).
- **Scope guard**: scenes are presentation + (campaign-only)
  karma/fate/flag deltas through normal reducer actions — a scene can never
  mutate rules state directly.
- **Tests**: overlay render/advance/choice (jsdom), scene-registry integrity
  (every referenced sprite/background exists on disk), one e2e smoke.

---

## 12. Story mode — the campaign hub

> **HUB + CHAPTER 1 OF BOTH CAMPAIGNS SHIPPED (2026-07-17).** The campaign shell
> around the §11 story system is engine-free presentation + localStorage. Leading
> with what does **NOT** run:
> - **Only Chapter 1 of each campaign is PLAYABLE.** Chapters 2–7 exist as DATA
>   (bilingual title + synopsis, the §12.1 / §12.2 arc) with `playable:false`, no
>   `setup`, empty `scenes`. Completing ch-1 UNLOCKS ch-2, which renders as a
>   clear "in development" state — never beginnable.
> - **Protagonists are PRESENTATION only.** Chen Fan / Bin live in the story
>   scenes; the playable seat uses a CORE faction stand-in — **Jianghu ch-1 =
>   Rampart**, **Bin ch-1 = Tower** (anime towns are unshipped). `setup.playerFaction`
>   names the stand-in.
> - **`setup` IS applied to the live game (setup-injection slice SHIPPED).** The
>   Begin flow mints a STANDARD single-player room (opponent count only); once the
>   human is seated in its setup lobby the table page pushes the chapter's config
>   through the NORMAL action pipeline — `campaignSetupActions(chapter, seat)` →
>   `SET_GAME_OPTIONS` (the chapter's `anime` + global `fieldOverrides` +
>   `difficulty`) then `CHOOSE_FACTION` (the protagonist's core faction + its first
>   hero, PRESELECTED). No new server surface. Once per room (persisted
>   `setupApplied` marker); the player still sees the normal setup screen and may
>   change any pick before starting. A latent gap was fixed alongside this:
>   `buildAdventureFromLobby` was DROPPING `anime` + `fieldOverrides` when it built
>   the game from the lobby (only the direct `createAdventureGameState` path carried
>   them), so a lobby-set anime/FO toggle never reached the started game — now
>   carried through. Pinned pure in `campaign-triggers.test.ts` and end-to-end in
>   `campaign-setup-injection.test.ts` (Jianghu ch-1 starts with
>   `anime.enabled + cultivation + xianxiaArtifacts + fieldOverrides` ON and the
>   Rampart seat; a plain `/single-player` room stays all-default as the CONTROL).
>   (Only shipped anime flags are ever set true: Jianghu ch-1 =
>   `enabled + cultivation + xianxiaArtifacts` + global `fieldOverrides`; Bin ch-1
>   = `enabled` + `fieldOverrides` — isekai modules do nothing yet, so none are
>   enabled. A dead flag fails `campaigns.test.ts`.)
> - **`mapPresetId` is unused** — campaign maps use standard map generation in V1
>   (a designed `CustomMapPreset` per chapter is a later content pass; the type
>   carries the optional field for it).
> - **No routes / karma / cheat picks / quest-log.** A printed 5A/5B split is one
>   chapter here; the split, Golden Fingers / Cheat Skills and the System
>   quest-log are all deferred (§13, campaign-only). No convergence arc (§12.3).
> - **All story art is placeholdered** (the §11 contract): the two new sprites
>   (`system`, `guild-girl`) join `STORY_ART_PLACEHOLDERS`; the overlay's avatar /
>   gradient fallbacks render them. No e2e — jsdom/unit only this slice.
>
> **What runs (each pinned by a test that fails if the wiring is removed):**
> - **Campaign registry** `src/data/story/campaigns.ts` — both campaigns
>   ("The Jianghu Chronicle" / Chen Fan, "Bin's Otherworld Chronicle" / Bin), 7
>   chapters each, bilingual EN/VI. `chapterRoomOptions(chapter)` maps a chapter
>   to room-creation options (seat count + resolved anime payload). Registry
>   integrity, bilingual completeness, real-faction/sane-opponent setup, the
>   shipped-anime-flag allowlist, and `chapterRoomOptions` in
>   `src/data/story/campaigns.test.ts`.
> - **Chapter-1 scenes** added to `src/data/story/scenes.ts` — intro (with a
>   choice; the Jianghu intro chains a follow-up via `nextSceneId`), victory and
>   defeat for both campaigns, xianxia vs. isekai register. Integrity + the
>   art-placeholder invariant stay pinned in `scenes.test.ts`.
> - **Progress store** `src/lib/campaign-progress.ts` — per-campaign completed
>   chapters (`localStorage["binh-campaign:<id>"]`, the unlock chain), per-room
>   binding + intro/outcome markers (`localStorage["binh-campaign-room:<roomId>"]`),
>   SSR-safe (`ui-mode-preference` pattern). `campaign-progress.test.ts`.
> - **Pure trigger** `src/lib/campaign-triggers.ts` (`campaignSceneToFire`):
>   state + binding + shown-markers → the scene to fire (onStart once when the
>   adventure is first visible; onVictory + completion / onDefeat at game-over;
>   nothing for an UNBOUND room). `campaign-triggers.test.ts`.
> - **`/story` route** `src/app/story/page.tsx` — theme-styled campaign cards
>   (`.xianxiaTheme`/`.isekaiTheme` scoped to the CARDS, never the app root),
>   chapter states (locked/in-development/ready/completed), the EN/VI toggle, and
>   a Begin flow reusing `createSinglePlayerRoom` + `bindCampaignRoom`.
>   `src/app/story/page.test.tsx`.
> - **Menu entry** — "Story mode" → `/story` in `src/app/menu/page.tsx`
>   (`menu/page.test.tsx`).
> - **Table wiring** `src/app/page.tsx` — a bound campaign room pops the chapter's
>   intro/outro through the EXISTING `storyCue`/`StoryOverlay` pipeline, once per
>   room; game-over win → `markChapterCompleted`. Thin over the pure trigger.

Shared shell (§3.3): each chapter = a private single-player room (`sp-` ids,
`createSinglePlayerRoom`, `src/lib/realtime.ts:819`) built from a chapter
definition (`src/data/story/campaigns.ts`): `{ id, title, mapPresetId,
playerFaction, heroId, opponents: [{faction, level}], animeOptions,
storyHooks, objectives, cheatPicks?, carryover? }` — maps are committed
`CustomMapPreset`s (designed in the map designer), so campaign maps ARE
designer maps, quest guards/traps/lairs included. Chapter difficulty tunes
the existing smoothing knobs (guaranteed first wins, opponent count/level);
AI opponents are the shipped computer seats. Victory per chapter = existing
modes (conquest/VP/round-limit) + "complete N System quests" as a
VP-objective-style extra.

### 12.1 "The Jianghu Chronicle" (*Giang Hồ Chí*) — the xianxia campaign

Protagonist **Chen Fan** (*Trần Phàm*) — *người xuyên không*, a modern gamer
transmigrated into a dying outer-sect disciple. His "cheat" is **The System**
(*Hệ Thống*): the campaign quest-log panel (§13) plus one **Golden Finger**
pick per chapter. Arc (7 chapters; karma carries across chapters and picks
the route): 1 **Awakening** (Azure Breeze tutorial; quest guards teach
move/fight/build) · 2 **The Valley** (befriend or subdue Yaoguai Valley —
choice → karma) · 3 **Silk and Silver** (Merchant Guild intrigue; economy
scenario) · 4 **Blood Moon** (the Cult strikes; defense scenario) · 5A/5B
**Orthodox Alliance** / **Demonic Ascension** (route split by karma ≥0/<0)
· 6 **Heavenly Tribulation** (timed-event gauntlet map; §5.6 set-piece) ·
7 **The Realm Breach** (*Phá giới chiến*) — the Outer Court invasion; both
routes converge; a high-karma finale crowns Chen Fan **Chân Mệnh Thiên Tử**
in story and mechanics.

### 12.2 "Bin's Otherworld Chronicle" (*Bin no Isekai Ki*) — the isekai campaign

Protagonist **Bin** — a modern gamer summoned by **Hikari**, who promised a
hero an overpowered blessing and delivered… admin access to a world that
runs suspiciously like his favorite board game (the meta gag sets the tone;
Hikari, having spent her divinity on the summon, tags along mortal, broke
and indignant — the useless-goddess register played warm). Rival: **Kaito,
Black-Blade** (A-rank, all flash). Antagonist chain: **Vesper**, High Priest
of the Silent End → the Avatar → **Erebos**. Party: **Guild Girl**
(receptionist/exposition), **Goblin Slayer**, **Priestess**, **High Elf
Archer** (§6.4.4 — their unique cards join the army as the story recruits
them; the cards ARE the system↔story crossover), with **Dwarf Shaman** and
**Lizard Priest** as NPCs until P16.

Chapters: 1 **Summoned at Dawn** (tutorial; guild registration; first
commissions; a goblin-cave bank with Goblin Slayer's lesson — "goblins are
no joke"; traps introduced gently) · 2 **Rank and File** (commission
economy; the first scripted small Wave; Kaito intro; Priestess joins) ·
3 **Into the Dungeon** (floors 1–5, the Minotaur; Vesper surfaces; High Elf
Archer joins) · 4 **The Wave of Calamity** (full wave-defense set-piece;
Goblin Slayer's farm-rescue side chain — his episode) · 5A/5B **Hero of the Guild** /
**The Dark Bargain** (route split on the karma axis: the S-rank exam
boss-rush, or taking Erebos's Mark for corrupted cheats — bigger numbers,
karma bleed, the Guild turns cold) · 6 **The Goblin King's Horde** (waves +
traps + the Goblin King raid boss) · 7 **Godfall** (the Avatar of Erebos,
7-layer raid boss with phase gates; Hikari's last investiture = **Admin
Override**, §13; routes converge; the epilogue teases the sea passage west —
the other continent).

### 12.3 "The Two Continents" (stretch, NOT scoped)

The convergence arc: 2 crossover chapters after both campaigns ship — Bin
sails west / Chen Fan answers the same anomaly; the finale reveals the
Outer Court's crack and Erebos's Gate are the same wound, fought as a
two-hero co-op scenario (the second protagonist as a scripted allied AI
seat). Listed so both campaigns keep their epilogue hooks pointed at it.

---

## 13. The System / cheat layer (campaign-only, stated first)

**Multiplayer never sees any of this** — Bin's multiplayer hero specialty
(§6.1) and the fate spends (§3.4) are the entire cheat fantasy allowed on a
shared table. In the campaigns, ONE shell with per-campaign data:

- **The quest log** — a diegetic panel (Chen Fan: "The System" / Bin: "the
  Interface"): chapter side-quests from the §3.5 predicate vocabulary with
  fate/pill/artifact rewards; docks like `MoraleCardsDock`.
- **Per-chapter picks** — choose 1 of 3 permanent campaign boons (Chen Fan:
  **Golden Fingers**; Bin: **Cheat Skills**), all existing engine reads:
  *Item Box* (+1 hand limit) · *Gamer's Mind* (1 free reroll per combat) ·
  *EXP Boost* (+1 XP per won combat) · *Auto-Loot* (+1 gold per won combat,
  Soul-Reformer twin) · *Speed Run* (+1 MP per turn) · *Map Hack* (once per
  chapter, flip a face-down tile without moving — scry-reveal reuse) ·
  (xianxia flavor twins: *Photographic Memory*, *Game Sense*, *Lucky Star*).
  The 5B route swaps Bin's pool for corrupted variants (bigger numbers,
  karma cost).
- **Console moments** — scripted, chapter-gated beats (ch. 7's
  `/admin override`: all three of your picks active at once), pure VN
  presentation firing normal reducer actions; the §11 scope guard (scenes
  never mutate rules state directly) is not weakened.

---

## 14. Art & audio production (image-gen pipeline)

**Pipeline** (all existing, generator-agnostic): per-category prompt-sheet
docs (the `war-machine-card-art-prompts.md` field schema) → generate with
Gemini 2.5 Flash Image via `scripts/edit-card-image.mjs` or the browser
workflow (`scripts/browser-gemini-card-workflow.md`); GPT-image is a drop-in
alternative → raw art in `scripts/anime-art/` (never `public/`) → ONE
compositor `scripts/build-anime-cards.mjs` (clone of
`build-commander-cards.mjs`, parameterized by frame/glyph config so both
packages share it) → `public/assets/*.webp` (portrait faces 743×1040,
q82–92) → R2 sync automatic on push. Every consumption position through
`assetUrl()` (`asset-url-coverage.test.ts` enforces).

**Style bible** (`docs/anime-art-style.md`, one doc, two registers):
- *Ninefold Realms*: hand-painted wuxia/xianxia board-game illustration —
  ink-wash atmosphere over painterly HoMM readability; NO photorealism, no
  European plate armor. Per-town palettes: Azure Breeze (floating peaks,
  jade robes, sword light), Blood Cult (blood seals, bone altars, black-red
  sutras), Yaoguai (fox masks, mountain mist), Outer Court (star fractures,
  void gates), Guild (river ports, caravans, abacus).
- *Otherworld Gate*: **anime-painterly hybrid** for card faces — clean
  lineart, cel-adjacent shading, muted saturation and painterly texture so
  cards sit beside the H3 scans without reading as stickers; full cel style
  is allowed ONLY for VN sprites and CGs. Per-town palettes: Fuyuki City
  (leyline-lit night streets, command seals, translucent servant shimmer),
  Hidden Leaf (forest slate, headbands, hand-sign sigils, canopy light),
  Naval Base (white steel, rigging halos, sea glare). Bosses get
  double-width hero-shot art.
- **Likeness rule (follows the §-header naming decision):** depict the
  source characters **faithfully and recognizably** — Saber's blue-and-gold,
  Naruto's orange-and-black with the Leaf headband, Laffey's white twintails
  and sleepy eyes, Goblin Slayer's cheap steel helm — as freshly GENERATED
  renditions; never trace, upscale or paste official art into an asset.
  Identity reference images (user-supplied screenshots are fine for this
  private project) go in `scripts/anime-art/refs/<slug>/` for the edit-mode
  identity workflow (the repo's established consistency trick: one reference
  sheet per character first, then expression/pose edits keep the face) —
  add that folder to `.gitignore` so references never enter history,
  `public/`, or the CDN.
- Hard constraint in every prompt: no text/numbers baked into generated art
  — titles, stats and glyphs are set by the compositor from
  `scripts/card-glyphs/`.

**Asset plan — exact deliverables** (isekai package; conventions follow the
existing pipeline — faction slugs `fuyuki` / `hidden_leaf` / `azur_lane`;
xianxia counts unchanged from §5):

| Category | Exact deliverables | Filename convention |
| --- | --- | --- |
| Unit card windows (7 per town) | Fuyuki: assassins · riders · lancers · archers · casters · sabers · berserkers — Hidden Leaf: genin-squad · medical-nin · anbu-black-ops · jonin · giant-toad · jinchuriki · susanoo-avatar — Naval Base: laffey · javelin · sirius · noshiro · unicorn · nagato · amagi | `units-<faction>-<tier>-<line>-{few,pack}.webp`; one window reused across Few/Pack by the compositor (the Phoenix precedent) |
| Hero portraits (×2 each: card + board) | Fuyuki: **bin** · shirou-emiya · rin-tohsaka · illyasviel · kiritsugu · lord-el-melloi — Hidden Leaf: naruto-uzumaki · sasuke-uchiha · kakashi-hatake · tsunade · shikamaru-nara · jiraiya — Naval Base: honolulu · yukikaze · enterprise · belfast · akagi · bismarck | `heroes-<faction>-<hero>.webp` + `hero_boardart-<hero>.webp` |
| Specialty card art (18 per town) | one window per hero reused across I/IV/VI with a level tint (halves the count) | `specialty.<hero>.{1,4,6}` faces via the compositor |
| Buildings (7 per town + town/board/tile) | incl. the Summoning Circle, Chunin Exam Arena, Wisdom Cube Laboratory as their towns' signature pieces | building sheet + `board/tiles/` starting-tile art |
| Commanders | ruler-jeanne · might-guy · vestal (+ xianxia: sword-saint · fox-sage · demon-patriarch · void-envoy) | `units-commander-<slug>.webp` built by `build-anime-cards.mjs` |
| Party Members | goblin-slayer · priestess · high-elf-archer (+P16: dwarf-shaman · lizard-priest) | neutral-card frame |
| Isekai neutrals (~16) | goblin-scouts · hobgoblin-brutes · goblin-champion · goblin-shaman · goblin-lord · slime-swarm · giant-slime · sovereign-slime · titans · hollows · pacifista · dire-wolves · harpy-matron · cultist-choir · parade-lich · rift-tyrant | `units-neutral-<tier>-<slug>.webp` |
| Raid bosses (double-width) | goblin-king · colossal-titan · abyss-kraken · calamity-dragon · avatar-of-erebos + Rift Lair field art | boss card faces + map field |
| Banks & the Dungeon | goblin-nest · slime-pit · hollow-shrine · dimensional-breach field art + ~10 bank unit cards + the Dungeon gate field | creature-bank conventions |
| Locations & objects | capsule-corp-lab · uraharas-shop · guild-hall fields; trap markers ×4 kinds (hidden marker is NO art by design — sprung markers only) + the spike-pit battlefield token | map token art |
| Guild | board background · rank badges F/E/D/C/B/A/S · 16 commission card faces · the S-Rank seat chip | `ui/` + card frames |
| Gods | hikari & erebos full portraits · patron cards hikari/tekkai/raiju | overlay + card art |
| VN sprites (3–4 expressions each) | isekai cast: bin · hikari · guild-girl · goblin-slayer · priestess · high-elf-archer · kaito · vesper · erebos-avatar (+ cameo sprites: naruto, jeanne) — xianxia cast ~10 (chen-fan + the §12.1 cast) | `story/sprites/<char>-<expr>.webp`; reference sheet first, then expression edits |
| VN backgrounds (~14) & CGs (~10 isekai) | bgs: Hikari's summoning chamber · guild hall · Fuyuki bridge at night · Leaf village gate · dungeon gate & depths · goblin cave · frontier farmstead · wave battlefield under the cracked sky · Erebos's void throne · dawn shrine · tavern · harbor · sea passage west — CGs keyed to chapter beats: the summoning · first wave · the Minotaur · the farm rescue · S-rank ceremony / the Dark Bargain · the Goblin King's fall · Admin Override · Godfall · the epilogue shore | `story/bg/`, `story/cg/`, 16:9 webp |
| Crests & UI | anime crest · two package icons · wave/boss announcement banners · dungeon floor badge · patron chips | `ui/*.webp` |

**Budget** ≈ 630 images across both packages (the 7 towns' ≈ 420 dominate)
— months of asset work even AI-assisted, phased per §20; the counts above
drive those estimates. Per-character consistency: reference sheet first,
then edits (identity held by the edit workflow).

**Audio**: unit/commander/boss voices — **zero new files** (map to existing
H3 voice sets in `unit-sounds.ts`: goblins → Gnoll/Goblin, specters →
Ghost/Wraith, bosses → Dragon/Behemoth families, commanders per §7); stings
reuse (`good-morale`, level-up fanfares) for breakthrough/rank-up/quest;
music — 2–3 tracks per register (guqin/dizi/erhu; modern-fantasy orchestral)
added to `public/sounds/music/` + `manifest.json` + `MusicScene` wiring
(`src/lib/music.ts` `SCENE_TRACK`), **sourced CC0/licensed or user-supplied
— AI music generation is out of this plan's pipeline**; none-at-ship is an
acceptable stated limit.

---

## 15. UI/UX — the skin

Per §3.6: `.animeMode` root base + `.xianxiaTheme`/`.isekaiTheme` content
classes, one delimited `globals.css` block, every selector prefixed, zero
effect when off (CONTROL-pinned), composing with `.phoneMode` (new overlays
re-anchor above the tab bar like every fixed overlay). Base chrome: subtle
shared "Otherworlds" framing on the table. Xianxia content chrome: jade-gold
tokens, brush-stroke borders, cloud-mist backdrops, realm glyph badges,
karma/fate/title chips. Isekai content chrome: brighter accents, dialogue-
box story theme, guild rank chips + commission dock (`MoraleCardsDock`
pattern), wave/boss announcement banners (EventDrawnOverlay pattern grown
loud — sky-crack banner, boss layer bar), trap glyphs, patron chips, Dungeon
floor badge. Phone mode: the guild board/quest log are panels inside the
Menu/Decks tab, not new tabs. Global resource-subtitle rule per §2.

---

## 16. Cross-cutting seams (each named here must be tested in its phase)

- **Parallel turns**: quest prompts, tribulations, pill windows, story
  choices, patron picks, guild claims and boss-entry confirms are exclusive
  interactions or quiet actions — the bystander fingerprint guard covers
  them; each gets an ordered-mode + bystander CONTROL. Waves ride the
  round-start barrier (§6.6.2).
- **PvP Neutral Control**: mod guards flow through the standard ability
  pipeline, so controlled guards work unchanged; wave armies and raid
  bosses are played by the next-clockwise seat (the mode's showcase);
  `PLACE_TOKEN_ACTION` variants join the free-mode token offers.
- **WOG mod**: the §3.9 contract — commanders join wave/boss/Dungeon fights
  under the normal deployment cap, `wog.newCreatures` merges beside both
  anime neutral slices with no false `family` matches, `wog.newObjects`
  coexists with the anime designer objects, and the §3.8 soak runs all
  three option blocks on.
- **Morale Cards**: Mind-Calming vs negative-absorption ordering (§5.9); Qi
  Burst mirrors `combat_bonus` including the instant-window reaction seam;
  `MORALE_LOCK` (the Hollows' Fear) gates spends/uses but never draws/gains — pinned
  both ways.
- **Events deck**: no mod Event cards in V1 (§22); the wave barrier orders
  explicitly after a drawn Fortress Event (§6.6.2).
- **AFK/timeout/elimination**: every new pendingChoice joins
  `RESOLVING_ACTION_TYPES` with a default answer (quest → Leave; tribulation
  → decline; pills → skip; story → dismiss; patron → Godless; boss confirm →
  decline; wave battle → forced retreat with stakes); `eliminatePlayer`
  clears owned quest/tribulation/story/patron/boss windows and drops the
  seat's pending wave assault (barrier-recovery precedent).
- **Player views**: karma/fate/titles/ranks/pills/realms/boss
  state/commission board are public; trap objects are MASKED until
  triggered (§6.7.1, the one new masked zone — pinned per-view); System
  quests are campaign-local (solo).
- **Reconnect**: story cues, quest prompts, wave/boss announcements rebuild
  from live state (`reconnectRoundStartCues` pattern).
- **Legacy snapshots**: every field optional; absent = off. **MMR/match
  report**: unchanged; campaign rooms are `sp-` (never reported).
- **e2e**: one Playwright spec per shipped surface (crest + quick-selects, a
  quest guard completion, a guild claim, a wave round, a boss layer break, a
  trap trigger, a story scene, phone-mode reachability).

## 17. Single-player / computer-seat compatibility (per-phase gate)

The AI must play every mod surface without stalling (the repo's #1
historical failure mode). Per phase, score the new windows in the
visit/choice policies: quest guard (complete when predicate met & affordable
→ else fight when a `canBeatGuardedField`-style check passes → else Leave) ·
commissions (claim the best-scoring affordable card; spend D-rank shop
surplus; recruit Party Members from surplus after the core army — the
stack-layer precedent) · waves (fought through the normal combat runner — no
new window; retreat scoring when hopeless) · bosses (engage gated on the
army-strength comparison vs remaining layers; layer-chipping when reward ≥
risk, never suicidal) · Dungeon (enter when no better objective is in
walking reach — the exploration-fallback slot) · pills (heal when
lethal-saveable, Qi Burst on even fights) · tribulation (accept when army ≥3
healthy units) · patron (scored default: Tekkai for might, Raiju for
map-hungry heroes) · Erebos's Bargain (never taken by the AI in V1 —
documented) · traps (§6.7.1 — no omniscience) · story cues (auto-dismiss for
computer seats) · towns (build/recruit scoring falls out of the generic
development policy — verify with a soak). Gate per phase: the §3.8(b)
all-modules-on fixed-seed soak reaching round 6 with zero stalls.

## 18. Testing strategy (CLAUDE.md §1a applied)

Per phase, beyond the per-feature effect tests named in-line: (1) town
content tests (factory pattern: art-on-disk, playable wiring,
hero→specialty→unit, castle-twin mutation controls); (2)
`ability-text-enforcement.test.ts` auto-covers every new unit side — target
ZERO mod entries in `DISPLAY_ONLY_ABILITIES` (any conscious stub is a named
registry entry + first-line caveat in the report); (3) effect-level
behaviour with mode-off / one-grade-below / wrong-faction / wrong-family
CONTROLs for every NEW arm and every REUSE wiring, mutation-checked against
observable outcomes ("defense went 3→1", "the bronze side left play on the
rolled face and the SILVER control did not", "the morale spend was refused
AND the draw still happened") — never bare data checks; (4) invariants that
guard many (every ability tag resolves implemented; every alignment tag is
orthodox|demonic; every `family` tag valid; every boss's layers ≤ printed
cap; every commission predicate resolvable on a bare map; every scene/art
asset exists on disk); (5) persistence tests (boss wounds across attempts
AND across a snapshot save/load; dungeon floors per player; guild rank
points); (6) the §3.8 master CONTROLs re-run each phase.

## 19. New engine surface — the unified honest ledger

Everything in this plan that is NOT a straight reuse, deduped across both
packages (each lands with its own effect-level test + CONTROL). **SHARED**
arms are built once, parameterized, consumers wire data only:

| Arm / system | Kind | Consumers |
| --- | --- | --- |
| `ATTACK_BONUS_ADJACENT_ALLY` (param `adjacentTo`) | SHARED arm | Outer Sect Disciples; Genin Squad (`adjacentTo: "target"`); Goblin Scouts/Lord |
| Die-face→token arm (params `face`, `token`) | SHARED arm | Tiger (par@−1), Serpent (cor@+1), Illusionist (weak@+1); Riders (par@+1) |
| `PLACE_TOKEN_ACTION` token variants (paralysis / initiative-down) | SHARED variant (arm exists, `abilities.ts:64`) | Nine-Tailed Fox; Amagi; + free-mode PvP-neutral-control offers |
| Charge as a unit tag (generalize `commander-charge`) | SHARED arm | True Inheritors, Dragon Horse; Sabers, Noshiro, Dire Wolves |
| `requiresNotMoved` ability-gate param | SHARED param | Archers, High Elf Archer, Laffey (Sleepy) |
| `PUSH_TARGET_AWAY_1` (requires a free directly-away space) | NEW arm | Spirit Crane Pack |
| `ADJACENT_ALLY_DEFENSE_ON_ROLL` (params `faces`, `bonus`) | NEW aura arm | Core Formation Master Pack |
| `START_TURN_HEAL_SELF_AND_ADJACENT` | NEW turn hook | Mountain Guardian Few/Pack |
| `ON_REMOVAL_HEAL_ADJACENT` | NEW arm | Mountain Guardian |
| `ON_REMOVAL_OWNER_RESOURCE` | NEW arm | Cult Initiates |
| `SELF_DAMAGE_ATTACK_BOOST` | NEW arm | Blood Venerables (+ Demon Patriarch cast rider param) |
| `AFTER_ATTACK_SPLASH` | NEW arm | Jinchuriki Few |
| `MORALE_LOCK` (Fear) | NEW arm | Hollows, Rift Tyrant, Avatar of Erebos |
| **Devour** (tier-gated die-face side removal; `gorgon-death-stare` machinery variant) | NEW arm | Titans, Colossal Titan (boss), Rift Tyrant |
| `requiresLayersAtMost` gate | NEW gate | boss Enrage phases |
| `ADJACENT_ALLY_RANGED_GUARD` aura | NEW arm (Naval Base only) | Sirius |
| Medic token-removal pick param | NEW-lite | Medical-Nin, Priestess |
| `ELIXIR_SHOP` building | NEW building | Alchemy Pavilion |
| `BLOOD_ALTAR` building | NEW building | Blood Demon Cult |
| Morale-costed + tile-reveal `CityHallOption`s | NEW options | Blood Pool; Star Chart |
| `GRANT_UNIT_STACK` building (3rd `armyUnitStacksActive` activator) | NEW building | Transformation Pill Hall |
| Free-extend Citadel rider (`CONTINUE_NEUTRAL_COMBAT` waiver) | NEW rider | Realm-Breach Platform |
| `TOWN_GATE_TRAVEL` building | NEW building | Spatial Gate |
| `SUMMON_GACHA` building | NEW building | Summoning Circle |
| `PAY_DRAW_FILTER` building | NEW building (Naval Base) | Wisdom Cube Laboratory |
| Guild block (board/claims/ranks/perks) | NEW system | §6.4 |
| Wave block (scheduler, wave table, pillage/overrun) | NEW system | §6.6 |
| Raid-Boss block (registry, lair field/object, persistence ledger, announce/escalate) | NEW system | §6.5 |
| Trap object + `spike_pit` battlefield-token kind | NEW system (token handler REUSE) | §6.7.1–2 |
| Dungeon block (site, floors, reward ladder) | NEW system | §6.7.3 |
| Patron/Miracle block + Erebos's Bargain | NEW system | §6.9 |
| Cultivation track + Tribulation | NEW system | §5.6 |
| Destiny substrate + titles | NEW system | §3.4, §5.7 |
| Quest Guard object + 3 new predicates | NEW system | §9, §3.5 |
| **Field Override system** (carve, pending, pool, placement modes, designer Mod panel) | NEW system (REUSE token placement seams) | §3.10, §9b, §5.8 |
| Ninefold single-hex locations (Bí Cảnh, Kiếm Trủng, Linh Tuyền, Ngộ Đạo Thạch, Array) | NEW locations (mostly REUSE interactions) | §5.8 |
| Pháp Bảo artifact set (7 cards) | NEW cards + 1–2 NEW arms (remote trade, spell cancel) | §5.10 |
| Tâm Ma token + activation roll | NEW token arm | §5.11 |
| Heavenly Tribulation Expert spell (2×2 + survivor +1 Attack) | NEW spell | §5.12 |
| Đoạt Xá specialty (steal bronze on death) | NEW specialty arm | §5.13 |
| Story overlay system + campaign shell | NEW presentation systems | §11–12 |
| 7 commander specialty ids | NEW cases | §7 |

Roughly 14 content arms + 10 system blocks against ~40 straight reuses —
consistent with the repo's reuse-first rule.

## 20. Implementation phases & gates (each = one landable slice)

Default order interleaves the packages for early playable value (isekai
systems first — they are the new ask — with the xianxia towns folded in from
P6). The two tracks only depend on the P0 spine and their own rows, so the
user can reorder tracks without re-planning (§22 Q2).

> **SHIPPED AHEAD OF PHASE ORDER (2026-07 session).** The default table order
> below is unchanged, but several systems were pulled forward and shipped early
> (each engine-wired + mutation-tested, cross-referenced in
> `docs/anime-mod-session-2026-07.md`): **P0b** Field Override spine + Ninefold
> locations, **P0c** Pháp Bảo artifacts, plus the new SHARED systems added
> mid-session — **Hero Grades** (§3.11), **Forced Battle Events** (§3.12),
> **Equipment** (§3.13) — and, ahead of their divinity-layer/story phases,
> **Cultivation & Tribulation** (§5.6, part of the P11 divinity layer), the
> **Story system** (§11) and the **campaign hub + Chapter 1** (§12, the P13
> row's presentation half). Their P11/P13 rows still list the REMAINING work
> (destiny substrate, Gods, chapters 2–7, the cheat shell).

| Phase | Ships | Gate (beyond green lint/typecheck/test) |
| --- | --- | --- |
| **P0** | Spine: `AnimeModOptions`, crest + package quick-selects, `.animeMode` scaffold + both term dictionaries, art scaffolding (style bible, prompt sheets, shared compositor), CLAUDE.md section stub | §3.8(a) master CONTROL; quick-select = exact module groups; crest e2e |
| **P0b** — SHIPPED | **Field Override spine** (§3.10 / §9b): types, catalog, `carveFieldOverride`, setup pin + pending reveal (random/manual/manual-or-refuse), lobby placement mode, designer **Mod panel** (palette + face-down pin), Ninefold V1 locations (§5.8 table) with effect-level tests | module-off CONTROL; designer pin round-trip; each location visit outcome + guard fight for Bí Cảnh; AI answers placement window; bank/token coexistence — done |
| **P0c** — SHIPPED | **Pháp Bảo** artifacts that REUSE existing arms (Cosmic Bag, Spirit Gathering Board, Wind & Fire Wheels movement, Heaven-Slaying Attack stat, Bagua Mirror defense) — 5 cards, `src/data/anime/artifacts.ts`; the Eastern Bell (army Armored) + Sound Transmission Jade (remote trade) remain DESIGNED-not-shipped (see §5.10 V1 STATUS). Deferred fancy halves (cleave-exhaust, spell-cancel, bronze aura) not printed. | deck-join on/off + income riders with CONTROLs — done (`anime-artifacts.test.ts`) |
| **P0d** | **Tâm Ma** token arm + one producer stub; **Heavenly Tribulation** spell; remaining artifact combat arms + Đoạt Xá | token roll outcomes; spell area + survivor buff; possession fizzle CONTROL |
| **P1** | **Fuyuki City** complete (units/buildings/heroes incl. **Bin**/commander **Ruler (Jeanne)**/tile/board/art) + Summoning Circle + its SHARED/NEW arms | content test; commander bijection updated with a `wog.commanders`-on seat; SP soak with a Fuyuki AI seat |
| **P2** | **Isekai neutrals** + 4 isekai banks + Devour/`MORALE_LOCK` + isekai map locations | bank rows vs `polish-bank-sizes` on/off; Fear↔morale-deck interplay tests; §3.8 gates begin |
| **P3** | **Adventurers' Guild** (board, ranks, commissions, Party Members) + the shared quest vocabulary (§3.5) | rank-perk tests each with rank-below CONTROL; claim race (parallel turns); AI claims in soak |
| **P4** | **Calamity Waves** | barrier-order test (income→event→waves→City Hall); pillage/overrun effect tests; AFK-retreat + elimination CONTROLs; PvP-neutral-control wave test; AI wave soak |
| **P5** | **Raid Bosses** (+ `boss_lair` object, announce/escalate) | persistence across attempts + snapshot; layer-payout ledger; escalation; PvP-neutral-control boss test |
| **P6** | **Azure Breeze Sect** + Sword Saint + Alchemy Pavilion (+ its NEW unit/building arms) | content test; push-space occupied/free outcomes; Talisman Aura die-face controls; Verdant Pulse self/adjacent/non-adjacent outcomes; ELIXIR_SHOP fallback (pills off) test |
| **P7** | **Elixir Pills** + **Secret Realms** (6 banks, grade rows, realm-grade skin) + **xianxia neutrals** | pills morale-seam tests; bank grades vs polish on/off; Deity-Transformation ships-or-registers rule |
| **P8** | **Quest Guard** object + **Traps** + xianxia map locations + Guild sites (the designer wave) | designer round-trip/sanitize; every quest kind + reward effect-tested; trap view-masking per player view; AFK/elimination/parallel CONTROLs; AI plays a quest+trap map |
| **P9** | **Hidden Leaf Village** + **Yaoguai Valley** (+ Might Guy, Fox Sage, Chunin Exam Arena, Transformation Pill Hall) | content tests; `AFTER_ATTACK_SPLASH` + damage-cap CONTROLs; `armyUnitStacksActive` third-activator tests |
| **P10** | **Blood Demon Cult** + **Outer Court** (+ Demon Patriarch, Void Envoy, Blood Altar, Spatial Gate, over-limit specialties) | content tests; karma hooks land dormant (fire only when substrate on); Book-on over-limit tests (§10) |
| **P11** | The divinity layer: **Destiny substrate + titles**, **Cultivation + Tribulation**, **Gods & Blessings**, and the §8 synergy pass (commission entries, wave themes, western boss, shop pills, realm-gate union) | every source/spend with mode-off CONTROLs; both-titles-on-one-axis test; each §8 item with a one-side-off CONTROL; all-on soak |
| **P12** | **The Dungeon** (+ floor bosses) | floor progression/reward ladder; per-player floors across snapshot; AI delves in soak |
| **P13** | **Story system** + campaign hub + **Bin chapters 1–3** + the System/cheat shell | scene-asset integrity; ch-1 boot-to-victory smoke; cheat-pick effect tests; reconnect cue test |
| **P14** | **Bin chapters 4–7** (routes) + **Chen Fan chapters 1–3** | fixed-seed completion per Bin route |
| **P15** | **Chen Fan chapters 4–7** (routes) + skin/phone polish + full both-package soak | fixed-seed completion per Chen Fan route; nightly soak green |
| **P16** (stretch) | **Azur Lane Naval Base** (+ Vestal, Enterprise/Belfast/Akagi/Bismarck, the Dwarf Shaman & Lizard Priest party pair) + Abyss Kraken sea spawn + **The Two Continents** convergence arc + the Destiny-draft variant | content test; sea-boss spawn test; co-op scenario smoke |

Art rule per phase: no undeclared placeholders (the Factory "fake
portraits" lesson — declared in a registry, then replaced).

## 21. Definition of done

The mod is done when: all `AnimeModOptions` default OFF and the master
CONTROL proves off-tables unchanged (plus the mixed-package CONTROLs); all
six V1 towns pass content tests with zero display-only unit sides (or
consciously-registered stubs led in the report); the extended commander
bijection + behaviour suites pass; quest guards round-trip the designer with
every predicate/reward effect-tested; guild/waves/bosses/traps/dungeon/
pills/realms/cultivation/destiny/gods each carry mode-off CONTROLs and their
§18 observable-outcome tests; boss wounds, dungeon floors and rank points
survive snapshots; the all-modules-on soak and all four campaign-route
completion tests are green; every image referenced by data exists on disk
(integrity tests) with raw AI art out of `public/`; and CLAUDE.md gains an
"Anime mod" section documenting what runs vs deliberate limits, caveats
first.

## 22. Open questions (defaults chosen so work can proceed)

1. **Track order** — default: isekai systems first (P1–P5), xianxia towns
   from P6, campaigns last. Confirm, or reorder tracks (they only share the
   P0 spine).
2. **Town count** — 6 towns + the Azur Lane Naval Base stretch is a LOT of
   art (§14). Authorize the volume, cut a town per package, or accept
   placeholder-then-replace pacing for P9–P10.
3. **Commander picks** — Ruler (Jeanne) for Fuyuki City, Might Guy for the
   Hidden Leaf, Vestal for the Naval Base, as specced in §7? Any swap is a
   data-only change (slug + art + voice row).
4. **Wave pillage harshness** — keep the mine/settlement overrun stake, or
   gold-only for V1? Default: ship both, tune at playtest.
5. **Boss behavior** — default stationary lairs, +1 layer per 4 rounds;
   roaming bosses and a simultaneous "raid party" mode stay out of scope.
6. **Bin's kit** — magic hero with draw/reroll/over-limit as specced?
   Default: yes (the cheat reads as knowledge).
7. **Fear scope** — `MORALE_LOCK` blocks morale spends/uses but never
   draws/gains. Confirm the reading of the docx's "cannot use Morale
   tokens".
8. **Gods depth** — V1 = one pick + one Miracle + the Bargain; a full
   divine-favor track is deferred. Confirm.
9. **Dungeon shape** — 10 floors, bosses at 5/10, per-player progress; a
   shared-progress "race" variant is stretch. Confirm.
10. **Karma PvP trigger** ("bullying the weak", §5.7) — keep or cut after
    playtest? Default: ship behind the substrate, tune the 60% threshold.
11. **Deity Transformation pill** (second activation) — attempt in P7, stub
    consciously if the machinery slips. Confirm.
12. **Localization depth** — story text bilingual EN/VI by construction;
    full UI translation NOT in scope. Confirm.
13. **Music licensing** — CC0/licensed/user-supplied per register, or
    none-at-ship (acceptable limit). Default: none-at-ship.
14. **Account-synced campaign progress** — localStorage first; sync when
    the accounts backend grows a save slot. Default: later.
15. **Mod Event cards** for the Events deck — natural post-P15 follow-on,
    out of scope here.

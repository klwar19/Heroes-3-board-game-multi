# Anime mod — ONE mod, two theme packages: **Ninefold Realms** (xianxia) × **Otherworld Gate** (isekai) — design + implementation plan

> **STATUS: DESIGN ONLY — NOTHING IN THIS DOCUMENT IS IMPLEMENTED.** No engine
> code, data, art or tests for this mod exist yet. Every mechanic below is a
> *proposal*, engine-shaped against the current codebase (file references
> verified 2026-07-16 against `main`). Per CLAUDE.md, nothing here may be
> called "done" until it is engine-enforced AND covered by a test that fails
> when the logic is removed.
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
- **Otherworld Gate** content: EN primary + Japanese-romaji secondary in
  italics — **the Dungeon** (*Meikyū*), **Hikari** (*Akatsuki no Megami*).
- Campaign/story text is bilingual **EN/VI** for BOTH packages (the shared
  story system is bilingual by construction, §11).

**IP rule (non-negotiable for anything committed/pushed).** The isekai
brainstorm names real anime properties (Azur Lane, Fate, Naruto, AoT, Bleach,
One Piece, Goblin Slayer). This plan ships **IP-neutral homage content**:
every id, asset filename and default display name is original, and ALL
display names/flavor live in per-package dictionaries
(`src/data/anime/terms.ts`) — so a private table that wants the original
anime names can restore them with a data-only string swap, no engine or
asset-id change. Nothing in `public/`, the repo history, or the CDN may carry
trademarked names or traced/model-recognizable art.

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
| `anime.isekaiTowns` | 門 | OFF | Adds the isekai factions: **Summoner's Citadel** and **Hidden Village** (V1), **Steel Harbor** (stretch) (§6.1–6.3). **Bin** ships as a Summoner's Citadel hero, playable in ordinary multiplayer. |
| `anime.isekaiNeutrals` | 門 | OFF | ~15 isekai neutral cards (goblin family, slimes, giants, specters — §6.8) + 4 isekai **Creature Banks** (bank half requires `creatureBanks`). |
| `anime.guild` | 門 | OFF | The **Adventurers' Guild**: global commission board, per-player ranks F→S with perks, rank-A **Party Member** unique neutrals (§6.4). Map-independent. |
| `anime.monsterWaves` | 門 | OFF | **Calamity Waves**: scheduled monster invasions; every live seat fights a themed wave army; loss = pillage (§6.6). Cadence select (3rd/4th/5th round). Works in single-player. |
| `anime.raidBosses` | 門 | OFF | **Raid Bosses**: persistent multi-layer world bosses — announced spawns or designer **Rift Lairs**, wounds persist between attempts, escalate if ignored, pay per layer broken (§6.5). |
| `anime.dungeon` | 門 | OFF | **The Dungeon** (*Meikyū*): one repeatable multi-floor delve per map, per-player floor progress, floor bosses, scaling rewards (§6.7.3). Requires `creatureBanks`. |
| `anime.gods` | 門 | OFF | **Patron Blessings**: pick a patron deity (small passive + once-per-game Miracle); the antagonist god's wave hook (§6.9). Also lights the §3.4 substrate. |
| *(designer content — no toggle)* | both | n/a | **Quest Guards** (§9) and **Traps** (§6.7.1) are map-designer objects usable on any map once `anime.enabled`; **Rift Lair** objects additionally need `raidBosses` (dropped with a setup problem otherwise). Story timed-events ride the existing designer machinery (§11). |
| Story mode | both | n/a | The campaign hub: **"The Jianghu Chronicle"** (Chen Fan, §12.1) and **"Bin's Otherworld Chronicle"** (Bin, §12.2), plus the stretch convergence arc (§12.3). Menu entry, single-player infrastructure. |

Module dependency edges (enforced in the lobby UI like `creatureBanks` →
`polish-bank-sizes`): `secretRealms` and `dungeon` and the bank half of
`isekaiNeutrals` require `creatureBanks`; `elixirPills` is required for the
Alchemy Pavilion's pill shop and the Guild Shop's pill stock (both fall back
gracefully, stated on the definitions); `destiny` OR `gods` activates the
shared substrate (§3.4); Party Member recruiting requires `isekaiNeutrals`;
karma-gated quests are inert without the substrate (documented in the
designer). Everything else is independent — including cross-package mixes.

**Ranked/MMR policy:** anime tables record W/L like any table; `ranked`
stays whatever the room set. No Elo special-casing (mod flags are just game
options).

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
  ranks F→S, commission boards, the receptionist **Mira**, guildmaster
  **Baldur**. The **goblin problem** is the continent's gritty corner:
  individually trivial, collectively its deadliest force, hunted by one
  silent specialist (**the Slayer**, §6.4.4). The **Dungeon** under the old
  capital is the Guild's living: floors, floor bosses, fair deals.

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

### 3.8 The standing integration gates
From P2 on, every phase re-runs: (a) the master byte-identical-when-off
CONTROL (scripted game event-log identical to `main` with `anime` absent);
(b) a fixed-seed single-player soak with **every module of both packages
ON** reaching round 6 with zero stalls (joins `single-player-soak.test.ts`);
(c) the mixed-package CONTROL (one module from each package on — no
cross-talk).

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

| Line (tier, type) | Few | Pack | Mechanism |
| --- | --- | --- | --- |
| **Outer Sect Disciples** (*Ngoại môn đệ tử*) — bronze, ground | — | **Sword Array**: +1 Attack while adjacent to a friendly unit | SHARED `ATTACK_BONUS_ADJACENT_ALLY` |
| **Inner Sect Swordsmen** (*Nội môn kiếm sĩ*) — bronze, ground | Ignore combat penalties | same, higher Initiative statline | REUSE `ignore-combat-penalties` |
| **Alchemy Acolytes** (*Luyện đan đệ tử*) — silver, ranged | [activation] heal an adjacent unit 1 | [activation] heal an adjacent unit 2 | REUSE (Enchanter heal-pick activation pattern) |
| **Sect Protectors** (*Hộ tông hộ pháp*) — silver, ground | Defense token (roll the Defend die when attacked) | Unlimited retaliation | REUSE `SELF_DEFENSE_TOKEN` / `unlimited-retaliation` |
| **True Inheritors** (*Chân truyền đệ tử*) — gold, ground | Charge (+1 Attack on an attack after moving) | Charge + ignores retaliation | SHARED charge unit tag (generalize `commander-charge`) / REUSE `ignores-retaliation` |
| **Sword Immortal** (*Kiếm tiên*) — gold, flying | Sword-qi line: also attack the unit behind the target | same + ignore combat penalties | REUSE `SECOND_ATTACK_BEHIND_TARGET` (Mechanics' reach) |
| **Mountain Guardian** (*Thủ sơn linh thú*) — gold, ground | high HP, no ability | On removal, heal every adjacent friendly unit 1 | NEW `ON_REMOVAL_HEAL_ADJACENT` (sign-flipped twin of `ON_REMOVAL_DAMAGE_ADJACENT`, `abilities.ts:1197`) |

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

**Map locations** (`locationDefinitions`, `locations.ts:21`; placed via
xianxia tiles and/or the designer): **Qi Refinement Platform** (revisitable;
pay 1 MP → +1 Attack token for your next combat — REUSE `PAY_TO`+buff-token
step), **Foundation Stone** (visitable; one free reinforce — `HILL_FORT`
family), **Merchant Guild Post** / **Gambling Den** (§5.5), **Outer-Realm
Rift** (revisitable teleport + guarded — REUSE `TOKEN_TELEPORT` + `guard`).

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

---

## 6. Package: **Otherworld Gate** (*Isekai no Mon*) — the isekai half

*(The isekai brainstorm normalized to the engine: the Word doc's PC-style
statlines — Init/Mov/HP, movement stats, "Line of Sight", "Mana" — do not
exist here. Every unit is re-keyed to Few/Pack sides with
attack/defense/health/initiative/cost, tiers bronze/silver/gold, and every
ability mapped to a mechanism. Anchor stat points: Phoenix gold A6/D2/H7/I12,
Enchanters gold A4/D1/H5/I5.)*

### 6.1 Summoner's Citadel (*Eirei no Shiro*) — the Holy-War homage town (flagship)

Violet / antique gold. Powerful independent singles, burst, spell economy.
The seven unit lines are the seven **summon classes** (generic nouns — the
homage stays legal). Lean into ritual circles, command sigils, translucent
"spirit" shimmer on gold units; avoid generic European castle look.

| Line (tier, type) | Few | Pack | Mechanism |
| --- | --- | --- | --- |
| **Assassins** — bronze, ground (A2/D1/H2/I7) | — | Presence Concealment: +1 Defense against ranged-TYPE attackers | REUSE `DEFENSE_VS_ATTACKER_TYPE` (Shield-spell semantics) |
| **Riders** — bronze, ground (A2/D1/H2/I6) | — | Trample: a "+1" on its own attack die Paralyzes the target | SHARED die-face→token arm (paralysis @ "+1") |
| **Lancers** — bronze, ground (A2/D1/H3/I5) | Piercing lunge: attack 2 spaces in a line | same + ignores retaliation | REUSE `mechanics-line-attack` / `ignores-retaliation` |
| **Archers** — silver, ranged (A3/D2/H3/I5) | Ignore combat penalties | same + if it has NOT moved this activation, a full second attack on the same target | REUSE `ignore-combat-penalties`; REUSE `SECOND_ATTACK_SAME_TARGET_AFTER_RETALIATION` + NEW `requiresNotMoved` gate param |
| **Casters** — silver, ranged (A2/D2/H3/I4) | +1 Power to your first spell each round | same + reduce spell damage 1 | REUSE `magi-power-boost` / `reduce-spell-damage-1` |
| **Sabers** — gold, ground (A5/D3/H5/I6) | Radiant arc: also attack the unit behind the target | same + Charge | REUSE `SECOND_ATTACK_BEHIND_TARGET` / SHARED charge tag |
| **Berserkers** — gold, ground (A6/D2/H7/I4) | God Hand: once per combat, when health drops to 0 set it to 1 | same + immune to all Spells (Mad Enhancement) | REUSE `phoenix-rebirth` (`abilities.ts:2120`) / `immune-all-spells` (Magic Elemental Pack) |

Buildings: **Mana Font** (City Hall — `RESOURCE_ROUND_CHOICE` {4 gold |
1 XP}); dwellings **Chapel of Blades / Hall of Legends / Throne of Heroes**
(`UNLOCK_RECRUIT_TIER`); **Command Sigils** (Citadel — `UNLOCK_REINFORCE`);
**Arcane Library** (`MAGE_GUILD`); **Summoning Circle** (unique — NEW
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
| **Reina, the Once-and-Future** | might | Saber-line leadership: I +1 Attack on a Saber's attack; IV/VI scale targets/army (mightSpecialtyOne pattern) |
| **Ruby, Gem Sorceress** | magic | +1 damage riders on damage spells (Deemer/Solmyr damage-ladder family) |
| **Kanna, Blade Copyist** | might | Discard 1 Might card → +1 Attack for a unit's activation (discard-fueled patterns) |
| **Sister Ilya** | magic | Berserker/heal economy: rebirth-adjacent heals (unitHealthSpecialty pattern) |
| **Lord El-Aurie** | magic | Summon economy: Summoning-Circle discounts / extra rolls (map-economy specialty) |

### 6.2 Hidden Village (*Kakure Zato*) — the shinobi town

Leaf green / slate. Swarm tempo, mobility, battlefield control, trap
synergy. Lean into masks, scarves, hand-sign sigils, forest canopy; avoid
samurai plate.

| Line (tier, type) | Few | Pack | Mechanism |
| --- | --- | --- | --- |
| **Novice Shinobi** — bronze, ground | — | Squad tactics: +1 Attack while adjacent to a friendly unit | SHARED `ATTACK_BONUS_ADJACENT_ALLY` |
| **Medic Shinobi** — bronze, ground | [activation] heal an adjacent unit 1 | [activation] heal an adjacent unit 2 OR remove one negative token from it | REUSE Enchanter heal-pick; token-removal pick = NEW-lite param on the same choice |
| **Masked Ops** — bronze, ranged | Ignore combat penalties | same + teleport-move (body flicker) | REUSE / REUSE `teleport-move` |
| **Elite Shinobi** — silver, ground | Charge | Charge + ignores retaliation | SHARED charge tag / REUSE |
| **Great Toad** — silver, ground | Defense token | same + on removal, deal 1 damage to adjacent enemies (smoke-burst) | REUSE `SELF_DEFENSE_TOKEN` / `ON_REMOVAL_DAMAGE_ADJACENT` |
| **Beast Vessel** — gold, ground | Shroud burst: after its attack, deal 1 damage to every other unit adjacent to it (friend AND foe) | Full second attack against every adjacent enemy | NEW `AFTER_ATTACK_SPLASH` / REUSE `SECOND_ATTACK_ALL_ADJACENT_TO_SELF` (enemies-only) |
| **Guardian Avatar** — gold, ground | Absolute guard: each attack against it deals at most 2 damage | same + ongoing-effect immunity | REUSE the Cove Nix per-attack damage cap / `titan-ignore-ongoing` |

Buildings: **Mission Board** (City Hall — `RESOURCE_ROUND_CHOICE` {3 gold |
1 valuables}); dwellings **Academy / Forest Training Ground / Sanctum of the
Beast**; **Village Walls** (Citadel — `UNLOCK_REINFORCE`); **Scroll Vault**
(`MAGE_GUILD`); **Exam Arena** (unique — once per round pay 2 gold → Search
(2) the Ability deck; pure `PAY_TO`+`SEARCH_SHARED_DECK` composition — the
brainstorm's "level-ups offer more skills" translated to this game's skill
economy).

Heroes: **the Shadow** (might; Novice-swarm doubling — Erdamon pattern),
**Aoi, Blade Mistress** (might; Elite Shinobi twins), **the Copy Sage**
(magic; Knowledge/recall economy), **Lady Katsuyu** (magic; heals/Medic
riders), **the Warden** (might; trap synergy — I: your Creature-Bank/Dungeon
combats start with one friendly spike-pit token placed (§6.7.2); IV/VI scale
count/damage), **Gennosuke the Summoner** (magic; Great Toad + summon
economy).

### 6.3 Steel Harbor (*Kōtetsu no Minato*) — the ship-spirit town (stretch)

Navy / white-steel. Ranged superiority, escort formations, sea synergy with
Cove content and the Abyss Kraken boss. Ships LAST; listed so its shared
arms are planned once. Lines (mechanisms only): **Destroyer Sisters**
(bronze ranged, high init; Pack: Defense token — REUSE), **Escort Maidens**
(bronze ground; Pack: adjacent allies +1 Defense vs ranged-TYPE attackers —
NEW aura arm `ADJACENT_ALLY_RANGED_GUARD`, the one true aura, attack-time
stat read like §7's sword-formation), **Torpedo Squads** (bronze ranged;
Pack: "+1" die drops a Corrosion token — SHARED die-face→token arm),
**Cruiser Vanguard** (silver ground; ignores retaliation → + charge),
**Carrier Oracle** (silver ranged; Enchanter heal-activation ladder),
**Battleship Empress** (gold ranged; attack-roll advantage — REUSE
`ATTACK_ROLL_ADVANTAGE`; Pack: + line attack behind target), **Flagship
Sovereign** (gold ground; [activation] place an Initiative-down token on an
adjacent enemy — SHARED `PLACE_TOKEN_ACTION` variant; Pack: + Defense
token). Unique building **Wisdom Cube Laboratory**: once per round pay 1
valuables → draw 2 from your own deck, keep 1, discard 1 (NEW
`PAY_DRAW_FILTER` — the brainstorm's mechanic verbatim, re-costed).

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

**6.4.4 Party Members (the goblin-hunter homage cast, rank-A recruits).**
Three **unique neutral** cards (the Enchanters pattern —
`src/data/factions/units.ts:1986`; recruit via `CONVERT_ARMY_UNIT` +
`goldCost` + `unique`, `src/data/cards/adventure.ts:2318-2344`), recruitable
at any own town while rank A+, one of each per player:

- **The Slayer** — silver, ground (A3/D2/H4/I5, ~14 gold). *Only ever
  goblins:* +2 Attack against goblin-family units (bounty-mark REUSE keyed
  to the `family` flag instead of the mark token); ignores retaliation.
- **Novice Priestess** — bronze, ranged (A1/D1/H3/I4, ~8 gold).
  [activation] heal an adjacent unit 1 OR remove one negative token
  (Medic-Shinobi twin — the shared param'd choice).
- **Elf Ranger** — silver, ranged (A3/D1/H3/I7, ~13 gold). Ignore combat
  penalties + attack-roll advantage when it has not moved (advantage REUSE +
  the `requiresNotMoved` gate).

They are also the isekai campaign's VN party (§12.2) — the cards double as
story cast.

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
minion — bank-guard placement reuse), **Titan of the Wall** (5 layers, slow;
**Devour** — §19: on a "+1" attack die a BRONZE target side is removed
outright — the `gorgon-death-stare` dice-removal machinery, tier-gated),
**Abyss Kraken** (4 layers, sea hex — Cove/Steel-Harbor synergy),
**Calamity Dragon** (6 layers, flying, line breath — REUSE), **Avatar of
Erebos** (7 layers; campaign final + optional multiplayer superboss; Dread
aura §6.8, Enrage).

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
ledger makes "soften it so I can finish it" a real multiplayer play.
Escalation: an unslain boss regrows +1 layer (to its printed cap) every 4th
round, announced. With **PvP Neutral Control** on, the next-clockwise player
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
**theme** rotating per wave (goblin horde → restless dead → rift demons →
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
on defender-approach cells (data on the bank/floor definition); the Warden's
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
"undead" | "rift" | …` for waves/commissions/the Slayer):

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
- **Colossal Giant** — gold (the brainstorm's Titan): slow, huge; **Devour**
  (§19 arm, shared with the Titan boss: a "+1" die removes a bronze target
  side outright).
- **Masked Specter** — bronze (the brainstorm's Hollow): flying; **Dread** —
  the enemy cannot USE morale while a Dread unit lives (token spends and
  morale-card plays/spends/reactions gated; draws/gains still happen) — NEW
  `MORALE_LOCK` (§19; wired at the `SPEND_MORALE` / `addMoraleActions` /
  reaction-offer gates, with a "draws still occur" assertion + mode-off
  CONTROL).
- **Iron Automaton** — gold (the brainstorm's Pacifista): ranged; line laser
  = line-breath REUSE; mechanical flag (`isMechanicalUnit` — Field-Repair/
  Mechanic synergy).
- Rounding out: bronze **Dire Wolves** (charge), silver **Harpy Matron**
  (flying, ignores retaliation), silver **Cultist Choir** (+1 Power to its
  side's first spell — `magi-power-boost` REUSE), gold **Parade Lich**
  (lich splash REUSE), azure **Rift Tyrant** (Devour + Dread — the
  wave-finale miniboss).

**Isekai Creature Banks** (4, joining Far/Near piles; full
`polish-bank-sizes` rows + `buildPolishCreatureBankReward` entries):
**Goblin Nest** (far; goblins; gold + morale; a `win-vs-family` commission
target; spike-pits pre-placed §6.7.2), **Slime Pit** (far; slimes;
valuables), **Specter Shrine** (near; specters — Dread inside; artifact draw
+ morale gamble `ATTACK_DIE_TABLE`), **Rift Maw** (near; rift demons;
expert-spell Search (5) — the brainstorm's "Dimensional Breach" normalized
to the bank vocabulary).

**Map locations** (`locationDefinitions`, placed via isekai tiles/designer):
**Otherworld Lab** (visitable; end your turn → Search (2) the Ability deck —
the brainstorm's skip-turn-for-tech idea: reward + END_TURN force),
**Curio Shop** (revisitable; pay 2 gold → reveal the top 3 of an Artifact
deck, buy up to one at printed cost — the Artifact-Merchant event's
peek-and-buy machinery relocated to a map site), **Guild Hall** (optional
flavor; visiting = one free re-roll of the commission board — quiet action).

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
| Summoner's Citadel | **Seal Bearer** | *Command Seal* — `attack-buff` | `contracted-blade`: +1 Attack while adjacent to a friendly GOLD unit (attack-time stat read) |
| Hidden Village | **Shadow Guard** | *Body Flicker* — `initiative-shift` (Haste rider) | `substitution`: once per combat, when its health would drop to 0, set it to 1 (`phoenix-rebirth` wiring twin on the commander unit — the log-substitution gag) |
| Steel Harbor | **Fleet Secretary** | *Emergency Repairs* — `defense-buff` (INSTANT REACTION, the Hierophant-Shield seam) | `supply-line`: +2 gold after each won combat (soul-reformer twin) |

New cast kinds needed: **none**. New specialty ids: 7 (union members +
cases in `src/engine/commanders.ts`, mirrored on the existing 12). Voices
map to existing sets in `commanderVoices` (Sword Saint → Swordsman, Fox Sage
→ Pixie/Sorceress mix, Demon Patriarch → Lich/Ogre mix, Void Envoy →
Efreet, Seal Bearer → Swordsman, Shadow Guard → assassin-adjacent set, Fleet
Secretary → Sea Dogs) — zero new sound files. Tests join
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

The headline map-maker feature, shared by both packages. Engine seams are
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
of the Silent End → the Avatar → **Erebos**. Party: **Mira**
(receptionist/exposition), **the Slayer**, **Novice Priestess**, **Elf
Ranger** (§6.4.4 — their unique cards join the army as the story recruits
them; the cards ARE the system↔story crossover).

Chapters: 1 **Summoned at Dawn** (tutorial; guild registration; first
commissions; a goblin-cave bank with the Slayer's lesson — "goblins are no
joke"; traps introduced gently) · 2 **Rank and File** (commission economy;
the first scripted small Wave; Kaito intro; Priestess joins) · 3 **Into the
Dungeon** (floors 1–5, the Minotaur; Vesper surfaces; Elf Ranger joins) ·
4 **The Wave of Calamity** (full wave-defense set-piece; the Slayer's
farm-rescue side chain — his homage episode) · 5A/5B **Hero of the Guild** /
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
  is allowed ONLY for VN sprites. Palettes: Citadel (ritual gold, command
  sigils, spirit shimmer), Village (forest slate, masks, sign-seals), Harbor
  (white steel, rigging halos, sea glare). Bosses get double-width hero-shot
  art.
- Hard constraints in every prompt: no text/numbers baked into art; no
  trademarked designs or traced/model-recognizable characters (§ IP rule).

**Inventory & budget** (~630 images total across both packages, phased —
this is months of asset work, not a weekend; counts drive §20 estimates):
7 towns × (7 unit windows + 6 heroes×2 + 18 specialties + 7 buildings +
town/board/tile) ≈ 420 · commanders 7 · xianxia neutrals ~15 + 6 realm
fields + bank cards ~14 · isekai neutrals ~15 + 4 bank fields + ~10 bank
cards · bosses 5–6 (large) + lair field art · guild ≈ 27 (board bg, 7 rank
badges, ~16 commissions, 3 party members) · pills ~10 · traps/objects ~10 ·
gods 4 + 2 portraits · VN ≈ 90 (both casts: ~22 sprites ×3–4 expressions,
~26 backgrounds, ~18 CGs) · crests/UI ~16. Per-character sprite consistency:
generate one reference sheet first, then expression edits.

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
- **Morale Cards**: Mind-Calming vs negative-absorption ordering (§5.9); Qi
  Burst mirrors `combat_bonus` including the instant-window reaction seam;
  `MORALE_LOCK` (Dread) gates spends/uses but never draws/gains — pinned
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
| `ATTACK_BONUS_ADJACENT_ALLY` (param `adjacentTo`) | SHARED arm | Outer Sect Disciples; Novice Shinobi; Goblin Scouts/Lord |
| Die-face→token arm (params `face`, `token`) | SHARED arm | Tiger (par@−1), Serpent (cor@+1), Illusionist (weak@+1); Riders (par@+1), Torpedo Squads (cor@+1) |
| `PLACE_TOKEN_ACTION` token variants (paralysis / initiative-down) | SHARED variant (arm exists, `abilities.ts:64`) | Nine-Tailed Fox; Flagship Sovereign; + free-mode PvP-neutral-control offers |
| Charge as a unit tag (generalize `commander-charge`) | SHARED arm | True Inheritors, Dragon Horse; Sabers, Elite Shinobi, Dire Wolves |
| `requiresNotMoved` ability-gate param | SHARED param | Archers, Elf Ranger |
| `ON_REMOVAL_HEAL_ADJACENT` | NEW arm | Mountain Guardian |
| `ON_REMOVAL_OWNER_RESOURCE` | NEW arm | Cult Initiates |
| `SELF_DAMAGE_ATTACK_BOOST` | NEW arm | Blood Venerables (+ Demon Patriarch cast rider param) |
| `AFTER_ATTACK_SPLASH` | NEW arm | Beast Vessel Few |
| `MORALE_LOCK` (Dread) | NEW arm | Masked Specter, Rift Tyrant, Avatar of Erebos |
| **Devour** (tier-gated die-face side removal; `gorgon-death-stare` machinery variant) | NEW arm | Colossal Giant, Titan of the Wall, Rift Tyrant |
| `requiresLayersAtMost` gate | NEW gate | boss Enrage phases |
| `ADJACENT_ALLY_RANGED_GUARD` aura | NEW arm (Harbor only) | Escort Maidens |
| Medic token-removal pick param | NEW-lite | Medic Shinobi, Novice Priestess |
| `ELIXIR_SHOP` building | NEW building | Alchemy Pavilion |
| `BLOOD_ALTAR` building | NEW building | Blood Demon Cult |
| Morale-costed + tile-reveal `CityHallOption`s | NEW options | Blood Pool; Star Chart |
| `GRANT_UNIT_STACK` building (3rd `armyUnitStacksActive` activator) | NEW building | Transformation Pill Hall |
| Free-extend Citadel rider (`CONTINUE_NEUTRAL_COMBAT` waiver) | NEW rider | Realm-Breach Platform |
| `TOWN_GATE_TRAVEL` building | NEW building | Spatial Gate |
| `SUMMON_GACHA` building | NEW building | Summoning Circle |
| `PAY_DRAW_FILTER` building | NEW building (Harbor) | Wisdom Cube Laboratory |
| Guild block (board/claims/ranks/perks) | NEW system | §6.4 |
| Wave block (scheduler, wave table, pillage/overrun) | NEW system | §6.6 |
| Raid-Boss block (registry, lair field/object, persistence ledger, announce/escalate) | NEW system | §6.5 |
| Trap object + `spike_pit` battlefield-token kind | NEW system (token handler REUSE) | §6.7.1–2 |
| Dungeon block (site, floors, reward ladder) | NEW system | §6.7.3 |
| Patron/Miracle block + Erebos's Bargain | NEW system | §6.9 |
| Cultivation track + Tribulation | NEW system | §5.6 |
| Destiny substrate + titles | NEW system | §3.4, §5.7 |
| Quest Guard object + 3 new predicates | NEW system | §9, §3.5 |
| Story overlay system + campaign shell | NEW presentation systems | §11–12 |
| 7 commander specialty ids | NEW cases | §7 |

Roughly 14 content arms + 10 system blocks against ~40 straight reuses —
consistent with the repo's reuse-first rule.

## 20. Implementation phases & gates (each = one landable slice)

Default order interleaves the packages for early playable value (isekai
systems first — they are the new ask — with the xianxia towns folded in from
P6). The two tracks only depend on the P0 spine and their own rows, so the
user can reorder tracks without re-planning (§22 Q2).

| Phase | Ships | Gate (beyond green lint/typecheck/test) |
| --- | --- | --- |
| **P0** | Spine: `AnimeModOptions`, crest + package quick-selects, `.animeMode` scaffold + both term dictionaries, art scaffolding (style bible, prompt sheets, shared compositor), CLAUDE.md section stub | §3.8(a) master CONTROL; quick-select = exact module groups; crest e2e |
| **P1** | **Summoner's Citadel** complete (units/buildings/heroes incl. **Bin**/commander/tile/board/art) + Summoning Circle + its SHARED/NEW arms | content test; commander bijection updated; SP soak with a Citadel AI seat |
| **P2** | **Isekai neutrals** + 4 isekai banks + Devour/`MORALE_LOCK` + isekai map locations | bank rows vs `polish-bank-sizes` on/off; Dread↔morale-deck interplay tests; §3.8 gates begin |
| **P3** | **Adventurers' Guild** (board, ranks, commissions, Party Members) + the shared quest vocabulary (§3.5) | rank-perk tests each with rank-below CONTROL; claim race (parallel turns); AI claims in soak |
| **P4** | **Calamity Waves** | barrier-order test (income→event→waves→City Hall); pillage/overrun effect tests; AFK-retreat + elimination CONTROLs; PvP-neutral-control wave test; AI wave soak |
| **P5** | **Raid Bosses** (+ `boss_lair` object, announce/escalate) | persistence across attempts + snapshot; layer-payout ledger; escalation; PvP-neutral-control boss test |
| **P6** | **Azure Breeze Sect** + Sword Saint + Alchemy Pavilion (+ its 2 NEW arms) | content test; ELIXIR_SHOP fallback (pills off) test |
| **P7** | **Elixir Pills** + **Secret Realms** (6 banks, grade rows, realm-grade skin) + **xianxia neutrals** | pills morale-seam tests; bank grades vs polish on/off; Deity-Transformation ships-or-registers rule |
| **P8** | **Quest Guard** object + **Traps** + xianxia map locations + Guild sites (the designer wave) | designer round-trip/sanitize; every quest kind + reward effect-tested; trap view-masking per player view; AFK/elimination/parallel CONTROLs; AI plays a quest+trap map |
| **P9** | **Hidden Village** + **Yaoguai Valley** (+ Shadow Guard, Fox Sage, Exam Arena, Transformation Pill Hall) | content tests; `AFTER_ATTACK_SPLASH` + damage-cap CONTROLs; `armyUnitStacksActive` third-activator tests |
| **P10** | **Blood Demon Cult** + **Outer Court** (+ Demon Patriarch, Void Envoy, Blood Altar, Spatial Gate, over-limit specialties) | content tests; karma hooks land dormant (fire only when substrate on); Book-on over-limit tests (§10) |
| **P11** | The divinity layer: **Destiny substrate + titles**, **Cultivation + Tribulation**, **Gods & Blessings**, and the §8 synergy pass (commission entries, wave themes, western boss, shop pills, realm-gate union) | every source/spend with mode-off CONTROLs; both-titles-on-one-axis test; each §8 item with a one-side-off CONTROL; all-on soak |
| **P12** | **The Dungeon** (+ floor bosses) | floor progression/reward ladder; per-player floors across snapshot; AI delves in soak |
| **P13** | **Story system** + campaign hub + **Bin chapters 1–3** + the System/cheat shell | scene-asset integrity; ch-1 boot-to-victory smoke; cheat-pick effect tests; reconnect cue test |
| **P14** | **Bin chapters 4–7** (routes) + **Chen Fan chapters 1–3** | fixed-seed completion per Bin route |
| **P15** | **Chen Fan chapters 4–7** (routes) + skin/phone polish + full both-package soak | fixed-seed completion per Chen Fan route; nightly soak green |
| **P16** (stretch) | **Steel Harbor** + Abyss Kraken sea spawn + **The Two Continents** convergence arc + multiplayer Destiny-draft variant | content test; sea-boss spawn test; co-op scenario smoke |

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

1. **IP naming** — default: IP-neutral homage names shipped; the terms
   dictionaries make restoring the brainstorm's real anime names a private,
   data-only swap. Confirm (recommended: yes — the repo and CDN are public).
2. **Track order** — default: isekai systems first (P1–P5), xianxia towns
   from P6, campaigns last. Confirm, or reorder tracks (they only share the
   P0 spine).
3. **Town count** — 6 towns + Steel Harbor stretch is a LOT of art (§14).
   Authorize the volume, cut a town per package, or accept
   placeholder-then-replace pacing for P9–P10.
4. **Wave pillage harshness** — keep the mine/settlement overrun stake, or
   gold-only for V1? Default: ship both, tune at playtest.
5. **Boss behavior** — default stationary lairs, +1 layer per 4 rounds;
   roaming bosses and a simultaneous "raid party" mode stay out of scope.
6. **Bin's kit** — magic hero with draw/reroll/over-limit as specced?
   Default: yes (the cheat reads as knowledge).
7. **Dread scope** — `MORALE_LOCK` blocks morale spends/uses but never
   draws/gains. Confirm the reading of "cannot use Morale tokens".
8. **Gods depth** — V1 = one pick + one Miracle + the Bargain; a full
   divine-favor track is deferred. Confirm.
9. **Dungeon shape** — 10 floors, bosses at 5/10, per-player progress; a
   shared-progress "race" variant is stretch. Confirm.
10. **Waves in single-player** — default ON (PvE content), unlike the
    multiplayer-only Events deck. Confirm.
11. **Karma PvP trigger** ("bullying the weak", §5.7) — keep or cut after
    playtest? Default: ship behind the substrate, tune the 60% threshold.
12. **Deity Transformation pill** (second activation) — attempt in P7, stub
    consciously if the machinery slips. Confirm.
13. **Localization depth** — story text bilingual EN/VI by construction;
    full UI translation NOT in scope. Confirm.
14. **Music licensing** — CC0/licensed/user-supplied per register, or
    none-at-ship (acceptable limit). Default: none-at-ship.
15. **Account-synced campaign progress** — localStorage first; sync when
    the accounts backend grows a save slot. Default: later.
16. **Mod Event cards** for the Events deck — natural post-P15 follow-on,
    out of scope here.

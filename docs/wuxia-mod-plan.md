# Wuxia mod — "Ninefold Realms" / *Cửu Giới* (design + implementation plan)

> **STATUS: DESIGN ONLY — NOTHING IN THIS DOCUMENT IS IMPLEMENTED.** No engine
> code, data, art or tests for this mod exist yet. Every mechanic below is a
> *proposal*, engine-shaped against the current codebase (file references
> verified 2026-07-16 against `main`). Per CLAUDE.md, nothing here may be
> called "done" until it is engine-enforced AND covered by a test that fails
> when the logic is removed. Reference material: the user-provided
> brainstorm *"Wuxia / Xianxia Expansion — Ninefold Realms / Cửu Giới Tu
> Tiên"* (Word doc, design notes only); this plan locks its content into
> engine-shaped slices and adds the systems the brainstorm did not cover
> (Commanders, Quest Guards, Destiny/Karma, visual-novel story, campaign).

**Naming convention** (kept from the brainstorm): primary name is the standard
English wuxia/xianxia term, secondary is the Vietnamese rendering in italics —
e.g. **Foundation Establishment** (*Trúc cơ*). Character names use pinyin
primary + Sino-Vietnamese secondary — e.g. **Chen Fan** (*Trần Phàm*).

---

## 0. Rules for the executing agent (read first, non-negotiable)

1. **CLAUDE.md governs.** "Done" = engine-executed + a test that fails if the
   logic is removed (effect-level, not data checks — CLAUDE.md §1a). Anything
   shipped display-only goes in `DISPLAY_ONLY_ABILITIES` /
   `EVENTS_NOT_IMPLEMENTED`-style registries and is led with in the report.
2. **Default OFF, byte-identical when off.** Every module gates on
   `WuxiaModOptions` (or a `HouseRuleId`); legacy snapshots and tables that
   never touch the toggles behave identically. Every feature ships with
   mode-off CONTROL tests. All new `GameState`/`PlayerState` fields are
   optional (zero-migration, the Polish-rules precedent).
3. **Reuse before invent.** §4.6 inventories the genuinely-new engine surface;
   everything else maps to an existing effect id / interaction / step. Do not
   add a second way to do something the engine already does.
4. **Single-player AI is a gate, not an afterthought.** Every new
   pendingChoice/visit window must be scored by the computer policy before the
   phase ships (the repo has a documented history of AI freezes on unscored
   windows — `computer-runner.test.ts` "Events / exclusive visits").
5. **Ship order is §19.** One phase = one PR-sized slice landing green
   (`npm run lint && npm run typecheck && npm test`), art included or
   explicitly placeholdered via the registries.

---

## 1. Product contract

A **mod** in the WOG sense: a BINH-only bundle behind a crest in the lobby,
with individually-toggleable modules. Plus one thing WOG does not have: a
**Story mode** (solo campaign) entered from the main menu, not the lobby.

| Toggle | Default | One-line contract |
| --- | --- | --- |
| `wuxia.enabled` | OFF | Master switch (crest). Enabling under Legacy auto-switches to BINH (WOG precedent, `src/engine/index.ts:2749-2773`). Turns on the wuxia UI skin for that table. |
| `wuxia.towns` | OFF | Adds the 4 wuxia factions to the faction pick: **Azure Breeze Sect**, **Yaoguai Valley**, **Blood Demon Cult**, **Outer Court**. Each is a full BINH town: 7 unit lines, 7 buildings, 6 heroes (I/IV/VI specialties), starting tile, town board — and a **Commander** (§5). |
| `wuxia.secretRealms` | OFF | 6 wuxia **Secret Realm** Creature Banks join the Far/Near bank piles; full `polish-bank-sizes` grade integration (§8). Requires `creatureBanks` ON (greyed otherwise, like the Polish toggle, `screen.tsx:5510`). |
| `wuxia.neutrals` | OFF | ~15 wuxia neutral creature cards join the Neutral decks (mirror of `wog.newCreatures`, data mirror of `src/data/wog.ts`). |
| `wuxia.elixirPills` | OFF | **Elixir Pills** (*Đan dược*) consumable mini-deck — bought at the Alchemy Pavilion, won from Secret Realms/Quests (§9). Morale-cards data pattern. |
| `wuxia.cultivation` | OFF | Per-hero **Cultivation Realm track** (4 realms) + **Heavenly Tribulation** breakthrough gauntlet (§6). |
| `wuxia.destiny` | OFF | **Destiny & Karma** (*Thiên Mệnh & Nghiệp*): public karma axis, **Fate point** (*Khí Vận*) currency, **Mandate of Heaven** / **Demon Emperor** titles (§7). |
| `wuxia.questGuards` | n/a (designer content) | **Quest Guard** map object — a single-hex, place-anywhere designer object that gives a quest and rewards completion (§10). Like Monoliths, it is map-designer content, not a lobby toggle; any map may carry them. |
| Story mode | n/a | Solo campaign "**The Jianghu Chronicle**" (*Giang Hồ Chí*) with a visual-novel narrative layer (§12–13). Menu entry, single-player infrastructure. |

Module dependency edges (enforced in the lobby UI like `creatureBanks` →
`polish-bank-sizes`): `secretRealms` requires `creatureBanks`;
`elixirPills` is required for the Alchemy Pavilion's pill shop (the building
falls back to a City-Hall-style choice when pills are off, stated on the
definition); `destiny` is required for karma-gated quests and the campaign's
karma carryover; everything else is independent.

**Ranked/MMR policy:** wuxia tables record W/L like any table; `ranked` stays
whatever the room set. No Elo special-casing (mod flags are just game options).

---

## 2. Setting & naming (presentation layer)

Pitch (from the brainstorm): after a heavenly seal cracked, outer-realm demons
and strange qi poured into the mortal lands. Orthodox **sects**, **demonic
cults**, **yaoguai** bloodlines and **merchant guilds** race for elixir pills,
spirit stones and a seat on the path of immortal cultivation.

**Resource flavor is a pure re-skin** — label/tooltip text under `.wuxiaMode`
only (§15); resource ids, icons' semantics and every engine read are
untouched:

| Engine resource | Wuxia display name | Vietnamese |
| --- | --- | --- |
| Gold | Spirit Stones | *Linh thạch* |
| Building materials | Spirit Timber & Iron | *Linh mộc / linh thiết* |
| Valuables | Heaven-and-Earth Treasures | *Thiên tài địa bảo* |
| Spell cards | Arcane Arts | *Pháp thuật / thần thông* |
| Artifact cards | Dharma Treasures | *Pháp bảo* |
| Ability cards | Cultivation Manuals | *Công pháp / tâm pháp* |
| Morale | Dao Heart | *Đạo tâm* |
| War machines | Array Engines | *Trận khí* |

This re-skin ships as a dictionary (`src/data/wuxia/terms.ts`) consumed by the
skin layer, so it is trivially auditable and can never fork rules text: the
printed card faces keep their real names; the wuxia terms appear as flavor
subtitles.

---

## 3. Mod plumbing (Phase 0)

Mirror of the WOG option block, verified seams:

- **State**: add `WuxiaModOptions` + `DEFAULT_WUXIA_OPTIONS` beside
  `WogModOptions` (`src/engine/state.ts:114-126`); add
  `wuxia?: WuxiaModOptions` to `GameSetupOptions` (`state.ts:8794`
  neighbourhood). All fields booleans, default false.
- **Lobby**: a second crest row + "Mod options" sub-panel in
  `GameOptionsPanel`, cloning the WOG rows (`screen.tsx:5793-5846`, panel at
  `:6006`). Crest asset: `public/assets/ui/wuxia-crest.webp` (generated, §14).
  Enabling under Legacy flips to BINH; Legacy force-disables (WOG precedent,
  `engine/index.ts:1730-1732`, `2733`, `2749-2773`).
- **Merge/validation**: `SET_GAME_OPTIONS` handling beside the `next.wog`
  block (`engine/index.ts:2749`); sanitize unknown keys.
- **Gate helpers**: `src/engine/wuxia.ts` — `wuxiaEnabled(state)`,
  `wuxiaModuleEnabled(state, "towns" | ...)` — the single read every feature
  goes through (the `commandersModuleEnabled` pattern,
  `src/engine/commanders.ts:53`).
- **Skin**: `wuxiaEnabled` → `.wuxiaMode` class on the table root (§15).
- **Tests**: options round-trip, Legacy force-off, crest render, and the
  master CONTROL: with `wuxia` absent/off, a scripted game produces an
  identical event log to `main`'s.

---

## 4. Faction towns (`wuxia.towns`)

### 4.0 What one town costs (per the faction checklist, verified seams)

Per new faction: `FactionId` union (`src/data/factions/types.ts:3-15`) + a
`TileContent` value (`src/data/map/types.ts:6-16` + `ALL_TILE_CONTENT`,
`tiles.ts:32`) + `coreFactionDefinitions` entry (`core.ts:2687`) + 7 unit
lines (`units.ts`, ability tags in `src/data/units/abilities.ts:1144`) + 7
buildings (`coreBuildingDefinitions`, `core.ts:164`, effects from the
`TownBuildingEffect` union `types.ts:120-290`) + 6 heroes
(`coreHeroDefinitions`, `core.ts:1319`) + 18 specialty cards
(`src/data/cards/adventure.ts`, `specialty.<hero>.{1,4,6}`) + a starting tile
(`src/data/map/expansion-tiles.ts`, art `public/assets/board/tiles/`) + a town
board spec (`src/data/towns/boards.ts:257+`) + a Commander (§5) + a
`<faction>-content.test.ts` mirroring `factory-content.test.ts` (art-on-disk,
playable wiring, hero→specialty→unit mapping, each with a castle-twin
mutation control). Lobby pick and `adventure-setup.ts` derive automatically
from `coreFactionDefinitions` + `isPlayableFaction` — **but availability must
additionally gate on `wuxia.towns`**, which is NEW surface: extend the lobby
faction filter (`screen.tsx:7310`, `7378`) and the random/draft pool
(`screen.tsx:6992-6994`) to exclude wuxia factions when the module is off,
with a mode-off CONTROL test. Starting (Ⅰ) tiles are faction-fixed and never
pooled (`tiles.ts:39`), so no tile-pool leakage when off.

**Authenticity rule** ("correct factions"): each town keeps the brainstorm's
visual identity checklist — lean-into vs avoid lists in §14's prompt sheets —
so no town reads as a re-skinned European faction.

Stats below are **first-pass numbers for playtest**, tuned against the
existing curves (bronze ≈ A1-2/D1/H2-3, gold ≈ A4-6/D2-3/H6-8); locking them
is a per-phase playtest gate, not a design commitment. Ability columns cite
the engine mechanism: **REUSE** = existing effect id / effect kind wired to a
new tag name; **NEW** = new `UnitAbilityEffectDefinition` arm (all NEW arms
are inventoried in §4.6).

### 4.1 Azure Breeze Sect (*Thanh Phong Tông*) — orthodox sword cultivators

Jade green / cloud white. Disciplined mid-tempo army: formation, retaliation,
support. Avoid: European castle knights.

| Line (tier, type) | Few | Pack | Mechanism |
| --- | --- | --- | --- |
| **Outer Sect Disciples** (*Ngoại môn đệ tử*) — bronze, ground | — | **Sword Array**: +1 Attack while adjacent to a friendly unit | NEW `ATTACK_BONUS_ADJACENT_ALLY` |
| **Inner Sect Swordsmen** (*Nội môn kiếm sĩ*) — bronze, ground | Ignore combat penalties | same, higher Initiative statline | REUSE `ignore-combat-penalties` |
| **Alchemy Acolytes** (*Luyện đan đệ tử*) — silver, ranged | [activation] heal an adjacent unit 1 | [activation] heal an adjacent unit 2 | REUSE (Enchanter heal-pick activation pattern) |
| **Sect Protectors** (*Hộ tông hộ pháp*) — silver, ground | Defense token (roll the Defend die when attacked) | Unlimited retaliation | REUSE `SELF_DEFENSE_TOKEN` / `unlimited-retaliation` |
| **True Inheritors** (*Chân truyền đệ tử*) — gold, ground | Charge (+1 Attack on an attack after moving) | Charge + ignores retaliation | REUSE (generalize `commander-charge` to a unit tag) / `ignores-retaliation` |
| **Sword Immortal** (*Kiếm tiên*) — gold, flying | Sword-qi line: also attack the unit behind the target | same + ignore combat penalties | REUSE `SECOND_ATTACK_BEHIND_TARGET` (Mechanics' reach) |
| **Mountain Guardian** (*Thủ sơn linh thú*) — gold, ground | high HP, no ability | On removal, heal every adjacent friendly unit 1 | NEW `ON_REMOVAL_HEAL_ADJACENT` (sign-flipped twin of `ON_REMOVAL_DAMAGE_ADJACENT`, abilities.ts:1197) |

Buildings (archetype → existing effect unless noted): **Closed-Door Chamber**
(*Bế quan thất*, City Hall — `RESOURCE_ROUND_CHOICE` {4 gold | 1 XP}), 3
dwellings (**Outer Courtyard / Sword Hall / Immortal Peak** —
`UNLOCK_RECRUIT_TIER`), **Sect Grand Array** (*Hộ tông đại trận*, Citadel —
`UNLOCK_REINFORCE`), **Scripture Repository** (*Tàng kinh các* — `MAGE_GUILD`),
**Alchemy Pavilion** (*Luyện đan các* — NEW `ELIXIR_SHOP`: once per round pay
2 gold → draw 1 Elixir Pill; with `elixirPills` OFF the building is a
`RESOURCE_ROUND_CHOICE` {1 valuables | heal-1-visit}, stated on the
definition).

Heroes (pattern each specialty maps to; all I/IV/VI implemented-or-not-shipped,
never display-only):

| Hero | Type | Specialty hook (pattern) |
| --- | --- | --- |
| **Qingyun** (*Thanh Vân*), Sect Master | might | Sword Array: I +1 Attack to a unit adjacent to an ally on attack (mightSpecialtyOne pattern, `adventure.ts:27`); IV/VI scale targets/amount |
| **Shi Jian** (*Thạch Kiên*), Protector Elder | might | Retaliation/defense: Sect Protectors twins (unitHealthSpecialty pattern) |
| **Li Feng** (*Lý Phong*), Outer Court Instructor | might | Bronze swarm: effect doubles for Outer Sect Disciples (Erdamon pattern, exact) |
| **Dan Qing** (*Đan Thanh*), Alchemy True Person | magic | Heal/Power economy; VI = free pill draw per combat (pills module) |
| **Mo Xiang** (*Mặc Hương*), Scripture Elder | magic | Search economy (Knowledge/recall patterns) |
| **Wu Ming** (*Vô Danh*), Hidden Master | magic | Breakthrough: reinforce/stack-layer discount (map-economy specialty) |

### 4.2 Yaoguai Valley (*Yêu Thú Cốc*) — spirit beasts

Amber / moss. Big bodies, control, terrain. Avoid: Fortress lizards, Western
beasts.

| Line | Few | Pack | Mechanism |
| --- | --- | --- | --- |
| **Spirit Foxes** (*Linh hồ*) — bronze, ground, high Init | — | Dodge: roll the Defend die when attacked | REUSE `SELF_DEFENSE_TOKEN` |
| **Tiger Yaoguai** (*Hổ yêu*) — bronze, ground | — | Fear: a "−1" on its own attack die Paralyzes the target | REUSE (Fearsome combo effect → unit tag) |
| **Serpent Yaoguai** (*Xà yêu*) — silver, ranged | Venom: a "+1" attack die places a Corrosion token | same + ignores retaliation | REUSE (`halfling-precise-shot` twin) |
| **White Cranes** (*Bạch hạc*) — silver, flying | — | Wind dance: teleport-move | REUSE `teleport-move` (`MOVE_ANYWHERE`) |
| **Dragon Horse** (*Long mã*) — gold, ground | Charge | Charge + any positive Initiative increase gets +1 more | REUSE charge / `AMPLIFY_INITIATIVE_INCREASE` (Armadillo) |
| **Nine-Tailed Fox** (*Cửu vĩ hồ*) — gold, flying | [activation] Charm: place a Paralysis token on an adjacent enemy | Nine tails: full second attack against every adjacent enemy | REUSE-lite `PLACE_TOKEN_ACTION` (paralysis variant — Bloodlust/Weakness action with a new token param) / REUSE `SECOND_ATTACK_ALL_ADJACENT_TO_SELF` (enemies-only) |
| **Black Dragon** (*Huyền long*) — gold, flying | Line breath | Breath + reduce spell damage 1 | REUSE (Gold Dragon breath / `reduce-spell-damage-1`) |

Buildings: **Beast Elixir Furnace** (City Hall — `RESOURCE_ROUND_CHOICE`
{3 gold | 1 valuables}), 3 dwellings, **Beast Vault** (Citadel —
`UNLOCK_REINFORCE` + bronze reinforce discount, the Saplings-cousin archetype),
**Spirit Shrine** (`MAGE_GUILD`), **Transformation Pill Hall** (*Hóa yêu đan*
— NEW `GRANT_UNIT_STACK`: once per game, give one bronze army card a
permanent Stack layer; rides the army-stack combat machinery via a third
`armyUnitStacksActive` activator — see §6, the Polish precedent
`house-rules.ts:255`).

Heroes: **Valley Lord** (might; one beast line doubles — Erdamon),
**Beast Tamer** (might; reinforce discounts), **Dragon Rider** (might; charge
/ gold-tier buff), **Fox Enchantress** (magic; paralysis/charm casts),
**Ancient Yaoguai** (magic; gold-tier control), **Beast Alchemist** (magic;
casualty → valuables/pill conversion).

### 4.3 Blood Demon Cult (*Huyết Ma Giáo*) — heretical glass cannon

Crimson / black. Aggression, forced discard, self-harm for power. Avoid:
plain Inferno fire.

| Line | Few | Pack | Mechanism |
| --- | --- | --- | --- |
| **Cult Initiates** (*Tà giáo tân đồ*) — bronze, ground | — | Blood tithe: on removal, owner gains 1 gold | NEW `ON_REMOVAL_OWNER_RESOURCE` (rides the `ON_REMOVAL_*` plumbing) |
| **Blood Thralls** (*Huyết nô*) — bronze, ground, high A / low D | — | Life drain 1 | REUSE (Vampire life drain) |
| **Blood Illusionists** (*Huyết ảo thuật sư*) — silver, ranged | A "+1" attack die places a Weakness token | [activation] place a Weakness token (Sorceress action) | REUSE (die-token twin / `PLACE_TOKEN_ACTION`) |
| **Demon Children** (*Ma đồng*) — silver, flying | — | Nightmare whisper: on its attack the enemy discards 1 card | REUSE `bank-wraith-attack-discard` (exact) |
| **Blood Venerables** (*Huyết ma tôn giả*) — gold, ground | Blood sacrifice: [activation] take 1 damage → +2 Attack this activation | same + ignores retaliation | NEW `SELF_DAMAGE_ATTACK_BOOST` |
| **Demonized Form** (*Hóa ma thể*) — gold, ground | Ongoing-effect immunity | While carrying a Stack layer: +3 Attack | REUSE `titan-ignore-ongoing` / REUSE `bank-black-dragon-stacked-attack` + `requiresStacked` |
| **Demon Dragon Avatar** (*Ma long hóa thân*) — gold, flying | Line breath | Breath + ignores retaliation | REUSE |

Buildings: **Blood Pool** (*Huyết trì*, City Hall — `RESOURCE_ROUND_CHOICE`
{3 gold | 1 valuables **and** −1 morale} — the morale-costed option is a small
NEW `CityHallOption` field), 3 dwellings, **Demon Seal** (Citadel —
`UNLOCK_REINFORCE`), **Heretical Scripture Hall** (`MAGE_GUILD`), **Blood
Altar** (*Huyết đàn* — NEW `BLOOD_ALTAR` town action: once per round remove a
hand card or an army unit card → 2 gold, or a Search (1) of its matching deck;
karma −1 per use when `destiny` is on).

Heroes: **Cult Master** (might; sacrifice economy — gold riders on Blood Altar
/ tithe), **Blood Blade** (might; pure damage twins), **Thrall Commander**
(might; bronze swarm die-for-resource), **Blood Seal Sorcerer** (magic;
discard-fueled Power — Ciele own-discard patterns), **Illusion Demon** (magic;
Weakness/control), **Qi Deviation Elder** (magic; VI = once per combat cast
one spell over the limit, then your first spell next round gets −1 Power —
NEW rider composed on the existing over-limit machinery, Tarnum precedent).

### 4.4 Outer Court (*Ngoại Vực Ma Cung*) — outer-realm demons

Violet / star-black. Spell economy, mobility, alien elites. Avoid: Conflux
elemental colors.

| Line | Few | Pack | Mechanism |
| --- | --- | --- | --- |
| **Outer-Realm Thralls** (*Ngoại vực nô lệ*) — bronze, ground | — | +1 Power to your first spell each round | REUSE `magi-power-boost` (exact) |
| **Void Afterimages** (*Không gian mạt ảnh*) — bronze, flying | Teleport-move | Teleport-move + ignores retaliation | REUSE |
| **Demon Eyes** (*Ma nhãn*) — silver, ranged | Mark the strongest enemy at combat start; +1 Attack vs Marked | +2 vs Marked | REUSE `bounty-hunter-mark-1/2` (exact) |
| **Void Parasites** (*Trùng không yêu*) — silver, ground | Second attack vs ALL adjacent units (allies included) | enemies only | REUSE (Magic Elemental Few/Pack, exact split) |
| **Heavenly Demon Envoys** (*Thiên ma sứ*) — gold, flying | Magic Arrow immunity | + ongoing-effect immunity | REUSE (Water Elemental / `gargoyle-spell-ward`) |
| **Domain Lords** (*Vực chủ*) — gold, ground | high stats, no ability | While carrying a Stack layer: the enemy cannot cast Spells | REUSE `bank-faerie-dragon-spell-lock` + `requiresStacked` |
| **Outer-Heaven Dragon** (*Ngoại thiên long*) — gold, flying | Line breath | Breath + immune to Specialty damage | REUSE (`immune-specialty-damage`) |

Buildings: **Star Chart** (*Tinh đồ*, City Hall — `RESOURCE_ROUND_CHOICE`
{4 gold | reveal: flip one adjacent face-down tile marker for free — a NEW
lightweight option, see §4.6}), 3 dwellings, **Realm-Breach Platform**
(*Phá giới đài*, Citadel — `UNLOCK_REINFORCE` + NEW rider: once per neutral
combat, extending the round costs 0 MP — a waiver on the existing
`CONTINUE_NEUTRAL_COMBAT` spend), **Outer Dantian** (`MAGE_GUILD`), **Spatial
Gate** (*Cổng không gian* — NEW `TOWN_GATE_TRAVEL`: 1 MP, move your hero
between two owned towns that both have the building, once per turn).

Heroes: **Demon General** (might; mark & execute — +damage vs Marked twins),
**Outer Disciple** (might; unit Power boosts), **Domain Vassal** (might;
spell-lock support), **Realm Breaker** (magic; map mobility — Town-Portal-
family recalls), **Void Mage** (magic; combat teleport riders), **Ancient
Outer Shade** (magic; VI = a scoped Tarnum-lite: once per combat, search a
Spell deck (1) and the taken spell may be cast over the limit this combat —
REUSE of the `TARNUM_OVERLIMIT` pipeline with fixed parameters).

### 4.5 Nine Provinces Merchant Guild (*Thương Hội Cửu Châu*) — map module, NOT a town

Ships as shared map content (the brainstorm's recommendation): **Merchant
Guild Post** locations (Trading Post interaction + a paid neutral-card hire —
REUSE `TRADING_POST` + a `PAY_TO`+`RECRUIT_FREE` sequence), **Brotherhood
Gambling Den** (Crypt-cousin `ATTACK_DIE_TABLE` gamble), and 2–3 Guild event-
style quest lines delivered through Quest Guards (§10). Promotion to a full
town is explicitly out of scope for this plan.

### 4.6 New engine surface inventory (the honest ledger)

Everything above that is NOT a straight reuse, in one list (each lands with
its own effect-level test + CONTROL; ~13 arms total, small against ~25
reuses): `ATTACK_BONUS_ADJACENT_ALLY`, `ON_REMOVAL_HEAL_ADJACENT`,
`ON_REMOVAL_OWNER_RESOURCE`, `SELF_DAMAGE_ATTACK_BOOST`, paralysis variant of
`PLACE_TOKEN_ACTION`, weakness variant of the die-token effect, `ELIXIR_SHOP`
building, `BLOOD_ALTAR` building, morale-costed `CityHallOption`, tile-reveal
`CityHallOption`, `GRANT_UNIT_STACK` building, free-extend Citadel rider,
`TOWN_GATE_TRAVEL` building; plus §5's 4 commander specialties, §6's
track/tribulation, §7's destiny systems, §10's quest guard, §12's story
overlay. Unit voices: **zero new sound files** — map each wuxia unit to a
fitting existing H3 creature voice set in `src/data/unit-sounds.ts`
(commanderVoices precedent).

---

## 5. Commanders (must-have; module rides `wog.commanders`-style gating under `wuxia.towns`)

The Commander system is faction-keyed and the per-commander surface is small
(verified): `COMMANDER_SLUGS` + `commanderDefinitions`
(`src/data/commanders.ts:47`, `:489`), `COMMANDER_SLUG_BY_FACTION` (`:779`),
`COMMANDER_CAST_FX_KEY` + `COMMANDER_SPECIALTY_SOUND`
(`src/data/commander-fx.ts:17`, `:59`), `commanderVoices`
(`src/data/unit-sounds.ts:180-207`), card art
`public/assets/units-commander-<slug>.webp` (built by
`scripts/build-commander-cards.mjs`). Grades 0–3, the 15 combos, stat/combo
icons and the level-up point schedule are **global and shared — zero work**.
A faction absent from the map simply gets no commander (no crash), but the
integrity test `wog-commanders.test.ts:119` asserts an exact 12-faction
bijection — it must become "every playable faction has exactly one commander"
(16 with the four towns), keeping the bijection assertion.

When WOG Commanders is ON and a player picks a wuxia town, they get their
town's commander through the existing setup path
(`adventure-setup.ts:1916-1922`) — no wuxia-specific setup code.

| Town | Commander | Cast (kind = existing `CommanderCastEffect` arm) | Specialty (NEW `CommanderSpecialtyDefinition.id` + engine case) |
| --- | --- | --- | --- |
| Azure Breeze | **Sword Saint** (*Kiếm Thánh*) | *Sword Array Edict* — `attack-buff` on a friendly unit (Bloodlust semantics, Pow-laddered) | `sword-formation`: +1 Attack while adjacent to ≥1 friendly unit (cap +1; pure attack-time stat read) |
| Yaoguai Valley | **Fox Sage** (*Hồ Tiên*) | *Bewitching Gaze* — `initiative-shift` (Slow rider semantics) | `wild-blessing`: at the start of a combat vs neutrals, one friendly unit gains +1 Attack for the combat (auto-picks strongest; `applyElementalScourge` wiring twin) |
| Blood Demon Cult | **Demon Patriarch** (*Ma Tổ*) | *Blood Frenzy* — `attack-buff` with a 1-damage self-cost rider on the target (composes §4.6's `SELF_DAMAGE_ATTACK_BOOST`) | `blood-pact`: whenever the commander destroys an enemy side, its owner gains 1 gold (soul-reformer wiring twin) |
| Outer Court | **Void Envoy** (*Hư Không Sứ*) | *Time Dilation* — `initiative-shift` (Haste rider on own unit) | `void-veil`: ongoing-effect immunity from Magic grade 0 (per-slug override of `COMMANDER_MAGIC_ONGOING_IMMUNE_GRADE`) |

New cast kinds needed: **none** (all four map to existing arms; the Blood
Frenzy rider is a parameter, not a new kind — extend the arm's payload). New
specialty ids: 4 (union members + cases in `src/engine/commanders.ts` /
`applyCommanderCombatStart` + `resolveCommanderCast` seams, mirrored on the
existing 12). Voices: map to existing sets (e.g. Sword Saint → Swordsman,
Fox Sage → Pixie/Sorceress mix, Demon Patriarch → Lich/Ogre mix, Void Envoy →
Efreet) in `commanderVoices`. Tests join `wog-commanders.test.ts` /
`wog-commander-casts.test.ts` with per-claim CONTROLs (one grade below /
module-off / non-wuxia faction), matching the existing suites.

---

## 6. Cultivation & Breakthrough (`wuxia.cultivation`) — the Polish unit-stack tie-in

Two layers, both deliberately light (the brainstorm's design rule: simpler
than Commanders):

**Unit breakthrough (presentation + one activator, no new combat rules).**
The mod treats Polish **Unit Stacks** as the unit-level cultivation mechanic:
buying a Stack layer *is* the Few→Pack→Stacked "breakthrough" fantasy. Under
`.wuxiaMode` the stack coin badges render as realm glyphs (**Qi Refinement /
Foundation / Core** — *Luyện khí / Trúc cơ / Kim đan*) — pure skin over
`polish-unit-stacks-coin.webp`'s slot. The **Transformation Pill Hall**
(§4.2) becomes the third activator of `armyUnitStacksActive`
(`src/engine/house-rules.ts:255` — today: either Polish rule), following the
established "bank sizes activate army-stack combat machinery even with
unit-stacks purchasing off" precedent. Purchasing stays gated on
`polish-unit-stacks` exactly as today.

**Hero Cultivation Realm track** (per hero, 4 realms, new optional
`hero.cultivationRealm?: 0|1|2|3`):

| Realm | Reach it by | Permanent grant (engine read) |
| --- | --- | --- |
| Qi Refinement (*Luyện khí*) | start | — |
| Foundation (*Trúc cơ*) | hero level 3, or consume a Foundation Pill | +1 hand limit |
| Core Formation (*Kim đan*) | hero level 5 AND ≥1 Secret Realm won | 1 free attack-die reroll per combat (a standing `AttackRerollSource`) |
| Nascent Soul (*Nguyên anh*) | hero level 7 AND a won Heavenly Tribulation | +1 Power on your spell casts |

**Heavenly Tribulation** (*Độ kiếp*): offered (never forced) when the Nascent
threshold is met, on the player's own map turn: a seeded 3-Attack-dice
gauntlet resolved as a pendingChoice flow (no battlefield) — each die at "−1"
deals 1 damage to a chosen army unit (normal removal path); if the hero's army
survives all three, breakthrough + draw 1 Artifact. Decline/failure = retry
next turn. Engine-cheap (dice + damage through existing paths), thematically
the set-piece the brainstorm wanted. All grants are engine reads with
mode-off CONTROLs; realm state is public (shown on the hero board).

---

## 7. Destiny & Karma (`wuxia.destiny`) — *người xuyên không, chân mệnh thiên tử, fate, karma*

Three small systems that share one state block
(`player.destiny?: { karma: number; fate: number }`, both public;
`adventure.mandateHolderId?`/`demonEmperorId?`):

**Karma (*Nghiệp*)** — integer −6…+6, moved ONLY by enumerable engine events
(each a named trigger with a test): +1 win vs a demonic-aligned guard/bank /
complete a Quest Guard / chosen "righteous" options on wuxia content; −1 win
vs an orthodox-aligned guard / each Blood Altar use / chosen "demonic"
options / opening a PvP battle against a player whose army strength is below
60% of yours ("bullying the weak" — REUSE
`src/engine/computer/army-strength.ts` comparison). Alignment tags live on
the wuxia neutral/bank definitions (`alignment?: "orthodox" | "demonic"`);
core content carries none and never moves karma — the module cannot alter
non-wuxia balance.

**Fate points (*Khí Vận*)** — 0…5. Income: crossing each |karma| milestone
(2/4/6) the first time, +1; Quest Guard completions marked `fateReward`;
Tribulation wins; title income below. Spends (all REUSE of existing
plumbing): 1 = reroll one of your own dice in any open reroll window (joins
the morale-card `AttackRerollSource` list, map dice included); 2 = set your
attack die to its best face (`setDieFace` source); 2 = +1 Power on your
pending cast (power-boost seam); 3 = lethal save — one unit survives at 1
health (Alamar/Jeddite lethal-save pipeline); 1 = +1 MP on your map turn.
Offered exactly where morale cards already surface, so the UI cost is a
button row, not a new system.

**Mandate of Heaven (*Chân Mệnh Thiên Tử*) / Demon Emperor (*Ma Đế*)** — at
each Astrologers round, the seat with karma ≥ +4 (highest, incumbent wins
ties) holds the Mandate; karma ≤ −4 mirror-holds Demon Emperor. Either title:
+1 fate at each Astrologers round + a public chip by the seat name. Bounty:
winning a PvP battle against a title holder steals 2 fate and vacates the
title until the next Astrologers check. Both titles are pure state reads —
no hidden information, no extra combat rules.

**The Transmigrator (*người xuyên không*) is campaign-only** (§13): the
protagonist's "cheat" — the System quest log and Golden Finger picks — never
appears in multiplayer. A multiplayer "Destiny draft" (secret one-per-player
destiny cards) is listed in §21 as a stretch variant, NOT in scope.

---

## 8. Secret Realms, neutrals, locations — the Polish bank-grade tie-in

**Secret Realm banks** (`wuxia.secretRealms`): 6 new `CreatureBankDefinition`s
(`src/data/map/creature-banks.ts:303` shape: defenders from the wuxia neutral
pool, own bank-card stats, `buildReward` from the `LocationInteraction`
vocabulary) joining the Far/Near piles at setup when the module is on:

| Bank (tier) | Guards (flavor) | Reward sketch (vocab) |
| --- | --- | --- |
| **Ruined Sect Grounds** (*Phế tích tông môn*, far) | rogue disciples + an elder | Search Ability (X-scaled) + gold |
| **Yaoguai Den** (*Yêu động*, far) | beasts | `GAIN_UNIT` (Spirit Foxes; Pack when X≥2) + `EMPOWER_ABILITY` (Hive/Conservatory twin) |
| **Demon Cavern** (*Ma huyệt*, near) | cultists + thralls | Artifact draw + a morale gamble (`ATTACK_DIE_TABLE`) |
| **Ancient Alchemy Hall** (*Đan các cổ*, near) | pill golems | Elixir Pills ×(1+X/2) (valuables fallback when pills off) |
| **Heavenly Sword Tomb** (*Thiên kiếm mộ*, near) | sword spirits | `EMPOWER_ABILITY` + gold |
| **Outer-Realm Fracture** (*Ngoại vực rạn nứt*, near) | Outer Court elites | Expert-spell `SEARCH_SHARED_DECK` (5) |

**Polish grade integration** (the user's "creature bank grade" reference):
with `polish-bank-sizes` on, Secret Realms roll sizes Ⅰ–Ⅳ exactly like core
banks and the sizes display as **realm grades** — Mortal / Mystic / Earth /
Heaven (*Phàm / Huyền / Địa / Thiên*) — under `.wuxiaMode` (pure label skin).
Each new bank supplies its `buildPolishCreatureBankReward` row
(`creature-banks.ts:363`) and its guards obey `polishBankGuardLayerCap`;
`polishBankMaxSize` clamps (`adventure.ts:8480`) apply unchanged. Alignment
tags (§7): Demon Cavern/Fracture demonic, Sect Grounds/Sword Tomb orthodox.

**Wuxia neutral slice** (`wuxia.neutrals`, `src/data/wuxia/neutrals.ts`
mirroring `src/data/wog.ts`): ~15 cards, all abilities REUSE — bronze Rogue
Cultivator / Mountain Bandits / Spirit Jackals / Wandering Daoist; silver Qi
Refinement Expert / Hidden Fox / Wandering Gallant / Cult Neophytes; gold
Core-Formation Old Monster / Sword Fiend / Ancient Yaoguai / Illusion Spirit;
azure Ancient Deity Remnant / Failed Ascendant Shade / Outer-Realm Venerable.

**Map locations** (entries in `locationDefinitions`, `locations.ts:21`,
placed via wuxia map tiles and/or the designer): **Qi Refinement Platform**
(revisitable; pay 1 MP → +1 Attack token for your next combat — REUSE
`PAY_TO`+buff-token step), **Foundation Stone** (visitable; one free
reinforce — REUSE `HILL_FORT`-family), **Merchant Guild Post** and **Gambling
Den** (§4.5), **Outer-Realm Rift** (revisitable teleport + guarded — REUSE
`TOKEN_TELEPORT` + `guard`).

---

## 9. Elixir Pills (`wuxia.elixirPills`) — consumable mini-deck

Data pattern = Morale Cards (`src/data/cards/elixir-pills.ts` → spread into
`library.ts:19`; deck built like `makeMoraleDecks`, `morale-cards.ts:30`;
held on `player.elixirPills?: CardId[]`, public face-up, cap 3 with
discard-down). 10 cards: Healing Pill ×2 (combat: heal a unit 2), Qi Burst
×2 (combat: +1 Attack for the combat — morale `combat_bonus` twin),
Mind-Calming ×2 (remove one negative token OR cancel a just-drawn Negative
morale card — order vs morale absorption defined at the wiring: pill offer
first, absorb second), Foundation Pill ×2 (map: −2 gold on one
reinforce/Stack purchase; cultivation: counts as the Foundation trigger),
Cloud-Stepping ×1 (map: +1 MP), **Deity Transformation** ×1 (combat: after
this unit's activation it may activate again this round at −1 Attack — the
one genuinely heavy card; ships LAST within the phase and is cut to a
`not-implemented` no-op with the printed text if the second-activation
machinery slips — consciously, in the registry, per CLAUDE.md).
Acquisition: Alchemy Pavilion (§4.1), Secret Realms (§8), Quest Guard rewards
(§10). Timing: combat pills through the morale-cards SPEND/reaction seams
(`addMoraleActions` twin); map pills on your own turn.

---

## 10. Quest Guard (designer object) — single hex, place anywhere, quest → reward

The user's headline map-maker feature. The engine seams are verified and
mostly exist: standalone one-hex objects already mint a real `MapFieldState`
with an optional guard 1–7 that runs the full neutral-battle/quick-combat
flow, and "win → `beginFieldVisit` → the field's `LocationInteraction`" is
automatic (`adventure-setup.ts:1300-1360`, `adventure-reducer.ts:861/3542`,
`adventure.ts:3563`).

**Definition** (new `CustomMapObjectKind` `"quest_guard"`,
`state.ts:9134` — the union is explicitly open for future kinds — plus the
sanitize allow-list `CUSTOM_MAP_OBJECT_KINDS`, `map-preset.ts:162`):

```ts
{ kind: "quest_guard",
  placement,                      // standalone (any free land hex) OR tile token form
  quest: { kind: QuestKind, amount?, tier?, resource? },
  reward: QuestReward,            // constrained vocab → LocationInteraction
  guard?: 0..7,                   // 0 = pure quest gate (cannot be fought)
  fightCompletes?: boolean,       // default false: beating the guard clears the HEX, not the quest reward
  scope?: "once" | "per-player",  // default "once" (black cube)
  storySceneId?: string }         // §12 hook — a VN beat on completion
```

**Quest kinds V1** — all pure `GameState` predicates, no new bookkeeping
except one bank-wins counter: `pay-gold` / `pay-resources` (cost consumed on
completion), `deliver-unit-tier` (return one army card of the tier to supply),
`hero-level ≥ N`, `own-mines ≥ N`, `own-settlements ≥ N`, `defeat-banks ≥ N`
(new per-player counter incremented on bank wins), `hold-artifact-class`
(minor/major/relic in hand), `karma-at-least/at-most` (offered in the
designer only when it can resolve; documented as inert without
`wuxia.destiny`). **Rewards** map 1:1 onto existing interactions: resources,
XP, morale, movement, `SEARCH_SHARED_DECK`, artifact draw, `RECRUIT_FREE`,
`EMPOWER_ABILITY`, Elixir Pills, +fate (destiny on).

**Flow**: entering the hex opens a `QUEST_GUARD` pendingVisit — a prompt
showing the quest, live progress ("2/3 mines"), and the legal picks:
*Complete* (predicate met; pays costs, grants reward, cubes the field, fires
`storySceneId`) / *Fight the guard* (only when `guard ≥ 1`; a normal neutral
battle — on a win the hex opens; the reward also grants only if
`fightCompletes`) / *Leave*. A `guard: 0` quest gate is impassable until
completed (classic HoMM Quest Guard), which the designer uses to gate
passages — the validator warns when a 0-guard gate makes a start unreachable
(REUSE the reachability warning, `adventure-setup.ts:1249`).

**Wiring inventory** (per the verified seams): union arm + allow-list +
`validateCustomMapObjects` acceptance (`adventure-setup.ts:1139` — currently
only whirlpools are rejected standalone) + materialization beside the
gate/monolith branch (`:1300`, the `location` write at `:1347` and guard
difficulty at `:1358` already generalize) + a `quest_guard`
`LocationDefinition` + `QUEST_GUARD` interaction/step
(`map/types.ts:81`, `interactionToSteps` `adventure.ts:2147`,
`processPendingVisit` `adventure.ts:3774`) + `isMapObjectLocation`
(`adventure.ts:5805`) + designer palette/arm/config popover
(`map-designer.tsx` ~665-1428, quest editor mirrors the timed-events editor)
+ board art/icon (`screen.tsx:188` map + a generated shrine-gate token, §14)
+ per-player once-cubes for `scope:"per-player"` (settlement-cube precedent).
Cross-cutting: pendingVisit already blocks parallel-turns bystanders;
`eliminatePlayer` must clear an open quest prompt (barrier-recovery
precedent); the AFK driver default-answers it with *Leave*.

---

## 11. Polish Spell Book compatibility (*the "spell book function"*)

The mod adds no second spell system — it **composes** with
`polish-spell-book` (and with the default stash Book) via a compatibility
contract, tested with book-on/off CONTROLs in every wuxia phase:

- Wuxia towns' Mage-Guild-archetype buildings (Scripture Repository,
  Heretical Scripture Hall, Spirit Shrine, Outer Dantian) ARE `MAGE_GUILD`
  effects, so Search (3), buy-a-Cast-card, Rolling Spells and the level V/VII
  Cast grants all apply unchanged.
- Every wuxia effect that grants an owned Spell routes through `gainOwnedCard`
  (`src/engine/polish-spell-book.ts:26`) so Book routing holds; Elixir Pills
  are NOT spells and never enter the Book.
- The two over-limit specialties (Qi Deviation Elder VI, Ancient Outer Shade
  VI) must count casts exactly like the Tarnum flag does under the Book's
  Cast-card economy (a Cast card is still consumed; only the per-round limit
  is waived) — pinned with a Book-on test each.
- Skin: under `.wuxiaMode` the Book modal titles as **Cultivation Manuals**
  (*Công pháp*) — label-only.

---

## 12. Visual-novel story layer (new presentation system)

There is no narrative infrastructure today (verified — the closest hooks are
`EventDrawnOverlay`, `overlays.tsx:2571`, and preset `notes`/timed `note`
events). The mod adds one:

- **Data** (`src/data/story/scenes.ts`):
  `StoryScene { id, background, music?, lines: StoryLine[], choices? }`;
  `StoryLine { speaker, sprite?, expression?, side?, text: { en: string; vi: string } }`;
  `StoryChoice { text: {en,vi}, karmaDelta?, fateDelta?, flag?, nextSceneId? }`.
  Bilingual by construction (the doc's EN-primary/VI-secondary convention);
  overlay language toggle persisted as `localStorage["binh-story-lang"]`
  (helper-coach pattern). Liberation Serif already covers Vietnamese
  diacritics; any decorative heading font must include the Vietnamese subset
  or fall back.
- **Component** `StoryOverlay` (`src/components/table/story-overlay.tsx`):
  the EventDrawnOverlay pattern grown up — full-bleed background art,
  up to two character sprites (left/right, enter/exit slide + dim-inactive),
  nameplate, typewriter text (click/Space to advance, Skip, history log,
  EN/VI toggle), choice buttons. Driven by the standard cue pipeline
  (`page.tsx` cue state → keyed overlay → `onDone`), sounds via
  `playLibrarySound`.
- **Triggers**: (a) campaign hooks (§13) — scene ids on chapter events
  (`on_start`, `on_victory`, `on_defeat`, `on_round: N`,
  `on_quest_complete`); (b) **map-designer**: `CustomMapPreset.timedEvents`
  gains `{ kind: "story", sceneId }` (union at `state.ts:8998-9013`) and
  Quest Guards carry `storySceneId` (§10) — this is the "map maker can tell
  VN stories" requirement; designer-triggered scenes broadcast as a cue every
  client dismisses independently (multiplayer-safe, MapEventOverlay
  semantics, never replayed on reconnect — `map-event-overlay` precedent);
  (c) reconnect: an undismissed campaign scene rebuilds from live state
  (`reconnectRoundStartCues` pattern).
- **Scope guard**: scenes are presentation + (campaign-only) karma/fate/flag
  deltas through normal reducer actions — a scene can never mutate rules
  state directly.
- **Tests**: overlay render/advance/choice (jsdom), scene-registry integrity
  (every referenced sprite/background exists on disk), one e2e smoke.

---

## 13. Story mode — campaign "The Jianghu Chronicle" (*Giang Hồ Chí*)

**Infrastructure**: a `/story` route + menu entry beside Single player. Each
chapter = a private single-player room (`sp-` ids, `createSinglePlayerRoom`,
`src/lib/realtime.ts:819`) built from a **chapter definition**
(`src/data/story/campaign.ts`):
`{ id, title, mapPresetId, playerFaction, heroId, opponents: [{faction, level}],
  wuxiaOptions, storyHooks, objectives, goldenFingerChoices?, carryover? }` —
the map is a committed `CustomMapPreset` (designed in the map designer, saved
via the existing registry) so campaign maps ARE designer maps, quest guards
included. Progress (chapter unlocks, karma, flags, Golden Finger picks) in
`localStorage["binh-campaign"]`, account-synced later (§21).

**Protagonist**: **Chen Fan** (*Trần Phàm*) — *người xuyên không*, a modern
gamer transmigrated into a dying outer-sect disciple. His "cheat" is **The
System** (*Hệ Thống*): a diegetic quest-log panel only the player sees —
campaign-only UI listing the chapter's side quests (each a Quest-Guard-style
predicate + fate/pill/artifact reward) — plus one **Golden Finger** pick per
chapter (choose 1 of 3 permanent campaign boons, e.g. "Photographic Memory:
+1 hand limit" / "Game Sense: 1 free reroll per combat" / "Lucky Star: +1
fate income per chapter"). Mechanically the System is a thin campaign shell
over §7's fate economy and §10's quest predicates — no rules the multiplayer
engine doesn't already have.

**Arc** (7 chapters; karma from §7 carried across chapters picks the route):
1. **Awakening** (*Tỉnh lai*) — Azure Breeze tutorial; quest guards teach
   move/fight/build; first System quests. 2. **The Valley** — befriend or
   subdue Yaoguai Valley (choice → karma). 3. **Silk and Silver** — Merchant
   Guild intrigue; economy scenario (trade/quest-heavy, few fights).
4. **Blood Moon** — the Blood Demon Cult strikes; defense scenario.
5A/5B. **Orthodox Alliance** / **Demonic Ascension** — route split by karma
   (≥0 vs <0): lead the sects' alliance, or seize the Cult's throne.
6. **Heavenly Tribulation** — survive a timed-event gauntlet map;
   Tribulation set-piece (§6). 7. **The Realm Breach** (*Phá giới chiến*) —
   the Outer Court invasion; both routes converge; high-karma finale crowns
   Chen Fan **Chân Mệnh Thiên Tử** (Mandate holder) in story and mechanics.

Chapter difficulty tunes the existing smoothing knobs (guaranteed first wins,
opponent count/level) per chapter; AI opponents are the shipped computer
seats. Victory per chapter = existing modes (conquest/VP/round-limit) +
"complete N System quests" as a VP-objective-style extra.

---

## 14. Art & audio production (image-gen pipeline)

**Pipeline** (all existing, generator-agnostic): per-category **prompt-sheet
docs** with the repo's fixed field schema (Use case / Asset type / Input
images / Primary request / Scene-backdrop / Subject / Style-medium /
Composition-framing / Lighting-mood / Constraints / Avoid — the
`war-machine-card-art-prompts.md` convention) → generate with **Gemini 2.5
Flash Image** via `scripts/edit-card-image.mjs` or the browser workflow
(`scripts/browser-gemini-card-workflow.md`); GPT-image via a local Codex CLI
is a drop-in alternative since compositors take any PNG → raw art lands in
`scripts/wuxia-art/` (never `public/`) → **compositor**
`scripts/build-wuxia-cards.mjs` (clone of `build-commander-cards.mjs`)
composites into the real card frames, drawing titles/stats/glyphs from
`scripts/card-glyphs/` (no text/numbers baked into generated art — hard
constraint in every prompt) → `public/assets/*.webp` (portrait faces
743×1040, q82–92) → R2 sync is automatic on push. Every consumption position
goes through `assetUrl()` (`asset-url-coverage.test.ts` enforces).

**Style bible** (one doc, `docs/wuxia-art-style.md`, referenced by every
prompt): "hand-painted wuxia/xianxia board-game illustration; ink-wash
atmosphere over painterly HoMM readability; NO photorealism, NO anime cel
shade for card faces (VN sprites may be lightly stylized), no European plate
armor" + the per-town lean-into/avoid palettes from the brainstorm §8
(Azure Breeze: floating peaks, jade robes, sword light; Blood Cult: blood
seals, bone altars, black-red sutras; Yaoguai: fox masks, mountain mist;
Outer Court: star fractures, void gates; Guild: river ports, caravans,
abacus).

**Asset inventory & budget** (counts drive the phase estimates; ~300 images
total, all phased — the plan does NOT pretend this is a weekend of art):

| Category | Count (approx) | Notes |
| --- | --- | --- |
| Unit art windows | 4×7 = 28 | one window per line, reused across few/pack/neutral faces by the compositor |
| Hero portraits + board scans | 4×6×2 = 48 | `hero_boardart-` + `heroes-<faction>-` conventions |
| Specialty card art | 4×18 = 72 | one window per hero reused across I/IV/VI with level tint is acceptable (halves the count) |
| Buildings | 4×7 = 28 | plus 4 town images + 4 town boards + 4 starting-tile arts |
| Commanders | 4 | card face; cast icons reuse `spell-icons/` |
| Secret Realm banks | 6 fields + ~14 bank unit cards | |
| Neutrals | ~15 | |
| Pills / quest guard / crest / UI | ~16 | |
| VN sprites | ~10 chars × 3–4 expressions ≈ 35 | consistency: generate one reference sheet per character first, then expression edits (edit-mode keeps identity) |
| VN backgrounds + CGs | ~12 + ~8 | 16:9, webp |

**Audio**: unit/commander voices — **zero new files** (map to existing H3
voice sets, `unit-sounds.ts`); stings — reuse (`good-morale`, level-up
fanfares) for breakthrough/quest; music — 2–3 wuxia tracks (guqin/dizi/erhu)
added to `public/sounds/music/` + `manifest.json` + a `MusicScene` wiring
(`src/lib/music.ts` `SCENE_TRACK`), **sourced CC0/licensed or user-supplied —
AI music generation is explicitly out of this plan's pipeline**; if no track
clears licensing by ship, the wuxia tables keep the existing music (stated
limit, not a blocker).

---

## 15. UI/UX — the wuxia skin

One scoped skin class, the `.phoneMode` discipline exactly (`globals.css`,
85-occurrence precedent): `wuxiaEnabled(state)` stamps `.wuxiaMode` on the
table root; ALL wuxia rules live in one delimited block, every selector
prefixed `.wuxiaMode` — with the mod off, not one rule can match
(desktop/phone unchanged guarantee, pinned by CONTROL tests). Inside the
block: token overrides (`--gold` → jade-gold, `--felt`/`--wood` → ink-wash
paper + dark lacquer, `--surface` textures), brush-stroke panel borders,
cloud-mist backdrop on menu/lobby, the §2 term subtitles, realm-glyph badges
(§6), karma/fate/title chips (§7), and the Story overlay theme (§12). Phone
mode composes (`.phoneMode.wuxiaMode` both apply; new overlays re-anchor
above the tab bar like every fixed overlay). The System quest-log panel
(campaign) docks like `MoraleCardsDock`. New chips reuse existing dock/feed
patterns — no new layout systems.

---

## 16. Cross-cutting seams (each named here must be tested in its phase)

- **Parallel turns**: quest prompts, tribulations, pill windows and story
  choices are exclusive interactions — the bystander fingerprint guard covers
  them automatically, but each gets an ordered-mode + bystander CONTROL.
- **PvP Neutral Control**: wuxia guards' abilities all flow through the
  standard ability pipeline (REUSE list), so controlled guards work
  unchanged; `PLACE_TOKEN_ACTION` variants join the free-mode token offers.
- **Morale Cards**: Mind-Calming vs negative-morale absorption ordering
  defined in §9; Qi Burst mirrors `combat_bonus` including the
  instant-window reaction seam.
- **Events deck**: no wuxia Event cards in V1 (listed §21).
- **AFK/timeout/elimination**: every new pendingChoice joins
  `RESOLVING_ACTION_TYPES` with a default answer (quest → Leave, tribulation
  → decline, pills → skip, story → dismiss); `eliminatePlayer` clears owned
  quest/tribulation/story windows (barrier-recovery precedent).
- **Player views**: karma/fate/titles/pills/realms are public; System quests
  are campaign-local (solo — nothing to mask); no new hidden zones.
- **Reconnect**: story cue + quest prompt rebuild from live state
  (`reconnectRoundStartCues` pattern).
- **Legacy snapshots**: every field optional; absent = off.
- **MMR/match report**: unchanged (§1); campaign rooms are `sp-` (never
  reported — existing invariant).
- **e2e**: one Playwright spec per shipped surface (crest toggle, a quest
  guard completion, a story scene, phone-mode tab reachability).

## 17. Single-player / computer-seat compatibility (per-phase gate)

The AI must play every wuxia surface without stalling (the repo's #1
historical failure mode). Per phase: score new windows in the visit/choice
policies — quest guard (complete when predicate met & affordable → else fight
when `canBeatGuardedField`-style check passes → else Leave), pills (spend
heuristics: heal when lethal-saveable, Qi Burst on even fights), tribulation
(accept when army ≥3 healthy units), karma (tolerated, not optimized —
document that the AI does not pursue titles in V1), story cues (auto-dismiss
for computer seats), wuxia towns (build/recruit scoring falls out of the
generic development policy — verify with a soak). Gate: a fixed-seed
3-opponent, all-wuxia-options soak reaching round 6 with zero stalls joins
`single-player-soak.test.ts`.

## 18. Testing strategy (CLAUDE.md §1a applied)

Per phase, in addition to the per-feature effect tests named above: (1) the
town content test (factory pattern: art-on-disk, playable wiring,
hero→specialty→unit, castle-twin controls); (2)
`ability-text-enforcement.test.ts` auto-covers every new unit side — target
state: ZERO wuxia entries in `DISPLAY_ONLY_ABILITIES` (any conscious stub is
a named registry entry + first-line caveat in the report); (3) effect-level
behaviour with mode-off/one-grade-below/wrong-faction CONTROLs for every NEW
arm and every REUSE wiring (mutation-checked — assert the observable outcome:
"defense went 3→1", not "token placed"); (4) invariant tests where one
guards many (e.g. "every wuxia ability tag resolves implemented", "every
alignment tag is orthodox|demonic", "every scene asset exists"); (5) the §3
master byte-identical-when-off CONTROL re-run each phase.

## 19. Implementation phases & gates (each = one landable slice)

| Phase | Ships | Gate (beyond green lint/typecheck/test) |
| --- | --- | --- |
| **P0** | Mod plumbing: `WuxiaModOptions`, crest + options panel, `.wuxiaMode` skin scaffold + term dictionary, art scaffolding (style bible, prompt sheets, `build-wuxia-cards.mjs`), CLAUDE.md section stub | byte-identical-when-off CONTROL; crest e2e |
| **P1** | **Azure Breeze Sect** complete (units/buildings/heroes/commander/art/starting tile/town board) + the 2 NEW effect arms it needs + faction-gating in lobby | content test; commander bijection test updated; SP soak with an Azure AI seat |
| **P2** | **Elixir Pills** + Alchemy Pavilion + **Secret Realms** (6 banks, Polish-grade rows, realm-grade skin) + **wuxia neutrals** | bank grade tests vs `polish-bank-sizes` on/off; pills morale-seam tests |
| **P3** | **Quest Guard** object (engine + designer + art) + wuxia map locations + Guild sites | designer round-trip (save/load/sanitize); every quest kind + reward effect-tested; AFK/elimination/parallel CONTROLs; AI plays a quest map |
| **P4** | **Yaoguai Valley** (+ Fox Sage, Transformation Pill Hall stack activator) | content test; `armyUnitStacksActive` third-activator tests |
| **P5** | **Blood Demon Cult** (+ Demon Patriarch, Blood Altar) | content test; karma hooks land dormant (fire only when `destiny` on) |
| **P6** | **Outer Court** (+ Void Envoy, Spatial Gate, over-limit specialties) | content test; Book-on over-limit tests (§11) |
| **P7** | **Cultivation track + Tribulation** and **Destiny & Karma** (fate spends via morale seams, titles) | every source/spend with mode-off CONTROLs; parallel/PvP-neutral seams; AI soak all-on |
| **P8** | **VN story system** + campaign shell + **chapters 1–3** (Chen Fan, System, Golden Fingers) | scene-asset integrity; chapter-1 boot-to-victory smoke; reconnect cue test |
| **P9** | **Chapters 4–7** + route split + music/skin polish + phone-mode audit + full-mod soak | fixed-seed campaign completion test per route; nightly soak green |

Art rule per phase: a phase does not ship with placeholder art unless the
placeholder is declared (the Factory "fake portraits" lesson — declared,
then replaced).

## 20. Definition of done

The mod is done when: all `WuxiaModOptions` modules default OFF and the
master CONTROL proves off-tables unchanged; all four towns pass their content
tests with zero display-only unit sides (or consciously-registered stubs led
in the report); the four commanders pass the extended bijection + behaviour
suites; quest guards round-trip the designer and every quest kind/reward is
effect-tested; pills/realms/destiny/cultivation each carry mode-off CONTROLs;
the SP soak (all options on) and both campaign-route completion tests are
green; every image referenced by data exists on disk (integrity tests) and
raw AI art stays out of `public/`; CLAUDE.md gains a "Wuxia mod" section
documenting what runs vs deliberate limits, caveats first.

## 21. Open questions (defaults chosen so work can proceed)

1. **Town ship order** — default: Azure Breeze first (P1) per the brainstorm;
   confirm the user doesn't want Yaoguai first.
2. **Do wuxia towns require `wog.commanders` ON for commanders**, or should
   the wuxia crest imply commanders for wuxia factions? Default: reuse the
   WOG toggle unchanged (least surface).
3. **Deity Transformation pill** (second activation) — ship or registry-stub
   in P2? Default: attempt, stub consciously if the machinery slips.
4. **Multiplayer "Destiny draft"** (secret destiny cards) — stretch, not
   scoped. Revisit after P7 playtests.
5. **Karma PvP trigger** ("bullying the weak") — keep or cut after playtest?
   Default: ship behind `destiny`, tune the 60% threshold.
6. **VI localization depth** — story text is bilingual by construction; full
   UI translation is NOT in scope. Confirm acceptable.
7. **Music licensing** — source CC0 guqin/erhu tracks vs user-supplied vs
   none-at-ship. Default: none-at-ship is acceptable (§14 limit).
8. **Account-synced campaign progress** — localStorage first; sync when the
   accounts backend grows a save slot. Default: later.
9. **Wuxia Event cards** for the Events deck — natural P10 follow-on, out of
   scope here.
10. **Art volume** — ~300 images is real work even AI-assisted; confirm the
    per-phase pacing or authorize placeholder-then-replace for P4–P6 towns.

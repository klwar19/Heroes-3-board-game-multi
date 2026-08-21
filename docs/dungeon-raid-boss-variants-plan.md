# Dungeon & Raid Boss variant expansion — design spec

Status: DESIGN ONLY. Nothing below is implemented. Written against the repo at
`E:\heroes 3 BG multi` (read-only). Implementation is split into 3 agent-sized
phases (§G). Every item states its exact seam, its data shape and the
mutation-checked test that must fail if the logic is removed (CLAUDE.md §1/§1a).

## 0. Grounding — the seams this design rides

| Thing | Where |
|---|---|
| Boss definition shape `RaidBossDefinition` | `src/data/anime/bosses.ts:22` |
| Boss catalogs `RAID_BOSSES` / `DUNGEON_FLOOR_BOSSES` | `src/data/anime/bosses.ts:49` / `:179` |
| Designer ability whitelist `RAID_BOSS_ABILITY_CHOICES` | `src/data/anime/bosses.ts:261` |
| Boss mint `makeRaidBossCombatUnit` | `src/engine/raid-bosses.ts:137` |
| Boss pool per theme `scheduledBossPool` | `src/engine/raid-bosses.ts:119` |
| Dungeon warden per floor `dungeonBossId` + `DUNGEON_BOSS_FLOORS`/`DOOM_…` | `src/engine/dungeon.ts:21`–`:42` |
| Dungeon reward ladder `dungeonFloorRewardSteps` | `src/engine/dungeon.ts:77` |
| Dungeon rooms `dungeonRoomPool` / `dungeonDoorsForFloor` | `src/engine/dungeon.ts:125` / `:218` |
| Reveal: `revealRaidBossArmy` / `revealDungeonFloorArmy` | `src/engine/adventure-reducer.ts:8540` / `:8565` |
| Victory: `resolveRaidBossVictory` / `resolveDungeonFloorVictory` | `src/engine/adventure-reducer.ts:12369` / `:12407` |
| Menus: `handleDungeonGateVisit` / `handleRiftLairVisit` | `src/engine/adventure.ts:17614` / `:17703` |
| Field-effect machinery (scripts) | `src/engine/combat-scripts.ts`, `src/data/map/combat-scripts.ts` |
| Round-start chokepoint (`applyCombatScriptRoundStart`, `applyHeroGradeRoundStartDamage`) | `src/engine/reducer.ts:23742`–`23745` |
| Combat-start chokepoint (`applyCombatScriptCombatStart`) | `finalizeCombatStart`, `src/engine/adventure-reducer.ts` |
| PvE combat detector `isPveEncounterCombat` | `src/engine/combat-board-art.ts:11` |
| Spell-damage resolution model (immunity → ward → cap) | `applyActivationDamageSpell`, `src/engine/reducer.ts:10592` |
| `reducedSpellDamage` (module-private, reducer.ts) | `src/engine/reducer.ts:2874` |
| Random hand discard `discardRandomCardFromHand` / `discardRandomEnemyCards` | `src/engine/reducer.ts:8469` / `:20273` |
| Active-effect factory `makeActiveEffect` | `src/engine/active-effects.ts:62` |
| Layer gate `requiresLayersAtMost` (hides ability while layers remain) | `src/engine/unit-abilities.ts:67` |
| Wave mini-boss pools (READ `DUNGEON_FLOOR_BOSSES`) | `src/engine/monster-waves.ts:57` |

**Cross-module coupling to respect:** `WAVE_MINIBOSS_POOLS` draws from the dungeon
warden catalog. Every NEW warden added in §C must keep `layers ≤ 3` and an escort
of `minionCount ≤ 3` or it silently inflates Calamity Wave difficulty from wave 4.
New wardens are only added to a wave pool **deliberately and explicitly** (§C4).

**Byte-identical-when-OFF invariant:** every new arm below is reached only from
(a) an ability id that only new boss/warden data carries, or (b) a resolver gated on
`isPveEncounterCombat(state.combat)` — which is false unless `raidBossId`,
`dungeonFloor` or `waveAssault` is on the combat context, i.e. unless a PvE module
is ON. No shipped unit/card/field gains a new tag.

---

## A. Spellcaster / card-user monsters

> **SUPERSEDED 2026-08-21 — this whole section (A1–A4) is DEAD.** The USER
> rejected the round-start monster-caster mechanic outright ("not all bosses need
> to cast a spell at the start of a round — immersion breaking — REMOVE it").
> `BOSS_SPELL_ROTATION`, `src/data/anime/monster-spells.ts`,
> `src/engine/monster-spells.ts`, the four `boss-spell-*` abilities, the
> `CombatState.monsterSpells` ledger, `UNIT_ABILITY_TRIGGERED.monsterSpellId`
> and all of the §F5 caster presentation are DELETED (protocol v50). The five
> bosses/wardens that carried a rotation now carry ordinary implemented combat
> arms, one UNIQUE kit each, balanced by the simulation harness in
> `src/engine/pve-boss-balance.test.ts`. Everything below §A is historical
> record only — do not reintroduce it. §A4's "card-user flavor beyond
> `siphon_thought`" arm list, however, is still live guidance: those arms are
> what the replacements were drawn from.

### A1. New ability effect `BOSS_SPELL_ROTATION` (REMOVED)

Data shape — add to the `UnitAbilityEffectDefinition` union
(`src/data/units/abilities.ts:3`):

```ts
| {
    /**
     * PvE monster caster: at the START of every combat round this unit
     * automatically resolves ONE spell from `spells`, indexed by the combat
     * round (round 1 → spells[0], round 2 → spells[1], wrapping). Fully
     * automatic and target-deterministic — NO window, NO choice, NO RNG.
     */
    type: "BOSS_SPELL_ROTATION";
    spells: MonsterSpellId[];
  }
```

`MonsterSpellId` and the spell table live in a NEW leaf
`src/data/anime/monster-spells.ts` (no engine imports, no cycles):

```ts
export type MonsterSpellId =
  | "shadow_bolt" | "chill_of_the_deep" | "withering_curse"
  | "mend_flesh" | "siphon_thought" | "ward_of_ash";

export type MonsterSpellDefinition = {
  id: MonsterSpellId;
  name: string;               // feed-line name
  /** Exactly what runs — copied verbatim into every carrying ability's text. */
  text: string;
  kind:
    | { k: "spell-damage"; amount: number; pick: "toughest" | "nearest" }
    | { k: "enemy-debuff"; stat: "attack" | "initiative"; amount: number; scope: "all" | "fastest" }
    | { k: "self-heal"; amount: number }
    | { k: "hand-drain"; count: number }
    | { k: "ally-buff"; stat: "defense"; amount: number };
};
```

Concrete spells (the whole shipped table — 6, deliberately small):

| id | kind | exact effect |
|---|---|---|
| `shadow_bolt` | spell-damage 2, pick `toughest` | 2 SPELL damage to the living enemy unit with the highest remaining health (`maxHealth − damage`; ties → lowest `position`). Resolved through the SAME gate order as `applyActivationDamageSpell`: `isUnitDamageImmune` → `unitImmuneToSpellSchoolsByEffect` → `unitImmuneToSpellSchools` (schools `["any"]`, unless `spellAbilitiesSuppressed`) → `reducedSpellDamage` → `damageKind: "spell"` → `noteUnitDamagedForTokens` → `markUnitRemovedIfNeeded`. |
| `chill_of_the_deep` | enemy-debuff initiative −2, scope `fastest` | `−2 INITIATIVE_BONUS` ActiveEffect (`polarity: "negative"`, `duration: { type: "current-combat-round" }`) on the living enemy unit with the highest `effectiveInitiative` (ties → lowest `position`). |
| `withering_curse` | enemy-debuff attack −1, scope `all` | `−1 ATTACK_BONUS` ActiveEffect, `current-combat-round`, on EVERY living enemy unit. |
| `mend_flesh` | self-heal 2 | `unit.damage = Math.max(0, unit.damage − 2)`. **Never restores a shed layer** (`armyStacks` untouched) and no-ops at `damage === 0`. |
| `siphon_thought` | hand-drain 1 | The enemy CONTROLLER discards 1 random card via `discardRandomCardFromHand`. No-op on an empty hand. |
| `ward_of_ash` | ally-buff defense +1 | `+1 DEFENSE_BONUS` ActiveEffect, `current-combat-round`, on every living unit on the CASTER's side (the neutral side). |

### A2. Resolution seam

New leaf `src/engine/monster-spells.ts` — **pure planning only** (imports
`state` types + the data table; imports nothing from reducer/adventure):

```ts
/** The spell this unit casts at `round`, or null. Deterministic in (unit, round). */
export function monsterSpellForRound(unit: CombatUnitState, round: number): MonsterSpellDefinition | null;
/** The deterministic target for a spell (pure over the combat's living units). */
export function monsterSpellTarget(combat: CombatState, unit: CombatUnitState, spell: MonsterSpellDefinition): CombatUnitState | null;
/** Every living unit that must cast this round, in ascending `position` order. */
export function monsterSpellCasters(combat: CombatState): CombatUnitState[];
```

Resolution lives in `src/engine/reducer.ts` beside `applyActivationDamageSpell`
(because `reducedSpellDamage` is module-private there — do NOT export it):

```ts
export function applyMonsterSpellRoundStart(state: GameState): void
```

Wiring — exactly two call sites, mirroring the combat-script pair:
1. `advanceCombatRound`, `reducer.ts:23745`, immediately AFTER
   `applyHeroGradeRoundStartDamage(state)` and before the
   `if (state.combat?.outcome) return;` guard.
2. `finalizeCombatStart` (adventure-reducer.ts), immediately after
   `applyCombatScriptCombatStart(state)` — this is round 1, which never passes
   through `advanceCombatRound`.

Idempotence: `combat.monsterSpells ??= { fired: [] }` with key
`` `${unit.id}#${round}` ``; a key already present is skipped. `finalizeCombatStart`
is re-entrant (Wayfarer / tactics), so this guard is load-bearing.

Ordering & safety rules (all mandatory):
- Casters resolve in ascending `position`; a caster killed by an earlier caster
  (impossible today, but a curse could combo later) is re-checked alive before it casts.
- After the whole pass, call `finishCombatIfNeeded(state)` — a bolt that kills the
  last enemy unit must end the fight before any activation opens (the
  `applyScriptDamagePulse` precedent, `combat-scripts.ts:169`).
- **No window, no `pendingChoice`, no reaction window is ever opened.** Damage is
  dealt directly (the Faerie-Bolt / Elemental-Scourge precedent), NOT through
  `performSpellCast` — so pre-hit heal reactions do NOT fire, matching how
  `applyHeroGradeRoundStartDamage` and `damage-pulse` already behave. This is the
  anti-stall guarantee and must be stated in the ability text.
- The rotation index is `(round − 1) % spells.length` — no RNG at all, so replays,
  reconnects and hosted clients agree without a seed.

Feed events (one per resolved spell, ALWAYS, even a no-op):
`UNIT_ABILITY_TRIGGERED` with `unitId`, `abilityId`, optional `targetUnitId`, and
message `"<Boss> casts <Spell Name> — <what happened>."` Reuse the existing event
type; no new event kind is needed.

Interaction contract (must be pinned by test):
- `shadow_bolt` IS reduced by `REDUCE_SPELL_DAMAGE` / auras, capped by
  `CAP_DAMAGE_PER_ATTACK.includeSpells`, and fully blocked by all-school immunity
  (`immune-all-spells`) and by `ON_ACTIVATION_INVULNERABILITY`. A SINGLE-school
  immunity does NOT block it (school-less `["any"]` reading, reducer.ts:10599).
- `withering_curse` / `chill_of_the_deep` are ongoing effects, so
  `IGNORE_ONGOING_EFFECTS` (Titans) and `IGNORE_ONGOING_SPELL_EFFECTS` (Gargoyles)
  already turn them aside through the existing readers — no new gate.
- `siphon_thought` targets the combat's non-neutral controller only; in a
  PvP-Neutral-Control fight it hits the FIGHTER, never the controller.

### A3. Carrying abilities (data)

Four new `unitAbilities` entries — the ability id is what a boss's `abilities`
array names, so the rotation is per-ability (never per-boss free text):

| ability id | rotation | text (verbatim on the card) |
|---|---|---|
| `boss-spell-necrotic` | `[shadow_bolt, siphon_thought, mend_flesh]` | "At the start of every combat round this unit automatically casts, in order: Shadow Bolt (2 Spell damage to your toughest living unit), Siphon Thought (you discard 1 random card), Mend Flesh (it heals 2 damage — never a lost health bar). Then it repeats." |
| `boss-spell-frost` | `[chill_of_the_deep, withering_curse, ward_of_ash]` | "…Chill of the Deep (−2 Initiative on your fastest unit this round), Withering Curse (−1 Attack on all your units this round), Ward of Ash (+1 Defense on every Neutral unit this round)…" |
| `boss-spell-infernal` | `[shadow_bolt, withering_curse]` | "…Shadow Bolt (2 Spell damage to your toughest living unit), Withering Curse (−1 Attack on all your units this round)…" |
| `boss-spell-mindflay` | `[siphon_thought, chill_of_the_deep]` | "…Siphon Thought (you discard 1 random card), Chill of the Deep (−2 Initiative on your fastest unit this round)…" |

All four go into `RAID_BOSS_ABILITY_CHOICES` (`bosses.ts:261`) so designer custom
bosses can pick them — they are self-contained combat abilities that read no deck
and no faction cubes, matching that list's stated contract. `customBossToDefinition`
already builds `abilityText` from `unitAbilities[id].text`, so a designer boss
prints exactly what runs for free.

### A4. Card-user flavor beyond `siphon_thought` (data-only, zero engine work)

These arms already exist and are drop-in for new bosses — no new code:
- `wraith-enemy-discard` (`ON_ACTIVATION_DISCARD_ENEMY_CARD`) — 1 random hand card on activation.
- `bank-wraith-attack-discard` (`ON_ATTACK_DISCARD_ENEMY_CARD`) — on its attack.
- `ghost-dragon-morale-drain` (`ON_ACTIVATION_DISCARD_ENEMY_MORALE`) — burns the positive morale token.
- `bank-faerie-dragon-spell-lock` (`SPELL_CAST_LOCK`), `familiar-spell-tax` (`SPELL_CAST_HAND_TAX`),
  `pegasi-power-tax` (`SPELL_CAST_POWER_TAX`), `bank-familiar-power-drain` (`REDUCE_ENEMY_SPELL_POWER`)
  — anti-caster taxes. All automatic.
- `magi-power-drain` (`ENEMY_DISCARDS_POWER_OR_RANDOM`) — **check before use**: it prefers a
  player pick; verify it has an auto path for a NEUTRAL source before shipping it on a boss.

---

## B. New raid bosses (6)

All follow the shipped statline convention (per-LAYER stats; `layers` = health bars).
Balance anchors: existing classic pool runs `layers 3 → 7`, `attack 4 → 7`,
`health 3 → 4`, `minionCount 2–3`, `minionLevel 2–4`. Nothing below exceeds
`avatar_of_erebos` (attack 7 / layers 7). A caster boss pays for its rotation with
**−1 Attack or −1 layer** versus a same-role non-caster.

Added to `RAID_BOSSES` (`bosses.ts:49`) and to `CLASSIC_RAID_BOSS_IDS` /
`DOOM_RAID_BOSS_IDS` in `raid-bosses.ts:46`/`:54`.

### B1 `lich_archon` — classic
"Tongue of the Cold Grave". attack 4, defense 2, health 3, initiative 6, ground,
**layers 5**. abilities `["boss-spell-necrotic", "zombie-resilience"]`.
minionCount 3, minionLevel 3. escort `undead` (see §D).
Role: the flagship caster. Low Attack (4) because it deals ~2 spell damage/round
that ignores Defense entirely.

### B2 `hydra_matriarch` — classic
"Nine Jaws of the Fen". attack 5, defense 2, health 4, initiative 3, ground,
**layers 4**. abilities `["hydra-multi-attack", "boss-enrage"]`.
minionCount 2, minionLevel 3.
Role: melee-swarm punisher — hits an extra adjacent unit; slow (init 3) so a
ranged army can kite it. Pure REUSE, no new arm.

### B3 `basilisk_queen` — classic
"Gaze of the Stone Garden". attack 5, defense 3, health 3, initiative 5, ground,
**layers 4**. abilities `["azure-dragon-paralysis", "manticore-ignore-defense"]`.
minionCount 3, minionLevel 3.
Role: control. `IGNORE_TARGET_CARD_DEFENSE` makes high-Defense stacks no answer;
paralysis is roll-gated so it is swingy, not oppressive. Pure REUSE.

### B4 `wailing_banshee` — classic
"Chorus of the Unmourned". attack 4, defense 1, health 3, initiative 9, **flying**,
**layers 4**. abilities `["boss-spell-mindflay", "ghost-dragon-morale-drain"]`.
minionCount 2, minionLevel 3.
Role: resource attrition (hand + morale + initiative), fragile (def 1) — the
"kill it fast" boss. Combines the new caster arm with an existing card-user arm.

### B5 `archvile_ascendant` — doom
"Choir of the Furnace". attack 5, defense 2, health 4, initiative 7, ground,
**layers 5**. abilities `["boss-spell-infernal", "wog-hell-steed-fire-wall"]`.
minionCount 3, minionLevel 4.
Role: the Doom caster — zoning (fire wall) plus round-start bolt/curse.

### B6 `mother_demon` — doom
"She Who Spawns". attack 6, defense 2, health 3, initiative 5, ground,
**layers 6**. abilities `["doom-pain-elemental-summon-lost-soul", "boss-devour"]`.
minionCount 2, minionLevel 3.
Role: attrition — its attacks summon; escort starts SMALL (2) precisely because it
grows. Pure REUSE. **Balance guard:** the summon arm must be verified to cap the
summoned population; if it does not, cut this boss to `layers 5` and file the cap
as a separate fix.

**Art slugs needed** (`/assets/bosses/<id>.webp`, same 743×1040 card format as the
shipped boss faces):
- `lich_archon` — "A crowned skeletal archmage in tattered indigo funeral silk, green witchfire in its eye sockets, one hand raised over a floating grimoire, ruined crypt behind."
- `hydra_matriarch` — "A vast swamp hydra with nine scarred serpentine heads rising from black fen water, moonlit mist, moss-caked scales."
- `basilisk_queen` — "A crowned six-legged basilisk with molten amber eyes coiled in a garden of half-petrified warriors, dusty gold light."
- `wailing_banshee` — "A translucent shrieking spectre in trailing grey funeral veils, mouth open in a scream, hovering over frost-cracked gravestones, moonlight."
- `archvile_ascendant` — "A gaunt burning demon priest with elongated limbs and a bone crown, arms raised summoning a pillar of green-orange hellfire, industrial hell corridor."
- `mother_demon` — "A hulking bloated demon matriarch with a distended brood-sac torso and clawed forelimbs, spawn crawling from her, flesh-and-steel hell nest."

---

## C. Dungeon warden variety

### C1. The variety mechanism (replaces the fixed `DUNGEON_BOSS_FLOORS` map)

`src/engine/dungeon.ts`:

```ts
export const DUNGEON_WARDEN_POOLS: Record<ResolvedPveEncounterTheme, Record<5 | 10, readonly string[]>> = {
  classic: {
    5:  ["minotaur_of_the_depths", "warden_gorgon_matron", "warden_stone_choir"],
    10: ["floor_wyrm", "warden_bone_colossus"]
  },
  doom: {
    5:  ["doom_baron_warden", "doom_hell_knight_warden"],
    10: ["doom_cyberdemon_tyrant", "doom_archvile_warden"]
  }
};

/** Which warden this GAME's floor N fields. Seeded once per (game seed, theme, floor)
 *  — identical for every player and every reload, and unrerollable by leaving. */
export function dungeonWardenIdFor(seed: string, theme: ResolvedPveEncounterTheme, floor: 5 | 10): string;
```

`dungeonBossId(state, floor)` keeps its precedence and gains one rung:
1. designer `dungeonSite.floorBosses[floor]` (unchanged, still wins);
2. **new** `dungeonWardenIdFor(state.seed, dungeonThemeOf(state), floor)`;
3. `undefined` for a non-boss floor (unchanged).

Seeding: `createSeededRandom(`${state.seed}#dungeon-warden-${theme}-${floor}`, { salt: false })`
— the same construction `dungeonDoorsForFloor` already uses at
`adventure.ts:17671`, so behaviour matches the existing "shared, unrerollable
layout" rule. The FIRST entry of each pool is the currently-shipped warden, so a
pre-existing saved game with the same seed can still roll it (no migration needed —
this is a fresh-game-only derivation with no persisted field).

### C2. New wardens (4)

Constraint: `layers ≤ 3`, `minionCount ≤ 3`, statline within the shipped warden band
(attack 5–6, health 3–4, init 5–7) — see the wave-pool coupling note in §0.

| id | theme/floor | stats | abilities | escort |
|---|---|---|---|---|
| `warden_gorgon_matron` | classic 5 | A5 D2 H3 I5 ground, layers 2 | `["gorgon-death-stare", "veteran-guarded-stance"]` | 2 @ lvl 3 |
| `warden_stone_choir` | classic 5 | A4 D3 H4 I4 ground, layers 2 | `["boss-spell-frost", "doom-baron-damage-cap"]` | 2 @ lvl 3 — the caster warden; low Attack pays for the rotation |
| `warden_bone_colossus` | classic 10 | A6 D2 H4 I4 ground, layers 3 | `["behemoth-defense-crush-few", "automaton-detonate"]` | 3 @ lvl 4 — its death pulse punishes crowding |
| `doom_hell_knight_warden` | doom 5 | A6 D1 H3 I7 ground, layers 2 | `["ignores-retaliation", "commander-charge"]` | 2 @ lvl 3 |
| `doom_archvile_warden` | doom 10 | A5 D2 H4 I6 ground, layers 3 | `["boss-spell-infernal", "wog-fire-shield-1"]` | 3 @ lvl 4 — the Doom caster warden |

(5 entries; `doom_hell_knight_warden` is the only strictly-optional one — drop it
first if scope must shrink.)

**Art slugs** (same format):
- `warden_gorgon_matron` — "A massive bronze-hided gorgon matriarch with a bull skull and glowing white eyes, chained horns, torchlit dungeon hall."
- `warden_stone_choir` — "Three fused granite statue-mages sharing one plinth, blue runes crawling over their robes, cold cavern light."
- `warden_bone_colossus` — "A towering giant assembled from fused skeletons and rib-cage armour, green marrow-light in its chest, deep bone pit."
- `doom_hell_knight_warden` — "A brown-hided horned hell knight mid-charge, fists wreathed in green plasma, rusted UAC corridor."
- `doom_archvile_warden` — "A tall skeletal fire-priest demon with a crown of horns, both hands raised in a summoning pose, green flame pillar, hell foundry."

### C3. Repeat-clear anti-monotony

`dungeonWardenIdFor` is per GAME, not per attempt, so a player replaying floor 5
faces the same warden — deliberate (the fight must be learnable). Variety is
across games and across the two themes. Do NOT seed it by attempt count.

### C4. Wave-pool coupling (explicit decision)

`WAVE_MINIBOSS_POOLS` (`monster-waves.ts:57`) is a hand-written id list. It is
**deliberately extended in the same commit** to
`classic: ["minotaur_of_the_depths", "floor_wyrm", "warden_gorgon_matron", "warden_bone_colossus"]`
and `doom: [... , "doom_hell_knight_warden", "doom_archvile_warden"]` —
`warden_stone_choir` is EXCLUDED (a round-start caster on a wave mini-boss stacks
with the wave battle event and pushes wave 4+ over the line). A test must pin the
exclusion with the reason.

---

## D. Escort variety

Two changes, both small and both riding existing seams.

### D1. `escortPool` on `RaidBossDefinition` (optional; absent = today's behaviour)

```ts
/** Themed escort. Absent = the current `drawPveThemedArmy` level draw. */
escortPool?: readonly string[];   // unit def ids, e.g. ["neutral.zombies", "neutral.wraiths"]
```

Read in `revealRaidBossArmy` (`adventure-reducer.ts:8540`) and
`revealDungeonFloorArmy` (`:8565`): when `escortPool` is set, build
`minionCount` draws by cycling the pool with a seeded index
(`adventureRandom(state, `boss-escort-${bossInstanceId}`)`) and emit
`NeutralDraw[]` with `{ unitDefId, tier: <def tier>, bankGuard: true }` — the SAME
shape `drawPveThemedArmy` already returns, so recycling, targeting and XP are
unchanged. Falls back to the level draw when a pool id does not resolve (never a
stall, never an empty escort).

Themed pools shipped: `lich_archon` → undead; `mother_demon` → doom imps;
`archvile_ascendant` → doom demons; `basilisk_queen` → lizard/reptile neutrals.
Everything else keeps the level draw.

### D2. Escort Stack Tokens at high layers (raid bosses only)

In `revealRaidBossArmy` only (never the Dungeon — the Dungeon "deals fair"):
when `boss.layersLeft >= 4`, give `min(2, layersLeft − 3)` escort units a Stack
Token via **exactly the seam waves use** — set `unit.stackToken` then
`applyUnitCurrentSide(unit, ruleset, overrides)` (`applyWaveUnitAugments`,
`adventure-reducer.ts:~8480` is the literal template, including the
"no one stat more than twice" reroll and the partial Fisher–Yates recipient pick).

Rationale: an ESCALATED boss (which regrows layers every 4 rounds if ignored)
brings a visibly tougher retinue, and the reward is unchanged — pressure to kill
it early, not a payout change. Seeded by `${combat.dice.seed}#boss-escort-token`.

**No other escort change.** Escort count/level stay as printed.

---

## E. Field effects for Rift Lair & Dungeon fights

### E1. The selection problem, and the fix

`combatScriptsActiveForCombat` (`combat-scripts.ts:90`) keys scripts on the fought
field's **location id**. Every rift lair is `rift_lair` and every dungeon floor is
`dungeon_gate` — so a location-keyed script would fire identically on every boss
and every floor. Fix: one new resolver in the SAME file, additive.

```ts
/** PvE-module scripts chosen by (theme, encounter identity), not by location. */
export function pveEncounterScriptsForCombat(state: GameState, combat: CombatState): CombatScriptDefinition[];
```

`combatScriptsActiveForCombat` returns
`[...locationScripts, ...pveEncounterScriptsForCombat(state, combat)]`.
`pveEncounterScriptsForCombat` returns `[]` unless
`isPveEncounterCombat(combat)` — so with the modules OFF it is a single boolean
check and a `[]` (byte-identical). Selection:
- `combat.context.raidBossId` → `PVE_LAIR_SCRIPTS[theme][bossDefId]` (per-boss, optional).
- `combat.context.dungeonFloor` → `PVE_FLOOR_SCRIPTS[theme][band]`, where
  `band = floor <= 3 ? "shallow" : floor <= 7 ? "deep" : "abyss"` — so the dungeon
  visibly changes character as you descend.
- Wave assaults get NOTHING here (waves already have their battle-event rotation).

Scripts live in a new content file `src/data/anime/pve-combat-scripts.ts`,
registered through the existing `registerCombatScriptDefinitions`. They need a new
optional field `scope: "pve-encounter"` on `CombatScriptDefinition` so
`combatScriptsForLocation` never returns them by accident (`locationId` becomes
optional when `scope` is set).

### E2. Two new script effect kinds

Added to `CombatScriptEffect` (`src/data/map/combat-scripts.ts:42`):

```ts
| {
    /** Heal N damage on each living unit of a side. Never restores a boss layer. */
    kind: "side-heal";
    side: "attacker" | "defender";
    amount: number;
    /** Only units carrying `bossUnit` (the layered monster), not the escort. */
    bossOnly?: boolean;
  }
| {
    /** Place `count` obstacles on seeded-random EMPTY cells (0–19). */
    kind: "random-obstacle";
    count: number;
  }
```

Resolution in `combat-scripts.ts`:
- `side-heal` → `unit.damage = Math.max(0, unit.damage − amount)` for each
  matching living unit; `armyStacks` untouched (a boss can never regain a bar
  mid-fight). One `UNIT_ABILITY_TRIGGERED`-style feed line per pass, not per unit.
- `random-obstacle` → reuse `applyScriptObstacles`, but choose the candidate cells
  by shuffling the empty-cell set with
  `createSeededRandom(`${combat.dice.seed}#pve-obstacle#${combat.round}`, { salt: false })`.
  Both are automatic and open nothing.

Optional third kind, only if cheap: extending `environment-stat` to
`stat: "initiative"` requires a NEW read in `effectiveInitiative` (today
`combatScriptStatDelta` is read only by attack/defense resolution). **Defer it** —
`chill_of_the_deep` (§A) already covers the initiative fantasy through the
ActiveEffect path that already exists.

### E3. Shipped scripts

**Dungeon — classic**
| band (floors) | events |
|---|---|
| shallow 1–3 | combat-start `announce` "Dripping dark." Round 3 `place-obstacles` on the four central cells, `count: 2` ("The passage narrows"). |
| deep 4–7 | combat-start `environment-stat` `{ side: "attacker", unitType: "ranged", stat: "attack", amount: -1 }` ("Low ceilings foul your shots"). Round 4 `random-obstacle` `{ count: 2 }` ("Collapsing ceiling"). |
| abyss 8–10 | combat-start `environment-stat` `{ side: "both", stat: "defense", amount: -1 }` ("Nothing down here protects anyone"). Round 3 and round 5 `damage-pulse` `{ side: "attacker", amount: 1 }` ("Abyssal pressure"). |

**Dungeon — doom**
| band | events |
|---|---|
| shallow | Round 2 `damage-pulse` `{ side: "attacker", amount: 1 }` ("Radiation leak"). |
| deep | combat-start `environment-stat` `{ side: "defender", stat: "attack", amount: +1 }` ("Hell empowers its own"). Round 4 `random-obstacle` `{ count: 2 }` ("Structural collapse"). |
| abyss | Round 3 `side-heal` `{ side: "defender", amount: 1, bossOnly: true }` ("The furnace mends its keeper"). Round 5 `damage-pulse` `{ side: "attacker", amount: 1 }`. |

**Rift Lair — per boss (only these five carry one; the rest fight clean)**
| boss | events |
|---|---|
| `lich_archon` | Round 2 and every following EVEN round: `side-heal` `{ side: "defender", amount: 1, bossOnly: true }` ("Healing miasma"). *(Encode as explicit round entries 2/4/6/8 — the script vocabulary has no repeat cadence and must not grow one.)* |
| `abyss_kraken` | combat-start `environment-stat` `{ side: "attacker", unitType: "ground", stat: "attack", amount: -1 }` ("Flooded lair"). |
| `calamity_dragon` | Round 3 `damage-pulse` `{ side: "attacker", amount: 1 }` ("Ash storm"). |
| `mother_demon` | Round 2 `random-obstacle` `{ count: 3 }` ("The nest thickens"). |
| `avatar_of_erebos` | combat-start `environment-stat` `{ side: "both", stat: "defense", amount: -1 }` ("The god's presence unmakes armour"). |

Balance note: `side-heal` on a boss is the single strongest item here (it fights a
war of attrition with persistent wounds). It is capped at **1 per pass, boss-only,
even rounds only** — a 5-round `lich_archon` fight regains 2 damage, roughly
two-thirds of one health bar, and never a layer.

---

## F. Variant rewards & new rooms

### F1. Dungeon "treasure theme" (seeded per game)

`src/engine/dungeon.ts`:

```ts
export type DungeonTreasureTheme = "hoard" | "arsenal" | "lore";
/** Seeded ONCE per game from the seed — same for every player, unrerollable. */
export function dungeonTreasureThemeOf(state: GameState): DungeonTreasureTheme;
```

`dungeonFloorRewardSteps(state, floor, options)` takes the theme and swaps the
NON-artifact rungs **within the same value class**. Floors 3, 5, 7 and 10 (the
artifact rungs) and the repeat-clear fallback are **UNCHANGED in every theme** —
that is the anti-inflation guarantee.

| floor | today | `hoard` | `arsenal` | `lore` |
|---|---|---|---|---|
| 1 | 2 gold | 2 gold | 2 gold | `GAIN_EXPERIENCE 1` |
| 2 | 2 valuables | 3 gold | `GAIN_UNIT_XP 2` *(Unit Experience ON)* → else 2 valuables | 2 valuables |
| 4 | 2 gold + 1 val + 1 Treasure die | 3 gold + 1 Treasure die | 1 Treasure die + `GRANT_STACK_TOKEN` | 2 gold + `GAIN_EXPERIENCE 2` |
| 6 | 3 gold | 4 gold | `GAIN_UNIT_XP 2` + 1 gold | `GAIN_COMMANDER_POINTS 1` *(Commanders ON)* → else 3 gold |
| 8 | 3 val + 1 Treasure die | 4 valuables | 1 Treasure die + `GAIN_UNIT_XP 2` | 3 val + `GAIN_EXPERIENCE 2` |
| 9 | 3 gold + 1 Treasure die | 4 gold + 1 Treasure die | 1 Treasure die + `GRANT_STACK_TOKEN` | 3 gold + `GAIN_COMMANDER_POINTS 1` → else 3 gold |
| 3/5/7/10 | artifact rungs | identical | identical | identical |

Every module-gated rung MUST carry an explicit fallback in the same function
(`adventure.unitExperience` / the Commanders module flag), so a game without the
module never gets a dead step. That fallback is what the CONTROL test asserts.

### F2. Boss kill: first-kill trophy choice

`resolveRaidBossVictory` (`adventure-reducer.ts:12369`) keeps its 5 gold + relic
search **unchanged**. It gains ONE extra queued `visit-steps` entry: a
`CHOOSE_ONE` "Claim a trophy from <Boss>" with three EQUAL-value options, all
existing VisitStep kinds and all auto-resolvable by an AI/AFK seat through the
existing `CHOOSE_ONE` path:

1. `GAIN_MORALE 1`
2. `ROLL_TREASURE_DICE 1`
3. `GAIN_EXPERIENCE 2`

Rules: offered **only on the FIRST raid-boss kill of the game per player**
(`player.raidBossTrophyClaimed?: true` — new optional PlayerState boolean, absent
on legacy snapshots ⇒ offered once). A second boss kill pays the unchanged
existing reward and no trophy. Total inflation over a whole game: one small pick.

Layer-break gold (`RAID_BOSS_LAYER_BREAK_GOLD = 2`) is **untouched**.

### F3. Dungeon Conqueror repeat differentiation

`dungeonFloorRewardSteps(..., { repeat: true })` today pays 1 Treasure die + 3
gold. Add ONE differentiation: with Unit Experience on, a repeat clear of the
conquered bottom floor also pays `GAIN_UNIT_XP 2` (the grind's only ongoing use).
No gold/artifact change. Fallback when the module is off: unchanged.

### F4. New dungeon rooms (6)

Added to `dungeonRoomPool` (`dungeon.ts:125`). Every step is an already-shipped
auto/menu VisitStep, per that function's stated contract. `DungeonRoom["key"]`
widens to include `"forge"` and `"pit"`.

**Classic (3 new):**
| key | label | steps |
|---|---|---|
| `forge` | "Dwarven forge (pay 3 gold: a Stack Token)" | `PAY_TO {gold:3} → [GRANT_STACK_TOKEN]` |
| `pit` | "Spiked pit (Treasure die; the guard below is angrier)" | `[ROLL_TREASURE_DICE 1, GAIN_MORALE -1]` |
| `shrine` | "Ancestor stone (+1 hero XP, +1 movement)" | `[GAIN_EXPERIENCE 1, GAIN_MOVEMENT 1]` |

**Doom (3 new):**
| key | label | steps |
|---|---|---|
| `forge` | "Weapon locker (pay 3 gold: a Stack Token)" | `PAY_TO {gold:3} → [GRANT_STACK_TOKEN]` |
| `pit` | "Slime vat (+3 valuables, −1 morale)" | `[GAIN_RESOURCES {valuables:3}, GAIN_MORALE -1]` |
| `camp` | "Med station (+2 hero XP)" | `[GAIN_EXPERIENCE 2]` |

Pool sizes go 5 → 8 (classic) and 5 → 8 (doom). `dungeonDoorsForFloor` picks two
DISTINCT indices already, so no change there — but its distinctness is by INDEX,
and the pool now has repeated `key` values, so two doors can show two different
`vault`-keyed rooms. That is fine and already true today (classic ships two
`vault` entries); the test must assert the two doors are different ROOM OBJECTS.

`GRANT_STACK_TOKEN` is gated on the Polish unit-stacks rule in the engine; verify
its no-op behaviour when the rule is off and, if it is a hard no-op, price the
forge rooms at 0 gold in that case or replace the step with `GAIN_RESOURCES
{gold: 3}` refund-equivalence. **This is the one open question for Phase 3.**

### F5. Presentation

- New feed line on a monster spell: reuses `UNIT_ABILITY_TRIGGERED`.
- New feed line on the warden pick: none — the existing floor prompt already names
  the warden (`handleDungeonGateVisit`, `adventure.ts:17645`).
- The Rift Lair prompt (`handleRiftLairVisit`, `adventure.ts:17724`) gains
  ", and it casts every round" when the boss carries a `BOSS_SPELL_ROTATION`
  ability, derived from the ability array (never hand-written).
- The `summary` field of every new boss/warden must state exactly what the wired
  abilities do — CLAUDE.md §2, enforced today by `raid-bosses.test.ts`.

---

## G. Implementation phases

Each phase is one agent. Each ends green on the named tests, and each test must be
mutation-checked (revert the logic → the test fails) with a CONTROL that proves the
module-OFF / non-PvE path is untouched.

### Phase 1 — engine arms + field effects

**Touch:**
- `src/data/units/abilities.ts` — add the `BOSS_SPELL_ROTATION` union member + the
  4 carrying ability definitions.
- `src/data/anime/monster-spells.ts` — NEW (spell table).
- `src/engine/monster-spells.ts` — NEW leaf (`monsterSpellForRound`,
  `monsterSpellTarget`, `monsterSpellCasters`).
- `src/engine/reducer.ts` — `applyMonsterSpellRoundStart` beside
  `applyActivationDamageSpell`; call site at `advanceCombatRound:23745`.
- `src/engine/adventure-reducer.ts` — `finalizeCombatStart` call site.
- `src/engine/state.ts` — `CombatState.monsterSpells?: { fired: string[] }`.
- `src/data/map/combat-scripts.ts` — `side-heal` + `random-obstacle` effect kinds;
  optional `scope: "pve-encounter"`, `locationId` optional.
- `src/engine/combat-scripts.ts` — resolve the two new kinds;
  `pveEncounterScriptsForCombat`; splice into `combatScriptsActiveForCombat`.
- `src/data/anime/pve-combat-scripts.ts` — NEW (the §E3 scripts), registered.
- `src/data/anime/bosses.ts` — the 4 new ability ids into `RAID_BOSS_ABILITY_CHOICES`.

**Tests (`src/engine/monster-spells.test.ts`, `pve-field-effects.test.ts`):**
1. `shadow_bolt` on a real combat: target's `damage` rises by exactly 2, the
   TOUGHEST unit is hit (assert WHICH unit, with a second unit that must NOT be hit).
2. Same bolt vs a unit with `reduce-spell-damage-2` → damage rises by 0.
   vs `immune-all-spells` → 0 and a "is immune" feed line. vs single-school immunity → 2.
   CONTROL: a plain unit takes 2.
3. Rotation order across 3 real combat rounds (real `END_COMBAT_ROUND` actions):
   round 1 → spell A effect observed, round 2 → spell B, round 4 → spell A again.
4. `withering_curse` observable outcome: a cursed unit's resolved ATTACK DAMAGE is
   1 lower than the same attack without the curse (not "an effect exists").
5. `mend_flesh` never restores a layer: a boss at `armyStacks: 1, damage: 2` heals
   to `damage: 0` and `armyStacks` is still 1.
6. `siphon_thought` removes exactly 1 card from the fighter's hand and puts it in
   their discard; empty hand → no crash, no event spam.
7. Idempotence: calling `applyMonsterSpellRoundStart` twice in the same round
   changes nothing the second time (re-entrant `finalizeCombatStart`).
8. **No stall:** after a full boss fight driven only by legal actions with a
   COMPUTER seat, `state.pendingChoice` and `state.reactionWindow` are never set by
   the spell pass, and the combat reaches an outcome.
9. Lethal bolt ends the combat: a bolt that kills the last unit sets
   `combat.outcome` before any activation opens.
10. `side-heal` heals a boss body by 1, never `armyStacks`, and never a non-boss
    unit when `bossOnly`. `random-obstacle` places exactly `count` obstacles on
    EMPTY cells, deterministic across two identical runs.
11. **CONTROL:** a plain neutral guard fight (no PvE context) —
    `combatScriptsActiveForCombat` returns exactly what it returned before, and
    `applyMonsterSpellRoundStart` is a no-op (no events appended).

### Phase 2 — bosses, wardens, escorts, variety

**Touch:**
- `src/data/anime/bosses.ts` — 6 raid bosses (B1–B6), 5 wardens (C2),
  `escortPool` field.
- `src/engine/raid-bosses.ts` — extend `CLASSIC_RAID_BOSS_IDS` / `DOOM_RAID_BOSS_IDS`.
- `src/engine/dungeon.ts` — `DUNGEON_WARDEN_POOLS`, `dungeonWardenIdFor`,
  `dungeonBossId` precedence rung.
- `src/engine/monster-waves.ts` — the explicit `WAVE_MINIBOSS_POOLS` extension (§C4).
- `src/engine/adventure-reducer.ts` — `escortPool` branch in `revealRaidBossArmy` /
  `revealDungeonFloorArmy`; escort Stack Tokens at `layersLeft ≥ 4`.

**Tests (`raid-bosses.test.ts`, `dungeon.test.ts`, `boss-abilities.test.ts` extensions):**
1. Every new boss/warden: each `abilities` id resolves to an `implemented`
   `unitAbilities` entry (extend the existing sweep) and `cardImage` ends with
   `/${id}.webp` (the existing cross-wiring guard — 4 shipped Doom bosses once
   failed this).
2. `dungeonWardenIdFor` is stable across two calls with the same seed and
   DIFFERENT across at least 2 of 8 fixed seeds (real variety, not a constant).
   Designer `floorBosses` still WINS over it (CONTROL).
3. A classic game never rolls a doom warden and vice versa (mirror the existing
   `DOOM_RAID_BOSS_IDS` theme-pool test).
4. Escort: a boss with `escortPool` reveals exactly `minionCount` units, all from
   the pool. CONTROL: a boss without one reveals the level draw unchanged.
   Unresolvable pool id → falls back to the level draw, no empty escort.
5. Escort Stack Tokens: at `layersLeft = 5` exactly 2 escorts carry a
   `stackToken` and their folded stat REALLY moved (assert the stat delta, not the
   field). At `layersLeft = 3` → zero tokens (CONTROL). Dungeon floors → zero tokens
   at any layer count (CONTROL).
6. Warden layer/escort caps: every id in `WAVE_MINIBOSS_POOLS` has `layers ≤ 3` and
   `minionCount ≤ 3`; `warden_stone_choir` is asserted ABSENT from both wave pools.
7. A full seeded raid-boss fight and a full seeded floor-5 fight reach an outcome
   with a computer seat and no stall (extend `single-player-*` soak style).

### Phase 3 — rooms, rewards, presentation

**Touch:**
- `src/engine/dungeon.ts` — `dungeonTreasureThemeOf`, themed
  `dungeonFloorRewardSteps`, 6 new rooms in `dungeonRoomPool`.
- `src/engine/adventure-reducer.ts` — the first-kill trophy `CHOOSE_ONE` in
  `resolveRaidBossVictory`; the repeat-clear `GAIN_UNIT_XP`.
- `src/engine/state.ts` — `PlayerState.raidBossTrophyClaimed?: true`.
- `src/engine/adventure.ts` — the Rift Lair prompt's caster line (derived from the
  ability array).

**Tests (`dungeon.test.ts`, `raid-bosses.test.ts`):**
1. Artifact rungs are IDENTICAL across all three treasure themes (the
   anti-inflation invariant — one assertion over floors 3/5/7/10 × 3 themes).
   Non-artifact rungs DIFFER in at least 4 floors between `hoard` and `lore`.
2. Every module-gated rung has a fallback: with Unit Experience OFF and Commanders
   OFF, `dungeonFloorRewardSteps` for floors 2/6/8/9 in every theme contains NO
   `GAIN_UNIT_XP` / `GAIN_COMMANDER_POINTS` step and is non-empty.
3. `dungeonTreasureThemeOf` stable per seed, and at least 2 distinct values over 8
   fixed seeds.
4. Trophy: the first raid-boss kill queues a 3-option `CHOOSE_ONE`; picking
   `GAIN_MORALE` really moves the player's morale by +1. The SECOND kill queues no
   trophy (CONTROL). The base 5 gold + relic search are byte-identical in both
   cases (assert the gold delta is exactly `RAID_BOSS_KILL_GOLD`).
5. A COMPUTER seat resolves the trophy choice through the ordinary
   `CHOOSE_OPTION` path with no stall (drive it via `getLegalActions` +
   `computerDecisionOwner`).
6. New rooms: every step kind in `dungeonRoomPool` for both themes is in the
   auto/menu VisitStep set the existing pump can resolve; `dungeonDoorsForFloor`
   returns two DIFFERENT room objects for every floor 1–10 × both themes.
7. Resolve the open question in F4: assert what `GRANT_STACK_TOKEN` does with
   `polish-unit-stacks` OFF; if it is a hard no-op, change the forge rooms and pin
   the replacement.

---

## H. Deliberate non-goals / risks

- **No new interactive window anywhere.** Every monster spell, field effect and
  escort augment is automatic; the only player-facing choices are `CHOOSE_ONE`
  visit steps, which the reward pump and the AI already resolve.
- **No protocol-shape risk beyond three additive optional fields**
  (`CombatState.monsterSpells`, `RaidBossDefinition.escortPool`,
  `PlayerState.raidBossTrophyClaimed`) — all absent on legacy snapshots and all
  read defensively. A protocol bump + `npm run deploy:partykit` is still owed
  because setup/combat are server-built.
- **Payout inflation is bounded** to: one first-kill trophy pick per player per
  game, and `GAIN_UNIT_XP 2` on a repeat bottom-floor clear. Artifact rungs, boss
  layer gold and boss kill gold are untouched.
- **Risk to watch:** `side-heal` on `lich_archon` plus its `mend_flesh` rotation
  slot stack to 2 healing per even round. If playtest shows the fight stalling,
  cut `mend_flesh` from `boss-spell-necrotic` first (data-only change).
- **Risk to watch:** `doom-pain-elemental-summon-lost-soul` on `mother_demon` —
  verify the summon population cap before shipping (§B6).
- **Out of scope, filed separately:** `mgq-sylph-speed-aura`
  (`src/data/units/abilities.ts` ~line 1460) prints an initiative-aura text but
  carries `effect: { type: "ON_ACTIVATION_HEAL_SELF", amount: 1 }` — a real
  text/effect mismatch found while inventorying, unrelated to this design.

export type PlayerId = string;
export type CardId = string;
export type UnitId = string;
export type HeroId = string;
export type TownId = string;
export type BuildingId = string;
export type DeckId = string;
export type MapSpaceId = string;

export type GamePhase =
  | "setup"
  | "round-start"
  | "simultaneous-turns"
  | "player-turn"
  | "ai-turn"
  | "map"
  | "town"
  | "combat-setup"
  | "combat"
  | "reaction"
  | "choice"
  | "cleanup"
  | "game-over";

export type GameMode = "combat-sandbox" | "adventure";
export type GameSessionMode = "multiplayer" | "single-player";
/** How map-authored computer opponents relate to one another in solo play. */
export type ComputerDiplomacy = "free-for-all" | "allied";
export type ComputerDifficulty = "standard";
export type PlayerController =
  | { kind: "human" }
  | { kind: "computer"; difficulty: ComputerDifficulty; policyVersion: 1 };
export type GameDifficulty = "easy" | "normal" | "hard" | "impossible";
/**
 * Rules variant chosen in the lobby:
 *  - "legacy": the community rulebook as printed (single Spell/Artifact decks,
 *    printed card values).
 *  - "binh": the BINH house-rule mode — split Basic/Expert Spell decks and
 *    Minor/Major/Relic Artifact decks with level/map gating, Wisdom expert
 *    discount 3, Estates 2/4 gold, Griffin and Marksmen stat tweaks, and the
 *    Pack of Cerberi attacking every adjacent enemy with full attacks.
 */
export type GameRuleset = "legacy" | "binh";

/** Which Artifact tier decks a hero may search right now (BINH split decks). */
export type ArtifactDeckAccess = {
  minor: boolean;
  major: boolean;
  relic: boolean;
};

/**
 * Individual BINH house-rule toggle ids. Each gates one real engine tweak; the
 * registry, defaults and resolver live in house-rules.ts (which imports this
 * union). Defined here so the pure-type state module needs no data-layer import.
 */
export type HouseRuleId =
  | "split-decks"
  // BINH Mystical Garden reward: its gold choice grants 3 instead of the
  // printed 2. Off restores the official card value.
  | "mystical-garden-gold"
  | "griffin-buff"
  | "marksman-buff"
  | "wisdom-expert-discount"
  | "estates-nerf"
  | "sandro-skeleton-hp"
  | "gelu-sharpshooter-buff"
  // Initiative-only specialty cards (including Gelu VI) may use their BINH
  // alternative to draw 1 card instead of applying the combat buff.
  | "initiative-specialty-draw"
  // Initiative buffs (Haste, Slow AND the initiative-only hero specialties) also
  // shift a unit's Combat movement by ±1 (the "Battlefield Expansion" reading).
  // Off: they change only Initiative, never movement (the standard/wiki rule).
  | "combat-move-initiative"
  // BINH Far-tile mulligan: after revealing a II-III tile, the opener may
  // replace an Ore-Mine tile once, and their second opening may reroll toward
  // their first Settlement. Off (official): the revealed tile is final.
  | "far-tile-rerolls"
  // Winning the Dragon Fly Hive / Griffin Conservatory bank ALSO grants an
  // Ability Empower token (max 1; spend anytime to Empower one hand Ability —
  // Expert then costs no crown). Off: those banks grant only the unit, as printed.
  | "bank-empower-ability"
  // A Creature-Bank fight obeys the one-Round time limit and the spend-1-move-
  // point-to-extend rule, like an ordinary neutral fight. Off: a bank has no
  // Round limit (rulebook) and rolls straight into the next round.
  | "bank-move-points"
  // BINH house rule: each of the difficulty's Creature-Bank Stack Tokens lands
  // only 80% of the time. Off (official): every token is placed, so the fixed
  // count is Easy 1 / Normal 2 / Hard 3 / Impossible 4.
  | "bank-stack-chance-80"
  // The 5-gold penalty for losing a hero combat is paid in full even into debt
  // (gold may go below zero). Off: the loss is capped so gold never goes negative
  // (the normal rule).
  | "defeat-gold-debt"
  // Ballistics buff: levelling the Arrow Tower is a BASIC side, plus a new Expert
  // bombard (pay 1 building material). Off: the Arrow-Tower demolition is the
  // Expert side and there is no bombard (wiki).
  | "ballistics-buff"
  // Expert Pathfinding also crosses the coastline (land↔sea) with no halt and
  // steps between the Surface and a Subterranean tile without a Gate. Off:
  // Pathfinding grants only its basic map movement (no expert crossing).
  | "pathfinding-expert"
  // Holding Visions lets the attacker cast it before a Neutral fight to swap out
  // the drawn guards. Off: Visions is only the map-turn deck scry (wiki).
  | "vision-battle-swap"
  // Dracon's Enchanters IV may ALSO upgrade the cheaper Few of Magi into the
  // Enchanters for 6 extra gold (besides the free Pack-of-Magi trade). Off: only
  // the rulebook options remain — trade a Pack of Magi, or draw a card.
  | "dracon-few-magi-trade"
  // Obelisk house-rule die rewards: first visitor locks an Attack-die face on the
  // Field; every visitor gets that reward (−1 morale / 0 Search(2) Artifact /
  // +1 Treasure+Resource dice). Off: Obelisks are still multi-flaggable but
  // grant no die reward. Independent of Holy Grail dig unlock (which always
  // counts visits while victoryMode is "grail").
  | "obelisk-rewards"
  // Polish house-rule Spell Book: owned Spells live in a refreshed/used Book
  // and require generic Cast-a-Spell cards. Mutually exclusive with the
  // existing stash-style `adventure.spellBook` rule.
  | "polish-spell-book"
  // Polish house rule: a bank-eligible tile reveals two face-up bank
  // candidates with independently rolled sizes I-IV before rotation. Size gives
  // all four bank units 0/1/2/3 layers; rewards: Ⅰ base only, Ⅱ full 4-stack
  // extras, Ⅲ/Ⅳ = Ⅱ + 1/2 base GOLD layers (not valuables).
  | "polish-bank-sizes"
  // Polish house rule: Pack Groups and recruited Neutrals may buy Stack layers
  // at a Citadel (bank-guard Neutrals use the higher bank max). +1 Attack while
  // stacked; each layer absorbs one full health bar.
  | "polish-unit-stacks"
  // Polish house rule: replace the difficulty-scaled starting bonus with a
  // fixed reduced choice — draw 2 Minor Artifacts and keep 1, OR take one of
  // 3 gold / 2 building materials / 1 valuables.
  | "polish-reduced-starting-bonus"
  // Polish house rule ("Rule 111"): once per game, when fighting a difficulty-I
  // combat on your own starting tile, replace one bronze guard with the next
  // random bronze unit from the Neutral deck.
  | "polish-rule-111"
  // Polish house rule: surrender costs 10 gold, reduced by 3 after each combat
  // round (min 1). Available mid-fight (not prep-only). Attacker still gets 1 VP.
  | "polish-reduced-surrender"
  // Polish house rule (requires split Artifact decks): when gaining an Artifact,
  // roll an Attack die to optionally upgrade/restrict the tier class allowed
  // (field uses tile band; merchant/card effects use hero level). Also upgrades
  // polish-pandora-search by +1 card on a "+1" face.
  | "polish-random-artifacts"
  // Polish house rule: visiting Pandora's Box must use Search(N) choose 1
  // instead of either printed dice reward — N=2 on IV–V tiles, N=3 on VI–VII.
  // With polish-random-artifacts, a "+1" die raises N by 1 (Search 3 / Search 4).
  | "polish-pandora-search"
  // Polish house rule: units may Wait once per combat round at the start of
  // their activation; waited units re-activate after everyone else, highest
  // Wait-token number first (reverse order).
  | "polish-wait"
  // Polish house rule: strength-based Quick Combat. Availability compares the
  // army's 5 strongest unit cards (bronze 1 / silver 2 / gold 3 / azure 4;
  // Pack ×2; +0.5 per Unit-Stack layer) against 2×Field-Difficulty + X
  // (easy 1 / normal 2 / hard 3 / impossible 4; +1 when playing with Unit
  // Stacks), including VI–VII fields. Covered + no Experience possible →
  // MANDATORY Quick Combat; covered + Experience possible → the player chooses
  // fight vs Quick Combat; not covered → the fight is mandatory (the classic
  // level > difficulty auto-win no longer applies).
  | "polish-quick-combat"
  // Polish house rule: random Grail/Utopia placement and shared objective rules.
  | "polish-grail-utopia"
  // Pit Lords' Summon Demons: while ON, a Pit Lords may summon a new Few even
  // when Demons are already on the field (multiple Demon units). Off (official):
  // only ONE Demons unit may stand on the field (Few or Pack) — summon is
  // blocked while any living Demons of the controller are already present;
  // reinforce Few→Pack stays legal.
  | "multi-demon-summon"
  // Phoenix Pack Rebirth (BINH house rule): the Pack of Phoenixes also carries
  // the printed Few Rebirth ("once per Combat, lethal → 1 HP") so a Pack
  // Phoenix clings to life at its Pack side. Off (wiki/printed Pack): Pack has
  // only the line attack + Fire immunity — Rebirth is Few-only (and Neutral).
  | "phoenix-pack-rebirth"
  // Resource die valuables cap (BINH house rule): the printed die's "2 valuables"
  // face is reduced to 1, so no Resource-die roll (nor a Cards-of-Prophecy "set
  // the die" pick) ever grants more than 1 valuable. Off (printed die, the BASE
  // GAME default): the "2 valuables" face is live. See `resourceDieFaces`
  // (adventure.ts) — the ONE read every roll/label/UI site goes through.
  | "resource-die-single-valuables"
  // Torso of Legion re-tier (BINH house rule): Torso of Legion is PRINTED Minor
  // but BINH plays/sorts it as a MAJOR artifact. Default ON in BOTH modes (it
  // predates this toggle — every existing binh AND legacy game already treats it
  // as Major, so byte-identical preservation forces the legacy default ON too).
  // Off: the engine reads Torso as its printed MINOR tier at every tier
  // chokepoint (deck placement, black-market/junk/event prices, Polish tier
  // gates, deck return). See `effectiveArtifactTier` (ruleset.ts).
  | "torso-of-legion-major"
  // BINH-only re-tier: Eversmoking Ring of Sulfur is treated as Major while
  // this rule is enabled; Legacy and disabled BINH games retain printed Minor.
  | "eversmoking-ring-of-sulfur-major"
  // Global map rule (default OFF in BOTH modes): every fought-out neutral guard
  // fight on a MINE field (all resource types) fields ONE EXTRA random neutral
  // BRONZE creature on top of the normal guard army. The extra bronze is a plain
  // deck draw (recycles to the bronze discard at combat end like any guard); it
  // never touches combat difficulty / XP / reward — only the fought army grows.
  // Quick Combat / level auto-wins (resolved before the army deploys) are
  // unaffected. See `mineGuardReinforcementDraws` / drawGuardArmy (adventure.ts).
  | "mine-guard-reinforcement"
  // Global map rule (default OFF in BOTH modes): an enemy Hero walking onto YOUR
  // already-flagged Mine no longer re-flags it for free — the owner gets the
  // settlement-style defense window (pay 3 gold, defend with your army AND your
  // CARDS; only the hero is missing), or lets it fall (the flag hands over
  // exactly like today's walk-in). Win keeps the Mine; loss/decline flags it for
  // the attacker. A Mine with a LIVE neutral guard still fights the guard first;
  // a View Earth remote capture is NOT intercepted. See `garrisonDefenderFor` /
  // `garrisonDefenseKeepsCards` (adventure-reducer.ts).
  | "mine-army-defense"
  // Global map rule (default OFF): Secondary Heroes cannot be hired or gained.
  // Prison visits grant their printed 3-gold fallback instead.
  | "no-secondary-heroes"
  // Global map rule (default OFF): fought neutral combats may continue past the
  // first round without spending a Hero movement point.
  | "free-neutral-combat-extend"
  // Global map rule (default OFF): every ordinary Field-Difficulty V Neutral
  // army contains at least one of Archangels, Ghost Dragons, or Black Dragons.
  // The guaranteed body occupies one of the row's existing gold slots, so the
  // guard count, difficulty, rewards, and XP do not change.
  | "level-v-signature-neutral"
  // Old BINH reinforcement timing: playing Necromancy or visiting a Hill Fort
  // immediately opens a blocking pick-and-pay upgrade prompt. Off (new default):
  // the effect banks its reinforcement discount; the player may add Legion
  // pieces and redeem it later, until one of their heroes moves a step.
  | "immediate-reinforcement-prompts"
  // BINH house rule (default OFF in BOTH modes — the OFFICIAL reading is the
  // default): while ON, elemental damage ALSO skips the Attack die entirely and
  // can never be RAISED by attack cards / Attack tokens (only lowered) — the old
  // engine reading. OFF (official): elemental damage does exactly ONE thing —
  // ignore the target's Defense (including any Defense cards played). The attack
  // otherwise happens normally: the die IS rolled and +⚔ / −⚔ cards change the
  // value like on any other attack. See `getAttackStackDetails` (reducer.ts).
  | "elemental-damage-no-die"
  // BINH house rule (default OFF in BOTH modes — the OFFICIAL reading is the
  // default): while ON, DISCOVERING a face-down Tile (and OPENING a new Ⅱ–Ⅲ one)
  // additionally requires an un-sealed border between the hero and the tile — a
  // printed yellow arc / designer border on the hero's own field, or a designed
  // per-edge line on every shared edge, blocks it (use a Redwood Observatory /
  // Speculum instead). OFF (official): being ADJACENT is the whole requirement —
  // the rules mention no blockers or yellow borders for discovery. The
  // Surface/Subterranean divide (a printed rule) still applies either way. See
  // `heroCanDiscoverTileAcrossBorders` / `canHeroReachPlacementCenter`.
  | "discovery-border-gate"
  // BINH house rule (default OFF in BOTH modes — the OFFICIAL reading is the
  // default): while ON, which Spell/Artifact decks a Search may reach also
  // unlocks from HERO LEVEL and map progress (expert Spells at level ≥ 4 or once
  // a Ⅳ–Ⅴ tile is revealed anywhere, or while holding Eagle Eye / Wisdom / a
  // Basic X Magic; Major/Relic artifacts at level ≥ 4 / ≥ 6 with an artifact
  // source) — the old BINH tier-progression gate. OFF (official): the TILE the
  // main hero stands on decides, and nothing else — starting/far Ⅰ–Ⅲ = basic
  // Spells / Minor artifacts, near Ⅳ–Ⅴ = expert Spells / Major artifacts, centre
  // Ⅵ–Ⅶ = expert Spells / Relic artifacts (weaker tiers always allowed). See
  // `canDrawExpertSpells` / `artifactDeckAccess` (ruleset.ts).
  | "deck-access-hero-level"
  // Polish house rule (default OFF in BOTH modes): eleven Artifact SETS. A
  // player's piece count for a set is how many DISTINCT member cards they still
  // own anywhere in their pool (deck + hand + discard + in-play permanents /
  // ongoing cards; removed copies never count). At 2 pieces the set's first
  // listed effect switches on, at 3 the first two, and so on — cumulative, never
  // a choice. Data in `src/data/cards/artifact-sets.ts`, read layer in
  // `src/engine/artifact-sets.ts`.
  | "polish-set-artifacts"
  // Polish house rule (default OFF in BOTH modes): the "Balance Pack" reprints.
  // Each covered card plays its NEW printed text and renders its balance-pack
  // FACE; with the rule off every card is byte-identical to before. The covered
  // ids are the single registry `POLISH_BALANCE_CARD_IDS`
  // (`src/data/cards/polish-balance-art.ts`) — a card is listed there ONLY once
  // its new behaviour is genuinely engine-wired, so the face can never advertise
  // a rule the engine does not run.
  | "polish-card-balance";

/** Shared presentation/army theme for the optional wave, boss and dungeon modules. */
export type PveEncounterTheme = "classic" | "doom" | "random";
/** The concrete theme frozen into a started game (`random` is resolved from the seed). */
export type ResolvedPveEncounterTheme = Exclude<PveEncounterTheme, "random">;
/** Wave reward/pillage profile selected in the pre-game mod options. */
export type WavePressure = "standard" | "brutal";
/** Optional consecutive/total wave-loss elimination threshold; 0 keeps elimination off. */
export type WaveDefeatLimit = 0 | 2 | 3;
/** Lobby-friendly scheduled world-boss arrival choices. Designed maps may still use any round 2..30. */
export type RaidBossSpawnRound = 4 | 5 | 6;
/** Short expedition or full ten-floor Dungeon campaign. */
export type DungeonDepth = 5 | 10;
/** Movement paid only when immediately descending to the next floor. */
export type DungeonDescentCost = 0 | 1 | 2;

/** Optional Wake of Gods modules. WOG is a BINH-family mod (not a game mode). */
export type WogModOptions = {
  enabled: boolean;
  commanders: boolean;
  newObjects: boolean;
  newCreatures: boolean;
  /** Wake of Gods hero Artifact cards join the shared Artifact deck(s). */
  artifacts: boolean;
  /**
   * WoG Unit Experience System (board adaptation): army unit cards gain
   * experience from combats won alongside the hero and earn veteran ranks
   * (stat bonuses + elite abilities). See src/engine/unit-experience.ts.
   */
  unitExperience?: boolean;
  /**
   * Neutral Rank-Up (optional module): NEUTRAL guard units gain the shared
   * veteran ranks as the game ages — field guards use tier round tables capped
   * at Elite, while Creature Banks use separate Far/Near round tables. Balance guardrails and
   * scope in src/engine/unit-experience.ts. Default OFF ⇒ byte-identical.
   */
  neutralRankUp?: boolean;
  /**
   * Calamity Waves (WOG surface of the shared module, §6.6 of the anime plan):
   * scheduled monster invasions every `waveCadence` rounds — every live seat
   * fights a wave army at round start behind the event barrier; a loss is
   * pillage (gold + one mine/settlement overrun), never elimination. Same
   * engine as `anime.monsterWaves` — either surface activates it.
   */
  monsterWaves?: boolean;
  /**
   * Raid Bosses (WOG surface of the shared module, §6.5): persistent
   * multi-layer world bosses in a Rift Lair — wounds persist between attempts,
   * escalate if ignored, pay per layer broken. Same engine as
   * `anime.raidBosses` — either surface activates it.
   */
  raidBosses?: boolean;
  /**
   * The Dungeon (WOG surface of the shared module, §6.7.3): one repeatable
   * delve site per map with per-player floor progress, door-choice rooms and
   * floor bosses. Needs `creatureBanks` (the site is carved onto a Blocked
   * Field). Same engine as `anime.dungeon` — either surface activates it.
   */
  dungeon?: boolean;
  /** Calamity wave cadence when monsterWaves is on (mirrors anime.waveCadence). */
  waveCadence?: 3 | 4 | 5;
  /** Shared monster/map-object theme for Waves, Raid Bosses and the Dungeon. */
  pveTheme?: PveEncounterTheme;
  /** Standard rewards/pillage, or a richer and more punishing brutal profile. */
  wavePressure?: WavePressure;
  /** Optional elimination after this many lost waves; 0 = pillage only. */
  waveDefeatLimit?: WaveDefeatLimit;
  /** Scheduled Rift Lair arrival (the warning appears one round earlier). */
  raidBossSpawnRound?: RaidBossSpawnRound;
  /** Five-floor expedition or the full ten-floor delve. */
  dungeonDepth?: DungeonDepth;
  /** Movement paid for each immediate descent after a floor win. */
  dungeonDescentCost?: DungeonDescentCost;
};

export const DEFAULT_WOG_OPTIONS: WogModOptions = {
  enabled: false,
  commanders: false,
  newObjects: false,
  newCreatures: true,
  artifacts: false,
  unitExperience: false,
  neutralRankUp: false,
  monsterWaves: false,
  raidBosses: false,
  dungeon: false,
  pveTheme: "classic",
  wavePressure: "standard",
  waveDefeatLimit: 0,
  raidBossSpawnRound: 5,
  dungeonDepth: 10,
  dungeonDescentCost: 1
};

/**
 * Optional Anime mod modules (Ninefold Realms × Otherworld Gate). BINH-family,
 * default OFF — absent on legacy snapshots. See docs/anime-mod-plan.md.
 */
export type AnimeModOptions = {
  enabled: boolean;
  /**
   * Anime Field-Override MAP OBJECTS (the 11 Ninefold single-hex locations —
   * Secret Realm, Sword Mound, Merchant Guild Post, …; the 2 Equipment
   * outfitters keep their extra `equipment` gate on top). Mirrors
   * `WogModOptions.newObjects`.
   *
   * LEGACY SEMANTICS — absent === ON: old snapshots and campaign chapters set
   * `anime.enabled: true` WITHOUT this flag and must keep receiving anime
   * Field-Override content, so every runtime gate reads `mapObjects !== false`
   * (not `=== true`). `DEFAULT_ANIME_OPTIONS` sets it `true`; it is harmless
   * while `enabled: false` because every anime gate also requires `enabled`.
   */
  mapObjects: boolean;
  /**
   * Forced Battle Events (§3.12): the anime CONTENT (Bí Cảnh combat scripts) that
   * runs scripted events at combat-start / round-start on an anime field. The
   * mechanism is CORE; this flag gates only the anime scripts.
   *
   * LEGACY SEMANTICS — absent === ON (mirrors `mapObjects`): old anime snapshots
   * set `enabled: true` without this flag and must keep firing the scripts, so
   * the runtime gate reads `combatEvents !== false`. `DEFAULT_ANIME_OPTIONS` sets
   * it `true`; harmless while `enabled: false` (every anime script gate also
   * requires `enabled`).
   */
  combatEvents: boolean;
  /** Ninefold Realms towns. */
  xianxiaTowns: boolean;
  secretRealms: boolean;
  xianxiaNeutrals: boolean;
  /** Optional Doom neutral-monster slice; explicit checkbox, default OFF. */
  doomNeutrals?: boolean;
  elixirPills: boolean;
  cultivation: boolean;
  destiny: boolean;
  /** Otherworld Gate towns / systems. */
  isekaiTowns: boolean;
  isekaiNeutrals: boolean;
  guild: boolean;
  monsterWaves: boolean;
  raidBosses: boolean;
  dungeon: boolean;
  gods: boolean;
  xianxiaArtifacts: boolean;
  heartDemon: boolean;
  /**
   * Hero Grades (shared spine, §3.11): a per-hero power ranking (Merit → grade
   * 0-3) that unlocks a small passive/skill TREE. Shared by BOTH packages and
   * ALL heroes; independent of Cultivation. Default OFF ⇒ byte-identical.
   */
  heroGrades: boolean;
  /**
   * Equipment (shared spine, §3.13): always-on hero ITEMS (weapon/armor/
   * accessory) bought at outfitter Field Overrides — distinct from Artifact
   * cards (no hand, no cast, one per slot, swap-to-bag on buy). Shared by BOTH
   * packages and ALL heroes; independent of Hero Grades / Cultivation.
   * Default OFF ⇒ byte-identical (no shops in the pool, no state stamped).
   */
  equipment: boolean;
  /**
   * Unit Stacks (anime road, §5.2): the ANIME entry into the EXISTING Polish
   * army unit-stack machinery (Pack/Neutral cards buy persistent Group layers at
   * the Citadel — +1 Attack while any layer remains, each layer absorbing one
   * lethal blow). One machinery, one pricing (`polishArmyUnitStackCost`): with
   * either this OR `houseRules["polish-unit-stacks"]` on, `armyUnitStacksActive`
   * is true. Default OFF, opt-in (`=== true`, no legacy semantics — new).
   */
  unitStacks: boolean;
  /**
   * Unit Experience (anime-mod surface of the shared veterancy system): army
   * unit cards gain experience and veteran ranks. Same engine as the WOG /
   * lobby toggles — any one of the three activates it (unit-experience.ts). XP
   * lives on the army card (`ArmyUnitState.experience`), folded at combat build.
   */
  unitExperience?: boolean;
  /**
   * Neutral Rank-Up (anime-mod surface of the shared optional module): NEUTRAL
   * guards gain veteran ranks as the game ages (rounds) and Stacked Creature-Bank
   * defenders fight one rank up. Same engine as the WOG toggle — either activates
   * it. Types + resolution only (no anime lobby UI). See unit-experience.ts.
   */
  neutralRankUp?: boolean;
  /** Calamity wave cadence when monsterWaves is on. */
  waveCadence?: 3 | 4 | 5;
  /** Shared monster/map-object theme for Waves, Raid Bosses and the Dungeon. */
  pveTheme?: PveEncounterTheme;
  /** Standard rewards/pillage, or a richer and more punishing brutal profile. */
  wavePressure?: WavePressure;
  /** Optional elimination after this many lost waves; 0 = pillage only. */
  waveDefeatLimit?: WaveDefeatLimit;
  /** Scheduled Rift Lair arrival (the warning appears one round earlier). */
  raidBossSpawnRound?: RaidBossSpawnRound;
  /** Five-floor expedition or the full ten-floor delve. */
  dungeonDepth?: DungeonDepth;
  /** Movement paid for each immediate descent after a floor win. */
  dungeonDescentCost?: DungeonDescentCost;
};

/**
 * One live Raid Boss (§6.5): a persistent multi-layer world boss lairing on a
 * map field. Wounds persist between attempts (and across snapshots) via
 * `layersLeft`; `layerBreaks` is the per-player payout ledger.
 */
export type RaidBossState = {
  /** Catalog boss id (src/data/anime/bosses.ts) or a preset custom-boss id. */
  defId: string;
  fieldId: MapSpaceId;
  /** Health bars remaining (the mint = 1 body + layersLeft-1 stack layers). */
  layersLeft: number;
  /** Layers broken per player — each break paid 2 gold immediately. */
  layerBreaks: Record<PlayerId, number>;
  spawnedRound: number;
  /** Set for the lobby-scheduled spawn (vs a designer-placed lair). */
  scheduled?: true;
  /** Set once slain; the lair field is cleared and the entry stays as a record. */
  slainBy?: PlayerId;
};

/**
 * Anime Equipment (§3.13): the hero equipment slots, as a SINGLE ordered
 * source-of-truth constant every consumer iterates (hero-board chips, the slot
 * glyph registry, catalog/data tests). An item occupies one slot; buying into an
 * occupied slot moves the previous item into the equipment bag (no refund). "mount" is the 4th slot
 * (new equipment types) — legacy 3-slot snapshots load fine (absent === empty).
 * Add a slot here and TypeScript forces every Record<AnimeEquipmentSlot, …> to
 * cover it.
 */
export const ANIME_EQUIPMENT_SLOTS = ["weapon", "armor", "accessory", "mount"] as const;
export type AnimeEquipmentSlot = (typeof ANIME_EQUIPMENT_SLOTS)[number];

/**
 * How pool-drawn Field Overrides place when a tile is revealed.
 * Designer pins never refuse. Global feature — not anime-mod-specific.
 */
export type FieldOverridePlacementMode = "random" | "manual" | "manual-or-refuse";
/**
 * How the scenario is won:
 *  - "conquest": flag an enemy faction Town (the classic skirmish goal).
 *  - "grail" (Holy Grail): win by capturing the Grail — defeat a Lvl-VII guard,
 *    visit 2 distinct Obelisks, dig for 1 movement point, then carry it home —
 *    or by beating every enemy hero in combat at least once (only 2 of them in
 *    a 4-player game). The map seeds up to 2 Grail tiles and at least 2
 *    Obelisks (designer presets count). The Dragon Utopia is NOT an objective
 *    here; it is just a creature bank.
 *  - "dragon-hunt": win by defeating the Dragon Utopia (no need to hold it) or
 *    by beating every enemy hero in combat at least once (only 2 in a 4-player
 *    game).
 *  - "dragon-conqueror": defeat the Dragon Utopia to capture it, then hold it.
 *    The holder garrisons it; rivals must besiege it (Walls, Gate, Arrow
 *    Tower) to take it. Controlling the Utopia at the start of your turn wins.
 */
export type VictoryMode = "conquest" | "grail" | "dragon-hunt" | "dragon-conqueror";

/**
 * Who goes first ({@link GameSetupOptions.playerOrderMode}, default "random").
 *  - "random": the rulebook setup step 22 Attack-die roll picks the first
 *    player and rotates the seat order to them, published through the opening
 *    ceremony overlay.
 *  - "manual": the host writes the whole turn order themselves
 *    ({@link GameSetupOptions.manualPlayerOrder}); NO die is rolled and the
 *    ceremony never arms — the order is announced in the feed instead.
 */
export type PlayerOrderMode = "random" | "manual";

/**
 * Center-tile Ⅶ objective designation ({@link CustomMapTilePlan.viiField}).
 *   - "town" → Random Town (`random_town`)
 *   - "settlement" → Random Settlement (a difficulty-7 Settlement)
 *   - "dragon_utopia" → Dragon Utopia
 *   - "grail" → Holy Grail dig site
 */
export type ViiFieldDesignation = "town" | "settlement" | "dragon_utopia" | "grail";

/** Holy Grail: distinct Obelisks a player must visit before they may dig. */
export const GRAIL_OBELISKS_REQUIRED = 2;

/**
 * Whether a player-vs-player Combat costs the fighters their dead units:
 *  - "normal": casualties are kept — destroyed unit cards leave the army and
 *    damaged Packs flip to Few (the rulebook outcome).
 *  - "none": a friendly-fight option — after a PvP Combat ends, neither side
 *    loses any unit cards or has a Pack downgraded. The fight still resolves a
 *    winner (and the loser still pays gold, loses morale and retreats home);
 *    only the troops are spared. Does not affect fights against Neutral guards.
 */
export type PvpTroopLoss = "normal" | "none";

/**
 * How the Dragon Utopia (the Dragon Hunt / Dragon Conqueror win-condition
 * objective) is guarded.
 *  - "by-difficulty" (the DEFAULT): the Utopia is guarded like any other Field
 *    Difficulty Ⅶ field — the COMPLETE table row for the game difficulty, tiers
 *    included (Easy 1 azure / Normal 2 azure / Hard 1 gold + 2 azure /
 *    Impossible 2 gold + 2 azure), DRAWN from the Neutral tier decks and
 *    recycled to their discards at combat end like any guard army. So the
 *    guards are NOT necessarily the four dragons, and (being ordinary deck
 *    draws) they can be swapped by the pre-battle Judge Dread / Groovy Satyr /
 *    Visions windows.
 *  - "four": the explicit scenario party — the four dragons (Azure + Rust +
 *    Crystal + Faerie), MINTED for the fight so the azure deck is never
 *    touched, with the featured lead slot randomised per game to Azure or Rust
 *    so the encounter always leads with one of those two. Whatever the
 *    difficulty, all four stand.
 * Absent on older snapshots; treated as "by-difficulty".
 */
export type DragonUtopiaGuards = "four" | "by-difficulty";
export type FactionId =
  | "castle"
  | "rampart"
  | "inferno"
  | "necropolis"
  | "dungeon"
  | "stronghold"
  | "fortress"
  | "tower"
  | "conflux"
  | "cove"
  | "bulwark"
  | "factory"
  | "fuyuki"
  | "azure_breeze"
  | "hidden_leaf"
  | "azur_lane"
  | "heavenly_demon"
  | "little_busters"
  | "mgq";

export type TargetRef =
  | { type: "unit"; unitId: UnitId }
  | { type: "space"; position: number }
  | { type: "none" };

export type SourceRef =
  | { type: "card"; cardId: CardId; controllerId: PlayerId }
  | { type: "unit"; unitId: UnitId; controllerId: PlayerId }
  | { type: "system" };

export type DamageKind = "attack" | "spell" | "effect";
export type UnitType = "ground" | "ranged" | "flying";
export type UnitGrade = "bronze" | "silver" | "gold" | "azure";
export type CombatStat = "attack" | "defense" | "power";
export type CardPlayMode = "basic" | "expert";
export type SpellLevel = "basic" | "expert";
export type SpellSchool = "air" | "earth" | "fire" | "water" | "any";
export type ArtifactTier = "minor" | "major" | "relic";
export type StatisticType = "attack" | "defense" | "power" | "knowledge";
export type AbilityClass = "might" | "magic" | "economy" | "adventure" | "combat";
export type AttackRollMode = "normal" | "advantage" | "disadvantage";
export type ResourceKind = "gold" | "buildingMaterials" | "valuables";
export type ResourceCost = Partial<Record<ResourceKind, number>>;

export type TargetDefinition =
  | {
      type: "enemy-unit";
      unitTypes?: UnitType[];
      damagedOnly?: boolean;
      /**
       * Artillery: restrict the legal targets to the enemy unit(s) with the
       * lowest (effective) initiative. A single slowest enemy is the only legal
       * target; a tie offers each tied unit so the controller picks which is hit.
       */
      lowestInitiativeOnly?: boolean;
    }
  | {
      type: "friendly-unit";
      unitTypes?: UnitType[];
      damagedOnly?: boolean;
      /**
       * Bowstring of the Unicorn's Mane: the chosen ranged unit must not have
       * been activated yet this combat round (it is about to take its turn).
       */
      notActivatedThisRound?: boolean;
      /**
       * Ingham's Zealots VI: the effect lands only on a unit whose name matches
       * (his "your Zealots unit") — matched with the same family/"or" logic the
       * specialty-doubling uses, so the option is offered only when you field one.
       */
      unitName?: string;
    }
  | {
      type: "any-unit";
      unitTypes?: UnitType[];
      damagedOnly?: boolean;
      /**
       * Tarnum (Dungeon)'s Dragons VI: the effect lands only on a unit (friend or
       * foe) whose name matches — his "a Dragons unit" — using the same family /
       * "or" match the specialty-doubling uses.
       */
      unitName?: string;
    }
  /** Summon spells: a chosen empty space on the combat board. */
  | { type: "empty-space" }
  /** Inferno: any space on the combat board (occupied or not). */
  | { type: "any-space" }
  /**
   * Dispel: any unit, OR a board space holding a removable obstacle/trap token
   * (Force Field / Fire Wall / Quicksand / Land Mine). On a unit it also clears
   * the space the unit occupies.
   */
  | { type: "unit-or-obstacle" }
  | { type: "none" };

export type EffectDurationDefinition =
  | { type: "instant" }
  | { type: "current-combat-round" }
  | { type: "next-combat-round" }
  | { type: "combat-rounds"; rounds: number }
  | { type: "current-turn" }
  /** Luck / Torosar's Ballista IV: until the end of this game round. */
  | { type: "current-game-round" }
  /**
   * Mirth (Power 0): "during this Activation". Lasts until the end of the
   * activation in progress when the effect is created (bound to the unit that
   * is active at creation time).
   */
  | { type: "current-activation" }
  /**
   * Forgetfulness: "during its next activation". Lasts until the end of the
   * targeted unit's next activation (bound to the effect's target unit).
   */
  | { type: "next-activation" }
  | { type: "combat" }
  | { type: "permanent" };

export type ActiveEffectModifier =
  | {
      type: "ATTACK_BONUS";
      amount: number;
    }
  | {
      type: "SPELL_POWER_BONUS";
      amount: number;
    }
  | {
      type: "SPECIALTY_IMMUNITY";
    }
  | {
      type: "DEFENSE_BONUS";
      amount: number;
    }
  | {
      /**
       * Combat-long max Health (Valeska / Vial of Lifeblood / Ivor VI…). The
       * amount is ALSO folded into `CombatUnitState.combatMaxHealthBonus` so
       * Pack→Few and stack-layer recomputes keep the HP; this modifier is the
       * ongoing-effect entry for the combat effects panel / dispel paths.
       */
      type: "HEALTH_BONUS";
      amount: number;
      /**
       * This bonus protects only the unit's current health bar. It is consumed
       * when a Stack layer, Stack Token, or Pack side is defeated instead of
       * being folded onto the newly revealed bar.
       */
      currentUnitLifeOnly?: boolean;
    }
  | {
      /**
       * Merist's Stone Skin VI: a player-scoped, combat-duration flag. While the
       * controller has it, their units' Defense tokens grant the +1 Defense on a
       * "0" OR a "+1" Defense-die roll (instead of only on a "+1"). Carries no
       * amount; resolveDefendBonus reads its presence on the defender's owner.
       */
      type: "DEFENSE_TOKEN_ON_ZERO";
    }
  | {
      type: "RANGED_ATTACK_BONUS";
      amount: number;
      nonAdjacentOnly: boolean;
    }
  | {
      type: "RANGED_INITIATIVE_BONUS";
      amount: number;
    }
  | {
      /**
       * Necklace of Swiftness (option A): "During this Combat, the initiative of
       * all your ground units is increased by 1." A player-scoped, combat-duration
       * effect; the bonus lands on the controller's GROUND units only (flying and
       * ranged units are untouched), mirroring how RANGED_INITIATIVE_BONUS gates
       * on the unit's own type. Read in effectiveInitiative.
       */
      type: "GROUND_INITIATIVE_BONUS";
      amount: number;
    }
  | {
      /**
       * Polish Balance Pack Necklace of Swiftness: the reprint's ground buff also
       * reads "and they can move 1 more space". The GROUND twin of
       * MOVEMENT_BONUS — read in `getUnitMoveRange` for the controller's GROUND
       * units only, and (like the Balance-Pack Haste/Slow) it applies whatever
       * the `combat-move-initiative` house rule says, because the reprinted card
       * PRINTS the movement half.
       */
      type: "GROUND_MOVEMENT_BONUS";
      amount: number;
    }
  | {
      /**
       * Polish Balance Pack Golden Bow: while the Bow's ongoing effect lives, the
       * owner's RANGED units may reroll 1 Attack die on each of their attacks
       * (the Ammo Cart reading of "once per turn" — the source is rebuilt per
       * attack). Read in `buildRerollSources`.
       */
      type: "RANGED_ATTACK_REROLL";
    }
  | {
      /**
       * Polish Balance Pack Hourglass of the Evil Hour (option B): for this
       * combat round, each "+1" on the EFFECT OWNER'S ENEMIES' Attack dice is
       * rerolled once. The `reroll_plus_one` Negative-Morale curse, scoped to a
       * combat round and pointed at the other side. Read in
       * `applyEnemyPlusOneRerolls`.
       */
      type: "REROLL_ENEMY_PLUS_ONE";
    }
  | {
      type: "ATTACK_DIE_REROLL";
      maxUsesPerRoll: number;
      consumeEffectOnUse: boolean;
    }
  | {
      // The First Aid Tent always heals exactly this much once per combat round.
      // The expert "heal 3×" is NOT a property of the Tent: it is the First Aid
      // ability card's expert side (FIRST_AID_TENT_VOLLEY), gated on holding that
      // card — mirroring how the Ballista's 3× volley lives on Artillery.
      type: "HEAL_ONCE_PER_COMBAT_ROUND";
      amount: number;
    }
  | {
      type: "UNIT_CANNOT_MOVE";
    }
  | {
      /**
       * Forgetfulness: while held, the unit cannot perform an Attack action
       * (it may still move). Lasts its next activation (the "next-activation"
       * duration removes it when that activation ends).
       */
      type: "UNIT_CANNOT_ATTACK";
    }
  | {
      /**
       * Polish Balance Pack Forgetfulness (Power 1/2): while held, the unit
       * cannot make a RANGED attack — a melee strike is still allowed (the
       * classic UNIT_CANNOT_ATTACK blocks every attack). Read at the same
       * attack-legality seam.
       */
      type: "UNIT_CANNOT_RANGED_ATTACK";
    }
  | {
      /**
       * Polish Balance Pack Forgetfulness (Power 0): while held, the unit's
       * RANGED attack value is halved (rounded up). Read in the attack maths
       * beside the other attack modifiers; a melee strike is untouched.
       */
      type: "RANGED_ATTACK_HALVED";
    }
  | {
      /**
       * Polish Balance Pack Bless: while held, the unit's attacks ignore the
       * Attack die roll (the classic one-attack Bless instant, made lasting).
       * Read at the same `details.ignoreAttackDie` seam the instant sets.
       */
      type: "IGNORE_ATTACK_DIE_ROLL";
    }
  | {
      /**
       * Berserk: while held (its next activation), the unit MUST attack the
       * nearest unit — friend or foe — or move toward it and attack it. The
       * legal-action layer drops every other action (no free move, defend or
       * ability) and the neutral AI targets the nearest unit instead of by
       * tier; `canUnitAttack` lets the berserked unit strike its own allies
       * (the attacked ally still retaliates). Bound to the unit's next
       * activation (the "next-activation" duration removes it when that
       * activation ends).
       */
      type: "BERSERK_FORCED_ATTACK";
    }
  | {
      /**
       * Shackles of War (house rule): while held, the affected player's Hero
       * cannot *Surrender* the current Combat. Retreat (and a fought-out loss)
       * is unaffected. Player-scoped, lasts the Combat.
       */
      type: "CANNOT_SURRENDER_COMBAT";
    }
  | {
      /**
       * Luck-style rerolls of the adventure dice. "any" also lets the
       * attack-die reroll flow consume this effect (Expert Luck).
       */
      type: "ADVENTURE_DIE_REROLL";
      dice: "treasure" | "resource" | "any";
      /**
       * Fortune: a shared budget of N rerolls across this effect's adventure
       * dice (Power 0/1/2 -> 1/2/3), spent one at a time. When omitted (Luck),
       * the once-per-die-type model applies instead.
       */
      rerolls?: number;
    }
  | {
      /**
       * Cards of Prophecy ("Set a Resource die or Treasure die on the side of
       * your choice"): instead of taking the rolled face of an adventure die,
       * the controller may set that die to any of its faces. "any" covers both
       * the Resource and the Treasure die. A single use — the whole effect is
       * spent the moment a die is set (mirrors the single-use "any" Luck
       * reroll), so the choice is offered once per played card.
       */
      type: "ADVENTURE_DIE_SET";
      dice: "treasure" | "resource" | "any";
    }
  | {
      /**
       * Melodia's Fortune VI ("During this turn, the number of dice you roll and
       * resolve at locations is increased by 1"): a current-turn, player-scoped
       * effect read in interactionToSteps — every Treasure/Resource die a location
       * makes the controller roll this turn is increased by `amount`.
       */
      type: "LOCATION_DICE_BONUS";
      amount: number;
    }
  | {
      /**
       * Ammo Cart: the affected ranged units ignore every ranged-attack
       * penalty (adjacent shots and opposite-back-row shots roll normally).
       */
      type: "RANGED_IGNORE_ALL_PENALTIES";
    }
  | {
      /** Haste / Slow / Cape of Velocity: shifts a unit's activation order. */
      type: "INITIATIVE_BONUS";
      amount: number;
    }
  | {
      /**
       * House rule (BINH only): Haste / Slow effects also shift a unit's Combat
       * movement range by `amount` (Haste +1, Slow −1; floored so a unit always
       * moves at least 1). Read in getUnitMoveRange under the BINH ruleset only,
       * so Legacy stays rulebook-faithful (movement is a fixed 3 / ranged 1).
       */
      type: "MOVEMENT_BONUS";
      amount: number;
    }
  | {
      /**
       * Miku Voice of Angel IV: while this player-scoped effect lasts, after any
       * of the owner's units is attacked (and still living with damage), heal
       * this many damage points on that defender (DAMAGE_HEALED event).
       */
      type: "HEAL_AFTER_ATTACKED";
      amount: number;
    }
  | {
      /**
       * Cyra's Haste VI: the unit gains this much Defense, but only against
       * attacks made by a unit with strictly lower (effective) Initiative.
       */
      type: "DEFENSE_VS_LOWER_INITIATIVE";
      amount: number;
    }
  | {
      /**
       * WOG commander Haste/Slow riders: the affected unit's Attack shifts by
       * `amount` (signed) when it attacks a target whose effective Initiative
       * is strictly lower ("slower") / higher ("faster") than its own.
       * Shaman's Haste: +1 vs slower; Sea Marshal's Slow: -1 vs faster.
       */
      type: "ATTACK_BONUS_VS_INITIATIVE";
      comparison: "slower" | "faster";
      amount: number;
    }
  | {
      /**
       * Astral Spirit commander (Counterstrike): while held, the unit may
       * retaliate any number of times per combat round — the active-effect
       * twin of the ALLOW_UNLIMITED_RETALIATION unit ability.
       */
      type: "UNLIMITED_RETALIATION";
    }
  | {
      /**
       * Ash's Bloodlust IV: the ONGOING card's printed "Place a Black cube on
       * that unit" — because the card stays in play for the Combat, the cube
       * rides it and never lifts at a round start (USER RULING 2026-08-12:
       * "IV is ongoing and place black cube means that unit can never
       * retaliate"). While this effect lives the unit cannot perform ANY
       * Retaliation Attack — the veto beats even unlimited retaliation.
       * Dispelling the effect (it is removable) lifts the lock with the buff.
       */
      type: "CANNOT_RETALIATE";
    }
  | {
      /**
       * Shield / Air Shield: extra Defense that applies only against an attacker
       * of a given UNIT TYPE — "ground-or-flying" (Shield) matches any non-ranged
       * attacker; "ranged" (Air Shield) matches a ranged attacker. Lasts the
       * Combat and is read in getAttackerTypeDefenseBonus during the attack maths.
       */
      type: "DEFENSE_VS_ATTACKER_TYPE";
      attackerType: "ground-or-flying" | "ranged";
      amount: number;
    }
  | {
      /**
       * Torosar's Ballista IV/VI: while held, the controller fields one extra
       * Ballista — it fires at every combat-round start and counts toward
       * "activate all your Ballistas". One modifier per granted Ballista.
       */
      type: "EXTRA_BALLISTA";
    }
  | {
      /**
       * Gerwulf's Ballista VI (ongoing): while the controller holds this
       * (player-scoped, combat duration), their Ballista's round-start shot
       * targets an enemy unit of THEIR choice — every living enemy is a
       * candidate — instead of being forced onto the lowest-initiative enemy.
       */
      type: "BALLISTA_CHOOSE_TARGET";
    }
  | {
      /**
       * Crag Hack's Offense VI: "For this Combat, every card you play can grant
       * +1 attack instead of its regular effect." While this player-scoped, combat
       * aura is up, the controller may discard any held card during one of their
       * unit's attacks to add `amount` to that attack (CONVERT_CARD_TO_ATTACK).
       */
      type: "CARDS_AS_ATTACK_BONUS";
      amount: number;
    }
  | {
      /** Anti-Magic: the unit cannot be targeted by spells (up to a tier). */
      type: "UNIT_SPELL_IMMUNE";
      maxGrade: UnitGrade;
    }
  | {
      /** Fire Shield: adjacent attackers take damage after their attack. */
      type: "FIRE_SHIELD";
      amount: number;
    }
  | {
      /** Scouting: the next Search(X) becomes Search(count). Consumed on use. */
      type: "SEARCH_COUNT_OVERRIDE";
      count: number;
      /**
       * Polish Balance Pack (`polish-card-balance`): the reprinted Scouting reads
       * "do Search (X+2) instead", i.e. RELATIVE to the Search's own base rather
       * than the flat `count`. Both printings live on the modifier and the RULE
       * decides which one is read — `searchCountOverrideFor` (ruleset.ts) is the
       * single seam, so the offer label and the reveal can never disagree.
       */
      balanceDelta?: number;
      /**
       * Polish Balance Pack: the reprinted EXPERT Scouting widens EVERY Search
       * "until the end of this turn" instead of only the next one, so the
       * override is not consumed on use (its `current-turn` duration ends it).
       */
      balancePersist?: boolean;
    }
  | {
      /** Pendant of Courage: repeat the next Search action once. */
      type: "SEARCH_REPEAT_ONCE";
    }
  | {
      /**
       * Crest of Valor (option B, map): "Ignore negative morale effect from a
       * field." A player-scoped, current-turn shield spent the next time a Field
       * the player visits would hand them a negative Morale token — the
       * GAIN_MORALE visit-step checks for and consumes this effect (single use)
       * instead of lowering Morale. Combat-loss Morale is unaffected: only the
       * field visit-step reads it.
       */
      type: "IGNORE_FIELD_NEGATIVE_MORALE";
    }
  | {
      /**
       * Basic Air/Earth/Fire/Water Magic (permanent): instead of searching a
       * Spell deck, fetch its first spell of this school.
       */
      type: "SPELL_SCHOOL_FETCH";
      school: SpellSchool;
    }
  | {
      /** Necklace of Dragonteeth: extra Spell cards per combat round. */
      type: "SPELL_LIMIT_BONUS";
      amount: number;
    }
  | {
      /**
       * Intelligence: while held this Combat the controller may cast a Spell at
       * any time — even off-turn, without one of their own units being active
       * (it lifts the activation-timing gate, not the open-window rule). The
       * expert side also sets `ignoreSpellLimit`, so the per-combat-round Spell
       * limit no longer applies to that player.
       *
       * Polish Balance Pack (`polish-card-balance`): the reprinted Intelligence
       * sets `oneShot`, so the freedom grants EXACTLY ONE free Spell cast — the
       * effect is consumed by the first Spell the holder casts (noteSpellCast),
       * after which a second Spell needs the ordinary allowance again. The
       * classic card leaves `oneShot` unset and keeps its whole-window freedom.
       */
      type: "SPELL_CAST_ANYTIME";
      ignoreSpellLimit?: boolean;
      oneShot?: boolean;
    }
  | {
      /**
       * Angel Wings / Fly: this turn the player's Heroes may move through
       * blocked fields (passing over them, never stopping on one). Read by the
       * adventure pathfinding (canCrossEdge / classifyHeroStep).
       */
      type: "HERO_MOVE_THROUGH";
    }
  | {
      /**
       * Angel Wings: "can move through ANY fields without resolving them. The
       * last visited field must be resolved normally." Every field along the way
       * — Neutral guards, enemy Heroes, unvisited locations, enemy flags — is
       * walked OVER with nothing triggered; only the field the walk ENDS on
       * resolves. A strict superset of Pathfinding's pass-through, and separate
       * from HERO_MOVE_THROUGH (blocked fields) which Fly / Dessa's Logistics VI
       * grant on their own: those two print blocked fields ONLY and must not gain
       * this. Read by the adventure pathfinding (classifyHeroStep).
       */
      type: "HERO_PASS_ANY_FIELD";
    }
  | {
      /**
       * Water Walk: this turn the player's Heroes may enter, cross and stop on
       * sea (water-terrain) fields. Read by the adventure pathfinding.
       */
      type: "HERO_WATER_WALK";
    }
  | {
      /**
       * Pathfinding ability (BINH house rule). For this turn the player's Heroes:
       *  - Basic: may move *through* fields holding Neutral Units or enemy Heroes
       *    without resolving them (Combat begins only if they END their movement
       *    there), and over yellow (sealed) borders and blocked fields (never
       *    ending on a blocked field — same "pass-over" rule as Fly).
       *  - Expert (`expert: true`): also gains all of the above PLUS may cross the
       *    coastline (land↔sea) with no halt, and may step directly between a
       *    Surface and a Subterranean Tile without a Subterranean Gate — which
       *    neither Dimension Door nor Fly can do.
       * Translated into movement capabilities by getHeroMovementCapabilities and
       * read by the adventure pathfinding (canCrossEdge / classifyHeroStep).
       */
      type: "HERO_PATHFINDING";
      expert?: boolean;
    }
  | {
      /** Logistics (basic): step to an adjacent empty field at end of turn. */
      type: "END_TURN_ADJACENT_MOVE";
    }
  | {
      /** Golden Bow: your ranged units ignore the long-range penalty. */
      type: "RANGED_IGNORE_PENALTY";
    }
  | {
      /**
       * Moandor's Liches VI specialty: while held, the unit deals "elemental
       * damage" — like the elemental units' printed trait. Its attack value
       * can no longer be raised by attack cards (Bloodlust, Offense, the
       * Attack statistic, Bless's bonus…) or Attack tokens; debuffs such as a
       * Sorceress' Weakness still lower it.
       */
      type: "ELEMENTAL_DAMAGE";
    }
  | {
      /**
       * Zydar's Sorcery VI (ongoing): until the end of the Combat round,
       * the owner draws this many cards after each Spell they cast.
       */
      type: "DRAW_ON_SPELL_CAST";
      amount: number;
    }
  | {
      /**
       * Orb of Vulnerability (option A): for the rest of the Combat every unit's
       * innate special ability "related to spells" is switched off — magic
       * resistance (the Dwarves' die roll), spell-damage reduction (Golems,
       * Black Dragons, the Unicorns' aura), printed spell-school immunity
       * (Elementals, Efreet, Phoenix…) and the Pegasi's enemy-spell Power drain.
       * Combat-scoped and side-agnostic, so a single grant covers both armies.
       * (Anti-Magic is a Spell-granted effect, not a unit ability, so it stays.)
       */
      type: "SUPPRESS_SPELL_ABILITIES";
    }
  | {
      /**
       * Elemental Orbs (Orb of Driving Rain / Silt / Tempestuous Fire / the
       * Firmament), option A: while the owner holds this combat-scoped effect,
       * the effective Power of every Spell they cast from the matching School
       * (and the school-agnostic "any" spells, exactly as the +Power boosts
       * treat them) is doubled before any enemy Power reduction. Two orbs of the
       * same school would compound (×4), but the printed set ships one of each.
       */
      type: "SPELL_POWER_DOUBLE";
      school: SpellSchool;
    }
  | {
      /**
       * Adrienne's Fire Magic specialty: while the owner holds this combat-scoped
       * effect, every Spell they cast from the matching School (and the
       * school-agnostic "any" spells, exactly as SPELL_POWER_DOUBLE treats them)
       * is cast with this much extra Power. Stacks additively across copies and
       * with the once-per-cast Power-card bonus; read in getCurrentSpellPower.
       */
      type: "SPELL_SCHOOL_POWER_BONUS";
      school: SpellSchool;
      amount: number;
    }
  | {
      /**
       * Pendant of Second Sight, option A: the selected unit "cannot gain a
       * Paralysis token during this Combat". A unit-scoped, combat-duration
       * immunity that blocks every Paralysis source — the Blind Spell
       * (PLACE_PARALYSIS) and the medusa-style attack/retaliation follow-ups —
       * exactly like the printed `ignore-paralysis` unit ability does.
       */
      type: "PARALYSIS_IMMUNITY";
    }
  | {
      /**
       * Lasting Spell-damage ward (Clancy's Unicorns specialty, CREATE_SPELL_WARD,
       * …). Summed into totalSpellDamageReduction alongside the Golems'/Black
       * Dragons' printed "reduce Spell damage" passives. NOTE: Interference /
       * Plate of the Dying Light are wiki `<instant>` and no longer create this
       * lasting modifier — they reduce THIS cast via stack interfereSpellReductions.
       */
      type: "SPELL_DAMAGE_REDUCTION";
      amount: number;
    }
  | {
      /**
       * Disrupting Ray: while held, the unit "cannot use their special ability".
       * getUnitAbilityDefinitions returns [] for a unit carrying this modifier,
       * so every ability read — attack follow-ups, passives, activation
       * abilities, printed immunities — sees nothing, for whatever abilities the
       * unit has now OR gains later, until the suppression ends. Combat-scoped
       * and removable (Dispel/Cure lift it). Read through effectAppliesToUnit, so
       * a Tower Titan/Gargoyle that ignores ongoing effects is not suppressed.
       */
      type: "UNIT_ABILITY_SUPPRESSED";
    }
  | {
      /**
       * Orb of Inhibition (option A): for the rest of the Combat every Spell and
       * Hero-Specialty CARD deals 0 damage — checked at the single card-damage
       * chokepoint (reducedCardDamage), so direct, area, Xyron and Chain Lightning
       * hits are all nullified for both armies. Unit-ability damage (the Faerie
       * bolt, retaliation) is NOT a card and is untouched; the Orb's option B
       * handles abilities separately. Global and side-agnostic, so one grant
       * covers everyone.
       */
      type: "NULLIFY_CARD_DAMAGE";
    }
  | {
      /**
       * Pendant of Negativity (option B): an ongoing, unit-scoped immunity to
       * Spells of the named School(s) cast on this unit — "ignore the effect of a
       * spell from the School of Air Magic cast on this unit". Like the printed
       * Elemental immunity it bars targeting and any area splash; a school-agnostic
       * spell ("any", e.g. Magic Arrow) counts as belonging to every School, so an
       * air immunity also turns Magic Arrow aside (mirroring this Pendant's own
       * cancel side and Protection from Air). Read through effectAppliesToUnit, so
       * a Tower Titan/Gargoyle that ignores ongoing effects is not protected by it.
       * NOT negated by Orb of Vulnerability (an artifact effect, not a unit
       * ability — exactly like Anti-Magic).
       */
      type: "SPELL_SCHOOL_IMMUNE";
      schools: SpellSchool[];
    }
  | {
      /**
       * Recanter's Cloak: a global, combat-scoped restriction on spell-casting
       * that binds BOTH heroes (the wearer included), enforced at the spell
       * resolution chokepoint (resolveTopStack) and the cast-offer gate.
       *   • `lockAll` (option B) — no Hero may cast any Spell this Combat.
       *   • `minPower` (option A) — a Spell that resolves below this Power has no
       *     effect, so "no Hero can use spells with Power 0" forces every cast to
       *     be boosted to Power ≥ 1 (minPower 1) to do anything.
       * Side-agnostic (scope "global"), so one grant covers both armies.
       */
      type: "SPELL_CAST_RESTRICTION";
      lockAll?: boolean;
      minPower?: number;
    }
  | {
      /**
       * Shaman's Puppet (option A): the affected unit rolls its Attack die with
       * "disadvantage" — it rolls two Attack dice and resolves the LOWER result
       * for every attack it makes — until the end of its activation. Read in
       * getAttackRollMode (the single roll-mode chokepoint), so it applies to the
       * unit's main attacks and move-and-attacks alike. Unit-scoped and removable;
       * a Tower Titan/Gargoyle that ignores ongoing effects shrugs it off through
       * effectAppliesToUnit, exactly like every other unit debuff.
       */
      type: "ATTACK_ROLL_DISADVANTAGE";
    }
  | {
      /**
       * The mirror of ATTACK_ROLL_DISADVANTAGE: the affected unit rolls two Attack
       * dice and resolves the HIGHER result. Read in getAttackRollMode at the same
       * chokepoint, on the same terms — so like the printed
       * `ATTACK_ROLL_ADVANTAGE` unit ability it OVERRIDES the ranged combat
       * penalty, and like every other unit buff it is skipped for a unit that
       * ignores ongoing effects (Titans/Gargoyles) via effectAppliesToUnit. A
       * FORCED disadvantage (Shaman's Puppet, the Nightmare's Fear) still beats
       * it — both are resolved before this.
       *
       * Only source today: the Polish Set Artifacts "rolls 2 dice and resolves
       * the higher result" tiers (Angelic Alliance 3 / Power of the Dragon
       * Father 2).
       */
      type: "ATTACK_ROLL_ADVANTAGE";
    }
  | {
      /**
       * Spirit of Oppression (option A): a global, combat-scoped lockout of every
       * Attack-die reroll for BOTH players — the printed "neither player can use
       * the positive morale token or reroll Attack dice". The positive morale
       * token is itself just an Attack-die reroll source in this engine
       * (buildRerollSources), so a single switch at that chokepoint covers both
       * clauses: while any NO_ATTACK_DIE_REROLL effect is on the table, no reroll
       * source (unit ability, Luck/Fortune/Mirth effect, or the morale token) is
       * offered to anyone. Side-agnostic (scope "global").
       */
      type: "NO_ATTACK_DIE_REROLL";
    }
  | {
      /**
       * Ingham's Zealots VI: while this (friendly) unit attacks, its target's
       * Defense counts as 0 (the printed "your Zealots unit ignores its targets'
       * Defense"). A unit-scoped, combat-duration modifier read at attack
       * resolution alongside the innate Behemoth/Manticore defense-pierce.
       */
      type: "IGNORES_DEFENSE";
    }
  | {
      /**
       * Lord Haart (Necropolis) Dread Knights IV: while this (friendly) unit is
       * the target of an enemy Retaliation Attack, that Retaliation Attack rolls
       * two Attack dice and resolves the lower — the active-effect twin of the
       * Dread Knights unit's printed RETALIATION_AGAINST_DISADVANTAGE ability.
       */
      type: "RETALIATION_AGAINST_DISADVANTAGE";
    };

export type ActiveEffectDefinition = {
  name: string;
  scope: "player" | "unit" | "global";
  modifiers: ActiveEffectModifier[];
  duration: EffectDurationDefinition;
  polarity?: "positive" | "negative" | "neutral";
  removable?: boolean;
  /**
   * Polish Balance Pack Forgetfulness: how many of the bound unit's activations
   * a "next-activation" effect survives (default 1).
   */
  activationsRemaining?: number;
  /**
   * Optional army-variant gate (Oidana VI's "all your neutral units" rally):
   * when set, the effect only touches combat units of this variant. Combined
   * with `scope: "player"` it means "this player's neutral-recruited units" —
   * checked in effectAppliesToUnit, so every stat getter honours it for free.
   */
  appliesOnlyToVariant?: CombatUnitState["variant"];
  /**
   * Polish Set Artifacts: WHICH set laid this effect (`ArtifactSetId`, kept as a
   * plain string so this types leaf never imports the card data back).
   *
   * PRESENTATION METADATA ONLY — no rule reads it. It exists so the battlefield
   * can draw the owning set's icon beside a unit that is carrying one of its
   * bonuses ("Angelic Alliance — rolls 2 Attack dice, keeps the higher"), which
   * the effect `name` alone could only guess at by string-matching.
   *
   * ABSENT on every non-set effect and on every legacy snapshot; the UI simply
   * draws no set icon then, so an old save renders exactly as it always did.
   */
  artifactSetId?: string;
  /** Optional grade gate (Alice I: enemy silver/gold units only). */
  appliesOnlyToGrades?: UnitGrade[];
  /** Optional side gate: the effect applies only to enemies of its controller. */
  appliesOnlyToEnemies?: boolean;
  /**
   * Polish Balance Pack (`polish-card-balance`) Intelligence: keep the source
   * card in the DISCARD pile instead of the "Permanents & Ongoing" tray while
   * this effect lives. `holdLiveOngoingCardsFromDiscard` skips it, so a one-shot
   * enabler (spent the instant it is played) never parks a physical card in the
   * ongoing pile. Absent on every other effect, so the tray behaviour of every
   * classic ongoing card is unchanged.
   */
  keepSourceInDiscard?: boolean;
};

export type EffectDefinition =
  | {
      type: "DEAL_DAMAGE";
      amount?: number;
      amountByPower?: Record<number, number>;
      damageKind: DamageKind;
    }
  | {
      type: "HEAL_DAMAGE";
      amount?: number;
      amountByPower?: Record<number, number>;
      /** Rion's Battlefield Medic: "then draw N card(s)" after the heal. */
      drawCards?: number;
      /**
       * Rion's Battlefield Medic VI: "… then draw 2 cards AND discard 1 card
       * from your hand." The printed order puts the DRAW first, so this is a
       * post-draw rider, NOT an up-front `cost.discardCards` — the drawn cards
       * may pay it, and the play is legal with the specialty as the only hand
       * card. Mirrors `DRAW_CARDS.thenDiscard`, resolved through the same
       * `openHandDiscardChoice` picker.
       */
      thenDiscard?: number;
      /**
       * Rion's Battlefield Medic IV/VI: "Remove … damage or paralysis …" — also
       * clears the target's Paralysis token (a heal of 0 still clears it).
       */
      removeParalysis?: boolean;
    }
  | {
      type: "HEAL_DAMAGE_AND_REMOVE_EFFECTS";
      amount?: number;
      amountByPower?: Record<number, number>;
      removePolarity: "negative" | "any-removable";
      /**
       * Cure: "Remove any effect or paralysis from the selected unit" — also
       * clears the target's Paralysis token (a heal of 0 still clears it).
       */
      removeParalysis?: boolean;
      /** Astra's Cure I: "… then draw N card(s)" after the cleanse. */
      drawCards?: number;
      /** Post-draw "and discard N card(s) from your hand" — see HEAL_DAMAGE.thenDiscard. */
      thenDiscard?: number;
    }
  | {
      type: "CANCEL_SPELL";
      maxPower?: number;
      expertIgnoresMaxPower?: boolean;
      /**
       * Protection from Air/Earth/Fire/Water: the cancel only applies to a spell
       * belonging to one of these Schools. A school-agnostic spell ("any", e.g.
       * Magic Arrow) counts as belonging to every School, so any Protection can
       * end it. Resistance leaves this undefined (it cancels any school).
       */
      schools?: SpellSchool[];
      /**
       * Protection from X gates on the cancelled spell's printed LEVEL, not its
       * power: the basic play cancels a Basic spell only; the expert play
       * (expertIgnoresMaxSpellLevel) cancels a Basic OR Expert spell.
       */
      maxSpellLevel?: "basic" | "expert";
      expertIgnoresMaxSpellLevel?: boolean;
      /**
       * Boots of Polarity: a chance-based cancel. When set, playing the reaction
       * rolls `count` Attack dice and the player keeps the best ("choose one");
       * the spell is ignored only if a kept die shows `successFace` (the "+1"
       * face, value 1). A failed roll still spends the card but lets the spell
       * resolve — unlike the deterministic Resistance/Protection cancels above.
       */
      diceRoll?: { count: number; successFace: number };
    }
  | {
      type: "DRAW_CARDS";
      amount: number;
      expertAmount?: number;
      /**
       * Charm of Mana / Shackles of War: after drawing, the player discards this
       * many cards from hand through a follow-up choice ("draw 2, then discard
       * 1"). When `thenDiscardDrawnOnly` is set the choice is limited to the
       * cards just drawn ("draw 2, keep 1, discard the other" — Shackles).
       */
      thenDiscard?: number;
      thenDiscardDrawnOnly?: boolean;
    }
  | {
      /**
       * "OR" cards (mostly artifacts): the player chooses exactly one of the
       * printed options when playing the card. Each option may carry its own
       * timing trigger (e.g. "+1 Power" is only useful while casting a spell,
       * while "Draw 1 card" is an anytime instant).
       */
      type: "CHOOSE_ONE";
      options: CardOptionDefinition[];
    }
  | {
      type: "ADD_COMBAT_STAT";
      stat: "attack" | "defense";
      amount: number;
      expertAmount?: number;
      /**
       * Polish Balance Pack Shield (Power 2): instead of a Defense bonus, the
       * defending unit "takes up to 3 damage" from the triggering attack — a
       * per-attack damage CAP on this one blow. The highest key at or below the
       * Power paid wins; when a cap applies the stat bonus is not added.
       */
      damageCapByPower?: Record<number, number>;
      /** Spell instants (Bloodlust, Stone Skin…): amount scales with Power. */
      amountByPower?: Record<number, number>;
      /** Sword of Judgement style: +1 per card paid via the option's cost. */
      perCostCard?: number;
      /** Offense/Armorer: "Then draw 1 card." */
      drawCards?: number;
      /**
       * Blackshard of the Dead Knight: "discard 1 card. If the discarded card
       * was a spell, draw 1 card." When set, the play draws 1 card only if one
       * of the cards paid through the option's `cost.discardCards` was a Spell.
       */
      drawIfCostCardSpell?: boolean;
      /**
       * Polish Balance Pack Blackshard of the Dead Knight: the reprint reads "If
       * the discarded card was a Cast a Spell, draw 1 card." BOOK-GATED — while
       * `polish-spell-book` is on this is the check that runs (owned Spells live
       * in the Book, so no raw Spell card is in hand to pitch); without the Book
       * the printed `drawIfCostCardSpell` check applies.
       */
      drawIfCostCardCastEnabler?: boolean;
      /** Sword of Hellfire / Shield of the Damned: the unit also takes damage. */
      selfDamage?: number;
      /**
       * The stronger side of the Gnoll artifacts: the boosted unit also takes a
       * lasting combat token until the end of the Combat, mirroring the bonus on
       * the other stat (each floored at 0 — "minimum 0"):
       *  - Buckler of the Gnoll King: "+2 defense, then -1 attack" → a Weakness
       *    token on the defending unit.
       *  - Greater Gnoll's Flail: "+2 attack, then -1 defense" → a Corrosion
       *    token on the attacking unit.
       */
      selfStatPenalty?: { stat: "attack" | "defense"; amount: number };
      /** Bloodlust/Golden Bow: only these unit types may receive the bonus. */
      unitTypes?: UnitType[];
      /**
       * Shield (the INSTANT defense buff): the bonus applies only when the
       * ATTACKER is of this unit type — "ground-or-flying" (Shield) bites any
       * non-ranged attacker, "ranged" any ranged one. Gated on the attacker's
       * type, NOT the buffed unit's (that is `unitTypes`), so the instant is
       * offered/applied only on a matching attack. Air Shield's whole-Combat
       * version is a CREATE_DEFENSE_BUFF `vsAttackerType` instead.
       */
      vsAttackerType?: "ground-or-flying" | "ranged";
      /** Precision: the shot also ignores the ranged combat penalty. */
      ignoreRangedPenalty?: boolean;
      /** Hero specialties: the bonus doubles when the named unit is involved. */
      doubleForUnitName?: string;
      /**
       * Ivor's Elves IV: the bonus doubles when the unit it lands on is of this
       * unit TYPE (his "doubles for a ranged unit") — the type-keyed sibling of
       * `doubleForUnitName`. The attacker is checked for an attack bonus, the
       * defender for a defense bonus, exactly like the name-keyed doubling.
       */
      doubleForUnitType?: UnitType;
      /**
       * Merist's Stone Skin I: this much EXTRA defense is added on top of
       * `amount` when the buffed (defending) unit is orthogonally adjacent to the
       * attacker — "+1 defense, and +1 more if it is adjacent to the attacker."
       * Only meaningful for a `defense` reaction played in the attack window.
       */
      extraIfAdjacentToAttacker?: number;
      /**
       * Cyra's Haste IV: the bonus doubles when the attacked unit has strictly
       * higher (effective) Initiative than the attacker — rewards striking
       * faster foes.
       */
      doubleIfDefenderInitiativeHigher?: boolean;
      /**
       * Gundula IV: the inverse — the bonus doubles when YOUR (attacking) unit has
       * strictly higher (effective) Initiative than the attacked unit ("doubles if
       * the unit's Initiative is higher than the attacked unit's").
       */
      doubleIfAttackerInitiativeHigher?: boolean;
      /**
       * Ash's Bloodlust I/VI: "Place a Black cube on that unit." A Black cube on
       * a unit's card means it has spent its Retaliation — it can no longer
       * perform a Retaliation Attack this round (Counterstrike's CLEAR_RETALIATION
       * removes it). On an attack-buff reaction (UNIT_ATTACK_DECLARED, self) the
       * cube lands on the buffed ATTACKER once the attack resolves: the engine
       * sets that unit's `retaliatedThisRound = true`.
       */
      placeBlackCube?: boolean;
      /**
       * Ash's Bloodlust VI: "and ignores Retaliation Attacks." For this single
       * buffed attack the defender does not retaliate (the one-off equivalent of
       * the `ignores-retaliation` unit ability).
       */
      ignoresRetaliation?: boolean;
      /** Granberia VI: legal only on the first own declared attack this combat. */
      firstOwnAttackOnly?: boolean;
      /**
       * Tarnum (Fortress) Basilisks VI: "your selected unit uses its special
       * ability regardless of the required roll's result." On the buffed attack
       * (UNIT_ATTACK_DECLARED, self) every die-gated after-attack ability fires as
       * if its face was rolled — wired through stackItem.forceAbilityRollsThisAttack.
       */
      forceAbilityRolls?: boolean;
    }
  | {
      /** Centaur's Axe: the attack die's outcome counts three times. */
      type: "TRIPLE_ATTACK_DIE";
      /**
       * Polish Balance Pack Centaur's Axe: "Ignore on '-1' result" — a rolled
       * "-1" is NOT tripled (it counts as a plain -1). Read at the single
       * attack-value seam (`getAttackDamagePreview`).
       */
      ignoreOnNegative?: boolean;
    }
  | {
      /**
       * Sandro's Cloak: the specialty card is physically placed on a matching
       * unit card and replaces its printed statistics (and silences its
       * printed abilities) until the covering card is defeated — across
       * combats. Defeat discards the specialty card and reveals whatever is
       * under it with the excess damage.
       */
      type: "TRANSFORM_UNIT";
      targetUnitName: string;
      targetVariants: ("few" | "pack")[];
      newName: string;
      attack: number;
      defense: number;
      health: number;
      initiative: number;
      cardImage?: string;
      /**
       * Cloak VI ("Legion"): the card may be placed on Few, Pack or even a
       * Horde, always stays on top of the stack, and the unit under it may
       * still be reinforced/upgraded while the Legion's statistics apply.
       */
      alwaysOnTop?: boolean;
      /**
       * Polish Balance Pack Sandro I / Vidomina IV: extra Attack the cover grants
       * while it sits on a Polish Unit-STACK ("When the card is played on the
       * Stack it gives additional +1"). Absent on every classic printing AND on
       * the Balance Sandro IV, whose face prints no such rider.
       */
      stackAttackBonus?: number;
    }
  | {
      /**
       * Necromancy: play after winning a Combat (never a Quick Combat) —
       * Reinforce a bronze or silver unit (expert: any unit) for half the
       * gold cost, rounded down. Necropolis heroes only.
       */
      type: "NECROMANCY_REINFORCE";
      /**
       * Vidomina's specialties pin the reinforce tier regardless of expert
       * crowns: I = "basic" (bronze/silver), VI = "expert" (any unit). When
       * omitted (the printed Necromancy ability) the played mode decides.
       */
      forceMode?: "basic" | "expert";
    }
  | {
      type: "ADD_SPELL_POWER";
      amount: number;
      expertAmount?: number;
      drawCards?: number;
      /** Wisdom expert: this reaction also raises this round's Spell limit. */
      spellLimitBonus?: number;
      /**
       * Polish Balance Pack Dragon Wing Tabard / Spirit of Oppression: "+1 SP,
       * draw 1 card then discard 1 card." The discard runs AFTER the draw (the
       * printed order), so the just-drawn card is a legal candidate — the same
       * `drawRiderThenDiscard` rider the medic specialties use.
       */
      thenDiscard?: number;
      /** Breastplate of Brimstone: +1 more per card paid via the cost. */
      perCostCard?: number;
      /** Elemental Magic abilities: only spells of this school qualify. */
      schoolOnly?: SpellSchool;
    }
  | {
      /**
       * Tome of Air/Earth/Fire/Water (option B): "When playing a {School} Magic
       * spell, resolve its effect without paying the Power cost." Played as a
       * SPELL_CAST_STARTED self reaction during a turn/scroll cast of a matching
       * spell, it lifts that cast to the spell's maximum Power breakpoint for
       * free (added through the normal Power channel, so every readout, the
       * Resistance gate and a Mysticism recall stay consistent). A
       * school-agnostic "any" spell qualifies for any Tome.
       */
      type: "SET_SPELL_POWER_MAX";
      schoolOnly: Exclude<SpellSchool, "any">;
    }
  | { type: "GAIN_MORALE"; amount: number; expertDrawCards?: number }
  | {
      /**
       * Pandora's Gift: Recruits — "Draw `count` cards from the Neutral Unit deck.
       * You may Recruit one of them for half its recruit cost (rounded up)." A map
       * play: draws `count` units from the `tier` Neutral deck, offers a one-of pick
       * at half cost, and returns the cards not recruited to that deck's discard.
       */
      type: "DRAW_NEUTRAL_RECRUIT_OFFER";
      count: number;
      tier: "bronze" | "silver" | "gold" | "azure";
    }
  | {
      /** Estates, gold/resource artifacts: gain resources immediately. */
      type: "GAIN_RESOURCES";
      gain: ResourceCost;
      expertGain?: ResourceCost;
      /**
       * Sephinroth's Valuables I: "Pay `goldCost` gold to gain …". The player must
       * have the gold; it is spent before `gain` is granted (gated in legal-actions
       * so the option is hidden when unaffordable).
       */
      goldCost?: number;
    }
  | {
      /**
       * Octavia's "Gold" (IV/VI) and Melodia's "Fortune" (I/IV/VI) economic map
       * specialties — a compound, map-only play resolved in this order:
       *  1. gain `morale` positive-morale token(s) (Melodia I),
       *  2. if `locationDiceBonusTurn`, create a current-turn player effect adding
       *     +1 to the dice rolled & resolved at locations this turn (Melodia VI),
       *  3. roll `rollResourceDice` Resource dice — resolving exactly ONE when >1,
       *     through the existing CHOOSE_ONE in rollResourceDice (Octavia IV/VI,
       *     Melodia IV),
       *  4. gain `gold` (lands after the chosen die).
       * The interactive dice roll (and the trailing gold) run through a queued
       * map visit, so this option is map-only.
       */
      type: "RESOURCE_FORTUNE_PLAY";
      morale?: number;
      gold?: number;
      rollResourceDice?: number;
      locationDiceBonusTurn?: boolean;
    }
  | {
      /**
       * Legion artifacts (Legs/Loins/Torso/Arms/Head of Legion) discount side.
       * An INSTANT, map-only effect: playing it opens a prompt to choose ONE
       * recruitable/reinforceable unit, then banks a one-shot voucher of `amount`
       * gold reserved for that exact unit (player.recruitDiscounts). The artifact
       * card resolves to the discard pile at once — it is never an ongoing effect.
       * Different Legion pieces stack with one another and other reinforcement
       * discounts. The same piece cannot bank twice before movement, even if a
       * discard-recovery effect returns it. The voucher is consumed when its
       * unit is recruited/reinforced. See
       * `queueLegionDiscountChoice` and the `BANK_RECRUIT_DISCOUNT` visit step.
       */
      type: "GAIN_RECRUIT_DISCOUNT";
      amount: number;
    }
  | {
      /** Logistics expert, Boots of Speed: the main hero gains movement. */
      type: "GAIN_HERO_MOVEMENT";
      amount: number;
      expertAmount?: number;
      /** Angel Wings / Fly: also move through blocked fields this turn. */
      moveThroughThisTurn?: boolean;
      /**
       * Angel Wings ONLY: also walk through ANY field without resolving it this
       * turn (guards, enemy heroes, locations, flags) — only the field the walk
       * ends on is resolved. Fly / Dessa's Logistics VI print blocked fields
       * only and deliberately do NOT set this (HERO_PASS_ANY_FIELD).
       */
      passAnyFieldThisTurn?: boolean;
      /** Water Walk: also cross/stop on sea fields this turn. */
      waterWalkThisTurn?: boolean;
      /** Shield of Naval Glory (Sea side): also draw this many cards. */
      drawCards?: number;
    }
  | {
      /**
       * Anime Hero Grades (anime.heroGrades, §3.11): the played card grants the
       * player `amount` Merit (grade progress). A generic payload — the Training
       * Manual item uses it, and any future card can carry it (that IS the arm).
       * No-op when the module is off (gainGradeProgress gates on it).
       */
      type: "GAIN_GRADE_PROGRESS";
      amount: number;
    }
  | {
      /**
       * WOG Commander Artifacts (Task 2): bind this card PERMANENTLY onto the
       * player's commander in the named slot (the card leaves the game). Map-only,
       * own turn; legal only when the WOG Commanders module is on, the player has
       * a commander, and the slot is EMPTY. The per-slot wired effect lives in
       * COMMANDER_ARTIFACT_SPECS (src/data/wog/commander-artifacts.ts), keyed by
       * the card id — this effect only names which slot to fill. Binding also
       * grants one REGULAR Artifact of the same grade (see grantRegularArtifactOfSameGrade).
       */
      type: "BIND_COMMANDER_ARTIFACT";
      slot: CommanderArtifactSlot;
    }
  | {
      /**
       * Anime hero EQUIPMENT card (`anime.equipment`): equip the named item onto
       * the main hero permanently (occupied slot → bag). The card has already
       * left the game via removeSelf. Also grants one REGULAR Artifact of the
       * same grade (I→minor / II→major / III→relic). Map-only; module must be on.
       */
      type: "EQUIP_HERO_EQUIPMENT";
      equipmentId: string;
    }
  | {
      /**
       * Dimension Door: move the casting player's Hero up to `fields` fields,
       * ignoring obstacles and the fields in-between, then resolve the
       * destination normally (a guarded/enemy field starts combat). The Power
       * paid raises the reach (Power 0/2/4 -> 1/2/3 fields), encoded as the
       * higher-cost options of the spell's CHOOSE_ONE.
       */
      type: "DIMENSION_DOOR";
      fields: number;
    }
  | {
      /**
       * View Earth (Basic Earth, Map): capture an enemy-owned Mine within
       * `withinFields` hexes of the casting player's main Hero — the owner's
       * Faction cube and the Mine's ongoing production are replaced with the
       * caster's (no first-flag income, since the Mine was already flagged). The
       * Power paid raises the reach (Power 0/1/2 -> 1/2/3 fields), encoded as the
       * higher-cost options of the spell's CHOOSE_ONE. Resolved through the
       * "view-earth" pending choice (which Mine to take).
       */
      type: "VIEW_EARTH";
      withinFields: number;
    }
  | {
      /** Helm of Heavenly Enlightenment: an extra expert use this round. */
      type: "GAIN_EXPERT_USE";
      amount: number;
    }
  | {
      /**
       * Scholar (basic), Rib Cage, Crown of Dragontooth, Skull Helmet,
       * Mystic Orb: pick card(s) from your discard pile into hand.
       */
      type: "TAKE_FROM_DISCARD";
      count: number;
      /**
       * `cast-enabler-or-specialty` is the Polish Balance Pack Adelaide IV filter
       * ("Take Cast a Spell or Specialty card from your discard pile"): BOOK-AWARE
       * — with `polish-spell-book` on it matches the Cast a Spell enabler and
       * Specialty cards (owned Spells live in the Book, never the discard pile);
       * without the Book it matches the printed classic reading, Spell or
       * Specialty. `polish-refresh-only` is the follow-up pick that half of that
       * card opens (see `polishRefreshAfter`) and offers ONLY used Book Spells.
       */
      filter?:
        | "spell"
        | "non-artifact"
        | "spell-or-specialty"
        | "magic-arrow"
        | "cast-enabler-or-specialty"
        | "polish-refresh-only";
      /**
       * Polish Balance Pack Adelaide IV: after the take resolves, open a SECOND
       * pick that refreshes one used Book Spell ("Refresh 1 Spell, once per
       * round" — the once-per-round half is the shared Polish
       * `polishBookSpellRefreshBlocked` gate, not a new counter). BOOK-GATED: with
       * `polish-spell-book` off there is no Book to refresh and nothing opens.
       */
      polishRefreshAfter?: boolean;
      /** Only the top N discard cards qualify (Mystic Orb of Mana). */
      fromTop?: number;
      /** Rib Cage: shuffle the rest of the discard pile into the deck. */
      shuffleRestIntoDeck?: boolean;
      /**
       * Polish Balance Pack Crown of Dragontooth: how many "Cast a Spell"
       * enablers the Polish-Spell-Book recovery returns AND how many used Book
       * Spells it may refresh. Absent = 1 (every other recovery artifact, and the
       * Crown's own classic printing, whose count 2 belongs to the non-book
       * discard-to-hand arm).
       */
      polishRecoveryLimit?: number;
      /**
       * Scholar (basic) house rule: the pick may also be made mid-Combat. The
       * adventure reward queue is parked while a fight is live, so the reducer
       * opens the discard-pick choice immediately instead of queuing it (and
       * legal-actions offers the option in the combat context). Every other
       * TAKE_FROM_DISCARD card leaves this off and stays a map-only play.
       */
      allowInCombat?: boolean;
    }
  | {
      /**
       * Scholar (expert): two independent "up to N" phases matching the printed
       * card — (1) remove up to `count` Statistic cards from hand or discard,
       * (2) take up to `count` different Empowered Statistic cards onto the top
       * of the discard pile. Visit steps: SCHOLAR_EMPOWER_PICK (remove) then
       * SCHOLAR_EMPOWER_TAKE (take). The Scholar itself is removed by the
       * option's cost.removeSelf ("Remove the Scholar").
       */
      type: "SCHOLAR_EMPOWER_SWAP";
      count: number;
    }
  | {
      /** Card-driven Search (Breastplate of Brimstone, Crown of Dragontooth). */
      type: "CARD_DECK_SEARCH";
      deck: "spells" | "artifacts" | "abilities";
      count: number;
      /**
       * Tarnum (Conflux) I: "You can Remove this card instead of taking it into
       * your hand." When set, each revealed card may be Removed from the game
       * (it leaves the shared deck for good) rather than kept in hand.
       */
      allowRemove?: boolean;
    }
  | {
      /**
       * Spellbinder's Hat (option A): "Remove 1 card from your hand, then
       * Search(<count>) the card's deck." Opens the REMOVE_HAND_CARD →
       * search-same-deck flow (filter "removable" = only abilities, artifacts and
       * spells, which are the cards that have a corresponding deck to dig). The
       * deck searched is whichever deck the removed card belongs to.
       *
       * `filter` narrows which hand cards may be removed (Miriam's Scouting I is
       * "ability" only; her IV/VI and the Hat default to "removable"). It must be
       * a kind that maps to a searchable deck so "search-same-deck" has a target.
       */
      type: "REMOVE_HAND_CARD_THEN_SEARCH";
      count: number;
      filter?: "ability" | "removable";
      /**
       * Miriam IV/VI: grant a CHOICE of the higher split decks (Major artifacts,
       * Expert spells) in the follow-up Search, beyond the player's usual
       * eligibility. The Spellbinder's Hat leaves this unset (basic deck only).
       */
      tieredReach?: boolean;
    }
  | {
      /**
       * Spellbinder's Hat (option B): "Remove this card and another one from your
       * hand or discard pile." The Hat itself leaves via the option's
       * cost.removeSelf; this then removes one more card the player picks from
       * hand OR discard pile (any card — "any card may be removed together with
       * the Spellbinder's Hat").
       */
      type: "REMOVE_ANOTHER_CARD_FROM_HAND_OR_DISCARD";
    }
  | {
      /** Dragon Wing Tabard: discard random card(s) from the enemy hand. */
      type: "RANDOM_ENEMY_DISCARD";
      count: number;
    }
  | {
      /** Hourglass of the Evil Hour: a positive enemy loses morale. */
      type: "ENEMY_MORALE_STRIP";
    }
  | {
      /** Hourglass option 2: roll the Attack die; gain morale on the result. */
      type: "ROLL_FOR_MORALE";
      onRoll: number;
    }
  | {
      /**
       * Eagle Eye: dig the Spell deck for the first Basic (basic play) or
       * Expert (expert play) spell; take it or discard it; reshuffle.
       *
       * Tome of Air/Earth/Fire/Water (option A) sets `school`: instead of
       * matching by level, the dig finds the first spell of that School (any
       * level; a school-agnostic "any" spell counts as every School), then
       * take/discard/reshuffle exactly as Eagle Eye does.
       */
      type: "EAGLE_EYE_DIG";
      school?: Exclude<SpellSchool, "any">;
    }
  | {
      /** Town Portal: move the hero to a controlled town or settlement. */
      type: "TELEPORT_HERO_TO_TOWN";
      /**
       * Power 2/4: arriving also grants the hero +1/+2 movement. Encoded as the
       * higher-cost options of the spell's CHOOSE_ONE (paid with power-source
       * cards), like Fly / Dimension Door.
       */
      movementBonus?: number;
    }
  | {
      /** Speculum: discover a face-down tile adjacent to the hero's tile. */
      type: "DISCOVER_TILE_CARD";
    }
  | {
      /** Counterstrike: clear the retaliation marker of one of your units. */
      type: "CLEAR_RETALIATION";
      gradeByPower: Record<number, UnitGrade>;
    }
  | {
      /** Bless: ignore the Attack die; higher Power adds attack on top. */
      type: "IGNORE_ATTACK_DIE";
      attackBonusByPower?: Record<number, number>;
    }
  | {
      /**
       * Shield of the Dwarven Lords (option A): a defender's reaction played
       * AFTER the Attack die is rolled. It ignores the rolled die (the face
       * contributes 0 to the attack) and every additional effect that die face
       * triggered — Dread Knights' Death Blow, the Minotaurs' draw, the
       * Thunderbird/Wyvern follow-up bolt, the Azure/Basilisk paralysis, the
       * Zombie/Manticore die-defense bonus. Only offered in the dedicated
       * post-roll window (ATTACK_DIE_SETTLED), never as a free combat instant.
       */
      type: "IGNORE_ATTACK_DIE_RESULT";
    }
  | {
      /**
       * Bowstring of the Unicorn's Mane (option A): "Play this card before a unit
       * activates. Activate one of your ranged units that has not been activated
       * this round." The chosen friendly ranged unit (target) is made the active
       * unit and takes a full out-of-order activation now. Offered in the shared
       * pre-activation window (trigger controller "any"), so either player may
       * interject — including before an enemy unit acts.
       */
      type: "ACTIVATE_RANGED_UNIT";
      /** Valeska's Marksmen VI: allow re-activating an already-activated unit. */
      allowAlreadyActivated?: boolean;
    }
  | {
      /**
       * Helm of the Alabaster Unicorn (option B): "Cast a spell from the top of the
       * spell deck discard pile and Remove this card." Played as a `fromSpellDeck`
       * CAST_SPELL (mirroring a Spell Scroll cast), NOT a PLAY_CARD: the top card of
       * the shared Spell-deck discard pile is cast at the caster's normal Power, the
       * spell card stays in that discard pile, and the Helm is removed from the game.
       * This marker only flags the card as implemented and tells the legal-action
       * layer to offer that cast; it is never applied from playCard.
       *
       * Valeska's Marksmen VI sets `allowAlreadyActivated`: she may re-activate a
       * ranged unit that has already acted this round (the printed "even if that
       * unit has already been activated"). The Bowstring leaves it unset, so it
       * keeps targeting only not-yet-activated ranged units.
       *
       * Ciele's Magic Arrow IV (Conflux) reuses this marker with `spellId` set:
       * instead of the discard top, the offer layer finds that specific Spell in
       * the Spell-deck discard pile (any copy) and casts it for free. The enabling
       * card is a hero-specialty, so the cast sends it to the discard pile (to be
       * redrawn) rather than removing it like the Helm.
       */
      type: "CAST_FROM_SPELL_DISCARD";
      /** Ciele IV: only a Spell with this id may be cast (e.g. spell.magic_arrow). */
      spellId?: string;
      /**
       * Ciele IV: source the spell from the caster's OWN discard pile
       * (PlayerState.discard) rather than the shared Spell-deck discard. Magic
       * Arrow is STARTING_ONLY, so a cast copy only ever lands in the player's own
       * discard — never in the shared Spell deck.
       */
      ownDiscard?: boolean;
      /**
       * Polish Balance Pack Helm of the Alabaster Unicorn: "Add casted Spell to
       * your Spellbook." BOOK-GATED — with `polish-spell-book` on the cast Spell
       * leaves the shared Spell-deck discard pile and is inscribed (refreshed)
       * into the caster's Spellbook instead of staying there. Without the Book
       * there is no Spellbook and the Spell stays put.
       */
      addToSpellBook?: boolean;
      /**
       * Polish Balance Pack Ciele I / IV: "If you have a Cast a Spell card on
       * your discard pile, Refresh up to 1 Magic Arrow spell and cast it." Sources
       * the Spell from the caster's USED Book side (refreshing it — and honouring
       * the shared once-per-round refresh gate) instead of a discard pile, with a
       * Cast a Spell enabler sitting in the discard pile as the CONDITION (never
       * consumed — the cast needs no enabler). BOOK-GATED: with `polish-spell-book`
       * off this arm is not offered at all (Ciele keeps her classic sides, which
       * the reprint carries under `forbidsHouseRule`).
       */
      polishRefreshFromBook?: boolean;
      /**
       * Polish Balance Pack Ciele I: unlike every other CAST_FROM_SPELL_DISCARD
       * bonus cast, this one DOES consume the per-Combat-round Spell limit — only
       * Ciele IV's face prints "This spell does not count toward your Spell limit
       * per Combat round". Absent = the classic free bonus cast.
       */
      countsTowardSpellLimit?: boolean;
    }
  | {
      /**
       * Misfortune (Basic Fire): the defender plays it the instant an enemy unit
       * declares an attack — in a dedicated window BEFORE the attacker can buff —
       * to negate that attack's Attack die result AND lock the attacker out of
       * increasing the attack from any source for this attack (cards, town/cube
       * boosts, the die). Grade-gated on the ATTACKING unit (Power 0/1/2 →
       * bronze/silver/gold). Engine: sets the attack's `negateAttackBuffs` +
       * `attackDieCancelled` modifiers; the legal-action layer then refuses every
       * attack-increasing reaction to the attacker for the rest of the attack.
       */
      type: "NEGATE_ATTACK";
      grade?: UnitGrade;
      /**
       * Polish Balance Pack Misfortune: the printed "Negate an additional Attack
       * from any card" rider is the classic buff lock (always on); the DIE half
       * is the option's own rung — "negate" (the classic cancelled die, Power 0),
       * "lower-of-two" (Power 1) or "four-reroll-plus" (Power 2). Power is paid
       * the way the classic card always paid it: as the option's discard cost.
       * Read at the attack-roll seam (resolveAttackStackItem).
       */
      dieMode?: "negate" | "lower-of-two" | "four-reroll-plus";
      /** Balance reprint: the die mode follows Power added in this attack window. */
      dieModeByPower?: Record<number, "negate" | "lower-of-two" | "four-reroll-plus">;
    }
  | {
      /** Anti-Magic: spell immunity for a unit (tier rises with Power). */
      type: "CREATE_SPELL_IMMUNITY";
      gradeByPower: Record<number, UnitGrade>;
      duration: EffectDurationDefinition;
      /**
       * Polish Balance Pack Anti-Magic: the ward ALSO blocks DAMAGE from Spells
       * and from Hero Specialties ("cannot be targeted by Spells and take damage
       * from Spells and Specialities"). Adds a SPELL_DAMAGE_REDUCTION large
       * enough to zero any spell hit plus SPECIALTY_IMMUNITY to the effect.
       */
      blocksSpellAndSpecialtyDamage?: boolean;
    }
  | {
      /**
       * Fire Shield: a melee (ground/flying) attacker takes damage after its
       * attack. The Fire Shield spell scales with Power (`amountByPower`);
       * Rashka's Demoniac specialty uses a flat `amount` instead, doubled when
       * placed on the named unit (`doubleForUnitName`, his Efreet at level VI).
       */
      type: "CREATE_FIRE_SHIELD";
      amount?: number;
      amountByPower?: Record<number, number>;
      duration: EffectDurationDefinition;
      doubleForUnitName?: string;
      removable?: boolean;
    }
  | {
      /**
       * Spell Ward: the chosen friendly unit reduces the damage it takes from
       * Spells (and Hero-Specialty damage) by `amount` for the duration, summed
       * into totalSpellDamageReduction alongside the Golems' printed passive.
       * Clancy's Unicorns specialty (VI) uses a flat `amount`, doubled when the
       * ward lands on his signature unit (`doubleForUnitName`, his Unicorns).
       */
      type: "CREATE_SPELL_WARD";
      amount: number;
      duration: EffectDurationDefinition;
      doubleForUnitName?: string;
      removable?: boolean;
    }
  | {
      /** Haste / Slow / initiative artifacts: a lasting initiative shift. */
      type: "CREATE_INITIATIVE_BUFF";
      /**
       * Polish Balance Pack Haste / Slow: the printed Combat-movement half
       * scales with Power (+1/+2/+3 and -1/-2/-3), so it replaces the flat
       * house-rule `movementBonus` when the Balance Pack is on.
       */
      movementBonusByPower?: Record<number, number>;
      name: string;
      amount?: number;
      amountByPower?: Record<number, number>;
      duration: EffectDurationDefinition;
      polarity?: "positive" | "negative" | "neutral";
      removable?: boolean;
      /** Hero specialties: the bonus doubles when placed on the named unit. */
      doubleForUnitName?: string;
      /**
       * House rule (BINH): the created effect also carries a MOVEMENT_BONUS of
       * this much (Haste/Cyra +1, Slow/Gundula −1) — a flat ±1 Combat-movement
       * shift independent of the power-scaled Initiative change.
       */
      movementBonus?: number;
    }
  | {
      /**
       * Lord Haart (Necropolis) Dread Knights I/VI: an INSTANT reaction, played
       * when an enemy declares a Retaliation Attack against one of your units.
       * Reduces THAT retaliation's damage by `amount` (1 at level I, 2 at VI),
       * doubled when the unit being retaliated against is the named unit (his
       * Dread Knights). It is written onto the pending retaliation's
       * `retaliationDamageReductionInstant` and consumed when that attack
       * resolves — it never lingers as an ongoing effect, so it fires only on
       * the single retaliation whose window the player answered.
       */
      type: "REDUCE_RETALIATION_DAMAGE";
      amount: number;
      doubleForUnitName?: string;
    }
  | {
      /** Vial of Lifeblood: +1 printed HP for this combat. */
      type: "ADD_UNIT_MAX_HEALTH";
      amount: number;
      /** Hero specialties: the bonus doubles when placed on the named unit. */
      doubleForUnitName?: string;
      /** Apply the bonus to this health bar only, not later Stack/Pack/Few bars. */
      currentUnitLifeOnly?: boolean;
    }
  | {
      /** Fireball: spell damage to the target and one unit adjacent to it. */
      type: "AREA_DAMAGE_ADJACENT";
      amountByPower: Record<number, number>;
    }
  | {
      /**
       * Xyron's Inferno: select a space (occupied or empty); every unit on that
       * space and every unit orthogonally adjacent to it — friend or foe — takes
       * `amount` damage. The discard cost is carried on the card option.
       */
      type: "AREA_DAMAGE_ALL_ADJACENT";
      amount: number;
    }
  | {
      /**
       * Area blast that damages up to `adjacentPicks` units adjacent to a centre
       * (the chosen space, or the chosen unit's space), letting the caster choose
       * which when more than that are adjacent. `includeCenter` also damages the
       * unit on the centre space (Meteor Shower hits its target; Frost Ring rings
       * the centre and spares it). Friend or foe alike are hit. Damage is fixed
       * (`amount`, hero-specialty options) or power-scaled (`amountByPower`,
       * Frost Ring's spell cast).
       */
      type: "AREA_DAMAGE_PICK_ADJACENT";
      amount?: number;
      amountByPower?: Record<number, number>;
      includeCenter: boolean;
      adjacentPicks: number;
    }
  | {
      /**
       * Deemer's Meteor Shower IV: shuffle the player's whole discard pile back
       * into their deck, then draw `drawCards` card(s).
       */
      type: "RESHUFFLE_DISCARD_THEN_DRAW";
      drawCards: number;
    }
  | {
      /**
       * Kriv (Bulwark)'s rune-synergy specialty: the Bulwark player immediately
       * banks `amount` Runes. No-op for a non-Bulwark caster. Playable as a normal
       * combat instant AND — via its option's `trigger` (UNIT_ATTACK_DECLARED /
       * "opponent") — as a REACTION to an enemy attack, so a crossed Rune-Level
       * threshold's army-wide buff turns on BEFORE that attack resolves.
       * `drawCards`, when set, also draws that many cards in the same play (the
       * "gain a Rune AND draw" levels I/IV).
       */
      type: "GAIN_RUNES";
      amount: number;
      drawCards?: number;
    }
  | {
      /**
       * Kriv (Bulwark)'s rune-empowerment specialty: a MAP play that makes the
       * caster Rune-Empowered — their Hero then starts EVERY combat with `amount`
       * extra Runes (a head-start toward the Rune-Level thresholds), until the
       * caster's next Resource round. It ADDS to PlayerState.runeEmpoweredNextCombats
       * (the same flag the City Hall combat-focus sets), capped at RUNE_MAX, so it
       * stacks with the City Hall option. No-op for a non-Bulwark caster.
       */
      type: "GAIN_STARTING_RUNES";
      amount: number;
    }
  | {
      /**
       * Gem's First Aid: take the named war machine card from the shared
       * supply into hand at no cost. When the supply has none left (already
       * taken — the player "already has" it), draw `fallbackDrawCards` instead.
       */
      type: "GAIN_WAR_MACHINE";
      warMachineCardId: CardId;
      fallbackDrawCards?: number;
      /** Torosar's Ballista I: pay this much gold to gain the war machine. */
      goldCost?: number;
    }
  | {
      /**
       * Solmyr's Chain Lightning (I: 1/1/0, VI: 2/1/1) and the Chain Lightning
       * Spell: the selected unit takes `damages[0]`; the remaining values are
       * dealt to the units closest to it (friend or foe), the caster choosing
       * which closest unit takes which on ties or when more than one nonzero
       * value is left. A value of 0 means that closest unit is skipped (its
       * damage routed away from an ally).
       *
       * Hero specialties use the fixed `damages`. The Spell scales its
       * allocation with the Power paid via `damagesByPower` (0 → 1/1/1,
       * 2 → 2/1/1, 4 → 3/2/1) — the array at the highest threshold the paid
       * Power reaches is used.
       */
      type: "CHAIN_LIGHTNING";
      damages?: number[];
      damagesByPower?: Record<number, number[]>;
    }
  | {
      /**
       * Blind Spell: place a Paralysis token on the selected enemy unit, gated
       * by the Power paid (0 → bronze, 1 → silver, 2 → gold). A paralysed unit
       * skips its next activation (the token is removed instead) and the token
       * comes off the moment the unit takes any damage. Casting on a unit above
       * the unlocked grade does nothing — exactly like Anti-Magic's gate.
       */
      type: "PLACE_PARALYSIS";
      gradeByPower: Record<number, UnitGrade>;
    }
  | {
      /**
       * Casmetra's Sorceresses VI (option A): place a Weakness combat token on a
       * chosen unit for `rounds` Combat rounds (the same −N attack token the Cove
       * Sorceresses place). Not tier-gated — it reaches any unit, like the unit
       * ability — so a Creature Bank defender is a legal target too.
       */
      type: "PLACE_WEAKNESS_TOKEN";
      amount: number;
      rounds: number;
    }
  | {
      /**
       * Sorrow Spell (Instant reaction on UNIT_ACTIVATION_STARTED): when an
       * enemy unit is about to activate, skip its activation. The grade reached
       * is set by the Power paid (0 → bronze, 2 → silver, 4 → gold), modelled as
       * one CHOOSE_ONE option per grade — bronze free, silver/gold cost a Power
       * VALUE (`powerCost` 2/4) met by the caster's standing spell Power plus the
       * printed Power of any discarded power-source cards, so one +4 artifact (or
       * a +2 statistic) can reach a grade instead of forcing N separate discards.
       */
      type: "SKIP_ACTIVATION";
      grade: UnitGrade;
    }
  | {
      /**
       * Slayer Spell (Instant reaction on UNIT_ATTACK_DECLARED, attacker's
       * side, gold defender only): roll the Attack die `rollsByPower` times and
       * apply every result except a "-1" (each "+1" adds 1 to the attack), then
       * draw 1 card. Power 0 → 2 rolls, 2 → 4, 4 → 6.
       */
      type: "SLAYER_ATTACK";
      rollsByPower: Record<number, number>;
      /**
       * Polish Balance Pack Slayer: the printed target tiers ("when attacking a
       * GOLD or AZURE unit"). Absent = the classic gold-only reading.
       */
      targetGrades?: readonly UnitGrade[];
    }
  | {
      /**
       * Inferno Spell (Activation): select a space, roll the Attack die
       * `rollsByPower` times, and every unit on that space and the orthogonally
       * adjacent spaces (friend or foe) takes 1 damage for each "+1" rolled.
       * Power 0 → 1 roll, 1 → 2, 2 → 4.
       */
      type: "INFERNO";
      rollsByPower: Record<number, number>;
    }
  | {
      /**
       * Forgetfulness Spell (Activation): the selected enemy ranged unit cannot
       * attack during its next activation. The grade reached scales with the
       * Power paid (0 → bronze, 1 → silver, 2 → gold). Backed by a
       * UNIT_CANNOT_ATTACK effect with the "next-activation" duration.
       */
      type: "FORGETFULNESS";
      gradeByPower: Record<number, UnitGrade>;
      /**
       * Polish Balance Pack Forgetfulness: "For X activations it suffers …".
       * `activationsByPower` is how many of the target's activations the effect
       * lasts (1 or 2), and `rangedModeByPower` says what it suffers: "halve"
       * (its RANGED attack value is halved, rounded up) or "block" (it cannot
       * make RANGED attacks; melee is still allowed — the classic wiring blocked
       * every attack).
       */
      activationsByPower?: Record<number, number>;
      rangedModeByPower?: Record<number, "halve" | "block">;
    }
  | {
      /**
       * Berserk Spell (Expert Fire, Activation): the selected unit MUST, during
       * its next activation, attack the nearest unit or move to the nearest unit
       * and attack it (friend or foe — the berserked unit may be forced onto its
       * own allies, who retaliate as normal). The reachable grade rises with the
       * Power paid (0 → bronze, 2 → silver, 4 → gold), exactly like Blind: casting
       * on a unit above the unlocked grade does nothing. Backed by a
       * BERSERK_FORCED_ATTACK effect with the "next-activation" duration.
       */
      type: "BERSERK";
      gradeByPower: Record<number, UnitGrade>;
    }
  | {
      /**
       * Teleport Spell (Expert Water, Activation): move one of the caster's units
       * to any empty space on the combat board, ignoring obstacles, other units
       * and the distance in-between. The reachable grade of the moved unit rises
       * with the Power paid (0 → bronze, 1 → silver, 2 → gold), like Anti-Magic /
       * Blind; casting on a unit above the unlocked grade does nothing. The
       * destination empty space is picked in a follow-up choice after the cast
       * (the "combat-teleport" OPTION_CHOICE). The move is a free relocation: it
       * costs the unit no movement and provokes no Retaliation.
       */
      type: "TELEPORT_UNIT";
      gradeByPower: Record<number, UnitGrade>;
    }
  | {
      /**
       * Necklace of Swiftness (option B): "Move one of your units 1 space." A
       * combat play that relocates one of the controller's units to an empty
       * orthogonally-adjacent space. The destination is picked in a follow-up
       * "combat-step" OPTION_CHOICE (openUnitStepChoice / resolveUnitStepChoice).
       * A unit can never land on an occupied space, an obstacle, a Wall or the
       * Gate (isSpaceBlockedForSummon); because the hop is a single step it never
       * passes *over* anything, so flying is irrelevant. The move is free: it
       * costs the unit no activation and provokes no Retaliation.
       */
      type: "MOVE_UNIT_ADJACENT";
    }
  | {
      /**
       * Clone Spell (Expert Water, Cove Expansion): place a 1-Health copy of one
       * of the caster's units on an empty space orthogonally adjacent to it. The
       * Clone copies everything printed on the original's card (statistics, type,
       * printed abilities) but NONE of the ongoing effects/tokens layered on the
       * original, and it starts with maxHealth 1. It is destroyed the instant it
       * takes ANY damage, the instant it is attacked (even for 0 damage), and the
       * instant its original leaves the Combat Board (see CombatUnitState.cloneOfUnitId
       * and combat-units.removeLinkedClones). The reachable grade of the cloned
       * unit rises with the Power paid (1 → bronze, 3 → silver, 5 → gold), the
       * Implosion tier ladder; below Power 1 nothing is cloned. The destination
       * empty space is picked in a follow-up choice after the cast (the
       * "combat-clone" OPTION_CHOICE). The "OR Instant: +1 Power" side is the
       * universal power-source discard, so it needs no dedicated option.
       */
      type: "CLONE_UNIT";
      gradeByPower: Record<number, UnitGrade>;
    }
  | {
      /**
       * Dispel Spell (Basic Water): strip every removable ongoing effect from
       * the selected unit — Haste, Slow, Bless's bonus, Anti-Magic, Forgetfulness,
       * Fire Shield, an enemy's buffs… anything created `removable` and bound to
       * that unit. The reachable grade rises with the Power paid (0 → bronze,
       * 1 → silver, 2 → gold), exactly like Anti-Magic / Blind: casting on a unit
       * above the unlocked grade does nothing.
       *
       * The printed card also "removes effects from the space the unit occupies";
       * the engine models no space-bound (obstacle) effects, so only the unit's
       * own effects are removed — the complete behaviour for what is modelled.
       */
      type: "DISPEL_EFFECTS";
      gradeByPower: Record<number, UnitGrade>;
      /**
       * Polish Balance Pack Dispel (Power 2): "ANY unit or ALL effects" — at or
       * above this Power the cast opens a two-option pick (`dispel-scope`): the
       * selected unit/space as printed, or EVERY ongoing effect in the Combat.
       */
      allInCombatAtPower?: number;
    }
  | {
      /**
       * Frenzy Spell (Expert Fire, Instant on the attacker's side): the pending
       * attack ignores the attacked unit's Defense entirely — its Defense counts
       * as 0, the Shield/Defend roll included — reusing the same `ignoreDefense`
       * path as Elemental damage. Gated by the defender's grade (Power 0 → bronze,
       * 2 → silver, 4 → gold); the Power is paid as the chosen option's discard
       * cost, the cost-gated grade pattern shared with Resurrection / Magic Mirror.
       */
      type: "IGNORE_DEFENSE";
      /** Fixed pierced grade (legacy/cost-gated form). */
      grade?: UnitGrade;
      /**
       * Power→grade table (Frenzy): the pierced grade scales with the Power the
       * caster pools into the attack window, re-derived at resolution like Slayer.
       */
      gradeByPower?: Record<number, UnitGrade>;
    }
  | {
      /**
       * Torosar's Ballista specialty. `grant` fields one extra Ballista for the
       * combat or the rest of the game round ("this card counts as a Ballista");
       * `activate` fires one, up to two (IV), or every Ballista (VI) immediately
       * when the card is played during Combat. A game-round grant may be played
       * on the map and then participates normally when Combat begins.
       */
      type: "BALLISTA_SPECIALTY";
      grant?: "combat" | "game-round";
      activate?: "one" | "up-to-two" | "all";
    }
  | {
      /**
       * Gerwulf's Ballista IV/VI: "Discard your Ballista to inflict `amount`
       * damage on the selected unit." A combat play targeting an enemy unit:
       * the player must own an in-play war-machine card matching
       * `warMachineCardId` (a temporary Torosar-style grant cannot be discarded),
       * which is sent to the discard pile, then the chosen enemy takes `amount`
       * "effect" damage — the same physical Ballista shot, so spell-damage
       * reduction does not apply. Gated in legal-actions on owning that machine.
       */
      type: "DISCARD_WAR_MACHINE_DAMAGE";
      warMachineCardId: CardId;
      amount: number;
    }
  | {
      /**
       * Tarnum (Rampart) Sharpshooters VI: "Play at the start of Combat. Find a
       * `unitDefId` unit in the `tier` Neutral deck (or its discard pile) and add
       * it to your army for THIS Combat (discard it afterwards)." On play the card
       * is pulled from that Neutral deck and a TEMPORARY combat unit (no army card)
       * is placed on an empty cell on the player's side; when the Combat ends the
       * borrowed card returns to the Neutral discard pile. Gated to combat round 1
       * with the card available (legal-actions).
       */
      type: "BORROW_NEUTRAL_UNIT";
      unitDefId: string;
      tier: "bronze" | "silver" | "gold" | "azure";
    }
  | {
      /**
       * Tarnum (Dungeon)'s Dragons IV: "Choose a row (straight line of 5
       * consecutive spaces). Every unit in that row suffers `amount` damage."
       * The Combat board is 4 columns × 5 rows, so the only 5-space straight line
       * is a vertical column. Played on a chosen space (any-space target); every
       * living unit sharing that space's column — friend or foe — takes `amount`
       * "effect" damage (per-unit spell-damage reduction applies, like any card).
       */
      type: "DAMAGE_BATTLEFIELD_LINE";
      amount: number;
    }
  | {
      /**
       * Tarnum (Dungeon)'s Dragons VI (option A): "Remove a Black cube from or
       * place it on a Dragons unit." Toggles the selected unit's Retaliation
       * marker — if it has already spent its Retaliation this round
       * (`retaliatedThisRound`) the cube is removed (it may retaliate again);
       * otherwise a cube is placed (it cannot). The card's target restricts this
       * to a Dragons unit (friend or foe).
       */
      type: "TOGGLE_RETALIATION_MARKER";
    }
  | {
      /**
       * Artillery (basic side): deal `amount` damage to an enemy unit with the
       * lowest (effective) initiative — the same shot a Ballista makes, played
       * from hand without one. The card constrains its legal targets to the
       * slowest enemy/enemies (enemy-unit `lowestInitiativeOnly`), so a tie lets
       * the controller pick which slowest unit is hit. Deals "effect" damage.
       */
      type: "DAMAGE_LOWEST_INITIATIVE_ENEMY";
      amount: number;
    }
  | {
      /**
       * Septienna's Death Ripple specialty (I/IV/VI): deal `amount` damage to
       * EVERY enemy combat unit whose grade is one of `grades` (I -> bronze,
       * IV -> silver, VI -> gold + azure). A combat activation with no chosen
       * target — the engine finds the matching enemy units itself. Spell-damage
       * reduction (Gargoyles etc.) applies per struck unit, like any card damage.
       */
      type: "DAMAGE_ENEMY_UNITS_BY_GRADE";
      grades: UnitGrade[];
      amount: number;
    }
  | {
      /**
       * Miku Voice of Angel VI: deal `amount` damage to EVERY living enemy combat
       * unit. Targetless combat/instant play; per-unit spell-damage reduction
       * applies through dealAreaCardDamage (same path as Death Ripple).
       */
      type: "DAMAGE_ALL_ENEMY_UNITS";
      amount: number;
    }
  | {
      /**
       * Miku Voice of Angel I: ongoing combat play — every living enemy unit
       * gains a combat-duration INITIATIVE_BONUS of `initiative` (negative) and
       * optional MOVEMENT_BONUS (combat-move-initiative house rule). Stamped
       * unit-by-unit at play time (summons that enter later are not retroactively
       * slowed — deliberate, same class as multi-target Slow). Ongoing-immunity
       * (Titans etc.) is honoured at read via effectAppliesToUnit.
       */
      type: "SLOW_ALL_ENEMIES";
      name: string;
      initiative: number;
      movementBonus?: number;
    }
  | {
      /**
       * Miku Voice of Angel IV: ongoing combat play — create a player-scoped
       * combat-duration HEAL_AFTER_ATTACKED modifier. After any of the owner's
       * units is attacked (declared attack or retaliation that was not cancelled),
       * heal `amount` damage on that defender if it still lives and has damage.
       */
      type: "CREATE_HEAL_ON_ATTACKED";
      name: string;
      amount: number;
    }
  | {
      /**
       * Tarnum (Castle)'s Ballista VI: "Choose `count` enemy units. Each of these
       * units suffers `amount` damage." A combat activation: the engine gathers
       * the caster's living enemy units and hits `count` of them for `amount`
       * each. When more than `count` are alive the caster picks which through the
       * shared area-pick choice (the same multi-pick used by Frost Ring / Meteor
       * Shower); with `count` or fewer enemies they are all hit at once. Per-unit
       * spell-damage reduction applies, like any card damage.
       */
      type: "DAMAGE_CHOSEN_ENEMIES";
      count: number;
      amount: number;
    }
  | {
      /**
       * Merist's Stone Skin IV: "All your units gain a Defense token." A combat
       * activation with no target — every living unit the caster controls gets a
       * Defense token (the Defend shield: a "+1" on the Defense die adds +1
       * Defense to an incoming attack). Units that already hold one are unchanged.
       */
      type: "GRANT_DEFENSE_TOKENS";
    }
  | {
      /**
       * Merist's Stone Skin VI: an ongoing combat effect. When played it places a
       * Defense token on all your units, and for the rest of the Combat your
       * Defense tokens grant their +1 Defense on a "0" OR a "+1" roll (instead of
       * only on a "+1"). Backed by a player-scoped DEFENSE_TOKEN_ON_ZERO modifier
       * that resolveDefendBonus reads, plus the same token grant as level IV.
       */
      type: "STONE_SKIN_AURA";
    }
  | {
      /**
       * Ivor's Elves I / VI: force the dice of an attack roll to a fixed face
       * value instead of rolling. Played as an instant in the attack window, it
       * sets the pending attack's `forcedRoll`; at resolution every die of that
       * attack shows `value` (a real face, so face-conditioned abilities still
       * read it). I forces 0 ("set all dice of the next attack roll to 0"); VI's
       * second option forces +1 ("set all dice of your roll to the values of your
       * choice" — +1 is the only value that maximises an attack, so the engine
       * realises the optimal choice). `value` is clamped to a real die face.
       */
      type: "FORCE_ATTACK_ROLL";
      value: number;
    }
  | {
      /**
       * Artillery (expert side): a declarative marker, never played through
       * PLAY_CARD. When the owner's Ballista fires at the start of a combat
       * round, the owner may play Artillery (spending one expert use) to resolve
       * that Ballista's shot against the SAME target `shots` times. Wired in
       * permanents.ts (processWarMachineRound / resolveWarMachineOption); the
       * engine reads `shots` from here so the card stays the source of truth.
       */
      type: "ARTILLERY_BALLISTA_VOLLEY";
      shots: number;
    }
  | {
      /**
       * First Aid's expert side: a declarative marker, never played through
       * PLAY_CARD. When the owner activates their First Aid Tent's heal, they may
       * play First Aid (spending one expert use, discarding the card) to resolve
       * that Tent heal against the SAME target `heals` times this round. Wired in
       * the Tent heal flow (USE_ACTIVE_EFFECT) — reducer.ts + legal-actions.ts —
       * so the engine reads `heals` from here and the card stays the source of
       * truth. Without an active First Aid Tent only the card's basic heal runs.
       */
      type: "FIRST_AID_TENT_VOLLEY";
      heals: number;
    }
  | {
      /**
       * Solmyr's Chain Lightning IV: dig up to `count` cards off the top of your
       * own Might and Magic deck, keep one in hand, and discard the rest.
       */
      type: "DECK_DIG_KEEP_ONE";
      count: number;
    }
  | {
      /**
       * Jeddite's Mysterious Warlock I/VI: dig up to `count` cards off the top of
       * your own deck, keep every card matching `filter` (Spell + Specialty) in
       * your hand, and discard the rest. No choice is needed — all matches are
       * kept — so this never opens a pending choice.
       */
      type: "DECK_DIG_KEEP_MATCHING";
      count: number;
      /**
       * `cast-enabler-or-specialty` is the Polish Balance Pack Jeddite I/VI
       * filter ("take any Cast a Spell and Specialty cards to your hand"):
       * BOOK-AWARE — with `polish-spell-book` on the takeable kinds are the Cast
       * a Spell enabler and Specialty cards (owned Spells live in the Book, so a
       * raw Spell card is never dug out of the deck); with the Book off it keeps
       * the printed classic reading, Spell or Specialty.
       */
      filter: "spell-or-specialty" | "cast-enabler-or-specialty";
    }
  | {
      /**
       * Tazar's War Hero VI: draw the top card of the shared Artifact deck (the
       * Legacy "artifacts" deck, or the BINH Minor deck) straight to your hand.
       * The card's per-option `cost` pays the printed price (remove 1 card / or
       * discard 3 cards); this effect only performs the draw.
       */
      type: "DRAW_TOP_ARTIFACT";
    }
  | {
      /**
       * Adrienne's Fire Magic IV: Search (`count`) your own deck (reveal the top
       * `count`, keep one in hand, the rest go to your discard pile), THEN shuffle
       * your whole discard pile back into your deck. The reshuffle runs after the
       * pick resolves (the own-deck-pick choice carries `thenReshuffleDiscard`).
       */
      type: "SEARCH_DECK_THEN_RESHUFFLE";
      count: number;
    }
  | {
      /**
       * Alamar's Resurrection: played as a reaction on an enemy attack that
       * targets one of your units (normal attacks only — never spells or
       * specialty damage). If the attack would reduce that unit (of `grade` or
       * lower) to 0 HP it is cancelled — no damage and no Retaliation. The
       * option's discard cost (Power statistics / Spells) stands in for the
       * printed Power.
       */
      type: "CANCEL_LETHAL_ATTACK";
      grade: UnitGrade;
    }
  | {
      /**
       * Magic Mirror: an instant reaction when one of your units is about to be
       * targeted OR damaged by an enemy Spell. Choose a new target — any unit of
       * the paid grade (Power 0 → bronze, 1 → silver, 2 → gold), one option per
       * grade — picked in a follow-up choice after the card is played. Three
       * cases the engine handles (see getMagicMirrorReactions / chooseAbilityTarget):
       *  - a single-target cast aimed at your unit (Magic Arrow, Implosion…):
       *    the Spell re-points and resolves against the chosen unit;
       *  - an area cast that would damage your unit (Fireball's splash, Inferno's
       *    blast) even though its primary target is an enemy unit or a bare space:
       *    the blast recenters on the chosen unit (Inferno → that unit's space);
       *  - an instant combat debuff layered onto an attack (Curse on your
       *    defender, Weakness on your attacker): it is lifted off your unit and
       *    lands on the chosen unit as a lasting token, then the attack continues.
       */
      type: "REDIRECT_SPELL";
      grade: UnitGrade;
    }
  | {
      /**
       * Interference / Plate of the Dying Light: wiki `<instant>` +X defense that
       * can ALSO blunt Spell damage. NOT combat-long (that was a prior misread —
       * Shield had the same bug and was fixed to this-attack only).
       *
       *   • Played into UNIT_ATTACK_DECLARED → +X defense on THIS attack only
       *     (stackItem.modifiers.defenseBonus), same as Armorer / Lion's Shield.
       *   • Played into SPELL_CAST_STARTED → −X Spell damage on THIS cast only
       *     against the targeted unit (stackItem.modifiers.interfereSpellReductions).
       *
       * Basic +1 / expert +2. Plate reuses the same effect via CHOOSE_ONE (+1 /
       * +4 removeSelf) and omits expertAmount so no expert reaction is offered.
       */
      type: "INTERFERE_SPELL";
      amount: number;
      /**
       * Interference's expert side grants +2 instead of +1. Optional: an
       * artifact (Plate of the Dying Light) that grants the same Defense /
       * spell-damage reduction through a CHOOSE_ONE option — not a basic/expert
       * pair — omits it, so no expert reaction is offered or resolved for it.
       */
      expertAmount?: number;
      /** Balance reprint alternative: reduce the enemy Spell's Power by up to this amount. */
      balancePowerReduction?: number;
      balanceExpertPowerReduction?: number;
    }
  | {
      /**
       * Boots of Polarity (option B): "Remove 1 ongoing effect." Targets one of
       * your or the enemy's units and strips a single removable ongoing effect
       * from it (the most recently applied one). A unit-scoped dispel of exactly
       * one effect — narrower than Cure/Dispel, which clear several at once.
       */
      type: "REMOVE_ACTIVE_EFFECT";
    }
  | {
      type: "CREATE_ACTIVE_EFFECT";
      effect: ActiveEffectDefinition;
      expertEffect?: ActiveEffectDefinition;
      /**
       * Ash's Bloodlust IV: "Place a Black cube on that unit." After the ongoing
       * buff is created on the selected unit, that unit also spends its
       * Retaliation for the round (`retaliatedThisRound = true`) — the same Black
       * cube the instant Bloodlust sides place via ADD_COMBAT_STAT.placeBlackCube.
       */
      placeBlackCube?: boolean;
    }
  | {
      type: "CREATE_ATTACK_BUFF";
      name: string;
      amount?: number;
      amountByPower?: Record<number, number>;
      duration: EffectDurationDefinition;
      polarity?: "positive" | "negative" | "neutral";
      removable?: boolean;
      /** Hero specialties: the bonus doubles when placed on the named unit. */
      doubleForUnitName?: string;
      /**
       * Polish Balance Pack Bless: the buff ALSO makes the affected unit ignore
       * its Attack die roll (an IGNORE_ATTACK_DIE_ROLL modifier) for the buff's
       * whole duration, instead of Bless's classic one-attack instant.
       */
      ignoreAttackDie?: boolean;
      /**
       * Polish Balance Pack Bless (Power 3): at or above this Power the buff is
       * created on EVERY living ground/flying unit the caster controls instead of
       * only the selected one ("all units +1 Attack"). One unit-scoped effect per
       * unit, so every existing read (dispel, ongoing tray, effectAppliesToUnit)
       * keeps working unchanged.
       */
      allGroundFlyingAtPower?: number;
    }
  | {
      /** Prayer balance reprint: one ongoing effect grants all three bonuses. */
      type: "CREATE_PRAYER_BUFF";
      name: string;
      amountByPower: Record<number, number>;
      duration: EffectDurationDefinition;
      polarity?: "positive" | "negative" | "neutral";
      removable?: boolean;
    }
  | {
      /**
       * Oidana VI (ongoing): a targetless combat play that gives every unit of
       * the named army `variant` the caster controls a flat `amount` Attack
       * bonus for the whole combat ("+1 Attack to all your neutral units, all
       * rounds"). Creates a player-scoped, combat-duration ATTACK_BONUS active
       * effect gated to that variant — see the reducer + effectAppliesToUnit.
       */
      type: "CREATE_VARIANT_ATTACK_BUFF";
      name: string;
      amount: number;
      variant: CombatUnitState["variant"];
    }
  | {
      type: "CREATE_DEFENSE_BUFF";
      name: string;
      amount?: number;
      amountByPower?: Record<number, number>;
      duration: EffectDurationDefinition;
      polarity?: "positive" | "negative" | "neutral";
      removable?: boolean;
      /**
       * Shield / Air Shield: when set, the buff is conditional — its Defense only
       * applies against an attacker of this UNIT TYPE ("ground-or-flying" =
       * Shield, "ranged" = Air Shield). Omitted for a plain, always-on +Defense.
       */
      vsAttackerType?: "ground-or-flying" | "ranged";
    }
  | {
      type: "CREATE_ATTACK_DIE_REROLL";
      name: string;
      basicRerolls: number;
      expertRerolls?: number;
      rerollsByPower?: Record<number, number>;
      /**
       * Fortune: the effect ALSO rerolls the adventure-map Treasure and Resource
       * dice (a shared ADVENTURE_DIE_REROLL budget equal to the reroll count), so
       * the same card works in combat (Attack die) and on the map.
       */
      adventureDice?: boolean;
      duration: EffectDurationDefinition;
      /**
       * Mirth: the duration scales with the Power paid rather than the reroll
       * count (Power 0 → this Activation, 2 → this Combat round, 4 → this
       * Combat). When set, it overrides `duration` at the matched breakpoint.
       */
      durationByPower?: Record<number, EffectDurationDefinition>;
      consumeEffectOnUse: boolean;
    }
  | {
      type: "RECALL_SPELL";
      expertSpellLimitBonus?: number;
      /**
       * Empowered Knowledge (Inferno / Star Axis): raise the spell limit by
       * this much on the basic play, no crown spent. Applied on every play;
       * `expertSpellLimitBonus` still adds on top only on the expert play.
       */
      basicSpellLimitBonus?: number;
      /** Mysticism expert: also recall every card played with the spell. */
      expertRecallPlayedCards?: boolean;
    }
  | {
      /** Generic Polish Cast-a-Spell enabler; actual Spell is chosen separately. */
      type: "CAST_FROM_SPELL_BOOK";
    }
  | {
      /**
       * Permanent cards whose whole behavior lives in `permanentEffect`
       * (war machines): playing the card only puts it into play.
       */
      type: "ENTER_PLAY";
    }
  | {
      /**
       * Dessa's Logistics specialty: during the continue-or-retreat decision
       * against neutral units, extend the combat by one round without
       * spending a movement point.
       */
      type: "CONTINUE_NEUTRAL_FREE";
    }
  | {
      /**
       * Shackles of War (house rule): played at the start of a player-vs-player
       * Combat, the enemy player's Hero cannot *Surrender* for the rest of that
       * Combat (a CANNOT_SURRENDER_COMBAT effect on the enemy). Retreat and a
       * fought-out loss are unaffected.
       */
      type: "BLOCK_ENEMY_SURRENDER";
    }
  | {
      /**
       * Earthquake: siege only. Power 0 removes 1 Wall/Gate of the caster's
       * choice, Power 1 removes 2, Power 2 deals 1 damage to every unit
       * adjacent to a fortification and removes them all.
       */
      type: "EARTHQUAKE";
    }
  | {
      /**
       * Remove Obstacle (Basic Water): remove obstacles of the caster's choice
       * from the Combat board — the random obstacle markers and any standing
       * siege Wall or Gate (never units). Power 0/1/2 -> remove 1/2/3 of them,
       * picked one at a time (the "remove-obstacle" choice). The "OR Instant:
       * +1 Power" side is the universal power-source discard.
       */
      type: "REMOVE_OBSTACLE";
      countByPower: Record<number, number>;
    }
  | {
      /**
       * Ballistics: siege only — destroy 1 Wall or the Gate, or the Arrow Tower.
       * Both are basic sides under the house rule (the arrow-tower demolition no
       * longer costs a crown).
       */
      type: "SIEGE_DEMOLISH";
      /**
       * `three-walls-and-gate` is the Polish Balance Pack's Ballistics EXPERT
       * siege arm ("During the siege: destroy 3 Walls and Gate") — it fells the
       * Gate plus up to 3 standing Walls at once, so it needs no target pick.
       */
      target: "wall-or-gate" | "two-walls-or-wall-and-gate" | "arrow-tower" | "three-walls-and-gate";
    }
  | {
      /**
       * Ballistics' expert bombardment (house rule): the played option pays its
       * `cost.resources` (1 building material) and spends a crown, then deals
       * `amount` flat "effect" damage to a chosen enemy unit AND, when one is
       * adjacent to it, an enemy unit the caster picks next to it — "1 damage to
       * 2 adjacent units". The adjacent splash is resolved through the
       * `ballistics-splash` ABILITY_TARGET_CHOICE (skippable when none qualify).
       * War-machine damage, so spell-damage reduction does not apply.
       */
      type: "BALLISTICS_BOMBARD";
      amount: number;
    }
  | {
      /** Ballistics balance basic: one Catapult-style two-adjacent-target picker. */
      type: "BALLISTICS_OPENING_BOMBARD";
      amount: number;
    }
  | {
      /**
       * Summon X Elemental (Conflux Expert spells): on a chosen empty space,
       * Power 2 summons a Few and Power 4 a Pack of the school's Elemental.
       * The unit joins the combat immediately (acts on its own initiative) and
       * stays in the caster's army afterwards — exactly like the Pit Lords'
       * summoned Demons.
       */
      type: "SUMMON_ELEMENTAL";
      unitDefId: string;
    }
  | {
      /**
       * Force Field (Basic Earth): place an Obstacle on a chosen empty space.
       * It blocks the movement of non-flying units and bars stopping on it,
       * exactly like any Combat Obstacle, for a span that grows with the Power
       * paid — Power 0: this Combat round, 1: the next Combat round, 2: the
       * whole Combat. The "OR Instant: +1 Power" side is the universal
       * power-source discard, so it needs no option here.
       */
      type: "PLACE_FORCE_FIELD";
      durationByPower: Record<number, EffectDurationDefinition>;
    }
  | {
      /**
       * Fire Wall (Basic Fire): place an Effect Obstacle on a chosen empty
       * space for the whole Combat. Units may enter it, but any unit STOPPING on
       * it — and any GROUND or RANGED unit PASSING THROUGH it (flyers passing
       * over are unharmed) — takes damage that scales with Power: 0 -> 1,
       * 2 -> 2, 4 -> 3. The "OR Instant: +1 Power" side is the universal discard.
       */
      type: "PLACE_FIRE_WALL";
      damageByPower: Record<number, number>;
    }
  | {
      /**
       * Luna's Fire Wall specialty (I/VI): place a Fire Wall token on a chosen
       * empty space for this Combat, dealing a FIXED amount of damage (1 at I,
       * 3 at VI) — no Power scaling, unlike the Fire Wall spell. Reuses the same
       * `fire_wall` battlefield token (damage on stop / pass-through).
       */
      type: "PLACE_FIRE_WALL_FIXED";
      damage: number;
    }
  | {
      /**
       * Quicksand (Basic Earth) / Land Mine (Expert Fire): take 2/4/6 tokens by
       * Power (half armed, half decoy "empty"), shuffle them face down and place
       * one on each chosen empty space. The caster picks the spaces one by one
       * (the place-battlefield-tokens choice); the armed/decoy split stays hidden
       * from the opponent until a unit enters a token and reveals it. An armed
       * Quicksand ends the entering unit's movement AND activation; an armed Land
       * Mine deals `triggerDamage` and the unit then continues. The "OR Instant:
       * +1 Power" side is the universal discard.
       */
      type: "PLACE_HIDDEN_TOKENS";
      tokenKind: "quicksand" | "land_mine";
      countByPower: Record<number, number>;
      triggerDamage: number;
    }
  | {
      /**
       * Moandor's Liches VI specialty (one option of its "OR"): for the rest
       * of the Combat the chosen unit deals elemental damage. Restricted to the
       * named unit when `targetUnitName` is set (his card reads "your Liches").
       */
      type: "GRANT_ELEMENTAL_DAMAGE";
      targetUnitName?: string;
      duration: EffectDurationDefinition;
    }
  | {
      /**
       * Gem's First Aid VI: "For this Combat, double your First Aid Tent's
       * effect." Doubles the heal amount of the player's in-play First Aid Tent
       * for the rest of the current combat.
       */
      type: "DOUBLE_FIRST_AID_TENT";
    }
  | {
      /**
       * Gelu's Sharpshooters IV: discard a Pack of the `from` unit from your
       * army, then search the named Neutral tier deck for the `to` unit and add
       * it to your unit deck. `unique` enforces "you can control only 1 at a
       * time".
       *
       * Tarnum (Conflux) IV reuses this to "Pay 10 gold, then find the Enchanters
       * card in the Neutral Unit deck and add it to your Unit deck" — there is no
       * unit to trade in, so `fromUnitDefId`/`fromSide` are omitted and `goldCost`
       * is paid instead. At least one of (a from-unit trade, a goldCost) must be
       * present as the acquisition cost.
       */
      type: "CONVERT_ARMY_UNIT";
      fromUnitDefId?: string;
      fromSide?: "few" | "pack";
      toUnitDefId: string;
      toTier: "bronze" | "silver" | "gold" | "azure";
      unique?: boolean;
      /** Tarnum (Conflux) IV: gold paid to acquire the unit (no unit traded in). */
      goldCost?: number;
      /**
       * House rule (BINH) — Gelu IV: a permanent Attack bonus baked onto the
       * acquired unit card. The Sharpshooters Gelu recruits this way carry +1
       * Attack in EVERY combat, start to end (stored on the army card as
       * `permanentAttackBonus` and re-applied each time it enters combat). A
       * `UNIT_RECRUITED` event with `attackBuff` set drives the "this is a BUFF"
       * notice.
       */
      grantAttackBonus?: number;
      /**
       * Polish Balance Pack Dracon IV / Gelu IV: "Gain 13 (resp. 9) gold for each
       * stack of Magi (Elves) you had." Gold paid per Polish Unit-STACK layer the
       * traded-in card carried. A card with no layers (or a table without the
       * `polish-unit-stacks` rule, where `stacks` never exists) pays nothing, so
       * the rider is inert by construction.
       */
      goldPerStackLayer?: number;
    }
  | {
      /** Alice VI: bank free uses of the MGQ after-combat Companion seal. */
      type: "MGQ_GRANT_FREE_COMPANION_SEAL";
      amount: number;
    }
  | {
      /**
       * Promestein — Mad Science: remove one bronze Few army card, then give a
       * separately chosen silver army card a permanent Attack bonus.
       */
      type: "MGQ_MAD_SCIENCE";
      attackBonus: number;
    }
  | {
      type: "MGQ_DRAW_AND_SPECIALTY_IMMUNITY";
      drawCards: number;
    }
  | {
      type: "MGQ_DESTROY_UNIT_AND_EMPOWER_SPELLS";
      powerBonus: number;
    }
  | {
      /**
       * Tarnum (Conflux) VI: "Search(1) Spell twice. … you can immediately cast
       * one or both of these spells, even if you already cast a spell this round.
       * Place each spell you use this way on the top of the Spell deck or on its
       * discard pile in any order." Searches `count` spells into hand and flags
       * them so they can be cast for free over the per-round limit; an uncast
       * flagged spell simply stays in hand (the normal Search result). A cast
       * flagged spell returns to the shared Spell deck (top or discard, the
       * caster's choice) rather than the caster's own discard pile.
       */
      type: "TARNUM_OVERLIMIT_SEARCH";
      count: number;
    }
  | {
      /**
       * Mutare / Cassiopeia's Tactics ability. A declarative marker only:
       * Tactics is never resolved through PLAY_CARD. The regular swap is offered
       * in the start-of-combat Tactics window, and the expert swap on the
       * holder's turn before their active unit moves; both run through the
       * SWAP_COMBAT_UNITS action and discard the card (expert also spends one
       * expert use). See swapCombatUnits in adventure-reducer.ts.
       */
      type: "TACTICS_SWAP";
    }
  | {
      /**
       * Cyra's Diplomacy, Map side: draw Neutral Unit cards from the player's
       * Dwelling tiers (Gold Dwellings also open Azure), then open a recruit
       * choice over the draws (pay the chosen unit's Recruitment cost; the rest
       * return to their tier decks).
       * Resolved in openDiplomacyRecruit.
       */
      type: "DIPLOMACY_RECRUIT";
      /**
       * Oidana's specialty caps the draw at a fixed number of Neutral Unit cards
       * (1 at level I, 2 at level IV) instead of Cyra's uncapped "one per
       * Dwelling". Undefined = uncapped (Cyra's behaviour).
       */
      maxDraws?: number;
      /**
       * Oidana IV: reduce the GOLD portion of the chosen unit's Recruitment cost
       * by this much (floored at 0). Undefined/0 = pay full price.
       */
      goldReduction?: number;
    }
  | {
      /**
       * Cyra's Diplomacy, Instant side. A declarative marker: the skip is
       * offered automatically as a pop-up when a hero meets Neutral Units whose
       * Field Difficulty equals the hero's level (never played from hand). See
       * the "diplomacy-skip" pending choice in adventure-reducer.ts.
       */
      type: "DIPLOMACY_SKIP_COMBAT";
    }
  | {
      /**
       * Learning ability. Never played from hand: it is offered automatically
       * when a Hero is about to level up (see the "learning-level-up" reward and
       * pending choice). Basic advances the Hero's Experience an extra half level
       * (`amount` steps); the Expert side advances a full level (`expertAmount`
       * steps), spends an expert use and removes the card from the game.
       * A "half level" is one Experience step here (2 steps = 1 level).
       */
      type: "ADVANCE_EXPERIENCE";
      amount: number;
      expertAmount: number;
    }
  | {
      /**
       * Visions spell (Map): scry one Neutral Unit deck. Draw `cardsByPower[P]`
       * cards from a chosen tier deck (P is the Power paid by discarding Spells
       * for +1 each via the option's "power-source" cost), then discard any of
       * them and return the rest to the top of that deck in the chosen order.
       * Resolved through the "visions-deck" / "visions-scry" pending choices.
       */
      type: "VISIONS_SCRY";
      cardsByPower: Record<number, number>;
    }
  | {
      /**
       * Disrupting Ray Spell (Basic Air, Ongoing): until the end of the Combat
       * the selected enemy unit cannot use its special ability. The reachable
       * grade rises with the Power paid (0 → bronze, 1 → silver, 2 → gold) — the
       * Anti-Magic/Blind gate; above it the cast does nothing. Backed by a
       * combat-scoped UNIT_ABILITY_SUPPRESSED effect. As a single-target unit
       * cast it can be deflected by Magic Mirror onto a new target.
       */
      type: "DISRUPTING_RAY";
      gradeByPower: Record<number, UnitGrade>;
      /**
       * Polish Balance Pack: "…cannot use their special ability OR suffers -1
       * Defense". When set, the resolved cast opens a two-option pick
       * (`disrupting-ray-mode` OPTION_CHOICE) for the caster: suppress the
       * ability (the classic effect) or lay a lasting -`defenseChoice` Defense
       * penalty (floored at 0 by the normal effective-Defense clamp).
       */
      defenseChoice?: number;
    }
  | {
      /**
       * Sacrifice Spell (Expert Fire, Activation): choose 1 of your damaged units
       * (the heal target, grade-gated by the Power paid — 0/2/4 → bronze/silver/
       * gold) and transfer its damage onto another of your units (the sacrifice,
       * picked in a follow-up ABILITY_TARGET_CHOICE). The amount moved is
       * min(heal target's damage, the sacrifice's remaining HP) — "up to as much
       * as is needed for the other unit to perish": the heal target loses that
       * much damage, the sacrifice takes it and perishes (a Pack flips to Few)
       * when it reaches its remaining HP.
       */
      type: "SACRIFICE_TRANSFER";
      gradeByPower: Record<number, UnitGrade>;
    }
  | {
      /**
       * Pandora's Box map plays whose whole resolution is a list of visit steps —
       * queued as a main-hero "visit-steps" reward so it reuses the tested visit
       * pipeline (GAIN_EXPERIENCE, GAIN_MOVEMENT, GAIN_RESOURCES, ROLL_RESOURCE_DICE,
       * SEARCH_SHARED_DECK, nested CHOOSE_ONE, PANDORA_PAY_FOR_DICE, …). The steps
       * run against the player's MAIN hero (a Secondary Hero never gains map XP).
       * Used by every straightforward Pandora card (experience/movement/resource-
       * dice/search/pay-for-dice) and as the option effects of the "OR" cards.
       */
      type: "PANDORA_VISIT";
      steps: VisitStep[];
    }
  | {
      /**
       * Pandora's Box "peek" cards: reveal the top `count` cards of a shared deck,
       * discard up to `maxDiscard` of them, and return the rest to the top of the
       * deck in an order you choose (first kept is drawn next). Then resolve the
       * `then` follow-up steps (a resource gain or a Search) — which happen even
       * when the deck was empty. `deck` is a deck FAMILY ("abilities" / "spells" /
       * "artifacts" / "astrologers"); the concrete pile scryed is resolved by
       * pandoraScryDeckId (the basic/lowest split-deck when a family splits).
       * Resolved through the "pandora-scry" pending choice.
       */
      type: "PANDORA_SCRY";
      deck: "abilities" | "spells" | "artifacts" | "astrologers";
      count: number;
      maxDiscard: number;
      then?: VisitStep[];
    }
  | {
      /**
       * Pandora's Box (card 173): "If you have no Silver unit in your Unit Deck,
       * discard this card and draw another. Otherwise, choose one: (A) reverse a
       * Silver unit to its Handful (Few) side, OR (B) discard a Silver unit, then
       * draw 3 Bronze + 3 Silver Neutral units and Recruit 1 of each for free."
       * With no Silver in the army the card self-cycles: it draws another Pandora
       * card. Otherwise it opens the interactive choice. (Unit Deck = player.army;
       * "Handful" = the Few side; the [bronze]/Neutral decks = neutral-bronze /
       * neutral-silver.)
       */
      type: "PANDORA_SILVER_REFRESH";
    };

/**
 * Extra price printed on a card option: "Discard N cards to…", "Remove this
 * card, then…", "Remove 1 Spell from hand, then…". Paid via the action's
 * `costCardIds` (the chosen cards from hand).
 */
export type CardPlayCost = {
  /** The played card is removed from the game instead of discarded. */
  removeSelf?: boolean;
  /**
   * Printed resource price of this option, paid from the player's stockpile when
   * the option is played (Ballistics' expert bombardment: "pay 1 building
   * material"). Affordability is checked in legal-actions (the option is not
   * offered when the player cannot pay) and the resources are spent in
   * payOptionCardCost.
   */
  resources?: ResourceCost;
  /** Discard exactly this many other cards from hand. */
  discardCards?: number;
  /** Discard any number up to this many (effects may scale per card). */
  discardCardsUpTo?: number;
  /**
   * Pay at least this much spell Power (instead of a fixed card count). Met by
   * the caster's standing spell Power for the played card's school (Power
   * statistic / School-of-Magic permanent / active-unit boost) PLUS the full
   * printed Power of each discarded power-source card — a Spell counts as the
   * "+1 Power" on its bottom side, a Power statistic/artifact/ability counts as
   * its printed Power (school-restricted Power only when the school matches).
   * Used by Sorrow's silver/gold skip so a single +4 artifact (or your Power
   * stat) reaches a grade instead of forcing N separate discards. Requires
   * `costCardFilter: "power-source"`.
   */
  powerCost?: number;
  /**
   * The discarded/removed cards must match this filter. "power-source" cards
   * are anything that can contribute Power: a Power statistic or any Spell
   * (Alamar's Resurrection spends these to stand in for its printed Power).
   */
  costCardFilter?: "spell" | "power-source";
  /** Cost cards are removed from the game rather than discarded. */
  removeCostCards?: boolean;
};

export type TriggerDefinition = {
  event: "SPELL_CAST_STARTED" | "UNIT_ATTACK_DECLARED" | "UNIT_ACTIVATION_STARTED";
  controller: "self" | "opponent" | "any";
};

/** War machine triggers offered/resolved at the start of every combat round. */
export type WarMachineRoundStartDefinition =
  | {
      /**
       * Ballista: automatic `amount` damage to the enemy unit with the lowest
       * (effective) initiative at the start of each combat round (the owner
       * breaks a tie). The "fire 3× against the same target" volley is NOT
       * intrinsic to the Ballista — it is the Artillery ability's expert side
       * (see ARTILLERY_BALLISTA_VOLLEY and permanents.ts).
       */
      kind: "damage-lowest-initiative";
      amount: number;
    }
  | {
      /** Catapult: optionally pay the cost to damage two adjacent targets. */
      kind: "pay-to-splash";
      cost: ResourceCost;
      amount: number;
    }
  | {
      /** Cannon: spend 1 expert use to hit an enemy unit or enemy fortification. */
      kind: "expert-shot";
      amount: number;
    };

/**
 * What a Permanent card does while it stays in play next to the hero board.
 * Permanents enter play when played, survive between combats, and leave for
 * the discard pile when replaced by another permanent (or when their expert
 * effect is used).
 */
export type PermanentEffectDefinition = {
  /**
   * Schools of Magic: spells of the school gain +basicPower while the card is
   * in play; the expert effect discards the card during one of the owner's
   * casts for +expertPower instead (never both on the same spell).
   */
  schoolBonus?: { school: SpellSchool; basicPower: number; expertPower: number };
  /** Active effect applied for the owner's combats while the card is in play. */
  combatEffect?: ActiveEffectDefinition;
  /** Initiative added to the owner's ranged units while in combat. */
  rangedInitiativeBonus?: number;
  /** Trigger resolved at the start of every combat round. */
  roundStart?: WarMachineRoundStartDefinition;
  /**
   * Income artifacts (Eversmoking Ring of Sulfur, Inexhaustible Cart of Ore):
   * while the card is in play, the owner gains `amount` of `resource` at the
   * start of every Resources round (the odd rounds after the first).
   *
   * `requiresHeroInTown` (anime Tụ Linh Bàn): the income is CONDITIONAL — it is
   * paid only on a Resources round where the owner's MAIN Hero stands on one of
   * that player's own Towns. Absent/false = unconditional income (the core
   * cards). Enforced at the single income chokepoint in `startAdventureRound`.
   */
  resourceRoundGain?: { resource: ResourceKind; amount: number; requiresHeroInTown?: boolean };
  /**
   * Pandora's Gift: Income (card 174 — a PERMANENT, the printed ∞): entering
   * play rolls 1 Resource die and raises the rolled production track by one
   * income level (+5 gold / +2 materials / +1 valuables). Leaving play removes
   * that temporary production bonus, exactly as the printed reminder ("lasts
   * only as long as it is in play") requires.
   */
  incomeTierDieOnEnter?: boolean;
  /**
   * Basic School of Magic abilities (Basic Fire/Earth/Water/Air Magic): while
   * the card is in play, the owner fetches the first spell of this school from
   * the Spell deck instead of Searching it. Like every permanent it occupies the
   * single permanent slot, so the fetch stops the moment the card is replaced or
   * discarded (read via `activeSchoolFetches`).
   */
  schoolFetch?: Exclude<SpellSchool, "any">;
  /**
   * Pandora's Box "You can have up to 3 permanent cards played at a time,
   * including this one": while in play, the owner's permanent limit becomes
   * this number instead of the printed one.
   */
  permanentLimitOverride?: number;
  /** Pandora's Box "Your hand is increased by 1" while the card is in play. */
  handLimitBonus?: number;
  /**
   * Pandora's Bargain: Power — a flat bonus added to the Power of EVERY spell
   * the owner casts while the card is in play (folded into both the cast-time
   * power in getCurrentSpellPower AND the affordability/preview power in
   * standingSpellPower, so it is never display-only).
   */
  spellPowerBonus?: number;
  /**
   * Pandora's Bargain: Power — "at the end of your turn, remove this card OR
   * gain Negative Morale." While the card is in play, ending the turn first
   * opens this upkeep choice (see queuePandoraUpkeep in adventure-reducer).
   */
  endTurnUpkeep?: "remove-or-negative-morale";
};

export type CardOptionDefinition = {
  label: string;
  trigger?: TriggerDefinition;
  /** Printed extra price of this option (discard/remove cards). */
  cost?: CardPlayCost;
  /** This option may only be played outside combat (map effects). */
  mapOnly?: boolean;
  /** This option may only be played during combat. */
  combatOnly?: boolean;
  /** Polish Balance: this option closes as soon as any unit has activated. */
  combatStartOnly?: boolean;
  /**
   * "Instant" combat timing in the board-game sense: this option may be played
   * at ANY time during a Combat — on your own turn AND off-turn while an enemy
   * unit is active (its turn starting, mid-move, or just finished). Used by the
   * instant damage specialties (Gerwulf's Ballista discard, Adelaide's Frost
   * Ring, Deemer's Meteor Shower). The engine offers it off-turn through
   * addCombatAnytimeSpecialtyPlays — which feeds the off-turn combat action pass
   * AND getOffTurnCombatReactions (so it is also offered during every neutral /
   * Intelligence reaction pause). A turn-only option (e.g. Gerwulf IV's free
   * 1 damage, Gerwulf VI's ongoing aim) simply omits this flag, so it stays
   * playable only on the owner's own turn.
   */
  combatAnytime?: boolean;
  /** This option is the card's expert side: playing it spends a crown. */
  expertOnly?: boolean;
  /**
   * House-rule gate: this option is offered ONLY while the named house rule is
   * ON (e.g. Ballistics' expert bombard, Pathfinding's expert coastline/layer
   * crossing). When the rule is off the option is dropped from the offer AND
   * rejected at play (legality is validated against the offer). Absent = always
   * offered. See house-rules.ts / `houseRuleEnabled`.
   */
  requiresHouseRule?: HouseRuleId;
  /**
   * The INVERSE gate: this option is offered ONLY while the named house rule is
   * OFF. Used by the Polish Balance Pack (`polish-card-balance`) for a CLASSIC
   * side the reprinted card replaces — Pathfinding's two printed movement tiers,
   * Ballistics' Arrow-Tower demolition, the `ballistics-buff` bombard — so the
   * reprint's own sides are the only ones on the table while it is on. Dropped
   * from the offer when the rule is on AND rejected at play (legality is
   * validated against the offer). Absent = always offered.
   */
  forbidsHouseRule?: HouseRuleId;
  /**
   * House-rule gate on the option's SIDE: while the named house rule is ON the
   * option plays as its BASIC side (no crown); while the rule is OFF it becomes
   * an Expert side (spends a crown), reverting to the printed/wiki card. Used by
   * Ballistics' Arrow-Tower demolition (basic under the buff, expert without it).
   */
  expertUnlessHouseRule?: HouseRuleId;
  /**
   * Mystic Orb of Mana's second option ("Only if your discard pile is empty:
   * draw 2 cards"): the option is offered only while the player's discard pile
   * holds no cards.
   */
  requiresEmptyDiscard?: boolean;
  /**
   * Crown of the Five Seas' sea side ("If this Hero is on a Sea tile …"): the
   * option is offered only while the playing player's main Hero stands on a Sea
   * (water-terrain) field.
   */
  requiresSeaTile?: boolean;
  /**
   * Ring of the Wayfarer's paralysis side ("At start of Combat with Neutral
   * Units …"): offered only on the opening round of a Combat against Neutral
   * Units.
   */
  requiresNeutralCombatStart?: boolean;
  /**
   * Jeremy's Cannon IV/VI ("use the Cannon once"): the option is offered only
   * while the playing player has this war-machine card in play, mirroring
   * Torosar's "Activate your Ballista (if you have one)". Gated in legal-actions
   * and re-checked in the reducer so the free shot can never fire without the
   * machine.
   */
  requiresWarMachine?: CardId;
  /**
   * Pendant of Courage's repeat-Search side ("Play immediately after you perform
   * a Search action and perform that action again"): never played directly from
   * hand — it is offered as a post-Search decision (see the pendant-repeat-search
   * choice). Kept off the normal option-play list so it can only be used with
   * the printed timing.
   */
  postSearchOnly?: boolean;
  /**
   * A card side played when a Search STARTS, before any cards are revealed.
   * It is deliberately withheld from the ordinary map/combat play list and is
   * offered by the shared Search prompt instead. Unlike `postSearchOnly`, the
   * effect is installed before the triggering Search and may persist afterward.
   */
  searchStartOnly?: boolean;
  /**
   * Targ of the Rampaging Ogre's top side: "Then, instead of discarding, put
   * this card back into your hand." After the option's effect resolves the
   * played card is returned to the owner's hand instead of staying in the
   * discard pile (the cost cards it discarded stay discarded). Combat-reaction
   * artifacts only — handled in the reaction-play resolution.
   */
  returnSelfToHand?: boolean;
  /**
   * Bowstring of the Unicorn's Mane (option B): "Use this after a ranged unit's
   * Attack die roll." The post-roll die-ignore (IGNORE_ATTACK_DIE_RESULT) is only
   * offered when the attacking unit is a ranged unit — otherwise this option is
   * never offered in the ATTACK_DIE_SETTLED window.
   */
  requiresRangedAttacker?: boolean;
  /**
   * Per-option target override for a CHOOSE_ONE card whose options strike
   * different sides. Ring of the Wayfarer's initiative side buffs a friendly
   * unit (the card-level `target`) while its paralysis side hits any non-Azure
   * unit, so that option carries its own `any-unit` target. Falls back to the
   * card-level `target` when absent.
   */
  target?: TargetDefinition;
  effect: Exclude<EffectDefinition, { type: "CHOOSE_ONE" }>;
};

export type CardDefinition = {
  id: CardId;
  name: string;
  kind: "spell" | "ability" | "artifact" | "hero-specialty" | "ai" | "unit" | "statistic" | "war-machine" | "pandora";
  timing: "action" | "instant" | "reaction" | "ongoing" | "passive" | "map" | "combat" | "town";
  phaseLimit?: GamePhase[];
  spellLevel?: SpellLevel;
  spellSchools?: SpellSchool[];
  artifactTier?: ArtifactTier;
  statisticType?: StatisticType;
  abilityClass?: AbilityClass;
  tags: string[];
  power?: number;
  trigger?: TriggerDefinition;
  target?: TargetDefinition;
  /**
   * Permanent cards stay in play until discarded or replaced (their effect is
   * always on while in play). Each player may have only one permanent in play
   * at a time — the printed rule — unless a Pandora's Box permanent raises
   * the limit (permanentLimitOverride). Playing one above the limit discards
   * the oldest, and the owner may also discard one voluntarily at any time.
   */
  permanent?: boolean;
  /** Continuous behavior while a permanent card is in play. */
  permanentEffect?: PermanentEffectDefinition;
  /** War machines: purchase prices at the factory and the Trading Post. */
  warMachineCosts?: { factory: ResourceCost; tradingPost: ResourceCost };
  effect: EffectDefinition;
  assets?: {
    cardImage?: string;
    imageAlt?: string;
  };
  implementationStatus: "implemented" | "not-implemented";
  source: {
    product: string;
    credit: string;
    url?: string;
  };
};

export type CardLibrary = Record<CardId, CardDefinition>;

export type BuildingEffectDefinition =
  | { type: "GAIN_RESOURCE"; resource: ResourceKind; amount: number }
  | { type: "ADD_EXPERT_USE_LIMIT"; amount: number };

export type BuildingDefinition = {
  id: BuildingId;
  name: string;
  cost: ResourceCost;
  prerequisites?: BuildingId[];
  effect?: BuildingEffectDefinition;
  implementationStatus: "implemented" | "not-implemented";
  source: {
    product: string;
    credit: string;
    url?: string;
  };
};

export type BuildingLibrary = Record<BuildingId, BuildingDefinition>;

export type ReactionPlay = {
  cardId: CardId;
  mode?: CardPlayMode;
  optionIndex?: number;
  /** Cards from hand paying the option's printed discard/remove cost. */
  costCardIds?: CardId[];
  /**
   * Parallel to costCardIds: "expert" values a Power source at its expertAmount
   * and spends one crown when paying a Power-value cost. Index-aligned.
   */
  costCardModes?: CardPlayMode[];
  /** Play this Spell card for its alternative "+1 Power" bottom effect. */
  asPowerBoost?: boolean;
  /**
   * Draw-rider-only play (see PLAY_REACTION.drawOnly): only the card-draw rider
   * resolves; the primary effect deliberately fizzles. Must ride the batch too,
   * or a batched draw-only pick would resolve the full effect.
   */
  drawOnly?: true;
  /** Utility card gain that joins an existing window but never opens one. */
  utilityOnly?: true;
};

export type DeckSearchPick = {
  kind: "revealed";
  index: number;
  /** Tarnum (Conflux) I: Remove the picked card from the game instead of taking it to hand. */
  remove?: boolean;
};

/**
 * Which deck a Thieves' Guild peek targets: a shared deck (keyed by its id) or a
 * player's personal Might & Magic deck (keyed by that player's id — own or
 * opponent's).
 */
export type ThievesGuildTarget =
  | { kind: "shared"; deckId: DeckId }
  | { kind: "player"; ownerId: PlayerId };

export type GameAction =
  | {
      type: "CAST_SPELL";
      playerId: PlayerId;
      cardId: CardId;
      target: TargetRef;
      /**
       * CHOOSE_ONE spell cast directly: which arm is being cast. Used by the
       * trigger-free, directly-castable arms (Prayer's +initiative side) — the
       * caster picks the option up front and the spell-cast resolution resolves
       * that option's effect. The triggered arms (Prayer's +attack/+defense)
       * carry their own trigger and are played as reactions, not via CAST_SPELL.
       */
      optionIndex?: number;
      /**
       * Spell Scroll cast: the spell comes from this scroll (not the hand),
       * resolves at power 0, cannot be boosted by any Power source, is removed
       * from the game once it resolves, and does NOT count toward the
       * one-Spell-per-combat-round limit.
       */
      fromScroll?: string;
      /**
       * Helm of the Alabaster Unicorn (option B): the spell is cast from the top
       * of the shared Spell-deck discard pile (not the hand). It resolves at the
       * caster's normal Power, the spell card stays in that discard pile, and the
       * Helm card named here is removed from the game once the cast resolves.
       */
      fromSpellDeck?: CardId;
      /**
       * Ciele IV (Conflux): paired with `fromSpellDeck` (the enabling hero
       * specialty), this marks the free cast as sourced from the caster's OWN
       * discard pile rather than the shared Spell-deck discard. The Magic Arrow
       * stays in the player's discard across the cast (like a Helm cast leaves its
       * spell in the shared discard), and the specialty cycles to discard.
       */
      fromOwnDiscard?: boolean;
      /**
       * Spell Book (house rule): the Spell is cast from the player's Spell Book
       * (PlayerState.spellBook), not the hand. It casts at the caster's normal
       * Power, counts toward the one-Spell-per-combat-round limit exactly like a
       * hand cast, and moves Book → discard pile when it resolves. Mutually
       * exclusive with fromScroll / fromSpellDeck (each names a distinct source).
       */
      fromSpellBook?: boolean;
      /** Polish Book cast: the generic hand card consumed to enable this Spell. */
      castEnablerCardId?: CardId;
      /**
       * Tarnum (Conflux) VI: this hand spell is one of the just-Searched cards
       * flagged for a free over-limit cast. It does not count toward the
       * per-round Spell limit, and on resolution the card returns to the shared
       * Spell deck — `tarnumReturn` says whether to its top ("deck-top") or its
       * discard pile ("discard"), the caster's choice.
       */
      tarnumReturn?: "deck-top" | "discard";
      /**
       * Schools of Magic (Air/Earth/Fire/Water Magic) in play: the caster may
       * decide AS PART OF the cast to discard the matching permanent for its
       * expert power bonus (+3 instead of the standing +1; costs one expert use).
       * Decided up front so a normal cast just applies the +1 and resolves —
       * never popping an extra expert prompt.
       */
      useSchoolExpert?: boolean;
      /**
       * Basic X Magic (Conflux fetch permanent) in play: the caster may decide AS
       * PART OF the cast to spend one expert use for its +3 Power on a matching-
       * school spell. Unlike `useSchoolExpert` the permanent is NOT discarded — it
       * stays in play. Decided up front so the +3 is folded before the cast
       * resolves, mirroring the standalone USE_SCHOOL_FETCH_EXPERT reaction. The
       * reducer re-validates (permanent present, school match, crown) — never
       * trusts the flag.
       */
      useSchoolFetchExpert?: boolean;
      /**
       * Polish Balance Pack — the reprinted EXPERT Eagle Eye: this is the COPY of
       * an enemy Spell that just resolved against one of the caster's units. The
       * spell card itself is never moved (it is not the caster's); the Eagle Eye
       * ability is discarded and a crown spent instead, the copy resolves at base
       * Power 0 (boostable), and it does not count toward the per-round Spell
       * limit. Validated against `combatStats.eagleEyeCopySpellId`.
       */
      eagleEyeCopy?: boolean;
    }
  | {
      type: "PLAY_CARD";
      playerId: PlayerId;
      cardId: CardId;
      target?: TargetRef;
      mode?: CardPlayMode;
      optionIndex?: number;
      /** Resolve only an unconditional card-draw rider; the primary effect has no valid map context. */
      drawOnly?: true;
      /** Cards from hand paying the option's printed discard/remove cost. */
      costCardIds?: CardId[];
      /**
       * Parallel to costCardIds: when paying a Power-value cost, each entry may
       * be "expert" so a Power statistic/ability contributes its expertAmount
       * and spends one crown (map View Air tiers, Dimension Door, …). Absent or
       * "basic" uses the printed basic amount. Index-aligned with costCardIds.
       */
      costCardModes?: CardPlayMode[];
      /** Map plays of specialty transforms: the army unit card to cover. */
      armyUnitId?: string;
      /**
       * Spell Book (house rule): a Map Spell played from the player's Spell Book
       * (PlayerState.spellBook) rather than the hand. Resolves exactly like the
       * hand play and moves Book → discard pile. Only ever set for Spell cards.
       */
      fromSpellBook?: boolean;
      /** Polish Book play: the generic hand card consumed to enable this Spell. */
      castEnablerCardId?: CardId;
    }
  | {
      type: "ATTACK_UNIT";
      playerId: PlayerId;
      attackerId: UnitId;
      defenderId: UnitId;
      /**
       * Set when the attack is a printed-ability follow-up (Liches' Death
       * Cloud): the base attack value replaces the unit's, the target may be
       * any unit (friend, foe, or the attacker itself), and the attack never
       * chains further follow-ups or retaliations of its own.
       */
      abilityAttack?: { abilityId: string; baseAttack: number };
    }
  | {
      type: "MOVE_AND_ATTACK_UNIT";
      playerId: PlayerId;
      attackerId: UnitId;
      destination: number;
      defenderId: UnitId;
    }
  | {
      type: "MOVE_UNIT";
      playerId: PlayerId;
      unitId: UnitId;
      destination: number;
      /**
       * Optional player-chosen route: the spaces the unit ENTERS in order
       * (start-exclusive, `destination` last). Lets the player decide whether to
       * brave a Fire Wall rather than always taking the engine's auto safe path.
       * Must be a legal orthogonal walk within range that avoids blocked spaces
       * (units / obstacles / Force Fields); omitted = the engine auto-routes.
       * Ignored for flying units (they never enter the spaces they pass over).
       */
      path?: number[];
    }
  | {
      type: "USE_UNIT_ABILITY";
      playerId: PlayerId;
      unitId: UnitId;
      abilityId: string;
      target: TargetRef;
      /** MGQ White Magic's explicit choice for the selected adjacent ally. */
      mode?: "heal" | "attack";
    }
  | {
      /**
       * Pit Lords' "Summon Demons" other action: instead of moving/attacking,
       * summon a Few of Demons onto an empty adjacent space, reinforce a
       * friendly Few of Demons up to a Pack, or (with Unit Stacks on) add one
       * free Stack layer to a living Pack of Demons below its cap. Once per
       * combat per Pit Lords unit.
       */
      type: "SUMMON_DEMONS";
      playerId: PlayerId;
      unitId: UnitId;
      mode: "summon" | "reinforce" | "stack";
      /** Summon: the empty space to place the new Few of Demons on. */
      position?: number;
      /** Reinforce / stack: the friendly Demons target. */
      targetUnitId?: UnitId;
    }
  | {
      /**
       * Tower Genies (Few) "Wish" other action: instead of moving/attacking,
       * discard cards from the top of your deck and take a Spell discarded this
       * way to your hand.
       */
      type: "USE_GENIE_DECK_DRAW";
      playerId: PlayerId;
      unitId: UnitId;
    }
  | { type: "USE_ACTIVE_EFFECT"; playerId: PlayerId; effectId: string; target: TargetRef; mode?: CardPlayMode }
  | {
      /**
       * WOG Commanders: spend ONE stat point to raise a single stat by one
       * grade (max grade 3). Points are earned on hero level-ups.
       */
      type: "COMMANDER_GRADE_UP";
      playerId: PlayerId;
      stat: CommanderStatKey;
    }
  | {
      /**
       * WOG Commanders: pay gold (2 + 2x hero level) on your own map turn to
       * bring a dead commander back for its next combat.
       */
      type: "REVIVE_COMMANDER";
      playerId: PlayerId;
    }
  | {
      /**
       * Commander Forge: buy one of the two deterministic, currently offered
       * artifacts. Grade I is a separate once-per-game use from the shared
       * once-per-game Grade II/III use.
       */
      type: "FORGE_COMMANDER_ARTIFACT";
      playerId: PlayerId;
      tier: "minor" | "major" | "relic";
      cardId: CardId;
    }
  | {
      /**
       * Anime Cultivation (anime.cultivation, §5.6): the main hero, at Core
       * Formation (realm 2) with level ≥ 7 and no won Tribulation yet, braves
       * the Heavenly Tribulation (Độ kiếp) — a seeded 3-Attack-die gauntlet on
       * the map (no battlefield). NEVER forced; offered at most once per own
       * turn. Handler-validated (self-validating; opens a pendingVisit).
       */
      type: "HEAVEN_TRIBULATION";
      playerId: PlayerId;
    }
  | {
      /**
       * Hierophant commander: resolve the post-combat First Aid window —
       * restore the chosen casualty (optionIndex) or decline (null).
       */
      type: "COMMANDER_FIRST_AID";
      playerId: PlayerId;
      optionIndex: number | null;
    }
  | {
      /**
       * Superior Combat specialty (Shaman / Sea Marshal): set the commander's
       * combat-setup stance — +1 Attack or +1 Defense, applied at the start of
       * each of its combats. Chosen outside combat on the commander card.
       */
      type: "COMMANDER_SET_STANCE";
      playerId: PlayerId;
      stance: "attack" | "defense";
    }
  | {
      /** Sonya: bind Unbreakable Bond to one persistent army card outside combat. */
      type: "COMMANDER_SET_BOND";
      playerId: PlayerId;
      armyUnitId: string;
    }
  | {
      /**
       * Anime Hero Grades (anime.heroGrades, §3.11): TRAIN on your own map turn —
       * spend 2 movement points to gain 1 Merit (grade progress). Once per own
       * turn. Handler-validated (self-validating).
       */
      type: "HERO_TRAIN";
      playerId: PlayerId;
    }
  | {
      /**
       * Unit Experience: Drill one army unit for +1 XP. This costs no movement
       * at a Town/Settlement/Random Town and 1 movement elsewhere on the map.
       * Tier/Neutral pricing and hero-level uses are validated by the reducer.
       * Handler-validated (self-validating).
       */
      type: "DRILL_UNIT";
      playerId: PlayerId;
      armyUnitId: string;
    }
  | {
      /** MGQ: assign or replace the persistent Job token on one eligible card. */
      type: "ASSIGN_UNIT_JOB";
      playerId: PlayerId;
      armyUnitId: string;
      job: MgqJob;
    }
  | {
      /** MGQ: select one built Spirit contract outside combat for the next fight. */
      type: "SET_MGQ_SPIRIT";
      playerId: PlayerId;
      spirit: MgqSpirit;
    }
  | {
      /** MGQ post-combat seal: choose one offered Neutral or decline with null. */
      type: "RESOLVE_COMPANION_RECRUITMENT";
      playerId: PlayerId;
      unitDefId: string | null;
    }
  | {
      /**
       * Polish Set Artifacts (`polish-set-artifacts`): the "at the beginning of
       * the combat select 1 unit" tier (Angelic Alliance 2 / Ironfist of the Ogre
       * 2 / Armor of the Damned 2). OPTIONAL, once per combat per set, and only
       * during combat ROUND 1 (the printed "beginning of the combat"). Resolving
       * it stamps the pick and lays a combat-duration INITIATIVE_BONUS on the
       * chosen unit, so the activation order really shifts.
       * Handler-validated (self-validating).
       */
      type: "SELECT_ARTIFACT_SET_UNIT";
      playerId: PlayerId;
      setId: string;
      unitId: string;
    }
  | {
      /**
       * Polish Set Artifacts: activate one live set tier. `tier` is the tier's
       * piece THRESHOLD (2, 3, …). `unitId` is required by the unit-targeting
       * tiers, `neutralTier` by the Diplomat's Cloak scry. Every tier is OPTIONAL
       * — nothing is ever forced and no window is opened by the engine, so this
       * action can never stall a seat. Handler-validated (self-validating).
       */
      type: "USE_ARTIFACT_SET_POWER";
      playerId: PlayerId;
      setId: string;
      tier: number;
      unitId?: string;
      neutralTier?: "bronze" | "silver" | "gold" | "azure";
    }
  | {
      /**
       * Anime Hero Grades: spend one unspent grade point to pick a tree node
       * (one node per tier, tier ≤ current grade). Handler-validated
       * (self-validating; the node is baked into the action, so no window opens).
       */
      type: "HERO_GRADE_PICK";
      playerId: PlayerId;
      nodeId: string;
    }
  | {
      /** Artifact Broker: sell one Artifact from hand for 4 gold; remove it. */
      type: "HERO_GRADE_SELL_ARTIFACT";
      playerId: PlayerId;
      cardId: CardId;
    }
  | {
      /**
       * Hero Equipment: move an owned inventory item onto its catalog-defined
       * body slot. If that slot is occupied the two items swap. This is the
       * engine action used by both drag/drop and the accessible Equip button.
       */
      type: "EQUIP_HERO_ITEM";
      playerId: PlayerId;
      equipmentId: string;
      slot: AnimeEquipmentSlot;
    }
  | {
      /** Move the item in one body slot back into the hero's equipment bag. */
      type: "UNEQUIP_HERO_ITEM";
      playerId: PlayerId;
      slot: AnimeEquipmentSlot;
    }
  | {
      /**
       * Anime Hero Grades: use a "skill" tree node's ACTIVE — Forced March on the
       * map (+1 movement, once per round) or War Cry during your own unit's combat
       * activation (+1 Attack this activation, once per combat). `unitId` is the
       * acting unit for combat actives; omitted for map actives.
       */
      type: "USE_HERO_SKILL";
      playerId: PlayerId;
      nodeId: string;
      unitId?: UnitId;
    }
  | {
      /**
       * Anime Hero Grades: use a "skill" tree node as an instant REACTION inside
       * an open attack window — Battle Focus (+1 Attack on your attacking unit) or
       * Iron Will (+1 Defense on your attacked unit). Once per combat.
       */
      type: "USE_HERO_SKILL_REACTION";
      playerId: PlayerId;
      nodeId: string;
      unitId: UnitId;
    }
  | {
      /** Reactive Buckler: +1 Defense for the currently declared attack. */
      type: "USE_EQUIPMENT_DEFENSE_REACTION";
      playerId: PlayerId;
      unitId: UnitId;
    }
  | {
      /** Duelist Insignia / Clockwork Spurs: select their combat-long unit. */
      type: "SELECT_EQUIPMENT_COMBAT_UNIT";
      playerId: PlayerId;
      equipmentId: string;
      unitId: UnitId;
    }
  | {
      /** Corrosion Edge / Wyvern Needle: arm one rider on this declared attack. */
      type: "USE_EQUIPMENT_ATTACK_RIDER";
      playerId: PlayerId;
      equipmentId: string;
      unitId: UnitId;
    }
  | {
      /** Field Medic Kit: heal one allied unit for 1 in an open combat window. */
      type: "USE_EQUIPMENT_HEAL_REACTION";
      playerId: PlayerId;
      unitId: UnitId;
    }
  | {
      /** Guardian Mirror: cancel this attack's damage and suppress retaliation. */
      type: "USE_EQUIPMENT_GUARDIAN_REACTION";
      playerId: PlayerId;
      unitId: UnitId;
    }
  | { type: "DEFEND_UNIT"; playerId: PlayerId; unitId: UnitId }
  | { type: "END_ACTIVATION"; playerId: PlayerId; unitId: UnitId }
  | {
      /**
       * Polish Wait house rule: the active unit takes a Wait token (lowest free
       * number) and ends its main-phase activation; it re-activates after every
       * non-waiting unit has acted, highest token first.
       */
      type: "WAIT_UNIT";
      playerId: PlayerId;
      unitId: UnitId;
    }
  | { type: "END_COMBAT_ROUND"; playerId: PlayerId }
  | { type: "BUILD_STRUCTURE"; playerId: PlayerId; townId: TownId; buildingId: BuildingId }
  | { type: "COMPLETE_SIMULTANEOUS_TURN"; playerId: PlayerId }
  | {
      type: "REROLL_PENDING_CHOICE";
      playerId: PlayerId;
      choiceId: string;
      /**
       * Positive Morale "set one of the dice to the +1 side": spend the held
       * set-die source instead of the next reroll source. The die is SET, not
       * rerolled — the optimal die of the current candidate flips to the face.
       */
      useSetDie?: boolean;
    }
  | { type: "CHOOSE_PENDING_ROLL"; playerId: PlayerId; choiceId: string; candidateIndex: number }
  | {
      type: "PLAY_REACTION";
      playerId: PlayerId;
      cardId: CardId;
      mode?: CardPlayMode;
      optionIndex?: number;
      /**
       * An Instant with a printed draw rider used outside the primary effect's
       * trigger (for example Offense during a spell window). Only the card-draw
       * rider resolves; the attack/defense/Power/heal effect deliberately fizzles.
       */
      drawOnly?: true;
      /** Utility card gain that may join an existing window but does not open one by itself. */
      utilityOnly?: true;
      costCardIds?: CardId[];
      /**
       * Parallel to costCardIds: when paying a Power-value cost (Sorrow, Alamar's
       * Resurrection, …), each entry may be "expert" so a Power statistic/ability
       * contributes its expertAmount and spends one crown. Absent or "basic" uses
       * the printed basic amount. Index-aligned with costCardIds.
       */
      costCardModes?: CardPlayMode[];
      /**
       * Bowstring of the Unicorn's Mane (option A): the friendly ranged unit to
       * activate out of order in the pre-activation window. Reactions that pick a
       * unit carry it here (most reactions target the window's trigger implicitly).
       */
      target?: TargetRef;
      /** Discard this Spell card for its alternative "+1 Power" effect. */
      asPowerBoost?: boolean;
      /**
       * Spell Book (house rule): the reaction Spell — whether played for its
       * instant effect or discarded `asPowerBoost` for +1 Power — comes from the
       * player's Spell Book (PlayerState.spellBook), not the hand, and moves Book →
       * discard pile. An `asPowerBoost` play from the Book is capped at ONE per
       * turn (combatStats.spellBookPowerUsedThisTurn). Book plays are single-card
       * only: the batch path (PLAY_REACTIONS) never carries them.
       */
      fromSpellBook?: boolean;
      /** Polish Book reaction: generic Cast-a-Spell card consumed from hand. */
      castEnablerCardId?: CardId;
      /** Polish Balance Interference: choose the Power-reduction arm. */
      interferenceMode?: "damage" | "power";
      /**
       * Spell Scroll reaction: the spell instant comes from this scroll, not
       * the hand. It resolves at power 0 (no boosts, no expert side), is removed
       * from the game once played, and does NOT count toward the one-Spell-per-
       * combat-round limit.
       */
      fromScroll?: string;
      /**
       * Tarnum (Conflux) VI: this reaction Spell is a just-Searched, flagged card
       * cast for FREE over the per-round limit. It does not count toward the limit
       * and, instead of the caster's discard, returns to the shared Spell deck —
       * its top ("deck-top") or its discard pile ("discard"), the caster's choice.
       */
      tarnumReturn?: "deck-top" | "discard";
    }
  | {
      /**
       * Plays several instant cards in one declaration (e.g. two Attack cards
       * plus an artifact on the same attack), exactly like dropping a stack of
       * instants on the table at once. Spell-cancel and recall effects must be
       * played alone through PLAY_REACTION.
       */
      type: "PLAY_REACTIONS";
      playerId: PlayerId;
      plays: ReactionPlay[];
    }
  | { type: "PASS_REACTION"; playerId: PlayerId }
  | {
      /**
       * Lethal-save window: cancel the killing blow with a unit ability instead
       * of a card (Archangels' once-per-combat Resurrection). The named unit
       * must be the one whose ability does the saving.
       */
      type: "USE_UNIT_RESURRECTION";
      playerId: PlayerId;
      savingUnitId: UnitId;
    }
  | {
      /**
       * WOG Commanders module: play a commander's INSTANT-REACTION defend buff
       * (Hierophant's Shield, Ogre Leader's Stone Skin) in an open attack window,
       * buffing the attacked unit's Defense before the hit's damage is computed.
       * `commanderUnitId` is the reacting commander; `targetUnitId` is the unit
       * under attack (the trigger's defender).
       */
      type: "USE_COMMANDER_CAST_REACTION";
      playerId: PlayerId;
      commanderUnitId: UnitId;
      targetUnitId: UnitId;
    }
  | {
      /** WOG War Zealot: free innate Magic Mirror, without a card or spell-limit cost. */
      type: "USE_UNIT_MAGIC_MIRROR";
      playerId: PlayerId;
      unitId: UnitId;
    }
  | {
      /**
       * Post-roll die-cancel window: a defending unit ignores the attacker's
       * settled Attack die by paying its own ability cost — Castle Halberdiers
       * (Pack) "discard a card and ignore the Attack die's roll result". The
       * named unit is the defender that owns the ability; the cost is one card
       * discarded from its controller's hand.
       */
      type: "USE_UNIT_DIE_IGNORE";
      playerId: PlayerId;
      defenderUnitId: UnitId;
      /** The controller chooses which card pays the printed discard cost. */
      discardCardId: CardId;
    }
  | { type: "SEARCH_DECK"; playerId: PlayerId; deckId: DeckId; count: number }
  | { type: "RESOLVE_DECK_SEARCH"; playerId: PlayerId; choiceId: string; pick: DeckSearchPick }
  /**
   * Combat test mode only: drop any card straight into a player's hand so a
   * tester can exercise its mechanic without searching for it. Rejected outside
   * the combat sandbox; see sandboxAddCard.
   */
  | { type: "SANDBOX_ADD_CARD"; playerId: PlayerId; cardId: CardId }
  /**
   * Battle Test free setup: edit one seat's faction / hero / units / cards /
   * morale / commander grades. Only legal while phase is "setup" with a
   * combatSandboxSetup present.
   */
  | {
      type: "SANDBOX_CONFIGURE_SEAT";
      playerId: PlayerId;
      seatId: PlayerId;
      factionId?: FactionId;
      heroDefId?: string;
      heroLevel?: number;
      name?: string;
      units?: CombatSandboxUnitPick[];
      hand?: CardId[];
      deck?: CardId[];
      morale?: number;
      moraleCards?: { positive: CardId[]; negative: CardId[] };
      commanderGrades?: Partial<Record<CommanderStatKey, number>>;
      commanderGradePoints?: number;
    }
  /**
   * Battle Test free setup: battlefield art, obstacle cells, morale-cards rule,
   * WOG modules, BINH vs Tournament play mode.
   */
  | {
      type: "SANDBOX_SET_OPTIONS";
      playerId: PlayerId;
      options: {
        boardArtId?: CombatBoardArtId | "random";
        obstacles?: number[];
        moraleCards?: boolean;
        wog?: Partial<WogModOptions>;
        playMode?: CombatSandboxPlayMode;
      };
    }
  /** Battle Test free setup: materialise the setup into a live sandbox fight. */
  | { type: "SANDBOX_BEGIN_COMBAT"; playerId: PlayerId }
  | { type: "MOVE_HERO"; playerId: PlayerId; heroId: HeroId; to: MapSpaceId }
  | {
      /**
       * Click-to-move: walk the hero along consecutive adjacent fields, one MP
       * per step. Walking stops early when something needs input (a guard
       * fight, a visit choice) or movement points run out.
       */
      type: "MOVE_HERO_PATH";
      playerId: PlayerId;
      heroId: HeroId;
      path: MapSpaceId[];
    }
  | {
      /**
       * Start-of-turn mulligan (and forced discard when over the hand limit):
       * discard the listed cards, then draw that many back up to the limit.
       */
      type: "REFRESH_HAND";
      playerId: PlayerId;
      discardCardIds: CardId[];
    }
  | {
      /**
       * Explorers (Astrologers Proclaim): resolve the distinct post-draw
       * "discard any number" step. Unlike REFRESH_HAND this never draws
       * replacement cards; every three discarded cards grant one optional
       * Statistic-to-Empowered-Statistic exchange.
       */
      type: "RESOLVE_EXPLORERS_DISCARD";
      playerId: PlayerId;
      discardCardIds: CardId[];
    }
  | {
      /**
       * First-round starting-hand Mulligan (OPTIONAL, GameSetupOptions
       * .startingHandMulligan): in ROUND 1 only, after the mandatory start-of-turn
       * draw, replace ONE hand card — discard it to the BOTTOM of your own deck
       * and draw one — consuming one of the player's FIRST_ROUND_MULLIGAN_LIMIT
       * replacements. Repeatable (one card at a time) until the budget runs out.
       * RETIRED in favour of {@link OPENING_HAND_MULLIGAN}; kept for legacy
       * snapshots that still carry firstRoundMulligansLeft.
       */
      type: "MULLIGAN_CARD";
      playerId: PlayerId;
      cardId: CardId;
    }
  | {
      /**
       * First-round opening-hand Mulligan (OPTIONAL, default ON): after the
       * mandatory start-of-turn fill-to-limit (REFRESH_HAND), discard 0–N hand
       * cards to the BOTTOM of your own deck and draw the SAME number. Armed
       * only while `player.canOpeningMulligan` is set (round 1, option ON).
       * Empty discardCardIds = keep the full opening hand.
       */
      type: "OPENING_HAND_MULLIGAN";
      playerId: PlayerId;
      discardCardIds: CardId[];
    }
  | {
      /**
       * Spell Book (house rule): move a Spell card from hand into the player's
       * Spell Book, freeing the hand slot WITHOUT drawing a replacement. Legal
       * only on the player's own map turn (no combat / reaction / pending choice),
       * for a Spell currently in hand, while the rule is on.
       */
      type: "MOVE_SPELL_TO_SPELL_BOOK";
      playerId: PlayerId;
      cardId: CardId;
    }
  | {
      /**
       * Astrologers Hero: during one chosen turn while Hero is face up, pay gold
       * to remove this hand Statistic and gain its same-type Empowered version.
       */
      type: "ASTROLOGERS_HERO_EMPOWER";
      playerId: PlayerId;
      cardId: CardId;
    }
  | { type: "REVISIT_FIELD"; playerId: PlayerId; heroId: HeroId }
  /**
   * Build a carried Grail at the hero's current Town/Settlement (map-maker
   * `objectives.grailBuildAt`). Moves grail status to "built", grants the
   * optional build reward, and the location's controller scores possession VP.
   */
  | { type: "BUILD_GRAIL"; playerId: PlayerId; heroId: HeroId }
  | {
      /**
       * Open the Trading Post / War Machine Factory panel for a hero parked on
       * a market field. Free and repeatable — unlike REVISIT_FIELD it costs no
       * movement point, so the market stays available while any of the player's
       * heroes (Main or Secondary) sits on the tile.
       */
      type: "OPEN_MARKET";
      playerId: PlayerId;
      heroId: HeroId;
    }
  | { type: "DISCOVER_TILE"; playerId: PlayerId; heroId: HeroId; tileInstanceId: string }
  | {
      /** Place one of the player's face-down Far (II–III) tiles from supply. */
      type: "PLACE_TILE";
      playerId: PlayerId;
      heroId: HeroId;
      supplyIndex: number;
      centerRow: number;
      centerCol: number;
    }
  | {
      /**
       * Redwood Observatory: instead of flipping an adjacent face-down tile, drop
       * one of the visiting player's face-down Far (Ⅱ–Ⅲ) supply tiles into an
       * open border slot next to the observatory (no movement cost). Resolves the
       * open DISCOVER_ADJACENT_TILE visit step.
       */
      type: "PLACE_OBSERVATORY_TILE";
      playerId: PlayerId;
      supplyIndex: number;
      centerRow: number;
      centerCol: number;
    }
  | {
      /**
       * Chooses the final rotation of a just-revealed or just-placed tile
       * ("You may always rotate Map Tiles when placing or revealing them").
       */
      type: "SET_TILE_ROTATION";
      playerId: PlayerId;
      tileInstanceId: string;
      rotation: number;
    }
  | {
      /** Resolves the current pending visit step (choice index / pay option / skip). */
      type: "RESOLVE_VISIT_STEP";
      playerId: PlayerId;
      optionIndex?: number;
      decline?: boolean;
    }
  | {
      /** Trade resources at a Trading Post (rate index from TRADE_RATES). */
      type: "TRADE_RESOURCES";
      playerId: PlayerId;
      rateIndex: number;
    }
  | {
      /**
       * Buy a war machine from the shared supply during an open Trading Post
       * (higher price) or War Machine Factory (lower price) visit. The card
       * goes to the buyer's hand and the purchase ends the visit.
       */
      type: "BUY_WAR_MACHINE";
      playerId: PlayerId;
      cardId: CardId;
    }
  | {
      /**
       * Sell one Spell Scroll spell at an open Trading Post (market) for
       * 2 gold. The spell leaves the scroll (and the game); an emptied scroll
       * is removed too.
       */
      type: "SELL_SCROLL_SPELL";
      playerId: PlayerId;
      scrollId: string;
      cardId: CardId;
    }
  | {
      /**
       * Basic X Magic (the in-play spell-fetch permanent): spend an expert use
       * for +3 Power on a matching-school spell — a normal cast (into
       * schoolPowerBonus) or an instant played into an attack (into the caster's
       * attack-window Power pool). Unlike the card School-of-Magic expert it
       * discards nothing; the fetch permanent stays in play.
       */
      type: "USE_SCHOOL_FETCH_EXPERT";
      playerId: PlayerId;
      school: SpellSchool;
    }
  | {
      /**
       * Voluntarily put one of your in-play permanents into the discard pile
       * ("The player may decide to put an active permanent card into their
       * discard pile. This stops the card effect immediately.").
       */
      type: "DISCARD_PERMANENT";
      playerId: PlayerId;
      cardId: CardId;
    }
  | {
      /** Voluntarily end an Ongoing card, remove its live effects, and discard it. */
      type: "DISCARD_ONGOING_CARD";
      playerId: PlayerId;
      cardId: CardId;
    }
  | {
      /**
       * Income permanents (Eversmoking Ring of Sulfur, Inexhaustible Cart of
       * Ore): "crack open" the in-play card for its one-off instant gain (the
       * card's CHOOSE_ONE "Remove this card: gain …" side), removing it from the
       * game instead of leaving it in play. Lets the instant side be used AFTER
       * the income side was already chosen and the card sits in the permanent
       * slot.
       */
      type: "CRACK_PERMANENT";
      playerId: PlayerId;
      cardId: CardId;
    }
  | { type: "PLACE_COMBAT_UNIT"; playerId: PlayerId; armyUnitId: string; position: number }
  | { type: "UNPLACE_COMBAT_UNIT"; playerId: PlayerId; armyUnitId: string }
  | { type: "FINISH_COMBAT_PLACEMENT"; playerId: PlayerId }
  | {
      /**
       * Player-vs-player pre-battle preparation: a participant (attacker or
       * defender) readies up after any town actions. Deployment begins only once
       * BOTH participants have accepted. Validated in acceptCombat.
       */
      type: "ACCEPT_COMBAT";
      playerId: PlayerId;
    }
  | {
      /**
       * Tactics ability: switch the positions of two of your own units, either
       * in the start-of-combat Tactics window (free) or on your turn before your
       * active unit moves (expert, spends one expert use). Both spend the Tactics
       * card. Validated in swapCombatUnits.
       */
      type: "SWAP_COMBAT_UNITS";
      playerId: PlayerId;
      unitIdA: UnitId;
      unitIdB: UnitId;
    }
  | {
      /**
       * Polish Balance Pack — the reprinted Tactics: BOTH sides gain the OR arm
       * "Move one of your units 1 space". Same two windows as the swap (the
       * start-of-combat setup window and the expert mid-combat play, which spends
       * a crown), same card spend; the destination is enumerated per offer, so no
       * follow-up choice is opened. Only legal while `polish-card-balance` is on.
       */
      type: "TACTICS_MOVE_UNIT";
      playerId: PlayerId;
      unitId: UnitId;
      position: number;
    }
  | {
      /** Decline a start-of-combat Tactics swap window without swapping. */
      type: "FINISH_TACTICS";
      playerId: PlayerId;
    }
  | {
      /**
       * PvP Neutral Control: the controller sorts the revealed Neutral formation
       * before battle — move a guard to an empty defender-zone cell, or swap it
       * with another guard there. Validated in placeNeutralGuard.
       */
      type: "PLACE_NEUTRAL_GUARD";
      playerId: PlayerId;
      unitId: UnitId;
      position: number;
    }
  | {
      /** Finish the Neutral formation sort and start the battle. */
      type: "FINISH_NEUTRAL_PLACEMENT";
      playerId: PlayerId;
    }
  | {
      /**
       * WOG Commanders pre-combat sort: move the commander or one of its allied
       * units within the deployment zone, swapping with another allied unit.
       * Omitting unitId retains the original commander-only command shape.
       */
      type: "PLACE_COMMANDER";
      playerId: PlayerId;
      unitId?: UnitId;
      position: number;
    }
  | {
      /** Finish the commander's pre-combat sort (→ next owner, or round 1). */
      type: "FINISH_COMMANDER_PLACEMENT";
      playerId: PlayerId;
    }
  | {
      /**
       * Manual guard control: during the pre-battle sort, reset the Neutral
       * formation to the rulebook AI's auto-placement (shooters to the back
       * row), leaving the sort window open. "Let the AI place them" / return to
       * AI auto control. Legal only for the manual-control fighter arranging
       * their OWN guards (never a PvP-Neutral-Control opponent).
       */
      type: "AUTO_NEUTRAL_PLACEMENT";
      playerId: PlayerId;
    }
  | { type: "CONTINUE_NEUTRAL_COMBAT"; playerId: PlayerId }
  | { type: "CONTINUE_NEUTRAL_STEP"; playerId: PlayerId }
  /**
   * Manual guard control: the fighter hands the CURRENT guard's activation to
   * the rulebook Neutral AI instead of commanding it by hand ("Let the unit
   * act"). Legal only while `adventure.manualGuardControl` assigns them the
   * guards and the active Neutral unit has not begun to act.
   */
  | { type: "AUTO_NEUTRAL_ACTIVATION"; playerId: PlayerId }
  | { type: "RETREAT_FROM_COMBAT"; playerId: PlayerId }
  | {
      /**
       * Player-vs-player combats (house rule): at the start of the combat
       * (round 1) a participating hero may Surrender for a flat 10-gold toll
       * paid to the opponent — they keep their whole army, take no morale hit,
       * return home, and the opponent gains nothing toward winning. Offered
       * only with the full 10 gold in hand, and blocked while the player is
       * under Shackles of War.
       */
      type: "SURRENDER_COMBAT";
      playerId: PlayerId;
    }
  | {
      /**
       * Give up a player-vs-player combat at any point once it is under way (a
       * concede, not the start-of-combat Surrender; Neutral-guard fights have no
       * Give up, only the end-of-round Retreat). It is always a defeat — the same
       * loss consequences as a Retreat (5-gold toll, -1 morale, fall back home,
       * the opponent gains the win and its credit). The troop cost depends on the
       * lobby's PvP casualty mode: in losing-troop mode only the casualties taken
       * up to the point of conceding are lost (survivors fall back, exactly like
       * a Retreat); in keep-troops mode it keeps every unit but discards its
       * entire hand. Offered to a participating hero throughout the fight.
       * Validated in giveUpCombat / finalizeAdventureCombat.
       */
      type: "GIVE_UP_COMBAT";
      playerId: PlayerId;
    }
  | {
      /**
       * Close the end-of-combat notice: finalizes an adventure combat
       * (experience, unit flips, the field visit) and returns to the map.
       */
      type: "ACKNOWLEDGE_COMBAT_END";
      playerId: PlayerId;
    }
  | {
      /** Dismiss the opening first-player roll and release round-one play. */
      type: "ACKNOWLEDGE_FIRST_PLAYER_ROLL";
      playerId: PlayerId;
    }
  | {
      /**
       * Resolve the atomic after-combat Necromancy window. Any selected
       * Necromancy/Legion/gold bonuses and reinforcements are final; unused
       * Necromancy banks expire, then the withheld combat/field reward releases.
       * The legacy action name is kept for protocol compatibility.
       */
      type: "SKIP_NECROMANCY";
      playerId: PlayerId;
    }
  | {
      /** Population token: recruit, reinforce, or buy Pack Stack layers. */
      type: "POPULATION_ACTION";
      playerId: PlayerId;
      purchases: { kind: "recruit" | "reinforce" | "stack"; unitDefId: string; armyUnitId?: string }[];
    }
  | {
      /**
       * Redeem one non-blocking Necromancy / Hill Fort reinforcement bank.
       * The source discount is applied first, then every distinct Legion piece
       * and other flat discount is subtracted from the remaining gold.
       */
      type: "REDEEM_REINFORCEMENT_DISCOUNT";
      playerId: PlayerId;
      discountId: string;
      armyUnitId: string;
      kind: "reinforce" | "stack";
    }
  | {
      /**
       * Buy a Secondary Hero for 10 gold at your town (or a settlement),
       * wearing the portrait of one of your faction's other heroes.
       */
      type: "HIRE_SECONDARY_HERO";
      playerId: PlayerId;
      heroDefId: string;
      /** Exact controlled Town/Settlement selected from the map-aware hire UI. */
      fieldId?: MapSpaceId;
    }
  | {
      /**
       * Spell Book token: pay the Mage Guild price to search the Spell deck.
       * Playing a Wisdom card with it reduces the price (2 gold basic,
       * 3 gold expert in BINH mode) and upgrades the search to 3/4 cards.
       */
      type: "SPELL_BOOK_ACTION";
      playerId: PlayerId;
      wisdom?: { cardId: CardId; mode: CardPlayMode };
      /** Polish Guild purchase: take the generic cast card instead of a Spell. */
      takeCastCard?: boolean;
      /** Polish HOTA-style reroll: return one owned Book Spell, then Search (2). */
      rollSpell?: { cardId: CardId; source: "refreshed" | "used" };
    }
  | {
      /**
       * Rogues (army map ability): once during your turn, look at the top card
       * of any deck. Reveals the deck's top card, then a Keep-on-top /
       * Move-to-bottom choice opens.
       */
      type: "ROGUES_SCOUT_DECK";
      playerId: PlayerId;
      deckId: DeckId;
    }
  | {
      /**
       * Satyrs (army map ability): once during your turn, roll an Attack die.
       * On "+1" gain positive morale. The die is rolled from the game seed and
       * logged as an ADVENTURE_DICE_ROLLED event before morale is updated.
       */
      type: "SATYR_MORALE_ROLL";
      playerId: PlayerId;
    }
  | {
      /**
       * Thieves' Guild (Cove building): once during your turn, choose one deck
       * (a shared deck or any player's Might & Magic deck) and look at its top 2
       * cards. Reveals them privately, then a "discard which one" choice opens
       * (the other card goes back on top).
       */
      type: "THIEVES_GUILD_ACTION";
      playerId: PlayerId;
      buildingId: BuildingId;
      target: ThievesGuildTarget;
    }
  | {
      /**
       * Blacksmith (Castle): once per turn — pay 6 gold to Search (2) the
       * Artifact deck, or remove an Artifact card from hand for 4 gold.
       */
      type: "BLACKSMITH_ACTION";
      playerId: PlayerId;
      option: "search" | "sell";
      artifactCardId?: CardId;
    }
  | {
      /**
       * Magic University (Conflux): once per round, instead of buying spells
       * normally, choose a School of Magic and discard from the top of your deck
       * until you reveal a Spell of that school, then take it to hand.
       */
      type: "MAGIC_UNIVERSITY_ACTION";
      playerId: PlayerId;
      school: SpellSchool;
    }
  | {
      /**
       * "During your turn" town-building uses (Cover of Darkness, Castle
       * Gate): once per round per building. `optionIndex` picks the printed
       * option; `cardIds` pays discard costs; `targetPlayerId` aims a random
       * discard; `spaceId` is the Castle Gate teleport destination.
       */
      type: "USE_TOWN_BUILDING";
      playerId: PlayerId;
      buildingId: BuildingId;
      optionIndex: number;
      cardIds?: CardId[];
      targetPlayerId?: PlayerId;
      spaceId?: MapSpaceId;
    }
  | {
      /**
       * Brimstone Stormclouds (and cube buildings like it): while one of your
       * spells is waiting to resolve, remove 1 faction cube from the building
       * for +1 Power on that spell (max 1 cube per spell).
       *
       * Cage of Warlords (Fortress) reuses this with `boost`: while one of your
       * units' attacks waits to resolve, remove 1 cube for +1 attack (you are
       * the attacker) or +1 defense (your unit is the target). One bonus per
       * cube, several may be spent on the same attack.
       */
      type: "SPEND_TOWN_CUBE";
      playerId: PlayerId;
      buildingId: BuildingId;
      boost?: "attack" | "defense";
    }
  | {
      /**
       * Hall of Valhalla: once per round, while one of your units' attacks is
       * waiting to resolve, that attack gains +1 attack.
       */
      type: "HALL_OF_VALHALLA_BOOST";
      playerId: PlayerId;
      buildingId: BuildingId;
    }
  | {
      /**
       * Crag Hack's Offense VI aura: while it is active, discard a card from hand
       * to give the attack waiting to resolve +1 attack ("every card you play can
       * grant +1 attack instead of its regular effect"). Offered once per held
       * card during your own unit's attack; repeatable while cards remain.
       */
      type: "CONVERT_CARD_TO_ATTACK";
      playerId: PlayerId;
      cardId: CardId;
    }
  | {
      /**
       * Siege: destroy a fortification. Adjacent ground/flying units demolish
       * a Wall or the Gate as their attack — automatically successful, no die,
       * no cards. Cyclops' printed ability does the same at any range, the
       * pack/neutral versions may also bring down the Arrow Tower.
       */
      type: "ATTACK_FORTIFICATION";
      playerId: PlayerId;
      attackerId: UnitId;
      target: { kind: "wall" | "gate"; position: number } | { kind: "arrow-tower" };
    }
  | {
      /**
       * Spend the positive morale token: draw 1 card, or discard any number
       * of cards and draw that many ("redraw"). The third printed option —
       * reroll any die — is offered inside the dice flows themselves.
       */
      type: "SPEND_MORALE";
      playerId: PlayerId;
      /**
       * Token mode spends the +1 token for "draw" / "redraw" / "repeat-search"
       * (Tournament Book p.54: while a Search is open, discard all revealed
       * cards and Search (X) again). With the Morale Cards rule on, each benefit
       * maps to a held Positive Morale card: "redraw" (discard any number, draw
       * as many), "combat-bonus" (+1 Attack or +1 Defense for the rest of this
       * Combat — `bonus` picks which) and "remove-token" (remove one negative
       * combat token from an own unit — `unitId` + `tokenKind` name it). The
       * card equivalent of repeat-search is the post-Search
       * morale.positive.repeat_search offer, not SPEND_MORALE.
       */
      benefit: "draw" | "redraw" | "combat-bonus" | "remove-token" | "repeat-search";
      discardCardIds?: CardId[];
      bonus?: "attack" | "defense";
      unitId?: UnitId;
      tokenKind?: "weakness" | "corrosion" | "paralysis";
    }
  | {
      /**
       * Spend the Ability Empower token (max 1) to permanently Empower one
       * Ability card currently in hand. Expert side then costs no crown.
       * Handler-validated (self-validating).
       */
      type: "USE_ABILITY_EMPOWER_TOKEN";
      playerId: PlayerId;
      cardId: CardId;
    }
  | { type: "CHOOSE_OPTION"; playerId: PlayerId; choiceId: string; optionIndex: number }
  | {
      /**
       * Resolves a COMBAT_HAND_DISCARD (Magi Power Drain): the defender either
       * names a Power card from hand to discard, or "random" to let a random
       * card be discarded.
       */
      type: "RESOLVE_COMBAT_DISCARD";
      playerId: PlayerId;
      choiceId: string;
      cardId: CardId | "random";
    }
  | {
      /**
       * Resolves an ABILITY_TARGET_CHOICE: picks the unit a printed attack
       * ability hits (Magog fireball splash, Cerberi second head, Liches'
       * Death Cloud) or, on AI target ties, the unit the neutrals attack.
       */
      type: "CHOOSE_ABILITY_TARGET";
      playerId: PlayerId;
      choiceId: string;
      targetUnitId: UnitId;
    }
  | {
      /** Map-setup lobby: claim a faction and main hero for a seat. */
      type: "CHOOSE_FACTION";
      playerId: PlayerId;
      factionId: FactionId;
      heroDefId: string;
    }
  | {
      /**
       * Map-setup lobby: adjust the game options (scenario, neutral
       * difficulty, starting resources/income/units/buildings) before the
       * adventure starts. Any seated player may adjust them.
       */
      type: "SET_GAME_OPTIONS";
      playerId: PlayerId;
      options: Partial<GameSetupOptions>;
    }
  | {
      type: "SET_COMPUTER_OPPONENTS";
      playerId: PlayerId;
      count: number;
    }
  | {
      /**
       * Map-setup lobby: start the adventure. On a solo/open table this builds
       * the scenario map immediately (as before). On a multiplayer HOSTED table
       * (2+ seated players) it instead OPENS the pre-start ready check
       * (`setupLobby.startCheck`) with the presser as the first confirmation —
       * the map builds only once everyone confirms (see
       * `CONFIRM_START_ADVENTURE`). Pressing it again while a check is open
       * simply re-confirms the presser.
       */
      type: "START_ADVENTURE";
      playerId: PlayerId;
    }
  | {
      /**
       * Confirm the open pre-start ready check for this seat. Once every seated
       * player has confirmed, the map builds. Rejected (aborts the check as a
       * timeout) if the 30-second window has already elapsed.
       */
      type: "CONFIRM_START_ADVENTURE";
      playerId: PlayerId;
    }
  | {
      /**
       * Abort the open pre-start ready check and drop the table back to setup.
       * Any seated player may cancel (the "press cancel → go back" path); the
       * clients also fire this when the 30-second window elapses so an AFK seat's
       * missing confirmation cannot hang the table (the "AFK 30s → go back"
       * path). The handler records which one it was from the server clock.
       */
      type: "CANCEL_START_ADVENTURE";
      playerId: PlayerId;
    }
  | {
      /**
       * Map-setup lobby (Draft tab): choose the setup format (one of the four
       * "Draft & random" types). Switching the format resets every seat's pick
       * and the whole draft state so the new flow starts clean. Any seated player
       * may set it.
       */
      type: "SET_DRAFT_FORMAT";
      playerId: PlayerId;
      format: DraftFormat;
    }
  | {
      /**
       * Map-setup lobby: roll two random untaken town options for this seat to
       * choose between ("draft" / "random-choice" formats). Seeded by the event
       * counter, so a re-roll differs and every client lands on the same pair.
       */
      type: "ROLL_TOWN_OPTIONS";
      playerId: PlayerId;
    }
  | {
      /**
       * Map-setup lobby: lock this seat to a town (faction) without a hero yet
       * ("draft" / "random-choice"). In "random-choice" the town must be one of
       * the seat's two rolled options; in "draft" you may instead select any
       * untaken town directly when no roll is pending.
       */
      type: "CHOOSE_TOWN";
      playerId: PlayerId;
      factionId: FactionId;
    }
  | {
      /**
       * Map-setup lobby: roll two random hero options of this seat's already-
       * locked town ("random-choice"). Seeded by the event counter.
       */
      type: "ROLL_HERO_OPTIONS";
      playerId: PlayerId;
    }
  | {
      /**
       * Map-setup lobby ("draft" ban phase): ban one hero belonging to ANOTHER
       * seat's locked town. Bans go around the table in seat order — only the
       * seat whose ban turn it is may act, and a banned hero can never be picked.
       */
      type: "BAN_HERO";
      playerId: PlayerId;
      heroDefId: string;
    }
  | {
      /**
       * Map-setup lobby: clear this seat's town/hero pick and any pending rolls
       * (the per-player reset). Blocked in the "draft" format once every town is
       * locked (the ban phase has begun) — switch the format to restart instead.
       */
      type: "RESET_SEAT_DRAFT";
      playerId: PlayerId;
    }
  | {
      /**
       * Map-setup lobby ("random" format): randomly assign this seat a town and
       * hero. `scope: "faction"` rolls a random untaken faction and a random hero
       * of it; `scope: "hero"` re-rolls only the hero within the seat's faction.
       * The roll uses the game's seeded RNG (advanced by the event counter) so
       * repeated rolls differ and every client lands on the same pick.
       */
      type: "RANDOM_ASSIGN_SEAT";
      playerId: PlayerId;
      scope: "faction" | "hero";
    }
  | {
      /**
       * Single-player map-setup ONLY: the human owner sets, rolls, or clears the
       * faction + main hero of a COMPUTER seat, so the opponents can be
       * hand-picked instead of every one being left on "auto". Legal only in a
       * single-player lobby in the "open" (Free pick) format; `playerId` (the
       * issuer) must be the one human owner seat and `seatPlayerId` a
       * computer-controlled seat. This never reassigns a SEAT (no
       * ASSIGN_SEAT-style takeover) — it only writes that seat's faction/hero.
       * `choice`:
       *  - `{ factionId, heroDefId }` — set the seat to that town + hero (the
       *    faction must be untaken and the hero must belong to it);
       *  - `"roll"` — seeded-random untaken faction × one of its heroes;
       *  - `"clear"` — unset the pick so the computer picks a town at game start
       *    (today's default behaviour).
       */
      type: "SET_COMPUTER_SEAT_FACTION";
      playerId: PlayerId;
      seatPlayerId: PlayerId;
      choice: { factionId: FactionId; heroDefId: string } | "roll" | "clear";
    }
  | {
      /**
       * Register (or refresh) this client in the room as an observer. Carries a
       * stable per-browser `clientId` and a display `name`. Idempotent: a
       * re-join updates the name and keeps the existing seat/host. Membership
       * actions are keyed by `clientId`, never a seat `playerId`.
       */
      type: "JOIN_ROOM";
      clientId: string;
      name: string;
      /**
       * The room-password attempt. Required only when the room is
       * password-protected (`RoomMembershipState.passwordHash` set) and the
       * joiner is a NEW member who is neither the sticky host nor an existing
       * member reconnecting — those keep their access. An absent/incorrect
       * attempt against a locked room is rejected (see joinRoom in room.ts).
       */
      password?: string;
    }
  | {
      /** Remove this client from the room; frees its seat and hands off host. */
      type: "LEAVE_ROOM";
      clientId: string;
    }
  | {
      /**
       * Turn host control on or off. Turning it ON makes the caller the host
       * (only a member of an open room may do this); turning it OFF (back to an
       * open table) is host-only. Keyed by the caller's `clientId`.
       */
      type: "SET_ROOM_HOSTED";
      clientId: string;
      hosted: boolean;
    }
  | {
      /**
       * Host-only (hosted rooms): seat `targetClientId` at `seat` (a real seat
       * id or "observer"). Seating a member at a seat another member holds bumps
       * that other member to observer. The host may seat themselves (so the host
       * can be Player 1).
       */
      type: "ASSIGN_SEAT";
      clientId: string;
      targetClientId: string;
      seat: RoomSeat;
    }
  | {
      /** Host-only (hosted rooms): remove `targetClientId` from the room. */
      type: "KICK_MEMBER";
      clientId: string;
      targetClientId: string;
    }
  | {
      /** Host-only (hosted rooms): hand host to another member. */
      type: "TRANSFER_HOST";
      clientId: string;
      targetClientId: string;
    }
  | {
      /**
       * Recover host on a hosted room whose host is GONE. Any member may claim
       * host for themselves ONLY when the current host holds no live connection
       * (a per-tab clientId dies with the browser, so a restarted host — the
       * common guest case — must not strand the table). Mirrors the reset/close
       * "host absent → a member may act" rule (see authorizeHostedWipe): the
       * server injects the live-client set, and the engine refuses while the
       * host is still connected. Keyed by the caller's `clientId`.
       */
      type: "RECLAIM_HOST";
      clientId: string;
    }
  | {
      /**
       * Rename the room so it is identifiable in the lobby. Open table: any
       * member may set it; hosted: host-only (mirrors `SET_ROOM_HOSTED`). Keyed
       * by the caller's `clientId`. A blank name clears it back to the default.
       */
      type: "SET_ROOM_NAME";
      clientId: string;
      name: string;
    }
  | {
      /**
       * Set (or clear) the room's join password. Open table: any member may set
       * it; hosted: host-only (mirrors `SET_ROOM_NAME`). Keyed by the caller's
       * `clientId`. A blank/whitespace password clears the lock. The engine
       * stores only a HASH of the password (`RoomMembershipState.passwordHash`),
       * never the plaintext. See setRoomPassword in room.ts.
       */
      type: "SET_ROOM_PASSWORD";
      clientId: string;
      password: string;
    }
  | {
      /**
       * Host-only (hosted rooms): require a VERIFIED account to join this table
       * (Phase 2). With it on, a guest client (no verified `userId`) is refused
       * at `JOIN_ROOM`. Keyed by the caller's `clientId`; a no-op on an open
       * table (there is no host to enforce it and no seats to protect).
       */
      type: "SET_ROOM_REQUIRE_AUTH";
      clientId: string;
      requireAuth: boolean;
    }
  | {
      /**
       * Choose the room's match type (the lobby's Ranked vs Normal picker).
       * `ranked: false` marks a casual game whose result never touches the Elo
       * ladder; `ranked: true` a ranked game. Open table: any member may set it;
       * hosted: host-only (mirrors `SET_ROOM_NAME`). Allowed only while the room
       * is still a setup lobby — locked once the adventure starts. Keyed by the
       * caller's `clientId`.
       */
      type: "SET_ROOM_RANKED";
      clientId: string;
      ranked: boolean;
    }
  | {
      /**
       * Send a quick table reaction (emote) to everyone at the table. A purely
       * social broadcast, keyed by the sender's `clientId` (like membership
       * actions) — never a seat `playerId`, so observers may react too and it is
       * never seat- or turn-gated. `reactionId` must be a known palette id (see
       * TABLE_REACTIONS); an unknown id, a non-member sender (when a room
       * exists), or a per-client flood is rejected. The synced ring buffer
       * `state.tableReactions` carries the result to every client.
       */
      type: "SEND_TABLE_REACTION";
      clientId: string;
      reactionId: string;
      /** Optional display name fallback when the sender is not a room member. */
      name?: string;
    }
  | {
      /**
       * Post an ephemeral chat message to the room. Like membership / reactions,
       * it is keyed by the sender's `clientId` — never a seat `playerId` — so an
       * observer may chat, a player may chat on anyone's turn, and it is never
       * seat- or turn-gated (works in solo, open, hosted and parallel modes).
       * Requires room membership; the text is trimmed, control-stripped and
       * capped, and a per-client flood is rejected. The bounded ring buffer
       * `state.room.chat` carries the last messages to every client (the
       * "temporary" live chat — old lines roll off, nothing is stored per-account).
       */
      type: "SEND_CHAT";
      clientId: string;
      text: string;
      /** Optional client wall-clock (ms) for display only; never trusted for logic. */
      at?: number;
    }
  | { type: "END_TURN"; playerId: PlayerId }
  | {
      /**
       * Single-player only: the human confirms the next computer map beat.
       * Server runs exactly one settleComputerVisibleStep after this validates
       * (AI-only combat bulk-resolves inside that step; map MOVE_HERO stops at
       * one cell). Not used for human-involved PvP (that auto-pumps). Does not
       * change engine rules of the computer seat — only gates WHEN it acts.
       */
      type: "ADVANCE_COMPUTER";
      playerId: PlayerId;
    }
  | {
      /**
       * Concede the game: the player is removed from the turn order and becomes
       * an observer (rulebook p.11 elimination). Legal only on the player's own
       * map turn — never while defending in Combat ("you cannot surrender when
       * defending your Faction Town", rulebook p.46).
       */
      type: "GIVE_UP";
      playerId: PlayerId;
    }
  | {
      /**
       * OPTIONAL Undo mode (debug/testing only — `GameSetupOptions.undoMoves`,
       * default OFF). Roll the room back to the state BEFORE the most recent
       * human action. This action never reaches the engine reducer: it is
       * intercepted in the SERVER action transaction (the built-in store's
       * `submitRoomAction` and the PartyKit edge), which pops a server-side,
       * broadcast-free per-room snapshot stack and restores it. With the option
       * OFF (or no history) the server rejects it. See src/server/undo-history.ts.
       */
      type: "UNDO_MOVE";
      playerId: PlayerId;
    }
  | {
      /**
       * Open an AFK kick-or-wait vote against `targetPlayerId`. Legal only in a
       * multiplayer adventure when the target has been idle for AFK_IDLE_MS
       * (per the server-stamped clock), no other vote is open, and any earlier
       * vote about them that ended in "wait" is AFK_REASK_MS old. The starter's
       * own vote counts as "kick", so in a 2-player game this alone drops the
       * target. Exempt from the turn/barrier gates like chat — a frozen table
       * is exactly when it is needed.
       */
      type: "START_AFK_VOTE";
      playerId: PlayerId;
      targetPlayerId: PlayerId;
    }
  | {
      /**
       * Answer the open AFK vote: "kick" (drop the target once every live
       * voter agrees) or "wait" (close the vote; it can be re-opened
       * AFK_REASK_MS later). The target cannot vote.
       */
      type: "CAST_AFK_VOTE";
      playerId: PlayerId;
      vote: "kick" | "wait";
    }
  | {
      /**
       * One force-drop step for the seat a passed AFK vote is removing
       * (`afk.droppingPlayerId` — `playerId` must match it). Issued by the
       * server-side driver, never by a client button: concedes the player's
       * open combat first, then (called again once it finalized) eliminates
       * them and hands the turn on. See src/engine/afk-drop.ts.
       */
      type: "RESOLVE_AFK_DROP";
      playerId: PlayerId;
    }
  | {
      /**
       * Certain auto-kick of a seat idle past `AFK_AUTO_KICK_MS` (30 minutes) —
       * no vote required. Any live seat's client fires it once the target has
       * been away that long; the server re-checks the idle time against its own
       * clock, cancels any open vote about the target, and begins the same
       * force-drop the passed vote uses (`afk.droppingPlayerId`). This is the
       * "after 30 minutes the AFK player is certainly kicked" guarantee.
       */
      type: "FORCE_AFK_KICK";
      playerId: PlayerId;
      targetPlayerId: PlayerId;
    }
  | {
      /**
       * Open an "all players must confirm" vote to start a NEW adventure
       * (wiping the running game) — the table-consent gate for the "New
       * adventure" button while a multiplayer game is IN PROGRESS. The starter's
       * own request counts as their confirmation. Legal only in an in-progress
       * adventure with two or more live seats (a setup lobby / solo game / a
       * finished game resets directly, no vote). `clientId` records the browser
       * that opened it, so that same browser fires the actual reset once every
       * live seat has confirmed. Exempt from the turn/barrier gates like chat.
       */
      type: "REQUEST_ROOM_RESET";
      playerId: PlayerId;
      clientId: string;
    }
  | {
      /**
       * Confirm the open new-adventure vote for `playerId`'s seat. The reset
       * proceeds only once EVERY live seat has confirmed. Hosted rooms gate this
       * to the seat's own controller (roomActionGuard); an open table lets the
       * local controller confirm each seat it holds.
       */
      type: "CONFIRM_ROOM_RESET";
      playerId: PlayerId;
    }
  | {
      /**
       * Decline / withdraw the open new-adventure vote — any live seat may
       * cancel it, clearing the vote for the whole table.
       */
      type: "CANCEL_ROOM_RESET";
      playerId: PlayerId;
    }
  | {
      /**
       * Hard 10-minute turn budget (`TURN_TIME_LIMIT_MS`): any live seat's
       * client fires this once `targetPlayerId`'s open turn has burned its
       * whole budget (per the server-stamped `afk.turnOpenSince` clock; the
       * server re-checks). Arms `afk.turnTimeoutPlayerId` — the driver then
       * force-ends the turn. The target is NOT kicked or eliminated.
       */
      type: "FORCE_TURN_TIMEOUT";
      playerId: PlayerId;
      targetPlayerId: PlayerId;
    }
  | {
      /**
       * One force-shift step for the seat whose turn timed out
       * (`afk.turnTimeoutPlayerId` — `playerId` must match it). Issued by the
       * server-side driver, never by a client button: concedes the seat's open
       * combat first (retreat vs neutrals, give-up vs a player), then — called
       * again once it finalized — ends the turn through the normal END_TURN
       * machinery. See src/engine/afk-drop.ts.
       */
      type: "RESOLVE_TURN_TIMEOUT";
      playerId: PlayerId;
    };

export type LegalAction = {
  action: GameAction;
  label: string;
  reason?: string;
  /**
   * "I JOIN an open reaction window but never OPEN one." The action-type-agnostic
   * twin of the `utilityOnly` / `drawOnly` PLAY_REACTION flags (which say the same
   * thing for card reactions): a flagged offer is listed inside a window somebody
   * else opened, yet its mere presence must not pause the table. Read by the ONE
   * shared predicate `reactionOfferOpensWindow` (legal-actions.ts), so both the
   * offer-side strip and `openReactionWindowForTrigger` agree. Used by the
   * "Instant (any time during Combat)" joins — a held Meteor Shower must not stop
   * every spell cast at the table, and only the side about to be HIT may open an
   * attack window with one.
   */
  windowJoinOnly?: boolean;
};

export type RulesError = {
  code:
    | "ACTION_NOT_LEGAL"
    | "CARD_NOT_FOUND"
    | "CARD_NOT_IN_HAND"
    | "CARD_NOT_IN_SPELL_BOOK"
    | "INVALID_TARGET"
    | "NO_REACTION_WINDOW"
    | "NOT_PRIORITY_PLAYER";
  message: string;
  path?: string;
};

export type GameEvent =
  | {
      id: string;
      type: "GAME_CREATED";
      message: string;
    }
  | {
      id: string;
      type: "COMBAT_ROUND_STARTED";
      round: number;
      activeUnitId: UnitId | null;
    }
  | {
      id: string;
      type: "UNIT_ACTIVATION_STARTED";
      unitId: UnitId;
      playerId: PlayerId;
    }
  | {
      id: string;
      type: "UNIT_ATTACK_DECLARED";
      playerId: PlayerId;
      attackerId: UnitId;
      defenderId: UnitId;
      isRetaliation: boolean;
      attackKind: "melee" | "ranged";
      rollMode: AttackRollMode;
      /** Set for printed-ability follow-up attacks (Liches' Death Cloud). */
      abilityAttack?: { abilityId: string; baseAttack: number };
    }
  | {
      /**
       * A resolved attack would reduce a unit to 0 HP — opens the save window
       * where that unit's controller may play Alamar's Resurrection.
       */
      id: string;
      type: "UNIT_LETHAL_HIT";
      attackerId: UnitId;
      defenderId: UnitId;
      /** The hit reaches 0 HP on a Polish Stack layer, but not the card. */
      stackLayerOnly?: boolean;
    }
  | {
      /**
       * The Attack die has been rolled (and any rerolls resolved) but the hit
       * has not yet landed — opens the window where the defender may play Shield
       * of the Dwarven Lords to ignore the die and the effects it triggered.
       */
      id: string;
      type: "ATTACK_DIE_SETTLED";
      attackerId: UnitId;
      defenderId: UnitId;
      roll: number;
    }
  | {
      id: string;
      type: "ATTACK_ROLLED";
      attackerId: UnitId;
      defenderId: UnitId;
      rolls: number[];
      roll: number;
      /** Centaur's Axe: the die outcome is multiplied before it is applied. */
      dieMultiplier?: number;
      /**
       * The Attack die was not rolled (Bless ignores it; Elemental damage
       * never uses it). The client skips the rolling-dice cinematic for these.
       */
      noDie?: boolean;
      /**
       * Every die in `rolls` counts toward `roll` (summed/counted) rather than
       * one being selected — Slayer and the Champions' "apply both" roll. The
       * dice overlay keeps every die lit instead of dimming the "unused" faces.
       */
      sumAllDice?: boolean;
      rollMode: AttackRollMode;
      attackBonus: number;
      defenseBonus: number;
      /**
       * Defending unit's per-attack Defense roll: a unit that took the Defend
       * action rolls one Attack die each time it is struck and only gains +1
       * Defense on a "+1" face. Present whenever the defender was defending.
       */
      defendRoll?: number;
      /**
       * WOG commander Might (Damage grade): the extra attack dice this attack
       * rolled ON TOP of the normal die (Damage grade = how many). Each "+1"
       * raised the attack; at most one "−1" counted. Present only when the
       * commander rolled them, so the client can show the Might dice.
       */
      mightRolls?: number[];
      /**
       * Morale/artifact/spell adjustments that visibly changed this roll
       * (a Negative Morale die flip / forced reroll / −1 latch / dropped die,
       * the Mummy's forced −1, a specialty-fixed face, a minimum-die floor).
       * Display-only: the numbers above already include every adjustment; the
       * dice overlay lists these so the player can see WHY the roll changed.
       */
      rollModifiers?: AttackRollModifierNote[];
      /**
       * Dice force-rerolled after the throw (Hourglass of the Evil Hour's
       * `REROLL_ENEMY_PLUS_ONE` curse; the Negative-Morale `reroll_plus_one`
       * card): each "+1" is rerolled once. Present only when a die was actually
       * rerolled, so the dice overlay can replay the "+1" → kept-face reroll.
       * Display-only — `rolls`/`roll` already hold the final faces.
       */
      rerollBeats?: AttackDieRerollBeat[];
      attackValue: number;
      defenseValue: number;
      damage: number;
      isRetaliation: boolean;
    }
  | {
      /**
       * A Spell rolled the Attack die one or more times to size its own effect
       * (Inferno's area blast). Logged BEFORE the damage it produces so the
       * client can show the dice tumbling and read out, then the burst and the
       * damage land. `hits` is the number of "+1" faces (the damage each unit in
       * range takes); `position` anchors the dice overlay on the targeted space.
       */
      id: string;
      type: "SPELL_DICE_ROLLED";
      spellCardId: CardId;
      playerId: PlayerId;
      rolls: number[];
      hits: number;
      position?: number;
    }
  | {
      id: string;
      type: "PENDING_CHOICE_CREATED";
      choiceId: string;
      choiceType: "ATTACK_DIE_REROLL" | "ABILITY_TARGET_CHOICE" | "COMBAT_HAND_DISCARD" | "TARNUM_SEARCH";
      playerId: PlayerId;
      sourceEffectIds: string[];
      message: string;
    }
  | {
      id: string;
      type: "ATTACK_REROLLED";
      choiceId: string;
      playerId: PlayerId;
      rolls: number[];
      roll: number;
      remainingRerolls: number;
      sourceName: string;
    }
  | {
      id: string;
      type: "PENDING_CHOICE_RESOLVED";
      choiceId: string;
      playerId: PlayerId;
      selectedIndex: number;
    }
  | {
      id: string;
      type: "RETALIATION_ATTACKED";
      attackerId: UnitId;
      defenderId: UnitId;
    }
  | {
      id: string;
      type: "UNIT_MOVED";
      playerId: PlayerId;
      unitId: UnitId;
      from: number;
      to: number;
    }
  | {
      /** A Spell placed an Obstacle / Effect / face-down trap on a board space. */
      id: string;
      type: "BATTLEFIELD_TOKEN_PLACED";
      playerId: PlayerId;
      tokenId: string;
      kind: BattlefieldTokenKind;
      position: number;
    }
  | {
      /**
       * A moving unit sprang a battlefield token. Fire Wall / Land Mine damage
       * ("damage", with `amount`), a Quicksand that halted it ("stop"), or a
       * face-down trap that turned out to be an empty decoy ("decoy"). For the
       * face-down traps (Quicksand / Land Mine) the token is removed from the
       * board the instant it is sprung, so the opponent never learns which of
       * the remaining face-down tokens are real.
       */
      id: string;
      type: "BATTLEFIELD_TOKEN_TRIGGERED";
      tokenId: string;
      kind: BattlefieldTokenKind;
      position: number;
      unitId: UnitId;
      outcome: "damage" | "stop" | "decoy";
      amount?: number;
    }
  | {
      /** A timed Force Field reached the end of its duration and was removed. */
      id: string;
      type: "BATTLEFIELD_TOKEN_EXPIRED";
      tokenId: string;
      kind: BattlefieldTokenKind;
      position: number;
    }
  | {
      /**
       * Remove Obstacle lifted one of the board's obstacle markers off `position`
       * (Walls and the Gate report through FORTIFICATION_DESTROYED instead). The
       * marker simply clears; the UI plays the crumble cue on that cell.
       */
      id: string;
      type: "COMBAT_OBSTACLE_REMOVED";
      playerId: PlayerId;
      position: number;
    }
  | {
      id: string;
      type: "UNIT_DEFENDED";
      playerId: PlayerId;
      unitId: UnitId;
    }
  | {
      id: string;
      type: "UNIT_ACTIVATION_ENDED";
      playerId: PlayerId;
      unitId: UnitId;
    }
  | {
      id: string;
      type: "UNIT_REMOVED";
      unitId: UnitId;
      playerId: PlayerId;
    }
  | {
      /** A defeated Pack card turns to its Few side with the excess damage. */
      id: string;
      type: "UNIT_FLIPPED";
      unitId: UnitId;
      playerId: PlayerId;
      unitName: string;
      excessDamage: number;
    }
  | {
      /**
       * A specialty card covering a unit (Sandro's Cloak) ran out of health:
       * it goes to its owner's discard pile and the card under it is
       * revealed with the excess damage.
       */
      id: string;
      type: "SPECIALTY_CARD_DEFEATED";
      unitId: UnitId;
      playerId: PlayerId;
      cardId: CardId;
      revealedName: string;
      excessDamage: number;
    }
  | {
      id: string;
      type: "UNIT_TRANSFORMED";
      unitId: UnitId;
      playerId: PlayerId;
      newName: string;
      byCardId: CardId;
    }
  | {
      id: string;
      type: "COMBAT_ROUND_ENDED";
      round: number;
      nextRound: number;
    }
  | {
      id: string;
      type: "COMBAT_ENDED";
      winnerPlayerId: PlayerId;
      defeatedPlayerId: PlayerId;
      reason: "all-enemy-units-defeated" | "retreat" | "surrender" | "surrender-secondary" | "give-up";
    }
  | {
      id: string;
      type: "TURN_ENDED";
      playerId: PlayerId;
      nextPlayerId: PlayerId;
    }
  | {
      id: string;
      type: "SPELL_CAST_STARTED";
      playerId: PlayerId;
      spellCardId: CardId;
      target: TargetRef;
      power: number;
    }
  | {
      id: string;
      type: "SPELL_CAST_RESOLVED";
      playerId: PlayerId;
      spellCardId: CardId;
      target: TargetRef;
      power: number;
    }
  | {
      id: string;
      type: "SPELL_CAST_CANCELLED";
      playerId: PlayerId;
      spellCardId: CardId;
      cancelledByPlayerId: PlayerId;
      cancelledByCardId: CardId;
    }
  | {
      /**
       * A cast could not take effect at the Power paid (Clone on a unit whose
       * grade the Power did not reach) and was refunded instead of wasted: the
       * Spell card and any Power spent on it return to the caster's hand and the
       * cast no longer counts against the one-Spell-per-round limit. Surfaced to
       * the player so they know nothing was lost. `reason` is a human message.
       */
      id: string;
      type: "SPELL_CAST_REFUNDED";
      playerId: PlayerId;
      spellCardId: CardId;
      reason: string;
    }
  | {
      /** Magic Mirror: a pending Spell was re-pointed to a new target. */
      id: string;
      type: "SPELL_REDIRECTED";
      /** The player who played Magic Mirror (the original spell's target side). */
      playerId: PlayerId;
      spellCardId: CardId;
      byCardId: CardId;
      fromTarget: TargetRef;
      toTarget: TargetRef;
    }
  | {
      id: string;
      type: "DAMAGE_ASSIGNED";
      source: SourceRef;
      target: TargetRef;
      amount: number;
      damageKind: DamageKind;
    }
  | {
      id: string;
      type: "DAMAGE_HEALED";
      source: SourceRef;
      target: TargetRef;
      amount: number;
    }
  | {
      id: string;
      type: "ACTIVE_EFFECTS_REMOVED";
      source: SourceRef;
      target: TargetRef;
      effectIds: string[];
    }
  | {
      id: string;
      type: "UNIT_ABILITY_TRIGGERED";
      unitId: UnitId;
      abilityId: string;
      targetUnitId?: UnitId;
      message: string;
      /**
       * Structured dice for an ability's OWN roll (Death Stare, the
       * Thunderbird/Wyvern extra die, extra-die Paralysis, the Medusa gaze,
       * Ghost Dragon knockback, Dwarven Magic Resistance, the defense-die
       * damage soak, the morale skip-activation check — and each Multilingual
       * Bron reroll announce). Present only when the ability physically threw
       * dice; the client shows the same tumbling-dice overlay the attack roll
       * gets, headed `label` with `caption` as the outcome read-out.
       */
      dice?: AbilityDiceRoll;
    }
  | {
      id: string;
      type: "CARD_PLAYED";
      playerId: PlayerId;
      cardId: CardId;
      timing: CardDefinition["timing"];
      mode: CardPlayMode;
      effectAmount?: number;
      optionLabel?: string;
      /**
       * Combat Spell reaction: the unit the effect lands on (Curse → defender,
       * Bloodlust → attacker, Sorrow → skipped unit). Presentation anchors the
       * spell sprite there instead of centre stage.
       */
      targetUnitId?: UnitId;
    }
  | {
      id: string;
      type: "CARDS_DRAWN";
      playerId: PlayerId;
      count: number;
      requested: number;
      reshuffledDiscard: boolean;
      /** Exact cards for the owner’s private history; other seats see hidden entries. */
      cardIds?: CardId[];
    }
  | {
      /** Spell Book (house rule): a Spell moved from hand into the Spell Book. */
      id: string;
      type: "SPELL_MOVED_TO_SPELL_BOOK";
      playerId: PlayerId;
      cardId: CardId;
      message: string;
    }
  | {
      id: string;
      type: "SANDBOX_CARD_ADDED";
      playerId: PlayerId;
      cardId: CardId;
      message: string;
    }
  | {
      id: string;
      type: "SANDBOX_SETUP_CHANGED";
      message: string;
    }
  | {
      id: string;
      type: "SANDBOX_COMBAT_BEGUN";
      message: string;
      boardArtId: CombatBoardArtId;
      attackerPlayerId: PlayerId;
      defenderPlayerId: PlayerId;
    }
  | {
      id: string;
      type: "DECK_SEARCH_STARTED";
      playerId: PlayerId;
      deckId: DeckId;
      choiceId: string;
      revealedCount: number;
    }
  | {
      id: string;
      type: "DECK_SEARCH_RESOLVED";
      playerId: PlayerId;
      deckId: DeckId;
      choiceId: string;
      pick: "revealed" | "discard-top";
      discardedCardIds: CardId[];
    }
  | {
      id: string;
      type: "HERO_MOVED";
      playerId: PlayerId;
      heroId: HeroId;
      from: MapSpaceId;
      to: MapSpaceId;
      movementLeft: number;
      /**
       * Instant relocation kind — presentation picks TELPTOUT / DANGER /
       * CAVEHEAD / spell teleport, never a terrain horse loop. Absent on
       * ordinary adjacent steps.
       */
      teleport?: "monolith" | "gate" | "whirlpool" | "subterranean" | "spell";
    }
  | {
      /**
       * Single-player: the human confirmed the next computer map beat. The
       * server then applies one settleComputerVisibleStep (same snapshot).
       * Feed-safe; pure presentation signal — rules progress is the computer
       * actions that follow in that same transaction.
       */
      id: string;
      type: "COMPUTER_ADVANCE_REQUESTED";
      playerId: PlayerId;
      computerPlayerId: PlayerId;
    }
  | {
      id: string;
      type: "HERO_GAINED";
      playerId: PlayerId;
      heroId: HeroId;
      fieldId: MapSpaceId;
    }
  | {
      /** A hero left the game (e.g. a Secondary Hero surrendered/sacrificed). */
      id: string;
      type: "HERO_LOST";
      playerId: PlayerId;
      heroId: HeroId;
      message: string;
    }
  | {
      id: string;
      type: "REACTION_WINDOW_OPENED";
      windowId: string;
      triggerEventId: string;
      priorityPlayerId: PlayerId;
      allowedPlayerIds: PlayerId[];
    }
  | {
      id: string;
      type: "REACTION_PASSED";
      playerId: PlayerId;
      windowId: string;
    }
  | {
      id: string;
      type: "REACTION_WINDOW_CLOSED";
      windowId: string;
      reason: "all-pass" | "reaction-played";
    }
  | {
      id: string;
      type: "STRUCTURE_BUILT";
      playerId: PlayerId;
      townId: TownId;
      buildingId: BuildingId;
      cost: ResourceCost;
    }
  | {
      id: string;
      type: "BUILDING_EFFECT_APPLIED";
      playerId: PlayerId;
      townId: TownId;
      buildingId: BuildingId;
      effect: BuildingEffectDefinition;
    }
  | {
      id: string;
      type: "ACTIVE_EFFECT_CREATED";
      effectId: string;
      controllerId: PlayerId;
      name: string;
      duration: EffectDurationDefinition;
    }
  | {
      /**
       * A Bulwark player's Rune total crossed a Rune-Level threshold (earned in
       * battle, or already met by the starting pool at seed time), turning on
       * that level's army-wide buff. Drives the Rune cue/sound in the combat UI
       * (effects/rune). `level` is the new effective Rune Level (1–3) and `count`
       * the Rune total at that moment.
       */
      id: string;
      type: "RUNE_LEVEL_REACHED";
      playerId: PlayerId;
      level: number;
      count: number;
    }
  | {
      id: string;
      type: "ACTIVE_EFFECT_USED";
      effectId: string;
      playerId: PlayerId;
      target: TargetRef;
    }
  | {
      id: string;
      type: "ACTIVE_EFFECT_EXPIRED";
      effectId: string;
      reason: "combat-round-ended" | "turn-ended" | "combat-ended" | "game-round-ended" | "activation-ended";
    }
  | {
      id: string;
      type: "SIMULTANEOUS_TURN_COMPLETED";
      playerId: PlayerId;
      completedPlayerIds: PlayerId[];
    }
  | {
      id: string;
      type: "ORDERED_TURNS_STARTED";
      activePlayerId: PlayerId;
    }
  | {
      /** Adventure parallel-turn mode (optional rule) began: the first `rounds` rounds are played simultaneously. */
      id: string;
      type: "PARALLEL_TURNS_STARTED";
      rounds: number;
    }
  | {
      /** A player finished their own parallel turn; the round wraps once every live player has. */
      id: string;
      type: "PARALLEL_TURN_ENDED";
      playerId: PlayerId;
      /** Live players whose parallel turn is still open after this one ended. */
      waitingForPlayerIds: PlayerId[];
    }
  | {
      /**
       * THE parallel-mode warning to the whole table: parallel turns have
       * stopped (a PvP battle started, a serious PvP interaction resolved, or
       * the chosen period ran out) and play continues in normal turn order.
       */
      id: string;
      type: "PARALLEL_TURNS_STOPPED";
      reason: "pvp-battle" | "pvp-interaction" | "period-ended";
      /** The player whose action ended the mode (absent for "period-ended"). */
      byPlayerId?: PlayerId;
      message: string;
    }
  | {
      /**
       * PvP Neutral Control (optional mode): a Neutral combat is starting and
       * `playerId` — the next live player clockwise from the fighter — plays
       * the Neutral units like a PvP side (activation order, moves, attacks,
       * abilities and rolls).
       */
      id: string;
      type: "NEUTRAL_CONTROL_ASSIGNED";
      /** The player controlling the Neutral units (NOT the one fighting). */
      playerId: PlayerId;
      /** The player whose hero is fighting the Neutral units. */
      combatPlayerId: PlayerId;
      message: string;
    }
  | {
      /**
       * OPTIONAL Undo mode: the room was rolled back to a prior state by
       * `playerId`. Public feed line ("<name> undid N action(s)") so a rewind is
       * never silent. Emitted onto the RESTORED state's event log by the server
       * action transaction, not by a reducer handler (Undo bypasses the reducer).
       */
      id: string;
      type: "MOVES_UNDONE";
      playerId: PlayerId;
      /** How many action steps were rolled back by this undo (currently always 1). */
      count: number;
      message: string;
    }
  | {
      /**
       * PvP Neutral Control: the pre-battle formation-SORT window opened for the
       * controlling player (they may move/swap the Neutral guards before battle).
       */
      id: string;
      type: "NEUTRAL_FORMATION_SORT_OPENED";
      /** The player controlling (sorting) the Neutral formation. */
      playerId: PlayerId;
      /** The player whose hero is fighting the Neutral units. */
      combatPlayerId: PlayerId;
    }
  | {
      /**
       * WOG Commanders: the pre-combat SORT window opened for an owner who may
       * reposition their commander in their deployment zone before round 1.
       */
      id: string;
      type: "COMMANDER_PLACEMENT_OPENED";
      /** The owner repositioning their commander. */
      playerId: PlayerId;
      /** The player whose hero is fighting this combat (the attacker). */
      combatPlayerId: PlayerId;
    }
  | {
      id: string;
      type: "ROOM_MEMBER_JOINED";
      clientId: string;
      name: string;
      seat: RoomSeat;
      isHost: boolean;
      /**
       * True when the joiner is bound to a VERIFIED account (the name is their
       * registered nickname); false/absent for a guest — the join notices show
       * "name (guest)" so the table always knows who walked in.
       */
      verified?: boolean;
      /**
       * True only for a genuinely NEW member (first join). Reconnects and
       * cross-tab rebinds re-emit this event with false, so the feed toast +
       * system chat announce real arrivals without spamming every refresh.
       */
      newMember?: boolean;
    }
  | {
      id: string;
      type: "ROOM_MEMBER_LEFT";
      clientId: string;
    }
  | {
      id: string;
      type: "ROOM_SEAT_CHANGED";
      clientId: string;
      seat: RoomSeat;
      /** The client who made the change (the host, or the member themselves). */
      byClientId: string;
    }
  | {
      id: string;
      type: "ROOM_MEMBER_KICKED";
      clientId: string;
      byClientId: string;
    }
  | {
      id: string;
      type: "ROOM_HOSTED_CHANGED";
      hosted: boolean;
      byClientId: string;
    }
  | {
      id: string;
      type: "ROOM_HOST_CHANGED";
      clientId: string;
      byClientId: string;
    }
  | {
      id: string;
      type: "ROOM_NAMED";
      name: string;
      byClientId: string;
    }
  | {
      id: string;
      type: "ROOM_PASSWORD_CHANGED";
      /** True when a password was set/changed; false when the lock was cleared. */
      hasPassword: boolean;
      byClientId: string;
    }
  | {
      id: string;
      type: "ROOM_REQUIRE_AUTH_CHANGED";
      requireAuth: boolean;
      byClientId: string;
    }
  | {
      id: string;
      type: "ROUND_STARTED";
      round: number;
      kind: "first" | "resource" | "astrologers";
    }
  | {
      id: string;
      type: "TURN_STARTED";
      playerId: PlayerId;
      round: number;
    }
  | {
      id: string;
      type: "HAND_REFRESHED";
      playerId: PlayerId;
      discarded: number;
      drawn: number;
      /** Exact cards for the owner’s private history; other seats see hidden entries. */
      discardedCardIds?: CardId[];
      /** Set when the double-negative-morale penalty empties the hand at turn end. */
      reason?: "morale-double-negative";
    }
  | {
      id: string;
      /** First-round starting-hand Mulligan: one card replaced (MULLIGAN_CARD). */
      type: "HAND_MULLIGAN";
      playerId: PlayerId;
      /** Replacements still left this game after this one. */
      remaining: number;
      /** Exact replacement card(s) for the owner’s private history. */
      discardedCardIds?: CardId[];
    }
  | {
      id: string;
      type: "TILE_REVEALED";
      playerId: PlayerId;
      tileInstanceId: string;
      tileDefId: string;
    }
  | {
      id: string;
      type: "TILE_PLACED";
      playerId: PlayerId;
      tileInstanceId: string;
      tileDefId: string;
      centerRow: number;
      centerCol: number;
      rotation: number;
    }
  | {
      id: string;
      type: "TILE_ROTATION_SET";
      playerId: PlayerId;
      tileInstanceId: string;
      tileDefId: string;
      rotation: number;
    }
  | {
      id: string;
      type: "ASTROLOGERS_DRAWN";
      cardId: string;
      name: string;
      text: string;
      round: number;
    }
  | {
      id: string;
      type: "ASTROLOGERS_DISCARDED";
      cardId: string;
      name: string;
      round: number;
    }
  | {
      id: string;
      type: "EVENT_CARD_DRAWN";
      cardId: string;
      name: string;
      text: string;
      round: number;
      drawerId: PlayerId;
    }
  | {
      /** A Shady Auction: a bid was committed. The amount stays hidden. */
      id: string;
      type: "EVENT_AUCTION_BID_PLACED";
      playerId: PlayerId;
    }
  | {
      /** A Shady Auction lot resolved: `winnerId` null on a tie / no bets. */
      id: string;
      type: "EVENT_AUCTION_RESOLVED";
      cardId: CardId;
      winnerId: PlayerId | null;
      amount: number;
    }
  | {
      /** Free-form Event-resolution log line (pool moves, matches, passes). */
      id: string;
      type: "EVENT_NOTE";
      playerId?: PlayerId;
      message: string;
    }
  | {
      id: string;
      type: "ASTROLOGERS_HAND_RESHUFFLED";
      playerId: PlayerId;
      cardId: string;
      name: string;
      /** discard-all = Big Cleanup; reshuffle-spells = Annoying Lizard. */
      mode: "discard-all" | "reshuffle-spells";
      discarded: number;
      drawn: number;
      /** The round it fired, so a re-drawn proclamation never shows a stale notice. */
      round: number;
    }
  | {
      id: string;
      type: "ARMY_UNIT_FLIPPED";
      playerId: PlayerId;
      unitDefId: string;
      reason: string;
    }
  | {
      id: string;
      type: "SPELL_RETURNED_TO_HAND";
      playerId: PlayerId;
      cardId: CardId;
      reason: string;
    }
  | {
      id: string;
      type: "NEUTRAL_DRAW_SWAPPED";
      playerId: PlayerId;
      fromUnitDefId: string;
      toUnitDefId: string;
    }
  | {
      id: string;
      type: "MORALE_SPENT";
      playerId: PlayerId;
      benefit: "draw" | "redraw" | "reroll" | "repeat-search";
    }
  | {
      id: string;
      type: "FACTION_CHOSEN";
      playerId: PlayerId;
      factionId: FactionId;
      heroDefId: string;
    }
  | {
      id: string;
      type: "ADVENTURE_STARTED";
      scenarioId: string;
      playerIds: PlayerId[];
    }
  | {
      id: string;
      type: "FIELD_VISITED";
      playerId: PlayerId;
      heroId: HeroId;
      fieldId: MapSpaceId;
      location: string;
      revisit: boolean;
    }
  | {
      id: string;
      type: "FIELD_FLAGGED";
      playerId: PlayerId;
      fieldId: MapSpaceId;
      location: string;
      previousOwnerId: PlayerId | null;
    }
  | {
      id: string;
      type: "RESOURCES_GAINED";
      playerId: PlayerId;
      gold: number;
      buildingMaterials: number;
      valuables: number;
      reason: string;
    }
  | {
      id: string;
      type: "RESOURCES_SPENT";
      playerId: PlayerId;
      cost: ResourceCost;
      reason: string;
    }
  | {
      id: string;
      type: "PRODUCTION_CHANGED";
      playerId: PlayerId;
      resource: ResourceKind;
      amount: number;
    }
  | {
      id: string;
      type: "ADVENTURE_DICE_ROLLED";
      playerId: PlayerId;
      dice: "treasure" | "resource" | "attack";
      results: string[];
      /** Structured faces so the table can animate the physical dice. */
      resourceRolls?: { resource: ResourceKind; amount: number }[];
      treasureRolls?: ("experience" | "artifact-search" | "resource-die" | "double-resource-die")[];
      attackRolls?: number[];
      /** This Resource roll was caused by a Treasure-die face. */
      origin?: "treasure";
    }
  | {
      id: string;
      type: "EXPERIENCE_GAINED";
      playerId: PlayerId;
      heroId: HeroId;
      amount: number;
      experience: number;
      level: number;
    }
  | {
      id: string;
      type: "HERO_LEVEL_UP";
      playerId: PlayerId;
      heroId: HeroId;
      level: number;
      effects: string[];
    }
  | {
      /**
       * Anime Cultivation (§5.6): the hero's Cultivation Realm rose one step.
       * `realm` is the NEW realm (1 Foundation / 2 Core Formation / 3 Nascent
       * Soul); `viaTribulation` marks the realm-3 Heavenly-Tribulation win (the
       * automatic realm-1/2 advances leave it unset). Fires exactly once per
       * realm reached (the advance is idempotent).
       */
      id: string;
      type: "CULTIVATION_REALM_ADVANCED";
      playerId: PlayerId;
      heroId: HeroId;
      realm: 1 | 2 | 3;
      viaTribulation?: boolean;
    }
  | {
      /** Anime Cultivation (§5.6): the Heavenly Tribulation's seeded 3-die roll. */
      id: string;
      type: "CULTIVATION_TRIBULATION_ROLLED";
      playerId: PlayerId;
      heroId: HeroId;
      rolls: number[];
    }
  | {
      /**
       * Anime Cultivation (§5.6): the Heavenly Tribulation emptied the army —
       * no breakthrough this attempt (realm stays 2, retry allowed next turn).
       */
      id: string;
      type: "CULTIVATION_TRIBULATION_FAILED";
      playerId: PlayerId;
      heroId: HeroId;
    }
  | {
      /**
       * Anime Hero Grades (§3.11): the hero crossed a Merit threshold and rose to
       * a new grade (1/2/3), earning one grade point. One event per grade.
       */
      id: string;
      type: "HERO_GRADE_ADVANCED";
      playerId: PlayerId;
      heroId: HeroId;
      /** The new grade reached (1..HERO_GRADE_MAX; typed `number` for extensibility). */
      grade: number;
    }
  | {
      /** Anime Hero Grades (§3.11): the hero TRAINED (spent 2 MP for +1 Merit). */
      id: string;
      type: "HERO_TRAINED";
      playerId: PlayerId;
      heroId: HeroId;
    }
  | {
      /**
       * Polish Set Artifacts: a player's active-tier count for a set MOVED (up on
       * gaining a member, down on removing one from the game). Public — the whole
       * set status is public by design — and the cue the UI half drives off.
       */
      id: string;
      type: "ARTIFACT_SET_TIERS_CHANGED";
      playerId: PlayerId;
      setId: string;
      setName: string;
      /** Distinct member cards owned after the change. */
      pieces: number;
      /** Active tiers after the change. */
      tiers: number;
      /** Active tiers before it (so a UI can tell an unlock from a loss). */
      previousTiers: number;
    }
  | {
      /** Polish Set Artifacts: a set's "select 1 unit" tier picked its unit. */
      id: string;
      type: "ARTIFACT_SET_UNIT_SELECTED";
      playerId: PlayerId;
      setId: string;
      setName: string;
      unitId: string;
    }
  | {
      /** Polish Set Artifacts: a set tier was activated. `message` states what ran. */
      id: string;
      type: "ARTIFACT_SET_POWER_USED";
      playerId: PlayerId;
      setId: string;
      setName: string;
      /** The tier's piece threshold (2, 3, …). */
      tier: number;
      message: string;
    }
  | {
      /** Anime Hero Grades (§3.11): a grade tree node was picked (point spent). */
      id: string;
      type: "HERO_GRADE_NODE_PICKED";
      playerId: PlayerId;
      heroId: HeroId;
      nodeId: string;
      message: string;
    }
  | {
      /**
       * Anime Equipment (§3.13): the hero equipped an item into a slot at an
       * outfitter shop. `replacedId` is the item moved back to the bag (null on
       * an empty slot). Public feed line — no hidden information.
       */
      id: string;
      type: "EQUIPMENT_EQUIPPED";
      playerId: PlayerId;
      heroId: HeroId;
      equipmentId: string;
      slot: AnimeEquipmentSlot;
      replacedId: string | null;
    }
  | {
      /** Hero Equipment: an equipped item was returned to the equipment bag. */
      id: string;
      type: "EQUIPMENT_UNEQUIPPED";
      playerId: PlayerId;
      heroId: HeroId;
      equipmentId: string;
      slot: AnimeEquipmentSlot;
    }
  | {
      /** Anime Hero Grades (§3.11): a "skill" node's active/reaction was used. */
      id: string;
      type: "HERO_SKILL_USED";
      playerId: PlayerId;
      nodeId: string;
      message: string;
    }
  | {
      /**
       * Forced Battle Events (Anime mod, §3.12): a scripted combat event fired
       * (combat-start or a configured round-start). `playerId` is the fighting
       * hero's seat; `message`/`messageVi` are the bilingual "what happens" line.
       * Purely informational — the mechanical effect has already applied.
       */
      id: string;
      type: "COMBAT_SCRIPT_TRIGGERED";
      playerId: PlayerId;
      scriptId: string;
      scriptName: string;
      at: "combat-start" | "round-start";
      round?: number;
      message: string;
      messageVi?: string;
    }
  | {
      /** WOG commander: its command ability resolved on a target. */
      id: string;
      type: "COMMANDER_CAST_USED";
      playerId: PlayerId;
      commanderSlug: string;
      castName: string;
      power: number;
      targetUnitId: UnitId;
      message: string;
    }
  | {
      /**
       * WOG commander: a hero level-up awarded commander stat points to spend
       * (1 normally, 2 at a milestone level). Drives the level-up popup; the
       * points wait on the commander card until COMMANDER_GRADE_UP spends them.
       */
      id: string;
      type: "COMMANDER_POINTS_AWARDED";
      playerId: PlayerId;
      commanderSlug: string;
      points: number;
      level: number;
      totalUnspent: number;
      message: string;
    }
  | {
      /** WOG commander: a stat point was spent to raise one stat by a grade. */
      id: string;
      type: "COMMANDER_GRADED_UP";
      playerId: PlayerId;
      commanderSlug: string;
      stat: CommanderStatKey;
      message: string;
    }
  | {
      /** WOG commander: killed in combat (stays dead until revived). */
      id: string;
      type: "COMMANDER_DIED";
      playerId: PlayerId;
      commanderSlug: string;
      message: string;
    }
  | {
      /** WOG commander: revived for gold on the owner's map turn. */
      id: string;
      type: "COMMANDER_REVIVED";
      playerId: PlayerId;
      commanderSlug: string;
      goldPaid: number;
      message: string;
    }
  | {
      /** Hierophant commander: a post-combat First Aid restoration. */
      id: string;
      type: "COMMANDER_FIRST_AID_USED";
      playerId: PlayerId;
      message: string;
    }
  | {
      /** A WOG commander specialty fired (Charming, Pacifist, Soul Reformer…). */
      id: string;
      type: "COMMANDER_SPECIALTY_TRIGGERED";
      playerId: PlayerId;
      commanderSlug: string;
      specialtyId: string;
      message: string;
    }
  | {
      /** Sonya: Unbreakable Bond's persistent army-card target changed. */
      id: string;
      type: "COMMANDER_BOND_SET";
      playerId: PlayerId;
      armyUnitId: string;
      unitDefId: string;
      message: string;
    }
  | {
      /** WOG Commander Artifact bound permanently into a slot (Task 2). */
      id: string;
      type: "COMMANDER_ARTIFACT_BOUND";
      playerId: PlayerId;
      commanderSlug: string;
      cardId: CardId;
      slot: CommanderArtifactSlot;
      message: string;
    }
  | {
      /**
       * Helm of Immortality (Task 2): a commander that died this combat was
       * revived FREE at combat end (death never persisted, no gold paid).
       */
      id: string;
      type: "COMMANDER_ARTIFACT_SAVED";
      playerId: PlayerId;
      commanderSlug: string;
      cardId: CardId;
      message: string;
    }
  | {
      id: string;
      type: "MORALE_CHANGED";
      playerId: PlayerId;
      /** Token delta for this step (always ±1 for token-mode multi-token sources). */
      amount: number;
      total: number;
      /**
       * @deprecated Unused. Hand dump is checked at END_TURN via morale <= -2.
       * Optional field kept so older event-log entries still type-check.
       */
      handDiscardAtTurnEnd?: boolean;
    }
  | {
      id: string;
      type: "MORALE_CARD_DRAWN";
      playerId: PlayerId;
      cardId: CardId;
      polarity: "positive" | "negative";
      reshuffledDiscard: boolean;
    }
  | {
      id: string;
      type: "MORALE_CARD_DISCARDED";
      playerId: PlayerId;
      cardId: CardId;
      polarity: "positive" | "negative";
      /**
       * cancelled-by-positive: a Positive gain removed a held Negative card;
       * absorbed-negative: a Negative gain was soaked by a held Positive card;
       * positive-limit: discarded down to the two-Positive-cards cap.
       */
      reason: "cancelled-by-positive" | "absorbed-negative" | "positive-limit";
    }
  | {
      id: string;
      type: "MORALE_CARD_USED";
      playerId: PlayerId;
      cardId: CardId;
      polarity: "positive" | "negative";
      reason: "used";
    }
  | {
      /** Crest of Valor: a Field's negative-morale token was ignored. */
      id: string;
      type: "FIELD_MORALE_IGNORED";
      playerId: PlayerId;
      fieldId: MapSpaceId;
    }
  | {
      id: string;
      type: "NEUTRAL_COMBAT_STARTED";
      playerId: PlayerId;
      heroId: HeroId;
      fieldId: MapSpaceId;
      difficulty: number;
      unitDefIds: string[];
    }
  | {
      /**
       * The guard army is drawn and placed only after the player finishes
       * their own placement (rulebook Combat Setup order).
       */
      id: string;
      type: "NEUTRAL_ARMY_REVEALED";
      playerId: PlayerId;
      fieldId: MapSpaceId;
      difficulty: number;
      unitDefIds: string[];
    }
  | {
      /** A Creature Bank Token was placed on a Tile's Blocked Field. */
      id: string;
      type: "CREATURE_BANK_PLACED";
      fieldId: MapSpaceId;
      bankId: string;
      bankSize?: BankSize;
    }
  | {
      /**
       * A Subterranean Gate half was carved on a Tile, sacrificing whatever field
       * sat there. `sacrificed` is the Location the hex used to be (so the UI can
       * warn "your Gold Mine became a gate"); `chosen` marks a player pick-on-
       * reveal placement vs. an automatic nearest-hex carve.
       */
      id: string;
      type: "SUBTERRANEAN_GATE_PLACED";
      playerId: PlayerId;
      fieldId: MapSpaceId;
      tileInstanceId: string;
      gateToTileId: string;
      sacrificed: string;
      chosen: boolean;
    }
  | {
      /** A Creature Bank Combat began (no Field Difficulty). */
      id: string;
      type: "CREATURE_BANK_COMBAT_STARTED";
      playerId: PlayerId;
      heroId: HeroId;
      fieldId: MapSpaceId;
      bankId: string;
      unitDefIds: string[];
      stackedCount: number;
    }
  | {
      /**
       * A player Empowered an ability (Ability Empower token, bank surplus
       * auto-use, …): its Expert side may henceforth be played without a crown.
       */
      id: string;
      type: "ABILITY_EMPOWERED";
      playerId: PlayerId;
      cardId: CardId;
    }
  | {
      /** Player gained an Ability Empower token (cap 1). */
      id: string;
      type: "ABILITY_EMPOWER_TOKEN_GAINED";
      playerId: PlayerId;
      total: number;
      /** True when already at cap and the surplus forced an auto-use menu. */
      surplus?: boolean;
    }
  | {
      /** Player spent an Ability Empower token to empower a hand ability. */
      id: string;
      type: "ABILITY_EMPOWER_TOKEN_SPENT";
      playerId: PlayerId;
      cardId: CardId;
      total: number;
    }
  | {
      /**
       * A Stacked Creature Bank defender took a lethal blow and discarded its
       * Stack Token instead of being removed, carrying the leftover damage to
       * its new Health.
       */
      id: string;
      type: "STACK_TOKEN_DISCARDED";
      unitId: UnitId;
      playerId: PlayerId;
      unitName: string;
      excessDamage: number;
    }
  | {
      /** A player bought one persistent Polish Stack layer for a Pack card. */
      id: string;
      type: "ARMY_STACK_PURCHASED";
      playerId: PlayerId;
      armyUnitId: string;
      unitDefId: string;
      stacks: number;
      cost: ResourceCost;
    }
  | {
      /**
       * A Polish Stack layer was lost — absorbed lethal damage in combat, or
       * (with `reason` set) absorbed a map effect (Terrible Plague weakened).
       */
      id: string;
      type: "ARMY_STACK_LOST";
      unitId: UnitId;
      playerId: PlayerId;
      unitName: string;
      remainingStacks: number;
      excessDamage: number;
      reason?: string;
    }
  | {
      /**
       * Unit Experience: an army unit card crossed a veteran-rank threshold
       * (after a won combat's XP award or a Drill). `rank` is the NEW rank 1-3.
       */
      id: string;
      type: "UNIT_RANK_UP";
      playerId: PlayerId;
      unitDefId: string;
      unitName: string;
      rank: number;
    }
  | {
      /**
       * Unit Experience: the player paid gold to Drill one army unit at their
       * own Town (+1 unit XP). `experience` is the card's new XP total.
       */
      id: string;
      type: "UNIT_DRILLED";
      playerId: PlayerId;
      unitDefId: string;
      unitName: string;
      experience: number;
    }
  | {
      /** MGQ: one faction or sealed Companion card received a new Job token. */
      id: string;
      type: "MGQ_JOB_ASSIGNED";
      playerId: PlayerId;
      armyUnitId: string;
      unitDefId: string;
      job: MgqJob;
      goldPaid: number;
    }
  | {
      /** MGQ: the after-combat Companion seal was accepted or declined. */
      id: string;
      type: "MGQ_COMPANION_RECRUITED";
      playerId: PlayerId;
      unitDefId?: string;
      cost?: ResourceCost;
      declined?: boolean;
    }
  | {
      /** MGQ: the Spirit Shrine's current contracted-spirit stance changed. */
      id: string;
      type: "MGQ_SPIRIT_SELECTED";
      playerId: PlayerId;
      spirit: MgqSpirit;
    }
  | {
      /**
       * Unit Experience: an upgrade diluted a card's XP (WoG Crexpmod read) —
       * a Few→Pack reinforcement halves it, a purchased Stack layer costs 1.
       * `experience` is the card's NEW XP total.
       */
      id: string;
      type: "UNIT_XP_DILUTED";
      playerId: PlayerId;
      unitDefId: string;
      unitName: string;
      experience: number;
      reason: "reinforce" | "stack";
    }
  | {
      id: string;
      type: "GAME_OPTIONS_CHANGED";
      playerId: PlayerId;
      message: string;
    }
  | {
      /**
       * Map designer scenario condition fired (starting bonus or timed event)
       * or a designer note for the table. Public feed line.
       */
      id: string;
      type: "MAP_PRESET_TRIGGERED";
      round?: number;
      message: string;
    }
  | {
      /**
       * Victory-Points round-limit warning: the round now beginning (`round`) is
       * the FINAL round — the game ends after it completes. Table-wide and
       * playerId-agnostic; emitted once at that round's start by
       * {@link startAdventureRound}. The client pops a one-time overlay plus a
       * feed line so the impending end is never a surprise.
       */
      id: string;
      type: "FINAL_ROUND";
      round: number;
    }
  | {
      /**
       * Anime mod §11 — a designer-triggered visual-novel STORY scene fired at
       * the start of a round (map-designer "Timed events"). Table-wide and
       * playerId-agnostic: every client pops the StoryOverlay once per event id
       * and dismisses independently, never replayed on reconnect. Presentation
       * only — no rules state changes.
       */
      id: string;
      type: "STORY_SCENE_TRIGGERED";
      round?: number;
      sceneId: string;
      message: string;
    }
  | {
      /** Calamity Waves: next round brings a wave — position your armies. */
      id: string;
      type: "MONSTER_WAVE_ANNOUNCED";
      round: number;
      wave: number;
      message: string;
    }
  | {
      /** Calamity Waves: the wave round began — assaults resolve in seat order. */
      id: string;
      type: "MONSTER_WAVE_STARTED";
      round: number;
      wave: number;
      level: number;
      message: string;
    }
  | {
      /** Calamity Waves: this seat repelled its assault (win reward paid). */
      id: string;
      type: "MONSTER_WAVE_REPELLED";
      playerId: PlayerId;
      wave: number;
      gold: number;
      message: string;
    }
  | {
      /** Calamity Waves: the assault broke through — gold lost, a holding overrun. */
      id: string;
      type: "MONSTER_WAVE_PILLAGED";
      playerId: PlayerId;
      wave: number;
      goldLost: number;
      overrunFieldId: MapSpaceId | null;
      message: string;
    }
  | {
      id: string;
      type: "MONSTER_WAVE_BATTLE_EVENT";
      playerId: PlayerId;
      wave: number;
      eventId: string;
      message: string;
    }
  | {
      id: string;
      type: "CALAMITY_GATE_PLACED";
      fieldId: MapSpaceId;
      message: string;
    }
  | {
      id: string;
      type: "CALAMITY_GATE_PREPARED";
      playerId: PlayerId;
      wave: number;
      message: string;
    }
  | {
      /** Raid Bosses: the sky cracks — a Rift Lair opens next round. */
      id: string;
      type: "RAID_BOSS_ANNOUNCED";
      round: number;
      message: string;
    }
  | {
      /** Raid Bosses: the boss lairs on a field (scheduled or designer-placed). */
      id: string;
      type: "RAID_BOSS_SPAWNED";
      bossInstanceId: string;
      defId: string;
      bossName: string;
      fieldId: MapSpaceId;
      layers: number;
      message: string;
    }
  | {
      /** Raid Bosses: a health layer broke — the breaker is paid at once. */
      id: string;
      type: "RAID_BOSS_LAYER_BROKEN";
      bossInstanceId: string;
      playerId: PlayerId;
      layersLeft: number;
      gold: number;
      message: string;
    }
  | {
      /** Raid Bosses: an ignored boss regrew a layer. */
      id: string;
      type: "RAID_BOSS_ESCALATED";
      bossInstanceId: string;
      layersLeft: number;
      message: string;
    }
  | {
      /** Raid Bosses: slain — the killer takes the printed reward, the lair clears. */
      id: string;
      type: "RAID_BOSS_SLAIN";
      bossInstanceId: string;
      playerId: PlayerId;
      bossName: string;
      message: string;
    }
  | {
      /** The Dungeon: the delve site was carved onto a Blocked Field. */
      id: string;
      type: "DUNGEON_PLACED";
      fieldId: MapSpaceId;
      message: string;
    }
  | {
      /** The Dungeon: a floor fell — the delver's ladder reward paid. */
      id: string;
      type: "DUNGEON_FLOOR_CLEARED";
      playerId: PlayerId;
      floor: number;
      message: string;
    }
  | {
      /** The Dungeon: floor 10 fell — the Dungeon Conqueror title. */
      id: string;
      type: "DUNGEON_CONQUERED";
      playerId: PlayerId;
      message: string;
    }
  | {
      /**
       * A Secret landmark filter could not be fulfilled from the remaining
       * pool, so the slot fell back to a pure random draw. Public note so
       * players know the designer guarantee was soft-failed.
       */
      id: string;
      type: "MAP_SECRET_FEATURE_FALLBACK";
      feature: string;
      group: string;
      message: string;
    }
  | {
      /**
       * The map designer FIXED a seat's starting-tile orientation
       * (`lockRotation`): the home tile is placed at the designed rotation and
       * this seat owes no opening free-rotation. Emitted once per locked seat at
       * game start (whether or not the opening ceremony is on) so the whole table
       * sees the map forced this seat's home-tile orientation. Public feed line.
       */
      id: string;
      type: "START_TILE_ORIENTATION_FIXED";
      playerId: PlayerId;
      rotation: number;
    }
  | {
      id: string;
      type: "SETUP_SEAT_RESET";
      playerId: PlayerId;
      /**
       * Which committed setup choice the seat threw away: a locked hero "pick",
       * a rolled-and-locked "town", or a pending "roll". Broadcast loudly to the
       * whole table because re-doing a roll or pick after seeing the result is a
       * setup take-back (a do-over) — the lobby surfaces it as a red warning so
       * every player notices, in all four setup formats.
       */
      scope: "pick" | "town" | "roll";
      message: string;
    }
  | {
      id: string;
      type: "PLAYER_COMBAT_STARTED";
      attackerPlayerId: PlayerId;
      defenderPlayerId: PlayerId;
      fieldId: MapSpaceId;
    }
  | {
      id: string;
      type: "QUICK_COMBAT_WON";
      playerId: PlayerId;
      heroId: HeroId;
      fieldId: MapSpaceId;
      difficulty: number;
    }
  | {
      id: string;
      /**
       * Single-player smoothing: a computer seat's guaranteed first-battle win
       * fired — every guard fell before any unit acted (see
       * `src/engine/computer/guaranteed-wins.ts`). The matching COMBAT_ENDED
       * follows immediately; rewards resolve through the normal victory path.
       */
      type: "COMPUTER_GUARANTEED_WIN";
      playerId: PlayerId;
      heroId: HeroId;
      fieldId: MapSpaceId;
      difficulty: number;
      /** 1-based: which of the seat's guaranteed battles this was (1 or 2). */
      battleNumber: number;
    }
  | {
      id: string;
      type: "COMBAT_CONTINUED";
      playerId: PlayerId;
      movementLeft: number;
    }
  | {
      id: string;
      type: "COMBAT_RETREATED";
      playerId: PlayerId;
      heroId: HeroId;
      returnedTo: MapSpaceId;
    }
  | {
      id: string;
      type: "COMBAT_UNIT_PLACED";
      playerId: PlayerId;
      unitId: UnitId;
      position: number;
    }
  | {
      id: string;
      type: "COMBAT_PLACEMENT_FINISHED";
      playerId: PlayerId;
    }
  | {
      /** PvP: the defender finished pre-combat preparation; deployment begins. */
      id: string;
      type: "COMBAT_PREP_ACCEPTED";
      playerId: PlayerId;
    }
  | {
      /** Tactics: two of a player's units switched battlefield positions. */
      id: string;
      type: "COMBAT_UNITS_SWAPPED";
      playerId: PlayerId;
      unitIdA: UnitId;
      unitIdB: UnitId;
      mode: "basic" | "expert";
    }
  | {
      /** Diplomacy (Map): the Neutral Unit cards drawn, one per Dwelling. */
      id: string;
      type: "DIPLOMACY_NEUTRALS_DRAWN";
      playerId: PlayerId;
      unitDefIds: string[];
    }
  | {
      /** Diplomacy (Instant): a matching-level Neutral fight skipped for no XP. */
      id: string;
      type: "DIPLOMACY_COMBAT_SKIPPED";
      playerId: PlayerId;
      heroId: HeroId;
      fieldId: MapSpaceId;
      difficulty: number;
    }
  | {
      id: string;
      type: "UNIT_RECRUITED";
      playerId: PlayerId;
      unitDefId: string;
      kind: "recruit" | "reinforce";
      cost: ResourceCost;
      /**
       * House rule (BINH) — Gelu IV: when set, this recruit carries a permanent
       * +Attack BUFF (the value is the bonus). Drives the "this is a BUFF" notice
       * the player sees when a Gelu-recruited Sharpshooters joins the army.
       */
      attackBuff?: number;
      /**
       * Creature Bank Stacked reward (Dragon Fly Hive / Griffin Conservatory,
       * X ≥ 2): the dedicated bank reward card carries this rulebook Stack Token
       * (+1 Attack/Defense/Health or +2 Initiative). Drives the "Stacked" feed
       * note so the token grant is never silent.
       */
      stackToken?: StackTokenStat;
    }
  | {
      id: string;
      type: "SPELLS_PURCHASED";
      playerId: PlayerId;
      cost: ResourceCost;
    }
  | {
      id: string;
      type: "TRADE_EXECUTED";
      playerId: PlayerId;
      rateLabel: string;
    }
  | {
      id: string;
      type: "WAR_MACHINE_BOUGHT";
      playerId: PlayerId;
      cardId: CardId;
      cost: ResourceCost;
      at: "factory" | "trading-post";
    }
  | {
      /** A permanent card entered play (the previous one went to discard). */
      id: string;
      type: "PERMANENT_PLAYED";
      playerId: PlayerId;
      cardId: CardId;
      replacedCardId: CardId | null;
    }
  | {
      /** An in-play permanent left play for the discard pile. */
      id: string;
      type: "PERMANENT_DISCARDED";
      playerId: PlayerId;
      cardId: CardId;
      /**
       * "cracked": removed from the game for its instant gain (income rings/carts).
       * "destruction": removed from the game by the Destruction Astrologers card.
       */
      reason: "voluntary" | "limit" | "expert" | "replaced" | "cracked" | "destruction";
    }
  | {
      /** Pandora's Box: the visiting hero drew a Pandora deck card. */
      id: string;
      type: "PANDORA_CARD_DRAWN";
      playerId: PlayerId;
      cardId: CardId;
    }
  | {
      /** Factory shovel dig: the visiting hero dug an Artifact and kept or discarded it. */
      id: string;
      type: "ARTIFACT_DUG";
      playerId: PlayerId;
      cardId: CardId;
      kept: boolean;
    }
  | {
      /** A war machine fired (round-start trigger or its expert discard). */
      id: string;
      type: "WAR_MACHINE_TRIGGERED";
      playerId: PlayerId;
      cardId: CardId;
      targetUnitId?: UnitId;
      message: string;
    }
  | {
      id: string;
      type: "GAME_WON";
      playerId: PlayerId;
      reason: string;
    }
  | {
      /**
       * Victory Points scoring at game end (VP mode). Carries the full per-player
       * breakdown so the feed + scoring overlay can show every line. Emitted
       * immediately BEFORE the GAME_WON event that names the VP winner.
       */
      id: string;
      type: "VP_SCORING";
      /** Player who completed the victory condition (earning the completion VP), or null on a round-limit end. */
      completerPlayerId: PlayerId | null;
      /** Why scoring ran (round limit reached / the completed victory condition). */
      reason: string;
      /** Winning seat: most VP; ties broken by the completer, then earliest turn order. */
      winnerPlayerId: PlayerId;
      /** Per-player VP breakdown, winner first. */
      breakdown: {
        playerId: PlayerId;
        total: number;
        rows: { label: string; vp: number }[];
      }[];
    }
  | {
      id: string;
      type: "PLAYER_ELIMINATED";
      playerId: PlayerId;
      reason: string;
      /** True when the player chose to give up rather than being timed out. */
      gaveUp: boolean;
    }
  | {
      id: string;
      type: "AFK_VOTE_STARTED";
      targetPlayerId: PlayerId;
      byPlayerId: PlayerId;
      message: string;
    }
  | {
      id: string;
      type: "AFK_VOTE_CAST";
      playerId: PlayerId;
      vote: "kick" | "wait";
    }
  | {
      id: string;
      type: "AFK_VOTE_RESOLVED";
      targetPlayerId: PlayerId;
      outcome: "kick" | "wait" | "cancelled";
      message: string;
    }
  | {
      id: string;
      /** A seat idle past AFK_AUTO_KICK_MS (30 min) was auto-kicked without a vote. */
      type: "AFK_AUTO_KICKED";
      targetPlayerId: PlayerId;
      byPlayerId: PlayerId;
      message: string;
    }
  | {
      id: string;
      /** A turn burned its whole 10-minute budget and is being force-ended. */
      type: "TURN_TIME_EXPIRED";
      targetPlayerId: PlayerId;
      byPlayerId: PlayerId;
      message: string;
    }
  | {
      id: string;
      /** The room's match type was set (Ranked vs Normal). */
      type: "ROOM_RANKED_CHANGED";
      ranked: boolean;
      byClientId: string;
    }
  | {
      id: string;
      /** A pre-start ready check opened / advanced / finished. */
      type: "START_CHECK_STARTED";
      byPlayerId: PlayerId;
      message: string;
    }
  | {
      id: string;
      type: "START_CHECK_CONFIRMED";
      playerId: PlayerId;
      /** Confirmations so far / total seated players. */
      confirmed: number;
      needed: number;
    }
  | {
      id: string;
      type: "START_CHECK_CANCELLED";
      /** "cancel" when a player pressed Cancel; "timeout" when the 30s window elapsed. */
      reason: "cancel" | "timeout";
      byPlayerId: PlayerId;
      message: string;
    }
  | {
      id: string;
      type: "PLAYER_ELIMINATION_CLOCK";
      playerId: PlayerId;
      /** Turns the player has left before elimination, or null when cleared. */
      turnsLeft: number | null;
    }
  | {
      /**
       * Setup roll for the starting player (official rulebook step 22): every
       * player rolls the Attack die, highest result starts; ties reroll among
       * the tied players. Every attempt's rolls are kept for display.
       */
      id: string;
      type: "FIRST_PLAYER_ROLLED";
      attempts: { rolls: { playerId: PlayerId; name: string; value: number }[] }[];
      winnerPlayerId: PlayerId;
    }
  | {
      id: string;
      type: "COMBAT_TOKEN_PLACED";
      unitId: UnitId;
      playerId: PlayerId;
      kind: CombatTokenKind;
      amount: number;
      sourceName: string;
    }
  | {
      id: string;
      type: "COMBAT_TOKEN_REMOVED";
      unitId: UnitId;
      kind: CombatTokenKind;
      reason: "expired" | "replaced" | "damage" | "activation-skipped" | "dispelled";
    }
  | {
      /** Siege: the defender's Walls, Gate and Arrow Tower hit the board. */
      id: string;
      type: "SIEGE_FORTIFICATIONS_PLACED";
      playerId: PlayerId;
      wallPositions: number[];
      gatePosition: number;
    }
  | {
      id: string;
      type: "FORTIFICATION_DESTROYED";
      playerId: PlayerId;
      byUnitId: UnitId | null;
      kind: "wall" | "gate" | "arrow-tower";
      position?: number;
      message: string;
    }
  | {
      id: string;
      type: "TOWN_BUILDING_USED";
      playerId: PlayerId;
      buildingId: BuildingId;
      message: string;
    }
  | {
      /** A Spell Scroll was taken from a field; its 2 spells are now held. */
      id: string;
      type: "SPELL_SCROLL_GAINED";
      playerId: PlayerId;
      scrollId: string;
      spellCardIds: CardId[];
    }
  | {
      /** A Spell Scroll spell was sold at the market for gold. */
      id: string;
      type: "SCROLL_SPELL_SOLD";
      playerId: PlayerId;
      scrollId: string;
      cardId: CardId;
      gold: number;
    };

export type ResolutionStackItem = {
  id: string;
  source: SourceRef;
  action: GameAction;
  status: "pending" | "waiting-for-reaction" | "resolving" | "resolved" | "cancelled";
  triggerEventIds: string[];
  modifiers: {
    spellPowerBonus: number;
    /**
     * Polish Set Artifacts — Pendant of Reflection: the enemy Spell-Power drain
     * LOCKED onto this cast when it went on the stack (and paid for there, so
     * the once-per-combat charge is already spent). Stored rather than
     * re-derived so the preview, every in-window re-read and the final
     * resolution all subtract the same number. Absent/0 = no drain.
     */
    artifactSetSpellDrain?: number;
    /**
     * School of Magic permanent bonus on this cast, tracked apart from
     * spellPowerBonus so it neither blocks nor is blocked by Power cards.
     * Basic (+1) applies automatically; the expert discard replaces it.
     */
    schoolPowerBonus?: number;
    attackBonus: number;
    defenseBonus: number;
    /**
     * Polish Balance Pack Shield (Power 2): "takes up to 3 damage" — a per-attack
     * damage CAP on the blow this stack item is resolving. Clamped at the shared
     * damage seam alongside the printed unit damage caps.
     */
    attackDamageCap?: number;
    /** Equipment attack riders armed for this single declared attack. */
    equipmentCorrosion?: boolean;
    equipmentPoison?: boolean;
    /**
     * The same cap's Power TABLE plus the caster, so Power pooled into this
     * window AFTER the card was played still re-derives the rung — the
     * `slayerRollsByPower` pattern.
     */
    attackDamageCapByPower?: { table: Record<number, number>; playerId: PlayerId };
    /**
     * Polish Balance Pack Misfortune: how the negated attack's Attack DIE is
     * rolled. "negate" is the classic cancelled die; "lower-of-two" rolls 2 dice
     * and resolves the lower; "four-reroll-plus" rolls 4, rerolls every "+1"
     * once, and resolves every result (a "-1" subtracts).
     */
    misfortuneDie?: "negate" | "lower-of-two" | "four-reroll-plus";
    misfortuneDieByPower?: Record<number, "negate" | "lower-of-two" | "four-reroll-plus">;
    misfortuneCasterId?: PlayerId;
    /**
     * Interference / Plate of the Dying Light played as an INSTANT reaction to
     * THIS cast: reduce Spell damage dealt to `unitId` by `amount` for the
     * duration of this stack item only (vanishes with the cast). Multiple
     * plays (basic then expert, or Interference + Plate) stack by summing.
     */
    interfereSpellReductions?: { unitId: UnitId; amount: number }[];
    /** Balance Interference alternative, subtracted from this enemy cast only. */
    interferencePowerReduction?: number;
    /** Centaur's Axe: multiplies the rolled attack-die outcome (default 1). */
    attackDieMultiplier?: number;
    /**
     * Polish Balance Pack Centaur's Axe: the multiplier above is IGNORED on a
     * rolled "-1" ("Ignore on '-1' result"), so a "-1" counts once, not thrice.
     */
    attackDieMultiplierSkipsNegative?: boolean;
    /** Brimstone Stormclouds: faction cubes spent on this cast (max 1). */
    townCubePowerBonus?: number;
    /**
     * Spell Scroll cast: standing/school/equipment Power and Orb doubling never
     * apply. Only Power paid into this window (`spellPowerBonus` from Power
     * cards / "+1 Power" discards) counts, and only up to the spell's lowest
     * useful tier — higher ladder rungs are unreachable.
     */
    scrollLocked?: boolean;
    /**
     * Polish Balance Pack — the reprinted EXPERT Eagle Eye copies an enemy's
     * damaging spell "with 0 SP": the copy's base Power is ZERO (no standing /
     * school / Orb source counts), and only Power the caster ADDS into this cast
     * window applies. Unlike `scrollLocked` the paid Power is NOT capped at the
     * spell's weakest tier — the printed card says "You can add SP to this spell".
     */
    spellPowerBaseZero?: boolean;
    /**
     * Helm of the Alabaster Unicorn cast (option B): the spell was cast from the
     * top of the Spell-deck discard pile. Like a scroll cast it has no hand/discard
     * card to send anywhere afterward — the card stays in the Spell-deck discard
     * pile — so finalizeSpellCardDestination leaves it untouched.
     */
    fromSpellDeck?: boolean;
    /**
     * Polish Balance Pack Helm of the Alabaster Unicorn: the cast Spell is
     * INSCRIBED into the caster's Polish Spellbook when it resolves, instead of
     * staying in the shared Spell-deck discard pile.
     */
    inscribeCastToSpellBook?: boolean;
    /**
     * Tarnum (Conflux) VI cast: a free over-limit cast of a just-Searched hand
     * spell. On resolution the card is pulled out of the caster's discard and
     * placed on the shared Spell deck top ("deck-top") or its discard pile
     * ("discard"), rather than staying in the caster's own discard.
     */
    tarnumReturn?: "deck-top" | "discard";
    /** Bless: the Attack die is not rolled (counts as 0). */
    ignoreAttackDie?: boolean;
    /**
     * Ivor's Elves I / VI: a played specialty forced this attack's die to a
     * fixed face. At resolution every die shows this value (no roll, no reroll);
     * it is a real face so face-conditioned abilities still read it. 0 = "set all
     * dice to 0" (I); 1 = "set your roll to +1" (VI's chosen-value option).
     */
    forcedRoll?: number;
    /**
     * Lord Haart (Necropolis) Dread Knights I/VI: damage knocked off THIS
     * retaliation by the instant the defender's controller played in the
     * retaliation window (1/2, doubled for his Dread Knights). Only ever set on
     * a retaliation attack; read into the attack's `damageReduction` at
     * resolution, then discarded with the stack item.
     */
    retaliationDamageReductionInstant?: number;
    /** Frenzy: this attack ignores the defender's Defense (counts as 0). */
    ignoreDefense?: boolean;
    /**
     * Slayer: roll the Attack die this many times against a gold defender and
     * count the "+1" faces as the die's whole contribution (every "-1" is
     * ignored). Set by the Slayer reaction; consumed in resolveAttackStackItem.
     */
    slayerRolls?: number;
    /**
     * Slayer's power→rolls table, kept so the roll count re-derives when more
     * Power lands in the attack window after Slayer was played (the caster keeps
     * priority and may keep empowering it) instead of being frozen at the Power
     * it had when first cast — the same recompute the attack/defense instants get.
     */
    slayerRollsByPower?: Record<number, number>;
    /** Adrienne's Fire Magic: extra Power her School-of-Fire bonus adds to a
     * fire Slayer's roll-count lookup (constant offset, folded into the Power). */
    slayerSchoolPowerBonus?: number;
    /** Slayer: draw 1 card once the modified attack has resolved. */
    slayerDraw?: boolean;
    /** Precision: this shot ignores the ranged back-row penalty. */
    ignoreRangedPenalty?: boolean;
    /**
     * Polish Set Artifacts, the "rolls 2 dice and resolves the higher result"
     * tiers (Angelic Alliance 3, Power of the Dragon Father 2): the holder played
     * the tier as an INSTANT inside THIS attack's own reaction window, so the
     * advantage rides the attack itself and covers exactly this ONE roll — the
     * printed singular "result" (2026-08-11 ruling: "it is an instant … should
     * work only once"). The `ignoreRangedPenalty` / `redirectedInstants`
     * precedent: it vanishes with the stack item, so a later attack in the same
     * combat rolls plain with no expiry code. A Retaliation Attack is its own
     * stack item, so the flag never bleeds across the exchange.
     */
    artifactSetAttackAdvantage?: boolean;
    /**
     * Spell instants played into this attack that the OTHER side may still
     * cancel with Resistance (Curse/Weakness/Bloodlust/Precision/Bless/Slayer).
     * Each entry is the casting player; the spell's effect on the attack is
     * reversed if cancelled, exactly like Resistance ending an Activation cast.
     * Non-spell boosts (the Attack/Defense statistics) are never listed — they
     * are not Spells and cannot be Resisted.
     */
    cancellableSpellInstants?: { cardId: CardId; playerId: PlayerId }[];
    /**
     * Magic Mirror bounced an instant combat debuff (Curse/Weakness) onto a new
     * unit. These are NOT ongoing effects or tokens — they are the instant
     * itself, re-pointed: a one-shot stat delta that the attack maths apply to
     * the named unit for THIS attack and (copied across) its retaliation, then
     * vanish with the stack item. So nothing can Dispel or ignore them — only
     * spell-immunity stops them, enforced by the redirect's target filter.
     */
    redirectedInstants?: { unitId: UnitId; stat: "attack" | "defense"; amount: number }[];
    /**
     * Knowledge / Mysticism was played on this cast. The recall resolves
     * after the spell does: instants come back at once, ongoing spells only
     * when the effect they created ends. `toSpellBook` routes a Spell cast from
     * the Spell Book back into the Book (a private zone) rather than the hand.
     */
    recallSpell?: {
      toHand: boolean;
      recallPlayedCards: boolean;
      /** The Mysticism/Knowledge card itself; Expert recall never returns it. */
      sourceCardId?: CardId;
      toSpellBook?: boolean;
      /** Polish Mysticism: refresh the used Book Spell itself. */
      polishRefreshSpell?: boolean;
      /** Polish Knowledge / expert Mysticism: return the generic cast card. */
      polishRecallEnabler?: boolean;
    };
    /**
     * Spell instants played as reactions into this ATTACK window whose card now
     * sits in the caster's own discard pile (Stone Skin, Bloodlust, Curse,
     * Misfortune, a lethal-save Resurrection …). A Knowledge/Mysticism play in
     * the same window arms a DEFERRED take-back of the caster's most recent
     * entry ("instead of discarding it") — the spell stays in the discard while
     * the attack resolves (so it can never be re-cast into this same attack) and
     * returns to hand (or the Book, when `fromSpellBook`) only once the attack
     * finishes. Scroll / Tarnum-return / removeSelf plays leave no card in the
     * caster's discard, so they are never listed.
     */
    recallableSpellReactions?: {
      cardId: CardId;
      playerId: PlayerId;
      fromSpellBook?: boolean;
      castEnablerCardId?: CardId;
    }[];
    /**
     * Cards played from the Spell Book into THIS stack item (a Book instant, a
     * Book "+1 Power" discard). A Mysticism-expert recall that sweeps every card
     * played alongside the spell routes these back to the Book instead of the
     * hand, keeping the Book's contents tight.
     */
    bookPlayedCardIds?: CardId[];
    /**
     * Knowledge / Mysticism recalls declared into this ATTACK window but held
     * until the attack resolves (see `recallableSpellReactions`). Each entry is
     * returned to hand — or the Spell Book when `toSpellBook` — the moment the
     * attack finishes, so the recalled copy is never available to re-cast into
     * the same attack. Processed by processDeferredSpellRecalls.
     */
    deferredSpellRecalls?: {
      cardId: CardId;
      playerId: PlayerId;
      toSpellBook: boolean;
      /** Move Polish Book used -> refreshed instead of discard -> destination. */
      fromPolishUsed?: boolean;
    }[];
    /**
     * Alamar's Resurrection armed on this attack: if it would reduce the named
     * unit (of `grade` or lower) to 0 HP, the blow is cancelled.
     */
    cancelLethal?: { unitId: UnitId; grade: UnitGrade };
    /**
     * The attack die outcome rolled before pausing for the lethal-save window,
     * reused when the attack resumes so the die is not rerolled.
     */
    rolledCandidate?: { rolls: number[]; roll: number };
    /** Set once the lethal-save window has been offered for this attack. */
    lethalSaveOffered?: boolean;
    /** MGQ Hunter: prevents duplicate low-roll pierce announcements on lethal-save resume. */
    mgqHunterPierceAnnounced?: boolean;
    /**
     * Shield of the Dwarven Lords: set once the post-roll die-cancel window has
     * been offered for this attack, so it is opened at most once.
     */
    dieCancelOffered?: boolean;
    /**
     * Shield of the Dwarven Lords resolved: the rolled Attack die (and every
     * effect that die face would have triggered) is ignored — the face counts
     * as 0 and no die-triggered ability fires.
     */
    attackDieCancelled?: boolean;
    /**
     * Misfortune: while true, this attack opened the dedicated pre-buff window
     * where only the defender's Misfortune may be played (before any other card,
     * per the card's timing). Cleared the instant Misfortune is played or the
     * defender declines, at which point the normal attack-declared buff window
     * takes over.
     */
    misfortunePhase?: boolean;
    /**
     * Misfortune resolved on this attack: the attacker can no longer increase
     * their attack from any source for this attack. The legal-action layer
     * refuses every attack-increasing reaction to the attacker (Bloodlust,
     * Precision, Bless, Slayer, Hall of Valhalla / Cage attack boosts), and the
     * Attack die is cancelled alongside (`attackDieCancelled`).
     */
    negateAttackBuffs?: boolean;
    /**
     * A defending defender's Defense roll for this attack, rolled once and
     * reused across the lethal-save window so the same outcome decides the hit.
     * Only a "+1" grants +1 Defense.
     */
    defendRoll?: number;
    /**
     * Morale adjustments that visibly changed this attack's Defend roll (the
     * forced reroll of a "+1" / the −1 latch), recorded when the roll is made
     * and carried onto ATTACK_ROLLED as rollModifiers. Display-only.
     */
    defendRollNotes?: AttackRollModifierNote[];
    /**
     * WOG commander Damage grade ("Might"): the extra attack dice rolled for
     * this attack (Damage grade = how many). Rolled once and reused across the
     * lethal-save window so the previews and the resolved hit agree. Each "+1"
     * raises the attack; at most one "−1" counts (mightDiceAttackBonus).
     */
    mightRolls?: number[];
    /**
     * Negative Morale "-1 to your next Attack … roll": consumed at this
     * attack's die roll and folded into the attack value for every recompute
     * of the same attack (reroll window re-entries included).
     */
    moraleRollPenalty?: number;
    /**
     * Attack-window spell instants (Bloodlust, Precision, Bless's bonus,
     * Curse/Weakness…) whose attack/defense bonus scales with Power. Recorded
     * so Power played LATER in the same window — the caster keeps priority and
     * may keep empowering — recomputes their contribution against the new total
     * Power instead of being frozen at the value they had when first played.
     */
    powerScaledAttackInstants?: PowerScaledAttackInstant[];
    /**
     * Per-player Power pool for an attack window. Each side's spell instants
     * (the attacker's Bloodlust/Bless/Precision/Slayer, the defender's
     * Curse/Weakness) scale only with the Power THAT side paid — Power cards,
     * +1 discards and standing bonuses are kept per caster so one player's Power
     * never inflates the other's spell. (Spell casts on your own turn use the
     * single `spellPowerBonus`; only the shared attack window needs splitting.)
     */
    attackPowerByPlayer?: Record<PlayerId, number>;
    /**
     * Frenzy's Power→grade table and its caster, kept on the attack so the
     * pierced grade (bronze→silver→gold) is re-derived from the caster's final
     * attack-window Power at resolution — Power paid after Frenzy keeps lifting
     * it, exactly like Slayer's roll count.
     */
    ignoreDefenseGradeByPower?: Record<number, CombatUnitState["grade"]>;
    ignoreDefenseCasterId?: PlayerId;
    /** Adrienne's Fire Magic: extra Power her School-of-Fire bonus adds to a
     * fire Frenzy's pierced-grade lookup (constant offset, folded into Power). */
    ignoreDefenseSchoolPowerBonus?: number;
    /** Players who already spent their Basic X Magic +3 expert on this stack. */
    schoolFetchExpertUsedBy?: PlayerId[];
    /**
     * Ash's Bloodlust I/IV/VI: a played buff also "places a Black cube" on the
     * buffed attacker — once this attack resolves the attacker spends its
     * Retaliation for the round (`retaliatedThisRound = true`). Set from
     * ADD_COMBAT_STAT.placeBlackCube during the attack-declared window.
     */
    setRetaliatedOnAttacker?: boolean;
    /**
     * Ash's Bloodlust VI: this single attack "ignores Retaliation Attacks" — the
     * defender does not retaliate, the one-off equivalent of the attacker holding
     * the `ignores-retaliation` ability. Set from ADD_COMBAT_STAT.ignoresRetaliation.
     */
    ignoresRetaliationThisAttack?: boolean;
    /**
     * Tarnum (Fortress) Basilisks VI: "your selected unit uses its special
     * ability regardless of the required roll's result". For this single attack
     * every die-GATED after-attack ability of the attacker triggers as if its
     * required face was rolled — the Basilisk/Azure Paralysis, the Gorgon Death
     * Stare, the Wyvern/Thunderbird flat-damage sting, the Rust Dragon Acid
     * token and the Minotaur draw. Set from ADD_COMBAT_STAT.forceAbilityRolls.
     */
    forceAbilityRollsThisAttack?: boolean;
    /**
     * Factory Bounty Hunters (Neutral guard) "Preemptive Shot": set on an
     * incoming attack once its pre-emptive Retaliation Attack has been spun off,
     * so resolveAttackStackItem opens it exactly once (before the attacker's blow
     * lands) and then resumes the paused attack.
     */
    preemptiveRetaliationTriggered?: boolean;
    /**
     * The retaliation stack item this flag rides is a Bounty Hunter's pre-emptive
     * Retaliation Attack: it resolves BEFORE the original attack (which is parked
     * on the stack beneath it) and, once done, resumes that parked attack instead
     * of concluding the retaliating unit's turn.
     */
    isPreemptiveRetaliation?: boolean;
    playedCardIds: CardId[];
    /** Cards still resolving on this stack item, separated by their owner. */
    playedCardIdsByPlayer?: Partial<Record<PlayerId, CardId[]>>;
  };
};

/**
 * One Power-scaling attack/defense buff played into an attack window, kept so
 * its applied bonus can be recomputed when more Power lands afterward.
 */
export type PowerScaledAttackInstant = {
  cardId: CardId;
  /** The caster — its bonus re-derives from this player's attack Power pool. */
  playerId: PlayerId;
  stat: "attack" | "defense";
  /** The card's power→amount table (e.g. Bloodlust { 0:1, 1:2, 2:3 }). */
  amountByPower: Record<number, number>;
  /** Fallback amount when no breakpoint matches the current Power. */
  baseAmount: number;
  /** Power-independent extra (per-discarded-card bonuses) added on top. */
  fixedBonus: number;
  /**
   * Adrienne's Fire Magic: extra Power her School-of-Fire bonus adds to this
   * spell instant. A constant offset (her effect lasts the Combat), folded into
   * the Power passed to amountByPower at first play and every re-derivation.
   */
  schoolPowerBonus?: number;
  /** Hero-specialty doubling decided once at play time (1 or 2). */
  doubleFactor: number;
  /** The bonus currently folded into the stack item (after doubling). */
  appliedAmount: number;
};

export type ReactionWindow = {
  id: string;
  triggerEvent: GameEvent;
  allowedPlayerIds: PlayerId[];
  priorityPlayerId: PlayerId;
  legalReactions: Record<PlayerId, LegalAction[]>;
  passedPlayerIds: PlayerId[];
  closesWhen: "all-pass" | "one-reaction" | "choice-made";
};

export type ActiveEffectState = ActiveEffectDefinition & {
  id: string;
  source: SourceRef;
  controllerId: PlayerId;
  target?: TargetRef;
  startedRound: number;
  startedCombatRound?: number;
  expiresAtCombatRoundEnd?: number;
  expiresAtTurnEndPlayerId?: PlayerId;
  /** Game round at whose end the effect expires ("current-game-round"). */
  expiresAtGameRound?: number;
  /**
   * Unit whose activation-end expires this effect ("current-activation" binds
   * to the active unit at creation, "next-activation" to the target unit).
   */
  expiresAtActivationEndUnitId?: UnitId;
  /**
   * Polish Balance Pack Forgetfulness (Power 2): "for 2 activations". Counted
   * DOWN at each activation end of `expiresAtActivationEndUnitId`; the effect
   * only expires once it reaches 1. Absent = the classic single activation.
   */
  activationsRemaining?: number;
  usedRollEventIds: string[];
  usedChoiceIds: string[];
  usedCombatRoundNumbers: number[];
  /**
   * First Aid Tent: heals performed this combat round and whether the expert
   * (multiple heals for 1 expert use) was activated, so basic and expert heals
   * stay mutually exclusive within a round. `targetUnitId` pins the expert
   * volley to the unit its first heal mended — the card resolves "against the
   * same target 3 times", so the follow-up heals can only land on that unit.
   */
  healRound?: { round: number; count: number; expert: boolean; targetUnitId?: UnitId };
};

export type TurnState = {
  /**
   * How player turns are taken:
   *  - "ordered": one player at a time in `turnOrder` (the rulebook default).
   *  - "simultaneous": the combat-sandbox pre-battle town phase (legacy test mode).
   *  - "parallel": the OPTIONAL adventure parallel-turn mode — every live player's
   *    turn is open at once for the first `simultaneousRoundLimit` rounds. The
   *    round wraps when everyone has ended (`completedPlayerIds`). Exclusive
   *    interactions (a combat, a choice, a visit, a tile rotation…) still resolve
   *    one at a time; while one is open other players may only take actions that
   *    cannot touch it (quiet movement, ending nothing). The mode collapses to
   *    "ordered" — with a table-wide warning — when a PvP battle starts, when a
   *    serious PvP interaction resolves (stealing a flagged mine/settlement, e.g.
   *    the View Earth capture), or when the chosen period runs out.
   */
  mode: "simultaneous" | "ordered" | "parallel";
  /** Last round number played simultaneously/parallel (0 = feature off). */
  simultaneousRoundLimit: number;
  completedPlayerIds: PlayerId[];
  observingPlayerId: PlayerId | null;
  /**
   * Set once parallel turns stop (never cleared): why and in which round. While
   * `round === parallelStopped.round`, every live player already ran their
   * start-of-turn at the round start, so the ordered rotation must not run
   * `startPlayerTurn` again (it would grant a second start-of-turn draw), and it
   * skips players whose parallel turn had already ended. Absent on ordinary
   * ordered games and on snapshots from before the parallel-turn option.
   */
  parallelStopped?: {
    reason: "pvp-battle" | "pvp-interaction" | "period-ended";
    round: number;
  } | null;
};

/**
 * Which player a connected client controls in a hosted room: a real seat id
 * (a member of `turnOrder` / a lobby seat) or "observer" (watches with hidden
 * information filtered, takes no actions).
 */
export type RoomSeat = PlayerId | "observer";

/**
 * One connected participant of a room, keyed by a stable per-browser
 * `clientId` (stored client-side in localStorage). A member's `seat` is the
 * player they control, or "observer". `isHost` mirrors `RoomMembershipState.
 * hostClientId` for convenience in views.
 */
export type RoomMember = {
  clientId: string;
  name: string;
  seat: RoomSeat;
  isHost: boolean;
  /**
   * The VERIFIED account id this member is bound to, stamped by the server from
   * the session it authenticated — never read from the (forgeable) action body.
   * Present only for signed-in members; a guest member leaves it undefined.
   *
   * When present it is the authoritative identity: the seat-ownership guard
   * (`roomActionGuard`) matches a member by `userId` first, so forging another
   * client's `actorClientId` cannot steal a verified seat (Phase 2 —
   * "verified-identity seats"). One account holds at most one member/seat in a
   * hosted room; a second tab of the same account rebinds to this member.
   */
  userId?: string;
};

/**
 * Room membership/seating, carried inside the synced GameState so it flows
 * through `applyAction` (engine-validated) and both transport backends
 * identically.
 *
 * Two modes:
 *  - **open table** (`hosted: false`, or `state.room` absent on legacy
 *    snapshots): no seat enforcement at all — any client may view/act as any
 *    seat. This is the original "easy to test" behaviour (the local seat
 *    switcher in the UI).
 *  - **hosted** (`hosted: true`): seats are host-controlled. Only the host
 *    (`hostClientId`) may assign/kick/transfer, players cannot move their own
 *    seat, and a game action is only accepted from the client whose seat
 *    matches the action's `playerId` (enforced in `applyAction` when the
 *    transport passes `actorClientId`).
 */
export type RoomMembershipState = {
  hosted: boolean;
  hostClientId: string | null;
  members: RoomMember[];
  visibility?: "public" | "private";
  ownerClientId?: string;
  ownerUserId?: string;
  /**
   * Human-readable room name shown in the lobby and the room panel, so players
   * can tell rooms apart instead of reading the opaque room id. Optional: a room
   * that was never named falls back to a default label derived from its id.
   * Set via the `SET_ROOM_NAME` action (open table: any member; hosted: host
   * only), and seeded by the explicit "create room" flow.
   */
  name?: string;
  /**
   * A HASH of the room's join password (`hashRoomPassword` in room.ts) when the
   * room is password-protected; absent for a public room. A new joiner must
   * supply the matching password in `JOIN_ROOM` to become a member, and — for a
   * locked room — only members (who supplied it) may take game actions, even on
   * an open table (see `roomActionGuard`). Set/cleared via `SET_ROOM_PASSWORD`.
   *
   * Honesty note: this is a CASUAL join-gate, in the spirit of a Warcraft III /
   * Battle.net game password — NOT cryptographic secrecy. Like every other
   * hidden field in this guest-play model the full room state (this hash
   * included) is broadcast to connected clients, so a determined party who
   * inspects the transport could brute-force a weak password. `getPlayerView`
   * redacts the hash so no UI surface renders it, and the authoritative
   * `JOIN_ROOM` check runs server-side against the unredacted state — but the
   * gate's real job is keeping uninvited people out of the lobby's Join flow.
   */
  passwordHash?: string;
  /**
   * Ephemeral live chat for this table — a bounded ring buffer (last
   * MAX_CHAT_MESSAGES lines; older lines roll off). Public room content, so it
   * flows through `getPlayerView` to every seat/observer. Carried across a game
   * reset with the rest of the membership record, so a rematch keeps the banter.
   * Absent until the first message. See `src/engine/chat.ts`.
   */
  chat?: ChatMessage[];
  /** Monotonic chat sequence counter (source of each `ChatMessage.seq`). */
  chatSeq?: number;
  /**
   * Hosted-room opt-in (Phase 2): when true, only clients that present a
   * VERIFIED account session may join — a guest (no `userId`) is refused. Set by
   * the host via `SET_ROOM_REQUIRE_AUTH`; meaningful only while `hosted` is true
   * (an open table ignores it). Absent/false on every legacy room and every
   * guest table, so the default behaviour is unchanged.
   */
  requireAuth?: boolean;
  /**
   * Match type chosen when the room is created (the lobby's "Ranked vs Normal"
   * picker) and shown in the room directory so everyone can see a table's type
   * before joining. Only a RANKED game reports its result to the Elo ladder;
   * a NORMAL ("casual") game (`ranked === false`) never counts toward MMR
   * (`detectFinishedMatch` returns null for it). Absent on legacy snapshots and
   * rooms created before the picker — treated as ranked, matching the original
   * "every finished verified game counts" behaviour, so only an explicit Normal
   * table opts out. Set via `SET_ROOM_RANKED` while the room is still a setup
   * lobby (locked once the adventure starts, so nobody can dodge a loss by
   * flipping to Normal mid-game). Carried across a game reset with the rest of
   * the membership record.
   */
  ranked?: boolean;
  /**
   * Seat → account binding frozen the moment the adventure STARTS (stamped by
   * `buildAdventureFromLobby` from the members seated at that instant). This is
   * what makes "quitting loses points" enforceable: match reporting
   * (`detectFinishedMatch`) unions this snapshot with the live member list, so a
   * player who leaves the room, steps down to observer or gets kicked mid-game
   * still gets their loss recorded as "abandon" — deleting the membership row can
   * no longer dodge the ladder. A seat later re-assigned to a different account
   * keeps both records (the deserter's abandon and the finisher's real result).
   * Absent on games started before this field existed and on open tables (whose
   * members hold no seats): reporting then falls back to live members only,
   * exactly the old behaviour.
   */
  matchSeats?: Record<PlayerId, { userId?: string; name: string }>;
};

/**
 * A hero-specialty card physically covering a unit card (Sandro's Cloak of
 * the Undead King): its statistics replace the unit's until defeated. Stored
 * bottom-to-top — the LAST entry is the card on top whose statistics apply.
 */
export type UnitTransformState = {
  /** The specialty card placed on the unit (discarded when defeated). */
  cardId: CardId;
  name: string;
  attack: number;
  defense: number;
  health: number;
  initiative: number;
  cardImage?: string;
  /** Cloak VI: stays on top even when more upgrades land underneath. */
  alwaysOnTop?: boolean;
  /**
   * Polish Balance Pack Sandro I / Vidomina IV: "When the card is played on the
   * Stack it gives additional +1 [attack]." Folded LIVE in `applyUnitCurrentSide`
   * while the covered card still carries at least one Polish Unit-Stack layer,
   * so a spent Stack drops the rider with it. Absent on every classic printing.
   */
  stackAttackBonus?: number;
};

/** Monster Girl Quest's persistent per-card Job assignment. */
export type MgqJob =
  | "warrior"
  | "guard"
  | "mage"
  | "healer"
  | "martial_artist"
  | "hunter"
  | "thief"
  | "spiritualist"
  | "unemployed"
  | "noble"
  | "hero"
  | "gadabout"
  | "maid";

/** One of the four elemental contracts selected at the MGQ Spirit Shrine. */
export type MgqSpirit = "sylph" | "gnome" | "undine" | "salamander";

export type ArmyUnitState = {
  /** Stable instance id of this unit card in the player's unit deck. */
  id: string;
  unitDefId: string;
  /**
   * "neutral": a single-sided Neutral-deck card. "bank": the dedicated Creature
   * Bank card won from the Dragon Fly Hive or Griffin Conservatory; it uses
   * CREATURE_BANK_UNIT_SIDES and is a physically distinct card.
   */
  side: "few" | "pack" | "neutral" | "bank";
  /**
   * Specialty cards stacked on this unit card (Sandro's Cloak), bottom-up.
   * The top entry's statistics replace the printed side between and during
   * combats until that covering card is defeated.
   */
  transforms?: UnitTransformState[];
  /**
   * House rule (BINH) — Gelu IV: a permanent Attack bonus baked onto THIS
   * specific army card. The Sharpshooters Gelu recruits via his IV specialty
   * carry +1 Attack in every combat (start to end). It is re-applied each time
   * the card enters combat (see makeCombatUnitFromArmy / applyUnitCurrentSide),
   * so it never wears off. Absent on every normally-recruited card.
   */
  permanentAttackBonus?: number;
  /** WOG Ghost: permanent Health gained from Soul Harvest, capped at +2. */
  permanentHealthBonus?: number;
  /**
   * Polish Unit Stacks: paid extra Group layers carried by a Pack card between
   * combats. Bronze/Silver/Gold caps are 3/2/1. Absent on Few/Neutral cards and
   * in games where the rule is off.
   */
  stacks?: number;
  /**
   * Rulebook Stack Token (Naval Battles p.67) riding this army card between
   * combats — the ACTUAL game "Stacked" version of a Dragon Fly Hive / Griffin
   * Conservatory reward unit (source: those two banks' `stacked` GAIN_UNIT
   * reward). One player-chosen stat bonus (+1 Attack/Defense/Health or +2 Initiative)
   * is folded into the card every combat (makeCombatUnitFromArmy /
   * applyUnitCurrentSide) and mirrored onto `CombatUnitState.stackToken`, so the
   * EXISTING absorb path (markUnitRemovedIfNeeded) discards it — FOREVER — to
   * soak one lethal blow; the survivor's token syncs back at combat end.
   * DELIBERATELY separate from the Polish
   * `stacks` layers above: a different mechanism (this is NOT a Polish layer),
   * never granted by these banks even with polish-unit-stacks on, and a card may
   * carry neither, either, or both. Absent otherwise.
   */
  stackToken?: StackTokenStat;
  /**
   * Unit Experience (optional rule, WoG UES board adaptation): total experience
   * this unit card has earned from combats won alongside the hero (survivors
   * only) and Drill training. Veteran rank + bonuses derive from it per tier
   * (see src/engine/unit-experience.ts). Absent (= 0) when the rule is off —
   * with the rule off no XP is ever awarded, so the field never appears.
   * XP survives Pack→Few flips and reinforcement (a deliberate simplification
   * of WoG's upgrade experience loss).
   */
  experience?: number;
  /**
   * Monster Girl Quest Job token. Its ability package is rebuilt with the card
   * at every combat setup and after any Pack-to-Few side change.
   */
  job?: MgqJob;
  /**
   * A Neutral-side card sealed through MGQ Companion Recruitment. It follows
   * the ordinary Neutral casualty/recycle rules but is eligible for a Job.
   */
  companion?: boolean;
};

export type TownTokenState = {
  build: boolean;
  population: boolean;
  spellBook: boolean;
};

/**
 * A Spell Scroll near the hero board (Stronghold expansion field). Each scroll
 * holds up to 2 Spell cards drawn from the Basic/Expert Magic decks. Its spells
 * are NOT in the hand: the owner may cast one during combat at power 0 (it
 * cannot be boosted by any Power source) or sell one at the market for 2 gold.
 * A used or sold spell leaves the scroll; once both are gone the scroll is gone.
 */
export type SpellScrollState = {
  id: string;
  /** The Spell card ids held in the scroll (0-2). */
  spellCardIds: CardId[];
};

/**
 * A Legion artifact discount voucher (Legs/Loins/Torso/Arms/Head of Legion).
 * Playing a Legion discount side opens a prompt to pick ONE specific unit; the
 * choice banks a voucher reserved for that exact recruit/reinforce target.
 * Every distinct Legion piece aimed at that unit stacks with the others and
 * with external flat discounts. Necromancy/Hill Fort alter the printed price
 * first, then these vouchers reduce the remaining gold. A voucher is consumed
 * when its target unit is bought; unused vouchers expire only when one of the
 * owner's heroes moves a step.
 */
export type RecruitDiscountVoucher = {
  /** The Legion artifact card id that banked this voucher (one per piece between hero steps). */
  cardId: CardId;
  /** Gold knocked off the targeted unit's recruit/reinforce, floored at 0. */
  amount: number;
  /** The exact unit this voucher is reserved for. */
  target:
    | { kind: "recruit"; unitDefId: string }
    | { kind: "reinforce"; armyUnitId: string }
    /** Polish Unit Stacks: reserved for one army card's Stack purchase. */
    | { kind: "stack"; armyUnitId: string };
};

/**
 * A reinforcement opportunity banked by Necromancy or a Hill Fort. Unlike the
 * old blocking prompt, this sits on the player until redeemed or until one of
 * their heroes moves a step, leaving time to play stackable Legion pieces.
 */
export type ReinforcementDiscountBank = {
  id: string;
  source: "necromancy" | "hill-fort";
  /** Human-readable source card/object name used in action labels and logs. */
  sourceName: string;
  /** Unit tiers this source may reinforce. */
  allowedTiers: ("bronze" | "silver" | "gold" | "azure")[];
  /** Necromancy may also buy a Unit Stack when that rules module is active. */
  allowStack?: boolean;
  /** Necromancy: halve only the printed gold, using the printed rounding rule. */
  halfGoldOnly?: boolean;
  roundDown?: boolean;
  /** Hill Fort: subtract this from printed gold before Legion discounts. */
  flatGoldDiscount?: number;
};

/** The six gradeable stats of a WOG commander (see src/data/commanders.ts). */
export type CommanderStatKey = "attack" | "defense" | "health" | "damage" | "magic" | "speed";

/**
 * WOG Commander Artifact slots (Task 2). A commander wears at most one artifact
 * per slot; binding is PERMANENT (no unbind, no swap, survives death/revive).
 * Card ids and the wired per-slot effects live in src/data/wog/commander-artifacts.ts.
 */
export type CommanderArtifactSlot = "weapon" | "armor" | "trinket";

/**
 * WOG Commanders module: the player's persistent, hero-attached battlefield
 * champion. Present only when the game was created with `wog.commanders` on.
 * Level is NOT stored — the commander always matches its main hero's level.
 * (Slug typed loosely: state.ts has no data-layer imports.)
 */
export type CommanderPlayerState = {
  /** Commander identity (a CommanderSlug from src/data/commanders.ts). */
  slug: string;
  /** Grade 0..3 of each of the six stats. All start at 0 (the base line). */
  grades: Record<CommanderStatKey, number>;
  /**
   * Unspent stat points. Every hero level-up awards points (1 normally, 2 at a
   * milestone level — see commanderGradePointsForLevelUp) and each
   * COMMANDER_GRADE_UP spends one to raise a stat by a grade. Points never
   * block play — they wait on the commander card until the owner spends them.
   */
  gradePoints?: number;
  /** Killed in combat; stays dead until revived for gold (REVIVE_COMMANDER). */
  dead?: boolean;
  /**
   * Superior Combat specialty (Shaman / Sea Marshal): the stat the owner raises
   * by +1 at combat setup. Applied when the commander's combat unit is built
   * each combat. Absent = "attack". Ignored for every other commander.
   */
  stance?: "attack" | "defense";
  /** Sonya's persistent Unbreakable Bond target (one own army-card instance). */
  bondedArmyUnitId?: string;
  /**
   * WOG Commander Artifacts (Task 2, `wog.artifacts + wog.commanders`): the card
   * id bound into each slot. PERMANENT once bound — never unbound/swapped, and
   * untouched by death/revive. Optional field ⇒ legacy snapshots unaffected. The
   * per-slot wired stat/ability effects are the single-source
   * COMMANDER_ARTIFACT_SPECS registry in src/data/wog/commander-artifacts.ts,
   * consumed by makeCommanderCombatUnit / commanderCastPower /
   * finalizeCommandersAfterCombat.
   */
  artifacts?: Partial<Record<CommanderArtifactSlot, string>>;
  /** Commander Forge lifetime budgets (optional for legacy snapshots). */
  forgeMinorUsed?: boolean;
  forgeHighUsed?: boolean;
};

export type PlayerState = {
  id: PlayerId;
  name: string;
  /** Adventure mode: chosen faction and main hero definition ids. */
  factionId?: FactionId;
  heroDefId?: string;
  /** Personal draw pile. The top of the pile is the last array element. */
  deck: CardId[];
  hand: CardId[];
  discard: CardId[];
  /**
   * Spell Book (house rule, default ON — `adventure.spellBook`). A personal,
   * face-down library of Spell cards set aside next to the hero, NOT in hand and
   * NOT counted against the hand limit. The owner may stash any Spell from hand
   * here on their turn (MOVE_SPELL_TO_SPELL_BOOK) to free a hand slot without
   * drawing a replacement. A Spell in the Book may be cast or played exactly like
   * a hand Spell — it obeys the same one-Spell-per-combat-round limit — and, like
   * a hand Spell, it may be discarded for +1 Power; but only ONE Book Spell may be
   * spent for Power per turn (see combatStats.spellBookPowerUsedThisTurn). A used
   * Book Spell goes to the discard pile, and when it is later picked up from the
   * discard pile the owner may route it straight back into the Book. Held privately
   * (player-view hides the contents from opponents, exposing only spellBookCount).
   */
  spellBook: CardId[];
  /**
   * Polish Spell Book's public face-up exhausted zone. These Spells cannot be
   * cast again until refreshed (normally at the beginning of the next round).
   * Optional so legacy snapshots naturally treat it as empty.
   */
  spellBookUsed?: CardId[];
  /**
   * Polish Spell Book: Book Spells a MID-ROUND refresh source has already
   * returned to the refreshed side THIS game round — "a single spell can be
   * refreshed only once per round". One entry per physical copy refreshed
   * (multiplicity preserved), so a player genuinely holding two copies of the
   * same Spell may still refresh the second one. The ROUND-START whole-used-side
   * refresh is the round mechanism itself: it neither reads nor writes this list
   * and clears it for every player. Optional so legacy snapshots read as "nothing
   * refreshed yet" (nothing blocked). Public: a refresh moves a card off the
   * face-up `spellBookUsed` side and appends a public SPELL_RETURNED_TO_HAND
   * event, so this list names nothing opponents could not already see.
   */
  polishSpellsRefreshedThisRound?: CardId[];
  /** Cards removed from the game entirely (the "remove" keyword). */
  removed: CardId[];
  /**
   * Ability card ids this player has had "empowered" (e.g. spent an Ability
   * Empower token from the Dragon Fly Hive / Griffin Conservatory). An empowered
   * ability may be played on its Expert side without spending an Expert use (a
   * crown) — the holder may always use either the basic or the expert function
   * for free. Permanent for the rest of the game. Matched by card id, so it
   * follows the card between hand and discard.
   */
  empoweredAbilities?: CardId[];
  /**
   * Empowered Ability Token on the hero (rulebook token; max storage 1). Spend
   * anytime to permanently Empower ONE Ability card currently in hand. Banks
   * (Dragon Fly Hive / Griffin Conservatory house rule) grant these instead of
   * an immediate empower pick. A surplus gain while already holding 1 forces an
   * auto-use (empower a hand ability) then leaves the count at 1.
   */
  abilityEmpowerToken?: number;
  /**
   * Factory — Frederick's specialty ("further enhances the Automaton's
   * explosion"): the extra damage each of this player's Automatons adds to its
   * on-removal detonation, on top of the printed base. 0/undefined for everyone
   * else. Read at the removal chokepoint when an Automaton detonates.
   */
  automatonDetonationBonus?: number;
  /**
   * Deprecated single-permanent slot from older snapshots; live states use
   * `permanents`. Read through getPermanentCardIds, never directly.
   */
  permanent?: CardId | null;
  /**
   * The permanent cards in play next to the hero board (war machines,
   * Schools of Magic, Pandora's Box permanents), oldest first. Their effects
   * are always on. The limit is 1 unless an in-play Pandora's Box permanent
   * raises it (permanentLimitOverride); playing above the limit discards the
   * oldest and the owner may discard one voluntarily at any time.
   */
  permanents?: CardId[];
  /** Unit deck: the army that fights the player's combats. */
  army: ArmyUnitState[];
  /** WOG Santa Gremlin: Resource dice owed before the next conquered field visit. */
  pendingWogResourceDice?: number;
  /**
   * Scenario starting units, restored when the unit deck empties. `neutral` is
   * permitted so a designer's per-enemy custom starting army (which may field
   * Neutral-side cards) restocks with the same side it started with.
   */
  startingArmy: { unitDefId: string; side: "few" | "pack" | "neutral" }[];
  resources: {
    [key in ResourceKind]: number;
  };
  /** Per-round production gained during Resource Rounds. */
  production: {
    [key in ResourceKind]: number;
  };
  /** Town action tokens flip inactive when used, refresh each round. */
  townTokens: TownTokenState;
  /**
   * Whether this player has already recruited/reinforced (a Population action)
   * this round. The Population token is no longer consumed by a single
   * purchase: a player may recruit and reinforce as many times as they can
   * afford (BINH house rule). Movement is what closes the window — once this is
   * true, the next time one of the player's heroes moves the Population token
   * flips off for the rest of the round. Moving before any purchase leaves the
   * window open (you may still buy later, even on an opponent's turn). Reset by
   * refreshRoundTokens.
   *
   * EXCEPTION: a purchase made inside the PvP pre-battle preparation window
   * spends the Population token immediately (`populationAction`), because the
   * move-lock cannot close it there — the attacker moved BEFORE buying and the
   * defender never moved at all — so the round's Population action used to leak
   * past the battle.
   */
  populationPurchasedThisRound?: boolean;
  /** Round number the Mage Guild was built (token unusable that round). */
  mageGuildBuiltRound?: number;
  /** Round of the once-per-turn Polish Spell reroll. */
  polishSpellRollUsedRound?: number;
  /** +1 positive morale token (max 1) or a single negative token (-1). */
  morale: number;
  /**
   * Positive morale gained while already at the +1 cap: the token does not
   * stack, so each extra one must be spent immediately (draw a card, or
   * discard any number and draw that many). The UI pops up to resolve it;
   * the reroll use does not apply to these.
   */
  moraleOverflow?: number;
  /** Optional Morale Cards variant: held card ids by polarity. */
  moraleCards?: {
    positive: CardId[];
    negative: CardId[];
  };
  /**
   * Over the hand limit at the start of the turn (only reachable via card
   * effects, since the hand is no longer auto-drawn): the player must discard
   * down to the limit (REFRESH_HAND) before taking any other turn action.
   */
  needsHandRefresh?: boolean;
  /**
   * The optional start-of-turn draw is still available this turn: the player
   * MAY discard any number of cards and then draw back up to the hand limit
   * (rulebook: "may discard any number of hand cards, then draws up to hand
   * limit"). Offered on every turn, including the first; it is the single
   * either/or — "draw new" (discard nothing) or "discard and draw new", never
   * both, because the hand is never auto-drawn. Cleared once used, or once the
   * player takes their first map/exploration action of the turn.
   */
  canMulligan?: boolean;
  /**
   * Explorers (Astrologers Proclaim): after drawing up to the hand limit, this
   * player must explicitly choose any number of cards to discard (including
   * zero). Every three chosen cards queue one optional Statistic empower.
   */
  explorersDiscardPending?: boolean;
  /**
   * First-round opening-hand Mulligan (OPTIONAL, `GameSetupOptions
   * .startingHandMulligan`, default ON): after the mandatory start-of-turn
   * fill-to-limit, the player may discard 0–N cards to the deck bottom and draw
   * the same number (`OPENING_HAND_MULLIGAN`). Armed only on round 1 when the
   * option is on; non-blocking (map play stays open); cleared when resolved or
   * on the next turn start. Absent/false = no second pass (OFF, later rounds,
   * computer seats).
   */
  canOpeningMulligan?: boolean;
  /**
   * @deprecated Legacy one-at-a-time MULLIGAN_CARD budget. Always seeded 0;
   * kept so old snapshots still deserialize. The real opening mulligan is
   * {@link canOpeningMulligan} + OPENING_HAND_MULLIGAN.
   */
  firstRoundMulligansLeft?: number;
  /**
   * @deprecated Legacy sticky flag. Hand dump is now decided at END_TURN by
   * `morale <= -2` only (recover during the turn → keep hand). Kept so old
   * snapshots still deserialize; never re-armed by changeMorale.
   */
  discardHandAtTurnEnd?: boolean;
  /**
   * Pandora's Bargain: Power — set once its end-of-turn upkeep has been paid
   * (the player chose Negative Morale, keeping the card) so END_TURN does not
   * re-offer the choice. Reset at the start of each of the player's turns.
   */
  pandoraUpkeepResolvedThisTurn?: boolean;
  /**
   * Pandora's Gift: Income (the ∞ permanent) — the resource its enter-play
   * Resource die rolled. While the permanent is in play, the corresponding
   * production track is raised by one income level; leaving play removes that
   * temporary bonus. Replaying the card re-rolls and overwrites the value.
   */
  pandoraIncomeResource?: ResourceKind | null;
  /** Production-track amount currently supplied by the in-play Pandora Income card. */
  pandoraIncomeProductionBonus?: number;
  /**
   * Opening free-rotation of this player's faction Ⅰ (starting) tile. A
   * tri-state: `undefined` means the feature is off for this game (deterministic
   * test fixtures); `false` means the rotation is still owed — the start of the
   * player's first turn forces it before they may move; `true` once they have
   * locked it in. "You may always rotate Map Tiles when placing OR revealing
   * them" extended to the home tile (BINH house rule).
   */
  startTileRotated?: boolean;
  /**
   * Removed from the game (gave up, or spent the grace period with no Town or
   * Settlement). An eliminated player keeps a `players` entry so the table can
   * still show them as an observer, but they leave `turnOrder` and take no
   * turns. Rulebook p.11: "Eliminated players are immediately removed."
   */
  eliminated?: boolean;
  /**
   * True when this player's elimination came from a passed AFK kick vote.
   * The ladder reports them as "abandon" (a loss for Elo, tracked distinctly)
   * instead of a plain loss — see src/server/match-report.ts.
   */
  kickedByVote?: boolean;
  /**
   * Player Elimination clock (rulebook p.11, house rule: 2 of the player's own
   * turns instead of 3 full Rounds). Set while the player controls no Town and
   * no Settlement; counts down at the end of each of their turns and reaching 0
   * eliminates them. `null`/absent means they hold a base and are safe.
   */
  eliminationCountdown?: number | null;
  /** Nomads (army map ability): the end-of-turn adjacent step was offered this turn. */
  nomadStepDoneThisTurn?: boolean;
  /**
   * Legion artifacts (Legs/Loins/Torso/Arms/Head of Legion): per-unit discount
   * vouchers. Different Legion pieces STACK by addition with one another and with
   * every other reinforcement discount. A physical piece cannot stack with itself
   * after Scholar (or another discard-recovery effect) returns it; the used-card
   * ledger below enforces that until movement. A target's vouchers are consumed
   * when that purchase resolves; otherwise they remain until a hero moves.
   */
  recruitDiscounts?: RecruitDiscountVoucher[];
  /** Legion piece ids already used since this player's last hero step. */
  legionDiscountCardIdsUsed?: CardId[];
  /** Necromancy / Hill Fort opportunities waiting to be redeemed. */
  reinforcementDiscounts?: ReinforcementDiscountBank[];
  /**
   * Map-side twin of `combatStats.pendingDrawRiderSpellPower`: +Power banked by
   * playing a Sorcery / Scales-of-the-Greater-Basilisk-style "+Power, then draw
   * a card" rider on the MAP (outside any combat). It counts toward the Power a
   * map Spell needs (View Air / Dimension Door / Fly / Town Portal tiers), so a
   * hero can bank Power, draw, then cast the drawn Spell for less. Resolving a
   * map Spell consumes the whole bank; an unused bank is cleared only when one
   * of the owner's heroes moves a step.
   */
  mapSpellPowerBank?: number;
  /** Rogues (army map ability): the once-per-turn deck peek was used this turn. */
  rogueScoutUsedThisTurn?: boolean;
  /** Satyrs (army map ability): the once-per-turn attack-die morale roll was used this turn. */
  satyrMoraleRollUsedThisTurn?: boolean;
  limits: {
    hand: number;
    expertUses: number;
  };
  combatStats: {
    spellsCastThisRound: number;
    spellLimitBonusThisRound: number;
    expertUsesSpentThisRound: number;
    /** Helm of Heavenly Enlightenment: extra expert uses this round. */
    expertUseBonusThisRound?: number;
    /** Spells cast since the current adventure turn started (Astrologers hooks). */
    spellsCastThisTurn?: number;
    /**
     * Whether ANY spell has been cast this combat round, free casts included.
     * Drives the "first spell this round" Power bonus (Tower Magi Pack) so it is
     * granted to whichever spell is cast first — the limit-free Helm of the
     * Alabaster Unicorn cast counts here even though it does not bump
     * spellsCastThisRound. Reset with the per-round spell counter.
     */
    anySpellCastThisRound?: boolean;
    /**
     * Spell Book (house rule): true once this player has spent ONE Book Spell as
     * a +1 Power source in the CURRENT combat round. The Book Power discard is
     * capped at one per COMBAT round (NOT one per whole battle): advanceCombatRound
     * clears it each combat round, so a player who used it in round 1 may use it
     * again in round 2, 3, …; a second use inside the same round is rejected.
     * refreshRoundTokens also clears it at the start of the player's map turn for
     * the map→combat boundary. Power boosts from the HAND (and every other source)
     * are unaffected; only the Book is capped. Absent = none spent this round.
     * (Field name kept for back-compat; the budget is per-combat-round, not per-turn.)
     */
    spellBookPowerUsedThisTurn?: boolean;
    /**
     * Tarnum (Conflux) VI: the spell cards just Searched into hand that may be
     * cast OVER the one-Spell-per-combat-round limit (a free bonus cast), each
     * returning to the shared Spell deck top or its discard pile when cast.
     * Cleared at the start of each combat and each combat round.
     */
    tarnumOverlimitCards?: CardId[];
    /**
     * Polish Balance Pack — the reprinted EXPERT Eagle Eye: an enemy Spell that
     * just RESOLVED and dealt damage to one of this player's units. While it is
     * latched (and the player still holds Eagle Eye with a crown) they may copy
     * that spell once, at Power 0, at a new target, over the round limit.
     * Cleared when used and at the start of each combat / combat round.
     */
    eagleEyeCopySpellId?: CardId;
    /**
     * Sorcery played outside a spell-cast window (draw-only during own
     * activation): banked Power for the NEXT spell this player casts. Wiki:
     * "Sorcery may be played to first draw a card. A spell drawn in this way
     * may then be played immediately … and receive the spell power bonus."
     * Cleared when consumed by a cast, when the combat round ends, and at the
     * start of every combat (makeCombatShell) so an unspent bank can never leak
     * out of the fight it was banked in.
     */
    pendingDrawRiderSpellPower?: number;
    /**
     * Temple Guardian commander (Mana Magician): charges left this combat.
     * Seeded to 2 at combat start while the commander lives; each charge lets
     * one Spell cast exceed the per-round spell limit. NOT reset per round.
     */
    commanderManaCharges?: number;
    /**
     * Anime Cultivation Core Formation (realm 2, §5.6): true once this player
     * has spent their one free Attack-die reroll THIS COMBAT. Reset to false at
     * combat start (makeCombatShell) — per COMBAT, not per round — so the
     * standing reroll source is offered again in the next fight but only once
     * within any single one. Absent === not yet used.
     */
    cultivationRerollUsed?: boolean;
    /**
     * Anime Hero Grades (anime.heroGrades, §3.11): the ids of the "skill" tree
     * nodes this player has already used THIS COMBAT (Battle Focus, Iron Will,
     * War Cry are each once-per-combat). Reset to [] at combat start
     * (makeCombatShell) — per COMBAT, not per round. Absent === none used.
     */
    heroSkillsUsedThisCombat?: string[];
    /**
     * Polish Set Artifacts (`polish-set-artifacts`): the once-per-COMBAT set-tier
     * charges this player has already spent, keyed `"<setId>:<threshold>"`. Reset
     * to [] at combat start (makeCombatShell). Absent === none spent. Also holds
     * the auto-applied Pendant of Reflection drain charge, so the first enemy
     * Spell each combat is drained and later ones are not.
     */
    artifactSetUsesThisCombat?: string[];
    /**
     * Polish Set Artifacts: the unit each set's "select 1 unit" tier picked THIS
     * COMBAT, keyed by set id. Reset to {} at combat start. A set whose printed
     * text has no selection tier never appears here — its once-per-combat tiers
     * pick their target at use time instead.
     */
    artifactSetSelections?: Record<string, string>;
    /**
     * Anime Equipment (§3.13): true once this player's Iron-Blood Sword has
     * spent its "first declared attack +1 Attack" charge THIS COMBAT. Cleared
     * at combat start (makeCombatShell) — per COMBAT, not per round. Absent ===
     * not yet spent (so the first qualifying attack still gets +1).
     */
    equipmentFirstAttackUsed?: boolean;
    /**
     * Neon Microphone: first Spell this combat already spent its +1 Power charge.
     */
    equipmentFirstSpellPowerUsed?: boolean;
    /**
     * Stage Costume: first post-attack Defense-token grant this combat already fired.
     */
    equipmentStageCostumeUsed?: boolean;
    /**
     * Anime Equipment (§3.13): true once this player's Black Tortoise Mail has
     * spent its "first incoming declared attack −1 Attack" charge THIS COMBAT.
     * Cleared at combat start (makeCombatShell). Absent === not yet spent.
     */
    equipmentIncomingAttackUsed?: boolean;
    /** One adjacent ranged-penalty waiver spent this combat. */
    equipmentAdjacentRangedWaiverUsed?: boolean;
    /** Repair Toolkit prevented its first point of army damage this combat. */
    equipmentFirstDamagePrevented?: boolean;
    /** Equipment ids whose once-per-combat charge has been spent. */
    equipmentUsesThisCombat?: string[];
    /** Unit picked by a combat-start equipment item, keyed by equipment id. */
    equipmentSelections?: Record<string, string>;
    /** Number of equipment kill-draws made in the current combat round. */
    equipmentKillDrawsThisRound?: number;
    /** Spellward Brooch has reduced the first enemy Spell this combat. */
    equipmentEnemySpellDrainUsed?: boolean;
    /** Granberia: her first-own-attack specialty uses a charge separate from equipment. */
    mgqGranberiaFirstAttackUsed?: boolean;
    /** Salamander: first own declared attack charge spent in this combat. */
    mgqSalamanderUsed?: boolean;
    /** Undine: first incoming declared attack charge spent in this combat. */
    mgqUndineUsed?: boolean;
  };
  /**
   * Mod-agnostic counter: total Creature Bank battles this player has WON.
   * Incremented at the bank-win finalize ALWAYS (never gated on any module), so
   * it is plain additive/optional state — a default table gains it only after a
   * bank win and nothing but anime.cultivation's Core Formation gate reads it
   * today (the §3.5 quest vocabulary will read `defeat-banks ≥ N` later).
   * Absent === 0. PUBLIC (player-view never strips it).
   */
  bankWins?: number;
  /**
   * The Dungeon (§6.7.3): this player's current floor (1..10, absent === 1).
   * Advanced by one on every floor-fight WIN; the cap floor stays repeatable.
   */
  dungeonFloor?: number;
  /** The Dungeon: floor 10 cleared — the Conqueror title (relic paid once). */
  dungeonConquered?: boolean;
  /**
   * DEAD FIELD (legacy snapshots only). It used to be the Dungeon's
   * once-per-turn latch (the round this player last OPENED a floor fight).
   * The Dungeon now charges 1 MOVEMENT per floor instead, so NOTHING writes or
   * reads this any more — do not resurrect it as a gate.
   */
  dungeonDelveRound?: number;
  /** Calamity Waves: number of wave assaults this player has lost. */
  waveDefeats?: number;
  /** Calamity Gate preparation: the numbered wave this player has scouted. */
  wavePreparedFor?: number;
  /**
   * Unit Experience (optional rule): the game round this player last used the
   * DRILL_UNIT action. Used with `unitDrillsUsed` so hero
   * levels IV/VII can train two/three times in the same round.
   */
  unitDrillRound?: number;
  /** Number of Drill actions used during `unitDrillRound` (legacy stamp = 1). */
  unitDrillsUsed?: number;
  /**
   * Anime Hero Grades (anime.heroGrades, §3.11): the game round each
   * once-per-round map SKILL node was last used, keyed by node id (Forced
   * March). `=== state.round` means already used this turn. Absent === never.
   */
  heroSkillUsedRound?: Record<string, number>;
  /**
   * Polish Set Artifacts (`polish-set-artifacts`): the game round each
   * once-per-ROUND set-tier charge was last spent, keyed `"<setId>:<threshold>"`
   * (the `unitDrillRound` stamp idiom — `=== state.round` means already used,
   * absent === never). Covers Wizard's Well's draw, Diplomat's Cloak's scry and
   * the Statue of Legion recruit discount (whose whole discount shares the
   * tier-2 key).
   */
  artifactSetRoundUses?: Record<string, number>;
  /** Equipment id -> game round for once-per-game-round powers. */
  equipmentRoundUses?: Record<string, number>;
  /** Chronicle Spurs movement stored at the previous turn end. */
  bankedEquipmentMovement?: number;
  /**
   * Polish Set Artifacts: this player's PUBLIC set status as of the end of the
   * last action — one entry per set they hold at least one piece of. Re-derived
   * from the real zones by `syncArtifactSetTiers` at the `applyAction` tail (the
   * `syncAbilitySuppression` pattern), which also uses the previous value to
   * emit a feed line only when a tier count really moves.
   *
   * It lives in REAL state, not only on the player view, precisely so it
   * survives `redactStateForSeat`: a hosted client holds masked opponent
   * decks/hands and could never recompute an opponent's count itself.
   *
   * Derived bookkeeping — never a rules input. Every engine read goes to the
   * live zones through `artifactSetPieceCount`.
   */
  artifactSetStatus?: { setId: string; pieces: number; activeTiers: number; memberCount: number }[];
  /** Round the Blacksmith action was last used ("once per your turn"). */
  blacksmithUsedRound?: number;
  /** Round the Magic University deck-dig was last used ("once per round"). */
  magicUniversityUsedRound?: number;
  /**
   * Round each "once per round/turn" town building was last used (Cover of
   * Darkness, Castle Gate, …), keyed by building id.
   */
  buildingUsedRound?: Record<string, number>;
  /**
   * Ongoing cards held in play while their effect lasts. The card leaves the
   * hand when played but only reaches the discard pile (or, when Knowledge /
   * Mysticism recalled it, the hand) after every effect it created ends —
   * so a recalled Summon/Clone-style spell cannot be recast while its first
   * casting is still on the table.
   */
  ongoingCards?: { cardId: CardId; effectIds: string[]; returnTo: "discard" | "hand" | "spellBook" }[];
  /**
   * Necromancy timing window: set when this player wins a Combat other than
   * a Quick Combat, cleared by the next movement / town action / turn end —
   * the card may only be played while the window is open.
   */
  necromancyWindow?: boolean;
  /**
   * Bulwark "Rune-Empowered" flag (Gamefound Update #3): set when this player
   * picks the City Hall combat-focus option (forgoing gold income), giving them
   * this many EXTRA starting Runes in every combat until their next Resource
   * round, where it is cleared. Read at combat start by seedRunesForCombat.
   */
  runeEmpoweredNextCombats?: number;
  /**
   * PUBLIC record of Ability cards this player acquired by drawing them out of
   * the shared Ability deck (the level-up "Search (2) the Ability deck" reward).
   * A historical log (like `levelUpAbilityPicks`); it no longer gates play. A
   * Necropolis hero may play EVERY Necromancy copy it holds — printed board card
   * OR a deck-drawn one — per the printed card (wiki p.24: only a NON-Necropolis
   * hero keeps a drawn copy without being able to play it, and non-Necropolis
   * heroes are already blocked by faction, never by this record).
   */
  deckDrawnAbilityCardIds?: CardId[];
  /**
   * PUBLIC record of which Ability card this player KEPT from each level-up
   * "Search (2) the Ability deck" (hero levels 2/3/5/7), keyed by the hero
   * level that granted the Search. Shown on the hero board — the player's OWN
   * board AND, deliberately, an opponent's (a public reveal the display wants);
   * player-view never masks it. Written the moment that level-up Search resolves
   * into a kept card (via `recordLevelUpAbilityPick`); an empty/declined Search
   * records nothing. Absent on legacy snapshots → the board shows the bare
   * Search marker for that level.
   */
  levelUpAbilityPicks?: Record<number, CardId>;
  /**
   * Transient marker: the hero level whose level-up Ability Search is CURRENTLY
   * open (2/3/5/7). Set when that Search's reward is pumped, consumed the moment
   * a card is kept (recording `levelUpAbilityPicks`), and cleared on an empty
   * Search. Only one shared-deck interaction is ever open at a time (a
   * pendingChoice blocks every other action), so a kept Ability card while this
   * is set unambiguously belongs to that level-up Search — event/bank/map
   * Ability Searches never set it and therefore record nothing.
   */
  pendingLevelUpAbilitySearch?: number;
  /**
   * Spell Scrolls held near the hero board (not in hand). Each holds up to 2
   * Spell cards usable in combat at power 0 or sellable at the market.
   */
  scrolls?: SpellScrollState[];
  /** WOG Commanders module: this player's commander (absent = module off). */
  commander?: CommanderPlayerState;
  /**
   * MGQ Pocket Castle Kitchen choices bank one free Job reassignment. The next
   * successful reassignment consumes one charge; absent is zero.
   */
  mgqFreeJobReassignments?: number;
  /** Alice VI grants this many future Companion seals without paying the cost. */
  mgqFreeCompanionSeals?: number;
  /** MGQ Gold Contract: exactly three distinct faction Gold cards selected at setup. */
  mgqGoldContracts?: string[];
  /** New-game setup barrier; optional false/absent keeps legacy snapshots compatible. */
  mgqGoldContractSetupRequired?: boolean;
  /** Spirit Shrine stance selected outside combat; combat snapshots it. */
  mgqSpirit?: MgqSpirit;
};

/**
 * Combat tokens placed on unit cards ("Tokens on Units", rulebook p.89):
 *  - "attack": +1/+2 attack while held (Ogres). One per unit; on a second
 *    token the better one is kept.
 *  - "weakness": −1/−2 attack while held (Sorceresses, Weakness spell). One
 *    per unit; the better (least bad) one is kept.
 *  - "corrosion": −1 defense to a minimum of 0 (Behemoths). One per unit;
 *    stays until the end of combat.
 *  - "paralysis": the unit skips its next activation (token removed instead);
 *    removed when the unit takes damage. Retaliations still happen.
 *  - "temptation": MGQ pressure token. Two tokens skip the unit's next
 *    activation, then both clear. One token is inert and damage does not clear it.
 */
export type CombatTokenKind = "attack" | "weakness" | "corrosion" | "paralysis" | "temptation";

export type CombatTokenState = {
  id: string;
  kind: CombatTokenKind;
  /** Signed stat delta (attack +1/+2, weakness −1/−2, corrosion −1). */
  amount: number;
  /** Combat round at whose end the token expires; absent = end of combat. */
  expiresAtCombatRoundEnd?: number;
  /** Display name of whatever placed the token. */
  sourceName: string;
};

export type BattlefieldTokenKind = "force_field" | "fire_wall" | "quicksand" | "land_mine";

/**
 * A token (or card) occupying a Combat-board space, placed by a Spell:
 *  - force_field — an Obstacle: blocks non-flying movement and bars stopping
 *    on it, until `expiresAtCombatRoundEnd` (absent = the whole Combat).
 *  - fire_wall   — an Effect Obstacle: units may enter, but stopping on it (any
 *    type) or passing through it (ground/ranged only) costs `damage`, and a unit
 *    of ANY type that BEGINS its activation standing on it is burned too. A
 *    flyer is spared only when it CROSSES a wall mid-move, never when it stops.
 *    Lasts the whole Combat.
 *  - quicksand / land_mine — a face-down trap: `armed` true for a real token,
 *    false for a decoy ("empty"). `armed` is hidden from non-controllers (see
 *    getPlayerView) — only the caster ever knows which are real. The instant a
 *    unit enters a trap it is sprung and REMOVED from the board: an armed
 *    Quicksand ends the unit's movement and activation, an armed Land Mine deals
 *    `damage`, a decoy does nothing. Because a sprung trap is taken off the
 *    board, the opponent never learns which of the remaining face-down tokens
 *    are real. Two tokens of the same kind may share a space only when placed by
 *    different players.
 */
export type BattlefieldTokenState = {
  id: string;
  kind: BattlefieldTokenKind;
  position: number;
  controllerId: PlayerId;
  /** fire_wall / land_mine: damage dealt to a caught unit. */
  damage?: number;
  /** quicksand / land_mine: true = real trap, false = decoy. Hidden from non-controllers. */
  armed?: boolean;
  /** force_field: combat round at whose end it lifts; absent = lasts the whole Combat. */
  expiresAtCombatRoundEnd?: number;
};

/** A Stack Token modifies exactly one statistic of a Creature Bank unit card. */
export type StackTokenStat = "attack" | "defense" | "health" | "initiative";

export type CombatUnitState = {
  id: UnitId;
  controllerId: PlayerId;
  name: string;
  cardName: string;
  variant: "few" | "pack" | "neutral";
  /**
   * Designer `few:` / `random-few:` guard: minted as a faction Few. Distinguishes
   * a designed Few from a Pack that flipped mid-fight, so retreat survivors keep
   * the Few slot instead of being re-promoted to Pack.
   */
  factionFew?: boolean;
  grade: UnitGrade;
  type: UnitType;
  attack: number;
  defense: number;
  maxHealth: number;
  damage: number;
  initiative: number;
  position: number;
  activatedThisRound: boolean;
  /**
   * Effective initiative when this unit's current activation BEGAN. Used by
   * same-speed cross-side alternation so a mid-activation Pack→Few flip (or an
   * expired Haste) cannot drop the unit out of its initiative band and let the
   * next same-side unit cut in before the enemy (Imp Cache: Orcs then Ogres
   * with Familiars skipped). Cleared at round reset / when the unit is not the
   * one that just finished a turn.
   */
  activationInitiative?: number;
  movedThisActivation: boolean;
  /**
   * Polish Wait house rule: 1-based Wait-token number assigned when this unit
   * chose Wait this combat round. Cleared when the Waited re-activation finishes
   * or at round reset. Absent when the rule is off / the unit did not Wait.
   */
  waitToken?: number;
  /**
   * Polish Wait: true while this unit is in (or awaiting) its post-main-phase
   * Waited re-activation. Cleared when that re-activation ends.
   */
  waitPending?: boolean;
  attackedThisActivation?: boolean;
  /** Attacks resolved during this activation (double-attack abilities stop at 2). */
  attacksThisActivation?: number;
  /**
   * WOG Commanders module: set the moment a commander uses its command ability
   * during its own activation (a non-reaction cast). While set the commander may
   * no longer MOVE this activation (it may still attack) — casting ends its
   * movement (user spec). Reset every time the unit becomes active. The two
   * instant-reaction defend buffs never set this (they are played off-turn).
   */
  movementLockedThisActivation?: boolean;
  /**
   * Position this unit stood on when its current activation began. Harpies'
   * "Strike and Return" repositioning flies the unit back here after its
   * attack; reset every time the unit activates.
   */
  activationStartPosition?: number;
  /**
   * Set once a unit's "[activation]" choice ability has resolved this
   * activation (Enchanters' heal-or-buff, Faerie Dragons' damage-spell), so it
   * never fires twice and the unit can act normally afterwards.
   */
  activationAbilityDone?: boolean;
  /** Pit Lords: set once this unit has summoned/reinforced Demons this combat. */
  summonedThisCombat?: boolean;
  /** Archangels: set once this unit has spent its once-per-combat lethal save. */
  usedLethalSaveThisCombat?: boolean;
  /** Masato: set once Bodyguard redirects an adjacent ally's attack. */
  usedBodyguardInterceptThisCombat?: boolean;
  /** Phoenixes: set once this unit has spent its once-per-combat Rebirth self-save. */
  usedRebirthThisCombat?: boolean;
  /** MGQ Mage Job: the pre-movement Magic Arrow has been spent this combat. */
  usedMgqMageMagicArrowThisCombat?: boolean;
  /**
   * Factory Automaton: set the moment this unit's on-removal detonation has
   * fired, so the explosion resolves exactly once even though the removal
   * chokepoint can be re-entered for the same unit.
   */
  detonatedThisCombat?: boolean;
  /**
   * Factory Couatls' activated invulnerability: while set, this unit "ignores
   * all damage and spell effects" — every incoming-damage chokepoint skips it
   * and it is treated as immune to every Spell. Turned on at the unit's own
   * activation ("[activation] Once per Combat. Until its next activation …")
   * and cleared the next time the unit activates (applyActivationStartAbilities).
   */
  invulnerableUntilActivation?: boolean;
  /**
   * Factory Couatls: set once this unit has spent its once-per-combat
   * invulnerability activation, so it can never turn it on a second time.
   */
  usedInvulnerabilityThisCombat?: boolean;
  /**
   * Factory Bounty Hunters' Mark: set on an enemy unit at the start of Combat.
   * A Bounty Hunter attacking a Marked unit gains its printed Attack bonus (Few
   * +1, Pack +2). Modeled as a per-unit flag (the board-game Mark token); the
   * target is auto-selected at combat start (see applyCombatStartUnitAbilities).
   */
  marked?: boolean;
  /**
   * Cove Haspids (Few): set the moment this unit's Pack side is defeated and it
   * flips down to its Few side during a combat. The Few side's "Vengeance"
   * ability grants +2 Attack only while this is set, so a Few recruited fresh
   * (never a Pack) gets no bonus. Reset implicitly per combat (units are rebuilt).
   */
  flippedDownThisCombat?: boolean;
  /**
   * Cove Seamen (Pack): set once this unit has banked its once-per-combat
   * "gain 2 gold when it removes a unit from Combat" reward, so it never pays
   * out twice in the same fight.
   */
  gainedKillGoldThisCombat?: boolean;
  /** WOG Werewolf: its once-per-combat weak-copy summon has fired. */
  weakCopySummonedThisCombat?: boolean;
  retaliatedThisRound: boolean;
  defenseToken: boolean;
  /**
   * Rule: a unit may not Defend on two consecutive activations. Set true when
   * the unit takes the Defend action; cleared when it finishes any other
   * activation (attack, move, hold, skip, ability). While true, Defend is
   * illegal on its next activation. Survives combat-round resets the same way
   * Defense tokens do (discarded only when the unit acts without Defending).
   */
  defendedLastActivation?: boolean;
  /**
   * Set once the pre-activation reaction pause has been resolved for this
   * unit's current activation, so the pump does not re-open it after the
   * reacting player casts/plays during the pause. Reset every time the unit
   * becomes active (setActiveUnit).
   */
  reactionPauseAcked?: boolean;
  /**
   * Set once the pre-activation interrupt window has been offered for this unit's
   * current activation — the window Sorrow (skip) and Bowstring of the Unicorn's
   * Mane (activate one of your ranged units) share — so the centralized hook does
   * not re-open it every action. Reset every time the unit becomes active.
   */
  preActivationWindowOffered?: boolean;
  /** Combat tokens currently on the card (attack/weakness/corrosion/paralysis). */
  tokens?: CombatTokenState[];
  /**
   * Fortress Wyverns' poison: faction cubes riding this unit. At the beginning
   * of each of its activations one cube is removed to inflict 1 damage, until
   * none remain. Repeated Wyvern hits stack more cubes here.
   */
  poisonCubes?: number;
  /**
   * Factory faction cubes riding this unit (the "faction cube" subsystem). Two
   * units spend them: an Automaton (Few) may place up to 2 at activation and
   * detonates for that many on removal; a Sandworm (Pack) gains one each time it
   * defeats an enemy and may remove one to attack again. Combat-scoped — reset
   * when the unit is (re)built for a fight.
   */
  factionCubes?: number;
  abilities: string[];
  /**
   * Disrupting Ray: derived flag recomputed after every action from the unit's
   * UNIT_ABILITY_SUPPRESSED active effects (syncAbilitySuppression). While set,
   * getUnitAbilityDefinitions returns [] so the unit cannot use ANY special
   * ability — current or future — until the suppression ends.
   */
  abilitiesSuppressed?: boolean;
  /**
   * Specialty cards covering the unit card (Sandro's Cloak), bottom-up; the
   * top entry's statistics are the unit's current statistics. Printed
   * abilities stay inactive while a transform is on top.
   */
  transforms?: UnitTransformState[];
  /** Adventure mode: unit definition this combat card represents. */
  unitDefId?: string;
  /** Adventure mode: army card instance this unit maps back to. */
  armyUnitId?: string;
  /**
   * House rule (BINH) — Gelu IV: a permanent Attack bonus mirrored from the army
   * card (`ArmyUnitState.permanentAttackBonus`). It is folded into the unit's
   * Attack every time the printed side is (re)computed (applyUnitCurrentSide),
   * so a Gelu-recruited Sharpshooters keeps its +1 Attack all combat, even after
   * a flip. Not doubled and not removable — it is part of the card's stats.
   */
  permanentAttackBonus?: number;
  /** WOG Ghost: persistent Soul Harvest Health mirrored from its army card. */
  permanentHealthBonus?: number;
  /**
   * Combat-only max Health from ADD_UNIT_MAX_HEALTH (Valeska Marksmen, Vial of
   * Lifeblood, Ivor VI, …). Folded into maxHealth on every printed-side
   * recompute (applyUnitCurrentSide) so Pack→Few flips and Polish Unit Stack
   * layer losses KEEP the bonus on every health bar (stack / pack / few). Not
   * mirrored to the army card — combat-scoped only. Absent (= 0) until a
   * +HP-this-combat effect lands.
   */
  combatMaxHealthBonus?: number;
  /**
   * Polish Unit Stacks mirrored from the backing Pack army card. Each remaining
   * layer absorbs one full Pack health bar; deliberately separate from the
   * Creature Bank defender's `stackToken`.
   */
  armyStacks?: number;
  /**
   * Unit Experience (optional rule): total XP mirrored from the backing army
   * card (`ArmyUnitState.experience`). The derived veteran-rank stat bonuses
   * and elite ability are folded into the unit's printed side every time it is
   * (re)computed — creation AND mid-combat flips (applyUnitCurrentSide) — like
   * `permanentAttackBonus`. Absent when the rule is off or the card has no XP.
   */
  unitExperience?: number;
  /** MGQ Job mirrored from the backing army card for side recomputes/rank 3. */
  job?: MgqJob;
  /** Derived veteran rank (1-3) for badges/inspect; absent at rank 0. */
  unitRank?: number;
  /**
   * Fixed creature-bank guard (Dragon Utopia's dragons, the Cyclops
   * Stockpile's 2 golden Cyclopes): minted for this fight only, so it must
   * not be returned to a Neutral tier deck when the combat finishes.
   */
  bankGuard?: boolean;
  /**
   * Creature Bank unit (Naval Battles optional rule). It fights from its own
   * dedicated unit card (distinct stats, NO tier) and follows the Stack Token
   * rules. Minted defenders also carry `bankGuard`; won reward cards instead
   * carry an `armyUnitId` and remain in the player's army.
   */
  bankUnit?: boolean;
  /**
   * Raid Boss / Dungeon floor boss (§6.5.2): a bespoke-stat layered monster.
   * Always minted WITH `bankUnit` (that carries the gradeless targeting /
   * tier-gate exemption and keeps applyUnitCurrentSide off its minted stats);
   * this flag additionally (a) makes the army-stack layer shed unconditional
   * (its `armyStacks` ARE the printed health bars, rule toggles or not),
   * (b) marks it for layer-break payouts and wound persistence, and
   * (c) excludes it from tier-gated stares (Devour).
   */
  bossUnit?: boolean;
  /**
   * The Stack Token currently sitting on this Creature Bank unit, if any.
   * A Stacked unit's printed statistics already include the token's bonus; when
   * it would take lethal damage the token is discarded (reverting the bonus) and
   * the leftover damage carries to the new, lower Health (rulebook p.67).
   */
  stackToken?: StackTokenStat | null;
  /**
   * Conjured onto the battlefield by a spell (Summon Elemental). Summoned
   * units carry no printed grade, so the neutral AI's same-tier targeting rule
   * never applies to them — guards attack every real, graded enemy first and
   * only turn on a summoned unit when nothing else is left.
   */
  summoned?: boolean;
  /**
   * Clone Spell: when set, this unit is a 1-Health Clone Token copying the unit
   * with this id. A Clone copies everything printed on the original's card but
   * none of the ongoing effects/tokens on it, and is destroyed by any damage, by
   * being attacked (even for 0 damage), or when its original is removed from the
   * Combat Board. Clones never flip (Pack→Few), never Rebirth, leave no army
   * bookkeeping, and never count as one of your units leaving for Pit Lords.
   */
  cloneOfUnitId?: UnitId;
  /**
   * Tarnum (Rampart) Sharpshooters VI: a Neutral-deck unit borrowed "for this
   * Combat (discard it afterwards)". It carries no army card (no armyUnitId), so
   * it is never written back to the army; instead, when the Combat ends its
   * `unitDefId` is returned to its tier's Neutral discard pile (finalizeAdventure-
   * Combat). Whether it survived or died, the borrowed card is discarded.
   */
  temporary?: boolean;
  /** Spirit Companion: the combat round after which this temporary familiar vanishes. */
  heroGradeExpiresAfterRound?: number;
  /**
   * WOG Commanders module: this unit IS the controller's commander (the value
   * is its CommanderSlug). A commander has no army card, is tierless on both
   * targeting axes (like a bank guard: tier-gated spells skip it, the neutral
   * AI hits it last) and its death persists on PlayerState.commander.dead.
   */
  commanderSlug?: string;
  /**
   * Snapshot of the owner's commander grades (0..3 per stat) taken when the
   * unit was built at combat setup — grade-ups never resolve mid-combat, so
   * it stays true for the whole fight. Consumed by the UI (the inspect/zoom
   * panels render the dynamic commander card face from it).
   */
  commanderGrades?: Record<CommanderStatKey, number>;
  /**
   * Combat round in which the commander last used its command ability — the
   * cast is once per combat round ("may cast"), free during its own activation.
   */
  commanderCastRound?: number;
  /** A real hero body on the battlefield. Tierless and rebuilt at full Health each combat. */
  heroUnit?: boolean;
  heroDefId?: string;
  heroLevel?: number;
  heroGrade?: number;
  heroPassiveName?: string;
  assets?: {
    cardImage?: string;
    imageAlt?: string;
    wikiUrl?: string;
  };
};

export type CombatDice = {
  /** The faces of the physical attack die, e.g. [-1, -1, 0, 0, 1, 1]. */
  faces: number[];
  /** Seed used to derive each roll deterministically (server-authoritative). */
  seed: string;
  /** Number of single dice rolled so far; advances the deterministic sequence. */
  rollCount: number;
  /**
   * Optional forced roll results consumed in order before falling back to the
   * seeded die. Used by tests and scripted tutorials; undefined in normal play.
   */
  scriptedRolls?: number[];
};

export type CombatContext =
  | {
      kind: "sandbox";
    }
  | {
      kind: "neutral";
      heroId: HeroId;
      fieldId: MapSpaceId;
      difficulty: number;
      /** Highest tier present in the drawn neutral army (azure has no time limit). */
      hasAzure: boolean;
      /**
       * Creature Bank combat (Naval Battles optional rule): the bank being
       * fought. When set, this is NOT a Field-Difficulty fight — there is no
       * Quick Combat, no Round limit, no MP to extend and no experience, and the
       * win reward is the bank's (scaled by `bankStackCount`). A CreatureBankId
       * (typed loosely here because state.ts has no data-layer imports).
       */
      bankId?: string;
      /**
       * Use the Creature Bank battlefield layout (guards in shuffled corners,
       * attacker in the central six). Also set for Dragon Utopia objective
       * fields, which use their scenario guard draw rather than `bankId` cards.
       */
      bankFormation?: boolean;
      /** Number of Stacked defenders placed on the bank (the reward's X). */
      bankStackCount?: number;
      /**
       * Designer outpost fight (Garrison / Keymaster's Tent / one-way monolith
       * entrance): the printed "unlimited, as in Banks" reading — the combat
       * rolls straight into the next Round with NO continue-or-retreat window
       * and no MP to extend. Set with `difficulty: 0` (no Quick Combat, no
       * experience), independent of the Creature-Bank house rule.
       */
      unlimitedRounds?: boolean;
      /**
       * Calamity Wave assault (§6.6): this neutral fight is a scheduled wave
       * hitting the fighter at round start. Set with `difficulty: 0` (no level
       * XP — the wave pays its own printed reward) and `unlimitedRounds` (the
       * assault is fought to the end; loss OR an emptied army = pillage). The
       * post-win field visit is SKIPPED (the fighter merely stands there).
       */
      waveAssault?: { wave: number };
      /**
       * Raid Boss attempt (§6.5): the Rift Lair instance being fought. Set
       * with `difficulty: 0` (no XP — the bank precedent; the boss pays per
       * layer broken and on the kill). Wounds persist: the boss's remaining
       * layers are written back to `adventure.raidBosses[raidBossId]` at
       * combat end, whatever the outcome.
       */
      raidBossId?: string;
      /**
       * Dungeon floor fight (§6.7.3): the per-player floor being delved. Runs
       * at REAL difficulty min(floor+1, 7) — the Dungeon is the grind site, so
       * hero and unit XP apply — but never Quick Combat, and the post-win
       * field visit is replaced by the floor ladder reward.
       */
      dungeonFloor?: number;
      /**
       * Teleport ARRIVAL guard fight (2026-07-24 user rule): the hero teleported
       * onto a guarded destination (Monolith / Teleport Gate / Whirlpool /
       * obelisk-as-monolith network exit) and must fight the guard instead of the
       * old auto-sweep. Set with `difficulty: 0` + `unlimitedRounds` (bank-style —
       * no Quick Combat, no XP). On the WIN the guard is cleared but the teleport
       * travel is NOT re-opened (arrival never re-triggers — no ping-pong); on a
       * retreat the hero bounces back to the origin teleporter (lastVisitedField).
       */
      teleportArrival?: boolean;
    }
  | {
      kind: "player";
      attackerHeroId: HeroId;
      /** Null when the town owner garrisons without their hero (8 gold defense). */
      defenderHeroId: HeroId | null;
      fieldId: MapSpaceId;
      /** Defending a faction town with a Citadel: walls, gate and arrow tower. */
      siege?: boolean;
      /**
       * Heroless (garrison) defense in which the DEFENDER may still play cards
       * from hand: the `mine-army-defense` house rule's Mine defense only — the
       * owner is close enough to send orders even though their hero is elsewhere.
       * Absent on every other heroless defense (town / settlement / captured
       * Utopia / Grail site / designer Garrison stay units-only). Stamped in
       * `startPlayerCombat` and read at ONE seam, `isHandLockedInCombat`;
       * HERO-scoped effects (commander, equipment, hero grades, Tactics,
       * Retreat/Surrender) still need a hero in the fight and stay off.
       */
      garrisonCardsAllowed?: boolean;
    };

export type CombatBoardArtId =
  | "classic"
  | "frozen"
  | "hell-necro"
  | "jungle-fortress"
  | "creature-bank-dungeon"
  | "pve-calamity-classic"
  | "pve-calamity-doom"
  | "castle-siege"
  | "ship-battle";

/**
 * Siege fortifications on the combat board (town with a Citadel): 3 Walls and
 * 1 Gate fill the middle row, the Arrow Tower fights from beside the board.
 */
export type SiegeState = {
  /** Town owner the fortifications belong to (the combat's defender). */
  townPlayerId: PlayerId;
  /** Middle-row positions still holding a Wall card. */
  walls: number[];
  /** Middle-row position of the Gate while it stands. */
  gatePosition: number | null;
  /** Arrow Tower combat unit id while it stands. */
  arrowTowerUnitId: UnitId | null;
};

export type CombatSetupState = {
  /** Player ids still to place units, in placement order. */
  pendingPlayerIds: PlayerId[];
  /** Army unit instance ids already placed this setup, per player. */
  placedUnitIds: Record<PlayerId, string[]>;
  /** Maximum units a side may field. */
  unitLimit: number;
};

/**
 * Follow-up bookkeeping for one resolved attack: printed attack abilities
 * (splash, second heads, Death Cloud) resolve between the attack and the
 * retaliation, so the retaliation is parked here until they finish.
 */
export type AttackSequenceState = {
  attackerId: UnitId;
  /** The original declared target (retaliation comes from this unit). */
  defenderId: UnitId;
  attackKind: "melee" | "ranged";
  /** Whether the original target still owes its retaliation attack. */
  retaliationPending: boolean;
  /**
   * Magic Mirror bounced an instant debuff (Curse/Weakness) onto a unit during
   * this attack: carried here so the same one-shot stat delta also applies to
   * the retaliation, then vanishes (it is never an ongoing effect or token).
   */
  redirectedInstants?: { unitId: UnitId; stat: "attack" | "defense"; amount: number }[];
  /**
   * BINH Cerberi: remaining printed follow-up attacks (one full attack per
   * adjacent enemy), resolved one at a time before the retaliation.
   */
  queuedAbilityAttacks?: {
    abilityId: string;
    abilityName: string;
    baseAttack: number;
    targetUnitId: UnitId;
  }[];
  /**
   * Wolf Raiders: same target follow-up after the original target's
   * retaliation has either resolved or been skipped.
   */
  afterRetaliationAbilityAttack?: {
    abilityId: string;
    abilityName: string;
    targetUnitId: UnitId;
    /** Optional fixed Attack value for the printed follow-up strike. */
    baseAttack?: number;
  };
};

/**
 * Forced Battle Events (Anime mod, §3.12): one combat-long environment stat
 * modifier resolved from an `environment-stat` script effect. `side` names the
 * fought side ("defender" = the Neutral guards in a neutral combat), `unitType`
 * optionally narrows to one type. Read LIVE at attack/defense resolution (like
 * `proclamationGroundAttackBonus`), so it survives Pack→Few flips and specialty
 * recomputes. See `src/engine/combat-scripts.ts`.
 */
export type CombatScriptStatModifier = {
  side: "attacker" | "defender" | "both";
  unitType?: UnitType;
  stat: "attack" | "defense";
  amount: number;
};

export type CombatState = {
  id: string;
  round: number;
  attackerPlayerId: PlayerId;
  defenderPlayerId: PlayerId;
  activeUnitId: UnitId | null;
  context: CombatContext;
  /** Per-side Spirit Shrine choices frozen at setup for this combat. */
  mgqSpirits?: Partial<Record<PlayerId, MgqSpirit>>;
  /** MGQ heroes who paid this combat's mandatory 1-card Spirit summon cost. */
  mgqSpiritCostPaidPlayerIds?: PlayerId[];
  /** Swift Host owners whose +1 Initiative was folded at combat start. */
  heroGradeInitiativeAppliedFor?: PlayerId[];
  /**
   * MGQ Companion Recruitment: exact Neutral defender unit ids that were
   * eligible, living deck-backed cards when round 1 began. Qualifying MGQ
   * main-hero combats always stamp this (including an empty array) before any
   * combat-start damage. The optional shape keeps pre-field saved combats
   * loadable; an absent value is treated as the legacy eligibility path at
   * post-combat resolution.
   */
  mgqCompanionStartDefenderUnitIds?: UnitId[];
  /** Controllers whose Sonya redirect has already fired in this combat. */
  sonyaBondRedirectUsedBy?: PlayerId[];
  /**
   * Crag Hack (Astrologers): +Attack granted to every GROUND-type unit in this
   * combat (both sides). Latched at combat creation onto the FIRST combat of
   * the drawn round only, so it rides this fight to its end even across a
   * round wrap; absent everywhere else (older snapshots included).
   */
  proclamationGroundAttackBonus?: number;
  /** Deterministic combat-board art selected when the fight starts. */
  boardArtId?: CombatBoardArtId;
  setup: CombatSetupState | null;
  /** In-flight follow-ups of the attack that just resolved. */
  attackSequence?: AttackSequenceState | null;
  /**
   * Neutral cards drawn after the player finished placement, awaiting the
   * Groovy Satyr swap or Judge Dread redraw choice before the army is revealed
   * and placed. `bankGuard` marks a minted (never deck-drawn) fixed guard.
   */
  pendingNeutralDraws?:
    | {
        unitDefId: string;
        tier: "bronze" | "silver" | "gold" | "azure";
        bankGuard?: boolean;
        /** Faction Pack / Few side guards (Random Town, designer pack/few slots). */
        factionPack?: boolean;
        factionFew?: boolean;
        /**
         * Random Town: the printed card's choosable bronze Pack slot, rewritten by
         * the defense controller's pick before the army reveals.
         */
        randomTownChoice?: boolean;
      }[]
    | null;
  /**
   * Set between combat rounds against neutrals: the attacking hero must spend
   * 1 MP to continue for another round or retreat.
   */
  awaitingContinue: boolean;
  /**
   * Combat pacing / reaction pause. The engine stops here and waits for one
   * player to resume with CONTINUE_NEUTRAL_STEP. Two kinds:
   *
   *  - "pre-activation": before a unit takes its turn, the OTHER side gets a
   *    window to react first — cast Intelligence-enabled spells (Magic Arrow,
   *    Fireball…), trigger-free instant spells, play an instant ability / use an
   *    active effect (First Aid Tent), or play an instant damage specialty
   *    (Gerwulf/Adelaide/Deemer — the `combatAnytime` options). Set in neutral
   *    fights (the human reacts before each guard acts) and in player-vs-player
   *    fights whenever the reacting side holds Intelligence (the anytime-cast
   *    freedom). `reactingPlayerId` holds priority; `intent` previews the move.
   *  - "guard-walk": after a neutral guard walks (a pure move — attacks pause
   *    on the defender's reaction window and the attack die instead) the engine
   *    stops so the table can see the move. Neutral fights only.
   *
   * The sandbox never pauses like this (its pump does not run); there, off-turn
   * instants are simply offered to the non-active player at any combat moment.
   */
  pendingNeutralStep?: {
    /** Older snapshots have no kind; treat a missing kind as "guard-walk". */
    kind?: "pre-activation" | "guard-walk";
    unitId: UnitId;
    /** Display name of the acting unit, for the pop-up. */
    name: string;
    /**
     * The player who holds priority during the pause and resumes it. Defaults
     * to the attacker on older snapshots (the only reactor a guard-walk had).
     */
    reactingPlayerId?: PlayerId;
    /** Where a guard stepped from / to ("guard-walk" only). */
    from?: number;
    to?: number;
    /** "pre-activation": a preview of what the (neutral) unit is about to do. */
    intent?: {
      kind: "attack" | "move" | "pass";
      /** "attack": the unit the guard will strike (when already decided). */
      targetUnitId?: UnitId;
      targetName?: string;
      /** "move"/"move-and-attack": where the guard will step to. */
      destination?: number;
    };
  } | null;
  /**
   * Sorrow (activation-skip) recall: a Sorrow played into the pre-activation
   * window closes that window on resolution, so — unlike an attack instant —
   * there is no still-open window to play Knowledge/Mysticism into. When the
   * caster holds a recall card and a recallable Sorrow, the window is instead
   * KEPT OPEN (for the caster only) with this record set: the skip has already
   * applied, and the caster may now take the Sorrow back (immediately — there is
   * no attack it could be re-cast into) to their hand, or to the Spell Book when
   * `fromSpellBook`. Cleared when the window closes (recall played, or passed).
   */
  pendingActivationSkipRecall?: {
    cardId: CardId;
    playerId: PlayerId;
    fromSpellBook: boolean;
    /**
     * Power-source ("pow") cards discarded to pay a silver/gold Sorrow's cost
     * (its `power-source` cost cards). Mysticism's EXPERT side — "also take back
     * all other cards played together with it" — sweeps these back to hand along
     * with the Sorrow; basic Mysticism and Knowledge leave them in the discard.
     */
    powerCardIds?: CardId[];
  } | null;
  /**
   * Cast-window reaction Spell recall: a SPELL played as a reaction INTO an
   * enemy's spell cast (Magic Mirror's redirect, Protection from X's cancel)
   * closes that cast window on resolution, so — like a Sorrow, and unlike an
   * attack instant — there is no still-open window to play Knowledge/Mysticism
   * into. When the reacting player holds a recall card and the reaction Spell
   * left a card to take back, a recall-ONLY window is held open (Protection) or
   * re-opened after the redirect target is picked (Magic Mirror) with this
   * record set. While it is set the cast window offers ONLY that player's
   * Knowledge/Mysticism. Cleared when the window closes (recall played, or
   * passed) — and a still-parked cast then resolves as usual.
   */
  pendingCastReactionRecall?: {
    cardId: CardId;
    playerId: PlayerId;
    /**
     * The SPELL_CAST_STARTED event this record belongs to. Every read matches it
     * against the open window's own trigger, so a record left behind by an
     * abandoned redirect choice (e.g. the reacting player is eliminated mid-pick)
     * can never suppress the offers of a LATER, unrelated cast window.
     */
    triggerEventId: string;
    /** Cast from a Spell Book (the old stash Book returns there; Polish refreshes the used side). */
    fromSpellBook: boolean;
    /** Polish Spell Book: the generic hand card consumed to enable this Spell. */
    castEnablerCardId?: CardId;
    /**
     * Power-source ("pow") cards discarded to pay the reaction's printed cost
     * (Magic Mirror's silver/gold grades). Mysticism's EXPERT side — "also take
     * back all other cards played together with it" — sweeps these back to hand;
     * basic Mysticism and Knowledge leave them in the discard.
     */
    powerCardIds?: CardId[];
  } | null;
  /**
   * Round-start war machine triggers still waiting to resolve, in owner
   * order (attacker first). The Catapult parks its first chosen target here
   * while the second target choice is open.
   */
  warMachineRound?: {
    /**
     * One entry per round-start war machine: its owner and the machine card.
     * `granted` entries are Torosar's temporary Ballistas (no permanent card) —
     * they fire a basic shot and skip the in-play check.
     */
    pending: { playerId: PlayerId; cardId: CardId; granted?: boolean; openingBallistics?: boolean }[];
    firstTargetUnitId?: UnitId | null;
    /**
     * Artillery expert: while a Ballista tie-break choice is open for the
     * same-target volley, how many shots the chosen target takes (cleared once
     * the volley resolves). Absent/1 for an ordinary single Ballista shot.
     */
    volleyShots?: number | null;
  } | null;
  /**
   * Polish Wait house rule: true while the combat is in the Waited re-activation
   * phase (after every unit has either acted or taken a Wait token). Cleared at
   * round end. Absent / false when the rule is off or still in the main phase.
   */
  waitPhase?: boolean;
  outcome: {
    winnerPlayerId: PlayerId;
    defeatedPlayerId: PlayerId;
    /**
     * "surrender" is the main-hero paid escape (10 gold). "surrender-secondary"
     * is the Secondary-Hero variant (house rule): the 2nd hero is sacrificed —
     * removed from the game — instead of paying gold, and the opponent gets no
     * victory credit (see finalizeAdventureCombat).
     */
    reason: "all-enemy-units-defeated" | "retreat" | "surrender" | "surrender-secondary" | "give-up";
  } | null;
  /**
   * Adventure combats stay on the battlefield after the outcome until a
   * participant acknowledges the end-of-combat notice; finalization (XP,
   * unit flips, the field visit) runs when this flips true.
   */
  endAcknowledged?: boolean;
  /** Siege fortifications while defending a Citadel town (PvP only). */
  siege?: SiegeState | null;
  /**
   * Cover of Darkness owners still to decide their start-of-combat option
   * (discard 1 random card from the enemy hand), resolved before placement.
   */
  pendingCoverOfDarkness?: PlayerId[];
  /**
   * Shackles of War: the attacker holds a "block the enemy's Surrender" instant
   * and gets a start-of-combat decision to play it (before the prep window, where
   * Surrender lives) — resolved like Cover of Darkness. Holds the single deciding
   * player while open; cleared once they choose.
   */
  pendingShackles?: PlayerId[] | null;
  /**
   * True once the start-of-combat Shackles decision has been offered this combat,
   * so it is never re-offered (the attacker who keeps the card still holds it,
   * which would otherwise re-trigger the prompt).
   */
  shacklesOffered?: boolean;
  /**
   * True once the Ring of the Wayfarer's start-of-combat paralysis decision has
   * been offered this combat (a Neutral fight), so it is never re-offered.
   */
  wayfarerParalysisOffered?: boolean;
  /**
   * Player-vs-player pre-battle preparation window, presented on the adventure
   * MAP (not the battlefield) so both sides can see their towns, resources and
   * armies and plan with a clear head. When an enemy hero attacks, BOTH the
   * attacker and the defender may spend any town actions they have not used this
   * round (build a structure, recruit/reinforce units, buy spells) before the
   * fight — recruited units join the army in time to be deployed — then each
   * presses ACCEPT_COMBAT ("Accept the battle"). Deployment begins only once
   * *both* participants have accepted. Retreat / Surrender are also available
   * here. `accepted` lists the participants who have readied up so far; a
   * participant who has not yet accepted may still take town actions, one who
   * has is locked in and waits. Opened for every player-vs-player combat;
   * cleared once both accept (or by a Retreat / Surrender that ends the combat).
   */
  prep?: { accepted: PlayerId[] } | null;
  /**
   * Tactics ability: participants still entitled to a start-of-combat unit
   * swap, attacker first then a hero-present PvP defender. Set once all units
   * are placed/revealed for each player who holds a playable Tactics card and
   * fields at least two living units. The head holds priority (phase stays
   * "combat-setup", setup is already null); SWAP_COMBAT_UNITS performs one swap
   * (spending the card) and FINISH_TACTICS declines, each popping the queue.
   * Combat round 1 begins (finalizeCombatStart) only once the queue drains.
   */
  pendingTacticsSwaps?: PlayerId[] | null;
  /**
   * PvP Neutral Control: the controlling player may SORT the revealed Neutral
   * formation before battle — "just like a defender" (user rule). Set to the
   * controller id after the guards are revealed and auto-placed on a normal
   * guard FIELD (never a Creature Bank, whose corners are fixed); the head holds
   * priority (phase "combat-setup", `setup` already null, exactly like the
   * Tactics window). `PLACE_NEUTRAL_GUARD` moves/swaps a guard on any cell of
   * the defender's two rows (field) or the four bank corners;
   * `FINISH_NEUTRAL_PLACEMENT` starts the battle (→ Tactics →
   * round 1). Absent when no controller exists or for a bank.
   */
  pendingNeutralPlacement?: PlayerId | null;
  /**
   * WOG Commanders — pre-combat SORT window. Owners (attacker/defender/sandbox
   * both) whose commander joins this combat AND holds the sort capability
   * (`commanderPreCombatSortAvailable`) may reposition it in their own
   * deployment zone before round 1. Opened AFTER the commanders are injected
   * (and after any Neutral sort / Tactics), the LAST setup window; the head
   * holds priority (phase "combat-setup", `setup` already null, like the Tactics
   * queue). `PLACE_COMMANDER` moves/swaps the commander or any allied unit
   * within its zone;
   * `FINISH_COMMANDER_PLACEMENT` pops the queue and, when empty, starts round 1.
   * Computer seats are never queued (they keep the auto-placement — no stall).
   */
  pendingCommanderPlacement?: PlayerId[] | null;
  /**
   * Owners whose Vanguard-style commander/hero formation was injected into the
   * ordinary troop deployment. These bodies are sorted in the same setup turn
   * and confirmed by the same FINISH_COMBAT_PLACEMENT action; they must never
   * receive the legacy separate commander-placement window afterwards.
   */
  integratedCommanderDeploymentPlayerIds?: PlayerId[];
  /** Disciplinary Committee Pack's mandatory combat-start choices are done. */
  disciplinaryCommitteeStartResolved?: boolean;
  /** Factory Bounty Hunters' mandatory combat-start Mark choices are done. */
  bountyHunterMarkStartResolved?: boolean;
  /**
   * Controllers who have had at least one unit removed from the board this
   * combat (Pit Lords' "Summon Demons" triggers off a friendly removal).
   */
  unitRemovedControllerIds?: PlayerId[];
  /**
   * Neutral Skeletons: set once a Skeleton guard has been destroyed this
   * combat, so the attacker's Necropolis hero gets the free bronze reinforce.
   */
  skeletonGuardDefeated?: boolean;
  /** Set once the Skeletons reinforce has been offered (mid-combat or after). */
  skeletonReinforceGranted?: boolean;
  /**
   * Single-player smoothing (house rule, computer/combat-boost.ts): the two
   * temporary Empowered Attack/Defense statistic cards injected into the
   * computer attacker's hand at NON-PvP combat start. `empoweredAdded` lists
   * the ids this fight added to player.empoweredAbilities (stripped again at
   * cleanup). The cards are removed from the game at combat end — never kept.
   */
  computerBoost?: {
    playerId: PlayerId;
    cardIds: CardId[];
    empoweredAdded: CardId[];
  } | null;
  /**
   * Bulwark "Runes" (Gamefound Update #3, local house-rule gains), per Bulwark
   * player, for THIS combat only — discarded when the combat state is torn down,
   * so it resets every battle. `count` is the accumulated Rune total, earned in
   * battle (Attack +1 / Retaliate +1 / Defend +2 house rule; opens at 0 plus
   * any City Hall flag head-start; the Sieidi/Altar raise the max Rune Level
   * rather than pre-charging Runes);
   * `appliedLevel` is the highest Rune Level whose army-wide buff has already
   * been created as a player-scoped active effect, so the add-only sync never
   * double-applies. See src/engine/runes.ts.
   */
  runes?: Record<PlayerId, { count: number; appliedLevel: number }>;
  dice: CombatDice;
  units: Record<UnitId, CombatUnitState>;
  /**
   * Battlefield spaces blocked by obstacle tokens. Ground and ranged units
   * can neither enter nor move through them; flying units may fly over but
   * not land on them. Unit cards themselves also count as combat obstacles.
   */
  obstacles?: number[];
  /**
   * Spell-placed board tokens (Force Field, Fire Wall, Quicksand, Land Mine).
   * Force Field tokens additionally count as Combat Obstacles (folded into the
   * blocked-space set); the others let units enter but bite them as they move.
   */
  battlefieldTokens?: BattlefieldTokenState[];
  /**
   * Forced Battle Events (Anime mod, §3.12): per-combat scripted-event state.
   * `statModifiers` are the combat-long environment stat deltas read live at
   * attack/defense resolution; `startApplied` / `roundsFired` make the
   * combat-start and per-round firings idempotent across finalizeCombatStart /
   * advanceCombatRound re-entry. Absent in every non-scripted (and legacy)
   * combat — the mechanism no-ops when the fought field carries no script.
   */
  combatScripts?: {
    statModifiers?: CombatScriptStatModifier[];
    startApplied?: boolean;
    roundsFired?: number[];
  };
};

export type DeckState = {
  id: DeckId;
  drawPile: CardId[];
  discardPile: CardId[];
};

export type MapState = {
  spaces: Record<MapSpaceId, { id: MapSpaceId; adjacent: MapSpaceId[] }>;
};

/**
 * Polish bank-size marker (Ⅰ–Ⅳ). The size IS the number of Stacked defenders:
 * size N means N of the bank's guards each carry a standard random-stat Stack
 * Token. The win reward is the normal Creature Bank reward scaled by X = that
 * Stacked count.
 */
export type BankSize = 1 | 2 | 3 | 4;

/** One face-up Creature Bank candidate reserved while its tile is rotated. */
export type ReservedBankOption = {
  bankId: string;
  size: BankSize;
};

export type MapTileState = {
  id: string;
  tileDefId: string;
  /**
   * The map designer fixed this tile's identity (an exact pin or a `oneOf`
   * result). Gate-entry choices must not replace designer-authored content.
   */
  tileIdentityLocked?: boolean;
  /** This random face-down underground slot may offer the gate-entry 1-of-2 draw. */
  gateTileChoiceEligible?: boolean;
  centerRow: number;
  centerCol: number;
  rotation: number;
  faceDown: boolean;
  /** Roman numerals printed on the tile back (public info), e.g. "Ⅳ–Ⅴ". */
  backLabel?: string;
  /** Tile group (public info — the printed back gives it away). */
  group?: "starting" | "far" | "near" | "center" | "sea" | "subterranean";
  /**
   * Per-tile UNDERGROUND layer override carried from
   * {@link CustomMapTilePlan.underground} onto the placed instance: a
   * far/near/center/sea tile the designer marked as being on the Underground
   * layer. Set at setup (face-down included) so {@link tileLayer} treats it as
   * "subterranean" from the instant it is placed, keeping its band content
   * unchanged. Public info (not secret — the cue is always on): a designed
   * underground tile is visibly marked, like a cavern back. Absent (every legacy
   * snapshot / printed tile) means the tile's plain group layer.
   */
  underground?: boolean;
  /**
   * Tile revealed/placed but its rotation not confirmed yet: fields are not
   * materialized until the owner locks the rotation in.
   */
  awaitingRotation?: boolean;
  /**
   * A Monolith/Whirlpool/colored-Gate Location Token the map designer attached
   * to this still-face-down tile. When the tile is discovered, the discovering
   * player places the token on a legal field. `preferredSpaceId` is the exact
   * physical board hex pinned by the map designer: it is used automatically
   * when legal after the tile is revealed/rotated, with the ordinary legal-field
   * choice as a fallback when random printed content makes that hex incompatible.
   * Public info — the physical Scenario Map Layout shows token positions up
   * front. `number` is a Whirlpool's pre-assigned die face; `pair` (gate only,
   * 1-4) is the colored pair the carved Gate joins.
   */
  pendingToken?: {
    kind: "monolith" | "whirlpool" | "gate" | "oneway_entrance" | "oneway_exit";
    number?: -1 | 0 | 1;
    pair?: 1 | 2 | 3 | 4;
    preferredSpaceId?: MapSpaceId;
    /** Designer guard placed with the token (level or exact army). */
    guard?: CustomGuardSpec;
    /** Designer first-clear reward, carried to the carved field. */
    reward?: CustomFieldReward;
    /** Designer first-clear VP, carried to the carved field. */
    vp?: number;
    /** One-way entrance/exit extras, carried to the carved field. */
    exitMode?: OnewayExitMode;
    alwaysPickable?: boolean;
  };
  /**
   * GLOBAL Field Override queue for a still-face-down / just-revealed tile.
   * Multiple designer pins + at most one pool draw may wait here; each entry is
   * placed in order (never on the same hex as another already-placed override
   * or token). Prefer this array; singular {@link pendingFieldOverride} is
   * legacy (normalized to a 1-element list).
   */
  pendingFieldOverrides?: Array<{
    kind: string;
    preferredSpaceId?: MapSpaceId;
    fromPool?: boolean;
  }>;
  /** @deprecated Prefer {@link pendingFieldOverrides}. */
  pendingFieldOverride?: {
    kind: string;
    preferredSpaceId?: MapSpaceId;
    fromPool?: boolean;
  };
  /**
   * Location-token placement queue (Monolith/Whirlpool/Gate) after reveal —
   * multi-token tiles place one after another. Singular {@link pendingToken}
   * remains for legacy single-token tiles (normalized into this list when set).
   */
  pendingTokens?: Array<{
    kind: "monolith" | "whirlpool" | "gate" | "oneway_entrance" | "oneway_exit";
    number?: -1 | 0 | 1;
    pair?: 1 | 2 | 3 | 4;
    preferredSpaceId?: MapSpaceId;
    /** Designer guard placed with the token (level or exact army). */
    guard?: CustomGuardSpec;
    /** Designer first-clear reward, carried to the carved field. */
    reward?: CustomFieldReward;
    /** Designer first-clear VP, carried to the carved field. */
    vp?: number;
    /** One-way entrance/exit extras, carried to the carved field. */
    exitMode?: OnewayExitMode;
    alwaysPickable?: boolean;
  }>;
  /**
   * Naval Battles optional rule: the Creature Bank token drawn for this tile's
   * Blocked Field the moment the tile is revealed — BEFORE its rotation is
   * chosen — so the player knows which bank they are about to carve while they
   * rotate. A CreatureBankId (typed loosely; state.ts has no data-layer imports).
   * It is consumed from the pile only when the player accepts the placement; if
   * the placement is declined or the Blocked Field is lost to a Subterranean
   * Gate, it is cleared (the pile was only peeked, never popped, so nothing is
   * lost). Public info — the token is drawn face-up.
   */
  reservedBankId?: string;
  /**
   * Designer-placed yellow borders carried onto this PLACED tile instance —
   * ABSOLUTE board directions (0–5), independent of `tileDefId` and `rotation`.
   * Each seals the outer arc of the ring field that faces that absolute
   * direction (see `isTileSlotDesignedSealed`), so it reads exactly like a
   * printed `outerImpassable` arc at every crossing / discovery / placement
   * gate. Set from {@link CustomMapTilePlan.extraBorders} the moment the tile is
   * placed and present even while the tile is face-down. Public info — a printed
   * yellow line is visible to everyone.
   */
  extraBorders?: number[];
  /**
   * Designer-placed per-EDGE yellow borders carried onto this PLACED tile
   * instance — canonical edge codes (`footprintIndex*6 + absoluteDirection`, see
   * `canonicalTileEdgeCode`), each sealing exactly ONE hex edge of the tile's
   * footprint. Unlike `extraBorders` (which seals a whole 3-edge outer arc) an
   * entry here is a single line the designer drew edge-by-edge, and may be an
   * INNER edge between two of the tile's own fields as well as an outer one. The
   * code frame is rotation-0 / board-absolute, so the seal does not move when a
   * face-down slot draws its tile or the player rotates it. Set from
   * {@link CustomMapTilePlan.borderEdges} when the tile is placed and present
   * even while face-down. Public info, like a printed yellow line.
   */
  borderEdges?: number[];
  /**
   * Center-tile Ⅶ-field designation carried onto this PLACED instance (from
   * {@link CustomMapTilePlan.viiField}) — FORCE this tile's difficulty-7 objective
   * field to the Grail dig site ("grail"), the Dragon Utopia ("dragon_utopia"),
   * the neutral Random Town ("town" → `random_town`), or a Random Settlement
   * ("settlement" → difficulty-7 Settlement), whatever center tile actually
   * landed here. Applied when the tile's fields materialize
   * (`materializeTileFields`), so a face-down center slot picks it up on reveal.
   * SECRET like `tileDefId`: player views MASK it while the tile is face-down so a
   * hidden slot's objective is not leaked before discovery (see player-view.ts).
   */
  viiField?: ViiFieldDesignation;
  /**
   * Multi-select of allowed Ⅶ designations carried from
   * {@link CustomMapTilePlan.viiFields}. Resolved to a single {@link viiField}
   * at materialize (random or player pick). Masked while face-down.
   */
  viiFields?: ViiFieldDesignation[];
  /** Player picks among {@link viiFields} on reveal (from the plan). */
  playerViiPick?: boolean;
  /**
   * Player picks Gold vs Valuables mine before this face-down tile reveals
   * (from {@link CustomMapTilePlan.playerResourcePick}).
   */
  playerResourcePick?: boolean;
  /**
   * Landmark bans from {@link CustomMapTilePlan.excludeFeatures}, carried onto
   * the face-down instance so resource-pick reassignment still refuses banned
   * landmarks (e.g. no Obelisk). Public designer intent.
   */
  excludeFeatures?: SecretTileFeature[];
  /**
   * Designer center-hex customization (guard / first-clear reward / VP) carried
   * from {@link CustomMapTilePlan.centerHex} onto the placed instance and folded
   * onto the difficulty-7 field when it materializes. SECRET like `viiField`:
   * player views MASK it while the tile is face-down.
   */
  centerHex?: CustomCenterHexPlan;
  /**
   * Per-tile settlement customization (guard / bonus VP / hold-to-win) carried
   * from {@link CustomMapTilePlan.settlement} onto the placed instance and folded
   * onto every settlement field when the tile materializes. Public once revealed
   * (like a mine's resource). Absent = map-wide settlement options only.
   */
  settlement?: CustomMapSettlementFieldPlan;
  /**
   * SPECIFIC (per-tile) object plans (obelisk / mine) carried from
   * {@link CustomMapTilePlan.objectPlans} onto the placed instance and folded
   * onto every matching field when the tile materializes — a set field
   * OVERRIDES the map-wide config, an unset one falls back to it. Public once
   * revealed (like the settlement plan).
   */
  objectPlans?: {
    obelisk?: CustomObjectFieldPlan;
    mine?: CustomObjectFieldPlan;
  };
  /** @deprecated Pre-centerHex snapshots only; folded on materialize. */
  viiFieldReward?: ViiFieldReward;
  /** @deprecated Pre-centerHex snapshots only; folded on materialize. */
  viiFieldVp?: number;
  /**
   * Polish Bank Sizes: up to two face-up candidates, including their seeded
   * Attack-die size rolls. `reservedBankId` remains option A for compatibility
   * with old rotation-preview readers and pre-feature snapshots.
   */
  reservedBankOptions?: ReservedBankOption[];
  /**
   * Pre-rotation "Leave it blocked" was chosen for this tile's Creature Bank
   * offer. After rotation the bank placement step is skipped entirely (the pile
   * was only peeked). Cleared once the reveal chain consumes it.
   */
  reservedBankDeclined?: boolean;
};

export type MapFieldState = {
  spaceId: MapSpaceId;
  tileInstanceId: string;
  /** Tile slot 0-6 this field came from. */
  slot: number;
  location: string;
  difficulty?: number;
  /** Printed Treasure-die count; omitted means one die. */
  treasureDice?: 1 | 2;
  /**
   * Creature Bank id (Naval Battles optional rule) when `location` is
   * "creature_bank". A CreatureBankId, typed loosely because state.ts has no
   * data-layer imports. The bank's defenders and reward are looked up from it.
   */
  bankId?: string;
  /** Polish Bank Sizes: I-IV; replaces scenario difficulty for this bank. */
  bankSize?: BankSize;
  resource?: ResourceKind;
  amount?: number;
  faction?: string;
  /**
   * Set to "water" on sea hexes (open ocean and sea features on water tiles).
   * Absent means a land hex. Resolved from the tile field's terrain override or
   * the tile terrain when the tile is materialized; read by `isSeaField` to gate
   * sea movement (crossing the coastline halts a hero without Water Walk).
   */
  terrain?: "water";
  /** Visitable fields get a black cube after the visit and then count as empty. */
  blackCube: boolean;
  flagOwnerId: PlayerId | null;
  /**
   * Obelisks and Star Axes keep every visitor's cube: players beyond the
   * first flagger land here ("do not remove any enemy Faction Cubes;
   * multiple players may have a Faction Cube on this Field").
   */
  extraFlagOwnerIds?: PlayerId[];
  /** Whether the first-flag immediate income was already claimed. */
  everFlagged: boolean;
  /** Resource chosen for a flagged settlement. */
  settlementResource: ResourceKind | null;
  /**
   * Obelisk house rule: the Attack-die face (-1, 0, or +1) rolled the first
   * time any Hero visits this Obelisk. It is locked in for the rest of the
   * game — every later visitor (any player) receives the same reward category
   * without rerolling: -1 = +1 positive morale, 0 = Search (2) the Artifact
   * deck, +1 = roll one Treasure die and one Resource die. `undefined` until
   * the first visit rolls it.
   */
  obeliskRoll?: -1 | 0 | 1;
  /**
   * Grail Hunt: this Grail field's guards have been defeated and the Grail is
   * waiting to be dug (1 movement point) before it can be carried home.
   */
  grailDiggable?: boolean;
  /**
   * This Ⅶ `dragon_utopia` field originated as an extra Grail site and was
   * converted after another Grail was taken. It fights and pays exactly like a
   * Utopia, including the fixed two Artifact Search (3) rewards, but remains
   * distinguishable for objective bookkeeping: it is not an original
   * Dragon-Hunt target or `defeat-dragon-utopia` VP/win target.
   */
  grailConverted?: boolean;
  /**
   * Raid Bosses (§6.5): the boss INSTANCE lairing on this field (the key into
   * `adventure.raidBosses`). Set when the field converts to a Rift Lair;
   * removed on the kill (the field is then black-cubed empty).
   */
  riftLair?: string;
  /**
   * The Dungeon (§6.7.3): latched once the one-per-map delve site is carved
   * onto this (former Blocked) Field — `location` becomes "dungeon_gate" and
   * `adventure.dungeonSite.fieldId` points here.
   */
  dungeonSite?: boolean;
  /**
   * Designer center-hex bonus resolved onto this field when its center tile
   * materialized (from {@link MapTileState.centerHex}). Granted ONCE, to the
   * player who FIRST clears / captures the objective — `centerHexClaimed`
   * latches so a re-capture never re-pays it. Public once the tile is revealed
   * (a visible objective, like a mine's resource).
   *
   * Also used as the unified stamp for object/token/settlement designer
   * rewards (same shape, same grant path). Prefer reading via the grant helper
   * which folds {@link designerReward} for newer stamps.
   */
  centerHexReward?: CustomCenterHexReward;
  centerHexVp?: number;
  centerHexClaimed?: boolean;
  /**
   * Unified designer first-clear reward stamped from a standalone object, tile
   * token or settlement plan. The grant path merges this with
   * {@link centerHexReward} (either may be set). Same once-only latch as
   * centerHexClaimed / designerRewardClaimed / viiBonusClaimed.
   */
  designerReward?: CustomFieldReward;
  designerRewardVp?: number;
  /** Shared once-only latch for any designer field reward (aliases centerHexClaimed). */
  designerRewardClaimed?: boolean;
  /**
   * Designer "first clear wins" stamp (a SPECIFIC object plan / settlement /
   * center-hex `winCondition`): the first player to successfully clear / flag
   * this field wins the game immediately (declared viaVictoryCondition, so VP
   * mode routes to scoring). Fired at the beginFieldVisit designer seam.
   */
  designerWinCondition?: boolean;
  /**
   * Per-settlement / per-Random-Town bonus Victory Points for THIS field only
   * (from a tile's {@link CustomMapTilePlan.settlement}.vp or
   * {@link CustomCenterHexPlan.controlVp}). Scored while the player controls
   * the field, ON TOP of map-wide settlement / Random Town VP and the flat 1 VP
   * every flagged mine/settlement already scores. Absent = 0.
   */
  settlementBonusVp?: number;
  /**
   * True when this Settlement was created by a designer Ⅶ Random Settlement
   * designation (`viiField: "settlement"`). Used by the hold-with-grail target
   * "random-settlement" so printed settlements are not confused with it.
   */
  randomSettlement?: boolean;
  /**
   * Hold-to-win: consecutive full rounds of continuous control needed on THIS
   * field (settlement / Random Town / Town) to end the game (from
   * {@link CustomMapTilePlan.settlement}.holdRoundsToWin or
   * {@link CustomCenterHexPlan.holdRoundsToWin}). Absent = no hold condition.
   */
  holdRoundsToWin?: number;
  /**
   * When true with {@link holdRoundsToWin}, the continuous-hold counter only
   * advances while the controller ALSO possesses the Grail (carried by their
   * hero, or built on a field they control — typically this one). From
   * {@link CustomMapSettlementFieldPlan.holdRequiresGrail} /
   * {@link CustomCenterHexPlan.holdRequiresGrail}.
   */
  holdRequiresGrail?: boolean;
  /** Owner currently counting toward {@link holdRoundsToWin} (reset on recapture). */
  holdControlOwnerId?: PlayerId;
  /**
   * Full rounds the current {@link holdControlOwnerId} has continuously held this
   * settlement (incremented at each {@link startAdventureRound}). When it reaches
   * {@link holdRoundsToWin} that player wins immediately.
   */
  holdControlRounds?: number;
  /**
   * WOG New Objects — Living Skull (`wog.living_skull`): set once a visitor
   * chooses "smash it". A one-shot destruction latch: a smashed skull is INERT
   * for EVERYONE (the visit menu is absent thereafter). Absent === intact.
   */
  wogSkullSmashed?: boolean;
  /**
   * WOG New Objects — Adventure Cave (`wog.adventure_cave`): how many times this
   * cave's guard has been beaten (0/absent → the fresh Ⅰ guard). Each win
   * increments it, re-guards one difficulty higher (Ⅰ→Ⅱ→Ⅲ) and pays a scaling
   * reward; at 3 the cave is cleared for good.
   */
  wogCaveWins?: number;
  /**
   * Anime Field Override — Thí Luyện Tháp / Trial Tower (`anime.thi_luyen_thap`):
   * how many times this tower's guard has been beaten (0/absent → the fresh Ⅰ
   * guard). The anime twin of {@link wogCaveWins} — both drive the shared
   * `handleEscalatingFightVisit`, kept as SEPARATE field props for serialization
   * compatibility (a mid-game snapshot of either object keeps its own count).
   */
  animeTrialWins?: number;
  /**
   * Anime Field Override — Guild Bounty Board (`anime.guild_bounty`): the player
   * ids that have already claimed this board's once-ever +2-gold bounty. A
   * per-player latch (mirrors {@link extraFlagOwnerIds}); the bounty arm is
   * absent for a player already in this set. Absent === nobody has claimed it.
   */
  animeBountyClaimedBy?: PlayerId[];
  /** @deprecated Pre-centerHex snapshots only; the grant path reads both. */
  viiReward?: ViiFieldReward;
  /** @deprecated Pre-centerHex snapshots only; the grant path reads both. */
  viiVp?: number;
  /** @deprecated Pre-centerHex snapshots only (same latch as centerHexClaimed). */
  viiBonusClaimed?: boolean;
  /**
   * Designer "certain army" guard on this field ({@link CustomGuardSpec.units}):
   * the exact Neutral unit cards minted for the guard fight instead of the tier
   * table draw (`drawGuardArmy` consumes it). The field still carries a normal
   * {@link difficulty} — derived from the army's tiers — which drives the fight
   * trigger and the experience reward; Quick Combat and Diplomacy never bypass
   * a certain army. Cleared with the guard when the fight is won.
   */
  customGuardUnits?: string[];
  /**
   * Stamped from {@link CustomGuardSpec.packFaction} for certain-army and
   * level-as-packs guards. Fight-time resolve locks every Pack draw to this
   * faction (`"random"` rolls once per fight). Absent = free mix. Cleared with
   * the guard.
   */
  customGuardPackFaction?: FactionId | "random";
  /**
   * Designer guard LEVEL on a bank-style object field (Garrison / Keymaster's
   * Tent / one-way monolith entrance): the neutral army is drawn at this level
   * while the FIGHT itself stays bank-style (no Quick Combat, no experience,
   * no Round limit). Plain guarded objects (teleport tokens, center hexes) do
   * NOT use this — their `difficulty` alone drives a normal guard fight.
   * Also set for map-wide level guards so bank-style objects keep the designed
   * level when combat difficulty is forced to 0.
   */
  customGuardLevel?: number;
  /**
   * How a designer LEVEL guard mints bodies: `"packs"` = real Pack units from
   * the Field Difficulty table counts; absent / `"neutral"` = classic Neutral
   * deck draws. Stamped from {@link CustomGuardSpec.levelArmy}.
   */
  customGuardLevelArmy?: "neutral" | "packs";
  /**
   * Whether this field's guard was set by the MAP DESIGNER (a {@link CustomGuardSpec}
   * — exact army OR level — a map-wide settlement/obelisk guard, or a center-hex
   * guard) rather than a printed field difficulty. Set alongside the guard by
   * {@link applyCustomGuardToField} and the settlement/center stamp sites, cleared
   * with the guard. Purely informational: it flags an "altered" neutral fight so
   * the map can show it and warn the player before they attack. Absent on printed
   * guards and legacy snapshots.
   */
  designedGuard?: boolean;
  /**
   * Break field (PC-style): Pathfinding may NOT walk through this guarded hex
   * — the hero must fight to enter / clear it. Set from the map-designer mine /
   * obelisk / center-hex break options. Absent = classic Pathfinding pass-through.
   */
  breakField?: boolean;
  /**
   * Persistent certain army: on a lost / retreated neutral fight the living
   * guards stay as `customGuardUnits` for a later re-fight (dead units do not
   * return). Absent = classic full-army re-draw on every entry.
   */
  persistentGuard?: boolean;
  /**
   * This field's neutral fight has no Round limit (bank-style rounds, no
   * continue-or-retreat window). Absent = normal Round limit + MP-to-extend.
   */
  unlimitedCombatRounds?: boolean;
  /**
   * Subterranean Gate token (Stronghold expansion). When a gate is placed, the
   * sacrificed hex's `location` becomes "subterranean_gate" and these point at
   * the tile on the OTHER layer the gate bridges:
   * - `gateToTileId`: the opposite-layer tile this half connects to. A Hero who
   *   enters this field discovers that tile for free if it is still face-down
   *   (the only way to discover across the Surface↔Subterranean divide).
   * - `gateLinkSpaceId`: the partner gate field — the matching half on the other
   *   tile — set once both halves have been materialized. Movement may cross
   *   between the two linked halves even though they sit on different layers:
   *   they are the one sanctioned Surface↔Subterranean crossing ("Treat both
   *   Fields of the Subterranean Gate Token as one Field"). Undefined while only
   *   this half exists because the other tile is still face-down.
   */
  gateToTileId?: string;
  gateLinkSpaceId?: MapSpaceId;
  /**
   * Whirlpool Location Token (Cove expansion): the Attack-die face printed on
   * this token (-1, 0 or +1). With exactly 3 Whirlpools on the map, a travel
   * rolls the Attack die and the hero surfaces at the Whirlpool whose number
   * matches (rerolling the origin's own number, per the rulebook p.83). Set
   * when `location` is "whirlpool"; Monolith tokens carry no number.
   */
  whirlpoolNumber?: -1 | 0 | 1;
  /**
   * Colored Gate pair (map-designer objects, rulebook p.83 two-way monoliths):
   * which of the four gate pairs (1 = red, 2 = blue, 3 = green, 4 = yellow) this
   * `location: "gate"` field belongs to. Entering a gate teleports to THE OTHER
   * gate of the SAME pair — never a choice, never another pair, and never joining
   * the generic Monolith/Whirlpool network. Set only when `location` is "gate".
   * ALSO reused as the COLOR of a Keymaster's Tent / Barrier / one-way
   * monolith entrance-exit (same four colors, separate mechanisms).
   */
  gatePair?: 1 | 2 | 3 | 4;
  /**
   * One-way monolith ENTRANCE (`location: "oneway_entrance"`): how the
   * traveller's same-color exit is picked — "random" (a seeded roll),
   * "certain" (free pick) or "mix" (pick an always-pickable exit BEFORE the
   * roll, else roll among the rest). Absent = "certain".
   */
  onewayExitMode?: OnewayExitMode;
  /** One-way monolith EXIT: freely choosable before the roll in "mix" mode. */
  onewayAlwaysPickable?: boolean;
  /**
   * Designer Garrison option: this hex opens adjacent yellow borders.
   * Absent on older maps means enabled; only an explicit `false` disables it.
   */
  garrisonBorderPassage?: boolean;
  /**
   * Designer yellow border lines on a STANDALONE object hex — ABSOLUTE
   * directions 0-5 sealing single edges of THIS field, the field-level twin of
   * {@link MapTileState.borderEdges} (an object hex has no backing tile to
   * carry them). Consulted by the same crossing/discovery seals; public info,
   * like a printed yellow line. Stamped from {@link CustomMapObject.borderEdges}.
   */
  borderEdges?: number[];
  /**
   * A map-designer STANDALONE object hex — a one-hex field materialized OFF every
   * tile (no backing {@link MapTileState}: `tileInstanceId` is a reserved marker
   * that is never a key of `adventure.tiles`). Set only on such fields; a normal
   * tile field never carries it. Consumers that look up the backing tile already
   * guard for its absence (isOuterEdgeSealed → not sealed, the elemental-terrain
   * and hero-tile-group reads → no bonus). Its layer is fixed at setup — see
   * {@link standaloneLayer} — since there is no tile to read it from.
   */
  standalone?: boolean;
  /**
   * The map layer a STANDALONE object hex sits on ("surface" or "subterranean"),
   * inferred at setup from the tiles its hex touches (any subterranean neighbour ⇒
   * subterranean, else surface; a hex touching BOTH layers is rejected at
   * validation). Read INSTEAD of the (absent) backing tile by the layer helpers
   * so the Surface↔Subterranean divide holds for standalone hexes exactly like
   * tile hexes. Set only when {@link standalone} is true.
   */
  standaloneLayer?: "surface" | "subterranean";
};

/**
 * A player-committed Subterranean Gate placement (pick-on-reveal). It pins the
 * pairing (one Surface tile ↔ one cavern) and the hex each half sacrifices.
 * Either hex may be absent until the tile that hosts it has been revealed and
 * rotated: the Surface `gateHex` is chosen when the Surface tile is revealed, the
 * cavern `entranceHex` ("path up") when the cavern is revealed.
 */
export type SubterraneanGatePlan = {
  surfaceTileId: string;
  undergroundTileId: string;
  gateHex?: MapSpaceId;
  entranceHex?: MapSpaceId;
  /**
   * A map DESIGNER-committed link (from a cavern's {@link CustomMapGateLink}),
   * as opposed to a player's pick-on-reveal plan. A designed plan BYPASSES the
   * one-gate-per-tile guard (so one cavern may host several designer gates), and
   * the automatic touch-pairing pass never adds another gate to a tile the
   * designer committed. Absent = a player pick-on-reveal plan (or none).
   */
  designed?: boolean;
  /**
   * Designer guards on the two halves (from {@link CustomMapGateLink.gateGuard}
   * / `entranceGuard`), stamped onto the carved gate fields: you fight to STEP
   * onto a guarded half from its own layer; crossing OUT through the linked
   * half instead SLIPS PAST it — no Combat, no experience, no visit, and the
   * guard is NOT cleared, so the next ordinary entry fights it.
   */
  gateGuard?: CustomGuardSpec;
  entranceGuard?: CustomGuardSpec;
};

/**
 * One option offered to the revealing player: carve THIS tile's Gate half at
 * `hex`, pairing it with the tile identified by `surfaceTileId`/`undergroundTileId`.
 * `role` says which half `hex` becomes — the Surface "gate" or the cavern
 * "entrance" — so resolution knows which slot of the plan to fill.
 */
export type SubterraneanGateChoiceCandidate = {
  surfaceTileId: string;
  undergroundTileId: string;
  hex: MapSpaceId;
  role: "gate" | "entrance";
};

export type PendingVisit = {
  heroId: HeroId;
  playerId: PlayerId;
  fieldId: MapSpaceId;
  /** Steps still to resolve for this visit (front of array first). */
  steps: VisitStep[];
};

export type AdventureReward =
  | {
      playerId: PlayerId;
      kind: "shared-deck-search";
      deckId: DeckId;
      count: number;
      /**
       * Map-location searches keep the actual visiting Hero/Field. Without
       * this context the deferred reward pump falls back to the Main Hero and
       * can offer the wrong split decks when a Secondary Hero is on a deeper
       * tile (Minor/Major/Relic artifacts and Basic/Expert spells).
       */
      sourceHeroId?: HeroId;
      sourceFieldId?: MapSpaceId;
      /**
       * Caps the `"artifacts"` deck FAMILY below the Relic deck for this Search
       * alone (see LocationInteraction.SEARCH_SHARED_DECK). Carried through the
       * deferred reward queue so a Creature Bank Dragon Utopia's payout stays
       * Major-capped however long it waits behind a Necromancy window.
       */
      maxArtifactTier?: "major";
      allowRemove?: boolean;
      /**
       * Polish Random Artifacts: which band table to use for the die roll.
       * `"tile"` = field finds (default); `"level"` = merchant / card effects.
       */
      polishArtifactBand?: "tile" | "level";
      /**
       * Mage Guild spell purchase: enforce the strict Expert gate (Basic-only
       * until the hero is level 4 or a IV–V tile is revealed) — the
       * Wisdom/Eagle-Eye/Basic-Magic key-card bypass does NOT open the Expert
       * deck when buying spells at the Guild. Omitted (bypass allowed) for every
       * other spell search.
       */
      strictExpertGate?: boolean;
      /** Building a Polish Guild: this Spell pick may become Cast a Spell. */
      allowCastCardInstead?: boolean;
      /**
       * Set ONLY for the hero level-up "Search (2) the Ability deck" reward
       * (levels 2/3/5/7): the hero level that granted this Search. Threaded so
       * the kept Ability card is recorded on `player.levelUpAbilityPicks[level]`
       * for the hero-board display. Absent for every other Ability Search
       * (events, banks, map), which record nothing.
       */
      abilitySearchLevel?: number;
    }
  | { playerId: PlayerId; kind: "city-hall-choice"; buildingId: BuildingId }
  | {
      /** Scholar / Rib Cage / Crown of Dragontooth: pick from the discard pile. */
      playerId: PlayerId;
      kind: "discard-pick";
      count: number;
      filter?:
      | "spell"
      | "non-artifact"
      | "specialty"
      | "power-or-knowledge-statistic"
      | "spell-or-specialty"
      | "magic-arrow"
      | "cast-enabler-or-specialty"
      | "polish-refresh-only";
      fromTop?: number;
      shuffleRestIntoDeck?: boolean;
      /** Polish Balance Pack Crown of Dragontooth: up to 2 enablers / refreshes. */
      polishRecoveryLimit?: number;
      /** One protected occurrence per id is still resolving and cannot be recovered yet. */
      excludeCardIds?: CardId[];
      /** Polish Balance Pack Adelaide IV: open a Book-refresh pick after the take. */
      polishRefreshAfter?: boolean;
    }
  | {
      /** Generic queued interaction resolved through the visit-step machinery. */
      playerId: PlayerId;
      kind: "visit-steps";
      steps: VisitStep[];
    }
  | {
      /** Optional post-combat purchase of one offered commander artifact. */
      playerId: PlayerId;
      kind: "commander-artifact-offer";
      cardIds: CardId[];
      cost: number;
      source: string;
    }
  | {
      /**
       * A post-combat field visit deferred behind the after-combat Necromancy
       * decision, so the field reward lands only AFTER Necromancy is paid for
       * (see AdventureState.pendingNecromancy).
       */
      playerId: PlayerId;
      kind: "field-visit";
      heroId: HeroId;
      fieldId: MapSpaceId;
    }
  | {
      /**
       * Learning: the Hero just crossed at least one level and the player holds a
       * Learning ability card. Pumped into a "learning-level-up" choice offering
       * to advance an extra half/full level (see pumpAdventureQueues).
       */
      playerId: PlayerId;
      kind: "learning-level-up";
    }
  | {
      /**
       * Start-of-turn phase divider. Queued by startPlayerTurn behind every
       * round-start effect ("beginning of the round" City Hall income/draws,
       * Astrologers Proclaim). When pumped it opens the player's draw/discard
       * phase and records whether a forced discard-down is needed. Once
       * REFRESH_HAND resolves, "beginning of your turn" building effects are
       * queued against the settled hand. Snapshotting here still ensures a
       * round-start draw (for example City Hall "draw 2") can force a discard.
       */
      playerId: PlayerId;
      kind: "start-turn-hand";
    }
  | {
      /**
       * Final opening-setup divider. It stays behind every rulebook/designer
       * starting bonus (including follow-up Searches), then publishes the
       * first-player roll and starts round 1.
       */
      playerId: PlayerId;
      kind: "opening-first-player-roll";
      secondPlayerMorale?: boolean;
      /** No difficulty bonus: deal the ordinary opening hands after the roll. */
      dealStartingHands?: boolean;
      /**
       * MANUAL player order ({@link GameSetupOptions.playerOrderMode}): the
       * host already fixed the turn order at setup, so this divider does
       * everything EXCEPT roll — no die, no ceremony, no
       * `openingFirstPlayerRollPending`. Absent on every random-order game and
       * on every legacy snapshot.
       */
      skipRoll?: boolean;
    }
  | {
      /**
       * Calamity Waves (§6.6): one queued assault per live seat on a wave
       * round, resolved in seat order behind the round-start barrier. When the
       * pump reaches it, the seat's wave combat opens (a normal neutral fight
       * at the main hero's position); the next seat's assault waits for it.
       */
      playerId: PlayerId;
      kind: "wave-assault";
      wave: number;
    }
  | {
      /**
       * Round-start Event / Astrologers barrier sentinel. Queued once, right
       * after the round's Event (or Astrologers proclamation) has pushed its
       * per-player resolution rewards, so it is the LAST event-related reward in
       * the queue — every event follow-up (the earned Searches, the Marketplace
       * answers) `unshift`es itself AHEAD of it. When the pump reaches it, every
       * player has finished resolving the Event: it clears
       * `AdventureState.eventResolution`, lifting the whole-table freeze so the
       * normal round-start flow (City Halls, turn-start effects, first-turn hand,
       * turns) may finally proceed. See `beginRoundStartEventBarrier`.
       */
      playerId: PlayerId;
      kind: "round-start-events-resolved";
    }
  | {
      /**
       * Dimension Door (and any future teleport-into-combat map spell): the
       * Knowledge/Mysticism recall is offered BEFORE the teleport — exactly like
       * a combat cast — so it can never be stranded behind the fight the teleport
       * opens. This reward carries the deferred spell effect, applied once the
       * recall choice ahead of it has resolved. `power` is the committed value
       * from the boost window; the rest reconstructs the Spell-Book cast flags.
       */
      playerId: PlayerId;
      kind: "map-spell-effect";
      spellCardId: CardId;
      power: number;
      fromSpellBook?: boolean;
      castEnablerCardId?: CardId;
      inFlightCardIds?: CardId[];
    };

export type VisitStep =
  | {
      type: "CHOOSE_ONE";
      prompt: string;
      options: { label: string; steps: VisitStep[] }[];
      /**
       * Set ONLY on the Monolith / Whirlpool / colored-Gate "choose where to
       * travel" destination picker (`resolveTokenTeleport` / `resolveGateTeleport`)
       * — never on any other CHOOSE_ONE. It exists because a Logistics/Nomads
       * end-of-turn move ALSO offers `TELEPORT_HERO` options, so the client
       * cannot tell a teleport picker apart from an ordinary move without this
       * flag. Given it, the board surfaces each destination as a glowing,
       * clickable EXIT hex — themed by `kind`/`pair` — instead of a bare numbered
       * option list, and the tray shows the token art per option. The CHOOSE_ONE
       * stays fully authoritative: a map click just dispatches the SAME
       * `RESOLVE_VISIT_STEP` the tray button would. It reaches only the traveller
       * (getVisiblePendingVisit masks every other seat's visit steps to []).
       */
      teleport?: { kind: "monolith" | "whirlpool" | "gate" | "oneway"; pair?: 1 | 2 | 3 | 4 };
      /**
       * Private Obelisk Grail-tile reveal shown only after the visitor selects
       * it. Carries the revealed identity itself because the visitor's PLAYER
       * VIEW masks every face-down tile to `tileDefId: "hidden"` — the step
       * rides the owner-only pendingVisit, so this leaks to nobody else.
       */
      grailTileScry?: { tileInstanceId: string; tileDefId?: string; tileRotation?: number };
    }
  | {
      /** Obelisk clue: privately show this selected face-down tile, then re-hide it. */
      type: "GRAIL_TILE_SCRY";
      tileInstanceId: string;
    }
  | { type: "PAY_TO"; prompt: string; costOptions: ResourceCost[]; steps: VisitStep[] }
  | { type: "GAIN_RESOURCES"; gold?: number; buildingMaterials?: number; valuables?: number }
  | { type: "GAIN_EXPERIENCE"; amount: number }
  | {
      /**
       * WOG New Objects (Emerald Tower): award the visitor's commander `amount`
       * stat point(s) — the same `commander.gradePoints` bump + COMMANDER_POINTS_
       * AWARDED event the hero level-up uses, so the point-picker UI just works.
       * A no-op with no commander / Commanders module off (the arm is filtered
       * out at menu-build time, so this is only a resolution backstop).
       */
      type: "GAIN_COMMANDER_POINTS";
      amount: number;
    }
  | {
      /**
       * WOG New Objects (Junk Merchant): sell the named Artifact card from the
       * visitor's hand for `gold` (tier-priced by the menu). The card leaves the
       * game (Trading-Post sell semantics: hand → removed pile). One arm per hand
       * Artifact is enumerated at menu-build time, so this leaf auto-resolves.
       */
      type: "SELL_HAND_ARTIFACT";
      cardId: CardId;
      gold: number;
    }
  | {
      /**
       * WOG New Objects (Living Skull): set the visited field's permanent
       * destruction latch (`field.wogSkullSmashed`) so the hex is INERT for
       * everyone from now on. Auto-resolves (no player input).
       */
      type: "SMASH_WOG_SKULL";
    }
  | {
      /**
       * Anime Field Override — Guild Bounty Board (`anime.guild_bounty`): record
       * that the visiting player has claimed the once-ever bounty (push into the
       * visited field's `animeBountyClaimedBy` latch). Paired after the
       * GAIN_RESOURCES that pays the bounty, mirroring SMASH_WOG_SKULL.
       * Auto-resolves (no player input).
       */
      type: "MARK_ANIME_BOUNTY_CLAIMED";
    }
  | { type: "GAIN_MOVEMENT"; amount: number }
  | {
      /**
       * Pandora's Box "One of your Heroes gains N movement": with both a Main
       * and a Secondary Hero on the map the OWNER picks which one gains it (a
       * CHOOSE_ONE is unshifted); a lone hero auto-resolves without a prompt.
       */
      type: "GAIN_MOVEMENT_ANY_HERO";
      amount: number;
    }
  | { type: "GAIN_MOVEMENT_FOR_HERO"; heroId: HeroId; amount: number }
  | { type: "GAIN_MORALE"; amount: number }
  | {
      /**
       * Raid Bosses (§6.5): open the lair fight against this boss instance.
       * Auto-resolving — processPendingVisit fires the registered
       * raid-boss encounter hook (adventure-reducer opens the combat).
       */
      type: "RAID_BOSS_FIGHT";
      bossInstanceId: string;
    }
  | {
      /**
       * The Dungeon (§6.7.3): open this player's floor fight. Auto-resolving —
       * processPendingVisit fires the registered dungeon encounter hook.
       */
      type: "DUNGEON_FLOOR_FIGHT";
      floor: number;
    }
  | {
      type: "DUNGEON_CONTINUE";
    }
  | {
      /**
       * Fire a visual-novel story scene (STORY_SCENE_TRIGGERED — the dungeon
       * whispering-wall rooms). Pure presentation, auto-resolving.
       */
      type: "PLAY_STORY_SCENE";
      sceneId: string;
    }
  | {
      type: "ROLL_RESOURCE_DICE";
      count: number;
      /** Number of rolled results to resolve (default 1). Melodia VI raises
       * both this and `count` for location rolls. */
      resolveCount?: number;
      /** This Resource roll is the second stage of a Treasure-die face. */
      origin?: "treasure";
      /**
       * Polish reduced starting bonus: reroll any "high value" Resource-die face
       * (6 gold / 4 building materials / 2 valuables) so the grant stays random
       * but capped to the low faces. Default false (normal Resource-die roll).
       */
      capHighValues?: boolean;
      /**
       * Polish Balance Pack Cards of Prophecy option B ("roll it 3 times and
       * resolve 1 chosen result"): when the artifact's reroll reaction is taken
       * under the `polish-card-balance` rule, ONE die of this roll gets THREE
       * candidate faces and the player picks which to keep — the others stay their
       * normal single random face. Default false (a plain single reroll).
       */
      prophecyThreePick?: boolean;
    }
  | { type: "RESUME_FIELD_VISIT"; heroId: HeroId; fieldId: MapSpaceId; revisit: boolean }
  | {
      type: "ROLL_TREASURE_DICE";
      count: number;
      /** Number of rolled results to resolve (default 1). */
      resolveCount?: number;
      /**
       * Polish Balance Pack Cards of Prophecy option B — see the same field on
       * ROLL_RESOURCE_DICE. ONE die of this Treasure roll gets three candidate
       * faces and the player picks which to keep.
       */
      prophecyThreePick?: boolean;
    }
  | {
      /**
       * Starting bonus (rulebook p.10): Search (2) the Artifact deck once or
       * twice. Queues the Search reward(s) then reshuffles every Artifact deck
       * + discard and reseeds one face-up discard card, as printed.
       */
      type: "STARTING_BONUS_ARTIFACT_SEARCH";
      times: 1 | 2;
    }
  | {
      /**
       * Starting bonus (Hard): reveal cards from the top of the Artifact deck
       * until a Minor Artifact is found and add it to hand. Non-matching cards
       * go to the discard pile. Not a Search — no post-search reshuffle.
       */
      type: "REVEAL_UNTIL_MINOR_ARTIFACT";
    }
  | {
      /**
       * Polish reduced starting bonus: draw `drawCount` Minor Artifacts from the
       * Minor (or combined) Artifact draw pile — never the discard top — then
       * keep `keepCount` and return the rest under the draw pile.
       */
      type: "DRAW_CHOOSE_MINOR_ARTIFACTS";
      drawCount: number;
      keepCount: number;
    }
  | {
      /**
       * Resolution arm of DRAW_CHOOSE_MINOR_ARTIFACTS — put the kept cards in
       * hand and return the rest under the named draw pile.
       */
      type: "RESOLVE_DRAW_CHOOSE_MINOR";
      deckId: DeckId;
      keepIndexes: number[];
      drawn: CardId[];
    }
  | {
      /**
       * Polish Pandora Search: keep the chosen drawn Pandora card(s) and return
       * the rest under the Pandora deck.
       */
      type: "RESOLVE_PANDORA_SEARCH";
      keepIndexes: number[];
      drawn: CardId[];
    }
  | {
      /** Clears polish-random-artifacts access after a declined Black Market. */
      type: "CLEAR_POLISH_ARTIFACT_ACCESS";
    }
  | {
      /**
       * After a starting-bonus Artifact Search: shuffle each Artifact deck with
       * its discard, then flip one card face-up to reseed the discard pile.
       */
      type: "RESHUFFLE_ARTIFACT_DECKS";
    }
  | {
      /** Marks one Luck reroll (per dice kind) as spent before re-rolling. */
      type: "CONSUME_LUCK";
      effectId: string;
      dice: "treasure" | "resource";
    }
  | {
      /**
       * Cards of Prophecy: spend the die-set effect before applying the chosen
       * face of a Resource/Treasure die (the whole effect is removed — one use).
       */
      type: "CONSUME_DIE_SET";
      effectId: string;
    }
  | {
      /** Spends the positive morale token (reroll-any-die morale action). */
      type: "CONSUME_MORALE";
    }
  | {
      /**
       * Resolves a held Morale CARD (optional Morale Cards rule) as part of a
       * map-die option — e.g. "Positive Morale: Reroll a Die" played on a
       * Resource/Treasure/map-Attack die. The card returns under its deck
       * (consumeHeldMoraleCard); a no-op if the card is no longer held.
       */
      type: "CONSUME_MORALE_CARD";
      cardId: CardId;
    }
  | {
      /** Marks the Swift Weasel once-per-turn adventure-die reroll as used. */
      type: "CONSUME_WEASEL";
    }
  | {
      /** Marks a once-per-game-round equipment die power as spent. */
      type: "CONSUME_EQUIPMENT_ROUND_USE";
      equipmentId: string;
    }
  | {
      /**
       * Plays a held reroll artifact (Diplomat's Ring / Ambassador's Sash) as an
       * instant the moment a die is rolled: discards it from hand, then the
       * adventure die is re-rolled by the step that follows.
       */
      type: "CONSUME_REROLL_ARTIFACT";
      cardId: CardId;
    }
  | {
      /**
       * Octavia's Gold I reaction: discard a specific held card from hand the
       * moment a Resource die is rolled (offered inside rollResourceDice, mirroring
       * the Diplomat's Ring reroll reaction). The die-set that follows overrides
       * the rolled face.
       */
      type: "CONSUME_HELD_CARD";
      cardId: CardId;
      optionLabel: string;
    }
  | {
      /**
       * Flip one army card from Pack back to Few. `source` picks the rules
       * text: "plague" (Terrible Plague — the default for legacy queued steps)
       * is weakened by Polish Unit Stacks (a Stacked pack sheds one layer
       * instead of flipping, see applyPlagueToPack); "pandora" (Pandora's
       * Silver Muster reverse) and "tribulation" (anime Heavenly Tribulation
       * toll, §5.6) are always the plain printed flip (a Stack layer never
       * absorbs a flip the player chose to pay).
       */
      type: "FLIP_PACK_TO_FEW";
      armyUnitId: string;
      source?: "plague" | "pandora" | "tribulation";
    }
  | {
      /**
       * Anime Heavenly Tribulation (§5.6): pay `remaining` more tolls (one per
       * "−1" die). Each toll opens a cheapest-first CHOOSE_ONE pick of one army
       * card — a Pack flips to Few, any other card is lost with the standard
       * recycle. Auto-resolves the pick when one candidate remains; an empty
       * army pays nothing further. Non-input control step (re-queues itself).
       */
      type: "TRIBULATION_TOLL";
      remaining: number;
    }
  | {
      /**
       * Anime Heavenly Tribulation (§5.6): the chosen Few/Neutral army card is
       * lost (Neutral-side recycles to its tier discard, Monolith-toll convention).
       */
      type: "TRIBULATION_LOSE_UNIT";
      unitId: string;
    }
  | {
      /**
       * Anime Heavenly Tribulation (§5.6): after all tolls, resolve the outcome —
       * a surviving army (≥1 card) BREAKS THROUGH to Nascent Soul (realm 3) and
       * draws 1 Artifact; an emptied army fails (realm unchanged, retry next turn).
       */
      type: "TRIBULATION_RESOLVE";
    }
  | {
      /**
       * Disruption (Astrologers): open the player's skippable pick of one
       * eligible tile to rotate. Recomputed from live state each time it runs,
       * so earlier seats' rotations drop out and it silently resolves when no
       * eligible tile remains.
       */
      type: "DISRUPTION_ROTATE_OFFER";
    }
  | {
      /** Disruption: the picked tile — opens the rotation choice (or backs out). */
      type: "DISRUPTION_ROTATE_TILE";
      tileInstanceId: string;
    }
  | {
      /** Disruption: rotate the tile in place to the chosen orientation. */
      type: "DISRUPTION_SET_ROTATION";
      tileInstanceId: string;
      rotation: number;
    }
  | {
      /**
       * Tournament Redwood Observatory: offer one adjacent revealed tile with
       * no Hero to re-rotate, or skip. `anchorSpaceId` is the visited field.
       */
      type: "OBSERVATORY_REROTATE_OFFER";
      anchorSpaceId: MapSpaceId;
    }
  | {
      /** Observatory re-rotate: the picked tile — opens its rotation choice. */
      type: "OBSERVATORY_REROTATE_TILE";
      tileInstanceId: string;
      anchorSpaceId: MapSpaceId;
    }
  | {
      /** Observatory re-rotate: rotate the picked tile in place. */
      type: "OBSERVATORY_REROTATE_SET";
      tileInstanceId: string;
      anchorSpaceId: MapSpaceId;
      rotation: number;
    }
  | {
      /** Isra's Friends / settlements: reinforce a Few unit, possibly at half cost. */
      type: "REINFORCE_ARMY_UNIT";
      armyUnitId: string;
      halfCost: boolean;
    }
  | {
      /** Neutral Skeletons reward: reinforce one Few unit for free (Few→Pack). */
      type: "REINFORCE_FREE";
      armyUnitId: string;
    }
  | {
      /**
       * Add a unit of `unitDefId` to the army for free. `side` defaults to "few"
       * (Garden of Life, Conflux). Optional `stacks` grants Polish Unit Stack
       * layers on a Pack. `side: "bank"` uses the dedicated Creature Bank face.
       * `stacked` (Dragon Fly Hive / Griffin Conservatory, X ≥ 2) first asks the
       * player which rulebook Stack Token stat the bank card should receive.
       */
      type: "RECRUIT_FREE";
      unitDefId: string;
      side?: "few" | "pack" | "neutral" | "bank";
      stacks?: number;
      stacked?: boolean;
      stackToken?: StackTokenStat;
    }
  | {
      /**
       * Legion artifact: the player picked which unit the just-played discount
       * side applies to. Banks one `RecruitDiscountVoucher` for that exact target
       * (no-op input; resolves automatically once the unit is chosen).
       */
      type: "BANK_RECRUIT_DISCOUNT";
      cardId: CardId;
      amount: number;
      target:
        | { kind: "recruit"; unitDefId: string }
        | { kind: "reinforce"; armyUnitId: string }
        /** Polish Unit Stacks: reserved for one army card's Stack purchase. */
        | { kind: "stack"; armyUnitId: string };
    }
  | {
      type: "SEARCH_SHARED_DECK";
      deckId: DeckId;
      count: number;
      /** See LocationInteraction.SEARCH_SHARED_DECK — caps the `"artifacts"` family below Relic. */
      maxArtifactTier?: "major";
    }
  | { type: "SETTLEMENT_CHOICE" }
  | {
      /**
       * Reward for flagging an enemy Town (rulebook p.76: "Scenarios typically
       * have special rewards for flagging them"). The conqueror raises one
       * production track by a single resource-gain level: +5 gold, +2 building
       * materials, or +1 valuables.
       */
      type: "RESOURCE_GAIN_LEVEL";
    }
  | { type: "MAGIC_SPRING" }
  | {
      /**
       * Witch Hut "look at the top Ability card": auto-resolves into a
       * CHOOSE_ONE carrying the revealed card (so the tray shows its art),
       * exactly like the Factory dig (DIG_ARTIFACT).
       */
      type: "WITCH_HUT";
    }
  | {
      /** Witch Hut: take the revealed Ability card into hand. */
      type: "WITCH_HUT_TAKE";
      cardId: CardId;
    }
  | {
      /** Witch Hut: put the revealed card on the SHARED Ability deck's discard. */
      type: "WITCH_HUT_DISCARD";
      cardId: CardId;
    }
  | { type: "SCHOLAR" }
  | {
      /**
       * Scholar (expert) phase 1: remove up to `remaining` Statistic cards
       * (hand or discard). Optional Done / empty piles end the phase early and
       * fall through to SCHOLAR_EMPOWER_TAKE.
       */
      type: "SCHOLAR_EMPOWER_PICK";
      remaining: number;
    }
  | {
      /**
       * Scholar (expert) phase 2: take ONE Empowered Statistic onto the discard
       * top, then recurse while `remaining` > 0. `takenTypes` is only the types
       * already taken this play — the next pick may be any other type ("up to 2
       * different" = no duplicate type, any combination otherwise).
       */
      type: "SCHOLAR_EMPOWER_TAKE";
      remaining: number;
      takenTypes: string[];
    }
  | {
      /** Scholar (expert): put one Empowered Statistic card on top of discard. */
      type: "SCHOLAR_EMPOWER_BANK";
      cardId: string;
    }
  | {
      /**
       * Choose one: trade resources (repeatable within the visit), sell one
       * hand card for 1 gold, or buy a war machine at the higher price.
       * `traded` locks the visit to resource trading once a trade happened.
       */
      type: "TRADING_POST";
      traded?: boolean;
      /**
       * Marketplace (Event): "Trade resources using Trading Post rules" — the
       * resource exchange only; the sell-a-card and war-machine options are
       * not part of that Event and stay hidden.
       */
      tradesOnly?: boolean;
    }
  | {
      /** War Machine Factory: buy one war machine at the lower price. */
      type: "WAR_MACHINE_SHOP";
    }
  | {
      /**
       * Astrologers (McGiver): open the self-rebuilding menu to take one War
       * Machine of the player's choice from the shared supply for free. Rebuilt
       * from the live supply each time so a second player never sees a machine an
       * earlier one already took; offers a Skip exit (the take is optional).
       */
      type: "WAR_MACHINE_GRANT_OFFER";
    }
  | {
      /**
       * Astrologers (Wandering Merchant): open a self-rebuilding menu to buy one
       * War Machine from the shared supply "as if at a Trading Post", `discountGold`
       * gold cheaper. Only machines the player can still afford at the discounted
       * price are offered; rebuilt from the live supply each time; a Skip exit makes
       * the buy optional.
       */
      type: "WAR_MACHINE_DISCOUNT_OFFER";
      discountGold: number;
    }
  | {
      /**
       * War-machine grant/buy leaf: move the chosen machine from the shared supply
       * to the player's hand (they play it as a permanent later). With no `cost` it
       * is a free grant (McGiver); with a `cost` it is a paid, discounted purchase
       * (Wandering Merchant) and the gold is spent here.
       */
      type: "GRANT_WAR_MACHINE";
      cardId: CardId;
      cost?: ResourceCost;
    }
  | {
      /**
       * Astrologers (Charlie and his Circus): draw one Neutral Unit per Dwelling
       * tier the player controls (capped at `maxDraws`), then open a paid recruit
       * menu over them. Azure is never drawn — no Dwelling unlocks it.
       */
      type: "NEUTRAL_RECRUIT_OFFER";
      maxDraws: number;
    }
  | {
      /**
       * Neutral-recruit leaf: recruit `recruit` (paying its cost) and return every
       * other card in `drawn` to its tier's discard pile. A null `recruit`
       * declines and shuffles all of `drawn` back.
       */
      type: "RECRUIT_DRAWN_NEUTRAL";
      recruit: { unitDefId: string; tier: "bronze" | "silver" | "gold" | "azure" } | null;
      drawn: { unitDefId: string; tier: "bronze" | "silver" | "gold" | "azure" }[];
    }
  | {
      /**
       * Astrologers (Unexpected Reinforcements): open a free recruit menu over the
       * Neutral Units deck cards associated with the player's faction (the neutral
       * counterpart of a roster unit) whose Dwelling tier they have built and whose
       * card is still in the deck. Azure never qualifies — no Dwelling unlocks it.
       */
      type: "FACTION_RECRUIT_OFFER";
    }
  | {
      /**
       * Faction-recruit leaf: take one copy of neutral `unitDefId` from its tier's
       * Neutral Units deck and add it to the army's single-sided Neutral side, for
       * free. Recruited as neutral, it can never be reinforced to a Pack.
       */
      type: "RECRUIT_FACTION_UNIT";
      unitDefId: CardId;
    }
  | { type: "DISCOVER_ADJACENT_TILE" }
  | {
      /**
       * Knowledge / Mysticism reaction after a Spell resolves on the map. Basic
       * (mode "basic"/absent) takes the Spell back without a crown — there is
       * no per-turn spell limit outside combat. Regular Knowledge therefore
       * never needs expert here. Expert Mysticism spends a crown and also
       * returns the other discardable cards played with the cast. Empowered
       * Knowledge recalls with its printed limit bonus.
       * The spell may already be in the discard pile, or held in play by an
       * ongoing effect; the latter is marked to return when it expires.
       * `fromSpellBook` routes a Book-cast Spell back into the Spell Book
       * (a private zone) rather than the hand.
       */
      type: "KNOWLEDGE_RECALL_MAP_SPELL";
      spellCardId: CardId;
      knowledgeCardId: CardId;
      fromSpellBook?: boolean;
      /** Polish Book: recall this generic cast card, leaving the Spell used. */
      castEnablerCardId?: CardId;
      /** Other support cards expert Mysticism may return from discard. */
      recallPlayedCardIds?: CardId[];
      /** "basic" (default) = free recall; "expert" = Mysticism + one crown. */
      mode?: CardPlayMode;
    }
  | {
      /** Sea Chest / Jetsam: roll one Attack die, resolve the matching branch. */
      type: "ATTACK_DIE_TABLE";
      plus: VisitStep[];
      zero: VisitStep[];
      minus: VisitStep[];
    }
  | {
      /**
       * Remove one hand card from the game, then resolve the follow-up
       * (Witch Hut / Trading Post / Faerie Ring / Market of Time).
       */
      type: "REMOVE_HAND_CARD";
      prompt: string;
      filter: "any" | "ability" | "statistic" | "removable";
      then: "none" | "gain-valuables" | "search-same-deck" | "choose-deck-search";
      /** Depth of the follow-up Search (Miriam's Scouting VI digs 4); defaults to 2. */
      searchCount?: number;
      /**
       * Miriam's Scouting IV/VI: when the follow-up is "search-same-deck" and the
       * removed card is a Spell/Artifact, offer a CHOICE among the higher split
       * decks too — Major artifacts and Expert spells — which the specialty's
       * scouting reach grants regardless of the usual hero-level / artifact-source
       * gate. Bronze "ability" (Scouting I) never sets this (the Ability deck has
       * no tiers).
       */
      tieredReach?: boolean;
    }
  | {
      /**
       * Spellbinder's Hat (option B): open a menu of every card in the player's
       * hand AND discard pile; the picked one is removed from the game. Builds a
       * CHOOSE_ONE whose options each carry a REMOVE_CARD_FROM_PILE leaf.
       */
      type: "REMOVE_ONE_FROM_HAND_OR_DISCARD";
      prompt: string;
    }
  | {
      /**
       * Removes the named card from a player zone (→ removed). Under Polish
       * Spell Book, `spellBook` / `spellBookUsed` are valid sources for owned
       * Spells (hand never holds them).
       */
      type: "REMOVE_CARD_FROM_PILE";
      cardId: CardId;
      source: "hand" | "discard" | "spellBook" | "spellBookUsed";
    }
  | {
      /** University: pick one of the top cards of a shared discard pile. */
      type: "SEARCH_DISCARD";
      deckId: DeckId;
      count: number;
    }
  | {
      /**
       * Pyramid (Creature Bank): rebuild a remove-then-search menu up to
       * `remaining` more times. Each pick removes one Spell/Ability/Artifact
       * card from hand or discard pile and Searches (`searchCount`) the deck
       * matching the removed card; a Done exit ends the loop early.
       */
      type: "REMOVE_THEN_SEARCH_REPEAT";
      remaining: number;
      searchCount: number;
    }
  | {
      /**
       * Legacy direct-empower menu (hand only). Prefer GAIN_ABILITY_EMPOWER_TOKEN
       * + the token spend path for bank rewards. Builds a menu of non-Empowered
       * Ability cards in hand; picking one Empowers it. No-op when none.
       */
      type: "EMPOWER_ABILITY";
    }
  | {
      /**
       * Grant one Ability Empower token (cap 1). Surplus while already holding
       * one forces an auto-use pick on a hand ability, then leaves the count at 1.
       * Without `force`, gated by the bank house rule (`bank-empower-ability`).
       * Designer field rewards set `force: true` so a map author can always grant
       * the token even when that house rule is off.
       */
      type: "GAIN_ABILITY_EMPOWER_TOKEN";
      force?: true;
    }
  | {
      /** Adds `cardId` to the player's permanent empoweredAbilities list. */
      type: "MARK_ABILITY_EMPOWERED";
      cardId: CardId;
    }
  | {
      /** Hill Fort: reinforce one Few unit, its cost reduced by 3 gold (min 0). */
      type: "HILL_FORT";
    }
  | {
      /**
       * Subterranean Gate: entering the gate discovers the tile on the other
       * layer for free if it is still face-down. Otherwise the gate is an empty
       * field (the hero simply walks across the linked gate↔entrance edge).
       */
      type: "SUBTERRANEAN_GATE";
    }
  | {
      /**
       * Monolith/Whirlpool travel: entering (or Revisiting) the token resolves
       * where the hero goes — straight to the only other token, the traveller's
       * pick when several qualify, or the Attack-die roll when exactly 3
       * numbered Whirlpools are in play. Destinations on a still-face-down tile
       * route through TOKEN_TELEPORT_REVEAL instead.
       */
      type: "TOKEN_TELEPORT";
      token: "monolith" | "whirlpool";
      /**
       * The traveller already chose "Travel" over "Stay here" (2026-07-24 rule):
       * skip the travel-vs-stay wrapper and run the roll / mix mechanics directly
       * (so a random/mix roll resolves only when travel is actually chosen).
       */
      committed?: boolean;
    }
  | {
      /**
       * One-way monolith travel: entering (or Revisiting) an ENTRANCE resolves
       * where the hero goes among the SAME-COLOR carved exits, per the
       * entrance's `onewayExitMode` — a seeded roll ("random"), the
       * traveller's pick ("certain"), or pick-an-always-exit-else-roll
       * ("mix"). Exits still riding a face-down tile are NOT offered (reveal
       * the tile first) — a deliberate limit, unlike the Monolith network.
       */
      type: "ONEWAY_TELEPORT";
      /** The traveller chose "Travel" over "Stay here" — run the exit resolution. */
      committed?: boolean;
    }
  | {
      /**
       * The "mix" roll leaf: roll among the CURRENT free same-color exits that
       * are NOT always-pickable (resolution-time, so the pick option leaks
       * nothing). Falls back to every free exit when none is flagged random.
       */
      type: "ONEWAY_RANDOM_EXIT";
      pair: 1 | 2 | 3 | 4;
      fromSpaceId: MapSpaceId;
    }
  | {
      /**
       * Colored Gate travel (map-designer objects): entering (or Revisiting) a
       * gate moves the hero to THE OTHER gate of the SAME colored pair — always
       * that exact partner, never a choice and never the Monolith network. A pair
       * with only one gate placed, or a partner a hero occupies, fizzles with a
       * note. The pair is read from the origin field's {@link MapFieldState.gatePair}.
       */
      type: "GATE_TELEPORT";
      /** The traveller chose "Travel" over "Stay here" — run the gate resolution. */
      committed?: boolean;
    }
  | {
      /**
       * Monolith/Whirlpool/colored-Gate travel into a face-down tile: flip the
       * destination tile for free and hand its rotation to the traveller. The
       * teleport completes (and a Whirlpool's unit loss lands) once the traveller
       * has also placed the destination token — tracked in
       * `AdventureState.pendingTokenTeleport`. A colored Gate carries its `pair`
       * so the placement carves the same-color partner gate (never a Monolith,
       * never a different color).
       */
      type: "TOKEN_TELEPORT_REVEAL";
      token: "monolith" | "whirlpool" | "gate";
      tileInstanceId: string;
      /** Colored-Gate travel only: the pair (1-4) the placement carves. */
      pair?: 1 | 2 | 3 | 4;
    }
  | {
      /**
       * "After each Whirlpool travel, lose 1 unit from your unit Deck": the
       * traveller picks one army card to discard (a CHOOSE_ONE opens when the
       * army holds more than one). No-op with an empty army.
       */
      type: "WHIRLPOOL_PENALTY";
    }
  | {
      /** Leaf of the WHIRLPOOL_PENALTY pick: discard this army card. */
      type: "WHIRLPOOL_DISCARD_UNIT";
      unitId: string;
    }
  | {
      /** Logistics / Town Portal: place the hero on the field directly. */
      type: "TELEPORT_HERO";
      heroId: HeroId;
      spaceId: MapSpaceId;
      /** Whether arriving resolves the field like a normal visit. */
      visit?: boolean;
      /** Town Portal Power 2/4: movement granted to the hero on arrival. */
      movementBonus?: number;
    }
  | {
      /**
       * Teleport-NETWORK arrival resolution (2026-07-24 user rule): the hero has
       * just teleported (Monolith / Teleport Gate / Whirlpool / obelisk-as-
       * monolith / one-way exit) onto `spaceId`. Runs AFTER any Whirlpool unit
       * toll and resolves the destination like a normal arrival — an enemy hero
       * there starts a PvP battle, a live designed guard is FOUGHT (bank-style, no
       * auto-sweep), and an unguarded/unoccupied exit simply leaves the hero
       * standing (arrival never re-triggers the travel). `originSpaceId` is the
       * teleporter the hero left, so a retreat from the arrival fight bounces back
       * there.
       */
      type: "RESOLVE_TELEPORT_ARRIVAL";
      heroId: HeroId;
      spaceId: MapSpaceId;
      originSpaceId: MapSpaceId;
    }
  | {
      /**
       * Place a just-gained Secondary Hero on a chosen Field. Used as the leaf of
       * the placement CHOOSE_ONE (Prison / Tavern / town hire), so the player can
       * send the new hero to the Field it was gained on, their Town, or any
       * Settlement they control. `heroDefId` carries the hired portrait.
       */
      type: "CREATE_SECONDARY_HERO";
      fieldId: MapSpaceId;
      heroDefId?: string;
    }
  | {
      /** Scholar basic / Rib Cage / Crown of Dragontooth: discard-pile pick. */
      type: "TAKE_DISCARD_CARD";
      cardId: CardId;
      shuffleRestIntoDeck?: boolean;
    }
  | {
      /** Consumes a one-shot active effect once its benefit was taken. */
      type: "CONSUME_EFFECT";
      effectId: string;
    }
  | {
      /** Pandora's Box: draw the top card of the Pandora deck into hand. */
      type: "DRAW_PANDORA_CARD";
    }
  | {
      /**
       * Pandora's Box (card 177): "First pay 3 gold / 2 building materials / 1
       * valuables up to six times in any combination. THEN for each payment made,
       * roll and resolve 1 Resource die." Payments are committed FIRST (from the
       * player's starting resources — die winnings can never bootstrap more
       * payments), then the accumulated dice roll at the end. `remaining` is how
       * many more payments may be made (starts at 6); `paid` is how many have been
       * made so far (drives the trailing dice rolls). Only affordable payments are
       * offered; a Stop exit, no affordable payment, or reaching six ends the pay
       * phase and rolls `paid` Resource dice.
       */
      type: "PANDORA_PAY_FOR_DICE";
      remaining: number;
      paid?: number;
    }
  | {
      /**
       * Pandora's Box (cards 179/180/181, option B): roll `diceCount` Treasure
       * dice as a pure gamble; if at least one shows the artifact-search (ankh)
       * face, queue a Search(`searchCount`) of the `deck` family. The dice faces
       * are NOT otherwise resolved — the roll only tests the ankh condition.
       */
      type: "PANDORA_TREASURE_GAMBLE_SEARCH";
      deck: "abilities" | "spells" | "artifacts";
      diceCount: number;
      searchCount: number;
    }
  | {
      /**
       * Pandora's Box (card 173, option B): discard one army unit. A faction
       * few/pack card simply leaves the army; a single-sided neutral card returns
       * to its tier's Neutral discard pile.
       */
      type: "PANDORA_DISCARD_ARMY_UNIT";
      armyUnitId: string;
    }
  | {
      /**
       * Pandora's Box (card 173, option B): draw 3 cards from the `tier` Neutral
       * deck and open a free-recruit choice (Recruit one for free, or decline);
       * the rest return to that tier's discard pile (PANDORA_FREE_NEUTRAL_RESOLVE).
       */
      type: "PANDORA_FREE_NEUTRAL_RECRUIT";
      tier: "bronze" | "silver";
    }
  | {
      /**
       * Resolves a PANDORA_FREE_NEUTRAL_RECRUIT choice: add `recruit` (if any) to
       * the army for free as a neutral-side card, and return every other drawn
       * unit to the `tier` Neutral discard pile.
       */
      type: "PANDORA_FREE_NEUTRAL_RESOLVE";
      drawn: string[];
      recruit?: string;
      tier: "bronze" | "silver";
    }
  | {
      /** Necromancy Amplifier: fetch the Ability deck's first Necromancy card. */
      type: "NECROMANCY_FETCH";
    }
  | {
      /** Queue a discard-pile pick through the shared reward pipeline. */
      type: "DISCARD_PICK";
      count: number;
      filter?: "spell" | "non-artifact" | "specialty" | "power-or-knowledge-statistic" | "spell-or-specialty";
    }
  | {
      /**
       * Mana Vortex: the chosen card is discarded, the discard pile shuffles
       * back into the deck, then Search(3) from the own deck.
       */
      type: "MANA_VORTEX_RESOLVE";
      discardCardId: CardId;
    }
  | {
      /** Portal of Summoning: draw the top Neutral card of the chosen tier. */
      type: "PORTAL_SUMMON";
      tier: "bronze" | "silver" | "gold";
    }
  | {
      /** Portal of Summoning: pay the printed cost to recruit the drawn card. */
      type: "PORTAL_RECRUIT";
      unitDefId: string;
    }
  | {
      /** Portal of Summoning: the drawn card goes to its tier discard pile. */
      type: "PORTAL_DECLINE";
      unitDefId: string;
    }
  | {
      /** Factory shovel dig: draw the top Artifact card, then offer keep/discard. */
      type: "DIG_ARTIFACT";
    }
  | {
      /** Factory shovel dig: keep the dug Artifact card into hand. */
      type: "DIG_ARTIFACT_KEEP";
      cardId: CardId;
    }
  | {
      /** Factory shovel dig: send the dug Artifact card to its deck's discard. */
      type: "DIG_ARTIFACT_DISCARD";
      cardId: CardId;
      deckId: string;
    }
  | {
      /** Airship Yard: grant HERO_MOVE_THROUGH for the rest of this turn. */
      type: "GRANT_MOVE_THROUGH";
    }
  | {
      /** Watering Hole: zero remaining movement; flag +1 MP next turn. */
      type: "WATERING_HOLE";
    }
  | {
      /**
       * Pandora's Gift: Recruits — resolve the draw-3 offer. `drawn` are all the
       * units revealed; when `recruit` is set that one is recruited at half its
       * cost (rounded up). Every drawn unit NOT recruited returns to its tier's
       * Neutral discard pile.
       */
      type: "NEUTRAL_RECRUIT_RESOLVE";
      drawn: string[];
      recruit?: string;
    }
  | {
      /** Saplings / settlement perks: reinforce with only the gold halved. */
      type: "REINFORCE_HALF_GOLD";
      armyUnitId: string;
      /** Necromancy: "half the gold cost (rounded down)" instead of up. */
      roundDown?: boolean;
      /**
       * Necromancy ability / specialty: the played card is discarded from hand
       * ONLY when this reinforce actually upgrades a unit. A no-eligible-target
       * play or a declined reinforce leaves the card in hand (house rule: you
       * lose Necromancy only when it upgrades something).
       */
      consumeCardId?: CardId;
    }
  | {
      /** Cove Pub: reinforce one unit with a flat gold discount (min 0). */
      type: "REINFORCE_FLAT_GOLD";
      armyUnitId: string;
      discount: number;
    }
  | {
      /**
       * Polish Unit Stacks: add ONE Stack layer to an army card at a special
       * price (a building/skill offer — Necro City Hall free bronze, Saplings/
       * Necromancy half gold, Garden of Life free Sprite, Cove Pub −3 gold).
       * `cost` is priced at OFFER time; payment goes through the recruit path,
       * so the Freelancer's Guild substitution applies. Self-guards: no-op if
       * the rule is off, the unit is gone/at cap, or the cost is unpayable.
       */
      type: "BUY_UNIT_STACK";
      armyUnitId: string;
      cost: ResourceCost;
      /** Feed/spend label naming the source (e.g. "Saplings", "Necromancy"). */
      source: string;
      /** Necromancy: discard the played card ONLY when a Stack is really added. */
      consumeCardId?: CardId;
    }
  | {
      /**
       * Library of Enlightenment: open the swap menu — pick a Statistic card
       * (hand or discard) to remove for 3 gold. `remaining` swaps are left.
       */
      type: "LIBRARY_SWAP";
      remaining: number;
    }
  | {
      /** Library: pay 3 gold, remove the chosen source, then pick a replacement. */
      type: "LIBRARY_REMOVE";
      cardId: CardId;
      source: "hand" | "discard";
      remaining: number;
    }
  | {
      /** Library: gain the chosen replacement Statistic, then loop if swaps remain. */
      type: "LIBRARY_GAIN";
      statisticType: StatisticType;
      remaining: number;
    }
  | {
      /** Star Axis: open the menu to swap a hand Statistic for its Empowered form. */
      type: "STAR_AXIS_SWAP";
    }
  | {
      /** Star Axis: remove the chosen hand Statistic and gain its Empowered form. */
      type: "STAR_AXIS_GIVE";
      cardId: CardId;
    }
  | {
      /**
       * Astrologers (Dancing Imp / Hero): open the self-rebuilding menu to
       * empower one Statistic card. Offers each non-Empowered Statistic in the
       * given `sources` (deduped by source+type); `costGold` (Hero) is charged
       * per swap; `remaining` chains further offers (Hero's "up to twice").
       */
      type: "STAT_EMPOWER_OFFER";
      sources: ("hand" | "discard")[];
      remaining: number;
      prompt: string;
      costGold?: number;
    }
  | {
      /**
       * Astrologers empower leaf: remove the named Statistic card from `source`
       * (→ removed) and add the same-type Empowered Statistic to the hand. Pays
       * `costGold` first when present (Hero); a free swap omits it (Dancing Imp).
       */
      type: "EMPOWER_STATISTIC";
      cardId: CardId;
      source: "hand" | "discard";
      costGold?: number;
    }
  | {
      /**
       * Plane Between Planes: open the self-rebuilding menu to Remove up to
       * `remaining` more cards from the hand or discard pile (optional — each
       * step offers a Done exit). Each pick chains a REMOVE_CARD_FROM_PILE leaf.
       */
      type: "REMOVE_UP_TO";
      remaining: number;
    }
  | {
      /** Black Market: open the buy menu over the top Artifact discards. */
      type: "BLACK_MARKET";
    }
  | {
      /** Black Market: pay the rarity price and take the chosen artifact. */
      type: "BLACK_MARKET_BUY";
      cardId: CardId;
      deckId: DeckId;
      price: number;
    }
  | {
      /**
       * Elemental Conflux: open the recruit menu — one Elementals card per
       * Dwelling tier you have, drawn from the matching Neutral deck.
       */
      type: "ELEMENTAL_CONFLUX";
    }
  | {
      /**
       * THE shared "recruit a Neutral Unit for its printed cost" menu — the ONE
       * seam every such surface (Elemental Conflux, Portal of Summoning, Charlie
       * and his Circus, the Den of Thieves / Mercenary Camp Events) builds its
       * CHOOSE_ONE through, so Legion-voucher pricing, the discounted label and
       * the inline "play a Legion piece now" offer can never diverge between
       * them. Auto-resolving: it unshifts the real CHOOSE_ONE.
       *
       * Each candidate carries the surface's OWN recruit leaf (which charges the
       * discounted cost and spends the voucher); `decline` is the surface's own
       * bookkeeping (return the drawn cards, place the pool token, …).
       */
      type: "NEUTRAL_RECRUIT_MENU";
      prompt: string;
      /** Option verb, so each surface keeps its own printed wording ("Buy …"). */
      verb?: string;
      candidates: { unitDefId: string; steps: VisitStep[] }[];
      decline: { label: string; steps: VisitStep[] };
      /**
       * With nothing affordable (even after a held Legion piece), resolve
       * `decline.steps` straight away instead of prompting with a lone Decline.
       * Matches each surface's pre-existing behaviour.
       */
      skipWhenEmpty?: boolean;
    }
  | {
      /**
       * Inline Legion play from inside a NEUTRAL_RECRUIT_MENU: discard the held
       * Legion piece, bank its voucher for `unitDefId`, then RE-OPEN `menu` so
       * the refreshed prices show and a second distinct piece can stack on top.
       * This is the only way the discount is reachable at a surface whose visit
       * blocks card plays (a field reached by MOVING — which wipes pre-banked
       * vouchers — or an Event behind the round-start barrier).
       */
      type: "USE_LEGION_RECRUIT_DISCOUNT";
      cardId: CardId;
      amount: number;
      unitDefId: string;
      menu: VisitStep;
    }
  | {
      /** Elemental Conflux: recruit the chosen Elementals card for its cost. */
      type: "ELEMENTAL_RECRUIT_ONE";
      unitDefId: string;
      tier: "bronze" | "silver" | "gold";
    }
  | {
      /**
       * Tavern: pay 7 gold to gain a Secondary Hero on this field, then choose
       * one enemy to discard 1 random card. Resolved through the visit-choice
       * action (decline, or pick which enemy to hit).
       */
      type: "TAVERN";
    }
  | {
      /**
       * Prison: gain a Secondary Hero on this field, or 3 gold if you already
       * have one. Auto-resolves with no input.
       */
      type: "PRISON";
    }
  | {
      /**
       * Spell Scroll field: draw `remaining` Spells (one at a time, the player
       * picks the Basic or Expert Magic deck for each) into a single new scroll
       * placed near the hero. Self-expands into deck-pick + DRAW_SCROLL_SPELL.
       */
      type: "SPELL_SCROLL";
      remaining: number;
      /** The scroll being filled; created on the first draw. */
      scrollId?: string;
    }
  | {
      /** One Spell Scroll draw: take the top card of `deckId` into the scroll. */
      type: "DRAW_SCROLL_SPELL";
      deckId: DeckId;
      scrollId: string;
    }
  // --- Event cards (Fortress expansion) — see src/data/cards/events.ts ------
  | {
      /**
       * Per-player entry point of a choice-type Event card: builds that card's
       * printed menu from the player's LIVE state (hand, resources, army,
       * heroes) the moment it is this player's turn to resolve the Event.
       */
      type: "EVENT_PLAYER_CHOICE";
      eventCardId: string;
    }
  | {
      /**
       * Event morale change. Unlike GAIN_MORALE this is NOT a Field's token,
       * so the Crest of Valor field-shield never intercepts it.
       */
      type: "EVENT_CHANGE_MORALE";
      amount: number;
    }
  | {
      /** Loses the listed resources, each track clamped at 0 (Withered Hermit). */
      type: "LOSE_RESOURCES";
      gold?: number;
      buildingMaterials?: number;
      valuables?: number;
      reason: string;
    }
  | {
      /** Spends `amount` movement from the named hero (floored at 0). */
      type: "SPEND_HERO_MOVEMENT";
      heroId: HeroId;
      amount: number;
    }
  | {
      /**
       * Crypt: roll `count` Treasure dice — ANY "experience" face voids the
       * whole roll (gain nothing); otherwise choose one face and resolve it.
       */
      type: "EVENT_TREASURE_GAMBLE";
      count: number;
    }
  | {
      /**
       * Cursed Swamp: discard the army unit with the cheapest printed cost of
       * its current side (a recruited Neutral card recycles to its tier's
       * discard pile, like a combat casualty). Deterministic ties: first in
       * the army list.
       */
      type: "EVENT_DISCARD_CHEAPEST_UNIT";
    }
  | {
      /**
       * Self-rebuilding "Remove any number of matching hand cards" menu
       * (Cursed Swamp / Market of Time / School / Garden of Revelation).
       * `single`: one Search of the FIRST deck once `minRemoved` is met
       * (Cursed Swamp); otherwise floor(removed / per) Searches, each with a
       * deck choice when `searchDecks` lists more than one family.
       */
      type: "EVENT_REMOVE_FOR_SEARCH";
      filter: "spell" | "spell-or-ability";
      removed: number;
      per: number;
      searchCount: number;
      searchDecks: ("artifacts" | "spells" | "abilities")[];
      single?: boolean;
      minRemoved?: number;
      /** Cursed Swamp's "Remove one or more": Done only after this many removals. */
      mustRemove?: number;
      /** Done was picked: pay out the earned Searches (front of the reward queue). */
      finished?: boolean;
      /** Garden of Revelation: after the Searches, discard the hand and redraw to the limit. */
      thenDiscardAllRedraw?: boolean;
    }
  | {
      /**
       * Market of Time / School: self-rebuilding "discard as many cards as you
       * want" menu; the Done exit draws back up to hand limit + `bonus`.
       */
      type: "EVENT_DISCARD_ANY_THEN_DRAW";
      bonus: number;
    }
  | {
      /** Leaf of the above: one hand card to the player's own discard pile. */
      type: "EVENT_DISCARD_HAND_CARD";
      cardId: CardId;
    }
  | {
      /** Leaf: draw the player's own deck up to hand limit + `bonus`. */
      type: "EVENT_DRAW_TO_LIMIT";
      bonus: number;
    }
  | {
      /**
       * Event-earned Search: lands at the FRONT of the reward queue so it
       * resolves within this player's slot of the clockwise Event resolution
       * (a plain SEARCH_SHARED_DECK step would queue behind the other
       * players' Event rewards).
       */
      type: "EVENT_SEARCH_FRONT";
      deckId: DeckId;
      count: number;
    }
  | {
      /** Garden of Revelation: draw `count` cards from the own deck or the top of the own discard pile. */
      type: "EVENT_DRAW_OWN";
      from: "deck" | "discard";
      count: number;
    }
  | {
      /** Garden of Revelation ending: discard the whole hand, draw up to the hand limit. */
      type: "EVENT_DISCARD_ALL_DRAW_LIMIT";
    }
  | {
      /**
       * Withered Hermit: roll 3 Resource dice after naming `resource`. Named
       * resource on no die → choose one die and gain it; otherwise choose one
       * die and LOSE its resources (clamped at 0).
       */
      type: "EVENT_HERMIT_GAMBLE";
      resource: ResourceKind;
    }
  | {
      /**
       * Withered Hermit: roll 1 Resource die, then optionally pay the shown
       * resources to Search (2) the Artifact deck.
       */
      type: "EVENT_HERMIT_PAY_SEARCH";
    }
  | {
      /**
       * Messenger with Supplies: draw the 2 top Artifact cards this player may
       * take, then offer buy-one (tier price; the other returns to its deck)
       * or discard-both to roll 2 Resource dice and resolve one.
       */
      type: "EVENT_MESSENGER_DRAW";
    }
  | {
      /**
       * Buy/keep a revealed shared-deck card: pays `cost` (when set), then the
       * card goes to the hand — or, with `toDeck` (Mage Laboratory), is
       * shuffled into the player's deck together with their discard pile.
       */
      type: "EVENT_TAKE_CARD";
      cardId: CardId;
      deckId: DeckId;
      cost?: ResourceCost;
      toDeck?: boolean;
    }
  | {
      /**
       * Anime Hero Grades (§3.11): grant a specific library card straight into
       * the visitor's hand (the Training Manual item bought at the guild shops).
       * Cost is charged by the wrapping PAY_TO step, so this step is free.
       */
      type: "GAIN_HAND_CARD";
      cardId: CardId;
    }
  | {
      /**
       * Anime Equipment (§3.13): buy one always-on item at an outfitter Field
       * Override. Resolving deducts the item's gold cost and sets it into the
       * MAIN hero's matching slot, moving prior gear to the bag (no refund).
       * Offered only for an item the hero does not already own, and only when
       * affordable (gated in legal-actions + a reducer backstop, like PAY_TO).
       */
      type: "BUY_EQUIPMENT";
      equipmentId: string;
    }
  | {
      /** Creature-Bank reward: take one equipment item without spending gold. */
      type: "GRANT_EQUIPMENT";
      equipmentId: string;
    }
  | {
      /** Returns revealed cards to their shared decks (shuffle in / discard pile / deck top / deck bottom). */
      type: "EVENT_RETURN_CARDS";
      cards: { cardId: CardId; deckId: DeckId }[];
      mode: "shuffle" | "discard" | "deck-top" | "deck-bottom";
    }
  | {
      /**
       * Library of Enlightenment / Mage Laboratory / Shrine of the Magic
       * Thought: self-rebuilding buy menu over the live Event pool. Prices and
       * the die alternative are read from the active Event card's effect.
       */
      type: "EVENT_SPELL_MARKET";
    }
  | {
      /** Leaf: pay `cost` and take the pool card (to hand, or `toDeck` shuffled into the deck). */
      type: "EVENT_TAKE_POOL_CARD";
      cardId: CardId;
      cost?: ResourceCost;
      toDeck?: boolean;
    }
  | {
      /** Ends a pool Event: leftover pool cards return per events.poolCleanup. */
      type: "EVENT_POOL_CLEANUP";
    }
  | {
      /**
       * Forty Thieves (Astrologers): opens the "which of the 2 drawn Event
       * cards resolves" CHOOSE_ONE from events.pendingPick. Table bookkeeping —
       * it never reads visit.playerId, so an elimination hands it to the next
       * live seat (isSharedEventBookkeepingReward / eliminatePlayer).
       */
      type: "EVENT_FORTY_PICK";
    }
  | {
      /**
       * Leaf of the pick above: `cardId` becomes the drawn Event (overlay +
       * clockwise resolution queued AHEAD of the round-start barrier sentinel);
       * the other pick card goes to the bottom of the Event deck.
       */
      type: "EVENT_FORTY_RESOLVE";
      cardId: CardId;
    }
  | {
      /** Magical Forest: menu — contribute a hand card or a drawn deck card face-down. */
      type: "EVENT_FOREST_CONTRIBUTE";
    }
  | {
      /** Leaf: the named hand card goes face-down into the Event pool. */
      type: "EVENT_POOL_ADD_FROM_HAND";
      cardId: CardId;
      /** Under Polish Spell Book a real Spell may come from the Book. Default hand. */
      source?: "hand" | "spellBook" | "spellBookUsed";
    }
  | {
      /** Leaf: draw-and-view the top card of the chosen deck family face-down into the pool. */
      type: "EVENT_POOL_ADD_DRAWN";
      deck: "spells" | "artifacts" | "abilities";
    }
  | {
      /** Magical Forest phase 2: menu — take one random pool card or gain `gold`. */
      type: "EVENT_FOREST_TAKE";
      gold: number;
    }
  | {
      /** Leaf: seeded-random pick of one pool card into the hand. */
      type: "EVENT_POOL_TAKE_RANDOM";
    }
  | {
      /**
       * Mischievous Leprechaun: roll 1 Treasure + 1 Resource die and offer to
       * take (and resolve) ONE pool die matching either roll.
       */
      type: "EVENT_LEPRECHAUN_ROLL";
    }
  | {
      /** Leaf: remove the pool die at `index` and resolve its face. */
      type: "EVENT_TAKE_POOL_DIE";
      index: number;
    }
  | {
      /** Den of Thieves (drawer only): menu — pick the Neutral Unit deck to raid. */
      type: "EVENT_DEN_OF_THIEVES";
    }
  | {
      /** Den of Thieves: take the top 2 of the tier deck, then buy/replace choices. */
      type: "EVENT_DEN_DRAW";
      tier: "bronze" | "silver" | "gold" | "azure";
    }
  | {
      /** Leaf: pay the printed Neutral cost and add the unit on its Neutral side. */
      type: "EVENT_NEUTRAL_BUY";
      unitDefId: string;
    }
  | {
      /** Den of Thieves: menu — put the remaining pool card(s) on the top or bottom of the tier deck. */
      type: "EVENT_DEN_PLACE";
      tier: "bronze" | "silver" | "gold" | "azure";
    }
  | {
      /** Leaf: the listed cards leave the pool onto the top or bottom of the tier deck. */
      type: "EVENT_RETURN_UNITS";
      unitDefIds: string[];
      tier: "bronze" | "silver" | "gold" | "azure";
      position: "top" | "bottom";
    }
  | {
      /**
       * Prison: draws up to 2 candidates (the passed-on pool card plus fresh
       * draws from chosen non-Azure decks), then offers buy-one or
       * discard-one-for-gold; the leftover stays in the pool for the next
       * player (the trailing pool cleanup discards the final leftover).
       */
      type: "EVENT_PRISON_OFFER";
      discardGold: number;
    }
  | {
      /** Leaf: the named Neutral card leaves the pool to its tier's discard pile for `gold`. */
      type: "EVENT_NEUTRAL_DISCARD_GOLD";
      unitDefId: string;
      gold: number;
    }
  | {
      /** Mercenary Camp phase 1: menu — draw up to 2 cards of ONE Neutral deck into the pool. */
      type: "EVENT_MERC_DRAW";
    }
  | {
      /** Leaf: draw `count` cards of the tier deck face-up into the Event pool. */
      type: "EVENT_MERC_TAKE";
      tier: "bronze" | "silver" | "gold" | "azure";
      count: number;
    }
  | {
      /** Mercenary Camp phase 2: menu — Recruit one pool unit at its printed cost (EVENT_NEUTRAL_BUY leaf). */
      type: "EVENT_MERC_RECRUIT";
    }
  | {
      /**
       * Artifact Merchant: self-rebuilding shop over the live pool (tier
       * prices) plus the face-up Artifact discard top(s); buying a pool card
       * loops back so any number can be bought (the printed either/or then
       * hides the discard option); a Pass exit hands the pool on.
       */
      type: "EVENT_ARTIFACT_SHOP";
      boughtFromPool?: boolean;
    }
  | {
      /** A Shady Auction: reveal the next lot from the Artifact deck. */
      type: "EVENT_AUCTION_OPEN";
    }
  | {
      /** A Shady Auction: menu of gold bids (0..player's gold) for the open lot. */
      type: "EVENT_AUCTION_BID";
    }
  | {
      /** Leaf: record this player's hidden bid (masked in other players' views). */
      type: "EVENT_AUCTION_SET_BID";
      amount: number;
    }
  | {
      /** A Shady Auction: reveal bids — single highest pays and takes the lot; tie/no bets discard it. */
      type: "EVENT_AUCTION_RESOLVE";
    }
  | {
      /** Marketplace: menu — propose one 1-for-1 resource exchange. */
      type: "EVENT_MARKET_DEAL";
    }
  | {
      /** Leaf: open the proposed deal and ask the other players in clockwise order. */
      type: "EVENT_MARKET_DEAL_OPEN";
      give: ResourceKind;
      get: ResourceKind;
    }
  | {
      /** Menu for a non-proposer: accept the open 1-for-1 deal (first accept wins) or decline. */
      type: "EVENT_MARKET_DEAL_ANSWER";
    }
  | {
      /** Leaf: close the open deal — 1 `give` moves proposer→acceptor, 1 `get` moves back. */
      type: "EVENT_MARKET_DEAL_ACCEPT";
    };

export type AstrologersState = {
  /** Face-up Astrologers Proclaim card in effect until the next even round. */
  activeCardId: string | null;
  /** One-shot "next Resource Round" income adjustments (Gold Dragon & co). */
  nextResourceModifiers: { gold: number; valuables: number };
  /** Players whose first spell already returned to hand (Crazy Wizard). */
  crazyWizardUsedBy: PlayerId[];
  /** Players who already used this turn's free die reroll (Swift Weasel). */
  swiftWeaselUsedBy: PlayerId[];
  /**
   * Hero proclamation: round containing the one turn each player chose for
   * their paid Statistic exchanges. If absent, they have not chosen yet.
   */
  heroEmpowerChosenRoundBy?: Record<PlayerId, number>;
  /** Hero proclamation: number of exchanges made in the chosen turn. */
  heroEmpowerUsesBy?: Record<PlayerId, number>;
  /**
   * Crag Hack proclamation: set once the round's FIRST combat latched the
   * ground +1 Attack, so the second combat that round goes unbuffed.
   */
  firstCombatGroundAttackUsed?: boolean;
  /** Disruption proclamation: tiles already rotated ("no tile more than once"). */
  disruptionRotatedTileIds?: string[];
};

/** A shared-deck card (or Neutral unit card) sitting in the open Event pool. */
export type EventPoolEntry = {
  /** Shared-deck card id, or a Neutral unitDefId for unit pools. */
  cardId: CardId;
  /** Deck the card returns to ("" for a card contributed from a hand). */
  deckId: DeckId;
  /** Face-down entries (Magical Forest) are masked in other players' views. */
  faceUp: boolean;
};

/** One rolled die waiting in the Mischievous Leprechaun pool. */
export type EventDiePoolEntry =
  | { kind: "treasure"; face: "experience" | "artifact-search" | "resource-die" | "double-resource-die" }
  | { kind: "resource"; resource: ResourceKind; amount: number };

/**
 * Event deck state (Fortress expansion, optional rule, multiplayer only).
 * Distinct from the Astrologers Proclaim system: an Event is drawn at the
 * start of every Resource Round (after income), the drawer rotates clockwise
 * per draw, and effects resolve in clockwise order starting with the drawer.
 */
export type EventsState = {
  /** The most recently drawn Event card, face up until the next draw. */
  activeCardId: string | null;
  /** Seat offset into the human turn order of who draws the NEXT Event. */
  nextDrawerIndex: number;
  /**
   * Who drew the LAST Event. The next drawer is this seat's clockwise
   * successor among the live players — tracked by identity (not by index into
   * the shrinking live-player list) so an elimination never makes the same
   * player draw twice in a row or skips a seat. Absent in legacy snapshots,
   * which fall back to `nextDrawerIndex`.
   */
  lastDrawerId?: PlayerId | null;
  /** Shared card pool of the Event being resolved (markets / pass-arounds). */
  pool: EventPoolEntry[];
  /** Where leftover pool cards go when the Event finishes. */
  poolCleanup: "shuffle-into-deck" | "discard-pile";
  /** Mischievous Leprechaun: rolled dice still up for grabs. */
  dicePool: EventDiePoolEntry[];
  /** A Shady Auction: the open lot + hidden bids (masked in others' views). */
  auction: { lotCardId: CardId; lotDeckId: DeckId; bids: Record<PlayerId, number> } | null;
  /** Marketplace: the open 1-for-1 resource deal; the first accept closes it. */
  deal: { proposerId: PlayerId; give: ResourceKind; get: ResourceKind; done: boolean } | null;
  /**
   * Forty Thieves (Astrologers): the two Event cards drawn together, waiting
   * for the drawer's "which one resolves" pick (the other goes to the bottom
   * of the Event deck). Cards are custodied HERE — not in the pick step — so
   * an elimination mid-pick can hand the same pick to the next live seat
   * without any card leaving the game (eliminatePlayer). Public information:
   * both cards are drawn face up.
   */
  pendingPick?: { cardIds: CardId[]; drawerId: PlayerId } | null;
};

export type PendingTileChoice = {
  /**
   * Tile this player must choose a rotation for. "reveal"/"place" are the
   * discovered/placed Far tiles; "starting" is the one-time opening free
   * rotation of the player's own faction Ⅰ tile, forced at the start of their
   * first turn before they may move (the town/hero on the centre stay put — only
   * the six ring fields turn).
   */
  tileInstanceId: string;
  playerId: PlayerId;
  kind: "reveal" | "place" | "starting";
  /**
   * The hero that placed this tile (Far placements only). The chosen rotation
   * must leave a border-line doorway this hero can cross onto the tile through.
   */
  heroId?: HeroId;
};

/** Result of the start-of-game Attack-die roll for the first player. */
export type FirstPlayerRollState = {
  attempts: { rolls: { playerId: PlayerId; name: string; value: number }[] }[];
  winnerPlayerId: PlayerId;
};

/**
 * An attacker stepped onto an enemy Town/Settlement/Mine whose owner has no hero
 * there: the owner decides whether to pay the defense fee and fight without
 * their hero (units only — plus their CARDS on a `mine-army-defense` Mine).
 */
export type PendingGarrisonState = {
  attackerPlayerId: PlayerId;
  attackerHeroId: HeroId;
  defenderPlayerId: PlayerId;
  fieldId: MapSpaceId;
  /**
   * Gold the defender pays to garrison: 8 for a town / settlement / captured
   * Utopia / Grail site (the printed rule), 3 for a designer Garrison object or
   * a Mine (`mine-army-defense`). Absent on a pre-feature snapshot = 8.
   */
  goldCost?: number;
};

/** Opaque marker for an unopened Ⅱ–Ⅲ supply tile (its identity is rolled at flip). */
export const UNOPENED_FAR_TILE = "?";

/** Upper bound for the per-player Ⅱ–Ⅲ supply size the lobby may set. */
export const MAX_FAR_TILES_PER_PLAYER = 6;

/**
 * A Ⅱ–Ⅲ (Far) tile being flipped, with the same house-rule keep / reroll / pick
 * decisions whether the tile is OPENED from a player's supply (`via: "place"` /
 * `"observatory"`) or DISCOVERED already face-down on the map (`via: "reveal"` —
 * an ordinary discovery, a Redwood Observatory, or a Speculum). The `candidate`
 * is the tile currently revealed and under decision; the player may keep it,
 * reroll it, or pick between two tiles before it is finally placed/revealed (and
 * its rotation chosen). House rules (identical on both paths):
 *  - the player's 2nd opening, if its tile has no Settlement (and one is still
 *    in the pool), may be rerolled until a Settlement appears, then the player
 *    picks the Settlement tile OR the last tile seen before that reroll;
 *  - any opening whose tile shows a material (resource) Mine may be rerolled
 *    once.
 * A reveal opens the SAME on-map slot ({@link tileInstanceId}): its own printed
 * def is the first candidate (no pool draw, no supply marker spent), and a
 * reroll retargets that one instance to a fresh draw while the rerolled-away def
 * returns to the pool.
 */
/**
 * A Ⅱ–Ⅲ (Far) tile KIND a player may ask for under the optional Ⅱ–Ⅲ tile type
 * choice ({@link GameSetupOptions.farTileTypeChoice}). The three mine kinds use
 * the engine's own resource vocabulary; the board game's words (crystal, stone)
 * appear only in the player-facing labels. Classification lives in ONE place,
 * `engine/far-tile-types.ts` (`farTileTypeMatches`), which delegates to the same
 * predicates the Settlement guarantee and the Ore-Mine reroll already use.
 */
export type FarTileType = "gold" | "valuables" | "buildingMaterials" | "settlement";

export type PendingFarTileFlip = {
  playerId: PlayerId;
  /** The placing hero (for PLACE_TILE; the rotation must keep a doorway it can cross). */
  heroId?: HeroId;
  /** Where the chosen tile's flower will be centred. */
  centerRow: number;
  centerCol: number;
  /**
   * How this flip was triggered:
   *  - "place"       — a normal border placement from the supply;
   *  - "observatory" — a Redwood Observatory drop from the supply;
   *  - "reveal"      — discovering a face-down Ⅱ–Ⅲ tile already on the map.
   */
  via: "place" | "observatory" | "reveal";
  /** Reveal path: the on-map tile instance being decided (retargeted on a reroll). */
  tileInstanceId?: string;
  /** Observatory: the field whose visit step is consumed once the tile is placed. */
  observatoryFieldId?: MapSpaceId;
  /** Phase to restore once the flip resolves (preserved across rerolls). */
  returnPhase: GamePhase;
  /** 1-based index of this opening for the player (the 2nd is settlement-guaranteed). */
  openingIndex: number;
  /**
   * The tile currently revealed and under decision. During the "blind" stage
   * (blind Ⅱ–Ⅲ choice: the preference is asked BEFORE any draw) no tile has
   * been drawn yet and this holds the empty string.
   */
  candidate: string;
  /** The most recent NON-settlement tile held aside during a settlement reroll, offered against the Settlement at the final pick. */
  lastNonSettlement: string | null;
  /** Whether the one-time material-mine reroll has been spent this opening. */
  mineRerollUsed: boolean;
  /**
   * Which decision the pending OPTION_CHOICE represents, so resolution knows how
   * to read the chosen index:
   *  - "settlement": [Keep, Reroll for a Settlement]
   *  - "mine":       [Keep, Reroll once (material mine)]
   *  - "pick":       [Place the Settlement tile, Place the previous tile]
   *  - "blind":      [No preference, Prefer a GOLD mine, Prefer a VALUABLES
   *                  mine] — the blind Ⅱ–Ⅲ choice asked BEFORE the draw
   *                  (candidate is still ""); resolving it draws the tile.
   *  - "type-choice": [No preference, …one per AVAILABLE allowed kind] — the
   *                  optional Ⅱ–Ⅲ tile TYPE choice asked BEFORE the draw
   *                  (candidate is still ""); {@link typeOptions} carries the
   *                  index→kind mapping and resolving it draws the tile.
   */
  offerMode: "settlement" | "mine" | "pick" | "blind" | "type-choice";
  /**
   * "type-choice" only: the kind each offered option stands for, index-aligned
   * with the OPTION_CHOICE options (`null` = "no preference — draw any tile").
   * Persisted so the menu that was shown and the draw that resolves it can
   * never drift; deleted once the draw happens.
   */
  typeOptions?: (FarTileType | null)[];
};

export type AdventureState = {
  difficulty: GameDifficulty;
  /** Scenario this map was built from (data/map/scenarios). */
  scenarioId?: string;
  /**
   * Map designer scenario conditions active for this adventure (timed events,
   * notes). Copied from GameSetupOptions.customMapPreset at build time.
   */
  mapPreset?: CustomMapPreset | null;
  tiles: Record<string, MapTileState>;
  fields: Record<MapSpaceId, MapFieldState>;
  /**
   * Each player's face-down Ⅱ–Ⅲ (Far) tile supply, as opaque UNOPENED markers
   * (one {@link UNOPENED_FAR_TILE} per unplaced tile). The tiles are NOT decided
   * here — a truly random tile is drawn from {@link farTilePool} only when the
   * player actually places one (the "flip"), so the supply is just a count. The
   * player-view masks every entry to "hidden" anyway.
   */
  playerFarTiles: Record<PlayerId, string[]>;
  /**
   * The undrawn Ⅱ–Ⅲ tile pool players' openings draw from (the far tiles left
   * after the scenario's own face-down Far tiles were placed). A flip pops a
   * truly-random tile from here; a rerolled-away tile returns to it. Redacted in
   * the player-view (upcoming tiles are secret). Absent on pre-feature saves.
   */
  farTilePool?: string[];
  /**
   * Leftover Ⅳ–Ⅴ (Near) tile pool after setup's face-down Near draws. Used by
   * the map-designer `playerResourcePick` on Near tiles so a gold/valuables
   * preference can pull from a LIVE near pool (mirroring {@link farTilePool}),
   * not by swapping two face-down Near tiles. Redacted in the player-view.
   * Absent on pre-feature saves (near resource pick falls back to face-down
   * swap when the pool is missing/empty).
   */
  nearTilePool?: string[];
  /**
   * Undrawn Subterranean tiles left after map setup. When a Hero first enters
   * a gate, one same-band tile is reserved from here and offered alongside the
   * face-down tile already occupying the connected underground slot.
   * Redacted in every player view. Absent on pre-feature saves.
   */
  subterraneanTilePool?: string[];
  /**
   * Live designer hex events keyed by their hex ({@link HexEventState}).
   * REDACTED from every player view — an unsprung event must stay invisible in
   * the real game; only the engine reads it (the beginFieldVisit trigger seam).
   */
  hexEvents?: Record<MapSpaceId, HexEventState>;
  /**
   * Blind Ⅱ–Ⅲ tile choice (GameSetupOptions.farTileBlindChoice, default OFF):
   * a supply opening first asks the player for a blind gold/valuables/no-
   * preference pick that filters the random draw. Absent/false = the draw is
   * immediate, exactly as before.
   */
  farTileBlindChoice?: boolean;
  /**
   * Ⅱ–Ⅲ TILE TYPE CHOICE (GameSetupOptions.farTileTypeChoice, default OFF): the
   * undecided Ⅱ–Ⅲ tile in a player's hand works like a hidden tile — on placing
   * it the opener CHOOSES the kind (gold mine / crystal-valuables mine /
   * stone-ore mine / Settlement) and a random tile OF THAT KIND is drawn from
   * the pool. Absent/false = the classic blind draw, byte-identical.
   */
  farTileTypeChoice?: boolean;
  /**
   * The map DESIGNER's restriction on that menu (`preset.farTileTypeChoices`,
   * e.g. `["valuables","gold"]` = "crystal or gold"). Absent/empty = all four
   * kinds. Only read while {@link farTileTypeChoice} is on.
   */
  farTileTypeChoices?: FarTileType[];
  /**
   * How many Ⅱ–Ⅲ tiles each player has already opened (placed). Drives the
   * "the 2nd tile each player opens is the settlement-guaranteed one" rule.
   */
  farTilesOpenedByPlayer?: Record<PlayerId, number>;
  /**
   * Whether a player has ALREADY opened a Ⅱ–Ⅲ tile that carries a Settlement.
   * The 2nd-tile settlement guarantee is a floor, not a bonus: once a player's
   * earlier Far tile already gave them a Settlement, the guarantee is satisfied,
   * so their 2nd opening must NOT offer/force the settlement reroll (it would let
   * them fish for a second Settlement, which is not the rule). Absent on
   * pre-feature saves (treated as "no settlement yet").
   */
  farSettlementOpenedByPlayer?: Record<PlayerId, boolean>;
  /** A Ⅱ–Ⅲ tile flip in progress (keep / reroll / pick decision pending). */
  pendingFarTileFlip?: PendingFarTileFlip | null;
  /**
   * Test-only override: forces the next flip draws to these tile def ids in
   * order (mirrors combat dice `scriptedRolls`). Each entry is pulled from the
   * pool when drawn. Never set in production (real play draws truly at random).
   */
  farTileScriptedDraws?: string[];
  /** Start-of-game first-player roll, shown to every seat. */
  firstPlayerRoll?: FirstPlayerRollState | null;
  /**
   * Hard opening gate: a human must dismiss the first-player ceremony before
   * round-one actions (including server-driven computer actions) may begin.
   * Absent on older saves and games created with the roll disabled.
   */
  openingFirstPlayerRollPending?: boolean;
  /**
   * Server-baked seed for the delayed opening roll. Hidden from player views
   * and cleared as soon as the ceremony is committed.
   */
  openingFirstPlayerSeed?: string;
  /** Garrison decision pending while an undefended town is attacked. */
  pendingGarrison?: PendingGarrisonState | null;
  /**
   * Shared face-up war machine pile (one copy of each card). Bought machines
   * leave the supply for good — they live in the buyer's deck from then on.
   */
  warMachineSupply?: CardId[];
  /** Pandora's Box deck: shuffled draw pile (top = last element). */
  pandoraDeck?: CardId[];
  /**
   * Creature Bank token piles (Naval Battles optional rule). Two shuffled piles
   * of CreatureBankId — one for Far Map Tiles (II-III), one for Near (IV-V) —
   * drawn from (top = last element) when a player places a bank on a discovered
   * tile's Blocked Field. Present only when the rule is enabled; an empty pile
   * means every token of that type has been placed.
   */
  creatureBankTokensFar?: string[];
  creatureBankTokensNear?: string[];
  /**
   * Pick-on-reveal Subterranean Gate placement (default ON). When a revealed
   * tile can host a Gate half in more than one spot — which touching hex becomes
   * the gate, later which underground hex becomes the path up, and which Surface
   * tile a cavern connects to when it touches two — the revealing player is asked
   * (an OPTION_CHOICE) instead of the engine auto-picking the nearest hex. Off
   * restores the deterministic nearest-hex carve (used by the mutation control
   * and by fully-automatic setup/symmetric placement).
   */
  chooseGatePlacement?: boolean;
  /**
   * Committed Subterranean Gate placements chosen by players (pick-on-reveal).
   * A plan pins a Surface↔cavern pair and the hex each half sacrifices, so
   * {@link recomputeSubterraneanGates} carves the PLAYER's hexes (and pairing)
   * instead of the nearest-hex default, and one-gate-per-tile seals the losing
   * neighbours. Absent/empty on fully-automatic maps.
   */
  gatePlans?: SubterraneanGatePlan[];
  /**
   * A Monolith/Whirlpool/colored-Gate travel whose destination tile was still
   * face-down: the traveller flipped it for free and now owes its rotation and
   * the destination token's placement. Once the token is carved on the revealed
   * tile the teleport completes (the hero moves there; a Whirlpool travel then
   * takes its unit toll — a Gate takes none). Cleared when the teleport
   * completes, fizzles (no legal field for the token), or the traveller is
   * eliminated.
   */
  pendingTokenTeleport?: {
    playerId: PlayerId;
    heroId: HeroId;
    kind: "monolith" | "whirlpool" | "gate";
    /** Colored-Gate travel only: the pair (1-4) the placement carves. */
    pair?: 1 | 2 | 3 | 4;
    /** The token the hero is travelling FROM (it stays put). */
    fromSpaceId: MapSpaceId;
    /** The face-down tile that hides the destination token. */
    destTileInstanceId: string;
  } | null;
  /** Field visit currently being resolved (choices pending). */
  pendingVisit: PendingVisit | null;
  /**
   * Atomic after-combat Necromancy transaction (BINH house rule). Set when a
   * player wins a non-Quick Combat AND can play a Necromancy card at that
   * instant. The winner may play multiple Necromancy cards plus compatible
   * hand bonuses (Legion discounts / gold effects), redeem the resulting
   * reinforcement offers, and then explicitly resolve the window. Every combat
   * and field reward is withheld until that final resolve, preventing the
   * winner from collecting map gold before paying for the reinforcement.
   */
  pendingNecromancy?: {
    playerId: PlayerId;
    /** Two Necromancy cards may be played after the same combat. Missing on old snapshots means one. */
    remaining?: number;
    /** Legacy snapshot fields; new states store the work in deferredReward. */
    heroId?: HeroId;
    fieldId?: MapSpaceId;
    /** The exact post-combat reward that must not resolve before Necromancy. */
    deferredReward?:
      | {
          kind: "field-visit";
          heroId: HeroId;
          fieldId: MapSpaceId;
        }
      | {
          kind: "creature-bank";
          heroId: HeroId;
          fieldId: MapSpaceId;
          stackCount: number;
        }
      | { kind: "wave"; wave: number }
      | { kind: "raid-boss"; bossInstanceId: string }
      | { kind: "dungeon-floor"; floor: number };
    /** Necromancy banks created in this window; unused ones expire on Resolve. */
    discountIds?: string[];
  } | null;
  /**
   * MGQ's atomic fought-neutral-win seal offer. The defeated cards have already
   * returned to their Neutral discard piles; accepting removes one exact copy
   * and mints it as a Neutral-side Companion. The field/bank reward is withheld
   * until this choice resolves, matching the Necromancy transaction seam.
   */
  pendingCompanionRecruitment?: {
    playerId: PlayerId;
    heroId: HeroId;
    options: {
      unitDefId: string;
      tier: "bronze" | "silver";
      cost: ResourceCost;
    }[];
    deferredReward?:
      | { kind: "field-visit"; heroId: HeroId; fieldId: MapSpaceId }
      | { kind: "creature-bank"; heroId: HeroId; fieldId: MapSpaceId; stackCount: number }
      | { kind: "wave"; wave: number }
      | { kind: "raid-boss"; bossInstanceId: string }
      | { kind: "dungeon-floor"; floor: number };
  } | null;
  /**
   * Hierophant commander (First Aid Master): after a combat in which the
   * commander survived, ONE of the owner's bronze/silver casualties may be
   * restored — a unit that died comes back (its side re-added; a recycled
   * neutral card is pulled back out of its tier discard), a Pack that flipped
   * down to Few flips back up. Resolved by COMMANDER_FIRST_AID (option index
   * or null to decline); blocks that player's other actions like Necromancy.
   */
  pendingCommanderFirstAid?: {
    playerId: PlayerId;
    options: {
      label: string;
      /** "revive": re-add a died card; "flip-up": restore a Pack side. */
      kind: "revive" | "flip-up";
      unitDefId: string;
      side: "few" | "pack" | "neutral";
      /** flip-up: the surviving army card to flip back to its Pack side. */
      armyUnitId?: string;
      /** revive of a neutral-side card: tier discard pile it recycled into. */
      neutralTier?: string;
    }[];
  } | null;
  /** Rewards waiting to resolve one at a time (level-up searches, City Halls). */
  rewardQueue: AdventureReward[];
  /** Last field each hero visited, where a retreating hero returns. */
  lastVisitedField: Record<HeroId, MapSpaceId>;
  /** Victory: flagging an enemy town wins the scenario (default skirmish). */
  winnerPlayerId: PlayerId | null;
  /**
   * How this game is won. Absent on snapshots from before win conditions
   * existed; treated as "conquest" (flag an enemy town).
   */
  victoryMode?: VictoryMode;
  /**
   * Whether dead units are kept after a player-vs-player Combat. Absent on
   * older snapshots; treated as "normal" (the rulebook — casualties are lost).
   */
  pvpTroopLoss?: PvpTroopLoss;
  /**
   * How the Dragon Utopia objective is guarded (Dragon Hunt / Dragon Conqueror).
   * Absent on older snapshots; treated as "by-difficulty".
   */
  dragonUtopiaGuards?: DragonUtopiaGuards;
  /**
   * Spell Book house rule (default ON). When on, each player has a personal
   * Spell Book zone (PlayerState.spellBook) they may stash hand Spells into, cast
   * or boost from, and refill from the discard pile. Off hides the move-to-Book
   * action and the discard→Book pickup option entirely, so the Book stays empty
   * and inert. Absent on older snapshots; treated as ON (see spellBookRuleEnabled).
   */
  spellBook?: boolean;
  /**
   * Optional Morale Cards variant. When on, morale gains/losses draw from the
   * positive/negative Morale decks instead of changing the numeric morale token.
   */
  moraleCards?: boolean;
  /**
   * GLOBAL Field Override system frozen at setup. When on, pool draws stamp
   * pending overrides on face-down Far/Near/Center tiles and place them on
   * reveal (before gates / banks / teleports). Absent on older snapshots = off.
   */
  fieldOverrides?: boolean;
  /** Pool-draw placement mode frozen at setup. See GameSetupOptions. */
  fieldOverridePlacement?: FieldOverridePlacementMode;
  /**
   * Tournament Mode setup rules (default OFF). When on, Diplomacy and Hourglass
   * of the Evil Hour are removed from shared decks, and the second player gains
   * 1 positive morale at game start. Prefer the granular flags below when set;
   * this boolean is the all-on convenience / legacy snapshot flag.
   * See GameSetupOptions.tournamentMode.
   */
  tournamentMode?: boolean;
  /** Remove Diplomacy from the shared Ability deck (Tournament rule). */
  tournamentBanDiplomacy?: boolean;
  /** Remove Hourglass of the Evil Hour from the shared Artifact deck. */
  tournamentBanHourglass?: boolean;
  /** Second player gains +1 positive morale at game start (Tournament rule). */
  tournamentSecondPlayerMorale?: boolean;
  /**
   * Tournament option: the Redwood Observatory may rotate one adjacent revealed
   * tile with no Hero, then continues its normal face-down-tile discovery.
   */
  tournamentObservatoryRerotate?: boolean;
  /**
   * PvP Neutral Control mode (optional, any game with two or more seats). When on, the next
   * live player clockwise from a Neutral combat's fighter commands the Neutral
   * side's decisions (see GameSetupOptions.pvpNeutralControl). Absent on older
   * snapshots and solo tables — treated as OFF.
   */
  pvpNeutralControl?: boolean;
  /**
   * PvP Neutral Control "must attack" sub-toggle (default true when the mode is
   * on). See GameSetupOptions.pvpNeutralControlMustAttack. Absent = true.
   */
  pvpNeutralControlMustAttack?: boolean;
  /**
   * OPTIONAL Undo mode (debug/testing, default OFF). Frozen from
   * GameSetupOptions.undoMoves at setup so the SERVER action transaction can
   * read it to decide whether to keep a bounded, broadcast-free per-room undo
   * stack. Absent/false = no history is kept and UNDO_MOVE is rejected. This
   * flag is the ONLY thing about undo that lives in GameState; the history
   * itself never enters state (never broadcast, never in a player view). See
   * src/server/undo-history.ts.
   */
  undoMoves?: boolean;
  /**
   * OPTIONAL Manual guard control (default OFF). Frozen from
   * GameSetupOptions.manualGuardControl at setup: the FIGHTER of a Neutral
   * combat commands the guards through the PvP-Neutral-Control unit menu
   * (must-attack discipline; polish-wait Wait allowed, Waited re-activation
   * must attack) or delegates one activation to the AI with
   * AUTO_NEUTRAL_ACTIVATION. Absent/false = the rulebook Neutral AI plays the
   * guards exactly as before. See manualGuardControllerId in neutral-control.ts.
   */
  manualGuardControl?: boolean;
  /**
   * First-round opening-hand Mulligan (default ON). Frozen from
   * GameSetupOptions.startingHandMulligan at setup:
   *  - OFF: start-of-turn may only ditch under-limit cards (difficulty bonus
   *    artifact(s)) then draw to hand limit — no second full-hand mulligan.
   *  - ON: same fill-to-limit first, then OPENING_HAND_MULLIGAN (discard 0–N
   *    to deck bottom, draw the same number).
   * See refreshHand / openingHandMulligan in adventure-reducer.ts.
   */
  startingHandMulligan?: boolean;
  /**
   * Unit Experience (optional rule): frozen at setup when ANY of the three
   * surfaces enabled it (lobby `unitExperience`, `wog.unitExperience`,
   * `anime.unitExperience`). Absent/false = the rule is off: no XP is awarded,
   * no rank folds, DRILL_UNIT rejected. See src/engine/unit-experience.ts.
   */
  unitExperience?: boolean;
  /**
   * Neutral Rank-Up (optional module): frozen at setup when either surface
   * enabled it (`wog.neutralRankUp` / `anime.neutralRankUp`). Absent/false = OFF:
   * neutral guards never rank up (byte-identical). See src/engine/unit-experience.ts
   * (`neutralRankUpActive`, `applyNeutralRoundsRank`, `neutralBankMirrorXp`).
   */
  neutralRankUp?: boolean;
  /**
   * Calamity Waves (optional module, §6.6): frozen at setup when either mod
   * surface enabled it (`wog.monsterWaves` / `anime.monsterWaves`). Presence =
   * ON; `cadence` is the wave rhythm (a wave every Nth round, first wave on
   * round N). Absent = OFF (byte-identical, legacy snapshots unaffected).
   * See src/engine/monster-waves.ts.
   */
  monsterWaves?: {
    cadence: 3 | 4 | 5;
    pressure?: WavePressure;
    defeatLimit?: WaveDefeatLimit;
    /** The shared Calamity Gate map-object field; null until a Far tile hosts it. */
    gateFieldId?: MapSpaceId | null;
  };
  /** Resolved shared art/army theme for Waves, Raid Bosses and the Dungeon. */
  pveTheme?: ResolvedPveEncounterTheme;
  /** Frozen scheduled Rift Lair arrival; absent means the legacy round-5 default. */
  raidBossSpawnRound?: number;
  /**
   * Raid Bosses (optional module, §6.5): PRESENCE = module ON (frozen at setup
   * from `wog.raidBosses` / `anime.raidBosses`), keyed by boss instance id —
   * empty until the scheduled spawn or a designer lair places one. Wounds
   * (`layersLeft`) persist here between attempts and across snapshots.
   * See src/engine/raid-bosses.ts.
   */
  raidBosses?: Record<string, RaidBossState>;
  /**
   * The Dungeon (optional module, §6.7.3): PRESENCE = module ON (frozen at
   * setup from `wog.dungeon` / `anime.dungeon`; also requires the Creature
   * Banks option — the site is carved onto a Blocked Field). `fieldId` is null
   * until the site is placed (first Near-band tile revealed with a Blocked
   * Field). Per-player floor progress lives on `PlayerState.dungeonFloor`.
   * See src/engine/dungeon.ts.
   */
  dungeonSite?: {
    fieldId: MapSpaceId | null;
    /** Absent = the original ten-floor campaign. */
    maxFloor?: DungeonDepth;
    /** Absent = the original 1-movement immediate-descent cost. */
    descentCost?: DungeonDescentCost;
    /** Designer-selected floor wardens; absent entries use the resolved theme catalog. */
    floorBosses?: Partial<Record<5 | 10, string>>;
  };
  /**
   * Individual BINH house-rule toggles, resolved to concrete booleans at setup
   * (see resolveHouseRules / houseRuleEnabled in house-rules.ts). Absent on older
   * snapshots and the combat sandbox, where the mode default is derived instead.
   */
  houseRules?: Partial<Record<HouseRuleId, boolean>>;
  /**
   * Polish Rule 111: player ids that have already used their once-per-game
   * bronze-guard swap on a home-tile difficulty-I fight. Absent when the rule
   * is off or nobody has used it yet.
   */
  rule111UsedBy?: PlayerId[];
  /**
   * Polish Random Artifacts: access override computed from the latest Attack-die
   * roll for an in-flight Artifact acquisition. Consumed by eligibleArtifactDecks
   * while set; cleared when the search/choice closes. Absent when the rule is
   * off or no roll is pending.
   */
  polishArtifactAccess?: ArtifactDeckAccess | null;
  /**
   * Polish Random Artifacts: the Attack-die face of the latest roll (−1 / 0 / +1).
   * Used by polish-pandora-search for the Search(X+1) upgrade. Cleared with
   * polishArtifactAccess.
   */
  polishRandomArtifactDie?: number | null;
  /**
   * Holy Grail: the single Grail Token's progress. Only one token exists in
   * the game even when several Grail fields are on the map. Digging requires
   * the digger to have visited {@link GRAIL_OBELISKS_REQUIRED} distinct Obelisks
   * (tracked per player in `obelisksVisited`).
   */
  grail?: {
    status: "uncollected" | "carried" | "delivered" | "built";
    /** Hero physically carrying the dug Grail back toward their town. */
    carrierHeroId?: HeroId;
    /**
     * When status is "built": the Town/Settlement field the Grail was built
     * on. The location's controller scores possession VP at end of game.
     */
    builtFieldId?: MapSpaceId;
    /**
     * Distinct Obelisk field ids each player has visited (flagged). Dig is
     * locked until a player has {@link GRAIL_OBELISKS_REQUIRED} entries.
     */
    obelisksVisited?: Record<PlayerId, MapSpaceId[]>;
  };
  /**
   * LEGACY MIRROR (2026-08-07). Historically set the moment a special-rules
   * Grail GUARD fell, which was the old (wrong) conversion trigger. It is now
   * set at the DIG, together with {@link grailTakenFieldId}, and is only read as
   * a fallback for snapshots written before that field existed — and then only
   * once `grail.status` proves the Grail was really taken. New code must read
   * `grailConversionActive` / `grailTakenFieldId`, never this flag.
   */
  grailFieldCleared?: boolean;
  /**
   * USER RULE 2026-08-07: the field the single Grail Token was DUG from. Two
   * jobs, both scoped to that one field id:
   *   - it is the conversion TRIGGER — extra Grail fields only start behaving
   *     like a Dragon Utopia once a Grail has actually been TAKEN (never merely
   *     when a Grail's guards fell), and
   *   - the dug field itself NEVER converts: it stays a spent Grail dig site
   *     (black cube, no `grailDiggable`) for the rest of the game.
   * Absent = no Grail has been dug yet (every legacy snapshot).
   */
  grailTakenFieldId?: MapSpaceId;
  /**
   * The conversion extra Grail fields take, frozen at the dig (so a Grail tile
   * revealed LATER converts the same way the field sweep did, without
   * re-resolving house rules / preset in the tile-materialize path). Absent on
   * legacy snapshots, where the only conversion that ever fired was the
   * package's Dragon Utopia.
   */
  grailTakenConversion?: "dragon_utopia" | "empty_field";
  /**
   * Grail Hunt / Dragon Hunt: distinct enemy players each player has beaten in
   * hero combat at least once (the "defeat every enemy hero" win path).
   */
  heroDefeats?: Record<PlayerId, PlayerId[]>;
  /**
   * Victory Points ledger (see {@link VpLedgerEntry}). Event-sourced VP
   * components captured at the moment they happen — tracked unconditionally at
   * the combat/visit seams regardless of whether VP mode is on (inert until
   * scored). Absent on legacy snapshots (treated as empty).
   */
  vpLedger?: Record<PlayerId, VpLedgerEntry>;
  /**
   * Progress toward abstract {@link CustomWinCondition} `hold-with-grail` rows
   * (keyed by a stable condition fingerprint). Reset when control or Grail
   * possession breaks. Field-stamped holds use {@link MapFieldState.holdControlRounds}
   * instead.
   */
  holdWithGrailProgress?: Record<string, { playerId: PlayerId; rounds: number }>;
  /** Tile awaiting its rotation choice after a reveal or placement. */
  pendingTileChoice?: PendingTileChoice | null;
  /** Astrologers Proclaim deck state (even rounds). */
  astrologers?: AstrologersState;
  /** Event deck state (Resource rounds; optional rule, multiplayer only). */
  events?: EventsState;
  /**
   * Round-start Event / Astrologers barrier (both event types, ordered AND
   * parallel play). Set at the start of a round whose Event or Astrologers
   * proclamation queued per-player resolution; while it is set the WHOLE table
   * is frozen — only the player whose event choice is currently open may act,
   * every other player waits (no quiet moves, no start-of-turn draw, no town or
   * morale actions, no ending the turn) until every player has resolved it.
   * Cleared by the trailing "round-start-events-resolved" reward sentinel once
   * the last player's resolution has drained, after which the normal round-start
   * flow (City Halls, turn-start effects, first-turn hand, turns) proceeds.
   * `round` is the round it was raised in (a stale-guard: it never gates a later
   * round). Absent/null when no Event is mid-resolution — i.e. almost always.
   */
  eventResolution?: { round: number } | null;
};

/**
 * Adjustable game options chosen during map setup (rulebook setup steps 1, 8,
 * 9 and the difficulty choice): starting map, neutral difficulty (the Field
 * Difficulty Level Table column — Impossible by default), starting resources,
 * base income ("resource gain", 10 gold / 0 materials / 0 valuables by
 * default), starting units and pre-built buildings.
 */
export type GameSetupOptions = {
  scenarioId: string;
  /** Seats in the map-setup lobby, clamped to the scenario's min/max players. */
  playerCount?: number;
  /** Personal custom setup mode; keeps the normal Legacy/BINH ruleset underneath. */
  customMode?: boolean;
  /** Rules variant: "legacy" (rulebook) or "binh" (house rules). */
  ruleset: GameRuleset;
  /** Wake of Gods modules. Enabled only in BINH mode; absent means fully off. */
  wog?: WogModOptions;
  /** Anime mod modules. Enabled only in BINH mode; absent means fully off. */
  anime?: AnimeModOptions;
  /** Win condition: "conquest", "grail" (Holy Grail), "dragon-hunt" or "dragon-conqueror". */
  victoryMode?: VictoryMode;
  /** PvP Combat casualties: "normal" (lose dead units) or "none" (keep troops). */
  pvpTroopLoss?: PvpTroopLoss;
  /**
   * How the Dragon Utopia objective is guarded (Dragon Hunt / Dragon Conqueror
   * modes): "four" (the full four-dragon party) or "by-difficulty" (guard count
   * scales with difficulty). Default "by-difficulty".
   */
  dragonUtopiaGuards?: DragonUtopiaGuards;
  /**
   * Naval Battles optional rule. When on (default), discovering a Far/Near Map
   * Tile with a Blocked Field lets the discovering player place a Creature Bank
   * token there. Off disables the offer and the token piles entirely.
   */
  creatureBanks?: boolean;
  /**
   * GLOBAL Field Override system (default OFF). When on, Far/Near/Center
   * face-down tiles receive at least one pool-drawn single-hex replacement on
   * reveal (designer pins always apply when present). Placement mode is
   * {@link fieldOverridePlacement}. Content kinds come from registered
   * packages (core + Anime mod objects, …) — the mechanism is not mod-specific.
   * Auto-ON when a designed map carries any `plan.fieldOverride` pin.
   */
  fieldOverrides?: boolean;
  /**
   * How pool-drawn Field Overrides place on tile reveal. Designer pins never
   * refuse. Default "manual-or-refuse".
   */
  fieldOverridePlacement?: FieldOverridePlacementMode;
  /**
   * Event deck optional rule (Fortress expansion, default OFF). Multiplayer
   * only: with 2+ players an Event card is drawn at the start of every
   * Resource Round after income, the drawer rotating clockwise per draw. Off
   * (or a solo game) skips the deck entirely.
   */
  events?: boolean;
  /**
   * OPTIONAL Victory Points scoring mode (default OFF/absent). When on, the game
   * ends by SCORING — the player with the MOST Victory Points wins — at the
   * `victoryPointsRoundLimit` round (if set) OR the moment a player completes the
   * Scenario's victory condition; the full rulebook VP table lives in
   * `src/engine/victory-points.ts`. Enabling it from the lobby injects a
   * `victoryPoints: { enabled: true }` block into the EFFECTIVE map preset at
   * build time (`victoryPointsConfig` reads `adventure.mapPreset.victoryPoints`,
   * so the whole downstream VP system then lights up). A designed map preset that
   * ALREADY enables VP stays AUTHORITATIVE — its config/round-limit win and an
   * explicit lobby `victoryPoints: false`/absent never disables it. Without a
   * round limit a conquest-style game ends ONLY by completion / last-faction-
   * standing (the same caveat `victory-points.test.ts` pins for presets).
   */
  victoryPoints?: boolean;
  /**
   * OPTIONAL hard end-of-game round for lobby Victory Points scoring (only
   * meaningful with `victoryPoints` on; ignored otherwise). Injected as the
   * effective preset's `roundLimit` when the preset sets none of its own. 0 /
   * absent = no round limit (completion is then the only end trigger). Clamped
   * to the same 1–30 range as a designed preset's round limit.
   */
  victoryPointsRoundLimit?: number;
  /**
   * OPTIONAL host-added CUSTOM WIN CONDITIONS ({@link CustomWinCondition}) for
   * THIS game. Merged (preset-first, exact-duplicate deduped, capped) with the
   * picked map's own `customWinConditions` at build time
   * (`applyLobbyCustomWinConditions`). The lobby can only ADD — a map-authored
   * condition is never removed by the lobby. Absent = the map's own list only.
   */
  customWinConditions?: CustomWinCondition[];
  /**
   * WHO GOES FIRST (default "random" — absent reads as random, so every legacy
   * lobby/snapshot is byte-identical). "manual" makes the host write the whole
   * turn order in {@link manualPlayerOrder}; the setup-step-22 Attack-die roll
   * and its opening ceremony are then skipped entirely.
   */
  playerOrderMode?: PlayerOrderMode;
  /**
   * The host's deliberate turn order (seat ids, first player first). Only read
   * while {@link playerOrderMode} is "manual". `setGameOptions` sanitises it
   * against the open seats (unknown ids and duplicates dropped, missing seats
   * appended in seat order) so it always stays a full permutation; a list that
   * is STILL not a full permutation at build time (a hand-built options object)
   * falls back to the random roll with a feed note.
   */
  manualPlayerOrder?: PlayerId[];
  /**
   * Spell Book house rule (default ON). Gives every player a personal Spell Book
   * zone they may stash hand Spells into to free slots, then cast or boost from.
   * Off disables the move-to-Book action and the discard→Book pickup entirely.
   */
  spellBook?: boolean;
  /**
   * Optional Morale Cards variant (default OFF). Replaces the normal morale
   * token system with positive/negative Morale decks and held morale cards.
   */
  moraleCards?: boolean;
  /**
   * Tournament Mode convenience flag (default OFF, rulebook p.54). When on
   * without granular overrides, enables every tournament rule below (ban
   * Diplomacy, ban Hourglass, second-player +1 morale). The UI "Tournament
   * mode" preset also turns off house rules, sets Hard difficulty, and keeps
   * Neutral AI control. Does NOT implement the rest of printed Tournament Mode
   * (player-built map, VP scoring, round-1 mulligan, etc.).
   */
  tournamentMode?: boolean;
  /**
   * Tournament rule: remove Diplomacy from the shared Ability deck before
   * shuffling. Heroes who start with Diplomacy still keep their personal copy.
   * Absent falls back to `tournamentMode`.
   */
  tournamentBanDiplomacy?: boolean;
  /**
   * Tournament rule: remove Hourglass of the Evil Hour from the shared
   * Artifact deck before shuffling. Absent falls back to `tournamentMode`.
   */
  tournamentBanHourglass?: boolean;
  /**
   * Tournament rule: the second player (seat after the starting player) gains
   * 1 positive morale at game start. Absent falls back to `tournamentMode`.
   */
  tournamentSecondPlayerMorale?: boolean;
  /**
   * Tournament option: the Redwood Observatory may re-rotate one adjacent,
   * already-revealed tile with no Hero on it, then continues normal discovery.
   * Town and Subterranean Gate tiles remain eligible. Absent falls back to
   * `tournamentMode`.
   */
  tournamentObservatoryRerotate?: boolean;
  /**
   * PvP Neutral Control mode (default OFF, any game with at least two seats,
   * including one human plus computer opponents). In every Neutral
   * combat the NEXT live player clockwise from the fighter PLAYS the Neutral
   * units — they drive the guards like a PvP side: move, attack, use abilities
   * and resolve every ability follow-up (target picks, rerolls, Magic Mirror)
   * exactly as a human fighter would. The only thing separating it from a plain
   * PvP fight is the optional `pvpNeutralControlMustAttack` constraint below. A
   * solo table (or a fight with no other live player) falls back to the AI.
   */
  pvpNeutralControl?: boolean;
  /**
   * PvP Neutral Control sub-toggle (default true = the rulebook "must attack"
   * constraint). When true a controlled guard MUST attack whenever it can reach
   * an enemy, may not Defend, and may not wander to stall — it may only approach
   * when no attack is reachable. When false the controlling player plays the
   * guards with NO constraint (move, defend, hold freely), exactly like their
   * own units. Absent on older snapshots — treated as true.
   */
  pvpNeutralControlMustAttack?: boolean;
  /**
   * Individual BINH house-rule toggles. Each id in this map can override its
   * BINH default. Legacy is a hard rulebook preset and ignores the entire map,
   * keeping every house rule off even in old snapshots with stale true flags.
   * See {@link HouseRuleId} / house-rules.ts for the registry and resolver.
   */
  houseRules?: Partial<Record<HouseRuleId, boolean>>;
  /**
   * OPTIONAL parallel-turn mode (multiplayer only): the number of opening
   * rounds every player's turn runs at the same time (0/absent = off — the
   * normal one-at-a-time rotation). During the period players move, end their
   * turns and act independently; exclusive interactions (battles, choices, tile
   * rotations) still resolve one at a time, and shared-deck draws go to whoever
   * acts first. The mode stops early — with a warning to the whole table — the
   * moment a PvP battle starts or a serious PvP interaction (stealing another
   * player's mine/settlement, e.g. a View Earth capture) resolves; it also
   * stops when the period runs out. Play then continues turn-after-turn.
   */
  parallelTurns?: number;
  /**
   * OPTIONAL "Undo moves" mode (default OFF/absent). A DEBUG / manual-testing
   * aid: with it ON, a player may roll the whole game back to the state before
   * a recent action, making bug-hunting far easier. It is NOT a normal-play
   * feature. Undo is handled entirely SERVER-SIDE (a bounded, broadcast-free
   * per-room snapshot stack — see src/server/undo-history.ts): the flag is
   * frozen onto `adventure.undoMoves` at setup so both backends can read it, and
   * an `UNDO_MOVE` action pops+restores one snapshot. With it OFF nothing is
   * recorded and `UNDO_MOVE` is rejected — zero behaviour change.
   */
  undoMoves?: boolean;
  /**
   * OPTIONAL "Manual guard control" mode (default OFF/absent, Game options —
   * like Undo moves). With it ON, the FIGHTER of a Neutral combat (guard
   * fields AND Creature Banks) first RELOCATES the revealed guards in a
   * pre-battle formation window (move/swap within the defender's two rows —
   * shooters kept on the back row — or "Let the AI place them" to return to the
   * rulebook auto-placement), then personally commands each guard through the
   * normal PvP-Neutral-Control unit menu — same must-attack discipline
   * (`pvpNeutralControlMustAttack`, default ON: attack when you can; under
   * polish-wait a guard may WAIT instead, but its Waited re-activation must
   * attack) — or hands any single activation back to the rulebook AI with the
   * "Let the unit act" button. Frozen onto `adventure.manualGuardControl` at
   * setup. PvP Neutral Control (a HUMAN OPPONENT plays the guards) wins when
   * both modes are on; computer-seat fighters keep the plain AI.
   */
  manualGuardControl?: boolean;
  /**
   * First-round hand Mulligan (default ON, Game options). When ON, round 1 allows
   * discarding during the start-of-turn hand step (current normal play; discarded
   * cards return to the bottom of your deck). When OFF, players cannot discard at
   * the beginning of round 1 — keep the opening hand (draw-only if under limit).
   * Frozen onto `adventure.startingHandMulligan` at setup.
   */
  startingHandMulligan?: boolean;
  /**
   * Unit Experience (optional rule, default OFF): army unit cards gain XP from
   * combats won alongside the hero and earn veteran ranks (tier-scaled
   * thresholds, stat bonuses, elite abilities). This lobby toggle is one of
   * three equivalent surfaces — `wog.unitExperience` and `anime.unitExperience`
   * activate the same engine; the effective flag freezes onto
   * `adventure.unitExperience` at setup.
   */
  unitExperience?: boolean;
  /**
   * Whether players may open their own Ⅱ–Ⅲ Far tiles (default ON). When ON each
   * player drafts a personal Far-tile supply they can place onto the map. Off
   * gives no supply at all — use it for scenarios whose map already includes its
   * Ⅱ–Ⅲ tiles, so there is nothing left for players to open.
   */
  farTileOpening?: boolean;
  /**
   * How many NEW Ⅱ–Ⅲ tiles each player may add to the map (their personal
   * face-down supply size). Defaults to the scenario's `farTiles.perPlayer` (2).
   * Set to 0 when a designed map already places its own Ⅱ–Ⅲ tiles and you want
   * players to add none; raise it for a more expansive map. Only takes effect
   * while `farTileOpening` is ON. Clamped to {@link MAX_FAR_TILES_PER_PLAYER}.
   */
  farTilesPerPlayer?: number;
  /**
   * OPTIONAL blind Ⅱ–Ⅲ tile choice (default OFF). With it ON, a player opening
   * a Ⅱ–Ⅲ (Far) tile from their supply first chooses BLINDLY — before seeing
   * any tile — whether they want a tile with a GOLD mine, one with a VALUABLES
   * mine, or no preference; the random draw is then restricted to tiles
   * carrying that landmark (falling back to a plain draw, with a public note,
   * when none is left in the pool). Revealing a face-down Ⅱ–Ⅲ tile already on
   * the map never asks (its identity is fixed). Frozen onto
   * `adventure.farTileBlindChoice` at setup.
   */
  farTileBlindChoice?: boolean;
  /**
   * OPTIONAL Ⅱ–Ⅲ TILE TYPE CHOICE (default OFF). With it ON, the face-down Ⅱ–Ⅲ
   * tile in a player's hand behaves like a hidden tile whose identity they get
   * to name: placing it first asks WHICH KIND of tile they want — a GOLD mine,
   * a CRYSTAL (valuables) mine, a STONE (ore) mine or a SETTLEMENT — and the
   * engine then draws a random tile of that kind from the Ⅱ–Ⅲ pool. Only kinds
   * still present in the pool are offered; with none left the draw is random
   * with a public note. A designed map may narrow the list
   * (`CustomMapPreset.farTileTypeChoices`). Supersedes the older
   * {@link farTileBlindChoice} menu while on. Revealing a face-down Ⅱ–Ⅲ tile
   * already on the map never asks (its identity is fixed). Frozen onto
   * `adventure.farTileTypeChoice` at setup.
   */
  farTileTypeChoice?: boolean;
  difficulty: GameDifficulty;
  startingResources: { gold: number; buildingMaterials: number; valuables: number };
  startingProduction: { gold: number; buildingMaterials: number; valuables: number };
  startingUnitTiers: ("bronze" | "silver" | "gold")[];
  /**
   * Starting army by unit level: one optional few/pack entry per level 1-7.
   * Every player receives their own faction's unit of that level. When set
   * (non-null — may be empty for "no units"), it replaces the tier default.
   */
  startingUnits?: CustomStartingUnit[] | null;
  /** Building ids without the faction prefix (e.g. "city_hall"). */
  startingBuildings: string[];
  /**
   * Designed map (made in the map designer and saved): replaces the
   * scenario's face-down Near/Center layout with the saved tiles. Starting
   * tiles stay fixed by faction and seat.
   */
  customMap?: CustomMapTilePlan[] | null;
  /** Display name of the saved map design the lobby picked. */
  customMapName?: string | null;
  /**
   * Map-only scenario conditions from the designer (resources, army, buildings,
   * timed events, victory preset, notes). Applied when the map is picked and
   * stored on the adventure for timed events. Absent on pure scenario sheets.
   */
  customMapPreset?: CustomMapPreset | null;
};

/** PC unit level (1-7): levels 1-3 are bronze, 4-5 silver, 6-7 gold. */
export type UnitLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * One starting-army entry: a unit level (1-7) and the few or pack side.
 * Each player receives their own faction's unit of that level. Older saved
 * lobbies stored a unit tier or an exact `unitDefId`; the setup still
 * honors those snapshots.
 */
export type CustomStartingUnit = {
  /** Unit level 1-7 (the merged starting-units mode). */
  level?: UnitLevel;
  /** Legacy tier entry from older saved lobbies. */
  tier?: "bronze" | "silver" | "gold";
  side: "few" | "pack";
  /** Legacy exact-unit entry from older saved lobbies. */
  unitDefId?: string;
};

/**
 * Map-only scenario conditions (mission-book style). Structural type for
 * GameSetupOptions / AdventureState; helpers live in `map-preset.ts`.
 */
/**
 * A designer-authored Raid Boss (map preset `raidBosses.bosses`): either a
 * brand-new monster or a stat-tweaked catalog boss (reuse a catalog id to
 * replace it). Stats are per-LAYER; `layers` is the total health-bar count.
 * `abilities` may only name curated implemented ability ids (sanitized).
 */
export type CustomRaidBossDef = {
  id: string;
  name: string;
  attack: number;
  defense: number;
  health: number;
  initiative: number;
  layers: number;
  type?: UnitType;
  abilities?: string[];
};

export type CustomMapPreset = {
  victoryMode?: VictoryMode;
  /**
   * SOLO ONLY: whether computer seats may attack one another. "allied" makes
   * every computer seat one team (heroes may pass through one another and can
   * never open PvP combat); "free-for-all"/absent keeps normal rival AI play.
   * The human is never included in the computer alliance.
   */
  computerDiplomacy?: ComputerDiplomacy;
  /**
   * Map-authored presentation/army theme for all optional PvE encounters.
   * It overrides the mod-window pick only when this designed map is played.
   */
  pveTheme?: PveEncounterTheme;
  /**
   * Map-settings DEFAULTS the designer seeds into the lobby when this map is
   * picked (apply-once: the host may still change each after pick — their edit
   * wins at build). Absent = the lobby keeps its own value (byte-identical to a
   * legacy preset). These three hoist 1:1 onto the same-named `GameSetupOptions`
   * fields via `presetForcedOptionKeys` / `applyCustomMapPresetToOptions` /
   * `revertCustomMapPresetOptions`.
   *   - `difficulty`: default scenario/Neutral difficulty (Field Difficulty Level
   *     Table column + printed starting bonus).
   *   - `farTileOpening`: whether players may open their own Ⅱ–Ⅲ Far tiles.
   *   - `farTilesPerPlayer`: each player's Ⅱ–Ⅲ Far-tile supply size (0–6, clamped
   *     to {@link MAX_FAR_TILES_PER_PLAYER}); only meaningful while opening is on.
   */
  difficulty?: GameDifficulty;
  farTileOpening?: boolean;
  farTilesPerPlayer?: number;
  /**
   * Ⅱ–Ⅲ TILE TYPE CHOICE (optional rule). `farTileTypeChoice` seeds the lobby
   * toggle exactly like `farTileOpening` (apply-once soft default, forced key
   * `farTileTypeChoice`). `farTileTypeChoices` is MAP CONTENT, not a lobby
   * option: it narrows the kinds a player may ask for (e.g. `["valuables",
   * "gold"]` = "crystal or gold"); absent/empty = all four. A non-empty list
   * also IMPLIES the rule for the lobby seed unless `farTileTypeChoice` is
   * explicitly false, so a designer only has to set one control. Sanitized by
   * `sanitizeCustomMapPreset` (unknown entries dropped, deduped, capped at
   * {@link FAR_TILE_TYPES}.length).
   */
  farTileTypeChoice?: boolean;
  farTileTypeChoices?: FarTileType[];
  /**
   * Calamity Waves designer overrides (module `monsterWaves`): `cadence`
   * overrides the lobby wave rhythm for this map; `waves` maps a wave NUMBER
   * (1-based) to an exact guard spec (the {@link CustomGuardSpec} vocabulary)
   * replacing that wave's level-table draw — the designer's "edit the wave
   * monsters" hook. Sanitized by `sanitizeCustomMapPreset` (clamps + the
   * {@link MAX_CUSTOM_WAVE_OVERRIDES} cap).
   */
  monsterWaves?: {
    cadence?: 3 | 4 | 5;
    pressure?: WavePressure;
    defeatLimit?: WaveDefeatLimit;
    waves?: Record<number, CustomGuardSpec>;
  };
  /**
   * Raid Bosses designer content (module `raidBosses`): custom boss
   * definitions — brand-new monsters or stat-tweaked catalog bosses — that
   * REPLACE the built-in catalog pool for this map's scheduled spawn, plus an
   * optional spawn-round override. Ability ids are sanitized against the
   * curated implemented whitelist (`RAID_BOSS_ABILITY_CHOICES`).
   */
  raidBosses?: {
    spawnRound?: number;
    bosses?: CustomRaidBossDef[];
  };
  /**
   * Dungeon campaign direction. The floor wardens may name any built-in boss
   * or a custom boss authored in `raidBosses.bosses`.
   */
  dungeon?: {
    maxFloor?: DungeonDepth;
    descentCost?: DungeonDescentCost;
    floorBosses?: Partial<Record<5 | 10, string>>;
  };
  startingResources?: { gold: number; buildingMaterials: number; valuables: number };
  /** Extra opening resources granted to every computer-controlled seat in
   * SINGLE-PLAYER only. This is explicit scenario pressure (and is surfaced in
   * the briefing), never a hidden global difficulty modifier. Per-enemy extras
   * may also live on a starting tile's `singlePlayer.bonus`. */
  computerStartingBonus?: { gold: number; buildingMaterials: number; valuables: number };
  startingProduction?: { gold: number; buildingMaterials: number; valuables: number };
  startingBuildings?: string[];
  startingUnits?: CustomStartingUnit[];
  startingBonuses?: Array<
    | { kind: "resources"; gold?: number; buildingMaterials?: number; valuables?: number }
    | { kind: "search"; deck: "artifacts" | "spells" | "abilities"; count: number }
    | { kind: "morale"; amount: 1 | -1 }
  >;
  /**
   * One-shot (or multi-entry) events fired at the start of a given round.
   * Mission-book style: designer picks the round AND the effect freely —
   * resource amounts (positive = gain, NEGATIVE = every player LOSES that much,
   * floored at 0), search size/deck, which locations to re-open, morale, bonus
   * movement, hero experience, treasure/resource dice, or a plain announcement.
   *
   * `repeatEveryRounds` (2–10, absent = one-shot) makes the event fire at
   * `round`, then again every N rounds (`round`, `round+N`, `round+2N`, …) for
   * the rest of the game — HoMM3's weekly timed events. Absent is byte-identical
   * to a legacy one-shot.
   */
  timedEvents?: Array<{
    round: number;
    repeatEveryRounds?: number;
    effect:
      | { kind: "resources"; gold?: number; buildingMaterials?: number; valuables?: number }
      | { kind: "experience"; amount: number }
      | { kind: "search"; deck: "artifacts" | "spells" | "abilities"; count: number }
      | {
          kind: "clear_visitable_cubes";
          /** Windmill also clears Prospector; Water Wheel also clears Derrick (Factory). */
          locations: ("windmill" | "water_wheel" | "mystical_garden")[];
        }
      | {
          kind: "clear_tile_cubes";
          /**
           * Re-open every black cube on Tiles of these groups (player-facing
           * bands Ⅰ / Ⅱ–Ⅲ / Ⅳ–Ⅴ / Ⅵ–Ⅶ / Sea / Underground). NEVER touches a
           * Creature Bank (it keeps its defeat cube — hard rule) nor the Grail /
           * Dragon Utopia victory fields (conservative safety).
           */
          groups: ("starting" | "far" | "near" | "center" | "sea" | "subterranean")[];
          /** Skip EVERY field of a Tile that currently contains a Settlement. */
          excludeSettlementTiles?: boolean;
        }
      | { kind: "morale"; amount: 1 | -1 }
      | { kind: "movement"; amount: number }
      | { kind: "treasure_roll"; count: number }
      | { kind: "resource_roll"; count: number }
      /**
       * Open a Trading-Post resource exchange for every live player. On a
       * Resource round this is queued only after automatic income is collected;
       * `tradesOnly` prevents card sales and war-machine purchases.
       */
      | { kind: "market_trade" }
      /**
       * Each live player chooses exactly one reward at round start. Rewards use
       * the same implemented vocabulary as a designer Obelisk bonus.
       */
      | { kind: "choice"; prompt: string; options: CustomMapObeliskBonus[] }
      | { kind: "note"; text: string }
      /**
       * Anime mod §11 — pop a bilingual visual-novel STORY scene for the whole
       * table (every client dismisses independently, never replayed on
       * reconnect). Presentation only: firing it emits a STORY_SCENE_TRIGGERED
       * feed line and changes no rules state. `sceneId` must resolve in
       * `storySceneRegistry` (an unknown id is dropped at sanitize).
       */
      | { kind: "story"; sceneId: string };
  }>;
  /**
   * Map-authored defaults for scenario-wide global rules. Picking the map seeds
   * these into the lobby; the host may still override them before starting.
   */
  houseRules?: Partial<
    Record<"no-secondary-heroes" | "free-neutral-combat-extend", boolean>
  >;
  roundLimit?: number;
  /**
   * MAP-WIDE combat spoils: the winner of a REAL PvP combat (a fought-out loss
   * or a retreat — the branch that records a hero defeat) that beats an enemy
   * Hero gains this many EXTRA gold, on top of the normal 5-gold toll. Applies
   * to Main AND Secondary enemy heroes; a surrender or a sacrificed Secondary
   * Hero grants nothing (no hero is actually defeated). 0 / absent = off. Read
   * directly from `adventure.mapPreset` at the real-defeat branch of
   * finalizeAdventureCombat (like `obelisks`, never hoisted to lobby options).
   */
  heroDefeatGold?: number;
  notes?: string;
  /**
   * Designer-configurable Obelisk role (MAP-WIDE). ABSENT = classic locked-die
   * house rule (today's behaviour, byte-identical — there is deliberately NO
   * "classic" enum value that could drift from absence). Per-Obelisk config is
   * out of scope: face-down random tiles make individual Obelisks unidentifiable
   * at design time. The WINNING-CONDITION role is UNCHANGED in every mode — an
   * Obelisk always registers Holy-Grail dig progress; only the visit reward /
   * behaviour changes (engine: handleObeliskVisit / obeliskPresetRole).
   *   - "monolith": the Obelisk field joins the shared Monolith teleport network
   *     (designer Monolith tokens + every Obelisk); entering/Revisiting teleports.
   *   - "bonus": a fixed designer-chosen reward instead of the locked-die table
   *     (default {@link DEFAULT_OBELISK_BONUS} when `bonus` is unset).
   *   - "victory-only": no reward at all (a quiet note); grail progress still runs.
   */
  obelisks?: {
    role: "monolith" | "bonus" | "victory-only";
    /**
     * The reward for role "bonus". Legacy SINGLE bonus (kept for old presets);
     * `bonuses` below is the multi-award form. When both are absent the role
     * grants {@link DEFAULT_OBELISK_BONUS}.
     */
    bonus?: CustomMapObeliskBonus;
    /**
     * Multiple designer awards for role "bonus". `bonusMode` decides whether the
     * visitor gets them ALL ("all", the default — an AND) or PICKS ONE ("choose"
     * — an OR the visiting player resolves). A single-entry list behaves like the
     * legacy `bonus`.
     */
    bonuses?: CustomMapObeliskBonus[];
    bonusMode?: "all" | "choose";
    /**
     * MAP-WIDE guard fought the first time each player visits ANY Obelisk (a
     * level Ⅰ–Ⅶ, or an exact neutral army). The win flags the Obelisk as usual,
     * so the guard never respawns (`everFlagged`); a later visitor still fights
     * their own first-visit guard. Absent = unguarded (classic behaviour).
     */
    guard?: CustomGuardSpec;
    /**
     * Break-field options (PC "Jebus Cross" style). When set, Pathfinding may
     * NOT walk through the guarded Obelisk — it must be fought to enter. With
     * `persistentGuard`, a lost/retreated fight leaves the living units on the
     * field for a later re-fight (dead units stay dead). With
     * `unlimitedRounds` the fight has no Round limit (bank-style rounds).
     * Absent = classic guarded-or-not behaviour.
     */
    breakField?: boolean;
    persistentGuard?: boolean;
    unlimitedRounds?: boolean;
  };
  /**
   * MAP-WIDE mine options — make mines matter like PC "break" sites. Absent =
   * classic mines (printed difficulty only, no designer guard).
   *   - guard: level Ⅰ–Ⅶ or certain army (incl. random-tier slots)
   *   - breakField / persistentGuard / unlimitedRounds: same semantics as
   *     {@link CustomMapPreset.obelisks}
   */
  mines?: {
    guard?: CustomGuardSpec;
    breakField?: boolean;
    persistentGuard?: boolean;
    unlimitedRounds?: boolean;
  };
  /**
   * MAP-WIDE Random Town customization. Absent = classic Random Town (rolled
   * faction Packs 1 bronze + 2 silver + 2 gold, +10 gold income, +10 gold on
   * first capture).
   *   - guard: certain army (neutral units, `random:<tier>` slots, and/or
   *     `pack:<unitDefId>` faction Packs) OR a level — replaces the default
   *     rolled-faction party when set.
   *   - captureReward: resources granted on FIRST capture (replaces the default
   *     10 gold when set; when absent the classic 10 gold still pays).
   *   - incomeGold: production income while controlling the town (default 10).
   */
  randomTowns?: {
    guard?: CustomGuardSpec;
    captureReward?: { gold?: number; buildingMaterials?: number; valuables?: number };
    incomeGold?: number;
    /**
     * Extra Victory Points per Random Town a player controls (VP mode only),
     * ON TOP of any per-center {@link CustomCenterHexPlan.controlVp}.
     */
    vp?: number;
  };
  /**
   * Designer HEX EVENTS — invisible triggers on chosen board hexes (the PC
   * "Event" map object). Stepping onto the hex fires the event: an optional
   * ambush guard (fought first, stamped as a designed guard the moment it
   * springs), then a message + reward + VP. `mode` "first" fires once for the
   * first player; "each-player" pays every player once (the guard is still
   * beaten once, globally). `replaceVisit` suppresses the field's normal visit
   * on the triggering entry. NEVER rendered on the game map (designer-only
   * markers) and redacted from player views until they spring; capped at
   * {@link MAX_HEX_EVENTS}, sanitised at persistence + setup.
   */
  hexEvents?: CustomHexEvent[];
  /**
   * MAP-WIDE settlement options — to make settlements matter on a scenario.
   * Both optional; absent = classic settlements (unguarded, flat 1 VP).
   *   - guard: a level Ⅰ–Ⅶ or exact army fought the FIRST time a settlement is
   *     flagged (the win flags it, so it never respawns); a later capture from
   *     another player transfers it with no fight, like an unguarded settlement.
   *   - vp: extra Victory Points per settlement a player controls (VP mode only),
   *     ON TOP of the flat 1 VP every flagged mine/settlement already scores.
   * Per-TILE overrides live on {@link CustomMapTilePlan.settlement} (stronger
   * guard / extra VP / hold-to-win on a specific settlement only).
   */
  settlements?: {
    guard?: CustomGuardSpec;
    vp?: number;
  };
  /**
   * Designer-placed one-hex map objects — a flexible list riding the preset (it
   * already flows designer → registry → lobby → setup with sanitisation). LAYOUT
   * lives HERE, on the preset, not on the tile plan: each object carries its own
   * board position, so the tile plan (`customMap`) stays purely about tiles.
   * Materialized at setup after the tiles are laid out. Kinds: teleport tokens
   * (Monolith, Whirlpool) and the four colored two-way Gate pairs; more kinds may
   * be added later, so the model is deliberately open. See {@link CustomMapObject}.
   */
  objects?: CustomMapObject[];
  /**
   * Grail / Dragon Utopia special-effect options (MAP-WIDE). Absent = today's
   * defaults, byte-identical. Each surfaces an EXISTING engine knob to the
   * designer; none invents new math.
   *   - `grailObelisksRequired`: how many visited Obelisks unlock the Holy-Grail
   *     dig (default {@link GRAIL_OBELISKS_REQUIRED}). The engine reads this via
   *     `grailObelisksRequired(state)` with the constant as fallback.
   *   - `utopiaGuards`: the EXISTING {@link DragonUtopiaGuards} modes ("four" =
   *     the full four-dragon party always; "by-difficulty" = trim to the
   *     difficulty-scaled count). Absent falls back to the lobby / default.
   *   - `utopiaBonusSearch`: an EXTRA Artifact-deck Search(N) granted to the
   *     Utopia's defeater ON TOP of the printed reward (1-3). Not granted in
   *     Dragon Hunt (defeating the Utopia wins outright).
   */
  objectives?: {
    /**
     * Editor-authored hidden Grail / Dragon Utopia field package. Face-down
     * center slots which allow both designations are balanced as a group
     * (4 = 2/2; 3 = a seeded-random 2/1 split), while the engine applies the
     * special guards, dig/build/token and Utopia rewards. The legacy Polish
     * house-rule toggle enables the same package without writing this flag.
     */
    hiddenGrailUtopia?: boolean;
    grailObelisksRequired?: 1 | 2 | 3 | 4;
    utopiaGuards?: DragonUtopiaGuards;
    utopiaBonusSearch?: 1 | 2 | 3;
    /**
     * How an EXTRA Grail field converts once a Grail has been TAKEN (dug). The
     * dug field itself never converts (see {@link AdventureState.grailTakenFieldId}).
     *   - "after-dig-utopia": other still-undug Grail fields become Dragon
     *     Utopias with their normal field rewards (`grailConverted`).
     *   - "after-dig-empty": other still-undug Grail fields become empty
     *     (map-maker "no second dig site").
     *   - "always": DEPRECATED ALIAS of "after-dig-utopia" (USER RULE
     *     2026-08-07: "only act like utopia AFTER A GRAIL IS TAKEN"). It used to
     *     make every Grail field fight Utopia dragons from round 1 while still
     *     digging; that pre-dig hybrid is gone. Kept so saved maps still load.
     * Absent = classic (Grail is dig-only; an extra Grail stays a dig site).
     */
    grailAsUtopia?: "always" | "after-dig-utopia" | "after-dig-empty";
    /** Movement points to dig the Grail (0 free / 1 classic / 2 costly). */
    grailDigCost?: 0 | 1 | 2;
    /** One-shot resources granted when the Grail is successfully dug. */
    grailDigReward?: { gold?: number; buildingMaterials?: number; valuables?: number };
    /**
     * Victory Points for possessing the Grail at scoring time (carrier OR the
     * owner of the Town/Settlement where it was built). 0 / absent = no bonus.
     */
    grailPossessionVp?: number;
    /**
     * Where a carried Grail may be BUILT (instead of / in addition to delivering
     * for the Holy-Grail win). Built Grail stays on that location; its
     * controller scores {@link grailPossessionVp}. Absent = build disabled
     * (classic carry-home only).
     */
    grailBuildAt?: "town" | "settlement" | "both" | "starting-town";
    /** Reward granted when a player builds the Grail at a legal site. */
    grailBuildReward?: {
      gold?: number;
      buildingMaterials?: number;
      valuables?: number;
      vp?: number;
      /** Grant one free Building construction in the Town (player picks). */
      freeBuilding?: boolean;
    };
  };
  /**
   * Victory Points mode (rulebook scenario scoring). Absent = OFF (today's
   * behaviour, byte-identical — `roundLimit` stays a mere "suggested length").
   * When `enabled`, the game ENDS at the round limit (`roundLimit` becomes the
   * HARD end trigger) OR the moment any player completes the Scenario's victory
   * condition, and the player with the MOST Victory Points wins (scoring lives in
   * `src/engine/victory-points.ts`).
   *   - `victoryConditionVp` (0-10, default 3): VP the player who COMPLETES the
   *     victory condition earns. Completion no longer wins outright — it ends the
   *     game by SCORING. `last-faction-standing` is the deliberate EXCEPTION (a
   *     table of one live seat is meaningless to score) and stays an instant win.
   *   - `objectives` (cap 4): extra scenario objectives, each worth `vp` (1-10)
   *     to EVERY player meeting it at scoring time. Only engine-checkable kinds
   *     ship — a state read at scoring time (control-towns / flag-mines /
   *     hero-level) or an event-sourced marker on the VP ledger (defeat-dragon-
   *     utopia). `dig-grail` is deliberately NOT a kind: outside Holy-Grail mode
   *     the engine never arms a Grail dig, and inside it digging is already the
   *     victory condition (`victoryConditionVp`).
   */
  victoryPoints?: {
    enabled: true;
    victoryConditionVp?: number;
    objectives?: VictoryPointObjective[];
  };
  /**
   * Designer-authored CUSTOM WIN CONDITIONS ({@link CustomWinCondition}). An
   * ADDITIONAL early-end trigger layered on top of the normal victory mode: the
   * FIRST live player (in turn order) to satisfy ANY listed condition wins
   * immediately (`checkCustomWinConditions` in `adventure.ts`, run from the
   * reducer's post-action tail). Absent = today's behaviour (byte-identical).
   * Capped at {@link import("./map-preset").MAX_CUSTOM_WIN_CONDITIONS}; the lobby
   * can only ADD to this list, never remove a map-authored one.
   */
  customWinConditions?: CustomWinCondition[];
};

/**
 * One designer/lobby-authored CUSTOM WIN CONDITION ({@link
 * CustomMapPreset.customWinConditions}). Every kind is engine-checkable at the
 * reducer tail: a live-state read (control-towns / flag-mines / hero-level /
 * gold / artifacts / buildings) or an event-sourced count — the VP ledger
 * (defeat-heroes reads `mainHeroDefeats.length + secondaryHeroDefeats`;
 * defeat-dragon-utopia reads `utopiaDefeated`) or the per-player Holy-Grail
 * Obelisk-visit tally (obelisks reads `grail.obelisksVisited[player].length`).
 * The metrics ARE the Victory-Points / grail-progress readers (same numbers as
 * VP scoring / the dig unlock — an invariant, never a duplicate). Params are
 * clamped by the sanitiser (`sanitizeCustomWinConditions`, map-preset.ts).
 * `defeat-dragon-utopia` counts distinct cleared Utopia fields (older saves
 * carrying only the legacy boolean count as one). HONEST LIMIT: `obelisks` only accrues in
 * GRAIL victory mode — obelisk visits are recorded per player solely for the
 * grail dig (`recordGrailObeliskVisit`), so the condition is meaningful on a
 * grail map (where it short-circuits the dig+deliver) and is a silent no-op on
 * any other victory mode.
 */
/**
 * Target for {@link CustomWinCondition} `hold-with-grail`: control this place
 * while possessing the Grail for N consecutive full rounds.
 *   - "starting-town": the player's own starting Town
 *   - "settlement": any Settlement they flag
 *   - "random-town": any Random Town they flag
 *   - "random-settlement": a designer Random Settlement (Ⅶ settlement) they flag
 *   - `{ spaceId }`: one specific field the designer picked on the map
 */
export type HoldWithGrailTarget =
  | "starting-town"
  | "settlement"
  | "random-town"
  | "random-settlement"
  | { spaceId: string };

export type CustomWinCondition =
  | { kind: "control-towns"; count: number }
  | { kind: "flag-mines"; count: number }
  | { kind: "hero-level"; level: number }
  | { kind: "gold"; amount: number }
  | { kind: "artifacts"; count: number }
  | { kind: "buildings"; count: number }
  | { kind: "obelisks"; count: number }
  | { kind: "defeat-heroes"; count: number }
  | { kind: "defeat-dragon-utopia"; count?: number }
  | {
      kind: "hold-with-grail";
      /** Consecutive full rounds of continuous control + Grail possession (1–10). */
      rounds: number;
      target: HoldWithGrailTarget;
    };

/**
 * One extra Victory-Points scenario objective ({@link CustomMapPreset.victoryPoints}).
 * Only kinds the engine can actually verify at scoring time ship:
 *  - `control-towns`: own ≥ `count` (1-4) Towns at scoring time.
 *  - `flag-mines`: hold ≥ `count` (1-8) flagged Mines + Settlements at scoring.
 *  - `hero-level`: the player's MAIN hero is level ≥ `level` (2-7) at scoring.
 *  - `defeat-dragon-utopia`: the player has defeated a Dragon Utopia at any point
 *    (event-sourced on {@link VpLedgerEntry.utopiaDefeated}, since a defeated
 *    Utopia otherwise leaves only an owner-less black cube).
 * Each objective is scored for EVERY player who meets it (the event-based one for
 * its recorded player).
 */
export type VictoryPointObjective =
  | { kind: "control-towns"; vp: number; count: number }
  | { kind: "flag-mines"; vp: number; count: number }
  | { kind: "hero-level"; vp: number; level: number }
  | { kind: "defeat-dragon-utopia"; vp: number };

/**
 * Per-player Victory-Points ledger entry — the event-sourced VP components that
 * can ONLY be captured at the instant they happen (a defeated hero leaves no
 * lasting mark, a surrendered one escapes, a defeated Utopia leaves an owner-less
 * cube). Tracked UNCONDITIONALLY at the combat/visit seams (cheap and
 * side-effect-free: nothing reads it unless VP mode is on), so a mid-game preset
 * toggle can never retroactively change a score. Legacy snapshots default to an
 * empty ledger. The AT-SCORING-TIME components (buildings, hero level, flagged
 * mines, controlled towns, artifacts) are computed from live state, never stored.
 */
export type VpLedgerEntry = {
  /** Opponent playerIds whose MAIN hero this player defeated (3 VP each; once per opponent). */
  mainHeroDefeats?: PlayerId[];
  /** Enemy SECONDARY heroes this player defeated in combat (1 VP each). */
  secondaryHeroDefeats?: number;
  /** Enemy heroes that surrendered / escaped from this player (1 VP each). */
  surrenders?: number;
  /** Whether this player has defeated a Dragon Utopia (the defeat-dragon-utopia objective). */
  utopiaDefeated?: boolean;
  /** Distinct Dragon Utopia field ids this player cleared (custom N-Utopia wins). */
  utopiaDefeatedFieldIds?: MapSpaceId[];
  /**
   * Total Victory Points this player earned by capturing designer-designated Ⅶ
   * objective centers (`CustomMapTilePlan.viiFieldVp`). Summed at the capture
   * seam, so a mid-game VP toggle can't rewrite it; scored by
   * `computeVictoryPoints`.
   */
  viiCenterVp?: number;
};

/** A designer-placed one-hex map object's kind. Open for future kinds. */
export type CustomMapObjectKind =
  | "monolith"
  | "whirlpool"
  | "gate"
  /**
   * Outpost objects (STANDALONE only — a separate hex out of every tile,
   * always revealed, connecting the tiles it touches):
   * - "garrison": optionally guarded (bank-style fight); the winner flags it,
   *   and a flagged garrison is defended army-only for 3 gold.
   * - "keymaster_tent": colored (`pair`); optionally guarded; multiple players
   *   may flag it — a tent flag opens same-color Barriers.
   * - "barrier": colored (`pair`); NEVER guarded; only players holding a
   *   matching tent flag may enter.
   */
  | "garrison"
  | "keymaster_tent"
  | "barrier"
  /**
   * One-way monoliths (4 colors via `pair`) — standalone objects OR tile
   * tokens ("out of the map OR in map"), always revealed:
   * - "oneway_entrance": may be guarded (bank-style fight — no Quick Combat,
   *   no experience, no Round limit). Winning (or entering unguarded)
   *   teleports to a same-color EXIT per the entrance's `exitMode`.
   * - "oneway_exit": NEVER guarded; an ordinary walkable field otherwise.
   *   `alwaysPickable` marks it freely choosable in "mix" mode.
   */
  | "oneway_entrance"
  | "oneway_exit"
  /**
   * Creature Bank as a designer single-hex object (STANDALONE only).
   * Requires {@link CustomMapObject.bankId} (one of the 12 Naval Battles banks).
   * Carves a real `creature_bank` field with that bank's army/reward — the
   * fight is the printed bank combat (no Field Difficulty, no XP, black cube
   * on win). Optional {@link CustomMapObject.bankSize} (1–4) pins Polish Bank
   * Sizes Stacked count when that house rule is on. Never carries a designer
   * `guard` or yellow `borderEdges` (a bank is always border-free — does not
   * seal movement or obstruct tile discovery). Break-out seals go on
   * neighbouring tile edges, not the bank hex.
   */
  | "creature_bank";

/** How a one-way entrance picks its same-color exit. */
export type OnewayExitMode = "random" | "certain" | "mix";

/**
 * Where a {@link CustomMapObject} sits on the board:
 * - "tile-slot": REPLACES hex `slot` (0-6, unrotated) of the FACE-UP pinned tile
 *   plan centred at (`row`,`col`), so the slot's legality is known at design
 *   time. A face-down tile cannot host one. LEGACY form: the designer no longer
 *   WRITES tile-slot objects (an on-tile teleporter is now a
 *   {@link CustomMapTilePlan.token} — one canonical form per location), but old
 *   saved presets carrying one still carve exactly as before.
 * - "standalone": a NEW hex materialized OFF every tile at the absolute hex
 *   (`row`,`col`) — the CANONICAL off-tile teleporter form. LAND objects only
 *   (Monolith, Gate — no standalone Whirlpool). Must not fall inside a tile
 *   footprint, must not collide with another object, and should touch ≥1 tile
 *   footprint to be reachable (a detached one is a designer warning; in game it
 *   is simply unreachable, never an error).
 */
export type CustomMapObjectPlacement =
  | { type: "tile-slot"; row: number; col: number; slot: number }
  | { type: "standalone"; row: number; col: number };

/**
 * One designer-placed one-hex map object.
 * - `pair` (gates only): which colored pair (1 = red, 2 = blue, 3 = green, 4 =
 *   yellow) the gate belongs to; entering teleports to the OTHER gate of the pair.
 * - `guard` (any object): a designer guard on the object's hex — a plain number
 *   is the LEGACY level shape (1-7, folded to `{ level }` at sanitize); the
 *   {@link CustomGuardSpec} form adds "certain army" guards. Stepping on opens
 *   the standard neutral battle, and only a WIN resolves the object's teleport;
 *   arriving THROUGH a teleport network onto a still-guarded hex fights it too
 *   (bank-style — the 2026-07-24 rule; only the linked Subterranean-Gate walk
 *   slips past a guard).
 */
export type CustomMapObject = {
  kind: CustomMapObjectKind;
  pair?: 1 | 2 | 3 | 4;
  placement: CustomMapObjectPlacement;
  guard?: number | CustomGuardSpec;
  /**
   * Creature Bank object ONLY — which of the 12 banks this hex hosts
   * (`imp_cache`, `crypt`, …). Required for `kind: "creature_bank"`; stripped
   * from every other kind at sanitize. The engine carves a real bank field
   * with this id (army + reward from {@link CREATURE_BANKS}).
   */
  bankId?: string;
  /**
   * Creature Bank object ONLY — optional fixed Polish Bank Size (1–4 = Ⅰ–Ⅳ).
   * When set AND the `polish-bank-sizes` house rule is on, the bank opens with
   * exactly that many Stacked defenders (normal reward scale). Absent = the
   * ordinary Scenario-Difficulty Stack Token rolls.
   */
  bankSize?: 1 | 2 | 3 | 4;
  /**
   * One-time first-clear reward on the object's hex (resources / dice /
   * Times×Search(X)). Stamped onto the carved field at setup; granted once via
   * the shared designer-reward latch when the visitor first successfully
   * visits (after any guard is cleared). Barriers never keep a reward.
   * Creature Bank objects also skip this (the bank's printed win reward is
   * the only payout — a designer extra would double-pay).
   */
  reward?: CustomFieldReward;
  /** Optional first-clear Victory Points (VP mode only). */
  vp?: number;
  /**
   * Designer yellow border lines on THIS one-hex object — ABSOLUTE directions
   * 0-5 (NE,E,SE,SW,W,NW), each sealing that single hex edge exactly like a
   * tile's per-edge border: movement, discovery and the AI refuse the crossing
   * (only Expert Pathfinding passes). Stamped onto the carved field
   * ({@link MapFieldState.borderEdges}) at setup. Normalised (ints, dedupe,
   * cap 6) at sanitize.
   */
  borderEdges?: number[];
  /**
   * Garrison only: this hex opens adjacent yellow borders. Defaults to true;
   * an explicit false lets a designer build a deliberately sealed outpost.
   */
  garrisonBorderPassage?: boolean;
  /** One-way ENTRANCE only: how the traveller's exit is picked (default "certain"). */
  exitMode?: OnewayExitMode;
  /** One-way EXIT only ("mix" mode): freely choosable BEFORE the roll. */
  alwaysPickable?: boolean;
};

/** The Obelisk-role config block of a {@link CustomMapPreset}. */
export type CustomMapObeliskConfig = NonNullable<CustomMapPreset["obelisks"]>;

/** The MAP-WIDE settlement options block of a {@link CustomMapPreset}. */
export type CustomMapSettlementConfig = NonNullable<CustomMapPreset["settlements"]>;

/** The Grail / Dragon Utopia options block of a {@link CustomMapPreset}. */
export type CustomMapObjectivesConfig = NonNullable<CustomMapPreset["objectives"]>;

/** The MAP-WIDE mine options block of a {@link CustomMapPreset}. */
export type CustomMapMinesConfig = NonNullable<CustomMapPreset["mines"]>;

/** The MAP-WIDE Random Town options block of a {@link CustomMapPreset}. */
export type CustomMapRandomTownsConfig = NonNullable<CustomMapPreset["randomTowns"]>;

/** One designer-chosen Obelisk visit bonus (role "bonus"). */
export type CustomMapObeliskBonus =
  | { kind: "morale"; amount: 1 }
  | { kind: "search"; deck: "artifacts" | "spells" | "abilities"; count: number }
  /**
   * Ability token — Search (1) the Ability deck (a clearer designer-facing
   * alias of `search` with deck "abilities"; engine grants the same step).
   */
  | { kind: "ability_token" }
  | { kind: "resources"; gold?: number; buildingMaterials?: number; valuables?: number }
  | { kind: "movement"; amount: number }
  | { kind: "experience"; amount: number }
  | { kind: "dice"; treasure: number; resource: number }
  /**
   * Roll `count` Resource dice and keep exactly ONE result — the visiting player
   * picks which. Distinct from `dice`, which resolves EVERY rolled die; this is
   * the "roll N, choose 1" gamble. `count` is clamped 2–3 (rolling one and
   * keeping one is a no-op). Emits a single ROLL_RESOURCE_DICE with
   * `resolveCount: 1`, which opens the "Choose one resource die result" pick.
   */
  | { kind: "resource_roll"; count: number };

/**
 * The Obelisk "bonus" role's default reward when the designer leaves it unset —
 * a single positive morale token (the friendliest neutral default). Shared by
 * the engine (handleObeliskVisit fallback) AND the config layer (sanitize /
 * describe / editor) so the default can never drift between them.
 */
export const DEFAULT_OBELISK_BONUS: CustomMapObeliskBonus = { kind: "morale", amount: 1 };

/**
 * One designer HEX EVENT ({@link CustomMapPreset.hexEvents}) — an invisible
 * trigger on a chosen board hex, the PC "Event" map object. Stepping onto the
 * hex springs it: `guard` opens an ambush fight FIRST (stamped as a designed
 * guard the moment it springs — invisible until then); once beaten (or absent)
 * the message / reward / VP pay per `mode`. It never renders on the game map.
 */
export type CustomHexEvent = {
  /** Stable designer id (list rows / removal). */
  id: string;
  /** Absolute board hex the event sits on (standalone placement shape). */
  placement: { row: number; col: number };
  /** Text shown to the triggering player (feed note; ≤240 chars). */
  message?: string;
  /** Reward paid on trigger (resources inline; dice/Searches as visit-steps). */
  reward?: CustomFieldReward;
  /** Victory Points for the triggering player (VP mode; 1-10). */
  vp?: number;
  /** Ambush guard — fought before the reward; beaten once, globally. */
  guard?: CustomGuardSpec;
  /**
   * Monster-hunt objective: defeating this event's guard wins immediately.
   * Requires `guard`; sanitization drops the flag from an unguarded event.
   * Victory-Points mode routes the completion through normal VP scoring.
   */
  winCondition?: boolean;
  /**
   * "first" (default): fires once, for the first player to step on the hex.
   * "each-player": message/reward/VP pay once PER player (guard still once).
   */
  mode?: "first" | "each-player";
  /** Suppress the field's normal visit on the entry that springs the event. */
  replaceVisit?: boolean;
};

/** How many hex events a designed map may carry. */
export const MAX_HEX_EVENTS = 24;

/**
 * Live state of one hex event during a game ({@link AdventureState.hexEvents},
 * keyed by the hex's space id). REDACTED from every player view — clients never
 * see unsprung events ("not shown in the real game"); the engine announces a
 * sprung event through the normal event log instead.
 */
export type HexEventState = {
  event: CustomHexEvent;
  /** Players the message/reward already paid for (mode-aware). */
  firedPlayerIds: PlayerId[];
  /** The ambush guard was stamped onto the field (sprung, maybe unbeaten). */
  guardStamped?: boolean;
  /** The ambush guard was beaten (reward may pay). */
  guardBeaten?: boolean;
};

/**
 * Landmark a face-down "Secret" slot guarantees at game start. The engine
 * draws a random tile from that slot's pool that carries the feature (not a
 * specific tile id) — so "Gold mine" means any Ⅱ–Ⅲ/Ⅳ–Ⅴ/… tile with a gold
 * mine, chosen from the remaining supply when the adventure is built.
 */
export type SecretTileFeature =
  | "gold_mine"
  | "valuables_mine"
  | "materials_mine"
  | "any_mine"
  | "obelisk"
  | "settlement"
  | "town"
  | "objective";

/**
 * One designed map tile.
 * - Face-up + `tileDefId`: places that exact tile, already revealed.
 * - Face-down without `tileDefId` / `secretFeature`: draws randomly from the
 *   group's pool ("down means random").
 * - Face-down + `secretFeature`: draws a random tile FROM THE POOL that has
 *   that landmark (gold mine, obelisk, …) — still face-down until discovery.
 * - Face-down + `tileDefId`: places that exact tile still face-down — a
 *   designer-only exact pin (legacy / advanced). Player views redact
 *   `tileDefId` while face-down. Prefer `secretFeature` for new maps.
 */
export type CustomMapTilePlan = {
  row: number;
  col: number;
  /**
   * Which pool/role the tile fills:
   * - "starting" (Ⅰ): a seat's town — the position of player N's faction
   *   starting tile (the tile art itself comes from the faction, never random).
   * - "far" (Ⅱ–Ⅲ), "near" (Ⅳ–Ⅴ), "center" (Ⅵ–Ⅶ), "sea", "subterranean":
   *   face-down draws a random tile from that supply unless `tileDefId` pins
   *   one or `secretFeature` filters the draw; face-up always places a chosen one.
   */
  group: "starting" | "far" | "near" | "center" | "sea" | "subterranean";
  /**
   * Per-tile UNDERGROUND layer override (map designer): mark a far/near/center/sea
   * tile as topologically on the Underground layer — reachable only through a
   * Subterranean Gate, exactly like a printed cavern — WITHOUT changing its band
   * identity. The tile keeps its group (back art, band numeral, guard tiers,
   * Creature-Bank pile, token legality); only its LAYER flips. Read ONLY through
   * {@link planIsUnderground} / {@link tileLayer} (the one layer seam) — never an
   * inline group check. Kept as literal `true` and only on far/near/center/sea:
   * stripped on `starting` (v1: seat tiles stay Surface, the opening ceremony
   * assumes it) and `subterranean` (redundant — already underground) at both
   * {@link validateCustomMapPlan} and the persistence sanitiser. Absent (every
   * legacy map) = the tile's plain group layer, byte-for-byte as before.
   */
  underground?: boolean;
  faceDown: boolean;
  /**
   * Exact tile to place. Required while face-up (non-starting) unless
   * {@link oneOfTileDefIds} supplies a random-from-list choice instead. Optional
   * while face-down: when set, the tile is predetermined but stays face-down until
   * discovered (exact secret pin). Ignored on starting tiles. Mutually exclusive
   * with `secretFeature` at runtime (exact pin wins if both are present).
   */
  tileDefId?: string;
  /**
   * "One of these tiles" random choice (map designer): instead of a single exact
   * {@link tileDefId}, name a LIST of candidate tile ids and the engine picks ONE
   * at random (seeded by the slot's position) at setup. Works face-UP (a random
   * one is placed revealed) and face-DOWN (a random one is placed, still hidden
   * until discovery — so even the designer cannot tell which it will be). Every id
   * must belong to this slot's group pool. Takes effect only when `tileDefId` is
   * absent (an exact pin always wins); a 0/1-entry list folds away (1 entry ==
   * that exact tile). Ignored on starting tiles. Absent (every legacy map) = the
   * plain exact-or-random behaviour, byte-for-byte as before.
   */
  oneOfTileDefIds?: string[];
  /**
   * Face-down only: guarantee a landmark, not a specific tile. At setup the
   * engine pops a random remaining tile from this slot's pool that carries the
   * feature. Cleared for face-up and pure-random slots.
   */
  secretFeature?: SecretTileFeature;
  /**
   * Face-down only: restrict the random draw to tiles matching ANY of these
   * landmarks — e.g. `["valuables_mine", "gold_mine"]` so the tile lands on
   * valuables OR gold and never rolls stone or a settlement. A single-entry list
   * behaves exactly like `secretFeature`; the two fold together at read time.
   * Cleared for face-up and pure-random slots.
   */
  secretFeatures?: SecretTileFeature[];
  /**
   * Face-down pool filter: the drawn tile must NOT carry ANY of these landmarks
   * (e.g. `["obelisk"]` = "no Obelisk"). Composes with {@link secretFeatures}
   * (include AND NOT exclude). Exact pins / one-of lists ignore this — the
   * designer already named the tile. Absent = no ban (legacy / pure random).
   * Cleared for face-up slots.
   */
  excludeFeatures?: SecretTileFeature[];
  /** Clockwise 60° steps (0-5, default 0). Honoured face-up and face-down. */
  rotation?: number;
  /**
   * Starting (Ⅰ) tiles only: FIX this seat's home-tile orientation. When set, the
   * faction tile is instantiated at the designed {@link rotation} (default 0) and
   * the seat owes NO opening free-rotation — the ceremony prompt never opens for
   * them and the seat-order rotation chain skips them (even mid-chain in a mixed
   * map). Meaningful ONLY on a `starting` plan (like `gateLinks` are cavern-only):
   * stripped on every other group at {@link validateCustomMapPlan} and the
   * persistence sanitiser. BACKWARD COMPATIBILITY: `rotation` is honoured for a
   * starting tile ONLY when this flag is set — an UNLOCKED starting plan (incl. a
   * legacy map that happened to store a `rotation`) keeps the classic rotation-0 +
   * opening-ceremony flow byte-identically.
   */
  lockRotation?: boolean;
  /**
   * Optional SOLO-ONLY deployment for this starting tile. A complete authored
   * deployment has exactly one `human` tile and one or more `computer` tiles;
   * those marked tiles determine the solo seat count and starting locations.
   * Unmarked starting tiles remain available to multiplayer, and this entire
   * block is ignored outside `sessionMode === "single-player"`.
   *
   * A computer tile may add its own opening resource bonus on top of the map's
   * shared `computerStartingBonus`, allowing enemies on the same map to differ.
   *
   * A computer tile may also FORCE that enemy's town type via `factionId`: the
   * matching solo computer seat is locked to that faction (its first hero) at
   * setup instead of rolling a random one. Ignored for a `human` tile (the human
   * always picks their own town). If the forced faction is unavailable (already
   * taken by another seat, or not playable under the current mods) the seat
   * falls back to a normal random pick, so a bad authored value never stalls.
   */
  singlePlayer?: {
    role: "human" | "computer";
    bonus?: { gold: number; buildingMaterials: number; valuables: number };
    factionId?: FactionId;
    /**
     * A computer tile may FIELD a fully custom STARTING ARMY, authored with the
     * same {@link CustomGuardSpec} vocabulary the designer guard editor uses: an
     * exact army of Neutrals / faction Packs / faction Fews (random-tier slots
     * too, honouring `packFaction`), or a Field-Difficulty level (as Neutrals or
     * Packs). Resolved deterministically at setup and REPLACES this AI seat's
     * default faction-tier starting units. Ignored for a `human` tile and outside
     * single-player. Absent = the normal faction start. A spec that resolves to
     * no valid body is ignored (the seat keeps its default), so a bad authored
     * value never blanks out an army.
     */
    army?: CustomGuardSpec;
    /**
     * Veteran EXPERIENCE stamped on every card of {@link army} at setup (0..12).
     * It only BITES when the Unit Experience optional rule is on for the game —
     * with the rule off the field is a no-op fold (see the veterancy section) —
     * so it is exactly "stack exp if the mod is on". Ignored without `army`.
     */
    armyExperience?: number;
  };
  /**
   * Sea tiles only: which guard band this slot belongs to. The Cove sea pool
   * ships both Ⅳ–Ⅴ and Ⅵ–Ⅶ tiles behind one wave back, so the designer offers
   * them as two palette entries — a face-down sea slot then draws only from the
   * matching band. Undefined (older saved maps) means "any sea tile".
   */
  seaBand?: "iv-v" | "vi-vii";
  /**
   * Subterranean tiles only: which guard band this slot belongs to. Like the
   * sea pool, the underground pool mixes a regular Ⅳ–Ⅴ tier (U1–U6, #N4–#N7)
   * with a Ⅵ–Ⅶ boss tier (U7 / #C2 Cyclops Stockpile, #C3 Random Town), so the
   * designer offers them as two palette entries — a face-down underground slot
   * then draws only from the matching band. Undefined (older saved maps) means
   * "any subterranean tile".
   */
  subBand?: "iv-v" | "vi-vii";
  /**
   * On-tile Location Tokens (Monolith / Whirlpool / colored Gate). A tile may
   * host **multiple** tokens as long as each occupies a **different** hex slot
   * (0-6) — never stacked on the same hex. Prefer {@link tokens}; the singular
   * {@link token} is legacy (normalized to a 1-element list at sanitize/setup).
   * On a face-up tile `slot` is the printed field overwritten at setup; on a
   * face-down tile it pins a preferred physical flower hex. Monoliths /
   * same-color Gates / Whirlpools still need ≥2 members map-wide to travel.
   */
  tokens?: CustomMapTileToken[];
  /** @deprecated Prefer {@link tokens}. Kept for old saves; sanitize folds it in. */
  token?: CustomMapTileToken;
  /**
   * GLOBAL Field Override pins on this tile. Multiple allowed when each uses a
   * **distinct** hex slot (no stacking with each other OR with {@link tokens}
   * on the same slot). Prefer {@link fieldOverrides}; singular
   * {@link fieldOverride} is legacy. Auto-ticks Game options → Field Overrides
   * when any pin is present. Distinct from basic teleports (token/gate).
   */
  fieldOverrides?: Array<{ kind: string; slot?: number }>;
  /** @deprecated Prefer {@link fieldOverrides}. Kept for old saves; sanitize folds it in. */
  fieldOverride?: { kind: string; slot?: number };
  /**
   * Designer-chosen Subterranean Gate links — subterranean (cavern) tiles only.
   * Each entry connects THIS cavern to one touching SURFACE tile (named by its
   * plan centre row/col) and optionally pins the exact hex each half sacrifices
   * (absolute board {@link MapSpaceId}, "h:row:col"). Unlike the automatic
   * one-gate-per-tile pairing, a cavern may carry as MANY links as it likes: one
   * to every touching Surface tile, AND the SAME Surface tile several times at
   * distinct boundary pairs (several gates along one shared edge). Where no link
   * is designed the engine's automatic touch pairing applies unchanged (the
   * compatibility default).
   *
   * Pinned hexes are PREFERENCES, honoured at carve time only when legal on the
   * actually-drawn tiles (else the nearest hex wins). Non-touching / dangling
   * links are dropped at {@link validateCustomMapPlan}; a PINNED pair that
   * collides with another accepted link's hex is dropped there too, and an
   * UNPINNED duplicate to a surface already linked unpinned is merged away.
   * Sanitisation caps the count ({@link MAX_DESIGNED_GATE_LINKS}) and drops
   * malformed entries.
   */
  gateLinks?: CustomMapGateLink[];
  /**
   * Designer-placed yellow border lines — ABSOLUTE board directions (0–5 =
   * NE, E, SE, SW, W, NW, the SAME indexing the engine uses for ring slots and
   * {@link TileDefinition.outerImpassable}). Each entry seals the OUTER ARC of
   * whichever ring field ends up facing that absolute direction — all three
   * outward hex edges together, mechanically identical to a printed
   * `outerImpassable` arc but INDEPENDENT of the tile art. Because the frame is
   * absolute, the seal does NOT move when a face-down slot draws its random
   * tile or the player rotates a revealed tile: the designer draws on the board
   * and the border stays put. Legal on ANY tile group — starting, supply, sea,
   * subterranean. Normalised to unique ints 0–5 (dedupe, cap 6) at
   * {@link validateCustomMapPlan} and the persistence sanitiser.
   */
  extraBorders?: number[];
  /**
   * Designer-placed per-EDGE yellow border lines — canonical edge codes
   * (`footprintIndex*6 + absoluteDirection`, 0-41 folded by `canonicalTileEdgeCode`
   * to one of 30 distinct physical edges). Each seals a SINGLE hex edge of the
   * tile's footprint — an outer edge OR an inner one between two of the tile's own
   * fields — drawn freely edge-by-edge in the designer, mechanically identical to
   * a printed line at that edge but INDEPENDENT of the tile art. The frame is
   * board-absolute (rotation-0 footprint), so the seal does NOT move when a
   * face-down slot draws its tile or the tile is rotated. This is the per-edge
   * successor to the whole-arc `extraBorders`; the designer writes only this going
   * forward, folding any legacy `extraBorders` into it on first edit. Legal on ANY
   * tile group. Normalised (dedupe, cap {@link MAX_DESIGNED_BORDER_EDGES} = 30) at
   * {@link validateCustomMapPlan} and the persistence sanitiser.
   */
  borderEdges?: number[];
  /**
   * Center (Ⅵ–Ⅶ) slots ONLY: FORCE this slot's difficulty-7 objective field to a
   * specific location, whatever center tile lands here (exact pin OR random draw,
   * face-up or face-down). Meaningful only on a `center` plan — stripped on every
   * other group (like `lockRotation` is starting-only) at
   * {@link validateCustomMapPlan} and the persistence sanitiser.
   *   - "grail": the Grail dig site (with grail dig bookkeeping — `grailDiggable`
   *     — in a Holy Grail game, exactly like a printed Grail field).
   *   - "dragon_utopia": the Dragon Utopia (guards + reward identical to printed).
   *   - "town": the neutral conquerable Random Town (the printed `random_town`
   *     field; the defending faction is assigned at the fight).
   *   - "settlement": a Random Settlement — a difficulty-7 Settlement that
   *     fights then opens the normal settlement resource/unit choice.
   * The difficulty-7 guard is preserved. If the drawn/pinned tile's printed Ⅶ
   * field ALREADY matches the designation it is a no-op. Every center tile has a
   * difficulty-7 field, so a center designation always applies (invariant pinned
   * in vii-field-designation.test.ts). SECRET on a face-down slot: masked in
   * player views until reveal (see the {@link MapTileState.viiField} it seeds).
   */
  viiField?: ViiFieldDesignation;
  /**
   * Center (Ⅵ–Ⅶ) multi-select of allowed objective kinds (Town / Settlement /
   * Utopia / Grail). When set with 2+ entries the slot draws a random matching
   * designation (or, with {@link playerViiPick}, the discovering player
   * chooses which). A single entry behaves like {@link viiField}. When both
   * are set, `viiFields` wins. Absent = classic single {@link viiField} or
   * the printed objective.
   */
  viiFields?: ViiFieldDesignation[];
  /**
   * When true on a center face-down slot with {@link viiFields} of length ≥ 2,
   * the discovering player picks which objective kind the tile becomes before
   * it materializes. Absent = engine picks randomly among the allowed set.
   */
  playerViiPick?: boolean;
  /**
   * Face-down Far (Ⅱ–Ⅲ) / Near (Ⅳ–Ⅴ) slots: BEFORE the tile is revealed the
   * discovering player chooses Gold mine vs Valuables mine; the engine then
   * draws a random remaining tile from that slot's pool that carries the
   * chosen landmark. Distinct from {@link secretFeatures} (designer-fixed at
   * setup). Absent = no player choice (classic random / secretFeatures draw).
   */
  playerResourcePick?: boolean;
  /**
   * Center (Ⅵ–Ⅶ) slots ONLY: customize this slot's difficulty-7 CENTER HEX —
   * its guard (monster), a one-time first-clear reward, and Victory Points —
   * independently of (and combinable with) the {@link viiField} objective
   * override. Works on the PRINTED objective too: a designer may leave the
   * objective alone and still re-guard it, attach a reward, or score it.
   * Stripped on every non-center group at {@link validateCustomMapPlan} and the
   * persistence sanitiser; masked in player views while the slot is face-down
   * (like `viiField`). This replaces the earlier `viiFieldReward`/`viiFieldVp`
   * fields (persistence folds those legacy saves in).
   */
  centerHex?: CustomCenterHexPlan;
  /**
   * Per-TILE settlement customization — apply a stronger guard, extra VP, and/or
   * a hold-to-win condition to the settlement field(s) on THIS tile only (the
   * map-wide {@link CustomMapPreset.settlements} block remains the default for
   * every other settlement). Meaningful on any group that can host a settlement
   * (far/near/center/…); a tile with no settlement field simply carries the
   * plan inertly until materialize finds nothing to stamp. Sanitised at
   * persistence + setup.
   */
  settlement?: CustomMapSettlementFieldPlan;
  /**
   * SPECIFIC (per-tile) object settings — the tile-scoped twin of the map-wide
   * {@link CustomMapPreset.obelisks} / {@link CustomMapPreset.mines} configs.
   * Each entry customizes every matching location on THIS tile only: guard,
   * first-clear reward, VP, break flags, and an optional "first clear wins"
   * condition. A set field OVERRIDES the map-wide config field-by-field (an
   * unset field falls back to it — same fallback the per-tile settlement plan
   * uses). A tile whose def carries no such location holds the plan inertly.
   * Sanitised at persistence + setup.
   */
  objectPlans?: {
    obelisk?: CustomObjectFieldPlan;
    mine?: CustomObjectFieldPlan;
  };
};

/**
 * A SPECIFIC (per-tile) object customization ({@link CustomMapTilePlan.objectPlans}):
 * guard / first-clear reward / VP / break flags for one object kind on one tile,
 * plus `winCondition` — the first player to clear/flag that object WINS the game
 * immediately (an additional early-end trigger, VP-mode aware like custom win
 * conditions). All arms optional; empty collapses to undefined.
 */
export type CustomObjectFieldPlan = {
  guard?: CustomGuardSpec;
  reward?: CustomFieldReward;
  vp?: number;
  breakField?: boolean;
  persistentGuard?: boolean;
  unlimitedRounds?: boolean;
  /** First player to clear / flag THIS object wins the game immediately. */
  winCondition?: boolean;
};

/**
 * Per-tile settlement customization ({@link CustomMapTilePlan.settlement}).
 * All arms optional; an empty block collapses to undefined.
 *   - guard: overrides the map-wide settlement guard on this tile's settlement
 *     field(s) only (level Ⅰ–Ⅶ or exact army).
 *   - vp: extra Victory Points for controlling THIS settlement (VP mode), on top
 *     of the map-wide settlement VP and the flat 1.
 *   - holdRoundsToWin: hold this settlement continuously for N full rounds
 *     (1–10) to win the game immediately (an additional early-end trigger).
 *   - winCondition: the first player to FLAG this settlement wins immediately
 *     (the instant twin of holdRoundsToWin).
 */
export type CustomMapSettlementFieldPlan = {
  guard?: CustomGuardSpec;
  /**
   * One-time first-flag reward (same shape as a center-hex first-clear bonus:
   * resources / dice / Times×Search(X)). Paid once when the settlement is
   * first successfully flagged.
   */
  reward?: CustomFieldReward;
  vp?: number;
  holdRoundsToWin?: number;
  /**
   * With {@link holdRoundsToWin}: only count continuous hold rounds while the
   * controller possesses the Grail (carried by a hero of theirs, or built on a
   * field they control). Shortens Grail scenarios without auto-winning on dig.
   */
  holdRequiresGrail?: boolean;
  winCondition?: boolean;
};

/**
 * A designer guard on a single hex — the "monster" of a customized center hex,
 * map object or Location Token. Exactly one arm is meaningful:
 *   - `level` (1-7): Field-Difficulty composition from {@link NEUTRAL_ARMY_TABLE}.
 *     Quick Combat / experience follow the level as usual.
 *     {@link levelArmy} chooses HOW those bodies mint:
 *       • `"neutral"` / absent — classic Neutral deck draws (legacy)
 *       • `"packs"` — real faction Pack units of those tiers (level guard as units)
 *   - `units`: a CERTAIN ARMY — up to {@link MAX_CUSTOM_GUARD_UNITS} entries,
 *     each one of:
 *       • a Neutral unit def id (classic certain army),
 *       • `random:bronze|silver|gold|azure` — roll a random Neutral of that
 *         tier at fight time (seeded),
 *       • `random-pack:bronze|silver|gold|azure` — roll a random faction Pack
 *         of that tier at fight time (seeded),
 *       • `pack:<unitDefId>` — a named faction Pack side (Random Town armies).
 *     Minted Creature-Bank style (never deck-drawn). Never Quick-Combat skipped;
 *     experience uses difficulty derived from the army's tiers.
 *   - `packFaction`: every Pack / random-pack / level-as-packs body shares one
 *     faction — a concrete {@link FactionId}, or `"random"` (roll once per fight).
 *     Neutral / `random:` slots ignore it. Absent = free mix (legacy).
 * Sanitisers keep exactly one arm (`units` wins) and clamp both.
 */
export type CustomGuardSpec = {
  level?: number;
  /** How a level arm mints bodies. Absent = `"neutral"` (legacy). */
  levelArmy?: "neutral" | "packs";
  units?: string[];
  packFaction?: FactionId | "random";
};

/** How many exact units a {@link CustomGuardSpec.units} army may field. */
export const MAX_CUSTOM_GUARD_UNITS = 6;

/**
 * One on-tile Location Token (Monolith / Whirlpool / colored Gate) on a
 * {@link CustomMapTilePlan}. On a face-up tile `slot` is the printed field
 * overwritten at setup; on a face-down tile it pins a preferred physical
 * flower hex. `pair` (1-4) is required for a gate, absent otherwise.
 * `guard` puts a designer guard on the carved token hex — stepping on fights
 * it (a normal guard fight: Quick Combat / experience follow the level; an
 * exact army is never skipped), and only a WIN resolves the teleport.
 * Arriving THROUGH the network onto a still-guarded token FIGHTS it too, bank-
 * style (the 2026-07-24 rule; only the linked Subterranean-Gate walk slips past
 * a guard, and even then the guard is left standing).
 */
export type CustomMapTileToken = {
  kind: "monolith" | "whirlpool" | "gate" | "oneway_entrance" | "oneway_exit";
  pair?: 1 | 2 | 3 | 4;
  slot?: number;
  guard?: CustomGuardSpec;
  /**
   * One-time first-clear reward on the carved token hex (same shape as a
   * center-hex reward). Granted once after the guard is cleared / on a peaceful
   * visit; latched on the field so it never re-pays.
   */
  reward?: CustomFieldReward;
  /** Optional first-clear Victory Points (VP mode only). */
  vp?: number;
  /** One-way ENTRANCE token only: how the exit is picked (default "certain"). */
  exitMode?: OnewayExitMode;
  /** One-way EXIT token only ("mix" mode): freely choosable BEFORE the roll. */
  alwaysPickable?: boolean;
};

/**
 * A designer-set one-time field reward — used on center hexes, standalone map
 * objects, tile tokens, per-tile settlements, and hex events. Granted to the
 * player who FIRST clears / successfully visits the hex (hex-event mode may
 * pay each player once). Resources are granted inline; dice, deck Searches,
 * morale, movement, XP, Ability Empower tokens and Statistic empower menus
 * resolve through the visit-step pipeline.
 *
 * Search rewards are **Times × Search(X)**: `searchArtifact: 5` with
 * `searchArtifactTimes: 2` queues two separate Search(5) Artifact steps.
 * Absent times (or times 1) is byte-identical to a single Search of size X.
 * Amounts are clamped by the sanitiser ({@link sanitizeCenterHexPlan} /
 * {@link sanitizeFieldReward}).
 *
 * Special arms (all optional, additive with resources/searches):
 *  - `morale` ±1 — same GAIN_MORALE pipeline as Temples / timed events
 *  - `abilityEmpowerToken` — grant one Ability Empower token (max 1; designer
 *    always grants, even when the bank house rule is off)
 *  - `empowerStatistic` — free one-shot Statistic empower menu (hand+discard)
 *  - `experience` / `movement` / `resourceDice` — XP, MP, Resource-die rolls
 */
export type CustomFieldReward = {
  gold?: number;
  buildingMaterials?: number;
  valuables?: number;
  /** Roll N Treasure dice (1-3). */
  treasureDice?: number;
  /** Search (X) of the shared Spell deck (1-5). */
  searchSpell?: number;
  /** Search (X) of the shared Ability deck (1-5). */
  searchAbility?: number;
  /** Search (X) of the shared Artifact deck (1-5). */
  searchArtifact?: number;
  /**
   * How many separate Search(X) steps for that deck (1–5). Only kept when the
   * matching search* size is set; absent / 1 = one Search (legacy default).
   */
  searchSpellTimes?: number;
  searchAbilityTimes?: number;
  searchArtifactTimes?: number;
  /** ±1 morale (token mode or Morale Cards). */
  morale?: 1 | -1;
  /**
   * Grant one Ability Empower token (cap 1; surplus auto-uses on a hand Ability
   * when already holding one). Designer grants ignore the bank house rule.
   */
  abilityEmpowerToken?: true;
  /**
   * Open a free Statistic-empower menu once (hand + discard): remove a plain
   * Statistic, gain its Empowered form into hand (Astrologers Dancing Imp arm).
   */
  empowerStatistic?: true;
  /** Main-hero experience (1–5). */
  experience?: number;
  /** Movement points on the visiting / main hero (1–3). */
  movement?: number;
  /** Roll N Resource dice (1–3). */
  resourceDice?: number;
};

/**
 * @deprecated Alias of {@link CustomFieldReward} — kept so existing imports and
 * center-hex field names stay stable.
 */
export type CustomCenterHexReward = CustomFieldReward;

/**
 * A center (Ⅵ–Ⅶ) slot's designer customization ({@link CustomMapTilePlan.centerHex}):
 * override the Ⅶ field's guard, attach a first-clear reward, award Victory
 * Points — each optional and independent. Carried onto the placed instance
 * ({@link MapTileState.centerHex}, masked while face-down) and folded onto the
 * difficulty-7 objective field when the tile materializes.
 */
export type CustomCenterHexPlan = {
  /** Replace the printed difficulty-7 guard with a level or a certain army. */
  guard?: CustomGuardSpec;
  /** One-time bonus for whoever first clears / captures the objective. */
  reward?: CustomFieldReward;
  /** Victory Points for the first clearer (scored in VP mode; 1-10). */
  vp?: number;
  /**
   * Continuous control Victory Points while the player holds THIS Random Town /
   * Random Settlement (or any center objective that ends up flaggable). Scored
   * in VP mode ON TOP of first-clear {@link vp}. 1–10.
   */
  controlVp?: number;
  /**
   * Hold THIS objective continuously for N full rounds (1–10) to win immediately
   * (works for Random Town / Random Settlement centers). Optional
   * {@link holdRequiresGrail} gates the tick on Grail possession.
   */
  holdRoundsToWin?: number;
  /** With {@link holdRoundsToWin}: only count rounds while possessing the Grail. */
  holdRequiresGrail?: boolean;
  /** First player to clear / capture THIS objective wins the game immediately. */
  winCondition?: boolean;
};

/**
 * @deprecated Legacy shape of the pre-centerHex `viiFieldReward` (kept only so
 * mid-game snapshots and saved maps from that build keep working — persistence
 * folds it into {@link CustomCenterHexPlan.reward}).
 */
export type ViiFieldReward = { gold?: number; buildingMaterials?: number; valuables?: number };

/**
 * One designer-committed Subterranean Gate link on a cavern tile: which Surface
 * tile it connects to (by plan centre) and, optionally, the exact hex each half
 * sacrifices. See {@link CustomMapTilePlan.gateLinks}.
 */
export type CustomMapGateLink = {
  /** Plan centre (row/col) of the linked Surface tile. */
  surface: { row: number; col: number };
  /** Pinned Surface-half ("gate down") hex — absolute id. Omit for the nearest. */
  gateHex?: MapSpaceId;
  /** Pinned cavern-half ("path up") hex — absolute id. Omit for the nearest adjacent. */
  entranceHex?: MapSpaceId;
  /**
   * Designer guard on the SURFACE half ("gate down"): stepping onto the gate
   * hex fights it first; crossing INTO it from the linked cavern half instead
   * SLIPS PAST it (no Combat, no experience, no visit) — you fight to get in,
   * never to get out. The pass is per-travel: the guard STAYS on the field, so
   * the same hero stepping off and back on, or anyone else walking in, fights.
   */
  gateGuard?: CustomGuardSpec;
  /** Designer guard on the CAVERN half ("path up") — same rules as {@link gateGuard}. */
  entranceGuard?: CustomGuardSpec;
};

/**
 * The four pre-game setup formats (the "Draft & random" selector):
 *  - "open"          TYPE 4 — free pick: any untaken town + any of its heroes.
 *  - "draft"         TYPE 1 — pick a town from a rolled pair (or select one
 *                    directly), then a turn-order ban phase on opponents' heroes,
 *                    then each seat picks its own (non-banned) hero.
 *  - "random"        TYPE 2 — town AND hero rolled at random for every seat.
 *  - "random-choice" TYPE 3 — pick a town from a rolled pair, then pick a hero
 *                    from a rolled pair of that town's heroes.
 */
export type DraftFormat = "open" | "draft" | "random" | "random-choice";

/**
 * Lobby draft controls (the "Draft & random" tab). `format` selects the flow;
 * the rest is that flow's live state. In the "draft" format every id in
 * `bannedHeroDefIds` is removed from the pool — nobody, manual or random, may
 * take it — and `banPicksMade` tracks the round-robin ban turn. `seatRolls`
 * holds each seat's pending two-way town/hero choices for the formats that roll.
 */
export type GameSetupDraft = {
  format: DraftFormat;
  /** Hero def ids banned out of the pool (the "draft" format). Unpickable by anyone. */
  bannedHeroDefIds: string[];
  /**
   * "draft" ban phase progress: how many bans have been committed. Bans go around
   * the table in seat (turn) order; each seat bans 2 heroes in a 2-player game,
   * otherwise 1. The phase ends once this reaches `banBudgetPerSeat * seats`.
   */
  banPicksMade?: number;
  /**
   * Per-seat pending roll choices: the two rolled town options ("draft" /
   * "random-choice") and the two rolled hero options ("random-choice") the seat
   * must pick from. Cleared once the seat locks that step.
   */
  seatRolls?: Record<PlayerId, { townOptions?: FactionId[]; heroOptions?: string[] }>;
};

/**
 * The pre-start "ready check" (multiplayer hosted tables only). Pressing
 * "Start the adventure" no longer builds the map immediately: it opens this
 * check, and the map is built only once EVERY seated player has confirmed. If
 * any seat presses Cancel, or the 30-second window elapses before everyone has
 * confirmed (a seat went AFK), the check is aborted and the table drops back to
 * setup. Present only while a check is open; null/absent otherwise.
 */
export type StartCheckState = {
  /** The seat that pressed Start (implicitly the first confirmation). */
  startedByPlayerId: PlayerId;
  /** Server wall-clock ms when the check opened. */
  startedAt: number;
  /** Server wall-clock ms after which an incomplete check auto-aborts. */
  deadline: number;
  /** Seats that have confirmed so far. The check completes once every seated player is here. */
  confirmations: PlayerId[];
};

/** Pre-game lobby: players pick factions and heroes before the map builds. */
export type GameSetupState = {
  scenarioId: string;
  options: GameSetupOptions;
  seats: {
    playerId: PlayerId;
    name: string;
    factionId: FactionId | null;
    heroDefId: string | null;
  }[];
  /**
   * Draft controls (ban-pick + random assignment). Optional so lobby snapshots
   * saved before this feature still load; treated as `{ mode: "open", bans: [] }`.
   */
  draft?: GameSetupDraft;
  /**
   * The open pre-start ready check (all seated players must confirm within the
   * window). Absent until a player presses Start on a multiplayer hosted table;
   * cleared on completion, cancel or timeout. See {@link StartCheckState}.
   */
  startCheck?: StartCheckState | null;
};

/** One unit pick in the Battle Test free-setup army builder. */
export type CombatSandboxUnitPick = {
  unitDefId: string;
  side: "few" | "pack" | "neutral";
};

/** One seat's free-setup choices in a Battle Test arena (before Begin). */
export type CombatSandboxSeatConfig = {
  playerId: PlayerId;
  name: string;
  factionId: FactionId;
  heroDefId: string;
  /** Hero level 1–7 (hand limit + crowns). Default 5. */
  heroLevel: number;
  units: CombatSandboxUnitPick[];
  hand: CardId[];
  deck: CardId[];
  /** Numeric morale token (−1 / 0 / +1) when morale cards are off. */
  morale: number;
  /** Held morale cards when the Morale Cards rule is on. */
  moraleCards?: { positive: CardId[]; negative: CardId[] };
  /** WOG commander grades (0–3 each) when Commanders is on. */
  commanderGrades?: Partial<Record<CommanderStatKey, number>>;
  commanderGradePoints?: number;
};

/**
 * Battle Test free-setup lobby: both seats, battlefield, morale and WOG options.
 * Present only while phase is "setup"; cleared when Begin materialises the fight.
 */
/**
 * Battle Test play mode chosen before Begin:
 *  - "binh": house-rule edition (split decks, BINH unit/stat tweaks).
 *  - "tournament": competitive preset (legacy decks + Diplomacy/Hourglass bans).
 */
export type CombatSandboxPlayMode = "binh" | "tournament";

export type CombatSandboxSetupState = {
  seats: Record<PlayerId, CombatSandboxSeatConfig>;
  /** Forced board art, or "random" (currently resolves to classic). */
  boardArtId: CombatBoardArtId | "random";
  /** Obstacle cells on the 0–19 board (middle-row blockers by default). */
  obstacles: number[];
  /** Optional Morale Cards rule (draws from morale decks instead of ±1 tokens). */
  moraleCards: boolean;
  /** Wake of Gods modules (commanders etc.). */
  wog: WogModOptions;
  /**
   * Rules preset for the fight (BINH vs Tournament). Defaults to "binh" when
   * absent on legacy snapshots so older Battle Test rooms keep working.
   */
  playMode?: CombatSandboxPlayMode;
};

export type TownState = {
  id: TownId;
  controllerId: PlayerId;
  buildings: string[];
  factionId?: FactionId;
  /** Map field the town occupies in adventure mode. */
  fieldId?: MapSpaceId;
  /**
   * Faction cubes stored on cube buildings (Brimstone Stormclouds, Cage of
   * Warlords), keyed by building id. Gained on build and on the building's
   * round trigger, spent during combat.
   */
  factionCubes?: Record<string, number>;
};

export type HeroState = {
  id: HeroId;
  controllerId: PlayerId;
  kind: "main" | "secondary";
  heroDefId?: string;
  level: number;
  /** Experience steps within the level track (2 per level). */
  experience: number;
  movementPoints: number;
  movementPointsMax: number;
  spaceId: MapSpaceId | null;
  /**
   * Set when the hero takes a step touching a sea field without Water Walk —
   * wading in (land→sea), wading out (sea→land), or moving within the sea: their
   * movement is over for the turn (they cannot take another step), even though
   * their remaining movement points are kept so a neutral combat on a sea field
   * can still spend them. Cleared when movement refreshes. Water Walk never sets
   * it (the hero keeps moving across the sea).
   */
  movementHaltedThisTurn?: boolean;
  /**
   * Watering Hole (Factory): set when the hero visits the field this turn.
   * Cleared and spent as +1 movement at the start of the owner's next turn.
   */
  wateringHoleBonusPending?: boolean;
  /**
   * Anime Cultivation (anime.cultivation, §5.6): the hero's Cultivation Realm —
   * 0 Qi Refinement (Luyện khí) / 1 Foundation (Trúc cơ) / 2 Core Formation
   * (Kim đan) / 3 Nascent Soul (Nguyên anh). Optional and lazily stamped (set
   * only when it advances past 0), so a module-off table and every legacy
   * snapshot never carry it — absent === realm 0. Only ever written on a MAIN
   * hero; every grant reads it through the player's main hero (cultivationRealmOf
   * in anime-cultivation.ts). PUBLIC (player-view never strips hero fields).
   */
  cultivationRealm?: 0 | 1 | 2 | 3;
  /**
   * Anime Cultivation: set once this hero WINS a Heavenly Tribulation (the realm
   * 2 → 3 gauntlet). Optional/hero-scoped; gates the once-ever Nascent Soul
   * breakthrough so a failed attempt can retry but a won one never repeats.
   */
  tribulationWon?: boolean;
  /**
   * Anime Cultivation: the game round in which this hero last ATTEMPTED a
   * Heavenly Tribulation. Gates the offer to once per own turn (one turn per
   * player per round, so `=== state.round` means "already tried this turn").
   * Absent === never attempted.
   */
  tribulationAttemptedRound?: number;
  /**
   * Anime Cultivation × Trial Tower (`anime.thi_luyen_thap`): a banked "one
   * fewer die" relief for this hero's NEXT Heavenly Tribulation. Granted by the
   * Trial Tower's 3rd win when `anime.cultivation` is on (a xianxia cross-object
   * boon); consumed (reset to 0) on the next Tribulation attempt, which then
   * rolls `max(1, 3 − relief)` dice instead of 3. Optional/lazily stamped —
   * absent === no relief, so a module-off table never carries it.
   */
  nextTribulationDiceRelief?: number;
  /**
   * Anime Hero Grades (anime.heroGrades, §3.11): accumulated Merit (grade
   * progress). Crossing a threshold (3 / 7 / 12) auto-grades the hero up and
   * awards one grade point. Optional and lazily stamped (absent === 0 Merit),
   * so a module-off table and every legacy snapshot never carry it. Written only
   * on a MAIN hero; every grant reads it through the player's main hero
   * (heroGradeOf in anime-hero-grades.ts). PUBLIC (player-view never strips it).
   */
  gradeProgress?: number;
  /**
   * Anime Hero Grades: the hero's current grade — 0 up to the data-defined cap
   * (HERO_GRADE_MAX = threshold array length; 3 as shipped). Optional/lazily
   * stamped (absent === grade 0). Gates which tree tiers may be picked.
   * Independent of {@link cultivationRealm} (both tracks coexist). Typed `number`
   * so adding a tier is a pure data change.
   */
  grade?: number;
  /**
   * Anime Hero Grades: unspent grade points (one per grade-up). Spent by
   * HERO_GRADE_PICK to pick one tree node per unlocked tier. Absent === 0.
   */
  gradePoints?: number;
  /**
   * Anime Hero Grades: the tree node ids this hero has picked (at most one per
   * tier). Read by every passive/skill grant. Absent === none picked.
   */
  gradeNodes?: string[];
  /**
   * Anime Hero Grades: the game round in which this hero last used the
   * HERO_TRAIN map action ("once per your turn"). `=== state.round` means
   * already trained this turn. Absent === never trained.
   */
  heroTrainedRound?: number;
  /** Overflowing Insight: game round whose start-turn refresh already drew its extra card. */
  heroGradeOverdrawRound?: number;
  /**
   * Anime Equipment (§3.13): the always-on items this MAIN hero has bought,
   * keyed by slot (weapon/armor/accessory/mount) → equipment id. Optional and
   * lazily stamped (absent === nothing equipped), so a module-off table and every
   * legacy snapshot (incl. 3-slot heroes with no mount) never carry it. PUBLIC
   * (player-view never strips it). Buying into an occupied slot overwrites
   * (swap prior gear to the bag, no refund).
   */
  equipment?: Partial<Record<AnimeEquipmentSlot, string>>;
  /**
   * Owned but currently unequipped items. Bought gear is never a decorative
   * catalog entry: replacing or removing a slotted item moves it here, and the
   * equipment window can equip it again through an engine-validated action.
   * Optional/lazy for compatibility with every existing snapshot.
   */
  equipmentInventory?: string[];
};

export type AttackRollCandidate = {
  rolls: number[];
  roll: number;
  /**
   * Every die rolled contributes to `roll` (the faces are summed/counted) rather
   * than one selected face — Slayer (count the "+1"s) and the Neutral Champions'
   * "apply both" roll. The dice overlay then shows all dice lit, never dimming
   * the "unused" ones the way it does for an advantage/disadvantage keep-one roll.
   */
  sumAllDice?: boolean;
  /**
   * Morale/artifact/spell adjustments that visibly changed this candidate's
   * dice, carried onto the ATTACK_ROLLED event as `rollModifiers` so the dice
   * overlay can explain the change. Display-only bookkeeping — `rolls`/`roll`
   * already reflect every adjustment.
   */
  modifierNotes?: AttackRollModifierNote[];
  /**
   * Dice this candidate FORCE-REROLLED after the throw — Hourglass of the Evil
   * Hour's `REROLL_ENEMY_PLUS_ONE` curse and the Negative-Morale
   * `reroll_plus_one` card each reroll every "+1" once. Each entry names the die
   * index, the "+1" it showed (`from`) and the face it landed on (`to`). Carried
   * onto ATTACK_ROLLED so the dice overlay can REPLAY the reroll (show the "+1",
   * then re-tumble the die to the kept face). Display-only — `rolls`/`roll`
   * already hold the final faces.
   */
  rerollBeats?: AttackDieRerollBeat[];
};

/** One morale/artifact/spell adjustment that visibly changed an Attack roll. */
export type AttackRollModifierNote = {
  /** What changed the roll (card/ability name, e.g. "Negative Morale"). */
  source: string;
  /** Plain-words description of the change (e.g. "−1 to this Attack roll"). */
  text: string;
};

/**
 * One forced attack-die reroll, so the dice overlay can replay it: the die at
 * `index` showed `from` (a "+1"), was rerolled once, and landed on `to`.
 */
export type AttackDieRerollBeat = {
  /** Position of the die in the roll's `rolls` array. */
  index: number;
  /** The face the die showed before the forced reroll (always a "+1"). */
  from: number;
  /** The face the die landed on after the reroll (already reflected in `rolls`). */
  to: number;
};

/**
 * An ability's own dice throw (Death Stare, the Thunderbird/Wyvern extra die…)
 * as carried on its UNIT_ABILITY_TRIGGERED event, so the client can show the
 * roll with the same tumbling-dice overlay an attack roll gets.
 */
export type AbilityDiceRoll = {
  /** The faces rolled, in throw order (all of them count — none dim). */
  rolls: number[];
  /** Whether the printed effect landed on this throw. */
  success: boolean;
  /** Overlay heading (the ability's name, e.g. "Death Stare"). */
  label: string;
  /** Outcome read-out under the dice (e.g. "Silver Pegasi are destroyed!"). */
  caption: string;
  /**
   * Morale adjustments that visibly changed this ability roll (the forced
   * "+1" reroll, a die set to −1, one die less thrown, a window reroll/set) —
   * shown as chips under the dice, exactly like an attack roll's.
   */
  modifiers?: AttackRollModifierNote[];
};

/**
 * Marks an ATTACK_DIE_REROLL window that rerolls an ABILITY's own dice (Death
 * Stare, the Thunderbird/Wyvern extra die, extra-die Paralysis, the Ghost
 * Dragon knock-back) instead of an attack roll. The attack's stack item is
 * already resolved by the time these dice roll, so the window resumes the
 * post-attack follow-up tail (runPostAttackFollowUps) rather than the stack.
 */
export type PendingAbilityRollContext = {
  kind: "attack-die-damage" | "death-stare" | "paralysis-extra" | "knockback";
  abilityId: string;
  abilityName: string;
  /** Dice thrown per (re)roll — after any "roll 1 die less" reduction. */
  diceCount: number;
  /** Success window: the effect lands when EVERY die falls in [minRoll, maxRoll]. */
  minRoll: number;
  maxRoll: number;
  /** Where the post-attack follow-up tail picks back up once the roll is kept. */
  resume: {
    attackerId: UnitId;
    defenderId: UnitId;
    attackKind: "melee" | "ranged";
    /** The resolved attack die (some later follow-ups read it). */
    attackRoll: number;
    /** Tarnum (Fortress) Basilisks VI: die-gated follow-ups fire regardless. */
    forceAbilityRoll: boolean;
    /** The tail step this roll belongs to (the tail continues at fromStep + 1). */
    fromStep: number;
    /** This roll's index within its step's follow-up list. */
    followUpIndex: number;
  };
};

export type AttackRerollSource = {
  /** Display name shown to the player (unit ability, Fortune, Luck, …). */
  name: string;
  /** Backing active effect; unit-ability rerolls have none. */
  effectId?: string;
  /** Positive morale token: spending the reroll discards the token. */
  morale?: boolean;
  /**
   * Anime Cultivation Core Formation (realm 2, §5.6): the one free per-combat
   * Attack-die reroll. Using it sets combatStats.cultivationRerollUsed so the
   * source drops out for the rest of this combat.
   */
  cultivation?: boolean;
  /** Standing equipment die power; reducer records the matching use scope when spent. */
  equipmentId?: string;
  equipmentUseScope?: "round" | "combat";
  /** Positive Morale card variant: using the reroll returns this card to the bottom of its deck. */
  moraleCardId?: CardId;
  /**
   * Held reroll artifact (Diplomat's Ring / Ambassador's Sash): taking the
   * reroll plays the card, discarding it from the owner's hand.
   */
  cardId?: CardId;
  /**
   * Printed face gate (Crusaders 'every "0"', neutral Minotaurs '-1'): the
   * source is only usable while the current roll shows this face. It is a WHEN
   * gate ONLY — using it still spends one `remaining`, because these are all
   * "[unit_attack]" icon abilities and such an ability activates ONCE PER
   * ATTACK. Rerolling a "-1" into another "-1" therefore ends the offer.
   */
  onlyOnRoll?: number;
  /**
   * Positive Morale "set one of the dice to the +1 side": this source SETS one
   * die of the current candidate to the face instead of rerolling. Spent only
   * via the explicit set-die action, never by a plain reroll.
   */
  setDieFace?: number;
  /**
   * Polish Balance Pack Cards of Prophecy (option B): "roll it 3 times and
   * resolve 1 chosen result." Spending this source appends THIS MANY fresh
   * candidates at once (2) and unlocks a free pick among every candidate in the
   * window (`freeCandidateChoice`) instead of the rulebook's "only the latest
   * roll counts".
   */
  rollExtraCandidates?: number;
  remaining: number;
  used: number;
};

export type PendingChoice =
  | {
      id: string;
      type: "ATTACK_DIE_REROLL";
      playerId: PlayerId;
      stackItemId: string;
      attackerId: UnitId;
      defenderId: UnitId;
      isRetaliation: boolean;
      attackKind: "melee" | "ranged";
      rollMode: AttackRollMode;
      attackBonus: number;
      defenseBonus: number;
      candidates: AttackRollCandidate[];
      remainingRerolls: number;
      /**
       * Polish Balance Pack Cards of Prophecy: once its "roll it 3 times"
       * source has been spent in this window the owner may keep ANY candidate,
       * not only the latest — the printed "resolve 1 chosen result".
       */
      freeCandidateChoice?: boolean;
      /** Reroll pools in spend order — Luck is always sorted last. */
      rerollSources: AttackRerollSource[];
      sourceEffectIds: string[];
      /**
       * Present when this window rerolls an ABILITY's own dice (Death Stare…)
       * rather than an attack roll: `stackItemId` is then empty and the keep
       * resumes the post-attack follow-up tail instead of the attack stack.
       */
      abilityRoll?: PendingAbilityRollContext;
    }
  | {
      id: string;
      type: "DECK_SEARCH";
      playerId: PlayerId;
      deckId: DeckId;
      /** Cards lifted off the top of the deck; only the searcher may see them. */
      revealedCardIds: CardId[];
      /**
       * The Search (X) this reveal was invoked with, before per-player count
       * effects — the X a "perform the Search (X) again" morale/Pendant repeat
       * re-runs.
       */
      baseCount?: number;
      /** Tarnum (Conflux) I: each revealed card may be Removed instead of kept. */
      allowRemove?: boolean;
      returnPhase: GamePhase;
    }
  | {
      /**
       * Tarnum (Conflux) VI: "Search(1) Spell twice." Each step the caster picks
       * ONE Spell deck (basic or expert) to Search 1 card from; the taken card is
       * flagged for a free over-limit cast. `remaining` counts the searches left.
       */
      id: string;
      type: "TARNUM_SEARCH";
      playerId: PlayerId;
      remaining: number;
      returnPhase: GamePhase;
    }
  | {
      id: string;
      type: "OPTION_CHOICE";
      playerId: PlayerId;
      prompt: string;
      options: { label: string }[];
      context:
        | "city-hall"
        | "satyr-swap"
        | "random-town-pack"
        | "war-machine"
        | "deck-pick"
        | "deck-search-mode"
        | "scouting-prompt"
        | "discard-pick"
        | "hand-discard"
        | "eagle-eye"
        | "own-deck-pick"
        | "artifact-deck-pick"
        | "spell-deck-pick"
        | "deck-card-placement"
        | "garrison"
        | "siege-gate"
        | "siege-demolish"
        | "remove-obstacle"
        | "skeleton-reinforce"
        | "rogues-scout"
        | "thieves-guild"
        | "combat-reposition"
        | "disrupting-ray-mode"
        | "dispel-scope"
        | "genie-take-spell"
        | "combat-knockback"
        | "combat-teleport"
        | "neutral-destination"
        | "place-battlefield-tokens"
        | "combat-clone"
        | "combat-step"
        | "combat-activation-order"
        | "cover-of-darkness"
        | "shackles-of-war"
        | "wayfarer-paralysis"
         | "disciplinary-committee-start"
         | "bounty-hunter-mark-start"
         | "mgq-mad-science"
         | "mgq-gold-contract"
        | "diplomacy-skip"
        | "polish-quick-combat"
        | "diplomacy-recruit"
        | "dimension-door-hero"
        | "dimension-door"
        | "view-earth"
        | "learning-level-up"
        | "fortune-boost"
        | "map-spell-boost"
        | "visions-boost"
        | "visions-deck"
        | "visions-scry"
        | "artifact-set-scry"
        | "visions-guard-cast"
        | "visions-guard-boost"
        | "visions-guard-swap"
        | "pandora-scry"
        | "pandora-upkeep"
        | "morale-positive-limit"
        | "morale-repeat-search"
        | "pendant-repeat-search"
        | "spell-discard-top"
        | "place-creature-bank"
        | "place-map-token"
        | "place-field-override"
        | "subterranean-tile-pick"
        | "subterranean-gate-placement"
        | "judge-dread"
        | "rule-111"
        | "far-tile-flip"
        | "player-resource-pick"
        | "player-vii-pick"
        | "grail-free-building"
        | "combat-remove-then-search"
        | "combat-remove-another"
        | "commander-artifact-offer"
        | "polish-spell-or-cast";
      commanderArtifactOffer?: { cardIds: CardId[]; cost: number; source: string };
      /**
       * grail-free-building: one free Town building after BUILD_GRAIL when
       * `grailBuildReward.freeBuilding` is set. `buildingIds` is index-aligned
       * with `options` (a trailing "Skip" option has no id). Building is free
       * (no gold/materials, does not spend the Build token).
       */
      grailFreeBuilding?: { townId: TownId; buildingIds: BuildingId[] };
      /**
       * city-hall: the income options for the City Hall (Resource-round) choice
       * under resolution, index-aligned with `options`. Stored here in game
       * state so the pick survives serialization (reload / reconnect / server
       * restart). It previously lived in a module-level variable that reset to
       * null off-process, which made the choice unresolvable and left the player
       * stuck in the "choice" phase, unable to draw or discard.
       */
      cityHall?: {
        options: {
          label: string;
          gold?: number;
          buildingMaterials?: number;
          valuables?: number;
          movement?: number;
          drawCards?: number;
          reinforceBronzeFree?: boolean;
          tradingPost?: boolean;
          searchSpellDeck?: number;
          /** Cove City Hall: gain Hero experience (paired with removeArtifactFromHand). */
          experience?: number;
          /** Cove City Hall: this option removes one Artifact card from hand as its cost. */
          removeArtifactFromHand?: boolean;
          /** Bulwark City Hall: extra starting Runes per combat until the next Resource round. */
          runesNextCombats?: number;
          /** MGQ Pocket Castle Kitchen: one no-gold Job assignment or reassignment. */
          freeJobReassign?: boolean;
        }[];
      };
      /** combat-reposition: Harpies' optional fly-back after their attack. */
      reposition?: { unitId: UnitId; originPosition: number };
      /**
       * Polish Balance Pack: the caster's pick after a reprinted Spell resolves.
       * "disrupting-ray-mode" — suppress the ability (option 0) or lay the
       * lasting Defense penalty (option 1) on `unitId`. "dispel-scope" — clear
       * the printed unit/space (option 0) or EVERY ongoing effect in the Combat
       * (option 1).
       */
      balanceSpellChoice?: { cardId: CardId; unitId?: UnitId; amount?: number; target?: TargetRef };
      /**
       * genie-take-spell: the Spells dug out of the Genies' controller's deck
       * (index-aligned with `options`); the chosen one goes to hand, the rest to
       * discard. `mode` decides how combat resumes afterwards.
       */
      genieTakeSpell?: { spellCardIds: CardId[]; unitId: UnitId; mode: "other-action" | "on-attack"; abilityId: string };
      /**
       * combat-knockback: the Ghost Dragons shoved `unitId` after their attack;
       * the defender picks which empty space (index-aligned with the options) to
       * move to. `attackerId` is the Ghost Dragons whose attack triggered it.
       */
      knockback?: { unitId: UnitId; attackerId: UnitId; positions: number[] };
      /**
       * combat-teleport: the Teleport Spell moved this unit; the caster picks
       * which empty space (index-aligned with the options) it lands on.
       * `abilityId` is set when the relocation is a unit ability rather than the
       * Spell (the Jotunn Warlord's start-of-activation teleport) so the FX layer
       * plays that ability's teleport sound; absent for the Spell.
       */
      teleport?: { unitId: UnitId; positions: number[]; abilityId?: string };
      /**
       * neutral-destination (BINH house rule): a neutral guard `unitId` must
       * move to reach its chosen target and several legal cells work; the
       * attacking player picks which (index-aligned with the options). It still
       * attacks `defenderId` — only the landing cell is the player's choice.
       */
      neutralDestination?: { unitId: UnitId; positions: number[]; defenderId: UnitId };
      /**
       * place-battlefield-tokens: the caster places the rest of a Quicksand /
       * Land Mine set, one token per pick. `positions` are the empty spaces still
       * open (index-aligned with the options; a trailing "stop" option carries no
       * position). `armedSlots` is the shuffled armed/decoy assignment for the
       * placement slots in order — kept private to the caster (see player-view) —
       * and `placedCount` is how many tokens are already down, so the next one
       * takes `armedSlots[placedCount]`. `remaining` caps how many more may drop.
       */
      placeTokens?: {
        kind: "quicksand" | "land_mine";
        positions: number[];
        armedSlots: boolean[];
        placedCount: number;
        remaining: number;
        triggerDamage: number;
      };
      /**
       * combat-clone: the Clone Spell is placing a copy of `originalUnitId`; the
       * caster picks which empty space adjacent to it (index-aligned with the
       * options) the Clone Token lands on.
       */
      clone?: { originalUnitId: UnitId; positions: number[] };
      /**
       * combat-step: Necklace of Swiftness moved this unit one space; the
       * controller picks which empty orthogonally-adjacent space (index-aligned
       * with the options) it steps to.
       */
      step?: { unitId: UnitId; positions: number[] };
      /**
       * combat-activation-order: several units of one side are tied for the next
       * activation slot (same effective initiative); the chooser picks which one
       * activates now (index-aligned with the options). `side` is the controller
       * those tied units belong to — usually the chooser's own side, but for the
       * Neutral army it is NEUTRAL_PLAYER_ID while the attacker breaks the tie on
       * its behalf, so resolution validates the pick against `side`, not the
       * answering player.
       */
      activationOrder?: { unitIds: UnitId[]; side: PlayerId };
      /**
       * deck-pick: the shared-deck search waiting on the deck choice. For the
       * SPELLS family this is the ONE up-front decision (user demand: "choose
       * discard, search or school of magic" BEFORE anything is revealed): the
       * options run [search deck 0..n] then [take a discard top per entry of
       * `discardTops`] then [one Basic X Magic school draw per entry of
       * `fetchSchools`]. Picking a Search then reveals DIRECTLY — the old
       * second "Search or draw from a School?" step never re-opens. A legacy
       * in-flight pick (no `upFront`) resolves the old two-step way.
       */
      deckPick?: {
        deckIds: DeckId[];
        count: number;
        allowRemove?: boolean;
        /** The enriched one-step form (options beyond the deck picks exist). */
        upFront?: boolean;
        /** Acquirable face-up discard tops offered up front, in option order. */
        discardTops?: { deckId: DeckId; cardId: CardId }[];
        /** Basic X Magic fetch schools offered up front, in option order. */
        fetchSchools?: ("air" | "earth" | "fire" | "water")[];
      };
      /**
       * combat-remove-then-search: Spellbinder's Hat (option A) played
       * mid-combat — the removable hand cards, index-aligned with the options
       * (a trailing "Skip" carries none). The picked card is removed from the
       * game and its own deck Searched (searchCount) immediately.
       */
      removeThenSearch?: { cardIds: CardId[]; searchCount: number };
      /**
       * combat-remove-another: Spellbinder's Hat (option B) played mid-combat —
       * every hand and discard card, index-aligned with the options (a trailing
       * "Skip" carries none). The picked card is removed from the game.
       */
      removeAnother?: { entries: { cardId: CardId; source: "hand" | "discard" }[] };
      /**
       * deck-search-mode: a "Search X" with a non-empty discard pile, waiting on
       * the up-front either/or — Search the deck (reveal the top X, keep one) OR
       * take the top of that deck's discard pile. The searched cards are only
       * revealed if the player commits to searching.
       */
      deckSearchMode?: {
        deckId: DeckId;
        count: number;
        /** Basic X Magic schools offered as "draw instead of Searching" options. */
        schoolFetch?: SpellSchool[];
        /** Whether a "take the top discard" option is offered (index 1). */
        hasDiscardTop?: boolean;
        /** Tarnum (Conflux) I: carry the "Remove instead of keep" privilege into the reveal. */
        allowRemove?: boolean;
      };
      /**
       * "Which card sits face up?" — after a Search puts 2+ revealed cards BACK,
       * the searcher orders the pile: the chosen card goes on TOP (the one every
       * later top-discard offer sees), the rest underneath. Opened by
       * `openDiscardTopPick` for EVERY shared deck family; a Search returning a
       * single card never opens it. `baseCount` + `keptCardId` carry the Search's
       * identity so the morale repeat-search / Pendant-of-Courage post-Search
       * offers still open after the pick resolves. (The context id keeps its
       * historical `spell-discard-top` name — a room holding an in-flight choice
       * across a server update resolves through the very same branch. NOTE: taking
       * from a discard pile is still the FACE-UP TOP only, like every other deck —
       * the reverted "take any discarded spell" feature is not back.)
       */
      spellDiscardTopPick?: {
        deckId: DeckId;
        cardIds: CardId[];
        baseCount?: number;
        keptCardId?: CardId;
      };
      /**
       * scouting-prompt: a held Scouting card may be played before a Search. The
       * pop-up offers, in option order: [decline], then "Search (3)" (basic) when
       * `offerBasic`, then "Search (5)" (expert, spends a crown) when `offerExpert`.
       * Resolving creates the SEARCH_COUNT_OVERRIDE and re-enters the Search; the
       * deck + base count are kept here so the search can resume after the choice.
       */
      scoutingPrompt?: {
        deckId: DeckId;
        baseCount: number;
        offerBasic: boolean;
        offerExpert: boolean;
        /**
         * Polish Balance Pack — the reprinted Wisdom's basic side reads "When
         * buying Spells from your Mage Guild OR you built the Mage Guild, do
         * Search (X+2) instead of Search (X), once". Offered alongside Scouting
         * on a Spell-deck Search in the round this player built their Mage Guild.
         */
        offerWisdom?: boolean;
        /** Balance-Pack Speculum: play its persistent +1 arm as this Search starts. */
        offerSpeculum?: boolean;
        /** Tarnum (Conflux) I: carry the "Remove instead of keep" privilege through the Scouting prompt. */
        allowRemove?: boolean;
        /**
         * The up-front discard/fetch alternatives were already offered (the
         * one-step spells deck-pick) — after Scouting resolves, the Search goes
         * straight to the reveal instead of re-opening the mode choice.
         */
        modeResolved?: boolean;
        /**
         * This Search began with an empty discard, so the engine auto-flipped a
         * face-up card. That newly seeded card is not a take alternative for
         * this same Search; the Search proceeds from the next top cards.
         */
        ignoreDiscardTopOnce?: boolean;
      };
      /** own-deck-pick: revealed cards of the player's own deck (Mana Vortex). */
      ownDeckPick?: {
        cardIds: CardId[];
        /**
         * Adrienne's Fire Magic IV: after the pick (the chosen card to hand, the
         * rest to discard), shuffle the player's whole discard pile back into
         * their deck. Omitted for Mana Vortex / Chain Lightning IV.
         */
        thenReshuffleDiscard?: boolean;
      };
      /** artifact-deck-pick (Tazar's War Hero VI): the Artifact decks to draw from. */
      artifactDeckPick?: { deckIds: DeckId[] };
      /**
       * spell-deck-pick (the four Tome relics' School dig): WHICH physical Spell
       * deck the dig reads. Opened only when that is a real choice — split decks
       * on, an Expert Spell deck with cards in it, and a crown (or an Empower)
       * to pay for it. The `crownDeckIds` entries cost one Expert use, spent at
       * the pick (the play itself is a plain basic play), so the card can be
       * played with ONE description and the deck chosen afterwards.
       */
      spellDeckPick?: {
        deckIds: DeckId[];
        /** Deck ids among `deckIds` whose pick spends an Expert use (crown). */
        crownDeckIds: DeckId[];
        /** The dig's School filter (a Tome's own School). */
        school?: Exclude<SpellSchool, "any">;
        /**
         * Polish Balance Pack — the reprinted Eagle Eye: the pick is over the
         * spell LEVEL ("Choose one: Basic or Expert Spell"), not a School, so
         * each offered deck carries the level its dig looks for. Index-aligned
         * with `deckIds`; a Tome's School dig leaves it absent.
         */
        wantedLevels?: ("basic" | "expert")[];
        /** The card that opened the dig — its Empower waives the crown. */
        cardId?: CardId;
      };
      /**
       * deck-card-placement: cards the player must put back on the TOP or the
       * BOTTOM of a shared deck, one at a time (the reprinted Diplomacy's
       * unpurchased draws; reused by the Balance Pack's Diplomat's Ring /
       * Ambassador's Sash). The head is the card being placed; each answer pops
       * it and re-opens for the tail until the queue empties.
       */
      deckCardPlacement?: {
        pending: { cardId: CardId; deckId: string; label?: string }[];
        /** Feed-line source (the card that granted the placement). */
        source?: string;
      };
      /** rogues-scout: the deck being peeked and its revealed top card. */
      rogueScout?: { deckId: DeckId; cardId: CardId };
      /** morale-positive-limit: held Positive Morale card ids, index-aligned with the discard options. */
      moralePositiveLimit?: { cardIds: CardId[] };
      /**
       * morale-repeat-search: the just-resolved Search (X) and the card it
       * gained — option 0 discards that card and performs the Search again.
       */
      moraleRepeatSearch?: { deckId: DeckId; count: number; cardId: CardId };
      /**
       * pendant-repeat-search: the just-resolved Search (X) — Pendant of Courage
       * is played AFTER a Search to perform that action again (option 0 discards
       * the Pendant and re-runs the same Search; the gained card is KEPT).
       */
      pendantRepeatSearch?: { deckId: DeckId; count: number };
      /**
       * wayfarer-paralysis: Ring of the Wayfarer's start-of-combat decision in a
       * Neutral combat. `unitIds` are the offer's non-Azure targets (index-aligned
       * with the options); the trailing "keep" option carries no unit. `cardId`
       * is the Ring, discarded when a unit is picked.
       */
      wayfarerParalysis?: { cardId: CardId; unitIds: UnitId[] };
      /**
       * Little Busters Disciplinary Committee Pack: each queued source chooses
       * one living enemy for -1 Attack during combat round 1. The remaining
       * source ids let both sides resolve the mandatory start effect in order.
       */
      disciplinaryCommitteeStart?: {
        sourceUnitId: UnitId;
        targetUnitIds: UnitId[];
        remainingSourceUnitIds: UnitId[];
        amount: number;
        rounds: number;
      };
      /** Factory Bounty Hunters: mandatory enemy Mark target and queued sources. */
      bountyHunterMarkStart?: {
        sourceUnitId: UnitId;
        targetUnitIds: UnitId[];
        remainingSourceUnitIds: UnitId[];
      };
      /** Promestein: explicit sacrifice/upgrade pairs, index-aligned with options. */
      mgqMadScience?: {
        pairs: { sacrificeArmyUnitId: string; targetArmyUnitId: string }[];
        attackBonus: number;
      };
      /** MGQ setup: index-aligned, atomic pairs of the two Gold identities kept this game. */
      mgqGoldContract?: { pairs: [string, string, string][] };
      /**
       * thieves-guild: the deck being peeked and its top 2 cards (index 0 is the
       * very top). The chosen option's card is discarded; the other returns on
       * top. Private to the peeking player (redacted in player-view).
       */
      thievesGuild?: { target: ThievesGuildTarget; cardIds: CardId[] };
      /** siege-demolish: intact fortification positions and removals left. */
      siegeDemolish?: { positions: number[]; remaining: number };
      /**
       * remove-obstacle: the obstacles still standing (index-aligned with the
       * options), each tagged so resolution knows what to clear — an obstacle
       * marker, a siege Wall / Gate, or a battlefield token (Force Field, Fire
       * Wall, Quicksand, Land Mine, carrying its `tokenId`). `remaining` caps how
       * many more the caster may remove.
       */
      removeObstacle?: {
        items: { position: number; kind: "obstacle" | "wall" | "gate" | "token"; tokenId?: string }[];
        remaining: number;
      };
      /**
       * player-resource-pick / player-vii-pick: map-designer tile reveal choices.
       * `tileInstanceId` is the face-down tile being revealed; `viiFields` is the
       * multi-select set for the Ⅶ pick (index-aligned with options).
       */
      playerTilePick?: {
        tileInstanceId: string;
        viiFields?: ViiFieldDesignation[];
      };
      /** skeleton-reinforce: the bronze Few army units that may be flipped free. */
      skeletonReinforce?: { armyUnitIds: string[] };
      /** discard-pick: the candidate cards (index-aligned with options). */
      discardPick?: {
        cardIds: CardId[];
        /**
         * Spell Book (house rule): where each option routes the picked card —
         * "hand" (default) or "spellBook". Index-aligned with `cardIds`/`options`,
         * so a Spell candidate can appear twice (a "to hand" and a "to Book"
         * option). Absent = every pick goes to hand.
         */
        destinations?: ("hand" | "spellBook")[];
        /** Polish recovery cards may select from the used Book zone. */
        sources?: ("discard" | "polish-used")[];
        remaining: number;
        filter?:
      | "spell"
      | "non-artifact"
      | "specialty"
      | "power-or-knowledge-statistic"
      | "spell-or-specialty"
      | "magic-arrow"
      | "cast-enabler-or-specialty"
      | "polish-refresh-only";
        fromTop?: number;
        shuffleRestIntoDeck?: boolean;
        /** One protected occurrence per id is still resolving and cannot be recovered yet. */
        excludeCardIds?: CardId[];
        /** Polish Balance Pack Adelaide IV: open a Book-refresh pick once this take resolves. */
        polishRefreshAfter?: boolean;
      };
      /** Found shared-deck Spell waiting for its take-or-discard decision. */
      eagleEye?: { deckId: DeckId; cardId: CardId; allowDiscard?: boolean };
      /** hand-discard: candidate hand cards (index-aligned with options) and how many still to discard (Charm of Mana / Shackles of War). */
      handDiscard?: {
        cardIds: CardId[];
        remaining: number;
        drawnOnly: boolean;
        /** Marks the mandatory MGQ pre-battle Spirit summoning payment. */
        mgqSpiritCost?: boolean;
      };
      /**
       * dimension-door: the Hero being teleported and the candidate destination
       * fields (index-aligned with the options; the final "Cancel (no teleport)"
       * option carries no destination). The client picks the destination by
       * CLICKING a glowing hex — the labels are the accessible/AFK fallback.
       */
      dimensionDoor?: { heroId: HeroId; destinations: MapSpaceId[] };
      /**
       * dimension-door-hero: the WHO-travels step, opened for EVERY Dimension
       * Door cast (even with a lone eligible Hero). Hero ids are index-aligned
       * with the options; the final "Cancel (no teleport)" option carries none.
       */
      dimensionDoorHero?: { heroIds: HeroId[]; range: number };
      /**
       * view-earth: the casting Hero and the enemy-owned Mine fields in reach
       * (index-aligned with the options; the final "Cancel" option carries no
       * Mine). Resolving captures the chosen Mine for the caster.
       */
      viewEarth?: { heroId: HeroId; mineSpaceIds: MapSpaceId[] };
      /**
       * diplomacy-skip: the neutral fight Cyra's Diplomacy may skip. Option 0
       * uses the card (claim the field, no XP); option 1 fights normally.
       * `crownFree` is true only for Empowered Diplomacy, whose alternative
       * Instant side does not consume an Expert-effect use.
       */
      diplomacySkip?: { heroId: HeroId; fieldId: MapSpaceId; difficulty: number; crownFree?: boolean };
      /**
       * polish-quick-combat: a covered neutral fight the Polish strength-based
       * Quick Combat rule lets the player resolve unfought. Option 0 resolves
       * the Quick Combat (win, no Experience); option 1 fights normally (Cyra's
       * Diplomacy is still offered afterwards at a matching level).
       */
      polishQuickCombat?: { heroId: HeroId; fieldId: MapSpaceId; difficulty: number };
      /**
       * diplomacy-recruit: the Neutral Unit cards drawn (one per Dwelling) and
       * the affordable subset offered as recruit options, in option order. The
       * final option always declines; every undrawn-but-recruited card and all
       * declined draws return to their tier deck's discard pile.
       */
      diplomacyRecruit?: {
        draws: { unitDefId: string; tier: "bronze" | "silver" | "gold" | "azure" }[];
        recruitable: { unitDefId: string; tier: "bronze" | "silver" | "gold" | "azure" }[];
        /** Oidana IV's gold discount, applied to the recruited unit's cost. */
        goldReduction?: number;
        /**
         * Inline Legion plays offered AFTER the recruit + "Recruit none" options
         * (so those indices are unchanged): each discards that held Legion piece,
         * banks its voucher for that drawn unit and RE-OPENS this choice at the
         * reduced price, letting distinct pieces stack. Labels name the owner's
         * PRIVATE hand cards, so `player-view` scrubs them for other seats.
         */
        legionPlays?: { cardId: CardId; amount: number; unitDefId: string }[];
      };
      /**
       * learning-level-up: the Learning play modes offered, index-aligned with
       * the options. The final "decline" option carries no mode. Resolving a
       * mode discards (basic) or removes (expert) one Learning card from hand.
       * Basic advances a half level AND draws 1 card (Balance Pack); expert
       * advances a full level. The "draw a card instead of advancing" reading is
       * the standalone hand play (a PLAY_CARD drawOnly), never a window mode.
       */
      learningLevelUp?: { modes: ("basic" | "expert")[] };
      /**
       * visions-boost: paying Visions' Power on the map. `spellCardIds` are the
       * power-source Spells in hand offered to discard for +1 card each (index-
       * aligned with the leading options; the trailing option scrys now). `boost`
       * is how many have already been paid, capped by `cardsByPower`.
       */
      visionsBoost?: { boost: number; spellCardIds: CardId[]; cardsByPower: Record<number, number> };
      /**
       * fortune-boost: paying Fortune's Power on the map. `spellCardIds` are the
       * power-source cards in hand offered to discard for +1 reroll each (index-
       * aligned with the leading options; the trailing option plays now).
       * `boost` is how many have been paid; `cardId` is the Fortune card whose
       * rerollsByPower maps the boost to the final reroll budget.
       */
      fortuneBoost?: { boost: number; spellCardIds: CardId[]; cardId: CardId };
      /**
       * map-spell-boost: after casting a Power-tiered map spell (View Air, Fly,
       * Dimension Door, …). Power is added one source at a time (like combat) —
       * hand/Book power cards, School-of-Magic expert discard, Basic X Magic
       * expert +3 — then the trailing option resolves at the current Power.
       * `offers` is index-aligned with the leading options.
       */
      mapSpellBoost?: {
        spellCardId: CardId;
        power: number;
        offers: Array<
          | {
              kind: "card";
              cardId: CardId;
              mode: "basic" | "expert";
              value: number;
              fromBook?: boolean;
              /**
               * CHOOSE_ONE cards: the exact printed side this offer plays (Tunic of
               * the Cyclops King's "+2 Power" vs "Draw 1 card and +1 Power" are two
               * separate offers). Absent for bare cards and legacy snapshots.
               */
              optionIndex?: number;
              /** Cards drawn when this side resolves (the Sorcery/Tunic/Scales rider). */
              drawCards?: number;
              /** This side's printed cost removes the card from the game (the Orb relics' +5). */
              removeSelf?: boolean;
              /** The expert side costs no crown (Empowered ability). */
              crownFree?: boolean;
              /**
               * This side's printed cost also discards other hand cards (Titan's
               * Cuirass "Discard 1 card: +4", Breastplate of Brimstone "up to 3,
               * +1 each") — resolving it opens the cost-discard follow-ups below.
               */
              costDiscards?: { required: number; upTo: number; perCard: number };
            }
          | {
              /**
               * A pending cost discard of the last-played power side: `required`
               * discards must be paid before the spell may resolve (Titan's
               * Cuirass); optional `perCard` discards add Power (Breastplate of
               * Brimstone). One offer per distinct hand card.
               */
              kind: "cost-discard";
              cardId: CardId;
              value: number;
            }
          | {
              /** School of Magic permanent: discard for expert (+3 instead of basic +1). */
              kind: "school-permanent-expert";
              permanentCardId: CardId;
              value: number;
            }
          | {
              /**
               * Basic X Magic +3: crown for +3, once per cast. Consumes its source
               * (user ruling: "if use expert, must discard, on hand or on
               * permanent") — the in-play fetch permanent by default, or the hand
               * card named by `fromHandCardId`; either lands in the owner's
               * discard pile (recycles into their deck, never out of the game).
               */
              kind: "school-fetch-expert";
              school: "air" | "earth" | "fire" | "water";
              value: number;
              fromHandCardId?: CardId;
            }
          | {
              /**
               * Tome of X: discard the matching Tome to lift this cast directly
               * to its highest useful map Power through the open Power tray.
               */
              kind: "tome-max";
              cardId: CardId;
              optionIndex: number;
              value: number;
            }
        >;
        /** Display/resolution Power after Tome/Orb-style multipliers. */
        effectivePower?: number;
        /** Basic Magic expert already spent on this cast (once per cast, like combat). */
        schoolFetchExpertUsed?: boolean;
        /** School permanent already experted on this cast. */
        schoolPermanentExpertUsed?: boolean;
        fromSpellBook?: boolean;
        castEnablerCardId?: CardId;
        /** Spell/support/enabler cards held out of empty-deck reshuffles until resolution. */
        inFlightCardIds?: CardId[];
        /**
         * A played power side's still-open printed card cost (Titan's Cuirass /
         * Breastplate of Brimstone): `required` more discards owed before the
         * spell may resolve, `upTo` more allowed, `perCard` Power each adds.
         * `sourceCardId` names the side's card for the offer labels.
         */
        costDiscards?: { sourceCardId: CardId; required: number; upTo: number; perCard: number };
      };
      /**
       * visions-deck: the Neutral tier decks Visions may scry (index-aligned with
       * the options) and how many cards the chosen power level draws.
       */
      visionsDeck?: { tiers: ("bronze" | "silver" | "gold" | "azure")[]; count: number };
      /**
       * visions-scry: the Neutral cards lifted off the chosen tier deck still
       * awaiting a keep/discard decision (`remaining`), and the cards already
       * kept (`toReturn`, in pick order — the first kept ends on top). The
       * identities stay private to the scrying player.
       */
      visionsScry?: {
        tier: "bronze" | "silver" | "gold" | "azure";
        remaining: CardId[];
        toReturn: CardId[];
      };
      /**
       * artifact-set-scry (Polish Set Artifacts, Diplomat's Cloak tier 2): the
       * Neutral deck whose TOP card the player is looking at, and that card's id.
       *
       * The card is deliberately NOT lifted out of the deck — it stays on the
       * draw pile and is only MOVED (to the bottom) if the player says so. So no
       * card can ever be destroyed by this window, and an elimination mid-choice
       * needs no return branch at all. The identity is private to the scrying
       * player (masked in player-view, the visions-scry precedent).
       */
      artifactSetScry?: {
        setId: string;
        tier: number;
        neutralTier: "bronze" | "silver" | "gold" | "azure";
        cardId: CardId;
      };
      /**
       * visions-guard-swap: casting Visions BEFORE a neutral guard battle to swap
       * out the drawn guards. `swapsRemaining` is how many more of the drawn
       * (non-bank) Neutral guards may still be discarded-and-redrawn this cast;
       * the guards themselves live on `combat.pendingNeutralDraws`. The Power
       * boost step that sets this count reuses the `visionsBoost` field above.
       */
      visionsGuardSwap?: { swapsRemaining: number };
      /**
       * pandora-scry (Pandora cards 183/184/185/186): the shared-deck cards lifted
       * off the top of `deckId` still awaiting a keep/discard decision
       * (`remaining`), the cards already kept (`toReturn`, in pick order — the
       * first kept ends on top), how many discards are still allowed
       * (`discardsRemaining`, the printed "up to 2"), and the follow-up steps
       * (`then`, a resource gain or Search) to run once the scry ends. The card
       * identities stay private to the scrying player (masked in player-view).
       */
      pandoraScry?: {
        deckId: DeckId;
        remaining: CardId[];
        toReturn: CardId[];
        discardsRemaining: number;
        then: VisitStep[];
      };
      /**
       * place-creature-bank: a discovered Far/Near tile's Blocked Field at
       * `fieldId`, offered to the discovering player to convert into a Creature
       * Bank. `bankId` is the token already drawn (face-up) for this tile when it
       * was revealed — known to the player before they rotated — carved from the
       * `tier` pile. Option 0 places it, option 1 declines. `tileInstanceId` lets
       * the decline path clear the tile's reservation.
       */
      creatureBank?: {
        /** Final Blocked Field; ignored while `preRotation` is true. */
        fieldId: MapSpaceId;
        tier: "far" | "near";
        bankId?: string;
        tileInstanceId?: string;
        /** Polish sequence: choose one rolled bank now, then rotate the tile. */
        preRotation?: boolean;
        /** Polish mode candidates, index-aligned with the placement options. */
        candidates?: ReservedBankOption[];
      };
      /** Polish Mage Guild build reward: Search a Spell or gain Cast a Spell. */
      polishSpellOrCast?: { count: number; strictExpertGate?: boolean };
      /**
       * subterranean-gate-placement: the revealing player picks which touching
       * hex becomes the Subterranean Gate half on the just-revealed tile (and,
       * when a cavern touches two Surface tiles, WHICH one it connects to). Each
       * option in `options` is index-aligned with `candidates`. `deferBank` marks
       * whether a Creature Bank offer for `tileInstanceId` was postponed behind
       * this choice (so it runs once the gate is carved — "not at the gate hex").
       */
      subterraneanGate?: {
        tileInstanceId: string;
        candidates: SubterraneanGateChoiceCandidate[];
        deferBank: boolean;
      };
      /**
       * subterranean-tile-pick: on first gate entry, choose which of two
       * same-band underground tiles occupies the connected slot. The second
       * tile is held out of the live pool until this choice resolves.
       */
      subterraneanTilePick?: {
        tileInstanceId: string;
        candidates: [string, string];
      };
      /**
       * place-map-token: the discovering player picks which field of the
       * just-revealed tile the Monolith/Whirlpool/Gate Location Token overwrites
       * ("place the Token on … a Field of your choosing", p.35). Each option in
       * `options` is index-aligned with `candidates` (the legal hexes — matching
       * terrain, no Blocked Field/Town/guard/other token). `number` is a
       * Whirlpool's pre-assigned die face, `pair` a colored Gate's pair (1-4),
       * carved onto the chosen field.
       */
      mapToken?: {
        tileInstanceId: string;
        kind: "monolith" | "whirlpool" | "gate" | "oneway_entrance" | "oneway_exit";
        number?: -1 | 0 | 1;
        pair?: 1 | 2 | 3 | 4;
        candidates: MapSpaceId[];
      };
      /**
       * place-field-override: discovering player picks which field of the
       * just-revealed tile a Field Override carves (or refuses, when allowRefuse).
       * Options are index-aligned with `candidates`; when allowRefuse the last
       * option is the refuse action (not a candidate index).
       */
      fieldOverride?: {
        tileInstanceId: string;
        kind: string;
        candidates: MapSpaceId[];
        allowRefuse?: boolean;
      };
      returnPhase: GamePhase;
    }
  | {
      /**
       * A printed attack ability needs a target: Magog splash (1 flat damage
       * to a unit adjacent to the target), Cerberi second head (1 flat damage
       * to another enemy adjacent to Cerberi), Liches' Death Cloud (a full
       * second attack at base attack 2 against a unit adjacent to the
       * original target), a rulebook AI tie ("the player chooses which
       * unit is attacked"), or a war machine round-start shot. Also the
       * "place-token" pick: the Ogres' Attack ("Bloodlust") token and the
       * Sorceresses' Weakness token are placed on a unit the player clicks on
       * the board (resolved into placeCombatToken), instead of a wall of
       * one-button-per-target command buttons.
       */
      id: string;
      type: "ABILITY_TARGET_CHOICE";
      playerId: PlayerId;
      kind:
        | "flat-damage"
        | "second-attack"
        | "neutral-target"
        | "war-machine"
        | "spell-splash"
        | "ballistics-splash"
        | "area-pick"
        | "spell-redirect"
        | "enchanter-activation"
        | "faerie-damage"
        | "jotunn-teleport"
        | "chain-lightning"
        | "place-token"
        | "sacrifice-transfer"
        // Factory Couatls: an optional yes/no at activation — pick the Couatl
        // itself to switch on its invulnerability, or skip.
        | "couatl-invulnerability"
        // Factory Automaton (Few): an optional yes/no — pick the Automaton to
        // bank one more faction cube, or skip.
        | "automaton-cube"
        // Factory Dreadnoughts: "instead of attacking", allocate the printed
        // damage across up to N adjacent units, one pick at a time (the k-th
        // pick takes chainRemainingDamages[0]).
        | "dreadnought-splash"
        // WOG commander command ability: pick the unit the cast lands on
        // (free during the commander's activation, once per combat round).
        | "commander-cast"
        // Pendant/Talisman Power-3 overflow: pick any living unit for 1 damage.
        | "commander-overflow-zap";
      abilityId: string | null;
      abilityName: string;
      prompt: string;
      /** Unit the ability comes from; null for war machines (cards, not units). */
      sourceUnitId: UnitId | null;
      /** Original attack target the follow-up is anchored to (if any). */
      anchorUnitId: UnitId | null;
      candidateUnitIds: UnitId[];
      /** Flat damage dealt on resolution (flat-damage / faerie-damage kind). */
      amount?: number;
      /**
       * "place-token" pick: the combat token to drop on the chosen unit and how
       * long it lasts. `amount` carries the signed delta (+2 attack, −2 weakness).
       */
      tokenKind?: CombatTokenKind;
      tokenRounds?: number;
      /** Replacement base attack of the follow-up attack (second-attack kind). */
      baseAttack?: number;
      /** Fireball's second space may be empty: the choice can be skipped. */
      optional?: boolean;
      /** Label of the "skip" action when `optional` (default "Skip"). */
      skipLabel?: string;
      /**
       * Chain Lightning: the still-eligible "closest" units (anchorUnitId is the
       * selected unit), and the damage values still to allocate, leftmost first.
       */
      chainReachableUnitIds?: UnitId[];
      chainRemainingDamages?: number[];
      /**
       * Magic Mirror reflecting an instant combat debuff played onto an attack
       * (Curse on your defender, Weakness on your attacker). The debuff was
       * already lifted off your unit; once the new target is chosen it is pushed
       * onto the pending attack as a one-shot `redirectedInstants` stat delta
       * (−defense for Curse, −attack for Weakness) covering this attack and its
       * retaliation only — an instant, never an ongoing effect or token. Absent
       * for a normal cast redirect, which re-points the pending Spell instead.
       */
      redirectInstant?: {
        stat: "attack" | "defense";
        /** Signed stat delta the instant carries (e.g. −2 for a Power-1 Curse). */
        amount: number;
        sourceCardId: CardId;
      };
      /**
       * "area-pick" (Frost Ring / Meteor Shower VI): how many more adjacent units
       * the caster still has to pick for this blast. Each pick takes `amount`
       * damage; the choice re-opens until this reaches 0 or the candidates run out.
       */
      picksRemaining?: number;
      /** Card the area-pick damage is sourced from (for damage reduction). */
      sourceCardId?: CardId;
    }
  | {
      /**
       * A combat hand-discard prompt with four kinds:
       *  - "magi-power-or-random": Neutral Magi "Power Drain" — after the Magi
       *    attack the defending player discards a Power-contributing card (a
       *    Power statistic or any Spell) of their choice, or lets a random card
       *    be discarded. Combat stays parked on its retaliation until resolved.
       *  - "pegasi-toll": Neutral Pegasi "Mystic Toll" — the caster must pay a
       *    Power card of their choice BEFORE a Spell is cast. The cast is held in
       *    `tollSpell` and replayed once the toll is paid (no random option).
       *  - "familiar-choose-discard": Neutral Familiars "Mana Leech" — after
       *    declaring a Spell from hand, the caster chooses any other card to
       *    discard before that held Spell is cast (no random option).
       *  - "wraith-choose-discard": Creature Bank Crypt/Shipwreck Wraiths "Soul
       *    Siphon" — after the Wraiths' attack the attacked player discards a
       *    card of THEIR choice (any card in hand; no random option). Combat
       *    parks until resolved; `remaining` counts cards still owed.
       */
      id: string;
      type: "COMBAT_HAND_DISCARD";
      playerId: PlayerId;
      kind: "magi-power-or-random" | "pegasi-toll" | "familiar-choose-discard" | "wraith-choose-discard";
      abilityId: string;
      abilityName: string;
      sourceUnitId: UnitId;
      prompt: string;
      /**
       * Cards the chooser may pick from: the hand's Power cards for
       * "magi-power-or-random"/"pegasi-toll", or the eligible whole hand for
       * "familiar-choose-discard"/"wraith-choose-discard".
       */
      powerCardIds: CardId[];
      /** "wraith-choose-discard" only: cards still owed after this pick (>= 1). */
      remaining?: number;
      /** Pegasi/Familiars: the Spell cast deferred until the discard is paid. */
      tollSpell?: {
        cardId: CardId;
        target: TargetRef;
        optionIndex?: number;
        fromScroll?: string;
        fromSpellDeck?: CardId;
        fromOwnDiscard?: boolean;
        fromSpellBook?: boolean;
        castEnablerCardId?: CardId;
        tarnumReturn?: "deck-top" | "discard";
        useSchoolExpert?: boolean;
        useSchoolFetchExpert?: boolean;
      };
    }
  | null;

/**
 * Bounded per-seat notes for the single-player computer policy (sticky map
 * objective, economy focus trail, visit thrash guard). Absent in multiplayer
 * and legacy snapshots. Never holds opponent secrets — only that seat's own
 * derived priorities. Redacted from other seats' player views.
 */
export type ComputerPolicyMemoryState = {
  lastTurnKey: string;
  resourceTrail: Array<{
    round: number;
    gold: number;
    mats: number;
    vals: number;
    army: number;
    buildings: number;
  }>;
  focus: "army" | "income" | "magic" | "balanced";
  stickyObjectiveSpaceId: MapSpaceId | null;
  stickySinceRound: number;
  visitedThisTurn: MapSpaceId[];
  lastMarketRound: number | null;
  stagnantArmyTurns: number;
};

export type GameState = {
  id: string;
  seed: string;
  mode: GameMode;
  sessionMode?: GameSessionMode;
  controllers?: Record<PlayerId, PlayerController>;
  /**
   * Optional team ids. Equal non-empty ids are allies and cannot fight. Map
   * authored computer teams are created only in single-player.
   */
  playerTeams?: Record<PlayerId, string>;
  /**
   * Single-player computer policy memory keyed by seat. Optional; missing means
   * empty/default memory for that seat (see `src/engine/computer/memory.ts`).
   */
  computerMemory?: Record<PlayerId, ComputerPolicyMemoryState>;
  /**
   * Single-player smoothing (house rule): how many guaranteed first-battle
   * wins each computer seat has consumed — see
   * `src/engine/computer/guaranteed-wins.ts` (capped at
   * COMPUTER_GUARANTEED_WIN_LIMIT = 2). Optional; absent on multiplayer games
   * and legacy snapshots (= none used yet).
   */
  computerGuaranteedWins?: Record<PlayerId, number>;
  /** Rules variant; absent on snapshots saved before modes existed (= legacy). */
  ruleset?: GameRuleset;
  /** Wake of Gods module selection; absent on older snapshots and Legacy games (= off). */
  wog?: WogModOptions;
  /** Anime mod selection; absent on older snapshots and Legacy games (= off). */
  anime?: AnimeModOptions;
  round: number;
  phase: GamePhase;
  activePlayerId: PlayerId;
  priorityPlayerId: PlayerId | null;
  turnOrder: PlayerId[];
  players: Record<PlayerId, PlayerState>;
  map: MapState;
  adventure: AdventureState | null;
  /** Pre-game lobby choices; null once the adventure map is built. */
  setupLobby?: GameSetupState | null;
  /**
   * Battle Test free-setup lobby. Present while phase is "setup" in
   * combat-sandbox mode; null once Begin has started the fight.
   */
  combatSandboxSetup?: CombatSandboxSetupState | null;
  /**
   * Battle Test rules that must survive Begin (morale cards etc.). Adventure
   * games keep these on `adventure`; the sandbox has no adventure object.
   */
  sandboxRules?: { moraleCards?: boolean } | null;
  towns: Record<TownId, TownState>;
  heroes: Record<HeroId, HeroState>;
  combat: CombatState | null;
  decks: Record<DeckId, DeckState>;
  stack: ResolutionStackItem[];
  reactionWindow: ReactionWindow | null;
  activeEffects: ActiveEffectState[];
  /**
   * Rolling window of the most recent events (capped — see appendEvent).
   * Ids stay unique across the whole game through `eventCounter`.
   */
  eventLog: GameEvent[];
  /** Monotonic event id counter; absent on snapshots from before the cap. */
  eventCounter?: number;
  pendingChoice: PendingChoice;
  turn: TurnState;
  /**
   * Room membership/seating (host, seats, observers). Absent on legacy
   * snapshots and on rooms that never opted into hosting — treated as an
   * "open table" with no seat enforcement (the original free-seat test mode).
   */
  room?: RoomMembershipState | null;
  /**
   * Table reactions (emotes): a small, bounded ring buffer of the most recent
   * social broadcasts, synced to every client. Purely cosmetic — it never
   * affects a rule — so it is public (kept in the player view unredacted) and
   * capped at MAX_TABLE_REACTIONS so it can never grow the snapshot. Absent on
   * legacy snapshots (treated as empty). See src/engine/table-reactions.ts.
   */
  tableReactions?: TableReaction[];
  /** Monotonic reaction id counter; each reaction's `seq` is unique + ordered. */
  tableReactionSeq?: number;
  /**
   * AFK vote-kick bookkeeping (multiplayer adventure only): per-seat
   * last-action wall clocks, the open kick-or-wait vote, and the seat a passed
   * vote is currently force-dropping. Absent on legacy snapshots and solo
   * games. Public — it holds no hidden information. See src/engine/afk.ts.
   */
  afk?: AfkState | null;
  /**
   * The open "start a new adventure" confirmation vote (multiplayer adventure
   * only): pressing "New adventure" during an in-progress game opens this
   * instead of wiping immediately, and the reset proceeds only once every live
   * seat has confirmed. Absent when no vote is open, on solo/lobby/finished
   * games, and on legacy snapshots. Public — it holds no hidden information, and
   * is naturally cleared by the reset it triggers. See src/engine/reset-vote.ts.
   */
  resetVote?: ResetVoteState | null;
};

/**
 * One open "start a new adventure" (room reset) confirmation vote. A single
 * vote runs at a time; it ends when every live seat has confirmed (the starter
 * fires the reset), any live seat cancels it, or a player is eliminated.
 */
export type ResetVoteState = {
  /** The seat that requested the new adventure (its request is an implicit confirm). */
  startedByPlayerId: PlayerId;
  /**
   * The browser (stable per-tab clientId) that opened the vote. Once every live
   * seat has confirmed, THIS browser fires the actual reset (so exactly one
   * client resets the room), and the server honours a reset from it as
   * vote-authorised even in a hosted room where it is not the host.
   */
  startedByClientId: string;
  /** Server wall-clock ms when the vote opened (display / stable vote key only). */
  startedAt: number;
  /** Each live seat's confirmation so far (true once confirmed). */
  confirmations: Record<PlayerId, boolean>;
};

/**
 * One open AFK kick-or-wait vote. A single vote runs at a time; it ends the
 * moment any voter chooses "wait" (ask again later), every live voter chooses
 * "kick" (the target is force-dropped), or the target acts (auto-cancelled —
 * they are back).
 */
export type AfkVoteState = {
  /** The seat accused of being AFK. */
  targetPlayerId: PlayerId;
  /** Who opened the vote (their own vote is an implicit "kick"). */
  startedByPlayerId: PlayerId;
  /** Server wall-clock ms when the vote opened. */
  startedAt: number;
  /** Each live voter's choice so far (the target never votes). */
  votes: Record<PlayerId, "kick" | "wait">;
};

export type AfkState = {
  /**
   * Server wall-clock ms of each seat's last successful game action (stamped
   * by the transport's `now`; chat and the AFK votes themselves do not count).
   * Bootstrapped for every live seat on the first stamped action, so a player
   * who never acts still becomes kickable once the idle window passes.
   */
  lastActionAt: Record<PlayerId, number>;
  /** The open kick-or-wait vote, if any. */
  vote: AfkVoteState | null;
  /**
   * When the last vote about each seat ended in "wait" (server wall-clock ms):
   * a new vote against that seat may only be started AFK_REASK_MS later —
   * "asked again every 10 minutes", never spammed.
   */
  lastVoteEndedAt?: Record<PlayerId, number>;
  /**
   * Seat a passed kick vote is force-dropping right now. While set, the
   * server-side driver (src/engine/afk-drop.ts) auto-resolves that seat's
   * pending interactions with default choices and finally applies
   * RESOLVE_AFK_DROP, which concedes their combat and eliminates them.
   */
  droppingPlayerId?: PlayerId | null;
  /**
   * Server wall-clock ms each seat's OPEN turn started burning its 10-minute
   * budget (`TURN_TIME_LIMIT_MS`). Stamped when the turn opens and re-stamped
   * while the seat is paused behind a PvP battle, another player's exclusive
   * interaction or the round-start event barrier — so only time the player
   * could actually spend counts. Dropped when the turn closes. Maintained by
   * `applyTurnClockBookkeeping` on every stamped action; absent on solo tables
   * and legacy snapshots.
   */
  turnOpenSince?: Record<PlayerId, number>;
  /**
   * Seat whose expired turn is being force-ended right now (the 10-minute
   * per-turn budget ran out — `FORCE_TURN_TIMEOUT`). While set, the server-side
   * driver auto-resolves that seat's pending interactions with default picks,
   * retreats it from an open neutral fight, and ends the turn through the
   * normal END_TURN machinery via RESOLVE_TURN_TIMEOUT. Unlike
   * `droppingPlayerId` the seat is NOT eliminated — play just shifts on.
   */
  turnTimeoutPlayerId?: PlayerId | null;
};

/**
 * One table reaction (emote) as stored in the synced ring buffer. Transient,
 * cosmetic and self-describing so a client can render it (bubble + feed line)
 * without any extra lookup, and expire it locally after a moment. `seq` orders
 * them and lets each client show only the ones newer than it has already seen.
 */
export type TableReaction = {
  /** Monotonic, unique across the game (from `tableReactionSeq`). */
  seq: number;
  /** The sender's stable per-browser client id (attribution / de-dupe). */
  clientId: string;
  /** Display name at send time (a room member's name, else the sent fallback). */
  name: string;
  /** A known palette id (validated against TABLE_REACTIONS). */
  reactionId: string;
  /** The sender's seat when they hold one, else null (an observer reacting). */
  seat: RoomSeat | null;
  /** The sender's chosen faction, for the authentic crest on the bubble. */
  factionId: FactionId | null;
};

/**
 * One line in the room's ephemeral live chat (`RoomMembershipState.chat`). A
 * bounded ring buffer holds only the most recent lines, so the snapshot stays
 * small and history is "temporary" by design — nothing is persisted per player.
 * The message is public room content (like member names/seats), so it rides
 * through `getPlayerView` unredacted to every seat and observer.
 */
export type ChatMessage = {
  /** Monotonic, unique within the room (from `RoomMembershipState.chatSeq`). */
  seq: number;
  /** The sender's stable per-browser client id (attribution / "you" styling). */
  clientId: string;
  /** Display name at send time — a room member's name (the account nickname when signed in). */
  name: string;
  /** The sender's seat when they hold one, else "observer" (seat-coloured in the UI). */
  seat: RoomSeat;
  /** The message body: trimmed, control-stripped, capped at MAX_CHAT_TEXT_LENGTH. */
  text: string;
  /** "chat" for a player line; "system" for an engine notice (joins/leaves). */
  kind: "chat" | "system";
  /** Optional client wall-clock (ms) captured at send, for a relative timestamp. Display only. */
  at?: number;
};

/** Reserved player id that controls neutral armies during map combats. */
export const NEUTRAL_PLAYER_ID: PlayerId = "neutrals";

/**
 * The placeholder card id a REDACTED state carries wherever a real card id is
 * hidden from the reader — every player's deck (order is secret even from its
 * owner) and another seat's hand / Spell Book (`redactStateForSeat`,
 * player-view.ts). It lives here, in the types leaf, so a derivation that must
 * tell "I am reading a masked zone" from "that zone is really empty" can import
 * it without pulling player-view's whole dependency graph in (Set Artifacts'
 * piece count does exactly that — see `artifactSetPieceCount`).
 */
export const HIDDEN_CARD_ID: CardId = "hidden";

export type PlayerVisiblePlayerState = Omit<PlayerState, "hand" | "deck" | "spellBook"> & {
  hand: CardId[];
  handCount: number;
  /** Deck order is hidden from every seat, including the owner. */
  deck: CardId[];
  deckCount: number;
  /**
   * Spell Book (house rule): the owner sees the Spell ids; opponents see an empty
   * array and only the count (the Book sits face down next to the hero).
   */
  spellBook: CardId[];
  spellBookCount: number;
  /**
   * Polish Set Artifacts (`polish-set-artifacts`): the PUBLIC set status of this
   * player — one entry per set they hold at least one piece of, with the piece
   * count and how many tiers are live. Empty when the rule is off.
   *
   * Public BY DESIGN (the user's "put them on 'ongoing' effects to be seen all
   * the time for every player"). DESIGNED LEAK: it tells every seat that N
   * members of a set sit somewhere in this player's pool, including their
   * private deck and hand. It never says WHICH zone, WHICH member cards, or
   * anything else about those zones.
   *
   * Unlike `handCount`/`deckCount` this is NOT a view-only recompute — it
   * MIRRORS the real `PlayerState.artifactSetStatus` the engine syncs at the
   * `applyAction` tail. That is what makes it correct on a hosted table, where
   * the client only ever holds a redacted frame with the opponents' zones masked
   * and could not recompute the number itself.
   */
  artifactSetStatus: ArtifactSetStatusView[];
};

/**
 * One set's public status on a player view. Structurally identical to the
 * engine's `ArtifactSetStatus` (`src/engine/artifact-sets.ts`) — declared here
 * so `state.ts` stays dependency-free.
 */
export type ArtifactSetStatusView = {
  setId: string;
  pieces: number;
  activeTiers: number;
  memberCount: number;
};

export type PlayerVisibleDeckState = Omit<DeckState, "drawPile"> & {
  drawCount: number;
};

export type PlayerVisibleState = Omit<GameState, "players" | "decks" | "reactionWindow" | "pendingChoice"> & {
  viewerPlayerId: PlayerId;
  players: Record<PlayerId, PlayerVisiblePlayerState>;
  decks: Record<DeckId, PlayerVisibleDeckState>;
  reactionWindow: ReactionWindow | null;
  pendingChoice: PendingChoice;
};

export type EngineResult = {
  state: GameState;
  events: GameEvent[];
  errors: RulesError[];
};

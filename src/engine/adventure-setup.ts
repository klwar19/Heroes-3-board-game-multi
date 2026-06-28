import { astrologersDeckCardIds } from "@/data/cards/astrologers";
import { abilityDeckBinh, abilityDeckLegacy } from "@/data/cards/abilities-extra";
import {
  artifactDeckBinhMajor,
  artifactDeckBinhMinor,
  artifactDeckBinhRelic,
  artifactDeckLegacy
} from "@/data/cards/artifacts";
import { pandoraDeckCardIds } from "@/data/cards/pandora";
import { WAR_MACHINE_CARD_IDS } from "@/data/cards/permanents";
import { spellDeckBinhBasic, spellDeckBinhExpert, spellDeckLegacy } from "@/data/cards/spells";
import {
  coreBuildingDefinitions,
  coreFactionDefinitions,
  coreHeroDefinitions,
  neutralUnitIdsByTier,
  startingTileByFaction
} from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { allTileDefinitions, ALL_TILE_CONTENT, DEFAULT_TILE_CONTENT, tilePoolIds } from "@/data/map/tiles";
import { CREATURE_BANK_IDS, CREATURE_BANKS } from "@/data/map/creature-banks";
import type { TileContent } from "@/data/map/types";
import { DEFAULT_SCENARIO_ID, scenarioDefinitions, type ScenarioDefinition } from "@/data/map/scenarios";
import {
  addArmyUnit,
  ASTROLOGERS_DECK_ID,
  getUnitSide,
  instantiateTile,
  NEUTRAL_DECK_IDS,
  recomputeSubterraneanGates,
  seaTileBand,
  subterraneanTileBand,
  startAdventureRound,
  startPlayerTurn,
  victoryModeCountsHeroDefeats
} from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import { drawCardsForPlayer, shuffleCards } from "./decks";
import { createSeededRandom, type SeededRandom } from "./random";
import { freshSeed } from "./seed";
import { appendEvent, eventSeedNumber } from "./events";
import { VICTORY_MODE_LABELS } from "./ruleset";
import { hexEquals, tileCentersOverlap, type HexCoord } from "./hex";
import type {
  AdventureState,
  CustomMapTilePlan,
  CustomStartingUnit,
  DeckState,
  DraftFormat,
  FactionId,
  GameAction,
  GameDifficulty,
  GameRuleset,
  GameSetupDraft,
  GameSetupOptions,
  GameSetupState,
  GameState,
  PlayerId,
  PlayerState,
  PvpTroopLoss,
  UnitLevel,
  VictoryMode
} from "./state";
import { MAX_FAR_TILES_PER_PLAYER, NEUTRAL_PLAYER_ID, UNOPENED_FAR_TILE } from "./state";

export type AdventurePlayerConfig = {
  id: string;
  name: string;
  factionId: FactionId;
  heroDefId?: string;
};

export type AdventureSetupOptions = {
  seed?: string;
  ruleset?: GameRuleset;
  /** Win condition: "conquest", "grail", "dragon-hunt" or "dragon-conqueror". */
  victoryMode?: VictoryMode;
  /** PvP Combat casualties: "normal" (lose dead units) or "none" (keep troops). */
  pvpTroopLoss?: PvpTroopLoss;
  /** Naval Battles Creature Banks (default on): offer bank placement on Far/Near tile discovery. */
  creatureBanks?: boolean;
  /** Spell Book house rule (default on): a personal Spell Book each player may stash, cast and boost from. */
  spellBook?: boolean;
  /** Whether players may open their own Ⅱ–Ⅲ Far tiles (default on). Off gives no Far-tile supply. */
  farTileOpening?: boolean;
  /** How many NEW Ⅱ–Ⅲ tiles each player may add to the map (default: the scenario's perPlayer, 2). */
  farTilesPerPlayer?: number;
  difficulty?: GameDifficulty;
  scenarioId?: string;
  players?: AdventurePlayerConfig[];
  /** Seats to open in the lobby (clamped to the scenario's min/max players). */
  playerCount?: number;
  /** Lobby overrides for starting resources, income, units and buildings. */
  startingResources?: { gold: number; buildingMaterials: number; valuables: number };
  startingProduction?: { gold: number; buildingMaterials: number; valuables: number };
  startingUnitTiers?: ("bronze" | "silver" | "gold")[];
  /** Custom starting army (few/pack of any unit); replaces the tier default. */
  startingUnits?: CustomStartingUnit[] | null;
  startingBuildings?: string[];
  /** Map designer: replaces the scenario's face-down Near/Center layout. */
  customMap?: CustomMapTilePlan[] | null;
  /** Content sets whose tiles fill the supply pools (default: the four boxed sets). */
  tileContent?: TileContent[];
  /**
   * Roll the Attack die for the starting player (official setup step 22).
   * Defaults to true; deterministic tests opt out to keep seat order.
   */
  rollFirstPlayer?: boolean;
  /**
   * Force each player to rotate their own faction Ⅰ (home) tile at the start of
   * their first turn, before they may move (BINH house rule). Defaults to the
   * opening-ceremony gate (on unless `rollFirstPlayer` is explicitly false).
   */
  rotateStartTiles?: boolean;
};

/** Unit levels covered by each tier: bronze 1-3, silver 4-5, gold 6-7. */
export const TIER_LEVELS: Record<"bronze" | "silver" | "gold", UnitLevel[]> = {
  bronze: [1, 2, 3],
  silver: [4, 5],
  gold: [6, 7]
};

export const UNIT_LEVELS: UnitLevel[] = [1, 2, 3, 4, 5, 6, 7];

/** Tier of a unit level (1-3 bronze, 4-5 silver, 6-7 gold). */
export function tierOfLevel(level: UnitLevel): "bronze" | "silver" | "gold" {
  return level <= 3 ? "bronze" : level <= 5 ? "silver" : "gold";
}

/** The scenario's tier-based starting units expressed per level (all few). */
export function scenarioStartingUnitLevels(scenario: ScenarioDefinition): CustomStartingUnit[] {
  return scenario.startingUnits.tiers.flatMap((tier) =>
    TIER_LEVELS[tier].map((level) => ({ level, side: "few" as const }))
  );
}

/**
 * Default game options of a fresh lobby: the scenario sheet's numbers with
 * the Field Difficulty Level Table on its Impossible column. The BINH house
 * rules are the table's default mode; Legacy is one click away.
 */
export function defaultGameSetupOptions(scenario: ScenarioDefinition): GameSetupOptions {
  return {
    scenarioId: scenario.id,
    playerCount: scenario.minPlayers,
    ruleset: "binh",
    victoryMode: "conquest",
    pvpTroopLoss: "normal",
    spellBook: true,
    farTileOpening: true,
    farTilesPerPlayer: scenario.farTiles.perPlayer,
    difficulty: "impossible",
    startingResources: { ...scenario.startingResources },
    startingProduction: { ...scenario.startingProduction },
    startingUnitTiers: [...scenario.startingUnits.tiers],
    // One few/pack pick per unit level 1-7; the scenario default as levels.
    startingUnits: scenarioStartingUnitLevels(scenario),
    startingBuildings: [...scenario.startingBuildings],
    customMap: null,
    customMapName: null
  };
}

const DEFAULT_PLAYERS: AdventurePlayerConfig[] = [
  { id: "p1", name: "Catherine of Castle", factionId: "castle", heroDefId: "catherine" },
  { id: "p2", name: "Sandro of Necropolis", factionId: "necropolis", heroDefId: "sandro" }
];

export function getScenario(scenarioId?: string): ScenarioDefinition {
  return scenarioDefinitions[scenarioId ?? DEFAULT_SCENARIO_ID] ?? scenarioDefinitions[DEFAULT_SCENARIO_ID];
}

function makeNeutralDecks(seed: string): Record<string, DeckState> {
  const decks: Record<string, DeckState> = {};
  for (const tier of ["bronze", "silver", "gold", "azure"] as const) {
    const deckId = NEUTRAL_DECK_IDS[tier];
    decks[deckId] = {
      id: deckId,
      drawPile: shuffleCards(neutralUnitIdsByTier[tier], `${seed}#neutral#${tier}`),
      discardPile: []
    };
  }
  return decks;
}

/**
 * Shared deck construction. Legacy: one mixed Spell deck, one Artifact deck.
 * BINH: the rulebook's optional "Split Artifact and Spell Decks" — Basic and
 * Expert Spell decks plus Minor/Major/Relic Artifact decks. Each deck flips
 * its top card to start the discard pile, as printed.
 */
function makeSharedDecks(seed: string, ruleset: GameRuleset): Record<string, DeckState> {
  const make = (id: string, cardIds: string[]): DeckState => ({
    id,
    // Shared decks start fully stacked with an empty discard pile; cards only
    // reach the discard once a Search leaves them there.
    drawPile: shuffleCards(cardIds, `${seed}#deck#${id}`),
    discardPile: []
  });

  if (ruleset === "binh") {
    return {
      spells: make("spells", spellDeckBinhBasic),
      "spells-expert": make("spells-expert", spellDeckBinhExpert),
      abilities: make("abilities", abilityDeckBinh),
      "artifacts-minor": make("artifacts-minor", artifactDeckBinhMinor),
      "artifacts-major": make("artifacts-major", artifactDeckBinhMajor),
      "artifacts-relic": make("artifacts-relic", artifactDeckBinhRelic)
    };
  }

  return {
    spells: make("spells", spellDeckLegacy),
    abilities: make("abilities", abilityDeckLegacy),
    artifacts: make("artifacts", artifactDeckLegacy)
  };
}

function makeAstrologersDeck(seed: string): DeckState {
  return {
    id: ASTROLOGERS_DECK_ID,
    drawPile: shuffleCards(astrologersDeckCardIds, `${seed}#astrologers`),
    discardPile: []
  };
}

function makeStartingDeck(heroDefId: string): string[] {
  const hero = coreHeroDefinitions[heroDefId];
  if (!hero) {
    return [];
  }

  const deck: string[] = [];
  for (let count = 0; count < hero.startingStats.attack; count += 1) {
    deck.push("stat.attack");
  }
  for (let count = 0; count < hero.startingStats.defense; count += 1) {
    deck.push("stat.defense");
  }
  for (let count = 0; count < hero.startingStats.power; count += 1) {
    deck.push("stat.power");
  }
  for (let count = 0; count < hero.startingStats.knowledge; count += 1) {
    deck.push("stat.knowledge");
  }

  // Might heroes start with one Magic Arrow, magic heroes with two.
  deck.push("spell.magic_arrow");
  if (hero.type === "magic") {
    deck.push("spell.magic_arrow");
  }

  deck.push(hero.startingAbilityCardId);
  deck.push(hero.specialtyCardIds[1]);
  return deck;
}

function makePlayer(config: AdventurePlayerConfig, seed: string, options: GameSetupOptions): PlayerState {
  const heroDefId = config.heroDefId ?? coreFactionDefinitions[config.factionId].heroes[0];
  const deck = shuffleCards(makeStartingDeck(heroDefId), `${seed}#starting-deck#${config.id}`);

  const player: PlayerState = {
    id: config.id,
    name: config.name,
    factionId: config.factionId,
    heroDefId,
    deck,
    hand: [],
    discard: [],
    spellBook: [],
    removed: [],
    army: [],
    startingArmy: [],
    resources: { ...options.startingResources },
    production: { ...options.startingProduction },
    townTokens: {
      build: true,
      population: true,
      spellBook: true
    },
    morale: 0,
    needsHandRefresh: false,
    canMulligan: false,
    limits: {
      hand: 4,
      expertUses: 0
    },
    combatStats: {
      spellsCastThisRound: 0,
      spellLimitBonusThisRound: 0,
      expertUsesSpentThisRound: 0,
      spellsCastThisTurn: 0
    }
  };

  if (options.startingUnits) {
    // Starting army by unit level: every player receives their own faction's
    // unit of each picked level (faction unit lists are in level order
    // 1-7), with the chosen few or pack side. An empty list means an empty
    // army. Legacy tier entries cycle through the tier's units; legacy
    // exact-unit entries still apply.
    const faction = coreFactionDefinitions[config.factionId];
    const tierCursors: Record<string, number> = {};
    for (const choice of options.startingUnits) {
      let unitDefId = choice.unitDefId;
      if (choice.level) {
        unitDefId = faction.units[choice.level - 1];
      } else if (choice.tier) {
        const pool = faction.units.filter((candidate) => coreUnitDefinitions[candidate]?.tier === choice.tier);
        if (pool.length === 0) {
          continue;
        }
        const cursor = tierCursors[choice.tier] ?? 0;
        tierCursors[choice.tier] = cursor + 1;
        unitDefId = pool[cursor % pool.length];
      }
      if (!unitDefId) {
        continue;
      }
      // A missing printed side (no pack of that unit) falls back to the few.
      const side = getUnitSide(unitDefId, choice.side) ? choice.side : "few";
      if (getUnitSide(unitDefId, side)) {
        addArmyUnit(player, unitDefId, side);
        player.startingArmy.push({ unitDefId, side });
      }
    }
  } else {
    // Default: one "few" card of each faction unit of the chosen tiers.
    const faction = coreFactionDefinitions[config.factionId];
    for (const unitDefId of faction.units) {
      const unit = coreUnitDefinitions[unitDefId];
      if (unit && options.startingUnitTiers.includes(unit.tier as "bronze" | "silver" | "gold") && unit.few) {
        addArmyUnit(player, unitDefId, "few");
        player.startingArmy.push({ unitDefId, side: "few" });
      }
    }
  }

  return player;
}

function makeNeutralSeatPlayer(): PlayerState {
  return {
    id: NEUTRAL_PLAYER_ID,
    name: "Neutral armies",
    deck: [],
    hand: [],
    discard: [],
    spellBook: [],
    removed: [],
    army: [],
    startingArmy: [],
    resources: { gold: 0, buildingMaterials: 0, valuables: 0 },
    production: { gold: 0, buildingMaterials: 0, valuables: 0 },
    townTokens: { build: false, population: false, spellBook: false },
    morale: 0,
    limits: { hand: 0, expertUses: 0 },
    combatStats: {
      spellsCastThisRound: 0,
      spellLimitBonusThisRound: 0,
      expertUsesSpentThisRound: 0
    }
  };
}

// The old setup-time `draftFarTiles` (which pre-decided each player's supply and
// auto-rerolled for the settlement guarantee) is gone: the supply is now opaque
// UNOPENED markers and the settlement guarantee runs interactively when a player
// flips their 2nd tile (see the Ⅱ–Ⅲ flip flow in adventure-reducer.ts).

/**
 * Validates a designed map against a scenario. The map designer is free-form:
 * tiles may leave holes between them, touch only at a tip, or even float
 * disconnected from the board (room for future teleport gates) — so the only
 * placement rule is that two tiles may not overlap (overlapping flowers would
 * fight over the same hex fields). Malformed, duplicate and overlapping tiles
 * are dropped with a human-readable reason; everything else is accepted exactly
 * where the designer placed it.
 */
export function validateCustomMapPlan(
  plans: CustomMapTilePlan[],
  scenario: ScenarioDefinition
): { accepted: CustomMapTilePlan[]; problems: string[] } {
  const problems: string[] = [];
  const accepted: CustomMapTilePlan[] = [];
  const validGroups = new Set(["starting", "far", "near", "center", "sea", "subterranean"]);

  const wellFormed = plans.filter((plan, index) => {
    if (!Number.isInteger(plan.row) || !Number.isInteger(plan.col)) {
      problems.push(`Tile ${index + 1}: position must be whole grid coordinates.`);
      return false;
    }
    if (!validGroups.has(plan.group)) {
      problems.push(`Tile ${index + 1}: unknown tile group.`);
      return false;
    }
    if (plan.rotation !== undefined && (!Number.isInteger(plan.rotation) || plan.rotation < 0 || plan.rotation > 5)) {
      problems.push(`Tile ${index + 1}: rotation must be 0-5.`);
      return false;
    }
    // Starting (Ⅰ) tiles only carry a seat position; the tile art is the
    // faction's, so they never need a chosen tile id.
    if (plan.group !== "starting" && !plan.faceDown) {
      const def = plan.tileDefId ? allTileDefinitions[plan.tileDefId] : undefined;
      if (!def) {
        problems.push(`Tile ${index + 1}: pick a tile for the face-up slot.`);
        return false;
      }
      if (def.group === "starting") {
        problems.push(`Tile ${index + 1}: starting tiles are placed by faction, not by the designer.`);
        return false;
      }
    }
    return true;
  });

  // Seat anchors: the designer's own Ⅰ tiles when it placed any, otherwise the
  // scenario sheet's fixed seats (keeps older saved maps working unchanged).
  const startingPlans = wellFormed.filter((plan) => plan.group === "starting");
  const placedCenters: HexCoord[] = [];
  if (startingPlans.length > 0) {
    for (const plan of startingPlans) {
      const center = { row: plan.row, col: plan.col };
      if (placedCenters.some((existing) => tileCentersOverlap(existing, center))) {
        problems.push(`Starting tile at ${plan.row},${plan.col}: overlaps another starting tile.`);
        continue;
      }
      placedCenters.push(center);
      accepted.push(plan);
    }
  } else {
    placedCenters.push(...scenario.layout.starts.map((start) => ({ ...start })));
  }
  // Supply tiles drop wherever the designer placed them — holes, tip-only
  // contact and disconnected islands are all allowed. The one rule is no
  // overlap: a tile that would share fields with one already down (a seat or an
  // earlier supply tile) is dropped, with exact duplicates called out as such.
  for (const plan of wellFormed) {
    if (plan.group === "starting") {
      continue;
    }
    const center = { row: plan.row, col: plan.col };
    if (placedCenters.some((existing) => hexEquals(existing, center))) {
      problems.push(`Tile at ${plan.row},${plan.col}: duplicate position.`);
      continue;
    }
    if (placedCenters.some((existing) => tileCentersOverlap(existing, center))) {
      problems.push(`Tile at ${plan.row},${plan.col}: overlaps another tile.`);
      continue;
    }
    accepted.push(plan);
    placedCenters.push(center);
  }

  return { accepted, problems };
}

/**
 * Pops the topmost sea tile of a given wave band (Ⅳ–Ⅴ or Ⅵ–Ⅶ) from a single
 * shared, shuffled sea pool. The Cove sea tiles ship behind one wave back, so
 * the band is read from each tile's strongest guard (see {@link seaTileBand});
 * both the map designer and the symmetric sea scenarios draw their face-down
 * waves through here.
 */
function popSeaBandTile(pool: string[], band: "iv-v" | "vi-vii"): string | undefined {
  for (let index = pool.length - 1; index >= 0; index -= 1) {
    const def = allTileDefinitions[pool[index]];
    if (def && seaTileBand(def) === band) {
      return pool.splice(index, 1)[0];
    }
  }
  return undefined;
}

/**
 * Pops the topmost Subterranean tile of a given guard band (Ⅳ–Ⅴ or Ⅵ–Ⅶ) from
 * the single shared, shuffled underground pool — the underground twin of
 * {@link popSeaBandTile}. The boss band (Ⅵ–Ⅶ) is the three tiles whose centre
 * is a VII guardian (U7 / #C2 Cyclops Stockpile, #C3 Random Town); everything
 * else is the regular Ⅳ–Ⅴ band (see {@link subterraneanTileBand}).
 */
function popSubBandTile(pool: string[], band: "iv-v" | "vi-vii"): string | undefined {
  for (let index = pool.length - 1; index >= 0; index -= 1) {
    const def = allTileDefinitions[pool[index]];
    if (def && subterraneanTileBand(def) === band) {
      return pool.splice(index, 1)[0];
    }
  }
  return undefined;
}

/** Removes and returns a Center tile from the pool that carries `location`. */
function takeCenterTileWith(pool: string[], location: string): string | undefined {
  const index = pool.findIndex((tileDefId) =>
    (allTileDefinitions[tileDefId]?.fields ?? []).some((field) => field.location === location)
  );
  return index >= 0 ? pool.splice(index, 1)[0] : undefined;
}

/**
 * Center (VI–VII) tiles forced by the win condition: Grail Hunt guarantees a
 * Grail; Dragon Hunt and Dragon Conqueror guarantee a Dragon Utopia. The array
 * is index-aligned with the scenario's Center positions; undefined entries fall
 * back to a random draw. Grail Hunt no longer forces a Dragon Utopia — it is
 * not an objective there, so any second Center tile is drawn at random.
 */
function forcedObjectiveCenterTiles(pool: string[], slots: number, mode: VictoryMode): (string | undefined)[] {
  if (slots <= 0) {
    return [];
  }
  if (mode === "grail") {
    return [takeCenterTileWith(pool, "grail")];
  }
  if (mode === "dragon-hunt" || mode === "dragon-conqueror") {
    return [takeCenterTileWith(pool, "dragon_utopia")];
  }
  return [];
}

export function createAdventureGameState(options: AdventureSetupOptions = {}): GameState {
  // A missing seed must NOT collapse to a constant — that is what made every
  // fresh game open on the same map and Creature Bank order. Mint fresh entropy.
  const seed = options.seed ?? freshSeed("homm3bg-adventure");
  const scenario = getScenario(options.scenarioId);
  const setupOptions: GameSetupOptions = {
    ...defaultGameSetupOptions(scenario),
    ...(options.ruleset ? { ruleset: options.ruleset } : {}),
    ...(options.victoryMode ? { victoryMode: options.victoryMode } : {}),
    ...(options.pvpTroopLoss ? { pvpTroopLoss: options.pvpTroopLoss } : {}),
    ...(options.difficulty ? { difficulty: options.difficulty } : {}),
    ...(options.startingResources ? { startingResources: options.startingResources } : {}),
    ...(options.startingProduction ? { startingProduction: options.startingProduction } : {}),
    ...(options.startingUnitTiers ? { startingUnitTiers: options.startingUnitTiers } : {}),
    ...(options.startingUnits !== undefined ? { startingUnits: options.startingUnits } : {}),
    ...(options.startingBuildings ? { startingBuildings: options.startingBuildings } : {}),
    ...(options.creatureBanks !== undefined ? { creatureBanks: options.creatureBanks } : {}),
    ...(options.spellBook !== undefined ? { spellBook: options.spellBook } : {}),
    ...(options.farTileOpening !== undefined ? { farTileOpening: options.farTileOpening } : {}),
    ...(options.farTilesPerPlayer !== undefined ? { farTilesPerPlayer: options.farTilesPerPlayer } : {}),
    ...(options.customMap !== undefined ? { customMap: options.customMap } : {})
  };
  const difficulty = setupOptions.difficulty;
  // Naval Battles Creature Banks default ON: discovering a Far/Near tile with a
  // Blocked Field offers the discovering player a bank token from the matching
  // pile. Off skips both the piles and the offer.
  const creatureBanksOn = setupOptions.creatureBanks ?? true;
  // Spell Book house rule default ON: each player keeps a personal Spell Book.
  const spellBookOn = setupOptions.spellBook ?? true;
  // Far-tile opening default ON: each player drafts a Ⅱ–Ⅲ Far-tile supply they
  // may place. Off gives no supply (the map already provides its Ⅱ–Ⅲ tiles).
  const farTileOpeningOn = setupOptions.farTileOpening ?? true;
  // How many NEW Ⅱ–Ⅲ tiles each player may add to the map (their supply size),
  // overriding the scenario default. Clamped to a sane 0..MAX range.
  const farTilesPerPlayer = Math.max(
    0,
    Math.min(
      MAX_FAR_TILES_PER_PLAYER,
      Math.floor(setupOptions.farTilesPerPlayer ?? scenario.farTiles.perPlayer)
    )
  );
  // Opening home-tile free-rotation (BINH house rule): each player is forced to
  // rotate their own faction Ⅰ tile at the start of their first turn before
  // moving. Part of the opening ceremony, so it defaults to the same gate as the
  // first-player roll — deterministic tests that pin seat order
  // (rollFirstPlayer:false) skip it unless they ask for it explicitly.
  const rotateStartTilesOn = options.rotateStartTiles ?? options.rollFirstPlayer !== false;
  const ruleset: GameRuleset = setupOptions.ruleset;
  const victoryMode: VictoryMode = setupOptions.victoryMode ?? "conquest";
  const pvpTroopLoss: PvpTroopLoss = setupOptions.pvpTroopLoss ?? "normal";
  const playerConfigs = (options.players?.length ? options.players : DEFAULT_PLAYERS).slice(
    0,
    Math.min(scenario.maxPlayers, scenario.layout.starts.length)
  );

  const adventure: AdventureState = {
    difficulty,
    scenarioId: scenario.id,
    tiles: {},
    fields: {},
    playerFarTiles: {},
    // The undrawn Ⅱ–Ⅲ pool and per-player opened counters are populated below,
    // once the scenario's own face-down Far tiles have been dealt from the pool.
    farTilePool: [],
    farTilesOpenedByPlayer: {},
    pendingFarTileFlip: null,
    // Setup: the war machine cards sit face up in a shared supply pile.
    warMachineSupply: [...WAR_MACHINE_CARD_IDS],
    // Pandora's Box fields may draw from this deck instead of rolling dice.
    pandoraDeck: shuffleCards(pandoraDeckCardIds, `${seed}#pandora`),
    // Creature Bank token piles, split by tile tier and shuffled (rulebook p.66).
    ...(creatureBanksOn
      ? {
          creatureBankTokensFar: shuffleCards(
            CREATURE_BANK_IDS.filter((id) => CREATURE_BANKS[id].tier === "far"),
            `${seed}#creature-banks#far`
          ),
          creatureBankTokensNear: shuffleCards(
            CREATURE_BANK_IDS.filter((id) => CREATURE_BANKS[id].tier === "near"),
            `${seed}#creature-banks#near`
          )
        }
      : {}),
    pendingVisit: null,
    rewardQueue: [],
    lastVisitedField: {},
    winnerPlayerId: null,
    victoryMode,
    pvpTroopLoss,
    spellBook: spellBookOn,
    ...(victoryMode === "grail" ? { grail: { status: "uncollected" as const } } : {}),
    // Grail Hunt and Dragon Hunt both track the "defeat every enemy hero" path.
    ...(victoryModeCountsHeroDefeats(victoryMode) ? { heroDefeats: {} } : {}),
    pendingTileChoice: null,
    astrologers: {
      activeCardId: null,
      nextResourceModifiers: { gold: 0, valuables: 0 },
      crazyWizardUsedBy: [],
      swiftWeaselUsedBy: []
    }
  };

  // Tile pools (face-down draws are secret until revealed). Pools only mix
  // the enabled content sets; the default keeps the original four boxed
  // sets, so existing games are unchanged. Random Town tiles (C5 and the
  // expansion ones) never enter pools - tilePoolIds filters them out.
  const tileContent = options.tileContent ?? DEFAULT_TILE_CONTENT;
  const nearPool = shuffleCards(tilePoolIds("near", tileContent), `${seed}#pool#near`);
  const centerPool = shuffleCards(tilePoolIds("center", tileContent), `${seed}#pool#center`);
  const farPool = shuffleCards(tilePoolIds("far", tileContent), `${seed}#pool#far`);
  // Sea and Subterranean tiles ship in later boxes; designer maps may place
  // them regardless of the active content sets, so draw from every set.
  const seaPool = shuffleCards(tilePoolIds("sea", ALL_TILE_CONTENT), `${seed}#pool#sea`);
  const subterraneanPool = shuffleCards(tilePoolIds("subterranean", ALL_TILE_CONTENT), `${seed}#pool#subterranean`);

  const state: GameState = {
    id: "adventure-game",
    seed,
    mode: "adventure",
    ruleset,
    round: 1,
    phase: "player-turn",
    activePlayerId: playerConfigs[0].id,
    priorityPlayerId: null,
    turnOrder: playerConfigs.map((config) => config.id),
    players: Object.fromEntries([
      ...playerConfigs.map((config) => [config.id, makePlayer(config, seed, setupOptions)] as const),
      [NEUTRAL_PLAYER_ID, makeNeutralSeatPlayer()] as const
    ]),
    map: { spaces: {} },
    adventure,
    setupLobby: null,
    towns: {},
    heroes: {},
    combat: null,
    decks: {
      ...makeSharedDecks(seed, ruleset),
      ...makeNeutralDecks(seed),
      [ASTROLOGERS_DECK_ID]: makeAstrologersDeck(seed)
    },
    stack: [],
    reactionWindow: null,
    activeEffects: [],
    eventLog: [
      {
        id: "evt_1",
        type: "GAME_CREATED",
        message: `Created "${scenario.name}" for ${playerConfigs.length} players (${difficulty} difficulty).`
      }
    ],
    pendingChoice: null,
    turn: {
      mode: "ordered",
      simultaneousRoundLimit: 0,
      completedPlayerIds: [],
      observingPlayerId: playerConfigs[0].id
    }
  };

  const customMap = setupOptions.customMap?.length
    ? validateCustomMapPlan(setupOptions.customMap, scenario).accepted
    : null;

  // Seat positions: the designer's own Ⅰ tiles in placement order when it
  // drew any, otherwise the scenario sheet's fixed seats. Each seat falls back
  // to the scenario seat if the design left it unplaced.
  const designerStartCenters = (customMap ?? [])
    .filter((plan) => plan.group === "starting")
    .map((plan) => ({ row: plan.row, col: plan.col }));
  const startCenterFor = (index: number): HexCoord =>
    designerStartCenters[index] ?? scenario.layout.starts[index];

  // Starting tiles: position from the seat (designer or scenario), tile fixed
  // by the chosen faction — no rotation choice. Towns and main heroes go on
  // the tile's center field.
  playerConfigs.forEach((config, index) => {
    const startTileId = startingTileByFaction[config.factionId] ?? "S1";
    const center = startCenterFor(index);
    const tile = instantiateTile(adventure, startTileId, center, 0, false);
    const townFieldId = Object.values(adventure.fields).find(
      (field) => field.tileInstanceId === tile.id && field.slot === 0
    )?.spaceId;

    if (townFieldId) {
      const townField = adventure.fields[townFieldId];
      townField.flagOwnerId = config.id;
      townField.everFlagged = true;

      state.towns[`town_${config.id}`] = {
        id: `town_${config.id}`,
        controllerId: config.id,
        buildings: setupOptions.startingBuildings
          .filter((buildingId) => buildingId.length > 0)
          .map((buildingId) => `${config.factionId}.${buildingId}`)
          // Only buildings this faction actually has (e.g. not every town
          // board carries a Citadel).
          .filter((buildingId) => Boolean(coreBuildingDefinitions[buildingId])),
        factionId: config.factionId,
        fieldId: townFieldId
      };

      const heroId = `hero_${config.id}`;
      state.heroes[heroId] = {
        id: heroId,
        controllerId: config.id,
        kind: "main",
        heroDefId: config.heroDefId ?? coreFactionDefinitions[config.factionId].heroes[0],
        level: 1,
        experience: 0,
        movementPoints: 3,
        movementPointsMax: 3,
        spaceId: townFieldId
      };
      adventure.lastVisitedField[heroId] = townFieldId;

      // Opening home-tile rotation owed (tri-state): false = pending (forced at
      // this player's first turn), left undefined = feature off for this game.
      if (rotateStartTilesOn) {
        state.players[config.id].startTileRotated = false;
      }
    }
  });

  if (customMap) {
    // Map designer: hand-placed tiles instead of the scenario layout.
    // Face-up plans place their chosen tile revealed; face-down plans draw a
    // random tile from their group's pool ("down means random"). Starting (Ⅰ)
    // tiles were already placed by faction in the seat loop above.
    const pools: Record<string, string[]> = {
      far: farPool,
      near: nearPool,
      center: centerPool,
      sea: seaPool,
      subterranean: subterraneanPool
    };

    // A face-down sea slot draws only from its own guard band (Ⅳ–Ⅴ or Ⅵ–Ⅶ):
    // both bands share one shuffled wave pool, so pop the topmost match (via the
    // shared popSeaBandTile). An undefined band (older saved maps) takes any.
    const popSeaTile = (band?: "iv-v" | "vi-vii"): string | undefined =>
      band ? popSeaBandTile(seaPool, band) : seaPool.pop();

    // A face-down underground slot likewise draws only from its own guard band
    // (Ⅳ–Ⅴ or Ⅵ–Ⅶ) out of the one shuffled subterranean pool. An undefined
    // band (older saved maps) takes any underground tile, as before.
    const popSubTile = (band?: "iv-v" | "vi-vii"): string | undefined =>
      band ? popSubBandTile(subterraneanPool, band) : subterraneanPool.pop();

    // Designed face-up tiles never also hide in a face-down pool draw.
    for (const plan of customMap) {
      if (!plan.faceDown && plan.tileDefId) {
        for (const pool of Object.values(pools)) {
          const index = pool.indexOf(plan.tileDefId);
          if (index !== -1) {
            pool.splice(index, 1);
          }
        }
      }
    }

    // Center (VI–VII) tiles forced by the win condition (Grail Hunt → a Grail,
    // Dragon Hunt/Conqueror → a Dragon Utopia) apply to face-down Center slots
    // here too, exactly like the scenario layout — otherwise a designed map could
    // never guarantee the objective tile its victory mode needs.
    const faceDownCenterSlots = customMap.filter(
      (plan) => plan.faceDown && plan.group === "center"
    ).length;
    const forcedCenters = forcedObjectiveCenterTiles(centerPool, faceDownCenterSlots, victoryMode);
    let forcedCenterIndex = 0;

    for (const plan of customMap) {
      if (plan.group === "starting") {
        continue;
      }
      const center = { row: plan.row, col: plan.col };
      if (plan.faceDown) {
        let tileDefId: string | undefined;
        if (plan.group === "sea") {
          tileDefId = popSeaTile(plan.seaBand);
        } else if (plan.group === "subterranean") {
          tileDefId = popSubTile(plan.subBand);
        } else if (plan.group === "center") {
          // The win-condition objective fills the first face-down Center slot;
          // any further Center slots stay a random draw.
          tileDefId = forcedCenters[forcedCenterIndex++] ?? centerPool.pop();
        } else {
          tileDefId = pools[plan.group]?.pop();
        }
        if (tileDefId) {
          // "Down means random", but the designer's chosen orientation still
          // rides along — the random tile is revealed at the slot's rotation.
          instantiateTile(adventure, tileDefId, center, plan.rotation ?? 0, true);
        }
      } else if (plan.tileDefId) {
        instantiateTile(adventure, plan.tileDefId, center, plan.rotation ?? 0, false);
      }
    }
  } else {
    // Face-down Far (II–III) tiles fixed in the layout (symmetric clash maps use
    // these as the outer ring between the starts and the Ⅳ–Ⅴ ring).
    for (const center of scenario.layout.far ?? []) {
      const tileDefId = farPool.pop();
      if (tileDefId) {
        instantiateTile(adventure, tileDefId, center, 0, true);
      }
    }
    // Face-down Near (IV–V) and Center (VI–VII) tiles per the scenario layout.
    for (const center of scenario.layout.near) {
      const tileDefId = nearPool.pop();
      if (tileDefId) {
        instantiateTile(adventure, tileDefId, center, 0, true);
      }
    }
    // Grail Hunt / Dragon Conqueror force their objective onto the VI–VII
    // Center tiles; any remaining Center tiles stay random.
    const forcedCenters = forcedObjectiveCenterTiles(centerPool, scenario.layout.center.length, victoryMode);
    scenario.layout.center.forEach((center, index) => {
      const tileDefId = forcedCenters[index] ?? centerPool.pop();
      if (tileDefId) {
        instantiateTile(adventure, tileDefId, center, 0, true);
      }
    });
    // Face-down sea tiles (symmetric sea maps): each slot draws the top tile of
    // its own Ⅳ–Ⅴ or Ⅵ–Ⅶ wave band from the shared, shuffled sea pool.
    for (const slot of scenario.layout.sea ?? []) {
      const tileDefId = popSeaBandTile(seaPool, slot.band);
      if (tileDefId) {
        instantiateTile(adventure, tileDefId, { row: slot.row, col: slot.col }, 0, true);
      }
    }
    // Face-down Subterranean tiles (symmetric underground maps). The gates that
    // bridge them to the adjacent Surface seats are carved by
    // recomputeSubterraneanGates below, so every seat can descend.
    for (const center of scenario.layout.subterranean ?? []) {
      const tileDefId = subterraneanPool.pop();
      if (tileDefId) {
        instantiateTile(adventure, tileDefId, center, 0, true);
      }
    }
  }

  // Carve the Subterranean Gate Tokens for any Surface/Subterranean tiles the
  // layout placed face-up next to each other (the rest are carved as tiles are
  // discovered during play).
  recomputeSubterraneanGates(adventure);

  // Far (II–III) tile supplies. The tiles are NOT decided here: each player gets
  // `farTilesPerPlayer` face-down UNOPENED markers, and a truly-random tile is
  // drawn from the remaining far pool only when the player actually opens one
  // (the "flip"). Off, or a count of 0, gives an empty supply. The pool of tiles
  // left after the scenario's own face-down Far tiles is parked on the adventure
  // for those in-play draws (and the reroll returns).
  adventure.farTilePool = [...farPool];
  const openedCounters = (adventure.farTilesOpenedByPlayer ??= {});
  for (const config of playerConfigs) {
    adventure.playerFarTiles[config.id] =
      farTileOpeningOn && farTilesPerPlayer > 0
        ? new Array<string>(farTilesPerPlayer).fill(UNOPENED_FAR_TILE)
        : [];
    openedCounters[config.id] = 0;
  }

  // Roll for the starting player FIRST — before a single card is dealt — so
  // the game opens with the first-player ceremony and only then deals hands.
  // Official setup step 22: every player rolls the Attack die, the highest
  // result starts (ties reroll among the tied players). The full roll history
  // is kept on the adventure so every seat can read it.
  if (options.rollFirstPlayer !== false) {
    rollFirstPlayer(state, seed);
  }

  // Then everyone draws their starting hand (visible from the first moment),
  // and the active player's turn starts as usual.
  for (const config of playerConfigs) {
    drawCardsForPlayer(state, config.id, state.players[config.id].limits.hand);
  }

  startAdventureRound(state);
  startPlayerTurn(state, state.activePlayerId);
  // Drain the opening round-start / start-of-turn rewards — chiefly the
  // start-of-turn hand snapshot — so the first player's hand step is live the
  // instant the game state is handed back, before any action is dispatched.
  pumpAdventureQueues(state);

  return state;
}

/**
 * Rolls the Attack die for every seated player to pick the starting player.
 * Tied leaders reroll among themselves; turn order then rotates so the winner
 * goes first while the table's seating order stays intact.
 */
function rollFirstPlayer(state: GameState, seed: string): void {
  const playerIds = state.turnOrder.filter((playerId) => playerId !== NEUTRAL_PLAYER_ID);
  if (playerIds.length < 2 || !state.adventure) {
    return;
  }

  const random = createSeededRandom(`${seed}#first-player`);
  const faces = [-1, -1, 0, 0, 1, 1];
  const attempts: { rolls: { playerId: string; name: string; value: number }[] }[] = [];

  let contenders = [...playerIds];
  let winner = contenders[0];
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const rolls = contenders.map((playerId) => ({
      playerId,
      name: state.players[playerId]?.name ?? playerId,
      value: faces[random.nextInt(0, faces.length - 1)]
    }));
    attempts.push({ rolls });

    const best = Math.max(...rolls.map((roll) => roll.value));
    const leaders = rolls.filter((roll) => roll.value === best).map((roll) => roll.playerId);
    if (leaders.length === 1) {
      winner = leaders[0];
      break;
    }
    contenders = leaders;
    winner = leaders[0];
  }

  state.adventure.firstPlayerRoll = { attempts, winnerPlayerId: winner };

  // Rotate the seating order so the winner starts; everyone else follows in
  // the original clockwise order.
  const winnerIndex = playerIds.indexOf(winner);
  state.turnOrder = [...playerIds.slice(winnerIndex), ...playerIds.slice(0, winnerIndex)];
  state.activePlayerId = winner;

  appendEvent(state, {
    type: "FIRST_PLAYER_ROLLED",
    attempts,
    winnerPlayerId: winner
  });
}

// ---------------------------------------------------------------------------
// Map-setup lobby: pick factions and heroes, then build the scenario map
// ---------------------------------------------------------------------------

const LOBBY_SEAT_NAMES = ["Player 1", "Player 2", "Player 3", "Player 4"];

/** Seats the lobby opens for a scenario, clamped to its min/max players. */
function clampSeatCount(scenario: ScenarioDefinition, requested: number | undefined): number {
  const ceiling = Math.min(scenario.maxPlayers, scenario.layout.starts.length);
  const wanted = Number.isFinite(requested) ? Math.floor(requested as number) : scenario.minPlayers;
  return Math.max(scenario.minPlayers, Math.min(ceiling, wanted));
}

/** A fresh lobby PlayerState: an empty seat that mirrors the setup options. */
function makeLobbySeatPlayer(playerId: PlayerId, name: string, options: GameSetupOptions): PlayerState {
  return {
    id: playerId,
    name,
    deck: [],
    hand: [],
    discard: [],
    spellBook: [],
    removed: [],
    army: [],
    startingArmy: [],
    resources: { ...options.startingResources },
    production: { ...options.startingProduction },
    townTokens: { build: true, population: true, spellBook: true },
    morale: 0,
    limits: { hand: 4, expertUses: 0 },
    combatStats: {
      spellsCastThisRound: 0,
      spellLimitBonusThisRound: 0,
      expertUsesSpentThisRound: 0
    }
  };
}

/**
 * Grows or shrinks the lobby to `targetCount` seats in place: new seats open
 * empty (p3, p4…), trimmed seats and their players drop out, and turn order /
 * the active seat stay valid. Returns the seat count actually set.
 */
function resizeLobbySeats(state: GameState, scenario: ScenarioDefinition, targetCount: number): number {
  const lobby = state.setupLobby;
  if (!lobby) {
    return 0;
  }
  const count = clampSeatCount(scenario, targetCount);
  if (count === lobby.seats.length) {
    return count;
  }

  if (count > lobby.seats.length) {
    for (let index = lobby.seats.length; index < count; index += 1) {
      const playerId = `p${index + 1}`;
      const name = LOBBY_SEAT_NAMES[index] ?? `Player ${index + 1}`;
      lobby.seats.push({ playerId, name, factionId: null, heroDefId: null });
      state.players[playerId] = makeLobbySeatPlayer(playerId, name, lobby.options);
    }
  } else {
    for (const seat of lobby.seats.slice(count)) {
      delete state.players[seat.playerId];
    }
    lobby.seats = lobby.seats.slice(0, count);
  }

  state.turnOrder = lobby.seats.map((seat) => seat.playerId);
  if (!state.turnOrder.includes(state.activePlayerId)) {
    state.activePlayerId = state.turnOrder[0];
  }
  lobby.options.playerCount = count;
  return count;
}

/** Opens a new room in the map-setup phase: seats wait for faction picks. */
export function createAdventureLobbyState(options: AdventureSetupOptions = {}): GameState {
  // Crypto entropy, not just Date.now() — two lobbies minted in the same
  // millisecond (or on a frozen-clock edge isolate) would otherwise share a seed
  // and, once started, build the identical map and bank order.
  const seed = options.seed ?? freshSeed("homm3bg-lobby");
  const scenario = getScenario(options.scenarioId);
  const setupOptions = defaultGameSetupOptions(scenario);
  const seatCount = clampSeatCount(scenario, options.playerCount ?? setupOptions.playerCount);
  setupOptions.playerCount = seatCount;

  const seats = Array.from({ length: seatCount }, (_, index) => ({
    playerId: `p${index + 1}`,
    name: LOBBY_SEAT_NAMES[index] ?? `Player ${index + 1}`,
    factionId: null,
    heroDefId: null
  }));

  const players = Object.fromEntries(
    seats.map((seat) => [seat.playerId, makeLobbySeatPlayer(seat.playerId, seat.name, setupOptions)] as const)
  );

  return {
    id: "adventure-lobby",
    seed,
    mode: "adventure",
    ruleset: setupOptions.ruleset,
    round: 0,
    phase: "setup",
    activePlayerId: seats[0].playerId,
    priorityPlayerId: null,
    turnOrder: seats.map((seat) => seat.playerId),
    players,
    map: { spaces: {} },
    adventure: null,
    setupLobby: {
      scenarioId: scenario.id,
      options: setupOptions,
      seats,
      draft: { format: "open", bannedHeroDefIds: [], banPicksMade: 0, seatRolls: {} }
    },
    towns: {},
    heroes: {},
    combat: null,
    decks: {},
    stack: [],
    reactionWindow: null,
    activeEffects: [],
    eventLog: [
      {
        id: "evt_1",
        type: "GAME_CREATED",
        message: `Map setup for "${scenario.name}": pick factions, set the options, then start the adventure.`
      }
    ],
    pendingChoice: null,
    turn: {
      mode: "ordered",
      simultaneousRoundLimit: 0,
      completedPlayerIds: [],
      observingPlayerId: seats[0].playerId
    }
  };
}

const VALID_DIFFICULTIES: GameDifficulty[] = ["easy", "normal", "hard", "impossible"];
const VALID_UNIT_TIERS = ["bronze", "silver", "gold"] as const;
const MAX_CUSTOM_STARTING_UNITS = 12;
const MAX_CUSTOM_MAP_TILES = 40;

function sanitizeResources(value: {
  gold: number;
  buildingMaterials: number;
  valuables: number;
}): { gold: number; buildingMaterials: number; valuables: number } {
  const clamp = (amount: number) => Math.max(0, Math.min(99, Math.floor(Number(amount) || 0)));
  return {
    gold: clamp(value.gold),
    buildingMaterials: clamp(value.buildingMaterials),
    valuables: clamp(value.valuables)
  };
}

/**
 * Map-setup lobby: adjust the adjustable setup steps — scenario, neutral
 * difficulty (Impossible by default), starting resources, base income,
 * starting units and pre-built buildings. Any seated player may adjust them
 * until the adventure starts.
 */
export function setGameOptions(state: GameState, action: Extract<GameAction, { type: "SET_GAME_OPTIONS" }>): void {
  const lobby = state.setupLobby;
  if (!lobby || state.phase !== "setup") {
    throw new Error("Game options can only change during map setup.");
  }

  if (!lobby.seats.some((seat) => seat.playerId === action.playerId)) {
    throw new Error("Only seated players may change the game options.");
  }

  const next = action.options;
  const changes: string[] = [];

  if (next.ruleset !== undefined) {
    if (next.ruleset !== "legacy" && next.ruleset !== "binh") {
      throw new Error("Unknown game mode.");
    }
    lobby.options.ruleset = next.ruleset;
    state.ruleset = next.ruleset;
    changes.push(`game mode ${next.ruleset === "binh" ? "House rules BINH" : "Legacy (rulebook)"}`);
  }

  if (next.victoryMode !== undefined) {
    const validVictoryModes: VictoryMode[] = ["conquest", "grail", "dragon-hunt", "dragon-conqueror"];
    if (!validVictoryModes.includes(next.victoryMode)) {
      throw new Error("Unknown win condition.");
    }
    lobby.options.victoryMode = next.victoryMode;
    changes.push(`win condition ${VICTORY_MODE_LABELS[next.victoryMode]}`);
  }

  if (next.pvpTroopLoss !== undefined) {
    if (next.pvpTroopLoss !== "normal" && next.pvpTroopLoss !== "none") {
      throw new Error("Unknown PvP troop-loss option.");
    }
    lobby.options.pvpTroopLoss = next.pvpTroopLoss;
    changes.push(`PvP combat ${next.pvpTroopLoss === "none" ? "keeps troops" : "loses troops"}`);
  }

  if (next.spellBook !== undefined) {
    lobby.options.spellBook = Boolean(next.spellBook);
    changes.push(`Spell Book ${next.spellBook ? "on" : "off"}`);
  }

  if (next.farTileOpening !== undefined) {
    lobby.options.farTileOpening = Boolean(next.farTileOpening);
    changes.push(`Ⅱ–Ⅲ tile opening ${next.farTileOpening ? "on" : "off"}`);
  }

  if (next.farTilesPerPlayer !== undefined) {
    if (!Number.isFinite(next.farTilesPerPlayer)) {
      throw new Error("Ⅱ–Ⅲ tiles per player must be a number.");
    }
    const count = Math.max(0, Math.min(MAX_FAR_TILES_PER_PLAYER, Math.floor(next.farTilesPerPlayer)));
    lobby.options.farTilesPerPlayer = count;
    changes.push(`new Ⅱ–Ⅲ tiles per player ${count}`);
  }

  if (next.scenarioId !== undefined) {
    if (!scenarioDefinitions[next.scenarioId]) {
      throw new Error("Unknown scenario.");
    }
    lobby.scenarioId = next.scenarioId;
    lobby.options.scenarioId = next.scenarioId;
    changes.push(`scenario ${scenarioDefinitions[next.scenarioId].name}`);
    // A new scenario may allow fewer seats — trim the lobby to fit.
    const before = lobby.seats.length;
    const trimmed = resizeLobbySeats(state, scenarioDefinitions[next.scenarioId], before);
    if (trimmed !== before) {
      changes.push(`players ${trimmed}`);
    }
  }

  if (next.playerCount !== undefined) {
    const scenario = getScenario(lobby.options.scenarioId);
    const count = resizeLobbySeats(state, scenario, next.playerCount);
    changes.push(`players ${count}`);
  }

  if (next.difficulty !== undefined) {
    if (!VALID_DIFFICULTIES.includes(next.difficulty)) {
      throw new Error("Unknown difficulty.");
    }
    lobby.options.difficulty = next.difficulty;
    changes.push(`difficulty ${next.difficulty}`);
  }

  if (next.startingResources !== undefined) {
    lobby.options.startingResources = sanitizeResources(next.startingResources);
    const r = lobby.options.startingResources;
    changes.push(`starting resources ${r.gold}g/${r.buildingMaterials}m/${r.valuables}v`);
  }

  if (next.startingProduction !== undefined) {
    lobby.options.startingProduction = sanitizeResources(next.startingProduction);
    const p = lobby.options.startingProduction;
    changes.push(`income ${p.gold}g/${p.buildingMaterials}m/${p.valuables}v`);
  }

  if (next.startingUnitTiers !== undefined) {
    lobby.options.startingUnitTiers = VALID_UNIT_TIERS.filter((tier) => next.startingUnitTiers?.includes(tier));
    changes.push(`starting units ${lobby.options.startingUnitTiers.join("+") || "none"}`);
  }

  if (next.startingUnits !== undefined) {
    if (next.startingUnits === null) {
      lobby.options.startingUnits = null;
      changes.push("starting army back to unit tiers");
    } else {
      if (next.startingUnits.length > MAX_CUSTOM_STARTING_UNITS) {
        throw new Error(`A starting army holds at most ${MAX_CUSTOM_STARTING_UNITS} unit cards.`);
      }
      // One few/pack pick per unit level 1-7; each player receives their own
      // faction's unit of that level. Legacy tier entries from old lobbies
      // fold into the first level of their tier.
      const cleaned: CustomStartingUnit[] = [];
      const seenLevels = new Set<number>();
      for (const choice of next.startingUnits) {
        if (!choice || (choice.side !== "few" && choice.side !== "pack")) {
          throw new Error("Starting units must be a few or pack side.");
        }
        let level = choice.level;
        if (level === undefined) {
          const tier =
            choice.tier ??
            (choice.unitDefId
              ? (coreUnitDefinitions[choice.unitDefId]?.tier as "bronze" | "silver" | "gold" | undefined)
              : undefined);
          level = tier ? TIER_LEVELS[tier]?.[0] : undefined;
        }
        if (!Number.isInteger(level) || (level as number) < 1 || (level as number) > 7) {
          throw new Error("Starting units pick a unit level from 1 to 7.");
        }
        if (seenLevels.has(level as number)) {
          throw new Error(`Level ${level} is picked twice — one few or pack card per level.`);
        }
        seenLevels.add(level as number);
        cleaned.push({ level: level as UnitLevel, side: choice.side });
      }
      cleaned.sort((left, right) => (left.level ?? 0) - (right.level ?? 0));
      lobby.options.startingUnits = cleaned;
      changes.push(
        cleaned.length === 0
          ? "starting army: no units"
          : `starting army (${cleaned.map((choice) => `lv ${choice.level} ${choice.side}`).join(", ")})`
      );
    }
  }

  if (next.startingBuildings !== undefined) {
    lobby.options.startingBuildings = next.startingBuildings.filter(
      (buildingId): buildingId is string => typeof buildingId === "string" && buildingId.length > 0
    );
    changes.push(`starting buildings ${lobby.options.startingBuildings.join(", ") || "none"}`);
  }

  if (next.customMap !== undefined) {
    const mapName =
      typeof next.customMapName === "string" ? next.customMapName.trim().slice(0, 48) : null;
    if (next.customMap === null) {
      lobby.options.customMap = null;
      lobby.options.customMapName = null;
      changes.push("map back to the scenario layout");
    } else {
      if (next.customMap.length > MAX_CUSTOM_MAP_TILES) {
        throw new Error(`A designed map holds at most ${MAX_CUSTOM_MAP_TILES} tiles.`);
      }
      const scenario = getScenario(lobby.options.scenarioId);
      const { accepted, problems } = validateCustomMapPlan(next.customMap, scenario);
      if (problems.length > 0) {
        throw new Error(problems[0]);
      }
      lobby.options.customMap = accepted;
      lobby.options.customMapName = mapName;
      changes.push(
        `designed map ${mapName ? `"${mapName}" ` : ""}(${accepted.length} tile${accepted.length === 1 ? "" : "s"})`
      );
    }
  }

  if (changes.length === 0) {
    return;
  }

  // Keep the waiting lobby seats' resource preview in sync.
  for (const seat of lobby.seats) {
    const player = state.players[seat.playerId];
    if (player) {
      player.resources = { ...lobby.options.startingResources };
      player.production = { ...lobby.options.startingProduction };
    }
  }

  appendEvent(state, {
    type: "GAME_OPTIONS_CHANGED",
    playerId: action.playerId,
    message: `${state.players[action.playerId]?.name ?? action.playerId} set ${changes.join("; ")}.`
  });
}

/**
 * Commit a seat's faction + main hero — the final "pick a hero" step of every
 * format. The per-format gate enforces the flow:
 *  - "open" (TYPE 4): any untaken town + any of its heroes.
 *  - "draft" (TYPE 1): only in the pick phase, only the seat's own locked town,
 *    and never a banned hero.
 *  - "random-choice" (TYPE 3): only the seat's locked town and only a hero from
 *    its two rolled options.
 *  - "random" (TYPE 2): manual picks are refused — roll the dice instead.
 */
export function chooseFaction(state: GameState, action: Extract<GameAction, { type: "CHOOSE_FACTION" }>): void {
  const lobby = state.setupLobby;
  if (!lobby || state.phase !== "setup") {
    throw new Error("Factions can only be chosen during map setup.");
  }

  const seat = lobby.seats.find((candidate) => candidate.playerId === action.playerId);
  if (!seat) {
    throw new Error("That seat does not exist in this scenario.");
  }

  const faction = coreFactionDefinitions[action.factionId];
  if (!faction) {
    throw new Error("Unknown faction.");
  }

  if (!faction.heroes.includes(action.heroDefId)) {
    throw new Error("That hero does not lead this faction.");
  }

  const taken = lobby.seats.some(
    (candidate) => candidate.playerId !== action.playerId && candidate.factionId === action.factionId
  );
  if (taken) {
    throw new Error("Another player already picked that faction.");
  }

  const draft = lobbyDraft(lobby);
  if (draft.format === "random") {
    throw new Error("This seat is on Full random — roll a random town and hero instead.");
  }
  if (draft.format === "draft") {
    const phase = getDraftPhase(lobby);
    if (!phase.pickPhaseOpen) {
      throw new Error(
        phase.townLockedAll
          ? "Finish the ban phase before picking heroes."
          : "Every seat must lock a town before heroes can be picked."
      );
    }
    if (seat.factionId !== action.factionId) {
      throw new Error("Pick a hero from your own locked town.");
    }
    if (draft.bannedHeroDefIds.includes(action.heroDefId)) {
      throw new Error("That hero is banned out of this draft.");
    }
  } else if (draft.format === "random-choice") {
    if (seat.factionId !== action.factionId) {
      throw new Error("Pick a hero from your own locked town.");
    }
    const options = draft.seatRolls?.[action.playerId]?.heroOptions ?? [];
    if (options.length === 0) {
      throw new Error("Roll your two hero options first.");
    }
    if (!options.includes(action.heroDefId)) {
      throw new Error("Choose one of your two rolled heroes.");
    }
  }

  seat.factionId = action.factionId;
  seat.heroDefId = action.heroDefId;
  clearSeatRolls(draft, action.playerId);
  const hero = coreHeroDefinitions[action.heroDefId];
  const player = state.players[action.playerId];
  if (player && hero) {
    player.name = `${hero.name} of ${faction.name}`;
  }

  appendEvent(state, {
    type: "FACTION_CHOSEN",
    playerId: action.playerId,
    factionId: action.factionId,
    heroDefId: action.heroDefId
  });
}

/** Human labels for the four setup formats (shared by the engine log and UI). */
export const DRAFT_FORMAT_LABELS: Record<DraftFormat, string> = {
  open: "Free pick",
  draft: "Draft (ban-pick)",
  random: "Full random",
  "random-choice": "Random with choice"
};

const VALID_DRAFT_FORMATS: DraftFormat[] = ["open", "draft", "random", "random-choice"];

/**
 * Normalised draft block for a lobby. Snapshots saved before this feature have no
 * `draft` (or carry the old `{ mode }` shape), so reads default to free pick.
 */
function lobbyDraft(lobby: GameSetupState): GameSetupDraft {
  const draft = lobby.draft;
  return {
    format: draft?.format ?? "open",
    bannedHeroDefIds: draft?.bannedHeroDefIds ?? [],
    banPicksMade: draft?.banPicksMade ?? 0,
    seatRolls: draft?.seatRolls ?? {}
  };
}

/** Ensures the lobby has a fully-populated, mutable draft block and returns it. */
function ensureLobbyDraft(lobby: GameSetupState): Required<GameSetupDraft> {
  const draft = (lobby.draft ??= { format: "open", bannedHeroDefIds: [], banPicksMade: 0, seatRolls: {} });
  draft.format ??= "open";
  draft.bannedHeroDefIds ??= [];
  draft.banPicksMade ??= 0;
  draft.seatRolls ??= {};
  return draft as Required<GameSetupDraft>;
}

/** Clears a seat's pending two-way town/hero roll options. */
function clearSeatRolls(draft: GameSetupDraft, playerId: PlayerId): void {
  if (draft.seatRolls?.[playerId]) {
    delete draft.seatRolls[playerId];
  }
}

/** Picks up to `count` distinct items from `items` using the seeded RNG. */
function pickDistinct<T>(random: SeededRandom, items: readonly T[], count: number): T[] {
  const pool = [...items];
  const picked: T[] = [];
  const take = Math.min(count, pool.length);
  for (let index = 0; index < take; index += 1) {
    picked.push(pool.splice(random.nextInt(0, pool.length - 1), 1)[0]);
  }
  return picked;
}

export type DraftPhaseInfo = {
  format: DraftFormat;
  seatCount: number;
  /** Every seat has locked a town (the gate into the "draft" ban phase). */
  townLockedAll: boolean;
  /** Bans each seat gets in the "draft" format: 2 in a 2-player game, else 1. */
  banBudgetPerSeat: number;
  /** Total bans the "draft" phase runs (`banBudgetPerSeat * seatCount`). */
  totalBans: number;
  banPicksMade: number;
  /** "draft": all towns locked and bans still remaining. */
  banPhaseActive: boolean;
  /** "draft": every ban committed — heroes may now be picked. */
  pickPhaseOpen: boolean;
  /** Whose ban turn it is right now (round-robin by seat order), else null. */
  currentBannerPlayerId: PlayerId | null;
};

/**
 * Single source of truth for where a "draft"-format lobby is in its flow, reused
 * by the engine handlers, the legal-action list and the setup UI so they never
 * disagree. Town locking is per-seat and parallel; once ALL towns are locked the
 * ban phase opens and goes around the table in seat order (each seat bans
 * `banBudgetPerSeat` heroes); once every ban is in, the pick phase opens.
 */
export function getDraftPhase(lobby: GameSetupState): DraftPhaseInfo {
  const draft = lobbyDraft(lobby);
  const seatOrder = lobby.seats.map((seat) => seat.playerId);
  const seatCount = seatOrder.length;
  const townLockedAll = seatCount > 0 && lobby.seats.every((seat) => Boolean(seat.factionId));
  const banBudgetPerSeat = draft.format === "draft" ? (seatCount === 2 ? 2 : 1) : 0;
  const totalBans = banBudgetPerSeat * seatCount;
  const banPicksMade = draft.banPicksMade ?? 0;
  const banPhaseActive = draft.format === "draft" && townLockedAll && banPicksMade < totalBans;
  const pickPhaseOpen = draft.format === "draft" && townLockedAll && banPicksMade >= totalBans;
  const currentBannerPlayerId =
    banPhaseActive && seatCount > 0 ? (seatOrder[banPicksMade % seatCount] ?? null) : null;
  return {
    format: draft.format,
    seatCount,
    townLockedAll,
    banBudgetPerSeat,
    totalBans,
    banPicksMade,
    banPhaseActive,
    pickPhaseOpen,
    currentBannerPlayerId
  };
}

/**
 * The heroes `playerId` may ban in the "draft" ban phase: every hero belonging
 * to ANOTHER seat's locked town, minus those already banned. A player can never
 * ban their own town's heroes (you weaken opponents, not yourself).
 */
export function bannableHeroesForSeat(lobby: GameSetupState, playerId: PlayerId): string[] {
  const draft = lobbyDraft(lobby);
  const banned = new Set(draft.bannedHeroDefIds);
  const heroes: string[] = [];
  for (const seat of lobby.seats) {
    if (seat.playerId === playerId || !seat.factionId) {
      continue;
    }
    const faction = coreFactionDefinitions[seat.factionId];
    if (!faction) {
      continue;
    }
    for (const heroDefId of faction.heroes) {
      if (!banned.has(heroDefId)) {
        heroes.push(heroDefId);
      }
    }
  }
  return heroes;
}

function factionName(factionId: FactionId): string {
  return coreFactionDefinitions[factionId]?.name ?? factionId;
}

function heroName(heroDefId: string): string {
  return coreHeroDefinitions[heroDefId]?.name ?? heroDefId;
}

function seatedPlayerName(state: GameState, playerId: PlayerId): string {
  return state.players[playerId]?.name ?? playerId;
}

/**
 * Map-setup lobby (Draft tab): choose the setup format. Always restarts the
 * draft — it clears every seat's town/hero pick, the bans and the pending rolls
 * — so the chosen flow begins from a clean slate (and re-selecting the current
 * format is a deliberate "restart this draft").
 */
export function setDraftFormat(state: GameState, action: Extract<GameAction, { type: "SET_DRAFT_FORMAT" }>): void {
  const lobby = state.setupLobby;
  if (!lobby || state.phase !== "setup") {
    throw new Error("The setup format can only change during map setup.");
  }
  if (!lobby.seats.some((seat) => seat.playerId === action.playerId)) {
    throw new Error("Only seated players may change the setup format.");
  }
  if (!VALID_DRAFT_FORMATS.includes(action.format)) {
    throw new Error("Unknown setup format.");
  }

  const draft = ensureLobbyDraft(lobby);
  draft.format = action.format;
  draft.bannedHeroDefIds = [];
  draft.banPicksMade = 0;
  draft.seatRolls = {};
  // Restart every seat: a different format means a different flow, so stale picks
  // would be illegal under the new rules.
  for (const seat of lobby.seats) {
    seat.factionId = null;
    seat.heroDefId = null;
    const player = state.players[seat.playerId];
    if (player) {
      player.name = seat.name;
    }
  }

  appendEvent(state, {
    type: "GAME_OPTIONS_CHANGED",
    playerId: action.playerId,
    message: `${seatedPlayerName(state, action.playerId)} set the setup format to ${DRAFT_FORMAT_LABELS[action.format]}.`
  });
}

/**
 * Map-setup lobby: roll two random untaken towns for this seat to choose between
 * (the "draft" / "random-choice" town step). A re-roll before locking just
 * overwrites the pending pair.
 */
export function rollTownOptions(state: GameState, action: Extract<GameAction, { type: "ROLL_TOWN_OPTIONS" }>): void {
  const lobby = state.setupLobby;
  if (!lobby || state.phase !== "setup") {
    throw new Error("Towns can only be rolled during map setup.");
  }
  const seat = lobby.seats.find((candidate) => candidate.playerId === action.playerId);
  if (!seat) {
    throw new Error("That seat does not exist in this scenario.");
  }
  const draft = ensureLobbyDraft(lobby);
  if (draft.format !== "draft" && draft.format !== "random-choice") {
    throw new Error("Town options are only rolled in the Draft and Random-with-choice formats.");
  }
  if (seat.factionId) {
    throw new Error("Reset this seat before rolling a new town.");
  }

  const taken = new Set(
    lobby.seats
      .filter((candidate) => candidate.playerId !== action.playerId)
      .map((candidate) => candidate.factionId)
      .filter((id): id is FactionId => Boolean(id))
  );
  const candidates = (Object.values(coreFactionDefinitions) as { id: FactionId }[])
    .map((faction) => faction.id)
    .filter((id) => !taken.has(id));
  if (candidates.length === 0) {
    throw new Error("No town is available to roll.");
  }

  const random = createSeededRandom(`${state.seed}#town-options#${action.playerId}#${eventSeedNumber(state)}`);
  const options = pickDistinct(random, candidates, 2);
  draft.seatRolls[action.playerId] = { townOptions: options };

  appendEvent(state, {
    type: "GAME_OPTIONS_CHANGED",
    playerId: action.playerId,
    message: `${seatedPlayerName(state, action.playerId)} rolled town options: ${options.map(factionName).join(" or ")}.`
  });
}

/**
 * Map-setup lobby: lock this seat to a town (faction) without a hero yet. In
 * "random-choice" the town must be one of the two rolled options; in "draft" the
 * player may either pick a rolled option or — when no roll is pending — select
 * any untaken town directly.
 */
export function chooseTown(state: GameState, action: Extract<GameAction, { type: "CHOOSE_TOWN" }>): void {
  const lobby = state.setupLobby;
  if (!lobby || state.phase !== "setup") {
    throw new Error("Towns can only be chosen during map setup.");
  }
  const seat = lobby.seats.find((candidate) => candidate.playerId === action.playerId);
  if (!seat) {
    throw new Error("That seat does not exist in this scenario.");
  }
  const draft = ensureLobbyDraft(lobby);
  if (draft.format !== "draft" && draft.format !== "random-choice") {
    throw new Error("Towns are locked separately only in the Draft and Random-with-choice formats.");
  }
  if (seat.factionId) {
    throw new Error("This seat already locked a town — reset it first.");
  }
  const faction = coreFactionDefinitions[action.factionId];
  if (!faction) {
    throw new Error("Unknown faction.");
  }
  const taken = lobby.seats.some(
    (candidate) => candidate.playerId !== action.playerId && candidate.factionId === action.factionId
  );
  if (taken) {
    throw new Error("Another player already picked that town.");
  }

  const options = draft.seatRolls?.[action.playerId]?.townOptions ?? [];
  if (draft.format === "random-choice") {
    if (options.length === 0) {
      throw new Error("Roll your two town options first.");
    }
    if (!options.includes(action.factionId)) {
      throw new Error("Choose one of your two rolled towns.");
    }
  } else if (options.length > 0 && !options.includes(action.factionId)) {
    throw new Error("Choose one of your two rolled towns, or reset to select a town freely.");
  }

  seat.factionId = action.factionId;
  seat.heroDefId = null;
  clearSeatRolls(draft, action.playerId);
  const player = state.players[action.playerId];
  if (player) {
    player.name = faction.name;
  }

  appendEvent(state, {
    type: "GAME_OPTIONS_CHANGED",
    playerId: action.playerId,
    message: `${seatedPlayerName(state, action.playerId)} locked the ${faction.name} town.`
  });
}

/**
 * Map-setup lobby ("random-choice"): roll two random heroes of this seat's
 * already-locked town to choose between.
 */
export function rollHeroOptions(state: GameState, action: Extract<GameAction, { type: "ROLL_HERO_OPTIONS" }>): void {
  const lobby = state.setupLobby;
  if (!lobby || state.phase !== "setup") {
    throw new Error("Heroes can only be rolled during map setup.");
  }
  const seat = lobby.seats.find((candidate) => candidate.playerId === action.playerId);
  if (!seat) {
    throw new Error("That seat does not exist in this scenario.");
  }
  const draft = ensureLobbyDraft(lobby);
  if (draft.format !== "random-choice") {
    throw new Error("Hero options are only rolled in the Random-with-choice format.");
  }
  if (!seat.factionId) {
    throw new Error("Lock a town first, then roll your hero options.");
  }
  if (seat.heroDefId) {
    throw new Error("Reset this seat before rolling a new hero.");
  }
  const faction = coreFactionDefinitions[seat.factionId];
  const pool = faction?.heroes ?? [];
  if (pool.length === 0) {
    throw new Error("No hero is available to roll for that town.");
  }

  const random = createSeededRandom(`${state.seed}#hero-options#${action.playerId}#${eventSeedNumber(state)}`);
  const options = pickDistinct(random, pool, 2);
  draft.seatRolls[action.playerId] = { ...draft.seatRolls[action.playerId], heroOptions: options };

  appendEvent(state, {
    type: "GAME_OPTIONS_CHANGED",
    playerId: action.playerId,
    message: `${seatedPlayerName(state, action.playerId)} rolled hero options: ${options.map(heroName).join(" or ")}.`
  });
}

/**
 * Map-setup lobby ("draft" ban phase): ban one hero of another seat's locked
 * town. Bans go around the table in seat order; only the seat whose turn it is
 * may ban, and only an opponent's not-yet-banned hero.
 */
export function banHero(state: GameState, action: Extract<GameAction, { type: "BAN_HERO" }>): void {
  const lobby = state.setupLobby;
  if (!lobby || state.phase !== "setup") {
    throw new Error("Heroes can only be banned during map setup.");
  }
  if (!lobby.seats.some((seat) => seat.playerId === action.playerId)) {
    throw new Error("Only seated players may ban heroes.");
  }
  const draft = ensureLobbyDraft(lobby);
  if (draft.format !== "draft") {
    throw new Error("Heroes are only banned in the Draft format.");
  }
  const phase = getDraftPhase(lobby);
  if (!phase.banPhaseActive) {
    throw new Error(
      phase.townLockedAll ? "The ban phase is over." : "Every seat must lock a town before banning."
    );
  }
  if (phase.currentBannerPlayerId !== action.playerId) {
    throw new Error("It is not your turn to ban.");
  }
  const hero = coreHeroDefinitions[action.heroDefId];
  if (!hero) {
    throw new Error("Unknown hero.");
  }
  if (draft.bannedHeroDefIds.includes(action.heroDefId)) {
    throw new Error("That hero is already banned.");
  }
  if (!bannableHeroesForSeat(lobby, action.playerId).includes(action.heroDefId)) {
    throw new Error("You can only ban a hero from another player's town.");
  }

  draft.bannedHeroDefIds = [...draft.bannedHeroDefIds, action.heroDefId];
  draft.banPicksMade = (draft.banPicksMade ?? 0) + 1;

  appendEvent(state, {
    type: "GAME_OPTIONS_CHANGED",
    playerId: action.playerId,
    message: `${seatedPlayerName(state, action.playerId)} bans ${hero.name}.`
  });
}

/**
 * Map-setup lobby: clear this seat's town/hero pick and any pending rolls. In the
 * "draft" format this is blocked once every town is locked (the ban phase has
 * started) — an undone town would corrupt the bans, so restart via the format.
 */
export function resetSeatDraft(state: GameState, action: Extract<GameAction, { type: "RESET_SEAT_DRAFT" }>): void {
  const lobby = state.setupLobby;
  if (!lobby || state.phase !== "setup") {
    throw new Error("Seats can only be reset during map setup.");
  }
  const seat = lobby.seats.find((candidate) => candidate.playerId === action.playerId);
  if (!seat) {
    throw new Error("That seat does not exist in this scenario.");
  }
  const draft = ensureLobbyDraft(lobby);
  if (draft.format === "draft" && getDraftPhase(lobby).townLockedAll) {
    throw new Error("The ban phase has started — change the setup format to restart the draft.");
  }

  seat.factionId = null;
  seat.heroDefId = null;
  clearSeatRolls(draft, action.playerId);
  const player = state.players[action.playerId];
  if (player) {
    player.name = seat.name;
  }

  appendEvent(state, {
    type: "GAME_OPTIONS_CHANGED",
    playerId: action.playerId,
    message: `${seatedPlayerName(state, action.playerId)} reset their pick.`
  });
}

/**
 * Map-setup lobby ("random" format): randomly assign this seat a town and/or
 * hero. The pool excludes factions another seat already holds, so a random roll
 * always lands on a legal pick.
 */
export function randomAssignSeat(state: GameState, action: Extract<GameAction, { type: "RANDOM_ASSIGN_SEAT" }>): void {
  const lobby = state.setupLobby;
  if (!lobby || state.phase !== "setup") {
    throw new Error("Seats can only be rolled during map setup.");
  }

  const seat = lobby.seats.find((candidate) => candidate.playerId === action.playerId);
  if (!seat) {
    throw new Error("That seat does not exist in this scenario.");
  }
  if (action.scope !== "faction" && action.scope !== "hero") {
    throw new Error("Unknown random scope.");
  }

  const draft = lobbyDraft(lobby);
  if (draft.format !== "random") {
    throw new Error("Full random rolls are only for the Full random format.");
  }
  const takenFactions = new Set(
    lobby.seats
      .filter((candidate) => candidate.playerId !== action.playerId)
      .map((candidate) => candidate.factionId)
      .filter((id): id is FactionId => Boolean(id))
  );

  const selectableHeroes = (factionId: FactionId): string[] => {
    const faction = coreFactionDefinitions[factionId];
    return faction ? [...faction.heroes] : [];
  };

  // Seed with the event counter so two consecutive rolls differ and every client
  // computing the same action lands on the same pick.
  const random = createSeededRandom(`${state.seed}#random-seat#${action.playerId}#${eventSeedNumber(state)}`);

  let factionId: FactionId;
  if (action.scope === "hero") {
    if (!seat.factionId) {
      throw new Error("Roll a town first, or pick one, before rolling a hero.");
    }
    factionId = seat.factionId;
  } else {
    const candidateFactions = (Object.values(coreFactionDefinitions) as { id: FactionId }[])
      .map((faction) => faction.id)
      .filter((id) => !takenFactions.has(id) && selectableHeroes(id).length > 0);
    if (candidateFactions.length === 0) {
      throw new Error("No town is available to roll.");
    }
    factionId = random.pick(candidateFactions);
  }

  const heroPool = selectableHeroes(factionId);
  if (heroPool.length === 0) {
    throw new Error("No hero is available to roll for that town.");
  }
  // Re-rolling a hero avoids the current one when another is available, so the
  // roll visibly changes the pick.
  const choices =
    action.scope === "hero" && heroPool.length > 1 ? heroPool.filter((id) => id !== seat.heroDefId) : heroPool;
  const heroDefId = random.pick(choices.length > 0 ? choices : heroPool);

  seat.factionId = factionId;
  seat.heroDefId = heroDefId;
  const faction = coreFactionDefinitions[factionId];
  const hero = coreHeroDefinitions[heroDefId];
  const player = state.players[action.playerId];
  if (player && hero && faction) {
    player.name = `${hero.name} of ${faction.name}`;
  }

  appendEvent(state, {
    type: "FACTION_CHOSEN",
    playerId: action.playerId,
    factionId,
    heroDefId
  });
}

/** Builds the scenario map in place once every seat picked a faction. */
export function startAdventureFromLobby(state: GameState, action: Extract<GameAction, { type: "START_ADVENTURE" }>): void {
  const lobby = state.setupLobby;
  if (!lobby || state.phase !== "setup") {
    throw new Error("The adventure already started.");
  }

  if (!state.players[action.playerId]) {
    throw new Error("Only seated players may start the adventure.");
  }

  if (lobby.seats.some((seat) => !seat.factionId || !seat.heroDefId)) {
    throw new Error("Every seat needs a faction and hero before the adventure starts.");
  }

  const built = createAdventureGameState({
    seed: state.seed,
    scenarioId: lobby.options.scenarioId,
    ruleset: lobby.options.ruleset,
    victoryMode: lobby.options.victoryMode,
    pvpTroopLoss: lobby.options.pvpTroopLoss,
    spellBook: lobby.options.spellBook,
    farTileOpening: lobby.options.farTileOpening,
    farTilesPerPlayer: lobby.options.farTilesPerPlayer,
    difficulty: lobby.options.difficulty,
    startingResources: lobby.options.startingResources,
    startingProduction: lobby.options.startingProduction,
    startingUnitTiers: lobby.options.startingUnitTiers,
    startingUnits: lobby.options.startingUnits ?? null,
    startingBuildings: lobby.options.startingBuildings,
    customMap: lobby.options.customMap ?? null,
    players: lobby.seats.map((seat) => ({
      id: seat.playerId,
      name: state.players[seat.playerId]?.name ?? seat.name,
      factionId: seat.factionId as FactionId,
      heroDefId: seat.heroDefId ?? undefined
    }))
  });

  const previousLog = state.eventLog;
  Object.assign(state, built);
  state.setupLobby = null;
  // Re-sequence ids so the combined log keeps every event id unique.
  state.eventLog = [...previousLog, ...built.eventLog.slice(1)].map((event, index) => ({
    ...event,
    id: `evt_${index + 1}`
  }));

  appendEvent(state, {
    type: "ADVENTURE_STARTED",
    scenarioId: lobby.scenarioId,
    playerIds: lobby.seats.map((seat) => seat.playerId)
  });
}

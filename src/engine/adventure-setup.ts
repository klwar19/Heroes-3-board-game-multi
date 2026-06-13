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
import type { TileContent } from "@/data/map/types";
import { DEFAULT_SCENARIO_ID, scenarioDefinitions, type ScenarioDefinition } from "@/data/map/scenarios";
import {
  addArmyUnit,
  ASTROLOGERS_DECK_ID,
  getUnitSide,
  instantiateTile,
  NEUTRAL_DECK_IDS,
  seaTileBand,
  startAdventureRound,
  startPlayerTurn
} from "./adventure";
import { drawCardsForPlayer, shuffleCards } from "./decks";
import { createSeededRandom } from "./random";
import { appendEvent } from "./events";
import { VICTORY_MODE_LABELS } from "./ruleset";
import { hexEquals, tileCentersAdjacent, tileCentersOverlap, type HexCoord } from "./hex";
import type {
  AdventureState,
  CustomMapTilePlan,
  CustomStartingUnit,
  DeckState,
  FactionId,
  GameAction,
  GameDifficulty,
  GameRuleset,
  GameSetupOptions,
  GameState,
  PlayerId,
  PlayerState,
  UnitLevel,
  VictoryMode
} from "./state";
import { NEUTRAL_PLAYER_ID } from "./state";

export type AdventurePlayerConfig = {
  id: string;
  name: string;
  factionId: FactionId;
  heroDefId?: string;
};

export type AdventureSetupOptions = {
  seed?: string;
  ruleset?: GameRuleset;
  /** Win condition: "conquest" (flag enemy town) or "grail" (objective hunt). */
  victoryMode?: VictoryMode;
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
  const make = (id: string, cardIds: string[]): DeckState => {
    const drawPile = shuffleCards(cardIds, `${seed}#deck#${id}`);
    // Setup rule: flip the top card of each shared deck to start its discard.
    const discardTop = drawPile.pop();
    return {
      id,
      drawPile,
      discardPile: discardTop ? [discardTop] : []
    };
  };

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

function tileHasSettlement(tileDefId: string): boolean {
  return Boolean(allTileDefinitions[tileDefId]?.fields.some((field) => field.location === "settlement"));
}

/**
 * Drafts a player's Far (II–III) tile supply. Mission Book draft rule: when
 * the scenario guarantees a settlement and none of the drawn tiles has one,
 * the last tile is redrawn (non-settlement tiles cycle to the bottom of the
 * pool) until a settlement shows up.
 */
export function draftFarTiles(pool: string[], scenario: ScenarioDefinition): string[] {
  const drawn: string[] = [];
  for (let count = 0; count < scenario.farTiles.perPlayer && pool.length > 0; count += 1) {
    drawn.push(pool.pop() as string);
  }

  if (!scenario.farTiles.guaranteeSettlement || drawn.length === 0) {
    return drawn;
  }

  if (drawn.some(tileHasSettlement) || !pool.some(tileHasSettlement)) {
    return drawn;
  }

  let safety = pool.length * 2;
  while (safety > 0 && !tileHasSettlement(drawn[drawn.length - 1])) {
    safety -= 1;
    const rejected = drawn.pop() as string;
    pool.unshift(rejected);
    const next = pool.pop();
    if (!next) {
      drawn.push(rejected);
      break;
    }
    drawn.push(next);
  }

  return drawn;
}

/**
 * Validates a designed map against a scenario: every tile must sit on the
 * tile lattice without overlapping the starting tiles or each other, and the
 * whole design must connect (transitively touch) the starting tiles. Returns
 * the accepted plans in placeable order plus human-readable problems.
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
  const seedCenters = [...placedCenters];

  // Tiles must connect to the board gaplessly: accept plans that are a gapless
  // neighbour of an already-placed tile until nothing more fits
  // (order-independent). Off-lattice positions never become neighbours, so they
  // are reported as not touching the board.
  const remaining = wellFormed.filter((plan) => plan.group !== "starting");
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (let index = 0; index < remaining.length; index += 1) {
      const plan = remaining[index];
      const center = { row: plan.row, col: plan.col };
      if (placedCenters.some((existing) => tileCentersOverlap(existing, center))) {
        continue;
      }
      if (!placedCenters.some((existing) => tileCentersAdjacent(existing, center))) {
        continue;
      }
      accepted.push(plan);
      placedCenters.push(center);
      remaining.splice(index, 1);
      index -= 1;
      progressed = true;
    }
  }

  for (const plan of remaining) {
    const center = { row: plan.row, col: plan.col };
    if (placedCenters.some((existing) => hexEquals(existing, center))) {
      problems.push(`Tile at ${plan.row},${plan.col}: duplicate position.`);
    } else if (seedCenters.some((start) => tileCentersOverlap(start, center))) {
      problems.push(`Tile at ${plan.row},${plan.col}: overlaps a starting tile.`);
    } else {
      problems.push(`Tile at ${plan.row},${plan.col}: must touch the starting tiles or another designed tile.`);
    }
  }

  return { accepted, problems };
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
 * Grail (and a Dragon Utopia when a second Center slot exists); Dragon
 * Conqueror guarantees a Dragon Utopia. The array is index-aligned with the
 * scenario's Center positions; undefined entries fall back to a random draw.
 */
function forcedObjectiveCenterTiles(pool: string[], slots: number, mode: VictoryMode): (string | undefined)[] {
  if (slots <= 0) {
    return [];
  }
  if (mode === "grail") {
    const forced: (string | undefined)[] = [takeCenterTileWith(pool, "grail")];
    if (slots >= 2) {
      forced.push(takeCenterTileWith(pool, "dragon_utopia"));
    }
    return forced;
  }
  if (mode === "dragon-conqueror") {
    return [takeCenterTileWith(pool, "dragon_utopia")];
  }
  return [];
}

export function createAdventureGameState(options: AdventureSetupOptions = {}): GameState {
  const seed = options.seed ?? "homm3bg-adventure-seed";
  const scenario = getScenario(options.scenarioId);
  const setupOptions: GameSetupOptions = {
    ...defaultGameSetupOptions(scenario),
    ...(options.ruleset ? { ruleset: options.ruleset } : {}),
    ...(options.victoryMode ? { victoryMode: options.victoryMode } : {}),
    ...(options.difficulty ? { difficulty: options.difficulty } : {}),
    ...(options.startingResources ? { startingResources: options.startingResources } : {}),
    ...(options.startingProduction ? { startingProduction: options.startingProduction } : {}),
    ...(options.startingUnitTiers ? { startingUnitTiers: options.startingUnitTiers } : {}),
    ...(options.startingUnits !== undefined ? { startingUnits: options.startingUnits } : {}),
    ...(options.startingBuildings ? { startingBuildings: options.startingBuildings } : {}),
    ...(options.customMap !== undefined ? { customMap: options.customMap } : {})
  };
  const difficulty = setupOptions.difficulty;
  const ruleset: GameRuleset = setupOptions.ruleset;
  const victoryMode: VictoryMode = setupOptions.victoryMode ?? "conquest";
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
    // Setup: the war machine cards sit face up in a shared supply pile.
    warMachineSupply: [...WAR_MACHINE_CARD_IDS],
    // Pandora's Box fields may draw from this deck instead of rolling dice.
    pandoraDeck: shuffleCards(pandoraDeckCardIds, `${seed}#pandora`),
    pendingVisit: null,
    rewardQueue: [],
    lastVisitedField: {},
    winnerPlayerId: null,
    victoryMode,
    ...(victoryMode === "grail" ? { grail: { status: "uncollected" as const }, heroDefeats: {} } : {}),
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
    // both bands share one shuffled wave pool, so pop the topmost match.
    // An undefined band (older saved maps) takes any sea tile.
    const popSeaTile = (band?: "iv-v" | "vi-vii"): string | undefined => {
      for (let index = seaPool.length - 1; index >= 0; index -= 1) {
        const def = allTileDefinitions[seaPool[index]];
        if (!band || (def && seaTileBand(def) === band)) {
          return seaPool.splice(index, 1)[0];
        }
      }
      return undefined;
    };

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

    for (const plan of customMap) {
      if (plan.group === "starting") {
        continue;
      }
      const center = { row: plan.row, col: plan.col };
      if (plan.faceDown) {
        const tileDefId = plan.group === "sea" ? popSeaTile(plan.seaBand) : pools[plan.group]?.pop();
        if (tileDefId) {
          instantiateTile(adventure, tileDefId, center, 0, true);
        }
      } else if (plan.tileDefId) {
        instantiateTile(adventure, plan.tileDefId, center, plan.rotation ?? 0, false);
      }
    }
  } else {
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
  }

  // Far (II–III) tile supplies, with the settlement draft guarantee.
  for (const config of playerConfigs) {
    adventure.playerFarTiles[config.id] = draftFarTiles(farPool, scenario);
  }

  // Everyone draws their starting hand at setup so it is visible from the
  // first moment; the active player's turn then starts as usual.
  for (const config of playerConfigs) {
    drawCardsForPlayer(state, config.id, state.players[config.id].limits.hand);
  }

  // Official setup step 22: every player rolls the Attack die, the highest
  // result starts (ties reroll among the tied players). The full roll history
  // is kept on the adventure so every seat can read it.
  if (options.rollFirstPlayer !== false) {
    rollFirstPlayer(state, seed);
  }

  startAdventureRound(state);
  startPlayerTurn(state, state.activePlayerId);

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
  const seed = options.seed ?? `homm3bg-${Date.now().toString(36)}`;
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
    setupLobby: { scenarioId: scenario.id, options: setupOptions, seats },
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
    if (next.victoryMode !== "conquest" && next.victoryMode !== "grail" && next.victoryMode !== "dragon-conqueror") {
      throw new Error("Unknown win condition.");
    }
    lobby.options.victoryMode = next.victoryMode;
    changes.push(`win condition ${VICTORY_MODE_LABELS[next.victoryMode]}`);
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

  seat.factionId = action.factionId;
  seat.heroDefId = action.heroDefId;
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

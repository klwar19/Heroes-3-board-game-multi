import { astrologersDeckCardIds } from "@/data/cards/astrologers";
import {
  coreFactionDefinitions,
  coreHeroDefinitions,
  neutralUnitIdsByTier,
  startingTileByFaction
} from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { coreTileDefinitions } from "@/data/map/tile-defs";
import { DEFAULT_SCENARIO_ID, scenarioDefinitions, type ScenarioDefinition } from "@/data/map/scenarios";
import {
  addArmyUnit,
  ASTROLOGERS_DECK_ID,
  instantiateTile,
  NEUTRAL_DECK_IDS,
  startAdventureRound,
  startPlayerTurn
} from "./adventure";
import { drawCardsForPlayer, shuffleCards } from "./decks";
import { appendEvent } from "./events";
import type {
  AdventureState,
  DeckState,
  FactionId,
  GameAction,
  GameDifficulty,
  GameState,
  PlayerState
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
  difficulty?: GameDifficulty;
  scenarioId?: string;
  players?: AdventurePlayerConfig[];
};

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

function makeSharedDecks(seed: string): Record<string, DeckState> {
  const spells = [
    "spell.magic_arrow",
    "spell.magic_arrow",
    "spell.lightning_bolt",
    "spell.lightning_bolt",
    "spell.stone_skin",
    "spell.stone_skin",
    "spell.bloodlust",
    "spell.bloodlust",
    "spell.cure",
    "spell.cure",
    "spell.fortune",
    "spell.fortune",
    "spell.fireball"
  ];
  const abilities = [
    "ability.resistance",
    "ability.resistance",
    "ability.archery",
    "ability.archery",
    "ability.offense",
    "ability.offense",
    "ability.luck",
    "ability.luck",
    "ability.leadership",
    "ability.sorcery"
  ];
  const artifacts = [
    "artifact.centaurs_axe",
    "artifact.ogres_club_of_havoc",
    "artifact.titans_gladius",
    "artifact.buckler_of_the_gnoll_king",
    "artifact.breastplate_of_petrified_wood"
  ];

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

  return {
    spells: make("spells", spells),
    abilities: make("abilities", abilities),
    artifacts: make("artifacts", artifacts)
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

function makePlayer(config: AdventurePlayerConfig, seed: string, scenario: ScenarioDefinition): PlayerState {
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
    resources: { ...scenario.startingResources },
    production: { ...scenario.startingProduction },
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

  // Scenario starting units: one "few" card of each faction unit of the
  // scenario's tiers.
  const faction = coreFactionDefinitions[config.factionId];
  for (const unitDefId of faction.units) {
    const unit = coreUnitDefinitions[unitDefId];
    if (unit && scenario.startingUnits.tiers.includes(unit.tier as "bronze" | "silver" | "gold") && unit.few) {
      addArmyUnit(player, unitDefId, "few");
      player.startingArmy.push({ unitDefId, side: "few" });
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
  return Boolean(coreTileDefinitions[tileDefId]?.fields.some((field) => field.location === "settlement"));
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

export function createAdventureGameState(options: AdventureSetupOptions = {}): GameState {
  const seed = options.seed ?? "homm3bg-adventure-seed";
  const scenario = getScenario(options.scenarioId);
  const difficulty = options.difficulty ?? scenario.difficulty;
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
    pendingVisit: null,
    rewardQueue: [],
    lastVisitedField: {},
    winnerPlayerId: null,
    pendingTileChoice: null,
    astrologers: {
      activeCardId: null,
      nextResourceModifiers: { gold: 0, valuables: 0 },
      crazyWizardUsedBy: [],
      swiftWeaselUsedBy: []
    },
    pendingEncounter: null
  };

  // Tile pools (face-down draws are secret until revealed).
  const nearPool = shuffleCards(
    Object.values(coreTileDefinitions)
      .filter((tile) => tile.group === "near")
      .map((tile) => tile.id),
    `${seed}#pool#near`
  );
  const centerPool = shuffleCards(
    Object.values(coreTileDefinitions)
      .filter((tile) => tile.group === "center" && tile.id !== "C5")
      .map((tile) => tile.id),
    `${seed}#pool#center`
  );
  const farPool = shuffleCards(
    Object.values(coreTileDefinitions)
      .filter((tile) => tile.group === "far")
      .map((tile) => tile.id),
    `${seed}#pool#far`
  );

  const state: GameState = {
    id: "adventure-game",
    seed,
    mode: "adventure",
    round: 1,
    phase: "player-turn",
    activePlayerId: playerConfigs[0].id,
    priorityPlayerId: null,
    turnOrder: playerConfigs.map((config) => config.id),
    players: Object.fromEntries([
      ...playerConfigs.map((config) => [config.id, makePlayer(config, seed, scenario)] as const),
      [NEUTRAL_PLAYER_ID, makeNeutralSeatPlayer()] as const
    ]),
    map: { spaces: {} },
    adventure,
    setupLobby: null,
    towns: {},
    heroes: {},
    combat: null,
    decks: {
      ...makeSharedDecks(seed),
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

  // Starting tiles: position fixed by the scenario seat, tile fixed by the
  // chosen faction — no rotation choice. Towns and main heroes go on the
  // tile's center field.
  playerConfigs.forEach((config, index) => {
    const startTileId = startingTileByFaction[config.factionId] ?? "S1";
    const center = scenario.layout.starts[index];
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
        buildings: scenario.startingBuildings
          .map((buildingId) => `${config.factionId}.${buildingId}`)
          .filter((buildingId) => buildingId.length > 0),
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

  // Face-down Near (IV–V) and Center (VI–VII) tiles per the scenario layout.
  for (const center of scenario.layout.near) {
    const tileDefId = nearPool.pop();
    if (tileDefId) {
      instantiateTile(adventure, tileDefId, center, 0, true);
    }
  }
  for (const center of scenario.layout.center) {
    const tileDefId = centerPool.pop();
    if (tileDefId) {
      instantiateTile(adventure, tileDefId, center, 0, true);
    }
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

  startAdventureRound(state);
  startPlayerTurn(state, state.activePlayerId);

  return state;
}

// ---------------------------------------------------------------------------
// Map-setup lobby: pick factions and heroes, then build the scenario map
// ---------------------------------------------------------------------------

const LOBBY_SEAT_NAMES = ["Player 1", "Player 2", "Player 3"];

/** Opens a new room in the map-setup phase: seats wait for faction picks. */
export function createAdventureLobbyState(options: AdventureSetupOptions = {}): GameState {
  const seed = options.seed ?? `homm3bg-${Date.now().toString(36)}`;
  const scenario = getScenario(options.scenarioId);
  const seatCount = Math.min(2, scenario.maxPlayers);

  const seats = Array.from({ length: seatCount }, (_, index) => ({
    playerId: `p${index + 1}`,
    name: LOBBY_SEAT_NAMES[index] ?? `Player ${index + 1}`,
    factionId: null,
    heroDefId: null
  }));

  const players = Object.fromEntries(
    seats.map((seat) => {
      const player: PlayerState = {
        id: seat.playerId,
        name: seat.name,
        deck: [],
        hand: [],
        discard: [],
        removed: [],
        army: [],
        startingArmy: [],
        resources: { ...scenario.startingResources },
        production: { ...scenario.startingProduction },
        townTokens: { build: true, population: true, spellBook: true },
        morale: 0,
        limits: { hand: 4, expertUses: 0 },
        combatStats: {
          spellsCastThisRound: 0,
          spellLimitBonusThisRound: 0,
          expertUsesSpentThisRound: 0
        }
      };
      return [seat.playerId, player] as const;
    })
  );

  return {
    id: "adventure-lobby",
    seed,
    mode: "adventure",
    round: 0,
    phase: "setup",
    activePlayerId: seats[0].playerId,
    priorityPlayerId: null,
    turnOrder: seats.map((seat) => seat.playerId),
    players,
    map: { spaces: {} },
    adventure: null,
    setupLobby: { scenarioId: scenario.id, seats },
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
        message: `Map setup for "${scenario.name}": pick factions, then start the adventure.`
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
    scenarioId: lobby.scenarioId,
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

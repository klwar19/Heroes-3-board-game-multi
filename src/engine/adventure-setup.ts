import { coreFactionDefinitions, coreHeroDefinitions, neutralUnitIdsByTier, startingTileByFaction } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { coreTileDefinitions } from "@/data/map/tile-defs";
import { addArmyUnit, instantiateTile, NEUTRAL_DECK_IDS, startAdventureRound, startPlayerTurn } from "./adventure";
import { shuffleCards } from "./decks";
import type { AdventureState, DeckState, FactionId, GameDifficulty, GameState, PlayerState } from "./state";
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
  players?: AdventurePlayerConfig[];
};

const DEFAULT_PLAYERS: AdventurePlayerConfig[] = [
  { id: "p1", name: "Catherine of Castle", factionId: "castle", heroDefId: "catherine" },
  { id: "p2", name: "Sandro of Necropolis", factionId: "necropolis", heroDefId: "sandro" }
];

/**
 * Default skirmish map layout: each player's starting tile, a chain of
 * face-down Near tiles between them, and a face-down Center tile to the
 * north. Tile centers sit at hex distance 3 so every neighbouring pair of
 * tiles touches edge-to-edge (see tileFootprintsTouch).
 */
const TWO_PLAYER_LAYOUT = {
  starts: [
    { row: 8, col: 2 },
    { row: 8, col: 8 }
  ],
  near: [
    { row: 8, col: 5 },
    { row: 5, col: 3 }
  ],
  center: [{ row: 5, col: 6 }]
};

const THREE_PLAYER_LAYOUT = {
  starts: [
    { row: 8, col: 2 },
    { row: 8, col: 8 },
    { row: 11, col: 5 }
  ],
  near: [
    { row: 8, col: 5 },
    { row: 5, col: 3 }
  ],
  center: [{ row: 5, col: 6 }]
};

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

function makePlayer(config: AdventurePlayerConfig, seed: string): PlayerState {
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
    // Development defaults until the Mission Book scenarios are imported:
    // starting resources are generous enough to build early.
    resources: {
      gold: 10,
      buildingMaterials: 5,
      valuables: 2
    },
    production: {
      gold: 0,
      buildingMaterials: 0,
      valuables: 0
    },
    townTokens: {
      build: true,
      population: true,
      spellBook: true
    },
    morale: 0,
    needsHandRefresh: false,
    limits: {
      hand: 4,
      expertUses: 0
    },
    combatStats: {
      spellsCastThisRound: 0,
      spellLimitBonusThisRound: 0,
      expertUsesSpentThisRound: 0
    }
  };

  // Starting army (development default until scenarios are imported): one
  // "few" card of each bronze unit of the faction.
  const faction = coreFactionDefinitions[config.factionId];
  for (const unitDefId of faction.units) {
    const unit = coreUnitDefinitions[unitDefId];
    if (unit?.tier === "bronze" && unit.few) {
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

export function createAdventureGameState(options: AdventureSetupOptions = {}): GameState {
  const seed = options.seed ?? "homm3bg-adventure-seed";
  const difficulty = options.difficulty ?? "normal";
  const playerConfigs = (options.players?.length ? options.players : DEFAULT_PLAYERS).slice(0, 3);
  const layout = playerConfigs.length >= 3 ? THREE_PLAYER_LAYOUT : TWO_PLAYER_LAYOUT;

  const adventure: AdventureState = {
    difficulty,
    tiles: {},
    fields: {},
    playerFarTiles: {},
    pendingVisit: null,
    rewardQueue: [],
    lastVisitedField: {},
    winnerPlayerId: null
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
      ...playerConfigs.map((config) => [config.id, makePlayer(config, seed)] as const),
      [NEUTRAL_PLAYER_ID, makeNeutralSeatPlayer()] as const
    ]),
    map: { spaces: {} },
    adventure,
    towns: {},
    heroes: {},
    combat: null,
    decks: {
      ...makeSharedDecks(seed),
      ...makeNeutralDecks(seed)
    },
    stack: [],
    reactionWindow: null,
    activeEffects: [],
    eventLog: [
      {
        id: "evt_1",
        type: "GAME_CREATED",
        message: `Created an adventure game for ${playerConfigs.length} players (${difficulty} difficulty).`
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

  // Starting tiles (face up) with towns and main heroes on the center field.
  playerConfigs.forEach((config, index) => {
    const startTileId = startingTileByFaction[config.factionId] ?? "S1";
    const center = layout.starts[index];
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
        buildings: [],
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

  // Face-down Near and Center tiles between the players.
  for (const center of layout.near) {
    const tileDefId = nearPool.pop();
    if (tileDefId) {
      instantiateTile(adventure, tileDefId, center, 0, true);
    }
  }
  for (const center of layout.center) {
    const tileDefId = centerPool.pop();
    if (tileDefId) {
      instantiateTile(adventure, tileDefId, center, 0, true);
    }
  }

  // Each player holds two face-down Far tiles to place during play.
  for (const config of playerConfigs) {
    adventure.playerFarTiles[config.id] = [farPool.pop(), farPool.pop()].filter(
      (tileDefId): tileDefId is string => Boolean(tileDefId)
    );
  }

  startAdventureRound(state);
  startPlayerTurn(state, state.activePlayerId);

  return state;
}

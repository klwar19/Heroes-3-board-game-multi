import { astrologersDeckCardIds } from "@/data/cards/astrologers";
import { eventsDeckCardIds } from "@/data/cards/events";
import { abilityDeckBinh, abilityDeckLegacy } from "@/data/cards/abilities-extra";
import {
  artifactDeckBinhMajor,
  artifactDeckBinhMinor,
  artifactDeckBinhRelic,
  artifactDeckLegacy
} from "@/data/cards/artifacts";
import {
  animeXianxiaArtifactCardIds,
  animeXianxiaArtifactMajorIds,
  animeXianxiaArtifactMinorIds,
  animeXianxiaArtifactRelicIds
} from "@/data/anime/artifacts";
import {
  wogArtifactCardIds,
  wogArtifactMajorIds,
  wogArtifactMinorIds,
  wogArtifactRelicIds
} from "@/data/wog/artifacts";
import {
  wogCommanderArtifactCardIds,
  wogCommanderArtifactMajorIds,
  wogCommanderArtifactMinorIds,
  wogCommanderArtifactRelicIds
} from "@/data/wog/commander-artifacts";
import { pandoraDeckCardIds } from "@/data/cards/pandora";
import { WAR_MACHINE_CARD_IDS } from "@/data/cards/permanents";
import { spellDeckBinhBasic, spellDeckBinhExpert, spellDeckLegacy } from "@/data/cards/spells";
import {
  coreBuildingDefinitions,
  coreFactionDefinitions,
  coreHeroDefinitions,
  isPlayableFaction,
  neutralUnitIdsByTier,
  startingTileByFaction
} from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { WOG_UNIT_IDS_BY_TIER } from "@/data/wog";
import { allTileDefinitions, DEFAULT_TILE_CONTENT, tilePoolIds } from "@/data/map/tiles";
import { CREATURE_BANK_IDS, CREATURE_BANKS } from "@/data/map/creature-banks";
import type { TileContent } from "@/data/map/types";
import {
  DEFAULT_SCENARIO_ID,
  DEFAULT_SETUP_STARTING_BUILDINGS,
  scenarioDefinitions,
  type ScenarioDefinition
} from "@/data/map/scenarios";
import {
  addArmyUnit,
  applyCustomGuardToField,
  ASTROLOGERS_DECK_ID,
  carveColoredGateField,
  carveMapTokenField,
  carveOnewayField,
  EVENTS_DECK_ID,
  gatePairColor,
  getTileFootprintSpaceIds,
  getUnitSide,
  instantiateTile,
  materializeTileFields,
  NEUTRAL_DECK_IDS,
  normalizeDesignedBorders,
  normalizeDesignedBorderEdges,
  planIsUnderground,
  UNDERGROUND_LAYER_GROUPS,
  recomputeSubterraneanGates,
  seaTileBand,
  subterraneanTileBand,
  changeMorale,
  applyCustomMapStartingBonuses,
  startAdventureRound,
  startingBonusVisitSteps,
  startPlayerTurn,
  tileLayer,
  tokenMayCoverFieldDef,
  victoryModeCountsHeroDefeats
} from "./adventure";
import { describeCustomWinCondition } from "./victory-points";
import {
  applyCustomMapPresetToOptions,
  customMapPresetIsActive,
  MAX_GATES_PER_PAIR,
  mergeCustomWinConditions,
  revertCustomMapPresetOptions,
  sanitizeCustomMapPreset,
  sanitizeCustomWinConditions,
  tileMatchesSecretFeature,
  victoryDesignConflicts,
  VII_FIELD_DESIGNATIONS,
  objectGuardSpec,
  OUTPOST_OBJECT_KINDS,
  sanitizeCenterHexPlan,
  sanitizeObjectGuard,
  type CustomMapPreset,
  type PresetForcedOptionKey
} from "./map-preset";
import { pumpAdventureQueues } from "./adventure-reducer";
import { makeInitialCommanderState } from "./commanders";
import { controllerOf, standardComputerController } from "./computer/control";
import { normalizeParallelTurnRounds } from "./parallel-turns";
import { drawCardsForPlayer, shuffleCards } from "./decks";
import { makeMoraleDecks } from "./morale-cards";
import { createSeededRandom, type SeededRandom } from "./random";
import { freshSeed } from "./seed";
import { appendEvent, eventSeedNumber } from "./events";
import { VICTORY_MODE_LABELS } from "./ruleset";
import {
  hexEquals,
  hexNeighbors,
  hexSpaceId,
  parseHexSpaceId,
  tileCentersOverlap,
  tileFootprint,
  tileFootprintsTouch,
  type HexCoord
} from "./hex";
import type {
  AdventureState,
  CustomMapObject,
  CustomMapTilePlan,
  CustomMapGateLink,
  CustomStartingUnit,
  CustomWinCondition,
  MapFieldState,
  MapSpaceId,
  DeckState,
  DraftFormat,
  FactionId,
  GameAction,
  GameDifficulty,
  GameRuleset,
  GameSessionMode,
  GameSetupDraft,
  GameSetupOptions,
  GameSetupState,
  GameState,
  HouseRuleId,
  DragonUtopiaGuards,
  MapTileState,
  PlayerId,
  PlayerController,
  PlayerState,
  PvpTroopLoss,
  RoomMembershipState,
  SecretTileFeature,
  StartCheckState,
  SubterraneanGatePlan,
  UnitLevel,
  VictoryMode,
  AnimeModOptions,
  WogModOptions
} from "./state";
import { DEFAULT_WOG_OPTIONS, MAX_FAR_TILES_PER_PLAYER, NEUTRAL_PLAYER_ID, UNOPENED_FAR_TILE } from "./state";
import { animeModuleEnabled, resolveAnimeOptions } from "./anime";
import { planFieldOverrides, planTokens } from "./tile-hex-placements";
import {
  applyCustomMapFieldOverrides,
  assignPoolFieldOverrides,
  customMapHasAnimeFieldOverridePins,
  customMapHasFieldOverridePins,
  customMapHasWogFieldOverridePins,
  mapObjectsModuleActive,
  resolveFieldOverridePlacement,
  resolveFieldOverridesEnabled
} from "./field-overrides";
import { isFieldOverrideLocation } from "@/data/map/field-overrides";

/** Known designer Secret-feature ids (the allow-list for sanitize + validation). */
export const SECRET_TILE_FEATURE_IDS: readonly SecretTileFeature[] = [
  "gold_mine",
  "valuables_mine",
  "materials_mine",
  "any_mine",
  "obelisk",
  "settlement",
  "town",
  "objective"
] as const;

const SECRET_TILE_FEATURE_SET = new Set<string>(SECRET_TILE_FEATURE_IDS);

/**
 * Designer + UI catalogue for Secret slots: pick a landmark, the engine later
 * draws ANY remaining tile in the slot's pool that carries it.
 *
 * `iconSrc` is the board-game art path (Homm3BG glyphs / resource tokens /
 * location chips) — render through `assetUrl()`. `icon` is a short text
 * fallback only (accessibility / plain-text feeds).
 */
export const SECRET_TILE_FEATURES: readonly {
  id: SecretTileFeature;
  label: string;
  shortLabel: string;
  icon: string;
  iconSrc: string;
  description: string;
}[] = [
  {
    id: "gold_mine",
    label: "Gold mine",
    shortLabel: "Gold",
    icon: "Gold",
    iconSrc: "/assets/icons/resource-gold.webp",
    description: "A random tile from this pool that has a Gold mine."
  },
  {
    id: "valuables_mine",
    label: "Valuables mine",
    shortLabel: "Valuables",
    icon: "Valuables",
    iconSrc: "/assets/icons/resource-valuables.webp",
    description: "A random tile from this pool that has a Valuables mine."
  },
  {
    id: "materials_mine",
    label: "Materials mine",
    shortLabel: "Materials",
    icon: "Materials",
    iconSrc: "/assets/icons/resource-building_materials.webp",
    description: "A random tile from this pool that has a Building Materials mine."
  },
  {
    id: "any_mine",
    label: "Any mine",
    shortLabel: "Mine",
    icon: "Mine",
    iconSrc: "/assets/glyphs/treasure.svg",
    description: "A random tile from this pool that has any mine (gold, valuables, or materials)."
  },
  {
    id: "obelisk",
    label: "Obelisk",
    shortLabel: "Obelisk",
    icon: "Obelisk",
    iconSrc: "/assets/icons/location-obelisk.webp",
    description: "A random tile from this pool that has an Obelisk."
  },
  {
    id: "settlement",
    label: "Settlement",
    shortLabel: "Settlement",
    icon: "Settlement",
    iconSrc: "/assets/icons/location-settlement.webp",
    description: "A random tile from this pool that has a Settlement."
  },
  {
    id: "town",
    label: "Town",
    shortLabel: "Town",
    icon: "Town",
    iconSrc: "/assets/glyphs/building_citadel.svg",
    description: "A random tile from this pool that has a Town (or Random Town)."
  },
  {
    id: "objective",
    label: "Grail / Dragons",
    shortLabel: "Objective",
    icon: "Grail",
    iconSrc: "/assets/icons/location-grail.webp",
    description: "A random tile from this pool that has the Grail or a Dragon Utopia."
  }
];

/** Short label for a Secret feature (board badge / popover). */
export function secretFeatureLabel(feature: SecretTileFeature | undefined): string {
  if (!feature) {
    return "Secret";
  }
  return SECRET_TILE_FEATURES.find((entry) => entry.id === feature)?.shortLabel ?? feature;
}

/** Full label for a Secret feature. */
export function secretFeatureFullLabel(feature: SecretTileFeature | undefined): string {
  if (!feature) {
    return "Secret landmark";
  }
  return SECRET_TILE_FEATURES.find((entry) => entry.id === feature)?.label ?? feature;
}

export function isSecretTileFeature(value: unknown): value is SecretTileFeature {
  return typeof value === "string" && SECRET_TILE_FEATURE_SET.has(value);
}
import { HOUSE_RULE_BY_ID, resolveHouseRules } from "./house-rules";

/**
 * Applies the map designer's Monolith/Whirlpool/colored-Gate tile tokens to the
 * tiles just laid out. A face-up plan carves its designed slot right away (an
 * illegal slot in a hand-edited save is simply dropped — the designer only
 * offers legal ones); a face-down plan parks the token on the tile. When its
 * plan carries `slot`, that slot is resolved NOW to an absolute preferred hex,
 * before the discovering player can rotate the revealed tile. A colored Gate token carves via
 * {@link carveColoredGateField} (its own per-color network) and reuses the
 * Monolith land legality for its slot check. Runs BEFORE
 * `recomputeSubterraneanGates`, whose carve refuses token fields ("Tokens
 * cannot be placed on other Location Tokens" — and vice versa).
 *
 * Whirlpool numbers: the three printed tokens carry the Attack-die faces, so
 * the applied whirlpools are numbered +1, 0, -1 in plan order. A 4th+ whirlpool
 * (hand-edited save; the designer caps at 3) stays unnumbered, which turns the
 * 3-token die rule off — travel falls back to the traveller's pick.
 */
function applyCustomMapTokens(
  adventure: AdventureState,
  planned: { plan: CustomMapTilePlan; tile: MapTileState }[]
): void {
  const WHIRLPOOL_NUMBERS: (-1 | 0 | 1)[] = [1, 0, -1];
  let whirlpoolsApplied = 0;

  for (const { plan, tile } of planned) {
    const tokens = planTokens(plan);
    if (tokens.length === 0) {
      continue;
    }
    const pendingList: NonNullable<MapTileState["pendingTokens"]> = [];
    for (const token of tokens) {
      // A colored Gate / one-way monolith REQUIRES its pair; a
      // Monolith/Whirlpool must NOT carry one (setup mirrors the sanitiser).
      // Anything malformed is dropped silently.
      const isGate = token.kind === "gate";
      const isOneway = token.kind === "oneway_entrance" || token.kind === "oneway_exit";
      if (
        isGate || isOneway
          ? token.pair === undefined
          : token.kind !== "monolith" && token.kind !== "whirlpool"
      ) {
        continue;
      }
      // Gates and one-way monoliths reuse the Monolith land legality.
      const legalityKind: "monolith" | "whirlpool" = token.kind === "whirlpool" ? "whirlpool" : "monolith";

      // A designer guard rides the token wherever it lands (clamped again here
      // so a hand-edited save can't smuggle garbage past the sanitiser). A
      // one-way EXIT is never guarded.
      const guard = token.kind === "oneway_exit" ? undefined : sanitizeObjectGuard(token.guard);

      if (tile.faceDown) {
        const number = token.kind === "whirlpool" ? WHIRLPOOL_NUMBERS[whirlpoolsApplied++] : undefined;
        const preferredSpaceId =
          token.slot !== undefined ? getTileFootprintSpaceIds(tile)[token.slot] : undefined;
        pendingList.push({
          kind: token.kind,
          ...(number !== undefined ? { number } : {}),
          ...((isGate || isOneway) && token.pair !== undefined ? { pair: token.pair } : {}),
          ...(preferredSpaceId ? { preferredSpaceId } : {}),
          ...(guard ? { guard } : {}),
          ...(token.kind === "oneway_entrance" && token.exitMode ? { exitMode: token.exitMode } : {}),
          ...(token.kind === "oneway_exit" && token.alwaysPickable ? { alwaysPickable: true } : {})
        });
        continue;
      }

      const def = allTileDefinitions[tile.tileDefId];
      const slot = token.slot;
      if (!def || slot === undefined || !tokenMayCoverFieldDef(def, slot, legalityKind)) {
        continue;
      }
      const spaceId = getTileFootprintSpaceIds(tile)[slot];
      if (!spaceId || adventure.fields[spaceId]?.tileInstanceId !== tile.id) {
        continue;
      }
      // Already carved by a previous pin on this tile — never stack.
      const existing = adventure.fields[spaceId];
      if (
        existing &&
        (existing.location === "monolith" ||
          existing.location === "whirlpool" ||
          existing.location === "gate" ||
          existing.location === "oneway_entrance" ||
          existing.location === "oneway_exit" ||
          isFieldOverrideLocation(existing.location))
      ) {
        continue;
      }
      if (isGate && token.pair !== undefined) {
        carveColoredGateField(adventure, spaceId, token.pair);
      } else if (isOneway && token.pair !== undefined) {
        carveOnewayField(adventure, spaceId, token.kind as "oneway_entrance" | "oneway_exit", token.pair, {
          exitMode: token.exitMode,
          alwaysPickable: token.alwaysPickable
        });
      } else if (token.kind === "monolith" || token.kind === "whirlpool") {
        const number = token.kind === "whirlpool" ? WHIRLPOOL_NUMBERS[whirlpoolsApplied++] : undefined;
        carveMapTokenField(adventure, spaceId, token.kind, number);
      }
      const carved = adventure.fields[spaceId];
      if (carved) {
        applyCustomGuardToField(carved, guard);
        // One-way entrance fights are bank-style: keep the army level for the
        // draw while the combat opens at difficulty 0.
        if (token.kind === "oneway_entrance" && guard?.level && !guard.units) {
          carved.customGuardLevel = guard.level;
        }
      }
    }
    if (pendingList.length > 0) {
      tile.pendingTokens = pendingList;
      // Legacy singular: first entry for old readers.
      tile.pendingToken = pendingList[0];
    }
  }
}

export type AdventurePlayerConfig = {
  id: string;
  name: string;
  factionId: FactionId;
  heroDefId?: string;
};

/**
 * Towns another seat has either locked or is currently considering in a rolled
 * pair. Pending rolls reserve their towns just like locked picks: without that
 * reservation two players could be shown the same town and whichever clicked
 * first would invalidate the other player's already-visible choice.
 */
export function reservedTownIdsForOtherSeats(lobby: GameSetupState, playerId: PlayerId): Set<FactionId> {
  const reserved = new Set<FactionId>();
  for (const seat of lobby.seats) {
    if (seat.playerId === playerId) {
      continue;
    }
    if (seat.factionId) {
      reserved.add(seat.factionId);
    }
    for (const factionId of lobby.draft?.seatRolls?.[seat.playerId]?.townOptions ?? []) {
      reserved.add(factionId);
    }
  }
  return reserved;
}

function appendSetupTakeBackWarning(
  state: GameState,
  playerId: PlayerId,
  scope: "pick" | "town" | "roll",
  verb: string
): void {
  appendEvent(state, {
    type: "SETUP_SEAT_RESET",
    playerId,
    scope,
    message: `${seatedPlayerName(state, playerId)} ${verb} — a setup take-back.`
  });
}

export type AdventureSetupOptions = {
  seed?: string;
  sessionMode?: GameSessionMode;
  controllers?: Record<PlayerId, PlayerController>;
  computerOpponents?: number;
  ruleset?: GameRuleset;
  /** Wake of Gods modules; honored only when the BINH ruleset is active. */
  wog?: Partial<WogModOptions>;
  /** Anime mod modules; honored only when the BINH ruleset is active. */
  anime?: Partial<AnimeModOptions>;
  /** Win condition: "conquest", "grail", "dragon-hunt" or "dragon-conqueror". */
  victoryMode?: VictoryMode;
  /** PvP Combat casualties: "normal" (lose dead units) or "none" (keep troops). */
  pvpTroopLoss?: PvpTroopLoss;
  /** Dragon Utopia guards: "four" (full party) or "by-difficulty" (scaled count). */
  dragonUtopiaGuards?: DragonUtopiaGuards;
  /** Naval Battles Creature Banks (default on): offer bank placement on Far/Near tile discovery. */
  creatureBanks?: boolean;
  /**
   * GLOBAL Field Overrides (default off; auto-on when customMap has FO pins).
   * Placement mode for pool draws: random | manual | manual-or-refuse.
   */
  fieldOverrides?: boolean;
  fieldOverridePlacement?: import("./state").FieldOverridePlacementMode;
  /** Event deck (Fortress expansion, default off; multiplayer only): draw an Event each Resource Round. */
  events?: boolean;
  /**
   * OPTIONAL Victory Points scoring mode (default off/absent): injects an
   * `{ enabled: true }` VP block into the effective map preset at build time. A
   * designed preset that already enables VP stays authoritative.
   */
  victoryPoints?: boolean;
  /**
   * OPTIONAL hard end-of-game round for lobby Victory Points scoring (only
   * meaningful with `victoryPoints` on): injected as the effective preset's
   * `roundLimit` when the preset sets none. 0/absent = no round limit.
   */
  victoryPointsRoundLimit?: number;
  /**
   * OPTIONAL host-added custom win conditions for this game (merged preset-first
   * with the map's own list at build via `applyLobbyCustomWinConditions`).
   */
  customWinConditions?: CustomWinCondition[];
  /**
   * Pick-on-reveal Subterranean Gate placement (default on): when a revealed tile
   * could host its Gate half in more than one spot, ask the revealing player which
   * hex (and which Surface tile a cavern joins) instead of auto-picking the
   * nearest. Off restores the deterministic nearest-hex carve.
   */
  chooseSubterraneanGate?: boolean;
  /** Spell Book house rule (default on): a personal Spell Book each player may stash, cast and boost from. */
  spellBook?: boolean;
  /** Morale Cards optional rule (default off): replaces normal morale tokens with morale card decks. */
  moraleCards?: boolean;
  /**
   * Tournament Mode convenience flag (default off): when true without granular
   * overrides, enables ban Diplomacy, ban Hourglass, and second-player morale.
   */
  tournamentMode?: boolean;
  /** Tournament rule: ban Diplomacy from the shared Ability deck. */
  tournamentBanDiplomacy?: boolean;
  /** Tournament rule: ban Hourglass of the Evil Hour from shared Artifacts. */
  tournamentBanHourglass?: boolean;
  /** Tournament rule: second player +1 positive morale at game start. */
  tournamentSecondPlayerMorale?: boolean;
  /**
   * PvP Neutral Control mode (default off, multiplayer only): the next live
   * player clockwise plays the Neutral units in every Neutral combat, PvP-style.
   */
  pvpNeutralControl?: boolean;
  /** PvP Neutral Control sub-toggle (default on): controlled guards must still attack when they can. */
  pvpNeutralControlMustAttack?: boolean;
  /** Individual BINH house-rule toggle overrides (see house-rules.ts). */
  houseRules?: Partial<Record<HouseRuleId, boolean>>;
  /**
   * OPTIONAL parallel-turn mode (multiplayer only): how many opening rounds
   * every player's turn runs at the same time (0/absent = off). Stops early —
   * with a table-wide warning — on a PvP battle or a serious PvP interaction.
   */
  parallelTurns?: number;
  /**
   * OPTIONAL "Undo moves" debug/testing mode (default off). When on, the server
   * keeps a bounded per-room snapshot stack so a player may roll the game back.
   * See GameSetupOptions.undoMoves / src/server/undo-history.ts.
   */
  undoMoves?: boolean;
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
  /** Map designer scenario conditions (resources, timed events, victory preset…). */
  customMapPreset?: CustomMapPreset | null;
  /** Content sets whose tiles fill the supply pools (default: every published set). */
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
  /**
   * Queue the rulebook Scenario Difficulty starting bonus (setup step 17).
   * Defaults to the same opening-ceremony gate as `rollFirstPlayer` so
   * deterministic tests that pin seat order are not blocked on a bonus choice;
   * real games and lobbies leave the gate on.
   */
  startingBonus?: boolean;
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
    wog: { ...DEFAULT_WOG_OPTIONS },
    victoryMode: "conquest",
    pvpTroopLoss: "normal",
    dragonUtopiaGuards: "by-difficulty",
    spellBook: true,
    moraleCards: false,
    tournamentMode: false,
    // Granular tournament flags stay undefined here so a lone tournamentMode:true
    // still enables every rule via resolveTournamentRules (false would block it).
    pvpNeutralControl: false,
    pvpNeutralControlMustAttack: true,
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
    customMapName: null,
    customMapPreset: null
  };
}

const DEFAULT_PLAYERS: AdventurePlayerConfig[] = [
  { id: "p1", name: "Catherine of Castle", factionId: "castle", heroDefId: "catherine" },
  { id: "p2", name: "Sandro of Necropolis", factionId: "necropolis", heroDefId: "sandro" }
];

export function getScenario(scenarioId?: string): ScenarioDefinition {
  return scenarioDefinitions[scenarioId ?? DEFAULT_SCENARIO_ID] ?? scenarioDefinitions[DEFAULT_SCENARIO_ID];
}

function makeNeutralDecks(seed: string, wog: WogModOptions): Record<string, DeckState> {
  const decks: Record<string, DeckState> = {};
  for (const tier of ["bronze", "silver", "gold", "azure"] as const) {
    const deckId = NEUTRAL_DECK_IDS[tier];
    const unitIds = wog.enabled && wog.newCreatures
      ? [...neutralUnitIdsByTier[tier], ...WOG_UNIT_IDS_BY_TIER[tier]]
      : neutralUnitIdsByTier[tier];
    decks[deckId] = {
      id: deckId,
      drawPile: shuffleCards(unitIds, `${seed}#neutral#${tier}`),
      discardPile: []
    };
  }
  return decks;
}

/** Tournament Mode (p.54): removed from the Ability / Artifact shared decks. */
export const TOURNAMENT_REMOVED_ABILITY_ID = "ability.diplomacy";
export const TOURNAMENT_REMOVED_ARTIFACT_ID = "artifact.hourglass_of_the_evil_hour";

/**
 * Resolve the three granular Tournament setup rules. An explicit flag wins;
 * otherwise the legacy `tournamentMode` convenience boolean turns every rule on.
 */
export function resolveTournamentRules(
  options: Pick<
    GameSetupOptions,
    "tournamentMode" | "tournamentBanDiplomacy" | "tournamentBanHourglass" | "tournamentSecondPlayerMorale"
  >
): {
  banDiplomacy: boolean;
  banHourglass: boolean;
  secondPlayerMorale: boolean;
} {
  // Explicit granular flags win; absent flags fall back to the master convenience
  // boolean (legacy snapshots / `tournamentMode: true` alone enable every rule).
  const master = Boolean(options.tournamentMode);
  return {
    banDiplomacy:
      options.tournamentBanDiplomacy !== undefined ? Boolean(options.tournamentBanDiplomacy) : master,
    banHourglass:
      options.tournamentBanHourglass !== undefined ? Boolean(options.tournamentBanHourglass) : master,
    secondPlayerMorale:
      options.tournamentSecondPlayerMorale !== undefined
        ? Boolean(options.tournamentSecondPlayerMorale)
        : master
  };
}

/** True when every tournament setup rule is active (UI "Tournament mode" highlight). */
export function tournamentRulesAllOn(
  options: Pick<
    GameSetupOptions,
    "tournamentMode" | "tournamentBanDiplomacy" | "tournamentBanHourglass" | "tournamentSecondPlayerMorale"
  >
): boolean {
  const rules = resolveTournamentRules(options);
  return rules.banDiplomacy && rules.banHourglass && rules.secondPlayerMorale;
}



/**
 * Shared deck construction. Legacy: one mixed Spell deck, one Artifact deck.
 * BINH: the rulebook's optional "Split Artifact and Spell Decks" — Basic and
 * Expert Spell decks plus Minor/Major/Relic Artifact decks. Each deck flips
 * its top card to start the discard pile, as printed.
 *
 * Tournament rules may remove Diplomacy and/or Hourglass of the Evil Hour from
 * their respective decks before shuffling (rulebook p.54) — heroes who start
 * with Diplomacy as their starting Ability still keep that personal copy.
 */
function makeSharedDecks(
  seed: string,
  splitDecks: boolean,
  tournament: { banDiplomacy: boolean; banHourglass: boolean },
  polishSpellBook = false,
  xianxiaArtifacts = false,
  wogArtifacts = false,
  wogCommanderArtifacts = false
): Record<string, DeckState> {
  const without = (cardIds: string[], removeId: string, ban: boolean): string[] =>
    ban ? cardIds.filter((id) => id !== removeId) : cardIds;

  // Anime Pháp Bảo artifacts (§5.10) join the shared Artifact deck(s) ONLY when
  // the module is on; default OFF ⇒ these arrays are empty and the decks are
  // byte-identical to a core table. They ride the SAME per-tier decks as core
  // artifacts, so every downstream tier/uniqueness gate applies unchanged.
  const withAnime = (base: string[], animeIds: readonly string[]): string[] =>
    xianxiaArtifacts ? [...base, ...animeIds] : base;

  // WOG (Wake of Gods) artifacts join the shared Artifact deck(s) ONLY when
  // `wog.enabled && wog.artifacts` is on; default OFF ⇒ byte-identical decks.
  // Same contract as the anime join — they ride the SAME per-tier decks as core
  // artifacts, so every downstream tier/uniqueness gate applies unchanged.
  const withWog = (base: string[], wogIds: readonly string[]): string[] =>
    wogArtifacts ? [...base, ...wogIds] : base;

  // WOG COMMANDER artifacts (Task 2) join the shared Artifact deck(s) ONLY when
  // `wog.enabled && wog.artifacts && wog.commanders` — they are dead cards
  // without a commander. Same per-tier contract as the hero-artifact join above.
  const withWogCommander = (base: string[], wogIds: readonly string[]): string[] =>
    wogCommanderArtifacts ? [...base, ...wogIds] : base;

  const make = (id: string, cardIds: string[]): DeckState => {
    // First-round rule (as printed): each shared deck flips its top card face-up
    // onto its discard pile at game start, so every discard pile (Abilities,
    // Spells, Artifacts — and their split variants) shows one card from round 1.
    // No card is lost — it stays in the deck's discard/draw cycle and can be
    // Searched or taken like any other discarded card.
    const drawPile = shuffleCards(cardIds, `${seed}#deck#${id}`);
    const top = drawPile.pop();
    return {
      id,
      drawPile,
      discardPile: top ? [top] : []
    };
  };

  if (splitDecks) {
    return {
      // Polish house rules deliberately use one combined Spell deck even when
      // split Artifact decks remain enabled.
      spells: make("spells", polishSpellBook ? spellDeckLegacy : spellDeckBinhBasic),
      ...(polishSpellBook ? {} : { "spells-expert": make("spells-expert", spellDeckBinhExpert) }),
      abilities: make(
        "abilities",
        without(abilityDeckBinh, TOURNAMENT_REMOVED_ABILITY_ID, tournament.banDiplomacy)
      ),
      "artifacts-minor": make(
        "artifacts-minor",
        without(withWogCommander(withWog(withAnime(artifactDeckBinhMinor, animeXianxiaArtifactMinorIds), wogArtifactMinorIds), wogCommanderArtifactMinorIds), TOURNAMENT_REMOVED_ARTIFACT_ID, tournament.banHourglass)
      ),
      "artifacts-major": make("artifacts-major", withWogCommander(withWog(withAnime(artifactDeckBinhMajor, animeXianxiaArtifactMajorIds), wogArtifactMajorIds), wogCommanderArtifactMajorIds)),
      "artifacts-relic": make("artifacts-relic", withWogCommander(withWog(withAnime(artifactDeckBinhRelic, animeXianxiaArtifactRelicIds), wogArtifactRelicIds), wogCommanderArtifactRelicIds))
    };
  }

  return {
    spells: make("spells", spellDeckLegacy),
    abilities: make(
      "abilities",
      without(abilityDeckLegacy, TOURNAMENT_REMOVED_ABILITY_ID, tournament.banDiplomacy)
    ),
    artifacts: make(
      "artifacts",
      without(withWogCommander(withWog(withAnime(artifactDeckLegacy, animeXianxiaArtifactCardIds), wogArtifactCardIds), wogCommanderArtifactCardIds), TOURNAMENT_REMOVED_ARTIFACT_ID, tournament.banHourglass)
    )
  };
}

function makeAstrologersDeck(seed: string, eventsOn: boolean): DeckState {
  // Forty Thieves modifies the Event draw; without the (optional, multiplayer
  // only) Event deck it would be printed dead weight, so it only shuffles in
  // when the Event deck exists in this game.
  const cardIds = eventsOn
    ? astrologersDeckCardIds
    : astrologersDeckCardIds.filter((id) => id !== "astrologers.forty_thieves");
  return {
    id: ASTROLOGERS_DECK_ID,
    drawPile: shuffleCards(cardIds, `${seed}#astrologers`),
    discardPile: []
  };
}

/** Event deck (Fortress expansion, optional rule): "Shuffle the Event Deck during setup." */
function makeEventsDeck(seed: string): DeckState {
  return {
    id: EVENTS_DECK_ID,
    drawPile: shuffleCards(eventsDeckCardIds, `${seed}#events`),
    discardPile: []
  };
}

function makeStartingDeck(heroDefId: string, polishSpellBook = false): string[] {
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

  // Polish Spell Book replaces each starting Magic Arrow in the M&M deck with
  // a generic Cast-a-Spell card; the matching Arrows are seeded into the Book.
  deck.push(polishSpellBook ? "spell.cast_a_spell" : "spell.magic_arrow");
  if (hero.type === "magic") {
    deck.push(polishSpellBook ? "spell.cast_a_spell" : "spell.magic_arrow");
  }

  deck.push(hero.startingAbilityCardId);
  // Stub/art-only heroes (non-playable factions) carry no specialty cards.
  if (hero.specialtyCardIds?.[1]) {
    deck.push(hero.specialtyCardIds[1]);
  }
  return deck;
}

function makePlayer(
  config: AdventurePlayerConfig,
  seed: string,
  options: GameSetupOptions,
  polishSpellBook = false
): PlayerState {
  const heroDefId = config.heroDefId ?? coreFactionDefinitions[config.factionId].heroes[0];
  const hero = coreHeroDefinitions[heroDefId];
  const deck = shuffleCards(makeStartingDeck(heroDefId, polishSpellBook), `${seed}#starting-deck#${config.id}`);
  const startingSpellCount = hero?.type === "magic" ? 2 : 1;

  const player: PlayerState = {
    id: config.id,
    name: config.name,
    factionId: config.factionId,
    heroDefId,
    deck,
    hand: [],
    discard: [],
    spellBook: polishSpellBook ? Array.from({ length: startingSpellCount }, () => "spell.magic_arrow") : [],
    spellBookUsed: [],
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
    moraleCards: { positive: [], negative: [] },
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
    spellBookUsed: [],
    removed: [],
    army: [],
    startingArmy: [],
    resources: { gold: 0, buildingMaterials: 0, valuables: 0 },
    production: { gold: 0, buildingMaterials: 0, valuables: 0 },
    townTokens: { build: false, population: false, spellBook: false },
    morale: 0,
    moraleCards: { positive: [], negative: [] },
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
    // faction's, so they never need a chosen tile id. Every other slot may pin
    // a specific tile — required face-up, optional face-down (exact secret) —
    // or name a secretFeature (face-down landmark filter).
    if (plan.group !== "starting" && plan.tileDefId) {
      const def = allTileDefinitions[plan.tileDefId];
      if (!def) {
        problems.push(`Tile ${index + 1}: unknown tile "${plan.tileDefId}".`);
        return false;
      }
      if (def.group === "starting") {
        problems.push(`Tile ${index + 1}: starting tiles are placed by faction, not by the designer.`);
        return false;
      }
      if (def.group !== plan.group) {
        problems.push(`Tile ${index + 1}: ${plan.tileDefId} belongs to the ${def.group} pool, not ${plan.group}.`);
        return false;
      }
    } else if (plan.group !== "starting" && !plan.faceDown) {
      problems.push(`Tile ${index + 1}: pick a tile for the face-up slot.`);
      return false;
    }
    if (plan.secretFeature !== undefined) {
      if (!isSecretTileFeature(plan.secretFeature)) {
        problems.push(`Tile ${index + 1}: unknown secret feature "${String(plan.secretFeature)}".`);
        return false;
      }
      if (!plan.faceDown) {
        problems.push(`Tile ${index + 1}: a secret landmark only applies to face-down slots.`);
        return false;
      }
      if (plan.group === "starting") {
        problems.push(`Tile ${index + 1}: starting towns cannot carry a secret landmark.`);
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

  // Designer Subterranean Gate links (cavern → Surface): each must name a Surface
  // tile that is actually placed AND physically touches the cavern, else it is
  // dropped with a human-readable reason. A cavern may link the SAME Surface tile
  // MORE THAN ONCE (several gates along the shared edge) as long as each pinned
  // pair is distinct:
  //   (a) a link whose PINNED gate/entrance hex collides with an already-accepted
  //       link's pinned hex — this cavern's OR any other cavern's, since two gate
  //       halves can never occupy the same board hex — is dropped with a problem;
  //   (b) an UNPINNED link to a surface already linked UNPINNED is a true duplicate
  //       (both would carve the same nearest hex) and is merged away;
  //   (c) otherwise (distinct pinned pairs, or the first unpinned link to a surface)
  //       every link is accepted and carves its OWN gate.
  // A cavern keeps at most MAX_DESIGNED_GATE_LINKS links. The pinned hexes are left
  // as-is — they are preferences the carve validates again on the drawn tiles.
  const surfaceCenterKeys = new Set<string>(
    startingPlans.length > 0
      ? accepted.filter((plan) => plan.group === "starting").map((plan) => `${plan.row}:${plan.col}`)
      : scenario.layout.starts.map((start) => `${start.row}:${start.col}`)
  );
  for (const plan of accepted) {
    // A gate link's SURFACE side must be a non-underground tile: an
    // underground-flagged far/near/center/sea plan is now on the cavern layer, so
    // it is NOT a legal surface target (the layer predicate, never a group check).
    if (plan.group !== "starting" && !planIsUnderground(plan)) {
      surfaceCenterKeys.add(`${plan.row}:${plan.col}`);
    }
  }
  // Pinned hexes claimed by every accepted link across ALL caverns: two gate
  // halves can never share a board hex, so a colliding pin is dropped (rule a).
  const claimedPinnedHexes = new Set<MapSpaceId>();
  for (let index = 0; index < accepted.length; index += 1) {
    const plan = accepted[index];
    // Gate links belong to any UNDERGROUND-layer plan — a printed cavern OR a
    // far/near/center/sea tile the designer flagged underground — not just
    // `group === "subterranean"`, so a flagged tile keeps its designed links.
    if (!planIsUnderground(plan) || !plan.gateLinks || plan.gateLinks.length === 0) {
      continue;
    }
    const cavernCenter = { row: plan.row, col: plan.col };
    // Surfaces this cavern already links UNPINNED — a second unpinned link there is
    // a true duplicate (rule b). Distinct pinned pairs to the same surface are kept.
    const unpinnedSurfaces = new Set<string>();
    const keptLinks: CustomMapGateLink[] = [];
    for (const link of plan.gateLinks) {
      const surfaceCenter = { row: link.surface.row, col: link.surface.col };
      const surfaceKey = `${surfaceCenter.row}:${surfaceCenter.col}`;
      if (!Number.isInteger(surfaceCenter.row) || !Number.isInteger(surfaceCenter.col) || !surfaceCenterKeys.has(surfaceKey)) {
        problems.push(
          `Cavern at ${plan.row},${plan.col}: gate link to ${link.surface.row},${link.surface.col} — no Surface tile is placed there.`
        );
        continue;
      }
      if (!tileFootprintsTouch(cavernCenter, surfaceCenter)) {
        problems.push(
          `Cavern at ${plan.row},${plan.col}: gate link to ${link.surface.row},${link.surface.col} — the tiles do not touch.`
        );
        continue;
      }
      if (keptLinks.length >= MAX_DESIGNED_GATE_LINKS) {
        problems.push(`Cavern at ${plan.row},${plan.col}: too many gate links (max ${MAX_DESIGNED_GATE_LINKS}).`);
        continue;
      }
      const pinnedHexes = [link.gateHex, link.entranceHex].filter((hex): hex is MapSpaceId => Boolean(hex));
      if (pinnedHexes.length > 0) {
        // (a) A pinned pair reusing a hex already claimed by an accepted link
        //     (this cavern's or another's) would double-carve a board hex — drop it.
        const collision = pinnedHexes.find((hex) => claimedPinnedHexes.has(hex));
        if (collision) {
          problems.push(
            `Cavern at ${plan.row},${plan.col}: gate link to ${link.surface.row},${link.surface.col} — its gate hex ${collision} collides with another gate.`
          );
          continue;
        }
        for (const hex of pinnedHexes) {
          claimedPinnedHexes.add(hex);
        }
      } else if (unpinnedSurfaces.has(surfaceKey)) {
        // (b) A second UNPINNED link to a surface already linked unpinned would carve
        //     the same nearest hex — merge it away.
        continue;
      } else {
        unpinnedSurfaces.add(surfaceKey);
      }
      // (c) Distinct pinned pair, or the first unpinned link to this surface.
      keptLinks.push(link);
    }
    if (keptLinks.length === plan.gateLinks.length) {
      continue; // every link was valid — keep the plan untouched
    }
    if (keptLinks.length > 0) {
      accepted[index] = { ...plan, gateLinks: keptLinks };
    } else {
      const next = { ...plan };
      delete next.gateLinks;
      accepted[index] = next;
    }
  }

  // Designer yellow borders: normalise every accepted plan's `extraBorders` to
  // unique absolute directions 0–5 (garbage dropped). Legal on ANY group —
  // starting, supply, sea, subterranean — so this runs over the whole list.
  for (let index = 0; index < accepted.length; index += 1) {
    const plan = accepted[index];
    if (plan.extraBorders === undefined) {
      continue;
    }
    const borders = normalizeDesignedBorders(plan.extraBorders);
    if (borders.length > 0) {
      accepted[index] = { ...plan, extraBorders: borders };
    } else {
      const next = { ...plan };
      delete next.extraBorders;
      accepted[index] = next;
    }
  }

  // Designer per-edge yellow borders: normalise every accepted plan's
  // `borderEdges` to canonical edge codes (garbage dropped, deduped, capped at
  // 30). Legal on ANY group, same as the whole-arc `extraBorders` above.
  for (let index = 0; index < accepted.length; index += 1) {
    const plan = accepted[index];
    if (plan.borderEdges === undefined) {
      continue;
    }
    const edges = normalizeDesignedBorderEdges(plan.borderEdges);
    if (edges.length > 0) {
      accepted[index] = { ...plan, borderEdges: edges };
    } else {
      const next = { ...plan };
      delete next.borderEdges;
      accepted[index] = next;
    }
  }

  // `lockRotation` FIXES a starting tile's orientation (no opening rotation). It
  // is meaningful only on a starting plan — strip it on every other group, like
  // gateLinks are cavern-only. (The rotation value 0-5 is already validated
  // globally above, so nothing else about a stripped plan changes.)
  for (let index = 0; index < accepted.length; index += 1) {
    const plan = accepted[index];
    if (plan.lockRotation && plan.group !== "starting") {
      const next = { ...plan };
      delete next.lockRotation;
      accepted[index] = next;
    }
  }

  // The UNDERGROUND layer override is a supply/sea/center-only flag (kept as a
  // literal true): strip it on `starting` (seat tiles stay Surface — the v1
  // limit) and `subterranean` (redundant — already underground), and drop any
  // non-true garbage. Mirrors the persistence sanitiser exactly so an in-memory
  // designer plan and a stored one flag the same layer.
  for (let index = 0; index < accepted.length; index += 1) {
    const plan = accepted[index];
    if (plan.underground === undefined) {
      continue;
    }
    if (plan.underground === true && UNDERGROUND_LAYER_GROUPS.has(plan.group)) {
      continue;
    }
    const next = { ...plan };
    delete next.underground;
    accepted[index] = next;
  }

  // `viiField` FORCES a center slot's difficulty-7 objective field (Grail /
  // Dragon Utopia / Random Town) and `centerHex` customizes that field's guard /
  // reward / VP. Both are meaningful only on a `center` plan — strip them on
  // every other group (like lockRotation is starting-only), drop an unknown
  // designation, and re-clamp the customization defensively so an in-memory
  // plan can never smuggle garbage past the persistence sanitiser.
  for (let index = 0; index < accepted.length; index += 1) {
    const plan = accepted[index];
    if (plan.viiField === undefined && plan.centerHex === undefined) {
      continue;
    }
    const isCenter = plan.group === "center";
    const validVii = isCenter && plan.viiField !== undefined && VII_FIELD_DESIGNATIONS.has(plan.viiField);
    const centerHex = isCenter ? sanitizeCenterHexPlan(plan.centerHex) : undefined;
    if (validVii && centerHex === plan.centerHex) {
      continue;
    }
    const next = { ...plan };
    if (!validVii) {
      delete next.viiField;
    }
    if (centerHex) {
      next.centerHex = centerHex;
    } else {
      delete next.centerHex;
    }
    accepted[index] = next;
  }

  return { accepted, problems };
}

/**
 * A designer cavern hosts at most this many Subterranean Gate links. This is a
 * sanitiser bound (a real cavern touches at most six Surface tiles and offers a
 * handful of boundary pairs each), NOT a design limit — a cavern may link EVERY
 * touching Surface tile, and the SAME Surface tile several times at distinct
 * boundary pairs; 24 is effectively unlimited for any real layout. The
 * persistence sanitiser (`map-registry.ts`) mirrors this exact bound.
 */
export const MAX_DESIGNED_GATE_LINKS = 24;

/** Reserved `tileInstanceId` marker prefix for a designer STANDALONE object hex (no backing tile). */
const STANDALONE_OBJECT_TILE_PREFIX = "standalone-object:";

/**
 * Validate the designer's one-hex map objects against the tile plans (geometry +
 * layer), returning the objects to MATERIALIZE plus human-readable `problems`
 * (dropped objects) and `warnings` (kept-but-noted). Shared by SETUP (which
 * drops the invalid ones) and the designer (live feedback), so the two never
 * diverge. `startingCenters` (the scenario seats) are used as Surface anchors
 * only when the designer placed no starting plan — mirroring the tile-plan
 * validator's seat-anchor fallback.
 *
 * Rules:
 *  - tile-slot: must name a FACE-UP pinned tile plan (so the slot's legality is
 *    known at design time) and a slot that legally hosts the kind
 *    (`tokenMayCoverFieldDef`; a Gate uses the land "monolith" legality). A
 *    face-down / random / starting plan cannot host one.
 *  - standalone: LAND kinds only (no standalone Whirlpool); must not fall inside
 *    any tile footprint, must not collide with another object's hex, and must not
 *    touch BOTH layers (an implicit Surface↔Underground bridge — rejected).
 *    Touching no tile is a WARNING (unreachable), not a problem.
 *  - a colored gate network with only ONE member placed is a WARNING (a lone
 *    gate leads nowhere); more than {@link MAX_GATES_PER_PAIR} of one color is a
 *    WARNING (over the cap). Both COUNT ACROSS SOURCES — every plan's gate
 *    `token` (the canonical on-tile form) plus every gate object — so a lone gate
 *    OBJECT whose partner is a tile TOKEN of the same color does not warn.
 */
export function validateCustomMapObjects(
  plans: CustomMapTilePlan[],
  objects: CustomMapObject[],
  startingCenters: HexCoord[] = []
): { accepted: CustomMapObject[]; problems: string[]; warnings: string[] } {
  const problems: string[] = [];
  const warnings: string[] = [];
  const accepted: CustomMapObject[] = [];

  // Effective tile anchors: every supply/starting plan, plus the scenario seats
  // when the designer placed no starting plan of its own.
  const startingPlans = plans.filter((plan) => plan.group === "starting");
  const anchors: { center: HexCoord; layer: "surface" | "subterranean" }[] = plans.map((plan) => ({
    center: { row: plan.row, col: plan.col },
    // A designer-flagged underground far/near/center/sea tile is on the cavern
    // layer for the standalone-hex "may not bridge both layers" check, exactly
    // like a printed cavern (the layer predicate, not a group check).
    layer: planIsUnderground(plan) ? "subterranean" : "surface"
  }));
  if (startingPlans.length === 0) {
    for (const center of startingCenters) {
      anchors.push({ center, layer: "surface" });
    }
  }
  // Every tile footprint hex → its layer (footprint hexes are rotation-invariant).
  const hexLayer = new Map<string, "surface" | "subterranean">();
  for (const anchor of anchors) {
    for (const cell of tileFootprint(anchor.center, 0)) {
      hexLayer.set(hexSpaceId(cell), anchor.layer);
    }
  }
  const faceUpPlanAt = new Map<string, CustomMapTilePlan>();
  for (const plan of plans) {
    if (!plan.faceDown && plan.tileDefId) {
      faceUpPlanAt.set(`${plan.row}:${plan.col}`, plan);
    }
  }

  const objectHexes = new Set<string>();
  // Gate members counted ACROSS SOURCES: every plan's gate `token` (the
  // canonical on-tile form) seeds the count so a gate OBJECT partnered with a
  // gate TOKEN of the same color is a complete network, not a lone warning.
  const gatesPerPair = new Map<number, number>();
  for (const plan of plans) {
    if (plan.token?.kind === "gate" && plan.token.pair !== undefined) {
      gatesPerPair.set(plan.token.pair, (gatesPerPair.get(plan.token.pair) ?? 0) + 1);
    }
  }

  objects.forEach((object, index) => {
    const label = `Object ${index + 1}`;
    if (object.placement.type === "tile-slot") {
      // Outposts (Garrison / Keymaster's Tent / Barrier) are STANDALONE-only —
      // "a separate hex out of the map"; a tile-slot placement is dropped.
      if (OUTPOST_OBJECT_KINDS.has(object.kind)) {
        problems.push(`${label}: a ${object.kind.replace("_", " ")} must be a standalone hex, never on a tile.`);
        return;
      }
      const { row, col, slot } = object.placement;
      const plan = faceUpPlanAt.get(`${row}:${col}`);
      if (!plan || !plan.tileDefId) {
        problems.push(`${label}: must sit on a face-up tile — no face-up tile is placed at ${row},${col}.`);
        return;
      }
      const def = allTileDefinitions[plan.tileDefId];
      // Gates and one-way monoliths are land structures, so they reuse the
      // Monolith slot legality. (Outposts returned above.)
      const slotKind = (
        object.kind === "gate" || object.kind === "oneway_entrance" || object.kind === "oneway_exit"
          ? "monolith"
          : object.kind
      ) as "monolith" | "whirlpool";
      if (!def || !tokenMayCoverFieldDef(def, slot, slotKind)) {
        problems.push(`${label}: slot ${slot} of ${plan.tileDefId} cannot host a ${object.kind}.`);
        return;
      }
      const hex = hexSpaceId(tileFootprint({ row, col }, plan.rotation ?? 0)[slot]);
      if (objectHexes.has(hex)) {
        problems.push(`${label}: another object already occupies that hex.`);
        return;
      }
      objectHexes.add(hex);
      if (object.kind === "gate" && object.pair !== undefined) {
        gatesPerPair.set(object.pair, (gatesPerPair.get(object.pair) ?? 0) + 1);
      }
      accepted.push(object);
      return;
    }

    // Standalone: LAND kinds only, off every tile.
    const { row, col } = object.placement;
    if (object.kind === "whirlpool") {
      problems.push(`${label}: a standalone Whirlpool is not supported — Whirlpools sit on sea-tile slots.`);
      return;
    }
    const hex = hexSpaceId({ row, col });
    if (hexLayer.has(hex)) {
      problems.push(`${label}: a standalone hex may not fall inside a tile (${row},${col} is a tile hex).`);
      return;
    }
    if (objectHexes.has(hex)) {
      problems.push(`${label}: another object already occupies that hex.`);
      return;
    }
    const coord = parseHexSpaceId(hex);
    let touchesSurface = false;
    let touchesSub = false;
    if (coord) {
      for (const neighbor of hexNeighbors(coord)) {
        const layer = hexLayer.get(hexSpaceId(neighbor));
        if (layer === "surface") {
          touchesSurface = true;
        } else if (layer === "subterranean") {
          touchesSub = true;
        }
      }
    }
    if (touchesSurface && touchesSub) {
      problems.push(
        `${label}: a standalone hex may not touch BOTH a Surface and an Underground tile (implicit layer bridge).`
      );
      return;
    }
    if (!touchesSurface && !touchesSub) {
      warnings.push(`${label}: a standalone hex at ${row},${col} touches no tile — it is unreachable in game.`);
    }
    objectHexes.add(hex);
    if (object.kind === "gate" && object.pair !== undefined) {
      gatesPerPair.set(object.pair, (gatesPerPair.get(object.pair) ?? 0) + 1);
    }
    accepted.push(object);
  });

  for (const [pair, count] of gatesPerPair) {
    const color = gatePairColor(pair as 1 | 2 | 3 | 4);
    if (count === 1) {
      warnings.push(
        `The ${color} Gate pair has only one gate placed — at least two ${color} Gates are needed to teleport.`
      );
    } else if (count > MAX_GATES_PER_PAIR) {
      warnings.push(
        `The ${color} Gate network has ${count} gates — at most ${MAX_GATES_PER_PAIR} of one color are supported; the extras are dropped.`
      );
    }
  }

  // A Barrier with no same-color Keymaster's Tent can never be entered by
  // anyone — almost certainly a design mistake, so warn (not a problem: a
  // deliberate permanent wall is legal).
  const tentPairs = new Set(
    accepted.filter((object) => object.kind === "keymaster_tent" && object.pair !== undefined).map((o) => o.pair)
  );
  for (const object of accepted) {
    if (object.kind === "barrier" && object.pair !== undefined && !tentPairs.has(object.pair)) {
      warnings.push(
        `A ${gatePairColor(object.pair)} Barrier has no ${gatePairColor(object.pair)} Keymaster's Tent — nobody will ever be able to enter it.`
      );
    }
  }

  // One-way monolith networks need both halves of a color — counted ACROSS
  // SOURCES (objects + every plan's tokens), like the gate networks above.
  const onewayCounts = new Map<number, { entrances: number; exits: number }>();
  const bumpOneway = (kind: string, pair: number | undefined): void => {
    if (pair === undefined || (kind !== "oneway_entrance" && kind !== "oneway_exit")) {
      return;
    }
    const entry = onewayCounts.get(pair) ?? { entrances: 0, exits: 0 };
    if (kind === "oneway_entrance") {
      entry.entrances += 1;
    } else {
      entry.exits += 1;
    }
    onewayCounts.set(pair, entry);
  };
  for (const object of accepted) {
    bumpOneway(object.kind, object.pair);
  }
  for (const plan of plans) {
    for (const token of planTokens(plan)) {
      bumpOneway(token.kind, token.pair);
    }
  }
  for (const [pair, counts] of onewayCounts) {
    const color = gatePairColor(pair as 1 | 2 | 3 | 4);
    if (counts.entrances > 0 && counts.exits === 0) {
      warnings.push(`The ${color} one-way monolith has entrances but NO exit — the travel will lead nowhere.`);
    } else if (counts.exits > 0 && counts.entrances === 0) {
      warnings.push(`The ${color} one-way monolith has exits but NO entrance — nobody can ever arrive there.`);
    }
  }

  return { accepted, problems, warnings };
}

/** The layer a standalone hex sits on, from the ACTUAL tiles it neighbours (setup). */
function standaloneLayerFromLiveState(adventure: AdventureState, spaceId: MapSpaceId): "surface" | "subterranean" {
  const coord = parseHexSpaceId(spaceId);
  if (coord) {
    for (const neighbor of hexNeighbors(coord)) {
      const neighborField = adventure.fields[hexSpaceId(neighbor)];
      const tile = neighborField ? adventure.tiles[neighborField.tileInstanceId] : undefined;
      if (tile && tileLayer(tile) === "subterranean") {
        return "subterranean";
      }
    }
  }
  return "surface";
}

/**
 * Materialize the designer's accepted one-hex objects onto the freshly-laid map.
 * A tile-slot object carves the tile hex (exactly like the legacy token carve); a
 * standalone object materializes a NEW field OFF every tile with a reserved
 * `tileInstanceId` marker (never a key of `adventure.tiles`) and a layer inferred
 * from the tiles it touches. A DESIGNED guard difficulty, if any, is set on the
 * object's field AFTER the carve (the carve clears difficulty), so the standard
 * neutral-guard flow runs: stepping on → battle at that difficulty → only a WIN
 * resolves the teleport. Runs BEFORE recomputeSubterraneanGates (which now
 * refuses a gate object's hex too — {@link gateMayCoverField}).
 */
function applyCustomMapObjects(adventure: AdventureState, objects: CustomMapObject[]): void {
  const WHIRLPOOL_NUMBERS: (-1 | 0 | 1)[] = [1, 0, -1];
  const tileAtCenter = (row: number, col: number): MapTileState | undefined =>
    Object.values(adventure.tiles).find((tile) => tile.centerRow === row && tile.centerCol === col);

  for (const object of objects) {
    if (object.placement.type === "tile-slot") {
      const tile = tileAtCenter(object.placement.row, object.placement.col);
      if (!tile) {
        continue;
      }
      const spaceId = getTileFootprintSpaceIds(tile)[object.placement.slot];
      const field = spaceId ? adventure.fields[spaceId] : undefined;
      if (!spaceId || !field || field.tileInstanceId !== tile.id) {
        continue;
      }
      if (object.kind === "gate" && object.pair !== undefined) {
        carveColoredGateField(adventure, spaceId, object.pair);
      } else if (object.kind === "monolith" || object.kind === "whirlpool") {
        // Continue the +1/0/-1 numbering across every whirlpool already carved
        // (the legacy `token` carve runs first).
        const whirlpoolCount = Object.values(adventure.fields).filter((f) => f.location === "whirlpool").length;
        const number = object.kind === "whirlpool" ? WHIRLPOOL_NUMBERS[whirlpoolCount] : undefined;
        carveMapTokenField(adventure, spaceId, object.kind, number);
      }
      const carved = adventure.fields[spaceId];
      if (carved) {
        applyCustomGuardToField(carved, objectGuardSpec(object));
      }
      continue;
    }

    // Standalone — LAND objects only (a standalone whirlpool never reaches
    // here, validation drops it).
    if (object.kind === "whirlpool") {
      continue;
    }
    const spaceId = hexSpaceId({ row: object.placement.row, col: object.placement.col });
    if (adventure.fields[spaceId]) {
      continue; // never clobber an existing field (validation guards this)
    }
    const field: MapFieldState = {
      spaceId,
      tileInstanceId: `${STANDALONE_OBJECT_TILE_PREFIX}${spaceId}`,
      slot: 0,
      location: object.kind === "gate" ? "gate" : object.kind,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null,
      standalone: true,
      standaloneLayer: standaloneLayerFromLiveState(adventure, spaceId)
    };
    // Tents, Barriers and one-way monoliths share the gate COLOR mechanism
    // (`gatePair`) — a tent flag of a color opens same-color barriers, a
    // one-way entrance targets same-color exits; gates keep their networks.
    if (
      (object.kind === "gate" ||
        object.kind === "keymaster_tent" ||
        object.kind === "barrier" ||
        object.kind === "oneway_entrance" ||
        object.kind === "oneway_exit") &&
      object.pair !== undefined
    ) {
      field.gatePair = object.pair;
    }
    if (object.kind === "oneway_entrance" && object.exitMode) {
      field.onewayExitMode = object.exitMode;
    }
    if (object.kind === "oneway_exit" && object.alwaysPickable) {
      field.onewayAlwaysPickable = true;
    }
    applyCustomGuardToField(field, objectGuardSpec(object));
    // Outpost / one-way-entrance fights run BANK-style (no Quick Combat, no
    // experience, no Round limit) whatever the guard shape: a LEVEL guard
    // additionally pins `customGuardLevel` so the army still draws at the
    // designed level while the combat itself opens at difficulty 0.
    if (object.kind === "garrison" || object.kind === "keymaster_tent" || object.kind === "oneway_entrance") {
      const guard = objectGuardSpec(object);
      if (guard?.level && !guard.units) {
        field.customGuardLevel = guard.level;
      }
    }
    // Designer yellow border edges ride the object onto its carved field
    // (absolute dirs, re-normalised so a hand-edited save can't smuggle junk).
    if (Array.isArray(object.borderEdges)) {
      const edges = [
        ...new Set(object.borderEdges.filter((dir) => Number.isInteger(dir) && dir >= 0 && dir <= 5))
      ].sort((a, b) => a - b);
      if (edges.length > 0) {
        field.borderEdges = edges;
      }
    }
    adventure.fields[spaceId] = field;
  }
}

/**
 * Copies a designer plan's yellow borders (absolute directions 0–5) onto the
 * freshly-placed tile instance, so the seal holds from the moment the tile is
 * placed — including while it is face-down and after any later rotation.
 * Normalised again here so the placed instance is always canonical regardless of
 * the plan's provenance.
 */
function applyDesignedBorders(tile: MapTileState, plan: CustomMapTilePlan): void {
  const borders = normalizeDesignedBorders(plan.extraBorders);
  if (borders.length > 0) {
    tile.extraBorders = borders;
  }
  // Per-edge borders (the designer's forward path) ride the same placement
  // moment, so the seal holds from the instant the tile is placed — face-down and
  // after any later rotation.
  const edges = normalizeDesignedBorderEdges(plan.borderEdges);
  if (edges.length > 0) {
    tile.borderEdges = edges;
  }
}

/**
 * Carry the designer's UNDERGROUND layer override (plan → instance): a
 * far/near/center/sea tile flagged underground rides onto the placed tile so
 * {@link tileLayer} reads it as "subterranean" from the instant it is placed —
 * face-down included, so the Subterranean-Gate auto-pairing and the
 * cross-layer discovery seal hold before the tile is ever revealed. Validation
 * already stripped the flag from starting/subterranean plans; the group guard
 * here is one more line of defence so a hand-built plan can never smuggle it
 * onto a seat tile. Layer-only: it never touches the tile's band content.
 */
function applyDesignedUnderground(tile: MapTileState, plan: CustomMapTilePlan): void {
  if (plan.underground === true && UNDERGROUND_LAYER_GROUPS.has(plan.group)) {
    tile.underground = true;
  }
}

/**
 * Center-tile Ⅶ customization (plan → instance): store the objective override
 * (`viiField`) and/or the center-hex guard / reward / VP (`centerHex`) on the
 * placed tile so its difficulty-7 objective field materializes with them.
 * Each is independent — a center hex may be customized on the PRINTED
 * objective with no designation at all. Meaningful only on a `center` plan
 * (stripped elsewhere at validation). A FACE-UP center tile already
 * materialized its fields inside `instantiateTile`, so re-run the
 * materialization now that the customization is set; a FACE-DOWN tile
 * materializes on reveal and reads it then.
 */
function applyDesignedViiField(
  adventure: AdventureState,
  tile: MapTileState,
  plan: CustomMapTilePlan
): void {
  if (plan.group !== "center" || (!plan.viiField && !plan.centerHex)) {
    return;
  }
  if (plan.viiField) {
    tile.viiField = plan.viiField;
  }
  // Carry the OPTIONAL center-hex customization onto the placed instance,
  // clamped defensively so an in-memory plan can't smuggle a huge value past
  // the persistence sanitiser. materializeTileFields folds it onto the Ⅶ field.
  const centerHex = sanitizeCenterHexPlan(plan.centerHex);
  if (centerHex) {
    tile.centerHex = centerHex;
  }
  if (!tile.faceDown) {
    materializeTileFields(adventure, tile);
  }
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

/** Removes and returns a tile from the pool that carries `location`. */
function takeTileWith(pool: string[], location: string): string | undefined {
  const index = pool.findIndex((tileDefId) =>
    (allTileDefinitions[tileDefId]?.fields ?? []).some((field) => field.location === location)
  );
  return index >= 0 ? pool.splice(index, 1)[0] : undefined;
}

/** Removes and returns a Center tile from the pool that carries `location`. */
function takeCenterTileWith(pool: string[], location: string): string | undefined {
  return takeTileWith(pool, location);
}

/**
 * Holy Grail seeding: how many Obelisks the map design already guarantees
 * (face-up/exact pins that carry an Obelisk, or secretFeature "obelisk").
 * Random face-down slots do NOT count until drawn.
 */
function countGuaranteedObelisks(plans: CustomMapTilePlan[] | undefined): number {
  if (!plans?.length) {
    return 0;
  }
  let count = 0;
  for (const plan of plans) {
    if (plan.secretFeature === "obelisk") {
      count += 1;
      continue;
    }
    if (plan.tileDefId) {
      const def = allTileDefinitions[plan.tileDefId];
      if (def?.fields.some((field) => field.location === "obelisk")) {
        count += 1;
      }
    }
  }
  return count;
}

/**
 * Holy Grail: pull up to `count` remaining Obelisk-bearing tiles from the given
 * pools (near preferred, then far). Used after designer presets are counted so
 * the map always has at least 2 Obelisks to discover.
 */
function takeObeliskTiles(pools: { near?: string[]; far?: string[] }, count: number): string[] {
  const taken: string[] = [];
  for (const pool of [pools.near, pools.far]) {
    if (!pool || taken.length >= count) {
      break;
    }
    while (taken.length < count) {
      const tile = takeTileWith(pool, "obelisk");
      if (!tile) {
        break;
      }
      taken.push(tile);
    }
  }
  return taken;
}

/**
 * Holy Grail: pull remaining Grail tiles still in the center pool (after the
 * Center slots have taken their share) so a second Grail can land on a Near /
 * Far overflow slot when the layout only has one Center.
 */
function takeRemainingGrailTiles(centerPool: string[], max: number): string[] {
  const taken: string[] = [];
  while (taken.length < max) {
    const tile = takeCenterTileWith(centerPool, "grail");
    if (!tile) {
      break;
    }
    taken.push(tile);
  }
  return taken;
}

/**
 * Pops a tile matching a designer Secret feature from a shuffled pool.
 * Walks from the top of the remaining supply (end of the array) so the draw
 * is seed-deterministic after the pool was shuffled. Optional sea/sub band
 * filters keep the pick inside the slot's guard band.
 */
function popTileMatchingFeature(
  pool: string[],
  feature: SecretTileFeature,
  options?: {
    group?: CustomMapTilePlan["group"];
    seaBand?: CustomMapTilePlan["seaBand"];
    subBand?: CustomMapTilePlan["subBand"];
  }
): string | undefined {
  for (let index = pool.length - 1; index >= 0; index -= 1) {
    const tileDefId = pool[index];
    const def = allTileDefinitions[tileDefId];
    if (!def) {
      continue;
    }
    if (options?.group && def.group !== options.group) {
      continue;
    }
    if (options?.group === "sea" && options.seaBand && seaTileBand(def) !== options.seaBand) {
      continue;
    }
    if (
      options?.group === "subterranean" &&
      options.subBand &&
      subterraneanTileBand(def) !== options.subBand
    ) {
      continue;
    }
    if (tileMatchesSecretFeature(def, feature)) {
      return pool.splice(index, 1)[0];
    }
  }
  return undefined;
}

/**
 * Center (VI–VII) tiles forced by the win condition. Holy Grail guarantees up
 * to TWO Grail tiles across available Center slots (the dig sites); leftover
 * Grail tiles may still overflow onto Near/Far via {@link takeRemainingGrailTiles}.
 * Dragon Hunt / Dragon Conqueror guarantee a Dragon Utopia. The array is
 * index-aligned with the scenario's Center positions; undefined entries fall
 * back to a random draw. Holy Grail no longer forces a Dragon Utopia.
 */
function forcedObjectiveCenterTiles(pool: string[], slots: number, mode: VictoryMode): (string | undefined)[] {
  if (slots <= 0) {
    return [];
  }
  if (mode === "grail") {
    // Prefer a Grail on every Center slot, capped at 2 dig sites.
    const result: (string | undefined)[] = [];
    const grailSlots = Math.min(slots, 2);
    for (let index = 0; index < grailSlots; index += 1) {
      result.push(takeCenterTileWith(pool, "grail"));
    }
    while (result.length < slots) {
      result.push(undefined);
    }
    return result;
  }
  if (mode === "dragon-hunt" || mode === "dragon-conqueror") {
    return [takeCenterTileWith(pool, "dragon_utopia")];
  }
  return [];
}

/**
 * Fold the lobby Victory-Points toggle into the (already-sanitized) effective map
 * preset. Off/absent → the preset is returned unchanged (byte-identical). On → a
 * `victoryPoints: { enabled: true }` block is injected, creating a minimal preset
 * when none exists. A designed preset that ALREADY enables VP stays
 * AUTHORITATIVE: its own config is kept verbatim and an explicit lobby
 * `victoryPoints: false`/absent NEVER disables it. The round limit follows the
 * same rule — the preset's own `roundLimit` wins; else the clamped lobby
 * `victoryPointsRoundLimit` (mirroring the designed-preset 1–30 bounds, 0 clears)
 * is injected as the preset `roundLimit`, which is the HARD scored-end trigger.
 */
function applyLobbyVictoryPoints(
  preset: CustomMapPreset | null,
  setupOptions: GameSetupOptions
): CustomMapPreset | null {
  if (setupOptions.victoryPoints !== true) {
    return preset;
  }
  // The map author's VP config is final — never overwrite it from the lobby.
  if (preset?.victoryPoints?.enabled) {
    return preset;
  }
  const next: CustomMapPreset = { ...(preset ?? {}), victoryPoints: { enabled: true } };
  // The preset's own round limit wins; else inject the clamped lobby one.
  if (next.roundLimit === undefined && setupOptions.victoryPointsRoundLimit !== undefined) {
    const limit = Math.max(0, Math.min(30, Math.floor(setupOptions.victoryPointsRoundLimit)));
    if (limit > 0) {
      next.roundLimit = limit;
    }
  }
  return next;
}

/**
 * Fold the lobby-added custom win conditions into the (already-sanitized)
 * effective map preset. No lobby list → the preset is returned UNCHANGED
 * (byte-identical; a legacy build is untouched). Otherwise the map's own
 * conditions come FIRST, the lobby's are appended, exact-duplicates are deduped
 * and the union is capped ({@link mergeCustomWinConditions}) — the lobby can only
 * ADD, never remove a map-authored condition. The lobby list is re-sanitised here
 * (it may arrive raw from a direct `createAdventureGameState` call).
 */
function applyLobbyCustomWinConditions(
  preset: CustomMapPreset | null,
  setupOptions: GameSetupOptions
): CustomMapPreset | null {
  const lobbyConditions = sanitizeCustomWinConditions(setupOptions.customWinConditions);
  if (lobbyConditions.length === 0) {
    return preset;
  }
  const merged = mergeCustomWinConditions(preset?.customWinConditions, lobbyConditions);
  return { ...(preset ?? {}), customWinConditions: merged };
}

export function createAdventureGameState(options: AdventureSetupOptions = {}): GameState {
  // A missing seed must NOT collapse to a constant — that is what made every
  // fresh game open on the same map and Creature Bank order. Mint fresh entropy.
  const seed = options.seed ?? freshSeed("homm3bg-adventure");
  const scenario = getScenario(options.scenarioId);
  const setupOptions: GameSetupOptions = {
    ...defaultGameSetupOptions(scenario),
    ...(options.ruleset ? { ruleset: options.ruleset } : {}),
    ...(options.wog ? { wog: { ...DEFAULT_WOG_OPTIONS, ...options.wog } } : {}),
    ...(options.anime ? { anime: resolveAnimeOptions(options.anime) } : {}),
    ...(options.victoryMode ? { victoryMode: options.victoryMode } : {}),
    ...(options.pvpTroopLoss ? { pvpTroopLoss: options.pvpTroopLoss } : {}),
    ...(options.dragonUtopiaGuards ? { dragonUtopiaGuards: options.dragonUtopiaGuards } : {}),
    ...(options.difficulty ? { difficulty: options.difficulty } : {}),
    ...(options.startingResources ? { startingResources: options.startingResources } : {}),
    ...(options.startingProduction ? { startingProduction: options.startingProduction } : {}),
    ...(options.startingUnitTiers ? { startingUnitTiers: options.startingUnitTiers } : {}),
    ...(options.startingUnits !== undefined ? { startingUnits: options.startingUnits } : {}),
    ...(options.startingBuildings ? { startingBuildings: options.startingBuildings } : {}),
    ...(options.creatureBanks !== undefined ? { creatureBanks: options.creatureBanks } : {}),
    ...(options.fieldOverrides !== undefined ? { fieldOverrides: options.fieldOverrides } : {}),
    ...(options.fieldOverridePlacement !== undefined
      ? { fieldOverridePlacement: options.fieldOverridePlacement }
      : {}),
    ...(options.events !== undefined ? { events: options.events } : {}),
    ...(options.victoryPoints !== undefined ? { victoryPoints: options.victoryPoints } : {}),
    ...(options.victoryPointsRoundLimit !== undefined
      ? { victoryPointsRoundLimit: options.victoryPointsRoundLimit }
      : {}),
    ...(options.customWinConditions !== undefined
      ? { customWinConditions: options.customWinConditions }
      : {}),
    ...(options.parallelTurns !== undefined ? { parallelTurns: options.parallelTurns } : {}),
    ...(options.undoMoves !== undefined ? { undoMoves: options.undoMoves } : {}),
    ...(options.spellBook !== undefined ? { spellBook: options.spellBook } : {}),
    ...(options.moraleCards !== undefined ? { moraleCards: options.moraleCards } : {}),
    ...(options.tournamentMode !== undefined ? { tournamentMode: options.tournamentMode } : {}),
    ...(options.tournamentBanDiplomacy !== undefined
      ? { tournamentBanDiplomacy: options.tournamentBanDiplomacy }
      : {}),
    ...(options.tournamentBanHourglass !== undefined
      ? { tournamentBanHourglass: options.tournamentBanHourglass }
      : {}),
    ...(options.tournamentSecondPlayerMorale !== undefined
      ? { tournamentSecondPlayerMorale: options.tournamentSecondPlayerMorale }
      : {}),
    ...(options.pvpNeutralControl !== undefined ? { pvpNeutralControl: options.pvpNeutralControl } : {}),
    ...(options.pvpNeutralControlMustAttack !== undefined
      ? { pvpNeutralControlMustAttack: options.pvpNeutralControlMustAttack }
      : {}),
    ...(options.houseRules !== undefined ? { houseRules: options.houseRules } : {}),
    ...(options.farTileOpening !== undefined ? { farTileOpening: options.farTileOpening } : {}),
    ...(options.farTilesPerPlayer !== undefined ? { farTilesPerPlayer: options.farTilesPerPlayer } : {}),
    ...(options.customMap !== undefined ? { customMap: options.customMap } : {}),
    ...(options.customMapPreset !== undefined ? { customMapPreset: options.customMapPreset } : {})
  };
  // Map preset APPLY-ONCE semantics: the preset seeds these fields when the
  // map is PICKED (setGameOptions). At build time it only fills fields the
  // caller did NOT pass explicitly — so a host's later lobby edit (e.g.
  // switching the victory mode after picking the map) is honoured, and the
  // lobby path (which always passes every field) is never silently reverted.
  if (setupOptions.customMapPreset) {
    const explicit = new Set<PresetForcedOptionKey>([
      ...(options.victoryMode !== undefined ? (["victoryMode"] as const) : []),
      ...(options.difficulty !== undefined ? (["difficulty"] as const) : []),
      ...(options.farTileOpening !== undefined ? (["farTileOpening"] as const) : []),
      ...(options.farTilesPerPlayer !== undefined ? (["farTilesPerPlayer"] as const) : []),
      ...(options.startingResources !== undefined ? (["startingResources"] as const) : []),
      ...(options.startingProduction !== undefined ? (["startingProduction"] as const) : []),
      ...(options.startingBuildings !== undefined ? (["startingBuildings"] as const) : []),
      ...(options.startingUnits !== undefined ? (["startingUnits"] as const) : [])
    ]);
    applyCustomMapPresetToOptions(
      setupOptions,
      sanitizeCustomMapPreset(setupOptions.customMapPreset),
      explicit
    );
  }
  const difficulty = setupOptions.difficulty;
  // Naval Battles Creature Banks default ON: discovering a Far/Near tile with a
  // Blocked Field offers the discovering player a bank token from the matching
  // pile. Off skips both the piles and the offer.
  const creatureBanksOn = setupOptions.creatureBanks ?? true;
  // Morale Cards are opt-in: when on, morale draws cards instead of changing tokens.
  const moraleCardsOn = setupOptions.moraleCards ?? false;
  // Tournament setup rules (p.54): granular bans + second-player morale.
  const tournamentRules = resolveTournamentRules(setupOptions);
  // Pick-on-reveal Subterranean Gate placement default ON.
  const chooseGatePlacementOn = options.chooseSubterraneanGate ?? true;
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
  // Resolve every individual house-rule toggle to a concrete boolean for this
  // game (explicit flag if set, else the chosen mode's default). Frozen onto
  // adventure state so the engine reads plain booleans during play.
  const houseRules = resolveHouseRules(setupOptions);
  const polishSpellBookOn = houseRules["polish-spell-book"];
  // The two Spell Book lifecycles can never coexist. A direct setup payload
  // that asks for both resolves in favour of the explicit Polish variant; the
  // lobby UI also switches the other toggle off immediately.
  const spellBookOn = polishSpellBookOn
    ? false
    : setupOptions.spellBook ?? setupOptions.ruleset === "binh";
  let wog: WogModOptions = ruleset === "binh"
    ? { ...DEFAULT_WOG_OPTIONS, ...setupOptions.wog }
    : { ...DEFAULT_WOG_OPTIONS, ...setupOptions.wog, enabled: false };
  // Designer pins of wog-package Field Overrides auto-enable the Wake of Gods
  // `newObjects` module (content package) at map setup — mirrors the Anime pins
  // below; the override *mechanism* itself is global. WoG content requires BINH.
  if (customMapHasWogFieldOverridePins(setupOptions.customMap) && ruleset === "binh") {
    wog = { ...wog, enabled: true, newObjects: true };
  }
  // Designer pins of anime-package Field Overrides auto-enable the Anime mod
  // (content package) at map setup — the override *mechanism* is global.
  const animePinsOnMap = customMapHasAnimeFieldOverridePins(setupOptions.customMap);
  let anime: AnimeModOptions = ruleset === "binh"
    ? resolveAnimeOptions(setupOptions.anime)
    : { ...resolveAnimeOptions(setupOptions.anime), enabled: false };
  if (animePinsOnMap && ruleset === "binh") {
    // Force the map-objects module on too (mirror wog `newObjects: true`) so a
    // pinned anime FO is legal in the pool even if the lobby unticked it.
    anime = { ...anime, enabled: true, mapObjects: true };
  } else if (animePinsOnMap && ruleset !== "binh") {
    // Anime content requires BINH; flip so pins are not silently stripped.
    anime = { ...resolveAnimeOptions(setupOptions.anime), enabled: true, mapObjects: true };
  }
  // A map-objects content module (WOG New Objects / Anime map objects) forces
  // the global Field Override mechanism ON — read the RESOLVED `wog`/`anime`
  // above (designer pins already folded in) so this backstop mirrors the
  // `setGameOptions` chokepoint even for a direct build payload that ticked the
  // module but left `fieldOverrides` off/absent. Force-ON only.
  const fieldOverridesOn =
    resolveFieldOverridesEnabled(setupOptions) || mapObjectsModuleActive({ wog, anime });
  const fieldOverridePlacement = resolveFieldOverridePlacement(setupOptions);
  const victoryMode: VictoryMode = setupOptions.victoryMode ?? "conquest";
  const pvpTroopLoss: PvpTroopLoss = setupOptions.pvpTroopLoss ?? "normal";
  const dragonUtopiaGuards: DragonUtopiaGuards = setupOptions.dragonUtopiaGuards ?? "by-difficulty";
  const playerConfigs = (options.players?.length ? options.players : DEFAULT_PLAYERS).slice(
    0,
    Math.min(scenario.maxPlayers, scenario.layout.starts.length)
  );
  const configuredControllers = options.controllers ?? (options.sessionMode === "single-player"
    ? Object.fromEntries(playerConfigs.map((config, index) => [
        config.id,
        index === 0 ? ({ kind: "human" } satisfies PlayerController) : standardComputerController()
      ]))
    : undefined);
  // Event deck (Fortress expansion) is an OPT-IN optional rule: OFF unless the
  // table explicitly turns it on, and even then "Event cards may be used in
  // multiplayer games only" — a solo table never gets the deck.
  const eventsOn = (setupOptions.events ?? false) && playerConfigs.length >= 2;
  // Parallel turns (optional, multiplayer only): the number of opening rounds
  // everyone plays simultaneously. A solo table always plays ordered.
  const parallelRounds = playerConfigs.length >= 2 ? normalizeParallelTurnRounds(setupOptions.parallelTurns) : 0;
  // PvP Neutral Control (optional, multiplayer only): the next live player
  // clockwise plays the Neutral units in every Neutral combat. A solo table
  // has no next player, so the flag never lands there and the AI plays on.
  const pvpNeutralControlOn = (setupOptions.pvpNeutralControl ?? false) && playerConfigs.length >= 2;
  const pvpNeutralControlMustAttackOn = setupOptions.pvpNeutralControlMustAttack ?? true;

  // Lobby Victory Points toggle: fold the game-options VP switch into the
  // EFFECTIVE map preset. `victoryPointsConfig`/`victoryPointsModeActive` read
  // `adventure.mapPreset.victoryPoints`, so injecting an `{ enabled: true }` block
  // here lights up the whole downstream VP system (ledger already tracked, the
  // round-limit scored end in `startAdventureRound`, the standings dock + the
  // game-over overlay) with no further wiring. A designed preset that ALREADY
  // enables VP stays authoritative (see `applyLobbyVictoryPoints`).
  // Lobby custom win conditions merge onto the effective preset AFTER the VP fold
  // (both edit `adventure.mapPreset`; the win-condition check reads it there).
  const mapPreset = applyLobbyCustomWinConditions(
    applyLobbyVictoryPoints(
      sanitizeCustomMapPreset(setupOptions.customMapPreset ?? null) ?? null,
      setupOptions
    ),
    setupOptions
  );

  const adventure: AdventureState = {
    difficulty,
    scenarioId: scenario.id,
    ...(mapPreset ? { mapPreset } : {}),
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
    dragonUtopiaGuards,
    spellBook: spellBookOn,
    moraleCards: moraleCardsOn,
    fieldOverrides: fieldOverridesOn,
    fieldOverridePlacement,
    tournamentMode: tournamentRulesAllOn(setupOptions),
    tournamentBanDiplomacy: tournamentRules.banDiplomacy,
    tournamentBanHourglass: tournamentRules.banHourglass,
    tournamentSecondPlayerMorale: tournamentRules.secondPlayerMorale,
    pvpNeutralControl: pvpNeutralControlOn,
    pvpNeutralControlMustAttack: pvpNeutralControlMustAttackOn,
    // OPTIONAL Undo mode (debug/testing): frozen here so the SERVER action
    // transaction (both backends) can read it and keep a bounded per-room undo
    // stack. Default OFF — no history kept and UNDO_MOVE rejected. Unlike the
    // multiplayer-only options above, undo is available in solo/single-player
    // too (it is a testing aid, not a competitive rule).
    ...(setupOptions.undoMoves ? { undoMoves: true } : {}),
    houseRules,
    chooseGatePlacement: chooseGatePlacementOn,
    ...(victoryMode === "grail" ? { grail: { status: "uncollected" as const } } : {}),
    // Grail Hunt and Dragon Hunt both track the "defeat every enemy hero" path.
    ...(victoryModeCountsHeroDefeats(victoryMode) ? { heroDefeats: {} } : {}),
    pendingTileChoice: null,
    astrologers: {
      activeCardId: null,
      nextResourceModifiers: { gold: 0, valuables: 0 },
      crazyWizardUsedBy: [],
      swiftWeaselUsedBy: [],
      heroEmpowerChosenRoundBy: {},
      heroEmpowerUsesBy: {}
    },
    // Event deck state (only meaningful while the "events" deck exists).
    ...(eventsOn
      ? {
          events: {
            activeCardId: null,
            nextDrawerIndex: 0,
            pool: [],
            poolCleanup: "shuffle-into-deck" as const,
            dicePool: [],
            auction: null,
            deal: null
          }
        }
      : {})
  };

  // Tile pools (face-down draws are secret until revealed). Default mixes
  // every published content set so no expansion tile is locked out of random
  // draws. Callers may still pass a narrower `tileContent` for tests.
  const tileContent = options.tileContent ?? DEFAULT_TILE_CONTENT;
  const nearPool = shuffleCards(tilePoolIds("near", tileContent), `${seed}#pool#near`);
  const centerPool = shuffleCards(tilePoolIds("center", tileContent), `${seed}#pool#center`);
  const farPool = shuffleCards(tilePoolIds("far", tileContent), `${seed}#pool#far`);
  // Sea / Subterranean also respect the active content filter (default = all).
  const seaPool = shuffleCards(tilePoolIds("sea", tileContent), `${seed}#pool#sea`);
  const subterraneanPool = shuffleCards(
    tilePoolIds("subterranean", tileContent),
    `${seed}#pool#subterranean`
  );

  const state: GameState = {
    id: "adventure-game",
    seed,
    mode: "adventure",
    ...(options.sessionMode ? { sessionMode: options.sessionMode } : {}),
    ...(configuredControllers ? { controllers: configuredControllers } : {}),
    ruleset,
    wog,
    anime,
    round: 1,
    phase: "player-turn",
    activePlayerId: playerConfigs[0].id,
    priorityPlayerId: null,
    turnOrder: playerConfigs.map((config) => config.id),
    players: Object.fromEntries([
      ...playerConfigs.map((config) => [
        config.id,
        makePlayer(config, seed, setupOptions, polishSpellBookOn)
      ] as const),
      [NEUTRAL_PLAYER_ID, makeNeutralSeatPlayer()] as const
    ]),
    map: { spaces: {} },
    adventure,
    setupLobby: null,
    towns: {},
    heroes: {},
    combat: null,
    decks: {
      ...makeSharedDecks(
        seed,
        houseRules["split-decks"],
        tournamentRules,
        polishSpellBookOn,
        animeModuleEnabled({ anime }, "xianxiaArtifacts"),
        wog.enabled && wog.artifacts,
        wog.enabled && wog.artifacts && wog.commanders
      ),
      ...makeNeutralDecks(seed, wog),
      [ASTROLOGERS_DECK_ID]: makeAstrologersDeck(seed, eventsOn),
      ...(moraleCardsOn ? makeMoraleDecks(seed) : {}),
      // The Event deck exists only when the optional rule is on AND the table
      // is multiplayer — its absence is the engine's off switch.
      ...(eventsOn ? { [EVENTS_DECK_ID]: makeEventsDeck(seed) } : {})
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
      mode: parallelRounds > 0 ? "parallel" : "ordered",
      simultaneousRoundLimit: parallelRounds,
      completedPlayerIds: [],
      observingPlayerId: playerConfigs[0].id
    }
  };

  // WOG Commanders module: each player starts with their faction's commander
  // (all six stats at grade 1, alive). Gated exactly like the neutral-creature
  // module — on the effective (legacy-force-off) wog options.
  if (wog.enabled && wog.commanders) {
    for (const config of playerConfigs) {
      const player = state.players[config.id];
      const commander = makeInitialCommanderState(config.factionId);
      if (player && commander) {
        player.commander = commander;
      }
    }
  }

  const customMap = setupOptions.customMap?.length
    ? validateCustomMapPlan(setupOptions.customMap, scenario).accepted
    : null;

  // Seat positions: the designer's own Ⅰ tiles in placement order when it
  // drew any, otherwise the scenario sheet's fixed seats. Each seat falls back
  // to the scenario seat if the design left it unplaced.
  const designerStartPlans = (customMap ?? []).filter((plan) => plan.group === "starting");
  const designerStartCenters = designerStartPlans.map((plan) => ({ row: plan.row, col: plan.col }));
  const startCenterFor = (index: number): HexCoord =>
    designerStartCenters[index] ?? scenario.layout.starts[index];

  // Starting tiles: position from the seat (designer or scenario), tile fixed
  // by the chosen faction — no rotation choice. Towns and main heroes go on
  // the tile's center field.
  playerConfigs.forEach((config, index) => {
    const startTileId = startingTileByFaction[config.factionId] ?? "S1";
    const center = startCenterFor(index);
    const startPlan = designerStartPlans[index];
    // A designer may FIX this seat's home-tile orientation. Honour plan.rotation
    // ONLY when it is locked — an unlocked starting plan (or a legacy map that
    // happened to store a rotation) keeps the classic rotation-0 + opening-ceremony
    // flow byte-identically.
    const orientationLocked = startPlan?.lockRotation === true;
    const startRotation = orientationLocked ? (((startPlan!.rotation ?? 0) % 6) + 6) % 6 : 0;
    const tile = instantiateTile(adventure, startTileId, center, startRotation, false);
    // A designer may draw yellow borders on a starting Town tile too.
    if (startPlan) {
      applyDesignedBorders(tile, startPlan);
    }
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
      // this player's first turn), left undefined = feature off for this game OR
      // this seat's orientation is map-LOCKED (already fixed, so it owes none even
      // when the ceremony is on — the prompt never opens and the chain skips it).
      if (rotateStartTilesOn && !orientationLocked) {
        state.players[config.id].startTileRotated = false;
      }
      // Announce a designer-fixed orientation at game start (whether or not the
      // ceremony is on) so the whole table sees the map forced this seat's home
      // tile. The feed line names the seat (see START_TILE_ORIENTATION_FIXED).
      if (orientationLocked) {
        appendEvent(state, {
          type: "START_TILE_ORIENTATION_FIXED",
          playerId: config.id,
          rotation: startRotation
        });
      }
    }
  });

  if (customMap) {
    // Map designer: hand-placed tiles instead of the scenario layout.
    // Face-up plans place their chosen tile revealed; face-down plans either
    // pin an exact `tileDefId`, filter by `secretFeature` (random matching
    // landmark from the pool), or draw fully at random ("down means random").
    // Starting (Ⅰ) tiles were already placed by faction in the seat loop above.
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

    // Designed tiles that pin a specific id (face-up OR exact secret face-down)
    // never also hide in a random / feature face-down pool draw.
    for (const plan of customMap) {
      if (plan.tileDefId) {
        for (const pool of Object.values(pools)) {
          const index = pool.indexOf(plan.tileDefId);
          if (index !== -1) {
            pool.splice(index, 1);
          }
        }
      }
    }

    // Center (VI–VII) tiles forced by the win condition (Holy Grail → up to 2
    // Grail dig sites; Dragon Hunt/Conqueror → a Dragon Utopia) apply to
    // unpinned face-down Center slots here too — a designer who already pinned
    // a specific Center tile or named a secretFeature keeps that choice.
    const unpinnedFaceDownCenterSlots = customMap.filter(
      (plan) =>
        plan.faceDown && plan.group === "center" && !plan.tileDefId && !plan.secretFeature
    ).length;
    const forcedCenters = forcedObjectiveCenterTiles(centerPool, unpinnedFaceDownCenterSlots, victoryMode);
    let forcedCenterIndex = 0;

    // Holy Grail: also force leftover Grail tiles (when fewer than 2 Center
    // slots took them) and enough Obelisks (designer presets count) onto
    // unpinned face-down Near/Far draws.
    const grailOverflow: string[] =
      victoryMode === "grail" ? takeRemainingGrailTiles(centerPool, 2 - forcedCenters.filter(Boolean).length) : [];
    // Count designer-guaranteed Obelisks; pull the shortfall from Near/Far pools.
    const obelisksStillNeeded =
      victoryMode === "grail" ? Math.max(0, 2 - countGuaranteedObelisks(customMap)) : 0;
    const forcedObelisks: string[] =
      obelisksStillNeeded > 0 ? takeObeliskTiles({ near: nearPool, far: farPool }, obelisksStillNeeded) : [];
    // Obelisks first so dig unlock is completable on tight layouts (e.g. skirmish
    // has only 2 Near slots); the second Grail fills any leftover Near/Far slots.
    const grailNearFarOverflow = [...forcedObelisks, ...grailOverflow];
    let grailNearFarIndex = 0;

    // Designed Monolith/Whirlpool Location Tokens + Field Overrides, applied
    // once every planned tile is down (whirlpool numbering spans all of them,
    // in plan order).
    const plannedTokens: { plan: (typeof customMap)[number]; tile: MapTileState }[] = [];
    const plannedFieldOverrides: { plan: (typeof customMap)[number]; tile: MapTileState }[] = [];

    for (const plan of customMap) {
      if (plan.group === "starting") {
        continue;
      }
      const center = { row: plan.row, col: plan.col };
      if (plan.faceDown) {
        let tileDefId: string | undefined;
        // Exact pin wins over a feature filter (legacy / advanced).
        if (plan.tileDefId && allTileDefinitions[plan.tileDefId]) {
          tileDefId = plan.tileDefId;
        } else if (plan.secretFeature && isSecretTileFeature(plan.secretFeature)) {
          // Feature secret: random remaining tile that has the landmark.
          // Prefer the slot's own pool; fall back to an unfiltered draw so a
          // starved pool never leaves an empty hole on the board — and note the
          // table so players know the designer guarantee soft-failed.
          const pool = pools[plan.group];
          if (pool) {
            tileDefId = popTileMatchingFeature(pool, plan.secretFeature, {
              group: plan.group,
              seaBand: plan.seaBand,
              subBand: plan.subBand
            });
          }
          if (!tileDefId) {
            if (plan.group === "sea") {
              tileDefId = popSeaTile(plan.seaBand);
            } else if (plan.group === "subterranean") {
              tileDefId = popSubTile(plan.subBand);
            } else {
              tileDefId = pools[plan.group]?.pop();
            }
            if (tileDefId) {
              appendEvent(state, {
                type: "MAP_SECRET_FEATURE_FALLBACK",
                feature: plan.secretFeature,
                group: plan.group,
                message: `Secret “${secretFeatureFullLabel(plan.secretFeature)}” could not be fulfilled on a ${plan.group} slot — no matching tile left in the pool. Drew a random tile instead.`
              });
            }
          }
        } else if (plan.group === "sea") {
          tileDefId = popSeaTile(plan.seaBand);
        } else if (plan.group === "subterranean") {
          tileDefId = popSubTile(plan.subBand);
        } else if (plan.group === "center") {
          // Holy Grail fills up to two unpinned face-down Center slots with
          // Grail dig sites; further Center slots stay a random draw.
          tileDefId = forcedCenters[forcedCenterIndex++] ?? centerPool.pop();
        } else if (
          (plan.group === "near" || plan.group === "far") &&
          grailNearFarIndex < grailNearFarOverflow.length
        ) {
          // Holy Grail overflow: second Grail and/or forced Obelisks land on
          // unpinned Near/Far slots before ordinary random draws.
          tileDefId = grailNearFarOverflow[grailNearFarIndex++];
        } else {
          tileDefId = pools[plan.group]?.pop();
        }
        if (tileDefId) {
          // Orientation rides along for both secret pins and random draws —
          // the tile is revealed at the slot's rotation.
          const tile = instantiateTile(adventure, tileDefId, center, plan.rotation ?? 0, true);
          applyDesignedBorders(tile, plan);
          applyDesignedUnderground(tile, plan);
          applyDesignedViiField(adventure, tile, plan);
          if (planTokens(plan).length > 0) {
            plannedTokens.push({ plan, tile });
          }
          if (planFieldOverrides(plan).length > 0) {
            plannedFieldOverrides.push({ plan, tile });
          }
        }
      } else if (plan.tileDefId) {
        const tile = instantiateTile(adventure, plan.tileDefId, center, plan.rotation ?? 0, false);
        applyDesignedBorders(tile, plan);
        applyDesignedUnderground(tile, plan);
        applyDesignedViiField(adventure, tile, plan);
        if (planTokens(plan).length > 0) {
          plannedTokens.push({ plan, tile });
        }
        if (planFieldOverrides(plan).length > 0) {
          plannedFieldOverrides.push({ plan, tile });
        }
      }
    }

    applyCustomMapTokens(adventure, plannedTokens);

    // GLOBAL Field Overrides (designer pins + pool on remaining face-down
    // Far/Near/Center). Anime only supplies object kinds — auto-enabled above
    // when pins need anime content. Feature off drops pins with a note.
    const fieldOverrideProblems = applyCustomMapFieldOverrides(adventure, plannedFieldOverrides, {
      enabled: fieldOverridesOn
    });
    for (const message of fieldOverrideProblems) {
      appendEvent(state, { type: "EVENT_NOTE", message });
    }
    if (fieldOverridesOn) {
      const overrideRng = createSeededRandom(`${seed}#field-overrides`);
      assignPoolFieldOverrides(state, () => overrideRng.next(), { enabled: true });
    }

    // Designer one-hex objects (Monolith/Whirlpool tokens on face-up slots +
    // colored Gate pairs + standalone hexes). Validated against the tile plans
    // (geometry/layer); the accepted set materializes here, BEFORE the
    // Subterranean Gate carve (which refuses a gate object's hex too). Standalone
    // hexes are new fields OFF every tile.
    if (mapPreset?.objects && mapPreset.objects.length > 0) {
      const { accepted } = validateCustomMapObjects(
        customMap,
        mapPreset.objects,
        scenario.layout.starts.map((start) => ({ ...start }))
      );
      applyCustomMapObjects(adventure, accepted);
    }

    // Designer Subterranean Gate links → seed the gate plans that the carve below
    // (recomputeSubterraneanGates) honours. Each cavern link resolves to the two
    // tile instance ids by their placed centres; a `designed` plan bypasses
    // one-gate-per-tile so a cavern linked to several Surface tiles hosts one gate
    // per link. Links to a tile that never instantiated (a starved pool) drop out.
    const tileIdByCenter = new Map<string, string>();
    for (const tile of Object.values(adventure.tiles)) {
      tileIdByCenter.set(`${tile.centerRow}:${tile.centerCol}`, tile.id);
    }
    const designedGatePlans: SubterraneanGatePlan[] = [];
    for (const plan of customMap) {
      // Seed gate plans from every UNDERGROUND-layer plan (printed cavern OR a
      // flagged far/near/center/sea tile) — the layer predicate, so a flagged
      // tile's designed links carve exactly like a cavern's.
      if (!planIsUnderground(plan) || !plan.gateLinks) {
        continue;
      }
      const cavernId = tileIdByCenter.get(`${plan.row}:${plan.col}`);
      if (!cavernId) {
        continue;
      }
      for (const link of plan.gateLinks) {
        const surfaceId = tileIdByCenter.get(`${link.surface.row}:${link.surface.col}`);
        if (!surfaceId || surfaceId === cavernId) {
          continue;
        }
        const gateGuard = sanitizeObjectGuard(link.gateGuard);
        const entranceGuard = sanitizeObjectGuard(link.entranceGuard);
        designedGatePlans.push({
          surfaceTileId: surfaceId,
          undergroundTileId: cavernId,
          designed: true,
          ...(link.gateHex ? { gateHex: link.gateHex } : {}),
          ...(link.entranceHex ? { entranceHex: link.entranceHex } : {}),
          ...(gateGuard ? { gateGuard } : {}),
          ...(entranceGuard ? { entranceGuard } : {})
        });
      }
    }
    if (designedGatePlans.length > 0) {
      adventure.gatePlans = [...(adventure.gatePlans ?? []), ...designedGatePlans];
    }
  } else {
    // Holy Grail: force leftover Grail tiles (2 dig sites total) and at least
    // 2 Obelisks onto Near/Far draws when the layout's Center slots alone cannot
    // host them.
    const forcedCenters = forcedObjectiveCenterTiles(centerPool, scenario.layout.center.length, victoryMode);
    const grailOverflow: string[] =
      victoryMode === "grail" ? takeRemainingGrailTiles(centerPool, 2 - forcedCenters.filter(Boolean).length) : [];
    const forcedObelisks: string[] =
      victoryMode === "grail" ? takeObeliskTiles({ near: nearPool, far: farPool }, 2) : [];
    // Obelisks first (dig unlock needs 2); second Grail uses leftover Near/Far slots.
    const grailNearFarOverflow = [...forcedObelisks, ...grailOverflow];
    let grailNearFarIndex = 0;

    // Face-down Far (II–III) tiles fixed in the layout (symmetric clash maps use
    // these as the outer ring between the starts and the Ⅳ–Ⅴ ring).
    for (const center of scenario.layout.far ?? []) {
      const tileDefId =
        grailNearFarIndex < grailNearFarOverflow.length
          ? grailNearFarOverflow[grailNearFarIndex++]
          : farPool.pop();
      if (tileDefId) {
        instantiateTile(adventure, tileDefId, center, 0, true);
      }
    }
    // Face-down Near (IV–V) and Center (VI–VII) tiles per the scenario layout.
    for (const center of scenario.layout.near) {
      const tileDefId =
        grailNearFarIndex < grailNearFarOverflow.length
          ? grailNearFarOverflow[grailNearFarIndex++]
          : nearPool.pop();
      if (tileDefId) {
        instantiateTile(adventure, tileDefId, center, 0, true);
      }
    }
    // Holy Grail / Dragon modes force their objective onto the VI–VII Center
    // tiles; any remaining Center tiles stay random.
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
    // Standard (non-designer) maps: still stamp pool overrides when the global
    // feature is on so every open of a Far/Near/Center tile can replace ≥1 hex.
    if (fieldOverridesOn) {
      const overrideRng = createSeededRandom(`${seed}#field-overrides`);
      assignPoolFieldOverrides(state, () => overrideRng.next(), { enabled: true });
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

  // Tournament rule (p.54): "The second player gains +1 positive morale at the
  // start of the game." Second = next seat after the starting player in the
  // (possibly reordered) turn order. Necropolis still ignores morale.
  if (tournamentRules.secondPlayerMorale) {
    const humanOrder = state.turnOrder.filter((playerId) => playerId !== NEUTRAL_PLAYER_ID);
    if (humanOrder.length >= 2) {
      changeMorale(state, humanOrder[1]!, 1);
    }
  }

  // Then everyone draws their starting hand (visible from the first moment),
  // and the active player's turn starts as usual.
  for (const config of playerConfigs) {
    drawCardsForPlayer(state, config.id, state.players[config.id].limits.hand);
  }

  // Setup step 17: each player takes the Scenario Difficulty starting bonus
  // (rulebook p.10). Queued before round/start-of-turn rewards so they resolve
  // first. Impossible has none. Artifacts go to hand, not the Starting Deck.
  // OFF by default and turned ON explicitly by the lobby build
  // (`buildAdventureFromLobby`), so every real game gets the bonus while the
  // thousands of direct `createAdventureGameState` test constructions keep their
  // established, bonus-free opening state (the prompt would otherwise sit on the
  // first player's turn-1 flow). The feature's own tests opt in with
  // `startingBonus: true`.
  const applyStartingBonus = options.startingBonus ?? false;
  const polishReducedStarting = Boolean(houseRules["polish-reduced-starting-bonus"]);
  const bonusSteps = applyStartingBonus
    ? startingBonusVisitSteps(difficulty, { polishReduced: polishReducedStarting })
    : null;
  if (bonusSteps) {
    for (const playerId of state.turnOrder) {
      if (playerId === NEUTRAL_PLAYER_ID || !state.players[playerId]) {
        continue;
      }
      adventure.rewardQueue.push({
        playerId,
        kind: "visit-steps",
        steps: bonusSteps.map((step) => structuredClone(step))
      });
    }
  }

  // Map designer starting bonuses (resources / morale / Search) — after the
  // difficulty bonus is queued so both appear in the opening reward stream.
  applyCustomMapStartingBonuses(state);
  if (mapPreset && customMapPresetIsActive(mapPreset) && mapPreset.notes) {
    appendEvent(state, {
      type: "MAP_PRESET_TRIGGERED",
      message: `Map note: ${mapPreset.notes}`
    });
  }
  // Victory Points scenario: announce the two end triggers + the goal up front.
  if (mapPreset?.victoryPoints?.enabled) {
    const roundLimit = mapPreset.roundLimit;
    appendEvent(state, {
      type: "MAP_PRESET_TRIGGERED",
      message: roundLimit
        ? `Victory Points scenario: the game ends at round ${roundLimit} or when a player completes the victory condition — the most Victory Points wins.`
        : "Victory Points scenario: the game ends when a player completes the victory condition — the most Victory Points wins."
    });
  }

  if (parallelRounds > 0) {
    appendEvent(state, { type: "PARALLEL_TURNS_STARTED", rounds: parallelRounds });
  }

  startAdventureRound(state);
  if (parallelRounds > 0) {
    // Parallel turns: EVERY player's turn starts at once, in seat order — the
    // shared reward queue then serves round-start effects and the start-of-turn
    // hand steps clockwise from the first seat.
    for (const playerId of state.turnOrder) {
      startPlayerTurn(state, playerId);
    }
  } else {
    startPlayerTurn(state, state.activePlayerId);
  }
  // Drain the opening round-start / start-of-turn rewards — chiefly the
  // start-of-turn hand snapshot — so the first player's hand step is live the
  // instant the game state is handed back, before any action is dispatched.
  // With a starting bonus the pump stops on the first player's choice instead.
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
    spellBookUsed: [],
    removed: [],
    army: [],
    startingArmy: [],
    resources: { ...options.startingResources },
    production: { ...options.startingProduction },
    townTokens: { build: true, population: true, spellBook: true },
    morale: 0,
    moraleCards: { positive: [], negative: [] },
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

  // Single-player controller invariant (plan §4.3): a resize NEVER mints a
  // human opponent. Every seat-count change routes through here — the
  // SET_COMPUTER_OPPONENTS action, SET_GAME_OPTIONS.playerCount AND a scenario
  // change's capacity clamp — so seat 0 stays the one human and every other
  // live seat is (re)stamped a standard computer, trimmed seats dropping out
  // of the controller map entirely.
  if (state.sessionMode === "single-player") {
    state.controllers = {};
    lobby.seats.forEach((seat, index) => {
      state.controllers![seat.playerId] = index === 0 ? { kind: "human" } : standardComputerController();
      if (index > 0) {
        seat.name = `Computer ${index}`;
        // A SURVIVING computer seat may carry a hand-picked faction+hero
        // (SET_COMPUTER_SEAT_FACTION); keep its display name in sync with the
        // pick rather than reverting to the bare "Computer N" label. Trimmed
        // seats have already been sliced out above (their picks go with them),
        // so a resize never leaves a stale pick behind.
        const faction = seat.factionId ? coreFactionDefinitions[seat.factionId] : null;
        const hero = seat.heroDefId ? coreHeroDefinitions[seat.heroDefId] : null;
        state.players[seat.playerId].name = faction && hero ? `${hero.name} of ${faction.name}` : seat.name;
      }
    });
  }
  return count;
}

export function setComputerOpponents(
  state: GameState,
  action: Extract<GameAction, { type: "SET_COMPUTER_OPPONENTS" }>
): void {
  const lobby = state.setupLobby;
  if (state.sessionMode !== "single-player" || !lobby || state.phase !== "setup" || lobby.startCheck) {
    throw new Error("Computer opponents can only be changed during single-player setup.");
  }
  const humans = lobby.seats.filter((seat) => controllerOf(state, seat.playerId).kind === "human");
  if (humans.length !== 1 || humans[0].playerId !== action.playerId || !Number.isFinite(action.count)) {
    throw new Error("Only the single-player human seat may change computer opponents.");
  }
  // resizeLobbySeats itself (re)stamps the single-player controller invariant
  // (seat 0 human, every other seat a named standard computer).
  const count = resizeLobbySeats(state, getScenario(lobby.options.scenarioId), 1 + Math.max(1, Math.floor(action.count)));
  if (lobby.draft?.seatRolls) {
    const live = new Set(lobby.seats.map((seat) => seat.playerId));
    lobby.draft.seatRolls = Object.fromEntries(Object.entries(lobby.draft.seatRolls).filter(([id]) => live.has(id)));
  }
  appendEvent(state, {
    type: "GAME_OPTIONS_CHANGED",
    playerId: action.playerId,
    message: `${state.players[action.playerId]?.name ?? action.playerId} set computer opponents ${count - 1}.`
  });
}

/** Opens a new room in the map-setup phase: seats wait for faction picks. */
export function createAdventureLobbyState(options: AdventureSetupOptions = {}): GameState {
  // Crypto entropy, not just Date.now() — two lobbies minted in the same
  // millisecond (or on a frozen-clock edge isolate) would otherwise share a seed
  // and, once started, build the identical map and bank order.
  const seed = options.seed ?? freshSeed("homm3bg-lobby");
  const scenario = getScenario(options.scenarioId);
  const setupOptions = defaultGameSetupOptions(scenario);
  if (options.ruleset) {
    setupOptions.ruleset = options.ruleset;
  }
  if (options.wog) {
    setupOptions.wog = {
      ...DEFAULT_WOG_OPTIONS,
      ...options.wog,
      ...(setupOptions.ruleset === "legacy" ? { enabled: false } : {})
    };
  }
  if (options.houseRules) {
    setupOptions.houseRules = options.houseRules;
  }
  if (options.spellBook !== undefined) {
    setupOptions.spellBook = options.spellBook;
  } else if (setupOptions.ruleset === "legacy") {
    // Soft Legacy default: Spell Book off unless the caller opted in.
    setupOptions.spellBook = false;
  }
  if (options.moraleCards !== undefined) {
    setupOptions.moraleCards = options.moraleCards;
  }
  if (options.tournamentMode !== undefined) {
    setupOptions.tournamentMode = options.tournamentMode;
  }
  if (options.tournamentBanDiplomacy !== undefined) {
    setupOptions.tournamentBanDiplomacy = options.tournamentBanDiplomacy;
  }
  if (options.tournamentBanHourglass !== undefined) {
    setupOptions.tournamentBanHourglass = options.tournamentBanHourglass;
  }
  if (options.tournamentSecondPlayerMorale !== undefined) {
    setupOptions.tournamentSecondPlayerMorale = options.tournamentSecondPlayerMorale;
  }
  if (options.pvpNeutralControl !== undefined) {
    setupOptions.pvpNeutralControl = options.pvpNeutralControl;
  }
  if (options.pvpNeutralControlMustAttack !== undefined) {
    setupOptions.pvpNeutralControlMustAttack = options.pvpNeutralControlMustAttack;
  }
  // Map-setup default: a fresh lobby opens with the three universal core town
  // cards (Citadel, Mage Guild, Bronze Dwelling) already pre-built, so every
  // faction starts the adventure with the standard opening buildings. Any seat
  // may toggle each off in the "Pre-built buildings" picker before starting.
  // A scenario that authors its own startingBuildings keeps them verbatim.
  if (scenario.startingBuildings.length === 0) {
    setupOptions.startingBuildings = [...DEFAULT_SETUP_STARTING_BUILDINGS];
  }
  const requestedSeats = options.sessionMode === "single-player"
    ? 1 + Math.max(1, Math.floor(options.computerOpponents ?? 1))
    : options.playerCount ?? setupOptions.playerCount;
  const seatCount = clampSeatCount(scenario, requestedSeats);
  setupOptions.playerCount = seatCount;

  const seats = Array.from({ length: seatCount }, (_, index) => ({
    playerId: `p${index + 1}`,
    name: options.sessionMode === "single-player" && index > 0
      ? `Computer ${index}`
      : LOBBY_SEAT_NAMES[index] ?? `Player ${index + 1}`,
    factionId: null,
    heroDefId: null
  }));
  const controllers = options.controllers ?? (options.sessionMode === "single-player"
    ? Object.fromEntries(seats.map((seat, index) => [
        seat.playerId,
        index === 0 ? ({ kind: "human" } satisfies PlayerController) : standardComputerController()
      ]))
    : undefined);

  const players = Object.fromEntries(
    seats.map((seat) => [seat.playerId, makeLobbySeatPlayer(seat.playerId, seat.name, setupOptions)] as const)
  );

  return {
    id: "adventure-lobby",
    seed,
    mode: "adventure",
    ...(options.sessionMode ? { sessionMode: options.sessionMode } : {}),
    ...(controllers ? { controllers } : {}),
    ruleset: setupOptions.ruleset,
    wog: setupOptions.wog,
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
    if (next.ruleset === "legacy") {
      lobby.options.wog = { ...DEFAULT_WOG_OPTIONS, ...lobby.options.wog, enabled: false };
      state.wog = lobby.options.wog;
      lobby.options.anime = { ...resolveAnimeOptions(lobby.options.anime), enabled: false };
      state.anime = lobby.options.anime;
    }
    // Soft preset: switching mode clears individual house-rule overrides so
    // every toggle reverts to the new mode's default (all ON in BINH, OFF in
    // Legacy). Players may then re-flip any rule — Legacy does NOT lock them.
    if (next.houseRules === undefined) {
      lobby.options.houseRules = undefined;
    }
    // Spell Book follows the mode default unless this same action overrides it.
    if (next.spellBook === undefined) {
      lobby.options.spellBook = next.ruleset === "binh";
    }
    changes.push(`game mode ${next.ruleset === "binh" ? "House rules BINH" : "Legacy (rulebook)"}`);
  }

  if (next.wog !== undefined) {
    const wog: WogModOptions = {
      ...DEFAULT_WOG_OPTIONS,
      ...lobby.options.wog,
      enabled: Boolean(next.wog.enabled),
      commanders: Boolean(next.wog.commanders),
      newObjects: Boolean(next.wog.newObjects),
      newCreatures: Boolean(next.wog.newCreatures),
      artifacts: Boolean(next.wog.artifacts)
    };
    // WOG is a BINH-family module. Enabling it while still on Legacy flips the
    // table to BINH so the module can actually load.
    if (wog.enabled && lobby.options.ruleset !== "binh") {
      lobby.options.ruleset = "binh";
      state.ruleset = "binh";
      if (next.houseRules === undefined && next.ruleset === undefined) {
        lobby.options.houseRules = undefined;
      }
      if (next.spellBook === undefined) {
        lobby.options.spellBook = true;
      }
      changes.push("game mode House rules BINH (for WOG)");
    }
    lobby.options.wog = wog;
    state.wog = wog;
    changes.push(`WOG ${wog.enabled ? "on" : "off"}`);
  }

  if (next.anime !== undefined) {
    const anime: AnimeModOptions = resolveAnimeOptions({
      ...lobby.options.anime,
      ...next.anime,
      enabled: Boolean(next.anime.enabled)
    });
    // Anime is a BINH-family module — enabling it under Legacy flips to BINH
    // (WOG precedent).
    if (anime.enabled && lobby.options.ruleset !== "binh") {
      lobby.options.ruleset = "binh";
      state.ruleset = "binh";
      if (next.houseRules === undefined && next.ruleset === undefined) {
        lobby.options.houseRules = undefined;
      }
      if (next.spellBook === undefined) {
        lobby.options.spellBook = true;
      }
      changes.push("game mode House rules BINH (for Anime mod)");
    }
    lobby.options.anime = anime;
    state.anime = anime;
    changes.push(`Anime mod ${anime.enabled ? "on" : "off"}`);
  }

  if (next.fieldOverrides !== undefined || next.fieldOverridePlacement !== undefined) {
    if (next.fieldOverrides !== undefined) {
      lobby.options.fieldOverrides = Boolean(next.fieldOverrides);
    }
    if (next.fieldOverridePlacement !== undefined) {
      const mode = next.fieldOverridePlacement;
      if (mode !== "random" && mode !== "manual" && mode !== "manual-or-refuse") {
        throw new Error("Unknown Field Override placement mode.");
      }
      lobby.options.fieldOverridePlacement = mode;
    }
    // Auto-enable when the designed map already has pins.
    if (customMapHasFieldOverridePins(lobby.options.customMap)) {
      lobby.options.fieldOverrides = true;
    }
    // Anime-package pins auto-enable the Anime mod crest (content only) — with
    // the map-objects module on so the pinned content is legal in the pool.
    if (customMapHasAnimeFieldOverridePins(lobby.options.customMap)) {
      lobby.options.anime = { ...resolveAnimeOptions(lobby.options.anime), enabled: true, mapObjects: true };
      state.anime = lobby.options.anime;
      if (lobby.options.ruleset !== "binh") {
        lobby.options.ruleset = "binh";
        state.ruleset = "binh";
      }
    }
    // Wog-package pins auto-enable the Wake of Gods newObjects module (content).
    if (customMapHasWogFieldOverridePins(lobby.options.customMap)) {
      lobby.options.wog = {
        ...DEFAULT_WOG_OPTIONS,
        ...lobby.options.wog,
        enabled: true,
        newObjects: true
      };
      state.wog = lobby.options.wog;
      if (lobby.options.ruleset !== "binh") {
        lobby.options.ruleset = "binh";
        state.ruleset = "binh";
      }
    }
    changes.push(
      `Field Overrides ${lobby.options.fieldOverrides ? "on" : "off"} (${lobby.options.fieldOverridePlacement ?? "manual-or-refuse"})`
    );
  }

  // Force-ON chokepoint: a map-objects module (WOG New Objects / Anime map
  // objects) REQUIRES the global Field Override mechanism to place its content,
  // so whenever such a module is active in the RESOLVED lobby options
  // `fieldOverrides` must be ON — no matter what this payload asked for (a
  // multiplayer client cannot land with map objects ticked but FO off). This
  // runs on EVERY SET_GAME_OPTIONS (guarded by the `!== true` check), so it
  // also catches a payload that only ticks the module and never mentions FO.
  // Force-ON only: unticking the module never forces FO back off (the table may
  // keep FO for other content), and an explicit `fieldOverrides: false` in the
  // same payload as an active module loses to this force.
  if (mapObjectsModuleActive(lobby.options) && lobby.options.fieldOverrides !== true) {
    lobby.options.fieldOverrides = true;
    changes.push("Field Overrides on (required by map objects)");
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

  if (next.dragonUtopiaGuards !== undefined) {
    if (next.dragonUtopiaGuards !== "four" && next.dragonUtopiaGuards !== "by-difficulty") {
      throw new Error("Unknown Dragon Utopia guards option.");
    }
    lobby.options.dragonUtopiaGuards = next.dragonUtopiaGuards;
    changes.push(
      `Dragon Utopia guards ${next.dragonUtopiaGuards === "four" ? "four dragons" : "scale by difficulty"}`
    );
  }

  if (next.spellBook !== undefined) {
    // Soft Legacy: Spell Book may be re-enabled after the Legacy preset.
    lobby.options.spellBook = Boolean(next.spellBook);
    changes.push(`Spell Book ${lobby.options.spellBook ? "on" : "off"}`);
  }

  if (next.moraleCards !== undefined) {
    lobby.options.moraleCards = Boolean(next.moraleCards);
    changes.push(`Morale Cards ${next.moraleCards ? "on" : "off"}`);
  }

  if (next.tournamentMode !== undefined) {
    const on = Boolean(next.tournamentMode);
    lobby.options.tournamentMode = on;
    // Convenience master: turning Tournament Mode on/off sets every granular
    // rule in lockstep (unless this same action also supplies an explicit flag).
    if (next.tournamentBanDiplomacy === undefined) {
      lobby.options.tournamentBanDiplomacy = on;
    }
    if (next.tournamentBanHourglass === undefined) {
      lobby.options.tournamentBanHourglass = on;
    }
    if (next.tournamentSecondPlayerMorale === undefined) {
      lobby.options.tournamentSecondPlayerMorale = on;
    }
    changes.push(
      on
        ? "Tournament Mode on (remove Diplomacy + Hourglass; second player +1 morale)"
        : "Tournament Mode off"
    );
  }

  if (next.tournamentBanDiplomacy !== undefined) {
    lobby.options.tournamentBanDiplomacy = Boolean(next.tournamentBanDiplomacy);
    changes.push(`Ban Diplomacy ${lobby.options.tournamentBanDiplomacy ? "on" : "off"}`);
  }
  if (next.tournamentBanHourglass !== undefined) {
    lobby.options.tournamentBanHourglass = Boolean(next.tournamentBanHourglass);
    changes.push(`Ban Hourglass ${lobby.options.tournamentBanHourglass ? "on" : "off"}`);
  }
  if (next.tournamentSecondPlayerMorale !== undefined) {
    lobby.options.tournamentSecondPlayerMorale = Boolean(next.tournamentSecondPlayerMorale);
    changes.push(
      `Tournament second-player morale ${lobby.options.tournamentSecondPlayerMorale ? "on" : "off"}`
    );
  }
  // Keep the master flag in sync with the three granular rules for old readers.
  if (
    next.tournamentMode !== undefined ||
    next.tournamentBanDiplomacy !== undefined ||
    next.tournamentBanHourglass !== undefined ||
    next.tournamentSecondPlayerMorale !== undefined
  ) {
    lobby.options.tournamentMode = tournamentRulesAllOn(lobby.options);
  }

  if (next.pvpNeutralControl !== undefined) {
    lobby.options.pvpNeutralControl = Boolean(next.pvpNeutralControl);
    changes.push(`PvP Neutral Control ${next.pvpNeutralControl ? "on (multiplayer only)" : "off"}`);
  }

  if (next.pvpNeutralControlMustAttack !== undefined) {
    lobby.options.pvpNeutralControlMustAttack = Boolean(next.pvpNeutralControlMustAttack);
    changes.push(
      next.pvpNeutralControlMustAttack
        ? "Neutral Control: guards must attack when they can"
        : "Neutral Control: guards play with no constraint"
    );
  }

  if (next.houseRules !== undefined) {
    for (const id of Object.keys(next.houseRules)) {
      if (!HOUSE_RULE_BY_ID[id as HouseRuleId]) {
        throw new Error(`Unknown house rule "${id}".`);
      }
    }
    // Soft Legacy: individual overrides are allowed in every mode. A crafted
    // or multiplayer click after a Legacy preset can re-enable any rule.
    const merged: Partial<Record<HouseRuleId, boolean>> = { ...lobby.options.houseRules };
    for (const [id, value] of Object.entries(next.houseRules)) {
      const def = HOUSE_RULE_BY_ID[id as HouseRuleId];
      merged[id as HouseRuleId] = Boolean(value);
      changes.push(`${def.label} ${value ? "on" : "off"}`);
    }
    lobby.options.houseRules = merged;
  }

  if (next.events !== undefined) {
    lobby.options.events = Boolean(next.events);
    changes.push(`Event deck ${next.events ? "on" : "off"}`);
  }

  if (next.victoryPoints !== undefined) {
    lobby.options.victoryPoints = Boolean(next.victoryPoints);
    changes.push(`Victory points ${lobby.options.victoryPoints ? "on" : "off"}`);
  }

  if (next.victoryPointsRoundLimit !== undefined) {
    if (!Number.isFinite(next.victoryPointsRoundLimit)) {
      throw new Error("Victory points round limit must be a number.");
    }
    // Mirror the designed-preset round-limit bounds (map-preset.ts: 1–30; 0 clears).
    const limit = Math.max(0, Math.min(30, Math.floor(next.victoryPointsRoundLimit)));
    if (limit > 0) {
      lobby.options.victoryPointsRoundLimit = limit;
      changes.push(`Victory points round limit ${limit}`);
    } else {
      delete lobby.options.victoryPointsRoundLimit;
      changes.push("Victory points round limit cleared");
    }
  }

  if (next.customWinConditions !== undefined) {
    // Sanitise the incoming list (untrusted): bad kinds dropped, params clamped,
    // capped. These are the host-ADDED conditions; the map's own list is merged
    // in preset-first at build (applyLobbyCustomWinConditions).
    const conditions = sanitizeCustomWinConditions(next.customWinConditions);
    if (conditions.length > 0) {
      lobby.options.customWinConditions = conditions;
      changes.push(`Custom win conditions: ${conditions.map(describeCustomWinCondition).join(", ")}`);
    } else {
      delete lobby.options.customWinConditions;
      changes.push("Custom win conditions cleared");
    }
  }

  if (next.parallelTurns !== undefined) {
    const rounds = normalizeParallelTurnRounds(next.parallelTurns);
    lobby.options.parallelTurns = rounds;
    changes.push(
      rounds > 0
        ? `parallel turns for the first ${rounds} round${rounds === 1 ? "" : "s"} (multiplayer only)`
        : "parallel turns off"
    );
  }

  if (next.undoMoves !== undefined) {
    lobby.options.undoMoves = Boolean(next.undoMoves);
    changes.push(`Undo moves (testing) ${lobby.options.undoMoves ? "on" : "off"}`);
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
    const scenarioChanged = lobby.options.scenarioId !== next.scenarioId;
    lobby.scenarioId = next.scenarioId;
    lobby.options.scenarioId = next.scenarioId;
    changes.push(`scenario ${scenarioDefinitions[next.scenarioId].name}`);
    // The unified Map picker sends a designed map together with its scenarioId,
    // so a BARE scenario switch (no customMap in the same action) means the
    // player picked a built-in scenario sheet — drop any designed map still
    // loaded. A designed map is validated against the scenario it was built on
    // (seat anchors, tile overlap); leaving a stale one attached to a different
    // scenario is the "strange interaction" the merge removes.
    if (scenarioChanged && next.customMap === undefined && lobby.options.customMap) {
      const previousPreset = lobby.options.customMapPreset ?? null;
      lobby.options.customMap = null;
      lobby.options.customMapName = null;
      lobby.options.customMapPreset = null;
      changes.push("map back to the scenario layout");
      // The dropped map's conditions must not leak into the scenario game.
      const reverted = revertCustomMapPresetOptions(
        lobby.options,
        previousPreset,
        null,
        defaultGameSetupOptions(scenarioDefinitions[next.scenarioId])
      );
      if (reverted.length > 0) {
        changes.push(`map conditions removed: ${reverted.join(", ")}`);
      }
    }
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
    // Conditions the OUTGOING map forced are restored to scenario defaults
    // when the map (or its preset) goes away — one map's resources/army/victory
    // must never leak into the next game.
    const previousPreset = lobby.options.customMapPreset ?? null;
    if (next.customMap === null) {
      lobby.options.customMap = null;
      lobby.options.customMapName = null;
      lobby.options.customMapPreset = null;
      const reverted = revertCustomMapPresetOptions(
        lobby.options,
        previousPreset,
        null,
        defaultGameSetupOptions(getScenario(lobby.options.scenarioId))
      );
      changes.push("map back to the scenario layout");
      if (reverted.length > 0) {
        changes.push(`map conditions removed: ${reverted.join(", ")}`);
      }
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
      // Field Override pins (NOT Monolith/Whirlpool/Gate/Subterranean Gate —
      // those are basic teleports) auto-tick the GLOBAL Field Override feature
      // when this map is picked. Anime-package pins also light the Anime crest
      // so their content objects are legal in the pool.
      if (customMapHasFieldOverridePins(accepted)) {
        lobby.options.fieldOverrides = true;
        if (!lobby.options.fieldOverridePlacement) {
          lobby.options.fieldOverridePlacement = "manual-or-refuse";
        }
        changes.push("Field Overrides on (map has single-hex override objects)");
      }
      if (customMapHasAnimeFieldOverridePins(accepted)) {
        lobby.options.anime = { ...resolveAnimeOptions(lobby.options.anime), enabled: true, mapObjects: true };
        state.anime = lobby.options.anime;
        if (lobby.options.ruleset !== "binh") {
          lobby.options.ruleset = "binh";
          state.ruleset = "binh";
          changes.push("game mode House rules BINH (Anime override objects on map)");
        }
        changes.push("Anime mod on (map has Anime Field Override objects)");
      }
      if (customMapHasWogFieldOverridePins(accepted)) {
        lobby.options.wog = {
          ...DEFAULT_WOG_OPTIONS,
          ...lobby.options.wog,
          enabled: true,
          newObjects: true
        };
        state.wog = lobby.options.wog;
        if (lobby.options.ruleset !== "binh") {
          lobby.options.ruleset = "binh";
          state.ruleset = "binh";
          changes.push("game mode House rules BINH (WOG override objects on map)");
        }
        changes.push("WOG New Objects on (map has Wake of Gods Field Override objects)");
      }
      // Apply map-only conditions (resources, army, buildings, victory) when the
      // client sends a preset alongside the tile plan — restoring first anything
      // the outgoing map's preset had forced that the new one does not.
      if (next.customMapPreset !== undefined) {
        const preset = sanitizeCustomMapPreset(next.customMapPreset);
        lobby.options.customMapPreset = preset ?? null;
        const reverted = revertCustomMapPresetOptions(
          lobby.options,
          previousPreset,
          preset ?? null,
          defaultGameSetupOptions(scenario)
        );
        if (reverted.length > 0) {
          changes.push(`map conditions removed: ${reverted.join(", ")}`);
        }
        if (preset) {
          const presetChanges = applyCustomMapPresetToOptions(lobby.options, preset);
          if (presetChanges.length > 0) {
            changes.push(`map conditions: ${presetChanges.join(", ")}`);
          }
          if (preset.notes) {
            changes.push(`map note: ${preset.notes}`);
          }
        }
      }
    }
  } else if (next.customMapPreset !== undefined && lobby.options.customMap) {
    // Preset-only update while a designed map stays selected.
    const previousPreset = lobby.options.customMapPreset ?? null;
    const preset = sanitizeCustomMapPreset(next.customMapPreset);
    lobby.options.customMapPreset = preset ?? null;
    const reverted = revertCustomMapPresetOptions(
      lobby.options,
      previousPreset,
      preset ?? null,
      defaultGameSetupOptions(getScenario(lobby.options.scenarioId))
    );
    if (reverted.length > 0) {
      changes.push(`map conditions removed: ${reverted.join(", ")}`);
    }
    if (preset) {
      const presetChanges = applyCustomMapPresetToOptions(lobby.options, preset);
      changes.push(
        presetChanges.length > 0
          ? `map conditions: ${presetChanges.join(", ")}`
          : "map conditions updated"
      );
    } else {
      changes.push("map conditions cleared");
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
  if (!isPlayableFaction(action.factionId)) {
    throw new Error("That faction is not playable yet.");
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
  // No-op when the format is unchanged, so an accidental click on the already-
  // selected format can never wipe a table's picks mid-draft. To deliberately
  // restart, switch to another format and back (or use the per-seat reset).
  if (draft.format === action.format) {
    return;
  }

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

  const replacingShownRoll = Boolean(draft.seatRolls?.[action.playerId]?.townOptions?.length);
  const taken = reservedTownIdsForOtherSeats(lobby, action.playerId);
  const candidates = (Object.values(coreFactionDefinitions) as { id: FactionId }[])
    .map((faction) => faction.id)
    .filter((id) => !taken.has(id) && isPlayableFaction(id));
  if (candidates.length === 0) {
    throw new Error("No town is available to roll.");
  }

  const random = createSeededRandom(`${state.seed}#town-options#${action.playerId}#${eventSeedNumber(state)}`);
  const options = pickDistinct(random, candidates, 2);
  draft.seatRolls[action.playerId] = { townOptions: options };

  if (replacingShownRoll) {
    appendSetupTakeBackWarning(state, action.playerId, "roll", "re-rolled their towns after seeing them");
  }

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
  if (!isPlayableFaction(action.factionId)) {
    throw new Error("That faction is not playable yet.");
  }
  const taken = reservedTownIdsForOtherSeats(lobby, action.playerId).has(action.factionId);
  if (taken) {
    throw new Error("Another player already picked or rolled that town.");
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

  const replacingShownRoll = Boolean(draft.seatRolls?.[action.playerId]?.heroOptions?.length);
  const random = createSeededRandom(`${state.seed}#hero-options#${action.playerId}#${eventSeedNumber(state)}`);
  const options = pickDistinct(random, pool, 2);
  draft.seatRolls[action.playerId] = { ...draft.seatRolls[action.playerId], heroOptions: options };

  if (replacingShownRoll) {
    appendSetupTakeBackWarning(state, action.playerId, "roll", "re-rolled their heroes after seeing them");
  }

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

  // Classify the take-back BEFORE clearing, so the table sees exactly what was
  // thrown away: a locked hero pick, a rolled-and-locked town, or a pending roll.
  const rolls = draft.seatRolls?.[action.playerId];
  const hadRoll = Boolean(rolls?.townOptions?.length || rolls?.heroOptions?.length);
  const scope: "pick" | "town" | "roll" =
    seat.factionId && seat.heroDefId ? "pick" : seat.factionId ? "town" : hadRoll ? "roll" : "pick";

  seat.factionId = null;
  seat.heroDefId = null;
  clearSeatRolls(draft, action.playerId);
  const player = state.players[action.playerId];
  if (player) {
    player.name = seat.name;
  }

  const verb =
    scope === "pick"
      ? "took back their locked hero pick"
      : scope === "town"
        ? "took back their rolled town"
        : "cleared their roll";
  appendSetupTakeBackWarning(state, action.playerId, scope, verb);
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
      .filter((id) => !takenFactions.has(id) && isPlayableFaction(id) && selectableHeroes(id).length > 0);
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

/**
 * Single-player map-setup: the human owner sets/rolls/clears a COMPUTER seat's
 * faction + main hero, so the opponents can be hand-picked instead of every one
 * being left on "auto". Self-validating (a HANDLER_VALIDATED action): the game
 * must be single-player, the format "open", the issuer the ONE human owner seat,
 * and the target a computer seat. A set/roll writes the SAME fields chooseFaction
 * does — so the lobby shows it at once and the AI setup pump (which skips a seat
 * that already has a faction+hero) never re-picks it — while a clear returns the
 * seat to undefined, so the computer chooses a town at game start as before. It
 * never reassigns a seat (no ASSIGN_SEAT-style takeover), preserving the
 * one-human single-player invariant.
 */
export function setComputerSeatFaction(
  state: GameState,
  action: Extract<GameAction, { type: "SET_COMPUTER_SEAT_FACTION" }>
): void {
  const lobby = state.setupLobby;
  if (!lobby || state.phase !== "setup") {
    throw new Error("Computer seats can only be set during map setup.");
  }
  if (state.sessionMode !== "single-player") {
    throw new Error("A computer's faction can only be set in a single-player game.");
  }
  if (lobby.startCheck) {
    throw new Error("The setup is locked while the start check is open.");
  }
  if (lobbyDraft(lobby).format !== "open") {
    throw new Error("A computer's town and hero can only be hand-picked in the Free pick format.");
  }

  // Issuer must be the ONE human owner seat (never a seat takeover — this only
  // writes the faction/hero fields of a computer seat).
  const humans = lobby.seats.filter((candidate) => controllerOf(state, candidate.playerId).kind === "human");
  if (humans.length !== 1 || humans[0].playerId !== action.playerId) {
    throw new Error("Only the single-player human seat may pick a computer's faction.");
  }

  const seat = lobby.seats.find((candidate) => candidate.playerId === action.seatPlayerId);
  if (!seat) {
    throw new Error("That seat does not exist in this scenario.");
  }
  if (controllerOf(state, action.seatPlayerId).kind !== "computer") {
    throw new Error("Only a computer opponent's faction can be picked this way.");
  }

  if (action.choice === "clear") {
    if (!seat.factionId && !seat.heroDefId) {
      return; // Already on auto — nothing to clear.
    }
    seat.factionId = null;
    seat.heroDefId = null;
    const clearedPlayer = state.players[action.seatPlayerId];
    if (clearedPlayer) {
      clearedPlayer.name = seat.name;
    }
    appendEvent(state, {
      type: "GAME_OPTIONS_CHANGED",
      playerId: action.playerId,
      message: `${state.players[action.playerId]?.name ?? action.playerId} set ${seat.name} back to auto (picks a town at game start).`
    });
    return;
  }

  const takenFactions = new Set(
    lobby.seats
      .filter((candidate) => candidate.playerId !== action.seatPlayerId)
      .map((candidate) => candidate.factionId)
      .filter((id): id is FactionId => Boolean(id))
  );

  let factionId: FactionId;
  let heroDefId: string;
  if (action.choice === "roll") {
    // Seed with the event counter so two consecutive rolls differ and every
    // client computing the same action lands on the same pick (mirrors
    // randomAssignSeat's convention).
    const random = createSeededRandom(`${state.seed}#computer-seat#${action.seatPlayerId}#${eventSeedNumber(state)}`);
    const candidateFactions = (Object.values(coreFactionDefinitions) as { id: FactionId }[])
      .map((faction) => faction.id)
      .filter((id) => !takenFactions.has(id) && isPlayableFaction(id) && coreFactionDefinitions[id].heroes.length > 0);
    if (candidateFactions.length === 0) {
      throw new Error("No town is available to roll for this computer.");
    }
    factionId = random.pick(candidateFactions);
    const heroPool = [...coreFactionDefinitions[factionId].heroes];
    // Re-rolling the same town avoids the current hero when another is available,
    // so a re-roll visibly changes the pick.
    const choices = heroPool.length > 1 ? heroPool.filter((id) => id !== seat.heroDefId) : heroPool;
    heroDefId = random.pick(choices.length > 0 ? choices : heroPool);
  } else {
    factionId = action.choice.factionId;
    heroDefId = action.choice.heroDefId;
    const faction = coreFactionDefinitions[factionId];
    if (!faction) {
      throw new Error("Unknown faction.");
    }
    if (!isPlayableFaction(factionId)) {
      throw new Error("That faction is not playable yet.");
    }
    if (!faction.heroes.includes(heroDefId)) {
      throw new Error("That hero does not lead this faction.");
    }
    if (takenFactions.has(factionId)) {
      throw new Error("Another seat already picked that faction.");
    }
  }

  seat.factionId = factionId;
  seat.heroDefId = heroDefId;
  const faction = coreFactionDefinitions[factionId];
  const hero = coreHeroDefinitions[heroDefId];
  const player = state.players[action.seatPlayerId];
  if (player && hero && faction) {
    player.name = `${hero.name} of ${faction.name}`;
  }

  appendEvent(state, {
    type: "FACTION_CHOSEN",
    playerId: action.seatPlayerId,
    factionId,
    heroDefId
  });
}

/**
 * How long (ms) every seated player has to confirm the pre-start ready check
 * before it auto-aborts back to setup. "AFK for 30 seconds → go back."
 */
export const START_CHECK_MS = 30_000;

function seatName(state: GameState, playerId: PlayerId): string {
  return state.players[playerId]?.name ?? playerId;
}

/**
 * The seats whose confirmation the ready check waits on: on a HOSTED table, the
 * seats currently held by a member (one distinct human each). Empty on an open
 * table / solo game, where the pre-start check is not enforced (an open table
 * has no per-seat identity — one browser can act as every seat — so requiring
 * "all confirm" there would be meaningless).
 */
export function readyCheckConfirmers(state: GameState): PlayerId[] {
  const room = state.room;
  if (!room?.hosted) {
    return [];
  }
  const lobbySeatIds = new Set((state.setupLobby?.seats ?? []).map((seat) => seat.playerId));
  const confirmers = new Set<PlayerId>();
  for (const member of room.members) {
    if (member.seat !== "observer" && lobbySeatIds.has(member.seat)) {
      confirmers.add(member.seat);
    }
  }
  return [...confirmers];
}

/**
 * Whether pressing Start must open the ready check rather than build the map
 * immediately: a multiplayer HOSTED table with 2+ seated players. Solo, open
 * tables and engine tests (no room) start immediately, exactly as before.
 */
export function readyCheckRequired(state: GameState): boolean {
  if ((state.setupLobby?.seats.length ?? 0) < 2) {
    return false;
  }
  return readyCheckConfirmers(state).length >= 2;
}

/** Clears the open ready check and logs why (a player cancelled, or it timed out). */
function abortStartCheck(
  state: GameState,
  reason: "cancel" | "timeout",
  byPlayerId: PlayerId,
  check: StartCheckState
): void {
  const lobby = state.setupLobby;
  if (lobby) {
    lobby.startCheck = null;
  }
  let message: string;
  if (reason === "timeout") {
    const missing = readyCheckConfirmers(state).filter((seat) => !check.confirmations.includes(seat));
    message =
      missing.length > 0
        ? `${missing.map((seat) => seatName(state, seat)).join(", ")} didn't confirm in time — back to setup.`
        : "The start timed out — back to setup.";
  } else {
    message = `${seatName(state, byPlayerId)} cancelled the start — back to setup.`;
  }
  appendEvent(state, { type: "START_CHECK_CANCELLED", reason, byPlayerId, message });
}

/** Builds the map the instant every seated player has confirmed the ready check. */
function maybeCompleteStartCheck(state: GameState): void {
  const lobby = state.setupLobby;
  const check = lobby?.startCheck;
  if (!lobby || !check) {
    return;
  }
  const confirmers = readyCheckConfirmers(state);
  if (confirmers.length === 0 || !confirmers.every((seat) => check.confirmations.includes(seat))) {
    return;
  }
  lobby.startCheck = null;
  buildAdventureFromLobby(state);
}

/**
 * START_ADVENTURE. Solo / open tables build the map immediately (unchanged). A
 * multiplayer hosted table instead opens (or, if already open, re-confirms the
 * presser for) the pre-start ready check; the map builds only once everyone has
 * confirmed via CONFIRM_START_ADVENTURE.
 */
export function startAdventureFromLobby(
  state: GameState,
  action: Extract<GameAction, { type: "START_ADVENTURE" }>,
  now?: number
): void {
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

  // A designed map whose tile layout makes the chosen win condition's objective
  // IMPOSSIBLE (no Grail dig capacity / no Dragon Utopia) is BLOCKED here with a
  // clear message rather than silently building an unwinnable game. Compatible
  // designs (and every scenario-driven map) pass straight through. The designer
  // + lobby show the same warnings live, so this is never a surprise at start.
  if (lobby.options.customMap && lobby.options.customMap.length > 0) {
    const scenario = getScenario(lobby.options.scenarioId);
    const acceptedPlan = validateCustomMapPlan(lobby.options.customMap, scenario).accepted;
    const conflicts = victoryDesignConflicts(acceptedPlan, lobby.options.victoryMode);
    if (conflicts.length > 0) {
      throw new Error(conflicts[0]);
    }
  }

  // An already-open check whose window has elapsed aborts here rather than
  // building — a Start pressed after the deadline can never sneak past.
  if (lobby.startCheck && now !== undefined && now >= lobby.startCheck.deadline) {
    abortStartCheck(state, "timeout", action.playerId, lobby.startCheck);
    return;
  }

  if (!readyCheckRequired(state)) {
    buildAdventureFromLobby(state);
    return;
  }

  // Multiplayer hosted table: the presser must be one of the seated players.
  const confirmers = readyCheckConfirmers(state);
  if (!confirmers.includes(action.playerId)) {
    throw new Error("Only a seated player may start the adventure.");
  }

  if (!lobby.startCheck) {
    const startedAt = now ?? 0;
    lobby.startCheck = {
      startedByPlayerId: action.playerId,
      startedAt,
      deadline: startedAt + START_CHECK_MS,
      confirmations: [action.playerId]
    };
    appendEvent(state, {
      type: "START_CHECK_STARTED",
      byPlayerId: action.playerId,
      message: `${seatName(state, action.playerId)} wants to start — every player must confirm within 30 seconds.`
    });
  } else if (!lobby.startCheck.confirmations.includes(action.playerId)) {
    lobby.startCheck.confirmations.push(action.playerId);
    appendEvent(state, {
      type: "START_CHECK_CONFIRMED",
      playerId: action.playerId,
      confirmed: lobby.startCheck.confirmations.length,
      needed: confirmers.length
    });
  }
  maybeCompleteStartCheck(state);
}

/** CONFIRM_START_ADVENTURE: one seated player confirms the open ready check. */
export function confirmStartAdventure(
  state: GameState,
  action: Extract<GameAction, { type: "CONFIRM_START_ADVENTURE" }>,
  now?: number
): void {
  const lobby = state.setupLobby;
  if (!lobby || state.phase !== "setup") {
    throw new Error("The adventure already started.");
  }
  const check = lobby.startCheck;
  if (!check) {
    throw new Error("No start check is open.");
  }
  // Past the window: abort as a timeout instead of confirming late.
  if (now !== undefined && now >= check.deadline) {
    abortStartCheck(state, "timeout", action.playerId, check);
    return;
  }
  const confirmers = readyCheckConfirmers(state);
  if (!confirmers.includes(action.playerId)) {
    throw new Error("Only a seated player may confirm the start.");
  }
  if (!check.confirmations.includes(action.playerId)) {
    check.confirmations.push(action.playerId);
    appendEvent(state, {
      type: "START_CHECK_CONFIRMED",
      playerId: action.playerId,
      confirmed: check.confirmations.length,
      needed: confirmers.length
    });
  }
  maybeCompleteStartCheck(state);
}

/**
 * CANCEL_START_ADVENTURE: abort the open ready check back to setup. A seated
 * player pressing Cancel, or any client firing this once the 30-second window
 * has elapsed (an AFK seat never confirmed). The server clock decides which.
 */
export function cancelStartAdventure(
  state: GameState,
  action: Extract<GameAction, { type: "CANCEL_START_ADVENTURE" }>,
  now?: number
): void {
  const lobby = state.setupLobby;
  if (!lobby || state.phase !== "setup") {
    throw new Error("The adventure already started.");
  }
  const check = lobby.startCheck;
  if (!check) {
    throw new Error("No start check is open.");
  }
  if (!readyCheckConfirmers(state).includes(action.playerId)) {
    throw new Error("Only a seated player may cancel the start.");
  }
  const timedOut = now !== undefined && now >= check.deadline;
  abortStartCheck(state, timedOut ? "timeout" : "cancel", action.playerId, check);
}

/** Builds the scenario map in place once every seat picked a faction. */
function buildAdventureFromLobby(state: GameState): void {
  const lobby = state.setupLobby;
  if (!lobby) {
    return;
  }
  const built = createAdventureGameState({
    seed: state.seed,
    sessionMode: state.sessionMode,
    controllers: state.controllers,
    scenarioId: lobby.options.scenarioId,
    ruleset: lobby.options.ruleset,
    wog: lobby.options.wog,
    // Anime mod + the GLOBAL Field Override system are set on the lobby (the
    // setGameOptions `anime` / `fieldOverrides` / `fieldOverridePlacement`
    // branches — e.g. a Story-mode chapter injects them at Begin). They must be
    // carried into the built game or the lobby choice is silently dropped; both
    // default to OFF for a plain lobby, so a normal table is byte-identical.
    anime: lobby.options.anime,
    fieldOverrides: lobby.options.fieldOverrides,
    fieldOverridePlacement: lobby.options.fieldOverridePlacement,
    victoryMode: lobby.options.victoryMode,
    pvpTroopLoss: lobby.options.pvpTroopLoss,
    dragonUtopiaGuards: lobby.options.dragonUtopiaGuards,
    events: lobby.options.events,
    victoryPoints: lobby.options.victoryPoints,
    victoryPointsRoundLimit: lobby.options.victoryPointsRoundLimit,
    customWinConditions: lobby.options.customWinConditions,
    spellBook: lobby.options.spellBook,
    moraleCards: lobby.options.moraleCards,
    tournamentMode: lobby.options.tournamentMode,
    tournamentBanDiplomacy: lobby.options.tournamentBanDiplomacy,
    tournamentBanHourglass: lobby.options.tournamentBanHourglass,
    tournamentSecondPlayerMorale: lobby.options.tournamentSecondPlayerMorale,
    // Every real game takes the rulebook Scenario Difficulty starting bonus
    // (p.10); it is not a lobby toggle, so it is always on for a lobby build.
    startingBonus: true,
    pvpNeutralControl: lobby.options.pvpNeutralControl,
    pvpNeutralControlMustAttack: lobby.options.pvpNeutralControlMustAttack,
    houseRules: lobby.options.houseRules,
    parallelTurns: lobby.options.parallelTurns,
    undoMoves: lobby.options.undoMoves,
    farTileOpening: lobby.options.farTileOpening,
    farTilesPerPlayer: lobby.options.farTilesPerPlayer,
    difficulty: lobby.options.difficulty,
    startingResources: lobby.options.startingResources,
    startingProduction: lobby.options.startingProduction,
    startingUnitTiers: lobby.options.startingUnitTiers,
    startingUnits: lobby.options.startingUnits ?? null,
    startingBuildings: lobby.options.startingBuildings,
    customMap: lobby.options.customMap ?? null,
    customMapPreset: lobby.options.customMapPreset ?? null,
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

  // Freeze the seat → account bindings of the game that is starting RIGHT NOW,
  // so a player who later leaves the room (or steps down to observer) cannot
  // erase themselves from the ranked result — match reporting reads this
  // snapshot alongside the live member list and records deserters as "abandon".
  // Open tables store no seat on members, so their snapshot is simply empty.
  if (state.room) {
    const matchSeats: NonNullable<RoomMembershipState["matchSeats"]> = {};
    const seatIds = new Set(lobby.seats.map((seat) => seat.playerId));
    for (const member of state.room.members) {
      if (member.seat !== "observer" && seatIds.has(member.seat)) {
        matchSeats[member.seat] = {
          name: member.name,
          ...(member.userId ? { userId: member.userId } : {})
        };
      }
    }
    state.room.matchSeats = matchSeats;
  }
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

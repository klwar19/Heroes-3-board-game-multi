import { astrologersDeckCardIds } from "@/data/cards/astrologers";
import { eventsDeckCardIds } from "@/data/cards/events";
import { abilityDeckBinh, abilityDeckLegacy } from "@/data/cards/abilities-extra";
import {
  artifactDeckBinhMajor,
  artifactDeckBinhMinor,
  artifactDeckBinhRelic,
  artifactDeckLegacy,
  EVERSMOKING_RING_OF_SULFUR_ID,
  TORSO_OF_LEGION_ID
} from "@/data/cards/artifacts";
import {
  animeXianxiaArtifactCardIds,
  animeXianxiaArtifactMajorIds,
  animeXianxiaArtifactMinorIds,
  animeXianxiaArtifactRelicIds
} from "@/data/anime/artifacts";
import {
  animeEquipmentCardIds,
  animeEquipmentMajorIds,
  animeEquipmentMinorIds,
  animeEquipmentRelicIds
} from "@/data/anime/equipment-cards";
import { EQUIPMENT_IDS } from "@/data/anime/equipment";
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
  isRecruitableNeutralUnit,
  isPlayableFaction,
  neutralUnitIdsByTier,
  startingTileByFaction
} from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { DOOM_UNIT_IDS_BY_TIER } from "@/data/doom";
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
  declaredStandaloneLayer,
  declaredStandaloneMapLayer,
  stampDesignerFieldReward,
  EVENTS_DECK_ID,
  gatePairColor,
  getTileFootprintSpaceIds,
  ensureRevealedRandomTownFactions,
  DESIGNER_BORDER_SEALING_ENABLED,
  getUnitSide,
  instantiateTile,
  materializeTileFields,
  NEUTRAL_DECK_IDS,
  normalizeDesignedBorders,
  normalizeDesignedBorderEdges,
  planIsUnderground,
  UNDERGROUND_LAYER_GROUPS,
  recomputeSubterraneanGates,
  resolveStartingArmyFromGuardSpec,
  seaTileBand,
  subterraneanTileBand,
  changeMorale,
  applyCustomMapStartingBonuses,
  startAdventureRound,
  startingBonusVisitSteps,
  startPlayerTurn,
  tileLayer,
  tokenMayCoverFieldDef,
  legalTokenSlotsForTileDef,
  victoryModeCountsHeroDefeats
} from "./adventure";
import { describeCustomWinCondition } from "./victory-points";
import {
  applyCustomMapPresetToOptions,
  coopMapDeployment,
  customMapPresetIsActive,
  MAX_GATES_PER_PAIR,
  mergeCustomWinConditions,
  mapHasAuthoredGrailOrUtopia,
  mapSupportsGameMode,
  revertCustomMapPresetOptions,
  sanitizeCustomMapPreset,
  sanitizeCustomWinConditions,
  planAllowedSecretFeatures,
  planExcludedSecretFeatures,
  tileMatchesAnySecretFeature,
  tilePassesSecretFilters,
  victoryDesignConflicts,
  VII_FIELD_DESIGNATIONS,
  objectGuardSpec,
  OUTPOST_OBJECT_KINDS,
  STANDALONE_ONLY_OBJECT_KINDS,
  sanitizeCenterHexPlan,
  sanitizeFieldReward,
  sanitizeHexEvents,
  sanitizeObjectPlans,
  sanitizeCoopMapSeat,
  sanitizeSinglePlayerMapStart,
  sanitizeSettlementFieldPlan,
  sanitizeObjectGuard,
  singlePlayerMapDeployment,
  type CustomMapPreset,
  type PresetForcedOptionKey
} from "./map-preset";
import { pumpAdventureQueues } from "./adventure-reducer";
import { makeInitialCommanderState } from "./commanders";
import {
  COOP_AI_TEAM_ID,
  COOP_HUMAN_TEAM_ID,
  controllerOf,
  isComputerPlayer,
  standardComputerController
} from "./computer/control";
import { normalizeParallelTurnRounds } from "./parallel-turns";
import { drawCardsForPlayer, shuffleCards } from "./decks";
import { makeMoraleDecks } from "./morale-cards";
import { bakeEntropy, createSeededRandom, type SeededRandom } from "./random";
import { freshSeed } from "./seed";
import { appendEvent, eventSeedNumber } from "./events";
import {
  calculateFirstPlayerRoll,
  gameOrderForFirstPlayerRoll,
  resolveManualPlayerOrder,
  sanitizeManualPlayerOrder
} from "./first-player";
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
  CustomHexEvent,
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
  TableGameMode,
  HouseRuleId,
  DragonUtopiaGuards,
  MapTileState,
  PlayerId,
  PlayerController,
  PlayerState,
  PvpTroopLoss,
  PlayerOrderMode,
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
import { resolvePveEncounterTheme } from "./pve-content";
import { planFieldOverrides, planTokens } from "./tile-hex-placements";
import {
  applyCustomMapFieldOverrides,
  assignPoolFieldOverrides,
  customMapHasAnimeFieldOverridePins,
  customMapHasFieldOverridePins,
  customMapHasWogFieldOverridePins,
  mapObjectsModuleActive,
  resolveFieldOverridePlacement,
  resolveFieldOverridesEnabled,
  fieldOverrideKindAllowedForState
} from "./field-overrides";
import { isFieldOverrideLocation } from "@/data/map/field-overrides";
import { ensureMgqGoldContractSetupChoice } from "./mgq-contracts";

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
    iconSrc: "/assets/glyphs/building_materials.svg",
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
import { HOUSE_RULES, HOUSE_RULE_BY_ID, resolveHouseRules } from "./house-rules";

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
      const reward = sanitizeFieldReward(token.reward);
      const tokenVp =
        typeof token.vp === "number" && Number.isFinite(token.vp) && token.vp > 0
          ? Math.floor(token.vp)
          : undefined;

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
          ...(reward ? { reward } : {}),
          ...(tokenVp !== undefined ? { vp: tokenVp } : {}),
          // Two-way gates/monoliths share the one-way exit-mode vocabulary
          // (certain / random / mix + always-pickable destinations).
          ...((token.kind === "oneway_entrance" || token.kind === "gate" || token.kind === "monolith") &&
          token.exitMode
            ? { exitMode: token.exitMode }
            : {}),
          ...((token.kind === "oneway_exit" || token.kind === "gate" || token.kind === "monolith") &&
          token.alwaysPickable
            ? { alwaysPickable: true }
            : {})
        });
        continue;
      }

      const def = allTileDefinitions[tile.tileDefId];
      if (!def) {
        continue;
      }
      // Preferred designer slot when still legal; otherwise first legal printed
      // field. Face-up "one of N" resolves to a concrete tile here — the
      // preferred physical pin can land on an illegal printed field for that
      // roll, and must NOT silently drop the gate (guards + pair ride with it).
      const legal = legalTokenSlotsForTileDef(def, legalityKind);
      if (legal.length === 0) {
        continue;
      }
      const slot =
        token.slot !== undefined && legal.includes(token.slot) ? token.slot : legal[0];
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
        carveColoredGateField(adventure, spaceId, token.pair, {
          exitMode: token.exitMode,
          alwaysPickable: token.alwaysPickable
        });
      } else if (isOneway && token.pair !== undefined) {
        carveOnewayField(adventure, spaceId, token.kind as "oneway_entrance" | "oneway_exit", token.pair, {
          exitMode: token.exitMode,
          alwaysPickable: token.alwaysPickable
        });
      } else if (token.kind === "monolith" || token.kind === "whirlpool") {
        const number = token.kind === "whirlpool" ? WHIRLPOOL_NUMBERS[whirlpoolsApplied++] : undefined;
        carveMapTokenField(adventure, spaceId, token.kind, number);
        const carvedToken = adventure.fields[spaceId];
        if (carvedToken && token.kind === "monolith") {
          if (token.exitMode) {
            carvedToken.onewayExitMode = token.exitMode;
          }
          if (token.alwaysPickable) {
            carvedToken.onewayAlwaysPickable = true;
          }
        }
      }
      const carved = adventure.fields[spaceId];
      if (carved) {
        applyCustomGuardToField(carved, guard);
        stampDesignerFieldReward(carved, reward, tokenVp);
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
  /**
   * Table game mode: "clash" (default/absent) or "coop" (human seats allied
   * against the computer seats). Only "coop" is frozen onto the built state.
   */
  gameMode?: TableGameMode;
  /** Explicit Team 1..N assignment by starting seat; absent keeps mode defaults. */
  teamAssignments?: Record<PlayerId, number>;
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
  /** Tournament option: Redwood Observatory may re-rotate an adjacent no-Hero tile, then still discovers normally. */
  tournamentObservatoryRerotate?: boolean;
  /**
   * PvP Neutral Control mode (default off, any table with at least two seats):
   * the next live seat clockwise plays the Neutral units, including single-player AI tables.
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
  /**
   * OPTIONAL "Manual guard control" mode (default off): the FIGHTER of a
   * Neutral combat commands the guards (must-attack discipline) or delegates
   * single activations to the AI. See GameSetupOptions.manualGuardControl.
   */
  manualGuardControl?: boolean;
  /**
   * OPTIONAL first-round starting-hand Mulligan mode (default off): in round 1,
   * when ON (default) allows discarding during the round-1 start-of-turn hand
   * step; when OFF, round-1 discards are blocked (draw-only). See
   * GameSetupOptions.startingHandMulligan.
   */
  startingHandMulligan?: boolean;
  /**
   * Unit Experience (optional rule): see GameSetupOptions.unitExperience —
   * one of the three equivalent surfaces (with wog/anime.unitExperience).
   */
  unitExperience?: boolean;
  /** Whether players may open their own Ⅱ–Ⅲ Far tiles (default on). Off gives no Far-tile supply. */
  farTileOpening?: boolean;
  /** How many NEW Ⅱ–Ⅲ tiles each player may add to the map (default: the scenario's perPlayer, 2). */
  farTilesPerPlayer?: number;
  /** Blind Ⅱ–Ⅲ tile choice (default off): pick gold/valuables/no-preference BEFORE the supply draw. */
  farTileBlindChoice?: boolean;
  /**
   * Ⅱ–Ⅲ tile TYPE choice (default off): the undecided Ⅱ–Ⅲ tile in a player's
   * hand works like a hidden tile — placing it first asks WHICH KIND (gold /
   * crystal / stone mine, or a Settlement) and the draw is restricted to it.
   * Supersedes {@link AdventureSetupOptions.farTileBlindChoice} while on.
   */
  farTileTypeChoice?: boolean;
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
   * WHO GOES FIRST (default "random"). "manual" + a valid `manualPlayerOrder`
   * uses that order verbatim and skips the roll AND its ceremony. Absent /
   * "random" is byte-identical to before.
   */
  playerOrderMode?: PlayerOrderMode;
  /** The deliberate turn order for `playerOrderMode: "manual"` (first player first). */
  manualPlayerOrder?: PlayerId[];
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

/**
 * Accept only a complete, bounded assignment for the supplied live seats.
 * Complete records make a malformed/old partial payload fail closed to the
 * established mode defaults instead of accidentally allying an omitted seat.
 */
export function sanitizeTeamAssignments(
  raw: Record<PlayerId, number> | undefined,
  seatIds: readonly PlayerId[]
): Record<PlayerId, number> | undefined {
  if (!raw || seatIds.length === 0 || Object.keys(raw).length !== seatIds.length) {
    return undefined;
  }
  const result: Record<PlayerId, number> = {};
  for (const playerId of seatIds) {
    const team = raw[playerId];
    if (!Number.isInteger(team) || team < 1 || team > seatIds.length) {
      return undefined;
    }
    result[playerId] = team;
  }
  return result;
}

/** Team numbers shown in setup. Explicit picks win; otherwise show the mode's real defaults. */
export function lobbyTeamAssignments(state: GameState): Record<PlayerId, number> {
  const lobby = state.setupLobby;
  if (!lobby) return {};
  const seatIds = lobby.seats.map((seat) => seat.playerId);
  const fixed = lobby.options.customMapPreset?.fixedTeams;
  if (fixed?.length === seatIds.length) {
    return Object.fromEntries(seatIds.map((playerId, index) => [playerId, fixed[index]]));
  }
  const explicit = sanitizeTeamAssignments(lobby.options.teamAssignments, seatIds);
  if (explicit) return explicit;
  if (lobby.options.gameMode === "coop") {
    return Object.fromEntries(
      seatIds.map((playerId) => [playerId, isComputerPlayer(state, playerId) ? 2 : 1])
    );
  }
  const alliedSoloComputers =
    state.sessionMode === "single-player" && lobby.options.customMapPreset?.computerDiplomacy === "allied";
  return Object.fromEntries(
    seatIds.map((playerId, index) => [
      playerId,
      alliedSoloComputers && isComputerPlayer(state, playerId) ? 2 : index + 1
    ])
  );
}

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
    customMode: false,
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
    manualGuardControl: false,
    // Default ON: after R1 fill-to-limit, arm OPENING_HAND_MULLIGAN (discard 0–N
    // to deck, draw same). OFF: only fill (ditch bonus artifact or keep, draw to 4).
    startingHandMulligan: true,
    farTileOpening: true,
    farTilesPerPlayer: scenario.farTiles.perPlayer,
    farTileBlindChoice: false,
    farTileTypeChoice: false,
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

function makeNeutralDecks(seed: string, wog: WogModOptions, anime: AnimeModOptions): Record<string, DeckState> {
  const decks: Record<string, DeckState> = {};
  const wogCreaturesOn = Boolean(wog.enabled && wog.newCreatures);
  // The Doom neutral slice belongs to the ANIME mod only — WOG's "new creatures"
  // adds the WOG roster alone. (Previously `wogCreaturesOn ||` forced the doom
  // units into the decks for every WOG game too.)
  const doomCreaturesOn = animeModuleEnabled({ anime }, "doomNeutrals");
  for (const tier of ["bronze", "silver", "gold", "azure"] as const) {
    const deckId = NEUTRAL_DECK_IDS[tier];
    const unitIds = [
      ...neutralUnitIdsByTier[tier],
      ...(wogCreaturesOn ? WOG_UNIT_IDS_BY_TIER[tier] : []),
      ...(doomCreaturesOn ? DOOM_UNIT_IDS_BY_TIER[tier] : [])
    ].filter(isRecruitableNeutralUnit);
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
    | "tournamentMode"
    | "tournamentBanDiplomacy"
    | "tournamentBanHourglass"
    | "tournamentSecondPlayerMorale"
    | "tournamentObservatoryRerotate"
  >
): {
  banDiplomacy: boolean;
  banHourglass: boolean;
  secondPlayerMorale: boolean;
  observatoryRerotate: boolean;
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
        : master,
    observatoryRerotate:
      options.tournamentObservatoryRerotate !== undefined
        ? Boolean(options.tournamentObservatoryRerotate)
        : master
  };
}

/** True when every tournament setup rule is active (UI "Tournament mode" highlight). */
export function tournamentRulesAllOn(
  options: Pick<
    GameSetupOptions,
    | "tournamentMode"
    | "tournamentBanDiplomacy"
    | "tournamentBanHourglass"
    | "tournamentSecondPlayerMorale"
    | "tournamentObservatoryRerotate"
  >
): boolean {
  const rules = resolveTournamentRules(options);
  return rules.banDiplomacy && rules.banHourglass && rules.secondPlayerMorale && rules.observatoryRerotate;
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
  wogCommanderArtifacts = false,
  animeEquipment = false,
  torsoOfLegionMajor = true,
  // Mirrors torsoOfLegionMajor: the default matches the house rule's BINH
  // default, so an argument-less call agrees with `effectiveArtifactTier`.
  eversmokingRingOfSulfurMajor = true
): Record<string, DeckState> {
  const without = (cardIds: string[], removeId: string, ban: boolean): string[] =>
    ban ? cardIds.filter((id) => id !== removeId) : cardIds;

  // Torso of Legion re-tier (house rule `torso-of-legion-major`, default ON):
  // the lists statically place Torso in the BINH Major deck. With the rule OFF
  // it joins the Minor deck instead — its PRINTED tier. Default ON ⇒ the lists
  // are untouched (byte-identical). The legacy single Artifact deck is one pile,
  // so its membership never changes — only the per-card tier READ (via
  // `effectiveArtifactTier`) does, which is handled at each read site.
  const binhMinor = [
    ...artifactDeckBinhMinor,
    ...(torsoOfLegionMajor ? [] : [TORSO_OF_LEGION_ID]),
    ...(eversmokingRingOfSulfurMajor ? [] : [EVERSMOKING_RING_OF_SULFUR_ID])
  ];
  const binhMajor = artifactDeckBinhMajor.filter(
    (id) =>
      (torsoOfLegionMajor || id !== TORSO_OF_LEGION_ID) &&
      (eversmokingRingOfSulfurMajor || id !== EVERSMOKING_RING_OF_SULFUR_ID)
  );

  // Anime Pháp Bảo artifacts (§5.10) join the shared Artifact deck(s) ONLY when
  // the module is on; default OFF ⇒ these arrays are empty and the decks are
  // byte-identical to a core table. They ride the SAME per-tier decks as core
  // artifacts, so every downstream tier/uniqueness gate applies unchanged.
  const withAnime = (base: string[], animeIds: readonly string[]): string[] =>
    xianxiaArtifacts ? [...base, ...animeIds] : base;

  // Anime EQUIPMENT cards join when `anime.equipment` is on — same per-tier
  // contract. Playing one equips + removes the card + grants a same-grade
  // regular Artifact.
  const withEquipment = (base: string[], equipIds: readonly string[]): string[] =>
    animeEquipment ? [...base, ...equipIds] : base;

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
        without(
          withEquipment(
            withWogCommander(withWog(withAnime(binhMinor, animeXianxiaArtifactMinorIds), wogArtifactMinorIds), wogCommanderArtifactMinorIds),
            animeEquipmentMinorIds
          ),
          TOURNAMENT_REMOVED_ARTIFACT_ID,
          tournament.banHourglass
        )
      ),
      "artifacts-major": make(
        "artifacts-major",
        withEquipment(
          withWogCommander(withWog(withAnime(binhMajor, animeXianxiaArtifactMajorIds), wogArtifactMajorIds), wogCommanderArtifactMajorIds),
          animeEquipmentMajorIds
        )
      ),
      "artifacts-relic": make(
        "artifacts-relic",
        withEquipment(
          withWogCommander(withWog(withAnime(artifactDeckBinhRelic, animeXianxiaArtifactRelicIds), wogArtifactRelicIds), wogCommanderArtifactRelicIds),
          animeEquipmentRelicIds
        )
      )
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
      without(
        withEquipment(
          withWogCommander(withWog(withAnime(artifactDeckLegacy, animeXianxiaArtifactCardIds), wogArtifactCardIds), wogCommanderArtifactCardIds),
          animeEquipmentCardIds
        ),
        TOURNAMENT_REMOVED_ARTIFACT_ID,
        tournament.banHourglass
      )
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
  const mgqStartingRandom = createSeededRandom(`${seed}#mgq-starting-units#${config.id}`, { salt: false });
  const mgqStartingPools: Partial<Record<"bronze" | "silver", string[]>> = {};
  const takeRandomMgqStartingUnit = (tier: "bronze" | "silver"): string | undefined => {
    const pool = mgqStartingPools[tier] ??= coreFactionDefinitions.mgq.units.filter(
      (unitDefId) => coreUnitDefinitions[unitDefId]?.tier === tier
    );
    if (pool.length === 0) return undefined;
    return pool.splice(mgqStartingRandom.nextInt(0, pool.length - 1), 1)[0];
  };

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
    },
    ...(config.factionId === "mgq"
      ? { mgqGoldContracts: [], mgqGoldContractSetupRequired: true }
      : {})
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
      const choiceTier = choice.level ? tierOfLevel(choice.level) : choice.tier;
      if (
        !choice.unitDefId &&
        config.factionId === "mgq" &&
        (choiceTier === "bronze" || choiceTier === "silver")
      ) {
        // MGQ has 8 bronze and 13 silver identities rather than the classic
        // fixed 3/2 level ladder. Every beginning-of-game bronze/silver slot
        // therefore draws randomly from its full tier roster. Multiple slots
        // draw without replacement; other factions and exact legacy picks are
        // untouched.
        unitDefId = takeRandomMgqStartingUnit(choiceTier);
      } else if (choice.level) {
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
  scenario: ScenarioDefinition,
  activeSeatCount = scenario.layout.unusedStartsAsNearFrom ?? scenario.layout.starts.length
): { accepted: CustomMapTilePlan[]; problems: string[]; warnings: string[] } {
  const problems: string[] = [];
  // Non-fatal notes: the design is playable, but something was adjusted. A
  // designer Subterranean Gate LINK that cannot resolve (its partner Surface tile
  // is not placed at the current player count, or the two tiles do not touch) is a
  // WARNING, not a problem — a gate connects two TILES, so at a player count where
  // one side is absent the gate simply does not instantiate; the cavern tile still
  // makes it into the game. (Previously these were problems, which read as "N tiles
  // won't make it into the game" and blocked Play — the reported 4P-at-3P bug.)
  const warnings: string[] = [];
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
    }
    // "One of these tiles" random list (map designer): every id must be a real
    // tile of this slot's own pool; it never applies to a starting seat.
    if (plan.oneOfTileDefIds !== undefined) {
      if (plan.group === "starting") {
        problems.push(`Tile ${index + 1}: starting tiles are placed by faction, not from a tile list.`);
        return false;
      }
      if (!Array.isArray(plan.oneOfTileDefIds) || plan.oneOfTileDefIds.length === 0) {
        problems.push(`Tile ${index + 1}: the "one of" tile list is empty.`);
        return false;
      }
      for (const id of plan.oneOfTileDefIds) {
        const def = allTileDefinitions[id];
        if (!def) {
          problems.push(`Tile ${index + 1}: unknown tile "${id}" in the tile list.`);
          return false;
        }
        if (def.group === "starting") {
          problems.push(`Tile ${index + 1}: starting tiles cannot appear in a tile list.`);
          return false;
        }
        if (def.group !== plan.group) {
          problems.push(`Tile ${index + 1}: ${id} belongs to the ${def.group} pool, not ${plan.group}.`);
          return false;
        }
      }
    }
    // A face-up slot needs a concrete choice: an exact tile OR a non-empty "one
    // of" list (a random pick lands there at setup).
    if (
      plan.group !== "starting" &&
      !plan.faceDown &&
      !plan.tileDefId &&
      !(plan.oneOfTileDefIds && plan.oneOfTileDefIds.length > 0)
    ) {
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
    if (plan.secretFeatures !== undefined) {
      if (!Array.isArray(plan.secretFeatures) || !plan.secretFeatures.every(isSecretTileFeature)) {
        problems.push(`Tile ${index + 1}: invalid secret-landmark set.`);
        return false;
      }
      if (!plan.faceDown || plan.group === "starting") {
        problems.push(`Tile ${index + 1}: a secret-landmark set only applies to a face-down non-starting slot.`);
        return false;
      }
    }
    if (plan.excludeFeatures !== undefined) {
      if (!Array.isArray(plan.excludeFeatures) || !plan.excludeFeatures.every(isSecretTileFeature)) {
        problems.push(`Tile ${index + 1}: invalid exclude-landmark set.`);
        return false;
      }
      if (!plan.faceDown || plan.group === "starting") {
        problems.push(`Tile ${index + 1}: landmark bans only apply to a face-down non-starting slot.`);
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
    placedCenters.push(
      ...scenario.layout.starts
        .slice(0, Math.max(0, Math.min(activeSeatCount, scenario.layout.starts.length)))
        .map((start) => ({ ...start }))
    );
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
      : scenario.layout.starts
          .slice(0, Math.max(0, Math.min(activeSeatCount, scenario.layout.starts.length)))
          .map((start) => `${start.row}:${start.col}`)
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
        warnings.push(
          `Cavern at ${plan.row},${plan.col}: gate link to ${link.surface.row},${link.surface.col} — no Surface tile is placed there (the gate is skipped at this player count).`
        );
        continue;
      }
      if (!tileFootprintsTouch(cavernCenter, surfaceCenter)) {
        warnings.push(
          `Cavern at ${plan.row},${plan.col}: gate link to ${link.surface.row},${link.surface.col} — the tiles do not touch (the gate is skipped).`
        );
        continue;
      }
      if (keptLinks.length >= MAX_DESIGNED_GATE_LINKS) {
        warnings.push(`Cavern at ${plan.row},${plan.col}: too many gate links (max ${MAX_DESIGNED_GATE_LINKS}).`);
        continue;
      }
      const pinnedHexes = [link.gateHex, link.entranceHex].filter((hex): hex is MapSpaceId => Boolean(hex));
      if (pinnedHexes.length > 0) {
        // (a) A pinned pair reusing a hex already claimed by an accepted link
        //     (this cavern's or another's) would double-carve a board hex — drop it.
        const collision = pinnedHexes.find((hex) => claimedPinnedHexes.has(hex));
        if (collision) {
          warnings.push(
            `Cavern at ${plan.row},${plan.col}: gate link to ${link.surface.row},${link.surface.col} — its editor gate hex ${collision} overlaps another gate (position is chosen at play, so this is harmless).`
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

  // Solo deployment metadata belongs only to Town/start tiles. Normalise its
  // role and bonus even for direct in-memory SET_GAME_OPTIONS payloads (saved
  // maps already pass through the registry sanitiser), and strip malformed or
  // misplaced data. A partial collection is harmless: it remains visible to
  // the designer but is inactive until it has one human plus >=1 computer.
  for (let index = 0; index < accepted.length; index += 1) {
    const plan = accepted[index];
    const singlePlayer =
      plan.group === "starting" ? sanitizeSinglePlayerMapStart(plan.singlePlayer) : undefined;
    if (singlePlayer) {
      if (singlePlayer !== plan.singlePlayer) {
        accepted[index] = { ...plan, singlePlayer };
      }
    } else if (plan.singlePlayer !== undefined) {
      const next = { ...plan };
      delete next.singlePlayer;
      accepted[index] = next;
    }
  }

  // CO-OP per-position roles (step 5) are start-tile-only too, and deliberately
  // INDEPENDENT of `singlePlayer` above: a tile may carry both, and neither
  // reads the other. Garbage / a role on any other group is stripped, so an
  // absent field always means "either side may take this position".
  for (let index = 0; index < accepted.length; index += 1) {
    const plan = accepted[index];
    const coopSeat = plan.group === "starting" ? sanitizeCoopMapSeat(plan.coopSeat) : undefined;
    if (coopSeat) {
      if (coopSeat !== plan.coopSeat) {
        accepted[index] = { ...plan, coopSeat };
      }
    } else if (plan.coopSeat !== undefined) {
      const next = { ...plan };
      delete next.coopSeat;
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

  // `viiField` / `viiFields` FORCE a center slot's difficulty-7 objective field
  // (Grail / Dragon Utopia / Random Town) and `centerHex` customizes that
  // field's guard / reward / VP. Center-only — strip on every other group.
  // `playerResourcePick` is face-down far/near only; `playerViiPick` needs
  // multi-select Ⅶ on a face-down center.
  for (let index = 0; index < accepted.length; index += 1) {
    const plan = accepted[index];
    if (
      plan.viiField === undefined &&
      plan.viiFields === undefined &&
      plan.centerHex === undefined &&
      plan.playerResourcePick === undefined &&
      plan.playerViiPick === undefined
    ) {
      continue;
    }
    const isCenter = plan.group === "center";
    const validVii = isCenter && plan.viiField !== undefined && VII_FIELD_DESIGNATIONS.has(plan.viiField);
    const multi =
      isCenter && Array.isArray(plan.viiFields)
        ? [...new Set(plan.viiFields.filter((v) => VII_FIELD_DESIGNATIONS.has(v)))]
        : [];
    const centerHex = isCenter ? sanitizeCenterHexPlan(plan.centerHex) : undefined;
    const next = { ...plan };
    if (!validVii) {
      delete next.viiField;
    }
    if (multi.length > 0) {
      next.viiFields = multi;
    } else {
      delete next.viiFields;
    }
    if (plan.playerViiPick === true && multi.length > 1 && plan.faceDown && isCenter) {
      next.playerViiPick = true;
    } else {
      delete next.playerViiPick;
    }
    if (
      plan.playerResourcePick === true &&
      plan.faceDown &&
      (plan.group === "far" || plan.group === "near")
    ) {
      next.playerResourcePick = true;
    } else {
      delete next.playerResourcePick;
    }
    if (centerHex) {
      next.centerHex = centerHex;
    } else {
      delete next.centerHex;
    }
    accepted[index] = next;
  }

  // Per-tile settlement customization: re-clamp guard / VP / hold-to-win on every
  // plan so garbage never lands in the built adventure. Starting tiles rarely
  // host settlements; we still keep a valid plan (inert if no settlement field).
  for (let index = 0; index < accepted.length; index += 1) {
    const plan = accepted[index];
    if (plan.settlement === undefined && plan.objectPlans === undefined) {
      continue;
    }
    const settlement = sanitizeSettlementFieldPlan(plan.settlement);
    // SPECIFIC object plans (obelisk / mine) ride the same defensive re-clamp.
    const objectPlans = sanitizeObjectPlans(plan.objectPlans);
    if (settlement === plan.settlement && objectPlans === plan.objectPlans) {
      continue;
    }
    const next = { ...plan };
    if (settlement) {
      next.settlement = settlement;
    } else {
      delete next.settlement;
    }
    if (objectPlans) {
      next.objectPlans = objectPlans;
    } else {
      delete next.objectPlans;
    }
    accepted[index] = next;
  }

  return { accepted, problems, warnings };
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
    // Creature Bank pin must name a real bank id (sanitize already drops junk;
    // re-check so a hand-edited preset never carves a blank bank).
    if (object.kind === "creature_bank" && (!object.bankId || !(object.bankId in CREATURE_BANKS))) {
      problems.push(`${label}: a Creature Bank object must name a known bankId.`);
      return;
    }
    if (object.placement.type === "tile-slot") {
      // Outposts + Creature Bank are STANDALONE-only — "a separate hex out of
      // the map"; a tile-slot placement is dropped.
      if (STANDALONE_ONLY_OBJECT_KINDS.has(object.kind)) {
        problems.push(`${label}: a ${object.kind.replace(/_/g, " ")} must be a standalone hex, never on a tile.`);
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
    // A DECLARED board ({@link CustomMapObject.layer}) removes the ambiguity the
    // bridge rejection exists for: the hex belongs to the declared layer only, so
    // touching both boards is legal (the far-layer neighbours simply cannot enter
    // it — the divide stays Subterranean-Gate-only, enforced in canCrossEdge via
    // the stamped `standaloneLayer`). With NOTHING declared the layer is still
    // inferred from the neighbours, and a both-touching hex is still refused.
    const declaredLayer = declaredStandaloneMapLayer(object);
    if (!declaredLayer && touchesSurface && touchesSub) {
      problems.push(
        `${label}: a standalone hex may not touch BOTH a Surface and an Underground tile (implicit layer bridge). ` +
          `Declare the object's board (normal / water / underground) to place it here.`
      );
      return;
    }
    const touchesOwnLayer = declaredLayer
      ? declaredLayer === "subterranean"
        ? touchesSub
        : touchesSurface
      : touchesSurface || touchesSub;
    if (!touchesOwnLayer) {
      warnings.push(
        declaredLayer && (touchesSurface || touchesSub)
          ? `${label}: a standalone hex at ${row},${col} declares the ${declaredLayer === "subterranean" ? "Underground" : "Surface"} board but touches no ${declaredLayer === "subterranean" ? "Underground" : "Surface"} tile — it is unreachable in game.`
          : `${label}: a standalone hex at ${row},${col} touches no tile — it is unreachable in game.`
      );
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

/**
 * The layer a standalone object hex sits on: the object's own DECLARATION when it
 * has one ({@link CustomMapObject.layer} — the designer said which board this hex
 * belongs to), otherwise the legacy inference from the ACTUAL tiles it neighbours.
 * THE one writer of {@link MapFieldState.standaloneLayer}.
 */
function standaloneObjectLayer(
  adventure: AdventureState,
  spaceId: MapSpaceId,
  object: CustomMapObject
): "surface" | "subterranean" {
  return declaredStandaloneMapLayer(object) ?? standaloneLayerFromLiveState(adventure, spaceId);
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
/**
 * Carve designer HEX EVENTS into engine-side state ({@link AdventureState.hexEvents},
 * keyed by hex). An event is kept only when its hex belongs to a placed tile's
 * footprint or an already-carved standalone hex — anywhere else it could never
 * fire (the designer UI warns before save). Face-down tiles are fine: the field
 * materializes at reveal and the trigger reads the record by space id then.
 */
function applyCustomHexEvents(adventure: AdventureState, events: CustomHexEvent[]): void {
  if (events.length === 0) {
    return;
  }
  const reachable = new Set<string>(Object.keys(adventure.fields));
  for (const tile of Object.values(adventure.tiles)) {
    for (const spaceId of getTileFootprintSpaceIds(tile)) {
      reachable.add(spaceId);
    }
  }
  for (const event of events) {
    const spaceId = hexSpaceId({ row: event.placement.row, col: event.placement.col });
    if (!reachable.has(spaceId)) {
      continue;
    }
    const store = (adventure.hexEvents ??= {});
    if (store[spaceId]) {
      continue; // one event per hex (sanitiser enforces; defensive here)
    }
    store[spaceId] = { event, firedPlayerIds: [] };
  }
}

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
        carveColoredGateField(adventure, spaceId, object.pair, {
          exitMode: object.exitMode,
          alwaysPickable: object.alwaysPickable
        });
      } else if (object.kind === "monolith" || object.kind === "whirlpool") {
        // Continue the +1/0/-1 numbering across every whirlpool already carved
        // (the legacy `token` carve runs first).
        const whirlpoolCount = Object.values(adventure.fields).filter((f) => f.location === "whirlpool").length;
        const number = object.kind === "whirlpool" ? WHIRLPOOL_NUMBERS[whirlpoolCount] : undefined;
        carveMapTokenField(adventure, spaceId, object.kind, number);
        // Two-way exit-pick extras ride a Monolith exactly like a gate's.
        const carvedToken = adventure.fields[spaceId];
        if (carvedToken && object.kind === "monolith") {
          if (object.exitMode) {
            carvedToken.onewayExitMode = object.exitMode;
          }
          if (object.alwaysPickable) {
            carvedToken.onewayAlwaysPickable = true;
          }
        }
      }
      const carved = adventure.fields[spaceId];
      if (carved) {
        applyCustomGuardToField(carved, objectGuardSpec(object));
        stampDesignerFieldReward(carved, object.reward, object.vp);
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
    // Designer Creature Bank: carve a real bank hex (army + reward from
    // bankId). No designer guard / first-clear reward / yellow borders — the
    // bank fight IS the content and a bank is always border-free (never seals
    // movement or tile discovery). Optional bankSize pins Polish Stacked count
    // when that rule is on.
    if (object.kind === "creature_bank") {
      const bankId = object.bankId;
      if (!bankId || !(bankId in CREATURE_BANKS)) {
        continue;
      }
      const field: MapFieldState = {
        spaceId,
        tileInstanceId: `${STANDALONE_OBJECT_TILE_PREFIX}${spaceId}`,
        slot: 0,
        location: "creature_bank",
        bankId,
        ...(object.bankSize !== undefined ? { bankSize: object.bankSize } : {}),
        blackCube: false,
        flagOwnerId: null,
        everFlagged: false,
        settlementResource: null,
        standalone: true,
        standaloneLayer: standaloneObjectLayer(adventure, spaceId, object),
        // A declared "sea" board is a Surface WATER field (never a third layer).
        ...(declaredStandaloneLayer(object) === "sea" ? { terrain: "water" as const } : {})
      };
      adventure.fields[spaceId] = field;
      continue;
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
      standaloneLayer: standaloneObjectLayer(adventure, spaceId, object),
      // A declared "sea" board is a Surface WATER field (never a third layer):
      // entering it from land is the ordinary coastline halt unless the hero
      // has Water Walk (`isSeaField` reads exactly this).
      ...(declaredStandaloneLayer(object) === "sea" ? { terrain: "water" as const } : {})
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
    // Exit-pick extras: one-way ENTRANCE mode / EXIT always-pickable, and the
    // shared two-way vocabulary on standalone GATES and MONOLITHS (they are
    // both an origin and a destination) — token parity.
    if (
      (object.kind === "oneway_entrance" || object.kind === "gate" || object.kind === "monolith") &&
      object.exitMode
    ) {
      field.onewayExitMode = object.exitMode;
    }
    if (
      (object.kind === "oneway_exit" || object.kind === "gate" || object.kind === "monolith") &&
      object.alwaysPickable
    ) {
      field.onewayAlwaysPickable = true;
    }
    if (object.kind === "garrison") {
      field.garrisonBorderPassage = object.garrisonBorderPassage !== false;
    }
    applyCustomGuardToField(field, objectGuardSpec(object));
    stampDesignerFieldReward(field, object.reward, object.vp);
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
    // Skipped while the sealing "lock" is disabled (see applyDesignedBorders).
    if (DESIGNER_BORDER_SEALING_ENABLED && Array.isArray(object.borderEdges)) {
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
  // When sealing is off the plan keeps its border data (designer + save
  // round-trip) but the live tile is left clean — no draw, no wall. With the
  // flag ON (default) the plan's edges land on every group including starting Ⅰ.
  if (!DESIGNER_BORDER_SEALING_ENABLED) {
    return;
  }
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
  // Player resource pick (Far/Near face-down): carried onto the instance so
  // discovery can offer Gold vs Valuables before the tile content is fixed.
  if (plan.playerResourcePick && plan.faceDown && (plan.group === "far" || plan.group === "near")) {
    tile.playerResourcePick = true;
  }
  if (plan.group !== "center" || (!plan.viiField && !plan.viiFields?.length && !plan.centerHex)) {
    return;
  }
  // Multi-select of allowed Ⅶ designations. When playerViiPick is on and 2+
  // options remain, store the set for the reveal choice; otherwise resolve now.
  const multi = (plan.viiFields ?? []).filter(
    (v): v is "town" | "settlement" | "dragon_utopia" | "grail" =>
      v === "town" || v === "settlement" || v === "dragon_utopia" || v === "grail"
  );
  if (multi.length > 1) {
    if (plan.playerViiPick && plan.faceDown) {
      tile.viiFields = multi;
      tile.playerViiPick = true;
    } else {
      // Deterministic pick from the multi-set (seeded by plan position).
      // NOTE: a Grail/Utopia MYSTERY PAIR never reaches this hash any more —
      // `balancedRandomViiAssignments` collapses it (face-up AND face-down) to
      // a single balanced designation before this function is called. The hash
      // survives only for other multi-sets (e.g. town/settlement mixes).
      const idx =
        Math.abs((plan.row ?? 0) * 31 + (plan.col ?? 0) * 17) % multi.length;
      tile.viiField = multi[idx];
    }
  } else if (multi.length === 1) {
    tile.viiField = multi[0];
  } else if (plan.viiField) {
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
 * Per-tile settlement customization (plan → instance): store guard / bonus VP /
 * hold-to-win on the placed tile so materialize stamps them onto settlement
 * field(s). Re-materializes face-up tiles so an already-carved settlement picks
 * up the design immediately.
 */
function applyDesignedSettlement(
  adventure: AdventureState,
  tile: MapTileState,
  plan: CustomMapTilePlan
): void {
  const settlement = sanitizeSettlementFieldPlan(plan.settlement);
  if (settlement) {
    tile.settlement = settlement;
  } else {
    delete tile.settlement;
  }
  // SPECIFIC (per-tile) object plans (obelisk / mine) ride the instance the
  // same way — materialize folds them over the map-wide configs field-by-field.
  const objectPlans = sanitizeObjectPlans(plan.objectPlans);
  if (objectPlans) {
    tile.objectPlans = objectPlans;
  } else {
    delete tile.objectPlans;
  }
  if ((settlement || objectPlans) && !tile.faceDown) {
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
 * Holy Grail: pull up to `count` remaining Obelisk-bearing tiles from the NEAR
 * pool only (Ⅱ–Ⅲ Far never hosts Obelisks — see farPool filter). Used after
 * designer presets are counted so the map always has at least 2 Obelisks to
 * discover.
 */
function takeObeliskTiles(pools: { near?: string[]; far?: string[] }, count: number): string[] {
  const taken: string[] = [];
  // Prefer near; far is deliberately unused (house rule: no Obelisk on II–III).
  void pools.far;
  const pool = pools.near;
  if (!pool) {
    return taken;
  }
  while (taken.length < count) {
    const tile = takeTileWith(pool, "obelisk");
    if (!tile) {
      break;
    }
    taken.push(tile);
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
 * Pops a tile from a shuffled pool that passes the slot's include + exclude
 * landmark filters. Walks from the top of the remaining supply (end of the
 * array) so the draw is seed-deterministic after the pool was shuffled.
 * Optional sea/sub band filters keep the pick inside the slot's guard band.
 *
 * Exclude is REAL: a tile carrying any banned landmark is never chosen on the
 * first pass. Callers that need a soft fallback (empty after filter) pop
 * unfiltered themselves and emit a note.
 */
function popTileMatchingFilters(
  pool: string[],
  allowed: SecretTileFeature[],
  excluded: SecretTileFeature[],
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
    if (tilePassesSecretFilters(def, allowed, excluded)) {
      return pool.splice(index, 1)[0];
    }
  }
  return undefined;
}

/** @deprecated Prefer {@link popTileMatchingFilters} — kept for any external callers. */
function popTileMatchingFeature(
  pool: string[],
  feature: SecretTileFeature | SecretTileFeature[],
  options?: {
    group?: CustomMapTilePlan["group"];
    seaBand?: CustomMapTilePlan["seaBand"];
    subBand?: CustomMapTilePlan["subBand"];
  }
): string | undefined {
  const features = Array.isArray(feature) ? feature : [feature];
  return popTileMatchingFilters(pool, features, [], options);
}

/**
 * Center (VI–VII) tiles forced by the win condition. Holy Grail guarantees up
 * to TWO Grail tiles across available Center slots (the dig sites); leftover
 * Grail tiles may still overflow onto Near/Far via {@link takeRemainingGrailTiles}.
 * Dragon Hunt / Dragon Conqueror guarantee a Dragon Utopia. The array is
 * index-aligned with the scenario's Center positions; undefined entries fall
 * back to a random draw. Holy Grail no longer forces a Dragon Utopia.
 */
type GrailUtopiaCounts = { grail: number; dragon_utopia: number };

function isHiddenGrailUtopiaPair(
  viiFields: CustomMapTilePlan["viiFields"]
): boolean {
  const choices = new Set(viiFields ?? []);
  return choices.size === 2 && choices.has("grail") && choices.has("dragon_utopia");
}

/**
 * The SAME mystery, authored the other common way: a center "one of these
 * tiles" list mixing Grail-PRINTING and Utopia-PRINTING candidates (the live
 * maps put all of C1–C4 in one list). The raw one-of pick used to decide the
 * objective by whichever tile it happened to draw — a map whose every list
 * drew a Utopia tile held NO Grail at all (reported 2026-08-19: "one map with
 * 3 such fields — ALL 3 were Utopias, there was no Grail in the map"). These
 * slots now join the SAME balanced pool as the `viiFields` pairs. An explicit
 * `viiField` / `viiFields` on the plan wins as before, and a list printing
 * only one of the two kinds is an authored single-kind choice.
 */
function oneOfListMixesGrailUtopia(plan: CustomMapTilePlan): boolean {
  if (plan.group !== "center" || plan.tileDefId) return false;
  if (plan.viiField || plan.viiFields?.length) return false;
  const counts = objectiveCountsInTiles(plan.oneOfTileDefIds ?? []);
  return counts.grail > 0 && counts.dragon_utopia > 0;
}

/**
 * A center slot whose Ⅶ objective is RANDOM ("grail or utopia"): an authored
 * mystery pair (face-up or face-down — the old face-up position hash was
 * SEED-INDEPENDENT and is gone) or a mixed one-of list. A face-down
 * `playerViiPick` pair stays the revealing player's explicit choice.
 */
function isRandomGrailUtopiaSlot(plan: CustomMapTilePlan): boolean {
  if (plan.group !== "center") return false;
  if (isHiddenGrailUtopiaPair(plan.viiFields) && !(plan.playerViiPick && plan.faceDown)) {
    return true;
  }
  return oneOfListMixesGrailUtopia(plan);
}

/**
 * Resolve every RANDOM Grail/Utopia slot as ONE balanced pool instead of an
 * independent roll per tile: four random fields become 2 Grails + 2 Utopias;
 * three become 2+1 or 1+2. The shuffled order hides which position got which
 * result while staying reproducible from the game seed.
 *
 * USER RULES 2026-08-19: at the beginning "utopia are utopia" — the assigned
 * Utopias are real Utopias from round 1 — but the map may NEVER end up with
 * ZERO Grails (at least one slot is always assigned the Grail, so a lone
 * random slot is guaranteed to be it), and the assigned GRAIL fields are all
 * real Grails until a battle on one of them is WON, when the others convert
 * (see handleGrailVisit / applyGrailTakenConversion in adventure.ts).
 */
function balancedRandomViiAssignments(
  plans: readonly CustomMapTilePlan[],
  seed: string
): Map<CustomMapTilePlan, "grail" | "dragon_utopia"> {
  const slots = plans.filter(isRandomGrailUtopiaSlot);
  if (slots.length === 0) return new Map();

  const random = createSeededRandom(`${seed}#designer-hidden-grail-utopia-count`);
  const grailCount = Math.max(
    1,
    Math.floor(slots.length / 2) + (slots.length % 2 === 1 ? random.nextInt(0, 1) : 0)
  );
  const shuffled = shuffleCards(
    slots.map((_, index) => String(index)),
    `${seed}#designer-hidden-grail-utopia-positions`
  ).map((index) => slots[Number(index)]);
  return new Map(
    shuffled.map((plan, index) => [
      plan,
      index < grailCount ? "grail" as const : "dragon_utopia" as const
    ])
  );
}

/** Polish objective mix: one objective per seat, with the 3-player split rolled. */
function polishGrailUtopiaCounts(playerCount: number, seed: string): GrailUtopiaCounts {
  if (playerCount >= 4) return { grail: 2, dragon_utopia: 2 };
  if (playerCount === 3) {
    const grails = createSeededRandom(`${seed}#polish-grail-utopia-mix`).nextInt(1, 2);
    return { grail: grails, dragon_utopia: 3 - grails };
  }
  if (playerCount === 2) return { grail: 1, dragon_utopia: 1 };
  const grails = createSeededRandom(`${seed}#polish-grail-utopia-solo`).nextInt(0, 1);
  return { grail: grails, dragon_utopia: 1 - grails };
}

function objectiveCountsInTiles(tileIds: readonly (string | undefined)[]): GrailUtopiaCounts {
  const counts: GrailUtopiaCounts = { grail: 0, dragon_utopia: 0 };
  for (const tileId of tileIds) {
    const fields = tileId ? allTileDefinitions[tileId]?.fields ?? [] : [];
    if (fields.some((field) => field.location === "grail")) counts.grail += 1;
    if (fields.some((field) => field.location === "dragon_utopia")) counts.dragon_utopia += 1;
  }
  return counts;
}

/**
 * Whether a DESIGNER map authors any Grail / Dragon Utopia field (a Ⅶ
 * designation or a pinned tile carrying one). When it does, the Grail & Dragon
 * Utopia field rules AUTO-ACTIVATE at setup, so a placed Grail behaves as a real
 * Grail — a normal Level-VII fight vs 2 Azure guards, cleared for XP only, then
 * dug for 20 gold + a transferable 3-VP token (a Utopia = 2 Azure + a Black
 * Dragon with the printed rewards) — instead of a generic Level-VII artifact
 * bank. A designer no longer has to ALSO toggle the rule for a field they
 * explicitly placed to work.
 */
function customMapHasGrailUtopiaDesignation(plans: readonly CustomMapTilePlan[] | null): boolean {
  if (!plans) return false;
  return plans.some((plan) => {
    if (plan.viiField === "grail" || plan.viiField === "dragon_utopia") return true;
    if (plan.viiFields?.some((entry) => entry === "grail" || entry === "dragon_utopia")) return true;
    const counts = objectiveCountsInTiles([plan.tileDefId, ...(plan.oneOfTileDefIds ?? [])]);
    return counts.grail > 0 || counts.dragon_utopia > 0;
  });
}

function takeObjectiveTiles(
  pool: string[],
  counts: GrailUtopiaCounts,
  seed: string,
  limit = Number.POSITIVE_INFINITY
): string[] {
  const locations = shuffleCards(
    [
      ...Array.from({ length: counts.grail }, () => "grail"),
      ...Array.from({ length: counts.dragon_utopia }, () => "dragon_utopia")
    ],
    `${seed}#polish-grail-utopia-order`
  );
  return locations
    .slice(0, limit)
    .map((location) => takeCenterTileWith(pool, location))
    .filter((id): id is string => Boolean(id));
}

function forcedObjectiveCenterTiles(
  pool: string[],
  slots: number,
  mode: VictoryMode,
  polishRule = false,
  playerCount = 0,
  seed = "",
  alreadyPlaced: GrailUtopiaCounts = { grail: 0, dragon_utopia: 0 }
): (string | undefined)[] {
  if (slots <= 0) {
    return [];
  }
  if (polishRule) {
    const desired = polishGrailUtopiaCounts(playerCount, seed);
    const needed = {
      grail: Math.max(0, desired.grail - alreadyPlaced.grail),
      dragon_utopia: Math.max(0, desired.dragon_utopia - alreadyPlaced.dragon_utopia)
    };
    const forced: (string | undefined)[] = takeObjectiveTiles(pool, needed, seed, slots);
    while (forced.length < slots) forced.push(undefined);
    return forced;
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
    ...(options.gameMode !== undefined ? { gameMode: options.gameMode } : {}),
    ...(options.teamAssignments !== undefined ? { teamAssignments: options.teamAssignments } : {}),
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
    ...(options.unitExperience !== undefined ? { unitExperience: options.unitExperience } : {}),
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
    ...(options.tournamentObservatoryRerotate !== undefined
      ? { tournamentObservatoryRerotate: options.tournamentObservatoryRerotate }
      : {}),
    ...(options.pvpNeutralControl !== undefined ? { pvpNeutralControl: options.pvpNeutralControl } : {}),
    ...(options.manualGuardControl !== undefined ? { manualGuardControl: options.manualGuardControl } : {}),
    ...(options.startingHandMulligan !== undefined ? { startingHandMulligan: options.startingHandMulligan } : {}),
    ...(options.pvpNeutralControlMustAttack !== undefined
      ? { pvpNeutralControlMustAttack: options.pvpNeutralControlMustAttack }
      : {}),
    ...(options.houseRules !== undefined ? { houseRules: options.houseRules } : {}),
    ...(options.farTileOpening !== undefined ? { farTileOpening: options.farTileOpening } : {}),
    ...(options.farTilesPerPlayer !== undefined ? { farTilesPerPlayer: options.farTilesPerPlayer } : {}),
    ...(options.farTileBlindChoice !== undefined ? { farTileBlindChoice: options.farTileBlindChoice } : {}),
    ...(options.farTileTypeChoice !== undefined ? { farTileTypeChoice: options.farTileTypeChoice } : {}),
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
      ...(options.gameMode !== undefined ? (["gameMode"] as const) : []),
      ...(options.difficulty !== undefined ? (["difficulty"] as const) : []),
      ...(options.farTileOpening !== undefined ? (["farTileOpening"] as const) : []),
      ...(options.farTilesPerPlayer !== undefined ? (["farTilesPerPlayer"] as const) : []),
      ...(options.farTileTypeChoice !== undefined ? (["farTileTypeChoice"] as const) : []),
      ...(options.startingResources !== undefined ? (["startingResources"] as const) : []),
      ...(options.startingProduction !== undefined ? (["startingProduction"] as const) : []),
      ...(options.startingBuildings !== undefined ? (["startingBuildings"] as const) : []),
      ...(options.startingUnits !== undefined ? (["startingUnits"] as const) : []),
      ...(options.houseRules?.["no-secondary-heroes"] !== undefined
        ? (["noSecondaryHeroes"] as const)
        : []),
      ...(options.houseRules?.["free-neutral-combat-extend"] !== undefined
        ? (["freeNeutralCombatExtend"] as const)
        : [])
    ]);
    applyCustomMapPresetToOptions(
      setupOptions,
      sanitizeCustomMapPreset(setupOptions.customMapPreset),
      explicit
    );
  }
  // Same default the lobby applies: when the scenario (and caller) left
  // startingBuildings empty, stand Citadel + Mage Guild + Bronze Dwelling so
  // Diplomacy's basic recruit and town recruitment are not a silent no-op.
  // An explicit empty array from the caller still wins (options.startingBuildings
  // lands in setupOptions and is not overwritten).
  if (
    options.startingBuildings === undefined &&
    (!setupOptions.startingBuildings || setupOptions.startingBuildings.length === 0)
  ) {
    setupOptions.startingBuildings = [...DEFAULT_SETUP_STARTING_BUILDINGS];
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
  // Anime towns ship faction commanders (Astral Regent / Sword Saint) on the
  // shared WOG Commanders machinery. When either anime-town module is on — or
  // a seated player is already an anime faction — force Commanders on so the
  // dock is never empty for Fuyuki / Azure Breeze. BINH-only (legacy forces
  // wog.enabled false above unless flipped elsewhere).
  const playerConfigsForCommander =
    (options.players?.length ? options.players : DEFAULT_PLAYERS).map((p) => p.factionId);
  const animeTownsOn =
    Boolean(anime.enabled && (anime.isekaiTowns || anime.xianxiaTowns)) ||
    playerConfigsForCommander.some(
      (id) =>
        id === "fuyuki" ||
        id === "azure_breeze" ||
        id === "hidden_leaf" ||
        id === "azur_lane" ||
        id === "little_busters" ||
        id === "blue_archive" ||
        String(id) === "mgq"
    );
  if (animeTownsOn && ruleset === "binh") {
    wog = { ...wog, enabled: true, commanders: true };
  }
  // A map-objects content module (WOG New Objects / Anime map objects) forces
  // the global Field Override mechanism ON — read the RESOLVED `wog`/`anime`
  // above (designer pins already folded in) so this backstop mirrors the
  // `setGameOptions` chokepoint even for a direct build payload that ticked the
  // module but left `fieldOverrides` off/absent. Force-ON only.
  const fieldOverridesOn =
    resolveFieldOverridesEnabled(setupOptions) || mapObjectsModuleActive({ wog, anime });
  const fieldOverridePlacement = resolveFieldOverridePlacement(setupOptions);
  // Unit Experience (optional rule): three equivalent surfaces — the plain
  // lobby toggle, the WOG module and the anime module — activate ONE shared
  // engine flag, frozen onto adventure state below.
  const unitExperienceOn =
    Boolean(setupOptions.unitExperience) ||
    Boolean(wog.enabled && wog.unitExperience) ||
    Boolean(anime.enabled && anime.unitExperience);
  // Neutral Rank-Up (optional module): TWO module surfaces — the WOG toggle and
  // the anime flag — activate ONE shared engine flag, frozen onto adventure
  // state below. Default OFF ⇒ byte-identical.
  const neutralRankUpOn =
    Boolean(wog.enabled && wog.neutralRankUp) || Boolean(anime.enabled && anime.neutralRankUp);
  // Calamity Waves / Raid Bosses / the Dungeon (optional modules): TWO module
  // surfaces each — the WOG toggle and the anime flag — activate ONE shared
  // engine flag, frozen onto adventure state below. Default OFF ⇒ byte-identical.
  const monsterWavesOn =
    Boolean(wog.enabled && wog.monsterWaves) || Boolean(anime.enabled && anime.monsterWaves);
  const normalizeWaveCadence = (value: unknown): 3 | 4 | 5 | undefined =>
    value === 3 || value === 4 || value === 5 ? value : undefined;
  // Cadence precedence: designed-map override > anime (the plan's home) > WOG > 4.
  const waveCadence =
    normalizeWaveCadence(setupOptions.customMapPreset?.monsterWaves?.cadence) ??
    (anime.enabled && anime.monsterWaves ? normalizeWaveCadence(anime.waveCadence) : undefined) ??
    (wog.enabled && wog.monsterWaves ? normalizeWaveCadence(wog.waveCadence) : undefined) ??
    4;
  const raidBossesOn =
    Boolean(wog.enabled && wog.raidBosses) || Boolean(anime.enabled && anime.raidBosses);
  const dungeonOn =
    Boolean(wog.enabled && wog.dungeon) || Boolean(anime.enabled && anime.dungeon);
  const anyPveModuleOn = monsterWavesOn || raidBossesOn || dungeonOn;
  // A mod surface only controls the shared PvE settings when it actually has
  // one of those modules enabled. Anime wins ties, mirroring wave cadence.
  const animePveOn =
    anime.enabled && (anime.monsterWaves || anime.raidBosses || anime.dungeon);
  const wogPveOn =
    wog.enabled && (wog.monsterWaves || wog.raidBosses || wog.dungeon);
  const requestedPveTheme =
    setupOptions.customMapPreset?.pveTheme ??
    (animePveOn
      ? anime.pveTheme
      : wogPveOn
        ? wog.pveTheme
        : "classic");
  // Doom is an ANIME-mod theme: a WOG-only PvE game (anime off) can never mint
  // Doom armies/bosses, whether it picked "doom" or "random". A designer map
  // that explicitly authored the Doom theme keeps it (pveTheme is designer-first).
  const doomThemeAllowed = Boolean(anime.enabled) || setupOptions.customMapPreset?.pveTheme === "doom";
  const pveTheme = resolvePveEncounterTheme(requestedPveTheme, seed, doomThemeAllowed);
  const pressureCandidate =
    setupOptions.customMapPreset?.monsterWaves?.pressure ??
    (anime.enabled && anime.monsterWaves
      ? anime.wavePressure
      : wog.enabled && wog.monsterWaves
        ? wog.wavePressure
        : undefined);
  const wavePressure = pressureCandidate === "brutal" ? "brutal" : "standard";
  const defeatLimitCandidate =
    setupOptions.customMapPreset?.monsterWaves?.defeatLimit ??
    (anime.enabled && anime.monsterWaves
      ? anime.waveDefeatLimit
      : wog.enabled && wog.monsterWaves
        ? wog.waveDefeatLimit
        : undefined);
  const waveDefeatLimit =
    defeatLimitCandidate === 2 || defeatLimitCandidate === 3 ? defeatLimitCandidate : 0;
  const raidBossSpawnCandidate =
    setupOptions.customMapPreset?.raidBosses?.spawnRound ??
    (anime.enabled && anime.raidBosses
      ? anime.raidBossSpawnRound
      : wog.enabled && wog.raidBosses
        ? wog.raidBossSpawnRound
        : undefined);
  const raidBossSpawnRound =
    typeof raidBossSpawnCandidate === "number" && Number.isFinite(raidBossSpawnCandidate)
      ? Math.max(2, Math.min(30, Math.round(raidBossSpawnCandidate)))
      : 5;
  const dungeonDepthCandidate =
    setupOptions.customMapPreset?.dungeon?.maxFloor ??
    (anime.enabled && anime.dungeon
      ? anime.dungeonDepth
      : wog.enabled && wog.dungeon
        ? wog.dungeonDepth
        : undefined);
  const dungeonDepth = dungeonDepthCandidate === 5 ? 5 : 10;
  const dungeonDescentCandidate =
    setupOptions.customMapPreset?.dungeon?.descentCost ??
    (anime.enabled && anime.dungeon
      ? anime.dungeonDescentCost
      : wog.enabled && wog.dungeon
        ? wog.dungeonDescentCost
        : undefined);
  const dungeonDescentCost =
    dungeonDescentCandidate === 0 || dungeonDescentCandidate === 2
      ? dungeonDescentCandidate
      : 1;
  let victoryMode: VictoryMode = setupOptions.victoryMode ?? "conquest";
  const polishGrailUtopiaOn = houseRules["polish-grail-utopia"];
  const pvpTroopLoss: PvpTroopLoss = setupOptions.pvpTroopLoss ?? "normal";
  const dragonUtopiaGuards: DragonUtopiaGuards = setupOptions.dragonUtopiaGuards ?? "by-difficulty";
  const playerConfigs = (options.players?.length ? options.players : DEFAULT_PLAYERS).slice(
    0,
    Math.min(scenario.maxPlayers, scenario.layout.starts.length)
  );
  const customMap = setupOptions.customMap?.length
    ? validateCustomMapPlan(setupOptions.customMap, scenario, playerConfigs.length).accepted
    : null;
  const soloOpponentLimit = Math.min(scenario.maxPlayers, scenario.layout.starts.length) - 1;
  // Resolve authored solo roles only for an actual single-player session. The
  // same tile plan keeps ordinary seat-order placement in multiplayer.
  const authoredSoloDeployment =
    options.sessionMode === "single-player"
      ? singlePlayerMapDeployment(customMap, soloOpponentLimit)
      : null;
  // WHO GOES FIRST. Default "random" = the rulebook setup-step-22 roll below.
  // "manual" (with a valid full permutation) uses the host's order verbatim and
  // skips the roll, its seed and its ceremony entirely; an INVALID manual list
  // falls back to the random roll with a feed note rather than crashing or
  // silently seating a partial order.
  const manualOrder = resolveManualPlayerOrder(
    playerConfigs.map((config) => config.id),
    options.playerOrderMode,
    options.manualPlayerOrder
  );
  const manualOrderRejected = options.playerOrderMode === "manual" && !manualOrder;
  // Preview without publishing: homes follow the eventual game order, while
  // the authoritative roll remains hidden until starting bonuses resolve.
  const rollFirstPlayerOn = options.rollFirstPlayer !== false && !manualOrder;
  const openingFirstPlayerSeed = rollFirstPlayerOn ? bakeEntropy(`${seed}#first-player`) : undefined;
  const openingRoll = rollFirstPlayerOn
    ? calculateFirstPlayerRoll(
        playerConfigs.map((config) => ({ playerId: config.id, name: config.name })),
        openingFirstPlayerSeed!
      )
    : null;
  // Manual order decides the map positions too — position 1 is the first
  // player, exactly as the rolled winner would be.
  const startingPositionOrder =
    manualOrder ??
    gameOrderForFirstPlayerRoll(
      playerConfigs.map((config) => config.id),
      openingRoll
    );
  const startingPositionIndex = new Map(
    startingPositionOrder.map((playerId, index) => [playerId, index] as const)
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
  // PvP Neutral Control (optional, any table with at least two seats): the next
  // live seat clockwise plays the Neutral units in every combat. This includes
  // one-human-plus-computer tables; a true one-seat table keeps the Neutral AI.
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
  const mergedWinConditionPreset = applyLobbyCustomWinConditions(
    applyLobbyVictoryPoints(
      sanitizeCustomMapPreset(setupOptions.customMapPreset ?? null) ?? null,
      setupOptions
    ),
    setupOptions
  );
  // MODULE DEPENDENCY (co-op step 3): a `slay-raid-boss` condition can NEVER
  // fire with no raid-boss module on — no lair is ever placed, so nothing can
  // stamp `slainBy`. Drop it here rather than leave a silent no-op objective on
  // the banner, and announce the drop below (the MAP_SECRET_FEATURE_FALLBACK
  // pattern: a soft-failed authored guarantee is a public feed line, never a
  // blocked start).
  const droppedRaidBossWinCondition =
    !raidBossesOn &&
    (mergedWinConditionPreset?.customWinConditions ?? []).some(
      (condition) => condition.kind === "slay-raid-boss"
    );
  const resolvedMapPreset = droppedRaidBossWinCondition
    ? (() => {
        const kept = (mergedWinConditionPreset?.customWinConditions ?? []).filter(
          (condition) => condition.kind !== "slay-raid-boss"
        );
        const next: CustomMapPreset = { ...(mergedWinConditionPreset ?? {}) };
        if (kept.length > 0) {
          next.customWinConditions = kept;
        } else {
          delete next.customWinConditions;
        }
        return customMapPresetIsActive(next) ? next : null;
      })()
    : mergedWinConditionPreset;
  // A designer map that PLACES Grail/Dragon Utopia fields auto-activates the
  // Grail & Dragon Utopia field rules (dig / XP-only clear / normal Level-VII
  // fight / 2-Azure guards, Utopia = +1 Black Dragon), so a placed Grail is a
  // real Grail, never a generic Level-VII artifact bank — no separate
  // lobby/editor toggle required. EXCLUDED in classic Grail-VICTORY mode, whose
  // grail is the win objective dug only after visiting Obelisks (a distinct
  // feature). This only flips `hiddenGrailUtopia`; it does NOT trigger the house
  // rule's extra per-seat objective overflow (gated on `polishGrailUtopiaOn`),
  // so the designer's explicit placement stands.
  let mapPreset =
    customMapHasGrailUtopiaDesignation(customMap) &&
    victoryMode !== "grail" &&
    !resolvedMapPreset?.objectives?.hiddenGrailUtopia
      ? {
          ...(resolvedMapPreset ?? {}),
          objectives: { ...(resolvedMapPreset?.objectives ?? {}), hiddenGrailUtopia: true }
        }
      : resolvedMapPreset;

  // Direct engine construction (campaigns/tests/imported saves) must enforce
  // the same invariant as the lobby: a map that authors Hidden Grail/Utopia
  // fields cannot also inject a second scenario objective preset.
  if (victoryMode !== "conquest" && mapHasAuthoredGrailOrUtopia(customMap, mapPreset)) {
    victoryMode = "conquest";
    if (mapPreset?.victoryMode && mapPreset.victoryMode !== "conquest") {
      const cleaned = { ...mapPreset };
      delete cleaned.victoryMode;
      mapPreset = customMapPresetIsActive(cleaned) ? cleaned : null;
    }
  }

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
    nearTilePool: [],
    // Blind Ⅱ–Ⅲ tile choice (default OFF): a supply opening first asks for a
    // blind gold/valuables/no-preference pick that filters the random draw.
    ...(setupOptions.farTileBlindChoice ? { farTileBlindChoice: true } : {}),
    // Ⅱ–Ⅲ tile TYPE choice (default OFF): a supply opening first asks WHICH
    // KIND of tile to draw. The designer's allowed-kind list is map CONTENT
    // (not a lobby option), so it is frozen straight from the preset — absent
    // or empty = all four kinds — and only read while the rule itself is on.
    ...(setupOptions.farTileTypeChoice ? { farTileTypeChoice: true } : {}),
    ...(setupOptions.farTileTypeChoice &&
    (setupOptions.customMapPreset?.farTileTypeChoices?.length ?? 0) > 0
      ? { farTileTypeChoices: [...(setupOptions.customMapPreset?.farTileTypeChoices ?? [])] }
      : {}),
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
    tournamentObservatoryRerotate: tournamentRules.observatoryRerotate,
    pvpNeutralControl: pvpNeutralControlOn,
    pvpNeutralControlMustAttack: pvpNeutralControlMustAttackOn,
    // Manual guard control (default OFF): frozen so every neutral-control read
    // checks one plain boolean. Available in solo/single-player too (the
    // computer-fighter gate lives in manualGuardControllerId).
    ...(setupOptions.manualGuardControl ? { manualGuardControl: true } : {}),
    // First-round opening Mulligan (default ON): after R1 fill-to-limit, arm
    // optional OPENING_HAND_MULLIGAN (discard 0–N / redraw). OFF = fill only
    // (ditch under-limit bonus artifact(s), draw to 4). Absent = ON for legacy.
    startingHandMulligan: setupOptions.startingHandMulligan !== false,
    // OPTIONAL Undo mode (debug/testing): frozen here so the SERVER action
    // transaction (both backends) can read it and keep a bounded per-room undo
    // stack. Default OFF — no history kept and UNDO_MOVE rejected. Unlike the
    // multiplayer-only options above, undo is available in solo/single-player
    // too (it is a testing aid, not a competitive rule).
    ...(setupOptions.undoMoves ? { undoMoves: true } : {}),
    // Unit Experience (optional rule): frozen so every engine read (XP awards,
    // rank folds, DRILL_UNIT) checks one plain boolean. Default OFF.
    ...(unitExperienceOn ? { unitExperience: true } : {}),
    // Neutral Rank-Up (optional module): frozen so every engine read
    // (neutralRankUpActive, the mint-seam ROUNDS fold, the bank STACKS fold)
    // checks one plain boolean. Default OFF.
    ...(neutralRankUpOn ? { neutralRankUp: true } : {}),
    // Calamity Waves (optional module): presence = ON; the cadence is frozen
    // here so every schedule read is pure in the round number. Default OFF.
    ...(monsterWavesOn
      ? {
          monsterWaves: {
            cadence: waveCadence,
            pressure: wavePressure,
            defeatLimit: waveDefeatLimit,
            gateFieldId: null
          }
        }
      : {}),
    ...(anyPveModuleOn ? { pveTheme } : {}),
    // Raid Bosses (optional module): presence = ON; entries appear when the
    // scheduled spawn (or a designer lair) places a boss. Default OFF.
    ...(raidBossesOn ? { raidBosses: {} } : {}),
    ...(raidBossesOn && raidBossSpawnRound !== 5 ? { raidBossSpawnRound } : {}),
    // The Dungeon (optional module): presence = ON; fieldId stays null until
    // the first Near-band Blocked Field reveal carves the site. Default OFF.
    ...(dungeonOn
      ? {
          dungeonSite: {
            fieldId: null,
            ...(dungeonDepth !== 10 ? { maxFloor: dungeonDepth } : {}),
            ...(dungeonDescentCost !== 1 ? { descentCost: dungeonDescentCost } : {}),
            ...(setupOptions.customMapPreset?.dungeon?.floorBosses
              ? { floorBosses: setupOptions.customMapPreset.dungeon.floorBosses }
              : {})
          }
        }
      : {}),
    houseRules,
    chooseGatePlacement: chooseGatePlacementOn,
    ...(victoryMode === "grail" || polishGrailUtopiaOn || mapPreset?.objectives?.hiddenGrailUtopia
      ? { grail: { status: "uncollected" as const } }
      : {}),
    // Grail Hunt and Dragon Hunt both track the "defeat every enemy hero" path.
    ...(victoryModeCountsHeroDefeats(victoryMode) ? { heroDefeats: {} } : {}),
    pendingTileChoice: null,
    ...(openingFirstPlayerSeed ? { openingFirstPlayerSeed } : {}),
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
  // Ⅱ–Ⅲ Far pool never carries an Obelisk-bearing tile (house rule: Obelisks
  // live on Ⅳ–Ⅴ Near tiles). Factory &F1 and any future far+obelisk tile is
  // stripped here so random draws / the supply never spring an Obelisk on a
  // Far ring. Designer exact pins of such a tile still work (they bypass the pool).
  const farPool = shuffleCards(tilePoolIds("far", tileContent), `${seed}#pool#far`).filter((tileDefId) => {
    const def = allTileDefinitions[tileDefId];
    return !def?.fields.some((field) => field.location === "obelisk");
  });
  // Sea / Subterranean also respect the active content filter (default = all).
  const seaPool = shuffleCards(tilePoolIds("sea", tileContent), `${seed}#pool#sea`);
  const subterraneanPool = shuffleCards(
    tilePoolIds("subterranean", tileContent),
    `${seed}#pool#subterranean`
  );
  // If a compact layout has fewer placed Near/Center slots than the Polish
  // objective count, the remaining objective tiles become the first hidden Far
  // supply draws. They are still randomly assigned/placed during play instead
  // of being silently dropped from a 3- or 4-player game.
  let polishObjectiveFarSupply: string[] = [];

  const playerIds = playerConfigs.map((config) => config.id);
  const fixedTeamNumbers =
    mapPreset?.fixedTeams?.length === playerIds.length
      ? Object.fromEntries(playerIds.map((playerId, index) => [playerId, mapPreset.fixedTeams![index]]))
      : undefined;
  const explicitTeams = fixedTeamNumbers ?? sanitizeTeamAssignments(setupOptions.teamAssignments, playerIds);
  if (explicitTeams && playerConfigs.length > 1 && new Set(Object.values(explicitTeams)).size < 2) {
    throw new Error("Choose at least two teams before starting the adventure.");
  }
  const state: GameState = {
    id: "adventure-game",
    seed,
    mode: "adventure",
    ...(options.sessionMode ? { sessionMode: options.sessionMode } : {}),
    ...(configuredControllers ? { controllers: configuredControllers } : {}),
    ...(!explicitTeams && options.sessionMode === "single-player" && mapPreset?.computerDiplomacy === "allied"
      ? {
          playerTeams: Object.fromEntries(
            playerConfigs
              .filter((config) => configuredControllers?.[config.id]?.kind === "computer")
              .map((config) => [config.id, "solo-computers"])
          )
        }
      : {}),
    // CO-OP (step 1): the frozen mode is a root field so the server pump, the
    // victory objectives, the match report and the UI all read ONE value; the
    // alliance itself is expressed as ordinary `playerTeams`, so every existing
    // `playersAreAllied` gate applies with no per-mode branching. Spread AFTER
    // the single-player block so an (impossible in practice) overlap resolves
    // to the explicit co-op teams. Absent gameMode ⇒ neither key is written.
    ...(setupOptions.gameMode === "coop" ? { gameMode: "coop" as const } : {}),
    ...(explicitTeams
      ? {
          playerTeams: Object.fromEntries(
            Object.entries(explicitTeams).map(([playerId, team]) => [playerId, `setup-team-${team}`])
          )
        }
      : setupOptions.gameMode === "coop"
      ? {
          playerTeams: Object.fromEntries(
            playerConfigs.map((config) => [
              config.id,
              configuredControllers?.[config.id]?.kind === "computer" ? COOP_AI_TEAM_ID : COOP_HUMAN_TEAM_ID
            ])
          )
        }
      : {}),
    ruleset,
    wog,
    anime,
    round: 1,
    phase: "player-turn",
    // Manual player order is live from the first frame (no roll will rotate it
    // later); random order keeps plain seat order until the ceremony commits.
    activePlayerId: manualOrder?.[0] ?? playerConfigs[0].id,
    priorityPlayerId: null,
    turnOrder: manualOrder ?? playerConfigs.map((config) => config.id),
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
        wog.enabled && wog.artifacts && wog.commanders,
        animeModuleEnabled({ anime }, "equipment"),
        houseRules["torso-of-legion-major"],
        // Community Balance Change: the sheet moves the Eversmoking Ring of
        // Sulfur from MINOR to MAJOR, so the pack forces the Major DECK exactly
        // as it forces the Major tier READ (`effectiveArtifactTier`). Composed
        // with the BINH toggle — Major whenever EITHER is on.
        houseRules["eversmoking-ring-of-sulfur-major"] || houseRules["community-card-balance"]
      ),
      ...makeNeutralDecks(seed, wog, anime),
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

  // Seat positions: the designer's own Ⅰ tiles in placement order when it
  // drew any, otherwise the scenario sheet's fixed seats. Each seat falls back
  // to the scenario seat if the design left it unplaced.
  const designerStartPlans = (customMap ?? []).filter((plan) => plan.group === "starting");
  const designerStartCenters = designerStartPlans.map((plan) => ({ row: plan.row, col: plan.col }));
  const startCenterFor = (index: number): HexCoord =>
    designerStartCenters[index] ?? scenario.layout.starts[index];
  const authoredStartByPlayer = new Map<PlayerId, CustomMapTilePlan>();
  // CO-OP map-authored starting positions (step 5). Only a CO-OP build reads
  // `plan.coopSeat` — a clash table ignores the roles entirely, and a map with
  // no roles anywhere returns null so seating is byte-identical to before.
  // A table the authored roles cannot seat THROWS with the structured reason
  // rather than silently dropping a human onto a computer-only position; the
  // lobby refuses the same combination earlier, at the start check.
  if (setupOptions.gameMode === "coop" && !authoredSoloDeployment) {
    const coopHumanConfigs = playerConfigs.filter(
      (config) => configuredControllers?.[config.id]?.kind !== "computer"
    );
    const coopComputerConfigs = playerConfigs.filter(
      (config) => configuredControllers?.[config.id]?.kind === "computer"
    );
    const coop = coopMapDeployment(customMap, coopHumanConfigs.length, coopComputerConfigs.length);
    if (coop && !coop.ok) {
      throw new Error(coop.reason);
    }
    if (coop?.ok) {
      coopHumanConfigs.forEach((config, index) => {
        const plan = coop.deployment.humans[index];
        if (plan) {
          authoredStartByPlayer.set(config.id, plan);
        }
      });
      coopComputerConfigs.forEach((config, index) => {
        const plan = coop.deployment.computers[index];
        if (plan) {
          authoredStartByPlayer.set(config.id, plan);
        }
      });
    }
  }
  if (authoredSoloDeployment) {
    const humanConfig = playerConfigs.find(
      (config) => configuredControllers?.[config.id]?.kind !== "computer"
    );
    if (humanConfig) {
      authoredStartByPlayer.set(humanConfig.id, authoredSoloDeployment.human);
    }
    const computerConfigs = playerConfigs.filter(
      (config) => configuredControllers?.[config.id]?.kind === "computer"
    );
    computerConfigs.forEach((config, index) => {
      const plan = authoredSoloDeployment.computers[index];
      if (plan) {
        authoredStartByPlayer.set(config.id, plan);
      }
    });

    // Per-enemy custom STARTING ARMY: a designer may hand this AI seat an exact
    // army (few / pack / neutral) via the same guard vocabulary. Resolve it
    // deterministically and REPLACE the seat's default faction-tier army. A spec
    // that resolves to no valid body is skipped, so a bad authored value can
    // never blank out a seat. Stamped experience only bites when the Unit
    // Experience rule is on (a no-op fold otherwise).
    for (const config of playerConfigs) {
      const solo = authoredStartByPlayer.get(config.id)?.singlePlayer;
      if (!solo?.army) continue;
      const player = state.players[config.id];
      if (!player) continue;
      const armyRng = createSeededRandom(`${seed}#solo-army#${config.id}`, { salt: false });
      const resolved = resolveStartingArmyFromGuardSpec(solo.army, armyRng, anime);
      if (resolved.length === 0) continue;
      const xp = solo.armyExperience ?? 0;
      player.army = [];
      player.startingArmy = [];
      for (const { unitDefId, side } of resolved) {
        const unit = addArmyUnit(player, unitDefId, side);
        if (xp > 0) {
          unit.experience = xp;
        }
        player.startingArmy.push({ unitDefId, side });
      }
    }
  }

  // Starting tiles: position from the seat (designer or scenario), tile fixed
  // by the chosen faction — no rotation choice. Towns and main heroes go on
  // the tile's center field.
  playerConfigs.forEach((config, seatIndex) => {
    const index = startingPositionIndex.get(config.id) ?? seatIndex;
    const startTileId = startingTileByFaction[config.factionId] ?? "S1";
    const authoredStart = authoredStartByPlayer.get(config.id);
    const center = authoredStart
      ? { row: authoredStart.row, col: authoredStart.col }
      : startCenterFor(index);
    const startPlan = authoredStart ?? designerStartPlans[index];
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
        spaceId: townFieldId,
        ...(config.factionId === "heavenly_demon"
          ? { equipment: { accessory: EQUIPMENT_IDS.soulBanner } }
          : {})
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

  // Authored campaign pressure: some scenarios openly grant computer opponents
  // a small war chest. It is map-local and visible in the briefing/condition
  // summary, so single-player difficulty never hides an unexplained rules cheat.
  const computerBonus = mapPreset?.computerStartingBonus;
  if (state.sessionMode === "single-player") {
    for (const config of playerConfigs) {
      if (controllerOf(state, config.id).kind !== "computer") continue;
      const personalBonus = authoredStartByPlayer.get(config.id)?.singlePlayer?.bonus;
      const bonus = {
        gold: (computerBonus?.gold ?? 0) + (personalBonus?.gold ?? 0),
        buildingMaterials:
          (computerBonus?.buildingMaterials ?? 0) + (personalBonus?.buildingMaterials ?? 0),
        valuables: (computerBonus?.valuables ?? 0) + (personalBonus?.valuables ?? 0)
      };
      if (bonus.gold <= 0 && bonus.buildingMaterials <= 0 && bonus.valuables <= 0) continue;
      const resources = state.players[config.id]?.resources;
      if (!resources) continue;
      resources.gold = Math.min(99, resources.gold + bonus.gold);
      resources.buildingMaterials = Math.min(99, resources.buildingMaterials + bonus.buildingMaterials);
      resources.valuables = Math.min(99, resources.valuables + bonus.valuables);
      appendEvent(state, {
        type: "MAP_PRESET_TRIGGERED",
        message: `${state.players[config.id]?.name ?? config.id} receives the single-player map war chest (+${bonus.gold} gold, +${bonus.buildingMaterials} materials, +${bonus.valuables} valuables).`
      });
    }
  }

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

    // A random draw for a slot's OWN group / band — the shared fallback used
    // whenever a slot's designed identity cannot be honoured (an exhausted
    // filtered pool, or a "one of" list whose every candidate is already on the
    // map). Popping keeps every pool strictly without-replacement.
    const popGroupTile = (plan: CustomMapTilePlan): string | undefined =>
      plan.group === "sea"
        ? popSeaTile(plan.seaBand)
        : plan.group === "subterranean"
          ? popSubTile(plan.subBand)
          : pools[plan.group]?.pop();

    const randomViiAssignments = balancedRandomViiAssignments(customMap, seed);
    const effectiveViiPlan = (plan: CustomMapTilePlan): CustomMapTilePlan => {
      const designation = randomViiAssignments.get(plan);
      return designation
        ? { ...plan, viiField: designation, viiFields: undefined, playerViiPick: undefined }
        : plan;
    };

    /**
     * The centre tile an UNPINNED Ⅶ Grail / Dragon Utopia designation should
     * draw: one whose OWN printed Ⅶ objective already is that designation.
     *
     * REPORTED BUG 2026-08-09 ("2nd tile - Grail - was mix of utopia and grail"):
     * a designated slot used to pop an arbitrary centre tile, so the hidden
     * Grail & Dragon Utopia package regularly put a "grail" identity on C1 (which
     * PRINTS a Dragon Utopia), on C5 (a Random Town) or on &C1 (an Airship Yard).
     * `materializeTileFields` then forced the FIELD to the designation while the
     * board kept showing the printed tile — the hex pictured one objective and
     * played as another, and the rotation preview (which draws the printed field
     * def) agreed with the picture, not the rules. Matching the tile makes the
     * FORCE override a no-op, so art, printed field, guards and rewards agree.
     *
     * LIMITS, both deliberate: an EXPLICIT `tileDefId` / "one of" pin is never
     * swapped (an authored mismatch is the designer's choice, and the override
     * still wins), and only `grail` / `dragon_utopia` are matched — `town` and
     * `settlement` designations are printed on many centre tiles and are left to
     * the ordinary draw. When the pool holds no matching tile left the draw falls
     * back to today's behaviour and the override forces the field as before.
     */
    const designationCenterTile = (plan: CustomMapTilePlan): string | undefined => {
      if (plan.group !== "center" || effectiveExactTileDefId(plan)) {
        return undefined;
      }
      const designation = plan.viiField;
      if (designation !== "grail" && designation !== "dragon_utopia") {
        return undefined;
      }
      return takeCenterTileWith(centerPool, designation);
    };

    // "One of these tiles" (map designer): a slot may name a LIST of candidate
    // tile ids instead of one exact `tileDefId`. Every such slot is resolved to
    // one concrete id ONCE, up front, and then treated exactly like an exact pin
    // everywhere below (pool removal, face-up placement, face-down secret pin).
    //
    // THE PHYSICAL BOARD HAS ONE COPY OF EVERY TILE. Each list pick therefore
    // skips ids already CLAIMED — by an explicit pin anywhere on the map or by an
    // earlier list — because two slots sharing one list (the natural way to
    // author a symmetric map) used to resolve independently and could both land
    // on, say, C1, putting the same tile on the board twice (reported bug).
    // The per-slot seed and the shuffled order are unchanged, so a map whose
    // lists do not collide draws exactly the tiles it always did.
    //
    // DELIBERATE EXCEPTION: two slots that EXPLICITLY pin the same `tileDefId`
    // keep doing so. That is an authored duplicate the designer can see and the
    // plan validator has always allowed; silently rewriting one of them would
    // change existing designed maps. Only RANDOM picks are de-duplicated here.
    const claimedTileDefIds = new Set<string>();
    for (const plan of customMap) {
      if (plan.group !== "starting" && plan.tileDefId && allTileDefinitions[plan.tileDefId]) {
        claimedTileDefIds.add(plan.tileDefId);
      }
    }
    const oneOfPick = new Map<CustomMapTilePlan, string>();
    for (const plan of customMap) {
      if (plan.group === "starting" || plan.tileDefId) {
        continue;
      }
      const choices = (plan.oneOfTileDefIds ?? []).filter((id) => Boolean(allTileDefinitions[id]));
      if (choices.length === 0) {
        continue;
      }
      const ordered = shuffleCards(choices, `${seed}#tilechoice#${plan.row}#${plan.col}`);
      // A random Grail/Utopia one-of slot follows its BALANCED pool assignment:
      // prefer a candidate whose printed Ⅶ objective IS the assigned kind, so
      // art and field agree. When every matching candidate is already claimed
      // the ordinary pick stands and the viiField FORCE below still wins.
      const assignment = randomViiAssignments.get(plan);
      const printsAssignment = (id: string): boolean =>
        Boolean(
          assignment &&
            allTileDefinitions[id]?.fields.some(
              (fieldDef) => fieldDef.difficulty === 7 && fieldDef.location === assignment
            )
        );
      const preferred = assignment
        ? [...ordered.filter(printsAssignment), ...ordered.filter((id) => !printsAssignment(id))]
        : ordered;
      const pick = preferred.find((id) => !claimedTileDefIds.has(id));
      if (!pick) {
        // Graceful exhaustion: every candidate is already on the map, so this
        // slot falls back to an ordinary random draw of its own group (a
        // face-down slot keeps any secret-landmark filter it also carries).
        // Never a duplicate.
        appendEvent(state, {
          type: "EVENT_NOTE",
          message: `Map design: every tile in the “one of these tiles” list for the ${plan.group} slot at ${plan.row},${plan.col} is already placed elsewhere — that slot draws a random ${plan.group} tile instead (no tile can be placed twice).`
        });
        continue;
      }
      claimedTileDefIds.add(pick);
      oneOfPick.set(plan, pick);
    }
    const effectiveExactTileDefId = (plan: CustomMapTilePlan): string | undefined => {
      if (plan.tileDefId) {
        return plan.tileDefId;
      }
      if (plan.group === "starting") {
        return undefined;
      }
      return oneOfPick.get(plan);
    };

    // Designed tiles that pin a specific id (face-up OR exact secret face-down),
    // including a resolved "one of" pick, never also hide in a random / feature
    // face-down pool draw.
    for (const plan of customMap) {
      const pinnedId = effectiveExactTileDefId(plan);
      if (pinnedId) {
        for (const pool of Object.values(pools)) {
          const index = pool.indexOf(pinnedId);
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
        plan.faceDown && plan.group === "center" && !effectiveExactTileDefId(plan) && !plan.secretFeature
    ).length;
    const authoredObjectives: GrailUtopiaCounts = { grail: 0, dragon_utopia: 0 };
    for (const plan of customMap) {
      const designated = effectiveViiPlan(plan).viiField;
      if (designated === "grail" || designated === "dragon_utopia") {
        authoredObjectives[designated] += 1;
        continue;
      }
      const pinnedId = effectiveExactTileDefId(plan);
      const counts = objectiveCountsInTiles([pinnedId]);
      authoredObjectives.grail += counts.grail;
      authoredObjectives.dragon_utopia += counts.dragon_utopia;
    }
    const forcedCenters = forcedObjectiveCenterTiles(
      centerPool,
      unpinnedFaceDownCenterSlots,
      victoryMode,
      polishGrailUtopiaOn,
      playerConfigs.length,
      seed,
      authoredObjectives
    );
    let forcedCenterIndex = 0;

    // Holy Grail: also force leftover Grail tiles (when fewer than 2 Center
    // slots took them) and enough Obelisks (designer presets count) onto
    // unpinned face-down Near/Far draws.
    const forcedObjectiveCounts = objectiveCountsInTiles(forcedCenters);
    const polishDesired = polishGrailUtopiaCounts(playerConfigs.length, seed);
    const polishObjectiveOverflow = polishGrailUtopiaOn
      ? takeObjectiveTiles(
          centerPool,
          {
            grail: Math.max(0, polishDesired.grail - authoredObjectives.grail - forcedObjectiveCounts.grail),
            dragon_utopia: Math.max(
              0,
              polishDesired.dragon_utopia - authoredObjectives.dragon_utopia - forcedObjectiveCounts.dragon_utopia
            )
          },
          `${seed}#overflow`
        )
      : [];
    const grailOverflow: string[] =
      victoryMode === "grail" && !polishGrailUtopiaOn
        ? takeRemainingGrailTiles(centerPool, 2 - forcedCenters.filter(Boolean).length)
        : [];
    // Count designer-guaranteed Obelisks; pull the shortfall from Near/Far pools.
    const obelisksStillNeeded =
      victoryMode === "grail" && !polishGrailUtopiaOn
        ? Math.max(0, 2 - countGuaranteedObelisks(customMap))
        : 0;
    const forcedObelisks: string[] =
      obelisksStillNeeded > 0 ? takeObeliskTiles({ near: nearPool, far: farPool }, obelisksStillNeeded) : [];
    // Obelisks first so dig unlock is completable on tight layouts (e.g. skirmish
    // has only 2 Near slots); the second Grail fills any leftover Near/Far slots.
    const grailNearFarOverflow = [...forcedObelisks, ...grailOverflow, ...polishObjectiveOverflow];
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
      // Folded allowed-landmark set (multi-value `secretFeatures` + legacy
      // single `secretFeature`) and exclude bans (`excludeFeatures`). Empty
      // allowed = pure-random (still honouring excludes). Exact pins ignore both.
      const allowedFeatures = planAllowedSecretFeatures(plan);
      const excludedFeatures = planExcludedSecretFeatures(plan);
      if (plan.faceDown) {
        let tileDefId: string | undefined;
        // Exact pin (or a resolved "one of" pick) wins over include/exclude.
        const pinnedId = effectiveExactTileDefId(plan);
        if (pinnedId && allTileDefinitions[pinnedId]) {
          tileDefId = pinnedId;
        } else if (allowedFeatures.length > 0 || excludedFeatures.length > 0) {
          // Include and/or exclude: pop the first pool tile that matches the
          // include OR-set (if any) AND none of the banned landmarks. Exclude
          // is real — "no Obelisk" never lands an obelisk tile on the first try.
          const pool = pools[plan.group];
          if (pool) {
            tileDefId = popTileMatchingFilters(pool, allowedFeatures, excludedFeatures, {
              group: plan.group,
              seaBand: plan.seaBand,
              subBand: plan.subBand
            });
          }
          if (!tileDefId) {
            // Soft fallback only when the filtered pool is empty.
            tileDefId = popGroupTile(plan);
            if (tileDefId) {
              const label =
                allowedFeatures.length > 0
                  ? `Secret “${allowedFeatures.map(secretFeatureFullLabel).join(" / ")}”`
                  : `Exclude “${excludedFeatures.map(secretFeatureFullLabel).join(" / ")}”`;
              appendEvent(state, {
                type: "MAP_SECRET_FEATURE_FALLBACK",
                feature: allowedFeatures[0] ?? excludedFeatures[0],
                group: plan.group,
                message: `${label} could not be fulfilled on a ${plan.group} slot — no matching tile left in the pool. Drew a random tile instead.`
              });
            }
          }
        } else if (plan.group === "sea") {
          tileDefId = popSeaTile(plan.seaBand);
        } else if (plan.group === "subterranean") {
          tileDefId = popSubTile(plan.subBand);
        } else if (plan.group === "center") {
          // A Ⅶ Grail / Dragon Utopia designation must land on a tile that
          // PRINTS that objective (see designationCenterTile) — the hidden
          // package assigns identities to slots, the tile draw follows them.
          // Holy Grail otherwise fills up to two unpinned face-down Center slots
          // with Grail dig sites; further Center slots stay a random draw.
          tileDefId =
            designationCenterTile(effectiveViiPlan(plan)) ??
            forcedCenters[forcedCenterIndex++] ??
            centerPool.pop();
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
          if (pinnedId) {
            tile.tileIdentityLocked = true;
          } else if (
            plan.group === "subterranean" &&
            allowedFeatures.length === 0 &&
            excludedFeatures.length === 0
          ) {
            tile.gateTileChoiceEligible = true;
          }
          applyDesignedBorders(tile, plan);
          applyDesignedUnderground(tile, plan);
          applyDesignedViiField(adventure, tile, effectiveViiPlan(plan));
          applyDesignedSettlement(adventure, tile, plan);
          if (excludedFeatures.length > 0) {
            tile.excludeFeatures = [...excludedFeatures];
          }
          if (planTokens(plan).length > 0) {
            plannedTokens.push({ plan, tile });
          }
          if (planFieldOverrides(plan).length > 0) {
            plannedFieldOverrides.push({ plan, tile });
          }
        }
      } else {
        // Face-up: an exact `tileDefId` or a resolved "one of" random pick.
        // NOTE: a FACE-UP slot always names its tile — validateCustomMapPlan
        // refuses one that does not ("pick a tile for the face-up slot") — and an
        // explicit pin is deliberately never swapped for its Ⅶ designation, so
        // the designation-matched draw below applies to face-DOWN slots only.
        let faceUpId = effectiveExactTileDefId(plan);
        if (!faceUpId && (plan.oneOfTileDefIds?.length ?? 0) > 0) {
          // Its whole "one of" list is already on the map (note emitted above).
          // A face-up slot must still SHOW a tile, so draw a random one of its
          // own group rather than leaving a hole in the board.
          faceUpId = popGroupTile(plan);
        }
        if (faceUpId && allTileDefinitions[faceUpId]) {
          const tile = instantiateTile(adventure, faceUpId, center, plan.rotation ?? 0, false);
          applyDesignedBorders(tile, plan);
          applyDesignedUnderground(tile, plan);
          applyDesignedViiField(adventure, tile, effectiveViiPlan(plan));
          applyDesignedSettlement(adventure, tile, plan);
          if (planTokens(plan).length > 0) {
            plannedTokens.push({ plan, tile });
          }
          if (planFieldOverrides(plan).length > 0) {
            plannedFieldOverrides.push({ plan, tile });
          }
        }
      }
    }

    if (polishGrailUtopiaOn && grailNearFarIndex < grailNearFarOverflow.length) {
      polishObjectiveFarSupply = grailNearFarOverflow.slice(grailNearFarIndex);
    }

    applyCustomMapTokens(adventure, plannedTokens);

    // GLOBAL Field Overrides (designer pins + pool on remaining face-down
    // Far/Near/Center). Anime only supplies object kinds — auto-enabled above
    // when pins need anime content. Feature off drops pins with a note.
    const fieldOverrideProblems = applyCustomMapFieldOverrides(adventure, plannedFieldOverrides, {
      enabled: fieldOverridesOn,
      kindAllowed: (kind) => fieldOverrideKindAllowedForState(state, kind)
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
        playerConfigs.map((_, index) => ({ ...startCenterFor(index) }))
      );
      applyCustomMapObjects(adventure, accepted);
    }

    // Designer Subterranean Gate links → seed the gate plans that the carve below
    // (recomputeSubterraneanGates) honours. Each cavern link resolves to the two
    // tile instance ids by their placed centres; a `designed` plan bypasses
    // one-gate-per-tile so a cavern linked to several Surface tiles hosts one gate
    // per link. Links to a tile that never instantiated (a starved pool) drop out.
    //
    // A designed link connects two TILES, not two fixed FIELDS (USER RULE): the
    // exact gate/entrance hex is chosen by the revealing player at play time
    // through the pick-on-reveal chooser (`planGateChoiceForReveal`), so the
    // editor-drawn `gateHex`/`entranceHex` are PURELY DECORATIVE and are NOT
    // copied into the seeded plan. This is what makes a 4P map's caverns work
    // whatever field the surface tile lands on — and lets each of several gates on
    // one tile be positioned in turn. (A pinned hex directly seeded onto
    // `adventure.gatePlans` — legacy / unit tests — is still honoured; only this
    // setup-from-links path drops the pins.)
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
          // Decorative editor position → NOT copied (see comment above); the
          // player fixes the field on reveal. Guards stay: they belong to the gate.
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
    const forcedCenters = forcedObjectiveCenterTiles(
      centerPool,
      scenario.layout.center.length,
      victoryMode,
      polishGrailUtopiaOn,
      playerConfigs.length,
      seed
    );
    const forcedObjectiveCounts = objectiveCountsInTiles(forcedCenters);
    const polishDesired = polishGrailUtopiaCounts(playerConfigs.length, seed);
    const polishObjectiveOverflow = polishGrailUtopiaOn
      ? takeObjectiveTiles(
          centerPool,
          {
            grail: Math.max(0, polishDesired.grail - forcedObjectiveCounts.grail),
            dragon_utopia: Math.max(0, polishDesired.dragon_utopia - forcedObjectiveCounts.dragon_utopia)
          },
          `${seed}#overflow`
        )
      : [];
    const grailOverflow: string[] =
      victoryMode === "grail" && !polishGrailUtopiaOn
        ? takeRemainingGrailTiles(centerPool, 2 - forcedCenters.filter(Boolean).length)
        : [];
    const forcedObelisks: string[] =
      victoryMode === "grail" && !polishGrailUtopiaOn
        ? takeObeliskTiles({ near: nearPool, far: farPool }, 2)
        : [];
    // Obelisks first (dig unlock needs 2); second Grail uses leftover Near/Far slots.
    const grailNearFarOverflow = [...forcedObelisks, ...grailOverflow, ...polishObjectiveOverflow];
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
    // Border Skirmish exposes six possible seats around its hub; positions not
    // occupied at the chosen player count remain Near tiles, preserving the
    // same complete ring for 2, 3, 4, 5 and 6 players.
    const unusedSeatCenters = scenario.layout.starts.slice(
      Math.max(playerConfigs.length, scenario.layout.unusedStartsAsNearFrom ?? scenario.layout.starts.length)
    );
    for (const center of [...scenario.layout.near, ...unusedSeatCenters]) {
      const tileDefId =
        grailNearFarIndex < grailNearFarOverflow.length
          ? grailNearFarOverflow[grailNearFarIndex++]
          : nearPool.pop();
      if (tileDefId) {
        instantiateTile(adventure, tileDefId, center, 0, true);
      }
    }
    if (polishGrailUtopiaOn && grailNearFarIndex < grailNearFarOverflow.length) {
      polishObjectiveFarSupply = grailNearFarOverflow.slice(grailNearFarIndex);
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
        const tile = instantiateTile(adventure, tileDefId, center, 0, true);
        tile.gateTileChoiceEligible = true;
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
  // discovered during play). `forceDesignedCarve`: a FACE-UP designer-linked tile
  // never passes through the interactive reveal chooser, so its designed gate is
  // carved here (nearest hex) rather than deferred and stranded; face-DOWN designed
  // tiles carry no half yet and are positioned by the player when discovered.
  recomputeSubterraneanGates(adventure, { forceDesignedCarve: true });

  // Far (II–III) tile supplies. The tiles are NOT decided here: each player gets
  // `farTilesPerPlayer` face-down UNOPENED markers, and a truly-random tile is
  // drawn from the remaining far pool only when the player actually opens one
  // (the "flip"). Off, or a count of 0, gives an empty supply. The pool of tiles
  // left after the scenario's own face-down Far tiles is parked on the adventure
  // for those in-play draws (and the reroll returns).
  adventure.farTilePool = [...farPool, ...polishObjectiveFarSupply];
  // Leftover Near (Ⅳ–Ⅴ) tiles after the layout's face-down Near draws — used by
  // designer player-resource-pick on Near tiles (live pool, not face-down swap).
  adventure.nearTilePool = [...nearPool];
  // Leftover underground tiles are a live, secret pool. Entering a
  // Subterranean Gate offers the pre-positioned tile plus one same-band tile
  // from this pool; the unchosen tile returns after the player decides.
  adventure.subterraneanTilePool = [...subterraneanPool];

  // Designer HEX EVENTS — invisible triggers keyed by hex. Runs on the COMMON
  // path (custom AND standard layouts, once every tile is placed): an event is
  // kept only when its hex lands on a placed tile footprint or an already
  // carved standalone hex (elsewhere it could never fire; the designer UI
  // warns). Engine-side state, REDACTED from every player view.
  applyCustomHexEvents(adventure, sanitizeHexEvents(mapPreset?.hexEvents));
  const openedCounters = (adventure.farTilesOpenedByPlayer ??= {});
  for (const config of playerConfigs) {
    adventure.playerFarTiles[config.id] =
      farTileOpeningOn && farTilesPerPlayer > 0
        ? new Array<string>(farTilesPerPlayer).fill(UNOPENED_FAR_TILE)
        : [];
    openedCounters[config.id] = 0;
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

  // Then everyone draws their starting hand (visible from the first moment),
  // and the active player's turn starts as usual. EXCEPTION: when a Scenario
  // starting bonus IS in play, the opening hand is NOT pre-dealt here — instead
  // each player draws UP TO their hand limit at their own first turn, AFTER
  // taking the bonus card, via the mandatory start-of-turn REFRESH_HAND. That
  // way the bonus card counts toward the limit (bonus + drawn = limit), so a
  // player never opens holding limit+1 cards facing a forced discard. With no
  // bonus (bonus off, or Impossible where `bonusSteps` is null) the hand is
  // pre-dealt exactly as before.
  if (!bonusSteps && options.rollFirstPlayer === false) {
    for (const config of playerConfigs) {
      drawCardsForPlayer(state, config.id, state.players[config.id].limits.hand);
    }
  }

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

  if (droppedRaidBossWinCondition) {
    // The authored "slay N Raid Bosses" objective was dropped: no raid-boss
    // module is on, so no lair would ever exist to slay. Public, never silent.
    appendEvent(state, {
      type: "MAP_SECRET_FEATURE_FALLBACK",
      feature: "slay-raid-boss",
      group: "custom-win-condition",
      message:
        "The “slay Raid Bosses” win condition was dropped: no Raid Bosses module is enabled in this game."
    });
  }

  if (parallelRounds > 0) {
    appendEvent(state, { type: "PARALLEL_TURNS_STARTED", rounds: parallelRounds });
  }

  if (manualOrderRejected) {
    appendEvent(state, {
      type: "EVENT_NOTE",
      message:
        "The chosen player order did not match this game's seats — the first player is rolled for instead."
    });
  }
  if (manualOrder) {
    // Deliberate player order: announce it up front. There is no die and no
    // ceremony, so this feed line IS the announcement.
    appendEvent(state, {
      type: "EVENT_NOTE",
      message: `Player order chosen by the host: ${manualOrder
        .map((playerId, index) => `${index + 1}. ${state.players[playerId]?.name ?? playerId}`)
        .join(", ")}.`
    });
  }

  if (options.rollFirstPlayer !== false) {
    // Rulebook order: bonuses are setup step 17; the first-player roll is step
    // 22. The divider stays behind bonus follow-ups, then opens round 1. With a
    // MANUAL order the divider still runs (bonuses first, then round 1) but
    // rolls nothing — `skipRoll` is what keeps the ceremony from arming.
    adventure.rewardQueue.push({
      playerId: playerConfigs[0]!.id,
      kind: "opening-first-player-roll",
      ...(tournamentRules.secondPlayerMorale ? { secondPlayerMorale: true } : {}),
      ...(!bonusSteps ? { dealStartingHands: true } : {}),
      ...(manualOrder ? { skipRoll: true as const } : {})
    });
  } else {
    // Deterministic fixtures keep seat order and their immediate round start.
    if (tournamentRules.secondPlayerMorale && state.turnOrder.length >= 2) {
      changeMorale(state, state.turnOrder[1]!, 1);
    }
    startAdventureRound(state);
    if (parallelRounds > 0) {
      for (const playerId of state.turnOrder) {
        startPlayerTurn(state, playerId);
      }
    } else {
      startPlayerTurn(state, state.activePlayerId);
    }
  }
  // Drain the opening round-start / start-of-turn rewards — chiefly the
  // start-of-turn hand snapshot — so the first player's hand step is live the
  // instant the game state is handed back, before any action is dispatched.
  // With a starting bonus the pump stops on the first player's choice instead.
  pumpAdventureQueues(state);

  // MGQ chooses both Gold identities before normal play. This sits behind any
  // already-open mandatory setup reward and is recovered by the reducer tail if
  // a restored snapshot still owes the choice.
  ensureMgqGoldContractSetupChoice(state);

  // A designed map can start with a FACE-UP Random Town; publish its defending
  // faction before the state is handed back (every later reveal is covered by
  // the reducer tail).
  ensureRevealedRandomTownFactions(state);

  return state;
}

// ---------------------------------------------------------------------------
// Map-setup lobby: pick factions and heroes, then build the scenario map
// ---------------------------------------------------------------------------

const LOBBY_SEAT_NAMES = ["Player 1", "Player 2", "Player 3", "Player 4", "Player 5", "Player 6"];

/** Seats the lobby opens for a scenario, clamped to its min/max players. */
/**
 * How many seats a scenario really opens for a requested count. Exported so the
 * lobby can PREDICT a map pick's seat change with the same arithmetic the
 * resize performs — a picked map that seats fewer players closes the surplus
 * seats (and their faction/hero picks) the moment it is applied.
 */
export function clampSeatCount(scenario: ScenarioDefinition, requested: number | undefined): number {
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
  // Team picks name starting positions. A resize changes that set, so clear the
  // complete record and show the mode's safe defaults until players pick again.
  delete lobby.options.teamAssignments;
  // A manual player order must never go stale: every seat-count change routes
  // through here, so re-coerce the stored order to the new seat set (closed
  // seats drop out, newly opened ones join at the end).
  if (lobby.options.manualPlayerOrder) {
    lobby.options.manualPlayerOrder = sanitizeManualPlayerOrder(
      state.turnOrder,
      lobby.options.manualPlayerOrder
    );
  }

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
  } else {
    pruneMultiplayerComputerControllers(state);
  }
  return count;
}

/**
 * MULTIPLAYER controller invariant (co-op step 1). `state.controllers` carries
 * entries ONLY for computer seats created by SET_COMPUTER_OPPONENTS — a human
 * seat is left ABSENT (`controllerOf` falls back to human) and the whole map is
 * DELETED once no computer seat remains, so a table that never added a computer
 * serializes exactly as it did before the feature.
 *
 * Called from every multiplayer seat-count change (`resizeLobbySeats`), so a
 * trimmed computer seat can NEVER leave an orphaned controller entry behind —
 * an orphan would make `configuredComputerOpponents` (room resets/rematches)
 * and the computer pump believe in a seat that does not exist.
 */
function pruneMultiplayerComputerControllers(state: GameState): void {
  if (state.sessionMode === "single-player") {
    return;
  }
  const controllers = state.controllers;
  if (!controllers) {
    return;
  }
  const live = new Set((state.setupLobby?.seats ?? []).map((seat) => seat.playerId));
  for (const playerId of Object.keys(controllers)) {
    if (!live.has(playerId) || controllers[playerId]?.kind !== "computer") {
      delete controllers[playerId];
    }
  }
  if (Object.keys(controllers).length === 0) {
    delete state.controllers;
  }
}

/** The lobby seats currently driven by the computer, in seat order. */
function computerLobbySeatIds(state: GameState): PlayerId[] {
  return (state.setupLobby?.seats ?? [])
    .filter((seat) => controllerOf(state, seat.playerId).kind === "computer")
    .map((seat) => seat.playerId);
}

export function setComputerOpponents(
  state: GameState,
  action: Extract<GameAction, { type: "SET_COMPUTER_OPPONENTS" }>
): void {
  const lobby = state.setupLobby;
  if (!lobby || state.phase !== "setup" || lobby.startCheck) {
    throw new Error("Computer opponents can only be changed during setup.");
  }
  if (state.sessionMode !== "single-player") {
    setMultiplayerComputerOpponents(state, lobby, action);
    return;
  }
  const humans = lobby.seats.filter((seat) => controllerOf(state, seat.playerId).kind === "human");
  if (humans.length !== 1 || humans[0].playerId !== action.playerId || !Number.isFinite(action.count)) {
    throw new Error("Only the single-player human seat may change computer opponents.");
  }
  const scenario = getScenario(lobby.options.scenarioId);
  if (
    singlePlayerMapDeployment(
      lobby.options.customMap,
      Math.min(scenario.maxPlayers, scenario.layout.starts.length) - 1
    )
  ) {
    throw new Error("This map determines its single-player computer opponents.");
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

/**
 * MULTIPLAYER computer opponents (co-op step 1). An ordinary lobby may add
 * computer-controlled seats — for a co-op table (humans vs the AI alliance) and
 * for a clash table alike. Legality class is SET_GAME_OPTIONS': any seated
 * player may change it while the setup is open and no start check is running.
 *
 * Semantics: the lobby KEEPS its human seats and the computer seats are the
 * TRAILING seats of the list. `count` is the number of computer seats wanted;
 * the total is clamped to the scenario capacity exactly as before, so a lobby
 * already full of humans simply gets no computer seat.
 */
function setMultiplayerComputerOpponents(
  state: GameState,
  lobby: GameSetupState,
  action: Extract<GameAction, { type: "SET_COMPUTER_OPPONENTS" }>
): void {
  if (!lobby.seats.some((seat) => seat.playerId === action.playerId)) {
    throw new Error("Only seated players may change the computer opponents.");
  }
  if (controllerOf(state, action.playerId).kind === "computer") {
    throw new Error("Only seated players may change the computer opponents.");
  }
  if (!Number.isFinite(action.count)) {
    throw new Error("Computer opponents must be a number.");
  }

  const scenario = getScenario(lobby.options.scenarioId);
  const requested = Math.max(0, Math.floor(action.count));
  // CO-OP step 2 — the mirror of the parallelTurns refusal in setGameOptions.
  // Removing every computer seat (count 0) is always allowed, so a lobby can
  // never be wedged: turn the computers off, then turn parallel turns on.
  if (requested > 0 && (lobby.options.parallelTurns ?? 0) > 0) {
    throw new Error(
      "Computer opponents cannot be added while parallel turns are on — turn parallel turns off first."
    );
  }
  const humanSeatCount = Math.max(1, lobby.seats.length - computerLobbySeatIds(state).length);
  const total = clampSeatCount(scenario, humanSeatCount + requested);
  const computerCount = Math.max(0, total - humanSeatCount);

  // A seat that is about to BECOME a computer must be free: a member sitting on
  // it would break the "nobody controls a computer seat" invariant that
  // assignSeat enforces from the other side. Refused whole, never silently
  // bumping a player to observer.
  const occupiedSeats = new Set(
    (state.room?.members ?? []).filter((member) => member.seat !== "observer").map((member) => member.seat)
  );
  for (let index = humanSeatCount; index < total; index += 1) {
    if (occupiedSeats.has(`p${index + 1}`)) {
      throw new Error("Move the players in the trailing seats to observer before adding computer opponents.");
    }
  }

  resizeLobbySeats(state, scenario, total);

  // Re-stamp the controller map: the LAST `computerCount` seats are computers,
  // every earlier seat is human (no entry at all — see
  // pruneMultiplayerComputerControllers).
  const firstComputerIndex = total - computerCount;
  lobby.seats.forEach((seat, index) => {
    const player = state.players[seat.playerId];
    if (index >= firstComputerIndex) {
      state.controllers = { ...(state.controllers ?? {}), [seat.playerId]: standardComputerController() };
      seat.name = `Computer ${index + 1 - firstComputerIndex}`;
      const faction = seat.factionId ? coreFactionDefinitions[seat.factionId] : null;
      const hero = seat.heroDefId ? coreHeroDefinitions[seat.heroDefId] : null;
      if (player) {
        player.name = faction && hero ? `${hero.name} of ${faction.name}` : seat.name;
      }
      return;
    }
    if (state.controllers?.[seat.playerId]) {
      // Demoted back to a human seat: drop the pick the computer was carrying so
      // an arriving player starts from a clean, unnamed seat.
      delete state.controllers[seat.playerId];
      seat.name = LOBBY_SEAT_NAMES[index] ?? `Player ${index + 1}`;
      seat.factionId = null;
      seat.heroDefId = null;
      if (player) {
        player.name = seat.name;
      }
    }
  });
  pruneMultiplayerComputerControllers(state);

  if (lobby.draft?.seatRolls) {
    const live = new Set(lobby.seats.map((seat) => seat.playerId));
    lobby.draft.seatRolls = Object.fromEntries(Object.entries(lobby.draft.seatRolls).filter(([id]) => live.has(id)));
  }
  appendEvent(state, {
    type: "GAME_OPTIONS_CHANGED",
    playerId: action.playerId,
    message: `${state.players[action.playerId]?.name ?? action.playerId} set computer opponents ${computerCount}.`
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
  if (options.gameMode !== undefined) {
    setupOptions.gameMode = options.gameMode;
  }
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
  if (options.tournamentObservatoryRerotate !== undefined) {
    setupOptions.tournamentObservatoryRerotate = options.tournamentObservatoryRerotate;
  }
  if (options.pvpNeutralControl !== undefined) {
    setupOptions.pvpNeutralControl = options.pvpNeutralControl;
  }
  if (options.farTileBlindChoice !== undefined) {
    setupOptions.farTileBlindChoice = options.farTileBlindChoice;
  }
  if (options.farTileTypeChoice !== undefined) {
    setupOptions.farTileTypeChoice = options.farTileTypeChoice;
  }
  if (options.pvpNeutralControlMustAttack !== undefined) {
    setupOptions.pvpNeutralControlMustAttack = options.pvpNeutralControlMustAttack;
  }
  if (options.manualGuardControl !== undefined) {
    setupOptions.manualGuardControl = options.manualGuardControl;
  }
  if (options.startingHandMulligan !== undefined) {
    setupOptions.startingHandMulligan = options.startingHandMulligan;
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

  if (next.customMode !== undefined) {
    lobby.options.customMode = Boolean(next.customMode);
    changes.push(`game mode ${lobby.options.customMode ? "Custom (personal setup)" : "standard preset"}`);
  }

  // CO-OP (step 1). Sanitized to the two literals; anything else is refused
  // rather than silently coerced, so a stale/forged client cannot invent a mode.
  // "clash" is the default, so a lobby that never sets this field is unchanged.
  if (next.gameMode !== undefined) {
    if (next.gameMode !== "clash" && next.gameMode !== "coop") {
      throw new Error("Unknown table mode.");
    }
    lobby.options.gameMode = next.gameMode;
    if (next.gameMode === "clash" && state.sessionMode !== "single-player") {
      delete lobby.options.teamAssignments;
    }
    changes.push(`table mode ${next.gameMode === "coop" ? "Co-op (humans vs computers)" : "Clash (free-for-all)"}`);
  }

  if (next.teamAssignments !== undefined) {
    if (lobby.options.customMapPreset?.fixedTeams?.length === lobby.seats.length) {
      throw new Error("This scenario fixes the starting-position teams.");
    }
    if (state.sessionMode !== "single-player" && (next.gameMode ?? lobby.options.gameMode) !== "coop") {
      throw new Error("Custom teams are available in Co-op and single-player setup only.");
    }
    if (Object.keys(next.teamAssignments).length === 0) {
      delete lobby.options.teamAssignments;
      changes.push("default teams");
    } else {
      const sanitized = sanitizeTeamAssignments(next.teamAssignments, lobby.seats.map((seat) => seat.playerId));
      if (!sanitized) {
        throw new Error("Every starting position needs a valid team number.");
      }
      lobby.options.teamAssignments = sanitized;
      changes.push("custom starting-position teams");
    }
  }

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
      artifacts: Boolean(next.wog.artifacts),
      unitExperience: Boolean(next.wog.unitExperience),
      neutralRankUp: Boolean(next.wog.neutralRankUp),
      monsterWaves: Boolean(next.wog.monsterWaves),
      raidBosses: Boolean(next.wog.raidBosses),
      dungeon: Boolean(next.wog.dungeon),
      ...(next.wog.pveTheme === "classic" ||
      next.wog.pveTheme === "doom" ||
      next.wog.pveTheme === "random"
        ? { pveTheme: next.wog.pveTheme }
        : {}),
      ...(next.wog.wavePressure === "standard" || next.wog.wavePressure === "brutal"
        ? { wavePressure: next.wog.wavePressure }
        : {}),
      ...(next.wog.waveDefeatLimit === 0 ||
      next.wog.waveDefeatLimit === 2 ||
      next.wog.waveDefeatLimit === 3
        ? { waveDefeatLimit: next.wog.waveDefeatLimit }
        : {}),
      ...(next.wog.raidBossSpawnRound === 4 ||
      next.wog.raidBossSpawnRound === 5 ||
      next.wog.raidBossSpawnRound === 6
        ? { raidBossSpawnRound: next.wog.raidBossSpawnRound }
        : {}),
      ...(next.wog.dungeonDepth === 5 || next.wog.dungeonDepth === 10
        ? { dungeonDepth: next.wog.dungeonDepth }
        : {}),
      ...(next.wog.dungeonDescentCost === 0 ||
      next.wog.dungeonDescentCost === 1 ||
      next.wog.dungeonDescentCost === 2
        ? { dungeonDescentCost: next.wog.dungeonDescentCost }
        : {}),
      ...(next.wog.waveCadence === 3 || next.wog.waveCadence === 4 || next.wog.waveCadence === 5
        ? { waveCadence: next.wog.waveCadence }
        : {})
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
    if (
      next.victoryMode !== "conquest" &&
      mapHasAuthoredGrailOrUtopia(lobby.options.customMap, lobby.options.customMapPreset)
    ) {
      throw new Error(
        "This designed map already contains Hidden Grail / Dragon Utopia fields. Holy Grail, Dragon Hunt and Dragon Conqueror cannot add another objective."
      );
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
      `Dragon Utopia guards ${
        next.dragonUtopiaGuards === "four" ? "four dragons" : "the Field Difficulty table"
      }`
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

  if (next.creatureBanks !== undefined) {
    lobby.options.creatureBanks = Boolean(next.creatureBanks);
    changes.push(`Creature Banks ${next.creatureBanks ? "on" : "off"}`);
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
    if (next.tournamentObservatoryRerotate === undefined) {
      lobby.options.tournamentObservatoryRerotate = on;
    }
    changes.push(
      on
        ? "Tournament Mode on (remove Diplomacy + Hourglass; second player +1 morale; Observatory re-rotate; tier-split decks)"
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
  if (next.tournamentObservatoryRerotate !== undefined) {
    lobby.options.tournamentObservatoryRerotate = Boolean(next.tournamentObservatoryRerotate);
    changes.push(
      `Tournament Observatory re-rotate ${lobby.options.tournamentObservatoryRerotate ? "on" : "off"}`
    );
  }
  // Keep the master flag in sync with the granular rules for old readers.
  if (
    next.tournamentMode !== undefined ||
    next.tournamentBanDiplomacy !== undefined ||
    next.tournamentBanHourglass !== undefined ||
    next.tournamentSecondPlayerMorale !== undefined ||
    next.tournamentObservatoryRerotate !== undefined
  ) {
    lobby.options.tournamentMode = tournamentRulesAllOn(lobby.options);
    // The Tournament package's headline house rule is the tier-split Spell /
    // Artifact decks — the SAME `split-decks` rule BINH ticks. EVERY path that
    // turns the package on must force it at this one engine seam (not only in
    // the hub preset payload): the master toggle, and — the gap this closes —
    // ticking the granular rules one by one until they are all on. Otherwise a
    // table that assembled Tournament rules from the collapsible panel got the
    // bans and a SINGLE-deck game (no Basic/Expert Spell deck split, so an
    // Eagle Eye / Search never picks a deck). Only when this same action
    // carries no explicit houseRules payload (an explicit host choice always
    // wins — including un-ticking the new split-decks row itself), and never on
    // turning the package OFF (the host may deliberately keep split decks).
    const packageOn = Boolean(next.tournamentMode) || lobby.options.tournamentMode;
    if (packageOn && next.houseRules === undefined && lobby.options.houseRules?.["split-decks"] !== true) {
      // Announce it only when the EFFECTIVE value moves (a BINH table already
      // defaults the rule on — the explicit true is still written so a later
      // ruleset switch to Legacy cannot silently drop it).
      const wasOn = resolveHouseRules(lobby.options)["split-decks"];
      lobby.options.houseRules = { ...lobby.options.houseRules, "split-decks": true };
      if (!wasOn) {
        changes.push("Divided Spell & Artifact decks on (Tournament rules)");
      }
    }
  }

  if (next.pvpNeutralControl !== undefined) {
    lobby.options.pvpNeutralControl = Boolean(next.pvpNeutralControl);
    changes.push(`PvP Neutral Control ${next.pvpNeutralControl ? "on (two or more seats)" : "off"}`);
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
    // A mode PRESET sends the whole registry at once — one summary clause
    // instead of ~40 per-rule lines flooding the feed.
    const wholeRegistry = Object.keys(next.houseRules).length >= HOUSE_RULES.length;
    let houseRuleChanges = 0;
    for (const [id, value] of Object.entries(next.houseRules)) {
      const def = HOUSE_RULE_BY_ID[id as HouseRuleId];
      if (merged[id as HouseRuleId] !== Boolean(value)) {
        houseRuleChanges += 1;
      }
      merged[id as HouseRuleId] = Boolean(value);
      if (!wholeRegistry) {
        changes.push(`${def.label} ${value ? "on" : "off"}`);
      }
    }
    if (wholeRegistry) {
      changes.push(`house rules set to the chosen mode's package (${houseRuleChanges} changed)`);
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

  if (next.playerOrderMode !== undefined) {
    if (next.playerOrderMode !== "random" && next.playerOrderMode !== "manual") {
      throw new Error("Unknown player order mode.");
    }
    lobby.options.playerOrderMode = next.playerOrderMode;
    if (next.playerOrderMode === "manual" && next.manualPlayerOrder === undefined) {
      // Switching to manual seeds the current seat order, so the option is
      // never "manual" with nothing to play — the picker edits a real list.
      lobby.options.manualPlayerOrder = sanitizeManualPlayerOrder(
        lobby.seats.map((seat) => seat.playerId),
        lobby.options.manualPlayerOrder
      );
    }
    changes.push(
      next.playerOrderMode === "manual" ? "player order chosen by the host" : "first player rolled at random"
    );
  }

  if (next.manualPlayerOrder !== undefined) {
    // Untrusted list: coerced to a full permutation of the OPEN seats (unknown
    // ids / duplicates dropped, missing seats appended in seat order).
    const order = sanitizeManualPlayerOrder(
      lobby.seats.map((seat) => seat.playerId),
      next.manualPlayerOrder
    );
    lobby.options.manualPlayerOrder = order;
    changes.push(
      `player order ${order
        .map((playerId) => state.players[playerId]?.name ?? playerId)
        .join(" → ")}`
    );
  }

  if (next.parallelTurns !== undefined) {
    const rounds = normalizeParallelTurnRounds(next.parallelTurns);
    // CO-OP step 2 — the combination is REFUSED, both directions. A computer
    // seat inside parallel turns is an untested stall surface: the pump owns
    // exactly one open decision at a time while parallel mode opens every live
    // seat's turn at once, and the quiet-action / exclusive-interaction guards
    // were designed and pinned for human bystanders only. Blocked at the lobby
    // seam rather than half-supported (see setMultiplayerComputerOpponents for
    // the mirror check).
    if (rounds > 0 && computerLobbySeatIds(state).length > 0) {
      throw new Error(
        "Parallel turns cannot be used with computer opponents — remove the computer seats first."
      );
    }
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

  if (next.manualGuardControl !== undefined) {
    lobby.options.manualGuardControl = Boolean(next.manualGuardControl);
    changes.push(`Manual guard control ${lobby.options.manualGuardControl ? "on" : "off"}`);
  }

  if (next.startingHandMulligan !== undefined) {
    lobby.options.startingHandMulligan = Boolean(next.startingHandMulligan);
    changes.push(`First-round Mulligan ${lobby.options.startingHandMulligan ? "on" : "off"}`);
  }

  if (next.unitExperience !== undefined) {
    lobby.options.unitExperience = Boolean(next.unitExperience);
    changes.push(`Unit experience (veterancy) ${lobby.options.unitExperience ? "on" : "off"}`);
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

  if (next.farTileBlindChoice !== undefined) {
    lobby.options.farTileBlindChoice = Boolean(next.farTileBlindChoice);
    changes.push(`blind Ⅱ–Ⅲ tile choice ${lobby.options.farTileBlindChoice ? "on" : "off"}`);
  }

  if (next.farTileTypeChoice !== undefined) {
    lobby.options.farTileTypeChoice = Boolean(next.farTileTypeChoice);
    changes.push(`Ⅱ–Ⅲ tile type choice ${lobby.options.farTileTypeChoice ? "on" : "off"}`);
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
    const authoredSolo =
      state.sessionMode === "single-player" && next.customMap === undefined
        ? singlePlayerMapDeployment(
            lobby.options.customMap,
            Math.min(scenario.maxPlayers, scenario.layout.starts.length) - 1
          )
        : null;
    const count = resizeLobbySeats(
      state,
      scenario,
      authoredSolo ? 1 + authoredSolo.computers.length : next.playerCount
    );
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
      if (state.sessionMode === "single-player") {
        const scenario = getScenario(lobby.options.scenarioId);
        const count = resizeLobbySeats(state, scenario, scenario.minPlayers);
        changes.push(`map sets ${Math.max(1, count - 1)} computer opponent${count === 2 ? "" : "s"}`);
      }
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
      const { accepted, problems } = validateCustomMapPlan(next.customMap, scenario, lobby.seats.length);
      if (problems.length > 0) {
        throw new Error(problems[0]);
      }
      lobby.options.customMap = accepted;
      lobby.options.customMapName = mapName;
      if (state.sessionMode === "single-player") {
        const deployment = singlePlayerMapDeployment(
          accepted,
          Math.min(scenario.maxPlayers, scenario.layout.starts.length) - 1
        );
        if (deployment) {
          const count = resizeLobbySeats(state, scenario, 1 + deployment.computers.length);
          changes.push(`map sets ${count - 1} computer opponent${count === 2 ? "" : "s"}`);
        }
      }
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

  // Picking/updating a designed map can introduce its own hidden Grail/Utopia
  // package in the same payload. Such a map owns that content: scenario presets
  // that would inject another objective are reset authoritatively, not merely
  // hidden in the client. This also repairs legacy saved maps carrying both.
  if (
    lobby.options.victoryMode &&
    lobby.options.victoryMode !== "conquest" &&
    mapHasAuthoredGrailOrUtopia(lobby.options.customMap, lobby.options.customMapPreset)
  ) {
    lobby.options.victoryMode = "conquest";
    changes.push("win condition Conquest (map already owns its Hidden Grail / Dragon Utopia fields)");
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
  if (!isPlayableFaction(action.factionId, lobby.options.anime)) {
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
    .filter((id) => !taken.has(id) && isPlayableFaction(id, lobby.options.anime));
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
  if (!isPlayableFaction(action.factionId, lobby.options.anime)) {
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
      .filter((id) => !takenFactions.has(id) && isPlayableFaction(id, lobby.options.anime) && selectableHeroes(id).length > 0);
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
/**
 * The town type a DESIGNED map forces on a given single-player COMPUTER seat, or
 * null. A designed solo deployment maps its AI-marked start tiles to the computer
 * seats in seat order (exactly the mapping the build uses); if that tile carries
 * a `singlePlayer.factionId` that is still available — playable under the current
 * mods and not already taken by another seat — it is returned so the seat locks
 * to it instead of rolling a random town. An unplayable or already-taken value
 * yields null, so a bad authored value degrades to a normal random pick (never a
 * stall). Returns null off single-player, for a human seat, or with no complete
 * solo deployment on the map.
 */
export function mapForcedComputerFaction(state: GameState, seatPlayerId: PlayerId): FactionId | null {
  const lobby = state.setupLobby;
  if (!lobby || state.sessionMode !== "single-player") {
    return null;
  }
  if (controllerOf(state, seatPlayerId).kind !== "computer") {
    return null;
  }
  const scenario = getScenario(lobby.options.scenarioId);
  const deployment = singlePlayerMapDeployment(
    lobby.options.customMap,
    Math.min(scenario.maxPlayers, scenario.layout.starts.length) - 1
  );
  if (!deployment) {
    return null;
  }
  const computerSeats = lobby.seats.filter(
    (seat) => controllerOf(state, seat.playerId).kind === "computer"
  );
  const index = computerSeats.findIndex((seat) => seat.playerId === seatPlayerId);
  if (index < 0) {
    return null;
  }
  const forced = deployment.computers[index]?.singlePlayer?.factionId;
  if (!forced || !isPlayableFaction(forced, lobby.options.anime)) {
    return null;
  }
  const takenElsewhere = lobby.seats.some(
    (seat) => seat.playerId !== seatPlayerId && seat.factionId === forced
  );
  return takenElsewhere ? null : forced;
}

export function setComputerSeatFaction(
  state: GameState,
  action: Extract<GameAction, { type: "SET_COMPUTER_SEAT_FACTION" }>
): void {
  const lobby = state.setupLobby;
  if (!lobby || state.phase !== "setup") {
    throw new Error("Computer seats can only be set during map setup.");
  }
  if (lobby.startCheck) {
    throw new Error("The setup is locked while the start check is open.");
  }
  if (lobbyDraft(lobby).format !== "open") {
    throw new Error("A computer's town and hero can only be hand-picked in the Free pick format.");
  }

  if (state.sessionMode === "single-player") {
    // Issuer must be the ONE human owner seat (never a seat takeover — this only
    // writes the faction/hero fields of a computer seat).
    const humans = lobby.seats.filter((candidate) => controllerOf(state, candidate.playerId).kind === "human");
    if (humans.length !== 1 || humans[0].playerId !== action.playerId) {
      throw new Error("Only the single-player human seat may pick a computer's faction.");
    }
  } else {
    // MULTIPLAYER (co-op step 1): a lobby may now hold computer seats, and any
    // SEATED HUMAN may pick their town/hero — the same legality class as
    // SET_GAME_OPTIONS / SET_COMPUTER_OPPONENTS. A computer seat may never
    // issue it.
    const issuerSeated = lobby.seats.some((candidate) => candidate.playerId === action.playerId);
    if (!issuerSeated || controllerOf(state, action.playerId).kind === "computer") {
      throw new Error("Only a seated player may pick a computer's faction.");
    }
  }

  const seat = lobby.seats.find((candidate) => candidate.playerId === action.seatPlayerId);
  if (!seat) {
    throw new Error("That seat does not exist in this scenario.");
  }
  if (controllerOf(state, action.seatPlayerId).kind !== "computer") {
    throw new Error("Only a computer opponent's faction can be picked this way.");
  }

  const forcedFaction = mapForcedComputerFaction(state, action.seatPlayerId);
  if (forcedFaction) {
    // This enemy's town type is fixed by the designed map — lock it to the forced
    // faction (its first hero) no matter what pick / roll / clear was requested,
    // so the human owner can never desync the seat from what the map deploys.
    const forcedHero = coreFactionDefinitions[forcedFaction].heroes[0];
    seat.factionId = forcedFaction;
    seat.heroDefId = forcedHero;
    const lockedPlayer = state.players[action.seatPlayerId];
    const lockedHero = coreHeroDefinitions[forcedHero];
    if (lockedPlayer && lockedHero) {
      lockedPlayer.name = `${lockedHero.name} of ${coreFactionDefinitions[forcedFaction].name}`;
    }
    return;
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
      .filter((id) => !takenFactions.has(id) && isPlayableFaction(id, lobby.options.anime) && coreFactionDefinitions[id].heroes.length > 0);
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
    if (!isPlayableFaction(factionId, lobby.options.anime)) {
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
  const pickedTeams = sanitizeTeamAssignments(
    lobby.options.teamAssignments,
    lobby.seats.map((seat) => seat.playerId)
  );
  if (pickedTeams && new Set(Object.values(pickedTeams)).size < 2) {
    throw new Error("Choose at least two teams before starting the adventure.");
  }

  // A designed map whose tile layout makes the chosen win condition's objective
  // IMPOSSIBLE (no Grail dig capacity / no Dragon Utopia) is BLOCKED here with a
  // clear message rather than silently building an unwinnable game. Compatible
  // designs (and every scenario-driven map) pass straight through. The designer
  // + lobby show the same warnings live, so this is never a surprise at start.
  if (lobby.options.customMap && lobby.options.customMap.length > 0) {
    const scenario = getScenario(lobby.options.scenarioId);
    const acceptedPlan = validateCustomMapPlan(lobby.options.customMap, scenario, lobby.seats.length).accepted;
    const conflicts = victoryDesignConflicts(acceptedPlan, lobby.options.victoryMode);
    if (
      (lobby.options.victoryMode ?? "conquest") !== "conquest" &&
      mapHasAuthoredGrailOrUtopia(acceptedPlan, lobby.options.customMapPreset)
    ) {
      throw new Error(
        "This designed map already contains Hidden Grail / Dragon Utopia fields. Use Conquest, custom wins, or Victory Points instead of a second Grail/Utopia preset."
      );
    }
    if (conflicts.length > 0) {
      throw new Error(conflicts[0]);
    }
    // CO-OP MAP SUPPORT (step 5). A map may declare which table modes it is
    // designed for, and — for co-op — which starting positions each side may
    // take. Both are HARD refusals here: the effective mode must be supported,
    // and the authored roles must be able to seat exactly this table. A map
    // that declares nothing (every legacy map) passes straight through.
    const effectiveMode = lobby.options.gameMode ?? "clash";
    if (!mapSupportsGameMode(lobby.options.customMapPreset, effectiveMode)) {
      throw new Error(
        effectiveMode === "coop"
          ? "This map is not designed for Co-op — switch the table mode to Clash or pick a co-op map."
          : "This map is designed for Co-op only — switch the table mode to Co-op or pick another map."
      );
    }
    if (effectiveMode === "coop") {
      const computerSeats = lobby.seats.filter(
        (seat) => controllerOf(state, seat.playerId).kind === "computer"
      ).length;
      const coop = coopMapDeployment(
        acceptedPlan,
        lobby.seats.length - computerSeats,
        computerSeats
      );
      if (coop && !coop.ok) {
        throw new Error(coop.reason);
      }
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
    // CO-OP: carried or the host's table-mode choice is silently dropped and the
    // built game has no alliance. Absent (a plain lobby) ⇒ byte-identical.
    gameMode: lobby.options.gameMode,
    teamAssignments: lobby.options.teamAssignments,
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
    // Naval Battles Creature Banks toggle (Map tab). Set on the lobby by the
    // setGameOptions `creatureBanks` branch; must be carried into the built game
    // or the host's Off choice is silently dropped. Defaults ON (undefined) so a
    // plain lobby is byte-identical.
    creatureBanks: lobby.options.creatureBanks,
    events: lobby.options.events,
    victoryPoints: lobby.options.victoryPoints,
    victoryPointsRoundLimit: lobby.options.victoryPointsRoundLimit,
    customWinConditions: lobby.options.customWinConditions,
    // WHO GOES FIRST (default random). Carried or the host's deliberate order is
    // silently dropped and the game rolls anyway.
    playerOrderMode: lobby.options.playerOrderMode,
    manualPlayerOrder: lobby.options.manualPlayerOrder,
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
    manualGuardControl: lobby.options.manualGuardControl,
    // Default ON when the lobby never touched the toggle (undefined → true).
    // Explicit false still freezes OFF for hosts who opted out.
    startingHandMulligan: lobby.options.startingHandMulligan !== false,
    houseRules: lobby.options.houseRules,
    parallelTurns: lobby.options.parallelTurns,
    undoMoves: lobby.options.undoMoves,
    unitExperience: lobby.options.unitExperience,
    farTileOpening: lobby.options.farTileOpening,
    farTilesPerPlayer: lobby.options.farTilesPerPlayer,
    farTileBlindChoice: lobby.options.farTileBlindChoice,
    farTileTypeChoice: lobby.options.farTileTypeChoice,
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

import { astrologersCardDefinitions, type AstrologersCardDefinition } from "@/data/cards/astrologers";
import { eventCardDefinitions, type EventCardDefinition } from "@/data/cards/events";
import { REROLL_REACTION_ARTIFACT_IDS } from "@/data/cards/artifacts";
import { spellDeckBinhExpert } from "@/data/cards/spells";
import { cardLibrary } from "@/data/cards/library";
import {
  coreBuildingDefinitions,
  coreFactionDefinitions,
  coreHeroDefinitions,
  isPlayableFaction,
  neutralUnitIdsByFaction
} from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities, type UnitMapAbilityEffect } from "@/data/units/abilities";
import type { UnitDefinition, UnitSideDefinition } from "@/data/factions/types";
import { hasInternalBorder } from "@/data/map/borders";
import {
  CREATURE_BANKS,
  CREATURE_BANK_UNIT_SIDES,
  STACK_TOKEN_PLACEMENT_PERCENT,
  STACK_TOKEN_STATS,
  STACK_TOKENS_BY_DIFFICULTY,
  type CreatureBankId
} from "@/data/map/creature-banks";
import { isFieldOverrideLocation } from "@/data/map/field-overrides";
import { tilePendingTokens } from "./tile-hex-placements";
import { locationDefinitions, marketGoldValueOf, TRADE_RATES } from "@/data/map/locations";
import { allTileDefinitions } from "@/data/map/tiles";
import type { LocationInteraction, TileDefinition } from "@/data/map/types";
import {
  consumeIgnoreFieldNegativeMorale,
  expireEffectsForGameRoundEnd,
  expireEffectsForTurnEnd,
  makeActiveEffect,
  releaseEndedOngoingCards
} from "./active-effects";
import { drawCardsForPlayer, shuffleCards } from "./decks";
import { appendEvent, eventSeedNumber, nextEventNumber } from "./events";
import {
  applyMoraleCardGain,
  consumeHeldMoraleCard,
  moraleCardsRuleEnabled,
  playerHoldsMoraleCard
} from "./morale-cards";
import { MORALE_CARD_IDS } from "@/data/cards/morale";
import { parallelInteractionBlocker, stopParallelTurns } from "./parallel-turns";
import { clearResetVote } from "./reset-vote";
import {
  computeVictoryPoints,
  recordVpUtopiaDefeat,
  recordVpViiCenter,
  victoryPointsConfig,
  victoryPointsModeActive
} from "./victory-points";
import { playerOwnsWarMachine, removePermanentFromPlayToRemoved } from "./permanents";
import {
  applyUnitSideRules,
  canAcquireSharedDeckCard,
  expertUsesAvailable,
  getRuleset,
  unitSideRuleOverrides,
  ARTIFACT_DECK_RELIC,
  NECROMANCY_ABILITY_ID,
  NECROPOLIS_FACTION_ID
} from "./ruleset";
import { houseRuleEnabled } from "./house-rules";
import {
  polishArmyUnitCanBuyStack,
  polishArmyUnitStackCost,
  polishStackTier
} from "./polish-unit-stacks";
import {
  CAST_A_SPELL_CARD_ID,
  gainOwnedCard,
  polishSpellBookEnabled
} from "./polish-spell-book";
import {
  polishPandoraSearchCount,
  polishReducedStartingBonusDescription,
  polishReducedStartingBonusVisitSteps,
  polishSurrenderGoldCost
} from "./polish-house-rules";
import {
  clearPolishArtifactAccess,
  maybeApplyPolishRandomArtifactRoll,
  polishArtifactBandForField,
  polishArtifactDeckAllowed,
  polishArtifactTierAllowed
} from "./polish-random-artifacts";
import {
  canonicalTileEdgeCode,
  hexDirectionBetween,
  hexDistance,
  hexEquals,
  hexNeighbor,
  hexNeighbors,
  hexSpaceId,
  parseHexSpaceId,
  slotDirection,
  tileCentersAdjacent,
  tileCentersOverlap,
  tileFootprint,
  tileFootprintsTouch,
  tileLatticeNeighbors,
  type HexCoord
} from "./hex";
import { createSeededRandom } from "./random";
import { applyUnitCurrentSide } from "./unit-transforms";
import type {
  ActiveEffectState,
  AdventureReward,
  AdventureState,
  ArmyUnitState,
  ArtifactTier,
  AstrologersState,
  BankSize,
  CardId,
  CombatUnitState,
  CustomCenterHexReward,
  CustomGuardSpec,
  CustomMapObjectKind,
  EventDiePoolEntry,
  EventPoolEntry,
  EventsState,
  GameDifficulty,
  GameRuleset,
  GameState,
  HeroId,
  HeroState,
  MapFieldState,
  MapSpaceId,
  MapTileState,
  OnewayExitMode,
  PendingVisit,
  SubterraneanGateChoiceCandidate,
  SubterraneanGatePlan,
  PlayerId,
  PlayerState,
  RecruitDiscountVoucher,
  ResourceCost,
  ResourceKind,
  SpellSchool,
  DragonUtopiaGuards,
  TownState,
  UnitId,
  UnitTransformState,
  VictoryMode,
  VisitStep
} from "./state";
import { isNeutralSideCombatChoice, neutralCombatControllerId } from "./neutral-control";
import { DEFAULT_OBELISK_BONUS, GRAIL_OBELISKS_REQUIRED, NEUTRAL_PLAYER_ID, UNOPENED_FAR_TILE } from "./state";
import type { CustomMapObeliskBonus } from "./state";
import { awardCommanderGradePoints } from "./commanders";

/** Hero level track: hand limit and expert-effect uses by level (hero board). */
export const HAND_LIMIT_BY_LEVEL: Record<number, number> = { 1: 4, 2: 4, 3: 5, 4: 5, 5: 6, 6: 6, 7: 7 };
export const EXPERT_USES_BY_LEVEL: Record<number, number> = { 1: 0, 2: 1, 3: 1, 4: 2, 5: 2, 6: 3, 7: 3 };
/** Levels that trigger a Search (2) of the Ability deck (silver numerals). */
export const ABILITY_SEARCH_LEVELS = [2, 3, 5, 7];
/** Levels that add the hero's next Specialty card (gold numerals). */
export const SPECIALTY_LEVELS = [4, 6] as const;

export const MAX_EXPERIENCE = 12;

/**
 * Field Difficulty Level Table (community rulebook rewrite, back cover):
 * how many neutral units of each tier guard a field by game difficulty.
 */
export const NEUTRAL_ARMY_TABLE: Record<GameDifficulty, Record<number, { bronze: number; silver: number; gold: number; azure: number }>> = {
  easy: {
    1: { bronze: 1, silver: 0, gold: 0, azure: 0 },
    2: { bronze: 2, silver: 0, gold: 0, azure: 0 },
    3: { bronze: 1, silver: 1, gold: 0, azure: 0 },
    4: { bronze: 2, silver: 1, gold: 0, azure: 0 },
    5: { bronze: 2, silver: 1, gold: 1, azure: 0 },
    6: { bronze: 2, silver: 2, gold: 1, azure: 0 },
    7: { bronze: 0, silver: 0, gold: 0, azure: 1 }
  },
  normal: {
    1: { bronze: 1, silver: 0, gold: 0, azure: 0 },
    2: { bronze: 2, silver: 0, gold: 0, azure: 0 },
    3: { bronze: 2, silver: 1, gold: 0, azure: 0 },
    4: { bronze: 1, silver: 2, gold: 0, azure: 0 },
    5: { bronze: 1, silver: 2, gold: 1, azure: 0 },
    6: { bronze: 1, silver: 2, gold: 2, azure: 0 },
    7: { bronze: 0, silver: 0, gold: 0, azure: 2 }
  },
  hard: {
    1: { bronze: 2, silver: 0, gold: 0, azure: 0 },
    2: { bronze: 3, silver: 0, gold: 0, azure: 0 },
    3: { bronze: 1, silver: 2, gold: 0, azure: 0 },
    4: { bronze: 0, silver: 3, gold: 0, azure: 0 },
    5: { bronze: 0, silver: 2, gold: 2, azure: 0 },
    6: { bronze: 0, silver: 2, gold: 3, azure: 0 },
    7: { bronze: 0, silver: 0, gold: 1, azure: 2 }
  },
  impossible: {
    1: { bronze: 3, silver: 0, gold: 0, azure: 0 },
    2: { bronze: 2, silver: 1, gold: 0, azure: 0 },
    3: { bronze: 0, silver: 3, gold: 0, azure: 0 },
    4: { bronze: 0, silver: 2, gold: 1, azure: 0 },
    5: { bronze: 0, silver: 1, gold: 3, azure: 0 },
    6: { bronze: 0, silver: 1, gold: 4, azure: 0 },
    7: { bronze: 0, silver: 0, gold: 2, azure: 2 }
  }
};

export const NEUTRAL_DECK_IDS = {
  bronze: "neutral-bronze",
  silver: "neutral-silver",
  gold: "neutral-gold",
  azure: "neutral-azure"
} as const;

/**
 * The Field Difficulty a designer "certain army" guard ({@link CustomGuardSpec.units})
 * COUNTS AS — it drives the fight trigger, the map's Roman numeral and the
 * experience reward exactly like a printed level. Derived from the army's
 * tiers, calibrated against the NORMAL {@link NEUTRAL_ARMY_TABLE} rows (bronze
 * 1 / silver 2 / gold 3 points): any azure body makes it a Ⅶ fight (azure IS
 * the level-7 tier — winning jumps the hero to level 7, like every azure
 * guard); otherwise the point total maps onto the closest table row, capped at
 * Ⅵ. Unknown ids count 0 (the sanitiser drops them before play).
 */
export function customGuardArmyDifficulty(units: string[]): number {
  let points = 0;
  for (const unitDefId of units) {
    const tier = coreUnitDefinitions[unitDefId]?.tier;
    if (tier === "azure") {
      return 7;
    }
    points += tier === "gold" ? 3 : tier === "silver" ? 2 : tier === "bronze" ? 1 : 0;
  }
  if (points <= 1) return 1;
  if (points <= 3) return 2;
  if (points === 4) return 3;
  if (points <= 7) return 4;
  if (points <= 10) return 5;
  return 6;
}

/**
 * Stamp a designer guard ({@link CustomGuardSpec}) onto a carved field: a
 * LEVEL becomes the field's normal Field Difficulty (Quick Combat / experience
 * follow it); an EXACT ARMY additionally pins `customGuardUnits` (minted at
 * fight time; never Quick-Combat/Diplomacy skipped) with the difficulty
 * derived from its tiers. The shared stamp for tile tokens, standalone map
 * objects and subterranean gate halves — one code path, one behaviour.
 */
export function applyCustomGuardToField(field: MapFieldState, guard: CustomGuardSpec | undefined): void {
  if (!guard) {
    return;
  }
  if (guard.units && guard.units.length > 0) {
    field.customGuardUnits = [...guard.units];
    field.difficulty = customGuardArmyDifficulty(guard.units);
  } else if (guard.level) {
    field.difficulty = guard.level;
  }
}

/** Remove a beaten / swept designed guard from a field (all its traces). */
export function clearCustomGuard(field: MapFieldState): void {
  delete field.difficulty;
  delete field.customGuardUnits;
  delete field.customGuardLevel;
}

/**
 * Locations whose designed guard fights BANK-style (rulebook Creature-Bank
 * semantics — "the fight is unlimited, as in Banks"): no Quick Combat, no
 * experience (combat difficulty 0) and no Round limit / MP-to-extend. The
 * designer outposts.
 */
export function isBankStyleGuardLocation(locationId: string): boolean {
  return locationId === "garrison" || locationId === "keymaster_tent" || locationId === "oneway_entrance";
}

/**
 * Whether `playerId` holds a Keymaster's Tent flag of `pair`'s color — the key
 * that opens same-color Barriers. Tents allow multiple flags, so both the
 * first owner and every later `extraFlagOwnerIds` visitor count.
 */
export function playerHoldsTentFlag(
  state: GameState,
  playerId: PlayerId,
  pair: 1 | 2 | 3 | 4 | undefined
): boolean {
  if (!pair) {
    return false;
  }
  return Object.values(state.adventure?.fields ?? {}).some(
    (field) =>
      field.location === "keymaster_tent" &&
      field.gatePair === pair &&
      (field.flagOwnerId === playerId || Boolean(field.extraFlagOwnerIds?.includes(playerId)))
  );
}

/**
 * Teleport-ARRIVAL auto-win: a hero who arrives THROUGH a teleport network
 * (Monolith / colored Gate — including a reveal-travel) or crosses OUT through
 * a linked Subterranean Gate onto a hex whose designed guard still stands
 * sweeps that guard aside — an automatic victory with no fight, no experience
 * and no reward ("you fight to get IN; a monster at the EXIT is auto-won").
 * A no-op on unguarded destinations.
 */
export function autoWinArrivalGuard(state: GameState, playerId: PlayerId, field: MapFieldState | undefined): void {
  if (!field || !isFieldGuarded(field) || !field.difficulty) {
    return;
  }
  clearCustomGuard(field);
  eventNote(
    state,
    `The guards at the ${locationDefinitionName(field.location)} are swept aside by the arrival — automatic victory (no experience).`,
    playerId
  );
}

export const RESOURCE_DIE_FACES: { resource: ResourceKind; amount: number }[] = [
  { resource: "buildingMaterials", amount: 2 },
  { resource: "buildingMaterials", amount: 4 },
  { resource: "valuables", amount: 1 },
  // HOUSE RULE: the "2 valuables" face is reduced to 1 valuable, so no Resource
  // die roll ever grants more than 1 valuable (both valuables faces give 1).
  { resource: "valuables", amount: 1 },
  { resource: "gold", amount: 3 },
  { resource: "gold", amount: 6 }
];

export type TreasureDieFace = "experience" | "artifact-search" | "resource-die" | "double-resource-die";
export const TREASURE_DIE_FACES: TreasureDieFace[] = [
  "experience",
  "experience",
  "artifact-search",
  "artifact-search",
  "resource-die",
  "double-resource-die"
];

export const ASTROLOGERS_DECK_ID = "astrologers";

/** Roman numerals printed on the physical tile backs, by tile group. */
export const TILE_BACK_LABELS: Record<string, string> = {
  starting: "Ⅰ",
  far: "Ⅱ–Ⅲ",
  near: "Ⅳ–Ⅴ",
  center: "Ⅵ–Ⅶ",
  // Expansion backs: both the sea waves and the underworld pool ship a Ⅳ–Ⅴ
  // tier and a Ⅵ–Ⅶ boss tier; the per-tile band is read from the field guards
  // (see seaTileBand / subterraneanTileBand). This default is the Ⅳ–Ⅴ tier.
  sea: "Ⅳ–Ⅴ",
  subterranean: "Ⅳ–Ⅴ"
};

export function getAstrologersState(state: GameState): AstrologersState | null {
  const adventure = state.adventure;
  if (!adventure) {
    return null;
  }

  if (!adventure.astrologers) {
    adventure.astrologers = {
      activeCardId: null,
      nextResourceModifiers: { gold: 0, valuables: 0 },
      crazyWizardUsedBy: [],
      swiftWeaselUsedBy: [],
      heroEmpowerChosenRoundBy: {},
      heroEmpowerUsesBy: {}
    };
  }

  adventure.astrologers.nextResourceModifiers ??= { gold: 0, valuables: 0 };
  adventure.astrologers.crazyWizardUsedBy ??= [];
  adventure.astrologers.swiftWeaselUsedBy ??= [];
  adventure.astrologers.heroEmpowerChosenRoundBy ??= {};
  adventure.astrologers.heroEmpowerUsesBy ??= {};

  return adventure.astrologers;
}

export function getActiveAstrologersCard(state: GameState): AstrologersCardDefinition | null {
  const cardId = state.adventure?.astrologers?.activeCardId;
  return cardId ? (astrologersCardDefinitions[cardId] ?? null) : null;
}

/**
 * Sanctuary (Astrologers): whether Hero-vs-Hero attacks are banned right now.
 * The card is "during this round", so the ban applies only on the even
 * Astrologers round it was drawn — it lifts on the following (odd) Resource
 * round even though the card stays face up until the next Astrologers round.
 * Read at the PvP-combat chokepoint (startPlayerCombat).
 */
export function pvpAttacksBanned(state: GameState): boolean {
  return getActiveAstrologersCard(state)?.effect.type === "PVP_ATTACK_BAN" && state.round % 2 === 0;
}

/**
 * Mages (Astrologers): whether the Spell Book token is free AND usable without
 * a Mage Guild right now. Like Sanctuary the card is "during this round", so the
 * waiver applies only on the even Astrologers round it was drawn. Read at the
 * Spell Book gate (legal-actions offer + spellBookAction).
 */
export function freeSpellBookActive(state: GameState): boolean {
  return getActiveAstrologersCard(state)?.effect.type === "FREE_SPELL_BOOK" && state.round % 2 === 0;
}

/**
 * Multilingual Bron (Astrologers): whether a player's unit special-ability roll
 * that came up against them is rerolled once. "Until the next Astrologers'
 * round" — active the whole time the card is face up (no round-parity gate).
 * Read at each ability-roll site (Death Stare, Thunderbird/Wyvern die, extra-die
 * Paralysis, Ghost Dragon knockback, Dwarven Magic Resistance, the Satyr map
 * morale roll).
 */
export function abilityRollRerollActive(state: GameState): boolean {
  return getActiveAstrologersCard(state)?.effect.type === "ABILITY_ROLL_REROLL";
}

/** Hand limit including temporary Astrologers effects (Profuse Growth / Restart). */
export function effectiveHandLimit(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId];
  if (!player) {
    return 0;
  }

  // In-play permanents may raise the hand limit (Pandora's "hand +1").
  // Computed inline: permanents.ts imports this module, so it cannot be
  // imported back from here.
  const permanentIds = player.permanents ?? (player.permanent ? [player.permanent] : []);
  const permanentBonus = permanentIds.reduce(
    (total, cardId) => total + (cardLibrary[cardId]?.permanentEffect?.handLimitBonus ?? 0),
    0
  );
  const base = player.limits.hand + permanentBonus;

  const active = getActiveAstrologersCard(state);
  let limit = base;
  if (active?.effect.type === "HAND_LIMIT_MODIFIER") {
    const shifted = base + active.effect.amount;
    // Restart's "reduced by 2, to a minimum of 4": the floor caps the reduction
    // but never RAISES a limit already at or below it. Profuse Growth carries
    // no minimum and shifts unconditionally.
    limit = active.effect.minimum !== undefined ? Math.max(Math.min(base, active.effect.minimum), shifted) : shifted;
  }
  return Math.max(1, limit);
}

/** Base movement points of a Secondary Hero — buffs raise it from here. */
export const SECONDARY_HERO_MOVEMENT = 2;

/**
 * Movement points a hero refreshes to. The Secondary Hero's base is 2 (vs the
 * Main Hero's 3) but it is buffed the same way: Astrologers "each Hero gains
 * Movement" proclamations and any other movement modifier apply to it too.
 */
export function heroMovementMax(state: GameState, hero: HeroState): number {
  const active = getActiveAstrologersCard(state);
  const modifier = active?.effect.type === "MOVEMENT_MODIFIER" ? active.effect.amount : 0;
  return Math.max(0, hero.movementPointsMax + modifier);
}

export function getUnitDefinition(unitDefId: string): UnitDefinition | undefined {
  return coreUnitDefinitions[unitDefId];
}

export function getUnitSide(unitDefId: string, side: "few" | "pack" | "neutral"): UnitSideDefinition | undefined {
  const def = coreUnitDefinitions[unitDefId];
  if (!def) {
    return undefined;
  }

  return side === "neutral" ? def.neutral : def[side];
}

/**
 * The Creature Bank fighting side for a unit (Naval Battles optional rule).
 * Bank cards have their own statistics and abilities and NO tier — distinct
 * from the unit's Few/Pack/Neutral sides.
 */
export function getBankSide(unitDefId: string): UnitSideDefinition | undefined {
  return CREATURE_BANK_UNIT_SIDES[unitDefId];
}

function adventureRandom(state: GameState, label: string) {
  return createSeededRandom(`${state.seed}#adventure#${label}#${eventSeedNumber(state)}`);
}

// ---------------------------------------------------------------------------
// Map construction
// ---------------------------------------------------------------------------

let tileCounter = 0;

/**
 * Which guard band a sea tile belongs to. The Cove sea pool ships both Ⅳ–Ⅴ
 * and Ⅵ–Ⅶ tiles behind one wave back, so the band is read from the tile's
 * strongest guarded field — the same rule the map designer uses to offer the
 * two sea levels separately and to draw the matching face-down pool.
 */
export function seaTileBand(def: TileDefinition): "iv-v" | "vi-vii" {
  const maxDifficulty = def.fields.reduce((max, field) => Math.max(max, field.difficulty ?? 0), 0);
  return maxDifficulty >= 6 ? "vi-vii" : "iv-v";
}

/**
 * Which guard band a Subterranean tile belongs to. Exactly like the Cove sea
 * pool, the underground pool mixes a regular Ⅳ–Ⅴ tier (U1–U6, #N4–#N7 — every
 * guarded field on them is Ⅳ or Ⅴ) with a Ⅵ–Ⅶ boss tier — the three
 * underground tiles whose centre is a VII guardian: U7 and #C2 (Cyclops
 * Stockpile) and #C3 (Random Town, guarded Ⅵ/Ⅶ). The band is read from the
 * tile's strongest guarded field, the same rule {@link seaTileBand} uses, so the
 * map designer can offer the two underground levels separately and draw the
 * matching face-down pool, and a revealed boss tile reports the Ⅵ–Ⅶ back
 * numeral.
 */
export function subterraneanTileBand(def: TileDefinition): "iv-v" | "vi-vii" {
  const maxDifficulty = def.fields.reduce((max, field) => Math.max(max, field.difficulty ?? 0), 0);
  return maxDifficulty >= 6 ? "vi-vii" : "iv-v";
}

/**
 * The Roman-numeral band printed on a tile's back. Every group is uniform
 * except the Cove sea pool (see {@link seaTileBand}). Getting this right keeps
 * the revealed numerals honest and lets the BINH deck-unlock rules (which key
 * off the band) treat a Ⅵ–Ⅶ sea tile as a Center tile rather than a Near one.
 */
function tileBandLabel(group: string | undefined, def: TileDefinition | undefined): string | undefined {
  if (group === "sea" && def) {
    return seaTileBand(def) === "vi-vii" ? "Ⅵ–Ⅶ" : "Ⅳ–Ⅴ";
  }
  if (group === "subterranean" && def) {
    return subterraneanTileBand(def) === "vi-vii" ? "Ⅵ–Ⅶ" : "Ⅳ–Ⅴ";
  }
  return group ? TILE_BACK_LABELS[group] : undefined;
}

export function instantiateTile(
  adventure: AdventureState,
  tileDefId: string,
  center: HexCoord,
  rotation: number,
  faceDown: boolean,
  options: { materialize?: boolean } = {}
): MapTileState {
  tileCounter = Object.keys(adventure.tiles).length + 1;
  const id = `tile_${tileCounter}_${tileDefId}`;
  const def = allTileDefinitions[tileDefId];
  if (!def) {
    // A dangling tile id (e.g. a non-playable faction's placeholder starting
    // tile) would otherwise silently produce an empty, fieldless tile and crash
    // far downstream. Fail loudly and clearly at the source instead.
    throw new Error(`Unknown map tile "${tileDefId}" — no definition exists.`);
  }
  const group = def.group;
  const tile: MapTileState = {
    id,
    tileDefId,
    centerRow: center.row,
    centerCol: center.col,
    rotation,
    faceDown,
    backLabel: tileBandLabel(group, def),
    group
  };
  adventure.tiles[id] = tile;

  if (!faceDown && (options.materialize ?? true)) {
    materializeTileFields(adventure, tile);
  }

  return tile;
}

/**
 * The map location a designer {@link MapTileState.viiField} designation forces
 * onto a center tile's difficulty-7 objective field. "town" resolves to the
 * printed `random_town` field (the neutral conquerable town); the other two map
 * one-to-one. Single source of truth for the override in `materializeTileFields`.
 */
export const VII_FIELD_LOCATION: Record<"town" | "dragon_utopia" | "grail", string> = {
  town: "random_town",
  dragon_utopia: "dragon_utopia",
  grail: "grail"
};

/**
 * Creates the 7 field states for a revealed tile. With `onlyRing`, slot 0 (the
 * centre) is left untouched — used when RE-materializing a tile whose rotation
 * changed after its centre was already placed (the opening home-tile rotation:
 * the town and main hero sit on the centre, which is rotation-invariant, so only
 * the six ring fields turn). The ring hexes are the same six map hexes at every
 * rotation; only WHICH slot's contents land on each is what changes.
 *
 * A center-tile {@link MapTileState.viiField} designation FORCES the tile's
 * difficulty-7 objective field to the designated location (Grail / Dragon Utopia
 * / Random Town), whatever the printed tile carries there — the difficulty-7
 * guard is kept and every other property (resource / faction / amount) of the
 * original objective is dropped, since a Grail/Utopia/town field has none. A
 * designation that already matches the printed field is a no-op (the field is
 * left untouched, so a CONTROL deep-equals the undesignated field).
 */
export function materializeTileFields(
  adventure: AdventureState,
  tile: MapTileState,
  options: { onlyRing?: boolean } = {}
): void {
  const def = allTileDefinitions[tile.tileDefId];
  if (!def) {
    return;
  }

  const viiOverride = tile.viiField ? VII_FIELD_LOCATION[tile.viiField] : undefined;
  const cells = tileFootprint({ row: tile.centerRow, col: tile.centerCol }, tile.rotation);
  for (let slot = options.onlyRing ? 1 : 0; slot < cells.length; slot += 1) {
    let fieldDef = def.fields[slot];
    // Designer Ⅶ-field override: the difficulty-7 objective field becomes the
    // designated location (a clean objective field, terrain preserved). Only the
    // difficulty-7 field is touched, and only when the location actually changes.
    if (viiOverride && fieldDef.difficulty === 7 && fieldDef.location !== viiOverride) {
      fieldDef = {
        location: viiOverride,
        difficulty: 7,
        ...(fieldDef.terrain ? { terrain: fieldDef.terrain } : {})
      };
    }
    const spaceId = hexSpaceId(cells[slot]);
    const field: MapFieldState = {
      spaceId,
      tileInstanceId: tile.id,
      slot,
      location: fieldDef.location,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };
    if (fieldDef.difficulty) {
      field.difficulty = fieldDef.difficulty;
    }
    if (fieldDef.resource) {
      field.resource = fieldDef.resource;
    }
    if (fieldDef.amount !== undefined) {
      field.amount = fieldDef.amount;
    }
    if (fieldDef.faction) {
      field.faction = fieldDef.faction;
    }
    // Resolve per-hex terrain. A sea tile is NOT uniformly water: it mixes open
    // ocean with land islands (mines, towns, shrines, learning stones, witch
    // huts, gardens, tombs, trees of knowledge …) drawn directly on the tile
    // art, so terrain is decided PER HEX, never per tile. The field's explicit
    // `terrain` is the single source of truth — every island hex on a sea tile
    // carries `terrain: "land"` and the rare water hex on a land tile carries
    // `terrain: "water"`. Only a field that omits it inherits the tile's overall
    // terrain (water tile -> water hex, anything else -> land hex). Reading the
    // hex art instead of guessing from the location name is what stops a heroine
    // from "wading" onto a dry island or fighting a naval battle on solid ground.
    const isWater = fieldDef.terrain
      ? fieldDef.terrain === "water"
      : def.terrain === "water";
    if (isWater) {
      field.terrain = "water";
    }
    // Fold the designer center-hex customization onto the tile's difficulty-7
    // field (the objective — every center tile has exactly one). Attached
    // whether or not the location was overridden above, so a customization on a
    // printed objective carries too. The reward/VP are granted once at visit
    // time (`centerHexClaimed` latches so a re-capture never re-pays); a guard
    // override REPLACES the printed difficulty-7 guard — a level becomes the
    // field's Field Difficulty (Quick Combat / experience follow it as usual), a
    // certain army is minted at fight time from `customGuardUnits` with the
    // difficulty derived from its tiers. Legacy pre-centerHex snapshots carried
    // the bonus as `viiFieldReward`/`viiFieldVp` (with a `viiField` gate) — fold
    // those too so a mid-flight game keeps its designed bonus.
    if (fieldDef.difficulty === 7) {
      const centerHex = tile.centerHex;
      if (centerHex?.reward) {
        field.centerHexReward = centerHex.reward;
      }
      if (centerHex?.vp !== undefined) {
        field.centerHexVp = centerHex.vp;
      }
      if (centerHex?.guard?.units && centerHex.guard.units.length > 0) {
        field.customGuardUnits = [...centerHex.guard.units];
        field.difficulty = customGuardArmyDifficulty(centerHex.guard.units);
      } else if (centerHex?.guard?.level) {
        field.difficulty = centerHex.guard.level;
      }
      if (tile.viiField) {
        if (tile.viiFieldReward && !field.centerHexReward) {
          field.centerHexReward = tile.viiFieldReward;
        }
        if (tile.viiFieldVp !== undefined && field.centerHexVp === undefined) {
          field.centerHexVp = tile.viiFieldVp;
        }
      }
    }
    adventure.fields[spaceId] = field;
  }
}

export function getTileFootprintSpaceIds(tile: MapTileState): MapSpaceId[] {
  return tileFootprint({ row: tile.centerRow, col: tile.centerCol }, tile.rotation).map(hexSpaceId);
}

/**
 * Disruption (Astrologers): rotate an already-revealed tile IN PLACE without
 * losing any accumulated field state. The six ring hexes are the same six map
 * hexes at every rotation — only WHICH slot's field sits on each changes — so
 * the rotation is a pure permutation: each ring `MapFieldState` object moves,
 * whole, to the hex its slot occupies under the new rotation (flags, Black
 * Cubes, settlements, banks, obelisk rolls all travel with it). The centre
 * (slot 0) is rotation-invariant. This is deliberately NOT
 * `materializeTileFields`, which rebuilds fields from the definition and would
 * wipe that state. Borders/edges derive from the definition + `tile.rotation`
 * at query time, so they follow automatically.
 *
 * The caller is responsible for eligibility (no hero/town/gate on the tile —
 * see disruptionEligibleTiles); this routine only refuses a tile whose seven
 * fields are not all materialized, returning false untouched.
 */
export function rotateTileInPlace(adventure: AdventureState, tile: MapTileState, rotation: number): boolean {
  const normalized = ((rotation % 6) + 6) % 6;
  if (normalized === tile.rotation) {
    return false;
  }

  const center = { row: tile.centerRow, col: tile.centerCol };
  const oldCells = tileFootprint(center, tile.rotation);
  const newCells = tileFootprint(center, normalized);

  const bySlot: MapFieldState[] = [];
  for (let slot = 1; slot < oldCells.length; slot += 1) {
    const field = adventure.fields[hexSpaceId(oldCells[slot])];
    if (!field || field.tileInstanceId !== tile.id) {
      return false;
    }
    bySlot[slot] = field;
  }

  // Same six keys before and after: writing all six re-keys every ring hex, so
  // no stale duplicate can survive the permutation.
  for (let slot = 1; slot < newCells.length; slot += 1) {
    const spaceId = hexSpaceId(newCells[slot]);
    const field = bySlot[slot];
    field.spaceId = spaceId;
    adventure.fields[spaceId] = field;
  }
  tile.rotation = normalized;
  return true;
}

/**
 * Disruption (Astrologers): the tiles a player may rotate right now. Eligible =
 * revealed and fully materialized, no Hero (main or secondary, any seat) on any
 * of its seven hexes, and not yet rotated during this Disruption resolution.
 * Tiles carrying a Town or a Subterranean Gate half are excluded as an engine
 * safety reading: a Town's `fieldId` and a Gate pair's `gateLinkSpaceId` anchor
 * to fixed hexes that a rotation would leave dangling.
 */
export function disruptionEligibleTiles(state: GameState): MapTileState[] {
  const adventure = state.adventure;
  if (!adventure) {
    return [];
  }

  const rotated = new Set(adventure.astrologers?.disruptionRotatedTileIds ?? []);
  const heroSpaces = new Set(
    Object.values(state.heroes)
      .map((hero) => hero.spaceId)
      .filter((spaceId): spaceId is MapSpaceId => Boolean(spaceId))
  );
  const townSpaces = new Set(
    Object.values(state.towns)
      .map((town) => town.fieldId)
      .filter((fieldId): fieldId is MapSpaceId => Boolean(fieldId))
  );

  return Object.values(adventure.tiles).filter((tile) => {
    if (tile.faceDown || tile.awaitingRotation || rotated.has(tile.id)) {
      return false;
    }
    const spaceIds = getTileFootprintSpaceIds(tile);
    for (const spaceId of spaceIds) {
      const field = adventure.fields[spaceId];
      if (!field || field.tileInstanceId !== tile.id) {
        return false; // not (fully) materialized — nothing real to rotate
      }
      if (heroSpaces.has(spaceId) || townSpaces.has(spaceId)) {
        return false;
      }
      if (field.gateToTileId || field.gateLinkSpaceId) {
        return false;
      }
    }
    return true;
  });
}

/** A human-readable pick label for a Disruption tile: its printed id + a landmark. */
export function disruptionTileLabel(state: GameState, tile: MapTileState): string {
  const adventure = state.adventure;
  const landmarks: string[] = [];
  if (adventure) {
    for (const spaceId of getTileFootprintSpaceIds(tile)) {
      const field = adventure.fields[spaceId];
      const name = field ? locationDefinitions[field.location]?.name : null;
      if (field && name && locationDefinitions[field.location]?.category !== "blocked") {
        landmarks.push(field.flagOwnerId ? `${name} (${state.players[field.flagOwnerId]?.name ?? "flagged"})` : name);
      }
      if (landmarks.length === 2) {
        break;
      }
    }
  }
  return landmarks.length > 0 ? `${tile.tileDefId} — ${landmarks.join(", ")}` : tile.tileDefId;
}

export function findTileAtSpace(adventure: AdventureState, spaceId: MapSpaceId): MapTileState | null {
  const coord = parseHexSpaceId(spaceId);
  if (!coord) {
    return null;
  }

  for (const tile of Object.values(adventure.tiles)) {
    if (getTileFootprintSpaceIds(tile).includes(spaceId)) {
      return tile;
    }
  }

  return null;
}

/**
 * Per-hero adventure movement capabilities granted by spells/effects this turn
 * (Fly, Angel Wings, Water Walk, Dessa's Logistics specialty). They change what
 * the pathfinding lets a hero cross or stop on.
 */
export type HeroMovementCapabilities = {
  /** Fly / Angel Wings / Pathfinding: may move through blocked fields (never stop on one). */
  moveThrough: boolean;
  /** Water Walk / expert Pathfinding: may enter, cross and stop on sea fields with no coastline halt. */
  waterWalk: boolean;
  /**
   * Pathfinding: may move *through* fields holding Neutral Units / enemy Heroes
   * without resolving them (Combat only if the hero ENDS there). Defaults off.
   */
  passEncounters?: boolean;
  /**
   * Pathfinding: may cross yellow (sealed) borders — printed internal border
   * lines and sealed outer tile edges alike. Defaults off.
   */
  crossSealedBorders?: boolean;
  /**
   * Expert Pathfinding: may step directly across a Surface↔Subterranean tile
   * edge without a Subterranean Gate (Dimension Door / Fly cannot). Defaults off.
   */
  crossLayers?: boolean;
};

const NO_MOVEMENT_CAPABILITIES: HeroMovementCapabilities = { moveThrough: false, waterWalk: false };

/**
 * The movement-modifying effects active for a hero's controller this turn.
 * Movement buffs in this engine are player-scoped — they reach every hero the
 * player commands, the Secondary Hero included — matching how
 * GAIN_HERO_MOVEMENT already applies to all of a player's heroes.
 */
export function getHeroMovementCapabilities(state: GameState, hero: HeroState): HeroMovementCapabilities {
  let moveThrough = false;
  let waterWalk = false;
  let passEncounters = false;
  let crossSealedBorders = false;
  let crossLayers = false;
  for (const effect of state.activeEffects) {
    if (effect.controllerId !== hero.controllerId) {
      continue;
    }
    for (const modifier of effect.modifiers) {
      if (modifier.type === "HERO_MOVE_THROUGH") {
        moveThrough = true;
      } else if (modifier.type === "HERO_WATER_WALK") {
        waterWalk = true;
      } else if (modifier.type === "HERO_PATHFINDING") {
        // Passing THROUGH Neutral-Unit / enemy-Hero fields (Combat only if the
        // hero ENDS there) is the PRINTED BASIC power — granted by both sides in
        // both modes.
        passEncounters = true;
        if (houseRuleEnabled(state, "pathfinding-expert")) {
          // BINH house rule ON: the basic side bundles BOTH printed halves
          // (pass-through AND crossing yellow borders / blocked fields); the
          // expert side then adds the coastline (no halt) + Surface↔Subterranean
          // crossing — a strict superset.
          moveThrough = true;
          crossSealedBorders = true;
          if (modifier.expert) {
            waterWalk = true;
            crossLayers = true;
          }
        } else if (modifier.expert) {
          // Printed card (rule OFF / legacy): crossing yellow borders & blocked
          // fields (never ending on one) is the EXPERT power. The basic side
          // grants only the pass-through above, and NEITHER side crosses the
          // coastline or steps Surface↔Subterranean.
          moveThrough = true;
          crossSealedBorders = true;
        }
      }
    }
  }
  return moveThrough || waterWalk || passEncounters || crossSealedBorders || crossLayers
    ? { moveThrough, waterWalk, passEncounters, crossSealedBorders, crossLayers }
    : NO_MOVEMENT_CAPABILITIES;
}

/**
 * Lift a hero's sea-halt the instant its controller gains Water Walk this turn
 * (the Water Walk Spell or expert Pathfinding). `movementHaltedThisTurn` is set
 * ONLY by a sea step (wading the coastline) or a battle fought at sea — both the
 * very "coastline rule" Water Walk negates — so once a halted hero has Water
 * Walk that halt no longer applies and the hero may keep sailing with the
 * movement points it kept. Without this, a player who walks onto the sea FIRST
 * (the natural click-to-move) and only then plays Water Walk / expert
 * Pathfinding stays frozen for the rest of the turn even though the engine would
 * never have halted the crossing had the buff been active — the long-reported
 * "can't keep moving after stepping onto the sea once" bug. A no-op for any hero
 * that is not halted or has not gained Water Walk, so it is safe to call after
 * any effect that might grant it.
 */
export function liftSeaHaltForWaterWalk(state: GameState, playerId: PlayerId): void {
  for (const hero of Object.values(state.heroes)) {
    if (
      hero.controllerId === playerId &&
      hero.movementHaltedThisTurn &&
      getHeroMovementCapabilities(state, hero).waterWalk
    ) {
      hero.movementHaltedThisTurn = false;
    }
  }
}

/**
 * Whether a specific hex is open sea (water terrain). This is per-hex, not
 * per-tile: a sea tile mixes water hexes (ocean and sea features) with land
 * hexes (island structures), so the field's resolved `terrain` is consulted,
 * not the tile's overall terrain.
 */
export function isSeaField(state: GameState, spaceId: MapSpaceId): boolean {
  return state.adventure?.fields[spaceId]?.terrain === "water";
}

/**
 * The map "layer" a tile belongs to. Subterranean tiles form their own layer
 * (the underground); every other tile — land and sea alike — is the Surface.
 * The two layers may only be crossed through a Subterranean Gate (or a Town
 * Portal Spell, which teleports and so never consults {@link canCrossEdge}).
 *
 * The layer is the tile *group*, NOT its `terrain`: the underground layer is
 * exactly the Stronghold tiles with the unique cavern back (`group:
 * "subterranean"`, drawn from the subterranean pool). Several core tiles (F2,
 * F5, N2, …) carry `terrain: "subterranean"` for cave-themed ART but keep a
 * normal Far/Near/Center back and live on the Surface — they must NOT be
 * treated as underground.
 */
export type MapLayer = "surface" | "subterranean";

export function tileLayer(tile: MapTileState | undefined): MapLayer {
  return tile?.group === "subterranean" ? "subterranean" : "surface";
}

/**
 * The map layer a materialized field sits on. A designer STANDALONE object hex
 * has no backing tile, so it carries its layer directly
 * ({@link MapFieldState.standaloneLayer}, fixed at setup from the tiles it
 * touches); every other field reads it from the tile it was materialized from.
 * This is what keeps the Surface↔Subterranean divide holding for standalone hexes
 * exactly like tile hexes in {@link canCrossEdge}.
 */
export function mapFieldLayer(state: GameState, field: MapFieldState | undefined): MapLayer {
  if (!field) {
    return "surface";
  }
  if (field.standalone && field.standaloneLayer) {
    return field.standaloneLayer;
  }
  return tileLayer(state.adventure?.tiles[field.tileInstanceId]);
}

/** Which layer a field sits on, taken from the tile it was materialized from. */
export function fieldLayer(state: GameState, spaceId: MapSpaceId | null | undefined): MapLayer {
  const field = spaceId ? state.adventure?.fields[spaceId] : undefined;
  return mapFieldLayer(state, field);
}

/**
 * Whether two fields are the two halves of one Subterranean Gate Token — the
 * single sanctioned Surface↔Subterranean crossing ("Treat both Fields of the
 * Subterranean Gate Token as one Field"). Both must be gate fields that name
 * each other as their linked partner.
 */
export function gateFieldsLinked(a: MapFieldState | undefined, b: MapFieldState | undefined): boolean {
  return (
    a !== undefined &&
    b !== undefined &&
    a.location === "subterranean_gate" &&
    b.location === "subterranean_gate" &&
    a.gateLinkSpaceId === b.spaceId &&
    b.gateLinkSpaceId === a.spaceId
  );
}

/**
 * Whether taking a single step from `from` to `to` ends the hero's movement for
 * the turn. Without Water Walk, only a step that crosses the coastline — land to
 * sea (embarking) or sea to land (disembarking) — halts the hero: they keep
 * their remaining movement points (a neutral combat may still spend them) but
 * cannot take another step. Moving within the sea (sea→sea) or on land
 * (land→land) is normal, and Water Walk removes the coastline halt entirely.
 */
export function seaStepHalts(
  state: GameState,
  from: MapSpaceId,
  to: MapSpaceId,
  movement: HeroMovementCapabilities = NO_MOVEMENT_CAPABILITIES
): boolean {
  if (movement.waterWalk) {
    return false;
  }
  const fromSea = isSeaField(state, from);
  const toSea = isSeaField(state, to);
  if (fromSea === toSea) {
    return false; // within the sea or on land: never halts
  }
  // Wind (Astrologers): entering the sea FROM a land field (embarking) no longer
  // halts the hero — it keeps moving. Disembarking (sea→land) still halts. With
  // no sea tiles this branch is never reached, so "ignore with no sea" holds.
  if (!fromSea && toSea && getActiveAstrologersCard(state)?.effect.type === "SEA_CONTINUE_AFTER_EMBARK") {
    return false;
  }
  return true;
}

/**
 * Whether a hero may cross between two adjacent hexes: both must belong to
 * revealed tiles, the destination must not be a blocked field (unless the hero
 * is flying / has move-through), and when the hexes belong to different tiles
 * neither side's outer edge may be sealed (solid yellow border on the tile).
 * Stepping onto the sea is allowed here; whether it halts the hero afterwards
 * is decided by {@link seaStepHalts}.
 */
export function canCrossEdge(
  state: GameState,
  from: MapSpaceId,
  to: MapSpaceId,
  movement: HeroMovementCapabilities = NO_MOVEMENT_CAPABILITIES
): boolean {
  const adventure = state.adventure;
  if (!adventure) {
    return false;
  }

  const fromField = adventure.fields[from];
  const toField = adventure.fields[to];
  if (!fromField || !toField) {
    return false;
  }

  // The two halves of a Subterranean Gate Token are "one Field": the step
  // between them is always allowed in either direction, regardless of layer or
  // any printed border — it is the tunnel the Gate carves between the tiles.
  if (gateFieldsLinked(fromField, toField)) {
    return true;
  }

  // Surface ↔ Subterranean divide: a Hero "cannot move between a Surface and a
  // Subterranean Tile without using a Subterranean Gate in between." The only
  // crossable layer edge is the linked Gate handled above; "no other movement
  // effects from cards can allow you to move from one to the other", so Fly /
  // Angel Wings / Water Walk never open any other one — this is checked before
  // the blocked-field rule so a flyer cannot slip across onto a blocked hex of
  // the far layer either. Expert Pathfinding is the sole exception (its
  // `crossLayers`): it lets the Hero step directly between the layers anywhere
  // they touch, falling through to the blocked-field rule so it still cannot
  // STOP on a blocked far-layer hex. A designer STANDALONE object hex has no
  // backing tile, so its layer comes from {@link mapFieldLayer} (fixed at setup):
  // a surface standalone hex never connects to an underground tile hex, and back.
  if (mapFieldLayer(state, fromField) !== mapFieldLayer(state, toField) && !movement.crossLayers) {
    return false;
  }

  if (locationDefinitions[toField.location]?.category === "blocked") {
    // Blocked fields stop ground movement; Fly / Angel Wings let a hero pass
    // over them (classifyHeroStep still forbids ending the move there).
    return movement.moveThrough;
  }

  // A hero may always step from land onto an adjacent sea field. Without Water
  // Walk that step is a forced stop (classifyHeroStep returns "stop" and the
  // mover is halted for the turn); with Water Walk the sea is normal terrain.
  // Either way the edge itself is crossable, so no sea gate is applied here.

  // Pathfinding traverses yellow borders (the wiki's "regular" effect): both the
  // printed internal lines and the sealed outer tile edges below give way to it.
  if (movement.crossSealedBorders) {
    return true;
  }

  // Designer per-edge yellow borders (`borderEdges`): a single sealed hex edge
  // blocks the crossing in BOTH directions — a same-tile INNER line or a
  // cross-tile OUTER line alike. Checked here — after the linked-gate / layer /
  // blocked / Pathfinding rules, before the same-tile internal-line and cross-tile
  // arc rules — so it takes EXACTLY the whole-arc precedence: a linked Gate still
  // beats it and Expert Pathfinding still bypasses it, while Fly does not.
  if (isDesignedEdgeSealedBetween(adventure, from, fromField, to, toField)) {
    return false;
  }

  if (fromField.tileInstanceId === toField.tileInstanceId) {
    // Printed yellow lines inside a tile block ground movement between the
    // two fields (none on core tiles; expansion tiles may declare them).
    const tile = adventure.tiles[fromField.tileInstanceId];
    const def = tile ? allTileDefinitions[tile.tileDefId] : undefined;
    if (def && hasInternalBorder(def, fromField.slot, toField.slot)) {
      return false;
    }
    return true;
  }

  // Creature Banks draw no borders (same open-edge reading as discovery): a hero
  // may walk ONTO a bank from an adjacent Tile and walk OFF it afterward. A
  // guarded bank still forces a stop via classifyHeroStep, so it is never a
  // free pass-through bridge across a Tile edge mid-path.
  const fromSealed =
    fromField.location !== "creature_bank" && isOuterEdgeSealed(adventure, fromField);
  const toSealed = toField.location !== "creature_bank" && isOuterEdgeSealed(adventure, toField);
  return !fromSealed && !toSealed;
}

/**
 * THE single source of truth for "is this tile slot's outer edge sealed by a
 * printed yellow border line". A ring slot (1–6) carries its border as one
 * full outer arc — all three outward edges seal together — keyed by the slot's
 * local direction in the tile definition (`outerImpassable[slot - 1]`); the
 * centre slot (0) is never sealed. Rotation turns the arc with the tile, so the
 * lookup stays in the tile's own frame.
 *
 * Every geometry decision about crossing/discovering/placing across a tile's
 * outer border MUST go through this (directly, or via {@link isOuterEdgeSealed}
 * for a placed field) so the ordinary-movement path, the discovery gate and the
 * Far-tile placement reachability can never drift apart again. Do not re-derive
 * `outerImpassable[...]` anywhere else.
 */
export function isTileSlotOuterSealed(tileDefId: string, slot: number): boolean {
  if (slot === 0) {
    return false;
  }
  const def = allTileDefinitions[tileDefId];
  return def ? Boolean(def.outerImpassable[slot - 1]) : false;
}

/** A designer `extraBorders` list holds at most this many entries (one per board direction). */
export const MAX_DESIGNED_BORDERS = 6;

/**
 * Normalises a designer-placed border list to the canonical shape the whole
 * engine assumes: UNIQUE integer board directions 0–5, ascending, capped at
 * {@link MAX_DESIGNED_BORDERS}. Garbage — non-integers, out-of-range, duplicates
 * — is dropped. Shared by the persistence sanitiser (`sanitizeTile`) and the
 * setup validator ({@link validateCustomMapPlan}) so a stored map and a
 * freshly-designed one seal identically.
 */
export function normalizeDesignedBorders(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<number>();
  for (const raw of value) {
    if (Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) <= 5) {
      seen.add(raw as number);
    }
  }
  return [...seen].sort((a, b) => a - b).slice(0, MAX_DESIGNED_BORDERS);
}

/**
 * A designer per-EDGE border list (`borderEdges`) holds at most this many
 * distinct physical edges: a 7-hex flower has 30 (18 outer + 12 inner).
 */
export const MAX_DESIGNED_BORDER_EDGES = 30;

/**
 * Normalises a designer per-edge border list ({@link MapTileState.borderEdges} /
 * {@link CustomMapTilePlan.borderEdges}) to the canonical shape the engine
 * assumes: every entry an integer 0–41 folded to its {@link canonicalTileEdgeCode}
 * (so the two codes of an inner edge collapse to one), deduped, ascending, capped
 * at {@link MAX_DESIGNED_BORDER_EDGES}. Garbage — non-integers, out-of-range — is
 * dropped. Shared by the persistence sanitiser and the setup validator so a
 * stored map and a freshly-designed one seal identically (the per-edge twin of
 * {@link normalizeDesignedBorders}).
 */
export function normalizeDesignedBorderEdges(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<number>();
  for (const raw of value) {
    if (Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) <= 41) {
      const code = raw as number;
      seen.add(canonicalTileEdgeCode(Math.floor(code / 6), code % 6));
    }
  }
  return [...seen].sort((a, b) => a - b).slice(0, MAX_DESIGNED_BORDER_EDGES);
}

/**
 * The rotation-0 footprint index a placed field occupies: slot 0 is the centre
 * (index 0); a ring slot `s` sits at `slotDirection(s, rotation) + 1` (the
 * absolute direction it faces, plus one for the centre). This is the frame the
 * `borderEdges` codes live in, so the lookup stays rotation-proof.
 */
function fieldFootprintIndex(slot: number, rotation: number): number {
  if (slot === 0) {
    return 0;
  }
  const direction = slotDirection(slot, rotation);
  return direction === null ? 0 : direction + 1;
}

/**
 * Whether a PLACED tile seals one hex edge of the field in `slot` toward absolute
 * direction `absDir` with a DESIGNER per-edge yellow border (`tile.borderEdges`).
 * Allocation-light (a table lookup plus a ≤30-entry `includes`) so it is safe on
 * the movement BFS hot path.
 */
function tileEdgeDesignedSealed(tile: MapTileState, slot: number, absDir: number): boolean {
  const edges = tile.borderEdges;
  if (!edges || edges.length === 0) {
    return false;
  }
  return edges.includes(canonicalTileEdgeCode(fieldFootprintIndex(slot, tile.rotation), absDir));
}

/**
 * Whether a DESIGNER per-edge yellow border seals the crossing between two
 * adjacent placed fields: sealed if the FROM tile lists the edge `(fromSlot,
 * dir)` OR the TO tile lists the mirror edge `(toSlot, dir+3)`. Covers a
 * same-tile INNER line and a cross-tile OUTER line uniformly — unlike the
 * whole-arc `extraBorders`, which only seals outer arcs. The coord parse is paid
 * only when a border list is actually present on either side, so an ordinary map
 * (no designed edges) skips it entirely.
 */
export function isDesignedEdgeSealedBetween(
  adventure: AdventureState,
  from: MapSpaceId,
  fromField: MapFieldState,
  to: MapSpaceId,
  toField: MapFieldState
): boolean {
  const fromTile = adventure.tiles[fromField.tileInstanceId];
  const toTile = adventure.tiles[toField.tileInstanceId];
  const fromHas = Boolean(fromTile?.borderEdges && fromTile.borderEdges.length > 0);
  const toHas = Boolean(toTile?.borderEdges && toTile.borderEdges.length > 0);
  // Field-level borders: a STANDALONE object hex carries its own edge list
  // (it has no backing tile). Same seal, same both-direction rule.
  const fromFieldHas = Boolean(fromField.borderEdges && fromField.borderEdges.length > 0);
  const toFieldHas = Boolean(toField.borderEdges && toField.borderEdges.length > 0);
  if (!fromHas && !toHas && !fromFieldHas && !toFieldHas) {
    return false;
  }
  const fromCoord = parseHexSpaceId(from);
  const toCoord = parseHexSpaceId(to);
  if (!fromCoord || !toCoord) {
    return false;
  }
  const direction = hexDirectionBetween(fromCoord, toCoord);
  if (direction === null) {
    return false;
  }
  if (fromHas && fromTile && tileEdgeDesignedSealed(fromTile, fromField.slot, direction)) {
    return true;
  }
  if (toHas && toTile && tileEdgeDesignedSealed(toTile, toField.slot, (direction + 3) % 6)) {
    return true;
  }
  if (fromFieldHas && fromField.borderEdges!.includes(direction)) {
    return true;
  }
  if (toFieldHas && toField.borderEdges!.includes((direction + 3) % 6)) {
    return true;
  }
  return false;
}

/**
 * Whether ring `slot` of a PLACED tile is sealed by a DESIGNER-placed yellow
 * border (`tile.extraBorders`, absolute board directions 0–5) rather than by
 * the printed art. Unlike {@link isTileSlotOuterSealed} (a def-level, tile-frame
 * lookup) this reads the placed instance's live rotation: the field in slot `s`
 * of a tile rotated by `r` faces absolute direction `slotDirection(s, r) =
 * (s − 1 + r) % 6`, so a designed border on that absolute direction seals this
 * slot no matter how the tile was rotated or which def a face-down slot drew.
 * The centre (slot 0) is never sealed.
 */
export function isTileSlotDesignedSealed(tile: MapTileState, slot: number): boolean {
  if (slot === 0 || !tile.extraBorders || tile.extraBorders.length === 0) {
    return false;
  }
  const direction = slotDirection(slot, tile.rotation);
  return direction !== null && tile.extraBorders.includes(direction);
}

export function isOuterEdgeSealed(adventure: AdventureState, field: MapFieldState): boolean {
  const tile = adventure.tiles[field.tileInstanceId];
  if (!tile) {
    return false;
  }
  // A slot's outer arc is sealed by the PRINTED tile line (`outerImpassable`,
  // tile-frame) OR by a DESIGNER-placed yellow border (`extraBorders`, absolute
  // frame). Both feed the single source of truth so every crossing / discovery /
  // placement read treats a deliberate designed line exactly like a printed one.
  return isTileSlotOuterSealed(tile.tileDefId, field.slot) || isTileSlotDesignedSealed(tile, field.slot);
}

/**
 * Whether a hero STANDING on `field` is walled off by a printed yellow border
 * from ordinarily DISCOVERING a Tile across its outer edge.
 *
 * This is {@link isOuterEdgeSealed} with one exception: a Creature Bank draws NO
 * border (it "reads as fully open" — see `getTileBorderSegments`), so a hero
 * standing on a bank faces OPEN outer edges and may flip an adjacent face-down
 * Tile — even though the Blocked Field the bank replaced kept its slot's sealed
 * arc in the tile definition. Discovery only reveals the Tile; moving OUT of a
 * bank across a Tile edge is a separate question still governed by the bank's own
 * rule in {@link canCrossEdge}. Keeping `isOuterEdgeSealed` untouched preserves
 * its slot-primitive invariant; only the hero-vantage discovery gate takes this
 * bank exception.
 */
export function heroFieldSealedForDiscovery(adventure: AdventureState, field: MapFieldState): boolean {
  return field.location !== "creature_bank" && isOuterEdgeSealed(adventure, field);
}

/**
 * Whether a hero on `heroField` (at `heroSpaceId`) may DISCOVER the adjacent
 * face-down `tile` across an OPEN border. Two rules combine:
 *  - the WHOLE-ARC rule ({@link heroFieldSealedForDiscovery}: a printed arc or a
 *    designed `extraBorders` arc seals the hero's outward edges — but a
 *    border-free Creature Bank the hero stands on is open), AND
 *  - the per-EDGE designed borders (`borderEdges`): at least ONE shared hex edge
 *    from the hero's field into the tile's footprint must be un-sealed on either
 *    side. A designed EDGE seals even from a bank field (explicit designer intent
 *    — the whole-arc bank exception above does NOT extend to a line the designer
 *    drew deliberately on that edge), unlike the whole-arc rule.
 *
 * Adjacency is the caller's job (`isTileAdjacentToSpace`); this only answers the
 * border question. Shared by the discovery OFFER (`canHeroDiscoverAdjacentTile`)
 * and HANDLER (`revealTileForHero`) so the two can never drift.
 */
export function heroCanDiscoverTileAcrossBorders(
  adventure: AdventureState,
  heroSpaceId: MapSpaceId,
  heroField: MapFieldState,
  tile: MapTileState
): boolean {
  if (heroFieldSealedForDiscovery(adventure, heroField)) {
    return false;
  }
  const heroTile = adventure.tiles[heroField.tileInstanceId];
  const tileEdges = tile.borderEdges;
  // A standalone object hex carries its own field-level edge list.
  const heroFieldEdges = heroField.borderEdges;
  const heroHasEdges = Boolean(
    (heroTile?.borderEdges && heroTile.borderEdges.length > 0) || (heroFieldEdges && heroFieldEdges.length > 0)
  );
  const tileHasEdges = Boolean(tileEdges && tileEdges.length > 0);
  if (!heroHasEdges && !tileHasEdges) {
    // No per-edge borders anywhere: the whole-arc rule (already passed) decides,
    // exactly as before per-edge borders existed.
    return true;
  }
  const heroCoord = parseHexSpaceId(heroSpaceId);
  if (!heroCoord) {
    return false;
  }
  const footprint0 = tileFootprint({ row: tile.centerRow, col: tile.centerCol }, 0);
  let sharedEdge = false;
  for (let direction = 0; direction < 6; direction += 1) {
    const neighbor = hexNeighbor(heroCoord, direction);
    const footprintIndex = footprint0.findIndex((cell) => hexEquals(cell, neighbor));
    if (footprintIndex < 0) {
      continue; // not an edge into this tile
    }
    sharedEdge = true;
    const heroSideSealed =
      (heroHasEdges && heroTile ? tileEdgeDesignedSealed(heroTile, heroField.slot, direction) : false) ||
      Boolean(heroFieldEdges && heroFieldEdges.includes(direction));
    const tileSideSealed =
      tileHasEdges &&
      Boolean(tileEdges) &&
      tileEdges!.includes(canonicalTileEdgeCode(footprintIndex, (direction + 3) % 6));
    if (!heroSideSealed && !tileSideSealed) {
      return true; // an OPEN doorway into the tile
    }
  }
  // Every shared edge is sealed → no ordinary discovery. (With no shared edge at
  // all — never, once the caller has checked adjacency — don't over-block.)
  return !sharedEdge;
}

export function getAdjacentSpaceIds(spaceId: MapSpaceId): MapSpaceId[] {
  const coord = parseHexSpaceId(spaceId);
  if (!coord) {
    return [];
  }

  return hexNeighbors(coord).map(hexSpaceId);
}

export function heroAtSpace(state: GameState, spaceId: MapSpaceId, excludeHeroId?: HeroId): HeroState | null {
  for (const hero of Object.values(state.heroes)) {
    if (hero.id !== excludeHeroId && hero.spaceId === spaceId) {
      return hero;
    }
  }

  return null;
}

/** Whether the field still has undefeated neutral guards. */
export function isFieldGuarded(field: MapFieldState): boolean {
  // Creature Banks have no Field Difficulty: they are guarded until the win is
  // marked with a Black Cube (rulebook p.66).
  if (field.location === "creature_bank" && field.bankId) {
    return !field.blackCube;
  }
  return Boolean(field.difficulty) && !field.blackCube && !field.everFlagged;
}

/**
 * What happens when a hero walks into a field:
 *  - "open": nothing stops the hero (empty, used-up, or own-flagged fields) —
 *    valid as both a stop and a pass-through.
 *  - "stop": entering triggers something (guards, enemy heroes, unvisited
 *    locations, flags to steal) so the path must end here.
 *  - "encounter": Pathfinding over a Neutral-Unit / enemy-Hero field — the hero
 *    may walk THROUGH it without resolving (no Combat) or END there (Combat
 *    begins). Like "open" for reachability, but a non-final path step passes
 *    over it instead of fighting.
 *  - "pass-only": an allied hero stands here; you may walk through but not stay.
 *  - "block": never enterable (blocked fields, sanctuary-protected enemies).
 */
export type HeroStepKind = "open" | "stop" | "encounter" | "pass-only" | "block";

export function classifyHeroStep(
  state: GameState,
  hero: HeroState,
  spaceId: MapSpaceId,
  movement: HeroMovementCapabilities = NO_MOVEMENT_CAPABILITIES
): HeroStepKind {
  const adventure = state.adventure;
  const field = adventure?.fields[spaceId];
  if (!adventure || !field) {
    return "block";
  }

  const playerId = hero.controllerId;
  const location = locationDefinitions[field.location];
  if (location?.category === "blocked") {
    // Flying (move-through) turns a blocked field into a hex the hero may pass
    // over but never stop on; otherwise it is impassable.
    return movement.moveThrough ? "pass-only" : "block";
  }

  // A designer Barrier may be ENTERED only by a player holding a same-color
  // Keymaster's Tent flag ("you are never allowed to enter the field unless
  // you visited the keymaster's tent in its color"). To everyone else it
  // behaves exactly like a Blocked Field — Fly may pass over, never land.
  if (field.location === "barrier" && !playerHoldsTentFlag(state, playerId, field.gatePair)) {
    return movement.moveThrough ? "pass-only" : "block";
  }

  const occupant = heroAtSpace(state, spaceId, hero.id);
  if (occupant) {
    if (occupant.controllerId === playerId) {
      return "pass-only";
    }
    // Heroes inside a Sanctuary cannot be attacked; the rulebook lets
    // friendly heroes move through them but never stop there.
    if (location?.passive?.protectsFromAttack) {
      return "pass-only";
    }
    // Pathfinding walks through an enemy Hero's field; Combat only if you END here.
    return movement.passEncounters ? "encounter" : "stop";
  }

  if (isFieldGuarded(field) && field.flagOwnerId !== playerId) {
    // Pathfinding walks through Neutral Units; Combat only if you END here.
    return movement.passEncounters ? "encounter" : "stop";
  }

  // Dragon Conqueror: a captured Dragon Utopia is a stronghold — its holder
  // walks on and off freely, everyone else must stop to besiege it.
  if (field.location === "dragon_utopia" && field.flagOwnerId && adventureVictoryMode(state) === "dragon-conqueror") {
    return field.flagOwnerId === playerId ? "open" : "stop";
  }

  // Obelisk role "monolith": the field is a Monolith network member, so entering
  // it teleports — it can NEVER be walked through, even after it is flagged
  // (unlike its classic flaggable "open once mine" behaviour below). Mirrors a
  // real Monolith token (category "revisitable" → always "stop").
  if (field.location === "obelisk" && obeliskRoleIsMonolith(state)) {
    return "stop";
  }

  if (!location || location.category === "empty") {
    return "open";
  }
  if (location.category === "visitable") {
    return field.blackCube ? "open" : "stop";
  }
  if (location.category === "revisitable") {
    return "stop";
  }
  if (location.category === "flaggable") {
    const mine = field.flagOwnerId === playerId || Boolean(field.extraFlagOwnerIds?.includes(playerId));
    return mine ? "open" : "stop";
  }

  return "stop";
}

/**
 * Whether a hero that ENDS its move on `to` this turn walks straight into a
 * battle: an attackable enemy hero stands there (not Sanctuary-protected), or
 * the field still has undefeated neutral guards the hero has not flagged. Mirrors
 * the combat-starting branches of resolveHeroArrival (an enemy hero →
 * startPlayerCombat, guards → startNeutralEncounter). The UI uses this to warn
 * "you can still buy troops" before committing the move, so the player can keep
 * walking into the fight or stop to recruit first. It deliberately does NOT count
 * the optional enemy-town garrison defence (the owner may simply let it fall, so
 * it is not a guaranteed battle) — only the two cases that always start Combat.
 */
export function heroMoveStartsBattle(state: GameState, heroId: HeroId, to: MapSpaceId): boolean {
  const adventure = state.adventure;
  const hero = state.heroes[heroId];
  if (!adventure || !hero) {
    return false;
  }
  const field = adventure.fields[to];

  const occupant = heroAtSpace(state, to, hero.id);
  if (occupant && occupant.controllerId !== hero.controllerId) {
    const location = field ? locationDefinitions[field.location] : undefined;
    // A hero inside a Sanctuary cannot be attacked — moving onto them is a
    // pass-only step the move offer never allows, so it is not a battle here.
    if (!location?.passive?.protectsFromAttack) {
      return true;
    }
  }

  if (field && isFieldGuarded(field) && field.flagOwnerId !== hero.controllerId) {
    return true;
  }

  return false;
}

export type HeroPathTarget = { spaceId: MapSpaceId; path: MapSpaceId[]; cost: number };

/**
 * Every field the hero can reach with the movement points left this turn,
 * with the cheapest step-by-step path. Fields that stop the hero (guards,
 * enemy heroes, locations to use) are valid destinations but never crossed;
 * allied heroes can be walked through but not stood on.
 */
export function getReachableHeroPaths(state: GameState, hero: HeroState): Map<MapSpaceId, HeroPathTarget> {
  const results = new Map<MapSpaceId, HeroPathTarget>();
  const adventure = state.adventure;
  if (!adventure || !hero.spaceId || hero.movementPoints <= 0 || hero.movementHaltedThisTurn) {
    return results;
  }

  // Parallel turns: while another player's battle/choice is open, only QUIET
  // destinations are offered — "open" fields that trigger nothing on arrival.
  // "stop"/"encounter" fields (guards, enemy heroes, unvisited locations, flags
  // to steal) stay crossable per their kind but are not valid stops until the
  // table's current interaction resolves. Mirrors getHeroMoveDestinations.
  const parallelQuietOnly = Boolean(parallelInteractionBlocker(state, hero.controllerId));

  const movement = getHeroMovementCapabilities(state, hero);
  const visited = new Set<MapSpaceId>([hero.spaceId]);
  let frontier: { spaceId: MapSpaceId; path: MapSpaceId[] }[] = [{ spaceId: hero.spaceId, path: [] }];

  for (let depth = 1; depth <= hero.movementPoints && frontier.length > 0; depth += 1) {
    const next: typeof frontier = [];
    for (const node of frontier) {
      for (const neighbor of getAdjacentSpaceIds(node.spaceId)) {
        if (visited.has(neighbor) || !canCrossEdge(state, node.spaceId, neighbor, movement)) {
          continue;
        }

        const kind = classifyHeroStep(state, hero, neighbor, movement);
        if (kind === "block") {
          continue;
        }

        // A sea-touching step halts the hero, so the field can be reached but
        // the walk cannot continue past it (and an allied hero there, which you
        // could otherwise pass through, becomes unreachable).
        const halts = seaStepHalts(state, node.spaceId, neighbor, movement);
        visited.add(neighbor);
        const path = [...node.path, neighbor];

        if (kind === "stop") {
          if (!parallelQuietOnly) {
            results.set(neighbor, { spaceId: neighbor, path, cost: path.length });
          }
          continue;
        }

        if (kind === "pass-only") {
          if (!halts) {
            next.push({ spaceId: neighbor, path });
          }
          continue;
        }

        // "open" and Pathfinding's "encounter" are both a valid stop AND
        // crossable: the field is reachable, and the walk may continue past it
        // (an "encounter" passes over the Neutral/enemy field without fighting,
        // resolving Combat only when it is the final step — see moveHeroPath).
        // Quiet-only mode: ending on an "encounter" would start that Combat, so
        // it stays crossable but is not offered as a stop.
        if (!parallelQuietOnly || kind === "open") {
          results.set(neighbor, { spaceId: neighbor, path, cost: path.length });
        }
        if (!halts) {
          next.push({ spaceId: neighbor, path });
        }
      }
    }
    frontier = next;
  }

  return results;
}

export function canPlaceTileAt(
  state: GameState,
  hero: HeroState,
  center: HexCoord,
  rotation: number
): boolean {
  const adventure = state.adventure;
  if (!adventure || !hero.spaceId) {
    return false;
  }

  const existingCenters = Object.values(adventure.tiles).map((tile) => ({
    row: tile.centerRow,
    col: tile.centerCol
  }));

  if (existingCenters.some((existing) => tileCentersOverlap(existing, center))) {
    return false;
  }

  // Rulebook: a new tile must be a gapless neighbour of at least two existing
  // tiles (nesting into the notch between them), which also pins it onto the
  // map's single tiling sublattice so no holes can open up.
  const touching = existingCenters.filter((existing) => tileCentersAdjacent(existing, center));
  if (touching.length < 2) {
    return false;
  }

  // The new tile must be adjacent to the hero placing it.
  const heroCoord = parseHexSpaceId(hero.spaceId);
  if (!heroCoord) {
    return false;
  }

  const footprintIds = new Set(tileFootprint(center, rotation).map(hexSpaceId));
  const nextToHero = hexNeighbors(heroCoord).some((neighbor) => footprintIds.has(hexSpaceId(neighbor)));
  return nextToHero;
}

/**
 * Whether the hero placing a Far (Ⅱ–Ⅲ) tile could actually OPEN it at
 * `rotation`. Per locked rule #2 (map-geometry-invariants.test.ts): opening a
 * Map Tile requires the border-and-edge interaction — the hero's OWN field must
 * touch the new tile across an OPEN (unsealed) outer edge. A yellow border line
 * on the facing edge — on the hero's field OR the new tile's slot — walls it off,
 * and standing at that border means the hero cannot open here, even if some long
 * way around the map would eventually reach the notch.
 *
 * This is a DIRECT-ADJACENCY test, not a flood fill: a hero at a sealed yellow
 * edge must never be able to open a tile across it just because an unrelated open
 * path exists elsewhere (the bug this replaced). The new tile's fields are not
 * materialized yet, so its own slot seal/location is read from the definition.
 */
export function canHeroReachPlacedTile(
  state: GameState,
  hero: HeroState,
  tileDefId: string,
  center: HexCoord,
  rotation: number
): boolean {
  const adventure = state.adventure;
  const def = allTileDefinitions[tileDefId];
  if (!adventure || !def || !hero.spaceId) {
    return false;
  }
  const heroField = adventure.fields[hero.spaceId];
  if (!heroField) {
    return false;
  }

  // The hero's own field edge toward the tile must be an OPEN border. A ring
  // slot's outer arc seals all three outward edges together, so a sealed arc
  // walls the hero off in every outward direction.
  if (isOuterEdgeSealed(adventure, heroField)) {
    return false;
  }

  const footprint = tileFootprint(center, rotation);
  const slotByCell = new Map<MapSpaceId, number>();
  footprint.forEach((cell, slot) => slotByCell.set(hexSpaceId(cell), slot));

  const heroTile = adventure.tiles[heroField.tileInstanceId];
  const heroCoord = parseHexSpaceId(hero.spaceId);

  // Some hex neighbouring the hero's own field must be a field of the new tile
  // that (a) is not a blocked location and (b) does not present its own sealed
  // yellow arc back toward the hero. That is the single open doorway the hero
  // steps through — no walking around.
  for (const neighborId of getAdjacentSpaceIds(hero.spaceId)) {
    const slot = slotByCell.get(neighborId);
    if (slot === undefined) {
      continue;
    }
    const fieldDef = def.fields[slot];
    if (locationDefinitions[fieldDef?.location]?.category === "blocked") {
      continue;
    }
    if (isTileSlotOuterSealed(tileDefId, slot)) {
      continue;
    }
    // A designer per-edge yellow border on the HERO's own field toward this
    // doorway also walls it off (the new tile carries no borderEdges yet, so only
    // the hero-side edge is checked here).
    if (heroTile && heroCoord) {
      const neighborCoord = parseHexSpaceId(neighborId);
      const direction = neighborCoord ? hexDirectionBetween(heroCoord, neighborCoord) : null;
      if (direction !== null && tileEdgeDesignedSealed(heroTile, heroField.slot, direction)) {
        continue;
      }
    }
    return true;
  }
  return false;
}

/**
 * Whether the hero may OPEN a tile at the candidate footprint, before the tile
 * def is drawn. Per locked rule #2: the hero's OWN field must directly touch the
 * footprint across an OPEN (unsealed) outer edge — standing at a sealed yellow
 * border means the hero cannot open here, no matter what long way around the map
 * would reach the notch. The new tile's own arc is unknown (any rotation of it
 * may open the facing edge), so only the hero-side seal is checked here; the
 * new-tile-side seal is enforced once the def is known (canHeroReachPlacedTile,
 * at SET_TILE_ROTATION).
 *
 * Called by the PLACE_TILE handler and the UI placement-centre filter so a
 * sealed yellow arc under the hero cannot be circumvented. The footprint is the
 * same seven hexes at every rotation, so rotation 0 suffices for adjacency.
 */
export function canHeroReachPlacementCenter(
  state: GameState,
  hero: HeroState,
  center: HexCoord
): boolean {
  const adventure = state.adventure;
  if (!adventure || !hero.spaceId) {
    return false;
  }
  const heroField = adventure.fields[hero.spaceId];
  if (!heroField) {
    return false;
  }
  // A sealed outer arc under the hero walls off every outward edge — no opening.
  if (isOuterEdgeSealed(adventure, heroField)) {
    return false;
  }
  const heroTile = adventure.tiles[heroField.tileInstanceId];
  const heroCoord = parseHexSpaceId(hero.spaceId);
  const footprintCells = new Set<MapSpaceId>(tileFootprint(center, 0).map(hexSpaceId));
  return getAdjacentSpaceIds(hero.spaceId).some((neighborId) => {
    if (!footprintCells.has(neighborId)) {
      return false;
    }
    // A designer per-edge yellow border on the hero's own field toward this
    // doorway walls the opening off, just like a sealed arc does above.
    if (heroTile && heroCoord) {
      const neighborCoord = parseHexSpaceId(neighborId);
      const direction = neighborCoord ? hexDirectionBetween(heroCoord, neighborCoord) : null;
      if (direction !== null && tileEdgeDesignedSealed(heroTile, heroField.slot, direction)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Empty lattice slots where {@link hero} may drop a Far (Ⅱ–Ⅲ) supply tile.
 * Mirrors the PLACE_TILE guard (`canPlaceTileAt` + reachability): the slot must
 * nest against ≥2 existing tiles, sit next to the hero, not overlap, and the
 * hero must be able to open across an unsealed outer edge. Geometry only — the
 * 1-MP cost and active-turn gate live with the caller.
 *
 * When `tileDefId` is a known definition (Observatory-style), every rotation is
 * checked; for an UNOPENED supply tile (def unknown until the flip) only the
 * hero-side seal + footprint adjacency is checked — same as the handler.
 */
export function farTilePlacementCenters(
  state: GameState,
  hero: HeroState,
  tileDefId?: string,
): HexCoord[] {
  const adventure = state.adventure;
  if (!adventure || !hero.spaceId) {
    return [];
  }
  const heroCoord = parseHexSpaceId(hero.spaceId);
  if (!heroCoord) {
    return [];
  }
  const existing = Object.values(adventure.tiles).map((tile) => ({
    row: tile.centerRow,
    col: tile.centerCol,
  }));
  const seen = new Map<string, HexCoord>();
  const centers: HexCoord[] = [];
  for (const center of existing) {
    for (const candidate of tileLatticeNeighbors(center)) {
      const key = `${candidate.row}:${candidate.col}`;
      if (seen.has(key)) {
        continue;
      }
      seen.set(key, candidate);
      if (existing.some((tile) => tileCentersOverlap(tile, candidate))) {
        continue;
      }
      if (existing.filter((tile) => tileCentersAdjacent(tile, candidate)).length < 2) {
        continue;
      }
      if (!canPlaceTileAt(state, hero, candidate, 0)) {
        continue;
      }
      // Known def → full rotation-aware doorway check; unopened supply → hero
      // side seal only (tile def is drawn later).
      if (tileDefId && allTileDefinitions[tileDefId]) {
        if (
          ![0, 1, 2, 3, 4, 5].some((rotation) =>
            canHeroReachPlacedTile(state, hero, tileDefId, candidate, rotation),
          )
        ) {
          continue;
        }
      } else if (!canHeroReachPlacementCenter(state, hero, candidate)) {
        continue;
      }
      centers.push(candidate);
    }
  }
  return centers;
}

/** True when the seat still holds at least one unopened Ⅱ–Ⅲ supply tile and the pool is not empty. */
export function playerHasPlaceableFarTile(
  state: GameState,
  playerId: PlayerId,
): boolean {
  const adventure = state.adventure;
  if (!adventure || (adventure.farTilePool?.length ?? 0) === 0) {
    return false;
  }
  const supply = adventure.playerFarTiles[playerId] ?? [];
  return supply.includes(UNOPENED_FAR_TILE);
}

// ---------------------------------------------------------------------------
// Resources, morale, experience
// ---------------------------------------------------------------------------

export function gainResources(
  state: GameState,
  playerId: PlayerId,
  gains: { gold?: number; buildingMaterials?: number; valuables?: number },
  reason: string
): void {
  const player = state.players[playerId];
  if (!player) {
    return;
  }

  player.resources.gold += gains.gold ?? 0;
  player.resources.buildingMaterials += gains.buildingMaterials ?? 0;
  player.resources.valuables += gains.valuables ?? 0;

  appendEvent(state, {
    type: "RESOURCES_GAINED",
    playerId,
    gold: gains.gold ?? 0,
    buildingMaterials: gains.buildingMaterials ?? 0,
    valuables: gains.valuables ?? 0,
    reason
  });
}

export type ArmyMapAbility = { abilityId: string; abilityName: string; effect: UnitMapAbilityEffect };

/**
 * Adventure-map ("global") abilities granted by the unit cards currently in a
 * player's army (Rogues' scout, Nomads' end-turn step, Crystal Dragons'
 * Resource-round valuables). One entry per qualifying army card, so multiple
 * copies stack.
 */
export function getArmyMapAbilities(state: GameState, playerId: PlayerId): ArmyMapAbility[] {
  const player = state.players[playerId];
  if (!player) {
    return [];
  }

  const abilities: ArmyMapAbility[] = [];
  for (const armyUnit of player.army) {
    const definition = coreUnitDefinitions[armyUnit.unitDefId];
    const side = definition?.[armyUnit.side];
    for (const abilityId of side?.abilities ?? []) {
      const ability = unitAbilities[abilityId];
      if (ability?.mapEffect && ability.implementationStatus === "implemented") {
        abilities.push({ abilityId, abilityName: ability.name, effect: ability.mapEffect });
      }
    }
  }
  return abilities;
}

/** True when the player's army grants the given map ability effect type. */
export function armyHasMapEffect(
  state: GameState,
  playerId: PlayerId,
  type: UnitMapAbilityEffect["type"]
): boolean {
  return getArmyMapAbilities(state, playerId).some((ability) => ability.effect.type === type);
}

export function hasResources(player: PlayerState, cost: ResourceCost): boolean {
  return (Object.entries(cost) as [ResourceKind, number][]).every(
    ([resource, amount]) => player.resources[resource] >= amount
  );
}

export function spendResources(state: GameState, playerId: PlayerId, cost: ResourceCost, reason: string): void {
  const player = state.players[playerId];
  if (!player) {
    return;
  }

  for (const [resource, amount] of Object.entries(cost) as [ResourceKind, number][]) {
    player.resources[resource] -= amount;
  }

  appendEvent(state, { type: "RESOURCES_SPENT", playerId, cost, reason });
}

/**
 * Morale (token mode, morale-cards rule OFF):
 * - Range is −2 … +1. Positive caps at +1 (further gains → moraleOverflow spend).
 * - Negative floors at −2 (a second negative lands as −2; it does NOT reset to 0
 *   mid-turn and does NOT arm a sticky hand-dump flag).
 * - Hand discard is checked ONLY at END_TURN: if morale is still −2 then, dump
 *   the hand and clear back to 0. Recover during the turn (−2 → −1 via a Temple
 *   / Mermaid / etc.) and the hand is kept.
 * - Multi-token sources (Warrior's Tomb amount −2) apply one step at a time so
 *   the feed shows −1 (now −1) then −1 (now −2), never a batch "−2 (now 0)".
 * - Necropolis ignores morale entirely.
 */
export function changeMorale(state: GameState, playerId: PlayerId, amount: number): void {
  const player = state.players[playerId];
  if (!player || amount === 0) {
    return;
  }

  const faction = player.factionId ? coreFactionDefinitions[player.factionId] : undefined;
  if (faction?.ignoresMorale) {
    return;
  }

  if (moraleCardsRuleEnabled(state)) {
    applyMoraleCardGain(state, playerId, amount);
    return;
  }

  // Legacy sticky flag from older snapshots — never re-arm it; recovery and the
  // end-turn morale===-2 check are the only sources of truth now.
  player.discardHandAtTurnEnd = false;

  let overflow = 0;
  const stepDelta = amount > 0 ? 1 : -1;
  for (let step = 0; step < Math.abs(amount); step += 1) {
    if (amount > 0) {
      // The positive token caps at +1; any further gain does not stack but
      // must be spent right away (draw / discard-redraw) — tracked as overflow.
      if (player.morale >= 1) {
        overflow += 1;
        continue;
      }
      player.morale += 1;
    } else if (player.morale <= -2) {
      // Already at the floor — further negatives do nothing this step.
      continue;
    } else {
      player.morale -= 1;
    }
    appendEvent(state, {
      type: "MORALE_CHANGED",
      playerId,
      amount: stepDelta,
      total: player.morale
    });
  }
  if (overflow > 0) {
    player.moraleOverflow = (player.moraleOverflow ?? 0) + overflow;
  }
}

export function getMainHero(state: GameState, playerId: PlayerId): HeroState | null {
  return (
    Object.values(state.heroes).find((hero) => hero.controllerId === playerId && hero.kind === "main") ?? null
  );
}

/** The single Secondary Hero a player may field, if they have gained one. */
export function getSecondaryHero(state: GameState, playerId: PlayerId): HeroState | null {
  return (
    Object.values(state.heroes).find((hero) => hero.controllerId === playerId && hero.kind === "secondary") ?? null
  );
}

/**
 * Tavern / Prison / hiring at a town: give `playerId` a Secondary Hero and
 * place its model on `fieldId`, optionally wearing another town hero's
 * portrait (`heroDefId`). Secondary Heroes refresh to a fixed 2 movement
 * points, never gain experience (from fights, locations or level-ups) and
 * cannot use cards in their Combats. A player may only ever field one, so
 * callers gate on `getSecondaryHero` first (the figure supply is one per
 * player).
 */
export function createSecondaryHero(
  state: GameState,
  playerId: PlayerId,
  fieldId: MapSpaceId,
  heroDefId?: string
): HeroState {
  const heroId = `hero2_${playerId}`;
  const hero: HeroState = {
    id: heroId,
    controllerId: playerId,
    kind: "secondary",
    ...(heroDefId ? { heroDefId } : {}),
    // A Secondary Hero NEVER gains Experience of its own (level/experience stay
    // here forever). For fighting Neutral Units it is instead *treated as* the
    // Main Hero's level — see `neutralBattleLevel` — so it can skip / Quick-
    // Combat-win the same low-level guards, without ever earning XP.
    level: 1,
    experience: 0,
    movementPoints: SECONDARY_HERO_MOVEMENT,
    movementPointsMax: SECONDARY_HERO_MOVEMENT,
    spaceId: fieldId
  };
  state.heroes[heroId] = hero;
  if (state.adventure) {
    state.adventure.lastVisitedField[heroId] = fieldId;
  }
  appendEvent(state, { type: "HERO_GAINED", playerId, heroId, fieldId });
  return hero;
}

export function levelOfExperience(experience: number): number {
  return Math.min(7, 1 + Math.floor(experience / 2));
}

/**
 * Adds experience steps to the main hero and resolves every level-up crossed:
 * hand limit and expert-effect slots update immediately, ability searches
 * queue a Search (2) of the Ability deck, specialty levels add the printed
 * specialty card to the hand.
 */
export function gainExperience(state: GameState, playerId: PlayerId, amount: number): void {
  const hero = getMainHero(state, playerId);
  const player = state.players[playerId];
  if (!hero || !player || amount <= 0) {
    return;
  }

  const previousLevel = hero.level;
  hero.experience = Math.min(MAX_EXPERIENCE, hero.experience + amount);
  hero.level = levelOfExperience(hero.experience);

  // Remember where this gain's rewards START in the queue, so the Learning offer
  // can be inserted AHEAD of the level-up's own rewards (e.g. an Ability-deck
  // Search) rather than buried behind them — see the Learning block below.
  const rewardQueueStart = state.adventure?.rewardQueue.length ?? 0;

  appendEvent(state, {
    type: "EXPERIENCE_GAINED",
    playerId,
    heroId: hero.id,
    amount,
    experience: hero.experience,
    level: hero.level
  });

  for (let level = previousLevel + 1; level <= hero.level; level += 1) {
    const effects: string[] = [];

    const handLimit = HAND_LIMIT_BY_LEVEL[level];
    if (handLimit && handLimit !== player.limits.hand) {
      player.limits.hand = handLimit;
      effects.push(`hand limit ${handLimit}`);
    }

    const expertUses = EXPERT_USES_BY_LEVEL[level];
    if (expertUses !== undefined && expertUses !== player.limits.expertUses) {
      player.limits.expertUses = expertUses;
      effects.push(`expert effects ${expertUses}`);
    }

    if (ABILITY_SEARCH_LEVELS.includes(level)) {
      state.adventure?.rewardQueue.push({
        playerId,
        kind: "shared-deck-search",
        deckId: "abilities",
        count: 2,
        // Tag the Search with the level that granted it, so the kept Ability
        // card is recorded (publicly) on the hero board for this level (2/3/5/7).
        abilitySearchLevel: level
      });
      effects.push("Search (2) the Ability deck");
    }

    if (
      polishSpellBookEnabled(state) &&
      (level === 5 || level === 7) &&
      townHasBuildingEffect(state, playerId, "MAGE_GUILD")
    ) {
      player.hand.push(CAST_A_SPELL_CARD_ID);
      effects.push("gained Cast a Spell from the Mage Guild");
    }

    if (SPECIALTY_LEVELS.includes(level as 4 | 6) && player.heroDefId) {
      const heroDef = coreHeroDefinitions[player.heroDefId];
      const specialtyCardId = heroDef?.specialtyCardIds?.[level as 4 | 6];
      if (specialtyCardId) {
        player.hand.push(specialtyCardId);
        effects.push(`gained specialty ${specialtyCardId}`);
      }
    }

    // WOG Commanders: every level-up awards stat points (2 at a milestone
    // level — levels 3 & 6, or the Paladin's Wise 2 & 5). Points never block
    // play — they wait on the commander card until COMMANDER_GRADE_UP spends them.
    const commanderPoints = awardCommanderGradePoints(player, level);
    if (commanderPoints > 0 && player.commander) {
      effects.push(`commander +${commanderPoints} stat ${commanderPoints === 1 ? "point" : "points"}`);
      // Dedicated event so the UI can pop a level-up "spend your points" prompt.
      appendEvent(state, {
        type: "COMMANDER_POINTS_AWARDED",
        playerId,
        commanderSlug: player.commander.slug,
        points: commanderPoints,
        level,
        totalUnspent: player.commander.gradePoints ?? commanderPoints,
        message: `Your commander earned ${commanderPoints} stat ${commanderPoints === 1 ? "point" : "points"} at level ${level}.`
      });
    }

    appendEvent(state, {
      type: "HERO_LEVEL_UP",
      playerId,
      heroId: hero.id,
      level,
      effects
    });
  }

  // Learning ability: the Hero is "about to level up" (it just crossed at least
  // one level) and the player still holds a Learning card — offer to advance an
  // extra half/full level. Deferred to the reward queue so it surfaces after the
  // natural level-up benefits settle (and after any combat that granted the XP
  // fully ends — pumpAdventureQueues waits for combat to clear). Skipped at the
  // Experience cap, where advancing further would do nothing.
  if (
    hero.level > previousLevel &&
    hero.experience < MAX_EXPERIENCE &&
    state.adventure &&
    player.hand.includes("ability.learning")
  ) {
    // The card reads "Play when the Hero is ABOUT TO level up" — so the offer must
    // come BEFORE the level-up's own rewards. Crossing into an Ability-search level
    // (2/3/5/7) queues a Search of the Ability deck during the loop above; pushing
    // Learning to the back would bury it behind that Search (the player would have
    // to finish an unrelated Search before being asked about Learning, and a
    // visit that crosses such a level looked like it offered no Learning at all).
    // Splice it in just ahead of this gain's rewards (but after anything already
    // queued) so it is the first thing surfaced.
    state.adventure.rewardQueue.splice(rewardQueueStart, 0, { playerId, kind: "learning-level-up" });
  }
}

/**
 * Record the Ability card just kept from a level-up "Search (2) the Ability
 * deck" against the level that granted it (hero-board display). A no-op unless
 * `pendingLevelUpAbilitySearch` is set — i.e. the currently-open shared-deck
 * Search is a level-up one. The marker is cleared here so the FIRST kept card is
 * the recorded pick (a later Pendant/morale re-Search of the same window does
 * not overwrite it) and so no later, unrelated Ability Search is mis-attributed.
 */
export function recordLevelUpAbilityPick(player: PlayerState, cardId: CardId): void {
  const level = player.pendingLevelUpAbilitySearch;
  if (level === undefined) {
    return;
  }
  (player.levelUpAbilityPicks ??= {})[level] = cardId;
  player.pendingLevelUpAbilitySearch = undefined;
}

/**
 * Drop the level-up Ability-Search marker without recording anything — used when
 * that Search closes with no card kept (an empty reveal, or the deck could not
 * open a Search at all), so the marker can never attach to a later Search.
 */
export function clearPendingLevelUpAbilitySearch(player: PlayerState): void {
  player.pendingLevelUpAbilitySearch = undefined;
}

/**
 * The Hero level used to resolve a Neutral encounter — Quick Combat (win and
 * walk past a guard whose Field Difficulty is below your level) and the
 * Diplomacy skip (Field Difficulty equal to your level).
 *
 * A Secondary Hero NEVER gains Experience of its own (no object, item, location
 * or combat ever advances it — those are all gated to the Main Hero). But for
 * fighting Neutral Units it is *treated as the same level as the player's Main
 * Hero*, so it skips / Quick-Combat-wins the same low-level guards the Main Hero
 * would instead of being stuck at level 1. This is read ONLY here, at the
 * Neutral encounter; it grants the Secondary Hero no Experience, cards or other
 * level-up benefits. A Main Hero (or a Secondary with no Main Hero left) uses
 * its own level.
 */
export function neutralBattleLevel(state: GameState, hero: HeroState): number {
  if (hero.kind === "secondary") {
    const main = getMainHero(state, hero.controllerId);
    if (main) {
      return Math.max(hero.level, main.level);
    }
  }
  return hero.level;
}

/**
 * The Fields a newly gained Secondary Hero may be placed on: the spot it was
 * gained at (a Prison/Tavern Field — `originFieldId`, when given), the player's
 * own Town (while they still hold it), and every Settlement they control.
 * De-duplicated by Field (origin may coincide with the Town/a Settlement),
 * keeping the first label. Order: origin, Town, then Settlements.
 */
export function secondaryHeroPlacementFields(
  state: GameState,
  playerId: PlayerId,
  originFieldId?: MapSpaceId
): { fieldId: MapSpaceId; label: string }[] {
  const adventure = state.adventure;
  const out: { fieldId: MapSpaceId; label: string }[] = [];
  const seen = new Set<MapSpaceId>();
  const add = (fieldId: MapSpaceId | null | undefined, label: string): void => {
    if (!fieldId || seen.has(fieldId) || !adventure?.fields[fieldId]) {
      return;
    }
    seen.add(fieldId);
    out.push({ fieldId, label });
  };

  if (originFieldId) {
    add(originFieldId, `Here — ${fieldName(state, originFieldId)}`);
  }

  // "Flagging an enemy Town prevents their Secondary Heroes from spawning there"
  // (rulebook p.76): only offer your Town while you still hold it.
  const town = getTownOfPlayer(state, playerId);
  const townField = town?.fieldId ? adventure?.fields[town.fieldId] : null;
  if (town?.fieldId && (!townField || townField.flagOwnerId == null || townField.flagOwnerId === playerId)) {
    add(town.fieldId, `Your Town — ${fieldName(state, town.fieldId)}`);
  }

  for (const field of Object.values(adventure?.fields ?? {})) {
    if (field.location === "settlement" && field.flagOwnerId === playerId) {
      add(field.spaceId, `Settlement — ${fieldName(state, field.spaceId)}`);
    }
  }

  return out;
}

/**
 * The visit-step that places a just-gained Secondary Hero. With more than one
 * legal Field the player gets a CHOOSE_ONE ("place your Secondary Hero…");
 * otherwise the hero is placed straight away (a lone CREATE_SECONDARY_HERO
 * leaf). `fallbackFieldId` is the Field used when the player controls no
 * Town/Settlement (a Prison/Tavern: the Field itself). `heroDefId` rides the
 * hired portrait through the choice.
 */
export function secondaryHeroPlacementStep(
  state: GameState,
  playerId: PlayerId,
  fallbackFieldId: MapSpaceId | undefined,
  heroDefId?: string
): VisitStep {
  const fields = secondaryHeroPlacementFields(state, playerId, fallbackFieldId);
  const leaf = (fieldId: MapSpaceId): VisitStep => ({
    type: "CREATE_SECONDARY_HERO",
    fieldId,
    ...(heroDefId ? { heroDefId } : {})
  });
  if (fields.length <= 1) {
    return leaf((fields[0]?.fieldId ?? fallbackFieldId) as MapSpaceId);
  }
  return {
    type: "CHOOSE_ONE",
    prompt: "Place your Secondary Hero…",
    options: fields.map((field) => ({ label: field.label, steps: [leaf(field.fieldId)] }))
  };
}

// ---------------------------------------------------------------------------
// Visits
// ---------------------------------------------------------------------------

/**
 * Sums the visiting player's Melodia Fortune VI location-dice bonus — added to
 * every Treasure/Resource die a location makes them roll this turn.
 */
function locationDiceBonusFor(state: GameState, playerId: PlayerId): number {
  let bonus = 0;
  for (const effect of state.activeEffects) {
    if (effect.scope !== "player" || effect.controllerId !== playerId) {
      continue;
    }
    for (const modifier of effect.modifiers) {
      if (modifier.type === "LOCATION_DICE_BONUS") {
        bonus += modifier.amount;
      }
    }
  }
  return bonus;
}

function interactionToSteps(interaction: LocationInteraction, extraLocationDice = 0): VisitStep[] {
  switch (interaction.type) {
    case "NONE":
    case "NOT_IMPLEMENTED":
      return [];
    case "GAIN_RESOURCES":
      return [
        {
          type: "GAIN_RESOURCES",
          gold: interaction.gold,
          buildingMaterials: interaction.buildingMaterials,
          valuables: interaction.valuables
        }
      ];
    case "GAIN_EXPERIENCE":
      return [{ type: "GAIN_EXPERIENCE", amount: interaction.amount }];
    case "GAIN_MOVEMENT":
      return [{ type: "GAIN_MOVEMENT", amount: interaction.amount }];
    case "GAIN_MORALE":
      return [{ type: "GAIN_MORALE", amount: interaction.amount }];
    case "GAIN_UNIT":
      return [
        {
          type: "RECRUIT_FREE",
          unitDefId: interaction.unitDefId,
          side: interaction.side,
          ...(interaction.stacks && interaction.stacks > 0 ? { stacks: interaction.stacks } : {})
        }
      ];
    case "ROLL_RESOURCE_DICE":
      // Melodia's Fortune VI: +1 to the dice rolled & resolved at this location.
      return [{ type: "ROLL_RESOURCE_DICE", count: interaction.count + extraLocationDice }];
    case "ROLL_TREASURE_DICE":
      return [{ type: "ROLL_TREASURE_DICE", count: interaction.count + extraLocationDice }];
    case "SEARCH_SHARED_DECK": {
      const times = interaction.times ?? 1;
      return Array.from({ length: times }, () => ({
        type: "SEARCH_SHARED_DECK" as const,
        deckId: interaction.deckId,
        count: interaction.count
      }));
    }
    case "MINE_FLAG":
      return [];
    case "SETTLEMENT_FLAG":
      return [{ type: "SETTLEMENT_CHOICE" }];
    case "TOWN_FLAG":
      return [];
    case "CHOOSE_ONE":
      return [
        {
          type: "CHOOSE_ONE",
          prompt: "Choose one",
          options: interaction.options.map((option) => ({
            label: option.label,
            steps: interactionToSteps(option.interaction, extraLocationDice)
          }))
        }
      ];
    case "PAY_TO":
      return [
        {
          type: "PAY_TO",
          prompt: "Pay to use this field?",
          costOptions: interaction.costOptions,
          steps: interactionToSteps(interaction.interaction, extraLocationDice)
        }
      ];
    case "SEQUENCE":
      return interaction.interactions.flatMap((inner) => interactionToSteps(inner, extraLocationDice));
    case "DISCOVER_ADJACENT_TILE":
      return [{ type: "DISCOVER_ADJACENT_TILE" }];
    case "MAGIC_SPRING":
      return [{ type: "MAGIC_SPRING" }];
    case "WITCH_HUT":
      return [{ type: "WITCH_HUT" }];
    case "SCHOLAR":
      return [{ type: "SCHOLAR" }];
    case "TRADING_POST":
      return [{ type: "TRADING_POST" }];
    case "WAR_MACHINE_SHOP":
      return [{ type: "WAR_MACHINE_SHOP" }];
    case "ATTACK_DIE_TABLE":
      return [
        {
          type: "ATTACK_DIE_TABLE",
          plus: interactionToSteps(interaction.plus, extraLocationDice),
          zero: interactionToSteps(interaction.zero, extraLocationDice),
          minus: interactionToSteps(interaction.minus, extraLocationDice)
        }
      ];
    case "REMOVE_HAND_CARD":
      return [
        {
          type: "REMOVE_HAND_CARD",
          prompt: interaction.prompt,
          filter: interaction.filter,
          then: interaction.then
        }
      ];
    case "SEARCH_DISCARD":
      return [{ type: "SEARCH_DISCARD", deckId: interaction.deckId, count: interaction.count }];
    case "REMOVE_THEN_SEARCH_REPEAT":
      return interaction.times > 0
        ? [{ type: "REMOVE_THEN_SEARCH_REPEAT", remaining: interaction.times, searchCount: interaction.searchCount }]
        : [];
    case "EMPOWER_ABILITY":
      return [{ type: "EMPOWER_ABILITY" }];
    case "HILL_FORT":
      return [{ type: "HILL_FORT" }];
    case "SUBTERRANEAN_GATE":
      return [{ type: "SUBTERRANEAN_GATE" }];
    case "TOKEN_TELEPORT":
      return [{ type: "TOKEN_TELEPORT", token: interaction.token }];
    case "ONEWAY_TELEPORT":
      return [{ type: "ONEWAY_TELEPORT" }];
    case "GATE_TELEPORT":
      return [{ type: "GATE_TELEPORT" }];
    case "DRAW_PANDORA_CARD":
      return [{ type: "DRAW_PANDORA_CARD" }];
    case "LIBRARY_OF_ENLIGHTENMENT":
      return [{ type: "LIBRARY_SWAP", remaining: 2 }];
    case "STAR_AXIS":
      return [{ type: "STAR_AXIS_SWAP" }];
    case "OBELISK":
      // Obelisk is intercepted in beginFieldVisit (handleObeliskVisit), so it
      // never compiles to generic steps; this keeps the switch exhaustive.
      return [];
    case "BLACK_MARKET":
      return [{ type: "BLACK_MARKET" }];
    case "ELEMENTAL_CONFLUX":
      return [{ type: "ELEMENTAL_CONFLUX" }];
    case "TAVERN":
      return [{ type: "TAVERN" }];
    case "PRISON":
      return [{ type: "PRISON" }];
    case "SPELL_SCROLL":
      return [{ type: "SPELL_SCROLL", remaining: 2 }];
    case "DIG_ARTIFACT":
      return [{ type: "DIG_ARTIFACT" }];
    case "GRANT_MOVE_THROUGH":
      return [{ type: "GRANT_MOVE_THROUGH" }];
    case "WATERING_HOLE":
      return [{ type: "WATERING_HOLE" }];
  }
}

export function flagField(state: GameState, playerId: PlayerId, field: MapFieldState): void {
  const previousOwnerId = field.flagOwnerId;

  // Parallel turns: taking a flag FROM a live player (walking onto their mine
  // or settlement, a View Earth capture, a town falling undefended…) is a
  // serious PvP interaction — the mode stops with a table-wide warning. Flags
  // taken from nobody or from neutral guards are ordinary expansion and do not
  // stop it, and neither do hand discards (handled nowhere near here). Throws
  // — rejecting the whole action — if another player's interaction is still
  // open, so a steal can never resolve behind an ongoing battle.
  if (
    previousOwnerId &&
    previousOwnerId !== playerId &&
    previousOwnerId !== NEUTRAL_PLAYER_ID &&
    state.players[previousOwnerId] &&
    !state.players[previousOwnerId].eliminated
  ) {
    stopParallelTurns(
      state,
      "pvp-interaction",
      playerId,
      `took the ${locationDefinitionName(field.location)} from ${state.players[previousOwnerId]?.name ?? previousOwnerId}`
    );
  }

  field.flagOwnerId = playerId;

  appendEvent(state, {
    type: "FIELD_FLAGGED",
    playerId,
    fieldId: field.spaceId,
    location: field.location,
    previousOwnerId
  });
}

/** Display name of a map location for log/warning messages. */
function locationDefinitionName(locationId: string): string {
  return locationDefinitions[locationId]?.name ?? locationId.replace(/_/g, " ");
}

export function applyMineFlag(state: GameState, playerId: PlayerId, field: MapFieldState): void {
  const previousOwnerId = field.flagOwnerId;
  const resource = field.resource ?? "gold";
  const amount = field.amount ?? 0;

  if (previousOwnerId && previousOwnerId !== playerId) {
    const previous = state.players[previousOwnerId];
    if (previous) {
      previous.production[resource] = Math.max(0, previous.production[resource] - amount);
      appendEvent(state, {
        type: "PRODUCTION_CHANGED",
        playerId: previousOwnerId,
        resource,
        amount: -amount
      });
    }
  }

  flagField(state, playerId, field);
  const player = state.players[playerId];
  if (!player) {
    return;
  }

  player.production[resource] += amount;
  appendEvent(state, { type: "PRODUCTION_CHANGED", playerId, resource, amount });

  if (!field.everFlagged) {
    field.everFlagged = true;
    gainResources(state, playerId, { [resource]: amount }, `first to flag the ${resource} mine`);
  }
}

/**
 * Settle a settlement's resource income onto `playerId`.
 *
 * A settlement that has been flagged for a resource carries a token of that
 * resource and produces one full resource-gain level of it (+5 gold, +2
 * building materials, or +1 valuables — the same levels as a town-conquest
 * reward). This helper moves that income with the flag:
 *   - the former owner (if any, and different) loses the whole level from the
 *     OLD token resource, never dropping below zero;
 *   - the new owner's production rises by one level of `resource`;
 *   - the field records `resource` as its token; and
 *   - the one-time stockpile bonus is paid ONLY on the very first flag.
 *
 * Re-entering a settlement you already own is guarded out in `beginFieldVisit`,
 * so this never re-stacks income for the same owner. When another player takes
 * an already-founded settlement the caller passes `field.settlementResource`,
 * so the new owner inherits exactly the resource the founder chose (they do not
 * pick a new one) and — because `everFlagged` is already set — receives no
 * repeat of the first-flag bonus.
 */
export function applySettlementResource(
  state: GameState,
  playerId: PlayerId,
  field: MapFieldState,
  resource: ResourceKind
): void {
  const previousOwnerId = field.flagOwnerId;
  const firstFlag = !field.everFlagged;

  // Strip the whole resource-gain level the former owner earned from this
  // settlement's existing token (never below zero) before it changes hands.
  if (previousOwnerId && previousOwnerId !== playerId && field.settlementResource) {
    const previous = state.players[previousOwnerId];
    if (previous) {
      const lost = RESOURCE_GAIN_LEVEL_AMOUNTS[field.settlementResource];
      previous.production[field.settlementResource] = Math.max(
        0,
        previous.production[field.settlementResource] - lost
      );
      appendEvent(state, {
        type: "PRODUCTION_CHANGED",
        playerId: previousOwnerId,
        resource: field.settlementResource,
        amount: -lost
      });
    }
  }

  flagField(state, playerId, field);
  field.settlementResource = resource;
  field.everFlagged = true;

  const player = state.players[playerId];
  if (player) {
    const gained = RESOURCE_GAIN_LEVEL_AMOUNTS[resource];
    player.production[resource] += gained;
    appendEvent(state, { type: "PRODUCTION_CHANGED", playerId, resource, amount: gained });
    if (firstFlag) {
      gainResources(state, playerId, { [resource]: gained }, "first to flag the settlement");
    }
  }

  // Settlements prevent Player Elimination (rulebook p.77): taking one clears
  // the new owner's clock; losing one may start the former owner's.
  refreshEliminationClock(state, playerId);
  if (previousOwnerId && previousOwnerId !== playerId) {
    refreshEliminationClock(state, previousOwnerId);
  }
}

/**
 * Enemy-owned Mine fields within `range` straight-line hexes of the player's
 * main Hero — the candidates the View Earth spell may capture. A Mine counts
 * only when another player's Faction cube is on it (an unflagged or own Mine is
 * skipped). Sorted by space id so every client builds the same option list.
 * Shared by the legal-action gate and the spell's resolver so the offer and the
 * capture can never disagree.
 */
export function capturableEnemyMinesWithin(
  state: GameState,
  playerId: PlayerId,
  range: number
): MapSpaceId[] {
  const adventure = state.adventure;
  const hero = getMainHero(state, playerId);
  const origin = hero?.spaceId ? parseHexSpaceId(hero.spaceId) : null;
  if (!adventure || !origin || range <= 0) {
    return [];
  }

  const mines: MapSpaceId[] = [];
  for (const field of Object.values(adventure.fields)) {
    if (field.location !== "mine") {
      continue;
    }
    // "Choose enemy Mine": only Mines flagged by another player can be taken.
    if (!field.flagOwnerId || field.flagOwnerId === playerId) {
      continue;
    }
    const coord = parseHexSpaceId(field.spaceId);
    if (!coord || hexDistance(origin, coord) > range) {
      continue;
    }
    mines.push(field.spaceId);
  }
  return mines.sort();
}

function applyTownFlag(state: GameState, playerId: PlayerId, field: MapFieldState): void {
  const town = Object.values(state.towns).find((candidate) => candidate.fieldId === field.spaceId);
  const previousOwnerId = field.flagOwnerId ?? town?.controllerId ?? null;
  flagField(state, playerId, field);
  field.everFlagged = true;

  // Flagging an enemy faction Town is NOT an instant win and does not seize
  // their Town Board (rulebook p.76 — "they do not lose access to their Town
  // Board or its functions"). Instead the conqueror earns a resource-gain
  // level (the rulebook's "special reward for flagging"), and the former owner
  // goes on the elimination clock if this took their last Town/Settlement. The
  // Scenario is won only by being the last faction standing — see
  // eliminatePlayer — so flagging here never ends the game on its own.
  if (previousOwnerId && previousOwnerId !== playerId) {
    state.adventure?.rewardQueue.push({
      playerId,
      kind: "visit-steps",
      steps: [{ type: "RESOURCE_GAIN_LEVEL" }]
    });
    refreshEliminationClock(state, previousOwnerId);
  }
  // The conqueror now holds a Town field, so any clock they were on clears.
  refreshEliminationClock(state, playerId);
}

/**
 * Random Town capture: the conqueror gains +10 gold income (transferred from
 * any previous holder) and, the first time the town falls, the 10 gold at once.
 */
function applyRandomTownFlag(state: GameState, playerId: PlayerId, field: MapFieldState): void {
  const previousOwnerId = field.flagOwnerId;
  if (previousOwnerId && previousOwnerId !== playerId) {
    const previous = state.players[previousOwnerId];
    if (previous) {
      previous.production.gold = Math.max(0, previous.production.gold - 10);
      appendEvent(state, { type: "PRODUCTION_CHANGED", playerId: previousOwnerId, resource: "gold", amount: -10 });
    }
  }

  const firstCapture = !field.everFlagged;
  flagField(state, playerId, field);
  field.everFlagged = true;

  const player = state.players[playerId];
  if (!player) {
    return;
  }
  player.production.gold += 10;
  appendEvent(state, { type: "PRODUCTION_CHANGED", playerId, resource: "gold", amount: 10 });
  if (firstCapture) {
    gainResources(state, playerId, { gold: 10 }, "captured the Random Town");
  }
}

/** The active win condition; absent on old snapshots means "conquest". */
export function adventureVictoryMode(state: GameState): VictoryMode {
  return state.adventure?.victoryMode ?? "conquest";
}

/**
 * How the Dragon Utopia objective is guarded this game. The map-designer preset
 * (`objectives.utopiaGuards`) wins when set — the designer's choice for THIS map
 * — else the lobby-level `dragonUtopiaGuards`, else "by-difficulty" (the default
 * and old-snapshot value). Both stored values are the EXISTING
 * {@link DragonUtopiaGuards} modes; the preset surfaces them, it invents nothing.
 */
export function adventureDragonUtopiaGuards(state: GameState): DragonUtopiaGuards {
  return (
    state.adventure?.mapPreset?.objectives?.utopiaGuards ??
    state.adventure?.dragonUtopiaGuards ??
    "by-difficulty"
  );
}

/**
 * Whether a player-vs-player Combat keeps both armies intact. Absent on old
 * snapshots means "normal" (casualties are lost, the rulebook outcome).
 */
export function adventurePvpTroopLoss(state: GameState): "normal" | "none" {
  return state.adventure?.pvpTroopLoss ?? "normal";
}

/**
 * House-rule gold tolls for leaving a player-vs-player Combat.
 * - Surrender: a flat toll paid to the opponent. A hero may only choose to
 *   Surrender with the full amount in hand (no debt); in exchange they keep
 *   their whole army and the opponent gains nothing toward winning.
 * - Retreat / fought-out loss: the loser pays this to the winner and may be
 *   pushed into debt (gold can go negative) if they cannot cover it.
 */
export const SURRENDER_GOLD_COST = 10;
export const RETREAT_GOLD_COST = 5;

/**
 * Tournament Book p.54 "Additional Morale token action": while a Search is open,
 * spend the positive Morale token to discard all revealed cards and Search (X)
 * again. Active when any tournament setup flag was frozen onto adventure state
 * (master Tournament mode or any granular tournament rule).
 */
export function tournamentMoraleSearchAgainEnabled(
  state: Pick<GameState, "adventure">
): boolean {
  const a = state.adventure;
  if (!a) {
    return false;
  }
  return Boolean(
    a.tournamentMode ||
      a.tournamentBanDiplomacy ||
      a.tournamentBanHourglass ||
      a.tournamentSecondPlayerMorale
  );
}

/**
 * Gold toll to surrender right now. With `polish-reduced-surrender` ON the cost
 * starts at 10 and drops by 3 after each completed combat round (min 1). With
 * the rule OFF (or no combat) it is always the flat 10.
 */
export function currentSurrenderGoldCost(state: GameState): number {
  if (!houseRuleEnabled(state, "polish-reduced-surrender")) {
    return SURRENDER_GOLD_COST;
  }
  const round = state.combat?.round ?? 1;
  return polishSurrenderGoldCost(round);
}

/**
 * Whether the "defeat every enemy hero" path can win this game. Shared by the
 * Grail Hunt and Dragon Hunt modes — both let a player win by military
 * dominance even if they never reach the objective creature bank.
 */
export function victoryModeCountsHeroDefeats(mode: VictoryMode): boolean {
  return mode === "grail" || mode === "dragon-hunt";
}

/**
 * Ends the game with a winner and the reason shown in the log.
 *
 * `viaVictoryCondition` marks a call that COMPLETES the Scenario's victory
 * condition (Grail delivered, Dragon Utopia defeated/held, the required enemy
 * heroes beaten). In Victory Points mode such a completion does NOT win
 * outright: it ends the game by SCORING (the completer earns the completion VP,
 * the most-VP seat wins) via {@link endGameByVictoryPoints}. Last-faction-standing
 * also carries the flag: with VP on, defeating every opponent ends the game by
 * scoring immediately (only live seats are scored, so the survivor wins with a
 * full breakdown); with VP off it stays the classic instant win. The internal VP
 * re-declaration omits the flag so it never re-intercepts.
 */
export function declareAdventureWinner(
  state: GameState,
  playerId: PlayerId,
  reason: string,
  options?: { viaVictoryCondition?: boolean }
): void {
  if (!state.adventure) {
    return;
  }
  // Idempotent: the first declared winner sticks. A later call (e.g. last-faction
  // standing after a siege that already granted a hero-defeat win) must not
  // overwrite the reason or re-emit GAME_WON.
  if (state.adventure.winnerPlayerId) {
    return;
  }
  // Victory Points mode: a victory-condition COMPLETION scores the table instead
  // of winning outright (last-faction-standing carries the flag too — the
  // internal VP re-declaration below is what omits it).
  if (options?.viaVictoryCondition && victoryPointsModeActive(state)) {
    endGameByVictoryPoints(state, { completerId: playerId, completionReason: reason });
    return;
  }
  state.adventure.winnerPlayerId = playerId;
  state.phase = "game-over";
  // Close every post-combat gate so nothing can re-open map play after a win
  // (Necromancy / First Aid would otherwise keep offering actions on a finished
  // table, and a deferred field visit must not run after the objective win).
  state.adventure.pendingNecromancy = null;
  state.adventure.pendingCommanderFirstAid = null;
  for (const player of Object.values(state.players)) {
    player.necromancyWindow = false;
  }
  appendEvent(state, { type: "GAME_WON", playerId, reason });
}

/**
 * End the game by Victory Points scoring (VP mode only). Runs the pure scorer,
 * emits `VP_SCORING` with the full per-player breakdown, then declares the
 * most-VP seat through the SAME {@link declareAdventureWinner} machinery (with
 * the flag OFF, so it takes the instant-win path and match-report / overlays
 * read the VP winner as THE winner). `completerId` is the player who completed
 * the victory condition (earning the completion VP), or null on a round-limit
 * end.
 */
export function endGameByVictoryPoints(
  state: GameState,
  options: { completerId: PlayerId | null; completionReason: string }
): void {
  if (!state.adventure || state.adventure.winnerPlayerId) {
    return;
  }
  const { completerId, completionReason } = options;
  const result = computeVictoryPoints(state, { completerId });
  if (!result.winnerId) {
    return;
  }
  const winnerRow = result.breakdown.find((row) => row.playerId === result.winnerId);
  appendEvent(state, {
    type: "VP_SCORING",
    completerPlayerId: completerId,
    reason: completionReason,
    winnerPlayerId: result.winnerId,
    breakdown: result.breakdown.map((row) => ({
      playerId: row.playerId,
      total: row.total,
      rows: row.rows.map((entry) => ({ label: entry.label, vp: entry.vp }))
    }))
  });
  declareAdventureWinner(
    state,
    result.winnerId,
    `the most Victory Points (${winnerRow?.total ?? 0})`
  );
}

/** Human seats in turn order (the neutral seat never counts). */
export function humanPlayerIds(state: GameState): PlayerId[] {
  return state.turnOrder.filter((id) => id !== NEUTRAL_PLAYER_ID);
}

/**
 * Seats that started the scenario, INCLUDING eliminated observers. Used for
 * the "defeat N enemy heroes" threshold so eliminating a rival does not lower
 * the requirement mid-game (a 3-player table still needs 2 hero defeats even
 * after one seat is removed from turn order).
 */
export function adventureSeatCount(state: GameState): number {
  return Object.keys(state.players).filter((id) => id !== NEUTRAL_PLAYER_ID).length;
}

/**
 * One resource-gain "level" for the town-conquest reward. Valuables are the
 * scarcest track, materials the middle one, gold the most plentiful, so a level
 * is +5 gold, +2 building materials, or +1 valuables — the player's choice.
 */
export const RESOURCE_GAIN_LEVEL_AMOUNTS: Record<ResourceKind, number> = {
  gold: 5,
  buildingMaterials: 2,
  valuables: 1
};

/** Turns a baseless player survives before Player Elimination (house rule: 2). */
export const ELIMINATION_GRACE_TURNS = 2;

/**
 * Whether a player still controls a Town or a Settlement on the map — the test
 * that staves off Player Elimination (rulebook p.11). A faction Town an enemy
 * has flagged no longer counts; a Settlement (or a captured Random Town, which
 * the rulebook says to "treat as a Settlement") counts only while the player
 * holds its flag. Flagging an enemy Town never changes its `controllerId`
 * (rulebook p.76), so map control is read from the field flags, not ownership.
 *
 * `exceptFieldId` skips one Field entirely — used by the siege-defeat rule to
 * ask "will the loser still hold a base once THIS Town falls?" before the flag
 * has actually changed hands (the conqueror flags it later, in their field
 * visit). Without it the falling Town still counts as the loser's.
 */
export function controlsTownOrSettlement(
  state: GameState,
  playerId: PlayerId,
  exceptFieldId?: MapSpaceId
): boolean {
  const adventure = state.adventure;
  if (!adventure) {
    return true;
  }
  for (const field of Object.values(adventure.fields)) {
    if (exceptFieldId && field.spaceId === exceptFieldId) {
      continue;
    }
    if (field.location === "settlement" || field.location === "random_town") {
      if (field.flagOwnerId === playerId) {
        return true;
      }
      continue;
    }
    if (locationDefinitions[field.location]?.category === "town") {
      if (field.flagOwnerId === playerId) {
        return true;
      }
      // A faction Town nobody has flagged still belongs to its home owner.
      if (
        !field.flagOwnerId &&
        Object.values(state.towns).some(
          (town) => town.fieldId === field.spaceId && town.controllerId === playerId
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Re-evaluates a player's elimination clock after a flag changes hands: holding
 * a base clears the clock, losing the last one starts it at the grace length.
 * The clock only counts down at the end of the player's own turns (endTurn).
 */
export function refreshEliminationClock(state: GameState, playerId: PlayerId): void {
  if (!state.adventure || playerId === NEUTRAL_PLAYER_ID) {
    return;
  }
  const player = state.players[playerId];
  if (!player || player.eliminated) {
    return;
  }

  if (controlsTownOrSettlement(state, playerId)) {
    if (player.eliminationCountdown != null) {
      player.eliminationCountdown = null;
      appendEvent(state, { type: "PLAYER_ELIMINATION_CLOCK", playerId, turnsLeft: null });
    }
    return;
  }

  if (player.eliminationCountdown == null) {
    player.eliminationCountdown = ELIMINATION_GRACE_TURNS;
    appendEvent(state, {
      type: "PLAYER_ELIMINATION_CLOCK",
      playerId,
      turnsLeft: ELIMINATION_GRACE_TURNS
    });
  }
}

/**
 * Cards a pending visit lifted OUT of a shared zone and still holds inside its
 * steps: the Polish Pandora Search (RESOLVE_PANDORA_SEARCH) and the reduced
 * starting bonus's Minor-Artifact pick (RESOLVE_DRAW_CHOOSE_MINOR) both park
 * the whole reveal in their CHOOSE_ONE options. Dropping such a visit (its
 * owner was eliminated) must put those cards back on top of their draw pile —
 * shared decks may never shrink because a seat died mid-pick. Every option of
 * one CHOOSE_ONE carries the SAME `drawn` list, so only the first resolve step
 * found is returned (identity dedupe would break across a serialize round-trip).
 */
function returnCardsLiftedIntoVisitSteps(state: GameState, steps: VisitStep[]): void {
  const findResolveStep = (
    scan: VisitStep[]
  ): Extract<VisitStep, { type: "RESOLVE_PANDORA_SEARCH" | "RESOLVE_DRAW_CHOOSE_MINOR" }> | null => {
    for (const step of scan) {
      if (step.type === "RESOLVE_PANDORA_SEARCH" || step.type === "RESOLVE_DRAW_CHOOSE_MINOR") {
        return step;
      }
      if (step.type === "CHOOSE_ONE") {
        for (const option of step.options) {
          const found = findResolveStep(option.steps);
          if (found) {
            return found;
          }
        }
      }
    }
    return null;
  };

  const step = findResolveStep(steps);
  if (!step) {
    return;
  }
  if (step.type === "RESOLVE_PANDORA_SEARCH") {
    const pandoraDeck = state.adventure?.pandoraDeck;
    if (pandoraDeck) {
      // drawn[0] came off the top (pop) — push back in reverse so it returns on top.
      for (let index = step.drawn.length - 1; index >= 0; index -= 1) {
        pandoraDeck.push(step.drawn[index]!);
      }
    }
    return;
  }
  const deck = state.decks[step.deckId];
  if (deck) {
    for (let index = step.drawn.length - 1; index >= 0; index -= 1) {
      deck.drawPile.push(step.drawn[index]!);
    }
  }
}

/**
 * Removes a player from the game (they gave up, or the elimination clock ran
 * out). They keep a `players` entry so the table still shows them as an
 * observer, but they leave the turn order and their Hero models leave the map
 * (rulebook p.11). The last faction standing then wins the Scenario in any
 * victory mode ("If you eliminate all enemy Factions, you immediately win").
 */
export function eliminatePlayer(
  state: GameState,
  playerId: PlayerId,
  reason: string,
  gaveUp: boolean
): void {
  const player = state.players[playerId];
  if (!player || player.eliminated || playerId === NEUTRAL_PLAYER_ID) {
    return;
  }

  player.eliminated = true;
  player.eliminationCountdown = null;
  // A level-up Ability Search the seat had in flight is abandoned with the seat;
  // drop its transient marker so it never attaches to anything. The historical
  // `levelUpAbilityPicks` record stays (a completed public log, like
  // `deckDrawnAbilityCardIds`).
  player.pendingLevelUpAbilitySearch = undefined;

  for (const hero of Object.values(state.heroes)) {
    if (hero.controllerId === playerId) {
      hero.spaceId = null;
      hero.movementPoints = 0;
    }
  }

  state.turnOrder = state.turnOrder.filter((id) => id !== playerId);

  // Stale per-player interactions must not outlive the seat: a queued reward
  // (or an open visit) for the eliminated player would open a choice nobody
  // can answer — freezing the whole table behind the round-start event
  // barrier. The barrier sentinel carries only a nominal playerId and is
  // pumped regardless of seat, so it stays.
  if (state.adventure) {
    // Shared Event bookkeeping queued on the eliminated seat (the Event
    // drawer's auction opens/resolves, the end-of-Event pool cleanup) acts on
    // TABLE state, not on the seat: dropping it with the seat's own rewards
    // would leak the displayed pool/lot cards out of the game (the next Event
    // resets events.pool/auction) and leave remaining auction lots unrun.
    // Hand those steps to the next live seat — they never read visit.playerId.
    const nextLiveId = liveEventPlayers(state)[0];
    for (const reward of state.adventure.rewardQueue) {
      if (nextLiveId && reward.playerId === playerId && isSharedEventBookkeepingReward(reward)) {
        reward.playerId = nextLiveId;
      }
    }
    state.adventure.rewardQueue = state.adventure.rewardQueue.filter(
      (reward) => reward.kind === "round-start-events-resolved" || reward.playerId !== playerId
    );
    if (state.adventure.pendingVisit?.playerId === playerId) {
      // A visit step can hold cards LIFTED out of a shared zone (the Polish
      // Pandora Search / reduced-starting-bonus Minor-Artifact pick keep the
      // whole reveal inside their CHOOSE_ONE options). Return them before the
      // visit drops so eliminating the owner never destroys shared cards, and
      // drop any Random-Artifacts access latch the visit's roll left behind.
      returnCardsLiftedIntoVisitSteps(state, state.adventure.pendingVisit.steps);
      clearPolishArtifactAccess(state);
      state.adventure.pendingVisit = null;
    }
    if (state.adventure.pendingNecromancy?.playerId === playerId) {
      state.adventure.pendingNecromancy = null;
    }
    if (state.adventure.pendingCommanderFirstAid?.playerId === playerId) {
      state.adventure.pendingCommanderFirstAid = null;
    }
    if (state.adventure.pendingFarTileFlip?.playerId === playerId) {
      state.adventure.pendingFarTileFlip = null;
    }
    // A Monolith/Whirlpool travel the eliminated seat had in flight never
    // completes (their hero has left the map); the destination token itself
    // stays available for everyone else.
    if (state.adventure.pendingTokenTeleport?.playerId === playerId) {
      state.adventure.pendingTokenTeleport = null;
    }
    // Event shared-state the seat held a stake in: a secret auction bid must
    // not win the lot for a dead hand, and an open 1-for-1 Marketplace deal
    // they proposed must not stay acceptable (with the deal voided, queued
    // EVENT_MARKET_DEAL_ANSWER steps see no deal and fall through cleanly).
    const events = state.adventure.events;
    if (events?.auction) {
      delete events.auction.bids[playerId];
    }
    if (events?.deal && events.deal.proposerId === playerId && !events.deal.done) {
      events.deal = null;
    }
    // Forty Thieves: the two drawn Event cards are custodied in
    // events.pendingPick, so an elimination never destroys them — but if the
    // seat's cleanup above just dropped the OPEN pick (its queued reward or its
    // open visit), somebody still has to answer it or the round resolves no
    // Event and the pair leaks out of the deck. Re-queue the pick at the FRONT
    // for the next live seat (the queued-reward case is already re-owned via
    // isSharedEventBookkeepingReward and detected here as still referenced);
    // with no live seat left, void the pick back onto the top of the deck.
    if (events?.pendingPick) {
      const referencesFortyPick = (steps: VisitStep[]): boolean =>
        steps.some(
          (step) =>
            step.type === "EVENT_FORTY_PICK" ||
            step.type === "EVENT_FORTY_RESOLVE" ||
            (step.type === "CHOOSE_ONE" && step.options.some((option) => referencesFortyPick(option.steps)))
        );
      const stillReferenced =
        state.adventure.rewardQueue.some(
          (reward) => reward.kind === "visit-steps" && referencesFortyPick(reward.steps)
        ) || Boolean(state.adventure.pendingVisit && referencesFortyPick(state.adventure.pendingVisit.steps));
      if (!stillReferenced) {
        if (nextLiveId) {
          state.adventure.rewardQueue.unshift({
            playerId: nextLiveId,
            kind: "visit-steps",
            steps: [{ type: "EVENT_FORTY_PICK" }]
          });
        } else {
          const deck = state.decks[EVENTS_DECK_ID];
          for (const cardId of [...events.pendingPick.cardIds].reverse()) {
            deck?.drawPile.push(cardId);
          }
          events.pendingPick = null;
        }
      }
    }
  }

  // PvP Neutral Control: a NEUTRAL-side combat decision the eliminated seat
  // was answering (a guard's splash target, reroll window, activation tie …)
  // is NOT the seat's own interaction — it is the Neutral side's, merely
  // re-stamped to its human controller. Dropping it would strand the paused
  // attack stack, so hand it BACK to the neutral seat instead: the next
  // action's pump re-stamps it to the new next-clockwise controller, or the
  // AI auto-resolves it when nobody live remains to take the guards.
  if (
    state.pendingChoice &&
    state.pendingChoice.playerId === playerId &&
    state.combat &&
    !state.combat.outcome &&
    isNeutralSideCombatChoice(state.combat, state.pendingChoice) &&
    // The AI-mode fighter picks (neutral-target tie / landing cell) belong to
    // the FIGHTER's own flow — an eliminated fighter concedes the whole fight
    // through the combat machinery, so only a non-participant's (the
    // controller's) answer is handed back.
    state.combat.attackerPlayerId !== playerId &&
    state.combat.defenderPlayerId !== playerId
  ) {
    state.pendingChoice.playerId = NEUTRAL_PLAYER_ID;
    if (state.priorityPlayerId === playerId) {
      state.priorityPlayerId = null;
    }
  }

  // PvP Neutral Control: the pre-battle formation-SORT window is the Neutral
  // side's, held by the eliminated controller. Hand it to the next live
  // controller (re-derived from the shrunken turn order); with nobody left to
  // take the guards the table is down to the fighter (the game is ending), so
  // the window simply clears and priority returns to the fighter.
  if (state.combat && !state.combat.outcome && state.combat.pendingNeutralPlacement === playerId) {
    const nextController = neutralCombatControllerId(state, state.combat);
    state.combat.pendingNeutralPlacement = nextController;
    if (state.phase === "combat-setup") {
      state.priorityPlayerId = nextController ?? state.combat.attackerPlayerId;
    }
  }

  // An OPEN choice owned by the seat is the same table-freezing trap as a
  // queued reward (only the owner may answer a pendingChoice, and under the
  // round-start Event/Astrologers barrier every other seat is frozen behind
  // it). Drop it — returning any cards the choice lifted OUT of a shared zone
  // first, so eliminating the owner never destroys shared-deck cards.
  const choice = state.pendingChoice;
  if (choice && choice.playerId === playerId) {
    if (choice.type === "DECK_SEARCH") {
      state.decks[choice.deckId]?.discardPile.push(...choice.revealedCardIds);
      // Polish Random Artifacts: the dropped Search owned any live access
      // latch (interactions are a singleton); resolveDeckSearch would have
      // cleared it, so the drop must too.
      clearPolishArtifactAccess(state);
    }
    if (choice.type === "OPTION_CHOICE" && choice.visionsScry) {
      state.decks[NEUTRAL_DECK_IDS[choice.visionsScry.tier]]?.discardPile.push(
        ...choice.visionsScry.remaining,
        ...choice.visionsScry.toReturn
      );
    }
    if (choice.type === "OPTION_CHOICE" && choice.pandoraScry) {
      // A Pandora scry lifted these cards OFF the top of a shared draw pile
      // (finishPandoraScry puts the kept ones back there); return every
      // undecided AND already-kept card to the top so eliminating the scrying
      // seat never shrinks the deck. Cards it already discarded sit in the
      // discard pile and stay there.
      const deck = state.decks[choice.pandoraScry.deckId];
      if (deck) {
        const returning = [...choice.pandoraScry.remaining, ...choice.pandoraScry.toReturn];
        for (let index = returning.length - 1; index >= 0; index -= 1) {
          deck.drawPile.push(returning[index]);
        }
      }
    }
    state.pendingChoice = null;
    if (state.phase === "choice") {
      const returnPhase = "returnPhase" in choice ? choice.returnPhase : undefined;
      state.phase =
        returnPhase && !(returnPhase === "combat" && !state.combat)
          ? returnPhase
          : state.combat
            ? "combat"
            : "player-turn";
    }
    if (state.priorityPlayerId === playerId) {
      state.priorityPlayerId = null;
    }
    // A dropped Monolith/Whirlpool placement must not strand the token on an
    // already-revealed tile (nobody would ever be offered it again): auto-place
    // it at the first legal candidate. The eliminated seat's own in-flight
    // travel was already cleared above, so this never teleports a dead hero.
    if (choice.type === "OPTION_CHOICE" && choice.context === "place-map-token" && choice.mapToken && state.adventure) {
      const tokenTile = state.adventure.tiles[choice.mapToken.tileInstanceId];
      const autoSpaceId = choice.mapToken.candidates[0];
      if (tokenTile && autoSpaceId) {
        placeMapToken(state, tokenTile, autoSpaceId, playerId);
        // Multi-token tiles: drain the rest of the queue the same way (no new
        // prompt can be offered to a dead seat).
        autoResolvePendingMapTokens(state, tokenTile, playerId);
      }
    }
    // A dropped Field Override placement is the same trap PLUS it was holding
    // the whole reveal chain (gate → bank → token) shut. Drop the tile's
    // override queue (pool draws refuse; nobody is left to pick a hex), then
    // resume the chain non-interactively: gates carve at their default hex and
    // a designed token auto-places — the bank offer is simply skipped (the
    // Blocked Field stays blocked and the bank token pile is untouched).
    if (
      choice.type === "OPTION_CHOICE" &&
      choice.context === "place-field-override" &&
      choice.fieldOverride &&
      state.adventure
    ) {
      const overrideTile = state.adventure.tiles[choice.fieldOverride.tileInstanceId];
      if (overrideTile) {
        delete overrideTile.pendingFieldOverrides;
        delete overrideTile.pendingFieldOverride;
        eventNote(
          state,
          `The Field Override on the revealed tile was dropped — the placing seat was eliminated.`,
          playerId
        );
        recomputeSubterraneanGates(state.adventure);
        autoResolvePendingMapTokens(state, overrideTile, playerId);
      }
    }
  }

  // An open "new adventure" confirmation vote is void once the live-seat set
  // changes (this seat can no longer confirm / may have been the requester):
  // clear it so a stale vote never sits half-approved. The table can re-open it.
  clearResetVote(state);

  appendEvent(state, { type: "PLAYER_ELIMINATED", playerId, reason, gaveUp });

  if (state.adventure && !state.adventure.winnerPlayerId) {
    const remaining = humanPlayerIds(state).filter((id) => !state.players[id]?.eliminated);
    if (remaining.length === 1) {
      // Defeating every opponent COMPLETES the game. In Victory Points mode the
      // viaVictoryCondition flag routes this through endGameByVictoryPoints, so
      // the table is SCORED right away (the survivor earns the completion VP and,
      // as the only live seat, wins with a full breakdown) instead of playing out
      // the remaining rounds — there is no opponent left to play against. With VP
      // off the flag is ignored and this stays the classic instant win.
      declareAdventureWinner(state, remaining[0], "the last faction standing", {
        viaVictoryCondition: true
      });
    }
  }
}

/**
 * Enemy heroes a player must beat to win by military dominance (Grail Hunt /
 * Dragon Hunt): every enemy in a 2- or 3-player game (1 / 2), but only 2 of
 * the 3 in a 4-player game. `playerCount` is the scenario seat count at setup
 * (use `adventureSeatCount`, not the live turn order — eliminations must not
 * lower the threshold).
 */
export function requiredHeroDefeats(playerCount: number): number {
  return playerCount >= 4 ? 2 : Math.max(1, playerCount - 1);
}

/**
 * The shared deck searched for a Relic artifact reward. BINH mode keeps a
 * dedicated Relic deck; Legacy mode only has the single mixed Artifact deck.
 */
export function relicArtifactDeckId(state: GameState): "artifacts-relic" | "artifacts" {
  return state.decks["artifacts-relic"] ? "artifacts-relic" : "artifacts";
}

/**
 * Creature-bank consolation (a Grail or Dragon Utopia that is not this game's
 * objective): "gain 10 gold and Search (2) the Relic Artifact deck."
 */
function giveCreatureBankConsolation(state: GameState, playerId: PlayerId, fieldName: string): void {
  gainResources(state, playerId, { gold: 10 }, `cleared the ${fieldName}`);
  state.adventure?.rewardQueue.push({
    playerId,
    kind: "shared-deck-search",
    deckId: relicArtifactDeckId(state),
    count: 2
  });
}

/**
 * Grant the designer's center-hex bonus ({@link MapFieldState.centerHexReward}
 * + {@link MapFieldState.centerHexVp} — plus the legacy pre-centerHex
 * `viiReward`/`viiVp` a mid-flight snapshot may still carry) the FIRST time the
 * objective is cleared / captured. Called from ONE seam — the top of
 * `beginFieldVisit` — which is reached only once the field's guards are dealt
 * with (a fought win, a Quick-Combat win or a Diplomacy skip; a retreat never
 * visits), so it uniformly covers every Ⅶ objective kind: the three designations
 * (Grail / Dragon Utopia / Random Town) AND printed centers (Cyclops Stockpile,
 * Temple of the Sea, settlement, airship yard…). The `centerHexClaimed` latch
 * (shared with the legacy `viiBonusClaimed`) makes it strictly one-time, so a
 * later re-capture never re-pays it. Resources are granted inline; Treasure
 * dice and deck Searches queue as a `visit-steps` reward so they never collide
 * with the location's own visit interaction. VP is recorded unconditionally
 * (it scores only in VP mode).
 */
function grantCenterHexBonus(state: GameState, playerId: PlayerId, field: MapFieldState): void {
  if (field.centerHexClaimed || field.viiBonusClaimed) {
    return;
  }
  const reward: CustomCenterHexReward = { ...(field.viiReward ?? {}), ...(field.centerHexReward ?? {}) };
  const vp = field.centerHexVp ?? field.viiVp ?? 0;
  const resources: { gold?: number; buildingMaterials?: number; valuables?: number } = {};
  for (const key of ["gold", "buildingMaterials", "valuables"] as const) {
    if ((reward[key] ?? 0) > 0) {
      resources[key] = reward[key];
    }
  }
  const steps: VisitStep[] = [];
  if ((reward.treasureDice ?? 0) > 0) {
    steps.push({ type: "ROLL_TREASURE_DICE", count: reward.treasureDice as number });
  }
  for (const [key, deckId] of [
    ["searchSpell", "spells"],
    ["searchAbility", "abilities"],
    ["searchArtifact", "artifacts"]
  ] as const) {
    if ((reward[key] ?? 0) > 0) {
      steps.push({ type: "SEARCH_SHARED_DECK", deckId, count: reward[key] as number });
    }
  }
  if (Object.keys(resources).length === 0 && steps.length === 0 && vp <= 0) {
    return;
  }
  field.centerHexClaimed = true;
  field.viiBonusClaimed = true;
  if (Object.keys(resources).length > 0) {
    gainResources(state, playerId, resources, "the Ⅶ objective reward");
  }
  if (steps.length > 0) {
    state.adventure?.rewardQueue.push({ playerId, kind: "visit-steps", steps });
  }
  if (vp > 0) {
    recordVpViiCenter(state, playerId, vp);
  }
}

/**
 * Dragon Utopia bonus Search — the designer option (`objectives.utopiaBonusSearch`,
 * 1-3) grants the defeater an EXTRA Artifact-deck Search ON TOP of the printed
 * reward, reusing the same reward-queue plumbing every field search uses. No-op
 * unless the option is set. NOT called in Dragon Hunt (defeating the Utopia wins
 * the game outright, so there is no later turn to spend a search).
 */
function grantUtopiaBonusSearch(state: GameState, playerId: PlayerId): void {
  const count = state.adventure?.mapPreset?.objectives?.utopiaBonusSearch;
  if (!count) {
    return;
  }
  state.adventure?.rewardQueue.push({
    playerId,
    kind: "shared-deck-search",
    deckId: "artifacts",
    count
  });
}

/**
 * Holy Grail: how many distinct Obelisks this player has visited (flagged).
 */
export function grailObelisksVisitedCount(state: GameState, playerId: PlayerId): number {
  return state.adventure?.grail?.obelisksVisited?.[playerId]?.length ?? 0;
}

/**
 * Holy Grail: how many distinct Obelisks a hero must visit before the dig
 * unlocks. Reads the map-designer preset (`objectives.grailObelisksRequired`,
 * 1-4) with {@link GRAIL_OBELISKS_REQUIRED} (2) as the fallback — the SINGLE
 * consumer point so no reader drifts. Absent preset = today's constant.
 */
export function grailObelisksRequired(state: GameState): number {
  return state.adventure?.mapPreset?.objectives?.grailObelisksRequired ?? GRAIL_OBELISKS_REQUIRED;
}

/**
 * Holy Grail: whether this player has visited enough Obelisks to dig.
 */
export function canDigGrail(state: GameState, playerId: PlayerId): boolean {
  if (adventureVictoryMode(state) !== "grail") {
    return false;
  }
  return grailObelisksVisitedCount(state, playerId) >= grailObelisksRequired(state);
}

/**
 * Record that a player has visited a distinct Obelisk (Holy Grail dig progress).
 * No-op outside grail mode or when the field is already on their list.
 */
function recordGrailObeliskVisit(state: GameState, playerId: PlayerId, fieldId: MapSpaceId): void {
  const adventure = state.adventure;
  if (!adventure || adventureVictoryMode(state) !== "grail") {
    return;
  }
  const grail = adventure.grail ?? (adventure.grail = { status: "uncollected" });
  const visited = grail.obelisksVisited ?? (grail.obelisksVisited = {});
  const list = visited[playerId] ?? (visited[playerId] = []);
  if (!list.includes(fieldId)) {
    list.push(fieldId);
  }
}

/**
 * The map-wide Obelisk role a designed map forces, or `undefined` for the
 * classic locked-die house rule. ABSENCE is classic — there is no stored
 * "classic" value that could drift. Rides on `adventure.mapPreset.obelisks`
 * (public; passes through player views / reconnects untouched). The
 * winning-condition role (Holy-Grail dig progress) is identical in every mode;
 * only the visit reward/behaviour changes. See CustomMapPreset.obelisks.
 */
export function obeliskPresetRole(
  state: GameState
): "monolith" | "bonus" | "victory-only" | undefined {
  return state.adventure?.mapPreset?.obelisks?.role;
}

/** Whether Obelisk fields join the Monolith teleport network (role "monolith"). */
export function obeliskRoleIsMonolith(state: GameState): boolean {
  return obeliskPresetRole(state) === "monolith";
}

/**
 * Grail field visit. In Holy Grail the first visit (after the guards fall)
 * arms the dig; a later revisit for 1 MP collects the single Grail Token
 * once the digger has visited {@link GRAIL_OBELISKS_REQUIRED} Obelisks, which
 * must then be carried home. In every other mode it is a normal Lvl-VII fight
 * rewarding gold and a Relic artifact.
 */
function handleGrailVisit(state: GameState, hero: HeroState, field: MapFieldState, revisit: boolean): void {
  const adventure = state.adventure;
  if (!adventure) {
    return;
  }

  if (adventureVictoryMode(state) !== "grail") {
    if (!field.blackCube) {
      field.blackCube = true;
      giveCreatureBankConsolation(state, hero.controllerId, "Grail");
    }
    return;
  }

  const grail = adventure.grail ?? (adventure.grail = { status: "uncollected" });

  if (!revisit) {
    // The guards have just fallen. Stop the field re-fighting and arm the dig;
    // the Grail itself is not collected until the hero spends another MP (and
    // has visited enough Obelisks — see canDigGrail).
    field.blackCube = true;
    if (grail.status === "uncollected") {
      field.grailDiggable = true;
    }
    return;
  }

  // Revisit = the dig. Only the first dig mints the one Grail Token, and only
  // after the digger has discovered enough Obelisks (legal-actions / revisitField
  // gate this; this is the resolution backstop).
  if (field.grailDiggable && grail.status === "uncollected" && canDigGrail(state, hero.controllerId)) {
    field.grailDiggable = false;
    grail.status = "carried";
    grail.carrierHeroId = hero.id;
    appendEvent(state, {
      type: "FIELD_FLAGGED",
      playerId: hero.controllerId,
      fieldId: field.spaceId,
      location: field.location,
      previousOwnerId: null
    });
  }
}

/**
 * Dragon Utopia visit (after its dragons are defeated — the four-dragon party,
 * trimmed to the difficulty-scaled count when guards scale by difficulty):
 *  - Dragon Hunt: defeating the Utopia wins outright (no need to hold it).
 *  - Dragon Conqueror: the victor captures and must hold it; rivals besiege it.
 *  - Grail Hunt & Conquest: a normal Lvl-VII creature bank rewarding gold and a
 *    Relic artifact — the Utopia is NOT a win condition in those modes.
 */
function handleDragonUtopiaVisit(state: GameState, hero: HeroState, field: MapFieldState): void {
  const mode = adventureVictoryMode(state);

  // Victory Points: record the defeater for the defeat-dragon-utopia objective.
  // A defeated Utopia otherwise leaves only an owner-less black cube, so this is
  // the only durable trace of WHO cleared it. Runs in every mode (the objective
  // is meaningful outside Dragon Hunt, where the Utopia is a plain bank).
  recordVpUtopiaDefeat(state, hero.controllerId);

  if (mode === "dragon-hunt") {
    declareAdventureWinner(state, hero.controllerId, "defeated the Dragon Utopia", {
      viaVictoryCondition: true
    });
    return;
  }

  if (mode === "dragon-conqueror") {
    // Capture: flag the Utopia for the victor and keep neutrals from
    // respawning. Holding it at the start of a later turn wins.
    const firstCapture = !field.everFlagged;
    const previousOwnerId = field.flagOwnerId;
    field.flagOwnerId = hero.controllerId;
    field.everFlagged = true;
    field.blackCube = false;
    // Bonus Search on the FIRST defeat only (a later re-capture is not a fresh
    // Utopia clear).
    if (firstCapture) {
      grantUtopiaBonusSearch(state, hero.controllerId);
    }
    appendEvent(state, {
      type: "FIELD_FLAGGED",
      playerId: hero.controllerId,
      fieldId: field.spaceId,
      location: field.location,
      previousOwnerId: previousOwnerId && previousOwnerId !== hero.controllerId ? previousOwnerId : null
    });
    return;
  }

  if (!field.blackCube) {
    field.blackCube = true;
    giveCreatureBankConsolation(state, hero.controllerId, "Dragon Utopia");
    grantUtopiaBonusSearch(state, hero.controllerId);
  }
}

/**
 * Star Axis (flaggable, keeps every visitor's cube): the visiting player flags
 * it and, the first time they do, may empower one of their hand Statistic
 * cards.
 */
function handleStarAxisVisit(state: GameState, hero: HeroState, field: MapFieldState): void {
  const adventure = state.adventure;
  if (!adventure) {
    return;
  }

  const playerId = hero.controllerId;
  const alreadyHere = field.flagOwnerId === playerId || Boolean(field.extraFlagOwnerIds?.includes(playerId));

  field.everFlagged = true;
  if (!field.flagOwnerId) {
    flagField(state, playerId, field);
  } else if (field.flagOwnerId !== playerId && !field.extraFlagOwnerIds?.includes(playerId)) {
    field.extraFlagOwnerIds = [...(field.extraFlagOwnerIds ?? []), playerId];
    appendEvent(state, {
      type: "FIELD_FLAGGED",
      playerId,
      fieldId: field.spaceId,
      location: field.location,
      previousOwnerId: null
    });
  }

  if (!alreadyHere) {
    adventure.pendingVisit = { heroId: hero.id, playerId, fieldId: field.spaceId, steps: [{ type: "STAR_AXIS_SWAP" }] };
    processPendingVisit(state);
  }
}

/** Attack-die faces for an Obelisk roll (two each of -1, 0, +1). */
const OBELISK_DIE_FACES: (-1 | 0 | 1)[] = [-1, -1, 0, 0, 1, 1];

/** The reward a visitor receives for an Obelisk's locked Attack-die face. */
function obeliskRewardSteps(roll: -1 | 0 | 1): VisitStep[] {
  if (roll < 0) {
    // -1: a single positive morale token.
    return [{ type: "GAIN_MORALE", amount: 1 }];
  }
  if (roll > 0) {
    // +1: roll one Treasure (yellow) die and one Resource die.
    return [
      { type: "ROLL_TREASURE_DICE", count: 1 },
      { type: "ROLL_RESOURCE_DICE", count: 1 }
    ];
  }
  // 0: Search (2) the Artifact deck (the game's standard artifact search).
  return [{ type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 2 }];
}

/**
 * The visit steps a designer-configured Obelisk "bonus" role grants — reusing
 * the same interaction plumbing every field visit uses (no new reward
 * machinery). A "dice" bonus resolves EACH die (a step per die, like the
 * Cyclops Stockpile), not the pick-one Pandora form.
 */
function obeliskBonusVisitSteps(bonus: CustomMapObeliskBonus): VisitStep[] {
  switch (bonus.kind) {
    case "morale":
      return [{ type: "GAIN_MORALE", amount: bonus.amount }];
    case "search":
      return [{ type: "SEARCH_SHARED_DECK", deckId: bonus.deck, count: bonus.count }];
    case "resources":
      return [
        {
          type: "GAIN_RESOURCES",
          gold: bonus.gold,
          buildingMaterials: bonus.buildingMaterials,
          valuables: bonus.valuables
        }
      ];
    case "movement":
      return [{ type: "GAIN_MOVEMENT", amount: bonus.amount }];
    case "dice":
      return [
        ...Array.from({ length: bonus.treasure }, () => ({ type: "ROLL_TREASURE_DICE", count: 1 }) as const),
        ...Array.from({ length: bonus.resource }, () => ({ type: "ROLL_RESOURCE_DICE", count: 1 }) as const)
      ];
  }
}

/**
 * Obelisk visit. Obelisks are flaggable (every visitor keeps a cube).
 *
 * House rule (`obelisk-rewards`, BINH default ON): the FIRST hero to visit a
 * given Obelisk rolls one Attack die and the face is locked on the Field
 * (`field.obeliskRoll`) for the rest of the game. Each player's first visit
 * flags the Field and grants that locked reward — the Attack die is never
 * rerolled, so every visitor gets the same category:
 *   -1 -> +1 positive morale
 *    0 -> Search (2) the Artifact deck
 *   +1 -> roll one Treasure die and one Resource die
 * Only the Attack-die category is fixed; each visitor still rolls their own
 * Treasure/Resource dice (or searches their own Artifacts) for the +1/0 faces.
 * When the house rule is OFF the Field still multi-flags, but no die reward
 * is granted.
 *
 * Holy Grail: every first visit by a player also counts that Obelisk toward
 * their dig unlock ({@link GRAIL_OBELISKS_REQUIRED}), independent of the
 * house-rule reward toggle AND of the map-wide Obelisk role — the
 * winning-condition role is identical in classic / monolith / bonus /
 * victory-only ({@link obeliskPresetRole}). Only the visit reward/behaviour
 * changes.
 */
function handleObeliskVisit(state: GameState, hero: HeroState, field: MapFieldState): void {
  const adventure = state.adventure;
  if (!adventure) {
    return;
  }

  const playerId = hero.controllerId;
  const alreadyHere = field.flagOwnerId === playerId || Boolean(field.extraFlagOwnerIds?.includes(playerId));

  // Flag for this player, keeping every other player's cube (multi-flag, like
  // a Star Axis): "multiple players may have a Faction Cube on this Field".
  field.everFlagged = true;
  if (!field.flagOwnerId) {
    flagField(state, playerId, field);
  } else if (field.flagOwnerId !== playerId && !field.extraFlagOwnerIds?.includes(playerId)) {
    field.extraFlagOwnerIds = [...(field.extraFlagOwnerIds ?? []), playerId];
    appendEvent(state, {
      type: "FIELD_FLAGGED",
      playerId,
      fieldId: field.spaceId,
      location: field.location,
      previousOwnerId: null
    });
  }

  const role = obeliskPresetRole(state);

  // First visit by this player: register Holy-Grail progress (BEFORE any
  // teleport — the winning-condition role is identical in every mode) and grant
  // the role's one-time reward. A player who already holds a cube here gets no
  // second reward and no second grail credit — EXCEPT the Monolith role, whose
  // teleport fires on EVERY entry/Revisit (below), like a real Monolith token.
  if (!alreadyHere) {
    // Holy Grail: first visit to this Obelisk counts toward dig unlock,
    // independent of the role and the die-reward house rule.
    recordGrailObeliskVisit(state, playerId, field.spaceId);

    if (role === undefined) {
      grantClassicObeliskReward(state, hero, field, playerId);
    } else if (role === "bonus") {
      const bonus = adventure.mapPreset?.obelisks?.bonus ?? DEFAULT_OBELISK_BONUS;
      adventure.pendingVisit = {
        heroId: hero.id,
        playerId,
        fieldId: field.spaceId,
        steps: obeliskBonusVisitSteps(bonus)
      };
      processPendingVisit(state);
    } else if (role === "victory-only") {
      eventNote(
        state,
        `${eventPlayerName(state, playerId)} studies the Obelisk — a marker on the road to the Grail.`,
        playerId
      );
    }
    // role === "monolith": no visit reward; the teleport below IS the effect.
  }

  // Monolith role: entering (or Revisiting) teleports through the shared
  // Monolith network — every entry, even one that grants no fresh grail credit
  // — via the same TOKEN_TELEPORT step a Monolith token uses. The grail credit
  // above already fired on the first visit, matching the documented
  // "register grail progress before the teleport" order.
  if (role === "monolith") {
    adventure.pendingVisit = {
      heroId: hero.id,
      playerId,
      fieldId: field.spaceId,
      steps: [{ type: "TOKEN_TELEPORT", token: "monolith" }]
    };
    processPendingVisit(state);
  }
}

/**
 * The classic BINH Obelisk die reward (`obelisk-rewards` house rule, default
 * ON). The FIRST hero to visit any given Obelisk rolls one Attack die and the
 * face is LOCKED on the Field for the rest of the game; every later visitor
 * reuses it (no reroll). Only runs for the classic role (absent preset); the
 * designer roles replace it entirely.
 */
function grantClassicObeliskReward(
  state: GameState,
  hero: HeroState,
  field: MapFieldState,
  playerId: PlayerId
): void {
  const adventure = state.adventure;
  if (!adventure || !houseRuleEnabled(state, "obelisk-rewards")) {
    return;
  }

  // Lock the Attack-die face the first time ANY hero visits this Obelisk; later
  // visitors reuse it. A stored 0 is a real result, so test against undefined.
  let roll = field.obeliskRoll;
  if (roll === undefined) {
    const random = adventureRandom(state, "obelisk-die");
    roll = OBELISK_DIE_FACES[random.nextInt(0, OBELISK_DIE_FACES.length - 1)];
    field.obeliskRoll = roll;
    appendEvent(state, {
      type: "ADVENTURE_DICE_ROLLED",
      playerId,
      dice: "attack",
      results: [`Obelisk Attack die: ${roll >= 0 ? "+" : ""}${roll}`],
      attackRolls: [roll]
    });
  }

  adventure.pendingVisit = {
    heroId: hero.id,
    playerId,
    fieldId: field.spaceId,
    steps: obeliskRewardSteps(roll)
  };
  processPendingVisit(state);
}

/**
 * Grail Hunt: if the hero is carrying the Grail Token and has reached their
 * own town, the Grail is delivered and the game is won. Returns true when it
 * triggers the win.
 */
export function tryDeliverGrail(state: GameState, hero: HeroState): boolean {
  const adventure = state.adventure;
  if (!adventure || adventureVictoryMode(state) !== "grail") {
    return false;
  }

  const grail = adventure.grail;
  if (!grail || grail.status !== "carried" || grail.carrierHeroId !== hero.id) {
    return false;
  }

  const town = getTownOfPlayer(state, hero.controllerId);
  if (!town?.fieldId || town.fieldId !== hero.spaceId) {
    return false;
  }

  grail.status = "delivered";
  declareAdventureWinner(state, hero.controllerId, "carried the Grail home", {
    viaVictoryCondition: true
  });
  return true;
}

/**
 * Dragon Conqueror: a player who controls the Dragon Utopia at the start of
 * their turn has held it through a full round and wins.
 */
export function checkDragonConquerorHold(state: GameState, playerId: PlayerId): void {
  const adventure = state.adventure;
  if (!adventure || adventureVictoryMode(state) !== "dragon-conqueror" || adventure.winnerPlayerId) {
    return;
  }

  const holdsUtopia = Object.values(adventure.fields).some(
    (field) => field.location === "dragon_utopia" && field.flagOwnerId === playerId
  );
  if (holdsUtopia) {
    declareAdventureWinner(state, playerId, "held the Dragon Utopia", { viaVictoryCondition: true });
  }
}

/** Black Market artifact prices by rarity. */
const BLACK_MARKET_PRICE: Record<ArtifactTier, number> = { minor: 5, major: 7, relic: 10 };

/**
 * Black Market browse list: the top 4 cards of the Artifact discard pile(s)
 * (round-robin across the split decks in BINH mode), each priced by rarity.
 */
export function blackMarketOffers(state: GameState): { cardId: CardId; deckId: string; price: number }[] {
  const deckIds = state.decks["artifacts"]
    ? ["artifacts"]
    : ["artifacts-minor", "artifacts-major", "artifacts-relic"];
  const piles = deckIds
    .map((id) => ({ id, cards: state.decks[id]?.discardPile ?? [] }))
    .filter((pile) => pile.cards.length > 0);

  const offers: { cardId: CardId; deckId: string; price: number }[] = [];
  for (let depth = 0; offers.length < 4; depth += 1) {
    let added = false;
    for (const pile of piles) {
      const index = pile.cards.length - 1 - depth;
      if (index < 0) {
        continue;
      }
      const cardId = pile.cards[index];
      const tier = cardLibrary[cardId]?.artifactTier ?? "minor";
      offers.push({ cardId, deckId: pile.id, price: BLACK_MARKET_PRICE[tier] });
      added = true;
      if (offers.length >= 4) {
        break;
      }
    }
    if (!added) {
      break;
    }
  }
  return offers;
}

/**
 * Elemental Conflux: for every Dwelling (unlocked recruit tier) the player has,
 * the first Elementals card found in that tier's Neutral deck (draw pile top
 * first, then discard). One candidate per qualifying tier.
 */
export function elementalConfluxCandidates(
  state: GameState,
  playerId: PlayerId
): { unitDefId: string; tier: "bronze" | "silver" | "gold" }[] {
  const tiers = unlockedRecruitTiers(state, playerId);
  const candidates: { unitDefId: string; tier: "bronze" | "silver" | "gold" }[] = [];
  for (const tier of ["bronze", "silver", "gold"] as const) {
    if (!tiers.has(tier)) {
      continue;
    }
    const deck = state.decks[NEUTRAL_DECK_IDS[tier]];
    if (!deck) {
      continue;
    }
    const search = [...deck.drawPile].reverse().concat([...deck.discardPile].reverse());
    const found = search.find((unitDefId) => coreUnitDefinitions[unitDefId]?.name.includes("Elemental"));
    if (found) {
      candidates.push({ unitDefId: found, tier });
    }
  }
  return candidates;
}

/**
 * Begins resolving a field visit. Immediate effects apply at once; steps that
 * need player input wait in adventure.pendingVisit.
 */
export function beginFieldVisit(state: GameState, heroId: HeroId, fieldId: MapSpaceId, revisit: boolean): void {
  const adventure = state.adventure;
  const hero = state.heroes[heroId];
  const field = adventure?.fields[fieldId];
  if (!adventure || !hero || !field) {
    return;
  }

  const playerId = hero.controllerId;
  const player = state.players[playerId];
  const pendingWogDice = player?.pendingWogResourceDice ?? 0;
  if (pendingWogDice > 0) {
    player!.pendingWogResourceDice = 0;
    adventure.pendingVisit = {
      heroId,
      playerId,
      fieldId,
      steps: [
        ...Array.from({ length: pendingWogDice }, () => ({ type: "ROLL_RESOURCE_DICE", count: 1 } as const)),
        { type: "RESUME_FIELD_VISIT", heroId, fieldId, revisit }
      ]
    };
    processPendingVisit(state);
    return;
  }
  const location = locationDefinitionsSafe(field.location);

  appendEvent(state, {
    type: "FIELD_VISITED",
    playerId,
    heroId,
    fieldId,
    location: field.location,
    revisit
  });

  adventure.lastVisitedField[heroId] = fieldId;

  // Designer center-hex bonus (reward / VP): ONE seam for every Ⅶ objective
  // kind. beginFieldVisit is reached only once the field's guards are dealt
  // with (win / Quick Combat / Diplomacy — a retreat never visits), so this IS
  // the "first clear"; the latch inside makes it one-time. Runs before the
  // bespoke grail/utopia routing so every printed or designated center pays.
  grantCenterHexBonus(state, playerId, field);

  // Creature banks with bespoke win/objective behavior are handled before the
  // generic visitable/flaggable routing.
  if (location.id === "grail") {
    handleGrailVisit(state, hero, field, revisit);
    return;
  }
  if (location.id === "dragon_utopia") {
    handleDragonUtopiaVisit(state, hero, field);
    return;
  }
  if (location.id === "star_axis") {
    handleStarAxisVisit(state, hero, field);
    return;
  }
  if (location.id === "obelisk") {
    handleObeliskVisit(state, hero, field);
    return;
  }

  // A DESIGNED guard on a map-object teleport field (Monolith / Whirlpool /
  // Gate), a Subterranean Gate half or an outpost (Garrison / Keymaster's
  // Tent) is defeated the moment this visit runs: beginFieldVisit is reached
  // only on a WIN, a Quick-Combat win, or a Diplomacy skip — a retreat never
  // calls it. These fields take no Black Cube, so clear the leftover guard
  // here; otherwise the beaten guard would respawn on the hero's next entry.
  // (Retreat leaves it intact — the guard stands for next time.)
  if (
    (isMapObjectLocation(location.id) ||
      location.id === "subterranean_gate" ||
      isBankStyleGuardLocation(location.id)) &&
    field.difficulty
  ) {
    clearCustomGuard(field);
  }

  // Designer Garrison: the winner (or an unopposed visitor) marks it with
  // THEIR flag — single-owner, stolen on entry (an enemy-FLAGGED garrison
  // routes through the 3-gold defend prompt BEFORE this visit ever runs).
  // Walking through your own garrison does nothing.
  if (location.id === "garrison") {
    field.everFlagged = true;
    if (field.flagOwnerId !== playerId) {
      flagField(state, playerId, field);
    }
    return;
  }

  if (location.category === "visitable") {
    // "Treat it as an Empty Field as long as it has a Black Cube": a field
    // that already carries its cube does nothing on re-entry. The cube goes
    // on even when the effect is declined or impossible.
    const alreadyUsed = field.blackCube;
    field.blackCube = true;
    if (alreadyUsed) {
      return;
    }
  }

  if (location.id === "mine") {
    if (field.flagOwnerId !== playerId) {
      applyMineFlag(state, playerId, field);
    }
    return;
  }

  if (location.id === "random_town") {
    if (field.flagOwnerId !== playerId) {
      applyRandomTownFlag(state, playerId, field);
    }
    return;
  }

  if (location.id === "town") {
    if (field.flagOwnerId !== playerId) {
      applyTownFlag(state, playerId, field);
    }
    return;
  }

  if (location.id === "settlement") {
    // Re-entering a settlement you already own does nothing. The income is
    // applied once when you take it and is collected every resource round from
    // your production track — walking out and back in must NOT re-stack it.
    if (field.flagOwnerId === playerId) {
      return;
    }
    // A settlement that already carries a resource token is "founded": its
    // income is locked to the resource the first owner chose. Taking it from
    // another player automatically transfers THAT same income — the new owner
    // does not choose a resource and gets no repeat of the first-flag bonus,
    // while the former owner loses the income (all inside applySettlementResource).
    if (field.settlementResource) {
      applySettlementResource(state, playerId, field, field.settlementResource);
      return;
    }
    // Otherwise this is the very first flag (no owner yet), or a settlement that
    // was previously flagged only for a unit reinforcement (owned, but no
    // resource token was ever placed). Either way the visitor chooses a resource
    // income or a unit reinforcement; the one-time free reinforcement / stockpile
    // bonus is gated on `everFlagged` inside the resolver.
    adventure.pendingVisit = { heroId, playerId, fieldId, steps: [{ type: "SETTLEMENT_CHOICE" }] };
    processPendingVisit(state);
    return;
  }

  if (location.category === "flaggable") {
    // Obelisks and similar: multiple players may flag; keep enemy cubes.
    field.everFlagged = true;
    if (!field.flagOwnerId) {
      flagField(state, playerId, field);
    } else if (field.flagOwnerId !== playerId && !field.extraFlagOwnerIds?.includes(playerId)) {
      field.extraFlagOwnerIds = [...(field.extraFlagOwnerIds ?? []), playerId];
      appendEvent(state, {
        type: "FIELD_FLAGGED",
        playerId,
        fieldId: field.spaceId,
        location: field.location,
        previousOwnerId: null
      });
    }
    return;
  }

  const steps =
    location.implementationStatus === "implemented"
      ? interactionToSteps(location.interaction, locationDiceBonusFor(state, playerId))
      : [];

  if (steps.length === 0) {
    return;
  }

  adventure.pendingVisit = { heroId, playerId, fieldId, steps };
  processPendingVisit(state);
}

function locationDefinitionsSafe(locationId: string) {
  return (
    locationDefinitions[locationId] ?? {
      id: locationId,
      name: locationId,
      category: "empty" as const,
      interaction: { type: "NONE" as const },
      implementationStatus: "not-implemented" as const,
      source: { product: "", credit: "" }
    }
  );
}

/** Steps that need a player decision before they can resolve. */
function stepNeedsInput(step: VisitStep): boolean {
  return (
    step.type === "CHOOSE_ONE" ||
    step.type === "PAY_TO" ||
    step.type === "SETTLEMENT_CHOICE" ||
    step.type === "RESOURCE_GAIN_LEVEL" ||
    step.type === "WITCH_HUT" ||
    step.type === "TRADING_POST" ||
    step.type === "WAR_MACHINE_SHOP" ||
    step.type === "DISCOVER_ADJACENT_TILE" ||
    step.type === "MAGIC_SPRING" ||
    step.type === "REMOVE_HAND_CARD" ||
    step.type === "SEARCH_DISCARD" ||
    step.type === "HILL_FORT" ||
    step.type === "TAVERN"
  );
}

function queueVisitFollowUpReward(state: GameState, adventure: AdventureState, reward: AdventureReward): void {
  if (adventure.eventResolution?.round !== state.round) {
    adventure.rewardQueue.push(reward);
    return;
  }

  const nextRoundStartEventIndex = adventure.rewardQueue.findIndex(
    (queued) =>
      queued.kind === "round-start-events-resolved" ||
      (queued.kind === "visit-steps" && queued.steps[0]?.type === "EVENT_PLAYER_CHOICE")
  );
  if (nextRoundStartEventIndex === -1) {
    adventure.rewardQueue.push(reward);
    return;
  }

  adventure.rewardQueue.splice(nextRoundStartEventIndex, 0, reward);
}

/**
 * Resolves queued visit steps until one needs input or the visit completes.
 * Search steps hand off to the shared pendingChoice deck-search flow.
 */
export function processPendingVisit(state: GameState): void {
  const adventure = state.adventure;
  const visit = adventure?.pendingVisit;
  if (!adventure || !visit) {
    return;
  }

  while (visit.steps.length > 0) {
    const step = visit.steps[0];

    if (step.type === "WITCH_HUT") {
      // The Witch Hut hands over the top Ability card, so it obeys the same
      // acquisition rules as a deck search: discard any top card this hero may
      // not take (a duplicate it already owns, or Necromancy for a non-Necropolis
      // hero) so only an acquirable card is ever revealed and taken.
      const abilityDeck = state.decks.abilities;
      while (
        abilityDeck &&
        abilityDeck.drawPile.length > 0 &&
        !canAcquireSharedDeckCard(state, visit.playerId, "abilities", abilityDeck.drawPile[abilityDeck.drawPile.length - 1])
      ) {
        abilityDeck.discardPile.push(abilityDeck.drawPile.pop() as string);
      }
    }

    if (stepNeedsInput(step)) {
      return;
    }

    visit.steps.shift();

    switch (step.type) {
      case "GAIN_RESOURCES":
        gainResources(state, visit.playerId, step, `visited ${fieldName(state, visit.fieldId)}`);
        break;
      case "PRISON":
        // "Gain a Secondary Hero. Place their model on this Field. If you
        // already have a Secondary Hero, gain 3 gold instead." House rule: the
        // player may instead place the new hero at their Town or a controlled
        // Settlement — offered as a placement CHOOSE_ONE when more than one Field
        // is legal (otherwise it lands on the Prison Field, as before).
        if (getSecondaryHero(state, visit.playerId)) {
          gainResources(state, visit.playerId, { gold: 3 }, `visited ${fieldName(state, visit.fieldId)}`);
        } else {
          visit.steps.unshift(secondaryHeroPlacementStep(state, visit.playerId, visit.fieldId));
        }
        break;
      case "GAIN_EXPERIENCE":
        // Secondary Heroes cannot gain experience from map locations.
        if (state.heroes[visit.heroId]?.kind === "main") {
          gainExperience(state, visit.playerId, step.amount);
        }
        break;
      case "GAIN_MOVEMENT": {
        const hero = state.heroes[visit.heroId];
        if (hero) {
          hero.movementPoints += step.amount;
        }
        break;
      }
      case "GAIN_MOVEMENT_ANY_HERO": {
        // Pandora's Box "One of your Heroes gains N movement": the owner picks
        // the hero when both the Main and the Secondary Hero are on the map; a
        // lone hero (the common case) gains it without a prompt.
        const heroes = Object.values(state.heroes).filter(
          (hero) => hero.controllerId === visit.playerId && hero.spaceId !== null
        );
        if (heroes.length <= 1) {
          const hero = heroes[0] ?? state.heroes[visit.heroId];
          if (hero) {
            hero.movementPoints += step.amount;
          }
          break;
        }
        visit.steps.unshift({
          type: "CHOOSE_ONE",
          prompt: `Which Hero gains ${step.amount} movement?`,
          options: heroes.map((hero) => ({
            label: hero.kind === "main" ? "Main Hero" : "Secondary Hero",
            steps: [{ type: "GAIN_MOVEMENT_FOR_HERO", heroId: hero.id, amount: step.amount }]
          }))
        });
        break;
      }
      case "GAIN_MOVEMENT_FOR_HERO": {
        const hero = state.heroes[step.heroId];
        if (hero) {
          hero.movementPoints += step.amount;
        }
        break;
      }
      case "GAIN_MORALE": {
        // Crest of Valor (map side): a held shield negates ONE negative-morale
        // token from a Field. Multi-token fields (Warrior's Tomb = two negatives)
        // must apply token-by-token so the shield only cancels a single token
        // and the second still lands. Positive morale and combat-loss morale
        // are untouched — only a Field's own negative token is ignored here.
        const tokenDelta = step.amount > 0 ? 1 : -1;
        for (let i = 0; i < Math.abs(step.amount); i += 1) {
          if (tokenDelta < 0 && consumeIgnoreFieldNegativeMorale(state, visit.playerId)) {
            appendEvent(state, {
              type: "FIELD_MORALE_IGNORED",
              playerId: visit.playerId,
              fieldId: visit.fieldId
            });
          } else {
            changeMorale(state, visit.playerId, tokenDelta);
          }
        }
        break;
      }
      case "ROLL_RESOURCE_DICE":
        rollResourceDice(state, visit, step.count);
        break;
      case "RESUME_FIELD_VISIT":
        beginFieldVisit(state, step.heroId, step.fieldId, step.revisit);
        break;
      case "ROLL_TREASURE_DICE":
        rollTreasureDice(state, visit, step.count);
        break;
      case "CONSUME_LUCK":
        consumeLuckReroll(state, step.effectId, step.dice);
        break;
      case "CONSUME_DIE_SET":
        consumeDieSet(state, step.effectId);
        break;
      case "CONSUME_MORALE": {
        const player = state.players[visit.playerId];
        if (player && player.morale > 0) {
          player.morale -= 1;
          appendEvent(state, { type: "MORALE_SPENT", playerId: visit.playerId, benefit: "reroll" });
          appendEvent(state, {
            type: "MORALE_CHANGED",
            playerId: visit.playerId,
            amount: -1,
            total: player.morale
          });
        }
        break;
      }
      case "CONSUME_MORALE_CARD":
        // A held Morale card played into a map-die option ("Reroll a Die"):
        // returns under its deck with the MORALE_CARD_USED cue. No-op if the
        // card left the player's side since the option was built.
        consumeHeldMoraleCard(state, visit.playerId, step.cardId);
        break;
      case "CONSUME_WEASEL": {
        const astrologers = getAstrologersState(state);
        if (astrologers && !astrologers.swiftWeaselUsedBy.includes(visit.playerId)) {
          astrologers.swiftWeaselUsedBy.push(visit.playerId);
        }
        break;
      }
      case "CONSUME_REROLL_ARTIFACT": {
        const player = state.players[visit.playerId];
        const handIndex = player?.hand.indexOf(step.cardId) ?? -1;
        if (player && handIndex !== -1) {
          player.hand.splice(handIndex, 1);
          player.discard.push(step.cardId);
          appendEvent(state, {
            type: "CARD_PLAYED",
            playerId: visit.playerId,
            cardId: step.cardId,
            timing: cardLibrary[step.cardId]?.timing ?? "instant",
            mode: "basic",
            optionLabel: "Reroll a die"
          });
        }
        break;
      }
      case "CONSUME_HELD_CARD": {
        const player = state.players[visit.playerId];
        const handIndex = player?.hand.indexOf(step.cardId) ?? -1;
        if (player && handIndex !== -1) {
          player.hand.splice(handIndex, 1);
          player.discard.push(step.cardId);
          appendEvent(state, {
            type: "CARD_PLAYED",
            playerId: visit.playerId,
            cardId: step.cardId,
            timing: cardLibrary[step.cardId]?.timing ?? "instant",
            mode: "basic",
            optionLabel: step.optionLabel
          });
        }
        break;
      }
      case "KNOWLEDGE_RECALL_MAP_SPELL": {
        const player = state.players[visit.playerId];
        const knowledge = cardLibrary[step.knowledgeCardId];
        const effect = knowledge?.effect.type === "RECALL_SPELL" ? knowledge.effect : null;
        const knowledgeIndex = player?.hand.indexOf(step.knowledgeCardId) ?? -1;
        const spellIndex = player?.discard.lastIndexOf(step.spellCardId) ?? -1;
        const castEnablerIndex = step.castEnablerCardId
          ? (player?.discard.lastIndexOf(step.castEnablerCardId) ?? -1)
          : -1;
        const ongoing = player?.ongoingCards?.find((entry) => entry.cardId === step.spellCardId);
        const mode = step.mode ?? "basic";
        // Expert spends a crown; Empowered / basic do not. Stale prompts that
        // need a crown no longer available simply no-op.
        const needsCrown = mode === "expert" && !effect?.basicSpellLimitBonus;
        if (
          !player ||
          !effect ||
          knowledgeIndex === -1 ||
          (needsCrown && expertUsesAvailable(player) <= 0) ||
          (step.castEnablerCardId ? castEnablerIndex === -1 : spellIndex === -1 && !ongoing)
        ) {
          break;
        }

        player.hand.splice(knowledgeIndex, 1);
        player.discard.push(step.knowledgeCardId);
        if (needsCrown) {
          player.combatStats.expertUsesSpentThisRound += 1;
        }
        // Limit bonus: expert side of regular Knowledge, or always for Empowered.
        const limitBonus =
          mode === "expert"
            ? (effect.expertSpellLimitBonus ?? 0)
            : (effect.basicSpellLimitBonus ?? 0);
        if (limitBonus > 0) {
          player.combatStats.spellLimitBonusThisRound += limitBonus;
        }

        if (step.castEnablerCardId) {
          player.discard.splice(castEnablerIndex, 1);
          player.hand.push(step.castEnablerCardId);
        } else if (ongoing) {
          // Fly / Water Walk and any future lasting map spell cannot be cast a
          // second time while active. Knowledge marks the held card to come
          // back as soon as its effect naturally ends — to the Spell Book when
          // it was cast from the Book, otherwise the hand.
          ongoing.returnTo = step.fromSpellBook ? "spellBook" : "hand";
        } else {
          player.discard.splice(spellIndex, 1);
          if (step.fromSpellBook) {
            player.spellBook.push(step.spellCardId);
          } else {
            player.hand.push(step.spellCardId);
          }
        }

        appendEvent(state, {
          type: "CARD_PLAYED",
          playerId: visit.playerId,
          cardId: step.knowledgeCardId,
          timing: knowledge.timing,
          mode,
          optionLabel: step.castEnablerCardId
            ? "Recall Cast a Spell"
            : `Recall ${cardLibrary[step.spellCardId]?.name ?? step.spellCardId}`
        });
        break;
      }
      case "FLIP_PACK_TO_FEW": {
        const player = state.players[visit.playerId];
        const armyUnit = player?.army.find((candidate) => candidate.id === step.armyUnitId);
        if (player && armyUnit && armyUnit.side === "pack") {
          if ((step.source ?? "plague") === "plague") {
            // Polish Unit Stacks weaken the Plague: a Stacked pack sheds one
            // layer instead of flipping (applyPlagueToPack decides).
            applyPlagueToPack(state, visit.playerId, armyUnit);
          } else {
            // Pandora's Silver Muster reverse: always the plain printed flip
            // (a Stack layer never absorbs a flip the player chose).
            armyUnit.side = "few";
            delete armyUnit.stacks;
            appendEvent(state, {
              type: "ARMY_UNIT_FLIPPED",
              playerId: visit.playerId,
              unitDefId: armyUnit.unitDefId,
              reason: "Pandora's Box"
            });
          }
        }
        break;
      }
      case "PANDORA_DISCARD_ARMY_UNIT": {
        // Pandora's Box (card 173, option B): discard one army unit. A faction
        // few/pack card simply leaves the army; a single-sided neutral card
        // returns to its tier's Neutral discard pile (mirrors the Event discard).
        const player = state.players[visit.playerId];
        const unit = player?.army.find((candidate) => candidate.id === step.armyUnitId);
        if (player && unit) {
          player.army = player.army.filter((candidate) => candidate.id !== step.armyUnitId);
          if (unit.side === "neutral") {
            const tier = (coreUnitDefinitions[unit.unitDefId]?.tier ?? "bronze") as
              | "bronze"
              | "silver"
              | "gold"
              | "azure";
            state.decks[NEUTRAL_DECK_IDS[tier]]?.discardPile.push(unit.unitDefId);
          }
          appendEvent(state, {
            type: "ARMY_UNIT_FLIPPED",
            playerId: visit.playerId,
            unitDefId: unit.unitDefId,
            reason: "Pandora's Box: Silver refresh (discarded)"
          });
        }
        break;
      }
      case "PANDORA_FREE_NEUTRAL_RECRUIT": {
        // Pandora's Box (card 173, option B): draw 3 from the tier's Neutral deck
        // and open a free-recruit pick (Recruit one for free, or decline). The
        // rest return to the tier discard via PANDORA_FREE_NEUTRAL_RESOLVE.
        const drawn: string[] = [];
        for (let index = 0; index < 3; index += 1) {
          const card = drawFromNeutralDeck(state, step.tier);
          if (!card) {
            break;
          }
          drawn.push(card);
        }
        if (drawn.length === 0) {
          break;
        }
        const seen = new Set<string>();
        const recruitOptions = drawn
          .filter((unitDefId) => {
            if (seen.has(unitDefId)) {
              return false;
            }
            seen.add(unitDefId);
            return true;
          })
          .map((unitDefId) => ({
            label: `Recruit ${coreUnitDefinitions[unitDefId]?.name ?? unitDefId} (free)`,
            steps: [{ type: "PANDORA_FREE_NEUTRAL_RESOLVE", drawn, recruit: unitDefId, tier: step.tier } as VisitStep]
          }));
        visit.steps.unshift({
          type: "CHOOSE_ONE",
          prompt: `Pandora's Box: Recruit one ${step.tier} unit for free — drew ${drawn
            .map((id) => coreUnitDefinitions[id]?.name ?? id)
            .join(", ")}`,
          options: [
            ...recruitOptions,
            { label: "Decline (return all)", steps: [{ type: "PANDORA_FREE_NEUTRAL_RESOLVE", drawn, tier: step.tier } as VisitStep] }
          ]
        });
        break;
      }
      case "PANDORA_FREE_NEUTRAL_RESOLVE": {
        // Add the chosen unit to the army for free (neutral side), return the rest
        // (only ONE copy of the recruited id is consumed) to the tier discard pile.
        const player = state.players[visit.playerId];
        if (player) {
          if (step.recruit) {
            addArmyUnit(player, step.recruit, "neutral");
            appendEvent(state, {
              type: "UNIT_RECRUITED",
              playerId: visit.playerId,
              unitDefId: step.recruit,
              kind: "recruit",
              cost: {}
            });
          }
          let skipped = false;
          for (const unitDefId of step.drawn) {
            if (!skipped && step.recruit && unitDefId === step.recruit) {
              skipped = true;
              continue;
            }
            state.decks[NEUTRAL_DECK_IDS[step.tier]]?.discardPile.push(unitDefId);
          }
        }
        break;
      }
      case "REINFORCE_ARMY_UNIT":
        reinforceArmyUnit(state, visit.playerId, step.armyUnitId, step.halfCost);
        break;
      case "REINFORCE_FREE":
        reinforceArmyUnit(state, visit.playerId, step.armyUnitId, false, false, false, true);
        break;
      case "DISRUPTION_ROTATE_OFFER": {
        // Disruption (Astrologers): pick one eligible tile to rotate, or skip.
        // Eligibility is recomputed from live state each time this step runs,
        // so a tile an earlier seat rotated has dropped out; with nothing left
        // the offer resolves silently (the printed "if possible").
        const eligible = disruptionEligibleTiles(state);
        if (eligible.length === 0) {
          break;
        }
        visit.steps.unshift({
          type: "CHOOSE_ONE",
          prompt: "Disruption: rotate one tile with no Hero on it (or skip)",
          options: [
            ...eligible.map((tile) => ({
              label: `Rotate tile ${disruptionTileLabel(state, tile)}`,
              steps: [{ type: "DISRUPTION_ROTATE_TILE", tileInstanceId: tile.id } as VisitStep]
            })),
            { label: "Skip", steps: [] }
          ]
        });
        break;
      }
      case "DISRUPTION_ROTATE_TILE": {
        // The picked tile: choose its new orientation (any of the five others —
        // "freely rotate"), or back out to the tile pick.
        const tile = adventure.tiles[step.tileInstanceId];
        const stillEligible = tile && disruptionEligibleTiles(state).some((candidate) => candidate.id === tile.id);
        if (!stillEligible) {
          visit.steps.unshift({ type: "DISRUPTION_ROTATE_OFFER" });
          break;
        }
        const options: { label: string; steps: VisitStep[] }[] = [];
        for (let turns = 1; turns <= 5; turns += 1) {
          const rotation = (tile.rotation + turns) % 6;
          options.push({
            label: `Turn ${turns * 60}° clockwise`,
            steps: [{ type: "DISRUPTION_SET_ROTATION", tileInstanceId: tile.id, rotation }]
          });
        }
        options.push({ label: "Pick a different tile", steps: [{ type: "DISRUPTION_ROTATE_OFFER" }] });
        visit.steps.unshift({
          type: "CHOOSE_ONE",
          prompt: `Disruption: rotate tile ${disruptionTileLabel(state, tile)} by how much?`,
          options
        });
        break;
      }
      case "DISRUPTION_SET_ROTATION": {
        // Apply the rotation in place. Re-validated against live eligibility as
        // a transactional backstop — a stale/duplicated step can only no-op,
        // never corrupt a tile or rotate one twice.
        const tile = adventure.tiles[step.tileInstanceId];
        const stillEligible = tile && disruptionEligibleTiles(state).some((candidate) => candidate.id === tile.id);
        if (!stillEligible || !rotateTileInPlace(adventure, tile, step.rotation)) {
          break;
        }
        const astrologers = getAstrologersState(state);
        if (astrologers) {
          astrologers.disruptionRotatedTileIds = [...(astrologers.disruptionRotatedTileIds ?? []), tile.id];
        }
        appendEvent(state, {
          type: "EVENT_NOTE",
          playerId: visit.playerId,
          message: `Disruption: ${state.players[visit.playerId]?.name ?? visit.playerId} rotated tile ${tile.tileDefId}.`
        });
        break;
      }
      case "RECRUIT_FREE": {
        // Add a unit to the army for free: a Few (Garden of Life) or a Pack
        // (a Creature Bank "gain a Stacked unit" reward). Optional stacks are
        // Polish bank-size Pack layers (Dragon Fly Hive / Griffin Conservatory).
        const recruitPlayer = state.players[visit.playerId];
        if (recruitPlayer) {
          const added = addArmyUnit(recruitPlayer, step.unitDefId, step.side ?? "few");
          if (step.stacks && step.stacks > 0 && (step.side ?? "few") === "pack") {
            added.stacks = Math.max(0, Math.trunc(step.stacks));
          }
          appendEvent(state, {
            type: "UNIT_RECRUITED",
            playerId: visit.playerId,
            unitDefId: step.unitDefId,
            kind: "recruit",
            cost: {}
          });
        }
        break;
      }
      case "BANK_RECRUIT_DISCOUNT":
        bankRecruitDiscountVoucher(state, visit.playerId, {
          cardId: step.cardId,
          amount: step.amount,
          target: step.target
        });
        break;
      case "SEARCH_SHARED_DECK": {
        const reward: AdventureReward = {
          playerId: visit.playerId,
          kind: "shared-deck-search",
          deckId: step.deckId,
          count: step.count
        };
        queueVisitFollowUpReward(state, adventure, reward);
        break;
      }
      case "STARTING_BONUS_ARTIFACT_SEARCH": {
        // Search (2) once or twice, then reshuffle Artifact decks (p.10–11).
        // Prepend so the searches resolve before the next player's bonus.
        const followUps: AdventureReward[] = [];
        for (let n = 0; n < step.times; n += 1) {
          followUps.push({
            playerId: visit.playerId,
            kind: "shared-deck-search",
            deckId: "artifacts",
            count: 2
          });
        }
        followUps.push({
          playerId: visit.playerId,
          kind: "visit-steps",
          steps: [{ type: "RESHUFFLE_ARTIFACT_DECKS" }]
        });
        prependVisitFollowUpRewards(adventure, followUps);
        break;
      }
      case "REVEAL_UNTIL_MINOR_ARTIFACT":
        revealUntilMinorArtifact(state, visit.playerId);
        break;
      case "DRAW_CHOOSE_MINOR_ARTIFACTS":
        openDrawChooseMinorArtifacts(state, visit, step.drawCount, step.keepCount);
        break;
      case "RESOLVE_DRAW_CHOOSE_MINOR": {
        const player = state.players[visit.playerId];
        const deck = state.decks[step.deckId];
        if (player) {
          const keepSet = new Set(step.keepIndexes);
          const returned: CardId[] = [];
          for (let i = 0; i < step.drawn.length; i += 1) {
            const cardId = step.drawn[i]!;
            if (keepSet.has(i)) {
              player.hand.push(cardId);
            } else {
              returned.push(cardId);
            }
          }
          if (deck && returned.length > 0) {
            // Under the draw pile (index 0 = bottom).
            deck.drawPile = [...returned, ...deck.drawPile];
          }
          appendEvent(state, {
            type: "DECK_SEARCH_RESOLVED",
            playerId: visit.playerId,
            deckId: step.deckId,
            choiceId: `polish_minor_keep_${nextEventNumber(state)}`,
            pick: "revealed",
            discardedCardIds: returned
          });
        }
        break;
      }
      case "RESHUFFLE_ARTIFACT_DECKS":
        reshuffleArtifactDecksAfterStartingBonus(state);
        break;
      // Event cards (Fortress expansion): every EVENT_* step plus the shared
      // LOSE_RESOURCES / SPEND_HERO_MOVEMENT leaves resolve in one place.
      case "EVENT_FORTY_PICK":
      case "EVENT_FORTY_RESOLVE":
      case "EVENT_PLAYER_CHOICE":
      case "EVENT_CHANGE_MORALE":
      case "LOSE_RESOURCES":
      case "SPEND_HERO_MOVEMENT":
      case "EVENT_TREASURE_GAMBLE":
      case "EVENT_DISCARD_CHEAPEST_UNIT":
      case "EVENT_REMOVE_FOR_SEARCH":
      case "EVENT_DISCARD_ANY_THEN_DRAW":
      case "EVENT_DISCARD_HAND_CARD":
      case "EVENT_DRAW_TO_LIMIT":
      case "EVENT_SEARCH_FRONT":
      case "EVENT_DRAW_OWN":
      case "EVENT_DISCARD_ALL_DRAW_LIMIT":
      case "EVENT_HERMIT_GAMBLE":
      case "EVENT_HERMIT_PAY_SEARCH":
      case "EVENT_MESSENGER_DRAW":
      case "EVENT_TAKE_CARD":
      case "EVENT_RETURN_CARDS":
      case "EVENT_SPELL_MARKET":
      case "EVENT_TAKE_POOL_CARD":
      case "EVENT_POOL_CLEANUP":
      case "EVENT_FOREST_CONTRIBUTE":
      case "EVENT_POOL_ADD_FROM_HAND":
      case "EVENT_POOL_ADD_DRAWN":
      case "EVENT_FOREST_TAKE":
      case "EVENT_POOL_TAKE_RANDOM":
      case "EVENT_LEPRECHAUN_ROLL":
      case "EVENT_TAKE_POOL_DIE":
      case "EVENT_DEN_OF_THIEVES":
      case "EVENT_DEN_DRAW":
      case "EVENT_NEUTRAL_BUY":
      case "EVENT_DEN_PLACE":
      case "EVENT_RETURN_UNITS":
      case "EVENT_PRISON_OFFER":
      case "EVENT_NEUTRAL_DISCARD_GOLD":
      case "EVENT_MERC_DRAW":
      case "EVENT_MERC_TAKE":
      case "EVENT_MERC_RECRUIT":
      case "EVENT_ARTIFACT_SHOP":
      case "EVENT_AUCTION_OPEN":
      case "EVENT_AUCTION_BID":
      case "EVENT_AUCTION_SET_BID":
      case "EVENT_AUCTION_RESOLVE":
      case "EVENT_MARKET_DEAL":
      case "EVENT_MARKET_DEAL_OPEN":
      case "EVENT_MARKET_DEAL_ANSWER":
      case "EVENT_MARKET_DEAL_ACCEPT":
        applyEventVisitStep(state, visit, step);
        break;
      case "SCHOLAR":
        rollScholar(state, visit);
        break;
      case "ATTACK_DIE_TABLE": {
        // Sea Chest / Jetsam: one Attack die decides which branch resolves.
        const random = adventureRandom(state, "attack-die-field");
        const faces = [-1, -1, 0, 0, 1, 1];
        const roll = faces[random.nextInt(0, faces.length - 1)];
        appendEvent(state, {
          type: "ADVENTURE_DICE_ROLLED",
          playerId: visit.playerId,
          dice: "attack",
          results: [`Attack die: ${roll >= 0 ? "+" : ""}${roll}`],
          attackRolls: [roll]
        });
        const branch = roll > 0 ? step.plus : roll === 0 ? step.zero : step.minus;
        // Positive Morale "Reroll a die.": the holder just threw this Attack
        // die, so the held card may reroll it (re-running this very step)
        // before the branch resolves. Without the card: straight through.
        const rerollCard = moraleRerollCardOption(state, visit.playerId, "the Attack die", step);
        if (!rerollCard) {
          visit.steps.unshift(...branch);
          break;
        }
        visit.steps.unshift({
          type: "CHOOSE_ONE",
          prompt: `Attack die: ${roll >= 0 ? "+" : ""}${roll}. Keep the result, or reroll?`,
          options: [{ label: `Keep the ${roll >= 0 ? "+" : ""}${roll} result`, steps: branch }, rerollCard]
        });
        break;
      }
      case "SUBTERRANEAN_GATE":
        resolveSubterraneanGate(state, visit);
        break;
      case "TOKEN_TELEPORT":
        resolveTokenTeleport(state, visit, step.token);
        break;
      case "ONEWAY_TELEPORT":
        resolveOnewayTeleport(state, visit);
        break;
      case "ONEWAY_RANDOM_EXIT":
        resolveOnewayRandomExit(state, visit, step.pair, step.fromSpaceId);
        break;
      case "GATE_TELEPORT":
        resolveGateTeleport(state, visit);
        break;
      case "TOKEN_TELEPORT_REVEAL":
        resolveTokenTeleportReveal(state, visit, step);
        break;
      case "WHIRLPOOL_PENALTY": {
        // "After each Whirlpool travel, lose 1 unit from your unit Deck." The
        // card says WHICH unit is lost nowhere, so the traveller picks (the
        // friendlier reading, mirroring hand discards being the owner's pick).
        const player = state.players[visit.playerId];
        if (!player || player.army.length === 0) {
          eventNote(state, `${eventPlayerName(state, visit.playerId)} has no unit left for the Whirlpool to claim.`, visit.playerId);
          break;
        }
        if (player.army.length === 1) {
          visit.steps.unshift({ type: "WHIRLPOOL_DISCARD_UNIT", unitId: player.army[0].id });
          break;
        }
        visit.steps.unshift({
          type: "CHOOSE_ONE",
          prompt: "The Whirlpool drags a unit under — lose 1 unit card from your army",
          options: player.army.map((unit) => ({
            label: `Lose ${coreUnitDefinitions[unit.unitDefId]?.name ?? unit.unitDefId} (${unit.side})`,
            steps: [{ type: "WHIRLPOOL_DISCARD_UNIT", unitId: unit.id }]
          }))
        });
        break;
      }
      case "WHIRLPOOL_DISCARD_UNIT": {
        const player = state.players[visit.playerId];
        const unit = player?.army.find((candidate) => candidate.id === step.unitId);
        if (!player || !unit) {
          break;
        }
        player.army = player.army.filter((candidate) => candidate.id !== step.unitId);
        // A Neutral-side card recycles to its tier discard pile, exactly like a
        // combat casualty (the engine convention for lost Neutral cards).
        if (unit.side === "neutral") {
          const tier = (coreUnitDefinitions[unit.unitDefId]?.tier ?? "bronze") as "bronze" | "silver" | "gold" | "azure";
          state.decks[NEUTRAL_DECK_IDS[tier]]?.discardPile.push(unit.unitDefId);
        }
        eventNote(
          state,
          `The Whirlpool claims ${eventPlayerName(state, visit.playerId)}'s ${coreUnitDefinitions[unit.unitDefId]?.name ?? unit.unitDefId}.`,
          visit.playerId
        );
        break;
      }
      case "TELEPORT_HERO": {
        const movedHero = state.heroes[step.heroId];
        if (movedHero && adventure.fields[step.spaceId]) {
          const from = movedHero.spaceId ?? step.spaceId;
          movedHero.spaceId = step.spaceId;
          // Town Portal Power 2/4: arriving grants the hero +1/+2 movement.
          if (step.movementBonus) {
            movedHero.movementPoints += step.movementBonus;
          }
          appendEvent(state, {
            type: "HERO_MOVED",
            playerId: movedHero.controllerId,
            heroId: movedHero.id,
            from,
            to: step.spaceId,
            movementLeft: movedHero.movementPoints
          });
          commitPopulationOnMove(state, movedHero.controllerId);
          // Teleport-network arrival: a designed guard still standing on the
          // destination token/gate is swept aside (auto-win, no experience).
          if (step.sweepGuard) {
            autoWinArrivalGuard(state, movedHero.controllerId, adventure.fields[step.spaceId]);
          }
          if (step.visit) {
            adventure.lastVisitedField[movedHero.id] = step.spaceId;
            beginFieldVisit(state, movedHero.id, step.spaceId, false);
          }
        }
        break;
      }
      case "CREATE_SECONDARY_HERO": {
        // The placement choice resolved: drop the Secondary Hero on the chosen
        // Field. Guard against a duplicate (one already arrived since the offer
        // opened); the gold/visit cost was paid before the choice.
        if (step.fieldId && adventure.fields[step.fieldId] && !getSecondaryHero(state, visit.playerId)) {
          createSecondaryHero(state, visit.playerId, step.fieldId, step.heroDefId);
        }
        break;
      }
      case "TAKE_DISCARD_CARD": {
        const player = state.players[visit.playerId];
        if (player) {
          const index = player.discard.lastIndexOf(step.cardId);
          if (index !== -1) {
            player.discard.splice(index, 1);
            player.hand.push(step.cardId);
          }
          if (step.shuffleRestIntoDeck && player.discard.length > 0) {
            player.deck = shuffleCards(
              [...player.deck, ...player.discard],
              `${state.seed}#discard-into-deck#${visit.playerId}#${eventSeedNumber(state)}`
            );
            player.discard = [];
          }
        }
        break;
      }
      case "CONSUME_EFFECT":
        state.activeEffects = state.activeEffects.filter((candidate) => candidate.id !== step.effectId);
        break;
      case "DRAW_PANDORA_CARD": {
        // Polish Pandora Search: Search(N) choose 1 (N=2 on IV–V, N=3 on VI–VII;
        // with polish-random-artifacts a "+1" die raises N by 1). Off: draw 1.
        if (houseRuleEnabled(state, "polish-pandora-search")) {
          openPolishPandoraSearch(state, visit);
          break;
        }
        const player = state.players[visit.playerId];
        const drawn = adventure.pandoraDeck?.pop();
        if (player && drawn) {
          player.hand.push(drawn);
          appendEvent(state, {
            type: "PANDORA_CARD_DRAWN",
            playerId: visit.playerId,
            cardId: drawn
          });
        }
        break;
      }
      case "RESOLVE_PANDORA_SEARCH": {
        const player = state.players[visit.playerId];
        if (player) {
          const keepSet = new Set(step.keepIndexes);
          const returned: CardId[] = [];
          for (let i = 0; i < step.drawn.length; i += 1) {
            const cardId = step.drawn[i]!;
            if (keepSet.has(i)) {
              player.hand.push(cardId);
              appendEvent(state, {
                type: "PANDORA_CARD_DRAWN",
                playerId: visit.playerId,
                cardId
              });
            } else {
              returned.push(cardId);
            }
          }
          // Unchosen cards go under the Pandora deck (bottom).
          if (returned.length > 0 && adventure.pandoraDeck) {
            adventure.pandoraDeck = [...returned, ...adventure.pandoraDeck];
          }
        }
        // Die was for the Search size only; clear any residual random-artifact latch.
        clearPolishArtifactAccess(state);
        break;
      }
      case "NECROMANCY_FETCH":
        resolveNecromancyFetch(state, visit.playerId);
        break;
      case "DISCARD_PICK": {
        const reward: AdventureReward = {
          playerId: visit.playerId,
          kind: "discard-pick",
          count: step.count,
          filter: step.filter
        };
        queueVisitFollowUpReward(state, adventure, reward);
        break;
      }
      case "MANA_VORTEX_RESOLVE":
        resolveManaVortex(state, visit.playerId, step.discardCardId);
        break;
      case "PORTAL_SUMMON": {
        const drawn = drawFromNeutralDeck(state, step.tier);
        if (!drawn) {
          break;
        }
        const def = coreUnitDefinitions[drawn];
        const cost = def?.neutral?.cost ?? {};
        const costLabel =
          Object.entries(cost)
            .filter(([, amount]) => amount)
            .map(([resource, amount]) => `${amount} ${resource}`)
            .join(" + ") || "free";
        const affordable = hasRecruitResources(state, visit.playerId, cost);
        visit.steps.unshift({
          type: "CHOOSE_ONE",
          prompt: `Portal of Summoning: drew ${def?.name ?? drawn} (${costLabel})`,
          options: [
            ...(affordable
              ? [{ label: `Recruit for ${costLabel}`, steps: [{ type: "PORTAL_RECRUIT", unitDefId: drawn } as VisitStep] }]
              : []),
            { label: "Decline (discard the card)", steps: [{ type: "PORTAL_DECLINE", unitDefId: drawn } as VisitStep] }
          ]
        });
        break;
      }
      case "PORTAL_RECRUIT": {
        const player = state.players[visit.playerId];
        const def = coreUnitDefinitions[step.unitDefId];
        const cost = def?.neutral?.cost ?? {};
        if (!player || !def?.neutral || !hasRecruitResources(state, visit.playerId, cost)) {
          // Cannot pay after all: the card goes to its tier discard pile.
          state.decks[NEUTRAL_DECK_IDS[(def?.tier ?? "bronze") as "bronze" | "silver" | "gold" | "azure"]]?.discardPile.push(
            step.unitDefId
          );
          break;
        }
        spendRecruitResources(state, visit.playerId, cost, `recruited ${def.name} at the Portal of Summoning`);
        addArmyUnit(player, step.unitDefId, "neutral");
        appendEvent(state, {
          type: "UNIT_RECRUITED",
          playerId: visit.playerId,
          unitDefId: step.unitDefId,
          kind: "recruit",
          cost
        });
        break;
      }
      case "PORTAL_DECLINE": {
        const def = coreUnitDefinitions[step.unitDefId];
        state.decks[NEUTRAL_DECK_IDS[(def?.tier ?? "bronze") as "bronze" | "silver" | "gold" | "azure"]]?.discardPile.push(
          step.unitDefId
        );
        break;
      }
      case "DIG_ARTIFACT": {
        // The Factory "shovel": draw the top Artifact card the visitor can take
        // (across the split minor/major/relic decks in BINH mode, else the single
        // "artifacts" deck), then let them keep it or discard it.
        // Polish Random Artifacts: roll first and only dig from allowed tiers.
        const digHero = state.heroes[visit.heroId] ?? getMainHero(state, visit.playerId);
        maybeApplyPolishRandomArtifactRoll(state, visit.playerId, digHero, "tile");
        const deckIds = (state.decks["artifacts"]
          ? ["artifacts"]
          : ["artifacts-minor", "artifacts-major", "artifacts-relic"]
        ).filter((deckId) => polishArtifactDeckAllowed(state, deckId));
        let dug: string | null = null;
        let dugDeckId = deckIds[0] ?? "artifacts";
        for (const deckId of deckIds) {
          dug = drawTopOfSharedDeck(state, deckId, visit.playerId);
          if (dug) {
            dugDeckId = deckId;
            break;
          }
        }
        if (!dug) {
          clearPolishArtifactAccess(state);
          break;
        }
        const name = cardLibrary[dug]?.name ?? dug;
        visit.steps.unshift({
          type: "CHOOSE_ONE",
          prompt: `You dug up ${name} — keep it or discard it?`,
          options: [
            { label: `Keep ${name}`, steps: [{ type: "DIG_ARTIFACT_KEEP", cardId: dug }] },
            { label: "Discard it", steps: [{ type: "DIG_ARTIFACT_DISCARD", cardId: dug, deckId: dugDeckId }] }
          ]
        });
        break;
      }
      case "DIG_ARTIFACT_KEEP": {
        const player = state.players[visit.playerId];
        if (player) {
          player.hand.push(step.cardId);
          appendEvent(state, { type: "ARTIFACT_DUG", playerId: visit.playerId, cardId: step.cardId, kept: true });
        }
        clearPolishArtifactAccess(state);
        break;
      }
      case "DIG_ARTIFACT_DISCARD": {
        state.decks[step.deckId]?.discardPile.push(step.cardId);
        appendEvent(state, { type: "ARTIFACT_DUG", playerId: visit.playerId, cardId: step.cardId, kept: false });
        clearPolishArtifactAccess(state);
        break;
      }
      case "GRANT_MOVE_THROUGH": {
        // Airship Yard: Fly-style pass over blocked fields for the rest of this
        // turn (never stop on a blocked hex). Same flag Fly / Angel Wings set.
        state.activeEffects.push(
          makeActiveEffect(
            state,
            {
              name: "Airship Yard",
              scope: "player",
              duration: { type: "current-turn" },
              polarity: "positive",
              removable: false,
              modifiers: [{ type: "HERO_MOVE_THROUGH" }]
            },
            { type: "system" },
            visit.playerId
          )
        );
        break;
      }
      case "WATERING_HOLE": {
        // Factory rulebook: end movement now; next turn this hero gains +1 MP.
        const holeHero = state.heroes[visit.heroId];
        if (holeHero) {
          holeHero.movementPoints = 0;
          holeHero.wateringHoleBonusPending = true;
        }
        break;
      }
      case "NEUTRAL_RECRUIT_RESOLVE": {
        const player = state.players[visit.playerId];
        // Recruit the chosen unit at half cost (rounded up) when still affordable;
        // a copy that can no longer be paid for just returns with the rest.
        let recruited: string | null = null;
        if (player && step.recruit) {
          const def = coreUnitDefinitions[step.recruit];
          const half = halfRecruitCostRoundedUp(def?.neutral?.cost ?? {});
          if (def?.neutral && hasRecruitResources(state, visit.playerId, half)) {
            spendRecruitResources(state, visit.playerId, half, `recruited ${def.name} from Pandora's Gift: Recruits`);
            addArmyUnit(player, step.recruit, "neutral");
            appendEvent(state, {
              type: "UNIT_RECRUITED",
              playerId: visit.playerId,
              unitDefId: step.recruit,
              kind: "recruit",
              cost: half
            });
            recruited = step.recruit;
          }
        }
        // Every drawn unit not recruited goes back to its tier's discard pile.
        // Only ONE copy of the recruited id is consumed (duplicates still return).
        let skipped = false;
        for (const unitDefId of step.drawn) {
          if (!skipped && unitDefId === recruited) {
            skipped = true;
            continue;
          }
          const def = coreUnitDefinitions[unitDefId];
          state.decks[
            NEUTRAL_DECK_IDS[(def?.tier ?? "bronze") as "bronze" | "silver" | "gold" | "azure"]
          ]?.discardPile.push(unitDefId);
        }
        break;
      }
      case "REINFORCE_HALF_GOLD": {
        const upgraded = reinforceArmyUnit(state, visit.playerId, step.armyUnitId, false, true, step.roundDown ?? false);
        // Necromancy is spent ONLY on a successful upgrade. The card was held in
        // hand through the play (the discard was deferred); discard it now that a
        // unit was actually reinforced. A failed/declined reinforce leaves it.
        // The CARD_PLAYED event is emitted here, at the real hand→discard move,
        // so the flight animation and log line fire exactly once and only when
        // the card is actually consumed.
        if (upgraded && step.consumeCardId) {
          const reinforcer = state.players[visit.playerId];
          const handIndex = reinforcer?.hand.indexOf(step.consumeCardId) ?? -1;
          if (reinforcer && handIndex !== -1) {
            reinforcer.hand.splice(handIndex, 1);
            reinforcer.discard.push(step.consumeCardId);
            appendEvent(state, {
              type: "CARD_PLAYED",
              playerId: visit.playerId,
              cardId: step.consumeCardId,
              timing: cardLibrary[step.consumeCardId]?.timing ?? "instant",
              mode: "basic"
            });
          }
        }
        break;
      }
      case "REINFORCE_FLAT_GOLD":
        // Cove Pub: flat gold discount on one reinforcement (no halving).
        reinforceArmyUnit(state, visit.playerId, step.armyUnitId, false, false, false, false, step.discount);
        break;
      case "BUY_UNIT_STACK": {
        // Polish Unit Stacks building/skill offers (Necro City Hall, Saplings,
        // Necromancy, Garden of Life, Cove Pub): add ONE Stack layer at the
        // offer's pre-priced cost. Self-guards so a stale pick (unit gone / at
        // cap / rule off / unaffordable) is a clean no-op that keeps any
        // consumeCardId card in hand.
        const player = state.players[visit.playerId];
        const unit = player?.army.find((candidate) => candidate.id === step.armyUnitId);
        if (
          !player ||
          !unit ||
          !houseRuleEnabled(state, "polish-unit-stacks") ||
          !polishArmyUnitCanBuyStack(unit) ||
          !hasRecruitResources(state, visit.playerId, step.cost)
        ) {
          break;
        }
        if (Object.values(step.cost).some((amount) => (amount ?? 0) > 0)) {
          // The recruit pay path: the Freelancer's Guild may substitute
          // materials/valuables for missing gold, exactly like a recruit.
          spendRecruitResources(state, visit.playerId, step.cost, `${step.source} (Unit Stack)`);
        }
        unit.stacks = (unit.stacks ?? 0) + 1;
        appendEvent(state, {
          type: "ARMY_STACK_PURCHASED",
          playerId: visit.playerId,
          armyUnitId: unit.id,
          unitDefId: unit.unitDefId,
          stacks: unit.stacks,
          cost: step.cost
        });
        // Necromancy: the played card is spent ONLY when a Stack was really
        // added (mirrors the REINFORCE_HALF_GOLD consume semantics).
        if (step.consumeCardId) {
          const handIndex = player.hand.indexOf(step.consumeCardId);
          if (handIndex !== -1) {
            player.hand.splice(handIndex, 1);
            player.discard.push(step.consumeCardId);
            appendEvent(state, {
              type: "CARD_PLAYED",
              playerId: visit.playerId,
              cardId: step.consumeCardId,
              timing: cardLibrary[step.consumeCardId]?.timing ?? "instant",
              mode: "basic"
            });
          }
        }
        break;
      }
      case "LIBRARY_SWAP": {
        const player = state.players[visit.playerId];
        if (!player || step.remaining <= 0 || !hasResources(player, { gold: 3 })) {
          break;
        }
        const options: { label: string; steps: VisitStep[] }[] = [];
        const addSource = (cardId: CardId, source: "hand" | "discard") => {
          if (cardLibrary[cardId]?.kind === "statistic") {
            options.push({
              label: `Pay 3 gold: remove ${cardLibrary[cardId]?.name ?? cardId} (${source})`,
              steps: [{ type: "LIBRARY_REMOVE", cardId, source, remaining: step.remaining }]
            });
          }
        };
        player.hand.forEach((cardId) => addSource(cardId, "hand"));
        player.discard.forEach((cardId) => addSource(cardId, "discard"));
        if (options.length === 0) {
          break;
        }
        options.push({ label: "Done", steps: [] });
        visit.steps.unshift({
          type: "CHOOSE_ONE",
          prompt: `Library of Enlightenment (${step.remaining} swap${step.remaining > 1 ? "s" : ""} left)`,
          options
        });
        break;
      }
      case "LIBRARY_REMOVE": {
        const player = state.players[visit.playerId];
        const list = step.source === "hand" ? player?.hand : player?.discard;
        const index = list?.indexOf(step.cardId) ?? -1;
        if (!player || !list || index === -1 || !hasResources(player, { gold: 3 })) {
          break;
        }
        spendResources(state, visit.playerId, { gold: 3 }, "Library of Enlightenment");
        list.splice(index, 1);
        player.removed.push(step.cardId);
        visit.steps.unshift({
          type: "CHOOSE_ONE",
          prompt: "Library of Enlightenment: gain which Statistic?",
          options: (["attack", "defense", "power", "knowledge"] as const).map((statisticType) => ({
            label: `Gain ${statisticType}`,
            steps: [{ type: "LIBRARY_GAIN", statisticType, remaining: step.remaining }]
          }))
        });
        break;
      }
      case "LIBRARY_GAIN": {
        state.players[visit.playerId]?.hand.push(`stat.${step.statisticType}`);
        if (step.remaining - 1 > 0) {
          visit.steps.unshift({ type: "LIBRARY_SWAP", remaining: step.remaining - 1 });
        }
        break;
      }
      case "STAR_AXIS_SWAP": {
        const player = state.players[visit.playerId];
        if (!player) {
          break;
        }
        const options = player.hand
          .filter(
            (cardId) =>
              cardLibrary[cardId]?.kind === "statistic" &&
              Boolean(cardLibrary[cardId]?.statisticType) &&
              !cardId.endsWith(".empowered")
          )
          .map((cardId) => ({
            label: `Empower ${cardLibrary[cardId]?.name ?? cardId}`,
            steps: [{ type: "STAR_AXIS_GIVE", cardId } as VisitStep]
          }));
        if (options.length === 0) {
          break;
        }
        options.push({ label: "Decline", steps: [] });
        visit.steps.unshift({ type: "CHOOSE_ONE", prompt: "Star Axis: empower a Statistic card", options });
        break;
      }
      case "STAR_AXIS_GIVE": {
        const player = state.players[visit.playerId];
        const stat = cardLibrary[step.cardId]?.statisticType;
        const index = player?.hand.indexOf(step.cardId) ?? -1;
        if (!player || !stat || index === -1) {
          break;
        }
        player.hand.splice(index, 1);
        player.removed.push(step.cardId);
        player.hand.push(`stat.${stat}.empowered`);
        break;
      }
      case "SCHOLAR_EMPOWER_PICK": {
        // Scholar (expert): offer one swap of a non-empowered Statistic card
        // (hand or discard) for its Empowered version, dropped on top of the
        // discard pile. Only types not yet taken this play are offered (so the
        // gained Empowered cards are all different); duplicate (source, type)
        // candidates collapse to one option.
        const player = state.players[visit.playerId];
        if (!player || step.remaining <= 0) {
          break;
        }
        const seen = new Set<string>();
        const options: { label: string; steps: VisitStep[] }[] = [];
        for (const source of ["hand", "discard"] as const) {
          for (const cardId of player[source]) {
            const card = cardLibrary[cardId];
            const stat = card?.statisticType;
            if (
              card?.kind !== "statistic" ||
              !stat ||
              cardId.endsWith(".empowered") ||
              step.takenTypes.includes(stat) ||
              seen.has(`${source}:${stat}`)
            ) {
              continue;
            }
            seen.add(`${source}:${stat}`);
            options.push({
              label: `Empower ${card.name ?? cardId} (from ${source})`,
              steps: [
                { type: "SCHOLAR_EMPOWER_GIVE", source, cardId } as VisitStep,
                ...(step.remaining - 1 > 0
                  ? [
                      {
                        type: "SCHOLAR_EMPOWER_PICK",
                        remaining: step.remaining - 1,
                        takenTypes: [...step.takenTypes, stat]
                      } as VisitStep
                    ]
                  : [])
              ]
            });
          }
        }
        if (options.length === 0) {
          break;
        }
        options.push({ label: "Done", steps: [] });
        visit.steps.unshift({
          type: "CHOOSE_ONE",
          prompt: "Empower a Statistic card (Scholar expert)",
          options
        });
        break;
      }
      case "SCHOLAR_EMPOWER_GIVE": {
        const player = state.players[visit.playerId];
        const pile = step.source === "hand" ? player?.hand : player?.discard;
        const stat = cardLibrary[step.cardId]?.statisticType;
        const index = pile?.indexOf(step.cardId) ?? -1;
        if (!player || !pile || !stat || index === -1) {
          break;
        }
        pile.splice(index, 1);
        player.removed.push(step.cardId);
        // The Empowered version goes on top of the discard pile (push = top).
        player.discard.push(`stat.${stat}.empowered`);
        break;
      }
      case "REMOVE_ONE_FROM_HAND_OR_DISCARD": {
        // Spellbinder's Hat (option B): open a menu of every hand and discard
        // card; the picked one is removed via a REMOVE_CARD_FROM_PILE leaf.
        const player = state.players[visit.playerId];
        if (!player) {
          break;
        }
        const seen = new Set<string>();
        const options: { label: string; steps: VisitStep[] }[] = [];
        const addSource = (cardId: CardId, source: "hand" | "discard") => {
          const key = `${source}:${cardId}`;
          if (seen.has(key)) {
            return;
          }
          seen.add(key);
          options.push({
            label: `Remove ${cardLibrary[cardId]?.name ?? cardId} (${source})`,
            steps: [{ type: "REMOVE_CARD_FROM_PILE", cardId, source } as VisitStep]
          });
        };
        player.hand.forEach((cardId) => addSource(cardId, "hand"));
        player.discard.forEach((cardId) => addSource(cardId, "discard"));
        if (options.length === 0) {
          break;
        }
        visit.steps.unshift({ type: "CHOOSE_ONE", prompt: step.prompt, options });
        break;
      }
      case "REMOVE_CARD_FROM_PILE": {
        const player = state.players[visit.playerId];
        const pile = step.source === "hand" ? player?.hand : player?.discard;
        const index = pile?.indexOf(step.cardId) ?? -1;
        if (!player || !pile || index === -1) {
          break;
        }
        pile.splice(index, 1);
        player.removed.push(step.cardId);
        break;
      }
      case "STAT_EMPOWER_OFFER": {
        // Astrologers Dancing Imp / Hero: rebuild the empower menu from the live
        // hand/discard each time (a chained Hero swap must see the post-swap
        // piles and remaining gold). Stops offering once the player cannot pay.
        const player = state.players[visit.playerId];
        const cost = step.costGold ?? 0;
        if (!player || step.remaining <= 0 || (cost > 0 && !hasResources(player, { gold: cost }))) {
          break;
        }
        // Hero is the only paid Stat empower that uses this shared step, and its
        // printed source is hand-only. Clamp here too so older saved prompts or
        // stale clients cannot keep offering paid discard-pile swaps.
        const sources: ("hand" | "discard")[] = cost > 0 ? ["hand"] : step.sources;
        const seen = new Set<string>();
        const options: { label: string; steps: VisitStep[] }[] = [];
        for (const source of sources) {
          for (const cardId of player[source]) {
            const card = cardLibrary[cardId];
            const stat = card?.statisticType;
            if (
              card?.kind !== "statistic" ||
              !stat ||
              cardId.endsWith(".empowered") ||
              seen.has(`${source}:${stat}`)
            ) {
              continue;
            }
            seen.add(`${source}:${stat}`);
            const empowerLeaf: VisitStep = { type: "EMPOWER_STATISTIC", cardId, source };
            if (cost > 0) {
              empowerLeaf.costGold = cost;
            }
            const next: VisitStep[] = [empowerLeaf];
            if (step.remaining - 1 > 0) {
              next.push({ ...step, sources, remaining: step.remaining - 1 });
            }
            options.push({
              label: `${cost > 0 ? `Pay ${cost} gold: ` : ""}Empower ${card.name ?? cardId} (${source})`,
              steps: next
            });
          }
        }
        if (options.length === 0) {
          break;
        }
        options.push({ label: "Done", steps: [] });
        visit.steps.unshift({ type: "CHOOSE_ONE", prompt: step.prompt, options });
        break;
      }
      case "EMPOWER_STATISTIC": {
        const player = state.players[visit.playerId];
        const pile = step.source === "hand" ? player?.hand : player?.discard;
        const stat = cardLibrary[step.cardId]?.statisticType;
        const index = pile?.indexOf(step.cardId) ?? -1;
        const cost = step.costGold ?? 0;
        if (
          !player ||
          !pile ||
          !stat ||
          index === -1 ||
          (cost > 0 && (step.source !== "hand" || !hasResources(player, { gold: cost })))
        ) {
          break;
        }
        if (cost > 0) {
          spendResources(state, visit.playerId, { gold: cost }, "empower a Statistic card");
        }
        pile.splice(index, 1);
        player.removed.push(step.cardId);
        // "Gain"/"replace with" an Empowered Statistic → into hand (as Star Axis).
        player.hand.push(`stat.${stat}.empowered`);
        break;
      }
      case "REMOVE_UP_TO": {
        // Plane Between Planes: rebuild the removal menu each time so a second
        // removal never offers the card the first one already took. Optional —
        // a Done exit lets the player stop early or remove nothing.
        const player = state.players[visit.playerId];
        if (!player || step.remaining <= 0) {
          break;
        }
        const seen = new Set<string>();
        const options: { label: string; steps: VisitStep[] }[] = [];
        const addSource = (cardId: CardId, source: "hand" | "discard") => {
          const key = `${source}:${cardId}`;
          if (seen.has(key)) {
            return;
          }
          seen.add(key);
          const steps: VisitStep[] = [{ type: "REMOVE_CARD_FROM_PILE", cardId, source }];
          if (step.remaining - 1 > 0) {
            steps.push({ type: "REMOVE_UP_TO", remaining: step.remaining - 1 });
          }
          options.push({ label: `Remove ${cardLibrary[cardId]?.name ?? cardId} (${source})`, steps });
        };
        player.hand.forEach((cardId) => addSource(cardId, "hand"));
        player.discard.forEach((cardId) => addSource(cardId, "discard"));
        if (options.length === 0) {
          break;
        }
        options.push({ label: "Done", steps: [] });
        visit.steps.unshift({
          type: "CHOOSE_ONE",
          prompt: `Plane Between Planes: Remove up to ${step.remaining} card(s) from your hand or discard pile`,
          options
        });
        break;
      }
      case "REMOVE_THEN_SEARCH_REPEAT": {
        // Pyramid (Creature Bank) per-Stack extra: rebuild the menu each time so
        // a later removal never re-offers a card an earlier one already took.
        // Each pick removes one Spell/Ability/Artifact from hand or discard pile
        // (out of the game) and Searches(searchCount) the matching deck. Optional
        // — a Done exit lets the player stop early or remove nothing.
        const player = state.players[visit.playerId];
        if (!player || step.remaining <= 0) {
          break;
        }
        const startingAbility = player.heroDefId
          ? coreHeroDefinitions[player.heroDefId]?.startingAbilityCardId
          : undefined;
        const deckForKind = (cardId: CardId): "spells" | "artifacts" | "abilities" | undefined => {
          const kind = cardLibrary[cardId]?.kind;
          if (kind === "spell") return "spells";
          if (kind === "artifact") return "artifacts";
          if (kind === "ability") return "abilities";
          return undefined;
        };
        const seen = new Set<string>();
        const options: { label: string; steps: VisitStep[] }[] = [];
        const addSource = (cardId: CardId, source: "hand" | "discard") => {
          const deckId = deckForKind(cardId);
          // Only Spell/Ability/Artifact cards (the searchable decks) qualify, and
          // never the hero's Starting Ability — matching the "removable" rule used
          // by the Faerie Ring / Market of Time removals.
          if (!deckId || cardId === startingAbility) {
            return;
          }
          const key = `${source}:${cardId}`;
          if (seen.has(key)) {
            return;
          }
          seen.add(key);
          const steps: VisitStep[] = [
            { type: "REMOVE_CARD_FROM_PILE", cardId, source },
            { type: "SEARCH_SHARED_DECK", deckId, count: step.searchCount }
          ];
          if (step.remaining - 1 > 0) {
            steps.push({ type: "REMOVE_THEN_SEARCH_REPEAT", remaining: step.remaining - 1, searchCount: step.searchCount });
          }
          options.push({
            label: `Remove ${cardLibrary[cardId]?.name ?? cardId} (${source}), Search (${step.searchCount}) the ${deckId} deck`,
            steps
          });
        };
        player.hand.forEach((cardId) => addSource(cardId, "hand"));
        player.discard.forEach((cardId) => addSource(cardId, "discard"));
        if (options.length === 0) {
          break;
        }
        options.push({ label: "Done", steps: [] });
        visit.steps.unshift({
          type: "CHOOSE_ONE",
          prompt: `Pyramid: remove a card and Search (${step.searchCount}) its deck (up to ${step.remaining} more)`,
          options
        });
        break;
      }
      case "PANDORA_PAY_FOR_DICE": {
        // Pandora's Box (card 177): "First pay 3 gold, 2 building materials, or 1
        // valuables up to six times in any combination. THEN for each payment made,
        // roll and resolve 1 Resource die." Payments are committed FIRST — the die
        // rolls are DEFERRED to the end (so a die's winnings can never fund another
        // payment). Rebuild the menu each time offering only affordable payments;
        // a Stop exit, no affordable payment, or reaching six ends the pay phase
        // and rolls `paid` Resource dice.
        const player = state.players[visit.playerId];
        const paid = step.paid ?? 0;
        const rollSteps: VisitStep[] = Array.from({ length: paid }, () => ({ type: "ROLL_RESOURCE_DICE", count: 1 }));
        if (!player || step.remaining <= 0) {
          visit.steps.unshift(...rollSteps);
          break;
        }
        const payments: { cost: ResourceCost; label: string }[] = [
          { cost: { gold: 3 }, label: "Pay 3 gold" },
          { cost: { buildingMaterials: 2 }, label: "Pay 2 building materials" },
          { cost: { valuables: 1 }, label: "Pay 1 valuables" }
        ];
        const options: { label: string; steps: VisitStep[] }[] = [];
        for (const { cost, label } of payments) {
          const canPay = (Object.entries(cost) as [ResourceKind, number][]).every(
            ([resource, amount]) => (player.resources[resource] ?? 0) >= amount
          );
          if (!canPay) {
            continue;
          }
          options.push({
            label,
            steps: [
              { type: "LOSE_RESOURCES", ...cost, reason: "Pandora's Box: pay for a Resource die" } as VisitStep,
              { type: "PANDORA_PAY_FOR_DICE", remaining: step.remaining - 1, paid: paid + 1 }
            ]
          });
        }
        if (options.length === 0) {
          // Cannot afford another payment — roll the dice earned so far.
          visit.steps.unshift(...rollSteps);
          break;
        }
        options.push({
          label: paid > 0 ? `Stop — roll ${paid} Resource ${paid === 1 ? "die" : "dice"}` : "Stop (roll nothing)",
          steps: rollSteps
        });
        visit.steps.unshift({
          type: "CHOOSE_ONE",
          prompt: `Pandora's Box: pay for a Resource die (${paid} paid, up to ${step.remaining} more)`,
          options
        });
        break;
      }
      case "PANDORA_TREASURE_GAMBLE_SEARCH": {
        // Pandora's Box (cards 179/180/181, option B): roll `diceCount` Treasure
        // dice purely to test for the artifact-search (ankh) face — the faces are
        // NOT otherwise resolved. If at least one ankh shows, queue a Search of the
        // named deck family. Honours the Negative Morale "roll one less" card on a
        // 2+-dice roll, mirroring the Crypt gamble; no Luck reroll (gamble rolls
        // are not rerollable, matching the treasure-gamble convention).
        let diceCount = step.diceCount;
        if (diceCount >= 2 && consumeHeldMoraleCard(state, visit.playerId, MORALE_CARD_IDS.rollOneLess)) {
          diceCount -= 1;
        }
        const random = adventureRandom(state, "pandora-treasure-gamble");
        const rolls = Array.from(
          { length: diceCount },
          () => TREASURE_DIE_FACES[random.nextInt(0, TREASURE_DIE_FACES.length - 1)]
        );
        appendEvent(state, {
          type: "ADVENTURE_DICE_ROLLED",
          playerId: visit.playerId,
          dice: "treasure",
          results: rolls.map(treasureFaceLabel),
          treasureRolls: [...rolls]
        });
        if (rolls.includes("artifact-search")) {
          queueVisitFollowUpReward(state, adventure, {
            playerId: visit.playerId,
            kind: "shared-deck-search",
            deckId: step.deck,
            count: step.searchCount
          });
        }
        break;
      }
      case "EMPOWER_ABILITY": {
        // Dragon Fly Hive / Griffin Conservatory bonus (house rule
        // "bank-empower-ability"): offer to Empower one of the player's own
        // Ability cards (hand or discard) that is not already Empowered.
        // Empowering is by card id, so a card owned in either pile qualifies
        // once. No-op when the player owns no eligible ability — or when the
        // house rule is off (those banks then grant only the unit, as printed).
        if (!houseRuleEnabled(state, "bank-empower-ability")) {
          break;
        }
        const player = state.players[visit.playerId];
        if (!player) {
          break;
        }
        const seen = new Set<CardId>();
        const options: { label: string; steps: VisitStep[] }[] = [];
        for (const cardId of [...player.hand, ...player.discard]) {
          if (seen.has(cardId) || cardLibrary[cardId]?.kind !== "ability") {
            continue;
          }
          if (player.empoweredAbilities?.includes(cardId)) {
            continue;
          }
          seen.add(cardId);
          options.push({
            label: `Empower ${cardLibrary[cardId]?.name ?? cardId} (use basic or expert with no crown)`,
            steps: [{ type: "MARK_ABILITY_EMPOWERED", cardId }]
          });
        }
        if (options.length === 0) {
          break;
        }
        options.push({ label: "Skip empowering an ability", steps: [] });
        visit.steps.unshift({
          type: "CHOOSE_ONE",
          prompt: "Empower one ability you own — its Expert side then costs no crown",
          options
        });
        break;
      }
      case "MARK_ABILITY_EMPOWERED": {
        const player = state.players[visit.playerId];
        if (!player) {
          break;
        }
        if (!player.empoweredAbilities) {
          player.empoweredAbilities = [];
        }
        if (!player.empoweredAbilities.includes(step.cardId)) {
          player.empoweredAbilities.push(step.cardId);
          appendEvent(state, {
            type: "ABILITY_EMPOWERED",
            playerId: visit.playerId,
            cardId: step.cardId
          });
        }
        break;
      }
      case "WAR_MACHINE_GRANT_OFFER": {
        // McGiver: take one War Machine free. Per-player catalog — offer only the
        // machines THIS player does not already own (buying never depletes it for
        // others). Optional — a Skip exit lets a player decline.
        const supply = (adventure.warMachineSupply ?? []).filter(
          (cardId) => !playerOwnsWarMachine(state, visit.playerId, cardId)
        );
        if (supply.length === 0) {
          break;
        }
        const options: { label: string; steps: VisitStep[] }[] = supply.map((cardId) => ({
          label: `Take ${cardLibrary[cardId]?.name ?? cardId} (free)`,
          steps: [{ type: "GRANT_WAR_MACHINE", cardId }]
        }));
        options.push({ label: "Skip", steps: [] });
        visit.steps.unshift({
          type: "CHOOSE_ONE",
          prompt: "McGiver: take one War Machine from the supply for free",
          options
        });
        break;
      }
      case "WAR_MACHINE_DISCOUNT_OFFER": {
        // Wandering Merchant: buy one War Machine at a discount. Per-player
        // catalog — a machine another player already bought is STILL available to
        // this one (the reported "1 player buys the Tent, nobody else can" bug);
        // only a machine THIS player already owns drops out. Price at the
        // Trading-Post rate minus the discount (floored at 0), affordable only.
        const player = state.players[visit.playerId];
        const supply = (adventure.warMachineSupply ?? []).filter(
          (cardId) => !playerOwnsWarMachine(state, visit.playerId, cardId)
        );
        if (!player || supply.length === 0) {
          break;
        }
        const options: { label: string; steps: VisitStep[] }[] = [];
        for (const cardId of supply) {
          const card = cardLibrary[cardId];
          const base = card?.warMachineCosts?.tradingPost;
          if (!card || !base) {
            continue;
          }
          const discounted: ResourceCost = { ...base, gold: Math.max(0, (base.gold ?? 0) - step.discountGold) };
          if (!hasResources(player, discounted)) {
            continue;
          }
          options.push({
            label: `Buy ${card.name} (${discounted.gold ?? 0} gold)`,
            steps: [{ type: "GRANT_WAR_MACHINE", cardId, cost: discounted }]
          });
        }
        if (options.length === 0) {
          break;
        }
        options.push({ label: "Skip", steps: [] });
        visit.steps.unshift({
          type: "CHOOSE_ONE",
          prompt: `Wandering Merchant: buy one War Machine at ${step.discountGold} gold off`,
          options
        });
        break;
      }
      case "GRANT_WAR_MACHINE": {
        // War-machine leaf: move the chosen machine from the catalog to hand (the
        // player plays it as a permanent later, like any purchase). A free grant
        // (McGiver) carries no cost; a Wandering Merchant buy carries the
        // discounted Trading-Post cost, spent here. The catalog is NOT depleted —
        // each player buys each machine once (guarded by ownership), so one
        // buyer never removes a machine from the rest of the table.
        const player = state.players[visit.playerId];
        const supply = adventure.warMachineSupply ?? [];
        if (!player || !supply.includes(step.cardId) || playerOwnsWarMachine(state, visit.playerId, step.cardId)) {
          break;
        }
        if (step.cost) {
          if (!hasResources(player, step.cost)) {
            break;
          }
          spendResources(state, visit.playerId, step.cost, `bought the ${cardLibrary[step.cardId]?.name ?? step.cardId}`);
        }
        player.hand.push(step.cardId);
        appendEvent(state, {
          type: "WAR_MACHINE_BOUGHT",
          playerId: visit.playerId,
          cardId: step.cardId,
          cost: step.cost ?? {},
          at: step.cost ? "trading-post" : "factory"
        });
        break;
      }
      case "NEUTRAL_RECRUIT_OFFER": {
        // Charlie / Unexpected Reinforcements: draw one Neutral Unit per Dwelling
        // tier the player controls (fixed order, capped at maxDraws), then offer
        // to recruit one. Drawn cards leave their decks now; the recruit leaf
        // returns the unchosen ones to their discards.
        const player = state.players[visit.playerId];
        if (!player) {
          break;
        }
        // Bronze/silver/gold only — no Dwelling unlocks Azure, so it is never a
        // recruit tier here (the engine-level guarantee behind the printed
        // "Azure units cannot be recruited" on Unexpected Reinforcements).
        const tierOrder: ("bronze" | "silver" | "gold" | "azure")[] = ["bronze", "silver", "gold", "azure"];
        const unlocked = unlockedRecruitTiers(state, visit.playerId);
        const drawn: { unitDefId: string; tier: "bronze" | "silver" | "gold" | "azure" }[] = [];
        for (const tier of tierOrder) {
          if (drawn.length >= step.maxDraws) {
            break;
          }
          if (!unlocked.has(tier)) {
            continue;
          }
          const unitDefId = drawFromNeutralDeck(state, tier);
          if (unitDefId) {
            drawn.push({ unitDefId, tier });
          }
        }
        if (drawn.length === 0) {
          break;
        }
        const recruitable = drawn.filter((draw) =>
          hasRecruitResources(state, visit.playerId, coreUnitDefinitions[draw.unitDefId]?.neutral?.cost ?? {})
        );
        if (recruitable.length === 0) {
          // Nothing affordable: every drawn card returns to its tier's discard.
          for (const draw of drawn) {
            state.decks[NEUTRAL_DECK_IDS[draw.tier]]?.discardPile.push(draw.unitDefId);
          }
          break;
        }
        const options: { label: string; steps: VisitStep[] }[] = recruitable.map((draw) => {
          const def = coreUnitDefinitions[draw.unitDefId];
          const cost = def?.neutral?.cost ?? {};
          const costLabel =
            Object.entries(cost)
              .map(([resource, amount]) => `${amount} ${resource}`)
              .join(" + ") || "free";
          return {
            label: `Recruit ${def?.name ?? draw.unitDefId} (${costLabel})`,
            steps: [{ type: "RECRUIT_DRAWN_NEUTRAL", recruit: draw, drawn }]
          };
        });
        options.push({ label: "Recruit none", steps: [{ type: "RECRUIT_DRAWN_NEUTRAL", recruit: null, drawn }] });
        visit.steps.unshift({
          type: "CHOOSE_ONE",
          prompt: "Charlie and his Circus: recruit one drawn Neutral Unit",
          options
        });
        break;
      }
      case "RECRUIT_DRAWN_NEUTRAL": {
        const player = state.players[visit.playerId];
        if (!player) {
          break;
        }
        let recruitedDefId: string | undefined;
        let recruitedTier: string | undefined;
        if (step.recruit) {
          const def = coreUnitDefinitions[step.recruit.unitDefId];
          const cost = def?.neutral?.cost ?? {};
          if (def?.neutral && hasRecruitResources(state, visit.playerId, cost)) {
            spendRecruitResources(state, visit.playerId, cost, `recruited ${def.name}`);
            addArmyUnit(player, step.recruit.unitDefId, "neutral");
            appendEvent(state, {
              type: "UNIT_RECRUITED",
              playerId: visit.playerId,
              unitDefId: step.recruit.unitDefId,
              kind: "recruit",
              cost
            });
            recruitedDefId = step.recruit.unitDefId;
            recruitedTier = step.recruit.tier;
          }
        }
        // Return every drawn card except the one recruited (a single copy) to its
        // tier's discard pile, so the deck can reshuffle it later.
        let consumed = false;
        for (const draw of step.drawn) {
          if (!consumed && draw.unitDefId === recruitedDefId && draw.tier === recruitedTier) {
            consumed = true;
            continue;
          }
          state.decks[NEUTRAL_DECK_IDS[draw.tier]]?.discardPile.push(draw.unitDefId);
        }
        break;
      }
      case "FACTION_RECRUIT_OFFER": {
        // Unexpected Reinforcements: search the Neutral Units deck and recruit,
        // for free, one neutral unit ASSOCIATED with the player's faction — the
        // same-tier neutral-deck counterpart of a unit on their roster — whose
        // Dwelling tier they have built. Recruited onto the single-sided Neutral
        // side, so (like any neutral unit) it can never be reinforced to a Pack.
        // Only copies still in the deck are offered. A faction's top-tier
        // signature creature (Gold Dragons, Titans, Hydras) only has an azure
        // neutral card, never a gold-tier one, so it never appears here. Azure
        // never qualifies anyway — no Dwelling unlocks it.
        const player = state.players[visit.playerId];
        if (!player?.factionId) {
          break;
        }
        const unlocked = unlockedRecruitTiers(state, visit.playerId);
        const associated = neutralUnitIdsByFaction[player.factionId] ?? [];
        const seen = new Set<string>();
        const options: { label: string; steps: VisitStep[] }[] = [];
        for (const unitDefId of associated) {
          const def = coreUnitDefinitions[unitDefId];
          if (!def?.neutral || !unlocked.has(def.tier) || seen.has(unitDefId)) {
            continue;
          }
          if (!neutralDeckHas(state, def.tier, unitDefId)) {
            continue;
          }
          seen.add(unitDefId);
          options.push({
            label: `Recruit ${def.name ?? unitDefId} (free)`,
            steps: [{ type: "RECRUIT_FACTION_UNIT", unitDefId }]
          });
        }
        if (options.length === 0) {
          break;
        }
        options.push({ label: "Skip", steps: [] });
        visit.steps.unshift({
          type: "CHOOSE_ONE",
          prompt: "Unexpected Reinforcements: search the Neutral Units deck and recruit one unit tied to your faction for free",
          options
        });
        break;
      }
      case "RECRUIT_FACTION_UNIT": {
        const player = state.players[visit.playerId];
        const def = coreUnitDefinitions[step.unitDefId];
        // Re-check eligibility at resolution: still a neutral unit associated
        // with the player's faction, a Dwelling for its tier is built, and a
        // copy is still in the deck — removeFromNeutralDeck takes that copy so
        // the search is honest (no duplicate card) and a stale option can never
        // recruit illegally. Recruited on the Neutral side: not upgradeable.
        const associated = player?.factionId ? neutralUnitIdsByFaction[player.factionId] ?? [] : [];
        const tier = def?.tier;
        if (
          player &&
          def?.neutral &&
          associated.includes(step.unitDefId) &&
          tier &&
          unlockedRecruitTiers(state, visit.playerId).has(tier) &&
          removeFromNeutralDeck(state, tier, step.unitDefId)
        ) {
          addArmyUnit(player, step.unitDefId, "neutral");
          appendEvent(state, {
            type: "UNIT_RECRUITED",
            playerId: visit.playerId,
            unitDefId: step.unitDefId,
            kind: "recruit",
            cost: {}
          });
        }
        break;
      }
      case "BLACK_MARKET": {
        const player = state.players[visit.playerId];
        if (!player) {
          break;
        }
        // Polish Random Artifacts: roll once for this browse (field/tile band).
        const marketHero = state.heroes[visit.heroId] ?? getMainHero(state, visit.playerId);
        maybeApplyPolishRandomArtifactRoll(state, visit.playerId, marketHero, "tile");
        const options = blackMarketOffers(state)
          .filter(
            (offer) =>
              hasResources(player, { gold: offer.price }) &&
              polishArtifactTierAllowed(state, cardLibrary[offer.cardId]?.artifactTier)
          )
          .map((offer) => ({
            label: `Buy ${cardLibrary[offer.cardId]?.name ?? offer.cardId} (${offer.price} gold)`,
            steps: [{ type: "BLACK_MARKET_BUY", cardId: offer.cardId, deckId: offer.deckId, price: offer.price } as VisitStep]
          }));
        if (options.length === 0) {
          clearPolishArtifactAccess(state);
          break;
        }
        options.push({ label: "Leave", steps: [{ type: "CLEAR_POLISH_ARTIFACT_ACCESS" } as VisitStep] });
        visit.steps.unshift({ type: "CHOOSE_ONE", prompt: "Black Market: buy an artifact", options });
        break;
      }
      case "BLACK_MARKET_BUY": {
        const player = state.players[visit.playerId];
        const deck = state.decks[step.deckId];
        const index = deck?.discardPile.lastIndexOf(step.cardId) ?? -1;
        if (!player || !deck || index === -1 || !hasResources(player, { gold: step.price })) {
          clearPolishArtifactAccess(state);
          break;
        }
        spendResources(state, visit.playerId, { gold: step.price }, "Black Market");
        deck.discardPile.splice(index, 1);
        player.hand.push(step.cardId);
        clearPolishArtifactAccess(state);
        break;
      }
      case "CLEAR_POLISH_ARTIFACT_ACCESS":
        clearPolishArtifactAccess(state);
        break;
      case "ELEMENTAL_CONFLUX": {
        const candidates = elementalConfluxCandidates(state, visit.playerId);
        if (candidates.length === 0) {
          break;
        }
        const options = candidates
          .filter(({ unitDefId }) =>
            hasRecruitResources(state, visit.playerId, coreUnitDefinitions[unitDefId]?.neutral?.cost ?? {})
          )
          .map(({ unitDefId, tier }) => {
            const cost = coreUnitDefinitions[unitDefId]?.neutral?.cost ?? {};
            const costLabel =
              Object.entries(cost)
                .map(([resource, amount]) => `${amount} ${resource}`)
                .join(" + ") || "free";
            return {
              label: `Recruit ${coreUnitDefinitions[unitDefId]?.name ?? unitDefId} (${costLabel})`,
              steps: [{ type: "ELEMENTAL_RECRUIT_ONE", unitDefId, tier } as VisitStep]
            };
          });
        if (options.length === 0) {
          break;
        }
        options.push({ label: "Decline", steps: [] });
        visit.steps.unshift({ type: "CHOOSE_ONE", prompt: "Elemental Conflux: recruit an Elemental", options });
        break;
      }
      case "ELEMENTAL_RECRUIT_ONE": {
        const player = state.players[visit.playerId];
        const def = coreUnitDefinitions[step.unitDefId];
        const cost = def?.neutral?.cost ?? {};
        if (!player || !def?.neutral || !hasRecruitResources(state, visit.playerId, cost)) {
          break;
        }
        const deck = state.decks[NEUTRAL_DECK_IDS[step.tier]];
        const drawIndex = deck?.drawPile.lastIndexOf(step.unitDefId) ?? -1;
        if (deck && drawIndex !== -1) {
          deck.drawPile.splice(drawIndex, 1);
        } else {
          const discardIndex = deck?.discardPile.lastIndexOf(step.unitDefId) ?? -1;
          if (deck && discardIndex !== -1) {
            deck.discardPile.splice(discardIndex, 1);
          }
        }
        spendRecruitResources(state, visit.playerId, cost, `recruited ${def.name} at the Elemental Conflux`);
        addArmyUnit(player, step.unitDefId, "neutral");
        appendEvent(state, {
          type: "UNIT_RECRUITED",
          playerId: visit.playerId,
          unitDefId: step.unitDefId,
          kind: "recruit",
          cost
        });
        break;
      }
      case "SPELL_SCROLL": {
        const player = state.players[visit.playerId];
        if (!player) {
          break;
        }
        // The scroll is created on the first draw and threaded through the
        // follow-up steps so both spells land in the same scroll.
        let scrollId = step.scrollId;
        if (!scrollId) {
          scrollId = `scroll_${nextEventNumber(state)}`;
          player.scrolls = player.scrolls ?? [];
          player.scrolls.push({ id: scrollId, spellCardIds: [] });
        }

        if (step.remaining <= 0) {
          const scroll = player.scrolls?.find((candidate) => candidate.id === scrollId);
          if (scroll && scroll.spellCardIds.length === 0) {
            // No spells could be drawn (decks empty): drop the empty scroll.
            player.scrolls = player.scrolls?.filter((candidate) => candidate.id !== scrollId);
          } else if (scroll) {
            appendEvent(state, {
              type: "SPELL_SCROLL_GAINED",
              playerId: visit.playerId,
              scrollId,
              spellCardIds: [...scroll.spellCardIds]
            });
          }
          break;
        }

        const candidates = spellDeckCandidates(state);
        if (candidates.length === 0) {
          // Nothing left to draw — finish (the GAINED announcement above runs
          // once remaining hits 0).
          visit.steps.unshift({ type: "SPELL_SCROLL", remaining: 0, scrollId });
          break;
        }

        const ordinal = step.remaining >= 2 ? "first" : "second";
        const drawStepsFor = (deckId: string): VisitStep[] => [
          { type: "DRAW_SCROLL_SPELL", deckId, scrollId: scrollId! }
        ];

        if (candidates.length === 1) {
          visit.steps.unshift(
            ...drawStepsFor(candidates[0]),
            { type: "SPELL_SCROLL", remaining: step.remaining - 1, scrollId }
          );
        } else {
          visit.steps.unshift(
            {
              type: "CHOOSE_ONE",
              prompt: `Spell Scroll: draw the ${ordinal} spell from which Magic deck?`,
              options: candidates.map((deckId) => ({
                label: deckId === "spells-expert" ? "Expert Magic deck" : "Basic Magic deck",
                steps: drawStepsFor(deckId)
              }))
            },
            { type: "SPELL_SCROLL", remaining: step.remaining - 1, scrollId }
          );
        }
        break;
      }
      case "DRAW_SCROLL_SPELL": {
        const player = state.players[visit.playerId];
        const scroll = player?.scrolls?.find((candidate) => candidate.id === step.scrollId);
        // A scroll's spells count as owned (see playerHeldCardIds), so the draw
        // must respect the no-duplicate rule: skip any spell this hero already
        // holds — including one drawn into THIS scroll a moment ago (the first
        // spell is pushed before the second is drawn) — so one scroll never ends
        // up holding two of the same spell, and never a spell already in hand.
        const drawn = drawTopOfSharedDeck(state, step.deckId, visit.playerId);
        if (scroll && drawn) {
          scroll.spellCardIds.push(drawn);
        }
        break;
      }
      default:
        break;
    }

    if (state.pendingChoice) {
      return;
    }
  }

  if (visit.steps.length === 0) {
    adventure.pendingVisit = null;
  }
}

function fieldName(state: GameState, fieldId: MapSpaceId): string {
  const field = state.adventure?.fields[fieldId];
  return field ? (locationDefinitions[field.location]?.name ?? field.location) : fieldId;
}

/** Spell decks (Basic/Expert) that still hold a card to draw into a scroll. */
function spellDeckCandidates(state: GameState): string[] {
  return ["spells", "spells-expert"].filter((deckId) => {
    const deck = state.decks[deckId];
    return Boolean(deck) && deck!.drawPile.length + deck!.discardPile.length > 0;
  });
}

/**
 * Draws the top card of a shared deck, reshuffling its discard if it ran dry.
 * When `playerId` is given, redraws past any card that player may not acquire
 * (a duplicate they already own, a starting-only spell) — the skipped cards are
 * tucked back under the deck, never consumed, so the other copies survive for
 * everyone else. An `accept` filter redraws past rejected cards the same way
 * (the Events' early-game Relic lock on a legacy single Artifact deck).
 * Returns null when nothing acquirable is left.
 */
function drawTopOfSharedDeck(
  state: GameState,
  deckId: string,
  playerId?: PlayerId,
  accept?: (cardId: string) => boolean
): string | null {
  const deck = state.decks[deckId];
  if (!deck) {
    return null;
  }
  const skipped: string[] = [];
  let taken: string | null = null;
  while (true) {
    if (deck.drawPile.length === 0 && deck.discardPile.length > 0) {
      deck.drawPile = shuffleCards(
        deck.discardPile,
        `${state.seed}#scroll-reshuffle#${deckId}#${eventSeedNumber(state)}`
      );
      deck.discardPile = [];
    }
    const card = deck.drawPile.pop();
    if (!card) {
      break;
    }
    if ((!playerId || canAcquireSharedDeckCard(state, playerId, deckId, card)) && (!accept || accept(card))) {
      taken = card;
      break;
    }
    skipped.push(card);
  }
  if (skipped.length > 0) {
    // Tuck the un-takeable cards under the deck (front = bottom). They are never
    // re-reached within this single draw, so the loop always terminates.
    deck.drawPile.unshift(...skipped);
  }
  return taken;
}

/**
 * Injected by the reducer (which owns the Ⅱ–Ⅲ keep/reroll/pick flip and
 * beginTileRotation — neither importable here without a cycle) so that a
 * Ⅱ–Ⅲ surface tile discovered ACROSS a Subterranean Gate runs the same
 * settlement/material-mine flip as every other on-map discovery. Until it is
 * registered (or for non-Far tiles), the gate falls back to a plain inline
 * reveal. See {@link resolveSubterraneanGate} and the reducer's revealOnMapTile.
 */
let onMapTileRevealHook: ((state: GameState, playerId: PlayerId, tile: MapTileState) => void) | null = null;
export function setOnMapTileRevealHook(
  hook: ((state: GameState, playerId: PlayerId, tile: MapTileState) => void) | null
): void {
  onMapTileRevealHook = hook;
}

/**
 * Subterranean Gate (Stronghold expansion): "When a Hero enters a Field with a
 * Subterranean Gate, discover the Map Tile on the other side for free (if it is
 * still not discovered). Otherwise treat a Subterranean Gate Token as an empty
 * Field." Entering the gate is the only way to discover across the
 * Surface↔Subterranean divide (a Hero "may not discover a Subterranean Map Tile
 * while standing on a Surface Map Tile and vice versa").
 *
 * Revealing hands the far tile's rotation to the entering player, exactly like
 * any other discovery. Once they lock that rotation, `setTileRotation`
 * materializes the tile and re-runs {@link recomputeSubterraneanGates}, which
 * sacrifices the entrance hex on the freshly revealed tile and links the two
 * halves so the hero can then cross.
 */
function resolveSubterraneanGate(state: GameState, visit: PendingVisit): void {
  const adventure = state.adventure;
  const field = adventure?.fields[visit.fieldId];
  if (!adventure || !field || field.location !== "subterranean_gate" || !field.gateToTileId) {
    return;
  }

  const farTile = adventure.tiles[field.gateToTileId];
  if (!farTile || !farTile.faceDown) {
    // Other side already discovered: the gate is just an empty field.
    return;
  }

  // A face-down Ⅱ–Ⅲ surface tile flipped across the Gate obeys the same
  // settlement / material-mine keep/reroll/pick rules as any other on-map
  // discovery. The flip lives in the reducer, so it is reached via the injected
  // hook; it may open an OPTION_CHOICE, so the (now-complete, single-step) gate
  // visit is cleared first — the gate step has already been shifted off — to
  // avoid leaving an empty pending visit behind it. Anything richer than a bare
  // gate visit, or a non-Far tile, falls back to the plain inline reveal below.
  if (onMapTileRevealHook && farTile.group === "far" && visit.steps.length === 0) {
    adventure.pendingVisit = null;
    onMapTileRevealHook(state, visit.playerId, farTile);
    return;
  }

  // Flip the far tile up for free and hand its rotation to the entering player.
  // This mirrors the "reveal" branch of beginTileRotation (which lives in the
  // reducer and is not importable here without a cycle); SET_TILE_ROTATION then
  // materializes it and carves the entrance via recomputeSubterraneanGates.
  farTile.faceDown = false;
  farTile.awaitingRotation = true;
  adventure.pendingTileChoice = {
    tileInstanceId: farTile.id,
    playerId: visit.playerId,
    kind: "reveal"
  };
  appendEvent(state, {
    type: "TILE_REVEALED",
    playerId: visit.playerId,
    tileInstanceId: farTile.id,
    tileDefId: farTile.tileDefId
  });
}

// ---------------------------------------------------------------------------
// Monolith (Conflux) / Whirlpool (Cove) Location Tokens
// ---------------------------------------------------------------------------

export type MapTokenKind = "monolith" | "whirlpool";

/**
 * A token kind placeable on a tile field: the two teleport-network tokens
 * (Monolith / Whirlpool) plus a colored Gate. A Gate is a LAND structure, so it
 * reuses the Monolith legality everywhere a placement is validated; it differs
 * only in what it carves (a colored `pair` field, its own per-color network).
 */
export type TokenPlacementKind = MapTokenKind | "gate";

/** Display name of a token kind for prompts, notes and warnings. */
export function mapTokenLabel(kind: MapTokenKind): string {
  return kind === "monolith" ? "Monolith" : "Whirlpool";
}

/**
 * Display label for a placeable teleport token — "Monolith" / "Whirlpool" or a
 * colored "<color> Gate" (e.g. "red Gate"). Shared by the pending-token
 * placement prompt and the carve/drop event notes so a gate token reads
 * consistently wherever a monolith/whirlpool one would.
 */
export function placementTokenLabel(token: {
  kind: TokenPlacementKind | CustomMapObjectKind;
  pair?: 1 | 2 | 3 | 4;
}): string {
  if (token.kind === "gate") {
    return `${gatePairColor(token.pair ?? 1)} Gate`;
  }
  if (token.kind === "garrison") {
    return "Garrison";
  }
  if (token.kind === "keymaster_tent") {
    return `${gatePairColor(token.pair ?? 1)} Keymaster's Tent`;
  }
  if (token.kind === "barrier") {
    return `${gatePairColor(token.pair ?? 1)} Barrier`;
  }
  if (token.kind === "oneway_entrance") {
    return `${gatePairColor(token.pair ?? 1)} one-way monolith (entrance)`;
  }
  if (token.kind === "oneway_exit") {
    return `${gatePairColor(token.pair ?? 1)} one-way monolith (exit)`;
  }
  return mapTokenLabel(token.kind);
}

/** Whether a field's location IS a Monolith/Whirlpool Location Token. */
export function isMapTokenLocation(locationId: string): boolean {
  // anime.tran_phap_truyen_tong is a Field Override that joins the Monolith
  // network (TOKEN_TELEPORT) with its own hex art — same travel rules.
  return (
    locationId === "monolith" ||
    locationId === "whirlpool" ||
    locationId === "anime.tran_phap_truyen_tong"
  );
}

/**
 * Whether a field's location is ANY designer teleport object — a Monolith or
 * Whirlpool Location Token OR a colored Gate. Used where "this hex is already a
 * teleport object" is what matters: no other token may be dropped on top of it
 * (see {@link gateMayCoverField} / {@link TOKEN_FORBIDDEN_LOCATIONS}), a defeated
 * DESIGNED guard on it is cleared on the win visit, and the board draws the
 * "⇄ teleport" doorway cue.
 */
export function isMapObjectLocation(locationId: string): boolean {
  return isMapTokenLocation(locationId) || locationId === "gate";
}

/** Teleport-Gate pair (1-4) → its display colour name (red/blue/green/violet — the printed portal art). */
export function gatePairColor(pair: 1 | 2 | 3 | 4): string {
  return { 1: "red", 2: "blue", 3: "green", 4: "violet" }[pair];
}

/**
 * Whether `field` is a member of the `kind` teleport network. A carved token
 * field always is; additionally, under the map-wide Obelisk role "monolith",
 * EVERY Obelisk field joins the MONOLITH network (designer Monolith tokens and
 * Obelisks form one shared network). Obelisks never join the Whirlpool network
 * (they are land structures and the role only names Monoliths).
 */
function fieldIsTokenNetworkMember(state: GameState, field: MapFieldState, kind: MapTokenKind): boolean {
  if (field.location === kind) {
    return true;
  }
  // Teleportation Array Field Override joins the Monolith network.
  if (kind === "monolith" && field.location === "anime.tran_phap_truyen_tong") {
    return true;
  }
  return kind === "monolith" && field.location === "obelisk" && obeliskRoleIsMonolith(state);
}

/**
 * Locations a Monolith/Whirlpool token may never overwrite. Rulebook p.35:
 * "Tokens cannot be placed on other Location Tokens, Blocked Fields, or Fields
 * containing Locations required to meet any of the Scenario's victory
 * conditions." Towns, Settlements, Mines, Obelisks, the Grail and the Dragon
 * Utopia all anchor victory/economy goals, so they are excluded as the
 * conservative reading; guarded fields are excluded too (overwriting one would
 * erase a live guard for free — an engine safety reading, commented here
 * because the printed rule does not mention guards).
 */
const TOKEN_FORBIDDEN_LOCATIONS = new Set([
  "settlement",
  "mine",
  "grail",
  "obelisk",
  "dragon_utopia",
  "subterranean_gate",
  "creature_bank",
  "monolith",
  "whirlpool",
  "gate"
]);

/**
 * Whether a tile-DEFINITION field may host a `kind` token: legal location and
 * matching printed terrain (Monoliths/Gates on land, Whirlpools on sea). Pure —
 * used by the map designer to filter slot pickers and by setup to validate a
 * designed face-up placement. Guards (printed difficulty) refuse the token. A
 * Gate is land, so `(kind === "whirlpool")` is false for it and the check
 * demands a non-water hex — the Monolith legality, shared verbatim.
 */
export function tokenMayCoverFieldDef(def: TileDefinition, slot: number, kind: TokenPlacementKind): boolean {
  const fieldDef = def.fields[slot];
  if (!fieldDef) {
    return false;
  }
  const location = locationDefinitions[fieldDef.location];
  if (!location || location.category === "blocked" || location.category === "town") {
    return false;
  }
  if (
    TOKEN_FORBIDDEN_LOCATIONS.has(fieldDef.location) ||
    isFieldOverrideLocation(fieldDef.location) ||
    fieldDef.difficulty
  ) {
    return false;
  }
  const isWater = fieldDef.terrain ? fieldDef.terrain === "water" : def.terrain === "water";
  return (kind === "whirlpool") === isWater;
}

/** The tile-definition slots (0-6) that may host a `kind` token (designer picker). */
export function legalTokenSlotsForTileDef(def: TileDefinition, kind: TokenPlacementKind): number[] {
  return def.fields.map((_, slot) => slot).filter((slot) => tokenMayCoverFieldDef(def, slot, kind));
}

/**
 * Whether a MATERIALIZED field may host a `kind` token right now: the same
 * location/terrain rules as {@link tokenMayCoverFieldDef} plus the live map
 * state — no still-guarded field, and no field a hero is standing on (the
 * token overwrites the hex; it cannot be pulled out from under a hero). A Gate
 * reuses the Monolith land legality (see {@link tokenMayCoverFieldDef}).
 */
function tokenMayCoverField(state: GameState, field: MapFieldState | undefined, kind: TokenPlacementKind): boolean {
  if (!field) {
    return false;
  }
  const location = locationDefinitions[field.location];
  if (!location || location.category === "blocked" || location.category === "town") {
    return false;
  }
  // Carved Field Override hexes are Location-Token-like: never overwritten —
  // the override placed FIRST in the reveal chain precisely so tokens pick a
  // different hex.
  if (
    TOKEN_FORBIDDEN_LOCATIONS.has(field.location) ||
    isFieldOverrideLocation(field.location) ||
    isFieldGuarded(field) ||
    field.difficulty
  ) {
    return false;
  }
  if (heroAtSpace(state, field.spaceId)) {
    return false;
  }
  const isWater = field.terrain === "water";
  return (kind === "whirlpool") === isWater;
}

/** The legal hexes of `tile` a just-discovered `kind` token may be placed on. */
export function tokenPlacementCandidates(
  state: GameState,
  tile: MapTileState,
  kind: TokenPlacementKind | "oneway_entrance" | "oneway_exit"
): MapSpaceId[] {
  const adventure = state.adventure;
  if (!adventure) {
    return [];
  }
  // One-way monoliths are land structures — they reuse the Monolith legality.
  const legality: TokenPlacementKind =
    kind === "oneway_entrance" || kind === "oneway_exit" ? "monolith" : kind;
  return getTileFootprintSpaceIds(tile).filter((spaceId) => {
    const field = adventure.fields[spaceId];
    return field?.tileInstanceId === tile.id && tokenMayCoverField(state, field, legality);
  });
}

/**
 * Every token of `kind` in play: carved fields plus tokens still riding
 * face-down tiles. Both count toward "must have at least 2 to work" — a lone
 * placed Monolith whose partner still hides on a face-down tile DOES lead
 * somewhere (travelling there is what discovers the tile).
 */
function countMapTokens(state: GameState, kind: MapTokenKind): number {
  const adventure = state.adventure;
  if (!adventure) {
    return 0;
  }
  // Carved token fields PLUS Obelisk fields under the monolith role (network
  // members) — {@link fieldIsTokenNetworkMember}.
  const placed = Object.values(adventure.fields).filter((field) => fieldIsTokenNetworkMember(state, field, kind)).length;
  // Multi-token tiles: EVERY queued token still riding a face-down tile counts
  // (tilePendingTokens folds the legacy singular in).
  const pending = Object.values(adventure.tiles).reduce(
    (sum, tile) =>
      sum + (tile.faceDown ? tilePendingTokens(tile).filter((token) => token.kind === kind).length : 0),
    0
  );
  return placed + pending;
}

/** One reachable travel destination: a carved token field, or one still face-down. */
type MapTokenDestination =
  | { type: "field"; spaceId: MapSpaceId; number?: -1 | 0 | 1; label: string }
  | { type: "pending-tile"; tileInstanceId: string; number?: -1 | 0 | 1; label: string };

/**
 * Where a `kind` travel from `fromSpaceId` may go: every OTHER token of the
 * kind — carved fields (skipping any a hero currently occupies: the p.83 note
 * "skip the movement" reading) plus face-down tiles still carrying the token
 * (travelling there reveals the tile and the traveller places the token).
 */
function mapTokenDestinations(state: GameState, kind: MapTokenKind, fromSpaceId: MapSpaceId): MapTokenDestination[] {
  const adventure = state.adventure;
  if (!adventure) {
    return [];
  }
  const destinations: MapTokenDestination[] = [];
  for (const field of Object.values(adventure.fields)) {
    if (!fieldIsTokenNetworkMember(state, field, kind) || field.spaceId === fromSpaceId || heroAtSpace(state, field.spaceId)) {
      continue;
    }
    const tile = adventure.tiles[field.tileInstanceId];
    const where = tile ? ` on the ${tile.backLabel ?? tile.group ?? "map"} tile at (${tile.centerRow}, ${tile.centerCol})` : "";
    // An Obelisk acting as a Monolith network member is labelled as an Obelisk.
    const memberLabel = field.location === "obelisk" ? "Obelisk" : mapTokenLabel(kind);
    destinations.push({
      type: "field",
      spaceId: field.spaceId,
      ...(field.whirlpoolNumber !== undefined ? { number: field.whirlpoolNumber } : {}),
      label:
        kind === "whirlpool" && field.whirlpoolNumber !== undefined
          ? `Whirlpool ${field.whirlpoolNumber >= 0 ? "+" : ""}${field.whirlpoolNumber}${where}`
          : `${memberLabel}${where}`
    });
  }
  for (const tile of Object.values(adventure.tiles)) {
    if (!tile.faceDown) {
      continue;
    }
    // Multi-token tiles: one destination per tile is enough (revealing it
    // places every queued token), but the tile only qualifies when SOME queued
    // token matches the travelling kind.
    const pending = tilePendingTokens(tile).find((token) => token.kind === kind);
    if (!pending) {
      continue;
    }
    const number = pending.number;
    destinations.push({
      type: "pending-tile",
      tileInstanceId: tile.id,
      ...(number !== undefined ? { number } : {}),
      label: `${kind === "whirlpool" && number !== undefined ? `Whirlpool ${number >= 0 ? "+" : ""}${number}` : mapTokenLabel(kind)} — a face-down ${
        tile.backLabel ?? "map"
      } tile at (${tile.centerRow}, ${tile.centerCol}) (reveal it and place the token)`
    });
  }
  return destinations;
}

/** The visit steps that carry the hero to one travel destination. */
function mapTokenTravelSteps(visit: PendingVisit, kind: MapTokenKind, destination: MapTokenDestination): VisitStep[] {
  if (destination.type === "pending-tile") {
    // The unit toll of a Whirlpool travel into a face-down tile lands in
    // completeMapTokenTeleport, after the token is placed and the hero moves.
    return [{ type: "TOKEN_TELEPORT_REVEAL", token: kind, tileInstanceId: destination.tileInstanceId }];
  }
  return [
    // TELEPORT_HERO without `visit`: arriving on the destination token must
    // NOT re-run its own TOKEN_TELEPORT (an instant ping-pong loop). The hero
    // may Revisit (1 MP) or re-enter later to travel again. `sweepGuard`:
    // a designed guard still standing on the destination is auto-won.
    { type: "TELEPORT_HERO", heroId: visit.heroId, spaceId: destination.spaceId, sweepGuard: true },
    ...(kind === "whirlpool" ? [{ type: "WHIRLPOOL_PENALTY" } as const] : [])
  ];
}

/**
 * Monolith/Whirlpool travel (rulebook p.83). Entering (or Revisiting) the
 * token moves the hero to another token of the same kind:
 * - fewer than 2 tokens of the kind in play → the field does nothing (noted);
 * - exactly one reachable destination → straight there;
 * - exactly 3 Whirlpools, all numbered → the printed Attack-die rule: roll,
 *   surface at the Whirlpool whose number matches, rerolling the origin's own
 *   number (and any number that cannot be travelled to — an occupied token);
 * - otherwise (several Monoliths, or Whirlpool counts the die cannot map) →
 *   the traveller picks the destination (the board-game adaptation of the
 *   "corresponding" pairing, which a designed map does not pin down).
 * A destination still face-down routes through TOKEN_TELEPORT_REVEAL: the tile
 * is discovered for free and the traveller places the destination token first.
 */
function resolveTokenTeleport(state: GameState, visit: PendingVisit, kind: MapTokenKind): void {
  const adventure = state.adventure;
  const field = adventure?.fields[visit.fieldId];
  // The origin may be a carved token OR an Obelisk under the monolith role
  // ({@link fieldIsTokenNetworkMember}) — both drive the same travel.
  if (!adventure || !field || !fieldIsTokenNetworkMember(state, field, kind)) {
    return;
  }

  const label = mapTokenLabel(kind);
  if (countMapTokens(state, kind) < 2) {
    eventNote(
      state,
      `The ${label} leads nowhere — at least 2 ${label}s must be on the map for it to work.`,
      visit.playerId
    );
    return;
  }

  const destinations = mapTokenDestinations(state, kind, visit.fieldId);
  if (destinations.length === 0) {
    eventNote(state, `The ${label} fizzles — every other ${label} is occupied by a hero.`, visit.playerId);
    return;
  }
  if (destinations.length === 1) {
    visit.steps.unshift(...mapTokenTravelSteps(visit, kind, destinations[0]));
    return;
  }

  // "If there are 3 Whirlpools, roll an Attack Die to determine where your
  // Hero goes, and reroll any Die that shows the number of the Whirlpool your
  // Hero is moving from." The printed tokens carry the die faces -1/0/+1 as
  // their numbers, so the roll maps straight onto them. A face that maps to no
  // reachable destination (its token occupied) is rerolled too.
  if (kind === "whirlpool" && countMapTokens(state, "whirlpool") === 3 && field.whirlpoolNumber !== undefined) {
    const byNumber = new Map<number, MapTokenDestination>();
    for (const destination of destinations) {
      if (destination.number !== undefined) {
        byNumber.set(destination.number, destination);
      }
    }
    if (byNumber.size === destinations.length) {
      const random = adventureRandom(state, "whirlpool-die");
      const faces = [-1, -1, 0, 0, 1, 1];
      const rolls: number[] = [];
      let destination: MapTokenDestination | undefined;
      // Two of the six faces always match a reachable candidate here, so this
      // terminates almost immediately; the bound is a pure safety net (falling
      // through to the traveller's pick below).
      for (let attempt = 0; attempt < 24 && !destination; attempt += 1) {
        const roll = faces[random.nextInt(0, faces.length - 1)];
        rolls.push(roll);
        if (roll === field.whirlpoolNumber) {
          continue;
        }
        destination = byNumber.get(roll);
      }
      if (destination) {
        appendEvent(state, {
          type: "ADVENTURE_DICE_ROLLED",
          playerId: visit.playerId,
          dice: "attack",
          results: rolls.map((roll, index) => {
            const face = `${roll >= 0 ? "+" : ""}${roll}`;
            return index === rolls.length - 1
              ? `Attack die: ${face} — the Whirlpool ${face}`
              : `Attack die: ${face} (rerolled)`;
          }),
          attackRolls: rolls
        });
        visit.steps.unshift(...mapTokenTravelSteps(visit, kind, destination));
        return;
      }
    }
  }

  visit.steps.unshift({
    type: "CHOOSE_ONE",
    prompt: `${label} — choose where to travel`,
    // Tag the picker so the board can offer each destination as a glowing,
    // clickable exit hex (themed by kind) instead of a bare numbered list; the
    // travel semantics are unchanged (the option steps are still authoritative).
    teleport: { kind },
    options: destinations.map((destination) => ({
      label: destination.label,
      steps: mapTokenTravelSteps(visit, kind, destination)
    }))
  });
}

/**
 * Every colored Gate of `pair` in play: carved gate FIELDS plus gate tokens
 * still riding face-down tiles. Both count toward "at least 2 same-color gates
 * must exist to travel" — a lone carved gate whose same-color partner still
 * hides on a face-down tile DOES lead somewhere (travelling there is what
 * discovers the tile). The Monolith network's {@link countMapTokens} mirror,
 * partitioned by `gatePair`.
 */
function countColoredGates(state: GameState, pair: 1 | 2 | 3 | 4): number {
  const adventure = state.adventure;
  if (!adventure) {
    return 0;
  }
  const placed = Object.values(adventure.fields).filter(
    (field) => field.location === "gate" && field.gatePair === pair
  ).length;
  const pending = Object.values(adventure.tiles).reduce(
    (sum, tile) =>
      sum +
      (tile.faceDown
        ? tilePendingTokens(tile).filter((token) => token.kind === "gate" && token.pair === pair).length
        : 0),
    0
  );
  return placed + pending;
}

/**
 * Where a colored-Gate travel of `pair` from `fromSpaceId` may go: every OTHER
 * same-color gate — carved FIELDS (skipping any a hero occupies: the p.83 "skip
 * the movement" reading) PLUS face-down TILES still carrying a same-color gate
 * token (travelling there reveals the tile and the traveller places the token,
 * carving its partner gate). The Monolith network's {@link mapTokenDestinations}
 * mirror, partitioned by `gatePair` — never a different color, never a Monolith.
 */
function coloredGateDestinations(state: GameState, pair: 1 | 2 | 3 | 4, fromSpaceId: MapSpaceId): MapTokenDestination[] {
  const adventure = state.adventure;
  if (!adventure) {
    return [];
  }
  const color = gatePairColor(pair);
  const destinations: MapTokenDestination[] = [];
  for (const field of Object.values(adventure.fields)) {
    if (
      field.location !== "gate" ||
      field.gatePair !== pair ||
      field.spaceId === fromSpaceId ||
      heroAtSpace(state, field.spaceId)
    ) {
      continue;
    }
    const tile = adventure.tiles[field.tileInstanceId];
    const where = tile ? ` on the ${tile.backLabel ?? tile.group ?? "map"} tile at (${tile.centerRow}, ${tile.centerCol})` : "";
    destinations.push({ type: "field", spaceId: field.spaceId, label: `${color} Gate${where}` });
  }
  for (const tile of Object.values(adventure.tiles)) {
    if (
      !tile.faceDown ||
      !tilePendingTokens(tile).some((token) => token.kind === "gate" && token.pair === pair)
    ) {
      continue;
    }
    destinations.push({
      type: "pending-tile",
      tileInstanceId: tile.id,
      label: `${color} Gate — a face-down ${tile.backLabel ?? "map"} tile at (${tile.centerRow}, ${tile.centerCol}) (reveal it and place the token)`
    });
  }
  return destinations;
}

/** The visit steps that carry the hero to one colored-Gate destination. */
function coloredGateTravelSteps(visit: PendingVisit, pair: 1 | 2 | 3 | 4, destination: MapTokenDestination): VisitStep[] {
  if (destination.type === "pending-tile") {
    // A same-color gate destination still face-down: reveal it, place the token
    // (carving the SAME-color partner via the `pair`), and arrive on it — the
    // shared TOKEN_TELEPORT_REVEAL flow the Monolith uses. Gates take NO unit
    // toll (only a Whirlpool travel does), so there is no WHIRLPOOL_PENALTY tail.
    return [{ type: "TOKEN_TELEPORT_REVEAL", token: "gate", pair, tileInstanceId: destination.tileInstanceId }];
  }
  // TELEPORT_HERO without `visit`: arriving on the destination gate must NOT
  // re-run its own GATE_TELEPORT (no ping-pong); Revisit (1 MP) travels again.
  // `sweepGuard`: a designed guard still standing there is auto-won on arrival.
  return [{ type: "TELEPORT_HERO", heroId: visit.heroId, spaceId: destination.spaceId, sweepGuard: true }];
}

/**
 * Colored Gate travel (map-designer objects, rulebook p.83). Entering (or
 * Revisiting) a gate moves the hero to another gate of the SAME colored pair —
 * its OWN per-color network, never the Monolith network (and Monoliths/Obelisks
 * never join a gate pair). It mirrors the Monolith network semantics in
 * {@link resolveTokenTeleport}, partitioned by `gatePair`:
 * - fewer than 2 same-color gates on the map (carved OR still riding a face-down
 *   tile) → nothing (noted, needs ≥2);
 * - all other same-color gates occupied by a hero → fizzles (noted, the p.83
 *   "skip the movement" reading);
 * - exactly one free same-color destination → straight there;
 * - two or more free → the TRAVELLER PICKS via the same CHOOSE_ONE visit-step
 *   the Monolith picker uses (so the board UI renders it unchanged).
 * A carved gate FIELD is a bare TELEPORT_HERO; a same-color gate token still
 * riding a FACE-DOWN tile is a full destination too — travelling there flips the
 * tile for free, the traveller rotates it and places the token (carving the
 * partner gate), then arrives on it (the shared `pendingTokenTeleport` flow,
 * exactly like a Monolith). Arrival does NOT re-trigger, so there is no
 * ping-pong; the hero may Revisit (1 MP) to travel again.
 */
function resolveGateTeleport(state: GameState, visit: PendingVisit): void {
  const adventure = state.adventure;
  const field = adventure?.fields[visit.fieldId];
  if (!adventure || !field || field.location !== "gate" || field.gatePair === undefined) {
    return;
  }
  const pair = field.gatePair;
  const color = gatePairColor(pair);
  // At least 2 same-color gates must be in play — carved OR still riding a
  // face-down tile (travelling to a pending one is what discovers it), exactly
  // like the Monolith network's countMapTokens gate.
  if (countColoredGates(state, pair) < 2) {
    eventNote(
      state,
      `The ${color} Gate leads nowhere — at least 2 ${color} Gates must be on the map for it to work.`,
      visit.playerId
    );
    return;
  }
  // Every OTHER free same-color destination (carved field or pending face-down
  // tile). Per-color isolation is deliberate: a red gate never offers a blue
  // gate or a Monolith, and no pending Monolith/whirlpool tile ever appears here.
  const destinations = coloredGateDestinations(state, pair, visit.fieldId);
  if (destinations.length === 0) {
    eventNote(state, `The ${color} Gate fizzles — every other ${color} Gate is occupied by a hero.`, visit.playerId);
    return;
  }
  if (destinations.length === 1) {
    visit.steps.unshift(...coloredGateTravelSteps(visit, pair, destinations[0]));
    return;
  }
  // Two or more free same-color destinations → the traveller picks (the same
  // visit-step CHOOSE_ONE the Monolith network picker opens).
  visit.steps.unshift({
    type: "CHOOSE_ONE",
    prompt: `${color.charAt(0).toUpperCase()}${color.slice(1)} Gate — choose where to travel`,
    // Same board affordance as the Monolith picker, themed by the gate's color
    // pair (the ring tint) — see resolveTokenTeleport.
    teleport: { kind: "gate", pair },
    options: destinations.map((destination) => ({
      label: destination.label,
      steps: coloredGateTravelSteps(visit, pair, destination)
    }))
  });
}

/** Carves a colored Gate object (a tile-slot placement) onto a materialized field. */
export function carveColoredGateField(
  adventure: AdventureState,
  spaceId: MapSpaceId,
  pair: 1 | 2 | 3 | 4
): MapFieldState | null {
  const field = adventure.fields[spaceId];
  if (!field) {
    return null;
  }
  // The gate overwrites whatever printed Location was here (like a Monolith); a
  // clean land field remains. Its DESIGNED guard difficulty, if any, is set by
  // the caller AFTER this carve.
  field.location = "gate";
  field.gatePair = pair;
  delete field.difficulty;
  delete field.resource;
  delete field.amount;
  delete field.faction;
  field.blackCube = false;
  field.flagOwnerId = null;
  delete field.extraFlagOwnerIds;
  field.everFlagged = false;
  field.settlementResource = null;
  delete field.grailDiggable;
  delete field.gateToTileId;
  delete field.gateLinkSpaceId;
  delete field.bankId;
  delete field.terrain;
  delete field.whirlpoolNumber;
  return field;
}

/**
 * Every CARVED free same-color one-way EXIT a travel from `fromSpaceId` may
 * reach: `location: "oneway_exit"` fields of `pair`, minus hero-occupied ones.
 * Exits still riding a FACE-DOWN tile are deliberately NOT offered (reveal the
 * tile first) — the documented one-way limit, unlike the Monolith network.
 */
function onewayExitFields(state: GameState, pair: 1 | 2 | 3 | 4, fromSpaceId: MapSpaceId): MapFieldState[] {
  const adventure = state.adventure;
  if (!adventure) {
    return [];
  }
  return Object.values(adventure.fields).filter(
    (field) =>
      field.location === "oneway_exit" &&
      field.gatePair === pair &&
      field.spaceId !== fromSpaceId &&
      !heroAtSpace(state, field.spaceId)
  );
}

/** The travel steps to one one-way exit (arrival sweeps any hand-edited guard). */
function onewayTravelSteps(visit: PendingVisit, exit: MapFieldState): VisitStep[] {
  return [{ type: "TELEPORT_HERO", heroId: visit.heroId, spaceId: exit.spaceId, sweepGuard: true }];
}

/** A short board label for a one-way exit destination. */
function onewayExitLabel(state: GameState, exit: MapFieldState): string {
  const tile = state.adventure?.tiles[exit.tileInstanceId];
  const where = tile ? ` on the ${tile.backLabel ?? tile.group ?? "map"} tile at (${tile.centerRow}, ${tile.centerCol})` : "";
  return `One-way exit${where || ` at ${exit.spaceId}`}${exit.onewayAlwaysPickable ? " (always pickable)" : ""}`;
}

/** Roll (seeded) among `exits` and unshift the travel; notes the roll for the table. */
function rollOnewayExit(state: GameState, visit: PendingVisit, exits: MapFieldState[]): void {
  const random = adventureRandom(state, "oneway-exit");
  const exit = exits[random.nextInt(0, exits.length - 1)];
  eventNote(
    state,
    `${eventPlayerName(state, visit.playerId)} rolls for the one-way exit — the monolith hurls the hero to ${onewayExitLabel(state, exit)}.`,
    visit.playerId
  );
  visit.steps.unshift(...onewayTravelSteps(visit, exit));
}

/**
 * One-way monolith travel (map-designer objects, 4 colors). Entering (or
 * Revisiting, 1 MP) an ENTRANCE moves the hero to a SAME-COLOR carved EXIT:
 *  - no carved same-color exit → inert with a note;
 *  - every exit occupied → fizzle with a note;
 *  - exactly one free exit → straight there (whatever the mode);
 *  - mode "random" → a seeded roll among ALL free exits;
 *  - mode "certain" (default) → the traveller picks;
 *  - mode "mix" → pick an ALWAYS-PICKABLE exit up front, or roll among the
 *    random-pool (non-always) exits — the printed "choose before the roll".
 * Entrances are never destinations (one-way), other colors never mix, and the
 * Monolith/Gate networks stay separate.
 */
function resolveOnewayTeleport(state: GameState, visit: PendingVisit): void {
  const adventure = state.adventure;
  const field = adventure?.fields[visit.fieldId];
  if (!adventure || !field || field.location !== "oneway_entrance" || field.gatePair === undefined) {
    return;
  }
  const pair = field.gatePair;
  const color = gatePairColor(pair);
  const anyExit = Object.values(adventure.fields).some(
    (candidate) => candidate.location === "oneway_exit" && candidate.gatePair === pair
  );
  if (!anyExit) {
    eventNote(
      state,
      `The ${color} one-way monolith leads nowhere — no ${color} exit monolith is on the map (a face-down one must be revealed first).`,
      visit.playerId
    );
    return;
  }
  const exits = onewayExitFields(state, pair, visit.fieldId);
  if (exits.length === 0) {
    eventNote(state, `The ${color} one-way monolith fizzles — every ${color} exit is occupied by a hero.`, visit.playerId);
    return;
  }
  if (exits.length === 1) {
    visit.steps.unshift(...onewayTravelSteps(visit, exits[0]));
    return;
  }

  const mode: OnewayExitMode = field.onewayExitMode ?? "certain";
  if (mode === "random") {
    rollOnewayExit(state, visit, exits);
    return;
  }
  if (mode === "certain") {
    visit.steps.unshift({
      type: "CHOOSE_ONE",
      prompt: `${color.charAt(0).toUpperCase()}${color.slice(1)} one-way monolith — choose the exit`,
      teleport: { kind: "oneway", pair },
      options: exits.map((exit) => ({
        label: onewayExitLabel(state, exit),
        steps: onewayTravelSteps(visit, exit)
      }))
    });
    return;
  }

  // "mix": always-pickable exits are offered up front; the rest are the random
  // pool behind a single "roll" option. Degenerates gracefully: all-always =
  // certain, none-always = random.
  const always = exits.filter((exit) => exit.onewayAlwaysPickable);
  const randomPool = exits.filter((exit) => !exit.onewayAlwaysPickable);
  if (always.length === 0) {
    rollOnewayExit(state, visit, exits);
    return;
  }
  const options = always.map((exit) => ({
    label: onewayExitLabel(state, exit),
    steps: onewayTravelSteps(visit, exit)
  }));
  if (randomPool.length > 0) {
    options.push({
      label: `Roll the die — a random exit (${randomPool.length})`,
      steps: [{ type: "ONEWAY_RANDOM_EXIT", pair, fromSpaceId: visit.fieldId }]
    });
  }
  visit.steps.unshift({
    type: "CHOOSE_ONE",
    prompt: `${color.charAt(0).toUpperCase()}${color.slice(1)} one-way monolith — pick an exit, or roll`,
    teleport: { kind: "oneway", pair },
    options
  });
}

/**
 * The "mix" roll leaf, resolved at CHOICE time so the pick option leaks
 * nothing: roll among the CURRENT free non-always exits (they may have shifted
 * while the choice was open), falling back to every free exit.
 */
function resolveOnewayRandomExit(
  state: GameState,
  visit: PendingVisit,
  pair: 1 | 2 | 3 | 4,
  fromSpaceId: MapSpaceId
): void {
  const exits = onewayExitFields(state, pair, fromSpaceId);
  const pool = exits.filter((exit) => !exit.onewayAlwaysPickable);
  const rollable = pool.length > 0 ? pool : exits;
  if (rollable.length === 0) {
    eventNote(state, `The one-way travel fizzles — every exit is occupied.`, visit.playerId);
    return;
  }
  rollOnewayExit(state, visit, rollable);
}

/** Carves a one-way monolith half onto a materialized field (designer content). */
export function carveOnewayField(
  adventure: AdventureState,
  spaceId: MapSpaceId,
  kind: "oneway_entrance" | "oneway_exit",
  pair: 1 | 2 | 3 | 4,
  extras?: { exitMode?: OnewayExitMode; alwaysPickable?: boolean }
): MapFieldState | null {
  const field = adventure.fields[spaceId];
  if (!field) {
    return null;
  }
  field.location = kind;
  field.gatePair = pair;
  if (kind === "oneway_entrance" && extras?.exitMode) {
    field.onewayExitMode = extras.exitMode;
  }
  if (kind === "oneway_exit" && extras?.alwaysPickable) {
    field.onewayAlwaysPickable = true;
  }
  delete field.difficulty;
  delete field.resource;
  delete field.amount;
  delete field.faction;
  field.blackCube = false;
  field.flagOwnerId = null;
  delete field.extraFlagOwnerIds;
  field.everFlagged = false;
  field.settlementResource = null;
  delete field.grailDiggable;
  delete field.gateToTileId;
  delete field.gateLinkSpaceId;
  delete field.bankId;
  delete field.terrain;
  delete field.whirlpoolNumber;
  return field;
}

/**
 * Monolith/Whirlpool travel into a still-face-down tile: flip it for free and
 * hand its rotation to the traveller, exactly like the Subterranean Gate's
 * reveal-on-entry. The in-flight travel is parked on
 * `adventure.pendingTokenTeleport`; it completes once the traveller places the
 * destination token on the revealed tile (placeMapToken).
 */
function resolveTokenTeleportReveal(
  state: GameState,
  visit: PendingVisit,
  step: Extract<VisitStep, { type: "TOKEN_TELEPORT_REVEAL" }>
): void {
  const adventure = state.adventure;
  const tile = adventure?.tiles[step.tileInstanceId];
  if (
    !adventure ||
    !tile ||
    !tile.faceDown ||
    // A multi-token tile qualifies when ANY queued token matches the travelling
    // kind — and, for a colored Gate, the travelling pair too (the per-color
    // isolation held all the way through the reveal).
    !tilePendingTokens(tile).some(
      (token) => token.kind === step.token && (step.token !== "gate" || token.pair === step.pair)
    )
  ) {
    // The destination vanished between offer and resolution (cannot happen in
    // sequential play; a defensive no-op keeps the visit clean).
    return;
  }

  adventure.pendingTokenTeleport = {
    playerId: visit.playerId,
    heroId: visit.heroId,
    kind: step.token,
    ...(step.pair !== undefined ? { pair: step.pair } : {}),
    fromSpaceId: visit.fieldId,
    destTileInstanceId: tile.id
  };

  // A face-down Ⅱ–Ⅲ tile flipped by the travel obeys the same keep/reroll/pick
  // flip as any other discovery (the hook lives in the reducer, like the
  // Subterranean Gate's). The travel visit is complete, so clear it first.
  if (onMapTileRevealHook && tile.group === "far" && visit.steps.length === 0) {
    adventure.pendingVisit = null;
    onMapTileRevealHook(state, visit.playerId, tile);
    return;
  }

  tile.faceDown = false;
  tile.awaitingRotation = true;
  adventure.pendingTileChoice = {
    tileInstanceId: tile.id,
    playerId: visit.playerId,
    kind: "reveal"
  };
  appendEvent(state, {
    type: "TILE_REVEALED",
    playerId: visit.playerId,
    tileInstanceId: tile.id,
    tileDefId: tile.tileDefId
  });
}

/** Carves a Monolith/Whirlpool Location Token onto a materialized field. */
export function carveMapTokenField(
  adventure: AdventureState,
  spaceId: MapSpaceId,
  kind: MapTokenKind,
  number?: -1 | 0 | 1
): MapFieldState | null {
  const field = adventure.fields[spaceId];
  if (!field) {
    return null;
  }
  // The token overwrites the printed Location (p.35); clear everything tied to
  // the old one so the token behaves as a clean field. A Whirlpool stays open
  // sea (`terrain: "water"` — coastline halts and the naval board still apply);
  // a Monolith is a land structure, and its candidates are land hexes already.
  field.location = kind;
  delete field.difficulty;
  delete field.resource;
  delete field.amount;
  delete field.faction;
  field.blackCube = false;
  field.flagOwnerId = null;
  delete field.extraFlagOwnerIds;
  field.everFlagged = false;
  field.settlementResource = null;
  delete field.grailDiggable;
  delete field.gateToTileId;
  delete field.gateLinkSpaceId;
  delete field.bankId;
  if (kind === "whirlpool") {
    field.terrain = "water";
    if (number !== undefined) {
      field.whirlpoolNumber = number;
    }
  } else {
    delete field.terrain;
    delete field.whirlpoolNumber;
  }
  return field;
}

/**
 * Places a revealed tile's pending Monolith/Whirlpool token on `spaceId` (the
 * placing player's pick, or the lone/auto candidate) and — when this placement
 * was the destination of an in-flight travel — completes that travel: the hero
 * arrives on the fresh token, and a Whirlpool travel then takes its unit toll.
 */
/**
 * Non-interactive drain of a revealed tile's pending-token queue: each token
 * lands on its preferred hex when legal, else the first legal candidate, else
 * is dropped. Used when nobody can be prompted (the placing seat eliminated).
 */
export function autoResolvePendingMapTokens(state: GameState, tile: MapTileState, playerId: PlayerId): void {
  if (tile.faceDown || tile.awaitingRotation) {
    return;
  }
  let pending = tilePendingTokens(tile)[0];
  while (pending) {
    const candidates = tokenPlacementCandidates(state, tile, pending.kind);
    if (candidates.length === 0) {
      dropPendingMapToken(state, tile, playerId);
    } else if (pending.preferredSpaceId && candidates.includes(pending.preferredSpaceId)) {
      placeMapToken(state, tile, pending.preferredSpaceId, playerId);
    } else {
      placeMapToken(state, tile, candidates[0], playerId);
    }
    pending = tilePendingTokens(tile)[0];
  }
}

/**
 * Pops the HEAD of a tile's pending-token queue (multi-token tiles queue on
 * `pendingTokens`; the legacy singular `pendingToken` mirrors the head so old
 * readers/snapshots keep working). Mirrors the Field Override queue shift.
 */
function shiftPendingMapToken(tile: MapTileState): void {
  const queue = tilePendingTokens(tile).slice(1);
  if (queue.length > 0) {
    tile.pendingTokens = queue;
    tile.pendingToken = queue[0];
    return;
  }
  delete tile.pendingTokens;
  delete tile.pendingToken;
}

export function placeMapToken(state: GameState, tile: MapTileState, spaceId: MapSpaceId, playerId: PlayerId): void {
  const adventure = state.adventure;
  const pendingToken = tilePendingTokens(tile)[0];
  const field = adventure?.fields[spaceId];
  if (!adventure || !pendingToken || !field || field.tileInstanceId !== tile.id) {
    return;
  }
  const sacrificed = field.location;
  // A colored Gate token carves its own per-color gate field; a one-way token
  // its entrance/exit; Monolith/Whirlpool carve the network token field. All
  // clear the sacrificed location's trappings.
  if (pendingToken.kind === "gate" && pendingToken.pair !== undefined) {
    carveColoredGateField(adventure, spaceId, pendingToken.pair);
  } else if (
    (pendingToken.kind === "oneway_entrance" || pendingToken.kind === "oneway_exit") &&
    pendingToken.pair !== undefined
  ) {
    carveOnewayField(adventure, spaceId, pendingToken.kind, pendingToken.pair, {
      exitMode: pendingToken.exitMode,
      alwaysPickable: pendingToken.alwaysPickable
    });
    // Bank-style entrance fight: the army still draws at the designed level.
    if (pendingToken.kind === "oneway_entrance" && pendingToken.guard?.level && !pendingToken.guard.units) {
      const carvedEntrance = adventure.fields[spaceId];
      if (carvedEntrance) {
        carvedEntrance.customGuardLevel = pendingToken.guard.level;
      }
    }
  } else if (pendingToken.kind === "monolith" || pendingToken.kind === "whirlpool") {
    carveMapTokenField(adventure, spaceId, pendingToken.kind, pendingToken.number);
  }
  // A designer guard rides the token onto whichever hex it lands on.
  const carvedField = adventure.fields[spaceId];
  if (carvedField) {
    applyCustomGuardToField(carvedField, pendingToken.guard);
  }
  shiftPendingMapToken(tile);
  eventNote(
    state,
    `${eventPlayerName(state, playerId)} places the ${placementTokenLabel(pendingToken)} token${
      sacrificed !== "empty_field" ? ` over the ${locationDefinitionName(sacrificed)}` : ""
    }.`,
    playerId
  );

  const teleport = adventure.pendingTokenTeleport;
  if (
    teleport &&
    teleport.destTileInstanceId === tile.id &&
    // A multi-token tile completes the travel only when the token that matches
    // the travelling kind (and colored pair) is the one just placed — the hero
    // must arrive on ITS network member, never on a sibling token's hex.
    teleport.kind === pendingToken.kind &&
    (teleport.kind !== "gate" || teleport.pair === pendingToken.pair)
  ) {
    adventure.pendingTokenTeleport = null;
    completeMapTokenTeleport(state, teleport, spaceId);
  }
}

/**
 * Drops a revealed tile's pending token when NO field of the tile may legally
 * host it (all seven water/blocked/forbidden — a designed-map corner case).
 * An in-flight travel aiming at it fizzles with the hero staying put.
 */
export function dropPendingMapToken(state: GameState, tile: MapTileState, playerId: PlayerId): void {
  const adventure = state.adventure;
  const pendingToken = tilePendingTokens(tile)[0];
  if (!adventure || !pendingToken) {
    return;
  }
  shiftPendingMapToken(tile);
  eventNote(
    state,
    `The ${placementTokenLabel(pendingToken)} token could not be placed — the revealed tile has no legal field for it — and is removed from the game.`,
    playerId
  );
  const teleport = adventure.pendingTokenTeleport;
  if (
    teleport &&
    teleport.destTileInstanceId === tile.id &&
    // Only the DROPPED token's network loses its destination; a sibling queued
    // token of another kind keeps an in-flight travel of ITS kind alive.
    teleport.kind === pendingToken.kind &&
    (teleport.kind !== "gate" || teleport.pair === pendingToken.pair)
  ) {
    adventure.pendingTokenTeleport = null;
    eventNote(
      state,
      `${eventPlayerName(state, teleport.playerId)}'s ${placementTokenLabel(teleport)} travel fizzles — the hero stays put.`,
      teleport.playerId
    );
  }
}

/** Finishes a travel whose destination tile had to be revealed and placed first. */
function completeMapTokenTeleport(
  state: GameState,
  teleport: NonNullable<AdventureState["pendingTokenTeleport"]>,
  destSpaceId: MapSpaceId
): void {
  const adventure = state.adventure;
  const hero = state.heroes[teleport.heroId];
  const player = state.players[teleport.playerId];
  // The world may have moved on mid-flow (the traveller eliminated, the hero
  // relocated); the travel then simply does not happen.
  if (!adventure || !hero || !player || player.eliminated || hero.spaceId !== teleport.fromSpaceId) {
    return;
  }
  if (heroAtSpace(state, destSpaceId, hero.id)) {
    eventNote(state, `${eventPlayerName(state, teleport.playerId)}'s travel fizzles — the destination is occupied.`, teleport.playerId);
    return;
  }
  const from = hero.spaceId;
  hero.spaceId = destSpaceId;
  appendEvent(state, {
    type: "HERO_MOVED",
    playerId: hero.controllerId,
    heroId: hero.id,
    from,
    to: destSpaceId,
    movementLeft: hero.movementPoints
  });
  commitPopulationOnMove(state, hero.controllerId);
  // Reveal-travel arrival: the just-placed destination token may carry a
  // designed guard — swept aside on arrival like every network exit.
  autoWinArrivalGuard(state, hero.controllerId, adventure.fields[destSpaceId]);
  if (teleport.kind === "whirlpool") {
    const penalty: VisitStep = { type: "WHIRLPOOL_PENALTY" };
    if (adventure.pendingVisit) {
      adventure.pendingVisit.steps.unshift(penalty);
    } else {
      adventure.pendingVisit = { heroId: hero.id, playerId: teleport.playerId, fieldId: destSpaceId, steps: [penalty] };
    }
    processPendingVisit(state);
  }
}

// ---------------------------------------------------------------------------
// Subterranean Gate placement (Stronghold expansion)
// ---------------------------------------------------------------------------

/**
 * Whether a materialized field may be sacrificed to a Subterranean Gate.
 *
 * The token covers whatever Field is closest to the far tile — a Blocked Field,
 * a Mine, even a Town all give way to it (the gate IS the field now). The only
 * things it never lands on are another gate half (each of the token's two
 * halves needs its own hex) and a Monolith/Whirlpool Location Token ("Tokens
 * cannot be placed on other Location Tokens", p.35 — the gate picks another
 * touching hex instead).
 */
function gateMayCoverField(field: MapFieldState | undefined): boolean {
  // A carved Field Override hex counts as a Location Token here too — the
  // override placed BEFORE the gate in the reveal chain; the gate picks
  // another touching hex instead of silently erasing the placed object.
  return (
    field !== undefined &&
    field.location !== "subterranean_gate" &&
    !isMapObjectLocation(field.location) &&
    !isFieldOverrideLocation(field.location)
  );
}

/** A tile is "materialized" once its rotation is locked and its 7 fields exist. */
function tileMaterialized(adventure: AdventureState, tile: MapTileState): boolean {
  return !tile.faceDown && !tile.awaitingRotation;
}

/** The map hexes a tile occupies (rotation-independent: the same 7 hexes). */
function tileHexes(tile: MapTileState): HexCoord[] {
  return tileFootprint({ row: tile.centerRow, col: tile.centerCol }, 0);
}

/** The ring hexes (slots 1-6, i.e. not the centre) of a tile, as space ids. */
function tileRingSpaceIds(tile: MapTileState): MapSpaceId[] {
  return tileHexes(tile).slice(1).map(hexSpaceId);
}

/**
 * Picks the gate hex on `tile` nearest to `towardCenter`: the ring field the
 * player sacrifices (whatever it is — Blocked Field, Mine, Town and all; only an
 * existing gate half is skipped). It must touch the other tile's footprint, so
 * the matching half can sit adjacent on the other side. Ties break on hex id.
 */
function chooseAnchorGateHex(
  adventure: AdventureState,
  tile: MapTileState,
  towardCenter: HexCoord,
  otherTile: MapTileState,
  preferredHex?: MapSpaceId
): MapSpaceId | null {
  const otherHexes = new Set(tileHexes(otherTile).map(hexSpaceId));
  const candidates = tileRingSpaceIds(tile).filter((spaceId) => {
    if (!gateMayCoverField(adventure.fields[spaceId])) {
      return false;
    }
    const coord = parseHexSpaceId(spaceId);
    return coord !== null && hexNeighbors(coord).some((neighbor) => otherHexes.has(hexSpaceId(neighbor)));
  });
  // The player's pick-on-reveal choice wins when it is a legal candidate; else
  // fall back to the nearest hex (the deterministic default).
  if (preferredHex && candidates.includes(preferredHex)) {
    return preferredHex;
  }
  return pickNearestHex(candidates, towardCenter);
}

/** The Surface ring hexes that touch `otherTile` and can host an anchor gate. */
function anchorGateHexCandidates(adventure: AdventureState, tile: MapTileState, otherTile: MapTileState): MapSpaceId[] {
  const otherHexes = new Set(tileHexes(otherTile).map(hexSpaceId));
  return tileRingSpaceIds(tile).filter((spaceId) => {
    if (!gateMayCoverField(adventure.fields[spaceId])) {
      return false;
    }
    const coord = parseHexSpaceId(spaceId);
    return coord !== null && hexNeighbors(coord).some((neighbor) => otherHexes.has(hexSpaceId(neighbor)));
  });
}

/**
 * Picks the entrance hex on `tile` adjacent to an already-placed gate half at
 * `gateSpaceId`. Only coverable ring hexes that physically touch the gate hex
 * qualify, so the two halves end up edge-to-edge ("one Field"). Nearest to the
 * gate wins, ties on hex id.
 */
function chooseAdjacentGateHex(
  adventure: AdventureState,
  tile: MapTileState,
  gateSpaceId: MapSpaceId,
  preferredHex?: MapSpaceId
): MapSpaceId | null {
  const candidates = adjacentGateHexCandidates(adventure, tile, gateSpaceId);
  if (preferredHex && candidates.includes(preferredHex)) {
    return preferredHex;
  }
  const gateCoord = parseHexSpaceId(gateSpaceId);
  return gateCoord ? pickNearestHex(candidates, gateCoord) : null;
}

/** The ring hexes on `tile` edge-adjacent to `gateSpaceId` that can host a half. */
function adjacentGateHexCandidates(adventure: AdventureState, tile: MapTileState, gateSpaceId: MapSpaceId): MapSpaceId[] {
  const gateCoord = parseHexSpaceId(gateSpaceId);
  if (!gateCoord) {
    return [];
  }
  return tileRingSpaceIds(tile).filter((spaceId) => {
    if (!gateMayCoverField(adventure.fields[spaceId])) {
      return false;
    }
    const coord = parseHexSpaceId(spaceId);
    return coord !== null && hexDistance(coord, gateCoord) === 1;
  });
}

/** Closest space id to `target` (Manhattan hex distance), ties broken by id. */
function pickNearestHex(candidates: MapSpaceId[], target: HexCoord): MapSpaceId | null {
  let best: MapSpaceId | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const spaceId of candidates) {
    const coord = parseHexSpaceId(spaceId);
    if (!coord) {
      continue;
    }
    const distance = hexDistance(coord, target);
    if (distance < bestDistance || (distance === bestDistance && (best === null || spaceId < best))) {
      best = spaceId;
      bestDistance = distance;
    }
  }
  return best;
}

/** Turns a materialized field into one half of a Subterranean Gate Token. */
function carveGateField(adventure: AdventureState, spaceId: MapSpaceId, toTileId: string): MapFieldState | null {
  const field = adventure.fields[spaceId];
  if (!field) {
    return null;
  }
  // Sacrifice the slot: the printed Location is overwritten by the gate. Clear
  // everything tied to the old Location so the gate behaves as a clean field.
  field.location = "subterranean_gate";
  field.gateToTileId = toTileId;
  delete field.difficulty;
  delete field.resource;
  delete field.amount;
  delete field.faction;
  delete field.terrain;
  field.blackCube = false;
  field.flagOwnerId = null;
  delete field.extraFlagOwnerIds;
  field.everFlagged = false;
  field.settlementResource = null;
  delete field.grailDiggable;
  return field;
}

/** The gate half already carved on `tile` pointing at `towardTileId`, if any. */
function findGateHalf(adventure: AdventureState, tile: MapTileState, towardTileId: string): MapFieldState | null {
  for (const spaceId of tileRingSpaceIds(tile)) {
    const field = adventure.fields[spaceId];
    if (field && field.location === "subterranean_gate" && field.gateToTileId === towardTileId) {
      return field;
    }
  }
  return null;
}

/**
 * The gate half a DESIGNER plan owns on `tile` toward `towardTileId`. Unlike
 * {@link findGateHalf} (which finds ANY half toward a partner — fine for the
 * one-gate-per-tile auto/player pairings) this disambiguates when SEVERAL designer
 * gates bridge the SAME two tiles: it prefers the half sitting on the plan's own
 * pinned hex, and otherwise returns the first half toward the partner NOT already
 * `claimed` by an earlier plan in this recompute. That keeps each designer gate
 * bound to its own half — reused idempotently on re-runs, never grabbing a
 * sibling's or double-carving.
 */
function findDesignedGateHalf(
  adventure: AdventureState,
  tile: MapTileState,
  towardTileId: string,
  pinnedHex: MapSpaceId | undefined,
  claimed: ReadonlySet<MapSpaceId>
): MapFieldState | null {
  if (pinnedHex) {
    const pinned = adventure.fields[pinnedHex];
    if (pinned && pinned.location === "subterranean_gate" && pinned.gateToTileId === towardTileId && !claimed.has(pinnedHex)) {
      return pinned;
    }
  }
  for (const spaceId of tileRingSpaceIds(tile)) {
    if (claimed.has(spaceId)) {
      continue;
    }
    const field = adventure.fields[spaceId];
    if (field && field.location === "subterranean_gate" && field.gateToTileId === towardTileId) {
      return field;
    }
  }
  return null;
}

/**
 * Whether `tile` already carries a Subterranean Gate half pointing at some tile
 * OTHER than `allowedToTileId`. ONE GATE PER TILE (BINH house rule): a single
 * map tile hosts at most one Subterranean Gate Token half, so a tile that
 * already opened a gate to one neighbour can never accept a second to another —
 * the extra gate is simply never carved. (`allowedToTileId` is the partner of
 * the pair currently being placed, so an idempotent re-run of the SAME pair
 * isn't blocked by its own half.)
 */
function tileHasGateTowardOther(adventure: AdventureState, tile: MapTileState, allowedToTileId: string): boolean {
  for (const spaceId of tileRingSpaceIds(tile)) {
    const field = adventure.fields[spaceId];
    if (field && field.location === "subterranean_gate" && field.gateToTileId !== allowedToTileId) {
      return true;
    }
  }
  return false;
}

/**
 * Ensures the Subterranean Gate Token bridging one Surface tile and one
 * adjacent Subterranean tile exists, placing whatever halves the discovered
 * tiles allow:
 *
 *  - On the materialized tile, the gate is the ring field nearest the other
 *    tile (the "1 slot closest to the [other] tile") — whatever sits there is
 *    sacrificed, even a Blocked Field, Mine or Town.
 *  - The matching half on the second tile is the ring field nearest that gate
 *    once the second tile is revealed (so it is sacrificed "when open, … the
 *    nearest hex"). Materialization happens only after the player has locked
 *    the rotation, which is why "rotate first, then sacrifice" holds.
 *  - When both halves exist and sit edge-to-edge they are linked, opening the
 *    one crossable Surface↔Subterranean edge.
 *
 * Idempotent: re-running never moves or duplicates an existing half.
 */
function ensureSubterraneanGate(
  adventure: AdventureState,
  surface: MapTileState,
  subterranean: MapTileState,
  plan?: SubterraneanGatePlan,
  claimed?: Set<MapSpaceId>
): void {
  // A DESIGNER plan may be one of SEVERAL bridging this same tile pair, so its
  // half is identified by the plan's own pinned hex (via `claimed`), not by the
  // partner alone. Every other caller (auto pass, player pick-on-reveal) keeps
  // one gate per tile, so the partner-keyed lookup is unambiguous for them.
  const claimedHexes: ReadonlySet<MapSpaceId> = claimed ?? EMPTY_MAP_SPACE_SET;
  let surfaceHalf = plan?.designed
    ? findDesignedGateHalf(adventure, surface, subterranean.id, plan.gateHex, claimedHexes)
    : findGateHalf(adventure, surface, subterranean.id);
  let undergroundHalf = plan?.designed
    ? findDesignedGateHalf(adventure, subterranean, surface.id, plan.entranceHex, claimedHexes)
    : findGateHalf(adventure, subterranean, surface.id);
  const surfaceUp = tileMaterialized(adventure, surface);
  const undergroundUp = tileMaterialized(adventure, subterranean);

  // ONE GATE PER TILE: if either tile already hosts a gate to a DIFFERENT
  // neighbour, this pair is never carved — neither a second surface gate nor an
  // orphan underground entrance. A tile commits to the first gate it gets; any
  // further underground neighbours just stay sealed behind the impassable layer
  // divide. (Skipping the whole pair, not just one half, avoids leaving a dead
  // gate field with no crossable partner.)
  //
  // A DESIGNER-committed link BYPASSES the cap: the designer explicitly owns this
  // tile's gating, so a cavern linked to several Surface tiles hosts one half per
  // link (each on a distinct hex — `gateMayCoverField` refuses an already-carved
  // gate hex, so a collision just drops the extra half rather than double-booking).
  if (
    !plan?.designed &&
    ((!surfaceHalf && tileHasGateTowardOther(adventure, surface, subterranean.id)) ||
      (!undergroundHalf && tileHasGateTowardOther(adventure, subterranean, surface.id)))
  ) {
    return;
  }

  // Carve the surface gate: adjacent to the underground half if it is already
  // placed, otherwise the slot closest to the underground tile's centre. A plan's
  // `gateHex` (pick-on-reveal) overrides the default when it is a legal candidate.
  if (!surfaceHalf && surfaceUp) {
    const spaceId = undergroundHalf
      ? chooseAdjacentGateHex(adventure, surface, undergroundHalf.spaceId, plan?.gateHex)
      : chooseAnchorGateHex(adventure, surface, { row: subterranean.centerRow, col: subterranean.centerCol }, subterranean, plan?.gateHex);
    if (spaceId) {
      surfaceHalf = carveGateField(adventure, spaceId, subterranean.id);
      // Designer guard on the surface half — stamped ONLY at first carve, so a
      // later recompute never respawns a beaten guard.
      if (surfaceHalf) {
        applyCustomGuardToField(surfaceHalf, plan?.gateGuard);
      }
    }
  }

  // Carve the underground entrance: adjacent to the surface gate if it exists,
  // otherwise (bootstrapping from below) the slot closest to the surface tile.
  // A plan's `entranceHex` (the player's "path up" pick) overrides the default.
  if (!undergroundHalf && undergroundUp) {
    const spaceId = surfaceHalf
      ? chooseAdjacentGateHex(adventure, subterranean, surfaceHalf.spaceId, plan?.entranceHex)
      : chooseAnchorGateHex(adventure, subterranean, { row: surface.centerRow, col: surface.centerCol }, surface, plan?.entranceHex);
    if (spaceId) {
      undergroundHalf = carveGateField(adventure, spaceId, surface.id);
      // Designer guard on the cavern half — first carve only (see above).
      if (undergroundHalf) {
        applyCustomGuardToField(undergroundHalf, plan?.entranceGuard);
      }
    }
  }

  // Link the two halves once both exist and are edge-to-edge.
  if (surfaceHalf && undergroundHalf) {
    const a = parseHexSpaceId(surfaceHalf.spaceId);
    const b = parseHexSpaceId(undergroundHalf.spaceId);
    if (a && b && hexDistance(a, b) === 1) {
      surfaceHalf.gateLinkSpaceId = undergroundHalf.spaceId;
      undergroundHalf.gateLinkSpaceId = surfaceHalf.spaceId;
    }
  }

  // Reserve THIS designer plan's halves so a sibling plan bridging the same tile
  // pair carves its OWN gate on a different hex instead of reusing/overwriting.
  if (claimed) {
    if (surfaceHalf) {
      claimed.add(surfaceHalf.spaceId);
    }
    if (undergroundHalf) {
      claimed.add(undergroundHalf.spaceId);
    }
  }
}

/** A shared empty set for the non-designer gate carve (no per-plan hex reservation). */
const EMPTY_MAP_SPACE_SET: ReadonlySet<MapSpaceId> = new Set<MapSpaceId>();

/**
 * Places/links every Subterranean Gate Token implied by the current layout: one
 * for each pair of TOUCHING tiles that straddle the Surface↔Subterranean divide.
 * Safe to call after any tile is materialized and after setup; it only ever adds
 * the halves a discovery now permits.
 *
 * "Touching" ({@link tileFootprintsTouch}), not the stricter gapless interlock
 * ({@link tileCentersAdjacent}): a Gate needs only a single edge-adjacent hex
 * pair to bridge the two layers, so any hand-placed cavern that visibly abuts a
 * Surface tile gets its gate — even on the 12 offsets that share an edge but
 * leave a hole elsewhere. Pairs are tried interlocking-first so that when a
 * Surface tile abuts several caverns (one-gate-per-tile), the gapless neighbour
 * wins the single gate over a merely-touching one.
 */
export function recomputeSubterraneanGates(adventure: AdventureState): void {
  const plans = adventure.gatePlans ?? [];
  // A tile named in a plan is COMMITTED to its plan partner(s): it can gate with
  // those partners alone, so the auto pass never pairs it with anyone else. A
  // player pick-on-reveal plan commits a tile to exactly one partner; a DESIGNER
  // link may commit one cavern to SEVERAL Surface tiles, so the commitment is a
  // Set, not a single partner.
  const committedPartner = new Map<string, Set<string>>();
  const commit = (tileId: string, partnerId: string): void => {
    (committedPartner.get(tileId) ?? committedPartner.set(tileId, new Set()).get(tileId)!).add(partnerId);
  };
  for (const plan of plans) {
    commit(plan.surfaceTileId, plan.undergroundTileId);
    commit(plan.undergroundTileId, plan.surfaceTileId);
  }

  // 1) Carve the committed (planned) pairs first, at their chosen hexes, so a
  //    committed pairing always wins the one-gate-per-tile race — and a designed
  //    link's extra halves are carved before the auto pass touches anything. A
  //    SHARED `claimed` set lets SEVERAL designer gates bridging the SAME tile pair
  //    each take their own hex (a sibling never reuses an earlier plan's half).
  const claimed = new Set<MapSpaceId>();
  for (const plan of plans) {
    const surface = adventure.tiles[plan.surfaceTileId];
    const subterranean = adventure.tiles[plan.undergroundTileId];
    if (surface && subterranean) {
      ensureSubterraneanGate(adventure, surface, subterranean, plan, claimed);
    }
  }

  // 2) Auto pass for every uncommitted touching pair. A tile with ANY commitment
  //    (player OR designer) is skipped — the designer who links a cavern owns its
  //    gating, and a player who chose a pairing keeps it.
  const tiles = Object.values(adventure.tiles);
  const surfaces = tiles.filter((tile) => tileLayer(tile) === "surface");
  const caverns = tiles.filter((tile) => tileLayer(tile) === "subterranean");
  const pairs: { surface: MapTileState; subterranean: MapTileState; interlocking: boolean }[] = [];
  for (const surface of surfaces) {
    if (committedPartner.has(surface.id)) {
      continue;
    }
    const surfaceCenter = { row: surface.centerRow, col: surface.centerCol };
    for (const subterranean of caverns) {
      if (committedPartner.has(subterranean.id)) {
        continue;
      }
      const cavernCenter = { row: subterranean.centerRow, col: subterranean.centerCol };
      if (!tileFootprintsTouch(surfaceCenter, cavernCenter)) {
        continue;
      }
      pairs.push({ surface, subterranean, interlocking: tileCentersAdjacent(surfaceCenter, cavernCenter) });
    }
  }
  // One-gate-per-tile resolves in this order, so offer the gapless interlocking
  // pairs first (a merely-touching pair only claims a tile no interlocking
  // neighbour wanted), then break ties by tile centre. This is the SAME order as
  // planSubterraneanGates, so the designer's gate preview matches what carves
  // here exactly — even when a tile abuts several caverns.
  pairs.sort(
    (left, right) =>
      Number(right.interlocking) - Number(left.interlocking) ||
      left.surface.centerRow - right.surface.centerRow ||
      left.surface.centerCol - right.surface.centerCol ||
      left.subterranean.centerRow - right.subterranean.centerRow ||
      left.subterranean.centerCol - right.subterranean.centerCol
  );
  for (const pair of pairs) {
    ensureSubterraneanGate(adventure, pair.surface, pair.subterranean);
  }

  // 3) Clean up orphaned halves: an UNLINKED gate half whose partner tile has
  //    since committed (by a plan) to a DIFFERENT tile leads nowhere — the player
  //    picked another connection. Revert it to plain land so no dead gate lingers.
  removeOrphanGateHalves(adventure, committedPartner);
}

/**
 * Reverts any UNLINKED Subterranean Gate half that points at a tile now committed
 * (by a plan) to a different partner. Linked halves (a completed crossing) are
 * never touched. Used after the plan/auto passes so a player who re-routes a
 * cavern's connection to another Surface tile leaves no orphan gate behind.
 */
function removeOrphanGateHalves(adventure: AdventureState, committedPartner: Map<string, Set<string>>): void {
  for (const field of Object.values(adventure.fields)) {
    if (field.location !== "subterranean_gate" || field.gateLinkSpaceId || !field.gateToTileId) {
      continue;
    }
    // The partner tile this half points at has committed to a set of partners; if
    // that set is non-empty and does NOT include this half's own tile, the half
    // leads nowhere (the partner picked other connections) — revert it to land.
    const partnerCommittedTo = committedPartner.get(field.gateToTileId);
    if (partnerCommittedTo && partnerCommittedTo.size > 0 && !partnerCommittedTo.has(field.tileInstanceId)) {
      field.location = "empty_field";
      delete field.gateToTileId;
      delete field.gateLinkSpaceId;
    }
  }
}

/** Whether `tile` already hosts a Subterranean Gate half (toward any partner). */
function tileHasAnyGateHalf(adventure: AdventureState, tile: MapTileState): boolean {
  return tileRingSpaceIds(tile).some((spaceId) => adventure.fields[spaceId]?.location === "subterranean_gate");
}

/**
 * The pick-on-reveal placement OPTIONS a freshly-revealed tile creates: every
 * legal hex its single Subterranean Gate half could sacrifice, across every
 * eligible partner on the other layer. Each candidate carves ONE half on
 * `revealedTile` — the Surface "gate" or the cavern "entrance" — and names the
 * pair it completes:
 *
 *  - Anchor: the partner has no half yet (it is still face-down, or open but
 *    ungated) → the half may sit on ANY of `revealedTile`'s hexes that touch the
 *    partner.
 *  - Completing: the partner already has its half (auto-carved at setup, or chosen
 *    earlier) → the half must sit edge-adjacent to it, so the two link.
 *
 * A tile already carrying a half returns nothing (one gate per tile). A tile /
 * partner committed by a plan is restricted to that pairing. The reducer offers a
 * choice when ≥2 candidates exist (which hex; which of two Surface tiles a cavern
 * joins), else auto-carves the lone candidate. This is a read-only preview — it
 * carves nothing.
 */
export function planGateChoiceForReveal(
  adventure: AdventureState,
  revealedTile: MapTileState
): SubterraneanGateChoiceCandidate[] {
  // One gate per tile: a tile that already hosts a half offers no further choice.
  if (tileHasAnyGateHalf(adventure, revealedTile)) {
    return [];
  }
  // tileLayer buckets every tile as "surface" or "subterranean" (sea tiles ride
  // the surface layer), matching how recomputeSubterraneanGates pairs them, so a
  // choice is only ever offered for what the carve would actually produce.
  const revealedLayer = tileLayer(revealedTile);
  const plans = adventure.gatePlans ?? [];
  // A tile may be committed to SEVERAL partners (a designer cavern linked to two
  // Surface tiles); the commitment is a Set, so a reveal is restricted to any of
  // its designed partners rather than a single one.
  const committedPartner = new Map<string, Set<string>>();
  const commit = (tileId: string, partnerId: string): void => {
    (committedPartner.get(tileId) ?? committedPartner.set(tileId, new Set()).get(tileId)!).add(partnerId);
  };
  for (const plan of plans) {
    commit(plan.surfaceTileId, plan.undergroundTileId);
    commit(plan.undergroundTileId, plan.surfaceTileId);
  }
  const revealedCommittedTo = committedPartner.get(revealedTile.id);

  const revealedCenter = { row: revealedTile.centerRow, col: revealedTile.centerCol };
  const candidates: SubterraneanGateChoiceCandidate[] = [];
  for (const other of Object.values(adventure.tiles)) {
    if (tileLayer(other) === revealedLayer) {
      continue; // the gate bridges the Surface↔Subterranean divide only
    }
    if (!tileFootprintsTouch(revealedCenter, { row: other.centerRow, col: other.centerCol })) {
      continue;
    }
    // Respect existing commitments: a committed tile only pairs with a partner it
    // is committed to.
    if (revealedCommittedTo && !revealedCommittedTo.has(other.id)) {
      continue;
    }
    const otherCommittedTo = committedPartner.get(other.id);
    if (otherCommittedTo && !otherCommittedTo.has(revealedTile.id)) {
      continue;
    }
    const surfaceTileId = revealedLayer === "surface" ? revealedTile.id : other.id;
    const undergroundTileId = revealedLayer === "surface" ? other.id : revealedTile.id;
    const role: "gate" | "entrance" = revealedLayer === "surface" ? "gate" : "entrance";
    // A DESIGNER link that already pins THIS half's hex is the designer's decision,
    // not a player choice: skip it so no pick-on-reveal choice opens — the auto
    // carve then honours the pinned hex (`recomputeSubterraneanGates` reads the
    // plan). A designed pairing whose hex is UNPINNED still offers the hexes below,
    // but the commitment filter above already constrains it to the designed partner.
    const designedPlan = plans.find(
      (plan) => plan.designed && plan.surfaceTileId === surfaceTileId && plan.undergroundTileId === undergroundTileId
    );
    if (designedPlan && (role === "gate" ? designedPlan.gateHex : designedPlan.entranceHex)) {
      continue;
    }
    // The partner's own half toward us, if it already exists (auto or chosen).
    const otherHalf = findGateHalf(adventure, other, revealedTile.id);
    const hexes = otherHalf
      ? adjacentGateHexCandidates(adventure, revealedTile, otherHalf.spaceId)
      : anchorGateHexCandidates(adventure, revealedTile, other);
    for (const hex of hexes) {
      candidates.push({ surfaceTileId, undergroundTileId, hex, role });
    }
  }
  return candidates;
}

/**
 * Records a player's pick-on-reveal Subterranean Gate choice: it fills the
 * chosen hex into the (Surface tile ↔ cavern) plan — creating the plan if this is
 * the first half chosen for the pair. A later {@link recomputeSubterraneanGates}
 * then carves the player's hex and pairing. Returns the mutated adventure's plan
 * list for convenience.
 */
export function upsertGatePlan(adventure: AdventureState, candidate: SubterraneanGateChoiceCandidate): SubterraneanGatePlan[] {
  const plans = (adventure.gatePlans ??= []);
  let plan = plans.find(
    (existing) =>
      existing.surfaceTileId === candidate.surfaceTileId && existing.undergroundTileId === candidate.undergroundTileId
  );
  if (!plan) {
    plan = { surfaceTileId: candidate.surfaceTileId, undergroundTileId: candidate.undergroundTileId };
    plans.push(plan);
  }
  if (candidate.role === "gate") {
    plan.gateHex = candidate.hex;
  } else {
    plan.entranceHex = candidate.hex;
  }
  return plans;
}

/** A tile placement reduced to what gate planning needs: a centre and a layer. */
export type TilePlacementLike = { row: number; col: number; group: string };

/** One Subterranean Gate a layout implies: which two tiles, and the two hexes. */
export type PlannedSubterraneanGate = {
  surfaceCenter: HexCoord;
  cavernCenter: HexCoord;
  /** The sacrificed hex on the Surface tile (the gate half). */
  gateHex: HexCoord;
  /** The sacrificed hex on the Subterranean tile (the entrance half), edge-adjacent to `gateHex`. */
  entranceHex: HexCoord;
  /**
   * True when this gate comes from a DESIGNER link (a {@link CustomMapGateLink}),
   * false when it is the automatic touch pairing. Lets the designer render the
   * two visually distinct. Never affects the carved hexes.
   */
  designed: boolean;
};

/**
 * A designer-chosen gate link expressed in bare coordinates (what the pure
 * {@link planSubterraneanGates} preview consumes): which Surface / cavern centres
 * it joins, and optionally the exact hex each half sacrifices. Mirrors a cavern's
 * {@link CustomMapGateLink} with the hexes decoded to {@link HexCoord}s.
 */
export type DesignedGateLinkLike = {
  surfaceCenter: HexCoord;
  cavernCenter: HexCoord;
  gateHex?: HexCoord;
  entranceHex?: HexCoord;
};

const isCavernPlacement = (tile: TilePlacementLike): boolean => tile.group === "subterranean";

/**
 * The Surface ring hex nearest `towardCenter` that physically touches
 * `otherFootprintIds` — the same "1 slot closest to the [other] tile" choice the
 * engine carves (minus the field-coverage filter, since a design preview has no
 * materialized fields yet). Ties break on hex id, matching `pickNearestHex`.
 */
function pickTouchingRingHex(
  center: HexCoord,
  towardCenter: HexCoord,
  predicate: (hex: HexCoord) => boolean,
  forbidden?: ReadonlySet<string>
): HexCoord | null {
  let best: HexCoord | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const hex of tileFootprint(center, 0).slice(1)) {
    // Each gate half needs its own hex: a hex already carved by another half (a
    // multi-link cavern) is off-limits, mirroring the engine's `gateMayCoverField`.
    if (forbidden?.has(hexSpaceId(hex)) || !predicate(hex)) {
      continue;
    }
    const distance = hexDistance(hex, towardCenter);
    if (distance < bestDistance || (distance === bestDistance && (best === null || hexSpaceId(hex) < hexSpaceId(best)))) {
      best = hex;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The gate + entrance hexes for a touching Surface/Subterranean pair, or null.
 * `pinned` hexes are honoured when legal (a touching gate hex / an adjacent
 * entrance hex not already used) — the same "preference, else nearest" rule the
 * engine's `chooseAnchorGateHex` / `chooseAdjacentGateHex` apply; `forbidden`
 * holds hexes earlier halves already claimed.
 */
function planGateHexes(
  surfaceCenter: HexCoord,
  cavernCenter: HexCoord,
  options: { pinnedGate?: HexCoord; pinnedEntrance?: HexCoord; forbidden?: ReadonlySet<string> } = {}
): { gateHex: HexCoord; entranceHex: HexCoord } | null {
  const { pinnedGate, pinnedEntrance, forbidden } = options;
  const cavernHexes = new Set(tileFootprint(cavernCenter, 0).map(hexSpaceId));
  const surfaceRing = new Set(tileFootprint(surfaceCenter, 0).slice(1).map(hexSpaceId));
  const cavernRing = new Set(tileFootprint(cavernCenter, 0).slice(1).map(hexSpaceId));
  // A pinned gate hex is honoured only when it is a genuine ring hex of the
  // Surface tile that touches the cavern and is still free — else the nearest
  // legal hex wins (the engine's chooseAnchorGateHex fallback).
  const pinnedGateLegal =
    pinnedGate &&
    surfaceRing.has(hexSpaceId(pinnedGate)) &&
    !forbidden?.has(hexSpaceId(pinnedGate)) &&
    hexNeighbors(pinnedGate).some((neighbor) => cavernHexes.has(hexSpaceId(neighbor)));
  const gateHex = pinnedGateLegal
    ? pinnedGate
    : pickTouchingRingHex(
        surfaceCenter,
        cavernCenter,
        (hex) => hexNeighbors(hex).some((neighbor) => cavernHexes.has(hexSpaceId(neighbor))),
        forbidden
      );
  if (!gateHex) {
    return null;
  }
  const pinnedEntranceLegal =
    pinnedEntrance &&
    cavernRing.has(hexSpaceId(pinnedEntrance)) &&
    !forbidden?.has(hexSpaceId(pinnedEntrance)) &&
    hexDistance(pinnedEntrance, gateHex) === 1;
  const entranceHex = pinnedEntranceLegal
    ? pinnedEntrance
    : pickTouchingRingHex(cavernCenter, gateHex, (hex) => hexDistance(hex, gateHex) === 1, forbidden);
  if (!entranceHex) {
    return null;
  }
  return { gateHex, entranceHex };
}

/**
 * Every legal (surface gate hex ↔ adjacent cavern entrance hex) pair along the
 * shared boundary of a touching Surface/cavern pair — the positions a designer
 * may slide a gate token through. Deterministically ordered (gate hex id, then
 * entrance hex id) so a "cycle to the next position" affordance is stable.
 */
export function legalGateHexPairs(surfaceCenter: HexCoord, cavernCenter: HexCoord): { gateHex: HexCoord; entranceHex: HexCoord }[] {
  const cavernHexes = tileFootprint(cavernCenter, 0).slice(1);
  const cavernHexIds = new Set(tileFootprint(cavernCenter, 0).map(hexSpaceId));
  const pairs: { gateHex: HexCoord; entranceHex: HexCoord }[] = [];
  for (const gateHex of tileFootprint(surfaceCenter, 0).slice(1)) {
    if (!hexNeighbors(gateHex).some((neighbor) => cavernHexIds.has(hexSpaceId(neighbor)))) {
      continue;
    }
    for (const entranceHex of cavernHexes) {
      if (hexDistance(entranceHex, gateHex) === 1) {
        pairs.push({ gateHex, entranceHex });
      }
    }
  }
  pairs.sort(
    (left, right) =>
      hexSpaceId(left.gateHex).localeCompare(hexSpaceId(right.gateHex)) ||
      hexSpaceId(left.entranceHex).localeCompare(hexSpaceId(right.entranceHex))
  );
  return pairs;
}

/**
 * Pure preview of the Subterranean Gates a tile layout produces — the same touch
 * rule, interlocking-first ordering and one-gate-per-tile assignment as
 * {@link recomputeSubterraneanGates}, but driven off bare placements (a centre +
 * a layer) so the map designer can draw the gates and warn about unreachable
 * caverns before any AdventureState exists. A Surface tile and a Subterranean
 * tile each host at most one gate; gapless interlocking pairs are matched first.
 */
export function planSubterraneanGates(
  tiles: ReadonlyArray<TilePlacementLike>,
  designedLinks: ReadonlyArray<DesignedGateLinkLike> = []
): PlannedSubterraneanGate[] {
  const surfaces = tiles.filter((tile) => !isCavernPlacement(tile));
  const caverns = tiles.filter(isCavernPlacement);
  const key = (coord: { row: number; col: number }): string => `${coord.row}:${coord.col}`;
  const findAt = (list: TilePlacementLike[], coord: HexCoord): TilePlacementLike | undefined =>
    list.find((tile) => tile.row === coord.row && tile.col === coord.col);

  // Each gate half needs its own hex, so a multi-link cavern's second entrance
  // must dodge the first — mirrors the engine's global `gateMayCoverField`.
  const usedHexes = new Set<string>();
  // A tile named by a designer link is committed and skipped by the auto pass.
  const committed = new Set<string>();
  const gates: PlannedSubterraneanGate[] = [];

  // 1) Designer links first — in order, at their pinned (or nearest) hexes, so a
  //    cavern linked to several Surface tiles (and the SAME surface several times
  //    at distinct pairs) hosts one half per link, bypassing one-gate-per-tile.
  //    Same order/assignment as `recomputeSubterraneanGates`, and it MIRRORS
  //    validateCustomMapPlan so the designer preview matches the carved map: an
  //    UNPINNED duplicate to a surface already linked unpinned is merged away, and
  //    a PINNED pair reusing an already-claimed hex is dropped (two gates can never
  //    share a board hex).
  const acceptedUnpinned = new Set<string>();
  const claimedPinnedHexes = new Set<string>();
  for (const link of designedLinks) {
    const surface = findAt(surfaces, link.surfaceCenter);
    const cavern = findAt(caverns, link.cavernCenter);
    if (!surface || !cavern || !tileFootprintsTouch(surface, cavern)) {
      continue;
    }
    const gateId = link.gateHex ? hexSpaceId(link.gateHex) : undefined;
    const entranceId = link.entranceHex ? hexSpaceId(link.entranceHex) : undefined;
    if (gateId || entranceId) {
      if ((gateId && claimedPinnedHexes.has(gateId)) || (entranceId && claimedPinnedHexes.has(entranceId))) {
        continue; // (a) pinned collision → dropped, like the validator
      }
    } else {
      const dupKey = `${key(surface)}>${key(cavern)}`;
      if (acceptedUnpinned.has(dupKey)) {
        continue; // (b) unpinned duplicate to the same pairing → merged away
      }
      acceptedUnpinned.add(dupKey);
    }
    committed.add(key(surface));
    committed.add(key(cavern));
    const hexes = planGateHexes(surface, cavern, {
      pinnedGate: link.gateHex,
      pinnedEntrance: link.entranceHex,
      forbidden: usedHexes
    });
    if (!hexes) {
      continue;
    }
    usedHexes.add(hexSpaceId(hexes.gateHex));
    usedHexes.add(hexSpaceId(hexes.entranceHex));
    if (gateId) {
      claimedPinnedHexes.add(gateId);
    }
    if (entranceId) {
      claimedPinnedHexes.add(entranceId);
    }
    gates.push({
      surfaceCenter: { row: surface.row, col: surface.col },
      cavernCenter: { row: cavern.row, col: cavern.col },
      designed: true,
      ...hexes
    });
  }

  // 2) Auto pass for every uncommitted touching pair (a committed tile is fully
  //    the designer's).
  const pairs: { surface: TilePlacementLike; cavern: TilePlacementLike; interlocking: boolean }[] = [];
  for (const surface of surfaces) {
    if (committed.has(key(surface))) {
      continue;
    }
    for (const cavern of caverns) {
      if (committed.has(key(cavern)) || !tileFootprintsTouch(surface, cavern)) {
        continue;
      }
      pairs.push({ surface, cavern, interlocking: tileCentersAdjacent(surface, cavern) });
    }
  }
  pairs.sort(
    (left, right) =>
      Number(right.interlocking) - Number(left.interlocking) ||
      left.surface.row - right.surface.row ||
      left.surface.col - right.surface.col ||
      left.cavern.row - right.cavern.row ||
      left.cavern.col - right.cavern.col
  );

  const usedSurface = new Set<string>();
  const usedCavern = new Set<string>();
  for (const pair of pairs) {
    if (usedSurface.has(key(pair.surface)) || usedCavern.has(key(pair.cavern))) {
      continue;
    }
    const hexes = planGateHexes(pair.surface, pair.cavern, { forbidden: usedHexes });
    if (!hexes) {
      continue;
    }
    usedSurface.add(key(pair.surface));
    usedCavern.add(key(pair.cavern));
    usedHexes.add(hexSpaceId(hexes.gateHex));
    usedHexes.add(hexSpaceId(hexes.entranceHex));
    gates.push({
      surfaceCenter: { row: pair.surface.row, col: pair.surface.col },
      cavernCenter: { row: pair.cavern.row, col: pair.cavern.col },
      designed: false,
      ...hexes
    });
  }
  return gates;
}

/**
 * The Subterranean tiles a layout leaves UNREACHABLE: a cavern is reachable only
 * if some cavern in its touch-connected group abuts a Surface tile (where a gate
 * can carve). A cavern that touches no Surface tile — directly or through a chain
 * of touching caverns — can never be entered, so the designer flags it. (Pure
 * touch graph; it does not model the rare one-gate-per-tile starvation.)
 */
export function unreachableUndergroundCenters(tiles: ReadonlyArray<TilePlacementLike>): HexCoord[] {
  const caverns = tiles.filter(isCavernPlacement);
  const surfaces = tiles.filter((tile) => !isCavernPlacement(tile));
  if (caverns.length === 0) {
    return [];
  }
  // Union-find over caverns linked by touch; a group is reachable if any member
  // abuts a Surface tile.
  const parent = caverns.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) {
      root = parent[root];
    }
    while (parent[index] !== root) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const union = (a: number, b: number): void => {
    parent[find(a)] = find(b);
  };
  for (let i = 0; i < caverns.length; i += 1) {
    for (let j = i + 1; j < caverns.length; j += 1) {
      if (tileFootprintsTouch(caverns[i], caverns[j])) {
        union(i, j);
      }
    }
  }
  const reachableRoots = new Set<number>();
  for (let i = 0; i < caverns.length; i += 1) {
    if (surfaces.some((surface) => tileFootprintsTouch(surface, caverns[i]))) {
      reachableRoots.add(find(i));
    }
  }
  return caverns
    .filter((_, index) => !reachableRoots.has(find(index)))
    .map((cavern) => ({ row: cavern.row, col: cavern.col }));
}

/**
 * Finds an unused Luck reroll for the given adventure die. Basic Luck offers
 * one Treasure and one Resource reroll per turn; Expert Luck offers a single
 * reroll of any die.
 */
function getLuckRerollEffect(
  state: GameState,
  playerId: PlayerId,
  dice: "treasure" | "resource"
): ActiveEffectState | null {
  return (
    state.activeEffects.find((effect) => {
      if (effect.controllerId !== playerId) {
        return false;
      }
      const modifier = effect.modifiers.find(
        (candidate) =>
          candidate.type === "ADVENTURE_DIE_REROLL" && (candidate.dice === dice || candidate.dice === "any")
      );
      if (!modifier || modifier.type !== "ADVENTURE_DIE_REROLL") {
        return false;
      }
      // Fortune: a shared budget of N rerolls across this effect's dice, spent
      // one at a time (tracked as "reroll:" entries in usedChoiceIds).
      if (modifier.rerolls !== undefined) {
        const used = effect.usedChoiceIds.filter((id) => id.startsWith("reroll:")).length;
        return used < modifier.rerolls;
      }
      // Luck: one reroll per die type, tracked separately.
      return !effect.usedChoiceIds.includes(`luck:${dice}`);
    }) ?? null
  );
}

function consumeLuckReroll(state: GameState, effectId: string, dice: "treasure" | "resource"): void {
  const effect = state.activeEffects.find((candidate) => candidate.id === effectId);
  if (!effect) {
    return;
  }

  const budgetModifier = effect.modifiers.find(
    (modifier) => modifier.type === "ADVENTURE_DIE_REROLL" && modifier.rerolls !== undefined
  );

  appendEvent(state, {
    type: "ACTIVE_EFFECT_USED",
    effectId: effect.id,
    playerId: effect.controllerId,
    target: { type: "none" }
  });

  // Fortune: spend one reroll from the shared budget; drop the effect once the
  // budget is exhausted.
  if (budgetModifier?.type === "ADVENTURE_DIE_REROLL" && budgetModifier.rerolls !== undefined) {
    effect.usedChoiceIds.push(`reroll:${effect.usedChoiceIds.length}`);
    const used = effect.usedChoiceIds.filter((id) => id.startsWith("reroll:")).length;
    if (used >= budgetModifier.rerolls) {
      state.activeEffects = state.activeEffects.filter((candidate) => candidate.id !== effectId);
    }
    return;
  }

  // Luck (basic AND expert) lasts the WHOLE player turn: it is never deleted on
  // use here. Each map-die kind may be rerolled once per turn, tracked
  // separately. Expert Luck ("any die") additionally keeps rerolling Attack
  // dice across every fight this turn — handled on the combat side, where its
  // reroll source is not consumed (consumeEffectOnUse: false). The effect only
  // leaves play when the turn ends (expiresAtTurnEndPlayerId).
  effect.usedChoiceIds.push(`luck:${dice}`);
}

/**
 * Cards of Prophecy ("Set a Resource die or Treasure die on the side of your
 * choice"): finds an unused die-set effect that covers this die kind. Like the
 * single-use "any" Luck reroll, one effect grants exactly one set, so any
 * matching effect that still exists is available.
 */
function getDieSetEffect(state: GameState, playerId: PlayerId, dice: "treasure" | "resource"): ActiveEffectState | null {
  return (
    state.activeEffects.find(
      (effect) =>
        effect.controllerId === playerId &&
        effect.modifiers.some(
          (modifier) => modifier.type === "ADVENTURE_DIE_SET" && (modifier.dice === dice || modifier.dice === "any")
        )
    ) ?? null
  );
}

/** Spends a die-set effect: it is a single use, so the whole effect is removed. */
function consumeDieSet(state: GameState, effectId: string): void {
  const effect = state.activeEffects.find((candidate) => candidate.id === effectId);
  if (!effect) {
    return;
  }
  appendEvent(state, {
    type: "ACTIVE_EFFECT_USED",
    effectId: effect.id,
    playerId: effect.controllerId,
    target: { type: "none" }
  });
  state.activeEffects = state.activeEffects.filter((candidate) => candidate.id !== effectId);
}

/**
 * "Set a Resource die on the side of your choice": one option per distinct
 * Resource-die face. Choosing it spends the die-set effect, then gains exactly
 * that face's resources — overriding whatever was rolled.
 */
function setResourceDieOptions(setEffect: ActiveEffectState): { label: string; steps: VisitStep[] }[] {
  // Offer one option per DISTINCT face. The house-rule die has two "1 valuable"
  // faces, so dedupe (like the Treasure-die "set" options) to avoid two identical
  // picks.
  const seen = new Set<string>();
  const distinctFaces = RESOURCE_DIE_FACES.filter((face) => {
    const key = `${face.resource}:${face.amount}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  return distinctFaces.map((face) => ({
    label: `${setEffect.name}: set the Resource die to ${resourceDieLabel(face)}`,
    steps: [
      { type: "CONSUME_DIE_SET", effectId: setEffect.id } as VisitStep,
      { type: "GAIN_RESOURCES", [face.resource]: face.amount } as VisitStep
    ]
  }));
}

/**
 * "Set a Treasure die on the side of your choice": one option per distinct
 * Treasure-die face (the deduped face list, since Experience and the Artifact
 * Search each appear twice on the physical die). Choosing it spends the die-set
 * effect, then resolves that face — overriding whatever was rolled.
 */
function setTreasureDieOptions(setEffect: ActiveEffectState): { label: string; steps: VisitStep[] }[] {
  return [...new Set(TREASURE_DIE_FACES)].map((face) => ({
    label: `${setEffect.name}: set the Treasure die to ${treasureFaceLabel(face)}`,
    steps: [{ type: "CONSUME_DIE_SET", effectId: setEffect.id } as VisitStep, ...treasureFaceSteps(face)]
  }));
}

/**
 * Positive Morale "Reroll a die." (optional Morale Cards rule): with the rule
 * on, morale cards REPLACE the ±1 token — and the token's "Reroll any Die you
 * have thrown" action covers the map dice — so the held card is offered on the
 * same player-thrown map dice: the Resource/Treasure windows AND the map-side
 * Attack-die branch rolls (Scholar, Sea Chest/Jetsam). Playing it resolves the
 * card (back under its deck). Deliberately NOT offered on the Obelisk die (its
 * face locks once for every visitor — a shared reveal, not the holder's own
 * throw) nor the Satyr/Leprechaun-style specific-face gambles, matching the
 * documented map-side exclusions of the negative die curses.
 */
function moraleRerollCardOption(
  state: GameState,
  playerId: PlayerId,
  dieLabel: string,
  rollStep: VisitStep
): { label: string; steps: VisitStep[] } | null {
  if (!playerHoldsMoraleCard(state, playerId, MORALE_CARD_IDS.rerollDie)) {
    return null;
  }
  const cardName = cardLibrary[MORALE_CARD_IDS.rerollDie]?.name ?? "Positive Morale: Reroll a Die";
  return {
    label: `Play ${cardName}: reroll ${dieLabel}`,
    steps: [{ type: "CONSUME_MORALE_CARD", cardId: MORALE_CARD_IDS.rerollDie } as VisitStep, rollStep]
  };
}

/**
 * Optional rerolls of an adventure die beyond Luck: the positive morale token
 * ("Reroll any Die you have thrown") and the Swift Weasel Astrologers card
 * (one free Treasure/Resource reroll per turn).
 */
function extraDieRerollOptions(
  state: GameState,
  visit: PendingVisit,
  dice: "treasure" | "resource",
  count: number
): { label: string; steps: VisitStep[] }[] {
  const rollStep: VisitStep =
    dice === "resource" ? { type: "ROLL_RESOURCE_DICE", count } : { type: "ROLL_TREASURE_DICE", count };
  const options: { label: string; steps: VisitStep[] }[] = [];

  const astrologers = state.adventure?.astrologers;
  const weaselActive = getActiveAstrologersCard(state)?.effect.type === "DIE_REROLL_PER_TURN";
  if (weaselActive && astrologers && !astrologers.swiftWeaselUsedBy.includes(visit.playerId)) {
    options.push({
      label: `Swift Weasel: reroll the ${dice} ${count > 1 ? "dice" : "die"} (free, once per turn)`,
      steps: [{ type: "CONSUME_WEASEL" }, rollStep]
    });
  }

  if ((state.players[visit.playerId]?.morale ?? 0) > 0) {
    options.push({
      label: `Spend morale: reroll the ${dice} ${count > 1 ? "dice" : "die"}`,
      steps: [{ type: "CONSUME_MORALE" }, rollStep]
    });
  }

  // Morale Cards rule: the held "Reroll a Die" card stands in for the token
  // reroll above (the token count stays 0 while the rule is on).
  const rerollCard = moraleRerollCardOption(
    state,
    visit.playerId,
    `the ${dice} ${count > 1 ? "dice" : "die"}`,
    rollStep
  );
  if (rerollCard) {
    options.push(rerollCard);
  }

  // Diplomat's Ring / Ambassador's Sash: their "Reroll a die" half is an instant
  // played in reaction to the roll you just saw — offer it from hand here, one
  // offer per distinct held copy. Taking it discards the artifact, then re-rolls.
  const hand = state.players[visit.playerId]?.hand ?? [];
  for (const cardId of REROLL_REACTION_ARTIFACT_IDS) {
    if (hand.includes(cardId)) {
      options.push({
        label: `Play ${cardLibrary[cardId]?.name ?? cardId}: reroll the ${dice} ${count > 1 ? "dice" : "die"}`,
        steps: [{ type: "CONSUME_REROLL_ARTIFACT", cardId } as VisitStep, rollStep]
      });
    }
  }

  return options;
}

/**
 * Octavia's Gold I ("Play this card after rolling at least 1 Resource die to set
 * 1 Resource die to '6 gold'"): a held-card reaction offered the moment a
 * Resource die is rolled, mirroring the Diplomat's Ring reroll reaction. Taking
 * it discards Octavia's Gold I from hand, then gains 6 gold — overriding the
 * rolled face. (The card's other half — "Draw 1 card" — is its normal play, so
 * the card itself encodes only that option.)
 */
const OCTAVIA_GOLD_REACTION_CARD_ID = "specialty.octavia.1";
function octaviaGoldReactionOption(
  state: GameState,
  visit: PendingVisit
): { label: string; steps: VisitStep[] } | null {
  const hand = state.players[visit.playerId]?.hand ?? [];
  if (!hand.includes(OCTAVIA_GOLD_REACTION_CARD_ID)) {
    return null;
  }
  const label = "Gold I: set this Resource die to 6 gold";
  return {
    label,
    steps: [
      { type: "CONSUME_HELD_CARD", cardId: OCTAVIA_GOLD_REACTION_CARD_ID, optionLabel: label },
      { type: "GAIN_RESOURCES", gold: 6 }
    ]
  };
}

function resourceDieLabel(roll: { resource: ResourceKind; amount: number }): string {
  const name =
    roll.resource === "buildingMaterials" ? "materials" : roll.resource === "valuables" ? "valuables" : "gold";
  return `${roll.amount} ${name}`;
}

function rollResourceDice(state: GameState, visit: PendingVisit, count: number): void {
  const random = adventureRandom(state, "resource-die");
  const rolls = Array.from({ length: count }, () => RESOURCE_DIE_FACES[random.nextInt(0, RESOURCE_DIE_FACES.length - 1)]);

  appendEvent(state, {
    type: "ADVENTURE_DICE_ROLLED",
    playerId: visit.playerId,
    dice: "resource",
    results: rolls.map(resourceDieLabel),
    resourceRolls: rolls.map((roll) => ({ resource: roll.resource, amount: roll.amount }))
  });

  const luck = getLuckRerollEffect(state, visit.playerId, "resource");
  const extraOptions = extraDieRerollOptions(state, visit, "resource", count);
  const setEffect = getDieSetEffect(state, visit.playerId, "resource");
  const octaviaOption = octaviaGoldReactionOption(state, visit);

  if (rolls.length === 1 && !luck && extraOptions.length === 0 && !setEffect && !octaviaOption) {
    gainResources(state, visit.playerId, { [rolls[0].resource]: rolls[0].amount }, "resource die");
    return;
  }

  const options = rolls.map((roll) => ({
    label: resourceDieLabel(roll),
    steps: [{ type: "GAIN_RESOURCES", [roll.resource]: roll.amount } as VisitStep]
  }));

  if (luck) {
    options.push({
      label: `${luck.name}: reroll the Resource ${count > 1 ? "dice" : "die"}`,
      steps: [
        { type: "CONSUME_LUCK", effectId: luck.id, dice: "resource" } as VisitStep,
        { type: "ROLL_RESOURCE_DICE", count } as VisitStep
      ]
    });
  }
  options.push(...extraOptions);
  // Cards of Prophecy: ignore the roll and set the Resource die to a face of
  // your choice (the whole die-set effect is spent on the chosen option).
  if (setEffect) {
    options.push(...setResourceDieOptions(setEffect));
  }
  // Octavia's Gold I: discard it to set one rolled Resource die to "6 gold".
  if (octaviaOption) {
    options.push(octaviaOption);
  }

  visit.steps.unshift({
    type: "CHOOSE_ONE",
    prompt: rolls.length > 1 ? "Choose one resource die result" : "Resource die result",
    options
  });
}

function treasureFaceSteps(face: TreasureDieFace): VisitStep[] {
  switch (face) {
    case "experience":
      return [{ type: "GAIN_EXPERIENCE", amount: 1 }];
    case "artifact-search":
      return [{ type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 2 }];
    case "resource-die":
      return [{ type: "ROLL_RESOURCE_DICE", count: 1 }];
    case "double-resource-die":
      return [{ type: "ROLL_RESOURCE_DICE", count: 2 }];
  }
}

function treasureFaceLabel(face: TreasureDieFace): string {
  switch (face) {
    case "experience":
      return "Gain 1 experience";
    case "artifact-search":
      return "Search (2) the Artifact deck";
    case "resource-die":
      return "Roll 1 Resource die";
    case "double-resource-die":
      return "Roll 2 Resource dice, choose one";
  }
}

function rollTreasureDice(state: GameState, visit: PendingVisit, count: number): void {
  // Negative Morale "when you are about to roll at least 2 Treasure dice, roll
  // 1 die less": resolves the held card on the first ≥2-dice Treasure roll.
  // Applied before the roll (and before the Luck-reroll option is built, so a
  // reroll re-throws the reduced count, matching the dice actually thrown).
  if (count >= 2 && consumeHeldMoraleCard(state, visit.playerId, MORALE_CARD_IDS.rollOneLess)) {
    count -= 1;
  }
  const random = adventureRandom(state, "treasure-die");
  const rolls = Array.from({ length: count }, () => TREASURE_DIE_FACES[random.nextInt(0, TREASURE_DIE_FACES.length - 1)]);

  appendEvent(state, {
    type: "ADVENTURE_DICE_ROLLED",
    playerId: visit.playerId,
    dice: "treasure",
    results: rolls.map(treasureFaceLabel),
    treasureRolls: [...rolls]
  });

  const luck = getLuckRerollEffect(state, visit.playerId, "treasure");
  const extraOptions = extraDieRerollOptions(state, visit, "treasure", count);
  const setEffect = getDieSetEffect(state, visit.playerId, "treasure");

  if (rolls.length === 1 && !luck && extraOptions.length === 0 && !setEffect) {
    visit.steps.unshift(...treasureFaceSteps(rolls[0]));
    return;
  }

  const options = rolls.map((face) => ({
    label: treasureFaceLabel(face),
    steps: treasureFaceSteps(face)
  }));

  if (luck) {
    options.push({
      label: `${luck.name}: reroll the Treasure ${count > 1 ? "dice" : "die"}`,
      steps: [
        { type: "CONSUME_LUCK", effectId: luck.id, dice: "treasure" } as VisitStep,
        { type: "ROLL_TREASURE_DICE", count } as VisitStep
      ]
    });
  }
  options.push(...extraOptions);
  // Cards of Prophecy: ignore the roll and set the Treasure die to a face of
  // your choice (the whole die-set effect is spent on the chosen option).
  if (setEffect) {
    options.push(...setTreasureDieOptions(setEffect));
  }

  visit.steps.unshift({
    type: "CHOOSE_ONE",
    prompt: rolls.length > 1 ? "Choose one treasure die result" : "Treasure die result",
    options
  });
}

function rollScholar(state: GameState, visit: PendingVisit): void {
  const random = adventureRandom(state, "scholar");
  const faces = [-1, -1, 0, 0, 1, 1];
  const roll = faces[random.nextInt(0, faces.length - 1)];

  appendEvent(state, {
    type: "ADVENTURE_DICE_ROLLED",
    playerId: visit.playerId,
    dice: "attack",
    results: [`Scholar attack die: ${roll >= 0 ? "+" : ""}${roll}`],
    attackRolls: [roll]
  });

  const branch: VisitStep[] =
    roll > 0
      ? [
          {
            type: "CHOOSE_ONE",
            prompt: "Scholar: gain a Statistic card",
            options: [
              { label: "Gain an Attack card", steps: [] },
              { label: "Gain a Defense card", steps: [] },
              { label: "Gain a Power card", steps: [] },
              { label: "Gain a Knowledge card", steps: [] },
              {
                label: "Remove a Statistic card from your hand",
                steps: [
                  {
                    type: "REMOVE_HAND_CARD",
                    prompt: "Scholar: remove a Statistic card",
                    filter: "statistic",
                    then: "none"
                  }
                ]
              }
            ]
          }
        ]
      : [
          {
            type: "SEARCH_SHARED_DECK",
            deckId: roll === 0 ? "abilities" : "spells",
            count: 2
          }
        ];

  // Positive Morale "Reroll a die.": the Scholar Attack die is a die its holder
  // just threw, so the held card may reroll it before the branch resolves
  // (mirrors the Resource/Treasure windows). Without the card the roll resolves
  // straight through, exactly as before.
  const rerollCard = moraleRerollCardOption(state, visit.playerId, "the Scholar Attack die", { type: "SCHOLAR" });
  if (!rerollCard) {
    visit.steps.unshift(...branch);
    return;
  }
  visit.steps.unshift({
    type: "CHOOSE_ONE",
    prompt: `Scholar Attack die: ${roll >= 0 ? "+" : ""}${roll}. Keep the result, or reroll?`,
    options: [{ label: `Keep the ${roll >= 0 ? "+" : ""}${roll} result`, steps: branch }, rerollCard]
  });
}

/** Statistic card ids by scholar choice order. */
export const SCHOLAR_STAT_CARDS = ["stat.attack", "stat.defense", "stat.power", "stat.knowledge"];

// ---------------------------------------------------------------------------
// Neutral armies
// ---------------------------------------------------------------------------

export type NeutralDraw = {
  unitDefId: string;
  tier: "bronze" | "silver" | "gold" | "azure";
  /** Fixed creature-bank guard: minted, not drawn from a deck, never returned. */
  bankGuard?: boolean;
  /** Random Town defender: fight this unit on its faction Pack side. */
  factionPack?: boolean;
  /**
   * Naval Battles Creature Bank defender: fight from the unit's Creature Bank
   * card (its own stats/abilities, no tier) rather than the Few/Pack/Neutral
   * side. Implies bankGuard.
   */
  bankUnit?: boolean;
};

/**
 * Dragon Utopia guards — the party of FOUR dragons, in descending strength
 * (Azure, Rust, Crystal, Faerie). They are minted for the fight rather than
 * drawn, so the Neutral azure deck is never touched. The featured lead is then
 * randomised (Azure/Rust) and, when guards scale by difficulty, the party is
 * trimmed — see `dragonUtopiaGuardIds`.
 */
export const DRAGON_UTOPIA_GUARD_IDS = [
  "neutral.azure_dragons",
  "neutral.rust_dragons",
  "neutral.crystal_dragons",
  "neutral.faerie_dragons"
] as const;

/**
 * The Dragon Utopia's one always-present featured ("azure") slot is randomised
 * (per game) to Azure or Rust — the marquee dragon the encounter is built
 * around. This is the "the difficulty-scaled party always includes either an
 * Azure or a Rust Dragon" invariant, so even the Easy lone-dragon fight leads
 * with one of the two.
 */
export const DRAGON_UTOPIA_AZURE_SLOT_IDS = [
  "neutral.azure_dragons",
  "neutral.rust_dragons"
] as const;

/**
 * How many dragons guard the Utopia when the guards scale by difficulty:
 * exactly the number of Neutral units its Field Difficulty would draw at the
 * game difficulty (Easy 1 / Normal 2 / Hard 3 / Impossible 4 at difficulty 7),
 * so the encounter "bases on the number of neutrals". Never below 1 — the azure
 * slot is always present. Honours the Astrologers "Rulebook" difficulty-lower
 * card via `neutralArmyDifficulty`, exactly like a drawn Neutral army.
 */
export function dragonUtopiaDifficultyGuardCount(state: GameState, difficulty: number): number {
  const counts = NEUTRAL_ARMY_TABLE[neutralArmyDifficulty(state)][difficulty];
  const total = counts ? counts.bronze + counts.silver + counts.gold + counts.azure : 0;
  return Math.max(1, total);
}

/**
 * The Dragon Utopia guard list for this game. The base party is always the four
 * dragons (`DRAGON_UTOPIA_GUARD_IDS` — Azure, Rust, Crystal, Faerie). Two
 * adjustments then apply:
 *  1. The featured ("azure") lead slot is randomised per game to Azure or Rust
 *     (`DRAGON_UTOPIA_AZURE_SLOT_IDS`). Since both already stand in the party the
 *     duplicate is given the vacated Azure Dragon, keeping the party distinct and
 *     the same size — the net effect is which of the two leads.
 *  2. When `adventureDragonUtopiaGuards` is "by-difficulty" the party is trimmed
 *     to the difficulty-scaled count (keeping the lead slot at index 0). When
 *     "four" the full four-dragon party stands.
 * The Utopia is the Dragon Hunt / Dragon Conqueror win-condition objective, so
 * this is a win-condition tuning knob.
 */
export function dragonUtopiaGuardIds(state: GameState, difficulty: number): string[] {
  const party = [...DRAGON_UTOPIA_GUARD_IDS];

  // The party leads with Azure Dragon; swap that lead for the randomised
  // azure-slot pick (Azure or Rust) and, since the pick already stands later in
  // the party, hand the vacated Azure Dragon to that member (keeps the party
  // distinct and the same size).
  const bossIndex = createSeededRandom(`${state.seed}#dragon-utopia-azure-boss`).nextInt(
    0,
    DRAGON_UTOPIA_AZURE_SLOT_IDS.length - 1
  );
  const boss = DRAGON_UTOPIA_AZURE_SLOT_IDS[bossIndex]!;
  const duplicate = party.findIndex((id, index) => index > 0 && id === boss);
  if (duplicate >= 0) {
    party[duplicate] = party[0]!; // party[0] is Azure Dragon here
  }
  party[0] = boss;

  if (adventureDragonUtopiaGuards(state) === "four") {
    return party;
  }
  const count = Math.min(party.length, dragonUtopiaDifficultyGuardCount(state, difficulty));
  return party.slice(0, count);
}

/** Draws the top card of one neutral tier deck, reshuffling its discard if needed. */
export function drawFromNeutralDeck(state: GameState, tier: "bronze" | "silver" | "gold" | "azure"): string | undefined {
  const deck = state.decks[NEUTRAL_DECK_IDS[tier]];
  if (!deck) {
    return undefined;
  }

  if (deck.drawPile.length === 0 && deck.discardPile.length > 0) {
    const random = adventureRandom(state, `neutral-reshuffle-${tier}`);
    deck.drawPile = [...deck.discardPile];
    deck.discardPile = [];
    for (let i = deck.drawPile.length - 1; i > 0; i -= 1) {
      const j = random.nextInt(0, i);
      [deck.drawPile[i], deck.drawPile[j]] = [deck.drawPile[j], deck.drawPile[i]];
    }
  }

  return deck.drawPile.pop();
}

/**
 * Pandora's Gift: Income (card 174 — a PERMANENT, the printed ∞): rolled when
 * the card ENTERS PLAY. Records the rolled resource on the owner; while the
 * card stays in play the Resources-round income (startAdventureRound) pays
 * that resource's full income tier (+5 gold / +2 materials / +1 valuables) on
 * top of production. No production track is touched, so the boost stops the
 * moment the card leaves play — "the effect of this card lasts only as long
 * as it is in play", as printed.
 */
export function rollPandoraIncomePermanentDie(state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  if (!player) {
    return;
  }
  const random = adventureRandom(state, "pandora-income-die");
  const roll = RESOURCE_DIE_FACES[random.nextInt(0, RESOURCE_DIE_FACES.length - 1)];
  appendEvent(state, {
    type: "ADVENTURE_DICE_ROLLED",
    playerId,
    dice: "resource",
    results: [resourceDieLabel(roll)],
    resourceRolls: [{ resource: roll.resource, amount: roll.amount }]
  });
  player.pandoraIncomeResource = roll.resource;
}

/** Half a recruit cost, each resource rounded UP (Pandora's Gift: Recruits). */
function halfRecruitCostRoundedUp(cost: ResourceCost): ResourceCost {
  const halved: ResourceCost = {};
  for (const [resource, amount] of Object.entries(cost) as [ResourceKind, number][]) {
    if (amount && amount > 0) {
      halved[resource] = Math.ceil(amount / 2);
    }
  }
  return halved;
}

/**
 * Pandora's Gift: Recruits — draw `count` units from the `tier` Neutral deck
 * and open a one-of pick: Recruit one for half its cost (rounded up), or
 * decline. Whatever is not recruited returns to that tier's discard pile (the
 * NEUTRAL_RECRUIT_RESOLVE visit step). Draws fewer than `count` if the deck
 * runs dry; opens nothing when the deck is empty.
 */
export function openNeutralRecruitOffer(
  state: GameState,
  playerId: PlayerId,
  count: number,
  tier: "bronze" | "silver" | "gold" | "azure"
): void {
  const adventure = state.adventure;
  if (!adventure) {
    return;
  }
  const drawn: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const card = drawFromNeutralDeck(state, tier);
    if (!card) {
      break;
    }
    drawn.push(card);
  }
  if (drawn.length === 0) {
    return;
  }

  // One option per DISTINCT drawn unit the player can afford at half cost, plus
  // an always-available decline. (Duplicate draws collapse to one offer; both
  // copies still return to the discard if not the one recruited.)
  const seen = new Set<string>();
  const recruitOptions = drawn
    .filter((unitDefId) => {
      if (seen.has(unitDefId)) {
        return false;
      }
      seen.add(unitDefId);
      const cost = coreUnitDefinitions[unitDefId]?.neutral?.cost ?? {};
      return hasRecruitResources(state, playerId, halfRecruitCostRoundedUp(cost));
    })
    .map((unitDefId) => {
      const def = coreUnitDefinitions[unitDefId];
      const half = halfRecruitCostRoundedUp(def?.neutral?.cost ?? {});
      const costLabel =
        (Object.entries(half) as [ResourceKind, number][])
          .filter(([, amount]) => amount)
          .map(([resource, amount]) => `${amount} ${resource}`)
          .join(" + ") || "free";
      return {
        label: `Recruit ${def?.name ?? unitDefId} for ${costLabel} (half)`,
        steps: [{ type: "NEUTRAL_RECRUIT_RESOLVE", drawn, recruit: unitDefId } as VisitStep]
      };
    });

  const hero = getMainHero(state, playerId);
  adventure.pendingVisit = {
    heroId: hero?.id ?? "",
    playerId,
    fieldId: hero?.spaceId ?? "",
    steps: [
      {
        type: "CHOOSE_ONE",
        prompt: `Pandora's Gift: Recruits — drew ${drawn
          .map((id) => coreUnitDefinitions[id]?.name ?? id)
          .join(", ")}`,
        options: [
          ...recruitOptions,
          { label: "Decline (return all to the Neutral deck)", steps: [{ type: "NEUTRAL_RECRUIT_RESOLVE", drawn } as VisitStep] }
        ]
      }
    ]
  };
}

/**
 * Pandora's Box (card 173): "If you have no Silver unit in your Unit Deck,
 * discard this card and draw another. Otherwise choose one: (A) reverse a Silver
 * unit to its Handful (Few) side, OR (B) discard a Silver unit, then draw 3
 * Bronze + 3 Silver Neutral units and Recruit 1 of each for free."
 *
 * With no Silver in the army the card self-cycles (draws another Pandora card
 * into hand). Otherwise it opens the interactive choice through a pendingVisit.
 * Option A is only offered when a Silver unit is on its Pack side (a Few silver
 * has no Handful side to reverse to).
 */
export function openPandoraSilverRefresh(state: GameState, playerId: PlayerId): void {
  const adventure = state.adventure;
  const player = state.players[playerId];
  if (!adventure || !player) {
    return;
  }

  const silvers = player.army.filter((unit) => coreUnitDefinitions[unit.unitDefId]?.tier === "silver");
  if (silvers.length === 0) {
    // "discard this card and draw another": the played card is discarded by the
    // normal play path; draw a fresh Pandora card into hand.
    const drawn = adventure.pandoraDeck?.pop();
    if (drawn) {
      player.hand.push(drawn);
      appendEvent(state, { type: "PANDORA_CARD_DRAWN", playerId, cardId: drawn });
    }
    return;
  }

  const unitName = (unit: (typeof player.army)[number]) => coreUnitDefinitions[unit.unitDefId]?.name ?? unit.unitDefId;
  const options: { label: string; steps: VisitStep[] }[] = [];

  // Option A — reverse a Pack-side Silver to its Handful (Few) side.
  const packSilvers = silvers.filter((unit) => unit.side === "pack");
  if (packSilvers.length > 0) {
    const reverseSteps: VisitStep[] =
      packSilvers.length === 1
        ? [{ type: "FLIP_PACK_TO_FEW", armyUnitId: packSilvers[0].id, source: "pandora" }]
        : [
            {
              type: "CHOOSE_ONE",
              prompt: "Reverse which Silver unit to its Handful side?",
              options: packSilvers.map((unit) => ({
                label: unitName(unit),
                steps: [{ type: "FLIP_PACK_TO_FEW", armyUnitId: unit.id, source: "pandora" } as VisitStep]
              }))
            }
          ];
    options.push({ label: "Reverse 1 Silver unit to its Handful side", steps: reverseSteps });
  }

  // Option B — discard a Silver, draw 3 Bronze + 3 Silver, free-recruit 1 of each.
  const recruitSteps: VisitStep[] = [
    { type: "PANDORA_FREE_NEUTRAL_RECRUIT", tier: "bronze" },
    { type: "PANDORA_FREE_NEUTRAL_RECRUIT", tier: "silver" }
  ];
  const discardSteps: VisitStep[] =
    silvers.length === 1
      ? [{ type: "PANDORA_DISCARD_ARMY_UNIT", armyUnitId: silvers[0].id }, ...recruitSteps]
      : [
          {
            type: "CHOOSE_ONE",
            prompt: "Discard which Silver unit?",
            options: silvers.map((unit) => ({
              label: unitName(unit),
              steps: [{ type: "PANDORA_DISCARD_ARMY_UNIT", armyUnitId: unit.id } as VisitStep, ...recruitSteps]
            }))
          }
        ];
  options.push({
    label: "Discard 1 Silver unit, then draw 3 Bronze + 3 Silver and Recruit 1 of each for free",
    steps: discardSteps
  });

  const hero = getMainHero(state, playerId);
  adventure.pendingVisit = {
    heroId: hero?.id ?? "",
    playerId,
    fieldId: hero?.spaceId ?? "",
    steps: [{ type: "CHOOSE_ONE", prompt: "Pandora's Box: choose one option", options }]
  };
}

/** Whether a copy of `unitDefId` is still in tier `tier`'s Neutral Units deck. */
export function neutralDeckHas(
  state: GameState,
  tier: "bronze" | "silver" | "gold" | "azure",
  unitDefId: string
): boolean {
  const deck = state.decks[NEUTRAL_DECK_IDS[tier]];
  return Boolean(deck) && (deck!.drawPile.includes(unitDefId) || deck!.discardPile.includes(unitDefId));
}

/**
 * Searches tier `tier`'s Neutral Units deck for one copy of `unitDefId` and
 * removes it (draw pile first, then discard pile). Returns whether a copy was
 * taken — used by search-and-take recruits (Unexpected Reinforcements) so the
 * card leaves the deck, mirroring how a recruited neutral card is conserved
 * (it returns to the discard pile only when the unit is later defeated).
 */
export function removeFromNeutralDeck(
  state: GameState,
  tier: "bronze" | "silver" | "gold" | "azure",
  unitDefId: string
): boolean {
  const deck = state.decks[NEUTRAL_DECK_IDS[tier]];
  if (!deck) {
    return false;
  }
  const drawIndex = deck.drawPile.lastIndexOf(unitDefId);
  if (drawIndex !== -1) {
    deck.drawPile.splice(drawIndex, 1);
    return true;
  }
  const discardIndex = deck.discardPile.lastIndexOf(unitDefId);
  if (discardIndex !== -1) {
    deck.discardPile.splice(discardIndex, 1);
    return true;
  }
  return false;
}

/** Difficulty ladder, easiest first — the axis Rulebook shifts a guard draw along. */
const GAME_DIFFICULTY_ORDER: GameDifficulty[] = ["easy", "normal", "hard", "impossible"];

/** Shared deck ids that hold Artifact cards (legacy single deck or BINH split). */
const ARTIFACT_DECK_IDS = ["artifacts", "artifacts-minor", "artifacts-major", "artifacts-relic"] as const;

/**
 * Rulebook p.10 Scenario Difficulty starting-bonus text (for lobby UI and
 * choice prompts). Campaign scenarios replace these with unique bonuses —
 * this digital build has no campaign scenarios, so every table uses these.
 */
export function startingBonusDescription(
  difficulty: GameDifficulty,
  options?: { polishReduced?: boolean }
): string {
  if (options?.polishReduced && difficulty !== "impossible") {
    return polishReducedStartingBonusDescription(difficulty);
  }
  switch (difficulty) {
    case "easy":
      return "Roll 2 Resource Dice and receive Resources from both — OR — Search (2) the Artifact Deck, twice.";
    case "normal":
      return "Roll 2 Resource Dice and receive the Resources from one of them — OR — Search (2) the Artifact Deck.";
    case "hard":
      return "Roll 1 Resource Die and receive the Resources on it — OR — reveal cards from the top of the Artifact Deck until you find 1 Minor Artifact and add it to your hand.";
    case "impossible":
      return "No starting bonus.";
  }
}

/**
 * Visit steps for the printed starting bonus at `difficulty`. Null on Impossible
 * (no bonus). Artifacts go to hand (via Search / reveal), never into the
 * Starting Deck. After any Artifact Search the Artifact decks reshuffle.
 *
 * With the Polish reduced-starting-bonus house rule, Easy/Normal/Hard all use
 * the same fixed reduced choice (see polish-house-rules.ts).
 */
export function startingBonusVisitSteps(
  difficulty: GameDifficulty,
  options?: { polishReduced?: boolean }
): VisitStep[] | null {
  if (options?.polishReduced && difficulty !== "impossible") {
    return polishReducedStartingBonusVisitSteps();
  }
  switch (difficulty) {
    case "easy":
      return [
        {
          type: "CHOOSE_ONE",
          prompt: "Starting bonus (Easy)",
          options: [
            {
              label: "Roll 2 Resource Dice and receive Resources from both",
              steps: [
                { type: "ROLL_RESOURCE_DICE", count: 1 },
                { type: "ROLL_RESOURCE_DICE", count: 1 }
              ]
            },
            {
              label: "Search (2) the Artifact Deck, twice",
              steps: [{ type: "STARTING_BONUS_ARTIFACT_SEARCH", times: 2 }]
            }
          ]
        }
      ];
    case "normal":
      return [
        {
          type: "CHOOSE_ONE",
          prompt: "Starting bonus (Normal)",
          options: [
            {
              label: "Roll 2 Resource Dice and receive the Resources from one of them",
              steps: [{ type: "ROLL_RESOURCE_DICE", count: 2 }]
            },
            {
              label: "Search (2) the Artifact Deck",
              steps: [{ type: "STARTING_BONUS_ARTIFACT_SEARCH", times: 1 }]
            }
          ]
        }
      ];
    case "hard":
      return [
        {
          type: "CHOOSE_ONE",
          prompt: "Starting bonus (Hard)",
          options: [
            {
              label: "Roll 1 Resource Die and receive the Resources on it",
              steps: [{ type: "ROLL_RESOURCE_DICE", count: 1 }]
            },
            {
              label: "Reveal until you find 1 Minor Artifact (to hand)",
              steps: [{ type: "REVEAL_UNTIL_MINOR_ARTIFACT" }]
            }
          ]
        }
      ];
    case "impossible":
      return null;
  }
}

/**
 * After a starting-bonus Artifact Search: shuffle each Artifact deck with its
 * discard pile, then discard the top card to reseed the face-up discard
 * (rulebook p.10–11).
 */
export function reshuffleArtifactDecksAfterStartingBonus(state: GameState): void {
  for (const deckId of ARTIFACT_DECK_IDS) {
    const deck = state.decks[deckId];
    if (!deck) {
      continue;
    }
    const combined = [...deck.drawPile, ...deck.discardPile];
    deck.drawPile = shuffleCards(
      combined,
      `${state.seed}#starting-bonus-reshuffle#${deckId}#${eventSeedNumber(state)}`
    );
    deck.discardPile = [];
    const top = deck.drawPile.pop();
    if (top) {
      deck.discardPile.push(top);
    }
  }
}

/**
 * Polish Pandora Search: draw Search(N) Pandora cards, keep 1, return the rest
 * under the deck. N = 2 on IV–V / 3 on VI–VII; with polish-random-artifacts a
 * "+1" die raises N by 1.
 */
export function openPolishPandoraSearch(state: GameState, visit: PendingVisit): void {
  const adventure = state.adventure;
  const player = state.players[visit.playerId];
  if (!adventure || !player) {
    return;
  }

  const band = polishArtifactBandForField(state, visit.fieldId);
  let dieFace: number | null = null;
  if (houseRuleEnabled(state, "polish-random-artifacts")) {
    // Roll for the Search(X+1) upgrade only — do not leave a tier access latch
    // that would poison a later Artifact Search on the same turn. We store the
    // face, then clear access after reading it.
    const hero = state.heroes[visit.heroId] ?? getMainHero(state, visit.playerId);
    dieFace = maybeApplyPolishRandomArtifactRoll(state, visit.playerId, hero, "tile");
    // Keep only the die face for the count; drop the access override immediately
    // so it does not gate a following Artifact Search this turn.
    const face = adventure.polishRandomArtifactDie ?? dieFace;
    clearPolishArtifactAccess(state);
    dieFace = face;
  }

  const count = polishPandoraSearchCount(band, dieFace);
  const drawn: CardId[] = [];
  for (let i = 0; i < count; i += 1) {
    const cardId = adventure.pandoraDeck?.pop();
    if (cardId) {
      drawn.push(cardId);
    }
  }
  if (drawn.length === 0) {
    return;
  }
  if (drawn.length === 1) {
    player.hand.push(drawn[0]!);
    appendEvent(state, {
      type: "PANDORA_CARD_DRAWN",
      playerId: visit.playerId,
      cardId: drawn[0]!
    });
    return;
  }

  visit.steps.unshift({
    type: "CHOOSE_ONE",
    prompt: `Pandora Search (${drawn.length}): choose 1 card to keep`,
    options: drawn.map((cardId, index) => ({
      label: `Keep ${cardLibrary[cardId]?.name ?? cardId}`,
      steps: [
        {
          type: "RESOLVE_PANDORA_SEARCH" as const,
          keepIndexes: [index],
          drawn
        }
      ]
    }))
  });
}

/**
 * Polish reduced starting bonus: draw `drawCount` Minor Artifacts from the
 * Minor draw pile (or combined Artifact deck, filtering to minors) — never the
 * discard top — then open a visit CHOOSE_ONE so the player keeps `keepCount`
 * and the rest go under the draw pile (not discarded).
 */
export function openDrawChooseMinorArtifacts(
  state: GameState,
  visit: PendingVisit,
  drawCount: number,
  keepCount: number
): void {
  const player = state.players[visit.playerId];
  if (!player) {
    return;
  }

  const deckId = state.decks["artifacts-minor"] ? "artifacts-minor" : "artifacts";
  const deck = state.decks[deckId];
  if (!deck) {
    return;
  }

  const drawn: CardId[] = [];
  // Prefer drawing straight off the Minor pile. On a combined deck, skip
  // non-minors back under the pile so we never offer a Major/Relic here.
  const skipped: CardId[] = [];
  while (drawn.length < drawCount && deck.drawPile.length > 0) {
    const cardId = deck.drawPile.pop() as CardId;
    const card = cardLibrary[cardId];
    const isMinor = card?.kind === "artifact" && (card.artifactTier ?? "minor") === "minor";
    if (isMinor && canAcquireSharedDeckCard(state, visit.playerId, deckId, cardId)) {
      drawn.push(cardId);
    } else {
      skipped.push(cardId);
    }
  }
  // Put non-minors back under the draw pile (index 0 = bottom).
  if (skipped.length > 0) {
    deck.drawPile = [...skipped, ...deck.drawPile];
  }

  if (drawn.length === 0) {
    return;
  }

  if (drawn.length <= keepCount) {
    for (const cardId of drawn) {
      player.hand.push(cardId);
    }
    appendEvent(state, {
      type: "DECK_SEARCH_RESOLVED",
      playerId: visit.playerId,
      deckId,
      choiceId: `polish_minor_draw_${nextEventNumber(state)}`,
      pick: "revealed",
      discardedCardIds: []
    });
    return;
  }

  // Offer every single-card keep combination (keepCount is 1 in the printed
  // reduced bonus; generalise for a future keep-2 if needed).
  const options =
    keepCount === 1
      ? drawn.map((cardId, index) => ({
          label: `Keep ${cardLibrary[cardId]?.name ?? cardId}`,
          steps: [
            {
              type: "RESOLVE_DRAW_CHOOSE_MINOR" as const,
              deckId,
              keepIndexes: [index],
              drawn
            }
          ]
        }))
      : [
          {
            label: `Keep the first ${keepCount}`,
            steps: [
              {
                type: "RESOLVE_DRAW_CHOOSE_MINOR" as const,
                deckId,
                keepIndexes: drawn.slice(0, keepCount).map((_, i) => i),
                drawn
              }
            ]
          }
        ];

  // Unshift so the pick resolves before the rest of the visit queue.
  visit.steps.unshift({
    type: "CHOOSE_ONE",
    prompt: `Choose ${keepCount} of ${drawn.length} Minor Artifacts to keep`,
    options
  });
}

/**
 * Hard starting bonus: reveal from the Artifact deck until a Minor Artifact
 * the player may acquire is found, then put it in hand. Revealed non-minors
 * (and unacquirable minors) go to that deck's discard. With split decks the
 * Minor deck is searched first.
 */
export function revealUntilMinorArtifact(state: GameState, playerId: PlayerId): CardId | null {
  const player = state.players[playerId];
  if (!player) {
    return null;
  }

  const deckOrder = state.decks["artifacts-minor"]
    ? (["artifacts-minor", "artifacts-major", "artifacts-relic"] as const)
    : (["artifacts"] as const);

  for (const deckId of deckOrder) {
    const deck = state.decks[deckId];
    if (!deck) {
      continue;
    }
    while (deck.drawPile.length > 0) {
      const cardId = deck.drawPile.pop() as CardId;
      const card = cardLibrary[cardId];
      const isMinor = card?.kind === "artifact" && (card.artifactTier ?? "minor") === "minor";
      if (isMinor && canAcquireSharedDeckCard(state, playerId, deckId, cardId)) {
        player.hand.push(cardId);
        appendEvent(state, {
          type: "DECK_SEARCH_RESOLVED",
          playerId,
          deckId,
          choiceId: `starting_bonus_${nextEventNumber(state)}`,
          pick: "revealed",
          discardedCardIds: []
        });
        return cardId;
      }
      deck.discardPile.push(cardId);
    }
  }
  return null;
}

/**
 * Prepends rewards so they resolve immediately after the current visit step
 * (before other players' queued bonuses). Unshifts in reverse order.
 */
function prependVisitFollowUpRewards(adventure: AdventureState, rewards: AdventureReward[]): void {
  for (let index = rewards.length - 1; index >= 0; index -= 1) {
    adventure.rewardQueue.unshift(rewards[index]!);
  }
}

/**
 * Rulebook (Astrologers): the GAME difficulty a neutral guard army is drawn at.
 * Normally the table's own difficulty; while Rulebook is face up, `levels`
 * lower (clamped to Easy) — a weaker guard. "Ignore on Easy" holds by
 * construction: Easy is already the floor, so it cannot drop further.
 */
export function neutralArmyDifficulty(state: GameState): GameDifficulty {
  const base = state.adventure?.difficulty ?? "normal";
  const effect = getActiveAstrologersCard(state)?.effect;
  if (effect?.type !== "NEUTRAL_DIFFICULTY_LOWER") {
    return base;
  }
  const index = GAME_DIFFICULTY_ORDER.indexOf(base);
  return GAME_DIFFICULTY_ORDER[Math.max(0, index - effect.levels)];
}

/** Draws the neutral army for a guarded field from the four tier decks. */
export function drawNeutralArmy(state: GameState, difficulty: number): NeutralDraw[] {
  const adventure = state.adventure;
  if (!adventure) {
    return [];
  }

  const counts = NEUTRAL_ARMY_TABLE[neutralArmyDifficulty(state)][difficulty];
  if (!counts) {
    return [];
  }

  const draws: NeutralDraw[] = [];
  for (const tier of ["bronze", "silver", "gold", "azure"] as const) {
    for (let index = 0; index < counts[tier]; index += 1) {
      const unitDefId = drawFromNeutralDeck(state, tier);
      if (unitDefId) {
        draws.push({ unitDefId, tier });
      }
    }
  }

  return draws;
}

/**
 * Builds the guard army for a field, applying the creature-bank overrides:
 *  - Dragon Utopia: a fixed party of the four dragons (not from the deck).
 *  - Random Town: the rolled faction's packs (1 bronze, 2 silver, 2 gold).
 *  - Cyclops Stockpile: the normal draw plus 2 golden Cyclopes added to the
 *    Neutral Army (the rulebook override).
 * Every other field draws normally from the Field Difficulty Level Table.
 */
export function drawGuardArmy(state: GameState, field: MapFieldState | undefined, difficulty: number): NeutralDraw[] {
  // Designer "certain army" guard: mint the exact Neutral cards, Creature-Bank
  // style — never drawn from nor recycled to the tier decks. It REPLACES every
  // printed/location draw below (a customized Ⅶ objective fights the designed
  // army, not the printed one). Unknown / non-neutral ids are skipped
  // defensively (the sanitiser already drops them).
  if (field?.customGuardUnits && field.customGuardUnits.length > 0) {
    return field.customGuardUnits
      .filter((unitDefId) => coreUnitDefinitions[unitDefId]?.neutral)
      .map((unitDefId) => ({
        unitDefId,
        tier: coreUnitDefinitions[unitDefId].tier,
        bankGuard: true
      }));
  }

  // Designer guard LEVEL on a bank-style object (Garrison / Keymaster's Tent /
  // one-way monolith entrance): the army is drawn at the designed level even
  // though the FIGHT runs bank-style (combat difficulty 0 — no experience).
  if (field?.customGuardLevel) {
    return drawNeutralArmy(state, field.customGuardLevel);
  }

  if (field?.location === "dragon_utopia") {
    return dragonUtopiaGuardIds(state, difficulty).map((unitDefId) => ({
      unitDefId,
      tier: "azure" as const,
      bankGuard: true
    }));
  }

  if (field?.location === "random_town") {
    return randomTownGuardDraws(state, field);
  }

  const draws = drawNeutralArmy(state, difficulty);

  if (field?.location === "cyclops_stockpile") {
    // "Find 2 golden Cyclopes and add them to the Neutral Army." The single
    // copy in the gold deck is left in place (this build holds one of each
    // Neutral card); the two stockpile guards are minted for the fight.
    for (let index = 0; index < 2; index += 1) {
      draws.push({ unitDefId: "neutral.cyclopes", tier: "gold", bankGuard: true });
    }
  }

  return draws;
}

// ---------------------------------------------------------------------------
// Creature Banks (Naval Battles optional rule, rulebook p.66-67, 84-85)
// ---------------------------------------------------------------------------

/** Whether `bankId` is a known Creature Bank. */
export function isCreatureBankId(bankId: string | undefined): bankId is CreatureBankId {
  return Boolean(bankId) && bankId! in CREATURE_BANKS;
}

/**
 * The Creature Bank token pile a freshly discovered tile may draw from: Far Map
 * Tiles (II-III) → "far", Near (IV-V) → "near". Subterranean tiles (caverns) also
 * offer a bank, drawing from the NEAR pile (BINH house rule: a cavern is a "deep"
 * tile, so it is treated like a Near IV-V discovery). A cavern's bank lands on its
 * Blocked Field EXCEPT when that field was sacrificed to a Subterranean Gate — the
 * gate carves before the bank is offered, so a Blocked Field that became the gate
 * hex simply is not there to bank on.
 *
 * The remaining groups (starting, center, sea) return null — no bank. So a sea
 * tile never offers a bank, even though some sea tiles (e.g. the Cove tile W1) DO
 * carry a Blocked Field / impassable terrain. This is the gate, not the presence
 * of a Blocked Field.
 */
export function creatureBankTierForGroup(group: string | undefined): "far" | "near" | null {
  return group === "far" ? "far" : group === "near" ? "near" : group === "subterranean" ? "near" : null;
}

/** The Creature Bank a field hosts, if any. */
export function fieldCreatureBankId(field: MapFieldState | null | undefined): CreatureBankId | undefined {
  if (field?.location === "creature_bank" && isCreatureBankId(field.bankId)) {
    return field.bankId;
  }
  return undefined;
}

/** Builds the minted bank defenders (no Stack Tokens yet) for a Creature Bank. */
export function buildCreatureBankDraws(bankId: CreatureBankId): NeutralDraw[] {
  const bank = CREATURE_BANKS[bankId];
  return bank.units.map((unitDefId) => ({ unitDefId, tier: "bronze" as const, bankUnit: true }));
}

/**
 * Converts the Polish house-rule Attack-die roll into bank size I-IV, per the
 * v1.2 sheet table (rule author's clarification): −1 → Ⅰ, 0 → Ⅱ, +1 → Ⅲ, and
 * the two EXTREME sums −2 or +2 → Ⅳ (gold). One die can only reach I-III; two
 * dice distribute Ⅰ 2/9, Ⅱ 3/9, Ⅲ 2/9, Ⅳ 2/9 (sums −2 and +2 both pay Ⅳ).
 */
export function polishBankSizeForAttackRolls(rolls: readonly number[]): BankSize {
  const sum = rolls.reduce((total, roll) => total + roll, 0);
  if (sum === -1) return 1;
  if (sum === 0) return 2;
  if (sum === 1) return 3;
  return 4;
}

/**
 * Builds the Creature Bank defenders for a combat, placing the standard
 * random-statistic Stack Tokens (rulebook p.66-67): a Stacked defender gains one
 * random stat bonus (+1 Attack/Defense/Health or +2 Initiative) and absorbs one
 * lethal blow by discarding the token.
 *
 * The NUMBER of Stacked defenders is normally rolled from the Scenario
 * Difficulty (easy 1 / normal 2 / hard 3 / impossible 4), each candidate landing
 * a token only STACK_TOKEN_PLACEMENT_PERCENT% of the time, so the count varies
 * run to run. The Polish Bank Sizes house rule instead makes that count
 * DETERMINISTIC: the rolled size IS the number of Stacked defenders (size N = N
 * of the bank's cards each carry a Stack Token, guaranteed). Everything else —
 * the token stat, the lethal-blow absorb, the win reward scaled by X = the
 * Stacked count — is the normal Creature Bank behaviour.
 */
export function buildCreatureBankCombatUnits(
  state: GameState,
  bankId: CreatureBankId,
  bankSize?: BankSize
): { units: CombatUnitState[]; stackedCount: number } {
  const ruleset = getRuleset(state);
  const sideOverrides = unitSideRuleOverrides(state);
  const draws = buildCreatureBankDraws(bankId);
  const units = draws.flatMap((draw, index) => {
    const unit = makeCombatUnitFromNeutral(draw, `bank_${index + 1}_${draw.unitDefId.split(".")[1]}`, 0, ruleset, sideOverrides);
    return unit ? [unit] : [];
  });

  // Polish Bank Sizes: the rolled size (a stored `field.bankSize`) is the
  // GUARANTEED number of Stacked defenders. Otherwise the Scenario Difficulty
  // rolls the count and each candidate lands its token only ~77% of the time.
  const polishSized = houseRuleEnabled(state, "polish-bank-sizes") && bankSize !== undefined;
  const difficulty = state.adventure?.difficulty ?? "normal";
  // The count caps how many DISTINCT defenders are candidates for a token.
  const tokenRolls = Math.min(bankSize ?? STACK_TOKENS_BY_DIFFICULTY[difficulty], units.length, 4);

  const random = adventureRandom(state, `creature-bank-stack-${bankId}`);
  // Partial Fisher-Yates: pick `tokenRolls` DISTINCT candidate defenders.
  const order = units.map((_, index) => index);
  for (let i = 0; i < tokenRolls; i += 1) {
    const j = random.nextInt(i, order.length - 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  let stackedCount = 0;
  for (let i = 0; i < tokenRolls; i += 1) {
    // Standard rule: the token lands only STACK_TOKEN_PLACEMENT_PERCENT% of the
    // time. Polish Bank Sizes places EVERY one of `size` tokens (size = the
    // Stacked count) — no 77% roll — so the coin is deterministic.
    if (!polishSized && random.nextInt(1, 100) > STACK_TOKEN_PLACEMENT_PERCENT) {
      continue;
    }
    const unit = units[order[i]];
    unit.stackToken = STACK_TOKEN_STATS[random.nextInt(0, STACK_TOKEN_STATS.length - 1)];
    // Re-derive the fighting statistics so the token's bonus is baked in.
    applyUnitCurrentSide(unit, ruleset, sideOverrides);
    stackedCount += 1;
  }

  return { units, stackedCount };
}

/**
 * Places a Creature Bank Token on a field, converting it into a bank Location
 * (rulebook p.66: a token is placed on a Tile's Blocked Field). Mirrors the
 * subterranean-gate carve: the old Location and all of its trappings are
 * cleared so the bank behaves as a clean Visitable field. Returns the field, or
 * null if the space or bank id is unknown.
 */
export function placeCreatureBank(
  state: GameState,
  spaceId: MapSpaceId,
  bankId: CreatureBankId,
  bankSize?: BankSize
): MapFieldState | null {
  const adventure = state.adventure;
  const field = adventure?.fields[spaceId];
  if (!adventure || !field || !isCreatureBankId(bankId)) {
    return null;
  }
  field.location = "creature_bank";
  field.bankId = bankId;
  if (bankSize !== undefined) {
    field.bankSize = bankSize;
  } else {
    delete field.bankSize;
  }
  delete field.difficulty;
  delete field.resource;
  delete field.amount;
  delete field.faction;
  delete field.terrain;
  field.blackCube = false;
  field.flagOwnerId = null;
  delete field.extraFlagOwnerIds;
  field.everFlagged = false;
  field.settlementResource = null;
  delete field.grailDiggable;

  appendEvent(state, {
    type: "CREATURE_BANK_PLACED",
    fieldId: spaceId,
    bankId,
    ...(bankSize !== undefined ? { bankSize } : {})
  });
  return field;
}

/**
 * Resolves a Creature Bank win reward (rulebook p.66-67): mark the Black Cube,
 * then grant the bank's reward scaled by X = the number of Stacked defenders.
 * The reward is compiled to ordinary visit steps so it flows through the same
 * resource/morale/search pipeline as every other field. Banks whose reward is
 * "gain a unit" (not implemented yet) grant nothing.
 */
export function grantCreatureBankReward(
  state: GameState,
  heroId: HeroId,
  fieldId: MapSpaceId,
  stackedCount: number
): void {
  const adventure = state.adventure;
  const hero = state.heroes[heroId];
  const field = adventure?.fields[fieldId];
  const bankId = fieldCreatureBankId(field);
  if (!adventure || !hero || !field || !bankId) {
    return;
  }
  const playerId = hero.controllerId;
  const bank = CREATURE_BANKS[bankId];

  appendEvent(state, {
    type: "FIELD_VISITED",
    playerId,
    heroId,
    fieldId,
    location: field.location,
    revisit: false
  });
  adventure.lastVisitedField[heroId] = fieldId;

  // "If you win, resolve the Field's effect and mark it with a Black Cube."
  field.blackCube = true;

  // The reward scales by X = the number of Stacked defenders (rulebook p.66-67).
  // Under Polish Bank Sizes that count equals the rolled size, so the SAME normal
  // reward builder pays out — size Ⅳ simply means all four defenders were Stacked.
  const reward = bank.buildReward(stackedCount);
  const steps = interactionToSteps(reward, locationDiceBonusFor(state, playerId));
  if (steps.length === 0) {
    return;
  }
  adventure.pendingVisit = { heroId, playerId, fieldId, steps };
  processPendingVisit(state);
}

// Every faction with a unit roster AND not flagged non-playable is a first-class
// playable faction and thus a valid Random Town defender — derived from the
// faction definitions so newer expansions (Conflux, Cove, …) are included
// automatically rather than being silently dropped by a stale hand-maintained
// list. Art-only stub factions (Factory: no starting tile, stub units) are
// excluded via `isPlayableFaction` so the defender pool never draws them.
export const PLAYABLE_FACTIONS: string[] = Object.values(coreFactionDefinitions)
  .filter((faction) => faction.units.length > 0 && isPlayableFaction(faction.id))
  .map((faction) => faction.id);

/**
 * Assigns (once) the unused faction defending a Random Town. The rulebook has
 * the highest Resource-dice roller choose; here an unused faction is picked
 * deterministically from the seed and stored on the field.
 */
function ensureRandomTownFaction(state: GameState, field: MapFieldState): string {
  if (field.faction) {
    return field.faction;
  }
  const used = new Set<string>();
  for (const player of Object.values(state.players)) {
    if (player.factionId) {
      used.add(player.factionId);
    }
  }
  const unused = PLAYABLE_FACTIONS.filter(
    (faction) => !used.has(faction) && (coreFactionDefinitions[faction]?.units.length ?? 0) > 0
  );
  const pool = unused.length > 0 ? unused : [...PLAYABLE_FACTIONS];
  const random = adventureRandom(state, `random-town-${field.spaceId}`);
  const faction = pool[random.nextInt(0, pool.length - 1)];
  field.faction = faction;
  return faction;
}

/**
 * Random Town defenders: one bronze, two silver and two gold Packs of the
 * rolled faction (the strongest bronze stands in for the defender's choice).
 */
function randomTownGuardDraws(state: GameState, field: MapFieldState): NeutralDraw[] {
  const faction = ensureRandomTownFaction(state, field);
  const unitIds = coreFactionDefinitions[faction]?.units ?? [];
  const byTier = (tier: "bronze" | "silver" | "gold") =>
    unitIds.filter((id) => coreUnitDefinitions[id]?.tier === tier);

  const bronze = byTier("bronze");
  const picks: string[] = [];
  if (bronze.length > 0) {
    picks.push(bronze[bronze.length - 1]);
  }
  picks.push(...byTier("silver").slice(0, 2));
  picks.push(...byTier("gold").slice(0, 2));

  return picks
    .filter((id) => coreUnitDefinitions[id]?.pack)
    .map((id) => ({
      unitDefId: id,
      tier: coreUnitDefinitions[id]!.tier as "bronze" | "silver" | "gold",
      factionPack: true,
      bankGuard: true
    }));
}

export function makeCombatUnitFromNeutral(
  draw: NeutralDraw,
  unitId: UnitId,
  position: number,
  ruleset: GameRuleset = "legacy",
  /** Griffin/Marksman toggle overrides; falls back to the bundled mode default. */
  overrides?: { griffinBuff?: boolean; marksmanBuff?: boolean }
): CombatUnitState | null {
  const def = coreUnitDefinitions[draw.unitDefId];
  // Creature Bank defenders fight from their own bank card; Random Town
  // defenders fight on their faction's Pack side; every other guard uses the
  // single-sided Neutral card.
  const bankSide = draw.bankUnit ? getBankSide(draw.unitDefId) : undefined;
  const variant: "neutral" | "pack" = draw.factionPack ? "pack" : "neutral";
  const printed = draw.bankUnit ? bankSide : draw.factionPack ? def?.pack : def?.neutral;
  if (!def || !printed) {
    return null;
  }

  // Bank cards carry no ruleset (legacy/binh) tweaks; their printed side is
  // used verbatim. Other guards run through the ruleset side adjustments.
  const side = draw.bankUnit ? printed : applyUnitSideRules(ruleset, draw.unitDefId, variant, printed, overrides);
  const cardName = draw.bankUnit
    ? `${def.name} (Creature Bank)`
    : `${draw.factionPack ? "Pack of" : "Neutral"} ${def.name}`;

  return {
    id: unitId,
    controllerId: NEUTRAL_PLAYER_ID,
    name: def.name,
    cardName,
    variant,
    grade: def.tier,
    type: side.type ?? def.type,
    attack: side.attack,
    defense: side.defense,
    maxHealth: side.health,
    damage: 0,
    initiative: side.initiative,
    position,
    activatedThisRound: false,
    movedThisActivation: false,
    retaliatedThisRound: false,
    defenseToken: false,
    abilities: side.abilities,
    unitDefId: draw.unitDefId,
    // Bank defenders are minted (never deck-drawn) and follow the bank rules.
    ...(draw.bankUnit ? { bankUnit: true, bankGuard: true } : draw.bankGuard ? { bankGuard: true } : {}),
    assets: {
      cardImage: side.cardImage,
      imageAlt: `${def.name} unit card`,
      wikiUrl: def.wikiUrl
    }
  };
}

export function makeCombatUnitFromArmy(
  armyUnit: {
    id: string;
    unitDefId: string;
    side: "few" | "pack" | "neutral";
    transforms?: UnitTransformState[];
    permanentAttackBonus?: number;
    permanentHealthBonus?: number;
    stacks?: number;
  },
  controllerId: PlayerId,
  unitId: UnitId,
  position: number,
  ruleset: GameRuleset = "legacy",
  /** Griffin/Marksman toggle overrides; falls back to the bundled mode default. */
  overrides?: { griffinBuff?: boolean; marksmanBuff?: boolean; polishUnitStacks?: boolean }
): CombatUnitState | null {
  const def = coreUnitDefinitions[armyUnit.unitDefId];
  const printed = armyUnit.side === "few" ? def?.few : armyUnit.side === "pack" ? def?.pack : def?.neutral;
  if (!def || !printed) {
    return null;
  }

  const side = applyUnitSideRules(ruleset, armyUnit.unitDefId, armyUnit.side, printed, overrides);
  // House rule (BINH) — Gelu IV: a permanent +Attack baked onto this army card is
  // folded into the unit's printed Attack every combat (start to end).
  const permanentAttackBonus = armyUnit.permanentAttackBonus ?? 0;
  const permanentHealthBonus = armyUnit.permanentHealthBonus ?? 0;
  // Pack Groups and recruited Neutrals may carry paid Stack layers.
  const armyStacks =
    overrides?.polishUnitStacks && (armyUnit.side === "pack" || armyUnit.side === "neutral")
      ? Math.max(0, Math.trunc(armyUnit.stacks ?? 0))
      : 0;

  const unit: CombatUnitState = {
    id: unitId,
    controllerId,
    name: def.name,
    cardName: `${armyUnit.side === "few" ? "Few" : armyUnit.side === "pack" ? "Pack of" : "Neutral"} ${def.name}`,
    variant: armyUnit.side,
    grade: def.tier,
    type: side.type ?? def.type,
    attack: side.attack + permanentAttackBonus + (armyStacks > 0 ? 1 : 0),
    defense: side.defense,
    maxHealth: side.health + permanentHealthBonus,
    damage: 0,
    initiative: side.initiative,
    position,
    activatedThisRound: false,
    movedThisActivation: false,
    retaliatedThisRound: false,
    defenseToken: false,
    abilities: side.abilities,
    unitDefId: armyUnit.unitDefId,
    armyUnitId: armyUnit.id,
    ...(permanentAttackBonus ? { permanentAttackBonus } : {}),
    ...(permanentHealthBonus ? { permanentHealthBonus } : {}),
    ...(armyStacks ? { armyStacks } : {}),
    assets: {
      cardImage: side.cardImage,
      imageAlt: `${def.name} unit card`,
      wikiUrl: def.wikiUrl
    }
  };

  // Specialty cards covering the army card (Sandro's Cloak) ride into the
  // combat: the top card's statistics replace the printed side until defeated.
  if (armyUnit.transforms?.length) {
    unit.transforms = armyUnit.transforms.map((entry) => ({ ...entry }));
    applyUnitCurrentSide(unit, ruleset, overrides);
  }

  return unit;
}

/**
 * AI placement for neutral units (campaign rules): ranged in the backline
 * first, then ground and flying units in the frontline, left to right in
 * descending initiative; ties place the higher tier first.
 */
export function placeNeutralUnits(units: CombatUnitState[], backline: number[], frontline: number[]): void {
  const tierOrder = { azure: 3, gold: 2, silver: 1, bronze: 0 } as const;
  const sorted = [...units].sort((left, right) => {
    if (right.initiative !== left.initiative) {
      return right.initiative - left.initiative;
    }

    return tierOrder[right.grade] - tierOrder[left.grade];
  });

  const back = [...backline];
  const front = [...frontline];

  for (const unit of sorted.filter((candidate) => candidate.type === "ranged")) {
    const position = back.shift() ?? front.shift();
    if (position !== undefined) {
      unit.position = position;
    }
  }

  for (const unit of sorted.filter((candidate) => candidate.type !== "ranged")) {
    const position = front.shift() ?? back.shift();
    if (position !== undefined) {
      unit.position = position;
    }
  }
}

// ---------------------------------------------------------------------------
// Towns and recruiting
// ---------------------------------------------------------------------------

export function getTownOfPlayer(state: GameState, playerId: PlayerId) {
  return Object.values(state.towns).find((town) => town.controllerId === playerId) ?? null;
}

export function getBuildingDefinition(buildingId: string) {
  return coreBuildingDefinitions[buildingId];
}

export function townHasBuildingEffect(
  state: GameState,
  playerId: PlayerId,
  effectType: "UNLOCK_REINFORCE" | "MAGE_GUILD" | "MAGIC_UNIVERSITY"
): boolean {
  const town = getTownOfPlayer(state, playerId);
  if (!town) {
    return false;
  }

  return town.buildings.some((buildingId) => coreBuildingDefinitions[buildingId]?.effect?.type === effectType);
}

export function unlockedRecruitTiers(state: GameState, playerId: PlayerId): Set<string> {
  const town = getTownOfPlayer(state, playerId);
  const tiers = new Set<string>();
  if (!town) {
    return tiers;
  }

  for (const buildingId of town.buildings) {
    const effect = coreBuildingDefinitions[buildingId]?.effect;
    if (effect?.type === "UNLOCK_RECRUIT_TIER") {
      tiers.add(effect.tier);
    }
  }

  return tiers;
}

/**
 * Cyra's Diplomacy: the tier of every Dwelling the player controls, *with*
 * multiplicity across all of their towns (a player holding two towns each with
 * a bronze Dwelling draws two bronze cards). A Dwelling is a building whose
 * effect unlocks a recruit tier — bronze, silver or gold in the core set.
 */
export function playerDwellingTiers(
  state: GameState,
  playerId: PlayerId
): ("bronze" | "silver" | "gold" | "azure")[] {
  const tiers: ("bronze" | "silver" | "gold" | "azure")[] = [];
  for (const town of Object.values(state.towns)) {
    if (town.controllerId !== playerId) {
      continue;
    }
    for (const buildingId of town.buildings) {
      const effect = coreBuildingDefinitions[buildingId]?.effect;
      if (effect?.type === "UNLOCK_RECRUIT_TIER") {
        tiers.push(effect.tier);
      }
    }
  }
  return tiers;
}

/**
 * Mints an army-unit id that is unique within this player's army.
 *
 * Army ids must be unique for the life of the game: the engine matches army
 * units by id all over the place — `army.find(u => u.id === armyUnitId)` when
 * reinforcing (Few→Pack) and when deploying a unit into combat — so two units
 * sharing an id makes those lookups silently resolve to the *wrong* unit (the
 * reported Stronghold bug where reinforcing/deploying the Orcs hit the Cyclopes
 * instead, because the two share a stale id).
 *
 * The previous scheme mixed in a module-global counter. That counter is **not**
 * part of the serialized game state, so it resets to 0 every time the host
 * process recycles (serverless cold start / idle reclaim of a multiplayer
 * room). After a recycle a freshly recruited unit could be minted with an id a
 * surviving unit already held. We derive the id purely from the current army
 * instead, scanning for a free ordinal, so it is collision-free regardless of
 * the process's lifetime.
 */
function nextArmyUnitId(player: PlayerState): string {
  const used = new Set(player.army.map((unit) => unit.id));
  let ordinal = player.army.length + 1;
  let id = `army_${player.id}_${ordinal}`;
  while (used.has(id)) {
    ordinal += 1;
    id = `army_${player.id}_${ordinal}`;
  }
  return id;
}

export function addArmyUnit(
  player: PlayerState,
  unitDefId: string,
  side: "few" | "pack" | "neutral"
): PlayerState["army"][number] {
  const armyUnit = {
    id: nextArmyUnitId(player),
    unitDefId,
    side
  };
  player.army.push(armyUnit);
  return armyUnit;
}

/** Cheap check for whether any player's army holds a repeated unit id. */
export function hasDuplicateArmyUnitIds(state: GameState): boolean {
  for (const player of Object.values(state.players)) {
    const army = player?.army;
    if (!army || army.length < 2) {
      continue;
    }
    const seen = new Set<string>();
    for (const unit of army) {
      if (seen.has(unit.id)) {
        return true;
      }
      seen.add(unit.id);
    }
  }
  return false;
}

/**
 * Self-heals any pre-existing duplicate army-unit ids (left behind by the old
 * counter-based id scheme across a host recycle). For each player the first
 * holder of an id keeps it and every later collision is re-minted to a fresh
 * unique id, so combat units / placement entries that already reference the
 * surviving id stay valid. Returns true when it changed anything, so callers
 * can bump the room version / persist only when a repair actually happened.
 *
 * `unitDefId` is never touched — an Orc stays an Orc — only the bookkeeping id
 * that the engine matches on is made unique again.
 */
export function ensureUniqueArmyUnitIds(state: GameState): boolean {
  let changed = false;
  for (const player of Object.values(state.players)) {
    const army = player?.army;
    if (!army || army.length < 2) {
      continue;
    }
    const used = new Set<string>();
    for (const unit of army) {
      if (!used.has(unit.id)) {
        used.add(unit.id);
        continue;
      }
      // Duplicate id: mint a fresh one that collides with neither an id we have
      // already kept nor one still waiting later in the army.
      let ordinal = army.length + 1;
      let candidate = `army_${player.id}_${ordinal}`;
      while (used.has(candidate) || army.some((other) => other !== unit && other.id === candidate)) {
        ordinal += 1;
        candidate = `army_${player.id}_${ordinal}`;
      }
      unit.id = candidate;
      used.add(candidate);
      changed = true;
    }
  }
  return changed;
}

/**
 * Backfills player fields added by later releases onto a game serialized by an
 * OLDER engine, so legacy saves don't crash the new code. The reported case:
 * the Spell Book release added `PlayerState.spellBook`, and getPlayerView spreads
 * it (`[...player.spellBook]`) on every render — an undefined spellBook throws
 * "can't access property Symbol.iterator, spellBook is undefined" and strands
 * the player on the crash screen for their whole in-progress game. Idempotent
 * and cheap; returns true if it changed anything so callers can persist the heal.
 */
export function healLegacyPlayerFields(state: GameState): boolean {
  let changed = false;
  for (const player of Object.values(state.players)) {
    if (player && !Array.isArray(player.spellBook)) {
      player.spellBook = [];
      changed = true;
    }
    if (player && !Array.isArray(player.spellBookUsed)) {
      player.spellBookUsed = [];
      changed = true;
    }
  }
  return changed;
}

/** Replaces an empty unit deck with the scenario starting units. */
export function restoreStartingArmyIfEmpty(state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  if (!player || player.army.length > 0) {
    return;
  }
  for (const unit of player.startingArmy) {
    addArmyUnit(player, unit.unitDefId, unit.side);
  }
}

// ---------------------------------------------------------------------------
// Rounds and turns
// ---------------------------------------------------------------------------

export function refreshRoundTokens(state: GameState): void {
  for (const player of Object.values(state.players)) {
    if (player.id === NEUTRAL_PLAYER_ID) {
      continue;
    }

    player.townTokens = { build: true, population: true, spellBook: true };
    player.populationPurchasedThisRound = false;
    player.combatStats.expertUsesSpentThisRound = 0;
    player.combatStats.expertUseBonusThisRound = 0;
    // Spell Book (house rule): the once-per-turn Power discard refreshes with the
    // crowns — a per-game-round budget, cleared at the start of the player's turn.
    player.combatStats.spellBookPowerUsedThisTurn = false;
  }

  for (const hero of Object.values(state.heroes)) {
    hero.movementPoints = heroMovementMax(state, hero);
    // Fresh movement clears any sea-halt from waking up on / wading into the sea.
    hero.movementHaltedThisTurn = false;
  }
}

/**
 * Commits a player's Population action when one of their heroes moves (BINH
 * house rule). The Population window stays open for unlimited recruiting and
 * reinforcing all round; it only closes once the player has *already* bought
 * this round and then moves a hero. Moving with nothing bought yet leaves the
 * window open — the player may still recruit/reinforce later, even on another
 * player's turn. Call this from every site that relocates a hero on the map.
 */
export function commitPopulationOnMove(state: GameState, controllerId: PlayerId): void {
  const owner = state.players[controllerId];
  if (owner?.populationPurchasedThisRound) {
    owner.townTokens.population = false;
  }
}

/**
 * Raises the round-start Event / Astrologers barrier: the round's Event (or
 * Astrologers proclamation) has just queued its per-player resolution, so freeze
 * the WHOLE table until every player has resolved it. `eventResolution` is read
 * by `isRoundStartEventBarrierActive` — legal-actions offers nothing but the
 * current resolver's choice, and the applyAction backstop rejects every other
 * player's action — and a trailing "round-start-events-resolved" sentinel reward
 * (pushed here after the queued event work) lifts the freeze in
 * `pumpAdventureQueues`. Follow-up rewards earned inside a player's event slot
 * are inserted before the next queued event resolver, so the earning player sees
 * the payout immediately. Called only when resolution work was actually queued,
 * so a fully-instant proclamation raises no barrier.
 */
function beginRoundStartEventBarrier(state: GameState): void {
  const adventure = state.adventure;
  if (!adventure) {
    return;
  }
  adventure.eventResolution = { round: state.round };
  const sentinelPlayerId = state.turnOrder.find((playerId) => playerId !== NEUTRAL_PLAYER_ID) ?? state.turnOrder[0] ?? "";
  adventure.rewardQueue.push({ playerId: sentinelPlayerId, kind: "round-start-events-resolved" });
}

/**
 * Starts an adventure round (rulebook round structure): refresh tokens, MP
 * and expert effects; then even rounds draw an Astrologers Proclaim card and
 * odd rounds after the first pay Resource Round income.
 */
export function startAdventureRound(state: GameState): void {
  // Victory Points mode: the round limit is the HARD end trigger. Both round
  // wraps (ordered `endTurnAdventure`, parallel `endParallelTurn`) call this
  // right after `state.round += 1`, so when the counter passes the limit the
  // game ends by scoring here — for BOTH modes — before any round-start
  // machinery runs. With VP off, `roundLimit` stays a mere suggested length and
  // this never fires (the callers guard the resulting game-over and return).
  const vpConfig = victoryPointsConfig(state);
  const roundLimit = state.adventure?.mapPreset?.roundLimit;
  if (vpConfig && roundLimit && state.round > roundLimit && !state.adventure?.winnerPlayerId) {
    endGameByVictoryPoints(state, {
      completerId: null,
      completionReason: `the ${roundLimit}-round limit was reached`
    });
    return;
  }

  const kind = state.round === 1 ? "first" : state.round % 2 === 1 ? "resource" : "astrologers";

  if (houseRuleEnabled(state, "polish-spell-book")) {
    for (const player of Object.values(state.players)) {
      if (player.id === NEUTRAL_PLAYER_ID || !player.spellBookUsed?.length) {
        continue;
      }
      player.spellBook.push(...player.spellBookUsed);
      player.spellBookUsed = [];
    }
  }

  // Torosar's Ballista IV grant ("until the end of the round") ends here.
  for (const expired of expireEffectsForGameRoundEnd(state)) {
    appendEvent(state, { type: "ACTIVE_EFFECT_EXPIRED", effectId: expired.id, reason: "game-round-ended" });
  }

  if (kind === "astrologers") {
    // The previous proclamation lasts "until the next Astrologers' round":
    // expire it before tokens refresh so its movement modifier ends now.
    expireActiveAstrologersCard(state);
  }

  refreshRoundTokens(state);
  appendEvent(state, { type: "ROUND_STARTED", round: state.round, kind });
  // Map designer timed events fire for every round kind. On first / resource
  // rounds they queue right after the round-start feed line; on an Astrologers
  // round they wait until AFTER the proclamation is drawn (below), so the
  // documented "resolve the Astrologers card before ANY other trigger" order
  // holds for map events too.
  if (kind !== "astrologers") {
    applyCustomMapTimedEvents(state);
  }

  if (kind === "astrologers") {
    // Draw + resolve the proclamation FIRST, then raise the whole-table barrier
    // over whatever per-player resolution it queued (dice, empower, recruit…) —
    // so every player resolves the Astrologers card before ANY City Hall trigger,
    // start-of-turn draw or turn is taken. Instant proclamations (Dead Silence,
    // movement/morale buffs applied inline) queue nothing and raise no barrier.
    const astroQueueBefore = state.adventure?.rewardQueue.length ?? 0;
    drawAstrologersCard(state);
    if ((state.adventure?.rewardQueue.length ?? 0) > astroQueueBefore) {
      beginRoundStartEventBarrier(state);
    }
    // Map timed events queue behind the proclamation (and its barrier
    // sentinel), so the table finishes the Astrologers card first.
    applyCustomMapTimedEvents(state);

    // "At the beginning of each Astrologers' round" building triggers.
    for (const playerId of state.turnOrder) {
      const player = state.players[playerId];
      if (!player || playerId === NEUTRAL_PLAYER_ID) {
        continue;
      }

      const town = getTownOfPlayer(state, playerId);
      for (const buildingId of town?.buildings ?? []) {
        const effect = coreBuildingDefinitions[buildingId]?.effect;
        if (effect?.type === "ASTROLOGERS_HALF_GOLD_REINFORCE") {
          queueHalfGoldReinforce(state, playerId, buildingId, effect.tiers);
        }
        if (effect?.type === "ROUND_START_FREE_SPRITE") {
          queueGardenOfLife(state, playerId, buildingId, effect.unitDefId);
        }
        if (effect?.type === "ASTROLOGERS_FLAT_GOLD_REINFORCE") {
          queueFlatGoldReinforce(state, playerId, buildingId, effect.discount, effect.tiers);
        }
        if (effect?.type === "COMBAT_CUBES" && effect.gainOn === "astrologers" && town) {
          gainTownCube(state, town, buildingId, effect.max);
        }
        if (effect?.type === "ASTROLOGERS_TAKE_STATISTIC") {
          // Wall of Knowledge: optionally take a Knowledge or Power Statistic
          // card from the discard pile to hand (only offered when one exists).
          const hasStatInDiscard = player.discard.some((cardId) => {
            const card = cardLibrary[cardId];
            return card?.kind === "statistic" && (card.statisticType === "power" || card.statisticType === "knowledge");
          });
          if (hasStatInDiscard) {
            state.adventure?.rewardQueue.push({
              playerId,
              kind: "visit-steps",
              steps: [
                {
                  type: "CHOOSE_ONE",
                  prompt: `${coreBuildingDefinitions[buildingId]?.name ?? "Wall of Knowledge"}: take a Knowledge or Power Statistic card from your discard pile?`,
                  options: [
                    {
                      label: "Take a Knowledge or Power Statistic card",
                      steps: [{ type: "DISCARD_PICK", count: 1, filter: "power-or-knowledge-statistic" }]
                    },
                    { label: "Skip", steps: [] }
                  ]
                }
              ]
            });
          }
        }
      }
    }
    return;
  }

  if (kind !== "resource") {
    return;
  }

  const astrologers = getAstrologersState(state);
  const modifiers = astrologers?.nextResourceModifiers ?? { gold: 0, valuables: 0 };

  // Automatic Resource income FIRST, for every player, in the rulebook's own
  // order (p.15: income precedes the Event) — so the log/feed chronology
  // matches what actually happens and every seat holds its fresh Resources
  // before the Event's markets/auctions open.
  for (const playerId of state.turnOrder) {
    const player = state.players[playerId];
    if (!player || playerId === NEUTRAL_PLAYER_ID) {
      continue;
    }

    // Bulwark "Rune-Empowered" City Hall flag lasts "until the next Resource
    // round" (Gamefound Update #3): clear it here at the Resource round; if this
    // player picks the combat-focus option again this round, the City Hall
    // resolver re-sets it.
    player.runeEmpoweredNextCombats = undefined;

    const income = {
      gold: Math.max(0, player.production.gold + modifiers.gold),
      buildingMaterials: player.production.buildingMaterials,
      valuables: Math.max(0, player.production.valuables + modifiers.valuables)
    };
    if (income.gold || income.buildingMaterials || income.valuables) {
      gainResources(state, playerId, income, "resource round income");
    }

    // Crystal Dragons (army map ability): gain the printed resource each
    // Resource round, once per qualifying card in the army.
    for (const ability of getArmyMapAbilities(state, playerId)) {
      if (ability.effect.type === "MAP_RESOURCE_ROUND_GAIN") {
        gainResources(state, playerId, { [ability.effect.resource]: ability.effect.amount }, ability.abilityName);
      }
    }

    // Income artifacts in play (Eversmoking Ring of Sulfur, Inexhaustible Cart
    // of Ore): gain the printed resource each Resources round while the
    // permanent stays in play. Read inline — permanents.ts imports this module,
    // so it cannot be imported back here.
    const incomePermanentIds = player.permanents ?? (player.permanent ? [player.permanent] : []);
    for (const permanentId of incomePermanentIds) {
      const permanentEffect = cardLibrary[permanentId]?.permanentEffect;
      const incomeGain = permanentEffect?.resourceRoundGain;
      if (incomeGain) {
        gainResources(state, playerId, { [incomeGain.resource]: incomeGain.amount }, cardLibrary[permanentId]?.name ?? "income artifact");
      }
      // Pandora's Gift: Income — while the ∞ permanent is in play, its
      // enter-play die's resource pays a FULL income tier each Resources round.
      if (permanentEffect?.incomeTierDieOnEnter && player.pandoraIncomeResource) {
        gainResources(
          state,
          playerId,
          { [player.pandoraIncomeResource]: RESOURCE_GAIN_LEVEL_AMOUNTS[player.pandoraIncomeResource] },
          cardLibrary[permanentId]?.name ?? "Pandora income"
        );
      }
    }
  }

  // FORTRESS EXPANSION Events (optional rule, multiplayer only) resolve as a
  // whole-table barrier — before any City Hall choice, resource die,
  // war-machine offer, start-of-turn draw or turn. Drawn AFTER the inline
  // income above (rulebook p.15: income, then Event) but BEFORE the building
  // pass below, so its per-player resolution rewards sit at the FRONT of the
  // queue; the barrier then freezes everyone until the whole table has
  // resolved it. No-op when the Event deck is off or fewer than 2 live
  // players remain.
  const eventQueueBefore = state.adventure?.rewardQueue.length ?? 0;
  drawEventCard(state);
  if ((state.adventure?.rewardQueue.length ?? 0) > eventQueueBefore) {
    beginRoundStartEventBarrier(state);
  }

  for (const playerId of state.turnOrder) {
    const player = state.players[playerId];
    if (!player || playerId === NEUTRAL_PLAYER_ID) {
      continue;
    }

    const town = getTownOfPlayer(state, playerId);
    for (const buildingId of town?.buildings ?? []) {
      const effect = coreBuildingDefinitions[buildingId]?.effect;
      if (effect?.type === "RESOURCE_ROUND_CHOICE") {
        state.adventure?.rewardQueue.push({ playerId, kind: "city-hall-choice", buildingId });
      }
      if (effect?.type === "RESOURCE_ROUND_MORALE") {
        changeMorale(state, playerId, 1);
      }
      if (effect?.type === "ROUND_START_FREE_SPRITE") {
        queueGardenOfLife(state, playerId, buildingId, effect.unitDefId);
      }
      if (effect?.type === "RESOURCE_ROUND_RESOURCE_DIE") {
        // Mystic Pond: roll a Resource die through the shared dice pipeline.
        state.adventure?.rewardQueue.push({
          playerId,
          kind: "visit-steps",
          steps: [{ type: "ROLL_RESOURCE_DICE", count: 1 }]
        });
      }
      if (effect?.type === "COMBAT_CUBES" && effect.gainOn === "resource" && town) {
        gainTownCube(state, town, buildingId, effect.max);
      }
      if (effect?.type === "RESOURCE_ROUND_SEARCH_DISCARD") {
        // Blood Obelisk: Search(count) your discard pile and take 1 card.
        // No-ops on an empty discard pile (handled by the discard-pick reward).
        state.adventure?.rewardQueue.push({
          playerId,
          kind: "discard-pick",
          count: 1,
          fromTop: effect.count
        });
      }
    }

    // McGiver (Astrologers): "at the beginning of the next round, each player can
    // take 1 War Machine of their choice from the supply at no cost." That next
    // round is this Resource round — the proclamation is still face up (it expires
    // only at the next Astrologers round), so a single Resource round hands the
    // machine out exactly once. The offer also self-guards on an empty supply.
    if (
      getActiveAstrologersCard(state)?.effect.type === "GRANT_WAR_MACHINE_CHOICE" &&
      (state.adventure?.warMachineSupply?.length ?? 0) > 0
    ) {
      state.adventure?.rewardQueue.push({
        playerId,
        kind: "visit-steps",
        steps: [{ type: "WAR_MACHINE_GRANT_OFFER" }]
      });
    }

    // Charlie and his Circus (Astrologers): "this round and the next one" — it was
    // offered at the Astrologers round it was drawn (resolveAstrologersCard); this
    // is the second offer, at the following Resource round, while it stays face up.
    const activeRecruit = getActiveAstrologersCard(state)?.effect;
    if (activeRecruit?.type === "RECRUIT_NEUTRAL_DRAW") {
      queueNeutralRecruitOffer(state, playerId, { maxDraws: activeRecruit.maxDraws });
    }
  }

  if (astrologers) {
    astrologers.nextResourceModifiers = { gold: 0, valuables: 0 };
  }
}

/**
 * Locations a clear_visitable_cubes entry actually matches on the board.
 * Factory aliases (rulebook p.7): Derrick ≡ Water Wheel, Prospector ≡ Windmill.
 */
const CUBE_CLEAR_MATCHES: Record<"windmill" | "water_wheel" | "mystical_garden", string[]> = {
  windmill: ["windmill", "prospector"],
  water_wheel: ["water_wheel", "derrick"],
  mystical_garden: ["mystical_garden"]
};

/**
 * Fire map-preset timed events for the current round. Pure side-effect on the
 * adventure; no-ops when the active map has no preset timed events.
 * Runs AFTER refreshRoundTokens, so a movement grant stacks on refreshed MPs.
 */
export function applyCustomMapTimedEvents(state: GameState): void {
  const preset = state.adventure?.mapPreset;
  if (!preset?.timedEvents?.length) {
    return;
  }
  const round = state.round;
  const due = preset.timedEvents.filter((event) => event.round === round);
  if (due.length === 0) {
    return;
  }
  const adventure = state.adventure!;
  const players = state.turnOrder.filter(
    (playerId) =>
      playerId !== NEUTRAL_PLAYER_ID &&
      state.players[playerId] &&
      !state.players[playerId]?.eliminated
  );
  const livePlayers = new Set(players);

  for (const event of due) {
    const effect = event.effect;
    if (effect.kind === "note") {
      appendEvent(state, {
        type: "MAP_PRESET_TRIGGERED",
        round,
        message: `Map event (round ${round}): ${effect.text}`
      });
      continue;
    }
    if (effect.kind === "resources") {
      for (const playerId of players) {
        gainResources(state, playerId, effect, `map event round ${round}`);
      }
      const parts: string[] = [];
      if (effect.gold) {
        parts.push(`${effect.gold} gold`);
      }
      if (effect.buildingMaterials) {
        parts.push(`${effect.buildingMaterials} materials`);
      }
      if (effect.valuables) {
        parts.push(`${effect.valuables} valuables`);
      }
      appendEvent(state, {
        type: "MAP_PRESET_TRIGGERED",
        round,
        message: `Map event (round ${round}): every player gains ${parts.join(", ") || "nothing"}.`
      });
      continue;
    }
    if (effect.kind === "search") {
      for (const playerId of players) {
        adventure.rewardQueue.push({
          playerId,
          kind: "visit-steps",
          steps: [
            {
              type: "SEARCH_SHARED_DECK",
              deckId: effect.deck,
              count: effect.count
            }
          ]
        });
      }
      appendEvent(state, {
        type: "MAP_PRESET_TRIGGERED",
        round,
        message: `Map event (round ${round}): every player may Search(${effect.count}) the ${effect.deck} deck.`
      });
      continue;
    }
    if (effect.kind === "clear_visitable_cubes") {
      const targets = new Set<string>();
      for (const loc of effect.locations) {
        for (const match of CUBE_CLEAR_MATCHES[loc] ?? [loc]) {
          targets.add(match);
        }
      }
      let cleared = 0;
      for (const field of Object.values(adventure.fields)) {
        if (!field.blackCube) {
          continue;
        }
        if (targets.has(field.location)) {
          field.blackCube = false;
          cleared += 1;
        }
      }
      appendEvent(state, {
        type: "MAP_PRESET_TRIGGERED",
        round,
        message: `Map event (round ${round}): cleared black cubes on ${effect.locations.join(
          ", "
        )} (${cleared} field${cleared === 1 ? "" : "s"}).`
      });
      continue;
    }
    if (effect.kind === "morale") {
      for (const playerId of players) {
        changeMorale(state, playerId, effect.amount);
      }
      appendEvent(state, {
        type: "MAP_PRESET_TRIGGERED",
        round,
        message: `Map event (round ${round}): every player ${
          effect.amount > 0 ? "gains +1" : "loses 1"
        } morale.`
      });
      continue;
    }
    if (effect.kind === "movement") {
      let heroesBuffed = 0;
      for (const hero of Object.values(state.heroes)) {
        if (!livePlayers.has(hero.controllerId)) {
          continue;
        }
        hero.movementPoints += effect.amount;
        heroesBuffed += 1;
      }
      appendEvent(state, {
        type: "MAP_PRESET_TRIGGERED",
        round,
        message: `Map event (round ${round}): every hero gains +${effect.amount} movement (${heroesBuffed} hero${
          heroesBuffed === 1 ? "" : "es"
        }).`
      });
      continue;
    }
    if (effect.kind === "treasure_roll") {
      for (const playerId of players) {
        adventure.rewardQueue.push({
          playerId,
          kind: "visit-steps",
          steps: [{ type: "ROLL_TREASURE_DICE", count: effect.count }]
        });
      }
      appendEvent(state, {
        type: "MAP_PRESET_TRIGGERED",
        round,
        message: `Map event (round ${round}): every player rolls ${
          effect.count === 1 ? "a Treasure die" : `${effect.count} Treasure dice`
        }.`
      });
      continue;
    }
    if (effect.kind === "resource_roll") {
      for (const playerId of players) {
        adventure.rewardQueue.push({
          playerId,
          kind: "visit-steps",
          steps: [{ type: "ROLL_RESOURCE_DICE", count: effect.count }]
        });
      }
      appendEvent(state, {
        type: "MAP_PRESET_TRIGGERED",
        round,
        message: `Map event (round ${round}): every player rolls ${
          effect.count === 1 ? "a Resource die" : `${effect.count} Resource dice`
        }.`
      });
    }
  }
}

/**
 * Apply map-preset starting bonuses once when the adventure opens.
 */
export function applyCustomMapStartingBonuses(state: GameState): void {
  const preset = state.adventure?.mapPreset;
  if (!preset?.startingBonuses?.length) {
    return;
  }
  const adventure = state.adventure!;
  const players = state.turnOrder.filter(
    (playerId) => playerId !== NEUTRAL_PLAYER_ID && state.players[playerId]
  );
  for (const bonus of preset.startingBonuses) {
    if (bonus.kind === "resources") {
      for (const playerId of players) {
        gainResources(state, playerId, bonus, "map starting bonus");
      }
      const parts: string[] = [];
      if (bonus.gold) {
        parts.push(`${bonus.gold} gold`);
      }
      if (bonus.buildingMaterials) {
        parts.push(`${bonus.buildingMaterials} materials`);
      }
      if (bonus.valuables) {
        parts.push(`${bonus.valuables} valuables`);
      }
      appendEvent(state, {
        type: "MAP_PRESET_TRIGGERED",
        message: `Map starting bonus: every player gains ${parts.join(", ") || "nothing"}.`
      });
      continue;
    }
    if (bonus.kind === "morale") {
      for (const playerId of players) {
        changeMorale(state, playerId, bonus.amount);
      }
      appendEvent(state, {
        type: "MAP_PRESET_TRIGGERED",
        message: `Map starting bonus: every player ${bonus.amount > 0 ? "gains +1" : "loses 1"} morale.`
      });
      continue;
    }
    for (const playerId of players) {
      adventure.rewardQueue.push({
        playerId,
        kind: "visit-steps",
        steps: [
          {
            type: "SEARCH_SHARED_DECK",
            deckId: bonus.deck,
            count: bonus.count
          }
        ]
      });
    }
    appendEvent(state, {
      type: "MAP_PRESET_TRIGGERED",
      message: `Map starting bonus: every player may Search(${bonus.count}) the ${bonus.deck} deck.`
    });
  }
}

/** Adds one faction cube to a cube building, up to its printed maximum. */
export function gainTownCube(state: GameState, town: TownState, buildingId: string, max: number): void {
  const cubes = town.factionCubes ?? {};
  const current = cubes[buildingId] ?? 0;
  if (current >= max) {
    return;
  }

  town.factionCubes = { ...cubes, [buildingId]: current + 1 };
  appendEvent(state, {
    type: "TOWN_BUILDING_USED",
    playerId: town.controllerId,
    buildingId,
    message: `${coreBuildingDefinitions[buildingId]?.name ?? buildingId} stores a faction cube (${current + 1}/${max}).`
  });
}

/** Saplings: reinforce one unit of the listed tiers for half the gold cost. */
/**
 * Garden of Life (Conflux): at the beginning of each round, recruit a Few of
 * the listed unit (Sprites) for free, or reinforce a Few of it already in the
 * army to a Pack for free. Always offers a Skip; the building is itself the
 * free Sprites dwelling, so the recruit option does not require the bronze
 * Dwelling to be built.
 */
function queueGardenOfLife(state: GameState, playerId: PlayerId, buildingId: string, unitDefId: string): void {
  const player = state.players[playerId];
  const def = coreUnitDefinitions[unitDefId];
  if (!player || !def) {
    return;
  }

  const options: { label: string; steps: VisitStep[] }[] = [];
  // Each unit card exists once: only offer "Recruit" when the player does NOT
  // already own this unit — otherwise a free recruit each round would stack
  // duplicate Few cards (a Conflux player starts with a Sprites Few, so the
  // unconditional recruit duplicated it). When already owned, the only free
  // action is reinforcing the Few you have to a Pack.
  const owned = player.army.some((unit) => unit.unitDefId === unitDefId);
  if (!owned && getUnitSide(unitDefId, "few")) {
    options.push({ label: `Recruit ${def.name} (free)`, steps: [{ type: "RECRUIT_FREE", unitDefId }] });
  }
  for (const unit of player.army) {
    if (unit.unitDefId === unitDefId && unit.side === "few" && getUnitSide(unitDefId, "pack")) {
      options.push({
        label: `Reinforce ${def.name} to a Pack (free)`,
        steps: [{ type: "REINFORCE_FREE", armyUnitId: unit.id }]
      });
    }
  }
  // Polish Unit Stacks: the Garden's freebie can also land as a free Stack on
  // the owned Sprites card once it is a Pack (below its Stack cap).
  for (const target of stackOfferTargets(state, playerId)) {
    if (target.unit.unitDefId !== unitDefId) {
      continue;
    }
    const option = stackOfferOption(state, playerId, target, 0, coreBuildingDefinitions[buildingId]?.name ?? "Garden of Life");
    if (option) {
      options.push(option);
    }
  }
  if (options.length === 0) {
    return;
  }

  options.push({ label: "Skip", steps: [] });
  state.adventure?.rewardQueue.push({
    playerId,
    kind: "visit-steps",
    steps: [
      {
        type: "CHOOSE_ONE",
        prompt: `${coreBuildingDefinitions[buildingId]?.name ?? "Garden of Life"}: recruit or reinforce ${def.name} for free`,
        options
      }
    ]
  });
}

function queueHalfGoldReinforce(state: GameState, playerId: PlayerId, buildingId: string, tiers: string[]): void {
  const player = state.players[playerId];
  if (!player) {
    return;
  }

  const options: { label: string; steps: VisitStep[] }[] = [];
  for (const unit of player.army) {
    if (unit.side !== "few") {
      continue;
    }

    const def = coreUnitDefinitions[unit.unitDefId];
    const packSide = getUnitSide(unit.unitDefId, "pack");
    if (!def || !packSide || !tiers.includes(def.tier)) {
      continue;
    }

    const cost: ResourceCost = { ...packSide.cost };
    cost.gold = Math.ceil((cost.gold ?? 0) / 2);
    if (!hasResources(player, cost)) {
      continue;
    }

    const costLabel = Object.entries(cost)
      .filter(([, amount]) => amount)
      .map(([resource, amount]) => `${amount} ${resource}`)
      .join(" + ");
    options.push({
      label: `Reinforce ${def.name} (${costLabel || "free"})`,
      steps: [{ type: "REINFORCE_HALF_GOLD", armyUnitId: unit.id }]
    });
  }

  // Polish Unit Stacks: the Saplings' half-gold deal also buys ONE Stack layer
  // on a matching-tier Pack/Neutral card (half the Stack gold, rounded up —
  // the same rounding as its reinforce).
  for (const target of stackOfferTargets(state, playerId, tiers)) {
    const option = stackOfferOption(
      state,
      playerId,
      target,
      Math.ceil(target.baseGold / 2),
      coreBuildingDefinitions[buildingId]?.name ?? "Saplings"
    );
    if (option) {
      options.push(option);
    }
  }

  if (options.length === 0) {
    return;
  }

  options.push({ label: "Skip", steps: [] });
  state.adventure?.rewardQueue.push({
    playerId,
    kind: "visit-steps",
    steps: [
      {
        type: "CHOOSE_ONE",
        prompt: `${coreBuildingDefinitions[buildingId]?.name ?? "Saplings"}: reinforce one unit for half the gold cost`,
        options
      }
    ]
  });
}

/**
 * Cove Pub: "At the beginning of each Astrologers' round, reduce a reinforcement
 * cost by `discount` gold (min 0), once per turn." Modelled like the Saplings
 * half-gold reinforce — a once-per-round CHOOSE_ONE offered at round start to
 * reinforce one eligible owned Few unit for `discount` less gold (or Skip). Only
 * units the player can afford at the discounted price are offered.
 */
function queueFlatGoldReinforce(
  state: GameState,
  playerId: PlayerId,
  buildingId: string,
  discount: number,
  tiers: string[]
): void {
  const player = state.players[playerId];
  if (!player) {
    return;
  }

  const options: { label: string; steps: VisitStep[] }[] = [];
  for (const unit of player.army) {
    if (unit.side !== "few") {
      continue;
    }

    const def = coreUnitDefinitions[unit.unitDefId];
    if (!def || !tiers.includes(def.tier)) {
      continue;
    }

    // Price exactly as the reinforcement will be charged (the Pub flat discount
    // STACKS with any Legion voucher / Stables discount reserved for this unit).
    const cost = reinforceCostFor(state, playerId, unit.id, false, false, false, discount);
    if (!cost || !hasRecruitResources(state, playerId, cost)) {
      continue;
    }

    const costLabel = Object.entries(cost)
      .filter(([, amount]) => amount)
      .map(([resource, amount]) => `${amount} ${resource}`)
      .join(" + ");
    options.push({
      label: `Reinforce ${def.name} (${costLabel || "free"})`,
      steps: [{ type: "REINFORCE_FLAT_GOLD", armyUnitId: unit.id, discount }]
    });
  }

  // Polish Unit Stacks: the Pub's flat gold discount also buys ONE Stack layer
  // on a matching-tier Pack/Neutral card (Stack gold − discount, min 0).
  for (const target of stackOfferTargets(state, playerId, tiers)) {
    const option = stackOfferOption(
      state,
      playerId,
      target,
      Math.max(0, target.baseGold - discount),
      coreBuildingDefinitions[buildingId]?.name ?? "Pub"
    );
    if (option) {
      options.push(option);
    }
  }

  if (options.length === 0) {
    return;
  }

  options.push({ label: "Skip", steps: [] });
  state.adventure?.rewardQueue.push({
    playerId,
    kind: "visit-steps",
    steps: [
      {
        type: "CHOOSE_ONE",
        prompt: `${coreBuildingDefinitions[buildingId]?.name ?? "Pub"}: reinforce one unit for ${discount} less gold`,
        options
      }
    ]
  });
}

/**
 * Starts a player turn: the hand draws back up to the (effective) hand limit
 * automatically; if the hand is over the limit the player must discard down
 * first. The optional mulligan — discard any number, draw that many — stays
 * open until the player takes their first real action.
 */
export function startPlayerTurn(state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  if (!player) {
    return;
  }

  // Dragon Conqueror: holding the Dragon Utopia into the start of your turn
  // wins the game before anything else this turn resolves.
  checkDragonConquerorHold(state, playerId);
  if (state.adventure?.winnerPlayerId) {
    return;
  }

  // Ongoing cards (Luck, Logistics, Scouting…) last until their owner's next
  // turn starts: expire them now, not when the playing turn ended.
  const expired = expireEffectsForTurnEnd(state, playerId);
  for (const effect of expired) {
    appendEvent(state, { type: "ACTIVE_EFFECT_EXPIRED", effectId: effect.id, reason: "turn-ended" });
  }
  // Held ongoing cards reach the discard pile (or a recalled spell the hand)
  // before the hand refills, so the hand-limit check sees the final hand.
  releaseEndedOngoingCards(state);

  const astrologers = state.adventure?.astrologers;
  if (astrologers) {
    astrologers.swiftWeaselUsedBy = [];
  }
  for (const candidate of Object.values(state.players)) {
    candidate.combatStats.spellsCastThisTurn = 0;
  }

  appendEvent(state, { type: "TURN_STARTED", playerId, round: state.round });

  // Watering Hole (Factory): a hero that visited last turn gains +1 movement
  // for this turn only (the flag is set when movement is zeroed on visit).
  for (const hero of Object.values(state.heroes)) {
    if (hero.controllerId === playerId && hero.wateringHoleBonusPending) {
      hero.movementPoints += 1;
      hero.wateringHoleBonusPending = false;
    }
  }

  // The start-of-turn hand step is offered on EVERY turn, including the first:
  // the player MAY discard any number of cards and then draw back up to the
  // hand limit ("draw new" = discard nothing; "discard and draw new" = toss
  // some first). The hand is NEVER drawn automatically, so the player can never
  // both keep a fresh full hand AND swap on top of it — it is one either/or
  // choice. Only an over-the-limit hand forces a discard before acting.
  //
  // The snapshot (forced discard + optional draw) is NOT taken here. The first
  // player of a Round starts their turn in the same engine step that just queued
  // the "beginning of the round" building effects (City Hall income/draws,
  // Wall of Knowledge, …) and the "beginning of your turn" effects queued just
  // below — all of which can still change the hand. So the hand step is queued
  // as the LAST start-of-turn reward and the snapshot is taken when it pumps,
  // once every earlier phase has resolved (see "start-turn-hand").
  player.canMulligan = false;
  player.needsHandRefresh = false;
  // Army map abilities reset for the new turn (Nomads' step, Rogues' scout, Satyrs' roll).
  player.nomadStepDoneThisTurn = false;
  player.rogueScoutUsedThisTurn = false;
  player.satyrMoraleRollUsedThisTurn = false;
  // Pandora's Bargain: Power upkeep is owed again each of the player's turns.
  player.pandoraUpkeepResolvedThisTurn = false;
  // Legion artifacts: banked discount vouchers are current-turn — they expire now
  // (the owner's next turn), like the other map abilities, so an unused voucher
  // never carries over.
  player.recruitDiscounts = [];

  // "Resolve any 'at the beginning of your turn' abilities after drawing":
  // Necromancy Amplifier, Portal of Summoning, Mana Vortex.
  queueTurnStartBuildingChoices(state, playerId);

  // Phase divider: the hand-limit snapshot runs after every effect queued above
  // (this turn's start-of-turn effects) and every round-start effect queued
  // before this call. A pure-combat fixture has no reward queue — take the
  // snapshot inline there.
  if (state.adventure) {
    state.adventure.rewardQueue.push({ playerId, kind: "start-turn-hand" });
  } else {
    finalizeStartOfTurnHand(state, playerId);
  }

  // Opening free-rotation of the home (Ⅰ) tile (BINH house rule): forced ONCE,
  // at the start of the player's first turn, before they may move. Raised AFTER
  // the start-of-turn rewards are queued; the pendingTileChoice gate keeps those
  // (and everything else) on hold until the rotation is locked — the queued hand
  // step then resolves the moment SET_TILE_ROTATION clears the gate.
  // Parallel turns start EVERY player's first turn at once, but the rotation
  // choice is a singleton: only the first unrotated player opens theirs here;
  // each SET_TILE_ROTATION then opens the next player's (see setTileRotation →
  // beginNextPendingStartTileRotation), one at a time in seat order.
  if (player.startTileRotated === false && !state.adventure?.pendingTileChoice) {
    beginStartTileRotation(state, playerId);
  }
}

/**
 * Parallel turns: opens the NEXT player's forced home-tile rotation (seat
 * order) once the previous one locked. No-op when every home tile is rotated
 * or a tile choice is already open.
 */
export function beginNextPendingStartTileRotation(state: GameState): void {
  if (state.adventure?.pendingTileChoice) {
    return;
  }
  for (const playerId of state.turnOrder) {
    const player = state.players[playerId];
    if (player && !player.eliminated && player.startTileRotated === false) {
      beginStartTileRotation(state, playerId);
      if (state.adventure?.pendingTileChoice) {
        return;
      }
    }
  }
}

/** The player's own faction Ⅰ (starting) tile — the one whose centre their home flag sits on. */
function findPlayerStartTile(state: GameState, playerId: PlayerId): MapTileState | null {
  const adventure = state.adventure;
  if (!adventure) {
    return null;
  }
  for (const tile of Object.values(adventure.tiles)) {
    if (tile.group !== "starting") {
      continue;
    }
    const center = adventure.fields[hexSpaceId({ row: tile.centerRow, col: tile.centerCol })];
    if (center?.flagOwnerId === playerId) {
      return tile;
    }
  }
  return null;
}

/**
 * Opens the one-time opening free-rotation of `playerId`'s home (Ⅰ) tile: it is
 * flipped to `awaitingRotation` and a "starting" pendingTileChoice is raised, so
 * legal-actions offers ONLY the six SET_TILE_ROTATION picks until the player
 * locks one. The town and main hero sit on the rotation-invariant centre, so
 * they never move — only the six ring fields turn. No-op (marks done) when the
 * player has no home tile to turn, so the turn can never get stuck.
 */
function beginStartTileRotation(state: GameState, playerId: PlayerId): void {
  const adventure = state.adventure;
  const player = state.players[playerId];
  if (!adventure || !player) {
    return;
  }
  const startTile = findPlayerStartTile(state, playerId);
  if (!startTile) {
    player.startTileRotated = true;
    return;
  }
  startTile.awaitingRotation = true;
  adventure.pendingTileChoice = { tileInstanceId: startTile.id, playerId, kind: "starting" };
}

/**
 * Opens the start-of-turn hand step for `playerId`: the optional discard-and-draw
 * (`canMulligan`) plus the forced discard-down (`needsHandRefresh`) when the hand
 * sits over the effective limit. Called from the "start-turn-hand" reward so the
 * snapshot reflects every round-start and start-of-turn effect that ran first.
 */
export function finalizeStartOfTurnHand(state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  if (!player) {
    return;
  }
  player.canMulligan = true;
  player.needsHandRefresh = player.hand.length > effectiveHandLimit(state, playerId);
}

/**
 * Queues the optional "at the beginning of your turn" town-building choices
 * for the player whose turn just started. Each opens as a prompt with a Skip
 * option once the queue pumps.
 */
function queueTurnStartBuildingChoices(state: GameState, playerId: PlayerId): void {
  const adventure = state.adventure;
  const player = state.players[playerId];
  const town = getTownOfPlayer(state, playerId);
  if (!adventure || !player || !town) {
    return;
  }

  for (const buildingId of town.buildings) {
    const building = coreBuildingDefinitions[buildingId];
    switch (building?.effect?.type) {
      case "TURN_START_NECROMANCY": {
        const hasSpecialtyInDiscard = player.discard.some(
          (cardId) => cardLibrary[cardId]?.kind === "hero-specialty"
        );
        // A hero never keeps a duplicate Ability: once this player already owns
        // the Necromancy card (hand/deck/discard/ongoing), the "Search the Ability
        // deck for a Necromancy card" option must NOT be offered — they may only
        // take a Specialty back (or Skip). canAcquireSharedDeckCard returns false
        // when the card is already held (and for a non-Necropolis hero, who can
        // never take it at all).
        const canFetchNecromancy = canAcquireSharedDeckCard(state, playerId, "abilities", NECROMANCY_ABILITY_ID);
        const options: { label: string; steps: VisitStep[] }[] = [];
        if (canFetchNecromancy) {
          options.push({ label: "Search the Ability deck for a Necromancy card", steps: [{ type: "NECROMANCY_FETCH" }] });
        }
        if (hasSpecialtyInDiscard) {
          options.push({
            label: "Take 1 Specialty card from your discard pile",
            steps: [{ type: "DISCARD_PICK", count: 1, filter: "specialty" }]
          });
        }
        // Nothing useful to offer (already own Necromancy AND no Specialty to
        // recall): don't queue a pointless Skip-only prompt.
        if (options.length === 0) {
          break;
        }
        options.push({ label: "Skip", steps: [] });
        adventure.rewardQueue.push({
          playerId,
          kind: "visit-steps",
          steps: [{ type: "CHOOSE_ONE", prompt: `${building.name}: choose one`, options }]
        });
        break;
      }
      case "TURN_START_PORTAL_SUMMON": {
        const tiers = new Set<string>();
        for (const built of town.buildings) {
          const builtEffect = coreBuildingDefinitions[built]?.effect;
          if (builtEffect?.type === "UNLOCK_RECRUIT_TIER" && builtEffect.tier !== "azure") {
            tiers.add(builtEffect.tier);
          }
        }
        if (tiers.size === 0) {
          break;
        }
        const options: { label: string; steps: VisitStep[] }[] = [...tiers].map((tier) => ({
          label: `Draw a ${tier} Neutral Unit card`,
          steps: [{ type: "PORTAL_SUMMON", tier: tier as "bronze" | "silver" | "gold" }]
        }));
        options.push({ label: "Skip", steps: [] });
        adventure.rewardQueue.push({
          playerId,
          kind: "visit-steps",
          steps: [{ type: "CHOOSE_ONE", prompt: `${building.name}: draw a Neutral Unit card to recruit?`, options }]
        });
        break;
      }
      case "TURN_START_MANA_VORTEX": {
        if (player.hand.length === 0 || player.discard.length === 0) {
          break;
        }
        const seen = new Set<string>();
        const options: { label: string; steps: VisitStep[] }[] = [];
        for (const cardId of player.hand) {
          if (seen.has(cardId)) {
            continue;
          }
          seen.add(cardId);
          options.push({
            label: `Discard ${cardLibrary[cardId]?.name ?? cardId}`,
            steps: [{ type: "MANA_VORTEX_RESOLVE", discardCardId: cardId }]
          });
        }
        options.push({ label: "Skip", steps: [] });
        adventure.rewardQueue.push({
          playerId,
          kind: "visit-steps",
          steps: [
            {
              type: "CHOOSE_ONE",
              prompt: `${building.name}: discard 1 card to shuffle your discard pile into your deck, then Search (3)?`,
              options
            }
          ]
        });
        break;
      }
      default:
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Astrologers Proclaim (even rounds)
// ---------------------------------------------------------------------------

/**
 * Proclamations whose printed exception says "drawn on the first Astrologers'
 * round: discard it and draw another card" (Friendly Beaver, Restart).
 */
const FIRST_ROUND_REDRAWN_PROCLAMATIONS: ReadonlySet<string> = new Set<string>([
  "astrologers.friendly_beaver",
  "astrologers.restart"
]);

/** A Neutral-deck card the Elementals proclamation digs for. */
function isNeutralElementalUnit(unitDefId: string): boolean {
  return Boolean(coreUnitDefinitions[unitDefId]?.name.includes("Elemental"));
}

/**
 * Elementals (Astrologers, Conflux): "For each Neutral Unit deck except Azure,
 * discard until you find an Elemental. Place each Elemental face up on top of
 * its deck." Each of the bronze/silver/gold decks is dug top-down; discarded
 * non-Elementals go to the tier's discard pile. A draw pile that exhausts
 * mid-dig reshuffles its discards back in ONCE (the printed exhausted-deck
 * rule) and keeps digging; a deck with no Elemental left anywhere (all at
 * large in armies) is skipped. The seeded Elemental stays on top, so the next
 * guard drawn from that deck IS the Elemental. The engine has no face-up deck
 * display, so a feed note names the seeded cards — the same public information
 * the physical face-up cards give the table.
 */
function seedNeutralElementals(state: GameState): void {
  const seeded: string[] = [];
  for (const tier of ["bronze", "silver", "gold"] as const) {
    const deck = state.decks[NEUTRAL_DECK_IDS[tier]];
    if (!deck) {
      continue;
    }
    let reshuffled = false;
    for (;;) {
      if (deck.drawPile.length === 0) {
        if (reshuffled || deck.discardPile.length === 0) {
          break;
        }
        deck.drawPile = shuffleCards(
          deck.discardPile,
          `${state.seed}#astrologers-elementals#${tier}#${eventSeedNumber(state)}`
        );
        deck.discardPile = [];
        reshuffled = true;
        continue;
      }
      const top = deck.drawPile[deck.drawPile.length - 1];
      if (isNeutralElementalUnit(top)) {
        seeded.push(coreUnitDefinitions[top]?.name ?? top);
        break;
      }
      deck.discardPile.push(deck.drawPile.pop() as string);
    }
  }
  if (seeded.length > 0) {
    appendEvent(state, {
      type: "EVENT_NOTE",
      message: `Elementals: ${seeded.join(", ")} now sit face up on top of the Neutral decks.`
    });
  }
}

function expireActiveAstrologersCard(state: GameState): void {
  const astrologers = getAstrologersState(state);
  const deck = state.decks[ASTROLOGERS_DECK_ID];
  if (!astrologers || !astrologers.activeCardId) {
    return;
  }

  deck?.discardPile.push(astrologers.activeCardId);
  astrologers.activeCardId = null;
  astrologers.crazyWizardUsedBy = [];
  astrologers.swiftWeaselUsedBy = [];
  astrologers.heroEmpowerChosenRoundBy = {};
  astrologers.heroEmpowerUsesBy = {};
  astrologers.firstCombatGroundAttackUsed = false;
  astrologers.disruptionRotatedTileIds = [];
}

/**
 * "Ignore this card and draw another one" — printed board-state gates checked
 * at draw. Disruption is unresolvable when no tile is rotatable at all (every
 * revealed tile carries a hero, a town, a gate — or nothing is revealed yet).
 * A card not listed here is always applicable.
 */
function proclamationRequiresRedraw(state: GameState, cardId: string): boolean {
  if (astrologersCardDefinitions[cardId]?.effect.type === "ROTATE_TILE_EACH") {
    return disruptionEligibleTiles(state).length === 0;
  }
  return false;
}

function popAstrologersCard(state: GameState): string | undefined {
  const deck = state.decks[ASTROLOGERS_DECK_ID];
  if (!deck) {
    return undefined;
  }

  if (deck.drawPile.length === 0 && deck.discardPile.length > 0) {
    deck.drawPile = shuffleCards(deck.discardPile, `${state.seed}#astrologers-reshuffle#${eventSeedNumber(state)}`);
    deck.discardPile = [];
  }

  return deck.drawPile.pop();
}

export function drawAstrologersCard(state: GameState): void {
  const astrologers = getAstrologersState(state);
  if (!astrologers || !state.decks[ASTROLOGERS_DECK_ID]) {
    return;
  }

  let cardId = popAstrologersCard(state);

  // Printed redraw exceptions: Friendly Beaver / Restart drawn on the first
  // Astrologers round, and any card whose board-state gate makes it
  // unresolvable right now (Disruption with no rotatable tile). The skipped
  // card goes to the discard and another is drawn. Bounded by the deck size so
  // a (hypothetical) deck holding only redraw cards keeps the last one drawn
  // instead of looping through the reshuffle forever.
  {
    const deck = state.decks[ASTROLOGERS_DECK_ID];
    let redrawsLeft = (deck?.drawPile.length ?? 0) + (deck?.discardPile.length ?? 0);
    while (
      cardId &&
      redrawsLeft > 0 &&
      ((state.round === 2 && FIRST_ROUND_REDRAWN_PROCLAMATIONS.has(cardId)) || proclamationRequiresRedraw(state, cardId))
    ) {
      deck?.discardPile.push(cardId);
      cardId = popAstrologersCard(state);
      redrawsLeft -= 1;
    }
  }

  if (!cardId) {
    return;
  }

  const card = astrologersCardDefinitions[cardId];
  astrologers.activeCardId = cardId;
  astrologers.heroEmpowerChosenRoundBy = {};
  astrologers.heroEmpowerUsesBy = {};
  appendEvent(state, {
    type: "ASTROLOGERS_DRAWN",
    cardId,
    name: card?.name ?? cardId,
    text: card?.text ?? "",
    round: state.round
  });

  if (card) {
    resolveAstrologersCard(state, card);
  }
}

function resolveAstrologersCard(state: GameState, card: AstrologersCardDefinition): void {
  const astrologers = getAstrologersState(state);
  const adventure = state.adventure;
  if (!astrologers || !adventure) {
    return;
  }

  const playerIds = state.turnOrder.filter((playerId) => playerId !== NEUTRAL_PLAYER_ID);

  switch (card.effect.type) {
    case "NONE":
    case "HAND_LIMIT_MODIFIER":
    case "DIE_REROLL_PER_TURN":
    case "FIRST_SPELL_POWER_BONUS":
    case "SCHOOL_SPELL_POWER_BONUS":
    case "FIRST_SPELL_RETURNS":
    case "NEUTRAL_DRAW_SWAP":
    case "PAID_EMPOWER_PER_TURN":
    case "WAR_MACHINE_BUFF":
    case "GRANT_WAR_MACHINE_CHOICE":
    case "EMPOWER_PER_DISCARD":
    case "PVP_ATTACK_BAN":
    case "SPELL_SEARCH_WIDEN":
    case "COMBAT_WIN_RESOURCE_DIE":
    case "NEUTRAL_DIFFICULTY_LOWER":
    case "NEUTRAL_REDRAW_ALL":
    case "SEA_CONTINUE_AFTER_EMBARK":
    case "FREE_SPELL_BOOK":
    case "DEFEND_FLAT_BONUS":
    case "EVENT_DRAW_PICK":
    case "ABILITY_ROLL_REROLL":
      // Passive while the card stays face up (read where the effect applies:
      // Sanctuary's PvP ban in startPlayerCombat via pvpAttacksBanned; the Spells
      // Search widening in openSharedDeckSearch; Pirates' combat-win die in
      // finalizeAdventureCombat; Rulebook's difficulty drop in drawNeutralArmy;
      // Judge Dread's guard redraw at guard reveal; Wind's embark step in
      // seaStepHalts; Mages' free Spell Book at the Spell Book gate;
      // hand-limit in effectiveHandLimit, die rerolls in maybeReroll, the spell
      // bonuses in getCurrentSpellPower, the spell return in maybeReturnSpell;
      // Hero's paid empower is offered from live hand Statistic card menus;
      // Ammo Cart's war-machine buffs are read
      // in permanents.ts / reducer.ts; McGiver's free war machine is handed out
      // at the next Resource round, see startAdventureRound; Explorers' empower is
      // granted per the cards discarded in each hand refresh, see refreshHand;
      // Plastic Tray's flat Defend payout in resolveDefendBonus (reducer.ts);
      // Forty Thieves' 2-card Event draw in drawEventCard; Multilingual Bron's
      // ability-roll reroll at each roll site via abilityRollRerollActive).
      break;
    case "FIRST_COMBAT_GROUND_ATTACK": {
      // Crag Hack: the ground +1 latches onto the round's first combat in
      // makeCombatShell (passive read). The second clause resolves now: the
      // player whose hero is Crag Hack may reinforce their Goblins for free
      // once — a skippable round-start offer, like Isra's Friends.
      const cragHack = Object.values(state.heroes).find((hero) => hero.heroDefId === "crag_hack");
      const controllerId = cragHack?.controllerId;
      if (controllerId && playerIds.includes(controllerId)) {
        queueFreeUnitReinforce(
          state,
          controllerId,
          "stronghold.goblins",
          "Crag Hack: reinforce your Goblins for free."
        );
      }
      break;
    }
    case "ROTATE_TILE_EACH":
      // Disruption: one skippable rotate offer per seat, in turn order ("starting
      // from the first player"), resolved inside the round-start barrier. Each
      // offer recomputes eligibility live, so earlier rotations drop out
      // ("no tile more than once" via disruptionRotatedTileIds) and a seat left
      // with nothing resolves silently.
      astrologers.disruptionRotatedTileIds = [];
      for (const playerId of playerIds) {
        adventure.rewardQueue.push({ playerId, kind: "visit-steps", steps: [{ type: "DISRUPTION_ROTATE_OFFER" }] });
      }
      break;
    case "GAIN_MORALE_ALL":
      for (const playerId of playerIds) {
        changeMorale(state, playerId, card.effect.amount);
      }
      break;
    case "ROLL_DICE_ALL": {
      const step: VisitStep =
        card.effect.dice === "treasure"
          ? { type: "ROLL_TREASURE_DICE", count: card.effect.count }
          : { type: "ROLL_RESOURCE_DICE", count: card.effect.count };
      for (const playerId of playerIds) {
        adventure.rewardQueue.push({ playerId, kind: "visit-steps", steps: [step] });
      }
      break;
    }
    case "REMOVE_BLACK_CUBES":
      for (const field of Object.values(adventure.fields)) {
        field.blackCube = false;
      }
      break;
    case "SEED_NEUTRAL_ELEMENTALS":
      seedNeutralElementals(state);
      break;
    case "REMOVE_PERMANENT_FOR_GOLD":
      // Destruction: every player holding a permanent must Remove it (out of the
      // GAME) and take the gold. Immediate + mandatory like the morale cards —
      // no interaction, so it resolves cleanly at round start in ordered AND
      // parallel play (all seats handled here before anyone takes a turn). A
      // player with no permanent is untouched and gains nothing.
      for (const playerId of playerIds) {
        const removed = removePermanentFromPlayToRemoved(state, playerId);
        if (!removed) {
          continue;
        }
        appendEvent(state, { type: "PERMANENT_DISCARDED", playerId, cardId: removed, reason: "destruction" });
        gainResources(
          state,
          playerId,
          { gold: card.effect.gold },
          `Destruction removed ${cardLibrary[removed]?.name ?? removed}`
        );
      }
      break;
    case "NEXT_RESOURCE_ROUND":
      astrologers.nextResourceModifiers.gold += card.effect.gold ?? 0;
      astrologers.nextResourceModifiers.valuables += card.effect.valuables ?? 0;
      break;
    case "MOVEMENT_MODIFIER":
      // Tokens already refreshed this round: apply the delta immediately.
      for (const hero of Object.values(state.heroes)) {
        hero.movementPoints = Math.max(0, hero.movementPoints + card.effect.amount);
      }
      break;
    case "RESHUFFLE_ARTIFACTS_SPELLS":
      for (const playerId of playerIds) {
        reshuffleArtifactsAndSpells(state, playerId, card);
      }
      break;
    case "DISCARD_REDRAW_ALL":
      for (const playerId of playerIds) {
        discardHandAndRedraw(state, playerId, card);
      }
      break;
    case "PLAGUE_FLIP_ALL":
      for (const playerId of playerIds) {
        queuePlagueFlip(state, playerId);
      }
      break;
    case "REINFORCE_HALF_COST_ALL":
      for (const playerId of playerIds) {
        queueHalfCostReinforce(state, playerId);
      }
      break;
    case "EMPOWER_STATISTIC_CHOICE":
      for (const playerId of playerIds) {
        queueEmpowerStatisticChoice(state, playerId);
      }
      break;
    case "REMOVE_CARDS_CHOICE":
      for (const playerId of playerIds) {
        queueRemoveCardsChoice(state, playerId, card.effect.count);
      }
      break;
    case "RECRUIT_NEUTRAL_DRAW":
      // Charlie and his Circus: offered now (the drawn Astrologers round) and
      // again at the next Resource round — see startAdventureRound.
      for (const playerId of playerIds) {
        queueNeutralRecruitOffer(state, playerId, { maxDraws: card.effect.maxDraws });
      }
      break;
    case "RECRUIT_FACTION_FREE":
      // Unexpected Reinforcements: a single immediate free recruit of one of the
      // player's own faction units they have the Dwelling for.
      for (const playerId of playerIds) {
        queueFactionRecruitOffer(state, playerId);
      }
      break;
    case "WAR_MACHINE_DISCOUNT_OFFER": {
      // Wandering Merchant: "once during this round, each player can buy a War
      // Machine as if at a Trading Post" — a single discounted buy offer queued
      // per player now (the round it is drawn); not re-offered next round.
      const discountGold = card.effect.discountGold;
      for (const playerId of playerIds) {
        queueWarMachineDiscountOffer(state, playerId, discountGold);
      }
      break;
    }
  }
}

/** Wandering Merchant: queue one discounted war-machine buy offer for a player. */
function queueWarMachineDiscountOffer(state: GameState, playerId: PlayerId, discountGold: number): void {
  const adventure = state.adventure;
  // Nothing to buy from: skip queuing entirely (the offer self-guards too).
  if (!adventure || (adventure.warMachineSupply?.length ?? 0) === 0) {
    return;
  }
  adventure.rewardQueue.push({
    playerId,
    kind: "visit-steps",
    steps: [{ type: "WAR_MACHINE_DISCOUNT_OFFER", discountGold }]
  });
}

/** Annoying Lizard: spells and artifacts shuffle back, redraw as many. */
function reshuffleArtifactsAndSpells(state: GameState, playerId: PlayerId, card: AstrologersCardDefinition): void {
  const player = state.players[playerId];
  if (!player) {
    return;
  }

  const moved: string[] = [];
  player.hand = player.hand.filter((cardId) => {
    const kind = cardLibrary[cardId]?.kind;
    if (kind === "spell" || kind === "artifact") {
      moved.push(cardId);
      return false;
    }
    return true;
  });

  if (moved.length === 0) {
    return;
  }

  player.deck = shuffleCards(
    [...player.deck, ...moved],
    `${state.seed}#annoying-lizard#${playerId}#${eventSeedNumber(state)}`
  );
  const drawn = drawCardsForPlayer(state, playerId, moved.length);
  // Forced effects mutate the hand BETWEEN turns; without a logged event the
  // player cannot tell the reshuffle happened (it looks like the optional
  // start-of-turn draw), so the proclamation reads as skippable. Record it.
  appendEvent(state, {
    type: "ASTROLOGERS_HAND_RESHUFFLED",
    playerId,
    cardId: card.id,
    name: card.name,
    mode: "reshuffle-spells",
    discarded: moved.length,
    drawn,
    round: state.round
  });
}

/** Big Cleanup: discard the whole hand to the discard pile, redraw as many. */
function discardHandAndRedraw(state: GameState, playerId: PlayerId, card: AstrologersCardDefinition): void {
  const player = state.players[playerId];
  if (!player || player.hand.length === 0) {
    return;
  }

  const count = player.hand.length;
  player.discard.push(...player.hand);
  player.hand = [];
  const drawn = drawCardsForPlayer(state, playerId, count);
  // Logged so the forced discard is visible to the player (see the note in
  // reshuffleArtifactsAndSpells) — it is mandatory and cannot be skipped.
  appendEvent(state, {
    type: "ASTROLOGERS_HAND_RESHUFFLED",
    playerId,
    cardId: card.id,
    name: card.name,
    mode: "discard-all",
    discarded: count,
    drawn,
    round: state.round
  });
}

function queuePlagueFlip(state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  if (!player) {
    return;
  }

  const packs = player.army.filter((unit) => unit.side === "pack");
  if (packs.length === 0) {
    return;
  }

  if (packs.length === 1) {
    applyPlagueToPack(state, playerId, packs[0]);
    return;
  }

  state.adventure?.rewardQueue.push({
    playerId,
    kind: "visit-steps",
    steps: [
      {
        type: "CHOOSE_ONE",
        prompt: "Terrible Plague: flip one of your packs to its Few side",
        options: packs.map((unit) => ({
          // Polish Unit Stacks weaken the Plague: a Stacked pack sheds ONE
          // Stack layer instead of flipping (see applyPlagueToPack).
          label: (unit.stacks ?? 0) > 0
            ? `Weakened by Stacks: ${coreUnitDefinitions[unit.unitDefId]?.name ?? unit.unitDefId} loses 1 Stack (stays a Pack)`
            : `Flip ${coreUnitDefinitions[unit.unitDefId]?.name ?? unit.unitDefId}`,
          steps: [{ type: "FLIP_PACK_TO_FEW", armyUnitId: unit.id, source: "plague" }]
        }))
      }
    ]
  });
}

/**
 * Terrible Plague landing on one Pack. Polish Unit Stacks WEAKEN the Plague: a
 * pack carrying Stack layers sheds ONE layer and stays a Pack; only an
 * unstacked pack flips to its Few side (which is all that can happen with the
 * rule off — Stacks exist only under it).
 */
export function applyPlagueToPack(state: GameState, playerId: PlayerId, unit: ArmyUnitState): void {
  if ((unit.stacks ?? 0) > 0) {
    unit.stacks = (unit.stacks ?? 0) - 1;
    if (unit.stacks === 0) {
      delete unit.stacks;
    }
    appendEvent(state, {
      type: "ARMY_STACK_LOST",
      unitId: unit.id,
      playerId,
      unitName: coreUnitDefinitions[unit.unitDefId]?.name ?? unit.unitDefId,
      remainingStacks: unit.stacks ?? 0,
      excessDamage: 0,
      reason: "Terrible Plague (weakened by Stacks)"
    });
    return;
  }
  unit.side = "few";
  delete unit.stacks;
  appendEvent(state, {
    type: "ARMY_UNIT_FLIPPED",
    playerId,
    unitDefId: unit.unitDefId,
    reason: "Terrible Plague"
  });
}

function queueHalfCostReinforce(state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  if (!player) {
    return;
  }

  const options: { label: string; steps: VisitStep[] }[] = [];
  for (const unit of player.army) {
    if (unit.side !== "few" || !getUnitSide(unit.unitDefId, "pack")) {
      continue;
    }

    // Half-cost (all resources, rounded up) — but a Legion voucher reserved for
    // this unit may make it cheaper still (non-stacking; see reinforceCostFor),
    // so the label and the affordability gate use the actual charged cost.
    const finalCost = reinforceCostFor(state, playerId, unit.id, true, false, false);
    if (!finalCost || !hasResources(player, finalCost)) {
      continue;
    }

    const costLabel =
      Object.entries(finalCost)
        .filter(([, amount]) => amount)
        .map(([resource, amount]) => `${amount} ${resource}`)
        .join(" + ") || "free";
    options.push({
      label: `Reinforce ${coreUnitDefinitions[unit.unitDefId]?.name ?? unit.unitDefId} (${costLabel})`,
      steps: [{ type: "REINFORCE_ARMY_UNIT", armyUnitId: unit.id, halfCost: true }]
    });
  }

  if (options.length === 0) {
    return;
  }

  options.push({ label: "Skip", steps: [] });
  state.adventure?.rewardQueue.push({
    playerId,
    kind: "visit-steps",
    steps: [{ type: "CHOOSE_ONE", prompt: "Isra's Friends: reinforce one Few unit at half cost", options }]
  });
}

/**
 * Dancing Imp: queue an optional, free empower of one Statistic card (drawn
 * from the hand OR discard pile) into the same-type Empowered Statistic. Only
 * queued when the player actually holds an empowerable Statistic, so the prompt
 * never appears empty.
 */
function queueEmpowerStatisticChoice(state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  if (!player || !hasEmpowerableStatistic(player, ["hand", "discard"])) {
    return;
  }
  state.adventure?.rewardQueue.push({
    playerId,
    kind: "visit-steps",
    steps: [
      {
        type: "STAT_EMPOWER_OFFER",
        sources: ["hand", "discard"],
        remaining: 1,
        prompt: "Dancing Imp: empower one Statistic card (hand or discard)"
      }
    ]
  });
}

/**
 * Explorers (Astrologers): after a start-of-turn hand refresh that discarded
 * some cards, queue up to `count` free same-type Statistic empowers (hand or
 * discard), where `count` is floor(discarded / 3). Only queued when the player
 * actually holds something to empower, so it never opens an empty prompt.
 */
export function queueExplorersEmpower(state: GameState, playerId: PlayerId, count: number): void {
  const player = state.players[playerId];
  if (!player || count <= 0 || !hasEmpowerableStatistic(player, ["hand", "discard"])) {
    return;
  }
  state.adventure?.rewardQueue.push({
    playerId,
    kind: "visit-steps",
    steps: [
      {
        type: "STAT_EMPOWER_OFFER",
        sources: ["hand", "discard"],
        remaining: count,
        prompt: `Explorers: empower up to ${count} Statistic card(s) (hand or discard)`
      }
    ]
  });
}

/**
 * Charlie and his Circus (Astrologers): queue a paid Neutral-Unit recruit offer
 * for `playerId`. Only queued when the player controls at least one Dwelling tier
 * to draw from (the offer step itself also self-guards on an empty draw). Azure
 * is never among the tiers — no Dwelling unlocks it.
 */
export function queueNeutralRecruitOffer(state: GameState, playerId: PlayerId, options: { maxDraws: number }): void {
  if (unlockedRecruitTiers(state, playerId).size === 0) {
    return;
  }
  state.adventure?.rewardQueue.push({
    playerId,
    kind: "visit-steps",
    steps: [{ type: "NEUTRAL_RECRUIT_OFFER", ...options }]
  });
}

/**
 * Unexpected Reinforcements (Astrologers): queue a free recruit offer over the
 * Neutral Units deck cards associated with the player's faction (the neutral
 * counterpart of a roster unit) whose Dwelling tier they have built and whose
 * card is still in the deck. Only queued when at least one such unit exists, so
 * it never opens an empty prompt. Reads the live faction roster, so any faction
 * works (Conflux/Cove once defined).
 */
export function queueFactionRecruitOffer(state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  const associated = (player?.factionId ? neutralUnitIdsByFaction[player.factionId] : undefined) ?? [];
  const unlocked = unlockedRecruitTiers(state, playerId);
  const canRecruit = associated.some((unitDefId) => {
    const def = coreUnitDefinitions[unitDefId];
    return Boolean(def?.neutral) && unlocked.has(def!.tier) && neutralDeckHas(state, def!.tier, unitDefId);
  });
  if (!canRecruit) {
    return;
  }
  state.adventure?.rewardQueue.push({
    playerId,
    kind: "visit-steps",
    steps: [{ type: "FACTION_RECRUIT_OFFER" }]
  });
}

/**
 * Plane Between Planes: queue an optional removal of up to `count` cards from
 * the player's hand or discard pile. Skipped when both piles are empty.
 */
function queueRemoveCardsChoice(state: GameState, playerId: PlayerId, count: number): void {
  const player = state.players[playerId];
  if (!player || count <= 0 || (player.hand.length === 0 && player.discard.length === 0)) {
    return;
  }
  state.adventure?.rewardQueue.push({
    playerId,
    kind: "visit-steps",
    steps: [{ type: "REMOVE_UP_TO", remaining: count }]
  });
}

/** Whether `player` holds at least one non-Empowered Statistic in `sources`. */
function hasEmpowerableStatistic(player: PlayerState, sources: ("hand" | "discard")[]): boolean {
  return sources.some((source) =>
    player[source].some((cardId) => {
      const card = cardLibrary[cardId];
      return card?.kind === "statistic" && Boolean(card.statisticType) && !cardId.endsWith(".empowered");
    })
  );
}

/**
 * Hero (ongoing): the paid Statistic exchange is a live hand-card action. The
 * first use chooses this player's turn for the face-up Hero card; any second
 * use must happen during the same turn's round. Skipping the Astrologers-round
 * turn leaves the Resource-round turn available because the card remains face
 * up until the next Astrologers round.
 */
function activeHeroEmpowerEffect(state: GameState): { costGold: number; maxPerTurn: number } | null {
  const active = getActiveAstrologersCard(state);
  return active?.effect.type === "PAID_EMPOWER_PER_TURN" ? active.effect : null;
}

export function astrologersHeroEmpowerRemaining(state: GameState, playerId: PlayerId): number {
  const effect = activeHeroEmpowerEffect(state);
  const astrologers = state.adventure?.astrologers;
  if (!effect || !astrologers) {
    return 0;
  }

  const chosenRound = astrologers.heroEmpowerChosenRoundBy?.[playerId];
  if (chosenRound !== undefined && chosenRound !== state.round) {
    return 0;
  }

  const used = chosenRound === state.round ? (astrologers.heroEmpowerUsesBy?.[playerId] ?? 0) : 0;
  return Math.max(0, effect.maxPerTurn - used);
}

export function canUseAstrologersHeroEmpower(state: GameState, playerId: PlayerId, cardId: CardId): boolean {
  const effect = activeHeroEmpowerEffect(state);
  const player = state.players[playerId];
  const card = cardLibrary[cardId];
  return Boolean(
    effect &&
      player &&
      player.hand.includes(cardId) &&
      hasResources(player, { gold: effect.costGold }) &&
      astrologersHeroEmpowerRemaining(state, playerId) > 0 &&
      card?.kind === "statistic" &&
      card.statisticType &&
      !cardId.endsWith(".empowered")
  );
}

export function applyAstrologersHeroEmpower(state: GameState, playerId: PlayerId, cardId: CardId): void {
  const effect = activeHeroEmpowerEffect(state);
  const astrologers = getAstrologersState(state);
  const player = state.players[playerId];
  const card = cardLibrary[cardId];
  const statisticType = card?.statisticType;
  const handIndex = player?.hand.indexOf(cardId) ?? -1;

  if (!effect || !astrologers || !player || !statisticType || handIndex === -1) {
    throw new Error("Hero cannot empower that Statistic card right now.");
  }
  if (!canUseAstrologersHeroEmpower(state, playerId, cardId)) {
    throw new Error("Hero cannot empower that Statistic card right now.");
  }

  astrologers.heroEmpowerChosenRoundBy ??= {};
  astrologers.heroEmpowerUsesBy ??= {};
  astrologers.heroEmpowerChosenRoundBy[playerId] ??= state.round;
  if (astrologers.heroEmpowerChosenRoundBy[playerId] !== state.round) {
    throw new Error("Hero's Statistic exchanges must happen during the one turn you chose.");
  }

  spendResources(state, playerId, { gold: effect.costGold }, "Hero Astrologers Proclaim");
  player.hand.splice(handIndex, 1);
  player.removed.push(cardId);
  player.hand.push(`stat.${statisticType}.empowered`);
  astrologers.heroEmpowerUsesBy[playerId] = (astrologers.heroEmpowerUsesBy[playerId] ?? 0) + 1;
}

/**
 * Freelancer's Guild: "When Reinforcing or Recruiting you can pay the gold cost
 * with building materials and valuables at MARKET RATES." Returns how many spare
 * materials/valuables to spend toward a gold shortfall and the gold value those
 * cover — each material is worth `marketGoldValueOf("buildingMaterials")` gold
 * (1) and each valuables `marketGoldValueOf("valuables")` gold (3), exactly the
 * Trading Post sell rates. Materials (which divide the gold 1:1) settle the exact
 * remainder; a final valuables lot can overshoot the last 1–2 gold the way a
 * market trade buys in whole lots. Without the guild, nothing is substituted.
 */
function freelancerGoldSubstitution(state: GameState, playerId: PlayerId, cost: ResourceCost): {
  fromMaterials: number;
  fromValuables: number;
  goldCovered: number;
} {
  const none = { fromMaterials: 0, fromValuables: 0, goldCovered: 0 };
  const player = state.players[playerId];
  const town = getTownOfPlayer(state, playerId);
  const hasGuild = Boolean(
    town?.buildings.some((buildingId) => coreBuildingDefinitions[buildingId]?.effect?.type === "FREELANCERS_GUILD")
  );
  if (!player || !hasGuild) {
    return none;
  }

  const shortfall = Math.max(0, (cost.gold ?? 0) - player.resources.gold);
  if (shortfall === 0) {
    return none;
  }

  const materialValue = marketGoldValueOf("buildingMaterials");
  const valuableValue = marketGoldValueOf("valuables");
  const spareMaterials = Math.max(0, player.resources.buildingMaterials - (cost.buildingMaterials ?? 0));
  const spareValuables = Math.max(0, player.resources.valuables - (cost.valuables ?? 0));

  // Use whole valuables lots that fit without overshooting, then settle the
  // remainder with materials. If materials run short, spend one extra valuables
  // lot (an over-payment, as a market trade in whole lots would be).
  let remaining = shortfall;
  let fromValuables = Math.min(spareValuables, Math.floor(remaining / valuableValue));
  remaining -= fromValuables * valuableValue;
  const fromMaterials = Math.min(spareMaterials, Math.ceil(remaining / materialValue));
  remaining -= fromMaterials * materialValue;
  if (remaining > 0 && fromValuables < spareValuables) {
    fromValuables += 1;
    remaining -= valuableValue;
  }

  const goldCovered = fromMaterials * materialValue + fromValuables * valuableValue;
  return { fromMaterials, fromValuables, goldCovered };
}

/** A recruit/reinforce cost with the guild's market-rate gold substitution folded in. */
function recruitCostWithSubstitution(state: GameState, playerId: PlayerId, cost: ResourceCost): ResourceCost {
  const substitution = freelancerGoldSubstitution(state, playerId, cost);
  if (substitution.fromMaterials === 0 && substitution.fromValuables === 0) {
    return cost;
  }
  return {
    gold: Math.max(0, (cost.gold ?? 0) - substitution.goldCovered),
    buildingMaterials: (cost.buildingMaterials ?? 0) + substitution.fromMaterials,
    valuables: (cost.valuables ?? 0) + substitution.fromValuables
  };
}

/** Whether a recruit/reinforce cost is payable, counting the guild substitution. */
export function hasRecruitResources(state: GameState, playerId: PlayerId, cost: ResourceCost): boolean {
  const player = state.players[playerId];
  if (!player) {
    return false;
  }
  return hasResources(player, cost) || hasResources(player, recruitCostWithSubstitution(state, playerId, cost));
}

/** Pays a recruit/reinforce cost, letting the guild substitute gold 1:1. */
export function spendRecruitResources(state: GameState, playerId: PlayerId, cost: ResourceCost, reason: string): void {
  const player = state.players[playerId];
  if (!player) {
    return;
  }

  if (hasResources(player, cost)) {
    spendResources(state, playerId, cost, reason);
    return;
  }

  spendResources(
    state,
    playerId,
    recruitCostWithSubstitution(state, playerId, cost),
    `${reason} (Freelancer's Guild pays resources as gold)`
  );
}

/** Whether a hero the player controls stands on a field carrying `location`. */
export function playerHeroOnLocation(state: GameState, playerId: PlayerId, location: string): boolean {
  const adventure = state.adventure;
  if (!adventure) {
    return false;
  }
  return Object.values(state.heroes).some(
    (hero) =>
      hero.controllerId === playerId && hero.spaceId !== null && adventure.fields[hero.spaceId]?.location === location
  );
}

/**
 * Champions' "Stable Master": gold knocked off a unit's reinforcement cost
 * while a hero the player controls stands on the matching field (Stables).
 * Reads the unit's printed MAP_REINFORCE_DISCOUNT map abilities.
 */
export function reinforceGoldDiscount(state: GameState, playerId: PlayerId, unitDefId: string): number {
  const def = coreUnitDefinitions[unitDefId];
  if (!def) {
    return 0;
  }
  const abilityIds = new Set<string>([
    ...(def.few?.abilities ?? []),
    ...(def.pack?.abilities ?? []),
    ...(def.neutral?.abilities ?? [])
  ]);
  let discount = 0;
  for (const abilityId of abilityIds) {
    const mapEffect = unitAbilities[abilityId]?.mapEffect;
    if (mapEffect?.type === "MAP_REINFORCE_DISCOUNT" && playerHeroOnLocation(state, playerId, mapEffect.location)) {
      discount += mapEffect.amount;
    }
  }
  return discount;
}

/** Applies the Champions' reinforcement gold discount to a pack cost (gold floored at 0). */
export function discountedReinforceCost(
  state: GameState,
  playerId: PlayerId,
  unitDefId: string,
  cost: ResourceCost
): ResourceCost {
  const discount = reinforceGoldDiscount(state, playerId, unitDefId);
  if (discount <= 0) {
    return cost;
  }
  return { ...cost, gold: Math.max(0, (cost.gold ?? 0) - discount) };
}

/**
 * A pending recruit/reinforce purchase, used to look up the best gold discount
 * and to match/spend Legion vouchers. `unitDefId` is always the unit's
 * definition id; reinforces also carry the army unit being upgraded.
 */
export type RecruitPurchaseRef =
  | { kind: "recruit"; unitDefId: string }
  | { kind: "reinforce"; unitDefId: string; armyUnitId: string }
  /** Polish Unit Stacks: one Stack layer bought for an eligible army card. */
  | { kind: "stack"; unitDefId: string; armyUnitId: string };

/** Whether a banked voucher is reserved for exactly this purchase's unit. */
function voucherMatchesPurchase(voucher: RecruitDiscountVoucher, purchase: RecruitPurchaseRef): boolean {
  if (voucher.target.kind !== purchase.kind) {
    return false;
  }
  return voucher.target.kind === "recruit"
    ? voucher.target.unitDefId === purchase.unitDefId
    : purchase.kind !== "recruit" && voucher.target.armyUnitId === purchase.armyUnitId;
}

/**
 * The largest Legion voucher gold reserved for this exact unit (0 if none).
 * Legion pieces NEVER stack with each other, so two pieces aimed at the same
 * unit yield the bigger of the two — never their sum.
 */
export function legionVoucherDiscount(state: GameState, playerId: PlayerId, purchase: RecruitPurchaseRef): number {
  let best = 0;
  for (const voucher of state.players[playerId]?.recruitDiscounts ?? []) {
    if (voucherMatchesPurchase(voucher, purchase) && voucher.amount > best) {
      best = voucher.amount;
    }
  }
  return best;
}

/**
 * The largest "building / location" (NON-Legion) gold discount on this unit's
 * recruit/reinforce, computed from the unit's ORIGINAL printed cost. Today this
 * is the Champions' "Stable Master" reinforcement discount; the Cove Pub
 * building's flat reinforcement discount is passed separately into
 * `reinforceCostFor` (it is an Astrologers'-round offer, not a town-purchase
 * source). Recruit and reinforce stay separate so a reinforce-only source never
 * bleeds onto a recruit.
 */
export function externalRecruitGoldDiscount(state: GameState, playerId: PlayerId, purchase: RecruitPurchaseRef): number {
  if (purchase.kind === "reinforce") {
    // Champions' Stables map discount (and any future reinforce-cost source).
    return reinforceGoldDiscount(state, playerId, purchase.unitDefId);
  }
  // Recruitment-cost sources (the Cove Pub building, discount events) land here.
  return 0;
}

/**
 * The TOTAL gold discount on a recruit/reinforce. HOUSE RULE: a Legion artifact
 * voucher STACKS with the building/location discount (the Champions' Stables and
 * the Cove Pub) — the two are ADDED. So a Champion on a Stables field (−6) plus a
 * 4-gold Legion voucher reserved for it is −10, not −6.
 *
 * What still does NOT stack: two Legion pieces aimed at the SAME unit (the larger
 * single voucher is taken, inside `legionVoucherDiscount`) and the building/
 * location sources among themselves (the larger is taken, inside
 * `externalRecruitGoldDiscount`). The Necromancy/Isra HALF-cost is handled
 * separately in `reinforceCostFor` and still competes (bigger wins), never stacks.
 * Pure read.
 */
export function totalRecruitGoldDiscount(state: GameState, playerId: PlayerId, purchase: RecruitPurchaseRef): number {
  return legionVoucherDiscount(state, playerId, purchase) + externalRecruitGoldDiscount(state, playerId, purchase);
}

/**
 * Applies the total (Legion-stacks-with-building/location) gold discount to a
 * base recruit/reinforce cost: the gold component drops by the discount to a
 * minimum of 0; other resources are untouched (the sources only ever knock off
 * gold). Read-only — returns the same cost when nothing applies and never spends
 * a voucher, so it is safe for affordability checks and the UI.
 */
export function applyRecruitGoldDiscount(
  state: GameState,
  playerId: PlayerId,
  purchase: RecruitPurchaseRef,
  cost: ResourceCost
): ResourceCost {
  const discount = totalRecruitGoldDiscount(state, playerId, purchase);
  const gold = cost.gold ?? 0;
  if (discount <= 0 || gold <= 0) {
    return cost;
  }
  return { ...cost, gold: Math.max(0, gold - discount) };
}

/**
 * Spends the Legion voucher(s) reserved for a unit once it has been recruited or
 * reinforced (by ANY path: town purchase, Necromancy, Isra, a free flip). A
 * voucher is single-use and tied to that exact unit, so it is dropped whether or
 * not it was the winning discount. No-op when none is banked for that unit.
 */
export function consumeRecruitVoucherFor(state: GameState, playerId: PlayerId, purchase: RecruitPurchaseRef): void {
  const player = state.players[playerId];
  if (!player?.recruitDiscounts?.length) {
    return;
  }
  player.recruitDiscounts = player.recruitDiscounts.filter((voucher) => !voucherMatchesPurchase(voucher, purchase));
}

/**
 * One selectable target for a Legion discount side: a unit the player can
 * recruit or reinforce at their town right now. The two existing-discount fields
 * drive the prompt label:
 *  - `existingLegion` — a Legion voucher ALREADY reserved for this unit. The new
 *    piece does NOT stack with it (the larger single voucher is taken).
 *  - `existingExternal` — the building/location discount on this unit (Champions'
 *    Stables / Cove Pub). The new Legion piece STACKS on top of this.
 */
type LegionDiscountTarget = {
  purchase: RecruitPurchaseRef;
  unitName: string;
  existingLegion: number;
  existingExternal: number;
};

/**
 * The recruit/reinforce targets a freshly-played Legion discount side may be
 * applied to: units whose Dwelling tier is built (recruit, not already owned) or
 * Few units that a Citadel can reinforce, each with a gold cost to reduce. The
 * SAME list gates whether the discount side is offered at all (no targets → the
 * discount side is hidden, only the resource side remains) and builds the
 * selection prompt, so the two can never disagree.
 */
export function legionDiscountTargets(state: GameState, playerId: PlayerId): LegionDiscountTarget[] {
  const player = state.players[playerId];
  if (!player) {
    return [];
  }
  const faction = player.factionId ? coreFactionDefinitions[player.factionId] : undefined;
  const tiers = unlockedRecruitTiers(state, playerId);
  const targets: LegionDiscountTarget[] = [];

  // Recruit: the unit's Dwelling tier is built, it is not already owned (each
  // unit card exists once), and there is gold to reduce. Recruiting genuinely
  // needs the Dwelling, so that gate stays.
  for (const unitDefId of faction?.units ?? []) {
    const unit = coreUnitDefinitions[unitDefId];
    const fewSide = unit?.few;
    if (!unit || !fewSide || !tiers.has(unit.tier)) {
      continue;
    }
    if (player.army.some((armyUnit) => armyUnit.unitDefId === unitDefId)) {
      continue;
    }
    if ((fewSide.cost.gold ?? 0) <= 0) {
      continue;
    }
    const purchase: RecruitPurchaseRef = { kind: "recruit", unitDefId };
    targets.push({
      purchase,
      unitName: unit.name,
      existingLegion: legionVoucherDiscount(state, playerId, purchase),
      existingExternal: externalRecruitGoldDiscount(state, playerId, purchase)
    });
  }

  // Reinforce: ANY Few army unit with a Pack side and gold to reduce. A Citadel
  // is deliberately NOT required and the tier need not be unlocked — a Few unit
  // can be upgraded by Necromancy, Isra's Friends or a Settlement, none of which
  // need the Citadel, so the discount must be applicable to those upgrades too.
  for (const armyUnit of player.army) {
    if (armyUnit.side !== "few") {
      continue;
    }
    const unit = coreUnitDefinitions[armyUnit.unitDefId];
    const packSide = unit?.pack;
    if (!unit || !packSide || (packSide.cost.gold ?? 0) <= 0) {
      continue;
    }
    const purchase: RecruitPurchaseRef = { kind: "reinforce", unitDefId: armyUnit.unitDefId, armyUnitId: armyUnit.id };
    targets.push({
      purchase,
      unitName: unit.name,
      existingLegion: legionVoucherDiscount(state, playerId, purchase),
      existingExternal: externalRecruitGoldDiscount(state, playerId, purchase)
    });
  }

  // Polish Unit Stacks: a Legion piece may also be reserved for one Stack
  // purchase — any eligible Pack/Neutral card below its cap (its Stack price
  // always includes gold, the tier surcharge). Empty when the rule is off.
  for (const target of stackOfferTargets(state, playerId)) {
    const purchase: RecruitPurchaseRef = {
      kind: "stack",
      unitDefId: target.unit.unitDefId,
      armyUnitId: target.unit.id
    };
    targets.push({
      purchase,
      unitName: target.name,
      existingLegion: legionVoucherDiscount(state, playerId, purchase),
      existingExternal: externalRecruitGoldDiscount(state, playerId, purchase)
    });
  }

  return targets;
}

/**
 * A Legion target's prompt label. The new piece STACKS with the building/
 * location discount (Champions' Stables / Cove Pub) but does NOT stack with
 * another Legion voucher already on the unit (the larger of the two is taken).
 */
function legionTargetLabel(target: LegionDiscountTarget, amount: number): string {
  const verb =
    target.purchase.kind === "recruit"
      ? "Recruit"
      : target.purchase.kind === "stack"
        ? "Add a Stack to"
        : "Reinforce";
  if (target.existingLegion <= 0 && target.existingExternal <= 0) {
    return `${verb} ${target.unitName} — reduce cost by ${amount} gold`;
  }
  // Legion-vs-Legion: keep the larger single voucher; then stack the external.
  const legionPart = Math.max(target.existingLegion, amount);
  const total = legionPart + target.existingExternal;
  const notes: string[] = [];
  if (target.existingExternal > 0) {
    notes.push(`stacks with the −${target.existingExternal} gold building/location discount`);
  }
  if (target.existingLegion > 0) {
    notes.push(
      amount > target.existingLegion
        ? `replaces the −${target.existingLegion} gold Legion voucher (Legion does not stack with Legion)`
        : `keeps the larger −${target.existingLegion} gold Legion voucher (Legion does not stack with Legion)`
    );
  }
  return `${verb} ${target.unitName} — total −${total} gold; ${notes.join("; ")}`;
}

/**
 * Opens the "pick a unit" window for a just-played Legion discount side: a
 * blocking field-visit choice listing every recruit/reinforce target, each
 * banking a voucher for that exact unit. No-op when there is no valid target
 * (the legal-action layer hides the discount side in that case, so this is a
 * safety net — the artifact is already discarded and its gold is simply lost).
 */
export function queueLegionDiscountChoice(state: GameState, playerId: PlayerId, cardId: CardId, amount: number): void {
  const adventure = state.adventure;
  const targets = legionDiscountTargets(state, playerId);
  if (!adventure || targets.length === 0) {
    return;
  }
  adventure.rewardQueue.push({
    playerId,
    kind: "visit-steps",
    steps: [
      {
        type: "CHOOSE_ONE",
        prompt: `${cardLibrary[cardId]?.name ?? "Legion artifact"}: choose the unit whose cost to reduce by ${amount} gold`,
        options: targets.map((target) => ({
          label: legionTargetLabel(target, amount),
          steps: [{ type: "BANK_RECRUIT_DISCOUNT", cardId, amount, target: voucherTargetOf(target.purchase) }]
        }))
      }
    ]
  });
}

/** The voucher `target` shape (recruit→unitDefId, reinforce/stack→armyUnitId) for a purchase. */
function voucherTargetOf(purchase: RecruitPurchaseRef): RecruitDiscountVoucher["target"] {
  if (purchase.kind === "recruit") {
    return { kind: "recruit", unitDefId: purchase.unitDefId };
  }
  if (purchase.kind === "stack") {
    return { kind: "stack", armyUnitId: purchase.armyUnitId };
  }
  return { kind: "reinforce", armyUnitId: purchase.armyUnitId };
}

/** Banks a chosen Legion discount voucher (resolves the BANK_RECRUIT_DISCOUNT step). */
function bankRecruitDiscountVoucher(
  state: GameState,
  playerId: PlayerId,
  voucher: RecruitDiscountVoucher
): void {
  const player = state.players[playerId];
  if (!player) {
    return;
  }
  player.recruitDiscounts ??= [];
  // The SAME Legion piece never banks twice in a turn (the legal-action layer
  // hides a replay, this is the matching safety net).
  if (player.recruitDiscounts.some((existing) => existing.cardId === voucher.cardId)) {
    return;
  }
  player.recruitDiscounts.push(voucher);
}

/**
 * Flips a Few army card to its Pack side, paying its (half) cost. Half-gold
 * effects round up by default (Saplings, settlements); Necromancy rounds
 * down ("half the gold cost, rounded down"). A `free` flip (Skeletons reward)
 * spends nothing.
 */
/**
 * The final (non-stacking) cost to flip a Few army unit to its Pack, BEFORE any
 * voucher is consumed — the shared truth for both the charge (reinforceArmyUnit)
 * and the prompt label/affordability (Necromancy, Isra). Discounts never stack:
 * the half-cost reward (`halfCost` halves every resource, `halfGoldOnly` only
 * gold) and the best FLAT gold discount (Champions' Stables, a Legion voucher
 * reserved for this unit, a future recruit-cost building / event) are rival
 * sources, each measured from the ORIGINAL printed price; the cheaper GOLD wins
 * and only that source's rules apply (so the half is never taken from an
 * already-discounted price). Returns null when the unit cannot be reinforced.
 */
export function reinforceCostFor(
  state: GameState,
  playerId: PlayerId,
  armyUnitId: string,
  halfCost: boolean,
  halfGoldOnly: boolean,
  roundDown: boolean,
  /**
   * Cove Pub: a flat gold discount applied to THIS reinforcement (min 0). HOUSE
   * RULE: it STACKS with a Legion voucher and the Champions' Stables discount —
   * the Pub discount is ADDED on top of `totalRecruitGoldDiscount`. It still
   * competes with (never stacks with) the Necromancy/Isra HALF — the bigger of
   * the combined flat discount vs. the half wins.
   */
  flatGoldDiscount = 0
): ResourceCost | null {
  const armyUnit = state.players[playerId]?.army.find((candidate) => candidate.id === armyUnitId);
  const packSide = armyUnit ? getUnitSide(armyUnit.unitDefId, "pack") : null;
  if (!armyUnit || !packSide) {
    return null;
  }
  const purchase: RecruitPurchaseRef = { kind: "reinforce", unitDefId: armyUnit.unitDefId, armyUnitId };
  const half = (amount: number) => (roundDown ? Math.floor(amount / 2) : Math.ceil(amount / 2));
  const halfApplies = halfCost || halfGoldOnly;
  const originalGold = packSide.cost.gold ?? 0;
  const halfGold = half(originalGold);
  // The Cove Pub flat discount STACKS with the Legion voucher + Champions' Stables
  // (which already stack with each other inside totalRecruitGoldDiscount).
  const flatDiscount = flatGoldDiscount + totalRecruitGoldDiscount(state, playerId, purchase);
  const flatGold = Math.max(0, originalGold - flatDiscount);
  // The flat source wins only when it actually beats the half on gold; a tie (or
  // no flat discount) keeps the half so its non-gold halving (Isra) still stands.
  const useHalf = halfApplies && (flatDiscount <= 0 || halfGold <= flatGold);

  const cost: ResourceCost = {};
  for (const [resource, amount] of Object.entries(packSide.cost) as [ResourceKind, number][]) {
    if (resource === "gold") {
      cost.gold = useHalf ? halfGold : flatGold;
    } else {
      // Only the half-ALL reward (Isra) reduces non-gold; half-gold-only
      // (Necromancy) and the flat sources leave other resources at full price.
      cost[resource] = useHalf && halfCost ? half(amount) : amount;
    }
  }
  return cost;
}

export function reinforceArmyUnit(
  state: GameState,
  playerId: PlayerId,
  armyUnitId: string,
  halfCost: boolean,
  halfGoldOnly = false,
  roundDown = false,
  /** Neutral Skeletons reward: a free Few→Pack flip (no resources spent). */
  free = false,
  /** Cove Pub: a flat gold discount on this reinforcement (min 0, stacks with Legion/Stables). */
  flatGoldDiscount = 0
): boolean {
  const player = state.players[playerId];
  const armyUnit = player?.army.find((candidate) => candidate.id === armyUnitId);
  if (!player || !armyUnit || armyUnit.side !== "few") {
    return false;
  }

  const purchase: RecruitPurchaseRef = { kind: "reinforce", unitDefId: armyUnit.unitDefId, armyUnitId };
  const finalCost = free ? {} : (reinforceCostFor(state, playerId, armyUnitId, halfCost, halfGoldOnly, roundDown, flatGoldDiscount) ?? {});
  if (!hasRecruitResources(state, playerId, finalCost)) {
    return false;
  }

  spendRecruitResources(
    state,
    playerId,
    finalCost,
    free ? "free reinforcement" : halfCost || halfGoldOnly ? "half-cost reinforcement" : "reinforcement"
  );
  armyUnit.side = "pack";
  // The reserved Legion voucher (if any) is spent on this unit, win or lose.
  consumeRecruitVoucherFor(state, playerId, purchase);
  appendEvent(state, {
    type: "UNIT_RECRUITED",
    playerId,
    unitDefId: armyUnit.unitDefId,
    kind: "reinforce",
    cost: finalCost
  });
  return true;
}

/**
 * Offer a free Few→Pack reinforcement of one BRONZE unit, letting the player
 * PICK which eligible unit (a CHOOSE_ONE over their Few bronze units, plus a
 * Skip). Shared by the neutral-Skeletons reward and the Necropolis City Hall
 * income option. Nothing is queued when the player owns no eligible bronze Few,
 * so the offer never opens an empty/no-op choice.
 */
/**
 * Polish Unit Stacks: the army cards a building/skill offer may sell ONE Stack
 * layer to — eligible Pack / recruited-Neutral cards below their cap, filtered
 * to the offer's tiers (azure counts as gold, the cap convention). Empty when
 * the rule is off, so every offer builder can call this unconditionally.
 */
function stackOfferTargets(
  state: GameState,
  playerId: PlayerId,
  tiers?: readonly string[]
): { unit: ArmyUnitState; name: string; baseGold: number }[] {
  if (!houseRuleEnabled(state, "polish-unit-stacks")) {
    return [];
  }
  const targets: { unit: ArmyUnitState; name: string; baseGold: number }[] = [];
  for (const unit of state.players[playerId]?.army ?? []) {
    if (!polishArmyUnitCanBuyStack(unit)) {
      continue;
    }
    const tier = polishStackTier(unit.unitDefId);
    if (!tier || (tiers && !tiers.includes(tier))) {
      continue;
    }
    targets.push({
      unit,
      name: coreUnitDefinitions[unit.unitDefId]?.name ?? unit.unitDefId,
      baseGold: polishArmyUnitStackCost(unit)?.gold ?? 0
    });
  }
  return targets;
}

/**
 * One "Add a Stack to X (N gold / free)" option for a building/skill offer.
 * Null when the priced cost is unpayable (counting the Freelancer's Guild
 * substitution, exactly how the BUY_UNIT_STACK step will charge it).
 */
function stackOfferOption(
  state: GameState,
  playerId: PlayerId,
  target: { unit: ArmyUnitState; name: string },
  gold: number,
  source: string,
  consumeCardId?: CardId
): { label: string; steps: VisitStep[] } | null {
  const cost: ResourceCost = gold > 0 ? { gold } : {};
  if (gold > 0 && !hasRecruitResources(state, playerId, cost)) {
    return null;
  }
  return {
    label: `Add a Stack to ${target.name} (${gold > 0 ? `${gold} gold` : "free"})`,
    steps: [{ type: "BUY_UNIT_STACK", armyUnitId: target.unit.id, cost, source, consumeCardId }]
  };
}

export function queueFreeBronzeReinforce(
  state: GameState,
  playerId: PlayerId,
  prompt: string,
  options2?: {
    /**
     * Necropolis City Hall (Polish Unit Stacks): ALSO offer a free Stack on one
     * bronze Pack/Neutral card. The neutral-Skeletons reward deliberately does
     * NOT pass this — its printed text grants only the Few→Pack flip.
     */
    includeStacks?: boolean;
  }
): void {
  const player = state.players[playerId];
  const adventure = state.adventure;
  if (!player || !adventure) {
    return;
  }
  const options: { label: string; steps: VisitStep[] }[] = [];
  for (const unit of player.army) {
    if (unit.side !== "few") {
      continue;
    }
    const def = coreUnitDefinitions[unit.unitDefId];
    const packSide = getUnitSide(unit.unitDefId, "pack");
    if (!def || !packSide || def.tier !== "bronze") {
      continue;
    }
    options.push({
      label: `Reinforce ${def.name} (free)`,
      steps: [{ type: "REINFORCE_FREE", armyUnitId: unit.id }]
    });
  }
  if (options2?.includeStacks) {
    for (const target of stackOfferTargets(state, playerId, ["bronze"])) {
      const option = stackOfferOption(state, playerId, target, 0, "City Hall");
      if (option) {
        options.push(option);
      }
    }
  }
  if (options.length === 0) {
    return;
  }
  options.push({ label: "Skip", steps: [] });
  adventure.rewardQueue.push({
    playerId,
    kind: "visit-steps",
    steps: [
      {
        type: "CHOOSE_ONE",
        prompt,
        options
      }
    ]
  });
}

/**
 * Necropolis City Hall gate helper: with Polish Unit Stacks on, the "reinforce
 * one bronze unit for free" option is also meaningful when a bronze card can
 * take a free Stack (even with no Few bronze left to flip).
 */
export function hasFreeBronzeStackTarget(state: GameState, playerId: PlayerId): boolean {
  return stackOfferTargets(state, playerId, ["bronze"]).length > 0;
}

/**
 * Neutral Skeletons: "After defeating Skeletons, if you control a Necropolis
 * Hero, Reinforce 1 of your bronze units for free." A skippable post-combat
 * pick over the player's Few bronze units (a free Few→Pack flip).
 */
export function queueSkeletonReinforce(state: GameState, playerId: PlayerId): void {
  queueFreeBronzeReinforce(state, playerId, "Skeletons defeated: reinforce a bronze unit for free.");
}

/**
 * Crag Hack (Astrologers): offer a free Few→Pack reinforcement of one SPECIFIC
 * unit (the controller's Goblins), skippable. Nothing is queued when the player
 * holds no Few-side copy of that unit, so the offer never opens empty — the
 * same self-guard every round-start Astrologers offer uses.
 */
export function queueFreeUnitReinforce(state: GameState, playerId: PlayerId, unitDefId: string, prompt: string): void {
  const player = state.players[playerId];
  const adventure = state.adventure;
  if (!player || !adventure) {
    return;
  }
  const options: { label: string; steps: VisitStep[] }[] = [];
  for (const unit of player.army) {
    if (unit.side !== "few" || unit.unitDefId !== unitDefId || !getUnitSide(unit.unitDefId, "pack")) {
      continue;
    }
    options.push({
      label: `Reinforce ${coreUnitDefinitions[unit.unitDefId]?.name ?? unit.unitDefId} (free)`,
      steps: [{ type: "REINFORCE_FREE", armyUnitId: unit.id }]
    });
  }
  if (options.length === 0) {
    return;
  }
  options.push({ label: "Skip", steps: [] });
  adventure.rewardQueue.push({
    playerId,
    kind: "visit-steps",
    steps: [{ type: "CHOOSE_ONE", prompt, options }]
  });
}

/**
 * Whether the player owns at least one Few bronze unit that can still be
 * reinforced to its Pack — i.e. the free-bronze-reinforce picker would offer a
 * real choice. Used to hide the Necropolis City Hall reinforce option when it
 * would do nothing (so the choice is never a dead/decorative entry).
 */
export function hasFreeBronzeReinforceTarget(state: GameState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  if (!player) {
    return false;
  }
  return player.army.some((unit) => {
    if (unit.side !== "few") {
      return false;
    }
    const def = coreUnitDefinitions[unit.unitDefId];
    return Boolean(def && def.tier === "bronze" && getUnitSide(unit.unitDefId, "pack"));
  });
}

/**
 * Necromancy: "Reinforce a bronze or silver unit (expert: any unit) for half
 * the gold cost (rounded down)." Queues a unit-choice prompt over the
 * player's Few units of the allowed tiers — no Citadel, Dwelling or
 * Population token needed.
 */
export function queueNecromancyReinforce(
  state: GameState,
  playerId: PlayerId,
  mode: "basic" | "expert",
  /**
   * The Necromancy card to discard — but only if the player actually reinforces.
   * Attached to each real reinforce option (never to "Skip" or the
   * no-eligible-target prompt), so the card is kept unless it upgrades a unit.
   */
  consumeCardId?: CardId
): void {
  const player = state.players[playerId];
  const adventure = state.adventure;
  if (!player || !adventure) {
    return;
  }

  const allowedTiers = mode === "expert" ? ["bronze", "silver", "gold"] : ["bronze", "silver"];
  const options: { label: string; steps: VisitStep[] }[] = [];
  for (const unit of player.army) {
    if (unit.side !== "few") {
      continue;
    }
    const def = coreUnitDefinitions[unit.unitDefId];
    const packSide = getUnitSide(unit.unitDefId, "pack");
    if (!def || !packSide || !allowedTiers.includes(def.tier)) {
      continue;
    }

    // Half the gold (rounded down) — but a Legion voucher reserved for this unit
    // may beat that (non-stacking, and the half is still figured from the
    // ORIGINAL price; see reinforceCostFor), so price and gate on the actual
    // charged cost.
    const cost = reinforceCostFor(state, playerId, unit.id, false, true, true);
    if (!cost || !hasRecruitResources(state, playerId, cost)) {
      continue;
    }

    const costLabel =
      Object.entries(cost)
        .filter(([, amount]) => amount)
        .map(([resource, amount]) => `${amount} ${resource}`)
        .join(" + ") || "free";
    options.push({
      label: `Reinforce ${def.name} (${costLabel})`,
      steps: [{ type: "REINFORCE_HALF_GOLD", armyUnitId: unit.id, roundDown: true, consumeCardId }]
    });
  }

  // Polish Unit Stacks: Necromancy also buys ONE Stack layer at half the Stack
  // gold (rounded down, its printed rounding) — bronze/silver on basic, any
  // tier on expert, the same ladder as its reinforce. The card is spent only
  // if the Stack is really added (consumeCardId, like the reinforce options).
  for (const target of stackOfferTargets(state, playerId, allowedTiers)) {
    const option = stackOfferOption(
      state,
      playerId,
      target,
      Math.floor(target.baseGold / 2),
      "Necromancy",
      consumeCardId
    );
    if (option) {
      options.push(option);
    }
  }

  if (options.length === 0) {
    // No eligible target: the card is kept (its option carries no consumeCardId),
    // so a player who plays Necromancy with nothing to reinforce loses nothing.
    adventure.rewardQueue.push({
      playerId,
      kind: "visit-steps",
      steps: [
        {
          type: "CHOOSE_ONE",
          prompt: "Necromancy: no unit you can afford to reinforce — the card is kept.",
          options: [{ label: "OK", steps: [] }]
        }
      ]
    });
    return;
  }

  // "Skip" keeps the card too — only an actual reinforce above consumes it.
  options.push({ label: "Skip (keep the card)", steps: [] });
  adventure.rewardQueue.push({
    playerId,
    kind: "visit-steps",
    steps: [
      {
        type: "CHOOSE_ONE",
        prompt: `Necromancy: reinforce a ${mode === "expert" ? "" : "bronze or silver "}unit for half the gold cost (rounded down)`,
        options
      }
    ]
  });
}

/**
 * Necromancy Amplifier: dig the Ability deck for its first Necromancy card,
 * take it to hand, and reshuffle the searched cards back in.
 */
function resolveNecromancyFetch(state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  const deck = state.decks.abilities;
  if (!player || !deck) {
    return;
  }

  const dug: string[] = [];
  let found: string | null = null;
  while (deck.drawPile.length > 0) {
    const cardId = deck.drawPile.pop() as string;
    // House rule: a hero never keeps two copies of the same Ability. The
    // turn-start option is already withheld once the hero owns Necromancy, but
    // re-validate here so a card acquired between offer and resolution (another
    // player taking the other copy is harmless; the hero gaining it themselves
    // is not) can never become a duplicate — skip it just like a deck Search.
    if (cardLibrary[cardId]?.name === "Necromancy" && canAcquireSharedDeckCard(state, playerId, "abilities", cardId)) {
      found = cardId;
      break;
    }
    dug.push(cardId);
  }

  deck.drawPile = shuffleCards(
    [...deck.drawPile, ...dug],
    `${state.seed}#necromancy-fetch#${eventSeedNumber(state)}`
  );

  if (found) {
    player.hand.push(found);
    appendEvent(state, {
      type: "TOWN_BUILDING_USED",
      playerId,
      buildingId: "necropolis.necromancy_amplifier",
      message: "Necromancy Amplifier fetches a Necromancy card from the Ability deck."
    });
  } else {
    appendEvent(state, {
      type: "TOWN_BUILDING_USED",
      playerId,
      buildingId: "necropolis.necromancy_amplifier",
      message: "The Ability deck holds no Necromancy card — the search comes up empty."
    });
  }
}

/**
 * Mana Vortex: discard the chosen card, shuffle the discard pile back into
 * the deck, then Search (3) from the own deck (pick 1, discard the rest).
 */
/**
 * Magic University (Conflux): discard cards from the top of the player's deck
 * one at a time until a Spell of the chosen school is revealed; that Spell goes
 * to hand and the rejects stay in the discard pile. Magic Arrow (school "any")
 * counts as every school, matching the School-of-Magic convention. If the deck
 * is empty to start, the discard pile is shuffled back in first so the search
 * is not a dead no-op (mirrors how drawing reshuffles an empty deck).
 */
export function resolveMagicUniversityDig(state: GameState, playerId: PlayerId, school: SpellSchool): void {
  const player = state.players[playerId];
  if (!player) {
    return;
  }

  if (player.deck.length === 0 && player.discard.length > 0) {
    player.deck = shuffleCards(player.discard, `${state.seed}#magic-university#${playerId}#${eventSeedNumber(state)}`);
    player.discard = [];
  }

  const matches = (cardId: string): boolean => {
    const card = cardLibrary[cardId];
    if (!card || card.kind !== "spell") {
      return false;
    }
    const schools = card.spellSchools ?? [];
    return schools.includes(school) || schools.includes("any");
  };

  let found: string | null = null;
  const discarded: string[] = [];
  while (player.deck.length > 0) {
    const cardId = player.deck.pop();
    if (cardId === undefined) {
      break;
    }
    if (matches(cardId)) {
      found = cardId;
      break;
    }
    discarded.push(cardId);
    player.discard.push(cardId);
  }

  appendEvent(state, {
    type: "TOWN_BUILDING_USED",
    playerId,
    buildingId: "conflux.magic_university",
    message: found
      ? `Magic University discards ${discarded.length} card(s) and finds ${cardLibrary[found]?.name ?? found}.`
      : `Magic University finds no ${school} spell (discarded ${discarded.length} card(s)).`
  });

  if (found) {
    player.hand.push(found);
  }
}

function resolveManaVortex(state: GameState, playerId: PlayerId, discardCardId: string): void {
  const player = state.players[playerId];
  if (!player) {
    return;
  }

  const handIndex = player.hand.indexOf(discardCardId);
  if (handIndex === -1) {
    return;
  }

  player.hand.splice(handIndex, 1);
  player.discard.push(discardCardId);

  player.deck = shuffleCards(
    [...player.deck, ...player.discard],
    `${state.seed}#mana-vortex#${playerId}#${eventSeedNumber(state)}`
  );
  player.discard = [];

  const revealed: string[] = [];
  for (let index = 0; index < 3; index += 1) {
    const cardId = player.deck.pop();
    if (!cardId) {
      break;
    }
    revealed.push(cardId);
  }

  appendEvent(state, {
    type: "TOWN_BUILDING_USED",
    playerId,
    buildingId: "dungeon.mana_vortex",
    message: "Mana Vortex shuffles the discard pile into the deck and searches it."
  });

  if (revealed.length === 0) {
    return;
  }

  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt: "Mana Vortex: take one card into your hand (the rest go to your discard pile)",
    options: revealed.map((cardId) => ({ label: `Take ${cardLibrary[cardId]?.name ?? cardId}` })),
    context: "own-deck-pick",
    ownDeckPick: { cardIds: revealed },
    returnPhase: "player-turn"
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
}

/** Groovy Satyr: swap one drawn neutral card for a fresh one of the same tier. */
export function swapNeutralDraw(state: GameState, playerId: PlayerId, draws: NeutralDraw[], drawIndex: number): void {
  const draw = draws[drawIndex];
  if (!draw || draw.bankGuard) {
    // Fixed bank guards (Dragon Utopia, Cyclops Stockpile) are never swapped.
    return;
  }

  const deck = state.decks[NEUTRAL_DECK_IDS[draw.tier]];
  if (!deck) {
    return;
  }

  deck.discardPile.push(draw.unitDefId);
  const replacement = drawFromNeutralDeck(state, draw.tier);
  if (!replacement) {
    return;
  }

  draws[drawIndex] = { unitDefId: replacement, tier: draw.tier };
  appendEvent(state, {
    type: "NEUTRAL_DRAW_SWAPPED",
    playerId,
    fromUnitDefId: draw.unitDefId,
    toUnitDefId: replacement
  });
}

// ===========================================================================
// Event cards (Fortress expansion, OPTIONAL rule) — a separate system from the
// Astrologers Proclaim deck. Rulebook (community rewrite, p.15-16): multiplayer
// only; at the start of every Resource Round, AFTER income, draw and resolve
// the next Event; the drawer rotates clockwise per draw; effects resolve in
// clockwise order starting with the drawer; cards revealed while resolving
// shuffle back into their decks unless the Event says otherwise.
// ===========================================================================

export const EVENTS_DECK_ID = "events";

/** Printed Event prices for revealed Artifact cards (Merchant / Messenger). */
export const EVENT_ARTIFACT_PRICES: Record<ArtifactTier, number> = { minor: 3, major: 5, relic: 7 };

const RESOURCE_KIND_LABELS: Record<ResourceKind, string> = {
  gold: "gold",
  buildingMaterials: "building materials",
  valuables: "valuables"
};

function costLabelOf(cost: ResourceCost): string {
  return (
    (Object.entries(cost) as [ResourceKind, number][])
      .filter(([, amount]) => amount)
      .map(([resource, amount]) => `${amount} ${RESOURCE_KIND_LABELS[resource]}`)
      .join(" + ") || "free"
  );
}

/**
 * Events state. Returns null when the optional rule is off — the Event deck is
 * only ever created at setup (2+ seats AND the toggle on), so its absence IS
 * the off switch.
 */
export function getEventsState(state: GameState): EventsState | null {
  const adventure = state.adventure;
  if (!adventure || !state.decks[EVENTS_DECK_ID]) {
    return null;
  }

  if (!adventure.events) {
    adventure.events = {
      activeCardId: null,
      nextDrawerIndex: 0,
      pool: [],
      poolCleanup: "shuffle-into-deck",
      dicePool: [],
      auction: null,
      deal: null
    };
  }
  return adventure.events;
}

export function getActiveEventCard(state: GameState): EventCardDefinition | null {
  const cardId = state.adventure?.events?.activeCardId;
  return cardId ? (eventCardDefinitions[cardId] ?? null) : null;
}

/** Human players still in the game, in seating (clockwise) order. */
function liveEventPlayers(state: GameState): PlayerId[] {
  return humanPlayerIds(state).filter((id) => !state.players[id]?.eliminated);
}

/**
 * Visit-step types that do TABLE bookkeeping for an Event rather than acting
 * on their owner: the Shady Auction's lot open/resolve and the end-of-Event
 * pool cleanup. They are queued on the DRAWER's seat but never read
 * `visit.playerId` — so when that seat is eliminated mid-Event they must be
 * handed to a live seat, not dropped (dropping them leaks the displayed
 * pool/lot cards out of the game and leaves an open auction unresolved).
 */
const SHARED_EVENT_BOOKKEEPING_STEP_TYPES = new Set<VisitStep["type"]>([
  "EVENT_POOL_CLEANUP",
  "EVENT_AUCTION_OPEN",
  "EVENT_AUCTION_RESOLVE",
  // Forty Thieves' "which Event resolves" pick reads events.pendingPick, never
  // visit.playerId — the next live seat can answer it just as well.
  "EVENT_FORTY_PICK"
]);

/** A queued reward that ONLY does shared Event bookkeeping (safe to reassign). */
export function isSharedEventBookkeepingReward(reward: AdventureReward): boolean {
  return (
    reward.kind === "visit-steps" &&
    reward.steps.length > 0 &&
    reward.steps.every((step) => SHARED_EVENT_BOOKKEEPING_STEP_TYPES.has(step.type))
  );
}

function eventNote(state: GameState, message: string, playerId?: PlayerId): void {
  appendEvent(state, { type: "EVENT_NOTE", ...(playerId ? { playerId } : {}), message });
}

function eventPlayerName(state: GameState, playerId: PlayerId): string {
  return state.players[playerId]?.name ?? playerId;
}

/**
 * Advances the rotating Event drawer and returns who draws THIS Event. The
 * drawer rotates clockwise per draw — by IDENTITY, not by index into the
 * live-player list: after an elimination a bare index would point at the
 * wrong seat (the same player drawing twice in a row, or a seat skipped).
 * The full seat ring is read from `state.players` (insertion = seat order,
 * eliminated seats included) so the clockwise successor stays correct even
 * when the previous drawer was just eliminated. Legacy snapshots without
 * `lastDrawerId` fall back to the stored index once.
 */
function advanceEventDrawer(state: GameState, events: EventsState, order: PlayerId[]): PlayerId {
  let drawerSeat = events.nextDrawerIndex % order.length;
  if (events.lastDrawerId) {
    const seating = Object.keys(state.players).filter((id) => id !== NEUTRAL_PLAYER_ID);
    const lastSeat = seating.indexOf(events.lastDrawerId);
    if (lastSeat !== -1) {
      for (let offset = 1; offset <= seating.length; offset += 1) {
        const liveIndex = order.indexOf(seating[(lastSeat + offset) % seating.length]);
        if (liveIndex !== -1) {
          drawerSeat = liveIndex;
          break;
        }
      }
    }
  }
  events.lastDrawerId = order[drawerSeat];
  events.nextDrawerIndex = (drawerSeat + 1) % order.length;
  return order[drawerSeat];
}

/** The live-player list rotated to start at `anchorId` (clockwise resolution order). */
function clockwiseEventOrder(order: PlayerId[], anchorId: PlayerId): PlayerId[] {
  const anchorIndex = Math.max(0, order.indexOf(anchorId));
  return [...order.slice(anchorIndex), ...order.slice(0, anchorIndex)];
}

/**
 * Draws and resolves the next Event card (start of a Resource Round, after
 * income). The drawer rotates clockwise around the live seats with every draw;
 * the previous Event goes to the discard pile, and an exhausted draw pile
 * reshuffles its discards.
 */
export function drawEventCard(state: GameState): void {
  const events = getEventsState(state);
  const deck = state.decks[EVENTS_DECK_ID];
  if (!events || !deck) {
    return;
  }

  // "Event cards may be used in multiplayer games only" — and once a single
  // live seat remains there is nobody left to resolve against.
  const order = liveEventPlayers(state);
  if (order.length < 2) {
    return;
  }

  if (events.activeCardId) {
    deck.discardPile.push(events.activeCardId);
    events.activeCardId = null;
  }

  if (deck.drawPile.length === 0 && deck.discardPile.length > 0) {
    deck.drawPile = shuffleCards(deck.discardPile, `${state.seed}#events-reshuffle#${eventSeedNumber(state)}`);
    deck.discardPile = [];
  }

  // Forty Thieves (Astrologers): while face up, the draw pops TWO cards and the
  // drawer picks which one resolves; the other goes to the bottom of the deck.
  // The pick is queued as the round-start event resolution itself, so the event
  // barrier freezes the table until the pick AND the picked Event resolve. With
  // fewer than 2 cards available even after the reshuffle above (one exhausted
  // physical deck), the draw falls back to the normal single-card path.
  if (getActiveAstrologersCard(state)?.effect.type === "EVENT_DRAW_PICK" && state.adventure) {
    if (deck.drawPile.length === 1 && deck.discardPile.length > 0) {
      // Mid-draw exhaustion: the second card comes off the reshuffled discards,
      // which stack UNDER the remaining known top card.
      deck.drawPile = [
        ...shuffleCards(deck.discardPile, `${state.seed}#events-reshuffle#${eventSeedNumber(state)}`),
        ...deck.drawPile
      ];
      deck.discardPile = [];
    }
    if (deck.drawPile.length >= 2) {
      const drawerId = advanceEventDrawer(state, events, order);
      const first = deck.drawPile.pop() as CardId;
      const second = deck.drawPile.pop() as CardId;
      events.pendingPick = { cardIds: [first, second], drawerId };
      eventNote(
        state,
        `Forty Thieves: ${eventPlayerName(state, drawerId)} draws 2 Event cards — ${
          eventCardDefinitions[first]?.name ?? first
        } and ${eventCardDefinitions[second]?.name ?? second} — and chooses which one resolves.`
      );
      state.adventure.rewardQueue.push({ playerId: drawerId, kind: "visit-steps", steps: [{ type: "EVENT_FORTY_PICK" }] });
      return;
    }
  }

  const cardId = deck.drawPile.pop();
  const card = cardId ? eventCardDefinitions[cardId] : undefined;
  if (!cardId || !card) {
    return;
  }

  const drawerId = advanceEventDrawer(state, events, order);
  const rotated = clockwiseEventOrder(order, drawerId);

  events.activeCardId = cardId;
  appendEvent(state, {
    type: "EVENT_CARD_DRAWN",
    cardId,
    name: card.name,
    text: card.text,
    round: state.round,
    drawerId: rotated[0]
  });

  resolveEventCard(state, card, rotated);
}

/**
 * Queues the drawn Event's resolution as visit-step rewards, one per player in
 * clockwise order starting with the drawer (the reward queue is FIFO, so queue
 * order IS resolution order). Shared displays (spell markets, the Merchant's
 * five artifacts, the Leprechaun's dice) are revealed here, when the card is
 * read; per-player menus are built later, from each player's live state.
 */
function resolveEventCard(state: GameState, card: EventCardDefinition, order: PlayerId[]): void {
  const adventure = state.adventure;
  const events = getEventsState(state);
  if (!adventure || !events) {
    return;
  }

  // Fresh shared state for this Event.
  events.pool = [];
  events.poolCleanup = "shuffle-into-deck";
  events.dicePool = [];
  events.auction = null;
  events.deal = null;

  const drawerId = order[0];
  const queue = (playerId: PlayerId, steps: VisitStep[]) =>
    adventure.rewardQueue.push({ playerId, kind: "visit-steps", steps });

  const effect = card.effect;
  switch (effect.type) {
    case "CRYPT":
    case "CURSED_SWAMP":
    case "GARDEN_OF_REVELATION":
    case "DISCARD_DRAW_REMOVE_SEARCH":
    case "MARKETPLACE":
    case "STABLES":
    case "VILLAGERS_PLEA":
    case "WITHERED_HERMIT":
      for (const playerId of order) {
        queue(playerId, [{ type: "EVENT_PLAYER_CHOICE", eventCardId: card.id }]);
      }
      break;
    case "MESSENGER_WITH_SUPPLIES":
      for (const playerId of order) {
        queue(playerId, [{ type: "EVENT_MESSENGER_DRAW" }]);
      }
      break;
    case "SPELL_MARKET": {
      // "For every player in the game, draw two Spell cards ... face-up".
      for (let i = 0; i < order.length * 2; i += 1) {
        const drawn = drawEventFamilyCard(state, "spells", undefined, i);
        if (!drawn) {
          break;
        }
        events.pool.push({ ...drawn, faceUp: true });
      }
      events.poolCleanup = effect.leftovers === "discard-pile" ? "discard-pile" : "shuffle-into-deck";
      if (events.pool.length > 0) {
        eventNote(
          state,
          `${card.name}: on display — ${events.pool.map((entry) => cardLibrary[entry.cardId]?.name ?? entry.cardId).join(", ")}.`
        );
      }
      for (const playerId of order) {
        queue(playerId, [{ type: "EVENT_SPELL_MARKET" }]);
      }
      queue(drawerId, [{ type: "EVENT_POOL_CLEANUP" }]);
      break;
    }
    case "MAGICAL_FOREST":
      for (const playerId of order) {
        queue(playerId, [{ type: "EVENT_FOREST_CONTRIBUTE" }]);
      }
      for (const playerId of order) {
        queue(playerId, [{ type: "EVENT_FOREST_TAKE", gold: effect.goldAlternative }]);
      }
      queue(drawerId, [{ type: "EVENT_POOL_CLEANUP" }]);
      break;
    case "MERCENARY_CAMP":
      // Unrecruited units recycle to their tier discard piles, like every
      // other returned Neutral draw in this engine.
      events.poolCleanup = "discard-pile";
      for (const playerId of order) {
        queue(playerId, [{ type: "EVENT_MERC_DRAW" }]);
      }
      for (const playerId of order) {
        queue(playerId, [{ type: "EVENT_MERC_RECRUIT" }]);
      }
      queue(drawerId, [{ type: "EVENT_POOL_CLEANUP" }]);
      break;
    case "ARTIFACT_MERCHANT": {
      for (let i = 0; i < effect.draw; i += 1) {
        const drawn = drawEventFamilyCard(state, "artifacts", undefined, i);
        if (!drawn) {
          break;
        }
        events.pool.push({ ...drawn, faceUp: true });
      }
      if (events.pool.length > 0) {
        eventNote(
          state,
          `${card.name}: for sale — ${events.pool.map((entry) => cardLibrary[entry.cardId]?.name ?? entry.cardId).join(", ")}.`
        );
      }
      for (const playerId of order) {
        queue(playerId, [{ type: "EVENT_ARTIFACT_SHOP" }]);
      }
      queue(drawerId, [{ type: "EVENT_POOL_CLEANUP" }]);
      break;
    }
    case "PRISON":
      events.poolCleanup = "discard-pile";
      for (const playerId of order) {
        queue(playerId, [{ type: "EVENT_PRISON_OFFER", discardGold: effect.discardGold }]);
      }
      queue(drawerId, [{ type: "EVENT_POOL_CLEANUP" }]);
      break;
    case "DEN_OF_THIEVES":
      // The printed "you" is the drawer (like Artifact Merchant's) — there is
      // no pass-around clause, so only the drawer raids the den.
      queue(drawerId, [{ type: "EVENT_DEN_OF_THIEVES" }]);
      break;
    case "MISCHIEVOUS_LEPRECHAUN": {
      const random = adventureRandom(state, "event-leprechaun-pool");
      const treasureRolls = Array.from(
        { length: 2 },
        () => TREASURE_DIE_FACES[random.nextInt(0, TREASURE_DIE_FACES.length - 1)]
      );
      const resourceRolls = Array.from(
        { length: 2 },
        () => RESOURCE_DIE_FACES[random.nextInt(0, RESOURCE_DIE_FACES.length - 1)]
      );
      events.dicePool = [
        ...treasureRolls.map((face) => ({ kind: "treasure", face }) as EventDiePoolEntry),
        ...resourceRolls.map((roll) => ({ kind: "resource", resource: roll.resource, amount: roll.amount }) as EventDiePoolEntry)
      ];
      appendEvent(state, {
        type: "ADVENTURE_DICE_ROLLED",
        playerId: drawerId,
        dice: "treasure",
        results: treasureRolls.map(treasureFaceLabel),
        treasureRolls: [...treasureRolls]
      });
      appendEvent(state, {
        type: "ADVENTURE_DICE_ROLLED",
        playerId: drawerId,
        dice: "resource",
        results: resourceRolls.map(resourceDieLabel),
        resourceRolls: resourceRolls.map((roll) => ({ resource: roll.resource, amount: roll.amount }))
      });
      for (const playerId of order) {
        queue(playerId, [{ type: "EVENT_LEPRECHAUN_ROLL" }]);
      }
      break;
    }
    case "SHADY_AUCTION":
      for (let lot = 0; lot < effect.lots; lot += 1) {
        queue(drawerId, [{ type: "EVENT_AUCTION_OPEN" }]);
        for (const playerId of order) {
          queue(playerId, [{ type: "EVENT_AUCTION_BID" }]);
        }
        queue(drawerId, [{ type: "EVENT_AUCTION_RESOLVE" }]);
      }
      break;
  }
}

type EventDeckFamily = "spells" | "artifacts" | "abilities";

/**
 * Fortress Events that GIVE Artifact cards — the Shady Auction's lots, the
 * Artifact Merchant's pool and discard-top offer, Messenger with Supplies'
 * draws, and a Magical Forest "draw and view" contribution — offer minor/major
 * Artifacts only in the early game; Relic-tier cards join the offers from this
 * round on (balance house rule). Event-granted SEARCHES of the Artifact deck
 * are not touched — they keep the normal BINH progression gates
 * (artifactDeckAccess) — and a Relic a player contributes from their own hand
 * was already in circulation, so it stays legal in the Forest pool.
 */
export const EVENT_RELIC_MIN_ROUND = 5;

/** Whether Event artifact offers must skip Relic-tier cards this round. */
function eventRelicsLocked(state: GameState): boolean {
  return state.round < EVENT_RELIC_MIN_ROUND;
}

/** The shared-deck ids a family resolves to in this game (BINH splits / legacy single decks). */
function eventFamilyDeckIds(state: GameState, family: EventDeckFamily): string[] {
  const candidates =
    family === "spells"
      ? ["spells", "spells-expert"]
      : family === "abilities"
        ? ["abilities"]
        : state.decks["artifacts"]
          ? ["artifacts"]
          : ["artifacts-minor", "artifacts-major", "artifacts-relic"];
  return candidates.filter((deckId) => state.decks[deckId]);
}

/**
 * The family deck ids an Event DRAW may currently hit — eventFamilyDeckIds
 * minus the Relic deck while the early-game lock holds, so "is there anything
 * to draw?" offers (Magical Forest's draw-and-view) agree with what
 * drawEventFamilyCard would actually find. A legacy single mixed deck stays
 * listed; its Relic cards are skipped per-card at draw time instead.
 */
function eventFamilyDrawableDeckIds(state: GameState, family: EventDeckFamily): string[] {
  const relicLocked = family === "artifacts" && eventRelicsLocked(state);
  return eventFamilyDeckIds(state, family).filter((deckId) => !(relicLocked && deckId === ARTIFACT_DECK_RELIC));
}

/**
 * Draws the top card "of the Spell/Artifact/Ability deck" for an Event. The
 * physical game has ONE deck per family; with BINH's split decks the draw picks
 * a deck weighted by its remaining cards — the same odds as drawing off one
 * combined pile. A `playerId` applies the normal acquisition gate (duplicates
 * are skipped and tucked under, exactly like drawTopOfSharedDeck everywhere
 * else); the shared market displays pass no player and gate at buy time.
 */
function drawEventFamilyCard(
  state: GameState,
  family: EventDeckFamily,
  playerId: PlayerId | undefined,
  salt: number
): { cardId: CardId; deckId: string } | null {
  // Early-game Relic lock (EVENT_RELIC_MIN_ROUND): the split Relic deck drops
  // out of the weighted pick entirely (eventFamilyDrawableDeckIds); a legacy
  // single Artifact deck instead redraws past Relic cards below (the `accept`
  // filter).
  const relicLocked = family === "artifacts" && eventRelicsLocked(state);
  // Polish Random Artifacts: when drawing Artifacts for a player, roll once
  // with the hero-level band (merchant / card-effect reading) and drop forbidden
  // tier piles from the weighted pick.
  if (family === "artifacts" && playerId) {
    maybeApplyPolishRandomArtifactRoll(state, playerId, getMainHero(state, playerId), "level");
  }
  const piles = eventFamilyDrawableDeckIds(state, family)
    .filter((deckId) => (family === "artifacts" ? polishArtifactDeckAllowed(state, deckId) : true))
    .map((deckId) => {
      const deck = state.decks[deckId];
      return { deckId, size: (deck?.drawPile.length ?? 0) + (deck?.discardPile.length ?? 0) };
    })
    .filter((pile) => pile.size > 0);
  if (piles.length === 0) {
    if (family === "artifacts" && playerId) {
      clearPolishArtifactAccess(state);
    }
    return null;
  }

  const total = piles.reduce((sum, pile) => sum + pile.size, 0);
  const random = adventureRandom(state, `event-draw-${family}-${salt}`);
  let roll = random.nextInt(1, total);
  let picked = piles[0];
  for (const pile of piles) {
    roll -= pile.size;
    if (roll <= 0) {
      picked = pile;
      break;
    }
  }

  for (const pile of [picked, ...piles.filter((candidate) => candidate !== picked)]) {
    const cardId = drawTopOfSharedDeck(
      state,
      pile.deckId,
      playerId,
      (candidate) => {
        if (relicLocked && cardLibrary[candidate]?.artifactTier === "relic") {
          return false;
        }
        if (family === "artifacts" && !polishArtifactTierAllowed(state, cardLibrary[candidate]?.artifactTier)) {
          return false;
        }
        return true;
      }
    );
    if (cardId) {
      // Leave access set until the caller finishes the acquisition; shops that
      // draw multiple cards re-use the same roll via the early-return guard.
      return { cardId, deckId: pile.deckId };
    }
  }
  if (family === "artifacts" && playerId) {
    clearPolishArtifactAccess(state);
  }
  return null;
}

/** The shared deck a card belongs to (for returning hand-contributed pool cards). */
function sharedDeckIdForCard(state: GameState, cardId: CardId): string {
  const card = cardLibrary[cardId];
  if (card?.kind === "artifact") {
    return state.decks["artifacts"] ? "artifacts" : `artifacts-${card.artifactTier ?? "minor"}`;
  }
  if (card?.kind === "spell") {
    return state.decks["spells-expert"] && spellDeckBinhExpert.includes(cardId) ? "spells-expert" : "spells";
  }
  return "abilities";
}

/** Cards in `player.hand` matching an Event filter, index-preserving. */
function eventHandMatches(
  player: PlayerState,
  filter: "spell" | "spell-or-ability" | "artifact-or-spell" | "pool-kinds"
): { cardId: CardId; index: number }[] {
  return player.hand
    .map((cardId, index) => ({ cardId, index }))
    .filter(({ cardId }) => {
      const kind = cardLibrary[cardId]?.kind;
      switch (filter) {
        case "spell":
          return kind === "spell";
        case "spell-or-ability":
          return kind === "spell" || kind === "ability";
        case "artifact-or-spell":
          return kind === "artifact" || kind === "spell";
        case "pool-kinds":
          return kind === "spell" || kind === "artifact" || kind === "ability";
      }
    });
}

/** Removes one pool entry by card id; returns it or null. */
function takeEventPoolEntry(state: GameState, cardId: CardId): EventPoolEntry | null {
  const events = getEventsState(state);
  const index = events?.pool.findIndex((entry) => entry.cardId === cardId) ?? -1;
  if (!events || index === -1) {
    return null;
  }
  return events.pool.splice(index, 1)[0];
}

/** Label of a Leprechaun pool die. */
function eventDieLabel(die: EventDiePoolEntry): string {
  return die.kind === "treasure"
    ? `Treasure: ${treasureFaceLabel(die.face)}`
    : `Resource: ${resourceDieLabel({ resource: die.resource, amount: die.amount })}`;
}

/**
 * Builds the printed per-player menu of a choice-type Event card from the
 * player's LIVE state (hand, resources, army, heroes) — options a player
 * cannot take are simply not offered.
 */
function buildEventPlayerChoice(state: GameState, visit: PendingVisit, card: EventCardDefinition): void {
  const player = state.players[visit.playerId];
  if (!player) {
    return;
  }

  const options: { label: string; steps: VisitStep[] }[] = [];
  const heroesOf = Object.values(state.heroes).filter((hero) => hero.controllerId === visit.playerId);
  const heroLabel = (hero: HeroState) =>
    coreHeroDefinitions[hero.heroDefId ?? ""]?.name ?? (hero.kind === "main" ? "Main hero" : "Secondary hero");

  switch (card.effect.type) {
    case "CRYPT": {
      options.push({
        label: "Gain Negative Morale, then roll 2 Treasure dice (any experience face — gain nothing)",
        steps: [
          { type: "EVENT_CHANGE_MORALE", amount: -1 },
          { type: "EVENT_TREASURE_GAMBLE", count: 2 }
        ]
      });
      options.push({ label: "Gain Positive Morale", steps: [{ type: "EVENT_CHANGE_MORALE", amount: 1 }] });
      if (player.factionId === NECROPOLIS_FACTION_ID) {
        for (const unit of player.army) {
          const tier = coreUnitDefinitions[unit.unitDefId]?.tier;
          if (unit.side !== "few" || !getUnitSide(unit.unitDefId, "pack") || (tier !== "bronze" && tier !== "silver")) {
            continue;
          }
          // Offer only what the player can actually PAY (the Isra pattern):
          // reinforceArmyUnit silently no-ops when the cost can't be met, so an
          // ungated offer would let the player click it, get nothing, and lose
          // the Event's benefit. Gate + label use the actual charged cost.
          const finalCost = reinforceCostFor(state, visit.playerId, unit.id, true, false, false);
          if (!finalCost || !hasRecruitResources(state, visit.playerId, finalCost)) {
            continue;
          }
          const costLabel =
            Object.entries(finalCost)
              .filter(([, amount]) => amount)
              .map(([resource, amount]) => `${amount} ${resource}`)
              .join(" + ") || "free";
          options.push({
            label: `Necropolis: reinforce ${coreUnitDefinitions[unit.unitDefId]?.name ?? unit.unitDefId} at half cost (${costLabel})`,
            steps: [{ type: "REINFORCE_ARMY_UNIT", armyUnitId: unit.id, halfCost: true }]
          });
        }
      }
      break;
    }
    case "CURSED_SWAMP": {
      options.push({
        label: "Gain Negative Morale, then roll 2 Treasure dice and choose one result",
        steps: [
          { type: "EVENT_CHANGE_MORALE", amount: -1 },
          { type: "ROLL_TREASURE_DICE", count: 2 }
        ]
      });
      if (eventHandMatches(player, "spell").length > 0) {
        options.push({
          label: "Remove one or more Spells from your hand (2+ removed: Search (3) the Artifact deck)",
          steps: [
            {
              type: "EVENT_REMOVE_FOR_SEARCH",
              filter: "spell",
              removed: 0,
              per: 2,
              searchCount: 3,
              searchDecks: ["artifacts"],
              single: true,
              minRemoved: 2,
              mustRemove: 1
            }
          ]
        });
      }
      if (player.army.length > 0) {
        options.push({ label: "Discard your cheapest unit", steps: [{ type: "EVENT_DISCARD_CHEAPEST_UNIT" }] });
      }
      if (player.factionId === NECROPOLIS_FACTION_ID) {
        for (const unit of player.army) {
          const tier = coreUnitDefinitions[unit.unitDefId]?.tier;
          if (unit.side !== "few" || !getUnitSide(unit.unitDefId, "pack") || (tier !== "bronze" && tier !== "silver")) {
            continue;
          }
          options.push({
            label: `Necropolis: reinforce ${coreUnitDefinitions[unit.unitDefId]?.name ?? unit.unitDefId} for free`,
            steps: [{ type: "REINFORCE_FREE", armyUnitId: unit.id }]
          });
        }
      }
      break;
    }
    case "GARDEN_OF_REVELATION": {
      // The Searches AND the closing discard-hand-and-redraw are paid out in
      // printed order through the front of the reward queue (see
      // EVENT_REMOVE_FOR_SEARCH's finish).
      const removeStep: VisitStep = {
        type: "EVENT_REMOVE_FOR_SEARCH",
        filter: "spell-or-ability",
        removed: 0,
        per: 2,
        searchCount: 2,
        searchDecks: ["spells", "abilities"],
        thenDiscardAllRedraw: true
      };
      options.push({
        label: "Draw 4 cards from your deck, remove Spells/Abilities for Searches, then discard your hand and redraw",
        steps: [{ type: "EVENT_DRAW_OWN", from: "deck", count: 4 }, removeStep]
      });
      if (player.discard.length > 0) {
        options.push({
          label: "Draw 4 cards from your discard pile, remove Spells/Abilities for Searches, then discard your hand and redraw",
          steps: [{ type: "EVENT_DRAW_OWN", from: "discard", count: 4 }, removeStep]
        });
      }
      options.push({ label: "Leave and gain nothing", steps: [] });
      break;
    }
    case "DISCARD_DRAW_REMOVE_SEARCH": {
      const effect = card.effect;
      options.push({
        label: `Discard any number of cards, draw up to your hand limit +${effect.drawBonus}, then remove Ability/Spell cards for Searches`,
        steps: [
          { type: "EVENT_DISCARD_ANY_THEN_DRAW", bonus: effect.drawBonus },
          {
            type: "EVENT_REMOVE_FOR_SEARCH",
            filter: "spell-or-ability",
            removed: 0,
            per: effect.per,
            searchCount: effect.searchCount,
            searchDecks: effect.searchDecks
          }
        ]
      });
      options.push({ label: "Leave and gain nothing", steps: [] });
      break;
    }
    case "MARKETPLACE": {
      options.push({ label: "Roll 1 Resource die", steps: [{ type: "ROLL_RESOURCE_DICE", count: 1 }] });
      options.push({
        label: "Trade resources (Trading Post rates)",
        steps: [{ type: "TRADING_POST", tradesOnly: true }]
      });
      const owned = (Object.keys(RESOURCE_KIND_LABELS) as ResourceKind[]).filter(
        (resource) => (player.resources[resource] ?? 0) >= 1
      );
      if (owned.length > 0 && liveEventPlayers(state).length > 1) {
        options.push({ label: "Propose a 1-for-1 resource exchange", steps: [{ type: "EVENT_MARKET_DEAL" }] });
      }
      break;
    }
    case "STABLES": {
      const mainHero = getMainHero(state, visit.playerId);
      if (mainHero) {
        options.push({ label: "Your Main hero gains +1 movement", steps: [{ type: "GAIN_MOVEMENT", amount: 1 }] });
      }
      for (const hero of heroesOf) {
        if (hero.movementPoints >= 1) {
          options.push({
            label: `Pay 1 movement (${heroLabel(hero)}) to roll 1 Resource die`,
            steps: [
              { type: "SPEND_HERO_MOVEMENT", heroId: hero.id, amount: 1 },
              { type: "ROLL_RESOURCE_DICE", count: 1 }
            ]
          });
        }
      }
      break;
    }
    case "VILLAGERS_PLEA": {
      for (const { cardId } of eventHandMatches(player, "artifact-or-spell")) {
        options.push({
          label: `Remove ${cardLibrary[cardId]?.name ?? cardId} from your hand`,
          steps: [{ type: "REMOVE_CARD_FROM_PILE", cardId, source: "hand" }]
        });
      }
      if (hasResources(player, { buildingMaterials: 1 })) {
        options.push({
          label: "Pay 1 building materials",
          steps: [{ type: "LOSE_RESOURCES", buildingMaterials: 1, reason: "The Villagers' Plea" }]
        });
      }
      if (hasResources(player, { gold: 5 })) {
        options.push({
          label: "Pay 5 gold",
          steps: [{ type: "LOSE_RESOURCES", gold: 5, reason: "The Villagers' Plea" }]
        });
      }
      for (const hero of heroesOf) {
        if (hero.movementPoints >= 1) {
          options.push({
            label: `Pay 1 movement (${heroLabel(hero)})`,
            steps: [{ type: "SPEND_HERO_MOVEMENT", heroId: hero.id, amount: 1 }]
          });
        }
      }
      if (options.length === 0) {
        eventNote(state, `${eventPlayerName(state, visit.playerId)} has nothing to give the villagers.`, visit.playerId);
        return;
      }
      break;
    }
    case "WITHERED_HERMIT": {
      for (const resource of Object.keys(RESOURCE_KIND_LABELS) as ResourceKind[]) {
        options.push({
          label: `Name ${RESOURCE_KIND_LABELS[resource]} — roll 3 Resource dice (right: gain one die; wrong: lose one)`,
          steps: [{ type: "EVENT_HERMIT_GAMBLE", resource }]
        });
      }
      options.push({
        label: "Roll 1 Resource die — you may pay the shown resources to Search (2) the Artifact deck",
        steps: [{ type: "EVENT_HERMIT_PAY_SEARCH" }]
      });
      options.push({ label: "Leave and gain nothing", steps: [] });
      break;
    }
    default:
      return;
  }

  if (options.length === 0) {
    return;
  }
  visit.steps.unshift({ type: "CHOOSE_ONE", prompt: `${card.name}: choose one option`, options });
}

/**
 * Resolves one Event visit step (the grouped case in processPendingVisit).
 * Menu-builder steps unshift a CHOOSE_ONE/PAY_TO over live state; leaf steps
 * mutate and validate — a stale leaf (resources spent meanwhile, pool card
 * gone) quietly no-ops rather than corrupting state.
 */
function applyEventVisitStep(state: GameState, visit: PendingVisit, step: VisitStep): void {
  const player = state.players[visit.playerId];
  const events = getEventsState(state);

  switch (step.type) {
    case "EVENT_FORTY_PICK": {
      // Forty Thieves: the pick menu is rebuilt from events.pendingPick (the
      // custodied pair), never from step data — so the SAME step re-queued for
      // the next live seat after an elimination reopens the identical choice.
      const pick = events?.pendingPick;
      if (!pick || pick.cardIds.length === 0) {
        break;
      }
      visit.steps.unshift({
        type: "CHOOSE_ONE",
        prompt: "Forty Thieves: choose which Event card resolves (the other goes to the bottom of the Event deck)",
        options: pick.cardIds.map((cardId) => {
          const card = eventCardDefinitions[cardId];
          return {
            label: `${card?.name ?? cardId} — ${card?.text ?? ""}`,
            steps: [{ type: "EVENT_FORTY_RESOLVE", cardId }]
          };
        })
      });
      break;
    }
    case "EVENT_FORTY_RESOLVE": {
      const adventure = state.adventure;
      const pick = events?.pendingPick;
      const deck = state.decks[EVENTS_DECK_ID];
      if (!events || !adventure || !pick || !deck || !pick.cardIds.includes(step.cardId)) {
        break;
      }
      events.pendingPick = null;
      for (const other of pick.cardIds) {
        if (other !== step.cardId) {
          // "Put the other at the bottom of the Event deck" (pop draws the end).
          deck.drawPile.unshift(other);
        }
      }
      const card = eventCardDefinitions[step.cardId];
      if (!card) {
        break;
      }
      // Clockwise resolution from the ORIGINAL drawer; if an elimination handed
      // the pick on, the answering seat anchors instead.
      const live = liveEventPlayers(state);
      const anchorId = live.includes(pick.drawerId) ? pick.drawerId : visit.playerId;
      const rotated = clockwiseEventOrder(live, anchorId);
      events.activeCardId = step.cardId;
      appendEvent(state, {
        type: "EVENT_CARD_DRAWN",
        cardId: step.cardId,
        name: card.name,
        text: card.text,
        round: state.round,
        drawerId: rotated[0]
      });
      // The picked Event's per-player resolution must run BEFORE the round-start
      // barrier sentinel (and before the City-Hall / turn-start rewards queued
      // behind it). resolveEventCard pushes to the queue's END, so splice its
      // additions to the FRONT in order — the same "event follow-ups run ahead
      // of the sentinel" rule every mid-Event unshift follows.
      const before = adventure.rewardQueue.length;
      resolveEventCard(state, card, rotated);
      const added = adventure.rewardQueue.splice(before);
      adventure.rewardQueue.unshift(...added);
      break;
    }
    case "EVENT_PLAYER_CHOICE": {
      const card = eventCardDefinitions[step.eventCardId];
      if (card) {
        buildEventPlayerChoice(state, visit, card);
      }
      break;
    }
    case "EVENT_CHANGE_MORALE":
      changeMorale(state, visit.playerId, step.amount);
      break;
    case "LOSE_RESOURCES": {
      if (!player) {
        break;
      }
      const losses: ResourceCost = {};
      for (const resource of Object.keys(RESOURCE_KIND_LABELS) as ResourceKind[]) {
        const amount = Math.min(step[resource] ?? 0, player.resources[resource] ?? 0);
        if (amount > 0) {
          losses[resource] = amount;
        }
      }
      if (Object.keys(losses).length > 0) {
        spendResources(state, visit.playerId, losses, step.reason);
      }
      break;
    }
    case "SPEND_HERO_MOVEMENT": {
      const hero = state.heroes[step.heroId];
      if (hero && hero.controllerId === visit.playerId) {
        hero.movementPoints = Math.max(0, hero.movementPoints - step.amount);
      }
      break;
    }
    case "EVENT_TREASURE_GAMBLE": {
      // Crypt's gamble is its own roll: Luck rerolls / die-set effects do not
      // apply here (they hook the standard ROLL_TREASURE_DICE step only). The
      // Negative Morale "roll 1 die less" DOES: its trigger is the player being
      // about to roll 2+ Treasure dice, whatever grants the roll — even though
      // here fewer dice mean fewer chances of the gamble-ending experience face.
      const gambleCount =
        step.count >= 2 && consumeHeldMoraleCard(state, visit.playerId, MORALE_CARD_IDS.rollOneLess)
          ? step.count - 1
          : step.count;
      const random = adventureRandom(state, "event-treasure-gamble");
      const rolls = Array.from(
        { length: gambleCount },
        () => TREASURE_DIE_FACES[random.nextInt(0, TREASURE_DIE_FACES.length - 1)]
      );
      appendEvent(state, {
        type: "ADVENTURE_DICE_ROLLED",
        playerId: visit.playerId,
        dice: "treasure",
        results: rolls.map(treasureFaceLabel),
        treasureRolls: [...rolls]
      });
      if (rolls.includes("experience")) {
        eventNote(state, `${eventPlayerName(state, visit.playerId)}: an experience face shows — gains nothing.`, visit.playerId);
        break;
      }
      visit.steps.unshift({
        type: "CHOOSE_ONE",
        prompt: "Choose one treasure die result",
        options: rolls.map((face) => ({ label: treasureFaceLabel(face), steps: treasureFaceSteps(face) }))
      });
      break;
    }
    case "EVENT_DISCARD_CHEAPEST_UNIT": {
      if (!player || player.army.length === 0) {
        break;
      }
      const goldValue = (unit: (typeof player.army)[number]): number => {
        const def = coreUnitDefinitions[unit.unitDefId];
        const cost = (unit.side === "neutral" ? def?.neutral?.cost : getUnitSide(unit.unitDefId, unit.side)?.cost) ?? {};
        return (Object.entries(cost) as [ResourceKind, number][]).reduce(
          (sum, [resource, amount]) =>
            sum + (resource === "gold" ? amount : amount * marketGoldValueOf(resource as "buildingMaterials" | "valuables")),
          0
        );
      };
      const cheapest = [...player.army].sort((left, right) => goldValue(left) - goldValue(right))[0];
      player.army = player.army.filter((unit) => unit.id !== cheapest.id);
      if (cheapest.side === "neutral") {
        const tier = (coreUnitDefinitions[cheapest.unitDefId]?.tier ?? "bronze") as "bronze" | "silver" | "gold" | "azure";
        state.decks[NEUTRAL_DECK_IDS[tier]]?.discardPile.push(cheapest.unitDefId);
      }
      eventNote(
        state,
        `${eventPlayerName(state, visit.playerId)} discards ${coreUnitDefinitions[cheapest.unitDefId]?.name ?? cheapest.unitDefId}.`,
        visit.playerId
      );
      break;
    }
    case "EVENT_REMOVE_FOR_SEARCH": {
      const adventure = state.adventure;
      if (!player || !adventure) {
        break;
      }
      const earnedSearches = step.single
        ? step.removed >= (step.minRemoved ?? 0)
          ? 1
          : 0
        : Math.floor(step.removed / step.per);
      // The earned Searches (and Garden's trailing hand reset) land at the
      // FRONT of the reward queue so the whole payout resolves within this
      // player's slot of the clockwise Event resolution, in printed order.
      const finish = () => {
        const rewards: AdventureReward[] = [];
        for (let grant = 0; grant < earnedSearches; grant += 1) {
          if (step.searchDecks.length > 1) {
            rewards.push({
              playerId: visit.playerId,
              kind: "visit-steps",
              steps: [
                {
                  type: "CHOOSE_ONE",
                  prompt: `Search (${step.searchCount}) which deck?`,
                  options: step.searchDecks.map((deckId) => ({
                    label: `Search (${step.searchCount}) the ${deckId === "spells" ? "Spell" : deckId === "abilities" ? "Ability" : "Artifact"} deck`,
                    steps: [{ type: "EVENT_SEARCH_FRONT", deckId, count: step.searchCount } as VisitStep]
                  }))
                }
              ]
            });
          } else {
            rewards.push({
              playerId: visit.playerId,
              kind: "shared-deck-search",
              deckId: step.searchDecks[0],
              count: step.searchCount
            });
          }
        }
        if (step.thenDiscardAllRedraw) {
          rewards.push({
            playerId: visit.playerId,
            kind: "visit-steps",
            steps: [{ type: "EVENT_DISCARD_ALL_DRAW_LIMIT" }]
          });
        }
        adventure.rewardQueue.unshift(...rewards);
      };

      if (step.finished) {
        finish();
        break;
      }
      const matches = eventHandMatches(player, step.filter);
      const canBeDone = step.removed >= (step.mustRemove ?? 0);
      if (matches.length === 0) {
        if (canBeDone) {
          finish();
        }
        break;
      }
      const options: { label: string; steps: VisitStep[] }[] = matches.map(({ cardId }) => ({
        label: `Remove ${cardLibrary[cardId]?.name ?? cardId}`,
        steps: [
          { type: "REMOVE_CARD_FROM_PILE", cardId, source: "hand" } as VisitStep,
          { ...step, removed: step.removed + 1 } as VisitStep
        ]
      }));
      if (canBeDone) {
        options.push({
          label: earnedSearches > 0 ? `Done — ${earnedSearches} Search${earnedSearches > 1 ? "es" : ""} earned` : "Done",
          steps: [{ ...step, finished: true } as VisitStep]
        });
      }
      visit.steps.unshift({
        type: "CHOOSE_ONE",
        prompt: `Remove ${step.filter === "spell" ? "Spell" : "Spell or Ability"} cards from your hand (${step.removed} removed)`,
        options
      });
      break;
    }
    case "EVENT_SEARCH_FRONT": {
      state.adventure?.rewardQueue.unshift({
        playerId: visit.playerId,
        kind: "shared-deck-search",
        deckId: step.deckId,
        count: step.count
      });
      break;
    }
    case "EVENT_DISCARD_ANY_THEN_DRAW": {
      if (!player) {
        break;
      }
      if (player.hand.length === 0) {
        visit.steps.unshift({ type: "EVENT_DRAW_TO_LIMIT", bonus: step.bonus });
        break;
      }
      const options: { label: string; steps: VisitStep[] }[] = player.hand.map((cardId) => ({
        label: `Discard ${cardLibrary[cardId]?.name ?? cardId}`,
        steps: [{ type: "EVENT_DISCARD_HAND_CARD", cardId } as VisitStep, { ...step } as VisitStep]
      }));
      options.push({
        label: `Done — draw up to your hand limit +${step.bonus}`,
        steps: [{ type: "EVENT_DRAW_TO_LIMIT", bonus: step.bonus }]
      });
      visit.steps.unshift({ type: "CHOOSE_ONE", prompt: "Discard as many cards as you want", options });
      break;
    }
    case "EVENT_DISCARD_HAND_CARD": {
      const index = player?.hand.indexOf(step.cardId) ?? -1;
      if (player && index !== -1) {
        player.hand.splice(index, 1);
        player.discard.push(step.cardId);
      }
      break;
    }
    case "EVENT_DRAW_TO_LIMIT": {
      if (!player) {
        break;
      }
      const target = effectiveHandLimit(state, visit.playerId) + step.bonus;
      drawCardsForPlayer(state, visit.playerId, Math.max(0, target - player.hand.length));
      break;
    }
    case "EVENT_DRAW_OWN": {
      if (!player) {
        break;
      }
      if (step.from === "deck") {
        drawCardsForPlayer(state, visit.playerId, step.count);
        break;
      }
      const taken = player.discard.splice(Math.max(0, player.discard.length - step.count));
      player.hand.push(...taken);
      eventNote(
        state,
        `${eventPlayerName(state, visit.playerId)} takes ${taken.length} card${taken.length === 1 ? "" : "s"} from their discard pile.`,
        visit.playerId
      );
      break;
    }
    case "EVENT_DISCARD_ALL_DRAW_LIMIT": {
      if (!player) {
        break;
      }
      player.discard.push(...player.hand);
      player.hand = [];
      drawCardsForPlayer(state, visit.playerId, effectiveHandLimit(state, visit.playerId));
      break;
    }
    case "EVENT_HERMIT_GAMBLE": {
      const random = adventureRandom(state, "event-hermit-gamble");
      const rolls = Array.from(
        { length: 3 },
        () => RESOURCE_DIE_FACES[random.nextInt(0, RESOURCE_DIE_FACES.length - 1)]
      );
      appendEvent(state, {
        type: "ADVENTURE_DICE_ROLLED",
        playerId: visit.playerId,
        dice: "resource",
        results: rolls.map(resourceDieLabel),
        resourceRolls: rolls.map((roll) => ({ resource: roll.resource, amount: roll.amount }))
      });
      const wrong = rolls.some((roll) => roll.resource === step.resource);
      visit.steps.unshift({
        type: "CHOOSE_ONE",
        prompt: wrong
          ? `Wrong — ${RESOURCE_KIND_LABELS[step.resource]} shows. Choose one die to LOSE`
          : `Right — no ${RESOURCE_KIND_LABELS[step.resource]}. Choose one die to gain`,
        options: rolls.map((roll) => ({
          label: resourceDieLabel(roll),
          steps: [
            wrong
              ? ({ type: "LOSE_RESOURCES", [roll.resource]: roll.amount, reason: "Withered Hermit" } as VisitStep)
              : ({ type: "GAIN_RESOURCES", [roll.resource]: roll.amount } as VisitStep)
          ]
        }))
      });
      break;
    }
    case "EVENT_HERMIT_PAY_SEARCH": {
      const random = adventureRandom(state, "event-hermit-pay");
      const roll = RESOURCE_DIE_FACES[random.nextInt(0, RESOURCE_DIE_FACES.length - 1)];
      appendEvent(state, {
        type: "ADVENTURE_DICE_ROLLED",
        playerId: visit.playerId,
        dice: "resource",
        results: [resourceDieLabel(roll)],
        resourceRolls: [{ resource: roll.resource, amount: roll.amount }]
      });
      visit.steps.unshift({
        type: "PAY_TO",
        prompt: `Pay ${roll.amount} ${RESOURCE_KIND_LABELS[roll.resource]} to Search (2) the Artifact deck?`,
        costOptions: [{ [roll.resource]: roll.amount }],
        // Front-of-queue so the paid Search opens within this player's slot.
        steps: [{ type: "EVENT_SEARCH_FRONT", deckId: "artifacts", count: 2 }]
      });
      break;
    }
    case "EVENT_MESSENGER_DRAW": {
      if (!player) {
        break;
      }
      const drawn: { cardId: CardId; deckId: string }[] = [];
      for (let i = 0; i < 2; i += 1) {
        const draw = drawEventFamilyCard(state, "artifacts", visit.playerId, i);
        if (draw) {
          drawn.push(draw);
        }
      }
      if (drawn.length === 0) {
        eventNote(state, "The Artifact deck is empty — the messenger has nothing to offer.", visit.playerId);
        break;
      }
      const options: { label: string; steps: VisitStep[] }[] = [];
      for (const draw of drawn) {
        const tier = cardLibrary[draw.cardId]?.artifactTier ?? "minor";
        const price = EVENT_ARTIFACT_PRICES[tier];
        if (!hasResources(player, { gold: price })) {
          continue;
        }
        const others = drawn.filter((candidate) => candidate !== draw);
        options.push({
          label: `Buy ${cardLibrary[draw.cardId]?.name ?? draw.cardId} (${price} gold)`,
          steps: [
            { type: "EVENT_TAKE_CARD", cardId: draw.cardId, deckId: draw.deckId, cost: { gold: price } } as VisitStep,
            ...(others.length > 0 ? [{ type: "EVENT_RETURN_CARDS", cards: others, mode: "shuffle" } as VisitStep] : [])
          ]
        });
      }
      options.push({
        label: "Put them on the Artifact discard pile — roll 2 Resource dice and resolve one",
        steps: [
          { type: "EVENT_RETURN_CARDS", cards: drawn, mode: "discard" } as VisitStep,
          { type: "ROLL_RESOURCE_DICE", count: 2 } as VisitStep
        ]
      });
      visit.steps.unshift({
        type: "CHOOSE_ONE",
        prompt: `Messenger with Supplies: you drew ${drawn.map((draw) => cardLibrary[draw.cardId]?.name ?? draw.cardId).join(" and ")}`,
        options
      });
      break;
    }
    case "EVENT_TAKE_CARD": {
      if (!player || (step.cost && !hasResources(player, step.cost))) {
        clearPolishArtifactAccess(state);
        break;
      }
      if (step.cost) {
        spendResources(state, visit.playerId, step.cost, `bought ${cardLibrary[step.cardId]?.name ?? step.cardId}`);
      }
      if (step.toDeck) {
        if (polishSpellBookEnabled(state) && cardLibrary[step.cardId]?.kind === "spell") {
          gainOwnedCard(state, visit.playerId, step.cardId);
        } else {
          player.deck = shuffleCards(
            [...player.deck, ...player.discard, step.cardId],
            `${state.seed}#event-buy#${visit.playerId}#${eventSeedNumber(state)}`
          );
          player.discard = [];
        }
      } else {
        gainOwnedCard(state, visit.playerId, step.cardId);
      }
      eventNote(
        state,
        `${eventPlayerName(state, visit.playerId)} takes ${cardLibrary[step.cardId]?.name ?? step.cardId}.`,
        visit.playerId
      );
      // Polish Random Artifacts: one roll per Messenger/market acquisition.
      if (cardLibrary[step.cardId]?.kind === "artifact") {
        clearPolishArtifactAccess(state);
      }
      break;
    }
    case "EVENT_RETURN_CARDS": {
      for (const entry of step.cards) {
        const deckId = entry.deckId || sharedDeckIdForCard(state, entry.cardId);
        const deck = state.decks[deckId];
        if (!deck) {
          continue;
        }
        switch (step.mode) {
          case "shuffle":
            deck.drawPile = shuffleCards(
              [...deck.drawPile, entry.cardId],
              `${state.seed}#event-return#${deckId}#${eventSeedNumber(state)}`
            );
            break;
          case "discard":
            deck.discardPile.push(entry.cardId);
            break;
          case "deck-top":
            deck.drawPile.push(entry.cardId);
            break;
          case "deck-bottom":
            deck.drawPile.unshift(entry.cardId);
            break;
        }
      }
      if (step.cards.some((entry) => cardLibrary[entry.cardId]?.kind === "artifact")) {
        clearPolishArtifactAccess(state);
      }
      break;
    }
    case "EVENT_SPELL_MARKET": {
      const card = getActiveEventCard(state);
      const effect = card?.effect;
      if (!player || !events || effect?.type !== "SPELL_MARKET") {
        break;
      }
      const options: { label: string; steps: VisitStep[] }[] = [];
      const offered = new Set<CardId>();
      for (const entry of events.pool) {
        if (offered.has(entry.cardId) || !canAcquireSharedDeckCard(state, visit.playerId, entry.deckId, entry.cardId)) {
          continue;
        }
        offered.add(entry.cardId);
        const name = cardLibrary[entry.cardId]?.name ?? entry.cardId;
        if (hasResources(player, { gold: effect.gold })) {
          options.push({
            label: `Buy ${name} (${effect.gold} gold)`,
            steps: [
              { type: "EVENT_TAKE_POOL_CARD", cardId: entry.cardId, cost: { gold: effect.gold }, toDeck: effect.buyToDeck } as VisitStep
            ]
          });
        }
        if (hasResources(player, { valuables: effect.valuables })) {
          options.push({
            label: `Buy ${name} (${effect.valuables} valuables)`,
            steps: [
              {
                type: "EVENT_TAKE_POOL_CARD",
                cardId: entry.cardId,
                cost: { valuables: effect.valuables },
                toDeck: effect.buyToDeck
              } as VisitStep
            ]
          });
        }
      }
      if (effect.dieAlternative) {
        options.push({ label: "Roll 1 Resource die instead", steps: [{ type: "ROLL_RESOURCE_DICE", count: 1 }] });
      }
      if (options.length === 0) {
        break;
      }
      options.push({ label: "Skip", steps: [] });
      visit.steps.unshift({ type: "CHOOSE_ONE", prompt: `${card?.name}: buy one Spell`, options });
      break;
    }
    case "EVENT_TAKE_POOL_CARD": {
      if (!player || (step.cost && !hasResources(player, step.cost))) {
        break;
      }
      const entry = takeEventPoolEntry(state, step.cardId);
      if (!entry) {
        break;
      }
      if (step.cost) {
        spendResources(state, visit.playerId, step.cost, `bought ${cardLibrary[step.cardId]?.name ?? step.cardId}`);
      }
      if (step.toDeck) {
        // Mage Laboratory: the bought card shuffles straight into the deck.
        if (polishSpellBookEnabled(state) && cardLibrary[step.cardId]?.kind === "spell") {
          gainOwnedCard(state, visit.playerId, step.cardId);
        } else {
          player.deck = shuffleCards(
            [...player.deck, ...player.discard, step.cardId],
            `${state.seed}#event-buy#${visit.playerId}#${eventSeedNumber(state)}`
          );
          player.discard = [];
        }
      } else {
        gainOwnedCard(state, visit.playerId, step.cardId);
      }
      eventNote(
        state,
        `${eventPlayerName(state, visit.playerId)} buys ${cardLibrary[step.cardId]?.name ?? step.cardId}.`,
        visit.playerId
      );
      break;
    }
    case "EVENT_POOL_CLEANUP": {
      if (!events) {
        break;
      }
      for (const entry of events.pool) {
        const deckId = entry.deckId || sharedDeckIdForCard(state, entry.cardId);
        const deck = state.decks[deckId];
        if (!deck) {
          continue;
        }
        if (events.poolCleanup === "discard-pile") {
          deck.discardPile.push(entry.cardId);
        } else {
          deck.drawPile = shuffleCards(
            [...deck.drawPile, entry.cardId],
            `${state.seed}#event-cleanup#${deckId}#${eventSeedNumber(state)}`
          );
        }
      }
      events.pool = [];
      break;
    }
    case "EVENT_FOREST_CONTRIBUTE": {
      if (!player) {
        break;
      }
      const options: { label: string; steps: VisitStep[] }[] = [];
      for (const { cardId } of eventHandMatches(player, "pool-kinds")) {
        options.push({
          label: `Put ${cardLibrary[cardId]?.name ?? cardId} face-down into the pool`,
          steps: [{ type: "EVENT_POOL_ADD_FROM_HAND", cardId }]
        });
      }
      for (const family of ["spells", "artifacts", "abilities"] as EventDeckFamily[]) {
        // Drawable ids only: an Artifact draw-and-view is not offered when the
        // early-game Relic lock leaves nothing this draw could actually hit.
        const hasCards = eventFamilyDrawableDeckIds(state, family).some((deckId) => {
          const deck = state.decks[deckId];
          return (deck?.drawPile.length ?? 0) + (deck?.discardPile.length ?? 0) > 0;
        });
        if (hasCards) {
          const label = family === "spells" ? "Spell" : family === "artifacts" ? "Artifact" : "Ability";
          options.push({
            label: `Draw and view the top ${label} card — it goes face-down into the pool`,
            steps: [{ type: "EVENT_POOL_ADD_DRAWN", deck: family }]
          });
        }
      }
      if (options.length === 0) {
        eventNote(state, `${eventPlayerName(state, visit.playerId)} has nothing to add to the pool.`, visit.playerId);
        break;
      }
      visit.steps.unshift({ type: "CHOOSE_ONE", prompt: "Magical Forest: add one card to the pool", options });
      break;
    }
    case "EVENT_POOL_ADD_FROM_HAND": {
      const index = player?.hand.indexOf(step.cardId) ?? -1;
      if (!player || !events || index === -1) {
        break;
      }
      player.hand.splice(index, 1);
      events.pool.push({ cardId: step.cardId, deckId: "", faceUp: false });
      eventNote(state, `${eventPlayerName(state, visit.playerId)} adds a card from their hand to the pool.`, visit.playerId);
      break;
    }
    case "EVENT_POOL_ADD_DRAWN": {
      if (!events) {
        break;
      }
      const draw = drawEventFamilyCard(state, step.deck, undefined, eventSeedNumber(state));
      if (!draw) {
        eventNote(state, `The ${step.deck} deck is empty — nothing enters the pool.`, visit.playerId);
        break;
      }
      events.pool.push({ ...draw, faceUp: false });
      eventNote(state, `${eventPlayerName(state, visit.playerId)} draws a card into the pool.`, visit.playerId);
      // "Draw and VIEW": only the contributor learns what went in. The prompt
      // is rendered for this player alone (like every other own-only menu).
      visit.steps.unshift({
        type: "CHOOSE_ONE",
        prompt: `You drew ${cardLibrary[draw.cardId]?.name ?? draw.cardId} — it goes face-down into the pool`,
        options: [{ label: "OK", steps: [] }]
      });
      break;
    }
    case "EVENT_FOREST_TAKE": {
      if (!events) {
        break;
      }
      const options: { label: string; steps: VisitStep[] }[] = [];
      if (events.pool.length > 0) {
        options.push({ label: "Take a random card from the pool", steps: [{ type: "EVENT_POOL_TAKE_RANDOM" }] });
      }
      options.push({ label: `Gain ${step.gold} gold`, steps: [{ type: "GAIN_RESOURCES", gold: step.gold }] });
      visit.steps.unshift({ type: "CHOOSE_ONE", prompt: "Magical Forest: take from the pool or take gold?", options });
      break;
    }
    case "EVENT_POOL_TAKE_RANDOM": {
      if (!player || !events || events.pool.length === 0) {
        break;
      }
      const random = adventureRandom(state, "event-forest-take");
      const entry = events.pool.splice(random.nextInt(0, events.pool.length - 1), 1)[0];
      gainOwnedCard(state, visit.playerId, entry.cardId);
      eventNote(state, `${eventPlayerName(state, visit.playerId)} takes a card from the pool.`, visit.playerId);
      break;
    }
    case "EVENT_LEPRECHAUN_ROLL": {
      if (!events) {
        break;
      }
      const random = adventureRandom(state, "event-leprechaun-roll");
      const treasure = TREASURE_DIE_FACES[random.nextInt(0, TREASURE_DIE_FACES.length - 1)];
      const resource = RESOURCE_DIE_FACES[random.nextInt(0, RESOURCE_DIE_FACES.length - 1)];
      appendEvent(state, {
        type: "ADVENTURE_DICE_ROLLED",
        playerId: visit.playerId,
        dice: "treasure",
        results: [treasureFaceLabel(treasure)],
        treasureRolls: [treasure]
      });
      appendEvent(state, {
        type: "ADVENTURE_DICE_ROLLED",
        playerId: visit.playerId,
        dice: "resource",
        results: [resourceDieLabel(resource)],
        resourceRolls: [{ resource: resource.resource, amount: resource.amount }]
      });
      const matches = events.dicePool
        .map((die, index) => ({ die, index }))
        .filter(({ die }) =>
          die.kind === "treasure"
            ? die.face === treasure
            : die.resource === resource.resource && die.amount === resource.amount
        );
      if (matches.length === 0) {
        eventNote(state, `${eventPlayerName(state, visit.playerId)} matches nothing in the pool.`, visit.playerId);
        break;
      }
      visit.steps.unshift({
        type: "CHOOSE_ONE",
        prompt: "Mischievous Leprechaun: your roll matches the pool — take a die?",
        options: [
          ...matches.map(({ die, index }) => ({
            label: `Take the ${eventDieLabel(die)} die`,
            steps: [{ type: "EVENT_TAKE_POOL_DIE", index } as VisitStep]
          })),
          { label: "Take nothing", steps: [] }
        ]
      });
      break;
    }
    case "EVENT_TAKE_POOL_DIE": {
      const die = events?.dicePool[step.index];
      if (!events || !die) {
        break;
      }
      events.dicePool.splice(step.index, 1);
      if (die.kind === "treasure") {
        visit.steps.unshift(...treasureFaceSteps(die.face));
      } else {
        visit.steps.unshift({ type: "GAIN_RESOURCES", [die.resource]: die.amount } as VisitStep);
      }
      break;
    }
    case "EVENT_DEN_OF_THIEVES": {
      const options: { label: string; steps: VisitStep[] }[] = [];
      for (const tier of ["bronze", "silver", "gold", "azure"] as const) {
        const deck = state.decks[NEUTRAL_DECK_IDS[tier]];
        if ((deck?.drawPile.length ?? 0) + (deck?.discardPile.length ?? 0) > 0) {
          options.push({
            label: `Take the top 2 cards of the ${tier} Neutral Unit deck`,
            steps: [{ type: "EVENT_DEN_DRAW", tier }]
          });
        }
      }
      if (options.length === 0) {
        eventNote(state, "Every Neutral Unit deck is empty — the den stands abandoned.", visit.playerId);
        break;
      }
      visit.steps.unshift({ type: "CHOOSE_ONE", prompt: "Den of Thieves: raid which Neutral Unit deck?", options });
      break;
    }
    case "EVENT_DEN_DRAW": {
      if (!player || !events) {
        break;
      }
      const drawn: string[] = [];
      for (let i = 0; i < 2; i += 1) {
        const unitDefId = drawFromNeutralDeck(state, step.tier);
        if (!unitDefId) {
          break;
        }
        drawn.push(unitDefId);
        events.pool.push({ cardId: unitDefId, deckId: NEUTRAL_DECK_IDS[step.tier], faceUp: true });
      }
      if (drawn.length === 0) {
        break;
      }
      const options: { label: string; steps: VisitStep[] }[] = [];
      const seen = new Set<string>();
      for (const unitDefId of drawn) {
        if (seen.has(unitDefId)) {
          continue;
        }
        seen.add(unitDefId);
        const cost = coreUnitDefinitions[unitDefId]?.neutral?.cost ?? {};
        if (coreUnitDefinitions[unitDefId]?.neutral && hasRecruitResources(state, visit.playerId, cost)) {
          options.push({
            label: `Buy ${coreUnitDefinitions[unitDefId]?.name ?? unitDefId} (${costLabelOf(cost)})`,
            steps: [
              { type: "EVENT_NEUTRAL_BUY", unitDefId } as VisitStep,
              { type: "EVENT_DEN_PLACE", tier: step.tier } as VisitStep
            ]
          });
        }
      }
      options.push({ label: "Buy nothing", steps: [{ type: "EVENT_DEN_PLACE", tier: step.tier }] });
      visit.steps.unshift({
        type: "CHOOSE_ONE",
        prompt: `Den of Thieves: drew ${drawn.map((id) => coreUnitDefinitions[id]?.name ?? id).join(" and ")}`,
        options
      });
      break;
    }
    case "EVENT_NEUTRAL_BUY": {
      const def = coreUnitDefinitions[step.unitDefId];
      const cost = def?.neutral?.cost ?? {};
      if (!player || !def?.neutral || !hasRecruitResources(state, visit.playerId, cost)) {
        break;
      }
      if (!takeEventPoolEntry(state, step.unitDefId)) {
        break;
      }
      spendRecruitResources(state, visit.playerId, cost, `recruited ${def.name} (Event)`);
      addArmyUnit(player, step.unitDefId, "neutral");
      appendEvent(state, {
        type: "UNIT_RECRUITED",
        playerId: visit.playerId,
        unitDefId: step.unitDefId,
        kind: "recruit",
        cost
      });
      break;
    }
    case "EVENT_DEN_PLACE": {
      const remaining = (events?.pool ?? []).filter((entry) => entry.deckId === NEUTRAL_DECK_IDS[step.tier]);
      if (remaining.length === 0) {
        break;
      }
      const unitDefIds = remaining.map((entry) => entry.cardId);
      const names = unitDefIds.map((id) => coreUnitDefinitions[id]?.name ?? id).join(" and ");
      visit.steps.unshift({
        type: "CHOOSE_ONE",
        prompt: `Place ${names} on the top or the bottom of the ${step.tier} Neutral Unit deck?`,
        options: [
          { label: "On top", steps: [{ type: "EVENT_RETURN_UNITS", unitDefIds, tier: step.tier, position: "top" }] },
          { label: "On the bottom", steps: [{ type: "EVENT_RETURN_UNITS", unitDefIds, tier: step.tier, position: "bottom" }] }
        ]
      });
      break;
    }
    case "EVENT_RETURN_UNITS": {
      const deck = state.decks[NEUTRAL_DECK_IDS[step.tier]];
      if (!deck) {
        break;
      }
      for (const unitDefId of step.unitDefIds) {
        if (!takeEventPoolEntry(state, unitDefId)) {
          continue;
        }
        if (step.position === "top") {
          deck.drawPile.push(unitDefId);
        } else {
          deck.drawPile.unshift(unitDefId);
        }
      }
      break;
    }
    case "EVENT_PRISON_OFFER": {
      if (!player || !events) {
        break;
      }
      if (events.pool.length < 2) {
        const tiers = (["bronze", "silver", "gold"] as const).filter((tier) => {
          const deck = state.decks[NEUTRAL_DECK_IDS[tier]];
          return (deck?.drawPile.length ?? 0) + (deck?.discardPile.length ?? 0) > 0;
        });
        if (tiers.length > 0) {
          visit.steps.unshift({
            type: "CHOOSE_ONE",
            prompt: `Prison: draw a Neutral Unit card (${events.pool.length}/2 in hand; Azure excluded)`,
            options: tiers.map((tier) => ({
              label: `Draw from the ${tier} Neutral Unit deck`,
              steps: [{ type: "EVENT_MERC_TAKE", tier, count: 1 } as VisitStep, { ...step } as VisitStep]
            }))
          });
          break;
        }
      }
      if (events.pool.length === 0) {
        eventNote(state, "The prison stands empty — no Neutral Unit cards remain.", visit.playerId);
        break;
      }
      const options: { label: string; steps: VisitStep[] }[] = [];
      const seen = new Set<string>();
      for (const entry of events.pool) {
        if (seen.has(entry.cardId)) {
          continue;
        }
        seen.add(entry.cardId);
        const def = coreUnitDefinitions[entry.cardId];
        const cost = def?.neutral?.cost ?? {};
        if (def?.neutral && hasRecruitResources(state, visit.playerId, cost)) {
          options.push({
            label: `Buy ${def?.name ?? entry.cardId} (${costLabelOf(cost)})`,
            steps: [{ type: "EVENT_NEUTRAL_BUY", unitDefId: entry.cardId }]
          });
        }
        options.push({
          label: `Discard ${def?.name ?? entry.cardId} — gain ${step.discardGold} gold`,
          steps: [{ type: "EVENT_NEUTRAL_DISCARD_GOLD", unitDefId: entry.cardId, gold: step.discardGold }]
        });
      }
      visit.steps.unshift({
        type: "CHOOSE_ONE",
        prompt: "Prison: buy one card, or discard one for gold (the rest passes on)",
        options
      });
      break;
    }
    case "EVENT_NEUTRAL_DISCARD_GOLD": {
      if (!takeEventPoolEntry(state, step.unitDefId)) {
        break;
      }
      const tier = (coreUnitDefinitions[step.unitDefId]?.tier ?? "bronze") as "bronze" | "silver" | "gold" | "azure";
      state.decks[NEUTRAL_DECK_IDS[tier]]?.discardPile.push(step.unitDefId);
      gainResources(state, visit.playerId, { gold: step.gold }, "Prison (Event)");
      break;
    }
    case "EVENT_MERC_DRAW": {
      const options: { label: string; steps: VisitStep[] }[] = [];
      for (const tier of ["bronze", "silver", "gold", "azure"] as const) {
        const deck = state.decks[NEUTRAL_DECK_IDS[tier]];
        const size = (deck?.drawPile.length ?? 0) + (deck?.discardPile.length ?? 0);
        if (size >= 2) {
          options.push({
            label: `Draw 2 from the ${tier} Neutral Unit deck`,
            steps: [{ type: "EVENT_MERC_TAKE", tier, count: 2 }]
          });
        }
        if (size >= 1) {
          options.push({
            label: `Draw 1 from the ${tier} Neutral Unit deck`,
            steps: [{ type: "EVENT_MERC_TAKE", tier, count: 1 }]
          });
        }
      }
      if (options.length === 0) {
        break;
      }
      options.push({ label: "Draw nothing", steps: [] });
      visit.steps.unshift({
        type: "CHOOSE_ONE",
        prompt: "Mercenary Camp: draw up to 2 Neutral Unit cards from ONE deck",
        options
      });
      break;
    }
    case "EVENT_MERC_TAKE": {
      if (!events) {
        break;
      }
      const drawn: string[] = [];
      for (let i = 0; i < step.count; i += 1) {
        const unitDefId = drawFromNeutralDeck(state, step.tier);
        if (!unitDefId) {
          break;
        }
        drawn.push(unitDefId);
        events.pool.push({ cardId: unitDefId, deckId: NEUTRAL_DECK_IDS[step.tier], faceUp: true });
      }
      if (drawn.length > 0) {
        eventNote(
          state,
          `${eventPlayerName(state, visit.playerId)} spreads ${drawn.map((id) => coreUnitDefinitions[id]?.name ?? id).join(" and ")} on the table.`,
          visit.playerId
        );
      }
      break;
    }
    case "EVENT_MERC_RECRUIT": {
      if (!player || !events || events.pool.length === 0) {
        break;
      }
      const options: { label: string; steps: VisitStep[] }[] = [];
      const seen = new Set<string>();
      for (const entry of events.pool) {
        if (seen.has(entry.cardId)) {
          continue;
        }
        seen.add(entry.cardId);
        const def = coreUnitDefinitions[entry.cardId];
        const cost = def?.neutral?.cost ?? {};
        if (def?.neutral && hasRecruitResources(state, visit.playerId, cost)) {
          options.push({
            label: `Recruit ${def?.name ?? entry.cardId} (${costLabelOf(cost)})`,
            steps: [{ type: "EVENT_NEUTRAL_BUY", unitDefId: entry.cardId }]
          });
        }
      }
      if (options.length === 0) {
        break;
      }
      options.push({ label: "Skip", steps: [] });
      visit.steps.unshift({ type: "CHOOSE_ONE", prompt: "Mercenary Camp: recruit one unit", options });
      break;
    }
    case "EVENT_ARTIFACT_SHOP": {
      if (!player || !events || events.pool.length === 0) {
        break;
      }
      // Polish Random Artifacts: merchant path uses hero-level band.
      maybeApplyPolishRandomArtifactRoll(state, visit.playerId, getMainHero(state, visit.playerId), "level");
      const options: { label: string; steps: VisitStep[] }[] = [];
      const seen = new Set<CardId>();
      for (const entry of events.pool) {
        if (seen.has(entry.cardId)) {
          continue;
        }
        seen.add(entry.cardId);
        const tier = cardLibrary[entry.cardId]?.artifactTier ?? "minor";
        if (!polishArtifactTierAllowed(state, tier)) {
          continue;
        }
        const price = EVENT_ARTIFACT_PRICES[tier];
        if (
          canAcquireSharedDeckCard(state, visit.playerId, entry.deckId, entry.cardId) &&
          hasResources(player, { gold: price })
        ) {
          options.push({
            label: `Buy ${cardLibrary[entry.cardId]?.name ?? entry.cardId} (${price} gold)`,
            steps: [
              { type: "EVENT_TAKE_POOL_CARD", cardId: entry.cardId, cost: { gold: price } } as VisitStep,
              { type: "EVENT_ARTIFACT_SHOP", boughtFromPool: true } as VisitStep
            ]
          });
        }
      }
      // "...either any number of them OR the face-up card from the Artifact
      // discard pile": the discard top drops out once a pool card was bought,
      // and buying it ends this player's shopping.
      if (!step.boughtFromPool) {
        for (const deckId of eventFamilyDeckIds(state, "artifacts")) {
          if (!polishArtifactDeckAllowed(state, deckId)) {
            continue;
          }
          const pile = state.decks[deckId]?.discardPile ?? [];
          const top = pile.length > 0 ? pile[pile.length - 1] : null;
          if (!top) {
            continue;
          }
          const tier = cardLibrary[top]?.artifactTier ?? "minor";
          // The early-game Relic lock covers the discard-top offer too.
          if (tier === "relic" && eventRelicsLocked(state)) {
            continue;
          }
          if (!polishArtifactTierAllowed(state, tier)) {
            continue;
          }
          const price = EVENT_ARTIFACT_PRICES[tier];
          if (canAcquireSharedDeckCard(state, visit.playerId, deckId, top) && hasResources(player, { gold: price })) {
            options.push({
              label: `Buy the discard top ${cardLibrary[top]?.name ?? top} (${price} gold)`,
              steps: [{ type: "BLACK_MARKET_BUY", cardId: top, deckId, price } as VisitStep]
            });
          }
        }
      }
      if (options.length === 0) {
        clearPolishArtifactAccess(state);
        break;
      }
      options.push({
        label: "Pass the cards on",
        steps: [{ type: "CLEAR_POLISH_ARTIFACT_ACCESS" } as VisitStep]
      });
      visit.steps.unshift({
        type: "CHOOSE_ONE",
        prompt: "Artifact Merchant: buy any number (minor 3 / major 5 / relic 7 gold)",
        options
      });
      break;
    }
    case "EVENT_AUCTION_OPEN": {
      if (!events) {
        break;
      }
      const draw = drawEventFamilyCard(state, "artifacts", undefined, eventSeedNumber(state));
      if (!draw) {
        events.auction = null;
        eventNote(state, "The Artifact deck is empty — no auction lot.");
        break;
      }
      events.auction = { lotCardId: draw.cardId, lotDeckId: draw.deckId, bids: {} };
      eventNote(state, `A Shady Auction: the lot is ${cardLibrary[draw.cardId]?.name ?? draw.cardId}.`);
      break;
    }
    case "EVENT_AUCTION_BID": {
      const auction = events?.auction;
      if (!player || !auction) {
        break;
      }
      const lotName = cardLibrary[auction.lotCardId]?.name ?? auction.lotCardId;
      const options: { label: string; steps: VisitStep[] }[] = [];
      for (let amount = 0; amount <= player.resources.gold; amount += 1) {
        options.push({
          label: amount === 0 ? "No bid" : `Bid ${amount} gold`,
          steps: [{ type: "EVENT_AUCTION_SET_BID", amount }]
        });
      }
      visit.steps.unshift({ type: "CHOOSE_ONE", prompt: `A Shady Auction: bid secretly for ${lotName}`, options });
      break;
    }
    case "EVENT_AUCTION_SET_BID": {
      const auction = events?.auction;
      if (!auction) {
        break;
      }
      auction.bids[visit.playerId] = step.amount;
      appendEvent(state, { type: "EVENT_AUCTION_BID_PLACED", playerId: visit.playerId });
      break;
    }
    case "EVENT_AUCTION_RESOLVE": {
      const auction = events?.auction;
      if (!events || !auction) {
        break;
      }
      const bids = Object.entries(auction.bids) as [PlayerId, number][];
      const highest = bids.reduce((max, [, amount]) => Math.max(max, amount), 0);
      const winners = bids.filter(([, amount]) => amount === highest && highest > 0);
      const winner = winners.length === 1 ? winners[0] : null;
      const winningPlayer = winner ? state.players[winner[0]] : null;
      if (winner && winningPlayer && hasResources(winningPlayer, { gold: winner[1] })) {
        spendResources(state, winner[0], { gold: winner[1] }, "won the auction");
        winningPlayer.hand.push(auction.lotCardId);
        appendEvent(state, {
          type: "EVENT_AUCTION_RESOLVED",
          cardId: auction.lotCardId,
          winnerId: winner[0],
          amount: winner[1]
        });
      } else {
        state.decks[auction.lotDeckId]?.discardPile.push(auction.lotCardId);
        appendEvent(state, { type: "EVENT_AUCTION_RESOLVED", cardId: auction.lotCardId, winnerId: null, amount: highest });
      }
      events.auction = null;
      break;
    }
    case "EVENT_MARKET_DEAL": {
      if (!player) {
        break;
      }
      const kinds = Object.keys(RESOURCE_KIND_LABELS) as ResourceKind[];
      const options: { label: string; steps: VisitStep[] }[] = [];
      for (const give of kinds) {
        if ((player.resources[give] ?? 0) < 1) {
          continue;
        }
        for (const get of kinds) {
          if (get === give) {
            continue;
          }
          options.push({
            label: `Offer 1 ${RESOURCE_KIND_LABELS[give]} for 1 ${RESOURCE_KIND_LABELS[get]}`,
            steps: [{ type: "EVENT_MARKET_DEAL_OPEN", give, get }]
          });
        }
      }
      if (options.length === 0) {
        break;
      }
      options.push({ label: "Cancel", steps: [] });
      visit.steps.unshift({ type: "CHOOSE_ONE", prompt: "Marketplace: propose a 1-for-1 exchange", options });
      break;
    }
    case "EVENT_MARKET_DEAL_OPEN": {
      const adventure = state.adventure;
      if (!events || !adventure) {
        break;
      }
      events.deal = { proposerId: visit.playerId, give: step.give, get: step.get, done: false };
      // The answers must land BEFORE any later Event rewards, in clockwise
      // order from the proposer — unshift them at the FRONT of the queue.
      const order = liveEventPlayers(state);
      const seat = order.indexOf(visit.playerId);
      const others = seat === -1 ? order : [...order.slice(seat + 1), ...order.slice(0, seat)];
      adventure.rewardQueue.unshift(
        ...others.map((playerId) => ({
          playerId,
          kind: "visit-steps" as const,
          steps: [{ type: "EVENT_MARKET_DEAL_ANSWER" } as VisitStep]
        }))
      );
      eventNote(
        state,
        `${eventPlayerName(state, visit.playerId)} offers 1 ${RESOURCE_KIND_LABELS[step.give]} for 1 ${RESOURCE_KIND_LABELS[step.get]}.`,
        visit.playerId
      );
      break;
    }
    case "EVENT_MARKET_DEAL_ANSWER": {
      const deal = events?.deal;
      const proposer = deal ? state.players[deal.proposerId] : null;
      if (
        !player ||
        !deal ||
        deal.done ||
        !proposer ||
        (proposer.resources[deal.give] ?? 0) < 1 ||
        (player.resources[deal.get] ?? 0) < 1
      ) {
        break;
      }
      visit.steps.unshift({
        type: "CHOOSE_ONE",
        prompt: `${eventPlayerName(state, deal.proposerId)} offers 1 ${RESOURCE_KIND_LABELS[deal.give]} for 1 ${RESOURCE_KIND_LABELS[deal.get]}`,
        options: [
          {
            label: `Accept — give 1 ${RESOURCE_KIND_LABELS[deal.get]}, receive 1 ${RESOURCE_KIND_LABELS[deal.give]}`,
            steps: [{ type: "EVENT_MARKET_DEAL_ACCEPT" }]
          },
          { label: "Decline", steps: [] }
        ]
      });
      break;
    }
    case "EVENT_MARKET_DEAL_ACCEPT": {
      const deal = events?.deal;
      const proposer = deal ? state.players[deal.proposerId] : null;
      if (
        !player ||
        !deal ||
        deal.done ||
        !proposer ||
        (proposer.resources[deal.give] ?? 0) < 1 ||
        (player.resources[deal.get] ?? 0) < 1
      ) {
        break;
      }
      deal.done = true;
      spendResources(state, deal.proposerId, { [deal.give]: 1 }, "Marketplace deal");
      gainResources(state, deal.proposerId, { [deal.get]: 1 }, "Marketplace deal");
      spendResources(state, visit.playerId, { [deal.get]: 1 }, "Marketplace deal");
      gainResources(state, visit.playerId, { [deal.give]: 1 }, "Marketplace deal");
      break;
    }
    default:
      break;
  }
}

export { TRADE_RATES };

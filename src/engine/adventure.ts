import { astrologersCardDefinitions, type AstrologersCardDefinition } from "@/data/cards/astrologers";
import { cardLibrary } from "@/data/cards/library";
import { coreBuildingDefinitions, coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities, type UnitMapAbilityEffect } from "@/data/units/abilities";
import type { UnitDefinition, UnitSideDefinition } from "@/data/factions/types";
import { hasInternalBorder } from "@/data/map/borders";
import { locationDefinitions, TRADE_RATES } from "@/data/map/locations";
import { allTileDefinitions } from "@/data/map/tiles";
import type { LocationInteraction, TileDefinition } from "@/data/map/types";
import {
  consumeIgnoreFieldNegativeMorale,
  expireEffectsForGameRoundEnd,
  expireEffectsForTurnEnd,
  releaseEndedOngoingCards
} from "./active-effects";
import { drawCardsForPlayer, shuffleCards } from "./decks";
import { appendEvent, eventSeedNumber, nextEventNumber } from "./events";
import { applyUnitSideRules } from "./ruleset";
import {
  hexDistance,
  hexNeighbors,
  hexSpaceId,
  parseHexSpaceId,
  slotDirection,
  tileCentersAdjacent,
  tileCentersOverlap,
  tileFootprint,
  type HexCoord
} from "./hex";
import { createSeededRandom } from "./random";
import { applyUnitCurrentSide } from "./unit-transforms";
import type {
  ActiveEffectState,
  AdventureState,
  ArtifactTier,
  AstrologersState,
  CardId,
  CombatUnitState,
  GameDifficulty,
  GameRuleset,
  GameState,
  HeroId,
  HeroState,
  MapFieldState,
  MapSpaceId,
  MapTileState,
  PendingVisit,
  PlayerId,
  PlayerState,
  ResourceCost,
  ResourceKind,
  TownState,
  UnitId,
  UnitTransformState,
  VictoryMode,
  VisitStep
} from "./state";
import { NEUTRAL_PLAYER_ID } from "./state";

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

export const RESOURCE_DIE_FACES: { resource: ResourceKind; amount: number }[] = [
  { resource: "buildingMaterials", amount: 2 },
  { resource: "buildingMaterials", amount: 4 },
  { resource: "valuables", amount: 1 },
  { resource: "valuables", amount: 2 },
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
  // Expansion backs, numbered as printed (sea waves IV–V, underworld V–VI).
  sea: "Ⅳ–Ⅴ",
  subterranean: "Ⅴ–Ⅵ"
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
      swiftWeaselUsedBy: []
    };
  }

  return adventure.astrologers;
}

export function getActiveAstrologersCard(state: GameState): AstrologersCardDefinition | null {
  const cardId = state.adventure?.astrologers?.activeCardId;
  return cardId ? (astrologersCardDefinitions[cardId] ?? null) : null;
}

/** Hand limit including temporary Astrologers effects (Profuse Growth). */
export function effectiveHandLimit(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId];
  if (!player) {
    return 0;
  }

  const active = getActiveAstrologersCard(state);
  const bonus = active?.effect.type === "HAND_LIMIT_MODIFIER" ? active.effect.amount : 0;
  // In-play permanents may raise the hand limit (Pandora's "hand +1").
  // Computed inline: permanents.ts imports this module, so it cannot be
  // imported back from here.
  const permanentIds = player.permanents ?? (player.permanent ? [player.permanent] : []);
  const permanentBonus = permanentIds.reduce(
    (total, cardId) => total + (cardLibrary[cardId]?.permanentEffect?.handLimitBonus ?? 0),
    0
  );
  return Math.max(1, player.limits.hand + bonus + permanentBonus);
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
 * The Roman-numeral band printed on a tile's back. Every group is uniform
 * except the Cove sea pool (see {@link seaTileBand}). Getting this right keeps
 * the revealed numerals honest and lets the BINH deck-unlock rules (which key
 * off the band) treat a Ⅵ–Ⅶ sea tile as a Center tile rather than a Near one.
 */
function tileBandLabel(group: string | undefined, def: TileDefinition | undefined): string | undefined {
  if (group === "sea" && def) {
    return seaTileBand(def) === "vi-vii" ? "Ⅵ–Ⅶ" : "Ⅳ–Ⅴ";
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
  const group = def?.group;
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
 * Locations that are always dry land, so on a sea tile they form an island hex
 * rather than open ocean. A tile field may still override its terrain
 * explicitly; this only decides the default for water-tile hexes. (Verify the
 * exact per-hex water/land split against the printed tile art before release —
 * a few generic buildings on a sea tile could sit on islands too.)
 */
const SEA_TILE_LAND_LOCATIONS = new Set<string>(["town", "random_town", "settlement", "mine", "stables"]);

/** Creates the 7 field states for a revealed tile. */
export function materializeTileFields(adventure: AdventureState, tile: MapTileState): void {
  const def = allTileDefinitions[tile.tileDefId];
  if (!def) {
    return;
  }

  const cells = tileFootprint({ row: tile.centerRow, col: tile.centerCol }, tile.rotation);
  for (let slot = 0; slot < cells.length; slot += 1) {
    const fieldDef = def.fields[slot];
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
    // Resolve per-hex terrain. An explicit field override wins; otherwise a hex
    // on a water tile is open sea — except the structures that can only sit on
    // dry ground (a town/mine/settlement/stable is an island, i.e. land).
    const isWater = fieldDef.terrain
      ? fieldDef.terrain === "water"
      : def.terrain === "water" && !SEA_TILE_LAND_LOCATIONS.has(fieldDef.location);
    if (isWater) {
      field.terrain = "water";
    }
    adventure.fields[spaceId] = field;
  }
}

export function getTileFootprintSpaceIds(tile: MapTileState): MapSpaceId[] {
  return tileFootprint({ row: tile.centerRow, col: tile.centerCol }, tile.rotation).map(hexSpaceId);
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
  /** Fly / Angel Wings: may move through blocked fields (never stop on one). */
  moveThrough: boolean;
  /** Water Walk: may enter, cross and stop on sea (water-terrain) fields. */
  waterWalk: boolean;
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
  for (const effect of state.activeEffects) {
    if (effect.controllerId !== hero.controllerId) {
      continue;
    }
    for (const modifier of effect.modifiers) {
      if (modifier.type === "HERO_MOVE_THROUGH") {
        moveThrough = true;
      } else if (modifier.type === "HERO_WATER_WALK") {
        waterWalk = true;
      }
    }
  }
  return moveThrough || waterWalk ? { moveThrough, waterWalk } : NO_MOVEMENT_CAPABILITIES;
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
  return !movement.waterWalk && isSeaField(state, from) !== isSeaField(state, to);
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

  if (locationDefinitions[toField.location]?.category === "blocked") {
    // Blocked fields stop ground movement; Fly / Angel Wings let a hero pass
    // over them (classifyHeroStep still forbids ending the move there).
    return movement.moveThrough;
  }

  // A hero may always step from land onto an adjacent sea field. Without Water
  // Walk that step is a forced stop (classifyHeroStep returns "stop" and the
  // mover is halted for the turn); with Water Walk the sea is normal terrain.
  // Either way the edge itself is crossable, so no sea gate is applied here.

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

  return !isOuterEdgeSealed(adventure, fromField) && !isOuterEdgeSealed(adventure, toField);
}

function isOuterEdgeSealed(adventure: AdventureState, field: MapFieldState): boolean {
  if (field.slot === 0) {
    return false;
  }

  const tile = adventure.tiles[field.tileInstanceId];
  const def = tile ? allTileDefinitions[tile.tileDefId] : undefined;
  if (!tile || !def) {
    return false;
  }

  const direction = slotDirection(field.slot, 0);
  return direction === null ? false : Boolean(def.outerImpassable[direction]);
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
  return Boolean(field.difficulty) && !field.blackCube && !field.everFlagged;
}

/**
 * What happens when a hero walks into a field:
 *  - "open": nothing stops the hero (empty, used-up, or own-flagged fields) —
 *    valid as both a stop and a pass-through.
 *  - "stop": entering triggers something (guards, enemy heroes, unvisited
 *    locations, flags to steal) so the path must end here.
 *  - "pass-only": an allied hero stands here; you may walk through but not stay.
 *  - "block": never enterable (blocked fields, sanctuary-protected enemies).
 */
export type HeroStepKind = "open" | "stop" | "pass-only" | "block";

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

  const occupant = heroAtSpace(state, spaceId, hero.id);
  if (occupant) {
    if (occupant.controllerId === playerId) {
      return "pass-only";
    }
    // Heroes inside a Sanctuary cannot be attacked; the rulebook lets
    // friendly heroes move through them but never stop there.
    return location?.passive?.protectsFromAttack ? "pass-only" : "stop";
  }

  if (isFieldGuarded(field) && field.flagOwnerId !== playerId) {
    return "stop";
  }

  // Dragon Conqueror: a captured Dragon Utopia is a stronghold — its holder
  // walks on and off freely, everyone else must stop to besiege it.
  if (field.location === "dragon_utopia" && field.flagOwnerId && adventureVictoryMode(state) === "dragon-conqueror") {
    return field.flagOwnerId === playerId ? "open" : "stop";
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
          results.set(neighbor, { spaceId: neighbor, path, cost: path.length });
          continue;
        }

        if (kind === "pass-only") {
          if (!halts) {
            next.push({ spaceId: neighbor, path });
          }
          continue;
        }

        results.set(neighbor, { spaceId: neighbor, path, cost: path.length });
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
 * Whether the hero placing a Far (Ⅱ–Ⅲ) tile could actually cross onto it once
 * it lands at `rotation`. A new tile sits next to the hero, but a solid yellow
 * border on the facing edge — on the hero's field or the new tile's — can wall
 * it off; the rulebook forbids placing a tile the hero cannot reach.
 *
 * The new tile's fields are not materialized yet, so its own fields are read
 * from the definition (slot → location and outer-arc seal) and the rest of the
 * map from the already-revealed fields. A flood fill over crossable edges from
 * the hero decides whether the hero's field and any field of the new tile share
 * a connected component. Border lines are permanent while guards and rival
 * heroes are not, so transient blockers are ignored: this answers "can the hero
 * ever cross there", not "this turn".
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
  if (!adventure || !def || !hero.spaceId || !adventure.fields[hero.spaceId]) {
    return false;
  }

  const footprint = tileFootprint(center, rotation);
  // Map every candidate hex to its tile slot (0 = center, 1–6 = ring).
  const candidateSlots = new Map<MapSpaceId, number>();
  footprint.forEach((cell, slot) => candidateSlots.set(hexSpaceId(cell), slot));

  type Cell = { tileId: string; slot: number; blocked: boolean; sealed: boolean };
  const cellAt = (spaceId: MapSpaceId): Cell | null => {
    const candidateSlot = candidateSlots.get(spaceId);
    if (candidateSlot !== undefined) {
      const fieldDef = def.fields[candidateSlot];
      return {
        tileId: "__candidate__",
        slot: candidateSlot,
        blocked: locationDefinitions[fieldDef?.location]?.category === "blocked",
        // A ring field's outer-arc seal travels with its slot; the center never seals.
        sealed: candidateSlot !== 0 && Boolean(def.outerImpassable[candidateSlot - 1])
      };
    }
    const field = adventure.fields[spaceId];
    if (!field) {
      return null;
    }
    return {
      tileId: field.tileInstanceId,
      slot: field.slot,
      blocked: locationDefinitions[field.location]?.category === "blocked",
      sealed: isOuterEdgeSealed(adventure, field)
    };
  };

  const internalBorderBlocks = (cell: Cell, otherSlot: number): boolean => {
    const tileDef =
      cell.tileId === "__candidate__" ? def : allTileDefinitions[adventure.tiles[cell.tileId]?.tileDefId ?? ""];
    return tileDef ? hasInternalBorder(tileDef, cell.slot, otherSlot) : false;
  };

  const canCross = (from: Cell, to: Cell): boolean => {
    if (to.blocked) {
      return false;
    }
    if (from.tileId === to.tileId) {
      // Same tile: only a printed internal yellow line blocks the step.
      return !internalBorderBlocks(from, to.slot);
    }
    // Crossing between tiles needs both outer arcs open.
    return !from.sealed && !to.sealed;
  };

  // Flood fill from the hero; succeed the moment a crossable step lands on the
  // new tile.
  const start = hero.spaceId;
  const visited = new Set<MapSpaceId>([start]);
  const queue: MapSpaceId[] = [start];
  while (queue.length > 0) {
    const currentId = queue.shift() as MapSpaceId;
    const current = cellAt(currentId);
    if (!current) {
      continue;
    }
    for (const neighborId of getAdjacentSpaceIds(currentId)) {
      if (visited.has(neighborId)) {
        continue;
      }
      const neighbor = cellAt(neighborId);
      if (!neighbor || !canCross(current, neighbor)) {
        continue;
      }
      if (candidateSlots.has(neighborId)) {
        return true;
      }
      visited.add(neighborId);
      queue.push(neighborId);
    }
  }
  return false;
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
 * Morale tokens by the book (rulebook Morale Actions + wiki morale table):
 * at most one positive token (+1) and one negative token (-1); gaining the
 * opposite token cancels back to neutral. Gaining a second negative token
 * resets morale to neutral AND discards the hand the next time the player
 * ends their turn. Necropolis ignores morale entirely.
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

  let next = player.morale;
  let overflow = 0;
  for (let step = 0; step < Math.abs(amount); step += 1) {
    if (amount > 0) {
      // The positive token caps at +1; any further gain does not stack but
      // must be spent right away (draw / discard-redraw) — tracked as overflow.
      if (next >= 1) {
        overflow += 1;
      } else {
        next += 1;
      }
    } else if (next <= -1) {
      // Negative + negative → neutral, and the hand is discarded at turn end.
      next = 0;
      player.discardHandAtTurnEnd = true;
    } else {
      next -= 1;
    }
  }
  player.morale = next;
  if (overflow > 0) {
    player.moraleOverflow = (player.moraleOverflow ?? 0) + overflow;
  }

  appendEvent(state, { type: "MORALE_CHANGED", playerId, amount, total: player.morale });
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
        count: 2
      });
      effects.push("Search (2) the Ability deck");
    }

    if (SPECIALTY_LEVELS.includes(level as 4 | 6) && player.heroDefId) {
      const heroDef = coreHeroDefinitions[player.heroDefId];
      const specialtyCardId = heroDef?.specialtyCardIds[level as 4 | 6];
      if (specialtyCardId) {
        player.hand.push(specialtyCardId);
        effects.push(`gained specialty ${specialtyCardId}`);
      }
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
    state.adventure.rewardQueue.push({ playerId, kind: "learning-level-up" });
  }
}

// ---------------------------------------------------------------------------
// Visits
// ---------------------------------------------------------------------------

function interactionToSteps(interaction: LocationInteraction): VisitStep[] {
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
    case "ROLL_RESOURCE_DICE":
      return [{ type: "ROLL_RESOURCE_DICE", count: interaction.count }];
    case "ROLL_TREASURE_DICE":
      return [{ type: "ROLL_TREASURE_DICE", count: interaction.count }];
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
            steps: interactionToSteps(option.interaction)
          }))
        }
      ];
    case "PAY_TO":
      return [
        {
          type: "PAY_TO",
          prompt: "Pay to use this field?",
          costOptions: interaction.costOptions,
          steps: interactionToSteps(interaction.interaction)
        }
      ];
    case "SEQUENCE":
      return interaction.interactions.flatMap((inner) => interactionToSteps(inner));
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
          plus: interactionToSteps(interaction.plus),
          zero: interactionToSteps(interaction.zero),
          minus: interactionToSteps(interaction.minus)
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
    case "HILL_FORT":
      return [{ type: "HILL_FORT" }];
    case "SUBTERRANEAN_GATE":
      return [{ type: "SUBTERRANEAN_GATE" }];
    case "DRAW_PANDORA_CARD":
      return [{ type: "DRAW_PANDORA_CARD" }];
    case "LIBRARY_OF_ENLIGHTENMENT":
      return [{ type: "LIBRARY_SWAP", remaining: 2 }];
    case "STAR_AXIS":
      return [{ type: "STAR_AXIS_SWAP" }];
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
  }
}

function flagField(state: GameState, playerId: PlayerId, field: MapFieldState): void {
  const previousOwnerId = field.flagOwnerId;
  field.flagOwnerId = playerId;

  appendEvent(state, {
    type: "FIELD_FLAGGED",
    playerId,
    fieldId: field.spaceId,
    location: field.location,
    previousOwnerId
  });
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
 * Whether the "defeat every enemy hero" path can win this game. Shared by the
 * Grail Hunt and Dragon Hunt modes — both let a player win by military
 * dominance even if they never reach the objective creature bank.
 */
export function victoryModeCountsHeroDefeats(mode: VictoryMode): boolean {
  return mode === "grail" || mode === "dragon-hunt";
}

/** Ends the game with a winner and the reason shown in the log. */
export function declareAdventureWinner(state: GameState, playerId: PlayerId, reason: string): void {
  if (!state.adventure) {
    return;
  }
  state.adventure.winnerPlayerId = playerId;
  state.phase = "game-over";
  appendEvent(state, { type: "GAME_WON", playerId, reason });
}

/** Human seats in turn order (the neutral seat never counts). */
export function humanPlayerIds(state: GameState): PlayerId[] {
  return state.turnOrder.filter((id) => id !== NEUTRAL_PLAYER_ID);
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
 */
export function controlsTownOrSettlement(state: GameState, playerId: PlayerId): boolean {
  const adventure = state.adventure;
  if (!adventure) {
    return true;
  }
  for (const field of Object.values(adventure.fields)) {
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

  for (const hero of Object.values(state.heroes)) {
    if (hero.controllerId === playerId) {
      hero.spaceId = null;
      hero.movementPoints = 0;
    }
  }

  state.turnOrder = state.turnOrder.filter((id) => id !== playerId);

  appendEvent(state, { type: "PLAYER_ELIMINATED", playerId, reason, gaveUp });

  if (state.adventure && !state.adventure.winnerPlayerId) {
    const remaining = humanPlayerIds(state).filter((id) => !state.players[id]?.eliminated);
    if (remaining.length === 1) {
      declareAdventureWinner(state, remaining[0], "the last faction standing");
    }
  }
}

/**
 * Enemy heroes a player must beat to win by conquest of heroes: every enemy
 * in a 2- or 3-player game, but only 2 of the 3 in a 4-player game.
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
 * Grail field visit. In Grail Hunt the first visit (after the guards fall)
 * arms the dig; a later revisit for 1 MP collects the single Grail Token,
 * which must then be carried home. In every other mode it is a normal
 * Lvl-VII fight rewarding gold and a Relic artifact.
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
    // the Grail itself is not collected until the hero spends another MP.
    field.blackCube = true;
    if (grail.status === "uncollected") {
      field.grailDiggable = true;
    }
    return;
  }

  // Revisit = the dig. Only the first dig mints the one Grail Token.
  if (field.grailDiggable && grail.status === "uncollected") {
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
 * Dragon Utopia visit (after its four dragons are defeated):
 *  - Dragon Hunt: defeating the Utopia wins outright (no need to hold it).
 *  - Dragon Conqueror: the victor captures and must hold it; rivals besiege it.
 *  - Grail Hunt & Conquest: a normal Lvl-VII creature bank rewarding gold and a
 *    Relic artifact — the Utopia is NOT a win condition in those modes.
 */
function handleDragonUtopiaVisit(state: GameState, hero: HeroState, field: MapFieldState): void {
  const mode = adventureVictoryMode(state);

  if (mode === "dragon-hunt") {
    declareAdventureWinner(state, hero.controllerId, "defeated the Dragon Utopia");
    return;
  }

  if (mode === "dragon-conqueror") {
    // Capture: flag the Utopia for the victor and keep neutrals from
    // respawning. Holding it at the start of a later turn wins.
    const previousOwnerId = field.flagOwnerId;
    field.flagOwnerId = hero.controllerId;
    field.everFlagged = true;
    field.blackCube = false;
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
  declareAdventureWinner(state, hero.controllerId, "carried the Grail home");
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
    declareAdventureWinner(state, playerId, "held the Dragon Utopia");
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

  if (location.category === "flaggable" && location.id !== "settlement") {
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
    location.id === "settlement"
      ? interactionToSteps(location.interaction)
      : location.implementationStatus === "implemented"
        ? interactionToSteps(location.interaction)
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
        // already have a Secondary Hero, gain 3 gold instead."
        if (getSecondaryHero(state, visit.playerId)) {
          gainResources(state, visit.playerId, { gold: 3 }, `visited ${fieldName(state, visit.fieldId)}`);
        } else {
          createSecondaryHero(state, visit.playerId, visit.fieldId);
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
      case "GAIN_MORALE":
        // Crest of Valor (map side): a held shield negates one negative-morale
        // token handed out by a Field. Positive morale and combat-loss morale
        // are untouched — only a Field's own negative token is ignored here.
        if (step.amount < 0 && consumeIgnoreFieldNegativeMorale(state, visit.playerId)) {
          appendEvent(state, {
            type: "FIELD_MORALE_IGNORED",
            playerId: visit.playerId,
            fieldId: visit.fieldId
          });
        } else {
          changeMorale(state, visit.playerId, step.amount);
        }
        break;
      case "ROLL_RESOURCE_DICE":
        rollResourceDice(state, visit, step.count);
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
      case "CONSUME_WEASEL": {
        const astrologers = getAstrologersState(state);
        if (astrologers && !astrologers.swiftWeaselUsedBy.includes(visit.playerId)) {
          astrologers.swiftWeaselUsedBy.push(visit.playerId);
        }
        break;
      }
      case "FLIP_PACK_TO_FEW": {
        const player = state.players[visit.playerId];
        const armyUnit = player?.army.find((candidate) => candidate.id === step.armyUnitId);
        if (player && armyUnit && armyUnit.side === "pack") {
          armyUnit.side = "few";
          appendEvent(state, {
            type: "ARMY_UNIT_FLIPPED",
            playerId: visit.playerId,
            unitDefId: armyUnit.unitDefId,
            reason: "Terrible Plague"
          });
        }
        break;
      }
      case "REINFORCE_ARMY_UNIT":
        reinforceArmyUnit(state, visit.playerId, step.armyUnitId, step.halfCost);
        break;
      case "REINFORCE_FREE":
        reinforceArmyUnit(state, visit.playerId, step.armyUnitId, false, false, false, true);
        break;
      case "SEARCH_SHARED_DECK":
        adventure.rewardQueue.push({
          playerId: visit.playerId,
          kind: "shared-deck-search",
          deckId: step.deckId,
          count: step.count
        });
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
        visit.steps.unshift(...(roll > 0 ? step.plus : roll === 0 ? step.zero : step.minus));
        break;
      }
      case "SUBTERRANEAN_GATE":
        resolveSubterraneanGate(state, visit);
        break;
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
          if (step.visit) {
            adventure.lastVisitedField[movedHero.id] = step.spaceId;
            beginFieldVisit(state, movedHero.id, step.spaceId, false);
          }
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
      case "NECROMANCY_FETCH":
        resolveNecromancyFetch(state, visit.playerId);
        break;
      case "DISCARD_PICK":
        adventure.rewardQueue.push({
          playerId: visit.playerId,
          kind: "discard-pick",
          count: step.count,
          filter: step.filter
        });
        break;
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
      case "REINFORCE_HALF_GOLD":
        reinforceArmyUnit(state, visit.playerId, step.armyUnitId, false, true, step.roundDown ?? false);
        break;
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
      case "BLACK_MARKET": {
        const player = state.players[visit.playerId];
        if (!player) {
          break;
        }
        const options = blackMarketOffers(state)
          .filter((offer) => hasResources(player, { gold: offer.price }))
          .map((offer) => ({
            label: `Buy ${cardLibrary[offer.cardId]?.name ?? offer.cardId} (${offer.price} gold)`,
            steps: [{ type: "BLACK_MARKET_BUY", cardId: offer.cardId, deckId: offer.deckId, price: offer.price } as VisitStep]
          }));
        if (options.length === 0) {
          break;
        }
        options.push({ label: "Leave", steps: [] });
        visit.steps.unshift({ type: "CHOOSE_ONE", prompt: "Black Market: buy an artifact", options });
        break;
      }
      case "BLACK_MARKET_BUY": {
        const player = state.players[visit.playerId];
        const deck = state.decks[step.deckId];
        const index = deck?.discardPile.lastIndexOf(step.cardId) ?? -1;
        if (!player || !deck || index === -1 || !hasResources(player, { gold: step.price })) {
          break;
        }
        spendResources(state, visit.playerId, { gold: step.price }, "Black Market");
        deck.discardPile.splice(index, 1);
        player.hand.push(step.cardId);
        break;
      }
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
        const drawn = drawTopOfSharedDeck(state, step.deckId);
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

/** Draws the top card of a shared deck, reshuffling its discard if it ran dry. */
function drawTopOfSharedDeck(state: GameState, deckId: string): string | null {
  const deck = state.decks[deckId];
  if (!deck) {
    return null;
  }
  if (deck.drawPile.length === 0 && deck.discardPile.length > 0) {
    deck.drawPile = shuffleCards(
      deck.discardPile,
      `${state.seed}#scroll-reshuffle#${deckId}#${eventSeedNumber(state)}`
    );
    deck.discardPile = [];
  }
  return deck.drawPile.pop() ?? null;
}

/**
 * Subterranean Gate: the hero moves to the gate on the adjacent tile (tile
 * centers at hex distance 3 - the two flowers touch). No gate there means
 * nothing happens.
 */
function resolveSubterraneanGate(state: GameState, visit: PendingVisit): void {
  const adventure = state.adventure;
  const hero = state.heroes[visit.heroId];
  const field = adventure?.fields[visit.fieldId];
  if (!adventure || !hero || !field) {
    return;
  }

  const homeTile = adventure.tiles[field.tileInstanceId];
  if (!homeTile) {
    return;
  }

  const target = Object.values(adventure.fields).find((candidate) => {
    if (candidate.location !== "subterranean_gate" || candidate.spaceId === field.spaceId) {
      return false;
    }
    const tile = adventure.tiles[candidate.tileInstanceId];
    return (
      Boolean(tile) &&
      !tile!.faceDown &&
      hexDistance(
        { row: homeTile.centerRow, col: homeTile.centerCol },
        { row: tile!.centerRow, col: tile!.centerCol }
      ) === 3
    );
  });

  if (!target || heroAtSpace(state, target.spaceId, hero.id)) {
    return;
  }

  const from = hero.spaceId ?? visit.fieldId;
  hero.spaceId = target.spaceId;
  appendEvent(state, {
    type: "HERO_MOVED",
    playerId: visit.playerId,
    heroId: hero.id,
    from,
    to: target.spaceId,
    movementLeft: hero.movementPoints
  });
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
  const isAnyDie = effect.modifiers.some(
    (modifier) => modifier.type === "ADVENTURE_DIE_REROLL" && modifier.dice === "any"
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

  // Expert Luck is one reroll of any die: spend the whole card. Basic Luck
  // tracks the treasure and resource rerolls separately.
  if (isAnyDie) {
    state.activeEffects = state.activeEffects.filter((candidate) => candidate.id !== effectId);
    return;
  }

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
  return RESOURCE_DIE_FACES.map((face) => ({
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

  return options;
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

  if (rolls.length === 1 && !luck && extraOptions.length === 0 && !setEffect) {
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

  if (roll > 0) {
    visit.steps.unshift({
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
    });
    return;
  }

  visit.steps.unshift({
    type: "SEARCH_SHARED_DECK",
    deckId: roll === 0 ? "abilities" : "spells",
    count: 2
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
};

/**
 * Dragon Utopia guards (creature bank): one each of the four dragons, in
 * descending strength. They are minted for the fight rather than drawn, so
 * the Neutral azure deck is never touched.
 */
export const DRAGON_UTOPIA_GUARD_IDS = [
  "neutral.azure_dragons",
  "neutral.rust_dragons",
  "neutral.crystal_dragons",
  "neutral.faerie_dragons"
] as const;

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

/** Draws the neutral army for a guarded field from the four tier decks. */
export function drawNeutralArmy(state: GameState, difficulty: number): NeutralDraw[] {
  const adventure = state.adventure;
  if (!adventure) {
    return [];
  }

  const counts = NEUTRAL_ARMY_TABLE[adventure.difficulty][difficulty];
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
  if (field?.location === "dragon_utopia") {
    return DRAGON_UTOPIA_GUARD_IDS.map((unitDefId) => ({ unitDefId, tier: "azure" as const, bankGuard: true }));
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

const PLAYABLE_FACTIONS = [
  "castle",
  "rampart",
  "inferno",
  "necropolis",
  "dungeon",
  "stronghold",
  "fortress",
  "tower"
] as const;

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
  ruleset: GameRuleset = "legacy"
): CombatUnitState | null {
  const def = coreUnitDefinitions[draw.unitDefId];
  // Random Town defenders fight on their faction's Pack side; every other
  // guard uses the single-sided Neutral card.
  const variant: "neutral" | "pack" = draw.factionPack ? "pack" : "neutral";
  const printed = draw.factionPack ? def?.pack : def?.neutral;
  if (!def || !printed) {
    return null;
  }

  const side = applyUnitSideRules(ruleset, draw.unitDefId, variant, printed);

  return {
    id: unitId,
    controllerId: NEUTRAL_PLAYER_ID,
    name: def.name,
    cardName: `${draw.factionPack ? "Pack of" : "Neutral"} ${def.name}`,
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
    ...(draw.bankGuard ? { bankGuard: true } : {}),
    assets: {
      cardImage: side.cardImage,
      imageAlt: `${def.name} unit card`,
      wikiUrl: def.wikiUrl
    }
  };
}

export function makeCombatUnitFromArmy(
  armyUnit: { id: string; unitDefId: string; side: "few" | "pack" | "neutral"; transforms?: UnitTransformState[] },
  controllerId: PlayerId,
  unitId: UnitId,
  position: number,
  ruleset: GameRuleset = "legacy"
): CombatUnitState | null {
  const def = coreUnitDefinitions[armyUnit.unitDefId];
  const printed = armyUnit.side === "few" ? def?.few : armyUnit.side === "pack" ? def?.pack : def?.neutral;
  if (!def || !printed) {
    return null;
  }

  const side = applyUnitSideRules(ruleset, armyUnit.unitDefId, armyUnit.side, printed);

  const unit: CombatUnitState = {
    id: unitId,
    controllerId,
    name: def.name,
    cardName: `${armyUnit.side === "few" ? "Few" : armyUnit.side === "pack" ? "Pack of" : "Neutral"} ${def.name}`,
    variant: armyUnit.side,
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
    unitDefId: armyUnit.unitDefId,
    armyUnitId: armyUnit.id,
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
    applyUnitCurrentSide(unit, ruleset);
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
  effectType: "UNLOCK_REINFORCE" | "MAGE_GUILD"
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

let armyCounter = 0;

export function addArmyUnit(
  player: PlayerState,
  unitDefId: string,
  side: "few" | "pack" | "neutral"
): PlayerState["army"][number] {
  armyCounter += 1;
  const armyUnit = {
    id: `army_${player.id}_${armyCounter}_${player.army.length + 1}`,
    unitDefId,
    side
  };
  player.army.push(armyUnit);
  return armyUnit;
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
    player.combatStats.expertUsesSpentThisRound = 0;
    player.combatStats.expertUseBonusThisRound = 0;
  }

  for (const hero of Object.values(state.heroes)) {
    hero.movementPoints = heroMovementMax(state, hero);
    // Fresh movement clears any sea-halt from waking up on / wading into the sea.
    hero.movementHaltedThisTurn = false;
  }
}

/**
 * Starts an adventure round (rulebook round structure): refresh tokens, MP
 * and expert effects; then even rounds draw an Astrologers Proclaim card and
 * odd rounds after the first pay Resource Round income.
 */
export function startAdventureRound(state: GameState): void {
  const kind = state.round === 1 ? "first" : state.round % 2 === 1 ? "resource" : "astrologers";

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

  if (kind === "astrologers") {
    drawAstrologersCard(state);

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

  for (const playerId of state.turnOrder) {
    const player = state.players[playerId];
    if (!player || playerId === NEUTRAL_PLAYER_ID) {
      continue;
    }

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
      const incomeGain = cardLibrary[permanentId]?.permanentEffect?.resourceRoundGain;
      if (incomeGain) {
        gainResources(state, playerId, { [incomeGain.resource]: incomeGain.amount }, cardLibrary[permanentId]?.name ?? "income artifact");
      }
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
  }

  if (astrologers) {
    astrologers.nextResourceModifiers = { gold: 0, valuables: 0 };
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

  // The start-of-turn hand step is offered on EVERY turn, including the first:
  // the player MAY discard any number of cards and then draw back up to the
  // hand limit ("draw new" = discard nothing; "discard and draw new" = toss
  // some first). The hand is NEVER drawn automatically, so the player can never
  // both keep a fresh full hand AND swap on top of it — it is one either/or
  // choice. Only an over-the-limit hand (from card effects) forces a discard
  // before acting.
  const limit = effectiveHandLimit(state, playerId);
  player.needsHandRefresh = player.hand.length > limit;
  player.canMulligan = true;
  // Army map abilities reset for the new turn (Nomads' step, Rogues' scout).
  player.nomadStepDoneThisTurn = false;
  player.rogueScoutUsedThisTurn = false;

  // "Resolve any 'at the beginning of your turn' abilities after drawing":
  // Necromancy Amplifier, Portal of Summoning, Mana Vortex.
  queueTurnStartBuildingChoices(state, playerId);
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
        const options: { label: string; steps: VisitStep[] }[] = [
          { label: "Search the Ability deck for a Necromancy card", steps: [{ type: "NECROMANCY_FETCH" }] }
        ];
        if (hasSpecialtyInDiscard) {
          options.push({
            label: "Take 1 Specialty card from your discard pile",
            steps: [{ type: "DISCARD_PICK", count: 1, filter: "specialty" }]
          });
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

  // Friendly Beaver drawn on the first Astrologers round: discard it and
  // draw another card (its printed exception).
  if (cardId === "astrologers.friendly_beaver" && state.round === 2) {
    state.decks[ASTROLOGERS_DECK_ID]?.discardPile.push(cardId);
    cardId = popAstrologersCard(state);
  }

  if (!cardId) {
    return;
  }

  const card = astrologersCardDefinitions[cardId];
  astrologers.activeCardId = cardId;
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
    case "FIRST_SPELL_RETURNS":
    case "NEUTRAL_DRAW_SWAP":
      // Passive while the card stays face up.
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
        reshuffleArtifactsAndSpells(state, playerId);
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
  }
}

/** Annoying Lizard: spells and artifacts shuffle back, redraw as many. */
function reshuffleArtifactsAndSpells(state: GameState, playerId: PlayerId): void {
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
  drawCardsForPlayer(state, playerId, moved.length);
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
    packs[0].side = "few";
    appendEvent(state, {
      type: "ARMY_UNIT_FLIPPED",
      playerId,
      unitDefId: packs[0].unitDefId,
      reason: "Terrible Plague"
    });
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
          label: `Flip ${coreUnitDefinitions[unit.unitDefId]?.name ?? unit.unitDefId}`,
          steps: [{ type: "FLIP_PACK_TO_FEW", armyUnitId: unit.id }]
        }))
      }
    ]
  });
}

function queueHalfCostReinforce(state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  if (!player) {
    return;
  }

  const options: { label: string; steps: VisitStep[] }[] = [];
  for (const unit of player.army) {
    if (unit.side !== "few") {
      continue;
    }

    const packSide = getUnitSide(unit.unitDefId, "pack");
    if (!packSide) {
      continue;
    }

    const halfCost: ResourceCost = {};
    for (const [resource, amount] of Object.entries(packSide.cost) as [ResourceKind, number][]) {
      halfCost[resource] = Math.ceil(amount / 2);
    }
    if (!hasResources(player, halfCost)) {
      continue;
    }

    const costLabel = Object.entries(halfCost)
      .map(([resource, amount]) => `${amount} ${resource}`)
      .join(" + ");
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
 * Freelancer's Guild: "When Reinforcing or Recruiting you can use building
 * materials and valuables like gold." Returns how much of a gold shortfall
 * the player may cover with spare materials/valuables (0 without the guild).
 */
function freelancerGoldSubstitution(state: GameState, playerId: PlayerId, cost: ResourceCost): {
  fromMaterials: number;
  fromValuables: number;
} {
  const player = state.players[playerId];
  const town = getTownOfPlayer(state, playerId);
  const hasGuild = Boolean(
    town?.buildings.some((buildingId) => coreBuildingDefinitions[buildingId]?.effect?.type === "FREELANCERS_GUILD")
  );
  if (!player || !hasGuild) {
    return { fromMaterials: 0, fromValuables: 0 };
  }

  const shortfall = Math.max(0, (cost.gold ?? 0) - player.resources.gold);
  if (shortfall === 0) {
    return { fromMaterials: 0, fromValuables: 0 };
  }

  const spareMaterials = Math.max(0, player.resources.buildingMaterials - (cost.buildingMaterials ?? 0));
  const fromMaterials = Math.min(shortfall, spareMaterials);
  const spareValuables = Math.max(0, player.resources.valuables - (cost.valuables ?? 0));
  const fromValuables = Math.min(shortfall - fromMaterials, spareValuables);
  return { fromMaterials, fromValuables };
}

/** A recruit/reinforce cost with the guild's gold substitution folded in. */
function recruitCostWithSubstitution(state: GameState, playerId: PlayerId, cost: ResourceCost): ResourceCost {
  const substitution = freelancerGoldSubstitution(state, playerId, cost);
  if (substitution.fromMaterials === 0 && substitution.fromValuables === 0) {
    return cost;
  }
  return {
    gold: Math.max(0, (cost.gold ?? 0) - substitution.fromMaterials - substitution.fromValuables),
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
 * Total one-shot gold discount a player currently holds on Recruitment and
 * Reinforcement, from the Legion artifacts (Legs/Loins/Torso/Arms/Head of
 * Legion). Each artifact's discount side creates a current-turn RECRUIT_DISCOUNT
 * active effect; the amounts pool together so a player who played more than one
 * piece this turn gets their sum. Pure read — the discount is only spent once a
 * recruit/reinforce actually uses it (see consumeRecruitDiscount).
 */
export function recruitDiscountAmount(state: GameState, playerId: PlayerId): number {
  return state.activeEffects.reduce((total, effect) => {
    if (effect.controllerId !== playerId) {
      return total;
    }
    return (
      total +
      effect.modifiers.reduce(
        (sum, modifier) => (modifier.type === "RECRUIT_DISCOUNT" ? sum + modifier.amount : sum),
        0
      )
    );
  }, 0);
}

/**
 * Applies the player's pooled Legion discount to a Recruitment/Reinforcement
 * cost: the gold component drops by the discount "to a minimum of 0"; other
 * resources are untouched (the artifacts only ever knock off gold). Read-only —
 * returns the same cost object when nothing applies and never spends the
 * discount, so it is safe to call from affordability checks and the UI.
 */
export function applyRecruitDiscount(state: GameState, playerId: PlayerId, cost: ResourceCost): ResourceCost {
  const discount = recruitDiscountAmount(state, playerId);
  const gold = cost.gold ?? 0;
  if (discount <= 0 || gold <= 0) {
    return cost;
  }
  return { ...cost, gold: Math.max(0, gold - discount) };
}

/**
 * Spends the player's Legion discounts after a Recruitment/Reinforcement that
 * used them: removes every RECRUIT_DISCOUNT effect they hold (each is a
 * single-purpose, single-modifier effect created by a Legion artifact). The
 * Population token allows only one recruit/reinforce action per turn and these
 * discounts last only the current turn, so this is the single window in which
 * they are spent. No-op when none are held.
 */
export function consumeRecruitDiscount(state: GameState, playerId: PlayerId): void {
  state.activeEffects = state.activeEffects.filter(
    (effect) =>
      !(
        effect.controllerId === playerId &&
        effect.modifiers.some((modifier) => modifier.type === "RECRUIT_DISCOUNT")
      )
  );
}

/**
 * Flips a Few army card to its Pack side, paying its (half) cost. Half-gold
 * effects round up by default (Saplings, settlements); Necromancy rounds
 * down ("half the gold cost, rounded down"). A `free` flip (Skeletons reward)
 * spends nothing.
 */
export function reinforceArmyUnit(
  state: GameState,
  playerId: PlayerId,
  armyUnitId: string,
  halfCost: boolean,
  halfGoldOnly = false,
  roundDown = false,
  /** Neutral Skeletons reward: a free Few→Pack flip (no resources spent). */
  free = false
): void {
  const player = state.players[playerId];
  const armyUnit = player?.army.find((candidate) => candidate.id === armyUnitId);
  if (!player || !armyUnit || armyUnit.side !== "few") {
    return;
  }

  const packSide = getUnitSide(armyUnit.unitDefId, "pack");
  if (!packSide) {
    return;
  }

  const half = (amount: number) => (roundDown ? Math.floor(amount / 2) : Math.ceil(amount / 2));
  const cost: ResourceCost = {};
  if (!free) {
    for (const [resource, amount] of Object.entries(packSide.cost) as [ResourceKind, number][]) {
      const halved = halfCost || (halfGoldOnly && resource === "gold");
      cost[resource] = halved ? half(amount) : amount;
    }
  }
  const finalCost = free ? {} : discountedReinforceCost(state, playerId, armyUnit.unitDefId, cost);
  if (!hasRecruitResources(state, playerId, finalCost)) {
    return;
  }

  spendRecruitResources(
    state,
    playerId,
    finalCost,
    free ? "free reinforcement" : halfCost || halfGoldOnly ? "half-cost reinforcement" : "reinforcement"
  );
  armyUnit.side = "pack";
  appendEvent(state, {
    type: "UNIT_RECRUITED",
    playerId,
    unitDefId: armyUnit.unitDefId,
    kind: "reinforce",
    cost: finalCost
  });
}

/**
 * Neutral Skeletons: "After defeating Skeletons, if you control a Necropolis
 * Hero, Reinforce 1 of your bronze units for free." Queues a post-combat
 * choice over the player's Few bronze units (a free Few→Pack flip), skippable.
 * No-op when the player has no eligible bronze Few unit.
 */
export function queueSkeletonReinforce(state: GameState, playerId: PlayerId): void {
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
        prompt: "Skeletons defeated: reinforce a bronze unit for free.",
        options
      }
    ]
  });
}

/**
 * Necromancy: "Reinforce a bronze or silver unit (expert: any unit) for half
 * the gold cost (rounded down)." Queues a unit-choice prompt over the
 * player's Few units of the allowed tiers — no Citadel, Dwelling or
 * Population token needed.
 */
export function queueNecromancyReinforce(state: GameState, playerId: PlayerId, mode: "basic" | "expert"): void {
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

    const cost: ResourceCost = { ...packSide.cost };
    cost.gold = Math.floor((cost.gold ?? 0) / 2);
    if (!hasRecruitResources(state, playerId, cost)) {
      continue;
    }

    const costLabel =
      Object.entries(cost)
        .filter(([, amount]) => amount)
        .map(([resource, amount]) => `${amount} ${resource}`)
        .join(" + ") || "free";
    options.push({
      label: `Reinforce ${def.name} (${costLabel})`,
      steps: [{ type: "REINFORCE_HALF_GOLD", armyUnitId: unit.id, roundDown: true }]
    });
  }

  if (options.length === 0) {
    adventure.rewardQueue.push({
      playerId,
      kind: "visit-steps",
      steps: [
        {
          type: "CHOOSE_ONE",
          prompt: "Necromancy: no Few bronze/silver unit you can afford to reinforce.",
          options: [{ label: "OK", steps: [] }]
        }
      ]
    });
    return;
  }

  options.push({ label: "Skip", steps: [] });
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
    if (cardLibrary[cardId]?.name === "Necromancy") {
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

export { TRADE_RATES };

import { cardLibrary } from "@/data/cards/library";
import { coreBuildingDefinitions, coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { locationDefinitions, TRADE_RATES } from "@/data/map/locations";
import { allTileDefinitions } from "@/data/map/tiles";
import {
  addArmyUnit,
  beginFieldVisit,
  canCrossEdge,
  canPlaceTileAt,
  changeMorale,
  classifyHeroStep,
  drawNeutralArmy,
  effectiveHandLimit,
  gainExperience,
  gainResources,
  getActiveAstrologersCard,
  getAdjacentSpaceIds,
  getMainHero,
  getTileFootprintSpaceIds,
  getTownOfPlayer,
  getUnitSide,
  hasResources,
  heroAtSpace,
  instantiateTile,
  isFieldGuarded,
  makeCombatUnitFromArmy,
  makeCombatUnitFromNeutral,
  materializeTileFields,
  NEUTRAL_DECK_IDS,
  placeNeutralUnits,
  processPendingVisit,
  restoreStartingArmyIfEmpty,
  SCHOLAR_STAT_CARDS,
  spendResources,
  startAdventureRound,
  startPlayerTurn,
  swapNeutralDraw,
  townHasBuildingEffect,
  unlockedRecruitTiers,
  type NeutralDraw
} from "./adventure";
import { ATTACK_DIE_FACES } from "./battlefield";
import { drawCardsForPlayer, shuffleCards } from "./decks";
import { appendEvent } from "./events";
import {
  activeSchoolFetches,
  applySearchCountEffects,
  deckDisplayName,
  eligibleArtifactDecks,
  eligibleSpellDecks,
  expertUsesAvailable,
  getRuleset,
  isSpellDeck,
  takeSearchRepeatEffect,
  wisdomGoldDiscount,
  wisdomSearchCount
} from "./ruleset";
import { hexDistance, hexNeighbor, hexSpaceId, slotDirection, tileFootprint } from "./hex";
import type {
  CombatState,
  GameAction,
  GameState,
  HeroState,
  MapFieldState,
  MapSpaceId,
  MapTileState,
  PlayerId,
  ResourceCost,
  VisitStep
} from "./state";
import { NEUTRAL_PLAYER_ID } from "./state";

/** Attacker rows on the 4x5 board (bottom from the attacker's seat). */
export const ATTACKER_FRONTLINE = [12, 13, 14, 15];
export const ATTACKER_BACKLINE = [16, 17, 18, 19];
export const DEFENDER_FRONTLINE = [4, 5, 6, 7];
export const DEFENDER_BACKLINE = [0, 1, 2, 3];
export const COMBAT_UNIT_LIMIT = 5;

function requireAdventure(state: GameState) {
  if (!state.adventure) {
    throw new Error("This action needs an adventure game.");
  }

  return state.adventure;
}

function requireHero(state: GameState, playerId: PlayerId, heroId: string): HeroState {
  const hero = state.heroes[heroId];
  if (!hero || hero.controllerId !== playerId) {
    throw new Error("That hero cannot act for this player.");
  }

  return hero;
}

function assertNoPendingInput(state: GameState): void {
  if (state.combat) {
    throw new Error("Finish the current combat first.");
  }

  if (state.pendingChoice || state.reactionWindow || state.adventure?.pendingVisit) {
    throw new Error("Resolve the pending choice first.");
  }

  if (state.adventure?.pendingTileChoice) {
    throw new Error("Confirm the rotation of the new tile first.");
  }
}

function assertActiveTurn(state: GameState, playerId: PlayerId): void {
  if (state.activePlayerId !== playerId) {
    throw new Error("It is not that player's turn.");
  }
}

function assertHandRefreshed(state: GameState, playerId: PlayerId): void {
  if (state.players[playerId]?.needsHandRefresh) {
    throw new Error("Discard down to your hand limit before acting.");
  }
}

/** The start-of-turn mulligan closes the moment the player really acts. */
function closeMulliganWindow(state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  if (player?.canMulligan) {
    player.canMulligan = false;
  }
}

// ---------------------------------------------------------------------------
// Hand refresh (start-of-turn discard/redraw)
// ---------------------------------------------------------------------------

/**
 * Discards the listed cards and draws that many back (never past the hand
 * limit). Used both for the forced discard-down when over the limit and for
 * the optional start-of-turn mulligan.
 */
export function refreshHand(state: GameState, action: Extract<GameAction, { type: "REFRESH_HAND" }>): void {
  const player = state.players[action.playerId];
  if (!player) {
    throw new Error("Unknown player.");
  }

  assertActiveTurn(state, action.playerId);

  if (!player.needsHandRefresh && !player.canMulligan) {
    throw new Error("Cards can only be redrawn at the start of your turn (or by spending morale).");
  }

  const handCounts = new Map<string, number>();
  for (const cardId of player.hand) {
    handCounts.set(cardId, (handCounts.get(cardId) ?? 0) + 1);
  }

  for (const cardId of action.discardCardIds) {
    const left = handCounts.get(cardId) ?? 0;
    if (left <= 0) {
      throw new Error("Cannot discard a card that is not in hand.");
    }
    handCounts.set(cardId, left - 1);
  }

  for (const cardId of action.discardCardIds) {
    const index = player.hand.indexOf(cardId);
    player.hand.splice(index, 1);
    player.discard.push(cardId);
  }

  const limit = effectiveHandLimit(state, action.playerId);
  if (player.hand.length > limit) {
    throw new Error(`Discard down to your hand limit of ${limit} first.`);
  }

  // One mulligan per turn: pick any number of cards, discard them together,
  // draw that many — then the window closes for the rest of the turn.
  const toDraw = Math.min(action.discardCardIds.length, Math.max(0, limit - player.hand.length));
  const drawn = toDraw > 0 ? drawCardsForPlayer(state, action.playerId, toDraw) : 0;
  player.needsHandRefresh = false;
  player.canMulligan = false;

  appendEvent(state, {
    type: "HAND_REFRESHED",
    playerId: action.playerId,
    discarded: action.discardCardIds.length,
    drawn
  });
}

// ---------------------------------------------------------------------------
// Map movement
// ---------------------------------------------------------------------------

export function getHeroMoveDestinations(state: GameState, hero: HeroState): MapSpaceId[] {
  const adventure = state.adventure;
  if (!adventure || !hero.spaceId || hero.movementPoints <= 0) {
    return [];
  }

  return getAdjacentSpaceIds(hero.spaceId).filter((spaceId) => {
    if (!canCrossEdge(state, hero.spaceId as MapSpaceId, spaceId)) {
      return false;
    }

    const occupant = heroAtSpace(state, spaceId, hero.id);
    if (occupant) {
      if (occupant.controllerId === hero.controllerId) {
        return false;
      }

      // Heroes inside a Sanctuary cannot be attacked.
      const field = adventure.fields[spaceId];
      if (field && locationDefinitions[field.location]?.passive?.protectsFromAttack) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Executes one paid step onto an adjacent field and resolves what lives
 * there: enemy heroes start a combat, guards start a neutral encounter,
 * everything else is visited. `passThrough` steps (crossing an allied hero)
 * move without visiting, as the rulebook prescribes.
 */
function performHeroStep(state: GameState, hero: HeroState, to: MapSpaceId, passThrough: boolean): void {
  const adventure = requireAdventure(state);
  const from = hero.spaceId ?? to;
  hero.spaceId = to;
  hero.movementPoints -= 1;

  appendEvent(state, {
    type: "HERO_MOVED",
    playerId: hero.controllerId,
    heroId: hero.id,
    from,
    to,
    movementLeft: hero.movementPoints
  });

  if (passThrough) {
    return;
  }

  const enemyHero = heroAtSpace(state, to, hero.id);
  if (enemyHero && enemyHero.controllerId !== hero.controllerId) {
    startPlayerCombat(state, hero, enemyHero, to);
    return;
  }

  const field = adventure.fields[to];
  if (!field) {
    return;
  }

  if (isFieldGuarded(field) && field.flagOwnerId !== hero.controllerId) {
    startNeutralEncounter(state, hero, field);
    return;
  }

  beginFieldVisit(state, hero.id, to, false);
}

/** Whether the walk must pause for player input after a step resolved. */
function heroStepNeedsInput(state: GameState): boolean {
  const adventure = state.adventure;
  return Boolean(
    state.combat ||
      state.pendingChoice ||
      state.reactionWindow ||
      adventure?.pendingVisit ||
      adventure?.pendingTileChoice ||
      (adventure?.rewardQueue.length ?? 0) > 0 ||
      state.phase === "game-over"
  );
}

export function moveHeroAdventure(state: GameState, action: Extract<GameAction, { type: "MOVE_HERO" }>): void {
  requireAdventure(state);
  assertActiveTurn(state, action.playerId);
  assertHandRefreshed(state, action.playerId);
  assertNoPendingInput(state);

  const hero = requireHero(state, action.playerId, action.heroId);
  if (!hero.spaceId) {
    throw new Error("That hero is not on the map.");
  }

  if (hero.movementPoints <= 0) {
    throw new Error("That hero has no movement points left.");
  }

  if (!getHeroMoveDestinations(state, hero).includes(action.to)) {
    throw new Error("Heroes can only move to adjacent, passable fields.");
  }

  closeMulliganWindow(state, action.playerId);
  performHeroStep(state, hero, action.to, false);
}

/**
 * Click-to-move: walks the hero field by field along the requested path.
 * Every step costs 1 MP and resolves its field; the walk stops early when a
 * combat or choice opens, or movement points run out. Allied heroes may be
 * crossed mid-path but the walk cannot end on them.
 */
export function moveHeroPathAdventure(state: GameState, action: Extract<GameAction, { type: "MOVE_HERO_PATH" }>): void {
  requireAdventure(state);
  assertActiveTurn(state, action.playerId);
  assertHandRefreshed(state, action.playerId);
  assertNoPendingInput(state);

  const hero = requireHero(state, action.playerId, action.heroId);
  if (!hero.spaceId) {
    throw new Error("That hero is not on the map.");
  }

  if (action.path.length === 0) {
    throw new Error("The movement path is empty.");
  }

  if (hero.movementPoints <= 0) {
    throw new Error("That hero has no movement points left.");
  }

  // Validate the whole path before moving: consecutive, crossable, and only
  // the final field may stop the hero.
  let cursor = hero.spaceId;
  for (const [index, step] of action.path.entries()) {
    if (!getAdjacentSpaceIds(cursor).includes(step)) {
      throw new Error("Each path step must be adjacent to the previous field.");
    }
    if (!canCrossEdge(state, cursor, step)) {
      throw new Error("The path crosses a sealed tile border or a blocked field.");
    }

    const kind = classifyHeroStep(state, hero, step);
    const isLast = index === action.path.length - 1;
    if (kind === "block") {
      throw new Error("The path crosses an impassable field.");
    }
    if (kind === "stop" && !isLast) {
      throw new Error("A field along the path would stop the hero; walk there first.");
    }
    if (kind === "pass-only" && isLast) {
      throw new Error("The walk cannot end on an allied hero.");
    }
    cursor = step;
  }

  closeMulliganWindow(state, action.playerId);

  for (const step of action.path) {
    if (hero.movementPoints <= 0) {
      break;
    }

    const passThrough = classifyHeroStep(state, hero, step) === "pass-only";
    performHeroStep(state, hero, step, passThrough);

    if (heroStepNeedsInput(state)) {
      break;
    }
  }
}

export function revisitField(state: GameState, action: Extract<GameAction, { type: "REVISIT_FIELD" }>): void {
  const adventure = requireAdventure(state);
  assertActiveTurn(state, action.playerId);
  assertHandRefreshed(state, action.playerId);
  assertNoPendingInput(state);

  const hero = requireHero(state, action.playerId, action.heroId);
  const field = hero.spaceId ? adventure.fields[hero.spaceId] : undefined;
  if (!hero.spaceId || !field) {
    throw new Error("That hero is not on a field.");
  }

  if (hero.movementPoints <= 0) {
    throw new Error("Revisiting costs 1 movement point.");
  }

  if (locationDefinitions[field.location]?.category !== "revisitable") {
    throw new Error("Only revisitable fields can be visited again.");
  }

  closeMulliganWindow(state, action.playerId);
  hero.movementPoints -= 1;
  beginFieldVisit(state, hero.id, hero.spaceId, true);
}

export function discoverTile(state: GameState, action: Extract<GameAction, { type: "DISCOVER_TILE" }>): void {
  requireAdventure(state);
  assertActiveTurn(state, action.playerId);
  assertHandRefreshed(state, action.playerId);
  assertNoPendingInput(state);

  const hero = requireHero(state, action.playerId, action.heroId);
  if (hero.movementPoints <= 0) {
    throw new Error("Discovering a tile costs 1 movement point.");
  }

  closeMulliganWindow(state, action.playerId);
  hero.movementPoints -= 1;
  revealTileForHero(state, action.playerId, hero, action.tileInstanceId);
}

export function revealTileForHero(
  state: GameState,
  playerId: PlayerId,
  hero: HeroState,
  tileInstanceId: string
): void {
  const adventure = requireAdventure(state);
  const tile = adventure.tiles[tileInstanceId];
  if (!tile || !tile.faceDown) {
    throw new Error("That tile cannot be discovered.");
  }

  if (!hero.spaceId || !isTileAdjacentToSpace(state, tileInstanceId, hero.spaceId)) {
    throw new Error("Heroes can only discover tiles next to them.");
  }

  beginTileRotation(state, playerId, tile, "reveal");
}

/**
 * Flips a tile face up and hands the rotation choice to the player ("You may
 * always rotate Map Tiles when placing or revealing them"). Fields only
 * materialize once SET_TILE_ROTATION confirms the orientation.
 */
function beginTileRotation(state: GameState, playerId: PlayerId, tile: MapTileState, kind: "reveal" | "place"): void {
  const adventure = requireAdventure(state);
  tile.faceDown = false;
  tile.awaitingRotation = true;
  adventure.pendingTileChoice = { tileInstanceId: tile.id, playerId, kind };

  if (kind === "reveal") {
    appendEvent(state, {
      type: "TILE_REVEALED",
      playerId,
      tileInstanceId: tile.id,
      tileDefId: tile.tileDefId
    });
  } else {
    appendEvent(state, {
      type: "TILE_PLACED",
      playerId,
      tileInstanceId: tile.id,
      tileDefId: tile.tileDefId,
      centerRow: tile.centerRow,
      centerCol: tile.centerCol,
      rotation: tile.rotation
    });
  }
}

/**
 * Whether `rotation` leaves at least one crossable doorway between the tile
 * and the already-materialized fields around it — the practical reading of
 * "New Tiles must be positioned so that there is a valid path that
 * eventually connects them with all other Tiles" for border-lined tiles.
 */
export function isTileRotationConnected(state: GameState, tile: MapTileState, rotation: number): boolean {
  const adventure = state.adventure;
  const def = allTileDefinitions[tile.tileDefId];
  if (!adventure || !def) {
    return true;
  }

  const center = { row: tile.centerRow, col: tile.centerCol };
  const footprint = tileFootprint(center, rotation);
  const footprintIds = new Set(footprint.map(hexSpaceId));

  for (let slot = 1; slot < footprint.length; slot += 1) {
    const fieldDef = def.fields[slot];
    if (!fieldDef || locationDefinitions[fieldDef.location]?.category === "blocked") {
      continue;
    }

    // The slot's own outer border must be open…
    if (def.outerImpassable[slot - 1]) {
      continue;
    }

    // …and at least one neighbouring hex outside the tile must be an open,
    // already-revealed field whose own border is not sealed either.
    const cell = footprint[slot];
    for (let direction = 0; direction < 6; direction += 1) {
      const neighborId = hexSpaceId(hexNeighbor(cell, direction));
      if (footprintIds.has(neighborId)) {
        continue;
      }

      const neighborField = adventure.fields[neighborId];
      if (!neighborField) {
        continue;
      }
      if (locationDefinitions[neighborField.location]?.category === "blocked") {
        continue;
      }
      if (isNeighborOuterEdgeSealed(adventure, neighborField)) {
        continue;
      }

      return true;
    }
  }

  return false;
}

function isNeighborOuterEdgeSealed(state: NonNullable<GameState["adventure"]>, field: MapFieldState): boolean {
  if (field.slot === 0) {
    return false;
  }

  const tile = state.tiles[field.tileInstanceId];
  const def = tile ? allTileDefinitions[tile.tileDefId] : undefined;
  if (!tile || !def) {
    return false;
  }

  const direction = slotDirection(field.slot, 0);
  return direction === null ? false : Boolean(def.outerImpassable[direction]);
}

/** Confirms the rotation of a freshly revealed or placed tile. */
export function setTileRotation(state: GameState, action: Extract<GameAction, { type: "SET_TILE_ROTATION" }>): void {
  const adventure = requireAdventure(state);
  const pending = adventure.pendingTileChoice;
  if (!pending || pending.playerId !== action.playerId || pending.tileInstanceId !== action.tileInstanceId) {
    throw new Error("There is no tile rotation to confirm for that player.");
  }

  const tile = adventure.tiles[action.tileInstanceId];
  if (!tile) {
    throw new Error("That tile no longer exists.");
  }

  const rotation = ((action.rotation % 6) + 6) % 6;
  const anyConnected = [0, 1, 2, 3, 4, 5].some((candidate) => isTileRotationConnected(state, tile, candidate));
  if (anyConnected && !isTileRotationConnected(state, tile, rotation)) {
    throw new Error("Rotate the tile so a path connects it to the rest of the map (border lines cannot seal it off).");
  }

  tile.rotation = rotation;
  tile.awaitingRotation = false;
  adventure.pendingTileChoice = null;
  materializeTileFields(adventure, tile);

  appendEvent(state, {
    type: "TILE_ROTATION_SET",
    playerId: action.playerId,
    tileInstanceId: tile.id,
    tileDefId: tile.tileDefId,
    rotation
  });
}

export function isTileAdjacentToSpace(state: GameState, tileInstanceId: string, spaceId: MapSpaceId): boolean {
  const adventure = state.adventure;
  const tile = adventure?.tiles[tileInstanceId];
  if (!adventure || !tile) {
    return false;
  }

  const footprint = new Set(getTileFootprintSpaceIds(tile));
  return getAdjacentSpaceIds(spaceId).some((neighbor) => footprint.has(neighbor));
}

export function placeTile(state: GameState, action: Extract<GameAction, { type: "PLACE_TILE" }>): void {
  const adventure = requireAdventure(state);
  assertActiveTurn(state, action.playerId);
  assertHandRefreshed(state, action.playerId);
  assertNoPendingInput(state);

  const hero = requireHero(state, action.playerId, action.heroId);
  if (hero.movementPoints <= 0) {
    throw new Error("Placing a tile costs 1 movement point.");
  }

  const supply = adventure.playerFarTiles[action.playerId] ?? [];
  const tileDefId = supply[action.supplyIndex];
  if (!tileDefId) {
    throw new Error("That Far tile is not in your supply.");
  }

  const center = { row: action.centerRow, col: action.centerCol };
  if (!canPlaceTileAt(state, hero, center, 0)) {
    throw new Error(
      "New tiles must touch at least two existing tiles, sit next to your hero, and must not overlap."
    );
  }

  closeMulliganWindow(state, action.playerId);
  supply.splice(action.supplyIndex, 1);
  hero.movementPoints -= 1;
  const tile = instantiateTile(adventure, tileDefId, center, 0, false, { materialize: false });
  beginTileRotation(state, action.playerId, tile, "place");
}

// ---------------------------------------------------------------------------
// Visit step resolution
// ---------------------------------------------------------------------------

export function resolveVisitStep(state: GameState, action: Extract<GameAction, { type: "RESOLVE_VISIT_STEP" }>): void {
  const adventure = requireAdventure(state);
  const visit = adventure.pendingVisit;
  if (!visit || visit.playerId !== action.playerId) {
    throw new Error("There is no pending field visit for that player.");
  }

  if (state.pendingChoice) {
    throw new Error("Resolve the pending card choice first.");
  }

  const step = visit.steps[0];
  if (!step) {
    adventure.pendingVisit = null;
    return;
  }

  switch (step.type) {
    case "CHOOSE_ONE": {
      const option = action.optionIndex !== undefined ? step.options[action.optionIndex] : undefined;
      if (!option) {
        throw new Error("Choose one of the printed options.");
      }
      visit.steps.shift();
      visit.steps.unshift(...option.steps);
      // Scholar's +1 result grants a Statistic card of the player's choice.
      if (option.steps.length === 0 && step.prompt.startsWith("Scholar")) {
        const cardId = SCHOLAR_STAT_CARDS[action.optionIndex ?? 0];
        if (cardId) {
          state.players[action.playerId]?.hand.push(cardId);
        }
      }
      break;
    }
    case "PAY_TO": {
      visit.steps.shift();
      if (action.decline) {
        break;
      }
      const cost = action.optionIndex !== undefined ? step.costOptions[action.optionIndex] : undefined;
      const player = state.players[action.playerId];
      if (!cost || !player) {
        throw new Error("Choose which cost to pay or decline.");
      }
      if (!hasResources(player, cost)) {
        throw new Error("Not enough resources for that option.");
      }
      spendResources(state, action.playerId, cost, "field effect");
      visit.steps.unshift(...step.steps);
      break;
    }
    case "SETTLEMENT_CHOICE": {
      resolveSettlementChoice(state, action, visit.fieldId);
      visit.steps.shift();
      break;
    }
    case "WITCH_HUT": {
      resolveWitchHut(state, action);
      visit.steps.shift();
      break;
    }
    case "MAGIC_SPRING": {
      resolveMagicSpring(state, action);
      visit.steps.shift();
      break;
    }
    case "TRADING_POST": {
      // Trades happen through TRADE_RESOURCES. Picking a hand card here
      // resolves the rulebook's second option - "remove one card and gain
      // 1 valuables" - and ends the visit either way.
      if (!action.decline && action.optionIndex !== undefined) {
        const player = state.players[action.playerId];
        const cardId = player?.hand[action.optionIndex];
        if (!player || !cardId) {
          throw new Error("Choose a hand card to remove.");
        }
        player.hand.splice(action.optionIndex, 1);
        player.removed.push(cardId);
        gainResources(state, action.playerId, { valuables: 1 }, "removed a card at the Trading Post");
      }
      visit.steps.shift();
      break;
    }
    case "REMOVE_HAND_CARD": {
      const followUp = resolveRemoveHandCard(state, action, step);
      visit.steps.shift();
      if (followUp) {
        visit.steps.unshift(followUp);
      }
      break;
    }
    case "SEARCH_DISCARD": {
      if (!action.decline) {
        const deck = state.decks[step.deckId];
        const player = state.players[action.playerId];
        const topCards = deck ? deck.discardPile.slice(-step.count) : [];
        // optionIndex counts from the top of the pile (0 = newest discard).
        const picked = topCards[topCards.length - 1 - (action.optionIndex ?? 0)];
        if (!deck || !player || !picked) {
          throw new Error("Choose one of the revealed discard cards.");
        }
        deck.discardPile.splice(deck.discardPile.lastIndexOf(picked), 1);
        player.hand.push(picked);
      }
      visit.steps.shift();
      break;
    }
    case "HILL_FORT": {
      if (!action.decline) {
        resolveHillFort(state, action);
      }
      visit.steps.shift();
      break;
    }
    case "DISCOVER_ADJACENT_TILE": {
      visit.steps.shift();
      if (!action.decline) {
        resolveObservatoryDiscover(state, action, visit.heroId, visit.fieldId);
      }
      break;
    }
    default:
      throw new Error("That visit step resolves automatically.");
  }

  processPendingVisit(state);
}

function resolveSettlementChoice(
  state: GameState,
  action: Extract<GameAction, { type: "RESOLVE_VISIT_STEP" }>,
  fieldId: MapSpaceId
): void {
  const adventure = requireAdventure(state);
  const field = adventure.fields[fieldId];
  const player = state.players[action.playerId];
  if (!field || !player) {
    throw new Error("That settlement cannot be flagged.");
  }

  const resourceByIndex: ("gold" | "buildingMaterials" | "valuables")[] = ["gold", "buildingMaterials", "valuables"];

  const previousOwnerId = field.flagOwnerId;
  if (action.optionIndex !== undefined && action.optionIndex <= 2) {
    const resource = resourceByIndex[action.optionIndex];
    applySettlementFlag(state, action.playerId, field, resource, previousOwnerId);
    return;
  }

  // Option 3+: reinforce a bronze/silver few unit at half cost (free if first flag).
  const armyIndex = (action.optionIndex ?? 3) - 3;
  const fewUnits = player.army.filter((unit) => {
    if (unit.side !== "few" || !getUnitSide(unit.unitDefId, "pack")) {
      return false;
    }

    const tier = coreUnitDefinitions[unit.unitDefId]?.tier;
    return tier === "bronze" || tier === "silver";
  });
  const target = fewUnits[armyIndex];
  if (!target) {
    throw new Error("Choose a few unit to reinforce or a resource income.");
  }

  const packSide = getUnitSide(target.unitDefId, "pack");
  if (!packSide) {
    throw new Error("That unit has no pack side.");
  }

  const free = !field.everFlagged;
  const cost: ResourceCost = {};
  if (!free) {
    for (const [resource, amount] of Object.entries(packSide.cost) as ["gold" | "buildingMaterials" | "valuables", number][]) {
      cost[resource] = Math.ceil(amount / 2);
    }
    if (!hasResources(player, cost)) {
      throw new Error("Not enough resources to reinforce at half cost.");
    }
    spendResources(state, action.playerId, cost, "settlement reinforcement");
  }

  target.side = "pack";
  field.everFlagged = true;
  applySettlementFlag(state, action.playerId, field, null, previousOwnerId);

  appendEvent(state, {
    type: "UNIT_RECRUITED",
    playerId: action.playerId,
    unitDefId: target.unitDefId,
    kind: "reinforce",
    cost
  });
}

function applySettlementFlag(
  state: GameState,
  playerId: PlayerId,
  field: MapFieldState,
  resource: "gold" | "buildingMaterials" | "valuables" | null,
  previousOwnerId: PlayerId | null
): void {
  if (previousOwnerId && previousOwnerId !== playerId && field.settlementResource) {
    const previous = state.players[previousOwnerId];
    if (previous) {
      previous.production[field.settlementResource] = Math.max(
        0,
        previous.production[field.settlementResource] - 1
      );
      appendEvent(state, {
        type: "PRODUCTION_CHANGED",
        playerId: previousOwnerId,
        resource: field.settlementResource,
        amount: -1
      });
    }
    field.settlementResource = null;
  }

  field.flagOwnerId = playerId;
  appendEvent(state, {
    type: "FIELD_FLAGGED",
    playerId,
    fieldId: field.spaceId,
    location: field.location,
    previousOwnerId
  });

  if (resource) {
    field.settlementResource = resource;
    const player = state.players[playerId];
    if (player) {
      player.production[resource] += 1;
      appendEvent(state, { type: "PRODUCTION_CHANGED", playerId, resource, amount: 1 });
    }

    if (!field.everFlagged) {
      field.everFlagged = true;
      gainResources(state, playerId, { [resource]: 1 }, "first to flag the settlement");
    }
  }
}

function resolveWitchHut(state: GameState, action: Extract<GameAction, { type: "RESOLVE_VISIT_STEP" }>): void {
  const player = state.players[action.playerId];
  const deck = state.decks.abilities;
  if (!player || !deck) {
    throw new Error("The Witch Hut cannot resolve.");
  }

  if (action.decline) {
    return;
  }

  // Option 0: take the top Ability card into hand. Option 1: discard it.
  const top = deck.drawPile.pop();
  if (!top) {
    return;
  }

  if (action.optionIndex === 1) {
    deck.discardPile.push(top);
  } else {
    player.hand.push(top);
  }
}

/**
 * Hand cards a REMOVE_HAND_CARD step may remove. "removable" follows the
 * Faerie Ring / Market of Time exclusions: no Statistic, Starting Ability or
 * Specialty cards (and only cards that belong to a shared deck).
 */
export function removableHandCards(
  state: GameState,
  playerId: PlayerId,
  filter: "any" | "ability" | "statistic" | "removable"
): { index: number; cardId: string }[] {
  const player = state.players[playerId];
  if (!player) {
    return [];
  }
  const startingAbility = player.heroDefId
    ? coreHeroDefinitions[player.heroDefId]?.startingAbilityCardId
    : undefined;

  return player.hand
    .map((cardId, index) => ({ index, cardId }))
    .filter(({ cardId }) => {
      const kind = cardLibrary[cardId]?.kind;
      switch (filter) {
        case "any":
          return true;
        case "ability":
          return kind === "ability";
        case "statistic":
          return kind === "statistic";
        case "removable":
          return (
            (kind === "spell" || kind === "ability" || kind === "artifact") && cardId !== startingAbility
          );
      }
    });
}

/**
 * Removes the chosen hand card from the game and returns the follow-up step
 * the location promises (Trading Post valuables are handled inline; Faerie
 * Ring searches the removed card's deck; Market of Time lets the player pick
 * any shared deck).
 */
function resolveRemoveHandCard(
  state: GameState,
  action: Extract<GameAction, { type: "RESOLVE_VISIT_STEP" }>,
  step: Extract<VisitStep, { type: "REMOVE_HAND_CARD" }>
): VisitStep | null {
  if (action.decline) {
    return null;
  }

  const player = state.players[action.playerId];
  const eligible = removableHandCards(state, action.playerId, step.filter);
  const chosen = eligible.find(({ index }) => index === action.optionIndex);
  if (!player || !chosen) {
    throw new Error("Choose one of the removable cards.");
  }

  player.hand.splice(chosen.index, 1);
  player.removed.push(chosen.cardId);

  switch (step.then) {
    case "none":
      return null;
    case "gain-valuables":
      gainResources(state, action.playerId, { valuables: 1 }, "removed a card");
      return null;
    case "search-same-deck": {
      const kind = cardLibrary[chosen.cardId]?.kind;
      const deckId = kind === "spell" ? "spells" : kind === "artifact" ? "artifacts" : "abilities";
      return { type: "SEARCH_SHARED_DECK", deckId, count: 2 };
    }
    case "choose-deck-search":
      return {
        type: "CHOOSE_ONE",
        prompt: "Market of Time: search which deck?",
        options: [
          { label: "Search (2) the Ability deck", steps: [{ type: "SEARCH_SHARED_DECK", deckId: "abilities", count: 2 }] },
          { label: "Search (2) the Spell deck", steps: [{ type: "SEARCH_SHARED_DECK", deckId: "spells", count: 2 }] },
          { label: "Search (2) the Artifact deck", steps: [{ type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 2 }] }
        ]
      };
  }
}

/**
 * Hill Fort: reinforce one bronze/silver Few unit; the pack cost drops by
 * 3 gold in total, never below zero (gold absorbs the discount first).
 */
export function hillFortCost(packCost: Record<string, number | undefined>): ResourceCost {
  const cost: ResourceCost = {};
  for (const [resource, amount] of Object.entries(packCost) as ["gold" | "buildingMaterials" | "valuables", number][]) {
    if (amount) {
      cost[resource] = amount;
    }
  }
  let discount = 3;
  if (cost.gold) {
    const used = Math.min(cost.gold, discount);
    cost.gold -= used;
    discount -= used;
    if (cost.gold === 0) {
      delete cost.gold;
    }
  }
  return cost;
}

function resolveHillFort(state: GameState, action: Extract<GameAction, { type: "RESOLVE_VISIT_STEP" }>): void {
  const player = state.players[action.playerId];
  if (!player) {
    return;
  }

  const fewUnits = player.army.filter((unit) => {
    if (unit.side !== "few" || !getUnitSide(unit.unitDefId, "pack")) {
      return false;
    }
    const tier = coreUnitDefinitions[unit.unitDefId]?.tier;
    return tier === "bronze" || tier === "silver";
  });
  const target = fewUnits[action.optionIndex ?? 0];
  const packSide = target ? getUnitSide(target.unitDefId, "pack") : undefined;
  if (!target || !packSide) {
    throw new Error("Choose a Few unit to reinforce.");
  }

  const cost = hillFortCost(packSide.cost);
  if (!hasResources(player, cost)) {
    throw new Error("Not enough resources to reinforce here.");
  }
  spendResources(state, action.playerId, cost, "Hill Fort reinforcement");
  target.side = "pack";
  appendEvent(state, {
    type: "UNIT_RECRUITED",
    playerId: action.playerId,
    unitDefId: target.unitDefId,
    kind: "reinforce",
    cost
  });
}

function resolveMagicSpring(state: GameState, action: Extract<GameAction, { type: "RESOLVE_VISIT_STEP" }>): void {
  const player = state.players[action.playerId];
  if (!player) {
    return;
  }

  if (action.decline) {
    return;
  }

  const topThree = player.discard.slice(-3);
  const pickIndex = action.optionIndex ?? 0;
  const picked = topThree[topThree.length - 1 - pickIndex];
  if (!picked) {
    return;
  }

  const discardIndex = player.discard.lastIndexOf(picked);
  player.discard.splice(discardIndex, 1);
  player.hand.push(picked);
}

function resolveObservatoryDiscover(
  state: GameState,
  action: Extract<GameAction, { type: "RESOLVE_VISIT_STEP" }>,
  heroId: string,
  fieldId: MapSpaceId
): void {
  const adventure = requireAdventure(state);
  const field = adventure.fields[fieldId];
  if (!field) {
    return;
  }

  const tile = adventure.tiles[field.tileInstanceId];
  if (!tile) {
    return;
  }

  const faceDownNeighbors = observatoryDiscoverTargets(adventure, tile);
  const target = faceDownNeighbors[action.optionIndex ?? 0];
  if (!target) {
    return;
  }

  beginTileRotation(state, action.playerId, target, "reveal");
}

/**
 * Face-down tiles the Redwood Observatory may flip: tiles whose flower
 * touches the observatory's tile (centers at hex distance 3 - the previous
 * row/column heuristic also matched tiles up to six hexes away).
 */
export function observatoryDiscoverTargets(
  adventure: NonNullable<GameState["adventure"]>,
  tile: MapTileState
): MapTileState[] {
  return Object.values(adventure.tiles).filter(
    (candidate) =>
      candidate.faceDown &&
      hexDistance(
        { row: candidate.centerRow, col: candidate.centerCol },
        { row: tile.centerRow, col: tile.centerCol }
      ) === 3
  );
}

export function tradeResources(state: GameState, action: Extract<GameAction, { type: "TRADE_RESOURCES" }>): void {
  const adventure = requireAdventure(state);
  const visit = adventure.pendingVisit;
  if (!visit || visit.playerId !== action.playerId || visit.steps[0]?.type !== "TRADING_POST") {
    throw new Error("Trading needs an open Trading Post visit.");
  }

  const rate = TRADE_RATES[action.rateIndex];
  const player = state.players[action.playerId];
  if (!rate || !player) {
    throw new Error("That trade rate does not exist.");
  }

  if (!hasResources(player, rate.sell)) {
    throw new Error("Not enough resources for that trade.");
  }

  spendResources(state, action.playerId, rate.sell, "trading post");
  gainResources(state, action.playerId, rate.buy, "trading post");
  appendEvent(state, { type: "TRADE_EXECUTED", playerId: action.playerId, rateLabel: rate.label });
}

// ---------------------------------------------------------------------------
// Combat lifecycle
// ---------------------------------------------------------------------------

function makeCombatShell(state: GameState, attackerPlayerId: PlayerId, defenderPlayerId: PlayerId): CombatState {
  // Per-combat-round limits start fresh in every fight: a spell cast (or
  // crown spent) in an earlier combat this turn must not block round 1 of
  // the next one.
  for (const playerId of [attackerPlayerId, defenderPlayerId]) {
    const player = state.players[playerId];
    if (player) {
      player.combatStats.spellsCastThisRound = 0;
      player.combatStats.spellLimitBonusThisRound = 0;
      player.combatStats.expertUsesSpentThisRound = 0;
    }
  }

  return {
    id: `combat_${state.eventLog.length + 1}`,
    round: 1,
    attackerPlayerId,
    defenderPlayerId,
    activeUnitId: null,
    context: { kind: "sandbox" },
    setup: null,
    awaitingContinue: false,
    outcome: null,
    dice: {
      faces: [...ATTACK_DIE_FACES],
      seed: `${state.seed}-combat-${state.eventLog.length + 1}`,
      rollCount: 0
    },
    units: {}
  };
}

export function startNeutralEncounter(state: GameState, hero: HeroState, field: MapFieldState): void {
  requireAdventure(state);
  const playerId = hero.controllerId;
  const difficulty = field.difficulty ?? 1;

  // Quick Combat: a hero whose level beats the field difficulty wins outright.
  if (hero.level > difficulty) {
    appendEvent(state, {
      type: "QUICK_COMBAT_WON",
      playerId,
      heroId: hero.id,
      fieldId: field.spaceId,
      difficulty
    });
    field.everFlagged = field.everFlagged || false;
    beginFieldVisit(state, hero.id, field.spaceId, false);
    return;
  }

  restoreStartingArmyIfEmpty(state, playerId);

  // Rulebook Combat Setup order: the player places up to 5 units first; the
  // guard army is drawn from the tier decks only after placement finishes.
  const combat = makeCombatShell(state, playerId, NEUTRAL_PLAYER_ID);
  combat.context = {
    kind: "neutral",
    heroId: hero.id,
    fieldId: field.spaceId,
    difficulty,
    hasAzure: false
  };
  combat.setup = {
    pendingPlayerIds: [playerId],
    placedUnitIds: { [playerId]: [] },
    unitLimit: COMBAT_UNIT_LIMIT
  };

  state.combat = combat;
  state.phase = "combat-setup";
  state.priorityPlayerId = playerId;

  appendEvent(state, {
    type: "NEUTRAL_COMBAT_STARTED",
    playerId,
    heroId: hero.id,
    fieldId: field.spaceId,
    difficulty,
    unitDefIds: []
  });
}

/**
 * Draws and reveals the guard army once the player's placement is locked in:
 * checks the Field Difficulty Level Table, then places the cards by the
 * rulebook AI rules — ranged in the backline, ground/flying in the
 * frontline, left to right from the attacking player's perspective in
 * descending initiative (higher tier first on ties).
 */
function revealNeutralArmy(state: GameState, draws: NeutralDraw[]): void {
  const combat = state.combat;
  if (!combat || combat.context.kind !== "neutral") {
    return;
  }

  combat.pendingNeutralDraws = null;
  combat.context.hasAzure = draws.some((draw) => draw.tier === "azure");

  const neutralUnits = draws.flatMap((draw, index) => {
    const unit = makeCombatUnitFromNeutral(
      draw,
      `neutral_${index + 1}_${draw.unitDefId.split(".")[1]}`,
      0,
      getRuleset(state)
    );
    return unit ? [unit] : [];
  });

  if (neutralUnits.length === 0) {
    // The tier decks ran dry: the guards never show up and the field falls.
    combat.setup = null;
    combat.outcome = {
      winnerPlayerId: combat.attackerPlayerId,
      defeatedPlayerId: NEUTRAL_PLAYER_ID,
      reason: "all-enemy-units-defeated"
    };
    state.phase = "combat";
    state.priorityPlayerId = null;
    return;
  }

  placeNeutralUnits(neutralUnits, DEFENDER_BACKLINE, DEFENDER_FRONTLINE);
  for (const unit of neutralUnits) {
    combat.units[unit.id] = unit;
  }

  appendEvent(state, {
    type: "NEUTRAL_ARMY_REVEALED",
    playerId: combat.attackerPlayerId,
    fieldId: combat.context.fieldId,
    difficulty: combat.context.difficulty,
    unitDefIds: draws.map((draw) => draw.unitDefId)
  });

  combat.setup = null;
  state.phase = "combat";
  state.priorityPlayerId = null;

  appendEvent(state, {
    type: "COMBAT_ROUND_STARTED",
    round: combat.round,
    activeUnitId: null
  });
}

/**
 * Draws stashed while the Groovy Satyr swap choice is open; module-local
 * mirror of combat.pendingNeutralDraws used to rebuild prompt labels.
 */
function openSatyrSwapChoice(state: GameState, draws: NeutralDraw[]): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }

  combat.pendingNeutralDraws = draws;
  const choiceId = `choice_${state.eventLog.length + 1}`;
  state.pendingChoice = {
    id: choiceId,
    type: "OPTION_CHOICE",
    playerId: combat.attackerPlayerId,
    prompt: "Groovy Satyr: swap one drawn neutral for a fresh card of the same tier?",
    options: [
      { label: "Keep the drawn army" },
      ...draws.map((draw) => ({
        label: `Swap ${coreUnitDefinitions[draw.unitDefId]?.name ?? draw.unitDefId} (${draw.tier})`
      }))
    ],
    context: "satyr-swap",
    returnPhase: "combat-setup"
  };
  state.phase = "choice";
  state.priorityPlayerId = combat.attackerPlayerId;
}

/** Resolves the Groovy Satyr swap and reveals the final guard army. */
export function resolveSatyrSwap(state: GameState, playerId: PlayerId, optionIndex: number): void {
  const combat = state.combat;
  const draws = combat?.pendingNeutralDraws;
  if (!combat || !draws) {
    throw new Error("There is no drawn neutral army to swap.");
  }

  if (optionIndex > 0) {
    swapNeutralDraw(state, playerId, draws, optionIndex - 1);
  }

  revealNeutralArmy(state, draws);
}

export function startPlayerCombat(state: GameState, attacker: HeroState, defender: HeroState, fieldId: MapSpaceId): void {
  restoreStartingArmyIfEmpty(state, attacker.controllerId);
  restoreStartingArmyIfEmpty(state, defender.controllerId);

  const combat = makeCombatShell(state, attacker.controllerId, defender.controllerId);
  combat.context = {
    kind: "player",
    attackerHeroId: attacker.id,
    defenderHeroId: defender.id,
    fieldId
  };
  combat.setup = {
    pendingPlayerIds: [attacker.controllerId, defender.controllerId],
    placedUnitIds: { [attacker.controllerId]: [], [defender.controllerId]: [] },
    unitLimit: COMBAT_UNIT_LIMIT
  };

  state.combat = combat;
  state.phase = "combat-setup";
  state.priorityPlayerId = attacker.controllerId;

  appendEvent(state, {
    type: "PLAYER_COMBAT_STARTED",
    attackerPlayerId: attacker.controllerId,
    defenderPlayerId: defender.controllerId,
    fieldId
  });
}

function placementCellsFor(state: GameState, playerId: PlayerId): number[] {
  const combat = state.combat;
  if (!combat) {
    return [];
  }

  return playerId === combat.attackerPlayerId
    ? [...ATTACKER_FRONTLINE, ...ATTACKER_BACKLINE]
    : [...DEFENDER_FRONTLINE, ...DEFENDER_BACKLINE];
}

export function placeCombatUnit(state: GameState, action: Extract<GameAction, { type: "PLACE_COMBAT_UNIT" }>): void {
  const combat = state.combat;
  const setup = combat?.setup;
  const player = state.players[action.playerId];
  if (!combat || !setup || !player) {
    throw new Error("No combat setup is in progress.");
  }

  if (setup.pendingPlayerIds[0] !== action.playerId) {
    throw new Error("It is not that player's turn to place units.");
  }

  if (!placementCellsFor(state, action.playerId).includes(action.position)) {
    throw new Error("Units must start on your back or front line.");
  }

  if (Object.values(combat.units).some((unit) => unit.position === action.position)) {
    throw new Error("That space is already taken.");
  }

  const placed = setup.placedUnitIds[action.playerId] ?? [];
  const armyUnit = player.army.find((unit) => unit.id === action.armyUnitId);
  if (!armyUnit) {
    throw new Error("That unit cannot be placed.");
  }

  // An already-placed unit moves to the new space instead (drag around your
  // own deployment area freely until everything is locked in).
  if (placed.includes(armyUnit.id)) {
    const existing = Object.values(combat.units).find((unit) => unit.armyUnitId === armyUnit.id);
    if (!existing) {
      throw new Error("That unit is not on the board.");
    }
    existing.position = action.position;
    appendEvent(state, {
      type: "COMBAT_UNIT_PLACED",
      playerId: action.playerId,
      unitId: existing.id,
      position: action.position
    });
    return;
  }

  if (placed.length >= setup.unitLimit) {
    throw new Error(`Only ${setup.unitLimit} units may join a combat.`);
  }

  const combatUnit = makeCombatUnitFromArmy(
    armyUnit,
    action.playerId,
    `unit_${action.playerId}_${armyUnit.id}`,
    action.position,
    getRuleset(state)
  );
  if (!combatUnit) {
    throw new Error("That unit has no printed side to fight with.");
  }

  combat.units[combatUnit.id] = combatUnit;
  placed.push(armyUnit.id);
  setup.placedUnitIds[action.playerId] = placed;

  appendEvent(state, {
    type: "COMBAT_UNIT_PLACED",
    playerId: action.playerId,
    unitId: combatUnit.id,
    position: action.position
  });
}

export function unplaceCombatUnit(state: GameState, action: Extract<GameAction, { type: "UNPLACE_COMBAT_UNIT" }>): void {
  const combat = state.combat;
  const setup = combat?.setup;
  if (!combat || !setup || setup.pendingPlayerIds[0] !== action.playerId) {
    throw new Error("No combat placement to undo.");
  }

  const placed = setup.placedUnitIds[action.playerId] ?? [];
  const index = placed.indexOf(action.armyUnitId);
  if (index === -1) {
    throw new Error("That unit is not placed.");
  }

  placed.splice(index, 1);
  const unitId = Object.keys(combat.units).find((id) => combat.units[id].armyUnitId === action.armyUnitId);
  if (unitId) {
    delete combat.units[unitId];
  }
}

export function finishCombatPlacement(state: GameState, action: Extract<GameAction, { type: "FINISH_COMBAT_PLACEMENT" }>): void {
  const combat = state.combat;
  const setup = combat?.setup;
  if (!combat || !setup || setup.pendingPlayerIds[0] !== action.playerId) {
    throw new Error("No combat placement to finish.");
  }

  if ((setup.placedUnitIds[action.playerId] ?? []).length === 0) {
    throw new Error("Place at least one unit before starting the combat.");
  }

  appendEvent(state, { type: "COMBAT_PLACEMENT_FINISHED", playerId: action.playerId });
  setup.pendingPlayerIds.shift();

  if (setup.pendingPlayerIds.length > 0) {
    state.priorityPlayerId = setup.pendingPlayerIds[0];
    return;
  }

  // Against neutral guards, the army is drawn and revealed only now —
  // rulebook Combat Setup: place your units, then check the Difficulty
  // Table and draw the corresponding neutral cards.
  if (combat.context.kind === "neutral") {
    const draws = drawNeutralArmy(state, combat.context.difficulty);
    const satyrActive = getActiveAstrologersCard(state)?.effect.type === "NEUTRAL_DRAW_SWAP";
    if (satyrActive && draws.length > 0) {
      openSatyrSwapChoice(state, draws);
      return;
    }

    revealNeutralArmy(state, draws);
    return;
  }

  combat.setup = null;
  state.phase = "combat";
  state.priorityPlayerId = null;

  appendEvent(state, {
    type: "COMBAT_ROUND_STARTED",
    round: combat.round,
    activeUnitId: null
  });
}

export function continueNeutralCombat(
  state: GameState,
  action: Extract<GameAction, { type: "CONTINUE_NEUTRAL_COMBAT" }>
): void {
  const combat = state.combat;
  if (!combat || !combat.awaitingContinue || combat.context.kind !== "neutral") {
    throw new Error("There is no neutral combat to continue.");
  }

  const hero = state.heroes[combat.context.heroId];
  if (!hero || hero.controllerId !== action.playerId) {
    throw new Error("Only the attacking hero may continue the combat.");
  }

  if (hero.movementPoints <= 0) {
    throw new Error("Continuing a neutral combat costs 1 movement point.");
  }

  hero.movementPoints -= 1;
  combat.awaitingContinue = false;

  appendEvent(state, {
    type: "COMBAT_CONTINUED",
    playerId: action.playerId,
    movementLeft: hero.movementPoints
  });
}

export function retreatFromCombat(state: GameState, action: Extract<GameAction, { type: "RETREAT_FROM_COMBAT" }>): void {
  const combat = state.combat;
  if (!combat || combat.context.kind !== "neutral") {
    throw new Error("Only combats against neutral units allow retreating.");
  }

  if (!combat.awaitingContinue) {
    throw new Error("Retreat is decided at the end of a combat round.");
  }

  const hero = state.heroes[combat.context.heroId];
  if (!hero || hero.controllerId !== action.playerId) {
    throw new Error("Only the attacking hero may retreat.");
  }

  combat.outcome = {
    winnerPlayerId: NEUTRAL_PLAYER_ID,
    defeatedPlayerId: action.playerId,
    reason: "retreat"
  };
  combat.awaitingContinue = false;
  appendEvent(state, {
    type: "COMBAT_ENDED",
    winnerPlayerId: NEUTRAL_PLAYER_ID,
    defeatedPlayerId: action.playerId,
    reason: "retreat"
  });
}

/**
 * Applies the end-of-combat consequences for adventure combats: damage heals,
 * defeated player units leave the unit deck (packs were already flipped to
 * few during combat), neutrals go to their tier discard piles, experience and
 * level ups resolve, and the winning attacker visits the contested field.
 */
export function finalizeAdventureCombat(state: GameState): void {
  const combat = state.combat;
  const adventure = state.adventure;
  if (!combat || !combat.outcome || !adventure || combat.context.kind === "sandbox") {
    return;
  }

  const context = combat.context;
  const outcome = combat.outcome;

  // Sync army cards with what happened on the board.
  for (const unit of Object.values(combat.units)) {
    if (unit.controllerId === NEUTRAL_PLAYER_ID) {
      if (unit.unitDefId) {
        const def = unit.grade === "gold" ? "gold" : unit.grade;
        const deck = state.decks[NEUTRAL_DECK_IDS[def as "bronze" | "silver" | "gold" | "azure"]];
        deck?.discardPile.push(unit.unitDefId);
      }
      continue;
    }

    const player = state.players[unit.controllerId];
    const armyUnit = player?.army.find((candidate) => candidate.id === unit.armyUnitId);
    if (!player || !armyUnit) {
      continue;
    }

    if (unit.damage >= unit.maxHealth) {
      // Few side defeated: the unit card leaves the unit deck.
      player.army = player.army.filter((candidate) => candidate.id !== armyUnit.id);
    } else {
      armyUnit.side = unit.variant === "pack" ? "pack" : "few";
    }
  }

  if (context.kind === "neutral") {
    const hero = state.heroes[context.heroId];
    const playerId = hero?.controllerId;
    const field = adventure.fields[context.fieldId];

    if (hero && playerId) {
      if (outcome.winnerPlayerId === playerId) {
        const level = hero.level;
        if (context.hasAzure) {
          gainExperience(state, playerId, MAX_EXPERIENCE_GAIN_TO_SEVEN(hero));
        } else if (context.difficulty > level) {
          gainExperience(state, playerId, 2);
        } else if (context.difficulty === level) {
          gainExperience(state, playerId, 1);
        }
      } else if (outcome.reason === "retreat") {
        const returnTo = adventure.lastVisitedField[hero.id];
        if (returnTo) {
          hero.spaceId = returnTo;
        }
        appendEvent(state, {
          type: "COMBAT_RETREATED",
          playerId,
          heroId: hero.id,
          returnedTo: hero.spaceId ?? context.fieldId
        });
      } else {
        // Defeat: the hero falls back to a friendly town or settlement.
        moveDefeatedHeroHome(state, hero);
      }

      restoreStartingArmyIfEmpty(state, playerId);
    }

    state.combat = null;
    state.phase = "player-turn";
    state.activePlayerId = playerId ?? state.activePlayerId;
    state.priorityPlayerId = null;

    if (hero && playerId && outcome.winnerPlayerId === playerId && field) {
      beginFieldVisit(state, hero.id, context.fieldId, false);
    }
    return;
  }

  // Player against player.
  const attackerHero = state.heroes[context.attackerHeroId];
  const defenderHero = context.defenderHeroId ? state.heroes[context.defenderHeroId] : null;
  const winnerId = outcome.winnerPlayerId;
  const loserId = outcome.defeatedPlayerId;
  const loserHero = attackerHero?.controllerId === loserId ? attackerHero : defenderHero;
  const winnerHero = attackerHero?.controllerId === winnerId ? attackerHero : defenderHero;

  if (winnerHero && loserHero) {
    // Winner gains experience by the defeated main hero's level.
    if (loserHero.kind === "main") {
      if (loserHero.level > winnerHero.level) {
        gainExperience(state, winnerId, 2);
      } else if (loserHero.level === winnerHero.level) {
        gainExperience(state, winnerId, 1);
      }
    }

    const loser = state.players[loserId];
    const payment = Math.min(5, loser?.resources.gold ?? 0);
    if (payment > 0) {
      spendResources(state, loserId, { gold: payment }, "defeated by an enemy hero");
      gainResources(state, winnerId, { gold: payment }, "spoils of victory");
    }
    changeMorale(state, loserId, -1);
    moveDefeatedHeroHome(state, loserHero);
  }

  for (const playerId of [winnerId, loserId]) {
    if (playerId !== NEUTRAL_PLAYER_ID) {
      restoreStartingArmyIfEmpty(state, playerId);
    }
  }

  state.combat = null;
  state.phase = "player-turn";
  state.activePlayerId = attackerHero?.controllerId ?? state.activePlayerId;
  state.priorityPlayerId = null;

  if (winnerHero && winnerHero.id === context.attackerHeroId) {
    beginFieldVisit(state, winnerHero.id, context.fieldId, false);
  }
}

function MAX_EXPERIENCE_GAIN_TO_SEVEN(hero: HeroState): number {
  return Math.max(0, 12 - hero.experience);
}

function moveDefeatedHeroHome(state: GameState, hero: HeroState): void {
  const adventure = state.adventure;
  if (!adventure) {
    return;
  }

  const playerId = hero.controllerId;
  const town = getTownOfPlayer(state, playerId);
  const home =
    town?.fieldId ??
    Object.values(adventure.fields).find(
      (field) => field.location === "settlement" && field.flagOwnerId === playerId
    )?.spaceId ??
    null;

  hero.spaceId = home;
  hero.movementPoints = 0;
}

// ---------------------------------------------------------------------------
// Town economy
// ---------------------------------------------------------------------------

export function buildStructureAdventure(
  state: GameState,
  action: Extract<GameAction, { type: "BUILD_STRUCTURE" }>
): void {
  const player = state.players[action.playerId];
  const town = state.towns[action.townId];
  const building = coreBuildingDefinitions[action.buildingId];
  if (!player || !town || !building) {
    throw new Error("That structure cannot be built right now.");
  }

  if (state.combat) {
    throw new Error("Town actions cannot interrupt a combat.");
  }

  if (town.controllerId !== action.playerId) {
    throw new Error("Players may only build in their own town.");
  }

  if (!player.townTokens.build) {
    throw new Error("The Build token was already used this round.");
  }

  if (building.implementationStatus !== "implemented") {
    throw new Error(`${building.name} is not implemented yet.`);
  }

  if (town.buildings.includes(action.buildingId)) {
    throw new Error("That building already stands.");
  }

  if ((building.prerequisites ?? []).some((prerequisite) => !town.buildings.includes(prerequisite))) {
    throw new Error("Lower-level dwellings must be built first.");
  }

  if (!hasResources(player, building.cost)) {
    throw new Error("Not enough resources for that building.");
  }

  spendResources(state, action.playerId, building.cost, `built ${building.name}`);
  closeMulliganWindow(state, action.playerId);
  player.townTokens.build = false;
  town.buildings.push(action.buildingId);

  appendEvent(state, {
    type: "STRUCTURE_BUILT",
    playerId: action.playerId,
    townId: action.townId,
    buildingId: action.buildingId,
    cost: building.cost
  });

  if (building.effect?.type === "MAGE_GUILD") {
    player.mageGuildBuiltRound = state.round;
    // Building the Mage Guild immediately searches the Spell deck twice.
    state.adventure?.rewardQueue.push(
      { playerId: action.playerId, kind: "shared-deck-search", deckId: "spells", count: 2 },
      { playerId: action.playerId, kind: "shared-deck-search", deckId: "spells", count: 2 }
    );
  }
}

export function populationAction(state: GameState, action: Extract<GameAction, { type: "POPULATION_ACTION" }>): void {
  const player = state.players[action.playerId];
  if (!player) {
    throw new Error("Unknown player.");
  }

  if (state.combat) {
    throw new Error("Town actions cannot interrupt a combat.");
  }

  if (!player.townTokens.population) {
    throw new Error("The Population token was already used this round.");
  }

  if (action.purchases.length === 0) {
    throw new Error("Choose at least one recruit or reinforcement.");
  }

  const tiers = unlockedRecruitTiers(state, action.playerId);
  const canReinforce = townHasBuildingEffect(state, action.playerId, "UNLOCK_REINFORCE");
  const faction = player.factionId ? coreFactionDefinitions[player.factionId] : undefined;

  const totalCost: ResourceCost = {};
  const addCost = (cost: ResourceCost) => {
    for (const [resource, amount] of Object.entries(cost) as ["gold" | "buildingMaterials" | "valuables", number][]) {
      totalCost[resource] = (totalCost[resource] ?? 0) + amount;
    }
  };

  // Validate before mutating: simulate against a copy of the army.
  const armyCopy = player.army.map((unit) => ({ ...unit }));
  for (const purchase of action.purchases) {
    if (!faction?.units.includes(purchase.unitDefId)) {
      throw new Error("Players may only recruit their own faction's units.");
    }

    if (purchase.kind === "recruit") {
      const side = getUnitSide(purchase.unitDefId, "few");
      const def = side ? coreUnitTier(purchase.unitDefId) : null;
      if (!side || !def) {
        throw new Error("That unit cannot be recruited.");
      }
      if (!tiers.has(def)) {
        throw new Error("Build the dwelling of that unit's level first.");
      }
      addCost(side.cost);
      armyCopy.push({ id: `pending_${armyCopy.length}`, unitDefId: purchase.unitDefId, side: "few" });
    } else {
      if (!canReinforce) {
        throw new Error("Reinforcing needs a Citadel.");
      }
      const target = armyCopy.find((unit) => unit.id === purchase.armyUnitId);
      if (!target || target.side !== "few" || target.unitDefId !== purchase.unitDefId) {
        throw new Error("Reinforce an existing few unit of that type.");
      }
      const def = coreUnitTier(purchase.unitDefId);
      if (!def || !tiers.has(def)) {
        throw new Error("Build the dwelling of that unit's level first.");
      }
      const packSide = getUnitSide(purchase.unitDefId, "pack");
      if (!packSide) {
        throw new Error("That unit has no pack side.");
      }
      addCost(packSide.cost);
      target.side = "pack";
    }
  }

  if (!hasResources(player, totalCost)) {
    throw new Error("Not enough resources for those units.");
  }

  spendResources(state, action.playerId, totalCost, "population action");
  closeMulliganWindow(state, action.playerId);
  player.townTokens.population = false;

  for (const purchase of action.purchases) {
    if (purchase.kind === "recruit") {
      addArmyUnit(player, purchase.unitDefId, "few");
      appendEvent(state, {
        type: "UNIT_RECRUITED",
        playerId: action.playerId,
        unitDefId: purchase.unitDefId,
        kind: "recruit",
        cost: getUnitSide(purchase.unitDefId, "few")?.cost ?? {}
      });
    } else {
      const target = player.army.find((unit) => unit.id === purchase.armyUnitId);
      if (target) {
        target.side = "pack";
        appendEvent(state, {
          type: "UNIT_RECRUITED",
          playerId: action.playerId,
          unitDefId: purchase.unitDefId,
          kind: "reinforce",
          cost: getUnitSide(purchase.unitDefId, "pack")?.cost ?? {}
        });
      }
    }
  }
}

const coreUnitTierLookup: Record<string, string> = Object.fromEntries(
  Object.values(coreUnitDefinitions).map((unit) => [unit.id, unit.tier])
);

function coreUnitTier(unitDefId: string): string | null {
  return coreUnitTierLookup[unitDefId] ?? null;
}

/**
 * Spell Book token: pay the faction's Mage Guild price (6 gold Castle,
 * 5 gold otherwise) to Search (2) the Spell deck. Playing a Wisdom card with
 * the purchase reduces the price by 2 gold (3 gold expert in BINH mode) and
 * upgrades the search to Search (3) / Search (4), as printed on Wisdom.
 */
export function spellBookAction(state: GameState, action: Extract<GameAction, { type: "SPELL_BOOK_ACTION" }>): void {
  const player = state.players[action.playerId];
  if (!player) {
    throw new Error("Unknown player.");
  }

  if (state.combat) {
    throw new Error("Town actions cannot interrupt a combat.");
  }

  if (!player.townTokens.spellBook) {
    throw new Error("The Spell Book token was already used this round.");
  }

  const town = getTownOfPlayer(state, action.playerId);
  const mageGuild = town?.buildings
    .map((buildingId) => coreBuildingDefinitions[buildingId])
    .find((building) => building?.effect?.type === "MAGE_GUILD");
  if (!mageGuild) {
    throw new Error("Buying spells needs a Mage Guild.");
  }

  if (player.mageGuildBuiltRound === state.round) {
    throw new Error("The Spell Book token cannot be used the round the Mage Guild was built.");
  }

  let goldCost = mageGuild.spellBookCost ?? 5;
  let searchCount = 2;
  const wisdom = action.wisdom;

  if (wisdom) {
    const card = cardLibrary[wisdom.cardId];
    if (card?.name !== "Wisdom" || !player.hand.includes(wisdom.cardId)) {
      throw new Error("Playing Wisdom here needs a Wisdom card in hand.");
    }
    if (wisdom.mode === "expert" && expertUsesAvailable(player) <= 0) {
      throw new Error("No expert uses are available for expert Wisdom.");
    }

    goldCost = Math.max(0, goldCost - wisdomGoldDiscount(getRuleset(state), wisdom.mode));
    searchCount = wisdomSearchCount(wisdom.mode);
  }

  const cost: ResourceCost = { gold: goldCost };
  if (!hasResources(player, cost)) {
    throw new Error("Not enough gold to buy spells.");
  }

  if (wisdom) {
    const index = player.hand.indexOf(wisdom.cardId);
    player.hand.splice(index, 1);
    player.discard.push(wisdom.cardId);
    if (wisdom.mode === "expert") {
      player.combatStats.expertUsesSpentThisRound += 1;
    }
    appendEvent(state, {
      type: "CARD_PLAYED",
      playerId: action.playerId,
      cardId: wisdom.cardId,
      timing: "town",
      mode: wisdom.mode,
      optionLabel: `Wisdom: −${wisdomGoldDiscount(getRuleset(state), wisdom.mode)} gold, Search (${searchCount})`
    });
  }

  if (goldCost > 0) {
    spendResources(state, action.playerId, cost, "spell book");
  }
  closeMulliganWindow(state, action.playerId);
  player.townTokens.spellBook = false;
  appendEvent(state, { type: "SPELLS_PURCHASED", playerId: action.playerId, cost });

  state.adventure?.rewardQueue.push({
    playerId: action.playerId,
    kind: "shared-deck-search",
    deckId: "spells",
    count: searchCount
  });
}

/**
 * Blacksmith (rulebook town board): once during your turn, pay 6 gold to
 * Search (2) the Artifact deck, or remove an Artifact card from your hand to
 * gain 4 gold. Owning the Blacksmith also unlocks the BINH Major/Relic
 * artifact decks at hero level 4/6.
 */
export function blacksmithAction(state: GameState, action: Extract<GameAction, { type: "BLACKSMITH_ACTION" }>): void {
  const player = state.players[action.playerId];
  if (!player) {
    throw new Error("Unknown player.");
  }

  if (state.combat) {
    throw new Error("Town actions cannot interrupt a combat.");
  }

  const town = getTownOfPlayer(state, action.playerId);
  const smith = town?.buildings
    .map((buildingId) => coreBuildingDefinitions[buildingId])
    .find((building) => building?.effect?.type === "ARTIFACT_SMITH");
  if (!smith || smith.effect?.type !== "ARTIFACT_SMITH") {
    throw new Error("This action needs a Blacksmith.");
  }

  if (player.blacksmithUsedRound === state.round) {
    throw new Error("The Blacksmith was already used this turn.");
  }

  if (action.option === "search") {
    const cost: ResourceCost = { gold: smith.effect.searchCost };
    if (!hasResources(player, cost)) {
      throw new Error("Not enough gold for the Blacksmith search.");
    }

    spendResources(state, action.playerId, cost, "Blacksmith");
    player.blacksmithUsedRound = state.round;
    closeMulliganWindow(state, action.playerId);
    state.adventure?.rewardQueue.push({
      playerId: action.playerId,
      kind: "shared-deck-search",
      deckId: "artifacts",
      count: 2
    });
    return;
  }

  const cardId = action.artifactCardId;
  if (!cardId || !player.hand.includes(cardId) || cardLibrary[cardId]?.kind !== "artifact") {
    throw new Error("Choose an Artifact card from your hand to sell.");
  }

  const index = player.hand.indexOf(cardId);
  player.hand.splice(index, 1);
  player.removed.push(cardId);
  player.blacksmithUsedRound = state.round;
  closeMulliganWindow(state, action.playerId);
  gainResources(state, action.playerId, { gold: smith.effect.sellGold }, `sold ${cardLibrary[cardId]?.name ?? cardId} at the Blacksmith`);
}

/**
 * Positive morale token, by the book: "Draw a card from your Deck" or
 * "Discard any number of cards, then draw that many cards" — at any time.
 * (The third option, rerolling a die, is offered inside the dice flows.)
 */
export function spendMorale(state: GameState, action: Extract<GameAction, { type: "SPEND_MORALE" }>): void {
  const player = state.players[action.playerId];
  if (!player || player.morale < 1) {
    throw new Error("No positive morale token to spend.");
  }

  if (action.benefit === "redraw") {
    const discards = action.discardCardIds ?? [];
    if (discards.length === 0) {
      throw new Error("Choose at least one card to discard and redraw.");
    }

    const handCounts = new Map<string, number>();
    for (const cardId of player.hand) {
      handCounts.set(cardId, (handCounts.get(cardId) ?? 0) + 1);
    }
    for (const cardId of discards) {
      const left = handCounts.get(cardId) ?? 0;
      if (left <= 0) {
        throw new Error("Cannot discard a card that is not in hand.");
      }
      handCounts.set(cardId, left - 1);
    }

    player.morale -= 1;
    appendEvent(state, { type: "MORALE_SPENT", playerId: action.playerId, benefit: "redraw" });
    appendEvent(state, { type: "MORALE_CHANGED", playerId: action.playerId, amount: -1, total: player.morale });

    for (const cardId of discards) {
      const index = player.hand.indexOf(cardId);
      player.hand.splice(index, 1);
      player.discard.push(cardId);
    }
    drawCardsForPlayer(state, action.playerId, discards.length);
    return;
  }

  player.morale -= 1;
  appendEvent(state, { type: "MORALE_SPENT", playerId: action.playerId, benefit: "draw" });
  appendEvent(state, { type: "MORALE_CHANGED", playerId: action.playerId, amount: -1, total: player.morale });
  drawCardsForPlayer(state, action.playerId, 1);
}

export function chooseOption(state: GameState, action: Extract<GameAction, { type: "CHOOSE_OPTION" }>): void {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "OPTION_CHOICE" || choice.id !== action.choiceId || choice.playerId !== action.playerId) {
    throw new Error("That choice cannot be resolved.");
  }

  if (choice.context === "satyr-swap") {
    state.pendingChoice = null;
    resolveSatyrSwap(state, action.playerId, action.optionIndex);
    return;
  }

  if (choice.context === "deck-pick") {
    const deckId = choice.deckPick?.deckIds[action.optionIndex];
    if (!deckId) {
      throw new Error("Pick one of the offered decks.");
    }
    state.pendingChoice = null;
    state.phase = choice.returnPhase;
    openSharedDeckSearch(state, action.playerId, deckId, choice.deckPick?.count ?? 2);
    return;
  }

  if (choice.context === "discard-pick") {
    const pick = choice.discardPick;
    const cardId = pick?.cardIds[action.optionIndex];
    const player = state.players[action.playerId];
    if (!pick || !cardId || !player) {
      throw new Error("Pick one of the offered discard cards.");
    }

    const index = player.discard.lastIndexOf(cardId);
    if (index !== -1) {
      player.discard.splice(index, 1);
      player.hand.push(cardId);
    }

    if (pick.shuffleRestIntoDeck && player.discard.length > 0) {
      player.deck = shuffleCards(
        [...player.deck, ...player.discard],
        `${state.seed}#discard-into-deck#${action.playerId}#${state.eventLog.length}`
      );
      player.discard = [];
    }

    state.pendingChoice = null;
    state.phase = choice.returnPhase;
    state.priorityPlayerId = null;

    if (pick.remaining > 1) {
      state.adventure?.rewardQueue.unshift({
        playerId: action.playerId,
        kind: "discard-pick",
        count: pick.remaining - 1,
        filter: pick.filter,
        fromTop: pick.fromTop,
        shuffleRestIntoDeck: pick.shuffleRestIntoDeck
      });
      pumpAdventureQueues(state);
    }
    return;
  }

  if (choice.context === "eagle-eye") {
    const dig = choice.eagleEye;
    const player = state.players[action.playerId];
    const deck = dig ? state.decks[dig.deckId] : undefined;
    if (!dig || !player || !deck) {
      throw new Error("There is no dug spell to resolve.");
    }

    if (action.optionIndex === 0) {
      player.hand.push(dig.cardId);
    } else {
      deck.discardPile.push(dig.cardId);
    }

    state.pendingChoice = null;
    state.phase = choice.returnPhase;
    state.priorityPlayerId = null;
    return;
  }

  if (choice.context === "city-hall") {
    const optionsSource = cityHallChoiceBeingResolved;
    const option = optionsSource?.options[action.optionIndex];
    if (!optionsSource || !option) {
      throw new Error("That City Hall option does not exist.");
    }

    if (option.gold) {
      gainResources(state, action.playerId, { gold: option.gold }, "City Hall");
    }
    if (option.buildingMaterials) {
      gainResources(state, action.playerId, { buildingMaterials: option.buildingMaterials }, "City Hall");
    }
    if (option.valuables) {
      gainResources(state, action.playerId, { valuables: option.valuables }, "City Hall");
    }
    if (option.movement) {
      const hero = getMainHero(state, action.playerId);
      if (hero) {
        hero.movementPoints += option.movement;
      }
    }
    if (option.reinforceBronzeFree) {
      const player = state.players[action.playerId];
      const target = player?.army.find((unit) => {
        if (unit.side !== "few") {
          return false;
        }
        return coreUnitTierLookup[unit.unitDefId] === "bronze" && Boolean(getUnitSide(unit.unitDefId, "pack"));
      });
      if (target) {
        target.side = "pack";
        appendEvent(state, {
          type: "UNIT_RECRUITED",
          playerId: action.playerId,
          unitDefId: target.unitDefId,
          kind: "reinforce",
          cost: {}
        });
      }
    }
  }

  cityHallChoiceBeingResolved = null;
  state.pendingChoice = null;
  state.phase = choice.returnPhase;
  state.priorityPlayerId = null;
}

/**
 * City Hall options under resolution; kept module-local because the pending
 * choice itself stores only labels. The queue pump repopulates it whenever a
 * city-hall choice opens, including after a state reload.
 */
let cityHallChoiceBeingResolved: {
  options: {
    label: string;
    gold?: number;
    buildingMaterials?: number;
    valuables?: number;
    movement?: number;
    reinforceBronzeFree?: boolean;
  }[];
} | null = null;

// ---------------------------------------------------------------------------
// Turn and round flow
// ---------------------------------------------------------------------------

/**
 * Logistics (basic) trigger: when the turn is about to end and the played
 * Logistics effect is active, offer the free step onto an adjacent empty
 * field (fields with black cubes or your own flags count as empty; guarded,
 * occupied and blocked fields do not). Consumes the effect either way.
 */
function queueLogisticsEndTurnMove(state: GameState, playerId: PlayerId): boolean {
  const adventure = state.adventure;
  const effect = state.activeEffects.find(
    (candidate) =>
      candidate.controllerId === playerId &&
      candidate.modifiers.some((modifier) => modifier.type === "END_TURN_ADJACENT_MOVE")
  );
  if (!adventure || !effect) {
    return false;
  }

  state.activeEffects = state.activeEffects.filter((candidate) => candidate.id !== effect.id);

  const hero = getMainHero(state, playerId);
  if (!hero?.spaceId) {
    return false;
  }

  const destinations = getAdjacentSpaceIds(hero.spaceId).filter((spaceId) => {
    if (!canCrossEdge(state, hero.spaceId as MapSpaceId, spaceId)) {
      return false;
    }
    if (heroAtSpace(state, spaceId, hero.id)) {
      return false;
    }
    const field = adventure.fields[spaceId];
    if (!field || isFieldGuarded(field)) {
      return false;
    }
    const location = locationDefinitions[field.location];
    if (!location || location.category === "blocked") {
      return false;
    }
    // "Empty": nothing would trigger on entering — truly empty fields, used
    // (black-cubed) visitables, and fields flagged by this player.
    if (location.category === "empty") {
      return true;
    }
    if (location.category === "visitable") {
      return field.blackCube;
    }
    if (location.category === "flaggable" || location.category === "town") {
      return field.flagOwnerId === playerId;
    }
    return false;
  });

  if (destinations.length === 0) {
    return false;
  }

  adventure.rewardQueue.push({
    playerId,
    kind: "visit-steps",
    steps: [
      {
        type: "CHOOSE_ONE",
        prompt: "Logistics: move your hero to an adjacent empty field?",
        options: [
          ...destinations.map((spaceId) => ({
            label: `Move to ${spaceId}`,
            steps: [{ type: "TELEPORT_HERO" as const, heroId: hero.id, spaceId }]
          })),
          { label: "Stay", steps: [] }
        ]
      }
    ]
  });
  pumpAdventureQueues(state);
  return true;
}

export function endTurnAdventure(state: GameState, action: Extract<GameAction, { type: "END_TURN" }>): void {
  assertActiveTurn(state, action.playerId);
  assertNoPendingInput(state);

  // Logistics (basic): "At the end of your turn, move your Hero's model to an
  // adjacent empty field." The choice opens once, then the turn really ends.
  if (queueLogisticsEndTurnMove(state, action.playerId)) {
    return;
  }

  const player = state.players[action.playerId];
  if (player) {
    player.canMulligan = false;
    // The second negative morale token: the hand is discarded at turn end.
    if (player.discardHandAtTurnEnd) {
      const discarded = player.hand.length;
      player.discard.push(...player.hand);
      player.hand = [];
      player.discardHandAtTurnEnd = false;
      appendEvent(state, {
        type: "HAND_REFRESHED",
        playerId: action.playerId,
        discarded,
        drawn: 0
      });
    }
  }

  // Ongoing cards last "until the player who played them starts their next
  // Turn" — they survive the opponents' turns and expire in startPlayerTurn.
  const order = state.turnOrder;
  const currentIndex = order.indexOf(action.playerId);
  const nextIndex = (currentIndex + 1) % order.length;
  const nextPlayerId = order[nextIndex];

  appendEvent(state, {
    type: "TURN_ENDED",
    playerId: action.playerId,
    nextPlayerId
  });

  if (nextIndex === 0) {
    state.round += 1;
    startAdventureRound(state);
  }

  state.activePlayerId = nextPlayerId;
  state.turn.observingPlayerId = nextPlayerId;
  startPlayerTurn(state, nextPlayerId);
}

// ---------------------------------------------------------------------------
// Shared-deck searches (split decks, Scouting, school fetches, repeats)
// ---------------------------------------------------------------------------

/**
 * Expands a deck-family id ("spells", "artifacts") into the decks this player
 * may search right now. Explicit split-deck ids pass through unchanged.
 */
export function resolveSearchDeckCandidates(state: GameState, playerId: PlayerId, deckId: string): string[] {
  const hero = getMainHero(state, playerId);

  if (deckId === "spells") {
    return eligibleSpellDecks(state, playerId, hero);
  }

  if (deckId === "artifacts") {
    const artifactSource = Boolean(
      getTownOfPlayer(state, playerId)?.buildings.some(
        (buildingId) => coreBuildingDefinitions[buildingId]?.effect?.type === "ARTIFACT_SMITH"
      )
    );
    return eligibleArtifactDecks(state, playerId, hero, artifactSource);
  }

  return [deckId];
}

/**
 * Opens the DECK_SEARCH pending choice on a concrete deck, applying Scouting
 * search-size overrides, Basic X Magic school fetches and the Pendant of
 * Courage repeat.
 */
export function openSharedDeckSearch(state: GameState, playerId: PlayerId, deckId: string, baseCount: number): void {
  const deck = state.decks[deckId];
  if (!deck) {
    return;
  }

  const count = applySearchCountEffects(state, playerId, baseCount);
  const revealedCardIds: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const cardId = deck.drawPile.pop();
    if (!cardId) {
      break;
    }
    revealedCardIds.push(cardId);
  }

  const schoolFetch = isSpellDeck(deckId) ? activeSchoolFetches(state, playerId) : [];
  const repeats = takeSearchRepeatEffect(state, playerId);

  const choiceId = `choice_${state.eventLog.length + 1}`;
  state.pendingChoice = {
    id: choiceId,
    type: "DECK_SEARCH",
    playerId,
    deckId,
    revealedCardIds,
    canTakeDiscardTop: deck.discardPile.length > 0,
    ...(schoolFetch.length > 0 ? { schoolFetch } : {}),
    ...(repeats ? { repeatSearch: { deckId, count: baseCount } } : {}),
    returnPhase: "player-turn"
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;

  appendEvent(state, {
    type: "DECK_SEARCH_STARTED",
    playerId,
    deckId,
    choiceId,
    revealedCount: revealedCardIds.length
  });
}

// ---------------------------------------------------------------------------
// Queue pump (rewards, pending visits)
// ---------------------------------------------------------------------------

/**
 * Opens the next queued reward when nothing else is waiting on input. Deck
 * searches reuse the shared DECK_SEARCH pending choice; City Hall choices
 * open an OPTION_CHOICE.
 */
export function pumpAdventureQueues(state: GameState): void {
  const adventure = state.adventure;
  if (!adventure) {
    return;
  }

  if (state.combat || state.pendingChoice || state.reactionWindow || state.stack.length > 0) {
    return;
  }

  if (adventure.pendingVisit) {
    processPendingVisit(state);
    if (state.pendingChoice || adventure.pendingVisit) {
      if (!state.pendingChoice && adventure.pendingVisit) {
        return;
      }
    }
  }

  while (!state.pendingChoice && adventure.rewardQueue.length > 0) {
    const reward = adventure.rewardQueue[0];

    if (reward.kind === "visit-steps") {
      adventure.rewardQueue.shift();
      const hero = getMainHero(state, reward.playerId);
      adventure.pendingVisit = {
        heroId: hero?.id ?? "",
        playerId: reward.playerId,
        fieldId: hero?.spaceId ?? "",
        steps: [...reward.steps]
      };
      processPendingVisit(state);
      if (state.pendingChoice || adventure.pendingVisit) {
        return;
      }
      continue;
    }

    if (reward.kind === "shared-deck-search") {
      adventure.rewardQueue.shift();

      // "Spells"/"artifacts" are deck families: in BINH mode the player may
      // pick among the unlocked split decks (rulebook optional rule + the
      // BINH level/map gates); decks that ran out of cards drop out.
      const candidates = resolveSearchDeckCandidates(state, reward.playerId, reward.deckId).filter((deckId) => {
        const deck = state.decks[deckId];
        return deck && deck.drawPile.length + deck.discardPile.length > 0;
      });

      if (candidates.length === 0) {
        continue;
      }

      if (candidates.length > 1) {
        const choiceId = `choice_${state.eventLog.length + 1}`;
        state.pendingChoice = {
          id: choiceId,
          type: "OPTION_CHOICE",
          playerId: reward.playerId,
          prompt: `Search which deck? (Search ${reward.count})`,
          options: candidates.map((deckId) => ({
            label: `${deckDisplayName(state, deckId)} (${(state.decks[deckId]?.drawPile.length ?? 0) + (state.decks[deckId]?.discardPile.length ?? 0)} cards)`
          })),
          context: "deck-pick",
          deckPick: { deckIds: candidates, count: reward.count },
          returnPhase: "player-turn"
        };
        state.phase = "choice";
        state.priorityPlayerId = reward.playerId;
        return;
      }

      openSharedDeckSearch(state, reward.playerId, candidates[0], reward.count);
      return;
    }

    if (reward.kind === "discard-pick") {
      adventure.rewardQueue.shift();
      const player = state.players[reward.playerId];
      if (!player) {
        continue;
      }

      const pool = reward.fromTop ? player.discard.slice(-reward.fromTop) : [...player.discard];
      const candidates = pool.filter((cardId) => {
        const kind = cardLibrary[cardId]?.kind;
        if (reward.filter === "spell") {
          return kind === "spell";
        }
        if (reward.filter === "non-artifact") {
          return kind !== "artifact";
        }
        return true;
      });

      if (candidates.length === 0) {
        continue;
      }

      const choiceId = `choice_${state.eventLog.length + 1}`;
      state.pendingChoice = {
        id: choiceId,
        type: "OPTION_CHOICE",
        playerId: reward.playerId,
        prompt: `Take a card from your discard pile${reward.count > 1 ? ` (${reward.count} left)` : ""}`,
        options: candidates.map((cardId) => ({ label: `Take ${cardLibrary[cardId]?.name ?? cardId}` })),
        context: "discard-pick",
        discardPick: {
          cardIds: candidates,
          remaining: reward.count,
          filter: reward.filter,
          fromTop: reward.fromTop,
          shuffleRestIntoDeck: reward.shuffleRestIntoDeck
        },
        returnPhase: state.combat ? "combat" : "player-turn"
      };
      state.phase = "choice";
      state.priorityPlayerId = reward.playerId;
      return;
    }

    if (reward.kind === "city-hall-choice") {
      const building = coreBuildingDefinitions[reward.buildingId];
      if (building?.effect?.type !== "RESOURCE_ROUND_CHOICE") {
        adventure.rewardQueue.shift();
        continue;
      }

      adventure.rewardQueue.shift();
      cityHallChoiceBeingResolved = { options: building.effect.options };
      state.pendingChoice = {
        id: `choice_${state.eventLog.length + 1}`,
        type: "OPTION_CHOICE",
        playerId: reward.playerId,
        prompt: `${building.name}: choose this round's bonus`,
        options: building.effect.options.map((option) => ({ label: option.label })),
        context: "city-hall",
        returnPhase: state.phase === "choice" ? "player-turn" : state.phase
      };
      state.phase = "choice";
      state.priorityPlayerId = reward.playerId;
      return;
    }
  }
}

/** Restores the city-hall options after a reload mid-choice. */
export function rehydrateCityHallChoice(state: GameState): void {
  const choice = state.pendingChoice;
  if (choice?.type !== "OPTION_CHOICE" || choice.context !== "city-hall" || cityHallChoiceBeingResolved) {
    return;
  }

  const labels = choice.options.map((option) => option.label).join("|");
  for (const building of Object.values(coreBuildingDefinitions)) {
    if (building.effect?.type === "RESOURCE_ROUND_CHOICE") {
      const candidate = building.effect.options.map((option) => option.label).join("|");
      if (candidate === labels) {
        cityHallChoiceBeingResolved = { options: building.effect.options };
        return;
      }
    }
  }
}

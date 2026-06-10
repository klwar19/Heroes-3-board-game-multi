import { coreBuildingDefinitions, coreFactionDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { locationDefinitions, TRADE_RATES } from "@/data/map/locations";
import {
  addArmyUnit,
  beginFieldVisit,
  canCrossEdge,
  canPlaceTileAt,
  changeMorale,
  drawNeutralArmy,
  gainExperience,
  gainResources,
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
  townHasBuildingEffect,
  unlockedRecruitTiers
} from "./adventure";
import { ATTACK_DIE_FACES } from "./battlefield";
import { drawCardsForPlayer } from "./decks";
import { appendEvent } from "./events";
import { expireEffectsForTurnEnd } from "./active-effects";
import type {
  CombatState,
  GameAction,
  GameState,
  HeroState,
  MapFieldState,
  MapSpaceId,
  PlayerId,
  ResourceCost
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
}

function assertActiveTurn(state: GameState, playerId: PlayerId): void {
  if (state.activePlayerId !== playerId) {
    throw new Error("It is not that player's turn.");
  }
}

function assertHandRefreshed(state: GameState, playerId: PlayerId): void {
  if (state.players[playerId]?.needsHandRefresh) {
    throw new Error("Refresh your hand first: discard any cards, then draw up to your hand limit.");
  }
}

// ---------------------------------------------------------------------------
// Hand refresh
// ---------------------------------------------------------------------------

export function refreshHand(state: GameState, action: Extract<GameAction, { type: "REFRESH_HAND" }>): void {
  const player = state.players[action.playerId];
  if (!player || !player.needsHandRefresh) {
    throw new Error("No hand refresh is pending.");
  }

  assertActiveTurn(state, action.playerId);

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

  if (player.hand.length > player.limits.hand) {
    throw new Error(`Discard down to your hand limit of ${player.limits.hand} first.`);
  }

  const toDraw = Math.max(0, player.limits.hand - player.hand.length);
  const drawn = toDraw > 0 ? drawCardsForPlayer(state, action.playerId, toDraw) : 0;
  player.needsHandRefresh = false;

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

export function moveHeroAdventure(state: GameState, action: Extract<GameAction, { type: "MOVE_HERO" }>): void {
  const adventure = requireAdventure(state);
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

  const from = hero.spaceId;
  hero.spaceId = action.to;
  hero.movementPoints -= 1;

  appendEvent(state, {
    type: "HERO_MOVED",
    playerId: action.playerId,
    heroId: hero.id,
    from,
    to: action.to,
    movementLeft: hero.movementPoints
  });

  const enemyHero = heroAtSpace(state, action.to, hero.id);
  if (enemyHero && enemyHero.controllerId !== action.playerId) {
    startPlayerCombat(state, hero, enemyHero, action.to);
    return;
  }

  const field = adventure.fields[action.to];
  if (!field) {
    return;
  }

  if (isFieldGuarded(field) && field.flagOwnerId !== action.playerId) {
    startNeutralEncounter(state, hero, field);
    return;
  }

  beginFieldVisit(state, hero.id, action.to, false);
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

  tile.faceDown = false;
  materializeTileFields(adventure, tile);

  appendEvent(state, {
    type: "TILE_REVEALED",
    playerId,
    tileInstanceId,
    tileDefId: tile.tileDefId
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
  if (!supply.includes(action.tileDefId)) {
    throw new Error("That tile is not in your supply.");
  }

  const rotation = ((action.rotation % 6) + 6) % 6;
  const center = { row: action.centerRow, col: action.centerCol };
  if (!canPlaceTileAt(state, hero, center, rotation)) {
    throw new Error(
      "New tiles must touch at least two existing tiles, sit next to your hero, and must not overlap."
    );
  }

  supply.splice(supply.indexOf(action.tileDefId), 1);
  hero.movementPoints -= 1;
  const tile = instantiateTile(adventure, action.tileDefId, center, rotation, false);

  appendEvent(state, {
    type: "TILE_PLACED",
    playerId: action.playerId,
    tileInstanceId: tile.id,
    tileDefId: tile.tileDefId,
    centerRow: tile.centerRow,
    centerCol: tile.centerCol,
    rotation: tile.rotation
  });
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
      // Trades happen through TRADE_RESOURCES; this step closes the window.
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

  const faceDownNeighbors = Object.values(adventure.tiles).filter(
    (candidate) =>
      candidate.faceDown &&
      Math.abs(candidate.centerRow - tile.centerRow) + Math.abs(candidate.centerCol - tile.centerCol) <= 6
  );
  const target = faceDownNeighbors[action.optionIndex ?? 0];
  if (!target) {
    return;
  }

  target.faceDown = false;
  materializeTileFields(adventure, target);
  appendEvent(state, {
    type: "TILE_REVEALED",
    playerId: action.playerId,
    tileInstanceId: target.id,
    tileDefId: target.tileDefId
  });
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

  const draws = drawNeutralArmy(state, difficulty);
  const combat = makeCombatShell(state, playerId, NEUTRAL_PLAYER_ID);
  combat.context = {
    kind: "neutral",
    heroId: hero.id,
    fieldId: field.spaceId,
    difficulty,
    hasAzure: draws.some((draw) => draw.tier === "azure")
  };

  const neutralUnits = draws.flatMap((draw, index) => {
    const unit = makeCombatUnitFromNeutral(draw, `neutral_${index + 1}_${draw.unitDefId.split(".")[1]}`, 0);
    return unit ? [unit] : [];
  });
  placeNeutralUnits(neutralUnits, DEFENDER_BACKLINE, DEFENDER_FRONTLINE);
  for (const unit of neutralUnits) {
    combat.units[unit.id] = unit;
  }

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
    unitDefIds: draws.map((draw) => draw.unitDefId)
  });
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

  const placed = setup.placedUnitIds[action.playerId] ?? [];
  if (placed.length >= setup.unitLimit) {
    throw new Error(`Only ${setup.unitLimit} units may join a combat.`);
  }

  const armyUnit = player.army.find((unit) => unit.id === action.armyUnitId);
  if (!armyUnit || placed.includes(armyUnit.id)) {
    throw new Error("That unit cannot be placed.");
  }

  if (!placementCellsFor(state, action.playerId).includes(action.position)) {
    throw new Error("Units must start on your back or front line.");
  }

  if (Object.values(combat.units).some((unit) => unit.position === action.position)) {
    throw new Error("That space is already taken.");
  }

  const combatUnit = makeCombatUnitFromArmy(
    armyUnit,
    action.playerId,
    `unit_${action.playerId}_${armyUnit.id}`,
    action.position
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

  const cost: ResourceCost = { gold: mageGuild.spellBookCost ?? 5 };
  if (!hasResources(player, cost)) {
    throw new Error("Not enough gold to buy spells.");
  }

  spendResources(state, action.playerId, cost, "spell book");
  player.townTokens.spellBook = false;
  appendEvent(state, { type: "SPELLS_PURCHASED", playerId: action.playerId, cost });

  state.adventure?.rewardQueue.push({
    playerId: action.playerId,
    kind: "shared-deck-search",
    deckId: "spells",
    count: 2
  });
}

export function spendMorale(state: GameState, action: Extract<GameAction, { type: "SPEND_MORALE" }>): void {
  const player = state.players[action.playerId];
  if (!player || player.morale < 1) {
    throw new Error("No positive morale token to spend.");
  }

  player.morale -= 1;
  appendEvent(state, { type: "MORALE_CHANGED", playerId: action.playerId, amount: -1, total: player.morale });

  if (action.benefit === "draw") {
    drawCardsForPlayer(state, action.playerId, 1);
  }
}

export function chooseOption(state: GameState, action: Extract<GameAction, { type: "CHOOSE_OPTION" }>): void {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "OPTION_CHOICE" || choice.id !== action.choiceId || choice.playerId !== action.playerId) {
    throw new Error("That choice cannot be resolved.");
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
  options: { label: string; gold?: number; valuables?: number; movement?: number; reinforceBronzeFree?: boolean }[];
} | null = null;

// ---------------------------------------------------------------------------
// Turn and round flow
// ---------------------------------------------------------------------------

export function endTurnAdventure(state: GameState, action: Extract<GameAction, { type: "END_TURN" }>): void {
  assertActiveTurn(state, action.playerId);
  assertNoPendingInput(state);

  const expired = expireEffectsForTurnEnd(state, action.playerId);
  for (const effect of expired) {
    appendEvent(state, { type: "ACTIVE_EFFECT_EXPIRED", effectId: effect.id, reason: "turn-ended" });
  }

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

    if (reward.kind === "shared-deck-search") {
      const deck = state.decks[reward.deckId];
      if (!deck || deck.drawPile.length + deck.discardPile.length === 0) {
        adventure.rewardQueue.shift();
        continue;
      }

      adventure.rewardQueue.shift();
      const revealedCardIds: string[] = [];
      for (let count = 0; count < reward.count; count += 1) {
        const cardId = deck.drawPile.pop();
        if (!cardId) {
          break;
        }
        revealedCardIds.push(cardId);
      }

      const choiceId = `choice_${state.eventLog.length + 1}`;
      state.pendingChoice = {
        id: choiceId,
        type: "DECK_SEARCH",
        playerId: reward.playerId,
        deckId: reward.deckId,
        revealedCardIds,
        canTakeDiscardTop: deck.discardPile.length > 0,
        returnPhase: "player-turn"
      };
      state.phase = "choice";
      state.priorityPlayerId = reward.playerId;

      appendEvent(state, {
        type: "DECK_SEARCH_STARTED",
        playerId: reward.playerId,
        deckId: reward.deckId,
        choiceId,
        revealedCount: revealedCardIds.length
      });
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

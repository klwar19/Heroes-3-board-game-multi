import { cardLibrary } from "@/data/cards/library";
import { coreBuildingDefinitions, coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { isMarketLocation, locationDefinitions, TRADE_RATES } from "@/data/map/locations";
import { allTileDefinitions } from "@/data/map/tiles";
import {
  addArmyUnit,
  adventurePvpTroopLoss,
  adventureVictoryMode,
  armyHasMapEffect,
  beginFieldVisit,
  canCrossEdge,
  canHeroReachPlacedTile,
  canPlaceTileAt,
  applyBestRecruitDiscount,
  changeMorale,
  classifyHeroStep,
  commitPopulationOnMove,
  consumeRecruitVoucherFor,
  controlsTownOrSettlement,
  createSecondaryHero,
  declareAdventureWinner,
  drawFromNeutralDeck,
  drawGuardArmy,
  effectiveHandLimit,
  eliminatePlayer,
  finalizeStartOfTurnHand,
  fieldLayer,
  recomputeSubterraneanGates,
  tileLayer,
  ELIMINATION_GRACE_TURNS,
  refreshEliminationClock,
  RESOURCE_GAIN_LEVEL_AMOUNTS,
  RETREAT_GOLD_COST,
  SURRENDER_GOLD_COST,
  getSecondaryHero,
  humanPlayerIds,
  requiredHeroDefeats,
  tryDeliverGrail,
  applyMineFlag,
  applySettlementResource,
  flagField,
  capturableEnemyMinesWithin,
  gainExperience,
  gainResources,
  gainTownCube,
  getActiveAstrologersCard,
  getAdjacentSpaceIds,
  type RecruitPurchaseRef,
  getHeroMovementCapabilities,
  getMainHero,
  getTileFootprintSpaceIds,
  getTownOfPlayer,
  getUnitSide,
  hasRecruitResources,
  hasResources,
  heroAtSpace,
  instantiateTile,
  isFieldGuarded,
  isOuterEdgeSealed,
  seaStepHalts,
  makeCombatUnitFromArmy,
  makeCombatUnitFromNeutral,
  materializeTileFields,
  MAX_EXPERIENCE,
  NEUTRAL_DECK_IDS,
  placeNeutralUnits,
  playerDwellingTiers,
  processPendingVisit,
  queueExplorersEmpower,
  queueSkeletonReinforce,
  reinforceArmyUnit,
  reinforceCostFor,
  restoreStartingArmyIfEmpty,
  SCHOLAR_STAT_CARDS,
  spendRecruitResources,
  spendResources,
  startAdventureRound,
  startPlayerTurn,
  swapNeutralDraw,
  townHasBuildingEffect,
  unlockedRecruitTiers,
  victoryModeCountsHeroDefeats,
  type NeutralDraw
} from "./adventure";
import { ATTACK_DIE_FACES } from "./battlefield";
import { pvpEscapeWindowOpen } from "./combat-units";
import { makeActiveEffect, playerCannotSurrenderCombat } from "./active-effects";
import { assignCombatBoardArt } from "./combat-board-art";
import { cardCanBoostPower } from "./effects";
import { createSeededRandom } from "./random";
import {
  destroyFortification,
  intactFortificationPositions,
  isArrowTowerUnit,
  makeArrowTowerUnit,
  SIEGE_ROW_POSITIONS
} from "./siege";
import { drawCardsForPlayer, shuffleCards } from "./decks";
import { getCombatStartDraws } from "./unit-abilities";
import { appendEvent, eventSeedNumber, nextEventNumber } from "./events";
import { applyPermanentCombatEffects, resolveWarMachineOption, startWarMachineRound } from "./permanents";
import {
  activeSchoolFetches,
  applySearchCountEffects,
  canAcquireSharedDeckCard,
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
import {
  hexDistance,
  hexEquals,
  hexNeighbor,
  hexSpaceId,
  parseHexSpaceId,
  tileCentersAdjacent,
  tileCentersOverlap,
  tileFootprint,
  tileLatticeNeighbors,
  type HexCoord
} from "./hex";
import type {
  ArmyUnitState,
  CardDefinition,
  CardId,
  CombatState,
  GameAction,
  GameState,
  HeroId,
  HeroState,
  MapFieldState,
  MapSpaceId,
  MapTileState,
  PlayerId,
  PlayerState,
  ResourceCost,
  ResourceKind,
  SpellSchool,
  VisitStep
} from "./state";
import { NEUTRAL_PLAYER_ID } from "./state";


/** First built town building of this player carrying the given effect type. */
function findTownBuildingWithEffect(
  state: GameState,
  playerId: PlayerId,
  effectType: string
): string | null {
  const town = getTownOfPlayer(state, playerId);
  for (const buildingId of town?.buildings ?? []) {
    if (coreBuildingDefinitions[buildingId]?.effect?.type === effectType) {
      return buildingId;
    }
  }
  return null;
}

/** Discards one random card from the target player's hand (seeded). */
function discardRandomCard(
  state: GameState,
  byPlayerId: PlayerId,
  buildingId: string,
  targetPlayerId: PlayerId,
  buildingName: string
): void {
  const target = state.players[targetPlayerId];
  if (!target || target.hand.length === 0) {
    return;
  }

  const random = createSeededRandom(`${state.seed}#random-discard#${eventSeedNumber(state)}`);
  const index = random.nextInt(0, target.hand.length - 1);
  const [stolen] = target.hand.splice(index, 1);
  target.discard.push(stolen);

  appendEvent(state, {
    type: "TOWN_BUILDING_USED",
    playerId: byPlayerId,
    buildingId,
    message: `${buildingName} discards a random card from ${target.name}'s hand.`
  });
}

/** Tavern: the chosen enemy discards 1 random card from their hand (seeded). */
function discardRandomHandCard(state: GameState, targetPlayerId: PlayerId): void {
  const target = state.players[targetPlayerId];
  if (!target || target.hand.length === 0) {
    return;
  }

  const random = createSeededRandom(`${state.seed}#tavern-discard#${eventSeedNumber(state)}`);
  const index = random.nextInt(0, target.hand.length - 1);
  const [discarded] = target.hand.splice(index, 1);
  target.discard.push(discarded);

  appendEvent(state, { type: "HAND_REFRESHED", playerId: targetPlayerId, discarded: 1, drawn: 0 });
}


/**
 * Earthquake / Ballistics: the player picks which Wall (or the Gate) falls.
 * Re-opens itself while removals remain and fortifications still stand.
 */
export function openSiegeDemolishChoice(state: GameState, playerId: PlayerId, remaining: number): void {
  const siege = state.combat?.siege;
  if (!siege || remaining <= 0) {
    return;
  }

  const positions = intactFortificationPositions(siege);
  if (positions.length === 0) {
    return;
  }

  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt: `Choose a fortification to destroy${remaining > 1 ? ` (${remaining} left)` : ""}`,
    options: positions.map((position) => ({
      label: siege.gatePosition === position
        ? `Destroy the Gate (column ${String.fromCharCode(65 + (position % 4))})`
        : `Destroy the Wall at column ${String.fromCharCode(65 + (position % 4))}`
    })),
    context: "siege-demolish",
    siegeDemolish: { positions, remaining },
    returnPhase: "combat"
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
}

/** Resolves one siege-demolish pick, chaining while removals remain. */
export function resolveSiegeDemolishChoice(state: GameState, playerId: PlayerId, optionIndex: number): void {
  const choice = state.pendingChoice;
  if (choice?.type !== "OPTION_CHOICE" || choice.context !== "siege-demolish" || !choice.siegeDemolish) {
    throw new Error("There is no fortification choice to resolve.");
  }

  const siege = state.combat?.siege;
  const position = choice.siegeDemolish.positions[optionIndex];
  if (!siege || position === undefined) {
    throw new Error("Pick one of the standing fortifications.");
  }

  state.pendingChoice = null;
  state.phase = "combat";
  state.priorityPlayerId = null;

  destroyFortification(state, null, siege.gatePosition === position ? "gate" : "wall", position);

  const remaining = choice.siegeDemolish.remaining - 1;
  if (remaining > 0 && intactFortificationPositions(siege).length > 0) {
    openSiegeDemolishChoice(state, playerId, remaining);
  }
}

/** Column letter (A–D) for a battlefield position, for choice prompts. */
function columnLetter(position: number): string {
  return String.fromCharCode(65 + (position % 4));
}

/**
 * Every obstacle the Remove Obstacle spell may lift off the board right now: the
 * random obstacle markers, any battlefield token (Force Field, Fire Wall,
 * Quicksand, Land Mine), and any standing siege Wall or Gate. Units are never
 * obstacles here (they only block movement), so they are excluded — matching the
 * card's note that only obstacles (Walls, the Gate, markers and effect tokens)
 * can be removed.
 */
function removableObstacleItems(
  combat: CombatState
): { position: number; kind: "obstacle" | "wall" | "gate" | "token"; tokenId?: string }[] {
  const items: { position: number; kind: "obstacle" | "wall" | "gate" | "token"; tokenId?: string }[] = [];
  for (const position of combat.obstacles ?? []) {
    items.push({ position, kind: "obstacle" });
  }
  for (const token of combat.battlefieldTokens ?? []) {
    items.push({ position: token.position, kind: "token", tokenId: token.id });
  }
  const siege = combat.siege;
  if (siege) {
    for (const position of siege.walls) {
      items.push({ position, kind: "wall" });
    }
    if (siege.gatePosition !== null) {
      items.push({ position: siege.gatePosition, kind: "gate" });
    }
  }
  return items;
}

/** Display name for a battlefield token kind, for the Remove Obstacle prompt. */
const BATTLEFIELD_TOKEN_LABELS: Record<string, string> = {
  force_field: "Force Field",
  fire_wall: "Fire Wall",
  quicksand: "Quicksand",
  land_mine: "Land Mine"
};

/**
 * Remove Obstacle: the caster removes obstacles one at a time, up to the Power
 * paid (0/1/2 -> 1/2/3). A no-op when nothing removable stands (the legal-action
 * layer already withholds the cast in that case, so this only guards re-entry).
 */
export function openRemoveObstacleChoice(state: GameState, playerId: PlayerId, count: number): void {
  const combat = state.combat;
  if (!combat || count <= 0) {
    return;
  }

  const items = removableObstacleItems(combat);
  if (items.length === 0) {
    return;
  }

  const labelFor = (item: { position: number; kind: "obstacle" | "wall" | "gate" | "token"; tokenId?: string }): string => {
    const where = `column ${columnLetter(item.position)}, row ${Math.floor(item.position / 4) + 1}`;
    if (item.kind === "gate") {
      return `Remove the Gate (column ${columnLetter(item.position)})`;
    }
    if (item.kind === "wall") {
      return `Remove the Wall at column ${columnLetter(item.position)}`;
    }
    if (item.kind === "token") {
      const token = combat.battlefieldTokens?.find((candidate) => candidate.id === item.tokenId);
      const name = token ? (BATTLEFIELD_TOKEN_LABELS[token.kind] ?? "obstacle") : "obstacle";
      return `Remove the ${name} at ${where}`;
    }
    return `Remove the obstacle at ${where}`;
  };

  const remaining = Math.min(count, items.length);
  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt: `Choose an obstacle to remove${remaining > 1 ? ` (${remaining} left)` : ""}`,
    options: items.map((item) => ({ label: labelFor(item) })),
    context: "remove-obstacle",
    removeObstacle: { items, remaining },
    returnPhase: "combat"
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
}

/** Resolves one Remove Obstacle pick, chaining while removals remain. */
export function resolveRemoveObstacleChoice(state: GameState, playerId: PlayerId, optionIndex: number): void {
  const choice = state.pendingChoice;
  if (choice?.type !== "OPTION_CHOICE" || choice.context !== "remove-obstacle" || !choice.removeObstacle) {
    throw new Error("There is no obstacle choice to resolve.");
  }

  const combat = state.combat;
  const item = choice.removeObstacle.items[optionIndex];
  if (!combat || !item) {
    throw new Error("Pick one of the standing obstacles.");
  }

  state.pendingChoice = null;
  state.phase = "combat";
  state.priorityPlayerId = null;

  if (item.kind === "obstacle") {
    combat.obstacles = (combat.obstacles ?? []).filter((position) => position !== item.position);
    appendEvent(state, {
      type: "COMBAT_OBSTACLE_REMOVED",
      playerId,
      position: item.position
    });
  } else if (item.kind === "token") {
    // Lift the Force Field / Fire Wall / Quicksand / Land Mine token off the
    // board; the crumble cue plays on its cell like an obstacle marker.
    combat.battlefieldTokens = (combat.battlefieldTokens ?? []).filter((token) => token.id !== item.tokenId);
    appendEvent(state, {
      type: "COMBAT_OBSTACLE_REMOVED",
      playerId,
      position: item.position
    });
  } else {
    // Walls and the Gate go down through the shared fortification path (events,
    // Arrow-Tower collapse check), exactly like Earthquake / Ballistics.
    destroyFortification(state, null, item.kind, item.position);
  }

  const remaining = choice.removeObstacle.remaining - 1;
  if (remaining > 0 && combat && removableObstacleItems(combat).length > 0) {
    openRemoveObstacleChoice(state, playerId, remaining);
  }
}

/**
 * Neutral Skeletons: a mid-combat pop-up offering the attacker's Necropolis
 * hero a free Few→Pack flip of any one of their bronze units. Skippable; a
 * no-op (no choice opened) when there is no eligible bronze Few unit.
 */
export function openSkeletonReinforceChoice(state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  if (!player) {
    return;
  }
  const armyUnitIds: string[] = [];
  for (const unit of player.army) {
    if (unit.side !== "few") {
      continue;
    }
    const def = coreUnitDefinitions[unit.unitDefId];
    const packSide = getUnitSide(unit.unitDefId, "pack");
    if (def && packSide && def.tier === "bronze") {
      armyUnitIds.push(unit.id);
    }
  }
  if (armyUnitIds.length === 0) {
    return;
  }

  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt: "Skeletons defeated: reinforce one of your bronze units for free.",
    options: [
      ...armyUnitIds.map((id) => {
        const unitDefId = player.army.find((unit) => unit.id === id)?.unitDefId ?? "";
        return { label: `Reinforce ${coreUnitDefinitions[unitDefId]?.name ?? "unit"} (free)` };
      }),
      { label: "Skip" }
    ],
    context: "skeleton-reinforce",
    skeletonReinforce: { armyUnitIds },
    returnPhase: "combat"
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
}

/** Resolves the Skeletons reinforce pick — a free Few→Pack flip — or skip. */
export function resolveSkeletonReinforceChoice(state: GameState, playerId: PlayerId, optionIndex: number): void {
  const choice = state.pendingChoice;
  if (choice?.type !== "OPTION_CHOICE" || choice.context !== "skeleton-reinforce" || !choice.skeletonReinforce) {
    throw new Error("There is no Skeletons reinforce choice to resolve.");
  }

  const armyUnitId = choice.skeletonReinforce.armyUnitIds[optionIndex];
  state.pendingChoice = null;
  state.phase = choice.returnPhase;
  state.priorityPlayerId = null;

  if (armyUnitId) {
    reinforceArmyUnit(state, playerId, armyUnitId, false, false, false, true);
  }
}

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

  if (state.adventure?.pendingNecromancy) {
    throw new Error("Resolve the after-combat Necromancy window first (play it or skip it).");
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
  const player = state.players[playerId];
  if (player?.needsHandRefresh) {
    throw new Error("Discard down to your hand limit before acting.");
  }
  // Taking a map/exploration action ends the start-of-turn draw window: the
  // discard-and-draw choice only stands before the player begins their turn.
  if (player?.canMulligan) {
    player.canMulligan = false;
  }
}

// ---------------------------------------------------------------------------
// Hand refresh (the start-of-turn discard/draw step)
// ---------------------------------------------------------------------------

/**
 * Resolves the start-of-turn hand step: discards the cards the player chose
 * (if any) and then draws back up to the hand limit, in that order (rulebook:
 * "may discard any number of hand cards, then draws up to hand limit"). This is
 * the single, mutually-exclusive choice the player makes at the start of their
 * turn — "draw new" is an empty `discardCardIds`, "discard and draw new" lists
 * the cards to throw away. It is offered every turn (including the first) and
 * also covers discarding down when the hand is over the limit.
 */
export function refreshHand(state: GameState, action: Extract<GameAction, { type: "REFRESH_HAND" }>): void {
  const player = state.players[action.playerId];
  if (!player) {
    throw new Error("Unknown player.");
  }

  assertActiveTurn(state, action.playerId);

  if (!player.needsHandRefresh && !player.canMulligan) {
    throw new Error("The hand is only drawn at the start of your turn (spend morale to draw at other times).");
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

  // Discard first, then draw back up to the hand limit — one card flow, never
  // a draw-to-limit followed by a separate swap, so the player can never both
  // "draw new" and "discard and draw new" in the same turn.
  const toDraw = Math.max(0, limit - player.hand.length);
  const drawn = toDraw > 0 ? drawCardsForPlayer(state, action.playerId, toDraw) : 0;
  player.needsHandRefresh = false;
  // The once-per-turn start-of-turn draw is now spent.
  player.canMulligan = false;

  appendEvent(state, {
    type: "HAND_REFRESHED",
    playerId: action.playerId,
    discarded: action.discardCardIds.length,
    drawn
  });

  // Explorers (Astrologers): "for every 3 cards discarded this way, Remove a
  // Statistic card and replace it with an Empowered Statistic of the same type."
  // The discard-and-draw above is the standard start-of-turn refresh; this is the
  // card's added effect, keyed off how many cards the player chose to discard.
  const explorers = getActiveAstrologersCard(state)?.effect;
  if (explorers?.type === "EMPOWER_PER_DISCARD" && explorers.per > 0) {
    queueExplorersEmpower(state, action.playerId, Math.floor(action.discardCardIds.length / explorers.per));
  }
}

// ---------------------------------------------------------------------------
// Map movement
// ---------------------------------------------------------------------------

export function getHeroMoveDestinations(state: GameState, hero: HeroState): MapSpaceId[] {
  const adventure = state.adventure;
  if (!adventure || !hero.spaceId || hero.movementPoints <= 0 || hero.movementHaltedThisTurn) {
    return [];
  }

  const movement = getHeroMovementCapabilities(state, hero);
  return getAdjacentSpaceIds(hero.spaceId).filter((spaceId) => {
    if (!canCrossEdge(state, hero.spaceId as MapSpaceId, spaceId, movement)) {
      return false;
    }

    // A single step must end on a field the hero can stop on: "open" empty
    // fields, "stop" fields (guards, enemy heroes, locations), and Pathfinding
    // "encounter" fields (a Neutral/enemy field the hero may end on to start
    // Combat). Blocked fields crossed by Fly are "pass-only" (you fly over but
    // cannot land), and allied heroes / sanctuaries are "pass-only" too — none
    // are valid stops.
    const kind = classifyHeroStep(state, hero, spaceId, movement);
    return kind === "open" || kind === "stop" || kind === "encounter";
  });
}

/**
 * Executes one paid step onto an adjacent field and resolves what lives
 * there: enemy heroes start a combat, guards start a neutral encounter,
 * everything else is visited. `passThrough` steps (crossing an allied hero)
 * move without visiting, as the rulebook prescribes.
 */
function performHeroStep(state: GameState, hero: HeroState, to: MapSpaceId, passThrough: boolean): void {
  requireAdventure(state);
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
  commitPopulationOnMove(state, hero.controllerId);

  haltAfterSeaStep(state, hero, from, to);

  if (passThrough) {
    return;
  }

  resolveHeroArrival(state, hero, to);
}

/**
 * Any step that touches the open sea — wading in, wading out, or moving within
 * it — ends a hero's movement for the turn unless they are Water Walking. The
 * hero keeps their remaining movement points (so a neutral combat on a sea
 * field can still spend them to continue) but cannot take another step; with
 * Water Walk they move across the sea freely.
 */
function haltAfterSeaStep(state: GameState, hero: HeroState, from: MapSpaceId, to: MapSpaceId): void {
  if (seaStepHalts(state, from, to, getHeroMovementCapabilities(state, hero))) {
    hero.movementHaltedThisTurn = true;
  }
}

/**
 * Resolves what the hero finds on the field it has just arrived on — whether it
 * walked there one step or was teleported by Dimension Door: an enemy hero or
 * undefeated guards start a combat, an enemy Town/Settlement opens the garrison
 * decision, the Grail may be delivered home, otherwise the field is visited.
 * The hero's position is assumed to already be `to`.
 */
function resolveHeroArrival(state: GameState, hero: HeroState, to: MapSpaceId): void {
  const adventure = requireAdventure(state);

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

  // Attacking an enemy Town/Settlement whose hero is elsewhere: the owner may
  // pay 8 gold to defend with units only ("you cannot use your Deck during
  // this Combat, as your Main Hero is not present").
  if (openGarrisonPromptIfNeeded(state, hero, field)) {
    return;
  }

  // Grail Hunt: carrying the Grail home onto your own town wins the game.
  if (tryDeliverGrail(state, hero)) {
    return;
  }

  beginFieldVisit(state, hero.id, to, false);
}

/** Whether this field is an enemy town or settlement the owner may garrison. */
function garrisonDefenderFor(state: GameState, attacker: HeroState, field: MapFieldState): PlayerId | null {
  const location = locationDefinitions[field.location];
  const isTown = location?.category === "town";
  const isSettlement = field.location === "settlement";
  // Dragon Conqueror: a captured Dragon Utopia is defended like a stronghold;
  // its holder may garrison it (8 gold) when their hero is away.
  const isCapturedUtopia =
    field.location === "dragon_utopia" &&
    adventureVictoryMode(state) === "dragon-conqueror" &&
    Boolean(field.flagOwnerId);
  if (!isTown && !isSettlement && !isCapturedUtopia) {
    return null;
  }

  // Whoever currently holds the field defends it. A flagged (already conquered)
  // Town is defended by its conqueror, not by the original `controllerId`.
  const ownerId = isTown
    ? field.flagOwnerId ??
      Object.values(state.towns).find((town) => town.fieldId === field.spaceId)?.controllerId ??
      null
    : field.flagOwnerId;
  if (!ownerId || ownerId === attacker.controllerId || ownerId === NEUTRAL_PLAYER_ID) {
    return null;
  }

  const owner = state.players[ownerId];
  if (!owner || owner.army.length === 0) {
    return null;
  }

  return ownerId;
}

/** Opens the 8-gold garrison decision for the town owner; true when waiting. */
function openGarrisonPromptIfNeeded(state: GameState, attacker: HeroState, field: MapFieldState): boolean {
  const adventure = requireAdventure(state);
  const defenderId = garrisonDefenderFor(state, attacker, field);
  if (!defenderId) {
    return false;
  }

  const defender = state.players[defenderId];
  if (!defender || defender.resources.gold < 8) {
    // The owner cannot pay the defense fee — the field falls undefended.
    return false;
  }

  adventure.pendingGarrison = {
    attackerPlayerId: attacker.controllerId,
    attackerHeroId: attacker.id,
    defenderPlayerId: defenderId,
    fieldId: field.spaceId
  };

  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId: defenderId,
    prompt: `${state.players[attacker.controllerId]?.name ?? "An enemy"} attacks your ${
      field.location === "dragon_utopia"
        ? "Dragon Utopia"
        : locationDefinitions[field.location]?.category === "town"
          ? "town"
          : "settlement"
    } — pay 8 gold to defend with your units (no cards, your hero is away)?`,
    options: [{ label: "Pay 8 gold and defend" }, { label: "Let it fall" }],
    context: "garrison",
    returnPhase: "player-turn"
  };
  state.phase = "choice";
  state.priorityPlayerId = defenderId;
  return true;
}

/** Resolves the garrison decision (CHOOSE_OPTION context "garrison"). */
export function resolveGarrisonChoice(state: GameState, playerId: PlayerId, optionIndex: number): void {
  const adventure = requireAdventure(state);
  const pending = adventure.pendingGarrison;
  if (!pending || pending.defenderPlayerId !== playerId) {
    throw new Error("There is no garrison decision to make.");
  }

  adventure.pendingGarrison = null;
  state.pendingChoice = null;
  const attackerHero = state.heroes[pending.attackerHeroId];

  if (optionIndex !== 0 || !attackerHero) {
    // Undefended: the visit resolves as if nobody had garrisoned.
    state.phase = "player-turn";
    state.priorityPlayerId = null;
    state.activePlayerId = pending.attackerPlayerId;
    if (attackerHero) {
      beginFieldVisit(state, attackerHero.id, pending.fieldId, false);
    }
    return;
  }

  spendResources(state, playerId, { gold: 8 }, "garrison defense");
  startPlayerCombat(state, attackerHero, null, pending.fieldId, playerId);
}

// ---------------------------------------------------------------------------
// Dimension Door (map spell: teleport the hero, ignoring obstacles)
// ---------------------------------------------------------------------------

/**
 * Relocates a hero onto `to` without spending movement (the Spell is the cost)
 * and resolves the destination exactly like a normal arrival — guards or an
 * enemy hero there start a combat, a location is visited. Used by Dimension
 * Door's "resolve the last one normally".
 */
function dimensionDoorTeleport(state: GameState, hero: HeroState, to: MapSpaceId): void {
  const from = hero.spaceId ?? to;
  hero.spaceId = to;
  appendEvent(state, {
    type: "HERO_MOVED",
    playerId: hero.controllerId,
    heroId: hero.id,
    from,
    to,
    movementLeft: hero.movementPoints
  });
  commitPopulationOnMove(state, hero.controllerId);
  // A teleport that touches the sea halts further movement, like a sea step.
  haltAfterSeaStep(state, hero, from, to);
  resolveHeroArrival(state, hero, to);
}

/**
 * Dimension Door candidates: every revealed field within `range` hexes of the
 * hero (straight-line hex distance, ignoring obstacles and the fields
 * in-between) other than the hero's own field, that the hero could resolve
 * normally on arrival — an empty field or a "stopping" field (guards, an enemy
 * hero, a location, or the open sea, which lands the hero and halts them).
 * Blocked fields and fields holding an allied hero are not valid landings.
 */
function dimensionDoorDestinations(state: GameState, hero: HeroState, range: number): MapSpaceId[] {
  const adventure = state.adventure;
  const origin = hero.spaceId ? parseHexSpaceId(hero.spaceId) : null;
  if (!adventure || !origin || range <= 0) {
    return [];
  }

  const movement = getHeroMovementCapabilities(state, hero);
  const heroLayer = fieldLayer(state, hero.spaceId);
  const destinations: MapSpaceId[] = [];
  for (const spaceId of Object.keys(adventure.fields)) {
    if (spaceId === hero.spaceId) {
      continue;
    }
    const coord = parseHexSpaceId(spaceId);
    if (!coord || hexDistance(origin, coord) > range) {
      continue;
    }
    // Dimension Door cannot breach the Surface↔Subterranean divide — only a
    // Subterranean Gate or a Town Portal Spell may. Keep its reach on the
    // hero's own layer.
    if (fieldLayer(state, spaceId) !== heroLayer) {
      continue;
    }
    const kind = classifyHeroStep(state, hero, spaceId, movement);
    // A teleport lands and resolves the field, so a Pathfinding "encounter"
    // (Neutral/enemy) is a valid target exactly like a plain "stop".
    if (kind === "open" || kind === "stop" || kind === "encounter") {
      destinations.push(spaceId);
    }
  }
  return destinations;
}

/**
 * Opens the Dimension Door destination choice after the spell is played. With
 * no reachable destination the spell fizzles (the card is already spent),
 * mirroring how Town Portal returns when the player controls no other town.
 */
export function openDimensionDoorChoice(state: GameState, playerId: PlayerId, range: number): void {
  const adventure = state.adventure;
  const hero = getMainHero(state, playerId);
  if (!adventure || !hero || !hero.spaceId) {
    return;
  }

  const destinations = dimensionDoorDestinations(state, hero, range);
  if (destinations.length === 0) {
    return;
  }

  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt: `Dimension Door: move your hero up to ${range} field${range === 1 ? "" : "s"} to…`,
    options: [
      ...destinations.map((spaceId) => ({ label: `Teleport to ${spaceId}` })),
      { label: "Cancel (stay)" }
    ],
    context: "dimension-door",
    dimensionDoor: { heroId: hero.id, destinations },
    returnPhase: "player-turn"
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
}

/** Resolves the Dimension Door destination choice (CHOOSE_OPTION). */
export function resolveDimensionDoorChoice(state: GameState, playerId: PlayerId, optionIndex: number): void {
  const choice = state.pendingChoice;
  const pending = choice?.type === "OPTION_CHOICE" ? choice.dimensionDoor : undefined;
  if (!pending) {
    throw new Error("There is no Dimension Door to resolve.");
  }

  state.pendingChoice = null;
  state.phase = "player-turn";
  state.priorityPlayerId = null;

  const hero = state.heroes[pending.heroId];
  // The trailing option is "Cancel (stay)", which carries no destination.
  const destination = pending.destinations[optionIndex];
  if (!hero || !destination) {
    return;
  }

  dimensionDoorTeleport(state, hero, destination);
}

/** Friendly Mine label for the View Earth option list. */
function resourceMineLabel(resource: ResourceKind | undefined): string {
  if (resource === "buildingMaterials") {
    return "Building Materials";
  }
  if (resource === "valuables") {
    return "Valuables";
  }
  return "Gold";
}

/**
 * Opens the View Earth Mine choice after the spell is played. The candidate
 * enemy Mines in reach are gathered by the same helper the legal-action gate
 * used, so the offer and the capture stay in lockstep. With none in reach the
 * spell fizzles (the card is already spent), mirroring Dimension Door / Town
 * Portal returning when there is no legal target.
 */
export function openViewEarthChoice(state: GameState, playerId: PlayerId, range: number): void {
  const adventure = state.adventure;
  const hero = getMainHero(state, playerId);
  if (!adventure || !hero || !hero.spaceId) {
    return;
  }

  const mineSpaceIds = capturableEnemyMinesWithin(state, playerId, range);
  if (mineSpaceIds.length === 0) {
    return;
  }

  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt: `View Earth: capture an enemy Mine within ${range} field${range === 1 ? "" : "s"}…`,
    options: [
      ...mineSpaceIds.map((spaceId) => ({
        label: `Capture the ${resourceMineLabel(adventure.fields[spaceId]?.resource)} Mine at ${spaceId}`
      })),
      { label: "Cancel (no capture)" }
    ],
    context: "view-earth",
    viewEarth: { heroId: hero.id, mineSpaceIds },
    returnPhase: "player-turn"
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
}

/** Resolves the View Earth Mine choice (CHOOSE_OPTION context "view-earth"). */
export function resolveViewEarthChoice(state: GameState, playerId: PlayerId, optionIndex: number): void {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "OPTION_CHOICE" || !choice.viewEarth) {
    throw new Error("There is no View Earth to resolve.");
  }
  const pending = choice.viewEarth;

  state.pendingChoice = null;
  state.phase = choice.returnPhase;
  state.priorityPlayerId = null;

  // The trailing "Cancel" option carries no Mine.
  const mineSpaceId = pending.mineSpaceIds[optionIndex];
  if (!state.adventure || !mineSpaceId) {
    return;
  }

  const field = state.adventure.fields[mineSpaceId];
  // Re-verify the Mine is still an enemy's at resolution (state cannot change
  // mid-choice today, but this keeps the capture honest if that ever changes).
  if (field && field.location === "mine" && field.flagOwnerId && field.flagOwnerId !== playerId) {
    applyMineFlag(state, playerId, field);
  }
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

  if (hero.movementHaltedThisTurn) {
    throw new Error("That hero waded into the sea and cannot move further this turn.");
  }

  if (!getHeroMoveDestinations(state, hero).includes(action.to)) {
    throw new Error("Heroes can only move to adjacent, passable fields.");
  }

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

  if (hero.movementHaltedThisTurn) {
    throw new Error("That hero waded into the sea and cannot move further this turn.");
  }

  // Validate the whole path before moving: consecutive, crossable, and only
  // the final field may stop the hero. Fly / Water Walk effects active this
  // turn open extra edges (through blocked fields, onto the sea).
  const movement = getHeroMovementCapabilities(state, hero);
  let cursor = hero.spaceId;
  for (const [index, step] of action.path.entries()) {
    if (!getAdjacentSpaceIds(cursor).includes(step)) {
      throw new Error("Each path step must be adjacent to the previous field.");
    }
    if (!canCrossEdge(state, cursor, step, movement)) {
      throw new Error("The path crosses a sealed tile border, a blocked field, or open sea.");
    }

    const kind = classifyHeroStep(state, hero, step, movement);
    const isLast = index === action.path.length - 1;
    if (kind === "block") {
      throw new Error("The path crosses an impassable field.");
    }
    if (kind === "stop" && !isLast) {
      throw new Error("A field along the path would stop the hero; walk there first.");
    }
    // A sea-touching step (without Water Walk) halts the hero, so it can only be
    // the final step of the walk.
    if (seaStepHalts(state, cursor, step, movement) && !isLast) {
      throw new Error("The hero would be halted at the sea; that step must be the last of the walk.");
    }
    if (kind === "pass-only" && isLast) {
      throw new Error("The walk cannot end on a field the hero can only pass through.");
    }
    cursor = step;
  }


  for (const [index, step] of action.path.entries()) {
    if (hero.movementPoints <= 0) {
      break;
    }

    const kind = classifyHeroStep(state, hero, step, movement);
    const isLast = index === action.path.length - 1;
    // Pass over a field without resolving it when it only allows passage
    // ("pass-only"), or when Pathfinding lets the hero walk through a
    // Neutral/enemy field ("encounter") that is not where the walk ends.
    // Ending on an "encounter" resolves normally — Combat begins.
    const passThrough = kind === "pass-only" || (kind === "encounter" && !isLast);
    performHeroStep(state, hero, step, passThrough);

    // Wading into/out of the sea ends the walk even if points remain.
    if (hero.movementHaltedThisTurn || heroStepNeedsInput(state)) {
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
    throw new Error(field.grailDiggable ? "Digging the Grail costs 1 movement point." : "Revisiting costs 1 movement point.");
  }

  // Revisitable fields and a cleared Grail field (which is dug for 1 MP).
  if (locationDefinitions[field.location]?.category !== "revisitable" && !field.grailDiggable) {
    throw new Error("Only revisitable fields can be visited again.");
  }

  hero.movementPoints -= 1;
  beginFieldVisit(state, hero.id, hero.spaceId, true);
}

/**
 * Opens the Market (Trading Post / War Machine Factory) panel for a hero parked
 * on a market field. Unlike REVISIT_FIELD this is free and repeatable: as long
 * as one of the player's heroes (Main or Secondary) stays on the tile, the
 * player can reopen the market at will. The rulebook's "one non-trade action
 * per visit" rule still applies inside each opened visit.
 */
export function openMarket(state: GameState, action: Extract<GameAction, { type: "OPEN_MARKET" }>): void {
  const adventure = requireAdventure(state);
  assertActiveTurn(state, action.playerId);
  assertHandRefreshed(state, action.playerId);
  assertNoPendingInput(state);

  const hero = requireHero(state, action.playerId, action.heroId);
  const field = hero.spaceId ? adventure.fields[hero.spaceId] : undefined;
  if (!hero.spaceId || !field) {
    throw new Error("That hero is not on a field.");
  }

  if (!isMarketLocation(field.location)) {
    throw new Error("That hero is not standing on a Market.");
  }

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

  // "You may not discover a Subterranean Map Tile while standing on a Surface
  // Map Tile and vice versa." Crossing the divide is only possible by entering a
  // Subterranean Gate, which reveals the far tile for free on its own.
  if (tileLayer(tile) !== fieldLayer(state, hero.spaceId)) {
    throw new Error("You can't discover across the Surface/Subterranean divide — enter a Subterranean Gate instead.");
  }

  // Ordinary discovery needs an OPEN border: the hero's field edge toward the
  // tile must not be a printed yellow line. (The Redwood Observatory and the
  // Speculum artifact are the only ways to reveal across a sealed border.)
  const heroField = adventure.fields[hero.spaceId];
  if (!heroField || isOuterEdgeSealed(adventure, heroField)) {
    throw new Error(
      "A yellow border line seals this edge — move to an open border, or use a Redwood Observatory / Speculum to discover across it."
    );
  }

  beginTileRotation(state, playerId, tile, "reveal");
}

/**
 * Flips a tile face up and hands the rotation choice to the player ("You may
 * always rotate Map Tiles when placing or revealing them"). Fields only
 * materialize once SET_TILE_ROTATION confirms the orientation.
 */
function beginTileRotation(
  state: GameState,
  playerId: PlayerId,
  tile: MapTileState,
  kind: "reveal" | "place",
  heroId?: HeroId
): void {
  const adventure = requireAdventure(state);
  tile.faceDown = false;
  tile.awaitingRotation = true;
  adventure.pendingTileChoice = { tileInstanceId: tile.id, playerId, kind, ...(heroId ? { heroId } : {}) };

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
      if (isOuterEdgeSealed(adventure, neighborField)) {
        continue;
      }

      return true;
    }
  }

  return false;
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

  // A placed Far tile — or a tile opened through a Redwood Observatory — must
  // keep a doorway the opening hero can cross onto, in whatever rotation the
  // player settles on. Plain on-foot discoveries carry no heroId and skip this.
  const placingHero = pending.heroId ? state.heroes[pending.heroId] : null;
  if (placingHero) {
    const center = { row: tile.centerRow, col: tile.centerCol };
    const anyReachable = [0, 1, 2, 3, 4, 5].some((candidate) =>
      canHeroReachPlacedTile(state, placingHero, tile.tileDefId, center, candidate)
    );
    if (anyReachable && !canHeroReachPlacedTile(state, placingHero, tile.tileDefId, center, rotation)) {
      throw new Error("Rotate the tile so your hero can cross onto it (a border line is sealing it off).");
    }
  }

  tile.rotation = rotation;
  tile.awaitingRotation = false;
  adventure.pendingTileChoice = null;
  materializeTileFields(adventure, tile);
  // With this tile's fields now on the board, carve any Subterranean Gate it
  // shares with an adjacent tile on the other layer (the surface gate, and the
  // entrance once the underground tile is revealed). Runs after rotation is
  // locked, so the entrance is the nearest hex of the tile "when open".
  recomputeSubterraneanGates(adventure);

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

/**
 * Whether a hero may discover a still-hidden tile under the ORDINARY movement
 * rules ("opening a new map" / placing a Far Ⅱ–Ⅲ tile during your turn): the
 * hero's own field must touch the target tile across an OPEN border — an outer
 * edge that is not sealed by a printed yellow line, on the same Surface/
 * Subterranean layer. This is the "border and edge interaction" the player
 * normally needs.
 *
 * It is deliberately the gate that the Redwood Observatory and the Speculum
 * artifact BYPASS: those discover an adjacent tile with no access requirement —
 * the hero need not be at the tile's edge nor at an unsealed (open) border, so
 * they never call this. Keep the two paths separate.
 */
export function canHeroDiscoverAdjacentTile(state: GameState, hero: HeroState, tile: MapTileState): boolean {
  const adventure = state.adventure;
  if (!adventure || !hero.spaceId || !tile.faceDown) {
    return false;
  }
  const field = adventure.fields[hero.spaceId];
  if (!field) {
    return false;
  }
  // Must be geometrically next to the tile (an edge/ring field touching it),
  // on the hero's own layer…
  if (!isTileAdjacentToSpace(state, tile.id, hero.spaceId)) {
    return false;
  }
  if (tileLayer(tile) !== fieldLayer(state, hero.spaceId)) {
    return false;
  }
  // …and the field's outer edge toward the tile must be an OPEN border. A
  // yellow-sealed arc blocks ordinary discovery (use a Redwood Observatory or
  // Speculum to reveal across it instead).
  return !isOuterEdgeSealed(adventure, field);
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

  // The hero has to be able to cross onto the new tile through some rotation —
  // otherwise its border lines would seal it off and the placement is wasted.
  if (![0, 1, 2, 3, 4, 5].some((rotation) => canHeroReachPlacedTile(state, hero, tileDefId, center, rotation))) {
    throw new Error("Your hero can't cross onto that tile from here — its border lines seal it off. Pick another spot.");
  }

  // A tile may only be added on the hero's own layer: a Surface hero cannot lay
  // down a Subterranean tile or vice versa (same divide as discovery).
  const placedLayer = tileLayer({ group: allTileDefinitions[tileDefId]?.group } as MapTileState);
  if (hero.spaceId && placedLayer !== fieldLayer(state, hero.spaceId)) {
    throw new Error("You can't place a tile across the Surface/Subterranean divide.");
  }

  supply.splice(action.supplyIndex, 1);
  hero.movementPoints -= 1;
  const tile = instantiateTile(adventure, tileDefId, center, 0, false, { materialize: false });
  beginTileRotation(state, action.playerId, tile, "place", hero.id);
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
    case "RESOURCE_GAIN_LEVEL": {
      resolveResourceGainLevel(state, action);
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
      // Trades happen through TRADE_RESOURCES, war machines through
      // BUY_WAR_MACHINE. Picking a hand card here resolves the third printed
      // option — remove one card from the game to gain 1 gold — and ends the
      // visit. The three options exclude each other within one visit.
      if (!action.decline && action.optionIndex !== undefined) {
        if (step.traded) {
          throw new Error("This visit already traded resources — cards cannot be sold too.");
        }
        const player = state.players[action.playerId];
        const sellable = removableHandCards(state, action.playerId, "sellable");
        const chosen = sellable.find(({ index }) => index === action.optionIndex);
        if (!player || !chosen) {
          throw new Error("Specialty, Statistic, starting Ability and Magic Arrow cards cannot be sold.");
        }
        player.hand.splice(chosen.index, 1);
        player.removed.push(chosen.cardId);
        gainResources(state, action.playerId, { gold: 1 }, "sold a card at the Trading Post");
      }
      visit.steps.shift();
      break;
    }
    case "WAR_MACHINE_SHOP": {
      // Purchases go through BUY_WAR_MACHINE; resolving the step here means
      // the player walked out without buying.
      if (!action.decline) {
        throw new Error("Buy a war machine with its own action, or decline.");
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
    case "TAVERN": {
      // "You can pay 7 gold to gain a Secondary Hero. Place their model on this
      // Field. Then, choose one enemy player to discard 1 random card."
      visit.steps.shift();
      if (action.decline) {
        break;
      }
      const player = state.players[action.playerId];
      if (!player) {
        throw new Error("Unknown player at the Tavern.");
      }
      if (getSecondaryHero(state, action.playerId)) {
        throw new Error("You already field a Secondary Hero.");
      }
      const cost = { gold: 7 };
      if (!hasResources(player, cost)) {
        throw new Error("The Tavern costs 7 gold.");
      }
      spendResources(state, action.playerId, cost, "Tavern");
      createSecondaryHero(state, action.playerId, visit.fieldId);
      // optionIndex selects which enemy discards (index into the enemy list);
      // with a single opponent it is just 0.
      const enemies = humanPlayerIds(state).filter((id) => id !== action.playerId);
      const targetId = enemies[action.optionIndex ?? 0];
      if (targetId) {
        discardRandomHandCard(state, targetId);
      }
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

/**
 * Town-conquest reward: the conqueror raises one production track by a single
 * resource-gain level (+5 gold, +2 building materials, or +1 valuables).
 */
function resolveResourceGainLevel(
  state: GameState,
  action: Extract<GameAction, { type: "RESOLVE_VISIT_STEP" }>
): void {
  const player = state.players[action.playerId];
  if (!player) {
    throw new Error("That conquest reward cannot be resolved.");
  }
  const resourceByIndex: ResourceKind[] = ["gold", "buildingMaterials", "valuables"];
  const resource = action.optionIndex !== undefined ? resourceByIndex[action.optionIndex] : undefined;
  if (!resource) {
    throw new Error("Choose which production track to raise by one level.");
  }
  const amount = RESOURCE_GAIN_LEVEL_AMOUNTS[resource];
  player.production[resource] += amount;
  appendEvent(state, { type: "PRODUCTION_CHANGED", playerId: action.playerId, resource, amount });
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

  if (action.optionIndex !== undefined && action.optionIndex <= 2) {
    // Choose a resource income. This path is only reached for the very first
    // flag of the settlement (a settlement that already carries a token is
    // transferred automatically in beginFieldVisit, without a choice).
    // applySettlementResource records the token, raises this player's
    // production by one resource-gain level, and pays the one-time stockpile
    // bonus on the first flag.
    applySettlementResource(state, action.playerId, field, resourceByIndex[action.optionIndex]);
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
  // Half cost (all resources, rounded up) — but a Legion voucher reserved for
  // this unit may make it cheaper still (non-stacking; see reinforceCostFor), so
  // charge the actual best cost. A free first flag charges nothing.
  const cost: ResourceCost = free ? {} : (reinforceCostFor(state, action.playerId, target.id, true, false, false) ?? {});
  if (!free) {
    if (!hasResources(player, cost)) {
      throw new Error("Not enough resources to reinforce at half cost.");
    }
    spendResources(state, action.playerId, cost, "settlement reinforcement");
  }

  target.side = "pack";
  // The reserved Legion voucher (if any) is spent on this unit, win or lose.
  consumeRecruitVoucherFor(state, action.playerId, {
    kind: "reinforce",
    unitDefId: target.unitDefId,
    armyUnitId: target.id
  });
  // A reinforcement places no resource token, so no ongoing income changes
  // hands — the settlement is simply now owned by this player (which also makes
  // it a spawn point and an elimination shield). Flag it and refresh both
  // players' elimination clocks.
  const previousOwnerId = field.flagOwnerId;
  field.everFlagged = true;
  flagField(state, action.playerId, field);
  refreshEliminationClock(state, action.playerId);
  if (previousOwnerId && previousOwnerId !== action.playerId) {
    refreshEliminationClock(state, previousOwnerId);
  }

  appendEvent(state, {
    type: "UNIT_RECRUITED",
    playerId: action.playerId,
    unitDefId: target.unitDefId,
    kind: "reinforce",
    cost
  });
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

  // Take-the-top obeys the acquisition rules: redraw past any card this hero may
  // not take (a duplicate it owns, or Necromancy for a non-Necropolis hero),
  // dropping each onto the deck discard, so a duplicate is never gained.
  if (action.optionIndex !== 1) {
    while (
      deck.drawPile.length > 0 &&
      !canAcquireSharedDeckCard(state, action.playerId, "abilities", deck.drawPile[deck.drawPile.length - 1])
    ) {
      deck.discardPile.push(deck.drawPile.pop() as string);
    }
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
 * Specialty cards (and only cards that belong to a shared deck). "sellable"
 * is the Trading Post rule: any card except Specialty, Statistic, the
 * Starting Ability and Magic Arrows.
 */
export function removableHandCards(
  state: GameState,
  playerId: PlayerId,
  filter: "any" | "ability" | "statistic" | "removable" | "sellable"
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
        case "sellable":
          return (
            kind !== "statistic" &&
            kind !== "hero-specialty" &&
            cardId !== startingAbility &&
            cardId !== "spell.magic_arrow"
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
  const hero = state.heroes[heroId];
  if (!tile || !hero) {
    return;
  }

  // Same adjacency gate as the legal-action list, so optionIndex lines up.
  const targets = observatoryRevealTargets(state, hero, tile);
  const target = targets[action.optionIndex ?? 0];
  if (!target) {
    return;
  }

  // No opening hero is recorded: the Observatory reveals a tile adjacent to its
  // own flower, so the player rotates it freely under the standard placement
  // rules — the visiting hero need not be at the border or able to step onto it.
  beginTileRotation(state, action.playerId, target, "reveal");
}

/**
 * Redwood Observatory: place one of the visiting player's face-down Far (Ⅱ–Ⅲ)
 * supply tiles into an empty slot next to the observatory, for free. The
 * rulebook's "choose 1 tile adjacent to this one" also covers opening a
 * brand-new tile from your supply when no face-down tile is there to flip — at
 * any empty slot adjacent to the observatory's flower that nests gaplessly into
 * the map like any Far placement. The visiting hero does not need to be at the
 * border of that slot or able to step onto it ("no access needed").
 */
export function placeObservatoryTile(
  state: GameState,
  action: Extract<GameAction, { type: "PLACE_OBSERVATORY_TILE" }>
): void {
  const adventure = requireAdventure(state);
  const visit = adventure.pendingVisit;
  const step = visit?.steps[0];
  if (!visit || visit.playerId !== action.playerId || step?.type !== "DISCOVER_ADJACENT_TILE") {
    throw new Error("Placing a Far tile here needs an open Redwood Observatory visit.");
  }
  if (state.pendingChoice) {
    throw new Error("Resolve the pending card choice first.");
  }

  const hero = state.heroes[visit.heroId];
  const observatoryField = adventure.fields[visit.fieldId];
  const observatoryTile = observatoryField ? adventure.tiles[observatoryField.tileInstanceId] : undefined;
  if (!hero || !observatoryField || !observatoryTile) {
    throw new Error("The Redwood Observatory visit is no longer valid.");
  }

  const supply = adventure.playerFarTiles[action.playerId] ?? [];
  const tileDefId = supply[action.supplyIndex];
  if (!tileDefId) {
    throw new Error("That Far tile is not in your supply.");
  }

  const center: HexCoord = { row: action.centerRow, col: action.centerCol };
  const placeable = observatoryPlacementCenters(state, hero, observatoryTile, tileDefId);
  if (!placeable.some((candidate) => hexEquals(candidate, center))) {
    throw new Error(
      "The Observatory can only place a Far tile at an empty slot adjacent to it that nests against two tiles."
    );
  }

  // Free observatory discovery — no movement point is spent. The supply tile
  // leaves the player's hand and lands face up, awaiting its rotation choice.
  // No opening hero is recorded: the tile is rotated freely under the standard
  // placement rules, not constrained to a doorway the visiting hero can cross.
  supply.splice(action.supplyIndex, 1);
  visit.steps.shift();
  const tile = instantiateTile(adventure, tileDefId, center, 0, false, { materialize: false });
  beginTileRotation(state, action.playerId, tile, "place");
  processPendingVisit(state);
}

/**
 * Face-down tiles the Redwood Observatory may flip: tiles whose flower
 * touches the observatory's tile (centers at hex distance 3 - the previous
 * row/column heuristic also matched tiles up to six hexes away). This is the
 * raw geometric set; {@link observatoryRevealTargets} narrows it to the tiles a
 * given hero is actually standing at an open border of.
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

/**
 * Adjacent face-down tiles the Redwood Observatory may flip for the visiting
 * hero: every geometric neighbour (a flower that touches the observatory's tile)
 * on the hero's own layer. Per the rulebook ("choose 1 tile adjacent to this
 * one"), there is NO "stand at an open border" / "be able to step onto it"
 * requirement — the Observatory reveals a tile next to its own flower regardless
 * of yellow borders or where on the flower the hero stands. The only limit is
 * the Surface/Subterranean divide, which the layer filter enforces. (A face-down
 * tile never has a hero on it, so the "no Hero on it" clause is automatic.)
 */
export function observatoryRevealTargets(
  state: GameState,
  hero: HeroState,
  observatoryTile: MapTileState
): MapTileState[] {
  const adventure = state.adventure;
  if (!adventure || !hero.spaceId) {
    return [];
  }
  const heroLayer = fieldLayer(state, hero.spaceId);
  return observatoryDiscoverTargets(adventure, observatoryTile).filter(
    (candidate) => tileLayer(candidate) === heroLayer
  );
}

/**
 * Empty lattice slots next to the observatory where the hero may drop a Far
 * (Ⅱ–Ⅲ) supply tile of the given kind: a gapless neighbour of the observatory's
 * flower that nests against at least two existing tiles, on the hero's layer.
 * The geometry is anchored to the OBSERVATORY tile, not the hero's field —
 * matching the reveal path, the visiting hero need not be at the border of the
 * slot or able to step onto it ("no access needed").
 */
export function observatoryPlacementCenters(
  state: GameState,
  hero: HeroState,
  observatoryTile: MapTileState,
  tileDefId: string
): HexCoord[] {
  const adventure = state.adventure;
  const def = allTileDefinitions[tileDefId];
  if (!adventure || !def || !hero.spaceId) {
    return [];
  }
  const heroLayer = fieldLayer(state, hero.spaceId);
  // A Far tile may only land on the hero's own layer (no cross-divide placing).
  if (tileLayer({ group: def.group } as MapTileState) !== heroLayer) {
    return [];
  }

  const existingCenters = Object.values(adventure.tiles).map((tile) => ({
    row: tile.centerRow,
    col: tile.centerCol
  }));
  const observatoryCenter: HexCoord = { row: observatoryTile.centerRow, col: observatoryTile.centerCol };
  const centers: HexCoord[] = [];
  for (const center of tileLatticeNeighbors(observatoryCenter)) {
    // Standard Map Tile Placement geometry: the slot must be empty (no overlap)
    // and nest gaplessly against at least two existing tiles — the observatory
    // plus one more. The final rotation is confirmed (and connectivity-checked)
    // in SET_TILE_ROTATION, so any geometric slot here has a legal rotation.
    if (existingCenters.some((existing) => tileCentersOverlap(existing, center))) {
      continue;
    }
    const touching = existingCenters.filter((existing) => tileCentersAdjacent(existing, center));
    if (touching.length < 2) {
      continue;
    }
    centers.push(center);
  }
  return centers;
}

export function tradeResources(state: GameState, action: Extract<GameAction, { type: "TRADE_RESOURCES" }>): void {
  const adventure = requireAdventure(state);
  const visit = adventure.pendingVisit;
  const step = visit?.steps[0];
  if (!visit || visit.playerId !== action.playerId || step?.type !== "TRADING_POST") {
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

  // "Choose one": trading any resources locks this visit to the (repeatable)
  // resource-trade option — no card selling or war machine buying after it.
  step.traded = true;
  spendResources(state, action.playerId, rate.sell, "trading post");
  gainResources(state, action.playerId, rate.buy, "trading post");
  appendEvent(state, { type: "TRADE_EXECUTED", playerId: action.playerId, rateLabel: rate.label });
}

/** Gold paid per Spell Scroll spell sold at the market. */
export const SCROLL_SPELL_SELL_GOLD = 2;

/**
 * Sell one Spell Scroll spell at an open Trading Post for 2 gold. The spell
 * leaves the scroll (and the game); an emptied scroll is removed. Like card
 * selling, this is the visit's one non-trade action.
 */
export function sellScrollSpell(state: GameState, action: Extract<GameAction, { type: "SELL_SCROLL_SPELL" }>): void {
  const adventure = requireAdventure(state);
  const visit = adventure.pendingVisit;
  const step = visit?.steps[0];
  if (!visit || visit.playerId !== action.playerId || step?.type !== "TRADING_POST") {
    throw new Error("Selling a scroll spell needs an open Trading Post visit.");
  }
  if (step.traded) {
    throw new Error("This visit already traded resources — scroll spells cannot be sold too.");
  }

  const player = state.players[action.playerId];
  const scroll = player?.scrolls?.find((candidate) => candidate.id === action.scrollId);
  const cardIndex = scroll?.spellCardIds.indexOf(action.cardId) ?? -1;
  if (!player || !scroll || cardIndex === -1) {
    throw new Error("That spell is not in the named Spell Scroll.");
  }

  scroll.spellCardIds.splice(cardIndex, 1);
  player.removed.push(action.cardId);
  if (scroll.spellCardIds.length === 0) {
    player.scrolls = player.scrolls?.filter((candidate) => candidate.id !== action.scrollId);
  }

  gainResources(state, action.playerId, { gold: SCROLL_SPELL_SELL_GOLD }, "sold a scroll spell at the Trading Post");
  appendEvent(state, {
    type: "SCROLL_SPELL_SOLD",
    playerId: action.playerId,
    scrollId: action.scrollId,
    cardId: action.cardId,
    gold: SCROLL_SPELL_SELL_GOLD
  });
}

// ---------------------------------------------------------------------------
// Combat lifecycle
// ---------------------------------------------------------------------------

function makeCombatShell(state: GameState, attackerPlayerId: PlayerId, defenderPlayerId: PlayerId): CombatState {
  // The spell limit is per combat round (rulebook: "one spell card per combat
  // round"), so it starts fresh in every fight: a spell cast in an earlier
  // combat this turn must not block round 1 of the next one.
  //
  // Expert uses (crowns) are deliberately NOT reset here. A hero's crowns are a
  // per-GAME-ROUND budget ("the number of expert effects usable per round"),
  // shared across map abilities (Learning, Wisdom, Tactics, Pathfinding, …) and
  // combat. They refresh only at the start of the player's turn
  // (refreshRoundTokens). Resetting them on entering combat let a level-3 hero
  // spend a crown on the map and then a *second* crown in the ensuing battle.
  for (const playerId of [attackerPlayerId, defenderPlayerId]) {
    const player = state.players[playerId];
    if (player) {
      player.combatStats.spellsCastThisRound = 0;
      player.combatStats.spellLimitBonusThisRound = 0;
      player.combatStats.anySpellCastThisRound = false;
    }
  }

  return {
    id: `combat_${nextEventNumber(state)}`,
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
      seed: `${state.seed}-combat-${eventSeedNumber(state)}`,
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

    // Quick Combat is still a win against Neutral Units: the Freelancer's
    // Guild bounty fires. The rulebook only withholds the Combat's own
    // rewards (experience) and — per the card — the Necromancy window.
    const guildId = findTownBuildingWithEffect(state, playerId, "FREELANCERS_GUILD");
    const guild = guildId ? coreBuildingDefinitions[guildId] : null;
    if (guild?.effect?.type === "FREELANCERS_GUILD") {
      gainResources(state, playerId, { gold: guild.effect.winGold }, "Freelancer's Guild bounty");
    }

    field.everFlagged = field.everFlagged || false;
    beginFieldVisit(state, hero.id, field.spaceId, false);
    return;
  }

  // Cyra's Diplomacy (Instant): a hero meeting Neutral Units whose Field
  // Difficulty equals their level may skip the fight, claim the field and gain
  // no Experience. Offer the choice while the player holds the card; declining
  // falls through to the normal Combat Setup.
  if (hero.level === difficulty && state.players[playerId]?.hand.includes("ability.diplomacy")) {
    openDiplomacySkipChoice(state, hero, field, difficulty);
    return;
  }

  beginNeutralCombatPlacement(state, hero, field, difficulty);
}

/** Rulebook Combat Setup against guards: the hero places, then guards reveal. */
function beginNeutralCombatPlacement(
  state: GameState,
  hero: HeroState,
  field: MapFieldState,
  difficulty: number
): void {
  const playerId = hero.controllerId;
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
  assignCombatBoardArt(state, combat);
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

/** Opens the Diplomacy skip-or-fight pop-up at a matching-level Neutral field. */
function openDiplomacySkipChoice(
  state: GameState,
  hero: HeroState,
  field: MapFieldState,
  difficulty: number
): void {
  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId: hero.controllerId,
    prompt: `Diplomacy: skip the level ${difficulty} Neutral Units and claim this field for no Experience?`,
    options: [{ label: "Use Diplomacy: skip the fight, claim the field (no XP)" }, { label: "Fight the Neutral Units" }],
    context: "diplomacy-skip",
    diplomacySkip: { heroId: hero.id, fieldId: field.spaceId, difficulty },
    returnPhase: state.phase
  };
  state.phase = "choice";
  state.priorityPlayerId = hero.controllerId;
}

/** Resolves the Diplomacy skip-or-fight choice (CHOOSE_OPTION "diplomacy-skip"). */
export function resolveDiplomacySkipChoice(state: GameState, playerId: PlayerId, optionIndex: number): void {
  const choice = state.pendingChoice;
  if (
    !choice ||
    choice.type !== "OPTION_CHOICE" ||
    choice.context !== "diplomacy-skip" ||
    !choice.diplomacySkip ||
    choice.playerId !== playerId
  ) {
    throw new Error("There is no Diplomacy decision to make.");
  }
  const skip = choice.diplomacySkip;

  const hero = state.heroes[skip.heroId];
  const field = state.adventure?.fields[skip.fieldId];
  state.pendingChoice = null;
  state.phase = choice.returnPhase;
  state.priorityPlayerId = null;

  if (!hero || !field) {
    return;
  }

  // Option 1 ("Fight") just proceeds to the normal guard Combat Setup, keeping
  // the Diplomacy card in hand.
  if (optionIndex !== 0) {
    beginNeutralCombatPlacement(state, hero, field, skip.difficulty);
    return;
  }

  // Option 0 ("Use Diplomacy"): spend the card, claim the field as a Quick
  // Combat would (visit it), and award no Experience.
  const player = state.players[playerId];
  if (player) {
    const index = player.hand.indexOf("ability.diplomacy");
    if (index !== -1) {
      player.hand.splice(index, 1);
      player.discard.push("ability.diplomacy");
    }
  }

  appendEvent(state, {
    type: "DIPLOMACY_COMBAT_SKIPPED",
    playerId,
    heroId: hero.id,
    fieldId: field.spaceId,
    difficulty: skip.difficulty
  });

  field.everFlagged = field.everFlagged || false;
  beginFieldVisit(state, hero.id, field.spaceId, false);
}

/** Human-readable price of a recruit cost ("3 gold + 1 valuables" / "free"). */
function recruitCostLabel(cost: ResourceCost): string {
  return (
    Object.entries(cost)
      .filter(([, amount]) => (amount ?? 0) > 0)
      .map(([resource, amount]) => `${amount} ${resource}`)
      .join(" + ") || "free"
  );
}

/**
 * Cyra's Diplomacy (Map): draw one Neutral Unit card per Dwelling the player
 * controls, then open a recruit choice over the affordable draws. Called from
 * playCard once the Diplomacy card has been discarded. The drawn cards leave
 * their tier decks now; the recruited one joins the army and the rest return to
 * their tier's discard pile when the choice resolves.
 */
export function openDiplomacyRecruit(state: GameState, playerId: PlayerId): void {
  const draws: { unitDefId: string; tier: "bronze" | "silver" | "gold" | "azure" }[] = [];
  for (const tier of playerDwellingTiers(state, playerId)) {
    const unitDefId = drawFromNeutralDeck(state, tier);
    if (unitDefId) {
      draws.push({ unitDefId, tier });
    }
  }

  if (draws.length === 0) {
    return;
  }

  appendEvent(state, {
    type: "DIPLOMACY_NEUTRALS_DRAWN",
    playerId,
    unitDefIds: draws.map((draw) => draw.unitDefId)
  });

  const recruitable = draws.filter((draw) => {
    const neutral = coreUnitDefinitions[draw.unitDefId]?.neutral;
    return Boolean(neutral) && hasRecruitResources(state, playerId, neutral?.cost ?? {});
  });

  // Nothing affordable to recruit: the drawn cards simply return to their decks.
  if (recruitable.length === 0) {
    for (const draw of draws) {
      state.decks[NEUTRAL_DECK_IDS[draw.tier]]?.discardPile.push(draw.unitDefId);
    }
    return;
  }

  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt: `Diplomacy: recruit one of the drawn Neutral Units — ${draws
      .map((draw) => coreUnitDefinitions[draw.unitDefId]?.name ?? draw.unitDefId)
      .join(", ")}?`,
    options: [
      ...recruitable.map((draw) => {
        const def = coreUnitDefinitions[draw.unitDefId];
        return {
          label: `Recruit ${def?.name ?? draw.unitDefId} (${recruitCostLabel(def?.neutral?.cost ?? {})})`
        };
      }),
      { label: "Recruit none" }
    ],
    context: "diplomacy-recruit",
    diplomacyRecruit: { draws, recruitable },
    returnPhase: state.phase
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
}

/** Resolves the Diplomacy recruit choice (CHOOSE_OPTION "diplomacy-recruit"). */
export function resolveDiplomacyRecruitChoice(state: GameState, playerId: PlayerId, optionIndex: number): void {
  const choice = state.pendingChoice;
  if (
    !choice ||
    choice.type !== "OPTION_CHOICE" ||
    choice.context !== "diplomacy-recruit" ||
    !choice.diplomacyRecruit ||
    choice.playerId !== playerId
  ) {
    throw new Error("There is no Diplomacy recruit choice to resolve.");
  }
  const recruit = choice.diplomacyRecruit;

  state.pendingChoice = null;
  state.phase = choice.returnPhase;
  state.priorityPlayerId = null;

  const player = state.players[playerId];
  const pick = optionIndex < recruit.recruitable.length ? recruit.recruitable[optionIndex] : undefined;
  let recruitedDefId: string | undefined;
  let recruitedTier: string | undefined;

  if (pick && player) {
    const def = coreUnitDefinitions[pick.unitDefId];
    const cost = def?.neutral?.cost ?? {};
    if (def?.neutral && hasRecruitResources(state, playerId, cost)) {
      spendRecruitResources(state, playerId, cost, `recruited ${def.name} with Diplomacy`);
      addArmyUnit(player, pick.unitDefId, "neutral");
      appendEvent(state, {
        type: "UNIT_RECRUITED",
        playerId,
        unitDefId: pick.unitDefId,
        kind: "recruit",
        cost
      });
      recruitedDefId = pick.unitDefId;
      recruitedTier = pick.tier;
    }
  }

  // Every drawn card except the one recruited returns to its tier's discard
  // pile (so the deck can reshuffle it later). Match on tier too, and consume
  // only a single copy, so duplicate draws are returned correctly.
  let consumedRecruit = false;
  for (const draw of recruit.draws) {
    if (!consumedRecruit && draw.unitDefId === recruitedDefId && draw.tier === recruitedTier) {
      consumedRecruit = true;
      continue;
    }
    state.decks[NEUTRAL_DECK_IDS[draw.tier]]?.discardPile.push(draw.unitDefId);
  }
}

// ---------------------------------------------------------------------------
// Learning ability (level-up hook)
// ---------------------------------------------------------------------------

/**
 * Learning: the Hero just crossed a level and the player holds a Learning card.
 * Offer to advance an extra half level (basic) or a full level (expert — which
 * spends an expert use and removes the card from the game). Returns true if a
 * choice was opened so the queue pump waits on it; false (e.g. the card left the
 * hand, or the Experience is already capped) lets the pump move on.
 */
function openLearningLevelUpChoice(state: GameState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  const hero = getMainHero(state, playerId);
  const card = cardLibrary["ability.learning"];
  if (
    !player ||
    !hero ||
    hero.experience >= MAX_EXPERIENCE ||
    !player.hand.includes("ability.learning") ||
    card?.effect.type !== "ADVANCE_EXPERIENCE"
  ) {
    return false;
  }

  const effect = card.effect;
  // The Expert side spends an expert use, exactly like every other expert play,
  // so it is only offered when one is available.
  const modes: ("basic" | "expert")[] = ["basic"];
  if (expertUsesAvailable(player) > 0) {
    modes.push("expert");
  }

  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt: "Your Hero is about to level up — play Learning to advance further?",
    options: [
      ...modes.map((mode) => ({
        label:
          mode === "basic"
            ? `Play Learning — advance a half level (+${effect.amount} Experience)`
            : `Play Learning (expert) — advance a full level (+${effect.expertAmount} Experience), then remove it`
      })),
      { label: "Decline" }
    ],
    context: "learning-level-up",
    learningLevelUp: { modes },
    returnPhase: "player-turn"
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
  return true;
}

/** Resolves the Learning offer (CHOOSE_OPTION context "learning-level-up"). */
export function resolveLearningLevelUpChoice(state: GameState, playerId: PlayerId, optionIndex: number): void {
  const choice = state.pendingChoice;
  if (
    !choice ||
    choice.type !== "OPTION_CHOICE" ||
    choice.context !== "learning-level-up" ||
    !choice.learningLevelUp ||
    choice.playerId !== playerId
  ) {
    throw new Error("There is no Learning decision to resolve.");
  }

  const modes = choice.learningLevelUp.modes;
  state.pendingChoice = null;
  state.phase = choice.returnPhase;
  state.priorityPlayerId = null;

  const mode = modes[optionIndex];
  const player = state.players[playerId];
  const card = cardLibrary["ability.learning"];
  const handIndex = player?.hand.indexOf("ability.learning") ?? -1;

  // The trailing option (or anything out of range) declines; if the card or an
  // expert use slipped away since the offer opened, decline rather than misfire.
  const canPlay =
    (mode === "basic" || mode === "expert") &&
    player &&
    handIndex !== -1 &&
    card?.effect.type === "ADVANCE_EXPERIENCE" &&
    (mode === "basic" || expertUsesAvailable(player) > 0);

  if (!canPlay || !player || card?.effect.type !== "ADVANCE_EXPERIENCE") {
    pumpAdventureQueues(state);
    return;
  }

  // Spend the card: Expert removes it from the game and burns an expert use,
  // basic sends it to the discard pile.
  player.hand.splice(handIndex, 1);
  if (mode === "expert") {
    player.removed.push("ability.learning");
    player.combatStats.expertUsesSpentThisRound += 1;
  } else {
    player.discard.push("ability.learning");
  }

  appendEvent(state, {
    type: "CARD_PLAYED",
    playerId,
    cardId: "ability.learning",
    timing: card.timing,
    mode
  });

  // The bonus Experience runs through gainExperience, so advancing into another
  // level resolves its searches/specialties (and may even re-offer Learning when
  // the player holds a second copy).
  gainExperience(state, playerId, mode === "expert" ? card.effect.expertAmount : card.effect.amount);

  pumpAdventureQueues(state);
}

// ---------------------------------------------------------------------------
// Visions spell (Neutral-deck scry)
// ---------------------------------------------------------------------------

type NeutralTier = "bronze" | "silver" | "gold" | "azure";

const NEUTRAL_TIERS: readonly NeutralTier[] = ["bronze", "silver", "gold", "azure"];

/** Cards Visions scrys at a given Power level (clamped to a defined breakpoint). */
function visionsCardCount(cardsByPower: Record<number, number>, power: number): number {
  return cardsByPower[power] ?? cardsByPower[0] ?? 1;
}

// ---------------------------------------------------------------------------
// Fortune (Map): the spell rerolls a Treasure/Resource die. On the map there is
// no Hero Power statistic, so the reroll count is paid the board-game way —
// discard a power-source card for +1 reroll, up to the spell's top breakpoint —
// offered interactively before the reroll effect is created. In Combat the
// Attack-die reroll scales with the Hero's Power the normal way (the spell's
// CREATE_ATTACK_DIE_REROLL stack path), so this boost is map-only.
// ---------------------------------------------------------------------------

/** Fortune's reroll count at a given Power (clamped to a defined breakpoint). */
function fortuneRerollCount(card: CardDefinition, power: number): number {
  if (card.effect.type !== "CREATE_ATTACK_DIE_REROLL") {
    return 0;
  }
  const byPower = card.effect.rerollsByPower;
  if (!byPower) {
    return card.effect.basicRerolls;
  }
  const breakpoints = Object.keys(byPower)
    .map(Number)
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  const match = breakpoints.filter((value) => value <= power).at(-1) ?? breakpoints[0];
  return match === undefined ? card.effect.basicRerolls : (byPower[match] ?? card.effect.basicRerolls);
}

/** The highest Power breakpoint Fortune can reach (Power 2 -> 3 rerolls). */
function fortuneMaxPower(card: CardDefinition): number {
  if (card.effect.type !== "CREATE_ATTACK_DIE_REROLL" || !card.effect.rerollsByPower) {
    return 0;
  }
  return Math.max(...Object.keys(card.effect.rerollsByPower).map(Number));
}

/**
 * Creates Fortune's player-scoped reroll effect at the chosen Power: an
 * Attack-die reroll plus a shared Treasure/Resource budget of the same size,
 * lasting the turn.
 */
function createFortuneRerollEffect(
  state: GameState,
  playerId: PlayerId,
  card: CardDefinition,
  power: number
): void {
  if (card.effect.type !== "CREATE_ATTACK_DIE_REROLL") {
    return;
  }
  const rerolls = fortuneRerollCount(card, power);
  if (rerolls <= 0) {
    return;
  }
  const effect = makeActiveEffect(
    state,
    {
      name: card.effect.name,
      scope: "player",
      duration: card.effect.duration,
      polarity: "positive",
      removable: false,
      modifiers: [
        { type: "ATTACK_DIE_REROLL", maxUsesPerRoll: rerolls, consumeEffectOnUse: card.effect.consumeEffectOnUse },
        { type: "ADVENTURE_DIE_REROLL", dice: "treasure", rerolls },
        { type: "ADVENTURE_DIE_REROLL", dice: "resource", rerolls }
      ]
    },
    { type: "card", cardId: card.id, controllerId: playerId },
    playerId
  );
  state.activeEffects.push(effect);
  appendEvent(state, {
    type: "ACTIVE_EFFECT_CREATED",
    effectId: effect.id,
    controllerId: effect.controllerId,
    name: effect.name,
    duration: effect.duration
  });
}

/**
 * Offers one Fortune Power boost on the map: discard a power-source card for +1
 * reroll, or play now. Re-opens with `boost + 1` after each paid card until the
 * top breakpoint is reached or no power-source card remains, then creates the
 * reroll effect at the reached Power.
 */
export function openFortuneBoostStep(
  state: GameState,
  playerId: PlayerId,
  card: CardDefinition,
  boost: number
): void {
  if (card.effect.type !== "CREATE_ATTACK_DIE_REROLL") {
    return;
  }
  const maxPower = fortuneMaxPower(card);
  const player = state.players[playerId];
  const spellCardIds =
    boost < maxPower ? (player?.hand.filter((cardId) => cardCanBoostPower(cardLibrary[cardId])) ?? []) : [];

  if (spellCardIds.length === 0) {
    createFortuneRerollEffect(state, playerId, card, boost);
    return;
  }

  const nextRerolls = fortuneRerollCount(card, boost + 1);
  const nowRerolls = fortuneRerollCount(card, boost);
  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt: `Fortune: discard a card for +1 reroll (reroll ${nextRerolls}×), or play now (reroll ${nowRerolls}×)?`,
    options: [
      ...spellCardIds.map((cardId) => ({
        label: `Discard ${cardLibrary[cardId]?.name ?? cardId} → reroll ${nextRerolls}×`
      })),
      { label: `Play now — reroll ${nowRerolls}×` }
    ],
    context: "fortune-boost",
    fortuneBoost: { boost, spellCardIds: [...spellCardIds], cardId: card.id },
    returnPhase: "player-turn"
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
}

/** Resolves a Fortune Power boost (CHOOSE_OPTION context "fortune-boost"). */
export function resolveFortuneBoostChoice(state: GameState, playerId: PlayerId, optionIndex: number): void {
  const choice = state.pendingChoice;
  if (
    !choice ||
    choice.type !== "OPTION_CHOICE" ||
    choice.context !== "fortune-boost" ||
    !choice.fortuneBoost ||
    choice.playerId !== playerId
  ) {
    throw new Error("There is no Fortune Power decision to resolve.");
  }
  const { boost, spellCardIds, cardId } = choice.fortuneBoost;
  const card = cardLibrary[cardId];
  const player = state.players[playerId];
  state.pendingChoice = null;
  state.phase = choice.returnPhase;
  state.priorityPlayerId = null;

  const paySpell = spellCardIds[optionIndex];
  const handIndex = player ? player.hand.indexOf(paySpell ?? "") : -1;
  // The trailing option (or a card that left the hand) creates the effect now.
  if (!player || !card || optionIndex >= spellCardIds.length || !paySpell || handIndex === -1) {
    if (card) {
      createFortuneRerollEffect(state, playerId, card, boost);
    }
    if (!state.pendingChoice) {
      pumpAdventureQueues(state);
    }
    return;
  }

  // Spend the card for +1 reroll, then offer the next boost.
  player.hand.splice(handIndex, 1);
  player.discard.push(paySpell);
  appendEvent(state, {
    type: "CARD_PLAYED",
    playerId,
    cardId: paySpell,
    timing: cardLibrary[paySpell]?.timing ?? "instant",
    mode: "basic",
    optionLabel: "+1 Power (Fortune)"
  });
  openFortuneBoostStep(state, playerId, card, boost + 1);
  if (!state.pendingChoice) {
    pumpAdventureQueues(state);
  }
}

/**
 * Visions (Map): begin the scry. Power is paid the board-game way — discard
 * Spells (their "+1 Power" side) for +1 card each, up to the spell's top
 * breakpoint — so the boost is offered interactively before a deck is chosen.
 * Called from playCard once Visions itself is discarded.
 */
export function openVisionsScry(state: GameState, playerId: PlayerId, cardsByPower: Record<number, number>): void {
  openVisionsBoostStep(state, playerId, cardsByPower, 0);
}

/**
 * Offers one Power boost: discard a Spell for +1 card, or scry now. Re-opens
 * with `boost + 1` after each paid Spell until the top breakpoint is reached or
 * no power-source Spell remains in hand, then proceeds to the deck choice.
 */
function openVisionsBoostStep(
  state: GameState,
  playerId: PlayerId,
  cardsByPower: Record<number, number>,
  boost: number
): void {
  const player = state.players[playerId];
  const maxPower = Math.max(...Object.keys(cardsByPower).map(Number));
  // Power-source cards are Spells (and Power statistics) still in hand.
  const spellCardIds =
    boost < maxPower ? (player?.hand.filter((cardId) => cardCanBoostPower(cardLibrary[cardId])) ?? []) : [];

  if (spellCardIds.length === 0) {
    proceedToVisionsDeck(state, playerId, visionsCardCount(cardsByPower, boost));
    return;
  }

  const nextCount = visionsCardCount(cardsByPower, boost + 1);
  const nowCount = visionsCardCount(cardsByPower, boost);
  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt: `Visions: discard a Spell for +1 card (scry ${nextCount}), or scry now (${nowCount})?`,
    options: [
      ...spellCardIds.map((cardId) => ({
        label: `Discard ${cardLibrary[cardId]?.name ?? cardId} → scry ${nextCount}`
      })),
      { label: `Scry now — ${nowCount} card${nowCount === 1 ? "" : "s"}` }
    ],
    context: "visions-boost",
    visionsBoost: { boost, spellCardIds: [...spellCardIds], cardsByPower },
    returnPhase: "player-turn"
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
}

/** Resolves a Visions Power boost (CHOOSE_OPTION context "visions-boost"). */
export function resolveVisionsBoostChoice(state: GameState, playerId: PlayerId, optionIndex: number): void {
  const choice = state.pendingChoice;
  if (
    !choice ||
    choice.type !== "OPTION_CHOICE" ||
    choice.context !== "visions-boost" ||
    !choice.visionsBoost ||
    choice.playerId !== playerId
  ) {
    throw new Error("There is no Visions Power decision to resolve.");
  }
  const { boost, spellCardIds, cardsByPower } = choice.visionsBoost;
  const player = state.players[playerId];
  state.pendingChoice = null;
  state.phase = choice.returnPhase;
  state.priorityPlayerId = null;

  const paySpell = spellCardIds[optionIndex];
  const handIndex = player ? player.hand.indexOf(paySpell ?? "") : -1;
  // The trailing option (or a Spell that left the hand) scrys at the current Power.
  if (!player || optionIndex >= spellCardIds.length || !paySpell || handIndex === -1) {
    proceedToVisionsDeck(state, playerId, visionsCardCount(cardsByPower, boost));
    if (!state.pendingChoice) {
      pumpAdventureQueues(state);
    }
    return;
  }

  // Spend the Spell for +1 Power (one more card), then offer the next boost.
  player.hand.splice(handIndex, 1);
  player.discard.push(paySpell);
  appendEvent(state, {
    type: "CARD_PLAYED",
    playerId,
    cardId: paySpell,
    timing: cardLibrary[paySpell]?.timing ?? "instant",
    mode: "basic",
    optionLabel: "+1 Power (Visions)"
  });
  openVisionsBoostStep(state, playerId, cardsByPower, boost + 1);
  if (!state.pendingChoice) {
    pumpAdventureQueues(state);
  }
}

/**
 * Chooses which Neutral Unit deck to scry: auto-picks the only tier with cards,
 * otherwise opens the tier choice. Draws `count` cards from the chosen tier.
 */
function proceedToVisionsDeck(state: GameState, playerId: PlayerId, count: number): void {
  const tiers = NEUTRAL_TIERS.filter((tier) => {
    const deck = state.decks[NEUTRAL_DECK_IDS[tier]];
    return deck && deck.drawPile.length + deck.discardPile.length > 0;
  });

  if (count <= 0 || tiers.length === 0) {
    return;
  }

  if (tiers.length === 1) {
    beginVisionsScryOnTier(state, playerId, tiers[0], count);
    return;
  }

  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt: `Visions: scry which Neutral Unit deck? (draw ${count})`,
    options: tiers.map((tier) => {
      const deck = state.decks[NEUTRAL_DECK_IDS[tier]];
      const total = (deck?.drawPile.length ?? 0) + (deck?.discardPile.length ?? 0);
      return { label: `${tier.charAt(0).toUpperCase()}${tier.slice(1)} deck (${total} cards)` };
    }),
    context: "visions-deck",
    visionsDeck: { tiers: [...tiers], count },
    returnPhase: "player-turn"
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
}

/** Draws up to `count` cards off a tier deck and opens the keep/discard scry. */
function beginVisionsScryOnTier(state: GameState, playerId: PlayerId, tier: NeutralTier, count: number): void {
  const revealed: CardId[] = [];
  for (let index = 0; index < count; index += 1) {
    const drawn = drawFromNeutralDeck(state, tier);
    if (!drawn) {
      break;
    }
    revealed.push(drawn);
  }

  if (revealed.length === 0) {
    return;
  }

  openVisionsScryStep(state, playerId, tier, revealed, []);
}

/**
 * Opens (or re-opens) the scry decision over the cards still in hand: each step
 * the player either puts one card back on top of the deck or discards it, until
 * none are left. Kept cards accumulate in `toReturn` in pick order; the first
 * card kept ends up on top of the deck (drawn next).
 */
function openVisionsScryStep(
  state: GameState,
  playerId: PlayerId,
  tier: NeutralTier,
  remaining: CardId[],
  toReturn: CardId[]
): void {
  if (remaining.length === 0) {
    finishVisionsScry(state, tier, toReturn);
    return;
  }

  const name = (cardId: CardId) => coreUnitDefinitions[cardId]?.name ?? cardId;
  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt:
      remaining.length === 1
        ? `Visions: keep ${name(remaining[0])} on top of the ${tier} deck, or discard it?`
        : `Visions: put a card back on top of the ${tier} deck (first kept is drawn next) or discard it.`,
    options: [
      ...remaining.map((cardId) => ({ label: `Put ${name(cardId)} back on top` })),
      ...remaining.map((cardId) => ({ label: `Discard ${name(cardId)}` }))
    ],
    context: "visions-scry",
    visionsScry: { tier, remaining: [...remaining], toReturn: [...toReturn] },
    returnPhase: "player-turn"
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
}

/** Returns the kept cards to the top of the tier deck (first kept on top). */
function finishVisionsScry(state: GameState, tier: NeutralTier, toReturn: CardId[]): void {
  const deck = state.decks[NEUTRAL_DECK_IDS[tier]];
  if (deck) {
    // drawPile is popped from the end, so the last item is the top. Push the
    // kept cards in reverse pick order so the first one kept ends up on top.
    for (let index = toReturn.length - 1; index >= 0; index -= 1) {
      deck.drawPile.push(toReturn[index]);
    }
  }
  state.pendingChoice = null;
  state.phase = "player-turn";
  state.priorityPlayerId = null;
  pumpAdventureQueues(state);
}

/** Resolves the Visions tier choice (CHOOSE_OPTION context "visions-deck"). */
export function resolveVisionsDeckChoice(state: GameState, playerId: PlayerId, optionIndex: number): void {
  const choice = state.pendingChoice;
  if (
    !choice ||
    choice.type !== "OPTION_CHOICE" ||
    choice.context !== "visions-deck" ||
    !choice.visionsDeck ||
    choice.playerId !== playerId
  ) {
    throw new Error("There is no Visions deck choice to resolve.");
  }
  const { tiers, count } = choice.visionsDeck;
  const tier = tiers[optionIndex];
  state.pendingChoice = null;
  state.phase = choice.returnPhase;
  state.priorityPlayerId = null;

  if (!tier) {
    pumpAdventureQueues(state);
    return;
  }
  beginVisionsScryOnTier(state, playerId, tier, count);
  if (!state.pendingChoice) {
    pumpAdventureQueues(state);
  }
}

/** Resolves one keep/discard step of the scry (CHOOSE_OPTION "visions-scry"). */
export function resolveVisionsScryChoice(state: GameState, playerId: PlayerId, optionIndex: number): void {
  const choice = state.pendingChoice;
  if (
    !choice ||
    choice.type !== "OPTION_CHOICE" ||
    choice.context !== "visions-scry" ||
    !choice.visionsScry ||
    choice.playerId !== playerId
  ) {
    throw new Error("There is no Visions scry to resolve.");
  }

  const { tier, remaining, toReturn } = choice.visionsScry;
  const keepCount = remaining.length;
  // Options are [keep r0, keep r1, …, discard r0, discard r1, …].
  const isKeep = optionIndex < keepCount;
  const cardIndex = isKeep ? optionIndex : optionIndex - keepCount;
  const cardId = remaining[cardIndex];
  if (!cardId) {
    throw new Error("Pick one of the revealed cards.");
  }

  const nextRemaining = remaining.filter((_, index) => index !== cardIndex);
  if (isKeep) {
    openVisionsScryStep(state, playerId, tier, nextRemaining, [...toReturn, cardId]);
  } else {
    state.decks[NEUTRAL_DECK_IDS[tier]]?.discardPile.push(cardId);
    openVisionsScryStep(state, playerId, tier, nextRemaining, toReturn);
  }
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

  // The guards are on the board: a Tactics-holding attacker may now rearrange
  // their line before round 1 (finalizeCombatStart) begins.
  combat.setup = null;
  if (openTacticsSetupWindows(state)) {
    return;
  }
  finalizeCombatStart(state);
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
  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "OPTION_CHOICE",
    playerId: combat.attackerPlayerId,
    prompt: "Groovy Satyr: swap one drawn neutral for a fresh card of the same tier?",
    options: [
      { label: "Keep the drawn army" },
      ...draws.map((draw) => ({
        label: draw.bankGuard
          ? `${coreUnitDefinitions[draw.unitDefId]?.name ?? draw.unitDefId} (bank guard — cannot swap)`
          : `Swap ${coreUnitDefinitions[draw.unitDefId]?.name ?? draw.unitDefId} (${draw.tier})`
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

export function startPlayerCombat(
  state: GameState,
  attacker: HeroState,
  defender: HeroState | null,
  fieldId: MapSpaceId,
  garrisonDefenderId?: PlayerId
): void {
  const defenderPlayerId = defender?.controllerId ?? garrisonDefenderId;
  if (!defenderPlayerId) {
    throw new Error("A player combat needs a defending player.");
  }

  restoreStartingArmyIfEmpty(state, attacker.controllerId);
  restoreStartingArmyIfEmpty(state, defenderPlayerId);

  // Siege: the combat happens on the defender's own faction town field and
  // the town has a Citadel — walls, gate and the arrow tower join the board.
  const town = Object.values(state.towns).find(
    (candidate) => candidate.fieldId === fieldId && candidate.controllerId === defenderPlayerId
  );
  // Dragon Conqueror: assaulting a captured Dragon Utopia is always a siege —
  // the holder defends behind Walls, the Gate and the Arrow Tower.
  const field = state.adventure?.fields[fieldId];
  const utopiaSiege =
    field?.location === "dragon_utopia" &&
    adventureVictoryMode(state) === "dragon-conqueror" &&
    field.flagOwnerId === defenderPlayerId;
  const siege =
    utopiaSiege ||
    Boolean(
      town &&
        town.factionId &&
        town.buildings.some((buildingId) => coreBuildingDefinitions[buildingId]?.effect?.type === "UNLOCK_REINFORCE")
    );

  const combat = makeCombatShell(state, attacker.controllerId, defenderPlayerId);
  combat.context = {
    kind: "player",
    attackerHeroId: attacker.id,
    defenderHeroId: defender?.id ?? null,
    fieldId,
    ...(siege ? { siege: true } : {})
  };
  assignCombatBoardArt(state, combat);
  combat.setup = {
    pendingPlayerIds: [attacker.controllerId, defenderPlayerId],
    placedUnitIds: { [attacker.controllerId]: [], [defenderPlayerId]: [] },
    unitLimit: COMBAT_UNIT_LIMIT
  };

  state.combat = combat;
  state.phase = "combat-setup";
  state.priorityPlayerId = attacker.controllerId;

  appendEvent(state, {
    type: "PLAYER_COMBAT_STARTED",
    attackerPlayerId: attacker.controllerId,
    defenderPlayerId,
    fieldId
  });

  // Cover of Darkness: "At the beginning of Combat with an Enemy Hero,
  // discard 1 random card from the enemy's hand" — offered to each owner
  // whose building is still unused this round, before placement begins.
  const covers: PlayerId[] = [];
  for (const playerId of [attacker.controllerId, defenderPlayerId]) {
    const enemyId = playerId === attacker.controllerId ? defenderPlayerId : attacker.controllerId;
    const enemyHasHero = playerId === attacker.controllerId ? Boolean(defender) : true;
    const buildingId = findTownBuildingWithEffect(state, playerId, "COVER_OF_DARKNESS");
    const player = state.players[playerId];
    const unused = player && buildingId && (player.buildingUsedRound?.[buildingId] ?? 0) !== state.round;
    if (buildingId && unused && enemyHasHero && (state.players[enemyId]?.hand.length ?? 0) > 0) {
      covers.push(playerId);
    }
  }

  if (covers.length > 0) {
    combat.pendingCoverOfDarkness = covers;
    openNextCoverOfDarknessChoice(state);
    return;
  }

  continueStartOfCombat(state);
}

/**
 * The two participants of a player-vs-player combat — the attacker and the
 * defender — who each get a say in the pre-battle preparation window.
 */
function combatPrepParticipants(combat: CombatState): PlayerId[] {
  return [combat.attackerPlayerId, combat.defenderPlayerId];
}

/**
 * Player-vs-player pre-battle preparation window. When an enemy hero attacks,
 * BOTH the attacker and the defender get a window — presented on the adventure
 * MAP, not the battlefield — to spend any town actions they still hold this
 * round (build, recruit/reinforce, buy spells) before deploying. Recruited units
 * join the army in time to be placed. Each side then presses ACCEPT_COMBAT, and
 * deployment begins only once both have. This is the fairness case the table
 * asked for: a defender caught on the enemy's turn (fresh tokens) — and the
 * attacker too — get to prepare with their towns and resources in full view,
 * instead of calculating blind on the combat screen.
 *
 * Opened for every player-vs-player combat (the combat shell and `setup` already
 * built, but deployment held back). Returns true when the window is opened;
 * neutral-guard fights never open it.
 */
function maybeOpenCombatPrep(state: GameState): boolean {
  const combat = state.combat;
  if (!combat || combat.context.kind !== "player" || combat.prep) {
    return false;
  }

  combat.prep = { accepted: [] };
  state.phase = "combat-setup";
  // Both participants may act at once; neither holds exclusive priority. Each
  // side's legal actions are gated by `inCombatPrep`, not by priorityPlayerId.
  state.priorityPlayerId = null;
  return true;
}

/**
 * True while `playerId` is a combat participant who is still preparing — i.e. the
 * pre-battle window is open and they have not yet pressed ACCEPT_COMBAT. Such a
 * player may still take town actions; a participant who has already accepted is
 * locked in and waits for the other side.
 */
export function inCombatPrep(state: GameState, playerId: PlayerId): boolean {
  const combat = state.combat;
  if (!combat?.prep) {
    return false;
  }
  return combatPrepParticipants(combat).includes(playerId) && !combat.prep.accepted.includes(playerId);
}

/**
 * Accept the battle (ACCEPT_COMBAT): a participant readies up after any town
 * actions. While one side waits on the other the window stays open; once BOTH
 * the attacker and defender have accepted the window clears and deployment
 * priority passes to the first player still to place (the attacker).
 */
export function acceptCombat(state: GameState, action: Extract<GameAction, { type: "ACCEPT_COMBAT" }>): void {
  const combat = state.combat;
  if (!combat || !combat.prep) {
    throw new Error("There is no battle preparation to accept right now.");
  }
  if (!combatPrepParticipants(combat).includes(action.playerId)) {
    throw new Error("Only a combat participant may accept the battle.");
  }
  if (combat.prep.accepted.includes(action.playerId)) {
    throw new Error("You have already accepted — waiting for your opponent to ready up.");
  }

  combat.prep.accepted.push(action.playerId);
  appendEvent(state, { type: "COMBAT_PREP_ACCEPTED", playerId: action.playerId });

  if (!combatPrepParticipants(combat).every((id) => combat.prep!.accepted.includes(id))) {
    // Still waiting on the other participant — keep the prep window open.
    state.phase = "combat-setup";
    state.priorityPlayerId = null;
    return;
  }

  combat.prep = null;
  state.phase = "combat-setup";
  state.priorityPlayerId = combat.setup?.pendingPlayerIds[0] ?? combat.attackerPlayerId;
}

/** Opens the next queued Cover of Darkness start-of-combat decision. */
function openNextCoverOfDarknessChoice(state: GameState): void {
  const combat = state.combat;
  const nextPlayerId = combat?.pendingCoverOfDarkness?.[0];
  if (!combat || !nextPlayerId) {
    return;
  }

  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId: nextPlayerId,
    prompt: "Cover of Darkness: discard 1 random card from the enemy's hand? (uses this round's building action)",
    options: [{ label: "Use Cover of Darkness" }, { label: "Keep it for later" }],
    context: "cover-of-darkness",
    returnPhase: "combat-setup"
  };
  state.phase = "choice";
  state.priorityPlayerId = nextPlayerId;
}

/** Resolves one Cover of Darkness decision and reopens setup when done. */
export function resolveCoverOfDarknessChoice(state: GameState, playerId: PlayerId, optionIndex: number): void {
  const combat = state.combat;
  if (!combat || combat.pendingCoverOfDarkness?.[0] !== playerId) {
    throw new Error("There is no Cover of Darkness decision to make.");
  }

  combat.pendingCoverOfDarkness = combat.pendingCoverOfDarkness.slice(1);
  state.pendingChoice = null;

  if (optionIndex === 0) {
    const player = state.players[playerId];
    const buildingId = findTownBuildingWithEffect(state, playerId, "COVER_OF_DARKNESS");
    const enemyId = playerId === combat.attackerPlayerId ? combat.defenderPlayerId : combat.attackerPlayerId;
    const enemy = state.players[enemyId];
    if (player && buildingId && enemy && enemy.hand.length > 0) {
      player.buildingUsedRound = { ...player.buildingUsedRound, [buildingId]: state.round };
      discardRandomCard(state, playerId, buildingId, enemyId, "Cover of Darkness");
    }
  }

  if (combat.pendingCoverOfDarkness.length > 0) {
    openNextCoverOfDarknessChoice(state);
    return;
  }

  continueStartOfCombat(state);
}

/**
 * Continue the start-of-combat sequence after any Cover of Darkness decisions:
 * offer the attacker the Shackles of War "block the enemy's Surrender" decision,
 * then open the pre-battle prep window (or go straight to deployment).
 */
function continueStartOfCombat(state: GameState): void {
  if (maybeOpenShacklesDecision(state)) {
    return;
  }
  if (maybeOpenCombatPrep(state)) {
    return;
  }
  const combat = state.combat;
  state.phase = "combat-setup";
  state.priorityPlayerId = combat?.setup?.pendingPlayerIds[0] ?? null;
}

/** The attacker's Shackles of War (BLOCK_ENEMY_SURRENDER) instant in hand, if any. */
function findShacklesInHand(state: GameState, playerId: PlayerId): CardId | null {
  const hand = state.players[playerId]?.hand ?? [];
  for (const cardId of hand) {
    const effect = cardLibrary[cardId]?.effect;
    if (
      effect?.type === "CHOOSE_ONE" &&
      effect.options.some((option) => option.effect.type === "BLOCK_ENEMY_SURRENDER")
    ) {
      return cardId;
    }
  }
  return null;
}

/**
 * Shackles of War, reworked to match "Surrender is a before-battle (defender
 * prep) decision". The attacker is offered a start-of-combat decision — before
 * the defender's prep opens — to play Shackles and lock the defender out of
 * Surrender (they may still Retreat). Offered before the prep window opens, when
 * the attacker holds the card and there is a defending hero who could surrender.
 * Resolved like Cover of Darkness. Returns true when the decision opened.
 */
function maybeOpenShacklesDecision(state: GameState): boolean {
  const combat = state.combat;
  if (!combat || combat.context.kind !== "player" || combat.pendingShackles || combat.shacklesOffered) {
    return false;
  }
  // The defender is who surrenders (in prep), so only the attacker can block it.
  const attackerId = combat.attackerPlayerId;
  const defenderId = combat.defenderPlayerId;
  // No defending hero means there is no Surrender to block — do not prompt.
  if (!combat.context.defenderHeroId) {
    return false;
  }
  if (playerCannotSurrenderCombat(state, defenderId)) {
    return false; // already locked
  }
  if (!findShacklesInHand(state, attackerId)) {
    return false;
  }

  combat.pendingShackles = [attackerId];
  combat.shacklesOffered = true;
  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId: attackerId,
    prompt: "Shackles of War: play it now to stop the enemy hero surrendering this combat? (they may still Retreat)",
    options: [{ label: "Play Shackles of War — no Surrender for the enemy" }, { label: "Keep it" }],
    context: "shackles-of-war",
    returnPhase: "combat-setup"
  };
  state.phase = "choice";
  state.priorityPlayerId = attackerId;
  return true;
}

/** Resolves the attacker's start-of-combat Shackles of War decision. */
export function resolveShacklesChoice(state: GameState, playerId: PlayerId, optionIndex: number): void {
  const combat = state.combat;
  if (!combat || combat.pendingShackles?.[0] !== playerId) {
    throw new Error("There is no Shackles of War decision to make.");
  }

  combat.pendingShackles = null;
  state.pendingChoice = null;

  if (optionIndex === 0) {
    const cardId = findShacklesInHand(state, playerId);
    const player = state.players[playerId];
    if (cardId && player) {
      const handIndex = player.hand.indexOf(cardId);
      if (handIndex >= 0) {
        player.hand.splice(handIndex, 1);
        player.discard.push(cardId);
      }
      // Lock the enemy (defender) out of Surrender for this combat.
      const effect = makeActiveEffect(
        state,
        {
          name: cardLibrary[cardId]?.name ?? "Shackles of War",
          scope: "player",
          duration: { type: "combat" },
          polarity: "negative",
          removable: false,
          modifiers: [{ type: "CANNOT_SURRENDER_COMBAT" }]
        },
        { type: "card", cardId, controllerId: playerId },
        combat.defenderPlayerId
      );
      state.activeEffects.push(effect);
      appendEvent(state, { type: "CARD_PLAYED", playerId, cardId, timing: "instant", mode: "basic" });
    }
  }

  continueStartOfCombat(state);
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

  if (combat.prep) {
    throw new Error("Deployment waits until both sides accept the battle.");
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

  if (combat.prep) {
    throw new Error("Deployment waits until both sides accept the battle.");
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

  if (combat.prep) {
    throw new Error("Deployment waits until both sides accept the battle.");
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
    const guardField = state.adventure?.fields[combat.context.fieldId];
    const draws = drawGuardArmy(state, guardField, combat.context.difficulty);
    // The Groovy Satyr only swaps deck-drawn guards, never fixed bank guards.
    const satyrActive = getActiveAstrologersCard(state)?.effect.type === "NEUTRAL_DRAW_SWAP";
    if (satyrActive && draws.some((draw) => !draw.bankGuard)) {
      openSatyrSwapChoice(state, draws);
      return;
    }

    revealNeutralArmy(state, draws);
    return;
  }

  // Siege: "the defender adds the Wall, Gate and Arrow Tower cards after
  // placing their units" — the defender first chooses the Gate's column.
  if (combat.context.kind === "player" && combat.context.siege) {
    openSiegeGateChoice(state, combat.defenderPlayerId);
    return;
  }

  beginPlayerCombatRounds(state);
}

/** Common tail of player-combat setup: round 1 begins, war machines fire. */
function beginPlayerCombatRounds(state: GameState): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }

  // Placement is locked in. Tactics holders rearrange their lines first; round 1
  // begins (finalizeCombatStart) only once every Tactics window has resolved.
  combat.setup = null;
  if (openTacticsSetupWindows(state)) {
    return;
  }
  finalizeCombatStart(state);
}

/**
 * Common tail of combat setup (player and neutral alike): round 1 opens,
 * in-play permanents join and round-start war machines fire. Runs after the
 * start-of-combat Tactics windows, if any, have all resolved.
 */
function finalizeCombatStart(state: GameState): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }

  combat.setup = null;
  combat.pendingTacticsSwaps = null;
  state.phase = "combat";
  state.priorityPlayerId = null;

  appendEvent(state, {
    type: "COMBAT_ROUND_STARTED",
    round: combat.round,
    activeUnitId: null
  });

  // In-play permanents join the fight and round-start war machines fire.
  applyPermanentCombatEffects(state);
  applyCombatStartUnitAbilities(state);
  startWarMachineRound(state);
}

/** A player's living, swappable (non-Arrow-Tower) units in this combat. */
function swappableTacticsUnits(combat: CombatState, playerId: PlayerId) {
  return Object.values(combat.units).filter(
    (unit) => unit.controllerId === playerId && unit.damage < unit.maxHealth && !isArrowTowerUnit(unit)
  );
}

/**
 * Tactics start-of-combat eligibility: the player must hold a Tactics card and
 * field at least two units to switch. (A pure garrison defender — no hero in
 * the combat — is filtered out by the caller, since Tactics is a hero ability.)
 */
function eligibleForTacticsSetup(state: GameState, combat: CombatState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  if (!player || !player.hand.includes("ability.tactics")) {
    return false;
  }
  return swappableTacticsUnits(combat, playerId).length >= 2;
}

/**
 * Opens the start-of-combat Tactics windows once units are placed/revealed:
 * the attacker first, then a PvP defender whose hero stands in the combat. Each
 * eligible holder takes priority in turn to switch any two of their units (or
 * decline). Returns true when a window is open (round 1 is deferred).
 */
function openTacticsSetupWindows(state: GameState): boolean {
  const combat = state.combat;
  if (!combat) {
    return false;
  }

  const eligible: PlayerId[] = [];
  if (eligibleForTacticsSetup(state, combat, combat.attackerPlayerId)) {
    eligible.push(combat.attackerPlayerId);
  }
  if (
    combat.context.kind === "player" &&
    combat.context.defenderHeroId != null &&
    eligibleForTacticsSetup(state, combat, combat.defenderPlayerId)
  ) {
    eligible.push(combat.defenderPlayerId);
  }

  if (eligible.length === 0) {
    return false;
  }

  combat.pendingTacticsSwaps = eligible;
  state.phase = "combat-setup";
  state.priorityPlayerId = eligible[0];
  return true;
}

/** Advances past the head of the Tactics setup queue, finalizing when empty. */
function advanceTacticsSetupQueue(state: GameState): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }
  const remaining = (combat.pendingTacticsSwaps ?? []).slice(1);
  if (remaining.length > 0) {
    combat.pendingTacticsSwaps = remaining;
    state.phase = "combat-setup";
    state.priorityPlayerId = remaining[0];
    return;
  }
  finalizeCombatStart(state);
}

/** Removes one Tactics ability card from a player's hand to its discard pile. */
function spendTacticsCard(state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  if (!player) {
    return;
  }
  const index = player.hand.indexOf("ability.tactics");
  if (index !== -1) {
    player.hand.splice(index, 1);
    player.discard.push("ability.tactics");
  }
}

/**
 * Tactics swap (SWAP_COMBAT_UNITS). Two contexts share one action:
 *  - the start-of-combat window (the player heads pendingTacticsSwaps): free,
 *    spends the Tactics card, then advances the queue; and
 *  - an expert mid-combat swap on the player's turn before their active unit has
 *    acted: spends the Tactics card and one expert use, combat continues.
 * Either way it switches the board positions of two of the player's own units.
 */
export function swapCombatUnits(state: GameState, action: Extract<GameAction, { type: "SWAP_COMBAT_UNITS" }>): void {
  const combat = state.combat;
  if (!combat) {
    throw new Error("There is no combat in progress.");
  }
  if (action.unitIdA === action.unitIdB) {
    throw new Error("Tactics switches two different units.");
  }
  const unitA = combat.units[action.unitIdA];
  const unitB = combat.units[action.unitIdB];
  if (!unitA || !unitB) {
    throw new Error("Both units must be on the battlefield.");
  }
  for (const unit of [unitA, unitB]) {
    if (unit.controllerId !== action.playerId) {
      throw new Error("Tactics only switches your own units.");
    }
    if (unit.damage >= unit.maxHealth || isArrowTowerUnit(unit)) {
      throw new Error("That unit cannot be repositioned.");
    }
  }

  const player = state.players[action.playerId];
  if (!player || !player.hand.includes("ability.tactics")) {
    throw new Error("Tactics is not available to switch units.");
  }

  const isSetupWindow = combat.pendingTacticsSwaps?.[0] === action.playerId;
  let mode: "basic" | "expert";

  if (isSetupWindow) {
    mode = "basic";
  } else if (state.phase === "combat") {
    // Expert: your turn, before your active unit has moved or attacked.
    const active = combat.activeUnitId ? combat.units[combat.activeUnitId] : null;
    if (!active || active.controllerId !== action.playerId) {
      throw new Error("Tactics can only be used during combat on your own turn.");
    }
    if (active.movedThisActivation || active.attackedThisActivation) {
      throw new Error("Tactics must be used before your active unit moves or attacks.");
    }
    if (expertUsesAvailable(player) <= 0) {
      throw new Error("No expert uses are available this combat round.");
    }
    mode = "expert";
  } else {
    throw new Error("There is no Tactics swap available right now.");
  }

  const positionA = unitA.position;
  unitA.position = unitB.position;
  unitB.position = positionA;

  spendTacticsCard(state, action.playerId);
  if (mode === "expert") {
    player.combatStats.expertUsesSpentThisRound += 1;
  }

  appendEvent(state, {
    type: "COMBAT_UNITS_SWAPPED",
    playerId: action.playerId,
    unitIdA: action.unitIdA,
    unitIdB: action.unitIdB,
    mode
  });

  if (isSetupWindow) {
    advanceTacticsSetupQueue(state);
  }
}

/** Declines a start-of-combat Tactics window (FINISH_TACTICS): keep the card. */
export function finishTactics(state: GameState, action: Extract<GameAction, { type: "FINISH_TACTICS" }>): void {
  const combat = state.combat;
  if (!combat || combat.pendingTacticsSwaps?.[0] !== action.playerId) {
    throw new Error("There is no Tactics swap window to decline.");
  }
  advanceTacticsSetupQueue(state);
}

/**
 * "When combat begins" unit abilities (Archangels Few: draw 1 card). Each
 * qualifying unit on the board makes its controller draw from their own deck
 * once the first combat round opens.
 */
function applyCombatStartUnitAbilities(state: GameState): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }

  for (const unit of Object.values(combat.units)) {
    for (const draw of getCombatStartDraws(unit)) {
      const drawn = drawCardsForPlayer(state, unit.controllerId, draw.amount);
      if (drawn > 0) {
        appendEvent(state, {
          type: "UNIT_ABILITY_TRIGGERED",
          unitId: unit.id,
          abilityId: draw.abilityId,
          message: `${unit.name}: ${draw.abilityName} — draw ${drawn} card${drawn === 1 ? "" : "s"}.`
        });
      }
    }
  }
}

/** Siege setup: the defender chooses which middle-row column holds the Gate. */
function openSiegeGateChoice(state: GameState, defenderPlayerId: PlayerId): void {
  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId: defenderPlayerId,
    prompt: "Siege: place the Gate — the other three middle-row spaces get the Walls.",
    options: SIEGE_ROW_POSITIONS.map((position) => ({
      label: `Gate at column ${String.fromCharCode(65 + (position % 4))}`
    })),
    context: "siege-gate",
    returnPhase: "combat"
  };
  state.phase = "choice";
  state.priorityPlayerId = defenderPlayerId;
}

/** Places the Walls, Gate and Arrow Tower, then starts the combat rounds. */
export function resolveSiegeGateChoice(state: GameState, playerId: PlayerId, optionIndex: number): void {
  const combat = state.combat;
  if (!combat || combat.defenderPlayerId !== playerId || combat.context.kind !== "player" || !combat.context.siege) {
    throw new Error("There is no siege gate to place.");
  }

  const gatePosition = SIEGE_ROW_POSITIONS[optionIndex];
  if (gatePosition === undefined) {
    throw new Error("Pick one of the middle-row columns for the Gate.");
  }

  state.pendingChoice = null;

  const towerUnit = makeArrowTowerUnit(`siege_tower_${nextEventNumber(state)}`, playerId);
  combat.units[towerUnit.id] = towerUnit;
  combat.siege = {
    townPlayerId: playerId,
    walls: SIEGE_ROW_POSITIONS.filter((position) => position !== gatePosition),
    gatePosition,
    arrowTowerUnitId: towerUnit.id
  };

  appendEvent(state, {
    type: "SIEGE_FORTIFICATIONS_PLACED",
    playerId,
    wallPositions: combat.siege.walls,
    gatePosition
  });

  beginPlayerCombatRounds(state);

  // Blood Obelisk: "instantly, after your Town has been sieged, Search(4) your
  // discard pile." Opens for the besieged defender at the start of the siege —
  // opened directly because the reward-queue pump is gated off mid-combat.
  if (!state.pendingChoice) {
    const obeliskId = getTownOfPlayer(state, playerId)?.buildings.find(
      (id) => coreBuildingDefinitions[id]?.effect?.type === "RESOURCE_ROUND_SEARCH_DISCARD"
    );
    const obeliskEffect = obeliskId ? coreBuildingDefinitions[obeliskId]?.effect : undefined;
    if (obeliskEffect?.type === "RESOURCE_ROUND_SEARCH_DISCARD") {
      openDiscardPickChoice(state, playerId, { count: 1, fromTop: obeliskEffect.count });
    }
  }
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
  // Player-vs-player: a hero may flee at the start of the combat.
  if (combat?.context.kind === "player") {
    escapePvpCombat(state, action.playerId, "retreat");
    return;
  }

  if (!combat || combat.context.kind !== "neutral") {
    throw new Error("Only combats against neutral units or enemy heroes allow retreating.");
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

export function surrenderFromCombat(
  state: GameState,
  action: Extract<GameAction, { type: "SURRENDER_COMBAT" }>
): void {
  escapePvpCombat(state, action.playerId, "surrender");
}

/**
 * Shared player-vs-player escape, ending the combat as the loser.
 *
 * Retreat (no casualties) is available all through the start of the combat — the
 * defender's pre-combat prep window, while units are being placed, and the
 * post-deployment pause — i.e. any point before the first unit acts. After that
 * the in-fight concede (GIVE_UP_COMBAT, also shown as "Retreat") takes over.
 *
 * Surrender is a "before battle" decision only: it is allowed solely in the
 * defender's prep window, needs the full 10-gold toll in hand and is blocked by
 * Shackles of War. The standard end-of-combat automation (acknowledge →
 * finalize) applies the consequences from the `combat.outcome` reason — see
 * `finalizeAdventureCombat`.
 */
function escapePvpCombat(state: GameState, playerId: PlayerId, reason: "retreat" | "surrender"): void {
  const combat = state.combat;
  if (!combat || combat.context.kind !== "player") {
    throw new Error("Only a player-vs-player combat can be left this way.");
  }
  if (combat.outcome) {
    throw new Error("This combat is already over.");
  }
  const isParticipant = combat.attackerPlayerId === playerId || combat.defenderPlayerId === playerId;
  if (!isParticipant) {
    throw new Error("Only a combat participant may retreat or surrender.");
  }
  // A garrison defended without a hero present has no hero to escape with.
  const heroId =
    playerId === combat.attackerPlayerId ? combat.context.attackerHeroId : combat.context.defenderHeroId;
  if (!heroId) {
    throw new Error("A hero must be present to retreat or surrender.");
  }
  const inPrep = inCombatPrep(state, playerId);
  // Retreat is allowed any time before the fighting begins: a participant's
  // pre-battle prep window, while deploying (combat.setup, round 1), and the
  // post-deployment pause (pvpEscapeWindowOpen). After the first unit acts it is
  // closed.
  const duringPlacement = Boolean(combat.setup) && combat.round === 1;
  if (!inPrep && !duringPlacement && !pvpEscapeWindowOpen(combat)) {
    throw new Error("Retreat is only possible before any unit acts.");
  }
  if (reason === "surrender") {
    // Surrender is a before-battle (prep) decision only — never once deployment
    // has begun.
    if (!inPrep) {
      throw new Error("Surrender is only possible before the battle, during your prep.");
    }
    // Shackles of War (house rule) locks the enemy out of Surrender only.
    if (playerCannotSurrenderCombat(state, playerId)) {
      throw new Error("Shackles of War prevents this hero from surrendering.");
    }
    // Surrender is a paid escape: you must hold the full toll to choose it
    // (no debt). A poorer hero must Retreat or fight on.
    if ((state.players[playerId]?.resources.gold ?? 0) < SURRENDER_GOLD_COST) {
      throw new Error(`Surrender costs ${SURRENDER_GOLD_COST} gold — Retreat or fight on instead.`);
    }
  }
  const winnerPlayerId = playerId === combat.attackerPlayerId ? combat.defenderPlayerId : combat.attackerPlayerId;
  // Escaping straight from the pre-battle prep window ends the fight before it
  // begins: close the prep so the result is shown (the map no longer holds).
  combat.prep = null;
  combat.outcome = { winnerPlayerId, defeatedPlayerId: playerId, reason };
  appendEvent(state, { type: "COMBAT_ENDED", winnerPlayerId, defeatedPlayerId: playerId, reason });
}

/**
 * Give up the combat: a concede a participating hero may choose at any point
 * once the fight is under way (unlike the start-of-combat Retreat / Surrender).
 * Player-vs-player only — a Neutral-guard fight has no Give up, just the
 * end-of-round Retreat. It always ends the combat as a defeat with the full
 * Retreat consequences — the troop / hand cost is applied in
 * `finalizeAdventureCombat` from the `"give-up"` reason (only the casualties
 * taken so far are lost in losing-troop mode; hand discarded in keep-troops mode).
 */
export function giveUpCombat(state: GameState, action: Extract<GameAction, { type: "GIVE_UP_COMBAT" }>): void {
  const combat = state.combat;
  const playerId = action.playerId;
  if (!combat || combat.context.kind !== "player") {
    throw new Error("Only a player-vs-player combat can be given up.");
  }
  if (combat.outcome) {
    throw new Error("This combat is already over.");
  }

  const isParticipant = combat.attackerPlayerId === playerId || combat.defenderPlayerId === playerId;
  if (!isParticipant) {
    throw new Error("Only a combat participant may give up.");
  }
  const heroId =
    playerId === combat.attackerPlayerId ? combat.context.attackerHeroId : combat.context.defenderHeroId;
  if (!heroId) {
    throw new Error("A hero must be present to give up.");
  }
  const winnerPlayerId = playerId === combat.attackerPlayerId ? combat.defenderPlayerId : combat.attackerPlayerId;
  combat.outcome = { winnerPlayerId, defeatedPlayerId: playerId, reason: "give-up" };
  appendEvent(state, { type: "COMBAT_ENDED", winnerPlayerId, defeatedPlayerId: playerId, reason: "give-up" });
}

/**
 * Can this player play a Necromancy ability at this very instant? True only for
 * a Necropolis hero holding a printed Necromancy / Vidomina specialty in hand;
 * a copy drawn from the Ability deck on level-up is kept but never playable
 * (house rule). Drives the after-combat now-or-never window — it opens only for
 * a winner who could actually use it the moment the fight ends.
 */
function playerCanPlayNecromancy(state: GameState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  if (!player || player.factionId !== "necropolis") {
    return false;
  }
  return player.hand.some((cardId) => {
    const card = cardLibrary[cardId];
    return (
      card?.effect.type === "NECROMANCY_REINFORCE" && !(player.deckDrawnAbilityCardIds?.includes(cardId) ?? false)
    );
  });
}

/**
 * Decline the after-combat Necromancy window (BINH house rule). The window is
 * gone for good — it never reopens until the next non-Quick Combat win — and the
 * field reward withheld behind the decision is released now.
 */
export function skipNecromancy(state: GameState, action: Extract<GameAction, { type: "SKIP_NECROMANCY" }>): void {
  const adventure = state.adventure;
  const pending = adventure?.pendingNecromancy;
  if (!adventure || !pending) {
    throw new Error("There is no Necromancy window to skip.");
  }
  if (pending.playerId !== action.playerId) {
    throw new Error("Only the player who won the combat may skip Necromancy.");
  }

  adventure.pendingNecromancy = null;
  const player = state.players[action.playerId];
  if (player) {
    player.necromancyWindow = false;
  }

  // Release the field reward that was held back behind the decision.
  if (pending.heroId && pending.fieldId) {
    beginFieldVisit(state, pending.heroId, pending.fieldId, false);
  }
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

  // No casualties are applied to a player-vs-player fight when either the
  // lobby's "Keep troops" mode is on, or this was a Surrender (house rule: a
  // surrendering hero always keeps its whole army, in both modes). No unit card
  // is removed and no Pack is downgraded — the army cards stay exactly as they
  // entered the fight. Fights against Neutral guards always cost casualties.
  const keepTroops =
    context.kind === "player" && (adventurePvpTroopLoss(state) === "none" || outcome.reason === "surrender");

  // Give up (concede, player-vs-player only): a defeat that costs only the
  // casualties taken up to the point of conceding — destroyed units leave and
  // damaged Packs flip, but survivors stay (it does NOT forfeit the whole army).
  // In losing-troop mode that is exactly the normal casualty settlement below;
  // in keep-troops mode every unit is kept and the conceding hand is discarded
  // instead (handled after the loop). The opponent settles normally either way.
  const gaveUp = outcome.reason === "give-up";
  const giveUpLoserId = gaveUp ? outcome.defeatedPlayerId : null;
  const giveUpKeepsTroops = gaveUp && context.kind === "player" && adventurePvpTroopLoss(state) === "none";

  // Sync army cards with what happened on the board.
  for (const unit of Object.values(combat.units)) {
    if (unit.controllerId === NEUTRAL_PLAYER_ID) {
      // Fixed creature-bank guards were minted for this fight; only deck-drawn
      // guards cycle back to their tier's discard pile.
      if (unit.unitDefId && !unit.bankGuard) {
        const def = unit.grade === "gold" ? "gold" : unit.grade;
        const deck = state.decks[NEUTRAL_DECK_IDS[def as "bronze" | "silver" | "gold" | "azure"]];
        deck?.discardPile.push(unit.unitDefId);
      }
      continue;
    }

    // The army card is left untouched: dead units survive and Packs are not
    // flipped to Few (a defeated Sandro's Cloak still peeled to the discard
    // pile mid-combat — that recyclable card is not a "troop").
    if (keepTroops) {
      continue;
    }

    const player = state.players[unit.controllerId];
    const armyUnit = player?.army.find((candidate) => candidate.id === unit.armyUnitId);
    if (!player || !armyUnit) {
      continue;
    }

    if (unit.damage >= unit.maxHealth) {
      // Few side defeated: the unit card leaves the unit deck. A recruited
      // Neutral card returns to its tier's discard pile.
      discardDefeatedArmyUnit(state, player, armyUnit);
    } else if (armyUnit.side !== "neutral") {
      armyUnit.side = unit.variant === "pack" ? "pack" : "few";
      // Carry the surviving specialty stack (Sandro's Cloak) back to the
      // unit card so it stays on across combats; a defeated Cloak already
      // peeled off into the discard pile mid-combat.
      if (unit.transforms?.length) {
        armyUnit.transforms = unit.transforms.map((entry) => ({ ...entry }));
      } else {
        delete armyUnit.transforms;
      }
    }
  }

  // Keep-troops Give up: the conceding hero loses no unit but discards its whole
  // hand to its discard pile (the cost of conceding when troops are kept).
  if (giveUpKeepsTroops && giveUpLoserId) {
    const player = state.players[giveUpLoserId];
    if (player && player.hand.length > 0) {
      player.discard.push(...player.hand);
      player.hand = [];
    }
  }

  if (context.kind === "neutral") {
    const hero = state.heroes[context.heroId];
    const playerId = hero?.controllerId;
    const field = adventure.fields[context.fieldId];

    if (hero && playerId) {
      if (outcome.winnerPlayerId === playerId) {
        // Secondary Heroes never gain experience from their fights; the gold
        // (Freelancer's Guild) and Necromancy rewards below are player-level
        // and still apply.
        if (hero.kind === "main") {
          const level = hero.level;
          if (context.hasAzure) {
            gainExperience(state, playerId, MAX_EXPERIENCE_GAIN_TO_SEVEN(hero));
          } else if (context.difficulty > level) {
            gainExperience(state, playerId, 2);
          } else if (context.difficulty === level) {
            gainExperience(state, playerId, 1);
          }
        }

        // Freelancer's Guild: "Each time you win against Neutral Units,
        // gain 1 gold."
        const guildId = findTownBuildingWithEffect(state, playerId, "FREELANCERS_GUILD");
        const guild = guildId ? coreBuildingDefinitions[guildId] : null;
        if (guild?.effect?.type === "FREELANCERS_GUILD") {
          gainResources(state, playerId, { gold: guild.effect.winGold }, "Freelancer's Guild bounty");
        }

        // Necromancy window: "Play after winning Combat other than Quick
        // Combat." A fought neutral win opens it; Quick Combat (handled in
        // startNeutralEncounter) never does.
        const winner = state.players[playerId];
        if (winner) {
          winner.necromancyWindow = true;
        }

        // Neutral Skeletons: "After defeating Skeletons, if you control a
        // Necropolis Hero, Reinforce 1 of your bronze units for free." The
        // mid-combat pop-up handles the usual case; this is the fallback for a
        // Skeleton killed last (combat ended before the pop-up could open).
        if (
          combat.skeletonGuardDefeated &&
          !combat.skeletonReinforceGranted &&
          playerId &&
          winner?.factionId === "necropolis"
        ) {
          queueSkeletonReinforce(state, playerId);
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
      // BINH house rule: Necromancy is a now-or-never decision made BEFORE the
      // field reward. If the winner can play it this instant, defer the field
      // visit behind the decision (its reward is withheld until they play or
      // skip); otherwise visit the field immediately as usual.
      if (playerCanPlayNecromancy(state, playerId)) {
        adventure.pendingNecromancy = { playerId, heroId: hero.id, fieldId: context.fieldId };
      } else {
        beginFieldVisit(state, hero.id, context.fieldId, false);
      }
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

  // Surrender (house rule) is a paid escape, not a defeat: the loser keeps every
  // unit (handled by `keepTroops` above), pays a flat toll to the opponent,
  // takes no morale hit, and the opponent gains NOTHING toward winning — no
  // experience, no Necromancy window, and no credit toward the "defeat every
  // enemy hero" victory path. A Retreat or a fought-out loss is a real defeat
  // with the usual consequences (and its 5-gold toll may push the loser into
  // debt — gold can go negative).
  const surrendered = outcome.reason === "surrender";

  if (loserHero) {
    if (surrendered) {
      // The 10-gold toll was required to choose Surrender (no debt) and now
      // transfers to the opponent. The hero falls back home with its full army.
      spendResources(state, loserId, { gold: SURRENDER_GOLD_COST }, "surrendered the combat");
      gainResources(state, winnerId, { gold: SURRENDER_GOLD_COST }, "accepted the enemy's surrender");
      moveDefeatedHeroHome(state, loserHero);
    } else {
      // Winner gains experience by the defeated main hero's level. No experience
      // when no Main Hero stood on either side: a garrison defense win pays
      // nothing, and a Secondary Hero never gains experience from its fights.
      if (winnerHero && winnerHero.kind === "main" && loserHero.kind === "main") {
        if (loserHero.level > winnerHero.level) {
          gainExperience(state, winnerId, 2);
        } else if (loserHero.level === winnerHero.level) {
          gainExperience(state, winnerId, 1);
        }
      }

      // The loser pays the full 5-gold toll to the winner even if it overdraws
      // their treasury (house rule: gold may go negative — paid down by income).
      spendResources(state, loserId, { gold: RETREAT_GOLD_COST }, "defeated by an enemy hero");
      gainResources(state, winnerId, { gold: RETREAT_GOLD_COST }, "spoils of victory");
      changeMorale(state, loserId, -1);
      moveDefeatedHeroHome(state, loserHero);

      // Grail Hunt & Dragon Hunt: beating an enemy main hero counts toward the
      // "defeat every enemy hero at least once" win path (only 2 of the 3 in a
      // 4-player game). A Surrender deliberately never reaches this branch.
      if (
        victoryModeCountsHeroDefeats(adventureVictoryMode(state)) &&
        loserHero.kind === "main" &&
        winnerId !== NEUTRAL_PLAYER_ID &&
        loserId !== winnerId
      ) {
        const defeats = (adventure.heroDefeats ??= {});
        const beaten = (defeats[winnerId] ??= []);
        if (!beaten.includes(loserId)) {
          beaten.push(loserId);
        }
        if (beaten.length >= requiredHeroDefeats(humanPlayerIds(state).length)) {
          declareAdventureWinner(state, winnerId, "defeated the required enemy heroes");
        }
      }
    }
  }

  for (const playerId of [winnerId, loserId]) {
    if (playerId !== NEUTRAL_PLAYER_ID) {
      restoreStartingArmyIfEmpty(state, playerId);
    }
  }

  // Necromancy window opens for the winner of a fought (or retreat) PvP combat —
  // but never on a Surrender, which is not a combat victory for the opponent.
  if (!surrendered && winnerId !== NEUTRAL_PLAYER_ID && state.players[winnerId]) {
    state.players[winnerId].necromancyWindow = true;
  }

  state.combat = null;

  // A win declared above (defeat-every-hero) ends the game; do not reopen turns.
  if (state.adventure?.winnerPlayerId) {
    state.priorityPlayerId = null;
    return;
  }

  state.phase = "player-turn";
  state.activePlayerId = attackerHero?.controllerId ?? state.activePlayerId;
  state.priorityPlayerId = null;

  if (winnerHero && winnerHero.id === context.attackerHeroId) {
    // Same now-or-never Necromancy gate as a neutral win (see above): defer the
    // attacker's field visit behind the decision when they can play it now.
    const winnerPid = winnerHero.controllerId;
    if (playerCanPlayNecromancy(state, winnerPid)) {
      adventure.pendingNecromancy = { playerId: winnerPid, heroId: winnerHero.id, fieldId: context.fieldId };
    } else {
      beginFieldVisit(state, winnerHero.id, context.fieldId, false);
    }
  }
}

function MAX_EXPERIENCE_GAIN_TO_SEVEN(hero: HeroState): number {
  return Math.max(0, 12 - hero.experience);
}

/**
 * Removes a defeated (or conceded) unit card from a player's army. A recruited
 * Neutral card is recycled back to its tier's discard pile rather than lost.
 */
function discardDefeatedArmyUnit(state: GameState, player: PlayerState, armyUnit: ArmyUnitState): void {
  player.army = player.army.filter((candidate) => candidate.id !== armyUnit.id);
  if (armyUnit.side === "neutral") {
    const def = coreUnitDefinitions[armyUnit.unitDefId];
    const tier = (def?.tier ?? "bronze") as "bronze" | "silver" | "gold" | "azure";
    state.decks[NEUTRAL_DECK_IDS[tier]]?.discardPile.push(armyUnit.unitDefId);
  }
}

function moveDefeatedHeroHome(state: GameState, hero: HeroState): void {
  const adventure = state.adventure;
  if (!adventure) {
    return;
  }

  const playerId = hero.controllerId;
  const town = getTownOfPlayer(state, playerId);
  // A defeated Hero "has to move to a friendly Town or Settlement" — but not to
  // their own Town once an enemy has flagged it (rulebook p.76). Settlements
  // are the fallback retreat point; with neither, the Hero leaves the map.
  const townField = town?.fieldId ? adventure.fields[town.fieldId] : null;
  const townUsable = Boolean(townField && (townField.flagOwnerId == null || townField.flagOwnerId === playerId));
  const home =
    (townUsable ? town?.fieldId : null) ??
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

  if (state.combat && !inCombatPrep(state, action.playerId)) {
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

  // Cube buildings (Brimstone Stormclouds): "When built …, place your
  // faction cube here."
  if (building.effect?.type === "COMBAT_CUBES") {
    gainTownCube(state, town, action.buildingId, building.effect.max);
  }
}

/** Where a hired Secondary Hero appears: the main town, else a settlement. */
function secondaryHeroSpawnFieldId(state: GameState, playerId: PlayerId): string | null {
  const town = getTownOfPlayer(state, playerId);
  // "Flagging an enemy Town prevents their Secondary Heroes from spawning
  // there" (rulebook p.76): only spawn at your Town while you still hold it.
  const townField = town?.fieldId ? state.adventure?.fields[town.fieldId] : null;
  if (town?.fieldId && (!townField || townField.flagOwnerId == null || townField.flagOwnerId === playerId)) {
    return town.fieldId;
  }
  const settlement = Object.values(state.adventure?.fields ?? {}).find(
    (field) => field.location === "settlement" && field.flagOwnerId === playerId
  );
  return settlement?.spaceId ?? null;
}

/**
 * Buy a Secondary Hero for 10 gold at your town (or a controlled settlement).
 * It wears the portrait of one of your faction's other heroes; like every
 * Secondary Hero it has 2 movement, plays no cards and never gains experience.
 */
export function hireSecondaryHero(
  state: GameState,
  action: Extract<GameAction, { type: "HIRE_SECONDARY_HERO" }>
): void {
  const player = state.players[action.playerId];
  if (!player) {
    throw new Error("Unknown player.");
  }
  if (state.combat) {
    throw new Error("Town actions cannot interrupt a combat.");
  }
  if (getSecondaryHero(state, action.playerId)) {
    throw new Error("You already field a Secondary Hero.");
  }
  const cost = { gold: 10 };
  if (!hasResources(player, cost)) {
    throw new Error("Hiring a Secondary Hero costs 10 gold.");
  }
  const spaceId = secondaryHeroSpawnFieldId(state, action.playerId);
  if (!spaceId) {
    throw new Error("You need a town or settlement to hire a Secondary Hero.");
  }
  const faction = player.factionId ? coreFactionDefinitions[player.factionId] : undefined;
  if (!faction?.heroes.includes(action.heroDefId)) {
    throw new Error("That hero does not lead your faction.");
  }
  if (action.heroDefId === getMainHero(state, action.playerId)?.heroDefId) {
    throw new Error("Pick a different hero's portrait for the Secondary Hero.");
  }

  spendResources(state, action.playerId, cost, "hired a Secondary Hero");
  createSecondaryHero(state, action.playerId, spaceId, action.heroDefId);
}

export function populationAction(state: GameState, action: Extract<GameAction, { type: "POPULATION_ACTION" }>): void {
  const player = state.players[action.playerId];
  if (!player) {
    throw new Error("Unknown player.");
  }

  if (state.combat && !inCombatPrep(state, action.playerId)) {
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

  // Each purchase's actual (per-unit, non-stacking) discounted cost, kept so the
  // affordability check, the spend and the per-unit log all agree.
  const priced: { ref: RecruitPurchaseRef; finalCost: ResourceCost }[] = [];

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
      // Each unit card exists once: a type already in the army (Few or Pack)
      // cannot be recruited again — reinforce the Few card instead.
      if (armyCopy.some((unit) => unit.unitDefId === purchase.unitDefId)) {
        throw new Error(
          `${coreUnitDefinitions[purchase.unitDefId]?.name ?? "That unit"} is already in your army — each unit card exists once. Reinforce it to a pack instead.`
        );
      }
      // The single best (non-stacking) gold discount reserved for THIS unit —
      // a Legion voucher, a recruit-cost building / event, never their sum.
      const ref: RecruitPurchaseRef = { kind: "recruit", unitDefId: purchase.unitDefId };
      const finalCost = applyBestRecruitDiscount(state, action.playerId, ref, side.cost);
      addCost(finalCost);
      priced.push({ ref, finalCost });
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
      // The single best (non-stacking) gold discount for THIS reinforce: the
      // larger of the Champions' Stables discount and any Legion voucher reserved
      // for this unit — never the two added together.
      // `target` was matched against purchase.armyUnitId above, so target.id is
      // the validated (defined) army unit id.
      const ref: RecruitPurchaseRef = {
        kind: "reinforce",
        unitDefId: purchase.unitDefId,
        armyUnitId: target.id
      };
      const finalCost = applyBestRecruitDiscount(state, action.playerId, ref, packSide.cost);
      addCost(finalCost);
      priced.push({ ref, finalCost });
      target.side = "pack";
    }
  }

  if (!hasRecruitResources(state, action.playerId, totalCost)) {
    throw new Error("Not enough resources for those units.");
  }

  spendRecruitResources(state, action.playerId, totalCost, "population action");
  // The token is NOT consumed by a purchase: the player may keep recruiting and
  // reinforcing this round (BINH house rule). Marking the round "purchased" arms
  // the movement lock — the next time one of this player's heroes moves, the
  // Population window closes (see commitPopulationOnMove).
  player.populationPurchasedThisRound = true;

  for (let index = 0; index < action.purchases.length; index += 1) {
    const purchase = action.purchases[index];
    const finalCost = priced[index]?.finalCost ?? {};
    if (purchase.kind === "recruit") {
      addArmyUnit(player, purchase.unitDefId, "few");
      appendEvent(state, {
        type: "UNIT_RECRUITED",
        playerId: action.playerId,
        unitDefId: purchase.unitDefId,
        kind: "recruit",
        cost: finalCost
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
          cost: finalCost
        });
      }
    }
    // Spend the Legion voucher reserved for this exact unit (single-use).
    consumeRecruitVoucherFor(state, action.playerId, priced[index]!.ref);
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

  if (state.combat && !inCombatPrep(state, action.playerId)) {
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
  gainResources(state, action.playerId, { gold: smith.effect.sellGold }, `sold ${cardLibrary[cardId]?.name ?? cardId} at the Blacksmith`);
}

/**
 * "During your turn" town buildings (once per round each): Cover of Darkness
 * option 1 (discard up to 2 cards, draw that many) and the Castle Gate
 * (pay gold for a random enemy discard, or teleport between owned
 * towns/settlements).
 */
export function activateTownBuilding(state: GameState, action: Extract<GameAction, { type: "USE_TOWN_BUILDING" }>): void {
  const player = state.players[action.playerId];
  const building = coreBuildingDefinitions[action.buildingId];
  const town = getTownOfPlayer(state, action.playerId);
  if (!player || !building || !town?.buildings.includes(action.buildingId)) {
    throw new Error("That building is not available.");
  }

  if (state.combat) {
    throw new Error("Town actions cannot interrupt a combat.");
  }

  if (state.activePlayerId !== action.playerId) {
    throw new Error("Use this building during your own turn.");
  }

  if ((player.buildingUsedRound?.[action.buildingId] ?? 0) === state.round) {
    throw new Error(`${building.name} was already used this round.`);
  }

  const markUsed = () => {
    player.buildingUsedRound = { ...player.buildingUsedRound, [action.buildingId]: state.round };
  };

  if (building.effect?.type === "COVER_OF_DARKNESS") {
    if (action.optionIndex !== 0) {
      throw new Error("The combat option of Cover of Darkness opens at the start of a combat.");
    }
    const cardIds = action.cardIds ?? [];
    if (cardIds.length === 0 || cardIds.length > 2) {
      throw new Error("Discard 1 or 2 cards to draw that many.");
    }
    const handCounts = new Map<string, number>();
    for (const cardId of player.hand) {
      handCounts.set(cardId, (handCounts.get(cardId) ?? 0) + 1);
    }
    for (const cardId of cardIds) {
      const left = handCounts.get(cardId) ?? 0;
      if (left <= 0) {
        throw new Error("Cannot discard a card that is not in hand.");
      }
      handCounts.set(cardId, left - 1);
    }

    markUsed();
    for (const cardId of cardIds) {
      const index = player.hand.indexOf(cardId);
      player.hand.splice(index, 1);
      player.discard.push(cardId);
    }
    appendEvent(state, {
      type: "TOWN_BUILDING_USED",
      playerId: action.playerId,
      buildingId: action.buildingId,
      message: `${building.name}: ${player.name} trades ${cardIds.length} card${cardIds.length === 1 ? "" : "s"} for fresh ones.`
    });
    drawCardsForPlayer(state, action.playerId, cardIds.length);
    return;
  }

  if (building.effect?.type === "CASTLE_GATE") {
    if (action.optionIndex === 0) {
      const target = action.targetPlayerId ? state.players[action.targetPlayerId] : undefined;
      if (!target || action.targetPlayerId === action.playerId || target.id === NEUTRAL_PLAYER_ID) {
        throw new Error("Choose an opponent for the random discard.");
      }
      const cost: ResourceCost = { gold: building.effect.discardCost };
      if (!hasResources(player, cost)) {
        throw new Error("Not enough gold for the Castle Gate.");
      }
      if (target.hand.length === 0) {
        throw new Error("That opponent has no cards in hand.");
      }

      markUsed();
      spendResources(state, action.playerId, cost, building.name);
      discardRandomCard(state, action.playerId, action.buildingId, target.id, building.name);
      return;
    }

    // Option 2: teleport between owned towns/settlements.
    const hero = getMainHero(state, action.playerId);
    const adventure = requireAdventure(state);
    if (!hero?.spaceId || !action.spaceId) {
      throw new Error("Choose the destination town or settlement.");
    }
    const hereOk = isOwnTownOrSettlementField(state, action.playerId, hero.spaceId);
    const thereOk = isOwnTownOrSettlementField(state, action.playerId, action.spaceId) && action.spaceId !== hero.spaceId;
    if (!hereOk || !thereOk) {
      throw new Error("The Castle Gate moves your hero between towns/settlements you control.");
    }

    markUsed();
    const from = hero.spaceId;
    hero.spaceId = action.spaceId;
    adventure.lastVisitedField[hero.id] = action.spaceId;
    appendEvent(state, {
      type: "HERO_MOVED",
      playerId: action.playerId,
      heroId: hero.id,
      from,
      to: action.spaceId,
      movementLeft: hero.movementPoints
    });
    commitPopulationOnMove(state, hero.controllerId);
    appendEvent(state, {
      type: "TOWN_BUILDING_USED",
      playerId: action.playerId,
      buildingId: action.buildingId,
      message: `${building.name} carries the hero to another holding.`
    });
    return;
  }

  throw new Error("That building has no activated use.");
}

/** Whether the field is a town or settlement this player controls. */
function isOwnTownOrSettlementField(state: GameState, playerId: PlayerId, spaceId: MapSpaceId): boolean {
  const field = state.adventure?.fields[spaceId];
  if (!field) {
    return false;
  }
  if (Object.values(state.towns).some((town) => town.fieldId === spaceId && town.controllerId === playerId)) {
    return true;
  }
  return field.location === "settlement" && field.flagOwnerId === playerId;
}

/**
 * Faction cube buildings:
 *  - Brimstone Stormclouds (spell-power): while one of your spells is on the
 *    stack, remove a cube for +1 Power (max 1 cube per spell).
 *  - Cage of Warlords (attack-or-defense): while one of your units' attacks
 *    waits to resolve, remove a cube for +1 attack (you are the attacker) or
 *    +1 defense (your unit is the target). Several cubes may stack on one
 *    attack — the printed "+1 per cube".
 */
export function spendTownCube(state: GameState, action: Extract<GameAction, { type: "SPEND_TOWN_CUBE" }>): void {
  const town = getTownOfPlayer(state, action.playerId);
  const building = coreBuildingDefinitions[action.buildingId];
  if (!town || !town.buildings.includes(action.buildingId) || building?.effect?.type !== "COMBAT_CUBES") {
    throw new Error("That cube building is not available.");
  }

  const cubes = town.factionCubes?.[action.buildingId] ?? 0;
  if (cubes <= 0) {
    throw new Error("No faction cubes are stored on the building.");
  }

  if (building.effect.spend === "spell-power") {
    const stackItem = state.stack.at(-1);
    if (!stackItem || stackItem.action.type !== "CAST_SPELL" || stackItem.action.playerId !== action.playerId) {
      throw new Error("Spend the cube while one of your spells is being cast.");
    }
    if ((stackItem.modifiers.townCubePowerBonus ?? 0) >= 1) {
      throw new Error("Only one cube may power each spell.");
    }
    town.factionCubes = { ...town.factionCubes, [action.buildingId]: cubes - 1 };
    stackItem.modifiers.townCubePowerBonus = (stackItem.modifiers.townCubePowerBonus ?? 0) + 1;
    appendEvent(state, {
      type: "TOWN_BUILDING_USED",
      playerId: action.playerId,
      buildingId: action.buildingId,
      message: `${building.name}: a faction cube burns for +1 Power (${cubes - 1} left).`
    });
    return;
  }

  // attack-or-defense (Cage of Warlords).
  if (action.boost !== "attack" && action.boost !== "defense") {
    throw new Error("Choose +1 attack or +1 defense for the cube.");
  }
  const stackItem = state.stack.at(-1);
  const atkAction = stackItem?.action;
  if (!stackItem || !atkAction || (atkAction.type !== "ATTACK_UNIT" && atkAction.type !== "MOVE_AND_ATTACK_UNIT")) {
    throw new Error("Spend the cube while one of your units' attacks waits to resolve.");
  }
  if (action.boost === "attack") {
    const attacker = state.combat?.units[atkAction.attackerId];
    if (!attacker || attacker.controllerId !== action.playerId) {
      throw new Error("Only the attacking player can spend a cube for +1 attack.");
    }
    stackItem.modifiers.attackBonus += 1;
  } else {
    const defender = state.combat?.units[atkAction.defenderId];
    if (!defender || defender.controllerId !== action.playerId) {
      throw new Error("Only the defending player can spend a cube for +1 defense.");
    }
    stackItem.modifiers.defenseBonus += 1;
  }

  town.factionCubes = { ...town.factionCubes, [action.buildingId]: cubes - 1 };
  appendEvent(state, {
    type: "TOWN_BUILDING_USED",
    playerId: action.playerId,
    buildingId: action.buildingId,
    message: `${building.name}: a faction cube burns for +1 ${action.boost} (${cubes - 1} left).`
  });
}

/**
 * Hall of Valhalla: once per round, while one of your units' attacks is
 * waiting to resolve, that attack gains +1 attack.
 */
export function hallOfValhallaBoost(
  state: GameState,
  action: Extract<GameAction, { type: "HALL_OF_VALHALLA_BOOST" }>
): void {
  const player = state.players[action.playerId];
  const town = getTownOfPlayer(state, action.playerId);
  const building = coreBuildingDefinitions[action.buildingId];
  if (!player || !town?.buildings.includes(action.buildingId) || building?.effect?.type !== "HALL_OF_VALHALLA") {
    throw new Error("The Hall of Valhalla is not available.");
  }

  if ((player.buildingUsedRound?.[action.buildingId] ?? 0) === state.round) {
    throw new Error(`${building.name} was already used this round.`);
  }

  const stackItem = state.stack.at(-1);
  const attackerId =
    stackItem && (stackItem.action.type === "ATTACK_UNIT" || stackItem.action.type === "MOVE_AND_ATTACK_UNIT")
      ? stackItem.action.attackerId
      : null;
  const attacker = attackerId ? state.combat?.units[attackerId] : undefined;
  if (!stackItem || !attacker || attacker.controllerId !== action.playerId) {
    throw new Error("Boost while one of your units' attacks waits to resolve.");
  }

  player.buildingUsedRound = { ...player.buildingUsedRound, [action.buildingId]: state.round };
  stackItem.modifiers.attackBonus += building.effect.amount;

  appendEvent(state, {
    type: "TOWN_BUILDING_USED",
    playerId: action.playerId,
    buildingId: action.buildingId,
    message: `${building.name}: ${attacker.cardName} fights with +${building.effect.amount} attack.`
  });
}

/**
 * Positive morale token, by the book: "Draw a card from your Deck" or
 * "Discard any number of cards, then draw that many cards" — at any time.
 * (The third option, rerolling a die, is offered inside the dice flows.)
 */
export function spendMorale(state: GameState, action: Extract<GameAction, { type: "SPEND_MORALE" }>): void {
  const player = state.players[action.playerId];
  const hasOverflow = (player?.moraleOverflow ?? 0) > 0;
  if (!player || (!hasOverflow && player.morale < 1)) {
    throw new Error("No positive morale token to spend.");
  }

  // Overflow tokens (gained past the +1 cap, awaiting a forced spend) are spent
  // before the stored token and never change its value; the stored token, when
  // spent, drops morale back to neutral.
  const consumeToken = () => {
    appendEvent(state, { type: "MORALE_SPENT", playerId: action.playerId, benefit: action.benefit });
    if ((player.moraleOverflow ?? 0) > 0) {
      player.moraleOverflow = (player.moraleOverflow ?? 0) - 1;
      return;
    }
    player.morale -= 1;
    appendEvent(state, { type: "MORALE_CHANGED", playerId: action.playerId, amount: -1, total: player.morale });
  };

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

    consumeToken();

    for (const cardId of discards) {
      const index = player.hand.indexOf(cardId);
      player.hand.splice(index, 1);
      player.discard.push(cardId);
    }
    drawCardsForPlayer(state, action.playerId, discards.length);
    return;
  }

  consumeToken();
  drawCardsForPlayer(state, action.playerId, 1);
}

/**
 * Rogues (army map ability): "Once during your turn, look at the top card from
 * any deck, then put it back on the top or on the bottom of that deck." Reveals
 * the chosen shared deck's top card to the player and opens the keep/bottom
 * choice. Marks the per-turn use even if no card was revealed (empty deck).
 */
export function roguesScoutDeck(state: GameState, action: Extract<GameAction, { type: "ROGUES_SCOUT_DECK" }>): void {
  assertActiveTurn(state, action.playerId);
  assertNoPendingInput(state);

  const player = state.players[action.playerId];
  if (!player) {
    throw new Error("Unknown player.");
  }
  if (!armyHasMapEffect(state, action.playerId, "MAP_TURN_DECK_PEEK")) {
    throw new Error("No Rogues in your army to scout with.");
  }
  if (player.rogueScoutUsedThisTurn) {
    throw new Error("The Rogues already scouted a deck this turn.");
  }

  const deck = state.decks[action.deckId];
  if (!deck) {
    throw new Error("That deck cannot be scouted.");
  }
  const topCardId = deck.drawPile[deck.drawPile.length - 1];
  if (!topCardId) {
    throw new Error("That deck has no cards to look at.");
  }

  player.rogueScoutUsedThisTurn = true;

  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId: action.playerId,
    prompt: `Rogues scout ${deckDisplayName(state, action.deckId)}: ${cardLibrary[topCardId]?.name ?? topCardId} is on top.`,
    options: [{ label: "Keep it on top" }, { label: "Move it to the bottom" }],
    context: "rogues-scout",
    rogueScout: { deckId: action.deckId, cardId: topCardId },
    returnPhase: "player-turn"
  };
  state.phase = "choice";
  state.priorityPlayerId = action.playerId;
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

  if (choice.context === "war-machine") {
    state.pendingChoice = null;
    state.phase = choice.returnPhase;
    state.priorityPlayerId = null;
    resolveWarMachineOption(state, action.playerId, action.optionIndex);
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

  if (choice.context === "deck-search-mode") {
    const mode = choice.deckSearchMode;
    const player = state.players[action.playerId];
    if (!mode || !player) {
      throw new Error("That search cannot be resolved.");
    }
    state.pendingChoice = null;

    // Option 0 commits to Searching: reveal the top cards and open the keep-one
    // choice (revealSharedDeckSearch fires its own Pendant repeat).
    if (action.optionIndex === 0) {
      state.phase = choice.returnPhase;
      revealSharedDeckSearch(state, action.playerId, mode.deckId, mode.count);
      return;
    }

    const hasDiscardTop = mode.hasDiscardTop ?? false;
    const fetchSchools = mode.schoolFetch ?? [];

    // The remaining options take a card with no reveal: the discard top (when
    // offered, at index 1), then one "draw from a School of Magic" per school.
    if (hasDiscardTop && action.optionIndex === 1) {
      const deck = state.decks[mode.deckId];
      const takenCardId = deck?.discardPile.pop();
      if (!deck || !takenCardId) {
        throw new Error("The discard pile is empty.");
      }
      player.hand.push(takenCardId);
      // Mirror the DECK_SEARCH resolver: an Ability card pulled from the shared
      // deck is tracked so its printed ability can be granted.
      if (mode.deckId === "abilities") {
        (player.deckDrawnAbilityCardIds ??= []).push(takenCardId);
      }
      appendEvent(state, {
        type: "DECK_SEARCH_RESOLVED",
        playerId: action.playerId,
        deckId: mode.deckId,
        choiceId: choice.id,
        pick: "discard-top",
        discardedCardIds: []
      });
    } else {
      // Basic X Magic: draw the first spell of the chosen School straight into
      // hand — you keep whatever you get (the deck reshuffles in performSchoolFetch).
      const school = fetchSchools[action.optionIndex - (hasDiscardTop ? 2 : 1)];
      if (!school) {
        throw new Error("That search option is not available.");
      }
      performSchoolFetch(state, action.playerId, mode.deckId, school);
      appendEvent(state, {
        type: "DECK_SEARCH_RESOLVED",
        playerId: action.playerId,
        deckId: mode.deckId,
        choiceId: choice.id,
        pick: "revealed",
        discardedCardIds: []
      });
    }

    state.phase = choice.returnPhase;
    state.priorityPlayerId = null;

    // Pendant of Courage: the whole Search action repeats once, even when this
    // branch took the discard top or drew from a School of Magic.
    if (takeSearchRepeatEffect(state, action.playerId)) {
      if (state.adventure) {
        state.adventure.rewardQueue.unshift({
          playerId: action.playerId,
          kind: "shared-deck-search",
          deckId: mode.deckId,
          count: mode.count
        });
        pumpAdventureQueues(state);
      } else {
        openSharedDeckSearch(state, action.playerId, mode.deckId, mode.count);
      }
    }
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
        `${state.seed}#discard-into-deck#${action.playerId}#${eventSeedNumber(state)}`
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

  if (choice.context === "hand-discard") {
    const pick = choice.handDiscard;
    const player = state.players[action.playerId];
    const cardId = pick?.cardIds[action.optionIndex];
    if (!pick || !player || !cardId) {
      throw new Error("Pick one of the offered hand cards to discard.");
    }

    const index = player.hand.lastIndexOf(cardId);
    if (index !== -1) {
      player.hand.splice(index, 1);
      player.discard.push(cardId);
    }

    state.pendingChoice = null;
    state.phase = choice.returnPhase;
    state.priorityPlayerId = null;

    // More to discard: reopen. "Drawn-only" keeps shrinking the drawn set;
    // otherwise any remaining hand card is a candidate.
    if (pick.remaining > 1) {
      const nextCandidates = pick.drawnOnly
        ? pick.cardIds.filter((_, candidateIndex) => candidateIndex !== action.optionIndex)
        : [...player.hand];
      if (nextCandidates.length > 0) {
        state.pendingChoice = {
          id: `choice_${nextEventNumber(state)}`,
          type: "OPTION_CHOICE",
          playerId: action.playerId,
          prompt: `Discard ${pick.remaining - 1} more card${pick.remaining - 1 === 1 ? "" : "s"}.`,
          options: nextCandidates.map((id) => ({ label: `Discard ${cardLibrary[id]?.name ?? id}` })),
          context: "hand-discard",
          handDiscard: { cardIds: nextCandidates, remaining: pick.remaining - 1, drawnOnly: pick.drawnOnly },
          returnPhase: choice.returnPhase
        };
        state.phase = "choice";
        state.priorityPlayerId = action.playerId;
      }
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

  if (choice.context === "own-deck-pick") {
    const pick = choice.ownDeckPick;
    const player = state.players[action.playerId];
    const cardId = pick?.cardIds[action.optionIndex];
    if (!pick || !player || !cardId) {
      throw new Error("Pick one of the revealed cards.");
    }

    player.hand.push(cardId);
    player.discard.push(...pick.cardIds.filter((_, index) => index !== action.optionIndex));

    // Adrienne's Fire Magic IV: after the Search(3) pick, shuffle the whole
    // discard pile (including the just-discarded revealed cards) back into the
    // deck.
    if (pick.thenReshuffleDiscard) {
      player.deck = shuffleCards(
        [...player.deck, ...player.discard],
        `${state.seed}#fire-magic-iv#${action.playerId}#${eventSeedNumber(state)}`
      );
      player.discard = [];
    }

    state.pendingChoice = null;
    state.phase = choice.returnPhase;
    state.priorityPlayerId = null;
    return;
  }

  if (choice.context === "artifact-deck-pick") {
    // Tazar's War Hero VI: draw the top of the chosen Artifact deck.
    const pick = choice.artifactDeckPick;
    const deckId = pick?.deckIds[action.optionIndex];
    const player = state.players[action.playerId];
    const deck = deckId ? state.decks[deckId] : undefined;
    if (!pick || !player || !deck) {
      throw new Error("Pick one of the Artifact decks.");
    }
    const drawn = deck.drawPile.pop();
    if (drawn) {
      player.hand.push(drawn);
      appendEvent(state, { type: "CARDS_DRAWN", playerId: action.playerId, count: 1, requested: 1, reshuffledDiscard: false });
    }
    state.pendingChoice = null;
    state.phase = choice.returnPhase;
    state.priorityPlayerId = null;
    return;
  }

  if (choice.context === "rogues-scout") {
    const scout = choice.rogueScout;
    const deck = scout ? state.decks[scout.deckId] : undefined;
    if (!scout || !deck) {
      throw new Error("There is no scouted deck to resolve.");
    }
    // optionIndex 0 keeps the card on top; 1 moves the top card to the bottom.
    if (action.optionIndex === 1 && deck.drawPile.length > 0) {
      const top = deck.drawPile.pop();
      if (top) {
        deck.drawPile.unshift(top);
      }
    }
    state.pendingChoice = null;
    state.phase = choice.returnPhase;
    state.priorityPlayerId = null;
    return;
  }

  if (choice.context === "garrison") {
    resolveGarrisonChoice(state, action.playerId, action.optionIndex);
    return;
  }

  if (choice.context === "dimension-door") {
    resolveDimensionDoorChoice(state, action.playerId, action.optionIndex);
    return;
  }

  if (choice.context === "view-earth") {
    resolveViewEarthChoice(state, action.playerId, action.optionIndex);
    return;
  }

  if (choice.context === "siege-gate") {
    resolveSiegeGateChoice(state, action.playerId, action.optionIndex);
    return;
  }

  if (choice.context === "cover-of-darkness") {
    resolveCoverOfDarknessChoice(state, action.playerId, action.optionIndex);
    return;
  }

  if (choice.context === "shackles-of-war") {
    resolveShacklesChoice(state, action.playerId, action.optionIndex);
    return;
  }

  if (choice.context === "diplomacy-skip") {
    resolveDiplomacySkipChoice(state, action.playerId, action.optionIndex);
    return;
  }

  if (choice.context === "diplomacy-recruit") {
    resolveDiplomacyRecruitChoice(state, action.playerId, action.optionIndex);
    return;
  }

  if (choice.context === "learning-level-up") {
    resolveLearningLevelUpChoice(state, action.playerId, action.optionIndex);
    return;
  }

  if (choice.context === "fortune-boost") {
    resolveFortuneBoostChoice(state, action.playerId, action.optionIndex);
    return;
  }

  if (choice.context === "visions-boost") {
    resolveVisionsBoostChoice(state, action.playerId, action.optionIndex);
    return;
  }

  if (choice.context === "visions-deck") {
    resolveVisionsDeckChoice(state, action.playerId, action.optionIndex);
    return;
  }

  if (choice.context === "visions-scry") {
    resolveVisionsScryChoice(state, action.playerId, action.optionIndex);
    return;
  }

  if (choice.context === "skeleton-reinforce") {
    resolveSkeletonReinforceChoice(state, action.playerId, action.optionIndex);
    return;
  }

  if (choice.context === "siege-demolish") {
    resolveSiegeDemolishChoice(state, action.playerId, action.optionIndex);
    return;
  }

  if (choice.context === "remove-obstacle") {
    resolveRemoveObstacleChoice(state, action.playerId, action.optionIndex);
    return;
  }

  if (choice.context === "city-hall") {
    // Options are carried in the pending choice (game state), so the pick stays
    // resolvable across a reload/reconnect.
    const option = choice.cityHall?.options[action.optionIndex];
    if (!option) {
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
    if (option.drawCards) {
      drawCardsForPlayer(state, action.playerId, option.drawCards);
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
    if (option.tradingPost) {
      // Fortress City Hall: open a Trading Post to exchange resources, exactly
      // like stepping onto a Trading Post field.
      state.adventure?.rewardQueue.push({
        playerId: action.playerId,
        kind: "visit-steps",
        steps: [{ type: "TRADING_POST" }]
      });
    }
  }

  state.pendingChoice = null;
  state.phase = choice.returnPhase;
  state.priorityPlayerId = null;
}

// ---------------------------------------------------------------------------
// Turn and round flow
// ---------------------------------------------------------------------------

/**
 * Adjacent fields a hero may step onto for an "end of turn move" effect
 * (Logistics basic, Nomads). The rulebook/wiki definition of an *empty* field:
 * "Fields are considered empty if they cannot provide an effect or no longer
 * provide an effect. This means that fields with black cubes or the player's
 * faction cubes count as empty." Concretely a destination qualifies when it is
 *   - a truly empty field (location category "empty"), OR
 *   - a used visitable (it carries a black cube — its effect is spent), OR
 *   - a flaggable field or town already flagged by THIS player (their faction
 *     cube — stepping back on triggers nothing).
 * Anything that can still trigger — an unvisited visitable, an unflagged or
 * enemy mine/town, undefeated guards — is NOT empty. Blocked and occupied
 * fields, and edges the hero cannot cross, are excluded too.
 */
export function getEndTurnMoveDestinations(state: GameState, playerId: PlayerId): MapSpaceId[] {
  const adventure = state.adventure;
  const hero = getMainHero(state, playerId);
  if (!adventure || !hero?.spaceId) {
    return [];
  }

  return getAdjacentSpaceIds(hero.spaceId).filter((spaceId) => {
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
}

/** Queues the "move to an adjacent empty field, or stay" end-turn choice. */
function offerEndTurnAdjacentMove(state: GameState, playerId: PlayerId, prompt: string): boolean {
  const adventure = state.adventure;
  const hero = getMainHero(state, playerId);
  if (!adventure || !hero) {
    return false;
  }

  const destinations = getEndTurnMoveDestinations(state, playerId);
  if (destinations.length === 0) {
    return false;
  }

  adventure.rewardQueue.push({
    playerId,
    kind: "visit-steps",
    steps: [
      {
        type: "CHOOSE_ONE",
        prompt,
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

/**
 * Logistics (basic) trigger: when the turn is about to end and the played
 * Logistics effect is active, offer the free step onto an adjacent empty
 * field. Consumes the effect either way.
 */
function queueLogisticsEndTurnMove(state: GameState, playerId: PlayerId): boolean {
  const effect = state.activeEffects.find(
    (candidate) =>
      candidate.controllerId === playerId &&
      candidate.modifiers.some((modifier) => modifier.type === "END_TURN_ADJACENT_MOVE")
  );
  if (!state.adventure || !effect) {
    return false;
  }

  state.activeEffects = state.activeEffects.filter((candidate) => candidate.id !== effect.id);
  return offerEndTurnAdjacentMove(state, playerId, "Logistics: move your hero to an adjacent empty field?");
}

/**
 * Nomads (army map ability): "At the end of your turn, move your Hero's model
 * to an adjacent empty field." Offered once per turn (a per-turn flag stops
 * the End Turn re-send from re-opening it).
 */
function queueNomadEndTurnMove(state: GameState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  if (!player || player.nomadStepDoneThisTurn) {
    return false;
  }
  if (!armyHasMapEffect(state, playerId, "MAP_END_TURN_HERO_STEP")) {
    return false;
  }
  if (!offerEndTurnAdjacentMove(state, playerId, "Nomads: move your hero to an adjacent empty field?")) {
    return false;
  }
  player.nomadStepDoneThisTurn = true;
  return true;
}

export function endTurnAdventure(state: GameState, action: Extract<GameAction, { type: "END_TURN" }>): void {
  assertActiveTurn(state, action.playerId);
  assertNoPendingInput(state);

  // Logistics (basic) and Nomads (army map ability): "At the end of your turn,
  // move your Hero's model to an adjacent empty field." Each opens its own
  // choice once; the turn really ends on a later End Turn with none pending.
  if (queueLogisticsEndTurnMove(state, action.playerId)) {
    return;
  }
  if (queueNomadEndTurnMove(state, action.playerId)) {
    return;
  }

  const player = state.players[action.playerId];
  if (player) {
    // The after-combat Necromancy window closes when the turn ends.
    player.necromancyWindow = false;
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

  // Player Elimination clock (rulebook p.11, house rule: 2 of your own turns
  // instead of 3 full Rounds). A player who controls no Town and no Settlement
  // counts down here; reaching 0 removes them at the end of this turn. Holding a
  // base keeps the clock clear. Settlements explicitly prevent elimination.
  let eliminateEnding: { reason: string } | null = null;
  if (player && !player.eliminated) {
    if (controlsTownOrSettlement(state, action.playerId)) {
      player.eliminationCountdown = null;
    } else {
      if (player.eliminationCountdown == null) {
        player.eliminationCountdown = ELIMINATION_GRACE_TURNS;
      }
      player.eliminationCountdown -= 1;
      appendEvent(state, {
        type: "PLAYER_ELIMINATION_CLOCK",
        playerId: action.playerId,
        turnsLeft: Math.max(0, player.eliminationCountdown)
      });
      if (player.eliminationCountdown <= 0) {
        eliminateEnding = { reason: "spent the grace period with no Town or Settlement" };
      }
    }
  }

  advanceAfterTurn(state, action.playerId, eliminateEnding);
}

/**
 * Ends the active player's turn and starts the next living player's. When
 * `eliminate` is set the ending player is removed first (gave up, or the
 * elimination clock expired). The next player and the round wrap are read from
 * the order *before* removal, so only the ending seat drops out and the
 * rotation stays stable. Ongoing cards last "until the player who played them
 * starts their next Turn" and expire inside startPlayerTurn.
 */
function advanceAfterTurn(
  state: GameState,
  endingPlayerId: PlayerId,
  eliminate: { reason: string } | null,
  gaveUp = false
): void {
  const order = state.turnOrder;
  const currentIndex = order.indexOf(endingPlayerId);
  const nextIndex = order.length > 0 ? (currentIndex + 1) % order.length : 0;
  const wrapsRound = nextIndex === 0;
  const nextPlayerId = order[nextIndex];

  appendEvent(state, {
    type: "TURN_ENDED",
    playerId: endingPlayerId,
    nextPlayerId: nextPlayerId ?? endingPlayerId
  });

  if (eliminate) {
    eliminatePlayer(state, endingPlayerId, eliminate.reason, gaveUp);
    if (state.phase === "game-over" || state.adventure?.winnerPlayerId) {
      return;
    }
  }

  if (wrapsRound) {
    state.round += 1;
    startAdventureRound(state);
    if (state.phase === "game-over" || state.adventure?.winnerPlayerId) {
      return;
    }
  }

  // After the possible elimination, `nextPlayerId` still names a living player
  // (only `endingPlayerId` could have been removed). Guard the degenerate case
  // where nothing valid remains to advance to.
  if (!nextPlayerId || !state.turnOrder.includes(nextPlayerId)) {
    return;
  }

  state.activePlayerId = nextPlayerId;
  state.turn.observingPlayerId = nextPlayerId;
  startPlayerTurn(state, nextPlayerId);
}

/**
 * GIVE_UP: the player concedes, is removed from the game, and becomes an
 * observer; the game continues with one fewer player and the last faction
 * standing wins. Legal only on the player's own quiet map turn — never while a
 * Combat is open ("you cannot surrender when defending your Faction Town").
 */
export function giveUpAdventure(state: GameState, action: Extract<GameAction, { type: "GIVE_UP" }>): void {
  if (state.mode !== "adventure" || !state.adventure) {
    throw new Error("Giving up is only possible during an adventure game.");
  }
  assertActiveTurn(state, action.playerId);
  assertNoPendingInput(state);
  const player = state.players[action.playerId];
  if (!player || player.eliminated) {
    throw new Error("That player is not in the game.");
  }

  advanceAfterTurn(state, action.playerId, { reason: "gave up and became an observer" }, true);
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
 * Opens a "Search X" on a shared deck. When that deck's discard pile is not
 * empty, the rulebook gives the player an either/or — Search the deck (reveal
 * the top X, keep one) OR take the top of the discard pile — and the searched
 * cards may only be looked at once the player commits to searching. So this
 * raises an up-front two-option choice first and only reveals cards down the
 * "Search" branch. With an empty discard pile there is nothing to take, so it
 * reveals and opens the DECK_SEARCH straight away.
 */
export function openSharedDeckSearch(state: GameState, playerId: PlayerId, deckId: string, baseCount: number): void {
  const deck = state.decks[deckId];
  if (!deck) {
    return;
  }

  // Basic X Magic: "Instead of Searching the Spell deck, find the first <School>
  // Magic spell…". The draw is an alternative TO searching, decided up front —
  // before any card is revealed — never alongside the revealed cards.
  const schoolFetch = isSpellDeck(deckId) ? activeSchoolFetches(state, playerId) : [];
  // The "take the top discard" branch is only offered when the hero may actually
  // take that card — taking it skips no redraw, so a duplicate / Necromancy /
  // starting-only top would dodge the acquisition rules. When the top is off
  // limits the player just searches the deck (which redraws past such cards).
  const discardTop = deck.discardPile.length > 0 ? deck.discardPile[deck.discardPile.length - 1] : null;
  const discardTopId = discardTop && canAcquireSharedDeckCard(state, playerId, deckId, discardTop) ? discardTop : null;

  if (discardTopId || schoolFetch.length > 0) {
    // Show the base search size in the label only — the real count override
    // (Scouting) is consumed when the player actually reveals, not here, so an
    // up-front discard/fetch leaves any override intact for a later search.
    const options: { label: string }[] = [{ label: `Search (${baseCount}) — look at the top cards and keep one` }];
    if (discardTopId) {
      options.push({ label: `Take the top discard (${cardLibrary[discardTopId]?.name ?? discardTopId})` });
    }
    for (const school of schoolFetch) {
      const schoolName = `${school.charAt(0).toUpperCase()}${school.slice(1)}`;
      options.push({ label: `Draw the first ${schoolName} Magic spell — take it into hand` });
    }

    state.pendingChoice = {
      id: `choice_${nextEventNumber(state)}`,
      type: "OPTION_CHOICE",
      playerId,
      prompt:
        schoolFetch.length > 0
          ? `Search the ${deckId} deck, or draw from a School of Magic instead?`
          : `Search the ${deckId} deck, or take its top discard?`,
      options,
      context: "deck-search-mode",
      deckSearchMode: {
        deckId,
        count: baseCount,
        ...(schoolFetch.length > 0 ? { schoolFetch } : {}),
        hasDiscardTop: Boolean(discardTopId)
      },
      returnPhase: state.combat ? "combat" : "player-turn"
    };
    state.phase = "choice";
    state.priorityPlayerId = playerId;
    return;
  }

  revealSharedDeckSearch(state, playerId, deckId, baseCount);
}

/**
 * Basic X Magic, the up-front "draw instead of Searching": take the deck's first
 * spell of `school` (Magic Arrow's "any" counts) straight into hand, then
 * reshuffle the deck. Returns the taken card id, or null when the deck holds no
 * matching spell. No cards are revealed — this replaces the Search entirely.
 */
function performSchoolFetch(state: GameState, playerId: PlayerId, deckId: string, school: SpellSchool): CardId | null {
  const deck = state.decks[deckId];
  const player = state.players[playerId];
  if (!deck || !player) {
    return null;
  }

  let fetchedCardId: CardId | null = null;
  for (let index = deck.drawPile.length - 1; index >= 0; index -= 1) {
    const candidateId = deck.drawPile[index];
    // Skip any spell of the school the hero cannot take (already owns it, or it
    // is starting-only) — the fetch redraws to the next matching spell.
    if (!canAcquireSharedDeckCard(state, playerId, deckId, candidateId)) {
      continue;
    }
    const schools = cardLibrary[candidateId]?.spellSchools ?? [];
    if (schools.includes(school) || schools.includes("any")) {
      fetchedCardId = candidateId;
      deck.drawPile.splice(index, 1);
      break;
    }
  }

  if (fetchedCardId) {
    player.hand.push(fetchedCardId);
  }
  deck.drawPile = shuffleCards(deck.drawPile, `${state.seed}#school-fetch#${eventSeedNumber(state)}`);
  return fetchedCardId;
}

/**
 * Reveals the top of a shared deck and opens the DECK_SEARCH "keep one" choice,
 * applying Scouting search-size overrides and the Pendant of Courage repeat. The
 * discard-top and Basic X Magic "draw from a School of Magic" alternatives are
 * never offered here — they are resolved up front, before any reveal (see
 * `openSharedDeckSearch`), so a player can never both peek the deck and still
 * take the discard top or fetch.
 */
export function revealSharedDeckSearch(state: GameState, playerId: PlayerId, deckId: string, baseCount: number): void {
  const deck = state.decks[deckId];
  if (!deck) {
    return;
  }

  const count = applySearchCountEffects(state, playerId, baseCount);
  const revealedCardIds: string[] = [];
  // Redraw past any card this hero may not take — a duplicate of one it already
  // owns, a Necromancy it cannot use, or a starting-only spell — and also past a
  // second copy of a card already revealed in this same search, so a single
  // reveal never shows two of the same card. Skipped cards are set aside and
  // tucked back under the deck afterwards (not discarded), so the deck keeps both
  // copies for the other players and the revealed batch alone is what was drawn.
  const skippedCardIds: string[] = [];
  while (revealedCardIds.length < count) {
    const cardId = deck.drawPile.pop();
    if (!cardId) {
      break;
    }
    if (canAcquireSharedDeckCard(state, playerId, deckId, cardId) && !revealedCardIds.includes(cardId)) {
      revealedCardIds.push(cardId);
    } else {
      skippedCardIds.push(cardId);
    }
  }
  if (skippedCardIds.length > 0) {
    // Bottom of the draw pile (front of the array, since the top is the last
    // element) — never re-reached within this reveal, so there is no loop.
    deck.drawPile.unshift(...skippedCardIds);
  }

  // Basic X Magic's "draw instead of Searching" is offered up front (see
  // openSharedDeckSearch), so reaching this reveal means the player chose to
  // Search — only the keep-one picks apply here.
  const repeats = takeSearchRepeatEffect(state, playerId);

  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "DECK_SEARCH",
    playerId,
    deckId,
    revealedCardIds,
    ...(repeats ? { repeatSearch: { deckId, count: baseCount } } : {}),
    returnPhase: state.combat ? "combat" : "player-turn"
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
/**
 * Opens a "Search(N) your discard pile, take 1" choice (Scholar, Rib Cage,
 * Blood Obelisk). Returns false (opening nothing) when no card qualifies, so
 * callers can fall through. Used both by the reward-queue pump and directly by
 * the Blood Obelisk siege trigger (which fires mid-combat, where the pump is
 * gated off).
 */
function openDiscardPickChoice(
  state: GameState,
  playerId: PlayerId,
  pick: {
    count: number;
    filter?: "spell" | "non-artifact" | "specialty" | "power-or-knowledge-statistic" | "spell-or-specialty";
    fromTop?: number;
    shuffleRestIntoDeck?: boolean;
  }
): boolean {
  const player = state.players[playerId];
  if (!player) {
    return false;
  }

  const pool = pick.fromTop ? player.discard.slice(-pick.fromTop) : [...player.discard];
  const candidates = pool.filter((cardId) => {
    const kind = cardLibrary[cardId]?.kind;
    if (pick.filter === "spell") {
      return kind === "spell";
    }
    if (pick.filter === "non-artifact") {
      return kind !== "artifact";
    }
    if (pick.filter === "specialty") {
      return kind === "hero-specialty";
    }
    if (pick.filter === "spell-or-specialty") {
      return kind === "spell" || kind === "hero-specialty";
    }
    if (pick.filter === "power-or-knowledge-statistic") {
      const statisticType = cardLibrary[cardId]?.statisticType;
      return kind === "statistic" && (statisticType === "power" || statisticType === "knowledge");
    }
    return true;
  });

  if (candidates.length === 0) {
    return false;
  }

  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt: `Take a card from your discard pile${pick.count > 1 ? ` (${pick.count} left)` : ""}`,
    options: candidates.map((cardId) => ({ label: `Take ${cardLibrary[cardId]?.name ?? cardId}` })),
    context: "discard-pick",
    discardPick: {
      cardIds: candidates,
      remaining: pick.count,
      filter: pick.filter,
      fromTop: pick.fromTop,
      shuffleRestIntoDeck: pick.shuffleRestIntoDeck
    },
    returnPhase: state.combat ? "combat" : "player-turn"
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
  return true;
}

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

  // A participant preparing for a PvP fight may buy spells / build a Mage Guild,
  // which queue a Spell-deck search to resolve — so the queue pumps during the
  // prep window even though a combat object exists. Every other combat blocks it.
  const inPrep = Boolean(state.combat?.prep);
  if ((state.combat && !inPrep) || state.pendingChoice || state.reactionWindow || state.stack.length > 0) {
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

    if (reward.kind === "field-visit") {
      // A post-combat field visit that was deferred behind the Necromancy
      // decision: now that the reinforce (if any) has been paid for, the field
      // reward finally lands.
      adventure.rewardQueue.shift();
      beginFieldVisit(state, reward.heroId, reward.fieldId, false);
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
        const choiceId = `choice_${nextEventNumber(state)}`;
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
      if (
        openDiscardPickChoice(state, reward.playerId, {
          count: reward.count,
          filter: reward.filter,
          fromTop: reward.fromTop,
          shuffleRestIntoDeck: reward.shuffleRestIntoDeck
        })
      ) {
        return;
      }
      continue;
    }

    if (reward.kind === "city-hall-choice") {
      const building = coreBuildingDefinitions[reward.buildingId];
      if (building?.effect?.type !== "RESOURCE_ROUND_CHOICE") {
        adventure.rewardQueue.shift();
        continue;
      }

      adventure.rewardQueue.shift();
      state.pendingChoice = {
        id: `choice_${nextEventNumber(state)}`,
        type: "OPTION_CHOICE",
        playerId: reward.playerId,
        prompt: `${building.name}: choose this round's bonus`,
        options: building.effect.options.map((option) => ({ label: option.label })),
        context: "city-hall",
        // Carry the full option payloads in state so resolution does not depend
        // on any off-state cache that a reload/reconnect would wipe.
        cityHall: { options: building.effect.options },
        returnPhase: state.phase === "choice" ? "player-turn" : state.phase
      };
      state.phase = "choice";
      state.priorityPlayerId = reward.playerId;
      return;
    }

    if (reward.kind === "learning-level-up") {
      adventure.rewardQueue.shift();
      if (openLearningLevelUpChoice(state, reward.playerId)) {
        return;
      }
      continue;
    }

    if (reward.kind === "start-turn-hand") {
      // Phase divider (queued last by startPlayerTurn). Take the hand-limit
      // snapshot only once EVERY other start-of-turn reward has cleared —
      // including follow-up rewards a round-start effect enqueues BEHIND it
      // (e.g. Wall of Knowledge / Blood Obelisk turn a CHOOSE_ONE into a fresh
      // discard-pick reward; the City Hall draw is just an option resolution).
      // While anything else is still queued, send the snapshot to the back and
      // let those resolve first; only take it when it stands alone. The queue is
      // a finite, non-regenerating set of start-of-turn rewards, so this settles.
      adventure.rewardQueue.shift();
      if (adventure.rewardQueue.length > 0) {
        adventure.rewardQueue.push(reward);
        continue;
      }
      finalizeStartOfTurnHand(state, reward.playerId);
      continue;
    }
  }
}


import { cardLibrary } from "@/data/cards/library";
import {
  coreBuildingDefinitions,
  coreFactionDefinitions,
  coreHeroDefinitions,
  factoryGoldUnitConflict
} from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities } from "@/data/units/abilities";
import { CREATURE_BANKS, type CreatureBankId } from "@/data/map/creature-banks";
import { isMarketLocation, locationDefinitions, TRADE_RATES } from "@/data/map/locations";
import { recordVpHeroDefeat, recordVpSurrender, recordVpUtopiaDefeat } from "./victory-points";
import { allTileDefinitions } from "@/data/map/tiles";
import {
  addArmyUnit,
  applyAstrologersHeroEmpower,
  adventurePvpTroopLoss,
  adventureVictoryMode,
  armyHasMapEffect,
  beginFieldVisit,
  beginNextPendingStartTileRotation,
  canDigGrail,
  grailObelisksRequired,
  grailObelisksVisitedCount,
  obeliskRoleIsMonolith,
  buildCreatureBankCombatUnits,
  canCrossEdge,
  canHeroReachPlacedTile,
  canHeroReachPlacementCenter,
  canPlaceTileAt,
  creatureBankTierForGroup,
  applyRecruitGoldDiscount,
  changeMorale,
  classifyHeroStep,
  commitPopulationOnMove,
  consumeRecruitVoucherFor,
  controlsTownOrSettlement,
  createSecondaryHero,
  secondaryHeroPlacementFields,
  secondaryHeroPlacementStep,
  adventureSeatCount,
  declareAdventureWinner,
  drawFromNeutralDeck,
  drawGuardArmy,
  effectiveHandLimit,
  fieldCreatureBankId,
  grantCreatureBankReward,
  isCreatureBankId,
  placeCreatureBank,
  polishBankSizeForAttackRolls,
  eliminatePlayer,
  finalizeStartOfTurnHand,
  fieldLayer,
  recomputeSubterraneanGates,
  planGateChoiceForReveal,
  upsertGatePlan,
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
  freeSpellBookActive,
  abilityRollRerollActive,
  gainExperience,
  gainResources,
  gainTownCube,
  getActiveAstrologersCard,
  getAstrologersState,
  getAdjacentSpaceIds,
  type RecruitPurchaseRef,
  getHeroMovementCapabilities,
  getMainHero,
  neutralBattleLevel,
  getTileFootprintSpaceIds,
  getTownOfPlayer,
  getUnitSide,
  hasFreeBronzeReinforceTarget,
  hasRecruitResources,
  hasResources,
  heroAtSpace,
  heroCanDiscoverTileAcrossBorders,
  instantiateTile,
  isFieldGuarded,
  isOuterEdgeSealed,
  isTileSlotDesignedSealed,
  isSharedEventBookkeepingReward,
  seaStepHalts,
  makeCombatUnitFromArmy,
  makeCombatUnitFromNeutral,
  materializeTileFields,
  MAX_EXPERIENCE,
  ASTROLOGERS_DECK_ID,
  NEUTRAL_DECK_IDS,
  dropPendingMapToken,
  placementTokenLabel,
  placeMapToken,
  placeNeutralUnits,
  playerDwellingTiers,
  processPendingVisit,
  pvpAttacksBanned,
  queueExplorersEmpower,
  queueFreeBronzeReinforce,
  queueSkeletonReinforce,
  recordLevelUpAbilityPick,
  clearPendingLevelUpAbilitySearch,
  reinforceArmyUnit,
  reinforceCostFor,
  resolveMagicUniversityDig,
  restoreStartingArmyIfEmpty,
  SCHOLAR_STAT_CARDS,
  setOnMapTileRevealHook,
  spendRecruitResources,
  spendResources,
  startAdventureRound,
  startPlayerTurn,
  swapNeutralDraw,
  tokenPlacementCandidates,
  townHasBuildingEffect,
  unlockedRecruitTiers,
  victoryModeCountsHeroDefeats,
  type NeutralDraw
} from "./adventure";
import { ATTACK_DIE_FACES } from "./battlefield";
import { appendExpiredEffectEvents, pvpEscapeWindowOpen } from "./combat-units";
import { applyUnitCurrentSide } from "./unit-transforms";
import {
  COMMANDER_MASTERY_MIN_HERO_LEVEL,
  COMMANDER_STAT_KEYS,
  commanderDefinitions,
  commanderReviveCost,
  type CommanderSlug
} from "@/data/commanders";
import {
  applyCommanderCombatStart,
  collectFirstAidCandidates,
  commanderGradesOf,
  commandersModuleEnabled,
  finalizeCommandersAfterCombat,
  injectCommanderIntoCombat,
  playerHasLivingCommander,
  type CommanderFirstAidOption
} from "./commanders";
import { expireEffectsForCombatEnd, makeActiveEffect, playerCannotSurrenderCombat } from "./active-effects";
import { assignCombatBoardArt } from "./combat-board-art";
import { cardCanBoostPower } from "./effects";
import { bakeEntropy, createSeededRandom } from "./random";
import {
  destroyFortification,
  intactFortificationPositions,
  isArrowTowerUnit,
  makeArrowTowerUnit,
  SIEGE_ROW_POSITIONS
} from "./siege";
import { drawCardsForPlayer, shuffleCards } from "./decks";
import { getCombatStartDraws, getCombatStartMark } from "./unit-abilities";
import { appendEvent, eventSeedNumber, nextEventNumber } from "./events";
import {
  consumeHeldMoraleCard,
  discardHeldMoraleCardByIndex,
  moraleCardsRuleEnabled,
  openMoralePositiveLimitChoiceIfNeeded,
  returnHeldMoraleCardToDeckBottom
} from "./morale-cards";
import { MORALE_CARD_IDS } from "@/data/cards/morale";
import { placeCombatToken, removeToken } from "./tokens";
import { applyComputerGuaranteedWin } from "./computer/guaranteed-wins";
import {
  applyComputerCombatBoost,
  removeComputerCombatBoost,
} from "./computer/combat-boost";
import { neutralCombatControllerId } from "./neutral-control";
import {
  assertParallelInteractionFree,
  hasOpenAdventureTurn,
  isParallelActor,
  parallelInteractionBlocker,
  parallelSlotSignature,
  parallelTurnsActive,
  parallelTurnStartAlreadyRan,
  parallelWaitMessage,
  remainingParallelPlayerIds,
  stopParallelTurns
} from "./parallel-turns";
import {
  applyPermanentCombatEffects,
  getPermanentCardIds,
  removePermanentFromPlayToRemoved,
  resolveWarMachineOption,
  startWarMachineRound
} from "./permanents";
import { seedRunesForCombat } from "./runes";
import {
  activeSchoolFetches,
  applySearchCountEffects,
  canAcquireSharedDeckCard,
  canPlayExpertMode,
  deckDisplayName,
  abilityExpertIsCrownFree,
  eligibleArtifactDecks,
  eligibleSpellDecks,
  expertUsesAvailable,
  getRuleset,
  isSpellDeck,
  spellBookRuleEnabled,
  spellCanEnterSpellBook,
  unitSideRuleOverrides,
  wisdomGoldDiscount,
  wisdomSearchCount
} from "./ruleset";
import { houseRuleEnabled } from "./house-rules";
import {
  polishArmyUnitCanBuyStack,
  polishArmyUnitStackCost,
  polishUnitStackCost
} from "./polish-unit-stacks";
import {
  CAST_A_SPELL_CARD_ID,
  gainOwnedCard,
  polishSpellBookEnabled
} from "./polish-spell-book";
import {
  HEX_DIRECTIONS,
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
  BankSize,
  CardDefinition,
  CardId,
  CombatState,
  CombatUnitState,
  DeckId,
  GameAction,
  GamePhase,
  GameState,
  HeroId,
  HeroState,
  MapFieldState,
  MapSpaceId,
  MapTileState,
  PlayerId,
  PlayerState,
  SubterraneanGateChoiceCandidate,
  ResourceCost,
  ResourceKind,
  SpellSchool,
  ThievesGuildTarget,
  VisitStep
} from "./state";
import { GRAIL_OBELISKS_REQUIRED, NEUTRAL_PLAYER_ID, UNOPENED_FAR_TILE } from "./state";


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
    // Mid-combat reinforce also upgrades the unit ON the board. Without this,
    // finalizeAdventureCombat's army-sync rewrites `armyUnit.side` from the
    // combat unit's still-Few `variant` and the free Pack flips back to Few.
    const combatUnit = state.combat
      ? Object.values(state.combat.units).find(
          (candidate) => candidate.controllerId === playerId && candidate.armyUnitId === armyUnitId
        )
      : undefined;
    // Alive = not yet lethal; avoid importing isUnitAlive (legal-actions ↔ this
    // module cycle).
    if (combatUnit && combatUnit.variant === "few" && combatUnit.damage < combatUnit.maxHealth) {
      combatUnit.variant = "pack";
      applyUnitCurrentSide(combatUnit, getRuleset(state), unitSideRuleOverrides(state));
    }
  }
}

/** Attacker rows on the 4x5 board (bottom from the attacker's seat). */
export const ATTACKER_FRONTLINE = [12, 13, 14, 15];
export const ATTACKER_BACKLINE = [16, 17, 18, 19];
export const DEFENDER_FRONTLINE = [4, 5, 6, 7];
export const DEFENDER_BACKLINE = [0, 1, 2, 3];
export const COMBAT_UNIT_LIMIT = 5;
/**
 * WOG Commanders module: the commander itself is the army's fifth body, so a
 * player deploys at most 4 army units — the commander takes the 5th slot.
 */
export const COMMANDER_COMBAT_UNIT_LIMIT = 4;

/** Per-game deployment cap (4 with the WOG Commanders module, else 5). */
export function combatUnitLimit(state: GameState): number {
  return commandersModuleEnabled(state) ? COMMANDER_COMBAT_UNIT_LIMIT : COMBAT_UNIT_LIMIT;
}

/**
 * Creature Bank battlefield (rulebook Creature Bank setup): unlike a normal
 * neutral fight, the four guardians are fixed in the four CORNERS of the 4x5
 * board, and the attacker forms up in the central SIX squares (the 2x3 block in
 * the middle) rather than along the bottom rows.
 *
 *   0  .  .  3      corners (guards):    0  3  16  19
 *   .  5  6  .      attacker cells:      5  6
 *   .  9 10  .                           9 10
 *   . 13 14  .                          13 14
 *  16  .  . 19
 */
export const CREATURE_BANK_GUARD_CORNERS = [0, 3, 16, 19];
export const CREATURE_BANK_ATTACKER_CELLS = [5, 6, 9, 10, 13, 14];

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
  // Parallel turns: every live player whose parallel turn is still open counts
  // as having "their turn" (they act at the same time as everyone else).
  if (state.activePlayerId !== playerId && !isParallelActor(state, playerId)) {
    throw new Error(
      parallelTurnsActive(state) && state.turn.completedPlayerIds.includes(playerId)
        ? "You already ended your parallel turn — wait for the other players to finish theirs."
        : "It is not that player's turn."
    );
  }
}

function assertHandRefreshed(state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  if (player?.needsHandRefresh) {
    throw new Error("Discard down to your hand limit before acting.");
  }
  // The start-of-turn draw is MANDATORY (house rule): it must be taken — "draw
  // new" (discard nothing) or "discard and draw new" — before the player moves
  // or explores, so it can never be forgotten. The action is blocked until
  // REFRESH_HAND resolves and clears `canMulligan`. (legal-actions also withholds
  // movement/exploration offers while it is set; this is the resolution backstop
  // for the handler-validated map actions that skip the legal-action check.)
  if (player?.canMulligan) {
    throw new Error("Take your start-of-turn draw first (draw new, or discard and draw new).");
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

  // First-round rule: a card discarded during the opening round goes back to the
  // BOTTOM of your OWN deck, not onto the discard pile — an early mulligan must
  // not strand cards in the discard for the whole first deck cycle. It sits at
  // the bottom (index 0; the top is the last element) so the immediate
  // draw-up-to-limit below draws fresh cards and never just hands the same ones
  // straight back.
  const discardsReturnToDeck = state.round === 1;
  for (const cardId of action.discardCardIds) {
    const index = player.hand.indexOf(cardId);
    player.hand.splice(index, 1);
    if (discardsReturnToDeck) {
      player.deck.unshift(cardId);
    } else {
      player.discard.push(cardId);
    }
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

  // Parallel turns: while another player's battle/choice is open, only QUIET
  // steps are offered — "open" fields trigger nothing on arrival (empty,
  // used-up, own-flagged). "stop"/"encounter" fields (guards, enemy heroes,
  // unvisited locations, flags to steal) would open an interaction of their
  // own, so they wait until the table's current one resolves.
  const parallelBlocker = parallelInteractionBlocker(state, hero.controllerId);

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
    if (parallelBlocker) {
      return kind === "open";
    }
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

  // Parallel turns: assaulting another player's town/settlement is PvP — the
  // mode stops (with the table-wide warning) whether the owner garrisons or
  // lets it fall, before the garrison decision even opens.
  stopParallelTurns(
    state,
    "pvp-battle",
    attacker.controllerId,
    `assaulting ${state.players[defenderId]?.name ?? defenderId}'s ${
      locationDefinitions[field.location]?.category === "town" ? "town" : "settlement"
    }`
  );

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

  const origin = parseHexSpaceId(hero.spaceId);
  const destinationLabel = (spaceId: MapSpaceId): string => {
    const field = adventure.fields[spaceId];
    const locationName = locationDefinitions[field?.location ?? ""]?.name ?? "open field";
    const coord = parseHexSpaceId(spaceId);
    const distance = origin && coord ? hexDistance(origin, coord) : null;
    return `Teleport to ${locationName}${distance ? ` (${distance} field${distance === 1 ? "" : "s"} away)` : ""}`;
  };

  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt: `Dimension Door: move your hero up to ${range} field${range === 1 ? "" : "s"} to…`,
    options: [
      ...destinations.map((spaceId) => ({ label: destinationLabel(spaceId) })),
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
  const origin = parseHexSpaceId(hero.spaceId);

  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt: `View Earth: capture an enemy Mine within ${range} field${range === 1 ? "" : "s"}…`,
    options: [
      ...mineSpaceIds.map((spaceId) => ({
        label: (() => {
          const coord = parseHexSpaceId(spaceId);
          const distance = origin && coord ? hexDistance(origin, coord) : null;
          return `Capture the ${resourceMineLabel(adventure.fields[spaceId]?.resource)} Mine${
            distance ? ` (${distance} field${distance === 1 ? "" : "s"} away)` : ""
          }`;
        })()
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

/**
 * Parallel turns: whether `playerId` is moving while another player's exclusive
 * interaction (battle, choice, visit…) is open. Quiet steps are still allowed
 * then; the caller re-checks the slot signature after each step as the hard
 * backstop. Throws when the actor somehow has pending input of their OWN while
 * a foreign interaction is also open (never expected — defensive).
 */
function parallelQuietMoveBlocker(state: GameState, playerId: PlayerId): PlayerId | "table" | null {
  const blocker = parallelInteractionBlocker(state, playerId);
  if (!blocker) {
    return null;
  }
  const adventure = state.adventure;
  if (
    (state.pendingChoice && state.pendingChoice.playerId === playerId) ||
    (adventure?.pendingVisit && adventure.pendingVisit.playerId === playerId) ||
    (adventure?.pendingTileChoice && adventure.pendingTileChoice.playerId === playerId) ||
    (adventure?.pendingNecromancy && adventure.pendingNecromancy.playerId === playerId)
  ) {
    throw new Error("Resolve the pending choice first.");
  }
  return blocker;
}

export function moveHeroAdventure(state: GameState, action: Extract<GameAction, { type: "MOVE_HERO" }>): void {
  requireAdventure(state);
  assertActiveTurn(state, action.playerId);
  assertHandRefreshed(state, action.playerId);
  // Parallel turns: while another player's battle/choice is open, this hero may
  // still take a QUIET step (an "open" field that triggers nothing on arrival);
  // any other move waits for the interaction to resolve.
  const parallelBlocker = parallelQuietMoveBlocker(state, action.playerId);
  if (!parallelBlocker) {
    assertNoPendingInput(state);
  }

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
    // getHeroMoveDestinations already filters to quiet steps while the table's
    // interaction slot is busy, so a non-quiet request lands here.
    throw new Error(
      parallelBlocker
        ? parallelWaitMessage(state, parallelBlocker)
        : "Heroes can only move to adjacent, passable fields."
    );
  }

  const slotBefore = parallelBlocker ? parallelSlotSignature(state) : null;
  performHeroStep(state, hero, action.to, false);
  // Transactional backstop: a "quiet" step that still touched the exclusive
  // interaction machinery rejects the whole action (the reducer works on a
  // clone, so nothing partial is ever committed).
  if (slotBefore !== null && parallelSlotSignature(state) !== slotBefore) {
    throw new Error(parallelWaitMessage(state, parallelBlocker as PlayerId | "table"));
  }
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
  // Parallel turns: while another player's battle/choice is open the walk may
  // still happen, but ONLY over quiet fields (validated per step below).
  const parallelBlocker = parallelQuietMoveBlocker(state, action.playerId);
  if (!parallelBlocker) {
    assertNoPendingInput(state);
  }

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
    // Parallel turns, foreign interaction open: the walk may only END on a
    // quiet "open" field (a "stop"/"encounter" arrival would start a visit or
    // a battle of its own — one interaction at a time).
    if (parallelBlocker && isLast && kind !== "open") {
      throw new Error(parallelWaitMessage(state, parallelBlocker));
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


  const slotBefore = parallelBlocker ? parallelSlotSignature(state) : null;
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

    // Parallel turns, foreign interaction open: a quiet walk must stay quiet.
    // Any step that touched the exclusive machinery rejects the WHOLE walk
    // (the reducer runs on a clone, so nothing partial commits).
    if (slotBefore !== null && parallelSlotSignature(state) !== slotBefore) {
      throw new Error(parallelWaitMessage(state, parallelBlocker as PlayerId | "table"));
    }

    // Wading into/out of the sea ends the walk even if points remain. (While a
    // foreign interaction is open, heroStepNeedsInput is true throughout — the
    // signature check above already guarantees this walk did not cause it.)
    if (hero.movementHaltedThisTurn || (slotBefore === null && heroStepNeedsInput(state))) {
      break;
    }
  }
}

export function revisitField(state: GameState, action: Extract<GameAction, { type: "REVISIT_FIELD" }>): void {
  const adventure = requireAdventure(state);
  assertActiveTurn(state, action.playerId);
  assertHandRefreshed(state, action.playerId);
  // Parallel turns: a revisit opens a visit of its own — one at a time.
  assertParallelInteractionFree(state, action.playerId);
  assertNoPendingInput(state);

  const hero = requireHero(state, action.playerId, action.heroId);
  const field = hero.spaceId ? adventure.fields[hero.spaceId] : undefined;
  if (!hero.spaceId || !field) {
    throw new Error("That hero is not on a field.");
  }

  if (hero.movementPoints <= 0) {
    throw new Error(field.grailDiggable ? "Digging the Grail costs 1 movement point." : "Revisiting costs 1 movement point.");
  }

  // Revisitable fields, a cleared Grail field (dug for 1 MP), and an Obelisk
  // acting as a Monolith network member (role "monolith" — Revisit travels
  // again, mirroring a Monolith token).
  if (
    locationDefinitions[field.location]?.category !== "revisitable" &&
    !field.grailDiggable &&
    !(field.location === "obelisk" && obeliskRoleIsMonolith(state))
  ) {
    throw new Error("Only revisitable fields can be visited again.");
  }

  // Holy Grail: dig only after the digger has visited enough Obelisks (the
  // designer preset may lower/raise the count — grailObelisksRequired is the
  // single reader, defaulting to GRAIL_OBELISKS_REQUIRED).
  if (field.grailDiggable && !canDigGrail(state, action.playerId)) {
    const have = grailObelisksVisitedCount(state, action.playerId);
    const need = grailObelisksRequired(state);
    throw new Error(
      `Holy Grail: visit ${need} Obelisks before digging (you have ${have}/${need}).`
    );
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
  // Parallel turns: the market panel is a visit — one interaction at a time.
  assertParallelInteractionFree(state, action.playerId);
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
  // Parallel turns: a discovery opens the tile-rotation choice — one at a time.
  assertParallelInteractionFree(state, action.playerId);
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
  // tile must not be a printed yellow line, a designed whole arc, or a designed
  // per-edge border on any shared edge into the tile. A Creature Bank draws no
  // whole arc, so a hero standing on one faces open edges and CAN discover across
  // them — but a per-edge line the designer drew still seals (see
  // heroCanDiscoverTileAcrossBorders). The Redwood Observatory and the Speculum
  // artifact are the only ways to reveal across a still-sealed border.
  const heroField = adventure.fields[hero.spaceId];
  if (!heroField || !heroCanDiscoverTileAcrossBorders(adventure, hero.spaceId, heroField, tile)) {
    throw new Error(
      "A yellow border line seals this edge — move to an open border, or use a Redwood Observatory / Speculum to discover across it."
    );
  }

  revealOnMapTile(state, playerId, tile);
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

  // Naval Battles: draw (face-up) the Creature Bank token this tile's Blocked
  // Field would host NOW, before the rotation is chosen, so the player rotates
  // knowing which bank they are about to carve.
  reserveCreatureBankForTile(state, tile, playerId);
  openPolishBankChoiceBeforeRotation(state, tile, playerId);
}

const BANK_SIZE_ROMAN: Record<BankSize, string> = { 1: "I", 2: "II", 3: "III", 4: "IV" };

function attackRollLabel(roll: number): string {
  return roll > 0 ? `+${roll}` : String(roll);
}

/**
 * Peeks the top Creature Bank token of the tile's tier pile and stashes it on
 * the tile (`reservedBankId`) the moment the tile is revealed — before rotation —
 * so the player knows the bank up front. Only PEEKED (never popped): the token
 * is consumed from the pile only when the placement is accepted, so a declined
 * placement or a Blocked Field lost to a Subterranean Gate leaves the pile
 * intact. No-op when the rule is off (no piles), the tile can't host a bank
 * (wrong group / no Blocked Field in its definition), or the pile is empty.
 */
function reserveCreatureBankForTile(state: GameState, tile: MapTileState, playerId: PlayerId): void {
  const adventure = state.adventure;
  if (!adventure) {
    return;
  }
  const tier = creatureBankTierForGroup(tile.group);
  if (!tier) {
    return;
  }
  const def = allTileDefinitions[tile.tileDefId];
  if (!def?.fields.some((field) => field.location === "blocked_field")) {
    return;
  }
  const pile = tier === "far" ? adventure.creatureBankTokensFar : adventure.creatureBankTokensNear;
  if (!pile || pile.length === 0) {
    return;
  }
  const bankId = pile[pile.length - 1];
  if (!isCreatureBankId(bankId)) {
    return;
  }

  tile.reservedBankId = bankId;
  if (!houseRuleEnabled(state, "polish-bank-sizes")) {
    tile.reservedBankOptions = undefined;
    return;
  }

  const bankIds = [pile[pile.length - 1], pile[pile.length - 2]].filter(isCreatureBankId);
  // First Far (Ⅱ–Ⅲ) bank for this seat: ONE Attack die per candidate (size
  // Ⅰ–Ⅲ only — a single die cannot sum to ±2). Later Far openings and every
  // Near bank still roll TWO dice each so gold size Ⅳ stays reachable.
  // NOTE: every Far tile reaches rotation through finalizeFarTileFlip, which
  // ticks farTilesOpenedByPlayer BEFORE beginTileRotation runs this reserve —
  // so the seat's FIRST opening reads as 1 here (0 covers the legacy-snapshot
  // recovery re-reserve of a tile that predates sized reservations).
  const farOpenings = adventure.farTilesOpenedByPlayer?.[playerId] ?? 0;
  const diceCount = tier === "far" && farOpenings <= 1 ? 1 : 2;
  const random = createSeededRandom(
    `${state.seed}#adventure#bank-size-${tile.id}#${eventSeedNumber(state)}`
  );

  tile.reservedBankOptions = bankIds.map((candidateId, index) => {
    const rolls = Array.from(
      { length: diceCount },
      () => ATTACK_DIE_FACES[random.nextInt(0, ATTACK_DIE_FACES.length - 1)] ?? 0
    );
    // The size IS the number of Stacked defenders this bank will field
    // (size N → N of its guards each carry a Stack Token).
    const size = polishBankSizeForAttackRolls(rolls);
    const optionLetter = String.fromCharCode(65 + index);
    appendEvent(state, {
      type: "ADVENTURE_DICE_ROLLED",
      playerId,
      dice: "attack",
      results: [
        `Bank ${optionLetter}: ${rolls.map(attackRollLabel).join(" + ")} → size ${BANK_SIZE_ROMAN[size]} (${size} Stacked defender${size === 1 ? "" : "s"})`
      ],
      attackRolls: rolls
    });
    return { bankId: candidateId, size };
  });

  if (tile.reservedBankOptions[0]) {
    // Keep the legacy preview pointer aimed at candidate A.
    tile.reservedBankId = tile.reservedBankOptions[0].bankId;
  }
}

/**
 * Polish ordering from the v1.2 sheet: after both face-up banks have had their
 * sizes rolled, choose one BEFORE any rotation is offered. The chosen token is
 * only reserved here (not consumed); after rotation/gate carving it is placed
 * on the surviving Blocked Field and removed from the pile. With one token left
 * there is no meaningful choice, so it is reserved automatically.
 */
function openPolishBankChoiceBeforeRotation(state: GameState, tile: MapTileState, playerId: PlayerId): void {
  if (!houseRuleEnabled(state, "polish-bank-sizes")) {
    return;
  }
  const candidates = tile.reservedBankOptions ?? [];
  if (candidates.length <= 1) {
    return;
  }
  const tier = creatureBankTierForGroup(tile.group);
  if (!tier) {
    return;
  }

  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt: "Choose one of the two rolled Creature Banks. After choosing, rotate the tile.",
    options: candidates.map((candidate, index) => ({
      label: `${String.fromCharCode(65 + index)} · ${CREATURE_BANKS[candidate.bankId as CreatureBankId]?.name ?? "Creature Bank"} · size ${BANK_SIZE_ROMAN[candidate.size]}`
    })),
    context: "place-creature-bank",
    creatureBank: {
      // Fields do not materialize until rotation. The reducer ignores this
      // placeholder on the discriminated preRotation path.
      fieldId: tile.id,
      tier,
      candidates,
      tileInstanceId: tile.id,
      preRotation: true
    },
    returnPhase: state.phase
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
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

    // The slot's own outer border must be open — printed (tile-frame) OR a
    // designer-placed yellow border (absolute frame, evaluated at the candidate
    // rotation so it stays put as the tile turns).
    if (def.outerImpassable[slot - 1] || isTileSlotDesignedSealed({ ...tile, rotation }, slot)) {
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
    if (!anyReachable || !canHeroReachPlacedTile(state, placingHero, tile.tileDefId, center, rotation)) {
      throw new Error("Rotate the tile so your hero can cross onto it (a border line is sealing it off).");
    }
  }

  const isStartTile = pending.kind === "starting";
  tile.rotation = rotation;
  tile.awaitingRotation = false;
  adventure.pendingTileChoice = null;
  // The opening home-tile rotation RE-materializes only the six ring fields: the
  // centre already holds the town and main hero (placed at setup) and never
  // turns, so it is preserved. A discovered/placed tile materializes all seven
  // for the first time.
  materializeTileFields(adventure, tile, { onlyRing: isStartTile });
  if (isStartTile) {
    const player = state.players[action.playerId];
    if (player) {
      player.startTileRotated = true;
    }
  }
  appendEvent(state, {
    type: "TILE_ROTATION_SET",
    playerId: action.playerId,
    tileInstanceId: tile.id,
    tileDefId: tile.tileDefId,
    rotation
  });

  // Rotate first, THEN pick: with this tile's fields on the board, decide the
  // Subterranean Gate it shares with a tile on the other layer. When the
  // placement is ambiguous — which touching hex becomes the gate, later which
  // underground hex is the path up, and which of two Surface tiles a cavern joins
  // — the revealing player CHOOSES (pick-on-reveal). The home (Ⅰ) tile, setup,
  // and single-candidate cases carve automatically at the nearest hex.
  const gateCandidates =
    !isStartTile && adventure.chooseGatePlacement ? planGateChoiceForReveal(adventure, tile) : [];
  if (gateCandidates.length >= 2) {
    // Open the placement choice; the gate is carved on resolution and the
    // Creature Bank offer waits behind it, so a Blocked Field that becomes the
    // gate hex yields no bank ("not at the gate hex").
    openSubterraneanGatePlacementChoice(state, tile, action.playerId, gateCandidates);
    return;
  }

  // Automatic carve (0 or 1 candidate, or the choice is off): sacrifice the
  // nearest hex and warn what it cost, then offer the Creature Bank.
  carveGatesWithWarning(state, action.playerId, false);

  // Naval Battles optional rule: a freshly discovered Far/Near tile — or a
  // Subterranean cavern (house rule) — with a Blocked Field lets the discovering
  // player place a Creature Bank token there. The home (Ⅰ) tile never offers one.
  if (!isStartTile) {
    offerCreatureBankPlacement(state, tile, action.playerId);
    // A designed Monolith/Whirlpool token riding this tile is placed by the
    // discovering player ("a Field of your choosing", p.35). It waits behind an
    // open bank prompt; the bank resolution re-offers it.
    if (!state.pendingChoice) {
      offerPendingTokenPlacement(state, tile, action.playerId);
    }
  }

  // Parallel turns: the opening round starts EVERY player's turn at once, so
  // the forced home-tile rotations chain one at a time in seat order — locking
  // one opens the next player's.
  if (isStartTile && parallelTurnsActive(state)) {
    beginNextPendingStartTileRotation(state);
  }
}

/**
 * Carves every Subterranean Gate the current layout implies (via
 * {@link recomputeSubterraneanGates}, which honours player {@link SubterraneanGatePlan}s)
 * and emits a `SUBTERRANEAN_GATE_PLACED` warning for each hex it newly sacrifices,
 * naming what was lost so the UI can flag "your Gold Mine became a gate".
 */
function carveGatesWithWarning(state: GameState, playerId: PlayerId, chosen: boolean): void {
  const adventure = requireAdventure(state);
  const before = new Map<MapSpaceId, string>();
  for (const field of Object.values(adventure.fields)) {
    before.set(field.spaceId, field.location);
  }
  recomputeSubterraneanGates(adventure);
  for (const field of Object.values(adventure.fields)) {
    if (field.location === "subterranean_gate" && before.get(field.spaceId) !== "subterranean_gate") {
      appendEvent(state, {
        type: "SUBTERRANEAN_GATE_PLACED",
        playerId,
        fieldId: field.spaceId,
        tileInstanceId: field.tileInstanceId,
        gateToTileId: field.gateToTileId ?? "",
        sacrificed: before.get(field.spaceId) ?? "empty_field",
        chosen
      });
    }
  }
}

/**
 * Compass name (NE/E/SE/SW/W/NW) of `hex` as it sits — after rotation — on the
 * ring of `tile`, so a placement option can name WHERE on the flower the half
 * lands ("on the NE edge") instead of raw grid coordinates. Every gate candidate
 * is a ring field (a half must touch the partner tile), so this always resolves;
 * "" is only the impossible non-ring fallback.
 */
function ringEdgeDirection(tile: MapTileState, hex: MapSpaceId): string {
  const coord = parseHexSpaceId(hex);
  if (!coord) {
    return "";
  }
  const center: HexCoord = { row: tile.centerRow, col: tile.centerCol };
  for (let direction = 0; direction < 6; direction += 1) {
    if (hexEquals(hexNeighbor(center, direction), coord)) {
      return HEX_DIRECTIONS[direction];
    }
  }
  return "";
}

/**
 * Human label for one pick-on-reveal Subterranean Gate placement option. Names
 * the half ("Gate" down / "Path up") and which map edge of the just-revealed tile
 * it lands on, plus what field it sacrifices — no raw grid coordinates, because
 * the board now glows the candidate hex itself (see the `gatePlacementChoice`
 * overlay in screen.tsx). Uniqueness across options is finalised by the caller.
 */
function gateCandidateLabel(state: GameState, tile: MapTileState, candidate: SubterraneanGateChoiceCandidate): string {
  const adventure = requireAdventure(state);
  const field = adventure.fields[candidate.hex];
  const kind = candidate.role === "gate" ? "Gate" : "Path up";
  const edge = ringEdgeDirection(tile, candidate.hex);
  const where = edge ? ` on the ${edge} edge` : "";
  const sacrificed =
    field && field.location !== "empty_field"
      ? ` — sacrifices the ${locationDefinitions[field.location]?.name ?? field.location}`
      : "";
  return `${kind}${where}${sacrificed}`;
}

/**
 * Opens the pick-on-reveal Subterranean Gate placement choice for the revealing
 * player: one option per candidate hex/partner. Resolving it records the plan,
 * carves the chosen gate, then offers the deferred Creature Bank.
 */
function openSubterraneanGatePlacementChoice(
  state: GameState,
  tile: MapTileState,
  playerId: PlayerId,
  candidates: SubterraneanGateChoiceCandidate[]
): void {
  const revealedIsCavern = tileLayer(tile) === "subterranean";
  // Two options only ever share a label when they place the SAME hex toward two
  // different partners (a cavern touching two Surface tiles); that hex is left to
  // the buttons on the map (it is ambiguous to click), so number the collision so
  // the two buttons stay distinguishable. Distinct hexes get distinct edges.
  const rawLabels = candidates.map((candidate) => gateCandidateLabel(state, tile, candidate));
  const labelTotals = new Map<string, number>();
  for (const label of rawLabels) {
    labelTotals.set(label, (labelTotals.get(label) ?? 0) + 1);
  }
  const labelSeen = new Map<string, number>();
  const options = rawLabels.map((label) => {
    if ((labelTotals.get(label) ?? 0) <= 1) {
      return { label };
    }
    const ordinal = (labelSeen.get(label) ?? 0) + 1;
    labelSeen.set(label, ordinal);
    return { label: `${label} (${ordinal})` };
  });
  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt: revealedIsCavern
      ? "Subterranean Gate — choose which glowing hex becomes the path up to the Surface (it sacrifices that field)."
      : "Subterranean Gate — choose which glowing hex becomes the gate down to the cavern (it sacrifices that field).",
    options,
    context: "subterranean-gate-placement",
    subterraneanGate: { tileInstanceId: tile.id, candidates, deferBank: true },
    returnPhase: state.phase
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
}

/**
 * Offers the discovering player the choice to place a Creature Bank token on a
 * just-revealed tile's Blocked Field (rulebook p.66): a Far (II-III) tile draws
 * from the Far pile, a Near (IV-V) tile AND a Subterranean cavern both draw from
 * the Near pile (the cavern being a BINH house-rule addition). Sea, center and
 * starting tiles never trigger this — even a sea tile that carries a Blocked
 * Field / impassable terrain (the gate is the tile group, not the Blocked Field).
 *
 * Called AFTER the Subterranean Gate is carved, so if the tile's Blocked Field
 * was sacrificed to the gate it is no longer a Blocked Field and no bank is
 * offered there ("not at the gate hex"). No-op when the rule is off (no piles) or
 * the pile is empty.
 */
function offerCreatureBankPlacement(state: GameState, tile: MapTileState, playerId: PlayerId): void {
  const adventure = state.adventure;
  if (!adventure) {
    return;
  }
  const tier = creatureBankTierForGroup(tile.group);
  if (!tier) {
    return;
  }
  const pile = tier === "far" ? adventure.creatureBankTokensFar : adventure.creatureBankTokensNear;
  if (!pile || pile.length === 0) {
    return;
  }
  const blockedSpaceId = getTileFootprintSpaceIds(tile).find(
    (spaceId) => adventure.fields[spaceId]?.location === "blocked_field"
  );
  if (!blockedSpaceId) {
    // The Blocked Field was lost (e.g. carved into a Subterranean Gate): the bank
    // this tile reserved at reveal is not placed. The pile was only peeked, so
    // nothing is consumed — just drop the reservation.
    tile.reservedBankId = undefined;
    tile.reservedBankOptions = undefined;
    return;
  }

  // The Polish flow selected exactly one rolled bank before rotation. Place it
  // automatically now that the final Blocked Field is known; do not reopen the
  // standard post-rotation place/decline prompt.
  if (houseRuleEnabled(state, "polish-bank-sizes") && tile.reservedBankOptions?.length === 1) {
    const selected = tile.reservedBankOptions[0];
    const tokenIndex = pile.lastIndexOf(selected.bankId);
    if (tokenIndex < 0 || !isCreatureBankId(selected.bankId)) {
      throw new Error("The selected Creature Bank is no longer available.");
    }
    pile.splice(tokenIndex, 1);
    placeCreatureBank(state, blockedSpaceId, selected.bankId, selected.size);
    tile.reservedBankId = undefined;
    tile.reservedBankOptions = undefined;
    return;
  }

  if (houseRuleEnabled(state, "polish-bank-sizes") && !tile.reservedBankOptions?.length) {
    // Recovery for an in-progress snapshot created before sized reservations
    // existed: roll the offer now so it remains resolvable after loading.
    reserveCreatureBankForTile(state, tile, playerId);
  }

  // The bank was drawn face-up when the tile was revealed (so the player already
  // knew it while rotating); reaffirm it here, peeking the pile top for legacy
  // snapshots that predate the reservation.
  const reservedBankId =
    tile.reservedBankId && isCreatureBankId(tile.reservedBankId) ? tile.reservedBankId : pile[pile.length - 1];
  tile.reservedBankId = isCreatureBankId(reservedBankId) ? reservedBankId : undefined;
  const bankName = isCreatureBankId(reservedBankId) ? CREATURE_BANKS[reservedBankId]?.name ?? "Creature Bank" : "Creature Bank";
  const tierLabel = tile.group === "subterranean" ? "cavern" : tier === "far" ? "Far tile" : "Near tile";
  const sizedCandidates = houseRuleEnabled(state, "polish-bank-sizes")
    ? (tile.reservedBankOptions ?? []).filter((candidate) => pile.includes(candidate.bankId))
    : [];
  const options =
    sizedCandidates.length > 0
      ? [
          ...sizedCandidates.map((candidate, index) => ({
            label: `${String.fromCharCode(65 + index)} · Place ${CREATURE_BANKS[candidate.bankId as CreatureBankId]?.name ?? "Creature Bank"} · size ${BANK_SIZE_ROMAN[candidate.size]}`
          })),
          { label: "Leave it blocked" }
        ]
      : [{ label: `Place the ${bankName} Creature Bank` }, { label: "Leave it blocked" }];

  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt:
      sizedCandidates.length > 0
        ? `This ${tierLabel} has a Blocked Field — choose a rolled Creature Bank, or leave it blocked.`
        : `This ${tierLabel} has a Blocked Field — place the ${bankName} Creature Bank here?`,
    options,
    context: "place-creature-bank",
    creatureBank: {
      fieldId: blockedSpaceId,
      tier,
      ...(tile.reservedBankId ? { bankId: tile.reservedBankId } : {}),
      ...(sizedCandidates.length > 0 ? { candidates: sizedCandidates } : {}),
      tileInstanceId: tile.id
    },
    returnPhase: state.phase
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
}

/**
 * Places or offers a Monolith/Whirlpool/Gate token attached to this just-revealed
 * tile. A designer-pinned physical hex places automatically when it is legal;
 * when random printed content makes that hex incompatible, the original legal-
 * field choice remains the safe fallback. A single legal hex also places
 * automatically, while zero legal hexes drop the token (and fizzle any travel
 * aimed at it). No-op while the tile is face-down or still awaiting rotation.
 */
function offerPendingTokenPlacement(state: GameState, tile: MapTileState, playerId: PlayerId): void {
  const adventure = state.adventure;
  const pendingToken = tile.pendingToken;
  if (!adventure || !pendingToken || tile.faceDown || tile.awaitingRotation) {
    return;
  }

  const candidates = tokenPlacementCandidates(state, tile, pendingToken.kind);
  if (candidates.length === 0) {
    dropPendingMapToken(state, tile, playerId);
    return;
  }
  if (pendingToken.preferredSpaceId && candidates.includes(pendingToken.preferredSpaceId)) {
    placeMapToken(state, tile, pendingToken.preferredSpaceId, playerId);
    return;
  }
  if (candidates.length === 1) {
    // Mirrors the gate's single-candidate auto-carve: no zero-information prompt.
    placeMapToken(state, tile, candidates[0], playerId);
    return;
  }

  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt: pendingToken.preferredSpaceId
      ? `${placementTokenLabel(pendingToken)} token — its reserved hex cannot host it after reveal. Choose a glowing legal fallback field.`
      : `${placementTokenLabel(pendingToken)} token — choose which glowing field of the revealed tile it overwrites.`,
    options: candidates.map((spaceId) => {
      const field = adventure.fields[spaceId];
      const edge = field ? ringEdgeDirection(tile, spaceId) : "";
      const location = field ? locationDefinitions[field.location]?.name ?? field.location : "field";
      return { label: `${edge ? `${edge} edge — ` : "Centre — "}${location}` };
    }),
    context: "place-map-token",
    mapToken: {
      tileInstanceId: tile.id,
      kind: pendingToken.kind,
      ...(pendingToken.number !== undefined ? { number: pendingToken.number } : {}),
      ...(pendingToken.pair !== undefined ? { pair: pendingToken.pair } : {}),
      candidates
    },
    returnPhase: state.phase
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
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
  // yellow-sealed arc — or a designed per-edge line on every shared edge — blocks
  // ordinary discovery (use a Redwood Observatory or Speculum to reveal across it
  // instead); a border-free Creature Bank the hero stands on is open for the
  // whole-arc rule, though a per-edge line still seals.
  return heroCanDiscoverTileAcrossBorders(adventure, hero.spaceId, field, tile);
}

// ---------------------------------------------------------------------------
// Ⅱ–Ⅲ (Far) tile flip: the house-rule keep / reroll / pick decisions
// (settlement guarantee on the player's 2nd opening; a one-time reroll for a
// material Mine on any opening). Both rules apply identically whether the tile
// is OPENED from the player's supply (a truly-random draw — `via: "place"` /
// `"observatory"`) or DISCOVERED already face-down on the map (`via: "reveal"`):
// see beginFarTileFlip vs. beginFarTileReveal. The opening tally is PER PLAYER
// (farTilesOpenedByPlayer is keyed by playerId, never a single global count):
// each player's own supply + on-map openings share one tally, so the
// "2nd Ⅱ–Ⅲ tile" is the second THAT player opens EITHER way — wholly
// independent of how many tiles any other player has opened.
// ---------------------------------------------------------------------------

/** A Ⅱ–Ⅲ tile definition that carries a Settlement field. */
export function tileDefHasSettlement(tileDefId: string): boolean {
  return Boolean(allTileDefinitions[tileDefId]?.fields.some((field) => field.location === "settlement"));
}

/**
 * A Ⅱ–Ⅲ tile definition that carries an ORE Mine — a `location: "mine"` field
 * whose resource is `buildingMaterials` (ore). Gold Mines and Valuables Mines do
 * NOT count: the one-time "reroll if you get a Mine tile" guarantee applies only
 * to ore Mines, never a gold or valuables Mine.
 */
export function tileDefHasOreMine(tileDefId: string): boolean {
  return Boolean(
    allTileDefinitions[tileDefId]?.fields.some(
      (field) => field.location === "mine" && field.resource === "buildingMaterials"
    )
  );
}

/** Whether any tile still in the undrawn Ⅱ–Ⅲ pool carries a Settlement. */
function farTilePoolHasSettlement(state: GameState): boolean {
  return (state.adventure?.farTilePool ?? []).some(tileDefHasSettlement);
}

/**
 * Draws a tile from the player's Ⅱ–Ⅲ pool. In live play the seed is salted with
 * the action's fresh entropy (true random — unpredictable, non-reproducible);
 * in tests it is deterministic, and `farTileScriptedDraws` forces an exact
 * sequence (mirrors combat dice `scriptedRolls`). Returns undefined if the pool
 * is empty.
 */
function drawFarTileFromPool(state: GameState): string | undefined {
  const adventure = requireAdventure(state);
  const pool = adventure.farTilePool ?? (adventure.farTilePool = []);
  const scripted = adventure.farTileScriptedDraws;
  if (scripted && scripted.length > 0) {
    const id = scripted.shift() as string;
    const index = pool.indexOf(id);
    if (index !== -1) {
      pool.splice(index, 1);
    }
    return id;
  }
  if (pool.length === 0) {
    return undefined;
  }
  const random = createSeededRandom(`${state.seed}#far-tile-open#${eventSeedNumber(state)}#${pool.length}`);
  const [id] = pool.splice(random.nextInt(0, pool.length - 1), 1);
  return id;
}

/** Returns a rerolled-away (or unpicked) tile to the Ⅱ–Ⅲ pool. */
function returnFarTileToPool(state: GameState, tileDefId: string): void {
  const adventure = requireAdventure(state);
  (adventure.farTilePool ?? (adventure.farTilePool = [])).push(tileDefId);
}

/** Opens the keep/reroll/pick OPTION_CHOICE for the current flip candidate. */
function openFarTileFlipChoice(
  state: GameState,
  flip: NonNullable<NonNullable<GameState["adventure"]>["pendingFarTileFlip"]>,
  prompt: string,
  optionLabels: string[]
): void {
  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId: flip.playerId,
    prompt,
    options: optionLabels.map((label) => ({ label })),
    context: "far-tile-flip",
    returnPhase: flip.returnPhase
  };
  state.phase = "choice";
  state.priorityPlayerId = flip.playerId;
}

function describeFarTile(tileDefId: string): string {
  const tags: string[] = [];
  if (tileDefHasSettlement(tileDefId)) {
    tags.push("Settlement");
  }
  if (tileDefHasOreMine(tileDefId)) {
    tags.push("Ore Mine");
  }
  return tags.length > 0 ? `tile ${tileDefId} (${tags.join(", ")})` : `tile ${tileDefId}`;
}

/**
 * Either opens the next keep/reroll/pick choice for the current candidate or, if
 * no reroll applies, places it. Settlement guarantee fires only on the 2nd
 * opening (and only while the pool still holds a Settlement); the one-time ORE
 * Mine reroll on any opening (gold and valuables Mines never trigger it).
 */
function presentFarTileOffersOrFinalize(state: GameState): void {
  const flip = requireAdventure(state).pendingFarTileFlip;
  if (!flip) {
    return;
  }
  const candidate = flip.candidate;
  // A reroll can only be offered while the pool still holds something to draw —
  // a Settlement specifically for the 2nd-opening guarantee, or any tile for the
  // one-time material-Mine reroll.
  const poolHasDraw = (state.adventure?.farTilePool?.length ?? 0) > 0;
  // The settlement guarantee is a FLOOR — it only kicks in when the player has
  // not already secured a Settlement from an earlier Far tile. If their 1st tile
  // already had one, the 2nd opening is a normal keep (no fishing for a second
  // Settlement). Without this guard a player who opened a Settlement first was
  // still offered/forced the reroll on their 2nd tile — the reported bug.
  const alreadyHasFarSettlement = Boolean(state.adventure?.farSettlementOpenedByPlayer?.[flip.playerId]);
  const settlementEligible =
    flip.openingIndex === 2 &&
    !alreadyHasFarSettlement &&
    !tileDefHasSettlement(candidate) &&
    farTilePoolHasSettlement(state);
  // Only an ORE Mine triggers the reroll — never a gold or valuables Mine.
  const mineEligible = !flip.mineRerollUsed && tileDefHasOreMine(candidate) && poolHasDraw;

  if (settlementEligible) {
    flip.offerMode = "settlement";
    // Once a reroll has happened, the immediately-previous rolled tile is still
    // held (`lastNonSettlement`): offer it back as a third choice so the player
    // is never forced to accept the newest draw or gamble again — they may
    // settle for the tile they just saw (user rule).
    if (flip.lastNonSettlement) {
      openFarTileFlipChoice(
        state,
        flip,
        `Your 2nd Ⅱ–Ⅲ tile — ${describeFarTile(candidate)} — has no Settlement. Keep it, reroll for a Settlement, or take the previous tile — ${describeFarTile(flip.lastNonSettlement)}?`,
        ["Keep this Ⅱ–Ⅲ tile", "Reroll for a Settlement", `Take the previous tile (${describeFarTile(flip.lastNonSettlement)})`]
      );
      return;
    }
    openFarTileFlipChoice(
      state,
      flip,
      `Your 2nd Ⅱ–Ⅲ tile — ${describeFarTile(candidate)} — has no Settlement. Keep it, or reroll until a Settlement appears?`,
      ["Keep this Ⅱ–Ⅲ tile", "Reroll for a Settlement"]
    );
    return;
  }

  if (mineEligible) {
    flip.offerMode = "mine";
    openFarTileFlipChoice(
      state,
      flip,
      `This Ⅱ–Ⅲ tile — ${describeFarTile(candidate)} — has an Ore Mine. Keep it, or reroll once?`,
      ["Keep this Ⅱ–Ⅲ tile", "Reroll once (Ore Mine)"]
    );
    return;
  }

  finalizeFarTileFlip(state, candidate);
}

/**
 * Places the chosen Ⅱ–Ⅲ tile: any other tile still held aside returns to the
 * pool, the opened-counter ticks, the supply marker is already gone, and the
 * tile is laid face up to await its rotation. The Observatory path also consumes
 * its visit step and resumes the visit.
 */
function finalizeFarTileFlip(state: GameState, chosenTileDefId: string): void {
  const adventure = requireAdventure(state);
  const flip = adventure.pendingFarTileFlip;
  if (!flip) {
    return;
  }

  // Return whichever held tile was not chosen (candidate vs. the last
  // non-settlement tile) to the pool so it can come up again later.
  for (const held of [flip.candidate, flip.lastNonSettlement]) {
    if (held && held !== chosenTileDefId) {
      returnFarTileToPool(state, held);
    }
  }

  adventure.farTilesOpenedByPlayer = adventure.farTilesOpenedByPlayer ?? {};
  adventure.farTilesOpenedByPlayer[flip.playerId] = (adventure.farTilesOpenedByPlayer[flip.playerId] ?? 0) + 1;
  // Record that this player has now secured a Settlement from a Far tile, so a
  // later opening's settlement guarantee stops firing (the guarantee is a floor
  // — one Settlement — not a repeatable reroll for more).
  if (tileDefHasSettlement(chosenTileDefId)) {
    adventure.farSettlementOpenedByPlayer = adventure.farSettlementOpenedByPlayer ?? {};
    adventure.farSettlementOpenedByPlayer[flip.playerId] = true;
  }

  const center = { row: flip.centerRow, col: flip.centerCol };
  const via = flip.via;
  const heroId = flip.heroId;
  const observatoryFieldId = flip.observatoryFieldId;
  const tileInstanceId = flip.tileInstanceId;
  const returnPhase = flip.returnPhase;
  const playerId = flip.playerId;

  adventure.pendingFarTileFlip = null;
  state.pendingChoice = null;
  state.phase = returnPhase;
  state.priorityPlayerId = null;

  if (via === "reveal") {
    // Discovery path: the tile already sits on the map (flipped face up when the
    // reveal began). Retarget that SAME instance to the chosen def — every reroll
    // candidate is itself a Far tile, so its group/back-label are unchanged — and
    // hand over its rotation exactly like an ordinary discovery. No opening hero
    // is recorded (free rotation), matching the plain on-foot reveal.
    const tile = tileInstanceId ? adventure.tiles[tileInstanceId] : undefined;
    if (tile) {
      tile.tileDefId = chosenTileDefId;
      beginTileRotation(state, playerId, tile, "reveal");
    }
    return;
  }

  const tile = instantiateTile(adventure, chosenTileDefId, center, 0, false, { materialize: false });

  if (via === "observatory") {
    // The Observatory placement resolves the open DISCOVER_ADJACENT_TILE step,
    // then resumes any remaining visit steps. The tile is rotated freely (no
    // opening hero recorded), exactly like the old direct-placement path.
    const visit = adventure.pendingVisit;
    if (visit && visit.fieldId === observatoryFieldId) {
      visit.steps.shift();
    }
    beginTileRotation(state, playerId, tile, "place");
    processPendingVisit(state);
    return;
  }

  beginTileRotation(state, playerId, tile, "place", heroId);
}

/**
 * Starts a Ⅱ–Ⅲ flip: consumes one face-down supply marker, draws a truly-random
 * tile and reveals it, then either opens a keep/reroll/pick choice or — when no
 * reroll applies — lays the tile straight down. (A throw rolls the whole action
 * back, so the marker/MP are only spent on success.)
 */
function beginFarTileFlip(
  state: GameState,
  ctx: {
    playerId: PlayerId;
    heroId?: HeroId;
    supplyIndex: number;
    centerRow: number;
    centerCol: number;
    via: "place" | "observatory";
    observatoryFieldId?: MapSpaceId;
  }
): void {
  const adventure = requireAdventure(state);
  const supply = adventure.playerFarTiles[ctx.playerId] ?? [];
  if (supply[ctx.supplyIndex] !== UNOPENED_FAR_TILE) {
    throw new Error("That Ⅱ–Ⅲ tile is not in your supply.");
  }
  const candidate = drawFarTileFromPool(state);
  if (!candidate) {
    throw new Error("There are no Ⅱ–Ⅲ tiles left to open.");
  }
  supply.splice(ctx.supplyIndex, 1);

  adventure.pendingFarTileFlip = {
    playerId: ctx.playerId,
    ...(ctx.heroId ? { heroId: ctx.heroId } : {}),
    centerRow: ctx.centerRow,
    centerCol: ctx.centerCol,
    via: ctx.via,
    ...(ctx.observatoryFieldId ? { observatoryFieldId: ctx.observatoryFieldId } : {}),
    returnPhase: state.phase,
    openingIndex: (adventure.farTilesOpenedByPlayer?.[ctx.playerId] ?? 0) + 1,
    candidate,
    lastNonSettlement: null,
    mineRerollUsed: false,
    offerMode: "settlement"
  };

  presentFarTileOffersOrFinalize(state);
}

/**
 * Starts a Ⅱ–Ⅲ REVEAL flip for a face-down tile ALREADY on the map (an ordinary
 * discovery, a Redwood Observatory, or a Speculum). The tile's own printed def is
 * the first candidate — no pool draw and no supply marker is spent — and the same
 * house-rule keep/reroll/pick decisions apply as when opening one from supply
 * (the player's 2nd Ⅱ–Ⅲ opening guarantees a Settlement; any opening with a
 * material Mine may be rerolled once). A reroll retargets this same on-map slot
 * to a fresh draw, the rerolled-away def returning to the pool.
 *
 * The tile is flipped face up immediately (you must see a tile to decide on it)
 * but kept `awaitingRotation` so it is not yet materialized — no fields, skipped
 * by gate carving — until the decision finalizes and its rotation is locked. With
 * no reroll due, this collapses to exactly the old direct reveal: the tile flips
 * and its rotation choice opens.
 */
function beginFarTileReveal(state: GameState, playerId: PlayerId, tile: MapTileState): void {
  const adventure = requireAdventure(state);

  tile.faceDown = false;
  tile.awaitingRotation = true;

  adventure.pendingFarTileFlip = {
    playerId,
    centerRow: tile.centerRow,
    centerCol: tile.centerCol,
    via: "reveal",
    tileInstanceId: tile.id,
    returnPhase: state.phase,
    openingIndex: (adventure.farTilesOpenedByPlayer?.[playerId] ?? 0) + 1,
    candidate: tile.tileDefId,
    lastNonSettlement: null,
    mineRerollUsed: false,
    offerMode: "settlement"
  };

  presentFarTileOffersOrFinalize(state);
}

/**
 * Reveals a face-down tile already on the map. A Ⅱ–Ⅲ (Far) tile runs the
 * house-rule keep/reroll/pick flip (settlement guarantee + material-mine reroll,
 * exactly like opening one from your supply); every other group flips straight to
 * its rotation choice. The movement point (if any) is already spent by the
 * caller, and no opening hero is recorded — a discovered tile rotates freely.
 */
function revealOnMapTile(state: GameState, playerId: PlayerId, tile: MapTileState): void {
  if (tile.group === "far") {
    beginFarTileReveal(state, playerId, tile);
    return;
  }
  beginTileRotation(state, playerId, tile, "reveal");
}

// Let the Subterranean Gate reveal (which lives in adventure.ts, on the far side
// of the import cycle) run a Ⅱ–Ⅲ surface tile through the same flip.
setOnMapTileRevealHook(revealOnMapTile);

/** Resolves a keep / reroll / pick decision on the Ⅱ–Ⅲ flip in progress. */
export function resolveFarTileFlip(state: GameState, optionIndex: number): void {
  const adventure = requireAdventure(state);
  const flip = adventure.pendingFarTileFlip;
  if (!flip) {
    throw new Error("There is no Ⅱ–Ⅲ tile flip to resolve.");
  }

  if (flip.offerMode === "pick") {
    // [0] place the Settlement tile (the current candidate); [1] place the last
    // tile seen before the reroll. The unchosen one returns to the pool.
    finalizeFarTileFlip(state, optionIndex === 1 ? (flip.lastNonSettlement ?? flip.candidate) : flip.candidate);
    return;
  }

  if (optionIndex === 0) {
    // Keep the current candidate. (finalize returns any held tile to the pool.)
    finalizeFarTileFlip(state, flip.candidate);
    return;
  }

  if (flip.offerMode === "settlement") {
    // [2] Take the previous rolled tile (offered only once a reroll has already
    // happened, so `lastNonSettlement` is held): settle for the tile just seen
    // instead of keeping the newest draw or gambling again. finalize returns the
    // unchosen candidate to the pool.
    if (optionIndex === 2 && flip.lastNonSettlement) {
      finalizeFarTileFlip(state, flip.lastNonSettlement);
      return;
    }
    // Reroll for a Settlement: hold the current (non-settlement) tile as the
    // "last before reroll", returning any older held tile to the pool, then draw.
    if (flip.lastNonSettlement) {
      returnFarTileToPool(state, flip.lastNonSettlement);
    }
    flip.lastNonSettlement = flip.candidate;
    const next = drawFarTileFromPool(state);
    if (!next) {
      // Pool ran dry — keep the tile we were holding.
      const held = flip.lastNonSettlement;
      flip.candidate = held;
      flip.lastNonSettlement = null;
      finalizeFarTileFlip(state, held);
      return;
    }
    flip.candidate = next;
    if (tileDefHasSettlement(next)) {
      flip.offerMode = "pick";
      openFarTileFlipChoice(
        state,
        flip,
        `Found a Settlement — ${describeFarTile(next)}. Place it, or keep the previous tile — ${describeFarTile(flip.lastNonSettlement)}?`,
        [`Place the Settlement (${describeFarTile(next)})`, `Place the previous tile (${describeFarTile(flip.lastNonSettlement)})`]
      );
      return;
    }
    presentFarTileOffersOrFinalize(state);
    return;
  }

  // offerMode === "mine": reroll once. The mined tile returns to the pool; the
  // fresh draw goes through the normal offer/finalize path (a 2nd-opening draw
  // with no Settlement re-engages the settlement guarantee).
  flip.mineRerollUsed = true;
  returnFarTileToPool(state, flip.candidate);
  const next = drawFarTileFromPool(state);
  flip.candidate = next ?? flip.candidate;
  presentFarTileOffersOrFinalize(state);
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
  if (supply[action.supplyIndex] !== UNOPENED_FAR_TILE) {
    throw new Error("That Ⅱ–Ⅲ tile is not in your supply.");
  }
  if ((adventure.farTilePool?.length ?? 0) === 0) {
    throw new Error("There are no Ⅱ–Ⅲ tiles left to open.");
  }

  const center = { row: action.centerRow, col: action.centerCol };
  if (!canPlaceTileAt(state, hero, center, 0)) {
    throw new Error(
      "New tiles must touch at least two existing tiles, sit next to your hero, and must not overlap."
    );
  }
  if (!canHeroReachPlacementCenter(state, hero, center)) {
    throw new Error(
      "A yellow border seals your hero from that tile slot — move to an open tile edge before placing here."
    );
  }

  // A Ⅱ–Ⅲ tile is always a Surface tile, so a Subterranean hero may not lay one
  // down (the same divide as discovery). The tile's identity is unknown until the
  // flip, so the "your hero can cross onto it" guarantee is enforced later, at
  // the rotation step (setTileRotation), against the actual drawn tile.
  const placedLayer = tileLayer({ group: "far" } as MapTileState);
  if (hero.spaceId && placedLayer !== fieldLayer(state, hero.spaceId)) {
    throw new Error("You can't place a tile across the Surface/Subterranean divide.");
  }

  hero.movementPoints -= 1;
  beginFarTileFlip(state, {
    playerId: action.playerId,
    heroId: hero.id,
    supplyIndex: action.supplyIndex,
    centerRow: center.row,
    centerCol: center.col,
    via: "place"
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
      if (
        !option ||
        option.steps.some(
          (inner) => inner.type === "EMPOWER_STATISTIC" && (inner.costGold ?? 0) > 0 && inner.source !== "hand"
        )
      ) {
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
        if (step.tradesOnly) {
          throw new Error("The Marketplace trades resources only — cards cannot be sold here.");
        }
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
      // optionIndex selects which enemy discards (index into the enemy list);
      // with a single opponent it is just 0. The enemy discard resolves now; the
      // hero's placement (this Field, the Town, or a Settlement) is then offered
      // as a choice when more than one Field is legal.
      const enemies = humanPlayerIds(state).filter((id) => id !== action.playerId);
      const targetId = enemies[action.optionIndex ?? 0];
      if (targetId) {
        discardRandomHandCard(state, targetId);
      }
      visit.steps.unshift(secondaryHeroPlacementStep(state, action.playerId, visit.fieldId));
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
      const baseDeckId = kind === "spell" ? "spells" : kind === "artifact" ? "artifacts" : "abilities";
      const count = step.searchCount ?? 2;

      // Miriam's Scouting IV/VI (tieredReach): her scouting reach digs the higher
      // split decks too — Major artifacts and Expert spells — granted regardless of
      // the usual hero-level / artifact-source gate. Offer a CHOICE among every
      // matching deck that exists and still has cards. With only one (the Ability
      // deck, or Legacy's single Spell/Artifact deck) it digs that one directly.
      // Returning explicit split-deck ids bypasses the gated expansion the reward
      // pump applies to the "spells"/"artifacts" deck families.
      if (step.tieredReach && (kind === "spell" || kind === "artifact")) {
        const family =
          kind === "spell" ? ["spells", "spells-expert"] : ["artifacts", "artifacts-minor", "artifacts-major"];
        const decks = family.filter((deckId) => {
          const deck = state.decks[deckId];
          return deck && deck.drawPile.length + deck.discardPile.length > 0;
        });
        if (decks.length > 1) {
          return {
            type: "CHOOSE_ONE",
            prompt: `Scouting: Search (${count}) which deck?`,
            options: decks.map((deckId) => ({
              label: `Search (${count}) the ${deckDisplayName(state, deckId)} deck`,
              steps: [{ type: "SEARCH_SHARED_DECK", deckId, count }]
            }))
          };
        }
        if (decks.length === 1) {
          return { type: "SEARCH_SHARED_DECK", deckId: decks[0], count };
        }
        // No matching deck has cards — fall through to the base family deck.
      }

      return { type: "SEARCH_SHARED_DECK", deckId: baseDeckId, count };
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
  // A Ⅱ–Ⅲ target runs the same settlement/material-mine keep/reroll/pick flip as
  // any other on-map discovery (revealOnMapTile); the pending visit is already
  // shifted/cleared by the caller, so the flip's "reveal" finalize never touches
  // it.
  revealOnMapTile(state, action.playerId, target);
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
  if (supply[action.supplyIndex] !== UNOPENED_FAR_TILE) {
    throw new Error("That Ⅱ–Ⅲ tile is not in your supply.");
  }
  if ((adventure.farTilePool?.length ?? 0) === 0) {
    throw new Error("There are no Ⅱ–Ⅲ tiles left to open.");
  }

  const center: HexCoord = { row: action.centerRow, col: action.centerCol };
  const placeable = observatoryPlacementCenters(state, hero, observatoryTile, supply[action.supplyIndex]);
  if (!placeable.some((candidate) => hexEquals(candidate, center))) {
    throw new Error(
      "The Observatory can only place a Far tile at an empty slot adjacent to it that nests against two tiles."
    );
  }

  // Free observatory discovery — no movement point is spent. The flip draws a
  // truly-random Ⅱ–Ⅲ tile (with the same keep/reroll/pick choices as a normal
  // opening); the visit step is consumed and resumed once the tile is finally
  // placed (see finalizeFarTileFlip). The tile is rotated freely, not constrained
  // to a doorway the visiting hero can cross.
  beginFarTileFlip(state, {
    playerId: action.playerId,
    supplyIndex: action.supplyIndex,
    centerRow: center.row,
    centerCol: center.col,
    via: "observatory",
    observatoryFieldId: visit.fieldId
  });
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
  if (!adventure || !hero.spaceId) {
    return [];
  }
  // An UNOPENED supply tile has no known def (its identity is rolled at the flip),
  // so fall back to the Far group — every supply tile is a Surface Ⅱ–Ⅲ tile.
  const placedGroup = allTileDefinitions[tileDefId]?.group ?? "far";
  const heroLayer = fieldLayer(state, hero.spaceId);
  // A Far tile may only land on the hero's own layer (no cross-divide placing).
  if (tileLayer({ group: placedGroup } as MapTileState) !== heroLayer) {
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

export function astrologersHeroEmpower(
  state: GameState,
  action: Extract<GameAction, { type: "ASTROLOGERS_HERO_EMPOWER" }>
): void {
  requireAdventure(state);
  assertActiveTurn(state, action.playerId);
  assertHandRefreshed(state, action.playerId);
  assertNoPendingInput(state);
  applyAstrologersHeroEmpower(state, action.playerId, action.cardId);
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
  if (step.tradesOnly) {
    throw new Error("The Marketplace trades resources only — scroll spells cannot be sold here.");
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
      // Tarnum (Conflux) VI: the over-limit Search privilege never carries into a
      // fresh combat.
      player.combatStats.tarnumOverlimitCards = [];
    }
  }

  const shell: CombatState = {
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
      // Bake the action's fresh entropy into the combat seed once, so the whole
      // dice sequence is non-reproducible game-to-game (true random in play) while
      // each later roll stays a stable function of this seed (see rollAttackDie).
      seed: bakeEntropy(`${state.seed}-combat-${eventSeedNumber(state)}`),
      rollCount: 0
    },
    units: {}
  };

  // Crag Hack (Astrologers): "For the first Combat this round, all ground units
  // gain +1 attack." This is the single chokepoint every real combat's shell is
  // created through (neutral, bank and PvP alike), so the round's FIRST combat
  // begun while the card is up on its drawn (even) round latches the bonus onto
  // the shell — getAttackStackDetails reads it for every ground-type unit on
  // both sides. The one-shot flag lives on AstrologersState and expires with
  // the card, so the second combat of the round goes unbuffed.
  const proclamation = getActiveAstrologersCard(state)?.effect;
  const astrologers = getAstrologersState(state);
  if (
    proclamation?.type === "FIRST_COMBAT_GROUND_ATTACK" &&
    state.round % 2 === 0 &&
    astrologers &&
    !astrologers.firstCombatGroundAttackUsed
  ) {
    astrologers.firstCombatGroundAttackUsed = true;
    shell.proclamationGroundAttackBonus = proclamation.amount;
  }

  return shell;
}

export function startNeutralEncounter(state: GameState, hero: HeroState, field: MapFieldState): void {
  requireAdventure(state);
  const playerId = hero.controllerId;
  const difficulty = field.difficulty ?? 1;
  // A Secondary Hero earns no Experience but fights Neutral Units AS the Main
  // Hero's level (neutralBattleLevel), so it skips / Quick-Combat-wins the same
  // low-level guards instead of being forced to fight at level 1.
  const level = neutralBattleLevel(state, hero);

  // Creature Banks have no Field Difficulty, so they skip Quick Combat and the
  // Diplomacy shortcut entirely (rulebook p.66): you always fight the bank.
  if (fieldCreatureBankId(field)) {
    beginNeutralCombatPlacement(state, hero, field, 0);
    return;
  }

  // Quick Combat: a hero whose level beats the field difficulty wins outright.
  if (level > difficulty) {
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
  if (level === difficulty && state.players[playerId]?.hand.includes("ability.diplomacy")) {
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

  // Rulebook Combat Setup order: the player places up to 5 units first (4 when
  // the WOG Commanders module reserves the fifth slot for the commander); the
  // guard army is drawn from the tier decks only after placement finishes.
  const bankId = fieldCreatureBankId(field);
  const combat = makeCombatShell(state, playerId, NEUTRAL_PLAYER_ID);
  combat.context = {
    kind: "neutral",
    heroId: hero.id,
    fieldId: field.spaceId,
    difficulty,
    hasAzure: false,
    ...(bankId ? { bankId } : {})
  };
  assignCombatBoardArt(state, combat);
  combat.setup = {
    pendingPlayerIds: [playerId],
    placedUnitIds: { [playerId]: [] },
    unitLimit: combatUnitLimit(state)
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

  // PvP Neutral Control: tell the table — and above all the controlling
  // player — that a HUMAN plays the guards of this fight, PvP-style.
  const neutralController = neutralCombatControllerId(state, combat);
  if (neutralController) {
    const controllerName = state.players[neutralController]?.name ?? neutralController;
    const fighterName = state.players[playerId]?.name ?? playerId;
    appendEvent(state, {
      type: "NEUTRAL_CONTROL_ASSIGNED",
      playerId: neutralController,
      combatPlayerId: playerId,
      message: `PvP Neutral Control: ${controllerName} plays the Neutral units in ${fighterName}'s combat.`
    });
  }
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
 * Oidana IV's Diplomacy discount: knock `goldReduction` off the GOLD portion of
 * a recruit cost (floored at 0), leaving every other resource untouched. Used
 * consistently for the affordability filter, the option label AND the actual
 * spend so the discount a player is shown is exactly the discount they pay.
 */
function reduceGoldCost(cost: ResourceCost, goldReduction?: number): ResourceCost {
  if (!goldReduction || (cost.gold ?? 0) <= 0) {
    return cost;
  }
  return { ...cost, gold: Math.max(0, (cost.gold ?? 0) - goldReduction) };
}

function diplomacyDwellingDrawTiers(
  state: GameState,
  playerId: PlayerId
): ("bronze" | "silver" | "gold" | "azure")[] {
  const tiers: ("bronze" | "silver" | "gold" | "azure")[] = [];
  for (const tier of playerDwellingTiers(state, playerId)) {
    tiers.push(tier);
    if (tier === "gold") {
      tiers.push("azure");
    }
  }
  return tiers;
}

/**
 * Cyra's Diplomacy (Map): draw from the Neutral Unit tiers of the Dwellings the
 * player controls, with a Gold Dwelling also opening the Azure Neutral deck,
 * then open a recruit choice over the affordable draws. Called from playCard once the
 * Diplomacy card has been discarded. The drawn cards leave their tier decks now;
 * the recruited one joins the army and the rest return to their tier's discard
 * pile when the choice resolves.
 */
export function openDiplomacyRecruit(
  state: GameState,
  playerId: PlayerId,
  maxDraws?: number,
  goldReduction?: number
): void {
  const draws: { unitDefId: string; tier: "bronze" | "silver" | "gold" | "azure" }[] = [];
  for (const tier of diplomacyDwellingDrawTiers(state, playerId)) {
    // Oidana caps the draw at a fixed number of cards (1 at I, 2 at IV); Cyra's
    // base ability leaves maxDraws undefined and draws one per Dwelling.
    if (maxDraws !== undefined && draws.length >= maxDraws) {
      break;
    }
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
    return Boolean(neutral) &&
      hasRecruitResources(state, playerId, reduceGoldCost(neutral?.cost ?? {}, goldReduction));
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
          label: `Recruit ${def?.name ?? draw.unitDefId} (${recruitCostLabel(reduceGoldCost(def?.neutral?.cost ?? {}, goldReduction))})`
        };
      }),
      { label: "Recruit none" }
    ],
    context: "diplomacy-recruit",
    diplomacyRecruit: { draws, recruitable, goldReduction },
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
    // Apply Oidana IV's gold discount (if any) to the same cost the player was
    // shown — the affordability check, the label and this spend all agree.
    const cost = reduceGoldCost(def?.neutral?.cost ?? {}, recruit.goldReduction);
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
  // The Expert side spends an expert use (crown), so it is only offered when one
  // is available — unless Learning has been Empowered, which makes its Expert
  // side free of a crown.
  const modes: ("basic" | "expert")[] = ["basic"];
  if (expertUsesAvailable(player) > 0 || abilityExpertIsCrownFree(player, "ability.learning")) {
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
    (mode === "basic" ||
      expertUsesAvailable(player) > 0 ||
      abilityExpertIsCrownFree(player, "ability.learning"));

  if (!canPlay || !player || card?.effect.type !== "ADVANCE_EXPERIENCE") {
    pumpAdventureQueues(state);
    return;
  }

  // Spend the card: Expert removes it from the game and burns an expert use,
  // basic sends it to the discard pile.
  player.hand.splice(handIndex, 1);
  if (mode === "expert") {
    player.removed.push("ability.learning");
    // An Empowered Learning spends no crown for its Expert side.
    if (!abilityExpertIsCrownFree(player, "ability.learning")) {
      player.combatStats.expertUsesSpentThisRound += 1;
    }
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

// ---------------------------------------------------------------------------
// Pandora's Box "peek" cards (183/184/185/186): peek the top of a SHARED deck,
// discard up to N, reorder the rest on top, then resolve a resource/Search bonus.
// Mirrors the Visions scry but over the shared Ability/Spell/Artifact/Astrologers
// decks (via cardLibrary names and state.decks[deckId]) with a discard cap.
// ---------------------------------------------------------------------------

/**
 * Resolves the concrete shared-deck pile a Pandora "peek" card scrys for a deck
 * FAMILY. Abilities and Astrologers are single decks; the split Spell / Artifact
 * families (BINH house rule) name one physical deck, so this peeks the basic /
 * lowest pile that has cards (a documented reading — the "starter" pile stands
 * in), falling back to the first pile that merely exists so the bonus still
 * resolves. Returns null when the family has no deck at all.
 */
export function pandoraScryDeckId(state: GameState, family: string): string | null {
  const candidatesByFamily: Record<string, string[]> = {
    abilities: ["abilities"],
    astrologers: [ASTROLOGERS_DECK_ID],
    spells: ["spells", "spells-expert"],
    artifacts: ["artifacts", "artifacts-minor", "artifacts-major", "artifacts-relic"]
  };
  const candidates = candidatesByFamily[family] ?? [family];
  const existing = candidates.filter((id) => state.decks[id]);
  const withCards = existing.find((id) => (state.decks[id]?.drawPile.length ?? 0) > 0);
  return withCards ?? existing[0] ?? null;
}

/** Friendly deck name for the scry prompt (deckDisplayName has no Astrologers entry). */
function pandoraScryDeckLabel(state: GameState, deckId: string): string {
  return deckId === ASTROLOGERS_DECK_ID ? "Astrologers Proclaim" : deckDisplayName(state, deckId);
}

/** Queues the Pandora scry's follow-up bonus (a resource gain / Search), if any. */
function queuePandoraScryFollowUp(state: GameState, playerId: PlayerId, then: VisitStep[]): void {
  if (then.length === 0) {
    return;
  }
  state.adventure?.rewardQueue.unshift({ playerId, kind: "visit-steps", steps: [...then] });
}

/**
 * Pandora's Box "peek" cards: reveal the top `count` cards of the resolved shared
 * deck, open the keep/discard scry (capped at `maxDiscard` discards), then resolve
 * the `then` bonus. The bonus runs even when the deck is empty (nothing to scry,
 * but the printed reward still applies). Called from playCard, so the empty path
 * relies on playCard's trailing pumpAdventureQueues to drain the follow-up.
 */
export function openPandoraScry(
  state: GameState,
  playerId: PlayerId,
  family: string,
  count: number,
  maxDiscard: number,
  then: VisitStep[]
): void {
  const deckId = pandoraScryDeckId(state, family);
  const deck = deckId ? state.decks[deckId] : undefined;
  const revealed: CardId[] = [];
  if (deck) {
    for (let index = 0; index < count && deck.drawPile.length > 0; index += 1) {
      revealed.push(deck.drawPile.pop() as CardId);
    }
  }
  if (!deckId || revealed.length === 0) {
    queuePandoraScryFollowUp(state, playerId, then);
    return;
  }
  openPandoraScryStep(state, playerId, deckId, revealed, [], Math.min(maxDiscard, revealed.length), then);
}

/**
 * Opens (or re-opens) the keep/discard scry over the cards still in hand: each
 * step the player either puts one card back on top of the deck (kept in pick
 * order — first kept is drawn next) or discards it, until none remain. Discards
 * are capped at `discardsRemaining` (the printed "up to 2"); once spent, only the
 * keep options are offered so the rest go back on top.
 */
function openPandoraScryStep(
  state: GameState,
  playerId: PlayerId,
  deckId: string,
  remaining: CardId[],
  toReturn: CardId[],
  discardsRemaining: number,
  then: VisitStep[]
): void {
  if (remaining.length === 0) {
    finishPandoraScry(state, playerId, deckId, toReturn, then);
    return;
  }

  const name = (cardId: CardId) => cardLibrary[cardId]?.name ?? cardId;
  const deckLabel = pandoraScryDeckLabel(state, deckId);
  // Options are [keep r0, …, keep rN] then (while discards remain) [discard r0, …].
  const options: { label: string }[] = [
    ...remaining.map((cardId) => ({ label: `Put ${name(cardId)} back on top` })),
    ...(discardsRemaining > 0 ? remaining.map((cardId) => ({ label: `Discard ${name(cardId)}` })) : [])
  ];
  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt:
      discardsRemaining > 0
        ? `Pandora's Box: put a card back on top of the ${deckLabel} deck (first kept is drawn next) or discard it (up to ${discardsRemaining} more).`
        : `Pandora's Box: put the remaining card(s) back on top of the ${deckLabel} deck (first put back is drawn next).`,
    options,
    context: "pandora-scry",
    pandoraScry: { deckId, remaining: [...remaining], toReturn: [...toReturn], discardsRemaining, then: [...then] },
    returnPhase: "player-turn"
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
}

/** Returns the kept cards to the top of the deck (first kept on top), then bonus. */
function finishPandoraScry(
  state: GameState,
  playerId: PlayerId,
  deckId: string,
  toReturn: CardId[],
  then: VisitStep[]
): void {
  const deck = state.decks[deckId];
  if (deck) {
    // drawPile top is the last element; push kept cards in reverse pick order so
    // the first one kept ends up on top (drawn next).
    for (let index = toReturn.length - 1; index >= 0; index -= 1) {
      deck.drawPile.push(toReturn[index]);
    }
  }
  state.pendingChoice = null;
  state.phase = "player-turn";
  state.priorityPlayerId = null;
  queuePandoraScryFollowUp(state, playerId, then);
  if (!state.pendingChoice) {
    pumpAdventureQueues(state);
  }
}

/** Resolves one keep/discard step of a Pandora scry (CHOOSE_OPTION "pandora-scry"). */
export function resolvePandoraScryChoice(state: GameState, playerId: PlayerId, optionIndex: number): void {
  const choice = state.pendingChoice;
  if (
    !choice ||
    choice.type !== "OPTION_CHOICE" ||
    choice.context !== "pandora-scry" ||
    !choice.pandoraScry ||
    choice.playerId !== playerId
  ) {
    throw new Error("There is no Pandora scry to resolve.");
  }

  const { deckId, remaining, toReturn, discardsRemaining, then } = choice.pandoraScry;
  const keepCount = remaining.length;
  // Options are [keep r0, …, keep rN, discard r0, …].
  const isKeep = optionIndex < keepCount;
  const cardIndex = isKeep ? optionIndex : optionIndex - keepCount;
  const cardId = remaining[cardIndex];
  if (!cardId || (!isKeep && discardsRemaining <= 0)) {
    throw new Error("Pick one of the revealed cards.");
  }

  const nextRemaining = remaining.filter((_, index) => index !== cardIndex);
  if (isKeep) {
    openPandoraScryStep(state, playerId, deckId, nextRemaining, [...toReturn, cardId], discardsRemaining, then);
  } else {
    state.decks[deckId]?.discardPile.push(cardId);
    openPandoraScryStep(state, playerId, deckId, nextRemaining, toReturn, discardsRemaining - 1, then);
  }
}

/**
 * Draws and reveals the guard army once the player's placement is locked in:
 * checks the Field Difficulty Level Table, then places the cards by the
 * rulebook AI rules — ranged in the backline, ground/flying in the
 * frontline, left to right from the attacking player's perspective in
 * descending initiative (higher tier first on ties).
 */
/**
 * The engine effects carried by a neutral unit definition's printed abilities.
 * Lets map-level neutral effects (e.g. WOG Santa Gremlin's Gremlin guard and its
 * post-defeat Resource die) be driven by the declared ability, not a hard-coded
 * unit id — so the `abilities` array stays the single source of truth.
 */
function neutralUnitAbilityEffects(unitDefId: string | undefined) {
  const abilityIds = unitDefId ? coreUnitDefinitions[unitDefId]?.neutral?.abilities ?? [] : [];
  return abilityIds
    .map((abilityId) => unitAbilities[abilityId]?.effect)
    .filter((effect): effect is NonNullable<typeof effect> => Boolean(effect));
}

export function revealNeutralArmy(state: GameState, draws: NeutralDraw[]): void {
  const combat = state.combat;
  if (!combat || combat.context.kind !== "neutral") {
    return;
  }

  combat.pendingNeutralDraws = null;
  combat.context.hasAzure = draws.some((draw) => draw.tier === "azure");

  const drawnUnits = draws.flatMap((draw, index) => {
    const unit = makeCombatUnitFromNeutral(
      draw,
      `neutral_${index + 1}_${draw.unitDefId.split(".")[1]}`,
      0,
      getRuleset(state),
      unitSideRuleOverrides(state)
    );
    return unit ? [unit] : [];
  });
  // Some neutral cards summon an extra guard before Combat (WOG Santa Gremlin's
  // Gremlin). Driven by the printed ADD_NEUTRAL_GUARD ability, not a unit id.
  const extraGuards = draws.flatMap((draw, index) =>
    neutralUnitAbilityEffects(draw.unitDefId).flatMap((effect, effectIndex) => {
      if (effect.type !== "ADD_NEUTRAL_GUARD") {
        return [];
      }
      const guardTier = coreUnitDefinitions[effect.unitDefId]?.tier ?? "bronze";
      const guard = makeCombatUnitFromNeutral(
        { unitDefId: effect.unitDefId, tier: guardTier, bankGuard: true },
        `neutral_guard_${index + 1}_${effectIndex + 1}`,
        0,
        getRuleset(state),
        unitSideRuleOverrides(state)
      );
      return guard ? [guard] : [];
    })
  );
  const neutralUnits = [...drawnUnits, ...extraGuards];

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

  // The guards are on the board: under PvP Neutral Control the controller may
  // first SORT the Neutral formation (field OR Creature Bank), then a
  // Tactics-holding attacker may rearrange their own line, before round 1
  // (finalizeCombatStart) begins.
  combat.setup = null;
  if (openNeutralPlacementWindow(state)) {
    return;
  }
  if (openTacticsSetupWindows(state)) {
    return;
  }
  finalizeCombatStart(state);
}

/**
 * PvP Neutral Control: open the pre-battle formation-SORT window for the
 * controlling player once the Neutral army is revealed and auto-placed —
 * normal guard FIELDS and Creature Banks alike (user rule: "sorting or moving
 * neutral formation before battle, just like defender"). Field guards may sit
 * on ANY cell of the defender's two rows (back + front); banks rearrange within
 * their four corner cells. Returns true (and holds priority for the controller)
 * when the window opens. Never opens with no controller (AI/solo), or with
 * fewer than two living guards to arrange — mirroring the Tactics window's
 * threshold.
 */
function openNeutralPlacementWindow(state: GameState): boolean {
  const combat = state.combat;
  if (!combat) {
    return false;
  }
  const controller = neutralCombatControllerId(state, combat);
  if (!controller) {
    return false;
  }
  const guards = Object.values(combat.units).filter(
    (unit) => unit.controllerId === NEUTRAL_PLAYER_ID && unit.damage < unit.maxHealth && !isArrowTowerUnit(unit)
  );
  if (guards.length < 2) {
    return false;
  }

  combat.pendingNeutralPlacement = controller;
  state.phase = "combat-setup";
  state.priorityPlayerId = controller;
  appendEvent(state, {
    type: "NEUTRAL_FORMATION_SORT_OPENED",
    playerId: controller,
    combatPlayerId: combat.attackerPlayerId
  });
  return true;
}

/**
 * Cells the Neutral formation may occupy during the pre-battle sort.
 * Normal fields = the defender's two rows (backline + frontline) — any unit on
 * any of those cells; Creature Banks = the four corner cells.
 */
export function neutralFormationCellsFor(state: GameState): number[] {
  const combat = state.combat;
  if (!combat) {
    return [];
  }
  if (combat.context.kind === "neutral" && isCreatureBankId(combat.context.bankId)) {
    return [...CREATURE_BANK_GUARD_CORNERS];
  }
  // Field fight: any cell on the defender side (both rows).
  return [...DEFENDER_BACKLINE, ...DEFENDER_FRONTLINE];
}

/**
 * PvP Neutral Control: the controller repositions ONE Neutral guard during the
 * pre-battle sort (PLACE_NEUTRAL_GUARD). Moves the guard to an empty cell in the
 * formation zone, or SWAPS it with another guard already standing there. Field
 * fights: any cell on the defender's two rows; banks: the four corners.
 */
export function placeNeutralGuard(state: GameState, action: Extract<GameAction, { type: "PLACE_NEUTRAL_GUARD" }>): void {
  const combat = state.combat;
  if (!combat || combat.pendingNeutralPlacement !== action.playerId) {
    throw new Error("There is no Neutral formation to sort right now.");
  }
  const guard = combat.units[action.unitId];
  if (!guard || guard.controllerId !== NEUTRAL_PLAYER_ID || guard.damage >= guard.maxHealth || isArrowTowerUnit(guard)) {
    throw new Error("That unit is not a Neutral guard you can reposition.");
  }
  // Field = any defender-row cell; bank = the four corners only.
  if (!neutralFormationCellsFor(state).includes(action.position)) {
    throw new Error(
      combat.context.kind === "neutral" && isCreatureBankId(combat.context.bankId)
        ? "A Creature Bank guard must stay on one of the four corner cells."
        : "A Neutral guard must stay on the defender's back or front line."
    );
  }
  // Combat obstacles (walls, force fields, …) are never landable.
  if ((combat.obstacles ?? []).includes(action.position)) {
    throw new Error("That space is blocked.");
  }

  const occupant = Object.values(combat.units).find(
    (unit) => unit.position === action.position && unit.id !== guard.id
  );
  if (occupant) {
    // Only another guard may be swapped with — an Arrow Tower or a stray unit
    // holds its cell (there are none but the neutral guards during this window).
    if (occupant.controllerId !== NEUTRAL_PLAYER_ID || isArrowTowerUnit(occupant)) {
      throw new Error("That space is taken.");
    }
    occupant.position = guard.position;
    appendEvent(state, {
      type: "COMBAT_UNIT_PLACED",
      playerId: action.playerId,
      unitId: occupant.id,
      position: occupant.position
    });
  }
  guard.position = action.position;
  appendEvent(state, {
    type: "COMBAT_UNIT_PLACED",
    playerId: action.playerId,
    unitId: guard.id,
    position: guard.position
  });
}

/** Finish the Neutral formation sort (FINISH_NEUTRAL_PLACEMENT) and start play. */
export function finishNeutralPlacement(
  state: GameState,
  action: Extract<GameAction, { type: "FINISH_NEUTRAL_PLACEMENT" }>
): void {
  const combat = state.combat;
  if (!combat || combat.pendingNeutralPlacement !== action.playerId) {
    throw new Error("There is no Neutral formation to finish sorting.");
  }
  combat.pendingNeutralPlacement = null;
  if (openTacticsSetupWindows(state)) {
    return;
  }
  finalizeCombatStart(state);
}

/**
 * Pins the (always four) Creature Bank guardians to the four board corners,
 * in their fixed party order. The attacker, by contrast, deploys in the central
 * six squares (see CREATURE_BANK_ATTACKER_CELLS / placementCellsFor).
 */
function placeCreatureBankGuards(units: CombatUnitState[]): void {
  units.forEach((unit, index) => {
    const corner = CREATURE_BANK_GUARD_CORNERS[index];
    if (corner !== undefined) {
      unit.position = corner;
    }
  });
}

/**
 * Reveals a Creature Bank's defenders once placement is locked in (rulebook
 * p.66): build the fixed bank party, place its Stack Tokens by Scenario
 * Difficulty, then pin them to the four corners (the bank battlefield, not a
 * normal guard line). Records X (the number of Stacked defenders) on the combat
 * context for the win reward.
 */
function revealCreatureBankArmy(state: GameState, bankId: CreatureBankId): void {
  const combat = state.combat;
  if (!combat || combat.context.kind !== "neutral") {
    return;
  }

  const bankField = state.adventure?.fields[combat.context.fieldId];
  const { units, stackedCount } = buildCreatureBankCombatUnits(state, bankId, bankField?.bankSize);
  combat.context.bankStackCount = stackedCount;
  // Bank defenders carry no tier, so the azure "no time limit" rule never fires.
  combat.context.hasAzure = false;

  if (units.length === 0) {
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

  placeCreatureBankGuards(units);
  for (const unit of units) {
    combat.units[unit.id] = unit;
  }

  appendEvent(state, {
    type: "CREATURE_BANK_COMBAT_STARTED",
    playerId: combat.attackerPlayerId,
    heroId: combat.context.heroId,
    fieldId: combat.context.fieldId,
    bankId,
    unitDefIds: units.map((unit) => unit.unitDefId ?? ""),
    stackedCount
  });

  // Same as a normal guard reveal: under PvP Neutral Control the controller
  // may SORT the four corner guards before Tactics / round 1.
  combat.setup = null;
  if (openNeutralPlacementWindow(state)) {
    return;
  }
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

/**
 * Judge Dread (Astrologers): offer the attacker a keep / redraw-the-whole-army
 * choice at guard reveal. Modelled on the Satyr swap, but all-or-nothing.
 */
function openJudgeDreadChoice(state: GameState, draws: NeutralDraw[]): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }

  combat.pendingNeutralDraws = draws;
  const names = draws.map((draw) => coreUnitDefinitions[draw.unitDefId]?.name ?? draw.unitDefId).join(", ");
  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "OPTION_CHOICE",
    playerId: combat.attackerPlayerId,
    prompt: `Judge Dread: discard the whole drawn guard army (${names}) and draw a fresh one?`,
    options: [{ label: "Keep the drawn army" }, { label: "Discard all and draw new Neutral Units" }],
    context: "judge-dread",
    returnPhase: "combat-setup"
  };
  state.phase = "choice";
  state.priorityPlayerId = combat.attackerPlayerId;
}

/**
 * Resolves the Judge Dread offer: option 1 discards every deck-drawn guard to
 * its tier's Neutral discard pile and draws a fresh guard army (same field
 * difficulty); option 0 keeps the drawn army. Either way the final army reveals.
 */
export function resolveJudgeDread(state: GameState, playerId: PlayerId, optionIndex: number): void {
  const combat = state.combat;
  const draws = combat?.pendingNeutralDraws;
  if (!combat || !draws || combat.context.kind !== "neutral") {
    throw new Error("There is no drawn neutral army to redraw.");
  }

  if (optionIndex > 0) {
    // "Discard all of them": deck-drawn guards go to their tier's Neutral discard
    // pile (fixed bank guards are minted, so they just vanish); then draw fresh.
    for (const draw of draws) {
      if (draw.bankGuard) {
        continue;
      }
      state.decks[NEUTRAL_DECK_IDS[draw.tier]]?.discardPile.push(draw.unitDefId);
    }
    const field = state.adventure?.fields[combat.context.fieldId];
    const fresh = drawGuardArmy(state, field, combat.context.difficulty);
    // The fresh army is logged by revealNeutralArmy (NEUTRAL_ARMY_REVEALED).
    revealNeutralArmy(state, fresh);
    return;
  }

  revealNeutralArmy(state, draws);
}

/** The Visions spell id — its pre-battle cast lets the attacker swap guards. */
const VISIONS_SPELL_ID = "spell.visions";

/** Visions' Power → card-count table (1/2/3), reused as the swap budget. */
function visionsCardsByPower(): Record<number, number> {
  const card = cardLibrary[VISIONS_SPELL_ID];
  return card?.effect.type === "VISIONS_SCRY" ? card.effect.cardsByPower : { 0: 1 };
}

/**
 * Visions (pre-battle, neutral guard fights): after the guard army is DRAWN but
 * before it is revealed, an attacker holding Visions may cast it to SWAP OUT the
 * drawn Neutral guards — discard up to N of them and draw fresh cards of the same
 * tier, exactly like the Groovy Satyr but player-initiated. N scales with Visions'
 * Power (1/2/3), paid the board-game way by discarding extra Spells. Fixed bank
 * guards are never swappable. Returns true if it opened the cast offer (the
 * caller then returns instead of revealing). This is the "swap out neutral before
 * battle" use — an addition to Visions' map-turn deck scry, not a replacement.
 */
function maybeOpenVisionsGuardSwap(state: GameState, draws: NeutralDraw[]): boolean {
  // House rule ("vision-battle-swap"): the pre-battle guard swap is an addition
  // to Visions' map-turn deck scry. Off: Visions is only the map scry (wiki), so
  // the guard army reveals normally without offering the cast.
  if (!houseRuleEnabled(state, "vision-battle-swap")) {
    return false;
  }
  const combat = state.combat;
  if (!combat || combat.context.kind !== "neutral") {
    return false;
  }
  const attackerId = combat.attackerPlayerId;
  const player = state.players[attackerId];
  // Offer only when the attacker actually holds Visions and at least one drawn
  // guard is a deck card (fixed bank guards can never be swapped).
  if (!player?.hand.includes(VISIONS_SPELL_ID) || !draws.some((draw) => !draw.bankGuard)) {
    return false;
  }

  combat.pendingNeutralDraws = draws;
  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId: attackerId,
    prompt: "Visions: cast it to swap out the drawn Neutral guards before battle?",
    options: [
      { label: "Keep the drawn army (don't cast Visions)" },
      { label: "Cast Visions — swap out drawn guards" }
    ],
    context: "visions-guard-cast",
    returnPhase: "combat-setup"
  };
  state.phase = "choice";
  state.priorityPlayerId = attackerId;
  return true;
}

/** Resolves the Visions pre-battle cast offer (context "visions-guard-cast"). */
export function resolveVisionsGuardCast(state: GameState, playerId: PlayerId, optionIndex: number): void {
  const combat = state.combat;
  const draws = combat?.pendingNeutralDraws;
  if (!combat || !draws) {
    throw new Error("There is no drawn neutral army to swap with Visions.");
  }

  // Option 0 keeps the drawn army; Visions stays in hand.
  if (optionIndex === 0) {
    revealNeutralArmy(state, draws);
    return;
  }

  const player = state.players[playerId];
  const handIndex = player?.hand.indexOf(VISIONS_SPELL_ID) ?? -1;
  if (!player || handIndex === -1) {
    // Visions left the hand between the draw and the choice — reveal as-is.
    revealNeutralArmy(state, draws);
    return;
  }

  // Pay the cast: discard Visions, then scale the swap budget by its Power (paid
  // the board-game way — discard extra Spells for +1 swap each, up to Power 2).
  player.hand.splice(handIndex, 1);
  player.discard.push(VISIONS_SPELL_ID);
  appendEvent(state, {
    type: "CARD_PLAYED",
    playerId,
    cardId: VISIONS_SPELL_ID,
    timing: "instant",
    mode: "basic",
    optionLabel: "swap Neutral guards (pre-battle)"
  });
  openVisionsGuardSwapBoost(state, playerId, visionsCardsByPower(), 0);
}

/**
 * Visions pre-battle swap Power boost: discard a Spell for +1 swap (up to the
 * spell's top breakpoint), or start swapping now. Mirrors the map scry's Power
 * payment (openVisionsBoostStep) but ends by opening the guard-swap loop.
 */
function openVisionsGuardSwapBoost(
  state: GameState,
  playerId: PlayerId,
  cardsByPower: Record<number, number>,
  boost: number
): void {
  const player = state.players[playerId];
  const maxPower = Math.max(...Object.keys(cardsByPower).map(Number));
  const spellCardIds =
    boost < maxPower ? (player?.hand.filter((cardId) => cardCanBoostPower(cardLibrary[cardId])) ?? []) : [];

  if (spellCardIds.length === 0) {
    openVisionsGuardSwapLoop(state, playerId, visionsCardCount(cardsByPower, boost));
    return;
  }

  const nextCount = visionsCardCount(cardsByPower, boost + 1);
  const nowCount = visionsCardCount(cardsByPower, boost);
  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt: `Visions: discard a Spell for +1 swap (swap ${nextCount}), or swap now (${nowCount})?`,
    options: [
      ...spellCardIds.map((cardId) => ({
        label: `Discard ${cardLibrary[cardId]?.name ?? cardId} → swap up to ${nextCount}`
      })),
      { label: `Swap now — up to ${nowCount} guard${nowCount === 1 ? "" : "s"}` }
    ],
    context: "visions-guard-boost",
    visionsBoost: { boost, spellCardIds: [...spellCardIds], cardsByPower },
    returnPhase: "combat-setup"
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
}

/** Resolves a Visions swap Power boost (context "visions-guard-boost"). */
export function resolveVisionsGuardBoost(state: GameState, playerId: PlayerId, optionIndex: number): void {
  const choice = state.pendingChoice;
  if (
    !choice ||
    choice.type !== "OPTION_CHOICE" ||
    choice.context !== "visions-guard-boost" ||
    !choice.visionsBoost ||
    choice.playerId !== playerId
  ) {
    throw new Error("There is no Visions swap Power decision to resolve.");
  }
  const { boost, spellCardIds, cardsByPower } = choice.visionsBoost;
  const player = state.players[playerId];
  state.pendingChoice = null;

  const paySpell = spellCardIds[optionIndex];
  const handIndex = player ? player.hand.indexOf(paySpell ?? "") : -1;
  // The trailing option (or a Spell that left the hand) starts swapping now.
  if (!player || optionIndex >= spellCardIds.length || !paySpell || handIndex === -1) {
    openVisionsGuardSwapLoop(state, playerId, visionsCardCount(cardsByPower, boost));
    return;
  }

  // Spend the Spell for +1 Power (one more swap), then offer the next boost.
  player.hand.splice(handIndex, 1);
  player.discard.push(paySpell);
  appendEvent(state, {
    type: "CARD_PLAYED",
    playerId,
    cardId: paySpell,
    timing: cardLibrary[paySpell]?.timing ?? "instant",
    mode: "basic",
    optionLabel: "+1 Power (Visions swap)"
  });
  openVisionsGuardSwapBoost(state, playerId, cardsByPower, boost + 1);
}

/**
 * Visions pre-battle swap loop: offer to swap one of the drawn (non-bank) Neutral
 * guards for a fresh card of the same tier, up to `swapsRemaining` times, or stop
 * and reveal. Re-opens itself (one fewer swap) after each swap. Reveals the final
 * army when the budget is spent, no swappable guard remains, or the player stops.
 */
function openVisionsGuardSwapLoop(state: GameState, playerId: PlayerId, swapsRemaining: number): void {
  const combat = state.combat;
  const draws = combat?.pendingNeutralDraws;
  if (!combat || !draws) {
    return;
  }

  if (swapsRemaining <= 0 || !draws.some((draw) => !draw.bankGuard)) {
    revealNeutralArmy(state, draws);
    return;
  }

  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt: `Visions: swap a drawn Neutral guard (${swapsRemaining} left), or reveal the army?`,
    options: [
      ...draws.map((draw) => ({
        label: draw.bankGuard
          ? `${coreUnitDefinitions[draw.unitDefId]?.name ?? draw.unitDefId} (bank guard — cannot swap)`
          : `Swap ${coreUnitDefinitions[draw.unitDefId]?.name ?? draw.unitDefId} (${draw.tier})`
      })),
      { label: "Done — reveal the army" }
    ],
    context: "visions-guard-swap",
    visionsGuardSwap: { swapsRemaining },
    returnPhase: "combat-setup"
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
}

/** Resolves one Visions guard swap (context "visions-guard-swap"). */
export function resolveVisionsGuardSwap(state: GameState, playerId: PlayerId, optionIndex: number): void {
  const combat = state.combat;
  const choice = state.pendingChoice;
  const draws = combat?.pendingNeutralDraws;
  if (
    !combat ||
    !draws ||
    !choice ||
    choice.type !== "OPTION_CHOICE" ||
    choice.context !== "visions-guard-swap" ||
    !choice.visionsGuardSwap
  ) {
    throw new Error("There is no Visions guard swap to resolve.");
  }
  const swapsRemaining = choice.visionsGuardSwap.swapsRemaining;
  state.pendingChoice = null;

  // Trailing "Done" option: reveal the army as it stands.
  const draw = optionIndex < draws.length ? draws[optionIndex] : undefined;
  if (!draw) {
    revealNeutralArmy(state, draws);
    return;
  }
  // A fixed bank guard cannot be swapped — re-offer without spending a swap.
  if (draw.bankGuard) {
    openVisionsGuardSwapLoop(state, playerId, swapsRemaining);
    return;
  }

  swapNeutralDraw(state, playerId, draws, optionIndex);
  openVisionsGuardSwapLoop(state, playerId, swapsRemaining - 1);
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

  // Sanctuary (Astrologers): "During this round, Heroes cannot attack one
  // another." Reject a Hero-vs-Hero attack outright — and do it BEFORE
  // stopParallelTurns, so a banned attack neither happens NOR collapses an
  // in-progress parallel round (a whole action that throws rolls back cleanly).
  // Scoped to `defender` being a real enemy Hero: capturing an undefended enemy
  // Town/garrison (defender null, garrisonDefenderId set) is not "heroes
  // attacking one another" and stays legal, matching the printed wording.
  if (defender && pvpAttacksBanned(state)) {
    throw new Error("Sanctuary: Heroes cannot attack one another this round.");
  }

  // Parallel turns stop the moment a PvP battle begins: the whole table is
  // warned, the attacker's action continues as their ordered turn, and the
  // battle resolves under the normal one-at-a-time rules. (Throws — rejecting
  // the attack — if a third player's interaction is still open.)
  stopParallelTurns(
    state,
    "pvp-battle",
    attacker.controllerId,
    `against ${state.players[defenderPlayerId]?.name ?? defenderPlayerId}`
  );

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
    unitLimit: combatUnitLimit(state)
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

/**
 * The board cells a player may deploy into during Combat Setup. Normally the
 * attacker takes the bottom two rows and the defender the top two. A Creature
 * Bank is the exception: its guardians hold the four corners, so the attacker
 * forms up in the central six squares instead.
 */
export function placementCellsFor(state: GameState, playerId: PlayerId): number[] {
  const combat = state.combat;
  if (!combat) {
    return [];
  }

  if (playerId !== combat.attackerPlayerId) {
    return [...DEFENDER_FRONTLINE, ...DEFENDER_BACKLINE];
  }

  if (combat.context.kind === "neutral" && isCreatureBankId(combat.context.bankId)) {
    return [...CREATURE_BANK_ATTACKER_CELLS];
  }

  return [...ATTACKER_FRONTLINE, ...ATTACKER_BACKLINE];
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

  const placed = setup.placedUnitIds[action.playerId] ?? [];
  const armyUnit = player.army.find((unit) => unit.id === action.armyUnitId);
  if (!armyUnit) {
    throw new Error("That unit cannot be placed.");
  }

  const occupant = Object.values(combat.units).find((unit) => unit.position === action.position);

  // An already-placed unit is being dragged around the deployment area: move it
  // to an empty space, or SWAP it with one of YOUR OWN units already standing
  // there (so you can freely rearrange / switch positions until you lock in).
  if (placed.includes(armyUnit.id)) {
    const existing = Object.values(combat.units).find((unit) => unit.armyUnitId === armyUnit.id);
    if (!existing) {
      throw new Error("That unit is not on the board.");
    }
    if (occupant && occupant.id !== existing.id) {
      // Only your own units may trade places; an enemy-held cell stays blocked.
      if (occupant.controllerId !== action.playerId) {
        throw new Error("That space is already taken.");
      }
      const from = existing.position;
      existing.position = action.position;
      occupant.position = from;
      appendEvent(state, {
        type: "COMBAT_UNIT_PLACED",
        playerId: action.playerId,
        unitId: existing.id,
        position: existing.position
      });
      appendEvent(state, {
        type: "COMBAT_UNIT_PLACED",
        playerId: action.playerId,
        unitId: occupant.id,
        position: occupant.position
      });
      return;
    }
    // Move to the target cell (dropping back on its own square is a no-op).
    existing.position = action.position;
    appendEvent(state, {
      type: "COMBAT_UNIT_PLACED",
      playerId: action.playerId,
      unitId: existing.id,
      position: action.position
    });
    return;
  }

  // A brand-new placement (a unit not yet on the board) may not land on a taken
  // cell — there is nothing to swap with.
  if (occupant) {
    throw new Error("That space is already taken.");
  }

  if (placed.length >= setup.unitLimit) {
    throw new Error(`Only ${setup.unitLimit} units may join a combat.`);
  }

  const combatUnit = makeCombatUnitFromArmy(
    armyUnit,
    action.playerId,
    `unit_${action.playerId}_${armyUnit.id}`,
    action.position,
    getRuleset(state),
    unitSideRuleOverrides(state)
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
    // Creature Bank: a fixed party of bank cards with Stack Tokens, not a
    // Field-Difficulty draw. The Groovy Satyr never swaps bank defenders.
    if (isCreatureBankId(combat.context.bankId)) {
      revealCreatureBankArmy(state, combat.context.bankId);
      return;
    }
    const guardField = state.adventure?.fields[combat.context.fieldId];
    const draws = drawGuardArmy(state, guardField, combat.context.difficulty);
    // Only one Astrologers card is face up, so Judge Dread and the Groovy Satyr
    // are mutually exclusive; both only touch deck-drawn guards, never fixed bank
    // guards. Judge Dread offers to discard the WHOLE army and draw fresh; the
    // Satyr swaps a single card.
    const activeEffect = getActiveAstrologersCard(state)?.effect.type;
    if (activeEffect === "NEUTRAL_REDRAW_ALL" && draws.some((draw) => !draw.bankGuard)) {
      openJudgeDreadChoice(state, draws);
      return;
    }
    if (activeEffect === "NEUTRAL_DRAW_SWAP" && draws.some((draw) => !draw.bankGuard)) {
      openSatyrSwapChoice(state, draws);
      return;
    }
    // No Astrologers swap up: an attacker holding Visions may cast it now to swap
    // out the drawn guards before the battle (the pre-battle Visions use).
    if (maybeOpenVisionsGuardSwap(state, draws)) {
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
/**
 * Factory — Frederick's specialty ("further enhances the Automaton's
 * explosion"). Each combat, a player whose Hero is Frederick gets a +1 to every
 * Automaton's on-removal Detonate (read at the removal chokepoint); everyone
 * else is reset to none, so the bonus never leaks between combats or heroes.
 */
export const FREDERICK_AUTOMATON_DETONATION_BONUS = 1;

export function seedFactoryHeroEffects(state: GameState): void {
  for (const player of Object.values(state.players)) {
    if (player.heroDefId === "frederick") {
      player.automatonDetonationBonus = FREDERICK_AUTOMATON_DETONATION_BONUS;
    } else if (player.automatonDetonationBonus) {
      player.automatonDetonationBonus = 0;
    }
  }
}

/**
 * Common tail of combat setup (player and neutral alike): round 1 opens,
 * in-play permanents join and round-start war machines fire. Runs after the
 * start-of-combat Tactics windows, if any, have all resolved.
 */
/**
 * Ring of the Wayfarer's paralysis side ("At start of Combat with Neutral Units
 * put a Paralysis token on any unit except Azure") in the attacker's hand, if
 * any — returns the card id and its grade ceiling (the `gradeByPower` at the
 * card's power). Kept off the normal play list (see legal-actions), it is used
 * ONLY through the start-of-combat decision so it fires before any unit acts.
 */
function findWayfarerParalysisCard(
  state: GameState,
  playerId: PlayerId
): { cardId: CardId; ceilingRank: number } | null {
  for (const cardId of state.players[playerId]?.hand ?? []) {
    const card = cardLibrary[cardId];
    if (card?.effect.type !== "CHOOSE_ONE") {
      continue;
    }
    const option = card.effect.options.find(
      (candidate) => candidate.effect.type === "PLACE_PARALYSIS" && candidate.requiresNeutralCombatStart
    );
    if (option && option.effect.type === "PLACE_PARALYSIS") {
      // "except Azure": the option's gradeByPower ceiling at this card's power.
      const power = card.power ?? 0;
      const ladder = option.effect.gradeByPower ?? {};
      const breakpoint = Object.keys(ladder)
        .map(Number)
        .filter((value) => value <= power)
        .sort((a, b) => b - a)[0];
      const ceiling = breakpoint !== undefined ? ladder[breakpoint] : undefined;
      return { cardId, ceilingRank: wayfarerGradeRank(ceiling) };
    }
  }
  return null;
}

/** Grade ordering (bronze<silver<gold<azure), matching legal-actions.gradeRank. */
function wayfarerGradeRank(grade: CombatUnitState["grade"] | undefined): number {
  return grade === "bronze" ? 0 : grade === "silver" ? 1 : grade === "gold" ? 2 : 3;
}

/**
 * Ring of the Wayfarer: offer the attacking player the start-of-combat paralysis
 * decision. Presented once (before any unit acts) in a Neutral combat when the
 * attacker holds the Ring — pick any non-Azure unit to Paralyse, or keep the
 * Ring (and its initiative side). Returns true when the decision opened; the
 * resolver re-enters finalizeCombatStart to finish setup. Bank/commander units
 * are tierless (rank above every grade) and are never valid targets, matching
 * the hand-play's tier filter.
 */
export function maybeOpenWayfarerParalysisDecision(state: GameState): boolean {
  const combat = state.combat;
  if (!combat || combat.context.kind !== "neutral" || combat.wayfarerParalysisOffered) {
    return false;
  }
  const attackerId = combat.attackerPlayerId;
  const ring = findWayfarerParalysisCard(state, attackerId);
  if (!ring) {
    return false;
  }
  // Mark offered up front so the resolver's finalizeCombatStart re-entry — and a
  // kept Ring — never re-opens the prompt.
  combat.wayfarerParalysisOffered = true;

  const unitRank = (unit: CombatUnitState): number =>
    unit.bankUnit || unit.commanderSlug ? Number.POSITIVE_INFINITY : wayfarerGradeRank(unit.grade);
  const targets = Object.values(combat.units).filter(
    (unit) => unit.damage < unit.maxHealth && unitRank(unit) <= ring.ceilingRank
  );
  if (targets.length === 0) {
    return false; // nothing paralysable — skip the prompt, keep the Ring
  }

  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId: attackerId,
    prompt: "Ring of the Wayfarer: paralyse a unit at the start of this Combat? (any non-Azure unit)",
    options: [
      ...targets.map((unit) => ({ label: `Paralyse ${unit.name}` })),
      { label: "Keep the Ring (don't paralyse)" }
    ],
    context: "wayfarer-paralysis",
    wayfarerParalysis: { cardId: ring.cardId, unitIds: targets.map((unit) => unit.id) },
    returnPhase: "combat"
  };
  state.phase = "choice";
  state.priorityPlayerId = attackerId;
  return true;
}

/** Resolves the attacker's start-of-combat Ring of the Wayfarer decision. */
export function resolveWayfarerParalysisChoice(state: GameState, playerId: PlayerId, optionIndex: number): void {
  const combat = state.combat;
  const choice = state.pendingChoice;
  if (!combat || choice?.type !== "OPTION_CHOICE" || choice.context !== "wayfarer-paralysis" || !choice.wayfarerParalysis) {
    throw new Error("There is no Ring of the Wayfarer decision to make.");
  }
  const data = choice.wayfarerParalysis;
  state.pendingChoice = null;

  // Options 0..n-1 paralyse the matching unit and discard the Ring; the trailing
  // option keeps the Ring (its initiative side stays playable).
  if (optionIndex >= 0 && optionIndex < data.unitIds.length) {
    const unit = combat.units[data.unitIds[optionIndex]];
    const player = state.players[playerId];
    const handIndex = player?.hand.indexOf(data.cardId) ?? -1;
    if (unit && player && handIndex >= 0) {
      player.hand.splice(handIndex, 1);
      player.discard.push(data.cardId);
      placeCombatToken(state, unit, "paralysis", 0, cardLibrary[data.cardId]?.name ?? "Ring of the Wayfarer");
      appendEvent(state, {
        type: "CARD_PLAYED",
        playerId,
        cardId: data.cardId,
        timing: "instant",
        mode: "basic"
      });
    }
  }

  // Continue combat setup from the top (the decision is now marked offered).
  finalizeCombatStart(state);
}

function finalizeCombatStart(state: GameState): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }

  // Single-player smoothing (house rule): a computer seat's first TWO eligible
  // neutral-guard battles are guaranteed flawless one-round wins — the guards
  // fall before any unit acts and the outcome resolves through the normal
  // victory path (rewards, XP, card recycling all real). Strictly scoped so it
  // cannot leak or be abused: guard FIELDS at difficulty I/II the hero's level
  // already covers, single-player sessions only, never a Creature Bank, never
  // a fight with a human participant or guard controller — see
  // `computer/guaranteed-wins.ts` and its `guaranteed-wins.test.ts`.
  if (applyComputerGuaranteedWin(state)) {
    return;
  }

  // Ring of the Wayfarer: the attacker's start-of-combat paralysis decision, made
  // before any unit acts (Neutral combats only). Resolving it re-enters here.
  if (maybeOpenWayfarerParalysisDecision(state)) {
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

  // WOG Commanders: each MAIN hero fighting this battle brings its living
  // commander onto the board (auto-placed on the first free cell of its own
  // backline, then frontline; bank fights use the six central attacker cells).
  injectCombatCommanders(state);
  // Bulwark "Runes" (Gamefound Update #3): seed each Bulwark player's per-combat
  // Rune pool from their Sieidi/Altar baseline + City Hall flag, applying any
  // Rune Level the starting pool already qualifies for.
  seedRunesForCombat(state);
  // Factory — Frederick "further enhances the Automaton's explosion": seed each
  // player's Automaton-detonation bonus for this combat from their hero.
  seedFactoryHeroEffects(state);
  // In-play permanents join the fight and round-start war machines fire.
  applyPermanentCombatEffects(state);
  applyCombatStartMoraleCards(state);
  applyCombatStartUnitAbilities(state);
  // Single-player smoothing (house rule #2): a computer attacker in a NON-PvP
  // fight draws its two temporary Empowered Attack/Defense statistic cards —
  // removed from the game again at combat end (finalizeAdventureCombat).
  // Idempotent across finalizeCombatStart re-entries; see combat-boost.ts.
  applyComputerCombatBoost(state);
  // Commander combat-start specialties (Mana Magician charges, Rune Ritual,
  // Charming, Pacifist) resolve after unit abilities and BEFORE the first
  // war-machine round, so a charmed/fled defender never soaks a Ballista shot.
  applyCommanderCombatStart(state);
  startWarMachineRound(state);
}

/**
 * WOG Commanders: put each fighting MAIN hero's living commander on the board.
 * Garrison defenses (no defender hero) and secondary-hero fights get none —
 * the commander marches with the main hero only.
 */
function injectCombatCommanders(state: GameState): void {
  const combat = state.combat;
  if (!combat || !commandersModuleEnabled(state)) {
    return;
  }

  const context = combat.context;
  const heroBrings = (heroId: HeroId | null | undefined): PlayerId | null => {
    const hero = heroId ? state.heroes[heroId] : null;
    return hero && hero.kind === "main" ? hero.controllerId : null;
  };

  const sides: { playerId: PlayerId | null; cells: readonly number[] }[] = [];
  if (context.kind === "neutral") {
    sides.push({
      playerId: heroBrings(context.heroId),
      cells: context.bankId
        ? CREATURE_BANK_ATTACKER_CELLS
        : [...ATTACKER_BACKLINE, ...ATTACKER_FRONTLINE]
    });
  } else if (context.kind === "player") {
    sides.push({
      playerId: heroBrings(context.attackerHeroId),
      cells: [...ATTACKER_BACKLINE, ...ATTACKER_FRONTLINE]
    });
    sides.push({
      playerId: heroBrings(context.defenderHeroId),
      cells: [...DEFENDER_BACKLINE, ...DEFENDER_FRONTLINE]
    });
  } else if (context.kind === "sandbox") {
    // Battle Test: both seats bring main heroes, so both get their commander.
    sides.push({
      playerId: combat.attackerPlayerId,
      cells: [...ATTACKER_BACKLINE, ...ATTACKER_FRONTLINE]
    });
    sides.push({
      playerId: combat.defenderPlayerId,
      cells: [...DEFENDER_BACKLINE, ...DEFENDER_FRONTLINE]
    });
  }

  for (const side of sides) {
    if (side.playerId && side.playerId !== NEUTRAL_PLAYER_ID) {
      injectCommanderIntoCombat(state, side.playerId, side.cells);
    }
  }
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
  // PvP defender with a hero in the fight, or Battle Test (sandbox) defender —
  // both field a main hero and may rearrange with Tactics.
  const defenderMayTactics =
    (combat.context.kind === "player" && combat.context.defenderHeroId != null) ||
    combat.context.kind === "sandbox";
  if (defenderMayTactics && eligibleForTacticsSetup(state, combat, combat.defenderPlayerId)) {
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
    // An Empowered Tactics may be used without a crown.
    if (expertUsesAvailable(player) <= 0 && !abilityExpertIsCrownFree(player, "ability.tactics")) {
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
  // An Empowered Tactics spends no crown for its Expert use.
  if (mode === "expert" && !abilityExpertIsCrownFree(player, "ability.tactics")) {
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
export function applyCombatStartUnitAbilities(state: GameState): void {
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

  // Factory Bounty Hunters: "At the start of Combat, place a Mark token on an
  // enemy unit." The Mark unlocks the Bounty Hunters' +Attack against it. The
  // rulebook lets the controller pick the target; the engine resolves that
  // deterministically here — the strongest living enemy (highest maxHealth, ties
  // broken by lowest position) not already Marked by another Bounty Hunter stack.
  for (const unit of Object.values(combat.units)) {
    const mark = getCombatStartMark(unit);
    if (!mark) {
      continue;
    }
    const enemies = Object.values(combat.units).filter(
      (candidate) =>
        candidate.controllerId !== unit.controllerId &&
        candidate.damage < candidate.maxHealth &&
        !candidate.marked
    );
    if (enemies.length === 0) {
      continue;
    }
    const target = enemies.reduce((best, candidate) =>
      candidate.maxHealth > best.maxHealth ||
      (candidate.maxHealth === best.maxHealth && candidate.position < best.position)
        ? candidate
        : best
    );
    target.marked = true;
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: unit.id,
      abilityId: mark.abilityId,
      targetUnitId: target.id,
      message: `${unit.name}: ${mark.abilityName} — Marks ${target.name}.`
    });
  }
}

function applyCombatStartMoraleCards(state: GameState): void {
  const combat = state.combat;
  // Adventure + Battle Test (sandboxRules.moraleCards) both use the same rule.
  if (!combat || !(state.adventure?.moraleCards || state.sandboxRules?.moraleCards)) {
    return;
  }

  const participantIds = new Set(
    Object.values(combat.units)
      .map((unit) => unit.controllerId)
      .filter((playerId) => playerId !== NEUTRAL_PLAYER_ID)
  );

  for (const playerId of participantIds) {
    const player = state.players[playerId];
    if (!player) {
      continue;
    }

    while ((player.moraleCards?.positive ?? []).includes("morale.positive.combat_draw")) {
      drawCardsForPlayer(state, playerId, 1);
      returnHeldMoraleCardToDeckBottom(state, playerId, "morale.positive.combat_draw", "used");
    }

    while ((player.moraleCards?.negative ?? []).includes("morale.negative.random_combat_discard")) {
      if (player.hand.length > 0) {
        const random = createSeededRandom(
          `${state.seed}#morale-random-combat-discard#${playerId}#${eventSeedNumber(state)}`
        );
        const index = random.nextInt(0, player.hand.length - 1);
        const [discarded] = player.hand.splice(index, 1);
        if (discarded) {
          player.discard.push(discarded);
          appendEvent(state, { type: "HAND_REFRESHED", playerId, discarded: 1, drawn: 0 });
        }
      }
      returnHeldMoraleCardToDeckBottom(state, playerId, "morale.negative.random_combat_discard", "used");
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

/**
 * Whether `playerId` is the side defending their own Faction Town in this
 * combat. The rulebook (p.46) forbids surrendering such a defence — "you cannot
 * surrender when defending your Faction Town" — whether or not the town has a
 * Citadel (a siege). A Town's `controllerId` is its faction owner and never
 * changes on conquest (only the field flag does), so a player merely HOLDING a
 * conquered enemy Town is not defending a Faction Town here and may still
 * surrender, matching "Don't use Walls and Gate … you've conquered before".
 */
export function isDefendingOwnFactionTown(state: GameState, playerId: PlayerId): boolean {
  const combat = state.combat;
  if (!combat || combat.context.kind !== "player" || combat.defenderPlayerId !== playerId) {
    return false;
  }
  const fieldId = combat.context.fieldId;
  return Object.values(state.towns).some((town) => town.fieldId === fieldId && town.controllerId === playerId);
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
  // A Secondary Hero surrenders differently (house rule): instead of paying the
  // 10-gold toll it SACRIFICES itself — the 2nd hero is removed from the game and
  // the opponent gains no victory credit (see finalizeAdventureCombat). This is
  // the only escape that costs no gold, so it needs no affordability check.
  const escapingHero = state.heroes[heroId];
  const secondarySurrender = reason === "surrender" && escapingHero?.kind === "secondary";
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
    // Rulebook p.46: no surrender while defending your own Faction Town.
    if (isDefendingOwnFactionTown(state, playerId)) {
      throw new Error("You cannot surrender while defending your Faction Town.");
    }
    // The main-hero surrender is a paid escape: you must hold the full toll to
    // choose it (no debt). A poorer hero must Retreat or fight on. The Secondary
    // Hero pays with the hero itself, not gold, so it is exempt.
    if (!secondarySurrender && (state.players[playerId]?.resources.gold ?? 0) < SURRENDER_GOLD_COST) {
      throw new Error(`Surrender costs ${SURRENDER_GOLD_COST} gold — Retreat or fight on instead.`);
    }
  }
  const winnerPlayerId = playerId === combat.attackerPlayerId ? combat.defenderPlayerId : combat.attackerPlayerId;
  const outcomeReason = secondarySurrender ? "surrender-secondary" : reason;
  // Escaping straight from the pre-battle prep window ends the fight before it
  // begins: close the prep so the result is shown (the map no longer holds).
  combat.prep = null;
  combat.outcome = { winnerPlayerId, defeatedPlayerId: playerId, reason: outcomeReason };
  appendEvent(state, { type: "COMBAT_ENDED", winnerPlayerId, defeatedPlayerId: playerId, reason: outcomeReason });
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
/**
 * Pirates (Astrologers): the winner of a Combat other than Quick Combat gains
 * one Resource die. Queued as a reward so it rolls after the battle closes.
 * Only a live human winner qualifies; a Quick Combat never reaches finalize, so
 * the "other than Quick Combat" clause holds by construction.
 */
function queuePiratesResourceDie(state: GameState, winnerId: PlayerId): void {
  if (winnerId === NEUTRAL_PLAYER_ID) {
    return;
  }
  const player = state.players[winnerId];
  if (!player || player.eliminated) {
    return;
  }
  if (getActiveAstrologersCard(state)?.effect.type !== "COMBAT_WIN_RESOURCE_DIE") {
    return;
  }
  state.adventure?.rewardQueue.push({
    playerId: winnerId,
    kind: "visit-steps",
    steps: [{ type: "ROLL_RESOURCE_DICE", count: 1 }]
  });
}

export function finalizeAdventureCombat(state: GameState): void {
  const combat = state.combat;
  const adventure = state.adventure;
  if (!combat || !combat.outcome || !adventure || combat.context.kind === "sandbox") {
    return;
  }

  const context = combat.context;
  const outcome = combat.outcome;

  // Single-player smoothing cleanup: the computer's temporary Empowered
  // Attack/Defense cards are removed from the game before ANY outcome branch
  // (win, retreat, surrender) — they are never kept past the battle.
  removeComputerCombatBoost(state);

  // Pirates (Astrologers): reward the winner one Resource die (both the neutral
  // and PvP branches below share this one hook). A no-op unless Pirates is up.
  queuePiratesResourceDie(state, outcome.winnerPlayerId);

  // Combat is over: discard every combat-scoped active effect now. A fought-out
  // win already expired them when the last unit fell (finishCombatIfNeeded), but
  // a Retreat / Surrender / Give-up ends the battle by setting `outcome` WITHOUT
  // that path — so without this, player-scoped combat buffs (Bulwark Runes) would
  // leak in `state.activeEffects` and the NEXT combat would stack on top of them.
  // Idempotent: a no-op when nothing combat-scoped remains.
  appendExpiredEffectEvents(state, expireEffectsForCombatEnd(state), "combat-ended");

  // No casualties are applied to a player-vs-player fight when either the
  // lobby's "Keep troops" mode is on, or this was a Surrender (house rule: a
  // surrendering hero always keeps its whole army, in both modes). No unit card
  // is removed and no Pack is downgraded — the army cards stay exactly as they
  // entered the fight. Fights against Neutral guards always cost casualties.
  const keepTroops =
    context.kind === "player" &&
    (adventurePvpTroopLoss(state) === "none" ||
      outcome.reason === "surrender" ||
      // A Secondary-Hero surrender (house rule) sacrifices only the hero — the
      // player's shared army is kept intact, in both troop-loss modes.
      outcome.reason === "surrender-secondary");

  // Give up (concede, player-vs-player only): a defeat that costs only the
  // casualties taken up to the point of conceding — destroyed units leave and
  // damaged Packs flip, but survivors stay (it does NOT forfeit the whole army).
  // In losing-troop mode that is exactly the normal casualty settlement below;
  // in keep-troops mode every unit is kept and the conceding hand is discarded
  // instead (handled after the loop). The opponent settles normally either way.
  const gaveUp = outcome.reason === "give-up";
  const giveUpLoserId = gaveUp ? outcome.defeatedPlayerId : null;
  const giveUpKeepsTroops = gaveUp && context.kind === "player" && adventurePvpTroopLoss(state) === "none";

  // WOG Commanders: persist deaths (a fallen commander stays dead until
  // revived for gold) and remember whose commander survived this battle.
  const commanderSurvivors = finalizeCommandersAfterCombat(state);
  // Hierophant "First Aid Master": collect restorable bronze/silver casualties
  // BEFORE the army-sync loop below rewrites `armyUnit.side` (the Pack→Few
  // flip detection needs the pre-sync side). Only a surviving Hierophant tends
  // the wounded, and only when this fight actually costs casualties.
  let firstAidPlayerId: PlayerId | null = null;
  let firstAidOptions: CommanderFirstAidOption[] = [];
  if (!keepTroops) {
    for (const playerId of [combat.attackerPlayerId, combat.defenderPlayerId]) {
      if (
        playerId !== NEUTRAL_PLAYER_ID &&
        commanderSurvivors.has(playerId) &&
        playerHasLivingCommander(state, playerId, "hierophant") &&
        !(giveUpKeepsTroops && playerId === giveUpLoserId)
      ) {
        const options = collectFirstAidCandidates(state, playerId);
        if (options.length > 0) {
          // One window per combat: with unique factions there is never more
          // than one Hierophant owner in a fight.
          firstAidPlayerId = playerId;
          firstAidOptions = options;
          break;
        }
      }
    }
  }

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

    // Tarnum (Rampart) Sharpshooters VI: a borrowed Neutral unit is "discarded
    // afterwards" — return its card to its tier's Neutral discard pile (whether it
    // lived or died) and never write it back to the army (it carries no army card).
    if (unit.temporary && unit.unitDefId) {
      const def = unit.grade === "gold" ? "gold" : unit.grade;
      const deck = state.decks[NEUTRAL_DECK_IDS[def as "bronze" | "silver" | "gold" | "azure"]];
      deck?.discardPile.push(unit.unitDefId);
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
    } else if (armyUnit.side === "neutral") {
      // Surviving Neutral: keep paid Stack layers (and drop them if all spent).
      if ((unit.armyStacks ?? 0) > 0) {
        armyUnit.stacks = unit.armyStacks;
      } else {
        delete armyUnit.stacks;
      }
    } else {
      armyUnit.side = unit.variant === "pack" ? "pack" : "few";
      if (unit.variant === "pack" && (unit.armyStacks ?? 0) > 0) {
        armyUnit.stacks = unit.armyStacks;
      } else {
        // A Pack casualty that flipped to Few is no longer a Group; every
        // remaining Polish Stack token is lost with that side change.
        delete armyUnit.stacks;
      }
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

  // Brute "Soul Reformer": the winner gains 2 gold after each combat won while
  // the Brute survived it (the board adaptation of "50% of battle experience
  // in gold" — this game has no mana/XP pools to convert).
  if (
    outcome.winnerPlayerId !== NEUTRAL_PLAYER_ID &&
    commanderSurvivors.has(outcome.winnerPlayerId) &&
    playerHasLivingCommander(state, outcome.winnerPlayerId, "brute")
  ) {
    gainResources(state, outcome.winnerPlayerId, { gold: 2 }, "Soul Reformer");
    appendEvent(state, {
      type: "COMMANDER_SPECIALTY_TRIGGERED",
      playerId: outcome.winnerPlayerId,
      commanderSlug: "brute",
      specialtyId: "soul-reformer",
      message: "The Brute reforges the fallen — +2 gold."
    });
  }

  // Open the Hierophant's post-combat First Aid window (choose 1 casualty to
  // restore, or decline). Gated in legal-actions: until resolved, the owner
  // may only answer it — exactly like the Necromancy deferral it mirrors.
  if (firstAidPlayerId && firstAidOptions.length > 0) {
    adventure.pendingCommanderFirstAid = { playerId: firstAidPlayerId, options: firstAidOptions };
  }

  if (context.kind === "neutral") {
    const hero = state.heroes[context.heroId];
    const playerId = hero?.controllerId;
    const field = adventure.fields[context.fieldId];

    if (hero && playerId) {
      if (outcome.winnerPlayerId === playerId) {
        // Creature Banks have no Field Difficulty and grant NO experience
        // (rulebook p.66). Secondary Heroes never gain experience either; the
        // gold (Freelancer's Guild) and Necromancy rewards below are
        // player-level and still apply.
        if (hero.kind === "main" && !context.bankId) {
          const level = hero.level;
          // Field Difficulty Ⅶ (and any azure guard fight): winning jumps the
          // Main Hero straight to level 7 (fills remaining experience). Diff 7
          // always fields azure guards in the army table, but key off difficulty
          // too so a stripped/empty azure draw cannot deny the level-up.
          if (context.hasAzure || context.difficulty >= 7) {
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
          // Defeated neutral cards may owe the winner extra Resource dice (WOG
          // Santa Gremlin). Driven by the printed EXTRA_RESOURCE_DIE_ON_NEUTRAL_DEFEAT
          // ability, not a unit id, and scaled by the number defeated.
          const bonusResourceDice = Object.values(combat.units)
            .filter((unit) => unit.controllerId === NEUTRAL_PLAYER_ID && unit.damage >= unit.maxHealth)
            .reduce(
              (total, unit) =>
                total +
                neutralUnitAbilityEffects(unit.unitDefId).reduce(
                  (dice, effect) =>
                    dice + (effect.type === "EXTRA_RESOURCE_DIE_ON_NEUTRAL_DEFEAT" ? effect.count : 0),
                  0
                ),
              0
            );
          if (bonusResourceDice > 0) {
            winner.pendingWogResourceDice = (winner.pendingWogResourceDice ?? 0) + bonusResourceDice;
          }
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
        // Defeat: the hero falls back to a friendly town or settlement. The
        // fighter is always the turn-owner, so offer the town-or-settlement
        // retreat CHOICE (interactive) when they own more than one.
        moveDefeatedHeroHome(state, hero, true);
      }

      restoreStartingArmyIfEmpty(state, playerId);
    }

    state.combat = null;
    state.activePlayerId = playerId ?? state.activePlayerId;
    state.priorityPlayerId = null;

    if (hero && playerId && outcome.winnerPlayerId === playerId && field) {
      // House rule (BINH): winning a battle at sea does NOT end the hero's
      // movement. A hero that was already sailing (sea→sea into a guarded hex,
      // which does not halt) keeps its remaining movement and can sail on after
      // the win, exactly like a hero that wins a battle on land. A hero that
      // WADED onto the guard (a land→sea step) stays halted by that step itself
      // (haltAfterSeaStep, set during the move), so the coastline rule is intact —
      // only the extra post-sea-combat halt is dropped.

      // Dragon Hunt: defeating the Utopia wins the Scenario IMMEDIATELY — never
      // defer behind Necromancy / First Aid / field-reward timing. (The visit
      // handler also declares the win for Quick Combat / Diplomacy paths.)
      if (field.location === "dragon_utopia" && adventureVictoryMode(state) === "dragon-hunt") {
        // Victory Points: record the defeater (this fast path bypasses the visit
        // handler where it is normally logged) before the win → scoring seam.
        recordVpUtopiaDefeat(state, playerId);
        declareAdventureWinner(state, playerId, "defeated the Dragon Utopia", {
          viaVictoryCondition: true
        });
        return;
      }

      if (context.bankId) {
        // Creature Bank win: claim the bank reward, scaled by X = the number of
        // Stacked defenders (rulebook p.66-67). Banks sit outside the BINH
        // Necromancy-timing deferral — their reward is granted immediately
        // (there is no held-back field reward to price the reinforce against).
        grantCreatureBankReward(state, hero.id, context.fieldId, context.bankStackCount ?? 0);
        // ...but a bank fight is still a non-Quick Combat win, so a Necropolis
        // hero who holds Necromancy still gets the now-or-never after-combat
        // window (the bug: there was no upgrade prompt at all after a bank). No
        // fieldId is deferred here — the bank reward already resolved above, so
        // the window carries nothing to withhold; it just lets the player play
        // or skip Necromancy before doing anything else. Any reward prompt the
        // bank queued (`pendingVisit`) resolves first; the Necromancy gate in
        // legal-actions sits behind it.
        if (playerCanPlayNecromancy(state, playerId)) {
          adventure.pendingNecromancy = { playerId, heroId: hero.id };
        }
      } else if (playerCanPlayNecromancy(state, playerId)) {
        // BINH house rule: Necromancy is a now-or-never decision made BEFORE the
        // field reward. If the winner can play it this instant, defer the field
        // visit behind the decision (its reward is withheld until they play or
        // skip); otherwise visit the field immediately as usual.
        adventure.pendingNecromancy = { playerId, heroId: hero.id, fieldId: context.fieldId };
      } else {
        beginFieldVisit(state, hero.id, context.fieldId, false);
      }
    }

    // A field visit (or the Utopia check above) may have just ended the game —
    // do not reopen the map turn.
    if (state.adventure?.winnerPlayerId) {
      return;
    }

    state.phase = "player-turn";
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
  // Secondary-Hero surrender (house rule): the loser sacrifices ONLY the 2nd
  // hero (removed from the game) — no gold, no morale, and the opponent earns no
  // victory credit, exactly like a main-hero surrender denies credit. The 2nd
  // hero's owner keeps their main hero, army, cards and gold.
  const surrenderedSecondary = outcome.reason === "surrender-secondary";
  const escapedWithoutDefeat = surrendered || surrenderedSecondary;

  if (loserHero) {
    if (surrendered) {
      // The 10-gold toll was required to choose Surrender (no debt) and now
      // transfers to the opponent. The hero falls back home with its full army.
      spendResources(state, loserId, { gold: SURRENDER_GOLD_COST }, "surrendered the combat");
      gainResources(state, winnerId, { gold: SURRENDER_GOLD_COST }, "accepted the enemy's surrender");
      // Only the ATTACKER (the turn-owner) can be prompted mid-turn; a defender
      // who surrenders auto-homes to avoid a cross-turn stall.
      moveDefeatedHeroHome(state, loserHero, loserHero === attackerHero);
      forceOtherHeroesHomeFromField(state, loserId, context.fieldId, loserHero.id);
      // Victory Points: a surrendered (escaped) enemy hero grants the opponent 1
      // VP. Tracked unconditionally; read only when VP mode is scored.
      recordVpSurrender(state, winnerId);
    } else if (surrenderedSecondary) {
      // No gold, no morale hit, no victory credit — the 2nd hero itself is the
      // price. Remove it from the game (the player may hire another later).
      removeSecondaryHeroFromGame(state, loserHero);
      // Victory Points: a surrendered Secondary Hero is still a surrendered hero
      // (1 VP to the opponent).
      recordVpSurrender(state, winnerId);
    } else {
      // Victory Points: a REAL combat defeat (retreat or fought-out) — a Main
      // hero grants 3 VP once per opponent, a Secondary hero 1 VP each. Mirrors
      // how the engine already treats retreat and army-destruction identically
      // as "a win against the player" for the conquest hero-defeat credit above.
      recordVpHeroDefeat(state, winnerId, loserId, loserHero.kind);

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

      // The loser pays the 5-gold toll to the winner. House rule
      // ("defeat-gold-debt", default ON in BINH): the full toll is paid even if
      // it overdraws the treasury — gold may go negative, paid down later by
      // income. When off (the normal rule), the toll is capped at the loser's
      // gold so it never drops below zero, and the winner receives only what the
      // loser could actually pay.
      const allowGoldDebt = houseRuleEnabled(state, "defeat-gold-debt");
      const loserGold = Math.max(0, state.players[loserId]?.resources.gold ?? 0);
      const goldToll = allowGoldDebt ? RETREAT_GOLD_COST : Math.min(RETREAT_GOLD_COST, loserGold);
      spendResources(state, loserId, { gold: goldToll }, "defeated by an enemy hero");
      gainResources(state, winnerId, { gold: goldToll }, "spoils of victory");
      changeMorale(state, loserId, -1);
      // A fought-out or retreat loss: the attacker (turn-owner) picks their
      // retreat; a beaten defender auto-homes (no cross-turn prompt).
      moveDefeatedHeroHome(state, loserHero, loserHero === attackerHero);
      // Any OTHER heroes of the loser still standing on the contested field
      // (typically a Secondary Hero that shared the Town with the Main Hero)
      // also fall back home. Without this, the secondary stays on the captured
      // field — unattackable, still "alive" for the opponent, and both can end
      // up stacked on the same Town hex after the main retreats home.
      forceOtherHeroesHomeFromField(state, loserId, context.fieldId, loserHero.id);

      // Grail Hunt & Dragon Hunt: beating an enemy hero in a real fight (retreat
      // or a fought-out loss) counts toward the "defeat every enemy hero at least
      // once" win path (only 2 of the 3 in a 4-player game). House rule: a
      // Secondary Hero fought and lost counts as "1 win against the player" too,
      // exactly like a main hero — so this branch no longer gates on
      // `loserHero.kind === "main"`. Neither Surrender variant reaches this branch
      // (each is handled above), so a sacrificed 2nd hero still grants no credit.
      if (
        victoryModeCountsHeroDefeats(adventureVictoryMode(state)) &&
        winnerId !== NEUTRAL_PLAYER_ID &&
        loserId !== winnerId
      ) {
        const defeats = (adventure.heroDefeats ??= {});
        const beaten = (defeats[winnerId] ??= []);
        if (!beaten.includes(loserId)) {
          beaten.push(loserId);
        }
        // Seat count includes eliminated observers so a mid-game elimination
        // never lowers the threshold (3-player still needs 2 defeats; 4-player
        // still needs 2 of 3).
        if (beaten.length >= requiredHeroDefeats(adventureSeatCount(state))) {
          declareAdventureWinner(state, winnerId, "defeated the required enemy heroes", {
            viaVictoryCondition: true
          });
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
  // but never on a Surrender (main or Secondary-Hero), which is not a combat
  // victory for the opponent.
  if (!escapedWithoutDefeat && winnerId !== NEUTRAL_PLAYER_ID && state.players[winnerId]) {
    state.players[winnerId].necromancyWindow = true;
  }

  state.combat = null;

  // Siege defeat (house rule): a player whose MAIN Hero is defeated defending
  // their OWN faction Town — and who has no other base (Settlement or captured
  // Random Town) to fall back to — is eliminated IMMEDIATELY, not put on the
  // usual 2-turn grace clock. The reasoning the user gave: with the main Hero
  // beaten and the last Town falling, there is no Hero left to recapture a base,
  // so the grace turns are pointless. `eliminatePlayer` then resolves both
  // outcomes from one place: with two players the survivor wins on the spot
  // (last faction standing); with three or more it is just this player's loss
  // and the game continues. The winner's "1 win" toward the defeat-every-hero
  // victory path (the faction-cube credit) was already recorded above, in the
  // real-defeat branch's `heroDefeats` block, for the victory modes that count
  // it. A Settlement (or Random Town) survivor is NOT eliminated — the beaten
  // Hero simply retreats there via moveDefeatedHeroHome above. Surrenders and
  // heroless garrison defenses never reach here (loserHero is null or the
  // escape flags are set), matching "defend with the main hero".
  // The defended Field must genuinely be the loser's faction Town — a Town
  // LOCATION they still control. Checking `state.towns` alone is not enough: a
  // captured Dragon Utopia (Dragon Conqueror mode) re-purposes a town field's
  // location while its Town entry still points at it, so the location guard
  // keeps a Utopia siege out of this rule.
  const defenderFieldLocation = adventure.fields[context.fieldId]?.location;
  const defenderOwnMainTown =
    defenderFieldLocation != null &&
    locationDefinitions[defenderFieldLocation]?.category === "town" &&
    Object.values(state.towns).some(
      (town) => town.fieldId === context.fieldId && town.controllerId === loserId
    );
  if (
    !escapedWithoutDefeat &&
    !state.adventure?.winnerPlayerId &&
    loserId === combat.defenderPlayerId &&
    loserHero?.kind === "main" &&
    defenderOwnMainTown &&
    !controlsTownOrSettlement(state, loserId, context.fieldId)
  ) {
    eliminatePlayer(state, loserId, "their Main Hero fell defending their last Town", false);
  }

  // A win declared above (defeat-every-hero, or the siege elimination just now
  // taking the last enemy faction) ends the game; do not reopen turns.
  if (state.adventure?.winnerPlayerId) {
    state.priorityPlayerId = null;
    return;
  }

  state.phase = "player-turn";
  state.activePlayerId = attackerHero?.controllerId ?? state.activePlayerId;
  state.priorityPlayerId = null;

  if (winnerHero && winnerHero.id === context.attackerHeroId) {
    // The attacker took the contested field by winning. House rule (BINH):
    // winning at sea does NOT halt the hero (see neutral case) — a hero already
    // sailing (sea→sea) keeps its remaining movement, while one that WADED in
    // stays halted by that step itself. So no extra sea-combat halt here.
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

// ---------------------------------------------------------------------------
// WOG Commanders — map-side actions (grade-up picks, revive, First Aid).
// ---------------------------------------------------------------------------

/**
 * COMMANDER_GRADE_UP: spend one stat point to raise a single stat by one grade
 * (max grade 3). Points are earned on hero level-ups. Never inside a combat —
 * the commander's battlefield unit is built from its grades at combat start.
 */
export function commanderGradeUp(
  state: GameState,
  action: Extract<GameAction, { type: "COMMANDER_GRADE_UP" }>
): void {
  const player = state.players[action.playerId];
  const commander = player?.commander;
  if (!player || !commander) {
    throw new Error("You have no commander to grade up.");
  }
  if (state.combat) {
    throw new Error("Commander grade-ups resolve outside of combat.");
  }
  if ((commander.gradePoints ?? 0) <= 0) {
    throw new Error("No commander stat points to spend.");
  }

  const { stat } = action;
  if (!stat || !COMMANDER_STAT_KEYS.includes(stat)) {
    throw new Error("Pick a commander stat to raise.");
  }
  const grades = commanderGradesOf(commander);
  if (grades[stat] >= 3) {
    throw new Error(`${stat} is already at grade 3.`);
  }
  // Mastery gate: the final step INTO grade 3 (from grade 2) is only allowed
  // once the main hero has reached level COMMANDER_MASTERY_MIN_HERO_LEVEL.
  // Grades 1 and 2 are unrestricted.
  if (grades[stat] === 2) {
    const heroLevel = getMainHero(state, action.playerId)?.level ?? 1;
    if (heroLevel < COMMANDER_MASTERY_MIN_HERO_LEVEL) {
      throw new Error(
        `Your commander can only master ${stat} (grade 3) once your hero reaches level ${COMMANDER_MASTERY_MIN_HERO_LEVEL}.`
      );
    }
  }

  commander.grades[stat] = grades[stat] + 1;
  commander.gradePoints = (commander.gradePoints ?? 0) - 1;
  appendEvent(state, {
    type: "COMMANDER_GRADED_UP",
    playerId: action.playerId,
    commanderSlug: commander.slug,
    stat,
    message: `Commander grade-up: ${stat} rises to grade ${commander.grades[stat]}.`
  });
}

/**
 * COMMANDER_SET_STANCE: Superior Combat specialty (Shaman / Sea Marshal) — pick
 * the +1 Attack / +1 Defense stance the commander enters its next combat with.
 * Chosen outside combat (the bonus is baked into the unit at combat setup).
 */
export function commanderSetStance(
  state: GameState,
  action: Extract<GameAction, { type: "COMMANDER_SET_STANCE" }>
): void {
  const player = state.players[action.playerId];
  const commander = player?.commander;
  if (!player || !commander) {
    throw new Error("You have no commander.");
  }
  if (state.combat) {
    throw new Error("The commander's stance is chosen outside of combat.");
  }
  if (commanderDefinitions[commander.slug as CommanderSlug]?.specialty.id !== "superior-combat") {
    throw new Error("This commander has no combat stance.");
  }
  if (action.stance !== "attack" && action.stance !== "defense") {
    throw new Error("Pick +1 Attack or +1 Defense.");
  }
  commander.stance = action.stance;
}

/**
 * REVIVE_COMMANDER: pay gold (2 + 2x hero level) on the map to bring a dead
 * commander back for its next combat.
 */
export function reviveCommander(
  state: GameState,
  action: Extract<GameAction, { type: "REVIVE_COMMANDER" }>
): void {
  const player = state.players[action.playerId];
  const commander = player?.commander;
  if (!player || !commander) {
    throw new Error("You have no commander.");
  }
  if (!commander.dead) {
    throw new Error("Your commander is alive.");
  }
  if (state.combat) {
    throw new Error("Commanders are revived outside of combat.");
  }

  const hero = getMainHero(state, action.playerId);
  const cost = commanderReviveCost(hero?.level ?? 1);
  if (!hasResources(player, { gold: cost })) {
    throw new Error(`Reviving the commander costs ${cost} gold.`);
  }
  spendResources(state, action.playerId, { gold: cost }, "revived the commander");
  commander.dead = false;
  appendEvent(state, {
    type: "COMMANDER_REVIVED",
    playerId: action.playerId,
    commanderSlug: commander.slug,
    goldPaid: cost,
    message: `The ${commanderDefinitions[commander.slug as CommanderSlug]?.name ?? "commander"} returns to duty (${cost} gold).`
  });
}

/**
 * COMMANDER_FIRST_AID: resolve the Hierophant's post-combat window — restore
 * the chosen bronze/silver casualty (a died card returns to the army, a
 * flipped-down Pack flips back up) or decline (optionIndex null).
 */
export function resolveCommanderFirstAid(
  state: GameState,
  action: Extract<GameAction, { type: "COMMANDER_FIRST_AID" }>
): void {
  const adventure = state.adventure;
  const pending = adventure?.pendingCommanderFirstAid;
  if (!adventure || !pending || pending.playerId !== action.playerId) {
    throw new Error("No First Aid window is open for you.");
  }
  const player = state.players[action.playerId];
  if (!player) {
    throw new Error("Unknown player.");
  }

  if (action.optionIndex === null) {
    adventure.pendingCommanderFirstAid = null;
    appendEvent(state, {
      type: "COMMANDER_FIRST_AID_USED",
      playerId: action.playerId,
      message: "The Hierophant's First Aid is declined."
    });
    return;
  }

  const option = pending.options[action.optionIndex];
  if (!option) {
    throw new Error("That First Aid choice does not exist.");
  }

  if (option.kind === "flip-up") {
    const armyUnit = player.army.find((candidate) => candidate.id === option.armyUnitId);
    if (!armyUnit || armyUnit.unitDefId !== option.unitDefId || armyUnit.side !== "few") {
      throw new Error("That unit can no longer be restored.");
    }
    armyUnit.side = "pack";
  } else {
    // A revived Neutral-side card is pulled back OUT of the tier discard pile
    // it just recycled into, so the physical card is never duplicated.
    if (option.side === "neutral") {
      const tier = (option.neutralTier ?? "bronze") as keyof typeof NEUTRAL_DECK_IDS;
      const discard = state.decks[NEUTRAL_DECK_IDS[tier]]?.discardPile;
      const index = discard ? discard.lastIndexOf(option.unitDefId) : -1;
      if (!discard || index === -1) {
        throw new Error("That card has left the Neutral discard pile.");
      }
      discard.splice(index, 1);
    }
    addArmyUnit(player, option.unitDefId, option.side);
  }

  adventure.pendingCommanderFirstAid = null;
  appendEvent(state, {
    type: "COMMANDER_FIRST_AID_USED",
    playerId: action.playerId,
    message: `First Aid Master: ${option.label}.`
  });
}

/**
 * The friendly fields a defeated Hero may fall back to, in default (auto-home)
 * order: the player's OWN Town first — unless an enemy has flagged it (rulebook
 * p.76) — then every Settlement they own. The Hero's current field (the fight
 * site) is never a Town/Settlement, but is excluded defensively. The first entry
 * is the auto-home default (Town preferred); with two or more entries the loser
 * may CHOOSE between them (see `moveDefeatedHeroHome`).
 */
function defeatedHeroRetreatDestinations(
  state: GameState,
  hero: HeroState
): { label: string; spaceId: MapSpaceId }[] {
  const adventure = state.adventure;
  if (!adventure) {
    return [];
  }
  const playerId = hero.controllerId;
  const destinations: { label: string; spaceId: MapSpaceId }[] = [];

  const town = getTownOfPlayer(state, playerId);
  const townField = town?.fieldId ? adventure.fields[town.fieldId] : null;
  const townUsable = Boolean(townField && (townField.flagOwnerId == null || townField.flagOwnerId === playerId));
  if (townUsable && town?.fieldId && town.fieldId !== hero.spaceId) {
    destinations.push({ label: `Town (${town.factionId ?? town.id})`, spaceId: town.fieldId });
  }

  for (const field of Object.values(adventure.fields)) {
    if (field.location === "settlement" && field.flagOwnerId === playerId && field.spaceId !== hero.spaceId) {
      destinations.push({ label: "Settlement", spaceId: field.spaceId });
    }
  }

  return destinations;
}

/**
 * Relocate a defeated Hero. The rulebook lets a beaten Hero "move to a friendly
 * Town or Settlement" — the player's CHOICE, not a fixed Town. When the defeated
 * player is the one whose turn is open (every neutral loss, and a PvP loss taken
 * by the ATTACKER) and their MAIN Hero owns two or more retreat fields, this
 * opens a retreat CHOICE: a pendingVisit the loser resolves by clicking the
 * destination Town/Settlement hex (or a button in the visit-step tray). With a
 * single retreat field it auto-homes there; with none the Hero leaves the map.
 *
 * A NON-active loser (a PvP DEFENDER beaten on the attacker's turn) and a
 * Secondary Hero always auto-home to the default (Town preferred). We never open
 * a cross-turn prompt — mirroring how the winner's Necromancy window defers to
 * its owner's own turn — so a defender's loss can never stall the attacker's
 * turn, and the AFK/forced/computer resolver (which defaults a mandatory
 * RESOLVE_VISIT_STEP to its first option, the Town) still has a valid answer.
 */
function moveDefeatedHeroHome(state: GameState, hero: HeroState, interactive = false): void {
  const adventure = state.adventure;
  if (!adventure) {
    return;
  }

  const destinations = defeatedHeroRetreatDestinations(state, hero);

  if (interactive && hero.kind === "main" && destinations.length >= 2) {
    // Leave the beaten Hero on the fight field (movement spent) and let its
    // owner pick which friendly Town or Settlement to fall back to. The choice
    // is pumped into a pendingVisit right after this action resolves, so the
    // Hero is never left stranded between actions.
    hero.movementPoints = 0;
    adventure.rewardQueue.unshift({
      playerId: hero.controllerId,
      kind: "visit-steps",
      steps: [
        {
          type: "CHOOSE_ONE",
          prompt: "Defeated — fall back to…",
          options: destinations.map((destination) => ({
            label: destination.label,
            steps: [{ type: "TELEPORT_HERO" as const, heroId: hero.id, spaceId: destination.spaceId }]
          }))
        }
      ]
    });
    return;
  }

  hero.spaceId = destinations[0]?.spaceId ?? null;
  hero.movementPoints = 0;
}

/**
 * After a PvP loss on `fieldId`, auto-home every other hero of `playerId` still
 * standing on that field (the Secondary sharing a Town with the Main, etc.).
 * Always non-interactive — these companions never opened the fight, so they
 * never get a retreat picker of their own.
 */
function forceOtherHeroesHomeFromField(
  state: GameState,
  playerId: PlayerId,
  fieldId: MapSpaceId,
  exceptHeroId: string
): void {
  for (const hero of Object.values(state.heroes)) {
    if (hero.controllerId !== playerId || hero.id === exceptHeroId || hero.spaceId !== fieldId) {
      continue;
    }
    moveDefeatedHeroHome(state, hero, false);
  }
}

/**
 * Secondary-Hero surrender (house rule): the sacrificed 2nd hero is removed from
 * the game entirely (unlike a defeated hero, which merely falls back home). The
 * player keeps their main hero, army, cards and gold, and may hire a new
 * Secondary Hero later. Heroes live only in `state.heroes` (keyed by id; players
 * hold no hero list and armies are per-player, not per-hero), so deleting the
 * entry is a complete removal — `getSecondaryHero` will then report none.
 */
function removeSecondaryHeroFromGame(state: GameState, hero: HeroState): void {
  hero.spaceId = null;
  hero.movementPoints = 0;
  delete state.heroes[hero.id];
  appendEvent(state, {
    type: "HERO_LOST",
    playerId: hero.controllerId,
    heroId: hero.id,
    message: `${state.players[hero.controllerId]?.name ?? hero.controllerId} surrendered their Secondary Hero to escape the battle.`
  });
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
    const searchCount = polishSpellBookEnabled(state) ? 3 : 2;
    state.adventure?.rewardQueue.push(
      {
        playerId: action.playerId,
        kind: "shared-deck-search",
        deckId: "spells",
        count: searchCount,
        ...(polishSpellBookEnabled(state) ? { allowCastCardInstead: true } : {})
      },
      {
        playerId: action.playerId,
        kind: "shared-deck-search",
        deckId: "spells",
        count: searchCount,
        ...(polishSpellBookEnabled(state) ? { allowCastCardInstead: true } : {})
      }
    );
  }

  // Cube buildings (Brimstone Stormclouds): "When built …, place your
  // faction cube here."
  if (building.effect?.type === "COMBAT_CUBES") {
    gainTownCube(state, town, action.buildingId, building.effect.max);
  }
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
  // Recruiting a Secondary Hero at the Town spends the Population Token — the same
  // token that recruits/reinforces units. Requiring and consuming it here enforces
  // the rule "Units cannot be recruited or reinforced while using the Population
  // Token to recruit a Secondary Hero": once it is spent on the hero, the recruit/
  // reinforce offers (gated on townTokens.population) are gone for the round, and a
  // token already spent on units this round can't also buy a hero.
  if (!player.townTokens.population) {
    throw new Error("The Population token was already used this round.");
  }
  const cost = { gold: 10 };
  if (!hasResources(player, cost)) {
    throw new Error("Hiring a Secondary Hero costs 10 gold.");
  }
  // A hired hero may appear at the Town or any controlled Settlement; offer the
  // choice when more than one is legal (it falls back to a direct placement when
  // only one Field qualifies).
  const placements = secondaryHeroPlacementFields(state, action.playerId);
  if (placements.length === 0) {
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
  // Spend the Population Token on the hero: no unit recruit/reinforce this round.
  player.townTokens.population = false;
  if (placements.length === 1) {
    createSecondaryHero(state, action.playerId, placements[0].fieldId, action.heroDefId);
    return;
  }
  state.adventure?.rewardQueue.push({
    playerId: action.playerId,
    kind: "visit-steps",
    steps: [secondaryHeroPlacementStep(state, action.playerId, undefined, action.heroDefId)]
  });
  pumpAdventureQueues(state);
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
    throw new Error("Choose at least one recruit, reinforcement, or Stack.");
  }

  // Stack costs deliberately ignore every recruit/reinforce discount and the
  // Freelancer's Guild substitution. Keep Stack batches separate so a mixed
  // action cannot accidentally route a Stack through those discounts.
  const buysStacks = action.purchases.some((purchase) => purchase.kind === "stack");
  const buysUnits = action.purchases.some((purchase) => purchase.kind !== "stack");
  if (buysStacks && buysUnits) {
    throw new Error("Buy Unit Stacks separately from recruits and reinforcements.");
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
  const priced: { ref?: RecruitPurchaseRef; finalCost: ResourceCost }[] = [];

  // Validate before mutating: simulate against a copy of the army.
  const armyCopy = player.army.map((unit) => ({ ...unit }));
  for (const purchase of action.purchases) {
    // Stacks may target recruited Neutrals (not on the faction roster).
    // Recruits/reinforces stay faction-only.
    if (purchase.kind !== "stack" && !faction?.units.includes(purchase.unitDefId)) {
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
      // Factory: Couatls and Juggernauts are mutually exclusive — you cannot have
      // both in your army (the choice between the two Gold units). armyCopy folds
      // in earlier purchases in this same action, so you cannot buy both at once.
      if (factoryGoldUnitConflict(armyCopy, purchase.unitDefId)) {
        throw new Error(
          "Factory: choose Couatls or Juggernauts — you cannot have both in your army."
        );
      }
      // The total gold discount reserved for THIS unit (a Legion voucher stacks
      // with any building/location recruit-cost source).
      const ref: RecruitPurchaseRef = { kind: "recruit", unitDefId: purchase.unitDefId };
      const finalCost = applyRecruitGoldDiscount(state, action.playerId, ref, side.cost);
      addCost(finalCost);
      priced.push({ ref, finalCost });
      armyCopy.push({ id: `pending_${armyCopy.length}`, unitDefId: purchase.unitDefId, side: "few" });
    } else if (purchase.kind === "reinforce") {
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
      // The total gold discount for THIS reinforce: a Legion voucher reserved for
      // this unit STACKS with the Champions' Stables discount (two Legion pieces
      // still take the larger).
      // `target` was matched against purchase.armyUnitId above, so target.id is
      // the validated (defined) army unit id.
      const ref: RecruitPurchaseRef = {
        kind: "reinforce",
        unitDefId: purchase.unitDefId,
        armyUnitId: target.id
      };
      const finalCost = applyRecruitGoldDiscount(state, action.playerId, ref, packSide.cost);
      addCost(finalCost);
      priced.push({ ref, finalCost });
      target.side = "pack";
    } else {
      if (!houseRuleEnabled(state, "polish-unit-stacks")) {
        throw new Error("The Polish Unit Stacks rule is not enabled.");
      }
      if (!canReinforce) {
        throw new Error("Buying a Unit Stack needs a Citadel.");
      }
      const target = armyCopy.find((unit) => unit.id === purchase.armyUnitId);
      if (!target || target.unitDefId !== purchase.unitDefId || !polishArmyUnitCanBuyStack(target)) {
        throw new Error("Choose an eligible Pack or Neutral unit below its Stack cap.");
      }
      // Cost follows the card's actual side (Pack gold or Neutral gold + tier).
      const finalCost = polishArmyUnitStackCost(target) ?? polishUnitStackCost(purchase.unitDefId);
      if (!finalCost) {
        throw new Error("That unit cannot buy Stacks.");
      }
      addCost(finalCost);
      priced.push({ finalCost });
      target.stacks = (target.stacks ?? 0) + 1;
    }
  }

  if (buysStacks ? !hasResources(player, totalCost) : !hasRecruitResources(state, action.playerId, totalCost)) {
    throw new Error(buysStacks ? "Not enough resources for those Unit Stacks." : "Not enough resources for those units.");
  }

  if (buysStacks) {
    spendResources(state, action.playerId, totalCost, "Polish Unit Stacks");
  } else {
    spendRecruitResources(state, action.playerId, totalCost, "population action");
  }
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
    } else if (purchase.kind === "reinforce") {
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
    } else {
      const target = player.army.find((unit) => unit.id === purchase.armyUnitId);
      if (target) {
        target.stacks = (target.stacks ?? 0) + 1;
        appendEvent(state, {
          type: "ARMY_STACK_PURCHASED",
          playerId: action.playerId,
          armyUnitId: target.id,
          unitDefId: target.unitDefId,
          stacks: target.stacks,
          cost: finalCost
        });
      }
    }
    // Spend the Legion voucher reserved for this exact unit (single-use).
    const recruitRef = priced[index]?.ref;
    if (recruitRef) {
      consumeRecruitVoucherFor(state, action.playerId, recruitRef);
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

  if (state.combat && !inCombatPrep(state, action.playerId)) {
    throw new Error("Town actions cannot interrupt a combat.");
  }

  const town = getTownOfPlayer(state, action.playerId);
  const mageGuild = town?.buildings
    .map((buildingId) => coreBuildingDefinitions[buildingId])
    .find((building) => building?.effect?.type === "MAGE_GUILD");

  if (action.rollSpell) {
    if (!polishSpellBookEnabled(state) || !mageGuild) {
      throw new Error("Rolling Spells needs the Polish Spell Book and a Mage Guild.");
    }
    if (player.polishSpellRollUsedRound === state.round) {
      throw new Error("Rolling Spells is limited to once per turn.");
    }
    const source = action.rollSpell.source === "used" ? (player.spellBookUsed ??= []) : player.spellBook;
    const spellIndex = source.indexOf(action.rollSpell.cardId);
    if (spellIndex === -1) {
      throw new Error("Choose one of your owned Spell Book cards to roll.");
    }
    if (!hasResources(player, { gold: 3 })) {
      throw new Error("Rolling Spells costs 3 gold.");
    }
    spendResources(state, action.playerId, { gold: 3 }, "Rolling Spells");
    source.splice(spellIndex, 1);
    state.decks.spells?.discardPile.push(action.rollSpell.cardId);
    player.polishSpellRollUsedRound = state.round;
    state.adventure?.rewardQueue.push({
      playerId: action.playerId,
      kind: "shared-deck-search",
      deckId: "spells",
      count: 2
    });
    appendEvent(state, { type: "SPELLS_PURCHASED", playerId: action.playerId, cost: { gold: 3 } });
    return;
  }

  if (!player.townTokens.spellBook) {
    throw new Error("The Spell Book token was already used this round.");
  }

  // Mages (Astrologers): the Spell Book token is free this round AND usable even
  // without a Mage Guild — so the guild requirement (and its "same round built"
  // restriction, which is about the guild) is waived and the gold cost is 0.
  const magesFree = freeSpellBookActive(state);
  if (!mageGuild && !magesFree) {
    throw new Error("Buying spells needs a Mage Guild.");
  }

  if (mageGuild && player.mageGuildBuiltRound === state.round && !magesFree) {
    throw new Error("The Spell Book token cannot be used the round the Mage Guild was built.");
  }

  let goldCost = magesFree ? 0 : (mageGuild?.spellBookCost ?? 5);
  let searchCount = polishSpellBookEnabled(state) ? 3 : 2;
  const wisdom = action.wisdom;
  if (action.takeCastCard && (!polishSpellBookEnabled(state) || wisdom)) {
    throw new Error("Cast a Spell replaces a normal Polish Mage Guild purchase.");
  }

  if (wisdom) {
    const card = cardLibrary[wisdom.cardId];
    if (card?.name !== "Wisdom" || !player.hand.includes(wisdom.cardId)) {
      throw new Error("Playing Wisdom here needs a Wisdom card in hand.");
    }
    // An Empowered Wisdom skips the crown (it still pays the gold).
    if (
      wisdom.mode === "expert" &&
      expertUsesAvailable(player) <= 0 &&
      !abilityExpertIsCrownFree(player, wisdom.cardId)
    ) {
      throw new Error("No expert uses are available for expert Wisdom.");
    }

    goldCost = Math.max(
      0,
      goldCost - wisdomGoldDiscount(getRuleset(state), wisdom.mode, houseRuleEnabled(state, "wisdom-expert-discount"))
    );
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
    if (wisdom.mode === "expert" && !abilityExpertIsCrownFree(player, wisdom.cardId)) {
      player.combatStats.expertUsesSpentThisRound += 1;
    }
    appendEvent(state, {
      type: "CARD_PLAYED",
      playerId: action.playerId,
      cardId: wisdom.cardId,
      timing: "town",
      mode: wisdom.mode,
      optionLabel: `Wisdom: −${wisdomGoldDiscount(getRuleset(state), wisdom.mode, houseRuleEnabled(state, "wisdom-expert-discount"))} gold, Search (${searchCount})`
    });
  }

  if (goldCost > 0) {
    spendResources(state, action.playerId, cost, "spell book");
  }
  player.townTokens.spellBook = false;
  appendEvent(state, { type: "SPELLS_PURCHASED", playerId: action.playerId, cost });

  if (action.takeCastCard) {
    player.hand.push(CAST_A_SPELL_CARD_ID);
    return;
  }

  state.adventure?.rewardQueue.push({
    playerId: action.playerId,
    kind: "shared-deck-search",
    deckId: "spells",
    count: searchCount,
    // Buying spells at the Mage Guild is Basic-only until the hero is level 4 or
    // a IV–V tile has been discovered. Owning Wisdom/Eagle Eye/Basic Magic does
    // NOT unlock the Expert deck here (unlike every other spell source).
    strictExpertGate: true
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
 * Magic University (Conflux): once per round, instead of buying spells normally,
 * choose a School of Magic and dig the top of your deck for a Spell of that
 * school, taking it to hand (the rejects stay discarded).
 */
export function magicUniversityAction(
  state: GameState,
  action: Extract<GameAction, { type: "MAGIC_UNIVERSITY_ACTION" }>
): void {
  const player = state.players[action.playerId];
  if (!player) {
    throw new Error("Unknown player.");
  }

  if (state.combat) {
    throw new Error("Town actions cannot interrupt a combat.");
  }

  if (!townHasBuildingEffect(state, action.playerId, "MAGIC_UNIVERSITY")) {
    throw new Error("This action needs a Magic University.");
  }

  if (player.magicUniversityUsedRound === state.round) {
    throw new Error("The Magic University was already used this round.");
  }

  player.magicUniversityUsedRound = state.round;
  resolveMagicUniversityDig(state, action.playerId, action.school);
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

  if (!hasOpenAdventureTurn(state, action.playerId)) {
    throw new Error("Use this building during your own turn.");
  }
  // These buildings open choices/discards of their own — one at a time.
  assertParallelInteractionFree(state, action.playerId);

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
  if (!player) {
    throw new Error("No positive morale token to spend.");
  }

  if (moraleCardsRuleEnabled(state)) {
    // Positive Morale "+1 Attack, +1 Defense, or +1 Combat Power during the
    // next Combat": played while the holder is fighting; the chosen stat buffs
    // every own unit for the rest of this Combat. The third printed option —
    // Combat Power — is a Battlefield-expansion-mode value with no regular-game
    // roll, so only the Attack/Defense picks are offered.
    if (action.benefit === "combat-bonus") {
      const combat = state.combat;
      const combatBonusCardId = MORALE_CARD_IDS.combatBonus;
      if (!(player.moraleCards?.positive ?? []).includes(combatBonusCardId)) {
        throw new Error("No Positive Morale combat-bonus card to use.");
      }
      if (!combat || combat.outcome || (combat.attackerPlayerId !== action.playerId && combat.defenderPlayerId !== action.playerId)) {
        throw new Error("The combat bonus is used during your own Combat.");
      }
      const stat = action.bonus;
      if (stat !== "attack" && stat !== "defense") {
        throw new Error("Choose +1 Attack or +1 Defense for this Combat.");
      }
      const effect = makeActiveEffect(
        state,
        {
          name: stat === "attack" ? "Positive Morale: +1 Attack" : "Positive Morale: +1 Defense",
          scope: "player",
          duration: { type: "combat" },
          polarity: "positive",
          removable: false,
          modifiers: [stat === "attack" ? { type: "ATTACK_BONUS", amount: 1 } : { type: "DEFENSE_BONUS", amount: 1 }]
        },
        { type: "card", cardId: combatBonusCardId, controllerId: action.playerId },
        action.playerId
      );
      state.activeEffects.push(effect);
      appendEvent(state, {
        type: "ACTIVE_EFFECT_CREATED",
        effectId: effect.id,
        controllerId: effect.controllerId,
        name: effect.name,
        duration: effect.duration
      });
      returnHeldMoraleCardToDeckBottom(state, action.playerId, combatBonusCardId, "used");
      return;
    }

    // Positive Morale "remove a morale-token marker from one of your units":
    // the marker itself is a Battlefield-mode component, so in regular games
    // the card lifts one negative combat token — Weakness, Corrosion or
    // Paralysis — off an own unit (deliberate engine reading, see the card).
    if (action.benefit === "remove-token") {
      const combat = state.combat;
      const removeTokenCardId = MORALE_CARD_IDS.removeToken;
      if (!(player.moraleCards?.positive ?? []).includes(removeTokenCardId)) {
        throw new Error("No Positive Morale remove-token card to use.");
      }
      const unit = action.unitId ? combat?.units[action.unitId] : undefined;
      if (!combat || combat.outcome || !unit || unit.controllerId !== action.playerId) {
        throw new Error("Pick one of your own units in the running Combat.");
      }
      const kind = action.tokenKind;
      if (kind !== "weakness" && kind !== "corrosion" && kind !== "paralysis") {
        throw new Error("Pick the negative token to remove.");
      }
      if (!removeToken(state, unit, kind, "dispelled")) {
        throw new Error("That unit does not carry that token.");
      }
      returnHeldMoraleCardToDeckBottom(state, action.playerId, removeTokenCardId, "used");
      return;
    }

    const redrawCardId = "morale.positive.redraw_hand";
    if (action.benefit !== "redraw" || !(player.moraleCards?.positive ?? []).includes(redrawCardId)) {
      throw new Error("No Positive Morale redraw card to use.");
    }
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

    for (const cardId of discards) {
      const index = player.hand.indexOf(cardId);
      player.hand.splice(index, 1);
      player.discard.push(cardId);
    }
    drawCardsForPlayer(state, action.playerId, discards.length);
    returnHeldMoraleCardToDeckBottom(state, action.playerId, redrawCardId, "used");
    return;
  }

  const hasOverflow = (player?.moraleOverflow ?? 0) > 0;
  if (!hasOverflow && player.morale < 1) {
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

/**
 * Satyrs (army map ability): "Once per turn. Roll an Attack die. On a '+1',
 * gain [morale_positive]." Rolls the die server-side from the game seed
 * and appends an ADVENTURE_DICE_ROLLED event, then updates morale on a "+1".
 * Marks the per-turn use regardless of the outcome.
 */
export function satyrMoraleRoll(state: GameState, action: Extract<GameAction, { type: "SATYR_MORALE_ROLL" }>): void {
  assertActiveTurn(state, action.playerId);
  assertNoPendingInput(state);

  const player = state.players[action.playerId];
  if (!player) {
    throw new Error("Unknown player.");
  }
  if (!armyHasMapEffect(state, action.playerId, "MAP_TURN_MORALE_ROLL")) {
    throw new Error("No Satyrs in your army to roll with.");
  }
  if (player.satyrMoraleRollUsedThisTurn) {
    throw new Error("The Satyrs already rolled their morale die this turn.");
  }

  player.satyrMoraleRollUsedThisTurn = true;

  const faces = [-1, -1, 0, 0, 1, 1] as const;
  const random = createSeededRandom(`${state.seed}#adventure#satyr-morale-roll#${eventSeedNumber(state)}`);
  let roll = faces[random.nextInt(0, faces.length - 1)] ?? 0;

  // Multilingual Bron (Astrologers): a unit-ability roll that came up against
  // its user is rerolled once — the Satyrs' morale die gains only on a "+1".
  if (roll <= 0 && abilityRollRerollActive(state)) {
    appendEvent(state, {
      type: "ADVENTURE_DICE_ROLLED",
      playerId: action.playerId,
      dice: "attack",
      results: [`Satyrs: ${roll > 0 ? "+" : ""}${roll} — Multilingual Bron rerolls`],
      attackRolls: [roll]
    });
    roll = faces[random.nextInt(0, faces.length - 1)] ?? 0;
  }

  appendEvent(state, {
    type: "ADVENTURE_DICE_ROLLED",
    playerId: action.playerId,
    dice: "attack",
    results: [`Satyrs: ${roll > 0 ? "+" : ""}${roll}`],
    attackRolls: [roll]
  });

  if (roll > 0) {
    changeMorale(state, action.playerId, 1);
  }
}

/**
 * Resolves a Thieves' Guild target to the draw pile + discard pile it manipulates
 * (a shared deck, or a player's personal Might & Magic deck). Returns null when
 * the deck/player does not exist.
 */
export function thievesGuildPiles(
  state: GameState,
  target: ThievesGuildTarget
): { drawPile: CardId[]; discardPile: CardId[] } | null {
  if (target.kind === "shared") {
    const deck = state.decks[target.deckId];
    return deck ? { drawPile: deck.drawPile, discardPile: deck.discardPile } : null;
  }
  const owner = state.players[target.ownerId];
  return owner ? { drawPile: owner.deck, discardPile: owner.discard } : null;
}

/** Human label for a Thieves' Guild target deck (used in the choice prompt). */
function thievesGuildTargetName(state: GameState, target: ThievesGuildTarget): string {
  if (target.kind === "shared") {
    return `the ${deckDisplayName(state, target.deckId)} deck`;
  }
  const owner = state.players[target.ownerId];
  return `${owner?.name ?? target.ownerId}'s Might & Magic deck`;
}

/**
 * Thieves' Guild (Cove): "Once during your turn, choose any one deck in the game
 * (including another player's M&M deck), look at its top 2 cards, and put one of
 * them on its discard pile and the other back on top of the deck." Peeks the top
 * two cards (private) and opens the discard-one choice; the building is marked
 * used for this round (one use per turn).
 */
export function thievesGuildAction(
  state: GameState,
  action: Extract<GameAction, { type: "THIEVES_GUILD_ACTION" }>
): void {
  assertActiveTurn(state, action.playerId);
  assertNoPendingInput(state);

  const player = state.players[action.playerId];
  if (!player) {
    throw new Error("Unknown player.");
  }

  const building = coreBuildingDefinitions[action.buildingId];
  const ownBuildingId = findTownBuildingWithEffect(state, action.playerId, "THIEVES_GUILD");
  if (!building || building.effect?.type !== "THIEVES_GUILD" || ownBuildingId !== action.buildingId) {
    throw new Error("You have no Thieves' Guild to use.");
  }
  if ((player.buildingUsedRound?.[action.buildingId] ?? 0) === state.round) {
    throw new Error(`${building.name} was already used this turn.`);
  }

  const piles = thievesGuildPiles(state, action.target);
  if (!piles) {
    throw new Error("That deck cannot be looked at.");
  }
  if (piles.drawPile.length < 2) {
    throw new Error("That deck has fewer than 2 cards to look at.");
  }

  // Top of a draw pile is the last element. Index 0 is the very top.
  const topCardId = piles.drawPile[piles.drawPile.length - 1];
  const secondCardId = piles.drawPile[piles.drawPile.length - 2];

  player.buildingUsedRound = { ...player.buildingUsedRound, [action.buildingId]: state.round };

  const topName = cardLibrary[topCardId]?.name ?? topCardId;
  const secondName = cardLibrary[secondCardId]?.name ?? secondCardId;
  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId: action.playerId,
    prompt: `Thieves' Guild — ${thievesGuildTargetName(state, action.target)}: top 2 are ${topName} (top) and ${secondName}. Discard one; the other goes back on top.`,
    options: [
      { label: `Discard ${topName} — keep ${secondName} on top` },
      { label: `Discard ${secondName} — keep ${topName} on top` }
    ],
    context: "thieves-guild",
    thievesGuild: { target: action.target, cardIds: [topCardId, secondCardId] },
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

  if (choice.context === "morale-positive-limit") {
    const cardId = choice.moralePositiveLimit?.cardIds[action.optionIndex];
    if (!cardId) {
      throw new Error("Pick one of the Positive Morale cards to discard.");
    }
    const player = state.players[action.playerId];
    const heldIndex = player?.moraleCards?.positive.findIndex((candidate, index) => {
      if (candidate !== cardId) {
        return false;
      }
      const priorCopiesInChoice = choice.moralePositiveLimit?.cardIds
        .slice(0, action.optionIndex)
        .filter((prior) => prior === cardId).length ?? 0;
      const priorCopiesHeld = player.moraleCards?.positive.slice(0, index).filter((prior) => prior === cardId).length ?? 0;
      return priorCopiesHeld === priorCopiesInChoice;
    }) ?? -1;
    if (heldIndex === -1) {
      throw new Error("That Positive Morale card is no longer held.");
    }
    discardHeldMoraleCardByIndex(state, action.playerId, "positive", heldIndex, "positive-limit");
    state.pendingChoice = null;
    state.phase = choice.returnPhase;
    state.priorityPlayerId = null;
    openMoralePositiveLimitChoiceIfNeeded(state, action.playerId);
    return;
  }

  if (choice.context === "morale-repeat-search") {
    const data = choice.moraleRepeatSearch;
    const player = state.players[action.playerId];
    if (!data || !player) {
      throw new Error("That morale offer cannot be resolved.");
    }
    state.pendingChoice = null;
    state.phase = choice.returnPhase;
    state.priorityPlayerId = null;

    // Option 0 resolves the card: the gained card is discarded from hand and
    // the same Search (X) runs again. Any other option keeps both cards.
    if (action.optionIndex === 0) {
      const handIndex = player.hand.indexOf(data.cardId);
      const bookIndex = player.spellBook.indexOf(data.cardId);
      if (handIndex === -1 && bookIndex === -1) {
        throw new Error("The card gained from the Search is no longer available.");
      }
      if (!consumeHeldMoraleCard(state, action.playerId, MORALE_CARD_IDS.repeatSearch)) {
        throw new Error("That Positive Morale card is no longer held.");
      }
      if (handIndex !== -1) {
        player.hand.splice(handIndex, 1);
      } else {
        player.spellBook.splice(bookIndex, 1);
      }
      player.discard.push(data.cardId);
      if (state.adventure) {
        state.adventure.rewardQueue.unshift({
          playerId: action.playerId,
          kind: "shared-deck-search",
          deckId: data.deckId,
          count: data.count
        });
        pumpAdventureQueues(state);
      } else {
        openSharedDeckSearch(state, action.playerId, data.deckId, data.count);
      }
      return;
    }

    // Declined: the Pendant of Courage (if held) may still repeat this Search;
    // otherwise the queued round rewards resume.
    if (maybeOpenPendantRepeatOffer(state, action.playerId, data.deckId, data.count, choice.returnPhase)) {
      return;
    }
    if (state.adventure) {
      pumpAdventureQueues(state);
    }
    return;
  }

  if (choice.context === "pendant-repeat-search") {
    const data = choice.pendantRepeatSearch;
    const player = state.players[action.playerId];
    if (!data || !player) {
      throw new Error("That Pendant of Courage offer cannot be resolved.");
    }
    state.pendingChoice = null;
    state.phase = choice.returnPhase;
    state.priorityPlayerId = null;

    // Option 0 plays the Pendant: discard it and run the same Search (X) once
    // more. The card gained from the first Search is KEPT (unlike the morale
    // card, which trades its gained card). Any other option keeps the Pendant.
    if (action.optionIndex === 0) {
      const handIndex = player.hand.indexOf(PENDANT_OF_COURAGE_ID);
      if (handIndex === -1) {
        throw new Error("The Pendant of Courage is no longer in hand.");
      }
      player.hand.splice(handIndex, 1);
      player.discard.push(PENDANT_OF_COURAGE_ID);
      appendEvent(state, {
        type: "CARD_PLAYED",
        playerId: action.playerId,
        cardId: PENDANT_OF_COURAGE_ID,
        timing: "instant",
        mode: "basic"
      });
      if (state.adventure) {
        state.adventure.rewardQueue.unshift({
          playerId: action.playerId,
          kind: "shared-deck-search",
          deckId: data.deckId,
          count: data.count
        });
        pumpAdventureQueues(state);
      } else {
        openSharedDeckSearch(state, action.playerId, data.deckId, data.count);
      }
      return;
    }

    // Declined: keep the Pendant; queued round rewards resume.
    if (state.adventure) {
      pumpAdventureQueues(state);
    }
    return;
  }

  if (choice.context === "place-creature-bank") {
    const data = choice.creatureBank;
    const adventure = state.adventure;
    const bankTile = data
      ? adventure?.tiles[
          data.tileInstanceId ?? (data.fieldId ? adventure.fields[data.fieldId]?.tileInstanceId : undefined) ?? ""
        ]
      : undefined;
    const sizedCandidates = data?.candidates ?? [];
    if (data?.preRotation) {
      const selected = sizedCandidates[action.optionIndex];
      const pile = data.tier === "far" ? adventure?.creatureBankTokensFar : adventure?.creatureBankTokensNear;
      if (!selected || !bankTile || !pile?.includes(selected.bankId) || !isCreatureBankId(selected.bankId)) {
        throw new Error("Choose one of the two rolled Creature Banks.");
      }
      // Keep only the chosen bank on the rotating tile. Consumption waits for
      // final placement, so a gate that destroys the Blocked Field cannot lose
      // a physical token from the pile.
      bankTile.reservedBankId = selected.bankId;
      bankTile.reservedBankOptions = [selected];
      state.pendingChoice = null;
      state.phase = choice.returnPhase;
      state.priorityPlayerId = null;
      return;
    }
    if (data && adventure && sizedCandidates.length > 0) {
      const pile = data.tier === "far" ? adventure.creatureBankTokensFar : adventure.creatureBankTokensNear;
      const selected = sizedCandidates[action.optionIndex];
      if (selected) {
        const tokenIndex = pile?.lastIndexOf(selected.bankId) ?? -1;
        if (!pile || tokenIndex < 0 || !isCreatureBankId(selected.bankId)) {
          throw new Error("That rolled Creature Bank is no longer available.");
        }
        pile.splice(tokenIndex, 1);
        if (!data.fieldId) {
          throw new Error("That Creature Bank has no final Blocked Field.");
        }
        placeCreatureBank(state, data.fieldId, selected.bankId, selected.size);
      } else if (action.optionIndex !== sizedCandidates.length) {
        throw new Error("Choose one of the offered Creature Banks or leave the field blocked.");
      }
    } else if (data && adventure && action.optionIndex === 0) {
      // Rule-off control: preserve the original single top-token flow exactly.
      const pile = data.tier === "far" ? adventure.creatureBankTokensFar : adventure.creatureBankTokensNear;
      const bankId = pile?.pop();
      if (bankId && isCreatureBankId(bankId)) {
        if (!data.fieldId) {
          throw new Error("That Creature Bank has no final Blocked Field.");
        }
        placeCreatureBank(state, data.fieldId, bankId);
      }
    }
    if (bankTile) {
      bankTile.reservedBankId = undefined;
      bankTile.reservedBankOptions = undefined;
    }
    state.pendingChoice = null;
    state.phase = choice.returnPhase;
    state.priorityPlayerId = null;
    // A Monolith/Whirlpool token riding the same tile waited behind the bank
    // prompt; its placement (by the same discovering player) opens now.
    if (bankTile) {
      offerPendingTokenPlacement(state, bankTile, action.playerId);
    }
    return;
  }

  if (choice.context === "place-map-token") {
    const data = choice.mapToken;
    const adventure = state.adventure;
    const spaceId = data?.candidates[action.optionIndex];
    if (!data || !adventure || !spaceId) {
      throw new Error("Choose one of the offered fields for the token.");
    }
    state.pendingChoice = null;
    state.phase = choice.returnPhase;
    state.priorityPlayerId = null;
    const tile = adventure.tiles[data.tileInstanceId];
    if (tile) {
      // Carves the token at the pick; when this placement was the destination
      // of an in-flight Monolith/Whirlpool travel, the hero arrives on it (and
      // a Whirlpool travel takes its unit toll).
      placeMapToken(state, tile, spaceId, action.playerId);
    }
    return;
  }

  if (choice.context === "subterranean-gate-placement") {
    const data = choice.subterraneanGate;
    const adventure = state.adventure;
    const candidate = data?.candidates[action.optionIndex];
    // Record the player's pick, then carve the gate at their chosen hex/pairing
    // (recompute honours the plan and warns what each sacrifice cost).
    if (data && adventure && candidate) {
      upsertGatePlan(adventure, candidate);
      carveGatesWithWarning(state, action.playerId, true);
    }
    state.pendingChoice = null;
    state.phase = choice.returnPhase;
    state.priorityPlayerId = null;
    // Gate carved first, so a Blocked Field that became the gate hex is gone and
    // no bank is offered there — otherwise the freshly revealed tile may still
    // bank on a Blocked Field the gate spared.
    const tile = data ? adventure?.tiles[data.tileInstanceId] : undefined;
    if (data?.deferBank && tile) {
      offerCreatureBankPlacement(state, tile, action.playerId);
    }
    // And a Monolith/Whirlpool token on the tile waits behind BOTH the gate and
    // the bank prompts (the gate carve may have consumed a candidate hex).
    if (tile && !state.pendingChoice) {
      offerPendingTokenPlacement(state, tile, action.playerId);
    }
    return;
  }

  if (choice.context === "far-tile-flip") {
    // resolveFarTileFlip drives the keep/reroll/pick state machine — it either
    // re-opens the next choice or finalizes (placing the tile, restoring phase).
    resolveFarTileFlip(state, action.optionIndex);
    return;
  }

  if (choice.context === "satyr-swap") {
    state.pendingChoice = null;
    resolveSatyrSwap(state, action.playerId, action.optionIndex);
    return;
  }

  if (choice.context === "judge-dread") {
    state.pendingChoice = null;
    resolveJudgeDread(state, action.playerId, action.optionIndex);
    return;
  }

  if (choice.context === "visions-guard-cast") {
    state.pendingChoice = null;
    resolveVisionsGuardCast(state, action.playerId, action.optionIndex);
    return;
  }

  if (choice.context === "visions-guard-boost") {
    // The resolver reads and then clears the pending choice.
    resolveVisionsGuardBoost(state, action.playerId, action.optionIndex);
    return;
  }

  if (choice.context === "visions-guard-swap") {
    // The resolver reads and then clears the pending choice.
    resolveVisionsGuardSwap(state, action.playerId, action.optionIndex);
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
    openSharedDeckSearch(
      state,
      action.playerId,
      deckId,
      choice.deckPick?.count ?? 2,
      false,
      Boolean(choice.deckPick?.allowRemove)
    );
    return;
  }

  if (choice.context === "polish-spell-or-cast") {
    const data = choice.polishSpellOrCast;
    if (!data || !polishSpellBookEnabled(state)) {
      throw new Error("That Polish Mage Guild reward is no longer available.");
    }
    state.pendingChoice = null;
    state.phase = choice.returnPhase;
    state.priorityPlayerId = null;
    if (action.optionIndex === 1) {
      state.players[action.playerId]?.hand.push(CAST_A_SPELL_CARD_ID);
      return;
    }
    if (action.optionIndex !== 0) {
      throw new Error("Choose a Spell search or Cast a Spell.");
    }
    beginSharedDeckSearchNow(state, action.playerId, "spells", data.count, false, {
      strictExpertGate: data.strictExpertGate
    });
    return;
  }

  if (choice.context === "combat-remove-then-search") {
    // Spellbinder's Hat (option A) played mid-combat: remove the picked hand
    // card from the game, then Search its own deck immediately (the reward
    // queue is parked during a live combat). A trailing "Skip" carries no
    // card — no removal, no Search — mirroring the map visit-step's Skip.
    const data = choice.removeThenSearch;
    const player = state.players[action.playerId];
    if (!data || !player) {
      throw new Error("That removal cannot be resolved.");
    }
    const cardId = data.cardIds[action.optionIndex];
    if (cardId !== undefined) {
      const handIndex = player.hand.indexOf(cardId);
      if (handIndex === -1) {
        throw new Error("That card is no longer in your hand.");
      }
      player.hand.splice(handIndex, 1);
      player.removed.push(cardId);
    }
    state.pendingChoice = null;
    state.phase = choice.returnPhase;
    state.priorityPlayerId = null;
    if (cardId !== undefined) {
      // The same deck derivation as the map flow's "search-same-deck" step:
      // only removable kinds (spell/ability/artifact) are ever offered.
      const kind = cardLibrary[cardId]?.kind;
      const deckId = kind === "spell" ? "spells" : kind === "artifact" ? "artifacts" : "abilities";
      beginSharedDeckSearchNow(state, action.playerId, deckId, data.searchCount);
    }
    return;
  }

  if (choice.context === "combat-remove-another") {
    // Spellbinder's Hat (option B) played mid-combat: the Hat already removed
    // itself (cost.removeSelf); the picked hand or discard card leaves the
    // game too. A trailing "Skip" carries no entry and removes nothing.
    const player = state.players[action.playerId];
    if (!choice.removeAnother || !player) {
      throw new Error("That removal cannot be resolved.");
    }
    const entry = choice.removeAnother.entries[action.optionIndex];
    if (entry) {
      const pile = entry.source === "hand" ? player.hand : player.discard;
      const pileIndex = pile.indexOf(entry.cardId);
      if (pileIndex === -1) {
        throw new Error("That card is no longer available to remove.");
      }
      pile.splice(pileIndex, 1);
      player.removed.push(entry.cardId);
    }
    state.pendingChoice = null;
    state.phase = choice.returnPhase;
    state.priorityPlayerId = null;
    return;
  }

  if (choice.context === "scouting-prompt") {
    const prompt = choice.scoutingPrompt;
    if (!prompt) {
      throw new Error("That Scouting prompt cannot be resolved.");
    }
    state.pendingChoice = null;
    state.phase = choice.returnPhase;
    state.priorityPlayerId = null;

    // Option 0 declines; the basic / expert plays follow in the order they were
    // offered (mirroring openScoutingPrompt).
    if (action.optionIndex > 0) {
      const tiers: ("basic" | "expert")[] = [];
      if (prompt.offerBasic) {
        tiers.push("basic");
      }
      if (prompt.offerExpert) {
        tiers.push("expert");
      }
      const tier = tiers[action.optionIndex - 1];
      if (!tier) {
        throw new Error("That Scouting option is not available.");
      }
      playScoutingCard(state, action.playerId, tier);
    }

    // Resume the Search (the override, if any, is consumed on the reveal).
    openSharedDeckSearch(state, action.playerId, prompt.deckId, prompt.baseCount, true, Boolean(prompt.allowRemove));
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
      revealSharedDeckSearch(state, action.playerId, mode.deckId, mode.count, Boolean(mode.allowRemove));
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
      gainOwnedCard(state, action.playerId, takenCardId);
      // Mirror the DECK_SEARCH resolver: an Ability card pulled from the shared
      // deck is tracked so its printed ability can be granted, and — when this
      // Search was the level-up one — recorded against its level for the board.
      if (mode.deckId === "abilities") {
        (player.deckDrawnAbilityCardIds ??= []).push(takenCardId);
        recordLevelUpAbilityPick(player, takenCardId);
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

    // Pendant of Courage: offered as a post-Search decision to perform the whole
    // Search action once more, even when this branch took the discard top or
    // drew from a School of Magic.
    maybeOpenPendantRepeatOffer(state, action.playerId, mode.deckId, mode.count, choice.returnPhase);
    return;
  }

  if (choice.context === "discard-pick") {
    const pick = choice.discardPick;
    const cardId = pick?.cardIds[action.optionIndex];
    const player = state.players[action.playerId];
    if (!pick || !cardId || !player) {
      throw new Error("Pick one of the offered discard cards.");
    }

    // Spell Book (house rule): a Spell may be routed straight into the Book on
    // pickup; everything else (and every pick when the rule is off) goes to hand.
    // A starting-only Spell (Magic Arrow) has no Book home, so it always goes to
    // hand even if a fabricated pick names the Book.
    const destination = pick.destinations?.[action.optionIndex] ?? "hand";
    const source = pick.sources?.[action.optionIndex] ?? "discard";
    const sourcePile = source === "polish-used" ? (player.spellBookUsed ??= []) : player.discard;
    const index = sourcePile.lastIndexOf(cardId);
    if (index !== -1) {
      sourcePile.splice(index, 1);
      if (source === "polish-used") {
        player.spellBook.push(cardId);
      } else if (destination === "spellBook" && spellCanEnterSpellBook(cardId)) {
        player.spellBook.push(cardId);
      } else {
        player.hand.push(cardId);
      }
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
      gainOwnedCard(state, action.playerId, dig.cardId);
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

  if (choice.context === "thieves-guild") {
    const data = choice.thievesGuild;
    const piles = data ? thievesGuildPiles(state, data.target) : null;
    if (!data || !piles) {
      throw new Error("There is no thieved deck to resolve.");
    }
    if (action.optionIndex !== 0 && action.optionIndex !== 1) {
      throw new Error("Pick which of the two cards to discard.");
    }
    if (piles.drawPile.length < 2) {
      throw new Error("That deck no longer has its top 2 cards.");
    }
    // Lift the two cards we peeked off the top (top = end of the array): the
    // first pop is the very top (index 0), the second pop is the card beneath it.
    const top = piles.drawPile.pop()!;
    const second = piles.drawPile.pop()!;
    const peeked = [top, second];
    const discardCardId = peeked[action.optionIndex];
    const keepCardId = peeked[1 - action.optionIndex];
    // The chosen card goes to that deck's discard; the other returns on top.
    piles.discardPile.push(discardCardId);
    piles.drawPile.push(keepCardId);
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

  if (choice.context === "wayfarer-paralysis") {
    resolveWayfarerParalysisChoice(state, action.playerId, action.optionIndex);
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

  if (choice.context === "pandora-scry") {
    resolvePandoraScryChoice(state, action.playerId, action.optionIndex);
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

  if (choice.context === "pandora-upkeep") {
    const player = state.players[action.playerId];
    state.pendingChoice = null;
    state.phase = choice.returnPhase;
    state.priorityPlayerId = null;
    // Mark the upkeep paid for this turn either way, so ending the turn again
    // does not re-open the choice; the flag clears at the next turn start.
    if (player) {
      player.pandoraUpkeepResolvedThisTurn = true;
    }
    if (action.optionIndex === 0) {
      // "Remove this card": the rulebook Remove keyword — the card leaves the
      // GAME (removed pile), not the discard, so it can never be recalled and
      // replayed for another free +1 Power run.
      const cardId = getPermanentCardIds(state, action.playerId).find(
        (id) => cardLibrary[id]?.permanentEffect?.endTurnUpkeep === "remove-or-negative-morale"
      );
      if (cardId) {
        removePermanentFromPlayToRemoved(state, action.playerId, cardId);
      }
    } else {
      // Keep the card; take a Negative Morale token instead.
      changeMorale(state, action.playerId, -1);
    }
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
      // Necropolis City Hall: let the player PICK which bronze unit to reinforce
      // for free, rather than silently upgrading the first one in the army. The
      // picker is queued as a reward and resolves once this choice closes (the
      // action dispatcher pumps the reward queue, exactly as for the Trading
      // Post / Spell-deck-search options above).
      queueFreeBronzeReinforce(state, action.playerId, "City Hall: reinforce one bronze unit for free");
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
    if (option.searchSpellDeck) {
      // Conflux City Hall: Search(N) the Spell deck and take 1 card to hand,
      // through the shared-deck-search pipeline (self-guards on an empty deck).
      state.adventure?.rewardQueue.push({
        playerId: action.playerId,
        kind: "shared-deck-search",
        deckId: "spells",
        count: option.searchSpellDeck
      });
    }
    // Cove City Hall: REMOVE an Artifact card from hand (this option is only
    // offered when the player holds one — see the choice presentation) to gain
    // experience. The card is removed FROM THE GAME (the "remove" keyword —
    // player.removed), NOT discarded to the player's discard pile, matching the
    // Blacksmith's "remove an Artifact card from hand" (sellArtifactAtBlacksmith).
    if (option.removeArtifactFromHand) {
      const player = state.players[action.playerId];
      const artifactIndex = player?.hand.findIndex((cardId) => cardLibrary[cardId]?.kind === "artifact") ?? -1;
      if (player && artifactIndex >= 0) {
        const [removed] = player.hand.splice(artifactIndex, 1);
        player.removed.push(removed);
        appendEvent(state, {
          type: "TOWN_BUILDING_USED",
          playerId: action.playerId,
          buildingId: "cove.city_hall",
          message: `City Hall: removed ${cardLibrary[removed]?.name ?? removed} from the game to gain experience.`
        });
      }
    }
    if (option.experience) {
      gainExperience(state, action.playerId, option.experience);
    }
    // Bulwark City Hall combat focus (Gamefound Update #3): forgo the gold to be
    // Rune-Empowered until the next Resource round — every combat then starts
    // with this many extra Runes. This SETS the flag (replace), it never ADDS to
    // it: the +2 must NOT stack into +4/+6 round after round. The Resource-round
    // loop (adventure.ts) clears the flag to 0 before re-offering this choice, so
    // picking the combat focus again only ever re-applies the flat +2.
    if (option.runesNextCombats) {
      const player = state.players[action.playerId];
      if (player) {
        player.runeEmpoweredNextCombats = option.runesNextCombats;
        appendEvent(state, {
          type: "TOWN_BUILDING_USED",
          playerId: action.playerId,
          buildingId: "bulwark.city_hall",
          message: `City Hall: Rune-Empowered — +${option.runesNextCombats} starting Runes each combat until the next Resource round.`
        });
      }
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
/** Empty-field destinations an end-of-turn step (Logistics / Nomads) may land on. */
export function getEndTurnMoveDestinationsForHero(state: GameState, hero: HeroState): MapSpaceId[] {
  const adventure = state.adventure;
  if (!adventure || !hero.spaceId) {
    return [];
  }
  const playerId = hero.controllerId;

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

/** @deprecated Prefer {@link getEndTurnMoveDestinationsForHero} — Main Hero only. */
export function getEndTurnMoveDestinations(state: GameState, playerId: PlayerId): MapSpaceId[] {
  const hero = getMainHero(state, playerId);
  return hero ? getEndTurnMoveDestinationsForHero(state, hero) : [];
}

/** Queues the "move to an adjacent empty field, or stay" end-turn choice. */
function offerEndTurnAdjacentMove(state: GameState, playerId: PlayerId, prompt: string): boolean {
  const adventure = state.adventure;
  if (!adventure) {
    return false;
  }

  // Logistics / Nomads: either hero the player commands may take the free step
  // (wiki Logistics: secondary may receive the movement too). List every legal
  // landing for every on-map hero, labeled by which hero steps.
  const heroes = Object.values(state.heroes).filter(
    (hero) => hero.controllerId === playerId && hero.spaceId !== null
  );
  const moveOptions: { label: string; steps: VisitStep[] }[] = [];
  for (const hero of heroes) {
    const destinations = getEndTurnMoveDestinationsForHero(state, hero);
    const heroLabel = hero.kind === "main" ? "Main Hero" : "Secondary Hero";
    for (const spaceId of destinations) {
      moveOptions.push({
        label: heroes.length > 1 ? `${heroLabel}: move to ${spaceId}` : `Move to ${spaceId}`,
        steps: [{ type: "TELEPORT_HERO" as const, heroId: hero.id, spaceId }]
      });
    }
  }
  if (moveOptions.length === 0) {
    return false;
  }

  adventure.rewardQueue.push({
    playerId,
    kind: "visit-steps",
    steps: [
      {
        type: "CHOOSE_ONE",
        prompt,
        options: [...moveOptions, { label: "Stay", steps: [] }]
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

/**
 * Pandora's Bargain: Power — "at the end of your turn, remove this card OR
 * gain Negative Morale." Opens that choice when the player holds the upkeep
 * permanent in play and has not yet resolved it this turn; returns true (which
 * halts END_TURN until the choice is made). Choosing Negative Morale keeps the
 * card and sets `pandoraUpkeepResolvedThisTurn` so the turn can then end.
 */
function queuePandoraUpkeep(state: GameState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  if (!player || player.pandoraUpkeepResolvedThisTurn) {
    return false;
  }
  const hasUpkeep = getPermanentCardIds(state, playerId).some(
    (cardId) => cardLibrary[cardId]?.permanentEffect?.endTurnUpkeep === "remove-or-negative-morale"
  );
  if (!hasUpkeep) {
    return false;
  }
  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt: "Pandora's Bargain: Power — end of turn upkeep",
    options: [{ label: "Remove this card" }, { label: "Gain Negative Morale (keep the card)" }],
    context: "pandora-upkeep",
    returnPhase: "player-turn"
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
  return true;
}

export function endTurnAdventure(state: GameState, action: Extract<GameAction, { type: "END_TURN" }>): void {
  assertActiveTurn(state, action.playerId);
  // Parallel turns: ending a turn may open end-of-turn prompts (Pandora upkeep,
  // Logistics/Nomads) and — on the last player — wraps the round, so it needs
  // the table's interaction slot free like any other interaction-starter.
  assertParallelInteractionFree(state, action.playerId);
  assertNoPendingInput(state);

  // Pandora's Bargain: Power — pay its end-of-turn upkeep before the turn ends.
  if (queuePandoraUpkeep(state, action.playerId)) {
    return;
  }

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
    // Double-negative morale: dump the hand ONLY if still at −2 when the turn
    // ends. Recovering during the turn (−2 → −1 via Mermaid/Temple/etc.) keeps
    // the hand. After the dump, clear back to neutral so the penalty is paid once.
    player.discardHandAtTurnEnd = false; // legacy field; end-turn check is morale value
    if (player.morale <= -2) {
      const discarded = player.hand.length;
      player.discard.push(...player.hand);
      player.hand = [];
      player.morale = 0;
      appendEvent(state, {
        type: "HAND_REFRESHED",
        playerId: action.playerId,
        discarded,
        drawn: 0,
        reason: "morale-double-negative"
      });
      appendEvent(state, {
        type: "MORALE_CHANGED",
        playerId: action.playerId,
        amount: 2,
        total: 0
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
  // Parallel turns: ending a turn only marks this player done; the round wraps
  // once EVERY live player has ended.
  if (parallelTurnsActive(state)) {
    endParallelTurn(state, endingPlayerId, eliminate, gaveUp);
    return;
  }

  const order = state.turnOrder;
  const currentIndex = order.indexOf(endingPlayerId);

  // After a mid-round stop of parallel turns, players who had already ended
  // their parallel turn are skipped for the rest of this round, and the round
  // wraps only once NOBODY live still owes a turn — never on the classic
  // "passed seat 1" wrap, which would rob the seats before the aggressor of
  // their open turn. Ordinary ordered games have an empty `completedPlayerIds`
  // and no stop marker, so they take the classic +1 rotation unchanged.
  const skipCompleted = state.turn.completedPlayerIds.length > 0 || parallelTurnStartAlreadyRan(state);
  let wrapsRound: boolean;
  let nextPlayerId: PlayerId | undefined;
  if (skipCompleted) {
    if (!state.turn.completedPlayerIds.includes(endingPlayerId)) {
      state.turn.completedPlayerIds.push(endingPlayerId);
    }
    nextPlayerId = undefined;
    for (let offset = 1; offset <= order.length; offset += 1) {
      const candidate = order[(currentIndex + offset) % order.length];
      if (
        candidate &&
        candidate !== NEUTRAL_PLAYER_ID &&
        candidate !== endingPlayerId &&
        !state.players[candidate]?.eliminated &&
        !state.turn.completedPlayerIds.includes(candidate)
      ) {
        nextPlayerId = candidate;
        break;
      }
    }
    wrapsRound = nextPlayerId === undefined;
    if (wrapsRound) {
      state.turn.completedPlayerIds = [];
      nextPlayerId = order.find(
        (candidate) =>
          candidate !== NEUTRAL_PLAYER_ID &&
          (candidate === endingPlayerId ? !eliminate : !state.players[candidate]?.eliminated)
      );
    }
  } else {
    const nextIndex = order.length > 0 ? (currentIndex + 1) % order.length : 0;
    wrapsRound = nextIndex === 0;
    nextPlayerId = order[nextIndex];
  }

  appendEvent(state, {
    type: "TURN_ENDED",
    playerId: endingPlayerId,
    nextPlayerId: nextPlayerId ?? endingPlayerId
  });

  // Whether this round already ran everyone's start-of-turn (a parallel round
  // start that stopped mid-round) — read BEFORE the round counter moves.
  const turnStartsAlreadyRan = parallelTurnStartAlreadyRan(state);

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
  // During the round parallel turns stopped in, everyone's start-of-turn
  // already ran at the round start — running it again would grant a second
  // start-of-turn draw and re-queue the turn-start effects. The next player
  // simply RESUMES their open turn. A round wrap moved the counter on, so the
  // guard no longer matches and fresh rounds start turns normally.
  if (wrapsRound || !turnStartsAlreadyRan) {
    startPlayerTurn(state, nextPlayerId);
  }
}

/**
 * Parallel turns: `endingPlayerId` finished their own turn. Marks them done,
 * keeps the nominal `activePlayerId` pointed at an OPEN turn (for banners and
 * ordered-style consumers), and wraps the round once every live player has
 * ended — running the round start and then EVERY player's start-of-turn (the
 * next round is parallel again), or stopping the mode first when the chosen
 * period is over.
 */
function endParallelTurn(
  state: GameState,
  endingPlayerId: PlayerId,
  eliminate: { reason: string } | null,
  gaveUp: boolean
): void {
  // Fresh read each time — eliminations, the round start and each player's
  // turn start can all end the game mid-flow (and a closure sidesteps TS
  // narrowing `state.phase` across the mutating calls between checks).
  const gameEnded = () => state.phase === "game-over" || Boolean(state.adventure?.winnerPlayerId);

  const turn = state.turn;
  if (!turn.completedPlayerIds.includes(endingPlayerId)) {
    turn.completedPlayerIds.push(endingPlayerId);
  }

  appendEvent(state, {
    type: "PARALLEL_TURN_ENDED",
    playerId: endingPlayerId,
    waitingForPlayerIds: remainingParallelPlayerIds(state)
  });

  if (eliminate) {
    eliminatePlayer(state, endingPlayerId, eliminate.reason, gaveUp);
    if (gameEnded()) {
      return;
    }
  }

  const remaining = remainingParallelPlayerIds(state);
  if (remaining.length > 0) {
    // Not everyone is done: point the nominal active/observing seat at an open
    // turn so anything reading "whose turn" sees a player who can still act.
    state.activePlayerId = remaining[0];
    turn.observingPlayerId = remaining[0];
    return;
  }

  // Everyone ended — wrap the round. The period check runs BEFORE the counter
  // moves so `parallelStopped.round` records the finished round (the mid-round
  // "start-of-turn already ran" guard must never match a fresh round).
  turn.completedPlayerIds = [];
  if (state.round + 1 > turn.simultaneousRoundLimit) {
    stopParallelTurns(state, "period-ended");
  }
  state.round += 1;

  const livePlayers = state.turnOrder.filter(
    (playerId) => playerId !== NEUTRAL_PLAYER_ID && !state.players[playerId]?.eliminated
  );
  const first = livePlayers[0] ?? state.turnOrder[0];
  if (first) {
    state.activePlayerId = first;
    turn.observingPlayerId = first;
  }

  startAdventureRound(state);
  if (gameEnded()) {
    return;
  }

  if (parallelTurnsActive(state)) {
    // Still inside the parallel period: EVERY live player's turn starts now, in
    // seat order — so the shared round-start reward queue (income choices,
    // event resolutions, the start-of-turn hand steps) resolves clockwise from
    // the first seat, exactly like the physical table.
    for (const playerId of livePlayers) {
      startPlayerTurn(state, playerId);
      if (gameEnded()) {
        return;
      }
    }
    return;
  }

  if (first) {
    startPlayerTurn(state, first);
  }
}

/**
 * GIVE_UP: the player concedes, is removed from the game, and becomes an
 * observer; the game continues with one fewer player and the last faction
 * standing wins. Allowed whenever the table is QUIET (no combat or pending
 * interaction anywhere — "you cannot surrender when defending your Faction
 * Town"), whether or not it is the conceding player's turn: a player should
 * never be trapped waiting for their turn just to quit a game. On their own
 * (open) turn it ends the turn AND removes the seat through the normal
 * advance/wrap path; off-turn it removes the seat without disturbing whoever is
 * currently active (the same in-place elimination town-conquest already uses).
 */
export function giveUpAdventure(state: GameState, action: Extract<GameAction, { type: "GIVE_UP" }>): void {
  if (state.mode !== "adventure" || !state.adventure) {
    throw new Error("Giving up is only possible during an adventure game.");
  }
  const player = state.players[action.playerId];
  if (!player || player.eliminated) {
    throw new Error("That player is not in the game.");
  }
  // The whole table must be quiet — no open combat, choice, reaction, visit,
  // Necromancy or tile rotation — before anyone may concede.
  assertNoPendingInput(state);

  if (hasOpenAdventureTurn(state, action.playerId)) {
    advanceAfterTurn(state, action.playerId, { reason: "gave up and became an observer" }, true);
    return;
  }
  // Off-turn concede: drop the seat in place, leaving the active player's turn
  // untouched. Marks eliminated, prunes the turn order, and declares the last
  // faction standing the winner when only one remains.
  eliminatePlayer(state, action.playerId, "gave up and became an observer", true);
}

/**
 * RESOLVE_AFK_DROP: one force-drop step for the seat a passed AFK kick vote is
 * removing (`afk.droppingPlayerId`). Issued by the server-side driver
 * (src/engine/afk-drop.ts), never by a client button, and only after the
 * driver has auto-resolved every pending interaction the player owns:
 *
 *  1. If they are a participant of an OPEN combat, this step only concedes it
 *     (PvP: the opponent wins with the give-up consequences; a neutral fight
 *     ends as a retreat) and auto-acknowledges the end, so the normal
 *     finalization automation applies XP/casualties/hero-retreat exactly like
 *     any other fought battle. The driver then calls again.
 *  2. Otherwise they are eliminated like a give-up — through the same
 *     advance/wrap machinery ordered and parallel turns already use — and
 *     flagged `kickedByVote` so the ladder reports them as "abandon".
 */
export function resolveAfkDrop(state: GameState, action: Extract<GameAction, { type: "RESOLVE_AFK_DROP" }>): void {
  const playerId = action.playerId;
  const afk = state.afk;
  if (state.mode !== "adventure" || !state.adventure) {
    throw new Error("AFK removal exists only in adventure games.");
  }
  if (!afk || afk.droppingPlayerId !== playerId) {
    throw new Error("No passed AFK vote is removing this player.");
  }

  const player = state.players[playerId];
  if (state.phase === "game-over" || state.adventure.winnerPlayerId || !player || player.eliminated) {
    // Nothing left to do (the game ended or they are already out): just clear.
    afk.droppingPlayerId = null;
    return;
  }

  const combat = state.combat;
  const inCombat =
    combat &&
    combat.context.kind !== "sandbox" &&
    (combat.attackerPlayerId === playerId || combat.defenderPlayerId === playerId);
  if (inCombat && !combat.outcome) {
    // Concede the open fight — any phase (prep, deployment, mid-round), both
    // fight kinds. The end-of-combat automation finalizes it after this action.
    const winnerPlayerId =
      combat.attackerPlayerId === playerId ? combat.defenderPlayerId : combat.attackerPlayerId;
    const reason = combat.context.kind === "player" ? ("give-up" as const) : ("retreat" as const);
    combat.prep = null;
    combat.awaitingContinue = false;
    combat.outcome = { winnerPlayerId, defeatedPlayerId: playerId, reason };
    combat.endAcknowledged = true;
    appendEvent(state, { type: "COMBAT_ENDED", winnerPlayerId, defeatedPlayerId: playerId, reason });
    return;
  }
  if (inCombat && combat.outcome && !combat.endAcknowledged) {
    // A fight that already ended is only waiting for the notice to be closed.
    combat.endAcknowledged = true;
    return;
  }

  player.kickedByVote = true;
  afk.droppingPlayerId = null;
  const reason = "was removed by the table's AFK vote";
  if (parallelTurnsActive(state)) {
    // Marks their open turn done (a no-op if already ended), eliminates them,
    // and wraps the round once nobody live still owes a turn.
    endParallelTurn(state, playerId, { reason }, false);
    return;
  }
  if (state.activePlayerId === playerId) {
    // Their ordered turn is open: hand it on exactly like a give-up.
    advanceAfterTurn(state, playerId, { reason }, false);
    return;
  }
  eliminatePlayer(state, playerId, reason, false);
}

/**
 * RESOLVE_TURN_TIMEOUT: one force-shift step for the seat whose 10-minute turn
 * budget expired (`afk.turnTimeoutPlayerId`). Issued by the server-side driver
 * (src/engine/afk-drop.ts), never by a client button, and only after the
 * driver has default-resolved every pending interaction the seat owns:
 *
 *  1. If they are fighting an OPEN combat, this step only concedes it (a
 *     neutral fight ends as a retreat; a PvP fight — which normally pauses the
 *     clock, so this is a pure backstop — as a give-up) and auto-acknowledges
 *     the end, so the normal finalization applies exactly like any battle.
 *     The driver then calls again.
 *  2. Otherwise their turn ends through the NORMAL END_TURN machinery
 *     (endTurnAdventure) — the Pandora/Logistics end-of-turn prompts and the
 *     no-base elimination clock all run exactly as if they pressed End Turn
 *     themselves; the driver answers any prompt that opens and calls again.
 *     Unlike the AFK drop the player is NOT eliminated — the turn just shifts
 *     to the others.
 */
export function resolveTurnTimeout(state: GameState, action: Extract<GameAction, { type: "RESOLVE_TURN_TIMEOUT" }>): void {
  const playerId = action.playerId;
  const afk = state.afk;
  if (state.mode !== "adventure" || !state.adventure) {
    throw new Error("Turn timeouts exist only in adventure games.");
  }
  if (!afk || afk.turnTimeoutPlayerId !== playerId) {
    throw new Error("No expired turn is being ended for this player.");
  }

  const player = state.players[playerId];
  if (
    state.phase === "game-over" ||
    state.adventure.winnerPlayerId ||
    !player ||
    player.eliminated ||
    !hasOpenAdventureTurn(state, playerId)
  ) {
    // Nothing left to do (the game ended, they are out, or the turn already
    // closed some other way): just clear the flag.
    afk.turnTimeoutPlayerId = null;
    return;
  }

  const combat = state.combat;
  const inCombat =
    combat &&
    combat.context.kind !== "sandbox" &&
    (combat.attackerPlayerId === playerId || combat.defenderPlayerId === playerId);
  if (inCombat && !combat.outcome) {
    const winnerPlayerId =
      combat.attackerPlayerId === playerId ? combat.defenderPlayerId : combat.attackerPlayerId;
    const reason = combat.context.kind === "player" ? ("give-up" as const) : ("retreat" as const);
    combat.prep = null;
    combat.awaitingContinue = false;
    combat.outcome = { winnerPlayerId, defeatedPlayerId: playerId, reason };
    combat.endAcknowledged = true;
    appendEvent(state, { type: "COMBAT_ENDED", winnerPlayerId, defeatedPlayerId: playerId, reason });
    return;
  }
  if (inCombat && combat.outcome && !combat.endAcknowledged) {
    combat.endAcknowledged = true;
    return;
  }

  // Did the turn actually end? endTurnAdventure may instead have opened an
  // end-of-turn prompt (Pandora upkeep, Logistics/Nomads move) — then the flag
  // stays and the driver answers the prompt and calls again. Detected via the
  // round counter / rotation rather than "is a turn open": force-ending the
  // LAST open parallel turn wraps the round and immediately opens the seat's
  // FRESH turn, which must not be consumed too.
  const roundBefore = state.round;
  endTurnAdventure(state, { type: "END_TURN", playerId });
  const turnEnded =
    state.round !== roundBefore ||
    (parallelTurnsActive(state)
      ? state.turn.completedPlayerIds.includes(playerId)
      : state.activePlayerId !== playerId);
  if (turnEnded) {
    afk.turnTimeoutPlayerId = null;
  }
}

// ---------------------------------------------------------------------------
// Shared-deck searches (split decks, Scouting, school fetches, repeats)
// ---------------------------------------------------------------------------

/**
 * Starts a shared-deck Search RIGHT NOW, bypassing the reward queue: the same
 * family expansion + deck-pick choice the reward pump applies ("spells"/
 * "artifacts" split into their unlocked BINH decks), then the standard
 * openSharedDeckSearch pipeline. Returns false when no candidate deck holds a
 * card (nothing opened). Combat-aware (returnPhase), so instant-artifact
 * combat plays (Spellbinder's Hat, Breastplate of Brimstone, …) can Search
 * mid-battle — the reward queue is parked while a live combat runs, so a
 * queued Search would not surface until the fight ended.
 */
export function beginSharedDeckSearchNow(
  state: GameState,
  playerId: PlayerId,
  deckId: string,
  count: number,
  allowRemove = false,
  options?: { strictExpertGate?: boolean }
): boolean {
  const candidates = resolveSearchDeckCandidates(state, playerId, deckId, {
    strictExpertGate: options?.strictExpertGate
  }).filter((candidateId) => {
    const deck = state.decks[candidateId];
    return deck && deck.drawPile.length + deck.discardPile.length > 0;
  });

  if (candidates.length === 0) {
    return false;
  }

  if (candidates.length > 1) {
    const choiceId = `choice_${nextEventNumber(state)}`;
    state.pendingChoice = {
      id: choiceId,
      type: "OPTION_CHOICE",
      playerId,
      prompt: `Search which deck? (Search ${count})`,
      options: candidates.map((candidateId) => ({
        label: `${deckDisplayName(state, candidateId)} (${(state.decks[candidateId]?.drawPile.length ?? 0) + (state.decks[candidateId]?.discardPile.length ?? 0)} cards)`
      })),
      context: "deck-pick",
      deckPick: { deckIds: candidates, count, ...(allowRemove ? { allowRemove: true } : {}) },
      returnPhase: state.combat ? "combat" : "player-turn"
    };
    state.phase = "choice";
    state.priorityPlayerId = playerId;
    return true;
  }

  openSharedDeckSearch(state, playerId, candidates[0], count, false, allowRemove);
  return true;
}

/**
 * Expands a deck-family id ("spells", "artifacts") into the decks this player
 * may search right now. Explicit split-deck ids pass through unchanged.
 */
export function resolveSearchDeckCandidates(
  state: GameState,
  playerId: PlayerId,
  deckId: string,
  options?: { strictExpertGate?: boolean }
): string[] {
  const hero = getMainHero(state, playerId);

  if (deckId === "spells") {
    return eligibleSpellDecks(state, playerId, hero, { ignoreKeyCards: options?.strictExpertGate });
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
export function openSharedDeckSearch(
  state: GameState,
  playerId: PlayerId,
  deckId: string,
  baseCount: number,
  scoutingResolved = false,
  allowRemove = false
): void {
  const deck = state.decks[deckId];
  if (!deck) {
    return;
  }

  // Spells (Astrologers): while face up, any Search of the Spell deck looks at
  // Search(count) instead of its base size — a strictly larger peek (the searcher
  // still keeps only one). Bumping `baseCount` here propagates through every
  // downstream path: the Scouting re-entry (idempotent max), the up-front
  // discard/fetch option menu, and the reveal itself. Gated on the searched deck
  // being a Spell deck (either BINH split deck).
  const spellWiden = getActiveAstrologersCard(state)?.effect;
  if (spellWiden?.type === "SPELL_SEARCH_WIDEN" && isSpellDeck(deckId)) {
    baseCount = Math.max(baseCount, spellWiden.count);
  }

  // First, every shared-deck Search asks whether to play a held Scouting card —
  // an instant pop-up offering the tiers that would actually grow this Search.
  // The choice (`chooseOption` → "scouting-prompt") plays the chosen tier and
  // re-enters this Search with scoutingResolved = true.
  if (!scoutingResolved) {
    const offer = scoutingPromptFor(state, playerId, baseCount);
    if (offer) {
      openScoutingPrompt(state, playerId, deckId, baseCount, offer, allowRemove);
      return;
    }
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
        hasDiscardTop: Boolean(discardTopId),
        ...(allowRemove ? { allowRemove: true } : {})
      },
      returnPhase: state.combat ? "combat" : "player-turn"
    };
    state.phase = "choice";
    state.priorityPlayerId = playerId;
    return;
  }

  revealSharedDeckSearch(state, playerId, deckId, baseCount, allowRemove);
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
    gainOwnedCard(state, playerId, fetchedCardId);
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
const SCOUTING_CARD_ID = "ability.scouting" as CardId;
/** Search sizes the Scouting card grants ("do Search (N) instead"). */
const SCOUTING_BASIC_COUNT = 3;
const SCOUTING_EXPERT_COUNT = 5;

/** Whether the player already holds a Search-size override (a pre-played Scouting). */
function hasSearchCountOverride(state: GameState, playerId: PlayerId): boolean {
  return state.activeEffects.some(
    (effect) =>
      effect.controllerId === playerId &&
      effect.modifiers.some((modifier) => modifier.type === "SEARCH_COUNT_OVERRIDE")
  );
}

/**
 * The Scouting pop-up to show before a Search, or null when none applies. The
 * card reads "Play this card before taking a Search action, then do Search (N)
 * instead." Rather than make the player remember to pre-play it, every Search of
 * a shared deck (Ability / Spell / Artifact) first asks whether to use a held
 * Scouting — but only the tiers that would actually beat the deck's base count
 * are offered (and Expert only when a crown is affordable), so the prompt never
 * appears when it could not help. A Scouting already pre-played this turn (its
 * own SEARCH_COUNT_OVERRIDE effect) suppresses the prompt entirely.
 */
function scoutingPromptFor(
  state: GameState,
  playerId: PlayerId,
  baseCount: number
): { offerBasic: boolean; offerExpert: boolean } | null {
  const player = state.players[playerId];
  if (!player || !player.hand.includes(SCOUTING_CARD_ID) || hasSearchCountOverride(state, playerId)) {
    return null;
  }
  const offerBasic = SCOUTING_BASIC_COUNT > baseCount;
  const offerExpert = SCOUTING_EXPERT_COUNT > baseCount && canPlayExpertMode(player, SCOUTING_CARD_ID);
  if (!offerBasic && !offerExpert) {
    return null;
  }
  return { offerBasic, offerExpert };
}

/**
 * Opens the "use Scouting?" pop-up before a Search resumes. Option 0 always
 * declines; the basic / expert plays follow in that order (only the offered
 * ones). `chooseOption` ("scouting-prompt") plays the picked tier and re-enters
 * the Search.
 */
function openScoutingPrompt(
  state: GameState,
  playerId: PlayerId,
  deckId: string,
  baseCount: number,
  offer: { offerBasic: boolean; offerExpert: boolean },
  allowRemove = false
): void {
  const options: { label: string }[] = [{ label: `Search (${baseCount}) — don't use Scouting` }];
  if (offer.offerBasic) {
    options.push({ label: `Play Scouting — Search (${SCOUTING_BASIC_COUNT})` });
  }
  if (offer.offerExpert) {
    options.push({ label: `Play Expert Scouting — Search (${SCOUTING_EXPERT_COUNT}) (spend a crown)` });
  }
  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt: `Use Scouting before this ${deckDisplayName(state, deckId)} Search?`,
    options,
    context: "scouting-prompt",
    scoutingPrompt: {
      deckId,
      baseCount,
      offerBasic: offer.offerBasic,
      offerExpert: offer.offerExpert,
      ...(allowRemove ? { allowRemove: true } : {})
    },
    returnPhase: state.combat ? "combat" : "player-turn"
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
}

/**
 * Plays a held Scouting card at the chosen tier: discards the card, spends a
 * crown for Expert (unless the ability is Empowered), and leaves the one-shot
 * SEARCH_COUNT_OVERRIDE that applySearchCountEffects consumes on the next reveal.
 */
export function playScoutingCard(state: GameState, playerId: PlayerId, mode: "basic" | "expert"): void {
  const player = state.players[playerId];
  if (!player) {
    return;
  }
  const index = player.hand.indexOf(SCOUTING_CARD_ID);
  if (index === -1) {
    return;
  }
  player.hand.splice(index, 1);
  player.discard.push(SCOUTING_CARD_ID);

  if (mode === "expert" && !abilityExpertIsCrownFree(player, SCOUTING_CARD_ID)) {
    player.combatStats.expertUsesSpentThisRound += 1;
  }

  state.activeEffects.push(
    makeActiveEffect(
      state,
      {
        name: mode === "expert" ? "Expert Scouting" : "Scouting",
        scope: "player",
        duration: { type: "current-turn" },
        polarity: "positive",
        removable: false,
        modifiers: [
          { type: "SEARCH_COUNT_OVERRIDE", count: mode === "expert" ? SCOUTING_EXPERT_COUNT : SCOUTING_BASIC_COUNT }
        ]
      },
      { type: "card", cardId: SCOUTING_CARD_ID, controllerId: playerId },
      playerId
    )
  );
  appendEvent(state, {
    type: "CARD_PLAYED",
    playerId,
    cardId: SCOUTING_CARD_ID,
    timing: "instant",
    mode
  });
}

export function revealSharedDeckSearch(
  state: GameState,
  playerId: PlayerId,
  deckId: string,
  baseCount: number,
  allowRemove = false
): void {
  const deck = state.decks[deckId];
  if (!deck) {
    return;
  }

  let count = applySearchCountEffects(state, playerId, baseCount);
  // Negative Morale "instead of your next Search (X), do Search (1)": resolves
  // on the first shared-deck Search that would reveal 2+ cards (whatever
  // widened it) and never on a Search (1) — the card's own exemption.
  if (count >= 2 && consumeHeldMoraleCard(state, playerId, MORALE_CARD_IDS.searchOne)) {
    count = 1;
  }
  const revealedCardIds: string[] = [];
  // Redraw past any card this hero may not take — a duplicate of one it already
  // owns, a Necromancy it cannot use, or a starting-only spell — and also past a
  // second copy of a card already revealed in this same search, so a single
  // reveal never shows two of the same card. Skipped cards are set aside and
  // tucked back under the deck afterwards (not discarded), so the deck keeps both
  // copies for the other players and the revealed batch alone is what was drawn.
  const skippedCardIds: string[] = [];
  while (revealedCardIds.length < count) {
    if (deck.drawPile.length === 0) {
      // The draw pile ran out mid-Search: reshuffle the discard pile back into it
      // (the standard board-game "deck runs out → reshuffle the discard" rule,
      // exactly as drawCardsForPlayer does for a hand). Without this, a Search on
      // a deck whose cards had all been pushed to its discard — the normal state
      // after enough Searches, since the rest of every Search goes to discard —
      // revealed 0 cards, and the DECK_SEARCH choice then had no card to keep and
      // no way to exit (a softlock). Cards already set aside as un-takeable
      // (skippedCardIds) are NOT reshuffled here, so this loop always terminates.
      if (deck.discardPile.length === 0) {
        break; // genuinely nothing left anywhere in this deck
      }
      deck.drawPile = shuffleCards(
        deck.discardPile,
        `${state.seed}#search-reshuffle#${deckId}#${eventSeedNumber(state)}`
      );
      deck.discardPile = [];
    }
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

  // With the reshuffle above a Search reveals 0 cards only when the deck holds no
  // card this hero can take at all (it already owns every remaining card). Don't
  // open a keep-one choice with nothing to keep — that would softlock; record the
  // empty Search and return to the prior phase instead.
  if (revealedCardIds.length === 0) {
    // Nothing to keep: a level-up Ability Search that reveals no card records no
    // pick — drop the marker so it cannot latch onto a later Search.
    const emptySearchPlayer = state.players[playerId];
    if (emptySearchPlayer) {
      clearPendingLevelUpAbilitySearch(emptySearchPlayer);
    }
    appendEvent(state, {
      type: "DECK_SEARCH_STARTED",
      playerId,
      deckId,
      choiceId: `choice_${nextEventNumber(state)}`,
      revealedCount: 0
    });
    state.pendingChoice = null;
    state.phase = state.combat ? "combat" : "player-turn";
    state.priorityPlayerId = null;
    return;
  }

  // Basic X Magic's "draw instead of Searching" is offered up front (see
  // openSharedDeckSearch), so reaching this reveal means the player chose to
  // Search — only the keep-one picks apply here.
  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "DECK_SEARCH",
    playerId,
    deckId,
    revealedCardIds,
    ...(allowRemove ? { allowRemove: true } : {}),
    // The X this Search was invoked with — what a morale "Search (X) again" re-runs.
    baseCount,
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

/** The Pendant of Courage's card id (its repeat-Search side is post-Search). */
const PENDANT_OF_COURAGE_ID = "artifact.pendant_of_courage";

/**
 * Pendant of Courage: "Play immediately after you perform a Search action and
 * perform that action again." Offered as a post-Search CHOICE (not a pre-armed
 * modifier): right after a Search(X) resolves, its holder may discard the
 * Pendant to run the same Search(X) once more (the card gained from the first
 * Search is kept). Opens the `pendant-repeat-search` choice; returns true when
 * it did (the caller must then stop — the choice owns the flow). Returns false
 * when the player is not holding the Pendant, so the caller continues normally.
 */
export function maybeOpenPendantRepeatOffer(
  state: GameState,
  playerId: PlayerId,
  deckId: DeckId,
  baseCount: number,
  returnPhase: GamePhase
): boolean {
  const player = state.players[playerId];
  if (!player || !player.hand.includes(PENDANT_OF_COURAGE_ID)) {
    return false;
  }
  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt: `Play Pendant of Courage to perform the Search (${baseCount}) again?`,
    options: [
      { label: `Play Pendant of Courage — Search (${baseCount}) again` },
      { label: "Keep the Pendant" }
    ],
    context: "pendant-repeat-search",
    pendantRepeatSearch: { deckId, count: baseCount },
    returnPhase
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
  return true;
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
export function openDiscardPickChoice(
  state: GameState,
  playerId: PlayerId,
  pick: {
    count: number;
    filter?: "spell" | "non-artifact" | "specialty" | "power-or-knowledge-statistic" | "spell-or-specialty" | "magic-arrow";
    fromTop?: number;
    shuffleRestIntoDeck?: boolean;
  }
): boolean {
  const player = state.players[playerId];
  if (!player) {
    return false;
  }

  const matchesFilter = (cardId: CardId): boolean => {
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
    if (pick.filter === "magic-arrow") {
      return cardId === "spell.magic_arrow";
    }
    if (pick.filter === "power-or-knowledge-statistic") {
      const statisticType = cardLibrary[cardId]?.statisticType;
      return kind === "statistic" && (statisticType === "power" || statisticType === "knowledge");
    }
    return true;
  };

  const polishRecovery =
    polishSpellBookEnabled(state) &&
    (pick.filter === "spell" || pick.filter === "spell-or-specialty" || pick.filter === "magic-arrow");

  // Polish Spell Book (reference sheet): the four discard-recovery Spell artifacts
  // — Helm of the Alabaster Unicorn, Rib Cage, Crown of the Five Seas, Thunder
  // Helmet (all a count-1, filter "spell" TAKE_FROM_DISCARD), plus Crown of
  // Dragontooth's recover arm — read "√: return Cast a Spell (Discard→Hand).
  // Refresh spell (1)". So they ALSO return one Cast a Spell enabler from the
  // discard pile to hand, on top of refreshing a used Book Spell. Done up front
  // so it still fires when there is no used Book Spell left to refresh (an empty
  // refresh would otherwise no-op the whole card), and BEFORE the fromTop slice
  // is read so the returned enabler never occupies one of the peeked slots.
  const polishReturnEnabler = polishRecovery && pick.filter === "spell";
  if (polishReturnEnabler) {
    const enablerIndex = player.discard.indexOf(CAST_A_SPELL_CARD_ID);
    if (enablerIndex !== -1) {
      player.discard.splice(enablerIndex, 1);
      player.hand.push(CAST_A_SPELL_CARD_ID);
      appendEvent(state, {
        type: "SPELL_RETURNED_TO_HAND",
        playerId,
        cardId: CAST_A_SPELL_CARD_ID,
        reason: "Polish Spell Book recovery"
      });
    }
  }

  const pool = pick.fromTop ? player.discard.slice(-pick.fromTop) : [...player.discard];
  const candidates: { cardId: CardId; source: "discard" | "polish-used" }[] = [
    ...pool
      .filter((cardId) => matchesFilter(cardId) && !(polishRecovery && cardLibrary[cardId]?.kind === "spell"))
      .map((cardId) => ({ cardId, source: "discard" as const })),
    ...(polishRecovery
      ? (player.spellBookUsed ?? [])
          .filter(matchesFilter)
          .map((cardId) => ({ cardId, source: "polish-used" as const }))
      : [])
  ];

  if (candidates.length === 0) {
    // Rib Cage in Polish mode: even with no used Book Spell left to refresh, still
    // honour its printed "shuffle the rest into your deck" clause after the Cast a
    // Spell enabler has been returned to hand above.
    if (polishReturnEnabler && pick.shuffleRestIntoDeck && player.discard.length > 0) {
      player.deck = shuffleCards(
        [...player.deck, ...player.discard],
        `${state.seed}#discard-into-deck#${playerId}#${eventSeedNumber(state)}`
      );
      player.discard = [];
    }
    return false;
  }

  // Spell Book (house rule): when the rule is on, a Spell candidate may be taken
  // straight into the Spell Book instead of the hand — "put them to spell book
  // again when you pick it up". Each Spell then appears as TWO index-aligned
  // options (to hand, to Book); non-Spells appear once (to hand). `cardIds` and
  // `destinations` stay parallel with `options`, so the pick reads the right card
  // and routes it to the right zone.
  const bookOn = spellBookRuleEnabled(state);
  const entries: {
    cardId: CardId;
    destination: "hand" | "spellBook";
    source: "discard" | "polish-used";
  }[] = [];
  for (const candidate of candidates) {
    const { cardId, source } = candidate;
    if (source === "polish-used") {
      entries.push({ cardId, destination: "spellBook", source });
      continue;
    }
    entries.push({ cardId, destination: "hand", source });
    // Magic Arrow (any starting-only Spell) goes only to hand — it has no Spell
    // Book home, so no "→ Spell Book" route is offered for it.
    if (bookOn && cardLibrary[cardId]?.kind === "spell" && spellCanEnterSpellBook(cardId)) {
      entries.push({ cardId, destination: "spellBook", source });
    }
  }

  // Honest prompt: a Polish "polish-used" entry REFRESHES a used Book Spell, it
  // does not take a card off the discard pile. When EVERY option is such a
  // refresh, say so (the discard-pile wording confused players — nothing is being
  // taken from the discard); when the pick mixes discard cards and Book refreshes,
  // name both.
  const usedCount = entries.filter((entry) => entry.source === "polish-used").length;
  const remainingSuffix = pick.count > 1 ? ` (${pick.count} left)` : "";
  const prompt =
    usedCount === entries.length
      ? `Refresh a Spell in your Spell Book${remainingSuffix}`
      : usedCount > 0
      ? `Take a card from your discard pile, or refresh a Spell in your Spell Book${remainingSuffix}`
      : `Take a card from your discard pile${remainingSuffix}`;

  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt,
    options: entries.map((entry) =>
      entry.source === "polish-used"
        ? { label: `Refresh ${cardLibrary[entry.cardId]?.name ?? entry.cardId} in the Spell Book` }
        : entry.destination === "spellBook"
        ? { label: `Take ${cardLibrary[entry.cardId]?.name ?? entry.cardId} → Spell Book` }
        : { label: `Take ${cardLibrary[entry.cardId]?.name ?? entry.cardId}` }
    ),
    context: "discard-pick",
    discardPick: {
      cardIds: entries.map((entry) => entry.cardId),
      destinations: entries.map((entry) => entry.destination),
      sources: entries.map((entry) => entry.source),
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

  // A pending tile rotation (a discovery, a Far placement, or the opening
  // home-tile rotation) is a hard now-or-never gate: nothing else — not even a
  // queued start-of-turn reward — resolves until the player locks the rotation.
  if (adventure.pendingTileChoice) {
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

    // A reward whose owner has been eliminated since it was queued would open
    // a choice nobody can answer — drop it. (The barrier sentinel below is
    // table-wide and pumps regardless of its nominal playerId.) Shared Event
    // bookkeeping (pool cleanup, auction open/resolve) is the exception: it
    // acts on TABLE state, so it is handed to the next live seat instead of
    // dropping the displayed cards — mirrors eliminatePlayer, and covers
    // snapshots saved before that cleanup existed.
    if (reward.kind !== "round-start-events-resolved" && state.players[reward.playerId]?.eliminated) {
      const nextLiveId = humanPlayerIds(state).find((id) => !state.players[id]?.eliminated);
      if (nextLiveId && isSharedEventBookkeepingReward(reward)) {
        reward.playerId = nextLiveId;
        continue;
      }
      adventure.rewardQueue.shift();
      continue;
    }

    if (reward.kind === "round-start-events-resolved") {
      // Round-start Event / Astrologers barrier sentinel: it is the last
      // event-related reward (every follow-up unshifted ahead of it), so reaching
      // it means every player has finished resolving the Event. Lift the freeze
      // and let the normal round-start flow (City Halls, turn-start effects,
      // first-turn hand, turns) proceed.
      adventure.rewardQueue.shift();
      adventure.eventResolution = null;
      continue;
    }

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
      if (reward.allowCastCardInstead && polishSpellBookEnabled(state)) {
        state.pendingChoice = {
          id: `choice_${nextEventNumber(state)}`,
          type: "OPTION_CHOICE",
          playerId: reward.playerId,
          prompt: `Mage Guild: Search (${reward.count}) for a Spell or gain Cast a Spell?`,
          options: [
            { label: `Search (${reward.count}) the Spell deck` },
            { label: "Gain Cast a Spell" }
          ],
          context: "polish-spell-or-cast",
          polishSpellOrCast: {
            count: reward.count,
            ...(reward.strictExpertGate ? { strictExpertGate: true } : {})
          },
          returnPhase: state.phase === "choice" ? "player-turn" : state.phase
        };
        state.phase = "choice";
        state.priorityPlayerId = reward.playerId;
        return;
      }
      // Level-up Ability Search (2/3/5/7): mark the seat BEFORE the Search opens
      // so the kept Ability card is attributed to this level on the hero board.
      // Must be set first — a Search that reveals nothing clears it synchronously
      // inside revealSharedDeckSearch, before beginSharedDeckSearchNow returns.
      const searchPlayer = state.players[reward.playerId];
      if (searchPlayer && reward.abilitySearchLevel !== undefined) {
        searchPlayer.pendingLevelUpAbilitySearch = reward.abilitySearchLevel;
      }
      // "Spells"/"artifacts" are deck families; beginSharedDeckSearchNow does
      // the family expansion + deck-pick choice and opens the Search. The
      // strictExpertGate flag (Mage Guild expert-spell gating) is threaded
      // through to resolveSearchDeckCandidates.
      if (
        beginSharedDeckSearchNow(state, reward.playerId, reward.deckId, reward.count, Boolean(reward.allowRemove), {
          strictExpertGate: reward.strictExpertGate
        })
      ) {
        return;
      }
      // The Search never opened (the deck holds nothing to search): drop the
      // marker so it cannot attach to a later, unrelated Ability Search.
      if (searchPlayer) {
        clearPendingLevelUpAbilitySearch(searchPlayer);
      }
      continue;
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
      const choiceEffect = building?.effect;
      if (choiceEffect?.type !== "RESOURCE_ROUND_CHOICE") {
        adventure.rewardQueue.shift();
        continue;
      }

      // Some City Hall options are only meaningful in context, so we hide them
      // when they could do nothing:
      //  - Cove "remove an Artifact for 1 experience": only when the player
      //    actually holds an Artifact card to pay it.
      //  - Necropolis "reinforce 1 bronze unit for free": only when the player
      //    owns a Few bronze unit that can still be reinforced.
      const player = state.players[reward.playerId];
      const holdsArtifact = (player?.hand ?? []).some((cardId) => cardLibrary[cardId]?.kind === "artifact");
      const canReinforceBronze = hasFreeBronzeReinforceTarget(state, reward.playerId);
      const options = choiceEffect.options.filter(
        (option) =>
          (!option.removeArtifactFromHand || holdsArtifact) &&
          (!option.reinforceBronzeFree || canReinforceBronze)
      );

      // Every option filtered out: opening the choice anyway would strand the
      // whole table on a prompt with ZERO legal answers (nobody — not even the
      // AFK-drop driver — can resolve an empty OPTION_CHOICE, and under the
      // round-start Event barrier that freezes every seat). Skip the reward.
      if (options.length === 0) {
        adventure.rewardQueue.shift();
        continue;
      }

      adventure.rewardQueue.shift();
      state.pendingChoice = {
        id: `choice_${nextEventNumber(state)}`,
        type: "OPTION_CHOICE",
        playerId: reward.playerId,
        prompt: `${building.name}: choose this round's bonus`,
        options: options.map((option) => ({ label: option.label })),
        context: "city-hall",
        // Carry the full option payloads in state so resolution does not depend
        // on any off-state cache that a reload/reconnect would wipe.
        cityHall: { options },
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
      // let those resolve first; only take it when nothing but dividers remain.
      // The queue is a finite, non-regenerating set of start-of-turn rewards,
      // so this settles. A parallel round start queues ONE divider PER PLAYER —
      // requeueing must therefore ignore the other dividers, or they would
      // chase each other around the queue forever.
      adventure.rewardQueue.shift();
      if (adventure.rewardQueue.some((queued) => queued.kind !== "start-turn-hand")) {
        adventure.rewardQueue.push(reward);
        continue;
      }
      finalizeStartOfTurnHand(state, reward.playerId);
      continue;
    }
  }
}


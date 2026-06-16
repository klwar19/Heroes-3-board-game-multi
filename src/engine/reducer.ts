import { cardLibrary } from "@/data/cards/library";
import { sampleBuildings } from "@/data/towns/buildings";
import { coreUnitDefinitions } from "@/data/factions/units";
import {
  addArmyUnit,
  changeMorale,
  gainResources,
  getActiveAstrologersCard,
  getMainHero,
  getUnitSide,
  isSeaField,
  makeCombatUnitFromArmy,
  NEUTRAL_DECK_IDS,
  queueNecromancyReinforce
} from "./adventure";
import {
  applyUnitCurrentSide,
  canPlaceTransformOn,
  insertUnitTransform,
  makeUnitTransformState
} from "./unit-transforms";
import {
  blacksmithAction,
  buildStructureAdventure,
  chooseOption,
  continueNeutralCombat,
  discoverTile,
  finalizeAdventureCombat,
  finishCombatPlacement,
  finishTactics,
  giveUpAdventure,
  hallOfValhallaBoost,
  openDiplomacyRecruit,
  openVisionsScry,
  openSiegeDemolishChoice,
  openSkeletonReinforceChoice,
  moveHeroAdventure,
  moveHeroPathAdventure,
  openDimensionDoorChoice,
  openViewEarthChoice,
  openMarket,
  openSharedDeckSearch,
  openFortuneBoostStep,
  hireSecondaryHero,
  placeCombatUnit,
  swapCombatUnits,
  placeTile,
  populationAction,
  pumpAdventureQueues,
  refreshHand,
  rehydrateCityHallChoice,
  resolveVisitStep,
  retreatFromCombat,
  surrenderFromCombat,
  revisitField,
  roguesScoutDeck,
  setTileRotation,
  spellBookAction,
  spendMorale,
  spendTownCube,
  activateTownBuilding,
  tradeResources,
  sellScrollSpell,
  unplaceCombatUnit,
  endTurnAdventure
} from "./adventure-reducer";
import { chooseFaction, setGameOptions, startAdventureFromLobby } from "./adventure-setup";
import {
  ATTACK_DIE_FACES,
  BATTLEFIELD_CELL_COUNT,
  BATTLEFIELD_COLUMNS,
  BATTLEFIELD_ROWS,
  getBattlefieldCoordinates,
  getBattlefieldDistance,
  getBattlefieldLabel,
  getOrthogonalNeighbors,
  isBattlefieldPosition,
  planMovePath
} from "./battlefield";
import { appendExpiredEffectEvents, finishCombatIfNeeded, markUnitRemovedIfNeeded } from "./combat-units";
import { isNeutralUnit, pickNeutralTarget, planNeutralActivation, sortNeutralTargetCandidates } from "./neutral-ai";
import {
  activateBallistas,
  applyPermanentCombatEffectsForPlayer,
  applyPermanentExpert,
  buyWarMachine,
  countBallistas,
  discardPermanentVoluntarily,
  firstAidVolleyHeals,
  getPermanentSchoolBonus,
  isLowestInitiativeEnemy,
  playerCanUseFirstAidVolley,
  putPermanentIntoPlay,
  resolveWarMachineTarget,
  spendFirstAidExpert,
  startWarMachineRound
} from "./permanents";
import { createSeededRandom } from "./random";
import { activeSchoolFetches, estatesGold, getRuleset, spellLimitFor } from "./ruleset";
import {
  destroyFortification,
  getDemolishAbility,
  intactFortificationPositions,
  removeArrowTower,
  siegeRangedDamageReduction
} from "./siege";
import {
  expireTokensAtRoundEnd,
  hasToken,
  noteUnitDamagedForTokens,
  placeCombatToken,
  removeToken,
  tokenAttackBonus,
  tokenDefenseDelta
} from "./tokens";
import {
  cardDamageNullified,
  effectAppliesToUnit,
  effectiveInitiative,
  unitImmuneToSpellSchoolsByEffect,
  expireEffectsForActivationEnd,
  expireEffectsForCombatRoundEnd,
  expireEffectsForTurnEnd,
  getActiveAttackBonus,
  getActiveDefenseBonus,
  getAttackerTypeDefenseBonus,
  getAttackRerollEffects,
  getConditionalDefenseBonus,
  getSchoolPowerMultiplier,
  makeActiveEffect,
  playerHasSpellTimingFreedom,
  releaseEndedOngoingCards,
  spellNullifiedByRestriction,
  syncAbilitySuppression,
  unitDealsElementalDamage,
  unitImmuneToParalysis
} from "./active-effects";
import { appendEvent, eventSeedNumber, nextEventNumber } from "./events";
import { drawCardsForPlayer, isSharedDeckId, shuffleCards } from "./decks";
import {
  cancelSpellAllowsSchoolAndLevel,
  cardCanBoostPower,
  getEffectAmount,
  getEffectDamageAmount,
  getEffectiveCardEffect,
  getSpellDamageAmount,
  spellPowerValueOfCard
} from "./effects";
import {
  canUnitAttack,
  canUnitMoveAndAttack,
  canUnitMoveTo,
  canPlayerBuildStructure,
  getAttackKind,
  getAttackRollMode,
  getBlockedSpaces,
  getLegalActions,
  getLegalMoveDestinations,
  getUnitMoveRange,
  combatEnemyImposesPowerTax,
  getLegalReactionsForTrigger,
  getNextUnitToActivate,
  getOffTurnCombatReactions,
  isAdjacent,
  isHandLockedInCombat,
  isUnitAlive,
  payablePowerCardIds,
  playerHasAttackInstantOfSchool,
  reflectableAttackInstantForPlayer,
  rerollSourceAvailableFor,
  spellAbilitiesSuppressed,
  spellRedirectTargets,
  standingSpellPower
} from "./legal-actions";
import {
  getActivationAbilities,
  getActivationDamageSpellAbility,
  getActivationSpellPowerBoost,
  getAfterRetaliationAttackAbility,
  getAttackBonusOnAttackDie,
  getAttackBonusVsDefenderName,
  getAttackDefenseReductionAbility,
  getAttackDieDamageFollowUps,
  getAttackDieResultBonus,
  getDeathStareFollowUps,
  getDefenseBonusOnAttackDie,
  getDefenseBonusWhenRetaliated,
  getDoubleAttackAbility,
  getCardNegateOnDie,
  getDeckDiscardTakeSpell,
  getEnchanterActivationAbility,
  getEnemyDiscardAbility,
  getEnemySpellPowerReduction,
  getFlatDamageFollowUps,
  getForcedAttackerDie,
  getIgnoreTargetCardDefenseAbility,
  getKnockbackAbility,
  getLethalSaveUnitAbility,
  getLineAttackAbility,
  getOnAttackDieDraw,
  getOnAttackDieTokens,
  getOnAttackPoisonCubes,
  getOnAttackSelfHeal,
  getParalysisFollowUps,
  getPostAttackAbilityDamageEffects,
  getRetaliationAgainstAttackPenalty,
  getRetaliationParalysis,
  getRollTwoDiceApplyBoth,
  getReturnAfterAttackAbility,
  getSecondAttackAbility,
  getSecondAttackCandidates,
  getSelfAdjacentSecondAttackAbility,
  getSpecialtyDamageReduction,
  getSpellDamageReduction,
  getSpellDamageReductionAura,
  getTriggeredAttackDieBonusAbilities,
  getUnitAbilityDefinitions,
  getUnitAttackRerollSources,
  hasBindAdjacentEnemies,
  hasDefenseTokenAura,
  hasIgnoreOwnAttackDie,
  hasImmuneToSpecialtyDamage,
  hasRetaliationAgainstDisadvantage,
  hasSpellCastHandTax,
  hasSpellCastPowerTax,
  hasUnitAbilityEffect,
  unitImmuneToSpellSchools
} from "./unit-abilities";
import type {
  ActiveEffectDefinition,
  ActiveEffectModifier,
  ActiveEffectState,
  AttackRerollSource,
  AttackRollCandidate,
  AttackRollMode,
  BuildingLibrary,
  BattlefieldTokenKind,
  BattlefieldTokenState,
  CardDefinition,
  EffectDurationDefinition,
  CardId,
  CardLibrary,
  CardOptionDefinition,
  CardPlayCost,
  CardPlayMode,
  CombatState,
  CombatUnitState,
  EffectDefinition,
  EngineResult,
  GameAction,
  GameEvent,
  GameState,
  LegalAction,
  PlayerId,
  PlayerState,
  PendingChoice,
  ResourceCost,
  ResourceKind,
  ResolutionStackItem,
  RulesError,
  TargetRef,
  UnitGrade,
  UnitId
} from "./state";
import { NEUTRAL_PLAYER_ID } from "./state";

type ReducerOptions = {
  cards?: CardLibrary;
  buildings?: BuildingLibrary;
};

type ConcreteEffect = Exclude<EffectDefinition, { type: "CHOOSE_ONE" }>;
type CreateActiveEffectCardEffect = Extract<ConcreteEffect, { type: "CREATE_ACTIVE_EFFECT" }>;

function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

function ok(state: GameState, startEventNumber: number): EngineResult {
  // The log is a capped rolling window, so "new since the action started" is
  // decided by the monotonic event number, not by array position.
  return {
    state,
    events: state.eventLog.filter((event) => Number(event.id.slice(4)) > startEventNumber),
    errors: []
  };
}

function fail(state: GameState, error: RulesError): EngineResult {
  return {
    state,
    events: [],
    errors: [error]
  };
}

function normalizeActionForMatch(action: GameAction): GameAction {
  if (action.type === "PLAY_REACTION") {
    // costCardIds are the player's chosen payment — validated by the play
    // handler, not by the legality match.
    return {
      type: "PLAY_REACTION",
      playerId: action.playerId,
      cardId: action.cardId,
      mode: action.mode ?? "basic",
      ...(action.optionIndex !== undefined ? { optionIndex: action.optionIndex } : {}),
      ...(action.target ? { target: action.target } : {}),
      ...(action.asPowerBoost ? { asPowerBoost: true } : {}),
      ...(action.fromScroll ? { fromScroll: action.fromScroll } : {})
    };
  }

  if (action.type === "PLAY_CARD") {
    return {
      type: "PLAY_CARD",
      playerId: action.playerId,
      cardId: action.cardId,
      mode: action.mode ?? "basic",
      ...(action.optionIndex !== undefined ? { optionIndex: action.optionIndex } : {}),
      ...(action.target ? { target: action.target } : {})
    };
  }

  return action;
}

function actionsMatch(left: GameAction, right: GameAction): boolean {
  return JSON.stringify(normalizeActionForMatch(left)) === JSON.stringify(normalizeActionForMatch(right));
}

function assertLegal(
  state: GameState,
  action: GameAction,
  cards: CardLibrary,
  buildings: BuildingLibrary
): RulesError | null {
  if (action.type === "PLAY_REACTIONS") {
    return assertBatchReactionLegal(state, action, cards, buildings);
  }

  const legalActions = getLegalActions(state, action.playerId, cards, buildings);
  const isLegal = legalActions.some((legal) => actionsMatch(legal.action, action));

  if (isLegal) {
    return null;
  }

  if (state.reactionWindow && state.reactionWindow.priorityPlayerId !== action.playerId) {
    return {
      code: "NOT_PRIORITY_PLAYER",
      message: "Only the priority player can act during the current reaction window."
    };
  }

  return {
    code: "ACTION_NOT_LEGAL",
    message: "That action is not legal in the current game state."
  };
}

/**
 * Batched instants resolve as one declaration, so legality is checked against
 * the single-card reactions currently on offer: every play must be available,
 * card copies and crowns must cover the batch, and window-ending effects
 * (spell cancel/recall) must be played alone.
 */
function assertBatchReactionLegal(
  state: GameState,
  action: Extract<GameAction, { type: "PLAY_REACTIONS" }>,
  cards: CardLibrary,
  buildings: BuildingLibrary
): RulesError | null {
  if (!state.reactionWindow) {
    return { code: "NO_REACTION_WINDOW", message: "No reaction window is open." };
  }

  if (state.reactionWindow.priorityPlayerId !== action.playerId) {
    return {
      code: "NOT_PRIORITY_PLAYER",
      message: "Only the priority player can act during the current reaction window."
    };
  }

  if (action.plays.length === 0) {
    return { code: "ACTION_NOT_LEGAL", message: "A reaction batch needs at least one card." };
  }

  const legalActions = getLegalActions(state, action.playerId, cards, buildings);
  const player = state.players[action.playerId];
  const handCounts = new Map<string, number>();
  for (const cardId of player?.hand ?? []) {
    handCounts.set(cardId, (handCounts.get(cardId) ?? 0) + 1);
  }

  let expertUsesNeeded = 0;
  let spellPlays = 0;
  let powerOnlyPlays = 0;

  for (const play of action.plays) {
    const singleAction: GameAction = {
      type: "PLAY_REACTION",
      playerId: action.playerId,
      cardId: play.cardId,
      mode: play.mode ?? "basic",
      ...(play.optionIndex !== undefined ? { optionIndex: play.optionIndex } : {}),
      ...(play.asPowerBoost ? { asPowerBoost: true } : {})
    };

    if (!legalActions.some((legal) => actionsMatch(legal.action, singleAction))) {
      return {
        code: "ACTION_NOT_LEGAL",
        message: `${cards[play.cardId]?.name ?? play.cardId} is not a legal reaction right now.`
      };
    }

    const card = cards[play.cardId];

    const copiesLeft = handCounts.get(play.cardId) ?? 0;
    if (copiesLeft <= 0) {
      return {
        code: "CARD_NOT_IN_HAND",
        message: `Not enough copies of ${card?.name ?? play.cardId} in hand for that batch.`
      };
    }
    handCounts.set(play.cardId, copiesLeft - 1);

    if (play.asPowerBoost) {
      powerOnlyPlays += 1;
      continue;
    }

    const effect = card ? getEffectiveCardEffect(card, play.optionIndex) : null;
    if (!effect || effect.type === "CANCEL_SPELL" || effect.type === "RECALL_SPELL" || effect.type === "REDIRECT_SPELL") {
      return {
        code: "ACTION_NOT_LEGAL",
        message: "Spell-ending, recall and redirect cards must be played on their own."
      };
    }

    if (card?.kind === "spell") {
      spellPlays += 1;
    }
    if (effect.type === "ADD_SPELL_POWER") {
      powerOnlyPlays += 1;
    }

    if ((play.mode ?? "basic") === "expert") {
      expertUsesNeeded += 1;
    }
  }

  // Power "dissipates" when no spell consumes it: inside an attack window,
  // Power plays must accompany a spell instant in the same declaration.
  if (
    state.reactionWindow.triggerEvent.type === "UNIT_ATTACK_DECLARED" &&
    powerOnlyPlays > 0 &&
    spellPlays === 0
  ) {
    return {
      code: "ACTION_NOT_LEGAL",
      message: "Power can only be played into an attack together with a Spell card."
    };
  }

  // One Spell card per combat round (Knowledge/Necklace raise the limit).
  if (player && spellPlays > 0) {
    const remaining = spellLimitFor(state, player) - player.combatStats.spellsCastThisRound;
    if (spellPlays > remaining) {
      return {
        code: "ACTION_NOT_LEGAL",
        message: "Spell limit reached for this combat round."
      };
    }
  }

  const expertUsesLeft = player
    ? player.limits.expertUses +
      (player.combatStats.expertUseBonusThisRound ?? 0) -
      player.combatStats.expertUsesSpentThisRound
    : 0;
  if (expertUsesNeeded > expertUsesLeft) {
    return {
      code: "ACTION_NOT_LEGAL",
      message: "Not enough crowns for that many expert plays this combat round."
    };
  }

  return null;
}

function moveCardFromHandToDiscard(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
  destination: "discard" | "removed" = "discard"
): RulesError | null {
  const player = state.players[playerId];
  const cardIndex = player?.hand.indexOf(cardId) ?? -1;

  if (!player || cardIndex === -1) {
    return {
      code: "CARD_NOT_IN_HAND",
      message: "The selected card is not in that player's hand.",
      path: `players.${playerId}.hand`
    };
  }

  player.hand.splice(cardIndex, 1);
  if (destination === "removed") {
    // "Remove this card": it leaves the game instead of cycling back.
    player.removed.push(cardId);
  } else {
    player.discard.push(cardId);
  }
  return null;
}

/**
 * Spell Scroll consumption: a used scroll spell leaves the scroll (and the
 * game — it never returns to a deck, hand or discard). An emptied scroll is
 * removed. Returns whether the spell was found and consumed.
 */
function consumeScrollSpell(
  state: GameState,
  playerId: PlayerId,
  scrollId: string,
  cardId: string
): boolean {
  const player = state.players[playerId];
  const scroll = player?.scrolls?.find((candidate) => candidate.id === scrollId);
  const cardIndex = scroll?.spellCardIds.indexOf(cardId) ?? -1;
  if (!player || !scroll || cardIndex === -1) {
    return false;
  }

  scroll.spellCardIds.splice(cardIndex, 1);
  player.removed.push(cardId);
  if (scroll.spellCardIds.length === 0) {
    player.scrolls = player.scrolls?.filter((candidate) => candidate.id !== scrollId);
  }
  return true;
}

function nextPlayerId(state: GameState, playerId: PlayerId): PlayerId {
  const currentIndex = state.turnOrder.indexOf(playerId);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % state.turnOrder.length;
  return state.turnOrder[nextIndex];
}

function makeStackItem(state: GameState, action: GameAction): ResolutionStackItem {
  return {
    id: `stack_${state.stack.length + 1}`,
    source:
      action.type === "CAST_SPELL"
        ? { type: "card", cardId: action.cardId, controllerId: action.playerId }
        : action.type === "ATTACK_UNIT" || action.type === "MOVE_AND_ATTACK_UNIT"
          ? { type: "unit", unitId: action.attackerId, controllerId: action.playerId }
        : { type: "system" },
    action,
    status: "pending",
    triggerEventIds: [],
    modifiers: {
      spellPowerBonus: 0,
      attackBonus: 0,
      defenseBonus: 0,
      playedCardIds: []
    }
  };
}

function reactionPlayerOrder(
  state: GameState,
  legalReactions: Record<PlayerId, LegalAction[]>,
  triggerEvent?: GameEvent
): PlayerId[] {
  const eligible = state.turnOrder.filter((playerId) => (legalReactions[playerId] ?? []).length > 0);

  // The initiator of a cast or attack acts FIRST so they can finish empowering
  // (paying Power into a spell / attack) before the opponent decides Resistance
  // or Magic Mirror against the FINAL power — the board-game order. Only the
  // caster/attacker may add Power, so without this an opponent earlier in turn
  // order could Resist a power-0 spell before it was ever empowered, and
  // "cast at the power you used" could never happen. Their playerId is the
  // initiator for both windows (the retaliating unit's controller for a
  // retaliation). Other windows (Sorrow activation-skip, lethal saves) keep
  // plain turn order.
  const initiator =
    triggerEvent && (triggerEvent.type === "SPELL_CAST_STARTED" || triggerEvent.type === "UNIT_ATTACK_DECLARED")
      ? triggerEvent.playerId
      : null;
  if (initiator && eligible.includes(initiator)) {
    return [initiator, ...eligible.filter((playerId) => playerId !== initiator)];
  }
  return eligible;
}

function rollAttackDie(combat: CombatState): number {
  const dice = combat.dice;
  const rollIndex = dice.rollCount;
  dice.rollCount += 1;

  if (dice.scriptedRolls && rollIndex < dice.scriptedRolls.length) {
    return dice.scriptedRolls[rollIndex] ?? 0;
  }

  const faces = dice.faces.length > 0 ? dice.faces : ATTACK_DIE_FACES;
  // Derive each roll from the combat seed and the roll index so the sequence is
  // deterministic for every client (server-authoritative) yet unpredictable to
  // players, who cannot peek at future rolls.
  const random = createSeededRandom(`${dice.seed}#${rollIndex}`);
  return faces[random.nextInt(0, faces.length - 1)] ?? 0;
}

function rollAttackDice(combat: CombatState, rollMode: AttackRollMode): { rolls: number[]; selectedRoll: number } {
  const rollCount = rollMode === "normal" ? 1 : 2;
  const rolls = Array.from({ length: rollCount }, () => rollAttackDie(combat));

  if (rollMode === "advantage") {
    return {
      rolls,
      selectedRoll: Math.max(...rolls)
    };
  }

  if (rollMode === "disadvantage") {
    return {
      rolls,
      selectedRoll: Math.min(...rolls)
    };
  }

  return {
    rolls,
    selectedRoll: rolls[0] ?? 0
  };
}

/**
 * Neutral Champions' "roll 2 Attack dice and apply both outcomes": roll two
 * dice, reroll each "-1" once when `rerollMinusOnce`, then sum both faces into a
 * single resolved roll. The reroll is built in, so no reroll choice is opened.
 */
function rollApplyBothCandidate(combat: CombatState, rerollMinusOnce: boolean): AttackRollCandidate {
  const rollOne = () => {
    const value = rollAttackDie(combat);
    return rerollMinusOnce && value === -1 ? rollAttackDie(combat) : value;
  };
  const first = rollOne();
  const second = rollOne();
  // Both faces are summed into the outcome, so the overlay keeps both lit.
  return { rolls: [first, second], roll: first + second, sumAllDice: true };
}

function hasExpertUseAvailable(state: GameState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  return Boolean(
    player &&
      player.combatStats.expertUsesSpentThisRound <
        player.limits.expertUses + (player.combatStats.expertUseBonusThisRound ?? 0)
  );
}

// markUnitRemovedIfNeeded (pack flip + removal) lives in combat-units.ts so
// the war machine module can finalize its damage the same way.

// appendExpiredEffectEvents / finishCombatIfNeeded / livingControllerIds
// moved to combat-units.ts so the war machine module can finish combats.

function appendActiveEffectCreatedEvent(state: GameState, activeEffect: ActiveEffectState): void {
  appendEvent(state, {
    type: "ACTIVE_EFFECT_CREATED",
    effectId: activeEffect.id,
    controllerId: activeEffect.controllerId,
    name: activeEffect.name,
    duration: activeEffect.duration
  });
}

function createActiveEffect(
  state: GameState,
  effectDefinition: ActiveEffectDefinition,
  source: ActiveEffectState["source"],
  controllerId: PlayerId,
  target?: { type: "unit"; unitId: UnitId }
): ActiveEffectState {
  const activeEffect = makeActiveEffect(state, effectDefinition, source, controllerId, target);
  state.activeEffects.push(activeEffect);
  appendActiveEffectCreatedEvent(state, activeEffect);
  return activeEffect;
}

function createActiveEffectFromCard(
  state: GameState,
  card: CardDefinition,
  effect: CreateActiveEffectCardEffect,
  playerId: PlayerId,
  mode: "basic" | "expert",
  target?: { type: "unit"; unitId: UnitId }
): void {
  const effectDefinition = mode === "expert" ? (effect.expertEffect ?? effect.effect) : effect.effect;
  createActiveEffect(
    state,
    effectDefinition,
    {
      type: "card",
      cardId: card.id,
      controllerId: playerId
    },
    playerId,
    target
  );
}

/** Ranks unit grades for tier-gated effects (Anti-Magic, Counterstrike…). */
function gradeRank(grade: CombatUnitState["grade"]): number {
  return grade === "bronze" ? 0 : grade === "silver" ? 1 : grade === "gold" ? 2 : 3;
}

/** Highest grade unlocked by the paid power (e.g. {0:bronze,2:silver,4:gold}). */
function gradeAtPower(
  gradeByPower: Record<number, CombatUnitState["grade"]>,
  power: number
): CombatUnitState["grade"] | null {
  const thresholds = Object.keys(gradeByPower)
    .map(Number)
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  const matched = thresholds.filter((value) => value <= power).at(-1);
  return matched === undefined ? null : (gradeByPower[matched] ?? null);
}

/** Mirth: the reroll's duration unlocked by the paid Power. */
function durationAtPower(
  durationByPower: Record<number, EffectDurationDefinition>,
  power: number
): EffectDurationDefinition | null {
  const thresholds = Object.keys(durationByPower)
    .map(Number)
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  const matched = thresholds.filter((value) => value <= power).at(-1);
  return matched === undefined ? null : (durationByPower[matched] ?? null);
}

/** Chain Lightning Spell: the damage allocation unlocked by the paid Power. */
function chainDamagesAtPower(
  damagesByPower: Record<number, number[]>,
  power: number
): number[] | null {
  const thresholds = Object.keys(damagesByPower)
    .map(Number)
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  const matched = thresholds.filter((value) => value <= power).at(-1);
  return matched === undefined ? null : (damagesByPower[matched] ?? null);
}

/** Resolves a CHAIN_LIGHTNING effect's allocation array for the paid Power. */
function chainLightningDamages(
  effect: Extract<EffectDefinition, { type: "CHAIN_LIGHTNING" }>,
  power: number
): number[] {
  if (effect.damagesByPower) {
    return chainDamagesAtPower(effect.damagesByPower, power) ?? effect.damages ?? [];
  }
  return effect.damages ?? [];
}

/**
 * Whether the unit's controller could play Alamar's Resurrection to save it
 * right now — exactly the reactions the lethal-save window would offer.
 */
function playerHasLethalSave(state: GameState, defenderId: UnitId, cards: CardLibrary): boolean {
  const reactions = getLegalReactionsForTrigger(
    state,
    { id: "lethal-check", type: "UNIT_LETHAL_HIT", attackerId: "", defenderId },
    cards
  );
  return Object.values(reactions).some((list) => list.length > 0);
}

function getAmountByPower(amountByPower: Record<number, number> | undefined, fallback: number, power: number): number {
  if (!amountByPower) {
    return fallback;
  }

  const powerBreakpoints = Object.keys(amountByPower)
    .map(Number)
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  const matchingPower = powerBreakpoints.filter((value) => value <= power).at(-1) ?? powerBreakpoints[0];

  return matchingPower === undefined ? fallback : (amountByPower[matchingPower] ?? fallback);
}

/** Whether a stack item is a pending attack (its Power pool is split per side). */
function isAttackStackItem(stackItem: ResolutionStackItem | undefined): boolean {
  return stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT";
}

/** The Power one player has paid into an attack window (statistics, +1s, standing). */
function attackPowerFor(stackItem: ResolutionStackItem, playerId: PlayerId): number {
  return stackItem.modifiers.attackPowerByPlayer?.[playerId] ?? 0;
}

/** Add Power to one player's attack-window pool (per caster, never shared). */
function addAttackPower(stackItem: ResolutionStackItem, playerId: PlayerId, amount: number): void {
  const pool = (stackItem.modifiers.attackPowerByPlayer ??= {});
  pool[playerId] = (pool[playerId] ?? 0) + amount;
}

/**
 * Whether a Power-scaled Frenzy on this attack pierces the defender's Defense:
 * the pierced grade is re-derived from the caster's FINAL pooled attack-window
 * Power (so Power paid after Frenzy still counts), then compared to the
 * defender's grade. Fixed-grade Frenzy sets ignoreDefense outright and is not
 * handled here.
 */
function frenzyPierces(stackItem: ResolutionStackItem, defender: CombatUnitState): boolean {
  const table = stackItem.modifiers.ignoreDefenseGradeByPower;
  if (!table) {
    return false;
  }
  const caster =
    stackItem.modifiers.ignoreDefenseCasterId ??
    (stackItem.action.type === "ATTACK_UNIT" || stackItem.action.type === "MOVE_AND_ATTACK_UNIT"
      ? stackItem.action.playerId
      : undefined);
  if (!caster) {
    return false;
  }
  const reached = gradeAtPower(table, attackPowerFor(stackItem, caster));
  return reached !== null && gradeRank(defender.grade) <= gradeRank(reached);
}

/**
 * Whether a spell instant's effect draws from the attack-window Power pool —
 * the Power-scaling buffs/debuffs (Bloodlust, Curse, Weakness, Precision, the
 * scaled Bless bonus, Slayer's roll count and Frenzy's pierced grade). A plain
 * (unscaled) Bless does not, so it is never credited standing Power.
 */
function effectScalesWithAttackPool(effect: ReturnType<typeof getEffectiveCardEffect>): boolean {
  if (!effect) {
    return false;
  }
  if (effect.type === "SLAYER_ATTACK") {
    return true;
  }
  if (effect.type === "ADD_COMBAT_STAT") {
    return Boolean(effect.amountByPower);
  }
  if (effect.type === "IGNORE_ATTACK_DIE") {
    return Boolean(effect.attackBonusByPower);
  }
  if (effect.type === "IGNORE_DEFENSE") {
    return Boolean(effect.gradeByPower);
  }
  return false;
}

/**
 * Re-derive every Power-scaling attack/defense instant recorded on an attack
 * stack item against its CASTER's attack-window Power pool, folding the delta
 * into attackBonus/defenseBonus. Called whenever fresh Power is paid into the
 * attack window so a Bloodlust/Bless/Precision/Curse/Weakness cast earlier keeps
 * growing instead of being frozen at the Power it had when first played.
 */
function recomputePowerScaledAttackInstants(stackItem: ResolutionStackItem): void {
  const attackerId =
    stackItem.action.type === "ATTACK_UNIT" || stackItem.action.type === "MOVE_AND_ATTACK_UNIT"
      ? stackItem.action.playerId
      : undefined;

  // Slayer (always the attacker's): re-derive its roll count from the attacker's
  // Power so Power paid AFTER Slayer was played (the caster keeps priority and
  // keeps empowering) lifts it from 2 → 4 → 6 instead of freezing at cast time.
  if (stackItem.modifiers.slayerRollsByPower && attackerId) {
    stackItem.modifiers.slayerRolls = getAmountByPower(
      stackItem.modifiers.slayerRollsByPower,
      2,
      attackPowerFor(stackItem, attackerId)
    );
  }

  const records = stackItem.modifiers.powerScaledAttackInstants;
  if (!records || records.length === 0) {
    return;
  }
  for (const record of records) {
    const scaled = getAmountByPower(record.amountByPower, record.baseAmount, attackPowerFor(stackItem, record.playerId));
    const newApplied = (scaled + record.fixedBonus) * record.doubleFactor;
    const delta = newApplied - record.appliedAmount;
    if (delta === 0) {
      continue;
    }
    if (record.stat === "attack") {
      stackItem.modifiers.attackBonus += delta;
    } else {
      stackItem.modifiers.defenseBonus += delta;
    }
    record.appliedAmount = newApplied;
  }
}

/**
 * Resistance ending an instant Spell buff already played into an attack: undo
 * that one spell's contribution so the attack resolves as if it were never cast.
 * Pulls its power-scaled attack/defense record back out (subtracting the bonus
 * it currently contributes), then clears the per-card flags it set — Bless's
 * ignored die, Precision's ranged-penalty waiver, and Slayer's extra rolls/draw.
 */
function reverseCancelledInstantSpell(stackItem: ResolutionStackItem, cardId: CardId, cards: CardLibrary): void {
  const records = stackItem.modifiers.powerScaledAttackInstants;
  if (records) {
    for (let index = records.length - 1; index >= 0; index -= 1) {
      if (records[index].cardId !== cardId) {
        continue;
      }
      const record = records[index];
      if (record.stat === "attack") {
        stackItem.modifiers.attackBonus -= record.appliedAmount;
      } else {
        stackItem.modifiers.defenseBonus -= record.appliedAmount;
      }
      records.splice(index, 1);
      break;
    }
  }

  const effect = cards[cardId]?.effect;
  if (effect?.type === "IGNORE_ATTACK_DIE") {
    stackItem.modifiers.ignoreAttackDie = false;
  }
  if (effect?.type === "ADD_COMBAT_STAT" && effect.ignoreRangedPenalty) {
    stackItem.modifiers.ignoreRangedPenalty = false;
  }
  if (effect?.type === "SLAYER_ATTACK") {
    stackItem.modifiers.slayerRolls = undefined;
    stackItem.modifiers.slayerRollsByPower = undefined;
    stackItem.modifiers.slayerDraw = undefined;
  }
}

/**
 * The signed stat penalty an instant ADD_COMBAT_STAT Spell currently contributes
 * to an attack — what Magic Mirror carries onto its new target as a token. Read
 * from the power-scaled record (so Power paid into the attack window is honoured)
 * but WITHOUT the original target's hero-specialty doubling, since the malus is
 * moving to a different unit. A Scroll cast (locked to Power 0, never recorded)
 * falls back to the card's printed base amount.
 */
function attackInstantSignedAmount(stackItem: ResolutionStackItem, cardId: CardId, cards: CardLibrary): number {
  const records = stackItem.modifiers.powerScaledAttackInstants ?? [];
  // Match reverseCancelledInstantSpell, which pulls the LAST record for the card.
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (record.cardId === cardId) {
      // Re-derive against the CASTER's attack-Power pool (the same source
      // recomputePowerScaledAttackInstants scales by), without the original
      // target's hero-specialty doubling — the malus is moving to a new unit.
      return (
        getAmountByPower(record.amountByPower, record.baseAmount, attackPowerFor(stackItem, record.playerId)) +
        record.fixedBonus
      );
    }
  }
  const effect = cards[cardId]?.effect;
  return effect?.type === "ADD_COMBAT_STAT" ? effect.amount : 0;
}

/**
 * Whether a combat unit is the signature unit a hero specialty doubles for.
 * Most specialties name one exact unit (Crusaders, Efreet…); Mutare's
 * signature is the whole Dragons family ("a Dragons unit"), which matches
 * every unit whose name ends in "Dragons" (Black/Gold/Ghost/Azure/Crystal/
 * Faerie/Rust Dragons) but not Dragon Flies.
 */
export function unitMatchesSpecialtyName(unitName: string | undefined, target: string | undefined): boolean {
  if (!unitName || !target) {
    return false;
  }
  // Multi-unit descriptors ("Elves and Sharpshooters", "X or Y" — Gelu's
  // specialty doubles for two unit types): match when the unit is any of them.
  if (/\s+(?:and|or)\s+/i.test(target)) {
    return target
      .split(/\s+(?:and|or)\s+/i)
      .some((part) => unitMatchesSpecialtyName(unitName, part.trim()));
  }
  if (unitName === target) {
    return true;
  }
  // Family descriptors like "a Dragons unit": strip the "a … unit" wrapper and
  // match any unit whose name ends with the remaining creature family word.
  const family = target.replace(/^an?\s+/i, "").replace(/\s+units?$/i, "").trim();
  return family.length > 0 && family !== target && unitName.toLowerCase().endsWith(family.toLowerCase());
}

function doubleAmountForUnitName(amount: number, unit: CombatUnitState | undefined, unitName: string | undefined): number {
  return unitMatchesSpecialtyName(unit?.name, unitName) ? amount * 2 : amount;
}

/**
 * Records that `player` cast a Spell this combat round/turn (the printed
 * one-Spell-per-round accounting) and fires any ongoing "after casting a Spell,
 * draw N cards" effects (Zydar's Sorcery VI).
 */
function noteSpellCast(state: GameState, player: PlayerState, countsTowardLimit = true): void {
  // Helm of the Alabaster Unicorn's Spell-deck cast is a free bonus cast: it does
  // not consume the one-Spell-per-combat-round limit (spellsCastThisRound), so a
  // later normal Spell is still allowed. It still counts as a Spell cast this turn
  // and fires "on Spell cast" draw effects.
  if (countsTowardLimit) {
    player.combatStats.spellsCastThisRound += 1;
  }
  player.combatStats.spellsCastThisTurn = (player.combatStats.spellsCastThisTurn ?? 0) + 1;
  // The "first spell this round" Power gate (Tower Magi Pack) closes on the first
  // cast through ANY path — hand cast, reaction, or a free Helm cast — so the
  // bonus lands on whichever spell is genuinely cast first, exactly once.
  player.combatStats.anySpellCastThisRound = true;

  let draws = 0;
  for (const effect of state.activeEffects) {
    if (effect.controllerId !== player.id) {
      continue;
    }
    for (const modifier of effect.modifiers) {
      if (modifier.type === "DRAW_ON_SPELL_CAST") {
        draws += modifier.amount;
      }
    }
  }
  if (draws > 0) {
    drawCardsForPlayer(state, player.id, draws);
  }
}

function createAttackBuffFromCard(
  state: GameState,
  card: CardDefinition,
  // Passed in (not read off card.effect) so it also works as a CHOOSE_ONE
  // option (Moandor's "+2 attack"), where card.effect is the "OR" wrapper.
  effect: Extract<EffectDefinition, { type: "CREATE_ATTACK_BUFF" }>,
  playerId: PlayerId,
  power: number,
  target: { type: "unit"; unitId: UnitId }
): void {
  const targetUnit = state.combat?.units[target.unitId];
  const amount = doubleAmountForUnitName(
    getAmountByPower(effect.amountByPower, effect.amount ?? 0, power),
    targetUnit,
    effect.doubleForUnitName
  );
  createActiveEffect(
    state,
    {
      name: effect.name,
      scope: "unit",
      duration: effect.duration,
      polarity: effect.polarity ?? "positive",
      removable: effect.removable ?? true,
      modifiers: [
        {
          type: "ATTACK_BONUS",
          amount
        }
      ]
    },
    {
      type: "card",
      cardId: card.id,
      controllerId: playerId
    },
    playerId,
    target
  );
}

function createDefenseBuffFromCard(
  state: GameState,
  card: CardDefinition,
  playerId: PlayerId,
  power: number,
  target: { type: "unit"; unitId: UnitId }
): void {
  if (card.effect.type !== "CREATE_DEFENSE_BUFF") {
    return;
  }

  const amount = getAmountByPower(card.effect.amountByPower, card.effect.amount ?? 0, power);
  // Shield / Air Shield carry `vsAttackerType`, so their Defense is conditional
  // (read in getAttackerTypeDefenseBonus); a plain buff emits an always-on bonus.
  const modifier: ActiveEffectModifier = card.effect.vsAttackerType
    ? { type: "DEFENSE_VS_ATTACKER_TYPE", attackerType: card.effect.vsAttackerType, amount }
    : { type: "DEFENSE_BONUS", amount };
  createActiveEffect(
    state,
    {
      name: card.effect.name,
      scope: "unit",
      duration: card.effect.duration,
      polarity: card.effect.polarity ?? "positive",
      removable: card.effect.removable ?? true,
      modifiers: [modifier]
    },
    {
      type: "card",
      cardId: card.id,
      controllerId: playerId
    },
    playerId,
    target
  );
}

/**
 * Fire Shield active effect: the Fire Shield spell scales with `power`
 * (`amountByPower`); hero specialties (Rashka) pass a flat `amount`, doubled
 * when the shield lands on the specialty's signature unit (his Efreet at VI).
 */
function createFireShieldFromCard(
  state: GameState,
  card: CardDefinition,
  effect: Extract<EffectDefinition, { type: "CREATE_FIRE_SHIELD" }>,
  playerId: PlayerId,
  power: number,
  target: { type: "unit"; unitId: UnitId }
): void {
  const targetUnit = state.combat?.units[target.unitId];
  const base = effect.amountByPower
    ? getAmountByPower(effect.amountByPower, effect.amount ?? 1, power)
    : (effect.amount ?? 0);
  const amount = doubleAmountForUnitName(base, targetUnit, effect.doubleForUnitName);
  if (amount <= 0) {
    return;
  }
  createActiveEffect(
    state,
    {
      name: card.name,
      scope: "unit",
      duration: effect.duration,
      polarity: "positive",
      removable: effect.removable ?? true,
      modifiers: [{ type: "FIRE_SHIELD", amount }]
    },
    { type: "card", cardId: card.id, controllerId: playerId },
    playerId,
    target
  );
}

function createAttackRerollEffectFromCard(
  state: GameState,
  card: CardDefinition,
  playerId: PlayerId,
  mode: "basic" | "expert",
  power?: number
): void {
  if (card.effect.type !== "CREATE_ATTACK_DIE_REROLL") {
    return;
  }

  const maxUsesPerRoll =
    power === undefined
      ? mode === "expert"
        ? (card.effect.expertRerolls ?? card.effect.basicRerolls)
        : card.effect.basicRerolls
      : getAmountByPower(card.effect.rerollsByPower, card.effect.basicRerolls, power);

  if (maxUsesPerRoll <= 0) {
    return;
  }

  // Mirth scales its DURATION with Power (this Activation / Combat round /
  // Combat) rather than the reroll count; durationByPower overrides the flat
  // duration at the matched breakpoint.
  const duration =
    power !== undefined && card.effect.durationByPower
      ? (durationAtPower(card.effect.durationByPower, power) ?? card.effect.duration)
      : card.effect.duration;

  const modifiers: ActiveEffectDefinition["modifiers"] = [
    {
      type: "ATTACK_DIE_REROLL",
      maxUsesPerRoll,
      consumeEffectOnUse: card.effect.consumeEffectOnUse
    }
  ];
  // Fortune also rerolls the adventure-map Treasure and Resource dice, sharing
  // a single budget equal to the reroll count (Power 0/1/2 -> 1/2/3). Both die
  // types draw from the same `rerolls` budget on the effect.
  if (card.effect.adventureDice) {
    modifiers.push(
      { type: "ADVENTURE_DIE_REROLL", dice: "treasure", rerolls: maxUsesPerRoll },
      { type: "ADVENTURE_DIE_REROLL", dice: "resource", rerolls: maxUsesPerRoll }
    );
  }

  createActiveEffect(
    state,
    {
      name: card.effect.name,
      scope: "player",
      duration,
      polarity: "positive",
      removable: false,
      modifiers
    },
    {
      type: "card",
      cardId: card.id,
      controllerId: playerId
    },
    playerId
  );
}

function removeEffectsFromTarget(
  state: GameState,
  source: ActiveEffectState["source"],
  target: { type: "unit"; unitId: UnitId },
  removePolarity: "negative" | "any-removable"
): void {
  const removed = state.activeEffects.filter((effect) => {
    if (effect.target?.type !== "unit" || effect.target.unitId !== target.unitId || effect.removable === false) {
      return false;
    }

    if (removePolarity === "any-removable") {
      return true;
    }

    return effect.polarity === "negative";
  });

  if (removed.length === 0) {
    return;
  }

  const removedIds = new Set(removed.map((effect) => effect.id));
  state.activeEffects = state.activeEffects.filter((effect) => !removedIds.has(effect.id));

  appendEvent(state, {
    type: "ACTIVE_EFFECTS_REMOVED",
    source,
    target,
    effectIds: [...removedIds]
  });
}

/**
 * Boots of Polarity (option B): strip exactly ONE removable ongoing effect from
 * the chosen unit — the most recently applied one (the last pushed). Returns
 * whether anything was removed. Honours `removable === false` (permanent
 * effects stay), and only touches unit-scoped effects (the global relic locks
 * are not unit-targeted). Narrower than Cure/Dispel, which clear several.
 */
function removeOneEffectFromTarget(
  state: GameState,
  source: ActiveEffectState["source"],
  target: { type: "unit"; unitId: UnitId }
): boolean {
  for (let index = state.activeEffects.length - 1; index >= 0; index -= 1) {
    const effect = state.activeEffects[index];
    if (
      effect.target?.type === "unit" &&
      effect.target.unitId === target.unitId &&
      effect.removable !== false
    ) {
      state.activeEffects.splice(index, 1);
      appendEvent(state, {
        type: "ACTIVE_EFFECTS_REMOVED",
        source,
        target,
        effectIds: [effect.id]
      });
      return true;
    }
  }
  return false;
}

function healUnitDamage(
  state: GameState,
  source: ActiveEffectState["source"],
  target: { type: "unit"; unitId: UnitId },
  amount: number
): void {
  const unit = state.combat?.units[target.unitId];
  if (!unit) {
    return;
  }

  const healedAmount = Math.min(amount, unit.damage);
  unit.damage = Math.max(0, unit.damage - amount);

  appendEvent(state, {
    type: "DAMAGE_HEALED",
    source,
    target,
    amount: healedAmount
  });
}

/**
 * Spell damage actually dealt to a unit after its "Reduce any damage from
 * spells by N" passive (Iron/Gold/Diamond Golems, neutral Black Dragons),
 * floored at 0. Applied at every Spell-damage site (direct, area and the
 * Faerie Dragon's bolt).
 */
function totalSpellDamageReduction(state: GameState, target: CombatUnitState): number {
  // Orb of Vulnerability switches off every "reduce Spell damage" passive, so
  // the magic-resistant creature takes the spell's full damage.
  if (spellAbilitiesSuppressed(state)) {
    return 0;
  }
  let total = getSpellDamageReduction(target);

  // Interference: a unit-scoped Defense bonus that also blunts Spell damage.
  // Sum every SPELL_DAMAGE_REDUCTION modifier on an effect that applies to the
  // target (Titans/Gargoyles' ignore-ongoing-effects passives are honoured by
  // effectAppliesToUnit, exactly as they are for any other ongoing effect).
  for (const effect of state.activeEffects) {
    if (!effectAppliesToUnit(effect, target)) {
      continue;
    }
    for (const modifier of effect.modifiers) {
      if (modifier.type === "SPELL_DAMAGE_REDUCTION") {
        total += modifier.amount;
      }
    }
  }

  const combat = state.combat;
  if (combat) {
    // Aura sources (Rampart Unicorns Pack) shield themselves and adjacent
    // friendly units — sum every friendly aura on or beside the target.
    for (const unit of Object.values(combat.units)) {
      if (!isUnitAlive(unit) || unit.controllerId !== target.controllerId) {
        continue;
      }
      if (unit.id !== target.id && !isAdjacent(unit.position, target.position)) {
        continue;
      }
      total += getSpellDamageReductionAura(unit);
    }
  }
  return total;
}

function reducedSpellDamage(state: GameState, target: CombatUnitState, amount: number): number {
  return Math.max(0, amount - totalSpellDamageReduction(state, target));
}

/**
 * Azure Dragons / Black Dragons (Pack): a unit that takes NO damage from this
 * card — "immune to all Spells" blocks every Spell, "immune to Specialty
 * damage" blocks Hero Specialty cards. Non-damage Specialty effects are applied
 * elsewhere and are unaffected. The Spell-targeting filter already keeps an
 * all-school-immune unit from being targeted/splashed; this closes the
 * remaining area-damage paths that bypass that filter.
 */
function unitIgnoresCardDamage(state: GameState, unit: CombatUnitState, card: CardDefinition | undefined): boolean {
  if (!card) {
    return false;
  }
  // Orb of Inhibition (option A): for the rest of the Combat every Spell and
  // Hero-Specialty CARD deals 0 damage to every unit. Checked at this shared
  // card-damage predicate so the direct, area, Xyron and Chain Lightning paths
  // (all of which gate on this function) are covered for both armies at once.
  if (cardDamageNullified(state) && (card.kind === "spell" || card.kind === "hero-specialty")) {
    return true;
  }
  if (card.kind === "hero-specialty") {
    return hasImmuneToSpecialtyDamage(unit);
  }
  if (card.kind === "spell") {
    // Pendant of Negativity (option B): an artifact-granted school immunity also
    // turns the spell aside. Unlike printed immunity it is NOT lifted by Orb of
    // Vulnerability (an artifact effect, like Anti-Magic).
    if (unitImmuneToSpellSchoolsByEffect(state, unit, card.spellSchools)) {
      return true;
    }
    // Orb of Vulnerability negates printed spell-school immunity, so the unit
    // takes the spell like any other.
    return !spellAbilitiesSuppressed(state) && unitImmuneToSpellSchools(unit, card.spellSchools);
  }
  return false;
}

/**
 * Rampart Dwarves "Magic Resistance": when a Spell or Specialty card targets a
 * single Dwarf unit, it rolls one Attack die; on the printed face ("+1") the
 * card has no effect on it. The roll happens whether the card is friendly or
 * hostile. Returns true when the card is negated (the caller skips the effect).
 * Rolls at most once, and only when the target is a living Dwarf carrying the
 * ability — otherwise it is a no-op that never touches the dice.
 */
function negatesCardOnDwarfRoll(state: GameState, target: TargetRef | undefined, cardName: string): boolean {
  const combat = state.combat;
  if (!combat || !target || target.type !== "unit") {
    return false;
  }
  // Orb of Vulnerability negates the Dwarves' Magic Resistance — no roll, the
  // card simply takes hold.
  if (spellAbilitiesSuppressed(state)) {
    return false;
  }
  const unit = combat.units[target.unitId];
  const negate = unit ? getCardNegateOnDie(unit) : null;
  if (!unit || !isUnitAlive(unit) || !negate) {
    return false;
  }

  const roll = rollAttackDie(combat);
  const negated = roll === negate.onRoll;
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: unit.id,
    abilityId: negate.abilityId,
    targetUnitId: unit.id,
    message: negated
      ? `${unit.cardName} rolls ${roll} and shrugs off ${cardName} (${negate.abilityName}).`
      : `${unit.cardName} rolls ${roll} for ${negate.abilityName}; ${cardName} takes hold.`
  });
  return negated;
}

/**
 * Boots of Polarity: roll `count` Attack dice against a pending Spell and keep
 * the best ("choose one"). The cancel succeeds when at least one kept die shows
 * the success face (the "+1", value 1). Logged as a SPELL_DICE_ROLLED so the
 * client shows the dice tumbling on the spell; `hits` is the number of success
 * faces. Returns whether the spell is ignored.
 */
function rollSpellCancelDice(
  state: GameState,
  diceRoll: { count: number; successFace: number },
  pendingSpellCardId: CardId,
  rollerId: PlayerId
): boolean {
  const combat = state.combat;
  if (!combat) {
    return false;
  }
  const rolls = Array.from({ length: Math.max(1, diceRoll.count) }, () => rollAttackDie(combat));
  const hits = rolls.filter((value) => value === diceRoll.successFace).length;
  appendEvent(state, {
    type: "SPELL_DICE_ROLLED",
    spellCardId: pendingSpellCardId,
    playerId: rollerId,
    rolls,
    hits
  });
  return hits > 0;
}

/**
 * Damage actually dealt to a unit by a card, after immunity and the golems'
 * damage-reduction passives, floored at 0. The source card's kind decides which
 * reduction applies: Spell cards are softened by "reduce Spell damage" (Iron/
 * Gold/Diamond Golems, Steel Golems, Black Dragons), Hero-Specialty cards only
 * by the Steel Golems' "spell or Specialty" passive. Used at every
 * card-sourced combat-damage site (direct, area, Xyron's Inferno, Chain
 * Lightning); non-card Spell damage (Earthquake, the Faerie bolt) stays on
 * reducedSpellDamage.
 */
function reducedCardDamage(
  state: GameState,
  unit: CombatUnitState,
  card: CardDefinition | undefined,
  amount: number
): number {
  if (unitIgnoresCardDamage(state, unit, card)) {
    return 0;
  }
  const reduction =
    card?.kind === "hero-specialty"
      ? getSpecialtyDamageReduction(unit)
      : card?.kind === "spell"
        ? // Spell-kind: include the Rampart Unicorns' adjacency aura, not just
          // the unit's own "reduce Spell damage" passive.
          totalSpellDamageReduction(state, unit)
        : 0;
  return Math.max(0, amount - reduction);
}

// (finishCombatIfNeeded lives in combat-units.ts.)

/**
 * Inferno: roll the Attack die `rollCount` times, count the "+1" faces, then
 * deal that many points of spell damage to every living unit standing on the
 * targeted space or an orthogonally adjacent one (friend or foe). Spell-damage
 * reduction and spell immunity apply per unit, just like any other spell hit.
 */
function resolveInfernoSpell(
  state: GameState,
  playerId: PlayerId,
  card: CardDefinition,
  position: number,
  rollCount: number
): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }

  const rolls = Array.from({ length: Math.max(1, rollCount) }, () => rollAttackDie(combat));
  const damage = rolls.filter((roll) => roll === 1).length;

  // Show the dice first: the client animates them tumbling and reading out (with
  // the dice clatter + Inferno's roar), and only then does the burst land and the
  // damage float. Logged even on a whiff so the player always sees the roll.
  appendEvent(state, {
    type: "SPELL_DICE_ROLLED",
    spellCardId: card.id,
    playerId,
    rolls,
    hits: damage,
    position
  });

  if (damage <= 0) {
    return;
  }

  const blastArea = new Set<number>([position, ...getOrthogonalNeighbors(position)]);
  // Snapshot the targets first so removals during the loop never shift it.
  const targets = Object.values(combat.units).filter(
    (unit) => isUnitAlive(unit) && blastArea.has(unit.position)
  );

  for (const unit of targets) {
    const dealt = reducedCardDamage(state, unit, card, damage);
    if (dealt <= 0) {
      continue;
    }
    unit.damage += dealt;
    noteUnitDamagedForTokens(state, unit, dealt);
    appendEvent(state, {
      type: "DAMAGE_ASSIGNED",
      source: { type: "card", cardId: card.id, controllerId: playerId },
      target: { type: "unit", unitId: unit.id },
      amount: dealt,
      damageKind: "spell"
    });
    markUnitRemovedIfNeeded(state, unit);
  }
}

/**
 * Deals `amount` card-sourced spell damage to a single unit for the area blasts
 * (Frost Ring, Meteor Shower, Xyron's Inferno). Per-unit spell/Specialty immunity
 * and damage reduction (reducedCardDamage) apply; the hit is logged and the unit
 * flipped/removed. The caller checks finishCombatIfNeeded once the blast is done.
 */
function dealAreaCardDamage(
  state: GameState,
  playerId: PlayerId,
  card: CardDefinition | undefined,
  unit: CombatUnitState,
  amount: number
): void {
  const dealt = reducedCardDamage(state, unit, card, amount);
  if (dealt <= 0) {
    return;
  }
  unit.damage += dealt;
  noteUnitDamagedForTokens(state, unit, dealt);
  appendEvent(state, {
    type: "DAMAGE_ASSIGNED",
    source: card ? { type: "card", cardId: card.id, controllerId: playerId } : { type: "system" },
    target: { type: "unit", unitId: unit.id },
    amount: dealt,
    damageKind: "spell"
  });
  markUnitRemovedIfNeeded(state, unit);
}

/**
 * Opens the "area-pick" choice: the caster picks one of `candidateUnitIds`,
 * which takes `amount` damage, then the choice re-opens (picksRemaining - 1)
 * until the picks are spent or the candidates run out. Used when more units are
 * adjacent to a blast's centre than the spell/specialty may hit.
 */
function openAreaPickChoice(
  state: GameState,
  playerId: PlayerId,
  card: CardDefinition | undefined,
  candidateUnitIds: UnitId[],
  picksRemaining: number,
  amount: number
): void {
  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "ABILITY_TARGET_CHOICE",
    playerId,
    kind: "area-pick",
    abilityId: card?.id ?? null,
    abilityName: card?.name ?? "Area blast",
    prompt: `${card?.name ?? "Area blast"}: pick ${picksRemaining} more adjacent unit${
      picksRemaining === 1 ? "" : "s"
    } to take ${amount} damage (friend or foe).`,
    sourceUnitId: null,
    anchorUnitId: null,
    candidateUnitIds,
    amount,
    picksRemaining,
    sourceCardId: card?.id
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
  appendEvent(state, {
    type: "PENDING_CHOICE_CREATED",
    choiceId,
    choiceType: "ABILITY_TARGET_CHOICE",
    playerId,
    sourceEffectIds: [],
    message: `${card?.name ?? "An area blast"} may scorch ${picksRemaining} of the adjacent units.`
  });
}

/**
 * Hits `picks` of `candidateUnitIds` for `amount` damage each. When that many or
 * fewer are still alive, all of them are hit at once; otherwise the caster
 * chooses which via the area-pick choice.
 */
function applyAdjacentPicks(
  state: GameState,
  playerId: PlayerId,
  card: CardDefinition | undefined,
  candidateUnitIds: UnitId[],
  picks: number,
  amount: number
): void {
  const combat = state.combat;
  if (!combat || picks <= 0) {
    return;
  }
  const alive = candidateUnitIds.filter((id) => isUnitAlive(combat.units[id]));
  if (alive.length === 0) {
    return;
  }
  if (alive.length <= picks) {
    for (const id of alive) {
      dealAreaCardDamage(state, playerId, card, combat.units[id], amount);
    }
    return;
  }
  openAreaPickChoice(state, playerId, card, alive, picks, amount);
}

/**
 * Frost Ring / Meteor Shower I & VI: deal `amount` to up to `adjacentPicks` units
 * orthogonally adjacent to `centerPosition` (and the unit on the centre space too
 * when `includeCenter`), friend or foe. A unit that fully ignores this card's
 * damage is never a pick candidate (its slot is not wasted). When more eligible
 * units are adjacent than may be hit, the caster picks which.
 */
function resolveAreaPickDamage(
  state: GameState,
  playerId: PlayerId,
  card: CardDefinition | undefined,
  centerPosition: number,
  amount: number,
  includeCenter: boolean,
  adjacentPicks: number
): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }

  if (includeCenter) {
    const centre = Object.values(combat.units).find(
      (unit) => isUnitAlive(unit) && unit.position === centerPosition
    );
    if (centre) {
      dealAreaCardDamage(state, playerId, card, centre, amount);
    }
  }

  const neighbours = new Set(getOrthogonalNeighbors(centerPosition));
  const candidates = Object.values(combat.units).filter(
    (unit) =>
      isUnitAlive(unit) && neighbours.has(unit.position) && !unitIgnoresCardDamage(state, unit, card)
  );
  applyAdjacentPicks(
    state,
    playerId,
    card,
    candidates.map((unit) => unit.id),
    adjacentPicks,
    amount
  );
}

function rollAttackCandidate(combat: CombatState, rollMode: AttackRollMode): AttackRollCandidate {
  const { rolls, selectedRoll } = rollAttackDice(combat, rollMode);
  return {
    rolls,
    roll: selectedRoll
  };
}

function getAttackDamagePreview(
  attacker: CombatUnitState,
  defender: CombatUnitState,
  roll: number,
  attackBonus: number,
  defenseBonus: number,
  defendBonus: number,
  dieMultiplier = 1,
  baseAttackOverride?: number,
  damageReduction = 0,
  ignoreDefense = false,
  dieCancelled = false
): { attackValue: number; defenseValue: number; damage: number; dieAttackBonus: number; dieDefenseBonus: number } {
  // Attack-die-face conditioned modifiers, resolved here so the actual hit and
  // the lethal-save preview always agree: Dread Knights' "Death Blow" adds to
  // the attacker's value on 0/+1, Zombies'/Manticores' resilience adds Defense
  // for the defender on the attacker's 0/+1. Shield of the Dwarven Lords ignores
  // the die "and any additional effects it triggered", so a cancelled die fires
  // none of these face-conditioned bonuses.
  const dieAttackBonus = dieCancelled ? 0 : getAttackBonusOnAttackDie(attacker, roll);
  const dieDefenseBonus = dieCancelled ? 0 : getDefenseBonusOnAttackDie(defender, roll);
  const baseAttack = baseAttackOverride ?? attacker.attack;
  const attackValue = Math.max(0, baseAttack + attackBonus + dieAttackBonus + roll * dieMultiplier);
  // Elemental damage ignores Defense outright; otherwise sum printed Defense,
  // the Defend roll's bonus (0 or +1, rolled per attack by the caller), played
  // Defense buffs and any die-face Defense bonus.
  const defenseValue = ignoreDefense ? 0 : defender.defense + defendBonus + defenseBonus + dieDefenseBonus;
  // Siege wall cover: "reduce the attack's damage by 1" comes off the damage,
  // not the defense.
  const damage = Math.max(0, Math.max(0, attackValue - defenseValue) - damageReduction);

  return {
    attackValue,
    defenseValue,
    damage,
    dieAttackBonus,
    dieDefenseBonus
  };
}

function applyAttackDamageFromCandidate(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  isRetaliation: boolean,
  rollMode: AttackRollMode,
  attackBonus: number,
  defenseBonus: number,
  defendBonus: number,
  defendRoll: number | undefined,
  candidate: AttackRollCandidate,
  dieMultiplier = 1,
  baseAttackOverride?: number,
  damageReduction = 0,
  lethalCancel?: { grade: UnitGrade },
  ignoreDefense = false,
  noDie = false,
  dieCancelled = false
): { damage: number; roll: number; cancelled: boolean } {
  if (!state.combat) {
    return { damage: 0, roll: 0, cancelled: false };
  }

  const { attackValue, defenseValue, damage, dieAttackBonus, dieDefenseBonus } = getAttackDamagePreview(
    attacker,
    defender,
    candidate.roll,
    attackBonus,
    defenseBonus,
    defendBonus,
    dieMultiplier,
    baseAttackOverride,
    damageReduction,
    ignoreDefense,
    dieCancelled
  );
  // Reported bonuses fold in the die-face-conditioned deltas so the event's
  // numbers reconcile with the resolved attack/defense values.
  const reportedAttackBonus = attackBonus + dieAttackBonus;
  const reportedDefenseBonus = defenseBonus + dieDefenseBonus;
  // A cancelled die (Shield of the Dwarven Lords) is reported like an unrolled
  // die so the client skips the rolling-dice cinematic.
  const skipDieCinematic = noDie || dieCancelled;

  // Alamar's Resurrection: if this blow would reduce the defender to 0 HP and
  // its grade is within reach, the whole attack is cancelled — no damage, and
  // (handled by the caller) no Retaliation Attack either.
  if (
    lethalCancel &&
    damage > 0 &&
    defender.damage + damage >= defender.maxHealth &&
    gradeRank(defender.grade) <= gradeRank(lethalCancel.grade)
  ) {
    appendEvent(state, {
      type: "ATTACK_ROLLED",
      attackerId: attacker.id,
      defenderId: defender.id,
      rolls: candidate.rolls,
      roll: candidate.roll,
      ...(dieMultiplier !== 1 ? { dieMultiplier } : {}),
      ...(skipDieCinematic ? { noDie: true } : {}),
      ...(candidate.sumAllDice ? { sumAllDice: true } : {}),
      ...(defendRoll !== undefined ? { defendRoll } : {}),
      rollMode,
      attackBonus: reportedAttackBonus,
      defenseBonus: reportedDefenseBonus,
      attackValue,
      defenseValue,
      damage: 0,
      isRetaliation
    });
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: defender.id,
      abilityId: "resurrection",
      message: `Resurrection cancels the attack that would have destroyed ${defender.cardName}.`
    });
    return { damage: 0, roll: candidate.roll, cancelled: true };
  }

  // Damage is not capped at the pack's health: the rulebook carries any
  // excess over onto the Few side when the pack flips.
  defender.damage += damage;

  appendEvent(state, {
    type: "ATTACK_ROLLED",
    attackerId: attacker.id,
    defenderId: defender.id,
    rolls: candidate.rolls,
    roll: candidate.roll,
    ...(dieMultiplier !== 1 ? { dieMultiplier } : {}),
    ...(skipDieCinematic ? { noDie: true } : {}),
    ...(candidate.sumAllDice ? { sumAllDice: true } : {}),
    ...(defendRoll !== undefined ? { defendRoll } : {}),
    rollMode,
    attackBonus: reportedAttackBonus,
    defenseBonus: reportedDefenseBonus,
    attackValue,
    defenseValue,
    damage,
    isRetaliation
  });

  // Dread Knights' "Death Blow": announce the die-triggered Attack bonus so the
  // log and the FX/sound fire (the bonus itself is already folded into damage).
  if (dieAttackBonus > 0) {
    for (const ability of getTriggeredAttackDieBonusAbilities(attacker, candidate.roll)) {
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: attacker.id,
        abilityId: ability.abilityId,
        targetUnitId: defender.id,
        message: `${attacker.cardName} lands a ${ability.abilityName} (+${ability.amount} Attack).`
      });
    }
  }

  if (damage > 0) {
    appendEvent(state, {
      type: "DAMAGE_ASSIGNED",
      source: {
        type: "unit",
        unitId: attacker.id,
        controllerId: attacker.controllerId
      },
      target: { type: "unit", unitId: defender.id },
      amount: damage,
      damageKind: "attack"
    });
  }

  noteUnitDamagedForTokens(state, defender, damage);
  markUnitRemovedIfNeeded(state, defender);

  // Clone Spell: "If the Clone takes at least 1 damage from any source, OR is
  // attacked (even if that attack inflicts 0 damage), destroy the Clone." Any
  // damage already removed it above (a Clone has 1 Health); this covers the
  // 0-damage case — it is destroyed for having been attacked, so it never lives
  // to retaliate. (Spells/abilities that deal 0 damage are NOT attacks and do
  // not trigger this — only an attack does.)
  if (defender.cloneOfUnitId && isUnitAlive(defender)) {
    defender.damage = defender.maxHealth;
    markUnitRemovedIfNeeded(state, defender);
  }
  return { damage, roll: candidate.roll, cancelled: false };
}

function applyPostAttackAbilityDamage(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  attackKind: "melee" | "ranged",
  roll: number,
  damage: number
): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }

  const damageEffects = getPostAttackAbilityDamageEffects(combat, {
    attacker,
    defender,
    attackKind,
    roll,
    damage
  });

  for (const effect of damageEffects) {
    const target = combat.units[effect.targetUnitId];
    if (!target || !isUnitAlive(target)) {
      continue;
    }

    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: effect.sourceUnitId,
      abilityId: effect.abilityId,
      targetUnitId: effect.targetUnitId,
      message: effect.message
    });

    const assignedDamage = Math.min(effect.amount, Math.max(0, target.maxHealth - target.damage));
    target.damage += effect.amount;
    noteUnitDamagedForTokens(state, target, effect.amount);

    if (assignedDamage > 0) {
      appendEvent(state, {
        type: "DAMAGE_ASSIGNED",
        source: {
          type: "unit",
          unitId: effect.sourceUnitId,
          controllerId: attacker.controllerId
        },
        target: { type: "unit", unitId: target.id },
        amount: assignedDamage,
        damageKind: effect.damageKind
      });
    }

    markUnitRemovedIfNeeded(state, target);
  }
}

function getAttackStackDetails(
  state: GameState,
  stackItem: ResolutionStackItem
):
  | {
      attacker: CombatUnitState;
      defender: CombatUnitState;
      isRetaliation: boolean;
      attackKind: "melee" | "ranged";
      rollMode: AttackRollMode;
      attackBonus: number;
      defenseBonus: number;
      dieMultiplier: number;
      /** Bless / Elemental damage: the Attack die is skipped and counts as 0. */
      ignoreAttackDie: boolean;
      /**
       * Elemental damage: the defender's Defense is ignored entirely (printed
       * Defense, Defense token, and any Defense buffs), so the hit lands for the
       * attacker's full Attack value.
       */
      ignoreDefense: boolean;
      /** Siege wall cover: damage knocked off a ranged hit (0 or 1). */
      damageReduction: number;
      /** Behemoths: the announced defense reduction applied to this attack. */
      defenseReductionAbility?: { abilityId: string; abilityName: string; amount: number };
      /** Printed-ability follow-up (Death Cloud): replacement base attack. */
      abilityAttack?: { abilityId: string; baseAttack: number };
    }
  | null {
  const combat = state.combat;
  if (!combat || (stackItem.action.type !== "ATTACK_UNIT" && stackItem.action.type !== "MOVE_AND_ATTACK_UNIT")) {
    return null;
  }

  const attacker = combat.units[stackItem.action.attackerId];
  const defender = combat.units[stackItem.action.defenderId];
  if (!attacker || !defender) {
    return null;
  }

  const triggerEvent = stackItem.triggerEventIds
    .map((eventId) => state.eventLog.find((event) => event.id === eventId))
    .find((event): event is Extract<GameEvent, { type: "UNIT_ATTACK_DECLARED" }> => event?.type === "UNIT_ATTACK_DECLARED");
  const isRetaliation = triggerEvent?.isRetaliation ?? false;
  const attackKind = triggerEvent?.attackKind ?? getAttackKind(attacker, defender);
  // The Ammo Cart waiver applies inside getAttackRollMode (state param).
  let rollMode = triggerEvent?.rollMode ?? getAttackRollMode(attacker, defender, state);

  // Precision (this attack) and Golden Bow (whole combat) lift the ranged
  // back-row penalty after the attack was declared.
  if (
    rollMode === "disadvantage" &&
    attacker.type === "ranged" &&
    (stackItem.modifiers.ignoreRangedPenalty ||
      state.activeEffects.some(
        (effect) =>
          effect.controllerId === attacker.controllerId &&
          effect.modifiers.some((modifier) => modifier.type === "RANGED_IGNORE_PENALTY")
      ))
  ) {
    rollMode = "normal";
  }


  const activeAttackBonus = getActiveAttackBonus(state, {
    attacker,
    defender,
    attackKind
  });
  // Cyra's Haste VI: +Defense only against an attacker slower than the defender.
  const conditionalDefenseBonus = getConditionalDefenseBonus(state, defender, attacker);
  // Shield / Air Shield: +Defense only against a ground-or-flying / ranged attacker.
  const attackerTypeDefenseBonus = getAttackerTypeDefenseBonus(state, defender, attacker);
  const activeDefenseBonus =
    getActiveDefenseBonus(state, defender) + conditionalDefenseBonus + attackerTypeDefenseBonus;
  const abilityAttack = stackItem.action.type === "ATTACK_UNIT" ? stackItem.action.abilityAttack : undefined;

  // Combat tokens: Attack/Weakness tokens shift the attacker, Corrosion the
  // defender (already floored so printed defense never drops below 0).
  const tokenAttack = tokenAttackBonus(attacker);
  const tokenDefense = tokenDefenseDelta(defender);

  // Magic Mirror bounced an instant Curse/Weakness onto a unit: a one-shot stat
  // delta that applies to this exact attack (and its retaliation, carried on the
  // attackSequence) — read straight off the stack item like the instant it is.
  const redirectedInstants = stackItem.modifiers.redirectedInstants ?? [];
  const redirectedAttackDelta = redirectedInstants.reduce(
    (sum, entry) => (entry.stat === "attack" && entry.unitId === attacker.id ? sum + entry.amount : sum),
    0
  );
  const redirectedDefenseDelta = redirectedInstants.reduce(
    (sum, entry) => (entry.stat === "defense" && entry.unitId === defender.id ? sum + entry.amount : sum),
    0
  );

  // Attack-card "ability lowers the target's defense" sources, applied after
  // corrosion, never on retaliations or printed follow-up attacks: Behemoths'
  // flat crush, and the Manticore "ignore the target's printed Defense" (which
  // subtracts the defender's printed Defense value). Both are floored together
  // so the effective Defense never drops below 0.
  const defenseBonusBeforeAbility =
    stackItem.modifiers.defenseBonus + activeDefenseBonus + tokenDefense + redirectedDefenseDelta;
  const defenseReductionSource =
    !isRetaliation && !abilityAttack ? getAttackDefenseReductionAbility(attacker) : null;
  const ignoreCardDefenseSource =
    !isRetaliation && !abilityAttack ? getIgnoreTargetCardDefenseAbility(attacker) : null;
  // The Defend roll's +1 is a separate per-attack shield resolved at damage
  // time, not part of the printed/buffed Defense an ability (Behemoth crush,
  // Manticore "ignore printed Defense") can reduce — so it stays out of this
  // clamp and is simply added on top afterwards.
  const currentDefenseValue = Math.max(0, defender.defense + defenseBonusBeforeAbility);
  const requestedDefenseReduction =
    (defenseReductionSource?.amount ?? 0) + (ignoreCardDefenseSource ? defender.defense : 0);
  const defenseReductionAmount = Math.min(requestedDefenseReduction, currentDefenseValue);
  const reductionAbilitySource = defenseReductionSource ?? ignoreCardDefenseSource;
  const defenseReductionAbility =
    reductionAbilitySource && defenseReductionAmount > 0
      ? {
          abilityId: reductionAbilitySource.abilityId,
          abilityName: reductionAbilitySource.abilityName,
          amount: defenseReductionAmount
        }
      : undefined;

  // Ghost Dragons (Pack): "Add +1 to your Attack die result" on every attack
  // and Retaliation Attack this unit makes.
  const attackDieResultBonus = getAttackDieResultBonus(attacker);

  // "Hatred" grudge bonus (Archangels ↔ Arch Devils, Genies → Efreet, Titans →
  // Black Dragons): extra Attack when this unit attacks the named creature.
  const hatredAttackBonus = getAttackBonusVsDefenderName(attacker, defender.name);

  // Retaliation-only modifiers keyed off the retaliation's defender — i.e. the
  // original attacker being struck back: Dread Knights gain Defense, Dragon
  // Flies sap the retaliator's Attack.
  const retaliationDefenseBonus = isRetaliation ? getDefenseBonusWhenRetaliated(defender) : 0;
  const retaliationAttackPenalty = isRetaliation ? getRetaliationAgainstAttackPenalty(defender) : 0;

  // Elemental damage (Elemental units, Moandor's Liches VI specialty): the
  // unit's attack value cannot be RAISED by attack cards (Bloodlust, Offense,
  // the Attack statistic, Bless's bonus…) or by Attack tokens — only LOWERED
  // by debuffs such as a Sorceress' Weakness. Clamp the positive card/token
  // contributions to 0 while leaving every negative one (and the printed
  // attack) intact.
  const dealsElemental = unitDealsElementalDamage(state, attacker);
  const cardAttackBonus = stackItem.modifiers.attackBonus + activeAttackBonus + redirectedAttackDelta;
  const effectiveCardAttackBonus = dealsElemental ? Math.min(0, cardAttackBonus) : cardAttackBonus;
  const effectiveTokenAttack = dealsElemental ? Math.min(0, tokenAttack) : tokenAttack;

  return {
    attacker,
    defender,
    isRetaliation,
    attackKind,
    rollMode,
    attackBonus:
      // Elemental units clamp card/token buffs to ≤0 (main); innate ability
      // bonuses (Ghost Dragon die result, Hatred) are added unclamped.
      effectiveCardAttackBonus +
      effectiveTokenAttack +
      attackDieResultBonus +
      hatredAttackBonus -
      retaliationAttackPenalty,
    defenseBonus: defenseBonusBeforeAbility - defenseReductionAmount + retaliationDefenseBonus,
    dieMultiplier: stackItem.modifiers.attackDieMultiplier ?? 1,
    // Elemental damage never rolls the Attack die and ignores Defense entirely:
    // the hit always lands for the (un-buffable) Attack value.
    // Mummies "ignore the result on the Attack die" — their own attack die is
    // treated as 0, exactly like Bless / Elemental damage.
    ignoreAttackDie: Boolean(stackItem.modifiers.ignoreAttackDie) || dealsElemental || hasIgnoreOwnAttackDie(attacker),
    // Frenzy: legacy fixed-grade sets modifiers.ignoreDefense outright; the
    // Power-scaled form re-derives its pierced grade now from the caster's final
    // pooled Power, so Power paid after Frenzy was played still counts. Elemental
    // damage ignores Defense innately.
    ignoreDefense: dealsElemental || Boolean(stackItem.modifiers.ignoreDefense) || frenzyPierces(stackItem, defender),
    damageReduction: siegeRangedDamageReduction(combat, attacker, defender, attackKind),
    defenseReductionAbility,
    abilityAttack
  };
}

function getRerollUsesForEffect(effect: ActiveEffectState): number {
  return effect.modifiers
    .filter((modifier) => modifier.type === "ATTACK_DIE_REROLL")
    .reduce((best, modifier) => Math.max(best, modifier.maxUsesPerRoll), 0);
}

/**
 * Builds the spend-ordered reroll pools for one attack roll. Rerolls from
 * different sources stack: unit abilities (e.g. Crusaders) are spent first,
 * then one-shot effects like Fortune, Luck is spent late, and the positive
 * morale token ("Reroll any Die you have thrown") is always kept for last.
 */
function buildRerollSources(
  state: GameState,
  attacker: CombatUnitState,
  rerollEffects: ActiveEffectState[],
  /** Whether the attacker moved this attack — gates Champions' "Charge" reroll. */
  moved = false
): AttackRerollSource[] {
  const abilitySources: AttackRerollSource[] = getUnitAttackRerollSources(attacker, moved).map((source) => ({
    name: source.name,
    remaining: source.rerolls,
    used: 0,
    ...(source.onlyOnRoll !== undefined ? { onlyOnRoll: source.onlyOnRoll } : {})
  }));

  const orderedEffects = [...rerollEffects].sort(
    (left, right) => Number(left.name.includes("Luck")) - Number(right.name.includes("Luck"))
  );

  const player = state.players[attacker.controllerId];
  const moraleSources: AttackRerollSource[] =
    state.mode === "adventure" && player && player.morale > 0
      ? [{ name: "Positive morale token", morale: true, remaining: 1, used: 0 }]
      : [];

  return [
    ...abilitySources,
    ...orderedEffects.map((effect) => ({
      name: effect.name,
      effectId: effect.id,
      remaining: getRerollUsesForEffect(effect),
      used: 0
    })),
    ...moraleSources
  ].filter((source) => source.remaining > 0);
}

/** Rerolls left to offer, given the roll currently showing. */
function countAvailableRerolls(sources: AttackRerollSource[], currentRoll: number): number {
  return sources.reduce((total, source) => {
    if (!rerollSourceAvailableFor(source, currentRoll)) {
      return total;
    }
    // Face-gated sources never deplete — count them as one offer each.
    return total + (source.onlyOnRoll !== undefined ? 1 : source.remaining);
  }, 0);
}

function openAttackRerollChoice(
  state: GameState,
  stackItem: ResolutionStackItem,
  details: NonNullable<ReturnType<typeof getAttackStackDetails>>,
  candidate: AttackRollCandidate,
  rerollSources: AttackRerollSource[]
): void {
  const choiceId = `choice_${nextEventNumber(state)}`;
  const remainingRerolls = countAvailableRerolls(rerollSources, candidate.roll);
  const sourceEffectIds = rerollSources.flatMap((source) => (source.effectId ? [source.effectId] : []));

  state.pendingChoice = {
    id: choiceId,
    type: "ATTACK_DIE_REROLL",
    playerId: details.attacker.controllerId,
    stackItemId: stackItem.id,
    attackerId: details.attacker.id,
    defenderId: details.defender.id,
    isRetaliation: details.isRetaliation,
    attackKind: details.attackKind,
    rollMode: details.rollMode,
    attackBonus: details.attackBonus,
    defenseBonus: details.defenseBonus,
    candidates: [candidate],
    remainingRerolls,
    rerollSources,
    sourceEffectIds
  };
  state.phase = "choice";
  state.priorityPlayerId = details.attacker.controllerId;

  appendEvent(state, {
    type: "PENDING_CHOICE_CREATED",
    choiceId,
    choiceType: "ATTACK_DIE_REROLL",
    playerId: details.attacker.controllerId,
    sourceEffectIds,
    message: `${details.attacker.name} may reroll the attack die.`
  });
}

function closePendingChoice(
  state: GameState,
  choice: Extract<NonNullable<PendingChoice>, { type: "ATTACK_DIE_REROLL" }>,
  selectedIndex: number
): void {
  // Rerolling is optional: only the sources actually spent are marked used,
  // so declining a reroll keeps one-shot effects like Fortune available.
  const usedEffectIds = new Set(
    choice.rerollSources
      .filter((source) => source.used > 0 && source.effectId)
      .map((source) => source.effectId as string)
  );

  for (const effectId of usedEffectIds) {
    const effect = state.activeEffects.find((candidate) => candidate.id === effectId);
    if (!effect) {
      continue;
    }

    effect.usedChoiceIds.push(choice.id, choice.stackItemId);
    effect.usedRollEventIds.push(choice.id);
  }

  const consumedEffectIds = new Set(
    state.activeEffects
      .filter((effect) => usedEffectIds.has(effect.id))
      .filter((effect) =>
        effect.modifiers.some(
          (modifier) => modifier.type === "ATTACK_DIE_REROLL" && modifier.consumeEffectOnUse
        )
      )
      .map((effect) => effect.id)
  );

  if (consumedEffectIds.size > 0) {
    state.activeEffects = state.activeEffects.filter((effect) => !consumedEffectIds.has(effect.id));
  }

  appendEvent(state, {
    type: "PENDING_CHOICE_RESOLVED",
    choiceId: choice.id,
    playerId: choice.playerId,
    selectedIndex
  });

  state.pendingChoice = null;
}

/**
 * After an attack sequence (including any retaliation) finishes, the attacker
 * may still owe actions: a ranged unit may step 1 space after shooting, and
 * double-attack units strike the same target a second time. Otherwise the
 * activation ends and the next unit comes up.
 */
function concludeAttackerActivation(state: GameState, attacker: CombatUnitState): void {
  const combat = state.combat;

  // Harpies' "Strike and Return": once the attack (and the enemy's Retaliation
  // Attack, if any) has resolved, the harpy may fly back to the space it moved
  // from. A neutral always returns; a player is asked to return or stay.
  if (combat) {
    const origin = harpyReturnOrigin(combat, attacker);
    if (origin !== null) {
      if (isNeutralUnit(attacker)) {
        moveUnitToOrigin(state, attacker, origin);
        // fall through to end the activation
      } else {
        openHarpyReturnChoice(state, attacker, origin);
        return;
      }
    }
  }

  const canRangedReposition =
    Boolean(combat) &&
    combat !== null &&
    attacker.type === "ranged" &&
    isUnitAlive(attacker) &&
    !attacker.movedThisActivation &&
    !attacker.activatedThisRound &&
    getLegalMoveDestinations(combat, attacker, state).length > 0;

  if (canRangedReposition) {
    // Keep the shooter active so the player may move it after firing.
    state.phase = "combat";
    state.priorityPlayerId = null;
    return;
  }

  attacker.activatedThisRound = true;
  // Activation-bound effects on the attacker end with its activation (Berserk's
  // "in its activation" forced attack, any "this Activation" buff).
  appendExpiredEffectEvents(state, expireEffectsForActivationEnd(state, attacker.id), "activation-ended");
  advanceActiveUnit(state);
  state.phase = "combat";
  state.priorityPlayerId = null;
}

/**
 * Harpies' fly-back: the space the unit moved from this activation, if it has
 * the "Strike and Return" ability, moved to attack, is still alive, and that
 * origin space is free to land on. Returns null when no return is possible.
 */
function harpyReturnOrigin(combat: CombatState, attacker: CombatUnitState): number | null {
  if (!getReturnAfterAttackAbility(attacker) || !isUnitAlive(attacker)) {
    return null;
  }
  const origin = attacker.activationStartPosition;
  if (origin === undefined || !attacker.movedThisActivation || origin === attacker.position) {
    return null;
  }
  if (combat.obstacles?.includes(origin)) {
    return null;
  }
  const occupied = Object.values(combat.units).some(
    (unit) => unit.id !== attacker.id && isUnitAlive(unit) && unit.position === origin
  );
  return occupied ? null : origin;
}

/** Flies a unit back to its activation's starting space (Harpy return). */
function moveUnitToOrigin(state: GameState, unit: CombatUnitState, origin: number): void {
  const from = unit.position;
  unit.position = origin;
  unit.movedThisActivation = true;
  appendEvent(state, {
    type: "UNIT_MOVED",
    playerId: unit.controllerId,
    unitId: unit.id,
    from,
    to: origin
  });
}

/** Opens the player's "fly back or stay" choice after a Harpy's attack. */
function openHarpyReturnChoice(state: GameState, unit: CombatUnitState, origin: number): void {
  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "OPTION_CHOICE",
    playerId: unit.controllerId,
    prompt: `${unit.cardName}: fly back to ${getBattlefieldLabel(origin)} or hold at ${getBattlefieldLabel(unit.position)}?`,
    options: [
      { label: `Fly back to ${getBattlefieldLabel(origin)}` },
      { label: `Stay at ${getBattlefieldLabel(unit.position)}` }
    ],
    context: "combat-reposition",
    reposition: { unitId: unit.id, originPosition: origin },
    returnPhase: "combat"
  };
  state.phase = "choice";
  state.priorityPlayerId = unit.controllerId;

  appendEvent(state, {
    type: "PENDING_CHOICE_CREATED",
    choiceId,
    choiceType: "ABILITY_TARGET_CHOICE",
    playerId: unit.controllerId,
    sourceEffectIds: [],
    message: `${unit.cardName} may return to ${getBattlefieldLabel(origin)} after its attack.`
  });
}

/**
 * Resolves the Harpy "Strike and Return" choice: option 0 flies the unit back
 * to its origin, option 1 leaves it where it attacked. Either way the
 * activation then ends.
 */
function resolveCombatReposition(
  state: GameState,
  action: Extract<GameAction, { type: "CHOOSE_OPTION" }>
): void {
  const choice = state.pendingChoice;
  if (
    !choice ||
    choice.type !== "OPTION_CHOICE" ||
    choice.context !== "combat-reposition" ||
    choice.id !== action.choiceId ||
    choice.playerId !== action.playerId ||
    !choice.reposition
  ) {
    throw new Error("There is no repositioning choice to resolve.");
  }

  const combat = state.combat;
  const unit = combat?.units[choice.reposition.unitId];
  if (!combat || !unit) {
    throw new Error("Combat is not active.");
  }

  if (action.optionIndex === 0 && harpyReturnOrigin(combat, unit) === choice.reposition.originPosition) {
    moveUnitToOrigin(state, unit, choice.reposition.originPosition);
  }

  appendEvent(state, {
    type: "PENDING_CHOICE_RESOLVED",
    choiceId: choice.id,
    playerId: action.playerId,
    selectedIndex: action.optionIndex
  });

  state.pendingChoice = null;
  unit.activatedThisRound = true;
  advanceActiveUnit(state);
  if (!state.pendingChoice) {
    state.phase = "combat";
    state.priorityPlayerId = null;
  }
}

/**
 * Marksmen/Elves style abilities: after their first attack against a
 * non-adjacent target, attack the same target again — exactly once, so the
 * second attack never triggers a third.
 */
function maybeDeclareDoubleAttack(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  attackKind: "melee" | "ranged",
  roll: number,
  cards: CardLibrary
): boolean {
  if (attackKind !== "ranged" || (attacker.attacksThisActivation ?? 0) !== 1) {
    return false;
  }

  const doubleAttack = getDoubleAttackAbility(attacker);
  if (!doubleAttack) {
    return false;
  }

  if (doubleAttack.maxRoll !== undefined && roll > doubleAttack.maxRoll) {
    return false;
  }

  if (!isUnitAlive(attacker) || !isUnitAlive(defender) || isAdjacent(attacker.position, defender.position)) {
    return false;
  }

  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: attacker.id,
    abilityId: doubleAttack.abilityId,
    targetUnitId: defender.id,
    message: `${attacker.name} attack ${defender.name} a second time.`
  });

  declareAttack(
    state,
    {
      type: "ATTACK_UNIT",
      playerId: attacker.controllerId,
      attackerId: attacker.id,
      defenderId: defender.id
    },
    cards
  );
  return true;
}

function getAfterRetaliationAttack(
  attacker: CombatUnitState,
  defender: CombatUnitState
): { abilityId: string; abilityName: string; targetUnitId: UnitId } | undefined {
  if ((attacker.attacksThisActivation ?? 0) !== 1 || !isUnitAlive(attacker) || !isUnitAlive(defender)) {
    return undefined;
  }

  const ability = getAfterRetaliationAttackAbility(attacker);
  return ability ? { ...ability, targetUnitId: defender.id } : undefined;
}

/**
 * The Defend action's per-attack shield: a defending unit rolls one Attack die
 * each time it is struck and only gains +1 Defense on a "+1" face. The roll is
 * taken once and stashed on the stack item, so the lethal-save window resumes
 * on the same outcome and an attacker's reroll never re-rolls it. It is skipped
 * when the attack ignores Defense (Elemental damage), where the shield is moot.
 */
/**
 * Neutral Halberdiers' "Phalanx": a living friendly unit adjacent to the
 * defender lends it a virtual Defense token. The aura never benefits the
 * Halberdiers' enemies and never the defender from itself.
 */
function hasAdjacentDefenseAura(state: GameState, defender: CombatUnitState): boolean {
  const combat = state.combat;
  if (!combat) {
    return false;
  }
  return Object.values(combat.units).some(
    (unit) =>
      unit.id !== defender.id &&
      unit.controllerId === defender.controllerId &&
      isUnitAlive(unit) &&
      isAdjacent(unit.position, defender.position) &&
      hasDefenseTokenAura(unit)
  );
}

function resolveDefendBonus(
  state: GameState,
  stackItem: ResolutionStackItem,
  details: NonNullable<ReturnType<typeof getAttackStackDetails>>
): { roll: number; bonus: number } | null {
  // A real Defense token, or a virtual one from an adjacent Halberdier's
  // "Phalanx" aura, lets the defender roll the Defend die (a "+1" face → +1
  // Defense). The shield is moot when the attack ignores Defense (Elemental).
  const hasShield = details.defender.defenseToken || hasAdjacentDefenseAura(state, details.defender);
  if (!hasShield || details.ignoreDefense) {
    return null;
  }
  const combat = state.combat;
  if (!combat) {
    return null;
  }
  if (stackItem.modifiers.defendRoll === undefined) {
    stackItem.modifiers.defendRoll = rollAttackDie(combat);
  }
  const roll = stackItem.modifiers.defendRoll;
  return { roll, bonus: roll === 1 ? 1 : 0 };
}

/**
 * Vampires: "[unit_attack] …then remove up to N damage from this unit." The
 * self-heal lands after the unit's own attack — never a Retaliation Attack —
 * and is capped at the damage currently on the unit.
 */
function applyOnAttackSelfHeal(state: GameState, attacker: CombatUnitState, isRetaliation: boolean): void {
  if (isRetaliation) {
    return;
  }
  const heal = getOnAttackSelfHeal(attacker);
  if (!heal || attacker.damage <= 0) {
    return;
  }
  const healed = Math.min(heal.amount, attacker.damage);
  attacker.damage = Math.max(0, attacker.damage - heal.amount);
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: attacker.id,
    abilityId: heal.abilityId,
    message: `${attacker.cardName} drains life and heals ${healed} damage.`
  });
  appendEvent(state, {
    type: "DAMAGE_HEALED",
    source: { type: "unit", unitId: attacker.id, controllerId: attacker.controllerId },
    target: { type: "unit", unitId: attacker.id },
    amount: healed
  });
}

function finishResolvedAttack(
  state: GameState,
  stackItem: ResolutionStackItem,
  details: NonNullable<ReturnType<typeof getAttackStackDetails>>,
  candidate: AttackRollCandidate,
  cards: CardLibrary
): void {
  // A defending defender rolls its Defense die now (once, then reused), so the
  // lethal-save preview and the resolved hit agree on whether the shield held.
  const defend = resolveDefendBonus(state, stackItem, details);
  const defendBonus = defend?.bonus ?? 0;

  // Shield of the Dwarven Lords: the defender ignored the rolled die. The face
  // counts as 0 (so it adds nothing to the attack) and the lethal-save preview,
  // the resolved hit and the die-triggered abilities below all read it the same.
  const dieCancelled = Boolean(stackItem.modifiers.attackDieCancelled);
  const resolvedCandidate: AttackRollCandidate = dieCancelled
    ? { rolls: candidate.rolls, roll: 0 }
    : candidate;

  // Alamar's Resurrection: before a killing normal attack lands, pause once and
  // ask the defender's controller whether to cancel it (only if they can). The
  // rolled die is stashed so the resumed attack uses the same outcome. A Clone is
  // destroyed by any damage by rule and cannot be rescued, so it is never offered
  // a lethal save (the post-damage hook then removes it for being attacked).
  if (
    !details.defender.cloneOfUnitId &&
    !stackItem.modifiers.lethalSaveOffered &&
    playerHasLethalSave(state, details.defender.id, cards)
  ) {
    const preview = getAttackDamagePreview(
      details.attacker,
      details.defender,
      resolvedCandidate.roll,
      details.attackBonus,
      details.defenseBonus,
      defendBonus,
      details.dieMultiplier,
      details.abilityAttack?.baseAttack,
      details.damageReduction,
      details.ignoreDefense,
      dieCancelled
    );
    if (preview.damage > 0 && details.defender.damage + preview.damage >= details.defender.maxHealth) {
      stackItem.modifiers.rolledCandidate = candidate;
      stackItem.modifiers.lethalSaveOffered = true;
      const lethalEvent = appendEvent(state, {
        type: "UNIT_LETHAL_HIT",
        attackerId: details.attacker.id,
        defenderId: details.defender.id
      });
      if (openReactionWindowForTrigger(state, stackItem, lethalEvent, cards)) {
        return;
      }
      stackItem.modifiers.rolledCandidate = undefined;
    }
  }

  if (details.defenseReductionAbility) {
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: details.attacker.id,
      abilityId: details.defenseReductionAbility.abilityId,
      targetUnitId: details.defender.id,
      message: `${details.attacker.name} lowers ${details.defender.name}'s defense by ${details.defenseReductionAbility.amount}.`
    });
  }

  const cancelLethal = stackItem.modifiers.cancelLethal;
  const lethalCancel =
    cancelLethal && cancelLethal.unitId === details.defender.id ? { grade: cancelLethal.grade } : undefined;
  const attackResult = applyAttackDamageFromCandidate(
    state,
    details.attacker,
    details.defender,
    details.isRetaliation,
    details.rollMode,
    details.attackBonus,
    details.defenseBonus,
    defendBonus,
    defend?.roll,
    resolvedCandidate,
    details.dieMultiplier,
    details.abilityAttack?.baseAttack,
    details.damageReduction,
    lethalCancel,
    details.ignoreDefense,
    details.ignoreAttackDie,
    dieCancelled
  );

  // Alamar's Resurrection cancelled the whole attack: the attacker still spent
  // its strike, but no damage, no on-attack abilities, and no Retaliation
  // Attack follow. Conclude the activation straight away.
  if (attackResult.cancelled) {
    if (details.isRetaliation) {
      details.attacker.retaliatedThisRound = true;
    } else {
      details.attacker.attackedThisActivation = true;
      details.attacker.attacksThisActivation = (details.attacker.attacksThisActivation ?? 0) + 1;
    }
    stackItem.status = "resolved";
    state.stack.pop();
    if (finishCombatIfNeeded(state)) {
      return;
    }
    if (details.isRetaliation && state.combat?.attackSequence?.attackerId === details.defender.id) {
      state.combat.attackSequence = null;
    }
    concludeAttackerActivation(state, details.isRetaliation ? details.defender : details.attacker);
    return;
  }

  applyOnAttackTokens(state, details.attacker, details.defender, details.isRetaliation);
  applyOnAttackPoisonCubes(state, details.attacker, details.defender, details.isRetaliation);
  applyDendroidBindFx(state, details.attacker, details.defender, details.isRetaliation);
  // Shield of the Dwarven Lords ignored the die "and any additional effects it
  // triggered": skip every die-face-conditioned follow-up — the Azure/Basilisk
  // paralysis and die tokens, the Minotaurs' draw, and the ranged low-roll bolt.
  if (!dieCancelled) {
    applyOnAttackDieTokens(state, details.attacker, details.defender, attackResult.roll, details.isRetaliation);
    // Dungeon Minotaurs: draw a card when this unit's Attack die resolves "-1".
    applyOnAttackDieDraw(state, details.attacker, attackResult.roll);
    applyPostAttackAbilityDamage(
      state,
      details.attacker,
      details.defender,
      details.attackKind,
      attackResult.roll,
      attackResult.damage
    );
  }
  applyFireShieldDamage(state, details.attacker, details.defender, details.attackKind);
  // Vampires: drain life back to themselves after their own attack.
  applyOnAttackSelfHeal(state, details.attacker, details.isRetaliation);

  if (details.isRetaliation) {
    details.attacker.retaliatedThisRound = true;
    // Medusas: paralysis inflicted by this unit's own Retaliation Attack.
    applyRetaliationParalysis(state, details.attacker, details.defender);
  } else {
    details.attacker.attackedThisActivation = true;
    details.attacker.attacksThisActivation = (details.attacker.attacksThisActivation ?? 0) + 1;
  }

  stackItem.status = "resolved";
  state.stack.pop();

  if (finishCombatIfNeeded(state)) {
    return;
  }

  if (details.isRetaliation) {
    // The retaliation has resolved; hand the activation back to the original
    // attacker, who may still owe a post-attack step (ranged units).
    if (declareAfterRetaliationAbilityAttack(state, cards)) {
      return;
    }
    if (state.combat?.attackSequence?.attackerId === details.defender.id) {
      state.combat.attackSequence = null;
    }
    const originalAttacker = details.defender;
    concludeAttackerActivation(state, originalAttacker);
    return;
  }

  if (details.abilityAttack) {
    // Printed follow-up attacks never chain further follow-ups or their own
    // retaliations (wiki FAQ). BINH Cerberi may still owe more queued
    // follow-up attacks; otherwise pick the parked sequence back up — the
    // original target's retaliation fires only now.
    if (declareNextQueuedAbilityAttack(state, cards)) {
      return;
    }
    if (!state.combat?.attackSequence) {
      concludeAttackerActivation(state, details.attacker);
      return;
    }
    resumeAttackSequence(state, cards);
    return;
  }

  const combat = state.combat;
  if (combat) {
    combat.attackSequence = {
      attackerId: details.attacker.id,
      defenderId: details.defender.id,
      attackKind: details.attackKind,
      retaliationPending: shouldRetaliate(details.attacker, details.defender, details.attackKind),
      afterRetaliationAbilityAttack: getAfterRetaliationAttack(details.attacker, details.defender),
      // A Magic-Mirror-bounced Curse/Weakness on this attack carries to the
      // retaliation so it strikes the new target there too, then is gone.
      ...(stackItem.modifiers.redirectedInstants
        ? { redirectedInstants: stackItem.modifiers.redirectedInstants }
        : {})
    };
  }

  // Printed flat-damage follow-ups (Magog splash, Cerberi second head)
  // resolve before retaliation; a target choice pauses the sequence here.
  if (openFlatDamageFollowUps(state, details.attacker, details.defender, details.attackKind)) {
    return;
  }

  if (applyAttackDieDamageFollowUps(state, details.attacker, details.defender)) {
    return;
  }

  // Gorgons' Death Stare: roll the extra dice and possibly reduce the target to
  // 0 Health before retaliation.
  if (applyDeathStareFollowUps(state, details.attacker, details.defender)) {
    return;
  }

  // Azure Dragons / Basilisks: paralyse the target on a matching Attack die.
  applyParalysisFollowUps(state, details.attacker, details.defender, attackResult.roll);

  // Dragon Flies: dispel the enemy's ongoing buffs on the target.
  applyDispelFollowUps(state, details.attacker, details.defender);

  if (maybeDeclareDoubleAttack(state, details.attacker, details.defender, details.attackKind, attackResult.roll, cards)) {
    return;
  }

  // Liches' Death Cloud: a full second attack against a unit adjacent to the
  // original target, resolved before the original target's retaliation.
  if (openSecondAttackFollowUp(state, details.attacker, details.defender, cards)) {
    return;
  }

  // Gold Dragons' line attack: a separate attack on the unit directly behind
  // the target, resolved before the original target's retaliation.
  if (openGoldDragonLineAttack(state, details.attacker, details.defender, cards)) {
    return;
  }

  // Hydras: one more separate attack against an enemy adjacent to the Hydra.
  if (openHydraSecondAttack(state, details.attacker, details.defender, cards)) {
    return;
  }

  // Cerberi attack-all mechanism (kept for the engine's multi-attack queue;
  // no boxed unit uses it now that Cerberi follow the printed card).
  if (queueAttackAllFollowUps(state, details.attacker, details.defender, cards)) {
    return;
  }

  // Neutral Magi Power Drain: the defending player picks a Power card to
  // discard or takes a random discard. Pauses the parked retaliation when a
  // real choice exists.
  if (openMagiDiscardChoice(state, details.attacker, details.defender, cards)) {
    return;
  }

  // Tower Genies (Pack): after their attack, dig Spells out of the controller's
  // deck. Pauses the parked retaliation when several Spells offer a choice.
  if (openGenieSpellDraw(state, details.attacker, details.isRetaliation)) {
    return;
  }

  // Ghost Dragons (neutral): roll for the knock-back last — moving the target
  // out of reach is what denies its Retaliation Attack, so it must resolve
  // before the parked retaliation. Pauses when the defender has a real choice
  // of empty spaces.
  if (openGhostDragonKnockback(state, details.attacker, details.defender)) {
    return;
  }

  resumeAttackSequence(state, cards);
}

/**
 * Token-on-attack abilities (Pack Sorceresses' Weakness, Pack Behemoths'
 * Corrosion): after this unit's own attack — never a retaliation — the
 * original target gains the printed token, even if the attack dealt 0 damage.
 */
function applyOnAttackTokens(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  isRetaliation: boolean
): void {
  if (isRetaliation || !state.combat || !isUnitAlive(defender)) {
    return;
  }

  for (const ability of getUnitAbilityDefinitions(attacker)) {
    if (ability.implementationStatus !== "implemented" || ability.effect?.type !== "ON_ATTACK_TOKEN") {
      continue;
    }

    placeCombatToken(state, defender, ability.effect.token, ability.effect.amount, ability.name, ability.effect.rounds);
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: attacker.id,
      abilityId: ability.id,
      targetUnitId: defender.id,
      message: `${attacker.cardName} marks ${defender.cardName} with a ${ability.name}.`
    });
  }
}

/**
 * Fortress Wyverns' poison: after the Wyvern's own attack (never a retaliation)
 * the still-living target gains the printed faction cubes. They ride the target
 * and bleed it 1 each time it activates (see `applyPoisonCubesAtActivation`).
 * Cubes from repeated Wyvern hits accumulate.
 */
function applyOnAttackPoisonCubes(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  isRetaliation: boolean
): void {
  if (isRetaliation || !state.combat || !isUnitAlive(defender)) {
    return;
  }

  const poison = getOnAttackPoisonCubes(attacker);
  if (!poison) {
    return;
  }

  defender.poisonCubes = (defender.poisonCubes ?? 0) + poison.count;
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: attacker.id,
    abilityId: poison.abilityId,
    targetUnitId: defender.id,
    message: `${attacker.cardName} plants ${poison.count} poison cube${poison.count === 1 ? "" : "s"} on ${defender.cardName}.`
  });
}

/**
 * Fortress Wyverns' poison tick: at the beginning of the poisoned unit's
 * activation one cube is removed and the unit takes 1 damage. Returns true when
 * the tick removed the unit (so the caller ends its activation). No-op when the
 * unit carries no cubes.
 */
function applyPoisonCubesAtActivation(state: GameState, unit: CombatUnitState): boolean {
  const cubes = unit.poisonCubes ?? 0;
  if (cubes <= 0 || !isUnitAlive(unit)) {
    return false;
  }

  unit.poisonCubes = cubes - 1;
  const assigned = Math.min(1, Math.max(0, unit.maxHealth - unit.damage));
  unit.damage += 1;
  noteUnitDamagedForTokens(state, unit, 1);
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: unit.id,
    abilityId: "wyvern-poison-cube",
    targetUnitId: unit.id,
    message: `Poison bleeds ${unit.cardName} for 1 damage (${unit.poisonCubes} cube${unit.poisonCubes === 1 ? "" : "s"} left).`
  });
  if (assigned > 0) {
    appendEvent(state, {
      type: "DAMAGE_ASSIGNED",
      source: { type: "system" },
      target: { type: "unit", unitId: unit.id },
      amount: assigned,
      damageKind: "effect"
    });
  }
  markUnitRemovedIfNeeded(state, unit);
  return !isUnitAlive(unit);
}

/**
 * Rampart Dendroids' Bind: the root mechanic is a passive aura enforced in
 * movement legality, but its visual/sound plays as the Dendroid attacks — roots
 * lash out at the struck target. Cosmetic only: emits the ability event the FX
 * layer keys off (never on a retaliation).
 */
function applyDendroidBindFx(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  isRetaliation: boolean
): void {
  if (isRetaliation || !state.combat || !hasBindAdjacentEnemies(attacker) || !isUnitAlive(defender)) {
    return;
  }
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: attacker.id,
    abilityId: "dendroid-bind",
    targetUnitId: defender.id,
    message: `${attacker.cardName}'s roots ensnare ${defender.cardName}.`
  });
}

/**
 * Fire Shield: when an adjacent (melee) attack resolves against a shielded
 * unit, the attacker takes the shield's damage before anything else follows.
 */
function applyFireShieldDamage(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  attackKind: "melee" | "ranged"
): void {
  if (attackKind !== "melee" || !state.combat || !isUnitAlive(attacker)) {
    return;
  }

  let total = 0;
  for (const effect of state.activeEffects) {
    if (effect.target?.type !== "unit" || effect.target.unitId !== defender.id) {
      continue;
    }
    for (const modifier of effect.modifiers) {
      if (modifier.type === "FIRE_SHIELD") {
        total += modifier.amount;
      }
    }
  }

  if (total <= 0) {
    return;
  }

  attacker.damage += total;
  noteUnitDamagedForTokens(state, attacker, total);
  appendEvent(state, {
    type: "DAMAGE_ASSIGNED",
    source: { type: "unit", unitId: defender.id, controllerId: defender.controllerId },
    target: { type: "unit", unitId: attacker.id },
    amount: total,
    damageKind: "effect"
  });
  markUnitRemovedIfNeeded(state, attacker);
}

/**
 * Thunderbirds' lightning / Wyverns' sting: roll one extra Attack die after the
 * attack and before the parked retaliation, dealing flat damage when the face
 * falls in the ability's window (Thunderbirds 0/+1, Wyverns exactly 0). The
 * roll is deterministic through the same combat dice stream as normal attacks.
 */
function applyAttackDieDamageFollowUps(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState
): boolean {
  const combat = state.combat;
  if (!combat || !isUnitAlive(attacker) || !isUnitAlive(defender)) {
    return false;
  }

  const followUps = getAttackDieDamageFollowUps(attacker);
  for (const followUp of followUps) {
    if (!isUnitAlive(defender)) {
      break;
    }

    const candidate = rollAttackCandidate(combat, "normal");
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: attacker.id,
      abilityId: followUp.abilityId,
      targetUnitId: defender.id,
      message: `${attacker.name} rolls ${candidate.roll} for ${followUp.abilityName}.`
    });

    if (candidate.roll < followUp.minRoll || (followUp.maxRoll !== undefined && candidate.roll > followUp.maxRoll)) {
      continue;
    }

    const assignedDamage = Math.min(followUp.amount, Math.max(0, defender.maxHealth - defender.damage));
    defender.damage += followUp.amount;
    noteUnitDamagedForTokens(state, defender, followUp.amount);
    if (assignedDamage > 0) {
      appendEvent(state, {
        type: "DAMAGE_ASSIGNED",
        source: { type: "unit", unitId: attacker.id, controllerId: attacker.controllerId },
        target: { type: "unit", unitId: defender.id },
        amount: assignedDamage,
        damageKind: "effect"
      });
    }
    markUnitRemovedIfNeeded(state, defender);
  }

  return finishCombatIfNeeded(state);
}

/**
 * Rust Dragons' Acid Breath: when the unit's own attack resolves on its
 * `onRoll` face, place the printed token on the still-living target (a
 * Corrosion token shaves Defense for the rest of combat). Never on a
 * retaliation or a printed follow-up attack.
 */
function applyOnAttackDieTokens(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  attackRoll: number,
  isRetaliation: boolean
): void {
  if (isRetaliation || !state.combat || !isUnitAlive(defender)) {
    return;
  }
  for (const token of getOnAttackDieTokens(attacker)) {
    if (attackRoll !== token.onRoll) {
      continue;
    }
    placeCombatToken(state, defender, token.token, token.amount, token.abilityName);
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: attacker.id,
      abilityId: token.abilityId,
      targetUnitId: defender.id,
      message: `${attacker.cardName} corrodes ${defender.cardName} with ${token.abilityName}.`
    });
  }
}

/**
 * Dungeon Minotaurs: "If you resolve a '-1' on the Attack die, draw a card."
 * Fires after this unit's attack (or Retaliation Attack) resolves on the
 * matching face; the controller draws the printed number of cards. (The neutral
 * Minotaur rerolls the "-1" instead — it never carries this ability.)
 */
function applyOnAttackDieDraw(state: GameState, attacker: CombatUnitState, attackRoll: number): void {
  for (const draw of getOnAttackDieDraw(attacker)) {
    if (attackRoll !== draw.onRoll) {
      continue;
    }
    drawCardsForPlayer(state, attacker.controllerId, draw.amount);
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: attacker.id,
      abilityId: draw.abilityId,
      message: `${attacker.name} draws ${draw.amount} card${draw.amount === 1 ? "" : "s"} (${draw.abilityName}).`
    });
  }
}

/**
 * Gorgons' Death Stare: after the attack, roll `diceCount` Attack dice; when
 * every one shows `onRoll`, the still-living target's current side is reduced
 * to 0 Health (a Pack flips to its Few side as usual). Returns true when the
 * combat ended as a result.
 */
function applyDeathStareFollowUps(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState
): boolean {
  const combat = state.combat;
  if (!combat || !isUnitAlive(attacker) || !isUnitAlive(defender)) {
    return false;
  }

  for (const followUp of getDeathStareFollowUps(attacker)) {
    if (!isUnitAlive(defender)) {
      break;
    }
    const rolls = Array.from({ length: Math.max(1, followUp.diceCount) }, () => rollAttackDie(combat));
    const petrifies = rolls.every((roll) => roll === followUp.onRoll);
    // One ability event per stare (drives the FX/sound once): its message
    // carries the outcome so the log reads correctly and tests can assert it.
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: attacker.id,
      abilityId: followUp.abilityId,
      targetUnitId: defender.id,
      message: petrifies
        ? `${attacker.name}'s ${followUp.abilityName} (rolled ${rolls.join(", ")}) reduces ${defender.cardName} to 0 Health.`
        : `${attacker.name} rolls ${rolls.join(", ")} for ${followUp.abilityName}.`
    });
    if (!petrifies) {
      continue;
    }
    const lethal = Math.max(0, defender.maxHealth - defender.damage);
    defender.damage = defender.maxHealth;
    noteUnitDamagedForTokens(state, defender, lethal);
    if (lethal > 0) {
      appendEvent(state, {
        type: "DAMAGE_ASSIGNED",
        source: { type: "unit", unitId: attacker.id, controllerId: attacker.controllerId },
        target: { type: "unit", unitId: defender.id },
        amount: lethal,
        damageKind: "effect"
      });
    }
    markUnitRemovedIfNeeded(state, defender);
  }

  return finishCombatIfNeeded(state);
}

function declareAfterRetaliationAbilityAttack(state: GameState, cards: CardLibrary): boolean {
  const combat = state.combat;
  const sequence = combat?.attackSequence;
  const followUp = sequence?.afterRetaliationAbilityAttack;
  if (!combat || !sequence || !followUp) {
    return false;
  }

  const attacker = combat.units[sequence.attackerId];
  const target = combat.units[followUp.targetUnitId];
  combat.attackSequence = null;
  if (!attacker || !target || !isUnitAlive(attacker) || !isUnitAlive(target)) {
    return false;
  }

  declareAbilityAttack(
    state,
    attacker,
    target.id,
    { abilityId: followUp.abilityId, abilityName: followUp.abilityName, baseAttack: attacker.attack },
    cards
  );
  return true;
}

/**
 * BINH Cerberi "Three-Headed Assault": collect every other living enemy unit
 * adjacent to the attacker and queue one full follow-up attack per target.
 * Returns true when a follow-up attack was declared.
 */
function queueAttackAllFollowUps(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  cards: CardLibrary
): boolean {
  const combat = state.combat;
  if (!combat || !isUnitAlive(attacker) || (attacker.attacksThisActivation ?? 0) !== 1) {
    return false;
  }

  const ability = getUnitAbilityDefinitions(attacker).find(
    (candidate) =>
      candidate.implementationStatus === "implemented" &&
      candidate.effect?.type === "SECOND_ATTACK_ALL_ADJACENT_TO_SELF"
  );
  if (!ability || ability.effect?.type !== "SECOND_ATTACK_ALL_ADJACENT_TO_SELF") {
    return false;
  }

  const targets = Object.values(combat.units).filter(
    (unit) =>
      unit.id !== defender.id &&
      unit.id !== attacker.id &&
      unit.controllerId !== attacker.controllerId &&
      isUnitAlive(unit) &&
      isAdjacent(unit.position, attacker.position)
  );
  if (targets.length === 0) {
    return false;
  }

  if (combat.attackSequence) {
    combat.attackSequence.queuedAbilityAttacks = targets.map((unit) => ({
      abilityId: ability.id,
      abilityName: ability.name,
      baseAttack: ability.effect?.type === "SECOND_ATTACK_ALL_ADJACENT_TO_SELF" ? ability.effect.baseAttack : attacker.attack,
      targetUnitId: unit.id
    }));
  }

  return declareNextQueuedAbilityAttack(state, cards);
}

/** Pops and declares the next queued BINH Cerberi follow-up attack. */
function declareNextQueuedAbilityAttack(state: GameState, cards: CardLibrary): boolean {
  const combat = state.combat;
  const sequence = combat?.attackSequence;
  if (!combat || !sequence?.queuedAbilityAttacks?.length) {
    return false;
  }

  const attacker = combat.units[sequence.attackerId];
  if (!attacker || !isUnitAlive(attacker)) {
    sequence.queuedAbilityAttacks = [];
    return false;
  }

  while (sequence.queuedAbilityAttacks.length > 0) {
    const next = sequence.queuedAbilityAttacks.shift();
    const target = next ? combat.units[next.targetUnitId] : undefined;
    if (!next || !target || !isUnitAlive(target)) {
      continue;
    }

    declareAbilityAttack(
      state,
      attacker,
      next.targetUnitId,
      { abilityId: next.abilityId, abilityName: next.abilityName, baseAttack: next.baseAttack },
      cards
    );
    return true;
  }

  return false;
}

/**
 * Continues an attack after its printed follow-ups finished: fires the parked
 * retaliation when it is still legal, otherwise concludes the activation.
 */
function resumeAttackSequence(state: GameState, cards: CardLibrary): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }

  const sequence = combat.attackSequence;
  if (!sequence) {
    state.phase = "combat";
    state.priorityPlayerId = null;
    return;
  }

  const attacker = combat.units[sequence.attackerId];
  const defender = combat.units[sequence.defenderId];

  if (
    sequence.retaliationPending &&
    attacker &&
    defender &&
    shouldRetaliate(attacker, defender, sequence.attackKind)
  ) {
    sequence.retaliationPending = false;
    openRetaliationWindow(state, attacker, defender, cards);
    return;
  }

  if (sequence.afterRetaliationAbilityAttack && declareAfterRetaliationAbilityAttack(state, cards)) {
    return;
  }

  combat.attackSequence = null;
  if (attacker) {
    concludeAttackerActivation(state, attacker);
  } else {
    state.phase = "combat";
    state.priorityPlayerId = null;
  }
}

/**
 * Applies the mandatory flat-damage follow-ups of an attack (Magog splash,
 * Cerberi second head). A single candidate is hit immediately; several open
 * an ABILITY_TARGET_CHOICE for the attacker. Returns true when the attack
 * sequence is paused on a choice.
 */
function openFlatDamageFollowUps(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  attackKind: "melee" | "ranged"
): boolean {
  const combat = state.combat;
  if (!combat) {
    return false;
  }

  const followUps = getFlatDamageFollowUps(combat, { attacker, defender, attackKind });
  for (const followUp of followUps) {
    const living = followUp.candidateUnitIds.filter((unitId) => {
      const unit = combat.units[unitId];
      return unit && isUnitAlive(unit);
    });
    if (living.length === 0) {
      continue;
    }

    if (living.length === 1) {
      applyFlatAbilityDamage(state, attacker, living[0], followUp.abilityId, followUp.abilityName, followUp.amount);
      if (finishCombatIfNeeded(state)) {
        return true;
      }
      continue;
    }

    const choiceId = `choice_${nextEventNumber(state)}`;
    state.pendingChoice = {
      id: choiceId,
      type: "ABILITY_TARGET_CHOICE",
      playerId: attacker.controllerId,
      kind: "flat-damage",
      abilityId: followUp.abilityId,
      abilityName: followUp.abilityName,
      prompt: `${attacker.name}: ${followUp.abilityName} deals ${followUp.amount} damage — choose the unit it hits.`,
      sourceUnitId: attacker.id,
      anchorUnitId: defender.id,
      candidateUnitIds: living,
      amount: followUp.amount
    };
    state.phase = "choice";
    state.priorityPlayerId = attacker.controllerId;

    appendEvent(state, {
      type: "PENDING_CHOICE_CREATED",
      choiceId,
      choiceType: "ABILITY_TARGET_CHOICE",
      playerId: attacker.controllerId,
      sourceEffectIds: [],
      message: `${attacker.name} chooses the target of ${followUp.abilityName}.`
    });
    return true;
  }

  return false;
}

function applyFlatAbilityDamage(
  state: GameState,
  source: CombatUnitState,
  targetUnitId: UnitId,
  abilityId: string,
  abilityName: string,
  amount: number
): void {
  const combat = state.combat;
  const target = combat?.units[targetUnitId];
  if (!combat || !target || !isUnitAlive(target)) {
    return;
  }

  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: source.id,
    abilityId,
    targetUnitId,
    message: `${source.name} hits ${target.cardName} with ${abilityName} for ${amount} damage.`
  });

  target.damage += amount;
  noteUnitDamagedForTokens(state, target, amount);
  appendEvent(state, {
    type: "DAMAGE_ASSIGNED",
    source: { type: "unit", unitId: source.id, controllerId: source.controllerId },
    target: { type: "unit", unitId: target.id },
    amount,
    damageKind: "effect"
  });
  markUnitRemovedIfNeeded(state, target);
}

/** The living unit one space beyond the target, in line away from the attacker. */
function findUnitBehindTarget(
  combat: CombatState,
  attacker: CombatUnitState,
  defender: CombatUnitState
): CombatUnitState | null {
  const from = getBattlefieldCoordinates(attacker.position);
  const at = getBattlefieldCoordinates(defender.position);
  const rowStep = at.row - from.row;
  const columnStep = at.column - from.column;
  // Only a straight orthogonal line counts ("2 spaces in a line"): the dragon
  // must sit directly next to the target.
  if (Math.abs(rowStep) + Math.abs(columnStep) !== 1) {
    return null;
  }
  const behindRow = at.row + rowStep;
  const behindColumn = at.column + columnStep;
  if (behindRow < 0 || behindRow >= BATTLEFIELD_ROWS || behindColumn < 0 || behindColumn >= BATTLEFIELD_COLUMNS) {
    return null;
  }
  const behindPosition = behindRow * BATTLEFIELD_COLUMNS + behindColumn;
  return Object.values(combat.units).find((unit) => unit.position === behindPosition && isUnitAlive(unit)) ?? null;
}

/**
 * Gold Dragons' line attack: a full separate attack against the unit directly
 * behind the target (friend or foe), at the printed replacement attack value.
 * Declared like the Liches' Death Cloud, so it opens instant windows and rolls
 * its own die; that space is never adjacent to the dragon, so it never
 * retaliates and the follow-up never chains. Returns true when it was
 * declared (the attack sequence is parked on it).
 */
function openGoldDragonLineAttack(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  cards: CardLibrary
): boolean {
  const combat = state.combat;
  if (!combat || !isUnitAlive(attacker)) {
    return false;
  }
  const ability = getLineAttackAbility(attacker);
  if (!ability || (attacker.attacksThisActivation ?? 0) !== 1) {
    return false;
  }
  const behind = findUnitBehindTarget(combat, attacker, defender);
  if (!behind) {
    return false;
  }
  declareAbilityAttack(state, attacker, behind.id, ability, cards);
  return true;
}

/**
 * Hydras' "up to 2 adjacent enemy units": after the primary attack, strike one
 * more enemy adjacent to the Hydra with a full separate attack at its own
 * attack value. With several candidates the attacker chooses (an
 * ABILITY_TARGET_CHOICE the neutral seat auto-resolves); the follow-up never
 * retaliates or chains. Returns true when paused on the choice or the attack.
 */
function openHydraSecondAttack(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  cards: CardLibrary
): boolean {
  const combat = state.combat;
  if (!combat || !isUnitAlive(attacker) || (attacker.attacksThisActivation ?? 0) !== 1) {
    return false;
  }
  const ability = getSelfAdjacentSecondAttackAbility(attacker);
  if (!ability) {
    return false;
  }

  const candidates = Object.values(combat.units).filter(
    (unit) =>
      unit.id !== defender.id &&
      unit.id !== attacker.id &&
      unit.controllerId !== attacker.controllerId &&
      isUnitAlive(unit) &&
      isAdjacent(unit.position, attacker.position)
  );
  if (candidates.length === 0) {
    return false;
  }

  const baseAttack = ability.baseAttack ?? attacker.attack;

  if (candidates.length === 1) {
    declareAbilityAttack(
      state,
      attacker,
      candidates[0].id,
      { abilityId: ability.abilityId, abilityName: ability.abilityName, baseAttack },
      cards
    );
    return true;
  }

  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "ABILITY_TARGET_CHOICE",
    playerId: attacker.controllerId,
    kind: "second-attack",
    abilityId: ability.abilityId,
    abilityName: ability.abilityName,
    prompt: `${attacker.name}: ${ability.abilityName} — choose a second adjacent enemy to attack.`,
    sourceUnitId: attacker.id,
    anchorUnitId: defender.id,
    candidateUnitIds: candidates.map((unit) => unit.id),
    baseAttack
  };
  state.phase = "choice";
  state.priorityPlayerId = attacker.controllerId;
  appendEvent(state, {
    type: "PENDING_CHOICE_CREATED",
    choiceId,
    choiceType: "ABILITY_TARGET_CHOICE",
    playerId: attacker.controllerId,
    sourceEffectIds: [],
    message: `${attacker.name} chooses a second target for ${ability.abilityName}.`
  });
  return true;
}

/**
 * Azure Dragons / Basilisks: paralyse the target on a matching Attack die.
 * "own" reads this attack's resolved roll; "extra" rolls a fresh die through
 * the combat dice stream. The token only lands on a unit still alive.
 */
function applyParalysisFollowUps(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  attackRoll: number
): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }
  for (const followUp of getParalysisFollowUps(attacker)) {
    if (!isUnitAlive(defender)) {
      break;
    }
    let roll = attackRoll;
    if (followUp.source === "extra") {
      const candidate = rollAttackCandidate(combat, "normal");
      roll = candidate.roll;
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: attacker.id,
        abilityId: followUp.abilityId,
        targetUnitId: defender.id,
        message: `${attacker.name} rolls ${roll} for ${followUp.abilityName}.`
      });
    }
    if (roll !== followUp.onRoll) {
      continue;
    }
    if (unitImmuneToParalysis(state, defender)) {
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: defender.id,
        abilityId: "ignore-paralysis",
        targetUnitId: defender.id,
        message: `${defender.cardName} is immune to Paralysis.`
      });
      continue;
    }
    placeCombatToken(state, defender, "paralysis", 0, followUp.abilityName);
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: attacker.id,
      abilityId: followUp.abilityId,
      targetUnitId: defender.id,
      message: `${attacker.name} paralyses ${defender.cardName} with ${followUp.abilityName}.`
    });
  }
}

/**
 * Dragon Flies: on attack, dispel every ongoing effect the target's own
 * controller placed on it — its unit-targeted buffs (attack/defense/initiative
 * tokens, Anti-Magic immunity) and the enemy's player-scope auras (Archery,
 * …). Effects the attacker placed on the target (debuffs) and global effects
 * are left untouched. Ongoing cards behind the removed effects return to their
 * owner's discard via the central `releaseEndedOngoingCards` pass.
 */
function applyDispelFollowUps(state: GameState, attacker: CombatUnitState, defender: CombatUnitState): void {
  if (!hasUnitAbilityEffect(attacker, "DISPEL_ENEMY_EFFECTS_ON_TARGET")) {
    return;
  }

  const removed = state.activeEffects.filter(
    (effect) =>
      effect.controllerId === defender.controllerId &&
      effect.scope !== "global" &&
      effectAppliesToUnit(effect, defender)
  );
  if (removed.length === 0) {
    return;
  }

  const removedIds = new Set(removed.map((effect) => effect.id));
  state.activeEffects = state.activeEffects.filter((effect) => !removedIds.has(effect.id));

  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: attacker.id,
    abilityId: "dragon-fly-dispel",
    targetUnitId: defender.id,
    message: `${attacker.name} dispels ${removed.length} ongoing effect(s) on ${defender.name}: ${removed
      .map((effect) => effect.name)
      .join(", ")}.`
  });
}

/**
 * Medusas: after this unit's own Retaliation Attack, the unit it struck back
 * gains Paralysis. The Pack/Neutral cards paralyse automatically; the Few card
 * first rolls one Attack die and only paralyses on its `onRoll` face. The
 * token only lands on a target still alive after the retaliation.
 */
function applyRetaliationParalysis(
  state: GameState,
  retaliator: CombatUnitState,
  target: CombatUnitState
): void {
  const combat = state.combat;
  if (!combat || !isUnitAlive(target)) {
    return;
  }
  const ability = getRetaliationParalysis(retaliator);
  if (!ability) {
    return;
  }

  if (ability.onRoll !== undefined) {
    const candidate = rollAttackCandidate(combat, "normal");
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: retaliator.id,
      abilityId: ability.abilityId,
      targetUnitId: target.id,
      message: `${retaliator.name} rolls ${candidate.roll} for ${ability.abilityName}.`
    });
    if (candidate.roll !== ability.onRoll) {
      return;
    }
  }

  if (unitImmuneToParalysis(state, target)) {
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: target.id,
      abilityId: "ignore-paralysis",
      targetUnitId: target.id,
      message: `${target.cardName} is immune to Paralysis.`
    });
    return;
  }

  placeCombatToken(state, target, "paralysis", 0, ability.abilityName);
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: retaliator.id,
    abilityId: ability.abilityId,
    targetUnitId: target.id,
    message: `${retaliator.name} paralyses ${target.cardName} with ${ability.abilityName}.`
  });
}

/**
 * A card "can boost Power" for the Magi Power Drain — i.e. it shows the
 * [power] symbol. That is any Spell (each may be discarded for "+1 Power") or
 * any card carrying an ADD_SPELL_POWER effect (the Power statistic, the
 * Power-granting Artifacts, and the elemental-Magic Abilities/permanents),
 * including one tucked inside a choose-one option.
 */
/** Discards one named card from a player's hand to their discard pile. */
function discardNamedCardFromHand(state: GameState, playerId: PlayerId, cardId: CardId): boolean {
  const player = state.players[playerId];
  if (!player) {
    return false;
  }
  const index = player.hand.indexOf(cardId);
  if (index === -1) {
    return false;
  }
  const [discarded] = player.hand.splice(index, 1);
  player.discard.push(discarded);
  return true;
}

/** Discards one random card from a player's hand (seeded); returns its id. */
function discardRandomCardFromHand(state: GameState, playerId: PlayerId): CardId | null {
  const player = state.players[playerId];
  if (!player || player.hand.length === 0) {
    return null;
  }
  const random = createSeededRandom(`${state.seed}#magi-drain#${eventSeedNumber(state)}`);
  const index = random.nextInt(0, player.hand.length - 1);
  const [discarded] = player.hand.splice(index, 1);
  player.discard.push(discarded);
  return discarded;
}

/**
 * Neutral Magi "Power Drain". After the Magi's own attack (never a
 * retaliation), the defending player must lose a card: with a Power card in
 * hand they choose which Power card to discard or accept a random discard;
 * with no Power card the random discard is forced and resolves at once.
 * Returns true only when a choice was opened (combat is now parked on it).
 */
function openMagiDiscardChoice(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  cards: CardLibrary
): boolean {
  const ability = getEnemyDiscardAbility(attacker);
  if (!ability) {
    return false;
  }

  // The choice belongs to the defender's controller — only a seated player
  // with cards is affected; the neutral seat has no hand.
  const chooserId = defender.controllerId;
  const chooser = state.players[chooserId];
  if (chooserId === NEUTRAL_PLAYER_ID || !chooser || chooser.hand.length === 0) {
    return false;
  }

  const powerCardIds = chooser.hand.filter((cardId) => cardCanBoostPower(cards[cardId]));

  // No Power card to spare: the random discard is forced, no decision to make.
  if (powerCardIds.length === 0) {
    const discarded = discardRandomCardFromHand(state, chooserId);
    if (discarded) {
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: attacker.id,
        abilityId: ability.abilityId,
        targetUnitId: defender.id,
        message: `${attacker.name}'s ${ability.abilityName} discards a random card from ${chooser.name}'s hand.`
      });
    }
    return false;
  }

  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "COMBAT_HAND_DISCARD",
    playerId: chooserId,
    kind: "magi-power-or-random",
    abilityId: ability.abilityId,
    abilityName: ability.abilityName,
    sourceUnitId: attacker.id,
    prompt: `${attacker.name}: ${ability.abilityName} — discard a Power card of your choice, or let a random card be discarded.`,
    powerCardIds
  };
  state.phase = "choice";
  state.priorityPlayerId = chooserId;

  appendEvent(state, {
    type: "PENDING_CHOICE_CREATED",
    choiceId,
    choiceType: "COMBAT_HAND_DISCARD",
    playerId: chooserId,
    sourceEffectIds: [],
    message: `${chooser.name} chooses how to answer ${attacker.name}'s ${ability.abilityName}.`
  });
  return true;
}

/**
 * Resolves a COMBAT_HAND_DISCARD. For the Magi Power Drain it discards the chosen
 * (or random) card and unparks the attack; for the Neutral Pegasi "Mystic Toll"
 * it discards the chosen Power card and then casts the deferred Spell.
 */
function resolveCombatHandDiscard(
  state: GameState,
  action: Extract<GameAction, { type: "RESOLVE_COMBAT_DISCARD" }>,
  cards: CardLibrary
): void {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "COMBAT_HAND_DISCARD" || choice.id !== action.choiceId) {
    throw new Error("There is no card-discard choice to resolve.");
  }
  if (choice.playerId !== action.playerId) {
    throw new Error("Another player resolves this discard.");
  }

  const chooser = state.players[action.playerId];
  if (!chooser) {
    throw new Error("Unknown player.");
  }

  // Neutral Pegasi "Mystic Toll": pay the chosen Power card, then cast the held
  // Spell. No random option — the caster picks which Power card to pay.
  if (choice.kind === "pegasi-toll") {
    if (action.cardId === "random") {
      throw new Error("The Pegasi toll must be paid with a chosen card that has Power.");
    }
    if (!choice.powerCardIds.includes(action.cardId)) {
      throw new Error("That card cannot pay the Pegasi toll.");
    }
    if (!discardNamedCardFromHand(state, action.playerId, action.cardId)) {
      throw new Error("That card is no longer in hand.");
    }
    const toll = choice.tollSpell;
    appendEvent(state, {
      type: "PENDING_CHOICE_RESOLVED",
      choiceId: choice.id,
      playerId: action.playerId,
      selectedIndex: choice.powerCardIds.indexOf(action.cardId)
    });
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: choice.sourceUnitId,
      abilityId: choice.abilityId,
      message: `${chooser.name} pays ${cards[action.cardId]?.name ?? action.cardId} to the ${choice.abilityName}.`
    });
    state.pendingChoice = null;
    state.phase = "combat";
    state.priorityPlayerId = null;
    if (toll) {
      performSpellCast(
        state,
        {
          type: "CAST_SPELL",
          playerId: action.playerId,
          cardId: toll.cardId,
          target: toll.target,
          ...(toll.fromScroll ? { fromScroll: toll.fromScroll } : {}),
          ...(toll.fromSpellDeck ? { fromSpellDeck: toll.fromSpellDeck } : {})
        },
        cards
      );
    }
    return;
  }

  if (action.cardId === "random") {
    const discarded = discardRandomCardFromHand(state, action.playerId);
    appendEvent(state, {
      type: "PENDING_CHOICE_RESOLVED",
      choiceId: choice.id,
      playerId: action.playerId,
      selectedIndex: -1
    });
    if (discarded) {
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: choice.sourceUnitId,
        abilityId: choice.abilityId,
        targetUnitId: choice.sourceUnitId,
        message: `${chooser.name} lets ${choice.abilityName} discard a random card.`
      });
    }
  } else {
    if (!choice.powerCardIds.includes(action.cardId)) {
      throw new Error("That card cannot be chosen for the Power Drain.");
    }
    if (!discardNamedCardFromHand(state, action.playerId, action.cardId)) {
      throw new Error("That card is no longer in hand.");
    }
    appendEvent(state, {
      type: "PENDING_CHOICE_RESOLVED",
      choiceId: choice.id,
      playerId: action.playerId,
      selectedIndex: choice.powerCardIds.indexOf(action.cardId)
    });
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: choice.sourceUnitId,
      abilityId: choice.abilityId,
      targetUnitId: choice.sourceUnitId,
      message: `${chooser.name} discards ${cards[action.cardId]?.name ?? action.cardId} to ${choice.abilityName}.`
    });
  }

  state.pendingChoice = null;
  state.phase = "combat";
  state.priorityPlayerId = null;
  resumeAttackSequence(state, cards);
  finishCombatIfNeeded(state);
}

/**
 * Ghost Dragons' knock-back destinations: the empty spaces 1 step away from the
 * target that are not adjacent to the Ghost Dragons. Obstacles and other living
 * units block a space; the target's own space is never a candidate (it must
 * move). Sorted by board position so a forced/auto pick is deterministic.
 */
function getKnockbackDestinations(
  combat: CombatState,
  attacker: CombatUnitState,
  defender: CombatUnitState
): number[] {
  const occupied = new Set<number>();
  for (const unit of Object.values(combat.units)) {
    if (unit.id !== defender.id && isUnitAlive(unit) && isBattlefieldPosition(unit.position)) {
      occupied.add(unit.position);
    }
  }
  return getOrthogonalNeighbors(defender.position)
    .filter(
      (position) =>
        !occupied.has(position) &&
        !(combat.obstacles?.includes(position) ?? false) &&
        !isAdjacent(position, attacker.position)
    )
    .sort((left, right) => left - right);
}

/** Shoves a knocked-back unit to the chosen space and logs the move. */
function applyKnockback(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  destination: number,
  ability: { abilityId: string; abilityName: string }
): void {
  const from = defender.position;
  defender.position = destination;
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: attacker.id,
    abilityId: ability.abilityId,
    targetUnitId: defender.id,
    message: `${attacker.name}'s ${ability.abilityName} shoves ${defender.cardName} to ${getBattlefieldLabel(destination)}.`
  });
  appendEvent(state, {
    type: "UNIT_MOVED",
    playerId: defender.controllerId,
    unitId: defender.id,
    from,
    to: destination
  });
}

/** Opens the defender's "choose where you're knocked back" space picker. */
function openKnockbackChoice(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  destinations: number[],
  ability: { abilityId: string; abilityName: string }
): void {
  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "OPTION_CHOICE",
    playerId: defender.controllerId,
    prompt: `${attacker.name}'s ${ability.abilityName}: choose where ${defender.cardName} is pushed.`,
    options: destinations.map((position) => ({ label: `Move to ${getBattlefieldLabel(position)}` })),
    context: "combat-knockback",
    knockback: { unitId: defender.id, attackerId: attacker.id, positions: destinations },
    returnPhase: "combat"
  };
  state.phase = "choice";
  state.priorityPlayerId = defender.controllerId;
  appendEvent(state, {
    type: "PENDING_CHOICE_CREATED",
    choiceId,
    choiceType: "ABILITY_TARGET_CHOICE",
    playerId: defender.controllerId,
    sourceEffectIds: [],
    message: `${defender.cardName} is knocked back — ${state.players[defender.controllerId]?.name ?? defender.controllerId} chooses where.`
  });
}

/**
 * Ghost Dragons (neutral): after their attack, roll 1 Attack die; on the
 * knock-back face the still-living target is shoved one empty space away from
 * the dragon (the defender picks; a neutral target or a single forced space is
 * moved at once). Being pushed out of reach denies the Retaliation Attack — the
 * parked sequence re-checks adjacency. With no valid space the target stays and
 * retaliates as normal. Returns true only when it pauses on the defender's
 * choice.
 */
function openGhostDragonKnockback(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState
): boolean {
  const combat = state.combat;
  if (!combat || !isUnitAlive(attacker) || !isUnitAlive(defender)) {
    return false;
  }
  const ability = getKnockbackAbility(attacker);
  if (!ability) {
    return false;
  }

  // "After the attack, roll 1 Attack die."
  const candidate = rollAttackCandidate(combat, "normal");
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: attacker.id,
    abilityId: ability.abilityId,
    targetUnitId: defender.id,
    message: `${attacker.name} rolls ${candidate.roll} for ${ability.abilityName}.`
  });
  if (candidate.roll !== ability.onRoll) {
    return false;
  }

  const destinations = getKnockbackDestinations(combat, attacker, defender);
  if (destinations.length === 0) {
    // "If no valid space exists, the unit remains in place and retaliation occurs."
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: attacker.id,
      abilityId: ability.abilityId,
      targetUnitId: defender.id,
      message: `${defender.cardName} has nowhere to be pushed and holds its ground.`
    });
    return false;
  }

  // The defending player chooses the destination; a neutral target (no seat to
  // ask) or a single forced space resolves immediately.
  if (isNeutralUnit(defender) || destinations.length === 1) {
    applyKnockback(state, attacker, defender, destinations[0], ability);
    return false;
  }

  openKnockbackChoice(state, attacker, defender, destinations, ability);
  return true;
}

/** Resolves the Ghost Dragon knock-back space pick, then unparks the attack. */
function resolveKnockbackChoice(
  state: GameState,
  action: Extract<GameAction, { type: "CHOOSE_OPTION" }>,
  cards: CardLibrary
): void {
  const choice = state.pendingChoice;
  if (
    !choice ||
    choice.type !== "OPTION_CHOICE" ||
    choice.context !== "combat-knockback" ||
    choice.id !== action.choiceId ||
    choice.playerId !== action.playerId ||
    !choice.knockback
  ) {
    throw new Error("There is no knock-back choice to resolve.");
  }

  const combat = state.combat;
  const defender = combat?.units[choice.knockback.unitId];
  const attacker = combat?.units[choice.knockback.attackerId];
  const destination = choice.knockback.positions[action.optionIndex];
  if (!combat || !defender || !attacker || destination === undefined) {
    throw new Error("That knock-back destination is not available.");
  }

  const ability = getKnockbackAbility(attacker) ?? {
    abilityId: "ghost-dragon-knockback",
    abilityName: "Knock Back"
  };
  applyKnockback(state, attacker, defender, destination, ability);

  appendEvent(state, {
    type: "PENDING_CHOICE_RESOLVED",
    choiceId: choice.id,
    playerId: action.playerId,
    selectedIndex: action.optionIndex
  });

  state.pendingChoice = null;
  state.phase = "combat";
  state.priorityPlayerId = null;
  resumeAttackSequence(state, cards);
  finishCombatIfNeeded(state);
}

/**
 * Teleport Spell: opens the caster's "choose where the unit lands" empty-space
 * picker. Every space free of a living unit, an obstacle and a fortification is
 * a legal destination (distance and intervening obstacles are ignored). With
 * nowhere to land the cast simply fizzles (no choice opened).
 */
function openTeleportChoice(state: GameState, playerId: PlayerId, unit: CombatUnitState): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }

  const positions: number[] = [];
  for (let position = 0; position < BATTLEFIELD_CELL_COUNT; position += 1) {
    if (!isSpaceBlockedForSummon(combat, position)) {
      positions.push(position);
    }
  }
  if (positions.length === 0) {
    return;
  }

  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "OPTION_CHOICE",
    playerId,
    prompt: `Teleport ${unit.cardName} to an empty space.`,
    options: positions.map((position) => ({ label: `Teleport to ${getBattlefieldLabel(position)}` })),
    context: "combat-teleport",
    teleport: { unitId: unit.id, positions },
    returnPhase: "combat"
  };
  appendEvent(state, {
    type: "PENDING_CHOICE_CREATED",
    choiceId,
    choiceType: "ABILITY_TARGET_CHOICE",
    playerId,
    sourceEffectIds: [],
    message: `${state.players[playerId]?.name ?? playerId} teleports ${unit.cardName}.`
  });
}

/** Resolves the Teleport destination pick: relocate the unit to the chosen space. */
function resolveTeleportChoice(
  state: GameState,
  action: Extract<GameAction, { type: "CHOOSE_OPTION" }>
): void {
  const choice = state.pendingChoice;
  if (
    !choice ||
    choice.type !== "OPTION_CHOICE" ||
    choice.context !== "combat-teleport" ||
    choice.id !== action.choiceId ||
    choice.playerId !== action.playerId ||
    !choice.teleport
  ) {
    throw new Error("There is no teleport choice to resolve.");
  }

  const combat = state.combat;
  const unit = combat?.units[choice.teleport.unitId];
  const destination = choice.teleport.positions[action.optionIndex];
  if (!combat || !unit || destination === undefined || isSpaceBlockedForSummon(combat, destination)) {
    throw new Error("That teleport destination is not available.");
  }

  const from = unit.position;
  unit.position = destination;
  appendEvent(state, {
    type: "UNIT_MOVED",
    playerId: unit.controllerId,
    unitId: unit.id,
    from,
    to: destination
  });
  appendEvent(state, {
    type: "PENDING_CHOICE_RESOLVED",
    choiceId: choice.id,
    playerId: action.playerId,
    selectedIndex: action.optionIndex
  });

  state.pendingChoice = null;
  state.phase = "combat";
  state.priorityPlayerId = null;
  finishCombatIfNeeded(state);
}

// ---------------------------------------------------------------------------
// Battlefield-obstacle Spells: Force Field, Fire Wall, Quicksand, Land Mine.
// Each places a token on a Combat-board space (see BattlefieldTokenState). The
// trigger logic lives in moveUnit/walkMoveThroughTokens; this block only places
// the tokens, and for Quicksand/Land Mine runs the caster's "place the rest"
// picker.
// ---------------------------------------------------------------------------

/** Adds a battlefield token to the combat board and announces it. */
function addBattlefieldToken(state: GameState, token: Omit<BattlefieldTokenState, "id">): BattlefieldTokenState {
  const combat = state.combat;
  if (!combat) {
    throw new Error("No combat to place a battlefield token in.");
  }
  const placed: BattlefieldTokenState = { ...token, id: `bftoken_${nextEventNumber(state)}` };
  combat.battlefieldTokens = [...(combat.battlefieldTokens ?? []), placed];
  appendEvent(state, {
    type: "BATTLEFIELD_TOKEN_PLACED",
    playerId: placed.controllerId,
    tokenId: placed.id,
    kind: placed.kind,
    position: placed.position
  });
  return placed;
}

/**
 * Lifts every Force Field whose timed duration ends with `finishedRound` (a
 * Power 0 field after this round, a Power 1 field after the next). Fire Wall,
 * Quicksand and Land Mine carry no expiry — they last the whole Combat and go
 * when the combat state does.
 */
function expireBattlefieldTokensAtRoundEnd(state: GameState, finishedRound: number): void {
  const combat = state.combat;
  if (!combat?.battlefieldTokens?.length) {
    return;
  }
  const expiring = combat.battlefieldTokens.filter((token) => token.expiresAtCombatRoundEnd === finishedRound);
  if (expiring.length === 0) {
    return;
  }
  combat.battlefieldTokens = combat.battlefieldTokens.filter((token) => token.expiresAtCombatRoundEnd !== finishedRound);
  for (const token of expiring) {
    appendEvent(state, {
      type: "BATTLEFIELD_TOKEN_EXPIRED",
      tokenId: token.id,
      kind: token.kind,
      position: token.position
    });
  }
}

/** The combat round at whose end a Force Field of the given duration lifts (undefined = whole combat). */
function forceFieldExpiry(combat: CombatState, duration: EffectDurationDefinition): number | undefined {
  if (duration.type === "current-combat-round") {
    return combat.round;
  }
  if (duration.type === "next-combat-round") {
    return combat.round + 1;
  }
  return undefined;
}

/** Empty board spaces a new token may be placed on (no unit, obstacle, fortification or other token). */
function emptyTokenSpaces(combat: CombatState): number[] {
  const positions: number[] = [];
  for (let position = 0; position < BATTLEFIELD_CELL_COUNT; position += 1) {
    if (!isSpaceBlockedForSummon(combat, position)) {
      positions.push(position);
    }
  }
  return positions;
}

/**
 * The shuffled armed/decoy assignment for a Quicksand / Land Mine set: half the
 * `count` tokens are armed and half are decoys, mixed with the combat's seeded
 * RNG so the result is deterministic and server-authoritative (the opponent
 * never sees it — see getPlayerView). Tokens are assigned these flags in
 * placement order.
 */
function makeArmedSlots(state: GameState, count: number): boolean[] {
  const slots: boolean[] = [];
  const armedCount = Math.floor(count / 2);
  for (let index = 0; index < count; index += 1) {
    slots.push(index < armedCount);
  }
  const rng = createSeededRandom(`${state.combat?.dice.seed ?? "tokens"}:armed:${nextEventNumber(state)}`);
  for (let index = slots.length - 1; index > 0; index -= 1) {
    const swap = rng.nextInt(0, index);
    [slots[index], slots[swap]] = [slots[swap], slots[index]];
  }
  return slots;
}

/**
 * Opens (or re-opens) the caster's "place the next Quicksand / Land Mine token"
 * picker. Each pick drops one token on a chosen empty space, taking its
 * armed/decoy flag from `armedSlots[placedCount]`; the picker re-opens until the
 * whole set is down, the player stops, or the board runs out of empty spaces
 * ("discard any leftover Tokens"). Returns false when nothing remains to place.
 */
function openTokenPlacementChoice(
  state: GameState,
  playerId: PlayerId,
  kind: "quicksand" | "land_mine",
  armedSlots: boolean[],
  placedCount: number,
  triggerDamage: number
): boolean {
  const combat = state.combat;
  if (!combat) {
    return false;
  }
  const remaining = armedSlots.length - placedCount;
  const positions = emptyTokenSpaces(combat);
  if (remaining <= 0 || positions.length === 0) {
    return false;
  }

  const spellName = kind === "quicksand" ? "Quicksand" : "Land Mine";
  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "OPTION_CHOICE",
    playerId,
    prompt: `${spellName}: place a token on an empty space (${remaining} left), or stop.`,
    options: [
      ...positions.map((position) => ({ label: `Place at ${getBattlefieldLabel(position)}` })),
      { label: "Stop placing tokens" }
    ],
    context: "place-battlefield-tokens",
    placeTokens: { kind, positions, armedSlots, placedCount, remaining, triggerDamage },
    returnPhase: "combat"
  };
  appendEvent(state, {
    type: "PENDING_CHOICE_CREATED",
    choiceId,
    choiceType: "ABILITY_TARGET_CHOICE",
    playerId,
    sourceEffectIds: [],
    message: `${state.players[playerId]?.name ?? playerId} places ${spellName} tokens.`
  });
  return true;
}

/** Begins a Quicksand / Land Mine cast: drop the first token on the cast's space, then open the picker for the rest. */
function beginHiddenTokenPlacement(
  state: GameState,
  playerId: PlayerId,
  kind: "quicksand" | "land_mine",
  count: number,
  triggerDamage: number,
  firstPosition: number
): void {
  const combat = state.combat;
  if (!combat || count <= 0 || isSpaceBlockedForSummon(combat, firstPosition)) {
    return;
  }
  const armedSlots = makeArmedSlots(state, count);
  addBattlefieldToken(state, {
    kind,
    position: firstPosition,
    controllerId: playerId,
    armed: armedSlots[0],
    damage: kind === "land_mine" ? triggerDamage : undefined
  });
  openTokenPlacementChoice(state, playerId, kind, armedSlots, 1, triggerDamage);
}

/** Resolves one pick of the Quicksand / Land Mine placement picker. */
function resolvePlaceTokensChoice(state: GameState, action: Extract<GameAction, { type: "CHOOSE_OPTION" }>): void {
  const choice = state.pendingChoice;
  if (
    !choice ||
    choice.type !== "OPTION_CHOICE" ||
    choice.context !== "place-battlefield-tokens" ||
    choice.id !== action.choiceId ||
    choice.playerId !== action.playerId ||
    !choice.placeTokens
  ) {
    throw new Error("There is no token placement to resolve.");
  }

  const combat = state.combat;
  const plan = choice.placeTokens;
  const position = plan.positions[action.optionIndex];

  appendEvent(state, {
    type: "PENDING_CHOICE_RESOLVED",
    choiceId: choice.id,
    playerId: action.playerId,
    selectedIndex: action.optionIndex
  });
  state.pendingChoice = null;

  // A chosen empty space drops the next token; the trailing "stop placing"
  // option (or a now-occupied space) discards the leftover tokens, exactly as
  // the rulebook allows. Either way the picker re-opens only while tokens and
  // empty spaces both remain.
  let reopened = false;
  if (combat && position !== undefined && !isSpaceBlockedForSummon(combat, position)) {
    addBattlefieldToken(state, {
      kind: plan.kind,
      position,
      controllerId: action.playerId,
      armed: plan.armedSlots[plan.placedCount],
      damage: plan.kind === "land_mine" ? plan.triggerDamage : undefined
    });
    reopened = openTokenPlacementChoice(state, action.playerId, plan.kind, plan.armedSlots, plan.placedCount + 1, plan.triggerDamage);
  }

  if (reopened) {
    state.phase = "choice";
    state.priorityPlayerId = action.playerId;
  } else {
    state.phase = "combat";
    state.priorityPlayerId = null;
  }
  finishCombatIfNeeded(state);
}

/**
 * Clone Spell: opens the destination pick — the empty spaces orthogonally
 * adjacent to the cloned unit. Mirrors openTeleportChoice but is restricted to
 * the original's neighbours ("an adjacent empty space"). Returns false (opening
 * nothing) when the original is hemmed in with no empty neighbour, so the caller
 * can refund the cast rather than waste it.
 */
function openCloneChoice(state: GameState, playerId: PlayerId, original: CombatUnitState): boolean {
  const combat = state.combat;
  if (!combat) {
    return false;
  }

  const positions = getOrthogonalNeighbors(original.position).filter(
    (position) => !isSpaceBlockedForSummon(combat, position)
  );
  if (positions.length === 0) {
    return false;
  }

  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "OPTION_CHOICE",
    playerId,
    prompt: `Place the Clone of ${original.cardName} on an adjacent empty space.`,
    options: positions.map((position) => ({ label: `Clone to ${getBattlefieldLabel(position)}` })),
    context: "combat-clone",
    clone: { originalUnitId: original.id, positions },
    returnPhase: "combat"
  };
  appendEvent(state, {
    type: "PENDING_CHOICE_CREATED",
    choiceId,
    choiceType: "ABILITY_TARGET_CHOICE",
    playerId,
    sourceEffectIds: [],
    message: `${state.players[playerId]?.name ?? playerId} clones ${original.cardName}.`
  });
  return true;
}

/** The least Power that a `gradeByPower` ladder needs to reach `grade`. */
function powerRequiredForGrade(
  gradeByPower: Record<number, CombatUnitState["grade"]>,
  grade: CombatUnitState["grade"]
): number | null {
  const match = Object.entries(gradeByPower)
    .map(([power, atGrade]) => ({ power: Number(power), atGrade }))
    .filter((entry) => Number.isFinite(entry.power) && gradeRank(entry.atGrade) >= gradeRank(grade))
    .sort((left, right) => left.power - right.power)[0];
  return match ? match.power : null;
}

/**
 * Clone could not land at the Power paid (the chosen unit's grade was out of
 * reach, or — defensively — no adjacent empty space remained). Rather than
 * silently waste the cast, refund it: the Clone card and every Power-source card
 * spent on it return to the caster's hand, the cast stops counting against the
 * one-Spell-per-round limit, and a notice tells the player nothing was lost.
 * The caster is returned to the battle screen. Mirrors no card/Power leaving
 * play, so re-casting (after paying enough Power) is always possible.
 */
function refundInsufficientCloneCast(
  state: GameState,
  stackItem: ResolutionStackItem,
  target: CombatUnitState,
  reason: string
): void {
  if (stackItem.action.type !== "CAST_SPELL") {
    return;
  }
  const playerId = stackItem.action.playerId;
  const player = state.players[playerId];

  // Return the Power-source cards played into this cast (the "+1 Power" discards
  // and Power statistics) to the caster's hand. A scroll cast pays no such cards.
  if (player && !stackItem.modifiers.scrollLocked) {
    for (const cardId of stackItem.modifiers.playedCardIds) {
      const discardIndex = player.discard.lastIndexOf(cardId);
      if (discardIndex !== -1) {
        player.discard.splice(discardIndex, 1);
        player.hand.push(cardId);
      }
    }
  }

  // Return the Clone card itself (a scroll cast removed the spell from the game,
  // so there is no card to return — only the Power, handled above).
  if (player && !stackItem.modifiers.scrollLocked) {
    const discardIndex = player.discard.lastIndexOf(stackItem.action.cardId);
    if (discardIndex !== -1) {
      player.discard.splice(discardIndex, 1);
      player.hand.push(stackItem.action.cardId);
    }
  }

  // The refunded cast no longer counts as a Spell this round/turn, so it neither
  // burns the one-Spell limit nor the "first spell" Power bonuses.
  if (player) {
    player.combatStats.spellsCastThisRound = Math.max(0, player.combatStats.spellsCastThisRound - 1);
    player.combatStats.spellsCastThisTurn = Math.max(0, (player.combatStats.spellsCastThisTurn ?? 0) - 1);
  }

  appendEvent(state, {
    type: "SPELL_CAST_REFUNDED",
    playerId,
    spellCardId: stackItem.action.cardId,
    reason
  });

  stackItem.status = "cancelled";
  state.stack.pop();
  state.pendingChoice = null;
  if (!finishCombatIfNeeded(state)) {
    state.phase = "combat";
    state.priorityPlayerId = null;
  }
}

/** Resolves the Clone destination pick: drop the 1-Health Clone Token there. */
function resolveCloneChoice(
  state: GameState,
  action: Extract<GameAction, { type: "CHOOSE_OPTION" }>
): void {
  const choice = state.pendingChoice;
  if (
    !choice ||
    choice.type !== "OPTION_CHOICE" ||
    choice.context !== "combat-clone" ||
    choice.id !== action.choiceId ||
    choice.playerId !== action.playerId ||
    !choice.clone
  ) {
    throw new Error("There is no clone choice to resolve.");
  }

  const combat = state.combat;
  const original = combat?.units[choice.clone.originalUnitId];
  const destination = choice.clone.positions[action.optionIndex];
  if (!combat || !original || destination === undefined || isSpaceBlockedForSummon(combat, destination)) {
    throw new Error("That clone destination is not available.");
  }

  const clone = placeCloneUnit(state, action.playerId, original, destination);
  appendEvent(state, {
    type: "PENDING_CHOICE_RESOLVED",
    choiceId: choice.id,
    playerId: action.playerId,
    selectedIndex: action.optionIndex
  });
  if (clone) {
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: clone.id,
      abilityId: "spell.clone",
      message: `${original.cardName} is cloned at ${getBattlefieldLabel(destination)} (1 Health).`
    });
  }

  state.pendingChoice = null;
  state.phase = "combat";
  state.priorityPlayerId = null;
  finishCombatIfNeeded(state);
}

/**
 * Necklace of Swiftness (option B): opens the "step one space" destination pick
 * — the empty spaces orthogonally adjacent to the chosen unit (occupied spaces,
 * obstacles, Walls and the Gate are excluded by isSpaceBlockedForSummon). Does
 * nothing when the unit is hemmed in with no empty neighbour. The play already
 * filtered to a unit with at least one empty neighbour, so a choice always opens
 * for a legal play.
 */
function openUnitStepChoice(state: GameState, playerId: PlayerId, unit: CombatUnitState): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }

  const positions = getOrthogonalNeighbors(unit.position).filter(
    (position) => !isSpaceBlockedForSummon(combat, position)
  );
  if (positions.length === 0) {
    return;
  }

  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "OPTION_CHOICE",
    playerId,
    prompt: `Move ${unit.cardName} one space.`,
    options: positions.map((position) => ({ label: `Move to ${getBattlefieldLabel(position)}` })),
    context: "combat-step",
    step: { unitId: unit.id, positions },
    returnPhase: "combat"
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
  appendEvent(state, {
    type: "PENDING_CHOICE_CREATED",
    choiceId,
    choiceType: "ABILITY_TARGET_CHOICE",
    playerId,
    sourceEffectIds: [],
    message: `${state.players[playerId]?.name ?? playerId} moves ${unit.cardName} one space.`
  });
}

/** Resolves the Necklace of Swiftness step: relocate the unit to the chosen space. */
function resolveUnitStepChoice(
  state: GameState,
  action: Extract<GameAction, { type: "CHOOSE_OPTION" }>
): void {
  const choice = state.pendingChoice;
  if (
    !choice ||
    choice.type !== "OPTION_CHOICE" ||
    choice.context !== "combat-step" ||
    choice.id !== action.choiceId ||
    choice.playerId !== action.playerId ||
    !choice.step
  ) {
    throw new Error("There is no movement choice to resolve.");
  }

  const combat = state.combat;
  const unit = combat?.units[choice.step.unitId];
  const destination = choice.step.positions[action.optionIndex];
  if (!combat || !unit || destination === undefined || isSpaceBlockedForSummon(combat, destination)) {
    throw new Error("That move destination is not available.");
  }

  const from = unit.position;
  unit.position = destination;
  appendEvent(state, {
    type: "UNIT_MOVED",
    playerId: unit.controllerId,
    unitId: unit.id,
    from,
    to: destination
  });
  appendEvent(state, {
    type: "PENDING_CHOICE_RESOLVED",
    choiceId: choice.id,
    playerId: action.playerId,
    selectedIndex: action.optionIndex
  });

  state.pendingChoice = null;
  state.phase = "combat";
  state.priorityPlayerId = null;
  finishCombatIfNeeded(state);
}

/**
 * Liches' Death Cloud: opens the second-attack target choice (or declares
 * the attack straight away when only one unit qualifies). Returns true when
 * the attack sequence is paused on the choice or the follow-up attack.
 */
function openSecondAttackFollowUp(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  cards: CardLibrary
): boolean {
  const combat = state.combat;
  if (!combat || !isUnitAlive(attacker)) {
    return false;
  }

  const ability = getSecondAttackAbility(attacker);
  if (!ability || (attacker.attacksThisActivation ?? 0) !== 1) {
    return false;
  }

  const candidates = getSecondAttackCandidates(combat, attacker, defender);
  if (candidates.length === 0) {
    return false;
  }

  if (candidates.length === 1) {
    declareAbilityAttack(state, attacker, candidates[0], ability, cards);
    return true;
  }

  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "ABILITY_TARGET_CHOICE",
    playerId: attacker.controllerId,
    kind: "second-attack",
    abilityId: ability.abilityId,
    abilityName: ability.abilityName,
    prompt: `${attacker.name}: ${ability.abilityName} — choose a unit adjacent to the target for the second attack (attack ${ability.baseAttack}).`,
    sourceUnitId: attacker.id,
    anchorUnitId: defender.id,
    candidateUnitIds: candidates,
    baseAttack: ability.baseAttack
  };
  state.phase = "choice";
  state.priorityPlayerId = attacker.controllerId;

  appendEvent(state, {
    type: "PENDING_CHOICE_CREATED",
    choiceId,
    choiceType: "ABILITY_TARGET_CHOICE",
    playerId: attacker.controllerId,
    sourceEffectIds: [],
    message: `${attacker.name} chooses the target of ${ability.abilityName}.`
  });
  return true;
}

function declareAbilityAttack(
  state: GameState,
  attacker: CombatUnitState,
  targetUnitId: UnitId,
  ability: { abilityId: string; abilityName: string; baseAttack: number },
  cards: CardLibrary
): void {
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: attacker.id,
    abilityId: ability.abilityId,
    targetUnitId,
    message: `${attacker.name} unleashes ${ability.abilityName} on ${state.combat?.units[targetUnitId]?.cardName ?? targetUnitId}.`
  });

  declareAttack(
    state,
    {
      type: "ATTACK_UNIT",
      playerId: attacker.controllerId,
      attackerId: attacker.id,
      defenderId: targetUnitId,
      abilityAttack: { abilityId: ability.abilityId, baseAttack: ability.baseAttack }
    },
    cards
  );
}

function setActiveUnit(state: GameState, unitId: UnitId | null): void {
  if (!state.combat) {
    return;
  }

  state.combat.activeUnitId = unitId;

  if (!unitId) {
    state.activePlayerId = state.combat.attackerPlayerId;
    return;
  }

  const activeUnit = state.combat.units[unitId];

  // Paralysis: "If a unit would activate with a Paralysis Token on it, skip
  // its activation and remove the Token instead."
  if (hasToken(activeUnit, "paralysis")) {
    removeToken(state, activeUnit, "paralysis", "activation-skipped");
    activeUnit.activatedThisRound = true;
    appendExpiredEffectEvents(state, expireEffectsForActivationEnd(state, activeUnit.id), "activation-ended");
    appendEvent(state, {
      type: "UNIT_ACTIVATION_ENDED",
      playerId: activeUnit.controllerId,
      unitId: activeUnit.id
    });
    setActiveUnit(state, getNextUnitToActivate(state.combat, state.activeEffects)?.id ?? null);
    return;
  }

  state.activePlayerId = activeUnit.controllerId;
  activeUnit.movedThisActivation = false;
  activeUnit.attackedThisActivation = false;
  activeUnit.attacksThisActivation = 0;
  // A fresh activation may open one pre-activation reaction pause for the
  // opposing side (resolved once, then this guards against re-opening it after
  // the reacting player casts/plays during the pause).
  activeUnit.reactionPauseAcked = false;
  activeUnit.preActivationWindowOffered = false;
  // Remember where the unit started this activation (Harpy fly-back) and reset
  // the once-per-activation "[activation]" choice flag (Enchanters/Faeries).
  activeUnit.activationStartPosition = activeUnit.position;
  activeUnit.activationAbilityDone = false;

  if (activeUnit.defenseToken) {
    activeUnit.defenseToken = false;
  }

  appendEvent(state, {
    type: "UNIT_ACTIVATION_STARTED",
    unitId: activeUnit.id,
    playerId: activeUnit.controllerId
  });

  // Fortress Wyverns' poison: a faction cube is removed for 1 damage at the
  // beginning of the unit's activation. A lethal cube ends the activation right
  // away (and may end the combat) — advance to the next unit.
  if (applyPoisonCubesAtActivation(state, activeUnit)) {
    if (finishCombatIfNeeded(state)) {
      return;
    }
    activeUnit.activatedThisRound = true;
    appendExpiredEffectEvents(state, expireEffectsForActivationEnd(state, activeUnit.id), "activation-ended");
    appendEvent(state, {
      type: "UNIT_ACTIVATION_ENDED",
      playerId: activeUnit.controllerId,
      unitId: activeUnit.id
    });
    setActiveUnit(state, getNextUnitToActivate(state.combat, state.activeEffects)?.id ?? null);
    return;
  }

  // Auto-resolving "[activation]" abilities fire as the unit's turn opens:
  // Wraith/Troll regeneration, Ghost Dragon morale drain and the Wraith-pack
  // enemy hand discard. A paralysed unit (handled above) never reaches here.
  applyActivationStartAbilities(state, activeUnit);
}

/**
 * Applies the auto-resolving "[activation]" abilities of the unit whose turn
 * just began: self-regeneration, discarding the enemy's positive morale token,
 * and the random enemy-hand discard. All resolve without player input.
 */
function applyActivationStartAbilities(state: GameState, unit: CombatUnitState): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }

  const enemyId =
    unit.controllerId === combat.attackerPlayerId ? combat.defenderPlayerId : combat.attackerPlayerId;

  for (const ability of getActivationAbilities(unit)) {
    if (ability.kind === "heal-self") {
      if (unit.damage <= 0) {
        continue;
      }
      const healed = Math.min(ability.amount, unit.damage);
      unit.damage = Math.max(0, unit.damage - ability.amount);
      appendEvent(state, {
        type: "DAMAGE_HEALED",
        source: { type: "unit", unitId: unit.id, controllerId: unit.controllerId },
        target: { type: "unit", unitId: unit.id },
        amount: healed
      });
      continue;
    }

    if (ability.kind === "discard-enemy-morale") {
      const enemy = state.players[enemyId];
      if (!enemy || enemy.morale <= 0) {
        continue;
      }
      enemy.morale = 0;
      appendEvent(state, { type: "MORALE_CHANGED", playerId: enemyId, amount: -1, total: 0 });
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: unit.id,
        abilityId: ability.abilityId,
        message: `${unit.name} discards the enemy's positive morale token.`
      });
      continue;
    }

    if (ability.kind === "discard-enemy-card") {
      for (let index = 0; index < ability.amount; index += 1) {
        if (!discardRandomCardFromHand(state, enemyId)) {
          break;
        }
      }
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: unit.id,
        abilityId: ability.abilityId,
        message: `${unit.name} drains a card from the enemy's hand.`
      });
      continue;
    }
  }
}

function advanceActiveUnit(state: GameState): void {
  if (!state.combat) {
    return;
  }

  setActiveUnit(state, getNextUnitToActivate(state.combat, state.activeEffects)?.id ?? null);
}

/**
 * Sorrow: end the active unit's turn before it acts. Mirrors the paralysis
 * skip — mark it activated, expire its activation-bound effects, log the end,
 * and advance to the next unit.
 */
function skipUnitActivation(state: GameState, unit: CombatUnitState): void {
  const combat = state.combat;
  if (!combat || combat.activeUnitId !== unit.id) {
    return;
  }

  unit.activatedThisRound = true;
  appendExpiredEffectEvents(state, expireEffectsForActivationEnd(state, unit.id), "activation-ended");
  appendEvent(state, {
    type: "UNIT_ACTIVATION_ENDED",
    playerId: unit.controllerId,
    unitId: unit.id
  });
  advanceActiveUnit(state);
}

/**
 * Resolves the current combat pause so the fight resumes. Only the player who
 * holds the pause (the reacting side) clicks it on; the pump in
 * runAdventureAutomations picks the activation back up afterwards:
 *
 *  - "pre-activation": the reacting side is done casting/reacting — mark the
 *    unit so the pump runs its activation (a guard acts; a player-vs-player
 *    unit is handed back to its controller) instead of re-opening the pause.
 *  - "guard-walk": the table clicked the guard's walk on — advance to the next
 *    unit (the walking guard's activation already ended).
 */
function continueNeutralStep(
  state: GameState,
  action: Extract<GameAction, { type: "CONTINUE_NEUTRAL_STEP" }>
): void {
  const combat = state.combat;
  const pause = combat?.pendingNeutralStep;
  if (!combat || !pause) {
    throw new Error("No combat pause is waiting to continue.");
  }
  const reactor = pause.reactingPlayerId ?? combat.attackerPlayerId;
  if (action.playerId !== reactor) {
    throw new Error("Only the reacting player can continue the combat.");
  }

  if (pause.kind === "pre-activation") {
    const unit = combat.units[pause.unitId];
    if (unit) {
      unit.reactionPauseAcked = true;
    }
    combat.pendingNeutralStep = null;
    // Leave activeUnitId as-is: the pump runs the guard's activation, or hands
    // a player-vs-player unit back to its controller to drive.
    return;
  }

  combat.pendingNeutralStep = null;
  advanceActiveUnit(state);
}

/** Living friendly units the Enchanters could heal (other friendlies only). */
function enchanterHealCandidates(combat: CombatState, unit: CombatUnitState): CombatUnitState[] {
  return Object.values(combat.units).filter(
    (candidate) =>
      candidate.id !== unit.id &&
      candidate.controllerId === unit.controllerId &&
      isUnitAlive(candidate) &&
      candidate.damage > 0
  );
}

/** Enchanters: gain +N Attack for the rest of this combat round (self-buff). */
function applyEnchanterBuffSelf(
  state: GameState,
  unit: CombatUnitState,
  ability: { abilityId: string; abilityName: string; attackBonus: number }
): void {
  createActiveEffect(
    state,
    {
      name: ability.abilityName,
      scope: "unit",
      duration: { type: "current-combat-round" },
      polarity: "positive",
      removable: true,
      modifiers: [{ type: "ATTACK_BONUS", amount: ability.attackBonus }]
    },
    { type: "unit", unitId: unit.id, controllerId: unit.controllerId },
    unit.controllerId,
    { type: "unit", unitId: unit.id }
  );
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: unit.id,
    abilityId: ability.abilityId,
    targetUnitId: unit.id,
    message: `${unit.name} gains +${ability.attackBonus} Attack from ${ability.abilityName}.`
  });
}

/** Enchanters: remove up to N damage from a chosen friendly unit. */
function applyEnchanterHeal(
  state: GameState,
  unit: CombatUnitState,
  target: CombatUnitState,
  ability: { abilityId: string; abilityName: string; healAmount: number }
): void {
  healUnitDamage(
    state,
    { type: "unit", unitId: unit.id, controllerId: unit.controllerId },
    { type: "unit", unitId: target.id },
    ability.healAmount
  );
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: unit.id,
    abilityId: ability.abilityId,
    targetUnitId: target.id,
    message: `${unit.name} heals ${target.cardName} with ${ability.abilityName}.`
  });
}

/**
 * Faerie Dragons' activation damage-spell: flat spell damage to the chosen
 * unit (not reduced by defense). Fires the Ice Bolt ability event for the FX,
 * then the damage event, and finalizes a kill / the combat if it lands lethal.
 */
function applyActivationDamageSpell(
  state: GameState,
  unit: CombatUnitState,
  target: CombatUnitState,
  ability: { abilityId: string; abilityName: string; amount: number }
): void {
  // Golems et al. reduce Spell damage — the Faerie Bolt is explicitly a spell.
  const dealt = reducedSpellDamage(state, target, ability.amount);
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: unit.id,
    abilityId: ability.abilityId,
    targetUnitId: target.id,
    message: `${unit.name} casts ${ability.abilityName} at ${target.cardName} for ${dealt} damage.`
  });
  target.damage += dealt;
  noteUnitDamagedForTokens(state, target, dealt);
  appendEvent(state, {
    type: "DAMAGE_ASSIGNED",
    source: { type: "unit", unitId: unit.id, controllerId: unit.controllerId },
    target: { type: "unit", unitId: target.id },
    amount: dealt,
    damageKind: "spell"
  });
  markUnitRemovedIfNeeded(state, target);
  finishCombatIfNeeded(state);
}

/**
 * Auto-resolves a neutral unit's "[activation]" choice ability before it acts:
 * a neutral Enchanter always takes the +1 Attack; a neutral Faerie Dragon zaps
 * the unit it would attack (normal target priority). Returns true when it did
 * something, so the caller can re-check for a finished combat.
 */
function applyNeutralActivationAbility(state: GameState, unit: CombatUnitState): boolean {
  const combat = state.combat;
  if (!combat) {
    return false;
  }

  const enchant = getEnchanterActivationAbility(unit);
  if (enchant) {
    applyEnchanterBuffSelf(state, unit, enchant);
    return true;
  }

  const faerie = getActivationDamageSpellAbility(unit);
  if (faerie) {
    const target = pickNeutralTarget(combat, unit);
    if (target) {
      applyActivationDamageSpell(state, unit, target, faerie);
    }
    return true;
  }

  return false;
}

/**
 * Opens a player-controlled unit's "[activation]" choice when its turn comes
 * up (before it acts): Enchanters pick heal-a-friendly vs +1 Attack, Faerie
 * Dragons pick the unit their Ice Bolt hits. Trivial cases (no friendly to
 * heal, no enemy to zap) resolve automatically without a prompt. Called at the
 * end of every action so it never collides with reaction windows, war-machine
 * round-starts or the neutral pump.
 */
function maybeOpenPlayerActivationChoice(state: GameState): void {
  const combat = state.combat;
  if (
    !combat ||
    combat.outcome ||
    combat.setup ||
    combat.awaitingContinue ||
    state.pendingChoice ||
    state.reactionWindow ||
    state.stack.length > 0
  ) {
    return;
  }

  const unitId = combat.activeUnitId;
  const unit = unitId ? combat.units[unitId] : undefined;
  if (
    !unit ||
    !isUnitAlive(unit) ||
    isNeutralUnit(unit) ||
    unit.activatedThisRound ||
    unit.activationAbilityDone ||
    unit.movedThisActivation ||
    unit.attackedThisActivation
  ) {
    return;
  }

  const enchant = getEnchanterActivationAbility(unit);
  if (enchant) {
    const candidates = enchanterHealCandidates(combat, unit);
    if (candidates.length === 0) {
      // Nothing to heal: the only meaningful outcome is the self Attack buff.
      applyEnchanterBuffSelf(state, unit, enchant);
      unit.activationAbilityDone = true;
      return;
    }
    const choiceId = `choice_${nextEventNumber(state)}`;
    state.pendingChoice = {
      id: choiceId,
      type: "ABILITY_TARGET_CHOICE",
      playerId: unit.controllerId,
      kind: "enchanter-activation",
      abilityId: enchant.abilityId,
      abilityName: enchant.abilityName,
      prompt: `${unit.cardName}: ${enchant.abilityName} — heal a friendly unit (up to ${enchant.healAmount} damage) or gain +${enchant.attackBonus} Attack.`,
      sourceUnitId: unit.id,
      anchorUnitId: null,
      candidateUnitIds: candidates.map((candidate) => candidate.id),
      optional: true,
      skipLabel: `Gain +${enchant.attackBonus} Attack instead`
    };
    state.phase = "choice";
    state.priorityPlayerId = unit.controllerId;
    appendEvent(state, {
      type: "PENDING_CHOICE_CREATED",
      choiceId,
      choiceType: "ABILITY_TARGET_CHOICE",
      playerId: unit.controllerId,
      sourceEffectIds: [],
      message: `${unit.cardName} chooses: heal a friendly unit or gain +${enchant.attackBonus} Attack.`
    });
    return;
  }

  const faerie = getActivationDamageSpellAbility(unit);
  if (faerie) {
    const targets = Object.values(combat.units).filter(
      (candidate) => candidate.controllerId !== unit.controllerId && isUnitAlive(candidate)
    );
    if (targets.length === 0) {
      // No enemy in range of the spell: the activation ability does nothing.
      unit.activationAbilityDone = true;
      return;
    }
    const choiceId = `choice_${nextEventNumber(state)}`;
    state.pendingChoice = {
      id: choiceId,
      type: "ABILITY_TARGET_CHOICE",
      playerId: unit.controllerId,
      kind: "faerie-damage",
      abilityId: faerie.abilityId,
      abilityName: faerie.abilityName,
      prompt: `${unit.cardName}: ${faerie.abilityName} — choose a unit to suffer ${faerie.amount} damage.`,
      sourceUnitId: unit.id,
      anchorUnitId: null,
      candidateUnitIds: targets.map((candidate) => candidate.id),
      amount: faerie.amount
    };
    state.phase = "choice";
    state.priorityPlayerId = unit.controllerId;
    appendEvent(state, {
      type: "PENDING_CHOICE_CREATED",
      choiceId,
      choiceType: "ABILITY_TARGET_CHOICE",
      playerId: unit.controllerId,
      sourceEffectIds: [],
      message: `${unit.cardName} chooses a target for ${faerie.abilityName}.`
    });
    return;
  }
}

/** Whether a reaction play resolves to a Sorrow-style activation-skip effect. */
/**
 * Whether a reaction is a pre-activation interrupt — one that resolves in the
 * UNIT_ACTIVATION_STARTED window before the about-to-act unit moves: Sorrow's
 * activation skip, or Bowstring of the Unicorn's Mane activating one of your
 * ranged units out of order. Used to decide whether to open that window.
 */
function reactionIsPreActivationInterrupt(
  cards: CardLibrary,
  action: Extract<GameAction, { type: "PLAY_REACTION" }>
): boolean {
  const card = cards[action.cardId];
  if (!card) {
    return false;
  }
  const effectType = getEffectiveCardEffect(card, action.optionIndex)?.type;
  return effectType === "SKIP_ACTIVATION" || effectType === "ACTIVATE_RANGED_UNIT";
}

/**
 * Pre-activation interrupt window: before a fresh unit acts, open the window
 * Sorrow (skip the about-to-act unit) and Bowstring of the Unicorn's Mane
 * (activate one of your ranged units out of order) share. Centralized like
 * maybeOpenPlayerActivationChoice so it runs once everything else has settled and
 * never clobbers another window. It opens only when at least one such interrupt
 * is actually playable, and is offered once per activation (preActivationWindowOffered,
 * reset when the unit becomes active) — so multiple interrupt cards across both
 * players are handled by the ordinary reaction-window priority/passing, and a
 * resumed or newly-active unit gets a fresh window without ever looping.
 */
function maybeOpenPreActivationWindow(state: GameState, cards: CardLibrary): void {
  const combat = state.combat;
  if (
    !combat ||
    combat.outcome ||
    combat.setup ||
    combat.awaitingContinue ||
    combat.pendingNeutralStep ||
    state.pendingChoice ||
    state.reactionWindow ||
    state.stack.length > 0
  ) {
    return;
  }

  const unitId = combat.activeUnitId;
  const unit = unitId ? combat.units[unitId] : undefined;
  if (
    !unit ||
    !isUnitAlive(unit) ||
    unit.activatedThisRound ||
    unit.preActivationWindowOffered ||
    unit.movedThisActivation ||
    unit.attackedThisActivation
  ) {
    return;
  }

  // Reuse the UNIT_ACTIVATION_STARTED event setActiveUnit already logged for
  // this unit (the most recent one) as the window's trigger.
  const triggerEvent = [...state.eventLog]
    .reverse()
    .find(
      (event): event is Extract<GameEvent, { type: "UNIT_ACTIVATION_STARTED" }> =>
        event.type === "UNIT_ACTIVATION_STARTED" && event.unitId === unit.id
    );
  if (!triggerEvent) {
    return;
  }

  // Offer the window only when a real pre-activation interrupt is available;
  // mark it offered regardless so we do not recompute it every action.
  const legalReactions = getLegalReactionsForTrigger(state, triggerEvent, cards);
  const hasInterrupt = Object.values(legalReactions).some((actions) =>
    actions.some(
      (legal) => legal.action.type === "PLAY_REACTION" && reactionIsPreActivationInterrupt(cards, legal.action)
    )
  );

  unit.preActivationWindowOffered = true;
  if (!hasInterrupt) {
    return;
  }

  openReactionWindowForTrigger(state, null, triggerEvent, cards);
}

function resetCombatRound(combat: CombatState): void {
  for (const unit of Object.values(combat.units)) {
    unit.activatedThisRound = false;
    unit.movedThisActivation = false;
    unit.attackedThisActivation = false;
    unit.attacksThisActivation = 0;
    unit.retaliatedThisRound = false;
    // Defense tokens persist into the next round: they are discarded at the
    // start of the unit's next activation, not at the end of the round.
  }
}

function refreshReactionWindowLegalReactions(state: GameState, cards: CardLibrary): void {
  if (!state.reactionWindow) {
    return;
  }

  const legalReactions = getLegalReactionsForTrigger(state, state.reactionWindow.triggerEvent, cards);
  const allowedPlayerIds = reactionPlayerOrder(state, legalReactions, state.reactionWindow.triggerEvent);

  state.reactionWindow.legalReactions = legalReactions;
  state.reactionWindow.allowedPlayerIds = allowedPlayerIds;
  state.reactionWindow.passedPlayerIds = state.reactionWindow.passedPlayerIds.filter((playerId) =>
    allowedPlayerIds.includes(playerId)
  );

  if (!allowedPlayerIds.includes(state.reactionWindow.priorityPlayerId)) {
    state.reactionWindow.priorityPlayerId = allowedPlayerIds[0] ?? state.reactionWindow.priorityPlayerId;
  }

  state.priorityPlayerId = state.reactionWindow.priorityPlayerId;
}

function openReactionWindowForTrigger(
  state: GameState,
  stackItem: ResolutionStackItem | null,
  triggerEvent: GameEvent,
  cards: CardLibrary
): boolean {
  const legalReactions = getLegalReactionsForTrigger(state, triggerEvent, cards);
  const allowedPlayerIds = reactionPlayerOrder(state, legalReactions, triggerEvent);

  if (allowedPlayerIds.length === 0) {
    return false;
  }

  const windowId = `reaction_${triggerEvent.id}`;
  // The Sorrow activation-skip window has no paused stack item — nothing is
  // mid-resolution. Every other window pauses the spell/attack being reacted to.
  if (stackItem) {
    stackItem.status = "waiting-for-reaction";
  }
  state.reactionWindow = {
    id: windowId,
    triggerEvent,
    allowedPlayerIds,
    priorityPlayerId: allowedPlayerIds[0],
    legalReactions,
    passedPlayerIds: [],
    closesWhen: "all-pass"
  };
  state.priorityPlayerId = allowedPlayerIds[0];
  state.phase = "reaction";

  appendEvent(state, {
    type: "REACTION_WINDOW_OPENED",
    windowId,
    triggerEventId: triggerEvent.id,
    priorityPlayerId: allowedPlayerIds[0],
    allowedPlayerIds
  });

  return true;
}

/**
 * After Magic Mirror reflects an instant off a still-pending attack, reopen that
 * attack's reaction window (found via the parked stack item's UNIT_ATTACK_DECLARED
 * trigger) so both sides may keep responding — the attack itself never resolved.
 * With no one left able to react, resolve the attack instead.
 */
function resumeAttackWindowAfterRedirect(
  state: GameState,
  stackItem: ResolutionStackItem | undefined,
  cards: CardLibrary
): void {
  if (!stackItem || (stackItem.action.type !== "ATTACK_UNIT" && stackItem.action.type !== "MOVE_AND_ATTACK_UNIT")) {
    return;
  }
  const triggerEvent = stackItem.triggerEventIds
    .map((eventId) => state.eventLog.find((event) => event.id === eventId))
    .find((event): event is Extract<GameEvent, { type: "UNIT_ATTACK_DECLARED" }> => event?.type === "UNIT_ATTACK_DECLARED");
  if (!triggerEvent || !openReactionWindowForTrigger(state, stackItem, triggerEvent, cards)) {
    resolveTopStack(state, cards);
  }
}

/**
 * Rampart Pegasi (Pack) "Magic Damper": every living enemy Pegasi shaves Power
 * off the Spells the caster casts. Summed across all opposing auras; the caller
 * floors the resulting Power at 0.
 */
function enemySpellPowerReduction(state: GameState, casterPlayerId: PlayerId): number {
  const combat = state.combat;
  if (!combat) {
    return 0;
  }
  // Orb of Vulnerability switches off the Pegasi's enemy-spell Power drain.
  if (spellAbilitiesSuppressed(state)) {
    return 0;
  }
  let total = 0;
  for (const unit of Object.values(combat.units)) {
    if (unit.controllerId !== casterPlayerId && isUnitAlive(unit)) {
      total += getEnemySpellPowerReduction(unit);
    }
  }
  return total;
}

function getCurrentSpellPower(state: GameState, stackItem: ResolutionStackItem, cards: CardLibrary): number {
  // (School of Magic permanents add schoolPowerBonus below, beside the
  // once-per-cast Power-card bonus.)
  if (stackItem.action.type !== "CAST_SPELL") {
    return 0;
  }

  // Spell Scroll casts are locked to the lowest power level and cannot be
  // buffed by any source.
  if (stackItem.modifiers.scrollLocked) {
    return 0;
  }

  const card = cards[stackItem.action.cardId];
  const base =
    (card?.power ?? 0) +
    stackItem.modifiers.spellPowerBonus +
    (stackItem.modifiers.schoolPowerBonus ?? 0) +
    (stackItem.modifiers.townCubePowerBonus ?? 0);

  // Elemental Orbs (option A): the matching in-play orb doubles the whole Power
  // brought to a spell of its School ("double the power used for this spell")
  // before the enemy reduction is taken off.
  const doubled = base * getSchoolPowerMultiplier(state, stackItem.action.playerId, card);

  // Rampart Pegasi: an enemy Pegasi pack reduces the Power of every Spell this
  // caster resolves (to a minimum of 0).
  return Math.max(0, doubled - enemySpellPowerReduction(state, stackItem.action.playerId));
}

function shouldRetaliate(
  attacker: CombatUnitState,
  defender: CombatUnitState,
  attackKind: "melee" | "ranged"
): boolean {
  return (
    isUnitAlive(attacker) &&
    isUnitAlive(defender) &&
    attackKind === "melee" &&
    isAdjacent(attacker.position, defender.position) &&
    !hasUnitAbilityEffect(attacker, "IGNORE_RETALIATION") &&
    (!defender.retaliatedThisRound || hasUnitAbilityEffect(defender, "ALLOW_UNLIMITED_RETALIATION"))
  );
}

/**
 * Open the reaction windows for a freshly declared attack (or retaliation).
 * Misfortune is "played immediately when the enemy unit is attacking, before
 * other cards", so a dedicated pre-buff window offering ONLY the defender's
 * Misfortune is tried first (misfortunePhase). If the defender holds no playable
 * Misfortune, the normal attack-declared buff window opens instead; the attack
 * resolves straight away when nobody can react at all. Once Misfortune is played
 * or declined the same window object continues as the normal buff window (see
 * the NEGATE_ATTACK handler and the misfortune-phase handling in passReaction).
 */
function openDeclaredAttackWindow(
  state: GameState,
  stackItem: ResolutionStackItem,
  attackDeclared: GameEvent,
  cards: CardLibrary
): void {
  stackItem.modifiers.misfortunePhase = true;
  if (openReactionWindowForTrigger(state, stackItem, attackDeclared, cards)) {
    return;
  }
  // No Misfortune to offer: fall through to the ordinary attack-declared window.
  stackItem.modifiers.misfortunePhase = false;
  if (!openReactionWindowForTrigger(state, stackItem, attackDeclared, cards)) {
    resolveTopStack(state, cards);
  }
}

function openRetaliationWindow(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  cards: CardLibrary
): void {
  if (!state.combat) {
    return;
  }

  appendEvent(state, {
    type: "RETALIATION_ATTACKED",
    attackerId: defender.id,
    defenderId: attacker.id
  });

  const retaliationAction: Extract<GameAction, { type: "ATTACK_UNIT" }> = {
    type: "ATTACK_UNIT",
    playerId: defender.controllerId,
    attackerId: defender.id,
    defenderId: attacker.id
  };
  const stackItem = makeStackItem(state, retaliationAction);
  // A Magic-Mirror-bounced Curse/Weakness from the original attack applies to its
  // retaliation too (e.g. the bounced Curse lowers the now-defending attacker's
  // Defense as your unit strikes back). One-shot, gone when this stack item pops.
  const redirectedInstants = state.combat.attackSequence?.redirectedInstants;
  if (redirectedInstants && redirectedInstants.length > 0) {
    stackItem.modifiers.redirectedInstants = redirectedInstants;
  }
  state.stack.push(stackItem);

  const attackKind = getAttackKind(defender, attacker);
  // Necropolis Dread Knights (Few): the unit being retaliated against forces
  // the Retaliation Attack to roll 2 dice and resolve the lower result.
  const rollMode = hasRetaliationAgainstDisadvantage(attacker)
    ? "disadvantage"
    : getAttackRollMode(defender, attacker, state);
  const attackDeclared = appendEvent(state, {
    type: "UNIT_ATTACK_DECLARED",
    playerId: defender.controllerId,
    attackerId: defender.id,
    defenderId: attacker.id,
    isRetaliation: true,
    attackKind,
    rollMode
  });
  stackItem.triggerEventIds.push(attackDeclared.id);

  openDeclaredAttackWindow(state, stackItem, attackDeclared, cards);
}

/**
 * Shield of the Dwarven Lords: once the Attack die has been rolled (and any
 * rerolls resolved), give the defender one window to ignore it before the hit
 * lands. The rolled candidate is stashed so the resumed attack reuses it; if no
 * defender can play a die-cancel reaction the attack finishes straight away.
 */
function resolveAttackOrOfferDieCancel(
  state: GameState,
  stackItem: ResolutionStackItem,
  details: NonNullable<ReturnType<typeof getAttackStackDetails>>,
  candidate: AttackRollCandidate,
  cards: CardLibrary
): void {
  if (!stackItem.modifiers.dieCancelOffered && !stackItem.modifiers.attackDieCancelled) {
    const probe: GameEvent = {
      id: "die-settled-probe",
      type: "ATTACK_DIE_SETTLED",
      attackerId: details.attacker.id,
      defenderId: details.defender.id,
      roll: candidate.roll
    };
    const reactions = getLegalReactionsForTrigger(state, probe, cards);
    if (reactionPlayerOrder(state, reactions).length > 0) {
      stackItem.modifiers.rolledCandidate = candidate;
      stackItem.modifiers.dieCancelOffered = true;
      const settled = appendEvent(state, {
        type: "ATTACK_DIE_SETTLED",
        attackerId: details.attacker.id,
        defenderId: details.defender.id,
        roll: candidate.roll
      });
      if (openReactionWindowForTrigger(state, stackItem, settled, cards)) {
        return;
      }
      // No window actually opened (defender lost the option in a race): clear
      // the resume marker and fall through to resolve normally.
      stackItem.modifiers.rolledCandidate = undefined;
    }
  }

  finishResolvedAttack(state, stackItem, details, candidate, cards);
}

function resolveAttackStackItem(state: GameState, stackItem: ResolutionStackItem, cards: CardLibrary): void {
  const combat = state.combat;
  const details = getAttackStackDetails(state, stackItem);
  if (!combat || !details) {
    return;
  }

  // Resuming after the lethal-save window: the die was already rolled, so reuse
  // that outcome instead of rolling again.
  if (stackItem.modifiers.rolledCandidate) {
    finishResolvedAttack(state, stackItem, details, stackItem.modifiers.rolledCandidate, cards);
    return;
  }

  // Bless: "Ignores the Attack die roll" — the die never rolls (outcome 0),
  // so reroll effects have nothing to reroll either.
  if (details.ignoreAttackDie) {
    finishResolvedAttack(state, stackItem, details, { rolls: [0], roll: 0 }, cards);
    return;
  }

  // Slayer: against a gold unit, roll the Attack die N times and apply every
  // result but a "-1" — each "+1" adds 1 to the attack (a "0"/"-1" adds
  // nothing), so the die's whole contribution is the number of "+1"s. Then
  // draw 1 card once the attack has resolved. No reroll choice is opened.
  if (stackItem.modifiers.slayerRolls && stackItem.modifiers.slayerRolls > 0) {
    const rolls = Array.from({ length: stackItem.modifiers.slayerRolls }, () => rollAttackDie(combat));
    const bonus = rolls.filter((roll) => roll === 1).length;
    // Slayer's fire flares over the gold target (the FX layer plays it after the
    // dice read out and the blow lands — see abilityFxPlans.slayer).
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: details.attacker.id,
      abilityId: "slayer",
      targetUnitId: details.defender.id,
      message: `Slayer rolls ${rolls.length} Attack dice against ${details.defender.cardName} (+${bonus}).`
    });
    // sumAllDice: every die counts toward the bonus, so the overlay lights them
    // all (the dice read out before the strike, then the damage lands).
    finishResolvedAttack(state, stackItem, details, { rolls, roll: bonus, sumAllDice: true }, cards);
    if (stackItem.modifiers.slayerDraw) {
      stackItem.modifiers.slayerDraw = false;
      drawCardsForPlayer(state, details.attacker.controllerId, 1);
    }
    return;
  }

  // Mummies (defence): "set the opponent's Attack die to -1." While a Mummy is
  // the defender the attacker's die is forced — no roll, no reroll.
  const forcedDie = getForcedAttackerDie(details.defender);
  if (forcedDie !== null) {
    finishResolvedAttack(state, stackItem, details, { rolls: [forcedDie], roll: forcedDie }, cards);
    return;
  }

  // Neutral Champions: "roll 2 Attack dice and apply both outcomes" — reroll
  // each "-1" once, then sum both faces. The reroll is intrinsic to the ability,
  // so no separate reroll choice is opened.
  const applyBoth = getRollTwoDiceApplyBoth(details.attacker);
  if (applyBoth) {
    resolveAttackOrOfferDieCancel(state, stackItem, details, rollApplyBothCandidate(combat, applyBoth.rerollMinusOnce), cards);
    return;
  }

  const candidate = rollAttackCandidate(combat, details.rollMode);
  const rerollEffects = getAttackRerollEffects(state, {
    attacker: details.attacker,
    defender: details.defender,
    attackKind: details.attackKind
  }).filter((effect) => !effect.usedChoiceIds.includes(stackItem.id));
  // Champions' "Charge" only offers its reroll when the unit moved to attack
  // (never on a Retaliation Attack, where it did not move).
  const moved = !details.isRetaliation && Boolean(details.attacker.movedThisActivation);
  const rerollSources = buildRerollSources(state, details.attacker, rerollEffects, moved);

  // Only pause when a source can actually fire on this roll — the Crusaders'
  // 'every "0"' reroll never interrupts a +1.
  if (rerollSources.some((source) => rerollSourceAvailableFor(source, candidate.roll))) {
    openAttackRerollChoice(state, stackItem, details, candidate, rerollSources);
    return;
  }

  resolveAttackOrOfferDieCancel(state, stackItem, details, candidate, cards);
}

/**
 * Where the resolved spell card physically ends up. Ongoing spells (anything
 * that left lasting effects on the table) are held in play until those
 * effects end; instants follow the deferred Knowledge/Mysticism recall or the
 * Crazy Wizard astrologers card, and otherwise simply stay in the discard.
 */
function finalizeSpellCardDestination(
  state: GameState,
  stackItem: ResolutionStackItem,
  effectCountBeforeCast: number
): void {
  if (stackItem.action.type !== "CAST_SPELL") {
    return;
  }

  // Spell Scroll casts were already removed from the game when played, and Helm
  // of the Alabaster Unicorn casts (fromSpellDeck) leave their spell in the
  // shared Spell-deck discard pile — in both cases there is no card in
  // hand/discard to hold ongoing, recall, or send to the discard. Any ongoing
  // effect they created still lives on in activeEffects.
  if (stackItem.modifiers.scrollLocked || stackItem.modifiers.fromSpellDeck) {
    return;
  }

  const playerId = stackItem.action.playerId;
  const cardId = stackItem.action.cardId;
  const recall = stackItem.modifiers.recallSpell;

  const held = holdOngoingCardIfEffectCreated(
    state,
    playerId,
    cardId,
    effectCountBeforeCast,
    recall?.toHand ? "hand" : "discard"
  );

  if (!held) {
    if (recall?.toHand) {
      returnSpellFromDiscardToHand(state, playerId, cardId);
    } else {
      maybeReturnFirstSpellToHand(state, playerId, cardId);
    }
  }

  // Mysticism expert: the support cards played with the spell come back at
  // once (they resolved on the spot — only the spell itself can be ongoing).
  if (recall?.recallPlayedCards) {
    const caster = state.players[playerId];
    for (const playedCardId of stackItem.modifiers.playedCardIds) {
      const playedIndex = caster.discard.lastIndexOf(playedCardId);
      if (playedIndex !== -1) {
        caster.discard.splice(playedIndex, 1);
        caster.hand.push(playedCardId);
      }
    }
  }
}

function resolveTopStack(state: GameState, cards: CardLibrary): void {
  const stackItem = state.stack.at(-1);
  if (!stackItem) {
    state.phase = "combat";
    state.priorityPlayerId = null;
    return;
  }

  stackItem.status = "resolving";

  if (stackItem.action.type === "CAST_SPELL") {
    const card = cards[stackItem.action.cardId];
    // Snapshot for the ongoing rule: effects created below mark this card as
    // staying in play until they end.
    const effectCountBeforeCast = state.activeEffects.length;

    // Rampart Dwarves "Magic Resistance": a spell aimed at a Dwarf rolls a die
    // to shrug it off. On the matching face the spell still resolves (and is
    // discarded) but applies none of its effects to the Dwarf.
    if (negatesCardOnDwarfRoll(state, stackItem.action.target, card?.name ?? "the spell")) {
      appendEvent(state, {
        type: "SPELL_CAST_RESOLVED",
        playerId: stackItem.action.playerId,
        spellCardId: stackItem.action.cardId,
        target: stackItem.action.target,
        power: getCurrentSpellPower(state, stackItem, cards)
      });
      finalizeSpellCardDestination(state, stackItem, effectCountBeforeCast);
      stackItem.status = "resolved";
      state.stack.pop();
      if (finishCombatIfNeeded(state)) {
        return;
      }
      state.phase = "combat";
      state.priorityPlayerId = null;
      return;
    }

    // Recanter's Cloak: a global spell-cast restriction wipes this cast out —
    // a total lock (option B) or a Power below the floor (option A's "no spells
    // with Power 0", so an unboosted cast does nothing). The spell still
    // resolves and is discarded, applying none of its effects, exactly like a
    // shrugged-off Dwarf roll above. Re-reads the final Power so a Power card
    // played into the cast window lifts an option-A cast over the floor.
    if (spellNullifiedByRestriction(state, getCurrentSpellPower(state, stackItem, cards))) {
      appendEvent(state, {
        type: "SPELL_CAST_RESOLVED",
        playerId: stackItem.action.playerId,
        spellCardId: stackItem.action.cardId,
        target: stackItem.action.target,
        power: getCurrentSpellPower(state, stackItem, cards)
      });
      finalizeSpellCardDestination(state, stackItem, effectCountBeforeCast);
      stackItem.status = "resolved";
      state.stack.pop();
      if (finishCombatIfNeeded(state)) {
        return;
      }
      state.phase = "combat";
      state.priorityPlayerId = null;
      return;
    }

    if (card?.effect.type === "EARTHQUAKE" && state.combat?.siege) {
      resolveEarthquakeSpell(state, stackItem.action.playerId, getCurrentSpellPower(state, stackItem, cards));
    }

    if (card?.effect.type === "DEAL_DAMAGE" && state.combat && stackItem.action.target.type === "unit") {
      const target = state.combat.units[stackItem.action.target.unitId];
      if (target) {
        const power = getCurrentSpellPower(state, stackItem, cards);
        const rawAmount = getSpellDamageAmount(card, power);
        // Spell/Specialty immunity (Orb of Inhibition's global nullify and the
        // Pendant's school immunity included) zeroes the hit; otherwise "reduce
        // spell damage by N" applies to Spell-kind damage only.
        const amount = unitIgnoresCardDamage(state, target, card)
          ? 0
          : card.effect.damageKind === "spell"
            ? reducedSpellDamage(state, target, rawAmount)
            : rawAmount;
        target.damage += amount;
        noteUnitDamagedForTokens(state, target, amount);
        appendEvent(state, {
          type: "DAMAGE_ASSIGNED",
          source: {
            type: "card",
            cardId: card.id,
            controllerId: stackItem.action.playerId
          },
          target: stackItem.action.target,
          amount,
          damageKind: card.effect.damageKind
        });
        markUnitRemovedIfNeeded(state, target);
      }
    }

    if (card?.effect.type === "HEAL_DAMAGE" && state.combat && stackItem.action.target.type === "unit") {
      const target = state.combat.units[stackItem.action.target.unitId];
      if (target) {
        const power = getCurrentSpellPower(state, stackItem, cards);
        const amount = getSpellDamageAmount(card, power);
        healUnitDamage(
          state,
          {
            type: "card",
            cardId: card.id,
            controllerId: stackItem.action.playerId
          },
          stackItem.action.target,
          amount
        );
      }
    }

    if (card?.effect.type === "HEAL_DAMAGE_AND_REMOVE_EFFECTS" && state.combat && stackItem.action.target.type === "unit") {
      const power = getCurrentSpellPower(state, stackItem, cards);
      const amount = getSpellDamageAmount(card, power);
      const source = {
        type: "card" as const,
        cardId: card.id,
        controllerId: stackItem.action.playerId
      };
      healUnitDamage(state, source, stackItem.action.target, amount);
      removeEffectsFromTarget(state, source, stackItem.action.target, card.effect.removePolarity);
      // Cure: "Remove any effect or paralysis …" — the chosen unit also loses
      // its Paralysis token (the effect removes the token, not just ongoing
      // effects). A heal of 0 still clears it.
      if (card.effect.removeParalysis) {
        const unit = state.combat.units[stackItem.action.target.unitId];
        if (unit && hasToken(unit, "paralysis")) {
          removeToken(state, unit, "paralysis", "dispelled");
        }
      }
    }

    if (card?.effect.type === "CREATE_ACTIVE_EFFECT") {
      createActiveEffectFromCard(
        state,
        card,
        card.effect,
        stackItem.action.playerId,
        "basic",
        stackItem.action.target.type === "unit" ? stackItem.action.target : undefined
      );
    }

    if (card?.effect.type === "CREATE_ATTACK_BUFF" && stackItem.action.target.type === "unit") {
      createAttackBuffFromCard(
        state,
        card,
        card.effect,
        stackItem.action.playerId,
        getCurrentSpellPower(state, stackItem, cards),
        stackItem.action.target
      );
    }

    if (card?.effect.type === "CREATE_DEFENSE_BUFF" && stackItem.action.target.type === "unit") {
      createDefenseBuffFromCard(
        state,
        card,
        stackItem.action.playerId,
        getCurrentSpellPower(state, stackItem, cards),
        stackItem.action.target
      );
    }

    if (card?.effect.type === "CREATE_ATTACK_DIE_REROLL") {
      createAttackRerollEffectFromCard(
        state,
        card,
        stackItem.action.playerId,
        "basic",
        getCurrentSpellPower(state, stackItem, cards)
      );
    }

    if (card?.effect.type === "DRAW_CARDS") {
      drawCardsForPlayer(state, stackItem.action.playerId, getEffectAmount(card.effect, "basic"));
    }

    if (card?.effect.type === "CREATE_INITIATIVE_BUFF" && state.combat && stackItem.action.target.type === "unit") {
      const power = getCurrentSpellPower(state, stackItem, cards);
      const targetUnit = state.combat.units[stackItem.action.target.unitId];
      const amount = doubleAmountForUnitName(
        getAmountByPower(card.effect.amountByPower, card.effect.amount ?? 0, power),
        targetUnit,
        card.effect.doubleForUnitName
      );
      createActiveEffect(
        state,
        {
          name: card.effect.name,
          scope: "unit",
          duration: card.effect.duration,
          polarity: card.effect.polarity ?? (amount >= 0 ? "positive" : "negative"),
          removable: card.effect.removable ?? true,
          modifiers: [{ type: "INITIATIVE_BONUS", amount }]
        },
        { type: "card", cardId: card.id, controllerId: stackItem.action.playerId },
        stackItem.action.playerId,
        stackItem.action.target
      );
    }

    if (card?.effect.type === "CREATE_SPELL_IMMUNITY" && state.combat && stackItem.action.target.type === "unit") {
      const power = getCurrentSpellPower(state, stackItem, cards);
      const maxGrade = gradeAtPower(card.effect.gradeByPower, power);
      const target = state.combat.units[stackItem.action.target.unitId];
      if (target && maxGrade && gradeRank(target.grade) <= gradeRank(maxGrade)) {
        createActiveEffect(
          state,
          {
            name: card.name,
            scope: "unit",
            duration: card.effect.duration,
            polarity: "positive",
            removable: true,
            modifiers: [{ type: "UNIT_SPELL_IMMUNE", maxGrade }]
          },
          { type: "card", cardId: card.id, controllerId: stackItem.action.playerId },
          stackItem.action.playerId,
          stackItem.action.target
        );
      }
    }

    if (card?.effect.type === "CREATE_FIRE_SHIELD" && state.combat && stackItem.action.target.type === "unit") {
      createFireShieldFromCard(
        state,
        card,
        card.effect,
        stackItem.action.playerId,
        getCurrentSpellPower(state, stackItem, cards),
        stackItem.action.target
      );
    }

    // Chain Lightning Spell: hit the selected unit, then fork to the units
    // closest to it. The allocation (1/1/1, 2/1/1, 3/2/1) scales with Power.
    if (card?.effect.type === "CHAIN_LIGHTNING" && state.combat && stackItem.action.target.type === "unit") {
      const power = getCurrentSpellPower(state, stackItem, cards);
      startChainLightning(
        state,
        stackItem.action.playerId,
        card,
        stackItem.action.target.unitId,
        chainLightningDamages(card.effect, power)
      );
    }

    // Blind: place a Paralysis token on the selected enemy unit, gated by the
    // Power paid (0 → bronze, 1 → silver, 2 → gold). Above the unlocked grade
    // the cast does nothing — mirrors Anti-Magic's resolution-time gate. A unit
    // that cannot gain Paralysis (the printed ignore-paralysis ability, or a
    // Pendant of Second Sight immunity) shrugs the token off all the same.
    if (card?.effect.type === "PLACE_PARALYSIS" && state.combat && stackItem.action.target.type === "unit") {
      const power = getCurrentSpellPower(state, stackItem, cards);
      const maxGrade = gradeAtPower(card.effect.gradeByPower, power);
      const target = state.combat.units[stackItem.action.target.unitId];
      if (target && maxGrade && gradeRank(target.grade) <= gradeRank(maxGrade)) {
        if (unitImmuneToParalysis(state, target)) {
          appendEvent(state, {
            type: "UNIT_ABILITY_TRIGGERED",
            unitId: target.id,
            abilityId: "ignore-paralysis",
            targetUnitId: target.id,
            message: `${target.cardName} is immune to Paralysis.`
          });
        } else {
          placeCombatToken(state, target, "paralysis", 0, card.name);
        }
      }
    }

    // Inferno: roll the Attack die N times (by Power) on the chosen space; each
    // "+1" deals 1 damage to every unit on that space and the orthogonally
    // adjacent ones — friend or foe alike.
    if (card?.effect.type === "INFERNO" && state.combat && stackItem.action.target.type === "space") {
      resolveInfernoSpell(
        state,
        stackItem.action.playerId,
        card,
        stackItem.action.target.position,
        getAmountByPower(card.effect.rollsByPower, 1, getCurrentSpellPower(state, stackItem, cards))
      );
    }

    // Frost Ring: select a space; the units adjacent to it (NOT the centre)
    // suffer the power-scaled damage, friend or foe. Up to two are hit; with more
    // adjacent units the caster picks which (resolveAreaPickDamage). Targets a
    // space, so it may be centred on an occupied cell.
    if (card?.effect.type === "AREA_DAMAGE_PICK_ADJACENT" && state.combat) {
      const power = getCurrentSpellPower(state, stackItem, cards);
      const amount = card.effect.amount ?? getAmountByPower(card.effect.amountByPower ?? {}, 1, power);
      const center =
        stackItem.action.target.type === "space"
          ? stackItem.action.target.position
          : stackItem.action.target.type === "unit"
            ? state.combat.units[stackItem.action.target.unitId]?.position
            : undefined;
      if (center !== undefined) {
        resolveAreaPickDamage(
          state,
          stackItem.action.playerId,
          card,
          center,
          amount,
          card.effect.includeCenter,
          card.effect.adjacentPicks
        );
      }
    }

    // Dispel: strip every removable ongoing effect from the selected unit, gated
    // by the Power-reached grade (0 → bronze, 1 → silver, 2 → gold) just like
    // Anti-Magic / Blind. Casting above the unlocked grade does nothing.
    if (card?.effect.type === "DISPEL_EFFECTS" && state.combat && stackItem.action.target.type === "unit") {
      const power = getCurrentSpellPower(state, stackItem, cards);
      const maxGrade = gradeAtPower(card.effect.gradeByPower, power);
      const target = state.combat.units[stackItem.action.target.unitId];
      if (target && maxGrade && gradeRank(target.grade) <= gradeRank(maxGrade)) {
        removeEffectsFromTarget(
          state,
          { type: "card", cardId: card.id, controllerId: stackItem.action.playerId },
          stackItem.action.target,
          "any-removable"
        );
      }
    }

    // Forgetfulness: the selected enemy ranged unit cannot attack during its
    // next activation. The reachable grade rises with the Power paid; above it
    // the cast does nothing (the Anti-Magic/Blind gate).
    if (card?.effect.type === "FORGETFULNESS" && state.combat && stackItem.action.target.type === "unit") {
      const power = getCurrentSpellPower(state, stackItem, cards);
      const maxGrade = gradeAtPower(card.effect.gradeByPower, power);
      const target = state.combat.units[stackItem.action.target.unitId];
      if (target && maxGrade && gradeRank(target.grade) <= gradeRank(maxGrade)) {
        createActiveEffect(
          state,
          {
            name: card.name,
            scope: "unit",
            duration: { type: "next-activation" },
            polarity: "negative",
            removable: true,
            modifiers: [{ type: "UNIT_CANNOT_ATTACK" }]
          },
          { type: "card", cardId: card.id, controllerId: stackItem.action.playerId },
          stackItem.action.playerId,
          stackItem.action.target
        );
      }
    }

    // Berserk: the selected unit must attack the nearest unit on its next
    // activation. Grade-gated like Blind; above the unlocked grade the cast does
    // nothing. The forced "attack the nearest" rule lives in the legal-action
    // layer and the neutral AI (both read the BERSERK_FORCED_ATTACK effect).
    if (card?.effect.type === "BERSERK" && state.combat && stackItem.action.target.type === "unit") {
      const power = getCurrentSpellPower(state, stackItem, cards);
      const maxGrade = gradeAtPower(card.effect.gradeByPower, power);
      const target = state.combat.units[stackItem.action.target.unitId];
      if (target && maxGrade && gradeRank(target.grade) <= gradeRank(maxGrade)) {
        createActiveEffect(
          state,
          {
            name: card.name,
            scope: "unit",
            duration: { type: "next-activation" },
            polarity: "negative",
            removable: true,
            modifiers: [{ type: "BERSERK_FORCED_ATTACK" }]
          },
          { type: "card", cardId: card.id, controllerId: stackItem.action.playerId },
          stackItem.action.playerId,
          stackItem.action.target
        );
      }
    }

    // Teleport: move the selected unit to a chosen empty space, ignoring
    // obstacles and distance. Grade-gated like Anti-Magic; above the unlocked
    // grade the cast does nothing. The destination is picked in a follow-up
    // (the combat-teleport choice), resolved by resolveTeleportChoice.
    if (card?.effect.type === "TELEPORT_UNIT" && state.combat && stackItem.action.target.type === "unit") {
      const power = getCurrentSpellPower(state, stackItem, cards);
      const maxGrade = gradeAtPower(card.effect.gradeByPower, power);
      const target = state.combat.units[stackItem.action.target.unitId];
      if (target && maxGrade && gradeRank(target.grade) <= gradeRank(maxGrade)) {
        openTeleportChoice(state, stackItem.action.playerId, target);
      }
    }

    // Clone: place a 1-Health copy of the selected allied unit on an adjacent
    // empty space. Grade-gated by the Power paid (1 → bronze, 3 → silver,
    // 5 → gold). If the Power paid does not reach the chosen unit's grade (e.g.
    // a silver unit needs Power 3 but only 2 was paid), the cast is REFUNDED
    // rather than wasted — the Clone card and the Power spent on it return to
    // hand, a notice explains, and the caster goes back to the battle screen
    // (nothing lost). On success the destination is picked in a follow-up (the
    // combat-clone OPTION_CHOICE), resolved by resolveCloneChoice.
    if (card?.effect.type === "CLONE_UNIT" && state.combat && stackItem.action.target.type === "unit") {
      const power = getCurrentSpellPower(state, stackItem, cards);
      const maxGrade = gradeAtPower(card.effect.gradeByPower, power);
      const target = state.combat.units[stackItem.action.target.unitId];
      if (target && maxGrade && gradeRank(target.grade) <= gradeRank(maxGrade)) {
        // Grade reached: if the unit somehow has no adjacent empty space left,
        // refund too (nothing was placed) rather than swallow the cast.
        if (!openCloneChoice(state, stackItem.action.playerId, target)) {
          refundInsufficientCloneCast(
            state,
            stackItem,
            target,
            `${target.cardName} has no adjacent empty space to place a Clone — the spell was returned to your hand.`
          );
          return;
        }
      } else if (target) {
        const required = powerRequiredForGrade(card.effect.gradeByPower, target.grade);
        const need = required === null ? "more" : `Power ${required}`;
        refundInsufficientCloneCast(
          state,
          stackItem,
          target,
          `Not enough Power to Clone ${target.cardName} (a ${target.grade} unit needs ${need}, you paid Power ${power}) — the spell was returned to your hand.`
        );
        return;
      }
    }

    // Disrupting Ray: until the end of the Combat the selected enemy unit cannot
    // use its special ability. Grade-gated like Blind (0 → bronze, 1 → silver,
    // 2 → gold); above the unlocked grade the cast does nothing. Backed by a
    // combat-scoped UNIT_ABILITY_SUPPRESSED effect. The target read here is the
    // pending cast's target, so a Magic-Mirror redirect lands the suppression on
    // the bounced unit instead.
    if (card?.effect.type === "DISRUPTING_RAY" && state.combat && stackItem.action.target.type === "unit") {
      const power = getCurrentSpellPower(state, stackItem, cards);
      const maxGrade = gradeAtPower(card.effect.gradeByPower, power);
      const target = state.combat.units[stackItem.action.target.unitId];
      if (target && maxGrade && gradeRank(target.grade) <= gradeRank(maxGrade)) {
        createActiveEffect(
          state,
          {
            name: card.name,
            scope: "unit",
            duration: { type: "combat" },
            polarity: "negative",
            removable: true,
            modifiers: [{ type: "UNIT_ABILITY_SUPPRESSED" }]
          },
          { type: "card", cardId: card.id, controllerId: stackItem.action.playerId },
          stackItem.action.playerId,
          stackItem.action.target
        );
      }
    }

    // Sacrifice: transfer the chosen (damaged, grade-gated) unit's wounds onto
    // another of your units, which perishes. The heal target is the cast target;
    // the sacrifice is picked in a follow-up ABILITY_TARGET_CHOICE. Grade-gated
    // (0/2/4 → bronze/silver/gold) on the HEAL target; above the unlocked grade,
    // or with nothing to transfer / no other unit to spend, the cast does nothing.
    if (card?.effect.type === "SACRIFICE_TRANSFER" && state.combat && stackItem.action.target.type === "unit") {
      const power = getCurrentSpellPower(state, stackItem, cards);
      const maxGrade = gradeAtPower(card.effect.gradeByPower, power);
      const healTarget = state.combat.units[stackItem.action.target.unitId];
      const eligible =
        Boolean(healTarget) &&
        maxGrade !== null &&
        gradeRank(healTarget!.grade) <= gradeRank(maxGrade) &&
        healTarget!.damage > 0;
      const candidates = eligible
        ? Object.values(state.combat.units).filter(
            (unit) =>
              unit.id !== healTarget!.id &&
              unit.controllerId === stackItem.action.playerId &&
              isUnitAlive(unit)
          )
        : [];
      if (healTarget && candidates.length > 0) {
        const choiceId = `choice_${nextEventNumber(state)}`;
        state.pendingChoice = {
          id: choiceId,
          type: "ABILITY_TARGET_CHOICE",
          playerId: stackItem.action.playerId,
          kind: "sacrifice-transfer",
          abilityId: card.id,
          abilityName: card.name,
          prompt: `${card.name}: choose another of your units to sacrifice — it absorbs ${healTarget.cardName}'s wounds and may perish.`,
          sourceUnitId: healTarget.id,
          anchorUnitId: healTarget.id,
          candidateUnitIds: candidates.map((unit) => unit.id),
          optional: false
        };
        appendEvent(state, {
          type: "PENDING_CHOICE_CREATED",
          choiceId,
          choiceType: "ABILITY_TARGET_CHOICE",
          playerId: stackItem.action.playerId,
          sourceEffectIds: [],
          message: `${card.name}: choose a unit to sacrifice.`
        });
      }
    }

    if (card?.effect.type === "CLEAR_RETALIATION" && state.combat && stackItem.action.target.type === "unit") {
      const power = getCurrentSpellPower(state, stackItem, cards);
      const maxGrade = gradeAtPower(card.effect.gradeByPower, power);
      const target = state.combat.units[stackItem.action.target.unitId];
      if (target && maxGrade && gradeRank(target.grade) <= gradeRank(maxGrade) && target.retaliatedThisRound) {
        target.retaliatedThisRound = false;
        appendEvent(state, {
          type: "UNIT_ABILITY_TRIGGERED",
          unitId: target.id,
          abilityId: "counterstrike",
          message: `${card.name} readies ${target.cardName} to retaliate again.`
        });
      }
    }

    if (card?.effect.type === "ADD_UNIT_MAX_HEALTH" && state.combat && stackItem.action.target.type === "unit") {
      const target = state.combat.units[stackItem.action.target.unitId];
      if (target && target.controllerId === stackItem.action.playerId) {
        target.maxHealth += doubleAmountForUnitName(card.effect.amount, target, card.effect.doubleForUnitName);
      }
    }

    if (card?.effect.type === "AREA_DAMAGE_ADJACENT" && state.combat && stackItem.action.target.type === "unit") {
      const target = state.combat.units[stackItem.action.target.unitId];
      const power = getCurrentSpellPower(state, stackItem, cards);
      const amount = getAmountByPower(card.effect.amountByPower, 1, power);
      if (target) {
        // The primary target's own spell-damage reduction applies here; the
        // splash keeps the raw `amount` and is reduced per splash-target below.
        const dealt = reducedCardDamage(state, target, card, amount);
        target.damage += dealt;
        noteUnitDamagedForTokens(state, target, dealt);
        appendEvent(state, {
          type: "DAMAGE_ASSIGNED",
          source: { type: "card", cardId: card.id, controllerId: stackItem.action.playerId },
          target: stackItem.action.target,
          amount: dealt,
          damageKind: "spell"
        });
        markUnitRemovedIfNeeded(state, target);

        // "Select 2 adjacent places": the caster picks one unit adjacent to
        // the target for the same damage (the second space may be empty). A
        // unit immune to this Spell's school (an Elemental) is not a candidate.
        const splashCandidates = Object.values(state.combat.units).filter(
          (unit) =>
            unit.id !== target.id &&
            isUnitAlive(unit) &&
            isAdjacent(unit.position, target.position) &&
            !unitImmuneToSpellSchoolsByEffect(state, unit, card.spellSchools) &&
            (spellAbilitiesSuppressed(state) || !unitImmuneToSpellSchools(unit, card.spellSchools))
        );
        if (splashCandidates.length > 0) {
          const choiceId = `choice_${nextEventNumber(state)}`;
          state.pendingChoice = {
            id: choiceId,
            type: "ABILITY_TARGET_CHOICE",
            playerId: stackItem.action.playerId,
            kind: "spell-splash",
            abilityId: null,
            abilityName: card.name,
            prompt: `${card.name}: choose a second unit adjacent to the target (${amount} damage), or skip.`,
            sourceUnitId: target.id,
            anchorUnitId: target.id,
            candidateUnitIds: splashCandidates.map((unit) => unit.id),
            amount,
            optional: true
          };
          appendEvent(state, {
            type: "PENDING_CHOICE_CREATED",
            choiceId,
            choiceType: "ABILITY_TARGET_CHOICE",
            playerId: stackItem.action.playerId,
            sourceEffectIds: [],
            message: `${card.name} may scorch a second unit.`
          });
        }
      }
    }

    if (card?.effect.type === "SUMMON_ELEMENTAL" && state.combat && stackItem.action.target.type === "space") {
      // Power 4 summons a Pack, Power 2 a Few; Power 0 has no effect.
      const power = getCurrentSpellPower(state, stackItem, cards);
      const side: "few" | "pack" | null = power >= 4 ? "pack" : power >= 2 ? "few" : null;
      const position = stackItem.action.target.position;
      if (side) {
        const summoned = placeSummonedUnit(state, stackItem.action.playerId, card.effect.unitDefId, side, position);
        if (summoned) {
          appendEvent(state, {
            type: "UNIT_ABILITY_TRIGGERED",
            unitId: summoned.id,
            abilityId: card.id,
            message: `${state.players[stackItem.action.playerId]?.name ?? "A hero"} casts ${card.name}: ${summoned.cardName} appears at ${getBattlefieldLabel(position)}.`
          });
        }
      }
    }

    // Force Field (Basic Earth): drop an Obstacle on the chosen empty space.
    // Its span grows with Power — Power 0: this Combat round, 1: the next, 2: the
    // whole Combat — and while it stands it blocks non-flying movement.
    if (card?.effect.type === "PLACE_FORCE_FIELD" && state.combat && stackItem.action.target.type === "space") {
      const power = getCurrentSpellPower(state, stackItem, cards);
      const duration = durationAtPower(card.effect.durationByPower, power) ?? { type: "combat" };
      addBattlefieldToken(state, {
        kind: "force_field",
        position: stackItem.action.target.position,
        controllerId: stackItem.action.playerId,
        expiresAtCombatRoundEnd: forceFieldExpiry(state.combat, duration)
      });
    }

    // Fire Wall (Basic Fire): drop an Effect Obstacle on the chosen empty space
    // for the whole Combat; the damage it deals scales with Power (0/2/4 -> 1/2/3).
    if (card?.effect.type === "PLACE_FIRE_WALL" && state.combat && stackItem.action.target.type === "space") {
      const power = getCurrentSpellPower(state, stackItem, cards);
      addBattlefieldToken(state, {
        kind: "fire_wall",
        position: stackItem.action.target.position,
        controllerId: stackItem.action.playerId,
        damage: getAmountByPower(card.effect.damageByPower, 1, power)
      });
    }

    // Quicksand (Basic Earth) / Land Mine (Expert Fire): place the first of
    // 2/4/6 face-down tokens on the cast's space, then open the caster's picker
    // for the rest (the place-battlefield-tokens choice).
    if (card?.effect.type === "PLACE_HIDDEN_TOKENS" && state.combat && stackItem.action.target.type === "space") {
      const power = getCurrentSpellPower(state, stackItem, cards);
      const count = getAmountByPower(card.effect.countByPower, 2, power);
      beginHiddenTokenPlacement(
        state,
        stackItem.action.playerId,
        card.effect.tokenKind,
        count,
        card.effect.triggerDamage,
        stackItem.action.target.position
      );
    }

    appendEvent(state, {
      type: "SPELL_CAST_RESOLVED",
      playerId: stackItem.action.playerId,
      spellCardId: stackItem.action.cardId,
      target: stackItem.action.target,
      power: getCurrentSpellPower(state, stackItem, cards)
    });

    finalizeSpellCardDestination(state, stackItem, effectCountBeforeCast);

    stackItem.status = "resolved";
    state.stack.pop();

    if (finishCombatIfNeeded(state)) {
      return;
    }

    // Fireball's second-target choice stays open after the cast resolves.
    if (state.pendingChoice) {
      state.phase = "choice";
      state.priorityPlayerId = state.pendingChoice.playerId;
      return;
    }

    state.phase = "combat";
    state.priorityPlayerId = null;
    return;
  }

  if (stackItem.action.type === "ATTACK_UNIT" || stackItem.action.type === "MOVE_AND_ATTACK_UNIT") {
    resolveAttackStackItem(state, stackItem, cards);
    return;
  }

  stackItem.status = "resolved";
  state.stack.pop();
  if (finishCombatIfNeeded(state)) {
    return;
  }
  state.phase = "combat";
  state.priorityPlayerId = null;
}

/**
 * Ongoing rule: a card whose play created lasting effects stays physically in
 * play — it is pulled out of the discard pile into the player's held zone and
 * only released (to the discard, or the hand when recalled) once every effect
 * it created has ended. Returns true when the card was held.
 */
function holdOngoingCardIfEffectCreated(
  state: GameState,
  playerId: PlayerId,
  cardId: CardId,
  effectCountBefore: number,
  returnTo: "discard" | "hand"
): boolean {
  const player = state.players[playerId];
  if (!player) {
    return false;
  }

  const createdEffects = state.activeEffects
    .slice(effectCountBefore)
    .filter((effect) => effect.source.type === "card" && effect.source.cardId === cardId);
  if (createdEffects.length === 0) {
    return false;
  }

  const discardIndex = player.discard.lastIndexOf(cardId);
  if (discardIndex === -1) {
    return false;
  }

  player.discard.splice(discardIndex, 1);
  player.ongoingCards = player.ongoingCards ?? [];
  player.ongoingCards.push({
    cardId,
    effectIds: createdEffects.map((effect) => effect.id),
    returnTo
  });
  return true;
}

/** Knowledge/Mysticism on an instant spell: the card comes back right away. */
function returnSpellFromDiscardToHand(state: GameState, playerId: PlayerId, cardId: CardId): void {
  const player = state.players[playerId];
  const discardIndex = player?.discard.lastIndexOf(cardId) ?? -1;
  if (!player || discardIndex === -1) {
    return;
  }

  player.discard.splice(discardIndex, 1);
  player.hand.push(cardId);
  appendEvent(state, {
    type: "SPELL_RETURNED_TO_HAND",
    playerId,
    cardId,
    reason: "Knowledge/Mysticism"
  });
}

/**
 * Astrologers — Crazy Wizard: until the next Astrologers round, the first
 * spell card each player plays returns to their hand instead of staying in
 * the discard pile.
 */
function maybeReturnFirstSpellToHand(state: GameState, playerId: PlayerId, cardId: string): void {
  const astrologers = state.adventure?.astrologers;
  if (!astrologers || getActiveAstrologersCard(state)?.effect.type !== "FIRST_SPELL_RETURNS") {
    return;
  }

  if (astrologers.crazyWizardUsedBy.includes(playerId)) {
    return;
  }

  const player = state.players[playerId];
  const discardIndex = player?.discard.lastIndexOf(cardId) ?? -1;
  if (!player || discardIndex === -1) {
    return;
  }

  player.discard.splice(discardIndex, 1);
  player.hand.push(cardId);
  astrologers.crazyWizardUsedBy.push(playerId);
  appendEvent(state, {
    type: "SPELL_RETURNED_TO_HAND",
    playerId,
    cardId,
    reason: "Crazy Wizard"
  });
}

function closeReactionWindow(state: GameState, reason: "all-pass" | "reaction-played"): void {
  if (!state.reactionWindow) {
    return;
  }

  appendEvent(state, {
    type: "REACTION_WINDOW_CLOSED",
    windowId: state.reactionWindow.id,
    reason
  });
  state.reactionWindow = null;
  state.priorityPlayerId = null;
}

/**
 * Familiars' "Mana Leech": while a living enemy Familiar is in the combat, a
 * player who casts a Spell from hand must discard one extra random card. Scroll
 * casts are not "from hand" and are exempt.
 */
function applyEnemySpellHandTax(state: GameState, casterId: PlayerId): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }
  const familiar = Object.values(combat.units).find(
    (unit) => unit.controllerId !== casterId && isUnitAlive(unit) && hasSpellCastHandTax(unit)
  );
  if (!familiar) {
    return;
  }
  const discarded = discardRandomCardFromHand(state, casterId);
  if (discarded) {
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: familiar.id,
      abilityId: "familiar-spell-tax",
      message: `${familiar.cardName} leeches a card from the spellcaster's hand.`
    });
  }
}

/**
 * Tower Magi (Pack) "[activation] +N power to the first spell you cast this
 * round": the bonus is only available while the Magi is the active unit — i.e.
 * during its own turn — so this reads the boost off the currently-active unit
 * when it belongs to the caster. 0 at any other time (off-turn, another unit
 * active, no combat).
 */
function activeUnitSpellPowerBoostFor(state: GameState, playerId: PlayerId): number {
  const combat = state.combat;
  const activeUnit = combat?.activeUnitId ? combat.units[combat.activeUnitId] : undefined;
  if (!activeUnit || activeUnit.controllerId !== playerId) {
    return 0;
  }
  return getActivationSpellPowerBoost(activeUnit);
}

function castSpell(state: GameState, action: Extract<GameAction, { type: "CAST_SPELL" }>, cards: CardLibrary): void {
  const card = cards[action.cardId];
  if (!card || card.kind !== "spell") {
    throw new Error(`Card ${action.cardId} is not a spell.`);
  }

  // Neutral Pegasi "Mystic Toll": a living enemy Pegasi gates this cast behind
  // paying a card with Power. The caster picks which Power card to pay BEFORE
  // the Spell is cast (a player-choice prompt); with no spare Power card the
  // Spell cannot be cast at all. The cast is deferred until the toll resolves.
  if (combatEnemyImposesPowerTax(state, action.playerId)) {
    const caster = state.players[action.playerId];
    const payable = caster
      ? payablePowerCardIds(caster.hand, cards, action.cardId, Boolean(action.fromScroll))
      : [];
    if (payable.length === 0) {
      throw new Error("An enemy Pegasi blocks this Spell: you must discard a card with Power to cast, and have none to pay.");
    }
    openPegasiTollChoice(state, action, payable, cards);
    return;
  }

  performSpellCast(state, action, cards);
}

/**
 * Opens the Neutral Pegasi "Mystic Toll" prompt: the caster chooses which Power
 * card to discard to pay for the Spell. The Spell cast is held in `tollSpell`
 * and replayed by resolveCombatHandDiscard once the toll is paid.
 */
function openPegasiTollChoice(
  state: GameState,
  action: Extract<GameAction, { type: "CAST_SPELL" }>,
  payableCardIds: CardId[],
  cards: CardLibrary
): void {
  const combat = state.combat;
  const pegasi = combat
    ? Object.values(combat.units).find(
        (unit) => unit.controllerId !== action.playerId && isUnitAlive(unit) && hasSpellCastPowerTax(unit)
      )
    : undefined;
  if (!pegasi) {
    // No enemy Pegasi after all (defensive): cast normally, no toll.
    performSpellCast(state, action, cards);
    return;
  }

  const chooser = state.players[action.playerId];
  const spellName = cards[action.cardId]?.name ?? action.cardId;
  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "COMBAT_HAND_DISCARD",
    playerId: action.playerId,
    kind: "pegasi-toll",
    abilityId: "pegasi-power-tax",
    abilityName: "Mystic Toll",
    sourceUnitId: pegasi.id,
    prompt: `${pegasi.cardName}'s Mystic Toll — discard a card with Power to cast ${spellName}.`,
    powerCardIds: payableCardIds,
    tollSpell: {
      cardId: action.cardId,
      target: action.target,
      ...(action.fromScroll ? { fromScroll: action.fromScroll } : {}),
      ...(action.fromSpellDeck ? { fromSpellDeck: action.fromSpellDeck } : {})
    }
  };
  state.phase = "choice";
  state.priorityPlayerId = action.playerId;

  appendEvent(state, {
    type: "PENDING_CHOICE_CREATED",
    choiceId,
    choiceType: "COMBAT_HAND_DISCARD",
    playerId: action.playerId,
    sourceEffectIds: [],
    message: `${chooser?.name ?? action.playerId} must pay a card with Power to cast ${spellName}.`
  });
}

/**
 * Casts the Spell for real: consume it, apply the Familiar tax, build the stack
 * item and open the reaction window / resolve. Split from castSpell so the
 * Neutral Pegasi toll can be paid first and the cast replayed unchanged.
 */
function performSpellCast(state: GameState, action: Extract<GameAction, { type: "CAST_SPELL" }>, cards: CardLibrary): void {
  const card = cards[action.cardId];
  if (!card || card.kind !== "spell") {
    throw new Error(`Card ${action.cardId} is not a spell.`);
  }

  // A Spell Scroll cast pulls the spell from the scroll (it is not in hand) and
  // removes it from the game; a normal cast moves the card hand → discard.
  if (action.fromScroll) {
    if (!consumeScrollSpell(state, action.playerId, action.fromScroll, action.cardId)) {
      throw new Error("That spell is not in the named Spell Scroll.");
    }
  } else if (action.fromSpellDeck) {
    // Helm of the Alabaster Unicorn (option B): the spell is cast from the top of
    // the shared Spell-deck discard pile and stays there (it is never moved to a
    // hand/discard). The Helm named on the action pays the "Remove this card"
    // cost: it leaves the game. No enemy-spell hand tax — nothing left the hand.
    const removeError = moveCardFromHandToDiscard(state, action.playerId, action.fromSpellDeck, "removed");
    if (removeError) {
      throw new Error(removeError.message);
    }
  } else {
    const moveError = moveCardFromHandToDiscard(state, action.playerId, action.cardId);
    if (moveError) {
      throw new Error(moveError.message);
    }
    // Familiars tax each enemy Spell cast from hand by one extra random card.
    applyEnemySpellHandTax(state, action.playerId);
  }

  const caster = state.players[action.playerId];
  const isFirstSpellThisTurn = (caster.combatStats.spellsCastThisTurn ?? 0) === 0;
  // "First spell this round" counts every cast, free Helm casts included, so the
  // Tower Magi Pack Power bonus lands on whichever spell is cast first — never on
  // both a free Helm cast and a later normal cast.
  const isFirstSpellThisRound = !caster.combatStats.anySpellCastThisRound;
  // A Helm of the Alabaster Unicorn cast does not count toward the spell limit
  // (noteSpellCast still closes the first-spell-this-round gate for it).
  noteSpellCast(state, caster, !action.fromSpellDeck);

  const stackItem = makeStackItem(state, action);

  // Helm of the Alabaster Unicorn cast: flag the stack item so the spell card is
  // left in the Spell-deck discard pile when it resolves (no hand/discard card to
  // relocate). Unlike a scroll it casts at the caster's normal Power, so it falls
  // through to the power hooks below.
  if (action.fromSpellDeck) {
    stackItem.modifiers.fromSpellDeck = true;
  }

  // Scroll spells are locked to power 0 and cannot be boosted by any Power
  // source — skip every power-granting hook below and flag the stack item.
  if (action.fromScroll) {
    stackItem.modifiers.scrollLocked = true;
  } else {
    // Astrologers — Grim Warlock: the first spell in each player's turn gets
    // +1 Power.
    const astrologersCard = getActiveAstrologersCard(state);
    if (isFirstSpellThisTurn && astrologersCard?.effect.type === "FIRST_SPELL_POWER_BONUS") {
      stackItem.modifiers.spellPowerBonus += astrologersCard.effect.amount;
    }

    // Tower Magi (Pack) "[activation] +N power to the first spell you cast this
    // round": only while the Magi itself is the active unit (its own turn), and
    // only for the round's first spell.
    if (isFirstSpellThisRound) {
      const magiPower = activeUnitSpellPowerBoostFor(state, action.playerId);
      if (magiPower > 0) {
        stackItem.modifiers.spellPowerBonus += magiPower;
      }
    }

    // School of Magic permanent in play: matching spells get its basic bonus
    // for free (the expert discard may replace it during the cast).
    const schoolBonus = getPermanentSchoolBonus(state, action.playerId, card);
    if (schoolBonus) {
      stackItem.modifiers.schoolPowerBonus = schoolBonus.basicPower;
    }
  }

  state.stack.push(stackItem);

  const spellStarted = appendEvent(state, {
    type: "SPELL_CAST_STARTED",
    playerId: action.playerId,
    spellCardId: action.cardId,
    target: action.target,
    power: card.power ?? 0
  });
  stackItem.triggerEventIds.push(spellStarted.id);

  const legalReactions = getLegalReactionsForTrigger(state, spellStarted, cards);
  if (reactionPlayerOrder(state, legalReactions, spellStarted).length === 0) {
    resolveTopStack(state, cards);
    return;
  }

  openReactionWindowForTrigger(state, stackItem, spellStarted, cards);
}

/**
 * If the open window is Misfortune's pre-buff phase and it just emptied (the
 * defender declined Misfortune), hand the SAME window object over to the normal
 * attack-declared buff window: clear the phase, recompute the full offers, reset
 * passes and restore the normal (attacker-first) priority. Returns true when it
 * took over, so the caller does not resolve the attack. A no-op (returns false)
 * for any other window, or when nobody can react in the normal window either.
 */
function transitionFromMisfortunePhase(state: GameState, cards: CardLibrary): boolean {
  const window = state.reactionWindow;
  const top = state.stack.at(-1);
  if (
    !window ||
    !top ||
    (top.action.type !== "ATTACK_UNIT" && top.action.type !== "MOVE_AND_ATTACK_UNIT") ||
    !top.modifiers.misfortunePhase
  ) {
    return false;
  }

  top.modifiers.misfortunePhase = false;
  window.passedPlayerIds = [];
  refreshReactionWindowLegalReactions(state, cards);
  if (window.allowedPlayerIds.length === 0) {
    // Nobody can react in the ordinary window either — let the attack resolve.
    return false;
  }
  // Normal order: the attacker (initiator) leads the buff exchange again.
  window.priorityPlayerId = window.allowedPlayerIds[0];
  state.priorityPlayerId = window.allowedPlayerIds[0];
  return true;
}

function passReaction(state: GameState, action: Extract<GameAction, { type: "PASS_REACTION" }>, cards: CardLibrary): void {
  if (!state.reactionWindow) {
    throw new Error("No reaction window is open.");
  }

  const window = state.reactionWindow;
  appendEvent(state, {
    type: "REACTION_PASSED",
    playerId: action.playerId,
    windowId: window.id
  });

  if (!window.passedPlayerIds.includes(action.playerId)) {
    window.passedPlayerIds.push(action.playerId);
  }

  const remainingPlayers = window.allowedPlayerIds.filter(
    (playerId) => !window.passedPlayerIds.includes(playerId)
  );

  if (remainingPlayers.length === 0) {
    // The defender declined Misfortune in its pre-buff window: hand off to the
    // normal attack-declared buff window instead of resolving the attack.
    if (transitionFromMisfortunePhase(state, cards)) {
      return;
    }
    closeReactionWindow(state, "all-pass");
    resolveTopStack(state, cards);
    return;
  }

  window.priorityPlayerId = remainingPlayers[0];
  state.priorityPlayerId = remainingPlayers[0];
}

function effectSupportsExpertPlay(effect: NonNullable<ReturnType<typeof getEffectiveCardEffect>>): boolean {
  if (effect.type === "ADD_COMBAT_STAT" || effect.type === "ADD_SPELL_POWER" || effect.type === "DRAW_CARDS") {
    return effect.expertAmount !== undefined;
  }

  if (effect.type === "GAIN_MORALE") {
    return effect.expertDrawCards !== undefined;
  }

  if (effect.type === "CREATE_ACTIVE_EFFECT") {
    return Boolean(effect.expertEffect);
  }

  if (effect.type === "RECALL_SPELL") {
    return Boolean(effect.expertSpellLimitBonus);
  }

  if (effect.type === "CANCEL_SPELL") {
    // Resistance's expert ignores the power cap; Protection-from-X's expert
    // ignores the spell-level cap. Either makes the card's expert play real.
    return Boolean(effect.expertIgnoresMaxPower || effect.expertIgnoresMaxSpellLevel);
  }

  // Interference's expert side (+2 instead of +1) exists; Plate of the Dying
  // Light reuses INTERFERE_SPELL with no expert side (no expertAmount).
  if (effect.type === "INTERFERE_SPELL") {
    return effect.expertAmount !== undefined;
  }

  return false;
}

/**
 * Pays a card option's printed extra price (discard/remove other cards) and
 * returns how many cost cards were paid. Throws when the payment is illegal.
 */
function payOptionCardCost(
  state: GameState,
  playerId: PlayerId,
  playedCard: CardDefinition,
  cost: CardPlayCost | undefined,
  costCardIds: CardId[] | undefined,
  cards: CardLibrary
): number {
  const cardName = playedCard.name;
  const paying = costCardIds ?? [];
  if (
    !cost ||
    (cost.discardCards === undefined && cost.discardCardsUpTo === undefined && cost.powerCost === undefined)
  ) {
    if (paying.length > 0) {
      throw new Error(`${cardName} has no card cost to pay.`);
    }
    return 0;
  }

  if (cost.discardCards !== undefined && paying.length !== cost.discardCards) {
    throw new Error(`${cardName} needs exactly ${cost.discardCards} card${cost.discardCards === 1 ? "" : "s"} as payment.`);
  }
  if (cost.discardCardsUpTo !== undefined && paying.length > cost.discardCardsUpTo) {
    throw new Error(`${cardName} accepts at most ${cost.discardCardsUpTo} cards as payment.`);
  }

  const player = state.players[playerId];
  if (!player) {
    throw new Error("Unknown player.");
  }

  const handCounts = new Map<string, number>();
  for (const cardId of player.hand) {
    handCounts.set(cardId, (handCounts.get(cardId) ?? 0) + 1);
  }
  for (const cardId of paying) {
    if (cost.costCardFilter === "spell" && cards[cardId]?.kind !== "spell") {
      throw new Error(`${cardName} can only be paid with Spell cards.`);
    }
    if (cost.costCardFilter === "power-source" && !cardCanBoostPower(cards[cardId])) {
      throw new Error(`${cardName} can only be paid with Power statistics or Spell cards.`);
    }
    const left = handCounts.get(cardId) ?? 0;
    if (left <= 0) {
      throw new Error("Cost cards must come from your hand.");
    }
    handCounts.set(cardId, left - 1);
  }

  // Power-value cost (Sorrow): the caster's standing spell Power plus the full
  // printed Power of each discarded power-source card must reach the threshold,
  // and every discarded card must be necessary (no wasteful over-payment).
  if (cost.powerCost !== undefined) {
    const schools = playedCard.spellSchools ?? [];
    const standing = standingSpellPower(state, playerId, playedCard);
    const values = paying.map((cardId) => spellPowerValueOfCard(cards[cardId], schools));
    const total = standing + values.reduce((sum, value) => sum + value, 0);
    if (total < cost.powerCost) {
      throw new Error(`${cardName} needs at least ${cost.powerCost} Power; this pays only ${total}.`);
    }
    for (const value of values) {
      if (total - value >= cost.powerCost) {
        throw new Error(`${cardName} was paid more Power than it needs — drop a card.`);
      }
    }
  }

  for (const cardId of paying) {
    const index = player.hand.indexOf(cardId);
    player.hand.splice(index, 1);
    if (cost.removeCostCards) {
      player.removed.push(cardId);
    } else {
      player.discard.push(cardId);
    }
  }

  return paying.length;
}

/** The option chosen by a play, when the card is an "OR" card. */
function getChosenOption(card: CardDefinition, optionIndex?: number): CardOptionDefinition | undefined {
  return card.effect.type === "CHOOSE_ONE" && optionIndex !== undefined
    ? card.effect.options[optionIndex]
    : undefined;
}

/**
 * Applies one instant card inside the open reaction window: pays costs,
 * discards the card, and applies the effect to the pending stack item.
 * Returns whether the play ended the window (spell-cancel).
 */
function applyReactionPlayCore(
  state: GameState,
  playerId: PlayerId,
  play: {
    cardId: string;
    mode?: "basic" | "expert";
    optionIndex?: number;
    costCardIds?: CardId[];
    asPowerBoost?: boolean;
    /** Spell Scroll reaction: power-locked to 0, consumed from the scroll. */
    fromScroll?: string;
    /** Bowstring of the Unicorn's Mane: the friendly ranged unit to activate. */
    target?: TargetRef;
  },
  cards: CardLibrary
): { windowEnded: boolean } {
  if (!state.reactionWindow) {
    throw new Error("No reaction window is open.");
  }

  const card = cards[play.cardId];
  if (!card) {
    throw new Error(`Unknown reaction card ${play.cardId}.`);
  }

  const stackItemForBoost = state.stack.at(-1);

  // The printed alternative bottom effect of every Spell card: discard it
  // for +1 Power toward the pending cast (or the spell instant in this
  // attack window).
  if (play.asPowerBoost) {
    if (card.kind !== "spell") {
      throw new Error("Only Spell cards can be discarded for +1 Power.");
    }
    if (!stackItemForBoost) {
      throw new Error("There is nothing to empower.");
    }
    const moveError = moveCardFromHandToDiscard(state, playerId, play.cardId);
    if (moveError) {
      throw new Error(moveError.message);
    }
    // Attack windows pool Power per caster; a spell cast on your own turn uses
    // the single spellPowerBonus.
    if (isAttackStackItem(stackItemForBoost)) {
      addAttackPower(stackItemForBoost, playerId, 1);
    } else {
      stackItemForBoost.modifiers.spellPowerBonus += 1;
    }
    stackItemForBoost.modifiers.playedCardIds.push(play.cardId);
    recomputePowerScaledAttackInstants(stackItemForBoost);
    appendEvent(state, {
      type: "CARD_PLAYED",
      playerId,
      cardId: play.cardId,
      timing: card.timing,
      mode: "basic",
      effectAmount: 1,
      optionLabel: "+1 Power"
    });
    return { windowEnded: false };
  }

  const effect = getEffectiveCardEffect(card, play.optionIndex);
  if (!effect) {
    throw new Error(`${card.name} needs a chosen option.`);
  }

  const option = getChosenOption(card, play.optionIndex);
  // Scroll spells are always cast at the lowest power level — never the expert
  // side, never boosted.
  const mode = play.fromScroll ? "basic" : (play.mode ?? "basic");

  if (option?.expertOnly && mode !== "expert") {
    throw new Error(`${option.label} is the card's expert side.`);
  }

  if (mode === "expert") {
    if (!effectSupportsExpertPlay(effect) && !option?.expertOnly) {
      throw new Error(`${card.name} does not have an expert effect.`);
    }

    if (!hasExpertUseAvailable(state, playerId)) {
      throw new Error("No expert uses are available this combat round.");
    }
  }

  const stackItem = state.stack.at(-1);
  const player = state.players[playerId];

  // Spell cards played as instants count toward the printed limit of one
  // Spell card per combat round (Knowledge/Necklace raise it).
  if (card.kind === "spell" && state.combat && player) {
    if (player.combatStats.spellsCastThisRound >= spellLimitFor(state, player)) {
      throw new Error("Spell limit reached for this combat round.");
    }
  }

  // Elemental Magic power boosts only empower spells of their school.
  if (effect.type === "ADD_SPELL_POWER" && effect.schoolOnly && stackItem?.action.type === "CAST_SPELL") {
    const pendingSpell = cards[stackItem.action.cardId];
    const schools = pendingSpell?.spellSchools ?? [];
    if (!schools.includes(effect.schoolOnly) && !schools.includes("any")) {
      throw new Error(`${card.name} only empowers ${effect.schoolOnly} spells.`);
    }
  }

  // Re-check the printed power limit at resolution time: Power cards played
  // earlier in this window may have pushed the spell above a basic cancel.
  if (
    effect.type === "CANCEL_SPELL" &&
    stackItem?.action.type === "CAST_SPELL" &&
    !(mode === "expert" && effect.expertIgnoresMaxPower) &&
    effect.maxPower !== undefined &&
    getCurrentSpellPower(state, stackItem, cards) > effect.maxPower
  ) {
    throw new Error(`${card.name} cannot end a spell above power ${effect.maxPower}.`);
  }

  // Protection-from-X self-defends its School/level gate at resolution: a
  // fabricated reaction can never cancel a spell of the wrong School or, in
  // basic play, an Expert spell (the legal-action layer already filters offers).
  if (effect.type === "CANCEL_SPELL" && stackItem?.action.type === "CAST_SPELL") {
    const pendingSpell = cards[stackItem.action.cardId];
    if (
      !cancelSpellAllowsSchoolAndLevel(
        effect,
        { schools: pendingSpell?.spellSchools ?? [], level: pendingSpell?.spellLevel },
        mode
      )
    ) {
      throw new Error(`${card.name} cannot end that spell.`);
    }
  }

  if (play.fromScroll) {
    if (!consumeScrollSpell(state, playerId, play.fromScroll, play.cardId)) {
      throw new Error("That spell is not in the named Spell Scroll.");
    }
  } else {
    const moveError = moveCardFromHandToDiscard(
      state,
      playerId,
      play.cardId,
      option?.cost?.removeSelf ? "removed" : "discard"
    );
    if (moveError) {
      throw new Error(moveError.message);
    }
  }

  const costCardsPaid = play.fromScroll
    ? 0
    : payOptionCardCost(state, playerId, card, option?.cost, play.costCardIds, cards);

  let effectAmount = getEffectAmount(effect, mode);
  if (mode === "expert") {
    state.players[playerId].combatStats.expertUsesSpentThisRound += 1;
  }

  // Standing spell Power for a Power-scaling spell instant played as a reaction
  // into an attack — by EITHER side (the attacker's Bloodlust/Bless/Precision/
  // Slayer/Frenzy, the defender's Curse/Weakness): credit the once-per-turn
  // Astrologers bonus, the once-per-round active-unit boost, and a School-of-Magic
  // permanent's bonus for the spell's school — the same Power castSpell seeds for
  // a spell cast on your turn. Added to THAT caster's pool before noteSpellCast
  // advances the "first spell" counters, so the instant about to apply reads it
  // like Power paid alongside it. Seeded for EVERY pool-scaling spell (no
  // once-per-attack gate): standingSpellPower itself gates the Astrologers/Magi
  // "first spell" bonuses on those counters, so a second spell that turn keeps
  // its School-of-Magic bonus (always on) while never re-counting the first-spell
  // boosts.
  if (
    card.kind === "spell" &&
    !play.fromScroll &&
    player &&
    stackItem &&
    isAttackStackItem(stackItem) &&
    effectScalesWithAttackPool(effect)
  ) {
    const standing = standingSpellPower(state, playerId, card);
    if (standing > 0) {
      addAttackPower(stackItem, playerId, standing);
      recomputePowerScaledAttackInstants(stackItem);
    }
  }

  if (card.kind === "spell" && state.combat && player) {
    noteSpellCast(state, player);
  }

  const optionLabel =
    card.effect.type === "CHOOSE_ONE" && play.optionIndex !== undefined
      ? card.effect.options[play.optionIndex]?.label
      : undefined;

  appendEvent(state, {
    type: "CARD_PLAYED",
    playerId,
    cardId: play.cardId,
    timing: card.timing,
    mode,
    effectAmount: effectAmount || undefined,
    optionLabel
  });

  if (effect.type === "CANCEL_SPELL" && stackItem?.action.type === "CAST_SPELL") {
    // Boots of Polarity: a chance-based cancel. Roll its Attack dice; on a
    // failed roll the card is already spent (moved to discard above) but the
    // spell resolves — return without ending the window so the cast continues
    // to resolution and other reactions may still answer it.
    if (effect.diceRoll && !rollSpellCancelDice(state, effect.diceRoll, stackItem.action.cardId, playerId)) {
      return { windowEnded: false };
    }
    // Resistance-style plays always end the spell once they apply: the stack
    // item is cancelled and the reaction window closes immediately.
    stackItem.status = "cancelled";
    appendEvent(state, {
      type: "SPELL_CAST_CANCELLED",
      playerId: stackItem.action.playerId,
      spellCardId: stackItem.action.cardId,
      cancelledByPlayerId: playerId,
      cancelledByCardId: play.cardId
    });
    // A Knowledge/Mysticism recall declared before the cancel still takes the
    // card back ("instead of discarding it" — no effect ever hit the table).
    if (stackItem.modifiers.recallSpell?.toHand) {
      returnSpellFromDiscardToHand(state, stackItem.action.playerId, stackItem.action.cardId);
    } else {
      maybeReturnFirstSpellToHand(state, stackItem.action.playerId, stackItem.action.cardId);
    }
    state.stack.pop();

    closeReactionWindow(state, "reaction-played");
    if (!finishCombatIfNeeded(state)) {
      state.phase = "combat";
    }
    return { windowEnded: true };
  }

  // Resistance against an instant Spell buff the OTHER side played into this
  // attack (Curse/Weakness/Bloodlust/Precision/Bless/Slayer): reverse the most
  // recent such spell so the attack proceeds as if it were never cast. The
  // attack itself is untouched and the window stays open, so each side can keep
  // responding (cast another buff, resist again) until both pass.
  if (
    effect.type === "CANCEL_SPELL" &&
    (stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT")
  ) {
    const instants = stackItem.modifiers.cancellableSpellInstants ?? [];
    let index = -1;
    for (let i = instants.length - 1; i >= 0; i -= 1) {
      if (instants[i].playerId === playerId) {
        continue;
      }
      // Protection-from-X only reverses an enemy instant of its own School/level
      // (Resistance, with no such gate, takes the most recent enemy instant).
      const instantSpell = cards[instants[i].cardId];
      if (
        !cancelSpellAllowsSchoolAndLevel(
          effect,
          { schools: instantSpell?.spellSchools ?? [], level: instantSpell?.spellLevel },
          mode
        )
      ) {
        continue;
      }
      index = i;
      break;
    }
    if (index === -1) {
      throw new Error("There is no enemy Spell to resist on this attack.");
    }
    const cancelled = instants[index];
    reverseCancelledInstantSpell(stackItem, cancelled.cardId, cards);
    instants.splice(index, 1);
    appendEvent(state, {
      type: "SPELL_CAST_CANCELLED",
      playerId: cancelled.playerId,
      spellCardId: cancelled.cardId,
      cancelledByPlayerId: playerId,
      cancelledByCardId: play.cardId
    });
    stackItem.modifiers.playedCardIds.push(play.cardId);
    return { windowEnded: false };
  }

  // Magic Mirror: re-point the pending enemy spell to a new target. The card,
  // its Power cost and the spell-limit count were already spent above. Now the
  // controller picks the new target (of the chosen grade or lower) in a
  // follow-up choice while the spell waits on the stack; the reaction window
  // closes and the spell resolves against the chosen unit once it is picked.
  if (effect.type === "REDIRECT_SPELL" && stackItem?.action.type === "CAST_SPELL") {
    const currentTarget = stackItem.action.target;
    // A space-centred blast (Inferno) has no single "current" unit to exclude —
    // pass null so every legal unit qualifies as the new centre.
    const candidates = spellRedirectTargets(
      state,
      currentTarget.type === "unit" ? currentTarget.unitId : null,
      effect.grade
    );
    if (candidates.length === 0) {
      throw new Error("There is no legal new target for that spell.");
    }

    const castCard = cards[stackItem.action.cardId];
    const choiceId = `choice_${nextEventNumber(state)}`;
    state.pendingChoice = {
      id: choiceId,
      type: "ABILITY_TARGET_CHOICE",
      playerId,
      kind: "spell-redirect",
      abilityId: card.id,
      abilityName: card.name,
      prompt: `${card.name}: choose a new target for ${castCard?.name ?? "the spell"} (${effect.grade} or lower).`,
      sourceUnitId: null,
      anchorUnitId: currentTarget.type === "unit" ? currentTarget.unitId : null,
      candidateUnitIds: candidates.map((unit) => unit.id),
      optional: false
    };
    appendEvent(state, {
      type: "PENDING_CHOICE_CREATED",
      choiceId,
      choiceType: "ABILITY_TARGET_CHOICE",
      playerId,
      sourceEffectIds: [],
      message: `${card.name}: choose where to bounce ${castCard?.name ?? "the spell"}.`
    });

    closeReactionWindow(state, "reaction-played");
    state.phase = "choice";
    state.priorityPlayerId = playerId;
    return { windowEnded: true };
  }

  // Magic Mirror reflecting an instant combat debuff layered onto an attack
  // (Curse on your defender, Weakness on your attacker). Lift that one Spell off
  // your unit exactly as Resistance would, capture its power-scaled penalty, then
  // open the new-target choice; the malus lands on the chosen unit as a lasting
  // token and the attack's reaction window resumes (see chooseAbilityTarget).
  if (
    effect.type === "REDIRECT_SPELL" &&
    (stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT")
  ) {
    const found = reflectableAttackInstantForPlayer(state, stackItem, playerId, cards);
    const affected = found ? state.combat?.units[found.affectedUnitId] : undefined;
    const candidates = found ? spellRedirectTargets(state, found.affectedUnitId, effect.grade) : [];
    if (!found || !affected || candidates.length === 0) {
      throw new Error("There is no enemy Spell on this attack for Magic Mirror to reflect.");
    }

    const instantCard = cards[found.cardId];
    const signedAmount = attackInstantSignedAmount(stackItem, found.cardId, cards);
    reverseCancelledInstantSpell(stackItem, found.cardId, cards);
    stackItem.modifiers.cancellableSpellInstants?.splice(found.index, 1);

    const choiceId = `choice_${nextEventNumber(state)}`;
    state.pendingChoice = {
      id: choiceId,
      type: "ABILITY_TARGET_CHOICE",
      playerId,
      kind: "spell-redirect",
      abilityId: card.id,
      abilityName: card.name,
      prompt: `${card.name}: choose a new target for ${instantCard?.name ?? "the spell"} (${effect.grade} or lower).`,
      sourceUnitId: null,
      anchorUnitId: found.affectedUnitId,
      candidateUnitIds: candidates.map((unit) => unit.id),
      optional: false,
      redirectInstant: {
        stat: found.stat,
        amount: signedAmount,
        sourceCardId: found.cardId
      }
    };
    appendEvent(state, {
      type: "PENDING_CHOICE_CREATED",
      choiceId,
      choiceType: "ABILITY_TARGET_CHOICE",
      playerId,
      sourceEffectIds: [],
      message: `${card.name}: choose where to bounce ${instantCard?.name ?? "the spell"}.`
    });

    closeReactionWindow(state, "reaction-played");
    state.phase = "choice";
    state.priorityPlayerId = playerId;
    return { windowEnded: true };
  }

  // Sorrow: skip the activation of the unit that is about to act. The chosen
  // CHOOSE_ONE option carries the grade reached (bronze free, silver/gold paid
  // via its discard cost, already settled above). The about-to-activate unit
  // comes from the activation-skip window's trigger event.
  if (effect.type === "SKIP_ACTIVATION") {
    const triggerEvent = state.reactionWindow?.triggerEvent;
    const unit =
      triggerEvent?.type === "UNIT_ACTIVATION_STARTED" ? state.combat?.units[triggerEvent.unitId] : undefined;
    if (unit && isUnitAlive(unit) && effect.grade && gradeRank(unit.grade) <= gradeRank(effect.grade)) {
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: unit.id,
        abilityId: card.id,
        message: `${card.name} skips ${unit.cardName}'s activation.`
      });
      skipUnitActivation(state, unit);
    }
    closeReactionWindow(state, "reaction-played");
    if (!finishCombatIfNeeded(state)) {
      state.phase = "combat";
    }
    return { windowEnded: true };
  }

  // Bowstring of the Unicorn's Mane (option A): activate one of your ranged units
  // that has not acted this round, out of order. Played in the pre-activation
  // window before some unit (possibly the enemy's) acts; the chosen ranged unit
  // (play.target) becomes the active unit and takes its full turn now. The unit
  // that was about to act was not consumed, so it resumes in initiative order.
  if (effect.type === "ACTIVATE_RANGED_UNIT") {
    const targetRef = play.target;
    const chosen = targetRef?.type === "unit" ? state.combat?.units[targetRef.unitId] : undefined;
    if (
      chosen &&
      isUnitAlive(chosen) &&
      chosen.controllerId === playerId &&
      chosen.type === "ranged" &&
      !chosen.activatedThisRound &&
      chosen.id !== state.combat?.activeUnitId
    ) {
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: chosen.id,
        abilityId: card.id,
        message: `${card.name} activates ${chosen.cardName} out of order.`
      });
      setActiveUnit(state, chosen.id);
      // Do not immediately re-open the pre-activation window on the unit we just
      // chose ("not repeatedly right after the current use"): mark it offered so
      // the chosen unit takes its turn now. Any remaining interrupt — another
      // Bowstring, a Sorrow — surfaces at the NEXT genuine activation frame, once
      // this unit has acted and the next unit comes up.
      chosen.preActivationWindowOffered = true;
    }
    closeReactionWindow(state, "reaction-played");
    if (!finishCombatIfNeeded(state)) {
      state.phase = "combat";
    }
    return { windowEnded: true };
  }

  // Empower: cast windows feed the pending spell; attack windows build the
  // Power pool a spell instant in the same declaration consumes. The
  // rulebook allows stacking several Empower plays to reach a threshold.
  if (effect.type === "ADD_SPELL_POWER" && stackItem) {
    // School-restricted Power (Orbs, Basic-School Magic) on an attack may only
    // fuel a spell instant of the matching school already played into it — the
    // cast-window school gate above covers CAST_SPELL; this covers attacks.
    if (
      effect.schoolOnly &&
      (stackItem.action.type === "ATTACK_UNIT" || stackItem.action.type === "MOVE_AND_ATTACK_UNIT")
    ) {
      const matchesSchool = stackItem.modifiers.playedCardIds.some((id) => {
        const played = cards[id];
        const schools = played?.spellSchools ?? [];
        return played?.kind === "spell" && (schools.includes(effect.schoolOnly!) || schools.includes("any"));
      });
      if (!matchesSchool) {
        throw new Error(`${card.name} only empowers ${effect.schoolOnly} spells.`);
      }
    }
    if (effect.perCostCard) {
      effectAmount += effect.perCostCard * costCardsPaid;
    }
    // Attack windows pool Power per caster; a spell cast on your own turn uses
    // the single spellPowerBonus.
    if (isAttackStackItem(stackItem)) {
      addAttackPower(stackItem, playerId, effectAmount);
    } else {
      stackItem.modifiers.spellPowerBonus += effectAmount;
    }
    stackItem.modifiers.playedCardIds.push(play.cardId);
    recomputePowerScaledAttackInstants(stackItem);
    if (effect.drawCards) {
      drawCardsForPlayer(state, playerId, effect.drawCards);
    }
  }

  if (effect.type === "GAIN_MORALE") {
    if (mode === "expert" && effect.expertDrawCards) {
      drawCardsForPlayer(state, playerId, effect.expertDrawCards);
    }
    changeMorale(state, playerId, effect.amount);
  }

  if (
    effect.type === "ADD_COMBAT_STAT" &&
    (stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT")
  ) {
    const attacker = state.combat?.units[stackItem.action.attackerId];
    const defender = state.combat?.units[stackItem.action.defenderId];
    const affectedUnit = effect.stat === "attack" ? attacker : defender;

    // Bloodlust/Precision/Golden Bow restrict which unit types benefit.
    if (effect.unitTypes && affectedUnit && !effect.unitTypes.includes(affectedUnit.type)) {
      throw new Error(`${card.name} only affects ${effect.unitTypes.join("/")} units.`);
    }

    // Magic Resistance: the unit the buff/nerf lands on (a Dwarf) rolls to shrug
    // the whole Spell off — the attacker for an attack change (Bloodlust/Bless's
    // bonus), the defender for a defense change (Curse). Only Spells roll: the
    // artifacts that share this effect (Sword of Judgement, the Gnoll relics) are
    // not Spells. Negated → the card is spent but moves no stat on that unit.
    if (
      card.kind === "spell" &&
      affectedUnit &&
      negatesCardOnDwarfRoll(state, { type: "unit", unitId: affectedUnit.id }, card.name)
    ) {
      stackItem.modifiers.playedCardIds.push(play.cardId);
      return { windowEnded: false };
    }

    // Spell instants scale with the Power played alongside them in this
    // window; cost-paid plays (Sword of Judgement) scale per discarded card.
    // A scroll spell ignores the window's Power pool — it is locked to power 0.
    if (effect.amountByPower && card.kind === "spell") {
      const power = play.fromScroll ? 0 : attackPowerFor(stackItem, playerId);
      effectAmount = getAmountByPower(effect.amountByPower, effect.amount, power);
    }
    if (effect.perCostCard) {
      effectAmount += effect.perCostCard * costCardsPaid;
    }

    // Hero specialties double their bonus when the signature unit is the one
    // attacking (attack bonus) or being attacked (defense bonus). Mutare's
    // "a Dragons unit" matches the whole Dragons family, not one exact name.
    // Cyra's Haste IV instead doubles when the attacked unit is faster than the
    // attacker (a strictly higher effective Initiative).
    const defenderIsFaster =
      Boolean(effect.doubleIfDefenderInitiativeHigher) &&
      Boolean(attacker) &&
      Boolean(defender) &&
      effectiveInitiative(defender!, state.activeEffects) > effectiveInitiative(attacker!, state.activeEffects);
    const doubleFactor =
      unitMatchesSpecialtyName(affectedUnit?.name, effect.doubleForUnitName) || defenderIsFaster ? 2 : 1;
    const appliedAmount = effectAmount * doubleFactor;

    if (effect.stat === "attack") {
      stackItem.modifiers.attackBonus += appliedAmount;
    } else {
      stackItem.modifiers.defenseBonus += appliedAmount;
    }
    stackItem.modifiers.playedCardIds.push(play.cardId);

    // A Power-scaling spell instant (Bloodlust, Precision, Curse, Weakness…)
    // is recorded so Power the caster pays LATER in this same attack window
    // re-derives its bonus from the new total Power. Scroll spells are locked
    // to power 0 and never recorded. The non-spell Attack/Defense statistic is
    // a flat bonus that does not scale, so it is not recorded either.
    if (effect.amountByPower && card.kind === "spell" && !play.fromScroll) {
      const fixedBonus = effect.perCostCard ? effect.perCostCard * costCardsPaid : 0;
      (stackItem.modifiers.powerScaledAttackInstants ??= []).push({
        cardId: card.id,
        playerId,
        stat: effect.stat,
        amountByPower: effect.amountByPower,
        baseAmount: effect.amount,
        fixedBonus,
        doubleFactor,
        appliedAmount
      });
    }

    // Precision lifts the ranged penalty for this shot.
    if (effect.ignoreRangedPenalty) {
      stackItem.modifiers.ignoreRangedPenalty = true;
    }

    // Sword of Hellfire / Shield of the Damned: the boosted unit pays in blood.
    if (effect.selfDamage && affectedUnit && state.combat) {
      affectedUnit.damage += effect.selfDamage;
      appendEvent(state, {
        type: "DAMAGE_ASSIGNED",
        source: { type: "card", cardId: card.id, controllerId: playerId },
        target: { type: "unit", unitId: affectedUnit.id },
        amount: effect.selfDamage,
        damageKind: "effect"
      });
      markUnitRemovedIfNeeded(state, affectedUnit);
    }

    // The Gnoll artifacts' stronger side: the boosted unit takes a lasting
    // token until the end of the Combat — a Weakness token (−attack) for the
    // Buckler of the Gnoll King, a Corrosion token (−defense) for the Greater
    // Gnoll's Flail. Both are floored at 0 by the attack/defense maths.
    if (effect.selfStatPenalty && affectedUnit && state.combat) {
      if (effect.selfStatPenalty.stat === "attack") {
        placeCombatToken(state, affectedUnit, "weakness", -effect.selfStatPenalty.amount, card.name);
      } else {
        placeCombatToken(state, affectedUnit, "corrosion", effect.selfStatPenalty.amount, card.name);
      }
    }

    if (effect.drawCards) {
      drawCardsForPlayer(state, playerId, effect.drawCards);
    }

    // Blackshard of the Dead Knight: the option discarded 1 card; draw 1 only
    // when that paid card was a Spell. The cost cards were already moved to the
    // discard pile by payOptionCardCost above, so inspect the paid ids.
    if (effect.drawIfCostCardSpell && (play.costCardIds ?? []).some((id) => cards[id]?.kind === "spell")) {
      drawCardsForPlayer(state, playerId, 1);
    }

    // Spells (Curse/Weakness/Bloodlust/Precision) may be cancelled by the other
    // side's Resistance; the Attack/Defense statistics and Gnoll artifacts that
    // share this effect are not Spells, so they are never recorded.
    if (card.kind === "spell") {
      (stackItem.modifiers.cancellableSpellInstants ??= []).push({ cardId: card.id, playerId });
    }
  }

  // Shield of the Dwarven Lords: played in the post-roll window. Arm the pending
  // attack so finishResolvedAttack treats the rolled die as ignored (0) and
  // fires none of the effects that die face would have triggered.
  if (
    effect.type === "IGNORE_ATTACK_DIE_RESULT" &&
    (stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT")
  ) {
    stackItem.modifiers.attackDieCancelled = true;
    stackItem.modifiers.playedCardIds.push(play.cardId);
  }

  // Misfortune: played in its own pre-buff window. Lock the pending attack — the
  // attacker can no longer increase their attack from any source for this attack
  // (the legal-action layer refuses every attack-buff to them) and the Attack die
  // is cancelled (face 0, no die-triggered effects). Clearing the misfortune
  // phase hands the window over to the normal buff exchange, now with the
  // attacker's buffs locked out. Counts as the defender's Spell (noteSpellCast
  // already ran above).
  if (
    effect.type === "NEGATE_ATTACK" &&
    (stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT")
  ) {
    stackItem.modifiers.negateAttackBuffs = true;
    stackItem.modifiers.attackDieCancelled = true;
    stackItem.modifiers.misfortunePhase = false;
    stackItem.modifiers.playedCardIds.push(play.cardId);
  }

  // Bless: the pending attack skips its Attack die (and may gain attack).
  if (
    effect.type === "IGNORE_ATTACK_DIE" &&
    (stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT")
  ) {
    // Magic Resistance: the blessed unit (a Dwarf) rolls to shrug Bless off.
    const blessTarget = state.combat?.units[stackItem.action.attackerId];
    if (
      card.kind === "spell" &&
      blessTarget &&
      negatesCardOnDwarfRoll(state, { type: "unit", unitId: blessTarget.id }, card.name)
    ) {
      stackItem.modifiers.playedCardIds.push(play.cardId);
      return { windowEnded: false };
    }
    stackItem.modifiers.ignoreAttackDie = true;
    if (effect.attackBonusByPower) {
      const blessBonus = getAmountByPower(
        effect.attackBonusByPower,
        0,
        play.fromScroll ? 0 : attackPowerFor(stackItem, playerId)
      );
      stackItem.modifiers.attackBonus += blessBonus;
      // Bless's Power-scaled attack bonus can also grow with Power paid later.
      if (!play.fromScroll) {
        (stackItem.modifiers.powerScaledAttackInstants ??= []).push({
          cardId: card.id,
          playerId,
          stat: "attack",
          amountByPower: effect.attackBonusByPower,
          baseAmount: 0,
          fixedBonus: 0,
          doubleFactor: 1,
          appliedAmount: blessBonus
        });
      }
    }
    stackItem.modifiers.playedCardIds.push(play.cardId);
    (stackItem.modifiers.cancellableSpellInstants ??= []).push({ cardId: card.id, playerId });
  }

  // Frenzy: the pending attack ignores the attacked unit's Defense (counts as 0).
  // Gated by the defender's grade. With gradeByPower it scales with the caster's
  // pooled attack-window Power: the table + caster are stored and the pierced
  // grade is re-derived at resolution (so Power paid after Frenzy keeps lifting
  // bronze→silver→gold). The legacy fixed-grade form sets ignoreDefense at once.
  if (
    effect.type === "IGNORE_DEFENSE" &&
    (stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT")
  ) {
    if (effect.gradeByPower) {
      stackItem.modifiers.ignoreDefenseGradeByPower = effect.gradeByPower;
      stackItem.modifiers.ignoreDefenseCasterId = playerId;
    } else if (effect.grade) {
      const defender = state.combat?.units[stackItem.action.defenderId];
      if (defender && gradeRank(defender.grade) <= gradeRank(effect.grade)) {
        stackItem.modifiers.ignoreDefense = true;
      }
    }
    stackItem.modifiers.playedCardIds.push(play.cardId);
  }

  if (
    effect.type === "TRIPLE_ATTACK_DIE" &&
    (stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT")
  ) {
    stackItem.modifiers.attackDieMultiplier = (stackItem.modifiers.attackDieMultiplier ?? 1) * 3;
    stackItem.modifiers.playedCardIds.push(play.cardId);
  }

  // Slayer: arm the pending attack to roll the die N times (by Power) and apply
  // every result but a "-1", then draw 1 card. Resolved in resolveAttackStackItem.
  // The gold defender's Magic Resistance (a Dwarf) may shrug the Spell off first;
  // when it does, the attack rolls its normal single die and Slayer adds nothing.
  // The power table is stored so the roll count keeps scaling as more Power is
  // paid into this attack window after Slayer was played.
  if (
    effect.type === "SLAYER_ATTACK" &&
    (stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT")
  ) {
    stackItem.modifiers.playedCardIds.push(play.cardId);
    const defenderRef: TargetRef = { type: "unit", unitId: stackItem.action.defenderId };
    if (!negatesCardOnDwarfRoll(state, defenderRef, card.name)) {
      const power = play.fromScroll ? 0 : attackPowerFor(stackItem, playerId);
      stackItem.modifiers.slayerRolls = getAmountByPower(effect.rollsByPower, 2, power);
      stackItem.modifiers.slayerDraw = true;
      // Scroll casts are locked to power 0 and never grow, so they are not recorded.
      if (!play.fromScroll) {
        stackItem.modifiers.slayerRollsByPower = effect.rollsByPower;
      }
      (stackItem.modifiers.cancellableSpellInstants ??= []).push({ cardId: card.id, playerId });
    }
  }

  if (effect.type === "CREATE_ACTIVE_EFFECT") {
    const effectCountBefore = state.activeEffects.length;
    createActiveEffectFromCard(state, card, effect, playerId, mode);
    holdOngoingCardIfEffectCreated(state, playerId, play.cardId, effectCountBefore, "discard");
    stackItem?.modifiers.playedCardIds.push(play.cardId);
  }

  if (effect.type === "DRAW_CARDS") {
    drawCardsForPlayer(state, playerId, effectAmount);
    stackItem?.modifiers.playedCardIds.push(play.cardId);
  }

  if (effect.type === "RECALL_SPELL" && stackItem?.action.type === "CAST_SPELL") {
    const caster = state.players[playerId];

    // The recall is deferred to the spell's resolution: an instant spell
    // comes straight back, an ongoing spell (Summon/Clone-style) only after
    // its effect ends — Knowledge cannot loop it onto the table twice.
    stackItem.modifiers.recallSpell = {
      toHand: true,
      recallPlayedCards: mode === "expert" && Boolean(effect.expertRecallPlayedCards)
    };

    // Empowered Knowledge raises the limit on the basic play; the regular
    // card only on the expert play.
    caster.combatStats.spellLimitBonusThisRound += effect.basicSpellLimitBonus ?? 0;
    if (mode === "expert") {
      caster.combatStats.spellLimitBonusThisRound += effect.expertSpellLimitBonus ?? 0;
    }

    stackItem.modifiers.playedCardIds.push(play.cardId);
  }

  // Interference: react to an enemy damaging Spell aimed at one of your units
  // by granting that unit +1 (expert +2) Defense for the rest of the Combat —
  // a bonus that also reduces Spell damage (DEFENSE_BONUS for attacks,
  // SPELL_DAMAGE_REDUCTION for spells). Created here, before the pending Spell
  // resolves (the reaction window closes first), so it softens the very Spell
  // that triggered it and every later Spell that hits the same unit.
  if (effect.type === "INTERFERE_SPELL" && stackItem?.action.type === "CAST_SPELL") {
    const targetRef = stackItem.action.target;
    const targetUnit = targetRef.type === "unit" ? state.combat?.units[targetRef.unitId] : undefined;
    // The legal-reaction gate already restricts this to the reacting player's
    // own targeted unit; re-checked here so a stale window can never buff an
    // enemy unit or a dead one.
    if (targetUnit && targetUnit.controllerId === playerId && isUnitAlive(targetUnit)) {
      createActiveEffect(
        state,
        {
          // Interference → "Interference"/"Expert Interference"; Plate of the
          // Dying Light reuses this effect and names it after the artifact.
          name: mode === "expert" ? `Expert ${card.name}` : card.name,
          scope: "unit",
          duration: { type: "combat" },
          polarity: "positive",
          removable: true,
          modifiers: [
            { type: "DEFENSE_BONUS", amount: effectAmount },
            { type: "SPELL_DAMAGE_REDUCTION", amount: effectAmount }
          ]
        },
        { type: "card", cardId: card.id, controllerId: playerId },
        playerId,
        { type: "unit", unitId: targetUnit.id }
      );
    }
    stackItem.modifiers.playedCardIds.push(play.cardId);
  }

  // Alamar's Resurrection: arm the pending attack so it is cancelled at
  // resolution if it would destroy the defending unit. It guards against
  // normal attacks only — never spells or specialty damage. The discard cost
  // was paid above.
  if (
    effect.type === "CANCEL_LETHAL_ATTACK" &&
    (stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT")
  ) {
    stackItem.modifiers.cancelLethal = { unitId: stackItem.action.defenderId, grade: effect.grade };
    stackItem.modifiers.playedCardIds.push(play.cardId);
  }

  // Targ of the Rampaging Ogre (top side): "instead of discarding, put this card
  // back into your hand." The card was moved to the discard pile above; now that
  // its effect has applied, pull it back to hand. The cost cards it discarded
  // stay discarded. Never combines with a removeSelf option or a scroll play.
  if (option?.returnSelfToHand && !play.fromScroll && !option.cost?.removeSelf) {
    const owner = state.players[playerId];
    const discardIndex = owner?.discard.lastIndexOf(play.cardId) ?? -1;
    if (owner && discardIndex !== -1) {
      owner.discard.splice(discardIndex, 1);
      owner.hand.push(play.cardId);
    }
  }

  return { windowEnded: false };
}

function advanceReactionWindowAfterPlay(state: GameState, playerId: PlayerId, cards: CardLibrary): void {
  if (!state.reactionWindow) {
    return;
  }

  // A fresh play clears everyone's earlier pass so opponents get a new chance
  // to respond once this player is finished.
  state.reactionWindow.passedPlayerIds = [];
  refreshReactionWindowLegalReactions(state, cards);

  if (state.reactionWindow.allowedPlayerIds.length === 0) {
    closeReactionWindow(state, "all-pass");
    resolveTopStack(state, cards);
    return;
  }

  // The player who just acted KEEPS priority so they can commit several
  // instants in a row before opponents respond — e.g. stacking Power on their
  // own spell cast. This matches the board game, where the caster finishes
  // empowering and only then is Resistance / a counter decided against the
  // FINAL power. Priority moves on only when they pass (passReaction) or run
  // out of legal plays (then refreshReactionWindowLegalReactions hands it to
  // the next allowed player). Previously priority advanced after a single
  // play, stranding a caster who wanted to add a second Power card.
  const allowedPlayerIds = state.reactionWindow.allowedPlayerIds;
  const keepPriority = allowedPlayerIds.includes(playerId) ? playerId : allowedPlayerIds[0];
  state.reactionWindow.priorityPlayerId = keepPriority;
  state.priorityPlayerId = keepPriority;
}

/** Basic X Magic's expert side: +3 Power for a matching-school spell. */
const SCHOOL_FETCH_EXPERT_POWER = 3;

/**
 * Basic X Magic (the in-play spell-fetch permanent): spend an expert use to add
 * +3 Power to a matching-school spell you are casting now — a normal cast (into
 * the cast's School power) or an instant played into an attack (into your own
 * attack-window Power pool, re-derived like any other paid Power). The fetch
 * permanent stays in play; nothing is discarded. Once per stack per player.
 */
function applySchoolFetchExpert(
  state: GameState,
  action: Extract<GameAction, { type: "USE_SCHOOL_FETCH_EXPERT" }>
): void {
  const player = state.players[action.playerId];
  if (!player) {
    throw new Error("Unknown player.");
  }
  if (!activeSchoolFetches(state, action.playerId).includes(action.school as "air" | "earth" | "fire" | "water")) {
    throw new Error("No Basic Magic of that school is in play.");
  }

  const stackItem = state.stack.at(-1);
  if (!stackItem) {
    throw new Error("The +3 expert needs one of your spells being cast.");
  }

  const usedBy = (stackItem.modifiers.schoolFetchExpertUsedBy ??= []);
  if (usedBy.includes(action.playerId)) {
    throw new Error("The Basic Magic +3 expert is already applied here.");
  }

  const expertUsesLeft =
    player.limits.expertUses +
    (player.combatStats.expertUseBonusThisRound ?? 0) -
    player.combatStats.expertUsesSpentThisRound;
  if (expertUsesLeft <= 0) {
    throw new Error("No expert uses are available this combat round.");
  }

  if (stackItem.action.type === "CAST_SPELL") {
    const castSchools = cardLibrary[stackItem.action.cardId]?.spellSchools ?? [];
    const matchesCast = castSchools.includes(action.school) || castSchools.includes("any");
    if (stackItem.action.playerId !== action.playerId || !matchesCast) {
      throw new Error("That cast does not match the Basic Magic school.");
    }
    if (stackItem.modifiers.scrollLocked) {
      throw new Error("A Spell Scroll cast is locked to Power 0.");
    }
    stackItem.modifiers.schoolPowerBonus = (stackItem.modifiers.schoolPowerBonus ?? 0) + SCHOOL_FETCH_EXPERT_POWER;
  } else if (isAttackStackItem(stackItem)) {
    if (!playerHasAttackInstantOfSchool(stackItem, action.playerId, action.school)) {
      throw new Error("You have no matching-school spell instant on this attack to empower.");
    }
    addAttackPower(stackItem, action.playerId, SCHOOL_FETCH_EXPERT_POWER);
    recomputePowerScaledAttackInstants(stackItem);
  } else {
    throw new Error("The +3 expert needs one of your spells.");
  }

  usedBy.push(action.playerId);
  player.combatStats.expertUsesSpentThisRound += 1;
  appendEvent(state, {
    type: "CARD_PLAYED",
    playerId: action.playerId,
    cardId: `ability.basic_${action.school}_magic` as CardId,
    timing: "instant",
    mode: "expert",
    effectAmount: SCHOOL_FETCH_EXPERT_POWER
  });
}

/**
 * Closes the end-of-combat notice for an adventure combat: the next
 * automation pass runs finalizeAdventureCombat (XP, unit flips, the visit).
 */
function acknowledgeCombatEnd(
  state: GameState,
  action: Extract<GameAction, { type: "ACKNOWLEDGE_COMBAT_END" }>
): void {
  const combat = state.combat;
  if (!combat || !combat.outcome) {
    throw new Error("No finished combat to acknowledge.");
  }

  if (combat.context.kind === "sandbox") {
    throw new Error("The battle simulator stays on the table — reset it instead.");
  }

  if (combat.attackerPlayerId !== action.playerId && combat.defenderPlayerId !== action.playerId) {
    throw new Error("Only a combat participant may close the combat.");
  }

  combat.endAcknowledged = true;
}

function playReaction(
  state: GameState,
  action: Extract<GameAction, { type: "PLAY_REACTION" }>,
  cards: CardLibrary
): void {
  // Power has no standalone effect during an attack UNLESS a Power-scaling
  // spell instant has already been played into this window: the caster keeps
  // priority and may keep empowering it (Bloodlust cast, then a Power card to
  // lift it further). With nothing on the table to empower, lone Power still
  // "dissipates" and is rejected — the same rule the batch validator enforces.
  if (state.reactionWindow?.triggerEvent.type === "UNIT_ATTACK_DECLARED") {
    const card = cards[action.cardId];
    const effect = card && !action.asPowerBoost ? getEffectiveCardEffect(card, action.optionIndex) : null;
    if (action.asPowerBoost || effect?.type === "ADD_SPELL_POWER") {
      const stackItem = state.stack.at(-1);
      const attackOwner =
        stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT"
          ? stackItem.action.playerId
          : undefined;
      // This player may keep empowering a Power-scaling spell instant THEY cast
      // into the attack — the attacker's Bloodlust/Slayer/Frenzy, or the
      // defender's Curse/Weakness. Lone Power with nothing of yours to feed still
      // dissipates.
      const empowerable =
        (stackItem?.modifiers.powerScaledAttackInstants ?? []).some((record) => record.playerId === action.playerId) ||
        (attackOwner === action.playerId && stackItem?.modifiers.slayerRollsByPower !== undefined) ||
        stackItem?.modifiers.ignoreDefenseCasterId === action.playerId;
      if (!empowerable) {
        throw new Error("Power can only be played into an attack together with a Spell card.");
      }
    }
  }

  const { windowEnded } = applyReactionPlayCore(state, action.playerId, action, cards);
  if (windowEnded) {
    return;
  }

  advanceReactionWindowAfterPlay(state, action.playerId, cards);
}

/**
 * Archangels' lethal save: cancel the killing blow with the unit's once-per-
 * combat ability instead of a card. Arms the pending attack's cancel (so it is
 * voided at resolution exactly like the Resurrection card/specialty) and shuts
 * the save window. The "resurrection" FX/sound fires when the attack resolves.
 */
function applyUnitResurrection(
  state: GameState,
  action: Extract<GameAction, { type: "USE_UNIT_RESURRECTION" }>,
  cards: CardLibrary
): void {
  const window = state.reactionWindow;
  if (!window || window.triggerEvent.type !== "UNIT_LETHAL_HIT" || window.priorityPlayerId !== action.playerId) {
    throw new Error("No lethal-save window is open for you.");
  }
  const combat = state.combat;
  const defender = combat?.units[window.triggerEvent.defenderId];
  const saver = combat?.units[action.savingUnitId];
  const pendingAttack = state.stack.find(
    (item) => item.action.type === "ATTACK_UNIT" || item.action.type === "MOVE_AND_ATTACK_UNIT"
  );
  if (!combat || !defender || !saver || !pendingAttack) {
    throw new Error("That resurrection cannot be used now.");
  }
  if (
    saver.controllerId !== action.playerId ||
    saver.id === defender.id ||
    saver.damage >= saver.maxHealth ||
    saver.usedLethalSaveThisCombat ||
    !getLethalSaveUnitAbility(saver)
  ) {
    throw new Error("That unit cannot cancel the killing blow.");
  }

  saver.usedLethalSaveThisCombat = true;
  // Grade-agnostic: matching the defender's own grade guarantees the cancel
  // passes the grade check at resolution.
  pendingAttack.modifiers.cancelLethal = { unitId: defender.id, grade: defender.grade };
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: saver.id,
    abilityId: "archangel-lethal-save",
    targetUnitId: defender.id,
    message: `${saver.cardName} readies to cancel the killing blow on ${defender.cardName}.`
  });

  advanceReactionWindowAfterPlay(state, action.playerId, cards);
}

function playReactions(
  state: GameState,
  action: Extract<GameAction, { type: "PLAY_REACTIONS" }>,
  cards: CardLibrary
): void {
  // Batch legality (validated up front) excludes window-ending effects, so
  // every play lands in the same window before priority moves on once.
  // Power is paid before the spell consumes it (rulebook Empower order):
  // process power-granting plays first so spell instants in the same batch
  // see the full Power pool.
  const isPowerPlay = (play: (typeof action.plays)[number]) => {
    if (play.asPowerBoost) {
      return true;
    }
    const card = cards[play.cardId];
    const effect = card ? getEffectiveCardEffect(card, play.optionIndex) : null;
    return effect?.type === "ADD_SPELL_POWER";
  };
  const ordered = [...action.plays.filter(isPowerPlay), ...action.plays.filter((play) => !isPowerPlay(play))];

  for (const play of ordered) {
    applyReactionPlayCore(state, action.playerId, play, cards);
  }

  advanceReactionWindowAfterPlay(state, action.playerId, cards);
}

/**
 * Sandro's Cloak of the Undead King: the specialty card leaves the hand and
 * is physically placed on a matching unit card, replacing its statistics
 * until that covering card is defeated. Placeable during your own combat
 * (on a combat unit) or on the map (on an army unit card). The card is not
 * discarded now — markUnitRemovedIfNeeded discards it when it is defeated.
 */
function playTransformCard(
  state: GameState,
  action: Extract<GameAction, { type: "PLAY_CARD" }>,
  card: CardDefinition,
  effect: Extract<ConcreteEffect, { type: "TRANSFORM_UNIT" }>
): void {
  const player = state.players[action.playerId];
  if (!player) {
    throw new Error("Unknown player.");
  }
  const ruleset = getRuleset(state);
  const entry = makeUnitTransformState(effect, card.id, ruleset);

  const removeFromHand = () => {
    const index = player.hand.indexOf(action.cardId);
    if (index === -1) {
      throw new Error(`${card.name} is not in your hand.`);
    }
    player.hand.splice(index, 1);
  };

  if (state.combat) {
    const target = action.target?.type === "unit" ? action.target : undefined;
    const unit = target ? state.combat.units[target.unitId] : undefined;
    if (!unit || unit.controllerId !== action.playerId) {
      throw new Error(`${card.name} must be placed on one of your units.`);
    }
    if (!canPlaceTransformOn(unit.name, unit.variant, unit.transforms, effect)) {
      throw new Error(`${card.name} cannot be placed on ${unit.cardName}.`);
    }

    removeFromHand();
    unit.transforms = insertUnitTransform(unit.transforms, entry);
    applyUnitCurrentSide(unit, ruleset);

    // Mirror onto the backing army card so the Cloak rides out of the combat.
    const armyUnit = player.army.find((candidate) => candidate.id === unit.armyUnitId);
    if (armyUnit) {
      armyUnit.transforms = insertUnitTransform(armyUnit.transforms, { ...entry });
    }

    appendEvent(state, {
      type: "UNIT_TRANSFORMED",
      unitId: unit.id,
      playerId: action.playerId,
      newName: effect.newName,
      byCardId: card.id
    });
    return;
  }

  // Map placement: cover an army unit card.
  const armyUnit = action.armyUnitId
    ? player.army.find((candidate) => candidate.id === action.armyUnitId)
    : undefined;
  if (!armyUnit) {
    throw new Error(`${card.name} must be placed on one of your unit cards.`);
  }
  const def = coreUnitDefinitions[armyUnit.unitDefId];
  if (!def || !canPlaceTransformOn(def.name, armyUnit.side, armyUnit.transforms, effect)) {
    throw new Error(`${card.name} cannot be placed on that unit card.`);
  }

  removeFromHand();
  armyUnit.transforms = insertUnitTransform(armyUnit.transforms, entry);

  appendEvent(state, {
    type: "UNIT_TRANSFORMED",
    unitId: armyUnit.id,
    playerId: action.playerId,
    newName: effect.newName,
    byCardId: card.id
  });
}

// ---------------------------------------------------------------------------
// Solmyr's Chain Lightning (I: 1/1/0, VI: 2/1/1)
// ---------------------------------------------------------------------------

/** Deals one bolt of Chain Lightning damage (spell damage) to a living unit. */
function dealChainLightningDamage(
  state: GameState,
  playerId: PlayerId,
  card: CardDefinition | undefined,
  unitId: UnitId,
  amount: number
): void {
  const unit = state.combat?.units[unitId];
  if (!unit || !isUnitAlive(unit) || amount <= 0) {
    return;
  }
  // Chain Lightning is Solmyr's Specialty: Steel Golems soften it and a
  // Specialty-immune unit (Azure/Black Dragon Pack) shrugs it off entirely.
  const dealt = reducedCardDamage(state, unit, card, amount);
  if (dealt <= 0) {
    return;
  }
  unit.damage += dealt;
  noteUnitDamagedForTokens(state, unit, dealt);
  appendEvent(state, {
    type: "DAMAGE_ASSIGNED",
    source: { type: "card", cardId: card?.id ?? "", controllerId: playerId },
    target: { type: "unit", unitId: unit.id },
    amount: dealt,
    damageKind: "spell"
  });
  markUnitRemovedIfNeeded(state, unit);
}

/**
 * The units the chain can reach: the two living units closest to the selected
 * unit, with every unit tied at the second-nearest distance included so the
 * caster picks which of them are struck. Friendly units count.
 */
function chainLightningReachable(state: GameState, primaryId: UnitId): UnitId[] {
  const combat = state.combat;
  const primary = combat?.units[primaryId];
  if (!combat || !primary) {
    return [];
  }
  const others = Object.values(combat.units)
    .filter((unit) => unit.id !== primaryId && isUnitAlive(unit))
    .map((unit) => ({ id: unit.id, distance: getBattlefieldDistance(primary.position, unit.position) }))
    .sort((left, right) => left.distance - right.distance || left.id.localeCompare(right.id));
  if (others.length <= 2) {
    return others.map((entry) => entry.id);
  }
  const boundary = others[1].distance;
  return others.filter((entry) => entry.distance <= boundary).map((entry) => entry.id);
}

/** Closest of `candidates` to the selected unit (id breaks ties), for forced hits. */
function closestChainTarget(state: GameState, primaryId: UnitId, candidates: UnitId[]): UnitId | null {
  const combat = state.combat;
  const primary = combat?.units[primaryId];
  if (!combat || !primary || candidates.length === 0) {
    return null;
  }
  return [...candidates]
    .filter((id) => combat.units[id] && isUnitAlive(combat.units[id]))
    .sort((left, right) => {
      const leftDistance = getBattlefieldDistance(primary.position, combat.units[left]!.position);
      const rightDistance = getBattlefieldDistance(primary.position, combat.units[right]!.position);
      return leftDistance - rightDistance || left.localeCompare(right);
    })[0] ?? null;
}

/**
 * Allocates the remaining Chain Lightning bolts among the reachable units. Each
 * nonzero value goes to one reachable unit; when more units than bolts remain
 * the caster chooses (otherwise the forced targets are auto-resolved). Opens an
 * ABILITY_TARGET_CHOICE when a genuine choice is needed, else finishes.
 */
function advanceChainLightning(
  state: GameState,
  playerId: PlayerId,
  card: CardDefinition | undefined,
  primaryId: UnitId,
  reachable: UnitId[],
  remaining: number[]
): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }

  let pool = reachable;
  const values = [...remaining];
  while (values.length > 0) {
    const candidates = pool.filter((id) => combat.units[id] && isUnitAlive(combat.units[id]));
    if (candidates.length === 0) {
      break;
    }
    const value = values[0];
    if (value <= 0) {
      values.shift();
      continue;
    }
    // A genuine choice only exists when more than one candidate could take this
    // bolt and there are spare candidates beyond the bolts left to place.
    if (candidates.length > 1 && candidates.length > values.length) {
      const choiceId = `choice_${nextEventNumber(state)}`;
      state.pendingChoice = {
        id: choiceId,
        type: "ABILITY_TARGET_CHOICE",
        playerId,
        kind: "chain-lightning",
        abilityId: card?.id ?? "",
        abilityName: "Chain Lightning",
        prompt: `Chain Lightning: deal ${value} damage to one of the closest units.`,
        sourceUnitId: null,
        anchorUnitId: primaryId,
        candidateUnitIds: candidates,
        amount: value,
        chainReachableUnitIds: pool,
        chainRemainingDamages: values
      };
      state.phase = "choice";
      state.priorityPlayerId = playerId;
      appendEvent(state, {
        type: "PENDING_CHOICE_CREATED",
        choiceId,
        choiceType: "ABILITY_TARGET_CHOICE",
        playerId,
        sourceEffectIds: [],
        message: `${state.players[playerId]?.name ?? playerId} aims Chain Lightning.`
      });
      return;
    }

    const target = closestChainTarget(state, primaryId, candidates);
    if (!target) {
      break;
    }
    dealChainLightningDamage(state, playerId, card, target, value);
    pool = pool.filter((id) => id !== target);
    values.shift();
  }

  finishCombatIfNeeded(state);
}

/** Opens Solmyr's Chain Lightning: hit the selected unit, then chain outward. */
function startChainLightning(
  state: GameState,
  playerId: PlayerId,
  card: CardDefinition | undefined,
  primaryId: UnitId,
  damages: number[]
): void {
  if (!state.combat) {
    return;
  }
  const reachable = chainLightningReachable(state, primaryId);
  dealChainLightningDamage(state, playerId, card, primaryId, damages[0] ?? 0);
  if (finishCombatIfNeeded(state)) {
    return;
  }
  // Zero bolts (Chain Lightning I's "0") are no-ops: an untargeted closest unit
  // simply takes nothing, so only the nonzero bolts need allocating.
  advanceChainLightning(
    state,
    playerId,
    card,
    primaryId,
    reachable,
    damages.slice(1).filter((value) => value > 0)
  );
}

/**
 * Charm of Mana / Shackles of War: open a "discard M cards from hand" choice.
 * `candidates` are the cards the player may discard (the whole hand, or only
 * the cards just drawn). With nothing to discard the choice is skipped.
 */
function openHandDiscardChoice(
  state: GameState,
  playerId: PlayerId,
  remaining: number,
  candidates: CardId[],
  drawnOnly: boolean,
  cardName: string
): void {
  if (remaining <= 0 || candidates.length === 0) {
    return;
  }
  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId,
    prompt: `${cardName}: discard ${remaining} card${remaining === 1 ? "" : "s"}.`,
    options: candidates.map((cardId) => ({ label: `Discard ${cardLibrary[cardId]?.name ?? cardId}` })),
    context: "hand-discard",
    handDiscard: { cardIds: candidates, remaining, drawnOnly },
    returnPhase: state.combat ? "combat" : "player-turn"
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
}

function playCard(state: GameState, action: Extract<GameAction, { type: "PLAY_CARD" }>, cards: CardLibrary): void {
  const card = cards[action.cardId];
  if (!card) {
    throw new Error(`Unknown card ${action.cardId}.`);
  }

  // Dessa's Logistics: playable only during the continue-or-retreat decision
  // against neutral units — the combat extends one round for free.
  if (card.effect.type === "CONTINUE_NEUTRAL_FREE") {
    const combat = state.combat;
    if (
      !combat ||
      !combat.awaitingContinue ||
      combat.context.kind !== "neutral" ||
      combat.attackerPlayerId !== action.playerId
    ) {
      throw new Error(`${card.name} is played when deciding to continue a neutral combat.`);
    }

    const moveError = moveCardFromHandToDiscard(state, action.playerId, action.cardId, "discard");
    if (moveError) {
      throw new Error(moveError.message);
    }

    combat.awaitingContinue = false;
    appendEvent(state, {
      type: "CARD_PLAYED",
      playerId: action.playerId,
      cardId: action.cardId,
      timing: card.timing,
      mode: "basic"
    });
    appendEvent(state, {
      type: "COMBAT_CONTINUED",
      playerId: action.playerId,
      movementLeft: state.heroes[combat.context.heroId]?.movementPoints ?? 0
    });
    advanceCombatRound(state, action.playerId);
    return;
  }

  // Sandro's Cloak: the specialty card leaves the hand and is physically
  // placed on a matching unit card, replacing its statistics until defeated.
  if (card.effect.type === "TRANSFORM_UNIT") {
    playTransformCard(state, action, card, card.effect);
    return;
  }

  // Permanents enter play instead of resolving an effect; any permanent
  // already in play goes to the discard pile (the printed one-permanent limit,
  // enforced in combat as well — playing another permanent discards this one,
  // and vice versa). A plain permanent (war machine, School of Magic) always
  // enters play. A hybrid artifact whose CHOOSE_ONE offers an enter-play side
  // (ENTER_PLAY) alongside a one-shot instant (income rings/carts) enters play
  // only when that side is chosen; its instant side falls through below.
  const entersPlayAsPermanent =
    Boolean(card.permanent) &&
    (card.effect.type !== "CHOOSE_ONE" || getChosenOption(card, action.optionIndex)?.effect.type === "ENTER_PLAY");
  if (entersPlayAsPermanent) {
    putPermanentIntoPlay(state, action.playerId, action.cardId);
    appendEvent(state, {
      type: "CARD_PLAYED",
      playerId: action.playerId,
      cardId: action.cardId,
      timing: card.timing,
      mode: "basic",
      optionLabel: getChosenOption(card, action.optionIndex)?.label
    });
    if (state.phase === "combat" || state.combat) {
      state.phase = "combat";
    }
    state.priorityPlayerId = null;
    return;
  }

  const effect = getEffectiveCardEffect(card, action.optionIndex);
  if (!effect) {
    throw new Error(`${card.name} needs a chosen option.`);
  }

  // Tactics is never played from hand: the swap is offered by the engine in the
  // start-of-combat window or on the holder's turn (SWAP_COMBAT_UNITS), and
  // Diplomacy's skip is offered as a pop-up at a matching-level Neutral field.
  if (effect.type === "TACTICS_SWAP") {
    throw new Error("Tactics is used through the combat swap window, not played from hand.");
  }
  if (effect.type === "DIPLOMACY_SKIP_COMBAT") {
    throw new Error("Diplomacy's skip is offered when your hero meets matching-level Neutral Units.");
  }
  // Learning is never played from hand: the engine offers it when the Hero is
  // about to level up (see the "learning-level-up" pending choice).
  if (effect.type === "ADVANCE_EXPERIENCE") {
    throw new Error("Learning is played when your Hero is about to level up, not from hand.");
  }
  // Artillery's expert side is not played from hand: it is offered when this
  // player's Ballista fires at the start of a combat round (see permanents.ts).
  if (effect.type === "ARTILLERY_BALLISTA_VOLLEY") {
    throw new Error("Artillery's expert side resolves when your Ballista fires, not from hand.");
  }
  // Helm of the Alabaster Unicorn's cast side is never played from hand: it is
  // offered as a `fromSpellDeck` CAST_SPELL of the top of the Spell-deck discard
  // pile (see addSpellActions / performSpellCast), which removes the Helm.
  if (effect.type === "CAST_FROM_SPELL_DISCARD") {
    throw new Error("Helm of the Alabaster Unicorn's cast side is played as a Spell-deck cast, not from hand.");
  }
  // First Aid's expert side is likewise not played from hand: it is offered when
  // this player activates their First Aid Tent's heal (see permanents.ts).
  if (effect.type === "FIRST_AID_TENT_VOLLEY") {
    throw new Error("First Aid's expert side resolves when you use your First Aid Tent, not from hand.");
  }

  const option = getChosenOption(card, action.optionIndex);
  const mode = action.mode ?? "basic";
  if (option?.expertOnly && mode !== "expert") {
    throw new Error(`${option.label} is the card's expert side.`);
  }
  if (option?.mapOnly && state.combat) {
    throw new Error(`${option.label} cannot be used during combat.`);
  }
  // Crown of the Five Seas' sea side: only while this player's main Hero stands
  // on a Sea (water-terrain) field.
  if (option?.requiresSeaTile) {
    const hero = getMainHero(state, action.playerId);
    if (!hero?.spaceId || !isSeaField(state, hero.spaceId)) {
      throw new Error(`${option.label} requires your Hero to be on a Sea tile.`);
    }
  }
  // Ring of the Wayfarer's paralysis side: only at the opening round of a
  // Combat against Neutral Units.
  if (option?.requiresNeutralCombatStart) {
    if (!state.combat || state.combat.context.kind !== "neutral" || state.combat.round !== 1) {
      throw new Error(`${option.label} is played at the start of a Combat with Neutral Units.`);
    }
  }
  if (mode === "expert" && !hasExpertUseAvailable(state, action.playerId)) {
    throw new Error("No expert uses are available this combat round.");
  }

  // Spell cards played during combat respect the one-Spell-per-round limit.
  const playerForLimit = state.players[action.playerId];
  if (card.kind === "spell" && state.combat && playerForLimit) {
    if (playerForLimit.combatStats.spellsCastThisRound >= spellLimitFor(state, playerForLimit)) {
      throw new Error("Spell limit reached for this combat round.");
    }
    noteSpellCast(state, playerForLimit);
  }

  const moveError = moveCardFromHandToDiscard(
    state,
    action.playerId,
    action.cardId,
    option?.cost?.removeSelf ? "removed" : "discard"
  );
  if (moveError) {
    throw new Error(moveError.message);
  }

  payOptionCardCost(state, action.playerId, card, option?.cost, action.costCardIds, cards);

  if (mode === "expert") {
    state.players[action.playerId].combatStats.expertUsesSpentThisRound += 1;
  }

  const optionLabel =
    card.effect.type === "CHOOSE_ONE" && action.optionIndex !== undefined
      ? card.effect.options[action.optionIndex]?.label
      : undefined;

  appendEvent(state, {
    type: "CARD_PLAYED",
    playerId: action.playerId,
    cardId: action.cardId,
    timing: card.timing,
    mode,
    effectAmount: getEffectAmount(effect, mode) || undefined,
    optionLabel
  });

  // Ongoing rule snapshot: lasting effects created below keep the card in
  // play until they end ("remove" plays went to `removed` and stay there).
  const effectCountBeforePlay = state.activeEffects.length;
  const playedToDiscard = !option?.cost?.removeSelf;

  // Rampart Dwarves "Magic Resistance": a Specialty card aimed at a Dwarf rolls
  // a die; on the matching face the card has no effect on it. Dropping the
  // target makes every unit-targeted branch below a no-op, while the card still
  // resolves and goes to the discard pile as usual.
  const negatedByDwarf =
    card.kind === "hero-specialty" && negatesCardOnDwarfRoll(state, action.target, card.name);
  const target = negatedByDwarf ? undefined : action.target?.type === "unit" ? action.target : undefined;

  if (effect.type === "HEAL_DAMAGE" && target) {
    healUnitDamage(
      state,
      {
        type: "card",
        cardId: card.id,
        controllerId: action.playerId
      },
      target,
      getEffectDamageAmount(effect, card.power ?? 0)
    );
    // Rion's Battlefield Medic IV/VI: "Remove … damage or paralysis …" — the
    // chosen unit also loses its Paralysis token.
    if (effect.removeParalysis && state.combat) {
      const unit = state.combat.units[target.unitId];
      if (unit && hasToken(unit, "paralysis")) {
        removeToken(state, unit, "paralysis", "dispelled");
      }
    }
    // Rion's Battlefield Medic: "Remove 1 damage … then draw 1 card."
    if (effect.drawCards) {
      drawCardsForPlayer(state, action.playerId, effect.drawCards);
    }
  }

  if (effect.type === "HEAL_DAMAGE_AND_REMOVE_EFFECTS" && target) {
    const source = {
      type: "card" as const,
      cardId: card.id,
      controllerId: action.playerId
    };
    healUnitDamage(state, source, target, getEffectDamageAmount(effect, card.power ?? 0));
    removeEffectsFromTarget(state, source, target, effect.removePolarity);
    // Cure: "Remove any effect or paralysis …" — also clears the Paralysis token.
    if (effect.removeParalysis && state.combat) {
      const unit = state.combat.units[target.unitId];
      if (unit && hasToken(unit, "paralysis")) {
        removeToken(state, unit, "paralysis", "dispelled");
      }
    }
  }

  if (effect.type === "CREATE_ACTIVE_EFFECT") {
    createActiveEffectFromCard(state, card, effect, action.playerId, mode, target);
  }

  if (effect.type === "REMOVE_ACTIVE_EFFECT" && target) {
    removeOneEffectFromTarget(
      state,
      { type: "card", cardId: card.id, controllerId: action.playerId },
      target
    );
  }

  if (effect.type === "CREATE_ATTACK_BUFF" && target) {
    createAttackBuffFromCard(state, card, effect, action.playerId, card.power ?? 0, target);
  }

  if (effect.type === "GRANT_ELEMENTAL_DAMAGE" && target) {
    // Moandor's Liches VI: the chosen unit deals elemental damage for the
    // Combat (its attack can no longer be raised by attack cards/tokens).
    createActiveEffect(
      state,
      {
        name: card.name,
        scope: "unit",
        duration: effect.duration,
        polarity: "positive",
        removable: false,
        modifiers: [{ type: "ELEMENTAL_DAMAGE" }]
      },
      { type: "card", cardId: card.id, controllerId: action.playerId },
      action.playerId,
      target
    );
  }

  if (effect.type === "CREATE_DEFENSE_BUFF" && target) {
    createDefenseBuffFromCard(state, card, action.playerId, card.power ?? 0, target);
  }

  // Ring of the Wayfarer's paralysis side: place a Paralysis token on the
  // chosen unit, gated by the grade the paid Power unlocks (Power 0 -> gold, so
  // an Azure unit — above the gate — is left untouched, matching "except
  // Azure"). The Blind Spell shares the PLACE_PARALYSIS effect but resolves via
  // the spell stack, so this branch only fires for directly-played cards.
  if (effect.type === "PLACE_PARALYSIS" && state.combat && target) {
    const maxGrade = gradeAtPower(effect.gradeByPower, card.power ?? 0);
    const unit = state.combat.units[target.unitId];
    if (unit && maxGrade && gradeRank(unit.grade) <= gradeRank(maxGrade)) {
      placeCombatToken(state, unit, "paralysis", 0, card.name);
    }
  }

  // Rashka's Demoniac specialty (IV/VI): a Fire Shield on the chosen unit —
  // melee attackers take 1 damage (2 for an Efreet at level VI).
  if (effect.type === "CREATE_FIRE_SHIELD" && target && state.combat) {
    createFireShieldFromCard(state, card, effect, action.playerId, card.power ?? 0, target);
  }

  if (effect.type === "CREATE_ATTACK_DIE_REROLL") {
    if (effect.adventureDice && !state.combat) {
      // Fortune on the adventure map: there is no Hero Power statistic, so the
      // reroll count is paid the board-game way — discard power-source cards for
      // +1 reroll each (Power 0/1/2 -> 1/2/3). The boost choice does that, then
      // creates the Treasure/Resource reroll effect at the chosen Power.
      openFortuneBoostStep(state, action.playerId, card, 0);
    } else {
      createAttackRerollEffectFromCard(state, card, action.playerId, mode);
    }
  }

  // Shackles of War (house rule): the enemy hero cannot Surrender this Combat
  // — a CANNOT_SURRENDER_COMBAT effect placed on the enemy. Retreat (and a
  // fought-out loss) still happen normally.
  if (effect.type === "BLOCK_ENEMY_SURRENDER" && state.combat) {
    const enemyId = pickEnemyPlayerId(state, action.playerId);
    if (enemyId) {
      createActiveEffect(
        state,
        {
          name: card.name,
          scope: "player",
          duration: { type: "combat" },
          polarity: "negative",
          removable: false,
          modifiers: [{ type: "CANNOT_SURRENDER_COMBAT" }]
        },
        { type: "card", cardId: card.id, controllerId: action.playerId },
        enemyId
      );
    }
  }

  if (effect.type === "SIEGE_DEMOLISH") {
    const siege = state.combat?.siege;
    if (!siege) {
      throw new Error("Ballistics works only during a siege.");
    }
    if (effect.target === "arrow-tower") {
      if (!siege.arrowTowerUnitId) {
        throw new Error("The Arrow Tower is already gone.");
      }
      removeArrowTower(state, null, "Ballistics levels it");
    } else {
      openSiegeDemolishChoice(state, action.playerId, 1);
    }
  }

  // Artillery (basic): the slowest enemy takes `amount` "effect" damage — the
  // same shot a Ballista makes. The card only offered the lowest-initiative
  // enemy/enemies as targets; re-checked here so removing that filter is caught
  // (a thrown error rolls the whole play back, card included).
  if (effect.type === "DAMAGE_LOWEST_INITIATIVE_ENEMY" && state.combat) {
    const unit = target ? state.combat.units[target.unitId] : undefined;
    if (!unit || !isUnitAlive(unit) || unit.controllerId === action.playerId) {
      throw new Error("Artillery must hit a living enemy unit.");
    }
    if (!isLowestInitiativeEnemy(state, action.playerId, unit)) {
      throw new Error("Artillery hits an enemy unit with the lowest initiative.");
    }
    unit.damage += effect.amount;
    noteUnitDamagedForTokens(state, unit, effect.amount);
    appendEvent(state, {
      type: "DAMAGE_ASSIGNED",
      source: { type: "card", cardId: card.id, controllerId: action.playerId },
      target: { type: "unit", unitId: unit.id },
      amount: effect.amount,
      damageKind: "effect"
    });
    markUnitRemovedIfNeeded(state, unit);
    finishCombatIfNeeded(state);
  }

  if (effect.type === "DRAW_CARDS") {
    const handBefore = state.players[action.playerId].hand.length;
    drawCardsForPlayer(state, action.playerId, getEffectAmount(effect, mode));
    // Charm of Mana / Shackles of War: "draw N, then discard M". The discard is
    // a follow-up choice; `thenDiscardDrawnOnly` limits it to the drawn cards.
    if (effect.thenDiscard) {
      const hand = state.players[action.playerId].hand;
      const drawn = hand.slice(handBefore);
      const candidates = effect.thenDiscardDrawnOnly ? drawn : [...hand];
      openHandDiscardChoice(state, action.playerId, effect.thenDiscard, candidates, Boolean(effect.thenDiscardDrawnOnly), card.name);
    }
  }

  // Offense/Armorer outside combat: the stat fizzles, the draw still happens.
  if (effect.type === "ADD_COMBAT_STAT" && effect.drawCards && !state.combat) {
    drawCardsForPlayer(state, action.playerId, effect.drawCards);
  }

  if (effect.type === "GAIN_MORALE") {
    if (mode === "expert" && effect.expertDrawCards) {
      drawCardsForPlayer(state, action.playerId, effect.expertDrawCards);
    }
    changeMorale(state, action.playerId, effect.amount);
  }

  if (effect.type === "NECROMANCY_REINFORCE") {
    // Playing the card consumes the after-combat window.
    state.players[action.playerId].necromancyWindow = false;
    queueNecromancyReinforce(state, action.playerId, mode);
  }

  if (effect.type === "GAIN_RESOURCES") {
    // BINH house rule: Estates is nerfed to 2 / 4 gold.
    const gain =
      card.id === "ability.estates"
        ? { gold: estatesGold(getRuleset(state), mode) }
        : mode === "expert" && effect.expertGain
          ? effect.expertGain
          : effect.gain;
    gainResources(state, action.playerId, gain, `played ${card.name}`);
  }

  if (effect.type === "GAIN_HERO_MOVEMENT") {
    // Buffs reach every hero the player commands, the Secondary Hero included.
    const amount = mode === "expert" ? (effect.expertAmount ?? effect.amount) : effect.amount;
    for (const hero of Object.values(state.heroes)) {
      if (hero.controllerId === action.playerId) {
        hero.movementPoints += amount;
      }
    }
    if (effect.moveThroughThisTurn) {
      createActiveEffect(
        state,
        {
          name: card.name,
          scope: "player",
          duration: { type: "current-turn" },
          polarity: "positive",
          removable: false,
          modifiers: [{ type: "HERO_MOVE_THROUGH" }]
        },
        { type: "card", cardId: card.id, controllerId: action.playerId },
        action.playerId
      );
    }
    if (effect.waterWalkThisTurn) {
      createActiveEffect(
        state,
        {
          name: card.name,
          scope: "player",
          duration: { type: "current-turn" },
          polarity: "positive",
          removable: false,
          modifiers: [{ type: "HERO_WATER_WALK" }]
        },
        { type: "card", cardId: card.id, controllerId: action.playerId },
        action.playerId
      );
    }
    // Shield of Naval Glory (Sea side): the +1 movement comes with a card draw.
    if (effect.drawCards) {
      drawCardsForPlayer(state, action.playerId, effect.drawCards);
    }
  }

  if (effect.type === "DIMENSION_DOOR") {
    openDimensionDoorChoice(state, action.playerId, effect.fields);
  }

  // View Earth (Map): open the choice of which enemy Mine in reach to capture.
  if (effect.type === "VIEW_EARTH") {
    openViewEarthChoice(state, action.playerId, effect.withinFields);
  }

  if (effect.type === "GAIN_EXPERT_USE") {
    const player = state.players[action.playerId];
    player.combatStats.expertUseBonusThisRound = (player.combatStats.expertUseBonusThisRound ?? 0) + effect.amount;
  }

  if (effect.type === "DIPLOMACY_RECRUIT") {
    openDiplomacyRecruit(state, action.playerId);
  }

  // Visions (Map): begin the scry. The Power (how many cards) is paid by
  // discarding Spells for +1 each — offered interactively — then a Neutral deck
  // is chosen and scryed.
  if (effect.type === "VISIONS_SCRY") {
    openVisionsScry(state, action.playerId, effect.cardsByPower);
  }

  if (effect.type === "TAKE_FROM_DISCARD") {
    state.adventure?.rewardQueue.unshift({
      playerId: action.playerId,
      kind: "discard-pick",
      count: effect.count,
      filter: effect.filter,
      fromTop: effect.fromTop,
      shuffleRestIntoDeck: effect.shuffleRestIntoDeck
    });
  }

  // Scholar (expert): open the interactive Empowered-Statistic swap (up to
  // `count` removals). The Scholar card was already removed by cost.removeSelf.
  if (effect.type === "SCHOLAR_EMPOWER_SWAP") {
    state.adventure?.rewardQueue.unshift({
      playerId: action.playerId,
      kind: "visit-steps",
      steps: [{ type: "SCHOLAR_EMPOWER_PICK", remaining: effect.count, takenTypes: [] }]
    });
  }

  if (effect.type === "CARD_DECK_SEARCH") {
    state.adventure?.rewardQueue.unshift({
      playerId: action.playerId,
      kind: "shared-deck-search",
      deckId: effect.deck,
      count: effect.count
    });
  }

  if (effect.type === "RANDOM_ENEMY_DISCARD") {
    discardRandomEnemyCards(state, action.playerId, effect.count);
  }

  if (effect.type === "ENEMY_MORALE_STRIP") {
    const enemyId = pickEnemyPlayerId(state, action.playerId);
    const enemy = enemyId ? state.players[enemyId] : undefined;
    if (enemyId && enemy && enemy.morale > 0) {
      changeMorale(state, enemyId, -1);
    }
  }

  if (effect.type === "ROLL_FOR_MORALE") {
    const random = createSeededRandom(`${state.seed}#roll-for-morale#${eventSeedNumber(state)}`);
    const faces = [-1, -1, 0, 0, 1, 1];
    const roll = faces[random.nextInt(0, faces.length - 1)];
    appendEvent(state, {
      type: "ADVENTURE_DICE_ROLLED",
      playerId: action.playerId,
      dice: "attack",
      results: [`${card.name} attack die: ${roll >= 0 ? "+" : ""}${roll}`],
      attackRolls: [roll]
    });
    if (roll === effect.onRoll) {
      changeMorale(state, action.playerId, 1);
    }
  }

  if (effect.type === "EAGLE_EYE_DIG") {
    resolveEagleEyeDig(state, action.playerId, mode, cards);
  }

  if (effect.type === "TELEPORT_HERO_TO_TOWN") {
    queueTownPortalChoice(state, action.playerId, effect.movementBonus ?? 0);
  }

  if (effect.type === "DISCOVER_TILE_CARD") {
    const hero = getMainHero(state, action.playerId);
    if (state.adventure && hero?.spaceId) {
      state.adventure.rewardQueue.unshift({
        playerId: action.playerId,
        kind: "visit-steps",
        steps: [{ type: "DISCOVER_ADJACENT_TILE" }]
      });
    }
  }

  if (effect.type === "CREATE_INITIATIVE_BUFF" && target && state.combat) {
    const targetUnit = state.combat.units[target.unitId];
    const amount = doubleAmountForUnitName(
      getAmountByPower(effect.amountByPower, effect.amount ?? 0, 0),
      targetUnit,
      effect.doubleForUnitName
    );
    createActiveEffect(
      state,
      {
        name: effect.name,
        scope: "unit",
        duration: effect.duration,
        polarity: effect.polarity ?? (amount >= 0 ? "positive" : "negative"),
        removable: effect.removable ?? true,
        modifiers: [{ type: "INITIATIVE_BONUS", amount }]
      },
      { type: "card", cardId: card.id, controllerId: action.playerId },
      action.playerId,
      target
    );
  }

  if (effect.type === "ADD_UNIT_MAX_HEALTH" && target && state.combat) {
    const unit = state.combat.units[target.unitId];
    if (unit && unit.controllerId === action.playerId) {
      unit.maxHealth += doubleAmountForUnitName(effect.amount, unit, effect.doubleForUnitName);
    }
  }

  // Necklace of Swiftness (option B): move one of your own units one space. The
  // destination empty space is picked in a follow-up (the "combat-step"
  // OPTION_CHOICE), resolved by resolveUnitStepChoice. Only the controller's
  // own units may be moved; a unit hemmed in with no empty neighbour is a no-op.
  if (effect.type === "MOVE_UNIT_ADJACENT" && target && state.combat) {
    const unit = state.combat.units[target.unitId];
    if (unit && unit.controllerId === action.playerId) {
      openUnitStepChoice(state, action.playerId, unit);
    }
  }

  // Xyron's Inferno: the chosen unit's space and every orthogonally adjacent
  // space — every unit in the blast, friend or foe — takes the flat damage.
  // Xyron's Inferno: select a space (occupied or empty); every unit on it and on
  // the orthogonally adjacent spaces — friend or foe — takes the flat damage. The
  // centre is read from the chosen space (or, for legacy unit targets, that unit's
  // space). A Dwarf centre that shrugged the Specialty off (negatedByDwarf) is a
  // no-op, like the other unit-targeted branches.
  if (effect.type === "AREA_DAMAGE_ALL_ADJACENT" && state.combat && action.target && !negatedByDwarf) {
    const center =
      action.target.type === "space"
        ? action.target.position
        : action.target.type === "unit"
          ? state.combat.units[action.target.unitId]?.position
          : undefined;
    if (center !== undefined) {
      const blastArea = new Set<number>([center, ...getOrthogonalNeighbors(center)]);
      const inBlast = Object.values(state.combat.units).filter(
        (unit) => isUnitAlive(unit) && blastArea.has(unit.position)
      );
      for (const unit of inBlast) {
        dealAreaCardDamage(state, action.playerId, card, unit, effect.amount);
      }
    }
  }

  // Deemer's Meteor Shower I (target + 1 adjacent) and VI (target + 2 adjacent):
  // deal the chosen tier's damage to the target unit and that many units adjacent
  // to it (friend or foe; the caster picks when more are adjacent). The damage is
  // fixed by the chosen CHOOSE_ONE option (its power-source discard buys the tier).
  if (effect.type === "AREA_DAMAGE_PICK_ADJACENT" && state.combat && action.target && !negatedByDwarf) {
    const amount = effect.amount ?? getAmountByPower(effect.amountByPower ?? {}, 1, card.power ?? 0);
    const center =
      action.target.type === "space"
        ? action.target.position
        : action.target.type === "unit"
          ? state.combat.units[action.target.unitId]?.position
          : undefined;
    if (center !== undefined) {
      resolveAreaPickDamage(
        state,
        action.playerId,
        card,
        center,
        amount,
        effect.includeCenter,
        effect.adjacentPicks
      );
    }
  }

  // Deemer's Meteor Shower IV (one option): shuffle the discard pile back into
  // the deck FIRST, then draw — and the Meteor Shower IV card itself is discarded
  // AFTER the shuffle. It was moved to the discard before this effect ran, so it
  // is held aside and left in the discard rather than swept back into the deck
  // (and so it can never be the card drawn). The "+1 Power" option is the
  // universal power-source discard, handled by ADD_SPELL_POWER, not here.
  if (effect.type === "RESHUFFLE_DISCARD_THEN_DRAW") {
    const player = state.players[action.playerId];
    if (player) {
      const playedIndex = player.discard.lastIndexOf(action.cardId);
      const playedCard = playedIndex >= 0 ? [player.discard[playedIndex]] : [];
      const toShuffle =
        playedIndex >= 0
          ? [...player.discard.slice(0, playedIndex), ...player.discard.slice(playedIndex + 1)]
          : [...player.discard];
      if (toShuffle.length > 0) {
        player.deck = shuffleCards(
          [...player.deck, ...toShuffle],
          `${state.seed}#reshuffle-draw#${action.playerId}#${eventSeedNumber(state)}`
        );
      }
      // The played card stays in the discard (discarded after the shuffle).
      player.discard = playedCard;
      drawCardsForPlayer(state, action.playerId, effect.drawCards);
    }
  }

  // Solmyr's Chain Lightning (I/VI): the selected unit takes the leftmost bolt,
  // then the chain forks to the units closest to it (the caster allocating).
  // Specialty cards carry a fixed `damages`; a power-scaled `damagesByPower`
  // (the Spell, never reached here) would use the card's printed power.
  if (effect.type === "CHAIN_LIGHTNING" && target && state.combat) {
    startChainLightning(state, action.playerId, card, target.unitId, chainLightningDamages(effect, card.power ?? 0));
  }

  // Torosar's Ballista specialty: field an extra Ballista (this combat or the
  // rest of the round) and/or activate Ballistas for an immediate shot each.
  if (effect.type === "BALLISTA_SPECIALTY" && state.combat) {
    if (effect.grant) {
      createActiveEffect(
        state,
        {
          name: "Ballista",
          scope: "player",
          duration: effect.grant === "game-round" ? { type: "current-game-round" } : { type: "combat" },
          polarity: "positive",
          removable: false,
          modifiers: [{ type: "EXTRA_BALLISTA" }]
        },
        { type: "card", cardId: card.id, controllerId: action.playerId },
        action.playerId
      );
    }
    // "Activate all your Ballistas" counts the just-granted one too.
    if (effect.activate === "all") {
      activateBallistas(state, action.playerId, countBallistas(state, action.playerId));
    } else if (effect.activate === "one" && countBallistas(state, action.playerId) >= 1) {
      activateBallistas(state, action.playerId, 1);
    }
  }

  // Solmyr's Chain Lightning IV: dig the top of your own deck, keep 1, discard
  // the rest. One revealed card is auto-kept; with several, the owner chooses.
  if (effect.type === "DECK_DIG_KEEP_ONE") {
    const digPlayer = state.players[action.playerId];
    const revealed: CardId[] = [];
    for (let index = 0; index < effect.count; index += 1) {
      const drawn = digPlayer.deck.pop();
      if (!drawn) {
        break;
      }
      revealed.push(drawn);
    }
    if (revealed.length === 1) {
      digPlayer.hand.push(revealed[0]);
    } else if (revealed.length > 1) {
      state.pendingChoice = {
        id: `choice_${nextEventNumber(state)}`,
        type: "OPTION_CHOICE",
        playerId: action.playerId,
        prompt: `${card.name}: keep one card; the rest go to your discard pile.`,
        options: revealed.map((cardId) => ({ label: `Keep ${cards[cardId]?.name ?? cardId}` })),
        context: "own-deck-pick",
        ownDeckPick: { cardIds: revealed },
        returnPhase: state.combat ? "combat" : "player-turn"
      };
      state.phase = "choice";
      state.priorityPlayerId = action.playerId;
    }
  }

  // Gem's First Aid: take the war machine from the shared supply for free
  // (Torosar's Ballista I pays gold), or draw the fallback when none remain.
  if (effect.type === "GAIN_WAR_MACHINE") {
    const supply = state.adventure?.warMachineSupply ?? [];
    if (state.adventure && supply.includes(effect.warMachineCardId)) {
      const cost = effect.goldCost ? { gold: effect.goldCost } : {};
      if (effect.goldCost) {
        const buyer = state.players[action.playerId];
        if (!buyer || buyer.resources.gold < effect.goldCost) {
          throw new Error(`Not enough gold to gain the ${cards[effect.warMachineCardId]?.name ?? "war machine"}.`);
        }
        buyer.resources.gold -= effect.goldCost;
        appendEvent(state, {
          type: "RESOURCES_SPENT",
          playerId: action.playerId,
          cost,
          reason: `gained the ${cards[effect.warMachineCardId]?.name ?? "war machine"}`
        });
      }
      state.adventure.warMachineSupply = supply.filter((cardId) => cardId !== effect.warMachineCardId);
      state.players[action.playerId].hand.push(effect.warMachineCardId);
      appendEvent(state, {
        type: "WAR_MACHINE_BOUGHT",
        playerId: action.playerId,
        cardId: effect.warMachineCardId,
        cost,
        at: "factory"
      });
    } else if (effect.fallbackDrawCards) {
      drawCardsForPlayer(state, action.playerId, effect.fallbackDrawCards);
    }
  }

  // Gem's First Aid VI: double the in-play First Aid Tent's per-round heal for
  // the rest of this Combat. The Tent's combat effect is rebuilt fresh (amount
  // 1) at the start of the player's next combat, so the doubling never carries.
  if (effect.type === "DOUBLE_FIRST_AID_TENT") {
    for (const active of state.activeEffects) {
      if (active.controllerId !== action.playerId) {
        continue;
      }
      for (const modifier of active.modifiers) {
        if (modifier.type === "HEAL_ONCE_PER_COMBAT_ROUND") {
          modifier.amount *= 2;
        }
      }
    }
  }

  // Gelu's Sharpshooters IV: discard a Pack of Elves, then fetch the single
  // Sharpshooters card from the silver Neutral deck into your unit deck.
  if (effect.type === "CONVERT_ARMY_UNIT") {
    const player = state.players[action.playerId];
    const deck = state.decks[NEUTRAL_DECK_IDS[effect.toTier]];
    const fromIndex =
      player?.army.findIndex(
        (unit) => unit.unitDefId === effect.fromUnitDefId && unit.side === effect.fromSide
      ) ?? -1;
    const alreadyHas = effect.unique
      ? (player?.army.some((unit) => unit.unitDefId === effect.toUnitDefId) ?? false)
      : false;
    const inDraw = deck?.drawPile.indexOf(effect.toUnitDefId) ?? -1;
    const inDiscard = deck?.discardPile.indexOf(effect.toUnitDefId) ?? -1;
    if (player && deck && fromIndex >= 0 && !alreadyHas && (inDraw >= 0 || inDiscard >= 0)) {
      player.army.splice(fromIndex, 1);
      if (inDraw >= 0) {
        deck.drawPile.splice(inDraw, 1);
      } else {
        deck.discardPile.splice(inDiscard, 1);
      }
      addArmyUnit(player, effect.toUnitDefId, "neutral");
      appendEvent(state, {
        type: "UNIT_RECRUITED",
        playerId: action.playerId,
        unitDefId: effect.toUnitDefId,
        kind: "recruit",
        cost: {}
      });
    }
  }

  if (playedToDiscard) {
    holdOngoingCardIfEffectCreated(state, action.playerId, action.cardId, effectCountBeforePlay, "discard");
  }

  // A play that opened a choice (Chain Lightning's allocation, Solmyr IV's deck
  // dig) owns the phase/priority it just set — don't stomp it back to combat.
  if (state.pendingChoice) {
    return;
  }

  if (state.phase === "combat" || state.combat) {
    state.phase = "combat";
  }
  state.priorityPlayerId = null;
  pumpAdventureQueues(state);
}

/** Picks the opposing player: the combat opponent, or the only other seat. */
function pickEnemyPlayerId(state: GameState, playerId: PlayerId): PlayerId | null {
  if (state.combat) {
    const enemyId =
      state.combat.attackerPlayerId === playerId ? state.combat.defenderPlayerId : state.combat.attackerPlayerId;
    return enemyId !== NEUTRAL_PLAYER_ID ? enemyId : null;
  }

  const others = state.turnOrder.filter((candidate) => candidate !== playerId && candidate !== NEUTRAL_PLAYER_ID);
  return others[0] ?? null;
}

/** Dragon Wing Tabard: random discard(s) from the enemy hand. */
function discardRandomEnemyCards(state: GameState, playerId: PlayerId, count: number): void {
  const enemyId = pickEnemyPlayerId(state, playerId);
  const enemy = enemyId ? state.players[enemyId] : undefined;
  if (!enemyId || !enemy) {
    return;
  }

  const random = createSeededRandom(`${state.seed}#enemy-discard#${eventSeedNumber(state)}`);
  for (let index = 0; index < count && enemy.hand.length > 0; index += 1) {
    const pick = random.nextInt(0, enemy.hand.length - 1);
    const [cardId] = enemy.hand.splice(pick, 1);
    enemy.discard.push(cardId);
    appendEvent(state, {
      type: "HAND_REFRESHED",
      playerId: enemyId,
      discarded: 1,
      drawn: 0
    });
    void cardId;
  }
}

/**
 * Eagle Eye: dig the Spell deck from the top for the first Basic (basic play)
 * or Expert (expert play) spell, reshuffle the rest, then take or discard
 * the find. In BINH mode the split decks make the dig a plain top-card draw
 * of the matching deck.
 */
function resolveEagleEyeDig(state: GameState, playerId: PlayerId, mode: CardPlayMode, cards: CardLibrary): void {
  const wantedLevel = mode === "expert" ? "expert" : "basic";
  const deckId =
    getRuleset(state) === "binh" && wantedLevel === "expert" && state.decks["spells-expert"]
      ? "spells-expert"
      : "spells";
  const deck = state.decks[deckId];
  if (!deck) {
    return;
  }

  // Dig from the top of the draw pile for the first matching spell.
  const remaining = [...deck.drawPile];
  let foundCardId: string | null = null;
  for (let index = remaining.length - 1; index >= 0; index -= 1) {
    const candidate = cards[remaining[index]];
    if (candidate?.kind === "spell" && (candidate.spellLevel ?? "basic") === wantedLevel) {
      foundCardId = remaining[index];
      remaining.splice(index, 1);
      break;
    }
  }

  if (!foundCardId) {
    return;
  }

  deck.drawPile = shuffleCards(remaining, `${state.seed}#eagle-eye#${eventSeedNumber(state)}`);

  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "OPTION_CHOICE",
    playerId,
    prompt: `Eagle Eye found ${cards[foundCardId]?.name ?? foundCardId}`,
    options: [{ label: `Take ${cards[foundCardId]?.name ?? foundCardId} into hand` }, { label: "Discard it" }],
    context: "eagle-eye",
    eagleEye: { deckId, cardId: foundCardId },
    returnPhase: state.combat ? "combat" : "player-turn"
  };
  state.phase = "choice";
  state.priorityPlayerId = playerId;
}

/** Town Portal: choose a controlled town or flagged settlement to move to. */
function queueTownPortalChoice(state: GameState, playerId: PlayerId, movementBonus: number): void {
  const adventure = state.adventure;
  const hero = getMainHero(state, playerId);
  if (!adventure || !hero) {
    return;
  }

  // Rulebook restriction: "If the selected town already has a hero in it, and
  // the teleporting hero would not be able to move out of the city during this
  // turn, they can not teleport to the town." The Power-scaled movement bonus
  // counts toward being able to leave, so it is added to the projection.
  const projectedMovement = hero.movementPoints + movementBonus;
  const fieldHasOtherHero = (spaceId: string) =>
    Object.values(state.heroes).some((other) => other.id !== hero.id && other.spaceId === spaceId);
  const destinationAllowed = (spaceId: string) => !fieldHasOtherHero(spaceId) || projectedMovement > 0;

  const destinations: { label: string; spaceId: string }[] = [];
  for (const town of Object.values(state.towns)) {
    if (
      town.controllerId === playerId &&
      town.fieldId &&
      town.fieldId !== hero.spaceId &&
      destinationAllowed(town.fieldId)
    ) {
      destinations.push({ label: `Town (${town.factionId ?? town.id})`, spaceId: town.fieldId });
    }
  }
  for (const field of Object.values(adventure.fields)) {
    if (
      field.location === "settlement" &&
      field.flagOwnerId === playerId &&
      field.spaceId !== hero.spaceId &&
      destinationAllowed(field.spaceId)
    ) {
      destinations.push({ label: `Settlement at ${field.spaceId}`, spaceId: field.spaceId });
    }
  }

  if (destinations.length === 0) {
    return;
  }

  adventure.rewardQueue.unshift({
    playerId,
    kind: "visit-steps",
    steps: [
      {
        type: "CHOOSE_ONE",
        prompt: "Town Portal: move your hero to…",
        options: [
          ...destinations.map((destination) => ({
            label: destination.label,
            steps: [
              { type: "TELEPORT_HERO" as const, heroId: hero.id, spaceId: destination.spaceId, movementBonus }
            ]
          })),
          { label: "Cancel (stay)", steps: [] }
        ]
      }
    ]
  });
}

function applyActiveEffectAction(
  state: GameState,
  action: Extract<GameAction, { type: "USE_ACTIVE_EFFECT" }>
): void {
  const combat = state.combat;
  const effect = state.activeEffects.find((candidate) => candidate.id === action.effectId);
  if (!combat || !effect || effect.controllerId !== action.playerId || action.target.type !== "unit") {
    throw new Error("That active effect cannot be used now.");
  }

  const healModifier = effect.modifiers.find((modifier) => modifier.type === "HEAL_ONCE_PER_COMBAT_ROUND");
  const target = combat.units[action.target.unitId];
  if (
    !healModifier ||
    healModifier.type !== "HEAL_ONCE_PER_COMBAT_ROUND" ||
    !target ||
    target.controllerId !== action.playerId ||
    !isUnitAlive(target) ||
    target.damage <= 0
  ) {
    throw new Error("That active effect target is not legal.");
  }

  // First Aid Tent: a single basic heal per round, OR an expert activation that
  // heals several times this round. The expert is the First Aid ability card's
  // expert side — the player must hold that card with a free expert use; playing
  // it spends the crown and discards the card. Basic and expert are mutually
  // exclusive within a round. The volley size (`expertMax`) is read from the
  // First Aid card, so it stays the source of truth (mirrors Artillery/Ballista).
  const expertMax = firstAidVolleyHeals();
  const usage = effect.healRound?.round === combat.round ? effect.healRound : undefined;
  const mode = action.mode ?? "basic";

  if (mode === "expert") {
    if (usage || !playerCanUseFirstAidVolley(state, action.playerId)) {
      throw new Error("First Aid's expert side needs the First Aid card and a free expert use this round.");
    }
    spendFirstAidExpert(state, action.playerId);
    effect.healRound = { round: combat.round, count: 1, expert: true };
  } else if (!usage) {
    effect.healRound = { round: combat.round, count: 1, expert: false };
  } else if (usage.expert && usage.count < expertMax) {
    usage.count += 1;
  } else {
    throw new Error("That active effect has already been used this combat round.");
  }

  healUnitDamage(state, effect.source, action.target, healModifier.amount);

  appendEvent(state, {
    type: "ACTIVE_EFFECT_USED",
    effectId: effect.id,
    playerId: action.playerId,
    target: action.target
  });

  state.phase = "combat";
  state.priorityPlayerId = null;
}

function applyUnitAbilityAction(
  state: GameState,
  action: Extract<GameAction, { type: "USE_UNIT_ABILITY" }>
): void {
  const combat = state.combat;
  const unit = combat?.units[action.unitId];
  const target = action.target.type === "unit" ? combat?.units[action.target.unitId] : undefined;
  const ability = unit ? getUnitAbilityDefinitions(unit).find((candidate) => candidate.id === action.abilityId) : undefined;

  if (
    !combat ||
    !unit ||
    !target ||
    unit.controllerId !== action.playerId ||
    unit.activatedThisRound ||
    unit.movedThisActivation ||
    combat.activeUnitId !== unit.id ||
    ability?.implementationStatus !== "implemented" ||
    !isUnitAlive(target)
  ) {
    throw new Error("That unit ability cannot be used now.");
  }

  // Token "other action" (Ogres' Attack token, Few Sorceresses' Weakness):
  // used instead of attacking, places the token and ends the activation.
  if (ability.effect?.type === "PLACE_TOKEN_ACTION") {
    const effect = ability.effect;
    const sideOk =
      effect.targets === "any" ||
      (effect.targets === "friendly" && target.controllerId === unit.controllerId) ||
      (effect.targets === "enemy" && target.controllerId !== unit.controllerId);
    if (!sideOk || (effect.targetTypes && !effect.targetTypes.includes(target.type))) {
      throw new Error("That unit cannot receive this token.");
    }

    placeCombatToken(state, target, effect.token, effect.amount, ability.name, effect.rounds);
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: unit.id,
      abilityId: ability.id,
      targetUnitId: target.id,
      message: `${unit.cardName} places a ${ability.name} on ${target.cardName}.`
    });

    unit.activatedThisRound = true;
    advanceActiveUnit(state);
    state.phase = "combat";
    state.priorityPlayerId = null;
    return;
  }

  if (ability.effect?.type !== "ACTIVATION_ATTACK_BUFF") {
    throw new Error("That unit ability cannot be used now.");
  }

  if (target.controllerId !== action.playerId || !ability.effect.targetTypes.includes(target.type)) {
    throw new Error("That unit ability cannot be used now.");
  }

  createActiveEffect(
    state,
    {
      name: ability.name,
      scope: "unit",
      duration: ability.effect.duration,
      polarity: "positive",
      removable: true,
      modifiers: [
        {
          type: "ATTACK_BONUS",
          amount: ability.effect.amount
        }
      ]
    },
    {
      type: "unit",
      unitId: unit.id,
      controllerId: action.playerId
    },
    action.playerId,
    { type: "unit", unitId: target.id }
  );

  if (ability.effect.preventsMovement) {
    createActiveEffect(
      state,
      {
        name: `${ability.name} used`,
        scope: "unit",
        duration: { type: "current-combat-round" },
        polarity: "neutral",
        removable: false,
        modifiers: [{ type: "UNIT_CANNOT_MOVE" }]
      },
      {
        type: "unit",
        unitId: unit.id,
        controllerId: action.playerId
      },
      action.playerId,
      { type: "unit", unitId: unit.id }
    );
  }

  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: unit.id,
    abilityId: ability.id,
    targetUnitId: target.id,
    message: `${unit.name} uses ${ability.name} on ${target.name}.`
  });

  if (ability.effect.endsActivation) {
    unit.activatedThisRound = true;
    advanceActiveUnit(state);
  }

  state.phase = "combat";
  state.priorityPlayerId = null;
}

/**
 * A combat space cannot host a summoned unit when it is off the board, holds a
 * living unit, an obstacle token, or a siege Wall/Gate. Shared by the Summon
 * Elemental spell's resolution and its legal-target enumeration.
 */
export function isSpaceBlockedForSummon(combat: CombatState, position: number): boolean {
  if (!isBattlefieldPosition(position)) {
    return true;
  }
  if ((combat.obstacles ?? []).includes(position)) {
    return true;
  }
  // Any spell token (Force Field / Fire Wall / Quicksand / Land Mine) holds a
  // space: a unit cannot be summoned or teleported onto it.
  if ((combat.battlefieldTokens ?? []).some((token) => token.position === position)) {
    return true;
  }
  if (combat.siege?.walls.includes(position) || combat.siege?.gatePosition === position) {
    return true;
  }
  return Object.values(combat.units).some((unit) => isUnitAlive(unit) && unit.position === position);
}

/**
 * Places a freshly summoned unit (Summon Elemental spell) onto an empty combat
 * space: it joins the caster's army and the combat at once, acting on its own
 * initiative this round — exactly like the Pit Lords' Demons. Returns the new
 * combat unit, or null when the space is unusable or the side is missing.
 */
function placeSummonedUnit(
  state: GameState,
  playerId: PlayerId,
  unitDefId: string,
  side: "few" | "pack",
  position: number
): CombatUnitState | null {
  const combat = state.combat;
  const player = state.players[playerId];
  if (!combat || !player || isSpaceBlockedForSummon(combat, position) || !getUnitSide(unitDefId, side)) {
    return null;
  }

  const armyUnit = addArmyUnit(player, unitDefId, side);
  const summoned = makeCombatUnitFromArmy(
    armyUnit,
    playerId,
    `unit_${playerId}_${armyUnit.id}`,
    position,
    getRuleset(state)
  );
  if (!summoned) {
    return null;
  }

  // It joins the round immediately — it may still act when its initiative comes.
  summoned.activatedThisRound = false;
  // Conjured units have no printed grade: flag them so the neutral AI skips its
  // same-tier rule for them and only attacks them once no graded target remains.
  summoned.summoned = true;
  combat.units[summoned.id] = summoned;
  return summoned;
}

/**
 * Clone Spell: place a 1-Health Clone Token copying `original` onto an empty
 * space. The Clone is rebuilt from the original's PRINTED side (its unitDefId +
 * variant via makeCombatUnitFromArmy), so it copies the printed statistics, type
 * and printed abilities but none of the ongoing effects, tokens or specialty
 * transforms layered on the original — exactly "everything printed on its card,
 * excluding any other effects played on the original". Its maxHealth is forced to
 * 1, it carries no army card (it is a token, removed when the combat ends), and it
 * is linked to its original by cloneOfUnitId so it dies with it. Returns the new
 * Clone, or null when the space is unusable or the original has no printed side.
 */
function placeCloneUnit(
  state: GameState,
  playerId: PlayerId,
  original: CombatUnitState,
  position: number
): CombatUnitState | null {
  const combat = state.combat;
  if (!combat || isSpaceBlockedForSummon(combat, position) || !original.unitDefId) {
    return null;
  }

  const clone = makeCombatUnitFromArmy(
    { id: `clonetoken_${nextEventNumber(state)}`, unitDefId: original.unitDefId, side: original.variant },
    playerId,
    `unit_${playerId}_clone_${nextEventNumber(state)}`,
    position,
    getRuleset(state)
  );
  if (!clone) {
    return null;
  }

  // A 1-Health token of the printed unit. It acts on its own initiative this
  // round (not pre-activated) and is gradeless to the neutral AI like a summon.
  clone.maxHealth = 1;
  clone.damage = 0;
  clone.activatedThisRound = false;
  clone.summoned = true;
  clone.cloneOfUnitId = original.id;
  clone.cardName = `Clone of ${original.cardName}`;
  // It is a Clone Token, not a real army card: drop the army linkage so it is
  // never mistaken for a recruited unit (and is discarded when the combat ends).
  delete clone.armyUnitId;
  combat.units[clone.id] = clone;
  return clone;
}

/**
 * Pit Lords' "Summon Demons" other action: instead of moving or attacking, the
 * active Pit Lords either summon a Few of Demons onto an empty adjacent space
 * or reinforce a friendly Few of Demons up to a Pack — once per combat, only
 * after one of the controller's units has been removed this combat. The new /
 * reinforced unit also persists in the army after the combat. The summoned
 * unit is treated as already activated this round (it acts from the next).
 */
/**
 * Tower Genies' "Wish": discard up to `count` cards off the top of the
 * controller's deck. The deck reshuffles its discard pile to complete the count
 * if it runs out mid-dig (per the rules). Returns the cards dug this way; the
 * caller routes them to the hand/discard.
 */
function discardFromDeckTop(state: GameState, playerId: PlayerId, count: number): CardId[] {
  const player = state.players[playerId];
  if (!player) {
    return [];
  }
  const dug: CardId[] = [];
  for (let index = 0; index < count; index += 1) {
    if (player.deck.length === 0 && player.discard.length > 0) {
      player.deck = shuffleCards(
        player.discard,
        `${state.seed}#genie-reshuffle#${playerId}#${eventSeedNumber(state)}#${index}`
      );
      player.discard = [];
    }
    const card = player.deck.pop();
    if (!card) {
      break;
    }
    dug.push(card);
  }
  return dug;
}

/**
 * Resolves a Genies "Wish": dig cards off the deck, then take a Spell among
 * them to hand. With at most one Spell it auto-resolves (the lone Spell, if
 * any, goes to hand; everything else to discard); with several Spells the
 * controller chooses which to take. Returns true when a choice paused combat.
 */
function runGenieDeckDraw(
  state: GameState,
  unit: CombatUnitState,
  ability: { abilityId: string; abilityName: string; count: number },
  mode: "other-action" | "on-attack"
): boolean {
  const player = state.players[unit.controllerId];
  if (!player) {
    return false;
  }

  const dug = discardFromDeckTop(state, unit.controllerId, ability.count);
  const spells = dug.filter((cardId) => cardLibrary[cardId]?.kind === "spell");

  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: unit.id,
    abilityId: ability.abilityId,
    message: `${unit.cardName} discards ${dug.length} card${dug.length === 1 ? "" : "s"} from the deck for ${ability.abilityName}.`
  });

  // No choice to make: take the single Spell (if any) to hand, the rest to
  // discard. A neutral seat with no deck simply dug nothing.
  if (spells.length <= 1) {
    const taken = spells[0];
    for (const cardId of dug) {
      if (cardId === taken) {
        player.hand.push(cardId);
      } else {
        player.discard.push(cardId);
      }
    }
    if (taken) {
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: unit.id,
        abilityId: ability.abilityId,
        message: `${player.name} takes ${cardLibrary[taken]?.name ?? taken} to hand.`
      });
    }
    return false;
  }

  // Several Spells dug up: the non-Spells go to discard now; the controller
  // chooses which Spell to keep (the rest go to discard on resolution).
  for (const cardId of dug) {
    if (cardLibrary[cardId]?.kind !== "spell") {
      player.discard.push(cardId);
    }
  }
  state.pendingChoice = {
    id: `choice_${nextEventNumber(state)}`,
    type: "OPTION_CHOICE",
    playerId: unit.controllerId,
    prompt: `${ability.abilityName}: take one Spell to your hand; the rest go to your discard pile.`,
    options: spells.map((cardId) => ({ label: `Take ${cardLibrary[cardId]?.name ?? cardId}` })),
    context: "genie-take-spell",
    genieTakeSpell: { spellCardIds: spells, unitId: unit.id, mode, abilityId: ability.abilityId },
    returnPhase: "combat"
  };
  state.phase = "choice";
  state.priorityPlayerId = unit.controllerId;
  return true;
}

/** Tower Genies (Pack): the after-attack "Wish". Returns true when it paused combat. */
function openGenieSpellDraw(state: GameState, attacker: CombatUnitState, isRetaliation: boolean): boolean {
  if (isRetaliation || !state.combat) {
    return false;
  }
  const ability = getDeckDiscardTakeSpell(attacker, "on-attack");
  if (!ability) {
    return false;
  }
  return runGenieDeckDraw(state, attacker, ability, "on-attack");
}

/** Tower Genies (Few): the "Wish" used as an other action (instead of moving/attacking). */
function applyGenieDeckDraw(
  state: GameState,
  action: Extract<GameAction, { type: "USE_GENIE_DECK_DRAW" }>
): void {
  const combat = state.combat;
  const unit = combat?.units[action.unitId];
  const ability = unit ? getDeckDiscardTakeSpell(unit, "other-action") : null;
  if (
    !combat ||
    !unit ||
    unit.controllerId !== action.playerId ||
    combat.activeUnitId !== unit.id ||
    unit.activatedThisRound ||
    unit.movedThisActivation ||
    unit.attackedThisActivation ||
    !ability
  ) {
    throw new Error("That unit's Wish cannot be used now.");
  }

  // The Wish is the unit's whole activation.
  const paused = runGenieDeckDraw(state, unit, ability, "other-action");
  unit.activatedThisRound = true;
  if (paused) {
    // The spell-pick choice resolver advances to the next unit afterwards.
    return;
  }
  advanceActiveUnit(state);
  state.phase = "combat";
  state.priorityPlayerId = null;
}

/**
 * Resolves the Genies "Wish" spell-pick: the chosen Spell goes to hand, the
 * rest to the discard pile, then combat continues — the Few's activation ends,
 * the Pack's parked attack sequence resumes.
 */
function resolveGenieTakeSpell(
  state: GameState,
  action: Extract<GameAction, { type: "CHOOSE_OPTION" }>
): void {
  const choice = state.pendingChoice;
  if (
    !choice ||
    choice.type !== "OPTION_CHOICE" ||
    choice.context !== "genie-take-spell" ||
    choice.id !== action.choiceId ||
    choice.playerId !== action.playerId ||
    !choice.genieTakeSpell
  ) {
    throw new Error("There is no Wish choice to resolve.");
  }

  const pick = choice.genieTakeSpell;
  const player = state.players[action.playerId];
  const chosen = pick.spellCardIds[action.optionIndex];
  if (!player || !chosen) {
    throw new Error("Pick one of the dug Spells.");
  }

  player.hand.push(chosen);
  player.discard.push(...pick.spellCardIds.filter((_, index) => index !== action.optionIndex));
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: pick.unitId,
    abilityId: pick.abilityId,
    message: `${player.name} takes ${cardLibrary[chosen]?.name ?? chosen} to hand.`
  });

  state.pendingChoice = null;
  state.phase = "combat";
  state.priorityPlayerId = null;

  if (pick.mode === "other-action") {
    // The Few's whole activation was the Wish — hand off to the next unit.
    if (state.combat) {
      advanceActiveUnit(state);
    }
  } else {
    // The Pack's Wish rode its attack — resume the parked retaliation/sequence.
    resumeAttackSequence(state, cardLibrary);
    finishCombatIfNeeded(state);
  }
}

function summonDemons(state: GameState, action: Extract<GameAction, { type: "SUMMON_DEMONS" }>): void {
  const combat = state.combat;
  const unit = combat?.units[action.unitId];
  const player = state.players[action.playerId];
  const ability = unit
    ? getUnitAbilityDefinitions(unit).find((candidate) => candidate.effect?.type === "SUMMON_OR_REINFORCE_DEMONS")
    : undefined;

  if (
    !combat ||
    !unit ||
    !player ||
    unit.controllerId !== action.playerId ||
    combat.activeUnitId !== unit.id ||
    unit.activatedThisRound ||
    unit.movedThisActivation ||
    unit.attackedThisActivation ||
    unit.summonedThisCombat ||
    ability?.effect?.type !== "SUMMON_OR_REINFORCE_DEMONS" ||
    ability.implementationStatus !== "implemented" ||
    !combat.unitRemovedControllerIds?.includes(action.playerId)
  ) {
    throw new Error("Summon Demons cannot be used now.");
  }

  const demonDefId = ability.effect.demonUnitDefId;
  const ruleset = getRuleset(state);

  if (action.mode === "summon") {
    const position = action.position;
    if (
      position === undefined ||
      !isBattlefieldPosition(position) ||
      !getOrthogonalNeighbors(unit.position).includes(position) ||
      (combat.obstacles ?? []).includes(position) ||
      Object.values(combat.units).some((candidate) => isUnitAlive(candidate) && candidate.position === position)
    ) {
      throw new Error("Demons must be summoned onto an empty adjacent space.");
    }
    if (!getUnitSide(demonDefId, "few")) {
      throw new Error("Those Demons have no Few side to summon.");
    }

    const armyUnit = addArmyUnit(player, demonDefId, "few");
    const summoned = makeCombatUnitFromArmy(
      armyUnit,
      action.playerId,
      `unit_${action.playerId}_${armyUnit.id}`,
      position,
      ruleset
    );
    if (!summoned) {
      throw new Error("Those Demons cannot be summoned.");
    }
    // The summoned Demons join the round immediately — they may still act this
    // round when their initiative comes up.
    summoned.activatedThisRound = false;
    combat.units[summoned.id] = summoned;

    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: unit.id,
      abilityId: ability.id,
      targetUnitId: summoned.id,
      message: `${unit.cardName} summons ${summoned.cardName} at ${getBattlefieldLabel(position)}.`
    });
  } else {
    const targetUnit = action.targetUnitId ? combat.units[action.targetUnitId] : undefined;
    if (
      !targetUnit ||
      targetUnit.controllerId !== action.playerId ||
      !isUnitAlive(targetUnit) ||
      targetUnit.unitDefId !== demonDefId ||
      targetUnit.variant !== "few" ||
      !getUnitSide(demonDefId, "pack")
    ) {
      throw new Error("Only a friendly Few of Demons can be reinforced to a Pack.");
    }

    targetUnit.variant = "pack";
    applyUnitCurrentSide(targetUnit, ruleset);
    // Mirror onto the backing army card so the reinforcement survives the combat.
    const armyUnit = player.army.find((candidate) => candidate.id === targetUnit.armyUnitId);
    if (armyUnit) {
      armyUnit.side = "pack";
    }

    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: unit.id,
      abilityId: ability.id,
      targetUnitId: targetUnit.id,
      message: `${unit.cardName} reinforces ${targetUnit.cardName}.`
    });
  }

  // The Pit Lords used their action instead of moving or attacking.
  unit.summonedThisCombat = true;
  unit.activatedThisRound = true;
  advanceActiveUnit(state);
  state.phase = "combat";
  state.priorityPlayerId = null;
}

/**
 * Earthquake (siege only): Power 0 removes 1 Wall/Gate of the caster's
 * choice, Power 1 removes 2, Power 2 deals 1 damage to every unit adjacent
 * to a fortification and brings them all down at once.
 */
function resolveEarthquakeSpell(state: GameState, playerId: PlayerId, power: number): void {
  const combat = state.combat;
  const siege = combat?.siege;
  if (!combat || !siege) {
    return;
  }

  if (power >= 2) {
    const positions = intactFortificationPositions(siege);
    for (const unit of Object.values(combat.units)) {
      if (!isUnitAlive(unit) || unit.position < 0) {
        continue;
      }
      if (!positions.some((position) => isAdjacent(unit.position, position))) {
        continue;
      }
      const dealt = reducedSpellDamage(state, unit, 1);
      unit.damage += dealt;
      noteUnitDamagedForTokens(state, unit, dealt);
      appendEvent(state, {
        type: "DAMAGE_ASSIGNED",
        source: { type: "system" },
        target: { type: "unit", unitId: unit.id },
        amount: dealt,
        damageKind: "spell"
      });
      markUnitRemovedIfNeeded(state, unit);
    }

    for (const position of positions) {
      destroyFortification(state, null, siege.gatePosition === position ? "gate" : "wall", position);
    }
    finishCombatIfNeeded(state);
    return;
  }

  openSiegeDemolishChoice(state, playerId, power <= 0 ? 1 : 2);
}

/**
 * Siege fortification attacks: an adjacent ground/flying unit demolishes a
 * Wall or the Gate as its attack — automatically successful, no die, no
 * cards, no attack abilities. Cyclops' printed ability does the same at any
 * range; its pack/neutral versions may also bring down the Arrow Tower.
 */
function attackFortification(
  state: GameState,
  action: Extract<GameAction, { type: "ATTACK_FORTIFICATION" }>
): void {
  const combat = state.combat;
  const siege = combat?.siege;
  const unit = combat?.units[action.attackerId];
  if (!combat || !siege || !unit || unit.controllerId !== action.playerId) {
    throw new Error("There is no siege fortification to attack.");
  }

  if (combat.activeUnitId !== unit.id || unit.activatedThisRound || unit.attackedThisActivation) {
    throw new Error("Only the active unit may attack fortifications, before its attack.");
  }

  const demolish = getDemolishAbility(unit);

  if (action.target.kind === "arrow-tower") {
    if (!demolish?.canTargetArrowTower) {
      throw new Error("Only a unit with the demolish ability can level the Arrow Tower this way.");
    }
    if (!siege.arrowTowerUnitId) {
      throw new Error("The Arrow Tower is already gone.");
    }
    removeArrowTower(state, unit, `${unit.cardName} levels it`);
  } else {
    const intact =
      action.target.kind === "wall"
        ? siege.walls.includes(action.target.position)
        : siege.gatePosition === action.target.position;
    if (!intact) {
      throw new Error("That fortification is already destroyed.");
    }

    if (!demolish) {
      // "…destroyed by any adjacent ground or flying unit's attack, even by
      // your own defending units."
      if (unit.type === "ranged") {
        throw new Error("Ranged units cannot tear down walls (the Cyclops' ability is the exception).");
      }
      if (!isAdjacent(unit.position, action.target.position)) {
        throw new Error("The unit must be adjacent to the Wall or Gate.");
      }
    }

    destroyFortification(state, unit, action.target.kind, action.target.position);
  }

  // The demolition replaces the unit's attack for this activation.
  unit.attackedThisActivation = true;
  unit.attacksThisActivation = (unit.attacksThisActivation ?? 0) + 1;
  finishCombatIfNeeded(state);
  if (!state.combat?.outcome) {
    concludeAttackerActivation(state, unit);
  }
}

function rerollPendingChoice(
  state: GameState,
  action: Extract<GameAction, { type: "REROLL_PENDING_CHOICE" }>
): void {
  const choice = state.pendingChoice;
  const combat = state.combat;
  if (
    !choice ||
    choice.type !== "ATTACK_DIE_REROLL" ||
    !combat ||
    choice.id !== action.choiceId ||
    choice.playerId !== action.playerId
  ) {
    throw new Error("That pending choice cannot be rerolled.");
  }

  const currentRoll = choice.candidates.at(-1)?.roll ?? 0;
  const source = choice.rerollSources.find((candidate) => rerollSourceAvailableFor(candidate, currentRoll));
  if (!source) {
    throw new Error("No rerolls remain for that choice.");
  }

  const candidate = rollAttackCandidate(combat, choice.rollMode);
  choice.candidates.push(candidate);
  // Face-gated sources (Crusaders' 'every "0"') never deplete; everything
  // else spends one use.
  if (source.onlyOnRoll === undefined) {
    source.remaining -= 1;
  }
  source.used += 1;
  choice.remainingRerolls = countAvailableRerolls(choice.rerollSources, candidate.roll);

  // The morale token is discarded the moment its reroll is taken.
  if (source.morale && source.used === 1) {
    const player = state.players[action.playerId];
    if (player && player.morale > 0) {
      player.morale -= 1;
      appendEvent(state, { type: "MORALE_SPENT", playerId: action.playerId, benefit: "reroll" });
      appendEvent(state, {
        type: "MORALE_CHANGED",
        playerId: action.playerId,
        amount: -1,
        total: player.morale
      });
    }
  }

  appendEvent(state, {
    type: "ATTACK_REROLLED",
    choiceId: choice.id,
    playerId: action.playerId,
    rolls: candidate.rolls,
    roll: candidate.roll,
    remainingRerolls: choice.remainingRerolls,
    sourceName: source.name
  });

  state.phase = "choice";
  state.priorityPlayerId = action.playerId;
}

function choosePendingRoll(
  state: GameState,
  action: Extract<GameAction, { type: "CHOOSE_PENDING_ROLL" }>,
  cards: CardLibrary
): void {
  const choice = state.pendingChoice;
  if (
    !choice ||
    choice.type !== "ATTACK_DIE_REROLL" ||
    choice.id !== action.choiceId ||
    choice.playerId !== action.playerId
  ) {
    throw new Error("That pending choice cannot be resolved.");
  }

  const candidate = choice.candidates[action.candidateIndex];
  if (!candidate) {
    throw new Error("That roll choice is not available.");
  }

  // Rulebook rerolls: "the new result replaces the old one" — once rerolled,
  // earlier rolls are gone for good.
  if (action.candidateIndex !== choice.candidates.length - 1) {
    throw new Error("A reroll replaces the previous result — only the latest roll counts.");
  }

  const stackItem = state.stack.find((item) => item.id === choice.stackItemId);
  if (!stackItem) {
    throw new Error("The pending attack is no longer available.");
  }

  const details = getAttackStackDetails(state, stackItem);
  if (!details) {
    throw new Error("The pending attack cannot be resolved.");
  }

  closePendingChoice(state, choice, action.candidateIndex);
  resolveAttackOrOfferDieCancel(state, stackItem, details, candidate, cards);
}

/**
 * Resolves an ABILITY_TARGET_CHOICE: Magog splash / Cerberi second head
 * (flat damage), the Liches' Death Cloud second attack, or a neutral-AI
 * target tie the player breaks.
 */
function chooseAbilityTarget(
  state: GameState,
  action: Extract<GameAction, { type: "CHOOSE_ABILITY_TARGET" }>,
  cards: CardLibrary
): void {
  const choice = state.pendingChoice;
  const combat = state.combat;
  if (!choice || choice.type !== "ABILITY_TARGET_CHOICE" || choice.id !== action.choiceId) {
    throw new Error("That ability target choice is not available.");
  }

  if (choice.playerId !== action.playerId) {
    throw new Error("Another player resolves this ability target.");
  }

  if (!combat) {
    throw new Error("Combat is not active.");
  }

  const isSkip = choice.optional && action.targetUnitId === "skip";
  const selectedIndex = isSkip ? -1 : choice.candidateUnitIds.indexOf(action.targetUnitId);
  if (selectedIndex === -1 && !isSkip) {
    throw new Error("That unit is not a legal target for the ability.");
  }

  state.pendingChoice = null;
  state.phase = "combat";
  state.priorityPlayerId = null;

  appendEvent(state, {
    type: "PENDING_CHOICE_RESOLVED",
    choiceId: choice.id,
    playerId: action.playerId,
    selectedIndex
  });

  if (choice.kind === "war-machine") {
    resolveWarMachineTarget(state, action.playerId, action.targetUnitId, choice.amount ?? 1);
    finishCombatIfNeeded(state);
    return;
  }

  // Fireball's second space: deal the spell damage, or skip (empty space).
  if (choice.kind === "spell-splash") {
    if (!isSkip) {
      const target = combat.units[action.targetUnitId];
      if (target && isUnitAlive(target)) {
        const dealt = reducedSpellDamage(state, target, choice.amount ?? 1);
        target.damage += dealt;
        noteUnitDamagedForTokens(state, target, dealt);
        appendEvent(state, {
          type: "DAMAGE_ASSIGNED",
          source: { type: "system" },
          target: { type: "unit", unitId: target.id },
          amount: dealt,
          damageKind: "spell"
        });
        markUnitRemovedIfNeeded(state, target);
      }
    }
    finishCombatIfNeeded(state);
    return;
  }

  // Frost Ring / Meteor Shower VI: the picked unit takes the blast's damage,
  // then the choice re-opens for the next pick (using the same card, amount and
  // the remaining candidates) until every pick is spent.
  if (choice.kind === "area-pick") {
    const blastCard = cards[choice.sourceCardId ?? choice.abilityId ?? ""];
    const amount = choice.amount ?? 1;
    const picked = isSkip ? undefined : combat.units[action.targetUnitId];
    if (picked && isUnitAlive(picked)) {
      dealAreaCardDamage(state, choice.playerId, blastCard, picked, amount);
    }
    if (finishCombatIfNeeded(state)) {
      return;
    }
    const rest = choice.candidateUnitIds.filter(
      (id) => id !== action.targetUnitId && isUnitAlive(combat.units[id])
    );
    applyAdjacentPicks(state, choice.playerId, blastCard, rest, (choice.picksRemaining ?? 1) - 1, amount);
    finishCombatIfNeeded(state);
    return;
  }

  // Magic Mirror: the new target is chosen.
  if (choice.kind === "spell-redirect") {
    const top = state.stack.at(-1);
    const chosen = combat.units[action.targetUnitId];

    // (a) Reflecting an instant combat debuff off your attacked unit: the malus
    // was already lifted from your unit when the card was played; now it lands
    // on the chosen unit, then the attack's window resumes. It stays an INSTANT —
    // a one-shot stat delta the attack maths read for this attack and (carried
    // through attackSequence) its retaliation, then it vanishes with the stack.
    // It is NOT an ongoing effect or a token, so nothing can Dispel or ignore it;
    // only spell-immunity stops it, already enforced by the redirect's target
    // filter (you cannot bounce it onto a spell-immune unit).
    if (choice.redirectInstant && top && chosen && isUnitAlive(chosen)) {
      const { stat, amount } = choice.redirectInstant;
      (top.modifiers.redirectedInstants ??= []).push({ unitId: chosen.id, stat, amount });
    }
    if (choice.redirectInstant) {
      appendEvent(state, {
        type: "SPELL_REDIRECTED",
        playerId: action.playerId,
        spellCardId: choice.redirectInstant.sourceCardId,
        byCardId: choice.abilityId ?? "",
        fromTarget: { type: "unit", unitId: choice.anchorUnitId ?? action.targetUnitId },
        toTarget: { type: "unit", unitId: action.targetUnitId }
      });
      resumeAttackWindowAfterRedirect(state, top, cards);
      return;
    }

    // (b) Re-pointing a pending cast (which waited on the stack while this choice
    // was open) and resolving it against the chosen target. A space-centred blast
    // (Inferno) recenters on the chosen unit's space; everything else re-points
    // straight at the unit. A Fireball-style splash recomputes around the new
    // primary on resolution.
    if (top?.action.type === "CAST_SPELL") {
      const fromTarget = top.action.target;
      top.action.target =
        fromTarget.type === "space" && chosen
          ? { type: "space", position: chosen.position }
          : { type: "unit", unitId: action.targetUnitId };
      appendEvent(state, {
        type: "SPELL_REDIRECTED",
        playerId: action.playerId,
        spellCardId: top.action.cardId,
        byCardId: choice.abilityId ?? "",
        fromTarget,
        toTarget: top.action.target
      });
      resolveTopStack(state, cards);
    }
    return;
  }

  // Solmyr's Chain Lightning: the chosen closest unit takes the current bolt,
  // then the chain continues with the remaining bolts (or finishes).
  if (choice.kind === "chain-lightning") {
    const chainCard = cards[choice.abilityId ?? ""];
    const remaining = choice.chainRemainingDamages ?? [];
    dealChainLightningDamage(state, action.playerId, chainCard, action.targetUnitId, remaining[0] ?? 0);
    if (finishCombatIfNeeded(state)) {
      return;
    }
    const reachable = (choice.chainReachableUnitIds ?? []).filter((id) => id !== action.targetUnitId);
    if (choice.anchorUnitId) {
      advanceChainLightning(state, action.playerId, chainCard, choice.anchorUnitId, reachable, remaining.slice(1));
    }
    return;
  }

  // Sacrifice: move the heal target's damage onto the chosen sacrifice unit —
  // up to the sacrifice's remaining HP ("as much as is needed for it to
  // perish"). The heal target loses that much damage; the sacrifice takes it
  // and perishes (a Pack flips to Few) when it reaches its remaining HP.
  if (choice.kind === "sacrifice-transfer") {
    const healTarget = choice.sourceUnitId ? combat.units[choice.sourceUnitId] : undefined;
    const sacrifice = combat.units[action.targetUnitId];
    if (healTarget && sacrifice && isUnitAlive(healTarget) && isUnitAlive(sacrifice)) {
      const source = { type: "card" as const, cardId: choice.abilityId ?? "", controllerId: action.playerId };
      const transfer = Math.min(healTarget.damage, sacrifice.maxHealth - sacrifice.damage);
      if (transfer > 0) {
        healUnitDamage(state, source, { type: "unit", unitId: healTarget.id }, transfer);
        sacrifice.damage += transfer;
        noteUnitDamagedForTokens(state, sacrifice, transfer);
        appendEvent(state, {
          type: "DAMAGE_ASSIGNED",
          source,
          target: { type: "unit", unitId: sacrifice.id },
          amount: transfer,
          damageKind: "effect"
        });
        markUnitRemovedIfNeeded(state, sacrifice);
      }
    }
    finishCombatIfNeeded(state);
    return;
  }

  const source = choice.sourceUnitId ? combat.units[choice.sourceUnitId] : undefined;
  if (!source) {
    return;
  }

  // Enchanters' "[activation]": heal the chosen friendly unit, or (skip) take
  // the +1 Attack. The unit stays active and acts normally afterwards.
  if (choice.kind === "enchanter-activation") {
    const ability = getEnchanterActivationAbility(source);
    if (ability) {
      const target = isSkip ? undefined : combat.units[action.targetUnitId];
      if (target && isUnitAlive(target)) {
        applyEnchanterHeal(state, source, target, ability);
      } else {
        applyEnchanterBuffSelf(state, source, ability);
      }
    }
    source.activationAbilityDone = true;
    return;
  }

  // Faerie Dragons' "[activation]": deal the flat Ice Bolt damage to the chosen
  // unit, then the unit acts normally (or the combat ends on a lethal hit).
  if (choice.kind === "faerie-damage") {
    const ability = getActivationDamageSpellAbility(source);
    const target = combat.units[action.targetUnitId];
    if (ability && target && isUnitAlive(target)) {
      applyActivationDamageSpell(state, source, target, ability);
    }
    source.activationAbilityDone = true;
    return;
  }

  if (choice.kind === "flat-damage") {
    applyFlatAbilityDamage(
      state,
      source,
      action.targetUnitId,
      choice.abilityId ?? "",
      choice.abilityName,
      choice.amount ?? 1
    );
    if (finishCombatIfNeeded(state)) {
      return;
    }
    // Core units carry at most one flat-damage follow-up, so the sequence
    // continues straight to the parked retaliation.
    resumeAttackSequence(state, cards);
    return;
  }

  if (choice.kind === "second-attack") {
    declareAbilityAttack(
      state,
      source,
      action.targetUnitId,
      {
        abilityId: choice.abilityId ?? "",
        abilityName: choice.abilityName,
        baseAttack: choice.baseAttack ?? 2
      },
      cards
    );
    return;
  }

  // Neutral target tie: the chosen unit becomes the neutral's target.
  executeNeutralActivation(state, source, cards, action.targetUnitId);
}

/**
 * Auto-resolves ability target choices owned by the neutral seat (neutral
 * Liches, Magogs, Cerberi): player units are preferred by the AI target
 * priority; only when none qualifies does the mandatory hit fall on a
 * friendly neutral (or the Liches themselves).
 */
/**
 * A neutral attacker (Minotaurs, Champions) auto-resolves its own attack-die
 * reroll: it rerolls every "-1" its face-gated ability allows — never spending
 * a depleting source, which neutrals never have — then keeps the final roll and
 * resumes the attack. The neutral player makes no choices, so the adventure
 * pump drives this the moment such a choice opens.
 */
function autoResolveNeutralReroll(state: GameState, cards: CardLibrary): void {
  const choice = state.pendingChoice;
  const combat = state.combat;
  if (!choice || choice.type !== "ATTACK_DIE_REROLL" || !combat) {
    return;
  }

  let safety = 12;
  while (safety > 0) {
    safety -= 1;
    const currentRoll = choice.candidates.at(-1)?.roll ?? 0;
    const source = choice.rerollSources.find((candidate) => rerollSourceAvailableFor(candidate, currentRoll));
    // Only face-gated ability rerolls (the Minotaur/Champion "-1") ever apply to
    // a neutral; stop once the current face can no longer be rerolled.
    if (!source || source.onlyOnRoll === undefined) {
      break;
    }
    const candidate = rollAttackCandidate(combat, choice.rollMode);
    choice.candidates.push(candidate);
    choice.remainingRerolls = countAvailableRerolls(choice.rerollSources, candidate.roll);
    appendEvent(state, {
      type: "ATTACK_REROLLED",
      choiceId: choice.id,
      playerId: choice.playerId,
      rolls: candidate.rolls,
      roll: candidate.roll,
      remainingRerolls: choice.remainingRerolls,
      sourceName: source.name
    });
  }

  const stackItem = state.stack.find((item) => item.id === choice.stackItemId);
  const details = stackItem ? getAttackStackDetails(state, stackItem) : null;
  const candidate = choice.candidates.at(-1);
  if (!stackItem || !details || !candidate) {
    // The pending attack vanished (combat ended mid-pause): drop the choice.
    state.pendingChoice = null;
    state.phase = "combat";
    state.priorityPlayerId = null;
    return;
  }
  closePendingChoice(state, choice, choice.candidates.length - 1);
  resolveAttackOrOfferDieCancel(state, stackItem, details, candidate, cards);
}

function autoResolveNeutralAbilityChoice(state: GameState, cards: CardLibrary): boolean {
  const choice = state.pendingChoice;
  const combat = state.combat;
  if (
    !choice ||
    choice.type !== "ABILITY_TARGET_CHOICE" ||
    choice.playerId !== NEUTRAL_PLAYER_ID ||
    !combat ||
    !choice.sourceUnitId
  ) {
    return false;
  }

  const source = combat.units[choice.sourceUnitId];
  const candidates = choice.candidateUnitIds
    .map((unitId) => combat.units[unitId])
    .filter((unit): unit is CombatUnitState => Boolean(unit) && isUnitAlive(unit));
  if (!source || candidates.length === 0) {
    state.pendingChoice = null;
    state.phase = "combat";
    return true;
  }

  const enemies = candidates.filter((unit) => unit.controllerId !== source.controllerId);
  const pool = enemies.length > 0 ? enemies : candidates;
  const sorted = sortNeutralTargetCandidates(source, pool);
  const target =
    enemies.length > 0
      ? sorted[0]
      : // Forced friendly hit: spare the strongest — hit the lowest tier,
        // farthest, lowest position.
        [...sorted].reverse()[0];

  chooseAbilityTarget(
    state,
    {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: NEUTRAL_PLAYER_ID,
      choiceId: choice.id,
      targetUnitId: target.id
    },
    cards
  );
  return true;
}

function declareAttack(
  state: GameState,
  action: Extract<GameAction, { type: "ATTACK_UNIT" | "MOVE_AND_ATTACK_UNIT" }>,
  cards: CardLibrary,
  isRetaliation = false
): void {
  const combat = state.combat;
  if (!combat) {
    throw new Error("Combat is not active.");
  }

  const abilityAttack = action.type === "ATTACK_UNIT" ? action.abilityAttack : undefined;
  const attacker = combat.units[action.attackerId];
  const defender = combat.units[action.defenderId];
  if (!attacker || !defender) {
    throw new Error("That unit cannot attack the selected target.");
  }

  // Printed-ability follow-ups (Death Cloud) may — and sometimes must — hit
  // friendly units or the attacker itself, so the regular target rules do
  // not apply to them.
  if (abilityAttack) {
    if (!isUnitAlive(attacker) || !isUnitAlive(defender)) {
      throw new Error("That unit cannot attack the selected target.");
    }
  } else if (!canUnitAttack(combat, attacker, defender, state.activeEffects)) {
    throw new Error("That unit cannot attack the selected target.");
  }

  const stackItem = makeStackItem(state, action);
  state.stack.push(stackItem);

  const attackKind = getAttackKind(attacker, defender);
  const rollMode = getAttackRollMode(attacker, defender, state);
  const attackDeclared = appendEvent(state, {
    type: "UNIT_ATTACK_DECLARED",
    playerId: action.playerId,
    attackerId: attacker.id,
    defenderId: defender.id,
    isRetaliation,
    attackKind,
    rollMode,
    ...(abilityAttack ? { abilityAttack } : {})
  });
  stackItem.triggerEventIds.push(attackDeclared.id);

  openDeclaredAttackWindow(state, stackItem, attackDeclared, cards);
}

function attackUnit(
  state: GameState,
  action: Extract<GameAction, { type: "ATTACK_UNIT" }>,
  cards: CardLibrary
): void {
  declareAttack(state, action, cards);
}

function moveAndAttackUnit(
  state: GameState,
  action: Extract<GameAction, { type: "MOVE_AND_ATTACK_UNIT" }>,
  cards: CardLibrary
): void {
  const combat = state.combat;
  const attacker = combat?.units[action.attackerId];
  const defender = combat?.units[action.defenderId];
  if (
    !combat ||
    !attacker ||
    !defender ||
    attacker.controllerId !== action.playerId ||
    !canUnitMoveAndAttack(combat, attacker, action.destination, defender, state)
  ) {
    throw new Error("That unit cannot move and attack the selected target.");
  }

  const from = attacker.position;
  const destination = action.destination;
  attacker.movedThisActivation = true;

  // The approach is walked through any battlefield tokens, just like a plain
  // move: a Fire Wall / Land Mine bites the attacker on the way in, and a
  // Quicksand can swallow it short of the target (no token on the board → the
  // direct relocation below is unchanged).
  let finalPosition = destination;
  let haltedByQuicksand = false;
  if ((combat.battlefieldTokens ?? []).length > 0) {
    const enteredSpaces =
      attacker.type === "flying"
        ? [destination]
        : (planMovePath(
            from,
            destination,
            getUnitMoveRange(attacker),
            getBlockedSpaces(combat, attacker),
            getKnownHazardSpaces(combat, attacker)
          ) ?? [destination]);
    const walked = walkMoveThroughTokens(state, attacker, enteredSpaces);
    finalPosition = walked.finalPosition;
    haltedByQuicksand = walked.haltedByQuicksand;
  }

  attacker.position = finalPosition;

  appendEvent(state, {
    type: "UNIT_MOVED",
    playerId: action.playerId,
    unitId: attacker.id,
    from,
    to: finalPosition
  });

  // A Fire Wall / Land Mine that struck the attacker down, or a Quicksand that
  // swallowed it before it reached the target, ends the activation with no
  // attack — the unit never arrives adjacent to its quarry.
  if (!isUnitAlive(attacker) || haltedByQuicksand || finalPosition !== destination) {
    if (isUnitAlive(attacker)) {
      attacker.activatedThisRound = true;
    }
    if (combat.activeUnitId === attacker.id) {
      appendExpiredEffectEvents(state, expireEffectsForActivationEnd(state, attacker.id), "activation-ended");
      advanceActiveUnit(state);
    }
    state.phase = "combat";
    state.priorityPlayerId = null;
    finishCombatIfNeeded(state);
    return;
  }

  declareAttack(state, action, cards);
}

/** The spell a battlefield token's damage is attributed to (for damage events / FX). */
const BATTLEFIELD_TOKEN_CARD_ID: Record<BattlefieldTokenKind, CardId> = {
  force_field: "spell.force_field",
  fire_wall: "spell.fire_wall",
  quicksand: "spell.quicksand",
  land_mine: "spell.land_mine"
};

/** Battlefield tokens occupying a given board space. */
function tokensAtPosition(combat: CombatState, position: number): BattlefieldTokenState[] {
  return (combat.battlefieldTokens ?? []).filter((token) => token.position === position);
}

/**
 * Spaces the moving unit's side can SEE are dangerous: every face-up Fire Wall,
 * plus the mover's OWN armed traps (a player "may look at their Tokens at any
 * time"). A hazard-aware path lets a unit dodge these when an equally short
 * route exists; the opponent's blind traps are unknown, so they are not avoided.
 */
function getKnownHazardSpaces(combat: CombatState, unit: CombatUnitState): Set<number> {
  const hazards = new Set<number>();
  for (const token of combat.battlefieldTokens ?? []) {
    if (token.kind === "fire_wall") {
      hazards.add(token.position);
    } else if (
      (token.kind === "quicksand" || token.kind === "land_mine") &&
      token.armed === true &&
      token.controllerId === unit.controllerId
    ) {
      hazards.add(token.position);
    }
  }
  return hazards;
}

/** Reveals a face-down trap (Quicksand / Land Mine) to everyone the first time a unit enters it. */
function revealBattlefieldToken(state: GameState, token: BattlefieldTokenState, unit: CombatUnitState): void {
  if (token.revealed) {
    return;
  }
  token.revealed = true;
  appendEvent(state, {
    type: "BATTLEFIELD_TOKEN_REVEALED",
    tokenId: token.id,
    kind: token.kind,
    position: token.position,
    armed: token.armed === true,
    unitId: unit.id
  });
}

/** Deals a Fire Wall / Land Mine token's flat damage to a unit moving over it. */
function dealBattlefieldTokenDamage(
  state: GameState,
  token: BattlefieldTokenState,
  unit: CombatUnitState,
  amount: number
): void {
  if (amount <= 0) {
    return;
  }
  appendEvent(state, {
    type: "BATTLEFIELD_TOKEN_TRIGGERED",
    tokenId: token.id,
    kind: token.kind,
    position: token.position,
    unitId: unit.id,
    outcome: "damage",
    amount
  });
  unit.damage += amount;
  noteUnitDamagedForTokens(state, unit, amount);
  appendEvent(state, {
    type: "DAMAGE_ASSIGNED",
    source: { type: "card", cardId: BATTLEFIELD_TOKEN_CARD_ID[token.kind], controllerId: token.controllerId },
    target: { type: "unit", unitId: unit.id },
    amount,
    // Flat board-effect damage: the rulebook applies no Spell-damage reduction
    // or immunity to a token strike, so it is "effect", never "spell", damage.
    damageKind: "effect"
  });
  markUnitRemovedIfNeeded(state, unit);
}

/**
 * Walks a unit's move through the spaces it ENTERS (a flyer's caller passes only
 * its landing space, since flyers never enter the spaces they pass over),
 * springing each battlefield token. Returns where the unit comes to rest and
 * whether a Quicksand halted it (which also ends its activation). Faithful to
 * the rulebook: an entered face-down trap is revealed; an armed Land Mine deals
 * its damage and the unit moves on; an armed Quicksand ends movement at once; a
 * Fire Wall burns any unit stopping on it and any ground/ranged unit passing
 * through. Stops early the moment a token kills the mover.
 */
function walkMoveThroughTokens(
  state: GameState,
  unit: CombatUnitState,
  enteredSpaces: number[]
): { finalPosition: number; haltedByQuicksand: boolean } {
  const combat = state.combat;
  if (!combat || enteredSpaces.length === 0) {
    return { finalPosition: unit.position, haltedByQuicksand: false };
  }

  let finalPosition = unit.position;
  for (let index = 0; index < enteredSpaces.length; index += 1) {
    const position = enteredSpaces[index];
    finalPosition = position;
    const isLastStep = index === enteredSpaces.length - 1;
    const tokens = tokensAtPosition(combat, position);

    // Fire Wall (Effect Obstacle): stopping on it burns any unit; passing
    // through burns only a ground or ranged unit (a flyer over it is unharmed,
    // and a flyer is never mid-path here anyway).
    for (const token of tokens) {
      if (token.kind !== "fire_wall") {
        continue;
      }
      const passingThrough = !isLastStep;
      if (!passingThrough || unit.type !== "flying") {
        dealBattlefieldTokenDamage(state, token, unit, token.damage ?? 0);
        if (!isUnitAlive(unit)) {
          return { finalPosition, haltedByQuicksand: false };
        }
      }
    }

    // Land Mine: reveal on entry; an armed one deals its damage, then the unit
    // continues its move/activation if it survives.
    for (const token of tokens) {
      if (token.kind !== "land_mine") {
        continue;
      }
      revealBattlefieldToken(state, token, unit);
      if (token.armed) {
        dealBattlefieldTokenDamage(state, token, unit, token.damage ?? 0);
        if (!isUnitAlive(unit)) {
          return { finalPosition, haltedByQuicksand: false };
        }
      }
    }

    // Quicksand: reveal on entry; an armed one ends movement AND activation here.
    let armedQuicksand: BattlefieldTokenState | undefined;
    for (const token of tokens) {
      if (token.kind !== "quicksand") {
        continue;
      }
      revealBattlefieldToken(state, token, unit);
      if (token.armed) {
        armedQuicksand = armedQuicksand ?? token;
      }
    }
    if (armedQuicksand) {
      appendEvent(state, {
        type: "BATTLEFIELD_TOKEN_TRIGGERED",
        tokenId: armedQuicksand.id,
        kind: "quicksand",
        position,
        unitId: unit.id,
        outcome: "stop"
      });
      return { finalPosition: position, haltedByQuicksand: true };
    }
  }

  return { finalPosition, haltedByQuicksand: false };
}

function moveUnit(state: GameState, action: Extract<GameAction, { type: "MOVE_UNIT" }>): void {
  const combat = state.combat;
  const unit = combat?.units[action.unitId];
  if (!combat || !unit || unit.controllerId !== action.playerId || !canUnitMoveTo(combat, unit, action.destination, state)) {
    throw new Error("That unit cannot move to the selected space.");
  }

  const from = unit.position;
  const destination = action.destination;
  unit.movedThisActivation = true;

  let finalPosition = destination;
  let haltedByQuicksand = false;

  // With battlefield tokens in play, the move is walked space-by-space so Fire
  // Walls, Land Mines and Quicksand can bite along the way. With none on the
  // board this is skipped entirely, so ordinary movement is unchanged.
  if ((combat.battlefieldTokens ?? []).length > 0) {
    const enteredSpaces =
      unit.type === "flying"
        ? [destination]
        : (planMovePath(
            from,
            destination,
            getUnitMoveRange(unit),
            getBlockedSpaces(combat, unit),
            getKnownHazardSpaces(combat, unit)
          ) ?? [destination]);
    const walked = walkMoveThroughTokens(state, unit, enteredSpaces);
    finalPosition = walked.finalPosition;
    haltedByQuicksand = walked.haltedByQuicksand;
  }

  unit.position = finalPosition;

  appendEvent(state, {
    type: "UNIT_MOVED",
    playerId: action.playerId,
    unitId: unit.id,
    from,
    to: finalPosition
  });

  // A Fire Wall or Land Mine that struck the mover down ends its activation.
  if (!isUnitAlive(unit)) {
    if (combat.activeUnitId === unit.id) {
      appendExpiredEffectEvents(state, expireEffectsForActivationEnd(state, unit.id), "activation-ended");
      advanceActiveUnit(state);
    }
    state.phase = "combat";
    state.priorityPlayerId = null;
    finishCombatIfNeeded(state);
    return;
  }

  // Quicksand ends both movement AND activation, whatever the unit's type.
  // Ranged units likewise finish their activation with any move — they can
  // never attack after moving. Ground and flying units stay active to attack
  // an adjacent enemy or hold.
  if (haltedByQuicksand || unit.type === "ranged") {
    unit.activatedThisRound = true;
    appendExpiredEffectEvents(state, expireEffectsForActivationEnd(state, unit.id), "activation-ended");
    advanceActiveUnit(state);
  }

  state.phase = "combat";
  state.priorityPlayerId = null;
}

function defendUnit(state: GameState, action: Extract<GameAction, { type: "DEFEND_UNIT" }>): void {
  const combat = state.combat;
  const unit = combat?.units[action.unitId];
  if (!combat || !unit || unit.controllerId !== action.playerId) {
    throw new Error("That unit cannot defend now.");
  }

  unit.defenseToken = true;
  unit.activatedThisRound = true;
  appendExpiredEffectEvents(state, expireEffectsForActivationEnd(state, unit.id), "activation-ended");

  appendEvent(state, {
    type: "UNIT_DEFENDED",
    playerId: action.playerId,
    unitId: unit.id
  });

  advanceActiveUnit(state);
}

function endActivation(state: GameState, action: Extract<GameAction, { type: "END_ACTIVATION" }>): void {
  const combat = state.combat;
  const unit = combat?.units[action.unitId];
  if (!combat || !unit || unit.controllerId !== action.playerId || combat.activeUnitId !== unit.id) {
    throw new Error("That unit cannot end its activation now.");
  }

  unit.activatedThisRound = true;
  appendExpiredEffectEvents(state, expireEffectsForActivationEnd(state, unit.id), "activation-ended");

  appendEvent(state, {
    type: "UNIT_ACTIVATION_ENDED",
    playerId: action.playerId,
    unitId: unit.id
  });

  advanceActiveUnit(state);
  state.phase = "combat";
  state.priorityPlayerId = null;
}

function advanceCombatRound(state: GameState, byPlayerId: PlayerId): void {
  if (!state.combat) {
    throw new Error("Combat is not active.");
  }

  const finishedRound = state.combat.round;
  state.combat.round += 1;
  resetCombatRound(state.combat);
  appendExpiredEffectEvents(state, expireEffectsForCombatRoundEnd(state, finishedRound), "combat-round-ended");
  expireTokensAtRoundEnd(state, state.combat, finishedRound);
  expireBattlefieldTokensAtRoundEnd(state, finishedRound);
  for (const player of Object.values(state.players)) {
    player.combatStats.spellsCastThisRound = 0;
    player.combatStats.spellLimitBonusThisRound = 0;
    player.combatStats.expertUsesSpentThisRound = 0;
    player.combatStats.anySpellCastThisRound = false;
  }

  appendEvent(state, {
    type: "COMBAT_ROUND_ENDED",
    round: finishedRound,
    nextRound: state.combat.round
  });

  const nextUnit = getNextUnitToActivate(state.combat, state.activeEffects);
  appendEvent(state, {
    type: "COMBAT_ROUND_STARTED",
    round: state.combat.round,
    activeUnitId: nextUnit?.id ?? null
  });

  setActiveUnit(state, nextUnit?.id ?? null);
  state.activePlayerId = byPlayerId;
  if (nextUnit) {
    state.activePlayerId = nextUnit.controllerId;
  }

  // Permanents played before this combat (or while it ran) keep their
  // presence up, then war machines fire before activations.
  applyPermanentCombatEffectsForPlayer(state, state.combat.attackerPlayerId);
  applyPermanentCombatEffectsForPlayer(state, state.combat.defenderPlayerId);
  startWarMachineRound(state);
  finishCombatIfNeeded(state);
}

function endCombatRound(state: GameState, action: Extract<GameAction, { type: "END_COMBAT_ROUND" }>): void {
  advanceCombatRound(state, action.playerId);
}

function spendResources(resources: Record<ResourceKind, number>, cost: ResourceCost): void {
  for (const [resource, amount] of Object.entries(cost) as [ResourceKind, number][]) {
    resources[resource] -= amount;
  }
}

function applyBuildingEffect(
  state: GameState,
  action: Extract<GameAction, { type: "BUILD_STRUCTURE" }>,
  buildings: BuildingLibrary
): void {
  const building = buildings[action.buildingId];
  const effect = building?.effect;
  const player = state.players[action.playerId];
  if (!building || !effect || !player) {
    return;
  }

  if (effect.type === "GAIN_RESOURCE") {
    player.resources[effect.resource] += effect.amount;
  }

  if (effect.type === "ADD_EXPERT_USE_LIMIT") {
    player.limits.expertUses += effect.amount;
  }

  appendEvent(state, {
    type: "BUILDING_EFFECT_APPLIED",
    playerId: action.playerId,
    townId: action.townId,
    buildingId: action.buildingId,
    effect
  });
}

function buildStructure(
  state: GameState,
  action: Extract<GameAction, { type: "BUILD_STRUCTURE" }>,
  buildings: BuildingLibrary
): void {
  if (!canPlayerBuildStructure(state, action.playerId, action.townId, action.buildingId, buildings)) {
    throw new Error("That structure cannot be built right now.");
  }

  const player = state.players[action.playerId];
  const town = state.towns[action.townId];
  const building = buildings[action.buildingId];
  if (!player || !town || !building) {
    throw new Error("That structure cannot be built right now.");
  }

  spendResources(player.resources, building.cost);
  town.buildings.push(action.buildingId);

  appendEvent(state, {
    type: "STRUCTURE_BUILT",
    playerId: action.playerId,
    townId: action.townId,
    buildingId: action.buildingId,
    cost: building.cost
  });

  applyBuildingEffect(state, action, buildings);
}

function completeSimultaneousTurn(
  state: GameState,
  action: Extract<GameAction, { type: "COMPLETE_SIMULTANEOUS_TURN" }>
): void {
  if (state.turn.mode !== "simultaneous" || state.round > state.turn.simultaneousRoundLimit) {
    throw new Error("Simultaneous turns are not active.");
  }

  if (!state.turn.completedPlayerIds.includes(action.playerId)) {
    state.turn.completedPlayerIds.push(action.playerId);
  }

  appendEvent(state, {
    type: "SIMULTANEOUS_TURN_COMPLETED",
    playerId: action.playerId,
    completedPlayerIds: [...state.turn.completedPlayerIds]
  });

  const allPlayersComplete = state.turnOrder.every((playerId) => state.turn.completedPlayerIds.includes(playerId));
  if (!allPlayersComplete) {
    return;
  }

  state.turn.completedPlayerIds = [];

  if (state.round >= state.turn.simultaneousRoundLimit) {
    state.turn.mode = "ordered";
    state.phase = "player-turn";
    state.activePlayerId = state.turnOrder[0];
    state.turn.observingPlayerId = state.activePlayerId;
    appendEvent(state, {
      type: "ORDERED_TURNS_STARTED",
      activePlayerId: state.activePlayerId
    });
    return;
  }

  state.round += 1;
  state.phase = "simultaneous-turns";
}

/** Hand-card kinds the sandbox card picker may drop into a player's hand. */
const SANDBOX_ADDABLE_KINDS = new Set<CardDefinition["kind"]>([
  "spell",
  "ability",
  "artifact",
  "statistic",
  "hero-specialty"
]);

/**
 * Combat test mode only: add any playable card straight into a player's hand so
 * a tester can exercise its mechanic. Handler-validated (it never appears in
 * getLegalActions), so it guards itself: sandbox combat only, a real player, and
 * a known card of a hand-playable kind.
 */
function sandboxAddCard(
  state: GameState,
  action: Extract<GameAction, { type: "SANDBOX_ADD_CARD" }>,
  cards: CardLibrary
): void {
  if (state.combat?.context.kind !== "sandbox") {
    throw new Error("Cards can only be added by hand in the combat sandbox.");
  }

  const player = state.players[action.playerId];
  if (!player) {
    throw new Error(`Unknown player ${action.playerId}.`);
  }

  const card = cards[action.cardId];
  if (!card) {
    throw new Error(`Unknown card ${action.cardId}.`);
  }

  if (!SANDBOX_ADDABLE_KINDS.has(card.kind)) {
    throw new Error(`${card.name} (${card.kind}) is not a hand-playable card.`);
  }

  player.hand.push(action.cardId);
  appendEvent(state, {
    type: "SANDBOX_CARD_ADDED",
    playerId: action.playerId,
    cardId: action.cardId,
    message: `${player.name} adds ${card.name} to hand (sandbox).`
  });
}

function searchDeck(state: GameState, action: Extract<GameAction, { type: "SEARCH_DECK" }>): void {
  const deck = state.decks[action.deckId];
  if (!deck || !isSharedDeckId(action.deckId)) {
    throw new Error("That deck cannot be searched.");
  }

  // Lift the top cards off the deck so opponents see an accurate pile count
  // while the searcher decides. "Search X" reveals up to X cards.
  const revealedCardIds: string[] = [];
  for (let count = 0; count < action.count; count += 1) {
    const cardId = deck.drawPile.pop();
    if (!cardId) {
      break;
    }
    revealedCardIds.push(cardId);
  }

  const canTakeDiscardTop = deck.discardPile.length > 0;
  if (revealedCardIds.length === 0 && !canTakeDiscardTop) {
    throw new Error("That deck has no cards left to search.");
  }

  const choiceId = `choice_${nextEventNumber(state)}`;
  state.pendingChoice = {
    id: choiceId,
    type: "DECK_SEARCH",
    playerId: action.playerId,
    deckId: action.deckId,
    revealedCardIds,
    canTakeDiscardTop,
    returnPhase: state.phase
  };
  state.phase = "choice";
  state.priorityPlayerId = action.playerId;

  appendEvent(state, {
    type: "DECK_SEARCH_STARTED",
    playerId: action.playerId,
    deckId: action.deckId,
    choiceId,
    revealedCount: revealedCardIds.length
  });
}

/**
 * Mark an ability card the player just drew out of the shared Ability deck.
 * A Necromancy obtained this way (the level-up "Search the Ability deck"
 * reward) is kept but never playable — see the Necromancy legality check.
 */
function recordDeckDrawnAbility(player: PlayerState, deckId: string, cardId: CardId): void {
  if (deckId !== "abilities") {
    return;
  }
  (player.deckDrawnAbilityCardIds ??= []).push(cardId);
}

function resolveDeckSearch(
  state: GameState,
  action: Extract<GameAction, { type: "RESOLVE_DECK_SEARCH" }>,
  cards: CardLibrary = cardLibrary
): void {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "DECK_SEARCH" || choice.id !== action.choiceId || choice.playerId !== action.playerId) {
    throw new Error("That deck search cannot be resolved.");
  }

  const deck = state.decks[choice.deckId];
  const player = state.players[action.playerId];
  if (!deck || !player) {
    throw new Error("That deck search cannot be resolved.");
  }

  let discardedCardIds: string[];

  if (action.pick.kind === "school-fetch") {
    // Basic X Magic: put the revealed cards back, fetch the deck's first
    // spell of the school (Magic Arrow's "any" counts), then reshuffle.
    if (!choice.schoolFetch?.includes(action.pick.school)) {
      throw new Error("No Basic Magic of that school is in play.");
    }

    deck.drawPile.push(...choice.revealedCardIds.reverse());
    let fetchedCardId: string | null = null;
    for (let index = deck.drawPile.length - 1; index >= 0; index -= 1) {
      const schools = cards[deck.drawPile[index]]?.spellSchools ?? [];
      if (schools.includes(action.pick.school) || schools.includes("any")) {
        fetchedCardId = deck.drawPile[index];
        deck.drawPile.splice(index, 1);
        break;
      }
    }

    if (fetchedCardId) {
      player.hand.push(fetchedCardId);
    }
    deck.drawPile = shuffleCards(deck.drawPile, `${state.seed}#school-fetch#${eventSeedNumber(state)}`);
    discardedCardIds = [];
  } else if (action.pick.kind === "discard-top") {
    if (!choice.canTakeDiscardTop) {
      throw new Error("The discard pile is empty.");
    }

    const takenCardId = deck.discardPile.pop();
    if (!takenCardId) {
      throw new Error("The discard pile is empty.");
    }

    player.hand.push(takenCardId);
    recordDeckDrawnAbility(player, choice.deckId, takenCardId);
    discardedCardIds = [...choice.revealedCardIds];
    deck.discardPile.push(...discardedCardIds);
  } else {
    const keptCardId = choice.revealedCardIds[action.pick.index];
    if (!keptCardId) {
      throw new Error("That revealed card is not available.");
    }

    player.hand.push(keptCardId);
    recordDeckDrawnAbility(player, choice.deckId, keptCardId);
    const keptIndex = action.pick.index;
    discardedCardIds = choice.revealedCardIds.filter((_, index) => index !== keptIndex);
    deck.discardPile.push(...discardedCardIds);
  }

  appendEvent(state, {
    type: "DECK_SEARCH_RESOLVED",
    playerId: action.playerId,
    deckId: choice.deckId,
    choiceId: choice.id,
    pick: action.pick.kind === "school-fetch" ? "revealed" : action.pick.kind,
    discardedCardIds
  });

  const repeat = choice.repeatSearch;
  state.pendingChoice = null;
  state.phase = choice.returnPhase;
  state.priorityPlayerId = null;

  // Pendant of Courage: the whole Search action happens once more.
  if (repeat) {
    if (state.adventure) {
      state.adventure.rewardQueue.unshift({
        playerId: action.playerId,
        kind: "shared-deck-search",
        deckId: repeat.deckId,
        count: repeat.count
      });
      pumpAdventureQueues(state);
    } else {
      openSharedDeckSearch(state, action.playerId, repeat.deckId, repeat.count);
    }
  }
}

function moveHero(state: GameState, action: Extract<GameAction, { type: "MOVE_HERO" }>): void {
  const hero = state.heroes[action.heroId];
  if (!hero || hero.controllerId !== action.playerId || !hero.spaceId) {
    throw new Error("That hero cannot move now.");
  }

  if (hero.movementPoints <= 0) {
    throw new Error("That hero has no movement points left.");
  }

  const currentSpace = state.map.spaces[hero.spaceId];
  if (!currentSpace?.adjacent.includes(action.to)) {
    throw new Error("Heroes can only move to adjacent map fields.");
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
}

function endTurn(state: GameState, action: Extract<GameAction, { type: "END_TURN" }>): void {
  const nextPlayer = nextPlayerId(state, action.playerId);
  // Ongoing cards expire when their owner's next turn begins.
  appendExpiredEffectEvents(state, expireEffectsForTurnEnd(state, nextPlayer), "turn-ended");
  state.activePlayerId = nextPlayer;
  if (state.turn.mode === "ordered") {
    state.turn.observingPlayerId = nextPlayer;
  }
  appendEvent(state, {
    type: "TURN_ENDED",
    playerId: action.playerId,
    nextPlayerId: nextPlayer
  });
}

/**
 * Executes one queued neutral activation according to the AI rules. The pump
 * pauses whenever a reaction window or pending choice opens for a human.
 */
function executeNeutralActivation(
  state: GameState,
  unit: CombatUnitState,
  cards: CardLibrary,
  forcedTargetId?: UnitId
): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }

  // A neutral's "[activation]" choice ability fires once, before it acts:
  // Enchanters take +1 Attack, Faerie Dragons zap their normal target (and may
  // end the combat outright). It never ends the activation otherwise.
  if (!unit.activationAbilityDone) {
    unit.activationAbilityDone = true;
    applyNeutralActivationAbility(state, unit);
    if (combat.outcome) {
      return;
    }
  }

  const intent = planNeutralActivation(state, combat, unit, forcedTargetId);

  if (intent.kind === "choose-target") {
    // Rulebook AI: "If there is ever a tie between equally valid targets,
    // the player chooses which unit is attacked."
    const chooser = combat.attackerPlayerId;
    const choiceId = `choice_${nextEventNumber(state)}`;
    state.pendingChoice = {
      id: choiceId,
      type: "ABILITY_TARGET_CHOICE",
      playerId: chooser,
      kind: "neutral-target",
      abilityId: null,
      abilityName: "Neutral target tie",
      prompt: `${unit.name} has equally valid targets — you choose which unit it attacks.`,
      sourceUnitId: unit.id,
      anchorUnitId: null,
      candidateUnitIds: intent.candidateIds
    };
    state.phase = "choice";
    state.priorityPlayerId = chooser;

    appendEvent(state, {
      type: "PENDING_CHOICE_CREATED",
      choiceId,
      choiceType: "ABILITY_TARGET_CHOICE",
      playerId: chooser,
      sourceEffectIds: [],
      message: `${unit.name} has tied targets: the player chooses which unit is attacked.`
    });
    return;
  }

  if (intent.kind === "pass") {
    unit.activatedThisRound = true;
    appendExpiredEffectEvents(state, expireEffectsForActivationEnd(state, unit.id), "activation-ended");
    appendEvent(state, {
      type: "UNIT_ACTIVATION_ENDED",
      playerId: unit.controllerId,
      unitId: unit.id
    });
    advanceActiveUnit(state);
    return;
  }

  if (intent.kind === "move") {
    const from = unit.position;
    unit.position = intent.destination;
    unit.movedThisActivation = true;
    unit.activatedThisRound = true;
    appendExpiredEffectEvents(state, expireEffectsForActivationEnd(state, unit.id), "activation-ended");
    appendEvent(state, {
      type: "UNIT_MOVED",
      playerId: unit.controllerId,
      unitId: unit.id,
      from,
      to: intent.destination
    });
    // The pre-activation reaction pause already paced this guard (the human saw
    // it about to move and had their window), so the move just advances to the
    // next unit — whose own pre-activation pause holds the board to show this
    // move's result.
    advanceActiveUnit(state);
    return;
  }

  if (intent.kind === "move-and-attack") {
    const from = unit.position;
    unit.position = intent.destination;
    unit.movedThisActivation = true;
    appendEvent(state, {
      type: "UNIT_MOVED",
      playerId: unit.controllerId,
      unitId: unit.id,
      from,
      to: intent.destination
    });
  }

  declareAttack(
    state,
    {
      type: "ATTACK_UNIT",
      playerId: unit.controllerId,
      attackerId: unit.id,
      defenderId: intent.defenderId
    },
    cards
  );
}

/**
 * A preview of what a neutral guard is about to do, shown in the pre-activation
 * reaction pop-up so the reacting player knows what they are reacting to. A
 * target tie is reported as a plain "attack" (the exact target is chosen after
 * the pause resumes).
 */
function previewNeutralIntent(
  state: GameState,
  combat: CombatState,
  unit: CombatUnitState
): NonNullable<NonNullable<CombatState["pendingNeutralStep"]>["intent"]> {
  const intent = planNeutralActivation(state, combat, unit);
  switch (intent.kind) {
    case "attack":
    case "move-and-attack": {
      const target = combat.units[intent.defenderId];
      return {
        kind: "attack",
        targetUnitId: intent.defenderId,
        targetName: target?.name,
        ...(intent.kind === "move-and-attack" ? { destination: intent.destination } : {})
      };
    }
    case "move":
      return { kind: "move", destination: intent.destination };
    case "choose-target":
      return { kind: "attack" };
    default:
      return { kind: "pass" };
  }
}

/**
 * Who, if anyone, gets a pre-activation reaction pause before `active` takes
 * its turn — the participant on the OTHER side who can meaningfully react now:
 *
 *  - Neutral fights: the human attacker, whenever they hold any off-turn
 *    reaction (an Intelligence-enabled spell, a trigger-free instant spell, an
 *    instant ability, or a usable active effect). This is the "neutral combat
 *    goes slower so you can cast Intelligence / an instant" window.
 *  - Player-vs-player: the opposing player, but only while they hold the
 *    Intelligence anytime-cast freedom — they already get attack/spell reaction
 *    windows otherwise, so the pause is reserved for the off-turn casting that
 *    Intelligence unlocks.
 *
 * Returns null in the sandbox, for neutral reactors, hand-locked sides
 * (heroless garrison / Secondary Hero), and whenever nothing can be done.
 */
function reactionPauseReactor(
  state: GameState,
  combat: CombatState,
  active: CombatUnitState,
  cards: CardLibrary
): PlayerId | null {
  if (combat.context.kind === "sandbox") {
    return null;
  }

  for (const candidate of [combat.attackerPlayerId, combat.defenderPlayerId]) {
    if (candidate === active.controllerId || candidate === NEUTRAL_PLAYER_ID) {
      continue;
    }
    if (isHandLockedInCombat(state, candidate)) {
      continue;
    }
    // Neutral fights pace EVERY guard step: the pause always opens for the
    // human attacker so they see the guard about to act and can react if they
    // can (the client auto-resumes after a beat when there is nothing to do).
    if (combat.context.kind === "neutral") {
      return candidate;
    }
    // Player-vs-player pauses only while the side holds the Intelligence
    // freedom and actually has an off-turn play to make — they already get the
    // attack/spell reaction windows otherwise.
    if (playerHasSpellTimingFreedom(state, candidate) && getOffTurnCombatReactions(state, candidate, cards).length > 0) {
      return candidate;
    }
  }

  return null;
}

/**
 * Adventure-mode engine pump, run after every applied action: advances
 * neutral activations, gates the neutral combat time limit, finalizes
 * adventure combats, and opens queued rewards. Stops whenever a human
 * decision (reaction window, pending choice, placement, continue/retreat)
 * is required.
 */
function runAdventureAutomations(state: GameState, cards: CardLibrary): void {
  if (!state.adventure) {
    return;
  }

  rehydrateCityHallChoice(state);

  let safety = 300;
  while (safety > 0) {
    safety -= 1;
    const combat = state.combat;

    // A combat pause is open (a guard walked, or a pre-activation reaction
    // window): hold everything until the reacting player clicks on. If the
    // combat ended meanwhile — e.g. the reactor cast a lethal spell during the
    // pause — drop the pause so the outcome can finalize below.
    if (combat?.pendingNeutralStep) {
      if (combat.outcome) {
        combat.pendingNeutralStep = null;
      } else {
        break;
      }
    }

    // Neutral Liches/Magogs/Cerberi resolve their own ability targets.
    if (
      state.pendingChoice?.type === "ABILITY_TARGET_CHOICE" &&
      state.pendingChoice.playerId === NEUTRAL_PLAYER_ID
    ) {
      if (autoResolveNeutralAbilityChoice(state, cards)) {
        continue;
      }
    }

    // Neutral Minotaurs/Champions auto-reroll their own "-1" attack die.
    if (
      state.pendingChoice?.type === "ATTACK_DIE_REROLL" &&
      state.pendingChoice.playerId === NEUTRAL_PLAYER_ID
    ) {
      autoResolveNeutralReroll(state, cards);
      continue;
    }

    // Neutral Skeletons: the moment a Skeleton guard falls (between
    // activations), the attacker's Necropolis hero is offered a free bronze
    // reinforce. A Skeleton killed last leaves combat already over, so the
    // after-combat fallback in finalizeAdventureCombat covers that case.
    if (
      combat &&
      !combat.outcome &&
      !combat.setup &&
      !combat.awaitingContinue &&
      !state.reactionWindow &&
      !state.pendingChoice &&
      state.stack.length === 0 &&
      combat.skeletonGuardDefeated &&
      !combat.skeletonReinforceGranted &&
      state.players[combat.attackerPlayerId]?.factionId === "necropolis"
    ) {
      combat.skeletonReinforceGranted = true;
      openSkeletonReinforceChoice(state, combat.attackerPlayerId);
      if (state.pendingChoice) {
        break;
      }
      continue;
    }

    if (
      combat &&
      !combat.outcome &&
      !combat.setup &&
      !combat.awaitingContinue &&
      !state.reactionWindow &&
      !state.pendingChoice &&
      state.stack.length === 0
    ) {
      if (!combat.activeUnitId) {
        const nextUnit = getNextUnitToActivate(combat, state.activeEffects);
        if (nextUnit) {
          setActiveUnit(state, nextUnit.id);
          continue;
        }

        // All units acted: neutral combats hit their one-round time limit,
        // player combats roll straight into the next round.
        if (combat.context.kind === "neutral" && !combat.context.hasAzure) {
          combat.awaitingContinue = true;
          state.priorityPlayerId = combat.attackerPlayerId;
          state.activePlayerId = combat.attackerPlayerId;
          continue;
        }

        advanceCombatRound(state, combat.attackerPlayerId);
        continue;
      }

      const active = combat.units[combat.activeUnitId];
      if (active && isUnitAlive(active) && !active.activatedThisRound) {
        // Pre-activation reaction pause: before this unit acts, give the other
        // side a window to cast (Intelligence-enabled spells, trigger-free
        // instant spells) or play an instant ability. Neutral fights "go
        // slower" so the human can react to each guard; player-vs-player only
        // pauses while a side holds the Intelligence freedom.
        if (!active.reactionPauseAcked) {
          const reactor = reactionPauseReactor(state, combat, active, cards);
          if (reactor) {
            combat.pendingNeutralStep = {
              kind: "pre-activation",
              unitId: active.id,
              name: active.name,
              reactingPlayerId: reactor,
              ...(isNeutralUnit(active) ? { intent: previewNeutralIntent(state, combat, active) } : {})
            };
            state.priorityPlayerId = reactor;
            break;
          }
          active.reactionPauseAcked = true;
        }

        if (isNeutralUnit(active)) {
          executeNeutralActivation(state, active, cards);
          continue;
        }
        // A human-controlled unit is active (player-vs-player): the pump stops
        // and waits for that player to drive it.
      }
    }

    // Adventure combats wait on the battlefield with the end-of-combat
    // notice up; a participant's ACKNOWLEDGE_COMBAT_END flips the flag and
    // only then do XP, unit flips and the field visit resolve.
    if (combat?.outcome && combat.context.kind !== "sandbox" && combat.endAcknowledged) {
      finalizeAdventureCombat(state);
      continue;
    }

    if (!state.combat && !state.pendingChoice && !state.reactionWindow) {
      const queueLength = state.adventure.rewardQueue.length;
      const hadVisit = Boolean(state.adventure.pendingVisit);
      pumpAdventureQueues(state);
      if (state.adventure.rewardQueue.length !== queueLength || hadVisit !== Boolean(state.adventure.pendingVisit)) {
        continue;
      }
    }

    break;
  }
}

/** Adventure actions are validated inside their handlers, not by enumeration. */
const HANDLER_VALIDATED_ACTIONS = new Set<GameAction["type"]>([
  "REFRESH_HAND",
  "REVISIT_FIELD",
  "OPEN_MARKET",
  "DISCOVER_TILE",
  "PLACE_TILE",
  "SET_TILE_ROTATION",
  "MOVE_HERO_PATH",
  "RESOLVE_VISIT_STEP",
  "TRADE_RESOURCES",
  "PLACE_COMBAT_UNIT",
  "UNPLACE_COMBAT_UNIT",
  "SWAP_COMBAT_UNITS",
  "SANDBOX_ADD_CARD",
  "FINISH_TACTICS",
  "FINISH_COMBAT_PLACEMENT",
  "CONTINUE_NEUTRAL_COMBAT",
  "RETREAT_FROM_COMBAT",
  "SURRENDER_COMBAT",
  "POPULATION_ACTION",
  "SPELL_BOOK_ACTION",
  "ROGUES_SCOUT_DECK",
  "BLACKSMITH_ACTION",
  "SPEND_MORALE",
  "CHOOSE_OPTION",
  "CHOOSE_ABILITY_TARGET",
  "CHOOSE_FACTION",
  "SET_GAME_OPTIONS",
  "START_ADVENTURE",
  "BUY_WAR_MACHINE",
  "USE_PERMANENT_EXPERT",
  "USE_SCHOOL_FETCH_EXPERT",
  "USE_TOWN_BUILDING",
  "SPEND_TOWN_CUBE",
  "HALL_OF_VALHALLA_BOOST",
  "ATTACK_FORTIFICATION",
  "GIVE_UP"
]);

function isHandlerValidated(state: GameState, action: GameAction): boolean {
  if (HANDLER_VALIDATED_ACTIONS.has(action.type)) {
    return true;
  }

  return (
    state.mode === "adventure" &&
    (action.type === "MOVE_HERO" || action.type === "BUILD_STRUCTURE" || action.type === "END_TURN")
  );
}

export function applyAction(state: GameState, action: GameAction, options: ReducerOptions = {}): EngineResult {
  const cards = options.cards ?? cardLibrary;
  const buildings = options.buildings ?? sampleBuildings;
  const legalError = isHandlerValidated(state, action) ? null : assertLegal(state, action, cards, buildings);
  if (legalError) {
    return fail(state, legalError);
  }

  const nextState = cloneState(state);
  const startEventNumber = eventSeedNumber(nextState);

  try {
    switch (action.type) {
      case "CAST_SPELL":
        castSpell(nextState, action, cards);
        break;
      case "PLAY_CARD":
        playCard(nextState, action, cards);
        break;
      case "ATTACK_UNIT":
        attackUnit(nextState, action, cards);
        break;
      case "MOVE_AND_ATTACK_UNIT":
        moveAndAttackUnit(nextState, action, cards);
        break;
      case "MOVE_UNIT":
        moveUnit(nextState, action);
        break;
      case "USE_UNIT_ABILITY":
        applyUnitAbilityAction(nextState, action);
        break;
      case "SUMMON_DEMONS":
        summonDemons(nextState, action);
        break;
      case "USE_GENIE_DECK_DRAW":
        applyGenieDeckDraw(nextState, action);
        break;
      case "USE_ACTIVE_EFFECT":
        applyActiveEffectAction(nextState, action);
        break;
      case "DEFEND_UNIT":
        defendUnit(nextState, action);
        break;
      case "END_ACTIVATION":
        endActivation(nextState, action);
        break;
      case "END_COMBAT_ROUND":
        endCombatRound(nextState, action);
        break;
      case "BUILD_STRUCTURE":
        if (nextState.mode === "adventure") {
          buildStructureAdventure(nextState, action);
        } else {
          buildStructure(nextState, action, buildings);
        }
        break;
      case "COMPLETE_SIMULTANEOUS_TURN":
        completeSimultaneousTurn(nextState, action);
        break;
      case "REROLL_PENDING_CHOICE":
        rerollPendingChoice(nextState, action);
        break;
      case "CHOOSE_PENDING_ROLL":
        choosePendingRoll(nextState, action, cards);
        break;
      case "PASS_REACTION":
        passReaction(nextState, action, cards);
        break;
      case "PLAY_REACTION":
        playReaction(nextState, action, cards);
        break;
      case "PLAY_REACTIONS":
        playReactions(nextState, action, cards);
        break;
      case "USE_UNIT_RESURRECTION":
        applyUnitResurrection(nextState, action, cards);
        break;
      case "SEARCH_DECK":
        searchDeck(nextState, action);
        break;
      case "SANDBOX_ADD_CARD":
        sandboxAddCard(nextState, action, cards);
        break;
      case "RESOLVE_DECK_SEARCH":
        resolveDeckSearch(nextState, action, cards);
        break;
      case "MOVE_HERO":
        if (nextState.mode === "adventure") {
          moveHeroAdventure(nextState, action);
        } else {
          moveHero(nextState, action);
        }
        break;
      case "MOVE_HERO_PATH":
        moveHeroPathAdventure(nextState, action);
        break;
      case "REFRESH_HAND":
        refreshHand(nextState, action);
        break;
      case "REVISIT_FIELD":
        revisitField(nextState, action);
        break;
      case "OPEN_MARKET":
        openMarket(nextState, action);
        break;
      case "DISCOVER_TILE":
        discoverTile(nextState, action);
        break;
      case "PLACE_TILE":
        placeTile(nextState, action);
        break;
      case "SET_TILE_ROTATION":
        setTileRotation(nextState, action);
        break;
      case "CHOOSE_FACTION":
        chooseFaction(nextState, action);
        break;
      case "START_ADVENTURE":
        startAdventureFromLobby(nextState, action);
        break;
      case "RESOLVE_VISIT_STEP":
        resolveVisitStep(nextState, action);
        break;
      case "TRADE_RESOURCES":
        tradeResources(nextState, action);
        break;
      case "BUY_WAR_MACHINE":
        buyWarMachine(nextState, action);
        break;
      case "SELL_SCROLL_SPELL":
        sellScrollSpell(nextState, action);
        break;
      case "USE_PERMANENT_EXPERT":
        applyPermanentExpert(nextState, action);
        // The discarded permanent disappears from the open window's options.
        refreshReactionWindowLegalReactions(nextState, cards);
        break;
      case "USE_SCHOOL_FETCH_EXPERT":
        applySchoolFetchExpert(nextState, action);
        refreshReactionWindowLegalReactions(nextState, cards);
        break;
      case "DISCARD_PERMANENT":
        discardPermanentVoluntarily(nextState, action);
        break;
      case "ACKNOWLEDGE_COMBAT_END":
        acknowledgeCombatEnd(nextState, action);
        break;
      case "PLACE_COMBAT_UNIT":
        placeCombatUnit(nextState, action);
        break;
      case "UNPLACE_COMBAT_UNIT":
        unplaceCombatUnit(nextState, action);
        break;
      case "FINISH_COMBAT_PLACEMENT":
        finishCombatPlacement(nextState, action);
        break;
      case "SWAP_COMBAT_UNITS":
        swapCombatUnits(nextState, action);
        break;
      case "FINISH_TACTICS":
        finishTactics(nextState, action);
        break;
      case "CONTINUE_NEUTRAL_COMBAT":
        continueNeutralCombat(nextState, action);
        advanceCombatRound(nextState, action.playerId);
        break;
      case "CONTINUE_NEUTRAL_STEP":
        continueNeutralStep(nextState, action);
        break;
      case "RETREAT_FROM_COMBAT":
        retreatFromCombat(nextState, action);
        break;
      case "SURRENDER_COMBAT":
        surrenderFromCombat(nextState, action);
        break;
      case "POPULATION_ACTION":
        populationAction(nextState, action);
        break;
      case "HIRE_SECONDARY_HERO":
        hireSecondaryHero(nextState, action);
        break;
      case "SPELL_BOOK_ACTION":
        spellBookAction(nextState, action);
        break;
      case "ROGUES_SCOUT_DECK":
        roguesScoutDeck(nextState, action);
        break;
      case "BLACKSMITH_ACTION":
        blacksmithAction(nextState, action);
        break;
      case "USE_TOWN_BUILDING":
        activateTownBuilding(nextState, action);
        break;
      case "SPEND_TOWN_CUBE":
        spendTownCube(nextState, action);
        refreshReactionWindowLegalReactions(nextState, cards);
        break;
      case "HALL_OF_VALHALLA_BOOST":
        hallOfValhallaBoost(nextState, action);
        refreshReactionWindowLegalReactions(nextState, cards);
        break;
      case "ATTACK_FORTIFICATION":
        attackFortification(nextState, action);
        break;
      case "SPEND_MORALE":
        spendMorale(nextState, action);
        break;
      case "CHOOSE_OPTION":
        // The combat-only option choices (Harpy fly-back, Genies' Wish spell
        // pick, Ghost Dragon knock-back) live in the combat reducer; every other
        // option choice is
        // handled by the adventure reducer.
        if (
          nextState.pendingChoice?.type === "OPTION_CHOICE" &&
          nextState.pendingChoice.context === "combat-reposition"
        ) {
          resolveCombatReposition(nextState, action);
        } else if (
          nextState.pendingChoice?.type === "OPTION_CHOICE" &&
          nextState.pendingChoice.context === "genie-take-spell"
        ) {
          resolveGenieTakeSpell(nextState, action);
        } else if (
          nextState.pendingChoice?.type === "OPTION_CHOICE" &&
          nextState.pendingChoice.context === "combat-knockback"
        ) {
          resolveKnockbackChoice(nextState, action, cards);
        } else if (
          nextState.pendingChoice?.type === "OPTION_CHOICE" &&
          nextState.pendingChoice.context === "combat-teleport"
        ) {
          resolveTeleportChoice(nextState, action);
        } else if (
          nextState.pendingChoice?.type === "OPTION_CHOICE" &&
          nextState.pendingChoice.context === "place-battlefield-tokens"
        ) {
          resolvePlaceTokensChoice(nextState, action);
        } else if (
          nextState.pendingChoice?.type === "OPTION_CHOICE" &&
          nextState.pendingChoice.context === "combat-clone"
        ) {
          resolveCloneChoice(nextState, action);
        } else if (
          nextState.pendingChoice?.type === "OPTION_CHOICE" &&
          nextState.pendingChoice.context === "combat-step"
        ) {
          resolveUnitStepChoice(nextState, action);
        } else {
          chooseOption(nextState, action);
        }
        break;
      case "RESOLVE_COMBAT_DISCARD":
        resolveCombatHandDiscard(nextState, action, cards);
        break;
      case "CHOOSE_ABILITY_TARGET":
        chooseAbilityTarget(nextState, action, cards);
        break;
      case "SET_GAME_OPTIONS":
        setGameOptions(nextState, action);
        break;
      case "END_TURN":
        if (nextState.mode === "adventure") {
          endTurnAdventure(nextState, action);
        } else {
          endTurn(nextState, action);
        }
        break;
      case "GIVE_UP":
        giveUpAdventure(nextState, action);
        break;
    }
  } catch (error) {
    return fail(state, {
      code: "ACTION_NOT_LEGAL",
      message: error instanceof Error ? error.message : "The action could not be applied."
    });
  }

  // Disrupting Ray: refresh every unit's ability-suppression flag from the live
  // UNIT_ABILITY_SUPPRESSED effects, so the ability chokepoint
  // (getUnitAbilityDefinitions) sees the current state however the effect was
  // just added (a cast) or removed (Dispel, combat/round end) — before any
  // automation or future action reads the unit's abilities.
  syncAbilitySuppression(nextState);

  try {
    runAdventureAutomations(nextState, cards);
  } catch (error) {
    return fail(state, {
      code: "ACTION_NOT_LEGAL",
      message:
        error instanceof Error
          ? `Automation failed: ${error.message}`
          : "The action could not complete its automatic follow-up."
    });
  }

  // Pre-activation interrupts (Sorrow's skip, Bowstring of the Unicorn's Mane's
  // out-of-order ranged activation): once everything else has settled, open the
  // shared window before the about-to-act unit moves. Runs before the active
  // unit's own "[activation]" choice so an interrupt pre-empts it.
  maybeOpenPreActivationWindow(nextState, cards);

  // Once everything else has settled, surface a player-controlled unit's
  // "[activation]" choice (Enchanters' heal-or-buff, Faerie Dragons' Ice Bolt)
  // before it acts. Runs after the neutral pump and war-machine round-starts.
  maybeOpenPlayerActivationChoice(nextState);

  // Ongoing cards whose every effect has ended (expired, consumed, dispelled
  // — whatever this action did) finally reach their discard pile or hand.
  releaseEndedOngoingCards(nextState);

  return ok(nextState, startEventNumber);
}

export function findEvent<T extends GameEvent["type"]>(
  state: GameState,
  type: T
): Extract<GameEvent, { type: T }> | undefined {
  return state.eventLog.find((event): event is Extract<GameEvent, { type: T }> => event.type === type);
}

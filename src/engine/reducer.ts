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
  makeCombatUnitFromArmy,
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
  hallOfValhallaBoost,
  openSiegeDemolishChoice,
  moveHeroAdventure,
  moveHeroPathAdventure,
  openSharedDeckSearch,
  hireSecondaryHero,
  placeCombatUnit,
  placeTile,
  populationAction,
  pumpAdventureQueues,
  refreshHand,
  rehydrateCityHallChoice,
  resolveVisitStep,
  retreatFromCombat,
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
  BATTLEFIELD_COLUMNS,
  BATTLEFIELD_ROWS,
  getBattlefieldCoordinates,
  getBattlefieldLabel,
  getOrthogonalNeighbors,
  isBattlefieldPosition
} from "./battlefield";
import { appendExpiredEffectEvents, finishCombatIfNeeded, markUnitRemovedIfNeeded } from "./combat-units";
import { isNeutralUnit, pickNeutralTarget, planNeutralActivation, sortNeutralTargetCandidates } from "./neutral-ai";
import {
  applyPermanentCombatEffectsForPlayer,
  applyPermanentExpert,
  buyWarMachine,
  discardPermanentVoluntarily,
  getPermanentSchoolBonus,
  putPermanentIntoPlay,
  resolveWarMachineTarget,
  startWarMachineRound
} from "./permanents";
import { createSeededRandom } from "./random";
import { estatesGold, getRuleset, spellLimitFor } from "./ruleset";
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
  expireEffectsForCombatRoundEnd,
  expireEffectsForTurnEnd,
  getActiveAttackBonus,
  getActiveDefenseBonus,
  getAttackRerollEffects,
  makeActiveEffect,
  releaseEndedOngoingCards,
  unitDealsElementalDamage
} from "./active-effects";
import { appendEvent, eventSeedNumber, nextEventNumber } from "./events";
import { drawCardsForPlayer, isSharedDeckId, shuffleCards } from "./decks";
import {
  cardCanBoostPower,
  getEffectAmount,
  getEffectDamageAmount,
  getEffectiveCardEffect,
  getSpellDamageAmount
} from "./effects";
import {
  canUnitAttack,
  canUnitMoveAndAttack,
  canUnitMoveTo,
  canPlayerBuildStructure,
  getAttackKind,
  getAttackRollMode,
  getLegalActions,
  getLegalMoveDestinations,
  getLegalReactionsForTrigger,
  getNextUnitToActivate,
  isAdjacent,
  isUnitAlive,
  rerollSourceAvailableFor
} from "./legal-actions";
import {
  getActivationAbilities,
  getActivationDamageSpellAbility,
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
  getEnchanterActivationAbility,
  getEnemyDiscardAbility,
  getFlatDamageFollowUps,
  getIgnoreTargetCardDefenseAbility,
  getLethalSaveUnitAbility,
  getLineAttackAbility,
  getOnAttackDieTokens,
  getParalysisFollowUps,
  getPostAttackAbilityDamageEffects,
  getRetaliationAgainstAttackPenalty,
  getRetaliationParalysis,
  getReturnAfterAttackAbility,
  getSecondAttackAbility,
  getSecondAttackCandidates,
  getSelfAdjacentSecondAttackAbility,
  getTriggeredAttackDieBonusAbilities,
  getUnitAbilityDefinitions,
  getUnitAttackRerollSources,
  hasIgnoreParalysis,
  hasRetaliationAgainstDisadvantage,
  hasUnitAbilityEffect,
  unitImmuneToSpellSchools
} from "./unit-abilities";
import type {
  ActiveEffectDefinition,
  ActiveEffectState,
  AttackRerollSource,
  AttackRollCandidate,
  AttackRollMode,
  BuildingLibrary,
  CardDefinition,
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
    if (!effect || effect.type === "CANCEL_SPELL" || effect.type === "RECALL_SPELL") {
      return {
        code: "ACTION_NOT_LEGAL",
        message: "Spell-ending and recall cards must be played on their own."
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

function reactionPlayerOrder(state: GameState, legalReactions: Record<PlayerId, LegalAction[]>): PlayerId[] {
  return state.turnOrder.filter((playerId) => (legalReactions[playerId] ?? []).length > 0);
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
  createActiveEffect(
    state,
    {
      name: card.effect.name,
      scope: "unit",
      duration: card.effect.duration,
      polarity: card.effect.polarity ?? "positive",
      removable: card.effect.removable ?? true,
      modifiers: [
        {
          type: "DEFENSE_BONUS",
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

  createActiveEffect(
    state,
    {
      name: card.effect.name,
      scope: "player",
      duration: card.effect.duration,
      polarity: "positive",
      removable: false,
      modifiers: [
        {
          type: "ATTACK_DIE_REROLL",
          maxUsesPerRoll,
          consumeEffectOnUse: card.effect.consumeEffectOnUse
        }
      ]
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

// (finishCombatIfNeeded lives in combat-units.ts.)

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
  dieMultiplier = 1,
  baseAttackOverride?: number,
  damageReduction = 0
): { attackValue: number; defenseValue: number; damage: number; dieAttackBonus: number; dieDefenseBonus: number } {
  // Attack-die-face conditioned modifiers, resolved here so the actual hit and
  // the lethal-save preview always agree: Dread Knights' "Death Blow" adds to
  // the attacker's value on 0/+1, Zombies'/Manticores' resilience adds Defense
  // for the defender on the attacker's 0/+1.
  const dieAttackBonus = getAttackBonusOnAttackDie(attacker, roll);
  const dieDefenseBonus = getDefenseBonusOnAttackDie(defender, roll);
  const baseAttack = baseAttackOverride ?? attacker.attack;
  const attackValue = Math.max(0, baseAttack + attackBonus + dieAttackBonus + roll * dieMultiplier);
  const defenseValue = defender.defense + (defender.defenseToken ? 1 : 0) + defenseBonus + dieDefenseBonus;
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
  candidate: AttackRollCandidate,
  dieMultiplier = 1,
  baseAttackOverride?: number,
  damageReduction = 0,
  lethalCancel?: { grade: UnitGrade }
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
    dieMultiplier,
    baseAttackOverride,
    damageReduction
  );
  // Reported bonuses fold in the die-face-conditioned deltas so the event's
  // numbers reconcile with the resolved attack/defense values.
  const reportedAttackBonus = attackBonus + dieAttackBonus;
  const reportedDefenseBonus = defenseBonus + dieDefenseBonus;

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
      /** Bless: the Attack die is skipped and counts as 0. */
      ignoreAttackDie: boolean;
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
  const activeDefenseBonus = getActiveDefenseBonus(state, defender);
  const abilityAttack = stackItem.action.type === "ATTACK_UNIT" ? stackItem.action.abilityAttack : undefined;

  // Combat tokens: Attack/Weakness tokens shift the attacker, Corrosion the
  // defender (already floored so printed defense never drops below 0).
  const tokenAttack = tokenAttackBonus(attacker);
  const tokenDefense = tokenDefenseDelta(defender);

  // Attack-card "ability lowers the target's defense" sources, applied after
  // corrosion, never on retaliations or printed follow-up attacks: Behemoths'
  // flat crush, and the Manticore "ignore the target's printed Defense" (which
  // subtracts the defender's printed Defense value). Both are floored together
  // so the effective Defense never drops below 0.
  const defenseBonusBeforeAbility = stackItem.modifiers.defenseBonus + activeDefenseBonus + tokenDefense;
  const defenseReductionSource =
    !isRetaliation && !abilityAttack ? getAttackDefenseReductionAbility(attacker) : null;
  const ignoreCardDefenseSource =
    !isRetaliation && !abilityAttack ? getIgnoreTargetCardDefenseAbility(attacker) : null;
  const currentDefenseValue = Math.max(
    0,
    defender.defense + (defender.defenseToken ? 1 : 0) + defenseBonusBeforeAbility
  );
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
  const cardAttackBonus = stackItem.modifiers.attackBonus + activeAttackBonus;
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
    ignoreAttackDie: Boolean(stackItem.modifiers.ignoreAttackDie),
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
  rerollEffects: ActiveEffectState[]
): AttackRerollSource[] {
  const abilitySources: AttackRerollSource[] = getUnitAttackRerollSources(attacker).map((source) => ({
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

function finishResolvedAttack(
  state: GameState,
  stackItem: ResolutionStackItem,
  details: NonNullable<ReturnType<typeof getAttackStackDetails>>,
  candidate: AttackRollCandidate,
  cards: CardLibrary
): void {
  // Alamar's Resurrection: before a killing normal attack lands, pause once and
  // ask the defender's controller whether to cancel it (only if they can). The
  // rolled die is stashed so the resumed attack uses the same outcome.
  if (!stackItem.modifiers.lethalSaveOffered && playerHasLethalSave(state, details.defender.id, cards)) {
    const preview = getAttackDamagePreview(
      details.attacker,
      details.defender,
      candidate.roll,
      details.attackBonus,
      details.defenseBonus,
      details.dieMultiplier,
      details.abilityAttack?.baseAttack,
      details.damageReduction
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
    candidate,
    details.dieMultiplier,
    details.abilityAttack?.baseAttack,
    details.damageReduction,
    lethalCancel
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
  applyOnAttackDieTokens(state, details.attacker, details.defender, attackResult.roll, details.isRetaliation);
  applyPostAttackAbilityDamage(
    state,
    details.attacker,
    details.defender,
    details.attackKind,
    attackResult.roll,
    attackResult.damage
  );
  applyFireShieldDamage(state, details.attacker, details.defender, details.attackKind);

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
      afterRetaliationAbilityAttack: getAfterRetaliationAttack(details.attacker, details.defender)
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
    if (hasIgnoreParalysis(defender)) {
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

  if (hasIgnoreParalysis(target)) {
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

/** Resolves the Magi Power Drain choice, then unparks the attack sequence. */
function resolveMagiDiscard(
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
 * Clears a paused neutral walk so the next guard can act. Only the player
 * running the fight (the attacker) clicks the enemy turn on; the pump in
 * runAdventureAutomations picks the activation back up afterwards.
 */
function continueNeutralStep(
  state: GameState,
  action: Extract<GameAction, { type: "CONTINUE_NEUTRAL_STEP" }>
): void {
  const combat = state.combat;
  if (!combat?.pendingNeutralStep) {
    throw new Error("No enemy move is waiting to continue.");
  }
  if (action.playerId !== combat.attackerPlayerId) {
    throw new Error("Only the attacking player can continue the enemy turn.");
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
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: unit.id,
    abilityId: ability.abilityId,
    targetUnitId: target.id,
    message: `${unit.name} casts ${ability.abilityName} at ${target.cardName} for ${ability.amount} damage.`
  });
  target.damage += ability.amount;
  noteUnitDamagedForTokens(state, target, ability.amount);
  appendEvent(state, {
    type: "DAMAGE_ASSIGNED",
    source: { type: "unit", unitId: unit.id, controllerId: unit.controllerId },
    target: { type: "unit", unitId: target.id },
    amount: ability.amount,
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
  const allowedPlayerIds = reactionPlayerOrder(state, legalReactions);

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
  stackItem: ResolutionStackItem,
  triggerEvent: GameEvent,
  cards: CardLibrary
): boolean {
  const legalReactions = getLegalReactionsForTrigger(state, triggerEvent, cards);
  const allowedPlayerIds = reactionPlayerOrder(state, legalReactions);

  if (allowedPlayerIds.length === 0) {
    return false;
  }

  const windowId = `reaction_${triggerEvent.id}`;
  stackItem.status = "waiting-for-reaction";
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

function getCurrentSpellPower(stackItem: ResolutionStackItem, cards: CardLibrary): number {
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
  return (
    (card?.power ?? 0) +
    stackItem.modifiers.spellPowerBonus +
    (stackItem.modifiers.schoolPowerBonus ?? 0) +
    (stackItem.modifiers.townCubePowerBonus ?? 0)
  );
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

  if (!openReactionWindowForTrigger(state, stackItem, attackDeclared, cards)) {
    resolveTopStack(state, cards);
  }
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

  const candidate = rollAttackCandidate(combat, details.rollMode);
  const rerollEffects = getAttackRerollEffects(state, {
    attacker: details.attacker,
    defender: details.defender,
    attackKind: details.attackKind
  }).filter((effect) => !effect.usedChoiceIds.includes(stackItem.id));
  const rerollSources = buildRerollSources(state, details.attacker, rerollEffects);

  // Only pause when a source can actually fire on this roll — the Crusaders'
  // 'every "0"' reroll never interrupts a +1.
  if (rerollSources.some((source) => rerollSourceAvailableFor(source, candidate.roll))) {
    openAttackRerollChoice(state, stackItem, details, candidate, rerollSources);
    return;
  }

  finishResolvedAttack(state, stackItem, details, candidate, cards);
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

  // Spell Scroll casts were already removed from the game when played: there is
  // no card in hand/discard to hold ongoing, recall, or send to the discard.
  // Any ongoing effect they created still lives on in activeEffects.
  if (stackItem.modifiers.scrollLocked) {
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
    if (card?.effect.type === "EARTHQUAKE" && state.combat?.siege) {
      resolveEarthquakeSpell(state, stackItem.action.playerId, getCurrentSpellPower(stackItem, cards));
    }

    if (card?.effect.type === "DEAL_DAMAGE" && state.combat && stackItem.action.target.type === "unit") {
      const target = state.combat.units[stackItem.action.target.unitId];
      if (target) {
        const power = getCurrentSpellPower(stackItem, cards);
        const amount = getSpellDamageAmount(card, power);
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
        const power = getCurrentSpellPower(stackItem, cards);
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
      const power = getCurrentSpellPower(stackItem, cards);
      const amount = getSpellDamageAmount(card, power);
      const source = {
        type: "card" as const,
        cardId: card.id,
        controllerId: stackItem.action.playerId
      };
      healUnitDamage(state, source, stackItem.action.target, amount);
      removeEffectsFromTarget(state, source, stackItem.action.target, card.effect.removePolarity);
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
        getCurrentSpellPower(stackItem, cards),
        stackItem.action.target
      );
    }

    if (card?.effect.type === "CREATE_DEFENSE_BUFF" && stackItem.action.target.type === "unit") {
      createDefenseBuffFromCard(
        state,
        card,
        stackItem.action.playerId,
        getCurrentSpellPower(stackItem, cards),
        stackItem.action.target
      );
    }

    if (card?.effect.type === "CREATE_ATTACK_DIE_REROLL") {
      createAttackRerollEffectFromCard(
        state,
        card,
        stackItem.action.playerId,
        "basic",
        getCurrentSpellPower(stackItem, cards)
      );
    }

    if (card?.effect.type === "DRAW_CARDS") {
      drawCardsForPlayer(state, stackItem.action.playerId, getEffectAmount(card.effect, "basic"));
    }

    if (card?.effect.type === "CREATE_INITIATIVE_BUFF" && state.combat && stackItem.action.target.type === "unit") {
      const power = getCurrentSpellPower(stackItem, cards);
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
      const power = getCurrentSpellPower(stackItem, cards);
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
      const power = getCurrentSpellPower(stackItem, cards);
      const amount = getAmountByPower(card.effect.amountByPower, 1, power);
      createActiveEffect(
        state,
        {
          name: card.name,
          scope: "unit",
          duration: card.effect.duration,
          polarity: "positive",
          removable: true,
          modifiers: [{ type: "FIRE_SHIELD", amount }]
        },
        { type: "card", cardId: card.id, controllerId: stackItem.action.playerId },
        stackItem.action.playerId,
        stackItem.action.target
      );
    }

    if (card?.effect.type === "CLEAR_RETALIATION" && state.combat && stackItem.action.target.type === "unit") {
      const power = getCurrentSpellPower(stackItem, cards);
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
      const power = getCurrentSpellPower(stackItem, cards);
      const amount = getAmountByPower(card.effect.amountByPower, 1, power);
      if (target) {
        target.damage += amount;
        noteUnitDamagedForTokens(state, target, amount);
        appendEvent(state, {
          type: "DAMAGE_ASSIGNED",
          source: { type: "card", cardId: card.id, controllerId: stackItem.action.playerId },
          target: stackItem.action.target,
          amount,
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
            !unitImmuneToSpellSchools(unit, card.spellSchools)
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
      const power = getCurrentSpellPower(stackItem, cards);
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

    appendEvent(state, {
      type: "SPELL_CAST_RESOLVED",
      playerId: stackItem.action.playerId,
      spellCardId: stackItem.action.cardId,
      target: stackItem.action.target,
      power: getCurrentSpellPower(stackItem, cards)
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

function castSpell(state: GameState, action: Extract<GameAction, { type: "CAST_SPELL" }>, cards: CardLibrary): void {
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
  } else {
    const moveError = moveCardFromHandToDiscard(state, action.playerId, action.cardId);
    if (moveError) {
      throw new Error(moveError.message);
    }
  }

  const caster = state.players[action.playerId];
  caster.combatStats.spellsCastThisRound += 1;
  const isFirstSpellThisTurn = (caster.combatStats.spellsCastThisTurn ?? 0) === 0;
  caster.combatStats.spellsCastThisTurn = (caster.combatStats.spellsCastThisTurn ?? 0) + 1;

  const stackItem = makeStackItem(state, action);

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
  if (reactionPlayerOrder(state, legalReactions).length === 0) {
    resolveTopStack(state, cards);
    return;
  }

  openReactionWindowForTrigger(state, stackItem, spellStarted, cards);
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
    return Boolean(effect.expertIgnoresMaxPower);
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
  cardName: string,
  cost: CardPlayCost | undefined,
  costCardIds: CardId[] | undefined,
  cards: CardLibrary
): number {
  const paying = costCardIds ?? [];
  if (!cost || (cost.discardCards === undefined && cost.discardCardsUpTo === undefined)) {
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
    stackItemForBoost.modifiers.spellPowerBonus += 1;
    stackItemForBoost.modifiers.playedCardIds.push(play.cardId);
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
    getCurrentSpellPower(stackItem, cards) > effect.maxPower
  ) {
    throw new Error(`${card.name} cannot end a spell above power ${effect.maxPower}.`);
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
    : payOptionCardCost(state, playerId, card.name, option?.cost, play.costCardIds, cards);

  let effectAmount = getEffectAmount(effect, mode);
  if (mode === "expert") {
    state.players[playerId].combatStats.expertUsesSpentThisRound += 1;
  }

  if (card.kind === "spell" && state.combat && player) {
    player.combatStats.spellsCastThisRound += 1;
    player.combatStats.spellsCastThisTurn = (player.combatStats.spellsCastThisTurn ?? 0) + 1;
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

  // Empower: cast windows feed the pending spell; attack windows build the
  // Power pool a spell instant in the same declaration consumes. The
  // rulebook allows stacking several Empower plays to reach a threshold.
  if (effect.type === "ADD_SPELL_POWER" && stackItem) {
    if (effect.perCostCard) {
      effectAmount += effect.perCostCard * costCardsPaid;
    }
    stackItem.modifiers.spellPowerBonus += effectAmount;
    stackItem.modifiers.playedCardIds.push(play.cardId);
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

    // Spell instants scale with the Power played alongside them in this
    // window; cost-paid plays (Sword of Judgement) scale per discarded card.
    // A scroll spell ignores the window's Power pool — it is locked to power 0.
    if (effect.amountByPower && card.kind === "spell") {
      const power = play.fromScroll ? 0 : stackItem.modifiers.spellPowerBonus;
      effectAmount = getAmountByPower(effect.amountByPower, effect.amount, power);
    }
    if (effect.perCostCard) {
      effectAmount += effect.perCostCard * costCardsPaid;
    }

    // Hero specialties double their bonus when the signature unit is the one
    // attacking (attack bonus) or being attacked (defense bonus). Mutare's
    // "a Dragons unit" matches the whole Dragons family, not one exact name.
    const appliedAmount = unitMatchesSpecialtyName(affectedUnit?.name, effect.doubleForUnitName)
      ? effectAmount * 2
      : effectAmount;

    if (effect.stat === "attack") {
      stackItem.modifiers.attackBonus += appliedAmount;
    } else {
      stackItem.modifiers.defenseBonus += appliedAmount;
    }
    stackItem.modifiers.playedCardIds.push(play.cardId);

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

    if (effect.drawCards) {
      drawCardsForPlayer(state, playerId, effect.drawCards);
    }
  }

  // Bless: the pending attack skips its Attack die (and may gain attack).
  if (
    effect.type === "IGNORE_ATTACK_DIE" &&
    (stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT")
  ) {
    stackItem.modifiers.ignoreAttackDie = true;
    if (effect.attackBonusByPower) {
      stackItem.modifiers.attackBonus += getAmountByPower(
        effect.attackBonusByPower,
        0,
        play.fromScroll ? 0 : stackItem.modifiers.spellPowerBonus
      );
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

  return { windowEnded: false };
}

function advanceReactionWindowAfterPlay(state: GameState, playerId: PlayerId, cards: CardLibrary): void {
  if (!state.reactionWindow) {
    return;
  }

  state.reactionWindow.passedPlayerIds = [];
  refreshReactionWindowLegalReactions(state, cards);

  if (state.reactionWindow.allowedPlayerIds.length === 0) {
    closeReactionWindow(state, "all-pass");
    resolveTopStack(state, cards);
    return;
  }

  const allowedPlayerIds = state.reactionWindow.allowedPlayerIds;
  const currentIndex = allowedPlayerIds.indexOf(playerId);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % allowedPlayerIds.length;
  state.reactionWindow.priorityPlayerId = allowedPlayerIds[nextIndex];
  state.priorityPlayerId = allowedPlayerIds[nextIndex];
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
  // Power has no standalone effect during an attack — it may only be paid
  // together with an instant spell in one declaration (PLAY_REACTIONS), the
  // same rule the batch validator enforces.
  if (state.reactionWindow?.triggerEvent.type === "UNIT_ATTACK_DECLARED") {
    const card = cards[action.cardId];
    const effect = card && !action.asPowerBoost ? getEffectiveCardEffect(card, action.optionIndex) : null;
    if (action.asPowerBoost || effect?.type === "ADD_SPELL_POWER") {
      throw new Error("Power can only be played into an attack together with a Spell card.");
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
  // already in play goes to the discard pile.
  if (card.permanent) {
    putPermanentIntoPlay(state, action.playerId, action.cardId);
    appendEvent(state, {
      type: "CARD_PLAYED",
      playerId: action.playerId,
      cardId: action.cardId,
      timing: card.timing,
      mode: "basic"
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

  const option = getChosenOption(card, action.optionIndex);
  const mode = action.mode ?? "basic";
  if (option?.expertOnly && mode !== "expert") {
    throw new Error(`${option.label} is the card's expert side.`);
  }
  if (option?.mapOnly && state.combat) {
    throw new Error(`${option.label} cannot be used during combat.`);
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
    playerForLimit.combatStats.spellsCastThisRound += 1;
    playerForLimit.combatStats.spellsCastThisTurn = (playerForLimit.combatStats.spellsCastThisTurn ?? 0) + 1;
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

  payOptionCardCost(state, action.playerId, card.name, option?.cost, action.costCardIds, cards);

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

  const target = action.target?.type === "unit" ? action.target : undefined;

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
  }

  if (effect.type === "CREATE_ACTIVE_EFFECT") {
    createActiveEffectFromCard(state, card, effect, action.playerId, mode, target);
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

  if (effect.type === "CREATE_ATTACK_DIE_REROLL") {
    createAttackRerollEffectFromCard(state, card, action.playerId, mode);
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

  if (effect.type === "DRAW_CARDS") {
    drawCardsForPlayer(state, action.playerId, getEffectAmount(effect, mode));
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
  }

  if (effect.type === "GAIN_EXPERT_USE") {
    const player = state.players[action.playerId];
    player.combatStats.expertUseBonusThisRound = (player.combatStats.expertUseBonusThisRound ?? 0) + effect.amount;
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
    queueTownPortalChoice(state, action.playerId);
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

  // Xyron's Inferno: the chosen unit's space and every orthogonally adjacent
  // space — every unit in the blast, friend or foe — takes the flat damage.
  if (effect.type === "AREA_DAMAGE_ALL_ADJACENT" && target && state.combat) {
    const center = state.combat.units[target.unitId];
    if (center) {
      const inBlast = Object.values(state.combat.units).filter(
        (unit) =>
          isUnitAlive(unit) && (unit.id === center.id || isAdjacent(unit.position, center.position))
      );
      for (const unit of inBlast) {
        unit.damage += effect.amount;
        noteUnitDamagedForTokens(state, unit, effect.amount);
        appendEvent(state, {
          type: "DAMAGE_ASSIGNED",
          source: { type: "card", cardId: card.id, controllerId: action.playerId },
          target: { type: "unit", unitId: unit.id },
          amount: effect.amount,
          damageKind: "spell"
        });
        markUnitRemovedIfNeeded(state, unit);
      }
    }
  }

  // Gem's First Aid: take the war machine from the shared supply for free, or
  // draw the fallback card when the supply is empty (it was already taken).
  if (effect.type === "GAIN_WAR_MACHINE") {
    const supply = state.adventure?.warMachineSupply ?? [];
    if (state.adventure && supply.includes(effect.warMachineCardId)) {
      state.adventure.warMachineSupply = supply.filter((cardId) => cardId !== effect.warMachineCardId);
      state.players[action.playerId].hand.push(effect.warMachineCardId);
      appendEvent(state, {
        type: "WAR_MACHINE_BOUGHT",
        playerId: action.playerId,
        cardId: effect.warMachineCardId,
        cost: {},
        at: "factory"
      });
    } else if (effect.fallbackDrawCards) {
      drawCardsForPlayer(state, action.playerId, effect.fallbackDrawCards);
    }
  }

  if (playedToDiscard) {
    holdOngoingCardIfEffectCreated(state, action.playerId, action.cardId, effectCountBeforePlay, "discard");
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
function queueTownPortalChoice(state: GameState, playerId: PlayerId): void {
  const adventure = state.adventure;
  const hero = getMainHero(state, playerId);
  if (!adventure || !hero) {
    return;
  }

  const destinations: { label: string; spaceId: string }[] = [];
  for (const town of Object.values(state.towns)) {
    if (town.controllerId === playerId && town.fieldId && town.fieldId !== hero.spaceId) {
      destinations.push({ label: `Town (${town.factionId ?? town.id})`, spaceId: town.fieldId });
    }
  }
  for (const field of Object.values(adventure.fields)) {
    if (field.location === "settlement" && field.flagOwnerId === playerId && field.spaceId !== hero.spaceId) {
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
            steps: [{ type: "TELEPORT_HERO" as const, heroId: hero.id, spaceId: destination.spaceId }]
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

  // First Aid Tent: a single basic heal per round, OR an expert activation
  // (spend 1 expert use) that heals several times this round. Basic and expert
  // are mutually exclusive within a round.
  const player = state.players[action.playerId];
  const expertMax = healModifier.expertUsesPerRound ?? 0;
  const usage = effect.healRound?.round === combat.round ? effect.healRound : undefined;
  const mode = action.mode ?? "basic";

  if (mode === "expert") {
    if (usage || expertMax <= 1) {
      throw new Error("The First Aid Tent expert cannot be used this combat round.");
    }
    if (!player || !hasExpertUseAvailable(state, action.playerId)) {
      throw new Error("No expert uses are available this combat round.");
    }
    player.combatStats.expertUsesSpentThisRound += 1;
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
  combat.units[summoned.id] = summoned;
  return summoned;
}

/**
 * Pit Lords' "Summon Demons" other action: instead of moving or attacking, the
 * active Pit Lords either summon a Few of Demons onto an empty adjacent space
 * or reinforce a friendly Few of Demons up to a Pack — once per combat, only
 * after one of the controller's units has been removed this combat. The new /
 * reinforced unit also persists in the army after the combat. The summoned
 * unit is treated as already activated this round (it acts from the next).
 */
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
      unit.damage += 1;
      noteUnitDamagedForTokens(state, unit, 1);
      appendEvent(state, {
        type: "DAMAGE_ASSIGNED",
        source: { type: "system" },
        target: { type: "unit", unitId: unit.id },
        amount: 1,
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
  finishResolvedAttack(state, stackItem, details, candidate, cards);
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
        target.damage += choice.amount ?? 1;
        noteUnitDamagedForTokens(state, target, choice.amount ?? 1);
        appendEvent(state, {
          type: "DAMAGE_ASSIGNED",
          source: { type: "system" },
          target: { type: "unit", unitId: target.id },
          amount: choice.amount ?? 1,
          damageKind: "spell"
        });
        markUnitRemovedIfNeeded(state, target);
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
  } else if (!canUnitAttack(combat, attacker, defender)) {
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

  if (!openReactionWindowForTrigger(state, stackItem, attackDeclared, cards)) {
    resolveTopStack(state, cards);
  }
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
  attacker.position = action.destination;
  attacker.movedThisActivation = true;

  appendEvent(state, {
    type: "UNIT_MOVED",
    playerId: action.playerId,
    unitId: attacker.id,
    from,
    to: action.destination
  });

  declareAttack(state, action, cards);
}

function moveUnit(state: GameState, action: Extract<GameAction, { type: "MOVE_UNIT" }>): void {
  const combat = state.combat;
  const unit = combat?.units[action.unitId];
  if (!combat || !unit || unit.controllerId !== action.playerId || !canUnitMoveTo(combat, unit, action.destination, state)) {
    throw new Error("That unit cannot move to the selected space.");
  }

  const from = unit.position;
  unit.position = action.destination;
  unit.movedThisActivation = true;

  appendEvent(state, {
    type: "UNIT_MOVED",
    playerId: action.playerId,
    unitId: unit.id,
    from,
    to: action.destination
  });

  // Ranged units finish their activation with the move, whether it follows a
  // shot or replaces it — they can never attack after moving. Ground and
  // flying units stay active to attack an adjacent enemy or hold.
  if (unit.type === "ranged") {
    unit.activatedThisRound = true;
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
  for (const player of Object.values(state.players)) {
    player.combatStats.spellsCastThisRound = 0;
    player.combatStats.spellLimitBonusThisRound = 0;
    player.combatStats.expertUsesSpentThisRound = 0;
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
    appendEvent(state, {
      type: "UNIT_MOVED",
      playerId: unit.controllerId,
      unitId: unit.id,
      from,
      to: intent.destination
    });
    // Neutral fights pace one walk at a time: stop on the move so the table
    // sees it and clicks CONTINUE_NEUTRAL_STEP. The next guard acts only then.
    if (combat.context.kind === "neutral") {
      combat.pendingNeutralStep = { unitId: unit.id, name: unit.name, from, to: intent.destination };
      return;
    }
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

    // A neutral guard just walked: hold everything until the table clicks on.
    if (combat?.pendingNeutralStep) {
      break;
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
      if (active && isNeutralUnit(active) && !active.activatedThisRound && isUnitAlive(active)) {
        executeNeutralActivation(state, active, cards);
        continue;
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
  "DISCOVER_TILE",
  "PLACE_TILE",
  "SET_TILE_ROTATION",
  "MOVE_HERO_PATH",
  "RESOLVE_VISIT_STEP",
  "TRADE_RESOURCES",
  "PLACE_COMBAT_UNIT",
  "UNPLACE_COMBAT_UNIT",
  "FINISH_COMBAT_PLACEMENT",
  "CONTINUE_NEUTRAL_COMBAT",
  "RETREAT_FROM_COMBAT",
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
  "USE_TOWN_BUILDING",
  "SPEND_TOWN_CUBE",
  "HALL_OF_VALHALLA_BOOST",
  "ATTACK_FORTIFICATION"
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
        // Harpy fly-back lives in the combat reducer (it ends an activation);
        // every other option choice is handled by the adventure reducer.
        if (
          nextState.pendingChoice?.type === "OPTION_CHOICE" &&
          nextState.pendingChoice.context === "combat-reposition"
        ) {
          resolveCombatReposition(nextState, action);
        } else {
          chooseOption(nextState, action);
        }
        break;
      case "RESOLVE_COMBAT_DISCARD":
        resolveMagiDiscard(nextState, action, cards);
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
    }
  } catch (error) {
    return fail(state, {
      code: "ACTION_NOT_LEGAL",
      message: error instanceof Error ? error.message : "The action could not be applied."
    });
  }

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

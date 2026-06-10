import { sampleCards } from "@/data/cards/sample";
import { sampleBuildings } from "@/data/towns/buildings";
import { ATTACK_DIE_FACES } from "./battlefield";
import { createSeededRandom } from "./random";
import {
  expireEffectsForCombatEnd,
  expireEffectsForCombatRoundEnd,
  expireEffectsForTurnEnd,
  getActiveAttackBonus,
  getActiveDefenseBonus,
  getAttackRerollEffects,
  makeActiveEffect
} from "./active-effects";
import { appendEvent } from "./events";
import { drawCardsForPlayer, isSharedDeckId } from "./decks";
import { getEffectAmount, getEffectiveCardEffect, getSpellDamageAmount } from "./effects";
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
  isUnitAlive
} from "./legal-actions";
import { getPostAttackAbilityDamageEffects, getUnitAbilityDefinitions, hasUnitAbilityEffect } from "./unit-abilities";
import type {
  ActiveEffectDefinition,
  ActiveEffectState,
  AttackRollCandidate,
  AttackRollMode,
  BuildingLibrary,
  CardDefinition,
  CardLibrary,
  CombatState,
  CombatUnitState,
  EngineResult,
  GameAction,
  GameEvent,
  GameState,
  LegalAction,
  PlayerId,
  PendingChoice,
  ResourceCost,
  ResourceKind,
  ResolutionStackItem,
  RulesError,
  UnitId
} from "./state";

type ReducerOptions = {
  cards?: CardLibrary;
  buildings?: BuildingLibrary;
};

function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

function ok(state: GameState, startEventCount: number): EngineResult {
  return {
    state,
    events: state.eventLog.slice(startEventCount),
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
    return {
      type: "PLAY_REACTION",
      playerId: action.playerId,
      cardId: action.cardId,
      mode: action.mode ?? "basic",
      ...(action.optionIndex !== undefined ? { optionIndex: action.optionIndex } : {})
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

  for (const play of action.plays) {
    const singleAction: GameAction = {
      type: "PLAY_REACTION",
      playerId: action.playerId,
      cardId: play.cardId,
      mode: play.mode ?? "basic",
      ...(play.optionIndex !== undefined ? { optionIndex: play.optionIndex } : {})
    };

    if (!legalActions.some((legal) => actionsMatch(legal.action, singleAction))) {
      return {
        code: "ACTION_NOT_LEGAL",
        message: `${cards[play.cardId]?.name ?? play.cardId} is not a legal reaction right now.`
      };
    }

    const card = cards[play.cardId];
    const effect = card ? getEffectiveCardEffect(card, play.optionIndex) : null;
    if (!effect || effect.type === "CANCEL_SPELL" || effect.type === "RECALL_SPELL") {
      return {
        code: "ACTION_NOT_LEGAL",
        message: "Spell-ending and recall cards must be played on their own."
      };
    }

    const copiesLeft = handCounts.get(play.cardId) ?? 0;
    if (copiesLeft <= 0) {
      return {
        code: "CARD_NOT_IN_HAND",
        message: `Not enough copies of ${card?.name ?? play.cardId} in hand for that batch.`
      };
    }
    handCounts.set(play.cardId, copiesLeft - 1);

    if ((play.mode ?? "basic") === "expert") {
      expertUsesNeeded += 1;
    }
  }

  const expertUsesAvailable = player
    ? player.limits.expertUses - player.combatStats.expertUsesSpentThisRound
    : 0;
  if (expertUsesNeeded > expertUsesAvailable) {
    return {
      code: "ACTION_NOT_LEGAL",
      message: "Not enough crowns for that many expert plays this combat round."
    };
  }

  return null;
}

function moveCardFromHandToDiscard(state: GameState, playerId: PlayerId, cardId: string): RulesError | null {
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
  player.discard.push(cardId);
  return null;
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
  return Boolean(player && player.combatStats.expertUsesSpentThisRound < player.limits.expertUses);
}

function markUnitRemovedIfNeeded(state: GameState, unit: CombatUnitState): void {
  if (unit.damage < unit.maxHealth) {
    return;
  }

  appendEvent(state, {
    type: "UNIT_REMOVED",
    unitId: unit.id,
    playerId: unit.controllerId
  });
}

function appendExpiredEffectEvents(
  state: GameState,
  effects: ActiveEffectState[],
  reason: "combat-round-ended" | "turn-ended" | "combat-ended"
): void {
  for (const effect of effects) {
    appendEvent(state, {
      type: "ACTIVE_EFFECT_EXPIRED",
      effectId: effect.id,
      reason
    });
  }
}

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
  playerId: PlayerId,
  mode: "basic" | "expert",
  target?: { type: "unit"; unitId: UnitId }
): void {
  if (card.effect.type !== "CREATE_ACTIVE_EFFECT") {
    return;
  }

  const effectDefinition = mode === "expert" ? (card.effect.expertEffect ?? card.effect.effect) : card.effect.effect;
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

function createAttackBuffFromCard(
  state: GameState,
  card: CardDefinition,
  playerId: PlayerId,
  power: number,
  target: { type: "unit"; unitId: UnitId }
): void {
  if (card.effect.type !== "CREATE_ATTACK_BUFF") {
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

function livingControllerIds(combat: CombatState): Set<PlayerId> {
  return new Set(
    Object.values(combat.units)
      .filter(isUnitAlive)
      .map((unit) => unit.controllerId)
  );
}

function finishCombatIfNeeded(state: GameState): boolean {
  const combat = state.combat;
  if (!combat || combat.outcome) {
    return Boolean(combat?.outcome);
  }

  const livingControllers = livingControllerIds(combat);
  const attackerAlive = livingControllers.has(combat.attackerPlayerId);
  const defenderAlive = livingControllers.has(combat.defenderPlayerId);

  if (attackerAlive === defenderAlive) {
    return false;
  }

  const winnerPlayerId = attackerAlive ? combat.attackerPlayerId : combat.defenderPlayerId;
  const defeatedPlayerId = attackerAlive ? combat.defenderPlayerId : combat.attackerPlayerId;
  const reason = "all-enemy-units-defeated";

  combat.outcome = {
    winnerPlayerId,
    defeatedPlayerId,
    reason
  };
  appendExpiredEffectEvents(state, expireEffectsForCombatEnd(state), "combat-ended");
  combat.activeUnitId = null;
  state.phase = "game-over";
  state.activePlayerId = winnerPlayerId;
  state.priorityPlayerId = null;

  appendEvent(state, {
    type: "COMBAT_ENDED",
    winnerPlayerId,
    defeatedPlayerId,
    reason
  });

  return true;
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
  defenseBonus: number
): { attackValue: number; defenseValue: number; damage: number } {
  const attackValue = Math.max(0, attacker.attack + attackBonus + roll);
  const defenseValue = defender.defense + (defender.defenseToken ? 1 : 0) + defenseBonus;
  const damage = Math.max(0, attackValue - defenseValue);

  return {
    attackValue,
    defenseValue,
    damage
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
  candidate: AttackRollCandidate
): { damage: number; roll: number } {
  if (!state.combat) {
    return { damage: 0, roll: 0 };
  }

  const { attackValue, defenseValue, damage } = getAttackDamagePreview(
    attacker,
    defender,
    candidate.roll,
    attackBonus,
    defenseBonus
  );

  defender.damage = Math.min(defender.maxHealth, defender.damage + damage);

  appendEvent(state, {
    type: "ATTACK_ROLLED",
    attackerId: attacker.id,
    defenderId: defender.id,
    rolls: candidate.rolls,
    roll: candidate.roll,
    rollMode,
    attackBonus,
    defenseBonus,
    attackValue,
    defenseValue,
    damage,
    isRetaliation
  });

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

  markUnitRemovedIfNeeded(state, defender);
  return { damage, roll: candidate.roll };
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

    const assignedDamage = Math.min(effect.amount, target.maxHealth - target.damage);
    target.damage = Math.min(target.maxHealth, target.damage + effect.amount);

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
  const rollMode = triggerEvent?.rollMode ?? getAttackRollMode(attacker, defender);
  const activeAttackBonus = getActiveAttackBonus(state, {
    attacker,
    defender,
    attackKind
  });
  const activeDefenseBonus = getActiveDefenseBonus(state, defender);

  return {
    attacker,
    defender,
    isRetaliation,
    attackKind,
    rollMode,
    attackBonus: stackItem.modifiers.attackBonus + activeAttackBonus,
    defenseBonus: stackItem.modifiers.defenseBonus + activeDefenseBonus
  };
}

function getRerollUsesForEffects(effects: ActiveEffectState[]): number {
  return effects.reduce((total, effect) => {
    const bestModifier = effect.modifiers
      .filter((modifier) => modifier.type === "ATTACK_DIE_REROLL")
      .reduce((best, modifier) => Math.max(best, modifier.maxUsesPerRoll), 0);

    return Math.max(total, bestModifier);
  }, 0);
}

function openAttackRerollChoice(
  state: GameState,
  stackItem: ResolutionStackItem,
  details: NonNullable<ReturnType<typeof getAttackStackDetails>>,
  candidate: AttackRollCandidate,
  rerollEffects: ActiveEffectState[]
): void {
  const choiceId = `choice_${state.eventLog.length + 1}`;
  const remainingRerolls = getRerollUsesForEffects(rerollEffects);
  const sourceEffectIds = rerollEffects.map((effect) => effect.id);

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
  for (const effectId of choice.sourceEffectIds) {
    const effect = state.activeEffects.find((candidate) => candidate.id === effectId);
    if (!effect) {
      continue;
    }

    effect.usedChoiceIds.push(choice.id);
    effect.usedRollEventIds.push(choice.id);
  }

  const consumedEffectIds = new Set(
    state.activeEffects
      .filter((effect) => choice.sourceEffectIds.includes(effect.id))
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

function finishResolvedAttack(
  state: GameState,
  stackItem: ResolutionStackItem,
  details: NonNullable<ReturnType<typeof getAttackStackDetails>>,
  candidate: AttackRollCandidate,
  cards: CardLibrary
): void {
  const attackResult = applyAttackDamageFromCandidate(
    state,
    details.attacker,
    details.defender,
    details.isRetaliation,
    details.rollMode,
    details.attackBonus,
    details.defenseBonus,
    candidate
  );
  applyPostAttackAbilityDamage(
    state,
    details.attacker,
    details.defender,
    details.attackKind,
    attackResult.roll,
    attackResult.damage
  );

  if (details.isRetaliation) {
    details.attacker.retaliatedThisRound = true;
  } else {
    details.attacker.attackedThisActivation = true;
  }

  stackItem.status = "resolved";
  state.stack.pop();

  if (finishCombatIfNeeded(state)) {
    return;
  }

  // A ranged unit that shoots (a true ranged attack never provokes retaliation)
  // may still spend its move to reposition afterwards, as long as it has not
  // already moved this activation and a legal destination exists.
  const combat = state.combat;
  const canRangedReposition =
    !details.isRetaliation &&
    details.attackKind === "ranged" &&
    Boolean(combat) &&
    isUnitAlive(details.attacker) &&
    !details.attacker.movedThisActivation &&
    combat !== null &&
    getLegalMoveDestinations(combat, details.attacker, state).length > 0;

  if (!details.isRetaliation && !canRangedReposition) {
    details.attacker.activatedThisRound = true;
  }

  if (!details.isRetaliation && shouldRetaliate(details.attacker, details.defender, details.attackKind)) {
    openRetaliationWindow(state, details.attacker, details.defender, cards);
    return;
  }

  if (canRangedReposition) {
    // Keep the shooter active so the player may move it after firing.
    state.phase = "combat";
    state.priorityPlayerId = null;
    return;
  }

  advanceActiveUnit(state);
  state.phase = "combat";
  state.priorityPlayerId = null;
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
  state.activePlayerId = activeUnit.controllerId;
  activeUnit.movedThisActivation = false;
  activeUnit.attackedThisActivation = false;

  if (activeUnit.defenseToken) {
    activeUnit.defenseToken = false;
  }

  appendEvent(state, {
    type: "UNIT_ACTIVATION_STARTED",
    unitId: activeUnit.id,
    playerId: activeUnit.controllerId
  });
}

function advanceActiveUnit(state: GameState): void {
  if (!state.combat) {
    return;
  }

  setActiveUnit(state, getNextUnitToActivate(state.combat)?.id ?? null);
}

function resetCombatRound(combat: CombatState): void {
  for (const unit of Object.values(combat.units)) {
    unit.activatedThisRound = false;
    unit.movedThisActivation = false;
    unit.attackedThisActivation = false;
    unit.retaliatedThisRound = false;
    unit.defenseToken = false;
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
  if (stackItem.action.type !== "CAST_SPELL") {
    return 0;
  }

  const card = cards[stackItem.action.cardId];
  return (card?.power ?? 0) + stackItem.modifiers.spellPowerBonus;
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
    !attacker.abilities.includes("ignores-retaliation") &&
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
  const rollMode = getAttackRollMode(defender, attacker);
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

  const candidate = rollAttackCandidate(combat, details.rollMode);
  const rerollEffects = getAttackRerollEffects(state, {
    attacker: details.attacker,
    defender: details.defender,
    attackKind: details.attackKind
  }).filter((effect) => !effect.usedChoiceIds.includes(stackItem.id));

  if (rerollEffects.length > 0) {
    openAttackRerollChoice(state, stackItem, details, candidate, rerollEffects);
    return;
  }

  finishResolvedAttack(state, stackItem, details, candidate, cards);
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
    if (card?.effect.type === "DEAL_DAMAGE" && state.combat && stackItem.action.target.type === "unit") {
      const target = state.combat.units[stackItem.action.target.unitId];
      if (target) {
        const power = getCurrentSpellPower(stackItem, cards);
        const amount = getSpellDamageAmount(card, power);
        target.damage = Math.min(target.maxHealth, target.damage + amount);
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
        stackItem.action.playerId,
        "basic",
        stackItem.action.target.type === "unit" ? stackItem.action.target : undefined
      );
    }

    if (card?.effect.type === "CREATE_ATTACK_BUFF" && stackItem.action.target.type === "unit") {
      createAttackBuffFromCard(
        state,
        card,
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

    appendEvent(state, {
      type: "SPELL_CAST_RESOLVED",
      playerId: stackItem.action.playerId,
      spellCardId: stackItem.action.cardId,
      target: stackItem.action.target,
      power: getCurrentSpellPower(stackItem, cards)
    });

    stackItem.status = "resolved";
    state.stack.pop();

    if (finishCombatIfNeeded(state)) {
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

  const moveError = moveCardFromHandToDiscard(state, action.playerId, action.cardId);
  if (moveError) {
    throw new Error(moveError.message);
  }

  state.players[action.playerId].combatStats.spellsCastThisRound += 1;

  const stackItem = makeStackItem(state, action);
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
 * Applies one instant card inside the open reaction window: pays costs,
 * discards the card, and applies the effect to the pending stack item.
 * Returns whether the play ended the window (spell-cancel).
 */
function applyReactionPlayCore(
  state: GameState,
  playerId: PlayerId,
  play: { cardId: string; mode?: "basic" | "expert"; optionIndex?: number },
  cards: CardLibrary
): { windowEnded: boolean } {
  if (!state.reactionWindow) {
    throw new Error("No reaction window is open.");
  }

  const card = cards[play.cardId];
  if (!card) {
    throw new Error(`Unknown reaction card ${play.cardId}.`);
  }

  const effect = getEffectiveCardEffect(card, play.optionIndex);
  if (!effect) {
    throw new Error(`${card.name} needs a chosen option.`);
  }

  const mode = play.mode ?? "basic";
  if (mode === "expert") {
    if (!effectSupportsExpertPlay(effect)) {
      throw new Error(`${card.name} does not have an expert effect.`);
    }

    if (!hasExpertUseAvailable(state, playerId)) {
      throw new Error("No expert uses are available this combat round.");
    }
  }

  const stackItem = state.stack.at(-1);

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

  const moveError = moveCardFromHandToDiscard(state, playerId, play.cardId);
  if (moveError) {
    throw new Error(moveError.message);
  }

  const effectAmount = getEffectAmount(effect, mode);
  if (mode === "expert") {
    state.players[playerId].combatStats.expertUsesSpentThisRound += 1;
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
    state.stack.pop();

    closeReactionWindow(state, "reaction-played");
    if (!finishCombatIfNeeded(state)) {
      state.phase = "combat";
    }
    return { windowEnded: true };
  }

  if (effect.type === "ADD_SPELL_POWER" && stackItem?.action.type === "CAST_SPELL") {
    stackItem.modifiers.spellPowerBonus += effectAmount;
    stackItem.modifiers.playedCardIds.push(play.cardId);
  }

  if (
    effect.type === "ADD_COMBAT_STAT" &&
    (stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT")
  ) {
    if (effect.stat === "attack") {
      stackItem.modifiers.attackBonus += effectAmount;
    } else {
      stackItem.modifiers.defenseBonus += effectAmount;
    }
    stackItem.modifiers.playedCardIds.push(play.cardId);
  }

  if (effect.type === "CREATE_ACTIVE_EFFECT") {
    createActiveEffectFromCard(state, card, playerId, mode);
    stackItem?.modifiers.playedCardIds.push(play.cardId);
  }

  if (effect.type === "DRAW_CARDS") {
    drawCardsForPlayer(state, playerId, effectAmount);
    stackItem?.modifiers.playedCardIds.push(play.cardId);
  }

  if (effect.type === "RECALL_SPELL" && stackItem?.action.type === "CAST_SPELL") {
    const player = state.players[playerId];
    const spellCardId = stackItem.action.cardId;
    const discardIndex = player.discard.lastIndexOf(spellCardId);

    if (discardIndex !== -1) {
      player.discard.splice(discardIndex, 1);
    }

    if (!player.hand.includes(spellCardId)) {
      player.hand.push(spellCardId);
    }

    if (mode === "expert") {
      player.combatStats.spellLimitBonusThisRound += effect.expertSpellLimitBonus ?? 0;
    }

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

function playReaction(
  state: GameState,
  action: Extract<GameAction, { type: "PLAY_REACTION" }>,
  cards: CardLibrary
): void {
  const { windowEnded } = applyReactionPlayCore(state, action.playerId, action, cards);
  if (windowEnded) {
    return;
  }

  advanceReactionWindowAfterPlay(state, action.playerId, cards);
}

function playReactions(
  state: GameState,
  action: Extract<GameAction, { type: "PLAY_REACTIONS" }>,
  cards: CardLibrary
): void {
  // Batch legality (validated up front) excludes window-ending effects, so
  // every play lands in the same window before priority moves on once.
  for (const play of action.plays) {
    applyReactionPlayCore(state, action.playerId, play, cards);
  }

  advanceReactionWindowAfterPlay(state, action.playerId, cards);
}

function playCard(state: GameState, action: Extract<GameAction, { type: "PLAY_CARD" }>, cards: CardLibrary): void {
  const card = cards[action.cardId];
  if (!card) {
    throw new Error(`Unknown card ${action.cardId}.`);
  }

  const effect = getEffectiveCardEffect(card, action.optionIndex);
  if (!effect) {
    throw new Error(`${card.name} needs a chosen option.`);
  }

  const mode = action.mode ?? "basic";
  if (mode === "expert" && !hasExpertUseAvailable(state, action.playerId)) {
    throw new Error("No expert uses are available this combat round.");
  }

  const moveError = moveCardFromHandToDiscard(state, action.playerId, action.cardId);
  if (moveError) {
    throw new Error(moveError.message);
  }

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
      getSpellDamageAmount(card, card.power ?? 0)
    );
  }

  if (effect.type === "HEAL_DAMAGE_AND_REMOVE_EFFECTS" && target) {
    const source = {
      type: "card" as const,
      cardId: card.id,
      controllerId: action.playerId
    };
    healUnitDamage(state, source, target, getSpellDamageAmount(card, card.power ?? 0));
    removeEffectsFromTarget(state, source, target, effect.removePolarity);
  }

  if (effect.type === "CREATE_ACTIVE_EFFECT") {
    createActiveEffectFromCard(state, card, action.playerId, mode, target);
  }

  if (effect.type === "CREATE_ATTACK_BUFF" && target) {
    createAttackBuffFromCard(state, card, action.playerId, card.power ?? 0, target);
  }

  if (effect.type === "CREATE_DEFENSE_BUFF" && target) {
    createDefenseBuffFromCard(state, card, action.playerId, card.power ?? 0, target);
  }

  if (effect.type === "CREATE_ATTACK_DIE_REROLL") {
    createAttackRerollEffectFromCard(state, card, action.playerId, mode);
  }

  if (effect.type === "DRAW_CARDS") {
    drawCardsForPlayer(state, action.playerId, getEffectAmount(effect, mode));
  }

  state.phase = "combat";
  state.priorityPlayerId = null;
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

  if (effect.usedCombatRoundNumbers.includes(combat.round)) {
    throw new Error("That active effect has already been used this combat round.");
  }

  const healModifier = effect.modifiers.find((modifier) => modifier.type === "HEAL_ONCE_PER_COMBAT_ROUND");
  const target = combat.units[action.target.unitId];
  if (!healModifier || !target || target.controllerId !== action.playerId || !isUnitAlive(target) || target.damage <= 0) {
    throw new Error("That active effect target is not legal.");
  }

  healUnitDamage(
    state,
    effect.source,
    action.target,
    healModifier.amount
  );
  effect.usedCombatRoundNumbers.push(combat.round);

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
    target.controllerId !== action.playerId ||
    unit.activatedThisRound ||
    unit.movedThisActivation ||
    ability?.implementationStatus !== "implemented" ||
    ability.effect?.type !== "ACTIVATION_ATTACK_BUFF" ||
    !ability.effect.targetTypes.includes(target.type)
  ) {
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

  if (choice.remainingRerolls <= 0) {
    throw new Error("No rerolls remain for that choice.");
  }

  const candidate = rollAttackCandidate(combat, choice.rollMode);
  choice.candidates.push(candidate);
  choice.remainingRerolls -= 1;

  appendEvent(state, {
    type: "ATTACK_REROLLED",
    choiceId: choice.id,
    playerId: action.playerId,
    rolls: candidate.rolls,
    roll: candidate.roll,
    remainingRerolls: choice.remainingRerolls
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

  const attacker = combat.units[action.attackerId];
  const defender = combat.units[action.defenderId];
  if (!attacker || !defender || !canUnitAttack(combat, attacker, defender)) {
    throw new Error("That unit cannot attack the selected target.");
  }

  const stackItem = makeStackItem(state, action);
  state.stack.push(stackItem);

  const attackKind = getAttackKind(attacker, defender);
  const rollMode = getAttackRollMode(attacker, defender);
  const attackDeclared = appendEvent(state, {
    type: "UNIT_ATTACK_DECLARED",
    playerId: action.playerId,
    attackerId: attacker.id,
    defenderId: defender.id,
    isRetaliation,
    attackKind,
    rollMode
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

  // If the unit already fired this activation (a ranged unit repositioning after
  // shooting), the move spends the rest of its activation.
  if (unit.attackedThisActivation) {
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

function endCombatRound(state: GameState, action: Extract<GameAction, { type: "END_COMBAT_ROUND" }>): void {
  if (!state.combat) {
    throw new Error("Combat is not active.");
  }

  const finishedRound = state.combat.round;
  state.combat.round += 1;
  resetCombatRound(state.combat);
  appendExpiredEffectEvents(state, expireEffectsForCombatRoundEnd(state, finishedRound), "combat-round-ended");
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

  const nextUnit = getNextUnitToActivate(state.combat);
  appendEvent(state, {
    type: "COMBAT_ROUND_STARTED",
    round: state.combat.round,
    activeUnitId: nextUnit?.id ?? null
  });

  setActiveUnit(state, nextUnit?.id ?? null);
  state.activePlayerId = action.playerId;
  if (nextUnit) {
    state.activePlayerId = nextUnit.controllerId;
  }
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

  const choiceId = `choice_${state.eventLog.length + 1}`;
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

function resolveDeckSearch(
  state: GameState,
  action: Extract<GameAction, { type: "RESOLVE_DECK_SEARCH" }>
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

  if (action.pick.kind === "discard-top") {
    if (!choice.canTakeDiscardTop) {
      throw new Error("The discard pile is empty.");
    }

    const takenCardId = deck.discardPile.pop();
    if (!takenCardId) {
      throw new Error("The discard pile is empty.");
    }

    player.hand.push(takenCardId);
    discardedCardIds = [...choice.revealedCardIds];
  } else {
    const keptCardId = choice.revealedCardIds[action.pick.index];
    if (!keptCardId) {
      throw new Error("That revealed card is not available.");
    }

    player.hand.push(keptCardId);
    const keptIndex = action.pick.index;
    discardedCardIds = choice.revealedCardIds.filter((_, index) => index !== keptIndex);
  }

  deck.discardPile.push(...discardedCardIds);

  appendEvent(state, {
    type: "DECK_SEARCH_RESOLVED",
    playerId: action.playerId,
    deckId: choice.deckId,
    choiceId: choice.id,
    pick: action.pick.kind,
    discardedCardIds
  });

  state.pendingChoice = null;
  state.phase = choice.returnPhase;
  state.priorityPlayerId = null;
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
  appendExpiredEffectEvents(state, expireEffectsForTurnEnd(state, action.playerId), "turn-ended");
  const nextPlayer = nextPlayerId(state, action.playerId);
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

export function applyAction(state: GameState, action: GameAction, options: ReducerOptions = {}): EngineResult {
  const cards = options.cards ?? sampleCards;
  const buildings = options.buildings ?? sampleBuildings;
  const legalError = assertLegal(state, action, cards, buildings);
  if (legalError) {
    return fail(state, legalError);
  }

  const nextState = cloneState(state);
  const startEventCount = nextState.eventLog.length;

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
        buildStructure(nextState, action, buildings);
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
      case "SEARCH_DECK":
        searchDeck(nextState, action);
        break;
      case "RESOLVE_DECK_SEARCH":
        resolveDeckSearch(nextState, action);
        break;
      case "MOVE_HERO":
        moveHero(nextState, action);
        break;
      case "END_TURN":
        endTurn(nextState, action);
        break;
    }
  } catch (error) {
    return fail(state, {
      code: "ACTION_NOT_LEGAL",
      message: error instanceof Error ? error.message : "The action could not be applied."
    });
  }

  return ok(nextState, startEventCount);
}

export function findEvent<T extends GameEvent["type"]>(
  state: GameState,
  type: T
): Extract<GameEvent, { type: T }> | undefined {
  return state.eventLog.find((event): event is Extract<GameEvent, { type: T }> => event.type === type);
}

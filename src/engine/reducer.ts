import { sampleCards } from "@/data/cards/sample";
import { sampleBuildings } from "@/data/towns/buildings";
import {
  expireEffectsForCombatEnd,
  expireEffectsForCombatRoundEnd,
  expireEffectsForTurnEnd,
  getActiveAttackBonus,
  makeActiveEffect
} from "./active-effects";
import { appendEvent } from "./events";
import { getCardEffectAmount, getSpellDamageAmount } from "./effects";
import {
  canUnitAttack,
  canUnitMoveAndAttack,
  canUnitMoveTo,
  canPlayerBuildStructure,
  getAttackKind,
  getAttackRollMode,
  getLegalActions,
  getLegalReactionsForTrigger,
  getNextUnitToActivate,
  isAdjacent,
  isUnitAlive
} from "./legal-actions";
import { getPostAttackAbilityDamageEffects, hasUnitAbilityEffect } from "./unit-abilities";
import type {
  ActiveEffectState,
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
  if (action.type === "PLAY_REACTION" && !action.mode) {
    return {
      ...action,
      mode: "basic"
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
  const roll = combat.attackDie[combat.attackDieIndex % combat.attackDie.length] ?? 0;
  combat.attackDieIndex += 1;
  return roll;
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
  const activeEffect = makeActiveEffect(
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
  state.activeEffects.push(activeEffect);

  appendEvent(state, {
    type: "ACTIVE_EFFECT_CREATED",
    effectId: activeEffect.id,
    controllerId: playerId,
    name: activeEffect.name,
    duration: activeEffect.duration
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

function applyAttackDamage(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  isRetaliation: boolean,
  rollMode: AttackRollMode,
  attackBonus: number,
  defenseBonus: number
): { damage: number; roll: number } {
  if (!state.combat) {
    return { damage: 0, roll: 0 };
  }

  const { rolls, selectedRoll } = rollAttackDice(state.combat, rollMode);
  const attackValue = Math.max(0, attacker.attack + attackBonus + selectedRoll);
  const defenseValue = defender.defense + (defender.defenseToken ? 1 : 0) + defenseBonus;
  const damage = Math.max(0, attackValue - defenseValue);

  defender.damage = Math.min(defender.maxHealth, defender.damage + damage);

  appendEvent(state, {
    type: "ATTACK_ROLLED",
    attackerId: attacker.id,
    defenderId: defender.id,
    rolls,
    roll: selectedRoll,
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
  return { damage, roll: selectedRoll };
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
  if (!combat || (stackItem.action.type !== "ATTACK_UNIT" && stackItem.action.type !== "MOVE_AND_ATTACK_UNIT")) {
    return;
  }

  const attacker = combat.units[stackItem.action.attackerId];
  const defender = combat.units[stackItem.action.defenderId];
  if (!attacker || !defender) {
    return;
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

  const attackResult = applyAttackDamage(
    state,
    attacker,
    defender,
    isRetaliation,
    rollMode,
    stackItem.modifiers.attackBonus + activeAttackBonus,
    stackItem.modifiers.defenseBonus
  );
  applyPostAttackAbilityDamage(state, attacker, defender, attackKind, attackResult.roll, attackResult.damage);

  if (isRetaliation) {
    attacker.retaliatedThisRound = true;
  } else {
    attacker.activatedThisRound = true;
  }

  stackItem.status = "resolved";
  state.stack.pop();

  if (finishCombatIfNeeded(state)) {
    return;
  }

  if (!isRetaliation && shouldRetaliate(attacker, defender, attackKind)) {
    openRetaliationWindow(state, attacker, defender, cards);
    return;
  }

  advanceActiveUnit(state);
  state.phase = "combat";
  state.priorityPlayerId = null;
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
    if (card?.effect.type === "DEAL_DAMAGE" && state.combat) {
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

    if (card?.effect.type === "HEAL_DAMAGE" && state.combat) {
      const target = state.combat.units[stackItem.action.target.unitId];
      if (target) {
        const power = getCurrentSpellPower(stackItem, cards);
        const amount = getSpellDamageAmount(card, power);
        const healedAmount = Math.min(amount, target.damage);
        target.damage = Math.max(0, target.damage - amount);
        appendEvent(state, {
          type: "DAMAGE_HEALED",
          source: {
            type: "card",
            cardId: card.id,
            controllerId: stackItem.action.playerId
          },
          target: stackItem.action.target,
          amount: healedAmount
        });
      }
    }

    if (card?.effect.type === "CREATE_ACTIVE_EFFECT") {
      createActiveEffectFromCard(state, card, stackItem.action.playerId, "basic", stackItem.action.target);
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

function playReaction(
  state: GameState,
  action: Extract<GameAction, { type: "PLAY_REACTION" }>,
  cards: CardLibrary
): void {
  if (!state.reactionWindow) {
    throw new Error("No reaction window is open.");
  }

  const card = cards[action.cardId];
  if (!card) {
    throw new Error(`Unknown reaction card ${action.cardId}.`);
  }

  const mode = action.mode ?? "basic";
  if (mode === "expert") {
    if (
      (card.effect.type !== "ADD_COMBAT_STAT" && card.effect.type !== "ADD_SPELL_POWER") ||
      ("expertAmount" in card.effect && card.effect.expertAmount === undefined)
    ) {
      if (card.effect.type !== "CREATE_ACTIVE_EFFECT" || !card.effect.expertEffect) {
        throw new Error(`${card.name} does not have an expert effect.`);
      }
    }

    if (!hasExpertUseAvailable(state, action.playerId)) {
      throw new Error("No expert uses are available this combat round.");
    }
  }

  const moveError = moveCardFromHandToDiscard(state, action.playerId, action.cardId);
  if (moveError) {
    throw new Error(moveError.message);
  }

  const effectAmount = getCardEffectAmount(card, mode);
  if (mode === "expert") {
    state.players[action.playerId].combatStats.expertUsesSpentThisRound += 1;
  }

  appendEvent(state, {
    type: "CARD_PLAYED",
    playerId: action.playerId,
    cardId: action.cardId,
    timing: card.timing,
    mode,
    effectAmount: effectAmount || undefined
  });

  const stackItem = state.stack.at(-1);
  if (card.effect.type === "CANCEL_SPELL" && stackItem?.action.type === "CAST_SPELL") {
    stackItem.status = "cancelled";
    appendEvent(state, {
      type: "SPELL_CAST_CANCELLED",
      playerId: stackItem.action.playerId,
      spellCardId: stackItem.action.cardId,
      cancelledByPlayerId: action.playerId,
      cancelledByCardId: action.cardId
    });
    state.stack.pop();

    closeReactionWindow(state, "reaction-played");
    if (finishCombatIfNeeded(state)) {
      return;
    }
    state.phase = "combat";
    return;
  }

  if (card.effect.type === "ADD_SPELL_POWER" && stackItem?.action.type === "CAST_SPELL") {
    stackItem.modifiers.spellPowerBonus += effectAmount;
    stackItem.modifiers.playedCardIds.push(action.cardId);
  }

  if (
    card.effect.type === "ADD_COMBAT_STAT" &&
    (stackItem?.action.type === "ATTACK_UNIT" || stackItem?.action.type === "MOVE_AND_ATTACK_UNIT")
  ) {
    if (card.effect.stat === "attack") {
      stackItem.modifiers.attackBonus += effectAmount;
    } else {
      stackItem.modifiers.defenseBonus += effectAmount;
    }
    stackItem.modifiers.playedCardIds.push(action.cardId);
  }

  if (card.effect.type === "CREATE_ACTIVE_EFFECT") {
    createActiveEffectFromCard(state, card, action.playerId, mode);
    stackItem?.modifiers.playedCardIds.push(action.cardId);
  }

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
  const currentIndex = allowedPlayerIds.indexOf(action.playerId);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % allowedPlayerIds.length;
  state.reactionWindow.priorityPlayerId = allowedPlayerIds[nextIndex];
  state.priorityPlayerId = allowedPlayerIds[nextIndex];
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
    !canUnitMoveAndAttack(combat, attacker, action.destination, defender)
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
  if (!combat || !unit || unit.controllerId !== action.playerId || !canUnitMoveTo(combat, unit, action.destination)) {
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
      case "ATTACK_UNIT":
        attackUnit(nextState, action, cards);
        break;
      case "MOVE_AND_ATTACK_UNIT":
        moveAndAttackUnit(nextState, action, cards);
        break;
      case "MOVE_UNIT":
        moveUnit(nextState, action);
        break;
      case "DEFEND_UNIT":
        defendUnit(nextState, action);
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
      case "PASS_REACTION":
        passReaction(nextState, action, cards);
        break;
      case "PLAY_REACTION":
        playReaction(nextState, action, cards);
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

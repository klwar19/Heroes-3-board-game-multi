import {
  getBattlefieldLabel,
  sampleCards,
  type BuildingEffectDefinition,
  type CardDefinition,
  type GameAction,
  type GameEvent,
  type GameState,
  type ResourceCost,
  type ResourceKind,
  type TargetRef
} from "@/engine";

export function unitName(state: GameState, unitId: string): string {
  return state.combat?.units[unitId]?.name ?? unitId;
}

export function targetName(state: GameState, target: TargetRef): string {
  return target.type === "unit" ? unitName(state, target.unitId) : "no target";
}

export function cardName(cardId: string): string {
  return sampleCards[cardId]?.name ?? cardId;
}

export function playerName(state: GameState, playerId: string): string {
  return state.players[playerId]?.name ?? playerId;
}

export function titleCase(value: string): string {
  return value
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatDieFace(face: number): string {
  return `${face >= 0 ? "+" : ""}${face}`;
}

export function getCardMetaLabels(card: CardDefinition): string[] {
  const labels = [titleCase(card.kind)];

  if (card.kind === "spell") {
    if (card.spellLevel) {
      labels.push(`${titleCase(card.spellLevel)} spell`);
    }

    if (card.spellSchools?.length) {
      labels.push(card.spellSchools.map(titleCase).join("/"));
    }
  }

  if (card.kind === "artifact" && card.artifactTier) {
    labels.push(`${titleCase(card.artifactTier)} artifact`);
  }

  if (card.kind === "statistic" && card.statisticType) {
    labels.push(titleCase(card.statisticType));
  }

  if (card.kind === "ability" && card.abilityClass) {
    labels.push(titleCase(card.abilityClass));
  }

  labels.push(titleCase(card.timing));
  return Array.from(new Set(labels));
}

export function formatResourceName(resource: ResourceKind): string {
  if (resource === "buildingMaterials") {
    return "materials";
  }

  return resource;
}

export function formatCost(cost: ResourceCost): string {
  const parts = (Object.entries(cost) as [ResourceKind, number][])
    .filter(([, amount]) => amount > 0)
    .map(([resource, amount]) => `${amount} ${formatResourceName(resource)}`);

  return parts.length > 0 ? parts.join(", ") : "free";
}

function formatBuildingEffect(effect: BuildingEffectDefinition): string {
  if (effect.type === "GAIN_RESOURCE") {
    return `gain ${effect.amount} ${formatResourceName(effect.resource)}`;
  }

  if (effect.type === "ADD_EXPERT_USE_LIMIT") {
    return `expert limit +${effect.amount}`;
  }

  return "building effect";
}

export function formatEvent(event: GameEvent, state: GameState): string {
  switch (event.type) {
    case "GAME_CREATED":
      return event.message;
    case "COMBAT_ROUND_STARTED":
      return `Combat round ${event.round} started.`;
    case "UNIT_ACTIVATION_STARTED":
      return `${unitName(state, event.unitId)} activates.`;
    case "UNIT_ATTACK_DECLARED":
      return `${unitName(state, event.attackerId)} ${event.isRetaliation ? "retaliates against" : "attacks"} ${unitName(state, event.defenderId)} (${event.attackKind}${event.rollMode === "normal" ? "" : `, ${event.rollMode}`}).`;
    case "ATTACK_ROLLED":
      return `${event.isRetaliation ? "Retaliation" : "Attack"} roll ${event.rolls.map(formatDieFace).join("/")} -> ${formatDieFace(event.roll)}: ${event.attackValue} vs ${event.defenseValue}, ${event.damage} damage.`;
    case "PENDING_CHOICE_CREATED":
      return event.message;
    case "ATTACK_REROLLED":
      return `${playerName(state, event.playerId)} rerolls -> ${formatDieFace(event.roll)}.`;
    case "PENDING_CHOICE_RESOLVED":
      return `${playerName(state, event.playerId)} keeps roll option ${event.selectedIndex + 1}.`;
    case "RETALIATION_ATTACKED":
      return `${unitName(state, event.attackerId)} retaliates against ${unitName(state, event.defenderId)}.`;
    case "UNIT_MOVED":
      return `${unitName(state, event.unitId)} moves ${getBattlefieldLabel(event.from)} -> ${getBattlefieldLabel(event.to)}.`;
    case "UNIT_DEFENDED":
      return `${unitName(state, event.unitId)} takes defense.`;
    case "UNIT_ACTIVATION_ENDED":
      return `${unitName(state, event.unitId)} holds position.`;
    case "UNIT_REMOVED":
      return `${unitName(state, event.unitId)} is defeated.`;
    case "COMBAT_ROUND_ENDED":
      return `Combat round ${event.round} ends.`;
    case "COMBAT_ENDED":
      return `${playerName(state, event.winnerPlayerId)} wins the combat.`;
    case "TURN_ENDED":
      return `${playerName(state, event.playerId)} ends the turn.`;
    case "SPELL_CAST_STARTED":
      return `${playerName(state, event.playerId)} casts ${cardName(event.spellCardId)} at ${targetName(state, event.target)}.`;
    case "REACTION_WINDOW_OPENED":
      return `Instant window: ${playerName(state, event.priorityPlayerId)} may respond.`;
    case "REACTION_PASSED":
      return `${playerName(state, event.playerId)} passes.`;
    case "REACTION_WINDOW_CLOSED":
      return event.reason === "all-pass" ? "All players pass." : "The window closes.";
    case "CARD_PLAYED":
      return `${playerName(state, event.playerId)} plays ${cardName(event.cardId)}${event.optionLabel ? ` (${event.optionLabel})` : ""}${event.mode === "expert" ? " as expert" : ""}${event.effectAmount ? ` for ${event.effectAmount}` : ""}.`;
    case "CARDS_DRAWN":
      return `${playerName(state, event.playerId)} draws ${event.count} card${event.count === 1 ? "" : "s"}${event.reshuffledDiscard ? " after reshuffling the discard" : ""}.`;
    case "DECK_SEARCH_STARTED":
      return `${playerName(state, event.playerId)} searches the ${event.deckId} deck (${event.revealedCount} revealed).`;
    case "DECK_SEARCH_RESOLVED":
      return `${playerName(state, event.playerId)} keeps a ${event.deckId} card${event.pick === "discard-top" ? " from the discard" : ""}; ${event.discardedCardIds.length} discarded.`;
    case "HERO_MOVED":
      return `${playerName(state, event.playerId)} moves their hero ${event.from} -> ${event.to} (${event.movementLeft} movement left).`;
    case "SPELL_CAST_CANCELLED":
      return `${playerName(state, event.cancelledByPlayerId)} ends ${cardName(event.spellCardId)} with ${cardName(event.cancelledByCardId)}.`;
    case "DAMAGE_ASSIGNED":
      return `${event.amount} ${event.damageKind} damage to ${targetName(state, event.target)}.`;
    case "DAMAGE_HEALED":
      return `${event.amount} damage removed from ${targetName(state, event.target)}.`;
    case "ACTIVE_EFFECTS_REMOVED":
      return `${event.effectIds.length} effect${event.effectIds.length === 1 ? "" : "s"} removed from ${targetName(state, event.target)}.`;
    case "SPELL_CAST_RESOLVED":
      return `${cardName(event.spellCardId)} resolves at power ${event.power}.`;
    case "UNIT_ABILITY_TRIGGERED":
      return event.message;
    case "STRUCTURE_BUILT":
      return `${playerName(state, event.playerId)} builds ${event.buildingId} for ${formatCost(event.cost)}.`;
    case "BUILDING_EFFECT_APPLIED":
      return `${event.buildingId}: ${formatBuildingEffect(event.effect)}.`;
    case "ACTIVE_EFFECT_CREATED":
      return `${event.name} is active.`;
    case "ACTIVE_EFFECT_USED":
      return `${playerName(state, event.playerId)} uses an effect on ${targetName(state, event.target)}.`;
    case "ACTIVE_EFFECT_EXPIRED":
      return `An effect expires (${event.reason.replace(/-/g, " ")}).`;
    case "SIMULTANEOUS_TURN_COMPLETED":
      return `${playerName(state, event.playerId)} is ready.`;
    case "ORDERED_TURNS_STARTED":
      return `Ordered turns begin with ${playerName(state, event.activePlayerId)}.`;
  }
}

export function actionKey(action: GameAction): string {
  return JSON.stringify(action);
}

export type CardBoardAction = Extract<GameAction, { type: "CAST_SPELL" | "PLAY_CARD" }>;

export type BoardTargetCardAction = CardBoardAction & {
  target: { type: "unit"; unitId: string };
};

export function isBoardTargetCardAction(action: GameAction): action is BoardTargetCardAction {
  return (
    (action.type === "CAST_SPELL" || action.type === "PLAY_CARD") &&
    Boolean(action.target && action.target.type === "unit")
  );
}

export function cardSelectionKey(action: CardBoardAction): string {
  return JSON.stringify({
    type: action.type,
    playerId: action.playerId,
    cardId: action.cardId,
    mode: "mode" in action ? (action.mode ?? "basic") : "basic",
    optionIndex: "optionIndex" in action ? action.optionIndex : undefined
  });
}

export function sameCardSelection(selected: CardBoardAction | null, action: CardBoardAction): boolean {
  return Boolean(selected && cardSelectionKey(selected) === cardSelectionKey(action));
}

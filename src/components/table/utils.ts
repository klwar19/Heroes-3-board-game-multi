import { cardLibrary } from "@/data/cards/library";
import {
  getBattlefieldLabel,
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
  return cardLibrary[cardId]?.name ?? cardId;
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
      return `${playerName(state, event.playerId)} rerolls with ${event.sourceName} -> ${formatDieFace(event.roll)}.`;
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
    case "UNIT_FLIPPED":
      return `${event.unitName} pack is broken: flips to its Few side${event.excessDamage > 0 ? ` with ${event.excessDamage} carried-over damage` : ""}.`;
    case "UNIT_TRANSFORMED":
      return `${playerName(state, event.playerId)} places ${cardName(event.byCardId)}: the unit becomes ${event.newName}.`;
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
    case "ROUND_STARTED":
      return `Round ${event.round} begins${event.kind === "resource" ? " (resource round)" : event.kind === "astrologers" ? " (Astrologers' round)" : ""}.`;
    case "TURN_STARTED":
      return `${playerName(state, event.playerId)} starts their turn.`;
    case "HAND_REFRESHED":
      return `${playerName(state, event.playerId)} refreshes their hand (discarded ${event.discarded}, drew ${event.drawn}).`;
    case "TILE_REVEALED":
      return `${playerName(state, event.playerId)} discovers map tile ${event.tileDefId}.`;
    case "TILE_PLACED":
      return `${playerName(state, event.playerId)} places map tile ${event.tileDefId}.`;
    case "FIELD_VISITED":
      return `${playerName(state, event.playerId)} ${event.revisit ? "revisits" : "visits"} ${titleCase(event.location)}.`;
    case "FIELD_FLAGGED":
      return `${playerName(state, event.playerId)} flags ${titleCase(event.location)}${event.previousOwnerId ? ` (taken from ${playerName(state, event.previousOwnerId)})` : ""}.`;
    case "RESOURCES_GAINED": {
      const parts = [
        event.gold ? `${event.gold} gold` : null,
        event.buildingMaterials ? `${event.buildingMaterials} materials` : null,
        event.valuables ? `${event.valuables} valuables` : null
      ].filter(Boolean);
      return `${playerName(state, event.playerId)} gains ${parts.join(", ") || "nothing"} (${event.reason}).`;
    }
    case "RESOURCES_SPENT":
      return `${playerName(state, event.playerId)} pays ${formatCost(event.cost)} (${event.reason}).`;
    case "PRODUCTION_CHANGED":
      return `${playerName(state, event.playerId)} ${event.amount >= 0 ? "+" : ""}${event.amount} ${formatResourceName(event.resource)} production.`;
    case "ADVENTURE_DICE_ROLLED":
      return `${playerName(state, event.playerId)} rolls ${event.dice} dice: ${event.results.join("; ")}.`;
    case "EXPERIENCE_GAINED":
      return `${playerName(state, event.playerId)} gains ${event.amount} experience (level ${event.level}).`;
    case "HERO_LEVEL_UP":
      return `${playerName(state, event.playerId)} reaches level ${event.level}${event.effects.length ? `: ${event.effects.join(", ")}` : ""}.`;
    case "MORALE_CHANGED":
      return `${playerName(state, event.playerId)} morale ${event.amount > 0 ? "+" : ""}${event.amount} (now ${event.total}).`;
    case "NEUTRAL_COMBAT_STARTED":
      return `${playerName(state, event.playerId)} fights level ${event.difficulty} guards (${event.unitDefIds.length} units).`;
    case "PLAYER_COMBAT_STARTED":
      return `${playerName(state, event.attackerPlayerId)} attacks ${playerName(state, event.defenderPlayerId)}!`;
    case "QUICK_COMBAT_WON":
      return `${playerName(state, event.playerId)} sweeps aside the level ${event.difficulty} guards (quick combat).`;
    case "COMBAT_CONTINUED":
      return `${playerName(state, event.playerId)} spends 1 MP to fight on (${event.movementLeft} left).`;
    case "COMBAT_RETREATED":
      return `${playerName(state, event.playerId)} retreats from the combat.`;
    case "COMBAT_UNIT_PLACED":
      return `${playerName(state, event.playerId)} deploys ${unitName(state, event.unitId)} at ${getBattlefieldLabel(event.position)}.`;
    case "COMBAT_PLACEMENT_FINISHED":
      return `${playerName(state, event.playerId)} is ready for battle.`;
    case "UNIT_RECRUITED":
      return `${playerName(state, event.playerId)} ${event.kind === "recruit" ? "recruits" : "reinforces"} ${event.unitDefId.split(".")[1] ?? event.unitDefId} for ${formatCost(event.cost)}.`;
    case "SPELLS_PURCHASED":
      return `${playerName(state, event.playerId)} buys spells for ${formatCost(event.cost)}.`;
    case "TRADE_EXECUTED":
      return `${playerName(state, event.playerId)} trades ${event.rateLabel}.`;
    case "GAME_WON":
      return `${playerName(state, event.playerId)} wins the game: ${event.reason}!`;
    case "TILE_ROTATION_SET":
      return `${playerName(state, event.playerId)} sets ${event.tileDefId} to ${event.rotation * 60}°.`;
    case "ASTROLOGERS_DRAWN":
      return `Astrologers proclaim: ${event.name} — ${event.text}`;
    case "ARMY_UNIT_FLIPPED":
      return `${playerName(state, event.playerId)}'s ${event.unitDefId.split(".")[1] ?? event.unitDefId} pack flips to Few (${event.reason}).`;
    case "SPELL_RETURNED_TO_HAND":
      return `${cardName(event.cardId)} returns to ${playerName(state, event.playerId)}'s hand (${event.reason}).`;
    case "NEUTRAL_DRAW_SWAPPED":
      return `${playerName(state, event.playerId)} swaps ${event.fromUnitDefId.split(".")[1] ?? event.fromUnitDefId} for ${event.toUnitDefId.split(".")[1] ?? event.toUnitDefId}.`;
    case "MORALE_SPENT":
      return `${playerName(state, event.playerId)} spends the morale token (${event.benefit}).`;
    case "FACTION_CHOSEN":
      return `${playerName(state, event.playerId)} picks ${titleCase(event.factionId)} with ${titleCase(event.heroDefId)}.`;
    case "ADVENTURE_STARTED":
      return `The adventure begins (${event.scenarioId}).`;
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

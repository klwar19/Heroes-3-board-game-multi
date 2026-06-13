import { cardLibrary } from "@/data/cards/library";
import { assetUrl } from "@/lib/asset-url";
import {
  cardCanBoostPower,
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

/** Whether a hand card may pay a play's discard cost under the given filter. */
export function costCardEligible(cardId: string, filter?: "spell" | "power-source"): boolean {
  if (!filter) {
    return true;
  }
  const card = cardLibrary[cardId];
  return filter === "spell" ? card?.kind === "spell" : cardCanBoostPower(card);
}

export function unitName(state: GameState, unitId: string): string {
  return state.combat?.units[unitId]?.name ?? unitId;
}

export function targetName(state: GameState, target: TargetRef): string {
  if (target.type === "unit") {
    return unitName(state, target.unitId);
  }
  if (target.type === "space") {
    return getBattlefieldLabel(target.position);
  }
  return "no target";
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
    case "UNIT_LETHAL_HIT":
      return `${unitName(state, event.defenderId)} is about to be destroyed.`;
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
    case "SPECIALTY_CARD_DEFEATED":
      return `${cardName(event.cardId)} is defeated and discarded: ${event.revealedName} is revealed${event.excessDamage > 0 ? ` with ${event.excessDamage} carried-over damage` : ""}.`;
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
    case "SPELL_REDIRECTED":
      return `${playerName(state, event.playerId)} redirects ${cardName(event.spellCardId)} to ${targetName(state, event.toTarget)} with ${cardName(event.byCardId)}.`;
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
      return `${playerName(state, event.playerId)} engages the level ${event.difficulty} guards — deploy your units first.`;
    case "NEUTRAL_ARMY_REVEALED":
      return `The level ${event.difficulty} guards are revealed: ${event.unitDefIds
        .map((unitDefId) => unitDefId.split(".")[1] ?? unitDefId)
        .join(", ")}.`;
    case "GAME_OPTIONS_CHANGED":
      return event.message;
    case "PLAYER_COMBAT_STARTED":
      return `${playerName(state, event.attackerPlayerId)} attacks ${playerName(state, event.defenderPlayerId)}!`;
    case "QUICK_COMBAT_WON":
      return `${playerName(state, event.playerId)} sweeps aside the level ${event.difficulty} guards (quick combat).`;
    case "COMBAT_CONTINUED":
      return `${playerName(state, event.playerId)} spends 1 movement point to fight on (${event.movementLeft} left).`;
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
    case "WAR_MACHINE_BOUGHT":
      return `${playerName(state, event.playerId)} buys the ${cardName(event.cardId)} for ${formatCost(event.cost)} (${event.at === "factory" ? "War Machine Factory" : "Trading Post"}).`;
    case "PERMANENT_PLAYED":
      return `${playerName(state, event.playerId)} puts ${cardName(event.cardId)} into play${event.replacedCardId ? `, discarding ${cardName(event.replacedCardId)}` : ""}.`;
    case "PERMANENT_DISCARDED":
      return `${playerName(state, event.playerId)} discards ${cardName(event.cardId)} from play${
        event.reason === "limit" ? " (over the permanent limit)" : ""
      }.`;
    case "PANDORA_CARD_DRAWN":
      return `${playerName(state, event.playerId)} opens Pandora's Box and draws ${cardName(event.cardId)}.`;
    case "WAR_MACHINE_TRIGGERED":
      return event.message;
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
    case "FIRST_PLAYER_ROLLED": {
      const last = event.attempts.at(-1);
      const rolls = (last?.rolls ?? [])
        .map((roll) => `${roll.name} ${roll.value >= 0 ? "+" : ""}${roll.value}`)
        .join(", ");
      return `First-player roll: ${rolls} — ${playerName(state, event.winnerPlayerId)} starts.`;
    }
    case "COMBAT_TOKEN_PLACED":
      return `${unitName(state, event.unitId)} gains a ${event.kind} token (${event.amount >= 0 ? "+" : ""}${event.amount}) from ${event.sourceName}.`;
    case "COMBAT_TOKEN_REMOVED":
      return `${unitName(state, event.unitId)} loses its ${event.kind} token (${event.reason}).`;
    case "SIEGE_FORTIFICATIONS_PLACED":
      return `${playerName(state, event.playerId)} mans the walls: 3 Walls, the Gate and the Arrow Tower defend the town.`;
    case "FORTIFICATION_DESTROYED":
      return event.message;
    case "TOWN_BUILDING_USED":
      return event.message;
    case "SPELL_SCROLL_GAINED":
      return `${playerName(state, event.playerId)} takes a Spell Scroll holding ${event.spellCardIds
        .map((cardId) => cardName(cardId))
        .join(" & ")}.`;
    case "SCROLL_SPELL_SOLD":
      return `${playerName(state, event.playerId)} sells ${cardName(event.cardId)} from a Spell Scroll for ${event.gold} gold.`;
  }
}

export function actionKey(action: GameAction): string {
  return JSON.stringify(action);
}

export type CardBoardAction = Extract<GameAction, { type: "CAST_SPELL" | "PLAY_CARD" }>;

export type BoardTargetCardAction = CardBoardAction & {
  target: { type: "unit"; unitId: string } | { type: "space"; position: number };
};

export function isBoardTargetCardAction(action: GameAction): action is BoardTargetCardAction {
  return (
    (action.type === "CAST_SPELL" || action.type === "PLAY_CARD") &&
    Boolean(action.target && (action.target.type === "unit" || action.target.type === "space"))
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

/**
 * Use a small square portrait as the drag ghost when deploying or shuffling a
 * combat unit. Two traps this avoids: board units have no small portrait to
 * point at — their default ghost is the whole battlefield card; and handing an
 * <img> to setDragImage makes browsers draw it at the bitmap's *natural* size
 * (the full card art), ignoring width/height — that is the "huge ghost" bug.
 * The fix is to snapshot a plain <div> that paints the art as a 46px
 * background: a non-image element is rasterised at its rendered box, so the
 * ghost is always 46px regardless of the source image's real dimensions.
 */
export function setUnitDragImage(event: { dataTransfer: DataTransfer }, src: string | undefined): void {
  if (!src || typeof document === "undefined") {
    return;
  }

  // Background-image (not an <img>) so the ghost is sized by the box, not the
  // bitmap. Escape quotes/backslashes so the path can't break out of url("").
  const safeSrc = assetUrl(src).replace(/["\\]/g, "\\$&");
  const ghost = document.createElement("div");
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.cssText =
    "position:fixed;top:-1000px;left:-1000px;width:46px;height:46px;border-radius:8px;" +
    "border:1px solid rgba(20,12,4,0.85);box-shadow:0 3px 8px rgba(0,0,0,0.55);pointer-events:none;" +
    `background:#0a0704 url("${safeSrc}") top center / cover no-repeat;`;
  document.body.appendChild(ghost);

  try {
    event.dataTransfer.setDragImage(ghost, 23, 23);
  } catch {
    // setDragImage can throw in rare environments; the default ghost is fine.
  }

  window.setTimeout(() => ghost.remove(), 0);
}

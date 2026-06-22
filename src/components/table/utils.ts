import { cardLibrary } from "@/data/cards/library";
import { CREATURE_BANKS } from "@/data/map/creature-banks";
import { assetUrl } from "@/lib/asset-url";
import {
  cardCanBoostPower,
  getBattlefieldLabel,
  heroMoveStartsBattle,
  type BuildingEffectDefinition,
  type CardDefinition,
  type GameAction,
  type GameEvent,
  type GameState,
  type LegalAction,
  type PlayerId,
  type ResourceCost,
  type ResourceKind,
  type TargetRef
} from "@/engine";

type SwapAction = Extract<GameAction, { type: "SWAP_COMBAT_UNITS" }>;

/** All Tactics swap actions offered this snapshot (start-of-combat or expert). */
export function getTacticsSwapActions(legalActions: LegalAction[]): SwapAction[] {
  return legalActions
    .map((legal) => legal.action)
    .filter((action): action is SwapAction => action.type === "SWAP_COMBAT_UNITS");
}

/** Whether the viewer is in their start-of-combat Tactics window right now. */
export function tacticsSetupActiveFor(state: GameState, viewerPlayerId: PlayerId): boolean {
  return state.combat?.pendingTacticsSwaps?.[0] === viewerPlayerId;
}

/** Whether the player has at least one recruit/reinforce ("buy troops") on offer. */
export function canBuyTroopsNow(legalActions: LegalAction[], playerId: PlayerId): boolean {
  return legalActions.some(
    (legal) =>
      legal.action.type === "POPULATION_ACTION" &&
      legal.action.playerId === playerId &&
      legal.action.purchases.some((purchase) => purchase.kind === "recruit" || purchase.kind === "reinforce")
  );
}

/**
 * Would submitting `action` walk the seated player's hero straight into a battle
 * while they could still buy troops? True only on the quiet map turn (never in
 * combat / off-turn) for a hero MOVE by that seat — MOVE_HERO (one step) or
 * MOVE_HERO_PATH (its final field) — onto a field that starts a Combat (an enemy
 * hero or undefeated guards), when at least one recruit/reinforce is legal right
 * now. The UI uses this to pop a "you can still buy troops — keep moving into
 * battle, or stop and recruit first?" confirmation so the player never wastes the
 * fight under-strength by forgetting to reinforce.
 */
export function moveIntoBattleWithTroopsToBuy(
  state: GameState,
  viewerPlayerId: PlayerId,
  action: GameAction,
  legalActions: LegalAction[]
): boolean {
  if (state.combat) {
    return false;
  }
  // Room membership actions (clientId-keyed) carry no seat playerId.
  if (!("playerId" in action)) {
    return false;
  }
  if (action.playerId !== viewerPlayerId || state.activePlayerId !== viewerPlayerId) {
    return false;
  }

  let heroId: string;
  let destination: string;
  if (action.type === "MOVE_HERO") {
    heroId = action.heroId;
    destination = action.to;
  } else if (action.type === "MOVE_HERO_PATH") {
    const last = action.path[action.path.length - 1];
    if (!last) {
      return false;
    }
    heroId = action.heroId;
    destination = last;
  } else {
    return false;
  }

  if (!heroMoveStartsBattle(state, heroId, destination)) {
    return false;
  }

  return canBuyTroopsNow(legalActions, viewerPlayerId);
}

/** Unit ids that can be the FIRST pick of a swap (they appear in some pair). */
export function swapSelectableUnitIds(swaps: SwapAction[]): Set<string> {
  const ids = new Set<string>();
  for (const swap of swaps) {
    ids.add(swap.unitIdA);
    ids.add(swap.unitIdB);
  }
  return ids;
}

/**
 * Given a chosen first unit, the partner unit id -> the swap action that pairs
 * them. Each pair is unordered, so a unit's partners come from either side.
 */
export function swapPartnerActions(swaps: SwapAction[], selectedUnitId: string): Map<string, SwapAction> {
  const partners = new Map<string, SwapAction>();
  for (const swap of swaps) {
    if (swap.unitIdA === selectedUnitId) {
      partners.set(swap.unitIdB, swap);
    } else if (swap.unitIdB === selectedUnitId) {
      partners.set(swap.unitIdA, swap);
    }
  }
  return partners;
}

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

/** Display name of a room member by clientId (falls back if already gone). */
export function roomMemberName(state: GameState, clientId: string): string {
  return state.room?.members.find((member) => member.clientId === clientId)?.name ?? "A player";
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
      return `${event.isRetaliation ? "Retaliation" : "Attack"} roll ${event.rolls.map(formatDieFace).join("/")} -> ${formatDieFace(event.roll)}: ${event.attackValue} vs ${event.defenseValue}, ${event.damage} damage.${
        event.defendRoll !== undefined
          ? ` Defend roll ${formatDieFace(event.defendRoll)} (${event.defendRoll === 1 ? "+1 Defense" : "no bonus"}).`
          : ""
      }`;
    case "SPELL_DICE_ROLLED":
      return `${cardName(event.spellCardId)} rolls ${event.rolls.map(formatDieFace).join("/")}: ${event.hits} hit${event.hits === 1 ? "" : "s"}.`;
    case "UNIT_LETHAL_HIT":
      return `${unitName(state, event.defenderId)} is about to be destroyed.`;
    case "ATTACK_DIE_SETTLED":
      return `Attack die settled on ${formatDieFace(event.roll)}: ${unitName(state, event.defenderId)} may ignore it.`;
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
    case "BATTLEFIELD_TOKEN_PLACED": {
      const names: Record<typeof event.kind, string> = {
        force_field: "Force Field",
        fire_wall: "Fire Wall",
        quicksand: "Quicksand",
        land_mine: "Land Mine"
      };
      return `${playerName(state, event.playerId)} places ${names[event.kind]} at ${getBattlefieldLabel(event.position)}.`;
    }
    case "BATTLEFIELD_TOKEN_TRIGGERED":
      if (event.outcome === "decoy") {
        return `${unitName(state, event.unitId)} springs an empty ${event.kind === "quicksand" ? "Quicksand" : "Land Mine"} decoy at ${getBattlefieldLabel(event.position)} — it is cleared away.`;
      }
      return event.outcome === "stop"
        ? `${unitName(state, event.unitId)} is caught in Quicksand at ${getBattlefieldLabel(event.position)} — its activation ends, and the trap is spent.`
        : `${unitName(state, event.unitId)} takes ${event.amount ?? 0} from ${event.kind === "fire_wall" ? "a Fire Wall" : "a Land Mine"} at ${getBattlefieldLabel(event.position)}.`;
    case "BATTLEFIELD_TOKEN_EXPIRED":
      return `The ${event.kind === "force_field" ? "Force Field" : "spell token"} at ${getBattlefieldLabel(event.position)} fades.`;
    case "COMBAT_OBSTACLE_REMOVED":
      return `${playerName(state, event.playerId)} removes the obstacle at ${getBattlefieldLabel(event.position)}.`;
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
      // House rule: a Surrender is a paid escape, not a win for the opponent.
      if (event.reason === "surrender") {
        return `${playerName(state, event.defeatedPlayerId)} surrenders the combat (10 gold, army kept) — not a win for ${playerName(state, event.winnerPlayerId)}.`;
      }
      if (event.reason === "retreat") {
        return `${playerName(state, event.defeatedPlayerId)} retreats; ${playerName(state, event.winnerPlayerId)} wins the combat.`;
      }
      if (event.reason === "give-up") {
        return `${playerName(state, event.defeatedPlayerId)} gives up the combat; ${playerName(state, event.winnerPlayerId)} wins.`;
      }
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
    case "SPELL_MOVED_TO_SPELL_BOOK":
      return event.message;
    case "DECK_SEARCH_STARTED":
      return `${playerName(state, event.playerId)} searches the ${event.deckId} deck (${event.revealedCount} revealed).`;
    case "DECK_SEARCH_RESOLVED":
      return `${playerName(state, event.playerId)} keeps a ${event.deckId} card${event.pick === "discard-top" ? " from the discard" : ""}; ${event.discardedCardIds.length} discarded.`;
    case "HERO_MOVED":
      return `${playerName(state, event.playerId)} moves their hero ${event.from} -> ${event.to} (${event.movementLeft} movement left).`;
    case "HERO_GAINED":
      return `${playerName(state, event.playerId)} gains a Secondary Hero at ${event.fieldId}.`;
    case "SPELL_CAST_CANCELLED":
      return `${playerName(state, event.cancelledByPlayerId)} ends ${cardName(event.spellCardId)} with ${cardName(event.cancelledByCardId)}.`;
    case "SPELL_CAST_REFUNDED":
      return event.reason;
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
    case "ROOM_MEMBER_JOINED":
      return `${event.name} joined${event.seat === "observer" ? " as an observer" : ` (seat ${playerName(state, event.seat)})`}.`;
    case "ROOM_MEMBER_LEFT":
      return `${roomMemberName(state, event.clientId)} left the room.`;
    case "ROOM_SEAT_CHANGED":
      return `${roomMemberName(state, event.clientId)} is now ${event.seat === "observer" ? "an observer" : `at ${playerName(state, event.seat)}`}.`;
    case "ROOM_MEMBER_KICKED":
      return `${roomMemberName(state, event.clientId)} was removed from the room.`;
    case "ROOM_HOSTED_CHANGED":
      return event.hosted ? "The room is now hosted — seats are locked." : "The room is now an open table.";
    case "ROOM_HOST_CHANGED":
      return `${roomMemberName(state, event.clientId)} is now the host.`;
    case "ROOM_NAMED":
      return event.name
        ? `${roomMemberName(state, event.byClientId)} named the room “${event.name}”.`
        : `${roomMemberName(state, event.byClientId)} cleared the room name.`;
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
    case "FIELD_MORALE_IGNORED":
      return `${playerName(state, event.playerId)} uses Crest of Valor to ignore the negative morale from the field.`;
    case "NEUTRAL_COMBAT_STARTED":
      return `${playerName(state, event.playerId)} engages the level ${event.difficulty} guards — deploy your units first.`;
    case "NEUTRAL_ARMY_REVEALED":
      return `The level ${event.difficulty} guards are revealed: ${event.unitDefIds
        .map((unitDefId) => unitDefId.split(".")[1] ?? unitDefId)
        .join(", ")}.`;
    case "CREATURE_BANK_PLACED":
      return `A ${CREATURE_BANKS[event.bankId as keyof typeof CREATURE_BANKS]?.name ?? "Creature Bank"} token is placed.`;
    case "CREATURE_BANK_COMBAT_STARTED":
      return `${playerName(state, event.playerId)} raids the ${
        CREATURE_BANKS[event.bankId as keyof typeof CREATURE_BANKS]?.name ?? "Creature Bank"
      } (${event.stackedCount} Stacked defender${event.stackedCount === 1 ? "" : "s"}).`;
    case "ABILITY_EMPOWERED":
      return `${playerName(state, event.playerId)} empowers ${cardName(
        event.cardId
      )} — its expert side now costs no crown.`;
    case "STACK_TOKEN_DISCARDED":
      return `${event.unitName} discards a Stack Token and survives the blow${
        event.excessDamage > 0 ? ` (${event.excessDamage} damage carries over)` : ""
      }.`;
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
    case "COMBAT_PREP_ACCEPTED":
      return `${playerName(state, event.playerId)} accepts the combat and moves to deployment.`;
    case "COMBAT_UNITS_SWAPPED":
      return `${playerName(state, event.playerId)} uses Tactics${
        event.mode === "expert" ? " (expert)" : ""
      } to switch ${unitName(state, event.unitIdA)} and ${unitName(state, event.unitIdB)}.`;
    case "DIPLOMACY_NEUTRALS_DRAWN":
      return `${playerName(state, event.playerId)} uses Diplomacy and draws ${event.unitDefIds
        .map((unitDefId) => unitDefId.split(".")[1] ?? unitDefId)
        .join(", ")}.`;
    case "DIPLOMACY_COMBAT_SKIPPED":
      return `${playerName(state, event.playerId)} uses Diplomacy to skip the level ${event.difficulty} Neutral Units and claim the field (no experience).`;
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
    case "PLAYER_ELIMINATED":
      return `${playerName(state, event.playerId)} is eliminated — ${event.reason}. They become an observer.`;
    case "PLAYER_ELIMINATION_CLOCK":
      return event.turnsLeft === null
        ? `${playerName(state, event.playerId)} secures a base — no longer facing elimination.`
        : `${playerName(state, event.playerId)} holds no Town or Settlement — ${event.turnsLeft} turn${
            event.turnsLeft === 1 ? "" : "s"
          } left before elimination.`;
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
    case "SANDBOX_CARD_ADDED":
      return event.message;
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
    optionIndex: "optionIndex" in action ? action.optionIndex : undefined,
    // The "discard a School of Magic for +3" cast is a distinct selection from
    // the plain cast of the same spell at the same target.
    useSchoolExpert: action.type === "CAST_SPELL" ? Boolean(action.useSchoolExpert) : false
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

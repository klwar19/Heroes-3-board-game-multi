import { cardLibrary } from "@/data/cards/library";
import { astrologersCardDefinitions } from "@/data/cards/astrologers";
import { eventCardDefinitions } from "@/data/cards/events";
import {
  ABILITY_EMPOWER_TOKEN_ICON,
  RESOURCE_ICONS,
  REWARD_GLYPH_ICONS,
  UI_REWARD_ICONS,
  moraleIcon
} from "@/data/assets/homm-assets";
import { CREATURE_BANKS } from "@/data/map/creature-banks";
import { getEquipmentDefinition } from "@/data/anime/equipment";
import { UNIT_RANK_NAMES } from "@/data/units/experience";
import { unitAbilities } from "@/data/units/abilities";
import { coreUnitDefinitions } from "@/data/factions/units";
import {
  cardCanBoostPower,
  cultivationRealmLabel,
  heroGradeLabel,
  getBattlefieldLabel,
  heroMoveStartsBattle,
  isRoundStartEventBarrierActive,
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

/** Feed label for a rulebook Stack Token carried by a Stacked bank-reward unit. */
const STACK_TOKEN_FEED_LABELS = {
  attack: "+1 Attack",
  defense: "+1 Defense",
  health: "+1 Health",
  initiative: "+2 Initiative"
} as const;

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

/**
 * An Empowered Statistic card (Inferno expansion / Star Axis) — the upgraded
 * variant of a printed statistic (Empowered Attack/Defense/Power/Knowledge).
 * Its empowered status is INTRINSIC to the card, so it is detectable from the
 * card alone (the `"empowered"` tag) and can be highlighted in every render
 * surface without any player context.
 *
 * Empowered ABILITIES are NOT detectable this way: the very same ability card
 * is "empowered" only for the player who earned it (the Dragon Fly Hive /
 * Griffin Conservatory bank bonus, tracked in `player.empoweredAbilities`).
 * Callers that know the owner pass that flag in separately — see
 * `cardIsEmpoweredFor`.
 */
export function isEmpoweredStatisticCard(cardId: string | undefined): boolean {
  if (!cardId) {
    return false;
  }
  const card = cardLibrary[cardId];
  return card?.kind === "statistic" && (card.tags?.includes("empowered") ?? false);
}

/**
 * Whether `cardId` should be shown as Empowered for the given owner: an
 * Empowered Statistic (intrinsic) OR an ability the owner has had Empowered.
 * `empoweredAbilities` only ever holds ability card ids, so a plain membership
 * test is enough — see `abilityExpertIsCrownFree` in the engine ruleset.
 */
export function cardIsEmpoweredFor(
  cardId: string | undefined,
  empoweredAbilities: readonly string[] | undefined
): boolean {
  if (!cardId) {
    return false;
  }
  return isEmpoweredStatisticCard(cardId) || Boolean(empoweredAbilities?.includes(cardId));
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

/**
 * Names the exact cards a draw/discard event carries — the single-player
 * history detail. Redacted entries (the engine's HIDDEN_CARD_ID placeholder,
 * what every multiplayer viewer receives) are dropped entirely, so multiplayer
 * feed/log lines read exactly as they did before the ids were logged.
 */
function formatLoggedCards(cardIds: string[] | undefined): string {
  if (!cardIds || cardIds.length === 0) {
    return "";
  }
  return cardIds
    .filter((cardId) => cardId !== "hidden")
    .map((cardId) => cardName(cardId))
    .join(", ");
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
      if (event.abilityAttack) {
        const abilityName = unitAbilities[event.abilityAttack.abilityId]?.name ?? "Ability attack";
        return `${unitName(state, event.attackerId)} — 2nd attack: ${abilityName} (Attack ${event.abilityAttack.baseAttack}) targets ${unitName(state, event.defenderId)}.`;
      }
      return `${unitName(state, event.attackerId)} ${event.isRetaliation ? "retaliates against" : "attacks"} ${unitName(state, event.defenderId)} (${event.attackKind}${event.rollMode === "normal" ? "" : `, ${event.rollMode}`}).`;
    case "ATTACK_ROLLED":
      return `${event.isRetaliation ? "Retaliation" : "Attack"} roll ${event.rolls.map(formatDieFace).join("/")} -> ${formatDieFace(event.roll)}: ${event.attackValue} vs ${event.defenseValue}, ${event.damage} damage.${
        event.defendRoll !== undefined
          ? ` Defend roll ${formatDieFace(event.defendRoll)} (${event.defendRoll === 1 ? "+1 Defense" : "no bonus"}).`
          : ""
      }${
        event.mightRolls?.length ? ` Might dice ${event.mightRolls.map(formatDieFace).join("/")}.` : ""
      }${
        event.rollModifiers?.length
          ? ` ${event.rollModifiers.map((modifier) => `${modifier.source}: ${modifier.text}`).join("; ")}.`
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
      // A multi-die ability roll (Death Stare) rerolls all its dice at once.
      return `${playerName(state, event.playerId)} rerolls with ${event.sourceName} -> ${
        event.rolls.length > 1 ? event.rolls.map(formatDieFace).join("/") : formatDieFace(event.roll)
      }.`;
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
      if (event.reason === "surrender-secondary") {
        return `${playerName(state, event.defeatedPlayerId)} surrenders their Secondary Hero (no gold, army kept, the 2nd hero is lost) — not a win for ${playerName(state, event.winnerPlayerId)}.`;
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
      return `${playerName(state, event.playerId)} draws ${event.count} card${event.count === 1 ? "" : "s"}${
        formatLoggedCards(event.cardIds) ? `: ${formatLoggedCards(event.cardIds)}` : ""
      }${event.reshuffledDiscard ? " after reshuffling the discard" : ""}.`;
    case "SPELL_MOVED_TO_SPELL_BOOK":
      return event.message;
    case "DECK_SEARCH_STARTED":
      return `${playerName(state, event.playerId)} searches the ${event.deckId} deck (${event.revealedCount} revealed).`;
    case "DECK_SEARCH_RESOLVED":
      return `${playerName(state, event.playerId)} keeps a ${event.deckId} card${event.pick === "discard-top" ? " from the discard" : ""}; ${event.discardedCardIds.length} discarded${
        formatLoggedCards(event.discardedCardIds) ? `: ${formatLoggedCards(event.discardedCardIds)}` : ""
      }.`;
    case "HERO_MOVED":
      return `${playerName(state, event.playerId)} moves their hero ${event.from} -> ${event.to} (${event.movementLeft} movement left).`;
    case "HERO_GAINED":
      return `${playerName(state, event.playerId)} gains a Secondary Hero at ${event.fieldId}.`;
    case "HERO_LOST":
      return event.message;
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
    case "PARALLEL_TURNS_STARTED":
      return `Parallel turns: everyone plays at the same time for the first ${event.rounds} round${event.rounds === 1 ? "" : "s"} (battles and choices still resolve one at a time; a PvP clash ends the mode early).`;
    case "PARALLEL_TURN_ENDED":
      return event.waitingForPlayerIds.length > 0
        ? `${playerName(state, event.playerId)} ends their parallel turn — waiting for ${event.waitingForPlayerIds
            .map((playerId) => playerName(state, playerId))
            .join(", ")}.`
        : `${playerName(state, event.playerId)} ends their parallel turn — the round is complete.`;
    case "PARALLEL_TURNS_STOPPED":
      return event.message;
    case "MOVES_UNDONE":
      return event.message;
    case "NEUTRAL_CONTROL_ASSIGNED":
      return event.message;
    case "NEUTRAL_FORMATION_SORT_OPENED":
      return `${playerName(state, event.playerId)} may sort the Neutral formation before ${playerName(state, event.combatPlayerId)}'s battle.`;
    case "COMMANDER_PLACEMENT_OPENED":
      return `${playerName(state, event.playerId)} may reposition their commander before the battle.`;
    case "ROOM_MEMBER_JOINED": {
      // Registered players show their verified nickname; guests are honestly
      // labeled so nobody mistakes them for an account. Rebinds read "reconnected".
      const who = event.verified ? event.name : `guest — ${event.name}`;
      const how = event.newMember === false ? "reconnected" : "joined";
      return `${who} ${how}${event.seat === "observer" ? " as an observer" : ` (seat ${playerName(state, event.seat)})`}.`;
    }
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
    case "ROOM_PASSWORD_CHANGED":
      return event.hasPassword
        ? `${roomMemberName(state, event.byClientId)} set a room password.`
        : `${roomMemberName(state, event.byClientId)} removed the room password.`;
    case "ROOM_REQUIRE_AUTH_CHANGED":
      return event.requireAuth
        ? `${roomMemberName(state, event.byClientId)} now requires a verified account to join.`
        : `${roomMemberName(state, event.byClientId)} allows guests to join again.`;
    case "ROUND_STARTED":
      return `Round ${event.round} begins${event.kind === "resource" ? " (resource round)" : event.kind === "astrologers" ? " (Astrologers' round)" : ""}.`;
    case "FINAL_ROUND":
      return `This is the final round (round ${event.round}) — the game ends once it is over, and the player with the most Victory Points wins.`;
    case "TURN_STARTED":
      return `${playerName(state, event.playerId)} starts their turn.`;
    case "HAND_REFRESHED":
      if (event.reason === "morale-double-negative") {
        return `${playerName(state, event.playerId)} discards their hand of ${event.discarded} card${
          event.discarded === 1 ? "" : "s"
        }${formatLoggedCards(event.discardedCardIds) ? `: ${formatLoggedCards(event.discardedCardIds)}` : ""} (double negative morale).`;
      }
      return `${playerName(state, event.playerId)} refreshes their hand (discarded ${event.discarded}${
        formatLoggedCards(event.discardedCardIds) ? `: ${formatLoggedCards(event.discardedCardIds)}` : ""
      }, drew ${event.drawn}).`;
    case "HAND_MULLIGAN":
      return `${playerName(state, event.playerId)} replaces a starting-hand card (${event.remaining} replacement${
        event.remaining === 1 ? "" : "s"
      } left${formatLoggedCards(event.discardedCardIds) ? `: ${formatLoggedCards(event.discardedCardIds)}` : ""}).`;
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
    case "CULTIVATION_REALM_ADVANCED": {
      const realm = cultivationRealmLabel(state, event.playerId, event.realm);
      return `${playerName(state, event.playerId)}'s hero breaks through to ${realm.en} (${realm.vi})${
        event.viaTribulation ? " — the Heavenly Tribulation is survived!" : ""
      }.`;
    }
    case "CULTIVATION_TRIBULATION_ROLLED": {
      const tolls = event.rolls.filter((roll) => roll === -1).length;
      const faces = event.rolls.map((roll) => (roll >= 0 ? `+${roll}` : `${roll}`)).join(", ");
      return `${playerName(state, event.playerId)} braves the Heavenly Tribulation — dice: ${faces} (${tolls} toll${
        tolls === 1 ? "" : "s"
      }).`;
    }
    case "CULTIVATION_TRIBULATION_FAILED":
      return `${playerName(state, event.playerId)}'s army is scattered by the Heavenly Tribulation — no breakthrough (retry next turn).`;
    case "HERO_GRADE_ADVANCED": {
      const grade = heroGradeLabel(state, event.playerId, event.grade);
      return `${playerName(state, event.playerId)}'s hero rises to ${grade.en} (${grade.vi}) — a new grade point to spend.`;
    }
    case "HERO_TRAINED":
      return `${playerName(state, event.playerId)}'s hero trains, gaining Merit.`;
    case "ARTIFACT_SET_TIERS_CHANGED": {
      // Polish Set Artifacts: the set's piece count moved. Public by design.
      const who = playerName(state, event.playerId);
      const pieces = `${event.pieces} piece${event.pieces === 1 ? "" : "s"}`;
      if (event.tiers > event.previousTiers) {
        return `${who} holds ${pieces} of the ${event.setName} set — ${event.tiers} bonus${
          event.tiers === 1 ? "" : "es"
        } active.`;
      }
      return event.tiers === 0
        ? `${who} loses the ${event.setName} set bonus (${pieces} left).`
        : `${who} drops to ${pieces} of the ${event.setName} set — ${event.tiers} bonus${
            event.tiers === 1 ? "" : "es"
          } active.`;
    }
    case "ARTIFACT_SET_UNIT_SELECTED":
      return `${playerName(state, event.playerId)} selects ${unitName(state, event.unitId)} for the ${
        event.setName
      } set.`;
    case "ARTIFACT_SET_POWER_USED":
      return `${playerName(state, event.playerId)} uses ${event.setName} (${event.tier} pieces): ${event.message}`;
    case "COMBAT_SCRIPT_TRIGGERED":
      // Forced Battle Events (Anime mod, §3.12): the announce line is a
      // self-contained "something happens" sentence built by the engine.
      return event.message;
    case "HERO_GRADE_NODE_PICKED":
      return event.message;
    case "EQUIPMENT_EQUIPPED": {
      // Anime Equipment (§3.13): a public "equipped X" feed line.
      const def = getEquipmentDefinition(event.equipmentId);
      const name = def ? `${def.name.en} (${def.name.vi})` : event.equipmentId;
      const replaced = event.replacedId ? getEquipmentDefinition(event.replacedId) : undefined;
      const replacedNote = replaced ? `, replacing ${replaced.name.en}` : "";
      return `${playerName(state, event.playerId)}'s hero equips ${name}${replacedNote}.`;
    }
    case "EQUIPMENT_UNEQUIPPED": {
      const def = getEquipmentDefinition(event.equipmentId);
      const name = def ? `${def.name.en} (${def.name.vi})` : event.equipmentId;
      return `${playerName(state, event.playerId)}'s hero returns ${name} from ${event.slot} to the equipment bag.`;
    }
    case "HERO_SKILL_USED":
      return event.message;
    case "COMMANDER_CAST_USED":
    case "COMMANDER_POINTS_AWARDED":
    case "COMMANDER_GRADED_UP":
    case "COMMANDER_DIED":
    case "COMMANDER_REVIVED":
    case "COMMANDER_FIRST_AID_USED":
    case "COMMANDER_SPECIALTY_TRIGGERED":
    case "COMMANDER_BOND_SET":
    case "COMMANDER_ARTIFACT_BOUND":
    case "COMMANDER_ARTIFACT_SAVED":
      return `${playerName(state, event.playerId)} — ${event.message}`;
    case "MORALE_CHANGED": {
      const delta = `${event.amount > 0 ? "+" : ""}${event.amount}`;
      const total = event.total > 0 ? `+${event.total}` : `${event.total}`;
      if (event.total <= -2) {
        return `${playerName(state, event.playerId)} morale ${delta} (now ${total}) — if still −2 at end of turn, hand is discarded.`;
      }
      return `${playerName(state, event.playerId)} morale ${delta} (now ${total}).`;
    }
    case "MORALE_CARD_DRAWN":
      return `${playerName(state, event.playerId)} draws ${cardName(event.cardId)}${
        event.reshuffledDiscard ? " after reshuffling the morale discard pile" : ""
      }.`;
    case "MORALE_CARD_DISCARDED":
      return event.reason === "cancelled-by-positive"
        ? `${playerName(state, event.playerId)} discards ${cardName(event.cardId)} instead of drawing Positive Morale.`
        : event.reason === "absorbed-negative"
          ? `${playerName(state, event.playerId)} discards ${cardName(event.cardId)} to absorb the Negative Morale.`
          : `${playerName(state, event.playerId)} discards ${cardName(event.cardId)} to stay at two Positive Morale cards.`;
    case "MORALE_CARD_USED":
      return `${playerName(state, event.playerId)} uses ${cardName(event.cardId)} and returns it to the bottom of its morale deck.`;
    case "FIELD_MORALE_IGNORED":
      return `${playerName(state, event.playerId)} uses Crest of Valor to ignore the negative morale from the field.`;
    case "NEUTRAL_COMBAT_STARTED":
      return `${playerName(state, event.playerId)} engages the level ${event.difficulty} guards — deploy your units first.`;
    case "NEUTRAL_ARMY_REVEALED":
      return `The level ${event.difficulty} guards are revealed: ${event.unitDefIds
        .map((unitDefId) => unitDefId.split(".")[1] ?? unitDefId)
        .join(", ")}.`;
    case "CREATURE_BANK_PLACED":
      return `A ${CREATURE_BANKS[event.bankId as keyof typeof CREATURE_BANKS]?.name ?? "Creature Bank"} token is placed${event.bankSize ? ` at size ${["", "I", "II", "III", "IV"][event.bankSize]}` : ""}.`;
    case "SUBTERRANEAN_GATE_PLACED":
      return `${playerName(state, event.playerId)} ${event.chosen ? "places" : "opens"} a Subterranean Gate${
        event.sacrificed && event.sacrificed !== "empty_field" ? `, sacrificing ${titleCase(event.sacrificed)}` : ""
      }.`;
    case "CREATURE_BANK_COMBAT_STARTED":
      return `${playerName(state, event.playerId)} raids the ${
        CREATURE_BANKS[event.bankId as keyof typeof CREATURE_BANKS]?.name ?? "Creature Bank"
      } (${event.stackedCount} Stacked defender${event.stackedCount === 1 ? "" : "s"}).`;
    case "ABILITY_EMPOWERED":
      return `${playerName(state, event.playerId)} empowers ${cardName(
        event.cardId
      )} — its expert side now costs no crown.`;
    case "ABILITY_EMPOWER_TOKEN_GAINED":
      return event.surplus
        ? `${playerName(state, event.playerId)} gains an Ability Empower token (already full — surplus must empower a hand ability; keeps 1).`
        : `${playerName(state, event.playerId)} gains an Ability Empower token (now ${event.total}).`;
    case "ABILITY_EMPOWER_TOKEN_SPENT":
      return `${playerName(state, event.playerId)} spends an Ability Empower token on ${cardName(
        event.cardId
      )}.`;
    case "STACK_TOKEN_DISCARDED":
      return `${event.unitName} discards a Stack Token and survives the blow${
        event.excessDamage > 0 ? ` (${event.excessDamage} damage carries over)` : ""
      }.`;
    case "ARMY_STACK_PURCHASED":
      return `${playerName(state, event.playerId)} adds Stack ${event.stacks} to ${
        event.unitDefId.split(".")[1] ?? event.unitDefId
      } (${formatCost(event.cost)}).`;
    case "UNIT_RANK_UP":
      return `${playerName(state, event.playerId)}'s ${event.unitName} are now ${
        UNIT_RANK_NAMES[event.rank] ?? `rank ${event.rank}`
      } (veteran rank ${event.rank}).`;
    case "UNIT_DRILLED":
      return `${playerName(state, event.playerId)} drills ${event.unitName} (+1 unit XP, now ${event.experience}).`;
    case "MGQ_JOB_ASSIGNED":
      return `${playerName(state, event.playerId)} assigns ${titleCase(event.job)} to ${
        coreUnitDefinitions[event.unitDefId]?.name ?? event.unitDefId
      }${event.goldPaid > 0 ? ` (${event.goldPaid} gold)` : ""}.`;
    case "MGQ_COMPANION_RECRUITED":
      return event.declined
        ? `${playerName(state, event.playerId)} declines Companion Recruitment.`
        : `${playerName(state, event.playerId)} seals ${
            coreUnitDefinitions[event.unitDefId ?? ""]?.name ?? event.unitDefId ?? "a Companion"
          }${event.cost ? ` (${formatCost(event.cost)})` : ""}.`;
    case "MGQ_SPIRIT_SELECTED":
      return `${playerName(state, event.playerId)} contracts ${titleCase(event.spirit)} for the next combat.`;
    case "UNIT_XP_DILUTED":
      return event.reason === "reinforce"
        ? `${playerName(state, event.playerId)}'s ${event.unitName} veterans are diluted by the new recruits (XP now ${event.experience}).`
        : `${playerName(state, event.playerId)}'s ${event.unitName} veterans are diluted by the new Stack layer (XP now ${event.experience}).`;
    case "ARMY_STACK_LOST":
      // With a `reason` this was a map effect absorbed by the Stack (Terrible
      // Plague weakened); otherwise the combat lethal-damage absorb.
      return event.reason
        ? `${event.unitName} loses a Unit Stack (${event.reason}) — ${event.remainingStacks} Stack${
            event.remainingStacks === 1 ? "" : "s"
          } left.`
        : `${event.unitName} loses a Unit Stack and survives the blow${
            event.excessDamage > 0 ? ` (${event.excessDamage} damage carries over)` : ""
          } — ${event.remainingStacks} Stack${event.remainingStacks === 1 ? "" : "s"} left.`;
    case "GAME_OPTIONS_CHANGED":
      return event.message;
    case "MAP_PRESET_TRIGGERED":
      return event.message;
    case "STORY_SCENE_TRIGGERED":
      return event.message;
    // Calamity Waves / Raid Bosses / the Dungeon: every module event carries
    // its full feed line (module texts stay single-sourced at the wiring).
    case "MONSTER_WAVE_ANNOUNCED":
    case "MONSTER_WAVE_STARTED":
    case "MONSTER_WAVE_REPELLED":
    case "MONSTER_WAVE_PILLAGED":
    case "MONSTER_WAVE_BATTLE_EVENT":
    case "CALAMITY_GATE_PLACED":
    case "CALAMITY_GATE_PREPARED":
    case "RAID_BOSS_ANNOUNCED":
    case "RAID_BOSS_SPAWNED":
    case "RAID_BOSS_LAYER_BROKEN":
    case "RAID_BOSS_ESCALATED":
    case "RAID_BOSS_SLAIN":
    case "DUNGEON_PLACED":
    case "DUNGEON_FLOOR_CLEARED":
    case "DUNGEON_CONQUERED":
      return event.message;
    case "MAP_SECRET_FEATURE_FALLBACK":
      return event.message;
    case "START_TILE_ORIENTATION_FIXED":
      return `The map fixes ${playerName(state, event.playerId)}'s starting tile orientation (${
        event.rotation * 60
      }°) — no opening rotation.`;
    case "SETUP_SEAT_RESET":
      return event.message;
    case "PLAYER_COMBAT_STARTED":
      return `${playerName(state, event.attackerPlayerId)} attacks ${playerName(state, event.defenderPlayerId)}!`;
    case "QUICK_COMBAT_WON":
      return `${playerName(state, event.playerId)} sweeps aside the level ${event.difficulty} guards (quick combat).`;
    case "COMPUTER_GUARANTEED_WIN":
      return `${playerName(state, event.playerId)} overruns the level ${event.difficulty} guards without losses.`;
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
      return event.unitDefIds.length === 0
        ? `${playerName(state, event.playerId)} uses Diplomacy but finds no Neutral Unit cards to draw (empty decks) — the card is returned.`
        : `${playerName(state, event.playerId)} uses Diplomacy and draws ${event.unitDefIds
            .map((unitDefId) => unitDefId.split(".")[1] ?? unitDefId)
            .join(", ")}.`;
    case "DIPLOMACY_COMBAT_SKIPPED":
      return `${playerName(state, event.playerId)} uses Diplomacy to skip the level ${event.difficulty} Neutral Units and claim the field (no experience).`;
    case "UNIT_RECRUITED":
      return `${playerName(state, event.playerId)} ${event.kind === "recruit" ? "recruits" : "reinforces"} ${event.unitDefId.split(".")[1] ?? event.unitDefId} for ${formatCost(event.cost)}.${event.attackBuff ? ` BUFF: +${event.attackBuff} Attack in every combat.` : ""}${event.stackToken ? ` STACKED: carries a ${STACK_TOKEN_FEED_LABELS[event.stackToken]} Stack Token.` : ""}`;
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
      // Other viewers get the card id masked (player-view) — the card lands in
      // a hidden hand, so the feed only names it for the drawer.
      return event.cardId === "hidden"
        ? `${playerName(state, event.playerId)} opens Pandora's Box and draws a card.`
        : `${playerName(state, event.playerId)} opens Pandora's Box and draws ${cardName(event.cardId)}.`;
    case "ARTIFACT_DUG":
      return `${playerName(state, event.playerId)} digs up ${cardName(event.cardId)} and ${event.kept ? "keeps it" : "discards it"}.`;
    case "WAR_MACHINE_TRIGGERED":
      return event.message;
    case "GAME_WON":
      return `${playerName(state, event.playerId)} wins the game: ${event.reason}!`;
    case "VP_SCORING": {
      const winnerTotal =
        event.breakdown.find((row) => row.playerId === event.winnerPlayerId)?.total ?? 0;
      const standings = event.breakdown
        .map((row) => `${playerName(state, row.playerId)} ${row.total}`)
        .join(", ");
      return `Victory Points scored (${event.reason}): ${playerName(state, event.winnerPlayerId)} leads with ${winnerTotal} VP — ${standings}.`;
    }
    case "PLAYER_ELIMINATED":
      return `${playerName(state, event.playerId)} is eliminated — ${event.reason}. They become an observer.`;
    case "AFK_VOTE_STARTED":
      return event.message;
    case "AFK_VOTE_CAST":
      return `${playerName(state, event.playerId)} votes to ${event.vote === "kick" ? "kick the AFK player" : "keep waiting"}.`;
    case "AFK_VOTE_RESOLVED":
      return event.message;
    case "AFK_AUTO_KICKED":
      return event.message;
    case "TURN_TIME_EXPIRED":
      return event.message;
    case "ROOM_RANKED_CHANGED":
      return event.ranked
        ? `${roomMemberName(state, event.byClientId)} set this to a Ranked game (counts MMR).`
        : `${roomMemberName(state, event.byClientId)} set this to a Normal game (no MMR).`;
    case "START_CHECK_STARTED":
      return event.message;
    case "START_CHECK_CONFIRMED":
      return `${playerName(state, event.playerId)} is ready to start (${event.confirmed}/${event.needed}).`;
    case "START_CHECK_CANCELLED":
      return event.message;
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
    case "ASTROLOGERS_DISCARDED":
      return `Astrologers discard: ${event.name} (round ${event.round}).`;
    case "EVENT_CARD_DRAWN":
      return `Event (drawn by ${playerName(state, event.drawerId)}): ${event.name} — ${event.text}`;
    case "EVENT_AUCTION_BID_PLACED":
      return `${playerName(state, event.playerId)} places a secret bid.`;
    case "EVENT_AUCTION_RESOLVED":
      return event.winnerId
        ? `${playerName(state, event.winnerId)} wins ${cardName(event.cardId)} for ${event.amount} gold.`
        : `Nobody wins ${cardName(event.cardId)} — ${event.amount > 0 ? "the top bids tie" : "no bets"}; the card is discarded.`;
    case "EVENT_NOTE":
      return event.message;
    case "ASTROLOGERS_HAND_RESHUFFLED":
      return event.mode === "discard-all"
        ? `${event.name}: ${playerName(state, event.playerId)} must discard their whole hand (${event.discarded}) and draw ${event.drawn} new card${event.drawn === 1 ? "" : "s"}.`
        : `${event.name}: ${playerName(state, event.playerId)} must shuffle ${event.discarded} Spell/Artifact card${event.discarded === 1 ? "" : "s"} back and draw ${event.drawn} new.`;
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
    case "SANDBOX_SETUP_CHANGED":
    case "SANDBOX_COMBAT_BEGUN":
      return event.message;
    case "RUNE_LEVEL_REACHED":
      return `${playerName(state, event.playerId)} reaches Rune Level ${event.level} (${event.count} Runes) — the army-wide Rune buff turns on.`;
    case "COMPUTER_ADVANCE_REQUESTED":
      // Single-player pacing signal only — never surfaced in the feed
      // (ADVENTURE_FEED_CUES omits it); kept here for switch exhaustiveness.
      return `${playerName(state, event.playerId)} advances the computer.`;
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
    useSchoolExpert: action.type === "CAST_SPELL" ? Boolean(action.useSchoolExpert) : false,
    // Likewise the Basic X Magic (fetch permanent) "+3 Power" cast is a distinct
    // selection from the plain cast at the same target.
    useSchoolFetchExpert: action.type === "CAST_SPELL" ? Boolean(action.useSchoolFetchExpert) : false,
    // Polish Spell Book + scrolls: the same card id can be cast from hand,
    // Book, or a Scroll. Board targeting must keep those sources distinct so a
    // Book pick never resolves as a hand cast (or drops castEnablerCardId).
    fromSpellBook: Boolean(action.fromSpellBook),
    fromScroll: "fromScroll" in action && action.fromScroll ? action.fromScroll : undefined,
    castEnablerCardId:
      "castEnablerCardId" in action && action.castEnablerCardId ? action.castEnablerCardId : undefined
  });
}

export function sameCardSelection(selected: CardBoardAction | null, action: CardBoardAction): boolean {
  return Boolean(selected && cardSelectionKey(selected) === cardSelectionKey(action));
}

/**
 * Round-start cues a (re)connecting client must still be shown. The first
 * snapshot of a fresh connection primes every "seen" set with the events
 * already in the log — deliberately, so a reload never replays history. But
 * while the round-start Event/Astrologers BARRIER is still up, the table is
 * mid-resolution of this round's proclamation/Event: a player who reconnects
 * (or joins) right now would get the frozen table with no idea what everyone
 * is resolving, because the draw event that pops the overlay was primed as
 * "seen" (the "one player sees the event, the other doesn't" report). This
 * helper rebuilds the overlay cue(s) from live state for exactly that window;
 * once the barrier lifts it returns nothing and reconnects stay replay-free.
 *
 * Returned shapes mirror AstrologersProclamationCue / EventDrawnCue
 * (components/table/overlays.tsx) structurally — utils.ts cannot import them
 * without an import cycle (overlays.tsx imports this module).
 */
export function reconnectRoundStartCues(
  state: GameState,
  viewerPlayerId: PlayerId
): {
  astrologers: {
    id: string;
    cardId: string;
    name: string;
    text: string;
    image: string;
    expansion: string;
    ongoing: boolean;
    round: number;
    reshuffle?: { discarded: number; drawn: number };
  } | null;
  event: {
    id: string;
    cardId: string;
    name: string;
    text: string;
    image: string;
    expansion: string;
    round: number;
    drawerName: string;
    viewerIsDrawer: boolean;
  } | null;
} {
  const none = { astrologers: null, event: null };
  if (!isRoundStartEventBarrierActive(state)) {
    return none;
  }

  // Astrologers proclamations are drawn on even rounds; Fortress Events on the
  // odd Resource rounds — the same parity split the barrier itself uses.
  if (state.round % 2 === 0) {
    const cardId = state.adventure?.astrologers?.activeCardId ?? null;
    const card = cardId ? astrologersCardDefinitions[cardId] : undefined;
    if (!cardId || !card) {
      return none;
    }
    // Forced-hand proclamations (Big Cleanup, Annoying Lizard): surface the
    // viewer's own already-applied result, exactly like the live pop.
    let reshuffle: { discarded: number; drawn: number } | undefined;
    for (let i = state.eventLog.length - 1; i >= 0; i -= 1) {
      const logEvent = state.eventLog[i];
      if (
        logEvent.type === "ASTROLOGERS_HAND_RESHUFFLED" &&
        logEvent.round === state.round &&
        logEvent.cardId === cardId &&
        logEvent.playerId === viewerPlayerId
      ) {
        reshuffle = { discarded: logEvent.discarded, drawn: logEvent.drawn };
        break;
      }
    }
    return {
      astrologers: {
        id: `astro-reconnect-${state.round}-${cardId}`,
        cardId,
        name: card.name,
        text: card.text,
        image: card.image,
        expansion: card.expansion,
        ongoing: card.ongoing,
        round: state.round,
        ...(reshuffle ? { reshuffle } : {})
      },
      event: null
    };
  }

  for (let i = state.eventLog.length - 1; i >= 0; i -= 1) {
    const logEvent = state.eventLog[i];
    if (logEvent.type === "EVENT_CARD_DRAWN" && logEvent.round === state.round) {
      const card = eventCardDefinitions[logEvent.cardId];
      if (!card) {
        return none;
      }
      return {
        astrologers: null,
        event: {
          id: logEvent.id,
          cardId: logEvent.cardId,
          name: card.name,
          text: card.text,
          image: card.image,
          expansion: card.expansion,
          round: logEvent.round,
          drawerName: state.players[logEvent.drawerId]?.name ?? logEvent.drawerId,
          viewerIsDrawer: logEvent.drawerId === viewerPlayerId
        }
      };
    }
  }
  return none;
}

// ---------------------------------------------------------------------------
// Map-visit reward chips (treasure chest / mine / resource notice).
//
// Instead of a "mass of text" bullet list, a location visit's outcome is shown
// as a compact row of icon chips: the resource token / experience / morale
// glyph plus a short "+N" (or "+N/turn" income) label — the concrete result of
// the visit and its dice roll, with the correct board-game icons. Pure over the
// event log so it can be unit-tested (see notice-rewards.test.ts).
// ---------------------------------------------------------------------------

/** A single reward chip on a map-visit notice. */
export type NoticeReward = {
  /** Icon image path (rendered through `assetUrl`), when there is one. */
  icon?: string;
  /** Text/emoji glyph fallback when there is no image icon. */
  glyph?: string;
  /** Short label, e.g. "+3", "+2/turn". */
  label: string;
  /** Accessible full description. */
  title: string;
  tone: "gain" | "loss" | "neutral";
};

/** The board resource-token icon for a resource kind (falls back to a coin). */
function resourceRewardIcon(resource: ResourceKind): string {
  return (RESOURCE_ICONS as Record<string, string>)[resource] ?? RESOURCE_ICONS.gold;
}

/** Treasure-die face → chip icon + short label (the rolled GET image). */
const TREASURE_FACE_NOTICE: Record<
  "experience" | "artifact-search" | "resource-die" | "double-resource-die",
  { icon: string; label: string; title: string }
> = {
  experience: {
    icon: UI_REWARD_ICONS.treasureFaceExperience,
    label: "XP",
    title: "Treasure die: Gain 1 experience"
  },
  "artifact-search": {
    icon: UI_REWARD_ICONS.treasureFaceArtifact,
    label: "Art",
    title: "Treasure die: Search (2) the Artifact deck"
  },
  "resource-die": {
    icon: UI_REWARD_ICONS.treasureFaceResourceDie,
    label: "1×",
    title: "Treasure die: Roll 1 Resource die"
  },
  "double-resource-die": {
    icon: UI_REWARD_ICONS.treasureFaceDoubleResource,
    label: "2×",
    title: "Treasure die: Roll 2 Resource dice, choose one"
  }
};

/**
 * Derive the reward chips (and, for a mine, a resource icon for the notice) from
 * a visit's follow-on outcome events. Covers the material results — resources
 * gained, mine income (production), experience and morale — AND the structured
 * dice GETs (treasure / resource faces) so a treasure-chest notice shows the
 * rolled die images, not only the paid-out gold/XP. Events with no material
 * chip (e.g. an Artifact Search open) leave the chip list empty so the caller
 * can fall back to its text summary.
 */
export function noticeRewardsFromEvents(
  events: GameEvent[],
  _state: GameState
): { rewards: NoticeReward[]; iconImage?: string } {
  const rewards: NoticeReward[] = [];
  let iconImage: string | undefined;
  // Resource-die faces already show the paid-out token + amount. A follow-on
  // RESOURCES_GAINED for the same amounts used to double the icon (die face +
  // stockpile chip). Track shown amounts so each resource appears once.
  const resourceDieShown = new Map<ResourceKind, number>();
  for (const event of events) {
    switch (event.type) {
      case "ADVENTURE_DICE_ROLLED": {
        // Dice GET images — the face(s) the player rolled, shown as chips so a
        // treasure-chest notice is not just "+3 gold" text without the die.
        if (event.dice === "treasure" && event.treasureRolls?.length) {
          for (const face of event.treasureRolls) {
            const art = TREASURE_FACE_NOTICE[face];
            if (art) {
              rewards.push({
                icon: art.icon,
                label: art.label,
                title: art.title,
                tone: "neutral"
              });
            }
          }
        } else if (event.dice === "resource" && event.resourceRolls?.length) {
          for (const roll of event.resourceRolls) {
            rewards.push({
              icon: resourceRewardIcon(roll.resource),
              label: `+${roll.amount}`,
              title: `Resource die: +${roll.amount} ${formatResourceName(roll.resource)}`,
              tone: "gain"
            });
            resourceDieShown.set(
              roll.resource,
              (resourceDieShown.get(roll.resource) ?? 0) + roll.amount
            );
          }
        } else if (event.dice === "attack" && event.attackRolls?.length) {
          for (const face of event.attackRolls) {
            rewards.push({
              glyph: face > 0 ? `+${face}` : String(face),
              label: face > 0 ? `+${face}` : String(face),
              title: `Attack die: ${face > 0 ? "+" : ""}${face}`,
              tone: face >= 0 ? "gain" : "loss"
            });
          }
        }
        break;
      }
      case "RESOURCES_GAINED": {
        const parts: [number | undefined, ResourceKind][] = [
          [event.gold, "gold"],
          [event.buildingMaterials, "buildingMaterials"],
          [event.valuables, "valuables"]
        ];
        for (const [amount, resource] of parts) {
          if (!amount) {
            continue;
          }
          // Skip amounts already shown by the resource-die face chip(s).
          const alreadyShown = resourceDieShown.get(resource) ?? 0;
          if (alreadyShown > 0) {
            const remaining = Math.max(0, alreadyShown - amount);
            if (remaining === 0) {
              resourceDieShown.delete(resource);
            } else {
              resourceDieShown.set(resource, remaining);
            }
            // Fully covered by a die face → no second icon.
            if (alreadyShown >= amount) {
              continue;
            }
          }
          rewards.push({
            icon: resourceRewardIcon(resource),
            label: `+${amount}`,
            title: `+${amount} ${formatResourceName(resource)}`,
            tone: "gain"
          });
        }
        break;
      }
      case "PRODUCTION_CHANGED": {
        const sign = event.amount >= 0 ? "+" : "";
        rewards.push({
          icon: resourceRewardIcon(event.resource),
          label: `${sign}${event.amount}/turn`,
          title: `${sign}${event.amount} ${formatResourceName(event.resource)} production`,
          tone: event.amount >= 0 ? "gain" : "loss"
        });
        // A mine has no dedicated notice art — show its resource token instead of
        // the generic pickaxe emoji. The first positive production wins.
        if (iconImage === undefined && event.amount >= 0) {
          iconImage = resourceRewardIcon(event.resource);
        }
        break;
      }
      case "EXPERIENCE_GAINED": {
        rewards.push({
          icon: REWARD_GLYPH_ICONS.experience,
          label: `+${event.amount}`,
          title: `+${event.amount} experience`,
          tone: "gain"
        });
        break;
      }
      case "ABILITY_EMPOWER_TOKEN_GAINED": {
        rewards.push({
          icon: ABILITY_EMPOWER_TOKEN_ICON,
          label: event.surplus ? "token (full)" : "+1 token",
          title: event.surplus
            ? "Ability Empower token (already full — surplus auto-use)"
            : "Ability Empower token",
          tone: "gain"
        });
        break;
      }
      case "MORALE_CHANGED": {
        rewards.push({
          icon: moraleIcon(event.total),
          label: `${event.amount > 0 ? "+" : ""}${event.amount}`,
          title: `Morale ${event.amount > 0 ? "+" : ""}${event.amount}`,
          tone: event.amount >= 0 ? "gain" : "loss"
        });
        break;
      }
      default:
        break;
    }
  }
  return { rewards, iconImage };
}

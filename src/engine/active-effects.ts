import { isAdjacent } from "./battlefield";
import { appendEvent, nextEventNumber } from "./events";
import { hasUnitAbilityEffect } from "./unit-abilities";
import type {
  ActiveEffectDefinition,
  ActiveEffectState,
  CombatUnitState,
  EffectDurationDefinition,
  GameState,
  PlayerId,
  SourceRef,
  TargetRef
} from "./state";

type AttackContext = {
  attacker: CombatUnitState;
  defender: CombatUnitState;
  attackKind: "melee" | "ranged";
};

function getExpiresAtCombatRoundEnd(
  state: GameState,
  duration: EffectDurationDefinition
): number | undefined {
  if (!state.combat) {
    return undefined;
  }

  if (duration.type === "current-combat-round") {
    return state.combat.round;
  }

  if (duration.type === "next-combat-round") {
    return state.combat.round + 1;
  }

  if (duration.type === "combat-rounds") {
    return state.combat.round + Math.max(1, duration.rounds) - 1;
  }

  return undefined;
}

export function makeActiveEffect(
  state: GameState,
  effect: ActiveEffectDefinition,
  source: SourceRef,
  controllerId: PlayerId,
  target?: TargetRef
): ActiveEffectState {
  return {
    ...effect,
    id: `effect_${state.activeEffects.length + 1}_${nextEventNumber(state)}`,
    source,
    controllerId,
    target,
    startedRound: state.round,
    startedCombatRound: state.combat?.round,
    expiresAtCombatRoundEnd: getExpiresAtCombatRoundEnd(state, effect.duration),
    expiresAtTurnEndPlayerId: effect.duration.type === "current-turn" ? controllerId : undefined,
    usedRollEventIds: [],
    usedChoiceIds: [],
    usedCombatRoundNumbers: []
  };
}

export function effectAppliesToUnit(effect: ActiveEffectState, unit: CombatUnitState): boolean {
  if (effect.scope === "global") {
    return true;
  }

  if (effect.scope === "player") {
    return effect.controllerId === unit.controllerId;
  }

  return effect.target?.type === "unit" && effect.target.unitId === unit.id;
}

/**
 * Whether a unit deals "elemental damage" right now — either its printed trait
 * (the Elemental units) or a granted effect (Moandor's Liches VI specialty).
 * Elemental damage cannot be raised by attack cards or Attack tokens; debuffs
 * such as a Sorceress' Weakness still lower it (handled in the attack maths).
 */
export function unitDealsElementalDamage(state: GameState, unit: CombatUnitState): boolean {
  if (hasUnitAbilityEffect(unit, "DEALS_ELEMENTAL_DAMAGE")) {
    return true;
  }

  return state.activeEffects.some(
    (effect) =>
      effect.modifiers.some((modifier) => modifier.type === "ELEMENTAL_DAMAGE") &&
      effectAppliesToUnit(effect, unit)
  );
}

export function getActiveAttackBonus(state: GameState, context: AttackContext): number {
  return state.activeEffects.reduce((total, effect) => {
    if (!effectAppliesToUnit(effect, context.attacker)) {
      return total;
    }

    return (
      total +
      effect.modifiers.reduce((modifierTotal, modifier) => {
        if (modifier.type === "ATTACK_BONUS") {
          return modifierTotal + modifier.amount;
        }

        if (modifier.type !== "RANGED_ATTACK_BONUS" || context.attacker.type !== "ranged") {
          return modifierTotal;
        }

        if (modifier.nonAdjacentOnly && isAdjacent(context.attacker.position, context.defender.position)) {
          return modifierTotal;
        }

        return modifierTotal + modifier.amount;
      }, 0)
    );
  }, 0);
}

export function getActiveDefenseBonus(state: GameState, unit: CombatUnitState): number {
  return state.activeEffects.reduce((total, effect) => {
    if (!effectAppliesToUnit(effect, unit)) {
      return total;
    }

    return (
      total +
      effect.modifiers.reduce((modifierTotal, modifier) => {
        if (modifier.type !== "DEFENSE_BONUS") {
          return modifierTotal;
        }

        return modifierTotal + modifier.amount;
      }, 0)
    );
  }, 0);
}

export function getAttackRerollEffects(state: GameState, context: AttackContext): ActiveEffectState[] {
  return state.activeEffects.filter((effect) => {
    if (!effectAppliesToUnit(effect, context.attacker)) {
      return false;
    }

    return effect.modifiers.some(
      (modifier) => modifier.type === "ATTACK_DIE_REROLL" && modifier.maxUsesPerRoll > 0
    );
  });
}

export function expireEffectsForCombatRoundEnd(state: GameState, round: number): ActiveEffectState[] {
  const expired = state.activeEffects.filter((effect) => effect.expiresAtCombatRoundEnd === round);
  if (expired.length > 0) {
    state.activeEffects = state.activeEffects.filter((effect) => effect.expiresAtCombatRoundEnd !== round);
  }

  return expired;
}

export function expireEffectsForTurnEnd(state: GameState, playerId: PlayerId): ActiveEffectState[] {
  const expired = state.activeEffects.filter((effect) => effect.expiresAtTurnEndPlayerId === playerId);
  if (expired.length > 0) {
    state.activeEffects = state.activeEffects.filter((effect) => effect.expiresAtTurnEndPlayerId !== playerId);
  }

  return expired;
}

export function expireEffectsForCombatEnd(state: GameState): ActiveEffectState[] {
  const expired = state.activeEffects.filter(
    (effect) =>
      effect.duration.type === "combat" ||
      effect.duration.type === "current-combat-round" ||
      effect.duration.type === "next-combat-round"
  );
  if (expired.length > 0) {
    const expiredIds = new Set(expired.map((effect) => effect.id));
    state.activeEffects = state.activeEffects.filter((effect) => !expiredIds.has(effect.id));
  }

  return expired;
}

/**
 * Ongoing cards stay physically in play while their effect lasts. Whenever
 * every effect a held card created is gone — expired at the owner's next
 * turn, ended with the combat, consumed by a reroll, dispelled — the card
 * finally moves on: to the discard pile, or back to the hand when Knowledge
 * or Mysticism recalled it. Runs after every action, so any removal path is
 * covered without each of them knowing about held cards.
 */
export function releaseEndedOngoingCards(state: GameState): void {
  const liveEffectIds = new Set(state.activeEffects.map((effect) => effect.id));

  for (const player of Object.values(state.players)) {
    if (!player.ongoingCards?.length) {
      continue;
    }

    const stillHeld: NonNullable<typeof player.ongoingCards> = [];
    for (const held of player.ongoingCards) {
      if (held.effectIds.some((effectId) => liveEffectIds.has(effectId))) {
        stillHeld.push(held);
        continue;
      }

      if (held.returnTo === "hand") {
        player.hand.push(held.cardId);
        appendEvent(state, {
          type: "SPELL_RETURNED_TO_HAND",
          playerId: player.id,
          cardId: held.cardId,
          reason: "recalled after the ongoing effect ended"
        });
      } else {
        player.discard.push(held.cardId);
      }
    }

    player.ongoingCards = stillHeld;
  }
}

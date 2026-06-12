import { isAdjacent } from "./battlefield";
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
    id: `effect_${state.activeEffects.length + 1}_${state.eventLog.length + 1}`,
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

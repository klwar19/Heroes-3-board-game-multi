import { cardLibrary } from "@/data/cards/library";
import { isAdjacent } from "./battlefield";
import { appendEvent, nextEventNumber } from "./events";
import {
  hasIgnoreOngoingEffects,
  hasIgnoreOngoingSpellEffects,
  hasIgnoreParalysis,
  hasUnitAbilityEffect
} from "./unit-abilities";
import type {
  ActiveEffectDefinition,
  ActiveEffectState,
  CardDefinition,
  CombatUnitState,
  EffectDurationDefinition,
  GameState,
  PlayerId,
  SourceRef,
  TargetRef,
  UnitId
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
    expiresAtGameRound: effect.duration.type === "current-game-round" ? state.round : undefined,
    // "current-activation" binds to whichever unit is active now (Mirth, cast
    // during your unit's turn); "next-activation" binds to the target unit
    // (Forgetfulness). Either way the effect ends when that unit's activation
    // ends — see expireEffectsForActivationEnd.
    expiresAtActivationEndUnitId:
      effect.duration.type === "current-activation"
        ? (state.combat?.activeUnitId ?? undefined)
        : effect.duration.type === "next-activation"
          ? (target?.type === "unit" ? target.unitId : undefined)
          : undefined,
    usedRollEventIds: [],
    usedChoiceIds: [],
    usedCombatRoundNumbers: []
  };
}

/**
 * Intelligence (basic or expert): the player holds an effect letting them cast
 * a Spell at any time during combat — even off-turn, without one of their own
 * units being active. Used to lift the activation-timing gate on spell casts.
 */
export function playerHasSpellTimingFreedom(state: GameState, playerId: PlayerId): boolean {
  return state.activeEffects.some(
    (effect) =>
      effect.controllerId === playerId &&
      effect.modifiers.some((modifier) => modifier.type === "SPELL_CAST_ANYTIME")
  );
}

/**
 * Expert Intelligence: the player's Spell casts no longer count against the
 * one-Spell-per-combat-round limit (`spellLimitFor` returns Infinity for them).
 */
export function playerSpellCastsIgnoreLimit(state: GameState, playerId: PlayerId): boolean {
  return state.activeEffects.some(
    (effect) =>
      effect.controllerId === playerId &&
      effect.modifiers.some((modifier) => modifier.type === "SPELL_CAST_ANYTIME" && modifier.ignoreSpellLimit === true)
  );
}

/**
 * Shackles of War (house rule): while this player holds a CANNOT_SURRENDER_COMBAT
 * effect, their Hero cannot Surrender the current Combat. Retreat (and a
 * fought-out loss) is unaffected.
 */
export function playerCannotSurrenderCombat(state: GameState, playerId: PlayerId): boolean {
  return state.activeEffects.some(
    (effect) =>
      effect.controllerId === playerId &&
      effect.modifiers.some((modifier) => modifier.type === "CANNOT_SURRENDER_COMBAT")
  );
}

/**
 * Elemental Orbs (Driving Rain / Silt / Tempestuous Fire / the Firmament),
 * option A: the multiplier applied to the effective Power of a Spell `playerId`
 * is casting. Every in-play SPELL_POWER_DOUBLE effect whose school matches the
 * spell — or any of them when the spell is school-agnostic ("any", e.g. Magic
 * Arrow), mirroring how the school-locked +Power boosts qualify — doubles it.
 * Returns 1 when no orb applies (so a non-matching school is never touched).
 */
export function getSchoolPowerMultiplier(
  state: GameState,
  playerId: PlayerId,
  spellCard: CardDefinition | undefined
): number {
  const schools = spellCard?.spellSchools ?? [];
  let multiplier = 1;
  for (const effect of state.activeEffects) {
    if (effect.controllerId !== playerId) {
      continue;
    }
    for (const modifier of effect.modifiers) {
      if (
        modifier.type === "SPELL_POWER_DOUBLE" &&
        (schools.includes(modifier.school) || schools.includes("any"))
      ) {
        multiplier *= 2;
      }
    }
  }
  return multiplier;
}

/**
 * Whether an ongoing effect was created by a Spell card. Tower Gargoyles ignore
 * only those; Tower Titans ignore every ongoing effect whatever its source.
 */
function effectIsFromSpell(effect: ActiveEffectState): boolean {
  return effect.source.type === "card" && cardLibrary[effect.source.cardId]?.kind === "spell";
}

export function effectAppliesToUnit(effect: ActiveEffectState, unit: CombatUnitState): boolean {
  // Tower Titans ignore every ongoing effect on themselves (friendly or
  // hostile); Tower Gargoyles ignore the ones a Spell created. Checked first so
  // an immune unit reads its printed statistics as if the effect were not there.
  if (hasIgnoreOngoingEffects(unit)) {
    return false;
  }
  if (hasIgnoreOngoingSpellEffects(unit) && effectIsFromSpell(effect)) {
    return false;
  }

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

/**
 * Whether `unit` cannot gain a Paralysis token right now: either the printed
 * `ignore-paralysis` ability (Troglodytes / Gargoyles) or a Pendant of Second
 * Sight PARALYSIS_IMMUNITY effect placed on it for the Combat. Every Paralysis
 * source — the Blind Spell and the medusa-style follow-ups — checks this.
 */
export function unitImmuneToParalysis(state: GameState, unit: CombatUnitState): boolean {
  if (hasIgnoreParalysis(unit)) {
    return true;
  }

  return state.activeEffects.some(
    (effect) =>
      effect.modifiers.some((modifier) => modifier.type === "PARALYSIS_IMMUNITY") &&
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

/** Initiative including Haste/Slow and other lasting bonuses on the unit. */
export function effectiveInitiative(unit: CombatUnitState, activeEffects: ActiveEffectState[] = []): number {
  const bonus = activeEffects.reduce((total, effect) => {
    if (!effectAppliesToUnit(effect, unit)) {
      return total;
    }
    return (
      total +
      effect.modifiers.reduce((sum, modifier) => {
        // Haste / Slow / Cape of Velocity shift any unit's activation order.
        if (modifier.type === "INITIATIVE_BONUS") {
          return sum + modifier.amount;
        }
        // Expert Archery's "+1 initiative" lands on the player's Ranged units
        // only. The effect is player-scoped (effectAppliesToUnit already passed),
        // so the Ranged gate is the unit's own type — melee units are untouched.
        if (modifier.type === "RANGED_INITIATIVE_BONUS" && unit.type === "ranged") {
          return sum + modifier.amount;
        }
        return sum;
      }, 0)
    );
  }, 0);

  return unit.initiative + bonus;
}

/**
 * Cyra's Haste VI: extra Defense the unit gets only against an attacker with
 * strictly lower (effective) Initiative. Returns 0 unless `attacker` is slower.
 */
export function getConditionalDefenseBonus(
  state: GameState,
  defender: CombatUnitState,
  attacker: CombatUnitState
): number {
  if (effectiveInitiative(attacker, state.activeEffects) >= effectiveInitiative(defender, state.activeEffects)) {
    return 0;
  }

  return state.activeEffects.reduce((total, effect) => {
    if (!effectAppliesToUnit(effect, defender)) {
      return total;
    }
    return (
      total +
      effect.modifiers.reduce(
        (sum, modifier) => (modifier.type === "DEFENSE_VS_LOWER_INITIATIVE" ? sum + modifier.amount : sum),
        0
      )
    );
  }, 0);
}

/** Torosar's temporary Ballistas: number of EXTRA_BALLISTA grants a player holds. */
export function countExtraBallistas(state: GameState, playerId: PlayerId): number {
  return state.activeEffects.reduce((total, effect) => {
    if (effect.controllerId !== playerId) {
      return total;
    }
    return total + effect.modifiers.filter((modifier) => modifier.type === "EXTRA_BALLISTA").length;
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

/**
 * Forgetfulness: whether the unit currently holds a UNIT_CANNOT_ATTACK effect
 * (it may still move, but cannot perform an Attack action this activation).
 */
export function unitCannotAttack(state: GameState, unit: CombatUnitState): boolean {
  return state.activeEffects.some(
    (effect) =>
      effectAppliesToUnit(effect, unit) &&
      effect.modifiers.some((modifier) => modifier.type === "UNIT_CANNOT_ATTACK")
  );
}

/**
 * Expires the activation-scoped effects bound to `unitId` (Mirth's
 * "this Activation", Forgetfulness's "its next activation") when that unit's
 * activation ends — including when the activation is skipped.
 */
export function expireEffectsForActivationEnd(state: GameState, unitId: UnitId): ActiveEffectState[] {
  const expired = state.activeEffects.filter((effect) => effect.expiresAtActivationEndUnitId === unitId);
  if (expired.length > 0) {
    const expiredIds = new Set(expired.map((effect) => effect.id));
    state.activeEffects = state.activeEffects.filter((effect) => !expiredIds.has(effect.id));
  }

  return expired;
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

/**
 * Expires "current-game-round" effects (Torosar's Ballista IV grant) once a
 * later game round has begun — run at the start of every game round.
 */
export function expireEffectsForGameRoundEnd(state: GameState): ActiveEffectState[] {
  const expired = state.activeEffects.filter(
    (effect) => effect.expiresAtGameRound !== undefined && effect.expiresAtGameRound < state.round
  );
  if (expired.length > 0) {
    const expiredIds = new Set(expired.map((effect) => effect.id));
    state.activeEffects = state.activeEffects.filter((effect) => !expiredIds.has(effect.id));
  }

  return expired;
}

export function expireEffectsForCombatEnd(state: GameState): ActiveEffectState[] {
  const expired = state.activeEffects.filter(
    (effect) =>
      effect.duration.type === "combat" ||
      effect.duration.type === "current-combat-round" ||
      effect.duration.type === "next-combat-round" ||
      effect.duration.type === "current-activation" ||
      effect.duration.type === "next-activation"
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

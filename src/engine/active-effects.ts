import { cardLibrary } from "@/data/cards/library";
import { isAdjacent } from "./battlefield";
import { appendEvent, nextEventNumber } from "./events";
import { houseRuleEnabled } from "./house-rules";
import {
  getInnateFlatAttackBonus,
  getUnitAbilityDefinitions,
  hasAmplifyInitiativeIncrease,
  hasIgnoreOngoingEffects,
  hasIgnoreOngoingSpellEffects,
  hasIgnoreSpellAndSpecialtyNonDamage,
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
  SpellSchool,
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
  // Polish Spell Book reading: Expert Intelligence raises the limit by +1 rather
  // than lifting it (see spellLimitFor), so the "∞" affordance never applies under
  // that rule — the UI shows the real finite number instead.
  if (houseRuleEnabled(state, "polish-spell-book")) {
    return false;
  }
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
 * Crest of Valor (option B): when a Field the player visits would hand them a
 * negative Morale token, spend one held IGNORE_FIELD_NEGATIVE_MORALE shield to
 * ignore it. Removes exactly one matching player-scoped effect and returns true
 * when one was spent (so the caller skips the Morale loss); returns false when
 * the player holds no shield (the Morale loss applies normally). Single use —
 * each shield negates one field Morale loss.
 */
export function consumeIgnoreFieldNegativeMorale(state: GameState, playerId: PlayerId): boolean {
  const index = state.activeEffects.findIndex(
    (effect) =>
      effect.controllerId === playerId &&
      effect.modifiers.some((modifier) => modifier.type === "IGNORE_FIELD_NEGATIVE_MORALE")
  );
  if (index < 0) {
    return false;
  }
  state.activeEffects.splice(index, 1);
  return true;
}

const ELEMENTAL_SCHOOLS_FOR_POWER = ["air", "earth", "fire", "water"] as const;

/**
 * Elemental Orbs (Driving Rain / Silt / Tempestuous Fire / the Firmament),
 * option A: the multiplier applied to the effective Power of a Spell `playerId`
 * is casting. A matching-school Orb doubles. Magic Arrow (school "any") may use
 * only ONE school at a time (wiki), so at most one Orb doubles it — never the
 * product of every Orb in play.
 * Returns 1 when no orb applies (so a non-matching school is never touched).
 */
export function getSchoolPowerMultiplier(
  state: GameState,
  playerId: PlayerId,
  spellCard: CardDefinition | undefined
): number {
  const schools = spellCard?.spellSchools ?? [];
  // Magic Arrow: one school only — any single matching Orb is enough (×2), not ×2^n.
  if (schools.includes("any")) {
    for (const effect of state.activeEffects) {
      if (effect.controllerId !== playerId) {
        continue;
      }
      for (const modifier of effect.modifiers) {
        if (modifier.type === "SPELL_POWER_DOUBLE") {
          return 2;
        }
      }
    }
    return 1;
  }
  let multiplier = 1;
  for (const effect of state.activeEffects) {
    if (effect.controllerId !== playerId) {
      continue;
    }
    for (const modifier of effect.modifiers) {
      if (modifier.type === "SPELL_POWER_DOUBLE" && schools.includes(modifier.school)) {
        multiplier *= 2;
      }
    }
  }
  return multiplier;
}

/**
 * Adrienne's Fire Magic specialty: the extra Power `playerId` adds to a Spell of
 * the matching School. Sums every in-play SPELL_SCHOOL_POWER_BONUS the caster
 * controls whose school matches the spell. Magic Arrow (school "any") may use
 * only ONE school at a time (wiki), so different-school bonuses do NOT sum —
 * the highest single-school total wins. Returns 0 when none apply.
 * Added to the cast's base Power in getCurrentSpellPower.
 */
export function getSchoolPowerBonus(
  state: GameState,
  playerId: PlayerId,
  spellCard: CardDefinition | undefined
): number {
  const schools = spellCard?.spellSchools ?? [];
  if (schools.includes("any")) {
    let best = 0;
    for (const school of ELEMENTAL_SCHOOLS_FOR_POWER) {
      let forSchool = 0;
      for (const effect of state.activeEffects) {
        if (effect.controllerId !== playerId) {
          continue;
        }
        for (const modifier of effect.modifiers) {
          if (modifier.type === "SPELL_SCHOOL_POWER_BONUS" && modifier.school === school) {
            forSchool += modifier.amount;
          }
        }
      }
      if (forSchool > best) {
        best = forSchool;
      }
    }
    return best;
  }
  let bonus = 0;
  for (const effect of state.activeEffects) {
    if (effect.controllerId !== playerId) {
      continue;
    }
    for (const modifier of effect.modifiers) {
      if (modifier.type === "SPELL_SCHOOL_POWER_BONUS" && schools.includes(modifier.school)) {
        bonus += modifier.amount;
      }
    }
  }
  return bonus;
}

/**
 * Whether an ongoing effect was created by a Spell card. Tower Gargoyles ignore
 * only those; Tower Titans ignore every ongoing effect whatever its source.
 */
function effectIsFromSpell(effect: ActiveEffectState): boolean {
  return effect.source.type === "card" && cardLibrary[effect.source.cardId]?.kind === "spell";
}

/**
 * Whether an ongoing effect was created by a Hero Specialty card. The Fangarm
 * ignores non-damage effects from both spells AND specialties; this predicate
 * identifies the specialty side of that combined gate.
 */
function effectIsFromSpecialty(effect: ActiveEffectState): boolean {
  return effect.source.type === "card" && cardLibrary[effect.source.cardId]?.kind === "hero-specialty";
}

/**
 * Fangarm's printed exception is deliberately about the EFFECT of a Spell or
 * Specialty, not about being a legal target and not about damage. Keep this
 * predicate separate from the damage-immunity path so a mixed card can still
 * deal its damage while every non-damage rider is ignored.
 */
export function unitIgnoresCardNonDamage(unit: CombatUnitState, card: CardDefinition | undefined): boolean {
  return (
    hasIgnoreSpellAndSpecialtyNonDamage(unit) &&
    (card?.kind === "spell" || card?.kind === "hero-specialty")
  );
}

/**
 * THE single read of the FULL ranged-penalty waiver — "Ignore combat penalties"
 * (`IGNORE_RANGED_PENALTIES`: Magi / Sharpshooters / the neutral Halfling) plus
 * the player-scoped Ammo Cart standing effect (`RANGED_IGNORE_ALL_PENALTIES`).
 *
 * It lives HERE, below both `getAttackRollMode` (legal-actions.ts) and
 * `siegeRangedDamageReduction` (siege.ts), so the two ranged penalties the
 * waiver covers — the "roll two dice, keep the lower" Combat penalty and the
 * siege behind-Wall −1 damage — can never disagree about who is exempt.
 *
 * The unit ABILITY is printed "[unit_attack] Ignore combat penalties", so it
 * fires only on the unit's own declared attack, never on a Retaliation Attack;
 * the Ammo Cart's effect is a standing player-scoped effect and applies to
 * retaliations too. NOTE the deliberate split with the OTHER printed variant,
 * `IGNORE_RANGED_MELEE_PENALTY` ("No Adjacent Penalty" — Evil Eyes / Medusas /
 * Zealots / Titans): its card text says the long-range / behind-wall penalty
 * STILL applies, so it is not read here.
 */
export function ignoresAllRangedCombatPenalties(
  unit: CombatUnitState,
  state?: GameState,
  isRetaliation = false
): boolean {
  if (!isRetaliation && hasUnitAbilityEffect(unit, "IGNORE_RANGED_PENALTIES")) {
    return true;
  }
  return Boolean(
    state?.activeEffects.some(
      (effect) =>
        effectAppliesToUnit(effect, unit) &&
        effect.modifiers.some((modifier) => modifier.type === "RANGED_IGNORE_ALL_PENALTIES")
    )
  );
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
  // Fangarm: ignores all ongoing effects from spells AND specialties (but still
  // takes damage from them — damage is applied separately, not via activeEffects).
  if (hasIgnoreSpellAndSpecialtyNonDamage(unit) && (effectIsFromSpell(effect) || effectIsFromSpecialty(effect))) {
    return false;
  }

  // Army-variant gate (Oidana VI's "all your neutral units" rally): regardless
  // of scope, the effect only touches units of the named variant.
  if (effect.appliesOnlyToVariant && unit.variant !== effect.appliesOnlyToVariant) {
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
 * Recanter's Cloak: the combined spell-casting restriction in force right now,
 * folded across every SPELL_CAST_RESTRICTION effect on the table (both options
 * are global, so they bind both heroes). `lockAll` wins outright; otherwise
 * `minPower` is the strictest (largest) floor any active restriction imposes.
 * Read at the spell-resolution chokepoint and the cast-offer gate.
 */
export function getSpellCastRestriction(state: GameState): { lockAll: boolean; minPower: number } {
  let lockAll = false;
  let minPower = 0;
  for (const effect of state.activeEffects) {
    for (const modifier of effect.modifiers) {
      if (modifier.type !== "SPELL_CAST_RESTRICTION") {
        continue;
      }
      if (modifier.lockAll) {
        lockAll = true;
      }
      if (modifier.minPower !== undefined) {
        minPower = Math.max(minPower, modifier.minPower);
      }
    }
  }
  return { lockAll, minPower };
}

/**
 * Whether a Spell that resolves at `finalPower` is wiped out by a Recanter's
 * Cloak restriction — either a total lock, or a Power below the minimum (so a
 * Power-0 cast does nothing). The spell still resolves and is discarded; it
 * simply applies none of its effects, exactly like a shrugged-off Dwarf roll.
 */
export function spellNullifiedByRestriction(state: GameState, finalPower: number): boolean {
  const restriction = getSpellCastRestriction(state);
  return restriction.lockAll || finalPower < restriction.minPower;
}

/**
 * Whether a unit deals "elemental damage" right now — either its printed trait
 * (the Elemental units) or a granted effect (Moandor's Liches VI specialty).
 * Elemental damage cannot be raised by attack cards or Attack tokens; debuffs
 * such as a Sorceress' Weakness still lower it (handled in the attack maths).
 *
 * `attackKind` is the kind of the attack currently being resolved. The WOG Santa
 * Gremlin's Ice Bolt is `rangedOnly`: it deals elemental damage on a ranged shot
 * but NOT on a melee attack (in particular a forced melee Retaliation Attack),
 * which rolls the Attack die normally. When called without an `attackKind` (the
 * general "does this unit deal elemental damage at all" question — deck audits,
 * clone/summon checks, FX) a ranged-only source still counts.
 */
export function unitDealsElementalDamage(
  state: GameState,
  unit: CombatUnitState,
  attackKind?: "melee" | "ranged"
): boolean {
  for (const ability of getUnitAbilityDefinitions(unit)) {
    if (ability.implementationStatus !== "implemented" || ability.effect?.type !== "DEALS_ELEMENTAL_DAMAGE") {
      continue;
    }
    // A ranged-only elemental hit (Ice Bolt) does not apply to a melee attack.
    if (ability.effect.rangedOnly && attackKind !== undefined && attackKind !== "ranged") {
      continue;
    }
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

/**
 * Orb of Inhibition (option A): whether a global NULLIFY_CARD_DAMAGE effect is on
 * the table right now. While it is, every Spell/Hero-Specialty CARD deals 0
 * damage (read at reducedCardDamage). Side-agnostic, so a single grant nullifies
 * card damage for both armies for the rest of the Combat.
 */
export function cardDamageNullified(state: GameState): boolean {
  return state.activeEffects.some((effect) =>
    effect.modifiers.some((modifier) => modifier.type === "NULLIFY_CARD_DAMAGE")
  );
}

/**
 * Pendant of Negativity (option B): whether `unit` currently holds a
 * SPELL_SCHOOL_IMMUNE effect covering a Spell of `spellSchools`. A school-agnostic
 * spell ("any", e.g. Magic Arrow) counts as belonging to every School, so an air
 * immunity also turns it aside — matching the Pendant's own cancel side and the
 * Protection-from-X spells. Read through effectAppliesToUnit, so a Tower
 * Titan/Gargoyle that ignores the ongoing effect is not protected by it.
 */
export function unitImmuneToSpellSchoolsByEffect(
  state: GameState,
  unit: CombatUnitState,
  spellSchools: readonly SpellSchool[] | undefined
): boolean {
  if (!spellSchools || spellSchools.length === 0) {
    return false;
  }
  return state.activeEffects.some(
    (effect) =>
      effectAppliesToUnit(effect, unit) &&
      effect.modifiers.some(
        (modifier) =>
          modifier.type === "SPELL_SCHOOL_IMMUNE" &&
          spellSchools.some((school) => school === "any" || modifier.schools.includes(school))
      )
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

/**
 * The flat, unconditional Attack buff on a unit for DISPLAY (the unit inspector
 * / card chip). Two halves:
 *
 *  • every plain ATTACK_BONUS an applicable active effect grants it — the
 *    Bulwark Rune army-wide +Attack, Bless, Bloodlust, Offense, and the like;
 *  • the INNATE printed-ability flat bonuses live on the unit right now
 *    (`getInnateFlatAttackBonus`, own-attack reading) — Cove Haspids'
 *    "Vengeance" +2 after the Pack was knocked down to its Few side, the WoG
 *    own-attack +1, the Black Dragons' Stacked +3. These are read through the
 *    SAME helper the attack resolver folds into every attack, so the displayed
 *    number and the number the dice use cannot drift apart.
 *
 * Deliberately excludes the situational ranged/defender-conditional bonuses
 * (they depend on a specific target) and Attack tokens (surfaced as their own
 * chip), exactly as effectiveInitiative folds in only the lasting shifts. The
 * innate helper's own doc-comment lists what it leaves out and why.
 */
export function getDisplayAttackBonus(state: GameState, unit: CombatUnitState): number {
  const activeBonus = state.activeEffects.reduce((total, effect) => {
    if (!effectAppliesToUnit(effect, unit)) {
      return total;
    }
    return (
      total +
      effect.modifiers.reduce(
        (sum, modifier) => (modifier.type === "ATTACK_BONUS" ? sum + modifier.amount : sum),
        0
      )
    );
  }, 0);
  return activeBonus + getInnateFlatAttackBonus(unit, false);
}

/** Ingham's Zealots VI: does this unit have a lasting "ignores Defense" effect? */
export function hasActiveIgnoresDefense(state: GameState, unit: CombatUnitState): boolean {
  return state.activeEffects.some(
    (effect) =>
      effectAppliesToUnit(effect, unit) &&
      effect.modifiers.some((modifier) => modifier.type === "IGNORES_DEFENSE")
  );
}

/** Lord Haart (Necropolis) Dread Knights IV: enemy Retaliation Attacks against this unit roll at disadvantage. */
export function hasActiveRetaliationDisadvantage(state: GameState, unit: CombatUnitState): boolean {
  return state.activeEffects.some(
    (effect) =>
      effectAppliesToUnit(effect, unit) &&
      effect.modifiers.some((modifier) => modifier.type === "RETALIATION_AGAINST_DISADVANTAGE")
  );
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
        // Necklace of Swiftness's "+1 initiative to all your ground units": the
        // player-scoped effect already matched the controller, so the gate here
        // is the unit's own type — only GROUND units gain it (ranged and flying
        // units are untouched).
        if (modifier.type === "GROUND_INITIATIVE_BONUS" && unit.type === "ground") {
          return sum + modifier.amount;
        }
        return sum;
      }, 0)
    );
  }, 0);

  // Factory Armadillos (Pack) "Gathering Momentum": any genuine increase to this
  // unit's Initiative from an effect is amplified by one more point. Only a net
  // POSITIVE shift is amplified — a Slow (net-negative) is left untouched.
  const amplified = bonus > 0 && hasAmplifyInitiativeIncrease(unit) ? bonus + 1 : bonus;

  return unit.initiative + amplified;
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

/**
 * WOG commander Haste/Slow riders (ATTACK_BONUS_VS_INITIATIVE): the signed
 * Attack shift the ATTACKER gets against a defender that is strictly slower
 * ("slower", Shaman's Haste +1) or strictly faster ("faster", Sea Marshal's
 * Slow -1) than it, by effective Initiative at attack time.
 */
export function getConditionalAttackBonus(
  state: GameState,
  attacker: CombatUnitState,
  defender: CombatUnitState
): number {
  const attackerInitiative = effectiveInitiative(attacker, state.activeEffects);
  const defenderInitiative = effectiveInitiative(defender, state.activeEffects);
  return state.activeEffects.reduce((total, effect) => {
    if (!effectAppliesToUnit(effect, attacker)) {
      return total;
    }
    return (
      total +
      effect.modifiers.reduce((sum, modifier) => {
        if (modifier.type !== "ATTACK_BONUS_VS_INITIATIVE") {
          return sum;
        }
        const matches =
          modifier.comparison === "slower"
            ? defenderInitiative < attackerInitiative
            : defenderInitiative > attackerInitiative;
        return matches ? sum + modifier.amount : sum;
      }, 0)
    );
  }, 0);
}

/**
 * Astral Spirit's Counterstrike: whether the unit holds an UNLIMITED_RETALIATION
 * active effect — the effect twin of the ALLOW_UNLIMITED_RETALIATION ability
 * (read by shouldRetaliate; a Titan-style ongoing-immunity unit ignores it).
 */
export function unitHasUnlimitedRetaliationEffect(state: GameState, unit: CombatUnitState): boolean {
  return state.activeEffects.some(
    (effect) =>
      effectAppliesToUnit(effect, unit) &&
      effect.modifiers.some((modifier) => modifier.type === "UNLIMITED_RETALIATION")
  );
}

/**
 * Shield / Air Shield: extra Defense the unit gets only against an attacker of a
 * matching UNIT TYPE. Shield ("ground-or-flying") applies against any non-ranged
 * attacker; Air Shield ("ranged") applies against a ranged attacker — exactly as
 * the cards read ("against a ground or flying unit" / "attacked by a ranged
 * unit"). Returns 0 when no shield matches this attacker.
 */
export function getAttackerTypeDefenseBonus(
  state: GameState,
  defender: CombatUnitState,
  attacker: CombatUnitState
): number {
  const attackerIsRanged = attacker.type === "ranged";
  return state.activeEffects.reduce((total, effect) => {
    if (!effectAppliesToUnit(effect, defender)) {
      return total;
    }
    return (
      total +
      effect.modifiers.reduce((sum, modifier) => {
        if (modifier.type !== "DEFENSE_VS_ATTACKER_TYPE") {
          return sum;
        }
        const matches = modifier.attackerType === "ranged" ? attackerIsRanged : !attackerIsRanged;
        return matches ? sum + modifier.amount : sum;
      }, 0)
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

/**
 * Gerwulf's Ballista VI (ongoing): whether `playerId` currently holds a
 * BALLISTA_CHOOSE_TARGET effect, letting their Ballista's round-start shot pick
 * any enemy unit instead of being forced onto the lowest-initiative enemy.
 * The Ogre Leader commander's "Ballista Master" specialty grants the same
 * freedom passively while the commander lives (checked inline off PlayerState
 * so this module never imports the commanders engine layer).
 */
export function hasBallistaChooseTarget(state: GameState, playerId: PlayerId): boolean {
  const commander = state.players[playerId]?.commander;
  if (commander && !commander.dead && commander.slug === "ogre_leader") {
    return true;
  }
  return state.activeEffects.some(
    (effect) =>
      effect.controllerId === playerId &&
      effect.modifiers.some((modifier) => modifier.type === "BALLISTA_CHOOSE_TARGET")
  );
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
 * Berserk: whether the unit currently holds a BERSERK_FORCED_ATTACK effect. While
 * it does (its next activation), the unit must attack the nearest unit — the
 * legal-action layer and the neutral AI read this to force the attack, and
 * `canUnitAttack` lets the unit strike its own allies. A unit that ignores
 * ongoing spell effects (Tower Gargoyles/Titans) is not berserked — handled by
 * effectAppliesToUnit.
 */
export function unitIsBerserk(activeEffects: ActiveEffectState[], unit: CombatUnitState): boolean {
  return activeEffects.some(
    (effect) =>
      effectAppliesToUnit(effect, unit) &&
      effect.modifiers.some((modifier) => modifier.type === "BERSERK_FORCED_ATTACK")
  );
}

/**
 * Disrupting Ray: whether the unit currently holds a UNIT_ABILITY_SUPPRESSED
 * effect — its special abilities are switched off until the effect ends. Read
 * through effectAppliesToUnit, so a Tower Titan/Gargoyle that ignores the
 * ongoing effect is not suppressed.
 */
export function unitSpecialAbilitySuppressed(
  activeEffects: ActiveEffectState[],
  unit: CombatUnitState
): boolean {
  return activeEffects.some(
    (effect) =>
      effectAppliesToUnit(effect, unit) &&
      effect.modifiers.some((modifier) => modifier.type === "UNIT_ABILITY_SUPPRESSED")
  );
}

/**
 * Shaman's Puppet (option A): whether `unit` currently holds an
 * ATTACK_ROLL_DISADVANTAGE effect, forcing it to roll two Attack dice and keep
 * the lower for every attack until its activation ends. Read through
 * effectAppliesToUnit, so a Tower Titan/Gargoyle that ignores the ongoing
 * effect is unaffected, exactly like every other unit debuff.
 */
export function unitAttackRollDisadvantaged(state: GameState, unit: CombatUnitState): boolean {
  return state.activeEffects.some(
    (effect) =>
      effectAppliesToUnit(effect, unit) &&
      effect.modifiers.some((modifier) => modifier.type === "ATTACK_ROLL_DISADVANTAGE")
  );
}

/**
 * The mirror of `unitAttackRollDisadvantaged`: whether `unit` currently holds an
 * ATTACK_ROLL_ADVANTAGE effect, letting it roll two Attack dice and keep the
 * HIGHER. Read through effectAppliesToUnit like every other unit buff (a Tower
 * Titan/Gargoyle that ignores ongoing effects is unaffected). Today the only
 * source is the Polish Set Artifacts "rolls 2 dice and resolves the higher
 * result" tiers.
 */
export function unitAttackRollAdvantaged(state: GameState, unit: CombatUnitState): boolean {
  return state.activeEffects.some(
    (effect) =>
      effectAppliesToUnit(effect, unit) &&
      effect.modifiers.some((modifier) => modifier.type === "ATTACK_ROLL_ADVANTAGE")
  );
}

/**
 * Spirit of Oppression (option A): whether a global NO_ATTACK_DIE_REROLL effect
 * is on the table right now. While it is, no Attack-die reroll source is offered
 * to either player (see buildRerollSources) — neither the positive morale token
 * nor any Luck/Fortune/Mirth/unit-ability reroll. Side-agnostic, so a single
 * grant locks rerolls for both armies for the rest of the Combat.
 */
export function attackRerollsBlocked(state: GameState): boolean {
  return state.activeEffects.some((effect) =>
    effect.modifiers.some((modifier) => modifier.type === "NO_ATTACK_DIE_REROLL")
  );
}

/**
 * Refreshes every combat unit's `abilitiesSuppressed` derived flag from the
 * live UNIT_ABILITY_SUPPRESSED effects. Run after every action so the flag the
 * ability chokepoint (getUnitAbilityDefinitions) reads is always in sync with
 * the authoritative activeEffects — however the effect was just added (a
 * Disrupting Ray cast) or removed (Dispel, combat/round end). Keeping the flag
 * off the unit by default leaves it absent on snapshots that never suppress.
 *
 * Two passes: clear every flag first, then recompute. With all flags cleared,
 * the suppression test below reads each unit's RAW abilities, so a Tower
 * Titan's "ignore every ongoing effect" / a Gargoyle's "ignore ongoing spell
 * effects" passive (honoured inside effectAppliesToUnit) is always visible when
 * we decide whether the suppression even applies — those units shrug Disrupting
 * Ray off and are never flagged, with no dependency on the previous flag value.
 */
export function syncAbilitySuppression(state: GameState): void {
  if (!state.combat) {
    return;
  }
  for (const unit of Object.values(state.combat.units)) {
    delete unit.abilitiesSuppressed;
  }
  for (const unit of Object.values(state.combat.units)) {
    if (unitSpecialAbilitySuppressed(state.activeEffects, unit)) {
      unit.abilitiesSuppressed = true;
    }
  }
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
 * Expires "current-game-round" effects (Luck, Torosar's Ballista IV grant)
 * once a later game round has begun — run at the start of every game round.
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
  // Invariant: NO combat-scoped effect survives the combat it was made in. A
  // leaked round-stamped effect would otherwise match the same round NUMBER of
  // the NEXT battle (combat rounds restart at 1 every fight).
  const expired = state.activeEffects.filter(
    (effect) =>
      effect.duration.type === "combat" ||
      effect.duration.type === "current-combat-round" ||
      effect.duration.type === "next-combat-round" ||
      effect.duration.type === "combat-rounds" ||
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

      if (held.returnTo === "hand" || held.returnTo === "spellBook") {
        // A Book-cast ongoing spell recalled by Knowledge/Mysticism returns to
        // the Spell Book (a private zone); a hand-cast one to the hand.
        if (held.returnTo === "spellBook") {
          player.spellBook.push(held.cardId);
        } else {
          player.hand.push(held.cardId);
        }
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

/**
 * The catch-all twin of `releaseEndedOngoingCards`: a card whose play left a
 * LIVE lasting effect belongs in the Ongoing tray, never in the discard pile.
 *
 * The per-play `holdOngoingCardIfEffectCreated` hooks (spell cast, card play,
 * reaction, map cast-then-boost) only see the effects created INSIDE their own
 * action. An effect created LATER — a card that opens a Power/boost prompt and
 * only creates its effect when that prompt is answered (Fortune's map play) —
 * left its card sitting in the discard while the effect ran. This pass runs at
 * the same shared action tail and holds any such card, so no play path has to
 * know about the Ongoing tray.
 *
 * Deliberate scope:
 *  - `source.type === "card"` only — unit- and system-sourced effects have no
 *    physical card to hold, and a permanent in play / a removed or shared-deck
 *    card is not in the owner's discard, so those are all no-ops.
 *  - `instant` durations are skipped (nothing to show).
 *  - an effect already tracked by an Ongoing entry is skipped, so a second copy
 *    of the same card in the discard is never swept up by the first copy's
 *    effect, and an entry whose `returnTo` was re-marked by a Knowledge /
 *    Mysticism recall keeps it.
 */
export function holdLiveOngoingCardsFromDiscard(state: GameState): void {
  const alreadyHeld = new Set<string>();
  for (const player of Object.values(state.players)) {
    for (const held of player.ongoingCards ?? []) {
      for (const effectId of held.effectIds) {
        alreadyHeld.add(effectId);
      }
    }
  }

  // One entry per (owner, card): a card that made several effects is held once
  // and released only when the LAST of them ends, exactly like the play hooks.
  const groups = new Map<string, { playerId: PlayerId; cardId: string; effectIds: string[] }>();
  for (const effect of state.activeEffects) {
    if (effect.source.type !== "card" || effect.duration.type === "instant" || alreadyHeld.has(effect.id)) {
      continue;
    }
    const ownerId = effect.source.controllerId;
    if (!state.players[ownerId]) {
      continue;
    }
    const key = `${ownerId}#${effect.source.cardId}`;
    const group = groups.get(key);
    if (group) {
      group.effectIds.push(effect.id);
    } else {
      groups.set(key, { playerId: ownerId, cardId: effect.source.cardId, effectIds: [effect.id] });
    }
  }

  for (const group of groups.values()) {
    const player = state.players[group.playerId];
    const discardIndex = player.discard.lastIndexOf(group.cardId);
    if (discardIndex === -1) {
      continue;
    }
    player.discard.splice(discardIndex, 1);
    player.ongoingCards = player.ongoingCards ?? [];
    player.ongoingCards.push({ cardId: group.cardId, effectIds: group.effectIds, returnTo: "discard" });
  }
}

/** Player-requested early end for a card held in the Ongoing tray. */
export function discardOngoingCardVoluntarily(
  state: GameState,
  playerId: PlayerId,
  cardId: string
): void {
  const player = state.players[playerId];
  const heldIndex = player?.ongoingCards?.findIndex((held) => held.cardId === cardId) ?? -1;
  if (!player || !player.ongoingCards || heldIndex < 0) {
    throw new Error("That Ongoing card is not in play.");
  }

  // End the card's live effects, then let the SHARED release pass above move the
  // card to the zone IT belongs to. Splicing it out and pushing it straight to
  // the discard sent a Knowledge/Mysticism-recalled ongoing Spell (returnTo
  // "hand" / "spellBook") to the discard pile instead — a Book-cast Fly / Water
  // Walk recalled by Mysticism leaked OUT of the Spell Book into the deck cycle.
  const effectIds = new Set(player.ongoingCards[heldIndex].effectIds);
  state.activeEffects = state.activeEffects.filter((effect) => !effectIds.has(effect.id));
  releaseEndedOngoingCards(state);
}

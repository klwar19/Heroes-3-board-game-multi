/**
 * PvE monster CASTER planning (variant expansion §A2) — PURE, no mutation.
 *
 * This leaf answers "who casts, what, and at whom" for the `BOSS_SPELL_ROTATION`
 * ability. The RESOLUTION lives in `reducer.ts` (`applyMonsterSpellRoundStart`)
 * because it needs the module-private `reducedSpellDamage` there. Nothing here
 * imports reducer/adventure — no cycles.
 *
 * Determinism is the whole point: the rotation index is `(round − 1) %
 * spells.length` and every target is chosen by a total order over the combat's
 * living units, so replays, reconnects and hosted clients agree with NO seed.
 */

import {
  MONSTER_SPELLS,
  type MonsterSpellDefinition,
  type MonsterSpellId
} from "@/data/anime/monster-spells";
import type { UnitAbilityDefinition } from "@/data/units/abilities";
import { effectiveInitiative } from "./active-effects";
import { getUnitAbilityDefinitions } from "./unit-abilities";
import type { ActiveEffectState, CombatState, CombatUnitState, GameState } from "./state";

/**
 * Resolution HOOK. The actual cast resolution lives in `reducer.ts` (it needs
 * the module-private `reducedSpellDamage` so a monster bolt takes exactly the
 * gates a Faerie Bolt does), but the OTHER call site — `finalizeCombatStart`'s
 * opening round — is in `adventure-reducer.ts`, which must not import
 * `reducer.ts` (reducer imports IT; the codebase keeps that edge one-way). So
 * reducer registers its resolver into this shared leaf at module load, exactly
 * like `setTeleportArrivalHook` / `setHexEventEncounterHook` do for adventure.ts.
 *
 * Every entry point (client, server, `src/engine/index.ts`) loads `reducer.ts`,
 * so the hook is always registered in practice; `monster-spells.test.ts` pins
 * that with an explicit registration assertion.
 */
type MonsterSpellRoundStartFn = (state: GameState) => void;
let monsterSpellRoundStartImpl: MonsterSpellRoundStartFn | null = null;

export function setMonsterSpellRoundStartHook(resolver: MonsterSpellRoundStartFn): void {
  monsterSpellRoundStartImpl = resolver;
}

/** True once `reducer.ts` has registered its resolver (import-order guard). */
export function monsterSpellRoundStartHookRegistered(): boolean {
  return monsterSpellRoundStartImpl !== null;
}

/**
 * Resolve every `BOSS_SPELL_ROTATION` cast owed for the combat's CURRENT round
 * (idempotent per `unitId#round`). A no-op when no unit in the fight carries a
 * rotation — which is every combat in the shipped game outside a PvE caster.
 */
export function applyMonsterSpellRoundStart(state: GameState): void {
  monsterSpellRoundStartImpl?.(state);
}

function isAlive(unit: CombatUnitState): boolean {
  return unit.damage < unit.maxHealth;
}

/**
 * The FIRST implemented `BOSS_SPELL_ROTATION` ability this unit carries (a unit
 * with two rotations casts only the first — deliberate: two automatic casts a
 * round is not a shape any shipped boss has). Null when it is not a caster.
 */
export function monsterSpellAbility(unit: CombatUnitState): UnitAbilityDefinition | null {
  return (
    getUnitAbilityDefinitions(unit).find(
      (ability) =>
        ability.implementationStatus === "implemented" &&
        ability.effect?.type === "BOSS_SPELL_ROTATION" &&
        ability.effect.spells.length > 0
    ) ?? null
  );
}

/** The spell this unit casts at `round`, or null. Deterministic in (unit, round). */
export function monsterSpellForRound(
  unit: CombatUnitState,
  round: number
): MonsterSpellDefinition | null {
  const ability = monsterSpellAbility(unit);
  if (!ability || ability.effect?.type !== "BOSS_SPELL_ROTATION") {
    return null;
  }
  const spells: MonsterSpellId[] = ability.effect.spells;
  const index = ((Math.max(1, Math.round(round)) - 1) % spells.length + spells.length) % spells.length;
  return MONSTER_SPELLS[spells[index]] ?? null;
}

/** Every LIVING unit that must cast this round, in ascending `position` order. */
export function monsterSpellCasters(combat: CombatState): CombatUnitState[] {
  return Object.values(combat.units)
    .filter((unit) => isAlive(unit) && monsterSpellAbility(unit) !== null)
    .sort((left, right) => left.position - right.position);
}

/** Living units on the OTHER side from `unit`, ascending by position. */
export function monsterSpellEnemies(combat: CombatState, unit: CombatUnitState): CombatUnitState[] {
  return Object.values(combat.units)
    .filter((candidate) => isAlive(candidate) && candidate.controllerId !== unit.controllerId)
    .sort((left, right) => left.position - right.position);
}

/** Living units on the CASTER's own side (itself included), ascending by position. */
export function monsterSpellAllies(combat: CombatState, unit: CombatUnitState): CombatUnitState[] {
  return Object.values(combat.units)
    .filter((candidate) => isAlive(candidate) && candidate.controllerId === unit.controllerId)
    .sort((left, right) => left.position - right.position);
}

/**
 * The deterministic SINGLE target for a spell, or null when the spell has none
 * (a scope-"all" debuff, an ally buff, a hand drain — those are resolved over
 * the lists above). `activeEffects` is only read by the "fastest" picker.
 */
export function monsterSpellTarget(
  combat: CombatState,
  unit: CombatUnitState,
  spell: MonsterSpellDefinition,
  activeEffects: ActiveEffectState[] = []
): CombatUnitState | null {
  const kind = spell.kind;
  if (kind.k === "self-heal") {
    return isAlive(unit) ? unit : null;
  }
  if (kind.k === "spell-damage") {
    // Highest REMAINING health; ties break on the lowest board position (the
    // enemy list is already position-ascending, so a strict `>` keeps the first).
    let best: CombatUnitState | null = null;
    let bestRemaining = -Infinity;
    for (const enemy of monsterSpellEnemies(combat, unit)) {
      const remaining = enemy.maxHealth - enemy.damage;
      if (remaining > bestRemaining) {
        best = enemy;
        bestRemaining = remaining;
      }
    }
    return best;
  }
  if (kind.k === "enemy-debuff" && kind.scope === "fastest") {
    let best: CombatUnitState | null = null;
    let bestInitiative = -Infinity;
    for (const enemy of monsterSpellEnemies(combat, unit)) {
      const initiative = effectiveInitiative(enemy, activeEffects, combat);
      if (initiative > bestInitiative) {
        best = enemy;
        bestInitiative = initiative;
      }
    }
    return best;
  }
  return null;
}

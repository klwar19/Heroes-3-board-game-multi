import type { CombatUnitState, GameAction, GameState } from "../state";
import { getUnitAbilityDefinitions, isUnitDamageImmune, getInvulnerabilityActivation, getPlaceFactionCubeActivation, getOnRemovalDetonation, getPreemptiveRetaliation } from "../unit-abilities";
import { isArrowTowerUnit } from "../siege";
import { canUnitAttack, canUnitMoveAndAttack, getLegalMoveDestinations, isUnitAlive } from "../legal-actions";
import { isAdjacent } from "../battlefield";
import { bestDamage, randomTownStrikeValue as strikeValue, randomTownTokenValue as tokenValue, retaliationValue } from "../random-town-tactics";
import { unitRemovalHealth, unitThreatValue } from "./score";
import { getUnitSide } from "../adventure";

export type AbilityValue = { value: number; free: boolean; targetUnitId?: string };
const alive = (state: GameState) => Object.values(state.combat?.units ?? {}).filter(isUnitAlive);
const hp = (unit: CombatUnitState) => Math.max(0, unit.maxHealth - unit.damage);
const ready = (unit: CombatUnitState) => !unit.activatedThisRound && !unit.attackedThisActivation &&
  !unit.tokens?.some(token => token.kind === "paralysis");

export function activationUtilityValue(state: GameState, actor: CombatUnitState, kind: "couatl-invulnerability" | "automaton-cube"): number {
  if (kind === "couatl-invulnerability") {
    const ward = getInvulnerabilityActivation(actor);
    if (!ward || actor.usedInvulnerabilityThisCombat) return 0;
    const threat = alive(state).filter(enemy => enemy.controllerId !== actor.controllerId && ready(enemy))
      .reduce((sum, enemy) => sum + bestDamage(state, enemy, actor), 0);
    return Math.min(hp(actor), threat) + (threat >= hp(actor) ? 3 : 0) -
      (ward.endsActivation ? bestAttackOpportunity(state, actor) : 0);
  }
  const cube = getPlaceFactionCubeActivation(actor);
  if (!cube || (actor.factionCubes ?? 0) >= cube.maxCubes) return 0;
  const before = getOnRemovalDetonation(actor)?.amount ?? 0;
  const after = getOnRemovalDetonation({ ...actor, factionCubes: (actor.factionCubes ?? 0) + 1 })?.amount ?? 0;
  const gain = alive(state).filter(unit => unit.id !== actor.id && isAdjacent(unit.position, actor.position)).reduce((sum, unit) =>
    sum + (unit.controllerId === actor.controllerId ? -1 : 1) * (abilityDamageValue(unit, after) - abilityDamageValue(unit, before)), 0);
  // Preserve a free future detonation when not currently threatening allies.
  return gain || (alive(state).some(unit => unit.id !== actor.id && unit.controllerId === actor.controllerId && isAdjacent(unit.position, actor.position)) ? 0 : 0.5);
}

/** Common units of value for ability effects and the attack being given up.
 * These are static estimates; no reducer, random generator or simulation runs. */
export function abilityDamageValue(target: CombatUnitState, amount: number): number {
  if (isUnitDamageImmune(target)) return 0;
  const damage = Math.min(hp(target), Math.max(0, amount));
  return damage + (damage >= unitRemovalHealth(target) ? 2 + unitThreatValue(target) / 25 : 0);
}

export function abilityHealValue(state: GameState, target: CombatUnitState, amount: number): number {
  const healed = Math.min(target.damage, amount);
  if (healed <= 0) return 0;
  const incoming = alive(state).filter(enemy => enemy.controllerId !== target.controllerId && ready(enemy))
    .reduce((sum, enemy) => sum + bestDamage(state, enemy, target), 0);
  const saves = incoming >= hp(target) && incoming < hp(target) + healed;
  return healed * (1 + Math.min(0.6, unitThreatValue(target) / 100)) + (saves ? 3 : 0);
}

/** Attack buff value only counts an attack the recipient can still perform.
 * An expiring buff on an already-spent ally is not a useful heal substitute. */
function attackBuffValue(state: GameState, target: CombatUnitState, amount: number, future = false): number {
  if (!ready(target) && !future) return 0;
  const actor = future ? { ...target, activatedThisRound: false, attackedThisActivation: false, movedThisActivation: false } : target;
  const changed = { ...actor, attack: actor.attack + amount };
  return Math.max(0, ...alive(state).filter(enemy => enemy.controllerId !== target.controllerId).map(enemy =>
    abilityDamageValue(enemy, bestDamage(state, changed, enemy)) - abilityDamageValue(enemy, bestDamage(state, actor, enemy)))) *
    (ready(target) ? 1 : 0.6);
}

export function attackOpportunityValue(state: GameState, unit: CombatUnitState, target: CombatUnitState, position: number): number {
  const actor = { ...unit, position, movedThisActivation: unit.movedThisActivation || position !== unit.position };
  const board = { ...state, combat: { ...state.combat!, units: { ...state.combat!.units, [unit.id]: actor } } };
  const damage = strikeValue(board, actor, target);
  const retaliation = damage >= unitRemovalHealth(target) && !getPreemptiveRetaliation(target)
    ? 0 : retaliationValue(board, actor, target);
  return abilityDamageValue(target, damage) - retaliation * 0.8 - (retaliation >= hp(unit) ? unitThreatValue(unit) / 25 : 0);
}

export function bestAttackOpportunity(state: GameState, unit: CombatUnitState): number {
  const combat = state.combat;
  if (!combat || !ready(unit)) return 0;
  const positions = getLegalMoveDestinations(combat, unit, state);
  let best = 0;
  for (const target of alive(state).filter(enemy => enemy.controllerId !== unit.controllerId)) {
    if (canUnitAttack(combat, unit, target, state.activeEffects)) best = Math.max(best, attackOpportunityValue(state, unit, target, unit.position));
    if (unit.type !== "ranged") for (const position of positions) {
      if (canUnitMoveAndAttack(combat, unit, position, target, state)) best = Math.max(best, attackOpportunityValue(state, unit, target, position));
    }
  }
  return best;
}

/** Return null for commander commands handled by their existing dedicated
 * policy. No names or labels are parsed: valuation follows the actual effect. */
export function evaluateUnitAbility(state: GameState, action: GameAction): AbilityValue | null {
  if (!state.combat || (action.type !== "USE_UNIT_ABILITY" && action.type !== "SUMMON_DEMONS" && action.type !== "USE_GENIE_DECK_DRAW")) return null;
  const actor = state.combat.units[action.unitId];
  if (!actor) return null;
  if (action.type === "SUMMON_DEMONS") {
    const effect = getUnitAbilityDefinitions(actor).find(ability => ability.effect?.type === "SUMMON_OR_REINFORCE_DEMONS")?.effect;
    if (effect?.type !== "SUMMON_OR_REINFORCE_DEMONS") return { value: 0, free: false };
    const few = getUnitSide(effect.demonUnitDefId, "few");
    const pack = getUnitSide(effect.demonUnitDefId, "pack");
    const target = action.targetUnitId ? state.combat.units[action.targetUnitId] : undefined;
    const healthGain = action.mode === "summon" ? few?.health ?? 0 : action.mode === "stack" ? pack?.health ?? 0 :
      Math.max(0, (pack?.health ?? 0) - (target ? hp(target) : 0));
    return { value: healthGain * 0.7 + (action.mode === "summon" ? (few?.attack ?? 0) * 0.6 : 1), free: false };
  }
  if (action.type === "USE_GENIE_DECK_DRAW") {
    // Only public hand size and total cards; never inspect a hidden deck order.
    const player = state.players[actor.controllerId];
    return { value: player && player.deck.length + player.discard.length > 0 ? (player.hand.length < 3 ? 3 : 1.5) : 0, free: false };
  }
  if (action.type !== "USE_UNIT_ABILITY") return null;
  const definition = getUnitAbilityDefinitions(actor).find(ability => ability.id === action.abilityId);
  // No recognized effect (commander casts and AP skills live in their own
  // registries; decorative or suppressed abilities read as absent): report
  // "not valued here" so the caller's dedicated policy keeps scoring it.
  if (definition?.implementationStatus !== "implemented" || !definition.effect) return null;
  const effect = definition.effect;
  const target = action.target.type === "unit" ? state.combat.units[action.target.unitId] : undefined;
  switch (effect.type) {
    case "PLACE_TOKEN_ACTION": {
      const candidates = target ? [target] : alive(state);
      const ranked = candidates.map(candidate => ({ candidate, value: tokenValue(state, actor, candidate, effect) / 16 }))
        .sort((a, b) => b.value - a.value || a.candidate.id.localeCompare(b.candidate.id));
      return { value: ranked[0]?.value ?? 0, free: false, targetUnitId: ranked[0]?.candidate.id };
    }
    case "MGQ_WHITE_MAGIC_ACTION":
      return { value: !target ? 0 : action.mode === "heal" ? abilityHealValue(state, target, effect.healAmount) :
        target.id === actor.id ? 0 : attackBuffValue(state, target, effect.attackBonus), free: false };
    case "ACTIVATION_ATTACK_BUFF": {
      // Current-activation effects expire when the caster finishes, before a
      // different ally gets its normal activation.
      if (effect.duration.type === "current-activation" && (effect.endsActivation || target?.id !== actor.id)) {
        return { value: 0, free: !effect.endsActivation };
      }
      if (state.activeEffects.some(active => active.name === definition.name && active.source.type === "unit" &&
          active.source.unitId === actor.id && active.target?.type === "unit" && active.target.unitId === target?.id)) {
        return { value: 0, free: !effect.endsActivation };
      }
      const future = effect.duration.type !== "current-combat-round" && effect.duration.type !== "current-activation";
      const value = target && !(effect.endsActivation && target.id === actor.id && !future)
        ? attackBuffValue(state, target, effect.amount, future) : 0;
      // A buff that locks movement can strand a melee caster's own attack.
      const loss = effect.preventsMovement && !effect.endsActivation && !alive(state).some(enemy => enemy.controllerId !== actor.controllerId &&
        canUnitAttack(state.combat!, actor, enemy, state.activeEffects)) ? bestAttackOpportunity(state, actor) : 0;
      return { value: Math.max(0, value - loss), free: !effect.endsActivation };
    }
    case "MGQ_MAGE_MAGIC_ARROW_ACTION":
      return { value: target ? abilityDamageValue(target, effect.amount) : 0, free: true };
    case "MARK_ENEMY_FOR_NEXT_FRIENDLY_ATTACK": {
      const value = target ? Math.max(0, ...alive(state).filter(ally => ally.controllerId === actor.controllerId && ready(ally)).map(ally =>
        abilityDamageValue(target, bestDamage(state, { ...ally, attack: ally.attack + effect.attackBonus }, target)) -
        abilityDamageValue(target, bestDamage(state, ally, target)))) : 0;
      return { value, free: true };
    }
    case "SPLASH_ALLOCATION_ATTACK": {
      const candidates = alive(state).filter(enemy => enemy.controllerId !== actor.controllerId &&
        !isArrowTowerUnit(enemy) && isAdjacent(actor.position, enemy.position));
      // Greedy allocation mirrors the sequential picker and stops before any
      // optional friendly fire. Different targets cannot receive the same slot.
      let value = 0;
      for (const amount of effect.damageValues) {
        candidates.sort((a, b) => abilityDamageValue(b, amount) - abilityDamageValue(a, amount));
        const victim = candidates.shift();
        if (victim) value += abilityDamageValue(victim, amount);
      }
      return { value, free: false };
    }
    case "PLACE_ADJACENT_OBSTACLE_ACTION": {
      if (action.target.type !== "space") return { value: 0, free: false };
      const board = { ...state, combat: { ...state.combat, obstacles: [...(state.combat.obstacles ?? []), action.target.position] } };
      let value = 0;
      for (const ally of alive(state).filter(unit => unit.controllerId === actor.controllerId)) {
        const enemies = alive(state).filter(enemy => enemy.controllerId !== actor.controllerId);
        value += enemies.filter(ready).reduce((sum, enemy) => sum + bestDamage(state, enemy, ally) - bestDamage(board, enemy, ally), 0);
        if (ally.id !== actor.id && ready(ally)) value -= Math.max(0, bestAttackOpportunity(state, ally) - bestAttackOpportunity(board, ally));
      }
      return { value: Math.max(0, value), free: false };
    }
    default: return null;
  }
}

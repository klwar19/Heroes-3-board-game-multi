import { commanderReviveCost } from "@/data/commanders";
import { getUnitSide } from "../adventure";
import { unitsAdjacent } from "../hex-footprint";
import type { CombatState, CombatUnitState, GameState } from "../state";
import { getUnitAbilityDefinitions } from "../unit-abilities";
import { plannedAttackFaces } from "./battlefield-conditions";
import { recruitCostValue } from "./recruit-value";
import { unitRemainingHealth, unitRemovalHealth } from "./score";
import { estimatedStrikeDamage } from "./strike-value";

/**
 * Neutral-fight choices the ATTACKED player resolves for the guards: the
 * rulebook target tie ("If there is ever a tie between equally valid targets,
 * the player chooses which unit is attacked") and the BINH landing-cell pick
 * (a guard that must move to its fixed target lands where the player says).
 * The chooser is always the side the guard is about to hit, so both are
 * damage-control decisions: the hit goes where it costs the least army value
 * (read over the attacker's real Attack-die faces), and the guard is parked
 * where it binds the fewest of our shooters.
 */

/**
 * Printed value (gold-equivalent) of a combat unit's card: a Few is its
 * recruitment cost, a Pack that plus its reinforcement (the Pack side's cost).
 */
export function combatUnitValue(unit: CombatUnitState, state?: GameState): number {
  if (unit.commanderSlug) {
    // A fallen commander is revived for gold scaling with its main hero's level.
    const hero = state && Object.values(state.heroes).find(candidate =>
      candidate.controllerId === unit.controllerId && candidate.kind === "main");
    return commanderReviveCost(hero?.level ?? 1);
  }
  if (!unit.unitDefId) return 3;
  if (unit.variant === "pack") {
    return (recruitCostValue(getUnitSide(unit.unitDefId, "few")?.cost) + packFlipValue(unit)) || 3;
  }
  const side = getUnitSide(unit.unitDefId, unit.variant === "few" ? "few" : "neutral");
  return recruitCostValue(side?.cost) || 3;
}

/** What a Pack loses when its Pack bar is depleted and it flips to the Few side: its reinforcement. */
function packFlipValue(unit: CombatUnitState): number {
  if (unit.variant !== "pack" || !unit.unitDefId) return 0;
  return recruitCostValue(getUnitSide(unit.unitDefId, "pack")?.cost);
}

const RETALIATION_IGNORED_BY = new Set([
  "IGNORE_RETALIATION",
  "IGNORE_ADJACENT_RANGED_PENALTY_AND_RETALIATION",
  "IGNORE_RANGED_PENALTIES_AND_MELEE_RETALIATION",
]);

/** Conservative read of the engine's retaliation gate for a planned strike. */
function retaliates(combat: CombatState, attacker: CombatUnitState, defender: CombatUnitState, from: number): boolean {
  if (getUnitAbilityDefinitions(attacker).some(ability => ability.effect && RETALIATION_IGNORED_BY.has(ability.effect.type))) return false;
  if (defender.retaliatedThisRound &&
      !getUnitAbilityDefinitions(defender).some(ability => ability.effect?.type === "ALLOW_UNLIMITED_RETALIATION")) return false;
  if (attacker.type === "ranged" && !unitsAdjacent(combat, { ...attacker, position: from }, defender)) return false;
  return true;
}

/**
 * Net army value this ONE guard strike costs our side when it hits `target`:
 * expected removal / Pack-flip value over the attacker's die faces, minus the
 * expected value our surviving unit's retaliation takes back. Chip damage is a
 * small tie-break only (the body keeps fighting at the same strength).
 */
export function neutralStrikeCost(
  observed: GameState,
  attacker: CombatUnitState,
  target: CombatUnitState,
  from = attacker.position,
): number {
  // Partial (test / preview) views may omit the effect list the die readers scan.
  const state = observed.activeEffects ? observed : { ...observed, activeEffects: [] };
  const combat = state.combat;
  if (!combat) return 0;
  const faces = plannedAttackFaces(state, attacker, target, from, false);
  const removal = unitRemovalHealth(target);
  const bar = unitRemainingHealth(target);
  const value = combatUnitValue(target, state);
  const flip = packFlipValue(target);
  const canRetaliate = retaliates(combat, attacker, target, from);
  const counterFaces = canRetaliate ? plannedAttackFaces(state, target, attacker, target.position, true) : [];
  const attackerRemoval = unitRemovalHealth(attacker);
  let cost = 0;
  for (const face of faces) {
    const damage = estimatedStrikeDamage(attacker, target, from, false, face);
    if (damage >= removal) {
      cost += value;
      continue;
    }
    if (flip > 0 && damage >= bar) cost += flip;
    cost += 0.15 * Math.min(damage, removal) / Math.max(1, removal);
    if (canRetaliate && counterFaces.length > 0) {
      // A flipped Pack strikes back with its Few side's Attack.
      const flipped = flip > 0 && damage >= bar;
      const fewAttack = flipped && target.unitDefId ? getUnitSide(target.unitDefId, "few")?.attack : undefined;
      const survivor = { ...target, attack: fewAttack ?? target.attack };
      const kills = counterFaces.filter(counter =>
        estimatedStrikeDamage(survivor, attacker, survivor.position, true, counter) >= attackerRemoval).length;
      cost -= (kills / counterFaces.length) * combatUnitValue(attacker, state) * 0.5;
    }
  }
  return cost / Math.max(1, faces.length);
}

/**
 * How many of our shooters a guard landing on `cell` binds: a shooter with an
 * adjacent enemy may only strike that enemy, with the adjacent-shot penalty.
 * The guard's own target is excluded (its strike binds it wherever it lands).
 */
export function neutralLandingShooterBinds(
  combat: CombatState,
  playerId: string,
  guard: CombatUnitState,
  cell: number,
  targetId: string,
): number {
  const landed = { ...guard, position: cell };
  return Object.values(combat.units).filter(unit =>
    unit.controllerId === playerId && unit.id !== targetId && unit.type === "ranged" &&
    unit.position >= 0 && unitRemainingHealth(unit) > 0 && unitsAdjacent(combat, landed, unit)).length;
}

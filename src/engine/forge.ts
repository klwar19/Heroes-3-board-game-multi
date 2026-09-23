import { coreBuildingDefinitions } from "@/data/factions/core";
import { makeActiveEffect } from "./active-effects";
import { ATTACK_DIE_FACES, isAdjacent } from "./battlefield";
import { markUnitRemovedIfNeeded } from "./combat-units";
import { appendEvent } from "./events";
import { createSeededRandom } from "./random";
import { NEUTRAL_PLAYER_ID } from "./state";
import type { CombatUnitState, GameState } from "./state";
import { noteUnitDamagedForTokens } from "./tokens";
import { getUnitAbilityDefinitions, isUnitDamageImmune } from "./unit-abilities";
import type { ForgeVeterancyMechanic } from "@/data/units/abilities";
import { veteranDamage, veteranHeal, veteranTrigger } from "./faction-veterancy";
import { queueElementalChoice } from "./elemental-veterancy";

function alive(unit: CombatUnitState): boolean {
  return unit.damage < unit.maxHealth;
}

export function forgeVeterancy(unit: CombatUnitState, mechanic: ForgeVeterancyMechanic): boolean {
  return getUnitAbilityDefinitions(unit).some(ability => ability.implementationStatus === "implemented" && ability.effect?.type === "FORGE_VETERANCY" && ability.effect.mechanic === mechanic);
}

export function forgeDefenseBonus(state: GameState, attacker: CombatUnitState, defender: CombatUnitState): number {
  const combat = state.combat;
  const bruiserBreak = Object.values(combat?.units ?? {}).reduce((amount, source) =>
    amount + (source.townVeterancy?.forgeBruiserBreakTargets?.includes(defender.id) ? 1 : 0), 0);
  return (forgeVeterancy(defender, "bruiser-guard") && (attacker.type === "ranged" || attacker.type === "flying") ? 1 : 0)
    + (combat && defender.townVeterancy?.forgeJumpGuardRound === combat.round ? 1 : 0)
    - bruiserBreak
    - (forgeVeterancy(attacker, "grunt-mark") && attacker.townVeterancy?.markedTargets?.includes(defender.id) ? 3 : 0);
}

export function forgeDefenseToken(state: GameState, defender: CombatUnitState): boolean {
  return Object.values(state.combat?.units ?? {}).some(source => alive(source) && source.position >= 0 && defender.position >= 0 && source.id !== defender.id && forgeVeterancy(source, "grunt-cover") && isAdjacent(source.position, defender.position));
}

export function forgeAfterAttack(state: GameState, attacker: CombatUnitState, defender: CombatUnitState, retaliation: boolean, roll: number, dieCancelled: boolean): void {
  if (attacker.controllerId === defender.controllerId) return;
  if (forgeVeterancy(attacker, "open-wound") && alive(defender)) {
    const wounds = ((defender.townVeterancy ??= {}).forgeWoundSources ??= []);
    if (!wounds.includes(attacker.id)) wounds.push(attacker.id);
    veteranTrigger(state, attacker, "forge-vet-open-wound", defender);
  }
  if (forgeVeterancy(attacker, "grunt-mark")) {
    const marks = ((attacker.townVeterancy ??= {}).markedTargets ??= []);
    if (!marks.includes(defender.id)) marks.push(defender.id);
    veteranTrigger(state, attacker, "forge-vet-grunt-mark", defender);
  }
  if (forgeVeterancy(attacker, "bruiser-break") && !dieCancelled && roll <= 0 && alive(defender)) {
    const targets = ((attacker.townVeterancy ??= {}).forgeBruiserBreakTargets ??= []);
    if (!targets.includes(defender.id)) targets.push(defender.id);
    veteranTrigger(state, attacker, "forge-vet-bruiser-break", defender);
  }
  if (retaliation && alive(attacker) && forgeVeterancy(attacker, "tank-reposition")) {
    queueElementalChoice(state, { kind: "move-one", unitId: attacker.id, abilityId: "forge-vet-tank-reposition", maxDistance: 2, optional: true });
  }
}

export function forgeActivation(unit: CombatUnitState): void {
  if (unit.townVeterancy) delete unit.townVeterancy.forgeBruiserBreakTargets;
}

export function forgeUnitMoved(state: GameState): void {
  for (const unit of Object.values(state.combat?.units ?? {})) {
    if (!alive(unit) || unit.damage <= 0 || !forgeVeterancy(unit, "zombie-repair")) continue;
    const memory = (unit.townVeterancy ??= {});
    const round = state.combat!.round;
    const uses = memory.forgeZombieHealRound === round ? (memory.forgeZombieHealUses ?? 0) : 0;
    if (uses >= 2) continue;
    memory.forgeZombieHealRound = round;
    memory.forgeZombieHealUses = uses + 1;
    veteranHeal(state, unit, 1, "forge-vet-zombie-repair");
  }
}

export function forgeTankDied(state: GameState, tank: CombatUnitState): void {
  if (!forgeVeterancy(tank, "tank-death-burst") || tank.townVeterancy?.forgeTankExplosionUsed) return;
  (tank.townVeterancy ??= {}).forgeTankExplosionUsed = true;
  // A final unit's removal closes combat before another choice can open.
  // Resolve that burst immediately so its damage can still change the outcome.
  const units = Object.values(state.combat?.units ?? {});
  if (!units.some(unit => unit.id !== tank.id && alive(unit) && unit.controllerId === tank.controllerId)) {
    for (const enemy of units.filter(unit => alive(unit) && unit.controllerId !== tank.controllerId).sort((a, b) => a.id.localeCompare(b.id)).slice(0, 3)) {
      veteranDamage(state, tank, enemy, 1, "forge-vet-tank-death-burst");
    }
    return;
  }
  queueElementalChoice(state, { kind: "forge-death-burst", unitId: tank.id, abilityId: "forge-vet-tank-death-burst", amount: 1, remaining: 3, excludedTargetIds: [] });
}

export function forgeCombatRoundStart(state: GameState): void {
  for (const unit of Object.values(state.combat?.units ?? {})) {
    if (!alive(unit)) continue;
    for (const sourceId of unit.townVeterancy?.forgeWoundSources ?? []) {
      const source = state.combat?.units[sourceId];
      if (source && alive(unit)) veteranDamage(state, source, unit, 1, "forge-vet-open-wound");
    }
  }
}

/** One Attack die from the shared combat dice cursor (seeded, scriptable). */
function rollCombatAttackDie(state: GameState): number {
  const dice = state.combat!.dice;
  const rollIndex = dice.rollCount++;
  if (dice.scriptedRolls && rollIndex < dice.scriptedRolls.length) {
    return dice.scriptedRolls[rollIndex] ?? 0;
  }
  const faces = dice.faces.length > 0 ? dice.faces : ATTACK_DIE_FACES;
  return faces[createSeededRandom(`${dice.seed}#${rollIndex}`, { salt: false }).nextInt(0, faces.length - 1)] ?? 0;
}

/**
 * Forge Jump Troopers (ROUND_START_INITIATIVE_ROLL): at the start of every
 * Combat round each living unit with the ability rolls an Attack die; on a
 * face >= minRoll it gains +amount Initiative until the round ends. Runs
 * before the round's first activation is chosen, so the bonus reorders it.
 */
export function applyForgeRoundStartInitiativeRolls(state: GameState): void {
  const combat = state.combat;
  if (!combat || combat.outcome) {
    return;
  }
  const units = Object.values(combat.units)
    .filter((unit) => alive(unit) && unit.position >= 0)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const unit of units) {
    if (forgeVeterancy(unit, "jump-guard")) {
      const roll = rollCombatAttackDie(state);
      const success = roll >= 0;
      if (success) (unit.townVeterancy ??= {}).forgeJumpGuardRound = combat.round;
      appendEvent(state, { type: "UNIT_ABILITY_TRIGGERED", unitId: unit.id, abilityId: "forge-vet-jump-guard", message: `${unit.cardName} rolls ${roll > 0 ? "+" : ""}${roll} for Aerial Guard${success ? " and gains +1 Defense this round" : ""}.`, dice: { rolls: [roll], success, label: "Aerial Guard", caption: success ? "+1 Defense this round" : "No effect." } });
    }
    for (const ability of getUnitAbilityDefinitions(unit)) {
      if (ability.implementationStatus !== "implemented" || ability.effect?.type !== "ROUND_START_INITIATIVE_ROLL") {
        continue;
      }
      const { minRoll, amount } = ability.effect;
      const roll = rollCombatAttackDie(state);
      const success = roll >= minRoll;
      const face = roll > 0 ? `+${roll}` : `${roll}`;
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: unit.id,
        abilityId: success ? ability.id : `${ability.id}-roll`,
        message: `${unit.cardName} rolls ${face} for ${ability.name}${success ? ` — +${amount} Initiative this round` : " — no effect"}.`,
        dice: {
          rolls: [roll],
          success,
          label: ability.name,
          caption: success ? `+${amount} Initiative this round!` : "No effect."
        }
      });
      if (!success) {
        continue;
      }
      const effect = makeActiveEffect(
        state,
        {
          name: ability.name,
          scope: "unit",
          modifiers: [{ type: "INITIATIVE_BONUS", amount }],
          duration: { type: "current-combat-round" },
          polarity: "positive",
          removable: true
        },
        { type: "unit", unitId: unit.id, controllerId: unit.controllerId },
        unit.controllerId,
        { type: "unit", unitId: unit.id }
      );
      state.activeEffects.push(effect);
      appendEvent(state, {
        type: "ACTIVE_EFFECT_CREATED",
        effectId: effect.id,
        controllerId: effect.controllerId,
        name: effect.name,
        duration: effect.duration
      });
    }
  }
}

/**
 * Forge Toxic Moat: during a siege of a town with the Moat, an ATTACKING
 * player's ground or flying unit that destroys a Wall or the Gate takes the
 * printed damage (immunity respected; lethal damage removes it as usual).
 * Called from the single destruction chokepoint `destroyFortification`.
 * Ranged units never tear walls down as an attack, so they are exempt.
 */
export function applyToxicMoatWallDamage(state: GameState, byUnit: CombatUnitState | null): void {
  const combat = state.combat;
  const siege = combat?.siege;
  if (!combat || !siege || !byUnit || !alive(byUnit)) {
    return;
  }
  if (siege.townPlayerId === NEUTRAL_PLAYER_ID || byUnit.controllerId === siege.townPlayerId) {
    return;
  }
  if (byUnit.type !== "ground" && byUnit.type !== "flying") {
    return;
  }
  const fieldId = combat.context.kind === "player" ? combat.context.fieldId : undefined;
  const town = Object.values(state.towns).find(
    (candidate) =>
      candidate.controllerId === siege.townPlayerId && (fieldId === undefined || candidate.fieldId === fieldId)
  );
  const moatId = town?.buildings.find((id) => coreBuildingDefinitions[id]?.effect?.type === "TOXIC_MOAT");
  const moat = moatId ? coreBuildingDefinitions[moatId]?.effect : undefined;
  if (!moatId || moat?.type !== "TOXIC_MOAT" || moat.wallDamage <= 0) {
    return;
  }
  if (isUnitDamageImmune(byUnit)) {
    return;
  }
  const amount = moat.wallDamage;
  byUnit.damage += amount;
  appendEvent(state, {
    type: "TOWN_BUILDING_USED",
    playerId: siege.townPlayerId,
    buildingId: moatId,
    message: `Toxic Moat: ${byUnit.cardName} takes ${amount} damage for breaching the fortifications.`
  });
  const assigned = appendEvent(state, {
    type: "DAMAGE_ASSIGNED",
    source: { type: "system" },
    target: { type: "unit", unitId: byUnit.id },
    amount,
    damageKind: "effect"
  });
  noteUnitDamagedForTokens(state, byUnit, assigned.amount);
  markUnitRemovedIfNeeded(state, byUnit);
}

import { expireEffectsForCombatEnd } from "./active-effects";
import { getUnitSide } from "./adventure";
import { appendEvent } from "./events";
import { getRuleset } from "./ruleset";
import { isArrowTowerUnit } from "./siege";
import { getSelfRebirthAbility } from "./unit-abilities";
import { applyUnitCurrentSide, topTransform } from "./unit-transforms";
import { NEUTRAL_PLAYER_ID } from "./state";
import type { ActiveEffectState, CombatState, CombatUnitState, GameState, PlayerId } from "./state";

/**
 * Finalizes lethal damage on a combat unit, peeling the physical stack top
 * to bottom: a defeated specialty card on top (Sandro's Cloak) goes to its
 * owner's discard pile and reveals the card under it with the excess
 * damage; a defeated "Pack" flips to its "Few" side the same way; anything
 * still at or past its health is announced as removed. Shared by attacks,
 * ability damage and war machine shots.
 */
export function markUnitRemovedIfNeeded(state: GameState, unit: CombatUnitState): void {
  // Specialty cards covering the unit are defeated one by one, each leaving
  // the excess damage on whatever it reveals.
  while (unit.damage >= unit.maxHealth && topTransform(unit)) {
    const defeated = unit.transforms?.pop();
    if (!defeated) {
      break;
    }
    const excess = Math.max(0, unit.damage - defeated.health);
    applyUnitCurrentSide(unit, getRuleset(state));
    unit.damage = Math.min(unit.maxHealth, excess);

    const owner = state.players[unit.controllerId];
    owner?.discard.push(defeated.cardId);
    // The army card mirrors the stack so the loss survives the combat.
    const armyUnit = owner?.army.find((candidate) => candidate.id === unit.armyUnitId);
    if (armyUnit?.transforms) {
      armyUnit.transforms = armyUnit.transforms.filter((entry) => entry.cardId !== defeated.cardId);
      if (armyUnit.transforms.length === 0) {
        delete armyUnit.transforms;
      }
    }

    appendEvent(state, {
      type: "SPECIALTY_CARD_DEFEATED",
      unitId: unit.id,
      playerId: unit.controllerId,
      cardId: defeated.cardId,
      revealedName: unit.cardName,
      excessDamage: excess
    });
  }

  if (unit.damage < unit.maxHealth) {
    return;
  }

  if (unit.variant === "pack" && unit.unitDefId) {
    const fewSide = getUnitSide(unit.unitDefId, "few");
    if (fewSide) {
      const excess = unit.damage - unit.maxHealth;
      unit.variant = "few";
      unit.damage = 0;
      applyUnitCurrentSide(unit, getRuleset(state));
      unit.damage = Math.min(unit.maxHealth, Math.max(0, excess));

      appendEvent(state, {
        type: "UNIT_FLIPPED",
        unitId: unit.id,
        playerId: unit.controllerId,
        unitName: unit.name,
        excessDamage: Math.max(0, excess)
      });

      if (unit.damage < unit.maxHealth) {
        return;
      }
    }
  }

  // Phoenixes: "Once per Combat, when this unit's HP drops to 0, set it to 1
  // instead." The last-ditch self-save, taken automatically once any Pack→Few
  // flip is exhausted — the unit survives the killing blow at 1 Health. Works
  // against every damage source (attacks, ability damage, spells, war machines)
  // because they all funnel through here.
  const rebirth = getSelfRebirthAbility(unit);
  if (rebirth && !unit.usedRebirthThisCombat) {
    unit.usedRebirthThisCombat = true;
    unit.damage = Math.max(0, unit.maxHealth - 1);
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: unit.id,
      abilityId: rebirth.abilityId,
      message: `${unit.cardName} is reborn and clings to life at 1 Health.`
    });
    return;
  }

  appendEvent(state, {
    type: "UNIT_REMOVED",
    unitId: unit.id,
    playerId: unit.controllerId
  });

  // Pit Lords' "Summon Demons" triggers off any of your units leaving the
  // board: remember which controllers have lost a unit this combat.
  if (state.combat) {
    const removed = state.combat.unitRemovedControllerIds ?? [];
    if (!removed.includes(unit.controllerId)) {
      state.combat.unitRemovedControllerIds = [...removed, unit.controllerId];
    }
  }

  // Neutral Skeletons: a destroyed Skeleton guard lets the attacker's
  // Necropolis hero reinforce a bronze unit for free (resolved after combat).
  if (state.combat && unit.controllerId === NEUTRAL_PLAYER_ID && unit.unitDefId === "neutral.skeletons") {
    state.combat.skeletonGuardDefeated = true;
  }

  // A shot-down Arrow Tower also leaves the siege bookkeeping.
  if (state.combat?.siege?.arrowTowerUnitId === unit.id) {
    state.combat.siege.arrowTowerUnitId = null;
  }
}

export function livingControllerIds(combat: CombatState): Set<PlayerId> {
  return new Set(
    Object.values(combat.units)
      // "The attacker doesn't need to destroy it to win the Combat" — the
      // Arrow Tower alone never keeps the defender in the fight.
      .filter((unit) => unit.damage < unit.maxHealth && !isArrowTowerUnit(unit))
      .map((unit) => unit.controllerId)
  );
}

export function appendExpiredEffectEvents(
  state: GameState,
  effects: ActiveEffectState[],
  reason: "combat-round-ended" | "turn-ended" | "combat-ended"
): void {
  for (const effect of effects) {
    appendEvent(state, {
      type: "ACTIVE_EFFECT_EXPIRED",
      effectId: effect.id,
      reason
    });
  }
}

/**
 * Sets the combat outcome once one side has no living units left: combat
 * effects expire and the COMBAT_ENDED event fires. Idempotent. Called after
 * attacks, ability damage and war machine shots.
 */
export function finishCombatIfNeeded(state: GameState): boolean {
  const combat = state.combat;
  if (!combat || combat.outcome) {
    return Boolean(combat?.outcome);
  }

  const livingControllers = livingControllerIds(combat);
  const attackerAlive = livingControllers.has(combat.attackerPlayerId);
  const defenderAlive = livingControllers.has(combat.defenderPlayerId);

  if (attackerAlive === defenderAlive) {
    return false;
  }

  const winnerPlayerId = attackerAlive ? combat.attackerPlayerId : combat.defenderPlayerId;
  const defeatedPlayerId = attackerAlive ? combat.defenderPlayerId : combat.attackerPlayerId;
  const reason = "all-enemy-units-defeated";

  combat.outcome = {
    winnerPlayerId,
    defeatedPlayerId,
    reason
  };
  appendExpiredEffectEvents(state, expireEffectsForCombatEnd(state), "combat-ended");
  combat.activeUnitId = null;
  state.phase = "game-over";
  state.activePlayerId = winnerPlayerId;
  state.priorityPlayerId = null;

  appendEvent(state, {
    type: "COMBAT_ENDED",
    winnerPlayerId,
    defeatedPlayerId,
    reason
  });

  return true;
}

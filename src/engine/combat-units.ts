import { expireEffectsForCombatEnd } from "./active-effects";
import { getUnitSide } from "./adventure";
import { appendEvent } from "./events";
import type { ActiveEffectState, CombatState, CombatUnitState, GameState, PlayerId } from "./state";

/**
 * Finalizes lethal damage on a combat unit: defeated "Pack" units flip to
 * their "Few" side carrying the excess damage; anything still at or past its
 * health is announced as removed. Shared by attacks, ability damage and war
 * machine shots.
 */
export function markUnitRemovedIfNeeded(state: GameState, unit: CombatUnitState): void {
  if (unit.damage < unit.maxHealth) {
    return;
  }

  if (unit.variant === "pack" && unit.unitDefId) {
    const fewSide = getUnitSide(unit.unitDefId, "few");
    if (fewSide) {
      const excess = unit.damage - unit.maxHealth;
      unit.variant = "few";
      unit.cardName = `Few ${unit.name}`;
      unit.attack = fewSide.attack;
      unit.defense = fewSide.defense;
      unit.maxHealth = fewSide.health;
      unit.initiative = fewSide.initiative;
      unit.abilities = fewSide.abilities;
      unit.damage = Math.min(fewSide.health, Math.max(0, excess));
      if (unit.assets && fewSide.cardImage) {
        unit.assets.cardImage = fewSide.cardImage;
      }

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

  appendEvent(state, {
    type: "UNIT_REMOVED",
    unitId: unit.id,
    playerId: unit.controllerId
  });
}

export function livingControllerIds(combat: CombatState): Set<PlayerId> {
  return new Set(
    Object.values(combat.units)
      .filter((unit) => unit.damage < unit.maxHealth)
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

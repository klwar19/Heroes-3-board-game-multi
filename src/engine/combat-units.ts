import { expireEffectsForCombatEnd } from "./active-effects";
import { getUnitSide } from "./adventure";
import { appendEvent } from "./events";
import { armyUnitStacksActive } from "./house-rules";
import { getRuleset, unitSideRuleOverrides } from "./ruleset";
import { isArrowTowerUnit } from "./siege";
import { getOnRemovalDetonation, getSelfRebirthAbility, getUnitsAdjacentTo, isUnitDamageImmune } from "./unit-abilities";
import { applyUnitCurrentSide, topTransform } from "./unit-transforms";
import { NEUTRAL_PLAYER_ID } from "./state";
import type { ActiveEffectState, CombatState, CombatUnitState, GameState, PlayerId, UnitId } from "./state";

/**
 * Finalizes lethal damage on a combat unit, peeling the physical stack top
 * to bottom: a defeated specialty card on top (Sandro's Cloak) goes to its
 * owner's discard pile and reveals the card under it with the excess
 * damage; a defeated "Pack" flips to its "Few" side the same way; anything
 * still at or past its health is announced as removed. Shared by attacks,
 * ability damage and war machine shots.
 */
export function markUnitRemovedIfNeeded(state: GameState, unit: CombatUnitState): void {
  // Clone Spell: a Clone Token is a 1-Health copy. It never flips (Pack→Few),
  // never Rebirths, and leaves no army bookkeeping behind (it is not a recruited
  // unit) — any lethal damage simply removes it, and removing it also clears any
  // Clone chained off it. It also does NOT count as one of your units leaving the
  // board for the Pit Lords' "Summon Demons" trigger.
  if (unit.cloneOfUnitId) {
    if (unit.damage < unit.maxHealth) {
      return;
    }
    appendEvent(state, {
      type: "UNIT_REMOVED",
      unitId: unit.id,
      playerId: unit.controllerId
    });
    removeLinkedClones(state, unit.id);
    return;
  }

  // Specialty cards covering the unit are defeated one by one, each leaving
  // the excess damage on whatever it reveals.
  while (unit.damage >= unit.maxHealth && topTransform(unit)) {
    const defeated = unit.transforms?.pop();
    if (!defeated) {
      break;
    }
    const excess = Math.max(0, unit.damage - defeated.health);
    applyUnitCurrentSide(unit, getRuleset(state), unitSideRuleOverrides(state));
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

  // Rebirth: "Once per Combat, when this unit's HP drops to 0, set it to 1
  // instead." It clings to life FIRST — before the Stack Token absorb or the
  // Pack→Few flip — and KEEPS the unit on its current side AND its current Stack
  // Token. So a Pack unit (a Phoenix) stays Pack at 1 Health, and a Stacked bank
  // card (a Crypt Skeleton) stays Stacked at 1 Health: "rebirth keeps the Pack
  // status, going down only on the NEXT lethal hit" (the HOUSE RULE that EVERY
  // side carries Rebirth, applied as the first lethal-save). The Stack Token
  // absorb and the Pack→Few flip below are reached only once Rebirth is spent (or
  // the unit never had it). Works against every damage source because they all
  // funnel through this chokepoint.
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

  // Polish Unit Stacks (Rebirth already spent or absent): every paid Stack is
  // one full extra health layer (Pack or recruited Neutral). Remove layers
  // before the printed Pack can flip to Few, carrying ALL excess damage so one
  // large hit may consume several layers. Recomputing the side after each loss
  // drops the flat +1 Attack when the final Stack is gone. Neutrals have no
  // Pack→Few flip — once stacks and the body die, the card is removed as usual.
  while (
    armyUnitStacksActive(state) &&
    (unit.variant === "pack" || unit.variant === "neutral") &&
    (unit.armyStacks ?? 0) > 0 &&
    unit.damage >= unit.maxHealth
  ) {
    const excess = Math.max(0, unit.damage - unit.maxHealth);
    unit.armyStacks = Math.max(0, (unit.armyStacks ?? 0) - 1);
    applyUnitCurrentSide(unit, getRuleset(state), unitSideRuleOverrides(state));
    unit.damage = excess;

    appendEvent(state, {
      type: "ARMY_STACK_LOST",
      unitId: unit.id,
      playerId: unit.controllerId,
      unitName: unit.name,
      remainingStacks: unit.armyStacks,
      excessDamage: excess
    });
  }

  if (unit.damage < unit.maxHealth) {
    return;
  }

  // Creature Bank Stacked defenders (Rebirth already spent or absent): a Stack
  // Token absorbs the lethal blow — before any Pack→Few flip. "When it takes
  // damage equal to or greater than its Health, instead of removing the unit,
  // discard the Stack Token from it and deal any leftover damage, deducting it
  // from the new Health." (rulebook p.67). The token is discarded (reverting its
  // stat bonus via applyUnitCurrentSide) and the excess carries to the now-lower
  // Health.
  if (unit.bankUnit && unit.stackToken) {
    const excess = unit.damage - unit.maxHealth;
    unit.stackToken = null;
    unit.damage = 0;
    applyUnitCurrentSide(unit, getRuleset(state), unitSideRuleOverrides(state));
    unit.damage = Math.min(unit.maxHealth, Math.max(0, excess));

    appendEvent(state, {
      type: "STACK_TOKEN_DISCARDED",
      unitId: unit.id,
      playerId: unit.controllerId,
      unitName: unit.name,
      excessDamage: Math.max(0, excess)
    });

    if (unit.damage < unit.maxHealth) {
      return;
    }
  }

  if (unit.variant === "pack" && unit.unitDefId) {
    const fewSide = getUnitSide(unit.unitDefId, "few");
    if (fewSide) {
      const excess = unit.damage - unit.maxHealth;
      unit.variant = "few";
      // A Few card is no longer a Group and cannot carry Polish Stack layers.
      delete unit.armyStacks;
      unit.damage = 0;
      applyUnitCurrentSide(unit, getRuleset(state), unitSideRuleOverrides(state));
      unit.damage = Math.min(unit.maxHealth, Math.max(0, excess));
      // Cove Haspids (Few): record that this unit was knocked down from its
      // Pack side this combat, so the Few side's "Vengeance" +2 Attack turns on.
      unit.flippedDownThisCombat = true;

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

  // Clone Spell: "A Clone is removed from the Combat Board if its original unit
  // is removed from the Combat Board." Any Clone Token copying this unit goes
  // with it (and any Clone chained off that one).
  removeLinkedClones(state, unit.id);

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
  // This is the Neutral Skeletons card ability; the Crypt Creature Bank
  // Skeleton card is a different card and does NOT grant the reinforce.
  if (
    state.combat &&
    unit.controllerId === NEUTRAL_PLAYER_ID &&
    unit.unitDefId === "neutral.skeletons" &&
    !unit.bankUnit
  ) {
    state.combat.skeletonGuardDefeated = true;
  }

  // A shot-down Arrow Tower also leaves the siege bookkeeping.
  if (state.combat?.siege?.arrowTowerUnitId === unit.id) {
    state.combat.siege.arrowTowerUnitId = null;
  }

  // Factory Automaton: now that the unit has truly left the board (not flipped,
  // not reborn), detonate — dealing its blast to every adjacent unit. A blast
  // that removes another adjacent Automaton recurses back through this function,
  // chain-detonating down a line.
  applyOnRemovalDetonation(state, unit);
}

/**
 * Factory Automaton detonation: when an Automaton is removed it deals its blast
 * damage to every adjacent unit — friend AND foe — exactly once (the
 * `detonatedThisCombat` flag survives the chokepoint being re-entered). A blast
 * that removes another adjacent Automaton recurses through markUnitRemovedIfNeeded,
 * so a row of Automatons chain-detonates. The controller's Frederick specialty
 * adds PlayerState.automatonDetonationBonus to the printed amount. No retaliation,
 * no attack roll — flat "effect" damage, like a Magog splash.
 */
function applyOnRemovalDetonation(state: GameState, unit: CombatUnitState): void {
  if (unit.detonatedThisCombat || !state.combat) {
    return;
  }
  const detonation = getOnRemovalDetonation(unit);
  if (!detonation) {
    return;
  }
  unit.detonatedThisCombat = true;
  const bonus = Math.max(0, state.players[unit.controllerId]?.automatonDetonationBonus ?? 0);
  const amount = detonation.amount + bonus;
  if (amount <= 0) {
    return;
  }
  appendEvent(state, {
    type: "UNIT_ABILITY_TRIGGERED",
    unitId: unit.id,
    abilityId: detonation.abilityId,
    message: `${unit.cardName} detonates for ${amount} damage to each adjacent unit.`
  });
  for (const neighbour of getUnitsAdjacentTo(state.combat, unit)) {
    // A chained blast may already have removed this neighbour — never re-hit a
    // unit that has left the board.
    if (neighbour.damage >= neighbour.maxHealth) {
      continue;
    }
    // A Factory Couatl with its invulnerability up ignores the blast entirely.
    if (isUnitDamageImmune(neighbour)) {
      continue;
    }
    neighbour.damage += amount;
    appendEvent(state, {
      type: "DAMAGE_ASSIGNED",
      source: { type: "unit", unitId: unit.id, controllerId: unit.controllerId },
      target: { type: "unit", unitId: neighbour.id },
      amount,
      damageKind: "effect"
    });
    markUnitRemovedIfNeeded(state, neighbour);
  }
}

/**
 * Clone Spell: remove every Clone Token whose original (`removedUnitId`) has just
 * left the Combat Board, cascading to any Clone chained off a removed Clone. Each
 * is taken straight to 0 Health and announced removed — Clones never flip or
 * Rebirth, so there is no peeling to do.
 */
function removeLinkedClones(state: GameState, removedUnitId: UnitId): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }
  for (const clone of Object.values(combat.units)) {
    if (clone.cloneOfUnitId === removedUnitId && clone.damage < clone.maxHealth) {
      clone.damage = clone.maxHealth;
      appendEvent(state, {
        type: "UNIT_REMOVED",
        unitId: clone.id,
        playerId: clone.controllerId
      });
      removeLinkedClones(state, clone.id);
    }
  }
}

/**
 * Player-vs-player Retreat / Surrender is a *start of combat* decision: a hero
 * may flee only before the fighting actually begins. The escape window closes
 * the moment ANY unit has activated, moved or attacked this combat — after that
 * the only ways out are winning, being defeated, or a fought-out loss. Keeping
 * the escape available all through round 1 was the "Retreat button always shows"
 * bug: it lingered on every player's screen (including the idle defender's,
 * mid-attack) and a stray click ended the fight as an instant loss.
 */
export function pvpEscapeWindowOpen(combat: CombatState): boolean {
  if (combat.outcome || combat.setup || combat.round !== 1) {
    return false;
  }
  const fightingBegun = Object.values(combat.units).some(
    (unit) =>
      unit.activatedThisRound ||
      unit.movedThisActivation ||
      Boolean(unit.attackedThisActivation) ||
      (unit.attacksThisActivation ?? 0) > 0
  );
  return !fightingBegun;
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
  reason: "combat-round-ended" | "turn-ended" | "combat-ended" | "game-round-ended" | "activation-ended"
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

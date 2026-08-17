import { expireEffectsForCombatEnd } from "./active-effects";
import { getUnitSide } from "./adventure";
import { combatFightingHasBegun } from "./combat-timing";
import { appendEvent } from "./events";
import { armyUnitStacksActive } from "./house-rules";
import { getRuleset, unitSideRuleOverrides } from "./ruleset";
import { RAID_BOSS_LAYER_BREAK_GOLD } from "./raid-bosses";
import { isArrowTowerUnit } from "./siege";
import {
  getOnRemovalDetonation,
  getReapOnAdjacentRemoval,
  getSelfRebirthAbility,
  getSelfRebirthRollAbility,
  getUnitsAdjacentTo,
  isUnitDamageImmune
} from "./unit-abilities";
import { createSeededRandom } from "./random";
import { commanderArtifactBonusesForUnit } from "./commander-artifacts";
import { applyUnitCurrentSide, topTransform } from "./unit-transforms";
import { NEUTRAL_PLAYER_ID } from "./state";
import type { ActiveEffectState, CombatState, CombatUnitState, GameState, PlayerId, UnitId } from "./state";

/**
 * Consume health bonuses that protect only the current physical health bar.
 * The generic combat-long bonuses stay in `combatMaxHealthBonus` and continue
 * onto the next side/layer; Polish Balance First Aid is deliberately removed.
 */
function consumeCurrentLifeHealthBonuses(state: GameState, unit: CombatUnitState): void {
  const activeEffects = state.activeEffects ?? [];
  const consumed = activeEffects.filter(
    (effect) =>
      effect.target?.type === "unit" &&
      effect.target.unitId === unit.id &&
      effect.modifiers.some(
        (modifier) => modifier.type === "HEALTH_BONUS" && modifier.currentUnitLifeOnly === true
      )
  );
  if (consumed.length === 0) {
    return;
  }

  const consumedIds = new Set(consumed.map((effect) => effect.id));
  const amount = consumed.reduce(
    (total, effect) =>
      total +
      effect.modifiers.reduce(
        (effectTotal, modifier) =>
          effectTotal +
          (modifier.type === "HEALTH_BONUS" && modifier.currentUnitLifeOnly ? modifier.amount : 0),
        0
      ),
    0
  );
  state.activeEffects = activeEffects.filter((effect) => !consumedIds.has(effect.id));
  const remaining = Math.max(0, (unit.combatMaxHealthBonus ?? 0) - amount);
  if (remaining > 0) {
    unit.combatMaxHealthBonus = remaining;
  } else {
    delete unit.combatMaxHealthBonus;
  }
}

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
    consumeCurrentLifeHealthBonuses(state, unit);
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

  // Phoenix Plate: the commander's once-per-combat immediate 1-Health revival
  // shares the established Rebirth charge/order and therefore protects against
  // every damage source that reaches this removal chokepoint.
  if (
    unit.commanderSlug &&
    commanderArtifactBonusesForUnit(state, unit).combatRebirth &&
    !unit.usedRebirthThisCombat
  ) {
    unit.usedRebirthThisCombat = true;
    unit.damage = Math.max(0, unit.maxHealth - 1);
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: unit.id,
      abilityId: "commander-artifact-phoenix-plate",
      targetUnitId: unit.id,
      message: `${unit.cardName}'s Phoenix Plate revives it at 1 Health.`
    });
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

  // MGQ Hero Job: one rolled death save per combat. The attempt is consumed on
  // both success and failure; using the shared combat-die cursor keeps replay,
  // multiplayer and scripted tests deterministic.
  const rolledRebirth = getSelfRebirthRollAbility(unit);
  if (rolledRebirth && !unit.usedRebirthThisCombat && state.combat) {
    unit.usedRebirthThisCombat = true;
    const dice = state.combat.dice;
    const rollIndex = dice.rollCount++;
    const faces = dice.faces.length > 0 ? dice.faces : [-1, -1, 0, 0, 1, 1];
    const roll = dice.scriptedRolls && rollIndex < dice.scriptedRolls.length
      ? (dice.scriptedRolls[rollIndex] ?? 0)
      : faces[createSeededRandom(`${dice.seed}#${rollIndex}`, { salt: false }).nextInt(0, faces.length - 1)] ?? 0;
    if (roll <= rolledRebirth.maxRoll) {
      unit.damage = Math.max(0, unit.maxHealth - 1);
      appendEvent(state, {
        type: "UNIT_ABILITY_TRIGGERED",
        unitId: unit.id,
        abilityId: rolledRebirth.abilityId,
        message: `${unit.cardName} rolls ${roll >= 0 ? "+" : ""}${roll}: Heroic Return succeeds at 1 Health.`
      });
      return;
    }
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: unit.id,
      abilityId: rolledRebirth.abilityId,
      message: `${unit.cardName} rolls +${roll}: Heroic Return fails.`
    });
  }

  // Sonya — Unbreakable Bond. Rebirth retains first priority; once it is spent
  // (or absent), Sonya intercepts the first lethal state before Stack layers,
  // Stack Tokens and Pack→Few, exactly like a separate absorb layer. The bonded
  // side remains at 1 Health and every point of excess is prevented; Sonya then
  // takes 1 real damage through this same removal chokepoint.
  const combat = state.combat;
  const owner = state.players[unit.controllerId];
  const sonya = combat?.units[`unit_${unit.controllerId}_commander`];
  const bondAlreadyUsed = combat?.sonyaBondRedirectUsedBy?.includes(unit.controllerId) ?? false;
  if (
    combat &&
    unit.armyUnitId &&
    owner?.commander?.slug === "sonya" &&
    owner.commander.bondedArmyUnitId === unit.armyUnitId &&
    sonya?.commanderSlug === "sonya" &&
    sonya.id !== unit.id &&
    sonya.damage < sonya.maxHealth &&
    !bondAlreadyUsed
  ) {
    combat.sonyaBondRedirectUsedBy = [...(combat.sonyaBondRedirectUsedBy ?? []), unit.controllerId];
    unit.damage = Math.max(0, unit.maxHealth - 1);
    sonya.damage += 1;
    appendEvent(state, {
      type: "COMMANDER_SPECIALTY_TRIGGERED",
      playerId: unit.controllerId,
      commanderSlug: "sonya",
      specialtyId: "unbreakable-bond",
      message: `Sonya takes 1 damage for ${unit.cardName}; Unbreakable Bond leaves it at 1 Health.`
    });
    markUnitRemovedIfNeeded(state, sonya);
    return;
  }

  // Polish Unit Stacks (Rebirth already spent or absent): every paid Stack is
  // one full extra health layer (Pack or recruited Neutral). Remove layers
  // before the printed Pack can flip to Few, carrying ALL excess damage so one
  // large hit may consume several layers. Recomputing the side after each loss
  // drops the flat +1 Attack when the final Stack is gone. Neutrals have no
  // Pack→Few flip — once stacks and the body die, the card is removed as usual.
  // Raid bosses (§6.5.2) ride the SAME layer machinery unconditionally: their
  // armyStacks ARE the printed health bars, so a boss sheds layers even on a
  // table without the Polish/anime Unit-Stacks rule (the bankUnit branch of
  // applyUnitCurrentSide no-ops for their synthetic def, keeping minted stats).
  while (
    (armyUnitStacksActive(state) || unit.bossUnit) &&
    (unit.variant === "pack" || unit.variant === "neutral") &&
    (unit.armyStacks ?? 0) > 0 &&
    unit.damage >= unit.maxHealth
  ) {
    const excess = Math.max(0, unit.damage - unit.maxHealth);
    unit.armyStacks = Math.max(0, (unit.armyStacks ?? 0) - 1);
    consumeCurrentLifeHealthBonuses(state, unit);
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

    // Raid Bosses (§6.5.3): every layer broken pays the FIGHTER 2 gold at
    // once and lands on the per-player payout ledger ("soften it so I can
    // finish it" is a real play). Only the raid LAIR pays — a dungeon floor
    // boss settles through the floor ladder instead.
    const raidContext = state.combat?.context;
    if (unit.bossUnit && raidContext?.kind === "neutral" && raidContext.raidBossId) {
      const bossRecord = state.adventure?.raidBosses?.[raidContext.raidBossId];
      const breakerId = state.combat?.attackerPlayerId;
      const breaker = breakerId ? state.players[breakerId] : undefined;
      if (bossRecord && breaker && breakerId) {
        bossRecord.layerBreaks[breakerId] = (bossRecord.layerBreaks[breakerId] ?? 0) + 1;
        breaker.resources.gold += RAID_BOSS_LAYER_BREAK_GOLD;
        appendEvent(state, {
          type: "RAID_BOSS_LAYER_BROKEN",
          bossInstanceId: raidContext.raidBossId,
          playerId: breakerId,
          layersLeft: (unit.armyStacks ?? 0) + 1,
          gold: RAID_BOSS_LAYER_BREAK_GOLD,
          message: `${breaker.name} broke a health layer off ${unit.name} — +${RAID_BOSS_LAYER_BREAK_GOLD} gold at once (${
            (unit.armyStacks ?? 0) + 1
          } bar${(unit.armyStacks ?? 0) + 1 === 1 ? "" : "s"} left).`
        });
      }
    }
  }

  if (unit.damage < unit.maxHealth) {
    return;
  }

  // Stack Token absorb (Rebirth already spent or absent): a Stack Token absorbs
  // the lethal blow — before any Pack→Few flip. "When it takes damage equal to or
  // greater than its Health, instead of removing the unit, discard the Stack Token
  // from it and deal any leftover damage, deducting it from the new Health."
  // (rulebook p.67). The token is discarded (reverting its stat bonus via
  // applyUnitCurrentSide) and the excess carries to the now-lower Health. Keyed on
  // the token alone (NOT on bankUnit) so it also protects a PLAYER army card
  // carrying the Dragon Fly Hive / Griffin Conservatory Stacked reward token.
  if (unit.stackToken) {
    const excess = unit.damage - unit.maxHealth;
    unit.stackToken = null;
    unit.damage = 0;
    consumeCurrentLifeHealthBonuses(state, unit);
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
      consumeCurrentLifeHealthBonuses(state, unit);
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

  // A one-life bonus also expires when there is no lower health bar to reveal.
  consumeCurrentLifeHealthBonuses(state, unit);
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

  // Heavenly Demon Palace "Reap the Fallen": every LIVING unit adjacent to the
  // just-removed unit that carries the trait grows +1 Attack for the rest of the
  // combat. Runs AFTER detonation so a chained detonation's own removals each
  // feed their neighbours' reapers via this same chokepoint.
  applyReapTheFallenOnRemoval(state, unit);
}

/**
 * Heavenly Demon Palace "Reap the Fallen" (ATTACK_BUFF_ON_ADJACENT_REMOVAL): when
 * `removed` leaves the Combat Board, every LIVING unit adjacent to it carrying the
 * trait gains its `amount` Attack for the rest of the combat. The bonus is baked
 * onto the reaper's combat `permanentAttackBonus` (so it survives a Pack→Few flip,
 * like the Gelu buff) and mirrored onto `attack` for immediate reads; it is NOT
 * written to the army card, so it is strictly combat-scoped. Buffing Attack causes
 * no further removals, so this never recurses.
 */
function applyReapTheFallenOnRemoval(state: GameState, removed: CombatUnitState): void {
  const combat = state.combat;
  if (!combat) {
    return;
  }
  for (const neighbour of getUnitsAdjacentTo(combat, removed)) {
    const reap = getReapOnAdjacentRemoval(neighbour);
    if (!reap || reap.amount <= 0) {
      continue;
    }
    neighbour.permanentAttackBonus = (neighbour.permanentAttackBonus ?? 0) + reap.amount;
    neighbour.attack += reap.amount;
    appendEvent(state, {
      type: "UNIT_ABILITY_TRIGGERED",
      unitId: neighbour.id,
      abilityId: reap.abilityId,
      message: `${neighbour.cardName} reaps ${removed.cardName} and gains +${reap.amount} Attack for the rest of the combat.`
    });
  }
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
  // `combatFightingHasBegun` is the SHARED read (combat-timing.ts) — the Polish
  // Set Artifacts "at the beginning of the combat" tiers use the same one, so the
  // two cannot drift apart about when a fight has started. The extra
  // `combat.setup` exclusion above is this window's own: during deployment the
  // placement screen owns the retreat control.
  return !combatFightingHasBegun(combat);
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

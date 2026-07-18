import type { UnitTier } from "@/data/factions/types";
import { coreUnitDefinitions } from "@/data/factions/units";
import {
  ELITE_UNIT_RANK_ABILITIES,
  MAX_UNIT_RANK,
  UNIT_RANK_NAMES,
  UNIT_RANK_STAT_BONUSES,
  UNIT_RANK_THRESHOLDS,
  type UnitRankStatBonus
} from "@/data/units/experience";
import { UNIT_XP_BANK_MIN, UNIT_XP_PVP_WIN } from "@/data/units/experience";
import { appendEvent } from "./events";
import {
  NEUTRAL_PLAYER_ID,
  type ArmyUnitState,
  type CombatContext,
  type CombatUnitState,
  type GameState,
  type PlayerId
} from "./state";

/**
 * Unit Experience (optional rule) — engine read layer for the WoG UES board
 * adaptation. Data (thresholds, per-tier stat packages, the elite registry)
 * lives in src/data/units/experience.ts; wiring:
 *  - XP awards: finalizeAdventureCombat (adventure-reducer.ts) — winner's
 *    surviving deployed army units gain XP (neutral difficulty / bank Stacked
 *    count / PvP flat).
 *  - Stat/ability folds: makeCombatUnitFromArmy (adventure.ts) and
 *    applyUnitCurrentSide (unit-transforms.ts) via `unitRankFold` /
 *    `combatUnitRankFold`.
 *  - Dilution: reinforcing Few→Pack halves the card's XP; each purchased
 *    Polish Stack layer costs 1 XP (WoG Crexpmod "upgrades cost experience").
 *  - Drill: DRILL_UNIT map action (adventure-reducer.ts drillUnit).
 * Behaviour pinned in src/engine/unit-experience.test.ts.
 */

const ZERO_FOLD: UnitRankStatBonus = { attack: 0, defense: 0, health: 0, initiative: 0 };

/** Whether the Unit Experience rule is on for this game (frozen at setup). */
export function unitExperienceActive(state: GameState): boolean {
  return Boolean(state.adventure?.unitExperience);
}

/** Veteran rank (0-3) a card of this tier has at the given total XP. */
export function unitRankForExperience(tier: UnitTier, experience: number): number {
  const thresholds = UNIT_RANK_THRESHOLDS[tier] ?? UNIT_RANK_THRESHOLDS.gold;
  const xp = Math.max(0, Math.trunc(experience));
  let rank = 0;
  for (const threshold of thresholds) {
    if (xp >= threshold) {
      rank += 1;
    }
  }
  return Math.min(MAX_UNIT_RANK, rank);
}

/** CUMULATIVE stat bonus at this rank for this tier (rank 0 = nothing). */
export function unitRankStatBonuses(tier: UnitTier, rank: number): UnitRankStatBonus {
  if (rank <= 0) {
    return ZERO_FOLD;
  }
  const packages = UNIT_RANK_STAT_BONUSES[tier] ?? UNIT_RANK_STAT_BONUSES.gold;
  return packages[Math.min(rank, MAX_UNIT_RANK) - 1] ?? ZERO_FOLD;
}

/** The unique ELITE (rank 3) ability this unit gains, if it has one. */
export function eliteRankAbilityId(unitDefId: string): string | null {
  return ELITE_UNIT_RANK_ABILITIES[unitDefId] ?? null;
}

export type UnitRankFold = UnitRankStatBonus & {
  rank: number;
  /** Elite ability granted at MAX_UNIT_RANK (null below it / none registered). */
  abilityId: string | null;
};

const ZERO_RANK_FOLD: UnitRankFold = { ...ZERO_FOLD, rank: 0, abilityId: null };

/**
 * Everything a combat-unit build folds in for a card with this XP: the rank,
 * its cumulative stat bonuses and (at max rank) the elite ability grant.
 */
export function unitRankFold(unitDefId: string, tier: UnitTier, experience: number): UnitRankFold {
  const rank = unitRankForExperience(tier, experience);
  if (rank <= 0) {
    return ZERO_RANK_FOLD;
  }
  return {
    ...unitRankStatBonuses(tier, rank),
    rank,
    abilityId: rank >= MAX_UNIT_RANK ? eliteRankAbilityId(unitDefId) : null
  };
}

/**
 * Rank fold for an already-built combat unit (mid-combat side recomputes in
 * applyUnitCurrentSide). Reads the XP mirrored onto the unit at build time.
 */
export function combatUnitRankFold(unit: CombatUnitState): UnitRankFold {
  const xp = unit.unitExperience ?? 0;
  if (xp <= 0 || !unit.unitDefId) {
    return ZERO_RANK_FOLD;
  }
  const def = coreUnitDefinitions[unit.unitDefId];
  if (!def) {
    return ZERO_RANK_FOLD;
  }
  return unitRankFold(unit.unitDefId, def.tier, xp);
}

/** Appends the fold's elite ability to a printed ability list (deduped). */
export function withEliteAbility(abilities: string[], fold: UnitRankFold): string[] {
  if (!fold.abilityId || abilities.includes(fold.abilityId)) {
    return abilities;
  }
  return [...abilities, fold.abilityId];
}

export type ArmyUnitRankInfo = {
  experience: number;
  rank: number;
  rankName: string;
  bonus: UnitRankStatBonus;
  /** XP total needed for the NEXT rank; null at max rank. */
  nextThreshold: number | null;
  /** The elite ability this unit gains at max rank (registered units only). */
  eliteAbilityId: string | null;
  /** Whether the elite ability is already active (rank = max). */
  eliteActive: boolean;
};

/** UI summary of a card's veteran progression (badge + tooltip). */
export function armyUnitRankInfo(armyUnit: Pick<ArmyUnitState, "unitDefId" | "experience">): ArmyUnitRankInfo | null {
  const def = coreUnitDefinitions[armyUnit.unitDefId];
  if (!def) {
    return null;
  }
  const experience = Math.max(0, Math.trunc(armyUnit.experience ?? 0));
  const rank = unitRankForExperience(def.tier, experience);
  const thresholds = UNIT_RANK_THRESHOLDS[def.tier] ?? UNIT_RANK_THRESHOLDS.gold;
  return {
    experience,
    rank,
    rankName: UNIT_RANK_NAMES[rank] ?? "",
    bonus: unitRankStatBonuses(def.tier, rank),
    nextThreshold: rank >= MAX_UNIT_RANK ? null : thresholds[rank],
    eliteAbilityId: eliteRankAbilityId(armyUnit.unitDefId),
    eliteActive: rank >= MAX_UNIT_RANK && eliteRankAbilityId(armyUnit.unitDefId) !== null
  };
}

/**
 * XP a won combat awards the winner's surviving deployed units: neutral guard
 * fights pay the Field Difficulty, Creature Banks pay max(2, Stacked count),
 * PvP wins pay a flat 2. Exposed for the UI/tests.
 */
export function unitExperienceForWonCombat(context: CombatContext): number {
  if (context.kind === "sandbox") {
    return 0;
  }
  if (context.kind === "neutral") {
    return context.bankId
      ? Math.max(UNIT_XP_BANK_MIN, Math.trunc(context.bankStackCount ?? 0))
      : Math.max(1, Math.trunc(context.difficulty ?? 1));
  }
  return UNIT_XP_PVP_WIN;
}

/**
 * Award unit XP for a finished, WON adventure combat (WoG UES: "after winning
 * a battle led by a hero, each SURVIVING creature gains experience"). Called
 * from finalizeAdventureCombat after the army sync loop. Only the WINNER's
 * units that were actually deployed (a real `armyUnitId` back-link — summons,
 * commanders, war machines and borrowed temporaries never qualify) and
 * survived (not removed at full damage) gain XP; each backing army card is
 * awarded once even if mirrored by clones. Quick Combat never deploys units,
 * so it trains nobody — fighting it out is what drills the troops (deliberate
 * strategic trade-off). Crossing a rank threshold emits UNIT_RANK_UP.
 * No-op while the rule is off.
 */
export function awardUnitExperienceAfterCombat(state: GameState): void {
  const combat = state.combat;
  if (!unitExperienceActive(state) || !combat?.outcome || combat.context.kind === "sandbox") {
    return;
  }
  const winnerId = combat.outcome.winnerPlayerId;
  if (!winnerId || winnerId === NEUTRAL_PLAYER_ID) {
    return;
  }
  const player = state.players[winnerId];
  if (!player) {
    return;
  }
  const gained = unitExperienceForWonCombat(combat.context);
  if (gained <= 0) {
    return;
  }
  const awarded = new Set<string>();
  for (const unit of Object.values(combat.units)) {
    if (unit.controllerId !== winnerId || !unit.armyUnitId || unit.temporary) {
      continue;
    }
    if (unit.damage >= unit.maxHealth) {
      // Fell in the fight — WoG awards survivors only.
      continue;
    }
    if (awarded.has(unit.armyUnitId)) {
      continue;
    }
    awarded.add(unit.armyUnitId);
    const armyUnit = player.army.find((candidate) => candidate.id === unit.armyUnitId);
    if (!armyUnit) {
      continue;
    }
    grantArmyUnitExperience(state, winnerId, armyUnit, gained);
  }
}

/**
 * Grant XP to one army card, emitting UNIT_RANK_UP when a threshold is
 * crossed. Shared by the combat award and the Drill action.
 */
export function grantArmyUnitExperience(
  state: GameState,
  playerId: PlayerId,
  armyUnit: ArmyUnitState,
  amount: number
): void {
  const def = coreUnitDefinitions[armyUnit.unitDefId];
  if (!def || amount <= 0) {
    return;
  }
  const before = unitRankForExperience(def.tier, armyUnit.experience ?? 0);
  armyUnit.experience = Math.max(0, Math.trunc(armyUnit.experience ?? 0)) + Math.trunc(amount);
  const after = unitRankForExperience(def.tier, armyUnit.experience);
  if (after > before) {
    appendEvent(state, {
      type: "UNIT_RANK_UP",
      playerId,
      unitDefId: armyUnit.unitDefId,
      unitName: def.name,
      rank: after
    });
  }
}

/**
 * WoG Crexpmod adaptation — upgrades cost experience. Reinforcing a Few card
 * to a Pack halves its XP (fresh recruits dilute the veterans); buying a
 * Polish Unit Stack layer costs 1 XP per layer (the same read, scaled to the
 * smaller addition). Mutates the army card and emits UNIT_XP_DILUTED so the
 * loss is never silent. A card with no XP (or a game without the rule — the
 * field never appears) is untouched. The ONE documented exception, at its
 * call sites: the Hierophant's post-combat First Aid flip-up restores THIS
 * battle's own casualties, not fresh recruits, so it never dilutes (pinned by
 * test). Mid-combat Pack→Few casualty flips are the other direction and keep
 * XP in full.
 */
export function diluteUnitExperienceForUpgrade(
  state: GameState,
  playerId: PlayerId,
  armyUnit: ArmyUnitState,
  reason: "reinforce" | "stack",
  layers = 1
): void {
  const xp = Math.max(0, Math.trunc(armyUnit.experience ?? 0));
  if (xp <= 0) {
    return;
  }
  const remaining = reason === "reinforce" ? Math.floor(xp / 2) : Math.max(0, xp - Math.max(1, layers));
  if (remaining === xp) {
    return;
  }
  if (remaining > 0) {
    armyUnit.experience = remaining;
  } else {
    delete armyUnit.experience;
  }
  const def = coreUnitDefinitions[armyUnit.unitDefId];
  appendEvent(state, {
    type: "UNIT_XP_DILUTED",
    playerId,
    unitDefId: armyUnit.unitDefId,
    unitName: def?.name ?? armyUnit.unitDefId,
    experience: remaining,
    reason
  });
}

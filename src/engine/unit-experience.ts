import type { UnitTier } from "@/data/factions/types";
import { coreUnitDefinitions } from "@/data/factions/units";
import {
  MAX_UNIT_RANK,
  UNIT_RANK_NAMES,
  UNIT_RANK_THRESHOLDS,
  UNIT_STAT_STEPS,
  rankScheduleFor,
  rankAbilityTrackFor,
  scheduleAbilityCount,
  type RankStep,
  type UnitRankStatBonus
} from "@/data/units/experience";
import { UNIT_XP_BANK_MIN, UNIT_XP_PVP_WIN } from "@/data/units/experience";
import { animeModuleEnabled } from "./anime";
import { equipmentVeteranBonusXp } from "./anime-equipment";
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
 * Unit Experience — each rank is EITHER stats OR one ability (never both).
 * Ability count is by track rarity (1 / 2 / 3), never by gold tier.
 * Stats only accumulate on stats ranks (schedule-driven steps).
 */

const ZERO_FOLD: UnitRankStatBonus = { attack: 0, defense: 0, health: 0, initiative: 0 };

export function unitExperienceActive(state: GameState): boolean {
  return Boolean(state.adventure?.unitExperience) || animeModuleEnabled(state, "unitExperience");
}

export function unitRankForExperience(tier: UnitTier, experience: number): number {
  const thresholds = UNIT_RANK_THRESHOLDS[tier] ?? UNIT_RANK_THRESHOLDS.gold;
  const xp = Math.max(0, Math.trunc(experience));
  let rank = 0;
  for (const threshold of thresholds) {
    if (xp >= threshold) rank += 1;
  }
  return Math.min(MAX_UNIT_RANK, rank);
}

function addStats(a: UnitRankStatBonus, b: UnitRankStatBonus): UnitRankStatBonus {
  return {
    attack: a.attack + b.attack,
    defense: a.defense + b.defense,
    health: a.health + b.health,
    initiative: a.initiative + b.initiative
  };
}

/**
 * Cumulative stats at this rank for this unit — only ranks whose schedule step
 * is `kind: "stats"` contribute. Gold does not get larger packages; it only
 * uses Attack-first steps when a stats rank lands.
 *
 * Overload-friendly: `unitRankStatBonuses(tier, rank)` still works for tests
 * that pass a plain melee path (no unitDefId) — treats every rank as stats
 * using the deprecated cumulative table path via steps 0..rank-1.
 */
const TIER_KEYS = new Set<string>(["bronze", "silver", "gold", "azure"]);

export function unitRankStatBonuses(
  tierOrUnitDefId: UnitTier | string,
  rankOrTier: number | UnitTier,
  maybeRank?: number
): UnitRankStatBonus {
  // (unitDefId, tier, rank)
  if (
    typeof tierOrUnitDefId === "string" &&
    !TIER_KEYS.has(tierOrUnitDefId) &&
    typeof rankOrTier === "string" &&
    TIER_KEYS.has(rankOrTier) &&
    typeof maybeRank === "number"
  ) {
    return unitRankStatBonusesFor(tierOrUnitDefId, rankOrTier as UnitTier, maybeRank);
  }
  // (unitDefId, rank) — tier from definition
  if (
    typeof tierOrUnitDefId === "string" &&
    !TIER_KEYS.has(tierOrUnitDefId) &&
    typeof rankOrTier === "number" &&
    maybeRank === undefined
  ) {
    const def = coreUnitDefinitions[tierOrUnitDefId];
    const tier = def?.tier ?? "gold";
    return unitRankStatBonusesFor(tierOrUnitDefId, tier, rankOrTier);
  }
  // (tier, rank) — pure step table (no schedule; for tier-step unit tests)
  const tier = tierOrUnitDefId as UnitTier;
  const rank = rankOrTier as number;
  if (rank <= 0) return ZERO_FOLD;
  const steps = UNIT_STAT_STEPS[tier] ?? UNIT_STAT_STEPS.gold;
  let total = ZERO_FOLD;
  const count = Math.min(rank, steps.length);
  for (let i = 0; i < count; i++) {
    total = addStats(total, steps[i]!);
  }
  return total;
}

export function unitRankStatBonusesFor(unitDefId: string, tier: UnitTier, rank: number): UnitRankStatBonus {
  if (rank <= 0) return ZERO_FOLD;
  const schedule = rankScheduleFor(unitDefId);
  const steps = UNIT_STAT_STEPS[tier] ?? UNIT_STAT_STEPS.gold;
  let total = ZERO_FOLD;
  let statsIndex = 0;
  for (let r = 1; r <= Math.min(rank, MAX_UNIT_RANK); r++) {
    const step = schedule[r as 1 | 2 | 3 | 4];
    if (step.kind === "stats") {
      const delta = steps[statsIndex] ?? ZERO_FOLD;
      total = addStats(total, delta);
      statsIndex += 1;
    }
  }
  return total;
}

/** The schedule step at a given rank (stats | ability). */
export function unitRankStep(unitDefId: string, rank: number): RankStep | null {
  if (rank < 1 || rank > MAX_UNIT_RANK) return null;
  return rankScheduleFor(unitDefId)[rank as 1 | 2 | 3 | 4] ?? null;
}

export function printedAbilityIdsOf(unitDefId: string): ReadonlySet<string> {
  const def = coreUnitDefinitions[unitDefId];
  const ids = new Set<string>();
  if (!def) return ids;
  for (const side of [def.few, def.pack, def.neutral]) {
    for (const abilityId of side?.abilities ?? []) ids.add(abilityId);
  }
  return ids;
}

/**
 * Abilities granted by ability-ranks only (up through `rank`).
 * Stats ranks contribute nothing here.
 */
export function unitRankAbilityIds(unitDefId: string, rank: number): string[] {
  if (rank <= 0) return [];
  const printed = printedAbilityIdsOf(unitDefId);
  const granted: string[] = [];
  const already = new Set<string>(printed);
  const schedule = rankScheduleFor(unitDefId);

  for (let r = 1; r <= Math.min(rank, MAX_UNIT_RANK); r++) {
    const step = schedule[r as 1 | 2 | 3 | 4];
    if (step.kind !== "ability") continue;
    for (const abilityId of step.choices) {
      if (!already.has(abilityId)) {
        granted.push(abilityId);
        already.add(abilityId);
        break;
      }
    }
  }
  return granted;
}

/** Ability gained exactly at this rank (empty if the rank is a stats rank). */
export function unitRankAbilityGainsAt(unitDefId: string, rank: number): string[] {
  if (rank <= 0) return [];
  const step = unitRankStep(unitDefId, rank);
  if (!step || step.kind !== "ability") return [];
  const before = new Set(unitRankAbilityIds(unitDefId, rank - 1));
  return unitRankAbilityIds(unitDefId, rank).filter((id) => !before.has(id));
}

/** Stat delta gained exactly at this rank (zeros if the rank is an ability rank). */
export function unitRankStatGainsAt(
  unitDefId: string,
  tier: UnitTier,
  rank: number
): UnitRankStatBonus {
  if (rank <= 0) return ZERO_FOLD;
  const step = unitRankStep(unitDefId, rank);
  if (!step || step.kind !== "stats") return ZERO_FOLD;
  const after = unitRankStatBonusesFor(unitDefId, tier, rank);
  const before = unitRankStatBonusesFor(unitDefId, tier, rank - 1);
  return {
    attack: after.attack - before.attack,
    defense: after.defense - before.defense,
    health: after.health - before.health,
    initiative: after.initiative - before.initiative
  };
}

export { rankAbilityTrackFor, scheduleAbilityCount };

export type UnitRankFold = UnitRankStatBonus & {
  rank: number;
  abilityIds: string[];
  /** First rank ability id if any (UI convenience). */
  abilityId: string | null;
};

const ZERO_RANK_FOLD: UnitRankFold = { ...ZERO_FOLD, rank: 0, abilityIds: [], abilityId: null };

export function unitRankFold(unitDefId: string, tier: UnitTier, experience: number): UnitRankFold {
  const rank = unitRankForExperience(tier, experience);
  if (rank <= 0) return ZERO_RANK_FOLD;
  const abilityIds = unitRankAbilityIds(unitDefId, rank);
  return {
    ...unitRankStatBonusesFor(unitDefId, tier, rank),
    rank,
    abilityIds,
    abilityId: abilityIds[0] ?? null
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

/**
 * Appends every rank-granted ability to a printed ability list (deduped).
 * Replaces the old single-elite `withEliteAbility` helper.
 */
export function withRankAbilities(abilities: string[], fold: UnitRankFold): string[] {
  if (!fold.abilityIds.length) {
    return abilities;
  }
  let next = abilities;
  for (const abilityId of fold.abilityIds) {
    if (!next.includes(abilityId)) {
      if (next === abilities) {
        next = [...abilities];
      }
      next.push(abilityId);
    }
  }
  return next;
}

/** @deprecated Use `withRankAbilities`. Alias kept for any lingering imports. */
export const withEliteAbility = withRankAbilities;

export type ArmyUnitRankInfo = {
  experience: number;
  rank: number;
  rankName: string;
  bonus: UnitRankStatBonus;
  nextThreshold: number | null;
  trackId: string;
  /** How many ability ranks this unit's path has (1–3). */
  abilityBudget: number;
  /** Kept for UI that still labels "elite" — first ability on the path if any. */
  eliteAbilityId: string | null;
  eliteActive: boolean;
  legendAbilityId: string | null;
  legendActive: boolean;
  rankAbilityIds: string[];
  /** Per-rank ability gains (empty array on stats ranks). */
  abilitiesByRank: Record<number, string[]>;
  /** Per-rank step kind for the board. */
  stepKindByRank: Record<number, "stats" | "ability">;
  /** Per-rank stat deltas (zeros on ability ranks). */
  statGainsByRank: Record<number, UnitRankStatBonus>;
};

/** UI summary of a card's veteran progression (badge + tooltip + board window). */
export function armyUnitRankInfo(armyUnit: Pick<ArmyUnitState, "unitDefId" | "experience">): ArmyUnitRankInfo | null {
  const def = coreUnitDefinitions[armyUnit.unitDefId];
  if (!def) return null;
  const experience = Math.max(0, Math.trunc(armyUnit.experience ?? 0));
  const rank = unitRankForExperience(def.tier, experience);
  const thresholds = UNIT_RANK_THRESHOLDS[def.tier] ?? UNIT_RANK_THRESHOLDS.gold;
  const schedule = rankScheduleFor(armyUnit.unitDefId);
  const activeIds = unitRankAbilityIds(armyUnit.unitDefId, rank);
  const abilitiesByRank: Record<number, string[]> = {};
  const stepKindByRank: Record<number, "stats" | "ability"> = {};
  const statGainsByRank: Record<number, UnitRankStatBonus> = {};
  for (let r = 1; r <= MAX_UNIT_RANK; r++) {
    const step = schedule[r as 1 | 2 | 3 | 4];
    stepKindByRank[r] = step.kind;
    abilitiesByRank[r] = unitRankAbilityGainsAt(armyUnit.unitDefId, r);
    statGainsByRank[r] = unitRankStatGainsAt(armyUnit.unitDefId, def.tier, r);
  }
  return {
    experience,
    rank,
    rankName: UNIT_RANK_NAMES[rank] ?? "",
    bonus: unitRankStatBonusesFor(armyUnit.unitDefId, def.tier, rank),
    nextThreshold: rank >= MAX_UNIT_RANK ? null : thresholds[rank],
    trackId: rankAbilityTrackFor(armyUnit.unitDefId),
    abilityBudget: scheduleAbilityCount(schedule),
    eliteAbilityId: activeIds[0] ?? unitRankAbilityIds(armyUnit.unitDefId, MAX_UNIT_RANK)[0] ?? null,
    eliteActive: activeIds.length > 0,
    legendAbilityId: null,
    legendActive: false,
    rankAbilityIds: activeIds,
    abilitiesByRank,
    stepKindByRank,
    statGainsByRank
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
 *
 * Anime Equipment (§3.13): the Veteran's Standard accessory grants +1 EXTRA XP
 * per won combat, added to the base award (so 2 XP on a base-1 neutral win).
 * Read once for the winner; 0 when the item is off / unworn (the CONTROL keeps
 * a bare win at exactly the base amount).
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
  const gained = unitExperienceForWonCombat(combat.context) + equipmentVeteranBonusXp(state, winnerId);
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

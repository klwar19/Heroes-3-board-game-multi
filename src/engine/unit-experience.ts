import type { UnitTier } from "@/data/factions/types";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities } from "@/data/units/abilities";
import {
  MAX_UNIT_RANK,
  UNIT_RANK_NAMES,
  UNIT_RANK_THRESHOLDS,
  UNIT_STAT_STEPS,
  rankScheduleFor,
  rankAbilityTrackFor,
  scheduleAbilityCount,
  unitStatStepsFor,
  type RankStep,
  type UnitRankStatBonus
} from "@/data/units/experience";
import { UNIT_XP_BANK_MIN, UNIT_XP_PVP_WIN } from "@/data/units/experience";
import { animeModuleEnabled } from "./anime";
import { equipmentVeteranBonusXp } from "./anime-equipment";
import { appendEvent } from "./events";
import { mgqEffectiveJob, mgqJobSignatureAbilityId } from "./mgq-jobs";
import { getBonusUnitExperience } from "./unit-abilities";
import {
  NEUTRAL_PLAYER_ID,
  type ArmyUnitState,
  type CombatContext,
  type CombatUnitState,
  type GameState,
  type MgqJob,
  type PlayerId
} from "./state";

/**
 * Unit Experience — ranks may grant stats, an ability, or a signature hybrid.
 * Stats accumulate only from the schedule steps that explicitly grant them.
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

export function unitRankStatBonusesFor(
  unitDefId: string,
  tier: UnitTier,
  rank: number,
  job?: MgqJob
): UnitRankStatBonus {
  if (rank <= 0) return ZERO_FOLD;
  const steps = unitStatStepsFor(unitDefId, tier);
  let total = ZERO_FOLD;
  let statsIndex = 0;
  for (let r = 1; r <= Math.min(rank, MAX_UNIT_RANK); r++) {
    const step = unitRankStep(unitDefId, r, job);
    if (!step) continue;
    if (step.kind === "stats") {
      const delta = step.stats ?? steps[statsIndex] ?? ZERO_FOLD;
      total = addStats(total, delta);
      if (!step.stats) statsIndex += 1;
    } else if (step.kind === "hybrid") {
      total = addStats(total, step.stats);
    }
  }
  return total;
}

/** The schedule step at a given rank (stats | ability | hybrid). */
export function unitRankStep(unitDefId: string, rank: number, job?: MgqJob): RankStep | null {
  if (rank < 1 || rank > MAX_UNIT_RANK) return null;
  if (job) {
    const signature = mgqJobSignatureAbilityId(job);
    if (rank === 1) return rankScheduleFor(unitDefId)[1];
    if (rank === 2) return { kind: "stats" };
    if (rank === 3 && signature) {
      const baseStep = rankScheduleFor(unitDefId)[3];
      return {
        kind: "ability",
        choices: [signature, ...(baseStep.kind === "stats" ? ["veteran-steady-aim"] : baseStep.choices)]
      };
    }
    return rankScheduleFor(unitDefId)[rank as 1 | 2 | 3 | 4];
  }
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

type AbilityEffect = NonNullable<(typeof unitAbilities)[string]["effect"]>;

/**
 * Effect families whose engine reader takes the FIRST match (or the MAX), so a
 * second copy on the same unit can never move a number:
 *   MINIMUM_ATTACK_DIE   getMinimumAttackDie takes Math.max(...)
 *   ON_ATTACK_HEAL_SELF  getOnAttackSelfHeal returns the first match
 *   SELF_REBIRTH_ONCE    getSelfRebirthAbility returns the first match
 *   DOUBLE_ATTACK        getDoubleAttackAbility returns the first match
 *   ATTACK_ROLL_ADVANTAGE unitHasAttackRollAdvantage is a coverage predicate
 *   MOVE_ANYWHERE        a presence check
 * DELIBERATELY ABSENT: OWN_ATTACK_FLAT_BONUS, DEFENSE_BONUS_ON_ATTACK_DIE and
 * ON_ACTIVATION_HEAL_SELF genuinely STACK (their readers sum), so a second copy
 * is a real reward and must never be skipped.
 */
const NO_OP_DEDUPE_EFFECT_TYPES = new Set<string>([
  "MINIMUM_ATTACK_DIE",
  "ON_ATTACK_HEAL_SELF",
  "SELF_REBIRTH_ONCE",
  "DOUBLE_ATTACK",
  "ATTACK_ROLL_ADVANTAGE",
  "MOVE_ANYWHERE"
]);

/** Which attacks an ATTACK_ROLL_ADVANTAGE copy actually covers. */
function attackRollAdvantageCoverage(effect: AbilityEffect): "own" | "retaliation" | "any" {
  if (effect.type !== "ATTACK_ROLL_ADVANTAGE") return "any";
  if (effect.ownAttackOnly) return "own";
  if (effect.retaliationOnly) return "retaliation";
  return "any";
}

/**
 * True when granting `abilityId` on top of `existing` could not change a single
 * outcome — the rank would be paid for and give nothing. Only the first-match /
 * max-wins families above are ever judged; everything else falls through as a
 * real reward.
 */
function grantWouldBeStrictNoOp(abilityId: string, existing: Iterable<string>): boolean {
  const granted = unitAbilities[abilityId]?.effect;
  if (!granted || !NO_OP_DEDUPE_EFFECT_TYPES.has(granted.type)) return false;
  for (const heldId of existing) {
    const held = unitAbilities[heldId]?.effect;
    if (!held || held.type !== granted.type) continue;
    switch (granted.type) {
      case "MINIMUM_ATTACK_DIE":
        // Math.max wins: an equal-or-higher floor already in place swallows it.
        if (held.type === "MINIMUM_ATTACK_DIE" && held.minimum >= granted.minimum) return true;
        break;
      case "ATTACK_ROLL_ADVANTAGE": {
        const heldCoverage = attackRollAdvantageCoverage(held);
        const grantedCoverage = attackRollAdvantageCoverage(granted);
        // A retaliation-only printed copy does NOT cover an unconditional grant.
        if (heldCoverage === "any" || heldCoverage === grantedCoverage) return true;
        break;
      }
      default:
        // First-match-wins readers: the printed/earlier copy always answers, so
        // a second copy is unreachable whatever its parameters.
        return true;
    }
  }
  return false;
}

/**
 * Abilities granted by ability-ranks only (up through `rank`).
 * Stats ranks contribute nothing here.
 *
 * Dedupe is by ability id AND by EFFECT: a choice whose effect is already
 * answered by the unit's printed kit (or by an earlier rank's grant) would be a
 * strict no-op, so the rank falls through to the next choice in the rotation.
 */
export function unitRankAbilityIds(unitDefId: string, rank: number, job?: MgqJob): string[] {
  if (rank <= 0) return [];
  const printed = printedAbilityIdsOf(unitDefId);
  const granted: string[] = [];
  const already = new Set<string>(printed);

  for (let r = 1; r <= Math.min(rank, MAX_UNIT_RANK); r++) {
    const step = unitRankStep(unitDefId, r, job);
    if (!step) continue;
    if (step.kind !== "ability" && step.kind !== "hybrid") continue;
    for (const abilityId of step.choices) {
      if (already.has(abilityId) || grantWouldBeStrictNoOp(abilityId, already)) continue;
      granted.push(abilityId);
      already.add(abilityId);
      break;
    }
  }
  return granted;
}

/** Ability gained exactly at this rank (empty if the rank is a stats rank). */
export function unitRankAbilityGainsAt(unitDefId: string, rank: number, job?: MgqJob): string[] {
  if (rank <= 0) return [];
  const step = unitRankStep(unitDefId, rank, job);
  if (!step || (step.kind !== "ability" && step.kind !== "hybrid")) return [];
  const before = new Set(unitRankAbilityIds(unitDefId, rank - 1, job));
  return unitRankAbilityIds(unitDefId, rank, job).filter((id) => !before.has(id));
}

/** Stat delta gained exactly at this rank (zeros if the rank is an ability rank). */
export function unitRankStatGainsAt(
  unitDefId: string,
  tier: UnitTier,
  rank: number,
  job?: MgqJob
): UnitRankStatBonus {
  if (rank <= 0) return ZERO_FOLD;
  const step = unitRankStep(unitDefId, rank, job);
  if (!step || (step.kind !== "stats" && step.kind !== "hybrid")) return ZERO_FOLD;
  const after = unitRankStatBonusesFor(unitDefId, tier, rank, job);
  const before = unitRankStatBonusesFor(unitDefId, tier, rank - 1, job);
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

export function unitRankFold(
  unitDefId: string,
  tier: UnitTier,
  experience: number,
  job?: MgqJob
): UnitRankFold {
  const rank = unitRankForExperience(tier, experience);
  if (rank <= 0) return ZERO_RANK_FOLD;
  const abilityIds = unitRankAbilityIds(unitDefId, rank, job);
  return {
    ...unitRankStatBonusesFor(unitDefId, tier, rank, job),
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
  return unitRankFold(unit.unitDefId, def.tier, xp, unit.job);
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

// ---------------------------------------------------------------------------
// Neutral Rank-Up (OPTIONAL module: wog.neutralRankUp / anime.neutralRankUp)
// ---------------------------------------------------------------------------
//
// NEUTRAL guard units gain the SAME veteran ranks a player army earns —
// reusing unitRankFold / combatUnitRankFold / withRankAbilities VERBATIM (no
// parallel stat table) — via two independent halves, each frozen behind
// `adventure.neutralRankUp`:
//
//  • FIELD GUARDS: bronze reaches Seasoned/Veteran/Elite at rounds 3/5/8,
//    silver at 6/8/12, and gold/azure at 6/10/14.
//  • CREATURE BANKS: every defender follows its token's map band: Far 4/6/9,
//    Near 6/8/12. This progression is independent of ordinary Stack Tokens.
//
// Default OFF ⇒ byte-identical: neither half is ever reached and no fold runs.

/** Neutral-owned guards never rank past Elite. */
export const NEUTRAL_ROUNDS_RANK_CAP = 3;

/** Neutral-owned field-guard round thresholds: Seasoned / Veteran / Elite. */
export const NEUTRAL_GUARD_ROUND_THRESHOLDS: Record<UnitTier, readonly [number, number, number]> = {
  bronze: [3, 5, 8],
  silver: [6, 8, 12],
  gold: [6, 10, 14],
  azure: [6, 10, 14]
};

/** Creature-Bank round thresholds by the bank token's map band. */
export const NEUTRAL_BANK_ROUND_THRESHOLDS = {
  far: [4, 6, 9],
  near: [6, 8, 12]
} as const;

/** Whether the optional Neutral Rank-Up module is frozen on for this game. */
export function neutralRankUpActive(state: GameState): boolean {
  return Boolean(state.adventure?.neutralRankUp);
}

/** The (capped) rounds-mode rank a `tier` guard reaches by `round`. */
export function neutralRoundsRank(tier: UnitTier, round: number): number {
  const currentRound = Math.max(1, Math.trunc(round));
  const thresholds = NEUTRAL_GUARD_ROUND_THRESHOLDS[tier] ?? NEUTRAL_GUARD_ROUND_THRESHOLDS.gold;
  return Math.min(NEUTRAL_ROUNDS_RANK_CAP, thresholds.filter((threshold) => currentRound >= threshold).length);
}

/**
 * The real XP threshold to MIRROR onto a rounds-ranked neutral guard so a
 * mid-combat printed-side recompute reproduces the exact explicit round rank.
 */
export function neutralRoundsMirrorXp(tier: UnitTier, round: number): number {
  const thresholds = UNIT_RANK_THRESHOLDS[tier] ?? UNIT_RANK_THRESHOLDS.gold;
  const rank = neutralRoundsRank(tier, round);
  return rank <= 0 ? 0 : thresholds[rank - 1];
}

/** The Seasoned/Veteran/Elite rank for a Far or Near Creature Bank this round. */
export function neutralBankRoundsRank(bankTier: "far" | "near", round: number): number {
  const currentRound = Math.max(1, Math.trunc(round));
  return NEUTRAL_BANK_ROUND_THRESHOLDS[bankTier].filter((threshold) => currentRound >= threshold).length;
}

/** Real unit XP that mirrors a bank's explicit round rank through the shared fold. */
export function neutralBankMirrorXp(unitDefId: string, bankTier: "far" | "near", round: number): number {
  const def = coreUnitDefinitions[unitDefId];
  if (!def) return 0;
  const rank = neutralBankRoundsRank(bankTier, round);
  return rank <= 0 ? 0 : UNIT_RANK_THRESHOLDS[def.tier][rank - 1];
}

/**
 * Field-guard half: fold the explicit round rank onto a freshly-minted NON-bank
 * neutral guard IN PLACE, reusing combatUnitRankFold (the identical machinery
 * player veterancy uses). Mirrors the explicit rank's XP so a Random-Town
 * Pack→Few recompute reproduces the same capped rank. No-op at rank 0, on a
 * bank unit, or an unknown def — so early rounds and every off game are untouched.
 */
export function applyNeutralRoundsRank(unit: CombatUnitState, round: number): void {
  if (unit.bankUnit || !unit.unitDefId) return;
  const def = coreUnitDefinitions[unit.unitDefId];
  if (!def) return;
  if (neutralRoundsRank(def.tier, round) <= 0) return;
  unit.unitExperience = neutralRoundsMirrorXp(def.tier, round);
  const fold = combatUnitRankFold(unit);
  if (fold.rank <= 0) {
    delete unit.unitExperience;
    return;
  }
  unit.attack += fold.attack;
  unit.defense += fold.defense;
  unit.maxHealth += fold.health;
  unit.initiative += fold.initiative;
  unit.abilities = withRankAbilities(unit.abilities, fold);
  unit.unitRank = fold.rank;
}

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
  stepKindByRank: Record<number, "stats" | "ability" | "hybrid">;
  /** Per-rank stat deltas (zeros on ability ranks). */
  statGainsByRank: Record<number, UnitRankStatBonus>;
};

/** UI summary of a card's veteran progression (badge + tooltip + board window). */
export function armyUnitRankInfo(
  armyUnit: Pick<ArmyUnitState, "unitDefId" | "side" | "experience" | "job" | "companion">
): ArmyUnitRankInfo | null {
  // A won Creature Bank reward card (side "bank") trains on the SAME veteran
  // track as every other card (USER RULE 2026-08-15), keyed off its underlying
  // definition's tier — Griffins / Dragon Flies are bronze, so bronze thresholds.
  const def = coreUnitDefinitions[armyUnit.unitDefId];
  if (!def) return null;
  const experience = Math.max(0, Math.trunc(armyUnit.experience ?? 0));
  const rank = unitRankForExperience(def.tier, experience);
  const job = mgqEffectiveJob(armyUnit);
  const thresholds = UNIT_RANK_THRESHOLDS[def.tier] ?? UNIT_RANK_THRESHOLDS.gold;
  const schedule = rankScheduleFor(armyUnit.unitDefId);
  const activeIds = unitRankAbilityIds(armyUnit.unitDefId, rank, job);
  const abilitiesByRank: Record<number, string[]> = {};
  const stepKindByRank: Record<number, "stats" | "ability" | "hybrid"> = {};
  const statGainsByRank: Record<number, UnitRankStatBonus> = {};
  for (let r = 1; r <= MAX_UNIT_RANK; r++) {
    const step = unitRankStep(armyUnit.unitDefId, r, job) ?? schedule[r as 1 | 2 | 3 | 4];
    stepKindByRank[r] = step.kind;
    abilitiesByRank[r] = unitRankAbilityGainsAt(armyUnit.unitDefId, r, job);
    statGainsByRank[r] = unitRankStatGainsAt(armyUnit.unitDefId, def.tier, r, job);
  }
  return {
    experience,
    rank,
    rankName: UNIT_RANK_NAMES[rank] ?? "",
    bonus: unitRankStatBonusesFor(armyUnit.unitDefId, def.tier, rank, job),
    nextThreshold: rank >= MAX_UNIT_RANK ? null : thresholds[rank],
    trackId: job ? `mgq-job-${job}` : rankAbilityTrackFor(armyUnit.unitDefId),
    abilityBudget: job ? 1 : scheduleAbilityCount(schedule),
    eliteAbilityId:
      activeIds[0] ?? unitRankAbilityIds(armyUnit.unitDefId, MAX_UNIT_RANK, job)[0] ?? null,
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

/** Bonus training for surviving a fight against ranked neutral-owned guards. */
export function neutralGuardExperienceBonusAfterCombat(state: GameState): number {
  const combat = state.combat;
  if (!combat || combat.context.kind !== "neutral") return 0;
  const highestNeutralRank = Object.values(combat.units).reduce(
    (highest, unit) =>
      unit.controllerId === NEUTRAL_PLAYER_ID ? Math.max(highest, unit.unitRank ?? 0) : highest,
    0
  );
  return highestNeutralRank >= 3 ? 2 : highestNeutralRank >= 2 ? 1 : 0;
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
 * per won combat. Defeating neutral-owned Veteran guards adds +1 XP; defeating
 * Elite guards adds +2 XP. These additions stack with the base award and the
 * Standard, and apply to every surviving deployed player army card.
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
  const gained =
    unitExperienceForWonCombat(combat.context) +
    equipmentVeteranBonusXp(state, winnerId) +
    neutralGuardExperienceBonusAfterCombat(state);
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
    grantArmyUnitExperience(state, winnerId, armyUnit, gained + getBonusUnitExperience(unit));
  }
}

/**
 * Grant XP to one army card, emitting UNIT_RANK_UP when a threshold is
 * crossed. Shared by the combat award and the Drill action.
 *
 * A WON Creature Bank card (`side: "bank"` — the Dragon Fly Hive / Griffin
 * Conservatory reward) trains here too (USER RULE 2026-08-15): the read side
 * honours its XP (makeCombatUnitFromArmy mirrors it, armyUnitRankInfo reports
 * it, the bank branch of applyUnitCurrentSide folds it), keyed off the
 * underlying definition's printed tier.
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

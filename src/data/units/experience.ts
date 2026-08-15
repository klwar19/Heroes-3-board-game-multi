import type { UnitTier } from "@/data/factions/types";

/**
 * Unit Experience — four varied ranks per unit. A rank may grant a focused
 * stat, an engine-backed ability, or a signature hybrid of both.
 */

export type {
  UnitRankStatBonus,
  RankSchedule,
  RankStep,
  RankAbilityTrackId
} from "./experience-rank-abilities";

export {
  ELITE_UNIT_RANK_ABILITIES,
  AZUR_LANE_RANK_ABILITY_ICON_BY_CHOICE,
  AZUR_LANE_RANK_ABILITY_ICONS,
  LEGEND_UNIT_RANK_ABILITIES,
  RANK_ABILITY_TRACK_LABELS,
  UNIT_RANK_ABILITY_ICONS,
  UNIT_RANK_TRACK_OVERRIDES,
  UNIT_STAT_STEPS,
  hasUniqueRankSchedule,
  inferFlavour,
  inferRankAbilityTrack,
  rankAbilityScheduleFor,
  rankAbilityTrackFor,
  rankScheduleFor,
  scheduleAbilityCount,
  unitRankAbilityIcon,
  unitStatStepsFor
} from "./experience-rank-abilities";

export const UNIT_RANK_NAMES = ["", "Seasoned", "Veteran", "Elite", "Legend"] as const;
export const MAX_UNIT_RANK = 4;

export const UNIT_RANK_BADGE_IMAGES = [
  "",
  "/assets/ui/unit-rank-seasoned.webp",
  "/assets/ui/unit-rank-veteran.webp",
  "/assets/ui/unit-rank-elite.webp",
  "/assets/ui/unit-rank-legend.webp"
] as const;

export function unitRankBadgeImage(rank: number): string | null {
  if (rank <= 0 || rank > MAX_UNIT_RANK) return null;
  return UNIT_RANK_BADGE_IMAGES[rank] ?? null;
}

export const UNIT_RANK_STAT_ICONS = {
  attack: "/assets/ui/rank-stat/attack.webp",
  defense: "/assets/ui/rank-stat/defense.webp",
  health: "/assets/ui/rank-stat/health.webp",
  initiative: "/assets/ui/rank-stat/initiative.webp"
} as const;

export function unitRankStatIcons(bonus: {
  attack: number;
  defense: number;
  health: number;
  initiative: number;
}): string[] {
  return (Object.keys(UNIT_RANK_STAT_ICONS) as (keyof typeof UNIT_RANK_STAT_ICONS)[])
    .filter((stat) => bonus[stat] > 0)
    .map((stat) => UNIT_RANK_STAT_ICONS[stat]);
}

export function unitRankStatVariantName(bonus: {
  attack: number;
  defense: number;
  health: number;
  initiative: number;
}): string {
  const active = [bonus.attack, bonus.defense, bonus.health, bonus.initiative].filter((value) => value > 0).length;
  if (active > 1) return "Veteran conditioning";
  if (bonus.attack > 0) return "Battle-hardened";
  if (bonus.defense > 0) return "Shield discipline";
  if (bonus.health > 0) return "Enduring ranks";
  if (bonus.initiative > 0) return "Battle tempo";
  return "Field training";
}

/** Higher tiers rank slower — they do not get stronger rewards. */
export const UNIT_RANK_THRESHOLDS: Record<UnitTier, readonly [number, number, number, number]> = {
  bronze: [3, 6, 10, 14],
  silver: [4, 8, 13, 18],
  gold: [5, 10, 16, 22],
  azure: [5, 10, 16, 22]
};

/** @deprecated Live fold uses UNIT_STAT_STEPS + schedule. */
export const UNIT_RANK_STAT_BONUSES = {
  bronze: [
    { attack: 0, defense: 1, health: 0, initiative: 0 },
    { attack: 1, defense: 1, health: 0, initiative: 0 },
    { attack: 1, defense: 1, health: 1, initiative: 1 },
    { attack: 1, defense: 1, health: 1, initiative: 1 }
  ],
  silver: [
    { attack: 0, defense: 1, health: 0, initiative: 0 },
    { attack: 1, defense: 1, health: 0, initiative: 0 },
    { attack: 1, defense: 1, health: 1, initiative: 0 },
    { attack: 1, defense: 1, health: 1, initiative: 0 }
  ],
  gold: [
    { attack: 1, defense: 0, health: 0, initiative: 0 },
    { attack: 1, defense: 1, health: 0, initiative: 0 },
    { attack: 1, defense: 1, health: 1, initiative: 0 },
    { attack: 1, defense: 1, health: 1, initiative: 0 }
  ],
  azure: [
    { attack: 1, defense: 0, health: 0, initiative: 0 },
    { attack: 1, defense: 1, health: 0, initiative: 0 },
    { attack: 1, defense: 1, health: 1, initiative: 0 },
    { attack: 1, defense: 1, health: 1, initiative: 0 }
  ]
} as const;

export const UNIT_XP_PVP_WIN = 2;
export const UNIT_XP_BANK_MIN = 2;
export const DRILL_UNIT_GOLD_COST = 2;
export const DRILL_UNIT_XP = 1;

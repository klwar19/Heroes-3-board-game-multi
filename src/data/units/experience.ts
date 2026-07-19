import type { UnitTier } from "@/data/factions/types";

/**
 * Unit Experience — 4 ranks. Each rank = stats XOR ability.
 * Ability budget from 3 templates (standard 1 / strong 2 / rare 3), never by
 * gold tier. Unique schedules for every faction unit; neutrals use flavoured
 * template fills.
 */

export type {
  UnitRankStatBonus,
  RankSchedule,
  RankStep,
  RankTemplateId,
  RankAbilityTrackId
} from "./experience-rank-abilities";

export {
  ELITE_UNIT_RANK_ABILITIES,
  LEGEND_UNIT_RANK_ABILITIES,
  RANK_ABILITY_TRACK_LABELS,
  RANK_ABILITY_TRACKS,
  RANK_SCHEDULES,
  RANK_TEMPLATES,
  RANK_TEMPLATE_LABELS,
  UNIT_RANK_ABILITY_ICONS,
  UNIT_RANK_ABILITY_SCHEDULES,
  UNIT_RANK_SCHEDULES,
  UNIT_RANK_TRACK_OVERRIDES,
  UNIT_STAT_STEPS,
  buildScheduleFromTemplate,
  hasUniqueRankSchedule,
  inferFlavour,
  inferRankAbilityTrack,
  rankAbilityScheduleFor,
  rankAbilityTrackFor,
  rankScheduleFor,
  scheduleAbilityCount,
  scheduleTemplateId,
  unitRankAbilityIcon
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

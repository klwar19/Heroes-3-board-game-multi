import type { ArmyUnitState, CombatContext, PlayerState } from "./state";

export const FUYUKI_COMMAND_SEAL_LIMIT = 3;

export const HIDDEN_LEAF_GOLD_COMBAT_LIMIT = 2;

type HiddenLeafFormationUnit = Pick<ArmyUnitState, "side"> & { tier?: string };

/**
 * Hidden Leaf fields its own shinobi and summons: Neutral-side cards never join
 * its battles, and at most two Gold cards may be deployed at once. The cards may
 * remain in the persistent army for map effects or a later faction change; this
 * is deliberately a combat-formation rule, not destructive roster cleanup.
 */
export function hiddenLeafCombatFormationError(
  player: Pick<PlayerState, "factionId"> | undefined,
  units: readonly HiddenLeafFormationUnit[]
): string | null {
  if (player?.factionId !== "hidden_leaf") return null;
  if (units.some((unit) => unit.side === "neutral")) {
    return "Hidden Leaf cannot deploy Neutral units in battle.";
  }
  if (units.filter((unit) => unit.tier === "gold").length > HIDDEN_LEAF_GOLD_COMBAT_LIMIT) {
    return `Hidden Leaf can deploy at most ${HIDDEN_LEAF_GOLD_COMBAT_LIMIT} Gold units in battle.`;
  }
  return null;
}

/** Optional-state reader: legacy Fuyuki saves begin with the full three seals. */
export function fuyukiCommandSealsOf(player: PlayerState | undefined): number {
  if (!player || player.factionId !== "fuyuki") return 0;
  return Math.max(0, Math.min(FUYUKI_COMMAND_SEAL_LIMIT, player.fuyukiCommandSeals ?? FUYUKI_COMMAND_SEAL_LIMIT));
}

export type HiddenLeafMissionRank = "D" | "C" | "B" | "A" | "S";

const HIDDEN_LEAF_MISSION_RANKS: ReadonlyArray<{ rank: HiddenLeafMissionRank; threshold: number }> = [
  { rank: "D", threshold: 0 },
  { rank: "C", threshold: 3 },
  { rank: "B", threshold: 7 },
  { rank: "A", threshold: 12 },
  { rank: "S", threshold: 18 }
];

export function hiddenLeafMissionRankOf(points: number): HiddenLeafMissionRank {
  const safe = Math.max(0, Math.floor(points));
  let result: HiddenLeafMissionRank = "D";
  for (const entry of HIDDEN_LEAF_MISSION_RANKS) {
    if (safe < entry.threshold) break;
    result = entry.rank;
  }
  return result;
}

export function hiddenLeafNextMissionRank(points: number): { rank: HiddenLeafMissionRank; threshold: number } | null {
  const safe = Math.max(0, Math.floor(points));
  return HIDDEN_LEAF_MISSION_RANKS.find((entry) => entry.threshold > safe) ?? null;
}

export function hiddenLeafMissionPointsEarned(context: CombatContext): number {
  if (context.kind !== "neutral" || context.waveAssault || context.teleportArrival) return 0;
  if (context.raidBossId || context.dungeonFloor !== undefined) return 3;
  if (context.bankId) return 2;
  if (context.difficulty <= 0) return 0;
  if (context.hasAzure || context.difficulty >= 6) return 3;
  return context.difficulty >= 3 ? 2 : 1;
}

export type HiddenLeafMissionCompletion = {
  pointsEarned: number;
  previousPoints: number;
  totalPoints: number;
  previousRank: HiddenLeafMissionRank;
  rank: HiddenLeafMissionRank;
  bountyGold: number;
  promotionValuables: number;
};

/**
 * Hidden Leaf's mission economy. The recurring bounty is deliberately capped at
 * 2 gold and promotions grant only one valuable per crossed rank, preventing the
 * persistent track from outgrowing normal neutral-combat rewards.
 */
export function hiddenLeafMissionCompletion(
  player: PlayerState,
  context: CombatContext
): HiddenLeafMissionCompletion | null {
  if (player.factionId !== "hidden_leaf") return null;
  const pointsEarned = hiddenLeafMissionPointsEarned(context);
  if (pointsEarned <= 0) return null;

  const previousPoints = Math.max(0, Math.floor(player.hiddenLeafMissionPoints ?? 0));
  const totalPoints = previousPoints + pointsEarned;
  const previousRank = hiddenLeafMissionRankOf(previousPoints);
  const rank = hiddenLeafMissionRankOf(totalPoints);
  const previousIndex = HIDDEN_LEAF_MISSION_RANKS.findIndex((entry) => entry.rank === previousRank);
  const rankIndex = HIDDEN_LEAF_MISSION_RANKS.findIndex((entry) => entry.rank === rank);
  const bountyGold = rank === "D" ? 0 : rank === "C" || rank === "B" ? 1 : 2;

  return {
    pointsEarned,
    previousPoints,
    totalPoints,
    previousRank,
    rank,
    bountyGold,
    promotionValuables: Math.max(0, rankIndex - previousIndex)
  };
}

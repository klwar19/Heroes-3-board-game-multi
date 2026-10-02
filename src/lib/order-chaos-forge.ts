/**
 * Order & Chaos Forge payments on the save. A blade is paid for the moment it
 * is finished (engine/garrison/order-chaos/forge-game.ts phase "done"): only an
 * unfinished blade can be left with nothing spent, so a finished one can't be
 * thrown back to forge again for a better quality. A Masterwork Hammer can
 * then lift a blade just tempered below Masterwork.
 */

import { OC_RANK_COST, heroRankCap, heroRankOf, type OcHeroId } from "@/engine/garrison/order-chaos/campaign";
import { forgeQuality, forgeRefund, forgeScore, type ForgeGame, type ForgeQuality } from "@/engine/garrison/order-chaos/forge-game";
import type { OcProgress } from "./order-chaos-progress";
import { spendHammer } from "./order-chaos-treasury";

/** A tempered blade: the hero's new rank, its quality and the Ore handed back. */
export type ForgeClaim = { hero: OcHeroId; rank: number; quality: ForgeQuality; refund: number };

/**
 * Temper a finished blade: the hero reaches `rank`, the rank's Ore and Gems are
 * paid and the quality's share of the Ore handed back. Null (nothing changes)
 * while the blade is unfinished, or when it can't be paid for any more (the
 * rank already reached, past the campaign's cap, not enough Ore or Gems).
 */
export function temperBlade(p: OcProgress, game: ForgeGame, hero: OcHeroId, rank: number, cleared: readonly string[]): { p: OcProgress; claim: ForgeClaim } | null {
  if (game.phase !== "done") return null;
  const price = OC_RANK_COST[rank];
  if (!price || heroRankOf(hero, p.heroRanks) !== rank - 1 || rank > heroRankCap(cleared) || p.ore < price.ore || p.gems < price.gems) return null;
  const quality = forgeQuality(forgeScore(game));
  const refund = forgeRefund(quality, price.ore);
  return {
    p: { ...p, ore: p.ore - price.ore + refund, gems: p.gems - price.gems, heroRanks: { ...p.heroRanks, [hero]: rank } },
    claim: { hero, rank, quality, refund }
  };
}

/**
 * Spend a Masterwork Hammer on a blade just tempered below Masterwork: it
 * counts as a Masterwork and the rest of a Masterwork's Ore comes back. Null
 * without a hammer, for a Masterwork already, or when the hero isn't at that rank.
 */
export function hammerBlade(p: OcProgress, claim: ForgeClaim): { p: OcProgress; claim: ForgeClaim } | null {
  const price = OC_RANK_COST[claim.rank];
  if (!price || claim.quality === "masterwork" || heroRankOf(claim.hero, p.heroRanks) !== claim.rank) return null;
  const spent = spendHammer(p);
  if (!spent) return null;
  const refund = forgeRefund("masterwork", price.ore);
  return { p: { ...spent, ore: spent.ore + refund - claim.refund }, claim: { ...claim, quality: "masterwork", refund } };
}

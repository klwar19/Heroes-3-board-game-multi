import { cardLibrary } from "@/data/cards/library";
import { coreUnitDefinitions } from "@/data/factions/units";
import { getPermanentCardIds } from "../permanents";
import type { CardId, GameState, PlayerId, ResourceCost } from "../state";
import {
  goldArmyAllowsBronzePurchase,
  hasReachedGoldArmy,
  nextGoldLadderStep,
} from "./development";
import { GOLD_RESERVE } from "./market-trades";

/**
 * Shared valuations for the optional purchases Astrologers / Events /
 * Diplomacy put in front of the computer seat: paid or free Neutral recruits,
 * War Machine grants and buys, Statistic empowers. One pricing so Charlie and
 * his Circus, Unexpected Reinforcements, Diplomacy's draw, the Wandering
 * Merchant, McGiver, Dancing Imp, Explorers and Hero all obey the same golden
 * rules: never spend the missing Gold body's inputs on a lesser body, keep the
 * gold reserve, do not stack surplus bodies "because the menu is open", and
 * never own a second War Machine (the permanent slot fits one).
 */

type NeutralTier = "bronze" | "silver" | "gold" | "azure";

/** Gold-equivalent printed cost (same weights the Event menus use). */
export function recruitCostValue(cost: ResourceCost | undefined): number {
  return (cost?.gold ?? 0) + (cost?.buildingMaterials ?? 0) * 3 + (cost?.valuables ?? 0) * 7;
}

/**
 * True when paying `cost` would drop a resource below what the next Gold
 * RECRUIT step still needs — the "gold unit by round 9" golden rule applied to
 * optional purchases. A pending Necromancy window keeps its own budgeting.
 */
export function spendsGoldLadderFund(
  state: GameState,
  playerId: PlayerId,
  cost: ResourceCost | null | undefined,
): boolean {
  const step = nextGoldLadderStep(state, playerId);
  if (!cost || step?.kind !== "recruit" || state.adventure?.pendingNecromancy?.playerId === playerId) return false;
  const resources = state.players[playerId]?.resources;
  if (!resources) return false;
  return (["gold", "buildingMaterials", "valuables"] as const).some(
    (resource) =>
      (cost[resource] ?? 0) > 0 &&
      resources[resource] - (cost[resource] ?? 0) < (step.cost[resource] ?? 0),
  );
}

/** Gold left after paying `cost` (undefined cost = free). */
function goldAfter(state: GameState, playerId: PlayerId, cost: ResourceCost | undefined): number {
  return (state.players[playerId]?.resources.gold ?? 0) - (cost?.gold ?? 0);
}

/** Raw combat worth of a Neutral card side (attack-weighted, like the Event menus). */
export function neutralUnitStrength(unitDefId: string): number {
  const side = coreUnitDefinitions[unitDefId]?.neutral;
  if (!side) return 0;
  return side.attack * 3 + side.health * 2 + side.defense + Math.round(side.initiative / 2);
}

let tierMeanCache: Record<NeutralTier, number> | null = null;

/** Mean {@link neutralUnitStrength} of every Neutral card in a tier (deck average). */
export function neutralTierMeanStrength(tier: NeutralTier): number {
  if (!tierMeanCache) {
    const sums: Record<NeutralTier, { total: number; count: number }> = {
      bronze: { total: 0, count: 0 },
      silver: { total: 0, count: 0 },
      gold: { total: 0, count: 0 },
      azure: { total: 0, count: 0 },
    };
    for (const [unitDefId, def] of Object.entries(coreUnitDefinitions)) {
      if (!def.neutral) continue;
      const bucket = sums[def.tier as NeutralTier];
      if (!bucket) continue;
      bucket.total += neutralUnitStrength(unitDefId);
      bucket.count += 1;
    }
    const mean = (bucket: { total: number; count: number }) => (bucket.count ? bucket.total / bucket.count : 0);
    tierMeanCache = {
      bronze: mean(sums.bronze),
      silver: mean(sums.silver),
      gold: mean(sums.gold),
      azure: mean(sums.azure),
    };
  }
  return tierMeanCache[tier];
}

/**
 * Worth of adding `unitDefId` as a recruited Neutral. Positive = take it,
 * <= 0 = leave it (the menu's decline must win). `cost` is the real priced
 * cost (vouchers applied) — pass the printed side cost when nothing else is
 * known; `free` marks a no-cost grant (Unexpected Reinforcements), which only
 * the body-count guard applies to.
 *
 * Refusals (return -100):
 *  - paid Bronze after Silver/Gold (AI spending rule, engine legality untouched);
 *  - a paid non-Gold body that eats the next Gold recruit's inputs;
 *  - a paid buy that breaks the gold reserve (a Gold/Azure body may spend down
 *    to zero — it IS the ladder's goal);
 *  - once the Gold army stands, paid Silver only when it is a strong card at a
 *    cheap price (a stray Silver body rarely beats the next Gold Pack);
 *  - surplus bodies: paid non-Gold beyond seven army cards, anything beyond
 *    eight — an Astrologers offer that RETURNS next round must not drain the
 *    treasury into bodies the battlefield never fields.
 */
export function neutralRecruitUtility(
  state: GameState,
  playerId: PlayerId,
  unitDefId: string,
  options: { cost?: ResourceCost; free?: boolean } = {},
): number {
  const def = coreUnitDefinitions[unitDefId];
  const side = def?.neutral;
  if (!def || !side) return 0;
  const player = state.players[playerId];
  const army = player?.army.length ?? 0;
  const tier = def.tier as NeutralTier;
  const premium = tier === "gold" || tier === "azure";
  const free = Boolean(options.free);
  const cost = free ? undefined : (options.cost ?? side.cost);
  if (army >= 8 || (army >= 7 && !premium && !free)) return -100;
  if (!free) {
    if (!goldArmyAllowsBronzePurchase(state, playerId, unitDefId, "recruit")) return -100;
    if (!premium && spendsGoldLadderFund(state, playerId, cost)) return -100;
    if (goldAfter(state, playerId, cost) < (premium ? 0 : GOLD_RESERVE)) return -100;
    if (
      tier === "silver" &&
      hasReachedGoldArmy(state, playerId) &&
      (neutralUnitStrength(unitDefId) < neutralTierMeanStrength("silver") || recruitCostValue(cost) > 6)
    ) {
      return -100;
    }
  }
  const tierBonus = tier === "azure" ? 48 : tier === "gold" ? 34 : tier === "silver" ? 20 : 8;
  const thinArmyBonus = army < 5 ? 18 : 0;
  return tierBonus + neutralUnitStrength(unitDefId) + thinArmyBonus - Math.round(recruitCostValue(cost) * 1.5);
}

/** War Machine cards the seat already has in play or waiting in hand. */
export function ownedWarMachineIds(state: GameState, playerId: PlayerId): CardId[] {
  const player = state.players[playerId];
  const held = [...getPermanentCardIds(state, playerId), ...(player?.hand ?? [])];
  return held.filter((cardId) => cardId.startsWith("war_machine."));
}

/**
 * User ruling: a First Aid Tent is the machine to get; a Ballista / Ammo Cart /
 * Cannon is fine, but once ANY machine is owned no second one is bought or
 * taken — the single permanent slot cannot field it.
 */
export function ownsAnyWarMachine(state: GameState, playerId: PlayerId): boolean {
  return ownedWarMachineIds(state, playerId).length > 0;
}

/** 3 = First Aid Tent, 2 = Ballista, 1 = Ammo Cart, 0 = Cannon / other. */
export function warMachinePreference(cardId: CardId): number {
  const name = cardLibrary[cardId]?.name?.toLowerCase() ?? "";
  if (cardId.includes("first_aid") || name.includes("first aid")) return 3;
  if (cardId.includes("ballista") || name.includes("ballista")) return 2;
  if (cardId.includes("ammo") || name.includes("ammo")) return 1;
  return 0;
}

/**
 * Worth of a War Machine grant / discounted buy. -100 refuses (owns a machine
 * already, or the price breaks the reserve / Gold-ladder fund); otherwise a
 * free grant scores well and the Tent leads every list.
 */
export function warMachineGrantUtility(
  state: GameState,
  playerId: PlayerId,
  cardId: CardId,
  cost?: ResourceCost,
): number {
  if (ownsAnyWarMachine(state, playerId)) return -100;
  const preference = warMachinePreference(cardId) * 4;
  if (!cost || recruitCostValue(cost) === 0) return 32 + preference;
  if (spendsGoldLadderFund(state, playerId, cost) || goldAfter(state, playerId, cost) < GOLD_RESERVE) return -100;
  return 20 + preference;
}

/**
 * User ruling for Statistic empowers (Dancing Imp / Explorers / Hero):
 * Knowledge first, then Attack / Power, then the rest. An empower taken from
 * the DISCARD pile is worth a little more — the Empowered card arrives in hand
 * while the hand keeps every card it already held.
 */
export function statisticEmpowerPreference(cardId: CardId): number {
  switch (cardLibrary[cardId]?.statisticType) {
    case "knowledge":
      return 44;
    case "attack":
      return 36;
    case "power":
      return 34;
    case "defense":
      return 26;
    default:
      return 20;
  }
}

export function statisticEmpowerUtility(
  state: GameState,
  playerId: PlayerId,
  cardId: CardId,
  source: "hand" | "discard",
  costGold = 0,
): number {
  if (costGold > 0) {
    const cost = { gold: costGold };
    if (spendsGoldLadderFund(state, playerId, cost) || goldAfter(state, playerId, cost) < GOLD_RESERVE) return -100;
  }
  return statisticEmpowerPreference(cardId) + (source === "discard" ? 6 : 0) - costGold * 3;
}

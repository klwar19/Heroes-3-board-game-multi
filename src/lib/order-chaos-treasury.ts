/**
 * Order & Chaos treasury operations on the saved progress: Portal pulls,
 * prizes, the Stardust Exchange, daily attendance, Satchel items (use, pack,
 * spend one each time a battle uses it) and battle drops. Each returns a new OcProgress (or
 * the same one when the action isn't allowed), so the app can run them inside
 * its `update` and they always act on the latest save.
 */

import { OC_GACHA_ARTIFACTS, OC_GACHA_CHAOS, OC_GACHA_HERO, OC_GACHA_UNITS } from "@/engine/garrison/order-chaos/gacha-content";
import { OC_GARDEN_STAGES, OC_SEEDS, isRipe } from "@/engine/garrison/order-chaos/garden";
import {
  OC_ATTENDANCE, OC_EXCHANGE_PRICE, OC_ITEMS, OC_PACK_SLOTS, OC_PULL_COST, OC_STARDUST_DUPLICATE, OC_STARDUST_PER_PULL, OC_SUMMON_LOG_KEPT, OC_TEN_PULL_COST,
  attendanceToday, isOcItem, portalPools, satchelFor, summon, type OcItemId, type OcPrize, type OcPull, type OcRarity, type OcSatchelSlot, type OcSummonRecord
} from "@/engine/garrison/order-chaos/treasury";
import type { OcProgress } from "./order-chaos-progress";

export const OC_PORTAL_POOLS = portalPools({
  units: OC_GACHA_UNITS,
  chaos: OC_GACHA_CHAOS,
  artifacts: OC_GACHA_ARTIFACTS,
  hero: OC_GACHA_HERO
});

export function itemCount(p: OcProgress, id: OcItemId): number {
  return p.items[id] ?? 0;
}

export function addItems(p: OcProgress, list: readonly { id: OcItemId; count: number }[]): OcProgress {
  if (!list.length) return p;
  const items = { ...p.items };
  for (const { id, count } of list) if (OC_ITEMS[id] && count > 0) items[id] = (items[id] ?? 0) + count;
  return { ...p, items };
}

function takeItem(p: OcProgress, id: OcItemId, count = 1): OcProgress | null {
  const have = p.items[id] ?? 0;
  if (have < count) return null;
  const items = { ...p.items };
  if (have - count > 0) items[id] = have - count;
  else delete items[id];
  // A packed boost can't outnumber what is left.
  const packed = p.packed.filter((x, i) => x !== id || p.packed.slice(0, i + 1).filter((y) => y === id).length <= (items[id] ?? 0));
  return { ...p, items, packed };
}

/** Does the save already own this permanent prize? */
export function ownsPrize(p: OcProgress, prize: OcPrize): boolean {
  if (prize.kind === "unit") return p.gacha.units.includes(prize.id);
  if (prize.kind === "chaos") return p.gacha.chaos.includes(prize.id);
  if (prize.kind === "artifact") return p.gacha.artifacts.includes(prize.id);
  if (prize.kind === "hero") return p.gacha.heroes.includes(prize.id);
  return false;
}

/** Hand a prize over: items stack; a permanent prize unlocks, or (already owned) turns into Stardust. Returns the save and whether it was a duplicate. */
export function grantPrize(p: OcProgress, prize: OcPrize, rarity: OcRarity): { p: OcProgress; duplicate: boolean } {
  if (prize.kind === "item") return { p: addItems(p, [{ id: prize.id, count: prize.count }]), duplicate: false };
  if (ownsPrize(p, prize)) {
    const dust = OC_STARDUST_DUPLICATE[rarity === "UR" ? "UR" : "SSR"];
    return { p: { ...p, stardust: p.stardust + dust }, duplicate: true };
  }
  const key = prize.kind === "unit" ? "units" : prize.kind === "chaos" ? "chaos" : prize.kind === "artifact" ? "artifacts" : "heroes";
  return { p: { ...p, gacha: { ...p.gacha, [key]: [...p.gacha[key], prize.id] } }, duplicate: false };
}

/** A pull as handed over: `duplicate` (a permanent prize already owned, turned into Stardust) and `dust` (all the Stardust it left). */
export type OcPullResult = OcPull & { duplicate: boolean; dust: number };

/**
 * Summon `count` times (1 or 10), paying with Summoning Tickets first (one a
 * pull) and Crystals for the rest. Returns null when it can't be paid for.
 */
export function pullPortal(p: OcProgress, count: 1 | 10, rand: () => number, now = Date.now()): { p: OcProgress; results: OcPullResult[] } | null {
  const { tickets, crystals } = pullPrice(p, count);
  if (p.crystals < crystals) return null;
  let next: OcProgress = tickets ? takeItem(p, "summon-ticket", tickets)! : p;
  next = { ...next, crystals: next.crystals - crystals };
  const { pulls, pity } = summon(OC_PORTAL_POOLS, next.pity, count, rand);
  next = { ...next, pity };
  const results: OcPullResult[] = [];
  for (const pull of pulls) {
    const granted = grantPrize(next, pull.prize, pull.rarity);
    const stardust = granted.p.stardust + OC_STARDUST_PER_PULL[pull.rarity];
    results.push({ ...pull, duplicate: granted.duplicate, dust: stardust - next.stardust });
    next = { ...granted.p, stardust };
  }
  // The Portal's history (the latest OC_SUMMON_LOG_KEPT summons).
  const log = results.map((r): OcSummonRecord => ({ at: now, rarity: r.rarity, prize: r.prize, duplicate: r.duplicate, dust: r.dust }));
  next = { ...next, summonLog: [...(next.summonLog ?? []), ...log].slice(-OC_SUMMON_LOG_KEPT) };
  return { p: next, results };
}

/** What a ten-pull or single pull costs right now (tickets are used first; each takes one pull's price off, the ten-pull's discount too). */
export function pullPrice(p: OcProgress, count: 1 | 10): { tickets: number; crystals: number } {
  const tickets = Math.min(count, itemCount(p, "summon-ticket"));
  const full = count === 10 ? OC_TEN_PULL_COST : count * OC_PULL_COST;
  return { tickets, crystals: Math.max(0, full - tickets * OC_PULL_COST) };
}

/** Buy a prize in the Stardust Exchange (a permanent prize only while not owned). */
export function exchange(p: OcProgress, prize: OcPrize, rarity: OcRarity): OcProgress {
  const price = OC_EXCHANGE_PRICE[rarity];
  if (p.stardust < price || (prize.kind !== "item" && ownsPrize(p, prize))) return p;
  return grantPrize({ ...p, stardust: p.stardust - price }, prize, rarity).p;
}

/** Claim today's attendance square (once a UTC day). */
export function claimAttendance(p: OcProgress, day: string): OcProgress {
  const today = attendanceToday(p.attendance, day);
  if (!today.open) return p;
  const reward = OC_ATTENDANCE[today.index]!;
  const next = addItems({ ...p, crystals: p.crystals + (reward.crystals ?? 0) }, reward.items ?? []);
  return { ...next, attendance: { lastDay: day, claimed: p.attendance.claimed + 1 } };
}

/** Use a resource item from the Satchel (Ore, Seals, Gems, Crystals). */
export function useItem(p: OcProgress, id: OcItemId): OcProgress {
  const effect = OC_ITEMS[id]?.effect;
  if (!effect || effect.kind !== "use") return p;
  const next = takeItem(p, id);
  if (!next) return p;
  return { ...next, ore: next.ore + (effect.ore ?? 0), seals: next.seals + (effect.seals ?? 0), gems: next.gems + (effect.gems ?? 0), crystals: next.crystals + (effect.crystals ?? 0) };
}

/** Spend a Growth Potion on a growing plant: it ripens at once (its watering still counts). */
export function ripenPlot(p: OcProgress, plot: number, now: number): OcProgress {
  const plant = p.garden[plot];
  if (!plant || (p.items["growth-potion"] ?? 0) < 1) return p;
  const seed = OC_SEEDS[plant.seed];
  // (A plant already ripe by the clock, though not yet looked at, needs no potion.)
  if (!seed || isRipe(plant, now)) return p;
  const next = takeItem(p, "growth-potion")!;
  const garden = [...next.garden];
  garden[plot] = { ...plant, grown: seed.growMs, at: now, wet: false, watered: Math.min(OC_GARDEN_STAGES, plant.watered) };
  return { ...next, garden };
}

/** Spend a Masterwork Hammer (the Forge calls this when the player chooses to). */
export function spendHammer(p: OcProgress): OcProgress | null {
  return takeItem(p, "masterwork-hammer");
}

/** Pack or unpack a boost item for the next battles (at most OC_PACK_SLOTS different ones, only while owned; it stays packed until unpacked or used up). */
export function togglePacked(p: OcProgress, id: OcItemId): OcProgress {
  if (OC_ITEMS[id]?.effect.kind !== "boost") return p;
  if (p.packed.includes(id)) return { ...p, packed: p.packed.filter((x) => x !== id) };
  if (p.packed.length >= OC_PACK_SLOTS || (p.items[id] ?? 0) < 1) return p;
  return { ...p, packed: [...p.packed, id] };
}

/** The packed boosts still owned (what the next battle will really carry). */
export function packedOwned(p: OcProgress): OcItemId[] {
  return p.packed.filter((id) => (p.items[id] ?? 0) > 0 && OC_ITEMS[id]?.effect.kind === "boost").slice(0, OC_PACK_SLOTS);
}

/** The Satchel a battle takes: the packed boosts still owned, each with its uses there (owned, at most its perMatch). */
export function packedSatchel(p: OcProgress): OcSatchelSlot[] {
  return satchelFor(packedOwned(p), (id) => itemCount(p, id));
}

/** The battle used a Satchel item (its "item" event): one copy is spent. Nothing changes when none is left. */
export function spendItem(p: OcProgress, id: string): OcProgress {
  if (!isOcItem(id)) return p;
  return takeItem(p, id) ?? p;
}

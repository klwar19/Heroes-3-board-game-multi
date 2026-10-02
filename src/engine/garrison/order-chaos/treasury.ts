/**
 * Order & Chaos treasury: Crystals (the premium currency, earned in play —
 * never bought), the Summoning Portal (a gacha with R / SR / SSR / UR prizes
 * and pity), Stardust (from duplicates, spent in the Stardust Exchange), the
 * daily attendance calendar, and usable items kept in the Satchel with a
 * quantity (battle boosts packed before a fight and used during it, and
 * resource items used from the Satchel). Pure data and functions; the progress
 * store and the UI (components/garrison/order-chaos/treasury-ui.tsx) call these.
 *
 * Every prize is real: packed boosts go into the battle as its Satchel
 * (campaign.ts buildOcConfig `satchel`; the simulation, sim.ts checkItem,
 * applies them and holds each to its `perMatch` uses), other items change the
 * progress; permanent prizes unlock gacha-only units, Chaos raid units,
 * artifacts and a hero (./gacha-content).
 */

export type OcRarity = "R" | "SR" | "SSR" | "UR";
export const OC_RARITY_ORDER: readonly OcRarity[] = ["R", "SR", "SSR", "UR"];

// ---------------------------------------------------------------------------
// Items

export type OcItemId =
  | "war-chest" | "mana-draught" | "ore-cart" | "seal-pouch"
  | "royal-treasury" | "surge-flask" | "warding-scroll" | "hunters-scroll" | "gem-pouch" | "growth-potion" | "summon-ticket"
  | "phoenix-feather" | "masterwork-hammer";

/**
 * What an item does: `boost` items are packed for a battle and used during it
 * from the battle's Satchel (one copy spent a use, at most `perMatch` uses a
 * battle); `use` items act at once from the Satchel.
 */
export type OcItemEffect =
  | { kind: "boost"; perMatch: number; gold?: number; mana?: number; surges?: number; blessing?: string; phoenix?: boolean }
  | { kind: "use"; ore?: number; seals?: number; gems?: number; crystals?: number }
  | { kind: "ripen" }
  | { kind: "masterwork" }
  | { kind: "ticket" };

export type OcItem = { id: OcItemId; name: string; rarity: OcRarity; icon: string; effect: OcItemEffect; blurb: string };

const icon = (id: string) => `/assets/order-chaos/items/${id}.webp`;

export const OC_ITEMS: Readonly<Record<OcItemId, OcItem>> = {
  "war-chest": { id: "war-chest", name: "War Chest", rarity: "R", icon: icon("war-chest"), effect: { kind: "boost", perMatch: 2, gold: 100 }, blurb: "Pack it for a battle, then use it there: +100 gold." },
  "mana-draught": { id: "mana-draught", name: "Mana Draught", rarity: "R", icon: icon("mana-draught"), effect: { kind: "boost", perMatch: 2, mana: 8 }, blurb: "Pack it for a battle, then drink it there: +8 mana." },
  "ore-cart": { id: "ore-cart", name: "Cart of Ore", rarity: "R", icon: icon("ore-cart"), effect: { kind: "use", ore: 5 }, blurb: "Use it: +5 Ore for the Forge." },
  "seal-pouch": { id: "seal-pouch", name: "Pouch of Seals", rarity: "R", icon: icon("seal-pouch"), effect: { kind: "use", seals: 3 }, blurb: "Use it: +3 Seals for the Barracks and the Mercenary Camp." },
  "royal-treasury": { id: "royal-treasury", name: "Royal Treasury", rarity: "SR", icon: icon("royal-treasury"), effect: { kind: "boost", perMatch: 1, gold: 250 }, blurb: "Pack it for a battle, then open it there: +250 gold." },
  "surge-flask": { id: "surge-flask", name: "Surge Flask", rarity: "SR", icon: icon("surge-flask"), effect: { kind: "boost", perMatch: 1, surges: 1 }, blurb: "Pack it for a battle, then uncork it there: one more Surge orb." },
  "warding-scroll": { id: "warding-scroll", name: "Scroll of Warding", rarity: "SR", icon: icon("warding-scroll"), effect: { kind: "boost", perMatch: 1, blessing: "armor-of-wonder" }, blurb: "Pack it for a battle, then read it there: the Armor of Wonder's blessing for the rest of that battle (if it isn't already in play)." },
  "hunters-scroll": { id: "hunters-scroll", name: "Hunter's Scroll", rarity: "SR", icon: icon("hunters-scroll"), effect: { kind: "boost", perMatch: 1, blessing: "golden-bow" }, blurb: "Pack it for a battle, then read it there: the Golden Bow's blessing for the rest of that battle (if it isn't already in play)." },
  "gem-pouch": { id: "gem-pouch", name: "Pouch of Gems", rarity: "SR", icon: icon("gem-pouch"), effect: { kind: "use", gems: 8 }, blurb: "Use it: +8 Gems for the Forge (outside the garden's daily limit)." },
  "growth-potion": { id: "growth-potion", name: "Growth Potion", rarity: "SR", icon: icon("growth-potion"), effect: { kind: "ripen" }, blurb: "Use it in the Magic Garden: one growing plant ripens at once (its watering still counts for lush)." },
  "summon-ticket": { id: "summon-ticket", name: "Summoning Ticket", rarity: "SR", icon: icon("summon-ticket"), effect: { kind: "ticket" }, blurb: "One free summon at the Portal." },
  "phoenix-feather": { id: "phoenix-feather", name: "Phoenix Feather", rarity: "SSR", icon: icon("phoenix-feather"), effect: { kind: "boost", perMatch: 1, phoenix: true }, blurb: "Pack it for a battle, then raise it there: from then on each lane's Champion rides back to the gate once after its charge, ready to charge again (it still counts as used for goals)." },
  "masterwork-hammer": { id: "masterwork-hammer", name: "Masterwork Hammer", rarity: "SSR", icon: icon("masterwork-hammer"), effect: { kind: "masterwork" }, blurb: "Spend it at the Forge when a blade is done: it counts as a Masterwork (half the Ore back)." }
};

export const OC_ITEM_ORDER: readonly OcItemId[] = [
  "war-chest", "mana-draught", "ore-cart", "seal-pouch",
  "royal-treasury", "surge-flask", "warding-scroll", "hunters-scroll", "gem-pouch", "growth-potion", "summon-ticket",
  "phoenix-feather", "masterwork-hammer"
];

/** Boost items a battle may carry (different ones; each used up to its `perMatch` times there). */
export const OC_PACK_SLOTS = 2;

export function isOcItem(id: string): id is OcItemId {
  return Object.prototype.hasOwnProperty.call(OC_ITEMS, id);
}

/** A boost item's uses in one battle (0 for an item that isn't a battle boost). */
export function itemPerMatch(id: string): number {
  const effect = isOcItem(id) ? OC_ITEMS[id].effect : undefined;
  return effect?.kind === "boost" ? Math.max(0, Math.floor(effect.perMatch)) : 0;
}

/** One packed item in a battle's Satchel: how many times it may be used there. */
export type OcSatchelSlot = { id: OcItemId; uses: number };

/**
 * The battle's Satchel from the packed items: each different boost once, with
 * uses = what is owned, never more than its `perMatch` (owned: copies held).
 */
export function satchelFor(packed: readonly OcItemId[], owned: (id: OcItemId) => number): OcSatchelSlot[] {
  const out: OcSatchelSlot[] = [];
  for (const id of packed) {
    if (out.some((slot) => slot.id === id) || out.length >= OC_PACK_SLOTS) continue;
    const uses = Math.min(itemPerMatch(id), Math.max(0, Math.floor(owned(id))));
    if (uses > 0) out.push({ id, uses });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Crystals earned in play

export const OC_CRYSTALS = {
  firstClear: 20,
  bossClear: 50,
  star: 10,
  raidFirst: 30,
  /** Endless: each new best tenth wave. */
  endlessTen: 30,
  /** The first Daily Siege run of a UTC day. */
  daily: 20
} as const;

// ---------------------------------------------------------------------------
// The Summoning Portal

export const OC_PULL_COST = 100;
export const OC_TEN_PULL_COST = 900;
/** An SSR or better is certain by this pull without one; a UR by this pull without one. */
export const OC_SSR_PITY = 50;
export const OC_UR_PITY = 100;
/** Base chances (the rest is R). */
export const OC_RATES: Readonly<Record<OcRarity, number>> = { UR: 0.006, SSR: 0.03, SR: 0.18, R: 0.784 };

/** A prize: an item (with how many), or a permanent unlock of gacha content. */
export type OcPrize =
  | { kind: "item"; id: OcItemId; count: number }
  | { kind: "unit"; id: string }
  | { kind: "chaos"; id: string }
  | { kind: "artifact"; id: string }
  | { kind: "hero"; id: string };

export type OcPoolEntry = { prize: OcPrize; weight: number };

/** The prizes of each rarity (the gacha-only content is supplied by the caller from ./gacha-content). */
export function portalPools(exclusive: { units: { kind: string; rarity: "SSR" | "UR" }[]; chaos: { kind: string }[]; artifacts: { id: string }[]; hero?: { id: string } }): Record<OcRarity, OcPoolEntry[]> {
  const item = (id: OcItemId, count = 1, weight = 1): OcPoolEntry => ({ prize: { kind: "item", id, count }, weight });
  return {
    R: [item("war-chest", 1, 3), item("mana-draught", 1, 3), item("ore-cart", 1, 3), item("seal-pouch", 1, 2)],
    SR: [item("royal-treasury"), item("surge-flask"), item("warding-scroll"), item("hunters-scroll"), item("gem-pouch"), item("growth-potion"), item("summon-ticket", 1, 0.6)],
    SSR: [
      item("phoenix-feather", 1, 2), item("masterwork-hammer", 1, 2),
      ...exclusive.units.filter((u) => u.rarity === "SSR").map((u): OcPoolEntry => ({ prize: { kind: "unit", id: u.kind }, weight: 1.5 })),
      ...exclusive.chaos.map((u): OcPoolEntry => ({ prize: { kind: "chaos", id: u.kind }, weight: 1 })),
      ...exclusive.artifacts.map((a): OcPoolEntry => ({ prize: { kind: "artifact", id: a.id }, weight: 1.2 }))
    ],
    UR: [
      ...exclusive.units.filter((u) => u.rarity === "UR").map((u): OcPoolEntry => ({ prize: { kind: "unit", id: u.kind }, weight: 1 })),
      ...(exclusive.hero ? [{ prize: { kind: "hero", id: exclusive.hero.id } as OcPrize, weight: 1 }] : [])
    ]
  };
}

export type OcPity = { sinceSsr: number; sinceUr: number; pulls: number };

/** The rarity of the next pull, given the pity counters and a random number in [0, 1). */
export function rollRarity(pity: OcPity, r: number, atLeastSr = false): OcRarity {
  if (pity.sinceUr + 1 >= OC_UR_PITY) return "UR";
  if (pity.sinceSsr + 1 >= OC_SSR_PITY) return r < OC_RATES.UR / (OC_RATES.UR + OC_RATES.SSR) ? "UR" : "SSR";
  if (r < OC_RATES.UR) return "UR";
  if (r < OC_RATES.UR + OC_RATES.SSR) return "SSR";
  if (atLeastSr || r < OC_RATES.UR + OC_RATES.SSR + OC_RATES.SR) return "SR";
  return "R";
}

function pick(pool: readonly OcPoolEntry[], r: number): OcPrize | null {
  const total = pool.reduce((sum, e) => sum + e.weight, 0);
  if (total <= 0) return null;
  let roll = r * total;
  for (const entry of pool) {
    roll -= entry.weight;
    if (roll < 0) return entry.prize;
  }
  return pool[pool.length - 1]!.prize;
}

export type OcPull = { rarity: OcRarity; prize: OcPrize };

/**
 * `count` pulls. A ten-pull holds at least one SR or better. A rarity with no
 * prizes (e.g. no UR content) falls to the next rarity down. Returns the
 * prizes and the new pity counters. `rand` yields numbers in [0, 1).
 */
export function summon(pools: Record<OcRarity, OcPoolEntry[]>, pity: OcPity, count: number, rand: () => number): { pulls: OcPull[]; pity: OcPity } {
  const pulls: OcPull[] = [];
  let p = { ...pity };
  for (let i = 0; i < count; i += 1) {
    const guarantee = count >= 10 && i === count - 1 && !pulls.some((x) => x.rarity !== "R");
    let rarity = rollRarity(p, rand(), guarantee);
    let prize = pick(pools[rarity], rand());
    while (!prize && rarity !== "R") {
      rarity = OC_RARITY_ORDER[OC_RARITY_ORDER.indexOf(rarity) - 1]!;
      prize = pick(pools[rarity], rand());
    }
    if (!prize) break;
    pulls.push({ rarity, prize });
    p = {
      pulls: p.pulls + 1,
      sinceUr: rarity === "UR" ? 0 : p.sinceUr + 1,
      sinceSsr: rarity === "UR" || rarity === "SSR" ? 0 : p.sinceSsr + 1
    };
  }
  return { pulls, pity: p };
}

/** One summon as the save remembers it (the Portal's history): when, what, and the Stardust it left. */
export type OcSummonRecord = { at: number; rarity: OcRarity; prize: OcPrize; duplicate: boolean; dust: number };

/** The Portal's history keeps this many summons (the latest). */
export const OC_SUMMON_LOG_KEPT = 50;

/** Stored history, keeping only well-formed records (the latest OC_SUMMON_LOG_KEPT, oldest first). */
export function parseSummonLog(value: unknown): OcSummonRecord[] {
  if (!Array.isArray(value)) return [];
  const out: OcSummonRecord[] = [];
  const whole = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Partial<Record<keyof OcSummonRecord, unknown>>;
    const prize = r.prize && typeof r.prize === "object" ? (r.prize as Partial<Record<string, unknown>>) : null;
    if (!whole(r.at) || !OC_RARITY_ORDER.includes(r.rarity as OcRarity) || !prize || typeof prize.id !== "string") continue;
    let parsed: OcPrize | null = null;
    if (prize.kind === "item") parsed = isOcItem(prize.id) && whole(prize.count) && prize.count >= 1 ? { kind: "item", id: prize.id, count: Math.floor(prize.count) } : null;
    else if (prize.kind === "unit" || prize.kind === "chaos" || prize.kind === "artifact" || prize.kind === "hero") parsed = { kind: prize.kind, id: prize.id };
    if (!parsed) continue;
    out.push({ at: Math.floor(r.at), rarity: r.rarity as OcRarity, prize: parsed, duplicate: r.duplicate === true, dust: whole(r.dust) ? Math.floor(r.dust) : 0 });
  }
  return out.slice(-OC_SUMMON_LOG_KEPT);
}

/** Stardust every pull leaves (by rarity), and what a duplicate permanent prize turns into. */
export const OC_STARDUST_PER_PULL: Readonly<Record<OcRarity, number>> = { R: 1, SR: 3, SSR: 10, UR: 25 };
export const OC_STARDUST_DUPLICATE: Readonly<Record<"SSR" | "UR", number>> = { SSR: 60, UR: 200 };
/** Stardust Exchange prices. */
export const OC_EXCHANGE_PRICE: Readonly<Record<OcRarity, number>> = { R: 8, SR: 25, SSR: 240, UR: 720 };

// ---------------------------------------------------------------------------
// Daily attendance: a seven-day calendar, one claim per UTC day; missing a day doesn't reset it.

export type OcAttendanceReward = { crystals?: number; items?: { id: OcItemId; count: number }[] };

export const OC_ATTENDANCE: readonly OcAttendanceReward[] = [
  { crystals: 60 },
  { items: [{ id: "war-chest", count: 2 }, { id: "mana-draught", count: 1 }] },
  { crystals: 80, items: [{ id: "ore-cart", count: 1 }] },
  { items: [{ id: "summon-ticket", count: 1 }, { id: "surge-flask", count: 1 }] },
  { crystals: 100, items: [{ id: "gem-pouch", count: 1 }] },
  { items: [{ id: "royal-treasury", count: 1 }, { id: "growth-potion", count: 1 }, { id: "seal-pouch", count: 1 }] },
  { crystals: 300, items: [{ id: "phoenix-feather", count: 1 }] }
];

export type OcAttendance = { lastDay: string; claimed: number };

/** Can today's square be claimed, and which (0..6)? */
export function attendanceToday(a: OcAttendance, day: string): { open: boolean; index: number } {
  const index = a.claimed % OC_ATTENDANCE.length;
  return { open: a.lastDay !== day, index };
}

// ---------------------------------------------------------------------------
// Battle drops: a won battle may leave an item behind.

/** The item a won battle leaves (null: none). `first`: a first victory (always drops); `boss`: a world boss level. */
export function battleDrop(r1: number, r2: number, opts: { first: boolean; boss: boolean }): { id: OcItemId; count: number } | null {
  const sr: OcItemId[] = ["royal-treasury", "surge-flask", "warding-scroll", "hunters-scroll", "gem-pouch", "growth-potion"];
  const r: OcItemId[] = ["war-chest", "mana-draught", "ore-cart", "seal-pouch"];
  if (opts.boss && opts.first) return { id: sr[Math.floor(r2 * sr.length)]!, count: 1 };
  const chance = opts.first ? 1 : 0.35;
  if (r1 >= chance) return null;
  const rare = r1 < chance * 0.2;
  const list = rare ? sr : r;
  return { id: list[Math.floor(r2 * list.length)]!, count: 1 };
}

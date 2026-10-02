/**
 * Order & Chaos treasury operations on the save, each against a CONTROL.
 */
import { describe, expect, it } from "vitest";
import { emptyOcProgress } from "./order-chaos-progress";
import { OC_STARDUST_DUPLICATE, OC_STARDUST_PER_PULL, OC_SUMMON_LOG_KEPT, itemPerMatch, parseSummonLog } from "@/engine/garrison/order-chaos/treasury";
import { OC_SEEDS, sow } from "@/engine/garrison/order-chaos/garden";
import { claimAttendance, grantPrize, packedSatchel, pullPortal, pullPrice, ripenPlot, spendItem, togglePacked, useItem } from "./order-chaos-treasury";

describe("Order & Chaos treasury", () => {
  it("a summon needs the Crystals (or a ticket, spent first) and pays exactly what it costs", () => {
    const broke = emptyOcProgress();
    expect(pullPortal(broke, 1, () => 0.5)).toBeNull();
    const rich = { ...emptyOcProgress(), crystals: 1000 };
    const one = pullPortal(rich, 1, () => 0.5)!;
    expect(one.p.crystals).toBe(900);
    expect(one.results).toHaveLength(1);
    const ticket = { ...emptyOcProgress(), crystals: 0, items: { "summon-ticket": 1 } };
    const free = pullPortal(ticket, 1, () => 0.5)!;
    expect(free.p.crystals).toBe(0);
    expect(free.p.items["summon-ticket"] ?? 0).toBe(0);
    const ten = pullPortal(rich, 10, () => 0.99)!;
    expect(ten.p.crystals).toBe(100);
    expect(ten.p.pity.pulls).toBe(10);
  });

  it("a ticket takes one pull's price off a ten-summon too (it never costs the full price and the ticket)", () => {
    const none = { ...emptyOcProgress(), crystals: 1000 };
    const one = { ...none, items: { "summon-ticket": 1 } };
    expect(pullPrice(none, 10)).toEqual({ tickets: 0, crystals: 900 });
    expect(pullPrice(one, 10)).toEqual({ tickets: 1, crystals: 800 });
    // (0.5: no prize is a ticket, so the count left shows the one spent.)
    const pulled = pullPortal(one, 10, () => 0.5)!;
    expect(pulled.p.crystals).toBe(200);
    expect(pulled.p.items["summon-ticket"] ?? 0).toBe(0);
  });

  it("a Growth Potion is never spent on a plant the clock has already ripened", () => {
    const seed = OC_SEEDS.clover;
    const growing = { ...emptyOcProgress(), items: { "growth-potion": 1 }, garden: [sow("clover", 0)] };
    // CONTROL: half grown, the potion ripens it and is spent.
    const ripened = ripenPlot(growing, 0, seed.growMs / 2);
    expect(ripened.items["growth-potion"]).toBeUndefined();
    expect(ripened.garden[0]!.grown).toBe(seed.growMs);
    // Already ripe by the clock (stored growth not yet advanced): nothing is spent.
    expect(ripenPlot(growing, 0, seed.growMs * 2)).toBe(growing);
  });

  it("a permanent prize unlocks once; a duplicate turns into Stardust", () => {
    const first = grantPrize(emptyOcProgress(), { kind: "unit", id: "oc-guardian-angel" }, "SSR");
    expect(first.duplicate).toBe(false);
    expect(first.p.gacha.units).toContain("oc-guardian-angel");
    const again = grantPrize(first.p, { kind: "unit", id: "oc-guardian-angel" }, "SSR");
    expect(again.duplicate).toBe(true);
    expect(again.p.stardust).toBeGreaterThan(first.p.stardust);
    expect(again.p.gacha.units.filter((k) => k === "oc-guardian-angel")).toHaveLength(1);
  });

  it("attendance pays once a day, then waits for the next", () => {
    const day1 = claimAttendance(emptyOcProgress(), "2026-10-02");
    expect(day1.crystals).toBe(60);
    expect(claimAttendance(day1, "2026-10-02")).toBe(day1);
    const day2 = claimAttendance(day1, "2026-10-03");
    expect(day2.attendance.claimed).toBe(2);
    expect(day2.items["war-chest"]).toBe(2);
  });

  it("resource items pay out when used; a packed boost goes into the battle with its uses (owned, at most perMatch) and each use spends one copy", () => {
    const bag = { ...emptyOcProgress(), items: { "ore-cart": 1, "war-chest": 1 } };
    const used = useItem(bag, "ore-cart");
    expect(used.ore).toBe(5);
    expect(used.items["ore-cart"]).toBeUndefined();
    expect(useItem(used, "ore-cart")).toBe(used);
    expect(togglePacked(emptyOcProgress(), "war-chest").packed).toEqual([]);
    const packed = togglePacked(bag, "war-chest");
    expect(packed.packed).toEqual(["war-chest"]);
    // One owned: one use, whatever the perMatch.
    expect(packedSatchel(packed)).toEqual([{ id: "war-chest", uses: 1 }]);
    // Many owned: no more than the perMatch.
    const rich = { ...packed, items: { ...packed.items, "war-chest": 50 } };
    expect(packedSatchel(rich)).toEqual([{ id: "war-chest", uses: itemPerMatch("war-chest") }]);
    // A use spends one copy; the last one spent unpacks it.
    expect(spendItem(rich, "war-chest").items["war-chest"]).toBe(49);
    const spent = spendItem(packed, "war-chest");
    expect(spent.items["war-chest"]).toBeUndefined();
    expect(spent.packed).toEqual([]);
    expect(packedSatchel(spent)).toEqual([]);
    expect(spendItem(spent, "war-chest")).toBe(spent);
  });

  it("each summon reports the Stardust it really left (a duplicate's included) and the Portal's history keeps the latest", () => {
    // Rolls alternate rarity 0.03 (an SSR: UR 0.006 < 0.03 < UR+SSR 0.036) and pick 0.4 (the Guardian Angel in the SSR pool):
    // the first pull unlocks her, the other nine are duplicates.
    const rich = { ...emptyOcProgress(), crystals: 20000 };
    let roll = 0;
    const ten = pullPortal(rich, 10, () => (roll++ % 2 === 0 ? 0.03 : 0.4), 1234)!;
    expect(ten.results.every((r) => r.rarity === "SSR" && r.prize.kind === "unit" && r.prize.id === "oc-guardian-angel")).toBe(true);
    // The pulls' dust adds up to exactly what the save gained.
    expect(ten.results.reduce((n, r) => n + r.dust, 0)).toBe(ten.p.stardust - rich.stardust);
    // CONTROL inside the same summon: a non-duplicate leaves the per-pull dust only, a duplicate more.
    const [fresh, dupe] = ten.results;
    expect(fresh!.duplicate).toBe(false);
    expect(dupe!.duplicate).toBe(true);
    expect(fresh!.dust).toBe(OC_STARDUST_PER_PULL.SSR);
    expect(dupe!.dust).toBe(OC_STARDUST_PER_PULL.SSR + OC_STARDUST_DUPLICATE.SSR);
    expect(ten.p.summonLog).toHaveLength(10);
    expect(ten.p.summonLog.every((e) => e.at === 1234)).toBe(true);
    expect(ten.p.summonLog.map((e) => e.dust)).toEqual(ten.results.map((r) => r.dust));
    // It keeps only the latest OC_SUMMON_LOG_KEPT.
    let p = ten.p;
    for (let i = 0; i < 8; i += 1) p = pullPortal(p, 10, () => 0.5, 2000 + i)!.p;
    expect(p.summonLog).toHaveLength(OC_SUMMON_LOG_KEPT);
    expect(p.summonLog[p.summonLog.length - 1]!.at).toBe(2007);
    // A stored history survives the round trip; junk is dropped.
    expect(parseSummonLog([...p.summonLog, { at: -1, rarity: "R" }, null, { at: 5, rarity: "XX", prize: { kind: "unit", id: "x" } }])).toEqual(p.summonLog);
  });
});

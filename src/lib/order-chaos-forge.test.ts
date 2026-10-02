/**
 * The Forge's payment: a finished blade is paid for (it can't be left and
 * forged again for free until a Masterwork comes up); an unfinished one costs
 * nothing. Each against a CONTROL.
 */
import { describe, expect, it } from "vitest";
import { OC_RANK_COST, OC_WORLDS } from "@/engine/garrison/order-chaos/campaign";
import { forgeRefund, newForgeGame, type ForgeGame } from "@/engine/garrison/order-chaos/forge-game";
import { emptyOcProgress } from "./order-chaos-progress";
import { hammerBlade, temperBlade } from "./order-chaos-forge";

const cleared = OC_WORLDS.find((w) => w.id === 1)!.levels.map((level) => level.id);
const price = OC_RANK_COST[2]!;
const rich = { ...emptyOcProgress(), ore: 100, gems: 100 };
/** A finished blade: every strike missed, plunged cold (Rough). */
const rough: ForgeGame = { ...newForgeGame(2, 1), phase: "done", strikes: ["miss", "miss"], quench: "miss", temp: 0 };
/** A finished blade: every strike and the quench perfect (Masterwork). */
const masterwork: ForgeGame = { ...newForgeGame(2, 1), phase: "done", strikes: ["perfect", "perfect", "perfect", "perfect"], quench: "perfect" };

describe("the Forge's payment", () => {
  it("a finished blade is tempered and paid for; an unfinished one (CONTROL) costs nothing", () => {
    const done = temperBlade(rich, rough, "catherine", 2, cleared)!;
    expect(done.claim.quality).toBe("rough");
    expect(done.p.heroRanks.catherine).toBe(2);
    expect(done.p.ore).toBe(100 - price.ore);
    expect(done.p.gems).toBe(100 - price.gems);
    // Paid once: the same blade can't be tempered (or re-forged at that rank) again.
    expect(temperBlade(done.p, rough, "catherine", 2, cleared)).toBeNull();
    // CONTROL: the blade still on the anvil — leaving spends nothing.
    for (const phase of ["heat", "hammer", "quench"] as const) {
      expect(temperBlade(rich, { ...rough, phase }, "catherine", 2, cleared)).toBeNull();
    }
    // A Masterwork hands half the Ore back.
    const best = temperBlade(rich, masterwork, "catherine", 2, cleared)!;
    expect(best.claim.quality).toBe("masterwork");
    expect(best.p.ore).toBe(100 - price.ore + forgeRefund("masterwork", price.ore));
  });

  it("a Masterwork Hammer lifts a paid blade to a Masterwork once, and only with a hammer", () => {
    const withHammer = { ...rich, items: { "masterwork-hammer": 2 } };
    const done = temperBlade(withHammer, rough, "catherine", 2, cleared)!;
    const lifted = hammerBlade(done.p, done.claim)!;
    expect(lifted.claim.quality).toBe("masterwork");
    expect(lifted.p.items["masterwork-hammer"]).toBe(1);
    // The same as forging a Masterwork outright.
    expect(lifted.p.ore).toBe(temperBlade(rich, masterwork, "catherine", 2, cleared)!.p.ore);
    // Once lifted it is a Masterwork: a second hammer isn't spent on it.
    expect(hammerBlade(lifted.p, lifted.claim)).toBeNull();
    // CONTROL: no hammer, no lift.
    const plain = temperBlade(rich, rough, "catherine", 2, cleared)!;
    expect(hammerBlade(plain.p, plain.claim)).toBeNull();
  });
});

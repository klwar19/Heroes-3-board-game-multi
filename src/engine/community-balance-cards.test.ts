/**
 * Heroes 3 Board Game Community Balance Change — the CARD-LIBRARY swap seam.
 *
 * LEADING WITH THE LIMIT: the shipped reprint table is EMPTY in this step, so
 * every claim about "the reprint replaces the definition" is driven with a
 * SYNTHETIC reprint passed into the seam's `reprints` parameter (which exists
 * for exactly this reason). What is pinned with the REAL table is the gating:
 * rule off — and rule on with nothing reprinted — returns the caller's own
 * library object, identity included, so a default table is byte-identical.
 *
 * The precedence claim (community WINS over polish for a card both packs cover)
 * is composed here the way `applyAction` composes it: polish first, community on
 * top, via `balanceCardLibrary`.
 */
import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import { polishBalanceCardLibrary } from "./polish-balance-spells";
import {
  balanceCardForDisplay,
  balanceCardLibrary,
  communityBalanceCardLibrary,
  COMMUNITY_REPRINTED_CARDS
} from "./community-balance-cards";
import type { CardDefinition, CardLibrary, GameState } from "./state";

/** A card the POLISH pack really reprints, so the two packs collide on it. */
const BOTH_ID = "spell.prayer";

function stateWith(rules: { polish?: boolean; community?: boolean }): GameState {
  return {
    adventure: {
      houseRules: {
        "polish-card-balance": Boolean(rules.polish),
        "community-card-balance": Boolean(rules.community)
      }
    }
  } as unknown as GameState;
}

/** A synthetic community reprint of `BOTH_ID`, recognisable by its name. */
function syntheticReprint(): CardLibrary {
  const printed = cardLibrary[BOTH_ID]!;
  const reprint: CardDefinition = { ...printed, name: "COMMUNITY PRAYER" };
  return { [BOTH_ID]: reprint };
}

describe("communityBalanceCardLibrary — the gate", () => {
  it("returns the caller's own library object with the rule OFF (byte-identical table)", () => {
    const base: CardLibrary = { ...cardLibrary };
    expect(communityBalanceCardLibrary(stateWith({}), base, syntheticReprint())).toBe(base);
    expect(balanceCardLibrary(stateWith({}), base, syntheticReprint())).toBe(base);
  });

  it("with the rule ON and the SHIPPED table, swaps exactly the reprinted cards", () => {
    const base: CardLibrary = { ...cardLibrary };
    // The Abilities family has landed; nothing outside it is touched.
    expect(Object.keys(COMMUNITY_REPRINTED_CARDS).length).toBeGreaterThan(0);
    const swapped = communityBalanceCardLibrary(stateWith({ community: true }), base);
    for (const cardId of Object.keys(base)) {
      const expected = COMMUNITY_REPRINTED_CARDS[cardId] ?? base[cardId];
      expect(swapped[cardId], `${cardId} swapped unexpectedly`).toBe(expected);
    }
    // CONTROL: rule off, same shipped table — the caller's own object, identity
    // included, so a default table is byte-identical.
    expect(communityBalanceCardLibrary(stateWith({}), base)).toBe(base);
    expect(balanceCardLibrary(stateWith({}), base)).toBe(base);
  });

  it("swaps a reprint in ONLY while the rule is on", () => {
    const base: CardLibrary = { ...cardLibrary };
    const on = communityBalanceCardLibrary(stateWith({ community: true }), base, syntheticReprint());
    expect(on[BOTH_ID]!.name).toBe("COMMUNITY PRAYER");
    // CONTROL: rule off, same setup — the printed card.
    const off = communityBalanceCardLibrary(stateWith({}), base, syntheticReprint());
    expect(off[BOTH_ID]!.name).toBe(cardLibrary[BOTH_ID]!.name);
    // The base library is never mutated.
    expect(base[BOTH_ID]!.name).toBe(cardLibrary[BOTH_ID]!.name);
  });

  it("never INVENTS a card the caller's library does not carry", () => {
    // The combat sandbox and many tests build trimmed libraries; a reprint must
    // not deal a card the table never had.
    const trimmed: CardLibrary = {};
    const out = communityBalanceCardLibrary(stateWith({ community: true }), trimmed, syntheticReprint());
    expect(out[BOTH_ID]).toBeUndefined();
  });
});

describe("balanceCardLibrary — community WINS over polish", () => {
  it("a card both packs reprint plays the COMMUNITY text with both rules on", () => {
    const base: CardLibrary = { ...cardLibrary };
    const polishOnly = polishBalanceCardLibrary(stateWith({ polish: true }), base);
    const polishName = polishOnly[BOTH_ID]!.name;
    // Non-vacuity: the polish swap really produced its own definition object.
    expect(polishOnly[BOTH_ID]).not.toBe(cardLibrary[BOTH_ID]);

    const both = balanceCardLibrary(stateWith({ polish: true, community: true }), base, syntheticReprint());
    expect(both[BOTH_ID]!.name).toBe("COMMUNITY PRAYER");
    expect(both[BOTH_ID]!.name).not.toBe(polishName);

    // CONTROL: community OFF, polish on → the polish reprint still wins over the
    // printed card (the pre-existing behaviour is untouched).
    const polishStill = balanceCardLibrary(stateWith({ polish: true }), base, syntheticReprint());
    expect(polishStill[BOTH_ID]).toEqual(polishOnly[BOTH_ID]);
  });
});

describe("balanceCardForDisplay — the same precedence for UI surfaces", () => {
  it("community wins, then polish, then the printed card", () => {
    const reprints = syntheticReprint();
    expect(balanceCardForDisplay(true, true, BOTH_ID, reprints)!.name).toBe("COMMUNITY PRAYER");
    expect(balanceCardForDisplay(false, true, BOTH_ID, reprints)!.name).toBe("COMMUNITY PRAYER");
    // Polish only → the polish reprint (not the community one, not the printed card).
    const polishDisplay = balanceCardForDisplay(true, false, BOTH_ID, reprints)!;
    expect(polishDisplay.name).not.toBe("COMMUNITY PRAYER");
    expect(polishDisplay).toBe(polishBalanceCardLibrary(stateWith({ polish: true }), { ...cardLibrary })[BOTH_ID]);
    // CONTROL: both off → the printed card.
    expect(balanceCardForDisplay(false, false, BOTH_ID, reprints)).toBe(cardLibrary[BOTH_ID]);
  });
});

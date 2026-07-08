import { describe, expect, it } from "vitest";
import { applyAction, getLegalActions } from "./index";
import { EVENT_ARTIFACT_PRICES, EVENT_RELIC_MIN_ROUND, getEventsState, NEUTRAL_DECK_IDS } from "./adventure";
import { cardLibrary } from "@/data/cards/library";
import { coreUnitDefinitions } from "@/data/factions/units";
import { neutralUnitIdsByTier } from "@/data/factions/core";
import type { GameAction, GameState } from "./state";
import { chooseVisitOption, eventsGame, stackEventDeck, startResourceRound, visitOptionLabels } from "./event-deck.test";

/**
 * Event cards with shared displays, pass-around pools, secret bids and player
 * deals (Fortress expansion). Each test asserts the observable outcome —
 * cards changing zones, gold moving, decks restored — so it fails when the
 * wiring is deleted or wrong (CLAUDE.md #1a).
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function setup(seed: string, cardId: string, mutate?: (state: GameState) => void): GameState {
  const state = eventsGame(seed);
  stackEventDeck(state, cardId);
  mutate?.(state);
  startResourceRound(state);
  return state;
}

function richPlayers(state: GameState): void {
  for (const id of ["p1", "p2"] as const) {
    state.players[id].resources = { gold: 30, buildingMaterials: 10, valuables: 10 };
    state.players[id].production = { gold: 0, buildingMaterials: 0, valuables: 0 };
  }
}

/** Total card count (draw + discard) across the given shared decks. */
function familySize(state: GameState, deckIds: string[]): number {
  return deckIds.reduce((sum, deckId) => {
    const deck = state.decks[deckId];
    return sum + (deck?.drawPile.length ?? 0) + (deck?.discardPile.length ?? 0);
  }, 0);
}

const SPELL_DECKS = ["spells", "spells-expert"];
const ARTIFACT_DECKS = ["artifacts", "artifacts-minor", "artifacts-major", "artifacts-relic"];

// ===========================================================================
// Library of Enlightenment / Mage Laboratory / Shrine of the Magic Thought
// ===========================================================================

describe("Event — Spell markets", () => {
  it("Library of Enlightenment: 2 spells per player on display; buying costs 6 gold or 2 valuables; leftovers shuffle back", () => {
    let spellsTotal = 0;
    const state = setup("library", "event.library_of_enlightenment", (s) => {
      richPlayers(s);
      spellsTotal = familySize(s, SPELL_DECKS);
    });
    const events = getEventsState(state)!;
    expect(events.pool).toHaveLength(4); // 2 per player

    // p1 buys with gold.
    const first = events.pool[0].cardId;
    let after = chooseVisitOption(state, "p1", new RegExp(`Buy ${cardLibrary[first]?.name} \\(6 gold\\)`));
    expect(after.players.p1.hand).toContain(first);
    expect(after.players.p1.resources.gold).toBe(24);
    expect(getEventsState(after)!.pool).toHaveLength(3);

    // p2 buys with valuables.
    const second = getEventsState(after)!.pool[0].cardId;
    after = chooseVisitOption(after, "p2", new RegExp(`Buy ${cardLibrary[second]?.name} \\(2 valuables\\)`));
    expect(after.players.p2.hand).toContain(second);
    expect(after.players.p2.resources.valuables).toBe(8);

    // Cleanup: the 2 unsold spells shuffle back into the Spell deck family —
    // only the 2 bought cards left it.
    expect(getEventsState(after)!.pool).toHaveLength(0);
    expect(familySize(after, SPELL_DECKS)).toBe(spellsTotal - 2);
    const discarded = SPELL_DECKS.reduce((sum, deckId) => sum + (after.decks[deckId]?.discardPile.length ?? 0), 0);
    expect(discarded).toBe(0); // shuffled back into the DRAW piles, not discarded
  });

  it("Mage Laboratory: the bought spell shuffles into the buyer's deck together with their discard pile", () => {
    const state = setup("mage-lab", "event.mage_laboratory", (s) => {
      richPlayers(s);
      s.players.p1.discard = ["stat.attack"];
    });
    const events = getEventsState(state)!;
    const bought = events.pool[0].cardId;
    const deckBefore = state.players.p1.deck.length;

    const after = chooseVisitOption(state, "p1", new RegExp(`Buy ${cardLibrary[bought]?.name} \\(4 gold\\)`));
    expect(after.players.p1.resources.gold).toBe(26);
    expect(after.players.p1.hand).not.toContain(bought);
    expect(after.players.p1.deck).toContain(bought);
    // Deck grew by the bought card AND the reshuffled discard pile.
    expect(after.players.p1.deck.length).toBe(deckBefore + 2);
    expect(after.players.p1.discard).toEqual([]);
  });

  it("Shrine of the Magic Thought: a Resource-die alternative exists and leftovers go to the Spell DISCARD pile", () => {
    const state = setup("shrine", "event.shrine_of_the_magic_thought", richPlayers);
    const before = { ...state.players.p1.resources };

    let after = chooseVisitOption(state, "p1", /Roll 1 Resource die instead/);
    const roll = after.eventLog
      .filter((event) => event.type === "ADVENTURE_DICE_ROLLED" && event.dice === "resource")
      .pop() as Extract<(typeof after.eventLog)[number], { type: "ADVENTURE_DICE_ROLLED" }>;
    const face = roll.resourceRolls![0];
    expect(after.players.p1.resources[face.resource]).toBe(before[face.resource] + face.amount);

    after = chooseVisitOption(after, "p2", /Skip/);
    // All 4 displayed spells land in the Spell discard piles.
    const discarded = SPELL_DECKS.reduce((sum, deckId) => sum + (after.decks[deckId]?.discardPile.length ?? 0), 0);
    expect(discarded).toBe(4);
    expect(getEventsState(after)!.pool).toHaveLength(0);
  });
});

// ===========================================================================
// Messenger with Supplies
// ===========================================================================

describe("Event — Messenger with Supplies", () => {
  it("buying keeps one drawn Artifact for its tier price and returns the other to the deck", () => {
    let artifactsTotal = 0;
    const state = setup("messenger-buy", "event.messenger_with_supplies", (s) => {
      richPlayers(s);
      artifactsTotal = familySize(s, ARTIFACT_DECKS);
    });

    // p1's menu shows the two drawn artifacts; buy the first offered.
    const buyLabel = visitOptionLabels(state, "p1").find((label) => /^Buy /.test(label))!;
    expect(buyLabel).toBeTruthy();
    const after = chooseVisitOption(state, "p1", new RegExp(buyLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const boughtName = buyLabel.match(/^Buy (.*) \((\d+) gold\)$/)!;
    const price = Number(boughtName[2]);
    expect(after.players.p1.resources.gold).toBe(30 - price);
    const bought = after.players.p1.hand.find((cardId) => cardLibrary[cardId]?.name === boughtName[1]);
    expect(bought, `expected ${boughtName[1]} in hand`).toBeTruthy();
    // The tier price table is the printed one.
    expect(price).toBe(EVENT_ARTIFACT_PRICES[cardLibrary[bought!]?.artifactTier ?? "minor"]);
    // p2's own 2-card draw is still on the table; complete their turn so every
    // revealed card is accounted for, then exactly ONE card (p1's buy) has
    // left the Artifact family.
    const done = chooseVisitOption(after, "p2", /Put them on the Artifact discard pile/);
    expect(familySize(done, ARTIFACT_DECKS)).toBe(artifactsTotal - 1);
  });

  it("discarding both rolls 2 Resource dice and pays out exactly one chosen face", () => {
    const state = setup("messenger-dice", "event.messenger_with_supplies", richPlayers);
    let after = chooseVisitOption(state, "p1", /Put them on the Artifact discard pile/);
    // Both drawn cards sit on the Artifact discard piles now.
    const discarded = ARTIFACT_DECKS.reduce((sum, deckId) => sum + (after.decks[deckId]?.discardPile.length ?? 0), 0);
    expect(discarded).toBe(2);

    const roll = after.eventLog
      .filter((event) => event.type === "ADVENTURE_DICE_ROLLED" && event.dice === "resource")
      .pop() as Extract<(typeof after.eventLog)[number], { type: "ADVENTURE_DICE_ROLLED" }>;
    expect(roll.resourceRolls).toHaveLength(2);
    const face = roll.resourceRolls![0];
    const before = { ...after.players.p1.resources };
    after = chooseVisitOption(
      after,
      "p1",
      new RegExp(`^${face.amount} ${face.resource === "buildingMaterials" ? "materials" : face.resource}$`)
    );
    expect(after.players.p1.resources[face.resource]).toBe(before[face.resource] + face.amount);
  });
});

// ===========================================================================
// Magical Forest
// ===========================================================================

describe("Event — Magical Forest", () => {
  it("everyone adds one face-down card; each player then takes a random card or 4 gold; leftovers shuffle back", () => {
    const state = setup("forest", "event.magical_forest", (s) => {
      richPlayers(s);
      s.players.p1.hand = ["spell.magic_arrow", "stat.attack"];
    });

    // p1 contributes from hand (a Statistic is NOT offered — pool kinds only).
    expect(visitOptionLabels(state, "p1").some((label) => /Put Attack/.test(label))).toBe(false);
    let after = chooseVisitOption(state, "p1", /Put Magic Arrow face-down into the pool/);
    expect(after.players.p1.hand).toEqual(["stat.attack"]);
    expect(getEventsState(after)!.pool).toHaveLength(1);
    expect(getEventsState(after)!.pool[0].faceUp).toBe(false);

    // p2 draws-and-views from the Ability deck (the private view prompt).
    after = chooseVisitOption(after, "p2", /Draw and view the top Ability card/);
    expect(getEventsState(after)!.pool).toHaveLength(2);
    after = chooseVisitOption(after, "p2", /^OK$/);

    // Takes: p1 grabs a random pool card, p2 takes the gold.
    const handBefore = after.players.p1.hand.length;
    after = chooseVisitOption(after, "p1", /Take a random card from the pool/);
    expect(after.players.p1.hand.length).toBe(handBefore + 1);
    expect(getEventsState(after)!.pool).toHaveLength(1);

    const goldBefore = after.players.p2.resources.gold;
    after = chooseVisitOption(after, "p2", /Gain 4 gold/);
    expect(after.players.p2.resources.gold).toBe(goldBefore + 4);

    // Cleanup: the leftover face-down card returns to a shared deck.
    expect(getEventsState(after)!.pool).toHaveLength(0);
  });
});

// ===========================================================================
// Mercenary Camp
// ===========================================================================

describe("Event — Mercenary Camp", () => {
  it("players spread up to 2 Neutral cards from one deck, then each may recruit one at its printed cost", () => {
    const state = setup("mercenary", "event.mercenary_camp", richPlayers);

    let after = chooseVisitOption(state, "p1", /Draw 2 from the bronze Neutral Unit deck/);
    expect(getEventsState(after)!.pool).toHaveLength(2);
    after = chooseVisitOption(after, "p2", /Draw nothing/);

    // p1 recruits the first spread unit, paying its printed neutral cost.
    const unitDefId = getEventsState(after)!.pool[0].cardId;
    const cost = coreUnitDefinitions[unitDefId]!.neutral!.cost ?? {};
    const goldBefore = after.players.p1.resources.gold;
    after = chooseVisitOption(after, "p1", new RegExp(`Recruit ${coreUnitDefinitions[unitDefId]!.name}`));
    expect(after.players.p1.army.some((unit) => unit.unitDefId === unitDefId && unit.side === "neutral")).toBe(true);
    expect(after.players.p1.resources.gold).toBe(goldBefore - (cost.gold ?? 0));

    // p2 skips; the leftover card recycles to its tier's discard pile.
    const leftover = getEventsState(after)!.pool[0]?.cardId;
    after = chooseVisitOption(after, "p2", /Skip/);
    expect(getEventsState(after)!.pool).toHaveLength(0);
    if (leftover) {
      const tier = coreUnitDefinitions[leftover]!.tier as "bronze" | "silver" | "gold" | "azure";
      expect(after.decks[NEUTRAL_DECK_IDS[tier]].discardPile).toContain(leftover);
    }
  });
});

// ===========================================================================
// Den of Thieves
// ===========================================================================

describe("Event — Den of Thieves", () => {
  it("the DRAWER alone raids one deck: buy one of the top 2, then place the rest on top or bottom", () => {
    const [cheap, other] = neutralUnitIdsByTier.bronze;
    const state = setup("den", "event.den_of_thieves", (s) => {
      richPlayers(s);
      // Deck top = array end: the drawer draws `cheap` then `other`.
      s.decks[NEUTRAL_DECK_IDS.bronze].drawPile = [other, cheap];
      s.decks[NEUTRAL_DECK_IDS.bronze].discardPile = [];
    });

    // Only the drawer (p1) acts — p2 has no pending Event menu afterwards.
    let after = chooseVisitOption(state, "p1", /Take the top 2 cards of the bronze Neutral Unit deck/);
    const goldBefore = after.players.p1.resources.gold;
    after = chooseVisitOption(after, "p1", new RegExp(`Buy ${coreUnitDefinitions[cheap]!.name}`));
    expect(after.players.p1.army.some((unit) => unit.unitDefId === cheap && unit.side === "neutral")).toBe(true);
    expect(after.players.p1.resources.gold).toBe(goldBefore - (coreUnitDefinitions[cheap]!.neutral!.cost?.gold ?? 0));

    after = chooseVisitOption(after, "p1", /On the bottom/);
    // The remaining card sits at the BOTTOM (front of the draw pile array).
    expect(after.decks[NEUTRAL_DECK_IDS.bronze].drawPile[0]).toBe(other);
    // Event over: nobody else resolves anything.
    expect(after.adventure?.pendingVisit).toBeNull();
    expect(visitOptionLabels(after, "p2")).toEqual([]);
  });

  it("placing the remaining cards on top puts them back as the next draws", () => {
    const [cheap, other] = neutralUnitIdsByTier.bronze;
    const state = setup("den-top", "event.den_of_thieves", (s) => {
      richPlayers(s);
      s.decks[NEUTRAL_DECK_IDS.bronze].drawPile = [other, cheap];
      s.decks[NEUTRAL_DECK_IDS.bronze].discardPile = [];
    });
    let after = chooseVisitOption(state, "p1", /Take the top 2 cards of the bronze Neutral Unit deck/);
    after = chooseVisitOption(after, "p1", /Buy nothing/);
    after = chooseVisitOption(after, "p1", /On top/);
    const pile = after.decks[NEUTRAL_DECK_IDS.bronze].drawPile;
    // Both drawn cards returned to the top (array end).
    expect(pile.slice(-2)).toEqual([cheap, other]);
  });
});

// ===========================================================================
// Prison
// ===========================================================================

describe("Event — Prison", () => {
  it("draw 2 (no Azure), buy or discard-for-gold, pass the leftover on; the final leftover is discarded", () => {
    const [bronzeA, bronzeB, bronzeC] = neutralUnitIdsByTier.bronze;
    const state = setup("prison", "event.prison", (s) => {
      richPlayers(s);
      s.decks[NEUTRAL_DECK_IDS.bronze].drawPile = [bronzeC, bronzeB, bronzeA];
      s.decks[NEUTRAL_DECK_IDS.bronze].discardPile = [];
    });

    // Azure is never offered.
    expect(visitOptionLabels(state, "p1").some((label) => /azure/.test(label))).toBe(false);

    // p1 draws twice from the bronze deck (draws bronzeA then bronzeB)…
    let after = chooseVisitOption(state, "p1", /Draw from the bronze Neutral Unit deck/);
    after = chooseVisitOption(after, "p1", /Draw from the bronze Neutral Unit deck/);
    // …buys one; the other stays in the pool for p2.
    const goldBefore = after.players.p1.resources.gold;
    after = chooseVisitOption(after, "p1", new RegExp(`Buy ${coreUnitDefinitions[bronzeA]!.name}`));
    expect(after.players.p1.army.some((unit) => unit.unitDefId === bronzeA)).toBe(true);
    expect(after.players.p1.resources.gold).toBe(goldBefore - (coreUnitDefinitions[bronzeA]!.neutral!.cost?.gold ?? 0));
    expect(getEventsState(after)!.pool.map((entry) => entry.cardId)).toEqual([bronzeB]);

    // p2 draws 1 more (bronzeC), then discards one for 3 gold.
    after = chooseVisitOption(after, "p2", /Draw from the bronze Neutral Unit deck/);
    const p2Gold = after.players.p2.resources.gold;
    after = chooseVisitOption(after, "p2", new RegExp(`Discard ${coreUnitDefinitions[bronzeC]!.name} — gain 3 gold`));
    expect(after.players.p2.resources.gold).toBe(p2Gold + 3);
    expect(after.decks[NEUTRAL_DECK_IDS.bronze].discardPile).toContain(bronzeC);

    // The last leftover (bronzeB) recycles to the tier discard via the cleanup.
    expect(getEventsState(after)!.pool).toHaveLength(0);
    expect(after.decks[NEUTRAL_DECK_IDS.bronze].discardPile).toContain(bronzeB);
  });
});

// ===========================================================================
// Artifact Merchant
// ===========================================================================

describe("Event — Artifact Merchant", () => {
  it("the drawer may buy ANY NUMBER at tier prices, then the pool passes on; leftovers shuffle back", () => {
    let artifactsTotal = 0;
    const state = setup("merchant", "event.artifact_merchant", (s) => {
      richPlayers(s);
      artifactsTotal = familySize(s, ARTIFACT_DECKS);
    });
    const events = getEventsState(state)!;
    expect(events.pool).toHaveLength(5);

    // p1 buys two different pool cards back-to-back (the shop loops).
    const [first, second] = [...new Set(events.pool.map((entry) => entry.cardId))];
    const priceOf = (cardId: string) => EVENT_ARTIFACT_PRICES[cardLibrary[cardId]?.artifactTier ?? "minor"];
    let after = chooseVisitOption(state, "p1", new RegExp(`Buy ${cardLibrary[first]?.name} \\(`));
    after = chooseVisitOption(after, "p1", new RegExp(`Buy ${cardLibrary[second]?.name} \\(`));
    expect(after.players.p1.hand).toContain(first);
    expect(after.players.p1.hand).toContain(second);
    expect(after.players.p1.resources.gold).toBe(30 - priceOf(first) - priceOf(second));

    // After a pool buy the printed either/or hides the discard-top option.
    expect(visitOptionLabels(after, "p1").some((label) => /discard top/.test(label))).toBe(false);
    after = chooseVisitOption(after, "p1", /Pass the cards on/);

    // p2 passes too; the 3 leftovers shuffle back into the Artifact decks —
    // only the 2 bought cards left the family.
    after = chooseVisitOption(after, "p2", /Pass the cards on/);
    expect(getEventsState(after)!.pool).toHaveLength(0);
    expect(familySize(after, ARTIFACT_DECKS)).toBe(artifactsTotal - 2);
  });
});

// ===========================================================================
// Mischievous Leprechaun
// ===========================================================================

describe("Event — Mischievous Leprechaun", () => {
  it("a matching roll may claim one pool die and resolve it; no match gains nothing", () => {
    let sawMatch = false;
    let sawMiss = false;
    for (let salt = 0; salt < 20 && (!sawMatch || !sawMiss); salt += 1) {
      const state = setup(`leprechaun-${salt}`, "event.mischievous_leprechaun", richPlayers);
      expect(getEventsState(state)!.dicePool).toHaveLength(4);

      const labels = visitOptionLabels(state, "p1");
      const resourceTake = labels.find((label) => /^Take the Resource: /.test(label));
      if (resourceTake) {
        sawMatch = true;
        const [, amount, name] = resourceTake.match(/Resource: (\d+) (\w+)/)!;
        const resource = name === "materials" ? "buildingMaterials" : (name as "gold" | "valuables");
        const before = state.players.p1.resources[resource];
        const after = chooseVisitOption(state, "p1", new RegExp(resourceTake.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        expect(after.players.p1.resources[resource]).toBe(before + Number(amount));
        expect(getEventsState(after)!.dicePool).toHaveLength(3);
      } else if (labels.some((label) => /^Take the Treasure: /.test(label))) {
        sawMatch = true;
        const after = chooseVisitOption(state, "p1", /^Take the Treasure: /);
        expect(getEventsState(after)!.dicePool).toHaveLength(3);
      } else {
        sawMiss = true;
        // No menu for p1 at all — the miss was noted and the pool is intact.
        expect(
          state.eventLog.some((event) => event.type === "EVENT_NOTE" && /matches nothing/.test(event.message))
        ).toBe(true);
        expect(getEventsState(state)!.dicePool).toHaveLength(4);
      }
    }
    expect(sawMatch, "no seed matched the pool — widen the sweep").toBe(true);
    expect(sawMiss, "no seed missed the pool — widen the sweep").toBe(true);
  });
});

// ===========================================================================
// A Shady Auction
// ===========================================================================

describe("Event — A Shady Auction", () => {
  it("runs 3 lots: the single highest secret bid pays and claims; a tie and an all-zero round discard the lot", () => {
    const state = setup("auction", "event.a_shady_auction", richPlayers);
    const lot1 = getEventsState(state)!.auction!.lotCardId;

    // Lot 1: p1 bids 3, p2 bids 5 — p2 pays 5 and takes the card.
    let after = chooseVisitOption(state, "p1", /^Bid 3 gold$/);
    // Bids stay hidden: the log records only that a bid happened.
    expect(after.eventLog.filter((event) => event.type === "EVENT_AUCTION_BID_PLACED")).toHaveLength(1);
    after = chooseVisitOption(after, "p2", /^Bid 5 gold$/);
    expect(after.players.p2.hand).toContain(lot1);
    expect(after.players.p2.resources.gold).toBe(25);
    expect(after.players.p1.resources.gold).toBe(30); // the loser pays nothing

    // Lot 2: a 2-2 tie — nobody pays, the card goes to an Artifact discard pile.
    const lot2 = getEventsState(after)!.auction!.lotCardId;
    expect(lot2).not.toBe(lot1);
    after = chooseVisitOption(after, "p1", /^Bid 2 gold$/);
    after = chooseVisitOption(after, "p2", /^Bid 2 gold$/);
    expect(after.players.p1.hand).not.toContain(lot2);
    expect(after.players.p2.hand).not.toContain(lot2);
    expect(after.players.p1.resources.gold).toBe(30);
    expect(after.players.p2.resources.gold).toBe(25);
    expect(ARTIFACT_DECKS.some((deckId) => after.decks[deckId]?.discardPile.includes(lot2))).toBe(true);

    // Lot 3: no bets — discarded as well; the resolution log records all three.
    const lot3 = getEventsState(after)!.auction!.lotCardId;
    after = chooseVisitOption(after, "p1", /^No bid$/);
    after = chooseVisitOption(after, "p2", /^No bid$/);
    expect(ARTIFACT_DECKS.some((deckId) => after.decks[deckId]?.discardPile.includes(lot3))).toBe(true);
    const resolved = after.eventLog.filter((event) => event.type === "EVENT_AUCTION_RESOLVED");
    expect(resolved).toHaveLength(3);
    expect(resolved[0]).toMatchObject({ winnerId: "p2", amount: 5 });
    expect(resolved[1]).toMatchObject({ winnerId: null, amount: 2 });
    expect(resolved[2]).toMatchObject({ winnerId: null, amount: 0 });
  });
});

// ===========================================================================
// Marketplace
// ===========================================================================

describe("Event — Marketplace", () => {
  it("trading uses Trading Post rates ONLY (no card sale, no war machine); the die option pays its face", () => {
    const state = setup("marketplace", "event.marketplace", (s) => {
      richPlayers(s);
      // A sellable hand card + war machines in supply: a REAL Trading Post
      // would offer both; the Marketplace must offer neither.
      s.players.p1.hand = ["spell.magic_arrow"];
    });

    let after = chooseVisitOption(state, "p1", /Trade resources \(Trading Post rates\)/);
    const labels = getLegalActions(after, "p1").map((entry) => entry.label);
    expect(labels.some((label) => /^Sell /.test(label))).toBe(false);
    expect(labels.some((label) => /Ballista|First Aid|Ammo Cart|Catapult/i.test(label))).toBe(false);
    // A resource trade works and moves resources per the printed rate.
    const trade = getLegalActions(after, "p1").find((entry) => entry.action.type === "TRADE_RESOURCES");
    expect(trade).toBeTruthy();
    after = applyOk(after, trade!.action);
    expect(after.players.p1.resources).not.toEqual({ gold: 30, buildingMaterials: 10, valuables: 10 });
    after = chooseVisitOption(after, "p1", /Done trading/);

    // p2 rolls the die and gains exactly the rolled face.
    const before = { ...after.players.p2.resources };
    after = chooseVisitOption(after, "p2", /Roll 1 Resource die/);
    const roll = after.eventLog
      .filter((event) => event.type === "ADVENTURE_DICE_ROLLED" && event.dice === "resource")
      .pop() as Extract<(typeof after.eventLog)[number], { type: "ADVENTURE_DICE_ROLLED" }>;
    const face = roll.resourceRolls![0];
    expect(after.players.p2.resources[face.resource]).toBe(before[face.resource] + face.amount);
  });

  it("a proposed 1-for-1 deal is answered right away; the first accept swaps the resources; a decline changes nothing", () => {
    const fixture = (seed: string) =>
      setup(seed, "event.marketplace", (s) => {
        s.players.p1.resources = { gold: 5, buildingMaterials: 0, valuables: 0 };
        s.players.p1.production = { gold: 0, buildingMaterials: 0, valuables: 0 };
        s.players.p2.resources = { gold: 0, buildingMaterials: 0, valuables: 3 };
        s.players.p2.production = { gold: 0, buildingMaterials: 0, valuables: 0 };
      });

    let after = chooseVisitOption(fixture("marketplace-deal"), "p1", /Propose a 1-for-1 resource exchange/);
    after = chooseVisitOption(after, "p1", /Offer 1 gold for 1 valuables/);
    // p2 answers BEFORE their own Marketplace turn (the deal cuts the queue).
    after = chooseVisitOption(after, "p2", /Accept — give 1 valuables, receive 1 gold/);
    expect(after.players.p1.resources).toMatchObject({ gold: 4, valuables: 1 });
    expect(after.players.p2.resources).toMatchObject({ gold: 1, valuables: 2 });

    let declined = chooseVisitOption(fixture("marketplace-decline"), "p1", /Propose a 1-for-1 resource exchange/);
    declined = chooseVisitOption(declined, "p1", /Offer 1 gold for 1 valuables/);
    declined = chooseVisitOption(declined, "p2", /Decline/);
    expect(declined.players.p1.resources).toMatchObject({ gold: 5, valuables: 0 });
    expect(declined.players.p2.resources).toMatchObject({ gold: 0, valuables: 3 });
  });
});

// ===========================================================================
// Early-game Relic lock — artifact-giving Events offer minor/major only
// before round EVENT_RELIC_MIN_ROUND; Relics join the offers from then on.
// ===========================================================================

describe("Event — early-game Relic lock", () => {
  /** Leaves ONLY the Relic split deck stocked, so any gated draw must miss. */
  function onlyRelicsLeft(s: GameState): void {
    for (const deckId of ["artifacts-minor", "artifacts-major"]) {
      s.decks[deckId].drawPile = [];
      s.decks[deckId].discardPile = [];
    }
  }

  function setupAtRound(seed: string, cardId: string, round: number, mutate?: (state: GameState) => void): GameState {
    const state = eventsGame(seed);
    stackEventDeck(state, cardId);
    mutate?.(state);
    startResourceRound(state, round);
    return state;
  }

  it(`Messenger with Supplies draws NO Relics before round ${EVENT_RELIC_MIN_ROUND} (CONTROL: from round ${EVENT_RELIC_MIN_ROUND} it offers them at 7 gold)`, () => {
    // Round 3, only Relics left: the gate locks the whole family away.
    let relicsTotal = 0;
    const locked = setupAtRound("relic-messenger-locked", "event.messenger_with_supplies", 3, (s) => {
      richPlayers(s);
      onlyRelicsLeft(s);
      relicsTotal = familySize(s, ARTIFACT_DECKS);
    });
    // Nothing was drawn or displayed — every Relic still sits in the family.
    expect(familySize(locked, ARTIFACT_DECKS)).toBe(relicsTotal);
    expect(visitOptionLabels(locked, "p1").filter((label) => /^Buy /.test(label))).toEqual([]);

    // CONTROL — round 5, identical decks: the messenger now shows Relics.
    const open = setupAtRound("relic-messenger-open", "event.messenger_with_supplies", EVENT_RELIC_MIN_ROUND, (s) => {
      richPlayers(s);
      onlyRelicsLeft(s);
    });
    const buyLabel = visitOptionLabels(open, "p1").find((label) => /^Buy .* \(7 gold\)$/.test(label));
    expect(buyLabel, "expected a 7-gold Relic offer at round 5").toBeTruthy();
    const after = chooseVisitOption(open, "p1", new RegExp(buyLabel!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const bought = after.players.p1.hand.find((cardId) => cardLibrary[cardId]?.artifactTier === "relic");
    expect(bought, "the bought card is a Relic in hand").toBeTruthy();
    expect(after.players.p1.resources.gold).toBe(30 - 7);
  });

  it("Magical Forest: the Artifact draw-and-view offer respects the Relic lock (CONTROL: round 5 offers it)", () => {
    // Round 3, only Relics left: an Artifact draw could hit nothing, so the
    // option is not offered at all (no dead click).
    const locked = setupAtRound("relic-forest-locked", "event.magical_forest", 3, onlyRelicsLeft);
    expect(visitOptionLabels(locked, "p1").some((label) => /top Artifact card/.test(label))).toBe(false);

    // CONTROL — round 5, identical decks: the offer is back.
    const open = setupAtRound("relic-forest-open", "event.magical_forest", EVENT_RELIC_MIN_ROUND, onlyRelicsLeft);
    expect(visitOptionLabels(open, "p1").some((label) => /top Artifact card/.test(label))).toBe(true);
  });

  it("A Shady Auction redraws past Relics on a legacy SINGLE Artifact deck (CONTROL: round 5 auctions the Relic)", () => {
    const singleDeck = (s: GameState) => {
      delete s.decks["artifacts-minor"];
      delete s.decks["artifacts-major"];
      delete s.decks["artifacts-relic"];
      // Deck top = array end: the Relic Tome sits ON TOP of the minor Armor.
      s.decks["artifacts"] = {
        id: "artifacts",
        drawPile: ["artifact.armor_of_wonder", "artifact.tome_of_air"],
        discardPile: []
      };
    };

    const locked = setupAtRound("relic-auction-locked", "event.a_shady_auction", 3, singleDeck);
    // The lot skipped the top Relic and took the minor beneath it…
    expect(getEventsState(locked)!.auction?.lotCardId).toBe("artifact.armor_of_wonder");
    // …and the Relic was tucked back under the deck, never consumed.
    expect(locked.decks["artifacts"].drawPile).toEqual(["artifact.tome_of_air"]);

    // CONTROL — round 5: the top Relic itself becomes the lot.
    const open = setupAtRound("relic-auction-open", "event.a_shady_auction", EVENT_RELIC_MIN_ROUND, singleDeck);
    expect(getEventsState(open)!.auction?.lotCardId).toBe("artifact.tome_of_air");
  });

  it("Artifact Merchant: before round 5 the pool skips the Relic deck AND a Relic discard-top is never offered (CONTROL: round 5 offers both)", () => {
    const relicOnDiscard = (s: GameState) => {
      richPlayers(s);
      onlyRelicsLeft(s);
      // MOVE one Relic onto its discard pile (no duplicate copies).
      const relicDeck = s.decks["artifacts-relic"];
      relicDeck.drawPile = relicDeck.drawPile.filter((cardId) => cardId !== "artifact.tome_of_air");
      relicDeck.discardPile.push("artifact.tome_of_air");
    };

    const locked = setupAtRound("relic-merchant-locked", "event.artifact_merchant", 3, relicOnDiscard);
    // Pool: the 5 draws had only the (locked) Relic deck to hit — nothing shows.
    expect(getEventsState(locked)!.pool).toEqual([]);
    // Discard-top: the face-up Relic is NOT purchasable.
    expect(visitOptionLabels(locked, "p1").some((label) => /discard top/.test(label))).toBe(false);
    expect(locked.decks["artifacts-relic"].discardPile).toContain("artifact.tome_of_air");

    // CONTROL — round 5: the pool fills with Relics and the discard-top offer appears.
    const open = setupAtRound("relic-merchant-open", "event.artifact_merchant", EVENT_RELIC_MIN_ROUND, relicOnDiscard);
    const pool = getEventsState(open)!.pool;
    expect(pool).toHaveLength(5);
    for (const entry of pool) {
      expect(cardLibrary[entry.cardId]?.artifactTier, entry.cardId).toBe("relic");
    }
    const after = chooseVisitOption(open, "p1", /Buy the discard top Tome of Air \(7 gold\)/);
    expect(after.players.p1.hand).toContain("artifact.tome_of_air");
    expect(after.players.p1.resources.gold).toBe(30 - 7);
  });
});

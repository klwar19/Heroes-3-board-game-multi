import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import { ASTROLOGERS_DECK_ID, drawAstrologersCard } from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import type { GameAction, GameState, PlayerId } from "./state";

/**
 * Wandering Merchant (Stretch Goals, WAR_MACHINE_DISCOUNT_OFFER), engine-enforced
 * end to end (CLAUDE.md #1 — every assertion fails if the wiring is deleted):
 *
 *   "Once during this round, each player can buy a War Machine as if they visited
 *    a Trading Post, but with a discount of 3 gold."
 *
 * Driven through the real draw -> reward-queue -> visit-step path. The discount is
 * tested by the OBSERVABLE outcome — the gold actually spent and the machine that
 * lands in hand — not by reading an intermediate price. Trading-Post prices in the
 * default supply: First Aid Tent 6, Ammo Cart 8, Ballista 10, Catapult 12,
 * Cannon 14; minus the 3-gold discount that is 3 / 5 / 7 / 9 / 11.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** A clean even-round adventure with `cardId` on top of the Astrologers deck. */
function roundWith(cardId: string): GameState {
  const state = createAdventureGameState({ seed: "wandering-merchant", difficulty: "normal", rollFirstPlayer: false });
  state.round = 2;
  // Isolate the draw path: clear anything setup queued and any open gate.
  state.adventure!.rewardQueue = [];
  state.adventure!.pendingVisit = null;
  state.adventure!.pendingTileChoice = null;
  state.pendingChoice = null;
  const deck = state.decks[ASTROLOGERS_DECK_ID]!;
  deck.drawPile = [cardId];
  deck.discardPile = [];
  return state;
}

function visitOptionLabels(state: GameState, playerId: PlayerId): string[] {
  return getLegalActions(state, playerId)
    .filter((entry) => entry.action.type === "RESOLVE_VISIT_STEP")
    .map((entry) => entry.label);
}

function chooseVisitOption(state: GameState, playerId: PlayerId, match: RegExp): GameState {
  const legal = getLegalActions(state, playerId).find(
    (entry) => entry.action.type === "RESOLVE_VISIT_STEP" && match.test(entry.label)
  );
  expect(legal, `expected a visit option matching ${match}`).toBeTruthy();
  return applyOk(state, legal!.action);
}

describe("Astrologers — Wandering Merchant (discounted War Machine buy)", () => {
  it("queues one discounted buy offer per human player when drawn", () => {
    const state = roundWith("astrologers.wandering_merchant");
    drawAstrologersCard(state);

    expect(state.adventure?.astrologers?.activeCardId).toBe("astrologers.wandering_merchant");
    const offers = (state.adventure?.rewardQueue ?? []).filter(
      (reward) => reward.kind === "visit-steps" && reward.steps[0]?.type === "WAR_MACHINE_DISCOUNT_OFFER"
    );
    expect(offers.map((offer) => offer.playerId).sort()).toEqual(["p1", "p2"]);
  });

  it("buys a machine for the Trading-Post price MINUS 3, moving it to hand and out of the supply", () => {
    const state = roundWith("astrologers.wandering_merchant");
    state.players.p1.resources.gold = 10;
    drawAstrologersCard(state);
    pumpAdventureQueues(state);

    expect(state.adventure?.pendingVisit?.playerId).toBe("p1");
    const labels = visitOptionLabels(state, "p1");
    // First Aid Tent is 6 at a Trading Post -> 3 after the discount.
    expect(labels).toContain("Buy First Aid Tent (3 gold)");
    expect(labels).toContain("Skip");

    const next = chooseVisitOption(state, "p1", /^Buy First Aid Tent \(3 gold\)$/);
    // Spent EXACTLY the discounted 3 (full price would have left 4, not 7).
    expect(next.players.p1.resources.gold).toBe(7);
    expect(next.players.p1.hand).toContain("war_machine.first_aid_tent");
    expect(next.adventure?.warMachineSupply).not.toContain("war_machine.first_aid_tent");
  });

  it("only offers machines the player can still afford at the discounted price", () => {
    const state = roundWith("astrologers.wandering_merchant");
    // Exactly enough for the cheapest discounted machine (Tent = 3), nothing more.
    state.players.p1.resources.gold = 3;
    drawAstrologersCard(state);
    pumpAdventureQueues(state);

    const labels = visitOptionLabels(state, "p1");
    expect(labels).toContain("Buy First Aid Tent (3 gold)");
    // Ammo Cart (5) and Cannon (11) are out of reach at 3 gold — not offered.
    expect(labels.some((label) => /Ammo Cart/.test(label))).toBe(false);
    expect(labels.some((label) => /Cannon/.test(label))).toBe(false);
  });

  it("is optional — Skip buys nothing and spends no gold", () => {
    const state = roundWith("astrologers.wandering_merchant");
    state.players.p1.resources.gold = 10;
    drawAstrologersCard(state);
    pumpAdventureQueues(state);

    const next = chooseVisitOption(state, "p1", /^Skip$/);
    expect(next.players.p1.resources.gold).toBe(10);
    expect(next.players.p1.hand.filter((id) => id.startsWith("war_machine."))).toEqual([]);
  });

  it("rebuilds from the live shared supply: a machine one player buys is gone from the next player's menu", () => {
    const state = roundWith("astrologers.wandering_merchant");
    state.players.p1.resources.gold = 20;
    state.players.p2.resources.gold = 20;
    drawAstrologersCard(state);
    pumpAdventureQueues(state);

    // p1 buys the Tent...
    expect(state.adventure?.pendingVisit?.playerId).toBe("p1");
    const afterP1 = chooseVisitOption(state, "p1", /^Buy First Aid Tent \(3 gold\)$/);

    // ...then p2's offer opens, and the Tent is no longer purchasable.
    expect(afterP1.adventure?.pendingVisit?.playerId).toBe("p2");
    const p2Labels = visitOptionLabels(afterP1, "p2");
    expect(p2Labels.some((label) => /First Aid Tent/.test(label))).toBe(false);
    expect(p2Labels.some((label) => /Cannon/.test(label))).toBe(true);

    expect(afterP1.players.p1.hand).toContain("war_machine.first_aid_tent");
    expect(afterP1.adventure?.warMachineSupply).not.toContain("war_machine.first_aid_tent");
  });

  it("CONTROL: a different proclamation queues no discount offer", () => {
    const state = roundWith("astrologers.dead_silence");
    drawAstrologersCard(state);

    const offers = (state.adventure?.rewardQueue ?? []).filter(
      (reward) => reward.kind === "visit-steps" && reward.steps[0]?.type === "WAR_MACHINE_DISCOUNT_OFFER"
    );
    expect(offers).toEqual([]);
  });

  it("offers nothing when the war-machine supply is empty", () => {
    const state = roundWith("astrologers.wandering_merchant");
    state.adventure!.warMachineSupply = [];
    drawAstrologersCard(state);
    pumpAdventureQueues(state);

    expect(state.adventure?.pendingVisit).toBeNull();
    const offers = (state.adventure?.rewardQueue ?? []).filter(
      (reward) => reward.kind === "visit-steps" && reward.steps[0]?.type === "WAR_MACHINE_DISCOUNT_OFFER"
    );
    expect(offers).toEqual([]);
  });
});

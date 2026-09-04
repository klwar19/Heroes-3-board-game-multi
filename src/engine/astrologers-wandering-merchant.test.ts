import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import { ASTROLOGERS_DECK_ID, drawAstrologersCard } from "./adventure";
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
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
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

function openMerchant(state: GameState, playerId: PlayerId): GameState {
  const legal = getLegalActions(state, playerId).find(
    (entry) => entry.action.type === "OPEN_WANDERING_MERCHANT"
  );
  expect(legal, "expected the during-turn Wandering Merchant action").toBeTruthy();
  return applyOk(state, legal!.action);
}

describe("Astrologers — Wandering Merchant (discounted War Machine buy)", () => {
  it("keeps the offer open when poor, then allows a purchase after gaining gold", () => {
    const state = roundWith("astrologers.wandering_merchant");
    state.players.p1.resources.gold = 0;
    drawAstrologersCard(state);
    const opened = openMerchant(state, "p1");
    expect(visitOptionLabels(opened, "p1")).toEqual(["Skip"]);
    const closed = chooseVisitOption(opened, "p1", /^Skip$/);
    closed.players.p1.resources.gold = 3;
    const bought = chooseVisitOption(openMerchant(closed, "p1"), "p1", /^Buy First Aid Tent/);
    expect(bought.players.p1.resources.gold).toBe(0);
    expect(bought.players.p1.hand).toContain("war_machine.first_aid_tent");
  });
  it("does not interrupt round start; it exposes a during-turn action instead", () => {
    const state = roundWith("astrologers.wandering_merchant");
    state.players.p1.resources.gold = 20;
    drawAstrologersCard(state);

    expect(state.adventure?.astrologers?.activeCardId).toBe("astrologers.wandering_merchant");
    expect(state.adventure?.pendingVisit).toBeNull();
    expect(state.adventure?.rewardQueue).toEqual([]);
    expect(getLegalActions(state, "p1").some((entry) => entry.action.type === "OPEN_WANDERING_MERCHANT")).toBe(true);
    expect(getLegalActions(state, "p1").some((entry) => entry.action.type === "END_TURN")).toBe(true);
  });

  it("buys a machine for the Trading-Post price MINUS 3, moving it to hand (catalog NOT depleted)", () => {
    const state = roundWith("astrologers.wandering_merchant");
    state.players.p1.resources.gold = 10;
    drawAstrologersCard(state);
    const opened = openMerchant(state, "p1");

    expect(opened.adventure?.pendingVisit?.playerId).toBe("p1");
    const labels = visitOptionLabels(opened, "p1");
    // First Aid Tent is 6 at a Trading Post -> 3 after the discount.
    expect(labels).toContain("Buy First Aid Tent (3 gold)");
    expect(labels).toContain("Skip");

    const next = chooseVisitOption(opened, "p1", /^Buy First Aid Tent \(3 gold\)$/);
    // Spent EXACTLY the discounted 3 (full price would have left 4, not 7).
    expect(next.players.p1.resources.gold).toBe(7);
    expect(next.players.p1.hand).toContain("war_machine.first_aid_tent");
    // HOUSE RULE: the catalog is per-player and NEVER depletes — the Tent stays
    // available so every OTHER player can still buy their own.
    expect(next.adventure?.warMachineSupply).toContain("war_machine.first_aid_tent");
    expect(next.adventure?.pendingVisit).toBeNull();
    expect(getLegalActions(next, "p1").some((entry) => entry.action.type === "OPEN_WANDERING_MERCHANT")).toBe(false);
  });

  it("only offers machines the player can still afford at the discounted price", () => {
    const state = roundWith("astrologers.wandering_merchant");
    // Exactly enough for the cheapest discounted machine (Tent = 3), nothing more.
    state.players.p1.resources.gold = 3;
    drawAstrologersCard(state);
    const opened = openMerchant(state, "p1");

    const labels = visitOptionLabels(opened, "p1");
    expect(labels).toContain("Buy First Aid Tent (3 gold)");
    // Ammo Cart (5) and Cannon (11) are out of reach at 3 gold — not offered.
    expect(labels.some((label) => /Ammo Cart/.test(label))).toBe(false);
    expect(labels.some((label) => /Cannon/.test(label))).toBe(false);
  });

  it("is optional — Skip buys nothing and spends no gold", () => {
    const state = roundWith("astrologers.wandering_merchant");
    state.players.p1.resources.gold = 10;
    drawAstrologersCard(state);
    const opened = openMerchant(state, "p1");

    const next = chooseVisitOption(opened, "p1", /^Skip$/);
    expect(next.players.p1.resources.gold).toBe(10);
    expect(next.players.p1.hand.filter((id) => id.startsWith("war_machine."))).toEqual([]);
    expect(next.adventure?.pendingVisit).toBeNull();
    expect(getLegalActions(next, "p1").some((entry) => entry.action.type === "OPEN_WANDERING_MERCHANT")).toBe(true);
  });

  it("expires after the Astrologers round even though the card remains face up", () => {
    const state = roundWith("astrologers.wandering_merchant");
    state.players.p1.resources.gold = 20;
    drawAstrologersCard(state);
    expect(getLegalActions(state, "p1").some((entry) => entry.action.type === "OPEN_WANDERING_MERCHANT")).toBe(true);

    state.round = 3;
    expect(state.adventure?.astrologers?.activeCardId).toBe("astrologers.wandering_merchant");
    expect(getLegalActions(state, "p1").some((entry) => entry.action.type === "OPEN_WANDERING_MERCHANT")).toBe(false);
  });

  it("per-player catalog: a machine one player buys is STILL on the next player's menu (both can buy the Tent)", () => {
    // The reported bug: "1 player buys the Tent → nobody else ever can." The
    // catalog is per-player and never depletes, so p2 still sees AND can buy the
    // Tent after p1 bought one. The only per-player limit is not owning two.
    const state = roundWith("astrologers.wandering_merchant");
    state.players.p1.resources.gold = 20;
    state.players.p2.resources.gold = 20;
    drawAstrologersCard(state);
    const p1Open = openMerchant(state, "p1");

    // p1 buys the Tent...
    expect(p1Open.adventure?.pendingVisit?.playerId).toBe("p1");
    const afterP1 = chooseVisitOption(p1Open, "p1", /^Buy First Aid Tent \(3 gold\)$/);

    // ...then p2's offer opens, and the Tent is STILL purchasable for p2.
    afterP1.activePlayerId = "p2";
    const p2Open = openMerchant(afterP1, "p2");
    expect(p2Open.adventure?.pendingVisit?.playerId).toBe("p2");
    const p2Labels = visitOptionLabels(p2Open, "p2");
    expect(p2Labels.some((label) => /First Aid Tent/.test(label))).toBe(true);

    const afterP2 = chooseVisitOption(p2Open, "p2", /^Buy First Aid Tent \(3 gold\)$/);
    // BOTH players now own their own Tent; the catalog is untouched.
    expect(afterP2.players.p1.hand).toContain("war_machine.first_aid_tent");
    expect(afterP2.players.p2.hand).toContain("war_machine.first_aid_tent");
    expect(afterP2.adventure?.warMachineSupply).toContain("war_machine.first_aid_tent");
  });

  it("per-player uniqueness: a player who ALREADY owns the Tent is not offered a second one", () => {
    const state = roundWith("astrologers.wandering_merchant");
    state.players.p1.resources.gold = 20;
    state.players.p1.hand = [...state.players.p1.hand, "war_machine.first_aid_tent"]; // already owns one
    drawAstrologersCard(state);
    const opened = openMerchant(state, "p1");

    expect(opened.adventure?.pendingVisit?.playerId).toBe("p1");
    const labels = visitOptionLabels(opened, "p1");
    expect(labels.some((label) => /First Aid Tent/.test(label))).toBe(false);
    // Other machines are still on offer (only the owned one drops out).
    expect(labels.some((label) => /Ammo Cart|Ballista|Catapult|Cannon/.test(label))).toBe(true);
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

    expect(state.adventure?.pendingVisit).toBeNull();
    expect(getLegalActions(state, "p1").some((entry) => entry.action.type === "OPEN_WANDERING_MERCHANT")).toBe(false);
    const offers = (state.adventure?.rewardQueue ?? []).filter(
      (reward) => reward.kind === "visit-steps" && reward.steps[0]?.type === "WAR_MACHINE_DISCOUNT_OFFER"
    );
    expect(offers).toEqual([]);
  });
});

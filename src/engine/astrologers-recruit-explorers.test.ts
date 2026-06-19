import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import { drawAstrologersCard, getTownOfPlayer, startAdventureRound } from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import type { GameAction, GameState, PlayerId } from "./state";

/**
 * Three more expansion Astrologers proclamations, engine-enforced end to end
 * (CLAUDE.md #1 — every assertion fails if its wiring is deleted):
 *
 *   - Explorers (Inferno): for every 3 cards discarded during a start-of-turn
 *     hand refresh, empower one Statistic for free.
 *   - Charlie and his Circus (Rampart): draw one Neutral Unit per Dwelling tier
 *     you control and recruit one, paying its cost — offered this round and the
 *     next (the drawn Astrologers round + the following Resource round).
 *   - Unexpected Reinforcements (Tower): the same draw, recruited for free, once.
 *
 * The recruitment cards reuse the engine's Dwelling-tier gate (unlockedRecruitTiers,
 * the same gate behind Cyra's Diplomacy); Azure is never recruitable because no
 * Dwelling unlocks it.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
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

/** Sets exactly which Dwelling tiers a player controls (bronze/silver/gold). */
function setDwellingTiers(state: GameState, playerId: PlayerId, tiers: ("bronze" | "silver" | "gold")[]): void {
  const town = getTownOfPlayer(state, playerId);
  if (!town) {
    throw new Error("no town");
  }
  town.buildings = town.buildings.filter((id) => !id.includes("dwelling"));
  for (const tier of tiers) {
    town.buildings.push(`castle.dwelling_${tier}`); // any faction's id unlocks the tier
  }
}

// ===========================================================================
// Explorers — empower one Statistic per 3 cards discarded at the hand refresh
// ===========================================================================

describe("Astrologers — Explorers (empower per 3 discarded)", () => {
  function explorersGame(activeCardId = "astrologers.explorers"): GameState {
    const state = createAdventureGameState({ seed: "explorers", difficulty: "normal", rollFirstPlayer: false });
    state.adventure!.astrologers = {
      activeCardId,
      nextResourceModifiers: { gold: 0, valuables: 0 },
      crazyWizardUsedBy: [],
      swiftWeaselUsedBy: []
    };
    state.activePlayerId = "p1";
    const p1 = state.players.p1;
    p1.canMulligan = true;
    p1.needsHandRefresh = false;
    p1.discard = [];
    p1.removed = [];
    // Spells fill the draw pile so the redraw never adds a stray Statistic.
    p1.deck = Array.from({ length: 8 }, () => "spell.magic_arrow");
    return state;
  }

  it("offers one empower for every 3 cards discarded, and empowering swaps the Statistic", () => {
    const state = explorersGame();
    state.players.p1.hand = ["stat.attack", "spell.magic_arrow", "spell.magic_arrow", "spell.magic_arrow"];

    const refreshed = applyOk(state, {
      type: "REFRESH_HAND",
      playerId: "p1",
      discardCardIds: ["spell.magic_arrow", "spell.magic_arrow", "spell.magic_arrow"]
    });

    const labels = visitOptionLabels(refreshed, "p1");
    expect(labels.some((label) => /Empower Attack/.test(label))).toBe(true);
    expect(labels).toContain("Done");

    const empowered = chooseVisitOption(refreshed, "p1", /Empower Attack/);
    expect(empowered.players.p1.hand).toContain("stat.attack.empowered");
    expect(empowered.players.p1.hand).not.toContain("stat.attack");
    // floor(3/3) = 1 empower — the visit closes after the single swap.
    expect(empowered.adventure?.pendingVisit).toBeNull();
  });

  it("scales: discarding 6 cards allows two empowers in the same refresh", () => {
    const state = explorersGame();
    state.players.p1.hand = [
      "stat.attack",
      "stat.defense",
      "spell.magic_arrow",
      "spell.magic_arrow",
      "spell.magic_arrow",
      "spell.magic_arrow",
      "spell.magic_arrow",
      "spell.magic_arrow"
    ];

    let s = applyOk(state, {
      type: "REFRESH_HAND",
      playerId: "p1",
      discardCardIds: Array.from({ length: 6 }, () => "spell.magic_arrow")
    });

    s = chooseVisitOption(s, "p1", /Empower Attack/);
    expect(s.players.p1.hand).toContain("stat.attack.empowered");
    // A second empower (floor(6/3) = 2) is still on offer.
    expect(s.adventure?.pendingVisit?.playerId).toBe("p1");
    s = chooseVisitOption(s, "p1", /Empower Defense/);
    expect(s.players.p1.hand).toContain("stat.defense.empowered");
    expect(s.adventure?.pendingVisit).toBeNull();
  });

  it("offers no empower when fewer than 3 cards are discarded", () => {
    const state = explorersGame();
    state.players.p1.hand = ["stat.attack", "spell.magic_arrow", "spell.magic_arrow", "spell.magic_arrow"];

    const refreshed = applyOk(state, {
      type: "REFRESH_HAND",
      playerId: "p1",
      discardCardIds: ["spell.magic_arrow", "spell.magic_arrow"]
    });
    expect(refreshed.adventure?.pendingVisit).toBeNull();
  });

  it("does nothing without Explorers face up, even discarding 3", () => {
    const state = explorersGame("astrologers.dead_silence");
    state.players.p1.hand = ["stat.attack", "spell.magic_arrow", "spell.magic_arrow", "spell.magic_arrow"];

    const refreshed = applyOk(state, {
      type: "REFRESH_HAND",
      playerId: "p1",
      discardCardIds: ["spell.magic_arrow", "spell.magic_arrow", "spell.magic_arrow"]
    });
    expect(refreshed.adventure?.pendingVisit).toBeNull();
    expect(refreshed.players.p1.hand).not.toContain("stat.attack.empowered");
  });
});

// ===========================================================================
// Charlie and his Circus — paid Neutral recruit, this round and the next
// ===========================================================================

describe("Astrologers — Charlie and his Circus (paid Neutral recruit)", () => {
  function charlieGame(): GameState {
    const state = createAdventureGameState({ seed: "charlie", difficulty: "normal", rollFirstPlayer: false });
    setDwellingTiers(state, "p1", ["bronze"]);
    setDwellingTiers(state, "p2", []); // only p1 is offered, keeping the assertions focused
    state.players.p1.resources.gold = 50;
    state.decks["neutral-bronze"]!.drawPile = ["neutral.boars"]; // Boars cost 4 gold
    state.decks.astrologers!.drawPile = ["astrologers.charlie_and_his_circus"];
    return state;
  }

  it("draws from the player's Dwelling-tier decks and recruits the chosen unit, paying its cost", () => {
    const state = charlieGame();
    drawAstrologersCard(state);
    pumpAdventureQueues(state);

    expect(state.adventure?.astrologers?.activeCardId).toBe("astrologers.charlie_and_his_circus");
    expect(state.adventure?.pendingVisit?.playerId).toBe("p1");
    expect(visitOptionLabels(state, "p1").some((label) => /Recruit Boars \(4 gold\)/.test(label))).toBe(true);

    const after = chooseVisitOption(state, "p1", /Recruit Boars/);
    expect(after.players.p1.army.some((unit) => unit.unitDefId === "neutral.boars" && unit.side === "neutral")).toBe(true);
    expect(after.players.p1.resources.gold).toBe(46); // 50 - 4
    expect(after.adventure?.pendingVisit).toBeNull();
  });

  it("recruits nothing on 'Recruit none' and returns the drawn card to its deck", () => {
    const state = charlieGame();
    drawAstrologersCard(state);
    pumpAdventureQueues(state);

    const after = chooseVisitOption(state, "p1", /Recruit none/);
    expect(after.players.p1.army.some((unit) => unit.unitDefId === "neutral.boars")).toBe(false);
    expect(after.players.p1.resources.gold).toBe(50);
    expect(after.decks["neutral-bronze"]!.discardPile).toContain("neutral.boars");
  });

  it("offers nothing the player cannot afford (the draw returns to its deck)", () => {
    const state = charlieGame();
    state.players.p1.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
    drawAstrologersCard(state);
    pumpAdventureQueues(state);

    expect(state.adventure?.pendingVisit).toBeNull();
    expect(state.decks["neutral-bronze"]!.discardPile).toContain("neutral.boars");
  });

  it("offers nothing to a player without a Dwelling", () => {
    const state = charlieGame();
    setDwellingTiers(state, "p1", []);
    drawAstrologersCard(state);
    pumpAdventureQueues(state);
    expect(state.adventure?.pendingVisit).toBeNull();
  });

  it("offers again at the next Resource round (this round and the next)", () => {
    const state = charlieGame();
    state.adventure!.astrologers = {
      activeCardId: "astrologers.charlie_and_his_circus",
      nextResourceModifiers: { gold: 0, valuables: 0 },
      crazyWizardUsedBy: [],
      swiftWeaselUsedBy: []
    };
    state.round = 3; // a Resource round, the card still face up
    startAdventureRound(state);

    const offers = (state.adventure?.rewardQueue ?? []).filter(
      (reward) => reward.kind === "visit-steps" && reward.steps[0]?.type === "NEUTRAL_RECRUIT_OFFER"
    );
    expect(offers.map((offer) => offer.playerId)).toContain("p1");
  });
});

// ===========================================================================
// Unexpected Reinforcements — free Neutral recruit, immediate, no Azure
// ===========================================================================

describe("Astrologers — Unexpected Reinforcements (free Neutral recruit)", () => {
  function unexpectedGame(): GameState {
    const state = createAdventureGameState({ seed: "unexpected", difficulty: "normal", rollFirstPlayer: false });
    setDwellingTiers(state, "p1", ["bronze"]);
    setDwellingTiers(state, "p2", []);
    state.players.p1.resources = { gold: 0, buildingMaterials: 0, valuables: 0 };
    state.decks["neutral-bronze"]!.drawPile = ["neutral.boars"];
    state.decks.astrologers!.drawPile = ["astrologers.unexpected_reinforcements"];
    return state;
  }

  it("recruits a Neutral Unit for free, drawn from a Dwelling-tier deck", () => {
    const state = unexpectedGame();
    drawAstrologersCard(state);
    pumpAdventureQueues(state);

    expect(state.adventure?.pendingVisit?.playerId).toBe("p1");
    expect(visitOptionLabels(state, "p1").some((label) => /Recruit Boars \(free\)/.test(label))).toBe(true);

    const after = chooseVisitOption(state, "p1", /Recruit Boars/);
    expect(after.players.p1.army.some((unit) => unit.unitDefId === "neutral.boars" && unit.side === "neutral")).toBe(true);
    // "for free" — no resources spent despite having none.
    expect(after.players.p1.resources.gold).toBe(0);
    expect(after.adventure?.pendingVisit).toBeNull();
  });

  it("offers nothing to a player without a Dwelling", () => {
    const state = unexpectedGame();
    setDwellingTiers(state, "p1", []);
    drawAstrologersCard(state);
    pumpAdventureQueues(state);
    expect(state.adventure?.pendingVisit).toBeNull();
  });

  it("never draws Azure — only Dwelling tiers (bronze/silver/gold) are recruitable", () => {
    const state = unexpectedGame();
    // Seed an Azure unit on top of the azure deck; with only a bronze Dwelling it
    // is never drawn, so the Azure deck is left untouched and Boars is offered.
    state.decks["neutral-azure"]!.drawPile = ["neutral.azure_dragons"];
    const azureBefore = state.decks["neutral-azure"]!.drawPile.length;
    drawAstrologersCard(state);
    pumpAdventureQueues(state);

    expect(visitOptionLabels(state, "p1").some((label) => /Recruit Boars/.test(label))).toBe(true);
    expect(state.decks["neutral-azure"]!.drawPile.length).toBe(azureBefore); // azure untouched
  });
});

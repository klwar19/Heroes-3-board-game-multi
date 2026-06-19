import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import { drawAstrologersCard, startPlayerTurn } from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import type { GameState, PlayerId } from "./state";

/**
 * Statistic-empowering / card-removal Astrologers proclamations, engine-enforced
 * end to end (CLAUDE.md #1):
 *   - Dancing Imp (Inferno): free, swap one Statistic card (hand OR discard) for
 *     its same-type Empowered version.
 *   - Plane Between Planes (Fortress): Remove up to 2 cards from hand/discard.
 *   - Hero (Inferno, ongoing): at the start of a turn, pay 4 gold to empower a
 *     hand Statistic, up to twice that turn.
 *
 * Each test drives the real reward-queue / visit-step flow (RESOLVE_VISIT_STEP),
 * so deleting the wiring — the resolveAstrologersCard case, the turn-start hook,
 * or the EMPOWER_STATISTIC / REMOVE_UP_TO step handlers — makes a test fail.
 */

function makeGame(): GameState {
  // "normal" keeps fixtures deterministic; p1 = Catherine/Castle, p2 = Sandro.
  return createAdventureGameState({ seed: "astro-stats", difficulty: "normal", rollFirstPlayer: false });
}

/** Picks the pending visit-step option whose label matches `match`, for `playerId`. */
function chooseVisitOption(state: GameState, playerId: PlayerId, match: RegExp): GameState {
  const legal = getLegalActions(state, playerId).find(
    (entry) => entry.action.type === "RESOLVE_VISIT_STEP" && match.test(entry.label)
  );
  expect(legal, `expected a visit option matching ${match}`).toBeTruthy();
  const result = applyAction(state, legal!.action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Labels of the pending visit-step options offered to `playerId`. */
function visitOptionLabels(state: GameState, playerId: PlayerId): string[] {
  return getLegalActions(state, playerId)
    .filter((entry) => entry.action.type === "RESOLVE_VISIT_STEP")
    .map((entry) => entry.label);
}

describe("Astrologers — Dancing Imp (empower a Statistic)", () => {
  it("swaps a hand Statistic for its same-type Empowered version, leaving other cards untouched", () => {
    const state = makeGame();
    state.players.p1.hand = ["stat.attack", "spell.magic_arrow"];
    state.players.p1.discard = ["stat.defense"];
    state.players.p1.removed = [];
    // p2 holds no Statistic, so no second offer is queued (keeps the test focused).
    state.players.p2.hand = [];
    state.players.p2.discard = [];
    state.decks.astrologers.drawPile = ["astrologers.dancing_imp"];

    drawAstrologersCard(state);
    pumpAdventureQueues(state);

    expect(state.adventure?.astrologers?.activeCardId).toBe("astrologers.dancing_imp");
    expect(state.adventure?.pendingVisit?.playerId).toBe("p1");

    // Both the hand Attack and the discard Defense are offered (hand OR discard).
    const labels = visitOptionLabels(state, "p1");
    expect(labels.some((label) => /Empower Attack \(hand\)/.test(label))).toBe(true);
    expect(labels.some((label) => /Empower Defense \(discard\)/.test(label))).toBe(true);
    expect(labels).toContain("Done");

    const next = chooseVisitOption(state, "p1", /Empower Attack \(hand\)/);

    expect(next.players.p1.hand).toContain("stat.attack.empowered");
    expect(next.players.p1.hand).not.toContain("stat.attack");
    expect(next.players.p1.removed).toContain("stat.attack");
    // Dancing Imp is a single swap: the untouched discard Statistic stays put.
    expect(next.players.p1.discard).toContain("stat.defense");
    // The card carries the spell through untouched too.
    expect(next.players.p1.hand).toContain("spell.magic_arrow");
    // One swap only — the visit closes (no chained second offer).
    expect(next.adventure?.pendingVisit).toBeNull();
  });

  it("is offered to no one when nobody holds a non-Empowered Statistic", () => {
    const state = makeGame();
    state.players.p1.hand = ["spell.magic_arrow", "stat.attack.empowered"];
    state.players.p1.discard = [];
    state.players.p2.hand = [];
    state.players.p2.discard = [];
    state.decks.astrologers.drawPile = ["astrologers.dancing_imp"];

    drawAstrologersCard(state);
    pumpAdventureQueues(state);

    // Nothing empowerable anywhere → no pending prompt.
    expect(state.adventure?.pendingVisit).toBeNull();
  });
});

describe("Astrologers — Plane Between Planes (remove up to 2)", () => {
  it("removes two chosen cards from hand/discard, then stops at the cap", () => {
    const state = makeGame();
    state.players.p1.hand = ["spell.magic_arrow", "stat.attack"];
    state.players.p1.discard = ["stat.defense"];
    state.players.p1.removed = [];
    state.players.p2.hand = [];
    state.players.p2.discard = [];
    state.decks.astrologers.drawPile = ["astrologers.plane_between_planes"];

    drawAstrologersCard(state);
    pumpAdventureQueues(state);

    expect(state.adventure?.pendingVisit?.playerId).toBe("p1");
    expect(visitOptionLabels(state, "p1")).toContain("Done");

    // First removal: a hand card.
    let s = chooseVisitOption(state, "p1", /Remove Magic Arrow \(hand\)/);
    expect(s.players.p1.removed).toContain("spell.magic_arrow");
    expect(s.players.p1.hand).not.toContain("spell.magic_arrow");

    // Second removal: the discard Statistic. A fresh menu re-opened (remaining 1).
    expect(s.adventure?.pendingVisit?.playerId).toBe("p1");
    s = chooseVisitOption(s, "p1", /Remove Defense \(discard\)/);
    expect(s.players.p1.removed).toEqual(expect.arrayContaining(["spell.magic_arrow", "stat.defense"]));
    expect(s.players.p1.discard).not.toContain("stat.defense");

    // Capped at 2: the visit closes even though a card (stat.attack) remains.
    expect(s.adventure?.pendingVisit).toBeNull();
    expect(s.players.p1.hand).toContain("stat.attack");
  });

  it("can remove nothing (Done) — the removal is optional", () => {
    const state = makeGame();
    state.players.p1.hand = ["spell.magic_arrow", "stat.attack"];
    state.players.p1.discard = [];
    state.players.p1.removed = [];
    state.players.p2.hand = [];
    state.players.p2.discard = [];
    state.decks.astrologers.drawPile = ["astrologers.plane_between_planes"];

    drawAstrologersCard(state);
    pumpAdventureQueues(state);

    const s = chooseVisitOption(state, "p1", /^Done$/);
    expect(s.players.p1.removed).toEqual([]);
    expect(s.players.p1.hand).toEqual(["spell.magic_arrow", "stat.attack"]);
    expect(s.adventure?.pendingVisit).toBeNull();
  });
});

describe("Astrologers — Hero (pay to empower, twice per turn)", () => {
  function setHeroActive(state: GameState): void {
    state.adventure!.astrologers = {
      activeCardId: "astrologers.hero",
      nextResourceModifiers: { gold: 0, valuables: 0 },
      crazyWizardUsedBy: [],
      swiftWeaselUsedBy: []
    };
  }

  it("offers two 4-gold same-type empowers at the start of the turn, then stops", () => {
    const state = makeGame();
    setHeroActive(state);
    state.players.p1.hand = ["stat.attack", "stat.power", "spell.magic_arrow"];
    state.players.p1.discard = [];
    state.players.p1.removed = [];
    state.players.p1.resources.gold = 20;

    startPlayerTurn(state, "p1");
    pumpAdventureQueues(state);

    expect(state.adventure?.pendingVisit?.playerId).toBe("p1");
    expect(visitOptionLabels(state, "p1")).toContain("Done");

    // First paid swap: Attack → Empowered Attack, -4 gold.
    let s = chooseVisitOption(state, "p1", /Pay 4 gold: Empower Attack \(hand\)/);
    expect(s.players.p1.hand).toContain("stat.attack.empowered");
    expect(s.players.p1.hand).not.toContain("stat.attack");
    expect(s.players.p1.resources.gold).toBe(16);

    // Second paid swap is offered (same turn): Power → Empowered Power, -4 gold.
    expect(s.adventure?.pendingVisit?.playerId).toBe("p1");
    s = chooseVisitOption(s, "p1", /Pay 4 gold: Empower Power \(hand\)/);
    expect(s.players.p1.hand).toContain("stat.power.empowered");
    expect(s.players.p1.resources.gold).toBe(12);

    // Capped at twice per turn — no third offer even though gold and (had) cards.
    expect(s.adventure?.pendingVisit).toBeNull();
  });

  it("is not offered when the player cannot afford the 4 gold", () => {
    const state = makeGame();
    setHeroActive(state);
    state.players.p1.hand = ["stat.attack"];
    state.players.p1.discard = [];
    state.players.p1.resources.gold = 3;

    startPlayerTurn(state, "p1");
    pumpAdventureQueues(state);

    expect(state.adventure?.pendingVisit).toBeNull();
  });

  it("only empowers from the hand, never the discard pile", () => {
    const state = makeGame();
    setHeroActive(state);
    state.players.p1.hand = ["spell.magic_arrow"];
    state.players.p1.discard = ["stat.defense"];
    state.players.p1.resources.gold = 20;

    startPlayerTurn(state, "p1");
    pumpAdventureQueues(state);

    // A discard-only Statistic gives Hero nothing to do (it is hand-only).
    expect(state.adventure?.pendingVisit).toBeNull();
  });
});

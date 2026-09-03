import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import { drawAstrologersCard } from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import type { GameAction, GameState, LegalAction, PlayerId } from "./state";

/**
 * Statistic-empowering / card-removal Astrologers proclamations, engine-enforced
 * end to end (CLAUDE.md #1):
 *   - Dancing Imp (Inferno): free, swap one Statistic card (hand OR discard) for
 *     its same-type Empowered version.
 *   - Plane Between Planes (Fortress): Remove up to 2 cards from hand/discard.
 *   - Hero (Inferno, ongoing): during one chosen turn while the card is face
 *     up, pay 4 gold to empower a hand Statistic, up to twice that turn.
 *
 * Each test drives the real reward-queue / visit-step flow (RESOLVE_VISIT_STEP),
 * so deleting the wiring — the resolveAstrologersCard case, the Hero hand-card
 * action, or the EMPOWER_STATISTIC / REMOVE_UP_TO step handlers — makes a test fail.
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

type HeroEmpowerLegal = LegalAction & {
  action: Extract<GameAction, { type: "ASTROLOGERS_HERO_EMPOWER" }>;
};

function readyMapTurn(state: GameState, playerId: PlayerId): void {
  state.activePlayerId = playerId;
  state.phase = "player-turn";
  state.combat = null;
  state.pendingChoice = null;
  state.reactionWindow = null;
  state.adventure!.pendingVisit = null;
  state.adventure!.pendingTileChoice = null;
  state.adventure!.pendingNecromancy = null;
  state.adventure!.rewardQueue = [];
  state.players[playerId]!.canMulligan = false;
  state.players[playerId]!.needsHandRefresh = false;
}

function heroEmpowerActions(state: GameState, playerId: PlayerId): HeroEmpowerLegal[] {
  return getLegalActions(state, playerId).filter(
    (entry): entry is HeroEmpowerLegal => entry.action.type === "ASTROLOGERS_HERO_EMPOWER"
  );
}

function applyHeroEmpower(state: GameState, playerId: PlayerId, cardId: string): GameState {
  const legal = heroEmpowerActions(state, playerId).find((entry) => entry.action.cardId === cardId);
  expect(legal, `expected Hero empower action for ${cardId}`).toBeTruthy();
  const result = applyAction(state, legal!.action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
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

  it.each(["attack", "defense", "power", "knowledge"] as const)(
    "removes a discarded %s Statistic and gains its same-type Empowered card into HAND",
    (stat) => {
      const state = makeGame();
      const plainCardId = `stat.${stat}`;
      const empoweredCardId = `stat.${stat}.empowered`;
      state.players.p1.hand = ["spell.magic_arrow"];
      state.players.p1.discard = [plainCardId];
      state.players.p1.removed = [];
      state.players.p2.hand = [];
      state.players.p2.discard = [];
      state.decks.astrologers.drawPile = ["astrologers.dancing_imp"];

      drawAstrologersCard(state);
      pumpAdventureQueues(state);
      const next = chooseVisitOption(state, "p1", new RegExp(`Empower .* \\(discard\\)`));

      expect(next.players.p1.discard).not.toContain(plainCardId);
      expect(next.players.p1.removed).toContain(plainCardId);
      expect(next.players.p1.hand).toContain(empoweredCardId);
      expect(next.players.p1.discard).not.toContain(empoweredCardId);
      expect(next.players.p1.hand).toContain("spell.magic_arrow");
      expect(next.adventure?.pendingVisit).toBeNull();
    }
  );

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
      swiftWeaselUsedBy: [],
      heroEmpowerChosenRoundBy: {},
      heroEmpowerUsesBy: {}
    };
  }

  it("offers two 4-gold hand-statistic exchanges during the chosen turn, then stops", () => {
    const state = makeGame();
    setHeroActive(state);
    state.round = 2;
    readyMapTurn(state, "p1");
    state.players.p1.hand = ["stat.attack", "stat.power", "stat.defense", "ability.estates"];
    state.players.p1.discard = [];
    state.players.p1.removed = [];
    state.players.p1.resources.gold = 20;

    expect(state.adventure?.pendingVisit).toBeNull();
    expect(heroEmpowerActions(state, "p1").map((entry) => entry.action.cardId)).toEqual([
      "stat.attack",
      "stat.power",
      "stat.defense"
    ]);

    let s = applyHeroEmpower(state, "p1", "stat.attack");
    expect(s.players.p1.hand).toContain("stat.attack.empowered");
    expect(s.players.p1.hand).not.toContain("stat.attack");
    expect(s.players.p1.removed).toContain("stat.attack");
    expect(s.players.p1.resources.gold).toBe(16);
    expect(s.adventure?.astrologers?.heroEmpowerChosenRoundBy?.p1).toBe(2);
    expect(s.adventure?.astrologers?.heroEmpowerUsesBy?.p1).toBe(1);

    // The two exchanges do not have to be consecutive. A normal map action may
    // happen between them; the second Hero action remains available this turn.
    const estates = getLegalActions(s, "p1").find(
      (entry) => entry.action.type === "PLAY_CARD" && entry.action.cardId === "ability.estates"
    );
    expect(estates, "expected an unrelated map action between Hero exchanges").toBeTruthy();
    const afterAction = applyAction(s, estates!.action);
    expect(afterAction.errors, afterAction.errors.map((error) => error.message).join("; ")).toEqual([]);
    s = afterAction.state;
    expect(heroEmpowerActions(s, "p1").map((entry) => entry.action.cardId)).toEqual([
      "stat.power",
      "stat.defense"
    ]);

    const goldBeforeSecondExchange = s.players.p1.resources.gold;
    s = applyHeroEmpower(s, "p1", "stat.power");
    expect(s.players.p1.hand).toContain("stat.power.empowered");
    expect(s.players.p1.resources.gold).toBe(goldBeforeSecondExchange - 4);
    expect(s.adventure?.astrologers?.heroEmpowerUsesBy?.p1).toBe(2);

    // Capped at twice during the chosen turn: Defense is still in hand but no
    // third Hero exchange is legal.
    expect(s.players.p1.hand).toContain("stat.defense");
    expect(heroEmpowerActions(s, "p1")).toEqual([]);
  });

  it("is not offered when the player cannot afford the 4 gold", () => {
    const state = makeGame();
    setHeroActive(state);
    readyMapTurn(state, "p1");
    state.players.p1.hand = ["stat.attack"];
    state.players.p1.discard = [];
    state.players.p1.resources.gold = 3;

    expect(heroEmpowerActions(state, "p1")).toEqual([]);
  });

  it("only empowers from the hand, never the discard pile", () => {
    const state = makeGame();
    setHeroActive(state);
    readyMapTurn(state, "p1");
    state.players.p1.hand = ["spell.magic_arrow"];
    state.players.p1.discard = ["stat.defense"];
    state.players.p1.resources.gold = 20;

    expect(heroEmpowerActions(state, "p1")).toEqual([]);
  });

  it("appears only after the mandatory turn hand refresh is resolved", () => {
    const state = makeGame();
    setHeroActive(state);
    readyMapTurn(state, "p1");
    state.players.p1.hand = ["stat.attack"];
    state.players.p1.resources.gold = 20;
    state.players.p1.canMulligan = true;

    expect(heroEmpowerActions(state, "p1")).toEqual([]);

    const refreshed = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    expect(refreshed.errors, refreshed.errors.map((error) => error.message).join("; ")).toEqual([]);
    expect(heroEmpowerActions(refreshed.state, "p1").map((entry) => entry.action.cardId)).toContain("stat.attack");
  });

  it("lets each player choose the Astrologers-round turn or the next Resource-round turn, not both", () => {
    const state = makeGame();
    setHeroActive(state);
    state.round = 2;
    readyMapTurn(state, "p1");
    state.players.p1.hand = ["stat.attack", "stat.power"];
    state.players.p1.resources.gold = 20;

    const s = applyHeroEmpower(state, "p1", "stat.attack");

    // p1 chose the Astrologers-round turn, so the following Resource-round turn
    // is no longer available for this same face-up Hero card.
    s.round = 3;
    readyMapTurn(s, "p1");
    s.players.p1.hand.push("stat.defense");
    expect(heroEmpowerActions(s, "p1")).toEqual([]);

    // Another player who skipped their Astrologers-round turn may still choose
    // their Resource-round turn while the same Hero card remains face up.
    readyMapTurn(s, "p2");
    s.players.p2.hand = ["stat.defense"];
    s.players.p2.resources.gold = 20;
    expect(heroEmpowerActions(s, "p2").map((entry) => entry.action.cardId)).toEqual(["stat.defense"]);

    // If p1 had skipped round 2 instead, round 3 would be a legal chosen turn.
    const late = makeGame();
    setHeroActive(late);
    late.round = 3;
    readyMapTurn(late, "p1");
    late.players.p1.hand = ["stat.knowledge"];
    late.players.p1.resources.gold = 20;
    const usedLate = applyHeroEmpower(late, "p1", "stat.knowledge");
    expect(usedLate.players.p1.hand).toContain("stat.knowledge.empowered");
  });

  it("clamps stale paid Hero prompts to hand-only even if their saved sources include discard", () => {
    const state = makeGame();
    setHeroActive(state);
    state.players.p1.hand = ["stat.attack"];
    state.players.p1.discard = ["stat.defense"];
    state.players.p1.resources.gold = 20;
    state.adventure!.pendingVisit = {
      heroId: "hero_p1",
      playerId: "p1",
      fieldId: state.heroes.hero_p1.spaceId ?? "",
      steps: [
        {
          type: "STAT_EMPOWER_OFFER",
          sources: ["hand", "discard"],
          remaining: 1,
          costGold: 4,
          prompt: "Legacy Hero prompt"
        }
      ]
    };

    pumpAdventureQueues(state);

    const labels = visitOptionLabels(state, "p1");
    expect(labels.some((label) => /Pay 4 gold: Empower Attack \(hand\)/.test(label))).toBe(true);
    expect(labels.some((label) => /\(discard\)/.test(label))).toBe(false);
  });

  it("hides and rejects already-built stale paid discard-pile Hero options", () => {
    const state = makeGame();
    setHeroActive(state);
    state.players.p1.hand = ["stat.attack"];
    state.players.p1.discard = ["stat.defense"];
    state.players.p1.resources.gold = 20;
    state.adventure!.pendingVisit = {
      heroId: "hero_p1",
      playerId: "p1",
      fieldId: state.heroes.hero_p1.spaceId ?? "",
      steps: [
        {
          type: "CHOOSE_ONE",
          prompt: "Legacy Hero prompt",
          options: [
            {
              label: "Pay 4 gold: Empower Defense (discard)",
              steps: [{ type: "EMPOWER_STATISTIC", cardId: "stat.defense", source: "discard", costGold: 4 }]
            },
            {
              label: "Pay 4 gold: Empower Attack (hand)",
              steps: [{ type: "EMPOWER_STATISTIC", cardId: "stat.attack", source: "hand", costGold: 4 }]
            },
            { label: "Done", steps: [] }
          ]
        }
      ]
    };

    const labels = visitOptionLabels(state, "p1");
    expect(labels).not.toContain("Pay 4 gold: Empower Defense (discard)");
    expect(labels).toContain("Pay 4 gold: Empower Attack (hand)");

    const rejected = applyAction(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    expect(rejected.errors[0]?.message).toBe("Choose one of the printed options.");
    expect(rejected.state.players.p1.resources.gold).toBe(20);
    expect(rejected.state.players.p1.discard).toEqual(["stat.defense"]);
  });

  it("ignores stale paid discard-pile empower leaves without spending gold or moving the card", () => {
    const state = makeGame();
    setHeroActive(state);
    state.players.p1.hand = [];
    state.players.p1.discard = ["stat.defense"];
    state.players.p1.removed = [];
    state.players.p1.resources.gold = 20;
    state.adventure!.pendingVisit = {
      heroId: "hero_p1",
      playerId: "p1",
      fieldId: state.heroes.hero_p1.spaceId ?? "",
      steps: [{ type: "EMPOWER_STATISTIC", cardId: "stat.defense", source: "discard", costGold: 4 }]
    };

    pumpAdventureQueues(state);

    expect(state.players.p1.resources.gold).toBe(20);
    expect(state.players.p1.discard).toEqual(["stat.defense"]);
    expect(state.players.p1.hand).toEqual([]);
    expect(state.players.p1.removed).toEqual([]);
    expect(state.adventure?.pendingVisit).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import type { GameState, MapFieldState, VisitStep } from "./state";
import { beginFieldVisit, getMainHero } from "./adventure";
import { pumpAdventureQueues, resolveVisitStep } from "./adventure-reducer";
import { createAdventureGameState } from "./index";

// The two Shrines of Magic look almost identical but differ on price:
//   - Shrine of Magic GESTURE is FREE: Search(2) the Spell deck.
//   - Shrine of Magic INCANTATION COSTS 3 gold to Search(2) the Spell deck.
// (The homm3bg wiki has these two swapped; the physical board game charges at
// Incantation, not Gesture.) These tests fail if the costs are swapped back.

function makeGame(): GameState {
  return createAdventureGameState({ seed: "shrine", difficulty: "normal", rollFirstPlayer: false });
}

function injectShrine(state: GameState, location: string): MapFieldState {
  const field: MapFieldState = {
    spaceId: "50,50",
    tileInstanceId: "shrine-tile",
    slot: 0,
    location,
    difficulty: undefined,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[field.spaceId] = field;
  const hero = getMainHero(state, "p1")!;
  hero.spaceId = field.spaceId;
  return field;
}

function spellSearchQueued(state: GameState): boolean {
  return (state.adventure?.rewardQueue ?? []).some(
    (reward) => reward.kind === "shared-deck-search" && reward.deckId === "spells"
  );
}

describe("Shrine of Magic costs", () => {
  it("Astrologers Spells widens a map-object Spell Search to Search(4)", () => {
    const state = makeGame();
    state.adventure!.astrologers = {
      activeCardId: "astrologers.spells",
      nextResourceModifiers: { gold: 0, valuables: 0 },
      crazyWizardUsedBy: [],
      swiftWeaselUsedBy: [],
    };
    state.players.p1.hand = [];
    state.players.p1.deck = [];
    state.players.p1.discard = [];
    state.decks.spells!.drawPile = [
      "spell.bless",
      "spell.haste",
      "spell.curse",
      "spell.slow",
      "spell.bloodlust",
    ];
    state.decks.spells!.discardPile = [];
    injectShrine(state, "shrine_of_magic_gesture");

    beginFieldVisit(state, getMainHero(state, "p1")!.id, "50,50", false);
    pumpAdventureQueues(state);

    expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
    expect(
      state.pendingChoice?.type === "DECK_SEARCH" ? state.pendingChoice.revealedCardIds : [],
    ).toHaveLength(4);
  });

  it("Gesture is FREE — no payment gate, the Spell search starts immediately", () => {
    const state = makeGame();
    const goldBefore = state.players.p1.resources.gold;
    injectShrine(state, "shrine_of_magic_gesture");

    beginFieldVisit(state, getMainHero(state, "p1")!.id, "50,50", false);

    // No PAY_TO step is interposed; the free Search(2) is queued right away.
    expect(state.adventure!.pendingVisit).toBeNull();
    expect(spellSearchQueued(state)).toBe(true);
    expect(state.players.p1.resources.gold).toBe(goldBefore);
  });

  it("Incantation COSTS 3 gold — visiting opens a PAY_TO(3 gold) gate before the search", () => {
    const state = makeGame();
    state.players.p1.resources.gold = 10;
    injectShrine(state, "shrine_of_magic_incantation");

    beginFieldVisit(state, getMainHero(state, "p1")!.id, "50,50", false);

    const step = state.adventure!.pendingVisit?.steps[0] as Extract<VisitStep, { type: "PAY_TO" }> | undefined;
    expect(step?.type).toBe("PAY_TO");
    expect(step?.costOptions).toEqual([{ gold: 3 }]);
    // The Spell search has NOT happened yet — payment must come first.
    expect(spellSearchQueued(state)).toBe(false);
    expect(state.players.p1.resources.gold).toBe(10);
  });

  it("Incantation: paying the 3 gold then queues the Spell search", () => {
    const state = makeGame();
    state.players.p1.resources.gold = 10;
    injectShrine(state, "shrine_of_magic_incantation");

    beginFieldVisit(state, getMainHero(state, "p1")!.id, "50,50", false);
    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });

    expect(state.players.p1.resources.gold).toBe(7);
    expect(spellSearchQueued(state) || state.pendingChoice !== null).toBe(true);
  });

  it("Incantation: declining the payment skips the Spell search and costs nothing", () => {
    const state = makeGame();
    state.players.p1.resources.gold = 10;
    injectShrine(state, "shrine_of_magic_incantation");

    beginFieldVisit(state, getMainHero(state, "p1")!.id, "50,50", false);
    resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", decline: true });

    expect(state.players.p1.resources.gold).toBe(10);
    expect(spellSearchQueued(state)).toBe(false);
    expect(state.adventure!.pendingVisit).toBeNull();
  });
});

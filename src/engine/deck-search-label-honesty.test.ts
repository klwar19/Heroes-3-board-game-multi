import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, type GameState } from "./index";
import { getMainHero, grantCreatureBankReward } from "./adventure";
import { openSharedDeckSearch, pumpAdventureQueues } from "./adventure-reducer";
import { activeSchoolFetches } from "./ruleset";

/**
 * Regression cover for the reported bug: a Derelict Ship (4× Water Elementals)
 * bank win at Polish size Ⅱ offered a Spell "Search (2)" tile that then peeked 3
 * cards. The bank count itself is HONEST (X = Stacked defenders = size), so these
 * pin that chain as a CONTROL; the real defect was the deck-search menu LABEL not
 * showing a standing Scouting override — fixed so label == reveal.
 */

/** Empty p1 so it owns no spell (nothing is redrawn past / dedup-blocked). */
function cleanSpellSlate(state: GameState): void {
  state.activePlayerId = "p1";
  state.players.p1.hand = [];
  state.players.p1.deck = [];
  state.players.p1.discard = [];
  state.players.p1.spellBook = [];
}

const FIVE_SPELLS = ["spell.haste", "spell.bloodlust", "spell.stone_skin", "spell.curse", "spell.slow"];

/** A pre-played (basic) Scouting whose SEARCH_COUNT_OVERRIDE(3) still lingers. */
function pushScoutingOverride(state: GameState, count: number, name = "Scouting"): void {
  state.activeEffects.push({
    id: `effect_${name.replace(/\s+/g, "_")}`,
    name,
    scope: "player",
    duration: { type: "current-turn" },
    polarity: "positive",
    removable: false,
    modifiers: [{ type: "SEARCH_COUNT_OVERRIDE", count }],
    source: { type: "system" },
    controllerId: "p1",
    startedRound: state.round,
    usedRollEventIds: [],
    usedChoiceIds: [],
    usedCombatRoundNumbers: []
  });
}

describe("Creature Bank Spell search — count is X (Stacked defenders), reveal matches", () => {
  function derelictShipState(seed: string): { state: GameState; heroId: string; fieldId: string } {
    const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
    cleanSpellSlate(state);
    const hero = getMainHero(state, "p1")!;
    const fieldId = hero.spaceId!;
    const field = state.adventure!.fields[fieldId];
    field.location = "creature_bank";
    field.bankId = "derelict_ship";
    state.decks.spells.drawPile = [...FIVE_SPELLS];
    // Empty discard → the Search reveals directly (no take-discard/fetch menu).
    state.decks.spells.discardPile = [];
    return { state, heroId: hero.id, fieldId };
  }

  it("size Ⅱ (X = 2) reveals EXACTLY 2 Spell cards — the reported search that must not be 3", () => {
    const { state, heroId, fieldId } = derelictShipState("derelict-size-2");
    grantCreatureBankReward(state, heroId, fieldId, 2);
    pumpAdventureQueues(state);

    expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
    if (state.pendingChoice?.type !== "DECK_SEARCH") {
      throw new Error("expected the bank Spell Search to open");
    }
    expect(state.pendingChoice.deckId).toBe("spells");
    // The load-bearing link the bug blamed: X (Stacked count) flows all the way
    // to the reveal size. Under Polish Bank Sizes bankStackCount == the rolled
    // size (pinned in polish-bank-sizes.test.ts), so size Ⅱ → Search (2) → 2.
    expect(state.pendingChoice.revealedCardIds).toHaveLength(2);
  });

  it("X == Stacked count: a 3-Stacked win reveals 3 (mutation control on the reward scaling)", () => {
    const { state, heroId, fieldId } = derelictShipState("derelict-size-3");
    grantCreatureBankReward(state, heroId, fieldId, 3);
    pumpAdventureQueues(state);

    expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
    if (state.pendingChoice?.type !== "DECK_SEARCH") {
      throw new Error("expected the bank Spell Search to open");
    }
    expect(state.pendingChoice.revealedCardIds).toHaveLength(3);
  });
});

describe("Deck-search menu label — HONEST about a standing Scouting override", () => {
  /** Open the Search-or-take-discard menu on the Spell deck (an acquirable discard). */
  function openMenu(seed: string, setup?: (state: GameState) => void): GameState {
    const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
    cleanSpellSlate(state);
    // An acquirable spell in the discard forces the up-front deck-search-mode menu.
    state.decks.spells.discardPile = ["spell.haste"];
    state.decks.spells.drawPile = ["spell.bloodlust", "spell.stone_skin", "spell.curse", "spell.slow", "spell.frost_ring"];
    setup?.(state);
    openSharedDeckSearch(state, "p1", "spells", 2);
    return state;
  }

  it("no override: the Search tile reads the base count (control)", () => {
    const state = openMenu("label-base");
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (state.pendingChoice?.type !== "OPTION_CHOICE") {
      throw new Error("expected the deck-search-mode menu");
    }
    expect(state.pendingChoice.context).toBe("deck-search-mode");
    expect(state.pendingChoice.options[0].label).toBe("Search (2) — look at the top cards and keep one");
  });

  it("standing Scouting override: the tile shows the EFFECTIVE 3 with its source, and the Search reveals 3", () => {
    const state = openMenu("label-override", (s) => pushScoutingOverride(s, 3));
    if (state.pendingChoice?.type !== "OPTION_CHOICE") {
      throw new Error("expected the deck-search-mode menu");
    }
    // The fix: the label names the widened count + source instead of a bare
    // "Search (2)" that then peeks 3 (the exact user-visible dishonesty).
    expect(state.pendingChoice.options[0].label).toBe("Search (3) — Scouting override (base 2)");

    // Committing to the Search consumes the override and reveals 3 — label == reveal.
    const choiceId = state.pendingChoice.id;
    const after = applyAction(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId, optionIndex: 0 });
    expect(after.errors).toEqual([]);
    expect(after.state.pendingChoice?.type).toBe("DECK_SEARCH");
    if (after.state.pendingChoice?.type === "DECK_SEARCH") {
      expect(after.state.pendingChoice.revealedCardIds).toHaveLength(3);
    }
  });

  it("Astrologers 'Spells' widen keeps label == reveal WITHOUT an 'override' note (control)", () => {
    const state = openMenu("label-astrologers", (s) => {
      s.adventure!.astrologers = {
        activeCardId: "astrologers.spells", // SPELL_SEARCH_WIDEN count 4
        nextResourceModifiers: { gold: 0, valuables: 0 },
        crazyWizardUsedBy: [],
        swiftWeaselUsedBy: []
      };
    });
    if (state.pendingChoice?.type !== "OPTION_CHOICE") {
      throw new Error("expected the deck-search-mode menu");
    }
    // baseCount is bumped to 4 up front, so the label is honest as the plain
    // base-count phrasing — NOT the override phrasing (no SEARCH_COUNT_OVERRIDE).
    expect(state.pendingChoice.options[0].label).toBe("Search (4) — look at the top cards and keep one");
    expect(state.pendingChoice.options[0].label).not.toMatch(/override/i);

    const choiceId = state.pendingChoice.id;
    const after = applyAction(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId, optionIndex: 0 });
    if (after.state.pendingChoice?.type === "DECK_SEARCH") {
      expect(after.state.pendingChoice.revealedCardIds).toHaveLength(4);
    }
  });
});

describe("School-of-Magic fetch is the SEARCHER's own — never an opponent's permanent", () => {
  it("an opponent's Basic Fire Magic offers this searcher no fetch (controller scoping)", () => {
    const state = createAdventureGameState({ seed: "fetch-controller", difficulty: "normal", rollFirstPlayer: false });
    // p2 holds Basic Fire Magic in its permanent slot; p1 holds none.
    state.players.p2.permanents = ["ability.basic_fire_magic"];

    // The searcher (p1) is offered nothing; the owner (p2) IS — positive control.
    expect(activeSchoolFetches(state, "p1")).not.toContain("fire");
    expect(activeSchoolFetches(state, "p1")).toHaveLength(0);
    expect(activeSchoolFetches(state, "p2")).toContain("fire");
  });
});

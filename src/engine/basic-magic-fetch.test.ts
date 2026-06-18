import { describe, expect, it } from "vitest";
import { applyAction, getLegalActions } from "./index";
import { createInitialGameState } from "./setup";
import { cardLibrary } from "@/data/cards/library";
import { EXPERT_SPELL_KEY_CARDS } from "./ruleset";
import type { ActiveEffectState, GameAction, GameState, PlayerId, SpellSchool } from "./state";

/**
 * Basic X Magic — the in-play spell-fetch permanent. "Instead of Searching the
 * Spell deck, find the first <School> Magic spell in it and take it into your
 * hand." The choice is offered UP FRONT (before any card is revealed): Search
 * the deck, or draw from a School of Magic. Drawing takes the first matching
 * spell straight into hand — you keep what you get. Both the up-front choice and
 * the auto-take are engine-enforced here.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function pushFetch(state: GameState, playerId: PlayerId, school: Exclude<SpellSchool, "any">): void {
  state.activeEffects.push({
    id: `fetch_${school}`,
    name: `Basic ${school} Magic`,
    scope: "player",
    duration: { type: "permanent" },
    polarity: "positive",
    removable: false,
    modifiers: [{ type: "SPELL_SCHOOL_FETCH", school }],
    source: { type: "card", cardId: `ability.basic_${school}_magic`, controllerId: playerId },
    controllerId: playerId,
    startedRound: state.round,
    startedCombatRound: state.combat?.round ?? 0,
    usedRollEventIds: [],
    usedChoiceIds: [],
    usedCombatRoundNumbers: []
  } satisfies ActiveEffectState);
}

const deckCount = (state: GameState, deckId: string) =>
  state.decks[deckId].drawPile.length + state.decks[deckId].discardPile.length;

describe("Basic X Magic — draw from a School of Magic instead of Searching", () => {
  it("offers an up-front Search-vs-Draw choice and takes the drawn spell straight into hand", () => {
    const state = createInitialGameState("fetch-search");
    state.activePlayerId = "p1";
    state.players.p1.hand = [];
    pushFetch(state, "p1", "air");
    // One Air spell (Haste), the rest Earth (Slow): only Haste matches Air.
    state.decks["spells"].drawPile = ["spell.haste", "spell.slow", "spell.slow", "spell.slow"];
    state.decks["spells"].discardPile = [];

    const searched = applyOk(state, { type: "SEARCH_DECK", playerId: "p1", deckId: "spells", count: 2 });

    // Up front — no cards revealed yet — the choice is Search OR draw from a School.
    expect(searched.pendingChoice?.type).toBe("OPTION_CHOICE");
    expect(searched.pendingChoice?.type === "OPTION_CHOICE" ? searched.pendingChoice.context : "").toBe(
      "deck-search-mode"
    );

    const options = getLegalActions(searched, "p1").filter((legal) => legal.action.type === "CHOOSE_OPTION");
    const searchOption = options.find((legal) => legal.action.type === "CHOOSE_OPTION" && legal.action.optionIndex === 0);
    const drawAir = options.find((legal) => /Air Magic/i.test(legal.label));
    expect(searchOption, "a plain Search option should be offered").toBeTruthy();
    expect(drawAir, "a 'Draw the first Air Magic spell' option should be offered up front").toBeTruthy();

    const before = deckCount(searched, "spells");

    // Draw from the School of Magic: take the first Air spell into hand. No reveal,
    // no keep/discard — the spell deck shrank by exactly that one card.
    const drawn = applyOk(searched, drawAir!.action);
    expect(drawn.pendingChoice).toBeNull();
    expect(drawn.players.p1.hand).toEqual(["spell.haste"]);
    expect((cardLibrary["spell.haste"]?.spellSchools ?? []).includes("air")).toBe(true);
    expect(deckCount(drawn, "spells")).toBe(before - 1);
    expect(drawn.decks["spells"].drawPile).not.toContain("spell.haste");
  });

  it("Search (the other branch) reveals the top cards to keep one — and the picks never include a fetch", () => {
    const state = createInitialGameState("fetch-search-branch");
    state.activePlayerId = "p1";
    state.players.p1.hand = [];
    pushFetch(state, "p1", "air");
    state.decks["spells"].drawPile = ["spell.haste", "spell.slow", "spell.slow", "spell.slow"];
    state.decks["spells"].discardPile = [];

    const searched = applyOk(state, { type: "SEARCH_DECK", playerId: "p1", deckId: "spells", count: 2 });
    const searchOption = getLegalActions(searched, "p1").find(
      (legal) => legal.action.type === "CHOOSE_OPTION" && legal.action.optionIndex === 0
    );
    expect(searchOption).toBeTruthy();

    const revealed = applyOk(searched, searchOption!.action);
    expect(revealed.pendingChoice?.type).toBe("DECK_SEARCH");
    const picks = getLegalActions(revealed, "p1").filter((legal) => legal.action.type === "RESOLVE_DECK_SEARCH");
    expect(picks.length).toBeGreaterThan(0);
    expect(
      picks.every((legal) => legal.action.type === "RESOLVE_DECK_SEARCH" && legal.action.pick.kind === "revealed")
    ).toBe(true);
  });

  it("counts each Basic X Magic as an Expert-spell key card, so a buy offers the basic-or-expert deck pick", () => {
    // The Mage-Guild purchase deducts gold and (with a key card owned) raises a
    // basic/expert deck pick before the search — see ruleset.test.ts. This pins
    // that every Basic X Magic is one of those key cards.
    for (const school of ["air", "earth", "fire", "water"] as const) {
      expect(EXPERT_SPELL_KEY_CARDS).toContain(`ability.basic_${school}_magic`);
    }
  });

  it("offers no Draw option when no Basic X Magic is in play (straight to the reveal)", () => {
    const state = createInitialGameState("fetch-none");
    state.activePlayerId = "p1";
    state.players.p1.hand = [];
    state.decks["spells"].drawPile = ["spell.haste", "spell.slow", "spell.slow"];
    state.decks["spells"].discardPile = [];

    const searched = applyOk(state, { type: "SEARCH_DECK", playerId: "p1", deckId: "spells", count: 2 });
    // No fetch and no discard top: nothing to choose up front, so it reveals.
    expect(searched.pendingChoice?.type).toBe("DECK_SEARCH");
  });
});

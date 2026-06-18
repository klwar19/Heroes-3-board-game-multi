import { describe, expect, it } from "vitest";
import { applyAction, getLegalActions } from "./index";
import { createInitialGameState } from "./setup";
import { cardLibrary } from "@/data/cards/library";
import { EXPERT_SPELL_KEY_CARDS } from "./ruleset";
import type { ActiveEffectState, GameAction, GameState, PlayerId, SpellSchool } from "./state";

/**
 * Basic X Magic — the in-play spell-fetch permanent — lets a Spell-deck search
 * "draw from the School of Magic" instead of keeping a revealed card: it returns
 * the revealed cards, takes the deck's first spell of that school, and reshuffles.
 * Both the legal-action offer and the resolution are engine-enforced here (remove
 * either and a test below fails).
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

describe("Basic X Magic — School of Magic fetch when searching the Spell deck", () => {
  it("offers the fetch beside keeping a revealed card, and takes the first matching spell", () => {
    const state = createInitialGameState("fetch-search");
    state.activePlayerId = "p1";
    state.players.p1.hand = [];
    pushFetch(state, "p1", "air");
    // One Air spell (Haste) at the bottom, the rest Earth (Slow) so the fetch is
    // deterministic: only Haste matches the Air school.
    state.decks["spells"].drawPile = ["spell.haste", "spell.slow", "spell.slow", "spell.slow"];
    state.decks["spells"].discardPile = [];

    const searched = applyOk(state, { type: "SEARCH_DECK", playerId: "p1", deckId: "spells", count: 2 });
    expect(searched.pendingChoice?.type).toBe("DECK_SEARCH");
    expect(searched.pendingChoice?.type === "DECK_SEARCH" ? searched.pendingChoice.schoolFetch : undefined).toContain(
      "air"
    );

    // "Draw from the School of Magic" is a real, separate legal action — not just
    // the keep-one-revealed picks.
    const keepPicks = getLegalActions(searched, "p1").filter(
      (legal) => legal.action.type === "RESOLVE_DECK_SEARCH" && legal.action.pick.kind === "revealed"
    );
    expect(keepPicks.length).toBeGreaterThan(0);
    const fetch = getLegalActions(searched, "p1").find(
      (legal) =>
        legal.action.type === "RESOLVE_DECK_SEARCH" &&
        legal.action.pick.kind === "school-fetch" &&
        legal.action.pick.school === "air"
    );
    expect(fetch, "the school-fetch pick must be offered as a legal action").toBeTruthy();

    const revealedCount =
      searched.pendingChoice?.type === "DECK_SEARCH" ? searched.pendingChoice.revealedCardIds.length : 0;
    const deckBefore = searched.decks["spells"].drawPile.length + revealedCount;

    // The fetch finds the first Air spell and reshuffles — but does NOT auto-keep
    // it: a take/discard choice opens, and the spell is not in hand yet.
    const drawn = applyOk(searched, fetch!.action);
    expect(drawn.pendingChoice?.type).toBe("OPTION_CHOICE");
    expect(drawn.players.p1.hand).toEqual([]);
    expect(drawn.decks["spells"].drawPile.length).toBe(deckBefore - 1);
    expect(drawn.decks["spells"].drawPile).not.toContain("spell.haste");

    // Keep it (option 0) -> the Air spell goes to hand, nothing discarded.
    const keep = getLegalActions(drawn, "p1").find(
      (legal) => legal.action.type === "CHOOSE_OPTION" && legal.action.optionIndex === 0
    );
    expect(keep, "a 'take into hand' option should be offered").toBeTruthy();
    const kept = applyOk(drawn, keep!.action);
    expect(kept.players.p1.hand).toEqual(["spell.haste"]);
    expect((cardLibrary["spell.haste"]?.spellSchools ?? []).includes("air")).toBe(true);
    expect(kept.decks["spells"].discardPile).toEqual([]);
  });

  it("lets the player discard the drawn spell instead of keeping it", () => {
    const state = createInitialGameState("fetch-discard");
    state.activePlayerId = "p1";
    state.players.p1.hand = [];
    pushFetch(state, "p1", "air");
    state.decks["spells"].drawPile = ["spell.haste", "spell.slow", "spell.slow", "spell.slow"];
    state.decks["spells"].discardPile = [];

    const searched = applyOk(state, { type: "SEARCH_DECK", playerId: "p1", deckId: "spells", count: 2 });
    const fetch = getLegalActions(searched, "p1").find(
      (legal) =>
        legal.action.type === "RESOLVE_DECK_SEARCH" &&
        legal.action.pick.kind === "school-fetch" &&
        legal.action.pick.school === "air"
    );
    const drawn = applyOk(searched, fetch!.action);

    // Decline it (option 1) -> the spell goes to the deck's discard pile, hand empty.
    const discard = getLegalActions(drawn, "p1").find(
      (legal) => legal.action.type === "CHOOSE_OPTION" && legal.action.optionIndex === 1
    );
    expect(discard, "a 'discard it' option should be offered").toBeTruthy();
    const tossed = applyOk(drawn, discard!.action);
    expect(tossed.players.p1.hand).toEqual([]);
    expect(tossed.decks["spells"].discardPile).toContain("spell.haste");
  });

  it("counts each Basic X Magic as an Expert-spell key card, so a buy offers the basic-or-expert deck pick", () => {
    // The Mage-Guild purchase already deducts gold and (with a key card owned)
    // raises a basic/expert deck pick before the search — see ruleset.test.ts.
    // This pins that every Basic X Magic is one of those key cards.
    for (const school of ["air", "earth", "fire", "water"] as const) {
      expect(EXPERT_SPELL_KEY_CARDS).toContain(`ability.basic_${school}_magic`);
    }
  });

  it("does not offer a fetch when no Basic X Magic is in play (keep-one only)", () => {
    const state = createInitialGameState("fetch-none");
    state.activePlayerId = "p1";
    state.players.p1.hand = [];
    state.decks["spells"].drawPile = ["spell.haste", "spell.slow", "spell.slow"];
    state.decks["spells"].discardPile = [];

    const searched = applyOk(state, { type: "SEARCH_DECK", playerId: "p1", deckId: "spells", count: 2 });
    const fetch = getLegalActions(searched, "p1").find(
      (legal) => legal.action.type === "RESOLVE_DECK_SEARCH" && legal.action.pick.kind === "school-fetch"
    );
    expect(fetch, "no fetch without a Basic X Magic in play").toBeFalsy();
  });
});

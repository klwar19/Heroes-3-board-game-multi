import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, type GameAction, type GameState } from "./index";
import { openSharedDeckSearch } from "./adventure-reducer";

/**
 * Spell decks behave like EVERY other deck: a Search offers at most ONE take —
 * the face-up TOP discard — never a "pick any discarded spell" menu. The
 * invented any-discard-take + face-up-top-pick feature (commit ef3b0ac) was
 * reverted per the explicit 2026-07-21 user demand ("HOW can there be 3 'take
 * discard' options? … I NEVER WANT THIS"). These pin the classic top-only take
 * back, with the buried-card CONTROL as the mutation guard.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
  return result.state;
}

/** Empty p1 so it owns no spell — every seeded discard is genuinely acquirable
 *  (so the ONLY reason a buried card is not offered is the top-only rule). */
function cleanSpellSlate(state: GameState): void {
  state.activePlayerId = "p1";
  state.players.p1.hand = [];
  state.players.p1.deck = [];
  state.players.p1.discard = [];
  state.players.p1.spellBook = [];
}

describe("Spell search — the classic single top-only discard take (any-discard feature reverted)", () => {
  it("offers EXACTLY ONE take — the face-up top — even with several acquirable discards (CONTROL: buried cards are NOT offered)", () => {
    const state = createAdventureGameState({ seed: "spell-top-only", difficulty: "normal", rollFirstPlayer: false });
    cleanSpellSlate(state);
    // Three acquirable spells; Curse is the face-up top (last element).
    state.decks.spells.discardPile = ["spell.bless", "spell.haste", "spell.curse"];
    state.decks.spells.drawPile = ["spell.slow", "spell.bloodlust"];

    openSharedDeckSearch(state, "p1", "spells", 2);

    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (state.pendingChoice?.type !== "OPTION_CHOICE") {
      throw new Error("expected deck-search-mode");
    }
    expect(state.pendingChoice.context).toBe("deck-search-mode");
    const labels = state.pendingChoice.options.map((o) => o.label);
    expect(labels[0]).toMatch(/Search \(2\)/);
    // Exactly ONE take option, and it is the TOP (Curse) — never a per-card menu.
    const takes = labels.filter((l) => /^Take/i.test(l));
    expect(takes).toHaveLength(1);
    expect(takes[0]).toMatch(/Curse/i);
    // CONTROL: the buried acquirable spells (Bless, Haste) are NOT offered.
    expect(labels.some((l) => /^Take.*Bless/i.test(l))).toBe(false);
    expect(labels.some((l) => /^Take.*Haste/i.test(l))).toBe(false);
    expect(state.pendingChoice.deckSearchMode?.hasDiscardTop).toBe(true);
  });

  it("taking the top discard puts THAT card (the top) in hand and removes it from the discard", () => {
    const state = createAdventureGameState({ seed: "spell-take-top", difficulty: "normal", rollFirstPlayer: false });
    cleanSpellSlate(state);
    state.decks.spells.discardPile = ["spell.bless", "spell.haste", "spell.curse"];
    state.decks.spells.drawPile = ["spell.slow", "spell.bloodlust"];

    openSharedDeckSearch(state, "p1", "spells", 2);
    if (state.pendingChoice?.type !== "OPTION_CHOICE") {
      throw new Error("expected deck-search-mode");
    }
    const takeIndex = state.pendingChoice.options.findIndex((o) => /^Take/i.test(o.label));
    expect(takeIndex).toBe(1);

    const after = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice.id,
      optionIndex: takeIndex
    });
    // The face-up top (Curse) is taken; the buried cards stay in the discard.
    expect(after.players.p1.hand).toContain("spell.curse");
    expect(after.decks.spells.discardPile).not.toContain("spell.curse");
    expect(after.decks.spells.discardPile).toEqual(expect.arrayContaining(["spell.bless", "spell.haste"]));
  });

  it("the School-of-Magic fetch is STILL offered alongside the single top-only take", () => {
    const state = createAdventureGameState({ seed: "spell-top-and-fetch", difficulty: "normal", rollFirstPlayer: false });
    cleanSpellSlate(state);
    // A Basic Fire Magic permanent grants the "draw the first Fire spell" fetch.
    state.players.p1.permanents = ["ability.basic_fire_magic"];
    state.decks.spells.discardPile = ["spell.bless", "spell.curse"];
    state.decks.spells.drawPile = ["spell.slow", "spell.bloodlust"];

    openSharedDeckSearch(state, "p1", "spells", 2);
    if (state.pendingChoice?.type !== "OPTION_CHOICE") {
      throw new Error("expected deck-search-mode");
    }
    const labels = state.pendingChoice.options.map((o) => o.label);
    // Search + one top-discard take + the Fire fetch — no per-card discard menu.
    expect(labels.filter((l) => /^Take the top discard/i.test(l))).toHaveLength(1);
    expect(labels.some((l) => /Fire Magic spell/i.test(l))).toBe(true);
    expect(state.pendingChoice.deckSearchMode?.schoolFetch).toEqual(["fire"]);
  });

  it("still resolves an IN-FLIGHT legacy spell-discard-top choice (never opened anymore, but a live room could hold one when the server updates)", () => {
    const state = createAdventureGameState({
      seed: "legacy-spell-discard-top",
      difficulty: "normal",
      rollFirstPlayer: false
    });
    cleanSpellSlate(state);
    state.decks.spells.discardPile = [];
    // Hand-craft the legacy choice exactly as ef3b0ac used to open it.
    state.pendingChoice = {
      id: "choice_legacy",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "Which unkept spell sits face-up on the discard pile?",
      options: [{ label: "Face-up: Bless" }, { label: "Face-up: Curse" }],
      context: "spell-discard-top",
      spellDiscardTopPick: { deckId: "spells", cardIds: ["spell.bless", "spell.curse"], baseCount: 2 },
      returnPhase: "player-turn"
    };
    state.phase = "choice";
    state.priorityPlayerId = "p1";

    const after = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: "choice_legacy",
      optionIndex: 1
    });
    const discard = after.decks.spells.discardPile;
    // The chosen card (Curse) sits face-up on top; the other is under it — the
    // legacy handler still places the parked cards and closes the choice.
    expect(discard[discard.length - 1], "chosen card face-up on top").toBe("spell.curse");
    expect(discard).toContain("spell.bless");
    expect(discard).toHaveLength(2);
    expect(after.pendingChoice).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import type { GameAction, GameState } from "./state";

/**
 * Spellbinder's Hat (Relic). Both sides driven through the real engine as MAP
 * plays here; the mid-combat plays of the same sides are pinned in
 * instant-artifacts-combat.test.ts. Each test fails if the wiring is removed.
 *
 *   • Option A — "Remove 1 card from your hand, then Search(2) the card's deck":
 *     the Hat discards, the player removes one ability/artifact/spell from hand,
 *     and a Search(2) of THAT card's deck is queued. Statistics/specialties are
 *     never offered (no deck to dig).
 *   • Option B — "Remove this card and another one from your hand or discard
 *     pile": the Hat removes itself and the player removes one more card, which
 *     may come from hand OR the discard pile.
 */

const HAT = "artifact.spellbinders_hat";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function findPlay(state: GameState, cardId: string, optionIndex: number) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      legal.action.optionIndex === optionIndex
  );
}

/** All RESOLVE_VISIT_STEP buttons currently offered to p1. */
function visitSteps(state: GameState): { label: string; action: GameAction }[] {
  return getLegalActions(state, "p1")
    .filter((legal) => legal.action.type === "RESOLVE_VISIT_STEP")
    .map((legal) => ({ label: legal.label, action: legal.action }));
}

function adventureState(seed: string): GameState {
  const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
  state.activePlayerId = "p1";
  state.players.p1.removed = [];
  return state;
}

describe("Spellbinder's Hat — option A (remove a card, Search its deck)", () => {
  it("discards the Hat, removes a chosen Spell, and queues a Spell-deck Search(2)", () => {
    const state = adventureState("hat-search-spell");
    state.players.p1.hand = [HAT, "spell.magic_arrow", "stat.attack"];
    // Isolate the queued Spell-deck Search from the first-round face-up seed on
    // the Spell discards, so it opens straight onto its DECK_SEARCH reveal
    // instead of the incidental "Search, or take the top discard?" mode prompt.
    state.decks.spells.discardPile = [];
    if (state.decks["spells-expert"]) {
      state.decks["spells-expert"].discardPile = [];
    }

    const play = findPlay(state, HAT, 0);
    expect(play, "option A should be offered on the map with a removable card in hand").toBeTruthy();
    const after = applyOk(state, play!.action);

    // The Hat itself goes to the discard pile (it is NOT removed on this side).
    expect(after.players.p1.discard).toContain(HAT);
    expect(after.players.p1.removed).not.toContain(HAT);

    // A REMOVE_HAND_CARD step is open; only the Spell is removable (a Statistic
    // has no deck to dig, so it must not be offered).
    const steps = visitSteps(after);
    const removeLabels = steps.filter((s) => s.label.startsWith("Remove ")).map((s) => s.label);
    expect(removeLabels.some((label) => label.includes("Magic Arrow"))).toBe(true);
    expect(removeLabels.some((label) => label.toLowerCase().includes("attack"))).toBe(false);

    // Remove the Spell → it leaves the game and a Spell-deck Search is started.
    const removeSpell = steps.find((s) => s.label.includes("Magic Arrow"));
    const resolved = applyOk(after, removeSpell!.action);
    expect(resolved.players.p1.removed).toContain("spell.magic_arrow");

    const choice = resolved.pendingChoice;
    const searchingSpells =
      Boolean(
        resolved.adventure?.rewardQueue.some(
          (reward) => reward.kind === "shared-deck-search" && reward.deckId === "spells"
        )
      ) ||
      choice?.type === "DECK_SEARCH" ||
      Boolean(choice && "deckPick" in choice && choice.deckPick);
    expect(searchingSpells, "a Spell-deck Search should be queued or open").toBe(true);
  });

  it("is not offered when the hand holds no removable (ability/artifact/spell) card", () => {
    const state = adventureState("hat-no-removable");
    // Only the Hat plus Statistics — nothing with a deck to dig once the Hat is
    // discarded, so option A has nothing to remove.
    state.players.p1.hand = [HAT, "stat.attack", "stat.defense"];
    expect(findPlay(state, HAT, 0)).toBeFalsy();
  });
});

describe("Spellbinder's Hat — option B (remove the Hat and another card)", () => {
  it("removes the Hat and a chosen card taken from the discard pile", () => {
    const state = adventureState("hat-remove-discard");
    state.players.p1.hand = [HAT, "stat.attack"];
    state.players.p1.discard = ["spell.magic_arrow"];

    const play = findPlay(state, HAT, 1);
    expect(play, "option B should be offered on the map").toBeTruthy();
    const after = applyOk(state, play!.action);

    // The Hat removed itself (cost.removeSelf).
    expect(after.players.p1.removed).toContain(HAT);
    expect(after.players.p1.hand).not.toContain(HAT);

    // The remove-another menu offers both the hand card and the discard card.
    const steps = visitSteps(after);
    const fromDiscard = steps.find((s) => s.label.includes("Magic Arrow") && s.label.includes("discard"));
    const fromHand = steps.find((s) => s.label.toLowerCase().includes("attack") && s.label.includes("hand"));
    expect(fromHand, "the hand card should be removable").toBeTruthy();
    expect(fromDiscard, "the discard-pile card should be removable").toBeTruthy();

    // Remove the discard-pile card → it leaves the game.
    const resolved = applyOk(after, fromDiscard!.action);
    expect(resolved.players.p1.removed).toContain("spell.magic_arrow");
    expect(resolved.players.p1.discard).not.toContain("spell.magic_arrow");
  });

  it("is not offered when the Hat is the only card available to remove", () => {
    const state = adventureState("hat-alone");
    state.players.p1.hand = [HAT];
    state.players.p1.discard = [];
    expect(findPlay(state, HAT, 1)).toBeFalsy();
  });
});

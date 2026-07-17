import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  gainExperience,
  getMainHero,
  getPlayerView,
  pumpAdventureQueues,
  type GameAction,
  type GameState
} from "./index";
import { openSharedDeckSearch } from "./adventure-reducer";

// ---------------------------------------------------------------------------
// Level-up Ability-Search picks (hero-board display, Feature B).
//
// At hero levels 2/3/5/7 a level-up grants "Search (2) the Ability deck". The
// card the player KEEPS from that Search is recorded PUBLICLY on the player,
// keyed by the level that granted it (`player.levelUpAbilityPicks[level]`), so
// the hero board — the player's own AND an opponent's — can show which ability
// was chosen at each of those levels.
//
// The attribution is structural: the Search reward is tagged with its level
// (`abilitySearchLevel`), the pump sets a transient marker while that Search is
// open, and the keep consumes it. An Ability Search from anything OTHER than a
// level-up (events, banks, map) never sets the marker, so it records nothing.
// Each claim below fails if its wiring is removed.
// ---------------------------------------------------------------------------

/** A fresh 2-player adventure with p1's main hero reset to level 1, empty hand/
 *  deck/discard (no Learning/Scouting to intercept, no owned-card dup skips). */
function makeGame(seed: string): GameState {
  const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  const hero = getMainHero(state, "p1")!;
  hero.experience = 0;
  hero.level = 1;
  state.players.p1.hand = [];
  state.players.p1.deck = [];
  state.players.p1.discard = [];
  return state;
}

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors.map((error) => error.message).join("; ")).toBe("");
  return result.state;
}

function expectDeckSearch(state: GameState) {
  const choice = state.pendingChoice;
  if (choice?.type !== "DECK_SEARCH") {
    throw new Error(`Expected a DECK_SEARCH choice, got ${choice?.type ?? "none"}`);
  }
  return choice;
}

describe("level-up Ability-Search picks are recorded per level", () => {
  it("records the Ability kept from the level-2 Search against level 2", () => {
    const state = makeGame("lvup-2");
    state.decks.abilities.drawPile = ["ability.luck", "ability.offense"];
    state.decks.abilities.discardPile = [];

    gainExperience(state, "p1", 2); // 0 → level 2 crosses the level-2 Ability Search
    pumpAdventureQueues(state);

    const choice = expectDeckSearch(state);
    // The transient marker is set while the level-up Search is open.
    expect(state.players.p1.pendingLevelUpAbilitySearch).toBe(2);
    const kept = choice.revealedCardIds[0];

    const resolved = apply(state, {
      type: "RESOLVE_DECK_SEARCH",
      playerId: "p1",
      choiceId: choice.id,
      pick: { kind: "revealed", index: 0 }
    });

    // The observable outcome: the kept card is logged at level 2 (and in hand),
    // and the marker is consumed.
    expect(resolved.players.p1.levelUpAbilityPicks).toEqual({ 2: kept });
    expect(resolved.players.p1.hand).toContain(kept);
    expect(resolved.players.p1.pendingLevelUpAbilitySearch).toBeUndefined();
  });

  it("records against the level that actually granted the Search (level 3, not a hardcoded 2)", () => {
    const state = makeGame("lvup-3");
    const hero = getMainHero(state, "p1")!;
    hero.experience = 2; // already level 2
    hero.level = 2;
    state.decks.abilities.drawPile = ["ability.luck", "ability.offense"];
    state.decks.abilities.discardPile = [];

    gainExperience(state, "p1", 2); // 2 → 4 crosses the level-3 Ability Search
    pumpAdventureQueues(state);

    const choice = expectDeckSearch(state);
    expect(state.players.p1.pendingLevelUpAbilitySearch).toBe(3);
    const kept = choice.revealedCardIds[0];

    const resolved = apply(state, {
      type: "RESOLVE_DECK_SEARCH",
      playerId: "p1",
      choiceId: choice.id,
      pick: { kind: "revealed", index: 0 }
    });

    // The record is keyed by the granting level, so it lands at 3 — nothing at 2.
    expect(resolved.players.p1.levelUpAbilityPicks).toEqual({ 3: kept });
  });

  it("records even when the kept card comes from the Search's top-discard pick", () => {
    const state = makeGame("lvup-discard");
    state.decks.abilities.drawPile = ["ability.luck"];
    state.decks.abilities.discardPile = ["ability.offense"]; // an acquirable discard-top

    gainExperience(state, "p1", 2);
    pumpAdventureQueues(state);

    // With a non-empty discard, the Search first opens the "Search, or take the
    // top discard?" menu; option 1 takes the discard-top (no reveal).
    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE" || choice.context !== "deck-search-mode") {
      throw new Error(`Expected the deck-search-mode menu, got ${choice?.type ?? "none"}`);
    }
    expect(state.players.p1.pendingLevelUpAbilitySearch).toBe(2);

    const resolved = apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: 1
    });

    expect(resolved.players.p1.levelUpAbilityPicks).toEqual({ 2: "ability.offense" });
    expect(resolved.players.p1.hand).toContain("ability.offense");
  });

  it("CONTROL: an Ability Search NOT from a level-up records nothing", () => {
    const state = makeGame("control-non-levelup");
    state.decks.abilities.drawPile = ["ability.luck", "ability.offense"];
    state.decks.abilities.discardPile = [];

    // An event/bank/map Ability Search opens the same DECK_SEARCH but never tags
    // a level, so no marker is set.
    openSharedDeckSearch(state, "p1", "abilities", 2);
    const choice = expectDeckSearch(state);
    expect(state.players.p1.pendingLevelUpAbilitySearch).toBeUndefined();

    const resolved = apply(state, {
      type: "RESOLVE_DECK_SEARCH",
      playerId: "p1",
      choiceId: choice.id,
      pick: { kind: "revealed", index: 0 }
    });

    // The card was genuinely kept (tracked as a deck-drawn ability) — proving the
    // "records nothing" is the level-gate, not a Search that kept nothing — yet
    // no level pick is written.
    expect(resolved.players.p1.deckDrawnAbilityCardIds).toHaveLength(1);
    expect(resolved.players.p1.levelUpAbilityPicks).toBeUndefined();
  });

  it("an empty (nothing-to-keep) level-up Search records nothing and drops the marker", () => {
    const state = makeGame("lvup-empty");
    // The only ability anywhere in the deck is one p1 already owns, so the Search
    // redraws past it and reveals nothing.
    state.players.p1.deck = ["ability.luck"];
    state.decks.abilities.drawPile = ["ability.luck"];
    state.decks.abilities.discardPile = [];

    gainExperience(state, "p1", 2);
    pumpAdventureQueues(state);

    // No keep-one choice opened (nothing acquirable); the marker is cleared so it
    // cannot latch onto a later Ability Search.
    expect(state.pendingChoice).toBeNull();
    expect(state.players.p1.levelUpAbilityPicks).toBeUndefined();
    expect(state.players.p1.pendingLevelUpAbilitySearch).toBeUndefined();
  });

  it("the recorded picks are PUBLIC — an opponent's player-view keeps them", () => {
    const state = makeGame("view-public");
    state.decks.abilities.drawPile = ["ability.luck", "ability.offense"];
    state.decks.abilities.discardPile = [];
    gainExperience(state, "p1", 2);
    pumpAdventureQueues(state);
    const choice = expectDeckSearch(state);
    const kept = choice.revealedCardIds[0];

    const resolved = apply(state, {
      type: "RESOLVE_DECK_SEARCH",
      playerId: "p1",
      choiceId: choice.id,
      pick: { kind: "revealed", index: 0 }
    });

    // p2 is an opponent; their view of p1 keeps the pick record unmasked (the
    // hero board shows opponents' picks too).
    const opponentView = getPlayerView(resolved, "p2");
    expect(opponentView.players.p1.levelUpAbilityPicks).toEqual({ 2: kept });
  });
});

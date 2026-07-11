import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { cardLibrary } from "@/data/cards/library";
import type { GameAction, GameState, PlayerId } from "./state";

/**
 * Instant HERO-SPECIALTY cards whose effect manipulates the player's own
 * hand/deck/discard are playable MID-COMBAT, exactly like the instant artifacts
 * that share those effects (house rule — see instantSideAllowedInCombat). A
 * printed Instant is a click-to-use card, not a map-only one; only map-SPATIAL
 * Instant sides (movement, teleport, resource gain, recruiting) stay map-only.
 *
 * Previously these hero-specialty twins were deliberately kept map-only. Each
 * test drives the real engine to the observable outcome (the play is offered in
 * combat, cards change zones, combat resumes) so it FAILS if the combat gate is
 * reverted (the `mapOnly` flag re-added, or the instant check narrowed back to
 * artifacts only).
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function findPlay(state: GameState, playerId: PlayerId, cardId: string, optionIndex = 0) {
  return getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      legal.action.optionIndex === optionIndex
  );
}

function resolveChoices(state: GameState, playerId: PlayerId, prefer?: RegExp): GameState {
  let current = state;
  let guard = 0;
  while (current.pendingChoice && guard < 24) {
    const actions = getLegalActions(current, playerId);
    expect(actions.length, "an open choice must always be answerable").toBeGreaterThan(0);
    const preferred = prefer ? actions.find((legal) => prefer.test(legal.label)) : undefined;
    current = applyOk(current, (preferred ?? actions[0]).action);
    guard += 1;
  }
  expect(current.pendingChoice).toBeNull();
  return current;
}

describe("Adrienne's Fire Magic IV (SEARCH_DECK_THEN_RESHUFFLE) mid-combat", () => {
  it("is offered in combat, searches her deck to hand, and reshuffles the discard", () => {
    const state = createInitialGameState();
    state.players.p1.hand = ["specialty.adrienne.4"];
    // count 3 pops the last 3 cards → a 3-option own-deck pick opens.
    state.players.p1.deck = ["stat.attack", "spell.magic_arrow", "spell.bless"];
    state.players.p1.discard = ["ability.wisdom"];

    const play = findPlay(state, "p1", "specialty.adrienne.4", 0);
    expect(play, "Fire Magic IV should be offered during combat").toBeTruthy();
    const played = applyOk(state, play!.action);

    // The own-deck pick opened immediately as a combat choice (not queued on a
    // parked map reward queue), and it returns to combat when answered.
    expect(played.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (played.pendingChoice?.type === "OPTION_CHOICE") {
      expect(played.pendingChoice.context).toBe("own-deck-pick");
      expect(played.pendingChoice.returnPhase).toBe("combat");
    }

    const done = resolveChoices(played, "p1", /Bless/);
    // The chosen card reached the hand; the discard pile shuffled back into the
    // deck (so it is now empty) — the full effect ran inside the live combat.
    expect(done.players.p1.hand).toContain("spell.bless");
    expect(done.players.p1.discard).toEqual([]);
    expect(done.phase).toBe("combat");
    expect(done.combat?.outcome).toBeNull();
  });

  it("is NOT offered when her deck and discard are both empty (nothing to do)", () => {
    const state = createInitialGameState();
    state.players.p1.hand = ["specialty.adrienne.4"];
    state.players.p1.deck = [];
    state.players.p1.discard = [];
    expect(findPlay(state, "p1", "specialty.adrienne.4", 0)).toBeFalsy();
  });
});

describe("Jeddite's Mysterious Warlock I (DECK_DIG_KEEP_MATCHING) mid-combat", () => {
  it("is offered in combat and digs Spells/Specialties from the deck into the hand", () => {
    const state = createInitialGameState();
    state.players.p1.hand = ["specialty.jeddite.1"];
    // count 3 pops the last 3: bless & magic_arrow (spells) are kept, stat.attack
    // is discarded.
    state.players.p1.deck = ["stat.attack", "spell.magic_arrow", "spell.bless"];
    state.players.p1.discard = [];

    const play = findPlay(state, "p1", "specialty.jeddite.1", 0);
    expect(play, "Mysterious Warlock I should be offered during combat").toBeTruthy();
    const done = applyOk(state, play!.action);

    // Fully synchronous card manipulation — no queued map reward.
    expect(done.pendingChoice).toBeNull();
    expect(done.players.p1.hand).toContain("spell.bless");
    expect(done.players.p1.hand).toContain("spell.magic_arrow");
    expect(done.players.p1.discard).toContain("stat.attack");
    expect(done.phase).toBe("combat");
    expect(done.combat?.outcome).toBeNull();
  });
});

describe("Miriam's Scouting I (REMOVE_HAND_CARD_THEN_SEARCH) mid-combat", () => {
  it("is offered in combat and opens the remove-then-Search choice inline", () => {
    const state = createInitialGameState();
    state.players.p1.hand = ["specialty.miriam.1", "ability.offense"];

    const play = findPlay(state, "p1", "specialty.miriam.1", 0);
    expect(play, "Scouting I should be offered during combat").toBeTruthy();
    const played = applyOk(state, play!.action);

    // The remove-then-Search menu opened immediately as a combat choice.
    expect(played.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (played.pendingChoice?.type === "OPTION_CHOICE") {
      expect(played.pendingChoice.context).toBe("combat-remove-then-search");
      expect(played.pendingChoice.returnPhase).toBe("combat");
      const labels = played.pendingChoice.options.map((option) => option.label);
      expect(labels.some((label) => label.includes("Offense"))).toBe(true);
    }

    // Remove the ability, then drive the Ability-deck Search to completion; an
    // Ability card reaches the hand and play returns to the live combat.
    const done = resolveChoices(played, "p1", /Offense|Search/);
    expect(done.players.p1.removed).toContain("ability.offense");
    const gainedAbility = done.players.p1.hand.filter((cardId) => cardLibrary[cardId]?.kind === "ability");
    expect(gainedAbility.length, "the Search should have handed an Ability to the player").toBeGreaterThan(0);
    expect(done.phase).toBe("combat");
    expect(done.combat?.outcome).toBeNull();
  });

  it("is NOT offered in combat without a removable card matching the filter", () => {
    const state = createInitialGameState();
    // Scouting I only removes an ABILITY card; a hand of statistics offers nothing.
    state.players.p1.hand = ["specialty.miriam.1", "stat.attack", "stat.defense"];
    expect(findPlay(state, "p1", "specialty.miriam.1", 0)).toBeFalsy();
  });
});

describe("Tazar's War Hero VI (DRAW_TOP_ARTIFACT) mid-combat", () => {
  it("is offered in combat, discards the price, and draws the top Artifact to hand", () => {
    const state = createInitialGameState();
    // Option index 1: discard 3 cards to draw the top Artifact card.
    state.players.p1.hand = ["specialty.tazar.6", "stat.attack", "stat.defense", "stat.power"];

    const play = findPlay(state, "p1", "specialty.tazar.6", 1);
    expect(play, "War Hero VI should be offered during combat").toBeTruthy();
    const played = applyOk(state, {
      ...play!.action,
      costCardIds: ["stat.attack", "stat.defense", "stat.power"]
    } as GameAction);

    // The BINH Minor/Major/Relic split means the caster picks a deck, then the
    // draw lands an Artifact in the hand — all inside the live combat.
    const done = resolveChoices(played, "p1");
    const gainedArtifact = done.players.p1.hand.filter((cardId) => cardLibrary[cardId]?.kind === "artifact");
    expect(gainedArtifact.length, "the draw should have handed an Artifact to the player").toBeGreaterThan(0);
    expect(done.phase).toBe("combat");
    expect(done.combat?.outcome).toBeNull();
  });
});

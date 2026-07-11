import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { cardLibrary } from "@/data/cards/library";
import type { GameAction, GameState, PlayerId } from "./state";

/**
 * Instant artifacts with deck-manipulation sides are playable MID-COMBAT
 * (house rule shared with TAKE_FROM_DISCARD — see
 * instantSideAllowedInCombat): an Instant is a click-to-use card, not
 * a map-only one. The reward queue is parked during a live combat, so these
 * plays open their removal/Search choices immediately instead of queueing.
 * Every test drives the real engine to the observable outcome (cards changing
 * zones, the searched card reaching the hand, combat resuming) and keeps a
 * CONTROL (a hero-specialty twin stays map-only; no removable card = no offer).
 */

const HAT = "artifact.spellbinders_hat";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function findPlay(state: GameState, playerId: PlayerId, cardId: string, optionIndex: number) {
  return getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      legal.action.optionIndex === optionIndex
  );
}

/**
 * Resolves every pending choice by picking the first offered action (deck
 * picks take the first deck, deck searches keep the first revealed card),
 * optionally preferring an action whose label matches `prefer`.
 */
function resolveChoices(state: GameState, playerId: PlayerId, prefer?: RegExp): GameState {
  let current = state;
  let guard = 0;
  while (current.pendingChoice && guard < 20) {
    const actions = getLegalActions(current, playerId);
    expect(actions.length, "an open choice must always be answerable").toBeGreaterThan(0);
    const preferred = prefer ? actions.find((legal) => prefer.test(legal.label)) : undefined;
    current = applyOk(current, (preferred ?? actions[0]).action);
    guard += 1;
  }
  expect(current.pendingChoice).toBeNull();
  return current;
}

describe("Spellbinder's Hat mid-combat", () => {
  it("option A removes a chosen Spell and completes a Spell-deck Search inside the combat", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [HAT, "spell.stone_skin", "stat.attack"];

    const play = findPlay(state, "p1", HAT, 0);
    expect(play, "option A should be offered during combat").toBeTruthy();
    const played = applyOk(state, play!.action);

    // The Hat itself discards (it is not removed on this side); the removal
    // menu opened immediately as a combat choice.
    expect(played.players.p1.discard).toContain(HAT);
    expect(played.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (played.pendingChoice?.type === "OPTION_CHOICE") {
      expect(played.pendingChoice.context).toBe("combat-remove-then-search");
      const labels = played.pendingChoice.options.map((option) => option.label);
      // Only the Spell is removable; a Statistic has no deck to dig.
      expect(labels.some((label) => label.includes("Stone Skin"))).toBe(true);
      expect(labels.some((label) => label.toLowerCase().includes("attack"))).toBe(false);
      expect(labels).toContain("Skip");
    }

    // Remove the Spell, then drive the Search to completion (deck pick /
    // search-mode / keep the first revealed card).
    const done = resolveChoices(played, "p1", /Stone Skin|Search/);
    expect(done.players.p1.removed).toContain("spell.stone_skin");

    // The Search resolved INSIDE the combat: a Spell card reached the hand and
    // play returned to the still-running battle.
    const gained = done.players.p1.hand.filter((cardId) => cardLibrary[cardId]?.kind === "spell");
    expect(gained.length, "the Search should have handed a Spell to the player").toBeGreaterThan(0);
    expect(done.phase).toBe("combat");
    expect(done.combat).toBeTruthy();
    expect(done.combat?.outcome).toBeNull();
  });

  it("option A is NOT offered in combat without a removable (ability/artifact/spell) card", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [HAT, "stat.attack", "stat.defense"];
    expect(findPlay(state, "p1", HAT, 0)).toBeFalsy();
  });

  it("option B removes the Hat and a chosen discard-pile card inside the combat", () => {
    const state = createInitialGameState();
    state.players.p1.hand = [HAT, "stat.attack"];
    state.players.p1.discard = ["spell.magic_arrow"];

    const play = findPlay(state, "p1", HAT, 1);
    expect(play, "option B should be offered during combat").toBeTruthy();
    const played = applyOk(state, play!.action);

    // The Hat removed itself (cost.removeSelf); the remove-another menu offers
    // both the hand card and the discard card, plus a Skip.
    expect(played.players.p1.removed).toContain(HAT);
    expect(played.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (played.pendingChoice?.type === "OPTION_CHOICE") {
      expect(played.pendingChoice.context).toBe("combat-remove-another");
      const labels = played.pendingChoice.options.map((option) => option.label);
      expect(labels.some((label) => label.toLowerCase().includes("attack") && label.includes("hand"))).toBe(true);
      expect(labels.some((label) => label.includes("Magic Arrow") && label.includes("discard"))).toBe(true);
      expect(labels).toContain("Skip");
    }

    const done = resolveChoices(played, "p1", /Magic Arrow/);
    expect(done.players.p1.removed).toContain("spell.magic_arrow");
    expect(done.players.p1.discard).not.toContain("spell.magic_arrow");
    expect(done.phase).toBe("combat");
    expect(done.combat?.outcome).toBeNull();
  });
});

describe("other instant artifacts' Search/dig sides mid-combat", () => {
  it("Breastplate of Brimstone Searches the Spell deck during combat", () => {
    const state = createInitialGameState();
    state.players.p1.hand = ["artifact.breastplate_of_brimstone"];

    const play = findPlay(state, "p1", "artifact.breastplate_of_brimstone", 0);
    expect(play, "the Search side should be offered during combat").toBeTruthy();
    const played = applyOk(state, play!.action);
    // The Search opened immediately (a deck pick or the reveal itself) — it
    // was NOT parked on a reward queue (the sandbox has none).
    expect(played.pendingChoice).toBeTruthy();

    const done = resolveChoices(played, "p1");
    const gained = done.players.p1.hand.filter((cardId) => cardLibrary[cardId]?.kind === "spell");
    expect(gained.length).toBeGreaterThan(0);
    expect(done.phase).toBe("combat");
  });

  it("Surcoat of Counterpoise removes itself and Searches the Artifact deck during combat", () => {
    const state = createInitialGameState();
    state.players.p1.hand = ["artifact.surcoat_of_counterpoise"];

    const play = findPlay(state, "p1", "artifact.surcoat_of_counterpoise", 1);
    expect(play, "the Search side should be offered during combat").toBeTruthy();
    const played = applyOk(state, play!.action);
    expect(played.players.p1.removed).toContain("artifact.surcoat_of_counterpoise");
    expect(played.pendingChoice).toBeTruthy();

    const done = resolveChoices(played, "p1");
    const gained = done.players.p1.hand.filter((cardId) => cardLibrary[cardId]?.kind === "artifact");
    expect(gained.length).toBeGreaterThan(0);
    expect(done.phase).toBe("combat");
  });

  it("Crown of Dragontooth's remove-a-Spell Search side is offered during combat", () => {
    const state = createInitialGameState();
    state.players.p1.hand = ["artifact.crown_of_dragontooth", "spell.stone_skin"];
    expect(findPlay(state, "p1", "artifact.crown_of_dragontooth", 1)).toBeTruthy();
  });

  it("a Tome's School dig finds a matching spell during combat", () => {
    const state = createInitialGameState();
    state.players.p1.hand = ["artifact.tome_of_air"];

    const play = findPlay(state, "p1", "artifact.tome_of_air", 0);
    expect(play, "the dig side should be offered during combat").toBeTruthy();
    const played = applyOk(state, play!.action);
    // The dig found the first Air spell and opened the take/discard choice.
    expect(played.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (played.pendingChoice?.type === "OPTION_CHOICE") {
      expect(played.pendingChoice.context).toBe("eagle-eye");
    }

    const done = resolveChoices(played, "p1", /Take /);
    const gained = done.players.p1.hand.find((cardId) => {
      const card = cardLibrary[cardId];
      return card?.kind === "spell" && (card.spellSchools ?? []).some((school) => school === "air" || school === "any");
    });
    expect(gained, "the dug Air spell should be in hand").toBeTruthy();
    expect(done.phase).toBe("combat");
  });

  it("Miriam's Scouting specialty (the Hat's hero-specialty twin) is NOW playable in combat too", () => {
    const state = createInitialGameState();
    state.players.p1.hand = ["specialty.miriam.4", "spell.stone_skin"];
    // The specialty shares REMOVE_HAND_CARD_THEN_SEARCH and is a printed Instant,
    // so — like every instant card-manipulation side — it is a combat play now,
    // not map-only (see instantSideAllowedInCombat). A removable Spell is present,
    // so its remove-then-Search side is offered mid-combat. Full end-to-end
    // coverage lives in instant-specialties-combat.test.ts.
    expect(cardLibrary["specialty.miriam.4"]).toBeTruthy();
    expect(findPlay(state, "p1", "specialty.miriam.4", 0), "the instant twin should be offered in combat").toBeTruthy();
    // CONTROL: with no removable (ability/artifact/spell) card in hand it offers
    // nothing — the effect gate still requires a card to remove.
    const noRemovable = createInitialGameState();
    noRemovable.players.p1.hand = ["specialty.miriam.4", "stat.attack", "stat.defense"];
    expect(findPlay(noRemovable, "p1", "specialty.miriam.4", 0)).toBeFalsy();
  });
});

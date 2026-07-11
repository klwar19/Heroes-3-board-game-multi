import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import { abilityDeckLegacy } from "@/data/cards/abilities-extra";
import {
  applyAction,
  createAdventureGameState,
  gainExperience,
  getLegalActions,
  getMainHero,
  levelOfExperience,
  pumpAdventureQueues,
  type GameAction,
  type GameState
} from "./index";

// ---------------------------------------------------------------------------
// Learning ability (level-up hook).
//
// "Play when the Hero is about to level up. Advance their Experience Level by an
// additional half level" (basic) / "...an additional level, then Remove this
// card" (expert). A half level is one Experience step here (2 steps = 1 level),
// so basic = +1 and expert = +2 Experience. The offer surfaces automatically
// whenever a Hero crosses a level while a Learning card is in hand.
// ---------------------------------------------------------------------------

function makeGame(): GameState {
  return createAdventureGameState({ seed: "learning-ability", difficulty: "normal", rollFirstPlayer: false });
}

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

/**
 * Sets the hero to `experience`, gives the player a Learning card (plus any
 * extras), gains 1 Experience (crossing into the next level) and pumps the
 * queue, exactly as a real action that grants Experience would. Returns the
 * state sitting on the Learning offer (or whatever the queue surfaced).
 */
function offerLearningAfterLevelUp(experience: number, hand: string[] = ["ability.learning"]): GameState {
  const state = makeGame();
  const hero = getMainHero(state, "p1")!;
  hero.experience = experience;
  hero.level = levelOfExperience(experience);
  state.players.p1.hand = [...hand];
  // gainExperience + pumpAdventureQueues is the exact sequence a real action
  // (combat reward, learning-stone visit, treasure die) runs after granting XP.
  gainExperience(state, "p1", 1);
  pumpAdventureQueues(state);
  return state;
}

describe("Learning card definition", () => {
  it("is implemented and no longer a needs-implementation stub", () => {
    const card = cardLibrary["ability.learning"];
    expect(card.implementationStatus).toBe("implemented");
    expect(card.tags).not.toContain("needs-implementation");
    expect(card.effect.type).toBe("ADVANCE_EXPERIENCE");
    if (card.effect.type === "ADVANCE_EXPERIENCE") {
      // Basic advances a half level (1 step); expert a full level (2 steps).
      expect(card.effect.amount).toBe(1);
      expect(card.effect.expertAmount).toBe(2);
    }
  });

  it("is part of the shared Ability deck (reachable in play)", () => {
    expect(abilityDeckLegacy).toContain("ability.learning");
  });
});

describe("Learning offer timing", () => {
  it("opens a learning-level-up choice when the Hero crosses a level holding the card", () => {
    const state = offerLearningAfterLevelUp(5); // exp 5 (lvl 3) -> 6 (lvl 4)
    expect(getMainHero(state, "p1")!.level).toBe(4);
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (state.pendingChoice?.type === "OPTION_CHOICE") {
      expect(state.pendingChoice.context).toBe("learning-level-up");
      expect(state.pendingChoice.playerId).toBe("p1");
    }
  });

  it("does NOT offer Learning when the player does not hold the card", () => {
    const state = offerLearningAfterLevelUp(5, []); // no Learning in hand
    const isLearningChoice =
      state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context === "learning-level-up";
    expect(isLearningChoice).toBe(false);
  });

  it("does NOT offer Learning when no level is crossed", () => {
    const state = makeGame();
    const hero = getMainHero(state, "p1")!;
    hero.experience = 4; // level 3
    hero.level = 3;
    state.players.p1.hand = ["ability.learning"];
    gainExperience(state, "p1", 1); // exp 4 -> 5, still level 3 (no level-up)
    pumpAdventureQueues(state);
    expect(getMainHero(state, "p1")!.level).toBe(3);
    const isLearningChoice =
      state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context === "learning-level-up";
    expect(isLearningChoice).toBe(false);
  });

  it("does NOT offer Learning at the Experience cap", () => {
    const state = makeGame();
    const hero = getMainHero(state, "p1")!;
    hero.experience = 11; // level 6
    hero.level = 6;
    state.players.p1.hand = ["ability.learning"];
    gainExperience(state, "p1", 1); // exp 11 -> 12 (cap), level 7
    pumpAdventureQueues(state);
    expect(getMainHero(state, "p1")!.experience).toBe(12);
    const isLearningChoice =
      state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context === "learning-level-up";
    expect(isLearningChoice).toBe(false);
  });
});

describe("Learning resolution", () => {
  it("basic advances an extra half level (+1 Experience) and discards the card", () => {
    const state = offerLearningAfterLevelUp(5); // now at exp 6 (lvl 4), offer open
    const choiceId = state.pendingChoice!.id;
    // optionIndex 0 is the basic side.
    const resolved = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId, optionIndex: 0 });

    expect(getMainHero(resolved, "p1")!.experience).toBe(7); // 6 + 1
    expect(getMainHero(resolved, "p1")!.level).toBe(4);
    expect(resolved.players.p1.hand).not.toContain("ability.learning");
    expect(resolved.players.p1.discard).toContain("ability.learning");
    expect(resolved.players.p1.removed).not.toContain("ability.learning");
  });

  it("expert advances an extra full level (+2 Experience), removes the card and spends an expert use", () => {
    const state = offerLearningAfterLevelUp(5); // exp 6 (lvl 4); expertUses now 2
    // Isolate the level-5 Ability-deck Search from the first-round face-up seed
    // on the Ability discard, so it opens straight onto its DECK_SEARCH reveal
    // instead of the incidental "Search, or take the top discard?" mode prompt.
    state.decks.abilities.discardPile = [];
    expect(state.players.p1.combatStats.expertUsesSpentThisRound).toBe(0);
    const choice = state.pendingChoice!;
    if (choice.type !== "OPTION_CHOICE") {
      throw new Error("expected a learning-level-up option choice");
    }
    // modes = [basic, expert], so optionIndex 1 is the expert side.
    expect(choice.learningLevelUp?.modes).toEqual(["basic", "expert"]);
    const resolved = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 1 });

    expect(getMainHero(resolved, "p1")!.experience).toBe(8); // 6 + 2
    expect(getMainHero(resolved, "p1")!.level).toBe(5);
    // Expert side removes the card from the game (not the discard pile).
    expect(resolved.players.p1.hand).not.toContain("ability.learning");
    expect(resolved.players.p1.removed).toContain("ability.learning");
    expect(resolved.players.p1.discard).not.toContain("ability.learning");
    expect(resolved.players.p1.combatStats.expertUsesSpentThisRound).toBe(1);
    // Crossing into level 5 (an Ability-search level) via Learning runs the full
    // level-up machinery: a Search of the Ability deck opens afterwards.
    expect(resolved.pendingChoice?.type).toBe("DECK_SEARCH");
  });

  it("declining leaves Experience and the Learning card untouched", () => {
    const state = offerLearningAfterLevelUp(5); // exp 6 (lvl 4)
    const choice = state.pendingChoice!;
    if (choice.type !== "OPTION_CHOICE") {
      throw new Error("expected a learning-level-up option choice");
    }
    const declineIndex = choice.options.length - 1; // trailing "Decline"
    const resolved = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: declineIndex });

    expect(getMainHero(resolved, "p1")!.experience).toBe(6); // unchanged
    expect(resolved.players.p1.hand).toContain("ability.learning");
    expect(resolved.players.p1.discard).not.toContain("ability.learning");
  });

  it("only offers the basic side when no expert use is available", () => {
    const state = makeGame();
    const hero = getMainHero(state, "p1")!;
    hero.experience = 5; // level 3
    hero.level = 3;
    state.players.p1.hand = ["ability.learning"];
    // Cross into level 4 (a specialty level, so no competing Ability search),
    // then spend every expert use before the Learning offer opens.
    gainExperience(state, "p1", 1); // exp 5 -> 6, level 4 (expertUses becomes 2)
    state.players.p1.combatStats.expertUsesSpentThisRound = state.players.p1.limits.expertUses;
    pumpAdventureQueues(state);

    const choice = state.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    if (choice?.type === "OPTION_CHOICE") {
      expect(choice.context).toBe("learning-level-up");
      expect(choice.learningLevelUp?.modes).toEqual(["basic"]);
      // Just the basic play and "Decline".
      expect(choice.options).toHaveLength(2);
    }
  });
});

// ---------------------------------------------------------------------------
// Real-action map-object coverage. The unit tests above drive the level-up hook
// directly through gainExperience + pumpAdventureQueues. These drive the actual
// reducer (MOVE_HERO / RESOLVE_VISIT_STEP) so a regression in the visit -> reward
// queue -> pump plumbing for ANY experience-granting Field is caught. Per the
// wiki, Learning Stone and Tree of Knowledge are the Fields that grant XP; both
// must surface the Learning offer when a level is crossed.
// ---------------------------------------------------------------------------

/** Refresh p1's required start-of-turn draw, then plant a single Learning card. */
function readyHeroWithLearning(state: GameState, experience: number): GameState {
  const refreshed = (state.players.p1.needsHandRefresh || state.players.p1.canMulligan)
    ? apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
    : state;
  const hero = getMainHero(refreshed, "p1")!;
  hero.experience = experience;
  hero.level = levelOfExperience(experience);
  hero.movementPoints = 6;
  refreshed.players.p1.hand = ["ability.learning"];
  return refreshed;
}

describe("Learning offer surfaces from real map-object visits", () => {
  it("offers Learning after a Hero walks onto a Learning Stone and crosses a level", () => {
    let state = readyHeroWithLearning(makeGame(), 5); // exp 5 (lvl 3)
    state.adventure!.fields["h:7:2"].location = "learning_stone";
    const heroId = getMainHero(state, "p1")!.id;

    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId, to: "h:7:2" });

    // The Learning Stone granted +1 XP (exp 6, level 4) and the offer is open.
    expect(getMainHero(state, "p1")!.experience).toBe(6);
    expect(getMainHero(state, "p1")!.level).toBe(4);
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (state.pendingChoice?.type === "OPTION_CHOICE") {
      expect(state.pendingChoice.context).toBe("learning-level-up");
      expect(state.pendingChoice.playerId).toBe("p1");
    }
  });

  // Regression: crossing into an ABILITY-SEARCH level (2/3/5/7) queues a Search of
  // the Ability deck for that level. Learning ("about to level up") must be offered
  // FIRST — not buried behind that unrelated Search. The earlier coverage only
  // crossed into level 4 (a specialty level, no competing Search), so it never
  // caught this and a Learning Stone into an ability level looked like it offered
  // no Learning at all. exp 7 (lvl 4) -> 8 (lvl 5) is an ability-search crossing.
  it("offers Learning FIRST (before the Ability-deck Search) on an ability-search level-up", () => {
    let state = readyHeroWithLearning(makeGame(), 7); // exp 7 (lvl 4)
    state.adventure!.fields["h:7:2"].location = "learning_stone";
    const heroId = getMainHero(state, "p1")!.id;

    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId, to: "h:7:2" });

    expect(getMainHero(state, "p1")!.experience).toBe(8); // +1
    expect(getMainHero(state, "p1")!.level).toBe(5); // an ability-search level
    // The Learning offer is what surfaces — NOT the level-5 Ability Search.
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (state.pendingChoice?.type === "OPTION_CHOICE") {
      expect(state.pendingChoice.context).toBe("learning-level-up");
    }
    // The level-5 Ability Search is still queued, to resolve AFTER the Learning
    // decision (it is not lost, just correctly ordered behind the offer).
    expect(state.adventure!.rewardQueue.some((reward) => reward.kind === "shared-deck-search")).toBe(true);
  });

  it("declining Learning then resolves the level-up's own Ability-deck Search", () => {
    let state = readyHeroWithLearning(makeGame(), 7); // exp 7 (lvl 4) -> 8 (lvl 5)
    state.adventure!.fields["h:7:2"].location = "learning_stone";
    // Isolate the level-5 Ability-deck Search from the first-round face-up seed
    // on the Ability discard, so declining Learning opens straight onto its
    // DECK_SEARCH reveal instead of the "take the top discard?" mode prompt.
    state.decks.abilities.discardPile = [];
    const heroId = getMainHero(state, "p1")!.id;
    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId, to: "h:7:2" });

    const choice = state.pendingChoice!;
    if (choice.type !== "OPTION_CHOICE") {
      throw new Error("expected the Learning offer");
    }
    const declineIndex = choice.options.length - 1;
    state = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: declineIndex });

    // After declining Learning, the level-5 Ability Search opens.
    expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
  });

  it("offers Learning after paying to use a Tree of Knowledge (+2 XP)", () => {
    let state = readyHeroWithLearning(makeGame(), 5); // exp 5 (lvl 3)
    state.players.p1.resources.valuables = 5; // afford the 3-valuables cost
    state.adventure!.fields["h:7:2"].location = "tree_of_knowledge";
    const heroId = getMainHero(state, "p1")!.id;

    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId, to: "h:7:2" });
    // The PAY_TO step waits for the player to decide whether to pay.
    expect(state.adventure?.pendingVisit?.steps[0].type).toBe("PAY_TO");

    // optionIndex 0 = the first cost option (3 valuables); paying grants +2 XP.
    state = apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });

    expect(getMainHero(state, "p1")!.experience).toBe(7); // 5 + 2
    expect(getMainHero(state, "p1")!.level).toBe(4);
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (state.pendingChoice?.type === "OPTION_CHOICE") {
      expect(state.pendingChoice.context).toBe("learning-level-up");
    }
  });

  // Same regression as the Learning Stone, via the OTHER experience Field. Tree
  // of Knowledge grants +2 XP through the shared gainExperience path, so it had —
  // and is fixed by — the same ordering. exp 7 (lvl 4) -> 9 (lvl 5) crosses into an
  // ability-search level; Learning must still be offered FIRST, not behind the
  // level-5 Ability Search.
  it("offers Learning FIRST on a Tree of Knowledge level-up into an ability-search level", () => {
    let state = readyHeroWithLearning(makeGame(), 7); // exp 7 (lvl 4)
    state.players.p1.resources.valuables = 5; // afford the 3-valuables cost
    state.adventure!.fields["h:7:2"].location = "tree_of_knowledge";
    const heroId = getMainHero(state, "p1")!.id;

    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId, to: "h:7:2" });
    expect(state.adventure?.pendingVisit?.steps[0].type).toBe("PAY_TO");
    state = apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 }); // pay, +2 XP

    expect(getMainHero(state, "p1")!.experience).toBe(9); // 7 + 2
    expect(getMainHero(state, "p1")!.level).toBe(5); // an ability-search level
    // The Learning offer surfaces — NOT the level-5 Ability Search.
    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (state.pendingChoice?.type === "OPTION_CHOICE") {
      expect(state.pendingChoice.context).toBe("learning-level-up");
    }
    // The level-5 Ability Search is queued behind the offer (not lost).
    expect(state.adventure!.rewardQueue.some((reward) => reward.kind === "shared-deck-search")).toBe(true);
  });

  it("does NOT offer Learning at a Tree of Knowledge when the player declines to pay", () => {
    let state = readyHeroWithLearning(makeGame(), 5);
    state.players.p1.resources.valuables = 5;
    state.adventure!.fields["h:7:2"].location = "tree_of_knowledge";
    const heroId = getMainHero(state, "p1")!.id;

    state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId, to: "h:7:2" });
    state = apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", decline: true });

    expect(getMainHero(state, "p1")!.experience).toBe(5); // no XP, no level-up
    const isLearningChoice =
      state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context === "learning-level-up";
    expect(isLearningChoice).toBe(false);
  });
});

describe("Learning is never played from hand", () => {
  it("is not offered as a normal map play and rejects a direct PLAY_CARD", () => {
    const base = makeGame();
    const state = (base.players.p1.needsHandRefresh || base.players.p1.canMulligan)
      ? apply(base, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : base;
    state.players.p1.hand = ["ability.learning"];
    const plays = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "ability.learning"
    );
    expect(plays).toHaveLength(0);

    const result = applyAction(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "ability.learning",
      mode: "basic",
      target: { type: "none" }
    });
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

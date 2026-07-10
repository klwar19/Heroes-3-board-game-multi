import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import { pandoraDeckCardIds } from "@/data/cards/pandora";
import { coreUnitDefinitions } from "@/data/factions/units";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  type GameAction,
  type GameState
} from "./index";
import { eliminatePlayer, NEUTRAL_DECK_IDS, RESOURCE_GAIN_LEVEL_AMOUNTS, startAdventureRound } from "./adventure";
import { pandoraScryDeckId } from "./adventure-reducer";
import { getPlayerView } from "./player-view";
import type { GameEvent, HeroState, PlayerId, ResourceCost, ResourceKind } from "./state";

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function readyAdventure(seed: string): GameState {
  const game = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  return game.players.p1.needsHandRefresh || game.players.p1.canMulligan
    ? apply(game, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
    : game;
}

function playCardFromHand(state: GameState, cardId: string): GameState {
  const play = getLegalActions(state, "p1").find(
    (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === cardId
  );
  expect(play, `${cardId} should be playable`).toBeTruthy();
  return apply(state, play!.action);
}

// ===========================================================================
// All three formerly-"in reserve" Pandora cards are now implemented + decked
// ===========================================================================

describe("Pandora reserve cards — now in the game", () => {
  it("every Pandora card is implemented and shuffled into the Pandora deck", () => {
    for (const id of [
      "pandora.power_or_morale",
      "pandora.resource_income",
      "pandora.neutral_recruits"
    ]) {
      expect(cardLibrary[id]?.implementationStatus, id).toBe("implemented");
      expect(cardLibrary[id]?.tags, id).not.toContain("needs-implementation");
      expect(pandoraDeckCardIds, id).toContain(id);
    }
  });
});

// ===========================================================================
// Pandora's Gift: Income — a PERMANENT (∞): enter-play die, per-round tier
// ===========================================================================

describe("Pandora's Gift: Income (permanent)", () => {
  it("enters play as a permanent, rolls the Resource die, and touches NO production track", () => {
    const state = readyAdventure("pandora-income");
    state.players.p1.hand = ["pandora.resource_income"];
    const productionBefore = { ...state.players.p1.production };
    const logLen = state.eventLog.length;

    const after = playCardFromHand(state, "pandora.resource_income");

    // The printed ∞: the card sits in play, not in the discard.
    expect(after.players.p1.permanents).toContain("pandora.resource_income");
    // The enter-play die was rolled and its resource recorded.
    expect(resourceDieEvents(after, logLen).length).toBe(1);
    expect(after.players.p1.pandoraIncomeResource).toBeTruthy();
    // No production track moved — the boost is paid per Resources round while
    // in play, so removing the card cleanly ends it.
    expect(after.players.p1.production).toEqual(productionBefore);
  });

  it("pays the rolled resource's FULL income tier each Resources round — and stops once the card leaves play", () => {
    // Same-seed pair: the only difference is the permanent in play, so the
    // Resources-round gold delta isolates the card's income boost.
    const withCard = readyAdventure("pandora-income-round");
    const control = readyAdventure("pandora-income-round");
    withCard.players.p1.permanents = ["pandora.resource_income"];
    withCard.players.p1.pandoraIncomeResource = "gold";

    for (const state of [withCard, control]) {
      state.round = 3; // an odd round after the first = a Resources round
      startAdventureRound(state);
    }
    const boost = withCard.players.p1.resources.gold - control.players.p1.resources.gold;
    expect(boost).toBe(RESOURCE_GAIN_LEVEL_AMOUNTS.gold);

    // Control: the card LEAVING play ends the boost ("lasts only as long as it
    // is in play") — a stale rolled resource with no in-play card pays nothing.
    const left = readyAdventure("pandora-income-round");
    left.players.p1.permanents = [];
    left.players.p1.discard = ["pandora.resource_income"];
    left.players.p1.pandoraIncomeResource = "gold";
    left.round = 3;
    startAdventureRound(left);
    expect(left.players.p1.resources.gold).toBe(control.players.p1.resources.gold);
  });
});

// ===========================================================================
// Pandora's Gift: Recruits — draw 3 Neutral units, recruit one at half cost
// ===========================================================================

function halfCost(cost: ResourceCost): ResourceCost {
  const half: ResourceCost = {};
  for (const [resource, amount] of Object.entries(cost) as [ResourceKind, number][]) {
    if (amount && amount > 0) {
      half[resource] = Math.ceil(amount / 2);
    }
  }
  return half;
}

describe("Pandora's Gift: Recruits", () => {
  it("draws 3 SILVER Neutral units and recruits one for half cost; the rest return to the deck", () => {
    const state = readyAdventure("pandora-recruits");
    state.players.p1.hand = ["pandora.neutral_recruits"];
    // Plenty of resources so a half-cost recruit is affordable.
    state.players.p1.resources = { gold: 99, buildingMaterials: 99, valuables: 99 };

    const silver = state.decks[NEUTRAL_DECK_IDS.silver]!;
    const drawPileBefore = silver.drawPile.length;
    const discardBefore = silver.discardPile.length;
    const bronzeDrawBefore = state.decks[NEUTRAL_DECK_IDS.bronze]!.drawPile.length;
    const armyBefore = state.players.p1.army.length;
    const resourcesBefore = { ...state.players.p1.resources };

    const played = playCardFromHand(state, "pandora.neutral_recruits");

    // The draw opened a one-of pick — 3 fewer cards in the SILVER draw pile
    // (the printed star is the silver tier), bronze untouched (control).
    const visit = played.adventure!.pendingVisit;
    expect(visit, "the recruit offer should open a visit").toBeTruthy();
    const step = visit!.steps[0];
    expect(step.type).toBe("CHOOSE_ONE");
    expect(played.decks[NEUTRAL_DECK_IDS.silver]!.drawPile.length).toBe(drawPileBefore - 3);
    expect(played.decks[NEUTRAL_DECK_IDS.bronze]!.drawPile.length).toBe(bronzeDrawBefore);

    // Recruit the first offered unit (option 0 is a "Recruit …" choice here).
    const recruited = apply(played, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });

    // Army gained exactly one SILVER-tier neutral unit.
    expect(recruited.players.p1.army.length).toBe(armyBefore + 1);
    const gained = recruited.players.p1.army[recruited.players.p1.army.length - 1];
    expect(gained.side).toBe("neutral");
    expect(coreUnitDefinitions[gained.unitDefId]?.tier).toBe("silver");

    // It cost HALF (rounded up) of that unit's printed recruit cost — proven by
    // the resource delta, not just that something was spent.
    const expected = halfCost(coreUnitDefinitions[gained.unitDefId]?.neutral?.cost ?? {});
    for (const resource of Object.keys(resourcesBefore) as ResourceKind[]) {
      const spent = resourcesBefore[resource] - recruited.players.p1.resources[resource];
      expect(spent, `${resource} spent`).toBe(expected[resource] ?? 0);
    }

    // The other two drawn units went back to the silver discard pile.
    expect(recruited.decks[NEUTRAL_DECK_IDS.silver]!.discardPile.length).toBe(discardBefore + 2);
    expect(recruited.adventure!.pendingVisit).toBeNull();
  });

  it("declining returns all three and recruits nothing (control)", () => {
    const state = readyAdventure("pandora-recruits-decline");
    state.players.p1.hand = ["pandora.neutral_recruits"];
    state.players.p1.resources = { gold: 99, buildingMaterials: 99, valuables: 99 };

    const silver = state.decks[NEUTRAL_DECK_IDS.silver]!;
    const discardBefore = silver.discardPile.length;
    const armyBefore = state.players.p1.army.length;
    const resourcesBefore = { ...state.players.p1.resources };

    const played = playCardFromHand(state, "pandora.neutral_recruits");
    const step = played.adventure!.pendingVisit!.steps[0];
    if (step.type !== "CHOOSE_ONE") {
      throw new Error("expected a CHOOSE_ONE recruit offer");
    }
    const declineIndex = step.options.length - 1; // decline is always last

    const declined = apply(played, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: declineIndex });

    expect(declined.players.p1.army.length).toBe(armyBefore); // no recruit
    expect(declined.players.p1.resources).toEqual(resourcesBefore); // nothing spent
    expect(declined.decks[NEUTRAL_DECK_IDS.silver]!.discardPile.length).toBe(discardBefore + 3); // all 3 returned
    expect(declined.adventure!.pendingVisit).toBeNull();
  });
});

// ===========================================================================
// Pandora's Bargain: Power — +1 Power on every spell, with an upkeep choice
// ===========================================================================

/** Cast Magic Arrow at the skeletons in the sandbox and return the damage. */
function magicArrowDamage(seed: string, withPermanent: boolean): number {
  const state = createInitialGameState(seed);
  state.players.p1.hand = ["spell.magic_arrow"];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";
  if (withPermanent) {
    state.players.p1.permanents = ["pandora.power_or_morale"];
  }
  const target = state.combat!.units.unit_p2_skeletons;
  target.abilities = [];
  target.maxHealth = 50;
  target.damage = 0;

  const cast = getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "CAST_SPELL" &&
      legal.action.cardId === "spell.magic_arrow" &&
      legal.action.target?.type === "unit" &&
      legal.action.target.unitId === "unit_p2_skeletons"
  );
  expect(cast, "Magic Arrow should be castable").toBeTruthy();
  let resolved = apply(state, cast!.action);
  let safety = 20;
  while (resolved.reactionWindow && safety > 0) {
    safety -= 1;
    resolved = apply(resolved, { type: "PASS_REACTION", playerId: resolved.reactionWindow.priorityPlayerId });
  }
  return resolved.combat!.units.unit_p2_skeletons.damage;
}

describe("Pandora's Bargain: Power — +1 Power on every spell", () => {
  it("turns Magic Arrow's 1 damage into 2 while the card is in play (control: 1 without)", () => {
    // amountByPower {0:1, 1:2}: the flat +1 Power is the only thing that can
    // raise base power 0 -> 1, so the damage jump proves the cast-time hook.
    expect(magicArrowDamage("pandora-power-off", false)).toBe(1);
    expect(magicArrowDamage("pandora-power-on", true)).toBe(2);
  });
});

describe("Pandora's Bargain: Power — end-of-turn upkeep", () => {
  it("offers remove-or-negative-morale at end of turn; removing discards the card", () => {
    const state = readyAdventure("pandora-upkeep-remove");
    state.players.p1.permanents = ["pandora.power_or_morale"];

    const ended = apply(state, { type: "END_TURN", playerId: "p1" });
    const choice = ended.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" && choice.context).toBe("pandora-upkeep");

    const removed = apply(ended, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: (choice as { id: string }).id,
      optionIndex: 0
    });
    expect(removed.players.p1.permanents ?? []).not.toContain("pandora.power_or_morale");
    // "Remove" is the rulebook keyword: the card leaves the GAME, not to the
    // discard pile (it must never be recallable for another +1 Power run).
    expect(removed.players.p1.removed).toContain("pandora.power_or_morale");
    expect(removed.players.p1.discard).not.toContain("pandora.power_or_morale");
    expect(removed.pendingChoice).toBeNull();
  });

  it("keeping the card instead takes a Negative Morale token", () => {
    const state = readyAdventure("pandora-upkeep-morale");
    state.players.p1.permanents = ["pandora.power_or_morale"];
    const moraleBefore = state.players.p1.morale;

    const ended = apply(state, { type: "END_TURN", playerId: "p1" });
    const choice = ended.pendingChoice!;
    const kept = apply(ended, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: 1
    });

    expect(kept.players.p1.morale).toBe(moraleBefore - 1);
    expect(kept.players.p1.permanents ?? []).toContain("pandora.power_or_morale"); // card stays
    expect(kept.players.p1.pandoraUpkeepResolvedThisTurn).toBe(true);
    // Control: ending the turn again does NOT re-open the upkeep (flag honoured).
    const again = applyAction(kept, { type: "END_TURN", playerId: "p1" });
    const reopened =
      again.state.pendingChoice?.type === "OPTION_CHOICE" && again.state.pendingChoice.context === "pandora-upkeep";
    expect(reopened).toBe(false);
  });
});

// ===========================================================================
// New Pandora cards (168–187): shared helpers
// ===========================================================================

function readyAdventureN(seed: string, playerCount: number): GameState {
  const game = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false, playerCount });
  return game.players.p1.needsHandRefresh || game.players.p1.canMulligan
    ? apply(game, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
    : game;
}

function mainHeroOf(state: GameState, playerId: PlayerId = "p1"): HeroState {
  const hero = Object.values(state.heroes).find((h) => h.controllerId === playerId && h.kind === "main");
  expect(hero, `${playerId} main hero`).toBeTruthy();
  return hero!;
}

/** Play a card (optionally a specific CHOOSE_ONE option) from p1's hand. */
function playOption(state: GameState, cardId: string, optionIndex?: number): GameState {
  const play = getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      (optionIndex === undefined || legal.action.optionIndex === optionIndex)
  );
  expect(play, `${cardId} option ${optionIndex ?? "-"} should be playable`).toBeTruthy();
  return apply(state, play!.action);
}

function chooseOptionNow(state: GameState, optionIndex: number, playerId: PlayerId = "p1"): GameState {
  const choice = state.pendingChoice;
  expect(choice, "a pendingChoice should be open").toBeTruthy();
  return apply(state, { type: "CHOOSE_OPTION", playerId, choiceId: choice!.id, optionIndex });
}

function resolveVisit(state: GameState, optionIndex: number, playerId: PlayerId = "p1"): GameState {
  return apply(state, { type: "RESOLVE_VISIT_STEP", playerId, optionIndex });
}

/**
 * Drives a shared-deck Search to completion, resolving any intermediate choices
 * (deck-pick / deck-search-mode with option 0 = "Search the deck and keep one")
 * and keeping the first revealed card of each DECK_SEARCH. Stops when no search
 * choice is open.
 */
function driveDeckSearches(state: GameState): GameState {
  let s = state;
  for (let guard = 0; guard < 20 && s.pendingChoice; guard += 1) {
    const choice = s.pendingChoice;
    if (choice.type === "DECK_SEARCH") {
      s = apply(s, {
        type: "RESOLVE_DECK_SEARCH",
        playerId: "p1",
        choiceId: choice.id,
        pick: { kind: "revealed", index: 0 }
      });
    } else if (
      choice.type === "OPTION_CHOICE" &&
      (choice.context === "deck-pick" || choice.context === "deck-search-mode")
    ) {
      s = apply(s, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex: 0 });
    } else {
      break;
    }
  }
  return s;
}

function totalResources(state: GameState, playerId: PlayerId = "p1"): number {
  const r = state.players[playerId].resources;
  return r.gold + r.buildingMaterials + r.valuables;
}

function resourceDieEvents(state: GameState, sinceIndex: number) {
  return state.eventLog
    .slice(sinceIndex)
    .filter((e): e is Extract<GameEvent, { type: "ADVENTURE_DICE_ROLLED" }> => e.type === "ADVENTURE_DICE_ROLLED" && e.dice === "resource");
}

function treasureRollEvents(state: GameState, sinceIndex: number) {
  return state.eventLog
    .slice(sinceIndex)
    .filter((e): e is Extract<GameEvent, { type: "ADVENTURE_DICE_ROLLED" }> => e.type === "ADVENTURE_DICE_ROLLED" && e.dice === "treasure");
}

// ===========================================================================
// Deck composition — every new card is implemented and shuffled in
// ===========================================================================

describe("Pandora deck — all 20 cards implemented and decked", () => {
  it("every decked id resolves to an implemented card (no stubs)", () => {
    expect(pandoraDeckCardIds.length).toBe(20);
    for (const id of pandoraDeckCardIds) {
      const card = cardLibrary[id];
      expect(card, id).toBeTruthy();
      expect(card!.implementationStatus, id).toBe("implemented");
      expect(card!.tags, id).not.toContain("needs-implementation");
    }
    // The specific new-mechanic cards are present.
    for (const id of [
      "pandora.experience_or_movement",
      "pandora.instant_choice",
      "pandora.pay_for_dice",
      "pandora.ability_search",
      "pandora.scry_astrologers"
    ]) {
      expect(pandoraDeckCardIds, id).toContain(id);
    }
  });
});

// ===========================================================================
// 187 — Gain 1 experience OR one Hero gains 1 movement
// ===========================================================================

describe("Pandora 187: experience or movement", () => {
  it("the experience side raises the MAIN hero's experience by 1 (control: no movement)", () => {
    const state = readyAdventure("p187-exp");
    state.players.p1.hand = ["pandora.experience_or_movement"];
    const heroBefore = mainHeroOf(state);
    const moveBefore = heroBefore.movementPoints;
    const expBefore = heroBefore.experience;

    const after = playOption(state, "pandora.experience_or_movement", 0);
    const hero = mainHeroOf(after);
    expect(hero.experience).toBe(expBefore + 1);
    expect(hero.movementPoints).toBe(moveBefore); // the exp side never moves
  });

  it("the movement side gives the lone MAIN hero +1 movement without a prompt (control: no experience)", () => {
    const state = readyAdventure("p187-move");
    state.players.p1.hand = ["pandora.experience_or_movement"];
    const heroBefore = mainHeroOf(state);
    const moveBefore = heroBefore.movementPoints;
    const expBefore = heroBefore.experience;

    const after = playOption(state, "pandora.experience_or_movement", 1);
    // A single hero: "One of your Heroes" auto-resolves, no picker opens.
    expect(after.adventure!.pendingVisit).toBeNull();
    const hero = mainHeroOf(after);
    expect(hero.movementPoints).toBe(moveBefore + 1);
    expect(hero.experience).toBe(expBefore); // the movement side never gives XP
  });

  it("with a Secondary Hero fielded, the OWNER picks which Hero gains the movement", async () => {
    const { createSecondaryHero } = await import("./adventure");
    const state = readyAdventure("p187-secondary");
    state.players.p1.hand = ["pandora.experience_or_movement"];
    const main = mainHeroOf(state);
    const secondary = createSecondaryHero(state, "p1", main.spaceId!);
    const mainMoveBefore = main.movementPoints;
    const secondaryMoveBefore = secondary.movementPoints;

    const played = playOption(state, "pandora.experience_or_movement", 1);
    // Two heroes on the map: the printed "One of your Heroes" opens a picker.
    const step = played.adventure!.pendingVisit!.steps[0];
    expect(step.type).toBe("CHOOSE_ONE");
    const secondaryIndex =
      step.type === "CHOOSE_ONE" ? step.options.findIndex((o) => o.label === "Secondary Hero") : -1;
    expect(secondaryIndex).toBeGreaterThanOrEqual(0);

    const after = resolveVisit(played, secondaryIndex);
    // The CHOSEN hero gains it; the main hero is untouched (control).
    expect(after.heroes[secondary.id].movementPoints).toBe(secondaryMoveBefore + 1);
    expect(mainHeroOf(after).movementPoints).toBe(mainMoveBefore);
    expect(after.adventure!.pendingVisit).toBeNull();
  });
});

// ===========================================================================
// 169 — Gain 2 experience OR remove 1 card from hand or discard
// ===========================================================================

describe("Pandora 169: experience or remove-a-card", () => {
  it("the experience side raises experience by 2", () => {
    const state = readyAdventure("p169-exp");
    state.players.p1.hand = ["pandora.experience_or_remove"];
    const expBefore = mainHeroOf(state).experience;
    const after = playOption(state, "pandora.experience_or_remove", 0);
    expect(mainHeroOf(after).experience).toBe(expBefore + 2);
  });

  it("the remove side removes a chosen card from hand (from the game)", () => {
    const state = readyAdventure("p169-remove");
    // A spare removable card sits in hand alongside the Pandora card.
    state.players.p1.hand = ["pandora.experience_or_remove", "stat.attack"];
    state.players.p1.discard = [];

    const played = playOption(state, "pandora.experience_or_remove", 1);
    // A masked visit-step removal menu is open.
    const visit = played.adventure!.pendingVisit;
    expect(visit, "removal visit should open").toBeTruthy();
    const step = visit!.steps[0];
    expect(step.type).toBe("CHOOSE_ONE");
    const removeIndex =
      step.type === "CHOOSE_ONE" ? step.options.findIndex((o) => o.label.includes("stat.attack") || o.label.includes("Attack")) : -1;
    expect(removeIndex).toBeGreaterThanOrEqual(0);

    const removed = resolveVisit(played, removeIndex);
    expect(removed.players.p1.hand).not.toContain("stat.attack");
    expect(removed.players.p1.discard).not.toContain("stat.attack");
    expect(removed.adventure!.pendingVisit).toBeNull();
  });
});

// ===========================================================================
// 170 — one Hero gains 2 movement OR remove a card
// ===========================================================================

describe("Pandora 170: movement or remove-a-card", () => {
  it("the movement side gives the MAIN hero +2 movement", () => {
    const state = readyAdventure("p170-move");
    state.players.p1.hand = ["pandora.movement_or_remove"];
    const moveBefore = mainHeroOf(state).movementPoints;
    const after = playOption(state, "pandora.movement_or_remove", 0);
    expect(mainHeroOf(after).movementPoints).toBe(moveBefore + 2);
  });
});

// ===========================================================================
// 172 — roll AND resolve 2 Resource dice OR gain 9 gold
// ===========================================================================

describe("Pandora 172: two Resource dice or 9 gold", () => {
  it("the 9-gold side gains exactly 9 gold and nothing else", () => {
    const state = readyAdventure("p172-gold");
    state.players.p1.hand = ["pandora.resource_dice_or_gold"];
    const goldBefore = state.players.p1.resources.gold;
    const matBefore = state.players.p1.resources.buildingMaterials;
    const valBefore = state.players.p1.resources.valuables;

    const after = playOption(state, "pandora.resource_dice_or_gold", 1);
    expect(after.players.p1.resources.gold).toBe(goldBefore + 9);
    expect(after.players.p1.resources.buildingMaterials).toBe(matBefore);
    expect(after.players.p1.resources.valuables).toBe(valBefore);
  });

  it("the dice side rolls TWO dice and resolves BOTH (total gain == both dice)", () => {
    const state = readyAdventure("p172-dice");
    state.players.p1.hand = ["pandora.resource_dice_or_gold"];
    const before = totalResources(state);
    const logLen = state.eventLog.length;

    const after = playOption(state, "pandora.resource_dice_or_gold", 0);
    const rolls = resourceDieEvents(after, logLen);
    // Two separate single-die rolls, each resolved.
    expect(rolls.length).toBe(2);
    const expected = rolls.reduce((sum, e) => sum + (e.resourceRolls?.[0]?.amount ?? 0), 0);
    // The gain equals BOTH dice — a single-die "resolve one" would fall short.
    expect(totalResources(after) - before).toBe(expected);
    expect(after.adventure!.pendingVisit).toBeNull();
    expect(after.pendingChoice).toBeNull();
  });
});

// ===========================================================================
// 171 — Search(2) a deck TWICE
// ===========================================================================

describe("Pandora 171: Search(2) twice", () => {
  it("the Artifact side opens two consecutive Searches (two cards kept)", () => {
    const state = readyAdventure("p171-art");
    state.players.p1.hand = ["pandora.search_two_twice"];
    const handBefore = state.players.p1.hand.length - 1; // minus the played card
    const logLen = state.eventLog.length;

    // Drive through both Searches (the second one may first offer the discard-top
    // that the first Search created — a legitimate deck-search-mode choice; option
    // 0 is always "Search the deck and keep one").
    const after = driveDeckSearches(playOption(state, "pandora.search_two_twice", 0));
    expect(after.pendingChoice).toBeNull();

    const resolved = after.eventLog
      .slice(logLen)
      .filter((e) => e.type === "DECK_SEARCH_RESOLVED");
    expect(resolved.length, "exactly two Searches resolved").toBe(2);
    // Two cards were taken into hand across the two Searches.
    expect(after.players.p1.hand.length).toBe(handBefore + 2);
  });
});

// ===========================================================================
// 179 — Search(5) Ability OR treasure gamble → Search(8)
// ===========================================================================

describe("Pandora 179: Ability Search / treasure gamble", () => {
  it("the Search(5) side opens a DECK_SEARCH of the Ability deck", () => {
    const state = readyAdventure("p179-search5");
    state.players.p1.hand = ["pandora.ability_search"];
    const after = playOption(state, "pandora.ability_search", 0);
    expect(after.pendingChoice?.type).toBe("DECK_SEARCH");
    expect(after.pendingChoice?.type === "DECK_SEARCH" && after.pendingChoice.deckId).toBe("abilities");
  });

  it("the gamble Searches (8) IFF at least one artifact (ankh) face is rolled — both branches covered", () => {
    let sawSearch = false;
    let sawNoSearch = false;
    for (let i = 0; i < 30 && (!sawSearch || !sawNoSearch); i += 1) {
      const state = readyAdventure(`p179-gamble-${i}`);
      state.players.p1.hand = ["pandora.ability_search"];
      const logLen = state.eventLog.length;
      const after = playOption(state, "pandora.ability_search", 1);

      const rolls = treasureRollEvents(after, logLen);
      expect(rolls.length, "the gamble rolls treasure dice").toBe(1);
      const faces = rolls[0].treasureRolls ?? [];
      expect(faces.length, "rolls 2 treasure dice").toBe(2);
      const hadAnkh = faces.includes("artifact-search");
      const searchOpened = after.pendingChoice?.type === "DECK_SEARCH";
      // The invariant: a Search(8) opens exactly when an ankh was rolled.
      expect(searchOpened, `seed ${i}: ankh=${hadAnkh}`).toBe(hadAnkh);
      if (searchOpened) {
        expect(after.pendingChoice?.type === "DECK_SEARCH" && after.pendingChoice.deckId).toBe("abilities");
        sawSearch = true;
      } else {
        sawNoSearch = true;
      }
    }
    expect(sawSearch, "at least one ankh outcome exercised").toBe(true);
    expect(sawNoSearch, "at least one no-ankh outcome exercised").toBe(true);
  });
});

// ===========================================================================
// 168 — INSTANT: choose 2 of {roll 2 dice / +1 move / +1 experience}
// ===========================================================================

describe("Pandora 168: choose 2 of 3", () => {
  it("the movement+experience combo applies BOTH (control: the dice combo gives no XP)", () => {
    const state = readyAdventure("p168-combo");
    state.players.p1.hand = ["pandora.instant_choice"];
    const heroBefore = mainHeroOf(state);
    const expBefore = heroBefore.experience;
    const moveBefore = heroBefore.movementPoints;

    const played = playOption(state, "pandora.instant_choice");
    // The visit opens the 3-combo CHOOSE_ONE.
    const step = played.adventure!.pendingVisit!.steps[0];
    expect(step.type).toBe("CHOOSE_ONE");
    // Option 2 == "one Hero gains 1 movement + gain 1 experience".
    const both = resolveVisit(played, 2);
    const hero = mainHeroOf(both);
    expect(hero.experience).toBe(expBefore + 1);
    expect(hero.movementPoints).toBe(moveBefore + 1);

    // Control: the dice combo (index 0) resolves without any XP gain.
    const ctrl = readyAdventure("p168-ctrl");
    ctrl.players.p1.hand = ["pandora.instant_choice"];
    const diceCombo = resolveVisit(playOption(ctrl, "pandora.instant_choice"), 0);
    expect(mainHeroOf(diceCombo).experience).toBe(0);
  });
});

// ===========================================================================
// 177 — pay up to 6× (3g / 2m / 1v), roll & resolve 1 Resource die per payment
// ===========================================================================

describe("Pandora 177: pay for Resource dice", () => {
  it("one payment spends the cost AND rolls a resolved Resource die", () => {
    const state = readyAdventure("p177-one");
    state.players.p1.hand = ["pandora.pay_for_dice"];
    // Afford exactly ONE 3-gold payment (no materials / valuables): after paying,
    // resources drop to 0, then the die's grant is the ONLY thing left.
    state.players.p1.resources = { gold: 3, buildingMaterials: 0, valuables: 0 };

    const played = playOption(state, "pandora.pay_for_dice");
    const menu = played.adventure!.pendingVisit!.steps[0];
    expect(menu.type).toBe("CHOOSE_ONE");
    const payGoldIndex =
      menu.type === "CHOOSE_ONE" ? menu.options.findIndex((o) => o.label.startsWith("Pay 3 gold")) : -1;
    expect(payGoldIndex).toBeGreaterThanOrEqual(0);

    const logLen = played.eventLog.length;
    const afterPay = resolveVisit(played, payGoldIndex);
    // A Resource die was rolled and resolved.
    const dice = resourceDieEvents(afterPay, logLen);
    expect(dice.length).toBe(1);
    const grant = dice[0].resourceRolls![0];
    // The 3 gold was spent (started at 3, 0 left) and the die's grant is the ONLY
    // resource remaining — proving both the payment and the die resolution.
    const r = afterPay.players.p1.resources;
    expect(r.gold + r.buildingMaterials + r.valuables).toBe(grant.amount);
    expect(r[grant.resource]).toBe(grant.amount);
  });

  it("caps at six payments and then ends (control on the 'up to six times' limit)", () => {
    const state = readyAdventure("p177-cap");
    state.players.p1.hand = ["pandora.pay_for_dice"];
    state.players.p1.resources = { gold: 999, buildingMaterials: 999, valuables: 999 };

    let current = playOption(state, "pandora.pay_for_dice");
    let payments = 0;
    for (let guard = 0; guard < 20; guard += 1) {
      const visit = current.adventure!.pendingVisit;
      const step = visit?.steps[0];
      if (!visit || !step || step.type !== "CHOOSE_ONE") {
        break;
      }
      const payIndex = step.options.findIndex((o) => o.label.startsWith("Pay 3 gold"));
      if (payIndex < 0) {
        break;
      }
      current = resolveVisit(current, payIndex);
      payments += 1;
    }
    expect(payments).toBe(6);
    expect(current.adventure!.pendingVisit).toBeNull();
  });

  it("stopping early ends the loop with no die rolled", () => {
    const state = readyAdventure("p177-stop");
    state.players.p1.hand = ["pandora.pay_for_dice"];
    state.players.p1.resources = { gold: 99, buildingMaterials: 99, valuables: 99 };
    const played = playOption(state, "pandora.pay_for_dice");
    const menu = played.adventure!.pendingVisit!.steps[0];
    const stopIndex = menu.type === "CHOOSE_ONE" ? menu.options.length - 1 : -1;
    const logLen = played.eventLog.length;
    const stopped = resolveVisit(played, stopIndex);
    expect(stopped.adventure!.pendingVisit).toBeNull();
    expect(resourceDieEvents(stopped, logLen).length).toBe(0);
  });
});

// ===========================================================================
// 186/185/184/183 — peek a deck, discard up to 2, reorder, then a bonus
// ===========================================================================

describe("Pandora 186: peek the Ability deck, gain 1 valuables", () => {
  it("reveals 3, discards 2, keeps 1 on top, and grants 1 valuables", () => {
    const state = readyAdventure("p186-scry");
    state.players.p1.hand = ["pandora.scry_abilities"];
    const deck = state.decks.abilities!;
    const drawBefore = deck.drawPile.length;
    const discardBefore = deck.discardPile.length;
    const valBefore = state.players.p1.resources.valuables;

    let after = playOption(state, "pandora.scry_abilities");
    const choice = after.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" && choice.context).toBe("pandora-scry");
    const scry = choice?.type === "OPTION_CHOICE" ? choice.pandoraScry! : undefined;
    expect(scry!.remaining.length).toBe(3);
    // The 3 revealed cards were lifted off the top.
    expect(after.decks.abilities!.drawPile.length).toBe(drawBefore - 3);

    // Discard the first two revealed (options [keep0,keep1,keep2, discard0,discard1,discard2]).
    after = chooseOptionNow(after, 3); // discard r0
    after = chooseOptionNow(after, 2); // now [keep r1, keep r2, discard r1, discard r2] -> discard r1
    // discards spent (2) -> only keep options remain for the last card
    after = chooseOptionNow(after, 0); // keep the last

    expect(after.pendingChoice).toBeNull();
    // 2 cards discarded, 1 returned to top: drawPile == before - 2, discard == before + 2.
    expect(after.decks.abilities!.drawPile.length).toBe(drawBefore - 2);
    expect(after.decks.abilities!.discardPile.length).toBe(discardBefore + 2);
    // The printed bonus applied.
    expect(after.players.p1.resources.valuables).toBe(valBefore + 1);
  });

  it("keeps the first-kept card on TOP (reorder is honoured)", () => {
    const state = readyAdventure("p186-order");
    state.players.p1.hand = ["pandora.scry_abilities"];
    const played = playOption(state, "pandora.scry_abilities");
    const scry = played.pendingChoice?.type === "OPTION_CHOICE" ? played.pendingChoice.pandoraScry! : undefined;
    const revealed = [...scry!.remaining]; // [r0, r1, r2]

    // Discard r0 (index 3), then keep r2 first (index 1 among [r1,r2]), then keep r1.
    let after = chooseOptionNow(played, 3); // discard r0 -> remaining [r1, r2]
    after = chooseOptionNow(after, 1); // keep r2 (options [keep r1, keep r2, discard r1, discard r2])
    after = chooseOptionNow(after, 0); // keep r1
    const top = after.decks.abilities!.drawPile.at(-1);
    // r2 was kept first, so it must be drawn next (on top).
    expect(top).toBe(revealed[2]);
  });

  it("with an empty deck the scry still grants the bonus (no choice opens)", () => {
    const state = readyAdventure("p186-empty");
    state.players.p1.hand = ["pandora.scry_abilities"];
    state.decks.abilities!.drawPile = [];
    const valBefore = state.players.p1.resources.valuables;
    const after = playOption(state, "pandora.scry_abilities");
    expect(after.pendingChoice).toBeNull();
    expect(after.players.p1.resources.valuables).toBe(valBefore + 1);
  });

  it("hides the revealed cards from other players' views", () => {
    const state = readyAdventureN("p186-mask", 2);
    state.players.p1.hand = ["pandora.scry_abilities"];
    const after = playOption(state, "pandora.scry_abilities");
    expect(after.pendingChoice?.type === "OPTION_CHOICE" && after.pendingChoice.context).toBe("pandora-scry");

    // p1 (the scryer) sees the real cards; p2 sees only "hidden".
    const ownerView = getPlayerView(after, "p1");
    const oppView = getPlayerView(after, "p2");
    const ownerChoice = ownerView.pendingChoice;
    const oppChoice = oppView.pendingChoice;
    expect(ownerChoice?.type === "OPTION_CHOICE" && ownerChoice.pandoraScry!.remaining.every((id) => id !== "hidden")).toBe(true);
    expect(oppChoice?.type === "OPTION_CHOICE" && oppChoice.pandoraScry!.remaining.every((id) => id === "hidden")).toBe(true);
    expect(oppChoice?.type === "OPTION_CHOICE" && oppChoice.options.every((o) => o.label === "Hidden card")).toBe(true);
  });

  it("eliminating the scrying player mid-scry destroys NO shared-deck cards", () => {
    // Invariant: the scry only LIFTS cards off the top of the draw pile, so an
    // elimination (AFK kick, concede) while the keep/discard choice is open must
    // put every undecided AND already-kept card back — the deck never shrinks.
    const state = readyAdventureN("p186-eliminate", 2);
    state.players.p1.hand = ["pandora.scry_abilities"];
    const deck = state.decks.abilities!;
    const totalBefore = deck.drawPile.length + deck.discardPile.length;

    let after = playOption(state, "pandora.scry_abilities");
    expect(after.pendingChoice?.type === "OPTION_CHOICE" && after.pendingChoice.context).toBe("pandora-scry");
    const revealed =
      after.pendingChoice?.type === "OPTION_CHOICE" ? [...after.pendingChoice.pandoraScry!.remaining] : [];
    expect(revealed).toHaveLength(3);

    // Exercise all three zones: keep r0 (toReturn), discard r1 (discard pile),
    // leave r2 undecided (remaining) — then eliminate the seat mid-choice.
    after = chooseOptionNow(after, 0); // keep r0
    after = chooseOptionNow(after, 2); // options [keep r1, keep r2, discard r1, discard r2] -> discard r1
    expect(after.pendingChoice?.type === "OPTION_CHOICE" && after.pendingChoice.context).toBe("pandora-scry");

    eliminatePlayer(after, "p1", "conceded the game", true);

    expect(after.pendingChoice).toBeNull();
    const deckAfter = after.decks.abilities!;
    // Nothing left the game: the kept + undecided cards are back in the draw
    // pile, the discarded one sits in the discard pile.
    expect(deckAfter.drawPile.length + deckAfter.discardPile.length).toBe(totalBefore);
    expect(deckAfter.drawPile).toContain(revealed[0]);
    expect(deckAfter.drawPile).toContain(revealed[2]);
    expect(deckAfter.discardPile).toContain(revealed[1]);
  });
});

describe("Pandora 185/184: peek Artifact/Spell deck, gain resources", () => {
  it("185 peeks the Artifact deck and grants 3 gold", () => {
    const state = readyAdventure("p185");
    state.players.p1.hand = ["pandora.scry_artifacts"];
    const deckId = pandoraScryDeckId(state, "artifacts")!;
    expect(deckId, "an artifact deck resolves").toBeTruthy();
    const drawBefore = state.decks[deckId]!.drawPile.length;
    const goldBefore = state.players.p1.resources.gold;

    let after = playOption(state, "pandora.scry_artifacts");
    expect(after.pendingChoice?.type === "OPTION_CHOICE" && after.pendingChoice.context).toBe("pandora-scry");
    expect(after.decks[deckId]!.drawPile.length).toBe(drawBefore - 3);
    // Keep all three (put back) — no discard.
    after = chooseOptionNow(after, 0);
    after = chooseOptionNow(after, 0);
    after = chooseOptionNow(after, 0);
    expect(after.pendingChoice).toBeNull();
    expect(after.decks[deckId]!.drawPile.length).toBe(drawBefore); // all returned
    expect(after.players.p1.resources.gold).toBe(goldBefore + 3);
  });

  it("184 peeks the Spell deck and grants 2 building materials", () => {
    const state = readyAdventure("p184");
    state.players.p1.hand = ["pandora.scry_spells"];
    const matBefore = state.players.p1.resources.buildingMaterials;
    let after = playOption(state, "pandora.scry_spells");
    // resolve the scry by keeping everything
    let guard = 0;
    while (after.pendingChoice?.type === "OPTION_CHOICE" && after.pendingChoice.context === "pandora-scry" && guard < 5) {
      after = chooseOptionNow(after, 0);
      guard += 1;
    }
    expect(after.players.p1.resources.buildingMaterials).toBe(matBefore + 2);
  });
});

describe("Pandora 183: peek the Astrologers deck, then Search(2) Artifact", () => {
  it("scrys the Astrologers deck, then opens a Search of the Artifact deck", () => {
    const state = readyAdventure("p183");
    state.players.p1.hand = ["pandora.scry_astrologers"];
    const astro = state.decks.astrologers!;
    const drawBefore = astro.drawPile.length;
    expect(drawBefore, "astrologers deck has cards").toBeGreaterThan(0);

    let after = playOption(state, "pandora.scry_astrologers");
    expect(after.pendingChoice?.type === "OPTION_CHOICE" && after.pendingChoice.context).toBe("pandora-scry");
    // Keep everything back on top.
    let guard = 0;
    while (after.pendingChoice?.type === "OPTION_CHOICE" && after.pendingChoice.context === "pandora-scry" && guard < 5) {
      after = chooseOptionNow(after, 0);
      guard += 1;
    }
    // After the scry, the Search(2) Artifact bonus opens.
    expect(after.pendingChoice?.type).toBe("DECK_SEARCH");
    expect(after.pendingChoice?.type === "DECK_SEARCH" && after.pendingChoice.deckId).toContain("artifact");
    // The astrologers deck is intact (all kept back on top).
    expect(after.decks.astrologers!.drawPile.length).toBe(drawBefore);
  });
});

// ===========================================================================
// Multiplayer secrecy — a drawn Pandora card must not leak to other seats
// ===========================================================================

describe("Pandora draw secrecy", () => {
  it("masks the drawn card id from other players' event logs (owner still sees it)", () => {
    const state = readyAdventureN("pandora-draw-mask", 2);
    // No Silver unit → playing Silver Muster self-cycles into a Pandora draw,
    // which logs PANDORA_CARD_DRAWN with the drawn card id.
    state.players.p1.army = [];
    state.players.p1.hand = ["pandora.silver_refresh"];

    const after = playCardFromHand(state, "pandora.silver_refresh");
    const drawnEvent = (view: { eventLog: GameState["eventLog"] }) =>
      view.eventLog.find(
        (event): event is Extract<GameEvent, { type: "PANDORA_CARD_DRAWN" }> => event.type === "PANDORA_CARD_DRAWN"
      );
    expect(drawnEvent(after), "the self-cycle draw logs the event").toBeTruthy();

    // The drawer's own view keeps the real card; the opponent sees "hidden"
    // (the card went into p1's hidden hand — naming it would leak the hand).
    const ownerEvent = drawnEvent(getPlayerView(after, "p1"));
    const oppEvent = drawnEvent(getPlayerView(after, "p2"));
    expect(ownerEvent?.cardId.startsWith("pandora.")).toBe(true);
    expect(oppEvent?.cardId).toBe("hidden");
  });
});

// ===========================================================================
// 173 — Silver Muster (Unit-Deck refresh with a self-cycle fallback)
// ===========================================================================

/** A concrete silver-tier unit definition id (dynamic, so the test is data-driven). */
function anySilverUnitDefId(): string {
  const id = Object.entries(coreUnitDefinitions).find(([, def]) => def.tier === "silver")?.[0];
  expect(id, "at least one silver unit must exist").toBeTruthy();
  return id!;
}

describe("Pandora 173: Silver Muster", () => {
  it("with NO Silver unit, the card self-cycles into a fresh Pandora draw (control)", () => {
    const state = readyAdventure("p173-nosilver");
    state.players.p1.army = []; // no silver (indeed no units at all)
    state.players.p1.hand = ["pandora.silver_refresh"];
    const deckBefore = state.adventure!.pandoraDeck!.length;
    const handBefore = state.players.p1.hand.length - 1; // minus the played card

    const after = playCardFromHand(state, "pandora.silver_refresh");
    // No interactive choice — it drew a replacement Pandora card into hand.
    expect(after.adventure!.pendingVisit).toBeNull();
    expect(after.pendingChoice).toBeNull();
    expect(after.adventure!.pandoraDeck!.length).toBe(deckBefore - 1);
    expect(after.players.p1.hand.length).toBe(handBefore + 1);
    // The drawn replacement is a Pandora card.
    const drawn = after.players.p1.hand[after.players.p1.hand.length - 1];
    expect(drawn.startsWith("pandora.")).toBe(true);
  });

  it("option A reverses a Pack-side Silver unit to its Handful (Few) side", () => {
    const state = readyAdventure("p173-reverse");
    const silverId = anySilverUnitDefId();
    state.players.p1.army = [{ id: "p173_pack_silver", unitDefId: silverId, side: "pack" }];
    state.players.p1.hand = ["pandora.silver_refresh"];

    const played = playCardFromHand(state, "pandora.silver_refresh");
    const step = played.adventure!.pendingVisit!.steps[0];
    expect(step.type).toBe("CHOOSE_ONE");
    const reverseIndex = step.type === "CHOOSE_ONE" ? step.options.findIndex((o) => o.label.startsWith("Reverse")) : -1;
    expect(reverseIndex).toBeGreaterThanOrEqual(0);

    const reversed = resolveVisit(played, reverseIndex);
    const unit = reversed.players.p1.army.find((u) => u.id === "p173_pack_silver");
    expect(unit?.side).toBe("few"); // reversed to the Handful side
    expect(reversed.adventure!.pendingVisit).toBeNull();
  });

  it("option A is NOT offered when the only Silver is already on its Few side", () => {
    const state = readyAdventure("p173-few-only");
    const silverId = anySilverUnitDefId();
    state.players.p1.army = [{ id: "p173_few_silver", unitDefId: silverId, side: "few" }];
    state.players.p1.hand = ["pandora.silver_refresh"];

    const played = playCardFromHand(state, "pandora.silver_refresh");
    const step = played.adventure!.pendingVisit!.steps[0];
    // Only the discard-and-recruit option is offered (no Handful side to reverse to).
    expect(step.type === "CHOOSE_ONE" && step.options.every((o) => !o.label.startsWith("Reverse"))).toBe(true);
    expect(step.type === "CHOOSE_ONE" && step.options.some((o) => o.label.startsWith("Discard"))).toBe(true);
  });

  it("option B discards the Silver, then free-recruits 1 Bronze + 1 Silver (no gold spent)", () => {
    const state = readyAdventure("p173-recruit");
    const silverId = anySilverUnitDefId();
    state.players.p1.army = [{ id: "p173_sacrifice", unitDefId: silverId, side: "pack" }];
    state.players.p1.hand = ["pandora.silver_refresh"];
    state.players.p1.resources = { gold: 50, buildingMaterials: 50, valuables: 50 };
    const resourcesBefore = { ...state.players.p1.resources };

    const bronzeDeck = state.decks[NEUTRAL_DECK_IDS.bronze]!;
    const silverDeck = state.decks[NEUTRAL_DECK_IDS.silver]!;
    const bronzeDrawBefore = bronzeDeck.drawPile.length;
    const silverDrawBefore = silverDeck.drawPile.length;
    const bronzeDiscardBefore = bronzeDeck.discardPile.length;
    const silverDiscardBefore = silverDeck.discardPile.length;

    // Play, then choose option B (Discard 1 Silver …).
    let after = playCardFromHand(state, "pandora.silver_refresh");
    const top = after.adventure!.pendingVisit!.steps[0];
    const discardIndex = top.type === "CHOOSE_ONE" ? top.options.findIndex((o) => o.label.startsWith("Discard")) : -1;
    expect(discardIndex).toBeGreaterThanOrEqual(0);
    after = resolveVisit(after, discardIndex);
    // Only one Silver army unit -> no which-silver sub-choice; the Bronze free
    // recruit menu opens directly.
    let menu = after.adventure!.pendingVisit!.steps[0];
    expect(menu.type === "CHOOSE_ONE" && menu.prompt.includes("bronze")).toBe(true);
    // 3 bronze were drawn.
    expect(after.decks[NEUTRAL_DECK_IDS.bronze]!.drawPile.length).toBe(bronzeDrawBefore - 3);
    after = resolveVisit(after, 0); // recruit the first bronze

    // Then the Silver free recruit menu opens.
    menu = after.adventure!.pendingVisit!.steps[0];
    expect(menu.type === "CHOOSE_ONE" && menu.prompt.includes("silver")).toBe(true);
    expect(after.decks[NEUTRAL_DECK_IDS.silver]!.drawPile.length).toBe(silverDrawBefore - 3);
    after = resolveVisit(after, 0); // recruit the first silver

    expect(after.adventure!.pendingVisit).toBeNull();

    // The sacrificed Silver is gone; two free neutral units were added.
    expect(after.players.p1.army.find((u) => u.id === "p173_sacrifice")).toBeUndefined();
    const neutralAdds = after.players.p1.army.filter((u) => u.side === "neutral");
    expect(neutralAdds.length).toBe(2);
    // One is a bronze-tier neutral, the other a silver-tier neutral.
    const tiers = neutralAdds.map((u) => coreUnitDefinitions[u.unitDefId]?.tier).sort();
    expect(tiers).toEqual(["bronze", "silver"]);

    // Recruiting was FREE — no resources spent.
    expect(after.players.p1.resources).toEqual(resourcesBefore);

    // The 2 non-recruited units of each tier returned to their tier discard piles.
    expect(after.decks[NEUTRAL_DECK_IDS.bronze]!.discardPile.length).toBe(bronzeDiscardBefore + 2);
    expect(after.decks[NEUTRAL_DECK_IDS.silver]!.discardPile.length).toBe(silverDiscardBefore + 2);
  });
});

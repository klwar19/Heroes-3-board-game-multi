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
import { NEUTRAL_DECK_IDS, RESOURCE_GAIN_LEVEL_AMOUNTS } from "./adventure";
import type { GameEvent, ResourceCost, ResourceKind } from "./state";

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
// Pandora's Gift: Income — roll 1 Resource die, raise that income by a tier
// ===========================================================================

describe("Pandora's Gift: Income", () => {
  it("raises one resource's production by a full resource-gain level", () => {
    const state = readyAdventure("pandora-income");
    state.players.p1.hand = ["pandora.resource_income"];
    const before = { ...state.players.p1.production };

    const after = playCardFromHand(state, "pandora.resource_income");

    const changed = after.eventLog.find(
      (event): event is Extract<GameEvent, { type: "PRODUCTION_CHANGED" }> => event.type === "PRODUCTION_CHANGED"
    );
    expect(changed, "the income raise must log a PRODUCTION_CHANGED").toBeTruthy();
    const resource = changed!.resource;
    // The observable outcome: that resource's income rose by EXACTLY one tier,
    // and no other track moved.
    expect(after.players.p1.production[resource] - before[resource]).toBe(RESOURCE_GAIN_LEVEL_AMOUNTS[resource]);
    for (const other of Object.keys(before) as ResourceKind[]) {
      if (other !== resource) {
        expect(after.players.p1.production[other]).toBe(before[other]);
      }
    }
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
  it("draws 3 Neutral units and recruits one for half cost; the rest return to the deck", () => {
    const state = readyAdventure("pandora-recruits");
    state.players.p1.hand = ["pandora.neutral_recruits"];
    // Plenty of resources so a half-cost recruit is affordable.
    state.players.p1.resources = { gold: 99, buildingMaterials: 99, valuables: 99 };

    const bronze = state.decks[NEUTRAL_DECK_IDS.bronze]!;
    const drawPileBefore = bronze.drawPile.length;
    const discardBefore = bronze.discardPile.length;
    const armyBefore = state.players.p1.army.length;
    const resourcesBefore = { ...state.players.p1.resources };

    const played = playCardFromHand(state, "pandora.neutral_recruits");

    // The draw opened a one-of pick (3 fewer cards in the bronze draw pile).
    const visit = played.adventure!.pendingVisit;
    expect(visit, "the recruit offer should open a visit").toBeTruthy();
    const step = visit!.steps[0];
    expect(step.type).toBe("CHOOSE_ONE");
    expect(played.decks[NEUTRAL_DECK_IDS.bronze]!.drawPile.length).toBe(drawPileBefore - 3);

    // Recruit the first offered unit (option 0 is a "Recruit …" choice here).
    const recruited = apply(played, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });

    // Army gained exactly one neutral unit.
    expect(recruited.players.p1.army.length).toBe(armyBefore + 1);
    const gained = recruited.players.p1.army[recruited.players.p1.army.length - 1];
    expect(gained.side).toBe("neutral");

    // It cost HALF (rounded up) of that unit's printed recruit cost — proven by
    // the resource delta, not just that something was spent.
    const expected = halfCost(coreUnitDefinitions[gained.unitDefId]?.neutral?.cost ?? {});
    for (const resource of Object.keys(resourcesBefore) as ResourceKind[]) {
      const spent = resourcesBefore[resource] - recruited.players.p1.resources[resource];
      expect(spent, `${resource} spent`).toBe(expected[resource] ?? 0);
    }

    // The other two drawn units went back to the bronze discard pile.
    expect(recruited.decks[NEUTRAL_DECK_IDS.bronze]!.discardPile.length).toBe(discardBefore + 2);
    expect(recruited.adventure!.pendingVisit).toBeNull();
  });

  it("declining returns all three and recruits nothing (control)", () => {
    const state = readyAdventure("pandora-recruits-decline");
    state.players.p1.hand = ["pandora.neutral_recruits"];
    state.players.p1.resources = { gold: 99, buildingMaterials: 99, valuables: 99 };

    const bronze = state.decks[NEUTRAL_DECK_IDS.bronze]!;
    const discardBefore = bronze.discardPile.length;
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
    expect(declined.decks[NEUTRAL_DECK_IDS.bronze]!.discardPile.length).toBe(discardBefore + 3); // all 3 returned
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
    expect(removed.players.p1.discard).toContain("pandora.power_or_morale");
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

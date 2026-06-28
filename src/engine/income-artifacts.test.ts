import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import { startAdventureRound } from "./adventure";
import { describeCardEffect } from "./effects";
import { cardLibrary } from "@/data/cards/library";
import type { GameAction, GameState, PlayerId } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** A map-turn adventure state with p1 active and an empty economy. */
function mapState(seed: string): GameState {
  const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
  state.activePlayerId = "p1";
  state.players.p1.production = { gold: 0, buildingMaterials: 0, valuables: 0 };
  state.players.p1.permanents = [];
  return state;
}

function findPlay(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
  optionIndex: number
): Extract<GameAction, { type: "PLAY_CARD" }> | undefined {
  for (const entry of getLegalActions(state, playerId)) {
    const action = entry.action;
    if (action.type === "PLAY_CARD" && action.cardId === cardId && action.optionIndex === optionIndex) {
      return action;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Income permanents: Eversmoking Ring of Sulfur (1 valuables / Resources round,
// or remove for 2) and Inexhaustible Cart of Ore (1 building materials, or
// remove for 3). Their permanent side enters play; their instant side removes
// the card from the game for a one-off larger gain.
// ---------------------------------------------------------------------------

describe("Eversmoking Ring of Sulfur (income permanent)", () => {
  it("the permanent side puts the card into play (kept, not discarded)", () => {
    const state = mapState("eversmoking-enter");
    state.players.p1.hand = ["artifact.eversmoking_ring_of_sulfur"];

    const play = findPlay(state, "p1", "artifact.eversmoking_ring_of_sulfur", 0);
    expect(play, "the enter-play option should be offered on the map").toBeTruthy();

    const result = applyOk(state, play!);
    expect(result.players.p1.permanents).toEqual(["artifact.eversmoking_ring_of_sulfur"]);
    expect(result.players.p1.hand).not.toContain("artifact.eversmoking_ring_of_sulfur");
    expect(result.players.p1.discard).not.toContain("artifact.eversmoking_ring_of_sulfur");
  });

  it("pays 1 valuables at the start of a Resources round while in play", () => {
    const state = mapState("eversmoking-income");
    state.players.p1.permanents = ["artifact.eversmoking_ring_of_sulfur"];
    const before = state.players.p1.resources.valuables;
    state.round = 3; // an odd round after the first = a Resources round.

    startAdventureRound(state);
    expect(state.players.p1.resources.valuables).toBe(before + 1);
  });

  it("pays nothing on the first round or an Astrologers round", () => {
    const first = mapState("eversmoking-first");
    first.players.p1.permanents = ["artifact.eversmoking_ring_of_sulfur"];
    const beforeFirst = first.players.p1.resources.valuables;
    first.round = 1; // the opening round is not a Resources round.
    startAdventureRound(first);
    expect(first.players.p1.resources.valuables).toBe(beforeFirst);

    const astro = mapState("eversmoking-astro");
    astro.players.p1.permanents = ["artifact.eversmoking_ring_of_sulfur"];
    const beforeAstro = astro.players.p1.resources.valuables;
    astro.round = 4; // even round after the first = an Astrologers round.
    startAdventureRound(astro);
    expect(astro.players.p1.resources.valuables).toBe(beforeAstro);
  });

  it("pays nothing once it is no longer in play", () => {
    const state = mapState("eversmoking-not-in-play");
    // Card sits in hand and discard, never in play: no income.
    state.players.p1.hand = ["artifact.eversmoking_ring_of_sulfur"];
    state.players.p1.discard = ["artifact.eversmoking_ring_of_sulfur"];
    state.players.p1.permanents = [];
    const before = state.players.p1.resources.valuables;
    state.round = 3;

    startAdventureRound(state);
    expect(state.players.p1.resources.valuables).toBe(before);
  });

  it("describes both the income side and the remove side (tooltip)", () => {
    const text = describeCardEffect(cardLibrary["artifact.eversmoking_ring_of_sulfur"]);
    expect(text).toContain("each Resources round");
    expect(text).toContain("Remove this card");
  });

  it("the instant side removes the card from the game for 2 valuables", () => {
    const state = mapState("eversmoking-crack");
    state.players.p1.hand = ["artifact.eversmoking_ring_of_sulfur"];
    const before = state.players.p1.resources.valuables;

    const play = findPlay(state, "p1", "artifact.eversmoking_ring_of_sulfur", 1);
    expect(play, "the remove-for-2 option should be offered on the map").toBeTruthy();

    const result = applyOk(state, play!);
    expect(result.players.p1.resources.valuables).toBe(before + 2);
    // "Remove this card": it leaves the game (removed pile), not the discard, so
    // it can neither be re-drawn nor sit in play.
    expect(result.players.p1.removed).toContain("artifact.eversmoking_ring_of_sulfur");
    expect(result.players.p1.discard).not.toContain("artifact.eversmoking_ring_of_sulfur");
    expect(result.players.p1.permanents ?? []).not.toContain("artifact.eversmoking_ring_of_sulfur");
    expect(result.players.p1.hand).not.toContain("artifact.eversmoking_ring_of_sulfur");
  });
});

describe("Inexhaustible Cart of Ore (income permanent)", () => {
  it("pays 1 building materials at the start of a Resources round while in play", () => {
    const state = mapState("cart-ore-income");
    state.players.p1.permanents = ["artifact.inexhaustible_cart_of_ore"];
    const before = state.players.p1.resources.buildingMaterials;
    state.round = 5; // another Resources round.

    startAdventureRound(state);
    expect(state.players.p1.resources.buildingMaterials).toBe(before + 1);
  });

  it("the instant side removes the card from the game for 3 building materials", () => {
    const state = mapState("cart-ore-crack");
    state.players.p1.hand = ["artifact.inexhaustible_cart_of_ore"];
    const before = state.players.p1.resources.buildingMaterials;

    const play = findPlay(state, "p1", "artifact.inexhaustible_cart_of_ore", 1);
    expect(play, "the remove-for-3 option should be offered on the map").toBeTruthy();

    const result = applyOk(state, play!);
    expect(result.players.p1.resources.buildingMaterials).toBe(before + 3);
    expect(result.players.p1.removed).toContain("artifact.inexhaustible_cart_of_ore");
    expect(result.players.p1.permanents ?? []).not.toContain("artifact.inexhaustible_cart_of_ore");
  });
});

// ---------------------------------------------------------------------------
// The one-permanent limit applies to income permanents like any other: playing
// a second permanent discards the first, and vice versa — in combat as well as
// on the map. Income from a discarded permanent then stops.
// ---------------------------------------------------------------------------

describe("income permanents share the single permanent slot", () => {
  it("playing another permanent on the map discards the income permanent (income then stops)", () => {
    const state = mapState("evers-replaced-map");
    state.players.p1.permanents = ["artifact.eversmoking_ring_of_sulfur"];
    state.players.p1.hand = ["war_machine.first_aid_tent"];

    const played = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "war_machine.first_aid_tent",
      target: { type: "none" }
    });
    expect(played.players.p1.permanents).toEqual(["war_machine.first_aid_tent"]);
    expect(played.players.p1.discard).toContain("artifact.eversmoking_ring_of_sulfur");

    // With the ring discarded, the Resources round pays nothing for it.
    const before = played.players.p1.resources.valuables;
    played.round = 3;
    startAdventureRound(played);
    expect(played.players.p1.resources.valuables).toBe(before);
  });

  it("playing the income permanent discards an existing permanent and resumes income", () => {
    const state = mapState("evers-replaces-map");
    state.players.p1.permanents = ["war_machine.first_aid_tent"];
    state.players.p1.hand = ["artifact.eversmoking_ring_of_sulfur"];

    const play = findPlay(state, "p1", "artifact.eversmoking_ring_of_sulfur", 0);
    expect(play, "the enter-play option should be offered while another permanent is in play").toBeTruthy();

    const played = applyOk(state, play!);
    expect(played.players.p1.permanents).toEqual(["artifact.eversmoking_ring_of_sulfur"]);
    expect(played.players.p1.discard).toContain("war_machine.first_aid_tent");

    const before = played.players.p1.resources.valuables;
    played.round = 3;
    startAdventureRound(played);
    expect(played.players.p1.resources.valuables).toBe(before + 1);
  });

  it("playing another permanent DURING combat discards the income permanent (and vice versa)", () => {
    // createInitialGameState opens a combat with p1's griffins active, so a
    // permanent may enter play during the activation window.
    const state = createInitialGameState();
    if (!state.combat) {
      throw new Error("Expected combat setup.");
    }
    state.players.p1.permanents = ["artifact.eversmoking_ring_of_sulfur"];
    state.players.p1.hand = ["war_machine.first_aid_tent"];

    const played = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "war_machine.first_aid_tent",
      target: { type: "none" }
    });
    expect(played.players.p1.permanents).toEqual(["war_machine.first_aid_tent"]);
    expect(played.players.p1.discard).toContain("artifact.eversmoking_ring_of_sulfur");

    // Vice versa: the income permanent's enter-play side, played in combat,
    // discards the war machine.
    const back = createInitialGameState();
    back.players.p1.permanents = ["war_machine.first_aid_tent"];
    back.players.p1.hand = ["artifact.eversmoking_ring_of_sulfur"];
    const enterPlay = findPlay(back, "p1", "artifact.eversmoking_ring_of_sulfur", 0);
    expect(enterPlay, "the income permanent's enter-play side should be offered during combat").toBeTruthy();

    const swapped = applyOk(back, enterPlay!);
    expect(swapped.players.p1.permanents).toEqual(["artifact.eversmoking_ring_of_sulfur"]);
    expect(swapped.players.p1.discard).toContain("war_machine.first_aid_tent");
  });
});

// ---------------------------------------------------------------------------
// Cracking an income permanent open WHILE IT IS IN THE PERMANENT SLOT. The
// instant "Remove this card: gain …" side used to be reachable only from hand,
// so once a player chose the income side the burst gain was lost forever. Now an
// in-play income permanent can be cracked open for that one-off gain.
// ---------------------------------------------------------------------------

function findCrack(
  state: GameState,
  playerId: PlayerId,
  cardId: string
): Extract<GameAction, { type: "CRACK_PERMANENT" }> | undefined {
  for (const entry of getLegalActions(state, playerId)) {
    if (entry.action.type === "CRACK_PERMANENT" && entry.action.cardId === cardId) {
      return entry.action;
    }
  }
  return undefined;
}

describe("cracking an in-play income permanent open", () => {
  it("Eversmoking Ring in the permanent slot can be cracked for 2 valuables (removed from the game)", () => {
    const state = mapState("evers-crack-in-play");
    state.players.p1.permanents = ["artifact.eversmoking_ring_of_sulfur"];
    const before = state.players.p1.resources.valuables;

    const crack = findCrack(state, "p1", "artifact.eversmoking_ring_of_sulfur");
    expect(crack, "an in-play income permanent must offer a crack-open action").toBeTruthy();

    const result = applyOk(state, crack!);
    expect(result.players.p1.resources.valuables).toBe(before + 2);
    // Removed from the game, and no longer occupying the permanent slot.
    expect(result.players.p1.removed).toContain("artifact.eversmoking_ring_of_sulfur");
    expect(result.players.p1.permanents ?? []).not.toContain("artifact.eversmoking_ring_of_sulfur");
    expect(result.players.p1.discard).not.toContain("artifact.eversmoking_ring_of_sulfur");
    // With the ring gone, the next Resources round pays nothing for it.
    const afterValuables = result.players.p1.resources.valuables;
    result.round = 3;
    startAdventureRound(result);
    expect(result.players.p1.resources.valuables).toBe(afterValuables);
  });

  it("Inexhaustible Cart in the permanent slot can be cracked for 3 building materials", () => {
    const state = mapState("cart-crack-in-play");
    state.players.p1.permanents = ["artifact.inexhaustible_cart_of_ore"];
    const before = state.players.p1.resources.buildingMaterials;

    const crack = findCrack(state, "p1", "artifact.inexhaustible_cart_of_ore");
    expect(crack).toBeTruthy();

    const result = applyOk(state, crack!);
    expect(result.players.p1.resources.buildingMaterials).toBe(before + 3);
    expect(result.players.p1.removed).toContain("artifact.inexhaustible_cart_of_ore");
    expect(result.players.p1.permanents ?? []).not.toContain("artifact.inexhaustible_cart_of_ore");
  });

  it("CONTROL — a non-income permanent (war machine) offers NO crack-open action", () => {
    const state = mapState("war-machine-no-crack");
    state.players.p1.permanents = ["war_machine.first_aid_tent"];
    expect(findCrack(state, "p1", "war_machine.first_aid_tent")).toBeFalsy();
    // …but it can still be discarded from play the usual way.
    const discard = getLegalActions(state, "p1").find(
      (entry) => entry.action.type === "DISCARD_PERMANENT" && entry.action.cardId === "war_machine.first_aid_tent"
    );
    expect(discard).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Endless Purse of Gold (Major): gain 3 gold, or remove the card AND discard 2
// other cards from hand to gain 8 gold.
// ---------------------------------------------------------------------------

describe("Endless Purse of Gold", () => {
  it("the cheap side gains 3 gold and discards the card", () => {
    const state = mapState("purse-3");
    state.players.p1.hand = ["artifact.endless_purse_of_gold"];
    const before = state.players.p1.resources.gold;

    const play = findPlay(state, "p1", "artifact.endless_purse_of_gold", 0);
    expect(play, "the gain-3 option should be offered").toBeTruthy();

    const result = applyOk(state, play!);
    expect(result.players.p1.resources.gold).toBe(before + 3);
    expect(result.players.p1.discard).toContain("artifact.endless_purse_of_gold");
    expect(result.players.p1.removed).not.toContain("artifact.endless_purse_of_gold");
  });

  it("the big side removes the card, discards 2 other cards, and gains 8 gold", () => {
    const state = mapState("purse-8");
    state.players.p1.hand = ["artifact.endless_purse_of_gold", "stat.attack", "stat.defense"];
    const before = state.players.p1.resources.gold;

    const play = findPlay(state, "p1", "artifact.endless_purse_of_gold", 1);
    expect(play, "the remove-and-discard-2 option should be offered").toBeTruthy();

    const result = applyOk(state, { ...play!, costCardIds: ["stat.attack", "stat.defense"] });
    expect(result.players.p1.resources.gold).toBe(before + 8);
    // The Purse left the game; the two paid cards went to the discard pile.
    expect(result.players.p1.removed).toContain("artifact.endless_purse_of_gold");
    expect(result.players.p1.discard).toContain("stat.attack");
    expect(result.players.p1.discard).toContain("stat.defense");
    expect(result.players.p1.hand).toHaveLength(0);
  });

  it("the big side is not offered without 2 other cards to discard", () => {
    const state = mapState("purse-too-poor");
    state.players.p1.hand = ["artifact.endless_purse_of_gold", "stat.attack"];

    expect(findPlay(state, "p1", "artifact.endless_purse_of_gold", 1)).toBeFalsy();
    // The cheap side is still available.
    expect(findPlay(state, "p1", "artifact.endless_purse_of_gold", 0)).toBeTruthy();
  });
});

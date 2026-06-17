import { describe, expect, it } from "vitest";
import type { GameState, MapFieldState, PlayerId, VisitStep } from "./state";
import { beginFieldVisit, blackMarketOffers, getMainHero, getTownOfPlayer, NEUTRAL_DECK_IDS } from "./adventure";
import { resolveVisitStep } from "./adventure-reducer";
import { createAdventureGameState } from "./index";

function makeGame(): GameState {
  return createAdventureGameState({ seed: "loc", difficulty: "normal", rollFirstPlayer: false });
}

function injectField(state: GameState, location: string, difficulty?: number): MapFieldState {
  const field: MapFieldState = {
    spaceId: "50,50",
    tileInstanceId: "loc-tile",
    slot: 0,
    location,
    difficulty,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[field.spaceId] = field;
  const hero = getMainHero(state, "p1")!;
  hero.spaceId = field.spaceId;
  return field;
}

/** Picks the CHOOSE_ONE option whose label matches and resolves it. */
function choose(state: GameState, playerId: PlayerId, match: (label: string) => boolean): void {
  const step = state.adventure!.pendingVisit?.steps[0] as Extract<VisitStep, { type: "CHOOSE_ONE" }> | undefined;
  if (step?.type !== "CHOOSE_ONE") {
    throw new Error(`Expected a CHOOSE_ONE step, got ${step?.type ?? "none"}`);
  }
  const optionIndex = step.options.findIndex((option) => match(option.label));
  if (optionIndex < 0) {
    throw new Error(`No option matched among: ${step.options.map((option) => option.label).join(" | ")}`);
  }
  resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId, optionIndex });
}

describe("Library of Enlightenment", () => {
  it("pays 3 gold to swap a Statistic from hand for any other, up to twice", () => {
    const state = makeGame();
    const player = state.players.p1;
    player.hand = ["stat.attack"];
    player.discard = [];
    player.resources.gold = 10;
    injectField(state, "library_of_enlightenment");

    beginFieldVisit(state, getMainHero(state, "p1")!.id, "50,50", false);

    choose(state, "p1", (label) => label === "Pay 3 gold: remove Attack (hand)");
    choose(state, "p1", (label) => label === "Gain power");

    expect(player.removed).toContain("stat.attack");
    expect(player.hand).toContain("stat.power");
    expect(player.resources.gold).toBe(7);

    // A second swap is offered (remaining 1); decline it.
    choose(state, "p1", (label) => label === "Done");
    expect(state.adventure!.pendingVisit).toBeNull();
  });

  it("offers nothing when the player cannot pay", () => {
    const state = makeGame();
    state.players.p1.hand = ["stat.attack"];
    state.players.p1.resources.gold = 2;
    injectField(state, "library_of_enlightenment");
    beginFieldVisit(state, getMainHero(state, "p1")!.id, "50,50", false);
    expect(state.adventure!.pendingVisit).toBeNull();
  });
});

describe("Star Axis", () => {
  it("empowers a hand Statistic card of the same type and flags the field", () => {
    const state = makeGame();
    const player = state.players.p1;
    player.hand = ["stat.power"];
    const field = injectField(state, "star_axis");

    beginFieldVisit(state, getMainHero(state, "p1")!.id, "50,50", false);
    choose(state, "p1", (label) => label === "Empower Power");

    expect(player.removed).toContain("stat.power");
    expect(player.hand).toContain("stat.power.empowered");
    expect(field.flagOwnerId).toBe("p1");
  });
});

describe("Black Market", () => {
  it("buys an artifact from the discard pile at its rarity price", () => {
    const state = makeGame();
    const player = state.players.p1;
    player.resources.gold = 30;
    player.hand = [];

    // Artifact discard piles start empty, so seed one discarded artifact for
    // the Black Market to offer (as a prior turn's discard would).
    const artifactDeckId = state.decks["artifacts"] ? "artifacts" : "artifacts-minor";
    const seeded = state.decks[artifactDeckId].drawPile.pop()!;
    state.decks[artifactDeckId].discardPile.push(seeded);

    const offers = blackMarketOffers(state);
    expect(offers.length).toBeGreaterThan(0);
    const offer = offers[0];
    const goldBefore = player.resources.gold;

    injectField(state, "black_market");
    beginFieldVisit(state, getMainHero(state, "p1")!.id, "50,50", false);
    choose(state, "p1", (label) => label.startsWith("Buy"));

    expect(player.hand).toContain(offer.cardId);
    expect(state.decks[offer.deckId].discardPile).not.toContain(offer.cardId);
    expect(player.resources.gold).toBe(goldBefore - offer.price);
  });
});

describe("Elemental Conflux", () => {
  it("recruits one Elemental per Dwelling tier the player controls", () => {
    const state = makeGame();
    const player = state.players.p1;
    player.resources.gold = 40;
    const town = getTownOfPlayer(state, "p1")!;
    town.buildings.push("castle.dwelling_bronze"); // a bronze Dwelling

    const bronzeDeck = state.decks[NEUTRAL_DECK_IDS.bronze];
    const armyBefore = player.army.length;

    injectField(state, "elemental_conflux");
    beginFieldVisit(state, getMainHero(state, "p1")!.id, "50,50", false);
    choose(state, "p1", (label) => label.startsWith("Recruit"));

    expect(player.army.length).toBe(armyBefore + 1);
    const recruited = player.army.at(-1)!;
    expect(recruited.side).toBe("neutral");
    expect(recruited.unitDefId).toContain("elemental");
    // The recruited card left the bronze Neutral deck.
    expect(bronzeDeck.drawPile).not.toContain(recruited.unitDefId);
  });
});

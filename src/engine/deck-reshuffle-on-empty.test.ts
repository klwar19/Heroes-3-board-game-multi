import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import { processPendingVisit } from "./adventure";
import { openSharedDeckSearch } from "./adventure-reducer";
import { digFromOwnDeckTop } from "./decks";
import type { FactionId } from "@/data/factions/types";
import type { GameAction, GameState } from "./state";

// ---------------------------------------------------------------------------
// "The deck ran out" is never the end of a draw.
//
// Reported bug: Jeddite's Mysterious Warlock I could not be played at all once
// the deck hit 0 cards, even with a full discard pile — the offer keyed off
// `deck.length > 0` and the dig popped the deck raw. The printed card says
// "Draw up to 3 cards from your deck", and the board-game rule for an emptied
// deck is to shuffle the discard pile back in and keep drawing.
//
// The fix is ONE seam — `digFromOwnDeckTop` (own Might & Magic deck) and
// `reshuffleSharedDeckIfEmpty` (shared decks) — so every dig behaves the same.
// Each test below fails if its wiring is removed, and each carries a CONTROL.
// ---------------------------------------------------------------------------

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** A two-player adventure game with p1 on the given hero, ready for a map play. */
function adventureState(seed: string, heroDefId: string, factionId: FactionId): GameState {
  const game = createAdventureGameState({
    seed,
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: "Hero", factionId, heroDefId },
      { id: "p2", name: "Foe", factionId: "castle", heroDefId: "catherine" }
    ]
  });
  const state =
    game.players.p1.needsHandRefresh || game.players.p1.canMulligan
      ? applyOk(game, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : game;
  state.activePlayerId = "p1";
  state.pendingChoice = null;
  state.reactionWindow = null;
  if (state.adventure) {
    state.adventure.rewardQueue = [];
    state.adventure.pendingVisit = null;
  }
  return state;
}

function findPlay(state: GameState, cardId: string, optionIndex?: number) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      (optionIndex === undefined || legal.action.optionIndex === optionIndex)
  );
}

// ===========================================================================
// The shared helper's contract
// ===========================================================================

describe("digFromOwnDeckTop — the one own-deck draw seam", () => {
  it("shuffles the discard pile back in mid-dig and keeps going", () => {
    const state = adventureState("dig-helper", "jeddite", "dungeon");
    state.players.p1.deck = ["stat.attack"];
    state.players.p1.discard = ["stat.defense", "stat.power"];

    const dig = digFromOwnDeckTop(state, "p1", 3, "test");

    expect(dig.cardIds).toHaveLength(3);
    expect(dig.reshuffledDiscard).toBe(true);
    expect([...dig.cardIds].sort()).toEqual(["stat.attack", "stat.defense", "stat.power"]);
    // Every dug card left both piles exactly once — nothing conjured, nothing lost.
    expect(state.players.p1.deck).toEqual([]);
    expect(state.players.p1.discard).toEqual([]);
  });

  it("stops (never loops) when both piles are empty, and reports no reshuffle when none was needed", () => {
    const state = adventureState("dig-helper-empty", "jeddite", "dungeon");
    state.players.p1.deck = ["stat.attack", "stat.defense"];
    state.players.p1.discard = [];

    // Asking for far more than exists must terminate with exactly what existed.
    const dig = digFromOwnDeckTop(state, "p1", 99, "test");
    expect(dig.cardIds).toHaveLength(2);
    expect(dig.reshuffledDiscard).toBe(false);

    // CONTROL: a second dig on two empty piles digs nothing and still returns.
    expect(digFromOwnDeckTop(state, "p1", 5, "test").cardIds).toEqual([]);
  });

  it("holds the card being played OUT of the reshuffle, so an effect can never deal itself back", () => {
    const state = adventureState("dig-helper-played", "jeddite", "dungeon");
    state.players.p1.deck = [];
    // The played card is already in the discard when its own effect resolves.
    state.players.p1.discard = ["specialty.jeddite.1", "stat.attack"];

    const dig = digFromOwnDeckTop(state, "p1", 3, "test", { inFlightCardIds: ["specialty.jeddite.1"] });

    expect(dig.cardIds).toEqual(["stat.attack"]);
    expect(dig.cardIds).not.toContain("specialty.jeddite.1");
    expect(state.players.p1.discard).toEqual(["specialty.jeddite.1"]);

    // CONTROL: without the flag the same dig DOES pick that card up — proving the
    // hold is what keeps a played card spent.
    const control = adventureState("dig-helper-played-control", "jeddite", "dungeon");
    control.players.p1.deck = [];
    control.players.p1.discard = ["specialty.jeddite.1", "stat.attack"];
    expect(digFromOwnDeckTop(control, "p1", 3, "test").cardIds).toHaveLength(2);
  });

  it("holds every in-flight card while allowing a genuine duplicate to reshuffle", () => {
    const state = adventureState("dig-helper-in-flight", "jeddite", "dungeon");
    state.players.p1.deck = [];
    state.players.p1.discard = [
      "spell.fly",
      "artifact.tunic_of_the_cyclops_king",
      "spell.fly",
      "stat.attack"
    ];

    const dig = digFromOwnDeckTop(state, "p1", 4, "test", {
      inFlightCardIds: ["spell.fly", "artifact.tunic_of_the_cyclops_king"]
    });

    expect(dig.cardIds.sort()).toEqual(["spell.fly", "stat.attack"]);
    expect(state.players.p1.discard).toEqual([
      "spell.fly",
      "artifact.tunic_of_the_cyclops_king"
    ]);
  });
});

// ===========================================================================
// Jeddite's Mysterious Warlock I / VI — the reported bug
// ===========================================================================

describe("Mysterious Warlock I with an emptied deck", () => {
  it("is OFFERED when the deck is empty but the discard pile still holds cards", () => {
    const state = adventureState("warlock-offer", "jeddite", "dungeon");
    state.players.p1.hand = ["specialty.jeddite.1"];
    state.players.p1.deck = [];
    state.players.p1.discard = ["stat.attack", "spell.magic_arrow"];

    expect(findPlay(state, "specialty.jeddite.1", 0), "an empty deck must not block the dig").toBeTruthy();
  });

  it("CONTROL: with the deck AND the discard pile empty there is nothing to dig, so it is not offered", () => {
    const state = adventureState("warlock-offer-control", "jeddite", "dungeon");
    state.players.p1.hand = ["specialty.jeddite.1"];
    state.players.p1.deck = [];
    state.players.p1.discard = [];

    expect(findPlay(state, "specialty.jeddite.1", 0)).toBeFalsy();
  });

  it("reshuffles the discard pile and really digs 3 — the Spell and the Specialty reach the hand", () => {
    const state = adventureState("warlock-dig", "jeddite", "dungeon");
    state.players.p1.hand = ["specialty.jeddite.1"];
    state.players.p1.deck = [];
    state.players.p1.discard = ["spell.magic_arrow", "specialty.gem.1", "stat.attack"];

    const after = applyOk(state, findPlay(state, "specialty.jeddite.1", 0)!.action);

    // Dug all three: both matches kept, the Statistic binned.
    expect(after.players.p1.hand).toContain("spell.magic_arrow");
    expect(after.players.p1.hand).toContain("specialty.gem.1");
    expect(after.players.p1.hand).not.toContain("stat.attack");
    expect(after.players.p1.discard).toContain("stat.attack");
    // The dig is reported honestly (it used to hardcode reshuffledDiscard: false).
    const drawn = [...after.eventLog].reverse().find((event) => event.type === "CARDS_DRAWN");
    expect(drawn && "reshuffledDiscard" in drawn && drawn.reshuffledDiscard).toBe(true);
  });

  it("never digs the specialty back into the hand — the played card stays spent", () => {
    const state = adventureState("warlock-self", "jeddite", "dungeon");
    state.players.p1.hand = ["specialty.jeddite.1"];
    state.players.p1.deck = [];
    state.players.p1.discard = ["stat.attack"];

    const after = applyOk(state, findPlay(state, "specialty.jeddite.1", 0)!.action);

    expect(after.players.p1.hand).not.toContain("specialty.jeddite.1");
    expect(after.players.p1.discard).toContain("specialty.jeddite.1");
    // It dug the one other card that was there, and stopped.
    expect(after.players.p1.deck).toEqual([]);
  });

  it("a rejected card is never re-dealt by the same dig", () => {
    const state = adventureState("warlock-once", "jeddite", "dungeon");
    state.players.p1.hand = ["specialty.jeddite.6"]; // digs 4
    state.players.p1.deck = [];
    state.players.p1.discard = ["stat.attack", "stat.defense"];

    const after = applyOk(state, findPlay(state, "specialty.jeddite.6", 0)!.action);

    // Two cards existed, so exactly two are in the discard beside the played card
    // — a reshuffle of this dig's own rejects would have shown them again.
    expect(after.players.p1.discard.filter((cardId) => cardId === "stat.attack")).toHaveLength(1);
    expect(after.players.p1.discard.filter((cardId) => cardId === "stat.defense")).toHaveLength(1);
    expect(after.players.p1.deck).toEqual([]);
  });
});

// ===========================================================================
// The other own-deck digs obey the same rule
// ===========================================================================

describe("Solmyr's Chain Lightning IV (dig 3, keep 1)", () => {
  // Chain Lightning IV is a combat play, so this uses the combat sandbox state.
  function solmyrCombat(seed: string, deck: string[], discard: string[]): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = ["specialty.solmyr.4"];
    state.players.p1.deck = deck;
    state.players.p1.discard = discard;
    return state;
  }

  it("reshuffles so the dig still reaches 3 cards to choose from", () => {
    const state = solmyrCombat("solmyr-reshuffle", ["stat.attack"], ["stat.defense", "stat.power"]);
    const after = applyOk(state, findPlay(state, "specialty.solmyr.4")!.action);

    expect(after.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (after.pendingChoice?.type === "OPTION_CHOICE") {
      expect(after.pendingChoice.context).toBe("own-deck-pick");
      expect(after.pendingChoice.ownDeckPick?.cardIds).toHaveLength(3);
    }
  });

  it("CONTROL: with an empty discard pile only the one deck card is revealed (auto-kept, no choice)", () => {
    const state = solmyrCombat("solmyr-control", ["stat.attack"], []);
    const after = applyOk(state, findPlay(state, "specialty.solmyr.4")!.action);

    expect(after.pendingChoice).toBeNull();
    expect(after.players.p1.hand).toContain("stat.attack");
  });
});

describe("Adrienne's Fire Magic IV (Search 3 your own deck, then reshuffle)", () => {
  it("reshuffles mid-reveal so the Search really shows 3", () => {
    const state = adventureState("adrienne-reshuffle", "adrienne", "fortress");
    state.players.p1.hand = ["specialty.adrienne.4"];
    state.players.p1.deck = ["stat.attack"];
    state.players.p1.discard = ["stat.defense", "stat.power"];

    const after = applyOk(state, findPlay(state, "specialty.adrienne.4")!.action);

    expect(after.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (after.pendingChoice?.type === "OPTION_CHOICE") {
      expect(after.pendingChoice.ownDeckPick?.cardIds).toHaveLength(3);
    }
  });

  it("CONTROL: nothing to reshuffle → the single revealed card is taken with no choice", () => {
    const state = adventureState("adrienne-control", "adrienne", "fortress");
    state.players.p1.hand = ["specialty.adrienne.4"];
    state.players.p1.deck = ["stat.attack"];
    state.players.p1.discard = [];

    const after = applyOk(state, findPlay(state, "specialty.adrienne.4")!.action);

    expect(after.pendingChoice).toBeNull();
    expect(after.players.p1.hand).toContain("stat.attack");
  });
});

// ===========================================================================
// Conflux Magic University — a SHARED Spell-deck dig offered as a replacement
// for a real Spell Search. It discards from the shared Spell deck until it
// finds the chosen school's first takeable Spell, and it takes the same
// one-seam contract as every other dig (`reshuffleSharedDeckIfEmpty`): the
// draw pile running out never ends the dig, and this dig's own rejects are held
// ASIDE so a reshuffle can never deal them back.
// ===========================================================================

describe("Conflux Magic University dig", () => {
  function confluxUniversityGame(seed: string): GameState {
    const state = adventureState(seed, "monere", "conflux");
    const town = Object.values(state.towns).find((candidate) => candidate.controllerId === "p1");
    if (!town) {
      throw new Error("no Conflux town");
    }
    if (!town.buildings.includes("conflux.magic_university")) {
      town.buildings.push("conflux.magic_university");
    }
    state.players.p1.hand = [];
    return state;
  }

  function universityAirOffer(state: GameState) {
    return getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CHOOSE_OPTION" && /Magic University:.*Air Magic spell/.test(legal.label)
    );
  }

  it("keeps digging through a reshuffled discard pile to find the school's Spell", () => {
    const state = confluxUniversityGame("university-reshuffle");
    state.decks.spells!.drawPile = ["stat.attack"];
    // The only Air spell is buried in the DISCARD pile — reachable only by
    // reshuffling once the one-card draw pile runs out.
    state.decks.spells!.discardPile = ["spell.lightning_bolt"];
    openSharedDeckSearch(state, "p1", "spells", 2);
    const offer = universityAirOffer(state);
    expect(offer, "the Air-school University replacement should be offered").toBeTruthy();

    const next = applyOk(state, offer!.action);

    expect(next.players.p1.hand).toContain("spell.lightning_bolt");
    // The rejected Statistic ended in the discard exactly ONCE (rejects are held
    // aside during the dig, so they can never be reshuffled and re-read).
    expect(next.decks.spells!.discardPile).toEqual(["stat.attack"]);
    expect(next.decks.spells!.drawPile).toEqual([]);
    expect(next.players.p1.magicUniversityUsedRound).toBe(next.round);
  });

  it("CONTROL: no matching Spell anywhere — the dig ends, every card lands in the discard", () => {
    const state = confluxUniversityGame("university-miss");
    state.decks.spells!.drawPile = ["stat.attack"];
    state.decks.spells!.discardPile = ["stat.defense"];
    openSharedDeckSearch(state, "p1", "spells", 2);
    const offer = universityAirOffer(state);
    expect(offer).toBeTruthy();

    const next = applyOk(state, offer!.action);

    expect(next.players.p1.hand).toEqual([]);
    expect([...next.decks.spells!.discardPile].sort()).toEqual(["stat.attack", "stat.defense"]);
    expect(next.decks.spells!.drawPile).toEqual([]);
  });
});

// ===========================================================================
// Shared decks: the same rule for "draw / reveal the top card"
// ===========================================================================

describe("Tazar's War Hero VI (draw the top Artifact card)", () => {
  function tazarState(seed: string): GameState {
    const state = adventureState(seed, "tazar", "fortress");
    state.players.p1.hand = ["specialty.tazar.6", "stat.attack"];
    state.players.p1.discard = [];
    // Every Artifact deck's draw pile is emptied into its discard pile — the
    // normal late-game state after enough Searches.
    for (const deckId of ["artifacts", "artifacts-minor", "artifacts-major", "artifacts-relic"]) {
      const deck = state.decks[deckId];
      if (deck) {
        deck.discardPile = [...deck.discardPile, ...deck.drawPile];
        deck.drawPile = [];
      }
    }
    return state;
  }

  it("is still offered, and the draw reshuffles the deck's discard pile to find a card", () => {
    const state = tazarState("tazar-reshuffle");
    const play = findPlay(state, "specialty.tazar.6", 0);
    expect(play, "an emptied draw pile must not kill the draw").toBeTruthy();

    const played = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.tazar.6",
      mode: "basic",
      optionIndex: 0,
      target: { type: "none" },
      costCardIds: ["stat.attack"]
    });

    const choice = played.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" && choice.context).toBe("artifact-deck-pick");
    const deckIds = choice?.type === "OPTION_CHOICE" ? (choice.artifactDeckPick?.deckIds ?? []) : [];
    const minorIndex = deckIds.indexOf("artifacts-minor");
    expect(minorIndex, "a deck whose cards are all in its discard pile is still drawable").toBeGreaterThanOrEqual(0);

    const handBefore = played.players.p1.hand.length;
    const drawn = applyOk(played, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: (choice as { id: string }).id,
      optionIndex: minorIndex
    });

    expect(drawn.players.p1.hand.length).toBe(handBefore + 1);
    expect(drawn.pendingChoice).toBeNull();
    // The draw reports the reshuffle honestly (it used to hardcode false).
    const event = [...drawn.eventLog].reverse().find((entry) => entry.type === "CARDS_DRAWN");
    expect(event && "reshuffledDiscard" in event && event.reshuffledDiscard).toBe(true);
  });

  it("CONTROL: a draw off a stocked pile reports no reshuffle", () => {
    const state = adventureState("tazar-no-reshuffle", "tazar", "fortress");
    state.players.p1.hand = ["specialty.tazar.6", "stat.attack"];
    state.players.p1.discard = [];
    const played = applyOk(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.tazar.6",
      mode: "basic",
      optionIndex: 0,
      target: { type: "none" },
      costCardIds: ["stat.attack"]
    });
    const choice = played.pendingChoice;
    const deckIds = choice?.type === "OPTION_CHOICE" ? (choice.artifactDeckPick?.deckIds ?? []) : [];
    const minorIndex = Math.max(0, deckIds.indexOf("artifacts-minor"));
    const drawn = applyOk(played, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: (choice as { id: string }).id,
      optionIndex: minorIndex
    });
    const event = [...drawn.eventLog].reverse().find((entry) => entry.type === "CARDS_DRAWN");
    expect(event && "reshuffledDiscard" in event && event.reshuffledDiscard).toBe(false);
  });

  it("CONTROL: with every Artifact deck completely empty it is not offered", () => {
    const state = tazarState("tazar-control");
    for (const deckId of ["artifacts", "artifacts-minor", "artifacts-major", "artifacts-relic"]) {
      const deck = state.decks[deckId];
      if (deck) {
        deck.drawPile = [];
        deck.discardPile = [];
      }
    }
    expect(findPlay(state, "specialty.tazar.6", 0)).toBeFalsy();
  });
});

describe("Witch Hut (reveal the top Ability card)", () => {
  function witchHutState(seed: string): GameState {
    const state = adventureState(seed, "catherine", "castle");
    state.players.p1.hand = [];
    state.players.p1.deck = [];
    state.players.p1.discard = [];
    const heroId = Object.values(state.heroes).find((hero) => hero.controllerId === "p1")!.id;
    const fieldId = Object.keys(state.adventure!.fields)[0];
    state.adventure!.pendingVisit = { heroId, playerId: "p1", fieldId, steps: [{ type: "WITCH_HUT" }] };
    return state;
  }

  it("reshuffles an emptied Ability draw pile instead of finding nothing to show", () => {
    const state = witchHutState("witch-reshuffle");
    state.decks.abilities.drawPile = [];
    state.decks.abilities.discardPile = ["ability.luck"];

    processPendingVisit(state);

    const step = state.adventure!.pendingVisit!.steps[0];
    expect(step.type).toBe("CHOOSE_ONE");
    if (step.type === "CHOOSE_ONE") {
      expect(step.prompt).toContain("Luck");
    }
  });

  it("CONTROL: both piles empty — the Witch Hut honestly finds nothing", () => {
    const state = witchHutState("witch-control");
    state.decks.abilities.drawPile = [];
    state.decks.abilities.discardPile = [];

    processPendingVisit(state);

    expect(state.eventLog.some((event) => "message" in event && String(event.message).includes("Witch Hut finds no"))).toBe(
      true
    );
  });
});

describe("Necromancy Amplifier (dig the Ability deck for Necromancy)", () => {
  function necroState(seed: string): GameState {
    const state = adventureState(seed, "sandro", "necropolis");
    state.players.p1.hand = [];
    state.players.p1.deck = [];
    state.players.p1.discard = [];
    const heroId = Object.values(state.heroes).find((hero) => hero.controllerId === "p1")!.id;
    const fieldId = Object.keys(state.adventure!.fields)[0];
    state.adventure!.pendingVisit = { heroId, playerId: "p1", fieldId, steps: [{ type: "NECROMANCY_FETCH" }] };
    return state;
  }

  it("finds a Necromancy card sitting in the Ability deck's discard pile", () => {
    const state = necroState("necro-reshuffle");
    state.decks.abilities.drawPile = [];
    state.decks.abilities.discardPile = ["ability.luck", "ability.necromancy"];

    processPendingVisit(state);

    expect(state.players.p1.hand).toContain("ability.necromancy");
  });

  it("CONTROL: no Necromancy anywhere in the deck — the search comes up empty and ends", () => {
    const state = necroState("necro-control");
    state.decks.abilities.drawPile = [];
    state.decks.abilities.discardPile = ["ability.luck"];

    processPendingVisit(state);

    expect(state.players.p1.hand).not.toContain("ability.necromancy");
    // Nothing was destroyed: the searched card is back in the deck.
    expect([...state.decks.abilities.drawPile, ...state.decks.abilities.discardPile]).toContain("ability.luck");
  });
});

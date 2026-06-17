import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import { spellDeckBinhBasic, spellDeckLegacy } from "@/data/cards/spells";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  NEUTRAL_DECK_IDS,
  type GameAction,
  type GameState
} from "./index";

// ---------------------------------------------------------------------------
// Visions spell (Neutral-deck scry).
//
// "Instant: Draw cards from any Neutral Unit deck. You can discard any of them
// and return the remaining cards in any order: Power 0: 1 card; Power 1: 2;
// Power 2: 3." There is no Hero Power statistic on the map, so the Power level
// is paid the board-game way — discard other Spells (their printed +1 Power
// side) for +1 card each, offered interactively. So 0/1/2 discards scry 1/2/3.
// ---------------------------------------------------------------------------

function makeGame(): GameState {
  return createAdventureGameState({ seed: "visions-spell", difficulty: "normal", rollFirstPlayer: false });
}

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

/** Empties every Neutral tier deck except bronze, which is set to `cards`. */
function isolateBronze(state: GameState, cards: string[]): void {
  for (const tier of ["bronze", "silver", "gold", "azure"] as const) {
    const deck = state.decks[NEUTRAL_DECK_IDS[tier]];
    deck.drawPile = tier === "bronze" ? [...cards] : [];
    deck.discardPile = [];
  }
}

/** A player on their map turn holding Visions plus two extra Spells. */
function readyToScry(): GameState {
  const base = makeGame();
  const state = base.players.p1.needsHandRefresh
    ? apply(base, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
    : base;
  state.players.p1.hand = ["spell.visions", "spell.haste", "spell.slow"];
  return state;
}

function play(state: GameState): GameState {
  return apply(state, {
    type: "PLAY_CARD",
    playerId: "p1",
    cardId: "spell.visions",
    mode: "basic",
    target: { type: "none" }
  });
}

function choose(state: GameState, optionIndex: number): GameState {
  return apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: state.pendingChoice!.id, optionIndex });
}

describe("Visions card definition", () => {
  it("is an implemented Map Fire spell scrying a Neutral deck, no longer a stub", () => {
    const card = cardLibrary["spell.visions"];
    expect(card.implementationStatus).toBe("implemented");
    expect(card.tags).not.toContain("needs-implementation");
    expect(card.kind).toBe("spell");
    expect(card.timing).toBe("map");
    expect(card.spellLevel).toBe("basic");
    expect(card.spellSchools).toEqual(["fire"]);
    expect(card.effect.type).toBe("VISIONS_SCRY");
    if (card.effect.type === "VISIONS_SCRY") {
      expect(card.effect.cardsByPower).toEqual({ 0: 1, 1: 2, 2: 3 });
    }
  });

  it("is in the legacy and BINH-basic Spell decks (reachable in play)", () => {
    expect(spellDeckLegacy).toContain("spell.visions");
    expect(spellDeckBinhBasic).toContain("spell.visions");
  });

  it("is offered as a map play while a Neutral deck holds cards", () => {
    const state = readyToScry();
    const plays = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "PLAY_CARD" && legal.action.cardId === "spell.visions"
    );
    expect(plays.length).toBeGreaterThan(0);
  });
});

describe("Visions power scaling (discard Spells for +1 card)", () => {
  it("scrys 1 card at Power 0 when no Spell is available to boost it", () => {
    const state = readyToScry();
    state.players.p1.hand = ["spell.visions"]; // no power-source Spell to spend
    isolateBronze(state, ["n.a", "n.b", "n.c", "n.d"]);
    const played = play(state);
    // No boost choice — straight to the scry over a single card.
    expect(played.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (played.pendingChoice?.type === "OPTION_CHOICE") {
      expect(played.pendingChoice.context).toBe("visions-scry");
      expect(played.pendingChoice.visionsScry?.remaining).toHaveLength(1);
    }
    expect(played.players.p1.discard).toContain("spell.visions");
  });

  it("can decline the boost and scry 1 even with Spells in hand", () => {
    const state = readyToScry();
    isolateBronze(state, ["n.a", "n.b", "n.c"]);
    let played = play(state);
    // The boost choice: [discard haste, discard slow, scry now].
    const boostChoice = played.pendingChoice;
    expect(boostChoice?.type === "OPTION_CHOICE" && boostChoice.context).toBe("visions-boost");
    const scryNowIndex = boostChoice?.type === "OPTION_CHOICE" ? boostChoice.options.length - 1 : 0;
    played = choose(played, scryNowIndex); // decline the boost

    expect(played.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (played.pendingChoice?.type === "OPTION_CHOICE") {
      expect(played.pendingChoice.context).toBe("visions-scry");
      expect(played.pendingChoice.visionsScry?.remaining).toHaveLength(1);
    }
    // The two Spells stayed in hand (no boost paid).
    expect(played.players.p1.hand).toEqual(expect.arrayContaining(["spell.haste", "spell.slow"]));
  });

  it("scrys 3 cards at Power 2 after discarding two Spells (+1 each)", () => {
    const state = readyToScry();
    isolateBronze(state, ["n.a", "n.b", "n.c", "n.d"]);
    let played = play(state);
    // Boost #1: discard Haste (option 0).
    expect(played.pendingChoice?.type === "OPTION_CHOICE" && played.pendingChoice.context).toBe("visions-boost");
    played = choose(played, 0);
    // Boost #2: now only Slow remains — discard it (option 0).
    expect(played.pendingChoice?.type === "OPTION_CHOICE" && played.pendingChoice.context).toBe("visions-boost");
    if (played.pendingChoice?.type === "OPTION_CHOICE") {
      expect(played.pendingChoice.visionsBoost?.boost).toBe(1);
    }
    played = choose(played, 0);

    // Power 2 reached -> scry 3 cards.
    expect(played.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (played.pendingChoice?.type === "OPTION_CHOICE") {
      expect(played.pendingChoice.context).toBe("visions-scry");
      expect(played.pendingChoice.visionsScry?.remaining).toHaveLength(3);
    }
    // Visions plus both spent Spells are in the discard pile.
    expect(played.players.p1.hand).not.toContain("spell.haste");
    expect(played.players.p1.hand).not.toContain("spell.slow");
    expect(played.players.p1.discard).toEqual(
      expect.arrayContaining(["spell.visions", "spell.haste", "spell.slow"])
    );
  });
});

describe("Visions deck choice", () => {
  it("asks which Neutral deck to scry when more than one holds cards", () => {
    const state = readyToScry();
    state.players.p1.hand = ["spell.visions"]; // skip the boost step
    // All four tier decks are still populated from setup.
    let played = play(state);
    expect(played.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (played.pendingChoice?.type !== "OPTION_CHOICE") {
      throw new Error("expected a visions-deck choice");
    }
    expect(played.pendingChoice.context).toBe("visions-deck");
    expect(played.pendingChoice.visionsDeck?.tiers).toEqual(["bronze", "silver", "gold", "azure"]);

    played = choose(played, 0); // bronze
    expect(played.pendingChoice?.type).toBe("OPTION_CHOICE");
    if (played.pendingChoice?.type === "OPTION_CHOICE") {
      expect(played.pendingChoice.context).toBe("visions-scry");
      expect(played.pendingChoice.visionsScry?.tier).toBe("bronze");
    }
  });
});

describe("Visions scry — discard any and reorder the rest on top", () => {
  it("keeps the chosen cards on top in pick order (first kept drawn next) and discards the rest", () => {
    const state = readyToScry();
    // drawPile end is the top: drawing 3 reveals top -> "n.top", "n.mid", "n.bot".
    isolateBronze(state, ["n.bot", "n.mid", "n.top"]);

    let played = play(state);
    played = choose(played, 0); // boost #1: discard Haste
    played = choose(played, 0); // boost #2: discard Slow -> Power 2, scry 3

    // Step 1: remaining = [n.top, n.mid, n.bot]. Keep n.bot first (the third
    // "Put back" option, index 2).
    expect(
      played.pendingChoice?.type === "OPTION_CHOICE" && played.pendingChoice.visionsScry?.remaining
    ).toEqual(["n.top", "n.mid", "n.bot"]);
    played = choose(played, 2);

    // Step 2: remaining = [n.top, n.mid]. Discard n.mid (keep-count 2, so discard
    // options start at index 2; n.mid is index 3).
    expect(
      played.pendingChoice?.type === "OPTION_CHOICE" && played.pendingChoice.visionsScry?.remaining
    ).toEqual(["n.top", "n.mid"]);
    played = choose(played, 3);

    // Step 3: remaining = [n.top]. Keep it (option 0).
    expect(
      played.pendingChoice?.type === "OPTION_CHOICE" && played.pendingChoice.visionsScry?.remaining
    ).toEqual(["n.top"]);
    played = choose(played, 0);

    expect(played.pendingChoice).toBeNull();

    const bronze = played.decks[NEUTRAL_DECK_IDS.bronze];
    // Kept in order [n.bot, n.top]; the first kept (n.bot) ends on top (drawn
    // next), so the drawPile reads bottom -> top as [n.top, n.bot].
    expect(bronze.drawPile).toEqual(["n.top", "n.bot"]);
    expect(bronze.drawPile.at(-1)).toBe("n.bot");
    expect(bronze.discardPile).toEqual(["n.mid"]);
  });

  it("can discard the single revealed card at Power 0, leaving the deck shorter", () => {
    const state = readyToScry();
    state.players.p1.hand = ["spell.visions"];
    isolateBronze(state, ["n.a", "n.b"]);
    let played = play(state);
    expect(
      played.pendingChoice?.type === "OPTION_CHOICE" && played.pendingChoice.visionsScry?.remaining
    ).toEqual(["n.b"]);
    // Single card: option 0 keeps it, option 1 discards it. Discard it.
    played = choose(played, 1);

    const bronze = played.decks[NEUTRAL_DECK_IDS.bronze];
    expect(bronze.drawPile).toEqual(["n.a"]); // n.b drawn and not returned
    expect(bronze.discardPile).toEqual(["n.b"]);
    expect(played.pendingChoice).toBeNull();
  });
});

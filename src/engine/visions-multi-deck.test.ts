import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import { eliminatePlayer } from "./adventure";
import { balanceCard } from "./community-balance-cards";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  NEUTRAL_DECK_IDS,
  type CardId,
  type GameAction,
  type GameState
} from "./index";
import { getPlayerView } from "./player-view";
import { driveComputerPlayers } from "@/server/computer-runner";

/**
 * VISIONS — "Draw * cards from ANY Neutral Unit deckS", 2 / 4 / 6 by Power.
 *
 * USER REPORT (2026-08-26), verbatim: "POLISH BALANCE: Visions spell (with +2 SP
 * should take 6 cards from any decks). For now it takes only 4 cards and only
 * from 1 deck (you should be able to pick multiple decks)."
 *
 * The printed Polish Balance face (`public/assets/polish-balance/spell-visions.webp`)
 * reads: "Draw * cards from any Neutral Unit decks. You can discard any of them
 * and return the remaining cards in any order." with the Power ladder
 * `0: *2 · 1: *4 · 2: *6` (and the "or +1 Power" discard side). The classic scan
 * prints the same card at 1 / 2 / 3.
 *
 * TWO bugs, both pinned here by OUTCOME (how many cards are really lifted, and
 * out of which decks they really come):
 *
 *  1. POWER. The boost window granted a flat +1 per discarded card whatever the
 *     card printed, and the cast always started at Power 0 — so "+2 Power"
 *     (a printed +2 source, or +2 of standing Power) landed on rung 1 and scryed
 *     4 instead of 6. On top of that the rung lookup was an EXACT key read
 *     (`cardsByPower[power]`), so Power 3 fell back to the LOWEST rung.
 *  2. DECKS. One deck was picked once and the whole draw was locked to it.
 *
 * Every claim carries a pack-OFF CONTROL on the same setup (the classic card's
 * 1/2/3 ladder and its single generic "+1 Power" Spell discard are unchanged).
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function makeGame(seed: string, polish: boolean): GameState {
  const base = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    houseRules: { "polish-card-balance": polish }
  });
  const state =
    base.players.p1.needsHandRefresh || base.players.p1.canMulligan
      ? apply(base, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
      : base;
  state.activePlayerId = "p1";
  return state;
}

/** Stocks the four Neutral tier decks with identifiable placeholder cards. */
function stockDecks(state: GameState, counts: Partial<Record<"bronze" | "silver" | "gold" | "azure", number>>): void {
  for (const tier of ["bronze", "silver", "gold", "azure"] as const) {
    const deck = state.decks[NEUTRAL_DECK_IDS[tier]];
    const size = counts[tier] ?? 0;
    deck.drawPile = Array.from({ length: size }, (_, index) => `n.${tier}.${index}` as CardId);
    deck.discardPile = [];
  }
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
  return apply(state, {
    type: "CHOOSE_OPTION",
    playerId: "p1",
    choiceId: state.pendingChoice!.id,
    optionIndex
  });
}

function context(state: GameState): string | undefined {
  return state.pendingChoice?.type === "OPTION_CHOICE" ? state.pendingChoice.context : undefined;
}

function deckFrame(state: GameState) {
  const choice = state.pendingChoice;
  if (choice?.type !== "OPTION_CHOICE" || choice.context !== "visions-deck") {
    throw new Error(`expected a visions-deck window, got ${context(state) ?? "none"}`);
  }
  return { ...choice.visionsDeck!, options: choice.options.map((option) => option.label) };
}

function scryFrame(state: GameState) {
  const choice = state.pendingChoice;
  if (choice?.type !== "OPTION_CHOICE" || choice.context !== "visions-scry") {
    throw new Error(`expected a visions-scry window, got ${context(state) ?? "none"}`);
  }
  return choice.visionsScry!;
}

/** Walks the deck-pick loop taking ONE card at a time off the named tiers. */
function drawOneEach(state: GameState, tiers: ("bronze" | "silver" | "gold" | "azure")[]): GameState {
  let next = state;
  for (const tier of tiers) {
    const frame = deckFrame(next);
    const tierIndex = frame.tiers.indexOf(tier);
    expect(tierIndex, `${tier} deck should be offered`).toBeGreaterThanOrEqual(0);
    // Options are [draw all from each tier…, draw 1 from each tier…] while more
    // than one card is owed; with one card left only the per-tier half is there.
    const single = frame.count > 1 ? frame.tiers.length + tierIndex : tierIndex;
    next = choose(next, single);
  }
  return next;
}

describe("Visions — the printed face", () => {
  it("the Polish reprint scrys 2 / 4 / 6 from ANY Neutral Unit decks (classic 1 / 2 / 3)", () => {
    const polish = balanceCard(makeGame("visions-face", true), "spell.visions");
    expect(polish?.effect.type).toBe("VISIONS_SCRY");
    if (polish?.effect.type === "VISIONS_SCRY") {
      expect(polish.effect.cardsByPower).toEqual({ 0: 2, 1: 4, 2: 6 });
    }
    const classic = cardLibrary["spell.visions"];
    expect(classic.effect.type).toBe("VISIONS_SCRY");
    if (classic.effect.type === "VISIONS_SCRY") {
      expect(classic.effect.cardsByPower).toEqual({ 0: 1, 1: 2, 2: 3 });
    }
  });
});

describe("Visions — a source pays its PRINTED Power, not a flat +1", () => {
  /**
   * Ashes of Dispute is printed "+2 Power" (a school-agnostic statistic side),
   * so ONE discard must reach the Polish card's top rung: 6 cards.
   */
  function scryAfterOneDiscard(polish: boolean): number {
    const state = makeGame(`visions-plus2-${polish}`, polish);
    state.players.p1.hand = ["spell.visions" as CardId, PLUS_TWO_POWER_CARD];
    stockDecks(state, { bronze: 12 });
    let next = play(state);
    expect(context(next)).toBe("visions-boost");
    next = choose(next, 0); // discard the +2 Power source
    return scryFrame(next).remaining.length;
  }

  it("a printed '+2 Power' discard reaches the 6-card rung (was 4)", () => {
    expect(scryAfterOneDiscard(true)).toBe(6);
    // CONTROL — the classic 1/2/3 card tops out at 3 on the same +2 payment.
    expect(scryAfterOneDiscard(false)).toBe(3);
  });

  it("the offer LABEL names the printed Power the source really pays", () => {
    const state = makeGame("visions-label", true);
    state.players.p1.hand = ["spell.visions" as CardId, PLUS_TWO_POWER_CARD, "spell.haste" as CardId];
    stockDecks(state, { bronze: 12 });
    const next = play(state);
    const choice = next.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE") {
      throw new Error("expected the boost window");
    }
    const labels = choice.options.map((option) => option.label);
    expect(labels.some((label) => label.includes("+2 Power") && label.includes("scry 6"))).toBe(true);
    // A plain Spell still brings its generic +1 (rung 1 = 4 cards).
    expect(labels.some((label) => label.includes("+1 Power") && label.includes("scry 4"))).toBe(true);
  });

  it("CONTROL — two generic Spell discards still climb one rung each", () => {
    const state = makeGame("visions-two-spells", true);
    state.players.p1.hand = ["spell.visions" as CardId, "spell.haste" as CardId, "spell.slow" as CardId];
    stockDecks(state, { bronze: 12 });
    let next = play(state);
    expect(context(next)).toBe("visions-boost");
    next = choose(next, 0); // +1 -> rung 1
    expect(context(next)).toBe("visions-boost");
    next = choose(next, 0); // +1 -> rung 2
    expect(scryFrame(next).remaining).toHaveLength(6);
  });

  it("standing Power seeds the ladder: a banked +2 scrys 6 with NO discard", () => {
    const seeded = (polish: boolean) => {
      const state = makeGame(`visions-bank-${polish}`, polish);
      state.players.p1.hand = ["spell.visions" as CardId];
      // The map Sorcery/Scales bank — the same starting Power every other map
      // Power-tier cast reads (and consumes).
      state.players.p1.mapSpellPowerBank = 2;
      stockDecks(state, { bronze: 12 });
      const next = play(state);
      return { count: scryFrame(next).remaining.length, bank: next.players.p1.mapSpellPowerBank };
    };
    const on = seeded(true);
    expect(on.count).toBe(6);
    expect(on.bank).toBe(0); // consumed whole by the cast
    // CONTROL — the classic card's own top rung on the same +2.
    expect(seeded(false).count).toBe(3);
  });

  it("CONTROL — with no Power at all the printed Power-0 rung stands", () => {
    const zero = (polish: boolean) => {
      const state = makeGame(`visions-zero-${polish}`, polish);
      state.players.p1.hand = ["spell.visions" as CardId];
      stockDecks(state, { bronze: 12 });
      return scryFrame(play(state)).remaining.length;
    };
    expect(zero(true)).toBe(2);
    expect(zero(false)).toBe(1);
  });
});

describe("Visions — the draw may span SEVERAL Neutral decks", () => {
  it("6 cards can be split across four decks, and each goes back to its own", () => {
    const state = makeGame("visions-split", true);
    state.players.p1.hand = ["spell.visions" as CardId];
    state.players.p1.mapSpellPowerBank = 2; // top rung: 6 cards
    stockDecks(state, { bronze: 3, silver: 3, gold: 3, azure: 3 });
    let next = play(state);

    // Six single-card picks: bronze, silver, gold, azure, bronze, silver.
    next = drawOneEach(next, ["bronze", "silver", "gold", "azure", "bronze", "silver"]);

    const frame = scryFrame(next);
    expect(frame.remaining).toHaveLength(6);
    expect(frame.remainingTiers).toEqual(["bronze", "silver", "gold", "azure", "bronze", "silver"]);
    // The lifted cards really left their own decks (not one deck's top six).
    expect(next.decks[NEUTRAL_DECK_IDS.bronze].drawPile).toHaveLength(1);
    expect(next.decks[NEUTRAL_DECK_IDS.silver].drawPile).toHaveLength(1);
    expect(next.decks[NEUTRAL_DECK_IDS.gold].drawPile).toHaveLength(2);
    expect(next.decks[NEUTRAL_DECK_IDS.azure].drawPile).toHaveLength(2);

    // Keep the two gold/azure cards on top of their decks, discard the rest.
    for (let guard = 0; guard < 8 && context(next) === "visions-scry"; guard += 1) {
      const scry = scryFrame(next);
      const keepIndex = scry.remainingTiers!.findIndex((tier) => tier === "gold" || tier === "azure");
      next = choose(next, keepIndex >= 0 ? keepIndex : scry.remaining.length);
    }
    expect(next.pendingChoice).toBeNull();

    // Each card went home: the kept gold/azure cards sit on THEIR draw piles,
    // the bronze/silver picks in THEIR discard piles — nothing crossed decks.
    expect(next.decks[NEUTRAL_DECK_IDS.gold].drawPile.at(-1)).toBe("n.gold.2");
    expect(next.decks[NEUTRAL_DECK_IDS.azure].drawPile.at(-1)).toBe("n.azure.2");
    expect(next.decks[NEUTRAL_DECK_IDS.bronze].discardPile).toEqual(["n.bronze.2", "n.bronze.1"]);
    expect(next.decks[NEUTRAL_DECK_IDS.silver].discardPile).toEqual(["n.silver.2", "n.silver.1"]);
    expect(next.decks[NEUTRAL_DECK_IDS.gold].discardPile).toEqual([]);
    expect(next.decks[NEUTRAL_DECK_IDS.azure].discardPile).toEqual([]);
    // No card was created or destroyed: 12 stocked, 12 still in the decks.
    const total = (["bronze", "silver", "gold", "azure"] as const).reduce((sum, tier) => {
      const deck = next.decks[NEUTRAL_DECK_IDS[tier]];
      return sum + deck.drawPile.length + deck.discardPile.length;
    }, 0);
    expect(total).toBe(12);
  });

  it("a kept card returns to the TOP of its own deck (first kept is drawn next)", () => {
    const state = makeGame("visions-order", true);
    state.players.p1.hand = ["spell.visions" as CardId];
    stockDecks(state, { bronze: 3, silver: 3 }); // Power 0 -> 2 cards
    let next = play(state);
    next = drawOneEach(next, ["silver", "bronze"]);
    const frame = scryFrame(next);
    expect(frame.remainingTiers).toEqual(["silver", "bronze"]);
    // Keep both (option 0 each time, in the listed order).
    next = choose(next, 0);
    next = choose(next, 0);
    expect(next.pendingChoice).toBeNull();
    expect(next.decks[NEUTRAL_DECK_IDS.silver].drawPile.at(-1)).toBe("n.silver.2");
    expect(next.decks[NEUTRAL_DECK_IDS.bronze].drawPile.at(-1)).toBe("n.bronze.2");
  });

  it("the classic single-deck draw is still ONE click (the leading 'draw all' option)", () => {
    const state = makeGame("visions-bulk", true);
    state.players.p1.hand = ["spell.visions" as CardId];
    state.players.p1.mapSpellPowerBank = 1; // rung 1 -> 4 cards
    stockDecks(state, { bronze: 6, silver: 6 });
    let next = play(state);
    const frame = deckFrame(next);
    expect(frame.count).toBe(4);
    expect(frame.options[0]).toContain("draw all 4");
    next = choose(next, 0); // all four off bronze
    const scry = scryFrame(next);
    expect(scry.remaining).toHaveLength(4);
    expect(new Set(scry.remainingTiers)).toEqual(new Set(["bronze"]));
    expect(next.decks[NEUTRAL_DECK_IDS.silver].drawPile).toHaveLength(6);
  });

  it("only one deck holding cards decides nothing — it takes the whole draw", () => {
    const state = makeGame("visions-single-deck", true);
    state.players.p1.hand = ["spell.visions" as CardId];
    state.players.p1.mapSpellPowerBank = 2;
    stockDecks(state, { bronze: 12 });
    const next = play(state);
    // No deck window at all: straight to the scry over six bronze cards.
    expect(context(next)).toBe("visions-scry");
    expect(scryFrame(next).remaining).toHaveLength(6);
  });

  it("a deck that runs dry mid-draw ends the draw with what it lifted", () => {
    const state = makeGame("visions-dry", true);
    state.players.p1.hand = ["spell.visions" as CardId];
    state.players.p1.mapSpellPowerBank = 2; // asks for 6
    stockDecks(state, { bronze: 2, silver: 1 });
    let next = play(state);
    next = drawOneEach(next, ["silver"]);
    // Bronze is now the only stocked deck: it hands over its last two and the
    // draw ends three cards short instead of stalling.
    const frame = scryFrame(next);
    expect(frame.remaining).toHaveLength(3);
    expect(frame.remainingTiers).toEqual(["silver", "bronze", "bronze"]);
  });

  it("an emptied draw pile reshuffles its own discard back in (and lifts no duplicate)", () => {
    const state = makeGame("visions-reshuffle", true);
    state.players.p1.hand = ["spell.visions" as CardId];
    state.players.p1.mapSpellPowerBank = 2; // 6 cards
    stockDecks(state, { bronze: 2 });
    const bronze = state.decks[NEUTRAL_DECK_IDS.bronze];
    bronze.discardPile = ["n.bronze.d0" as CardId, "n.bronze.d1" as CardId, "n.bronze.d2" as CardId];
    const next = play(state);
    const frame = scryFrame(next);
    // 2 in the draw pile + 3 reshuffled from the discard = 5 of the 6 asked for.
    expect(frame.remaining).toHaveLength(5);
    expect(new Set(frame.remaining).size).toBe(5); // no card lifted twice
    expect(bronzeTotal(next)).toBe(0); // every card is in the player's hands
  });
});

describe("Visions — masking and no-stall guarantees", () => {
  it("an opponent never sees the lifted card ids, in either window", () => {
    const state = makeGame("visions-mask", true);
    state.players.p1.hand = ["spell.visions" as CardId];
    state.players.p1.mapSpellPowerBank = 2;
    stockDecks(state, { bronze: 6, silver: 6 });
    let next = play(state);
    next = drawOneEach(next, ["bronze"]); // one lifted, deck window still open

    const deckView = viewOf(next, "p2");
    const deckChoice = deckView.pendingChoice;
    if (deckChoice?.type !== "OPTION_CHOICE") {
      throw new Error("expected the deck window in the opponent view");
    }
    expect(deckChoice.visionsDeck?.drawn).toEqual(["hidden"]);
    // The owner still sees their own cards.
    expect(deckFrame(next).drawn).not.toEqual(["hidden"]);

    next = choose(next, 0); // take the rest off bronze -> the scry opens
    const scryChoice = viewOf(next, "p2").pendingChoice;
    if (scryChoice?.type !== "OPTION_CHOICE") {
      throw new Error("expected the scry window in the opponent view");
    }
    expect(new Set(scryChoice.visionsScry!.remaining)).toEqual(new Set(["hidden"]));
    expect(scryChoice.visionsScry!.remainingTiers).toHaveLength(6);
  });

  it("eliminating the caster mid-DRAW returns every lifted card to its own deck", () => {
    const state = makeGame("visions-eliminate", true);
    state.players.p1.hand = ["spell.visions" as CardId];
    state.players.p1.mapSpellPowerBank = 2;
    stockDecks(state, { bronze: 6, silver: 6 });
    let next = play(state);
    next = drawOneEach(next, ["bronze", "silver"]);
    expect(bronzeTotal(next) + silverTotal(next)).toBe(10); // two cards are held

    const eliminated = eliminate(next, "p1");
    expect(eliminated.pendingChoice).toBeNull();
    expect(bronzeTotal(eliminated)).toBe(6);
    expect(silverTotal(eliminated)).toBe(6);
  });

  it("a computer seat drives the whole window chain without stalling", () => {
    // A real single-player table, so p2 is a genuine computer seat.
    const base = createAdventureGameState({
      seed: "visions-ai",
      difficulty: "normal",
      playerCount: 2,
      sessionMode: "single-player",
      rollFirstPlayer: false,
      houseRules: { "polish-card-balance": true }
    });
    base.activePlayerId = "p2";
    base.players.p2.needsHandRefresh = false;
    base.players.p2.canMulligan = false;
    base.players.p2.hand = ["spell.visions" as CardId, PLUS_TWO_POWER_CARD];
    stockDecks(base, { bronze: 6, silver: 6, gold: 6, azure: 6 });
    const played = applyAction(
      base,
      { type: "PLAY_CARD", playerId: "p2", cardId: "spell.visions", mode: "basic", target: { type: "none" } },
      { computerActorPlayerId: "p2" }
    );
    expect(played.errors.map((error) => error.message).join("; ")).toBe("");
    expect(context(played.state)).toBe("visions-boost");

    // The pump answers every Visions window the seat owns, ONE action at a time
    // so the assertions below see the moment the chain closes (the pump would
    // otherwise carry on with the rest of the computer's turn). The chain is
    // bounded: each deck pick lifts at least one card, each scry step spends one.
    let next = played.state;
    let steps = 0;
    while ((context(next) ?? "").startsWith("visions") && steps < 40) {
      steps += 1;
      const run = driveComputerPlayers(next, undefined, { maxSteps: 1 });
      // One decision per step: the seat always has a legal answer (a stall would
      // report zero decisions — the step LIMIT itself is reported as "stalled").
      expect(run.decisions.length, `the AI answered ${context(next)}`).toBe(1);
      next = run.state;
    }
    expect(steps).toBeGreaterThan(1); // it really walked a multi-step chain
    expect(context(next)).toBeUndefined();
    // Nothing was destroyed and nothing is stranded on a dropped choice.
    expect(
      (["bronze", "silver", "gold", "azure"] as const).reduce((sum, tier) => {
        const deck = next.decks[NEUTRAL_DECK_IDS[tier]];
        return sum + deck.drawPile.length + deck.discardPile.length;
      }, 0)
    ).toBe(24);
  });
});

// ---------------------------------------------------------------------------
// helpers that need the engine's own readers
// ---------------------------------------------------------------------------

/**
 * The Empowered Power statistic — a printed, school-agnostic "+2 Power" card,
 * i.e. exactly the "+2 SP" of the report. Its printed value is asserted here so
 * this fixture can never silently become a "+1" card.
 */
const PLUS_TWO_POWER_CARD = "stat.power.empowered" as CardId;

describe("Visions — the '+2 Power' fixture is really printed +2", () => {
  it("Empowered Power prints ADD_SPELL_POWER 2 with no school restriction", () => {
    expect(cardLibrary[PLUS_TWO_POWER_CARD].effect).toMatchObject({
      type: "ADD_SPELL_POWER",
      amount: 2
    });
    const effect = cardLibrary[PLUS_TWO_POWER_CARD].effect;
    expect(effect.type === "ADD_SPELL_POWER" && effect.schoolOnly).toBeUndefined();
  });
});

function bronzeTotal(state: GameState): number {
  const deck = state.decks[NEUTRAL_DECK_IDS.bronze];
  return deck.drawPile.length + deck.discardPile.length;
}

function silverTotal(state: GameState): number {
  const deck = state.decks[NEUTRAL_DECK_IDS.silver];
  return deck.drawPile.length + deck.discardPile.length;
}

function viewOf(state: GameState, playerId: "p1" | "p2"): GameState {
  return getPlayerView(state, playerId) as unknown as GameState;
}

function eliminate(state: GameState, playerId: "p1" | "p2"): GameState {
  const next = structuredClone(state);
  eliminatePlayer(next, playerId, "test", false);
  return next;
}

/** Sanity: the fixtures above really reach the engine's own offer gate. */
describe("Visions — still offered as a map play", () => {
  it("is playable while a Neutral deck holds cards", () => {
    const state = makeGame("visions-offer", true);
    state.players.p1.hand = ["spell.visions" as CardId];
    stockDecks(state, { bronze: 4 });
    expect(
      getLegalActions(state, "p1").some(
        (legal) =>
          (legal.action.type === "PLAY_CARD" || legal.action.type === "CAST_SPELL") &&
          legal.action.cardId === "spell.visions"
      )
    ).toBe(true);
  });
});

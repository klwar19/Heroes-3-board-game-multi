import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import { createInitialGameState } from "./setup";
import { pumpAdventureQueues } from "./adventure-reducer";
import { cardLibrary } from "@/data/cards/library";
import { EXPERT_SPELL_KEY_CARDS } from "./ruleset";
import type { ActiveEffectState, GameAction, GameState, PlayerId, SpellSchool } from "./state";

/**
 * Basic X Magic — the in-play spell-fetch permanent. "Instead of Searching the
 * Spell deck, find the first <School> Magic spell in it and take it into your
 * hand." The choice is offered UP FRONT (before any card is revealed): Search
 * the deck, or draw from a School of Magic. Drawing takes the first matching
 * spell straight into hand — you keep what you get. Both the up-front choice and
 * the auto-take are engine-enforced here.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function pushFetch(state: GameState, playerId: PlayerId, school: Exclude<SpellSchool, "any">): void {
  state.activeEffects.push({
    id: `fetch_${school}`,
    name: `Basic ${school} Magic`,
    scope: "player",
    duration: { type: "permanent" },
    polarity: "positive",
    removable: false,
    modifiers: [{ type: "SPELL_SCHOOL_FETCH", school }],
    source: { type: "card", cardId: `ability.basic_${school}_magic`, controllerId: playerId },
    controllerId: playerId,
    startedRound: state.round,
    startedCombatRound: state.combat?.round ?? 0,
    usedRollEventIds: [],
    usedChoiceIds: [],
    usedCombatRoundNumbers: []
  } satisfies ActiveEffectState);
}

const deckCount = (state: GameState, deckId: string) =>
  state.decks[deckId].drawPile.length + state.decks[deckId].discardPile.length;

describe("Basic X Magic — draw from a School of Magic instead of Searching", () => {
  it("offers an up-front Search-vs-Draw choice and takes the drawn spell straight into hand", () => {
    const state = createInitialGameState("fetch-search");
    state.activePlayerId = "p1";
    state.players.p1.hand = [];
    pushFetch(state, "p1", "air");
    // One Air spell (Haste), the rest Earth (Slow): only Haste matches Air.
    state.decks["spells"].drawPile = ["spell.haste", "spell.slow", "spell.slow", "spell.slow"];
    state.decks["spells"].discardPile = [];

    const searched = applyOk(state, { type: "SEARCH_DECK", playerId: "p1", deckId: "spells", count: 2 });

    // Up front — no cards revealed yet — the choice is Search OR draw from a School.
    expect(searched.pendingChoice?.type).toBe("OPTION_CHOICE");
    expect(searched.pendingChoice?.type === "OPTION_CHOICE" ? searched.pendingChoice.context : "").toBe(
      "deck-search-mode"
    );

    const options = getLegalActions(searched, "p1").filter((legal) => legal.action.type === "CHOOSE_OPTION");
    const searchOption = options.find((legal) => legal.action.type === "CHOOSE_OPTION" && legal.action.optionIndex === 0);
    const drawAir = options.find((legal) => /Air Magic/i.test(legal.label));
    expect(searchOption, "a plain Search option should be offered").toBeTruthy();
    expect(drawAir, "a 'Draw the first Air Magic spell' option should be offered up front").toBeTruthy();

    const before = deckCount(searched, "spells");

    // Draw from the School of Magic: take the first Air spell into hand. No reveal,
    // no keep/discard — the spell deck shrank by exactly that one card.
    const drawn = applyOk(searched, drawAir!.action);
    expect(drawn.pendingChoice).toBeNull();
    expect(drawn.players.p1.hand).toEqual(["spell.haste"]);
    expect((cardLibrary["spell.haste"]?.spellSchools ?? []).includes("air")).toBe(true);
    expect(deckCount(drawn, "spells")).toBe(before - 1);
    expect(drawn.decks["spells"].drawPile).not.toContain("spell.haste");
  });

  it("Search (the other branch) reveals the top cards to keep one — and the picks never include a fetch", () => {
    const state = createInitialGameState("fetch-search-branch");
    state.activePlayerId = "p1";
    state.players.p1.hand = [];
    pushFetch(state, "p1", "air");
    state.decks["spells"].drawPile = ["spell.haste", "spell.slow", "spell.slow", "spell.slow"];
    state.decks["spells"].discardPile = [];

    const searched = applyOk(state, { type: "SEARCH_DECK", playerId: "p1", deckId: "spells", count: 2 });
    const searchOption = getLegalActions(searched, "p1").find(
      (legal) => legal.action.type === "CHOOSE_OPTION" && legal.action.optionIndex === 0
    );
    expect(searchOption).toBeTruthy();

    const revealed = applyOk(searched, searchOption!.action);
    expect(revealed.pendingChoice?.type).toBe("DECK_SEARCH");
    const picks = getLegalActions(revealed, "p1").filter((legal) => legal.action.type === "RESOLVE_DECK_SEARCH");
    expect(picks.length).toBeGreaterThan(0);
    expect(
      picks.every((legal) => legal.action.type === "RESOLVE_DECK_SEARCH" && legal.action.pick.kind === "revealed")
    ).toBe(true);
  });

  it("counts each Basic X Magic as an Expert-spell key card, so a buy offers the basic-or-expert deck pick", () => {
    // The Mage-Guild purchase deducts gold and (with a key card owned) raises a
    // basic/expert deck pick before the search — see ruleset.test.ts. This pins
    // that every Basic X Magic is one of those key cards.
    for (const school of ["air", "earth", "fire", "water"] as const) {
      expect(EXPERT_SPELL_KEY_CARDS).toContain(`ability.basic_${school}_magic`);
    }
  });

  it("offers no Draw option when no Basic X Magic is in play (straight to the reveal)", () => {
    const state = createInitialGameState("fetch-none");
    state.activePlayerId = "p1";
    state.players.p1.hand = [];
    state.decks["spells"].drawPile = ["spell.haste", "spell.slow", "spell.slow"];
    state.decks["spells"].discardPile = [];

    const searched = applyOk(state, { type: "SEARCH_DECK", playerId: "p1", deckId: "spells", count: 2 });
    // No fetch and no discard top: nothing to choose up front, so it reveals.
    expect(searched.pendingChoice?.type).toBe("DECK_SEARCH");
  });
});

/**
 * USER DEMAND (2026-07): with SPLIT Spell decks, "choose discard, search or
 * school of magic" must be ONE up-front decision — never "choose search spell,
 * then the draw school of magic appear with that". The family deck-pick IS that
 * decision: it lists the deck searches, every acquirable discard top AND the
 * Basic X Magic school draw together, and committing to a Search reveals
 * DIRECTLY (the old second "Search or draw from a School?" step never opens).
 */
describe("One-step spells deck-pick — discard, search or School of Magic, up front", () => {
  function adventureWithFetch(seed: string, options: Record<string, unknown> = {}): GameState {
    let state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false, ...options });
    state.activePlayerId = "p1";
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    state.players.p1.permanents = ["ability.basic_fire_magic"];
    return state;
  }

  function queueSpellsFamilySearch(state: GameState, count = 3): GameState {
    state.adventure!.rewardQueue.push({ playerId: "p1", kind: "shared-deck-search", deckId: "spells", count });
    pumpAdventureQueues(state);
    return state;
  }

  function chooseOptions(state: GameState) {
    return getLegalActions(state, "p1").filter((legal) => legal.action.type === "CHOOSE_OPTION");
  }

  it("ONE choice offers the deck searches, the discard tops AND the school draw; the draw resolves with no reveal", () => {
    let state = adventureWithFetch("one-step-offer");
    state = queueSpellsFamilySearch(state);

    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    expect(state.pendingChoice?.type === "OPTION_CHOICE" ? state.pendingChoice.context : "").toBe("deck-pick");
    expect(state.pendingChoice?.type === "OPTION_CHOICE" ? state.pendingChoice.deckPick?.upFront : false).toBe(true);

    const labels = chooseOptions(state).map((legal) => legal.label);
    expect(labels.some((label) => /^Search \(\d+\) Basic Spells/.test(label)), labels.join(" | ")).toBe(true);
    expect(labels.some((label) => /^Search \(\d+\) Expert Spells/.test(label)), labels.join(" | ")).toBe(true);
    // Both shared Spell decks seed a face-up discard top at setup — both takes
    // are offered up front, per deck.
    expect(labels.filter((label) => /^Take the top discard/.test(label)).length).toBeGreaterThanOrEqual(1);
    const draw = chooseOptions(state).find((legal) => /Draw the first Fire Magic spell/i.test(legal.label));
    expect(draw, "the school draw is offered IN the first decision").toBeTruthy();

    const handBefore = state.players.p1.hand.length;
    state = applyOk(state, draw!.action);
    // The draw took a Fire (or "any") spell straight into hand — no reveal step.
    expect(state.players.p1.hand.length).toBe(handBefore + 1);
    const gained = state.players.p1.hand[state.players.p1.hand.length - 1]!;
    const schools = cardLibrary[gained]?.spellSchools ?? [];
    expect(schools.includes("fire") || schools.includes("any"), `${gained} is a Fire/any spell`).toBe(true);
    expect(state.pendingChoice?.type ?? null).not.toBe("DECK_SEARCH");
  });

  it("CONTROL (the reported bug): committing to a Search goes STRAIGHT to the reveal — the draw never re-appears after", () => {
    let state = adventureWithFetch("one-step-search");
    state = queueSpellsFamilySearch(state);

    const search = chooseOptions(state).find((legal) => /^Search \(\d+\) Basic Spells/.test(legal.label));
    expect(search, "the Basic Spells search commit is offered").toBeTruthy();
    state = applyOk(state, search!.action);
    // Straight to the reveal: NOT a second up-front choice carrying the fetch.
    expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
  });

  it("the school draw scans Basic first, then the Expert deck (a Fire spell only in Expert is still found)", () => {
    let state = adventureWithFetch("one-step-expert-scan");
    // Strip every Fire/any spell from the BASIC deck; leave the Expert deck's.
    const basic = state.decks["spells"];
    basic.drawPile = basic.drawPile.filter((id) => {
      const schools = cardLibrary[id]?.spellSchools ?? [];
      return !schools.includes("fire") && !schools.includes("any");
    });
    basic.discardPile = [];
    state.decks["spells-expert"].discardPile = [];
    state = queueSpellsFamilySearch(state);

    const draw = chooseOptions(state).find((legal) => /Draw the first Fire Magic spell/i.test(legal.label));
    expect(draw).toBeTruthy();
    const handBefore = state.players.p1.hand.length;
    state = applyOk(state, draw!.action);
    expect(state.players.p1.hand.length).toBe(handBefore + 1);
    const gained = state.players.p1.hand[state.players.p1.hand.length - 1]!;
    const schools = cardLibrary[gained]?.spellSchools ?? [];
    expect(schools.includes("fire") || schools.includes("any"), `${gained} came from the Expert deck scan`).toBe(true);
  });

  it("a draw that finds nothing anywhere says so in the feed instead of failing silently", () => {
    let state = adventureWithFetch("one-step-empty");
    for (const deckId of ["spells", "spells-expert"]) {
      const deck = state.decks[deckId];
      deck.drawPile = deck.drawPile.filter((id) => {
        const schools = cardLibrary[id]?.spellSchools ?? [];
        return !schools.includes("fire") && !schools.includes("any");
      });
      deck.discardPile = [];
    }
    state = queueSpellsFamilySearch(state);
    const draw = chooseOptions(state).find((legal) => /Draw the first Fire Magic spell/i.test(legal.label));
    expect(draw).toBeTruthy();
    const handBefore = state.players.p1.hand.length;
    state = applyOk(state, draw!.action);
    expect(state.players.p1.hand.length).toBe(handBefore);
    const note = [...state.eventLog].reverse().find((event) => event.type === "EVENT_NOTE");
    expect(note && note.type === "EVENT_NOTE" ? note.message : "").toMatch(/no takeable Fire Magic spell/i);
  });

  it("a held Scouting still prompts AFTER the Search commit, then reveals directly (no mode step)", () => {
    let state = adventureWithFetch("one-step-scouting");
    state.players.p1.hand = ["ability.scouting"];
    state = queueSpellsFamilySearch(state, 2);

    const search = chooseOptions(state).find((legal) => /^Search \(\d+\) Basic Spells/.test(legal.label));
    state = applyOk(state, search!.action);
    expect(state.pendingChoice?.type === "OPTION_CHOICE" ? state.pendingChoice.context : "").toBe("scouting-prompt");
    const decline = chooseOptions(state).find((legal) => /don't use Scouting/i.test(legal.label));
    state = applyOk(state, decline!.action);
    // Straight to the reveal — never back to a "Search or draw?" step.
    expect(state.pendingChoice?.type).toBe("DECK_SEARCH");
  });

  it("a discard-top take from the one-step pick delivers that deck's face-up card", () => {
    let state = adventureWithFetch("one-step-discard");
    state = queueSpellsFamilySearch(state);
    const pick = state.pendingChoice?.type === "OPTION_CHOICE" ? state.pendingChoice.deckPick : undefined;
    const firstTop = pick?.discardTops?.[0];
    expect(firstTop, "at least one acquirable discard top is offered up front").toBeTruthy();
    const take = chooseOptions(state).find((legal) => /^Take the top discard/.test(legal.label));
    state = applyOk(state, take!.action);
    // The taken card is now owned (hand — the state has no Book rule on).
    expect(state.players.p1.hand).toContain(firstTop!.cardId);
    expect(state.decks[firstTop!.deckId].discardPile).not.toContain(firstTop!.cardId);
  });

  it("POLISH SPELL BOOK: the one-step draw inscribes the spell into the Book (label says so)", () => {
    let state = adventureWithFetch("one-step-polish", { houseRules: { "polish-spell-book": true } });
    state = queueSpellsFamilySearch(state);
    const draw = chooseOptions(state).find((legal) => /Draw the first Fire Magic spell — take it into Spell Book/i.test(legal.label));
    expect(draw, "the Book destination is named in the offer").toBeTruthy();
    const bookBefore = state.players.p1.spellBook.length;
    state = applyOk(state, draw!.action);
    expect(state.players.p1.spellBook.length).toBe(bookBefore + 1);
  });

  it("LEGACY in-flight deck-pick (no upFront) still resolves the old two-step way", () => {
    // A room mid-choice when the server updates: the stored pick has no
    // `upFront`, so picking a deck re-opens the old mode choice (which still
    // carries the fetch) instead of jumping to the reveal.
    let state = adventureWithFetch("one-step-legacy");
    state.pendingChoice = {
      id: "choice_legacy_pick",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "Search which deck? (Search 2)",
      options: [{ label: "Basic Spells" }, { label: "Expert Spells" }],
      context: "deck-pick",
      deckPick: { deckIds: ["spells", "spells-expert"], count: 2 },
      returnPhase: "player-turn"
    };
    state.phase = "choice";
    state.priorityPlayerId = "p1";

    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: "choice_legacy_pick", optionIndex: 0 });
    expect(state.pendingChoice?.type === "OPTION_CHOICE" ? state.pendingChoice.context : "").toBe("deck-search-mode");
    const draw = chooseOptions(state).find((legal) => /Draw the first Fire Magic spell/i.test(legal.label));
    expect(draw, "the legacy second step still offers the fetch").toBeTruthy();
  });
});

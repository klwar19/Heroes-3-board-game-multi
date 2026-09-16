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
    // Official deck-access rule: the TILE the main hero stands on decides which
    // Spell decks a Search may reach, so this fixture — which is about the ONE-STEP
    // pick offering BOTH decks — stands the hero on a near (Ⅳ–Ⅴ) tile. (Relabelling
    // the tile band is all `heroTileGroup` reads.) The gate itself is pinned in
    // official-rules-house-rules.test.ts / ruleset.test.ts.
    const heroField = state.adventure!.fields[state.heroes.hero_p1.spaceId as string]!;
    state.adventure!.tiles[heroField.tileInstanceId]!.backLabel = "Ⅳ–Ⅴ";
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

/**
 * Polish Balance Pack reprint — "Instead of Searching the Spell deck, find the
 * first TWO <School> Magic spells in it, choose one and take it into your hand.
 * Then, reshuffle the deck."
 *
 * Every case pins the OBSERVABLE divergence from the classic fetch: which card
 * ended up in hand and which one stayed in the deck. The rule-OFF CONTROL runs
 * the SAME deck, so a passing case proves the reprint moved the card — reverting
 * the two-candidate logic makes the ON cases fail (no choice opens at all).
 */
describe("Balance Pack — Basic X Magic finds the first TWO spells and the owner picks", () => {
  /**
   * The deck-search-mode form: a plain Search on the "spells" deck with an Air
   * fetch in play. The draw pile's LAST entry is the TOP of the deck, so the scan
   * meets Precision first and Haste second.
   */
  function airFetchSearch(seed: string, balance: boolean): GameState {
    const state = createInitialGameState(seed);
    // `houseRuleEnabled` reads `state.adventure?.houseRules`; a sandbox has no
    // adventure, so stamp the minimal stub (the polish ability tests' pattern).
    state.adventure = {
      houseRules: { "polish-card-balance": balance }
    } as unknown as GameState["adventure"];
    state.activePlayerId = "p1";
    state.players.p1.hand = [];
    state.players.p1.deck = [];
    state.players.p1.discard = [];
    pushFetch(state, "p1", "air");
    state.decks["spells"].drawPile = ["spell.haste", "spell.slow", "spell.slow", "spell.precision"];
    state.decks["spells"].discardPile = [];
    return state;
  }

  /** Opens the Search and takes the "draw from a School of Magic" option. */
  function takeSchoolDraw(state: GameState): GameState {
    const searched = applyOk(state, { type: "SEARCH_DECK", playerId: "p1", deckId: "spells", count: 2 });
    const draw = getLegalActions(searched, "p1").find(
      (legal) => legal.action.type === "CHOOSE_OPTION" && /Air Magic/i.test(legal.label)
    );
    expect(draw, "the Air Magic draw option must be offered").toBeTruthy();
    return applyOk(searched, draw!.action);
  }

  it("opens a two-card pick, and choosing the SECOND takes exactly that spell (CONTROL: rule off takes the first, silently)", () => {
    const on = takeSchoolDraw(airFetchSearch("balance-fetch-two", true));
    const pick = on.pendingChoice;
    expect(pick?.type).toBe("OPTION_CHOICE");
    if (pick?.type !== "OPTION_CHOICE") {
      throw new Error("expected the two-candidate pick");
    }
    expect(pick.context).toBe("basic-magic-pick");
    expect(pick.options).toHaveLength(2);
    expect(pick.basicMagicPick?.candidates.map((entry) => entry.cardId)).toEqual([
      "spell.precision",
      "spell.haste"
    ]);
    // Nothing is gained, and nothing has left the deck, until the pick resolves.
    expect(on.players.p1.hand).toEqual([]);
    const beforeCount = deckCount(on, "spells");

    const picked = applyOk(on, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: pick.id,
      optionIndex: 1
    });
    expect(picked.players.p1.hand, "the SECOND candidate was taken").toEqual(["spell.haste"]);
    expect(picked.decks["spells"].drawPile, "and the first one stayed in the deck").toContain(
      "spell.precision"
    );
    expect(picked.decks["spells"].drawPile).not.toContain("spell.haste");
    expect(deckCount(picked, "spells"), "exactly one card left the deck").toBe(beforeCount - 1);
    expect(picked.pendingChoice).toBeNull();
    // The Search tail the pick interposed on still ran.
    expect(picked.eventLog.some((event) => event.type === "DECK_SEARCH_RESOLVED")).toBe(true);

    // CONTROL: with the rule OFF the same deck gives the classic silent single
    // fetch — the FIRST match, no choice at all.
    const off = takeSchoolDraw(airFetchSearch("balance-fetch-two-off", false));
    expect(off.pendingChoice, "no pick is opened with the rule off").toBeNull();
    expect(off.players.p1.hand).toEqual(["spell.precision"]);
    expect(off.decks["spells"].drawPile).toContain("spell.haste");
  });

  it("choosing the FIRST option takes that spell instead (the pick really decides)", () => {
    const on = takeSchoolDraw(airFetchSearch("balance-fetch-first", true));
    const pick = on.pendingChoice;
    if (pick?.type !== "OPTION_CHOICE") {
      throw new Error("expected the two-candidate pick");
    }
    const picked = applyOk(on, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: pick.id,
      optionIndex: 0
    });
    expect(picked.players.p1.hand).toEqual(["spell.precision"]);
    expect(picked.decks["spells"].drawPile).toContain("spell.haste");
  });

  it("a single match is still taken outright — no dead one-button pick", () => {
    const state = airFetchSearch("balance-fetch-one", true);
    // Only ONE Air spell in the whole deck.
    state.decks["spells"].drawPile = ["spell.slow", "spell.slow", "spell.haste"];
    const drawn = takeSchoolDraw(state);
    expect(drawn.pendingChoice, "nothing to decide").toBeNull();
    expect(drawn.players.p1.hand).toEqual(["spell.haste"]);
    expect(drawn.decks["spells"].drawPile).not.toContain("spell.haste");
  });

  it("no match keeps the existing 'found no takeable spell' note", () => {
    const state = airFetchSearch("balance-fetch-none", true);
    state.decks["spells"].drawPile = ["spell.slow", "spell.slow", "spell.slow"];
    const drawn = takeSchoolDraw(state);
    expect(drawn.pendingChoice).toBeNull();
    expect(drawn.players.p1.hand).toEqual([]);
    expect(
      drawn.eventLog.some(
        (event) => event.type === "EVENT_NOTE" && /found no takeable Air Magic spell/i.test(event.message)
      )
    ).toBe(true);
  });

  it("the offer label names the two-spell draw (CONTROL: the classic label stays single)", () => {
    const on = applyOk(airFetchSearch("balance-fetch-label", true), {
      type: "SEARCH_DECK",
      playerId: "p1",
      deckId: "spells",
      count: 2
    });
    const onLabels = getLegalActions(on, "p1").map((legal) => legal.label);
    expect(onLabels.some((label) => /Draw the first two Air Magic spells — choose one/i.test(label))).toBe(
      true
    );

    const off = applyOk(airFetchSearch("balance-fetch-label-off", false), {
      type: "SEARCH_DECK",
      playerId: "p1",
      deckId: "spells",
      count: 2
    });
    const offLabels = getLegalActions(off, "p1").map((legal) => legal.label);
    expect(offLabels.some((label) => /Draw the first Air Magic spell/i.test(label))).toBe(true);
    expect(offLabels.some((label) => /first two/i.test(label))).toBe(false);
  });

  /**
   * The OTHER call site: the one-step spells deck-pick (both Spell decks offered
   * together). Its tail — DECK_SEARCH_RESOLVED and the Pendant repeat offer —
   * must still run after the pick, in that order.
   */
  it("the one-step spells deck-pick form opens the same pick and still runs its tail", () => {
    let state = createAdventureGameState({
      seed: "balance-fetch-deck-pick",
      difficulty: "normal",
      rollFirstPlayer: false,
      houseRules: { "polish-card-balance": true }
    });
    state.activePlayerId = "p1";
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
      state.activePlayerId = "p1";
    }
    state.players.p1.permanents = ["ability.basic_fire_magic"];
    state.players.p1.hand = [];
    state.players.p1.deck = [];
    state.players.p1.discard = [];
    const heroField = state.adventure!.fields[state.heroes.hero_p1.spaceId as string]!;
    state.adventure!.tiles[heroField.tileInstanceId]!.backLabel = "Ⅳ–Ⅴ";
    // Two Fire spells in the BASIC deck: the scan finds both there and never
    // reaches the expert deck. Top of the pile is the last entry.
    state.decks["spells"].drawPile = ["spell.inferno", "spell.slow", "spell.slayer"];
    state.decks["spells"].discardPile = [];

    state.adventure!.rewardQueue.push({ playerId: "p1", kind: "shared-deck-search", deckId: "spells", count: 3 });
    pumpAdventureQueues(state);

    const draw = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "CHOOSE_OPTION" && /Fire Magic/i.test(legal.label)
    );
    expect(draw, "the one-step pick must offer the Fire draw").toBeTruthy();
    const opened = applyOk(state, draw!.action);
    const pick = opened.pendingChoice;
    if (pick?.type !== "OPTION_CHOICE") {
      throw new Error(`expected the two-candidate pick, got ${opened.pendingChoice?.type ?? "nothing"}`);
    }
    expect(pick.context).toBe("basic-magic-pick");
    expect(pick.basicMagicPick?.candidates.map((entry) => entry.cardId)).toEqual([
      "spell.slayer",
      "spell.inferno"
    ]);

    const picked = applyOk(opened, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: pick.id,
      optionIndex: 1
    });
    expect(picked.players.p1.hand).toContain("spell.inferno");
    expect(picked.decks["spells"].drawPile).toContain("spell.slayer");
    expect(picked.eventLog.some((event) => event.type === "DECK_SEARCH_RESOLVED")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions, type GameAction, type GameState } from "./index";
import {
  drawAstrologersCard,
  drawNeutralArmy,
  getMainHero,
  getTownOfPlayer,
  isSeaField,
  neutralArmyDifficulty,
  NEUTRAL_DECK_IDS,
  seaStepHalts
} from "./adventure";
import {
  finalizeAdventureCombat,
  inCombatPrep,
  spellBookAction,
  startNeutralEncounter,
  startPlayerCombat
} from "./adventure-reducer";
import { NEUTRAL_PLAYER_ID } from "./state";
import { cardLibrary } from "@/data/cards/library";

/**
 * Five more expansion Astrologers proclamations, engine-enforced end to end
 * (CLAUDE.md #1 — each assertion fails if its wiring is removed, each with a
 * face-down / off-round CONTROL):
 *
 *   - Rulebook (Stretch): neutral guards are drawn one GAME-difficulty lower.
 *   - Pirates (Cove): winning a non-Quick Combat earns a Resource die.
 *   - Judge Dread (Stronghold): the attacker may discard the whole drawn guard
 *     army and draw a fresh one.
 *   - Wind (Cove): entering the sea from land (embarking) no longer halts.
 *   - Mages (Conflux): the Spell Book token is free and usable without a Guild.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function setActive(state: GameState, activeCardId: string): void {
  state.adventure!.astrologers = {
    activeCardId,
    nextResourceModifiers: { gold: 0, valuables: 0 },
    crazyWizardUsedBy: [],
    swiftWeaselUsedBy: []
  };
}

describe("Astrologers — Wind draw eligibility", () => {
  it("discards Wind and draws the next proclamation when the game has no sea tile", () => {
    const state = createAdventureGameState({ seed: "wind-no-sea", rollFirstPlayer: false });
    state.round = 4;
    state.adventure!.tiles = {};
    state.adventure!.fields = {};
    const deck = state.decks.astrologers!;
    deck.drawPile = ["astrologers.dead_silence", "astrologers.wind"];
    deck.discardPile = [];

    drawAstrologersCard(state);

    expect(state.adventure!.astrologers?.activeCardId).toBe("astrologers.dead_silence");
    expect(deck.discardPile).toContain("astrologers.wind");
    expect(
      state.eventLog.filter((event) => event.type === "ASTROLOGERS_DRAWN").map((event) => event.cardId)
    ).toEqual(["astrologers.dead_silence"]);
  });

  it("CONTROL: Wind remains drawable when a sea tile is in the game", () => {
    const state = createAdventureGameState({ seed: "wind-with-sea", rollFirstPlayer: false });
    state.round = 4;
    state.adventure!.tiles = {
      "sea-test": {
        id: "sea-test",
        tileDefId: "W1",
        centerRow: 0,
        centerCol: 0,
        rotation: 0,
        faceDown: false,
        group: "sea"
      }
    };
    const deck = state.decks.astrologers!;
    deck.drawPile = ["astrologers.dead_silence", "astrologers.wind"];
    deck.discardPile = [];

    drawAstrologersCard(state);

    expect(state.adventure!.astrologers?.activeCardId).toBe("astrologers.wind");
    expect(deck.discardPile).not.toContain("astrologers.wind");
  });
});

// ===========================================================================
// Rulebook — neutral guards drawn one game-difficulty level lower
// ===========================================================================

describe("Astrologers — Rulebook (neutral guards one difficulty lower)", () => {
  it("neutralArmyDifficulty drops the game difficulty one level; Easy is the floor", () => {
    const hard = createAdventureGameState({ seed: "rb-hard", difficulty: "hard", rollFirstPlayer: false });
    setActive(hard, "astrologers.rulebook");
    expect(neutralArmyDifficulty(hard)).toBe("normal");

    // "Ignore on Easy" holds by construction — Easy cannot drop further.
    const easy = createAdventureGameState({ seed: "rb-easy", difficulty: "easy", rollFirstPlayer: false });
    setActive(easy, "astrologers.rulebook");
    expect(neutralArmyDifficulty(easy)).toBe("easy");
  });

  it("CONTROL: without Rulebook the table's own difficulty is used", () => {
    const hard = createAdventureGameState({ seed: "rb-ctrl", difficulty: "hard", rollFirstPlayer: false });
    setActive(hard, "astrologers.dead_silence");
    expect(neutralArmyDifficulty(hard)).toBe("hard");
  });

  it("draws a weaker guard army: a Hard field-2 guard is 3 units, Rulebook (→Normal) is 2", () => {
    const base = createAdventureGameState({ seed: "rb-draw", difficulty: "hard", rollFirstPlayer: false });
    setActive(base, "astrologers.dead_silence");
    expect(drawNeutralArmy(base, 2)).toHaveLength(3); // hard[2] = 3 bronze

    const ruled = createAdventureGameState({ seed: "rb-draw", difficulty: "hard", rollFirstPlayer: false });
    setActive(ruled, "astrologers.rulebook");
    expect(drawNeutralArmy(ruled, 2)).toHaveLength(2); // normal[2] = 2 bronze
  });
});

// ===========================================================================
// Shared neutral-combat setup for Pirates + Judge Dread
// ===========================================================================

/** A real neutral Combat Setup for p1 (level-1 hero vs a field-difficulty guard). */
function neutralSetup(seed: string, activeCardId: string, difficulty = 2): GameState {
  let state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  setActive(state, activeCardId);
  const hero = getMainHero(state, "p1")!;
  const field = state.adventure!.fields[hero.spaceId!];
  field.difficulty = difficulty; // level-1 hero < difficulty → a real fight, not Quick Combat
  startNeutralEncounter(state, hero, field);
  return state;
}

/** Deploys one unit and locks placement, so the guard army reveals (or its offer opens). */
function placeAndFinish(state: GameState): GameState {
  const place = getLegalActions(state, "p1").find((legal) => legal.action.type === "PLACE_COMBAT_UNIT");
  expect(place, "a unit to place").toBeTruthy();
  const placed = apply(state, place!.action);
  return apply(placed, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
}

// ===========================================================================
// Pirates — a Resource die for the winner of a non-Quick Combat
// ===========================================================================

describe("Astrologers — Pirates (Resource die on a fought win)", () => {
  function findDie(state: GameState) {
    return (state.adventure?.rewardQueue ?? []).find(
      (reward) =>
        reward.playerId === "p1" &&
        reward.kind === "visit-steps" &&
        reward.steps[0]?.type === "ROLL_RESOURCE_DICE"
    );
  }

  it("queues one Resource die for the human winner when the combat is finalized", () => {
    const state = placeAndFinish(neutralSetup("pirates-win", "astrologers.pirates"));
    state.combat!.outcome = {
      winnerPlayerId: "p1",
      defeatedPlayerId: NEUTRAL_PLAYER_ID,
      reason: "all-enemy-units-defeated"
    };
    finalizeAdventureCombat(state);
    expect(findDie(state)).toBeTruthy();
  });

  it("CONTROL: with a different proclamation up, no die is queued", () => {
    const state = placeAndFinish(neutralSetup("pirates-none", "astrologers.dead_silence"));
    state.combat!.outcome = {
      winnerPlayerId: "p1",
      defeatedPlayerId: NEUTRAL_PLAYER_ID,
      reason: "all-enemy-units-defeated"
    };
    finalizeAdventureCombat(state);
    expect(findDie(state)).toBeFalsy();
  });

  it("CONTROL: a NEUTRAL winner (the human lost) earns nothing", () => {
    const state = placeAndFinish(neutralSetup("pirates-loss", "astrologers.pirates"));
    state.combat!.outcome = {
      winnerPlayerId: NEUTRAL_PLAYER_ID,
      defeatedPlayerId: "p1",
      reason: "all-enemy-units-defeated"
    };
    finalizeAdventureCombat(state);
    expect(findDie(state)).toBeFalsy();
  });
});

// ===========================================================================
// Judge Dread — the attacker redraws the whole guard army
// ===========================================================================

describe("Astrologers — Judge Dread (redraw the whole guard army)", () => {
  function neutralUnits(state: GameState): string[] {
    return Object.values(state.combat!.units)
      .filter((unit) => unit.controllerId === NEUTRAL_PLAYER_ID)
      .map((unit) => unit.unitDefId!)
      .filter(Boolean)
      .sort();
  }

  it("does not draw or expose the Neutral army until attacker deployment is locked", () => {
    const state = neutralSetup("jd-timing", "astrologers.judge_dread");
    expect(state.combat?.pendingNeutralDraws).toBeFalsy();
    expect(state.pendingChoice?.type === "OPTION_CHOICE" ? state.pendingChoice.context : null).not.toBe(
      "judge-dread"
    );

    const afterPlacement = placeAndFinish(state);
    expect(afterPlacement.combat?.pendingNeutralDraws?.length).toBeGreaterThan(0);
    expect(
      afterPlacement.pendingChoice?.type === "OPTION_CHOICE"
        ? afterPlacement.pendingChoice.context
        : null
    ).toBe("judge-dread");
  });

  it("opens a keep / redraw offer; KEEPING reveals the drawn army unchanged", () => {
    const state = placeAndFinish(neutralSetup("jd-keep", "astrologers.judge_dread"));

    expect(state.pendingChoice?.type).toBe("OPTION_CHOICE");
    const choice = state.pendingChoice;
    expect(choice?.type === "OPTION_CHOICE" ? choice.context : null).toBe("judge-dread");
    const labels = choice?.type === "OPTION_CHOICE" ? choice.options.map((option) => option.label) : [];
    expect(labels).toContain("Discard all and redraw the same tiers");

    const original = (state.combat!.pendingNeutralDraws ?? []).map((draw) => draw.unitDefId).sort();
    expect(original.length).toBeGreaterThan(0);

    const kept = apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice!.id, optionIndex: 0 });
    expect(neutralUnits(kept)).toEqual(original);
    expect(kept.pendingChoice).toBeNull();
  });

  it("REDRAW discards every guard, draws the exact same tier pattern, then shows the result", () => {
    const state = placeAndFinish(neutralSetup("jd-redraw", "astrologers.judge_dread", 5));
    const originalDraws = (state.combat!.pendingNeutralDraws ?? []).filter((draw) => !draw.bankGuard);
    expect(originalDraws.length).toBeGreaterThan(0);

    const redrawn = apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: 1
    });

    expect(redrawn.pendingChoice?.type === "OPTION_CHOICE" ? redrawn.pendingChoice.context : null).toBe(
      "judge-dread-result"
    );
    const result =
      redrawn.pendingChoice?.type === "OPTION_CHOICE"
        ? redrawn.pendingChoice.judgeDreadResult
        : undefined;
    expect(result?.discarded).toEqual(
      originalDraws.map(({ unitDefId, tier }) => ({ unitDefId, tier }))
    );
    expect(result?.replacements.map((draw) => draw.tier).sort()).toEqual(
      originalDraws.map((draw) => draw.tier).sort()
    );

    // Every discarded guard card is back in its tier's Neutral discard pile.
    for (const draw of originalDraws) {
      expect(redrawn.decks[NEUTRAL_DECK_IDS[draw.tier]]!.discardPile).toContain(draw.unitDefId);
    }
    // The cards are reviewed before units appear on the combat board.
    expect(neutralUnits(redrawn)).toEqual([]);

    const revealed = apply(redrawn, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: redrawn.pendingChoice!.id,
      optionIndex: 0
    });
    expect(neutralUnits(revealed).length).toBe(originalDraws.length);
    expect(revealed.pendingChoice?.type === "OPTION_CHOICE" ? revealed.pendingChoice.context : null).not.toBe(
      "judge-dread-result"
    );
  });

  it("CONTROL: without Judge Dread the drawn army reveals with no offer", () => {
    const state = placeAndFinish(neutralSetup("jd-ctrl", "astrologers.dead_silence"));
    const context = state.pendingChoice?.type === "OPTION_CHOICE" ? state.pendingChoice.context : null;
    expect(context).not.toBe("judge-dread");
    expect(neutralUnits(state).length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Wind — no halt entering the sea from a land field
// ===========================================================================

describe("Astrologers — Wind (continue after embarking)", () => {
  function seaFixture(
    seed: string,
    activeCardId: string,
    ruleset: "legacy" | "binh" = "legacy"
  ): { state: GameState; land: string; sea: string; sea2: string } {
    const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false, ruleset });
    setActive(state, activeCardId);
    const ids = Object.keys(state.adventure!.fields);
    const [land, sea, sea2] = [ids[0], ids[1], ids[2]];
    delete state.adventure!.fields[land].terrain; // land
    state.adventure!.fields[sea].terrain = "water";
    state.adventure!.fields[sea2].terrain = "water";
    return { state, land, sea, sea2 };
  }

  it("Wind prevents the embark halt; Legacy also permits disembarking to continue", () => {
    const { state, land, sea } = seaFixture("wind-on", "astrologers.wind");
    expect(isSeaField(state, sea)).toBe(true);
    expect(isSeaField(state, land)).toBe(false);
    expect(seaStepHalts(state, land, sea)).toBe(false); // embark: keeps moving
    expect(seaStepHalts(state, sea, land)).toBe(false); // Legacy disembark
  });

  it("sea→sea within the water never halts (with or without Wind)", () => {
    const { state, sea, sea2 } = seaFixture("wind-seasea", "astrologers.wind");
    expect(seaStepHalts(state, sea, sea2)).toBe(false);
  });

  it("CONTROL: without Wind, Legacy embark halts but disembark continues", () => {
    const { state, land, sea } = seaFixture("wind-off", "astrologers.dead_silence");
    expect(seaStepHalts(state, land, sea)).toBe(true);
    expect(seaStepHalts(state, sea, land)).toBe(false);
  });

  it("BINH keeps the old disembark halt, with or without Wind", () => {
    const withWind = seaFixture("wind-binh-on", "astrologers.wind", "binh");
    expect(seaStepHalts(withWind.state, withWind.land, withWind.sea)).toBe(false);
    expect(seaStepHalts(withWind.state, withWind.sea, withWind.land)).toBe(true);

    const withoutWind = seaFixture("wind-binh-off", "astrologers.dead_silence", "binh");
    expect(seaStepHalts(withoutWind.state, withoutWind.land, withoutWind.sea)).toBe(true);
    expect(seaStepHalts(withoutWind.state, withoutWind.sea, withoutWind.land)).toBe(true);
  });
});

// ===========================================================================
// Mages — free Spell Book token, usable without a Mage Guild
// ===========================================================================

describe("Astrologers — Mages (free Spell Book, no Mage Guild)", () => {
  function magesGame(
    round: number,
    activeCardId = "astrologers.mages",
    ruleset: "legacy" | "binh" = "binh"
  ): GameState {
    const state = createAdventureGameState({
      seed: `mages-${ruleset}`,
      difficulty: "normal",
      rollFirstPlayer: false,
      ruleset,
      ...(ruleset === "legacy" ? { spellBook: false } : {})
    });
    state.round = round;
    state.activePlayerId = "p1";
    state.phase = "player-turn";
    state.players.p1.canMulligan = false;
    state.players.p1.needsHandRefresh = false;
    setActive(state, activeCardId);
    const town = getTownOfPlayer(state, "p1")!;
    town.buildings = []; // strip every building — NO Mage Guild
    state.players.p1.townTokens.spellBook = true;
    state.players.p1.resources.gold = 0; // prove it is free
    return state;
  }

  it("uses the Spell Book for free without a Mage Guild on the drawn (even) round", () => {
    const state = magesGame(2);
    spellBookAction(state, { type: "SPELL_BOOK_ACTION", playerId: "p1" });

    // Token spent, no gold paid, and a Spell-deck Search was queued.
    expect(state.players.p1.townTokens.spellBook).toBe(false);
    expect(state.players.p1.resources.gold).toBe(0);
    const queuedSearch = (state.adventure?.rewardQueue ?? []).some(
      (reward) => reward.kind === "shared-deck-search" && reward.deckId === "spells"
    );
    expect(queuedSearch).toBe(true);
  });

  it("legal-actions offers the free (0 gold) Spell Book without a Mage Guild while Mages is up", () => {
    const state = magesGame(2);
    const offer = getLegalActions(state, "p1").find((legal) => legal.action.type === "SPELL_BOOK_ACTION");
    expect(offer?.label).toMatch(/^0 gold: Buy spell/);
  });

  it("also works in Legacy when the optional Polish Spell Book module is off", () => {
    const state = magesGame(2, "astrologers.mages", "legacy");
    const offer = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "SPELL_BOOK_ACTION"
    );
    expect(offer?.label).toBe("0 gold: Buy spell — search (2)");
    spellBookAction(state, { type: "SPELL_BOOK_ACTION", playerId: "p1" });
    expect(state.players.p1.resources.gold).toBe(0);
    expect(state.players.p1.townTokens.spellBook).toBe(false);
  });

  it("CONTROL: without Mages, using the Spell Book with no Mage Guild is rejected", () => {
    const state = magesGame(2, "astrologers.dead_silence");
    expect(() => spellBookAction(state, { type: "SPELL_BOOK_ACTION", playerId: "p1" })).toThrow(/Mage Guild/);
    expect(getLegalActions(state, "p1").some((legal) => legal.action.type === "SPELL_BOOK_ACTION")).toBe(false);
  });

  it("CONTROL: 'during this round' — the waiver lifts on the following (odd) Resource round", () => {
    const state = magesGame(3); // Mages face up but the round is odd → no waiver
    expect(() => spellBookAction(state, { type: "SPELL_BOOK_ACTION", playerId: "p1" })).toThrow(/Mage Guild/);
  });

  it("still widens the free search with Wisdom while the cost remains zero", () => {
    const state = magesGame(2);
    state.players.p1.hand.push("ability.wisdom");

    spellBookAction(state, {
      type: "SPELL_BOOK_ACTION",
      playerId: "p1",
      wisdom: { cardId: "ability.wisdom", mode: "basic" }
    });

    expect(state.players.p1.resources.gold).toBe(0);
    expect(state.players.p1.discard).toContain("ability.wisdom");
    expect(
      state.adventure?.rewardQueue.find((reward) => reward.kind === "shared-deck-search")
    ).toMatchObject({ deckId: "spells", count: 3 });
  });

  it("waives the same-round restriction when a Mage Guild is already present", () => {
    const state = magesGame(2);
    getTownOfPlayer(state, "p1")!.buildings = ["castle.mage_guild"];
    state.players.p1.mageGuildBuiltRound = 2;

    const offer = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "SPELL_BOOK_ACTION" && !legal.action.wisdom
    );
    expect(offer?.label).toMatch(/^0 gold: Buy spell/);
    spellBookAction(state, { type: "SPELL_BOOK_ACTION", playerId: "p1" });
    expect(state.players.p1.resources.gold).toBe(0);
  });

  it("does not make Polish Roll spell free or usable without a Mage Guild", () => {
    const state = magesGame(2);
    (state.adventure!.houseRules ??= {})["polish-spell-book"] = true;
    state.players.p1.spellBook = ["spell.magic_arrow"];

    expect(() =>
      spellBookAction(state, {
        type: "SPELL_BOOK_ACTION",
        playerId: "p1",
        rollSpell: { cardId: "spell.magic_arrow", source: "refreshed" }
      })
    ).toThrow(/Mage Guild/);
    expect(getLegalActions(state, "p1").some((legal) => /Roll spell/.test(legal.label))).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Reported bug (2026-08): "it let me use the token for free when attacking an
  // enemy hero, but going into town it seemed like I had to build the mage
  // guild." The engine half is pinned END TO END here — the offer taken from
  // getLegalActions and applied through the real pipeline must actually SEARCH
  // the Spell deck and put a Spell in hand with NO Mage Guild — and the
  // combat-prep half (which was correct) is locked so it cannot regress.
  // -------------------------------------------------------------------------

  it("the offer, applied through the real pipeline, really buys a Spell with NO Mage Guild", () => {
    let state = magesGame(2);
    // Clear the round-1 face-up seed so the Search opens straight onto its reveal.
    state.decks.spells!.discardPile = [];
    const handBefore = state.players.p1.hand.length;

    const offer = getLegalActions(state, "p1").find((legal) => legal.action.type === "SPELL_BOOK_ACTION");
    expect(offer?.label).toMatch(/^0 gold: Buy spell/);
    state = apply(state, offer!.action);

    // The Search really opened on the SPELL deck (not merely a queued reward).
    const search = state.pendingChoice;
    expect(search?.type).toBe("DECK_SEARCH");
    expect(search && "deckId" in search ? search.deckId : null).toBe("spells");
    state = apply(state, {
      type: "RESOLVE_DECK_SEARCH",
      playerId: "p1",
      choiceId: search!.id,
      pick: { kind: "revealed", index: 0 }
    });

    // Observable outcome: a Spell card in hand, the token spent, 0 gold paid.
    expect(state.players.p1.hand.length).toBe(handBefore + 1);
    const gained = state.players.p1.hand[state.players.p1.hand.length - 1];
    expect(cardLibrary[gained]?.kind).toBe("spell");
    expect(state.players.p1.townTokens.spellBook).toBe(false);
    expect(state.players.p1.resources.gold).toBe(0);
  });

  it("is offered (and works) inside a PvP pre-battle prep window — the reported 'attacking a hero' case", () => {
    // This half of the report was CORRECT behaviour: the Spell Book is a TOWN
    // TOKEN action, and a prep-window participant may still spend the round's
    // town actions. Pinned so the fix to the town UI cannot "fix" it away.
    let state = magesGame(2);
    state.decks.spells!.discardPile = [];
    const attacker = getMainHero(state, "p1")!;
    const defender = getMainHero(state, "p2")!;
    startPlayerCombat(state, attacker, defender, defender.spaceId ?? "0,0");
    expect(inCombatPrep(state, "p1")).toBe(true);

    const offer = getLegalActions(state, "p1").find((legal) => legal.action.type === "SPELL_BOOK_ACTION");
    expect(offer?.label).toMatch(/^0 gold: Buy spell/);
    state = apply(state, offer!.action);
    expect(state.players.p1.townTokens.spellBook).toBe(false);
    expect(state.players.p1.resources.gold).toBe(0);
  });
});

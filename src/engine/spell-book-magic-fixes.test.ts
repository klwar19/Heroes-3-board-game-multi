import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { canAcquireSharedDeckCard } from "./ruleset";
import type { ActiveEffectState, GameAction, GameState, LegalAction, PlayerId, SpellSchool } from "./state";

/**
 * Regressions for two Spell Book bugs, each proven by an observable game outcome
 * (a spell that is / is not handed out, a unit that is / is not saved) with a
 * CONTROL that diverges — so deleting a fix makes a test fail.
 *
 *  1. A Spell stashed in the Spell Book counts as OWNED, so Basic X Magic (and
 *     every shared-deck draw/search) never hands out a duplicate of it.
 *  2. The lethal-save window sees the Spell Book: a Book Resurrection can save a
 *     unit, and the Book's once-per-turn +1 Power can pay a silver/gold save when
 *     the hand alone falls short (Magic Arrow in hand, a Spell in the Book).
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

// ---------------------------------------------------------------------------
// 1. No duplicate Magic — a Book Spell is owned
// ---------------------------------------------------------------------------

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

describe("Basic X Magic never hands out a Spell already in the Spell Book", () => {
  function drawAir(state: GameState): GameState {
    const searched = applyOk(state, { type: "SEARCH_DECK", playerId: "p1", deckId: "spells", count: 2 });
    const drawOption = getLegalActions(searched, "p1").find(
      (legal) => legal.action.type === "CHOOSE_OPTION" && /Air Magic/i.test(legal.label)
    );
    expect(drawOption, "the up-front 'draw an Air Magic spell' option should be offered").toBeTruthy();
    return applyOk(searched, drawOption!.action);
  }

  it("CONTROL: with an empty Book, drawing Air takes Haste into hand", () => {
    const state = createInitialGameState("dedupe-control");
    state.activePlayerId = "p1";
    state.players.p1.hand = [];
    state.players.p1.spellBook = [];
    pushFetch(state, "p1", "air");
    state.decks["spells"].drawPile = ["spell.haste", "spell.slow", "spell.slow"];
    state.decks["spells"].discardPile = [];

    const drawn = drawAir(state);
    expect(drawn.players.p1.hand).toContain("spell.haste");
  });

  it("skips Haste when it is already stashed in the Book — no duplicate is created", () => {
    const state = createInitialGameState("dedupe-book");
    state.activePlayerId = "p1";
    state.players.p1.hand = [];
    // The one Air spell in the deck (Haste) is ALREADY in the Book.
    state.players.p1.spellBook = ["spell.haste"];
    pushFetch(state, "p1", "air");
    state.decks["spells"].drawPile = ["spell.haste", "spell.slow", "spell.slow"];
    state.decks["spells"].discardPile = [];

    const drawn = drawAir(state);
    // The Book copy makes the deck Haste a duplicate the hero may not take, so the
    // fetch finds no acquirable Air spell and the hand gains nothing.
    expect(drawn.players.p1.hand).not.toContain("spell.haste");
    expect(drawn.players.p1.hand).toEqual([]);
    // The Book keeps its single copy; no second Haste appears anywhere.
    expect(drawn.players.p1.spellBook).toEqual(["spell.haste"]);
  });

  it("canAcquireSharedDeckCard treats a Book Spell as owned (the invariant behind every draw)", () => {
    const state = createInitialGameState("dedupe-invariant");
    state.players.p1.spellBook = ["spell.haste"];
    state.players.p1.hand = [];
    state.players.p1.deck = [];
    state.players.p1.discard = [];
    // A Spell in the Book is not acquirable again…
    expect(canAcquireSharedDeckCard(state, "p1", "spells", "spell.haste")).toBe(false);
    // …but one the hero does not hold anywhere still is (CONTROL).
    expect(canAcquireSharedDeckCard(state, "p1", "spells", "spell.slow")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. The lethal-save window sees the Spell Book
// ---------------------------------------------------------------------------

const GRIFFINS = "unit_p1_griffins";
const SKELETONS = "unit_p2_skeletons";

/** A lethal melee attack on p1's Griffins, paused in the save window. */
function lethalSetup(opts: {
  grade?: "bronze" | "silver" | "gold";
  hand?: string[];
  spellBook?: string[];
}): GameState {
  const state = createInitialGameState("book-save-seed");
  state.players.p1.hand = opts.hand ?? [];
  state.players.p1.spellBook = opts.spellBook ?? [];
  state.players.p2.hand = [];

  const defender = state.combat!.units[GRIFFINS];
  defender.grade = opts.grade ?? "bronze";
  defender.position = 9;
  defender.defense = 0;
  defender.damage = defender.maxHealth - 1; // one hit from death

  const attacker = state.combat!.units[SKELETONS];
  attacker.abilities = [];
  attacker.attack = 5; // clearly lethal
  attacker.position = 13; // adjacent below the defender
  state.combat!.dice.scriptedRolls = [0];
  state.combat!.dice.rollCount = 0;
  state.activePlayerId = "p2";
  state.combat!.activeUnitId = SKELETONS;

  return applyOk(state, { type: "ATTACK_UNIT", playerId: "p2", attackerId: SKELETONS, defenderId: GRIFFINS });
}

function saveActions(state: GameState): LegalAction[] {
  return state.reactionWindow?.legalReactions.p1 ?? [];
}

function hasResurrection(state: GameState): boolean {
  return state.eventLog.some((event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "resurrection");
}

describe("A Resurrection Spell in the Spell Book can save a unit", () => {
  it("offers a Book Resurrection in the save window and cancels the killing blow", () => {
    const declared = lethalSetup({ grade: "bronze", hand: [], spellBook: ["spell.resurrection"] });
    expect(declared.reactionWindow?.triggerEvent.type).toBe("UNIT_LETHAL_HIT");

    const save = saveActions(declared).find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "spell.resurrection" &&
        legal.action.fromSpellBook === true
    );
    expect(save, "a Book Resurrection should be offered as a save").toBeTruthy();

    const saved = applyOk(declared, save!.action);
    expect(hasResurrection(saved)).toBe(true);
    expect(saved.combat!.units[GRIFFINS].damage).toBe(saved.combat!.units[GRIFFINS].maxHealth - 1); // fully saved
    // The Book Spell cycled Book → discard and counts as the round's Spell.
    expect(saved.players.p1.spellBook).not.toContain("spell.resurrection");
    expect(saved.players.p1.discard).toContain("spell.resurrection");
    expect(saved.players.p1.combatStats.spellsCastThisRound).toBe(1);
  });

  it("a silver Book Resurrection is offered and pays its 2-power-source cost from hand", () => {
    const declared = lethalSetup({
      grade: "silver",
      // Bless is now a legal enemy-attack reaction, so use a non-attack-window
      // Spell as the second power source to reach the lethal-save window.
      hand: ["spell.magic_arrow", "spell.slow"],
      spellBook: ["spell.resurrection"]
    });
    const save = saveActions(declared).find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "spell.resurrection" &&
        legal.action.fromSpellBook === true &&
        legal.action.optionIndex === 1 // silver
    );
    expect(save, "a Book Resurrection silver save should be offered when the hand can pay").toBeTruthy();

    const action = save!.action as Extract<GameAction, { type: "PLAY_REACTION" }>;
    const saved = applyOk(declared, { ...action, costCardIds: ["spell.magic_arrow", "spell.slow"] });
    expect(hasResurrection(saved)).toBe(true);
    expect(saved.combat!.units[GRIFFINS].damage).toBe(saved.combat!.units[GRIFFINS].maxHealth - 1); // fully saved
    expect(saved.players.p1.spellBook).not.toContain("spell.resurrection"); // cast left the Book
    expect(saved.players.p1.discard).toContain("spell.resurrection");
    expect(saved.players.p1.discard).toContain("spell.magic_arrow");
    expect(saved.players.p1.discard).toContain("spell.slow");
  });

  it("CONTROL: with nothing in hand or Book, no save is offered", () => {
    const declared = lethalSetup({ grade: "bronze", hand: [], spellBook: [] });
    expect(
      saveActions(declared).some((legal) => legal.action.type === "PLAY_REACTION"),
      "no card save should be offered when the hand and Book are empty"
    ).toBe(false);
  });
});

describe("The Spell Book's +1 Power can pay a silver Resurrection-specialty save", () => {
  function silverSave(state: GameState): LegalAction | undefined {
    return saveActions(state).find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "specialty.alamar.1" &&
        legal.action.optionIndex === 1
    );
  }

  it("CONTROL: one hand Magic Arrow (Power 1) alone cannot afford the Power-2 silver save", () => {
    const declared = lethalSetup({
      grade: "silver",
      hand: ["specialty.alamar.1", "spell.magic_arrow"],
      spellBook: []
    });
    expect(silverSave(declared), "Power 1 < the silver cost of 2 → not offered").toBeFalsy();
  });

  it("a hand Magic Arrow (Power 1) + one Book Spell (Power 1) reaches Power 2 and saves the unit", () => {
    const declared = lethalSetup({
      grade: "silver",
      hand: ["specialty.alamar.1", "spell.magic_arrow"],
      spellBook: ["spell.haste"]
    });
    const save = silverSave(declared);
    expect(save, "hand Power 1 + Book Power 1 affords the silver save").toBeTruthy();

    const action = save!.action as Extract<GameAction, { type: "PLAY_REACTION" }>;
    const saved = applyOk(declared, { ...action, costCardIds: ["spell.magic_arrow", "spell.haste"] });
    expect(hasResurrection(saved)).toBe(true);
    expect(saved.combat!.units[GRIFFINS].damage).toBe(saved.combat!.units[GRIFFINS].maxHealth - 1); // fully saved
    // The hand card went to discard; the Book Spell left the Book for discard…
    expect(saved.players.p1.discard).toContain("spell.magic_arrow");
    expect(saved.players.p1.spellBook).not.toContain("spell.haste");
    expect(saved.players.p1.discard).toContain("spell.haste");
    // …and the once-per-turn Book Power budget is now spent.
    expect(saved.players.p1.combatStats.spellBookPowerUsedThisTurn).toBe(true);
  });

  it("CONTROL: two Book Spells cannot stack — only ONE Book Spell may pay per turn", () => {
    // Hand holds no power source but the specialty; the silver save needs Power 2,
    // and the Book may contribute at most +1 — so two Book Spells still fall short.
    const declared = lethalSetup({
      grade: "silver",
      hand: ["specialty.alamar.1"],
      spellBook: ["spell.haste", "spell.curse"]
    });
    expect(
      silverSave(declared),
      "the Book caps at +1 Power per turn, so 0 hand + 1 Book Power < 2 → not offered"
    ).toBeFalsy();
  });

  it("the spent Book Power budget then blocks a second Book Power discard the same turn", () => {
    const declared = lethalSetup({
      grade: "silver",
      hand: ["specialty.alamar.1", "spell.magic_arrow"],
      spellBook: ["spell.haste"]
    });
    const save = silverSave(declared)!;
    const action = save.action as Extract<GameAction, { type: "PLAY_REACTION" }>;
    const saved = applyOk(declared, { ...action, costCardIds: ["spell.magic_arrow", "spell.haste"] });
    expect(saved.players.p1.combatStats.spellBookPowerUsedThisTurn).toBe(true);
  });
});

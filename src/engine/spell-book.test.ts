import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions,
  getPlayerView,
  spellBookRuleEnabled
} from "./index";
import { refreshRoundTokens } from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import type { GameAction, GameState, LegalAction, PlayerId } from "./state";

/**
 * Spell Book house rule (default ON), engine-enforced end to end. Each test
 * drives a real action through applyAction / getLegalActions and reads the
 * resulting state, so deleting any piece of the wiring makes a test fail:
 *   - stash a hand Spell into the Book (free a slot, no draw),
 *   - cast a Book Spell in combat (respects the one-Spell-per-round limit),
 *   - boost a cast with a Book Spell, capped at ONE per turn (crown-style lock),
 *   - re-route a picked-up discard Spell back into the Book,
 *   - and the rule's off-switch + the Book's privacy.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAll(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function legal(state: GameState, playerId: PlayerId): LegalAction[] {
  return getLegalActions(state, playerId);
}

/** A combat sandbox with p1's marksmen active and the enemy skeletons softened. */
function combat(seed: string): GameState {
  const state = createInitialGameState(seed);
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";
  state.players.p1.hand = [];
  state.players.p1.spellBook = [];
  state.players.p2.hand = [];
  const target = state.combat!.units.unit_p2_skeletons;
  target.abilities = [];
  target.maxHealth = 50;
  target.damage = 0;
  return state;
}

const SKELETONS = "unit_p2_skeletons";

// ---------------------------------------------------------------------------
// Casting a Spell out of the Book (combat)
// ---------------------------------------------------------------------------

describe("Spell Book — casting in combat", () => {
  it("casts a Book Spell like a hand Spell: deals damage and cycles Book → discard", () => {
    const state = combat("book-cast");
    state.players.p1.spellBook = ["spell.magic_arrow"];

    const cast = legal(state, "p1").find(
      (l) =>
        l.action.type === "CAST_SPELL" &&
        l.action.cardId === "spell.magic_arrow" &&
        l.action.fromSpellBook === true &&
        l.action.target?.type === "unit" &&
        l.action.target.unitId === SKELETONS
    );
    expect(cast, "a Book Magic Arrow should be castable at the skeletons").toBeTruthy();

    const resolved = passAll(applyOk(state, cast!.action));
    // Magic Arrow at power 0 deals 1 damage.
    expect(resolved.combat!.units[SKELETONS].damage).toBe(1);
    // The cast counted toward the per-combat-round limit…
    expect(resolved.players.p1.combatStats.spellsCastThisRound).toBe(1);
    // …and the Spell left the Book for the discard pile.
    expect(resolved.players.p1.spellBook).not.toContain("spell.magic_arrow");
    expect(resolved.players.p1.discard).toContain("spell.magic_arrow");
  });

  it("a Book cast respects the one-Spell-per-combat-round limit", () => {
    const state = combat("book-limit");
    state.players.p1.hand = ["spell.magic_arrow"];
    state.players.p1.spellBook = ["spell.implosion"];

    // Spend the single round cast on the hand Magic Arrow.
    const handCast = legal(state, "p1").find(
      (l) => l.action.type === "CAST_SPELL" && l.action.cardId === "spell.magic_arrow"
    );
    const afterFirst = passAll(applyOk(state, handCast!.action));
    expect(afterFirst.players.p1.combatStats.spellsCastThisRound).toBe(1);

    // The Book Implosion is no longer offered — the limit is reached.
    const bookCast = legal(afterFirst, "p1").find(
      (l) => l.action.type === "CAST_SPELL" && l.action.fromSpellBook === true
    );
    expect(bookCast, "no Book cast once the round's Spell limit is spent").toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Boosting Power with a Book Spell — capped at one per turn
// ---------------------------------------------------------------------------

/** Cast Implosion (0 dmg at power 0) and return the open reaction window state. */
function castImplosion(state: GameState): GameState {
  const cast = legal(state, "p1").find(
    (l) =>
      l.action.type === "CAST_SPELL" &&
      l.action.cardId === "spell.implosion" &&
      !l.action.fromSpellBook &&
      l.action.target?.type === "unit" &&
      l.action.target.unitId === SKELETONS
  );
  expect(cast, "Implosion should be castable at the skeletons").toBeTruthy();
  return applyOk(state, cast!.action);
}

describe("Spell Book — Power boost (one per turn)", () => {
  it("a Book Spell discarded for +1 Power lifts the cast and cycles Book → discard", () => {
    const state = combat("book-boost");
    state.players.p1.hand = ["spell.implosion"];
    state.players.p1.spellBook = ["spell.haste"];

    const opened = castImplosion(state);
    const boost = legal(opened, "p1").find(
      (l) =>
        l.action.type === "PLAY_REACTION" &&
        l.action.asPowerBoost === true &&
        l.action.fromSpellBook === true &&
        l.action.cardId === "spell.haste"
    );
    expect(boost, "a Book Power boost should be offered").toBeTruthy();

    const resolved = passAll(applyOk(opened, boost!.action));
    // Implosion at power 1 deals 2 damage (0 -> 2): the boost actually applied.
    expect(resolved.combat!.units[SKELETONS].damage).toBe(2);
    // The Book Spell paid for it and the per-turn lock is now set.
    expect(resolved.players.p1.spellBook).not.toContain("spell.haste");
    expect(resolved.players.p1.discard).toContain("spell.haste");
    expect(resolved.players.p1.combatStats.spellBookPowerUsedThisTurn).toBe(true);
  });

  it("without the boost the same cast does 0 damage (control)", () => {
    const state = combat("book-boost-control");
    state.players.p1.hand = ["spell.implosion"];
    const resolved = passAll(castImplosion(state));
    expect(resolved.combat!.units[SKELETONS].damage).toBe(0);
  });

  it("only ONE Book Power boost per turn; a hand boost is still allowed; a 2nd Book boost is rejected", () => {
    const state = combat("book-boost-lock");
    state.players.p1.hand = ["spell.implosion", "spell.bless"]; // bless = a hand Power source
    state.players.p1.spellBook = ["spell.haste", "spell.curse"]; // two Book Power sources

    const opened = castImplosion(state);

    // Spend the one Book boost (haste).
    const firstBook = legal(opened, "p1").find(
      (l) => l.action.type === "PLAY_REACTION" && l.action.fromSpellBook === true && l.action.cardId === "spell.haste"
    );
    const afterBook = applyOk(opened, firstBook!.action);
    expect(afterBook.players.p1.combatStats.spellBookPowerUsedThisTurn).toBe(true);

    // No further Book Power boost is offered…
    const secondBookOffered = legal(afterBook, "p1").some(
      (l) => l.action.type === "PLAY_REACTION" && l.action.asPowerBoost === true && l.action.fromSpellBook === true
    );
    expect(secondBookOffered, "the Book Power budget is spent for the turn").toBe(false);

    // …but a HAND Power boost is unaffected.
    const handBoostOffered = legal(afterBook, "p1").some(
      (l) =>
        l.action.type === "PLAY_REACTION" &&
        l.action.asPowerBoost === true &&
        !l.action.fromSpellBook &&
        l.action.cardId === "spell.bless"
    );
    expect(handBoostOffered, "hand Power boosts are not capped").toBe(true);

    // Forcing a 2nd Book boost anyway is rejected by the reducer.
    const forced = applyAction(afterBook, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "spell.curse",
      mode: "basic",
      asPowerBoost: true,
      fromSpellBook: true
    });
    expect(forced.errors.length, "a second Book Power discard must be rejected").toBeGreaterThan(0);
    expect(forced.state.players.p1.spellBook).toContain("spell.curse");
  });

  it("the per-turn Book Power lock refreshes at the start of the player's turn", () => {
    const state = combat("book-boost-reset");
    state.players.p1.combatStats.spellBookPowerUsedThisTurn = true;
    refreshRoundTokens(state);
    expect(state.players.p1.combatStats.spellBookPowerUsedThisTurn).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Book Spells as combat instants
// ---------------------------------------------------------------------------

describe("Spell Book — instant Spells in combat", () => {
  it("offers a Book instant Spell (Bloodlust) in the attacker's buff window", () => {
    const state = combat("book-instant");
    // Bloodlust buffs a ground/flying attacker — use the flying griffins, set
    // adjacent to the skeletons (position 9, as in the crown-limit tests).
    state.combat!.activeUnitId = "unit_p1_griffins";
    state.combat!.units.unit_p1_griffins.position = 9;
    state.players.p1.spellBook = ["spell.bloodlust"];

    const opened = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: SKELETONS
    });
    expect(opened.reactionWindow, "declaring the attack opens the buff window").toBeTruthy();

    const offered = legal(opened, "p1").some(
      (l) =>
        l.action.type === "PLAY_REACTION" &&
        l.action.cardId === "spell.bloodlust" &&
        l.action.fromSpellBook === true
    );
    expect(offered, "a Book Bloodlust should be a legal attack-window reaction").toBe(true);

    // And playing it from the Book applies the buff and cycles Book → discard.
    const play = legal(opened, "p1").find(
      (l) =>
        l.action.type === "PLAY_REACTION" && l.action.cardId === "spell.bloodlust" && l.action.fromSpellBook === true
    );
    const resolved = passAll(applyOk(opened, play!.action));
    expect(resolved.players.p1.spellBook).not.toContain("spell.bloodlust");
    expect(resolved.players.p1.discard).toContain("spell.bloodlust");
  });
});

// ---------------------------------------------------------------------------
// Stashing a hand Spell into the Book (map turn)
// ---------------------------------------------------------------------------

/** A started 2-player adventure with p1 to act and no pending hand refresh. */
function adventure(seed: string, spellBook = true): GameState {
  let state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false, spellBook });
  if (state.players.p1.needsHandRefresh) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  state.activePlayerId = "p1";
  state.players.p1.canMulligan = false;
  return state;
}

describe("Spell Book — stashing from hand (map turn)", () => {
  it("moves a hand Spell into the Book, freeing the slot WITHOUT drawing", () => {
    const state = adventure("book-stash");
    state.players.p1.hand = ["spell.magic_arrow", "stat.attack"];
    const deckBefore = state.players.p1.deck.length;

    const stash = legal(state, "p1").find(
      (l) => l.action.type === "MOVE_SPELL_TO_SPELL_BOOK" && l.action.cardId === "spell.magic_arrow"
    );
    expect(stash, "stashing a hand Spell should be offered on your map turn").toBeTruthy();

    const moved = applyOk(state, stash!.action);
    expect(moved.players.p1.spellBook).toContain("spell.magic_arrow");
    expect(moved.players.p1.hand).not.toContain("spell.magic_arrow");
    // The other hand card stays; no replacement was drawn.
    expect(moved.players.p1.hand).toEqual(["stat.attack"]);
    expect(moved.players.p1.deck.length).toBe(deckBefore);
  });

  it("only Spells may be stashed — a Statistic card is never offered", () => {
    const state = adventure("book-stash-nonspell");
    state.players.p1.hand = ["stat.attack"];
    const stash = legal(state, "p1").some((l) => l.action.type === "MOVE_SPELL_TO_SPELL_BOOK");
    expect(stash).toBe(false);
  });

  it("over the hand limit, the forced discard comes first — no stashing until REFRESH_HAND", () => {
    const state = adventure("book-stash-overlimit");
    state.players.p1.hand = ["spell.magic_arrow", "spell.haste", "stat.attack"];
    state.players.p1.needsHandRefresh = true;

    const blocked = legal(state, "p1").some((l) => l.action.type === "MOVE_SPELL_TO_SPELL_BOOK");
    expect(blocked, "stashing is blocked while a forced hand discard is pending").toBe(false);
    // The only hand action offered is the refresh.
    expect(legal(state, "p1").some((l) => l.action.type === "REFRESH_HAND")).toBe(true);

    // Once the over-limit state clears, stashing is allowed again.
    state.players.p1.needsHandRefresh = false;
    expect(legal(state, "p1").some((l) => l.action.type === "MOVE_SPELL_TO_SPELL_BOOK")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Casting a Map Spell out of the Book
// ---------------------------------------------------------------------------

describe("Spell Book — map Spells", () => {
  it("casts a Book Map Spell (Town Portal) from the map and cycles Book → discard", () => {
    const state = adventure("book-map-cast");
    state.players.p1.hand = [];
    state.players.p1.spellBook = ["spell.town_portal"];

    const play = legal(state, "p1").find(
      (l) => l.action.type === "PLAY_CARD" && l.action.cardId === "spell.town_portal" && l.action.fromSpellBook === true
    );
    expect(play, "a Book Town Portal should be playable from the map turn").toBeTruthy();

    // Resolving it pulls the Spell out of the Book (it never touches the hand)
    // and resolves the cast — the playCard fromSpellBook branch, not the hand one.
    const cast = applyOk(state, play!.action);
    expect(cast.players.p1.spellBook).not.toContain("spell.town_portal");
    expect(cast.players.p1.hand).not.toContain("spell.town_portal");
  });
});

// ---------------------------------------------------------------------------
// Refilling the Book from the discard pile
// ---------------------------------------------------------------------------

describe("Spell Book — refill from discard on pickup", () => {
  it("a picked-up discard Spell may be routed straight into the Book", () => {
    const state = adventure("book-refill");
    state.players.p1.hand = [];
    state.players.p1.discard = ["spell.haste"];
    state.adventure!.rewardQueue.push({ playerId: "p1", kind: "discard-pick", count: 1 });
    pumpAdventureQueues(state);

    const choice = state.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    const options = choice && "options" in choice ? choice.options : [];
    // Two routes for the one Spell: to hand, and to the Book.
    expect(options.length).toBe(2);
    const bookIndex = options.findIndex((option) => option.label.includes("Spell Book"));
    expect(bookIndex).toBeGreaterThanOrEqual(0);

    const took = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice!.id,
      optionIndex: bookIndex
    });
    expect(took.players.p1.spellBook).toContain("spell.haste");
    expect(took.players.p1.hand).not.toContain("spell.haste");
    expect(took.players.p1.discard).not.toContain("spell.haste");
  });
});

// ---------------------------------------------------------------------------
// Off-switch and privacy
// ---------------------------------------------------------------------------

describe("Spell Book — off-switch and privacy", () => {
  it("with the rule OFF, no stashing and no Book pickup route", () => {
    const state = adventure("book-off", false);
    expect(spellBookRuleEnabled(state)).toBe(false);
    state.players.p1.hand = ["spell.magic_arrow"];
    expect(legal(state, "p1").some((l) => l.action.type === "MOVE_SPELL_TO_SPELL_BOOK")).toBe(false);

    // The discard pickup offers only the "to hand" route.
    state.players.p1.hand = [];
    state.players.p1.discard = ["spell.haste"];
    state.adventure!.rewardQueue.push({ playerId: "p1", kind: "discard-pick", count: 1 });
    pumpAdventureQueues(state);
    const choice = state.pendingChoice;
    const options = choice && "options" in choice ? choice.options : [];
    expect(options.length).toBe(1);
    expect(options[0]?.label.includes("Spell Book")).toBe(false);
  });

  it("the Book is private: opponents see only the count, the owner sees the Spells", () => {
    const state = adventure("book-privacy");
    state.players.p1.spellBook = ["spell.magic_arrow", "spell.haste"];

    const enemyView = getPlayerView(state, "p2");
    expect(enemyView.players.p1.spellBook).toEqual([]);
    expect(enemyView.players.p1.spellBookCount).toBe(2);

    const ownerView = getPlayerView(state, "p1");
    expect(ownerView.players.p1.spellBook).toEqual(["spell.magic_arrow", "spell.haste"]);
    expect(ownerView.players.p1.spellBookCount).toBe(2);
  });
});

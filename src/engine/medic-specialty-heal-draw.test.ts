import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import { drawRiderThenDiscard, healDrawOnlyRider, instantDrawOnlyRider } from "./legal-actions";
import { placeCombatToken } from "./tokens";
import { cardLibrary } from "../data/cards/library";
import type { CardId, GameAction, GameState, PlayerVisibleState, UnitId } from "./state";
import { scoreCardAction } from "./computer/card-policy";

// ---------------------------------------------------------------------------
// Medic hero specialties (Rion's Battlefield Medic, Astra's Cure, and their
// rethemed clones Aoko / Sirius / Molian) — two behaviours:
//
//  1. REACTION-WINDOW HEAL (already wired, pinned here for the first time):
//     the printed Instant may be played into an open attack window, INCLUDING
//     the window that opens before the defender's COUNTER-ATTACK, so the heal
//     lands before the incoming damage and can save a unit that would die.
//     NEW in this pass: a face whose printed cleanse lifts Paralysis is offered
//     on a PARALYSED unit even at full health (it used to need damage > 0, which
//     made "Remove paralysis" unplayable in the window on an undamaged unit).
//
//  2. MAP DRAW-ONLY PLAY (new): the same Instant may be played on the owner's
//     adventure-map turn purely for its "then draw N cards" rider — no combat,
//     so the heal fizzles and only the draw resolves, exactly like
//     Offense/Armorer/Sorcery's "+stat, then draw".
//
// Every assertion fails if its wiring is removed (CLAUDE.md #1), each with a
// CONTROL: no-card / wrong-side for the reaction, no-rider / opponent-turn for
// the map play.
// ---------------------------------------------------------------------------

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/**
 * The open "…: discard N card(s)" picker's option labels. Rion VI's printed
 * discard is a POST-DRAW rider, so this list is the observable proof of order:
 * it can only contain the just-drawn cards if the draw already happened.
 */
function discardPick(state: GameState): string[] {
  const choice = state.pendingChoice;
  expect(choice?.type === "OPTION_CHOICE" ? choice.context : null, "a hand-discard picker is open").toBe(
    "hand-discard"
  );
  return choice?.type === "OPTION_CHOICE" ? choice.options.map((option) => option.label) : [];
}

/** The engine-offered CHOOSE_OPTION whose label matches, so the choiceId is real. */
function chooseOptionAction(state: GameState, playerId: "p1" | "p2", label: string): GameAction {
  const offer = getLegalActions(state, playerId).find(
    (legal) => legal.action.type === "CHOOSE_OPTION" && legal.label === label
  );
  expect(offer, `"${label}" is offered`).toBeTruthy();
  return offer!.action;
}

// ===========================================================================
// 1. Reaction window — the heal lands BEFORE the counter-attack
// ===========================================================================

/**
 * p1's Crusaders attack p2's Skeletons; the Skeletons RETALIATE, which opens the
 * reaction window p1 may heal into. The Crusaders are one point from death, so
 * the retaliation is lethal unless the medic mends them first.
 */
function lethalRetaliationState(hand: string[]): GameState {
  const state = createInitialGameState("medic-retaliation");
  state.players.p1.hand = [...hand] as CardId[];
  state.players.p2.hand = [];
  state.players.p1.deck = ["spell.bless" as CardId];

  const units = state.combat!.units;
  const crusaders = units.unit_p1_crusaders;
  crusaders.position = 14;
  crusaders.maxHealth = 5;
  crusaders.damage = 4; // one more point kills it
  crusaders.defense = 0;
  crusaders.activatedThisRound = false;
  crusaders.attackedThisActivation = false;

  const skeletons = units.unit_p2_skeletons;
  skeletons.position = 13;
  skeletons.maxHealth = 40; // survives p1's blow so it can retaliate
  skeletons.attack = 0; // retaliation deals exactly 1 with a scripted "+1" die

  // "+1" faces throughout: a "0" face would open the Crusaders' attack-die
  // reroll choice instead of the retaliation's reaction window.
  state.combat!.dice.scriptedRolls = [1, 1, 1, 1];
  state.combat!.dice.rollCount = 0;
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_crusaders";
  return state;
}

/** Pass every open reaction window so the paused hit finally resolves. */
function passOutOfReactionWindows(state: GameState): GameState {
  let next = state;
  for (let guard = 0; guard < 12 && next.reactionWindow; guard += 1) {
    const pass = (["p1", "p2"] as const)
      .flatMap((playerId) => getLegalActions(next, playerId))
      .find((legal) => legal.action.type === "PASS_REACTION");
    if (!pass) {
      break;
    }
    next = applyOk(next, pass.action);
  }
  return next;
}

/**
 * Whether the Pack survived the blow INTACT. p1's Crusaders are a Pack, so a
 * lethal hit flips them down to the Few side (`flippedDownThisCombat`) rather
 * than removing the card — that flip is the casualty this heal prevents.
 */
function packIntact(state: GameState, unitId: UnitId): boolean {
  const unit = state.combat?.units[unitId];
  return Boolean(unit && unit.variant === "pack" && !unit.flippedDownThisCombat && unit.damage < unit.maxHealth);
}

/**
 * Declare p1's Crusaders' attack and pass out of the PRIMARY attack's own
 * window.
 *
 * 2026-08-08 USER RULING ("instant abilities should be able to be played …
 * when attack and when defend, all of them"): a held instant now opens an
 * attack window for EITHER combat participant, so p1's own declaration is
 * answered first. The RETALIATION window these tests are about is one Pass
 * further along and otherwise unchanged.
 */
function declareAndReachRetaliation(state: GameState): GameState {
  let next = applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: "unit_p1_crusaders",
    defenderId: "unit_p2_skeletons"
  } as GameAction);
  for (let guard = 0; guard < 6; guard += 1) {
    const window = next.reactionWindow;
    if (!window) {
      break;
    }
    if (window.triggerEvent.type === "UNIT_ATTACK_DECLARED" && window.triggerEvent.isRetaliation) {
      break;
    }
    next = applyOk(next, { type: "PASS_REACTION", playerId: window.priorityPlayerId });
  }
  return next;
}

function healOffer(state: GameState, playerId: "p1" | "p2", cardId: string) {
  return getLegalActions(state, playerId).find(
    (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === cardId
  );
}

describe("medic specialty as a reaction — the heal lands before the COUNTER-ATTACK", () => {
  it("Rion I heals into the retaliation window and saves the unit; no card = it dies (CONTROL)", () => {
    const declared = declareAndReachRetaliation(lethalRetaliationState(["specialty.rion.1"]));
    const window = declared.reactionWindow;
    expect(window, "the retaliation opens a reaction window").toBeTruthy();
    expect(
      window!.triggerEvent.type === "UNIT_ATTACK_DECLARED" && window!.triggerEvent.isRetaliation,
      "it is the RETALIATION's window, i.e. before the counter-attack resolves"
    ).toBe(true);
    expect(declared.combat!.units.unit_p1_crusaders.damage, "the counter-attack has not landed yet").toBe(4);

    const offer = healOffer(declared, "p1", "specialty.rion.1");
    expect(offer, "the medic Instant is offered to the threatened side").toBeTruthy();

    let healed = applyOk(declared, offer!.action);
    healed = passOutOfReactionWindows(healed);
    // OBSERVABLE OUTCOME: the unit that would have died is still on the board.
    expect(
      packIntact(healed, "unit_p1_crusaders" as UnitId),
      "the healed Pack survived the counter-attack without being flipped down"
    ).toBe(true);
    const healIndex = healed.eventLog.findIndex((event) => event.type === "DAMAGE_HEALED");
    expect(healIndex, "the heal is in the log").toBeGreaterThan(-1);
    // ORDER: the counter-attack's own roll happens AFTER the heal, i.e. the heal
    // really landed before the retaliation was resolved (not after it).
    const rollsAfterHeal = healed.eventLog
      .slice(healIndex)
      .filter((event) => event.type === "ATTACK_ROLLED").length;
    expect(rollsAfterHeal, "the counter-attack rolls AFTER the heal").toBeGreaterThan(0);
    expect(healed.players.p1.hand, "the printed draw rider still resolved").toContain("spell.bless");

    // CONTROL: with no medic card in hand the counter-attack kills the unit.
    const noCard = applyOk(lethalRetaliationState([]), {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_crusaders",
      defenderId: "unit_p2_skeletons"
    });
    expect(healOffer(noCard, "p1", "specialty.rion.1"), "no card, no offer").toBeUndefined();
    expect(
      packIntact(noCard, "unit_p1_crusaders" as UnitId),
      "unhealed, the counter-attack is lethal and the Pack is flipped down"
    ).toBe(false);
  });

  it("CONTROL: the opposing side is never offered the medic card it does not hold", () => {
    const declared = applyOk(lethalRetaliationState(["specialty.rion.1"]), {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_crusaders",
      defenderId: "unit_p2_skeletons"
    });
    expect(healOffer(declared, "p2", "specialty.rion.1"), "p2 cannot play p1's card").toBeUndefined();
  });

  it("Rion IV's 'Remove paralysis' side is offered on a PARALYSED but UNDAMAGED unit", () => {
    const base = lethalRetaliationState(["specialty.rion.4"]);
    const griffins = base.combat!.units.unit_p1_griffins;
    griffins.damage = 0;
    placeCombatToken(base, griffins, "paralysis", 0, "Blind");
    // Every OTHER friendly unit is undamaged too, so a damage-only gate offers nothing.
    for (const unit of Object.values(base.combat!.units)) {
      if (unit.controllerId === "p1") {
        unit.damage = 0;
      }
    }
    base.combat!.units.unit_p1_crusaders.maxHealth = 40;

    const declared = declareAndReachRetaliation(base);
    const cleanse = getLegalActions(declared, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "specialty.rion.4" &&
        legal.action.target?.type === "unit" &&
        legal.action.target.unitId === "unit_p1_griffins"
    );
    expect(cleanse, "the paralysed unit is a legal cleanse target even at full health").toBeTruthy();

    const resolved = applyOk(declared, cleanse!.action);
    expect(
      resolved.combat!.units.unit_p1_griffins.tokens?.some((token) => token.kind === "paralysis") ?? false,
      "the Paralysis token is gone"
    ).toBe(false);

    // CONTROL: with no Paralysis token anywhere and nothing damaged, NO
    // unit-targeted cleanse/heal is offered — the damage/paralysis gate still
    // applies. (Since the 2026-08-08 ruling the card is still offered as a
    // target-less DRAW-ONLY join, which is the point of that ruling; what this
    // CONTROL pins is that it can never be aimed at a unit with nothing to fix.)
    const clean = lethalRetaliationState(["specialty.rion.4"]);
    for (const unit of Object.values(clean.combat!.units)) {
      if (unit.controllerId === "p1") {
        unit.damage = 0;
      }
    }
    clean.combat!.units.unit_p1_crusaders.maxHealth = 40;
    const declaredClean = declareAndReachRetaliation(clean);
    const cleanOffers = getLegalActions(declaredClean, "p1").filter(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "specialty.rion.4"
    );
    expect(
      cleanOffers.filter(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.target?.type === "unit"
      ),
      "nothing wounded and nothing paralysed → no unit-targeted medic offer"
    ).toEqual([]);
    expect(
      cleanOffers.every(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.drawOnly === true
      ),
      "…only the draw-only join remains"
    ).toBe(true);
  });
});

// ===========================================================================
// 2. Map draw-only play
// ===========================================================================

/** A fresh adventure map with p1's turn open and hand replaced by `cards`. */
function mapHand(cards: string[]): GameState {
  let state = createAdventureGameState({ seed: "medic-map-draw", difficulty: "normal", rollFirstPlayer: false });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = applyOk(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  state.players.p1.hand = [...cards] as CardId[];
  return state;
}

function mapPlays(state: GameState, cardId: string, playerId: "p1" | "p2" = "p1") {
  return getLegalActions(state, playerId)
    .map((legal) => legal.action)
    .filter(
      (action): action is Extract<GameAction, { type: "PLAY_CARD" }> =>
        action.type === "PLAY_CARD" && action.cardId === cardId
    );
}

describe("medic specialty on the adventure map — the draw rider alone", () => {
  it("Rion I is playable on the map: draws 1, heals nothing", () => {
    let state = mapHand(["specialty.rion.1"]);
    state.players.p1.deck = ["spell.bless" as CardId, "spell.haste" as CardId];
    const plays = mapPlays(state, "specialty.rion.1");
    expect(plays.length, "one draw-only map play").toBe(1);
    expect(plays[0].target).toEqual({ type: "none" });

    state = applyOk(state, plays[0]);
    expect(state.players.p1.hand, "the draw rider resolved").toEqual(["spell.haste"]);
    expect(state.players.p1.discard, "the card went to the discard pile").toContain("specialty.rion.1");
    expect(state.combat, "no combat was started").toBeFalsy();
  });

  it("Rion IV/VI offer one draw-only play per printed side (VI draws FIRST, then discards)", () => {
    let state = mapHand(["specialty.rion.4", "specialty.rion.6", "ability.luck"]);
    state.players.p1.deck = ["spell.bless" as CardId, "spell.haste" as CardId, "spell.curse" as CardId];

    expect(mapPlays(state, "specialty.rion.4").length, "both Rion IV sides carry a draw rider").toBe(2);
    const sixSides = mapPlays(state, "specialty.rion.6");
    expect(sixSides.length, "both Rion VI sides carry a draw rider").toBe(2);

    // No `costCardIds`: the printed discard is NOT an up-front cost any more.
    state = applyOk(state, sixSides[0]);
    // The two cards just DRAWN are candidates for the printed discard — the
    // observable proof that the draw ran first (an up-front cost could only ever
    // have offered `ability.luck`, the one card that was already in hand).
    const pick = discardPick(state);
    expect(pick.map((label) => label.replace("Discard ", "")).sort(), "the drawn cards are discardable").toEqual([
      "Battlefield Medic IV",
      "Curse",
      "Haste",
      "Luck"
    ]);
    state = applyOk(state, chooseOptionAction(state, "p1", "Discard Haste"));
    // OBSERVABLE OUTCOME: spend the specialty, draw 2, discard the pick.
    expect([...state.players.p1.hand].sort()).toEqual(["ability.luck", "specialty.rion.4", "spell.curse"]);
    expect(state.players.p1.discard, "the specialty and the pitched draw are in the discard").toEqual([
      "specialty.rion.6",
      "spell.haste"
    ]);
  });

  it("Rion VI is playable as the LAST card in hand — the cards it draws pay its discard", () => {
    // The reported bug: the printed discard used to be an up-front COST, so with
    // the specialty as the only card in hand the play was not offered at all.
    let state = mapHand(["specialty.rion.6"]);
    state.players.p1.deck = ["spell.bless" as CardId, "spell.haste" as CardId, "spell.curse" as CardId];
    const sides = mapPlays(state, "specialty.rion.6");
    expect(sides.length, "both sides are offered with an otherwise empty hand").toBe(2);

    state = applyOk(state, sides[0]);
    expect([...state.players.p1.hand].sort(), "drew 2 with nothing else in hand").toEqual([
      "spell.curse",
      "spell.haste"
    ]);
    expect(discardPick(state).sort(), "one of the two DRAWN cards pays the discard").toEqual([
      "Discard Curse",
      "Discard Haste"
    ]);
    state = applyOk(state, chooseOptionAction(state, "p1", "Discard Curse"));
    expect(state.players.p1.hand, "net: -card +2 -1").toEqual(["spell.haste"]);
    expect(state.players.p1.discard).toEqual(["specialty.rion.6", "spell.curse"]);
  });

  it("Astra's Cure I (the HEAL_DAMAGE_AND_REMOVE_EFFECTS medic face) also gains the map draw", () => {
    let state = mapHand(["specialty.astra.1"]);
    state.players.p1.deck = ["spell.haste" as CardId];
    const plays = mapPlays(state, "specialty.astra.1");
    expect(plays.length).toBe(1);
    state = applyOk(state, plays[0]);
    expect(state.players.p1.hand).toEqual(["spell.haste"]);
  });

  it("CONTROL: a medic face with NO printed draw rider stays combat-only on the map", () => {
    // Astra IV/VI and Gem IV heal without drawing — no map play.
    const state = mapHand(["specialty.astra.4", "specialty.astra.6", "specialty.gem.4"]);
    expect(mapPlays(state, "specialty.astra.4"), "Cure IV has no draw rider").toEqual([]);
    expect(mapPlays(state, "specialty.astra.6"), "Cure VI has no draw rider").toEqual([]);
    expect(mapPlays(state, "specialty.gem.4"), "First Aid IV has no draw rider").toEqual([]);
  });

  it("CONTROL: it is not offered during another player's turn", () => {
    const state = mapHand(["specialty.rion.1"]);
    state.players.p2.hand = ["specialty.rion.1" as CardId];
    expect(mapPlays(state, "specialty.rion.1", "p2"), "p2's turn is not open").toEqual([]);
  });

  it("CONTROL: a combat play that is NEGATED still draws nothing (the gate is the target-less play)", () => {
    // A unit-targeted play whose target is dropped by the resolution (Dwarf
    // negation / effect-ignoring unit) must keep its old no-op behaviour.
    const state = createInitialGameState("medic-negate");
    state.players.p1.hand = ["specialty.rion.1" as CardId];
    state.players.p1.deck = ["spell.bless" as CardId];
    const crusaders = state.combat!.units.unit_p1_crusaders;
    crusaders.damage = 2;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_crusaders";
    crusaders.activatedThisRound = false;
    crusaders.attackedThisActivation = false;

    // Sanity: the ordinary combat play IS unit-targeted (never target-less), so
    // the new draw-only branch cannot fire for it.
    const combatPlays = getLegalActions(state, "p1")
      .map((legal) => legal.action)
      .filter(
        (action): action is Extract<GameAction, { type: "PLAY_CARD" }> =>
          action.type === "PLAY_CARD" && action.cardId === "specialty.rion.1"
      );
    expect(combatPlays.length, "offered in combat").toBeGreaterThan(0);
    for (const play of combatPlays) {
      expect(play.target?.type, "every combat offer names a unit").toBe("unit");
    }
  });
});

// ===========================================================================
// 2b. Rion VI as a REACTION with the specialty as the LAST card in hand
// ===========================================================================

describe("Rion VI as a reaction — the printed discard follows the draw", () => {
  it("is offered with nothing else in hand, saves the unit, then discards a DRAWN card", () => {
    const base = lethalRetaliationState(["specialty.rion.6"]);
    base.players.p1.deck = ["spell.bless" as CardId, "spell.haste" as CardId, "spell.curse" as CardId];
    const declared = declareAndReachRetaliation(base);
    // Under the old up-front `cost.discardCards` this offer did NOT exist: the
    // specialty was the only hand card, so the cost was unaffordable.
    const offer = healOffer(declared, "p1", "specialty.rion.6");
    expect(offer, "the medic Instant is offered as the last card in hand").toBeTruthy();

    let healed = applyOk(declared, offer!.action);
    // The draw ran BEFORE the discard, so the drawn cards are the candidates.
    expect(discardPick(healed).sort(), "the two just-drawn cards pay the discard").toEqual([
      "Discard Curse",
      "Discard Haste"
    ]);
    healed = applyOk(healed, chooseOptionAction(healed, "p1", "Discard Curse"));
    expect(healed.players.p1.hand, "kept the other drawn card").toEqual(["spell.haste"]);
    expect(healed.players.p1.discard).toEqual(["specialty.rion.6", "spell.curse"]);

    healed = passOutOfReactionWindows(healed);
    // OBSERVABLE OUTCOME: the heal still landed, so the counter-attack did not
    // flip the Pack down.
    expect(
      packIntact(healed, "unit_p1_crusaders" as UnitId),
      "the healed Pack survived the counter-attack"
    ).toBe(true);
  });

  it("the ordinary COMBAT play (own activation, wounded unit) mends, draws, THEN discards", () => {
    let state = createInitialGameState("medic-combat-play");
    state.players.p1.hand = ["specialty.rion.6" as CardId];
    state.players.p1.deck = ["spell.bless" as CardId, "spell.haste" as CardId, "spell.curse" as CardId];
    const crusaders = state.combat!.units.unit_p1_crusaders;
    crusaders.maxHealth = 30;
    crusaders.damage = 4;
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_crusaders";
    crusaders.activatedThisRound = false;
    crusaders.attackedThisActivation = false;

    const play = getLegalActions(state, "p1")
      .map((legal) => legal.action)
      .find(
        (action): action is Extract<GameAction, { type: "PLAY_CARD" }> =>
          action.type === "PLAY_CARD" &&
          action.cardId === "specialty.rion.6" &&
          action.target?.type === "unit" &&
          action.target.unitId === "unit_p1_crusaders"
      );
    // Under the old up-front cost this offer was withheld (nothing to pitch).
    expect(play, "offered on the wounded unit with the specialty as the only hand card").toBeTruthy();

    state = applyOk(state, play!);
    // OBSERVABLE OUTCOME: 2 damage mended AND both cards drawn before the pitch.
    expect(state.combat!.units.unit_p1_crusaders.damage, "healed 2").toBe(2);
    expect(discardPick(state).sort(), "the drawn cards pay the printed discard").toEqual([
      "Discard Curse",
      "Discard Haste"
    ]);
    state = applyOk(state, chooseOptionAction(state, "p1", "Discard Haste"));
    expect(state.players.p1.hand).toEqual(["spell.curse"]);
    expect(state.players.p1.discard).toEqual(["specialty.rion.6", "spell.haste"]);
  });
});

// ===========================================================================
// 2c. Reaction window with NOTHING to heal — the draw rider alone
// ===========================================================================

/**
 * p2's Skeletons attack p1's Crusaders while EVERY p1 unit is at full health and
 * unparalysed, and p2 holds an Offense so a real reaction OPENS the window. p2
 * passes, leaving p1 on priority inside an already-open window.
 */
function openWindowNoWounds(hand: string[], damage = 0): GameState {
  const state = createInitialGameState("medic-draw-join");
  state.players.p1.hand = [...hand] as CardId[];
  state.players.p2.hand = ["ability.offense" as CardId];
  state.players.p1.deck = ["spell.bless" as CardId, "spell.haste" as CardId, "spell.curse" as CardId];
  const units = state.combat!.units;
  for (const unit of Object.values(units)) {
    if (unit.controllerId === "p1") {
      unit.damage = 0;
    }
  }
  units.unit_p1_crusaders.position = 14;
  units.unit_p1_crusaders.maxHealth = 30;
  units.unit_p1_crusaders.damage = damage;
  units.unit_p2_skeletons.position = 13;
  units.unit_p2_skeletons.activatedThisRound = false;
  units.unit_p2_skeletons.attackedThisActivation = false;
  state.activePlayerId = "p2";
  state.combat!.activeUnitId = "unit_p2_skeletons";
  state.combat!.dice.scriptedRolls = [1, 1, 1, 1];
  state.combat!.dice.rollCount = 0;

  let next = applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p2",
    attackerId: "unit_p2_skeletons",
    defenderId: "unit_p1_crusaders"
  });
  const pass = getLegalActions(next, "p2").find((legal) => legal.action.type === "PASS_REACTION");
  if (pass) {
    next = applyOk(next, pass.action);
  }
  return next;
}

describe("medic specialty as a DRAW-ONLY reaction — nothing needs healing", () => {
  it("Rion I joins an open window for its draw alone: draws 1, heals nobody", () => {
    let state = openWindowNoWounds(["specialty.rion.1"]);
    expect(Boolean(state.reactionWindow), "the window is open (p2's Offense opened it)").toBe(true);
    const offer = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "specialty.rion.1" &&
        legal.action.drawOnly === true
    );
    expect(offer, "the medic Instant joins the open window as a draw-only reaction").toBeTruthy();

    const healthBefore = Object.fromEntries(
      Object.values(state.combat!.units).map((unit) => [unit.id, unit.damage])
    );
    state = applyOk(state, offer!.action);
    // OBSERVABLE OUTCOME: a card was drawn and not one point of damage moved.
    expect(state.players.p1.hand, "the printed draw resolved").toEqual(["spell.curse"]);
    expect(state.players.p1.discard).toEqual(["specialty.rion.1"]);
    expect(
      Object.fromEntries(Object.values(state.combat!.units).map((unit) => [unit.id, unit.damage])),
      "the heal fizzled — nobody was mended"
    ).toEqual(healthBefore);
    expect(
      state.eventLog.some((event) => event.type === "DAMAGE_HEALED"),
      "no heal event"
    ).toBe(false);
  });

  it("Rion VI joins for the draw too, then still pays its printed discard", () => {
    let state = openWindowNoWounds(["specialty.rion.6"]);
    const offer = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "specialty.rion.6" &&
        legal.action.drawOnly === true
    );
    expect(offer, "the last-card-in-hand VI joins as a draw-only reaction").toBeTruthy();
    state = applyOk(state, offer!.action);
    expect([...state.players.p1.hand].sort(), "drew 2").toEqual(["spell.curse", "spell.haste"]);
    expect(discardPick(state).sort(), "the discard is collected AFTER the draw").toEqual([
      "Discard Curse",
      "Discard Haste"
    ]);
    state = applyOk(state, chooseOptionAction(state, "p1", "Discard Haste"));
    expect(state.players.p1.hand).toEqual(["spell.curse"]);
    expect(state.players.p1.discard).toEqual(["specialty.rion.6", "spell.haste"]);
    expect(Boolean(state.reactionWindow), "the window survives the nested discard pick").toBe(true);
  });

  it("CONTROL: with a WOUNDED unit the REAL heal is offered and there is no look-alike twin", () => {
    const state = openWindowNoWounds(["specialty.rion.1"], 5);
    const offers = getLegalActions(state, "p1").filter(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "specialty.rion.1"
    );
    expect(offers.length, "exactly ONE offer — the real heal, no draw-only trap twin").toBe(1);
    const only = offers[0].action as Extract<GameAction, { type: "PLAY_REACTION" }>;
    expect(only.drawOnly, "it is the real heal").toBeUndefined();
    expect(only.target, "aimed at the wounded unit").toEqual({ type: "unit", unitId: "unit_p1_crusaders" });
  });

  it("a lone medic card DOES open the window now — the reported bug (2026-08-08 ruling)", () => {
    // FLIPPED EXPECTATION, justified: this was the CONTROL "a lone medic card
    // never OPENS a window of its own", on the reasoning that a draw rider must
    // never pause an attack. THAT IS THE EXACT BUG THE USER REPORTED — "I still
    // can't use card like Rion speciality, not for heal, just for draw effect,
    // choice never appear properly": in a NEUTRAL fight the guards open no
    // window either, so a defender holding only a medic never got a moment at
    // all. reactionOfferOpensWindow now treats a drawOnly/utilityOnly offer as
    // an opener inside an ATTACK window; a Spell cast / activation / die-settled
    // window is unchanged (CONTROLs elsewhere in this file and in
    // combat-instant-reaction-windows.test.ts).
    // Fails if that widening is reverted.
    const state = createInitialGameState("medic-no-open");
    state.players.p1.hand = ["specialty.rion.1" as CardId];
    state.players.p2.hand = [];
    state.players.p1.deck = ["spell.bless" as CardId, "spell.haste" as CardId];
    const units = state.combat!.units;
    for (const unit of Object.values(units)) {
      if (unit.controllerId === "p1") {
        unit.damage = 0;
      }
    }
    units.unit_p1_crusaders.position = 14;
    units.unit_p1_crusaders.maxHealth = 30;
    units.unit_p2_skeletons.position = 13;
    units.unit_p2_skeletons.activatedThisRound = false;
    units.unit_p2_skeletons.attackedThisActivation = false;
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state.combat!.dice.scriptedRolls = [1, 1, 1, 1];
    state.combat!.dice.rollCount = 0;

    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_crusaders"
    });
    const offers = getLegalActions(declared, "p1").filter(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "specialty.rion.1"
    );
    expect(offers.length, "the draw rider alone opened the window and is offered").toBe(1);
    expect(
      (offers[0].action as Extract<GameAction, { type: "PLAY_REACTION" }>).drawOnly,
      "…as a draw-only join (nothing is wounded, so the heal fizzles)"
    ).toBe(true);
    expect(declared.players.p1.hand, "and it is still in hand until played").toEqual(["specialty.rion.1"]);

    // …and playing it really draws, then the parked attack resumes on the Pass.
    const drawn = applyOk(declared, offers[0].action);
    expect(drawn.players.p1.hand, "the printed rider drew a card").toEqual(["spell.haste"]);
    const settled = passOutOfReactionWindows(drawn);
    expect(settled.reactionWindow, "the window closed").toBeNull();
    expect(
      settled.combat!.units.unit_p1_crusaders.damage,
      "the parked attack resolved exactly as before"
    ).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 3. SWEEP INVARIANT — no heal card is missing from the pre-hit window
// ===========================================================================

describe("sweep: EVERY implemented heal card is offered in an open attack window", () => {
  it("holds for all of them (the shared effect-shape scan, not a per-card list)", () => {
    // Derived from the card library, so a NEW heal card (or a new medic clone)
    // joins this invariant automatically — CLAUDE.md 1a#5, one invariant over N
    // one-offs. The board gives a wounded AND paralysed friendly unit plus a
    // spare hand card, so every printed face has a legal target and can pay any
    // printed discard cost.
    const healCardIds = Object.values(cardLibrary)
      .filter((card) => {
        if (card.implementationStatus !== "implemented") {
          return false;
        }
        const faces = card.effect.type === "CHOOSE_ONE" ? card.effect.options.map((option) => option.effect) : [card.effect];
        return faces.some((face) => face.type === "HEAL_DAMAGE" || face.type === "HEAL_DAMAGE_AND_REMOVE_EFFECTS");
      })
      .map((card) => card.id);
    expect(healCardIds.length, "the library really has heal cards to sweep").toBeGreaterThan(20);

    const missing: string[] = [];
    for (const cardId of healCardIds) {
      const state = createInitialGameState("sweep-heal");
      state.players.p1.hand = [cardId as CardId, "ability.luck" as CardId];
      state.players.p2.hand = [];
      const units = state.combat!.units;
      units.unit_p1_crusaders.position = 14;
      units.unit_p1_crusaders.maxHealth = 30;
      units.unit_p1_crusaders.damage = 5;
      placeCombatToken(state, units.unit_p1_crusaders, "paralysis", 0, "Blind");
      units.unit_p2_skeletons.position = 13;
      units.unit_p2_skeletons.activatedThisRound = false;
      units.unit_p2_skeletons.attackedThisActivation = false;
      state.activePlayerId = "p2";
      state.combat!.activeUnitId = "unit_p2_skeletons";

      const declared = applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p2",
        attackerId: "unit_p2_skeletons",
        defenderId: "unit_p1_crusaders"
      });
      if (!healOffer(declared, "p1", cardId)) {
        missing.push(cardId);
      }
    }
    expect(missing, "no heal card is stranded outside the pre-hit reaction window").toEqual([]);
  });

  it("EVERY implemented Instant with a draw rider can be played into an ALREADY-OPEN window", () => {
    // The user's "check for other drawing cards too, they dont need effects":
    // derived from the library, so a new draw-rider Instant joins automatically.
    // The board has NOTHING to heal / buff usefully and p1 holds nothing but the
    // card under test, so an offer can only come from the draw rider itself (or
    // the card's own printed trigger). p2's Offense is what OPENS the window —
    // a draw rider deliberately never opens one (pinned above).
    const drawRiderIds = Object.values(cardLibrary)
      .filter((card) => {
        if (card.implementationStatus !== "implemented") {
          return false;
        }
        if (card.timing !== "instant" && card.timing !== "reaction") {
          return false;
        }
        // A printed MAP-ONLY draw face never joins a combat window by design
        // (an absolute zone bar), so it is excluded from this "joins a window"
        // sweep — e.g. MGQ Ilias IV's pure-draw twin (option 1), whose combat
        // presence is its SEPARATE combatAnytime immunity face (option 0). Its
        // map play is pinned by the map draw sweeps above.
        const faces =
          card.effect.type === "CHOOSE_ONE"
            ? card.effect.options.filter((option) => !option.mapOnly).map((option) => option.effect)
            : [card.effect];
        return faces.some(
          (face) => instantDrawOnlyRider(face, "basic") > 0 || instantDrawOnlyRider(face, "expert") > 0
        );
      })
      .map((card) => card.id);
    expect(drawRiderIds.length, "the library really has draw-rider Instants to sweep").toBeGreaterThan(60);

    const missing: string[] = [];
    for (const cardId of drawRiderIds) {
      let state = createInitialGameState(`sweep-draw-${cardId}`);
      state.players.p1.hand = [cardId as CardId];
      // Kriv's Runes reaction is Bulwark-only (gainRunes is a no-op otherwise),
      // so the sweep holder is a Bulwark seat — every other card is unaffected.
      state.players.p1.factionId = "bulwark";
      state.players.p2.hand = ["ability.offense" as CardId];
      state.players.p1.deck = ["spell.bless" as CardId, "spell.haste" as CardId, "spell.curse" as CardId];
      const units = state.combat!.units;
      for (const unit of Object.values(units)) {
        if (unit.controllerId === "p1") {
          unit.damage = 0;
        }
      }
      units.unit_p1_crusaders.position = 14;
      units.unit_p1_crusaders.maxHealth = 30;
      units.unit_p2_skeletons.position = 13;
      units.unit_p2_skeletons.activatedThisRound = false;
      units.unit_p2_skeletons.attackedThisActivation = false;
      state.activePlayerId = "p2";
      state.combat!.activeUnitId = "unit_p2_skeletons";
      state.combat!.dice.scriptedRolls = [1, 1, 1, 1];
      state.combat!.dice.rollCount = 0;

      state = applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p2",
        attackerId: "unit_p2_skeletons",
        defenderId: "unit_p1_crusaders"
      });
      const pass = getLegalActions(state, "p2").find((legal) => legal.action.type === "PASS_REACTION");
      if (pass) {
        state = applyOk(state, pass.action);
      }
      if (!healOffer(state, "p1", cardId)) {
        missing.push(cardId);
      }
    }
    expect(missing, "no draw-rider Instant is stranded outside an open reaction window").toEqual([]);
  });

  it("a '+Power, then draw' Instant offers the DRAW alone with no spell to pay into — and no twin once there is one", () => {
    // Sorcery's Power half is withheld in an attack window unless the holder also
    // has a pairable spell instant, which used to hide its printed draw too.
    // p1 ATTACKS (Sorcery's Power is the attacker's), p2's Armorer opens the
    // window so the non-opening draw rider has somewhere to join.
    const board = (hand: string[]): GameState => {
      const state = createInitialGameState("sorcery-attacker");
      state.players.p1.hand = [...hand] as CardId[];
      state.players.p2.hand = ["ability.armorer" as CardId];
      state.players.p1.deck = ["spell.bless" as CardId, "spell.haste" as CardId];
      const units = state.combat!.units;
      for (const unit of Object.values(units)) {
        if (unit.controllerId === "p1") {
          unit.damage = 0;
        }
      }
      units.unit_p1_crusaders.position = 14;
      units.unit_p1_crusaders.maxHealth = 30;
      units.unit_p1_crusaders.activatedThisRound = false;
      units.unit_p1_crusaders.attackedThisActivation = false;
      units.unit_p2_skeletons.position = 13;
      units.unit_p2_skeletons.maxHealth = 40;
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = "unit_p1_crusaders";
      state.combat!.dice.scriptedRolls = [1, 1, 1, 1];
      state.combat!.dice.rollCount = 0;
      return applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_crusaders",
        defenderId: "unit_p2_skeletons"
      });
    };
    const sorceryOffers = (state: GameState) =>
      getLegalActions(state, "p1").filter(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "ability.sorcery"
      );

    // No spell in hand: the ONLY Sorcery offer is the draw-only one.
    let alone = board(["ability.sorcery"]);
    const lonely = sorceryOffers(alone);
    expect(lonely.length, "exactly one offer — the draw").toBe(1);
    expect((lonely[0].action as Extract<GameAction, { type: "PLAY_REACTION" }>).drawOnly).toBe(true);
    alone = applyOk(alone, lonely[0].action);
    expect(alone.players.p1.hand, "the printed draw resolved").toEqual(["spell.haste"]);

    // CONTROL: with a pairable spell instant in hand the REAL Power plays are
    // back and the draw-only twin is deduped away — never two look-alike buttons.
    const paired = sorceryOffers(board(["ability.sorcery", "spell.bloodlust"]));
    expect(paired.map((legal) => legal.label).sort(), "real Power plays only").toEqual([
      "Play Sorcery",
      "Play Sorcery expert (expert)"
    ]);
    expect(
      paired.every((legal) => !(legal.action as Extract<GameAction, { type: "PLAY_REACTION" }>).drawOnly),
      "no draw-only trap twin beside the real Power plays"
    ).toBe(true);
  });

  it("no library face hides a draw RIDER behind an up-front discard COST", () => {
    // The order invariant: a face whose printed text puts a draw BEFORE a discard
    // ("… then draw N cards and discard M") must encode the discard as the
    // post-draw `thenDiscard` rider, never as `cost.discardCards` — an up-front
    // cost is affordability-gated and made the face unplayable as the last card
    // in hand (the reported Rion VI bug). Fails if a new such face ships with a
    // cost. Scoped to draw RIDERS (a "then draw" on some other primary effect):
    // a face whose primary effect IS the draw may legitimately print the discard
    // FIRST — Charm of Mana option A, "Discard 2 cards, then draw 3" — and keeps
    // its up-front cost.
    const offenders: string[] = [];
    for (const card of Object.values(cardLibrary)) {
      if (card.implementationStatus !== "implemented") {
        continue;
      }
      const options =
        card.effect.type === "CHOOSE_ONE"
          ? card.effect.options.map((option) => ({ effect: option.effect, cost: option.cost }))
          : [{ effect: card.effect, cost: undefined }];
      for (const option of options) {
        if (option.effect.type === "DRAW_CARDS") {
          continue;
        }
        const rides =
          instantDrawOnlyRider(option.effect, "basic") > 0 || instantDrawOnlyRider(option.effect, "expert") > 0;
        if (rides && (option.cost?.discardCards ?? 0) > 0) {
          offenders.push(card.id);
        }
      }
    }
    expect(offenders, "every draw-RIDER face pays its discard AFTER drawing").toEqual([]);
  });

  it("Rion VI and its clones carry the post-draw discard rider, not a cost", () => {
    for (const cardId of ["specialty.rion.6", "specialty.aoko.6", "specialty.shiyan.6", "specialty.molian.6"]) {
      const effect = cardLibrary[cardId as CardId].effect;
      expect(effect.type, `${cardId} is a CHOOSE_ONE`).toBe("CHOOSE_ONE");
      const options = effect.type === "CHOOSE_ONE" ? effect.options : [];
      expect(options.length).toBe(2);
      for (const option of options) {
        expect(drawRiderThenDiscard(option.effect), `${cardId}: printed "discard 1" after the draw`).toBe(1);
        expect(option.cost?.discardCards, `${cardId}: no up-front discard cost`).toBeUndefined();
      }
    }
  });
});

// ===========================================================================
// 3. The gate is generic — exactly the medic faces qualify, clones included
// ===========================================================================

describe("healDrawOnlyRider — the map draw-only gate", () => {
  it("opens exactly the medic specialty cards (Rion/Astra + every rethemed clone)", () => {
    const qualifying: string[] = [];
    for (const card of Object.values(cardLibrary)) {
      if (card.implementationStatus !== "implemented") {
        continue;
      }
      const faces = card.effect.type === "CHOOSE_ONE" ? card.effect.options.map((option) => option.effect) : [card.effect];
      if (faces.some((face) => healDrawOnlyRider(face) > 0)) {
        qualifying.push(card.id);
      }
    }
    expect(qualifying.sort()).toEqual([
      "specialty.aoko.1",
      "specialty.aoko.4",
      "specialty.aoko.6",
      "specialty.astra.1",
      // Only genuine Rion/Astra heal clones qualify. Ilias I and VI are Rion
      // clones and stay; Ilias IV is NOT a heal-draw card (a combatAnytime
      // draw+Specialty-immunity + a mapOnly pure draw), and Kudryavka's
      // specialties are Deemer's Meteor Shower (AREA damage) clones — so
      // healDrawOnlyRider (HEAL_DAMAGE faces only) returns 0 for both.
      "specialty.ilias.1",
      "specialty.ilias.6",
      "specialty.molian.1",
      "specialty.molian.4",
      "specialty.molian.6",
      "specialty.rion.1",
      "specialty.rion.4",
      "specialty.rion.6",
      "specialty.sakura_matou.1",
      "specialty.sakura_matou.4",
      "specialty.sakura_matou.6",
      // Shiyan (Heavenly Demon) is a Rion retheme too — same map draw-only gate.
      "specialty.shiyan.1",
      "specialty.shiyan.4",
      "specialty.shiyan.6"
    ]);
  });

  it("a rethemed CLONE (Shiyan, Heavenly Demon) inherits BOTH fixes", () => {
    // Map draw-only.
    let state = mapHand(["specialty.shiyan.1"]);
    state.players.p1.deck = ["spell.haste" as CardId];
    const plays = mapPlays(state, "specialty.shiyan.1");
    expect(plays.length, "the clone is map-playable for its draw").toBe(1);
    state = applyOk(state, plays[0]);
    expect(state.players.p1.hand).toEqual(["spell.haste"]);

    // Reaction window before the counter-attack.
    const declared = applyOk(lethalRetaliationState(["specialty.shiyan.1"]), {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_crusaders",
      defenderId: "unit_p2_skeletons"
    });
    const offer = healOffer(declared, "p1", "specialty.shiyan.1");
    expect(offer, "the clone is offered in the retaliation window").toBeTruthy();
    const healed = applyOk(declared, offer!.action);
    expect(packIntact(healed, "unit_p1_crusaders" as UnitId), "and it saves the Pack").toBe(true);
  });
});

// ===========================================================================
// 4. AI: the new map offer is optional and deliberately LOW-scored
// ===========================================================================

describe("computer policy — the map draw-only medic play", () => {
  it("scores it far below a real combat heal, so an AI seat never dumps the card", () => {
    const play: GameAction = {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "specialty.rion.1" as CardId,
      mode: "basic",
      target: { type: "none" }
    };
    // MAP (no combat): pure card cycling.
    const onMap = scoreCardAction(
      {
        playerId: "p1",
        state: {
          seed: "medic-ai",
          round: 1,
          eventCounter: 0,
          players: { p1: { id: "p1", hand: ["specialty.rion.1"], resources: { gold: 5 }, army: [] } }
        } as unknown as PlayerVisibleState,
        legalActions: []
      },
      play
    );
    expect(onMap, "the map draw-only play is scored").toBeTruthy();
    expect(onMap!.score, "well below the map economy/search families (~590-610)").toBeLessThan(400);

    // CONTROL: the SAME card aimed at a wounded unit in combat is a real heal and
    // keeps its high combat-buff score.
    const inCombat = scoreCardAction(
      {
        playerId: "p1",
        state: {
          seed: "medic-ai",
          round: 1,
          eventCounter: 0,
          combat: {
            id: "c1",
            units: {
              U: {
                id: "U",
                controllerId: "p1",
                name: "U",
                cardName: "U",
                variant: "pack",
                grade: "silver",
                type: "ground",
                attack: 3,
                defense: 2,
                maxHealth: 5,
                damage: 3,
                initiative: 5,
                position: 0,
                activatedThisRound: false,
                movedThisActivation: false,
                retaliatedThisRound: false,
                defenseToken: false,
                abilities: []
              }
            }
          },
          players: { p1: { id: "p1", hand: ["specialty.rion.1"], resources: { gold: 5 }, army: [] } }
        } as unknown as PlayerVisibleState,
        legalActions: []
      },
      { ...play, target: { type: "unit", unitId: "U" as UnitId } }
    );
    expect(inCombat!.score, "a real in-combat heal still outranks the map cycle").toBeGreaterThan(onMap!.score);
  });

  it("scores the draw-only REACTION at the same flat rider score, below a real heal", () => {
    // The AI must never dump the specialty into an open window for the rider when
    // it could heal instead. Both the map/combat PLAY_CARD and the in-window
    // PLAY_REACTION run through the one `card.draw-rider-only` branch.
    const context = {
      playerId: "p1" as const,
      state: {
        seed: "medic-ai",
        round: 1,
        eventCounter: 0,
        combat: { id: "c1", units: {} },
        players: { p1: { id: "p1", hand: ["specialty.rion.1"], resources: { gold: 5 }, army: [] } }
      } as unknown as PlayerVisibleState,
      legalActions: []
    };
    const reaction = scoreCardAction(context, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "specialty.rion.1" as CardId,
      mode: "basic",
      drawOnly: true
    });
    expect(reaction, "the draw-only reaction is scored").toBeTruthy();
    expect(reaction!.policy).toBe("card.draw-rider-only");
    expect(reaction!.score, "the deliberate low flat rider score").toBe(300);
  });
});

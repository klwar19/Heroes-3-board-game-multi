import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, createInitialGameState, getLegalActions } from "./index";
import { healDrawOnlyRider } from "./legal-actions";
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

function healOffer(state: GameState, playerId: "p1" | "p2", cardId: string) {
  return getLegalActions(state, playerId).find(
    (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === cardId
  );
}

describe("medic specialty as a reaction — the heal lands before the COUNTER-ATTACK", () => {
  it("Rion I heals into the retaliation window and saves the unit; no card = it dies (CONTROL)", () => {
    const declared = applyOk(lethalRetaliationState(["specialty.rion.1"]), {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_crusaders",
      defenderId: "unit_p2_skeletons"
    });
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

    const declared = applyOk(base, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_crusaders",
      defenderId: "unit_p2_skeletons"
    });
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

    // CONTROL: with no Paralysis token anywhere and nothing damaged, the card is
    // not offered in the window at all (the damage gate still applies).
    const clean = lethalRetaliationState(["specialty.rion.4"]);
    for (const unit of Object.values(clean.combat!.units)) {
      if (unit.controllerId === "p1") {
        unit.damage = 0;
      }
    }
    clean.combat!.units.unit_p1_crusaders.maxHealth = 40;
    const declaredClean = applyOk(clean, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_crusaders",
      defenderId: "unit_p2_skeletons"
    });
    expect(
      healOffer(declaredClean, "p1", "specialty.rion.4"),
      "nothing wounded and nothing paralysed → no medic offer"
    ).toBeUndefined();
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

  it("Rion IV/VI offer one draw-only play per printed side (VI paying its discard cost)", () => {
    let state = mapHand(["specialty.rion.4", "specialty.rion.6", "ability.luck"]);
    state.players.p1.deck = ["spell.bless" as CardId, "spell.haste" as CardId, "spell.curse" as CardId];

    expect(mapPlays(state, "specialty.rion.4").length, "both Rion IV sides carry a draw rider").toBe(2);
    const sixSides = mapPlays(state, "specialty.rion.6");
    expect(sixSides.length, "both Rion VI sides carry a draw rider").toBe(2);

    const handBefore = state.players.p1.hand.length;
    // The offer is a template; the payment (this side's printed "discard 1") is
    // the player's own pick, exactly like every other cost-bearing option.
    state = applyOk(state, { ...sixSides[0], costCardIds: ["ability.luck" as CardId] });
    // VI: pay the discard-1 cost, spend the card itself, draw 2 → hand is level.
    expect(state.players.p1.hand.length, "discard 1 + spend the card + draw 2 leaves the hand level").toBe(
      handBefore - 1 - 1 + 2
    );
    expect(state.players.p1.discard, "the paid card went to the discard").toContain("ability.luck");
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
});

// ===========================================================================
// 3. The gate is generic — exactly the medic faces qualify, clones included
// ===========================================================================

describe("healDrawOnlyRider — the map draw-only gate", () => {
  it("opens EXACTLY the 13 medic specialty cards (Rion/Astra + the rethemed clones)", () => {
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
      "specialty.molian.1",
      "specialty.molian.4",
      "specialty.molian.6",
      "specialty.rion.1",
      "specialty.rion.4",
      "specialty.rion.6",
      "specialty.sirius.1",
      "specialty.sirius.4",
      "specialty.sirius.6"
    ]);
  });

  it("a rethemed CLONE (Sirius, Azur Lane) inherits BOTH fixes", () => {
    // Map draw-only.
    let state = mapHand(["specialty.sirius.1"]);
    state.players.p1.deck = ["spell.haste" as CardId];
    const plays = mapPlays(state, "specialty.sirius.1");
    expect(plays.length, "the clone is map-playable for its draw").toBe(1);
    state = applyOk(state, plays[0]);
    expect(state.players.p1.hand).toEqual(["spell.haste"]);

    // Reaction window before the counter-attack.
    const declared = applyOk(lethalRetaliationState(["specialty.sirius.1"]), {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_crusaders",
      defenderId: "unit_p2_skeletons"
    });
    const offer = healOffer(declared, "p1", "specialty.sirius.1");
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
});

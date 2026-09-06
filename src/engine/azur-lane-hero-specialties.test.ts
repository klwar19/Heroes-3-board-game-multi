import { describe, expect, it } from "vitest";

import { cardLibrary } from "@/data/cards/library";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  getLegalActions
} from "./index";
import type {
  CardId,
  CombatUnitState,
  GameAction,
  GameEvent,
  GameState,
  PlayerId,
  UnitId
} from "./state";

/**
 * Azur Lane Naval Base — the FOUR bespoke hero specialty sets (2026-09-05), each
 * pinned by an OBSERVABLE outcome through the REAL `applyAction` pipeline with a
 * CONTROL (CLAUDE.md §1a). Nothing here reads an intermediate field where a
 * damage/gold delta could be asserted instead.
 *
 *  1. Bismarck "Concentrated Fire" — an instant in your OWN unit's attack
 *     window: +1 Attack per OTHER living friendly unit adjacent to the TARGET,
 *     capped +1 / +2 / +3. VI also suppresses that target's Retaliation Attack.
 *  2. Nagato "Big Seven Bombardment" — a combat play during your own NON-ranged
 *     unit's activation: this activation its attack is a RANGED attack up to 2
 *     spaces away (I) or anywhere (IV / VI); VI adds +1 Attack.
 *  3. Akashi "Repair Dock" — a map play banking a 2 / 3 / 4 gold reinforcement
 *     discount through the shared Hill-Fort / Legion machinery; VI draws 1.
 *  4. Sirius "Royal Maid's Cover" — an instant inside an ENEMY declared attack:
 *     a chosen living ally adjacent to the target takes the blow with +1 (I) /
 *     +2 (IV, VI) Defense; VI answers with 1 effect damage to the attacker.
 *
 * MUTATION CHECKS (each applied to the engine, run, reverted — every one made at
 * least one case below fail; recorded per CLAUDE.md's verification bar):
 *  M1 `concentratedFireBonus`: drop the `maxAmount` clamp (`return raw`)
 *     → "caps the bonus at the printed ceiling" (I paid +3, expected +1).
 *  M2 `concentratedFireBonus`: count the attacker too (drop
 *     `unit.id !== attacker.id`) → "0/1/2/3 adjacent allies" (5 → 6 with none).
 *  M3 reducer ADD_COMBAT_STAT fold: drop the `+ concentratedFire` term
 *     → every Bismarck damage case (no bonus at all).
 *  M4 `bigSevenBombardmentSpecialty(6)`: drop `attackBonus`
 *     → "VI adds +1 Attack to the bombardment" (7 not 8).
 *  M5 `canUnitAttack`: drop the bombardment branch → "a melee unit shoots two
 *     spaces" (the attack is refused after the card is played).
 *  M6 `concludeAttackerActivation`: drop `delete attacker.bombardment`
 *     → "the flip dies with the activation".
 *  M7 `unitAttacksAsRanged`: return `unit.type === "ranged"` only
 *     → "takes the ADJACENT-target ranged penalty" (7 not 5). NOTE: the
 *     no-Retaliation case does NOT discriminate this one — a non-adjacent
 *     melee blow already provokes none — which is why the penalty case exists.
 *  M8 `bombardmentReaches`: treat `range === undefined` as 2
 *     → "IV reaches anywhere on the board".
 *  M9 `playCard`'s BANK_REINFORCEMENT_DISCOUNT arm: drop `flatGoldDiscount`
 *     → "the dock really cuts the reinforce price" (paid full).
 *  M10 same arm: drop the `drawCards` call → "VI also draws a card".
 *  M11 `applyReactionPlayCore` intercept arm: drop `redirectDeclaredAttack`
 *     → "the maid takes the blow instead of her mistress".
 *  M12 same arm: drop `stackItem.modifiers.defenseBonus += effect.defenseBonus`
 *     → "I shields 1, IV shields 2".
 *  M13 `finishResolvedAttack`: drop the `interceptCounterDamage` block
 *     → "VI answers with 1 damage to the attacker".
 *  M14 `getInterceptTargets`: drop the `declaration?.isRetaliation` guard
 *     → "CONTROL: never offered against a Retaliation Attack".
 *
 * Board: 4 columns × 5 rows (positions 0–19), ORTHOGONAL adjacency.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 60;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, {
      type: "PASS_REACTION",
      playerId: current.reactionWindow.priorityPlayerId
    });
  }
  return current;
}

/** Drain reaction windows and keep the ORIGINAL roll in any reroll window. */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 120;
  while (
    safety > 0 &&
    (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")
  ) {
    safety -= 1;
    if (current.reactionWindow) {
      current = passAllReactions(current);
      continue;
    }
    const choice = current.pendingChoice;
    if (choice?.type === "ATTACK_DIE_REROLL") {
      current = applyOk(current, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: choice.playerId,
        choiceId: choice.id,
        candidateIndex: choice.candidates.length - 1
      });
    }
  }
  return current;
}

type UnitOverrides = {
  position?: number;
  controllerId?: PlayerId;
  abilities?: string[];
  attack?: number;
  defense?: number;
  maxHealth?: number;
  damage?: number;
  type?: CombatUnitState["type"];
};

/** Combat sandbox, empty hands, scripted "0" dice → damage = attack − defense. */
function freshCombat(seed: string): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.combat!.dice.scriptedRolls = Array.from({ length: 60 }, () => 0);
  state.combat!.dice.rollCount = 0;
  return state;
}

function place(state: GameState, id: string, overrides: UnitOverrides): CombatUnitState {
  const unit = state.combat!.units[id];
  Object.assign(unit, overrides);
  return unit;
}

function unitAt(state: GameState, id: string): CombatUnitState {
  return state.combat!.units[id];
}

/** Declare an attack and STOP inside the opened reaction window. */
function declare(state: GameState, attackerId: string, defenderId: string): GameState {
  const attacker = state.combat!.units[attackerId];
  state.activePlayerId = attacker.controllerId;
  state.combat!.activeUnitId = attackerId;
  return applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: attacker.controllerId,
    attackerId,
    defenderId
  });
}

function reactionOffer(state: GameState, playerId: PlayerId, cardId: string, targetUnitId?: string) {
  return getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "PLAY_REACTION" &&
      legal.action.cardId === cardId &&
      (targetUnitId === undefined ||
        (legal.action.target?.type === "unit" && legal.action.target.unitId === targetUnitId))
  );
}

function damageEventsFrom(state: GameState, cardId: string): GameEvent[] {
  return state.eventLog.filter(
    (event) =>
      event.type === "DAMAGE_ASSIGNED" &&
      event.source.type === "card" &&
      event.source.cardId === cardId
  );
}

// ===========================================================================
// 1. Bismarck — "Concentrated Fire"
// ===========================================================================

describe("Bismarck — Concentrated Fire (+1 Attack per ally adjacent to the TARGET)", () => {
  /**
   * Attacker @9, target @10 (adjacent, so the attacker IS adjacent to its own
   * target — the "attacker never counts itself" control). @10's other
   * neighbours are 6, 11 and 14: filling them with p1 units is 1, 2 and 3
   * qualifying allies. Target Defense 0, Health 99 and scripted "0" dice, so
   * the damage read is exactly the folded Attack value.
   */
  function layout(state: GameState, allyCount: 0 | 1 | 2 | 3): void {
    place(state, "unit_p1_marksmen", {
      position: 9,
      controllerId: "p1",
      abilities: [],
      attack: 5,
      defense: 0,
      maxHealth: 99,
      damage: 0,
      type: "ground"
    });
    place(state, "unit_p2_skeletons", {
      position: 10,
      controllerId: "p2",
      abilities: [],
      attack: 1,
      defense: 0,
      maxHealth: 99,
      damage: 0,
      type: "ground"
    });
    // The three fillers sit far away unless the case wants them flanking @10.
    const flankSeats = [6, 11, 14];
    const parked = [0, 3, 19];
    const fillers = ["unit_p1_griffins", "unit_p1_crusaders", "unit_p2_vampires"];
    fillers.forEach((id, index) => {
      place(state, id, {
        position: index < allyCount ? flankSeats[index] : parked[index],
        controllerId: "p1",
        abilities: [],
        attack: 1,
        defense: 0,
        maxHealth: 99,
        damage: 0,
        type: "ground"
      });
    });
    place(state, "unit_p2_dread_knights", {
      position: 16,
      controllerId: "p2",
      abilities: [],
      maxHealth: 99,
      damage: 0
    });
  }

  /** Attack with the Bismarck card in hand; play it if offered. Returns damage dealt. */
  function attackWithCard(seed: string, level: 1 | 4 | 6, allies: 0 | 1 | 2 | 3) {
    const state = freshCombat(seed);
    layout(state, allies);
    state.players.p1.hand = [`specialty.bismarck.${level}` as CardId];
    const declared = declare(state, "unit_p1_marksmen", "unit_p2_skeletons");
    const offer = reactionOffer(declared, "p1", `specialty.bismarck.${level}`);
    const played = offer ? applyOk(declared, offer.action) : declared;
    const settled = settle(played);
    return {
      offered: Boolean(offer),
      damage: unitAt(settled, "unit_p2_skeletons").damage,
      attackerDamage: unitAt(settled, "unit_p1_marksmen").damage,
      state: settled,
    };
  }

  it("pays +1 Attack for each of 0/1/2/3 adjacent allies (VI, cap 3)", () => {
    // Base attack 5, defense 0 → the damage IS the folded attack.
    expect(
      attackWithCard("cf-vi-0", 6, 0).damage,
      "no ally flanking → nothing to pay",
    ).toBe(5);
    expect(attackWithCard("cf-vi-1", 6, 1).damage).toBe(6);
    expect(attackWithCard("cf-vi-2", 6, 2).damage).toBe(7);
    expect(attackWithCard("cf-vi-3", 6, 3).damage).toBe(8);
  });

  it("CONTROL: the attacker never counts itself, so with no OTHER ally there is no offer at all", () => {
    // The attacker at @9 IS adjacent to the target at @10. If it counted, the
    // bonus would be +1 and the card would be offered.
    const none = attackWithCard("cf-self-control", 6, 0);
    expect(none.offered, "a +0 play is a trap and is never offered").toBe(
      false,
    );
    expect(none.damage, "and the blow is the plain printed attack").toBe(5);
  });

  it("caps the bonus at the printed ceiling: I +1, IV +2, VI +3 with the SAME three allies", () => {
    expect(attackWithCard("cf-cap-i", 1, 3).damage).toBe(6);
    expect(attackWithCard("cf-cap-iv", 4, 3).damage).toBe(7);
    expect(attackWithCard("cf-cap-vi", 6, 3).damage).toBe(8);
  });

  it("VI suppresses the target's Retaliation Attack; IV does not (same board)", () => {
    // The skeletons hit back for 3 (attack 3 − attacker defense 0) unless VI's
    // ignoresRetaliation rider is on the blow.
    function retaliationDamage(seed: string, level: 4 | 6): number {
      const state = freshCombat(seed);
      layout(state, 3);
      place(state, "unit_p2_skeletons", { attack: 3 });
      place(state, "unit_p1_marksmen", { defense: 0 });
      state.players.p1.hand = [`specialty.bismarck.${level}` as CardId];
      const declared = declare(state, "unit_p1_marksmen", "unit_p2_skeletons");
      const offer = reactionOffer(
        declared,
        "p1",
        `specialty.bismarck.${level}`,
      );
      expect(offer, `level ${level} must be offered here`).toBeTruthy();
      const settled = settle(applyOk(declared, offer!.action));
      return unitAt(settled, "unit_p1_marksmen").damage;
    }
    expect(
      retaliationDamage("cf-retal-iv", 4),
      "IV: the skeletons hit back",
    ).toBe(3);
    expect(
      retaliationDamage("cf-retal-vi", 6),
      "VI: no Retaliation Attack",
    ).toBe(0);
  });
});

// ===========================================================================
// 2. Nagato — "Big Seven Bombardment"
// ===========================================================================

describe("Nagato — Big Seven Bombardment (a ground unit's attack becomes RANGED)", () => {
  /**
   * Attacker @4 (row 1 — never a back row, so no long-range penalty can muddy
   * the damage). Near target @12 is two spaces away, far target @16 is three.
   */
  function layout(state: GameState): void {
    place(state, "unit_p1_crusaders", {
      position: 4,
      controllerId: "p1",
      abilities: [],
      attack: 6,
      defense: 0,
      maxHealth: 99,
      damage: 0,
      type: "ground",
    });
    place(state, "unit_p2_skeletons", {
      position: 12,
      controllerId: "p2",
      abilities: [],
      attack: 4,
      defense: 0,
      maxHealth: 99,
      damage: 0,
      type: "ground",
    });
    place(state, "unit_p2_vampires", {
      position: 16,
      controllerId: "p2",
      abilities: [],
      attack: 4,
      defense: 0,
      maxHealth: 99,
      damage: 0,
      type: "ground",
    });
    for (const id of ["unit_p1_marksmen", "unit_p1_griffins"]) {
      place(state, id, {
        position: id === "unit_p1_marksmen" ? 0 : 3,
        controllerId: "p1",
        abilities: [],
      });
    }
    place(state, "unit_p2_dread_knights", {
      position: 19,
      controllerId: "p2",
      abilities: [],
    });
  }

  function armed(seed: string, level: 1 | 4 | 6): GameState {
    const state = freshCombat(seed);
    layout(state);
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_crusaders";
    state.players.p1.hand = [`specialty.nagato.${level}` as CardId];
    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === `specialty.nagato.${level}`,
    );
    expect(
      play,
      `Big Seven Bombardment ${level} must be playable on this activation`,
    ).toBeTruthy();
    return settle(applyOk(state, play!.action));
  }

  function canAttack(state: GameState, defenderId: string): boolean {
    return getLegalActions(state, "p1").some(
      (legal) =>
        legal.action.type === "ATTACK_UNIT" &&
        legal.action.attackerId === "unit_p1_crusaders" &&
        legal.action.defenderId === defenderId,
    );
  }

  it("CONTROL: without the card a melee unit cannot even declare at two spaces", () => {
    const state = freshCombat("bomb-control");
    layout(state);
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_crusaders";
    expect(
      canAttack(state, "unit_p2_skeletons"),
      "no offer at distance 2",
    ).toBe(false);
    const forged = applyAction(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_crusaders",
      defenderId: "unit_p2_skeletons",
    });
    expect(forged.errors.length, "and the handler refuses it").toBeGreaterThan(
      0,
    );
  });

  it("a melee unit shoots two spaces, and the blow provokes no Retaliation Attack at range", () => {
    const state = armed("bomb-i-hit", 1);
    expect(
      canAttack(state, "unit_p2_skeletons"),
      "distance 2 is now a legal declaration",
    ).toBe(true);
    const settled = settle(
      applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_crusaders",
        defenderId: "unit_p2_skeletons",
      }),
    );
    expect(
      unitAt(settled, "unit_p2_skeletons").damage,
      "attack 6 − defense 0",
    ).toBe(6);
    expect(
      unitAt(settled, "unit_p1_crusaders").damage,
      "a blow struck at distance provokes no Retaliation Attack (the target cannot reach back)",
    ).toBe(0);
  });

  it("I stops at 2 spaces; IV reaches anywhere on the board", () => {
    expect(
      canAttack(armed("bomb-i-far", 1), "unit_p2_vampires"),
      "I refuses distance 3",
    ).toBe(false);
    expect(
      canAttack(armed("bomb-iv-far", 4), "unit_p2_vampires"),
      "IV reaches it",
    ).toBe(true);
  });

  it("VI adds +1 Attack to the bombardment (IV is the control on the same board)", () => {
    function shoot(seed: string, level: 4 | 6): number {
      const state = armed(seed, level);
      const settled = settle(
        applyOk(state, {
          type: "ATTACK_UNIT",
          playerId: "p1",
          attackerId: "unit_p1_crusaders",
          defenderId: "unit_p2_skeletons",
        }),
      );
      return unitAt(settled, "unit_p2_skeletons").damage;
    }
    expect(shoot("bomb-iv-dmg", 4), "printed attack 6").toBe(6);
    expect(shoot("bomb-vi-dmg", 6), "VI's rider").toBe(7);
  });

  it("the flip dies with the activation — a fresh activation is never armed", () => {
    const state = armed("bomb-expire", 4);
    expect(
      unitAt(state, "unit_p1_crusaders").bombardment,
      "armed while the activation runs",
    ).toBeTruthy();
    const settled = settle(
      applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_crusaders",
        defenderId: "unit_p2_skeletons",
      }),
    );
    expect(
      unitAt(settled, "unit_p1_crusaders").bombardment,
      "the arm is dropped when the attacker's activation concludes",
    ).toBeUndefined();
    // …and the observable consequence: the distant target is out of reach again.
    expect(
      getLegalActions(settled, "p1").some(
        (legal) =>
          legal.action.type === "ATTACK_UNIT" &&
          legal.action.attackerId === "unit_p1_crusaders" &&
          legal.action.defenderId === "unit_p2_vampires",
      ),
    ).toBe(false);
  });

  it("a bombarding unit takes the ADJACENT-target ranged penalty, exactly like a printed shooter", () => {
    // The dice are scripted +1 then -1: a normal single-die roll reads +1, while
    // the ranged "adjacent target" penalty (roll two, resolve the LOWER) reads
    // -1. So the printed attack 6 lands as 7 unarmed and 5 while bombarding —
    // the observable proof that the flip really makes the blow a RANGED attack
    // and not just a longer melee reach.
    function adjacentBlow(seed: string, arm: boolean): number {
      const state = freshCombat(seed);
      layout(state);
      state.combat!.dice.scriptedRolls = Array.from(
        { length: 60 },
        (_, index) => (index % 2 === 0 ? 1 : -1),
      );
      state.combat!.dice.rollCount = 0;
      // Move the near target next to the attacker (@4 → @5 is adjacent).
      place(state, "unit_p2_skeletons", { position: 5, attack: 0, defense: 0 });
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = "unit_p1_crusaders";
      let current = state;
      if (arm) {
        state.players.p1.hand = ["specialty.nagato.4" as CardId];
        const play = getLegalActions(state, "p1").find(
          (legal) =>
            legal.action.type === "PLAY_CARD" &&
            legal.action.cardId === "specialty.nagato.4",
        );
        expect(play, "armable on this activation").toBeTruthy();
        current = settle(applyOk(state, play!.action));
      }
      const settled = settle(
        applyOk(current, {
          type: "ATTACK_UNIT",
          playerId: "p1",
          attackerId: "unit_p1_crusaders",
          defenderId: "unit_p2_skeletons",
        }),
      );
      return unitAt(settled, "unit_p2_skeletons").damage;
    }
    expect(
      adjacentBlow("bomb-melee-control", false),
      "CONTROL: a plain melee blow rolls one die",
    ).toBe(7);
    expect(
      adjacentBlow("bomb-melee-penalty", true),
      "bombarding into an adjacent enemy rolls the penalty",
    ).toBe(5);
  });

  it("CONTROL: a printed RANGED unit is never offered the bombardment (it would be a pure trap)", () => {
    const state = freshCombat("bomb-ranged-control");
    layout(state);
    place(state, "unit_p1_marksmen", {
      position: 4,
      controllerId: "p1",
      type: "ranged",
      abilities: [],
    });
    place(state, "unit_p1_crusaders", { position: 0 });
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    state.players.p1.hand = ["specialty.nagato.4" as CardId];
    expect(
      getLegalActions(state, "p1").some(
        (legal) =>
          legal.action.type === "PLAY_CARD" &&
          legal.action.cardId === "specialty.nagato.4",
      ),
    ).toBe(false);
  });
});

// ===========================================================================
// 3. Akashi — "Repair Dock"
// ===========================================================================

describe("Akashi — Repair Dock (a banked reinforcement discount)", () => {
  /** A fresh adventure with p1's hand replaced and a bronze Few to upgrade. */
  function mapWithDock(seed: string, cards: string[], gold = 30): GameState {
    let state = createAdventureGameState({
      seed,
      difficulty: "normal",
      rollFirstPlayer: false,
    });
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyOk(state, {
        type: "REFRESH_HAND",
        playerId: "p1",
        discardCardIds: [],
      });
    }
    state.players.p1.hand = [...cards] as CardId[];
    state.players.p1.army = [
      { id: "army_gryph", unitDefId: "castle.griffins", side: "few" },
    ];
    state.players.p1.resources.gold = gold;
    return state;
  }

  function dockBank(state: GameState) {
    return (state.players.p1.recruitDiscounts ?? []).find((bank) =>
      bank.cardId.startsWith("specialty.akashi."),
    );
  }

  function playDock(state: GameState, level: 1 | 4 | 6): GameState {
    const play = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "PLAY_CARD" &&
        legal.action.cardId === `specialty.akashi.${level}`,
    );
    expect(play, `Repair Dock ${level} must be a legal map play`).toBeTruthy();
    let after = applyOk(state, play!.action);
    if (level !== 6) {
      const pick = getLegalActions(after, "p1").find(
        (legal) =>
          legal.action.type === "RESOLVE_VISIT_STEP" &&
          /reinforce.*Griffins/i.test(legal.label),
      );
      expect(pick, "choose the Griffins reinforcement discount").toBeTruthy();
      after = applyOk(after, pick!.action);
    }
    return after;
  }

  function redeem(state: GameState) {
    return getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "POPULATION_ACTION" &&
        legal.action.purchases.some(
          (purchase) =>
            purchase.kind === "reinforce" &&
            purchase.armyUnitId === "army_gryph",
        ),
    );
  }

  /** The gold a plain (no-bank) reinforcement of the same Few costs. */
  function plainReinforceCost(state: GameState): number {
    const before = state.players.p1.resources.gold;
    const action = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "POPULATION_ACTION" &&
        legal.action.purchases.some(
          (purchase) =>
            purchase.kind === "reinforce" &&
            purchase.armyUnitId === "army_gryph",
        ),
    );
    expect(
      action,
      "the plain reinforce must exist as the price control",
    ).toBeTruthy();
    return before - applyOk(state, action!.action).players.p1.resources.gold;
  }

  it.each([1, 4])(
    "Akashi %s can draw instead of banking a discount",
    (level) => {
      const state = mapWithDock(`dock-or-draw-${level}`, [
        `specialty.akashi.${level}`,
      ]);
      state.players.p1.deck = ["spell.haste"];
      const offer = getLegalActions(state, "p1").find(
        (x) =>
          x.action.type === "PLAY_CARD" &&
          x.action.cardId === `specialty.akashi.${level}` &&
          x.action.optionIndex === 1,
      );
      expect(offer).toBeTruthy();
      const after = applyOk(state, offer!.action);
      expect(after.players.p1.hand).toEqual(["spell.haste"]);
      expect(dockBank(after)).toBeUndefined();
    },
  );

  it.each([
    [1, 3],
    [4, 4],
  ])(
    "Akashi %s reduces an actual recruit purchase by %s gold",
    (level, discount) => {
      let state = mapWithDock(`dock-recruit-${level}`, [
        `specialty.akashi.${level}`,
      ]);
      const control = structuredClone(state);
      const card = getLegalActions(state, "p1").find(
        (x) =>
          x.action.type === "PLAY_CARD" &&
          x.action.cardId === `specialty.akashi.${level}` &&
          x.action.optionIndex === 0,
      );
      expect(card).toBeTruthy();
      state = applyOk(state, card!.action);
      const pick = getLegalActions(state, "p1").find(
        (x) =>
          x.action.type === "RESOLVE_VISIT_STEP" && /^Recruit /i.test(x.label),
      );
      expect(pick).toBeTruthy();
      state = applyOk(state, pick!.action);
      const bank = dockBank(state);
      expect(bank?.target.kind).toBe("recruit");
      if (bank?.target.kind !== "recruit")
        throw new Error("missing recruit voucher");
      const unitDefId = bank.target.unitDefId;
      const purchase = (s: GameState) =>
        getLegalActions(s, "p1").find(
          (x) =>
            x.action.type === "POPULATION_ACTION" &&
            x.action.purchases.length === 1 &&
            x.action.purchases.some(
              (p) => p.kind === "recruit" && p.unitDefId === unitDefId,
            ),
        );
      const plain = purchase(control),
        reduced = purchase(state);
      expect(plain).toBeTruthy();
      expect(reduced).toBeTruthy();
      const fullCost =
        control.players.p1.resources.gold -
        applyOk(control, plain!.action).players.p1.resources.gold;
      const after = applyOk(state, reduced!.action);
      expect(
        state.players.p1.resources.gold - after.players.p1.resources.gold,
      ).toBe(Math.max(0, fullCost - discount));
      expect(dockBank(after)).toBeUndefined();
    },
  );

  it("banks a 3 / 4 gold discount and the redeem really charges that much less", () => {
    const control = mapWithDock("dock-price-control", []);
    const fullPrice = plainReinforceCost(control);
    expect(
      fullPrice,
      "the silver Pack costs more than the biggest discount",
    ).toBeGreaterThan(4);

    for (const [level, discount] of [
      [1, 3],
      [4, 4],
    ] as const) {
      const state = playDock(
        mapWithDock(`dock-price-${level}`, [`specialty.akashi.${level}`]),
        level,
      );
      const bank = dockBank(state);
      expect(bank, `Repair Dock ${level} banks a discount`).toBeTruthy();
      const offer = redeem(state);
      expect(offer, `Repair Dock ${level} is redeemable`).toBeTruthy();
      const before = state.players.p1.resources.gold;
      const after = applyOk(state, offer!.action);
      expect(
        before - after.players.p1.resources.gold,
        `Repair Dock ${level} paid`,
      ).toBe(fullPrice - discount);
      expect(
        after.players.p1.army.find((unit) => unit.id === "army_gryph")?.side,
      ).toBe("pack");
      expect(
        dockBank(after),
        "the entitlement is spent by the redeem",
      ).toBeUndefined();
    }
  });

  it("VI also draws a card (I is the control on the same deck)", () => {
    for (const [level, expected] of [
      [1, 0],
      [6, 1],
    ] as const) {
      const state = mapWithDock(`dock-draw-${level}`, [
        `specialty.akashi.${level}`,
      ]);
      state.players.p1.deck = [
        "spell.haste" as CardId,
        "spell.bless" as CardId,
      ];
      const after = playDock(state, level);
      expect(after.players.p1.hand.length, `Repair Dock ${level} hand`).toBe(
        expected,
      );
    }
  });

  it("an unredeemed dock dies on the next hero step (the standard bank expiry)", () => {
    const state = playDock(
      mapWithDock("dock-expiry", ["specialty.akashi.4"]),
      4,
    );
    expect(dockBank(state), "banked").toBeTruthy();
    const move = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "MOVE_HERO",
    );
    expect(move, "the hero has a legal step").toBeTruthy();
    const afterMove = applyOk(state, move!.action);
    expect(
      dockBank(afterMove),
      "any hero step wipes it — as the card says",
    ).toBeUndefined();
  });
});

// ===========================================================================
// 4. Sirius — "Royal Maid's Cover"
// ===========================================================================

describe("Sirius — Royal Maid's Cover (a chosen ally takes the declared attack)", () => {
  /**
   * p2's attacker @9 declares on p1's mistress @10. p1's maid @14 and a second
   * ally @6 are both adjacent to @10; p1's far unit @19 is NOT (the candidate
   * control). Attack 6, every defense 0 unless a case says otherwise.
   */
  function layout(state: GameState): void {
    place(state, "unit_p2_skeletons", {
      position: 9,
      controllerId: "p2",
      abilities: [],
      attack: 6,
      defense: 0,
      maxHealth: 99,
      damage: 0,
      type: "ground",
    });
    place(state, "unit_p1_marksmen", {
      position: 10,
      controllerId: "p1",
      abilities: [],
      attack: 1,
      defense: 0,
      maxHealth: 99,
      damage: 0,
      type: "ground",
    });
    place(state, "unit_p1_griffins", {
      position: 14,
      controllerId: "p1",
      abilities: [],
      attack: 1,
      defense: 0,
      maxHealth: 99,
      damage: 0,
      type: "ground",
    });
    place(state, "unit_p1_crusaders", {
      position: 6,
      controllerId: "p1",
      abilities: [],
      attack: 1,
      defense: 0,
      maxHealth: 99,
      damage: 0,
      type: "ground",
    });
    place(state, "unit_p2_vampires", {
      position: 19,
      controllerId: "p2",
      abilities: [],
      maxHealth: 99,
      damage: 0,
    });
    place(state, "unit_p2_dread_knights", {
      position: 3,
      controllerId: "p2",
      abilities: [],
      maxHealth: 99,
      damage: 0,
    });
  }

  function cover(seed: string, level: 1 | 4 | 6, maidId = "unit_p1_griffins") {
    const state = freshCombat(seed);
    layout(state);
    state.players.p1.hand = [`specialty.sirius.${level}` as CardId];
    const declared = declare(state, "unit_p2_skeletons", "unit_p1_marksmen");
    const offer = reactionOffer(
      declared,
      "p1",
      `specialty.sirius.${level}`,
      maidId,
    );
    return { declared, offer };
  }

  it("the maid takes the blow instead of her mistress, and I shields 1 of it", () => {
    const { declared, offer } = cover("maid-i", 1);
    expect(offer, "the adjacent maid is offered").toBeTruthy();
    const settled = settle(applyOk(declared, offer!.action));
    expect(
      unitAt(settled, "unit_p1_marksmen").damage,
      "the original target is untouched",
    ).toBe(0);
    expect(
      unitAt(settled, "unit_p1_griffins").damage,
      "attack 6 − (defense 0 + 1)",
    ).toBe(5);
  });

  it("CONTROL: with no cover played the mistress takes the full blow", () => {
    const state = freshCombat("maid-control");
    layout(state);
    const settled = settle(
      declare(state, "unit_p2_skeletons", "unit_p1_marksmen"),
    );
    expect(unitAt(settled, "unit_p1_marksmen").damage).toBe(6);
    expect(unitAt(settled, "unit_p1_griffins").damage).toBe(0);
  });

  it("IV shields 2 (I is the control) and VI answers with 1 damage to the attacker", () => {
    const four = cover("maid-iv", 4);
    const settledFour = settle(applyOk(four.declared, four.offer!.action));
    expect(
      unitAt(settledFour, "unit_p1_griffins").damage,
      "attack 6 − (0 + 2)",
    ).toBe(4);
    expect(
      unitAt(settledFour, "unit_p2_skeletons").damage,
      "IV counters for 1",
    ).toBe(1);

    const six = cover("maid-vi", 6);
    const settledSix = settle(applyOk(six.declared, six.offer!.action));
    expect(
      unitAt(settledSix, "unit_p1_griffins").damage,
      "VI grants 3 Defense",
    ).toBe(3);
    expect(
      unitAt(settledSix, "unit_p2_skeletons").damage,
      "…and burns the attacker for 1",
    ).toBe(1);
    expect(
      damageEventsFrom(settledSix, "specialty.sirius.6").length,
      "the counter-fire is a real card-sourced damage event",
    ).toBe(1);
  });

  it("the player CHOOSES which ally covers — both adjacent maids are offered, and only they", () => {
    const { declared } = cover("maid-choice", 4);
    const offers = getLegalActions(declared, "p1").filter(
      (legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.cardId === "specialty.sirius.4",
    );
    const offered = offers
      .map((legal) =>
        legal.action.type === "PLAY_REACTION" &&
        legal.action.target?.type === "unit"
          ? legal.action.target.unitId
          : undefined,
      )
      .filter(Boolean)
      .sort();
    expect(offered, "exactly the two allies adjacent to the target").toEqual([
      "unit_p1_crusaders",
      "unit_p1_griffins",
    ]);

    // Taking the OTHER one really moves the blow there.
    const alt = cover("maid-choice-alt", 4, "unit_p1_crusaders");
    const settled = settle(applyOk(alt.declared, alt.offer!.action));
    expect(unitAt(settled, "unit_p1_crusaders").damage).toBe(4);
    expect(unitAt(settled, "unit_p1_griffins").damage).toBe(0);
  });

  it("a forged interceptor (not adjacent to the target) is refused by the handler", () => {
    const state = freshCombat("maid-forged");
    layout(state);
    // A p1 unit that is NOT adjacent to the mistress at @10.
    place(state, "unit_p1_crusaders", { position: 0 });
    state.players.p1.hand = ["specialty.sirius.4" as CardId];
    const declared = declare(state, "unit_p2_skeletons", "unit_p1_marksmen");
    const forged = applyAction(declared, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "specialty.sirius.4" as CardId,
      mode: "basic",
      target: { type: "unit", unitId: "unit_p1_crusaders" as UnitId },
    });
    expect(forged.errors.length, "the handler refuses it").toBeGreaterThan(0);
    const settled = settle(declared);
    expect(
      unitAt(settled, "unit_p1_marksmen").damage,
      "the mistress still takes the blow",
    ).toBe(6);
    expect(unitAt(settled, "unit_p1_crusaders").damage).toBe(0);
  });

  it("CONTROL: never offered against a Retaliation Attack", () => {
    // p1's mistress attacks the skeletons; the skeletons' Retaliation Attack is
    // an enemy attack on a p1 unit with two maids standing beside her — but
    // Masato's swap refuses a retaliation and so does the maid's cover.
    // Armorer (a plain defender instant) is in hand purely to guarantee the
    // retaliation window really OPENS, so the "no cover offer" read is never
    // vacuous.
    const state = freshCombat("maid-retaliation");
    layout(state);
    place(state, "unit_p1_marksmen", { attack: 2 });
    state.players.p1.hand = [
      "specialty.sirius.4" as CardId,
      "ability.armorer" as CardId,
    ];
    let current = declare(state, "unit_p1_marksmen", "unit_p2_skeletons");
    let safety = 40;
    let sawRetaliationWindow = false;
    while (safety > 0 && current.reactionWindow) {
      safety -= 1;
      const trigger = current.reactionWindow.triggerEvent;
      if (trigger.type === "UNIT_ATTACK_DECLARED" && trigger.isRetaliation) {
        sawRetaliationWindow = true;
        expect(
          reactionOffer(current, "p1", "ability.armorer"),
          "the retaliation window is really open for p1",
        ).toBeTruthy();
        expect(
          reactionOffer(current, "p1", "specialty.sirius.4"),
          "…and the cover is NOT among its offers",
        ).toBeUndefined();
      }
      current = applyOk(current, {
        type: "PASS_REACTION",
        playerId: current.reactionWindow.priorityPlayerId,
      });
    }
    expect(
      sawRetaliationWindow,
      "the retaliation opened a reaction window",
    ).toBe(true);
    const settled = settle(current);
    expect(
      unitAt(settled, "unit_p1_marksmen").damage,
      "the retaliation lands on the attacker",
    ).toBe(6);
    expect(
      unitAt(settled, "unit_p1_griffins").damage,
      "and never on the maid",
    ).toBe(0);
  });
});

// ===========================================================================
// 5. Registration — the four sets are wired, not printed prose
// ===========================================================================

describe("Azur Lane hero specialties — registration", () => {
  it("every level of all four sets is an implemented card with the expected effect kind", () => {
    const kinds: Record<string, string> = {
      bismarck: "ADD_COMBAT_STAT",
      nagato: "BOMBARDMENT_ATTACK",
      akashi: "BANK_REINFORCEMENT_DISCOUNT",
      sirius: "INTERCEPT_DECLARED_ATTACK",
    };
    for (const [hero, kind] of Object.entries(kinds)) {
      for (const level of [1, 4, 6]) {
        const card = cardLibrary[`specialty.${hero}.${level}` as CardId];
        expect(card, `${hero} ${level}`).toBeTruthy();
        expect(card.implementationStatus, `${hero} ${level}`).toBe(
          "implemented",
        );
        expect(card.effect.type, `${hero} ${level}`).toBe(
          hero === "bismarck" && level === 1
            ? "CHOOSE_ONE"
            : hero === "akashi"
              ? level === 6
                ? "HEAL_DAMAGE"
                : "CHOOSE_ONE"
              : kind,
        );
      }
    }
  });
});

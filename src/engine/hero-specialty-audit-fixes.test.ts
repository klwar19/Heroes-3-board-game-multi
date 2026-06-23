import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, effectiveInitiative, getLegalActions } from "./index";
import { adventureCards } from "@/data/cards/adventure";
import type { GameAction, GameEvent, GameState, UnitId } from "./state";

// ---------------------------------------------------------------------------
// Wiki-fidelity fixes found by the hero-specialty audit. Each test fails if the
// corrected wiring is reverted to the old (wrong) helper.
//   - Crag Hack "Offense": I is an ONGOING "+1 attack for this Combat" (not the
//     generic instant "+1 OR draw"); IV is "+1, or discard a card for +2".
//   - Gundula "Slow": I/VI slow an enemy by 2 / 4 Initiative (not 1 / 3); IV is
//     an instant +1 attack, doubled when YOUR unit is faster than the target.
// ---------------------------------------------------------------------------

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function findPlay(state: GameState, cardId: string, optionIndex?: number, unitId?: UnitId) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      (optionIndex === undefined || legal.action.optionIndex === optionIndex) &&
      (unitId === undefined || (legal.action.target?.type === "unit" && legal.action.target.unitId === unitId))
  );
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function lastAttackBonus(state: GameState, attackerId: UnitId): number | undefined {
  return [...state.eventLog]
    .reverse()
    .find(
      (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> =>
        event.type === "ATTACK_ROLLED" && event.attackerId === attackerId && !event.isRetaliation
    )?.attackBonus;
}

// ===========================================================================
// Crag Hack — "Offense"
// ===========================================================================

describe("Crag Hack's Offense specialty (audit fix)", () => {
  it("I is a single ONGOING +1-attack-for-the-Combat buff, not an instant +1/draw choice", () => {
    const card = adventureCards["specialty.crag_hack.1"];
    expect(card.effect.type, "I is a single buff, not a CHOOSE_ONE").toBe("CREATE_ATTACK_BUFF");
    // No fabricated "draw a card" alternative.
    expect(JSON.stringify(card)).not.toMatch(/DRAW_CARDS/);

    const state = createInitialGameState("crag-1");
    state.players.p1.hand = ["specialty.crag_hack.1"];
    const unit = state.combat!.units.unit_p1_griffins;
    unit.name = "Griffins";
    unit.abilities = [];
    const play = findPlay(state, "specialty.crag_hack.1", undefined, "unit_p1_griffins");
    expect(play, "I targets a friendly unit").toBeTruthy();
    const after = applyOk(state, play!.action);
    const effect = after.activeEffects.find(
      (eff) => eff.target?.type === "unit" && eff.target.unitId === "unit_p1_griffins" && eff.name === "Offense I"
    );
    expect(effect, "an ongoing Offense I buff is on the unit").toBeTruthy();
    expect(effect!.duration.type, "lasts the whole Combat").toBe("combat");
    expect(effect!.modifiers.find((m) => m.type === "ATTACK_BONUS")?.["amount" as never], "+1 attack").toBe(1);
  });

  it("IV gives +1 free OR +2 for discarding a card, both ongoing for the Combat", () => {
    const card = adventureCards["specialty.crag_hack.4"];
    expect(card.effect.type).toBe("CHOOSE_ONE");

    // Option 0: +1, no cost.
    const free = createInitialGameState("crag-4-free");
    free.players.p1.hand = ["specialty.crag_hack.4"];
    free.players.p1.deck = ["stat.attack"];
    free.combat!.units.unit_p1_griffins.abilities = [];
    const handBefore = free.players.p1.hand.length;
    const playFree = findPlay(free, "specialty.crag_hack.4", 0, "unit_p1_griffins");
    expect(playFree, "the free +1 option targets a friendly unit").toBeTruthy();
    const afterFree = applyOk(free, playFree!.action);
    const freeEffect = afterFree.activeEffects.find(
      (eff) => eff.target?.type === "unit" && eff.target.unitId === "unit_p1_griffins" && eff.name === "Offense IV"
    );
    expect(freeEffect!.modifiers.find((m) => m.type === "ATTACK_BONUS")?.["amount" as never], "+1 attack").toBe(1);
    expect(afterFree.players.p1.hand.length, "no card discarded for the free option").toBe(handBefore - 1);

    // Option 1: discard a card → +2.
    const paid = createInitialGameState("crag-4-paid");
    paid.players.p1.hand = ["specialty.crag_hack.4", "stat.attack"];
    paid.combat!.units.unit_p1_griffins.abilities = [];
    const playPaid = findPlay(paid, "specialty.crag_hack.4", 1, "unit_p1_griffins");
    expect(playPaid, "the discard-for-+2 option targets a friendly unit").toBeTruthy();
    const paidAction = playPaid!.action;
    if (paidAction.type !== "PLAY_CARD") throw new Error("expected a PLAY_CARD action");
    // The discard cost is the player's chosen payment — name the card to discard.
    const afterPaid = applyOk(paid, { ...paidAction, costCardIds: ["stat.attack"] });
    const paidEffect = afterPaid.activeEffects.find(
      (eff) => eff.target?.type === "unit" && eff.target.unitId === "unit_p1_griffins" && eff.name === "Offense IV"
    );
    expect(paidEffect!.modifiers.find((m) => m.type === "ATTACK_BONUS")?.["amount" as never], "+2 attack").toBe(2);
    expect(afterPaid.players.p1.hand, "a card was discarded as the cost").not.toContain("stat.attack");
  });
});

describe("Crag Hack's Offense VI aura (audit fix, new mechanic)", () => {
  /** A combat where p1 holds Offense VI plus two spare cards, and p1's griffins
   * are set up to attack p2's skeletons. Returns the state right after VI is played
   * (its aura active), before the attack is declared. */
  function withAura(seed: string): GameState {
    const state = createInitialGameState(seed);
    state.players.p1.hand = ["specialty.crag_hack.6", "stat.attack", "stat.defense"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const play = findPlay(state, "specialty.crag_hack.6");
    expect(play, "Offense VI is a combat play").toBeTruthy();
    const after = applyOk(state, play!.action);
    expect(
      after.activeEffects.some(
        (eff) =>
          eff.scope === "player" &&
          eff.controllerId === "p1" &&
          eff.modifiers.some((m) => m.type === "CARDS_AS_ATTACK_BONUS")
      ),
      "playing VI creates the combat-long aura"
    ).toBe(true);
    return after;
  }

  function declareGriffinAttack(state: GameState): GameState {
    const attacker = state.combat!.units.unit_p1_griffins;
    attacker.abilities = [];
    attacker.type = "ground";
    attacker.position = 9;
    attacker.attack = 4;
    const defender = state.combat!.units.unit_p2_skeletons;
    defender.abilities = [];
    defender.position = 13;
    defender.defense = 0;
    defender.maxHealth = 40;
    defender.damage = 0;
    state.combat!.dice.scriptedRolls = new Array(8).fill(0);
    state.combat!.dice.rollCount = 0;
    return applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
  }

  function convertReaction(state: GameState, cardId: string) {
    return (state.reactionWindow?.legalReactions.p1 ?? []).find(
      (legal) =>
        legal.action.type === "CONVERT_CARD_TO_ATTACK" &&
        "cardId" in legal.action &&
        legal.action.cardId === cardId
    );
  }

  it("lets you discard a held card during your attack for +1, stacking per card", () => {
    let state = declareGriffinAttack(withAura("crag-6"));
    // Each held card is offered as a "+1 attack instead" conversion.
    const first = convertReaction(state, "stat.attack");
    expect(first, "stat.attack is offered as a +1-attack conversion").toBeTruthy();
    state = applyOk(state, first!.action);
    expect(state.players.p1.discard, "the converted card is discarded").toContain("stat.attack");

    // The window reopens: convert a second card to stack to +2 on this attack.
    const second = convertReaction(state, "stat.defense");
    expect(second, "a second card is offered after the first conversion").toBeTruthy();
    state = applyOk(state, second!.action);
    state = passAllReactions(state);
    expect(lastAttackBonus(state, "unit_p1_griffins"), "two converted cards → +2 attack").toBe(2);
  });

  it("is NOT offered without the Offense VI aura", () => {
    const state = createInitialGameState("crag-6-none");
    state.players.p1.hand = ["stat.attack"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const declared = declareGriffinAttack(state);
    expect(convertReaction(declared, "stat.attack"), "no conversion without the aura").toBeFalsy();
    expect(lastAttackBonus(passAllReactions(declared), "unit_p1_griffins"), "plain attack, no bonus").toBe(0);
  });
});

// ===========================================================================
// Gundula — "Slow"
// ===========================================================================

describe("Gundula's Slow specialty (audit fix)", () => {
  function slowEnemyBy(seed: string, cardId: string): number {
    const state = createInitialGameState(seed);
    state.players.p1.hand = [cardId];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const enemy = state.combat!.units.unit_p2_skeletons;
    enemy.abilities = [];
    const before = effectiveInitiative(enemy, state.activeEffects);
    const play = findPlay(state, cardId, undefined, "unit_p2_skeletons");
    expect(play, `${cardId} targets an enemy unit`).toBeTruthy();
    const after = applyOk(state, play!.action);
    return before - effectiveInitiative(after.combat!.units.unit_p2_skeletons, after.activeEffects);
  }

  it("I slows an enemy by 2 Initiative (was wrongly 1)", () => {
    expect(slowEnemyBy("gundula-1", "specialty.gundula.1")).toBe(2);
  });

  it("VI slows an enemy by 4 Initiative (was wrongly 3)", () => {
    expect(slowEnemyBy("gundula-6", "specialty.gundula.6")).toBe(4);
  });

  it("IV gives +1 attack, doubled to +2 only when YOUR unit is faster than the target", () => {
    function attack(seed: string, attackerInit: number, defenderInit: number): number | undefined {
      const state = createInitialGameState(seed);
      state.players.p1.hand = ["specialty.gundula.4"];
      state.players.p2.hand = [];
      const attacker = state.combat!.units.unit_p1_griffins;
      attacker.abilities = [];
      attacker.type = "ground";
      attacker.position = 9;
      attacker.attack = 4;
      attacker.initiative = attackerInit;
      const defender = state.combat!.units.unit_p2_skeletons;
      defender.abilities = [];
      defender.position = 13;
      defender.defense = 0;
      defender.maxHealth = 40;
      defender.damage = 0;
      defender.initiative = defenderInit;
      state.combat!.dice.scriptedRolls = new Array(8).fill(0);
      state.combat!.dice.rollCount = 0;
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = "unit_p1_griffins";
      const declared = applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_skeletons"
      });
      const reaction = (declared.reactionWindow?.legalReactions.p1 ?? []).find(
        (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "specialty.gundula.4"
      );
      expect(reaction, "Slow IV is offered on the declared attack").toBeTruthy();
      return lastAttackBonus(passAllReactions(applyOk(declared, reaction!.action)), "unit_p1_griffins");
    }
    expect(attack("gundula-4-fast", 10, 1), "attacker faster → doubled to +2").toBe(2);
    expect(attack("gundula-4-slow", 1, 10), "attacker slower → plain +1").toBe(1);
  });
});

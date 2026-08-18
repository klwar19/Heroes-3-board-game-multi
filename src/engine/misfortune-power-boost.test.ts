import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { CardId, GameAction, GameState } from "./state";

/**
 * Polish Balance Pack Misfortune (`polish-card-balance`) — the reprint drops the
 * tier gate and its DIE half scales with the Power the caster pays into the
 * attack window: Power 0 NEGATES the attacker's die, Power 1 rolls 2 dice and
 * keeps the LOWER, Power 2 rolls 4 dice (rerolling every "+1") and sums them.
 *
 * The game author reported "I cannot add Power to Misfortune." This suite pins
 * the OBSERVABLE outcome — the attacker's resolved DAMAGE — not the log text, so
 * a regression that fails to thread the caster's added Power into the
 * `misfortuneDieByPower` threshold (leaving the die negated) fails here.
 *
 * Discriminating anchors (attacker attack 8, defender defense 2, scripted dice):
 *   damage == attack - defense + dieValue
 *   - Power 0 negate                       -> die 0   -> 6
 *   - Power 1 lower-of-two, dice [1,1]      -> die +1  -> 7   (differs from 6)
 *   - Power 2 four-reroll, dice [1,1,1,1]   -> die +4  -> 10
 * A mutation that ignores the added Power keeps the die negated (6) and fails
 * both the Power-1 and Power-2 assertions.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Pass every non-p1 priority until p1 holds the window (or it closes). */
function passUntilP1(state: GameState): GameState {
  let current = state;
  let safety = 30;
  while (current.reactionWindow && current.reactionWindow.priorityPlayerId !== "p1" && safety-- > 0) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** Pass/resolve every remaining window or reroll until combat is idle. */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 60;
  while (safety-- > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
    if (current.reactionWindow) {
      current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
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

/** p2's gold Vampires attack p1's Griffins; returns the state after declaration. */
function declareGoldAttack(seed: string, balance: boolean, hand: string[], rolls: number[]): GameState {
  const state = createInitialGameState(seed);
  state.adventure = {
    houseRules: { "polish-card-balance": balance }
  } as unknown as GameState["adventure"];
  state.activePlayerId = "p2";
  for (const unit of Object.values(state.combat!.units)) {
    unit.damage = 0;
    unit.maxHealth = 500;
  }
  const attacker = state.combat!.units.unit_p2_vampires;
  attacker.position = 9;
  attacker.activatedThisRound = false;
  attacker.attack = 8;
  attacker.grade = "gold";
  const defender = state.combat!.units.unit_p1_griffins;
  defender.position = 10;
  defender.defense = 2;
  state.combat!.activeUnitId = "unit_p2_vampires";
  state.players.p1.hand = hand as CardId[];
  state.combat!.dice.scriptedRolls = rolls;
  state.combat!.dice.rollCount = 0;
  const attack = getLegalActions(state, "p2").find(
    (legal) => legal.action.type === "ATTACK_UNIT" && legal.action.defenderId === "unit_p1_griffins"
  );
  expect(attack, "the enemy attack should be declarable").toBeTruthy();
  return applyOk(state, attack!.action);
}

/** Play the reprint Misfortune (single NEGATE_ATTACK offer, no option index). */
function playMisfortune(state: GameState): GameState {
  const at = passUntilP1(state);
  const offer = getLegalActions(at, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_REACTION" &&
      legal.action.cardId === "spell.misfortune" &&
      !legal.action.asPowerBoost
  );
  expect(offer, "Misfortune should be offered to the attacked player").toBeTruthy();
  return applyOk(at, offer!.action);
}

/** Play one basic `stat.power` into the open attack window as the caster. */
function addOnePower(state: GameState): GameState {
  const at = passUntilP1(state);
  const offer = getLegalActions(at, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_REACTION" &&
      legal.action.cardId === "stat.power" &&
      legal.action.mode !== "expert"
  );
  expect(offer, "a Power source must be offered to the Misfortune caster").toBeTruthy();
  return applyOk(at, offer!.action);
}

function griffinsDamage(state: GameState): number {
  return state.combat!.units.unit_p1_griffins.damage;
}

describe("Balance Pack Misfortune — the caster can add Power to punish the die", () => {
  it("Power 0 (no Power added) negates the die — the attacker's damage carries no die bonus", () => {
    // Scripted +1 dice are present but never consulted: the die is cancelled.
    let state = declareGoldAttack("mis-p0", true, ["spell.misfortune"], [1, 1, 1, 1, 1, 1]);
    state = playMisfortune(state);
    state = settle(state);
    expect(griffinsDamage(state)).toBe(6);
  });

  it("Power 1 rolls 2 dice and keeps the LOWER — added Power really moves the resolved damage", () => {
    // The Power source is offered ONLY because the caster played Misfortune;
    // with the die kept negated (Power ignored) the damage would stay 6.
    let state = declareGoldAttack("mis-p1", true, ["spell.misfortune", "stat.power"], [1, 1, 1, 1]);
    state = playMisfortune(state);
    state = addOnePower(state);
    state = settle(state);
    // lower of [1, 1] == +1 -> 8 - 2 + 1 == 7, strictly above the negated 6.
    expect(griffinsDamage(state)).toBe(7);
  });

  it("Power 1 lower-of-two can also punish a mixed roll to the LOWER die", () => {
    let state = declareGoldAttack("mis-p1-mixed", true, ["spell.misfortune", "stat.power"], [-1, 1, 1, 1]);
    state = playMisfortune(state);
    state = addOnePower(state);
    state = settle(state);
    // lower of [-1, 1] == -1 -> 8 - 2 - 1 == 5.
    expect(griffinsDamage(state)).toBe(5);
  });

  it("Power 2 rolls 4 dice and sums them (rerolling every '+1') — two Power reach the top rung", () => {
    let state = declareGoldAttack(
      "mis-p2",
      true,
      ["spell.misfortune", "stat.power", "stat.power"],
      [1, 1, 1, 1, 1, 1, 1, 1]
    );
    state = playMisfortune(state);
    state = addOnePower(state);
    state = addOnePower(state);
    state = settle(state);
    // Four dice, each scripted +1 (rerolled to +1) -> +4 -> 8 - 2 + 4 == 10.
    expect(griffinsDamage(state)).toBe(10);
  });

  it("the Power source is genuinely OFFERED to the caster after Misfortune is played", () => {
    let state = declareGoldAttack("mis-offer", true, ["spell.misfortune", "stat.power"], [1, 1]);
    state = playMisfortune(state);
    const at = passUntilP1(state);
    const powerOffered = getLegalActions(at, "p1").some(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.power"
    );
    expect(powerOffered, "the Misfortune caster must be offered a Power play").toBe(true);
    // And it is the caster who owns the empowerable instant on the stack.
    expect(at.stack.at(-1)?.modifiers.misfortuneCasterId).toBe("p1");
  });

  it("CONTROL: with the rule OFF the classic tier-gated card never rolls a punished die", () => {
    // Against a gold attacker the classic card offers only its gold rung; there
    // is no dieModeByPower, so adding Power can never produce a lower-of-two /
    // four-reroll resolution. Playing the affordable rung simply negates.
    let state = declareGoldAttack("mis-off", false, ["spell.misfortune", "stat.power", "stat.power"], [1, 1, 1, 1]);
    const at = passUntilP1(state);
    const goldRung = getLegalActions(at, "p1").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "spell.misfortune"
    );
    expect(goldRung, "the classic card offers its matching (gold) rung").toBeTruthy();
    state = applyOk(at, {
      ...goldRung!.action,
      // the gold rung costs 2 Power-source discards on the classic card
      ...(goldRung!.action.type === "PLAY_REACTION"
        ? { costCardIds: ["stat.power", "stat.power"] as CardId[] }
        : {})
    } as GameAction);
    state = settle(state);
    // The classic card cancels the die outright: no die bonus, damage 6.
    expect(griffinsDamage(state)).toBe(6);
    // And no reprint die note was ever produced.
    const dieNote = state.eventLog.find(
      (entry: { type: string; abilityId?: string; message?: string }) =>
        entry.type === "UNIT_ABILITY_TRIGGERED" &&
        entry.abilityId === "misfortune" &&
        /Attack dice/.test(entry.message ?? "")
    );
    expect(dieNote, "the classic card never rolls a punished die").toBeUndefined();
  });
});

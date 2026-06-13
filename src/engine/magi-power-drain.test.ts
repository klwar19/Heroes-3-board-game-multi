import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState, PlayerId } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 20;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** Pass instant windows and keep attack-die rolls until a real decision lands. */
function settleUntilChoice(state: GameState): GameState {
  let current = state;
  let safety = 30;
  while (safety > 0 && (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")) {
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
        candidateIndex: 0
      });
    }
  }
  return current;
}

function setActive(state: GameState, playerId: PlayerId, unitId: string): void {
  state.activePlayerId = playerId;
  state.combat!.activeUnitId = unitId;
}

/**
 * p1's ranged Marksmen become a Magi (Power Drain). They shoot p2's skeletons
 * from the backline, so no retaliation complicates the post-attack discard.
 */
function magiState(p2Hand: string[]): GameState {
  const state = createInitialGameState();
  const magi = state.combat!.units.unit_p1_marksmen;
  magi.name = "Magi";
  magi.cardName = "Magi";
  magi.abilities = ["ignore-combat-penalties", "magi-power-drain"];
  magi.attack = 1;
  state.players.p1.hand = [];
  state.players.p2.hand = [...p2Hand];
  state.combat!.dice.scriptedRolls = [0, 0, 0];
  state.combat!.dice.rollCount = 0;
  setActive(state, "p1", "unit_p1_marksmen");
  return state;
}

function magiAttack(state: GameState): GameState {
  return settleUntilChoice(
    applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_skeletons"
    })
  );
}

describe("Magi Power Drain", () => {
  it("opens a discard choice for the defender listing only their Power cards", () => {
    // stat.power is a Power statistic; spell.magic_arrow is a Spell (each may
    // be discarded for +1 Power). stat.attack is neither.
    let state = magiAttack(magiState(["stat.power", "spell.magic_arrow", "stat.attack"]));

    const choice = state.pendingChoice;
    expect(choice?.type).toBe("COMBAT_HAND_DISCARD");
    if (choice?.type !== "COMBAT_HAND_DISCARD") {
      return;
    }
    expect(choice.playerId).toBe("p2");
    expect(new Set(choice.powerCardIds)).toEqual(new Set(["stat.power", "spell.magic_arrow"]));

    // The defender (not the active player) is the one offered the resolution.
    const legal = getLegalActions(state, "p2");
    const discardActions = legal.filter((entry) => entry.action.type === "RESOLVE_COMBAT_DISCARD");
    expect(discardActions).toHaveLength(3); // two Power cards + the random option

    state = applyOk(state, {
      type: "RESOLVE_COMBAT_DISCARD",
      playerId: "p2",
      choiceId: choice.id,
      cardId: "spell.magic_arrow"
    });

    expect(state.players.p2.discard).toContain("spell.magic_arrow");
    expect(state.players.p2.hand).toEqual(["stat.power", "stat.attack"]);
    expect(state.pendingChoice).toBeNull();
    expect(state.phase).toBe("combat");
  });

  it("discards a random card when the defender declines to spend a Power card", () => {
    let state = magiAttack(magiState(["stat.power", "stat.attack"]));
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("COMBAT_HAND_DISCARD");
    if (choice?.type !== "COMBAT_HAND_DISCARD") {
      return;
    }

    state = applyOk(state, {
      type: "RESOLVE_COMBAT_DISCARD",
      playerId: "p2",
      choiceId: choice.id,
      cardId: "random"
    });

    expect(state.players.p2.hand).toHaveLength(1);
    expect(state.players.p2.discard).toHaveLength(1);
    expect(state.pendingChoice).toBeNull();
  });

  it("forces a random discard with no choice when the defender holds no Power card", () => {
    const state = magiAttack(magiState(["stat.attack", "stat.knowledge"]));

    // No Power card and no Spell: nothing to choose, so a random card is gone
    // already and combat never paused.
    expect(state.pendingChoice).toBeNull();
    expect(state.players.p2.hand).toHaveLength(1);
    expect(state.players.p2.discard).toHaveLength(1);
  });

  it("does nothing when the defender's hand is empty", () => {
    const state = magiAttack(magiState([]));
    expect(state.pendingChoice).toBeNull();
    expect(state.players.p2.hand).toHaveLength(0);
    expect(state.players.p2.discard).toHaveLength(0);
  });

  it("only the defender may resolve the drain", () => {
    const state = magiAttack(magiState(["stat.power", "stat.attack"]));
    const choice = state.pendingChoice;
    if (choice?.type !== "COMBAT_HAND_DISCARD") {
      throw new Error("expected the drain choice");
    }
    // p1 (the attacker) cannot answer for p2.
    const wrong = applyAction(state, {
      type: "RESOLVE_COMBAT_DISCARD",
      playerId: "p1",
      choiceId: choice.id,
      cardId: "random"
    });
    expect(wrong.errors.length).toBeGreaterThan(0);
  });
});

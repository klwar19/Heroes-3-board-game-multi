import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, NEUTRAL_PLAYER_ID } from "./index";
import { getKnockbackAbility } from "./unit-abilities";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities } from "@/data/units/abilities";
import type { CombatUnitState, GameAction, GameEvent, GameState } from "./state";

/**
 * Ghost Dragons (neutral) "Knock Back": after the attack, roll 1 Attack die; on
 * a "0" the still-living target is shoved one empty space away from the dragon
 * (the defender chooses; a neutral target or a single forced space resolves at
 * once). Being pushed out of reach denies the Retaliation Attack. With no valid
 * space the target stays and retaliates as normal.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Pass instant windows and keep attack rolls; stop on a pending option choice. */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 60;
  while (
    safety > 0 &&
    (current.reactionWindow || current.pendingChoice?.type === "ATTACK_DIE_REROLL")
  ) {
    safety -= 1;
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

function script(state: GameState, rolls: number[]): void {
  state.combat!.dice.scriptedRolls = rolls;
  state.combat!.dice.rollCount = 0;
}

function retaliationHappened(state: GameState): boolean {
  return state.eventLog.some((event) => event.type === "RETALIATION_ATTACKED");
}

function knockbackMoves(state: GameState, unitId: string): Extract<GameEvent, { type: "UNIT_MOVED" }>[] {
  return state.eventLog.filter(
    (event): event is Extract<GameEvent, { type: "UNIT_MOVED" }> => event.type === "UNIT_MOVED" && event.unitId === unitId
  );
}

/**
 * A Ghost Dragon (unit_p1_griffins, repurposed) at B3 attacks the defender
 * directly below at B4. The board is otherwise cleared so the target's free
 * neighbours (A4=12, C4=14, B5=17) are the knock-back candidates; tests park
 * filler units on those spaces to control how many remain.
 *
 *   columns A B C D  → 0 1 2 3
 *   B3 = 9 (dragon), B4 = 13 (target), A4 = 12, C4 = 14, B5 = 17
 */
function knockbackDuel(options: { blocked?: number[]; neutralDefender?: boolean } = {}): GameState {
  const state = createInitialGameState("ghost-knockback");
  const dragon = state.combat!.units.unit_p1_griffins;
  const target = state.combat!.units.unit_p2_skeletons;

  dragon.type = "flying";
  dragon.abilities = ["ghost-dragon-knockback"];
  dragon.position = 9;
  dragon.attack = 5;
  dragon.defense = 2;
  dragon.maxHealth = 50;
  dragon.damage = 0;

  target.type = "ground";
  target.abilities = [];
  target.position = 13;
  target.attack = 3;
  target.defense = 1;
  target.maxHealth = 50;
  target.damage = 0;
  if (options.neutralDefender) {
    target.controllerId = NEUTRAL_PLAYER_ID;
  }

  // Park the remaining four units: filler on the blocked neighbour spaces, the
  // rest stashed in the top row well clear of the action.
  const spare = ["unit_p1_marksmen", "unit_p1_crusaders", "unit_p2_vampires", "unit_p2_dread_knights"];
  const blocked = options.blocked ?? [];
  const parking = [0, 1, 2, 3];
  spare.forEach((id, index) => {
    const unit = state.combat!.units[id];
    unit.position = blocked[index] ?? parking[index];
    unit.maxHealth = 50;
    unit.damage = 0;
  });

  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  return state;
}

function attack(state: GameState): GameState {
  return settle(
    applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_griffins", defenderId: "unit_p2_skeletons" })
  );
}

describe("Ghost Dragon knock-back — data wiring", () => {
  it("the neutral Ghost Dragons carry the implemented knock-back ability", () => {
    expect(coreUnitDefinitions["neutral.ghost_dragons"].neutral?.abilities).toEqual(["ghost-dragon-knockback"]);
    const ability = unitAbilities["ghost-dragon-knockback"];
    expect(ability.implementationStatus).toBe("implemented");
    expect(ability.effect).toEqual({ type: "KNOCKBACK_AFTER_ATTACK", onRoll: 0 });
  });

  it("getKnockbackAbility reads the printed face", () => {
    const dragon = { abilities: ["ghost-dragon-knockback"] } as CombatUnitState;
    expect(getKnockbackAbility(dragon)?.onRoll).toBe(0);
    expect(getKnockbackAbility({ abilities: [] } as unknown as CombatUnitState)).toBeNull();
  });
});

describe("Ghost Dragon knock-back — combat", () => {
  it('shoves the target on a "0" and so denies its Retaliation Attack', () => {
    // attack die 0, then the knock-back die 0. Three free spaces → the defender
    // (p2) picks where it lands.
    const state = knockbackDuel();
    script(state, [0, 0]);
    const paused = attack(state);

    const choice = paused.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    expect(choice?.type === "OPTION_CHOICE" && choice.context).toBe("combat-knockback");
    expect(choice?.playerId).toBe("p2");
    expect(choice?.type === "OPTION_CHOICE" && choice.knockback?.positions).toEqual([12, 14, 17]);

    const resolved = settle(
      applyOk(paused, { type: "CHOOSE_OPTION", playerId: "p2", choiceId: choice!.id, optionIndex: 1 })
    );
    expect(resolved.combat!.units.unit_p2_skeletons.position).toBe(14);
    expect(retaliationHappened(resolved)).toBe(false);
    expect(resolved.pendingChoice).toBeNull();
  });

  it('does not shove on a non-"0" roll, so the target retaliates as normal', () => {
    // attack die 0, knock-back die +1 → no knock-back; then the retaliation die.
    const state = knockbackDuel();
    script(state, [0, 1, 0]);
    const next = attack(state);

    expect(next.pendingChoice).toBeNull();
    expect(next.combat!.units.unit_p2_skeletons.position).toBe(13); // never moved
    expect(retaliationHappened(next)).toBe(true);
  });

  it("auto-resolves a single forced space without asking (and still cancels retaliation)", () => {
    // C4 and B5 are blocked, leaving only A4 (12): the lone space is forced.
    const state = knockbackDuel({ blocked: [14, 17] });
    script(state, [0, 0]);
    const next = attack(state);

    expect(next.pendingChoice).toBeNull();
    expect(next.combat!.units.unit_p2_skeletons.position).toBe(12);
    expect(knockbackMoves(next, "unit_p2_skeletons")).toHaveLength(1);
    expect(retaliationHappened(next)).toBe(false);
  });

  it('holds its ground (and retaliates) when "0" rolls but no space is free', () => {
    // All three neighbours blocked → nowhere to go.
    const state = knockbackDuel({ blocked: [12, 14, 17] });
    script(state, [0, 0, 0]);
    const next = attack(state);

    expect(next.pendingChoice).toBeNull();
    expect(next.combat!.units.unit_p2_skeletons.position).toBe(13);
    expect(knockbackMoves(next, "unit_p2_skeletons")).toHaveLength(0);
    expect(retaliationHappened(next)).toBe(true);
  });

  it("auto-resolves for a neutral target (no seat to ask) to the lowest free space", () => {
    const state = knockbackDuel({ neutralDefender: true });
    script(state, [0, 0]);
    const next = attack(state);

    expect(next.pendingChoice).toBeNull();
    expect(next.combat!.units.unit_p2_skeletons.position).toBe(12); // lowest of 12/14/17
    expect(retaliationHappened(next)).toBe(false);
  });
});

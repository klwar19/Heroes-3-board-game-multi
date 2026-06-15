import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameEvent, GameState } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety-- > 0) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** Pass any other player's reaction priority until `playerId` may act. */
function passUntil(state: GameState, playerId: string): GameState {
  let current = state;
  let safety = 10;
  while (current.reactionWindow && current.reactionWindow.priorityPlayerId !== playerId && safety-- > 0) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** The most recent main (non-retaliation) hit dealt by `attackerId`. */
function lastHitBy(state: GameState, attackerId: string): Extract<GameEvent, { type: "ATTACK_ROLLED" }> | undefined {
  return [...state.eventLog]
    .reverse()
    .find(
      (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> =>
        event.type === "ATTACK_ROLLED" && event.attackerId === attackerId && !event.isRetaliation
    );
}

/**
 * A clean adjacent melee duel: p1 Griffins (attack 3, defense 0) one space from
 * p2 Vampires (attack 5, defense 1). Abilities are stripped and health pools are
 * huge so nobody dies and no retaliation/reroll noise touches the attack maths;
 * spare units are parked far away. p2 holds the Buckler. The Attack die is
 * scripted to 0 throughout (no swing) so a reported `attackValue` is exactly the
 * unit's attack plus the buffs/debuffs in play.
 */
function bucklerDuel(): GameState {
  const state = createInitialGameState("buckler-seed");
  const combat = state.combat;
  if (!combat) {
    throw new Error("Expected combat setup.");
  }

  const griffins = combat.units.unit_p1_griffins;
  const vampires = combat.units.unit_p2_vampires;
  griffins.type = "ground";
  griffins.position = 9;
  griffins.attack = 3;
  griffins.defense = 0;
  griffins.maxHealth = 50;
  griffins.damage = 0;
  griffins.abilities = [];
  vampires.type = "ground";
  vampires.position = 13;
  vampires.attack = 5;
  vampires.defense = 1;
  vampires.maxHealth = 50;
  vampires.damage = 0;
  vampires.abilities = [];
  combat.units.unit_p1_marksmen.position = 0;
  combat.units.unit_p1_crusaders.position = 3;
  combat.units.unit_p2_skeletons.position = 19;
  combat.units.unit_p2_dread_knights.position = 16;
  state.players.p1.hand = [];
  state.players.p2.hand = ["artifact.buckler_of_the_gnoll_king"];
  state.activePlayerId = "p1";
  combat.activeUnitId = "unit_p1_griffins";
  combat.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
  combat.dice.rollCount = 0;
  return state;
}

function declareGriffinsAttack(state: GameState): GameState {
  return applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: "unit_p1_griffins",
    defenderId: "unit_p2_vampires"
  });
}

/** Force the (surviving) Vampires to take their own swing at the Griffins. */
function vampiresStrikeBack(state: GameState): GameState {
  const next = state;
  next.combat!.dice.scriptedRolls = [0, 0, 0, 0];
  next.combat!.dice.rollCount = 0;
  next.activePlayerId = "p2";
  next.combat!.activeUnitId = "unit_p2_vampires";
  return passAllReactions(
    applyOk(next, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_vampires",
      defenderId: "unit_p1_griffins"
    })
  );
}

describe("Buckler of the Gnoll King", () => {
  it("offers both printed sides as reactions to an incoming attack", () => {
    const window = passUntil(declareGriffinsAttack(bucklerDuel()), "p2");
    const optionIndexes = getLegalActions(window, "p2")
      .filter(
        (legal) =>
          legal.action.type === "PLAY_REACTION" && legal.action.cardId === "artifact.buckler_of_the_gnoll_king"
      )
      .map((legal) => (legal.action.type === "PLAY_REACTION" ? legal.action.optionIndex : undefined));

    // CHOOSE_ONE card: option 0 (+2 def / −1 atk) and option 1 (+1 def).
    expect(new Set(optionIndexes)).toEqual(new Set([0, 1]));
  });

  it("option 0 grants +2 defense now and a lasting −1 attack on the defending unit", () => {
    const declared = declareGriffinsAttack(bucklerDuel());

    const buckler = applyOk(passUntil(declared, "p2"), {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "artifact.buckler_of_the_gnoll_king",
      optionIndex: 0
    });

    // The −1 attack drawback is a lasting, non-cleansable combat effect bound to
    // the defending unit, created the moment the card is played.
    const penalty = buckler.activeEffects.find(
      (effect) => effect.target?.type === "unit" && effect.target.unitId === "unit_p2_vampires"
    );
    expect(penalty).toMatchObject({
      name: "Buckler of the Gnoll King",
      scope: "unit",
      duration: { type: "combat" },
      removable: false,
      modifiers: [{ type: "ATTACK_BONUS", amount: -1 }]
    });

    // The incoming hit resolves with the +2 defense applied: Griffins 3 + 0 die
    // vs Vampires 1 + 2 = 3 → 0 damage (the unit survives).
    const resolved = passAllReactions(buckler);
    expect(lastHitBy(resolved, "unit_p1_griffins")).toMatchObject({
      defenseBonus: 2,
      defenseValue: 3,
      attackValue: 3,
      damage: 0
    });

    // The surviving Vampires strike back: base attack 5 minus the Buckler's
    // lasting −1, plus a 0 die = 4 (it would be 5 without the drawback).
    const counter = vampiresStrikeBack(resolved);
    expect(lastHitBy(counter, "unit_p2_vampires")?.attackValue).toBe(4);
  });

  it("option 1 grants only +1 defense and applies no attack penalty", () => {
    const declared = declareGriffinsAttack(bucklerDuel());

    const buckler = applyOk(passUntil(declared, "p2"), {
      type: "PLAY_REACTION",
      playerId: "p2",
      cardId: "artifact.buckler_of_the_gnoll_king",
      optionIndex: 1
    });

    // The plain +1 side leaves no lasting attack debuff behind.
    expect(
      buckler.activeEffects.some((effect) =>
        effect.modifiers.some((modifier) => modifier.type === "ATTACK_BONUS")
      )
    ).toBe(false);

    // Only +1 defense reaches the incoming hit: Vampires 1 + 1 = 2.
    const resolved = passAllReactions(buckler);
    expect(lastHitBy(resolved, "unit_p1_griffins")).toMatchObject({ defenseBonus: 1, defenseValue: 2 });

    // A real swing confirms the attack is untouched: the Vampires keep attack 5.
    const counter = vampiresStrikeBack(resolved);
    expect(lastHitBy(counter, "unit_p2_vampires")?.attackValue).toBe(5);
  });
});

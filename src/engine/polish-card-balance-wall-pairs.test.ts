/**
 * Polish Balance Pack (`polish-card-balance`) — the 2026-09-26 Force Field,
 * Fire Wall and Luna I / VI faces: "place UP TO 2 tokens on 2 ADJACENT empty
 * spaces"; Fire Wall (spell and Luna) lasts 2 Combat rounds; Force Field lasts
 * 1 / 2 / 3 Combat rounds by Power. Each behaviour is checked against a rule-OFF
 * CONTROL (one token, printed duration, no second-token pick) wherever the new
 * and printed readings diverge, so removing the wiring turns it red.
 */
import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { chooseComputerAction } from "./computer/policy";
import type { ComputerObservation } from "./computer/types";
import type { BattlefieldTokenState, CardId, GameAction, GameState } from "./state";
import { getOrthogonalNeighbors, hexPosition } from "./battlefield";
import { battlefieldTokenCells } from "./hex-footprint";

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
      playerId: current.reactionWindow.priorityPlayerId,
    });
  }
  return current;
}

/** A 4×5 combat with every unit pinned to the back rows, so space 9 and its
 * four neighbours (5, 8, 10, 13) are empty. */
function combat(balance: boolean, seed: string): GameState {
  const state = createInitialGameState(`${seed}-${balance}`);
  state.adventure = {
    houseRules: { "polish-card-balance": balance },
  } as unknown as GameState["adventure"];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  state.combat!.units.unit_p1_griffins.activatedThisRound = false;
  const units = state.combat!.units;
  units.unit_p1_griffins.position = 0;
  units.unit_p1_crusaders.position = 1;
  units.unit_p1_marksmen.position = 2;
  units.unit_p2_vampires.position = 16;
  units.unit_p2_skeletons.position = 17;
  units.unit_p2_dread_knights.position = 18;
  state.combat!.obstacles = [];
  state.combat!.battlefieldTokens = [];
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  return state;
}

function castAt9(state: GameState, cardId: string, power: number): GameState {
  let next = state;
  next.players.p1.hand = [cardId as CardId, ...Array.from({ length: power }, () => "stat.power" as CardId)];
  const offer = getLegalActions(next, "p1").find(
    (legal) =>
      legal.action.type === "CAST_SPELL" &&
      legal.action.cardId === cardId &&
      legal.action.target.type === "space" &&
      legal.action.target.position === 9,
  );
  expect(offer, `${cardId} should be castable on space 9`).toBeTruthy();
  next = applyOk(next, offer!.action);
  for (let i = 0; i < power; i += 1) {
    const boost = getLegalActions(next, "p1").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.power",
    );
    expect(boost, `power boost ${i + 1} should be offered`).toBeTruthy();
    next = applyOk(next, boost!.action);
  }
  return passAllReactions(next);
}

function playLunaAt9(state: GameState, cardId: string): GameState {
  state.players.p1.hand = [cardId as CardId];
  const play = getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === cardId &&
      legal.action.target?.type === "space" &&
      legal.action.target.position === 9,
  );
  expect(play, `${cardId} should be playable on space 9`).toBeTruthy();
  return applyOk(state, play!.action);
}

function tokens(state: GameState, kind: BattlefieldTokenState["kind"]): BattlefieldTokenState[] {
  return (state.combat!.battlefieldTokens ?? []).filter((token) => token.kind === kind);
}

function pairChoice(state: GameState) {
  const choice = state.pendingChoice;
  if (choice?.type !== "OPTION_CHOICE" || choice.context !== "place-wall-token-pair") {
    return undefined;
  }
  return choice;
}

/** Answer the open second-token pick with `position` (undefined = "No second token"). */
function answerPair(state: GameState, position: number | undefined): GameState {
  const choice = pairChoice(state)!;
  const plan = choice.wallTokenPair!;
  const optionIndex = position === undefined ? plan.positions.length : plan.positions.indexOf(position);
  expect(optionIndex).toBeGreaterThanOrEqual(0);
  return applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex });
}

describe("Balance Pack — Fire Wall: 2 rounds, up to 2 adjacent tokens", () => {
  it("offers exactly the empty spaces adjacent to the first token, and the second token copies it", () => {
    const on = castAt9(combat(true, "fw-pair"), "spell.fire_wall", 1);
    const choice = pairChoice(on);
    expect(choice, "the balance wall opens the second-token pick").toBeTruthy();
    expect([...choice!.wallTokenPair!.positions].sort((a, b) => a - b)).toEqual([5, 8, 10, 13]);

    const round = on.combat!.round;
    const after = answerPair(on, 10);
    const walls = tokens(after, "fire_wall");
    expect(walls.map((wall) => wall.position).sort((a, b) => a - b)).toEqual([9, 10]);
    for (const wall of walls) {
      expect(wall.damage).toBe(2);
      expect(wall.controllerId).toBe("p1");
      expect(wall.expiresAtCombatRoundEnd).toBe(round + 1);
      expect(wall.sourceSpellCardId).toBe("spell.fire_wall");
      // The spell face prints no start-of-turn burn (only Luna's does).
      expect(wall.burnsAtActivation).toBeUndefined();
    }
    expect(after.pendingChoice).toBeNull();
    expect(after.phase).toBe("combat");
  });

  it("declining leaves exactly one timed wall", () => {
    const on = castAt9(combat(true, "fw-decline"), "spell.fire_wall", 0);
    const after = answerPair(on, undefined);
    const walls = tokens(after, "fire_wall");
    expect(walls).toHaveLength(1);
    expect(walls[0]!.expiresAtCombatRoundEnd).toBe(after.combat!.round + 1);
    expect(after.pendingChoice).toBeNull();
  });

  it("CONTROL: the printed wall is one token for the whole Combat, no second pick", () => {
    const off = castAt9(combat(false, "fw-off"), "spell.fire_wall", 1);
    expect(pairChoice(off)).toBeUndefined();
    const walls = tokens(off, "fire_wall");
    expect(walls).toHaveLength(1);
    expect(walls[0]!.expiresAtCombatRoundEnd).toBeUndefined();
  });

  it("a computer seat places the second wall next to the enemy rather than declining", () => {
    const on = castAt9(combat(true, "fw-ai"), "spell.fire_wall", 0);
    const choice = pairChoice(on)!;
    const ai = chooseComputerAction({
      playerId: "p1",
      state: on as unknown as ComputerObservation["state"],
      legalActions: getLegalActions(on, "p1"),
    });
    expect(ai?.action.type).toBe("CHOOSE_OPTION");
    const index = (ai!.action as Extract<GameAction, { type: "CHOOSE_OPTION" }>).optionIndex;
    // Space 13 touches the enemy line (16–18); the decline option is last.
    expect(choice.wallTokenPair!.positions[index]).toBe(13);
  });
});

describe("Balance Pack — Force Field: 1 / 2 / 3 rounds, up to 2 adjacent tokens", () => {
  it("Power 2 lasts 3 Combat rounds on BOTH tokens (the printed field lasts the whole Combat)", () => {
    const on = castAt9(combat(true, "ff-p2"), "spell.force_field", 2);
    const round = on.combat!.round;
    const after = answerPair(on, 5);
    const fields = tokens(after, "force_field");
    expect(fields.map((field) => field.position).sort((a, b) => a - b)).toEqual([5, 9]);
    for (const field of fields) {
      expect(field.expiresAtCombatRoundEnd).toBe(round + 2);
    }

    const off = castAt9(combat(false, "ff-p2"), "spell.force_field", 2);
    expect(pairChoice(off)).toBeUndefined();
    const printed = tokens(off, "force_field");
    expect(printed).toHaveLength(1);
    expect(printed[0]!.expiresAtCombatRoundEnd).toBeUndefined();
  });

  it("Power 1 lasts 2 rounds and Power 0 this round only (the same spans as printed — only Power 2 changed), each with the pair pick", () => {
    // No-regression pin for the unchanged rungs; the pair pick is what diverges
    // from the printed card here (see the Power 2 test for the duration CONTROL).
    const one = castAt9(combat(true, "ff-p1"), "spell.force_field", 1);
    expect(tokens(one, "force_field")[0]!.expiresAtCombatRoundEnd).toBe(one.combat!.round + 1);
    expect(pairChoice(one)).toBeTruthy();
    const zero = castAt9(combat(true, "ff-p0"), "spell.force_field", 0);
    expect(tokens(zero, "force_field")[0]!.expiresAtCombatRoundEnd).toBe(zero.combat!.round);
    expect(pairChoice(zero)).toBeTruthy();
  });

  it("the second field is a real Obstacle: its space stops being a move destination", () => {
    const moveDestinations = (state: GameState) => {
      // Hand a fresh activation to the Griffins on space 0.
      const griffins = state.combat!.units.unit_p1_griffins;
      griffins.activatedThisRound = false;
      griffins.movedThisActivation = false;
      state.combat!.activeUnitId = griffins.id;
      state.activePlayerId = "p1";
      return getLegalActions(state, "p1")
        .filter((legal) => legal.action.type === "MOVE_UNIT")
        .map((legal) => (legal.action as Extract<GameAction, { type: "MOVE_UNIT" }>).destination);
    };
    // CONTROL: decline the second token — space 5 (two steps from the active
    // Griffins on 0) is still a legal landing.
    const declined = answerPair(castAt9(combat(true, "ff-block-a"), "spell.force_field", 2), undefined);
    expect(moveDestinations(declined)).toContain(5);
    // Second field on 5: nobody may stop there any more.
    const placed = answerPair(castAt9(combat(true, "ff-block-b"), "spell.force_field", 2), 5);
    expect(moveDestinations(placed)).not.toContain(5);
  });
});

describe("Balance Pack — Luna I / VI: 2 rounds, up to 2 adjacent Fire Wall tokens", () => {
  it("Luna VI: both tokens deal 3, burn at activation start, and lift after 2 rounds", () => {
    const on = playLunaAt9(combat(true, "luna-vi-pair"), "specialty.luna.6");
    expect(pairChoice(on), "the reprint opens the second-token pick").toBeTruthy();
    expect(on.phase).toBe("choice");
    const round = on.combat!.round;
    const after = answerPair(on, 8);
    const walls = tokens(after, "fire_wall");
    expect(walls.map((wall) => wall.position).sort((a, b) => a - b)).toEqual([8, 9]);
    for (const wall of walls) {
      expect(wall.damage).toBe(3);
      expect(wall.burnsAtActivation).toBe(true);
      expect(wall.expiresAtCombatRoundEnd).toBe(round + 1);
    }
    expect(after.phase).toBe("combat");
  });

  it("Luna I deals 1 per token", () => {
    const after = answerPair(playLunaAt9(combat(true, "luna-i-pair"), "specialty.luna.1"), 10);
    expect(tokens(after, "fire_wall").map((wall) => wall.damage)).toEqual([1, 1]);
  });

  it("CONTROL: the printed Luna VI places one wall for the whole Combat", () => {
    const off = playLunaAt9(combat(false, "luna-vi-off"), "specialty.luna.6");
    expect(pairChoice(off)).toBeUndefined();
    const walls = tokens(off, "fire_wall");
    expect(walls).toHaveLength(1);
    expect(walls[0]!.expiresAtCombatRoundEnd).toBeUndefined();
  });
});

describe("Balance Pack wall pairs on the hex battlefield (PC wall sizes)", () => {
  const hex = (column: number, row: number): number => {
    const position = hexPosition(column, row);
    if (position === null) throw new Error(`off board ${column},${row}`);
    return position;
  };

  /** A hex combat with p1's Griffins active and both armies parked on the far columns. */
  function hexCombat(seed: string): GameState {
    const state = createInitialGameState(seed, { hexBattlefield: true });
    expect(state.combat?.geometry).toBe("hex");
    state.adventure = {
      houseRules: { "polish-card-balance": true },
    } as unknown as GameState["adventure"];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_griffins";
    const units = state.combat!.units;
    units.unit_p1_griffins.activatedThisRound = false;
    units.unit_p1_griffins.position = hex(1, 0);
    units.unit_p1_crusaders.position = hex(1, 4);
    units.unit_p1_marksmen.position = hex(1, 8);
    units.unit_p2_vampires.position = hex(11, 0);
    units.unit_p2_skeletons.position = hex(11, 4);
    units.unit_p2_dread_knights.position = hex(11, 8);
    state.combat!.obstacles = [];
    state.combat!.battlefieldTokens = [];
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    return state;
  }

  it("offers every free hex touching EITHER hex of the 2-hex first wall, and the second wall is 2 hexes too", () => {
    let state = hexCombat("hex-fw-pair");
    const anchor = hex(6, 4);
    state.players.p1.hand = ["spell.fire_wall" as CardId];
    const offer = getLegalActions(state, "p1").find(
      (legal) =>
        legal.action.type === "CAST_SPELL" &&
        legal.action.cardId === "spell.fire_wall" &&
        legal.action.target.type === "space" &&
        legal.action.target.position === anchor,
    );
    expect(offer, "Fire Wall should be castable on the centre hex").toBeTruthy();
    state = passAllReactions(applyOk(state, offer!.action));

    const [first] = tokens(state, "fire_wall");
    const firstCells = battlefieldTokenCells(first!);
    expect(firstCells).toHaveLength(2);
    // Every hex adjacent to either wall hex (the board centre, nothing near):
    // a neighbour of the anchor alone would miss the tail's far side.
    const expected = [...new Set(firstCells.flatMap((cell) => getOrthogonalNeighbors(cell)))]
      .filter((cell) => !firstCells.includes(cell))
      .sort((a, b) => a - b);
    expect(expected).toHaveLength(8);
    const choice = pairChoice(state);
    expect(choice, "the balance wall opens the second-token pick on the hex board").toBeTruthy();
    expect([...choice!.wallTokenPair!.positions].sort((a, b) => a - b)).toEqual(expected);

    // Pick a hex beside the TAIL only.
    const tailOnly = expected.find((cell) => !getOrthogonalNeighbors(firstCells[0]!).includes(cell))!;
    expect(tailOnly).toBeDefined();
    const after = answerPair(state, tailOnly);
    const walls = tokens(after, "fire_wall");
    expect(walls).toHaveLength(2);
    const second = walls.find((wall) => wall.id !== first!.id)!;
    const secondCells = battlefieldTokenCells(second);
    expect(second.position).toBe(tailOnly);
    expect(secondCells).toHaveLength(2);
    expect(secondCells.some((cell) => firstCells.includes(cell))).toBe(false);
    expect(second.expiresAtCombatRoundEnd).toBe(first!.expiresAtCombatRoundEnd);
    expect(second.damage).toBe(first!.damage);
  });
});

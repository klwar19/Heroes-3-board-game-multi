import { describe, expect, it } from "vitest";
import { getTileBorderSegments, internalBorderSegment } from "@/data/map/borders";
import { coreTileDefinitions } from "@/data/map/tile-defs";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { planNeutralActivation } from "./neutral-ai";
import type { GameAction, GameEvent, GameState, PlayerId } from "./state";
import { NEUTRAL_PLAYER_ID } from "./state";

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
    const playerId = current.reactionWindow.priorityPlayerId;
    current = applyOk(current, { type: "PASS_REACTION", playerId });
  }
  return current;
}

function keepRollsAndPassWindows(state: GameState): GameState {
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

function scriptDice(state: GameState, rolls: number[]): void {
  state.combat!.dice.scriptedRolls = rolls;
  state.combat!.dice.rollCount = 0;
}

function attackRolls(state: GameState): Extract<GameEvent, { type: "ATTACK_ROLLED" }>[] {
  return state.eventLog.filter(
    (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> => event.type === "ATTACK_ROLLED"
  );
}

/**
 * Liches setup: p1's marksmen become a pack of Liches (ranged, Death Cloud).
 * Board: liches at 1, target skeletons at 13, vampires at 14 and dread
 * knights at 17 sit adjacent to the target.
 */
function lichState(): GameState {
  const state = createInitialGameState();
  const liches = state.combat!.units.unit_p1_marksmen;
  liches.name = "Liches";
  liches.cardName = "Pack of Liches";
  liches.abilities = ["lich-death-cloud"];
  liches.attack = 1;
  state.combat!.units.unit_p2_dread_knights.position = 17;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  setActive(state, "p1", "unit_p1_marksmen");
  return state;
}

describe("liches' death cloud (second attack)", () => {
  it("asks for a target adjacent to the original, opens instants, and rolls at attack 2", () => {
    let state = lichState();
    // The defender holds a Defense statistic: instant windows must open on
    // the Death Cloud attack too, so the card could be played against it.
    state.players.p2.hand = ["stat.defense"];
    scriptDice(state, [0, 1]);

    state = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_skeletons"
    });
    state = keepRollsAndPassWindows(state);

    // The primary attack resolved; the Death Cloud target choice is open.
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") {
      return;
    }
    expect(choice.kind).toBe("second-attack");
    expect(choice.playerId).toBe("p1");
    expect(new Set(choice.candidateUnitIds)).toEqual(
      new Set(["unit_p2_vampires", "unit_p2_dread_knights"])
    );

    // The chooser appears in the legal actions for the table UI.
    const legal = getLegalActions(state, "p1");
    expect(legal.some((entry) => entry.action.type === "CHOOSE_ABILITY_TARGET")).toBe(true);

    state = applyOk(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p2_vampires"
    });

    // The second attack is a full attack: an instant window opens before the
    // die rolls (attack/defense buffs can be played on it).
    expect(state.reactionWindow).not.toBeNull();
    const declared = state.eventLog.filter(
      (event): event is Extract<GameEvent, { type: "UNIT_ATTACK_DECLARED" }> =>
        event.type === "UNIT_ATTACK_DECLARED"
    );
    expect(declared.at(-1)?.abilityAttack?.baseAttack).toBe(2);

    state = keepRollsAndPassWindows(state);

    const rolls = attackRolls(state);
    expect(rolls).toHaveLength(2);
    // "For the purpose of this attack, your attack is 2": 2 + die(+1) = 3.
    expect(rolls[1].attackValue).toBe(3);
    const vampires = state.combat!.units.unit_p2_vampires;
    // 3 attack vs vampire defense (1): 2 damage.
    expect(vampires.damage).toBe(2);
    // The Liches never chain a third attack.
    expect(state.pendingChoice).toBeNull();
  });

  it("must hit a lone friendly unit adjacent to the target", () => {
    let state = lichState();
    // Only the liches' own griffins stand next to the target.
    state.combat!.units.unit_p2_vampires.position = 3;
    state.combat!.units.unit_p2_dread_knights.position = 19;
    state.combat!.units.unit_p1_griffins.position = 9;
    scriptDice(state, [0, 1]);

    state = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_skeletons"
    });
    state = keepRollsAndPassWindows(state);

    // A single candidate: the second attack fires without a choice — into
    // the friendly griffins (wiki FAQ: mandatory).
    const rolls = attackRolls(state);
    expect(rolls).toHaveLength(2);
    expect(rolls[1].defenderId).toBe("unit_p1_griffins");
    expect(state.combat!.units.unit_p1_griffins.damage).toBeGreaterThan(0);
  });

  it("defers the original target's retaliation until after the second attack, and offers the liches themselves", () => {
    let state = lichState();
    const liches = state.combat!.units.unit_p1_marksmen;
    liches.position = 9; // adjacent to the skeletons at 13
    state.combat!.units.unit_p2_vampires.position = 14;
    state.combat!.units.unit_p2_dread_knights.position = 19;
    scriptDice(state, [-1, 0, 0]);

    state = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_skeletons"
    });
    state = keepRollsAndPassWindows(state);

    const choice = state.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") {
      return;
    }
    // Adjacent to the target: the vampires — and the liches themselves.
    expect(new Set(choice.candidateUnitIds)).toEqual(new Set(["unit_p2_vampires", "unit_p1_marksmen"]));

    state = applyOk(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p2_vampires"
    });
    state = keepRollsAndPassWindows(state);

    // FAQ: both attacks resolve first, only then the original target
    // retaliates (the second target never retaliates on the 4x5 board).
    const rolls = attackRolls(state);
    expect(rolls).toHaveLength(3);
    expect(rolls[2].isRetaliation).toBe(true);
    expect(rolls[2].attackerId).toBe("unit_p2_skeletons");
    expect(rolls[2].defenderId).toBe("unit_p1_marksmen");
    const retaliationEvent = state.eventLog.find((event) => event.type === "RETALIATION_ATTACKED");
    expect(retaliationEvent).toBeTruthy();
  });
});

describe("magog fireball splash", () => {
  function magogState(): GameState {
    const state = createInitialGameState();
    const magogs = state.combat!.units.unit_p1_marksmen;
    magogs.name = "Magogs";
    magogs.cardName = "Pack of Magogs";
    magogs.abilities = ["magog-fireball-splash"];
    magogs.attack = 1;
    state.combat!.units.unit_p2_dread_knights.position = 17;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    setActive(state, "p1", "unit_p1_marksmen");
    return state;
  }

  it("deals 1 flat damage to one chosen unit adjacent to the target", () => {
    let state = magogState();
    scriptDice(state, [0]);

    state = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_skeletons"
    });
    state = keepRollsAndPassWindows(state);

    const choice = state.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") {
      return;
    }
    expect(choice.kind).toBe("flat-damage");
    expect(new Set(choice.candidateUnitIds)).toEqual(
      new Set(["unit_p2_vampires", "unit_p2_dread_knights"])
    );

    state = applyOk(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p2_dread_knights"
    });

    // Flat 1 damage, no die roll, no further attack.
    expect(state.combat!.units.unit_p2_dread_knights.damage).toBe(1);
    expect(state.combat!.units.unit_p2_vampires.damage).toBe(0);
    expect(attackRolls(state)).toHaveLength(1);
    expect(state.pendingChoice).toBeNull();
  });

  it("does not splash when the magogs shoot an adjacent target", () => {
    let state = magogState();
    state.combat!.units.unit_p1_marksmen.position = 9; // adjacent to 13
    scriptDice(state, [-1, -1]);

    state = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_skeletons"
    });
    state = keepRollsAndPassWindows(state);

    const abilityChoices = state.eventLog.filter(
      (event) => event.type === "PENDING_CHOICE_CREATED" && event.choiceType === "ABILITY_TARGET_CHOICE"
    );
    expect(abilityChoices).toHaveLength(0);
  });

  it("must splash a lone adjacent friendly unit", () => {
    let state = magogState();
    state.combat!.units.unit_p2_vampires.position = 3;
    state.combat!.units.unit_p2_dread_knights.position = 19;
    state.combat!.units.unit_p1_griffins.position = 9;
    scriptDice(state, [0]);

    state = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_marksmen",
      defenderId: "unit_p2_skeletons"
    });
    state = keepRollsAndPassWindows(state);

    expect(state.combat!.units.unit_p1_griffins.damage).toBe(1);
    expect(state.pendingChoice).toBeNull();
  });
});

describe("cerberi second head", () => {
  it("deals 1 flat damage to another enemy adjacent to the cerberi, never the target", () => {
    const state = createInitialGameState();
    const cerberi = state.combat!.units.unit_p1_griffins;
    cerberi.name = "Cerberi";
    cerberi.cardName = "Pack of Cerberi";
    cerberi.type = "ground";
    cerberi.abilities = ["ignores-retaliation", "cerberi-second-head"];
    cerberi.attack = 1;
    cerberi.position = 9;
    state.combat!.units.unit_p2_skeletons.position = 13; // the bite target
    state.combat!.units.unit_p2_vampires.position = 10; // adjacent to cerberi
    state.combat!.units.unit_p2_dread_knights.position = 19;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    setActive(state, "p1", "unit_p1_griffins");
    scriptDice(state, [0]);

    let next = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    next = keepRollsAndPassWindows(next);

    // One enemy adjacent to the cerberi (the vampires): the hit lands
    // without a choice and the target itself is never the extra victim.
    expect(next.combat!.units.unit_p2_vampires.damage).toBe(1);
    expect(attackRolls(next)).toHaveLength(1);
    // Ignores retaliation: the skeletons never strike back.
    expect(next.eventLog.some((event) => event.type === "RETALIATION_ATTACKED")).toBe(false);
  });
});

describe("neutral AI target ties", () => {
  it("pauses on equally valid targets so the player chooses, then commits to the pick", () => {
    const state = createInitialGameState();
    const combat = state.combat!;
    // The skeletons become a neutral guard flanked by two equal targets.
    const guard = combat.units.unit_p2_skeletons;
    guard.controllerId = NEUTRAL_PLAYER_ID;
    guard.position = 9;
    combat.units.unit_p1_marksmen.position = 5;
    combat.units.unit_p1_griffins.position = 13;
    // Same tier, same distance: a rulebook tie.
    combat.units.unit_p1_marksmen.grade = "bronze";
    combat.units.unit_p1_griffins.grade = "bronze";
    combat.units.unit_p1_crusaders.position = 19;
    combat.units.unit_p2_vampires.position = 16;
    combat.units.unit_p2_dread_knights.position = 18;

    const intent = planNeutralActivation(state, combat, guard);
    expect(intent.kind).toBe("choose-target");
    if (intent.kind !== "choose-target") {
      return;
    }
    expect(new Set(intent.candidateIds)).toEqual(new Set(["unit_p1_marksmen", "unit_p1_griffins"]));

    // With the tie resolved, the guard attacks the chosen unit.
    const committed = planNeutralActivation(state, combat, guard, "unit_p1_griffins");
    expect(committed).toEqual({ kind: "attack", defenderId: "unit_p1_griffins" });
  });
});

describe("printed tile borders", () => {
  it("maps S1's verified yellow lines to full arcs plus the blocked-field ring", () => {
    const segments = getTileBorderSegments(coreTileDefinitions.S1);
    const keys = new Set(segments.map((segment) => `${segment.slot}:${segment.edge}`));
    // Outer arcs: E, SE, SW directions and the blocked NW field.
    for (const slot of [2, 3, 4, 6]) {
      const direction = slot - 1;
      expect(keys.has(`${slot}:${(direction + 5) % 6}`)).toBe(true);
      expect(keys.has(`${slot}:${direction}`)).toBe(true);
      expect(keys.has(`${slot}:${(direction + 1) % 6}`)).toBe(true);
    }
    // The blocked NW field is ringed completely (inner edges included).
    expect(keys.has("6:1")).toBe(true);
    expect(keys.has("6:2")).toBe(true);
    expect(keys.has("6:3")).toBe(true);
    expect(segments).toHaveLength(15);
  });

  it("draws NO borders on a Creature Bank field by default", () => {
    // S1's Blocked Field is slot 6 (NW). Carved into a Creature Bank, by default
    // the field is border-free: none of its six edges are drawn, so it reads as
    // fully open. A plain (non-bank) blocked field keeps all its borders.
    const plainKeys = new Set(getTileBorderSegments(coreTileDefinitions.S1).map((s) => `${s.slot}:${s.edge}`));
    const bankKeys = new Set(
      getTileBorderSegments(coreTileDefinitions.S1, new Set([6])).map((s) => `${s.slot}:${s.edge}`)
    );
    for (const edge of ["6:0", "6:1", "6:2", "6:3", "6:4", "6:5"]) {
      // Every edge is present for a plain blocked field, gone for a bank.
      expect(plainKeys.has(edge)).toBe(true);
      expect(bankKeys.has(edge), `bank slot edge ${edge} should be hidden by default`).toBe(false);
    }
  });

  it("with borders toggled on, a Creature Bank keeps only its outer arc (open inward)", () => {
    // showBankBorders=true restores the classic outline: the three edges the bank
    // shares with the centre/ring neighbours stay OPEN (you walk in from within
    // the tile), while the outer arc that seals it from the adjacent tile stays.
    const bankKeys = new Set(
      getTileBorderSegments(coreTileDefinitions.S1, new Set([6]), true).map((s) => `${s.slot}:${s.edge}`)
    );
    for (const inner of ["6:1", "6:2", "6:3"]) {
      expect(bankKeys.has(inner), `inner edge ${inner} stays open`).toBe(false);
    }
    for (const outer of ["6:4", "6:5", "6:0"]) {
      expect(bankKeys.has(outer), `outer arc ${outer} is drawn`).toBe(true);
    }
  });

  it("computes the shared hex edge of two slots", () => {
    expect(internalBorderSegment(0, 3)).toEqual({ slot: 0, edge: 2 });
    expect(internalBorderSegment(1, 2)).toEqual({ slot: 1, edge: 2 });
    expect(internalBorderSegment(6, 1)).toEqual({ slot: 6, edge: 1 });
    // Non-adjacent ring slots share no edge.
    expect(internalBorderSegment(1, 4)).toBeNull();
  });
});

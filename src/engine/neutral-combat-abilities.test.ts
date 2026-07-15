import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { abilityFxPlans } from "@/data/fx";
import type { GameAction, GameEvent, GameState, PlayerId } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 30;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** Pass instant windows and keep attack rolls; stop on an ability-target choice. */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 40;
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

function declaredAttacks(state: GameState): Extract<GameEvent, { type: "UNIT_ATTACK_DECLARED" }>[] {
  return state.eventLog.filter(
    (event): event is Extract<GameEvent, { type: "UNIT_ATTACK_DECLARED" }> => event.type === "UNIT_ATTACK_DECLARED"
  );
}

function script(state: GameState, rolls: number[]): void {
  state.combat!.dice.scriptedRolls = rolls;
  state.combat!.dice.rollCount = 0;
}

describe("Gold Dragon line attack", () => {
  it("strikes the unit directly behind the target as a separate attack", () => {
    const state = createInitialGameState();
    const dragon = state.combat!.units.unit_p1_griffins;
    dragon.name = "Gold Dragon";
    dragon.cardName = "Gold Dragons";
    dragon.type = "flying";
    dragon.abilities = ["dragon-line-attack-3"];
    dragon.attack = 4;
    dragon.position = 9; // row 2, col 1
    state.combat!.units.unit_p2_skeletons.position = 13; // directly below (the target)
    state.combat!.units.unit_p2_vampires.position = 17; // directly behind the target
    state.combat!.units.unit_p2_dread_knights.position = 19; // out of the way
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    script(state, [1, 1, 1, 1]);
    setActive(state, "p1", "unit_p1_griffins");

    const next = settle(
      applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_skeletons"
      })
    );

    const lineAttack = declaredAttacks(next).find((event) => event.abilityAttack?.abilityId === "dragon-line-attack-3");
    expect(lineAttack).toBeDefined();
    expect(lineAttack?.defenderId).toBe("unit_p2_vampires");
    expect(lineAttack?.abilityAttack?.baseAttack).toBe(3);
  });

  it("does nothing when no unit stands behind the target", () => {
    const state = createInitialGameState();
    const dragon = state.combat!.units.unit_p1_griffins;
    dragon.type = "flying";
    dragon.abilities = ["dragon-line-attack-2"];
    dragon.position = 9;
    state.combat!.units.unit_p2_skeletons.position = 13;
    state.combat!.units.unit_p2_vampires.position = 19; // not behind the target
    state.combat!.units.unit_p2_dread_knights.position = 18;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    script(state, [1, 1, 1, 1]);
    setActive(state, "p1", "unit_p1_griffins");

    const next = settle(
      applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_skeletons"
      })
    );
    expect(declaredAttacks(next).some((event) => event.abilityAttack?.abilityId?.startsWith("dragon-line-attack"))).toBe(
      false
    );
  });
});

describe("paralysis-inflicting abilities", () => {
  function paralysisState(abilities: string[], rolls: number[]): GameState {
    const state = createInitialGameState();
    const attacker = state.combat!.units.unit_p1_marksmen; // ranged, shoots from afar — no retaliation
    attacker.abilities = abilities;
    attacker.attack = 3;
    attacker.position = 1;
    const target = state.combat!.units.unit_p2_skeletons;
    target.position = 13; // non-adjacent: a ranged attack, so no retaliation
    target.maxHealth = 20; // survive the hit so the token can land
    target.damage = 0;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    script(state, rolls);
    setActive(state, "p1", "unit_p1_marksmen");
    return state;
  }

  function hasParalysis(state: GameState, unitId: string): boolean {
    return (state.combat?.units[unitId].tokens ?? []).some((token) => token.kind === "paralysis");
  }

  it("Azure Dragon paralyses the target on a '-1' attack roll", () => {
    const next = settle(
      applyOk(paralysisState(["azure-dragon-paralysis"], [-1, 0, 0]), {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_marksmen",
        defenderId: "unit_p2_skeletons"
      })
    );
    expect(hasParalysis(next, "unit_p2_skeletons")).toBe(true);
  });

  it("Azure Dragon does NOT paralyse on a non-'-1' roll", () => {
    const next = settle(
      applyOk(paralysisState(["azure-dragon-paralysis"], [1, 0, 0]), {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_marksmen",
        defenderId: "unit_p2_skeletons"
      })
    );
    expect(hasParalysis(next, "unit_p2_skeletons")).toBe(false);
  });

  it("the Azure Dragon paralysis fires an ability event the FX layer can animate (sprite + sound)", () => {
    // The table draws a unit ability's animation/sound from
    // abilityFxPlans[event.abilityId]. So the paralysis is only SEEN/HEARD when
    // (a) the engine logs the paralysis under that exact ability id, and (b) a
    // plan is keyed there. Assert both, on the same '-1' roll that lands the
    // token — the link the user's "play animation and sound when paralyze" needs.
    const next = settle(
      applyOk(paralysisState(["azure-dragon-paralysis"], [-1, 0, 0]), {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_marksmen",
        defenderId: "unit_p2_skeletons"
      })
    );
    expect(hasParalysis(next, "unit_p2_skeletons")).toBe(true);
    const paralysisEvent = next.eventLog.find(
      (event): event is Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }> =>
        event.type === "UNIT_ABILITY_TRIGGERED" &&
        event.abilityId === "azure-dragon-paralysis" &&
        event.targetUnitId === "unit_p2_skeletons"
    );
    expect(paralysisEvent, "azure dragon must log its paralysis under its ability id").toBeTruthy();
    const plan = abilityFxPlans[paralysisEvent!.abilityId];
    expect(plan, "abilityFxPlans must answer the azure-dragon-paralysis event").toBeTruthy();
    expect(plan.affect?.[0]?.key).toBe("paralyze");
    expect(plan.sound).toBe("spells/paralyze");
  });

  it("Basilisk rolls an extra die and paralyses on a '0'", () => {
    // First roll resolves the attack (+1), the second is the Stone Gaze die (0).
    // The landed stare logs under the bare ability id (Death-Stare style split)
    // so abilityFxPlans can freeze the target without flashing on a miss.
    const next = settle(
      applyOk(paralysisState(["basilisk-paralysis"], [1, 0, 0]), {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_marksmen",
        defenderId: "unit_p2_skeletons"
      })
    );
    expect(hasParalysis(next, "unit_p2_skeletons")).toBe(true);
    const paralysisEvent = next.eventLog.find(
      (event): event is Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }> =>
        event.type === "UNIT_ABILITY_TRIGGERED" &&
        event.abilityId === "basilisk-paralysis" &&
        event.targetUnitId === "unit_p2_skeletons"
    );
    expect(paralysisEvent, "neutral Basilisk must log its paralysis under its ability id").toBeTruthy();
    expect(paralysisEvent!.dice?.success).toBe(true);
    const plan = abilityFxPlans[paralysisEvent!.abilityId];
    expect(plan, "abilityFxPlans must answer the basilisk-paralysis land event").toBeTruthy();
    expect(plan.affect?.[0]?.key).toBe("paralyze");
    expect(plan.sound).toBe("spells/paralyze");
  });

  it("a missed Basilisk Stone Gaze announces under basilisk-paralysis-roll (no freeze FX)", () => {
    // Attack +1, gaze die +1 → miss. The bare ability id must NOT fire.
    const next = settle(
      applyOk(paralysisState(["basilisk-paralysis"], [1, 1, 0]), {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_marksmen",
        defenderId: "unit_p2_skeletons"
      })
    );
    expect(hasParalysis(next, "unit_p2_skeletons")).toBe(false);
    expect(
      next.eventLog.some(
        (event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "basilisk-paralysis"
      )
    ).toBe(false);
    const miss = next.eventLog.find(
      (event): event is Extract<GameEvent, { type: "UNIT_ABILITY_TRIGGERED" }> =>
        event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "basilisk-paralysis-roll"
    );
    expect(miss?.dice?.success).toBe(false);
    expect(abilityFxPlans["basilisk-paralysis-roll"]).toBeUndefined();
  });
});

describe("Hydra second attack", () => {
  function hydraState(): GameState {
    const state = createInitialGameState();
    const hydra = state.combat!.units.unit_p1_griffins;
    hydra.name = "Hydra";
    hydra.cardName = "Hydras";
    hydra.type = "ground";
    hydra.abilities = ["ignores-retaliation", "hydra-multi-attack"];
    hydra.attack = 7;
    hydra.position = 9; // row 2, col 1
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    setActive(state, "p1", "unit_p1_griffins");
    return state;
  }

  it("auto-attacks the only other adjacent enemy at its own attack value", () => {
    const state = hydraState();
    state.combat!.units.unit_p2_skeletons.position = 13; // primary target (below)
    state.combat!.units.unit_p2_vampires.position = 10; // the one other adjacent enemy (right)
    state.combat!.units.unit_p2_dread_knights.position = 19; // far away
    script(state, [1, 1, 1, 1]);

    const next = settle(
      applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_skeletons"
      })
    );
    const follow = declaredAttacks(next).find((event) => event.abilityAttack?.abilityId === "hydra-multi-attack");
    expect(follow).toBeDefined();
    expect(follow?.defenderId).toBe("unit_p2_vampires");
    expect(follow?.abilityAttack?.baseAttack).toBe(7);
  });

  it("lets the attacker choose the second target when several adjacent enemies qualify", () => {
    const state = hydraState();
    state.combat!.units.unit_p2_skeletons.position = 13; // primary
    state.combat!.units.unit_p2_vampires.position = 10; // adjacent option
    state.combat!.units.unit_p2_dread_knights.position = 8; // adjacent option
    script(state, [1, 1, 1, 1]);

    const next = settle(
      applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_skeletons"
      })
    );
    const choice = next.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") {
      return;
    }
    expect(choice.kind).toBe("second-attack");
    expect(new Set(choice.candidateUnitIds)).toEqual(new Set(["unit_p2_vampires", "unit_p2_dread_knights"]));
    // The attacker can resolve it from the legal actions.
    expect(getLegalActions(next, "p1").some((entry) => entry.action.type === "CHOOSE_ABILITY_TARGET")).toBe(true);
  });
});

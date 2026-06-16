import { describe, expect, it } from "vitest";
import {
  applyAction,
  createInitialGameState,
  getLegalActions,
  isUnitAlive,
  makeActiveEffect,
  unitDealsElementalDamage
} from "./index";
import {
  soundDurationMs,
  spellFxPlans,
  spellPresentationMs,
  spriteDurationMs
} from "@/data/fx";
import type { ActiveEffectModifier, GameAction, GameState, UnitId } from "./state";

/**
 * Engine tests for the Clone spell (Expert Water, Cove Expansion). Every rule is
 * engine-enforced; each test fails if the wiring is removed.
 *
 *  - Places a 1-Health copy of one of your units on an adjacent empty space.
 *  - The Clone copies everything PRINTED on the original's card (statistics,
 *    type, printed abilities, art) but NONE of the ongoing effects/tokens on it.
 *  - The Clone is destroyed by ANY damage, by being attacked (even for 0 damage,
 *    so it never lives to retaliate), and when its original leaves the board.
 *  - The reachable grade of the cloned unit rises with the Power paid
 *    (1 → bronze, 3 → silver, 5 → gold); below Power 1 nothing is cloned.
 *  - Offered only on a friendly unit that has an adjacent empty space.
 *
 * Sandbox grades/types (createInitialGameState):
 *   p1 marksmen bronze/ranged, griffins bronze/flying, crusaders silver/ground;
 *   p2 skeletons bronze/ground, vampires silver/flying, dread_knights gold/ground.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
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

/** Passes reactions and resolves any attack-die reroll choice that pauses an attack. */
function settle(state: GameState): GameState {
  let current = state;
  let safety = 60;
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

/**
 * Combat where p1's marksmen is active and the griffins (bronze) sit in the open
 * with four empty orthogonal neighbours; the other units are well clear, and p1
 * holds Clone plus spare Power.
 */
function cloneScene(seed: string): GameState {
  const state = createInitialGameState(seed);
  state.combat!.obstacles = [];
  const units = state.combat!.units;
  units.unit_p1_marksmen.position = 0; // r0c0
  units.unit_p1_griffins.position = 5; // r1c1 — neighbours 1, 9, 4, 6 all empty
  units.unit_p1_crusaders.position = 2; // r0c2
  units.unit_p2_skeletons.position = 16; // r4c0
  units.unit_p2_vampires.position = 17; // r4c1
  units.unit_p2_dread_knights.position = 18; // r4c2
  for (const id of Object.keys(units)) {
    units[id].activatedThisRound = false;
    units[id].movedThisActivation = false;
  }
  state.players.p1.hand = ["spell.clone", "stat.power", "stat.power", "stat.power", "stat.power", "stat.power"];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";
  state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
  state.combat!.dice.rollCount = 0;
  return state;
}

function findCloneCast(state: GameState, targetUnitId: UnitId) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "CAST_SPELL" &&
      legal.action.cardId === "spell.clone" &&
      legal.action.target?.type === "unit" &&
      legal.action.target.unitId === targetUnitId
  );
}

/** Casts Clone on a friendly unit at the given Power, resolving it on the stack. */
function castCloneOn(state: GameState, targetUnitId: UnitId, power: number): GameState {
  const cast = findCloneCast(state, targetUnitId);
  expect(cast, `Clone should be a legal cast on ${targetUnitId}`).toBeTruthy();
  const casted = applyOk(state, cast!.action);
  // Spare Power statistics open the Empower window; the test pays `power` into it.
  casted.stack[0]!.modifiers.spellPowerBonus = power;
  return passAllReactions(casted);
}

/** The pending combat-clone destination choice, or null if the cast did not open one. */
function cloneChoice(state: GameState) {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "OPTION_CHOICE" || choice.context !== "combat-clone" || !choice.clone) {
    return null;
  }
  return choice;
}

/** Resolves the destination pick, dropping the Clone Token on positions[optionIndex]. */
function placeClone(state: GameState, optionIndex = 0): GameState {
  const choice = cloneChoice(state);
  expect(choice, "expected a combat-clone destination choice").toBeTruthy();
  return applyOk(state, {
    type: "CHOOSE_OPTION",
    playerId: "p1",
    choiceId: choice!.id,
    optionIndex
  });
}

function findClone(state: GameState) {
  return Object.values(state.combat!.units).find((unit) => Boolean(unit.cloneOfUnitId));
}

/** Casts + places a Clone of `targetUnitId` and returns the new combat state and ids. */
function cloneAndPlace(
  state: GameState,
  targetUnitId: UnitId,
  power: number,
  optionIndex = 0
): { state: GameState; cloneId: UnitId } {
  const resolved = placeClone(castCloneOn(state, targetUnitId, power), optionIndex);
  const clone = findClone(resolved);
  expect(clone, "a Clone Token should have been placed").toBeTruthy();
  return { state: resolved, cloneId: clone!.id };
}

function elementalEffect(state: GameState, unitId: UnitId): void {
  const effect = makeActiveEffect(
    state,
    {
      name: "Elemental (granted)",
      scope: "unit",
      duration: { type: "combat" },
      modifiers: [{ type: "ELEMENTAL_DAMAGE" } satisfies ActiveEffectModifier]
    },
    { type: "system" },
    "p1",
    { type: "unit", unitId }
  );
  state.activeEffects.push(effect);
}

/** Resolves a melee attack by `attackerId` (controlled by p2) on `defenderId`. */
function enemyAttack(state: GameState, attackerId: UnitId, defenderId: UnitId, attackerAttack: number): GameState {
  const next: GameState = { ...state };
  const combat = next.combat!;
  const attacker = combat.units[attackerId];
  attacker.attack = attackerAttack;
  attacker.abilities = [];
  attacker.activatedThisRound = false;
  attacker.movedThisActivation = false;
  attacker.attackedThisActivation = false;
  attacker.retaliatedThisRound = false;
  next.activePlayerId = "p2";
  next.players.p1.hand = [];
  next.players.p2.hand = [];
  combat.activeUnitId = attackerId;
  combat.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
  combat.dice.rollCount = 0;
  return settle(applyOk(next, { type: "ATTACK_UNIT", playerId: "p2", attackerId, defenderId }));
}

// ---------------------------------------------------------------------------
// Placement & the 1-Health copy
// ---------------------------------------------------------------------------

describe("Clone spell — placing the copy", () => {
  it("opens an adjacent-empty-space picker for the chosen friendly unit (Power 1 bronze)", () => {
    const resolved = castCloneOn(cloneScene("clone-open"), "unit_p1_griffins", 1);
    const choice = cloneChoice(resolved);
    expect(choice, "Clone should open the combat-clone destination choice").toBeTruthy();
    expect(choice!.clone!.originalUnitId).toBe("unit_p1_griffins");
    // Only the griffins' four empty orthogonal neighbours are offered.
    expect([...choice!.clone!.positions].sort((a, b) => a - b)).toEqual([1, 4, 6, 9]);
  });

  it("drops a 1-Health copy of the unit on the chosen adjacent space", () => {
    const scene = cloneScene("clone-place");
    const original = scene.combat!.units.unit_p1_griffins;
    const { state, cloneId } = cloneAndPlace(scene, "unit_p1_griffins", 1);
    const clone = state.combat!.units[cloneId];

    expect(clone.cloneOfUnitId).toBe("unit_p1_griffins");
    expect(clone.maxHealth).toBe(1);
    expect(clone.damage).toBe(0);
    expect(clone.controllerId).toBe("p1");
    expect(clone.summoned).toBe(true);
    expect(clone.armyUnitId).toBeUndefined();
    // The original stays put on its own cell.
    expect(state.combat!.units.unit_p1_griffins.position).toBe(5);
    // Landed on one of the griffins' empty neighbours.
    expect([1, 4, 6, 9]).toContain(clone.position);

    // Copies everything printed on the card: statistics, type, variant, grade.
    expect(clone.attack).toBe(original.attack);
    expect(clone.defense).toBe(original.defense);
    expect(clone.initiative).toBe(original.initiative);
    expect(clone.type).toBe(original.type);
    expect(clone.variant).toBe(original.variant);
    expect(clone.grade).toBe(original.grade);
    expect(clone.abilities).toEqual(original.abilities);
  });

  it("the Clone Token shows the cloned unit's own art (cropped into the board token)", () => {
    const scene = cloneScene("clone-art");
    const original = scene.combat!.units.unit_p1_griffins;
    const { state, cloneId } = cloneAndPlace(scene, "unit_p1_griffins", 1);
    expect(state.combat!.units[cloneId].assets?.cardImage).toBe(original.assets?.cardImage);
  });

  it("does not spend the cloned unit's activation, and the Clone can act on its own initiative", () => {
    const { state, cloneId } = cloneAndPlace(cloneScene("clone-acts"), "unit_p1_griffins", 1);
    // Clone is the caster's spell, not the griffins' turn.
    expect(state.combat!.units.unit_p1_griffins.activatedThisRound).toBe(false);
    // The fresh Clone has not acted yet — it stands ready in the round.
    expect(state.combat!.units[cloneId].activatedThisRound).toBe(false);
    expect(isUnitAlive(state.combat!.units[cloneId])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Excludes the ongoing effects / tokens layered on the original
// ---------------------------------------------------------------------------

describe("Clone spell — copies the printed card, not the effects on the original", () => {
  it("does not inherit a granted ability (elemental damage) layered on the original", () => {
    const scene = cloneScene("clone-effects");
    // Grant the griffins elemental damage via an ongoing EFFECT (not printed).
    elementalEffect(scene, "unit_p1_griffins");
    const { state, cloneId } = cloneAndPlace(scene, "unit_p1_griffins", 1);

    // The original now deals elemental damage; the Clone (rebuilt from the printed
    // card) does not — the granted effect was not copied.
    expect(unitDealsElementalDamage(state, state.combat!.units.unit_p1_griffins)).toBe(true);
    expect(unitDealsElementalDamage(state, state.combat!.units[cloneId])).toBe(false);
    // No active effect is scoped to the Clone.
    const onClone = state.activeEffects.filter(
      (effect) => effect.target?.type === "unit" && effect.target.unitId === cloneId
    );
    expect(onClone).toEqual([]);
  });

  it("does not inherit combat tokens sitting on the original", () => {
    const scene = cloneScene("clone-tokens");
    scene.combat!.units.unit_p1_griffins.tokens = [
      { id: "tk", kind: "attack", amount: 2, sourceName: "Ogres" }
    ];
    const { state, cloneId } = cloneAndPlace(scene, "unit_p1_griffins", 1);
    expect(state.combat!.units.unit_p1_griffins.tokens?.length).toBe(1);
    expect(state.combat!.units[cloneId].tokens ?? []).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Grade gate (Power 1/3/5 → bronze/silver/gold)
// ---------------------------------------------------------------------------

describe("Clone spell — grade gate by Power", () => {
  it("Power 0 clones nothing (no tier below Power 1)", () => {
    expect(cloneChoice(castCloneOn(cloneScene("clone-p0"), "unit_p1_griffins", 0))).toBeNull();
  });

  it("Power 1 reaches a bronze unit but not a silver one", () => {
    expect(cloneChoice(castCloneOn(cloneScene("clone-bronze"), "unit_p1_griffins", 1))).toBeTruthy();
    // crusaders is silver — out of reach at Power 1.
    expect(cloneChoice(castCloneOn(cloneScene("clone-silver-gated"), "unit_p1_crusaders", 1))).toBeNull();
  });

  it("Power 3 reaches a silver unit; Power 5 reaches a gold unit", () => {
    expect(cloneChoice(castCloneOn(cloneScene("clone-silver"), "unit_p1_crusaders", 3))).toBeTruthy();

    const goldScene = cloneScene("clone-gold");
    goldScene.combat!.units.unit_p1_crusaders.grade = "gold";
    expect(cloneChoice(castCloneOn(goldScene, "unit_p1_crusaders", 3)), "gold is out of reach at Power 3").toBeNull();

    const goldPowered = cloneScene("clone-gold-powered");
    goldPowered.combat!.units.unit_p1_crusaders.grade = "gold";
    expect(cloneChoice(castCloneOn(goldPowered, "unit_p1_crusaders", 5)), "Power 5 reaches gold").toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Destruction rules
// ---------------------------------------------------------------------------

describe("Clone spell — the Clone is fragile", () => {
  it("is destroyed by even 1 point of damage that a full stack would shrug off (it has 1 Health)", () => {
    const scene = cloneScene("clone-damage");
    const { state, cloneId } = cloneAndPlace(scene, "unit_p1_griffins", 1, 0);
    const clone = state.combat!.units[cloneId];
    // A full griffins stack has more than 1 Health, so a single point of damage
    // would never kill the real unit — but it destroys the 1-Health Clone.
    expect(clone.maxHealth).toBe(1);
    expect(state.combat!.units.unit_p1_griffins.maxHealth).toBeGreaterThan(1);
    clone.position = 8; // r2c0
    clone.defense = 0; // a clean 1 damage from a 1-Attack strike, die 0
    state.combat!.units.unit_p2_skeletons.position = 9; // r2c1 — adjacent
    const after = enemyAttack(state, "unit_p2_skeletons", cloneId, 1);
    expect(isUnitAlive(after.combat!.units[cloneId])).toBe(false);
    // The original is untouched.
    expect(isUnitAlive(after.combat!.units.unit_p1_griffins)).toBe(true);
  });

  it("is destroyed by being attacked even for 0 damage, and never retaliates", () => {
    const scene = cloneScene("clone-zero-damage");
    const { state, cloneId } = cloneAndPlace(scene, "unit_p1_griffins", 1, 0);
    const clone = state.combat!.units[cloneId];
    clone.position = 8; // r2c0
    clone.defense = 5; // soak the puny attack to exactly 0 damage
    state.combat!.units.unit_p2_skeletons.position = 9; // adjacent

    const after = enemyAttack(state, "unit_p2_skeletons", cloneId, 1); // 1 - 5 - 0 = 0 damage
    // Attacked for 0 damage → still destroyed.
    expect(isUnitAlive(after.combat!.units[cloneId])).toBe(false);
    // And it was removed before it could retaliate: the attacker is unscathed.
    expect(after.combat!.units.unit_p2_skeletons.damage).toBe(0);
  });

  it("is removed from the board when its original is removed", () => {
    const scene = cloneScene("clone-original-dies");
    // A griffins that will be removed cleanly (a Few, low Health, no rebirth).
    scene.combat!.units.unit_p1_griffins.variant = "few";
    scene.combat!.units.unit_p1_griffins.maxHealth = 2;
    scene.combat!.units.unit_p1_griffins.abilities = [];
    const { state, cloneId } = cloneAndPlace(scene, "unit_p1_griffins", 1, 0);

    // Park the Clone far away so it is not itself the one being attacked.
    state.combat!.units[cloneId].position = 12; // r3c0
    // Kill the ORIGINAL with an adjacent skeleton.
    state.combat!.units.unit_p1_griffins.position = 8; // r2c0
    state.combat!.units.unit_p2_skeletons.position = 9; // adjacent
    const after = enemyAttack(state, "unit_p2_skeletons", "unit_p1_griffins", 20);

    expect(isUnitAlive(after.combat!.units.unit_p1_griffins)).toBe(false);
    // The Clone goes with its original.
    expect(isUnitAlive(after.combat!.units[cloneId])).toBe(false);
    expect(
      after.eventLog.some((event) => event.type === "UNIT_REMOVED" && event.unitId === cloneId)
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Offering rules
// ---------------------------------------------------------------------------

describe("Clone spell — offered only where it can land", () => {
  it("is offered on a unit with an adjacent empty space", () => {
    expect(findCloneCast(cloneScene("clone-offer"), "unit_p1_griffins")).toBeTruthy();
  });

  it("is not offered on a friendly unit hemmed in with no empty neighbour", () => {
    const state = cloneScene("clone-hemmed");
    const units = state.combat!.units;
    units.unit_p1_crusaders.position = 0; // r0c0 — neighbours 1 and 4 only
    units.unit_p1_griffins.position = 1; // r0c1 — blocks the crusaders' right
    units.unit_p1_marksmen.position = 4; // r1c0 — blocks the crusaders' down
    expect(findCloneCast(state, "unit_p1_crusaders"), "no empty neighbour → no Clone").toBeFalsy();
    // The griffins still has an empty neighbour (2 or 5), so Clone is offered there.
    expect(findCloneCast(state, "unit_p1_griffins")).toBeTruthy();
  });

  it("is never offered on an enemy unit", () => {
    expect(findCloneCast(cloneScene("clone-enemy"), "unit_p2_skeletons")).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// Card metadata, deck placement & presentation (SFX/animation)
// ---------------------------------------------------------------------------

describe("Clone spell — card definition & presentation", () => {
  it("is an implemented Expert Water spell", async () => {
    const { cardLibrary } = await import("@/data/cards/library");
    const card = cardLibrary["spell.clone"];
    expect(card).toBeTruthy();
    expect(card.implementationStatus).toBe("implemented");
    expect(card.spellLevel).toBe("expert");
    expect(card.spellSchools).toEqual(["water"]);
    expect(card.effect.type).toBe("CLONE_UNIT");
  });

  it("carries the H3 clone cast sound (the token appearing on the board is the visual)", () => {
    const plan = spellFxPlans["spell.clone"];
    expect(plan, "Clone needs an FX plan").toBeTruthy();
    expect(plan.sound).toBe("spells/clone");
    expect(soundDurationMs(plan.sound)).toBeGreaterThan(0);
    // Like Teleport, no converted sprite sheet — the Clone Token is the visual.
    expect(plan.affect).toBeUndefined();
    expect(plan.hit).toBeUndefined();
    expect(plan.projectile).toBeUndefined();
    expect(spellPresentationMs(plan)).toBeGreaterThan(0);
    // Guard against a stray sprite slipping in unmeasured.
    expect(spriteDurationMs(plan.hit)).toBe(0);
  });
});

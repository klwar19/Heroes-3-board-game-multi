import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState } from "./index";
import type { GameAction, GameEvent, GameState } from "./state";
import { unitAbilities } from "@/data/units/abilities";

/**
 * USER RULE (2026-09-05), widened from Death Stare: "unit skills like
 * Thunderbird could kill the enemy before it retaliates; some neutrals may have
 * that too, even the Ghost Dragon neutral."
 *
 * THE INVARIANT PINNED HERE — for EVERY post-attack follow-up arm that can take
 * the defender off the board:
 *
 *   when the follow-up removes the defender, the parked Retaliation Attack is
 *   never DECLARED and never ROLLED, and the attacker takes no counter-damage;
 *   a PACK the follow-up only flips to its Few side is still a living unit that
 *   has not retaliated, so it DOES strike back.
 *
 * Two engine seams carry it (both mutation-checked by this file):
 *  - `runPostAttackFollowUps` (reducer.ts) runs the WHOLE step table before it
 *    calls `resumeAttackSequence`, so every arm below resolves ahead of the
 *    parked retaliation; and
 *  - `shouldRetaliate`'s `isUnitAlive(defender)` re-check inside
 *    `resumeAttackSequence`, which is what makes a removed target stay silent
 *    even though `attackSequence.retaliationPending` was latched at declaration.
 *
 * The SWEEP below is derived from the shipped ability library, so a NEW arm of
 * either removal-capable effect family is covered the day it is added.
 *
 * The Gorgons' own Death Stare has its own dedicated suite
 * (`death-stare-before-retaliation.test.ts`, incl. the reroll-window case);
 * this file is the family-wide invariant plus the named non-Gorgon cases.
 *
 * READINGS of the arms that are DELIBERATELY NOT here (each verified, none of
 * them can remove the defender before the retaliation):
 *  - the FORTRESS Wyverns / Cove Haspids "Poison" (`wyvern-poison-cube-few` /
 *    `-pack`, ON_ATTACK_POISON_CUBES) plant a cube that only deals its damage at
 *    the TARGET's own later activation — never before the retaliation. The
 *    NEUTRAL Wyverns' "Poison Sting" (`wyvern-sting`) is a DIFFERENT printed
 *    card: an immediate die-gated 1 damage, so it IS in the sweep.
 *  - step 0's flat-damage splash (Magogs, Cerberi, Kivotos Kyrie Eleison) always
 *    EXCLUDES `defender.id` from its candidates (`getFlatDamageFollowUps`), so it
 *    can only hit OTHER units — asserted below.
 *  - the Necropolis Ghost Dragons' `ghost-dragon-morale-drain` is an
 *    [activation] ability and `ghost-dragon-attack-die` a die modifier folded
 *    into the primary attack; neither is a post-attack follow-up.
 *  - Hina's `kivotos-end-of-vacation` is a Defense reduction on the primary
 *    attack (DEFENSE_REDUCTION_ON_ATTACK_DIE), not a follow-up.
 *  - the raid-boss `boss-enrage` is a flat Attack bonus; `boss-devour` is an
 *    ordinary DEATH_STARE_ON_DICE arm and IS in the sweep.
 */

/** The two effect families a follow-up can use to take the defender off the board. */
const REMOVAL_CAPABLE_FOLLOW_UP_EFFECTS = [
  "DEATH_STARE_ON_DICE",
  "ATTACK_DIE_FLAT_DAMAGE_TO_TARGET",
] as const;

type SweepArm = {
  abilityId: string;
  name: string;
  /** Dice the follow-up needs to LAND, in the order the combat stream serves them. */
  landingDice: number[];
  /** Dice that make it MISS (the CONTROL). */
  missingDice: number[];
  /** The arm judges the ATTACK's own die instead of throwing extra ones. */
  readsAttackRoll: boolean;
  /** boss-devour only fires against a bronze-or-lower target. */
  targetGradeAtMost?: string;
};

function sweepArms(): SweepArm[] {
  const arms: SweepArm[] = [];
  for (const ability of Object.values(unitAbilities)) {
    const effect = ability.effect;
    if (
      !effect ||
      ability.implementationStatus !== "implemented" ||
      !(REMOVAL_CAPABLE_FOLLOW_UP_EFFECTS as readonly string[]).includes(effect.type)
    ) {
      continue;
    }
    if (effect.type === "DEATH_STARE_ON_DICE") {
      const hit = effect.onRoll;
      const miss = hit === 1 ? 0 : 1;
      arms.push({
        abilityId: ability.id,
        name: ability.name,
        landingDice: Array.from({ length: effect.diceCount }, () => hit),
        // A single differing die is enough to miss ("on TWO -1 results").
        missingDice: Array.from({ length: effect.diceCount }, (_, index) => (index === 0 ? miss : hit)),
        readsAttackRoll: false,
        ...(effect.targetGradeAtMost ? { targetGradeAtMost: effect.targetGradeAtMost } : {}),
      });
      continue;
    }
    if (effect.type === "ATTACK_DIE_FLAT_DAMAGE_TO_TARGET") {
      const hit = effect.minRoll;
      const max = effect.maxRoll ?? 1;
      // A face outside [minRoll, maxRoll]. Every shipped window leaves one.
      const miss = hit > -1 ? -1 : max < 1 ? 1 : -1;
      arms.push({
        abilityId: ability.id,
        name: ability.name,
        landingDice: [hit],
        missingDice: [miss],
        readsAttackRoll: Boolean(effect.readsAttackRoll),
      });
    }
  }
  return arms;
}

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
    current = applyOk(current, {
      type: "PASS_REACTION",
      playerId: current.reactionWindow.priorityPlayerId,
    });
  }
  return current;
}

/**
 * The p1 Crusaders (carrying the ability under test) hit the adjacent p2
 * Skeletons in melee. The PRIMARY blow deals 0 damage on purpose (attack 0 vs
 * defense 5), so anything that kills the target is the FOLLOW-UP and nothing
 * else — and the CONTROL run of the same fixture always leaves a living,
 * retaliating defender.
 */
function meleeWithFollowUp(options: {
  abilities: string[];
  /** Attack die, then whatever the follow-up throws. Padded with "+1". */
  rolls: number[];
  variant?: "few" | "pack";
  /** Health the target has left when the follow-up runs (1 = a 1-damage arm kills it). */
  health?: number;
  /** Neutral-owned defender (a bank/guard body): boss-devour reads the grade. */
  defenderGrade?: "bronze" | "silver" | "gold";
}): GameState {
  const state = createInitialGameState("follow-up-kill-before-retaliation");
  const attacker = state.combat!.units.unit_p1_crusaders;
  attacker.abilities = options.abilities;
  attacker.attack = 0;
  attacker.position = 9;
  const defender = state.combat!.units.unit_p2_skeletons;
  defender.abilities = [];
  defender.position = 13;
  defender.defense = 5;
  defender.attack = 4;
  defender.maxHealth = options.health ?? 1;
  defender.damage = 0;
  defender.variant = options.variant ?? "few";
  if (options.defenderGrade) {
    defender.grade = options.defenderGrade;
  }
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.players.p1.morale = 0;
  state.players.p2.morale = 0;
  state.combat!.dice.scriptedRolls = [...options.rolls, 1, 1, 1, 1, 1, 1];
  state.combat!.dice.rollCount = 0;
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_crusaders";
  return passAllReactions(
    applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_crusaders",
      defenderId: "unit_p2_skeletons",
    })
  );
}

/** Answers an open knock-back destination pick (the only window these arms open here). */
function answerKnockbackChoice(state: GameState): GameState {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "OPTION_CHOICE" || choice.context !== "combat-knockback") {
    return state;
  }
  return passAllReactions(
    applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: choice.playerId,
      choiceId: choice.id,
      optionIndex: 0,
    })
  );
}

const retaliationDeclared = (event: GameEvent) =>
  event.type === "UNIT_ATTACK_DECLARED" && event.isRetaliation;
const retaliationRolled = (event: GameEvent) => event.type === "ATTACK_ROLLED" && event.isRetaliation;
const targetRemoved = (event: GameEvent) =>
  event.type === "UNIT_REMOVED" && event.unitId === "unit_p2_skeletons";

function attackerDamage(state: GameState): number {
  return state.combat?.units.unit_p1_crusaders.damage ?? -1;
}

describe("a post-attack follow-up that removes the defender cancels its Retaliation Attack", () => {
  const arms = sweepArms();

  it("the sweep really covers the shipped removal-capable arms", () => {
    // A guard on the derivation itself: if this list ever empties (an effect
    // family renamed, a `getAbilitiesWithEffect` key drift) every case below
    // would vacuously pass.
    expect(arms.map((arm) => arm.abilityId).sort()).toEqual([
      "boss-devour",
      "fortress-gorgon-death-stare",
      "gorgon-death-stare",
      "kivotos-outlaw-shot",
      "kivotos-winged-pursuit",
      "thunderbirds-lightning",
      "wyvern-sting",
    ]);
  });

  for (const arm of sweepArms()) {
    it(`INVARIANT — ${arm.name} (${arm.abilityId}): a lethal follow-up means NO retaliation`, () => {
      // readsAttackRoll arms judge the ATTACK die itself, so it carries the face;
      // every other arm throws its own dice after a neutral "+1" attack die.
      const rolls = arm.readsAttackRoll ? [...arm.landingDice] : [1, ...arm.landingDice];
      const state = meleeWithFollowUp({
        abilities: [arm.abilityId],
        rolls,
        health: 1,
        ...(arm.targetGradeAtMost ? { defenderGrade: "bronze" as const } : {}),
      });

      expect(state.eventLog.some(targetRemoved), "the follow-up took the target off the board").toBe(
        true
      );
      expect(state.eventLog.some(retaliationDeclared), "no Retaliation Attack was declared").toBe(false);
      expect(state.eventLog.some(retaliationRolled), "no retaliation die was rolled").toBe(false);
      expect(attackerDamage(state), "the attacker took no counter-blow").toBe(0);
    });

    it(`CONTROL — ${arm.name}: a MISSED follow-up leaves the defender alive and retaliating`, () => {
      const rolls = arm.readsAttackRoll ? [...arm.missingDice] : [1, ...arm.missingDice];
      const state = meleeWithFollowUp({
        abilities: [arm.abilityId],
        rolls,
        health: 1,
        ...(arm.targetGradeAtMost ? { defenderGrade: "bronze" as const } : {}),
      });

      expect(state.eventLog.some(targetRemoved)).toBe(false);
      expect(state.eventLog.some(retaliationDeclared), "the survivor strikes back").toBe(true);
      expect(state.eventLog.some(retaliationRolled)).toBe(true);
      expect(attackerDamage(state), "the counter-blow really landed").toBeGreaterThan(0);
    });
  }

  it("Thunderbirds: the lightning is what kills, and it reads BEFORE any retaliation event", () => {
    // Health 2, primary blow 0 damage, lightning 1 -> survives and retaliates.
    const survives = meleeWithFollowUp({
      abilities: ["thunderbirds-lightning"],
      rolls: [1, 0],
      health: 2,
    });
    expect(survives.eventLog.some(targetRemoved)).toBe(false);
    expect(survives.combat!.units.unit_p2_skeletons.damage, "the lightning landed 1").toBe(1);
    const lightningAt = survives.eventLog.findIndex(
      (event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "thunderbirds-lightning"
    );
    const retaliationAt = survives.eventLog.findIndex(retaliationDeclared);
    expect(lightningAt).toBeGreaterThanOrEqual(0);
    expect(retaliationAt).toBeGreaterThan(lightningAt);

    // Same fixture, one health less: the same 1 damage is lethal and the
    // retaliation that DID happen above is gone.
    const dies = meleeWithFollowUp({ abilities: ["thunderbirds-lightning"], rolls: [1, 0], health: 1 });
    expect(dies.eventLog.some(targetRemoved)).toBe(true);
    expect(dies.eventLog.some(retaliationDeclared)).toBe(false);
    expect(attackerDamage(dies)).toBe(0);
  });

  it("the neutral Wyverns' Poison Sting is IMMEDIATE damage, so it too can cancel the retaliation", () => {
    // The printed neutral card: 'After the attack, roll 1 Attack die. On a "0"
    // result, deal 1 damage to the target unit.' (The Fortress Wyverns' cube is
    // a different card — see the header.)
    const dies = meleeWithFollowUp({ abilities: ["wyvern-sting"], rolls: [1, 0], health: 1 });
    expect(dies.eventLog.some(targetRemoved)).toBe(true);
    expect(dies.eventLog.some(retaliationDeclared)).toBe(false);

    // CONTROL: the Fortress/Cove poison CUBE plants a token and deals nothing now.
    const cube = meleeWithFollowUp({
      abilities: ["wyvern-poison-cube-few"],
      rolls: [1, 0],
      health: 1,
    });
    expect(cube.eventLog.some(targetRemoved), "the cube kills nobody this attack").toBe(false);
    expect(cube.eventLog.some(retaliationDeclared), "the poisoned target still strikes back").toBe(true);
  });

  it("the neutral Ghost Dragons' knock-back denies the retaliation by pushing the target out of reach", () => {
    // The push is not damage: shouldRetaliate's isAdjacent re-check is the seam.
    const pushed = answerKnockbackChoice(
      meleeWithFollowUp({ abilities: ["ghost-dragon-knockback"], rolls: [1, 0], health: 8 })
    );
    expect(pushed.eventLog.some(targetRemoved), "nobody died — it was only shoved").toBe(false);
    expect(pushed.eventLog.some(retaliationDeclared), "pushed out of reach, it cannot retaliate").toBe(
      false
    );
    expect(attackerDamage(pushed)).toBe(0);

    // CONTROL: the die missed, so it holds its ground and strikes back.
    const held = answerKnockbackChoice(
      meleeWithFollowUp({ abilities: ["ghost-dragon-knockback"], rolls: [1, 1], health: 8 })
    );
    expect(held.eventLog.some(retaliationDeclared)).toBe(true);
    expect(attackerDamage(held)).toBeGreaterThan(0);
  });

  it("a lethal follow-up on a PACK flips it to its Few side, which DOES retaliate", () => {
    const state = meleeWithFollowUp({
      abilities: ["gorgon-death-stare"],
      rolls: [1, -1, -1],
      variant: "pack",
      health: 4,
    });
    expect(state.eventLog.some(targetRemoved), "a Pack flips instead of leaving the board").toBe(false);
    expect(
      state.eventLog.some((event) => event.type === "UNIT_FLIPPED" && event.unitId === "unit_p2_skeletons")
    ).toBe(true);
    expect(state.combat!.units.unit_p2_skeletons.variant).toBe("few");
    expect(state.eventLog.some(retaliationDeclared), "the living Few side strikes back").toBe(true);
  });

  it("CONTROL — the step-0 splash arms can never touch the attack's own target", () => {
    // `getFlatDamageFollowUps` excludes `defender.id` from every candidate list,
    // so a Magog / Cerberi / Kyrie Eleison follow-up cannot cancel a retaliation.
    const splashArms = Object.values(unitAbilities).filter(
      (ability) =>
        ability.implementationStatus === "implemented" &&
        (ability.effect?.type === "FLAT_DAMAGE_ADJACENT_TO_TARGET" ||
          ability.effect?.type === "FLAT_DAMAGE_ADJACENT_TO_SELF" ||
          ability.effect?.type === "FLAT_DAMAGE_ADJACENT_TO_MARKED_TARGET")
    );
    expect(splashArms.length, "the splash family is really shipped").toBeGreaterThan(0);

    const state = meleeWithFollowUp({
      abilities: ["magog-fireball-splash"],
      rolls: [1],
      health: 1,
    });
    expect(state.eventLog.some(targetRemoved), "the splash never hits the target itself").toBe(false);
    expect(state.eventLog.some(retaliationDeclared)).toBe(true);
  });
});

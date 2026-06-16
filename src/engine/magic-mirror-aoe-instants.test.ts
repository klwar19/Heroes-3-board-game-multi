import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState, PlayerId, UnitId } from "./state";

/**
 * Magic Mirror's printed wording is "When your unit is about to be TARGETED or
 * DAMAGED by a spell, choose a new target for that spell." (https://en.homm3bg.wiki/spells/magic_mirror/)
 *
 * The base implementation only deflected a single-target CAST_SPELL aimed at
 * your unit. These tests cover the two cases added here, both engine-enforced
 * (each test fails if the new logic is removed):
 *   1. an instant combat debuff layered onto an attack — Curse on your defender,
 *      Weakness on your attacker — is lifted off your unit and dropped on a unit
 *      of your choice as a lasting token;
 *   2. an area damage spell — Fireball's splash, Inferno's blast — that would
 *      damage your unit even though its primary target is an enemy unit or a bare
 *      space: the blast recenters on the unit you choose.
 *
 * Sandbox grades (createInitialGameState):
 *   p1 marksmen bronze/ranged, griffins bronze/flying, crusaders silver/ground;
 *   p2 skeletons bronze/ground, vampires silver/flying, dread_knights gold/ground.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function reactionFor(state: GameState, playerId: PlayerId, cardId: string, optionIndex?: number) {
  return getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "PLAY_REACTION" &&
      legal.action.cardId === cardId &&
      legal.action.optionIndex === optionIndex &&
      !legal.action.asPowerBoost
  );
}

/** Resolves the open spell-redirect target choice onto `targetUnitId`. */
function chooseRedirect(state: GameState, playerId: PlayerId, targetUnitId: UnitId): GameState {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "ABILITY_TARGET_CHOICE" || choice.kind !== "spell-redirect") {
    throw new Error("expected an open spell-redirect choice");
  }
  return applyOk(state, { type: "CHOOSE_ABILITY_TARGET", playerId, choiceId: choice.id, targetUnitId });
}

function passUntilSettled(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function lastMainAttackRoll(state: GameState, attackerId: UnitId) {
  return [...state.eventLog]
    .reverse()
    .find((event) => event.type === "ATTACK_ROLLED" && event.attackerId === attackerId && !event.isRetaliation);
}

function retaliationRoll(state: GameState, attackerId: UnitId) {
  return [...state.eventLog]
    .reverse()
    .find((event) => event.type === "ATTACK_ROLLED" && event.attackerId === attackerId && event.isRetaliation);
}

/** A live negative stat effect (the bounced debuff) sitting on a unit, if any. */
function debuffEffectOn(state: GameState, unitId: UnitId, modifier: "ATTACK_BONUS" | "DEFENSE_BONUS") {
  return state.activeEffects.find(
    (effect) =>
      effect.target?.type === "unit" &&
      effect.target.unitId === unitId &&
      effect.modifiers.some((mod) => mod.type === modifier && mod.amount < 0)
  );
}

/** The bounced debuff must never linger as a combat-long token. */
function hasNoCombatTokens(state: GameState, unitId: UnitId): boolean {
  return (state.combat!.units[unitId].tokens ?? []).length === 0;
}

// ---------------------------------------------------------------------------
// (1) Instant combat debuffs layered onto an attack
// ---------------------------------------------------------------------------

describe("Magic Mirror reflects an instant combat debuff off your unit", () => {
  /** p2's skeletons attack p1's griffins; p2 then plays an instant on the attack. */
  function p2AttacksGriffins(p1Hand: string[], p2Hand: string[]): GameState {
    const state = createInitialGameState("mm-instant");
    state.players.p1.hand = [...p1Hand];
    state.players.p2.hand = [...p2Hand];
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state.combat!.units.unit_p2_skeletons.activatedThisRound = false;
    state.combat!.units.unit_p2_skeletons.position = 13;
    state.combat!.units.unit_p2_skeletons.maxHealth = 40; // survive the retaliation
    state.combat!.units.unit_p1_griffins.position = 9; // adjacent to 13
    state.combat!.units.unit_p1_griffins.maxHealth = 40; // survive so the roll logs cleanly
    state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
    state.combat!.dice.rollCount = 0;
    return applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_griffins"
    });
  }

  it("lifts Curse off the defender, applies it to the chosen unit for the attack+retaliation, then expires", () => {
    // Baseline: with no Magic Mirror, p2's Curse sticks — the attack resolves with
    // the griffins' Defense lowered by 1.
    let baseline = p2AttacksGriffins([], ["spell.curse"]);
    baseline = applyOk(baseline, reactionFor(baseline, "p2", "spell.curse")!.action);
    baseline = passUntilSettled(baseline);
    const baseRoll = lastMainAttackRoll(baseline, "unit_p2_skeletons");
    expect(baseRoll && baseRoll.type === "ATTACK_ROLLED" ? baseRoll.defenseBonus : null).toBe(-1);

    // Reflected: p1 Magic Mirrors the Curse. p2 casts it, priority falls to p1.
    let state = p2AttacksGriffins(["spell.magic_mirror"], ["spell.curse"]);
    state = applyOk(state, reactionFor(state, "p2", "spell.curse")!.action);

    const mirror = reactionFor(state, "p1", "spell.magic_mirror", 0);
    expect(mirror, "Magic Mirror is offered against an enemy Curse on your unit").toBeTruthy();
    state = applyOk(state, mirror!.action);

    // The follow-up target choice is gated to bronze (Power 0) and excludes the
    // griffins it was just lifted off.
    const choice = state.pendingChoice;
    if (!choice || choice.type !== "ABILITY_TARGET_CHOICE" || choice.kind !== "spell-redirect") {
      throw new Error("expected a spell-redirect choice");
    }
    expect(choice.candidateUnitIds).toContain("unit_p2_skeletons");
    expect(choice.candidateUnitIds).not.toContain("unit_p1_griffins");
    expect(choice.candidateUnitIds).not.toContain("unit_p2_vampires"); // silver
    expect(choice.candidateUnitIds).not.toContain("unit_p2_dread_knights"); // gold

    state = chooseRedirect(state, "p1", "unit_p2_skeletons");
    state = passUntilSettled(state);

    // The Curse no longer touches the griffins' Defense on the attack…
    const roll = lastMainAttackRoll(state, "unit_p2_skeletons");
    expect(roll && roll.type === "ATTACK_ROLLED" ? roll.defenseBonus : null).toBe(0);
    // …it landed on the skeletons for the retaliation: the griffins' counter-attack
    // strikes the skeletons at −1 Defense.
    const counter = retaliationRoll(state, "unit_p1_griffins");
    expect(counter && counter.type === "ATTACK_ROLLED" ? counter.defenderId : null).toBe("unit_p2_skeletons");
    expect(counter && counter.type === "ATTACK_ROLLED" ? counter.defenseBonus : null).toBe(-1);
    // …and once the attack (and its retaliation) is over, the debuff is GONE — it
    // never becomes a combat-long token.
    expect(debuffEffectOn(state, "unit_p2_skeletons", "DEFENSE_BONUS")).toBeUndefined();
    expect(hasNoCombatTokens(state, "unit_p2_skeletons")).toBe(true);
    expect(state.eventLog.some((event) => event.type === "SPELL_REDIRECTED")).toBe(true);
    // Casting Magic Mirror spends p1's one Spell for the round.
    expect(state.players.p1.combatStats.spellsCastThisRound).toBe(1);
    expect(state.players.p1.discard).toContain("spell.magic_mirror");
  });

  it("scales the bounced debuff with the Power paid into the Curse (per-caster pool)", () => {
    // Curse is −1/−2/−3 Defense at Power 0/1/2; the bounced debuff must carry the
    // SAME magnitude the Curse had, re-derived from the caster's attack-Power pool
    // — read off the griffins' retaliation, which strikes the now-cursed skeletons.
    const retaliationDefenseBonusForPower = (powerCards: number): number => {
      let state = p2AttacksGriffins(
        ["spell.magic_mirror"],
        ["spell.curse", ...Array.from({ length: powerCards }, () => "stat.power")]
      );
      state = applyOk(state, reactionFor(state, "p2", "spell.curse")!.action);
      for (let paid = 0; paid < powerCards; paid += 1) {
        const power = getLegalActions(state, "p2").find(
          (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.power"
        );
        expect(power, "Power can be paid into the Curse").toBeTruthy();
        state = applyOk(state, power!.action);
      }
      state = applyOk(state, reactionFor(state, "p1", "spell.magic_mirror", 0)!.action);
      state = chooseRedirect(state, "p1", "unit_p2_skeletons");
      state = passUntilSettled(state);
      const counter = retaliationRoll(state, "unit_p1_griffins");
      return counter && counter.type === "ATTACK_ROLLED" ? counter.defenseBonus : 0;
    };

    expect(retaliationDefenseBonusForPower(0)).toBe(-1); // Power 0 → −1 Defense
    expect(retaliationDefenseBonusForPower(1)).toBe(-2); // Power 1 → −2 Defense
    expect(retaliationDefenseBonusForPower(2)).toBe(-3); // Power 2 → −3 Defense
  });

  it("does NOT offer Magic Mirror against an enemy self-buff (Bloodlust on the attacker)", () => {
    // Bloodlust buffs p2's own attacking skeletons — it never targets a p1 unit,
    // so p1's Magic Mirror has nothing to reflect.
    let state = p2AttacksGriffins(["spell.magic_mirror"], ["spell.bloodlust"]);
    state = applyOk(state, reactionFor(state, "p2", "spell.bloodlust")!.action);
    expect(reactionFor(state, "p1", "spell.magic_mirror", 0)).toBeFalsy();
    expect(reactionFor(state, "p1", "spell.magic_mirror", 1)).toBeFalsy();
    expect(reactionFor(state, "p1", "spell.magic_mirror", 2)).toBeFalsy();
  });

  it("offers only the grades you can pay for against an attack debuff", () => {
    let state = p2AttacksGriffins(["spell.magic_mirror"], ["spell.curse"]);
    state = applyOk(state, reactionFor(state, "p2", "spell.curse")!.action);
    expect(reactionFor(state, "p1", "spell.magic_mirror", 0), "bronze is free").toBeTruthy();
    expect(reactionFor(state, "p1", "spell.magic_mirror", 1), "silver needs 1 Power").toBeFalsy();
    expect(reactionFor(state, "p1", "spell.magic_mirror", 2), "gold needs 2 Power").toBeFalsy();

    // Holding two Power unlocks the gold grade, which then also lists gold units.
    let gold = p2AttacksGriffins(["spell.magic_mirror", "stat.power", "stat.power"], ["spell.curse"]);
    gold = applyOk(gold, reactionFor(gold, "p2", "spell.curse")!.action);
    expect(reactionFor(gold, "p1", "spell.magic_mirror", 2), "gold is affordable with 2 Power").toBeTruthy();
    // The gold option costs two power-source cards; the player names which to pay.
    gold = applyOk(gold, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "spell.magic_mirror",
      mode: "basic",
      optionIndex: 2,
      costCardIds: ["stat.power", "stat.power"]
    });
    const choice = gold.pendingChoice;
    if (!choice || choice.type !== "ABILITY_TARGET_CHOICE") {
      throw new Error("expected a redirect choice");
    }
    expect(choice.candidateUnitIds).toContain("unit_p2_dread_knights"); // gold now reachable
  });

  it("reopens the attack window after a reflection so play continues (the attack has not resolved)", () => {
    // p2 attacks with a Curse AND a Bloodlust. It plays the Curse, passes; p1
    // mirrors the Curse onto the skeletons; then the window must REOPEN so p2 can
    // still play its Bloodlust before the attack finally rolls.
    let state = p2AttacksGriffins(["spell.magic_mirror"], ["spell.curse", "spell.bloodlust"]);
    // Raise p2's Spell limit so it can follow its Curse with a second Spell — the
    // point is to prove the window reopens, not to test the one-Spell cap here.
    state.players.p2.combatStats.spellLimitBonusThisRound = 3;
    state = applyOk(state, reactionFor(state, "p2", "spell.curse")!.action);
    state = applyOk(state, { type: "PASS_REACTION", playerId: "p2" });

    state = applyOk(state, reactionFor(state, "p1", "spell.magic_mirror", 0)!.action);
    state = chooseRedirect(state, "p1", "unit_p2_skeletons");

    // The attack is still pending: the window is open again and the attacker can
    // act. (If the redirect had wrongly resolved the attack, there would be no
    // window and Bloodlust could never be played.)
    expect(state.reactionWindow, "the attack window reopened after the reflection").toBeTruthy();
    const bloodlust = reactionFor(state, "p2", "spell.bloodlust");
    expect(bloodlust, "the attacker may still play another instant").toBeTruthy();
    state = applyOk(state, bloodlust!.action);
    state = passUntilSettled(state);

    // Final attack: griffins un-cursed (Defense intact) and the attacker's own
    // Bloodlust still landed (+1).
    const roll = lastMainAttackRoll(state, "unit_p2_skeletons");
    expect(roll && roll.type === "ATTACK_ROLLED" ? roll.defenseBonus : null).toBe(0);
    expect(roll && roll.type === "ATTACK_ROLLED" ? roll.attackBonus : null).toBe(1);
    // The bounced Curse hit the skeletons for the griffins' retaliation, then expired.
    const counter = retaliationRoll(state, "unit_p1_griffins");
    expect(counter && counter.type === "ATTACK_ROLLED" ? counter.defenseBonus : null).toBe(-1);
    expect(debuffEffectOn(state, "unit_p2_skeletons", "DEFENSE_BONUS")).toBeUndefined();
  });

  it("lifts Weakness off your attacker when you are the one attacking", () => {
    // p1's griffins attack p2's skeletons; p2 (the defender) answers with Weakness
    // on the griffins. p1 reflects it.
    function p1Attacks(p1Hand: string[], p2Hand: string[]): GameState {
      const state = createInitialGameState("mm-weakness");
      state.players.p1.hand = [...p1Hand];
      state.players.p2.hand = [...p2Hand];
      state.combat!.units.unit_p1_griffins.position = 9;
      state.combat!.units.unit_p1_griffins.maxHealth = 40;
      state.combat!.units.unit_p2_skeletons.position = 13; // adjacent to 9
      state.combat!.units.unit_p2_skeletons.maxHealth = 40;
      state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0];
      state.combat!.dice.rollCount = 0;
      return applyOk(state, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_griffins",
        defenderId: "unit_p2_skeletons"
      });
    }

    // Baseline: Weakness sticks → the griffins attack at −1.
    let baseline = p1Attacks([], ["spell.weakness"]);
    baseline = applyOk(baseline, reactionFor(baseline, "p2", "spell.weakness")!.action);
    baseline = passUntilSettled(baseline);
    const baseRoll = lastMainAttackRoll(baseline, "unit_p1_griffins");
    expect(baseRoll && baseRoll.type === "ATTACK_ROLLED" ? baseRoll.attackBonus : null).toBe(-1);

    // Reflected: p1 bounces the Weakness onto the skeletons. It lifts off the
    // griffins (attack intact) and weakens the skeletons' RETALIATION instead.
    let state = p1Attacks(["spell.magic_mirror"], ["spell.weakness"]);
    state = applyOk(state, reactionFor(state, "p2", "spell.weakness")!.action);
    const mirror = reactionFor(state, "p1", "spell.magic_mirror", 0);
    expect(mirror, "Magic Mirror is offered against an enemy Weakness on your attacker").toBeTruthy();
    state = applyOk(state, mirror!.action);
    state = chooseRedirect(state, "p1", "unit_p2_skeletons");
    state = passUntilSettled(state);

    const roll = lastMainAttackRoll(state, "unit_p1_griffins");
    expect(roll && roll.type === "ATTACK_ROLLED" ? roll.attackBonus : null).toBe(0);
    // The skeletons retaliate at −1 attack (the bounced Weakness), then it expires.
    const counter = retaliationRoll(state, "unit_p2_skeletons");
    expect(counter && counter.type === "ATTACK_ROLLED" ? counter.defenderId : null).toBe("unit_p1_griffins");
    expect(counter && counter.type === "ATTACK_ROLLED" ? counter.attackBonus : null).toBe(-1);
    expect(debuffEffectOn(state, "unit_p2_skeletons", "ATTACK_BONUS")).toBeUndefined();
    expect(hasNoCombatTokens(state, "unit_p2_skeletons")).toBe(true);

    // Power scales the bounced Weakness too: a Power-1 Weakness is −2 attack, so
    // the skeletons' retaliation is at −2.
    let scaled = p1Attacks(["spell.magic_mirror"], ["spell.weakness", "stat.power"]);
    scaled = applyOk(scaled, reactionFor(scaled, "p2", "spell.weakness")!.action);
    const wkPower = getLegalActions(scaled, "p2").find(
      (legal) => legal.action.type === "PLAY_REACTION" && legal.action.cardId === "stat.power"
    );
    expect(wkPower, "Power can be paid into the Weakness").toBeTruthy();
    scaled = applyOk(scaled, wkPower!.action);
    scaled = applyOk(scaled, reactionFor(scaled, "p1", "spell.magic_mirror", 0)!.action);
    scaled = chooseRedirect(scaled, "p1", "unit_p2_skeletons");
    scaled = passUntilSettled(scaled);
    const scaledCounter = retaliationRoll(scaled, "unit_p2_skeletons");
    expect(scaledCounter && scaledCounter.type === "ATTACK_ROLLED" ? scaledCounter.attackBonus : null).toBe(-2);
  });
});

// ---------------------------------------------------------------------------
// (2) Area damage spells (Fireball splash, Inferno blast)
// ---------------------------------------------------------------------------

describe("Magic Mirror reflects an area damage spell that would catch your unit", () => {
  it("recenters Inferno onto the unit you choose, sparing your unit in the blast", () => {
    // p2 casts Inferno on space 9 (its vampires sit there). p1's marksmen at 8 is
    // orthogonally adjacent — inside the blast — though it is not the target.
    function castInferno(p1Hand: string[]): GameState {
      const state = createInitialGameState("mm-inferno");
      state.players.p1.hand = [...p1Hand];
      state.players.p2.hand = ["spell.inferno"];
      state.activePlayerId = "p2";
      state.combat!.activeUnitId = "unit_p2_vampires";
      state.combat!.units.unit_p2_vampires.activatedThisRound = false;
      state.combat!.units.unit_p2_vampires.position = 9; // Inferno centre
      state.combat!.units.unit_p1_marksmen.position = 8; // adjacent → in the blast
      state.combat!.units.unit_p1_marksmen.maxHealth = 20;
      state.combat!.units.unit_p2_skeletons.position = 16; // far bronze redirect target
      state.combat!.units.unit_p1_griffins.position = 0; // clear of either blast
      state.combat!.units.unit_p1_crusaders.position = 6; // clear of either blast
      state.combat!.units.unit_p2_dread_knights.position = 18; // clear of either blast
      state.combat!.dice.scriptedRolls = [1, 0, 0, 0]; // one "+1" → 1 damage per unit hit
      state.combat!.dice.rollCount = 0;
      return applyOk(state, {
        type: "CAST_SPELL",
        playerId: "p2",
        cardId: "spell.inferno",
        target: { type: "space", position: 9 }
      });
    }

    // Baseline: nobody mirrors → the marksmen burns for 1 in the space-9 blast.
    const baseline = passUntilSettled(castInferno([]));
    expect(baseline.combat!.units.unit_p1_marksmen.damage).toBe(1);

    // Reflected: the marksmen is in the blast, so p1 is offered Magic Mirror even
    // though the spell targets a space, not a unit.
    let state = castInferno(["spell.magic_mirror"]);
    const mirror = reactionFor(state, "p1", "spell.magic_mirror", 0);
    expect(mirror, "Magic Mirror is offered when an area blast would damage your unit").toBeTruthy();
    state = applyOk(state, mirror!.action);

    // Recenter the blast onto the far skeletons (space 16); the choice excludes
    // nothing for a space-centred spell, but the grade still gates to bronze.
    const choice = state.pendingChoice;
    if (!choice || choice.type !== "ABILITY_TARGET_CHOICE" || choice.kind !== "spell-redirect") {
      throw new Error("expected a spell-redirect choice");
    }
    expect(choice.candidateUnitIds).toContain("unit_p2_skeletons");
    expect(choice.candidateUnitIds).not.toContain("unit_p2_vampires"); // silver, out of reach at bronze
    state = chooseRedirect(state, "p1", "unit_p2_skeletons");
    state = passUntilSettled(state);

    // The marksmen is now outside the blast (centre moved to 16); the skeletons
    // takes the hit instead.
    expect(state.combat!.units.unit_p1_marksmen.damage).toBe(0);
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(1);
    expect(state.combat!.units.unit_p2_vampires.damage).toBe(0); // old centre spared too
    expect(state.eventLog.some((event) => event.type === "SPELL_REDIRECTED")).toBe(true);
  });

  it("recenters Fireball when its splash (not its primary target) would hit your unit", () => {
    // p2 aims Fireball at its OWN vampires (space 9); p1's marksmen at 8 is
    // adjacent, so it is a potential splash victim even though the primary target
    // is an enemy unit.
    function castFireball(p1Hand: string[]): GameState {
      const state = createInitialGameState("mm-fireball");
      state.players.p1.hand = [...p1Hand];
      state.players.p2.hand = ["spell.fireball"];
      state.activePlayerId = "p2";
      state.combat!.activeUnitId = "unit_p2_vampires";
      state.combat!.units.unit_p2_vampires.activatedThisRound = false;
      state.combat!.units.unit_p2_vampires.position = 9; // primary target
      state.combat!.units.unit_p1_marksmen.position = 8; // adjacent → splash risk
      state.combat!.units.unit_p1_marksmen.maxHealth = 20;
      state.combat!.units.unit_p2_skeletons.position = 16; // far bronze redirect target
      state.combat!.units.unit_p1_griffins.position = 0;
      state.combat!.units.unit_p1_crusaders.position = 5;
      state.combat!.units.unit_p2_dread_knights.position = 19;
      return applyOk(state, {
        type: "CAST_SPELL",
        playerId: "p2",
        cardId: "spell.fireball",
        target: { type: "unit", unitId: "unit_p2_vampires" }
      });
    }

    // The primary target belongs to p2, so this exercises the splash-detection
    // path (not the "your unit is the primary target" path).
    let state = castFireball(["spell.magic_mirror"]);
    const mirror = reactionFor(state, "p1", "spell.magic_mirror", 0);
    expect(mirror, "Magic Mirror is offered when a Fireball splash threatens your unit").toBeTruthy();
    state = applyOk(state, mirror!.action);

    // Redirect the primary onto the far skeletons; the marksmen is then neither
    // primary nor adjacent, so the whole blast misses it.
    state = chooseRedirect(state, "p1", "unit_p2_skeletons");
    state = passUntilSettled(state);

    expect(state.combat!.units.unit_p1_marksmen.damage).toBe(0);
    expect(state.combat!.units.unit_p2_skeletons.damage).toBeGreaterThan(0);
    expect(state.eventLog.some((event) => event.type === "SPELL_REDIRECTED")).toBe(true);
  });

  it("recenters Frost Ring (a ring around a space) off your unit", () => {
    // p2 casts Frost Ring on space 9; the ring hits the units ADJACENT to it (not
    // the centre). p1's marksmen at 8 is adjacent, so it is about to be damaged.
    function castFrostRing(p1Hand: string[]): GameState {
      const state = createInitialGameState("mm-frost-ring");
      state.players.p1.hand = [...p1Hand];
      state.players.p2.hand = ["spell.frost_ring"];
      state.activePlayerId = "p2";
      state.combat!.activeUnitId = "unit_p2_dread_knights";
      state.combat!.units.unit_p2_dread_knights.activatedThisRound = false;
      state.combat!.units.unit_p2_dread_knights.position = 2; // caster, clear of both rings
      state.combat!.units.unit_p1_marksmen.position = 8; // adjacent to space 9 → in the ring
      state.combat!.units.unit_p1_marksmen.maxHealth = 20;
      state.combat!.units.unit_p2_skeletons.position = 16; // far bronze redirect centre
      state.combat!.units.unit_p2_vampires.position = 17; // adjacent to 16 → hit after redirect
      state.combat!.units.unit_p2_vampires.maxHealth = 20;
      state.combat!.units.unit_p1_griffins.position = 0; // clear of both rings
      state.combat!.units.unit_p1_crusaders.position = 19; // clear of both rings
      return applyOk(state, {
        type: "CAST_SPELL",
        playerId: "p2",
        cardId: "spell.frost_ring",
        target: { type: "space", position: 9 }
      });
    }

    // Baseline: nobody mirrors → the ring around space 9 freezes the marksmen.
    const baseline = passUntilSettled(castFrostRing([]));
    expect(baseline.combat!.units.unit_p1_marksmen.damage).toBe(1);

    // Reflected: the marksmen sits in the ring, so Magic Mirror is offered.
    let state = castFrostRing(["spell.magic_mirror"]);
    const mirror = reactionFor(state, "p1", "spell.magic_mirror", 0);
    expect(mirror, "Magic Mirror is offered when a Frost Ring would freeze your unit").toBeTruthy();
    state = applyOk(state, mirror!.action);

    // Recenter the ring on the far skeletons (bronze); silver/gold are out of reach.
    const choice = state.pendingChoice;
    if (!choice || choice.type !== "ABILITY_TARGET_CHOICE" || choice.kind !== "spell-redirect") {
      throw new Error("expected a spell-redirect choice");
    }
    expect(choice.candidateUnitIds).toContain("unit_p2_skeletons");
    expect(choice.candidateUnitIds).not.toContain("unit_p2_vampires"); // silver
    state = chooseRedirect(state, "p1", "unit_p2_skeletons");
    state = passUntilSettled(state);

    // The ring now circles space 16: the marksmen is spared and the vampires
    // (adjacent to the new centre) take the freeze instead.
    expect(state.combat!.units.unit_p1_marksmen.damage).toBe(0);
    expect(state.combat!.units.unit_p2_vampires.damage).toBe(1);
    // Frost Ring never hits its own centre, so the skeletons stay unharmed.
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(0);
    expect(state.eventLog.some((event) => event.type === "SPELL_REDIRECTED")).toBe(true);
  });

  it("does NOT offer Magic Mirror when an area blast cannot reach any of your units", () => {
    const state = createInitialGameState("mm-inferno-miss");
    state.players.p1.hand = ["spell.magic_mirror"];
    state.players.p2.hand = ["spell.inferno"];
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_vampires";
    state.combat!.units.unit_p2_vampires.activatedThisRound = false;
    state.combat!.units.unit_p2_vampires.position = 9;
    // Keep every p1 unit well clear of space 9 and its neighbours {5,8,10,13}.
    state.combat!.units.unit_p1_marksmen.position = 0;
    state.combat!.units.unit_p1_griffins.position = 3;
    state.combat!.units.unit_p1_crusaders.position = 19;

    const cast = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p2",
      cardId: "spell.inferno",
      target: { type: "space", position: 9 }
    });
    expect(reactionFor(cast, "p1", "spell.magic_mirror", 0)).toBeFalsy();
  });
});

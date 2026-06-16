import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { getUnitAbilityDefinitions, hasUnitAbilityEffect } from "./unit-abilities";
import type { GameAction, GameState, PlayerId, UnitId } from "./state";

/**
 * Engine tests for two more wiki spells, each engine-enforced (every test fails
 * if the wiring is removed):
 *  - Disrupting Ray (Basic Air, Ongoing): until the end of the Combat the
 *    selected enemy unit "cannot use their special ability" — ALL of them, now
 *    and any gained later. Grade-gated 0/1/2 → bronze/silver/gold, and (as a
 *    single-target unit cast) deflectable by Magic Mirror onto a new target.
 *  - Sacrifice (Expert Fire, Activation): transfer one of your units' damage
 *    onto another of your units, which perishes — min(heal's damage, the
 *    sacrifice's remaining HP) is moved. Grade-gated 0/2/4 on the heal target.
 *
 * Sandbox grades/types (createInitialGameState):
 *   p1 marksmen bronze/ranged (double-attack), griffins bronze/flying
 *      (unlimited-retaliation), crusaders silver/ground;
 *   p2 skeletons bronze/ground (no ability), vampires silver/flying
 *      (ignores-retaliation), dread_knights gold/ground.
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

function findCast(state: GameState, playerId: PlayerId, cardId: string, unitId: UnitId) {
  return getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "CAST_SPELL" &&
      legal.action.cardId === cardId &&
      legal.action.target?.type === "unit" &&
      legal.action.target.unitId === unitId
  );
}

function reactionFor(state: GameState, playerId: PlayerId, cardId: string, optionIndex: number) {
  return getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "PLAY_REACTION" &&
      legal.action.cardId === cardId &&
      legal.action.optionIndex === optionIndex
  );
}

function abilityChoice(state: GameState) {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "ABILITY_TARGET_CHOICE") {
    throw new Error("expected an ABILITY_TARGET_CHOICE to be open");
  }
  return choice;
}

// ---------------------------------------------------------------------------
// Disrupting Ray — suppress the target's special ability for the Combat.
// ---------------------------------------------------------------------------

describe("Disrupting Ray spell", () => {
  it("switches off every special ability of the selected unit — present AND future", () => {
    const state = createInitialGameState("dray-suppress");
    state.players.p1.hand = ["spell.disrupting_ray"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    // p2 skeletons are bronze; give them a known implemented ability for the test.
    const before = state.combat!.units.unit_p2_skeletons;
    before.abilities = ["double-attack"];
    expect(hasUnitAbilityEffect(before, "DOUBLE_ATTACK")).toBe(true);

    const cast = findCast(state, "p1", "spell.disrupting_ray", "unit_p2_skeletons");
    expect(cast, "Disrupting Ray should be castable on an enemy unit").toBeTruthy();
    const result = passAllReactions(applyOk(state, cast!.action));

    const suppressed = result.combat!.units.unit_p2_skeletons;
    expect(suppressed.abilitiesSuppressed).toBe(true);
    expect(getUnitAbilityDefinitions(suppressed)).toEqual([]);
    expect(hasUnitAbilityEffect(suppressed, "DOUBLE_ATTACK")).toBe(false);

    // "Even future unit ability should be ignored": an ability gained AFTER the
    // suppression still reads as switched off.
    suppressed.abilities.push("ignores-retaliation");
    expect(hasUnitAbilityEffect(suppressed, "IGNORE_RETALIATION")).toBe(false);
    expect(getUnitAbilityDefinitions(suppressed)).toEqual([]);
  });

  it("actually stops the ability in combat: a suppressed Marksmen no longer double-attacks", () => {
    // Control: p1 Marksmen attack a non-adjacent enemy and strike twice.
    const control = createInitialGameState("dray-double-control");
    control.players.p1.hand = [];
    control.players.p2.hand = [];
    control.combat!.units.unit_p2_skeletons.maxHealth = 30; // survive both hits
    control.activePlayerId = "p1";
    control.combat!.activeUnitId = "unit_p1_marksmen";
    control.combat!.dice.scriptedRolls = [1, 1, 1, 1];
    control.combat!.dice.rollCount = 0;
    const controlResult = passAllReactions(
      applyOk(control, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_marksmen",
        defenderId: "unit_p2_skeletons"
      })
    );
    expect(controlResult.combat!.units.unit_p1_marksmen.attacksThisActivation).toBe(2);
    expect(controlResult.eventLog.filter((event) => event.type === "ATTACK_ROLLED")).toHaveLength(2);

    // Suppressed: p2 casts Disrupting Ray on the Marksmen, then they attack once.
    const setup = createInitialGameState("dray-double-suppressed");
    setup.players.p1.hand = [];
    setup.players.p2.hand = ["spell.disrupting_ray"];
    setup.combat!.units.unit_p2_skeletons.maxHealth = 30;
    setup.activePlayerId = "p2";
    setup.combat!.activeUnitId = "unit_p2_skeletons";
    setup.combat!.units.unit_p2_skeletons.activatedThisRound = false;
    const cast = findCast(setup, "p2", "spell.disrupting_ray", "unit_p1_marksmen");
    expect(cast).toBeTruthy();
    const suppressed = passAllReactions(applyOk(setup, cast!.action));
    expect(suppressed.combat!.units.unit_p1_marksmen.abilitiesSuppressed).toBe(true);

    suppressed.activePlayerId = "p1";
    suppressed.combat!.activeUnitId = "unit_p1_marksmen";
    suppressed.combat!.units.unit_p1_marksmen.activatedThisRound = false;
    suppressed.combat!.dice.scriptedRolls = [1, 1, 1, 1];
    suppressed.combat!.dice.rollCount = 0;
    const result = passAllReactions(
      applyOk(suppressed, {
        type: "ATTACK_UNIT",
        playerId: "p1",
        attackerId: "unit_p1_marksmen",
        defenderId: "unit_p2_skeletons"
      })
    );
    // Only one attack: the double-attack ability is suppressed.
    expect(result.combat!.units.unit_p1_marksmen.attacksThisActivation).toBe(1);
    expect(result.eventLog.filter((event) => event.type === "ATTACK_ROLLED")).toHaveLength(1);
    expect(
      result.eventLog.some(
        (event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "double-attack"
      )
    ).toBe(false);
  });

  it("is grade-gated: Power 0 cannot suppress a gold unit, but Power 2 can", () => {
    function castAt(power: number): GameState {
      const state = createInitialGameState(`dray-gate-${power}`);
      // Spare Power statistics open the caster's Empower window (set below).
      state.players.p1.hand = ["spell.disrupting_ray", "stat.power", "stat.power"];
      state.players.p2.hand = [];
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = "unit_p1_marksmen";
      const gold = state.combat!.units.unit_p2_dread_knights; // gold
      gold.abilities = ["double-attack"];
      const cast = findCast(state, "p1", "spell.disrupting_ray", "unit_p2_dread_knights");
      const casted = applyOk(state, cast!.action);
      casted.stack[0]!.modifiers.spellPowerBonus = power;
      return passAllReactions(casted);
    }

    // Power 0 → bronze gate: a gold unit is above it, so the cast does nothing.
    const gated = castAt(0);
    expect(gated.combat!.units.unit_p2_dread_knights.abilitiesSuppressed).toBeFalsy();
    expect(getUnitAbilityDefinitions(gated.combat!.units.unit_p2_dread_knights).length).toBeGreaterThan(0);

    // Power 2 → gold gate: the gold unit is suppressed.
    const powered = castAt(2);
    expect(powered.combat!.units.unit_p2_dread_knights.abilitiesSuppressed).toBe(true);
    expect(getUnitAbilityDefinitions(powered.combat!.units.unit_p2_dread_knights)).toEqual([]);
  });

  it("can be deflected by Magic Mirror onto a new target (the original unit is spared)", () => {
    const state = createInitialGameState("dray-mirror");
    state.players.p1.hand = ["spell.magic_mirror"];
    state.players.p2.hand = ["spell.disrupting_ray"];
    // Both p1 bronze units carry an ability so suppression is observable on each.
    state.combat!.units.unit_p1_griffins.abilities = ["double-attack"]; // original target
    state.combat!.units.unit_p1_marksmen.abilities = ["double-attack"]; // bounce target
    state.activePlayerId = "p2";
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state.combat!.units.unit_p2_skeletons.activatedThisRound = false;

    let s = applyOk(state, {
      type: "CAST_SPELL",
      playerId: "p2",
      cardId: "spell.disrupting_ray",
      target: { type: "unit", unitId: "unit_p1_griffins" }
    });

    // The targeted side (p1) is offered Magic Mirror (bronze is free).
    expect(s.reactionWindow!.priorityPlayerId).toBe("p1");
    const bronze = reactionFor(s, "p1", "spell.magic_mirror", 0);
    expect(bronze, "Magic Mirror bronze should be offered against Disrupting Ray").toBeTruthy();
    s = applyOk(s, bronze!.action);

    const choice = abilityChoice(s);
    expect(choice.kind).toBe("spell-redirect");
    expect(choice.candidateUnitIds).toContain("unit_p1_marksmen");
    expect(choice.candidateUnitIds).not.toContain("unit_p1_griffins"); // never the original

    s = applyOk(s, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p1_marksmen"
    });

    // Suppression landed on the bounced unit; the original keeps its ability.
    const marksmen = s.combat!.units.unit_p1_marksmen;
    const griffins = s.combat!.units.unit_p1_griffins;
    expect(marksmen.abilitiesSuppressed).toBe(true);
    expect(getUnitAbilityDefinitions(marksmen)).toEqual([]);
    expect(griffins.abilitiesSuppressed).toBeFalsy();
    expect(getUnitAbilityDefinitions(griffins).length).toBeGreaterThan(0);
    expect(s.eventLog.some((event) => event.type === "SPELL_REDIRECTED")).toBe(true);
  });

  it("lasts until the end of the Combat, then the ability returns", () => {
    const state = createInitialGameState("dray-duration");
    state.players.p1.hand = ["spell.disrupting_ray"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    state.combat!.units.unit_p2_skeletons.abilities = ["double-attack"];

    const cast = findCast(state, "p1", "spell.disrupting_ray", "unit_p2_skeletons");
    const suppressed = passAllReactions(applyOk(state, cast!.action));
    expect(suppressed.combat!.units.unit_p2_skeletons.abilitiesSuppressed).toBe(true);
    // The suppression is a combat-scoped active effect (it can be Dispelled).
    expect(
      suppressed.activeEffects.some((effect) =>
        effect.modifiers.some((modifier) => modifier.type === "UNIT_ABILITY_SUPPRESSED")
      )
    ).toBe(true);
    expect(suppressed.activeEffects.find((effect) =>
      effect.modifiers.some((modifier) => modifier.type === "UNIT_ABILITY_SUPPRESSED")
    )!.duration).toEqual({ type: "combat" });
  });

  it("is ignored by a Tower Gargoyle (ongoing spell effects never apply to it)", () => {
    const state = createInitialGameState("dray-gargoyle");
    state.players.p1.hand = ["spell.disrupting_ray"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    // Gargoyles "ignore ongoing effects created by a Spell" — Disrupting Ray is
    // a Spell, so its suppression never takes hold; the unit keeps its ability.
    const gargoyle = state.combat!.units.unit_p2_skeletons;
    gargoyle.abilities = ["gargoyle-spell-ward", "double-attack"];

    const cast = findCast(state, "p1", "spell.disrupting_ray", "unit_p2_skeletons");
    const result = passAllReactions(applyOk(state, cast!.action));

    const target = result.combat!.units.unit_p2_skeletons;
    expect(target.abilitiesSuppressed).toBeFalsy();
    expect(hasUnitAbilityEffect(target, "DOUBLE_ATTACK")).toBe(true);
    expect(getUnitAbilityDefinitions(target).length).toBeGreaterThan(0);
  });

  it("is ignored by a Tower Titan (every ongoing effect on it is ignored)", () => {
    const state = createInitialGameState("dray-titan");
    state.players.p1.hand = ["spell.disrupting_ray"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    // Titans "ignore any ongoing effects on this unit, whatever the source" —
    // so Disrupting Ray's suppression never applies and the ability stays live.
    const titan = state.combat!.units.unit_p2_skeletons;
    titan.abilities = ["titan-ignore-ongoing", "double-attack"];

    const cast = findCast(state, "p1", "spell.disrupting_ray", "unit_p2_skeletons");
    const result = passAllReactions(applyOk(state, cast!.action));

    const target = result.combat!.units.unit_p2_skeletons;
    expect(target.abilitiesSuppressed).toBeFalsy();
    expect(hasUnitAbilityEffect(target, "DOUBLE_ATTACK")).toBe(true);
    expect(getUnitAbilityDefinitions(target).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Sacrifice — transfer damage from one of your units to another (it perishes).
// ---------------------------------------------------------------------------

describe("Sacrifice spell", () => {
  it("is only offered on a damaged friendly unit (never undamaged, never an enemy)", () => {
    const state = createInitialGameState("sac-target");
    state.players.p1.hand = ["spell.sacrifice"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    state.combat!.units.unit_p1_griffins.damage = 0; // undamaged friendly
    state.combat!.units.unit_p1_crusaders.damage = 3; // damaged friendly
    state.combat!.units.unit_p2_skeletons.damage = 3; // damaged enemy

    const targets = getLegalActions(state, "p1")
      .map((legal) => legal.action)
      .filter(
        (action): action is Extract<GameAction, { type: "CAST_SPELL" }> =>
          action.type === "CAST_SPELL" && action.cardId === "spell.sacrifice"
      )
      .map((action) => (action.target.type === "unit" ? action.target.unitId : null));

    expect(targets).toContain("unit_p1_crusaders"); // damaged friendly → offered
    expect(targets).not.toContain("unit_p1_griffins"); // undamaged friendly → not
    expect(targets).not.toContain("unit_p2_skeletons"); // enemy → not
  });

  it("transfers the heal target's wounds onto the sacrifice (heal's damage is the cap)", () => {
    const state = createInitialGameState("sac-basic");
    state.players.p1.hand = ["spell.sacrifice"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";

    const heal = state.combat!.units.unit_p1_griffins; // bronze heal target
    heal.maxHealth = 10;
    heal.damage = 4;
    const sacrifice = state.combat!.units.unit_p1_crusaders;
    sacrifice.maxHealth = 10;
    sacrifice.damage = 0; // 10 HP remaining

    const cast = findCast(state, "p1", "spell.sacrifice", "unit_p1_griffins");
    expect(cast, "Sacrifice should be castable on a damaged friendly unit").toBeTruthy();
    let s = passAllReactions(applyOk(state, cast!.action));

    const choice = abilityChoice(s);
    expect(choice.kind).toBe("sacrifice-transfer");
    expect(choice.candidateUnitIds).toContain("unit_p1_crusaders");
    expect(choice.candidateUnitIds).not.toContain("unit_p1_griffins"); // not the heal target
    expect(choice.candidateUnitIds).not.toContain("unit_p2_skeletons"); // not an enemy

    s = applyOk(s, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p1_crusaders"
    });

    // transfer = min(heal.damage 4, sacrifice remaining HP 10) = 4.
    expect(s.combat!.units.unit_p1_griffins.damage).toBe(0); // fully healed
    expect(s.combat!.units.unit_p1_crusaders.damage).toBe(4); // took the 4 wounds, survives
    expect(s.pendingChoice).toBeNull();
  });

  it("caps the transfer at the sacrifice's remaining HP — it perishes, the heal target keeps the rest", () => {
    const state = createInitialGameState("sac-cap");
    state.players.p1.hand = ["spell.sacrifice"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";

    const heal = state.combat!.units.unit_p1_griffins;
    heal.maxHealth = 10;
    heal.damage = 8; // badly wounded
    const sacrifice = state.combat!.units.unit_p1_crusaders; // a Pack
    sacrifice.maxHealth = 10;
    sacrifice.damage = 9; // only 1 HP remaining

    const cast = findCast(state, "p1", "spell.sacrifice", "unit_p1_griffins");
    let s = passAllReactions(applyOk(state, cast!.action));
    const choice = abilityChoice(s);
    s = applyOk(s, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p1_crusaders"
    });

    // transfer = min(heal.damage 8, sacrifice remaining HP 1) = 1.
    expect(s.combat!.units.unit_p1_griffins.damage).toBe(7); // healed by exactly 1
    // The sacrifice reached its remaining HP and perished — a Pack flips to Few.
    expect(s.eventLog.some((event) => event.type === "UNIT_FLIPPED" && event.unitId === "unit_p1_crusaders")).toBe(true);
    expect(s.combat!.units.unit_p1_crusaders.variant).toBe("few");
  });

  it("is grade-gated on the heal target: Power 0 cannot sacrifice for a gold unit, Power 4 can", () => {
    function sacrificeFor(power: number): GameState {
      const state = createInitialGameState(`sac-gate-${power}`);
      state.players.p1.hand = ["spell.sacrifice", "stat.power", "stat.power"];
      state.players.p2.hand = [];
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = "unit_p1_marksmen";
      const heal = state.combat!.units.unit_p1_crusaders;
      heal.grade = "gold"; // raise the heal target above the bronze gate
      heal.maxHealth = 10;
      heal.damage = 6;
      const sacrifice = state.combat!.units.unit_p1_griffins;
      sacrifice.maxHealth = 10;
      sacrifice.damage = 0;
      const cast = findCast(state, "p1", "spell.sacrifice", "unit_p1_crusaders");
      const casted = applyOk(state, cast!.action);
      casted.stack[0]!.modifiers.spellPowerBonus = power;
      return passAllReactions(casted);
    }

    // Power 0 → bronze gate: a gold heal target is above it, so the cast fizzles
    // (no follow-up choice opens, the unit stays wounded).
    const gated = sacrificeFor(0);
    expect(gated.pendingChoice).toBeNull();
    expect(gated.combat!.units.unit_p1_crusaders.damage).toBe(6);

    // Power 4 → gold gate: the transfer goes through.
    let powered = sacrificeFor(4);
    const choice = abilityChoice(powered);
    expect(choice.kind).toBe("sacrifice-transfer");
    powered = applyOk(powered, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p1_griffins"
    });
    // transfer = min(6, 10) = 6 → the gold heal target is fully healed.
    expect(powered.combat!.units.unit_p1_crusaders.damage).toBe(0);
    expect(powered.combat!.units.unit_p1_griffins.damage).toBe(6);
  });
});

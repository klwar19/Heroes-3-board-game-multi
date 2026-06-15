import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions, getPendingReactionPower } from "./index";
import type { GameAction, GameState, PlayerId, UnitId } from "./state";

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function reactionFor(state: GameState, playerId: PlayerId, cardId: string, mode: "basic" | "expert" = "basic") {
  return getLegalActions(state, playerId).find(
    (legal) =>
      legal.action.type === "PLAY_REACTION" && legal.action.cardId === cardId && legal.action.mode === mode
  );
}

/**
 * p2 (SECOND in turn order) is the caster, mid-combat with the skeletons active.
 * Casting puts the spell on the stack and opens the Power/reaction window.
 */
function castByP2(p2Hand: string[], p1Hand: string[], target: UnitId = "unit_p1_griffins"): GameState {
  const state = createInitialGameState();
  state.players.p2.hand = [...p2Hand];
  state.players.p1.hand = [...p1Hand];
  state.activePlayerId = "p2";
  state.combat!.activeUnitId = "unit_p2_skeletons";
  state.combat!.units.unit_p2_skeletons.activatedThisRound = false;
  // Big pools so nobody dies before the spell is redirected/read.
  state.combat!.units.unit_p1_griffins.maxHealth = 30;
  state.combat!.units.unit_p2_skeletons.maxHealth = 30;
  return applyOk(state, {
    type: "CAST_SPELL",
    playerId: "p2",
    cardId: p2Hand.find((id) => id.startsWith("spell.")) ?? p2Hand[0],
    target: { type: "unit", unitId: target }
  });
}

describe("caster empowers first (turn-order independent)", () => {
  it("hands the caster priority FIRST even when they are second in turn order", () => {
    // turnOrder is [p1, p2]; p2 casts. The OPPONENT (p1) holds Resistance and a
    // Magic Mirror, so both players are eligible to react. The caster must still
    // go first so it can finish empowering before p1 decides anything.
    const state = castByP2(
      ["spell.magic_arrow", "stat.power", "stat.power"],
      ["ability.resistance", "spell.magic_mirror"]
    );

    expect(state.reactionWindow).toBeTruthy();
    expect(state.reactionWindow!.allowedPlayerIds).toContain("p1");
    expect(state.reactionWindow!.allowedPlayerIds).toContain("p2");
    // The caster (p2) is first — the fix. With plain turn order this was p1,
    // who could Resist a Power-0 spell before it was ever empowered.
    expect(state.reactionWindow!.priorityPlayerId).toBe("p2");
    expect(state.reactionWindow!.allowedPlayerIds[0]).toBe("p2");

    // p2 can empower right now; p1 may not act out of turn.
    expect(reactionFor(state, "p2", "stat.power")).toBeTruthy();
    expect(
      getLegalActions(state, "p1").some(
        (legal) => legal.action.type === "PLAY_REACTION" || legal.action.type === "PASS_REACTION"
      )
    ).toBe(false);
  });

  it("also hands the ATTACKER priority first when they are second in turn order", () => {
    const state = createInitialGameState("attacker-first");
    // p2 attacks on its own turn while holding an instant spell + Power.
    state.players.p2.hand = ["spell.bloodlust", "stat.power"];
    state.players.p1.hand = ["ability.resistance"];
    state.activePlayerId = "p2";
    state.combat!.units.unit_p2_skeletons.position = 13;
    state.combat!.units.unit_p1_griffins.position = 9;
    state.combat!.units.unit_p2_skeletons.activatedThisRound = false;
    state.combat!.activeUnitId = "unit_p2_skeletons";

    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: "unit_p2_skeletons",
      defenderId: "unit_p1_griffins"
    });

    expect(declared.reactionWindow!.priorityPlayerId).toBe("p2");
  });
});

describe("empowered spell vs Resistance vs Magic Mirror", () => {
  it("empowering past Power 1 turns off basic Resistance, never Magic Mirror, and the redirect carries the full Power", () => {
    let state = castByP2(
      ["spell.magic_arrow", "stat.power", "stat.power"],
      ["ability.resistance", "spell.magic_mirror"]
    );

    // p2 empowers twice → Power 2. Each play keeps priority with the caster.
    state = applyOk(state, reactionFor(state, "p2", "stat.power")!.action);
    state = applyOk(state, reactionFor(state, "p2", "stat.power")!.action);

    const power = getPendingReactionPower(state);
    expect(power).toEqual({
      kind: "spell",
      spellCardId: "spell.magic_arrow",
      basePower: 0,
      fueledPower: 2,
      totalPower: 2
    });

    // p2 is out of Power, so priority falls to p1 against the FINAL Power.
    expect(state.reactionWindow!.priorityPlayerId).toBe("p1");

    // Basic Resistance only ends a spell of Power ≤ 1, so at Power 2 it is gone;
    // expert Resistance (ignore any Power) and Magic Mirror remain.
    expect(reactionFor(state, "p1", "ability.resistance", "basic")).toBeFalsy();
    expect(reactionFor(state, "p1", "ability.resistance", "expert")).toBeTruthy();
    const mirror = reactionFor(state, "p1", "spell.magic_mirror");
    expect(mirror, "Magic Mirror is offered at any Power").toBeTruthy();

    // p1 deflects the Power-2 Magic Arrow back onto the caster's own skeletons.
    state = applyOk(state, mirror!.action);
    const choice = state.pendingChoice;
    expect(choice && choice.type === "ABILITY_TARGET_CHOICE").toBe(true);
    if (!choice || choice.type !== "ABILITY_TARGET_CHOICE") {
      throw new Error("expected redirect choice");
    }
    expect(choice.candidateUnitIds).toContain("unit_p2_skeletons");
    state = applyOk(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p2_skeletons"
    });

    // Magic Arrow at Power 2 deals 3 — onto the caster's unit, at the Power used.
    expect(state.combat!.units.unit_p2_skeletons.damage).toBe(3);
    expect(state.combat!.units.unit_p1_griffins.damage).toBe(0);
    expect(state.eventLog.some((event) => event.type === "SPELL_REDIRECTED")).toBe(true);
  });

  it("still lets basic Resistance cancel an UN-empowered (Power 0) spell", () => {
    // Regression guard: the gate is the FINAL power, not 'always off'.
    let state = castByP2(["spell.magic_arrow"], ["ability.resistance"]);
    // p2 has nothing to empower with, so priority is p1 at Power 0.
    expect(state.reactionWindow!.priorityPlayerId).toBe("p1");
    const resist = reactionFor(state, "p1", "ability.resistance", "basic");
    expect(resist, "basic Resistance ends a Power-0 spell").toBeTruthy();
    state = applyOk(state, resist!.action);
    expect(state.combat!.units.unit_p1_griffins.damage).toBe(0);
    expect(state.eventLog.some((event) => event.type === "SPELL_CAST_CANCELLED")).toBe(true);
  });
});

describe("getPendingReactionPower readout", () => {
  it("is null with no open window and climbs with each Power played into a cast", () => {
    const base = createInitialGameState();
    expect(getPendingReactionPower(base)).toBeNull();

    let state = castByP2(["spell.magic_arrow", "stat.power", "stat.power"], ["spell.magic_mirror"]);
    expect(getPendingReactionPower(state)).toMatchObject({ basePower: 0, fueledPower: 0, totalPower: 0 });

    state = applyOk(state, reactionFor(state, "p2", "stat.power")!.action);
    expect(getPendingReactionPower(state)).toMatchObject({ fueledPower: 1, totalPower: 1 });

    state = applyOk(state, reactionFor(state, "p2", "stat.power")!.action);
    expect(getPendingReactionPower(state)).toMatchObject({ fueledPower: 2, totalPower: 2 });
  });

  it("counts every fuel source — School of Magic and a Brimstone town cube — in the readout", () => {
    // Stand in for the +1 School-of-Magic bonus and a spent Brimstone cube the
    // same way the wiki-spell tests stand in for paid Power (set on the stack).
    const state = castByP2(["spell.magic_arrow", "stat.power"], ["spell.magic_mirror"]);
    const stackItem = state.stack.at(-1)!;
    stackItem.modifiers.schoolPowerBonus = 1;
    stackItem.modifiers.townCubePowerBonus = 1;
    expect(getPendingReactionPower(state)).toMatchObject({
      kind: "spell",
      basePower: 0,
      fueledPower: 2,
      totalPower: 2
    });
  });

  it("reports the Power fuelled into an attack's spell instant", () => {
    const state = createInitialGameState("attack-readout");
    // A spare second Power keeps the window open after the first one is paid, so
    // the readout is still live to assert (the last possible play would resolve
    // the attack and close the window).
    state.players.p1.hand = ["spell.bloodlust", "stat.power", "stat.power"];
    state.players.p2.hand = [];
    state.combat!.units.unit_p1_griffins.position = 9;
    state.combat!.units.unit_p2_skeletons.position = 13;

    const declared = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    // No Power-scaling spell on the attack yet → nothing to report.
    expect(getPendingReactionPower(declared)).toBeNull();

    const withSpell = applyOk(declared, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "spell.bloodlust",
      mode: "basic"
    });
    expect(getPendingReactionPower(withSpell)).toMatchObject({ kind: "attack", fueledPower: 0, totalPower: 0 });

    const withPower = applyOk(withSpell, {
      type: "PLAY_REACTION",
      playerId: "p1",
      cardId: "stat.power",
      mode: "basic"
    });
    expect(getPendingReactionPower(withPower)).toMatchObject({ kind: "attack", fueledPower: 1, totalPower: 1 });
  });
});

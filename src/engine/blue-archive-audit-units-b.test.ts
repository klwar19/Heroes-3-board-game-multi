import { describe, expect, it } from "vitest";

import { applyAction, createInitialGameState } from "./index";
import { applyCombatStartUnitAbilities } from "./adventure-reducer";
import { getOrthogonalNeighbors } from "./battlefield";
import { maybeOpenKivotosCombatStartChoice, maybeOpenPlayerActivationChoice } from "./reducer";
import type { GameAction, GameState } from "./state";

/**
 * Audit batch 2 (Aru, Neru, Toki, Azusa, Wakamo, Saori, Iori, Mutsuki, Miyo,
 * Hasumi): OUTCOME tests for the abilities `blue-archive-unit-abilities.test.ts`
 * never pinned (Outlaw Shot, Winged Pursuit, CQC Overdrive, Arius Ambush,
 * Cartographer's Plan, Eagle Eye) plus the negative space of a few covered ones.
 * Every case carries a CONTROL (condition unmet, or ability absent) on the same
 * setup, and asserts damage / position / offer — never an intermediate field.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function settle(state: GameState): GameState {
  let current = state;
  for (let safety = 60; safety > 0 && current.reactionWindow; safety -= 1) {
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** One p1 attack on a p2 unit; abilities/rolls/geometry fully scripted. */
function duel(options: {
  seed: string;
  attackerAbilities?: string[];
  defenderAbilities?: string[];
  adjacent: boolean;
  rolls: number[];
  attackerMoved?: boolean;
  defenderMoved?: boolean;
  attackerType?: "ground" | "ranged";
  defenderDamage?: number;
}): GameState {
  const state = createInitialGameState(options.seed);
  for (const unit of Object.values(state.combat!.units)) unit.abilities = [];
  const attacker = state.combat!.units.unit_p1_marksmen;
  const defender = state.combat!.units.unit_p2_skeletons;
  attacker.abilities = options.attackerAbilities ?? [];
  defender.abilities = options.defenderAbilities ?? [];
  attacker.type = options.attackerType ?? (options.adjacent ? "ground" : "ranged");
  attacker.attack = 3;
  attacker.defense = 0;
  attacker.position = 1;
  attacker.damage = 0;
  attacker.maxHealth = 30;
  attacker.movedThisActivation = options.attackerMoved ?? false;
  defender.position = options.adjacent ? getOrthogonalNeighbors(attacker.position)[0] : 13;
  defender.attack = 3;
  defender.defense = 1;
  defender.damage = options.defenderDamage ?? 0;
  defender.maxHealth = 30;
  defender.defenseToken = false;
  defender.retaliatedThisRound = false;
  defender.activatedThisRound = false;
  defender.movedThisActivation = options.defenderMoved ?? false;
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = attacker.id;
  state.combat!.dice.scriptedRolls = [...options.rolls];
  state.combat!.dice.rollCount = 0;
  return settle(applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: attacker.id, defenderId: defender.id }));
}

const dmg = (state: GameState, unitId: string): number => state.combat!.units[unitId].damage;

describe("Blue Archive audit — batch 2 outcome tests", () => {
  // ---------------------------------------------------------------- Aru
  it("Outlaw Shot adds exactly 1 damage only when the ATTACK's own die shows +1 (no extra die is thrown)", () => {
    // Authored: "On a +1 Attack-die result, deal 1 additional damage after the attack
    // resolves." The judged die is the attack's own (Attack 3 vs Defense 1: +1 ⇒ 3,
    // 0 ⇒ 2, -1 ⇒ 1) — the sibling Hina End of Vacation reads the same die. The
    // trailing scripted face would be the extra die under the old reading; with the
    // fix it is never consumed, so its value cannot change the outcome.
    const controlPlus = dmg(duel({ seed: "outlaw-control", adjacent: false, rolls: [1, -1] }), "unit_p2_skeletons");
    const plusOne = dmg(duel({ seed: "outlaw-plus", attackerAbilities: ["kivotos-outlaw-shot"], adjacent: false, rolls: [1, -1] }), "unit_p2_skeletons");
    const controlZero = dmg(duel({ seed: "outlaw-zero-control", adjacent: false, rolls: [0, 1] }), "unit_p2_skeletons");
    const zero = dmg(duel({ seed: "outlaw-zero", attackerAbilities: ["kivotos-outlaw-shot"], adjacent: false, rolls: [0, 1] }), "unit_p2_skeletons");
    const controlMinus = dmg(duel({ seed: "outlaw-minus-control", adjacent: false, rolls: [-1, 1] }), "unit_p2_skeletons");
    const minus = dmg(duel({ seed: "outlaw-minus", attackerAbilities: ["kivotos-outlaw-shot"], adjacent: false, rolls: [-1, 1] }), "unit_p2_skeletons");
    expect(controlPlus).toBe(3);
    expect(plusOne).toBe(controlPlus + 1);
    expect(controlZero).toBe(2);
    expect(zero).toBe(controlZero);
    expect(controlMinus).toBe(1);
    expect(minus).toBe(controlMinus);
    // No ability die is rolled, so no ability-roll reroll window can open either.
    const plusState = duel({ seed: "outlaw-plus-window", attackerAbilities: ["kivotos-outlaw-shot"], adjacent: false, rolls: [1, -1] });
    expect(plusState.pendingChoice?.type).not.toBe("ATTACK_DIE_REROLL");
    expect(plusState.eventLog.some((event) => "message" in event && String(event.message).includes("Attack die shows 1"))).toBe(true);
  });

  it("Outlaw Shot never fires on Aru's Retaliation Attack", () => {
    // p2 skeletons (Aru) retaliate against p1; dice: p1 attack 0, retaliation 0, then a would-be extra die +1.
    const control = duel({ seed: "outlaw-retal-control", adjacent: true, rolls: [0, 0, 1, 1] });
    const aru = duel({ seed: "outlaw-retal", defenderAbilities: ["kivotos-outlaw-shot"], adjacent: true, rolls: [0, 0, 1, 1] });
    expect(dmg(control, "unit_p1_marksmen")).toBeGreaterThan(0);
    expect(dmg(aru, "unit_p1_marksmen")).toBe(dmg(control, "unit_p1_marksmen"));
  });

  it("Hardboiled Boss offers no reroll on a 0 or +1 (negative space)", () => {
    const zero = duel({ seed: "hardboiled-zero", attackerAbilities: ["kivotos-hardboiled-boss"], adjacent: false, rolls: [0, 0] });
    const plus = duel({ seed: "hardboiled-plus", attackerAbilities: ["kivotos-hardboiled-boss"], adjacent: false, rolls: [1, 0] });
    const minus = duel({ seed: "hardboiled-minus", attackerAbilities: ["kivotos-hardboiled-boss"], adjacent: false, rolls: [-1, 0] });
    expect(zero.pendingChoice?.type).not.toBe("ATTACK_DIE_REROLL");
    expect(plus.pendingChoice?.type).not.toBe("ATTACK_DIE_REROLL");
    expect(minus.pendingChoice?.type).toBe("ATTACK_DIE_REROLL");
  });

  // ---------------------------------------------------------------- Neru
  it("CQC Overdrive attacks the same target a second time on a 0 or -1 only, and retaliation still happens exactly once", () => {
    const controlZero = duel({ seed: "cqc-control-0", adjacent: true, rolls: [0, 0, 0, 0] });
    const neruZero = duel({ seed: "cqc-0", attackerAbilities: ["kivotos-cqc-overdrive"], adjacent: true, rolls: [0, 0, 0, 0] });
    const neruMinus = duel({ seed: "cqc-minus", attackerAbilities: ["kivotos-cqc-overdrive"], adjacent: true, rolls: [-1, -1, -1, -1] });
    const controlMinus = duel({ seed: "cqc-control-minus", adjacent: true, rolls: [-1, -1, -1, -1] });
    const neruPlus = duel({ seed: "cqc-plus", attackerAbilities: ["kivotos-cqc-overdrive"], adjacent: true, rolls: [1, 1, 1, 1] });
    const controlPlus = duel({ seed: "cqc-control-plus", adjacent: true, rolls: [1, 1, 1, 1] });

    expect(dmg(controlZero, "unit_p2_skeletons")).toBe(2);
    expect(dmg(neruZero, "unit_p2_skeletons")).toBe(4);
    expect(dmg(neruMinus, "unit_p2_skeletons")).toBe(dmg(controlMinus, "unit_p2_skeletons") * 2);
    expect(dmg(neruPlus, "unit_p2_skeletons")).toBe(dmg(controlPlus, "unit_p2_skeletons"));
    // Exactly one follow-up (never a third), and the defender's single retaliation is unchanged.
    expect(neruZero.eventLog.filter((event) => event.type === "UNIT_ABILITY_TRIGGERED" && event.abilityId === "kivotos-cqc-overdrive")).toHaveLength(1);
    expect(neruZero.combat!.units.unit_p1_marksmen.attacksThisActivation).toBe(2);
    expect(dmg(neruZero, "unit_p1_marksmen")).toBeGreaterThan(0);
    expect(dmg(neruZero, "unit_p1_marksmen")).toBe(dmg(controlZero, "unit_p1_marksmen"));
    // Engine reading: the second attack is FORCED (no choice opens) — the authored text says "may".
    expect(neruZero.pendingChoice).toBeNull();
  });

  // ---------------------------------------------------------------- Saori
  it("Arius Ambush lets Saori move up to 2 spaces (or stay) after deployment, without arming a move-triggered ability", () => {
    const build = (abilityId: string | null): GameState => {
      const state = createInitialGameState(`arius-ambush-${abilityId ?? "control"}`);
      for (const unit of Object.values(state.combat!.units)) unit.abilities = [];
      const saori = state.combat!.units.unit_p1_marksmen;
      saori.abilities = abilityId ? [abilityId] : [];
      saori.position = 0;
      applyCombatStartUnitAbilities(state);
      maybeOpenKivotosCombatStartChoice(state);
      return state;
    };
    expect(build(null).pendingChoice).toBeNull();

    let state = build("kivotos-arius-ambush");
    const saoriId = "unit_p1_marksmen";
    const choice = state.pendingChoice;
    expect(choice).toMatchObject({ type: "OPTION_CHOICE", context: "combat-step", playerId: "p1" });
    if (!choice || choice.type !== "OPTION_CHOICE" || !choice.step) throw new Error("Expected Arius Ambush step choice.");
    expect(choice.step.unitId).toBe(saoriId);
    // Every offered destination is within 2 orthogonal steps of the start.
    const ring1 = new Set(getOrthogonalNeighbors(0));
    const ring2 = new Set([...ring1].flatMap((position) => getOrthogonalNeighbors(position)));
    for (const position of choice.step.positions) {
      expect(ring1.has(position) || ring2.has(position), `position ${position} is farther than 2`).toBe(true);
      expect(position).not.toBe(0);
    }
    expect(choice.step.positions.length).toBeGreaterThan(1);
    expect(choice.options.at(-1)?.label).toBe("Stay here");

    const farthest = choice.step.positions.find((position) => !ring1.has(position));
    expect(farthest).toBeDefined();
    const moved = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: choice.step.positions.indexOf(farthest!)
    });
    expect(moved.combat!.units[saoriId].position).toBe(farthest);
    expect(moved.combat!.units[saoriId].movedThisActivation).toBeFalsy();
    expect(moved.pendingChoice).toBeNull();

    // "Stay here" keeps the deployment space.
    state = build("kivotos-arius-ambush");
    const stayed = applyOk(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: (state.pendingChoice as { options: unknown[] }).options.length - 1
    });
    expect(stayed.combat!.units[saoriId].position).toBe(0);
  });

  // ---------------------------------------------------------------- Miyo
  it("Cartographer's Plan teleports one OTHER allied unit before Miyo moves, and offers nothing once Miyo has moved", () => {
    const build = (options: { ability: boolean; moved?: boolean }): GameState => {
      const state = createInitialGameState(`cartographer-${options.ability}-${options.moved ?? false}`);
      for (const unit of Object.values(state.combat!.units)) unit.abilities = [];
      const miyo = state.combat!.units.unit_p1_marksmen;
      miyo.abilities = options.ability ? ["kivotos-cartographers-plan"] : [];
      miyo.position = 0;
      miyo.movedThisActivation = options.moved ?? false;
      state.combat!.units.unit_p1_griffins.position = 2;
      state.combat!.activeUnitId = miyo.id;
      state.activePlayerId = "p1";
      maybeOpenPlayerActivationChoice(state);
      return state;
    };
    expect(build({ ability: false }).pendingChoice).toBeNull();
    expect(build({ ability: true, moved: true }).pendingChoice).toBeNull();

    let state = build({ ability: true });
    const pick = state.pendingChoice;
    expect(pick).toMatchObject({ type: "ABILITY_TARGET_CHOICE", kind: "jotunn-teleport", abilityId: "kivotos-cartographers-plan", playerId: "p1" });
    if (!pick || pick.type !== "ABILITY_TARGET_CHOICE") throw new Error("Expected Cartographer's Plan target pick.");
    expect(pick.candidateUnitIds).toContain("unit_p1_griffins");
    expect(pick.candidateUnitIds).not.toContain("unit_p1_marksmen");
    expect(pick.candidateUnitIds.some((id) => state.combat!.units[id].controllerId === "p2")).toBe(false);

    state = applyOk(state, { type: "CHOOSE_ABILITY_TARGET", playerId: "p1", choiceId: pick.id, targetUnitId: "unit_p1_griffins" });
    const landing = state.pendingChoice;
    expect(landing).toMatchObject({ type: "OPTION_CHOICE", context: "combat-teleport" });
    if (!landing || landing.type !== "OPTION_CHOICE" || !landing.teleport) throw new Error("Expected teleport landing pick.");
    const destination = landing.teleport.positions.find((position) => position !== 2 && position !== 0);
    expect(destination).toBeDefined();
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: landing.id, optionIndex: landing.teleport.positions.indexOf(destination!) });
    expect(state.combat!.units.unit_p1_griffins.position).toBe(destination);
    expect(state.combat!.units.unit_p1_marksmen.position).toBe(0);
    expect(state.combat!.units.unit_p1_marksmen.activationAbilityDone).toBe(true);
    // Miyo still has her own activation: the plan never spends her move.
    expect(state.combat!.units.unit_p1_marksmen.movedThisActivation).toBeFalsy();

    // Skipping teleports nobody and does not re-open the choice this activation.
    state = build({ ability: true });
    state = applyOk(state, { type: "CHOOSE_ABILITY_TARGET", playerId: "p1", choiceId: state.pendingChoice!.id, targetUnitId: "skip" });
    expect(state.pendingChoice).toBeNull();
    expect(state.combat!.units.unit_p1_griffins.position).toBe(2);
    maybeOpenPlayerActivationChoice(state);
    expect(state.pendingChoice).toBeNull();
  });

  // ---------------------------------------------------------------- Hasumi
  it("Eagle Eye adds exactly +1 Attack only when Hasumi moved before attacking, and never on her retaliation", () => {
    const stood = dmg(duel({ seed: "eagle-stood", attackerAbilities: ["kivotos-eagle-eye"], adjacent: true, rolls: [0, 0] }), "unit_p2_skeletons");
    const moved = dmg(duel({ seed: "eagle-moved", attackerAbilities: ["kivotos-eagle-eye"], adjacent: true, rolls: [0, 0], attackerMoved: true }), "unit_p2_skeletons");
    const controlMoved = dmg(duel({ seed: "eagle-control-moved", adjacent: true, rolls: [0, 0], attackerMoved: true }), "unit_p2_skeletons");
    expect(controlMoved).toBe(2);
    expect(stood).toBe(controlMoved);
    expect(moved).toBe(controlMoved + 1);

    // Retaliation: a Hasumi who moved this activation retaliates with no bonus.
    const retalControl = duel({ seed: "eagle-retal-control", adjacent: true, rolls: [0, 0], defenderMoved: true });
    const retalHasumi = duel({ seed: "eagle-retal", defenderAbilities: ["kivotos-eagle-eye"], adjacent: true, rolls: [0, 0], defenderMoved: true });
    expect(dmg(retalControl, "unit_p1_marksmen")).toBeGreaterThan(0);
    expect(dmg(retalHasumi, "unit_p1_marksmen")).toBe(dmg(retalControl, "unit_p1_marksmen"));
  });

  it("Winged Pursuit adds exactly 1 damage when the ATTACK's own die shows 0 or +1, not on -1", () => {
    // Authored: "On a 0 or +1 Attack-die result, deal 1 additional damage." — the
    // attack's own die, same reading as Outlaw Shot / Hina's End of Vacation.
    const controlZero = dmg(duel({ seed: "winged-control", adjacent: false, rolls: [0, -1] }), "unit_p2_skeletons");
    const zero = dmg(duel({ seed: "winged-zero", attackerAbilities: ["kivotos-winged-pursuit"], adjacent: false, rolls: [0, -1] }), "unit_p2_skeletons");
    const controlPlus = dmg(duel({ seed: "winged-plus-control", adjacent: false, rolls: [1, -1] }), "unit_p2_skeletons");
    const plus = dmg(duel({ seed: "winged-plus", attackerAbilities: ["kivotos-winged-pursuit"], adjacent: false, rolls: [1, -1] }), "unit_p2_skeletons");
    const controlMinus = dmg(duel({ seed: "winged-minus-control", adjacent: false, rolls: [-1, 1] }), "unit_p2_skeletons");
    const minus = dmg(duel({ seed: "winged-minus", attackerAbilities: ["kivotos-winged-pursuit"], adjacent: false, rolls: [-1, 1] }), "unit_p2_skeletons");
    expect(controlZero).toBe(2);
    expect(zero).toBe(controlZero + 1);
    expect(controlPlus).toBe(3);
    expect(plus).toBe(controlPlus + 1);
    expect(controlMinus).toBe(1);
    expect(minus).toBe(controlMinus);
  });

  // ---------------------------------------------------------------- negative space of covered abilities
  it("Prefect Snipe gives nothing against an ADJACENT damaged target (negative space)", () => {
    const control = dmg(duel({ seed: "snipe-adj-control", adjacent: true, rolls: [0, 0], defenderDamage: 1 }), "unit_p2_skeletons");
    const iori = dmg(duel({ seed: "snipe-adj", attackerAbilities: ["kivotos-prefect-snipe"], adjacent: true, rolls: [0, 0], defenderDamage: 1 }), "unit_p2_skeletons");
    expect(iori).toBe(control);
  });

  it("Sagitta Mortis neither pierces nor is spent on an ADJACENT attack (negative space)", () => {
    const control = duel({ seed: "sagitta-adj-control", adjacent: true, rolls: [0, 0] });
    const azusa = duel({ seed: "sagitta-adj", attackerAbilities: ["kivotos-sagitta-mortis"], adjacent: true, rolls: [0, 0] });
    expect(dmg(azusa, "unit_p2_skeletons")).toBe(dmg(control, "unit_p2_skeletons"));
    expect(azusa.combat!.units.unit_p1_marksmen.sagittaMortisUsedRound).toBeUndefined();
  });

  it("Trick Mine ignores a RANGED attacker (negative space)", () => {
    const rangedControl = duel({ seed: "trick-ranged-control", adjacent: false, rolls: [0, 0] });
    const ranged = duel({ seed: "trick-ranged", defenderAbilities: ["kivotos-trick-mine"], adjacent: false, rolls: [0, 0] });
    const melee = duel({ seed: "trick-melee", defenderAbilities: ["kivotos-trick-mine"], adjacent: true, rolls: [0, 0] });
    const meleeControl = duel({ seed: "trick-melee-control", adjacent: true, rolls: [0, 0] });
    expect(dmg(ranged, "unit_p1_marksmen")).toBe(dmg(rangedControl, "unit_p1_marksmen"));
    expect(ranged.combat!.units.unit_p2_skeletons.mutsukiTrickMineUsedThisCombat).toBeFalsy();
    expect(dmg(melee, "unit_p1_marksmen")).toBe(dmg(meleeControl, "unit_p1_marksmen") + 1);
  });

  it("Foxfire Mark's +1 also rides Wakamo's Retaliation Attack against the marked unit (engine reading)", () => {
    // Wakamo (p2) is already marked on the p1 attacker; p1 strikes, Wakamo retaliates.
    const make = (armed: boolean): GameState => {
      const state = createInitialGameState(`foxfire-retal-${armed}`);
      for (const unit of Object.values(state.combat!.units)) unit.abilities = [];
      const attacker = state.combat!.units.unit_p1_marksmen;
      const wakamo = state.combat!.units.unit_p2_skeletons;
      attacker.type = "ground";
      attacker.attack = 3;
      attacker.defense = 1;
      attacker.position = 1;
      attacker.maxHealth = 30;
      attacker.damage = 0;
      wakamo.abilities = ["kivotos-foxfire-mark"];
      wakamo.position = getOrthogonalNeighbors(1)[0];
      wakamo.attack = 3;
      wakamo.defense = 1;
      wakamo.maxHealth = 30;
      wakamo.defenseToken = false;
      wakamo.retaliatedThisRound = false;
      wakamo.wakamoMarkedTargetId = armed ? attacker.id : undefined;
      wakamo.wakamoMarkArmed = armed;
      state.players.p1.hand = [];
      state.players.p2.hand = [];
      state.activePlayerId = "p1";
      state.combat!.activeUnitId = attacker.id;
      state.combat!.dice.scriptedRolls = [0, 0];
      state.combat!.dice.rollCount = 0;
      return settle(applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: attacker.id, defenderId: wakamo.id }));
    };
    expect(dmg(make(false), "unit_p1_marksmen")).toBe(2);
    expect(dmg(make(true), "unit_p1_marksmen")).toBe(3);
  });
});

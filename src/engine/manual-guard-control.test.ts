import { describe, expect, it } from "vitest";
import { startNeutralEncounter } from "./adventure-reducer";
import { applyAction, createAdventureGameState, NEUTRAL_PLAYER_ID } from "./index";
import { getLegalActions } from "./legal-actions";
import { manualGuardControllerId, neutralCombatControllerId, pvpNeutralControllerId } from "./neutral-control";
import type { CombatUnitState, GameAction, GameState, PlayerId, UnitGrade, UnitType } from "./state";

/**
 * Manual guard control (OPTIONAL Game-options toggle,
 * `GameSetupOptions.manualGuardControl`, default OFF — set like Undo moves):
 * the FIGHTER of a Neutral combat commands each guard personally through the
 * PvP-Neutral-Control unit menu — same must-attack discipline (attack when you
 * can; under polish-wait the guard may WAIT instead, and its Waited
 * re-activation must attack) — or hands any single activation back to the
 * rulebook AI with the "Let the unit act (automatic)" button.
 *
 * Every claim below is mutation-checked with a mode-off CONTROL, and the mode
 * never grants the fighter the PvP-only perks (the pre-battle formation sort,
 * the NEUTRAL_CONTROL_ASSIGNED notice).
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function makeGame(
  seed: string,
  options: { manualGuardControl?: boolean; houseRules?: Record<string, boolean> } = {}
): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    manualGuardControl: options.manualGuardControl ?? true,
    ...(options.houseRules ? { houseRules: options.houseRules } : {})
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  return state;
}

/** Opens a level-1 guard fight for p1 through the real Combat Setup flow. */
function fightWithGuards(
  seed: string,
  options: { manualGuardControl?: boolean; houseRules?: Record<string, boolean>; difficulty?: number } = {}
): GameState {
  let state = makeGame(seed, options);
  const fighter: PlayerId = "p1";
  state.activePlayerId = fighter;
  state.players[fighter].hand = [];
  const hero = state.heroes[`hero_${fighter}`];
  const field = Object.values(state.adventure!.fields).find((candidate) => (candidate.difficulty ?? 0) > 0);
  expect(field, "the map should hold at least one guarded field").toBeTruthy();
  field!.difficulty = options.difficulty ?? 1;
  startNeutralEncounter(state, hero, field!);
  expect(state.combat?.context.kind).toBe("neutral");

  const army = state.players[fighter].army;
  state = applyOk(state, { type: "PLACE_COMBAT_UNIT", playerId: fighter, armyUnitId: army[0].id, position: 13 });
  if (army[1]) {
    state = applyOk(state, { type: "PLACE_COMBAT_UNIT", playerId: fighter, armyUnitId: army[1].id, position: 14 });
  }
  let freeze = 99;
  for (const unit of Object.values(state.combat!.units)) {
    unit.initiative = freeze;
    freeze -= 1;
  }
  state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: fighter });
  state.combat!.dice.scriptedRolls = Array(40).fill(0);
  state.combat!.dice.rollCount = 0;
  return state;
}

function guardsOf(state: GameState): CombatUnitState[] {
  return Object.values(state.combat!.units).filter((unit) => unit.controllerId === NEUTRAL_PLAYER_ID);
}

function playerUnitsOf(state: GameState, playerId: PlayerId): CombatUnitState[] {
  return Object.values(state.combat!.units).filter((unit) => unit.controllerId === playerId);
}

function reshape(
  unit: CombatUnitState,
  shape: { grade?: UnitGrade; type?: UnitType; position: number; initiative?: number; attack?: number }
): CombatUnitState {
  unit.grade = shape.grade ?? unit.grade;
  unit.type = shape.type ?? "ground";
  unit.position = shape.position;
  unit.initiative = shape.initiative ?? unit.initiative;
  unit.attack = shape.attack ?? 1;
  unit.abilities = [];
  unit.maxHealth = 20;
  unit.damage = 0;
  unit.activatedThisRound = false;
  unit.movedThisActivation = false;
  unit.attackedThisActivation = false;
  return unit;
}

function onlyUnits(state: GameState, units: CombatUnitState[]): void {
  const map: Record<string, CombatUnitState> = {};
  for (const unit of units) {
    map[unit.id] = unit;
  }
  state.combat!.units = map;
  state.combat!.obstacles = [];
}

/** Drives defends / pauses / reaction passes until `stopWhen` (or a dead end). */
function driveTo(state: GameState, stopWhen: (state: GameState) => boolean): GameState {
  let safety = 40;
  while (safety > 0) {
    safety -= 1;
    if (stopWhen(state)) {
      return state;
    }
    if (state.reactionWindow) {
      state = applyOk(state, { type: "PASS_REACTION", playerId: state.reactionWindow.priorityPlayerId });
      continue;
    }
    const pause = state.combat?.pendingNeutralStep;
    if (pause) {
      state = applyOk(state, {
        type: "CONTINUE_NEUTRAL_STEP",
        playerId: pause.reactingPlayerId ?? state.combat!.attackerPlayerId
      });
      continue;
    }
    const active = state.combat?.activeUnitId ? state.combat.units[state.combat.activeUnitId] : null;
    if (active && active.controllerId !== NEUTRAL_PLAYER_ID && !state.pendingChoice) {
      state = applyOk(state, { type: "DEFEND_UNIT", playerId: active.controllerId, unitId: active.id });
      continue;
    }
    break;
  }
  return state;
}

/** The pump has stopped on a Neutral guard's activation for its human. */
function guardSlotOpen(state: GameState): boolean {
  const active = state.combat?.activeUnitId ? state.combat.units[state.combat.activeUnitId] : null;
  return Boolean(
    active &&
      active.controllerId === NEUTRAL_PLAYER_ID &&
      !active.activatedThisRound &&
      !state.pendingChoice &&
      !state.combat?.pendingNeutralStep &&
      !state.reactionWindow
  );
}

/** One guard adjacent to a prey, mode per options, driven to the guard's slot. */
function sceneGuardAdjacent(
  seed: string,
  options: { manualGuardControl?: boolean; houseRules?: Record<string, boolean> } = {},
  stopWhen: (state: GameState) => boolean = guardSlotOpen
): GameState {
  let state = fightWithGuards(seed, options);
  const [guard] = guardsOf(state);
  reshape(guard, { grade: "bronze", position: 5, initiative: 1 });
  const [preyA, preyB] = playerUnitsOf(state, "p1");
  reshape(preyA, { grade: "bronze", position: 1, initiative: 99 });
  if (preyB) {
    reshape(preyB, { grade: "silver", position: 9, initiative: 98 });
  }
  onlyUnits(state, [guard, preyA, ...(preyB ? [preyB] : [])]);
  state = driveTo(state, stopWhen);
  return state;
}

describe("Manual guard control — controller derivation", () => {
  it("assigns the FIGHTER as the guards' controller; CONTROLs: mode off = AI, computer fighter = AI", () => {
    const state = fightWithGuards("mgc-derive", { manualGuardControl: true });
    expect(manualGuardControllerId(state, state.combat!)).toBe("p1");
    expect(neutralCombatControllerId(state, state.combat!)).toBe("p1");
    // Never the PvP-mode controller — so no formation sort, no assignment notice.
    expect(pvpNeutralControllerId(state, state.combat!)).toBeNull();
    expect(state.combat!.pendingNeutralPlacement ?? null).toBeNull();
    expect(state.eventLog.some((event) => event.type === "NEUTRAL_CONTROL_ASSIGNED")).toBe(false);

    // CONTROL: with the option off, nobody controls — the plain AI plays.
    const off = fightWithGuards("mgc-derive-off", { manualGuardControl: false });
    expect(neutralCombatControllerId(off, off.combat!)).toBeNull();

    // CONTROL: a COMPUTER fighter keeps the plain AI even with the option on.
    const computer = fightWithGuards("mgc-derive-ai", { manualGuardControl: true });
    computer.controllers = { p1: { kind: "computer", difficulty: "standard", policyVersion: 1 } };
    expect(manualGuardControllerId(computer, computer.combat!)).toBeNull();
  });
});

describe("Manual guard control — the fighter commands the guard", () => {
  it("stops the pump on the guard's activation; the fighter attacks with it (must-attack: no Defend), or delegates to the AI", () => {
    const state = sceneGuardAdjacent("mgc-command", { manualGuardControl: true });
    expect(guardSlotOpen(state)).toBe(true);
    const [guard] = guardsOf(state);

    const offers = getLegalActions(state, "p1").map((legal) => legal.action);
    // Must-attack discipline: strikes are offered, Defend is not.
    const attack = offers.find(
      (action) => action.type === "ATTACK_UNIT" && action.attackerId === guard.id
    );
    expect(attack, "the guard's attack is offered to the fighter").toBeTruthy();
    expect(offers.some((action) => action.type === "DEFEND_UNIT" && action.unitId === guard.id)).toBe(false);
    // The AI delegation button is offered right next to the manual commands.
    expect(offers.some((action) => action.type === "AUTO_NEUTRAL_ACTIVATION")).toBe(true);

    // The fighter's command executes AS the neutral seat: the guard attacks.
    const struck = driveTo(applyOk(state, attack!), (s) => Boolean(guardsOf(s)[0]?.attackedThisActivation));
    expect(guardsOf(struck)[0]?.attackedThisActivation).toBe(true);

    // CONTROL: with the option off the guard slot never opens for the fighter —
    // the AI resolves the guard's activation on its own.
    const off = sceneGuardAdjacent(
      "mgc-command-off",
      { manualGuardControl: false },
      (s) => Boolean(guardsOf(s)[0]?.activatedThisRound)
    );
    expect(guardsOf(off)[0]?.activatedThisRound).toBe(true);
    expect(
      getLegalActions(off, "p1").some((legal) => legal.action.type === "AUTO_NEUTRAL_ACTIVATION")
    ).toBe(false);
  });

  it("AUTO_NEUTRAL_ACTIVATION hands ONE activation back to the rulebook AI (CONTROL: rejected with the mode off)", () => {
    const state = sceneGuardAdjacent("mgc-auto", { manualGuardControl: true });
    expect(guardSlotOpen(state)).toBe(true);

    const delegated = driveTo(
      applyOk(state, { type: "AUTO_NEUTRAL_ACTIVATION", playerId: "p1" }),
      (s) => Boolean(guardsOf(s)[0]?.activatedThisRound)
    );
    // The AI played the guard: adjacent to prey in must-attack spirit, it struck.
    expect(guardsOf(delegated)[0]?.activatedThisRound).toBe(true);
    expect(guardsOf(delegated)[0]?.attackedThisActivation).toBe(true);

    // CONTROL: with the mode off the action is rejected outright.
    const off = sceneGuardAdjacent(
      "mgc-auto-off",
      { manualGuardControl: false },
      (s) => Boolean(s.combat?.pendingNeutralStep)
    );
    const refused = applyAction(off, { type: "AUTO_NEUTRAL_ACTIVATION", playerId: "p1" });
    expect(refused.errors.length).toBeGreaterThan(0);
  });
});

describe("Manual guard control — polish-wait interplay", () => {
  it("in must-attack mode the guard may WAIT (polish-wait on), and its Waited re-activation must attack (no second Wait)", () => {
    const state = sceneGuardAdjacent("mgc-wait", {
      manualGuardControl: true,
      houseRules: { "polish-wait": true }
    });
    expect(guardSlotOpen(state)).toBe(true);
    const [guard] = guardsOf(state);

    const offers = getLegalActions(state, "p1").map((legal) => legal.action);
    const wait = offers.find((action) => action.type === "WAIT_UNIT" && action.unitId === guard.id);
    expect(wait, "WAIT is offered beside the mandatory attack").toBeTruthy();
    expect(offers.some((action) => action.type === "ATTACK_UNIT" && action.attackerId === guard.id)).toBe(true);

    // Wait, then drive to the guard's RE-activation in the wait phase.
    const waited = driveTo(applyOk(state, wait!), (s) => {
      const active = s.combat?.activeUnitId ? s.combat.units[s.combat.activeUnitId] : null;
      return Boolean(
        s.combat?.waitPhase &&
          active?.controllerId === NEUTRAL_PLAYER_ID &&
          !s.combat.pendingNeutralStep &&
          !s.reactionWindow &&
          !s.pendingChoice
      );
    });
    expect(waited.combat?.waitPhase).toBe(true);
    const reOffers = getLegalActions(waited, "p1").map((legal) => legal.action);
    // The Waited guard must attack: strikes offered, Wait no longer offered.
    expect(reOffers.some((action) => action.type === "ATTACK_UNIT")).toBe(true);
    expect(reOffers.some((action) => action.type === "WAIT_UNIT")).toBe(false);

    // CONTROL: without polish-wait the must-attack menu never offers WAIT.
    const noWait = sceneGuardAdjacent("mgc-wait-off", { manualGuardControl: true });
    expect(
      getLegalActions(noWait, "p1").some((legal) => legal.action.type === "WAIT_UNIT")
    ).toBe(false);
  });
});

describe("Manual guard control — option plumbing", () => {
  it("freezes the lobby option onto adventure state (CONTROL: absent by default)", () => {
    const on = createAdventureGameState({
      seed: "mgc-freeze",
      difficulty: "normal",
      rollFirstPlayer: false,
      manualGuardControl: true
    });
    expect(on.adventure?.manualGuardControl).toBe(true);

    const off = createAdventureGameState({ seed: "mgc-freeze-off", difficulty: "normal", rollFirstPlayer: false });
    expect(off.adventure?.manualGuardControl ?? false).toBe(false);
  });
});

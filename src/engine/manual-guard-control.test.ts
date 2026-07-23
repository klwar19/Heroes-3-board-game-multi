import { describe, expect, it } from "vitest";
import { startNeutralEncounter } from "./adventure-reducer";
import { applyAction, createAdventureGameState, NEUTRAL_PLAYER_ID } from "./index";
import { getLegalActions } from "./legal-actions";
import { manualGuardControllerId, neutralCombatControllerId, pvpNeutralControllerId } from "./neutral-control";
import type { CombatUnitState, GameAction, GameState, PlayerId, UnitGrade, UnitType } from "./state";

/**
 * Manual guard control (OPTIONAL Game-options toggle,
 * `GameSetupOptions.manualGuardControl`, default OFF — set like Undo moves):
 * the FIGHTER of a Neutral combat commands each guard personally with FULL free
 * control (move, attack, Defend, Wait, hold, tokens — never the must-attack AI
 * menu; that sub-toggle only binds a PvP Neutral Control opponent). They may
 * still hand any single activation back to the rulebook AI with the
 * "Let the unit act (automatic)" button.
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

/**
 * Runs the Combat Setup flow for a p1 guard fight up to (and stopping at) the
 * pre-battle Neutral formation-sort window when one opens (Manual guard control,
 * ≥2 guards). Used by the placement tests, which then drive the sort by hand.
 */
function fightToPlacement(
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

/** Opens a level-1 guard fight for p1 through the real Combat Setup flow. */
function fightWithGuards(
  seed: string,
  options: { manualGuardControl?: boolean; houseRules?: Record<string, boolean>; difficulty?: number } = {}
): GameState {
  let state = fightToPlacement(seed, options);
  // Manual guard control opens a pre-battle formation sort for the fighter with
  // ≥2 guards — finish it so downstream combat scenes reach round 1 as before.
  if (state.combat?.pendingNeutralPlacement === "p1") {
    state = applyOk(state, { type: "FINISH_NEUTRAL_PLACEMENT", playerId: "p1" });
  }
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
    // Never the PvP-mode controller: the fighter DOES get the pre-battle
    // formation sort (fightWithGuards finished it above, so it is null here),
    // but never the PvP NEUTRAL_CONTROL_ASSIGNED opponent-assignment notice.
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
  it("stops the pump on the guard's activation; the fighter has FULL free control (attack OR Defend/hold), or delegates to the AI", () => {
    const state = sceneGuardAdjacent("mgc-command", { manualGuardControl: true });
    expect(guardSlotOpen(state)).toBe(true);
    const [guard] = guardsOf(state);

    const offers = getLegalActions(state, "p1").map((legal) => legal.action);
    // Free control (manual-only): strikes AND Defend/hold are offered — not the
    // must-attack AI menu (that sub-toggle only binds PvP Neutral Control).
    const attack = offers.find(
      (action) => action.type === "ATTACK_UNIT" && action.attackerId === guard.id
    );
    expect(attack, "the guard's attack is offered to the fighter").toBeTruthy();
    expect(
      offers.some((action) => action.type === "DEFEND_UNIT" && action.unitId === guard.id),
      "Defend is offered under free manual control"
    ).toBe(true);
    expect(
      offers.some((action) => action.type === "END_ACTIVATION" && action.unitId === guard.id),
      "hold is offered under free manual control"
    ).toBe(true);
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
  it("under free manual control the guard may WAIT (polish-wait on), and its Waited re-activation must attack (no second Wait)", () => {
    const state = sceneGuardAdjacent("mgc-wait", {
      manualGuardControl: true,
      houseRules: { "polish-wait": true }
    });
    expect(guardSlotOpen(state)).toBe(true);
    const [guard] = guardsOf(state);

    const offers = getLegalActions(state, "p1").map((legal) => legal.action);
    const wait = offers.find((action) => action.type === "WAIT_UNIT" && action.unitId === guard.id);
    expect(wait, "WAIT is offered under free manual control + polish-wait").toBeTruthy();
    expect(offers.some((action) => action.type === "ATTACK_UNIT" && action.attackerId === guard.id)).toBe(true);
    // Free control also keeps Defend (must-attack would strip it).
    expect(offers.some((action) => action.type === "DEFEND_UNIT" && action.unitId === guard.id)).toBe(true);

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
    // The Waited guard must attack (polish-wait sheet): strikes offered, Wait no longer offered.
    expect(reOffers.some((action) => action.type === "ATTACK_UNIT")).toBe(true);
    expect(reOffers.some((action) => action.type === "WAIT_UNIT")).toBe(false);

    // CONTROL: without polish-wait free manual control still has no WAIT (Wait is polish-only).
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

// ---------------------------------------------------------------------------
// Pre-battle formation RELOCATION (the fighter arranges their OWN guards before
// the battle): the sort window opens for the fighter under Manual guard control,
// a shooter is restricted to the defender BACK row, and "Let the AI place them"
// resets to the rulebook auto-placement. Each claim fails if its wiring is gone.
// ---------------------------------------------------------------------------

describe("Manual guard control — pre-battle formation relocation", () => {
  it("opens the sort window for the FIGHTER (≥2 guards) with relocate/reset/ready; CONTROL: mode off = none", () => {
    // normal difficulty-2 → two bronze guards, so the window opens for p1.
    const state = fightToPlacement("mgc-place-open", { difficulty: 2 });
    expect(state.combat!.pendingNeutralPlacement).toBe("p1");
    expect(state.phase).toBe("combat-setup");
    expect(state.eventLog.some((event) => event.type === "NEUTRAL_FORMATION_SORT_OPENED")).toBe(true);
    // The fighter arranges their OWN guards — never the PvP opponent notice.
    expect(state.eventLog.some((event) => event.type === "NEUTRAL_CONTROL_ASSIGNED")).toBe(false);

    const offers = getLegalActions(state, "p1").map((legal) => legal.action.type);
    expect(offers).toContain("PLACE_NEUTRAL_GUARD");
    expect(offers).toContain("AUTO_NEUTRAL_PLACEMENT");
    expect(offers).toContain("FINISH_NEUTRAL_PLACEMENT");

    // CONTROL: with the mode OFF the same difficulty-2 fight opens no window —
    // the guards are auto-placed and the battle is ready immediately.
    const off = fightToPlacement("mgc-place-off", { difficulty: 2, manualGuardControl: false });
    expect(off.combat!.pendingNeutralPlacement ?? null).toBeNull();
    expect(off.phase).not.toBe("combat-setup");
  });

  it("keeps a shooter on the back row; CONTROL: a ground guard may take the front", () => {
    const state = fightToPlacement("mgc-place-shooter", { difficulty: 2 });
    const [shooter, ground] = guardsOf(state);
    shooter.type = "ranged";
    shooter.position = 0; // back row
    ground.type = "ground";
    ground.position = 4; // front row

    // A shooter may move to another BACK-row cell.
    const toBack = applyAction(state, { type: "PLACE_NEUTRAL_GUARD", playerId: "p1", unitId: shooter.id, position: 1 });
    expect(toBack.errors).toEqual([]);
    expect(toBack.state.combat!.units[shooter.id].position).toBe(1);

    // A shooter may NOT move to a FRONT-row cell (5).
    const toFront = applyAction(toBack.state, {
      type: "PLACE_NEUTRAL_GUARD",
      playerId: "p1",
      unitId: shooter.id,
      position: 5
    });
    expect(toFront.errors.length).toBeGreaterThan(0);
    expect(toFront.state.combat!.units[shooter.id].position).toBe(1);

    // CONTROL: a GROUND guard is unrestricted — it may take a front-row cell.
    const groundFront = applyAction(toBack.state, {
      type: "PLACE_NEUTRAL_GUARD",
      playerId: "p1",
      unitId: ground.id,
      position: 6
    });
    expect(groundFront.errors).toEqual([]);
    expect(groundFront.state.combat!.units[ground.id].position).toBe(6);
  });

  it("rejects a swap that would push a shooter to the front row", () => {
    const state = fightToPlacement("mgc-place-swap", { difficulty: 2 });
    const [shooter, ground] = guardsOf(state);
    shooter.type = "ranged";
    shooter.position = 0; // back row
    ground.type = "ground";
    ground.position = 4; // front row

    // Dropping the ground guard onto the shooter's back cell would trade cells,
    // pushing the shooter to the front (4) — rejected, both stay put.
    const swap = applyAction(state, { type: "PLACE_NEUTRAL_GUARD", playerId: "p1", unitId: ground.id, position: 0 });
    expect(swap.errors.length).toBeGreaterThan(0);
    expect(swap.state.combat!.units[shooter.id].position).toBe(0);
    expect(swap.state.combat!.units[ground.id].position).toBe(4);
  });

  it("'Let the AI place them' resets to the auto formation (shooters to back); FINISH starts the battle", () => {
    const state = fightToPlacement("mgc-place-auto", { difficulty: 2 });
    const [shooter, ground] = guardsOf(state);
    shooter.type = "ranged";
    ground.type = "ground";
    // Scramble the layout by hand (shooter on the front line), then reset it.
    shooter.position = 5;
    ground.position = 1;

    const reset = applyOk(state, { type: "AUTO_NEUTRAL_PLACEMENT", playerId: "p1" });
    // The AI auto-placement returns the shooter to the back row [0..3]…
    expect([0, 1, 2, 3]).toContain(reset.combat!.units[shooter.id].position);
    // …and keeps the sort window OPEN (reset ≠ commit).
    expect(reset.combat!.pendingNeutralPlacement).toBe("p1");

    const started = applyOk(reset, { type: "FINISH_NEUTRAL_PLACEMENT", playerId: "p1" });
    expect(started.combat!.pendingNeutralPlacement ?? null).toBeNull();
    expect(started.phase).not.toBe("combat-setup");
  });
});

describe("Manual guard control — must-attack binds only a REAL PvP opponent", () => {
  it("PvP Neutral Control ON but nobody left to take the guards → the manual fighter keeps FREE control; CONTROL: a live opponent gets the must-attack menu", () => {
    // Corner: both modes on, every other seat eliminated (live turnOrder is the
    // fighter alone) → pvpNeutralControllerId is null, the MANUAL fighter
    // drives — and the PvP sub-toggle must bind nobody (free play).
    const state = sceneGuardAdjacent("mgc-pvp-corner", { manualGuardControl: true });
    const [guard] = guardsOf(state);
    state.adventure!.pvpNeutralControl = true;
    state.adventure!.pvpNeutralControlMustAttack = true;
    state.turnOrder = ["p1"];
    const offers = getLegalActions(state, "p1").map((legal) => legal.action);
    expect(offers.some((action) => action.type === "ATTACK_UNIT" && action.attackerId === guard.id)).toBe(true);
    expect(
      offers.some((action) => action.type === "DEFEND_UNIT" && action.unitId === guard.id),
      "free manual control — the PvP must-attack sub-toggle binds nobody here"
    ).toBe(true);

    // CONTROL: with a live opponent the PvP controller (p2) IS bound — strikes
    // offered, Defend stripped.
    const pvp = sceneGuardAdjacent("mgc-pvp-corner-live", { manualGuardControl: true });
    const [pvpGuard] = guardsOf(pvp);
    pvp.adventure!.pvpNeutralControl = true;
    pvp.adventure!.pvpNeutralControlMustAttack = true;
    const pvpOffers = getLegalActions(pvp, "p2").map((legal) => legal.action);
    expect(pvpOffers.some((action) => action.type === "ATTACK_UNIT" && action.attackerId === pvpGuard.id)).toBe(true);
    expect(pvpOffers.some((action) => action.type === "DEFEND_UNIT" && action.unitId === pvpGuard.id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Neutral Harpy "Strike and Return" — under FREE manual control the fly-back
// becomes the FIGHTER's choice (a neutral guard normally auto-returns, the
// printed "always returns" reading). Each claim fails if the wiring is removed;
// the mode-off and computer-fighter CONTROLs prove the auto-return is
// byte-identical when no human drives the guards.
// ---------------------------------------------------------------------------

describe("Manual guard control — neutral Harpy fly-back is the fighter's choice", () => {
  const isReposition = (state: GameState): boolean =>
    state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context === "combat-reposition";

  /**
   * Drives an AI-played guard fight to the harpy's activation end, answering the
   * fighter's "pick the AI guard's landing cell" prompt (the neutral-destination
   * BINH house rule) along the way — but NOT a combat-reposition choice, so a
   * mode-off regression that opened one would leave the guard un-activated and
   * fail the CONTROL.
   */
  function driveAiHarpy(state: GameState, guardId: string): GameState {
    let safety = 40;
    while (safety > 0) {
      safety -= 1;
      if (state.combat?.units[guardId]?.activatedThisRound) {
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
      const choice = state.pendingChoice;
      if (choice?.type === "OPTION_CHOICE" && choice.context === "neutral-destination") {
        state = applyOk(state, { type: "CHOOSE_OPTION", playerId: choice.playerId, choiceId: choice.id, optionIndex: 0 });
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

  /**
   * One flying guard with the Harpy "Strike and Return" ability at A2 (space 4)
   * and a lone prey at B1 (space 1). The guard must MOVE (A2 → B2 / space 5,
   * adjacent to the prey) to strike, so a fly-back origin exists. Optionally
   * driven to the guard's open slot for the human path.
   */
  function harpyScene(
    seed: string,
    options: { manualGuardControl?: boolean; drive?: boolean } = {}
  ): { state: GameState; guardId: string; preyId: string } {
    let state = fightWithGuards(seed, { manualGuardControl: options.manualGuardControl ?? true });
    const [guard] = guardsOf(state);
    reshape(guard, { grade: "bronze", type: "flying", position: 4, initiative: 1, attack: 0 });
    guard.name = "Harpies";
    guard.cardName = "Harpies";
    guard.abilities = ["harpy-return"];
    const [prey] = playerUnitsOf(state, "p1");
    reshape(prey, { grade: "bronze", position: 1, initiative: 99, attack: 0 });
    onlyUnits(state, [guard, prey]);
    if (options.drive ?? true) {
      state = driveTo(state, guardSlotOpen);
    }
    return { state, guardId: guard.id, preyId: prey.id };
  }

  it("opens the fly-back/stay choice for the FIGHTER; 'stay' keeps the attack square, 'fly back' returns to origin", () => {
    const { state, guardId, preyId } = harpyScene("mgc-harpy");
    expect(guardSlotOpen(state)).toBe(true);

    // The fighter drives the guard: fly A2(4) → B2(5) (adjacent to the prey at
    // B1), then strike — MOVE keeps the guard active for the follow-up ATTACK.
    const moved = applyOk(state, { type: "MOVE_UNIT", playerId: "p1", unitId: guardId, destination: 5 });
    expect(moved.combat!.units[guardId].position).toBe(5);
    let struck = applyOk(moved, { type: "ATTACK_UNIT", playerId: "p1", attackerId: guardId, defenderId: preyId });
    struck = driveTo(struck, isReposition);

    const choice = struck.pendingChoice;
    expect(isReposition(struck)).toBe(true);
    // Opened NEUTRAL-owned, then re-stamped to the controlling FIGHTER.
    expect(choice?.playerId).toBe("p1");
    // The guard is still standing where it attacked while the choice is open.
    expect(struck.combat!.units[guardId].position).toBe(5);

    // "Stay" (option 1): the guard keeps the attack square (B2 / 5).
    const stayed = applyOk(struck, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice!.id, optionIndex: 1 });
    expect(stayed.combat!.units[guardId].position).toBe(5);
    expect(stayed.combat!.units[guardId].activatedThisRound).toBe(true);
    expect(stayed.pendingChoice).toBeNull();

    // "Fly back" (option 0): the guard returns to its origin (A2 / 4).
    const flewBack = applyOk(struck, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice!.id, optionIndex: 0 });
    expect(flewBack.combat!.units[guardId].position).toBe(4);
    expect(flewBack.combat!.units[guardId].activatedThisRound).toBe(true);
    expect(flewBack.pendingChoice).toBeNull();
  });

  it("CONTROL: with the mode OFF the neutral Harpy AUTO-returns to its origin — no choice ever opens", () => {
    const { state, guardId } = harpyScene("mgc-harpy-off", { manualGuardControl: false, drive: false });
    // Mode off = no human driver; the plain AI plays the guard (the fighter only
    // picks its landing cell), and the harpy auto-returns.
    const done = driveAiHarpy(state, guardId);
    const guard = done.combat!.units[guardId];
    expect(guard.activatedThisRound).toBe(true);
    expect(guard.movedThisActivation).toBe(true); // it really flew in…
    expect(guard.attackedThisActivation).toBe(true); // …and struck…
    expect(guard.position).toBe(4); // …then auto-returned to its origin.
    expect(isReposition(done)).toBe(false); // never a fly-back choice
  });

  it("CONTROL: a COMPUTER fighter auto-returns too — the reposition choice never opens, so the SP runner cannot stall", () => {
    const { state, guardId } = harpyScene("mgc-harpy-ai", { manualGuardControl: true, drive: false });
    state.controllers = { p1: { kind: "computer", difficulty: "standard", policyVersion: 1 } };
    // manualGuardControllerId is null for a computer fighter → the plain AI
    // drives the guard; the harpy auto-returns and NO reposition choice opens.
    expect(manualGuardControllerId(state, state.combat!)).toBeNull();
    const done = driveAiHarpy(state, guardId);
    expect(done.combat!.units[guardId].activatedThisRound).toBe(true);
    expect(done.combat!.units[guardId].position).toBe(4);
    expect(isReposition(done)).toBe(false);
  });
});

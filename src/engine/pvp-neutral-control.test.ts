import { describe, expect, it } from "vitest";
import { eliminatePlayer } from "./adventure";
import { startNeutralEncounter } from "./adventure-reducer";
import { nextAfkDropAction } from "./afk-drop";
import { isAdjacent } from "./battlefield";
import { applyAction, createAdventureGameState, createInitialGameState, NEUTRAL_PLAYER_ID } from "./index";
import { planNeutralActivation, planNeutralActivationManual } from "./neutral-ai";
import { neutralCombatControllerId } from "./neutral-control";
import { parallelInteractionBlocker } from "./parallel-turns";
import type { CombatState, CombatUnitState, GameAction, GameState, PlayerId, UnitGrade, UnitType } from "./state";

/**
 * PvP Neutral Control (OPTIONAL mode, `GameSetupOptions.pvpNeutralControl`,
 * multiplayer only) — engine-enforced behaviour, every claim mutation-checked
 * with a mode-off (or wrong-seat) CONTROL:
 *
 *  - the NEXT live player clockwise from the fighter commands the Neutral
 *    units and is notified (`NEUTRAL_CONTROL_ASSIGNED`);
 *  - sorting: the guards' activation-order tie is the commander's choice;
 *  - attack: the commander picks among ALL reachable enemies (not just the
 *    AI's tie group) and the landing cell;
 *  - movement: with no reachable attack the commander moves the guard to ANY
 *    legal cell — even away from the prey — or holds it in place;
 *  - the commander's answer passes the parallel-turns bystander backstop, and
 *    the AFK driver can default-answer a commander-owned target choice;
 *  - a solo table (or the mode off) keeps the plain Neutral AI.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

const THREE_PLAYERS = [
  { id: "p1", name: "Catherine", factionId: "castle" as const, heroDefId: "catherine" },
  { id: "p2", name: "Sandro", factionId: "necropolis" as const, heroDefId: "sandro" },
  { id: "p3", name: "Alamar", factionId: "dungeon" as const, heroDefId: "alamar" }
];

function makeGame(
  seed: string,
  options: { pvpNeutralControl?: boolean; players?: 2 | 3 } = {}
): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    pvpNeutralControl: options.pvpNeutralControl ?? true,
    ...(options.players === 3 ? { players: THREE_PLAYERS } : {})
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  return state;
}

/**
 * Opens a level-1 guard fight for `fighter` through the real Combat Setup flow
 * (startNeutralEncounter → placement → guard reveal), then normalizes the
 * battlefield for deterministic scenarios: scripted zero dice, the fighter's
 * hand emptied (no Visions / Wayfarer pre-battle windows), player units frozen
 * at initiative 99 so every guard acts after them.
 */
function fightWithGuards(seed: string, options: { players?: 2 | 3; pvpNeutralControl?: boolean; fighter?: PlayerId } = {}): GameState {
  let state = makeGame(seed, options);
  const fighter = options.fighter ?? "p1";
  state.activePlayerId = fighter;
  state.players[fighter].hand = [];
  const hero = state.heroes[`hero_${fighter}`];
  const field = Object.values(state.adventure!.fields).find((candidate) => (candidate.difficulty ?? 0) > 0);
  expect(field, "the map should hold at least one guarded field").toBeTruthy();
  field!.difficulty = 1;
  startNeutralEncounter(state, hero, field!);
  expect(state.combat?.context.kind).toBe("neutral");

  const army = state.players[fighter].army;
  state = applyOk(state, { type: "PLACE_COMBAT_UNIT", playerId: fighter, armyUnitId: army[0].id, position: 13 });
  if (army[1]) {
    state = applyOk(state, { type: "PLACE_COMBAT_UNIT", playerId: fighter, armyUnitId: army[1].id, position: 14 });
  }
  // Freeze the fighter's units at DISTINCT high initiatives (99, 98, …): they
  // act before every guard and never tie with each other, so the only choices
  // the scenarios open are the guards' own.
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

/** Reshapes a combat unit into a plain, ability-less body for a scenario. */
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

// ---------------------------------------------------------------------------
// Who commands: derivation + the notification
// ---------------------------------------------------------------------------

describe("PvP Neutral Control — commander derivation and notice", () => {
  it("assigns the NEXT live player clockwise from the fighter (p1→p2, p2→p3, p3→p1)", () => {
    for (const [fighter, commander] of [
      ["p1", "p2"],
      ["p2", "p3"],
      ["p3", "p1"]
    ] as const) {
      const state = fightWithGuards(`pnc-rotation-${fighter}`, { players: 3, fighter });
      expect(neutralCombatControllerId(state, state.combat!)).toBe(commander);
      // The commander — and only the commander — is named by the notice event.
      const notice = state.eventLog.find((event) => event.type === "NEUTRAL_CONTROL_ASSIGNED");
      expect(notice?.playerId).toBe(commander);
      expect(notice && "combatPlayerId" in notice ? notice.combatPlayerId : null).toBe(fighter);
      expect(notice && "message" in notice ? notice.message : "").toContain("commands the Neutral units");
    }
  });

  it("skips an eliminated seat: with p2 out of turnOrder, p1's fight is commanded by p3", () => {
    const state = fightWithGuards("pnc-eliminated", { players: 3 });
    state.turnOrder = state.turnOrder.filter((playerId) => playerId !== "p2");
    if (state.players.p2) {
      state.players.p2.eliminated = true;
    }
    expect(neutralCombatControllerId(state, state.combat!)).toBe("p3");
  });

  it("CONTROL: mode off — nobody commands, and no notice is logged", () => {
    const state = fightWithGuards("pnc-off", { players: 3, pvpNeutralControl: false });
    expect(neutralCombatControllerId(state, state.combat!)).toBeNull();
    expect(state.eventLog.some((event) => event.type === "NEUTRAL_CONTROL_ASSIGNED")).toBe(false);
  });

  it("CONTROL: a solo table never gets the mode, even switched On", () => {
    const solo = createAdventureGameState({
      seed: "pnc-solo",
      difficulty: "normal",
      rollFirstPlayer: false,
      pvpNeutralControl: true,
      players: [THREE_PLAYERS[0]]
    });
    expect(solo.adventure?.pvpNeutralControl ?? false).toBe(false);
  });

  it("CONTROL: only NEUTRAL fights are commanded — a player-vs-player context gets no commander", () => {
    const state = fightWithGuards("pnc-pvp-kind", { players: 3 });
    const pvpShaped = {
      ...state.combat!,
      context: { kind: "player" }
    } as unknown as CombatState;
    expect(neutralCombatControllerId(state, pvpShaped)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The manual planner (unit level): free target pick, free move, hard rules
// ---------------------------------------------------------------------------

function place(
  state: GameState,
  id: string,
  controllerId: string,
  grade: UnitGrade,
  type: UnitType,
  position: number
): CombatUnitState {
  const unit = state.combat!.units[id];
  if (!unit) {
    throw new Error(`scenario expects unit ${id} in the initial combat`);
  }
  unit.controllerId = controllerId;
  unit.grade = grade;
  unit.type = type;
  unit.position = position;
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

describe("PvP Neutral Control — manual planning (unit level)", () => {
  it("offers ALL reachable enemies, where the AI attacks its tier favourite with no choice", () => {
    const state = createInitialGameState("pnc-plan-targets");
    const guard = place(state, "unit_p2_skeletons", NEUTRAL_PLAYER_ID, "bronze", "ground", 5);
    const bronzePrey = place(state, "unit_p1_griffins", "p1", "bronze", "ground", 1);
    const silverPrey = place(state, "unit_p1_crusaders", "p1", "silver", "ground", 9);
    onlyUnits(state, [guard, bronzePrey, silverPrey]);

    // CONTROL — the AI: same-tier priority picks the bronze outright, no pause.
    expect(planNeutralActivation(state, state.combat!, guard)).toEqual({
      kind: "attack",
      defenderId: bronzePrey.id
    });

    // Manual: the commander chooses freely between BOTH reachable enemies.
    const manual = planNeutralActivationManual(state, state.combat!, guard);
    expect(manual.kind).toBe("choose-target");
    if (manual.kind === "choose-target") {
      expect([...manual.candidateIds].sort()).toEqual([bronzePrey.id, silverPrey.id].sort());
    }

    // The commander's pick commits — the AI-dispreferred SILVER target.
    expect(planNeutralActivationManual(state, state.combat!, guard, silverPrey.id)).toEqual({
      kind: "attack",
      defenderId: silverPrey.id
    });
  });

  it("with no reachable attack offers a FREE move (any legal cell) where the AI auto-advances", () => {
    const state = createInitialGameState("pnc-plan-move");
    // Guard bottom-left (12), prey top-right (3): Manhattan 6 — no strike this
    // activation. Cell 16 is legal but walks AWAY from the prey.
    const guard = place(state, "unit_p2_skeletons", NEUTRAL_PLAYER_ID, "bronze", "ground", 12);
    const prey = place(state, "unit_p1_griffins", "p1", "bronze", "ground", 3);
    onlyUnits(state, [guard, prey]);

    // CONTROL — the AI advances on the prey (a strictly-closing single cell).
    const ai = planNeutralActivation(state, state.combat!, guard);
    expect(ai.kind).toBe("move");
    if (ai.kind === "move") {
      expect(ai.destination).not.toBe(16);
    }

    // Manual: a free-move choice that INCLUDES the non-closing cell 16.
    const manual = planNeutralActivationManual(state, state.combat!, guard);
    expect(manual.kind).toBe("choose-move");
    if (manual.kind === "choose-move") {
      expect(manual.destinations).toContain(16);
      expect(manual.destinations).not.toContain(guard.position);
    }

    // The commander's picked cell commits as a plain move.
    expect(planNeutralActivationManual(state, state.combat!, guard, undefined, 16)).toEqual({
      kind: "move",
      destination: 16
    });
  });

  it("hard rule survives: an ENGAGED ranged guard is offered only adjacent enemies", () => {
    const state = createInitialGameState("pnc-plan-engaged");
    const guard = place(state, "unit_p2_skeletons", NEUTRAL_PLAYER_ID, "bronze", "ranged", 5);
    const engaged = place(state, "unit_p1_griffins", "p1", "bronze", "ground", 6);
    const far = place(state, "unit_p1_crusaders", "p1", "silver", "ground", 17);
    onlyUnits(state, [guard, engaged, far]);

    // One adjacent enemy → it must be struck, with no choice offered.
    expect(planNeutralActivationManual(state, state.combat!, guard)).toEqual({
      kind: "attack",
      defenderId: engaged.id
    });
    expect(far.id).toBeTruthy();
  });

  it("a guard that already attacked passes — the commander cannot re-activate it", () => {
    const state = createInitialGameState("pnc-plan-spent");
    const guard = place(state, "unit_p2_skeletons", NEUTRAL_PLAYER_ID, "bronze", "ground", 5);
    const prey = place(state, "unit_p1_griffins", "p1", "bronze", "ground", 6);
    onlyUnits(state, [guard, prey]);
    guard.attackedThisActivation = true;
    expect(planNeutralActivationManual(state, state.combat!, guard)).toEqual({ kind: "pass" });
  });
});

// ---------------------------------------------------------------------------
// End to end: the commander owns the choices and their picks drive the guard
// ---------------------------------------------------------------------------

describe("PvP Neutral Control — end to end", () => {
  it("routes the target pick to the NEXT player, whose pick lands the attack (mode-off CONTROL: the AI attacks alone)", () => {
    // Mode ON: guard adjacent to a bronze AND a silver prey → p2 chooses.
    let state = fightWithGuards("pnc-e2e-target", {});
    const [guard] = guardsOf(state);
    reshape(guard, { grade: "bronze", position: 5, initiative: 1 });
    const [bronzePrey, silverPrey] = playerUnitsOf(state, "p1");
    reshape(bronzePrey, { grade: "bronze", position: 1, initiative: 99 });
    reshape(silverPrey, { grade: "silver", position: 9, initiative: 98 });
    onlyUnits(state, [guard, bronzePrey, silverPrey]);

    state = driveTo(
      state,
      (current) => current.pendingChoice?.type === "ABILITY_TARGET_CHOICE" && current.pendingChoice.kind === "neutral-target"
    );
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") {
      return;
    }
    // The NEXT player commands — not the fighter.
    expect(choice.playerId).toBe("p2");
    expect([...choice.candidateUnitIds].sort()).toEqual([bronzePrey.id, silverPrey.id].sort());

    // The fighter may NOT answer for the commander.
    const usurped = applyAction(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: silverPrey.id
    });
    expect(usurped.errors.length).toBeGreaterThan(0);

    // The commander picks the AI-dispreferred SILVER prey — and that is struck.
    state = applyOk(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p2",
      choiceId: choice.id,
      targetUnitId: silverPrey.id
    });
    expect(
      state.eventLog.some(
        (event) => event.type === "UNIT_ATTACK_DECLARED" && event.attackerId === guard.id && event.defenderId === silverPrey.id
      )
    ).toBe(true);

    // CONTROL — mode OFF, same board: the AI strikes its bronze favourite with
    // NO choice ever opening.
    let control = fightWithGuards("pnc-e2e-target-control", { pvpNeutralControl: false });
    const [controlGuard] = guardsOf(control);
    reshape(controlGuard, { grade: "bronze", position: 5, initiative: 1 });
    const [controlBronze, controlSilver] = playerUnitsOf(control, "p1");
    reshape(controlBronze, { grade: "bronze", position: 1, initiative: 99 });
    reshape(controlSilver, { grade: "silver", position: 9, initiative: 98 });
    onlyUnits(control, [controlGuard, controlBronze, controlSilver]);
    control = driveTo(
      control,
      (current) => current.eventLog.some((event) => event.type === "UNIT_ATTACK_DECLARED" && event.attackerId === controlGuard.id)
    );
    expect(control.pendingChoice).toBeNull();
    expect(
      control.eventLog.some(
        (event) =>
          event.type === "UNIT_ATTACK_DECLARED" && event.attackerId === controlGuard.id && event.defenderId === controlBronze.id
      )
    ).toBe(true);
  });

  it("routes the landing-cell pick to the NEXT player and lands the guard on THEIR cell", () => {
    let state = fightWithGuards("pnc-e2e-cell", {});
    const [guard] = guardsOf(state);
    reshape(guard, { grade: "bronze", position: 5, initiative: 1 });
    const [prey, spare] = playerUnitsOf(state, "p1");
    reshape(prey, { grade: "bronze", position: 13, initiative: 99 });
    onlyUnits(state, [guard, prey, ...(spare ? [reshape(spare, { grade: "bronze", position: 19, initiative: 98 })] : [])]);

    state = driveTo(
      state,
      (current) => current.pendingChoice?.type === "OPTION_CHOICE" && current.pendingChoice.context === "neutral-destination"
    );
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    if (choice?.type !== "OPTION_CHOICE" || !choice.neutralDestination) {
      return;
    }
    expect(choice.playerId).toBe("p2"); // the commander, not the fighter
    expect(choice.neutralDestination.defenderId).toBe(prey.id);
    const cells = choice.neutralDestination.positions;
    expect(cells.length).toBeGreaterThan(1);

    const chosenIndex = cells.length - 1;
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p2", choiceId: choice.id, optionIndex: chosenIndex });
    const landed = guardsOf(state)[0];
    expect(landed.position).toBe(cells[chosenIndex]);
    expect(isAdjacent(landed.position, prey.position)).toBe(true);
    expect(
      state.eventLog.some((event) => event.type === "UNIT_ATTACK_DECLARED" && event.defenderId === prey.id)
    ).toBe(true);
  });

  it("gives the commander the activation-order tie of the guards (mode-off CONTROL: the fighter)", () => {
    const run = (pvpNeutralControl: boolean) => {
      let state = fightWithGuards(`pnc-e2e-order-${pvpNeutralControl}`, { pvpNeutralControl });
      const [guard] = guardsOf(state);
      reshape(guard, { grade: "bronze", position: 5, initiative: 1 });
      const twin = structuredClone(guard);
      twin.id = `${guard.id}_twin`;
      twin.position = 6;
      state.combat!.units[twin.id] = twin;
      const [prey, spare] = playerUnitsOf(state, "p1");
      reshape(prey, { grade: "bronze", position: 13, initiative: 99 });
      if (spare) {
        reshape(spare, { grade: "bronze", position: 19, initiative: 98 });
      }
      state = driveTo(
        state,
        (current) =>
          current.pendingChoice?.type === "OPTION_CHOICE" && current.pendingChoice.context === "combat-activation-order"
      );
      const choice = state.pendingChoice;
      expect(choice?.type).toBe("OPTION_CHOICE");
      return choice?.type === "OPTION_CHOICE" ? choice : null;
    };

    const commanded = run(true);
    expect(commanded?.playerId).toBe("p2");
    expect(commanded?.activationOrder?.side).toBe(NEUTRAL_PLAYER_ID);

    const control = run(false);
    expect(control?.playerId).toBe("p1");
    expect(control?.activationOrder?.side).toBe(NEUTRAL_PLAYER_ID);
  });

  it("with no reachable attack, the commander moves the guard ANYWHERE legal — or holds it", () => {
    const setup = (seed: string) => {
      let state = fightWithGuards(seed, {});
      const [guard] = guardsOf(state);
      reshape(guard, { grade: "bronze", position: 12, initiative: 1 });
      const [prey, spare] = playerUnitsOf(state, "p1");
      reshape(prey, { grade: "bronze", position: 3, initiative: 99 });
      onlyUnits(state, [guard, prey, ...(spare ? [reshape(spare, { grade: "bronze", position: 7, initiative: 98 })] : [])]);
      state = driveTo(
        state,
        (current) => current.pendingChoice?.type === "OPTION_CHOICE" && current.pendingChoice.context === "neutral-destination"
      );
      return state;
    };

    // Free move: the commander walks the guard AWAY from the prey (cell 16).
    let state = setup("pnc-e2e-freemove");
    let choice = state.pendingChoice;
    expect(choice?.type).toBe("OPTION_CHOICE");
    if (choice?.type !== "OPTION_CHOICE" || !choice.neutralDestination) {
      return;
    }
    expect(choice.playerId).toBe("p2");
    expect(choice.neutralDestination.defenderId).toBeUndefined();
    expect(choice.neutralDestination.allowHold).toBe(true);
    const awayIndex = choice.neutralDestination.positions.indexOf(16);
    expect(awayIndex).toBeGreaterThanOrEqual(0);
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p2", choiceId: choice.id, optionIndex: awayIndex });
    expect(guardsOf(state)[0].position).toBe(16);
    expect(guardsOf(state)[0].activatedThisRound).toBe(true);

    // Hold: the trailing option ends the activation in place.
    state = setup("pnc-e2e-hold");
    choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE" || !choice.neutralDestination) {
      return;
    }
    const holdIndex = choice.neutralDestination.positions.length;
    expect(choice.options[holdIndex]?.label).toContain("holds position");
    state = applyOk(state, { type: "CHOOSE_OPTION", playerId: "p2", choiceId: choice.id, optionIndex: holdIndex });
    const held = guardsOf(state)[0];
    expect(held.position).toBe(12);
    expect(held.activatedThisRound).toBe(true);
    expect(state.phase).not.toBe("choice");
    expect(
      state.eventLog.some((event) => event.type === "UNIT_ACTIVATION_ENDED" && event.unitId === held.id)
    ).toBe(true);
  });

  it("recovers when the commander is eliminated mid-choice: the next live seat takes over", () => {
    let state = fightWithGuards("pnc-e2e-recover", { players: 3 });
    const [guard] = guardsOf(state);
    reshape(guard, { grade: "bronze", position: 5, initiative: 1 });
    const [bronzePrey, silverPrey] = playerUnitsOf(state, "p1");
    reshape(bronzePrey, { grade: "bronze", position: 1, initiative: 99 });
    reshape(silverPrey, { grade: "silver", position: 9, initiative: 98 });
    onlyUnits(state, [guard, bronzePrey, silverPrey]);

    state = driveTo(
      state,
      (current) => current.pendingChoice?.type === "ABILITY_TARGET_CHOICE" && current.pendingChoice.kind === "neutral-target"
    );
    expect(state.pendingChoice?.playerId).toBe("p2");

    // p2 is eliminated mid-choice (the AFK-kick backstop path): eliminatePlayer
    // drops their orphaned choice, and the next applied action's combat pump
    // re-plans the guard — the command choice re-opens for p3, the new next
    // live seat clockwise.
    eliminatePlayer(state, "p2", "kicked mid-command", false);
    expect(state.players.p2?.eliminated).toBe(true);
    expect(state.pendingChoice).toBeNull();
    state = applyOk(state, { type: "JOIN_ROOM", clientId: "test-client", name: "Observer" });
    expect(state.pendingChoice?.type).toBe("ABILITY_TARGET_CHOICE");
    expect(state.pendingChoice?.playerId).toBe("p3");
  });
});

// ---------------------------------------------------------------------------
// Parallel turns + AFK driver: the two cross-mode seams
// ---------------------------------------------------------------------------

describe("PvP Neutral Control — parallel turns and forced resolution", () => {
  function commanderChoiceState(seed: string): GameState {
    let state = fightWithGuards(seed, { players: 3 });
    const [guard] = guardsOf(state);
    reshape(guard, { grade: "bronze", position: 5, initiative: 1 });
    const [bronzePrey, silverPrey] = playerUnitsOf(state, "p1");
    reshape(bronzePrey, { grade: "bronze", position: 1, initiative: 99 });
    reshape(silverPrey, { grade: "silver", position: 9, initiative: 98 });
    onlyUnits(state, [guard, bronzePrey, silverPrey]);
    state = driveTo(
      state,
      (current) => current.pendingChoice?.type === "ABILITY_TARGET_CHOICE" && current.pendingChoice.kind === "neutral-target"
    );
    expect(state.pendingChoice?.playerId).toBe("p2");
    return state;
  }

  it("lets the commander answer inside another seat's open fight in PARALLEL mode (bystander CONTROL still blocked)", () => {
    const state = commanderChoiceState("pnc-parallel");
    state.turn.mode = "parallel";
    state.turn.completedPlayerIds = [];

    // The commander answering their own command choice is the interaction's
    // own input — not a bystander intrusion…
    expect(parallelInteractionBlocker(state, "p2")).toBeNull();
    // …while a third seat stays a plain bystander of p1's fight…
    expect(parallelInteractionBlocker(state, "p3")).toBe("p1");
    // …and the same commander WITHOUT a command choice open is one too.
    const noChoice = structuredClone(state);
    noChoice.pendingChoice = null;
    expect(parallelInteractionBlocker(noChoice, "p2")).toBe("p1");

    // The full action pipeline (fingerprint backstop included) accepts the pick.
    const choice = state.pendingChoice;
    if (choice?.type !== "ABILITY_TARGET_CHOICE") {
      return;
    }
    const silverPrey = playerUnitsOf(state, "p1").find((unit) => unit.grade === "silver")!;
    const after = applyOk(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p2",
      choiceId: choice.id,
      targetUnitId: silverPrey.id
    });
    expect(
      after.eventLog.some((event) => event.type === "UNIT_ATTACK_DECLARED" && event.defenderId === silverPrey.id)
    ).toBe(true);
  });

  it("the AFK driver can default-answer a commander-owned target choice (CHOOSE_ABILITY_TARGET resolves)", () => {
    const state = commanderChoiceState("pnc-afk");
    const action = nextAfkDropAction(state, "p2");
    expect(action?.type).toBe("CHOOSE_ABILITY_TARGET");
  });
});

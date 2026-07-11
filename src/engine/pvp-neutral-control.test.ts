import { describe, expect, it } from "vitest";
import { eliminatePlayer } from "./adventure";
import { startNeutralEncounter } from "./adventure-reducer";
import { nextAfkDropAction } from "./afk-drop";
import { turnClockPausedFor } from "./afk";
import { applyAction, createAdventureGameState, NEUTRAL_PLAYER_ID } from "./index";
import { getLegalActions } from "./legal-actions";
import { neutralCombatControllerId } from "./neutral-control";
import { parallelInteractionBlocker } from "./parallel-turns";
import type { CombatState, CombatUnitState, GameAction, GameState, LegalAction, PlayerId, UnitGrade, UnitType } from "./state";

/**
 * PvP Neutral Control (OPTIONAL mode, `GameSetupOptions.pvpNeutralControl`,
 * multiplayer only) — engine-enforced behaviour, every claim mutation-checked
 * with a mode-off (or wrong-seat) CONTROL:
 *
 *  - the NEXT live player clockwise from the fighter PLAYS the Neutral units
 *    like a PvP side and is notified (`NEUTRAL_CONTROL_ASSIGNED`): the engine
 *    stops on each guard's activation and that player drives it with the
 *    normal unit actions (executed AS the neutral seat), breaks the guards'
 *    activation-order ties and answers their ability follow-ups (activation
 *    choices, attack-die rerolls);
 *  - the `pvpNeutralControlMustAttack` sub-toggle (default ON) keeps the
 *    rulebook constraint — attack when possible, never Defend, only close in
 *    when no attack is reachable; OFF plays the guards entirely freely;
 *  - the fighter's 10-minute clock pauses during the guards' slots, the AFK
 *    driver can play a dropped controller's slot out, and an eliminated
 *    controller hands the guards (and any open neutral-side choice) to the
 *    next live seat — or back to the AI;
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
  options: { pvpNeutralControl?: boolean; mustAttack?: boolean; players?: 2 | 3 } = {}
): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    pvpNeutralControl: options.pvpNeutralControl ?? true,
    ...(options.mustAttack !== undefined ? { pvpNeutralControlMustAttack: options.mustAttack } : {}),
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
 * hand emptied (no Visions / Wayfarer pre-battle windows), the fighter's units
 * frozen at DISTINCT high initiatives (99, 98, …) so they act before every
 * guard and never tie with each other.
 */
function fightWithGuards(
  seed: string,
  options: { players?: 2 | 3; pvpNeutralControl?: boolean; mustAttack?: boolean; fighter?: PlayerId } = {}
): GameState {
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

/** A standard scene: one bronze guard adjacent to a bronze AND a silver prey. */
function sceneTwoPreys(
  seed: string,
  options: { players?: 2 | 3; pvpNeutralControl?: boolean; mustAttack?: boolean } = {},
  prepare?: (state: GameState) => void,
  stopWhen: (state: GameState) => boolean = guardSlotOpen
): GameState {
  let state = fightWithGuards(seed, options);
  const [guard] = guardsOf(state);
  reshape(guard, { grade: "bronze", position: 5, initiative: 1 });
  const [bronzePrey, silverPrey] = playerUnitsOf(state, "p1");
  reshape(bronzePrey, { grade: "bronze", position: 1, initiative: 99 });
  reshape(silverPrey, { grade: "silver", position: 9, initiative: 98 });
  onlyUnits(state, [guard, bronzePrey, silverPrey]);
  prepare?.(state);
  state = driveTo(state, stopWhen);
  return state;
}

// ---------------------------------------------------------------------------
// Who controls the Neutral side: derivation + the notification
// ---------------------------------------------------------------------------

describe("PvP Neutral Control — controller derivation and notice", () => {
  it("assigns the NEXT live player clockwise from the fighter (p1→p2, p2→p3, p3→p1)", () => {
    for (const [fighter, controller] of [
      ["p1", "p2"],
      ["p2", "p3"],
      ["p3", "p1"]
    ] as const) {
      const state = fightWithGuards(`pnc-rotation-${fighter}`, { players: 3, fighter });
      expect(neutralCombatControllerId(state, state.combat!)).toBe(controller);
      // The controlling player — and only them — is named by the notice event.
      const notice = state.eventLog.find((event) => event.type === "NEUTRAL_CONTROL_ASSIGNED");
      expect(notice?.playerId).toBe(controller);
      expect(notice && "combatPlayerId" in notice ? notice.combatPlayerId : null).toBe(fighter);
      expect(notice && "message" in notice ? notice.message : "").toContain("plays the Neutral units");
    }
  });

  it("skips an eliminated seat: with p2 out of turnOrder, p1's fight is controlled by p3", () => {
    const state = fightWithGuards("pnc-eliminated", { players: 3 });
    state.turnOrder = state.turnOrder.filter((playerId) => playerId !== "p2");
    if (state.players.p2) {
      state.players.p2.eliminated = true;
    }
    expect(neutralCombatControllerId(state, state.combat!)).toBe("p3");
  });

  it("CONTROL: mode off — nobody controls the guards, and no notice is logged", () => {
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

  it("CONTROL: only NEUTRAL fights are controlled — a player-vs-player context gets no controller", () => {
    const state = fightWithGuards("pnc-pvp-kind", { players: 3 });
    const pvpShaped = {
      ...state.combat!,
      context: { kind: "player" }
    } as unknown as CombatState;
    expect(neutralCombatControllerId(state, pvpShaped)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The controlling player DRIVES the guards like a PvP side
// ---------------------------------------------------------------------------

describe("PvP Neutral Control — the next player drives the guards", () => {
  it("stops on the guard's activation and offers the NEXT player its unit actions (fighter gets none)", () => {
    const state = sceneTwoPreys("pnc-drive-menu", {});
    expect(guardSlotOpen(state)).toBe(true);
    expect(state.priorityPlayerId).toBe("p2");

    const guard = guardsOf(state)[0];
    const controllerAttacks = getLegalActions(state, "p2").filter(
      (offer) => offer.action.type === "ATTACK_UNIT" && offer.action.attackerId === guard.id
    );
    expect(controllerAttacks.length).toBe(2); // BOTH adjacent enemies — no AI tier preference

    const fighterUnitActions = getLegalActions(state, "p1").filter(
      (offer) =>
        (offer.action.type === "ATTACK_UNIT" && offer.action.attackerId === guard.id) ||
        (offer.action.type === "MOVE_UNIT" && offer.action.unitId === guard.id) ||
        (offer.action.type === "DEFEND_UNIT" && offer.action.unitId === guard.id)
    );
    expect(fighterUnitActions).toEqual([]); // the FIGHTER may not drive the guards
  });

  it("executes the controller's attack AS the neutral seat — on the AI-dispreferred target (mode-off CONTROL: the AI attacks alone)", () => {
    let state = sceneTwoPreys("pnc-drive-attack", {});
    const guard = guardsOf(state)[0];
    const silverPrey = playerUnitsOf(state, "p1").find((unit) => unit.grade === "silver")!;

    // The fighter may NOT issue the guard's attack…
    const usurped = applyAction(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: guard.id,
      defenderId: silverPrey.id
    });
    expect(usurped.errors.length).toBeGreaterThan(0);

    // …the controlling player may — and the attack is executed by the NEUTRAL
    // seat (asNeutralSeatCommand), against the target the AI would NOT pick.
    state = applyOk(state, { type: "ATTACK_UNIT", playerId: "p2", attackerId: guard.id, defenderId: silverPrey.id });
    const declared = state.eventLog.find(
      (event) => event.type === "UNIT_ATTACK_DECLARED" && event.attackerId === guard.id
    );
    expect(declared && "defenderId" in declared ? declared.defenderId : null).toBe(silverPrey.id);
    expect(declared && "playerId" in declared ? declared.playerId : null).toBe(NEUTRAL_PLAYER_ID);

    // CONTROL — mode OFF, same board: the AI strikes its bronze favourite
    // automatically, never stopping for a human.
    let control = sceneTwoPreys("pnc-drive-attack-control", { pvpNeutralControl: false });
    const controlGuard = guardsOf(control)[0];
    const controlBronze = playerUnitsOf(control, "p1").find((unit) => unit.grade === "bronze")!;
    control = driveTo(
      control,
      (current) => current.eventLog.some((event) => event.type === "UNIT_ATTACK_DECLARED" && event.attackerId === controlGuard.id)
    );
    expect(
      control.eventLog.some(
        (event) =>
          event.type === "UNIT_ATTACK_DECLARED" && event.attackerId === controlGuard.id && event.defenderId === controlBronze.id
      )
    ).toBe(true);
  });

  it("gives the controller the guards' activation-order tie (mode-off CONTROL: the fighter)", () => {
    const run = (pvpNeutralControl: boolean) => {
      let state = fightWithGuards(`pnc-order-${pvpNeutralControl}`, { pvpNeutralControl });
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

    const controlled = run(true);
    expect(controlled?.playerId).toBe("p2");
    expect(controlled?.activationOrder?.side).toBe(NEUTRAL_PLAYER_ID);

    const control = run(false);
    expect(control?.playerId).toBe("p1");
    expect(control?.activationOrder?.side).toBe(NEUTRAL_PLAYER_ID);
  });
});

// ---------------------------------------------------------------------------
// Ability follow-ups are the controller's too (PvP-style)
// ---------------------------------------------------------------------------

describe("PvP Neutral Control — ability follow-ups go to the controlling player", () => {
  it("re-stamps the guard's attack-die reroll window to the controller (mode-off CONTROL: auto-rerolled)", () => {
    // Guard with the Minotaur reroll on a scripted "-1" first roll.
    let state = sceneTwoPreys("pnc-reroll", {});
    const guard = guardsOf(state)[0];
    guard.abilities = ["minotaur-reroll"];
    state.combat!.dice.scriptedRolls = [-1, 1, ...Array(30).fill(0)];
    state.combat!.dice.rollCount = 0;
    const bronzePrey = playerUnitsOf(state, "p1").find((unit) => unit.grade === "bronze")!;

    state = applyOk(state, { type: "ATTACK_UNIT", playerId: "p2", attackerId: guard.id, defenderId: bronzePrey.id });
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("ATTACK_DIE_REROLL");
    expect(choice?.playerId).toBe("p2"); // the HUMAN playing the guards, not the AI

    // The controller decides — keep the "-1" (a human may want exactly that).
    if (choice?.type !== "ATTACK_DIE_REROLL") {
      return;
    }
    state = applyOk(state, {
      type: "CHOOSE_PENDING_ROLL",
      playerId: "p2",
      choiceId: choice.id,
      candidateIndex: choice.candidates.length - 1
    });
    expect(state.pendingChoice).toBeNull();

    // CONTROL — mode OFF: the AI auto-rerolls its "-1" with no pause.
    const control = sceneTwoPreys(
      "pnc-reroll-control",
      { pvpNeutralControl: false },
      (draft) => {
        guardsOf(draft)[0].abilities = ["minotaur-reroll"];
        draft.combat!.dice.scriptedRolls = [-1, 1, ...Array(30).fill(0)];
        draft.combat!.dice.rollCount = 0;
      },
      (current) => current.eventLog.some((event) => event.type === "ATTACK_REROLLED")
    );
    expect(control.pendingChoice?.type ?? null).not.toBe("ATTACK_DIE_REROLL");
    expect(control.eventLog.some((event) => event.type === "ATTACK_REROLLED")).toBe(true);
  });

  it("opens a guard's [activation] ability choice for the controller (Enchanter heal pick)", () => {
    let state = fightWithGuards("pnc-enchanter", {});
    const [guard] = guardsOf(state);
    reshape(guard, { grade: "bronze", position: 5, initiative: 1 });
    guard.abilities = ["enchanter-heal-or-buff"];
    // A wounded fellow guard: the mandatory heal has a real candidate.
    const twin = structuredClone(guard);
    twin.id = `${guard.id}_twin`;
    twin.position = 6;
    twin.abilities = [];
    twin.initiative = 0; // acts after the enchanter — no activation-order tie
    twin.damage = 3;
    state.combat!.units[twin.id] = twin;
    const [prey, spare] = playerUnitsOf(state, "p1");
    reshape(prey, { grade: "bronze", position: 13, initiative: 99 });
    if (spare) {
      reshape(spare, { grade: "bronze", position: 19, initiative: 98 });
    }

    state = driveTo(
      state,
      (current) =>
        current.pendingChoice?.type === "ABILITY_TARGET_CHOICE" && current.pendingChoice.kind === "enchanter-activation"
    );
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") {
      return;
    }
    expect(choice.playerId).toBe("p2"); // the controlling player, not the AI
    expect(choice.candidateUnitIds).toContain(twin.id);

    const damageBefore = state.combat!.units[twin.id].damage;
    state = applyOk(state, { type: "CHOOSE_ABILITY_TARGET", playerId: "p2", choiceId: choice.id, targetUnitId: twin.id });
    expect(state.combat!.units[twin.id].damage).toBeLessThan(damageBefore); // the heal LANDED
    // The fighter's pace-pause may still be up (it coexists with the choice by
    // design); once acked, the guard's slot is open and p2 drives it.
    state = driveTo(state, guardSlotOpen);
    expect(guardSlotOpen(state)).toBe(true); // …and the guard still acts, driven by p2
  });
});

// ---------------------------------------------------------------------------
// The mustAttack sub-toggle
// ---------------------------------------------------------------------------

describe("PvP Neutral Control — the mustAttack sub-toggle", () => {
  const unitCommandTypes = (offers: LegalAction[], guardId: string) =>
    offers
      .filter(
        (offer) =>
          ("attackerId" in offer.action && offer.action.attackerId === guardId) ||
          ("unitId" in offer.action && offer.action.unitId === guardId)
      )
      .map((offer) => offer.action.type);

  it("DEFAULT (must attack): a guard that can strike gets ONLY attacks — no Defend, no move, no hold", () => {
    const state = sceneTwoPreys("pnc-must-attack", {});
    const guard = guardsOf(state)[0];
    const types = unitCommandTypes(getLegalActions(state, "p2"), guard.id);
    expect(types).toContain("ATTACK_UNIT");
    expect(types).not.toContain("DEFEND_UNIT");
    expect(types).not.toContain("MOVE_UNIT");
    expect(types).not.toContain("END_ACTIVATION");
  });

  it("DEFAULT (must attack): with no reachable strike, only CLOSING moves are offered", () => {
    // Guard bottom-left (12), prey top-right (3): Manhattan 6 — no strike this
    // activation. Cell 16 is legal but walks AWAY from the prey.
    let state = fightWithGuards("pnc-must-approach", {});
    const [guard] = guardsOf(state);
    reshape(guard, { grade: "bronze", position: 12, initiative: 1 });
    const [prey, spare] = playerUnitsOf(state, "p1");
    reshape(prey, { grade: "bronze", position: 3, initiative: 99 });
    onlyUnits(state, [guard, prey, ...(spare ? [reshape(spare, { grade: "bronze", position: 7, initiative: 98 })] : [])]);
    state = driveTo(state, guardSlotOpen);

    const offers = getLegalActions(state, "p2");
    const moveCells = offers.flatMap((offer) =>
      offer.action.type === "MOVE_UNIT" && offer.action.unitId === guard.id ? [offer.action.destination] : []
    );
    expect(moveCells.length).toBeGreaterThan(0);
    expect(moveCells).not.toContain(16); // never a step AWAY from every enemy
    expect(unitCommandTypes(offers, guard.id)).not.toContain("DEFEND_UNIT");
  });

  it("toggled OFF: the controller plays the guard entirely freely — move anywhere, Defend, hold", () => {
    let state = fightWithGuards("pnc-free", { mustAttack: false });
    const [guard] = guardsOf(state);
    reshape(guard, { grade: "bronze", position: 12, initiative: 1 });
    const [prey, spare] = playerUnitsOf(state, "p1");
    reshape(prey, { grade: "bronze", position: 3, initiative: 99 });
    onlyUnits(state, [guard, prey, ...(spare ? [reshape(spare, { grade: "bronze", position: 7, initiative: 98 })] : [])]);
    state = driveTo(state, guardSlotOpen);

    const offers = getLegalActions(state, "p2");
    const moveCells = offers.flatMap((offer) =>
      offer.action.type === "MOVE_UNIT" && offer.action.unitId === guard.id ? [offer.action.destination] : []
    );
    expect(moveCells).toContain(16); // a non-closing cell IS offered
    expect(unitCommandTypes(offers, guard.id)).toContain("DEFEND_UNIT");

    // Walk the guard AWAY from the prey, then hold — pure stalling, allowed here.
    state = applyOk(state, { type: "MOVE_UNIT", playerId: "p2", unitId: guard.id, destination: 16 });
    expect(state.combat!.units[guard.id].position).toBe(16);
    state = applyOk(state, { type: "END_ACTIVATION", playerId: "p2", unitId: guard.id });
    expect(state.combat!.units[guard.id].activatedThisRound).toBe(true);
  });

  it("toggled OFF: Defend works and is executed by the neutral seat", () => {
    const state = sceneTwoPreys("pnc-free-defend", { mustAttack: false });
    const guard = guardsOf(state)[0];
    const after = applyOk(state, { type: "DEFEND_UNIT", playerId: "p2", unitId: guard.id });
    expect(after.combat!.units[guard.id].defenseToken).toBe(true);
    expect(after.combat!.units[guard.id].activatedThisRound).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Token "other actions" — offered in FREE mode only, never in must-attack,
// never in a Creature Bank (user rules: "mode free: do whatever"; "must
// attack: cant defend or use token"; "creature bank: … not placement").
// ---------------------------------------------------------------------------

describe("PvP Neutral Control — token 'other actions' (placement)", () => {
  it("FREE mode: the controller uses a guard's Weakness token, landing it on the CHOSEN enemy", () => {
    let state = sceneTwoPreys("pnc-free-token", { mustAttack: false }, (draft) => {
      guardsOf(draft)[0].abilities = ["sorceress-weakness-few"];
    });
    const guard = guardsOf(state)[0];

    // The token "other action" is on the controller's free-play menu.
    const tokenOffer = getLegalActions(state, "p2").find(
      (offer) =>
        offer.action.type === "USE_UNIT_ABILITY" &&
        offer.action.unitId === guard.id &&
        offer.action.abilityId === "sorceress-weakness-few"
    );
    expect(tokenOffer, "the Weakness token should be offered in free mode").toBeTruthy();

    // Using it opens the target pick for the CONTROLLER (re-stamped off the
    // neutral seat by the pump), NOT the fighter.
    state = applyOk(state, tokenOffer!.action);
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    expect(choice?.playerId).toBe("p2");

    const bronzePrey = playerUnitsOf(state, "p1").find((unit) => unit.grade === "bronze")!;
    const silverPrey = playerUnitsOf(state, "p1").find((unit) => unit.grade === "silver")!;
    // The controller drops the Weakness on the SILVER prey specifically…
    state = applyOk(state, { type: "CHOOSE_ABILITY_TARGET", playerId: "p2", choiceId: choice!.id, targetUnitId: silverPrey.id });
    expect(state.combat!.units[silverPrey.id].tokens?.some((token) => token.kind === "weakness")).toBe(true);
    // …and only there — the bronze prey the controller did NOT pick is untouched.
    expect(state.combat!.units[bronzePrey.id].tokens?.some((token) => token.kind === "weakness") ?? false).toBe(false);
    // The "other action" replaced the guard's attack — its activation is over.
    expect(state.combat!.units[guard.id].activatedThisRound).toBe(true);
  });

  it("CONTROL: in MUST-ATTACK mode the token 'other action' is NOT offered (only the strike)", () => {
    const state = sceneTwoPreys("pnc-must-token", {}, (draft) => {
      guardsOf(draft)[0].abilities = ["sorceress-weakness-few"];
    });
    const guard = guardsOf(state)[0];
    const offers = getLegalActions(state, "p2");
    expect(offers.some((offer) => offer.action.type === "USE_UNIT_ABILITY" && offer.action.unitId === guard.id)).toBe(false);
    // The mandatory strike is still there — the guard is not stranded.
    expect(offers.some((offer) => offer.action.type === "ATTACK_UNIT" && offer.action.attackerId === guard.id)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Creature Banks: "move and fight, not placement" — free movement (even with
// the default must-attack toggle ON), attack, but never Defend or a token.
// ---------------------------------------------------------------------------

describe("PvP Neutral Control — Creature Bank guards", () => {
  it("move FREELY and attack — but get no Defend and no token, even with must-attack ON", () => {
    // Default toggle (must-attack ON). Guard bottom-left (12), prey top-right (3):
    // on a normal FIELD, cell 16 (walking AWAY) would be suppressed. In a BANK the
    // controller may move freely, so 16 IS offered — but Defend and the token are
    // still withheld ("move and fight, not placement").
    let state = fightWithGuards("pnc-bank-menu", {});
    if (state.combat!.context.kind === "neutral") {
      state.combat!.context.bankId = "imp_cache";
    }
    const [guard] = guardsOf(state);
    reshape(guard, { grade: "bronze", position: 12, initiative: 1 });
    guard.abilities = ["sorceress-weakness-few"]; // a token ability is present…
    const [prey, spare] = playerUnitsOf(state, "p1");
    reshape(prey, { grade: "bronze", position: 3, initiative: 99 });
    onlyUnits(state, [guard, prey, ...(spare ? [reshape(spare, { grade: "bronze", position: 7, initiative: 98 })] : [])]);
    state = driveTo(state, guardSlotOpen);
    expect(guardSlotOpen(state)).toBe(true);

    const offers = getLegalActions(state, "p2");
    const moveCells = offers.flatMap((offer) =>
      offer.action.type === "MOVE_UNIT" && offer.action.unitId === guard.id ? [offer.action.destination] : []
    );
    expect(moveCells).toContain(16); // free movement despite must-attack ON
    expect(
      offers.some((offer) => offer.action.type === "DEFEND_UNIT" && offer.action.unitId === guard.id)
    ).toBe(false); // no Defend
    expect(
      offers.some((offer) => offer.action.type === "USE_UNIT_ABILITY" && offer.action.unitId === guard.id)
    ).toBe(false); // …but the token is NEVER offered in a bank

    // CONTROL: the SAME board as a normal guard FIELD (no bankId) suppresses the
    // away-cell 16 under must-attack — proving the bank flag is what frees movement.
    let field = fightWithGuards("pnc-bank-menu-control", {});
    const [fieldGuard] = guardsOf(field);
    reshape(fieldGuard, { grade: "bronze", position: 12, initiative: 1 });
    const [fieldPrey, fieldSpare] = playerUnitsOf(field, "p1");
    reshape(fieldPrey, { grade: "bronze", position: 3, initiative: 99 });
    onlyUnits(field, [fieldGuard, fieldPrey, ...(fieldSpare ? [reshape(fieldSpare, { grade: "bronze", position: 7, initiative: 98 })] : [])]);
    field = driveTo(field, guardSlotOpen);
    const fieldMoveCells = getLegalActions(field, "p2").flatMap((offer) =>
      offer.action.type === "MOVE_UNIT" && offer.action.unitId === fieldGuard.id ? [offer.action.destination] : []
    );
    expect(fieldMoveCells).not.toContain(16); // constrained to closing moves on a field
  });
});

// ---------------------------------------------------------------------------
// Cross-mode seams: parallel turns, the turn clock, AFK, elimination
// ---------------------------------------------------------------------------

describe("PvP Neutral Control — parallel turns, clock and forced resolution", () => {
  it("treats the controller as the fight's participant in PARALLEL mode (bystander CONTROL still blocked)", () => {
    const state = sceneTwoPreys("pnc-parallel", { players: 3 });
    state.turn.mode = "parallel";
    state.turn.completedPlayerIds = [];

    expect(parallelInteractionBlocker(state, "p2")).toBeNull(); // plays the guards
    expect(parallelInteractionBlocker(state, "p3")).toBe("p1"); // plain bystander

    // The full action pipeline (fingerprint backstop included) accepts the
    // controller's unit command mid-fight.
    const guard = guardsOf(state)[0];
    const silverPrey = playerUnitsOf(state, "p1").find((unit) => unit.grade === "silver")!;
    const after = applyOk(state, {
      type: "ATTACK_UNIT",
      playerId: "p2",
      attackerId: guard.id,
      defenderId: silverPrey.id
    });
    expect(
      after.eventLog.some((event) => event.type === "UNIT_ATTACK_DECLARED" && event.defenderId === silverPrey.id)
    ).toBe(true);
  });

  it("pauses the FIGHTER's 10-minute clock while a guards' slot is open (any battle pauses; no-battle CONTROL: runs)", () => {
    const state = sceneTwoPreys("pnc-clock", {});
    expect(guardSlotOpen(state)).toBe(true);
    expect(turnClockPausedFor(state, "p1")).toBe(true);

    // Mode off (the AI plays the guards): the neutral battle is still an open
    // battle, so under the "turn timer resets in battle" rule the fighter's clock
    // is paused all the same — the pause is the open fight, not who plays it.
    const modeOff = sceneTwoPreys("pnc-clock-mode-off", { pvpNeutralControl: false });
    expect(turnClockPausedFor(modeOff, "p1")).toBe(true);

    // CONTROL: with no battle open the fighter's own clock runs normally.
    state.combat = null;
    expect(turnClockPausedFor(state, "p1")).toBe(false);
  });

  it("lets the AFK driver play a dropped controller's guard slot out with real unit commands", () => {
    const state = sceneTwoPreys("pnc-afk-slot", { players: 3 });
    expect(guardSlotOpen(state)).toBe(true);
    const action = nextAfkDropAction(state, "p2");
    expect(action && ["MOVE_UNIT", "ATTACK_UNIT", "MOVE_AND_ATTACK_UNIT", "DEFEND_UNIT", "END_ACTIVATION"].includes(action.type)).toBe(
      true
    );
  });

  it("default-answers a dropped controller's reroll window (CHOOSE_PENDING_ROLL keeps the roll)", () => {
    let state = sceneTwoPreys("pnc-afk-reroll", { players: 3 });
    const guard = guardsOf(state)[0];
    guard.abilities = ["minotaur-reroll"];
    state.combat!.dice.scriptedRolls = [-1, 1, ...Array(30).fill(0)];
    state.combat!.dice.rollCount = 0;
    const bronzePrey = playerUnitsOf(state, "p1").find((unit) => unit.grade === "bronze")!;
    state = applyOk(state, { type: "ATTACK_UNIT", playerId: "p2", attackerId: guard.id, defenderId: bronzePrey.id });
    expect(state.pendingChoice?.type).toBe("ATTACK_DIE_REROLL");
    expect(state.pendingChoice?.playerId).toBe("p2");

    const action = nextAfkDropAction(state, "p2");
    expect(action?.type).toBe("CHOOSE_PENDING_ROLL");
  });

  it("hands an eliminated controller's open neutral-side choice to the NEXT live seat", () => {
    let state = sceneTwoPreys("pnc-eliminate-choice", { players: 3 });
    const guard = guardsOf(state)[0];
    guard.abilities = ["minotaur-reroll"];
    state.combat!.dice.scriptedRolls = [-1, 1, ...Array(30).fill(0)];
    state.combat!.dice.rollCount = 0;
    const bronzePrey = playerUnitsOf(state, "p1").find((unit) => unit.grade === "bronze")!;
    state = applyOk(state, { type: "ATTACK_UNIT", playerId: "p2", attackerId: guard.id, defenderId: bronzePrey.id });
    expect(state.pendingChoice?.playerId).toBe("p2");

    // p2 dies mid-decision: the choice goes back to the neutral seat, and the
    // very next action's pump re-stamps it to p3 — the new next-clockwise seat.
    eliminatePlayer(state, "p2", "kicked mid-decision", false);
    expect(state.players.p2?.eliminated).toBe(true);
    expect(state.pendingChoice?.playerId).toBe(NEUTRAL_PLAYER_ID);
    state = applyOk(state, { type: "JOIN_ROOM", clientId: "test-client", name: "Observer" });
    expect(state.pendingChoice?.type).toBe("ATTACK_DIE_REROLL");
    expect(state.pendingChoice?.playerId).toBe("p3");
  });
});

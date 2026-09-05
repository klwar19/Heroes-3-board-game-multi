import { describe, expect, it } from "vitest";
import { eliminatePlayer, getMainHero, placeCreatureBank } from "./adventure";
import {
  ATTACKER_BACKLINE,
  ATTACKER_FRONTLINE,
  BLACK_TOWER_GUARD_CELLS,
  CREATURE_BANK_GUARD_CORNERS,
  GRAVEYARD_EXTRA_GUARD_CELLS,
  placementCellsFor,
  startNeutralEncounter,
} from "./adventure-reducer";
import { nextAfkDropAction } from "./afk-drop";
import { seatIsAwaitedInOrderedPlay, turnClockPausedFor } from "./afk";
import { applyAction, createAdventureGameState, NEUTRAL_PLAYER_ID, redactStateForSeat } from "./index";
import { getLegalActions } from "./legal-actions";
import { combatHasHumanParticipant } from "./computer/control";
import { combatUnitDecisionOwnerId, neutralCombatControllerId } from "./neutral-control";
import { parallelInteractionBlocker } from "./parallel-turns";
import { parallelStateForPlayer } from "./parallel-combats";
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

const COMPUTER_SEAT = { kind: "computer", difficulty: "standard", policyVersion: 1 } as const;

function makeGame(
  seed: string,
  options: {
    pvpNeutralControl?: boolean;
    mustAttack?: boolean;
    players?: 2 | 3;
    /** Seats driven by the AI (2026-09-04 rule: they never play the guards). */
    controllers?: GameState["controllers"];
  } = {}
): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    pvpNeutralControl: options.pvpNeutralControl ?? true,
    ...(options.mustAttack !== undefined ? { pvpNeutralControlMustAttack: options.mustAttack } : {}),
    ...(options.controllers ? { controllers: options.controllers } : {}),
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
  options: {
    players?: 2 | 3;
    pvpNeutralControl?: boolean;
    mustAttack?: boolean;
    fighter?: PlayerId;
    difficulty?: number;
    controllers?: GameState["controllers"];
  } = {}
): GameState {
  let state = makeGame(seed, options);
  const fighter = options.fighter ?? "p1";
  state.activePlayerId = fighter;
  state.players[fighter].hand = [];
  const hero = state.heroes[`hero_${fighter}`];
  const field = Object.values(state.adventure!.fields).find((candidate) => (candidate.difficulty ?? 0) > 0);
  expect(field, "the map should hold at least one guarded field").toBeTruthy();
  // Difficulty 1 draws exactly ONE bronze guard. Controlled Neutral armies now
  // get a placement window even for that one guard; most combat-behaviour tests
  // below finish that setup immediately, while the placement-specific tests use
  // difficulty 2 and intentionally stop at the open window.
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
  if (state.combat?.pendingNeutralPlacement && (options.difficulty ?? 1) === 1) {
    state = applyOk(state, {
      type: "FINISH_NEUTRAL_PLACEMENT",
      playerId: state.combat.pendingNeutralPlacement
    });
  }
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
// 2026-09-04 USER RULE (reported from a 1 v 1 + 2 AI multiplayer Clash):
// "only players should control neutral units (now it's mixed, depending on
// where the seats are — just skip AI in this)" and "not fight neutrals vs AI —
// just make it auto like in single". A COMPUTER seat is therefore never a
// manual neutral controller in EITHER direction.
// ---------------------------------------------------------------------------

describe("PvP Neutral Control — computer seats never play (or hand out) the guards", () => {
  it("skips an AI seat clockwise: with p2 a computer, p1's guards go to p3 (all-human CONTROL: p2)", () => {
    const withAi = fightWithGuards("pnc-skip-ai", {
      players: 3,
      controllers: { p2: COMPUTER_SEAT }
    });
    expect(neutralCombatControllerId(withAi, withAi.combat!)).toBe("p3");
    // The observable follow-through: every guard's INPUT belongs to p3, and the
    // assignment notice names p3 — not the AI seat that merely sits next.
    const aiGuards = guardsOf(withAi);
    expect(aiGuards.length).toBeGreaterThan(0);
    for (const guard of aiGuards) {
      expect(combatUnitDecisionOwnerId(withAi, withAi.combat!, guard)).toBe("p3");
    }
    expect(
      withAi.eventLog.find((event) => event.type === "NEUTRAL_CONTROL_ASSIGNED")?.playerId
    ).toBe("p3");
    // …and p3, not p2, is offered the guard's pre-battle formation window.
    expect(withAi.combat!.pendingNeutralPlacement ?? "p3").toBe("p3");

    // CONTROL: the same table with every seat human is byte-identical to before
    // — the next seat clockwise (p2) still plays the guards.
    const allHuman = fightWithGuards("pnc-skip-ai-control", { players: 3 });
    expect(neutralCombatControllerId(allHuman, allHuman.combat!)).toBe("p2");
    for (const guard of guardsOf(allHuman)) {
      expect(combatUnitDecisionOwnerId(allHuman, allHuman.combat!, guard)).toBe("p2");
    }
  });

  it("every other seat an AI ⇒ nobody controls the guards (the Neutral AI plays them)", () => {
    const state = fightWithGuards("pnc-only-ai-left", {
      players: 3,
      controllers: { p2: COMPUTER_SEAT, p3: COMPUTER_SEAT }
    });
    expect(neutralCombatControllerId(state, state.combat!)).toBeNull();
    for (const guard of guardsOf(state)) {
      expect(combatUnitDecisionOwnerId(state, state.combat!, guard)).toBe(NEUTRAL_PLAYER_ID);
    }
    expect(state.eventLog.some((event) => event.type === "NEUTRAL_CONTROL_ASSIGNED")).toBe(false);
    expect(state.combat!.pendingNeutralPlacement ?? null).toBeNull();
  });

  it("a COMPUTER fighter's neutral fight has NO controller and is classified AI-only", () => {
    // The fight is set up while p1 is still human (the fixture drives p1's own
    // placement actions); stamping the controller afterwards is enough because
    // every controller read is derived fresh from `state.controllers`.
    const state = fightWithGuards("pnc-ai-fighter", { players: 3 });
    expect(neutralCombatControllerId(state, state.combat!), "CONTROL: a human fighter keeps p2").toBe("p2");
    expect(combatHasHumanParticipant(state)).toBe(true);

    state.controllers = { p1: COMPUTER_SEAT };
    expect(neutralCombatControllerId(state, state.combat!)).toBeNull();
    for (const guard of guardsOf(state)) {
      expect(combatUnitDecisionOwnerId(state, state.combat!, guard)).toBe(NEUTRAL_PLAYER_ID);
    }
    // No human seat is in the fight any more, so the live pump bulk-resolves it
    // off-screen exactly like a single-player AI fight.
    expect(combatHasHumanParticipant(state)).toBe(false);
    // …and the human seats are offered nothing inside it.
    for (const seat of ["p2", "p3"] as const) {
      const offers = getLegalActions(state, seat).filter((legal) =>
        ["ATTACK_UNIT", "MOVE_UNIT", "DEFEND_UNIT", "END_ACTIVATION", "FINISH_NEUTRAL_PLACEMENT"].includes(
          legal.action.type
        )
      );
      expect(offers.map((legal) => legal.action.type), `${seat} must own no guard action`).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// The controlling player DRIVES the guards like a PvP side
// ---------------------------------------------------------------------------

describe("PvP Neutral Control — the next player drives the guards", () => {
  it("stops on the guard's activation and offers the NEXT player its unit actions (fighter gets none)", () => {
    const state = sceneTwoPreys("pnc-drive-menu", {});
    expect(guardSlotOpen(state)).toBe(true);
    expect(state.activePlayerId).toBe("p2");
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

  it("keeps the controller's command visible in a redacted hosted frame and enforces its multiplayer seat", () => {
    const state = sceneTwoPreys("pnc-hosted-seat", {});
    state.room = {
      hosted: true,
      hostClientId: "fighter-client",
      members: [
        { clientId: "fighter-client", name: "Fighter", seat: "p1", isHost: true },
        { clientId: "neutral-client", name: "Controller", seat: "p2", isHost: false }
      ]
    };
    const guard = guardsOf(state)[0];

    // This is the state the p2 browser actually receives. Hidden hands/decks
    // must not erase the public Neutral ownership needed to build board actions.
    const controllerFrame = redactStateForSeat(state, "p2");
    const command = getLegalActions(controllerFrame, "p2").find(
      (legal) => legal.action.type === "ATTACK_UNIT" && legal.action.attackerId === guard.id
    );
    expect(command, "p2's redacted frame should contain a clickable guard attack").toBeTruthy();

    const forged = applyAction(state, command!.action, { actorClientId: "fighter-client" });
    expect(forged.errors[0]?.message).toContain("own seat");
    const accepted = applyAction(state, command!.action, { actorClientId: "neutral-client" });
    expect(accepted.errors, accepted.errors.map((error) => error.message).join("; ")).toEqual([]);
    expect(accepted.state.combat?.units[guard.id].controllerId).toBe(NEUTRAL_PLAYER_ID);
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
      // Keep the tie a real choice: fully identical clones now auto-pick for
      // AI-driven guards (the Imp Cache order fix), and this test pins WHO gets
      // the prompt — so the twin carries a Stack Token to stay distinguishable.
      twin.stackToken = "attack";
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

  /**
   * Magog (ranged) at 0 free-shoots a NON-adjacent target at 5, with two flanks
   * at 6 and 9 adjacent to that target — the fireball splash then has exactly
   * two victims to choose between. In mode OFF the AI shoots the nearest prey
   * (the target at distance 2).
   */
  function magogSplashScene(seed: string, pvpNeutralControl: boolean) {
    const state = fightWithGuards(seed, { players: 3, pvpNeutralControl });
    const guard = guardsOf(state)[0];
    reshape(guard, { grade: "bronze", type: "ranged", position: 0, initiative: 1, attack: 4 });
    guard.abilities = ["magog-fireball-splash"];
    const [target, flankA] = playerUnitsOf(state, "p1");
    reshape(target, { grade: "bronze", position: 5, initiative: 99 });
    reshape(flankA, { grade: "bronze", position: 6, initiative: 98 });
    const flankB = structuredClone(flankA);
    flankB.id = `${flankA.id}_flankB`;
    flankB.position = 9;
    flankB.initiative = 97;
    state.combat!.units[flankB.id] = flankB;
    onlyUnits(state, [guard, target, flankA, flankB]);
    return { state, guardId: guard.id, targetId: target.id, flankAId: flankA.id, flankBId: flankB.id };
  }

  it("re-stamps a neutral Magog's splash victim pick to the CONTROLLER (mode-off CONTROL: the FIGHTER picks)", () => {
    // Mode ON: p2 (the controller) drives the guard's shot, and the fireball
    // splash pick it opens is THEIRS — re-stamped off the neutral seat by the
    // pump — not the fighter p1's.
    const scene = magogSplashScene("pnc-splash-on", true);
    const { guardId, targetId, flankAId, flankBId } = scene;
    let state = scene.state;
    state = driveTo(state, guardSlotOpen);
    expect(guardSlotOpen(state)).toBe(true);
    state = applyOk(state, { type: "ATTACK_UNIT", playerId: "p2", attackerId: guardId, defenderId: targetId });
    state = driveTo(state, (current) => current.pendingChoice?.type === "ABILITY_TARGET_CHOICE");
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") {
      return;
    }
    expect(choice.kind).toBe("flat-damage");
    expect(choice.playerId).toBe("p2"); // the CONTROLLER, not the fighter p1
    expect(new Set(choice.candidateUnitIds)).toEqual(new Set([flankAId, flankBId]));

    // The fighter may NOT resolve the controller's splash pick…
    const usurped = applyAction(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: flankAId
    });
    expect(usurped.errors.length).toBeGreaterThan(0);

    // …the controller drops it on flank A specifically, and only there.
    state = applyOk(state, { type: "CHOOSE_ABILITY_TARGET", playerId: "p2", choiceId: choice.id, targetUnitId: flankAId });
    expect(state.combat!.units[flankAId].damage).toBe(1);
    expect(state.combat!.units[flankBId].damage).toBe(0);

    // CONTROL — mode OFF (the AI plays the guards): the same board hands the
    // splash pick to the FIGHTER p1 instead (the plain-fight house rule).
    const off = magogSplashScene("pnc-splash-off", false);
    const settled = driveTo(off.state, (current) => current.pendingChoice?.type === "ABILITY_TARGET_CHOICE");
    const offChoice = settled.pendingChoice;
    expect(offChoice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (offChoice?.type !== "ABILITY_TARGET_CHOICE") {
      return;
    }
    expect(offChoice.kind).toBe("flat-damage");
    expect(offChoice.playerId).toBe("p1"); // the FIGHTER picks in a plain fight
    expect(new Set(offChoice.candidateUnitIds)).toEqual(new Set([off.flankAId, off.flankBId]));
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
// Pre-battle formation SORT (pendingNeutralPlacement) — offered on a normal
// guard FIELD (any mode), "just like a defender"; a Creature Bank CANNOT sort
// (corners kept). The in-combat menu is otherwise IDENTICAL for both.
// ---------------------------------------------------------------------------

/** Whether the pre-battle formation-sort window is open for `playerId`. */
function sortWindowOpenFor(state: GameState, playerId: PlayerId): boolean {
  return state.combat?.pendingNeutralPlacement === playerId && state.phase === "combat-setup";
}

describe("PvP Neutral Control — pre-battle formation sort", () => {
  it("opens the sort window for the CONTROLLER on a normal field (≥2 guards); the fighter gets none", () => {
    // Difficulty 2 → two bronze guards, so the sort window opens for the
    // controller p2 after the reveal. The fighter p1 is NOT offered it.
    const state = fightWithGuards("pnc-sort-open", { players: 3, difficulty: 2 });
    expect(sortWindowOpenFor(state, "p2")).toBe(true);
    expect(state.priorityPlayerId).toBe("p2");
    expect(state.eventLog.some((event) => event.type === "NEUTRAL_FORMATION_SORT_OPENED")).toBe(true);

    const controllerSorts = getLegalActions(state, "p2");
    expect(controllerSorts.some((offer) => offer.action.type === "PLACE_NEUTRAL_GUARD")).toBe(true);
    expect(controllerSorts.some((offer) => offer.action.type === "FINISH_NEUTRAL_PLACEMENT")).toBe(true);
    // The "Let the AI place them" reset is Manual-guard-control ONLY: a PvP
    // opponent arranging an enemy's formation is never offered it.
    expect(controllerSorts.some((offer) => offer.action.type === "AUTO_NEUTRAL_PLACEMENT")).toBe(false);
    // The FIGHTER may not sort the neutral formation.
    expect(getLegalActions(state, "p1").some((offer) => offer.action.type === "PLACE_NEUTRAL_GUARD")).toBe(false);
    expect(getLegalActions(state, "p1").some((offer) => offer.action.type === "FINISH_NEUTRAL_PLACEMENT")).toBe(false);
  });

  it("moves a guard to an empty defender cell — and FINISH starts the battle (CONTROL: mode-off auto-places, no window)", () => {
    let state = fightWithGuards("pnc-sort-move", { players: 3, difficulty: 2 });
    const guards = guardsOf(state);
    const guard = guards[0];
    const target = [0, 1, 2, 3, 4, 5, 6, 7].find(
      (cell) => !Object.values(state.combat!.units).some((unit) => unit.position === cell)
    )!;

    state = applyOk(state, { type: "PLACE_NEUTRAL_GUARD", playerId: "p2", unitId: guard.id, position: target });
    expect(state.combat!.units[guard.id].position).toBe(target);

    // Finish → the sort window closes and the battle begins (round 1 / tactics).
    state = applyOk(state, { type: "FINISH_NEUTRAL_PLACEMENT", playerId: "p2" });
    expect(state.combat!.pendingNeutralPlacement ?? null).toBeNull();
    expect(state.phase).not.toBe("combat-setup");

    // CONTROL: mode OFF, the SAME difficulty-2 fight opens NO sort window — the
    // guards are auto-placed and the battle is ready immediately.
    const modeOff = fightWithGuards("pnc-sort-move-off", { players: 3, difficulty: 2, pvpNeutralControl: false });
    expect(modeOff.combat!.pendingNeutralPlacement ?? null).toBeNull();
  });

  it("swaps two guards, allows any defender-row cell, and REJECTS off-side / non-controller", () => {
    let state = fightWithGuards("pnc-sort-swap", { players: 3, difficulty: 2 });
    const [a, b] = guardsOf(state);
    const posA = a.position;
    const posB = b.position;

    // Swap: dropping guard A onto guard B's cell trades their positions.
    state = applyOk(state, { type: "PLACE_NEUTRAL_GUARD", playerId: "p2", unitId: a.id, position: posB });
    expect(state.combat!.units[a.id].position).toBe(posB);
    expect(state.combat!.units[b.id].position).toBe(posA);

    // Any empty cell on the defender's two rows is legal (front or back).
    const defenderRows = [0, 1, 2, 3, 4, 5, 6, 7];
    const freeDefenderCell = defenderRows.find(
      (cell) => !Object.values(state.combat!.units).some((unit) => unit.position === cell)
    )!;
    state = applyOk(state, {
      type: "PLACE_NEUTRAL_GUARD",
      playerId: "p2",
      unitId: a.id,
      position: freeDefenderCell
    });
    expect(state.combat!.units[a.id].position).toBe(freeDefenderCell);

    // CONTROL: the shooter-on-the-back-row rule is Manual-guard-control ONLY. A
    // PvP opponent may place even a RANGED guard on a FRONT-row cell.
    state.combat!.units[a.id].type = "ranged";
    const frontCell = [4, 5, 6, 7].find(
      (cell) => !Object.values(state.combat!.units).some((unit) => unit.position === cell)
    )!;
    const rangedToFront = applyAction(state, {
      type: "PLACE_NEUTRAL_GUARD",
      playerId: "p2",
      unitId: a.id,
      position: frontCell
    });
    expect(rangedToFront.errors).toEqual([]);
    expect(rangedToFront.state.combat!.units[a.id].position).toBe(frontCell);

    // Attacker-side cell 12 is outside the defender's two rows — rejected.
    const outOfZone = applyAction(state, { type: "PLACE_NEUTRAL_GUARD", playerId: "p2", unitId: a.id, position: 12 });
    expect(outOfZone.errors.length).toBeGreaterThan(0);

    // The FIGHTER may not sort — rejected even for a legal defender cell/guard.
    const emptyCell = defenderRows.find(
      (cell) => !Object.values(state.combat!.units).some((unit) => unit.position === cell)
    )!;
    const byFighter = applyAction(state, { type: "PLACE_NEUTRAL_GUARD", playerId: "p1", unitId: a.id, position: emptyCell });
    expect(byFighter.errors.length).toBeGreaterThan(0);
  });

  it("opens the sort window on a Creature Bank too (rearrange within the four corners)", () => {
    let state = makeGame("pnc-bank-sort", { players: 3 });
    state.activePlayerId = "p1";
    state.players.p1.hand = [];
    const hero = getMainHero(state, "p1")!;
    hero.level = 7;
    hero.spaceId = "bank-field";
    state.adventure!.fields["bank-field"] = {
      spaceId: "bank-field",
      tileInstanceId: "t",
      slot: 0,
      location: "blocked_field",
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };
    placeCreatureBank(state, "bank-field", "naga_bank");
    startNeutralEncounter(state, hero, state.adventure!.fields["bank-field"]);
    expect(state.combat?.context.kind === "neutral" && state.combat.context.bankId).toBe("naga_bank");

    const place = getLegalActions(state, "p1").find((offer) => offer.action.type === "PLACE_COMBAT_UNIT")!;
    state = applyOk(state, place.action);
    state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });

    // Four bank guards revealed at their corners — the controller MAY sort them
    // (swap/rearrange within the four corner cells) before the fight starts.
    expect(guardsOf(state).length).toBe(4);
    expect(sortWindowOpenFor(state, "p2")).toBe(true);
    expect(getLegalActions(state, "p2").some((offer) => offer.action.type === "PLACE_NEUTRAL_GUARD")).toBe(true);
    expect(getLegalActions(state, "p2").some((offer) => offer.action.type === "FINISH_NEUTRAL_PLACEMENT")).toBe(
      true
    );
    // CONTROL: mode off never opens a bank sort window.
    let off = makeGame("pnc-bank-sort-off", { players: 3, pvpNeutralControl: false });
    off.activePlayerId = "p1";
    off.players.p1.hand = [];
    const offHero = getMainHero(off, "p1")!;
    offHero.level = 7;
    offHero.spaceId = "bank-field";
    off.adventure!.fields["bank-field"] = {
      spaceId: "bank-field",
      tileInstanceId: "t",
      slot: 0,
      location: "blocked_field",
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };
    placeCreatureBank(off, "bank-field", "naga_bank");
    startNeutralEncounter(off, offHero, off.adventure!.fields["bank-field"]);
    const offPlace = getLegalActions(off, "p1").find((offer) => offer.action.type === "PLACE_COMBAT_UNIT")!;
    off = applyOk(off, offPlace.action);
    off = applyOk(off, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
    expect(off.combat!.pendingNeutralPlacement ?? null).toBeNull();
  });

  it("uses Graveyard's six printed spaces, including the corrected two middle cells", () => {
    let state = makeGame("graveyard-six-space-formation", { pvpNeutralControl: false });
    state.activePlayerId = "p1";
    state.players.p1.hand = [];
    state.adventure!.houseRules!["polish-creature-banks"] = true;
    state.adventure!.houseRules!["polish-bank-sizes"] = true;
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = "bank-field";
    state.adventure!.fields["bank-field"] = {
      spaceId: "bank-field", tileInstanceId: "t", slot: 0, location: "blocked_field",
      blackCube: false, flagOwnerId: null, everFlagged: false, settlementResource: null,
    };
    placeCreatureBank(state, "bank-field", "graveyard", 2);
    startNeutralEncounter(state, hero, state.adventure!.fields["bank-field"]);
    const place = getLegalActions(state, "p1").find((offer) => offer.action.type === "PLACE_COMBAT_UNIT")!;
    state = applyOk(state, place.action);
    state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
    expect(guardsOf(state).map((unit) => unit.position).sort((a, b) => a - b)).toEqual(
      [...CREATURE_BANK_GUARD_CORNERS, ...GRAVEYARD_EXTRA_GUARD_CELLS].sort((a, b) => a - b)
    );
  });

  it("gives Black Tower the normal player area and lets the controller choose either Dragon space", () => {
    let state = makeGame("black-tower-two-space-formation", { players: 3 });
    state.activePlayerId = "p1";
    state.players.p1.hand = [];
    state.adventure!.houseRules!["polish-creature-banks"] = true;
    state.adventure!.houseRules!["polish-bank-sizes"] = true;
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = "bank-field";
    state.adventure!.fields["bank-field"] = {
      spaceId: "bank-field", tileInstanceId: "t", slot: 0, location: "blocked_field",
      blackCube: false, flagOwnerId: null, everFlagged: false, settlementResource: null,
    };
    placeCreatureBank(state, "bank-field", "black_tower", 2);
    startNeutralEncounter(state, hero, state.adventure!.fields["bank-field"]);
    expect(state.pendingChoice?.type).not.toBe("OPTION_CHOICE");
    expect(placementCellsFor(state, "p1").sort((a, b) => a - b)).toEqual(
      [...ATTACKER_FRONTLINE, ...ATTACKER_BACKLINE].sort((a, b) => a - b)
    );
    const place = getLegalActions(state, "p1").find((offer) => offer.action.type === "PLACE_COMBAT_UNIT")!;
    state = applyOk(state, place.action);
    state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
    const dragon = guardsOf(state)[0]!;
    expect(dragon.bankSideKey).toBe("guardian:red-dragon");
    expect(dragon.stackToken).toBeUndefined();
    expect(BLACK_TOWER_GUARD_CELLS).toContain(dragon.position);
    expect(sortWindowOpenFor(state, "p2")).toBe(true);
    const other = BLACK_TOWER_GUARD_CELLS.find((cell) => cell !== dragon.position)!;
    state = applyOk(state, {
      type: "PLACE_NEUTRAL_GUARD", playerId: "p2", unitId: dragon.id, position: other,
    });
    expect(state.combat!.units[dragon.id].position).toBe(other);
  });

  it("CONTROL: Polish bank cards without Polish sizes retain the Black Tower OR-row choice", () => {
    const state = makeGame("black-tower-card-only-choice", { players: 3 });
    state.activePlayerId = "p1";
    state.players.p1.hand = [];
    state.adventure!.houseRules!["polish-creature-banks"] = true;
    state.adventure!.houseRules!["polish-bank-sizes"] = false;
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = "bank-field";
    state.adventure!.fields["bank-field"] = {
      spaceId: "bank-field", tileInstanceId: "t", slot: 0, location: "blocked_field",
      blackCube: false, flagOwnerId: null, everFlagged: false, settlementResource: null,
    };
    placeCreatureBank(state, "bank-field", "black_tower");
    startNeutralEncounter(state, hero, state.adventure!.fields["bank-field"]);
    expect(state.pendingChoice).toMatchObject({
      type: "OPTION_CHOICE",
      context: "black-tower-dragon",
    });
  });

  it("hands the sort window to the NEXT controller when the current one is eliminated", () => {
    const state = fightWithGuards("pnc-sort-eliminate", { players: 3, difficulty: 2 });
    expect(sortWindowOpenFor(state, "p2")).toBe(true);
    // p2 (the controller) is kicked mid-sort: the window passes to p3 (the next
    // clockwise seat from the p1 fighter), never stranding the pre-battle setup.
    eliminatePlayer(state, "p2", "kicked mid-sort", false);
    expect(state.combat!.pendingNeutralPlacement).toBe("p3");
    expect(state.priorityPlayerId).toBe("p3");
  });
});

// ---------------------------------------------------------------------------
// Cross-mode seams: parallel turns, the turn clock, AFK, elimination
// ---------------------------------------------------------------------------

describe("PvP Neutral Control — parallel turns, clock and forced resolution", () => {
  it("allows the human neutral decision during a shared-event battle while other adventure turns remain blocked", () => {
    const state = sceneTwoPreys("pnc-event-battle", { players: 3 });
    state.turn.mode = "parallel";
    state.adventure!.eventResolution = { round: state.round };
    expect(getLegalActions(state, "p3")).toEqual([]);
    const attack = getLegalActions(state, "p2").find(l => l.action.type === "ATTACK_UNIT");
    expect(attack).toBeDefined();
    const next = applyOk(state, attack!.action);
    expect(next.eventLog.some(event => event.type === "UNIT_ATTACK_DECLARED")).toBe(true);
    expect(next.round).toBe(state.round);
  });

  it("lets the controller select and command a neutral battle in PARALLEL mode", () => {
    let state = sceneTwoPreys("pnc-parallel", { players: 3 });
    state.turn.mode = "parallel";
    state.turn.completedPlayerIds = [];

    expect(parallelInteractionBlocker(state, "p2")).toBeNull(); // plays the guards
    expect(parallelInteractionBlocker(state, "p3")).toBe("p1"); // plain bystander

    // The full action pipeline (fingerprint backstop included) accepts the
    // controller's unit command mid-fight.
    const guard = guardsOf(state)[0];
    const silverPrey = playerUnitsOf(state, "p1").find((unit) => unit.grade === "silver")!;
    state = applyOk(state, { type: "SELECT_PARALLEL_CONTEXT", playerId: "p2", ownerPlayerId: "p1" });
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
    expect(seatIsAwaitedInOrderedPlay(state, "p2")).toBe(true);
    // Saved games from before decision-owner synchronization can still carry
    // activePlayerId="neutral". Derive the controller from the active guard so
    // that reconnecting such a game does not disable AFK recovery.
    state.activePlayerId = NEUTRAL_PLAYER_ID;
    expect(seatIsAwaitedInOrderedPlay(state, "p2")).toBe(true);
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

  it.each([false, true])("hands an eliminated controller's open neutral-side choice to the NEXT live seat (parked: %s)", (parked) => {
    let state = sceneTwoPreys("pnc-eliminate-choice", { players: 3 });
    const guard = guardsOf(state)[0];
    guard.abilities = ["minotaur-reroll"];
    state.combat!.dice.scriptedRolls = [-1, 1, ...Array(30).fill(0)];
    state.combat!.dice.rollCount = 0;
    const bronzePrey = playerUnitsOf(state, "p1").find((unit) => unit.grade === "bronze")!;
    state = applyOk(state, { type: "ATTACK_UNIT", playerId: "p2", attackerId: guard.id, defenderId: bronzePrey.id });
    expect(state.pendingChoice?.playerId).toBe("p2");

    if (parked) {
      state.turn.mode = "parallel";
      state = parallelStateForPlayer(state, "p2");
      expect(state.parallelCombats?.p1.pendingChoice?.playerId).toBe("p2");
      eliminatePlayer(state, "p2", "kicked mid-decision", false);
      expect(state.parallelCombats?.p1.pendingChoice?.playerId).toBe("p3");
      state = applyOk(state, { type: "SELECT_PARALLEL_CONTEXT", playerId: "p3", ownerPlayerId: "p1" });
      const keepRoll = getLegalActions(state, "p3").find(l => l.action.type === "CHOOSE_PENDING_ROLL");
      expect(keepRoll).toBeDefined();
      state = applyOk(state, keepRoll!.action);
      expect(parallelStateForPlayer(state, "p3").pendingChoice?.type).not.toBe("ATTACK_DIE_REROLL");
      return;
    }

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

// ---------------------------------------------------------------------------
// Neutral Harpy "Strike and Return" — under PvP Neutral Control the fly-back is
// the CONTROLLER's choice in FREE mode; MUST-ATTACK mode keeps the printed
// auto-return. An eliminated controller's open reposition choice hands back to
// the neutral seat. Each claim is mutation-checked with the opposite-mode
// CONTROL.
// ---------------------------------------------------------------------------

describe("PvP Neutral Control — neutral Harpy fly-back", () => {
  const isReposition = (state: GameState): boolean =>
    state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context === "combat-reposition";

  /**
   * One flying guard with the Harpy "Strike and Return" ability at A2 (space 4)
   * and a lone p1 prey at B1 (space 1). The guard must MOVE (A2 → B2 / space 5,
   * adjacent to the prey) to strike, so a fly-back origin exists. Driven to the
   * guard's open slot for the controller (p2).
   */
  function harpyScene(seed: string, options: { mustAttack: boolean }): {
    state: GameState;
    guardId: string;
    preyId: string;
  } {
    let state = fightWithGuards(seed, { mustAttack: options.mustAttack });
    const [guard] = guardsOf(state);
    reshape(guard, { grade: "bronze", type: "flying", position: 4, initiative: 1, attack: 0 });
    guard.name = "Harpies";
    guard.cardName = "Harpies";
    guard.abilities = ["harpy-return"];
    const [prey] = playerUnitsOf(state, "p1");
    reshape(prey, { grade: "bronze", position: 1, initiative: 99, attack: 0 });
    onlyUnits(state, [guard, prey]);
    state = driveTo(state, guardSlotOpen);
    return { state, guardId: guard.id, preyId: prey.id };
  }

  it("FREE mode: the CONTROLLER (p2) chooses fly-back or stay after a moved-then-struck guard", () => {
    const { state, guardId, preyId } = harpyScene("pnc-harpy-free", { mustAttack: false });
    expect(state.priorityPlayerId).toBe("p2");

    // p2 drives the guard: fly A2(4) → B2(5), then strike the prey at B1.
    const moved = applyOk(state, { type: "MOVE_UNIT", playerId: "p2", unitId: guardId, destination: 5 });
    let struck = applyOk(moved, { type: "ATTACK_UNIT", playerId: "p2", attackerId: guardId, defenderId: preyId });
    struck = driveTo(struck, isReposition);

    const choice = struck.pendingChoice;
    expect(isReposition(struck)).toBe(true);
    // Opened NEUTRAL-owned, re-stamped to the CONTROLLER (p2) — not the fighter.
    expect(choice?.playerId).toBe("p2");
    expect(struck.combat!.units[guardId].position).toBe(5);

    // The FIGHTER (p1) may not answer the guards' choice.
    const usurped = applyAction(struck, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice!.id,
      optionIndex: 0
    });
    expect(usurped.errors.length).toBeGreaterThan(0);

    // "Stay" (option 1): the guard keeps the attack square (B2 / 5).
    const stayed = applyOk(struck, { type: "CHOOSE_OPTION", playerId: "p2", choiceId: choice!.id, optionIndex: 1 });
    expect(stayed.combat!.units[guardId].position).toBe(5);
    // "Fly back" (option 0): the guard returns to its origin (A2 / 4).
    const flew = applyOk(struck, { type: "CHOOSE_OPTION", playerId: "p2", choiceId: choice!.id, optionIndex: 0 });
    expect(flew.combat!.units[guardId].position).toBe(4);
  });

  it("CONTROL: MUST-ATTACK mode keeps the printed AUTO-return — no fly-back choice opens", () => {
    const { state, guardId, preyId } = harpyScene("pnc-harpy-must", { mustAttack: true });
    // Must-attack offers a move to the strike cell (B2 / 5) then the mandatory strike.
    const moved = applyOk(state, { type: "MOVE_UNIT", playerId: "p2", unitId: guardId, destination: 5 });
    let struck = applyOk(moved, { type: "ATTACK_UNIT", playerId: "p2", attackerId: guardId, defenderId: preyId });
    struck = driveTo(struck, (s) => Boolean(s.combat?.units[guardId]?.activatedThisRound) || isReposition(s));
    expect(isReposition(struck)).toBe(false); // rulebook auto-return, no choice
    expect(struck.combat!.units[guardId].position).toBe(4); // returned to its origin
    expect(struck.combat!.units[guardId].activatedThisRound).toBe(true);
  });

  it("hands an eliminated controller's open reposition choice to the NEXT live seat", () => {
    // Three-player fight so a live seat remains after the controller drops.
    let state = fightWithGuards("pnc-harpy-eliminate", { players: 3, mustAttack: false });
    const [guard] = guardsOf(state);
    reshape(guard, { grade: "bronze", type: "flying", position: 4, initiative: 1, attack: 0 });
    guard.abilities = ["harpy-return"];
    const [prey] = playerUnitsOf(state, "p1");
    reshape(prey, { grade: "bronze", position: 1, initiative: 99, attack: 0 });
    onlyUnits(state, [guard, prey]);
    state = driveTo(state, guardSlotOpen);
    expect(state.priorityPlayerId).toBe("p2"); // p1's fight → p2 controls

    const moved = applyOk(state, { type: "MOVE_UNIT", playerId: "p2", unitId: guard.id, destination: 5 });
    let struck = applyOk(moved, { type: "ATTACK_UNIT", playerId: "p2", attackerId: guard.id, defenderId: prey.id });
    struck = driveTo(struck, isReposition);
    expect(struck.pendingChoice?.playerId).toBe("p2");

    // p2 dies mid-choice: the reposition choice (a neutral-side decision) goes
    // back to the neutral seat instead of stranding the paused activation…
    eliminatePlayer(struck, "p2", "kicked mid-choice", false);
    expect(struck.pendingChoice?.playerId).toBe(NEUTRAL_PLAYER_ID);
    // …and the next action's pump re-stamps it to p3 (the new next-clockwise seat).
    struck = applyOk(struck, { type: "JOIN_ROOM", clientId: "test-client", name: "Observer" });
    expect(isReposition(struck)).toBe(true);
    expect(struck.pendingChoice?.playerId).toBe("p3");
  });
});

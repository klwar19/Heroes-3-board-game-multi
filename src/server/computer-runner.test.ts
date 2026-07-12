import { describe, expect, it } from "vitest";
import {
  applyAction,
  computerDecisionOwner,
  createAdventureGameState,
  createAdventureLobbyState,
  createInitialGameState,
  getLegalActions,
  standardComputerController,
  type ComputerDecision,
  type GameAction,
  type GameState,
} from "@/engine";
import {
  driveComputerPlayers,
  isPacedComputerAction,
  settleComputerVisibleStep,
  settleComputerWork,
} from "./computer-runner";

function humanAct(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors).toEqual([]);
  return result.state;
}

/** Take the human's first offered legal action of the given type. */
function humanFirst(
  state: GameState,
  type: GameAction["type"],
  playerId = "p1",
): GameState {
  const offer = getLegalActions(state, playerId).find(
    (legal) => legal.action.type === type,
  );
  expect(offer, `expected a legal ${type} for ${playerId}`).toBeDefined();
  return humanAct(state, offer!.action);
}

describe("computer runner foundation", () => {
  it("completes every computer free-pick seat through real legal actions once the human picked", () => {
    const state = createAdventureLobbyState({
      seed: "runner-setup",
      scenarioId: "skirmish",
      sessionMode: "single-player",
      computerOpponents: 3,
    });
    // Human first dibs: with the human seat unpicked the runner does nothing —
    // a bot must never snipe the faction the human wants.
    const idle = driveComputerPlayers(structuredClone(state));
    expect(idle.stalled).toBe(false);
    expect(idle.decisions).toHaveLength(0);

    const picked = humanAct(state, {
      type: "CHOOSE_FACTION",
      playerId: "p1",
      factionId: "castle",
      heroDefId: "catherine",
    });
    const result = driveComputerPlayers(picked);

    expect(result.stalled).toBe(false);
    expect(result.decisions).toHaveLength(3);
    expect(
      result.decisions.every(
        (decision) => decision.action.type === "CHOOSE_FACTION",
      ),
    ).toBe(true);
    const seats = result.state.setupLobby!.seats;
    expect(seats[0].factionId).toBe("castle");
    expect(
      seats.slice(1).every((seat) => seat.factionId && seat.heroDefId),
    ).toBe(true);
    // Nobody took the human's faction; all four factions are distinct.
    expect(new Set(seats.map((seat) => seat.factionId)).size).toBe(4);
  });

  it("reports an explicit stall instead of looping when policy has no safe action", () => {
    const state = createAdventureLobbyState({
      seed: "runner-stall",
      sessionMode: "single-player",
      computerOpponents: 1,
    });
    state.setupLobby!.seats[1].factionId = "inferno";
    state.setupLobby!.seats[1].heroDefId = null;
    // In open format CHOOSE_FACTION remains available, so deliberately remove
    // every playable faction by reserving the only capacity through a fixture.
    for (const seat of state.setupLobby!.seats) {
      if (seat.playerId === "p1") {
        seat.factionId = "castle";
        seat.heroDefId = "catherine";
      }
    }
    const result = driveComputerPlayers(
      state,
      () => ({
        state,
        events: [],
        errors: [{ code: "ACTION_NOT_LEGAL", message: "broken fixture" }],
      }),
      { maxSteps: 2 },
    );
    expect(result.stalled).toBe(true);
    expect(result.reason).toContain("no safe legal action");
  });

  it("gives the same decisions for the same seed and state", () => {
    let state = createAdventureLobbyState({
      seed: "runner-deterministic",
      scenarioId: "skirmish",
      sessionMode: "single-player",
      computerOpponents: 3,
    });
    state = humanAct(state, {
      type: "CHOOSE_FACTION",
      playerId: "p1",
      factionId: "castle",
      heroDefId: "catherine",
    });
    const first = driveComputerPlayers(structuredClone(state));
    const second = driveComputerPlayers(structuredClone(state));
    expect(first.decisions.length).toBeGreaterThan(0);
    expect(first.decisions).toEqual(second.decisions);
  });
});

describe("computer setup formats", () => {
  it("random: each computer seat completes with one legal roll", () => {
    let state = createAdventureLobbyState({
      seed: "runner-format-random",
      scenarioId: "skirmish",
      sessionMode: "single-player",
      computerOpponents: 3,
    });
    state = humanAct(state, {
      type: "SET_DRAFT_FORMAT",
      playerId: "p1",
      format: "random",
    });
    state = humanFirst(state, "RANDOM_ASSIGN_SEAT");
    const run = driveComputerPlayers(state);
    expect(run.stalled).toBe(false);
    expect(run.decisions.map((decision) => decision.action.type)).toEqual([
      "RANDOM_ASSIGN_SEAT",
      "RANDOM_ASSIGN_SEAT",
      "RANDOM_ASSIGN_SEAT",
    ]);
    const seats = run.state.setupLobby!.seats;
    expect(
      seats.slice(1).every((seat) => seat.factionId && seat.heroDefId),
    ).toBe(true);
    expect(new Set(seats.slice(1).map((seat) => seat.factionId)).size).toBe(3);
  });

  it("random-choice: roll town, lock a rolled town, roll heroes, pick a rolled hero", () => {
    let state = createAdventureLobbyState({
      seed: "runner-format-random-choice",
      scenarioId: "skirmish",
      sessionMode: "single-player",
      computerOpponents: 1,
    });
    state = humanAct(state, {
      type: "SET_DRAFT_FORMAT",
      playerId: "p1",
      format: "random-choice",
    });
    state = humanFirst(state, "ROLL_TOWN_OPTIONS");
    state = humanFirst(state, "CHOOSE_TOWN");
    state = humanFirst(state, "ROLL_HERO_OPTIONS");
    state = humanFirst(state, "CHOOSE_FACTION");
    const run = driveComputerPlayers(state);
    expect(run.stalled).toBe(false);
    expect(run.decisions.map((decision) => decision.action.type)).toEqual([
      "ROLL_TOWN_OPTIONS",
      "CHOOSE_TOWN",
      "ROLL_HERO_OPTIONS",
      "CHOOSE_FACTION",
    ]);
    const seat = run.state.setupLobby!.seats[1];
    expect(seat.factionId).toBeTruthy();
    expect(seat.heroDefId).toBeTruthy();
  });

  it("draft: computers lock towns, wait for the human, ban in rotation and pick unbanned heroes", () => {
    let state = createAdventureLobbyState({
      seed: "runner-format-draft",
      scenarioId: "skirmish",
      sessionMode: "single-player",
      computerOpponents: 2,
    });
    state = humanAct(state, {
      type: "SET_DRAFT_FORMAT",
      playerId: "p1",
      format: "draft",
    });

    // Human town dibs first: until the human locks a town, the runner idles.
    const idle = driveComputerPlayers(structuredClone(state));
    expect(idle.stalled).toBe(false);
    expect(idle.decisions).toHaveLength(0);

    // Human locks a town, then the computers lock theirs directly (no reroll
    // loops) and WAIT for the ban rotation, which starts with the HUMAN.
    state = humanFirst(state, "CHOOSE_TOWN");
    const townsRun = driveComputerPlayers(state);
    expect(townsRun.stalled).toBe(false);
    expect(
      townsRun.decisions.map((decision) => decision.action.type),
    ).toEqual(["CHOOSE_TOWN", "CHOOSE_TOWN"]);
    expect(
      townsRun.state
        .setupLobby!.seats.slice(1)
        .every((seat) => seat.factionId && !seat.heroDefId),
    ).toBe(true);

    const next = humanFirst(townsRun.state, "BAN_HERO");
    const finishRun = driveComputerPlayers(next);
    expect(finishRun.stalled).toBe(false);
    // Two computer bans in rotation, then both computer hero picks.
    expect(
      finishRun.decisions.map((decision) => decision.action.type),
    ).toEqual(["BAN_HERO", "BAN_HERO", "CHOOSE_FACTION", "CHOOSE_FACTION"]);
    const lobby = finishRun.state.setupLobby!;
    expect(lobby.draft?.bannedHeroDefIds).toHaveLength(3);
    expect(
      lobby.seats
        .slice(1)
        .every(
          (seat) =>
            seat.heroDefId &&
            !lobby.draft!.bannedHeroDefIds.includes(seat.heroDefId),
        ),
    ).toBe(true);
    // Only the human's hero pick is outstanding; picking it readies the table.
    expect(lobby.seats[0].heroDefId).toBeNull();
    const ready = humanFirst(finishRun.state, "CHOOSE_FACTION");
    expect(
      ready.setupLobby!.seats.every(
        (seat) => seat.factionId && seat.heroDefId,
      ),
    ).toBe(true);
  });
});

describe("computer map turns", () => {
  it("plays the computer's whole map turn after the human ends theirs and hands control back", () => {
    let state = createAdventureGameState({
      seed: "runner-map-turn",
      scenarioId: "skirmish",
      playerCount: 2,
      sessionMode: "single-player",
    });
    const initialArmySize = state.players.p2.army.length;
    const initialBuildingCount = Object.values(state.towns).find(
      (town) => town.controllerId === "p2",
    )?.buildings.length ?? 0;
    const initialHeroSpace = Object.values(state.heroes).find(
      (hero) => hero.controllerId === "p2" && hero.kind === "main",
    )?.spaceId;
    const decisions: ComputerDecision[] = [];

    // Click through the human's required steps exactly like a player would,
    // letting the runner settle all computer work between each step, until the
    // human's round-2 turn is open.
    const humanPriority: GameAction["type"][] = [
      "SET_TILE_ROTATION",
      "CHOOSE_OPTION",
      "CHOOSE_ABILITY_TARGET",
      "CHOOSE_PENDING_ROLL",
      "RESOLVE_VISIT_STEP",
      "RESOLVE_DECK_SEARCH",
      "RESOLVE_COMBAT_DISCARD",
      "REFRESH_HAND",
      "END_TURN",
    ];
    let guard = 0;
    for (;;) {
      const run = driveComputerPlayers(state);
      expect(run.stalled, run.reason).toBe(false);
      decisions.push(...run.decisions);
      state = run.state;
      if (
        state.round === 2 &&
        state.activePlayerId === "p1" &&
        state.players.p1.canMulligan
      ) {
        break;
      }
      expect(guard++, "human/computer loop did not reach round 2").toBeLessThan(
        60,
      );
      const offers = getLegalActions(state, "p1");
      const pick = humanPriority
        .map((type) => offers.find((legal) => legal.action.type === type))
        .find(Boolean);
      expect(
        pick,
        `no human step among: ${offers.map((legal) => legal.action.type).join(", ")}`,
      ).toBeDefined();
      state = humanAct(state, pick!.action);
    }

    // The computer really played: it owned its start-of-turn draw and ended
    // its own turn through validated actions, and control is back with the
    // human with no computer work pending.
    const byComputer = decisions.filter(
      (decision) => decision.playerId === "p2",
    );
    expect(
      byComputer.some((decision) => decision.action.type === "REFRESH_HAND"),
    ).toBe(true);
    expect(
      byComputer.some((decision) => decision.action.type === "END_TURN"),
    ).toBe(true);
    const finalBuildingCount = Object.values(state.towns).find(
      (town) => town.controllerId === "p2",
    )?.buildings.length ?? 0;
    const finalHeroSpace = Object.values(state.heroes).find(
      (hero) => hero.controllerId === "p2" && hero.kind === "main",
    )?.spaceId;
    expect(
      state.players.p2.army.length > initialArmySize ||
        finalBuildingCount > initialBuildingCount ||
        byComputer.some(
          (decision) =>
            decision.action.type === "POPULATION_ACTION" ||
            decision.action.type === "BUILD_STRUCTURE",
        ),
      "computer should recruit/reinforce or build before ending its turn",
    ).toBe(true);
    expect(
      finalHeroSpace !== initialHeroSpace ||
        byComputer.some(
          (decision) =>
            decision.action.type === "DISCOVER_TILE" ||
            decision.action.type === "MOVE_HERO",
        ),
      "computer should move or discover a tile when a safe exploration action exists",
    ).toBe(true);
    expect(computerDecisionOwner(state)).toBeNull();
  });
});

describe("computer map fights", () => {
  it("marches into a neutral fight, wins it, and recovers the map turn (not stuck in the combat-end phase)", () => {
    // seed "runner-map-turn": the p2 (computer) hero has beatable difficulty-1
    // guards near its town. With objective-seeking movement it now walks in and
    // fights instead of shuffling in place — and the runner must drive the
    // end-of-combat acknowledgment even though a finished combat parks the game
    // in the "game-over" phase, or the whole game freezes after the AI's first
    // win (the bug this pins).
    let state = createAdventureGameState({
      seed: "runner-map-turn",
      scenarioId: "skirmish",
      playerCount: 2,
      sessionMode: "single-player",
    });
    const humanPriority: GameAction["type"][] = [
      "SET_TILE_ROTATION",
      "CHOOSE_OPTION",
      "CHOOSE_ABILITY_TARGET",
      "CHOOSE_PENDING_ROLL",
      "RESOLVE_VISIT_STEP",
      "RESOLVE_DECK_SEARCH",
      "RESOLVE_COMBAT_DISCARD",
      "REFRESH_HAND",
      "END_TURN",
    ];
    let guard = 0;
    for (;;) {
      const run = driveComputerPlayers(state);
      // The runner never stalls — including right after the AI wins its fight,
      // when the game sits in the "game-over" combat-end phase awaiting the ack.
      expect(run.stalled, run.reason).toBe(false);
      state = run.state;
      if (state.round >= 3 && state.activePlayerId === "p1" && state.players.p1.canMulligan) {
        break;
      }
      expect(guard++, "did not reach round 3 — the AI likely froze the game").toBeLessThan(80);
      const offers = getLegalActions(state, "p1");
      const pick = humanPriority
        .map((type) => offers.find((legal) => legal.action.type === type))
        .find(Boolean);
      // A frozen game leaves the human with no map step to take.
      expect(pick, `human has no map step; phase=${state.phase}`).toBeDefined();
      state = humanAct(state, pick!.action);
    }

    // The AI really fought a neutral battle to a win (not a bloodless Quick
    // Combat skip) and the game moved on: control is back with the human, the
    // phase recovered off "game-over", and nobody is stuck owing a decision.
    const wonAFight = state.eventLog.some(
      (event) => event.type === "COMBAT_ENDED" && event.winnerPlayerId === "p2",
    );
    expect(wonAFight, "expected the AI to win at least one real neutral combat").toBe(true);
    expect(state.phase).not.toBe("game-over");
    expect(computerDecisionOwner(state)).toBeNull();
    // The AI claimed ground by fighting — at least one field flags to it.
    expect(
      Object.values(state.adventure!.fields).some((field) => field.flagOwnerId === "p2"),
    ).toBe(true);
  });
});

describe("computer combat activation", () => {
  it("drives its active unit to remove the lethal target and hands control back", () => {
    const state = createInitialGameState("computer-combat-target");
    state.controllers = { p2: standardComputerController() };
    const combat = state.combat!;
    // Deterministic dice at the die's expected value (0), matching the policy's
    // damage model; empty hands/effects so no reaction window interrupts the
    // resolve and the attack (and removal) completes inside one applyAction.
    combat.dice.scriptedRolls = Array(60).fill(0);
    combat.dice.rollCount = 0;
    state.players.p1.hand = [];
    state.players.p2.hand = [];
    state.activeEffects = [];

    // Only the Dread Knights act this p2 round: the other two are done.
    combat.units.unit_p2_skeletons.activatedThisRound = true;
    combat.units.unit_p2_vampires.activatedThisRound = true;

    const attacker = combat.units.unit_p2_dread_knights;
    attacker.abilities = [];
    attacker.attack = 10;
    attacker.position = 9;
    attacker.activatedThisRound = false;

    // The UNIQUE lethal target: a fragile marksmen adjacent to the attacker.
    const lethal = combat.units.unit_p1_marksmen;
    lethal.abilities = [];
    lethal.variant = "few"; // no Pack->Few flip absorbs the blow
    lethal.defense = 0;
    lethal.maxHealth = 4;
    lethal.damage = 0;
    lethal.position = 8;

    // Every other enemy is durable (non-lethal), so the marksmen is the only
    // removal the policy can score as lethal.
    for (const id of ["unit_p1_griffins", "unit_p1_crusaders"] as const) {
      const durable = combat.units[id];
      durable.abilities = [];
      durable.defense = 2;
      durable.maxHealth = 40;
      durable.damage = 0;
    }
    combat.units.unit_p1_crusaders.position = 13; // also adjacent to the attacker
    combat.units.unit_p1_griffins.position = 12;

    state.activePlayerId = "p2";
    combat.activeUnitId = "unit_p2_dread_knights";

    const run = driveComputerPlayers(state);
    expect(run.stalled, run.reason).toBe(false);

    // The first attack the policy chose was the lethal removal, not a durable one.
    const firstAttack = run.decisions.find(
      (decision) =>
        decision.action.type === "ATTACK_UNIT" ||
        decision.action.type === "MOVE_AND_ATTACK_UNIT",
    );
    expect(firstAttack?.policy).toBe("combat.attack-target");
    expect((firstAttack?.action as { defenderId: string }).defenderId).toBe(
      "unit_p1_marksmen",
    );

    // Observable outcome: the marksmen is removed, the durable enemies survive,
    // and control returns to the human once no computer slot is owed.
    const after = run.state.combat!.units;
    expect(after.unit_p1_marksmen.damage).toBeGreaterThanOrEqual(
      after.unit_p1_marksmen.maxHealth,
    );
    expect(after.unit_p1_crusaders.damage).toBeLessThan(
      after.unit_p1_crusaders.maxHealth,
    );
    expect(
      run.state.eventLog.some(
        (event) =>
          event.type === "UNIT_REMOVED" &&
          event.unitId === "unit_p1_marksmen",
      ),
    ).toBe(true);
    expect(computerDecisionOwner(run.state)).toBeNull();
  });
});

describe("paced computer visible steps (live single-player)", () => {
  it("classifies map moves as paced and bulk stages as not", () => {
    expect(isPacedComputerAction({ type: "MOVE_HERO", playerId: "p2", heroId: "h", to: "h:0:0" })).toBe(true);
    expect(isPacedComputerAction({ type: "DISCOVER_TILE", playerId: "p2", heroId: "h", tileInstanceId: "t" })).toBe(true);
    expect(isPacedComputerAction({ type: "SET_TILE_ROTATION", playerId: "p2", tileInstanceId: "t", rotation: 0 })).toBe(true);
    expect(isPacedComputerAction({ type: "PLACE_COMBAT_UNIT", playerId: "p2", armyUnitId: "a", position: 0 })).toBe(false);
    expect(isPacedComputerAction({ type: "PASS_REACTION", playerId: "p2" })).toBe(false);
    expect(isPacedComputerAction({ type: "END_TURN", playerId: "p2" })).toBe(false);
  });

  it("one visible step stops after a paced action so the human can watch move→roll→move", () => {
    // Full settle would run the whole computer turn; a visible step must stop
    // at the first paced action (typically MOVE_HERO or SET_TILE_ROTATION).
    let state = createAdventureGameState({
      seed: "runner-map-turn",
      scenarioId: "skirmish",
      playerCount: 2,
      sessionMode: "single-player",
    });
    // Human rotates their start tile so the computer owns the next start rotation.
    const humanRot = getLegalActions(state, "p1").find(
      (legal) => legal.action.type === "SET_TILE_ROTATION",
    );
    if (humanRot) {
      state = humanAct(state, humanRot.action);
    }
    // Drive until a computer owns a decision (start-tile rotation or map turn).
    let guard = 0;
    while (!computerDecisionOwner(state) && guard++ < 40) {
      const offers = getLegalActions(state, "p1");
      const pick =
        offers.find((legal) => legal.action.type === "SET_TILE_ROTATION") ??
        offers.find((legal) => legal.action.type === "REFRESH_HAND") ??
        offers.find((legal) => legal.action.type === "END_TURN");
      if (!pick) break;
      state = humanAct(state, pick.action);
    }
    expect(computerDecisionOwner(state)).toBe("p2");

    const step = settleComputerVisibleStep(state);
    expect(step.stalled, step.reason).toBe(false);
    expect(step.decisions.length).toBeGreaterThan(0);
    // The last decision of a visible step is paced (or the computer finished).
    const last = step.decisions[step.decisions.length - 1];
    if (computerDecisionOwner(step.state)) {
      expect(isPacedComputerAction(last.action)).toBe(true);
    }
    // CONTROL: a full settle from the same start would take more steps.
    const full = settleComputerWork(state);
    // After one visible step the state is NOT fully settled if more work remains.
    if (computerDecisionOwner(step.state)) {
      expect(step.state.eventCounter ?? step.state.eventLog.length).toBeLessThan(
        full.eventCounter ?? full.eventLog.length,
      );
    }
  });
});

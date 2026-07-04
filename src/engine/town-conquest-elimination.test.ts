import { describe, expect, it } from "vitest";
import {
  applyAction,
  controlsTownOrSettlement,
  createAdventureGameState,
  eliminatePlayer,
  ELIMINATION_GRACE_TURNS,
  getLegalActions,
  hexNeighbors,
  hexSpaceId,
  parseHexSpaceId,
  refreshEliminationClock,
  RESOURCE_GAIN_LEVEL_AMOUNTS,
  type GameAction,
  type GameState
} from "./index";

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function expectRejected(state: GameState, action: GameAction): void {
  const result = applyAction(state, action);
  expect(result.errors.length).toBeGreaterThan(0);
}

/** Two-player adventure game with the Astrologers deck stacked inert so even
 *  rounds resolve without opening a choice. */
function makeGame(seed = "conquest-seed"): GameState {
  const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false, events: false });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
  for (let i = 0; i < 8; i += 1) {
    state.decks.astrologers.drawPile.push("astrologers.dead_silence");
  }
  return state;
}

function makeThreePlayerGame(seed = "conquest-3p"): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    players: [
      { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" },
      { id: "p3", name: "Alamar", factionId: "dungeon", heroDefId: "alamar" }
    ]
  });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
  for (let i = 0; i < 8; i += 1) {
    state.decks.astrologers.drawPile.push("astrologers.dead_silence");
  }
  return state;
}

/** A real hex neighbour of `townFieldId` that the engine treats as empty. */
function stagingNextTo(state: GameState, townFieldId: string): string {
  const coord = parseHexSpaceId(townFieldId)!;
  const stagingId = hexNeighbors(coord)
    .map((c) => hexSpaceId(c))
    .find((spaceId) => {
      const field = state.adventure!.fields[spaceId];
      return field && !field.difficulty && field.location !== "town";
    })!;
  const staging = state.adventure!.fields[stagingId];
  staging.location = "empty_field";
  staging.difficulty = undefined;
  staging.flagOwnerId = null;
  staging.blackCube = false;
  return stagingId;
}

/**
 * Marches p1's hero onto p2's town while p2's hero is away. p2 declines the
 * 8-gold garrison, so the town falls and p1 flags it — leaving p1's
 * resource-gain-level reward pending.
 */
function flagEnemyTown(state: GameState): GameState {
  const townField = state.towns.town_p2.fieldId ?? "";
  const stagingId = stagingNextTo(state, townField);
  state.heroes.hero_p1.spaceId = stagingId;
  state.heroes.hero_p2.spaceId = null;
  state.adventure!.lastVisitedField.hero_p1 = stagingId;

  state = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: townField });
  const choice = state.pendingChoice;
  if (choice?.type === "OPTION_CHOICE" && choice.context === "garrison") {
    state = apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p2",
      choiceId: choice.id,
      optionIndex: 1
    });
  }
  return state;
}

/** Reads the pendingChoice `context`, narrowing the discriminated union. */
function pendingContext(state: GameState): string | undefined {
  return state.pendingChoice?.type === "OPTION_CHOICE" ? state.pendingChoice.context : undefined;
}

describe("controlsTownOrSettlement", () => {
  it("counts an unflagged home town, drops it once an enemy flags it, and counts a held settlement", () => {
    const state = makeGame();
    const townField = state.towns.town_p2.fieldId ?? "";

    // Both players start in control of their home town.
    expect(controlsTownOrSettlement(state, "p2")).toBe(true);

    // An enemy flag on the town field removes map control (the Town Board and
    // its `controllerId` are untouched, rulebook p.76).
    state.adventure!.fields[townField].flagOwnerId = "p1";
    expect(state.towns.town_p2.controllerId).toBe("p2");
    expect(controlsTownOrSettlement(state, "p2")).toBe(false);

    // A settlement the player still holds keeps them in the game.
    const someField = Object.values(state.adventure!.fields).find(
      (field) => field.spaceId !== townField && field.location !== "town"
    )!;
    someField.location = "settlement";
    someField.flagOwnerId = "p2";
    someField.settlementResource = "gold";
    expect(controlsTownOrSettlement(state, "p2")).toBe(true);
  });
});

describe("refreshEliminationClock", () => {
  it("starts the clock when a player loses their last base and clears it when one returns", () => {
    const state = makeGame();
    const townField = state.towns.town_p2.fieldId ?? "";

    // Holding the home town: no clock.
    refreshEliminationClock(state, "p2");
    expect(state.players.p2.eliminationCountdown ?? null).toBeNull();

    // Lose the town field to an enemy: the grace clock starts.
    state.adventure!.fields[townField].flagOwnerId = "p1";
    refreshEliminationClock(state, "p2");
    expect(state.players.p2.eliminationCountdown).toBe(ELIMINATION_GRACE_TURNS);

    // Re-take the town field: the clock clears.
    state.adventure!.fields[townField].flagOwnerId = "p2";
    refreshEliminationClock(state, "p2");
    expect(state.players.p2.eliminationCountdown ?? null).toBeNull();
  });
});

describe("flagging an enemy town", () => {
  it("rewards a chosen resource-gain level instead of winning instantly", () => {
    let state = makeGame();
    const materialsBefore = state.players.p1.production.buildingMaterials;

    state = flagEnemyTown(state);

    expect(state.adventure?.winnerPlayerId).toBeNull();
    expect(state.phase).not.toBe("game-over");
    expect(state.adventure?.pendingVisit?.steps[0].type).toBe("RESOURCE_GAIN_LEVEL");

    // Option 1 is the building-materials level (+2).
    state = apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 1 });
    expect(state.players.p1.production.buildingMaterials).toBe(
      materialsBefore + RESOURCE_GAIN_LEVEL_AMOUNTS.buildingMaterials
    );
    // The former owner keeps their Town Board (controllerId unchanged).
    expect(state.towns.town_p2.controllerId).toBe("p2");
    expect(state.players.p2.eliminationCountdown).toBe(ELIMINATION_GRACE_TURNS);
  });

  it("eliminates the baseless former owner after the grace turns, winning the game for the last faction", () => {
    let state = flagEnemyTown(makeGame());
    state = apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });

    expect(state.players.p2.eliminationCountdown).toBe(2);

    // p1 ends; p2 plays its first grace turn (clock 2 -> 1).
    state = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(state.activePlayerId).toBe("p2");
    state = apply(state, { type: "END_TURN", playerId: "p2" });
    expect(state.players.p2.eliminationCountdown).toBe(1);
    expect(state.players.p2.eliminated).toBeFalsy();

    // p1 ends; p2 plays its second (last) grace turn (clock 1 -> 0 -> out).
    state = apply(state, { type: "END_TURN", playerId: "p1" });
    expect(state.activePlayerId).toBe("p2");
    state = apply(state, { type: "END_TURN", playerId: "p2" });

    expect(state.players.p2.eliminated).toBe(true);
    expect(state.turnOrder).not.toContain("p2");
    expect(state.adventure?.winnerPlayerId).toBe("p1");
    expect(state.phase).toBe("game-over");
    expect(state.eventLog.some((event) => event.type === "PLAYER_ELIMINATED")).toBe(true);
  });

  it("does not eliminate a former owner who still holds a Settlement (settlements prevent elimination)", () => {
    let state = makeGame();

    // Give p2 a settlement they control before their town is taken.
    const townField = state.towns.town_p2.fieldId ?? "";
    const settlementField = Object.values(state.adventure!.fields).find(
      (field) => field.spaceId !== townField && field.location !== "town" && !field.difficulty
    )!;
    settlementField.location = "settlement";
    settlementField.flagOwnerId = "p2";
    settlementField.settlementResource = "gold";

    state = flagEnemyTown(state);
    state = apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });

    // The settlement keeps the clock clear.
    expect(state.players.p2.eliminationCountdown ?? null).toBeNull();

    // Even after several of p2's turns, they are never eliminated.
    for (let i = 0; i < 3; i += 1) {
      state = apply(state, { type: "END_TURN", playerId: "p1" });
      state = apply(state, { type: "END_TURN", playerId: "p2" });
    }
    expect(state.players.p2.eliminated).toBeFalsy();
    expect(state.turnOrder).toContain("p2");
    expect(state.adventure?.winnerPlayerId).toBeNull();
  });
});

describe("giving up", () => {
  it("removes a player, turns them into an observer, and hands the win to the last faction (2 players)", () => {
    let state = makeGame();
    expect(state.activePlayerId).toBe("p1");

    state = apply(state, { type: "GIVE_UP", playerId: "p1" });

    expect(state.players.p1.eliminated).toBe(true);
    expect(state.turnOrder).toEqual(["p2"]);
    // The conceding player's hero leaves the map.
    expect(state.heroes.hero_p1.spaceId).toBeNull();
    expect(state.adventure?.winnerPlayerId).toBe("p2");
    expect(state.phase).toBe("game-over");
    expect(
      state.eventLog.some((event) => event.type === "PLAYER_ELIMINATED" && event.gaveUp === true)
    ).toBe(true);
  });

  it("keeps the game going with one fewer player when more than one faction remains (3 players)", () => {
    let state = makeThreePlayerGame();
    expect(state.turnOrder).toEqual(["p1", "p2", "p3"]);

    state = apply(state, { type: "GIVE_UP", playerId: "p1" });

    expect(state.players.p1.eliminated).toBe(true);
    expect(state.turnOrder).toEqual(["p2", "p3"]);
    expect(state.activePlayerId).toBe("p2");
    expect(state.adventure?.winnerPlayerId).toBeNull();
    expect(state.phase).not.toBe("game-over");

    // The eliminated seat can no longer act.
    expectRejected(state, { type: "GIVE_UP", playerId: "p1" });
    expectRejected(state, { type: "END_TURN", playerId: "p1" });
  });

  it("lets a player concede OFF-TURN on a quiet table without disturbing the active turn (3 players)", () => {
    let state = makeThreePlayerGame();
    expect(state.activePlayerId).toBe("p1");
    // p3 is not the active player, but the table is quiet — so p3 may still quit
    // instead of being trapped watching until their own turn comes around.
    expect(getLegalActions(state, "p3").some((legal) => legal.action.type === "GIVE_UP")).toBe(true);

    state = apply(state, { type: "GIVE_UP", playerId: "p3" });

    expect(state.players.p3.eliminated).toBe(true);
    expect(state.turnOrder).toEqual(["p1", "p2"]);
    // Crucially, the active player's turn is untouched — no advance past p1.
    expect(state.activePlayerId).toBe("p1");
    expect(state.adventure?.winnerPlayerId).toBeNull();
    expect(state.phase).not.toBe("game-over");
    expect(
      state.eventLog.some((event) => event.type === "PLAYER_ELIMINATED" && event.gaveUp === true)
    ).toBe(true);
  });

  it("an off-turn concede in a 2-player game hands the win to the remaining faction", () => {
    let state = makeGame();
    expect(state.activePlayerId).toBe("p1");
    // p2 quits during p1's turn: offered off-turn, and it ends the game.
    expect(getLegalActions(state, "p2").some((legal) => legal.action.type === "GIVE_UP")).toBe(true);

    state = apply(state, { type: "GIVE_UP", playerId: "p2" });

    expect(state.players.p2.eliminated).toBe(true);
    expect(state.adventure?.winnerPlayerId).toBe("p1");
    expect(state.phase).toBe("game-over");
  });

  it("is illegal for anyone while a choice is pending (even the active player)", () => {
    const opened = (() => {
      const state = makeGame();
      const townField = state.towns.town_p2.fieldId ?? "";
      const stagingId = stagingNextTo(state, townField);
      state.heroes.hero_p1.spaceId = stagingId;
      state.heroes.hero_p2.spaceId = null;
      state.players.p2.resources.gold = 10;
      state.adventure!.lastVisitedField.hero_p1 = stagingId;
      return apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: townField });
    })();

    // The garrison decision is open: the defender is not the active player, and
    // the active player cannot concede while a choice is pending.
    expect(pendingContext(opened)).toBe("garrison");
    expectRejected(opened, { type: "GIVE_UP", playerId: "p2" });
    expectRejected(opened, { type: "GIVE_UP", playerId: "p1" });
    // "Give up" is not even offered in the legal-action list right now.
    expect(getLegalActions(opened, "p1").some((legal) => legal.action.type === "GIVE_UP")).toBe(false);
  });

  it("offers Give up on a normal map turn", () => {
    const state = makeGame();
    expect(getLegalActions(state, "p1").some((legal) => legal.action.type === "GIVE_UP")).toBe(true);
  });
});

describe("eliminatePlayer", () => {
  it("removes the seat from the turn order and declares the last faction the winner", () => {
    const state = makeThreePlayerGame();

    eliminatePlayer(state, "p2", "test removal", false);
    expect(state.turnOrder).toEqual(["p1", "p3"]);
    expect(state.adventure?.winnerPlayerId).toBeNull();

    eliminatePlayer(state, "p3", "test removal", false);
    expect(state.turnOrder).toEqual(["p1"]);
    expect(state.adventure?.winnerPlayerId).toBe("p1");
  });
});

describe("siege fortifications when defending a conquered enemy town", () => {
  it("adds Walls/Gate/Tower when defending your OWN town with a Citadel but NOT a conquered enemy town with one", () => {
    // Three players so p3 can assault the town p1 has conquered from p2.
    let state = makeThreePlayerGame();
    const townField = state.towns.town_p2.fieldId ?? "";

    // p1 has already conquered p2's town, which carries a Citadel.
    state.towns.town_p2.buildings.push("necropolis.citadel");
    state.adventure!.fields[townField].flagOwnerId = "p1";
    state.adventure!.fields[townField].everFlagged = true;
    state.players.p1.resources.gold = 20;
    state.heroes.hero_p1.spaceId = null; // p1 defends via garrison (hero away)

    // It is p3's turn; stage them next to the conquered town and attack it.
    const stagingId = stagingNextTo(state, townField);
    state.heroes.hero_p3.spaceId = stagingId;
    state.heroes.hero_p2.spaceId = null;
    state.adventure!.lastVisitedField.hero_p3 = stagingId;
    state.activePlayerId = "p3";
    state.turn.observingPlayerId = "p3";

    state = apply(state, { type: "MOVE_HERO", playerId: "p3", heroId: "hero_p3", to: townField });

    // p1 (the conqueror) is asked to garrison the conquered town and pays.
    expect(pendingContext(state)).toBe("garrison");
    expect(state.pendingChoice?.playerId).toBe("p1");
    state = apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: 0
    });

    // Rulebook p.46: no Walls/Gate when defending an enemy town you conquered,
    // even with a Citadel — the conqueror is not the town's `controllerId`.
    expect(state.combat?.context.kind).toBe("player");
    const siegeFlag = state.combat?.context.kind === "player" ? state.combat.context.siege : undefined;
    expect(siegeFlag).toBeFalsy();
    expect(state.combat?.siege ?? null).toBeNull();
  });
});

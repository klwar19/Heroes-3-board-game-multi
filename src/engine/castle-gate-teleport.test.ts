import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  hexNeighbors,
  hexSpaceId,
  parseHexSpaceId,
  type GameAction,
  type GameState
} from "./index";

/**
 * Inferno's Castle Gate — option 2: "If your Hero is in a Town or Settlement,
 * move them to another Town or Settlement under your control."
 *
 * REPORTED BUG: standing in a Town captured from an opponent, the teleport was
 * neither offered nor accepted. Root cause: both halves read a Town's ownership
 * off `TownState.controllerId`, which the engine DELIBERATELY never flips on
 * capture (control lives on `field.flagOwnerId`) — so a captured Town read as
 * still the LOSER's, in both directions.
 */

const CASTLE_GATE = "inferno.castle_gate";

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function expectRejected(state: GameState, action: GameAction): string {
  const result = applyAction(state, action);
  expect(result.errors.length).toBeGreaterThan(0);
  return result.errors.map((error) => error.message).join("; ");
}

/** Two-player game: p1 is Inferno with the Castle Gate already standing. */
function makeGame(seed = "castle-gate"): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    players: [
      { id: "p1", name: "Xyron", factionId: "inferno", heroDefId: "xyron" },
      { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
    ]
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  for (let i = 0; i < 8; i += 1) {
    state.decks.astrologers.drawPile.push("astrologers.dead_silence");
  }
  state.towns.town_p1.buildings.push(CASTLE_GATE);
  return state;
}

/** A real hex neighbour of `townFieldId` the engine treats as an empty field. */
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
 * Marches p1's hero onto p2's Town while p2's hero is away; p2 declines the
 * garrison so the Town falls and p1 flags it. The REAL capture path, so the
 * state shape under test is the one a live game produces.
 */
function captureEnemyTown(state: GameState): GameState {
  const townField = state.towns.town_p2.fieldId ?? "";
  const stagingId = stagingNextTo(state, townField);
  state.heroes.hero_p1.spaceId = stagingId;
  state.heroes.hero_p2.spaceId = null;
  state.adventure!.lastVisitedField.hero_p1 = stagingId;

  let next = apply(state, { type: "MOVE_HERO", playerId: "p1", heroId: "hero_p1", to: townField });
  const choice = next.pendingChoice;
  if (choice?.type === "OPTION_CHOICE" && choice.context === "garrison") {
    next = apply(next, { type: "CHOOSE_OPTION", playerId: "p2", choiceId: choice.id, optionIndex: 1 });
  }
  // The capture pays a resource-gain level; take the first arm so the map turn
  // is free of pending input again.
  if (next.adventure?.pendingVisit) {
    next = apply(next, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
  }
  return next;
}

/** Gives `playerId` a flagged Settlement on some ordinary field, and returns it. */
function seedSettlement(state: GameState, playerId: string, avoid: string[]): string {
  const field = Object.values(state.adventure!.fields).find(
    (candidate) =>
      !avoid.includes(candidate.spaceId) &&
      candidate.location !== "town" &&
      candidate.location !== "settlement" &&
      !candidate.difficulty
  )!;
  field.location = "settlement";
  field.flagOwnerId = playerId;
  field.settlementResource = "gold";
  field.blackCube = false;
  return field.spaceId;
}

/** The destination space ids the Castle Gate teleport is OFFERED for. */
function teleportTargets(state: GameState, playerId: string): string[] {
  return getLegalActions(state, playerId)
    .filter(
      (legal) =>
        legal.action.type === "USE_TOWN_BUILDING" &&
        legal.action.buildingId === CASTLE_GATE &&
        legal.action.optionIndex === 1
    )
    .map((legal) => (legal.action as Extract<GameAction, { type: "USE_TOWN_BUILDING" }>).spaceId ?? "")
    .sort();
}

function teleport(state: GameState, playerId: string, spaceId: string): GameAction {
  return { type: "USE_TOWN_BUILDING", playerId, buildingId: CASTLE_GATE, optionIndex: 1, spaceId };
}

describe("Inferno Castle Gate — teleport out of a CAPTURED Town", () => {
  it("offers and performs the teleport from a captured enemy Town to an own Settlement", () => {
    let state = captureEnemyTown(makeGame());
    const capturedTown = state.towns.town_p2.fieldId ?? "";
    const homeTown = state.towns.town_p1.fieldId ?? "";
    const settlement = seedSettlement(state, "p1", [capturedTown, homeTown]);

    // The state shape the bug lived in: p1 holds the flag, the Town Board's
    // controllerId is still p2's. If this ever stops being true the test below
    // no longer discriminates the fix.
    expect(state.adventure!.fields[capturedTown].flagOwnerId).toBe("p1");
    expect(state.towns.town_p2.controllerId).toBe("p2");
    expect(state.heroes.hero_p1.spaceId).toBe(capturedTown);

    // REPRO: standing in the captured Town, the settlement is a legal target.
    expect(teleportTargets(state, "p1")).toContain(settlement);

    state = apply(state, teleport(state, "p1", settlement));
    expect(state.heroes.hero_p1.spaceId).toBe(settlement);
    expect(state.adventure!.lastVisitedField.hero_p1).toBe(settlement);
  });

  it("also reaches the player's own home Town from the captured Town", () => {
    let state = captureEnemyTown(makeGame());
    const capturedTown = state.towns.town_p2.fieldId ?? "";
    const homeTown = state.towns.town_p1.fieldId ?? "";

    expect(teleportTargets(state, "p1")).toContain(homeTown);

    state = apply(state, teleport(state, "p1", homeTown));
    expect(state.heroes.hero_p1.spaceId).toBe(homeTown);
  });

  it("teleports the other way too — own home Town back to the captured Town", () => {
    let state = captureEnemyTown(makeGame());
    const capturedTown = state.towns.town_p2.fieldId ?? "";
    const homeTown = state.towns.town_p1.fieldId ?? "";

    // Walk the hero home the cheap way (the Gate is once per round).
    state.heroes.hero_p1.spaceId = homeTown;
    state.adventure!.lastVisitedField.hero_p1 = homeTown;

    expect(teleportTargets(state, "p1")).toContain(capturedTown);
    state = apply(state, teleport(state, "p1", capturedTown));
    expect(state.heroes.hero_p1.spaceId).toBe(capturedTown);
  });

  it("CONTROL: a Town the opponent still holds is neither origin nor destination", () => {
    const state = makeGame();
    const enemyTown = state.towns.town_p2.fieldId ?? "";
    const homeTown = state.towns.town_p1.fieldId ?? "";
    state.heroes.hero_p1.spaceId = homeTown;
    state.adventure!.lastVisitedField.hero_p1 = homeTown;
    seedSettlement(state, "p1", [enemyTown, homeTown]);

    // Nothing has been captured: p2's Town is not on p1's list…
    expect(teleportTargets(state, "p1")).not.toContain(enemyTown);
    expect(expectRejected(state, teleport(state, "p1", enemyTown))).toMatch(/towns\/settlements you control/i);

    // …and it is not a legal ORIGIN either: parked there without a flag, p1 is
    // offered no teleport at all.
    const parked = { ...state, heroes: { ...state.heroes } } as GameState;
    parked.heroes.hero_p1 = { ...state.heroes.hero_p1, spaceId: enemyTown };
    expect(teleportTargets(parked, "p1")).toEqual([]);
  });

  it("CONTROL: a Town captured FROM you stops being yours", () => {
    const state = makeGame();
    const homeTown = state.towns.town_p1.fieldId ?? "";
    const settlement = seedSettlement(state, "p1", [homeTown, state.towns.town_p2.fieldId ?? ""]);
    state.heroes.hero_p1.spaceId = settlement;
    state.adventure!.lastVisitedField.hero_p1 = settlement;

    // Before the loss the home Town is on p1's list (the un-mutated reading).
    expect(teleportTargets(state, "p1")).toContain(homeTown);

    // p2 flags it. The Town Board still says controllerId p1 — the read that
    // used to keep handing p1 a teleport into enemy hands.
    state.adventure!.fields[homeTown].flagOwnerId = "p2";
    expect(state.towns.town_p1.controllerId).toBe("p1");

    expect(teleportTargets(state, "p1")).not.toContain(homeTown);
    expect(expectRejected(state, teleport(state, "p1", homeTown))).toMatch(/towns\/settlements you control/i);
  });

  it("CONTROL: the classic own-Town → own-Settlement teleport is unchanged", () => {
    let state = makeGame();
    const homeTown = state.towns.town_p1.fieldId ?? "";
    const settlement = seedSettlement(state, "p1", [homeTown, state.towns.town_p2.fieldId ?? ""]);
    state.heroes.hero_p1.spaceId = homeTown;
    state.adventure!.lastVisitedField.hero_p1 = homeTown;

    expect(teleportTargets(state, "p1")).toEqual([settlement]);
    state = apply(state, teleport(state, "p1", settlement));
    expect(state.heroes.hero_p1.spaceId).toBe(settlement);
  });
});

/**
 * WHICH SEAT SITS AT WHICH STARTING TILE
 * (`GameSetupOptions.startingTileAssignments`).
 *
 * A COMPLETE record over the live seats mapping each seat to a 0-based
 * starting-position index (into the designed map's starting plans, else the
 * scenario sheet's `layout.starts`). Honoured in EVERY session mode, computer
 * seats included. Positions no seat takes are EMPTY — never instantiated.
 * Precedence: the explicit `singlePlayer` solo block > this record > the map's
 * own starting-tile seat roles.
 *
 * Every case asserts the OBSERVABLE outcome — each seat's main-hero map
 * position (its home Town sits on the same centre), or the absence of a tile /
 * Town at an unassigned position — with an absent-record CONTROL on the same
 * fixture.
 *
 * Mutation-checked:
 *  - dropping `explicitIndex` from the placement loop's `index` fails every
 *    seating case;
 *  - dropping the `authoredStart` branch fails the seat-roles precedence case;
 *  - reverting the `setGameOptions` branch fails the lobby refusal cases;
 *  - dropping the resize clear fails the resize case.
 */
import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createAdventureLobbyState,
  hexSpaceId,
  sanitizeStartingTileAssignments,
  startingTileCount,
  startingTileSeatRole,
  type CustomMapTilePlan,
  type GameAction,
  type GameState,
  type PlayerController,
  type PlayerId
} from "./index";
import { scenarioDefinitions } from "@/data/map/scenarios";

const starts = scenarioDefinitions.skirmish.layout.starts;
const COMPUTER: PlayerController = { kind: "computer", difficulty: "standard", policyVersion: 1 };

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function reject(state: GameState, action: GameAction): string {
  const result = applyAction(state, action);
  expect(result.errors.length, "expected the action to be refused").toBeGreaterThan(0);
  return result.errors[0]?.message ?? "";
}

type Role = "human" | "computer" | undefined;

/** Designer Towns on the scenario's own seat centres, with optional roles. */
function towns(roles: readonly Role[]): CustomMapTilePlan[] {
  return roles.map((role, index) => ({
    ...starts[index],
    group: "starting" as const,
    faceDown: false,
    ...(role ? { coopSeat: { role } } : {})
  }));
}

const SEAT_FACTIONS = [
  { factionId: "castle", heroDefId: "catherine" },
  { factionId: "rampart", heroDefId: "gelu" },
  { factionId: "dungeon", heroDefId: "alamar" },
  { factionId: "tower", heroDefId: "solmyr" }
] as const;

function playersFor(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `S${index + 1}`,
    factionId: SEAT_FACTIONS[index].factionId as never,
    heroDefId: SEAT_FACTIONS[index].heroDefId
  }));
}

function build(opts: {
  tiles?: CustomMapTilePlan[];
  seats: number;
  computers?: number;
  sessionMode?: "multiplayer" | "single-player";
  assignments?: Record<PlayerId, number>;
  seed?: string;
}): GameState {
  const computers = opts.computers ?? 0;
  const controllers = Object.fromEntries(
    Array.from({ length: computers }, (_, index) => [
      `p${opts.seats - computers + index + 1}`,
      COMPUTER
    ])
  );
  return createAdventureGameState({
    seed: opts.seed ?? "starting-tile-assignments",
    scenarioId: "skirmish",
    sessionMode: opts.sessionMode ?? "multiplayer",
    rollFirstPlayer: false,
    startingBonus: false,
    ...(opts.tiles ? { customMap: opts.tiles } : {}),
    ...(opts.assignments ? { startingTileAssignments: opts.assignments } : {}),
    controllers,
    players: playersFor(opts.seats)
  });
}

/** Where each seat's main hero ended up, as a `p1 -> start index` record. */
function homes(state: GameState, seats: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (let index = 0; index < seats; index += 1) {
    const id = `p${index + 1}`;
    const spaceId = state.heroes[`hero_${id}`]?.spaceId;
    out[id] = starts.findIndex((start) => hexSpaceId(start) === spaceId);
  }
  return out;
}

describe("startingTileCount / startingTileSeatRole", () => {
  it("counts the designer's Towns when it drew any, else the scenario's seats", () => {
    expect(startingTileCount(null, scenarioDefinitions.skirmish)).toBe(starts.length);
    expect(startingTileCount(towns([undefined, undefined]), scenarioDefinitions.skirmish)).toBe(2);
    // Supply slots never count as starting positions.
    expect(
      startingTileCount(
        [...towns([undefined]), { row: 5, col: 1, group: "far", faceDown: true }],
        scenarioDefinitions.skirmish
      )
    ).toBe(1);
  });

  it("reads a position's authored role, with Free for absent / out of range", () => {
    const plans = towns(["computer", undefined, "human"]);
    expect(startingTileSeatRole(plans, 0)).toBe("computer");
    expect(startingTileSeatRole(plans, 1), "absent = Free").toBeUndefined();
    expect(startingTileSeatRole(plans, 2)).toBe("human");
    expect(startingTileSeatRole(plans, 9), "out of range = Free").toBeUndefined();
    expect(startingTileSeatRole(null, 0), "a scenario map authors nothing").toBeUndefined();
  });
});

describe("sanitizeStartingTileAssignments", () => {
  const seats = [
    { playerId: "p1", kind: "human" as const },
    { playerId: "p2", kind: "computer" as const }
  ];

  it("accepts a complete distinct in-range record and refuses everything else", () => {
    expect(sanitizeStartingTileAssignments(undefined, seats, null, 3), "absent = Default").toBeNull();
    expect(sanitizeStartingTileAssignments({}, seats, null, 3), "empty = Default").toBeNull();
    expect(sanitizeStartingTileAssignments({ p1: 2, p2: 0 }, seats, null, 3)).toEqual({
      ok: true,
      value: { p1: 2, p2: 0 }
    });
    expect(sanitizeStartingTileAssignments({ p1: 0 }, seats, null, 3), "partial").toMatchObject({
      ok: false
    });
    expect(
      sanitizeStartingTileAssignments({ p1: 0, p2: 0 }, seats, null, 3),
      "duplicate"
    ).toMatchObject({ ok: false, reason: expect.stringContaining("S1") });
    expect(
      sanitizeStartingTileAssignments({ p1: 0, p2: 3 }, seats, null, 3),
      "out of range"
    ).toMatchObject({ ok: false });
    expect(
      sanitizeStartingTileAssignments({ p1: 0, p2: 1.5 } as never, seats, null, 3),
      "not a whole index"
    ).toMatchObject({ ok: false });
  });

  it("refuses an assignment the map's own role forbids, naming the position", () => {
    // S1 is player-only, S2 free: the COMPUTER seat p2 may not take S1.
    const humanOnly = towns(["human", undefined]);
    expect(sanitizeStartingTileAssignments({ p1: 1, p2: 0 }, seats, humanOnly, 2)).toMatchObject({
      ok: false,
      reason: "Starting position S1 is reserved for a player, not the computer."
    });
    // S2 is AI-only: the HUMAN seat p1 may not take it.
    const aiOnly = towns([undefined, "computer"]);
    expect(sanitizeStartingTileAssignments({ p1: 1, p2: 0 }, seats, aiOnly, 2)).toMatchObject({
      ok: false,
      reason: "Starting position S2 is reserved for the computer, not a player."
    });
    // The role-respecting records are fine on both maps.
    expect(sanitizeStartingTileAssignments({ p1: 0, p2: 1 }, seats, humanOnly, 2)).toEqual({
      ok: true,
      value: { p1: 0, p2: 1 }
    });
    expect(sanitizeStartingTileAssignments({ p1: 0, p2: 1 }, seats, aiOnly, 2)).toEqual({
      ok: true,
      value: { p1: 0, p2: 1 }
    });
  });
});

describe("the record decides the seating at build", () => {
  it("puts each seat on its chosen designer Town", () => {
    const tiles = towns([undefined, undefined, undefined]);
    const state = build({ tiles, seats: 2, assignments: { p1: 2, p2: 0 } });
    expect(homes(state, 2)).toEqual({ p1: 2, p2: 0 });
    expect(state.adventure!.startingTileSeats).toEqual(["p2", null, "p1"]);

    // CONTROL — the same fixture with no record keeps game-order seating.
    const control = build({ tiles, seats: 2 });
    expect(homes(control, 2), "CONTROL: default order").toEqual({ p1: 0, p2: 1 });
  });

  it("works on a SCENARIO map with no designed Towns at all", () => {
    const state = build({ seats: 2, assignments: { p1: 3, p2: 1 } });
    expect(homes(state, 2)).toEqual({ p1: 3, p2: 1 });

    const control = build({ seats: 2 });
    expect(homes(control, 2), "CONTROL: the sheet's seat order").toEqual({ p1: 0, p2: 1 });
  });

  it("seats a COMPUTER seat at its chosen Town in single player", () => {
    const tiles = towns([undefined, undefined, undefined]);
    const state = build({
      tiles,
      seats: 2,
      computers: 1,
      sessionMode: "single-player",
      assignments: { p1: 1, p2: 2 }
    });
    expect(homes(state, 2)).toEqual({ p1: 1, p2: 2 });
  });

  it("OVERRIDES the map's own seat roles (the record wins)", () => {
    // S1 is AI-only, S2 player-only: the roles alone would seat p1 (human) on
    // S2 and p2 (computer) on S1. The record says the opposite way round.
    const tiles = towns(["computer", "human", undefined]);
    const roleOnly = build({ tiles, seats: 2, computers: 1, sessionMode: "single-player" });
    expect(homes(roleOnly, 2), "roles alone").toEqual({ p1: 1, p2: 0 });

    const state = build({
      tiles,
      seats: 2,
      computers: 1,
      sessionMode: "single-player",
      assignments: { p1: 2, p2: 0 }
    });
    expect(homes(state, 2), "the record decides").toEqual({ p1: 2, p2: 0 });
  });

  it("an UNASSIGNED starting position is never instantiated", () => {
    const tiles = towns([undefined, undefined, undefined]);
    const state = build({ tiles, seats: 2, assignments: { p1: 0, p2: 1 } });
    const emptyCentre = hexSpaceId(starts[2]);
    expect(
      Object.values(state.adventure!.tiles).some(
        (tile) => hexSpaceId({ row: tile.centerRow, col: tile.centerCol }) === emptyCentre
      ),
      "no tile at S3"
    ).toBe(false);
    expect(state.adventure!.fields[emptyCentre], "and no field").toBeUndefined();
    expect(Object.keys(state.towns), "exactly the two seated Towns").toEqual([
      "town_p1",
      "town_p2"
    ]);
    expect(state.adventure!.startingTileSeats).toEqual(["p1", "p2", null]);
  });

  it("a MALFORMED record falls back to the map's own seating with a public note", () => {
    const tiles = towns([undefined, undefined, undefined]);
    const state = build({ tiles, seats: 2, assignments: { p1: 2 } });
    expect(homes(state, 2), "never a partial seating").toEqual({ p1: 0, p2: 1 });
    expect(
      state.eventLog.some(
        (event) =>
          event.type === "EVENT_NOTE" && String(event.message).includes("Starting positions:")
      ),
      "the fallback is announced"
    ).toBe(true);
  });
});

describe("the lobby seam", () => {
  function lobby(seed = "start-tile-lobby"): GameState {
    return createAdventureLobbyState({ seed, scenarioId: "skirmish" });
  }

  it("stores a complete record, resets to Default on an empty one, refuses a partial one", () => {
    let state = lobby();
    state = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { startingTileAssignments: { p1: 3, p2: 1 } }
    });
    expect(state.setupLobby!.options.startingTileAssignments).toEqual({ p1: 3, p2: 1 });

    state = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { startingTileAssignments: {} }
    });
    expect(state.setupLobby!.options.startingTileAssignments).toBeUndefined();

    expect(
      reject(state, {
        type: "SET_GAME_OPTIONS",
        playerId: "p1",
        options: { startingTileAssignments: { p1: 0 } }
      })
    ).toMatch(/Every seat needs a starting position/);
    expect(
      reject(state, {
        type: "SET_GAME_OPTIONS",
        playerId: "p1",
        options: { startingTileAssignments: { p1: 0, p2: 0 } }
      })
    ).toMatch(/cannot share starting position S1/);
  });

  it("refuses a record that violates a designed role, with the reason", () => {
    let state = lobby("start-tile-role-refusal");
    state = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { customMap: towns(["computer", undefined, undefined]) }
    });
    // Both lobby seats are human, so nobody may take the AI-only S1.
    expect(
      reject(state, {
        type: "SET_GAME_OPTIONS",
        playerId: "p1",
        options: { startingTileAssignments: { p1: 0, p2: 1 } }
      })
    ).toBe("Starting position S1 is reserved for the computer, not a player.");
    expect(state.setupLobby!.options.startingTileAssignments, "nothing was stored").toBeUndefined();

    // CONTROL — a record that leaves the AI-only S1 empty IS accepted.
    const ok = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { startingTileAssignments: { p1: 1, p2: 2 } }
    });
    expect(ok.setupLobby!.options.startingTileAssignments, "CONTROL accepted").toEqual({
      p1: 1,
      p2: 2
    });
  });

  it("a seat-count change and a map change both clear the record", () => {
    let state = lobby("start-tile-clear");
    state = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { startingTileAssignments: { p1: 0, p2: 1 } }
    });
    const resized = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { playerCount: 3 }
    });
    expect(
      resized.setupLobby!.options.startingTileAssignments,
      "a resize invalidates the whole record"
    ).toBeUndefined();

    const remapped = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { customMap: towns([undefined, undefined]) }
    });
    expect(
      remapped.setupLobby!.options.startingTileAssignments,
      "a new map may have a different number of positions"
    ).toBeUndefined();
  });
});

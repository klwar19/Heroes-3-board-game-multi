/**
 * CO-OP MODE — step 5: MAP SUPPORT.
 *
 * What this file pins (step 6 owns every lobby/table UI surface — none of that
 * is here):
 *
 *  1. `CustomMapPreset.supportedModes` — which table modes a map declares.
 *     ABSENT (every legacy map, every built-in scenario) = BOTH; both-false is
 *     invalid and sanitises back to absent.
 *  2. `CustomMapTilePlan.coopSeat` — a per-STARTING-position co-op role
 *     ("human" / "computer"; absent = either). Start-tile-only, stripped
 *     elsewhere, and deliberately INDEPENDENT of the solo `singlePlayer` block.
 *  3. `coopMapDeployment` — the pure seating: fit, deterministic assignment,
 *     the three structured no-fit reasons, and `null` when nothing is authored.
 *  4. The START-CHECK refusals (mode unsupported, roles cannot seat this table)
 *     and the REAL co-op build landing every seat on its authored tile — the
 *     hero's map position, not the helper's return value.
 *  5. The co-op-only map's SOFT SEED of `gameMode: "coop"` at pick, the host's
 *     override winning over it, and the start check still hard-refusing the
 *     unsupported combination.
 *
 * Every co-op claim carries a CONTROL on the SAME fixture with the mode off
 * (clash) or the field absent, so each test fails if the wiring is removed.
 */
import { describe, expect, it } from "vitest";
import {
  applyAction,
  coopMapDeployment,
  coopMapDesignProblems,
  coopMapSeatCapacity,
  createAdventureGameState,
  createAdventureLobbyState,
  describeMapSupportedModes,
  hexSpaceId,
  mapSupportedModes,
  mapSupportsGameMode,
  presetForcedOptionKeys,
  sanitizeCoopMapSeat,
  sanitizeCustomMapPreset,
  scenarioDefinitions,
  singlePlayerMapDeployment,
  validateCustomMapPlan,
  type CustomMapTilePlan,
  type GameAction,
  type GameState
} from "./index";

const starts = scenarioDefinitions.skirmish.layout.starts;

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

/**
 * Roles are deliberately NOT in seat order, so an assignment that merely kept
 * the plan order would fail every position assertion below.
 * Capacity: 1 human-only (starts[1]), 2 computer-only (starts[0], starts[3]),
 * 1 flexible (starts[2]).
 */
const COOP_TOWNS: CustomMapTilePlan[] = [
  { ...starts[0], group: "starting", faceDown: false, coopSeat: { role: "computer" } },
  { ...starts[1], group: "starting", faceDown: false, coopSeat: { role: "human" } },
  { ...starts[2], group: "starting", faceDown: false },
  { ...starts[3], group: "starting", faceDown: false, coopSeat: { role: "computer" } }
];

/** The same tiles with no co-op authoring at all — the legacy-map CONTROL. */
const PLAIN_TOWNS: CustomMapTilePlan[] = COOP_TOWNS.map((plan) => {
  const next = { ...plan };
  delete next.coopSeat;
  return next;
});

const PLAYERS = [
  { id: "p1", name: "A", factionId: "castle" as const, heroDefId: "catherine" },
  { id: "p2", name: "B", factionId: "rampart" as const, heroDefId: "gelu" },
  { id: "p3", name: "Computer 1", factionId: "dungeon" as const, heroDefId: "alamar" }
];

const COMPUTER = { kind: "computer", difficulty: "standard", policyVersion: 1 } as const;

/** A 2-human + 1-computer build on `tiles`. `coop: false` is the clash CONTROL. */
function build(opts: {
  coop: boolean;
  tiles: CustomMapTilePlan[];
  seed?: string;
  preset?: Record<string, unknown>;
}): GameState {
  return createAdventureGameState({
    seed: opts.seed ?? `coop-map-${opts.coop}`,
    scenarioId: "skirmish",
    sessionMode: "multiplayer",
    rollFirstPlayer: false,
    startingBonus: false,
    customMap: opts.tiles,
    ...(opts.preset ? { customMapPreset: opts.preset as never } : {}),
    ...(opts.coop ? { gameMode: "coop" as const } : {}),
    controllers: { p3: COMPUTER },
    players: PLAYERS
  });
}

/** A multiplayer lobby with two human seats (p1/p2) — no room record. */
function lobby(seed: string): GameState {
  return createAdventureLobbyState({ seed, scenarioId: "skirmish" });
}

/** p1 + p2 human, p3 computer, factions chosen — ready for START_ADVENTURE. */
function seatedLobby(seed: string, options: Record<string, unknown>): GameState {
  let state = lobby(seed);
  state = apply(state, {
    type: "SET_GAME_OPTIONS",
    playerId: "p1",
    options: options as never
  });
  state = apply(state, { type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 1 });
  state = apply(state, {
    type: "CHOOSE_FACTION",
    playerId: "p1",
    factionId: "castle",
    heroDefId: "catherine"
  });
  state = apply(state, {
    type: "CHOOSE_FACTION",
    playerId: "p2",
    factionId: "rampart",
    heroDefId: "gelu"
  });
  state = apply(state, {
    type: "SET_COMPUTER_SEAT_FACTION",
    playerId: "p1",
    seatPlayerId: "p3",
    choice: { factionId: "dungeon", heroDefId: "alamar" }
  });
  return state;
}

// ===========================================================================
// 1. Persistence: supportedModes + coopSeat
// ===========================================================================

describe("co-op step 5 — the preset's supported table modes", () => {
  it("ABSENT means BOTH, and both-false is sanitised back to absent", () => {
    expect(mapSupportedModes(undefined)).toEqual({ clash: true, coop: true });
    expect(mapSupportedModes({})).toEqual({ clash: true, coop: true });
    expect(describeMapSupportedModes(null)).toBe("Clash + Co-op");

    // Only a literal `false` narrows the map; a truthy / garbage value is
    // dropped so "absent = both" can never be lost by a hand-edited record.
    expect(sanitizeCustomMapPreset({ supportedModes: {} })?.supportedModes).toBeUndefined();
    expect(
      sanitizeCustomMapPreset({ supportedModes: { clash: true, coop: true } })?.supportedModes
    ).toBeUndefined();
    expect(
      sanitizeCustomMapPreset({ supportedModes: { clash: false, coop: false } })?.supportedModes,
      "a map supporting NOTHING would be unplayable"
    ).toBeUndefined();
    expect(
      sanitizeCustomMapPreset({ supportedModes: "coop" as never })?.supportedModes
    ).toBeUndefined();
  });

  it("round-trips a clash-only and a co-op-only declaration", () => {
    const clashOnly = sanitizeCustomMapPreset({ supportedModes: { coop: false } });
    expect(clashOnly?.supportedModes).toEqual({ coop: false });
    expect(mapSupportedModes(clashOnly)).toEqual({ clash: true, coop: false });
    expect(describeMapSupportedModes(clashOnly)).toBe("Clash only");
    expect(mapSupportsGameMode(clashOnly, "clash")).toBe(true);
    expect(mapSupportsGameMode(clashOnly, "coop")).toBe(false);

    const coopOnly = sanitizeCustomMapPreset({ supportedModes: { clash: false } });
    expect(coopOnly?.supportedModes).toEqual({ clash: false });
    expect(describeMapSupportedModes(coopOnly)).toBe("Co-op only");
    expect(mapSupportsGameMode(coopOnly, "coop")).toBe(true);
    expect(mapSupportsGameMode(coopOnly, "clash")).toBe(false);
    // ABSENT gameMode IS clash — the contract every other co-op read uses.
    expect(mapSupportsGameMode(coopOnly, undefined)).toBe(false);
    expect(mapSupportsGameMode(clashOnly, undefined)).toBe(true);
  });

  it("CONTROL — a legacy preset with no supportedModes supports every mode", () => {
    const legacy = sanitizeCustomMapPreset({ difficulty: "hard" });
    expect(legacy?.supportedModes).toBeUndefined();
    expect(mapSupportsGameMode(legacy, "coop")).toBe(true);
    expect(mapSupportsGameMode(legacy, "clash")).toBe(true);
    // A built-in scenario sheet has no preset at all.
    expect(mapSupportsGameMode(null, "coop")).toBe(true);
  });
});

describe("co-op step 5 — the per-position coopSeat role", () => {
  it("accepts the two literals and drops everything else", () => {
    expect(sanitizeCoopMapSeat({ role: "human" })).toEqual({ role: "human" });
    expect(sanitizeCoopMapSeat({ role: "computer" })).toEqual({ role: "computer" });
    expect(sanitizeCoopMapSeat({ role: "ai" })).toBeUndefined();
    expect(sanitizeCoopMapSeat({})).toBeUndefined();
    expect(sanitizeCoopMapSeat("human")).toBeUndefined();
    expect(sanitizeCoopMapSeat(undefined)).toBeUndefined();
  });

  it("survives validateCustomMapPlan on a starting tile and is STRIPPED anywhere else", () => {
    const { accepted } = validateCustomMapPlan(
      [
        ...COOP_TOWNS,
        // A role on a non-starting slot is meaningless — it must not persist.
        {
          row: 9,
          col: 4,
          group: "center",
          faceDown: true,
          coopSeat: { role: "human" }
        } as CustomMapTilePlan,
        // Garbage on a real starting slot is dropped, not coerced.
        {
          ...starts[4],
          group: "starting",
          faceDown: false,
          coopSeat: { role: "nobody" } as never
        } as CustomMapTilePlan
      ],
      scenarioDefinitions.skirmish,
      3
    );
    expect(accepted[0].coopSeat).toEqual({ role: "computer" });
    expect(accepted[1].coopSeat).toEqual({ role: "human" });
    expect(accepted[2].coopSeat, "unmarked stays unmarked").toBeUndefined();
    expect(accepted[4].coopSeat, "a center slot may not carry a co-op role").toBeUndefined();
    expect(accepted[5].coopSeat, "garbage is dropped").toBeUndefined();
  });

  it("counts capacity for the shared badge/alert derivation", () => {
    expect(coopMapSeatCapacity(COOP_TOWNS)).toEqual({
      human: 1,
      computer: 2,
      flexible: 1,
      authored: true
    });
    expect(coopMapSeatCapacity(PLAIN_TOWNS)).toEqual({
      human: 0,
      computer: 0,
      flexible: 4,
      authored: false
    });
    expect(coopMapSeatCapacity(null)).toEqual({
      human: 0,
      computer: 0,
      flexible: 0,
      authored: false
    });
  });

  it("CONTROL — coopSeat and the SOLO singlePlayer block coexist and never read each other", () => {
    const both: CustomMapTilePlan[] = [
      {
        ...starts[0],
        group: "starting",
        faceDown: false,
        coopSeat: { role: "computer" },
        singlePlayer: { role: "human" }
      },
      {
        ...starts[1],
        group: "starting",
        faceDown: false,
        coopSeat: { role: "human" },
        singlePlayer: { role: "computer" }
      }
    ];
    const { accepted } = validateCustomMapPlan(both, scenarioDefinitions.skirmish, 2);
    expect(accepted[0].coopSeat).toEqual({ role: "computer" });
    expect(accepted[0].singlePlayer).toEqual({ role: "human" });
    // The solo deployment reads ONLY `singlePlayer` — the opposite roles above.
    const solo = singlePlayerMapDeployment(accepted);
    expect(solo?.human).toBe(accepted[0]);
    expect(solo?.computers).toEqual([accepted[1]]);
    // ...and the co-op deployment reads ONLY `coopSeat`.
    const coop = coopMapDeployment(accepted, 1, 1);
    expect(coop?.ok && coop.deployment.humans).toEqual([accepted[1]]);
    expect(coop?.ok && coop.deployment.computers).toEqual([accepted[0]]);
  });
});

// ===========================================================================
// 2. coopMapDeployment — the pure seating
// ===========================================================================

describe("co-op step 5 — coopMapDeployment", () => {
  it("returns null when NO position carries a role (legacy maps keep seat order)", () => {
    expect(coopMapDeployment(PLAIN_TOWNS, 2, 1)).toBeNull();
    expect(coopMapDeployment(null, 2, 1)).toBeNull();
    expect(coopMapDeployment([], 2, 1)).toBeNull();
  });

  it("fills role-pinned positions first, then the flexible ones — humans before computers", () => {
    const result = coopMapDeployment(COOP_TOWNS, 2, 1);
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    // The one human-only tile, then the single flexible tile.
    expect(result.deployment.humans).toEqual([COOP_TOWNS[1], COOP_TOWNS[2]]);
    // The FIRST computer-only tile in plan order — never the flexible one the
    // humans already need.
    expect(result.deployment.computers).toEqual([COOP_TOWNS[0]]);

    // Deterministic: the same inputs seat identically every time.
    expect(coopMapDeployment(COOP_TOWNS, 2, 1)).toEqual(result);

    // One human + three computers: the computers take both pins and the flex.
    const heavy = coopMapDeployment(COOP_TOWNS, 1, 3);
    expect(heavy?.ok).toBe(true);
    if (!heavy?.ok) return;
    expect(heavy.deployment.humans).toEqual([COOP_TOWNS[1]]);
    expect(heavy.deployment.computers).toEqual([COOP_TOWNS[0], COOP_TOWNS[3], COOP_TOWNS[2]]);
  });

  it("names the binding constraint on each of the three no-fit shapes", () => {
    // Too many humans: 1 human-only + 1 flexible = 2 seats.
    const tooManyHumans = coopMapDeployment(COOP_TOWNS, 3, 1);
    expect(tooManyHumans?.ok).toBe(false);
    expect(tooManyHumans?.ok === false && tooManyHumans.reason).toMatch(
      /only 2 starting positions a human may take, but the table has 3 human seats/
    );

    // Too many computers: 2 computer-only + 1 flexible = 3 seats.
    const tooManyComputers = coopMapDeployment(COOP_TOWNS, 1, 4);
    expect(tooManyComputers?.ok).toBe(false);
    expect(tooManyComputers?.ok === false && tooManyComputers.reason).toMatch(
      /only 3 starting positions a computer may take, but the table has 4 computer seats/
    );

    // CONTENTION: each side fits alone, but both want the single flexible tile.
    const contention = coopMapDeployment(COOP_TOWNS, 2, 3);
    expect(contention?.ok).toBe(false);
    expect(contention?.ok === false && contention.reason).toMatch(
      /cannot seat 2 human and 3 computer players at once — only 1 starting position is open to either side/
    );
    // ...and each side alone really does fit, so the message is about the pair.
    expect(coopMapDeployment(COOP_TOWNS, 2, 1)?.ok).toBe(true);
    expect(coopMapDeployment(COOP_TOWNS, 1, 3)?.ok).toBe(true);
  });

  it("surfaces a designer alert only when a side has NOWHERE to start", () => {
    expect(coopMapDesignProblems(null, COOP_TOWNS), "a workable map warns nothing").toEqual([]);

    const humansLockedOut: CustomMapTilePlan[] = COOP_TOWNS.map((plan) => ({
      ...plan,
      coopSeat: { role: "computer" as const }
    }));
    expect(coopMapDesignProblems(null, humansLockedOut)[0]).toMatch(
      /no starting position is open to a human/
    );

    const computersLockedOut: CustomMapTilePlan[] = COOP_TOWNS.map((plan) => ({
      ...plan,
      coopSeat: { role: "human" as const }
    }));
    expect(coopMapDesignProblems(null, computersLockedOut)[0]).toMatch(
      /no starting position is open to a computer/
    );

    // CONTROL — an unauthored map warns nothing even though it is co-op-only,
    // because every position is flexible.
    expect(coopMapDesignProblems({ supportedModes: { clash: false } }, PLAIN_TOWNS)).toEqual([]);
    // ...but a co-op-only map with NO starting tiles at all does warn.
    expect(coopMapDesignProblems({ supportedModes: { clash: false } }, [])).toHaveLength(2);
  });
});

// ===========================================================================
// 3. The real build: seats land on their authored tiles
// ===========================================================================

describe("co-op step 5 — the build honours the authored positions", () => {
  it("a CO-OP build lands each seat on its authored starting tile", () => {
    const state = build({ coop: true, tiles: COOP_TOWNS, seed: "coop-map-build" });
    expect(state.gameMode).toBe("coop");
    // p1/p2 are the human seats (human-only tile first, then the flexible one);
    // p3 is the computer seat and takes the first computer-only tile.
    expect(state.heroes.hero_p1.spaceId).toBe(hexSpaceId(starts[1]));
    expect(state.heroes.hero_p2.spaceId).toBe(hexSpaceId(starts[2]));
    expect(state.heroes.hero_p3.spaceId).toBe(hexSpaceId(starts[0]));
  });

  it("CONTROL — a CLASH build on the SAME map ignores the roles and keeps seat order", () => {
    const state = build({ coop: false, tiles: COOP_TOWNS, seed: "clash-map-build" });
    expect(state.gameMode).toBeUndefined();
    expect(state.heroes.hero_p1.spaceId).toBe(hexSpaceId(starts[0]));
    expect(state.heroes.hero_p2.spaceId).toBe(hexSpaceId(starts[1]));
    expect(state.heroes.hero_p3.spaceId).toBe(hexSpaceId(starts[2]));
  });

  it("CONTROL — a CO-OP build on a map with NO roles keeps the same seat order", () => {
    const state = build({ coop: true, tiles: PLAIN_TOWNS, seed: "coop-plain-build" });
    expect(state.gameMode).toBe("coop");
    expect(state.heroes.hero_p1.spaceId).toBe(hexSpaceId(starts[0]));
    expect(state.heroes.hero_p2.spaceId).toBe(hexSpaceId(starts[1]));
    expect(state.heroes.hero_p3.spaceId).toBe(hexSpaceId(starts[2]));
  });

  it("a build the authored roles cannot seat is REFUSED, never silently re-seated", () => {
    // Every position reserved for the computer: the two humans have nowhere.
    const humansLockedOut = COOP_TOWNS.map((plan) => ({
      ...plan,
      coopSeat: { role: "computer" as const }
    }));
    expect(() => build({ coop: true, tiles: humansLockedOut, seed: "coop-nofit" })).toThrow(
      /only 0 starting positions a human may take/
    );
    // CONTROL — the identical map in CLASH builds fine (roles are ignored).
    expect(() =>
      build({ coop: false, tiles: humansLockedOut, seed: "clash-nofit-control" })
    ).not.toThrow();
  });
});

// ===========================================================================
// 4. The lobby: soft seed at pick, host override, hard refusal at the start
// ===========================================================================

describe("co-op step 5 — the lobby seam", () => {
  it("picking a CO-OP-ONLY map soft-seeds the table mode, and the host may still override it", () => {
    expect(presetForcedOptionKeys({ supportedModes: { clash: false } })).toContain("gameMode");
    // A clash-only map forces nothing — clash is already the absent default.
    expect(presetForcedOptionKeys({ supportedModes: { coop: false } })).not.toContain("gameMode");

    let state = lobby("coop-seed");
    expect(state.setupLobby?.options.gameMode).toBeUndefined();
    state = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: {
        customMap: PLAIN_TOWNS,
        customMapName: "Invasion",
        customMapPreset: { supportedModes: { clash: false } }
      } as never
    });
    expect(state.setupLobby?.options.gameMode, "seeded by the map").toBe("coop");

    // SOFT: the host's later edit wins over the seed.
    state = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { gameMode: "clash" }
    });
    expect(state.setupLobby?.options.gameMode).toBe("clash");
  });

  it("CONTROL — picking a both-modes map seeds nothing", () => {
    let state = lobby("coop-seed-control");
    state = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: {
        customMap: PLAIN_TOWNS,
        customMapName: "Neutral Ground",
        customMapPreset: { difficulty: "hard" }
      } as never
    });
    expect(state.setupLobby?.options.gameMode).toBeUndefined();
  });

  it("switching AWAY from a co-op-only map restores the table mode", () => {
    let state = lobby("coop-seed-revert");
    state = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: {
        customMap: PLAIN_TOWNS,
        customMapName: "Invasion",
        customMapPreset: { supportedModes: { clash: false } }
      } as never
    });
    expect(state.setupLobby?.options.gameMode).toBe("coop");
    state = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { customMap: null, customMapName: null } as never
    });
    expect(state.setupLobby?.options.gameMode).toBeUndefined();
  });

  it("the START is refused in a mode the map does not support — both directions", () => {
    // A co-op table on a CLASH-ONLY map.
    const clashOnly = seatedLobby("coop-on-clash-only", {
      gameMode: "coop",
      customMap: PLAIN_TOWNS,
      customMapName: "Duel",
      customMapPreset: { supportedModes: { coop: false } }
    });
    expect(reject(clashOnly, { type: "START_ADVENTURE", playerId: "p1" })).toMatch(
      /not designed for Co-op/
    );

    // ...and a CLASH table on a co-op-only map (the host overrode the seed).
    let coopOnly = seatedLobby("clash-on-coop-only", {
      customMap: PLAIN_TOWNS,
      customMapName: "Invasion",
      customMapPreset: { supportedModes: { clash: false } }
    });
    expect(coopOnly.setupLobby?.options.gameMode, "seeded first").toBe("coop");
    coopOnly = apply(coopOnly, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { gameMode: "clash" }
    });
    expect(reject(coopOnly, { type: "START_ADVENTURE", playerId: "p1" })).toMatch(
      /designed for Co-op only/
    );
    expect(coopOnly.phase, "the refused start changed nothing").toBe("setup");
  });

  it("CONTROL — the SAME lobbies start once the mode matches the map", () => {
    const clashOnly = seatedLobby("clash-ok", {
      customMap: PLAIN_TOWNS,
      customMapName: "Duel",
      customMapPreset: { supportedModes: { coop: false } }
    });
    expect(apply(clashOnly, { type: "START_ADVENTURE", playerId: "p1" }).phase).not.toBe("setup");

    const coopOnly = seatedLobby("coop-ok", {
      customMap: PLAIN_TOWNS,
      customMapName: "Invasion",
      customMapPreset: { supportedModes: { clash: false } }
    });
    const started = apply(coopOnly, { type: "START_ADVENTURE", playerId: "p1" });
    expect(started.phase).not.toBe("setup");
    expect(started.gameMode).toBe("coop");
  });

  it("END TO END: a co-op lobby seats every player on the map's authored position", () => {
    const state = seatedLobby("coop-authored-start", {
      gameMode: "coop",
      customMap: COOP_TOWNS,
      customMapName: "Authored Invasion",
      customMapPreset: { supportedModes: { clash: false } }
    });
    const started = apply(state, { type: "START_ADVENTURE", playerId: "p1" });
    expect(started.phase).not.toBe("setup");
    expect(started.heroes.hero_p1.spaceId).toBe(hexSpaceId(starts[1]));
    expect(started.heroes.hero_p2.spaceId).toBe(hexSpaceId(starts[2]));
    expect(started.heroes.hero_p3.spaceId).toBe(hexSpaceId(starts[0]));
  });

  it("a co-op START whose seat counts the roles cannot seat is REFUSED with the reason", () => {
    // Only ONE position a human may take, but the table holds two humans.
    const oneHumanSeat: CustomMapTilePlan[] = [
      { ...starts[0], group: "starting", faceDown: false, coopSeat: { role: "human" } },
      { ...starts[1], group: "starting", faceDown: false, coopSeat: { role: "computer" } },
      { ...starts[2], group: "starting", faceDown: false, coopSeat: { role: "computer" } }
    ];
    const state = seatedLobby("coop-nofit-start", {
      gameMode: "coop",
      customMap: oneHumanSeat,
      customMapName: "One Hero"
    });
    expect(reject(state, { type: "START_ADVENTURE", playerId: "p1" })).toMatch(
      /only 1 starting position a human may take, but the table has 2 human seats/
    );
    expect(state.phase).toBe("setup");

    // CONTROL — the identical lobby in CLASH starts, because a clash table
    // never reads the co-op roles.
    let clash = seatedLobby("clash-nofit-control", {
      customMap: oneHumanSeat,
      customMapName: "One Hero"
    });
    clash = apply(clash, { type: "START_ADVENTURE", playerId: "p1" });
    expect(clash.phase).not.toBe("setup");
  });

  it("a HOSTED table is refused BEFORE the ready check opens, not after everyone confirms", () => {
    // On a hosted table START_ADVENTURE only opens the 30s ready check — the
    // map is built later, from CONFIRM_START_ADVENTURE. Without the start-check
    // arm both refusals would surface only after the whole table had confirmed,
    // so this is the case that measures it (the open-table specs above are
    // caught by the build-time throw as well).
    const oneHumanSeat: CustomMapTilePlan[] = [
      { ...starts[0], group: "starting", faceDown: false, coopSeat: { role: "human" } },
      { ...starts[1], group: "starting", faceDown: false, coopSeat: { role: "computer" } },
      { ...starts[2], group: "starting", faceDown: false, coopSeat: { role: "computer" } }
    ];
    let state = lobby("coop-hosted-nofit");
    state = apply(state, { type: "JOIN_ROOM", clientId: "c1", name: "Alice" });
    state = apply(state, { type: "SET_ROOM_HOSTED", clientId: "c1", hosted: true });
    state = apply(state, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c1", seat: "p1" });
    state = apply(state, { type: "JOIN_ROOM", clientId: "c2", name: "Bob" });
    state = apply(state, { type: "ASSIGN_SEAT", clientId: "c1", targetClientId: "c2", seat: "p2" });
    state = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: {
        gameMode: "coop",
        customMap: oneHumanSeat,
        customMapName: "One Hero"
      } as never
    });
    state = apply(state, { type: "SET_COMPUTER_OPPONENTS", playerId: "p1", count: 1 });
    state = apply(state, {
      type: "CHOOSE_FACTION",
      playerId: "p1",
      factionId: "castle",
      heroDefId: "catherine"
    });
    state = apply(state, {
      type: "CHOOSE_FACTION",
      playerId: "p2",
      factionId: "rampart",
      heroDefId: "gelu"
    });
    state = apply(state, {
      type: "SET_COMPUTER_SEAT_FACTION",
      playerId: "p1",
      seatPlayerId: "p3",
      choice: { factionId: "dungeon", heroDefId: "alamar" }
    });

    expect(reject(state, { type: "START_ADVENTURE", playerId: "p1" })).toMatch(
      /only 1 starting position a human may take/
    );
    expect(state.setupLobby?.startCheck, "no ready check was opened").toBeFalsy();

    // CONTROL — the same hosted table on a map whose roles DO fit opens the
    // ready check instead of refusing.
    const fits = apply(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { customMap: COOP_TOWNS, customMapName: "Authored Invasion" } as never
    });
    const opened = apply(fits, { type: "START_ADVENTURE", playerId: "p1" });
    expect(opened.setupLobby?.startCheck).toBeTruthy();
  });
});

/**
 * STARTING-TILE SEAT ROLES IN EVERY TABLE MODE (2026-09-03).
 *
 * The designer's per-starting-tile option (persisted as
 * `CustomMapTilePlan.coopSeat`, keys unchanged for saved maps) used to be read
 * by a CO-OP build only. It now decides seating in EVERY session and table
 * mode through ONE shared pure function, `seatRoleMapDeployment`:
 *
 *   - "Only player"  (`role: "human"`)    — no computer seat starts here...
 *   - "Only AI"      (`role: "computer"`) — no human seat starts here, ever.
 *   - "Free (random)" (absent)            — either kind, in GAME ORDER.
 *
 *   ...EXCEPT the SOLO FALLBACK: a single-player session has exactly one human,
 *   so a LEFTOVER player-only position is opened to its AI seats.
 *
 * What every case below asserts is the OBSERVABLE outcome — each seat's main
 * hero map position (its home Town sits on the same tile centre) — never the
 * helper's return value, and every claim carries a CONTROL on the SAME fixture
 * with the roles absent, the session mode different, or the seat mix different.
 *
 * Mutation-checked: reverting the setup gate in `adventure-setup.ts` to the old
 * `setupOptions.gameMode === "coop"` fails the clash, pure-human-clash, solo,
 * solo-fallback, AI-only-refusal and free-order cases below.
 *
 * The CO-OP half of the same machinery stays pinned by
 * `coop-map-deployment.test.ts` (its three "a clash table ignores the roles"
 * CONTROLs were the behaviour this change deliberately removes, and are updated
 * there with the reason).
 */
import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createAdventureLobbyState,
  hexSpaceId,
  seatRoleMapDeployment,
  type CustomMapTilePlan,
  type GameAction,
  type GameState,
  type PlayerId
} from "./index";
import { scenarioDefinitions } from "@/data/map/scenarios";

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

type Role = "human" | "computer" | undefined;

/** Build a starting-tile plan list from a per-position role list. */
function towns(roles: readonly Role[]): CustomMapTilePlan[] {
  return roles.map((role, index) => ({
    ...starts[index],
    group: "starting" as const,
    faceDown: false,
    ...(role ? { coopSeat: { role } } : {})
  }));
}

/** The same plans with every role stripped — the legacy-map CONTROL. */
function stripped(plans: readonly CustomMapTilePlan[]): CustomMapTilePlan[] {
  return plans.map((plan) => {
    const next = { ...plan };
    delete next.coopSeat;
    return next;
  });
}

const COMPUTER = { kind: "computer", difficulty: "standard", policyVersion: 1 } as const;

const SEAT_FACTIONS: { factionId: string; heroDefId: string }[] = [
  { factionId: "castle", heroDefId: "catherine" },
  { factionId: "rampart", heroDefId: "gelu" },
  { factionId: "dungeon", heroDefId: "alamar" },
  { factionId: "tower", heroDefId: "solmyr" }
];

function playersFor(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `S${index + 1}`,
    factionId: SEAT_FACTIONS[index].factionId as never,
    heroDefId: SEAT_FACTIONS[index].heroDefId
  }));
}

/**
 * Build a real game. `computers` names the TRAILING seats driven by the AI.
 * `rollFirstPlayer` stays off unless a case is about the game order, so every
 * other case reads seats in configuration order.
 */
function build(opts: {
  tiles: CustomMapTilePlan[];
  seats: number;
  computers?: number;
  sessionMode?: "multiplayer" | "single-player";
  gameMode?: "clash" | "coop";
  seed?: string;
  manualOrder?: PlayerId[];
  rollFirstPlayer?: boolean;
}): GameState {
  const computers = opts.computers ?? 0;
  const controllers = Object.fromEntries(
    Array.from({ length: computers }, (_, index) => [`p${opts.seats - computers + index + 1}`, COMPUTER])
  );
  return createAdventureGameState({
    seed: opts.seed ?? "seat-roles",
    scenarioId: "skirmish",
    sessionMode: opts.sessionMode ?? "multiplayer",
    rollFirstPlayer: opts.rollFirstPlayer ?? false,
    startingBonus: false,
    customMap: opts.tiles,
    ...(opts.gameMode ? { gameMode: opts.gameMode } : {}),
    ...(opts.manualOrder
      ? { playerOrderMode: "manual" as const, manualPlayerOrder: opts.manualOrder }
      : {}),
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

// ---------------------------------------------------------------------------
// 1. The pure function
// ---------------------------------------------------------------------------

describe("seatRoleMapDeployment — the one shared seating", () => {
  it("returns null when NO starting position carries a role", () => {
    const plain = stripped(towns(["human", "computer", undefined]));
    expect(
      seatRoleMapDeployment(plain, [{ id: "p1", kind: "human" }], { soloFallback: false })
    ).toBeNull();
    expect(seatRoleMapDeployment(null, [{ id: "p1", kind: "human" }], { soloFallback: false })).toBeNull();
    expect(seatRoleMapDeployment([], [{ id: "p1", kind: "human" }], { soloFallback: false })).toBeNull();
  });

  it("each kind exhausts its EXCLUSIVE positions before the shared ones", () => {
    // free · player-only · AI-only · player-only
    const plans = towns([undefined, "human", "computer", "human"]);
    const seated = seatRoleMapDeployment(
      plans,
      [
        { id: "p1", kind: "human" },
        { id: "p2", kind: "human" },
        { id: "p3", kind: "computer" }
      ],
      { soloFallback: false }
    );
    expect(seated?.ok).toBe(true);
    expect(seated?.ok && seated.assignments.get("p1")).toBe(plans[1]);
    expect(seated?.ok && seated.assignments.get("p2")).toBe(plans[3]);
    expect(seated?.ok && seated.assignments.get("p3")).toBe(plans[2]);
  });

  it("the SOLO FALLBACK opens a leftover player-only position to the AI — and only in solo", () => {
    const plans = towns(["human", "human"]);
    const seats = [
      { id: "p1" as PlayerId, kind: "human" as const },
      { id: "p2" as PlayerId, kind: "computer" as const }
    ];
    const solo = seatRoleMapDeployment(plans, seats, { soloFallback: true });
    expect(solo?.ok && solo.assignments.get("p1")).toBe(plans[0]);
    expect(solo?.ok && solo.assignments.get("p2")).toBe(plans[1]);
    // CONTROL — outside single player the AI may never take one.
    const table = seatRoleMapDeployment(plans, seats, { soloFallback: false });
    expect(table?.ok).toBe(false);
    expect(table?.ok === false && table.reason).toMatch(
      /only 0 starting positions a computer may take, but the table has 1 computer seat/
    );
  });

  it("a FREE position is preferred over a leftover player-only one even in solo", () => {
    const plans = towns(["human", "human", undefined]);
    const solo = seatRoleMapDeployment(
      plans,
      [
        { id: "p1", kind: "human" },
        { id: "p2", kind: "computer" }
      ],
      { soloFallback: true }
    );
    expect(solo?.ok && solo.assignments.get("p2")).toBe(plans[2]);
  });
});

// ---------------------------------------------------------------------------
// 2. The real build, mode by mode
// ---------------------------------------------------------------------------

describe("starting-tile seat roles — the build in every mode", () => {
  it("CLASH with 2 humans + 1 AI seats the humans on the player-only tiles", () => {
    // free · player-only · AI-only · player-only — deliberately NOT seat order.
    const tiles = towns([undefined, "human", "computer", "human"]);
    const state = build({ tiles, seats: 3, computers: 1, seed: "clash-mix" });
    expect(state.gameMode, "an ordinary Clash table — the mode is absent").toBeUndefined();
    expect(homes(state, 3)).toEqual({ p1: 1, p2: 3, p3: 2 });

    // CONTROL — the SAME tiles with no roles keep classic seat order.
    const control = build({ tiles: stripped(tiles), seats: 3, computers: 1, seed: "clash-mix" });
    expect(homes(control, 3)).toEqual({ p1: 0, p2: 1, p3: 2 });
  });

  it("a PURE-HUMAN clash still honours the roles", () => {
    // AI-only · player-only · AI-only · player-only
    const tiles = towns(["computer", "human", "computer", "human"]);
    const state = build({ tiles, seats: 2, seed: "pure-human" });
    expect(homes(state, 2)).toEqual({ p1: 1, p2: 3 });

    // CONTROL — without the roles at least one human lands elsewhere.
    const control = build({ tiles: stripped(tiles), seats: 2, seed: "pure-human" });
    expect(homes(control, 2)).toEqual({ p1: 0, p2: 1 });
  });

  it("SINGLE PLAYER: the human takes a player-only tile, the AIs take AI-only then FREE", () => {
    // player-only · AI-only · free · player-only
    const tiles = towns(["human", "computer", undefined, "human"]);
    const state = build({
      tiles,
      seats: 3,
      computers: 2,
      sessionMode: "single-player",
      seed: "solo-mix"
    });
    // The leftover player-only tile (index 3) stays EMPTY while a free one is
    // available — the fallback is a last resort, not a preference.
    expect(homes(state, 3)).toEqual({ p1: 0, p2: 1, p3: 2 });

    const control = build({
      tiles: stripped(tiles),
      seats: 3,
      computers: 2,
      sessionMode: "single-player",
      seed: "solo-mix"
    });
    expect(homes(control, 3)).toEqual({ p1: 0, p2: 1, p3: 2 });
    // The CONTROL happens to match here (seat order already fits), so the
    // discriminating case is the free-tile preference asserted above plus the
    // solo-fallback case below.
  });

  it("SINGLE PLAYER on an all-player-only map: the AI takes the leftover; a TABLE refuses it", () => {
    const tiles = towns(["human", "human"]);
    const solo = build({
      tiles,
      seats: 2,
      computers: 1,
      sessionMode: "single-player",
      seed: "solo-fallback"
    });
    expect(homes(solo, 2)).toEqual({ p1: 0, p2: 1 });

    // The SAME map with the same seat mix in MULTIPLAYER is unseatable.
    expect(() =>
      build({ tiles, seats: 2, computers: 1, sessionMode: "multiplayer", seed: "table-nofit" })
    ).toThrow(/only 0 starting positions a computer may take, but the table has 1 computer seat/);
  });

  it("a CLASH build where a human would have to sit on an AI-only tile THROWS", () => {
    const tiles = towns(["computer", "computer", "computer"]);
    expect(() => build({ tiles, seats: 2, computers: 1, seed: "human-locked-out" })).toThrow(
      /only 0 starting positions a human may take, but the table has 1 human seat/
    );
    // CONTROL — the identical map with the roles stripped builds.
    expect(() =>
      build({ tiles: stripped(tiles), seats: 2, computers: 1, seed: "human-locked-out" })
    ).not.toThrow();
  });

  it("a FREE position follows the GAME ORDER, not the seat order", () => {
    // AI-only · free · free — both humans must take a free position, so the
    // order they are fed in is the only thing that decides which.
    const tiles = towns(["computer", undefined, undefined]);
    const forward = build({
      tiles,
      seats: 3,
      computers: 1,
      seed: "free-order",
      manualOrder: ["p1", "p2", "p3"]
    });
    expect(homes(forward, 3)).toEqual({ p1: 1, p2: 2, p3: 0 });

    const reversed = build({
      tiles,
      seats: 3,
      computers: 1,
      seed: "free-order",
      manualOrder: ["p2", "p1", "p3"]
    });
    expect(homes(reversed, 3)).toEqual({ p1: 2, p2: 1, p3: 0 });
  });

  it("...and the seeded first-player ROLL really moves who lands on a free position", () => {
    const tiles = towns(["computer", undefined, undefined]);
    const landings = new Set<number>();
    for (const seed of ["roll-a", "roll-b", "roll-c", "roll-d", "roll-e", "roll-f"]) {
      const state = build({ tiles, seats: 3, computers: 1, seed, rollFirstPlayer: true });
      const map = homes(state, 3);
      // The AI seat is pinned by its role whatever the roll says.
      expect(map.p3).toBe(0);
      landings.add(map.p1);
    }
    expect(landings.size, "the roll, not the seat order, picks the free tile").toBeGreaterThan(1);
  });

  it("the explicit SOLO singlePlayer block keeps PRECEDENCE over the seat roles", () => {
    // The two blocks name OPPOSITE tiles: `singlePlayer` says the human starts
    // on index 0, `coopSeat` says index 1. The solo contract must win.
    const tiles: CustomMapTilePlan[] = [
      {
        ...starts[0],
        group: "starting",
        faceDown: false,
        singlePlayer: { role: "human" },
        coopSeat: { role: "computer" }
      },
      {
        ...starts[1],
        group: "starting",
        faceDown: false,
        singlePlayer: { role: "computer" },
        coopSeat: { role: "human" }
      }
    ];
    const solo = build({
      tiles,
      seats: 2,
      computers: 1,
      sessionMode: "single-player",
      seed: "solo-precedence"
    });
    expect(homes(solo, 2)).toEqual({ p1: 0, p2: 1 });

    // CONTROL — the same map in MULTIPLAYER has no solo deployment, so the seat
    // roles decide and the human lands on the OTHER tile.
    const table = build({ tiles, seats: 2, computers: 1, seed: "table-precedence" });
    expect(homes(table, 2)).toEqual({ p1: 1, p2: 0 });
  });
});

// ---------------------------------------------------------------------------
// 3. The lobby start check refuses in every mode
// ---------------------------------------------------------------------------

/** p1 + p2 human, p3 computer, factions chosen — ready for START_ADVENTURE. */
function seatedLobby(seed: string, options: Record<string, unknown>): GameState {
  let state = createAdventureLobbyState({ seed, scenarioId: "skirmish" });
  state = apply(state, { type: "SET_GAME_OPTIONS", playerId: "p1", options: options as never });
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

describe("starting-tile seat roles — the lobby start check", () => {
  it("a CLASH start whose seats the roles cannot fit is REFUSED with the reason", () => {
    const tiles = towns(["human", "computer", "computer"]);
    const state = seatedLobby("clash-start-nofit", {
      customMap: tiles,
      customMapName: "One Hero"
    });
    expect(state.setupLobby?.options.gameMode, "an ordinary Clash lobby").toBeUndefined();
    expect(reject(state, { type: "START_ADVENTURE", playerId: "p1" })).toMatch(
      /only 1 starting position a human may take, but the table has 2 human seats/
    );
    expect(state.phase, "the refused start changed nothing").toBe("setup");

    // ...and the build refuses the same table, so check and build agree.
    expect(() =>
      build({ tiles, seats: 3, computers: 1, seed: "clash-start-nofit" })
    ).toThrow(/only 1 starting position a human may take/);
  });

  it("CONTROL — the SAME clash lobby starts once a second human position exists", () => {
    const state = seatedLobby("clash-start-fits", {
      customMap: towns(["human", "human", "computer"]),
      customMapName: "Two Heroes"
    });
    const started = apply(state, { type: "START_ADVENTURE", playerId: "p1" });
    expect(started.phase).not.toBe("setup");
    // A real lobby rolls for first player, and this seed hands the order to p2
    // — so WHICH of the two player-only tiles each human takes is decided by
    // the game order, exactly as the rule says. What the roles guarantee is the
    // SET: both humans on player-only tiles, the AI on the AI-only one.
    const map = homes(started, 3);
    expect([map.p1, map.p2].slice().sort()).toEqual([0, 1]);
    expect(map.p3).toBe(2);
  });

  it("a CLASH start with no AI-open position is refused too", () => {
    const state = seatedLobby("clash-start-no-ai", {
      customMap: towns(["human", "human", "human"]),
      customMapName: "Players Only"
    });
    expect(reject(state, { type: "START_ADVENTURE", playerId: "p1" })).toMatch(
      /only 0 starting positions a computer may take, but the table has 1 computer seat/
    );
  });

  it("CONTROL — a legacy map with no roles is never refused", () => {
    const state = seatedLobby("clash-start-legacy", {
      customMap: stripped(towns(["human", "computer", "computer"])),
      customMapName: "Legacy"
    });
    expect(apply(state, { type: "START_ADVENTURE", playerId: "p1" }).phase).not.toBe("setup");
  });
});

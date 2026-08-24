/**
 * CO-OP MODE — step 3: VICTORY & OBJECTIVES.
 *
 * What this file pins (the match report / MMR half, the map-designer surface
 * and every UI surface belong to later steps and are NOT here):
 *
 *  1. The IMPLICIT team victory steps 1-2 give for free: `eliminatePlayer`'s
 *     "last alliance standing" really fires in BOTH directions on a co-op
 *     table — the humans winning by wiping out the computer seats, and the
 *     invaders winning by wiping out the humans.
 *  2. The two new `CustomWinCondition` kinds — `defeat-computers` (with its
 *     INERT no-computer-seat reading) and `slay-raid-boss` (team-wide in co-op,
 *     per-seat in clash, driven through the REAL kill path).
 *  3. A `slay-raid-boss` condition is DROPPED at build with a public
 *     MAP_SECRET_FEATURE_FALLBACK note when no raid-boss module is on.
 *  4. A COMPUTER seat never wins by a custom condition in co-op (and still
 *     does in clash — CONTROL-pinned, so clash semantics cannot silently move).
 *  5. A co-op win with a living ally names the ALLIANCE in its GAME_WON reason.
 *
 * Every claim asserts an OBSERVABLE outcome (`adventure.winnerPlayerId`,
 * `state.phase`, the GAME_WON reason, the built preset's condition list) and
 * carries a clash / absent-mode / below-threshold CONTROL on the same setup.
 */
import { describe, expect, it } from "vitest";
import {
  checkCustomWinConditions,
  createAdventureGameState,
  customWinConditionProgress,
  eliminatePlayer,
  raidBossKillCount,
  sanitizeCustomWinConditions,
  type CustomWinCondition,
  type GameState,
  type PlayerController,
  type PlayerId
} from "./index";
import { beginFieldVisit, startAdventureRound } from "./adventure";
import { applyAction } from "./reducer";
import { finalizeAdventureCombat, pumpAdventureQueues } from "./adventure-reducer";
import { NEUTRAL_PLAYER_ID, type GameAction } from "./state";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const COMPUTER: PlayerController = { kind: "computer", difficulty: "standard", policyVersion: 1 };

type Seat = { id: string; name: string; factionId: string; heroDefId: string };

const SEATS: Seat[] = [
  { id: "p1", name: "Alice", factionId: "castle", heroDefId: "catherine" },
  { id: "p2", name: "Bob", factionId: "rampart", heroDefId: "gelu" },
  { id: "p3", name: "Computer 1", factionId: "dungeon", heroDefId: "alamar" },
  { id: "p4", name: "Computer 2", factionId: "necropolis", heroDefId: "sandro" }
];

/**
 * A started adventure. `coop` stamps `gameMode: "coop"` (humans vs the AI
 * alliance); `computers` names which trailing seats are computer-controlled —
 * IDENTICAL in the clash CONTROL, so a mode-off run differs only by the flag.
 */
function game(opts: {
  coop: boolean;
  seats?: number;
  computers?: PlayerId[];
  seed?: string;
  conditions?: CustomWinCondition[];
  extra?: Record<string, unknown>;
}): GameState {
  const seats = SEATS.slice(0, opts.seats ?? 3);
  const computers = opts.computers ?? ["p3"];
  const state = createAdventureGameState({
    seed: opts.seed ?? `coop-obj-${opts.coop}`,
    difficulty: "normal",
    rollFirstPlayer: false,
    events: false,
    victoryMode: "conquest",
    ...(opts.coop ? { gameMode: "coop" as const } : {}),
    ...(computers.length > 0
      ? { controllers: Object.fromEntries(computers.map((id) => [id, { ...COMPUTER }])) }
      : {}),
    players: seats as never,
    ...(opts.conditions ? { customWinConditions: opts.conditions } : {}),
    ...(opts.extra ?? {})
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.pendingChoice = null;
  return state;
}

/** The GAME_WON reason text, or null when no winner was declared. */
function wonReason(state: GameState): string | null {
  const won = state.eventLog.find((event) => event.type === "GAME_WON");
  return won?.type === "GAME_WON" ? won.reason : null;
}

function winnerOf(state: GameState): PlayerId | null | undefined {
  return state.adventure?.winnerPlayerId;
}

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

// ===========================================================================
// 1. The implicit TEAM victory (steps 1-2 machinery, pinned here)
// ===========================================================================

describe("co-op step 3 — the implicit team victory", () => {
  it("eliminating the LAST computer seat hands the game to the human alliance", () => {
    const state = game({ coop: true, seats: 3, computers: ["p3"], seed: "coop-win-humans" });

    eliminatePlayer(state, "p3", "conquered", false);

    expect(winnerOf(state), "a human is declared").toBe("p1");
    expect(state.phase).toBe("game-over");
    expect(wonReason(state)).toMatch(/alliance/i);
    // The ALLY is a co-winner in every in-engine sense: still live, never
    // eliminated (the engine records one winner SEAT, not a loser set).
    expect(state.players.p2.eliminated).toBeFalsy();
  });

  it("CONTROL — the SAME elimination on a clash table ends nothing (two hostile seats live)", () => {
    const state = game({ coop: false, seats: 3, computers: ["p3"], seed: "coop-win-humans" });

    eliminatePlayer(state, "p3", "conquered", false);

    expect(winnerOf(state), "p1 and p2 are still rivals").toBeNull();
    expect(state.phase).not.toBe("game-over");
    expect(wonReason(state)).toBeNull();
  });

  it("eliminating the LAST human hands the game to the AI alliance", () => {
    const state = game({
      coop: true,
      seats: 4,
      computers: ["p3", "p4"],
      seed: "coop-win-invaders"
    });

    eliminatePlayer(state, "p1", "conquered", false);
    expect(winnerOf(state), "one human still lives — nothing is decided").toBeNull();

    eliminatePlayer(state, "p2", "conquered", false);

    expect(winnerOf(state), "the invaders take the table").toBe("p3");
    expect(state.phase).toBe("game-over");
    expect(wonReason(state)).toMatch(/alliance/i);
  });

  it("CONTROL — the same two eliminations on a clash table leave two hostile AI seats and no winner", () => {
    const state = game({
      coop: false,
      seats: 4,
      computers: ["p3", "p4"],
      seed: "coop-win-invaders"
    });

    eliminatePlayer(state, "p1", "conquered", false);
    eliminatePlayer(state, "p2", "conquered", false);

    expect(winnerOf(state)).toBeNull();
    expect(state.phase).not.toBe("game-over");
  });

  it("CONTROL — a co-op table with TWO computer seats does not end when only ONE falls", () => {
    const state = game({ coop: true, seats: 4, computers: ["p3", "p4"], seed: "coop-partial" });

    eliminatePlayer(state, "p3", "conquered", false);

    expect(winnerOf(state)).toBeNull();
    expect(state.phase).not.toBe("game-over");
  });
});

// ===========================================================================
// 2. `defeat-computers`
// ===========================================================================

describe("co-op step 3 — the `defeat-computers` win condition", () => {
  const CONDITION: CustomWinCondition[] = [{ kind: "defeat-computers" }];

  it("fires for a human once EVERY computer seat is eliminated — and names the alliance", () => {
    const state = game({
      coop: true,
      seats: 4,
      computers: ["p3", "p4"],
      seed: "coop-defeat-computers",
      conditions: CONDITION
    });

    // Below the threshold: one invader still stands (CONTROL on the same state).
    state.players.p3.eliminated = true;
    checkCustomWinConditions(state);
    expect(winnerOf(state), "one computer seat still lives").toBeNull();
    expect(customWinConditionProgress(state, "p1", CONDITION[0])).toMatchObject({
      current: 1,
      target: 2,
      complete: false
    });

    state.players.p4.eliminated = true;
    checkCustomWinConditions(state);

    expect(winnerOf(state)).toBe("p1");
    expect(state.phase).toBe("game-over");
    expect(wonReason(state)).toContain("defeat every computer opponent");
    expect(wonReason(state), "the win belongs to the alliance").toMatch(/with their alliance/i);
    expect(state.players.p2.eliminated, "the living ally is not a loser in engine state").toBeFalsy();
  });

  it("CONTROL — the same condition on a CLASH table wins for one seat with NO alliance wording", () => {
    const state = game({
      coop: false,
      seats: 4,
      computers: ["p3", "p4"],
      seed: "coop-defeat-computers",
      conditions: CONDITION
    });

    state.players.p3.eliminated = true;
    state.players.p4.eliminated = true;
    checkCustomWinConditions(state);

    expect(winnerOf(state)).toBe("p1");
    expect(wonReason(state)).toContain("defeat every computer opponent");
    expect(wonReason(state), "clash wording is byte-identical to before").not.toMatch(/alliance/i);
  });

  it("is INERT with no computer seat in the game — never a vacuous 0-of-0 instant win", () => {
    const state = game({
      coop: false,
      seats: 2,
      computers: [],
      seed: "coop-defeat-none",
      conditions: CONDITION
    });
    expect(state.controllers, "an all-human game carries no controller map").toBeUndefined();

    expect(customWinConditionProgress(state, "p1", CONDITION[0])).toMatchObject({
      current: 0,
      complete: false
    });
    checkCustomWinConditions(state);
    expect(winnerOf(state), "nobody wins on move one").toBeNull();

    // Still inert once a HUMAN rival falls (there is no computer denominator).
    state.players.p2.eliminated = true;
    checkCustomWinConditions(state);
    expect(winnerOf(state), "the condition itself never fires").toBeNull();
    expect(wonReason(state)).toBeNull();

    // The sanitiser KEEPS the condition — inertness is the CHECKER's reading.
    expect(sanitizeCustomWinConditions([{ kind: "defeat-computers" }])).toEqual([
      { kind: "defeat-computers" }
    ]);
  });

  it("sanitizes parameterless (a stray param is dropped, so two authored copies dedupe)", () => {
    expect(sanitizeCustomWinConditions([{ kind: "defeat-computers", count: 7 }])).toEqual([
      { kind: "defeat-computers" }
    ]);
  });
});

// ===========================================================================
// 3. `slay-raid-boss`
// ===========================================================================

/** A raid-boss game (WOG module ON) with the co-op flag optional. */
function raidGame(opts: {
  coop: boolean;
  seed: string;
  conditions?: CustomWinCondition[];
  computers?: PlayerId[];
  seats?: number;
}): GameState {
  const state = game({
    coop: opts.coop,
    seats: opts.seats ?? 3,
    computers: opts.computers ?? ["p3"],
    seed: opts.seed,
    conditions: opts.conditions,
    extra: { wog: { enabled: true, raidBosses: true } }
  });
  state.adventure!.rewardQueue = [];
  state.adventure!.pendingVisit = null;
  return state;
}

function startRound(state: GameState, round: number): void {
  state.round = round;
  startAdventureRound(state);
  pumpAdventureQueues(state);
}

/** Round-5 scheduled spawn → the lair record + its field. */
function spawnLair(state: GameState): { instanceId: string; fieldId: string } {
  startRound(state, 5);
  const entries = Object.entries(state.adventure!.raidBosses ?? {});
  expect(entries.length, "expected the scheduled boss to spawn").toBe(1);
  const [instanceId, record] = entries[0]!;
  return { instanceId, fieldId: record.fieldId };
}

/** Adds a SECOND boss record on a spare field (hand-stamped, for the team math). */
function addBossRecord(state: GameState, instanceId: string, slainBy?: PlayerId): void {
  state.adventure!.raidBosses![instanceId] = {
    defId: "goblin_king",
    fieldId: `fake-${instanceId}`,
    layersLeft: slainBy ? 0 : 3,
    layerBreaks: {},
    spawnedRound: 5,
    ...(slainBy ? { slainBy } : {})
  };
}

describe("co-op step 3 — the `slay-raid-boss` win condition", () => {
  it("the REAL kill chain wins the game: challenge → finalize → condition → winner", () => {
    const state = raidGame({
      coop: true,
      seed: "coop-raid-real",
      conditions: [{ kind: "slay-raid-boss", count: 1 }]
    });
    const { instanceId, fieldId } = spawnLair(state);

    // CONTROL: the lair is live, so the objective is unmet.
    checkCustomWinConditions(state);
    expect(winnerOf(state), "an unslain boss wins nobody the game").toBeNull();
    expect(raidBossKillCount(state, "p1")).toBe(0);

    // Walk p1 onto the lair and answer "Challenge" — the real visit path.
    const hero = state.heroes.hero_p1;
    state.adventure!.lastVisitedField[hero.id] = hero.spaceId!;
    hero.spaceId = fieldId;
    beginFieldVisit(state, hero.id, fieldId, false);
    expect(state.adventure!.pendingVisit?.steps[0]?.type).toBe("CHOOSE_ONE");
    const fighting = apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
    expect(fighting.combat, "the lair fight really opened").toBeTruthy();

    // Win it through the REAL finalize (this is what stamps `slainBy`).
    fighting.combat!.outcome = {
      winnerPlayerId: "p1",
      defeatedPlayerId: NEUTRAL_PLAYER_ID,
      reason: "all-enemy-units-defeated"
    };
    finalizeAdventureCombat(fighting);
    expect(fighting.adventure!.raidBosses![instanceId].slainBy, "the real kill path ran").toBe("p1");

    // The reducer tail's check (combat is closed) now ends the game.
    expect(fighting.combat).toBeFalsy();
    checkCustomWinConditions(fighting);

    expect(winnerOf(fighting)).toBe("p1");
    expect(fighting.phase).toBe("game-over");
    expect(wonReason(fighting)).toContain("slay 1 Raid Boss");
    expect(wonReason(fighting)).toMatch(/with their alliance/i);
  });

  it("CO-OP counts an ALLY's kill; the clash CONTROL does not", () => {
    const conditions: CustomWinCondition[] = [{ kind: "slay-raid-boss", count: 2 }];

    const coop = raidGame({ coop: true, seed: "coop-raid-team", conditions });
    addBossRecord(coop, "boss-a", "p1");
    addBossRecord(coop, "boss-b", "p2");
    expect(raidBossKillCount(coop, "p1"), "an ally's kill counts for me").toBe(2);
    expect(raidBossKillCount(coop, "p2")).toBe(2);
    checkCustomWinConditions(coop);
    expect(winnerOf(coop)).toBe("p1");
    expect(wonReason(coop)).toContain("slay 2 Raid Bosses");

    const clash = raidGame({ coop: false, seed: "coop-raid-team", conditions });
    addBossRecord(clash, "boss-a", "p1");
    addBossRecord(clash, "boss-b", "p2");
    expect(raidBossKillCount(clash, "p1"), "clash is strictly per-seat").toBe(1);
    expect(raidBossKillCount(clash, "p2")).toBe(1);
    checkCustomWinConditions(clash);
    expect(winnerOf(clash), "neither seat reached 2 alone").toBeNull();
  });

  it("an ENEMY (computer) seat's kill never counts for the human alliance — and wins the AI nothing", () => {
    const state = raidGame({
      coop: true,
      seed: "coop-raid-enemy",
      conditions: [{ kind: "slay-raid-boss", count: 1 }]
    });
    addBossRecord(state, "boss-a", "p3"); // the computer seat slew it

    expect(raidBossKillCount(state, "p1"), "the invaders are a DIFFERENT alliance").toBe(0);
    expect(raidBossKillCount(state, "p3")).toBe(1);

    checkCustomWinConditions(state);
    expect(winnerOf(state), "and a computer seat never wins by an objective in co-op").toBeNull();
  });

  it("clamps count to 1-3 and describes itself in the reason string", () => {
    expect(sanitizeCustomWinConditions([{ kind: "slay-raid-boss", count: 9 }])).toEqual([
      { kind: "slay-raid-boss", count: 3 }
    ]);
    expect(sanitizeCustomWinConditions([{ kind: "slay-raid-boss", count: 0 }])).toEqual([
      { kind: "slay-raid-boss", count: 1 }
    ]);
    expect(sanitizeCustomWinConditions([{ kind: "slay-raid-boss" }])).toEqual([
      { kind: "slay-raid-boss", count: 1 }
    ]);
  });

  it("CONTROL — a game with NO boss records counts zero kills for everyone", () => {
    const state = raidGame({ coop: true, seed: "coop-raid-empty" });
    expect(raidBossKillCount(state, "p1")).toBe(0);
    // And with the module OFF the whole record map is absent (still zero, no throw).
    const off = game({ coop: true, seed: "coop-raid-module-off" });
    expect(off.adventure?.raidBosses).toBeUndefined();
    expect(raidBossKillCount(off, "p1")).toBe(0);
  });
});

// ===========================================================================
// 4. Module dependency: the build-time drop
// ===========================================================================

describe("co-op step 3 — a `slay-raid-boss` condition needs a raid-boss module", () => {
  function conditionsOf(state: GameState): CustomWinCondition[] {
    return state.adventure?.mapPreset?.customWinConditions ?? [];
  }
  function droppedNote(state: GameState): boolean {
    return state.eventLog.some(
      (event) => event.type === "MAP_SECRET_FEATURE_FALLBACK" && event.feature === "slay-raid-boss"
    );
  }

  it("is DROPPED at build with a public note when neither module is on (and the game still starts)", () => {
    const state = game({
      coop: true,
      seed: "coop-raid-drop",
      conditions: [{ kind: "slay-raid-boss", count: 2 }]
    });

    expect(conditionsOf(state), "an unfireable objective never reaches the map preset").toEqual([]);
    expect(droppedNote(state), "and the drop is announced, never silent").toBe(true);
    expect(state.adventure, "the start is never blocked").toBeTruthy();
    expect(state.phase).not.toBe("setup");
  });

  it("CONTROL — with the WOG raid-boss module ON the very same condition is KEPT and silent", () => {
    const state = game({
      coop: true,
      seed: "coop-raid-drop",
      conditions: [{ kind: "slay-raid-boss", count: 2 }],
      extra: { wog: { enabled: true, raidBosses: true } }
    });

    expect(conditionsOf(state)).toEqual([{ kind: "slay-raid-boss", count: 2 }]);
    expect(droppedNote(state)).toBe(false);
  });

  it("CONTROL — the ANIME raid-boss surface keeps it too, and a mixed list loses only that row", () => {
    const anime = game({
      coop: true,
      seed: "coop-raid-anime",
      conditions: [{ kind: "slay-raid-boss", count: 1 }],
      extra: { anime: { enabled: true, raidBosses: true } }
    });
    expect(conditionsOf(anime)).toEqual([{ kind: "slay-raid-boss", count: 1 }]);

    const mixed = game({
      coop: true,
      seed: "coop-raid-mixed",
      conditions: [{ kind: "defeat-computers" }, { kind: "slay-raid-boss", count: 1 }]
    });
    expect(conditionsOf(mixed), "the sibling condition survives the drop").toEqual([
      { kind: "defeat-computers" }
    ]);
    expect(droppedNote(mixed)).toBe(true);
  });
});

// ===========================================================================
// 5. A computer seat never wins by a custom condition IN CO-OP
// ===========================================================================

describe("co-op step 3 — computer seats are skipped by the win check in co-op only", () => {
  const GOLD: CustomWinCondition[] = [{ kind: "gold", amount: 50 }];

  function withRichComputer(coop: boolean): GameState {
    const state = game({
      coop,
      seats: 3,
      computers: ["p3"],
      seed: "coop-ai-objective",
      conditions: GOLD
    });
    state.players.p1.resources.gold = 0;
    state.players.p2.resources.gold = 0;
    state.players.p3.resources.gold = 500;
    return state;
  }

  it("a co-op computer seat sitting on 500 gold wins NOTHING", () => {
    const state = withRichComputer(true);
    // The metric itself says it MEETS the condition — only the checker skips it.
    expect(customWinConditionProgress(state, "p3", GOLD[0]).complete).toBe(true);

    checkCustomWinConditions(state);

    expect(winnerOf(state), "the invaders win only by eliminating every human").toBeNull();
    expect(state.phase).not.toBe("game-over");
  });

  it("CONTROL — on a CLASH table the same AI seat DOES win (clash semantics unmoved)", () => {
    const state = withRichComputer(false);

    checkCustomWinConditions(state);

    expect(winnerOf(state)).toBe("p3");
    expect(state.phase).toBe("game-over");
    expect(wonReason(state)).toContain("reach 50 gold");
  });

  it("CONTROL — a co-op HUMAN meeting the same condition still wins immediately", () => {
    const state = withRichComputer(true);
    state.players.p2.resources.gold = 500;

    checkCustomWinConditions(state);

    expect(winnerOf(state)).toBe("p2");
    expect(wonReason(state)).toContain("reach 50 gold");
    expect(wonReason(state)).toMatch(/with their alliance/i);
  });
});

// ===========================================================================
// 6. The alliance wording is co-op only, and never doubled
// ===========================================================================

describe("co-op step 3 — the alliance win wording", () => {
  it("a co-op winner with NO living ally keeps the plain reason", () => {
    const state = game({
      coop: true,
      seats: 3,
      computers: ["p3"],
      seed: "coop-lone-human",
      conditions: [{ kind: "defeat-computers" }]
    });
    state.players.p2.eliminated = true;
    state.players.p3.eliminated = true;

    checkCustomWinConditions(state);

    expect(winnerOf(state)).toBe("p1");
    expect(wonReason(state), "no ally left to share it with").not.toMatch(/alliance/i);
  });

  it("the last-alliance-standing reason is never suffixed twice", () => {
    const state = game({ coop: true, seats: 3, computers: ["p3"], seed: "coop-no-double" });

    eliminatePlayer(state, "p3", "conquered", false);

    expect(wonReason(state)).toBe("the last alliance standing");
  });
});

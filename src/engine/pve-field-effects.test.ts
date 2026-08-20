import { describe, expect, it } from "vitest";

import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  registerCombatScriptDefinitions,
  NEUTRAL_PLAYER_ID,
  type GameAction,
  type GameEvent,
  type GameState
} from "./index";
import { beginFieldVisit, placeDungeonSite } from "./adventure";
import { pumpAdventureQueues } from "./adventure-reducer";
import { startAdventureRound } from "./adventure";
import {
  applyCombatScriptRoundStart,
  combatScriptsActiveForCombat,
  combatScriptStatDelta,
  pveEncounterScriptsForCombat
} from "./combat-scripts";
import { combatScriptsForLocation, combatScriptTimingLines } from "@/data/map/combat-scripts";
import {
  PVE_COMBAT_SCRIPT_DEFINITIONS,
  PVE_FLOOR_SCRIPT_IDS,
  PVE_LAIR_SCRIPT_IDS,
  pveEncounterScriptsFor,
  pveFloorBand
} from "@/data/anime/pve-combat-scripts";
import { startNeutralEncounter } from "./adventure-reducer";
import type { CombatState, CombatUnitState, MapFieldState, MapSpaceId, PlayerId } from "./state";

/**
 * PvE field effects (dungeon/raid-boss variant expansion §E) — the two NEW
 * script effect kinds (`side-heal`, `random-obstacle`) and the encounter-scoped
 * selector `pveEncounterScriptsForCombat`. Every claim asserts the observable
 * outcome (damage healed / obstacles placed / an attack value that moved) with a
 * CONTROL that discriminates the rule; the non-PvE path is pinned byte-silent.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

// ---------------------------------------------------------------------------
// Test-registered scripts for the two NEW effect kinds, keyed off real anime
// locations no shipped fight uses. No `requiresModule`, so they are always on.
// ---------------------------------------------------------------------------

const HEAL_BOSS_LOCATION = "anime.linh_tuyen";
const HEAL_ALL_LOCATION = "anime.ngo_dao_thach";
const OBSTACLE_LOCATION = "anime.dai_luyen_khi";

registerCombatScriptDefinitions({
  test_pve_heal_boss: {
    id: "test_pve_heal_boss",
    name: { en: "Mending (boss only)", vi: "Hàn Gắn (chỉ trùm)" },
    locationId: HEAL_BOSS_LOCATION,
    summary: "TEST: round 2 heals 1 damage on the LAYERED defender only.",
    events: [
      {
        at: "round-start",
        round: 2,
        announce: { en: "The field mends its keeper.", vi: "Chiến trường hàn gắn kẻ canh giữ." },
        effects: [{ kind: "side-heal", side: "defender", amount: 1, bossOnly: true }]
      }
    ]
  },
  test_pve_heal_all: {
    id: "test_pve_heal_all",
    name: { en: "Mending (whole side)", vi: "Hàn Gắn (cả phe)" },
    locationId: HEAL_ALL_LOCATION,
    summary: "TEST: round 2 heals 1 damage on EVERY living defender.",
    events: [
      {
        at: "round-start",
        round: 2,
        announce: { en: "The field mends the guards.", vi: "Chiến trường hàn gắn quân canh." },
        effects: [{ kind: "side-heal", side: "defender", amount: 1 }]
      }
    ]
  },
  test_pve_random_obstacles: {
    id: "test_pve_random_obstacles",
    name: { en: "Rubble", vi: "Đá Vụn" },
    locationId: OBSTACLE_LOCATION,
    summary: "TEST: round 2 drops 3 obstacles on random EMPTY spaces.",
    events: [
      {
        at: "round-start",
        round: 2,
        announce: { en: "Rubble scatters.", vi: "Đá vụn văng khắp nơi." },
        effects: [{ kind: "random-obstacle", count: 3 }]
      }
    ]
  }
});

// ---------------------------------------------------------------------------
// Harnesses
// ---------------------------------------------------------------------------

/** A difficulty-1 neutral guard fight for p1 on `location`, fully started. */
function guardFight(seed: string, location?: string): GameState {
  let state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  state.players.p1.hand = [];
  const hero = state.heroes.hero_p1;
  hero.movementPoints = 8;
  const field = Object.values(state.adventure!.fields).find(
    (candidate) => (candidate.difficulty ?? 0) > 0
  ) as MapFieldState;
  field.difficulty = 1;
  if (location) {
    field.location = location;
  }
  startNeutralEncounter(state, hero, field);
  const army = state.players.p1.army;
  state = apply(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: army[0].id, position: 13 });
  if (army[1]) {
    state = apply(state, { type: "PLACE_COMBAT_UNIT", playerId: "p1", armyUnitId: army[1].id, position: 14 });
  }
  state = apply(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
  if (state.combat?.pendingNeutralPlacement) {
    state = apply(state, {
      type: "FINISH_NEUTRAL_PLACEMENT",
      playerId: state.combat.pendingNeutralPlacement
    });
  }
  state.combat!.dice.scriptedRolls = Array(80).fill(0);
  state.combat!.dice.rollCount = 0;
  return state;
}

type Shape = {
  controller: PlayerId;
  position: number;
  maxHealth?: number;
  damage?: number;
  bossUnit?: true;
  armyStacks?: number;
  attack?: number;
  type?: CombatUnitState["type"];
};

function onlyUnits(state: GameState, shapes: Record<string, Shape>): Record<string, CombatUnitState> {
  const units: Record<string, CombatUnitState> = {};
  const made: Record<string, CombatUnitState> = {};
  for (const [handle, shape] of Object.entries(shapes)) {
    const id = `u_${handle}`;
    const unit: CombatUnitState = {
      id,
      controllerId: shape.controller,
      name: handle,
      cardName: handle,
      variant: "few",
      grade: "bronze",
      type: shape.type ?? "ground",
      attack: shape.attack ?? 0,
      defense: 0,
      maxHealth: shape.maxHealth ?? 30,
      damage: shape.damage ?? 0,
      initiative: 5,
      position: shape.position,
      activatedThisRound: false,
      movedThisActivation: false,
      retaliatedThisRound: false,
      defenseToken: false,
      abilities: [],
      ...(shape.bossUnit ? { bossUnit: true as const } : {}),
      ...(shape.armyStacks !== undefined ? { armyStacks: shape.armyStacks } : {})
    };
    units[id] = unit;
    made[handle] = unit;
  }
  state.combat!.units = units;
  state.combat!.obstacles = [];
  return made;
}

function scriptEvents(state: GameState, scriptId?: string) {
  return state.eventLog.filter(
    (event): event is Extract<GameEvent, { type: "COMBAT_SCRIPT_TRIGGERED" }> =>
      event.type === "COMBAT_SCRIPT_TRIGGERED" && (scriptId ? event.scriptId === scriptId : true)
  );
}

/** A WOG Dungeon game with the site carved under p1's hero. */
function dungeonGame(seed: string, options: Record<string, unknown> = {}): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    creatureBanks: true,
    wog: { enabled: true, dungeon: true },
    ...options
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.adventure!.rewardQueue = [];
  state.adventure!.pendingVisit = null;
  state.pendingChoice = null;
  return state;
}

function firstPendingVisitStep(state: GameState) {
  return state.adventure?.pendingVisit?.steps[0];
}

function placeSiteUnderHero(state: GameState): MapSpaceId {
  const field = Object.values(state.adventure!.fields).find(
    (candidate) => candidate.location !== "town" && !candidate.difficulty
  )!;
  placeDungeonSite(state, field.spaceId);
  state.heroes.hero_p1.spaceId = field.spaceId;
  return field.spaceId;
}

/** Delve the current floor through an auto-resolving door; the den fight opens. */
function delveFloor(state: GameState, fieldId: MapSpaceId): GameState {
  beginFieldVisit(state, state.heroes.hero_p1.id, fieldId, false);
  const menu = state.adventure!.pendingVisit?.steps[0];
  if (menu?.type !== "CHOOSE_ONE") {
    throw new Error("expected the door menu");
  }
  // Skip the rooms that PAUSE (a PAY_TO or a nested CHOOSE_ONE — the shrine and
  // the §F4 forge). Detected STRUCTURALLY, not by label, so a new room cannot
  // silently break this helper.
  const pick = menu.options.findIndex(
    (option, index) =>
      index < 2 && !option.steps.some((step) => step.type === "PAY_TO" || step.type === "CHOOSE_ONE")
  );
  expect(pick).toBeGreaterThanOrEqual(0);
  const after = apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: pick });
  expect(after.combat, "expected the den fight to open").toBeTruthy();
  return after;
}

/** Place one unit and finish setup so the floor army reveals and scripts fire. */
function revealFloorArmy(state: GameState): GameState {
  const placement = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
  expect(placement, "expected a unit placement offer").toBeTruthy();
  let next = apply(state, placement!.action);
  next = apply(next, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
  return next;
}

/** A raid game whose round-5 lair holds `defId`, with the fight opened + started. */
function lairFight(seed: string, defId: string): GameState {
  const state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    wog: { enabled: true, raidBosses: true }
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.adventure!.rewardQueue = [];
  state.adventure!.pendingVisit = null;
  state.pendingChoice = null;
  state.round = 5;
  startAdventureRound(state);
  pumpAdventureQueues(state);
  const entries = Object.entries(state.adventure!.raidBosses ?? {});
  expect(entries.length, "expected the scheduled boss to spawn").toBe(1);
  const [instanceId, record] = entries[0];
  // Pin WHICH boss lairs here so the per-boss script selection is under test.
  record.defId = defId;
  const hero = state.heroes.hero_p1;
  state.adventure!.lastVisitedField[hero.id] = hero.spaceId!;
  hero.spaceId = record.fieldId;
  beginFieldVisit(state, hero.id, record.fieldId, false);
  // Read through a helper: TypeScript otherwise retains the `null` narrowing
  // from the reset above across the mutating beginFieldVisit call.
  expect(firstPendingVisitStep(state)?.type).toBe("CHOOSE_ONE");
  let fight = apply(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: 0 });
  expect(fight.combat?.context.kind).toBe("neutral");
  expect((fight.combat!.context as { raidBossId?: string }).raidBossId).toBe(instanceId);
  fight = revealFloorArmy(fight);
  return fight;
}

// ---------------------------------------------------------------------------
// The two NEW effect kinds
// ---------------------------------------------------------------------------

describe("PvE field effects — side-heal", () => {
  it("heals the LAYERED defender by 1, never its armyStacks, and never the escort when bossOnly", () => {
    const state = guardFight("side-heal-boss", HEAL_BOSS_LOCATION);
    const units = onlyUnits(state, {
      hero: { controller: "p1", position: 13 },
      boss: { controller: NEUTRAL_PLAYER_ID, position: 1, maxHealth: 6, damage: 3, bossUnit: true, armyStacks: 2 },
      escort: { controller: NEUTRAL_PLAYER_ID, position: 2, maxHealth: 6, damage: 3 }
    });
    state.combat!.round = 2;
    applyCombatScriptRoundStart(state);

    expect(units.boss.damage, "the boss body mended 1").toBe(2);
    expect(units.boss.armyStacks, "a shed health BAR is never restored").toBe(2);
    expect(units.escort.damage, "bossOnly really excludes the escort").toBe(3);
    expect(scriptEvents(state, "test_pve_heal_boss").length).toBe(1);
  });

  it("CONTROL: without bossOnly the whole side mends; an undamaged unit and the ATTACKER side are untouched", () => {
    const state = guardFight("side-heal-all", HEAL_ALL_LOCATION);
    const units = onlyUnits(state, {
      hero: { controller: "p1", position: 13, maxHealth: 6, damage: 3 },
      boss: { controller: NEUTRAL_PLAYER_ID, position: 1, maxHealth: 6, damage: 3, bossUnit: true },
      escort: { controller: NEUTRAL_PLAYER_ID, position: 2, maxHealth: 6, damage: 3 },
      fresh: { controller: NEUTRAL_PLAYER_ID, position: 3, maxHealth: 6, damage: 0 }
    });
    state.combat!.round = 2;
    applyCombatScriptRoundStart(state);

    expect(units.boss.damage).toBe(2);
    expect(units.escort.damage, "the escort mends too without bossOnly").toBe(2);
    expect(units.fresh.damage, "an unwounded unit cannot go negative").toBe(0);
    expect(units.hero.damage, "the ATTACKER side is never touched by a defender heal").toBe(3);
  });

  it("CONTROL: the wrong round fires nothing at all", () => {
    const state = guardFight("side-heal-round", HEAL_BOSS_LOCATION);
    const units = onlyUnits(state, {
      hero: { controller: "p1", position: 13 },
      boss: { controller: NEUTRAL_PLAYER_ID, position: 1, maxHealth: 6, damage: 3, bossUnit: true }
    });
    state.combat!.round = 3;
    applyCombatScriptRoundStart(state);
    expect(units.boss.damage).toBe(3);
    expect(scriptEvents(state, "test_pve_heal_boss").length).toBe(0);
  });
});

describe("PvE field effects — random-obstacle", () => {
  function runObstacles(seed: string): number[] {
    const state = guardFight(seed, OBSTACLE_LOCATION);
    onlyUnits(state, {
      hero: { controller: "p1", position: 13 },
      guard: { controller: NEUTRAL_PLAYER_ID, position: 1 }
    });
    state.combat!.round = 2;
    applyCombatScriptRoundStart(state);
    return [...(state.combat!.obstacles ?? [])];
  }

  it("places exactly `count` obstacles on EMPTY board cells and is deterministic per fight", () => {
    const placed = runObstacles("obstacles-a");
    expect(placed.length, "exactly the requested count").toBe(3);
    for (const cell of placed) {
      expect(cell, `cell ${cell} is on the board`).toBeGreaterThanOrEqual(0);
      expect(cell).toBeLessThan(20);
    }
    // Never on an occupied space (the two living units stand on 13 and 1).
    expect(placed).not.toContain(13);
    expect(placed).not.toContain(1);
    expect(new Set(placed).size, "no duplicates").toBe(3);

    // Deterministic: the identical fight re-run lands on the identical cells.
    expect(runObstacles("obstacles-a")).toEqual(placed);
    // …and it is a real RANDOM pick, not a fixed cell list: some other fight
    // (different combat dice seed) lands somewhere else.
    const others = ["obstacles-b", "obstacles-c", "obstacles-d", "obstacles-e"].map(runObstacles);
    expect(
      others.some((run) => JSON.stringify(run) !== JSON.stringify(placed)),
      "the placement varies across fights"
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The encounter-scoped selector
// ---------------------------------------------------------------------------

describe("PvE field effects — encounter-scoped selection", () => {
  it("every shipped PvE script is scope-tagged and therefore invisible to the LOCATION path", () => {
    for (const script of Object.values(PVE_COMBAT_SCRIPT_DEFINITIONS)) {
      expect(script.scope, script.id).toBe("pve-encounter");
      expect(script.locationId, script.id).toBeUndefined();
      expect(script.events.length, script.id).toBeGreaterThan(0);
      expect(script.summary.length, script.id).toBeGreaterThan(0);
    }
    // The two ids every rift lair / dungeon floor would otherwise collide on.
    expect(combatScriptsForLocation("rift_lair")).toEqual([]);
    expect(combatScriptsForLocation("dungeon_gate")).toEqual([]);
  });

  it("the floor band changes with depth: 1–3 shallow, 4–7 deep, 8–10 abyss", () => {
    expect([1, 2, 3].map(pveFloorBand)).toEqual(["shallow", "shallow", "shallow"]);
    expect([4, 5, 6, 7].map(pveFloorBand)).toEqual(["deep", "deep", "deep", "deep"]);
    expect([8, 9, 10].map(pveFloorBand)).toEqual(["abyss", "abyss", "abyss"]);
  });

  it("a dungeon floor picks its theme's band script; a wave assault picks NOTHING", () => {
    const state = guardFight("selector-floor");
    const context = state.combat!.context as { dungeonFloor?: number; waveAssault?: { wave: number } };

    context.dungeonFloor = 2;
    expect(pveEncounterScriptsForCombat(state, state.combat!).map((script) => script.id)).toEqual([
      "pve_dungeon_classic_shallow"
    ]);
    context.dungeonFloor = 6;
    expect(pveEncounterScriptsForCombat(state, state.combat!).map((script) => script.id)).toEqual([
      "pve_dungeon_classic_deep"
    ]);
    context.dungeonFloor = 9;
    expect(pveEncounterScriptsForCombat(state, state.combat!).map((script) => script.id)).toEqual([
      "pve_dungeon_classic_abyss"
    ]);

    // The frozen DOOM theme swaps the whole ladder.
    state.adventure!.pveTheme = "doom";
    context.dungeonFloor = 2;
    expect(pveEncounterScriptsForCombat(state, state.combat!).map((script) => script.id)).toEqual([
      "pve_dungeon_doom_shallow"
    ]);

    // CONTROL: a wave assault is a PvE encounter but gets nothing here.
    delete context.dungeonFloor;
    context.waveAssault = { wave: 3 };
    expect(pveEncounterScriptsForCombat(state, state.combat!)).toEqual([]);
  });

  it("a rift lair picks the script of the boss actually lairing there", () => {
    const state = guardFight("selector-lair");
    const context = state.combat!.context as { raidBossId?: string };
    context.raidBossId = "inst_1";
    state.adventure!.raidBosses = {
      inst_1: { defId: "abyss_kraken", fieldId: "x", layersLeft: 4, layerBreaks: {}, spawnedRound: 5 }
    };
    expect(pveEncounterScriptsForCombat(state, state.combat!).map((script) => script.id)).toEqual([
      "pve_lair_flooded"
    ]);

    // A DIFFERENT boss in the same lair slot gets its OWN script…
    state.adventure!.raidBosses.inst_1.defId = "calamity_dragon";
    expect(pveEncounterScriptsForCombat(state, state.combat!).map((script) => script.id)).toEqual([
      "pve_lair_ash_storm"
    ]);
    // …and a boss with no entry fights clean (CONTROL).
    state.adventure!.raidBosses.inst_1.defId = "goblin_king";
    expect(pveEncounterScriptsForCombat(state, state.combat!)).toEqual([]);
  });

  it("CONTROL: a plain neutral guard fight selects nothing — the location path is untouched", () => {
    const state = guardFight("selector-plain");
    expect(pveEncounterScriptsForCombat(state, state.combat!)).toEqual([]);
    expect(combatScriptsActiveForCombat(state, state.combat!)).toEqual([]);
    expect(state.combat!.combatScripts).toBeUndefined();
    expect(scriptEvents(state)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: a real lair fight and a real dungeon floor fire their scripts
// ---------------------------------------------------------------------------

describe("PvE field effects — end to end", () => {
  it("a REAL Abyss Kraken lair fight applies the Flooded Lair environment to GROUND attackers only", () => {
    const state = lairFight("e2e-lair", "abyss_kraken");
    expect(scriptEvents(state, "pve_lair_flooded").length, "the lair script fired").toBe(1);
    const combat = state.combat as CombatState;
    const attacker = Object.values(combat.units).find((unit) => unit.controllerId === "p1");
    expect(attacker, "the fighter has a unit on the board").toBeTruthy();
    attacker!.type = "ground";
    expect(combatScriptStatDelta(combat, attacker!, "attack"), "ground attackers are fouled").toBe(-1);
    attacker!.type = "flying";
    expect(combatScriptStatDelta(combat, attacker!, "attack"), "CONTROL: flying is not").toBe(0);
    // CONTROL: the guards' own side is never penalised.
    const guard = Object.values(combat.units).find((unit) => unit.controllerId === NEUTRAL_PLAYER_ID);
    expect(guard).toBeTruthy();
    guard!.type = "ground";
    expect(combatScriptStatDelta(combat, guard!, "attack")).toBe(0);
  });

  it("CONTROL: a lair holding a boss with NO script fires nothing", () => {
    const state = lairFight("e2e-lair-clean", "goblin_king");
    expect(scriptEvents(state).length).toBe(0);
    expect(state.combat!.combatScripts?.statModifiers ?? []).toEqual([]);
  });

  it("a REAL dungeon floor-1 fight announces the shallow band; floor 4 fouls RANGED shots", () => {
    const shallow = dungeonGame("e2e-floor-1");
    const fieldId = placeSiteUnderHero(shallow);
    const shallowFight = revealFloorArmy(delveFloor(shallow, fieldId));
    expect(
      scriptEvents(shallowFight, "pve_dungeon_classic_shallow").length,
      "the shallow band announced itself"
    ).toBe(1);
    // Shallow is pure flavour at combat-start: no stat modifier at all.
    expect(shallowFight.combat!.combatScripts?.statModifiers ?? []).toEqual([]);

    const deep = dungeonGame("e2e-floor-4");
    const deepField = placeSiteUnderHero(deep);
    deep.players.p1.dungeonFloor = 4;
    const deepFight = revealFloorArmy(delveFloor(deep, deepField));
    expect(scriptEvents(deepFight, "pve_dungeon_classic_deep").length).toBe(1);
    const combat = deepFight.combat as CombatState;
    const attacker = Object.values(combat.units).find((unit) => unit.controllerId === "p1");
    expect(attacker).toBeTruthy();
    attacker!.type = "ranged";
    expect(combatScriptStatDelta(combat, attacker!, "attack"), "low ceilings foul the shots").toBe(-1);
    attacker!.type = "ground";
    expect(combatScriptStatDelta(combat, attacker!, "attack"), "CONTROL: melee is unaffected").toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §E presentation — the PURE query the pre-fight menus and the in-fight
// indicator read (the engine selector delegates to it).
// ---------------------------------------------------------------------------

describe("PvE field effects — the pure encounter query (§E presentation)", () => {
  it("returns exactly the band's / boss's shipped scripts, each with a real summary", () => {
    for (const theme of ["classic", "doom"] as const) {
      for (const [band, floor] of [
        ["shallow", 2],
        ["deep", 6],
        ["abyss", 9]
      ] as const) {
        expect(pveFloorBand(floor)).toBe(band);
        const scripts = pveEncounterScriptsFor({ theme, dungeonFloor: floor });
        expect(scripts.map((script) => script.id), `${theme}/${band}`).toEqual([
          ...PVE_FLOOR_SCRIPT_IDS[theme][band]
        ]);
        for (const script of scripts) {
          expect(script.summary.length, script.id).toBeGreaterThan(20);
          // Every event is explained by exactly one timing line.
          expect(combatScriptTimingLines(script)).toHaveLength(script.events.length);
        }
      }
    }
    for (const [bossDefId, ids] of Object.entries(PVE_LAIR_SCRIPT_IDS)) {
      expect(pveEncounterScriptsFor({ theme: "classic", bossDefId }).map((script) => script.id)).toEqual([
        ...ids
      ]);
    }
  });

  it("the LIVE combat selector agrees with the pure query — and both are empty off-encounter (CONTROL)", () => {
    const state = dungeonGame("pure-query-parity");
    const fieldId = placeSiteUnderHero(state);
    state.players.p1.dungeonFloor = 6;
    const fought = delveFloor(state, fieldId);
    expect(combatScriptsActiveForCombat(fought, fought.combat!).map((script) => script.id)).toEqual(
      pveEncounterScriptsFor({ theme: "classic", dungeonFloor: 6 }).map((script) => script.id)
    );
    expect(pveEncounterScriptsFor({ theme: "classic" })).toEqual([]);
    expect(pveEncounterScriptsFor({ theme: "classic", bossDefId: "not_a_boss" })).toEqual([]);
  });

  it("a timing line names WHEN an event fires and repeats its announcement", () => {
    const script = PVE_COMBAT_SCRIPT_DEFINITIONS.pve_dungeon_classic_shallow;
    const lines = combatScriptTimingLines(script);
    expect(lines[0]).toBe(`At combat start — ${script.events[0].announce.en}`);
    expect(lines[1]).toBe(`Round 3 — ${script.events[1].announce.en}`);
  });
});

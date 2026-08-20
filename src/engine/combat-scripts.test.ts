import { describe, expect, it } from "vitest";
import {
  applyAction,
  applyCombatScriptCombatStart,
  combatScriptStatDelta,
  createAdventureGameState,
  createInitialGameState,
  DEFAULT_ANIME_OPTIONS,
  listCombatScriptDefinitions,
  NEUTRAL_PLAYER_ID,
  registerCombatScriptDefinitions,
  standardComputerController
} from "./index";
import { startNeutralEncounter } from "./adventure-reducer";
import { getLegalMoveDestinations } from "./legal-actions";
import { neutralCombatControllerId } from "./neutral-control";
import { parallelSlotSignature } from "./parallel-turns";
import type {
  AnimeModOptions,
  CombatContext,
  CombatState,
  CombatUnitState,
  GameAction,
  GameEvent,
  GameState,
  PlayerId,
  UnitType
} from "./state";
import { driveComputerPlayers } from "../server/computer-runner";
import { ANIME_COMBAT_SCRIPT_DEFINITIONS } from "@/data/anime/combat-scripts";
import { locationDefinitions } from "@/data/map/locations";
import { formatEvent } from "@/components/table/utils";

/**
 * Forced Battle Events (Anime mod, §3.12) — a scripted-combat system. Mechanism
 * is CORE (`src/data/map/combat-scripts.ts` registry + `src/engine/combat-scripts.ts`
 * hook); content is a package (`src/data/anime/combat-scripts.ts`). V1 is FULLY
 * AUTOMATIC — no new player windows. Every claim below is mutation-checked with a
 * CONTROL (module-off / wrong-round / non-scripted / melee / PvP / sandbox).
 */

// ---------------------------------------------------------------------------
// Test-registered scripts — exercise the generic mechanism beyond the shipped
// Bí Cảnh content (defense-stat + obstacles), keyed off distinct real anime
// locations no other fight uses.
// ---------------------------------------------------------------------------

const DEFENSE_LOCATION = "anime.linh_tuyen";
const OBSTACLE_LOCATION = "anime.ngo_dao_thach";
const OBSTACLE_CELLS = [1, 4, 9];

registerCombatScriptDefinitions({
  test_arena_defense: {
    id: "test_arena_defense",
    name: { en: "Warding Field", vi: "Trận Hộ Vệ (kiểm thử)" },
    locationId: DEFENSE_LOCATION,
    requiresModule: "enabled",
    summary: "TEST: +3 Defense to the defender (Neutral) side for the whole combat.",
    events: [
      {
        at: "combat-start",
        announce: { en: "A warding field hardens the guards (+3 Defense).", vi: "Trận hộ vệ tăng phòng thủ." },
        effects: [{ kind: "environment-stat", side: "defender", stat: "defense", amount: 3 }]
      }
    ]
  },
  test_arena_obstacles: {
    id: "test_arena_obstacles",
    name: { en: "Rockfall", vi: "Đá Lở (kiểm thử)" },
    locationId: OBSTACLE_LOCATION,
    requiresModule: "enabled",
    summary: "TEST: pre-place Combat Obstacles at combat start.",
    events: [
      {
        at: "combat-start",
        announce: { en: "A rockfall blocks the arena.", vi: "Đá lở chặn đấu trường." },
        effects: [{ kind: "place-obstacles", cells: OBSTACLE_CELLS }]
      }
    ]
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/**
 * Opens a difficulty-1 neutral guard fight for `fighter` on a chosen field
 * location (defaults to the field's own, non-scripted, location). Anime is
 * enabled when requested. Returns the running combat AFTER finalizeCombatStart —
 * so a scripted combat-start event has already fired.
 */
function fightWithGuards(
  seed: string,
  opts: {
    anime?: boolean;
    animeOverrides?: Partial<AnimeModOptions>;
    location?: string;
    fighter?: PlayerId;
    players?: 2 | 3;
    pvpNeutralControl?: boolean;
    difficulty?: number;
  } = {}
): GameState {
  const anime = opts.anime ? { ...DEFAULT_ANIME_OPTIONS, enabled: true, ...opts.animeOverrides } : undefined;
  let state = createAdventureGameState({
    seed,
    difficulty: "normal",
    rollFirstPlayer: false,
    ...(anime ? { anime } : {}),
    ...(opts.pvpNeutralControl ? { pvpNeutralControl: true } : {}),
    ...(opts.players === 3 ? { players: THREE_PLAYERS } : {})
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  const fighter = opts.fighter ?? "p1";
  state.activePlayerId = fighter;
  state.players[fighter].hand = [];
  const hero = state.heroes[`hero_${fighter}`];
  hero.movementPoints = 8;
  const field = Object.values(state.adventure!.fields).find((candidate) => (candidate.difficulty ?? 0) > 0);
  expect(field, "the map should hold at least one guarded field").toBeTruthy();
  field!.difficulty = opts.difficulty ?? 1;
  if (opts.location) {
    field!.location = opts.location;
  }
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
  // Human-controlled Neutral armies pause for their own formation step even
  // with one difficulty-I guard. This helper promises a fully started combat,
  // so explicitly ready that controller before checking combat-start scripts.
  if (state.combat?.pendingNeutralPlacement) {
    state = applyOk(state, {
      type: "FINISH_NEUTRAL_PLACEMENT",
      playerId: state.combat.pendingNeutralPlacement
    });
  }
  state.combat!.dice.scriptedRolls = Array(60).fill(0);
  state.combat!.dice.rollCount = 0;
  return state;
}

function guardsOf(state: GameState): CombatUnitState[] {
  return Object.values(state.combat!.units).filter((unit) => unit.controllerId === NEUTRAL_PLAYER_ID);
}

function playerUnitsOf(state: GameState, playerId: PlayerId): CombatUnitState[] {
  return Object.values(state.combat!.units).filter((unit) => unit.controllerId === playerId);
}

function reshape(
  unit: CombatUnitState,
  shape: {
    type?: UnitType;
    position: number;
    initiative?: number;
    attack?: number;
    defense?: number;
    maxHealth?: number;
  }
): CombatUnitState {
  unit.type = shape.type ?? "ground";
  unit.position = shape.position;
  unit.initiative = shape.initiative ?? unit.initiative;
  unit.attack = shape.attack ?? 1;
  unit.defense = shape.defense ?? 0;
  unit.maxHealth = shape.maxHealth ?? 50;
  unit.damage = 0;
  unit.abilities = [];
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

function scriptEvents(
  state: GameState,
  scriptId?: string
): Extract<GameEvent, { type: "COMBAT_SCRIPT_TRIGGERED" }>[] {
  return state.eventLog.filter(
    (event): event is Extract<GameEvent, { type: "COMBAT_SCRIPT_TRIGGERED" }> =>
      event.type === "COMBAT_SCRIPT_TRIGGERED" && (scriptId ? event.scriptId === scriptId : true)
  );
}

/** Hand-set a clean activation for `attackerId` so a single ATTACK_UNIT resolves. */
function prepAttack(state: GameState, attackerId: string, playerId: PlayerId): void {
  const combat = state.combat!;
  combat.activeUnitId = attackerId;
  combat.setup = null;
  combat.pendingNeutralStep = null;
  combat.awaitingContinue = false;
  combat.dice.scriptedRolls = Array(20).fill(0);
  combat.dice.rollCount = 0;
  state.activePlayerId = playerId;
  state.phase = "combat";
  state.pendingChoice = null;
  state.reactionWindow = null;
  const attacker = combat.units[attackerId];
  attacker.activatedThisRound = false;
  attacker.reactionPauseAcked = true;
  attacker.preActivationWindowOffered = true;
}

/** The attack VALUE of a specific attacker's own strike (never its retaliation). */
function attackValueOf(state: GameState, attackerId: string): number {
  const rolled = state.eventLog.find(
    (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> =>
      event.type === "ATTACK_ROLLED" && !event.isRetaliation && event.attackerId === attackerId
  );
  if (!rolled) {
    throw new Error(`${attackerId} did not roll an attack`);
  }
  return rolled.attackValue;
}

/** The attacker's resolved attack VALUE for a single strike (dice scripted 0). */
function scriptedAttackValue(opts: { anime: boolean; location?: string; attackerType: UnitType }): number {
  const state = fightWithGuards(`env-${opts.location ?? "plain"}-${opts.attackerType}-${opts.anime}`, {
    anime: opts.anime,
    location: opts.location
  });
  const guard = reshape(guardsOf(state)[0], { position: 5, initiative: 1, attack: 1 });
  const attacker = reshape(playerUnitsOf(state, "p1")[0], {
    type: opts.attackerType,
    position: 9,
    initiative: 99,
    attack: 5
  });
  onlyUnits(state, [guard, attacker]);
  prepAttack(state, attacker.id, "p1");
  // The attack (and its auto-retaliation) resolve synchronously — read the
  // attacker's own ATTACK_ROLLED without driving the fight further.
  const after = applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: attacker.id,
    defenderId: guard.id
  });
  return attackValueOf(after, attacker.id);
}

/** The damage a single ATTACK_UNIT deals to a defense-2 guard (dice scripted 0). */
function guardDamageAfterAttack(opts: { location?: string }): number {
  const state = fightWithGuards(`def-${opts.location ?? "plain"}`, { anime: true, location: opts.location });
  const guard = reshape(guardsOf(state)[0], { position: 5, initiative: 1, attack: 1, defense: 2 });
  const attacker = reshape(playerUnitsOf(state, "p1")[0], {
    type: "ground",
    position: 9,
    initiative: 99,
    attack: 8
  });
  onlyUnits(state, [guard, attacker]);
  prepAttack(state, attacker.id, "p1");
  const after = applyOk(state, {
    type: "ATTACK_UNIT",
    playerId: "p1",
    attackerId: attacker.id,
    defenderId: guard.id
  });
  return after.combat!.units[guard.id].damage;
}

/** Drives a normal (AI-guard) neutral fight through round 1 to the continue window. */
function driveToAwaitingContinue(state: GameState): GameState {
  let current = state;
  let safety = 60;
  while (safety-- > 0) {
    const combat = current.combat;
    if (!combat || combat.outcome || combat.awaitingContinue) {
      return current;
    }
    if (current.reactionWindow) {
      current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
      continue;
    }
    const pause = combat.pendingNeutralStep;
    if (pause) {
      current = applyOk(current, {
        type: "CONTINUE_NEUTRAL_STEP",
        playerId: pause.reactingPlayerId ?? combat.attackerPlayerId
      });
      continue;
    }
    const choice = current.pendingChoice;
    if (choice?.type === "ATTACK_DIE_REROLL") {
      current = applyOk(current, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: choice.playerId,
        choiceId: choice.id,
        candidateIndex: 0
      });
      continue;
    }
    if (choice) {
      break;
    }
    const active = combat.activeUnitId ? combat.units[combat.activeUnitId] : null;
    if (active && active.controllerId === "p1" && !active.activatedThisRound) {
      current = applyOk(current, { type: "DEFEND_UNIT", playerId: "p1", unitId: active.id });
      continue;
    }
    break;
  }
  return current;
}

// ---------------------------------------------------------------------------
// Registry hygiene
// ---------------------------------------------------------------------------

describe("Forced Battle Events — registry hygiene", () => {
  const KNOWN_EFFECT_KINDS = new Set(["environment-stat", "damage-pulse", "place-obstacles", "announce"]);

  it("shipped anime scripts: unique ids, resolving locations, bilingual names, known effect kinds", () => {
    const shipped = Object.values(ANIME_COMBAT_SCRIPT_DEFINITIONS);
    expect(shipped.length).toBeGreaterThan(0);
    const ids = shipped.map((script) => script.id);
    expect(new Set(ids).size, "ids are unique").toBe(ids.length);

    for (const script of shipped) {
      expect(script.id, `${script.id} matches its registry key`).toBe(
        ANIME_COMBAT_SCRIPT_DEFINITIONS[script.id].id
      );
      // A location-keyed (unscoped) script must name a real location; only a
      // `scope: "pve-encounter"` script may omit it.
      expect(script.locationId, `${script.id} names a location`).toBeTruthy();
      expect(
        locationDefinitions[script.locationId ?? ""],
        `${script.id} → ${script.locationId} resolves`
      ).toBeTruthy();
      expect(script.name.en.length, `${script.id} EN name`).toBeGreaterThan(0);
      expect(script.name.vi.length, `${script.id} VI name`).toBeGreaterThan(0);
      expect(script.events.length, `${script.id} has events`).toBeGreaterThan(0);
      for (const event of script.events) {
        expect(event.announce.en.length).toBeGreaterThan(0);
        expect(event.announce.vi.length).toBeGreaterThan(0);
        if (event.at === "round-start") {
          expect(event.round ?? 0, `${script.id} round-start needs a round`).toBeGreaterThanOrEqual(1);
        }
        for (const effect of event.effects) {
          expect(KNOWN_EFFECT_KINDS.has(effect.kind), `${script.id} effect kind ${effect.kind}`).toBe(true);
        }
      }
    }
  });

  it("ships the two Bí Cảnh scripts on anime.bi_canh (mist combat-start + surge round-2)", () => {
    const mist = ANIME_COMBAT_SCRIPT_DEFINITIONS.bi_canh_spirit_mist;
    const surge = ANIME_COMBAT_SCRIPT_DEFINITIONS.bi_canh_earthvein_surge;
    expect(mist.locationId).toBe("anime.bi_canh");
    expect(surge.locationId).toBe("anime.bi_canh");
    expect(mist.events[0].at).toBe("combat-start");
    expect(mist.events[0].effects[0]).toMatchObject({ kind: "environment-stat", unitType: "ranged", amount: -1 });
    expect(surge.events[0].at).toBe("round-start");
    expect(surge.events[0].round).toBe(2);
    expect(surge.events[0].effects[0]).toMatchObject({ kind: "damage-pulse", side: "attacker", amount: 1 });
  });

  it("the whole registry keeps unique ids (shipped + test-registered)", () => {
    const ids = listCombatScriptDefinitions().map((script) => script.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// Mechanism: when scripts fire, once, on the right round, gated
// ---------------------------------------------------------------------------

describe("Forced Battle Events — mechanism", () => {
  it("fires the combat-start environment ONCE, and the round-2 pulse EXACTLY on round 2", () => {
    const state = fightWithGuards("mech-bi-canh", { anime: true, location: "anime.bi_canh" });
    const guard = reshape(guardsOf(state)[0], { position: 0, initiative: 1, attack: 1 });
    const units = playerUnitsOf(state, "p1");
    expect(units.length, "need two attacker units for the pulse cases").toBeGreaterThanOrEqual(2);
    const highHp = reshape(units[0], { position: 18, initiative: 99, maxHealth: 50 });
    const lowHp = reshape(units[1], { position: 19, initiative: 98, maxHealth: 1 });
    lowHp.variant = "few"; // a lethal pulse removes it (no Pack→Few flip)
    onlyUnits(state, [guard, highHp, lowHp]);

    const round1 = driveToAwaitingContinue(state);
    // Combat-start mist fired ONCE; the round-2 surge has NOT fired (wrong-round CONTROL).
    expect(round1.combat!.round).toBe(1);
    expect(round1.combat!.awaitingContinue).toBe(true);
    expect(scriptEvents(round1, "bi_canh_spirit_mist").length).toBe(1);
    expect(scriptEvents(round1, "bi_canh_earthvein_surge").length).toBe(0);
    // No round-1 chip damage, so the pulse is isolated.
    expect(round1.combat!.units[highHp.id].damage).toBe(0);

    // Continue into round 2 → the surge fires exactly once, at round-start round 2.
    const round2 = applyOk(round1, { type: "CONTINUE_NEUTRAL_COMBAT", playerId: "p1" });
    expect(round2.combat!.round).toBe(2);
    const surge = scriptEvents(round2, "bi_canh_earthvein_surge");
    expect(surge.length).toBe(1);
    expect(surge[0].at).toBe("round-start");
    expect(surge[0].round).toBe(2);
    // The combat-start mist did NOT re-fire, and its modifier was not duplicated.
    expect(scriptEvents(round2, "bi_canh_spirit_mist").length).toBe(1);
    expect(round2.combat!.combatScripts?.statModifiers?.length).toBe(1);
    expect(round2.combat!.combatScripts?.roundsFired).toEqual(expect.arrayContaining([1, 2]));

    // EFFECT: every attacker-side unit took 1; a 1-Health unit died via removal;
    // the Neutral guard is untouched.
    const combat = round2.combat!;
    expect(combat.units[highHp.id].damage).toBe(1);
    const low = combat.units[lowHp.id];
    expect(low === undefined || low.damage >= low.maxHealth, "1-HP unit removed").toBe(true);
    expect(round2.eventLog.some((event) => event.type === "UNIT_REMOVED" && event.unitId === lowHp.id)).toBe(true);
    expect(combat.units[guard.id].damage).toBe(0);
    const systemHits = round2.eventLog.filter(
      (event) => event.type === "DAMAGE_ASSIGNED" && event.damageKind === "effect" && event.source.type === "system"
    );
    expect(systemHits.length).toBe(2);
  });

  it("CONTROL: a non-scripted location fires nothing", () => {
    const state = fightWithGuards("mech-nonscripted", { anime: true }); // field keeps its plain location
    expect(scriptEvents(state).length).toBe(0);
    expect(state.combat!.combatScripts).toBeUndefined();
  });

  it("CONTROL: with the Anime module OFF, a Bí Cảnh fight fires nothing (otherwise identical)", () => {
    const off = fightWithGuards("mech-module-off", { anime: false, location: "anime.bi_canh" });
    expect(scriptEvents(off).length).toBe(0);
    expect(off.combat!.combatScripts).toBeUndefined();
    // The SAME field WITH the module on does fire — proving the gate is the difference.
    const on = fightWithGuards("mech-module-on", { anime: true, location: "anime.bi_canh" });
    expect(scriptEvents(on, "bi_canh_spirit_mist").length).toBe(1);
  });

  it("the combatEvents module gates the anime scripts (false = silent; absent/true = fires)", () => {
    // combatEvents: false disables the anime scripts even with the mod enabled.
    const off = fightWithGuards("mech-combatevents-off", {
      anime: true,
      location: "anime.bi_canh",
      animeOverrides: { combatEvents: false }
    });
    expect(scriptEvents(off).length).toBe(0);
    expect(off.combat!.combatScripts).toBeUndefined();

    // LEGACY SEMANTICS — an ABSENT combatEvents flag (old snapshot) still fires.
    const legacy = fightWithGuards("mech-combatevents-absent", {
      anime: true,
      location: "anime.bi_canh",
      animeOverrides: { combatEvents: undefined }
    });
    expect(legacy.anime?.combatEvents).toBeUndefined();
    expect(scriptEvents(legacy, "bi_canh_spirit_mist").length).toBe(1);

    // …and an explicit true fires — proving combatEvents is the only difference.
    const on = fightWithGuards("mech-combatevents-on", {
      anime: true,
      location: "anime.bi_canh",
      animeOverrides: { combatEvents: true }
    });
    expect(scriptEvents(on, "bi_canh_spirit_mist").length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Effects: environment-stat (attack + defense), obstacles
// ---------------------------------------------------------------------------

describe("Forced Battle Events — environment-stat", () => {
  it("Spirit Mist drops a RANGED unit's attack outcome by exactly 1; a melee unit is untouched", () => {
    expect(scriptedAttackValue({ anime: true, location: "anime.bi_canh", attackerType: "ranged" })).toBe(4); // 5 − 1
    expect(scriptedAttackValue({ anime: true, location: "anime.bi_canh", attackerType: "ground" })).toBe(5); // melee CONTROL
  });

  it("CONTROL: the ranged −1 does NOT apply with the module off, or on a non-scripted field", () => {
    expect(scriptedAttackValue({ anime: false, location: "anime.bi_canh", attackerType: "ranged" })).toBe(5);
    expect(scriptedAttackValue({ anime: true, attackerType: "ranged" })).toBe(5); // no location → non-scripted
  });

  it("a defender-side Defense buff reduces the damage taken by the delta", () => {
    expect(guardDamageAfterAttack({ location: DEFENSE_LOCATION })).toBe(3); // 8 − (2 + 3)
    expect(guardDamageAfterAttack({})).toBe(6); // CONTROL non-scripted: 8 − 2
  });
});

describe("Forced Battle Events — place-obstacles", () => {
  it("pre-places Combat Obstacles on empty cells that then block ground movement", () => {
    const state = fightWithGuards("obstacles-arena", { anime: true, location: OBSTACLE_LOCATION });
    const combat = state.combat!;
    const mover = reshape(playerUnitsOf(state, "p1")[0], { type: "ground", position: 5, initiative: 99 });
    // Deterministic occupancy: only the mover on the board, re-fire the injection.
    combat.units = { [mover.id]: mover };
    combat.obstacles = [];
    combat.combatScripts = undefined;
    applyCombatScriptCombatStart(state);

    // (a) The script injected its cells (all empty except the mover at 5).
    expect(combat.obstacles).toEqual(expect.arrayContaining(OBSTACLE_CELLS));

    // (b) An injected cell reachable WITHOUT the obstacle is blocked WITH it.
    const blocked = getLegalMoveDestinations(combat, mover, state);
    const free = getLegalMoveDestinations({ ...combat, obstacles: [] } as CombatState, mover, state);
    const blockedCell = OBSTACLE_CELLS.find((cell) => free.includes(cell));
    expect(blockedCell, "an injected cell must be reachable without the obstacle").toBeDefined();
    expect(blocked).not.toContain(blockedCell);
  });
});

// ---------------------------------------------------------------------------
// Scope: PvP / sandbox never fire; effects do not leak to a new combat
// ---------------------------------------------------------------------------

describe("Forced Battle Events — scope", () => {
  it("CONTROL: a PvP (player-vs-player) combat on the same field fires nothing", () => {
    const state = fightWithGuards("scope-pvp", { anime: true, location: "anime.bi_canh" });
    // The neutral combat already fired its combat-start mist — switch to a PvP
    // context and re-fire: it must add NO new event and stamp NO script state.
    const priorEvents = scriptEvents(state).length;
    expect(priorEvents).toBe(1);
    state.combat!.combatScripts = undefined;
    state.combat!.context = { kind: "player" } as unknown as CombatContext;
    applyCombatScriptCombatStart(state);
    expect(state.combat!.combatScripts, "PvP combat gets no script state").toBeUndefined();
    expect(scriptEvents(state).length, "PvP re-fire adds no new event").toBe(priorEvents);
  });

  it("CONTROL: a combat-sandbox fight fires nothing", () => {
    const state = createInitialGameState("scope-sandbox");
    expect(state.combat!.context.kind).toBe("sandbox");
    applyCombatScriptCombatStart(state);
    expect(state.combat!.combatScripts).toBeUndefined();
    expect(scriptEvents(state).length).toBe(0);
  });

  it("CONTROL: script effects do not leak into a fresh, non-scripted combat", () => {
    const scripted = fightWithGuards("scope-leak-1", { anime: true, location: "anime.bi_canh" });
    expect(scripted.combat!.combatScripts?.statModifiers?.length).toBe(1);
    const plain = fightWithGuards("scope-leak-2", { anime: true }); // non-scripted field
    expect(plain.combat!.combatScripts).toBeUndefined();
    expect(combatScriptStatDelta(plain.combat!, playerUnitsOf(plain, "p1")[0], "attack")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Cross-mode seams
// ---------------------------------------------------------------------------

describe("Forced Battle Events — cross-mode seams", () => {
  it("a computer seat fights a scripted neutral combat to completion without stalling", () => {
    const state = fightWithGuards("seam-drive", { anime: true, location: "anime.bi_canh", fighter: "p2" });
    // The mist fired at combat-start (before the runner touches anything).
    expect(scriptEvents(state, "bi_canh_spirit_mist").length).toBe(1);

    // Make p2 a computer with a one-blow win set up, then let the runner resolve it.
    state.controllers = { p2: standardComputerController() };
    const guard = reshape(guardsOf(state)[0], { position: 5, initiative: 1, attack: 1, maxHealth: 3 });
    const attacker = reshape(playerUnitsOf(state, "p2")[0], {
      type: "ground",
      position: 9,
      initiative: 99,
      attack: 30
    });
    onlyUnits(state, [guard, attacker]);
    state.combat!.activeUnitId = attacker.id;
    state.activePlayerId = "p2";
    state.combat!.dice.scriptedRolls = Array(60).fill(0);
    state.combat!.dice.rollCount = 0;

    const run = driveComputerPlayers(state);
    expect(run.stalled, run.reason).toBe(false);
    expect(
      run.state.eventLog.some((event) => event.type === "COMBAT_ENDED" && event.winnerPlayerId === "p2"),
      "the AI fought the scripted battle to a win"
    ).toBe(true);
  });

  it("a PvP-Neutral-Control scripted guard fight does not break", () => {
    const state = fightWithGuards("seam-pnc", {
      anime: true,
      location: "anime.bi_canh",
      players: 3,
      pvpNeutralControl: true
    });
    // The script fired, the fight is live, and the next-clockwise controller is assigned.
    expect(scriptEvents(state, "bi_canh_spirit_mist").length).toBe(1);
    expect(state.combat!.outcome).toBeNull();
    expect(neutralCombatControllerId(state, state.combat!)).toBe("p2");
  });

  it("firing a combat-start script does not disturb the parallel-turns bystander fingerprint", () => {
    const state = fightWithGuards("seam-parallel", { anime: true, location: "anime.bi_canh" });
    // Reset the combat-start application so we can re-fire and compare the fingerprint.
    state.combat!.combatScripts = undefined;
    const before = parallelSlotSignature(state);
    applyCombatScriptCombatStart(state);
    const after = parallelSlotSignature(state);
    const refired = state.combat!;
    expect(refired.combatScripts?.statModifiers?.length, "it really fired").toBe(1);
    expect(after, "…but the parallel bystander fingerprint is unchanged").toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Announce: the feed line renders
// ---------------------------------------------------------------------------

describe("Forced Battle Events — announce", () => {
  it("logs a bilingual COMBAT_SCRIPT_TRIGGERED that formatEvent renders", () => {
    const state = fightWithGuards("announce-bi-canh", { anime: true, location: "anime.bi_canh" });
    const mist = scriptEvents(state, "bi_canh_spirit_mist")[0];
    expect(mist).toBeTruthy();
    expect(mist.at).toBe("combat-start");
    expect(mist.message).toContain("Spirit Mist");
    expect(mist.messageVi ?? "").toContain("Linh Vụ");
    const rendered = formatEvent(mist, state);
    expect(rendered).toContain("Spirit Mist");
    expect(rendered.length).toBeGreaterThan(0);
  });
});

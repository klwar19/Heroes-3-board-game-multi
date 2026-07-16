import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { fortificationTargetId } from "./siege";
import type { CombatUnitState, GameAction, GameEvent, GameState, PlayerId, SiegeState } from "./state";

/**
 * House rule ("gold dragon / lich / hydra … can destroy the castle wall as like
 * attacking a unit"): during a SIEGE, the SECONDARY / SPLASH portion of a
 * multi-target attack fells the ENEMY's Walls / Gate that sit in its geometric
 * zone (one hit — a fortification has no HP, the same auto-success the Catapult
 * uses via `destroyFortification`). A DEFENDER's own splash must NEVER touch its
 * own walls — that is the CONTROL in every case. Keyed off the ability KIND
 * (SECOND_ATTACK_BEHIND_TARGET / _ADJACENT_TO_TARGET / _ONE_ADJACENT_TO_SELF /
 * _ALL_ADJACENT_TO_SELF and the Magog/Cerberi FLAT_DAMAGE_* splash), never a
 * unit name — so every sibling of each kind inherits it.
 *
 * Every assertion fails if the wiring in reducer.ts (the
 * `destroyEnemyFortificationsInCells` / `enemyFortificationsInCells` hooks) is
 * removed; each has a CONTROL where the fortification must stand.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** Drive past every reaction window and attack-die keep until the flow parks. */
function settle(state: GameState): GameState {
  let current = state;
  for (let guard = 0; guard < 60; guard += 1) {
    if (current.reactionWindow) {
      current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
      continue;
    }
    if (current.pendingChoice?.type === "ATTACK_DIE_REROLL") {
      current = applyOk(current, {
        type: "CHOOSE_PENDING_ROLL",
        playerId: current.pendingChoice.playerId,
        choiceId: current.pendingChoice.id,
        candidateIndex: 0
      });
      continue;
    }
    break;
  }
  return current;
}

function events<T extends GameEvent["type"]>(
  state: GameState,
  type: T
): Extract<GameEvent, { type: T }>[] {
  return state.eventLog.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
}

function wallStanding(state: GameState, position: number): boolean {
  return Boolean(state.combat?.siege?.walls.includes(position));
}

function setUnit(unit: CombatUnitState, patch: Partial<CombatUnitState>): void {
  Object.assign(unit, patch);
}

/**
 * A siege where p1 is the besieger and p2 owns the fortifications (unless
 * overridden). Hands, obstacles and stray unit abilities are cleared so the
 * assertions are purely about the walls and the chosen splash geometry.
 */
function siegeState(seed: string, siegeOverrides: Partial<SiegeState> = {}): GameState {
  const state = createInitialGameState(seed);
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.combat!.obstacles = [];
  // Park every unit off the fortification row; each test repositions what it needs.
  for (const unit of Object.values(state.combat!.units)) {
    setUnit(unit, { abilities: [], activatedThisRound: false, attackedThisActivation: false });
  }
  state.combat!.units.unit_p1_griffins.position = 0;
  state.combat!.units.unit_p1_crusaders.position = 3;
  state.combat!.units.unit_p2_dread_knights.position = 19;
  state.combat!.siege = {
    townPlayerId: "p2",
    walls: [8, 9, 10],
    gatePosition: 11,
    arrowTowerUnitId: null,
    ...siegeOverrides
  };
  state.combat!.dice.scriptedRolls = Array(24).fill(0);
  state.combat!.dice.rollCount = 0;
  return state;
}

function setActive(state: GameState, unitId: string, playerId: PlayerId = "p1"): void {
  state.activePlayerId = playerId;
  state.combat!.activeUnitId = unitId;
}

// ---------------------------------------------------------------------------
// Gold Dragon line breath (SECOND_ATTACK_BEHIND_TARGET) — automatic
// ---------------------------------------------------------------------------

describe("Gold Dragon line breath fells the Wall/Gate behind the target", () => {
  /**
   * Dragon (p1) at 17 attacks the enemy at 13; the cell directly behind (9, in a
   * straight column) holds a Wall. Board: 17=row4c1, 13=row3c1, 9=row2c1.
   */
  function dragonState(seed: string, siegeOverrides: Partial<SiegeState> = {}): GameState {
    const state = siegeState(seed, siegeOverrides);
    const dragon = state.combat!.units.unit_p1_marksmen;
    setUnit(dragon, { name: "Gold Dragons", cardName: "Gold Dragons", type: "ground", attack: 6, abilities: ["dragon-line-attack-2"], position: 17 });
    setUnit(state.combat!.units.unit_p2_skeletons, { type: "ground", defense: 1, maxHealth: 9, damage: 0, position: 13 });
    setUnit(state.combat!.units.unit_p2_vampires, { position: 4 });
    setActive(state, dragon.id);
    return state;
  }

  it("destroys ONLY the wall directly behind the target, no unit is behind", () => {
    let state = dragonState("gd-wall-behind");
    state = applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" });
    state = settle(state);

    // The behind cell (9) fell; the rest of the line (8, 10) and the Gate (11) stand.
    expect(wallStanding(state, 9)).toBe(false);
    expect(state.combat!.siege!.walls.sort((a, b) => a - b)).toEqual([8, 10]);
    expect(state.combat!.siege!.gatePosition).toBe(11);
    const felled = events(state, "FORTIFICATION_DESTROYED");
    expect(felled.some((e) => e.kind === "wall" && e.position === 9 && e.byUnitId === "unit_p1_marksmen")).toBe(true);
  });

  it("CONTROL: with no siege at all, the line breath fells nothing", () => {
    let state = dragonState("gd-no-siege");
    state.combat!.siege = null;
    state = applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" });
    state = settle(state);
    expect(events(state, "FORTIFICATION_DESTROYED")).toHaveLength(0);
  });

  it("CONTROL: when the behind cell is not a fortification, nothing is felled", () => {
    // Wall 9 removed from the line: the behind cell (9) is now empty.
    let state = dragonState("gd-empty-behind", { walls: [8, 10] });
    state = applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" });
    state = settle(state);
    expect(state.combat!.siege!.walls.sort((a, b) => a - b)).toEqual([8, 10]);
    expect(events(state, "FORTIFICATION_DESTROYED")).toHaveLength(0);
  });

  it("the GATE directly behind the target is hittable exactly like a Wall", () => {
    let state = dragonState("gd-gate-behind", { walls: [], gatePosition: 9 });
    state = applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" });
    state = settle(state);
    expect(state.combat!.siege!.gatePosition).toBeNull();
    expect(events(state, "FORTIFICATION_DESTROYED").some((e) => e.kind === "gate" && e.position === 9)).toBe(true);
  });

  it("CONTROL: a DEFENDER's own line breath never fells its OWN wall behind the target", () => {
    // townPlayerId = p1: the walls belong to the attacking Dragon's own side.
    let state = dragonState("gd-own-wall", { townPlayerId: "p1" });
    state = applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" });
    state = settle(state);
    expect(wallStanding(state, 9)).toBe(true);
    expect(events(state, "FORTIFICATION_DESTROYED")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Lich Death Cloud (SECOND_ATTACK_ADJACENT_TO_TARGET) — automatic rider
// ---------------------------------------------------------------------------

describe("Lich Death Cloud fells enemy walls adjacent to the target", () => {
  /**
   * Lich (p1, ranged) at 1 shoots the enemy at 13; the Death Cloud engulfs the
   * cells around 13 — the Wall at 9 (row2c1, adjacent to 13) AND the enemy at 14.
   */
  function lichState(seed: string, siegeOverrides: Partial<SiegeState> = {}): GameState {
    const state = siegeState(seed, siegeOverrides);
    const lich = state.combat!.units.unit_p1_marksmen;
    setUnit(lich, { name: "Liches", cardName: "Pack of Liches", type: "ranged", attack: 1, abilities: ["lich-death-cloud"], position: 1 });
    setUnit(state.combat!.units.unit_p2_skeletons, { type: "ground", defense: 1, maxHealth: 9, damage: 0, position: 13 });
    setUnit(state.combat!.units.unit_p2_vampires, { type: "ground", defense: 1, maxHealth: 9, damage: 0, position: 14 });
    setActive(state, lich.id);
    return state;
  }

  it("fells the wall adjacent to the target ALONGSIDE the chosen unit splash", () => {
    let state = lichState("lich-wall-and-unit");
    state = applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" });
    state = settle(state);

    // Wall 9 (adjacent to the target) fell; the diagonal walls 8, 10 (distance 2)
    // and the Gate did not.
    expect(wallStanding(state, 9)).toBe(false);
    expect(state.combat!.siege!.walls.sort((a, b) => a - b)).toEqual([8, 10]);
    expect(events(state, "FORTIFICATION_DESTROYED").some((e) => e.kind === "wall" && e.position === 9)).toBe(true);

    // The unit splash still resolved: the Death Cloud attacked the vampires.
    const cloud = events(state, "UNIT_ATTACK_DECLARED").filter((e) => e.abilityAttack?.abilityId === "lich-death-cloud");
    expect(cloud.some((e) => e.defenderId === "unit_p2_vampires")).toBe(true);
    expect(state.combat!.units.unit_p2_vampires.damage).toBeGreaterThan(0);
  });

  it("CONTROL: a DEFENDER's own Death Cloud spares its own wall but still hits the unit", () => {
    let state = lichState("lich-own-wall", { townPlayerId: "p1" });
    state = applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" });
    state = settle(state);

    expect(wallStanding(state, 9)).toBe(true);
    expect(events(state, "FORTIFICATION_DESTROYED")).toHaveLength(0);
    // The unit splash is unaffected — only the friendly wall is spared.
    expect(state.combat!.units.unit_p2_vampires.damage).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Hydra extra attack (SECOND_ATTACK_ONE_ADJACENT_TO_SELF) — the wall is a CHOICE
// ---------------------------------------------------------------------------

describe("Hydra extra attack offers an adjacent enemy wall as a choosable target", () => {
  /**
   * Hydra (p1) at 13 attacks the enemy at 12; its extra attack may then strike
   * one thing adjacent to itself: the enemy at 14 OR the Wall at 9 (both
   * neighbours of 13). The primary target (12) is excluded from the follow-up.
   */
  function hydraState(seed: string, siegeOverrides: Partial<SiegeState> = {}): GameState {
    const state = siegeState(seed, siegeOverrides);
    const hydra = state.combat!.units.unit_p1_marksmen;
    setUnit(hydra, { name: "Hydras", cardName: "Pack of Hydras", type: "ground", attack: 8, abilities: ["hydra-multi-attack"], position: 13 });
    setUnit(state.combat!.units.unit_p2_skeletons, { type: "ground", defense: 1, maxHealth: 20, damage: 0, position: 12 });
    setUnit(state.combat!.units.unit_p2_vampires, { type: "ground", defense: 1, maxHealth: 20, damage: 0, position: 14 });
    setActive(state, hydra.id);
    return state;
  }

  function driveToChoice(state: GameState): GameState {
    let current = applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" });
    current = settle(current);
    expect(current.pendingChoice?.type).toBe("ABILITY_TARGET_CHOICE");
    return current;
  }

  it("offers the wall (and the adjacent enemy) as a legal, board-clickable target", () => {
    const state = driveToChoice(hydraState("hydra-offer"));
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") return;
    expect(new Set(choice.candidateUnitIds)).toEqual(
      new Set(["unit_p2_vampires", fortificationTargetId("wall", 9)])
    );
    // legal-actions surfaces the wall as its own CHOOSE_ABILITY_TARGET (the path
    // the board / multiplayer take).
    const legal = getLegalActions(state, "p1");
    expect(
      legal.some(
        (entry) => entry.action.type === "CHOOSE_ABILITY_TARGET" && entry.action.targetUnitId === fortificationTargetId("wall", 9)
      )
    ).toBe(true);
  });

  it("picking the wall fells it and spares the adjacent enemy", () => {
    let state = driveToChoice(hydraState("hydra-pick-wall"));
    const choice = state.pendingChoice!;
    state = applyOk(state, { type: "CHOOSE_ABILITY_TARGET", playerId: "p1", choiceId: choice.id, targetUnitId: fortificationTargetId("wall", 9) });
    state = settle(state);
    expect(wallStanding(state, 9)).toBe(false);
    expect(events(state, "FORTIFICATION_DESTROYED").some((e) => e.kind === "wall" && e.position === 9)).toBe(true);
    // CONTROL within the same scenario: the alternative unit target was NOT hit.
    expect(state.combat!.units.unit_p2_vampires.damage).toBe(0);
  });

  it("CONTROL: picking the unit instead leaves the wall standing", () => {
    let state = driveToChoice(hydraState("hydra-pick-unit"));
    const choice = state.pendingChoice!;
    state = applyOk(state, { type: "CHOOSE_ABILITY_TARGET", playerId: "p1", choiceId: choice.id, targetUnitId: "unit_p2_vampires" });
    state = settle(state);
    expect(wallStanding(state, 9)).toBe(true);
    expect(events(state, "FORTIFICATION_DESTROYED")).toHaveLength(0);
    expect(state.combat!.units.unit_p2_vampires.damage).toBeGreaterThan(0);
  });

  it("CONTROL: a DEFENDER's Hydra is never offered its own wall", () => {
    // townPlayerId = p1: the adjacent Wall belongs to the Hydra's own side, so it
    // is filtered out of the candidates. Only the enemy unit remains — a single
    // candidate that auto-resolves (no choice), and the friendly wall stands.
    let state = hydraState("hydra-own-wall", { townPlayerId: "p1" });
    state = applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" });
    state = settle(state);
    expect(wallStanding(state, 9)).toBe(true);
    expect(events(state, "FORTIFICATION_DESTROYED")).toHaveLength(0);
    // The extra attack still landed on the enemy unit (only the wall was spared).
    expect(state.combat!.units.unit_p2_vampires.damage).toBeGreaterThan(0);
  });

  it("the Gate adjacent to the Hydra is offerable and fellable too", () => {
    let state = hydraState("hydra-gate", { walls: [], gatePosition: 9 });
    state = applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" });
    state = settle(state);
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") return;
    expect(choice.candidateUnitIds).toContain(fortificationTargetId("gate", 9));
    state = applyOk(state, { type: "CHOOSE_ABILITY_TARGET", playerId: "p1", choiceId: choice.id, targetUnitId: fortificationTargetId("gate", 9) });
    state = settle(state);
    expect(state.combat!.siege!.gatePosition).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Attack-all sweep (SECOND_ATTACK_ALL_ADJACENT_TO_SELF) — automatic
// ---------------------------------------------------------------------------

describe("attack-all sweep fells every enemy wall adjacent to the attacker", () => {
  /**
   * Sweeper (p1, "cerberi-attack-all") at 13 attacks the enemy at 12; its sweep
   * then strikes every OTHER adjacent enemy (the unit at 14) AND fells the
   * adjacent Wall at 9 automatically.
   */
  function sweepState(seed: string, siegeOverrides: Partial<SiegeState> = {}): GameState {
    const state = siegeState(seed, siegeOverrides);
    const sweeper = state.combat!.units.unit_p1_marksmen;
    setUnit(sweeper, { name: "Cerberi", cardName: "Pack of Cerberi", type: "ground", attack: 6, abilities: ["ignores-retaliation", "cerberi-attack-all"], position: 13 });
    setUnit(state.combat!.units.unit_p2_skeletons, { type: "ground", defense: 1, maxHealth: 20, damage: 0, position: 12 });
    setUnit(state.combat!.units.unit_p2_vampires, { type: "ground", defense: 1, maxHealth: 20, damage: 0, position: 14 });
    setActive(state, sweeper.id);
    return state;
  }

  it("fells the adjacent enemy wall alongside sweeping every adjacent enemy unit", () => {
    let state = sweepState("sweep-wall");
    state = applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" });
    state = settle(state);
    expect(wallStanding(state, 9)).toBe(false);
    expect(events(state, "FORTIFICATION_DESTROYED").some((e) => e.kind === "wall" && e.position === 9)).toBe(true);
    // The unit sweep still happened.
    expect(state.combat!.units.unit_p2_vampires.damage).toBeGreaterThan(0);
  });

  it("CONTROL: a DEFENDER's own sweep never fells its own adjacent wall", () => {
    let state = sweepState("sweep-own-wall", { townPlayerId: "p1" });
    state = applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" });
    state = settle(state);
    expect(wallStanding(state, 9)).toBe(true);
    expect(events(state, "FORTIFICATION_DESTROYED")).toHaveLength(0);
    expect(state.combat!.units.unit_p2_vampires.damage).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Magog / Cerberi flat-damage splash (FLAT_DAMAGE_ADJACENT_TO_*) — CHOICE
// ---------------------------------------------------------------------------

describe("Magog fireball splash offers an enemy wall as a choosable target", () => {
  /**
   * Magog (p1, ranged) at 1 shoots the NON-adjacent enemy at 13; the splash may
   * hit a unit adjacent to the target (14) OR the Wall at 9 (both neighbours of 13).
   */
  function magogState(seed: string, siegeOverrides: Partial<SiegeState> = {}): GameState {
    const state = siegeState(seed, siegeOverrides);
    const magog = state.combat!.units.unit_p1_marksmen;
    setUnit(magog, { name: "Magogs", cardName: "Pack of Magogs", type: "ranged", attack: 4, abilities: ["magog-fireball-splash"], position: 1 });
    setUnit(state.combat!.units.unit_p2_skeletons, { type: "ground", defense: 1, maxHealth: 20, damage: 0, position: 13 });
    setUnit(state.combat!.units.unit_p2_vampires, { type: "ground", defense: 1, maxHealth: 20, damage: 0, position: 14 });
    setActive(state, magog.id);
    return state;
  }

  it("picking the wall fells it instead of splashing a unit", () => {
    let state = magogState("magog-pick-wall");
    state = applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" });
    state = settle(state);
    const choice = state.pendingChoice;
    expect(choice?.type).toBe("ABILITY_TARGET_CHOICE");
    if (choice?.type !== "ABILITY_TARGET_CHOICE") return;
    expect(choice.candidateUnitIds).toContain(fortificationTargetId("wall", 9));

    state = applyOk(state, { type: "CHOOSE_ABILITY_TARGET", playerId: "p1", choiceId: choice.id, targetUnitId: fortificationTargetId("wall", 9) });
    state = settle(state);
    expect(wallStanding(state, 9)).toBe(false);
    expect(state.combat!.units.unit_p2_vampires.damage).toBe(0);
  });

  it("CONTROL: picking the unit deals the flat splash and leaves the wall", () => {
    let state = magogState("magog-pick-unit");
    state = applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_marksmen", defenderId: "unit_p2_skeletons" });
    state = settle(state);
    const choice = state.pendingChoice!;
    state = applyOk(state, { type: "CHOOSE_ABILITY_TARGET", playerId: "p1", choiceId: choice.id, targetUnitId: "unit_p2_vampires" });
    state = settle(state);
    expect(wallStanding(state, 9)).toBe(true);
    expect(state.combat!.units.unit_p2_vampires.damage).toBe(1);
  });
});

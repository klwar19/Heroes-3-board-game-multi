import { describe, expect, it } from "vitest";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import { makeArrowTowerUnit } from "./siege";
import { cardLibrary } from "@/data/cards/library";
import { spellDeckBinhBasicUnique } from "@/data/cards/spells";
import type { GameAction, GameState, PlayerId, SiegeState } from "./state";

/**
 * Engine tests for Earthquake (Basic Earth, Instant; siege only). The wiki and
 * card text are:
 *   Power 0: remove 1 Gate or Wall obstacle of your choice.
 *   Power 1: remove 2 Gate or Wall obstacles of your choice.
 *   Power 2: every unit adjacent to a Wall or Gate suffers 1 damage, then
 *            remove ALL Gate or Wall obstacles.
 * Every assertion below fails if its wiring (resolveEarthquakeSpell / the
 * siege-demolish choice / the legal-action gate) is removed.
 *
 * Sandbox (createInitialGameState): combat with no siege; we add one.
 */

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

function passAllReactions(state: GameState): GameState {
  let current = state;
  let safety = 40;
  while (current.reactionWindow && safety > 0) {
    safety -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

function findEarthquakeCast(state: GameState, playerId: PlayerId) {
  return getLegalActions(state, playerId).find(
    (legal) => legal.action.type === "CAST_SPELL" && legal.action.cardId === "spell.earthquake"
  );
}

/** A combat with a four-piece fortification line (3 Walls + the Gate) p2 holds. */
function withSiege(state: GameState, overrides: Partial<SiegeState> = {}): SiegeState {
  const siege: SiegeState = {
    townPlayerId: "p2",
    walls: [8, 10, 11],
    gatePosition: 9,
    arrowTowerUnitId: null,
    ...overrides
  };
  state.combat!.siege = siege;
  state.combat!.obstacles = [];
  return siege;
}

/**
 * Casts Earthquake at the given Power and, for Power 0/1, resolves each
 * fortification pick (always option 0) until the choice closes.
 */
function castEarthquakeAt(state: GameState, power: number): GameState {
  state.players.p1.hand = ["spell.earthquake", "stat.power", "stat.power"];
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_marksmen";

  const cast = findEarthquakeCast(state, "p1");
  expect(cast, "Earthquake should be castable while fortifications stand").toBeTruthy();
  const casted = applyOk(state, cast!.action);
  // Stand in for paying N Power into the cast — the same hook Remove Obstacle's
  // tests use (Empower / Power statistics feed spellPowerBonus).
  casted.stack[0]!.modifiers.spellPowerBonus = power;
  let current = passAllReactions(casted);

  let safety = 10;
  while (
    current.pendingChoice?.type === "OPTION_CHOICE" &&
    current.pendingChoice.context === "siege-demolish" &&
    safety > 0
  ) {
    safety -= 1;
    current = applyOk(current, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: current.pendingChoice.id,
      optionIndex: 0
    });
  }
  return current;
}

function standingCount(siege: SiegeState | null | undefined): number {
  if (!siege) {
    return 0;
  }
  return siege.walls.length + (siege.gatePosition !== null ? 1 : 0);
}

describe("Earthquake spell — definition (the truth about what runs)", () => {
  it("is an implemented EARTHQUAKE Basic Earth spell, reachable in the deck", () => {
    const card = cardLibrary["spell.earthquake"];
    expect(card.implementationStatus).toBe("implemented");
    expect(card.effect.type).toBe("EARTHQUAKE");
    expect(card.spellLevel).toBe("basic");
    expect(card.spellSchools).toContain("earth");
    expect(spellDeckBinhBasicUnique).toContain("spell.earthquake");
  });
});

describe("Earthquake spell — siege demolition", () => {
  it("Power 0 brings down exactly 1 fortification of the caster's choice", () => {
    const state = createInitialGameState("earthquake-p0");
    const siege = withSiege(state);
    const before = standingCount(siege);

    const result = castEarthquakeAt(state, 0);
    expect(standingCount(result.combat!.siege)).toBe(before - 1);
    expect(result.eventLog.some((event) => event.type === "FORTIFICATION_DESTROYED")).toBe(true);
    expect(result.pendingChoice).toBeNull();
  });

  it("Power 1 brings down exactly 2 fortifications", () => {
    const state = createInitialGameState("earthquake-p1");
    const siege = withSiege(state);
    const before = standingCount(siege);

    const result = castEarthquakeAt(state, 1);
    expect(standingCount(result.combat!.siege)).toBe(before - 2);
    expect(result.eventLog.filter((event) => event.type === "FORTIFICATION_DESTROYED").length).toBe(2);
  });

  it("never removes more fortifications than stand (Power 1, only 1 Wall up)", () => {
    const state = createInitialGameState("earthquake-cap");
    withSiege(state, { walls: [9], gatePosition: null });

    const result = castEarthquakeAt(state, 1);
    expect(standingCount(result.combat!.siege)).toBe(0);
    expect(result.eventLog.filter((event) => event.type === "FORTIFICATION_DESTROYED").length).toBe(1);
    expect(result.pendingChoice).toBeNull();
  });
});

describe("Earthquake spell — Power 2 levels everything and damages adjacent units", () => {
  it("deals 1 to each unit beside a fortification, removes ALL Walls + Gate, and collapses the Arrow Tower", () => {
    const state = createInitialGameState("earthquake-p2");
    const combat = state.combat!;
    const tower = makeArrowTowerUnit("unit_tower", "p2");
    combat.units.unit_tower = tower;
    withSiege(state, { walls: [8, 10, 11], gatePosition: 9, arrowTowerUnitId: tower.id });

    // unit_p2_skeletons at 13 is adjacent to the Gate at 9; unit_p1_griffins at
    // 5 is adjacent to the Gate at 9 too. unit_p2_dread_knights sits far away.
    combat.units.unit_p2_skeletons.position = 13;
    combat.units.unit_p2_skeletons.damage = 0;
    combat.units.unit_p1_griffins.position = 5;
    combat.units.unit_p1_griffins.damage = 0;
    combat.units.unit_p2_dread_knights.position = 0;
    combat.units.unit_p2_dread_knights.damage = 0;

    const result = castEarthquakeAt(state, 2);
    const after = result.combat!;

    // All fortifications gone, and with them the Arrow Tower.
    expect(after.siege!.walls).toEqual([]);
    expect(after.siege!.gatePosition).toBeNull();
    expect(after.siege!.arrowTowerUnitId).toBeNull();
    expect(
      result.eventLog.some((event) => event.type === "FORTIFICATION_DESTROYED" && event.kind === "arrow-tower")
    ).toBe(true);

    // 1 damage to each adjacent unit (both sides), none to the distant one.
    expect(after.units.unit_p2_skeletons.damage).toBe(1);
    expect(after.units.unit_p1_griffins.damage).toBe(1);
    expect(after.units.unit_p2_dread_knights.damage).toBe(0);

    // No leftover demolish choice — Power 2 resolves in one shot.
    expect(result.pendingChoice).toBeNull();
  });
});

describe("Earthquake spell — only castable against standing fortifications", () => {
  it("is not offered without a siege", () => {
    const state = createInitialGameState("earthquake-no-siege");
    state.combat!.siege = null;
    state.players.p1.hand = ["spell.earthquake"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    expect(findEarthquakeCast(state, "p1")).toBeFalsy();
  });

  it("is not offered once every Wall and the Gate are already down", () => {
    const state = createInitialGameState("earthquake-breached");
    withSiege(state, { walls: [], gatePosition: null });
    state.players.p1.hand = ["spell.earthquake"];
    state.players.p2.hand = [];
    state.activePlayerId = "p1";
    state.combat!.activeUnitId = "unit_p1_marksmen";
    expect(findEarthquakeCast(state, "p1")).toBeFalsy();
  });
});

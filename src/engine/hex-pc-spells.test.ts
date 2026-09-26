import { describe, expect, it } from "vitest";
import { getBattlefieldDistance, hexPosition } from "./battlefield";
import { hexPcSpellBlast } from "./hex-spell-areas";
import { applyAction, createInitialGameState, getLegalActions } from "./index";
import type { GameAction, GameState, UnitId } from "./state";

/**
 * Hex battlefield PC spell rules (user request 2026-09-26): Fireball / Frost
 * Ring / Meteor Shower / Inferno take the Heroes III PC area on the hex board
 * (every unit in it is hit, no picks), and Chain Lightning hops from the unit
 * it struck last to the nearest unstruck unit. The 4×5 grid keeps the printed
 * rules — each hex assertion has a control that fails if the hex branch is
 * removed or leaks onto the grid.
 */

const hex = (column: number, row: number): number => {
  const position = hexPosition(column, row);
  if (position === null) throw new Error(`off board ${column},${row}`);
  return position;
};

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

const UNIT_IDS = [
  "unit_p1_griffins",
  "unit_p1_marksmen",
  "unit_p1_crusaders",
  "unit_p2_skeletons",
  "unit_p2_vampires",
  "unit_p2_dread_knights"
] as const;

/** A hex combat with p1's Griffins active and every unit parked where `place` puts it. */
function hexCombat(seed: string, hand: string[], place: Record<(typeof UNIT_IDS)[number], number>): GameState {
  const state = createInitialGameState(seed, { hexBattlefield: true });
  expect(state.combat?.geometry).toBe("hex");
  state.players.p1.hand = hand;
  state.players.p2.hand = [];
  state.activePlayerId = "p1";
  state.combat!.activeUnitId = "unit_p1_griffins";
  for (const id of UNIT_IDS) {
    const unit = state.combat!.units[id];
    expect(unit, id).toBeTruthy();
    unit.position = place[id];
    unit.damage = 0;
    unit.maxHealth = 20;
    unit.abilities = [];
    unit.activatedThisRound = false;
  }
  return state;
}

function cast(state: GameState, cardId: string, matches: (action: Extract<GameAction, { type: "CAST_SPELL" }>) => boolean): GameState {
  const legal = getLegalActions(state, "p1").find(
    (candidate) => candidate.action.type === "CAST_SPELL" && candidate.action.cardId === cardId && matches(candidate.action)
  );
  expect(legal, `${cardId} should be castable`).toBeTruthy();
  return passAllReactions(applyOk(state, legal!.action));
}

const damage = (state: GameState, unitId: UnitId) => state.combat!.units[unitId].damage;

describe("hex battlefield: PC-size area spells", () => {
  it("Fireball hits the target and EVERY unit around it, friend or foe, with no pick", () => {
    let state = hexCombat("hex-pc-fireball", ["spell.fireball"], {
      unit_p1_griffins: hex(1, 8),
      unit_p1_marksmen: hex(6, 3), // friendly, beside the target
      unit_p1_crusaders: hex(9, 4), // three hexes away: outside
      unit_p2_skeletons: hex(6, 4), // the target
      unit_p2_vampires: hex(7, 4), // beside the target
      unit_p2_dread_knights: hex(11, 0)
    });
    state = cast(state, "spell.fireball", (action) =>
      action.target.type === "unit" && action.target.unitId === "unit_p2_skeletons");
    expect(state.pendingChoice).toBeFalsy();
    expect(damage(state, "unit_p2_skeletons")).toBe(1);
    expect(damage(state, "unit_p2_vampires")).toBe(1);
    expect(damage(state, "unit_p1_marksmen")).toBe(1);
    expect(damage(state, "unit_p1_crusaders")).toBe(0);
  });

  it("Frost Ring hits every unit in the ring around the space (more than two), never the centre", () => {
    let state = hexCombat("hex-pc-frost-ring", ["spell.frost_ring"], {
      unit_p1_griffins: hex(1, 8),
      unit_p1_marksmen: hex(5, 4),
      unit_p1_crusaders: hex(6, 3),
      unit_p2_skeletons: hex(6, 4), // the centre
      unit_p2_vampires: hex(7, 4),
      unit_p2_dread_knights: hex(11, 0)
    });
    state = cast(state, "spell.frost_ring", (action) =>
      action.target.type === "space" && action.target.position === hex(6, 4));
    // Three ring units: the printed "pick 2" would have opened a choice.
    expect(state.pendingChoice).toBeFalsy();
    expect(damage(state, "unit_p1_marksmen")).toBe(1);
    expect(damage(state, "unit_p1_crusaders")).toBe(1);
    expect(damage(state, "unit_p2_vampires")).toBe(1);
    expect(damage(state, "unit_p2_skeletons")).toBe(0);
  });

  it("the PC areas: Inferno covers 19 hexes, Fireball / Meteor Shower 7, Frost Ring the 6-hex ring; none on the grid", () => {
    const state = createInitialGameState("hex-pc-areas", { hexBattlefield: true });
    const centre = hex(6, 4);
    expect(hexPcSpellBlast(state.combat, "spell.inferno", centre)?.size).toBe(19);
    expect(hexPcSpellBlast(state.combat, "specialty.xyron.1", centre)?.size).toBe(19);
    expect(hexPcSpellBlast(state.combat, "spell.fireball", centre)?.size).toBe(7);
    expect(hexPcSpellBlast(state.combat, "spell.meteor_shower", centre)?.size).toBe(7);
    const ring = hexPcSpellBlast(state.combat, "spell.frost_ring", centre);
    expect(ring?.size).toBe(6);
    expect(ring?.has(centre)).toBe(false);
    // A card without a PC area, and the 4×5 grid, keep the printed rule.
    expect(hexPcSpellBlast(state.combat, "spell.magic_arrow", centre)).toBeNull();
    const grid = createInitialGameState("hex-pc-areas-grid");
    expect(grid.combat?.geometry ?? "grid").toBe("grid");
    expect(hexPcSpellBlast(grid.combat, "spell.inferno", 9)).toBeNull();
  });
});

describe("hex battlefield: Chain Lightning hops like the PC", () => {
  it("each bolt jumps from the unit struck last to the nearest unstruck unit", () => {
    const place = {
      unit_p1_griffins: hex(1, 8),
      unit_p2_skeletons: hex(6, 4), // the selected unit
      unit_p2_vampires: hex(8, 4), // nearest to the selected unit
      unit_p1_crusaders: hex(10, 4), // nearest to the vampires, far from the selected unit
      unit_p1_marksmen: hex(6, 1), // second nearest to the selected unit
      unit_p2_dread_knights: hex(11, 8)
    } as const;
    // The setup the assertion relies on (hex distances).
    expect(getBattlefieldDistance(place.unit_p2_skeletons, place.unit_p2_vampires)).toBe(2);
    expect(getBattlefieldDistance(place.unit_p2_skeletons, place.unit_p1_marksmen)).toBe(3);
    expect(getBattlefieldDistance(place.unit_p2_skeletons, place.unit_p1_crusaders)).toBe(4);
    expect(getBattlefieldDistance(place.unit_p2_vampires, place.unit_p1_crusaders)).toBe(2);
    expect(getBattlefieldDistance(place.unit_p2_vampires, place.unit_p1_marksmen)).toBeGreaterThan(2);

    let state = hexCombat("hex-pc-chain", ["spell.chain_lightning"], place);
    state = cast(state, "spell.chain_lightning", (action) =>
      action.target.type === "unit" && action.target.unitId === "unit_p2_skeletons");
    expect(state.pendingChoice).toBeFalsy();
    expect(damage(state, "unit_p2_skeletons")).toBe(1);
    expect(damage(state, "unit_p2_vampires")).toBe(1);
    // The printed 4×5 fork (the two units closest to the SELECTED unit) would
    // have struck the Marksmen instead of the Crusaders.
    expect(damage(state, "unit_p1_crusaders")).toBe(1);
    expect(damage(state, "unit_p1_marksmen")).toBe(0);
  });

  it("a tie at the nearest hop is the caster's pick", () => {
    let state = hexCombat("hex-pc-chain-tie", ["spell.chain_lightning"], {
      unit_p1_griffins: hex(1, 8),
      unit_p2_skeletons: hex(6, 4), // the selected unit
      unit_p2_vampires: hex(8, 4), // two hexes away …
      unit_p1_crusaders: hex(4, 4), // … and two hexes the other way
      unit_p1_marksmen: hex(12, 0),
      unit_p2_dread_knights: hex(11, 8)
    });
    state = cast(state, "spell.chain_lightning", (action) =>
      action.target.type === "unit" && action.target.unitId === "unit_p2_skeletons");
    expect(state.pendingChoice?.type).toBe("ABILITY_TARGET_CHOICE");
    const choice = state.pendingChoice as Extract<GameState["pendingChoice"], { type: "ABILITY_TARGET_CHOICE" }>;
    expect(choice.kind).toBe("chain-lightning");
    expect([...choice.candidateUnitIds].sort()).toEqual(["unit_p1_crusaders", "unit_p2_vampires"]);
    // Picking the Crusaders: the next bolt hops on from THEM.
    state = applyOk(state, {
      type: "CHOOSE_ABILITY_TARGET",
      playerId: "p1",
      choiceId: choice.id,
      targetUnitId: "unit_p1_crusaders"
    });
    expect(damage(state, "unit_p1_crusaders")).toBe(1);
  });
});

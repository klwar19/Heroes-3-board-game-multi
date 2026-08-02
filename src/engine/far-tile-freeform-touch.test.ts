import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState } from "./index";
import { farTilePlacementCenters, instantiateTile } from "./adventure";
import {
  hexSpaceId,
  tileCentersAdjacent,
  tileCentersOverlap,
  tileFootprint,
  tileFootprintsTouch,
  tileLatticeColor,
  tileLatticeNeighbors,
  tileTouchNeighbors,
  type HexCoord
} from "./hex";
import type { GameAction, GameState, MapTileState } from "./state";

// Live bug (2026-08-03 report, screenshot): hero on the edge of the Ⅰ (home)
// tile, a face-down Ⅳ–Ⅴ tile touching it to the left, and the Ⅱ–Ⅲ supply tile
// could not be placed into the seam between them AT ALL — even though the slot
// physically touches BOTH tiles and the hero stands right next to it. Cause:
// the layouts (both built-in scenarios and the designer's free drop) put tiles
// on DIFFERENT index-7 sublattices, and `canPlaceTileAt` counted "touching"
// with `tileCentersAdjacent`, which only recognises the 6 interlocking
// same-sublattice offsets — a physically touching cross-sublattice neighbour
// counted as ZERO touches, so no candidate near such a seam ever qualified.
//
// The fix counts PHYSICAL touch (`tileFootprintsTouch`) and, when the slot does
// not interlock with two tiles, allows it ONLY where the touched tiles span two
// different sublattice colors (a freeform seam, where no interlocking slot can
// exist). A notch between two SAME-color tiles keeps the strict interlock rule,
// so a skewed drop can never spoil a properly fillable hole.

function refreshP1(state: GameState): GameState {
  if (!state.players.p1.needsHandRefresh && !state.players.p1.canMulligan) {
    return state;
  }
  const result = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  expect(result.errors).toHaveLength(0);
  return result.state;
}

function makeGame(): GameState {
  return refreshP1(
    createAdventureGameState({ seed: "freeform-touch-seed", difficulty: "normal", rollFirstPlayer: false })
  );
}

function tileCenters(state: GameState): HexCoord[] {
  return Object.values(state.adventure!.tiles).map((tile) => ({ row: tile.centerRow, col: tile.centerCol }));
}

function homeTileOf(state: GameState): MapTileState {
  const heroSpace = state.heroes.hero_p1.spaceId!;
  const home = Object.values(state.adventure!.tiles).find((tile) =>
    tileFootprint({ row: tile.centerRow, col: tile.centerCol }, 0).some((hex) => hexSpaceId(hex) === heroSpace)
  );
  expect(home, "hero_p1 must start on a tile").toBeTruthy();
  return home!;
}

function placeAction(center: HexCoord): Extract<GameAction, { type: "PLACE_TILE" }> {
  return {
    type: "PLACE_TILE",
    playerId: "p1",
    heroId: "hero_p1",
    supplyIndex: 0,
    centerRow: center.row,
    centerCol: center.col
  };
}

/** The 12 touching-but-NOT-interlocking offsets around a center. */
function freeformTouchNeighbors(center: HexCoord): HexCoord[] {
  const interlocking = tileLatticeNeighbors(center).map((c) => `${c.row}:${c.col}`);
  return tileTouchNeighbors(center).filter((c) => !interlocking.includes(`${c.row}:${c.col}`));
}

/** Positions that physically touch BOTH anchors, overlap nothing, and touch nothing else. */
function cleanSeamSlots(state: GameState, a: HexCoord, b: HexCoord): HexCoord[] {
  const existing = tileCenters(state);
  return tileTouchNeighbors(a).filter((candidate) => {
    if (existing.some((tile) => tileCentersOverlap(tile, candidate))) {
      return false;
    }
    const touching = existing.filter((tile) => tileFootprintsTouch(tile, candidate));
    if (touching.length !== 2) {
      return false;
    }
    const key = (c: HexCoord) => `${c.row}:${c.col}`;
    return touching.some((t) => key(t) === key(a)) && touching.some((t) => key(t) === key(b));
  });
}

/** Every hero position on `tile` from which `farTilePlacementCenters` offers `slot`. */
function heroHexesOffering(state: GameState, tile: MapTileState, slot: HexCoord): string[] {
  const offered: string[] = [];
  for (const hex of tileFootprint({ row: tile.centerRow, col: tile.centerCol }, 0)) {
    const spaceId = hexSpaceId(hex);
    if (!state.adventure!.fields[spaceId]) {
      continue;
    }
    state.heroes.hero_p1.spaceId = spaceId;
    state.heroes.hero_p1.movementPoints = 5;
    const centers = farTilePlacementCenters(state, state.heroes.hero_p1);
    if (centers.some((c) => c.row === slot.row && c.col === slot.col)) {
      offered.push(spaceId);
    }
  }
  return offered;
}

describe("Ⅱ–Ⅲ placement into a freeform (cross-sublattice) seam", () => {
  it("offers and accepts the slot touching the home tile AND a shifted face-down tile (the reported bug)", () => {
    // Try each of the 12 shifted touch offsets around the home tile until one
    // yields a clean seam (fresh state per attempt — instantiateTile mutates).
    let placed = false;
    for (const shifted of freeformTouchNeighbors({ row: 0, col: 0 }).map((_, index) => index)) {
      const state = makeGame();
      const home = homeTileOf(state);
      const homeCenter = { row: home.centerRow, col: home.centerCol };
      const offsets = freeformTouchNeighbors(homeCenter);
      const target = offsets[shifted];
      if (!target) {
        continue;
      }
      // The shifted neighbour must not overlap or touch any other existing tile.
      const others = tileCenters(state);
      if (others.some((tile) => tileCentersOverlap(tile, target))) {
        continue;
      }
      // Cross-sublattice by construction — the defining property of the seam.
      expect(tileLatticeColor(target)).not.toBe(tileLatticeColor(homeCenter));
      expect(tileFootprintsTouch(homeCenter, target)).toBe(true);
      expect(tileCentersAdjacent(homeCenter, target)).toBe(false);
      instantiateTile(state.adventure!, "F3", target, 0, true);

      for (const seamSlot of cleanSeamSlots(state, homeCenter, target)) {
        // Pin the BUG shape: the seam slot interlocks with FEWER than two tiles,
        // so the old tileCentersAdjacent rule refused it outright.
        const interlocks = tileCenters(state).filter((tile) => tileCentersAdjacent(tile, seamSlot));
        if (interlocks.length >= 2) {
          continue;
        }
        const offeringHexes = heroHexesOffering(state, home, seamSlot);
        if (offeringHexes.length === 0) {
          continue; // e.g. every facing home hex prints a sealed arc — try another slot
        }
        state.heroes.hero_p1.spaceId = offeringHexes[0];
        state.heroes.hero_p1.movementPoints = 5;
        const result = applyAction(state, placeAction(seamSlot));
        expect(result.errors, result.errors.map((e) => e.message).join("; ")).toHaveLength(0);
        expect(result.state.heroes.hero_p1.movementPoints).toBe(4);
        // The flip either waits on a keep/reroll decision or auto-finalized
        // into the placed tile's rotation choice — both prove the placement.
        expect(
          result.state.adventure!.pendingFarTileFlip ?? result.state.adventure!.pendingTileChoice
        ).toBeTruthy();
        placed = true;
        break;
      }
      if (placed) {
        break;
      }
    }
    expect(placed, "no freeform seam slot around the home tile was placeable — the reported bug").toBe(true);
  });

  it("CONTROL: a slot touching only ONE tile is still refused (the touch-two rule stands)", () => {
    const state = makeGame();
    const home = homeTileOf(state);
    const homeCenter = { row: home.centerRow, col: home.centerCol };
    const existing = tileCenters(state);
    const lonely = tileTouchNeighbors(homeCenter).find((candidate) => {
      if (existing.some((tile) => tileCentersOverlap(tile, candidate))) {
        return false;
      }
      return existing.filter((tile) => tileFootprintsTouch(tile, candidate)).length === 1;
    });
    expect(lonely, "the scenario board must have a one-touch frontier slot").toBeTruthy();
    expect(heroHexesOffering(state, home, lonely!)).toHaveLength(0);
    // Direct action from an adjacent hex is rejected without spending movement.
    const adjacentHexes = tileFootprint({ row: home.centerRow, col: home.centerCol }, 0);
    state.heroes.hero_p1.spaceId = hexSpaceId(adjacentHexes[0]);
    state.heroes.hero_p1.movementPoints = 5;
    const result = applyAction(state, placeAction(lonely!));
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.state.heroes.hero_p1.movementPoints).toBe(5);
  });

  it("CONTROL: a skewed slot in a hole between two SAME-sublattice tiles stays refused, the interlocking slot stays placeable", () => {
    // Build: home tile O, an interlocking hole slot H, and a second tile B
    // interlocking H on the far side — O and B share one sublattice color, so
    // the seam-color relaxation must NOT fire and every skewed slot S that
    // merely touches O and B is refused (it would spoil the fillable hole H).
    let verified = false;
    const base = makeGame();
    const home = homeTileOf(base);
    const homeCenter = { row: home.centerRow, col: home.centerCol };
    for (const hole of tileLatticeNeighbors(homeCenter)) {
      const state = makeGame();
      const existingBefore = tileCenters(state);
      if (existingBefore.some((tile) => tileCentersOverlap(tile, hole))) {
        continue;
      }
      const far = tileLatticeNeighbors(hole).find(
        (candidate) =>
          !tileCentersOverlap(candidate, homeCenter) &&
          !tileFootprintsTouch(candidate, homeCenter) &&
          !existingBefore.some((tile) => tileCentersOverlap(tile, candidate) || tileFootprintsTouch(tile, candidate))
      );
      if (!far) {
        continue;
      }
      expect(tileLatticeColor(far)).toBe(tileLatticeColor(homeCenter)); // same sublattice
      instantiateTile(state.adventure!, "F3", far, 0, true);

      const skewed = cleanSeamSlots(state, homeCenter, far).filter(
        (slot) => tileCenters(state).filter((tile) => tileCentersAdjacent(tile, slot)).length < 2
      );
      if (skewed.length === 0) {
        continue;
      }
      for (const slot of skewed) {
        expect(heroHexesOffering(state, homeTileOf(state), slot)).toHaveLength(0);
        const adjacent = tileFootprint(homeCenter, 0);
        state.heroes.hero_p1.spaceId = hexSpaceId(adjacent[0]);
        state.heroes.hero_p1.movementPoints = 5;
        const result = applyAction(state, placeAction(slot));
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.state.heroes.hero_p1.movementPoints).toBe(5);
      }
      // Sanity: the proper interlocking hole slot H itself is still offered.
      expect(heroHexesOffering(state, homeTileOf(state), hole).length).toBeGreaterThan(0);
      verified = true;
      break;
    }
    expect(verified, "no same-color hole configuration could be built around the home tile").toBe(true);
  });
});

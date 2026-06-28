import { describe, expect, it } from "vitest";
import { applyAction, createAdventureGameState, getLegalActions } from "./index";
import { canHeroDiscoverAdjacentTile } from "./adventure-reducer";
import { getTileFootprintSpaceIds } from "./adventure";
import { type GameAction, type GameState, type MapTileState } from "./state";

// House-rule Ⅱ–Ⅲ (Far) tile DISCOVERY: a face-down Ⅱ–Ⅲ tile ALREADY on the map
// (the symmetric clash maps line the homes with a face-down Ⅱ–Ⅲ ring) obeys the
// SAME keep/reroll/pick rules as opening one from your supply —
//   • the player's 2nd Ⅱ–Ⅲ opening guarantees a Settlement (keep, or reroll
//     until one appears, then pick), and
//   • any opening showing a material Mine may be rerolled once —
// counted on the SAME per-player opening tally that supply placements drive (so
// the "2nd tile" is the second opened EITHER way). The supply path is covered by
// far-tile-flip.test.ts; this file covers the on-map discovery path. Every test
// asserts the OBSERVED board outcome and fails if the wiring is removed.
//
// Fixture tile facts (core game, verified against tile-defs):
//   F1 — Settlement, no Mine
//   F4 — Mine, no Settlement
const SETTLEMENT_NO_MINE = "F1";
const MINE_NO_SETTLEMENT = "F4";

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

/** A symmetric land map (its homes are ringed with face-down Ⅱ–Ⅲ tiles), p1's hand refreshed. */
function landGame(seed = "far-reveal"): GameState {
  let state = createAdventureGameState({
    seed,
    scenarioId: "land-2p",
    difficulty: "normal",
    rollFirstPlayer: false,
    creatureBanks: false
  });
  if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
    state = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
  }
  return state;
}

/**
 * Stands p1's hero at an open border next to a face-down Ⅱ–Ⅲ tile on the map and
 * rewrites that tile's (still hidden) def to `defId`, so the discovery is fully
 * deterministic. Returns the on-map tile instance to be discovered.
 */
function armDiscoverableFarTile(state: GameState, defId: string): MapTileState {
  const adventure = state.adventure!;
  for (const tile of Object.values(adventure.tiles)) {
    if (!tile.faceDown || tile.group !== "far") {
      continue;
    }
    for (const spaceId of Object.keys(adventure.fields)) {
      if (getTileFootprintSpaceIds(tile).includes(spaceId)) {
        continue; // a field of the tile itself is not a place to stand beside it
      }
      const hero = { ...state.heroes.hero_p1, spaceId };
      if (canHeroDiscoverAdjacentTile(state, hero, tile)) {
        state.heroes.hero_p1.spaceId = spaceId;
        state.heroes.hero_p1.movementPoints = 5;
        tile.tileDefId = defId;
        return tile;
      }
    }
  }
  throw new Error("no discoverable face-down Ⅱ–Ⅲ tile in the land map");
}

const discoverAction = (tileInstanceId: string): GameAction => ({
  type: "DISCOVER_TILE",
  playerId: "p1",
  heroId: "hero_p1",
  tileInstanceId
});

/** Resolves the open far-tile-flip OPTION_CHOICE by index. */
function choose(state: GameState, optionIndex: number): GameState {
  const choice = state.pendingChoice;
  expect(choice?.type).toBe("OPTION_CHOICE");
  expect(choice && "context" in choice ? choice.context : null).toBe("far-tile-flip");
  return apply(state, { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice!.id, optionIndex });
}

/** Locks in the first legal rotation of the just-revealed tile and reports whether its footprint carries `location`. */
function rotateAndHasLocation(state: GameState, tileInstanceId: string, location: string): boolean {
  expect(state.adventure!.pendingTileChoice?.tileInstanceId).toBe(tileInstanceId);
  const rotations = getLegalActions(state, "p1").filter((legal) => legal.action.type === "SET_TILE_ROTATION");
  expect(rotations.length).toBeGreaterThan(0);
  const next = apply(state, rotations[0].action);
  return Object.values(next.adventure!.fields).some(
    (field) => field.tileInstanceId === tileInstanceId && field.location === location
  );
}

describe("Ⅱ–Ⅲ tile discovery — keep/reroll/pick on a tile already on the map", () => {
  describe("a 1st opening reveals straight away (no reroll due)", () => {
    it("flips the on-map tile to its rotation with no choice, and ticks the shared opened counter", () => {
      const state = landGame();
      const tile = armDiscoverableFarTile(state, SETTLEMENT_NO_MINE);
      expect(state.adventure!.farTilesOpenedByPlayer?.p1 ?? 0).toBe(0);

      const next = apply(state, discoverAction(tile.id));

      // No keep/reroll choice on a 1st opening; the tile is revealed and awaits rotation.
      expect(next.pendingChoice).toBeNull();
      expect(next.adventure!.pendingFarTileFlip).toBeNull();
      expect(next.adventure!.tiles[tile.id].faceDown).toBe(false);
      expect(next.adventure!.tiles[tile.id].tileDefId).toBe(SETTLEMENT_NO_MINE);
      expect(next.adventure!.pendingTileChoice?.kind).toBe("reveal");
      // The discovery counts toward the SAME per-player tally the supply path drives.
      expect(next.adventure!.farTilesOpenedByPlayer!.p1).toBe(1);
      expect(next.heroes.hero_p1.movementPoints).toBe(4);
    });
  });

  describe("2nd opening — settlement guarantee on an on-map tile", () => {
    /** Arm the map so the next discovery is this player's 2nd Ⅱ–Ⅲ opening (1 already opened, by any path). */
    function secondOpening(defId: string, pool: string[], scripted: string[]): { state: GameState; tile: MapTileState } {
      const state = landGame();
      const tile = armDiscoverableFarTile(state, defId);
      state.adventure!.farTilesOpenedByPlayer!.p1 = 1;
      state.adventure!.farTilePool = [...pool];
      state.adventure!.farTileScriptedDraws = [...scripted];
      return { state, tile };
    }

    it("offers keep/reroll when the 2nd on-map tile has no Settlement", () => {
      const { state, tile } = secondOpening(MINE_NO_SETTLEMENT, [SETTLEMENT_NO_MINE], []);
      const next = apply(state, discoverAction(tile.id));
      const flip = next.adventure!.pendingFarTileFlip!;
      expect(flip.via).toBe("reveal");
      expect(flip.tileInstanceId).toBe(tile.id);
      expect(flip.openingIndex).toBe(2);
      expect(flip.offerMode).toBe("settlement");
      expect(flip.candidate).toBe(MINE_NO_SETTLEMENT);
      expect(next.pendingChoice?.type).toBe("OPTION_CHOICE");
      // The tile is shown face up while the player decides (you must see it to decide).
      expect(next.adventure!.tiles[tile.id].faceDown).toBe(false);
    });

    it("KEEP lands the non-Settlement tile on the map (control: NO settlement on the board)", () => {
      const { state, tile } = secondOpening(MINE_NO_SETTLEMENT, [SETTLEMENT_NO_MINE], []);
      const kept = choose(apply(state, discoverAction(tile.id)), 0); // Keep
      expect(kept.adventure!.tiles[tile.id].tileDefId).toBe(MINE_NO_SETTLEMENT);
      expect(kept.adventure!.farTilesOpenedByPlayer!.p1).toBe(2);
      expect(rotateAndHasLocation(kept, tile.id, "settlement")).toBe(false);
    });

    it("REROLL until a Settlement, then PICK it — a Settlement reaches the board, the SAME slot retargets", () => {
      const { state, tile } = secondOpening(MINE_NO_SETTLEMENT, [SETTLEMENT_NO_MINE], [SETTLEMENT_NO_MINE]);
      let next = apply(state, discoverAction(tile.id));
      next = choose(next, 1); // Reroll for a Settlement
      const flip = next.adventure!.pendingFarTileFlip!;
      expect(flip.offerMode).toBe("pick");
      expect(flip.candidate).toBe(SETTLEMENT_NO_MINE);
      expect(flip.lastNonSettlement).toBe(MINE_NO_SETTLEMENT);

      const picked = choose(next, 0); // Place the Settlement
      // The on-map instance is retargeted to the Settlement tile (no new instance).
      expect(picked.adventure!.tiles[tile.id].tileDefId).toBe(SETTLEMENT_NO_MINE);
      // The rerolled-away tile returns to the pool (not lost).
      expect(picked.adventure!.farTilePool).toContain(MINE_NO_SETTLEMENT);
      expect(rotateAndHasLocation(picked, tile.id, "settlement")).toBe(true);
    });

    it("PICK the previous tile instead drops the Settlement back and keeps the earlier (mine) tile", () => {
      const { state, tile } = secondOpening(MINE_NO_SETTLEMENT, [SETTLEMENT_NO_MINE], [SETTLEMENT_NO_MINE]);
      let next = apply(state, discoverAction(tile.id));
      next = choose(next, 1); // Reroll → finds the Settlement
      const picked = choose(next, 1); // Place the PREVIOUS (non-settlement) tile instead
      expect(picked.adventure!.tiles[tile.id].tileDefId).toBe(MINE_NO_SETTLEMENT);
      expect(picked.adventure!.farTilePool).toContain(SETTLEMENT_NO_MINE);
      expect(rotateAndHasLocation(picked, tile.id, "settlement")).toBe(false);
    });

    it("does NOT fire the settlement guarantee on the 1st on-map opening", () => {
      const state = landGame();
      const tile = armDiscoverableFarTile(state, MINE_NO_SETTLEMENT);
      state.adventure!.farTilePool = [SETTLEMENT_NO_MINE];
      // Opening 1 (counter 0): a Mine tile shows the MINE choice, never the settlement one.
      const next = apply(state, discoverAction(tile.id));
      expect(next.adventure!.pendingFarTileFlip?.offerMode).not.toBe("settlement");
    });
  });

  describe("material-mine reroll on an on-map tile (every opening, once)", () => {
    it("offers a one-time reroll for a Mine tile; the reroll replaces it on the SAME slot", () => {
      const state = landGame();
      const tile = armDiscoverableFarTile(state, MINE_NO_SETTLEMENT);
      state.adventure!.farTilePool = [SETTLEMENT_NO_MINE];
      state.adventure!.farTileScriptedDraws = [SETTLEMENT_NO_MINE];

      const offered = apply(state, discoverAction(tile.id));
      const flip = offered.adventure!.pendingFarTileFlip!;
      expect(flip.via).toBe("reveal");
      expect(flip.offerMode).toBe("mine");
      expect(flip.candidate).toBe(MINE_NO_SETTLEMENT);

      const rerolled = choose(offered, 1); // Reroll once (material mine)
      // The fresh (no-mine) tile auto-finalizes onto the same slot; the mined def returns to the pool.
      expect(rerolled.adventure!.pendingFarTileFlip).toBeNull();
      expect(rerolled.adventure!.tiles[tile.id].tileDefId).toBe(SETTLEMENT_NO_MINE);
      expect(rerolled.adventure!.farTilePool).toContain(MINE_NO_SETTLEMENT);
      // Effect: the Mine that was on this tile is gone from the board after the reroll.
      expect(rotateAndHasLocation(rerolled, tile.id, "mine")).toBe(false);
    });

    it("KEEP lands the Mine tile (control: a Mine reaches the board)", () => {
      const state = landGame();
      const tile = armDiscoverableFarTile(state, MINE_NO_SETTLEMENT);
      state.adventure!.farTilePool = [SETTLEMENT_NO_MINE];

      const kept = choose(apply(state, discoverAction(tile.id)), 0); // Keep the Mine tile
      expect(kept.adventure!.tiles[tile.id].tileDefId).toBe(MINE_NO_SETTLEMENT);
      expect(rotateAndHasLocation(kept, tile.id, "mine")).toBe(true);
    });

    it("does NOT offer a Mine reroll when the pool is empty (no tile left to draw)", () => {
      const state = landGame();
      const tile = armDiscoverableFarTile(state, MINE_NO_SETTLEMENT);
      state.adventure!.farTilePool = [];
      const next = apply(state, discoverAction(tile.id));
      // No reroll possible → the Mine tile reveals straight to its rotation.
      expect(next.adventure!.pendingFarTileFlip).toBeNull();
      expect(next.pendingChoice ?? null).toBeNull();
      expect(next.adventure!.pendingTileChoice?.kind).toBe("reveal");
    });
  });
});

import { describe, expect, it } from "vitest";
import { getTileFootprintSpaceIds, instantiateTile } from "./adventure";
import {
  createAdventureGameState,
  eligibleCombatBoardArtIds,
  getAdjacentSpaceIds,
  isSeaCombat,
  isSeaField,
  seaStepHalts,
  type CombatState,
  type GameState
} from "./index";

// ---------------------------------------------------------------------------
// Sea HEX is not sea TILE: a sea tile mixes open ocean with land islands.
//
// Every sea tile carries `terrain: "water"`, but only SOME of its seven hexes
// are actually open sea — the island structures painted on the art (mines,
// towns, shrines on land, learning stones, witch huts, gardens, warriors'
// tombs, trees of knowledge, the campfire resource symbol) are dry LAND a hero
// stands on. The land hexes below are read straight off the printed tile art
// (slot order: 0 = centre, 1-6 = ring NE, E, SE, SW, W, NW), cross-checked
// against the `/public/assets/board/tiles/*.webp` scans. A test fails if a
// tile's `terrain: "land"` annotation is dropped (the hex would wrongly become
// open sea again) or if the materialiser stops honouring it.
// ---------------------------------------------------------------------------

/** Slots that are dry-land islands on each sea tile (everything else is sea). */
const SEA_TILE_LAND_SLOTS: Record<string, number[]> = {
  W1: [2, 4, 6], // learning stone (E), blocked palm island (SW), mine (NW)
  W2: [1, 2], // mystical garden (NE), mine (E)
  W3: [0, 3], // tree of knowledge (centre) + mine (SE) = one island
  W4: [1, 4], // blocked palm island (NE), learning stone (SW)
  W5: [0], // witch hut (centre)
  W6: [5], // warriors' tomb (W)
  W7: [], // deep sea: all open ocean (the blocked hex is a bare sea-rock)
  "#C4": [0], // random-town castle island (centre)
  "#C5": [1, 4], // warriors' tomb (NE), tree of knowledge (SW)
  "#N8": [1, 4, 5], // mine (NE), shrine-on-land (SW), learning stone (W)
  "#N9": [2, 5], // mystical garden (E), mine (W)
  "#N10": [0, 6], // tree of knowledge (centre) + mine (NW) = one island
  "#N11": [3, 6] // learning stone (SE), resource campfire on shore (NW)
};

function makeState(): GameState {
  return createAdventureGameState({ seed: "sea-tile-terrain", difficulty: "normal", rollFirstPlayer: false });
}

/** Materialise one sea tile far from the scenario tiles and return its slot ids. */
function placeSeaTile(state: GameState, tileId: string, centerRow: number): string[] {
  const tile = instantiateTile(state.adventure!, tileId, { row: centerRow, col: 40 }, 0, false);
  return getTileFootprintSpaceIds(tile); // index === slot (rotation 0)
}

describe("sea tiles mix land islands with open ocean (per-hex terrain)", () => {
  it("every sea-tile hex matches its printed art (land island vs open sea)", () => {
    const state = makeState();
    Object.entries(SEA_TILE_LAND_SLOTS).forEach(([tileId, landSlots], index) => {
      const ids = placeSeaTile(state, tileId, 60 + index * 6);
      for (let slot = 0; slot < ids.length; slot += 1) {
        const expectedLand = landSlots.includes(slot);
        expect(isSeaField(state, ids[slot]), `${tileId} slot ${slot} should be ${expectedLand ? "land" : "sea"}`).toBe(
          !expectedLand
        );
      }
    });
  });

  it("the island STRUCTURES that the old name-based heuristic drowned are land", () => {
    // These are the hexes the previous code wrongly flagged as open sea: any
    // visitable building that is NOT a town/mine sat on water. Each is a green
    // island on the art. A hero must be able to disembark and stand on them.
    const state = makeState();
    const cases: { tile: string; slot: number; location: string }[] = [
      { tile: "W1", slot: 2, location: "learning_stone" },
      { tile: "W2", slot: 1, location: "mystical_garden" },
      { tile: "W3", slot: 0, location: "tree_of_knowledge" },
      { tile: "W4", slot: 4, location: "learning_stone" },
      { tile: "W5", slot: 0, location: "witch_hut" },
      { tile: "W6", slot: 5, location: "warriors_tomb" },
      { tile: "#C5", slot: 1, location: "warriors_tomb" },
      { tile: "#C5", slot: 4, location: "tree_of_knowledge" },
      { tile: "#N8", slot: 4, location: "shrine_of_magic_incantation" },
      { tile: "#N8", slot: 5, location: "learning_stone" },
      { tile: "#N9", slot: 2, location: "mystical_garden" },
      { tile: "#N10", slot: 0, location: "tree_of_knowledge" },
      { tile: "#N11", slot: 3, location: "learning_stone" },
      { tile: "#N11", slot: 6, location: "resource_symbol" }
    ];
    cases.forEach(({ tile, slot, location }, index) => {
      const ids = placeSeaTile(state, tile, 200 + index * 6);
      expect(state.adventure!.fields[ids[slot]].location).toBe(location); // slot map sanity
      expect(isSeaField(state, ids[slot]), `${tile} ${location} must be land`).toBe(false);
    });
  });

  it("genuine sea features stay open water (and the same location can differ per tile)", () => {
    const state = makeState();
    // Pandora's Box is a FLOATING box (water) on W4/W6, never an island here…
    const w4 = placeSeaTile(state, "W4", 320);
    expect(state.adventure!.fields[w4[5]].location).toBe("pandoras_box");
    expect(isSeaField(state, w4[5])).toBe(true);
    // …while the very same `empty_field` location is open sea on W2 (slot 0) but
    // is decorative open-water rocks, never land — proving terrain is per-hex
    // art, not per-location-name.
    const w2 = placeSeaTile(state, "W2", 326);
    expect(state.adventure!.fields[w2[0]].location).toBe("empty_field");
    expect(isSeaField(state, w2[0])).toBe(true);
    // The Cove shrine stands IN the water (W2 slot 5) even though the #N8 shrine
    // sits on a green island — same location, opposite terrain.
    expect(state.adventure!.fields[w2[5]].location).toBe("shrine_of_magic_incantation");
    expect(isSeaField(state, w2[5])).toBe(true);
    const n8 = placeSeaTile(state, "#N8", 332);
    expect(state.adventure!.fields[n8[4]].location).toBe("shrine_of_magic_incantation");
    expect(isSeaField(state, n8[4])).toBe(false);
  });
});

describe("crossing a sea tile's own coastline halts the hero (per-hex)", () => {
  it("stepping from an open-sea hex onto an island hex of the SAME tile is a coastline step", () => {
    const state = makeState();
    const ids = placeSeaTile(state, "W2", 400); // land: mystical_garden(1), mine(2)
    const landSlot = 1;
    const land = ids[landSlot];
    const neighbours = getAdjacentSpaceIds(land);

    // A sea hex of the same tile adjacent to the island: water -> land halts.
    const seaNeighbour = neighbours.find((nb) => state.adventure!.fields[nb] && isSeaField(state, nb));
    expect(seaNeighbour, "the island must touch open sea on its own tile").toBeDefined();
    expect(seaStepHalts(state, seaNeighbour!, land)).toBe(true); // disembark halts
    expect(seaStepHalts(state, land, seaNeighbour!)).toBe(true); // embark halts

    // CONTROL: sea -> sea on the same tile never halts.
    const twoSea = ids.filter((id) => isSeaField(state, id));
    const adjacentSeaPair = twoSea.find((a) =>
      getAdjacentSpaceIds(a).some((b) => a !== b && twoSea.includes(b))
    );
    expect(adjacentSeaPair).toBeDefined();
    const seaMate = getAdjacentSpaceIds(adjacentSeaPair!).find((b) => twoSea.includes(b))!;
    expect(seaStepHalts(state, adjacentSeaPair!, seaMate)).toBe(false);
  });
});

describe("the naval battle board follows the HEX, not the tile", () => {
  function neutralCombatOn(fieldId: string): CombatState {
    return { context: { kind: "neutral", fieldId } } as unknown as CombatState;
  }

  it("a fight on an open-sea hex of a sea tile is a naval (ship-battle) board", () => {
    const state = makeState();
    const ids = placeSeaTile(state, "W4", 500);
    const seaHex = ids[0]; // sea_chest — open water
    expect(isSeaField(state, seaHex)).toBe(true);
    const combat = neutralCombatOn(seaHex);
    expect(isSeaCombat(state, combat)).toBe(true);
    expect(eligibleCombatBoardArtIds(state, combat)).toEqual(["ship-battle"]);
  });

  it("a fight on a land ISLAND hex of the SAME sea tile is NOT a naval board", () => {
    const state = makeState();
    const ids = placeSeaTile(state, "W4", 506);
    const islandHex = ids[4]; // learning_stone on a palm island
    expect(isSeaField(state, islandHex)).toBe(false);
    const combat = neutralCombatOn(islandHex);
    expect(isSeaCombat(state, combat)).toBe(false);
    // The land battlefields are offered; the ship board is not the sole option.
    expect(eligibleCombatBoardArtIds(state, combat)).not.toEqual(["ship-battle"]);
    expect(eligibleCombatBoardArtIds(state, combat)).not.toContain("ship-battle");
  });
});

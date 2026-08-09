import { describe, expect, it } from "vitest";
import { canCrossEdge, heroFieldSealedForDiscovery, isOuterEdgeSealed } from "./adventure";
import { createAdventureGameState } from "./index";
import { getTileBorderSegments } from "@/data/map/borders";
import { allTileDefinitions } from "@/data/map/tiles";
import type { GameState, MapFieldState } from "./state";

/**
 * The PvE modules carve their map objects ONTO A BLOCKED FIELD:
 *   - the Calamity Gate (`calamity_gate`, Monster Waves) takes the first revealed
 *     Far-band Blocked Field,
 *   - the Dungeon Gate (`dungeon_gate`) takes the first Near-band one.
 * Both carves already clear the FIELD-level blockers (water terrain, designer
 * `borderEdges`) "so the hex is really walkable" — but the printed ring and the
 * slot's `outerImpassable` arc live on the TILE DEFINITION, and on every
 * non-starting tile all 81 sealed arcs sit exactly on a blocked slot. So a
 * carved Gate stayed walled: drawn fully ringed, and `canCrossEdge` refused
 * entry from the neighbouring Tile — the reported "the Dungeon one has borders
 * all around it, can't access".
 *
 * A Creature Bank replaces a Blocked Field the same way and has always been
 * exempt. These Gates now share that exemption through ONE predicate, so the
 * three carves can never drift apart again.
 */
const BLOCKED_SLOT_TILE = "F3"; // far tile, blocked field on slot 3 with a sealed arc
const BLOCKED_SLOT = 3;

function twoTileState(seed: string): GameState {
  const state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  for (const [id, center] of [
    ["T1", { row: 0, col: 0 }],
    ["T2", { row: 0, col: 2 }]
  ] as const) {
    state.adventure!.tiles[id] = {
      id,
      tileDefId: BLOCKED_SLOT_TILE,
      center,
      rotation: 0,
      faceDown: false,
      placed: true,
      group: "far"
    } as never;
  }
  return state;
}

function field(spaceId: string, tile: string, location: string, slot: number): MapFieldState {
  return {
    spaceId,
    tileInstanceId: tile,
    slot,
    location,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
}

/** The carved hex sits on T1's sealed blocked slot; NEIGHBOUR is on T2. */
function carveOnBlockedSlot(state: GameState, location: string): void {
  state.adventure!.fields["GATE"] = field("GATE", "T1", location, BLOCKED_SLOT);
  state.adventure!.fields["INSIDE"] = field("INSIDE", "T1", "empty_field", 1);
  state.adventure!.fields["NEIGHBOUR"] = field("NEIGHBOUR", "T2", "empty_field", 1);
}

describe("PvE module Gates carved onto a Blocked Field are reachable and border-free", () => {
  it("the fixture's slot really is a printed, sealed blocked field (else the test proves nothing)", () => {
    const def = allTileDefinitions[BLOCKED_SLOT_TILE];
    expect(def.fields[BLOCKED_SLOT].location).toBe("blocked_field");
    expect(def.outerImpassable[BLOCKED_SLOT - 1]).toBe(true);
  });

  for (const location of ["dungeon_gate", "calamity_gate", "creature_bank"] as const) {
    it(`a ${location} may be entered from the neighbouring Tile and walked out of`, () => {
      const state = twoTileState(`gate-cross-${location}`);
      carveOnBlockedSlot(state, location);

      expect(canCrossEdge(state, "NEIGHBOUR", "GATE"), "walk IN across the Tile edge").toBe(true);
      expect(canCrossEdge(state, "GATE", "NEIGHBOUR"), "walk OUT across the Tile edge").toBe(true);
      expect(canCrossEdge(state, "INSIDE", "GATE"), "walk in from its own Tile").toBe(true);
      // A hero standing on it may still flip an adjacent face-down Tile.
      expect(heroFieldSealedForDiscovery(state.adventure!, state.adventure!.fields["GATE"])).toBe(
        false
      );
      // The slot primitive itself is untouched — only the hero-vantage reads take
      // the exemption (the documented `isOuterEdgeSealed` invariant).
      expect(isOuterEdgeSealed(state.adventure!, state.adventure!.fields["GATE"])).toBe(true);
    });
  }

  it("CONTROL: the same slot still walls off while it is a plain Blocked Field", () => {
    const state = twoTileState("gate-cross-control");
    carveOnBlockedSlot(state, "blocked_field");

    expect(canCrossEdge(state, "NEIGHBOUR", "GATE")).toBe(false);
    expect(canCrossEdge(state, "GATE", "NEIGHBOUR")).toBe(false);
    expect(
      heroFieldSealedForDiscovery(state.adventure!, state.adventure!.fields["GATE"])
    ).toBe(true);
  });

  it("the printed ring + outer arc are not DRAWN on a carved Gate slot", () => {
    const def = allTileDefinitions[BLOCKED_SLOT_TILE];
    // What the board passes for a carved Gate hex: the slot is borderless.
    const carved = getTileBorderSegments(def, new Set(), {
      borderlessSlots: new Set([BLOCKED_SLOT])
    });
    expect(carved.filter((segment) => segment.slot === BLOCKED_SLOT)).toEqual([]);

    // CONTROL: left as a printed Blocked Field the same slot is fully ringed.
    const printed = getTileBorderSegments(def);
    expect(
      printed.filter((segment) => segment.slot === BLOCKED_SLOT).length
    ).toBeGreaterThanOrEqual(6);
  });
});

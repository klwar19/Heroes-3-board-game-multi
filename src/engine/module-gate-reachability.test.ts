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
 * A Creature Bank replaces a Blocked Field the same way. All three share ONE
 * predicate ({@link isBlockedFieldCarve}) so they can never drift apart.
 *
 * USER RULE 2026-09-05 — "Bank: should respect the border. Only remove the
 * INSIDE border to get in. If there is no border outside, don't add a border."
 * A carve opens the ring's INSIDE half (the edges it shares with the host tile's
 * own fields), so a hero walks in from the tile — which was the whole point of
 * the 2026-08-09 fix (the reported "the Dungeon one has borders all around it,
 * can't access"). It KEEPS the slot's PRINTED outer arc: drawn on the board AND
 * sealing movement AND sealing discovery, exactly like the Blocked Field it
 * replaced. Where the tile prints no arc, nothing is drawn and nothing seals.
 *
 * SUPERSEDED here: the 2026-08-09 (protocol v24) blanket "a carve wears no
 * border at all" reading — this file used to assert cross-tile entry into the
 * two Gates and an open discovery vantage on all three — and the BINH house rule
 * `bank-interior-entry-only`, which sealed EVERY outer edge of a bank whether or
 * not the tile printed one (retired 2026-09-05, see `RETIRED_HOUSE_RULE_IDS`).
 * REACHABILITY: all 102 blocked RING slots in the shipped tile catalog carry
 * their slot's printed arc, so for a bank / Gate carved from a real reveal the
 * retained arc is universal and this reading reproduces the retired rule's ON
 * behaviour. The "no printed arc" half is reachable through a designer
 * STANDALONE bank (no backing tile at all) and through a Field Override, which
 * lands on an arbitrary passable hex.
 */
const BLOCKED_SLOT_TILE = "F3"; // far tile, blocked field on slot 3 with a sealed arc
const BLOCKED_SLOT = 3;
/** A ring slot of the SAME tile the definition prints no outer arc for. */
const OPEN_SLOT = 5;

const CARVE_LOCATIONS = ["dungeon_gate", "calamity_gate", "creature_bank"] as const;

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

/** The carved hex sits on T1's slot `slot`; NEIGHBOUR is on T2. */
function carveOnSlot(state: GameState, location: string, slot = BLOCKED_SLOT): void {
  state.adventure!.fields["GATE"] = field("GATE", "T1", location, slot);
  state.adventure!.fields["INSIDE"] = field("INSIDE", "T1", "empty_field", 1);
  state.adventure!.fields["NEIGHBOUR"] = field("NEIGHBOUR", "T2", "empty_field", 1);
}

describe("a Blocked-Field carve opens the INSIDE ring and keeps the printed outer arc", () => {
  it("the fixture's two slots really differ (else the tests prove nothing)", () => {
    const def = allTileDefinitions[BLOCKED_SLOT_TILE];
    expect(def.fields[BLOCKED_SLOT].location).toBe("blocked_field");
    expect(def.outerImpassable[BLOCKED_SLOT - 1]).toBe(true);
    // The comparison slot carries no printed arc, so "don't add a border" is
    // measurable on the very same tile.
    expect(def.outerImpassable[OPEN_SLOT - 1]).toBe(false);
  });

  for (const location of CARVE_LOCATIONS) {
    it(`a ${location} on a slot with a PRINTED arc: enter from the host Tile, never across the sealed edge`, () => {
      const state = twoTileState(`gate-cross-${location}`);
      carveOnSlot(state, location);

      // The tile's own fields walk in — the carve's reason to exist.
      expect(canCrossEdge(state, "INSIDE", "GATE"), "walk in from its own Tile").toBe(true);
      expect(canCrossEdge(state, "GATE", "INSIDE"), "walk back out inside the Tile").toBe(true);
      // The printed outer arc still walls the tile edge in BOTH directions: a
      // neighbouring tile's hero cannot enter, and a hero on the carve cannot
      // leave that way.
      expect(canCrossEdge(state, "NEIGHBOUR", "GATE"), "walk IN across the Tile edge").toBe(false);
      expect(canCrossEdge(state, "GATE", "NEIGHBOUR"), "walk OUT across the Tile edge").toBe(false);
      // A hero STANDING on it looks out across the same wall, so it may not flip
      // the face-down Tile beyond it either.
      expect(heroFieldSealedForDiscovery(state.adventure!, state.adventure!.fields["GATE"])).toBe(
        true
      );
      // The slot primitive is (still) the single source of truth both reads use.
      expect(isOuterEdgeSealed(state.adventure!, state.adventure!.fields["GATE"])).toBe(true);
    });

    it(`CONTROL: a ${location} on a slot with NO printed arc invents no wall`, () => {
      const state = twoTileState(`gate-open-${location}`);
      carveOnSlot(state, location, OPEN_SLOT);

      expect(canCrossEdge(state, "NEIGHBOUR", "GATE"), "walk IN across the Tile edge").toBe(true);
      expect(canCrossEdge(state, "GATE", "NEIGHBOUR"), "walk OUT across the Tile edge").toBe(true);
      expect(canCrossEdge(state, "INSIDE", "GATE")).toBe(true);
      expect(heroFieldSealedForDiscovery(state.adventure!, state.adventure!.fields["GATE"])).toBe(
        false
      );
    });
  }

  it("CONTROL: the same slot still walls off while it is a plain Blocked Field", () => {
    const state = twoTileState("gate-cross-control");
    carveOnSlot(state, "blocked_field");

    expect(canCrossEdge(state, "NEIGHBOUR", "GATE")).toBe(false);
    expect(canCrossEdge(state, "GATE", "NEIGHBOUR")).toBe(false);
    // ... and unlike a carve, its INSIDE edges stay shut too.
    expect(canCrossEdge(state, "INSIDE", "GATE")).toBe(false);
    expect(
      heroFieldSealedForDiscovery(state.adventure!, state.adventure!.fields["GATE"])
    ).toBe(true);
  });

  it("RENDER agrees: the carved slot draws its printed OUTER arc and nothing else", () => {
    const def = allTileDefinitions[BLOCKED_SLOT_TILE];
    // What the board passes for a carved Gate hex: the slot is borderless.
    const carved = getTileBorderSegments(def, new Set(), {
      borderlessSlots: new Set([BLOCKED_SLOT])
    })
      .filter((segment) => segment.slot === BLOCKED_SLOT)
      .map((segment) => segment.edge)
      .sort();
    // Slot 3 faces local direction 2, so its outward edges are 1, 2, 3.
    expect(carved).toEqual([1, 2, 3]);

    // CONTROL: left as a printed Blocked Field the same slot is fully ringed.
    const printed = getTileBorderSegments(def);
    expect(
      printed.filter((segment) => segment.slot === BLOCKED_SLOT).length
    ).toBeGreaterThanOrEqual(6);

    // CONTROL: the arc-less slot draws nothing when carved.
    const openCarved = getTileBorderSegments(def, new Set(), {
      borderlessSlots: new Set([OPEN_SLOT])
    }).filter((segment) => segment.slot === OPEN_SLOT);
    expect(openCarved).toEqual([]);
  });
});

/**
 * ============================================================================
 *  LOCKED MAP-GEOMETRY INVARIANTS — opening a Map / Ⅱ–Ⅲ tile
 * ============================================================================
 *
 * These cases pin down the border/edge geometry and the "who may open a Map
 * tile" rules. This area has regressed repeatedly, so the rules are frozen here
 * as an explicit, executable contract:
 *
 *   1. The outer-border seal model is per-ring-arc and binary: a ring slot's
 *      three outward edges seal together (`outerImpassable[slot-1]`); the centre
 *      slot is never sealed. `isTileSlotOuterSealed` is the ONE source of truth,
 *      and every border decision (ordinary movement `canCrossEdge`, ordinary
 *      discovery `canHeroDiscoverAdjacentTile`, Far-tile placement reachability
 *      `canHeroReachPlacedTile`) is derived from it.
 *
 *   2. ORDINARY opening of a tile — discovering a face-down tile, or placing a
 *      Far (Ⅱ–Ⅲ) supply tile, on your turn — REQUIRES the border-and-edge
 *      interaction: the hero's own field must touch the tile across an OPEN
 *      (unsealed) outer edge, on the same Surface/Subterranean layer.
 *      *** SCOPE: this half is the house rule `discovery-border-gate`. Its
 *      DEFAULT flipped on 2026-08-02 (five-session branch): it is now a hard
 *      BINH invariant (and part of the Polish package), while Legacy keeps it a
 *      default-OFF toggle whose OFF reading is adjacency-only ("no mention of
 *      blockers or yellow borders"). Every case below builds its game with the
 *      rule ON — the configuration in which this invariant is exactly true — and
 *      none was weakened. The rule-OFF (adjacency-only) behaviour is pinned in
 *      adventure.test.ts. The LAYER rule and rule #1's movement seal are
 *      unconditional. ***
 *
 *   3. The Redwood Observatory and the Speculum artifact are the ONLY ways to
 *      open a tile WITHOUT that gate — no edge, no open border, across yellow
 *      lines, even from the flower's centre. They never go through rule #2.
 *
 * ----------------------------------------------------------------------------
 *  RULE FOR FUTURE CONTRIBUTORS (human or AI):
 *  Do NOT edit, weaken, or delete any case below. They encode behavior that is
 *  correct and must not drift. A NEW border-ignoring source (e.g. a future
 *  artifact/spell/field) is added as a NEW `it(...)` appended at the END, never
 *  by changing these. If a case here ever seems to need changing, that is
 *  almost certainly a regression you are introducing — stop and re-check.
 *  (The one exception on record: the 2026-07-25 scope note on rule #2 above,
 *  which turned a default into a toggle at the USER's explicit instruction and
 *  kept every case running — with the toggle ON — unchanged.)
 * ----------------------------------------------------------------------------
 */
import { describe, expect, it } from "vitest";
import { allTileDefinitions } from "@/data/map/tiles";
import { getTileBorderSegments } from "@/data/map/borders";
import {
  applyAction,
  canCrossEdge,
  canHeroDiscoverAdjacentTile,
  canHeroReachPlacedTile,
  canHeroReachPlacementCenter,
  createAdventureGameState,
  getLegalActions,
  isOuterEdgeSealed,
  isTileSlotOuterSealed,
  observatoryRevealTargets,
  slotDirection,
  tileFootprint,
  tileLatticeNeighbors,
  type GameAction,
  type GameState
} from "./index";
import { instantiateTile } from "./adventure";
import { hexEquals, hexNeighbor, hexSpaceId, type HexCoord } from "./hex";

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

// ===========================================================================
// 1. Border-seal model — the single source of truth, checked over EVERY tile.
//    Any tile added in the future is automatically held to the same contract.
// ===========================================================================
describe("LOCKED: outer-border seal model (all tiles)", () => {
  it("the centre slot is never sealed for any tile", () => {
    for (const id of Object.keys(allTileDefinitions)) {
      expect(isTileSlotOuterSealed(id, 0), `${id} centre`).toBe(false);
    }
  });

  it("isTileSlotOuterSealed mirrors outerImpassable[slot-1] for every ring slot", () => {
    for (const [id, def] of Object.entries(allTileDefinitions)) {
      for (let slot = 1; slot <= 6; slot += 1) {
        expect(isTileSlotOuterSealed(id, slot), `${id} slot ${slot}`).toBe(Boolean(def.outerImpassable[slot - 1]));
      }
    }
  });

  it("a sealed direction draws the full three-edge outer arc on its ring slot", () => {
    for (const [id, def] of Object.entries(allTileDefinitions)) {
      const segments = getTileBorderSegments(def);
      def.outerImpassable.forEach((sealed, direction) => {
        if (!sealed) {
          return;
        }
        const slot = direction + 1;
        for (const edge of [(direction + 5) % 6, direction, (direction + 1) % 6]) {
          expect(
            segments.some((segment) => segment.slot === slot && segment.edge === edge),
            `${id}: sealed dir ${direction} must draw arc edge ${edge} on slot ${slot}`
          ).toBe(true);
        }
      });
    }
  });

  it("a materialized field's seal equals the slot primitive (placed-field path stays in sync)", () => {
    const state = createAdventureGameState({ seed: "lock-seal", difficulty: "normal", rollFirstPlayer: false, houseRules: { "discovery-border-gate": true } });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    const adventure = state.adventure!;
    // S3 and F7 both carry sealed arcs; instantiate one of each in clear space.
    for (const [defId, center] of [
      ["S3", { row: 38, col: 24 }],
      ["F7", { row: 44, col: 30 }]
    ] as const) {
      const tile = instantiateTile(adventure, defId, center, 0, false);
      for (const field of Object.values(adventure.fields)) {
        if (field.tileInstanceId !== tile.id) {
          continue;
        }
        expect(isOuterEdgeSealed(adventure, field), `${defId} field slot ${field.slot}`).toBe(
          isTileSlotOuterSealed(defId, field.slot)
        );
      }
    }
  });
});

// ===========================================================================
// 2. canCrossEdge between two tiles is governed by the same seal primitive.
// ===========================================================================
describe("LOCKED: ordinary movement crossing follows the seal primitive", () => {
  it("blocks a tile-to-tile step iff either field's outer arc is sealed", () => {
    const state = createAdventureGameState({ seed: "lock-cross", difficulty: "normal", rollFirstPlayer: false, houseRules: { "discovery-border-gate": true } });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    const adventure = state.adventure!;
    const O: HexCoord = { row: 40, col: 30 };
    const a = instantiateTile(adventure, "F7", O, 0, false);

    // For each lattice neighbour, drop a fully-open tile and check every shared
    // edge: crossing is allowed exactly when neither side's arc is sealed.
    for (const neighborCenter of tileLatticeNeighbors(O)) {
      if (Object.values(adventure.tiles).some((t) => t.id !== a.id && hexEquals({ row: t.centerRow, col: t.centerCol }, neighborCenter))) {
        continue;
      }
      const b = instantiateTile(adventure, "N1", neighborCenter, 0, false);
      const aFoot = tileFootprint(O, a.rotation).map(hexSpaceId);
      const bFoot = new Set(tileFootprint(neighborCenter, b.rotation).map(hexSpaceId));
      for (const fromId of aFoot) {
        for (let d = 0; d < 6; d += 1) {
          const toId = hexSpaceId(hexNeighbor({ row: Number(fromId.split(":")[1]), col: Number(fromId.split(":")[2]) }, d));
          if (!bFoot.has(toId)) {
            continue;
          }
          const fromField = adventure.fields[fromId]!;
          const toField = adventure.fields[toId]!;
          const expectedOpen =
            !isTileSlotOuterSealed("F7", fromField.slot) && !isTileSlotOuterSealed("N1", toField.slot);
          expect(canCrossEdge(state, fromId, toId), `cross ${fromId}->${toId}`).toBe(expectedOpen);
        }
      }
      // Tidy: remove b so the next neighbour starts from the same clean lattice.
      delete adventure.tiles[b.id];
      for (const id of bFoot) {
        delete adventure.fields[id];
      }
    }
  });
});

// ===========================================================================
// 3. ORDINARY discovery needs an open border + edge (default scenario coords).
//    h:10:6 (S1 slot 5) touches the face-down hub C1@(9,4) across an OPEN edge;
//    h:8:3  (S3 slot 2) touches the SAME hub across a SEALED yellow arc.
// ===========================================================================
describe("LOCKED: ordinary discovery is gated on an open border", () => {
  function freshHub() {
    const state = createAdventureGameState({ seed: "test-seed", difficulty: "normal", rollFirstPlayer: false, houseRules: { "discovery-border-gate": true } });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    const hub = Object.values(state.adventure!.tiles).find((t) => t.centerRow === 9 && t.centerCol === 4)!;
    expect(hub.faceDown).toBe(true);
    state.heroes.hero_p1.movementPoints = 3;
    return { state, hub };
  }

  it("allows discovery from the OPEN-border field (10,6) and spends 1 MP", () => {
    const { state, hub } = freshHub();
    state.heroes.hero_p1.spaceId = "h:10:6";
    expect(canHeroDiscoverAdjacentTile(state, state.heroes.hero_p1, hub)).toBe(true);
    const offered = getLegalActions(state, "p1").some(
      (l) => l.action.type === "DISCOVER_TILE" && l.action.tileInstanceId === hub.id
    );
    expect(offered).toBe(true);
    const next = apply(state, { type: "DISCOVER_TILE", playerId: "p1", heroId: "hero_p1", tileInstanceId: hub.id });
    expect(next.adventure!.tiles[hub.id].faceDown).toBe(false);
    expect(next.heroes.hero_p1.movementPoints).toBe(2);
  });

  it("refuses discovery from the SEALED-border field (8,3) — not offered and rejected", () => {
    const { state, hub } = freshHub();
    state.heroes.hero_p1.spaceId = "h:8:3";
    expect(canHeroDiscoverAdjacentTile(state, state.heroes.hero_p1, hub)).toBe(false);
    const offered = getLegalActions(state, "p1").some(
      (l) => l.action.type === "DISCOVER_TILE" && l.action.tileInstanceId === hub.id
    );
    expect(offered).toBe(false);
    const result = applyAction(state, {
      type: "DISCOVER_TILE",
      playerId: "p1",
      heroId: "hero_p1",
      tileInstanceId: hub.id
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("yellow border");
    expect(result.state.heroes.hero_p1.movementPoints).toBe(3);
    expect(result.state.adventure!.tiles[hub.id].faceDown).toBe(true);
  });

  it("refuses discovery of a non-adjacent face-down tile", () => {
    const { state, hub } = freshHub();
    // The hero stands on its own town centre, nowhere near the hub.
    state.heroes.hero_p1.spaceId = "h:7:2";
    void hub;
    const far = Object.values(state.adventure!.tiles).find(
      (t) => t.faceDown && !(t.centerRow === 9 && t.centerCol === 4)
    );
    if (far) {
      // Whatever face-down tiles exist, none adjacent to the centre field pass.
      expect(canHeroDiscoverAdjacentTile(state, state.heroes.hero_p1, far)).toBe(false);
    }
  });
});

// ===========================================================================
// 4. Far-tile PLACEMENT reachability follows the same open-border requirement.
// ===========================================================================
describe("LOCKED: Far (Ⅱ–Ⅲ) placement needs a reachable (open-border) slot", () => {
  it("can reach the empty notch (6,4) from the open-border field (7,2)", () => {
    const state = createAdventureGameState({ seed: "test-seed", difficulty: "normal", rollFirstPlayer: false, houseRules: { "discovery-border-gate": true } });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    state.heroes.hero_p1.spaceId = "h:7:2";
    // The supply holds opaque UNOPENED markers now, so reach is checked against a
    // concrete Ⅱ–Ⅲ def (F1); every Far tile is reachable at this open slot.
    const tileDefId = "F1";
    const reachable = [0, 1, 2, 3, 4, 5].some((rotation) =>
      canHeroReachPlacedTile(state, state.heroes.hero_p1, tileDefId, { row: 6, col: 4 }, rotation)
    );
    expect(reachable).toBe(true);
  });

  it("cannot reach a placed tile from behind a sealed arc (8,3)", () => {
    const state = createAdventureGameState({ seed: "test-seed", difficulty: "normal", rollFirstPlayer: false, houseRules: { "discovery-border-gate": true } });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    state.heroes.hero_p1.spaceId = "h:8:3";
    // Any concrete Ⅱ–Ⅲ def is unreachable here — the sealed (8,3) arc blocks the
    // crossing regardless of which tile lands (the supply markers are opaque now).
    const tileDefId = "F1";
    // (9,4) is the slot the sealed (8,3) arc faces; the hero cannot step across.
    const reachable = [0, 1, 2, 3, 4, 5].some((rotation) =>
      canHeroReachPlacedTile(state, state.heroes.hero_p1, tileDefId, { row: 9, col: 4 }, rotation)
    );
    expect(reachable).toBe(false);
  });
});

// ===========================================================================
// 5. EXCEPTIONS — Redwood Observatory and Speculum ignore the gate entirely.
// ===========================================================================
function f7Rings(O: HexCoord) {
  const footprint = tileFootprint(O, 0);
  const neighbors = tileLatticeNeighbors(O);
  return [1, 2, 3, 4, 5, 6].map((slot) => {
    const ringHex = footprint[slot];
    const dir = slotDirection(slot, 0) as number;
    const outerHex = hexNeighbor(ringHex, dir);
    const neighborCenter = neighbors.find((n) => tileFootprint(n, 0).some((c) => hexEquals(c, outerHex)));
    return { slot, ringHex, neighborCenter, sealed: isTileSlotOuterSealed("F7", slot) };
  });
}

describe("LOCKED: Redwood Observatory ignores edges and borders", () => {
  it("flips an adjacent face-down tile across a sealed border, standing on the sealed field", () => {
    const state = createAdventureGameState({ seed: "lock-obs", difficulty: "normal", rollFirstPlayer: false, houseRules: { "discovery-border-gate": true } });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    const adventure = state.adventure!;
    state.players.p1.needsHandRefresh = false;
    const O: HexCoord = { row: 40, col: 30 };
    const obsTile = instantiateTile(adventure, "F7", O, 0, false);
    const sealed = f7Rings(O).find((r) => r.sealed && r.neighborCenter)!;
    const faceDown = instantiateTile(adventure, "N1", sealed.neighborCenter!, 0, true);
    state.heroes.hero_p1.spaceId = hexSpaceId(sealed.ringHex);
    adventure.pendingVisit = {
      heroId: "hero_p1",
      playerId: "p1",
      fieldId: hexSpaceId(sealed.ringHex),
      steps: [{ type: "DISCOVER_ADJACENT_TILE" }]
    };

    // Ordinary discovery would be refused here (sealed arc); the Observatory is not.
    expect(canHeroDiscoverAdjacentTile(state, state.heroes.hero_p1, faceDown)).toBe(false);
    expect(observatoryRevealTargets(state, state.heroes.hero_p1, obsTile).map((t) => t.id)).toContain(faceDown.id);
    const reveal = getLegalActions(state, "p1").find((l) => l.label.startsWith("Discover the face-down tile"));
    expect(reveal).toBeTruthy();
    const next = apply(state, reveal!.action);
    expect(next.adventure!.tiles[faceDown.id].faceDown).toBe(false);
    expect(next.adventure!.pendingTileChoice?.heroId).toBeUndefined();
  });
});

describe("LOCKED: Speculum ignores edges and borders", () => {
  it("reveals an adjacent face-down tile across a sealed border, end-to-end", () => {
    const state = createAdventureGameState({ seed: "lock-spec", difficulty: "normal", rollFirstPlayer: false, houseRules: { "discovery-border-gate": true } });
  for (const _pl of Object.values(state.players)) { _pl.canMulligan = false; _pl.needsHandRefresh = false; }
    const adventure = state.adventure!;
    state.players.p1.needsHandRefresh = false;
    const O: HexCoord = { row: 40, col: 30 };
    instantiateTile(adventure, "F7", O, 0, false);
    const sealed = f7Rings(O).find((r) => r.sealed && r.neighborCenter)!;
    const faceDown = instantiateTile(adventure, "N1", sealed.neighborCenter!, 0, true);
    state.heroes.hero_p1.spaceId = hexSpaceId(sealed.ringHex);

    // Ordinary discovery refused at this sealed field…
    const ordinary = applyAction(state, {
      type: "DISCOVER_TILE",
      playerId: "p1",
      heroId: "hero_p1",
      tileInstanceId: faceDown.id
    });
    expect(ordinary.errors).toHaveLength(1);
    expect(ordinary.errors[0].message).toContain("yellow border");

    // …but Speculum's discover option opens it.
    state.players.p1.hand = ["artifact.speculum"];
    const play = getLegalActions(state, "p1").find(
      (l) => l.action.type === "PLAY_CARD" && l.action.cardId === "artifact.speculum" && l.action.optionIndex === 0
    );
    expect(play).toBeTruthy();
    const opened = apply(state, play!.action);
    expect(opened.adventure!.pendingVisit?.steps[0]?.type).toBe("DISCOVER_ADJACENT_TILE");
    const reveal = getLegalActions(opened, "p1").find((l) => l.label.startsWith("Discover the face-down tile"));
    expect(reveal).toBeTruthy();
    const revealed = apply(opened, reveal!.action);
    expect(revealed.adventure!.tiles[faceDown.id].faceDown).toBe(false);
    expect(revealed.adventure!.pendingTileChoice?.heroId).toBeUndefined();
  });
});

// ===========================================================================
// 6. Opening a tile is DIRECT-ADJACENCY, never roundabout reachability.
//    A hero standing at a sealed yellow border may not open a Ⅱ–Ⅲ tile across
//    it, even when a long way around the map would eventually reach the notch.
//    (Regression: the placement gate used a flood fill, so once enough tiles
//    surrounded a notch the sealed edge under the hero was silently bypassed —
//    the "still opens at the yellow border" bug.)
// ===========================================================================
describe("LOCKED: opening a Ⅱ–Ⅲ tile needs the hero's OWN open edge, not a detour", () => {
  it("refuses placement across a sealed edge even when the notch is reachable the long way around", () => {
    const state = createAdventureGameState({ seed: "lock-roundabout", difficulty: "normal", rollFirstPlayer: false, houseRules: { "discovery-border-gate": true } });
    for (const _pl of Object.values(state.players)) {
      _pl.canMulligan = false;
      _pl.needsHandRefresh = false;
    }
    const adventure = state.adventure!;
    // Clean slate we fully control.
    adventure.tiles = {};
    adventure.fields = {};

    const notch: HexCoord = { row: 40, col: 30 };
    const ring = tileLatticeNeighbors(notch); // six lattice slots around the empty notch
    // Surround the notch on FIVE sides with fully-open tiles (N1 has no sealed
    // arcs), leaving one lattice slot for the hero's tile. This makes the notch
    // touch ≥2 tiles AND opens a detour path from the hero right around to it.
    const heroSlotCenter = ring[0];
    for (const c of ring.slice(1)) {
      instantiateTile(adventure, "N1", c, 0, false);
    }

    // The hero's tile (F7 — carries sealed arcs). Rotate it so one ring field that
    // borders the notch has its OUTER ARC SEALED, and stand the hero on it.
    const notchFoot = new Set(tileFootprint(notch, 0).map(hexSpaceId));
    let heroSpace: string | null = null;
    for (let rot = 0; rot < 6 && !heroSpace; rot += 1) {
      // tear down any prior hero tile at this slot
      for (const [id, t] of Object.entries(adventure.tiles)) {
        if (t.centerRow === heroSlotCenter.row && t.centerCol === heroSlotCenter.col) {
          for (const [fid, f] of Object.entries(adventure.fields)) {
            if (f.tileInstanceId === id) delete adventure.fields[fid];
          }
          delete adventure.tiles[id];
        }
      }
      const tile = instantiateTile(adventure, "F7", heroSlotCenter, rot, false);
      const foot = tileFootprint(heroSlotCenter, rot);
      for (let slot = 1; slot <= 6; slot += 1) {
        const cellId = hexSpaceId(foot[slot]);
        const bordersNotch = [0, 1, 2, 3, 4, 5].some((d) => notchFoot.has(hexSpaceId(hexNeighbor(foot[slot], d))));
        if (bordersNotch && isTileSlotOuterSealed("F7", slot)) {
          heroSpace = cellId;
          break;
        }
      }
      if (!heroSpace) {
        for (const [fid, f] of Object.entries(adventure.fields)) {
          if (f.tileInstanceId === tile.id) delete adventure.fields[fid];
        }
        delete adventure.tiles[tile.id];
      }
    }
    expect(heroSpace, "must construct a hero field sealed toward the notch").toBeTruthy();

    state.heroes.hero_p1.spaceId = heroSpace as any;
    state.heroes.hero_p1.movementPoints = 5;

    // The hero's own edge toward the notch is a printed yellow line → NO opening,
    // for the def-blind pre-flip gate AND every concrete rotation.
    expect(canHeroReachPlacementCenter(state, state.heroes.hero_p1, notch)).toBe(false);
    expect(
      [0, 1, 2, 3, 4, 5].some((r) => canHeroReachPlacedTile(state, state.heroes.hero_p1, "F1", notch, r))
    ).toBe(false);

    // PLACE_TILE is rejected with the yellow-border message and spends no MP.
    const mpBefore = state.heroes.hero_p1.movementPoints;
    const result = applyAction(state, {
      type: "PLACE_TILE",
      playerId: "p1",
      heroId: "hero_p1",
      supplyIndex: 0,
      centerRow: notch.row,
      centerCol: notch.col
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("yellow border");
    expect(result.state.heroes.hero_p1.movementPoints).toBe(mpBefore);

    // CONTROL — the notch really IS reachable the long way around: from an OPEN
    // field of one of the surrounding tiles that borders the notch, the very same
    // placement gate returns true. So the ONLY thing blocking the hero above is
    // the sealed edge under their feet, not a disconnected notch.
    const openBorderField = Object.values(adventure.fields).find(
      (f) =>
        !isOuterEdgeSealed(adventure, f) &&
        [0, 1, 2, 3, 4, 5].some((d) => {
          const coord = { row: Number(f.spaceId.split(":")[1]), col: Number(f.spaceId.split(":")[2]) };
          return notchFoot.has(hexSpaceId(hexNeighbor(coord, d)));
        })
    );
    expect(openBorderField, "an open field bordering the notch must exist").toBeTruthy();
    const heroControl = { ...state.heroes.hero_p1, spaceId: openBorderField!.spaceId };
    expect(canHeroReachPlacementCenter(state, heroControl, notch)).toBe(true);
  });
});

// ===========================================================================
// FUTURE CASES: append new border-ignoring sources below this line only.
// Do not modify anything above.
// ===========================================================================

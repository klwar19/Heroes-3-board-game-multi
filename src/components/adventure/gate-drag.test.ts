import { describe, expect, it } from "vitest";
import { hexSpaceId, hexToPixel, legalGateHexPairs, tileLatticeNeighbors } from "@/engine";
import { gateHexPairKey, nearestGateHexPair, type GateHexPair } from "./gate-drag";

// Pure snap math for the designed-gate drag (map designer). Real boundary
// geometry from legalGateHexPairs plus a synthetic exact-tie case.

const HEX = 24;

describe("nearestGateHexPair", () => {
  const surface = { row: 10, col: 10 };
  const cavern = tileLatticeNeighbors(surface)[0];
  const pairs = legalGateHexPairs(surface, cavern);

  it("snaps a point at a pair's own midpoint to exactly that pair — for EVERY legal pair", () => {
    expect(pairs.length).toBeGreaterThanOrEqual(2);
    for (const pair of pairs) {
      const gate = hexToPixel(pair.gateHex, HEX);
      const entrance = hexToPixel(pair.entranceHex, HEX);
      const midpoint = { x: (gate.x + entrance.x) / 2, y: (gate.y + entrance.y) / 2 };
      const snapped = nearestGateHexPair(midpoint, pairs, HEX);
      expect(snapped, `midpoint of ${gateHexPairKey(pair)} snaps home`).not.toBeNull();
      expect(gateHexPairKey(snapped!)).toBe(gateHexPairKey(pair));
    }
  });

  it("a point far off to one side snaps to the nearest pair, not the first-listed one", () => {
    // Rank the pairs by their midpoint x and probe far beyond whichever extreme
    // is NOT the first-listed pair — so the assertion fails if the distance
    // comparison is dropped (a "return pairs[0]" stub).
    const midX = (pair: GateHexPair) => (hexToPixel(pair.gateHex, HEX).x + hexToPixel(pair.entranceHex, HEX).x) / 2;
    const midY = (pair: GateHexPair) => (hexToPixel(pair.gateHex, HEX).y + hexToPixel(pair.entranceHex, HEX).y) / 2;
    const byX = [...pairs].sort((left, right) => midX(left) - midX(right));
    const rightmost = byX[byX.length - 1];
    const leftmost = byX[0];
    const target = gateHexPairKey(rightmost) === gateHexPairKey(pairs[0]) ? leftmost : rightmost;
    const away = target === leftmost ? -500 : 500;
    expect(gateHexPairKey(target)).not.toBe(gateHexPairKey(pairs[0]));
    const probe = { x: midX(target) + away, y: midY(target) };
    expect(gateHexPairKey(nearestGateHexPair(probe, pairs, HEX)!)).toBe(gateHexPairKey(target));
  });

  it("breaks an exact distance tie deterministically (lower pair key wins)", () => {
    // Two synthetic pairs mirrored around the probe: identical midpoint distance.
    const a: GateHexPair = { gateHex: { row: 0, col: 0 }, entranceHex: { row: 0, col: 1 } };
    const b: GateHexPair = { gateHex: { row: 0, col: 3 }, entranceHex: { row: 0, col: 4 } };
    const midpoint = (pair: GateHexPair) => ({
      x: (hexToPixel(pair.gateHex, HEX).x + hexToPixel(pair.entranceHex, HEX).x) / 2,
      y: (hexToPixel(pair.gateHex, HEX).y + hexToPixel(pair.entranceHex, HEX).y) / 2
    });
    const probe = {
      x: (midpoint(a).x + midpoint(b).x) / 2,
      y: (midpoint(a).y + midpoint(b).y) / 2
    };
    const expectedKey = [gateHexPairKey(a), gateHexPairKey(b)].sort()[0];
    // The same winner regardless of input order.
    expect(gateHexPairKey(nearestGateHexPair(probe, [a, b], HEX)!)).toBe(expectedKey);
    expect(gateHexPairKey(nearestGateHexPair(probe, [b, a], HEX)!)).toBe(expectedKey);
    expect(hexSpaceId(nearestGateHexPair(probe, [b, a], HEX)!.gateHex)).toBe("h:0:0");
  });

  it("returns null only for an empty pair list", () => {
    expect(nearestGateHexPair({ x: 0, y: 0 }, [], HEX)).toBeNull();
    expect(nearestGateHexPair({ x: 9999, y: -9999 }, pairs, HEX)).not.toBeNull();
  });
});

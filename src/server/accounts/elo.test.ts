import { describe, expect, it } from "vitest";
import { computeRatings, ELO_FLOOR, ELO_K, ELO_START, expectedScore } from "./elo";

describe("Elo ratings", () => {
  it("equal ratings each expect 0.5", () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5, 6);
  });

  it("a 2-player upset: equal ratings move by exactly K/2 (zero-sum)", () => {
    const out = computeRatings([
      { id: "A", rating: 1200, result: "win" },
      { id: "B", rating: 1200, result: "loss" }
    ]);
    // Winner +16, loser -16 at equal ratings (K=32, expected 0.5).
    expect(out.get("A")).toBe(ELO_START + ELO_K / 2);
    expect(out.get("B")).toBe(ELO_START - ELO_K / 2);
    // Zero-sum: total change nets to zero.
    expect(out.get("A")! - 1200 + (out.get("B")! - 1200)).toBe(0);
  });

  it("beating a much weaker opponent yields a small gain (monotonic)", () => {
    const closeGame = computeRatings([
      { id: "A", rating: 1200, result: "win" },
      { id: "B", rating: 1200, result: "loss" }
    ]);
    const easyWin = computeRatings([
      { id: "A", rating: 1600, result: "win" },
      { id: "B", rating: 1000, result: "loss" }
    ]);
    const closeGain = closeGame.get("A")! - 1200;
    const easyGain = easyWin.get("A")! - 1600;
    expect(easyGain).toBeGreaterThan(0);
    expect(easyGain).toBeLessThan(closeGain);
  });

  it("winner-takes-field: winner gains against EACH loser", () => {
    const out = computeRatings([
      { id: "W", rating: 1200, result: "win" },
      { id: "L1", rating: 1200, result: "loss" },
      { id: "L2", rating: 1200, result: "loss" }
    ]);
    // Two equal pairings → +16 each → +32.
    expect(out.get("W")).toBe(1200 + 32);
    expect(out.get("L1")).toBe(1200 - 16);
    expect(out.get("L2")).toBe(1200 - 16);
  });

  it("never falls below the floor", () => {
    const out = computeRatings([
      { id: "W", rating: 1600, result: "win" },
      { id: "L", rating: ELO_FLOOR, result: "loss" }
    ]);
    expect(out.get("L")).toBeGreaterThanOrEqual(ELO_FLOOR);
  });

  it("no decisive pairing leaves ratings untouched", () => {
    const out = computeRatings([{ id: "A", rating: 1300, result: "win" }]);
    expect(out.get("A")).toBe(1300);
  });
});

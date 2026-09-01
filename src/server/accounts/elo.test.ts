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

  it("3+ players: winner gains most, every loser loses, and later places lose more", () => {
    const out = computeRatings([
      { id: "W", rating: 1200, result: "win", placement: 1, mmrRole: "winner" },
      { id: "P2", rating: 1200, result: "loss", placement: 2, mmrRole: "minor" },
      { id: "P3", rating: 1200, result: "loss", placement: 3, mmrRole: "last" }
    ]);
    expect(out.get("W")).toBe(1216);
    expect(out.get("P2")).toBe(1195);
    expect(out.get("P3")).toBe(1189);
    expect([...out.values()].reduce((sum, rating) => sum + rating, 0)).toBe(3600);
  });

  it("charges tied non-winners the same small loss when no sole last can be decided", () => {
    const out = computeRatings([
      { id: "W", rating: 1200, result: "win", placement: 1, mmrRole: "winner" },
      { id: "A", rating: 1200, result: "loss", placement: 2, mmrRole: "neutral" },
      { id: "B", rating: 1200, result: "loss", placement: 2, mmrRole: "neutral" }
    ]);
    expect(out.get("W")).toBe(1216);
    expect(out.get("A")).toBe(1192);
    expect(out.get("B")).toBe(1192);
    expect([...out.values()].reduce((sum, rating) => sum + rating, 0)).toBe(3600);
  });

  it("4 players stays balanced: winner +16, ordered losers pay only 3/5/8", () => {
    const out = computeRatings([
      { id: "W", rating: 1200, result: "win", placement: 1, mmrRole: "winner" },
      { id: "P2", rating: 1200, result: "loss", placement: 2, mmrRole: "minor" },
      { id: "P3", rating: 1200, result: "loss", placement: 3, mmrRole: "minor" },
      { id: "P4", rating: 1200, result: "loss", placement: 4, mmrRole: "last" },
    ]);
    expect([out.get("W"), out.get("P2"), out.get("P3"), out.get("P4")]).toEqual([
      1216, 1197, 1195, 1192,
    ]);
    expect([...out.values()].reduce((sum, rating) => sum + rating, 0)).toBe(4800);
  });

  it("keeps placement order dominant even when loser ratings are far apart", () => {
    const out = computeRatings([
      { id: "W", rating: 1200, result: "win", placement: 1 },
      { id: "P2", rating: 2400, result: "loss", placement: 2 },
      { id: "P3", rating: 500, result: "loss", placement: 3 },
    ]);
    const runnerUpLoss = 2400 - out.get("P2")!;
    const lastPlaceLoss = 500 - out.get("P3")!;
    expect(runnerUpLoss).toBeGreaterThan(0);
    expect(lastPlaceLoss).toBeGreaterThanOrEqual(runnerUpLoss);
    expect(out.get("W")! - 1200).toBe(runnerUpLoss + lastPlaceLoss);
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

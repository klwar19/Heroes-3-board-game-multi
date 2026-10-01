import { describe, expect, it } from "vitest";
import { sec } from "../clock";
import type { GarrisonState } from "../sim";
import {
  OC_NAME_MAX, cleanOcName, ocBoardKey, ocMinTicksForWave, ocPublicId, ocRunSummary, ocScore, ocScoreText, ocSummaryProblem, type OcRunSummary
} from "./scores";

const TODAY = "2026-10-01";

function siege(over: Partial<OcRunSummary> = {}): OcRunSummary {
  const wave = over.wave ?? 12;
  return { mode: "endless", won: false, wave, kills: 150, ticks: ocMinTicksForWave(wave) + sec(120), lost: 3, placed: 20, hero: "catherine", ...over };
}

describe("Order & Chaos score formula", () => {
  it("ranks sieges by the wave reached first; foes slain only break ties", () => {
    // A wave further always wins, however many foes the shorter run slew.
    expect(ocScore(siege({ wave: 11, kills: 0 }))).toBeGreaterThan(ocScore(siege({ wave: 10, kills: 9999 })));
    expect(ocScore(siege({ wave: 10, kills: 300 }))).toBeGreaterThan(ocScore(siege({ wave: 10, kills: 299 })));
    expect(ocScore(siege({ wave: 23, kills: 412 }))).toBe(230_412);
    // Kills are capped below one wave's worth.
    expect(ocScore(siege({ wave: 10, kills: 50_000 }))).toBe(ocScore(siege({ wave: 10, kills: 9999 })));
  });

  it("ranks raids by clear time and only when won", () => {
    const raid = (ticks: number, won = true): OcRunSummary => ({ mode: "raid", raid: "r3", won, wave: 0, kills: 4, ticks, lost: 9, placed: 0 });
    expect(ocScore(raid(sec(90)))).toBeGreaterThan(ocScore(raid(sec(120))));
    expect(ocScore(raid(sec(90), false))).toBe(0);
    expect(ocScoreText("raid", { wave: 0, kills: 0, ticks: sec(222) })).toBe("Broke every lane in 3:42");
    expect(ocScoreText("endless", { wave: 7, kills: 1, ticks: 0 })).toBe("Wave 7 · 1 foe slain");
  });

  it("reads a finished run straight from the simulation state", () => {
    const state = {
      tick: 4321, outcome: { winner: "atk", reason: "" }, director: { wave: 17 },
      stats: { kills: 210, placed: 33, lost: 5, goldEarned: 0, goldSpent: 0, surgesUsed: 0 }
    } as unknown as GarrisonState;
    expect(ocRunSummary(state, "endless", { hero: "gelu" })).toEqual({ mode: "endless", won: false, wave: 17, kills: 210, ticks: 4321, lost: 5, placed: 33, hero: "gelu" });
    expect(ocRunSummary(state, "raid", { raid: "r2" })).toMatchObject({ mode: "raid", raid: "r2", won: true, wave: 0 });
    expect(ocRunSummary(state, "daily", { day: TODAY, setup: "0badc0de" })).toMatchObject({ mode: "daily", day: TODAY, setup: "0badc0de", won: false });
  });
});

describe("tally-board plausibility checks", () => {
  it("accepts a plausible siege and a plausible raid", () => {
    expect(ocSummaryProblem(siege(), TODAY)).toBeNull();
    expect(ocSummaryProblem({ mode: "raid", raid: "r1", won: true, wave: 0, kills: 12, ticks: sec(150), lost: 8, placed: 0 }, TODAY)).toBeNull();
  });

  it("turns away runs the rules can't produce", () => {
    // Waves come at most every 6 s after the first at 20 s.
    expect(ocSummaryProblem(siege({ wave: 40, ticks: sec(60) }), TODAY)).toMatch(/too fast/i);
    expect(ocSummaryProblem(siege({ wave: 40, ticks: ocMinTicksForWave(40) }), TODAY)).toBeNull();
    expect(ocSummaryProblem(siege({ wave: 2, kills: 5000 }), TODAY)).toMatch(/foes slain/i);
    expect(ocSummaryProblem(siege({ won: true }), TODAY)).toMatch(/never ends in a win/i);
    expect(ocSummaryProblem({ mode: "raid", raid: "r1", won: false, wave: 0, kills: 1, ticks: sec(90), lost: 0, placed: 0 }, TODAY)).toMatch(/broken raid/i);
    expect(ocSummaryProblem({ mode: "raid", raid: "../x", won: true, wave: 0, kills: 1, ticks: sec(90), lost: 0, placed: 0 }, TODAY)).toMatch(/unknown raid/i);
    expect(ocSummaryProblem(siege({ kills: 1.5 }), TODAY)).not.toBeNull();
    expect(ocSummaryProblem(null, TODAY)).not.toBeNull();
  });

  it("takes a Daily Siege only for today's or yesterday's orders", () => {
    const daily = (day: string, setup = "0123abcd") => siege({ mode: "daily", day, setup });
    expect(ocSummaryProblem(daily(TODAY), TODAY)).toBeNull();
    expect(ocSummaryProblem(daily("2026-09-30"), TODAY)).toBeNull();
    expect(ocSummaryProblem(daily("2026-09-29"), TODAY)).toMatch(/closed/i);
    expect(ocSummaryProblem(daily(TODAY, "nothex!!"), TODAY)).toMatch(/fingerprint/i);
  });
});

describe("names, board ids and public ids", () => {
  it("cleans names for the board", () => {
    const zw = String.fromCharCode(0x200b);
    const rlo = String.fromCharCode(0x202e);
    expect(cleanOcName(`  Crag${zw}  Hack \n`)).toBe("Crag Hack");
    expect(cleanOcName(`${rlo}evil${String.fromCharCode(7)}`)).toBe("evil");
    expect(cleanOcName("x".repeat(50))).toHaveLength(OC_NAME_MAX);
    expect(cleanOcName("   ")).toBeNull();
    expect(cleanOcName(42)).toBeNull();
  });

  it("keeps each board under its own id, a Daily Siege board per setup", () => {
    expect(ocBoardKey({ mode: "endless", view: "all" })).toBe("all:endless");
    expect(ocBoardKey({ mode: "endless", view: "today", day: TODAY })).toBe(`day:${TODAY}:endless`);
    expect(ocBoardKey({ mode: "raid", view: "today", day: TODAY, raid: "r4" })).toBe(`day:${TODAY}:raid:r4`);
    expect(ocBoardKey({ mode: "raid", view: "all" })).toBeNull();
    expect(ocBoardKey({ mode: "daily", view: "today", day: TODAY, setup: "0123abcd" })).toBe(`day:${TODAY}:daily:0123abcd`);
    expect(ocBoardKey({ mode: "daily", view: "today", day: TODAY })).toBeNull();
    expect(ocBoardKey({ mode: "daily", view: "all" })).toBe("all:daily");
  });

  it("derives a stable public id that doesn't reveal the private one", () => {
    const a = ocPublicId("oc_0123456789abcdef0123456789abcdef");
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(ocPublicId("oc_0123456789abcdef0123456789abcdef")).toBe(a);
    expect(ocPublicId("oc_0123456789abcdef0123456789abcdee")).not.toBe(a);
  });
});

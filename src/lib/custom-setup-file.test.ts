/**
 * "Custom setting" file save/load — pure helpers. Pins: the file round-trips
 * the whole options object (map included) with customMode forced on, garbage
 * and foreign files are refused with a reason, and a file written by another
 * build stays loadable (patch tolerance is downstream: SET_GAME_OPTIONS skips
 * unknown fields and rejects invalid values with its own message).
 */
import { describe, expect, it } from "vitest";
import { defaultGameSetupOptions } from "@/engine";
import { scenarioDefinitions } from "@/data/map/scenarios";
import { buildCustomSetupFile, customSetupFileName, parseCustomSetupFile } from "./custom-setup-file";

function someOptions() {
  const scenario = Object.values(scenarioDefinitions)[0];
  return { ...defaultGameSetupOptions(scenario), difficulty: "hard" as const, customMapName: "My map" };
}

describe("custom setup files", () => {
  it("round-trips the current options with customMode forced on", () => {
    const options = someOptions();
    const file = buildCustomSetupFile(options, "  Duel rules  ");
    expect(file.name).toBe("Duel rules");

    const parsed = parseCustomSetupFile(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.name).toBe("Duel rules");
    expect(parsed.sameEngineVersion).toBe(true);
    expect(parsed.options).toEqual({ ...options, customMode: true });
  });

  it("the built payload is a deep clone — later edits to the live options never mutate it", () => {
    const options = someOptions();
    const file = buildCustomSetupFile(options, "frozen");
    options.customMapName = "Edited afterwards";
    expect(file.options.customMapName).toBe("My map");
  });

  it("refuses garbage, foreign files and files without usable options (CONTROLs)", () => {
    expect(parseCustomSetupFile("not json").ok).toBe(false);
    expect(parseCustomSetupFile(JSON.stringify({ kind: "something-else" })).ok).toBe(false);
    expect(parseCustomSetupFile(JSON.stringify({ kind: "homm3bg-custom-setup", options: null })).ok).toBe(false);
    expect(
      parseCustomSetupFile(JSON.stringify({ kind: "homm3bg-custom-setup", options: { noScenario: true } })).ok
    ).toBe(false);
  });

  it("a file from another build stays loadable, flagged for the version warning (patch tolerance)", () => {
    const file = buildCustomSetupFile(someOptions(), "old file");
    const foreign = { ...file, engineSignature: "older-build" };
    const parsed = parseCustomSetupFile(JSON.stringify(foreign));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.sameEngineVersion).toBe(false);
    expect(parsed.options.customMode).toBe(true);
  });

  it("derives a safe download filename", () => {
    expect(customSetupFileName("Duel: Bin's rules!")).toBe("duel-bin-s-rules.homm3bg-setup.json");
    expect(customSetupFileName("   ")).toBe("custom-setup.homm3bg-setup.json");
  });
});

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import soundManifest from "../../public/sounds/manifest.json";
import { coreUnitDefinitions } from "./factions/units";
import { unitSoundKey, type UnitSoundAction } from "./unit-sounds";

const soundLibrary = soundManifest as Record<string, { src?: string }>;
const roster = Object.values(coreUnitDefinitions);
const coreActions: UnitSoundAction[] = ["attack", "defend", "hurt", "death", "move"];

describe("unit combat voices", () => {
  it("knows the full roster", () => {
    expect(roster.length).toBeGreaterThan(0);
    const voiceless = roster
      .filter((unit) => !unitSoundKey(unit.id, "attack"))
      .map((unit) => unit.id);
    expect(voiceless).toEqual([]);
  });

  it("resolves every combat action for every unit to a manifest entry", () => {
    const missing: string[] = [];
    for (const unit of roster) {
      const actions: UnitSoundAction[] =
        unit.type === "ranged" ? [...coreActions, "shoot"] : coreActions;
      for (const action of actions) {
        const key = unitSoundKey(unit.id, action);
        if (!key || !soundLibrary[key]?.src) {
          missing.push(`${unit.id}: ${action}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("only resolves to clips that exist on disk", () => {
    const lost = new Set<string>();
    for (const unit of roster) {
      for (const action of [...coreActions, "shoot"] as UnitSoundAction[]) {
        const key = unitSoundKey(unit.id, action);
        const src = key ? soundLibrary[key]?.src : undefined;
        if (!src) {
          continue;
        }
        const file = fileURLToPath(new URL(`../../public${src}`, import.meta.url));
        if (!existsSync(file)) {
          lost.add(src);
        }
      }
    }
    expect([...lost]).toEqual([]);
  });

  it("uses the documented shared-audio pairings", () => {
    // The original game shares these creatures' files (docs/sound-mapping.md).
    expect(unitSoundKey("castle.marksmen", "shoot")).toBe("units/archer-shoot");
    expect(unitSoundKey("necropolis.zombies", "attack")).toBe("units/zombie-lord-attack");
    expect(unitSoundKey("rampart.elves", "shoot")).toBe("units/wood-elf-shoot");
    expect(unitSoundKey("rampart.dendroids", "death")).toBe("units/dendroid-soldier-death");
    // Neutral twins speak with the same voice as their faction unit.
    expect(unitSoundKey("neutral.marksmen", "shoot")).toBe("units/archer-shoot");
  });

  it("lets melee-voiced creatures cover a missing strike variant", () => {
    // Griffins have no ranged clip: a (hypothetical) shoot falls back to attack.
    expect(unitSoundKey("castle.griffins", "shoot")).toBe("units/griffin-attack");
  });

  it("stays silent for unknown units", () => {
    expect(unitSoundKey("castle.unknown", "attack")).toBeUndefined();
  });
});

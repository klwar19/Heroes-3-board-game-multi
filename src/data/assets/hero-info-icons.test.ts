import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ABILITY_SYMBOL_ICONS,
  HERO_INFO_STAT_ICONS,
  TILE_BACK_IMAGES,
  abilitySymbolIcon
} from "./homm-assets";
import { coreHeroDefinitions } from "@/data/factions/core";

const PUBLIC = join(process.cwd(), "public");
const asFile = (assetPath: string) => join(PUBLIC, assetPath);

/**
 * These upgraded graphics are only "done" if the images actually exist on disk —
 * a symbol wired to a missing file is a broken <img>, the decorative-feature
 * trap this repo forbids. Each test fails if a referenced asset is absent.
 */
describe("Hero-info & map-tile graphics — every referenced asset exists", () => {
  it("ships all six map-tile back covers", () => {
    for (const [group, path] of Object.entries(TILE_BACK_IMAGES)) {
      expect(existsSync(asFile(path)), `${group}: ${path}`).toBe(true);
    }
  });

  it("ships the four hero-statistic symbols", () => {
    for (const [stat, path] of Object.entries(HERO_INFO_STAT_ICONS)) {
      expect(existsSync(asFile(path)), `${stat}: ${path}`).toBe(true);
    }
  });

  it("ships every registered ability symbol", () => {
    for (const [skill, path] of Object.entries(ABILITY_SYMBOL_ICONS)) {
      expect(existsSync(asFile(path)), `${skill}: ${path}`).toBe(true);
    }
  });

  it("resolves a real symbol file for EVERY core hero's starting ability", () => {
    const missing: string[] = [];
    for (const hero of Object.values(coreHeroDefinitions)) {
      const src = abilitySymbolIcon(hero.startingAbilityCardId);
      if (!src || !existsSync(asFile(src))) {
        missing.push(`${hero.id} (${hero.startingAbilityCardId}) -> ${src ?? "unmapped"}`);
      }
    }
    expect(missing, `heroes without a resolvable ability symbol:\n${missing.join("\n")}`).toEqual([]);
  });

  it("maps the aliased ability ids to their printed emblem", () => {
    // Offense prints the Attack emblem; a basic school ability prints its plain
    // school emblem — both differ from a naive `ability.<name>` lookup.
    expect(abilitySymbolIcon("ability.offense")).toBe("/assets/ability-symbols/attack.webp");
    expect(abilitySymbolIcon("ability.basic_fire_magic")).toBe("/assets/ability-symbols/fire_magic.webp");
    expect(abilitySymbolIcon("ability.wisdom")).toBe("/assets/ability-symbols/wisdom.webp");
    // An unknown ability id resolves to nothing rather than a broken path.
    expect(abilitySymbolIcon("ability.not_a_real_skill")).toBeUndefined();
    expect(abilitySymbolIcon(undefined)).toBeUndefined();
  });
});

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { cardLibrary } from "@/data/cards/library";
import { coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import {
  FUYUKI_RANK_ABILITY_ICONS,
  HIDDEN_LEAF_RANK_ABILITY_ICONS,
  unitRankAbilityIcon
} from "@/data/units/experience";
import { SPECIALTY_ICON_BY_HERO } from "@/components/specialty-card-data";

// ---------------------------------------------------------------------------
// ANIME SPECIALTY REDESIGN (2026-08-25) — the Fuyuki / Hidden Leaf / Azure
// Breeze / Heavenly Demon MIGHT heroes dropped the generic unit-buff trio for
// distinct sets, each a rethemedSpecialty clone of a shipped, behaviour-tested
// source. This file pins:
//   (1) clone ↔ source MECHANICAL identity (effects normalized over the
//       display-only `label`/`name` strings, plus timing/trigger/target) — the
//       behaviour tests on each source therefore cover the clone, and a later
//       hand-edit that silently diverges a clone's mechanics fails here;
//   (2) the deliberate display re-flavours (Xuanming's labels, Jianxu's aura
//       names) and that they touched NOTHING mechanical;
//   (3) the two KEPT unit specialists as mutation controls;
//   (4) the redesigned heroes' specialty icons exist on disk;
//   (5) the new Fuyuki / Hidden Leaf unit-XP rank emblems (map ↔ roster, files
//       on disk, one distinct emblem per unit line).
// ---------------------------------------------------------------------------

const ROMAN: Record<1 | 4 | 6, string> = { 1: "I", 4: "IV", 6: "VI" };
const LEVELS = [1, 4, 6] as const;

/** hero slug → [source slug, new specialty name] */
const REDESIGNS: Record<string, [string, string]> = {
  shirou_emiya: ["miriam", "Projection Magecraft"],
  rin_tohsaka: ["ciele", "Gandr Shot"],
  kiritsugu_emiya: ["cyra", "Time Alter"],
  kirei_kotomine: ["ash", "Black Keys"],
  sasuke: ["solmyr", "Chidori Stream"],
  kakashi_hatake: ["adelaide", "Raikiri · Sharingan"],
  shikamaru_nara: ["zilare", "Shadow Possession"],
  jiraiya: ["luna", "Toad Oil Flame Bomb"],
  qingyun: ["xyron", "Sword Qi Tempest"],
  jianxu: ["miku", "Seven-Star Trap Array"],
  yulian: ["merist", "Jade Body Arts"],
  xuedao: ["septienna", "Blood Ripple"],
  guiyan: ["glacius", "Ghostfire Coil"],
  xuanming: ["oidana", "Legion of Bones"]
};

/** Strip the display-only strings so mechanics compare exactly. */
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (key === "label" || key === "name") {
        continue;
      }
      out[key] = normalize(entry);
    }
    return out;
  }
  return value;
}

describe("anime specialty redesign — clone ↔ source mechanical identity", () => {
  it.each(Object.entries(REDESIGNS))("%s carries a mechanically identical clone of %s", (heroSlug, [sourceSlug, name]) => {
    for (const level of LEVELS) {
      const clone = cardLibrary[`specialty.${heroSlug}.${level}`];
      const source = cardLibrary[`specialty.${sourceSlug}.${level}`];
      expect(clone, `specialty.${heroSlug}.${level}`).toBeDefined();
      expect(source, `specialty.${sourceSlug}.${level}`).toBeDefined();
      expect(clone.kind).toBe("hero-specialty");
      expect(clone.implementationStatus).toBe("implemented");
      expect(clone.name).toBe(`${name} ${ROMAN[level]}`);
      // Art-less on purpose: the native renderer draws the hero's own portrait.
      expect(clone.assets?.cardImage, `${heroSlug} ${level} must stay art-less`).toBeUndefined();
      // The MECHANICS are byte-identical to the source (display strings aside),
      // so every behaviour test on the source card covers this clone.
      expect(normalize(clone.effect)).toEqual(normalize(source.effect));
      expect(clone.timing).toBe(source.timing);
      expect(clone.phaseLimit ?? null).toEqual(source.phaseLimit ?? null);
      expect(clone.trigger ?? null).toEqual(source.trigger ?? null);
      expect(clone.target ?? null).toEqual(source.target ?? null);
      // rethemedSpecialty swapped the hero slug tag.
      expect(clone.tags).toContain(heroSlug);
      expect(clone.tags).not.toContain(sourceSlug);
      // No redesigned set is a unit-doubling buff any more.
      expect(JSON.stringify(clone.effect)).not.toContain("doubleForUnitName");
    }
  });

  it("Jianxu / Yulian keep their engine-backed Innate line on every level", () => {
    for (const heroSlug of ["jianxu", "yulian"] as const) {
      for (const level of LEVELS) {
        const prose = (cardLibrary[`specialty.${heroSlug}.${level}`]?.tags ?? []).filter((tag) => /\s/u.test(tag));
        expect(prose.some((tag) => tag.includes("Innate")), `${heroSlug} ${level}`).toBe(true);
      }
    }
  });

  it("Xuanming's labels are re-flavoured while the effects stay Diplomacy's, verbatim", () => {
    for (const level of LEVELS) {
      const clone = cardLibrary[`specialty.xuanming.${level}`];
      const source = cardLibrary[`specialty.oidana.${level}`];
      const cloneOptions = (clone.effect as { options?: Array<{ label?: string; effect?: unknown }> }).options ?? [];
      const sourceOptions = (source.effect as { options?: Array<{ label?: string; effect?: unknown }> }).options ?? [];
      expect(cloneOptions.length).toBe(sourceOptions.length);
      for (const [index, option] of cloneOptions.entries()) {
        const sourceLabel = sourceOptions[index]?.label ?? "";
        if (sourceLabel.startsWith("Diplomacy:")) {
          expect(option.label).toBe(sourceLabel.replace("Diplomacy:", "Raise the fallen:"));
        } else {
          expect(option.label).toBe(sourceLabel);
        }
        expect(normalize(option.effect)).toEqual(normalize(sourceOptions[index]?.effect));
      }
    }
    // The VI ongoing +1 Attack to all own NEUTRAL units keeps its real variant.
    const six = cardLibrary["specialty.xuanming.6"].effect as {
      options?: Array<{ effect?: { type?: string; variant?: string; amount?: number; name?: string } }>;
    };
    const buff = six.options?.find((option) => option.effect?.type === "CREATE_VARIANT_ATTACK_BUFF")?.effect;
    expect(buff).toMatchObject({ type: "CREATE_VARIANT_ATTACK_BUFF", variant: "neutral", amount: 1, name: "Legion of Bones" });
  });

  it("Jianxu's aura effects wear the array name; the miku slug tag is re-themed too", () => {
    const slow = cardLibrary["specialty.jianxu.1"].effect as { type?: string; name?: string };
    expect(slow).toMatchObject({ type: "SLOW_ALL_ENEMIES", name: "Seven-Star Trap Array" });
    const heal = cardLibrary["specialty.jianxu.4"].effect as { type?: string; name?: string };
    expect(heal).toMatchObject({ type: "CREATE_HEAL_ON_ATTACKED", name: "Seven-Star Trap Array" });
    for (const level of LEVELS) {
      const tags = cardLibrary[`specialty.jianxu.${level}`].tags ?? [];
      expect(tags).not.toContain("voice-of-angel");
      expect(tags).toContain("seven-star-trap-array");
    }
  });

  it("MUTATION CONTROL: the two kept unit specialists still double on their signature unit", () => {
    for (const [heroSlug, unitName, factionId] of [
      ["illyasviel", "Heracles", "fuyuki"],
      ["naruto", "Nine-Tails Chakra Avatar", "hidden_leaf"]
    ] as const) {
      const effect = cardLibrary[`specialty.${heroSlug}.1`]?.effect;
      expect(effect?.type).toBe("CHOOSE_ONE");
      const doubled =
        effect?.type === "CHOOSE_ONE" &&
        effect.options[0]?.effect?.type === "ADD_COMBAT_STAT" &&
        effect.options[0].effect.doubleForUnitName;
      expect(doubled, heroSlug).toBe(unitName);
      const names = coreFactionDefinitions[factionId].units.map((id) => coreUnitDefinitions[id]?.name);
      expect(names).toContain(unitName);
    }
  });

  it("every redesigned hero renders natively with an on-disk specialty icon", () => {
    for (const heroSlug of Object.keys(REDESIGNS)) {
      expect(coreHeroDefinitions[heroSlug], heroSlug).toBeDefined();
      const icon = SPECIALTY_ICON_BY_HERO[heroSlug];
      expect(icon, `${heroSlug} needs a specialty icon`).toBeTruthy();
      const file = join(process.cwd(), "public", icon!.replace(/^\//, ""));
      expect(existsSync(file), icon).toBe(true);
      expect(statSync(file).size, icon).toBeGreaterThan(10_000);
    }
  });
});

describe("Fuyuki / Hidden Leaf unit-XP rank emblems", () => {
  it("one bespoke on-disk emblem per unit line, resolved by unitRankAbilityIcon", () => {
    const rosters: Array<[Record<string, string>, string]> = [
      [FUYUKI_RANK_ABILITY_ICONS, "fuyuki"],
      [HIDDEN_LEAF_RANK_ABILITY_ICONS, "hidden_leaf"]
    ];
    const seen = new Set<string>();
    for (const [icons, factionId] of rosters) {
      const roster = coreFactionDefinitions[factionId].units;
      expect(Object.keys(icons).sort()).toEqual([...roster].sort());
      for (const unitId of roster) {
        // The resolver really serves the bespoke emblem (not the generic
        // ability icon or the slayer fallback).
        const resolved = unitRankAbilityIcon("commander-max-damage", unitId);
        expect(resolved).toBe(icons[unitId]);
        expect(seen.has(resolved), `${unitId} emblem must be distinct`).toBe(false);
        seen.add(resolved);
        const file = join(process.cwd(), "public", resolved.replace(/^\//, ""));
        expect(existsSync(file), resolved).toBe(true);
        expect(statSync(file).size, resolved).toBeGreaterThan(10_000);
      }
    }
    expect(seen.size).toBe(15);
  });
});

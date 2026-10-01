import { describe, expect, it } from "vitest";

import { hasMediaFile, mediaFileInfo } from "@/lib/media-manifest";
import { cardLibrary } from "@/data/cards/library";
import { coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import {
  FUYUKI_RANK_ABILITY_ICONS,
  HIDDEN_LEAF_RANK_ABILITY_ICONS,
  UNIT_RANK_ABILITY_ICONS,
  unitRankAbilityIcon
} from "@/data/units/experience";
import { SPECIALTY_ICON_BY_HERO } from "@/components/specialty-card-data";
import { WUXIA_SPECIALTY_HEROES, wuxiaSpecialtyCards } from "@/data/anime/wuxia-specialties";

// ---------------------------------------------------------------------------
// ANIME SPECIALTY REDESIGN (2026-08-25) — the Fuyuki / Hidden Leaf / Azure
// Breeze / Heavenly Demon MIGHT heroes dropped the generic unit-buff trio for
// distinct sets, each a rethemedSpecialty clone of a shipped, behaviour-tested
// source. This file pins:
// The Azure Breeze / Heavenly Demon heroes were later (2026-09-23) moved OFF
// the clones onto bespoke Sect Qi / Blood Essence cards
// (src/data/anime/wuxia-specialties.ts); their pins below are identity pins
// for those bespoke cards instead of clone ↔ source identity.
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
  jiraiya: ["luna", "Toad Oil Flame Bomb"]
};

/** Wuxia hero slug → bespoke specialty name (wuxia-specialties.ts). */
const WUXIA_BESPOKE: Record<string, string> = {
  qingyun: "Flying Sword Arts",
  lingxi: "Formation Mending",
  jianxu: "Seven-Star Sword Array",
  yulian: "Jade Body Arts",
  xuedao: "Blood Path Sabre",
  guiyan: "Ghostfire",
  xuanming: "Legion of Bones",
  yaoji: "Blood Alchemy",
  molian: "Corpse Weaving",
  luohun: "Soul Shepherd",
  shiyan: "Corpse-Furnace Sutra"
};

/** The retired clone sources — a bespoke card must NOT match these any more. */
const RETIRED_CLONE_SOURCE: Record<string, string> = {
  qingyun: "xyron",
  jianxu: "miku",
  yulian: "merist",
  xuedao: "septienna",
  guiyan: "glacius",
  xuanming: "oidana"
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

  it("every wuxia hero carries its bespoke, library-wired specialty (no clone of the retired source)", () => {
    expect([...WUXIA_SPECIALTY_HEROES].sort()).toEqual(Object.keys(WUXIA_BESPOKE).sort());
    for (const [heroSlug, name] of Object.entries(WUXIA_BESPOKE)) {
      for (const level of LEVELS) {
        const id = `specialty.${heroSlug}.${level}`;
        const card = cardLibrary[id];
        expect(card, id).toBeDefined();
        // The library serves the bespoke card verbatim.
        expect(card).toEqual(wuxiaSpecialtyCards[id]);
        expect(card.kind).toBe("hero-specialty");
        expect(card.implementationStatus).toBe("implemented");
        expect(card.name).toBe(`${name} ${ROMAN[level]}`);
        expect(card.effect.type).toBe("CHOOSE_ONE");
        expect(card.assets?.cardImage, `${heroSlug} ${level} must stay art-less`).toBeUndefined();
        expect(card.tags).toContain(heroSlug);
        expect(JSON.stringify(card.effect)).not.toContain("doubleForUnitName");
        const retired = RETIRED_CLONE_SOURCE[heroSlug];
        if (retired) {
          // CONTROL: the retired clone source still exists, and the bespoke
          // card is no longer its mechanical copy.
          const source = cardLibrary[`specialty.${retired}.${level}`];
          expect(source, retired).toBeDefined();
          expect(normalize(card.effect)).not.toEqual(normalize(source.effect));
          expect(card.tags).not.toContain(retired);
        }
      }
    }
  });

  it("Jianxu / Yulian / Luohun / Shiyan keep their engine-backed Innate line on every level", () => {
    for (const heroSlug of ["jianxu", "yulian", "luohun", "shiyan"] as const) {
      for (const level of LEVELS) {
        const prose = (cardLibrary[`specialty.${heroSlug}.${level}`]?.tags ?? []).filter((tag) => /\s/u.test(tag));
        expect(prose.some((tag) => tag.includes("Innate")), `${heroSlug} ${level}`).toBe(true);
      }
    }
  });

  it("pins the reworked Jianxu and Shiyan Innate descriptions on every level", () => {
    for (const level of LEVELS) {
      const jianxu = (cardLibrary[`specialty.jianxu.${level}`]?.tags ?? []).join(" ");
      expect(jianxu).toContain("Seven-Star Array");
      expect(jianxu).toContain("beside 2 or more allies, it gains +1 more Attack");
      expect(jianxu).not.toContain("+1 Attack only");
      expect(jianxu).not.toContain("never stacks");

      const shiyan = (cardLibrary[`specialty.shiyan.${level}`]?.tags ?? []).join(" ");
      expect(shiyan).toContain("without the once-per-round limit");
      expect(shiyan).toContain("each unit still feeds it once per combat");
      expect(shiyan).not.toContain("exactly 1 Blood Essence");
    }
  });

  it("Xuanming's Legion of Bones is a Blood Harvest art, no longer Diplomacy's clone", () => {
    const expected = {
      1: { gain: 1, harvestsPerRound: 2, harvestHeal: undefined },
      4: { gain: 1, harvestsPerRound: 2, harvestHeal: 1 },
      6: { gain: 2, harvestsPerRound: 99, harvestHeal: 1 }
    } as const;
    for (const level of LEVELS) {
      const card = cardLibrary[`specialty.xuanming.${level}`];
      expect(card.timing).toBe("combat");
      const options =
        (card.effect as {
          options?: Array<{ combatOnly?: boolean; cultivationGain?: { bloodEssence?: number }; effect?: Record<string, unknown> }>;
        }).options ?? [];
      expect(options).toHaveLength(1);
      expect(options[0]?.combatOnly).toBe(true);
      expect(options[0]?.cultivationGain).toEqual({ bloodEssence: expected[level].gain });
      expect(options[0]?.effect).toMatchObject({
        type: "WUXIA_ART_CARD",
        art: "legion-harvest",
        harvestsPerRound: expected[level].harvestsPerRound
      });
      expect(options[0]?.effect?.harvestHeal).toBe(expected[level].harvestHeal);
      // The retired Diplomacy / neutral-attack-buff mechanics are gone.
      expect(JSON.stringify(card.effect)).not.toContain("CREATE_VARIANT_ATTACK_BUFF");
      expect(JSON.stringify(card.effect)).not.toContain("Diplomacy");
    }
  });

  it("Jianxu's array strike scales with adjacent allies on his own attacks; the retired trap auras are gone", () => {
    const expected = {
      1: { max: 2, gain: undefined, ignoresRetaliation: undefined },
      4: { max: 3, gain: { sectQi: 1 }, ignoresRetaliation: undefined },
      6: { max: 3, gain: undefined, ignoresRetaliation: true }
    } as const;
    for (const level of LEVELS) {
      const card = cardLibrary[`specialty.jianxu.${level}`];
      const options =
        (card.effect as {
          options?: Array<{ trigger?: unknown; cultivationGain?: unknown; effect?: Record<string, unknown> }>;
        }).options ?? [];
      expect(options).toHaveLength(1);
      expect(options[0]?.trigger).toEqual({ event: "UNIT_ATTACK_DECLARED", controller: "self" });
      expect(options[0]?.cultivationGain).toEqual(expected[level].gain);
      expect(options[0]?.effect).toMatchObject({ type: "WUXIA_ART_CARD", art: "array-strike", max: expected[level].max });
      expect(options[0]?.effect?.ignoresRetaliation).toBe(expected[level].ignoresRetaliation);
      const tags = card.tags ?? [];
      expect(tags).not.toContain("voice-of-angel");
      expect(tags).not.toContain("seven-star-trap-array");
      expect(JSON.stringify(card.effect)).not.toContain("SLOW_ALL_ENEMIES");
      expect(JSON.stringify(card.effect)).not.toContain("CREATE_HEAL_ON_ATTACKED");
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

  it("every redesigned hero renders natively with a published specialty icon", () => {
    for (const heroSlug of [...Object.keys(REDESIGNS), ...Object.keys(WUXIA_BESPOKE)]) {
      expect(coreHeroDefinitions[heroSlug], heroSlug).toBeDefined();
      const icon = SPECIALTY_ICON_BY_HERO[heroSlug];
      expect(icon, `${heroSlug} needs a specialty icon`).toBeTruthy();
      expect(hasMediaFile(icon!), `${icon} — run npm run media:publish`).toBe(true);
      expect(mediaFileInfo(icon!)!.bytes, icon).toBeGreaterThan(10_000);
    }
  });
});

describe("Fuyuki / Hidden Leaf unit-XP rank emblems", () => {
  it("one bespoke published emblem per unit line, resolved by unitRankAbilityIcon", () => {
    const rosters: Array<[Record<string, string>, string]> = [
      [FUYUKI_RANK_ABILITY_ICONS, "fuyuki"],
      [HIDDEN_LEAF_RANK_ABILITY_ICONS, "hidden_leaf"]
    ];
    const seen = new Set<string>();
    for (const [icons, factionId] of rosters) {
      const roster = coreFactionDefinitions[factionId].units;
      expect(Object.keys(icons).sort()).toEqual([...roster].sort());
      for (const unitId of roster) {
        // 64d90691 (custom unit veterancy): a learned SHARED rule keeps its own
        // icon on these custom schedules; the bespoke emblem is the line's
        // fallback for a rule without one (never the generic slayer fallback).
        expect(unitRankAbilityIcon("commander-max-damage", unitId)).toBe(UNIT_RANK_ABILITY_ICONS["commander-max-damage"]);
        const resolved = unitRankAbilityIcon("rank-rule-without-shared-icon", unitId);
        expect(resolved).toBe(icons[unitId]);
        expect(seen.has(resolved), `${unitId} emblem must be distinct`).toBe(false);
        seen.add(resolved);
        expect(hasMediaFile(resolved), `${resolved} — run npm run media:publish`).toBe(true);
        expect(mediaFileInfo(resolved)!.bytes, resolved).toBeGreaterThan(10_000);
      }
    }
    expect(seen.size).toBe(15);
  });
});

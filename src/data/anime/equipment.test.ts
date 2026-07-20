import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ANIME_EQUIPMENT_ART_PLACEHOLDERS,
  ANIME_EQUIPMENT_DEFINITIONS,
  ANIME_EQUIPMENT_SLOTS,
  EQUIPMENT_IDS,
  EQUIPMENT_SHOP_SALES,
  EQUIPMENT_SLOT_GLYPH,
  equipmentArtPath,
  equipmentImage,
  getEquipmentDefinition,
  listEquipmentDefinitions
} from "./equipment";

/** Wave-2 shared items — sold at BOTH outfitters. */
const WAVE_2_SHARED = [
  EQUIPMENT_IDS.marshalsWarHorn,
  EQUIPMENT_IDS.veteransStandard,
  EQUIPMENT_IDS.windriderSaddle,
  EQUIPMENT_IDS.spiritCraneMount,
  EQUIPMENT_IDS.bladeOfTheTrial,
  EQUIPMENT_IDS.alchemistsSatchel
];

/** True when an item's art file exists under public/ (the promote target). */
const equipmentArtOnDisk = (id: string) =>
  existsSync(fileURLToPath(new URL(`../../../public${equipmentArtPath(id)}`, import.meta.url)));

describe("anime equipment catalog integrity", () => {
  it("ships the catalog items with the specced slot / cost / package / context", () => {
    const items = listEquipmentDefinitions();
    // V1 (6) + wave 2 (6) + Miku/idol isekai wave (3) = 15.
    expect(items).toHaveLength(15);
    const bySlug = (id: string) => getEquipmentDefinition(id)!;
    // V1 (6).
    expect(bySlug(EQUIPMENT_IDS.ironBloodSword)).toMatchObject({ slot: "weapon", cost: 4, package: "anime-xianxia" });
    expect(bySlug(EQUIPMENT_IDS.blackTortoiseMail)).toMatchObject({ slot: "armor", cost: 4, package: "anime-xianxia" });
    expect(bySlug(EQUIPMENT_IDS.cosmosPendant)).toMatchObject({ slot: "accessory", cost: 5, package: "anime-xianxia" });
    expect(bySlug(EQUIPMENT_IDS.adventurersBlade)).toMatchObject({ slot: "weapon", cost: 4, package: "anime-isekai" });
    expect(bySlug(EQUIPMENT_IDS.guildIssueMail)).toMatchObject({ slot: "armor", cost: 4, package: "anime-isekai" });
    expect(bySlug(EQUIPMENT_IDS.supplySatchel)).toMatchObject({ slot: "accessory", cost: 5, package: "shared" });
    // Wave 2 (6): two context-gated accessories, two mounts, a weapon, an armor.
    expect(bySlug(EQUIPMENT_IDS.marshalsWarHorn)).toMatchObject({ slot: "accessory", cost: 6, package: "shared", requiresContext: "wog.commanders" });
    expect(bySlug(EQUIPMENT_IDS.veteransStandard)).toMatchObject({ slot: "accessory", cost: 5, package: "shared", requiresContext: "anime.unitExperience" });
    expect(bySlug(EQUIPMENT_IDS.windriderSaddle)).toMatchObject({ slot: "mount", cost: 5, package: "shared" });
    expect(bySlug(EQUIPMENT_IDS.spiritCraneMount)).toMatchObject({ slot: "mount", cost: 6, package: "shared", requiresContext: "wog.commanders" });
    expect(bySlug(EQUIPMENT_IDS.bladeOfTheTrial)).toMatchObject({ slot: "weapon", cost: 5, package: "shared" });
    expect(bySlug(EQUIPMENT_IDS.alchemistsSatchel)).toMatchObject({ slot: "armor", cost: 6, package: "shared" });
    // Miku / idol isekai wave (3).
    expect(bySlug(EQUIPMENT_IDS.neonMicrophone)).toMatchObject({ slot: "weapon", cost: 5, package: "anime-isekai" });
    expect(bySlug(EQUIPMENT_IDS.stageCostume)).toMatchObject({ slot: "armor", cost: 5, package: "anime-isekai" });
    expect(bySlug(EQUIPMENT_IDS.twinTailRibbon)).toMatchObject({ slot: "accessory", cost: 4, package: "anime-isekai" });
    // Ungated V1 + wave-2 mount/weapon/armor carry NO context requirement.
    expect(bySlug(EQUIPMENT_IDS.windriderSaddle).requiresContext).toBeUndefined();
    expect(bySlug(EQUIPMENT_IDS.ironBloodSword).requiresContext).toBeUndefined();
  });

  it("covers all FOUR slots including the new mount slot", () => {
    expect(ANIME_EQUIPMENT_SLOTS).toEqual(["weapon", "armor", "accessory", "mount"]);
    const slotsUsed = new Set(listEquipmentDefinitions().map((def) => def.slot));
    for (const slot of ANIME_EQUIPMENT_SLOTS) {
      expect(slotsUsed.has(slot), `some item uses the ${slot} slot`).toBe(true);
    }
  });

  it("every item has a bilingual name and a non-empty behaviour summary", () => {
    for (const def of listEquipmentDefinitions()) {
      expect(def.name.en.length, def.id).toBeGreaterThan(0);
      expect(def.name.vi.length, def.id).toBeGreaterThan(0);
      expect(def.summary.length, def.id).toBeGreaterThan(0);
    }
  });

  it("art placeholder contract (drop-art-later, promote-safe both directions)", () => {
    // All 6 ship art-less TODAY (no equipment art on disk yet), but the check is
    // written promote-SAFE: it branches on membership so dropping art + removing
    // an id from the set keeps this green, and it disk-checks BOTH directions.
    for (const def of listEquipmentDefinitions()) {
      const isPlaceholder = ANIME_EQUIPMENT_ART_PLACEHOLDERS.has(def.id);
      // The art path is well-formed for the day the placeholder is removed.
      expect(equipmentArtPath(def.id)).toContain("/assets/anime/equipment/");
      if (isPlaceholder) {
        // Placeholder ⇒ UI falls back to the slot glyph (no image)...
        expect(equipmentImage(def.id), `${def.id} placeholder ⇒ no image`).toBeUndefined();
        // ...and (direction a) the .webp must NOT already be on disk — dropping it
        // is half the promote; the registry entry must go too.
        expect(
          equipmentArtOnDisk(def.id),
          `${def.id} is a placeholder but art exists on disk — remove it from ANIME_EQUIPMENT_ART_PLACEHOLDERS`
        ).toBe(false);
      } else {
        // Promoted ⇒ (direction b) the image is wired to its art path AND the file exists.
        expect(equipmentImage(def.id), `${def.id} names its art path`).toBe(equipmentArtPath(def.id));
        expect(equipmentArtOnDisk(def.id), `${def.id} art missing on disk at ${equipmentArtPath(def.id)}`).toBe(true);
      }
    }
    // Every placeholder id names a real item with no committed art (no dangling /
    // stale placeholder). 2026-07: all 6 items ship art, so the set is
    // legitimately EMPTY — the loop still guards any future declaration.
    for (const id of ANIME_EQUIPMENT_ART_PLACEHOLDERS) {
      expect(getEquipmentDefinition(id), `placeholder ${id} must name a real item`).toBeTruthy();
      expect(
        equipmentArtOnDisk(id),
        `placeholder ${id} already has art on disk — remove it from ANIME_EQUIPMENT_ART_PLACEHOLDERS`
      ).toBe(false);
    }
  });

  it("the slot glyph registry covers all four slots (incl. mount)", () => {
    for (const slot of ANIME_EQUIPMENT_SLOTS) {
      expect(EQUIPMENT_SLOT_GLYPH[slot].length, slot).toBeGreaterThan(0);
    }
  });

  it("each outfitter sells its package's items + the shared Satchel + the wave-2 shared gear; no shop sells the other package's V1 items", () => {
    const blacksmith = EQUIPMENT_SHOP_SALES["anime.ren_binh_cac"];
    const outfitter = EQUIPMENT_SHOP_SALES["anime.adventurer_outfitter"];
    expect(blacksmith).toEqual([
      EQUIPMENT_IDS.ironBloodSword,
      EQUIPMENT_IDS.blackTortoiseMail,
      EQUIPMENT_IDS.cosmosPendant,
      EQUIPMENT_IDS.supplySatchel,
      ...WAVE_2_SHARED
    ]);
    expect(outfitter).toEqual([
      EQUIPMENT_IDS.adventurersBlade,
      EQUIPMENT_IDS.guildIssueMail,
      EQUIPMENT_IDS.supplySatchel,
      EQUIPMENT_IDS.neonMicrophone,
      EQUIPMENT_IDS.stageCostume,
      EQUIPMENT_IDS.twinTailRibbon,
      ...WAVE_2_SHARED
    ]);
    // Both include the shared Satchel + every wave-2 item; neither crosses into
    // the OTHER package's V1 items.
    expect(blacksmith).toContain(EQUIPMENT_IDS.supplySatchel);
    expect(outfitter).toContain(EQUIPMENT_IDS.supplySatchel);
    for (const id of WAVE_2_SHARED) {
      expect(blacksmith, id).toContain(id);
      expect(outfitter, id).toContain(id);
    }
    expect(blacksmith).not.toContain(EQUIPMENT_IDS.adventurersBlade);
    expect(outfitter).not.toContain(EQUIPMENT_IDS.ironBloodSword);
    // Every sold id resolves to a real definition.
    for (const id of [...blacksmith, ...outfitter]) {
      expect(getEquipmentDefinition(id), id).toBeTruthy();
    }
  });

  it("the definitions map is keyed by id (no drift)", () => {
    for (const [key, def] of Object.entries(ANIME_EQUIPMENT_DEFINITIONS)) {
      expect(def.id).toBe(key);
    }
  });
});

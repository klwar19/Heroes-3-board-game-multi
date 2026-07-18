import { describe, expect, it } from "vitest";
import {
  ANIME_EQUIPMENT_ART_PLACEHOLDERS,
  ANIME_EQUIPMENT_DEFINITIONS,
  EQUIPMENT_IDS,
  EQUIPMENT_SHOP_SALES,
  EQUIPMENT_SLOT_GLYPH,
  equipmentArtPath,
  equipmentImage,
  getEquipmentDefinition,
  listEquipmentDefinitions,
  type AnimeEquipmentSlot
} from "./equipment";

describe("anime equipment catalog integrity", () => {
  it("ships exactly the 6 V1 items with the specced slot / cost / package", () => {
    const items = listEquipmentDefinitions();
    expect(items).toHaveLength(6);
    const bySlug = (id: string) => getEquipmentDefinition(id)!;
    expect(bySlug(EQUIPMENT_IDS.ironBloodSword)).toMatchObject({ slot: "weapon", cost: 4, package: "anime-xianxia" });
    expect(bySlug(EQUIPMENT_IDS.blackTortoiseMail)).toMatchObject({ slot: "armor", cost: 4, package: "anime-xianxia" });
    expect(bySlug(EQUIPMENT_IDS.cosmosPendant)).toMatchObject({ slot: "accessory", cost: 5, package: "anime-xianxia" });
    expect(bySlug(EQUIPMENT_IDS.adventurersBlade)).toMatchObject({ slot: "weapon", cost: 4, package: "anime-isekai" });
    expect(bySlug(EQUIPMENT_IDS.guildIssueMail)).toMatchObject({ slot: "armor", cost: 4, package: "anime-isekai" });
    expect(bySlug(EQUIPMENT_IDS.supplySatchel)).toMatchObject({ slot: "accessory", cost: 5, package: "shared" });
  });

  it("every item has a bilingual name and a non-empty behaviour summary", () => {
    for (const def of listEquipmentDefinitions()) {
      expect(def.name.en.length, def.id).toBeGreaterThan(0);
      expect(def.name.vi.length, def.id).toBeGreaterThan(0);
      expect(def.summary.length, def.id).toBeGreaterThan(0);
    }
  });

  it("all 6 items are art placeholders (no card face yet) and expose no image", () => {
    for (const def of listEquipmentDefinitions()) {
      expect(ANIME_EQUIPMENT_ART_PLACEHOLDERS.has(def.id), def.id).toBe(true);
      // Art placeholder ⇒ no image (UI falls back to the slot glyph).
      expect(equipmentImage(def.id), def.id).toBeUndefined();
      // The art path is well-formed for the day the placeholder is removed.
      expect(equipmentArtPath(def.id)).toContain("/assets/anime/equipment/");
    }
    // Every placeholder id names a real item (no dangling placeholder).
    for (const id of ANIME_EQUIPMENT_ART_PLACEHOLDERS) {
      expect(getEquipmentDefinition(id), id).toBeTruthy();
    }
  });

  it("the slot glyph registry covers all three slots", () => {
    for (const slot of ["weapon", "armor", "accessory"] as AnimeEquipmentSlot[]) {
      expect(EQUIPMENT_SLOT_GLYPH[slot].length).toBeGreaterThan(0);
    }
  });

  it("each outfitter sells its package's 3 items + the shared Satchel; no shop sells the other package", () => {
    const blacksmith = EQUIPMENT_SHOP_SALES["anime.ren_binh_cac"];
    const outfitter = EQUIPMENT_SHOP_SALES["anime.adventurer_outfitter"];
    expect(blacksmith).toEqual([
      EQUIPMENT_IDS.ironBloodSword,
      EQUIPMENT_IDS.blackTortoiseMail,
      EQUIPMENT_IDS.cosmosPendant,
      EQUIPMENT_IDS.supplySatchel
    ]);
    expect(outfitter).toEqual([
      EQUIPMENT_IDS.adventurersBlade,
      EQUIPMENT_IDS.guildIssueMail,
      EQUIPMENT_IDS.supplySatchel
    ]);
    // Both include the shared Satchel; neither crosses into the other package.
    expect(blacksmith).toContain(EQUIPMENT_IDS.supplySatchel);
    expect(outfitter).toContain(EQUIPMENT_IDS.supplySatchel);
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

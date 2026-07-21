import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ANIME_EQUIPMENT_ART_PLACEHOLDERS,
  ANIME_EQUIPMENT_DEFINITIONS,
  ANIME_EQUIPMENT_SLOTS,
  EQUIPMENT_GRADE_COST,
  EQUIPMENT_GRADE_TO_ARTIFACT_TIER,
  EQUIPMENT_IDS,
  EQUIPMENT_SHOP_SALES,
  EQUIPMENT_SLOT_GLYPH,
  EQUIPMENT_PACKAGE_LABEL,
  equipmentArtPath,
  equipmentImage,
  equipmentPackagesForFaction,
  equipmentRegisterLineFor,
  getEquipmentDefinition,
  listEquipmentDefinitions,
  type EquipmentGrade
} from "./equipment";

/** Shared items sold at BOTH outfitters (grade fill-out wave included). */
const SHARED_BOTH = [
  EQUIPMENT_IDS.supplySatchel,
  EQUIPMENT_IDS.luckyCoin,
  EQUIPMENT_IDS.eternalSash,
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
  it("ships every item with a grade I/II/III, cost locked to grade, and package", () => {
    const items = listEquipmentDefinitions();
    // V1 (6) + wave 2 (6) + Miku (3) + grade-fill (3) + classic line (6) + shinobi (3) = 27.
    expect(items).toHaveLength(27);
    const bySlug = (id: string) => getEquipmentDefinition(id)!;

    for (const def of items) {
      expect(["I", "II", "III"], def.id).toContain(def.grade);
      expect(def.cost, `${def.id} cost must match grade`).toBe(EQUIPMENT_GRADE_COST[def.grade]);
      expect(EQUIPMENT_GRADE_TO_ARTIFACT_TIER[def.grade]).toBeTruthy();
    }

    // Grade I (minor / 4g).
    expect(bySlug(EQUIPMENT_IDS.ironBloodSword)).toMatchObject({ slot: "weapon", grade: "I", cost: 4, package: "anime-xianxia" });
    expect(bySlug(EQUIPMENT_IDS.blackTortoiseMail)).toMatchObject({ slot: "armor", grade: "I", cost: 4, package: "anime-xianxia" });
    expect(bySlug(EQUIPMENT_IDS.adventurersBlade)).toMatchObject({ slot: "weapon", grade: "I", cost: 4, package: "anime-isekai" });
    expect(bySlug(EQUIPMENT_IDS.guildIssueMail)).toMatchObject({ slot: "armor", grade: "I", cost: 4, package: "anime-isekai" });
    expect(bySlug(EQUIPMENT_IDS.twinTailRibbon)).toMatchObject({ slot: "accessory", grade: "I", cost: 4, package: "anime-isekai" });
    expect(bySlug(EQUIPMENT_IDS.luckyCoin)).toMatchObject({ slot: "accessory", grade: "I", cost: 4, package: "shared" });

    // Grade II (major / 6g).
    expect(bySlug(EQUIPMENT_IDS.cosmosPendant)).toMatchObject({ slot: "accessory", grade: "II", cost: 6, package: "anime-xianxia" });
    expect(bySlug(EQUIPMENT_IDS.supplySatchel)).toMatchObject({ slot: "accessory", grade: "II", cost: 6, package: "shared" });
    expect(bySlug(EQUIPMENT_IDS.windriderSaddle)).toMatchObject({ slot: "mount", grade: "II", cost: 6, package: "shared" });
    expect(bySlug(EQUIPMENT_IDS.bladeOfTheTrial)).toMatchObject({ slot: "weapon", grade: "II", cost: 6, package: "shared" });
    expect(bySlug(EQUIPMENT_IDS.veteransStandard)).toMatchObject({
      slot: "accessory",
      grade: "II",
      cost: 6,
      package: "shared",
      requiresContext: "anime.unitExperience"
    });
    expect(bySlug(EQUIPMENT_IDS.neonMicrophone)).toMatchObject({ slot: "weapon", grade: "II", cost: 6, package: "anime-isekai" });
    expect(bySlug(EQUIPMENT_IDS.stageCostume)).toMatchObject({ slot: "armor", grade: "II", cost: 6, package: "anime-isekai" });
    expect(bySlug(EQUIPMENT_IDS.spiritFocus)).toMatchObject({ slot: "accessory", grade: "II", cost: 6, package: "anime-isekai" });

    // Grade III (relic / 8g).
    expect(bySlug(EQUIPMENT_IDS.marshalsWarHorn)).toMatchObject({
      slot: "accessory",
      grade: "III",
      cost: 8,
      package: "shared",
      requiresContext: "wog.commanders"
    });
    expect(bySlug(EQUIPMENT_IDS.spiritCraneMount)).toMatchObject({
      slot: "mount",
      grade: "III",
      cost: 8,
      package: "shared",
      requiresContext: "wog.commanders"
    });
    expect(bySlug(EQUIPMENT_IDS.alchemistsSatchel)).toMatchObject({ slot: "armor", grade: "III", cost: 8, package: "shared" });
    expect(bySlug(EQUIPMENT_IDS.eternalSash)).toMatchObject({ slot: "accessory", grade: "III", cost: 8, package: "shared" });

    // Classic register line (2 per grade, spread across weapon/armor/accessory/mount).
    expect(bySlug(EQUIPMENT_IDS.crusadersPoleaxe)).toMatchObject({ slot: "weapon", grade: "I", cost: 4, package: "classic" });
    expect(bySlug(EQUIPMENT_IDS.coinwardTalisman)).toMatchObject({ slot: "accessory", grade: "I", cost: 4, package: "classic" });
    expect(bySlug(EQUIPMENT_IDS.ironbarkCuirass)).toMatchObject({ slot: "armor", grade: "II", cost: 6, package: "classic" });
    expect(bySlug(EQUIPMENT_IDS.coursersBarding)).toMatchObject({ slot: "mount", grade: "II", cost: 6, package: "classic" });
    expect(bySlug(EQUIPMENT_IDS.hornOfPlenty)).toMatchObject({ slot: "accessory", grade: "III", cost: 8, package: "classic" });
    expect(bySlug(EQUIPMENT_IDS.wardensAegis)).toMatchObject({ slot: "armor", grade: "III", cost: 8, package: "classic" });
    // The classic line covers all four slots and both grades of each item pair.
    const classic = items.filter((def) => def.package === "classic");
    expect(classic).toHaveLength(6);
    expect(new Set(classic.map((def) => def.slot))).toEqual(new Set(["weapon", "armor", "accessory", "mount"]));
    expect(classic.filter((def) => def.grade === "I")).toHaveLength(2);
    expect(classic.filter((def) => def.grade === "II")).toHaveLength(2);
    expect(classic.filter((def) => def.grade === "III")).toHaveLength(2);

    // Hidden Leaf Village bespoke "shinobi" line (§3.13): one per grade, spread
    // across weapon / mount / accessory (Kunai Pouch I, Body-Flicker Tabi II,
    // Sage Chakra Charm III).
    expect(bySlug(EQUIPMENT_IDS.shinobiKunaiPouch)).toMatchObject({ slot: "weapon", grade: "I", cost: 4, package: "shinobi" });
    expect(bySlug(EQUIPMENT_IDS.bodyFlickerTabi)).toMatchObject({ slot: "mount", grade: "II", cost: 6, package: "shinobi" });
    expect(bySlug(EQUIPMENT_IDS.sageChakraCharm)).toMatchObject({ slot: "accessory", grade: "III", cost: 8, package: "shinobi" });
    const shinobi = items.filter((def) => def.package === "shinobi");
    expect(shinobi).toHaveLength(3);
    expect(new Set(shinobi.map((def) => def.grade))).toEqual(new Set(["I", "II", "III"]));
    expect(new Set(shinobi.map((def) => def.slot))).toEqual(new Set(["weapon", "mount", "accessory"]));
  });

  it("covers all three grades with multiple items each", () => {
    const byGrade = { I: 0, II: 0, III: 0 } as Record<EquipmentGrade, number>;
    for (const def of listEquipmentDefinitions()) {
      byGrade[def.grade] += 1;
    }
    expect(byGrade.I, "Grade I items").toBeGreaterThanOrEqual(4);
    expect(byGrade.II, "Grade II items").toBeGreaterThanOrEqual(4);
    expect(byGrade.III, "Grade III items").toBeGreaterThanOrEqual(3);
  });

  it("covers all FOUR slots including the mount slot", () => {
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
      expect(def.summary, def.id).toMatch(/Grade (I|II|III)/);
    }
  });

  it("art placeholder contract (drop-art-later, promote-safe both directions)", () => {
    for (const def of listEquipmentDefinitions()) {
      const isPlaceholder = ANIME_EQUIPMENT_ART_PLACEHOLDERS.has(def.id);
      expect(equipmentArtPath(def.id)).toContain("/assets/anime/equipment/");
      if (isPlaceholder) {
        expect(equipmentImage(def.id), `${def.id} placeholder ⇒ no image`).toBeUndefined();
        expect(
          equipmentArtOnDisk(def.id),
          `${def.id} is a placeholder but art exists on disk — remove it from ANIME_EQUIPMENT_ART_PLACEHOLDERS`
        ).toBe(false);
      } else {
        expect(equipmentImage(def.id), `${def.id} names its art path`).toBe(equipmentArtPath(def.id));
        expect(equipmentArtOnDisk(def.id), `${def.id} art missing on disk at ${equipmentArtPath(def.id)}`).toBe(true);
      }
    }
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

  it("each outfitter sells its package's items + shared gear; no shop sells the other package's exclusive items", () => {
    const blacksmith = EQUIPMENT_SHOP_SALES["anime.ren_binh_cac"];
    const outfitter = EQUIPMENT_SHOP_SALES["anime.adventurer_outfitter"];
    expect(blacksmith).toEqual([
      EQUIPMENT_IDS.ironBloodSword,
      EQUIPMENT_IDS.blackTortoiseMail,
      EQUIPMENT_IDS.cosmosPendant,
      ...SHARED_BOTH
    ]);
    expect(outfitter).toEqual([
      EQUIPMENT_IDS.adventurersBlade,
      EQUIPMENT_IDS.guildIssueMail,
      EQUIPMENT_IDS.neonMicrophone,
      EQUIPMENT_IDS.stageCostume,
      EQUIPMENT_IDS.twinTailRibbon,
      EQUIPMENT_IDS.spiritFocus,
      ...SHARED_BOTH
    ]);
    for (const id of SHARED_BOTH) {
      expect(blacksmith, id).toContain(id);
      expect(outfitter, id).toContain(id);
    }
    expect(blacksmith).not.toContain(EQUIPMENT_IDS.adventurersBlade);
    expect(outfitter).not.toContain(EQUIPMENT_IDS.ironBloodSword);
    expect(blacksmith).not.toContain(EQUIPMENT_IDS.spiritFocus);
    for (const id of [...blacksmith, ...outfitter]) {
      expect(getEquipmentDefinition(id), id).toBeTruthy();
    }
  });

  it("the definitions map is keyed by id (no drift)", () => {
    for (const [key, def] of Object.entries(ANIME_EQUIPMENT_DEFINITIONS)) {
      expect(def.id).toBe(key);
    }
  });

  it("maps each faction's visual register to its equipment package line (register-aware shops)", () => {
    // Classic-chrome factions → the classic line; azure_breeze (wuxia) → xianxia;
    // fuyuki (anime) → isekai. Keyed purely off the visual register, so ANY
    // classic faction resolves the classic line.
    expect(equipmentPackagesForFaction("castle")).toEqual(["classic"]);
    expect(equipmentPackagesForFaction("necropolis")).toEqual(["classic"]);
    expect(equipmentPackagesForFaction(undefined)).toEqual(["classic"]);
    expect(equipmentPackagesForFaction("azure_breeze")).toEqual(["anime-xianxia"]);
    expect(equipmentPackagesForFaction("fuyuki")).toEqual(["anime-isekai"]);
    // Hidden Leaf Village is BESPOKE — special-cased ahead of the register switch
    // to its own shinobi line, NOT the anime-register default isekai (fuyuki keeps).
    expect(equipmentPackagesForFaction("hidden_leaf")).toEqual(["shinobi"]);

    // The register LINE is the ids of every item in that package.
    const classicLine = equipmentRegisterLineFor("castle");
    expect(classicLine).toContain(EQUIPMENT_IDS.crusadersPoleaxe);
    expect(classicLine).toContain(EQUIPMENT_IDS.wardensAegis);
    expect(classicLine).toHaveLength(6);
    // CONTROL: a classic visitor's line carries NO xianxia/isekai/shinobi exclusives.
    expect(classicLine).not.toContain(EQUIPMENT_IDS.ironBloodSword); // xianxia
    expect(classicLine).not.toContain(EQUIPMENT_IDS.adventurersBlade); // isekai
    expect(classicLine).not.toContain(EQUIPMENT_IDS.shinobiKunaiPouch); // shinobi

    const wuxiaLine = equipmentRegisterLineFor("azure_breeze");
    expect(wuxiaLine).toContain(EQUIPMENT_IDS.ironBloodSword); // xianxia exclusive
    expect(wuxiaLine).not.toContain(EQUIPMENT_IDS.adventurersBlade); // NOT isekai
    expect(wuxiaLine).not.toContain(EQUIPMENT_IDS.crusadersPoleaxe); // NOT classic
    expect(wuxiaLine).not.toContain(EQUIPMENT_IDS.shinobiKunaiPouch); // NOT shinobi

    const isekaiLine = equipmentRegisterLineFor("fuyuki");
    expect(isekaiLine).toContain(EQUIPMENT_IDS.adventurersBlade); // isekai exclusive
    expect(isekaiLine).not.toContain(EQUIPMENT_IDS.ironBloodSword); // NOT xianxia
    // CONTROL: fuyuki keeps the isekai line — shinobi never leaks to the shared
    // "anime" register (that special-case is hidden_leaf only).
    expect(isekaiLine).not.toContain(EQUIPMENT_IDS.shinobiKunaiPouch);

    // The shinobi line is EXACTLY the three Hidden Leaf items and nothing else.
    const shinobiLine = equipmentRegisterLineFor("hidden_leaf");
    expect(new Set(shinobiLine)).toEqual(
      new Set([EQUIPMENT_IDS.shinobiKunaiPouch, EQUIPMENT_IDS.bodyFlickerTabi, EQUIPMENT_IDS.sageChakraCharm])
    );
    // CONTROL: hidden_leaf's line carries none of the other registers' exclusives.
    expect(shinobiLine).not.toContain(EQUIPMENT_IDS.adventurersBlade); // isekai
    expect(shinobiLine).not.toContain(EQUIPMENT_IDS.ironBloodSword); // xianxia
    expect(shinobiLine).not.toContain(EQUIPMENT_IDS.crusadersPoleaxe); // classic
  });

  it("every package has a short UI flavour label", () => {
    for (const def of listEquipmentDefinitions()) {
      expect(EQUIPMENT_PACKAGE_LABEL[def.package], def.id).toBeTruthy();
    }
    expect(EQUIPMENT_PACKAGE_LABEL.classic).toBe("classic");
    expect(EQUIPMENT_PACKAGE_LABEL.shinobi).toBe("shinobi");
  });
});

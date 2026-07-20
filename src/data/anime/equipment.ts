/**
 * Anime EQUIPMENT catalog (`anime.equipment`, plan §3.13 — a SHARED-spine
 * system for every hero, distinct from Artifact cards).
 *
 * Equipment is ALWAYS ON: an item sits in one of three/four hero slots
 * (weapon / armor / accessory / mount) and its effect runs while equipped — it
 * is never in hand, never cast, never discarded. Buying into an occupied slot
 * moves the previous item into the equipment bag (no refund). Items are bought
 * at two outfitter Field Overrides (Rèn Binh Các / Adventurer Outfitter); they
 * never join a deck.
 *
 * GRADES (3 tiers, matching Artifact minor/major/relic):
 *   I   (minor)  — cost 4 gold, light standing bonuses
 *   II  (major)  — cost 6 gold, mid combat / economy
 *   III (relic)  — cost 8 gold, rare module-gated or dual-payoff items
 * Cost is derived from grade so shops and UI stay consistent.
 *
 * Every `summary` states EXACTLY the wired behaviour (CLAUDE.md §2) — no
 * display-only clauses. The engine reads each id in
 * `src/engine/anime-equipment.ts` and its consumers.
 *
 * ART: icons under `public/assets/anime/equipment/<slug>.webp` (512×512 webp).
 * A future art-less item must be declared in `ANIME_EQUIPMENT_ART_PLACEHOLDERS`.
 */

import { ANIME_EQUIPMENT_SLOTS, type AnimeEquipmentSlot, type ArtifactTier } from "@/engine/state";

export { ANIME_EQUIPMENT_SLOTS };
export type { AnimeEquipmentSlot };

/** Three equipment grades — same ladder as Artifact tiers (I=minor … III=relic). */
export type EquipmentGrade = "I" | "II" | "III";

/** Grade → Artifact-tier (for same-grade grant pairings / UI labels). */
export const EQUIPMENT_GRADE_TO_ARTIFACT_TIER: Record<EquipmentGrade, ArtifactTier> = {
  I: "minor",
  II: "major",
  III: "relic"
};

/** Canonical shop gold cost by grade. */
export const EQUIPMENT_GRADE_COST: Record<EquipmentGrade, number> = {
  I: 4,
  II: 6,
  III: 8
};

/** Roman / short labels for UI chips. */
export const EQUIPMENT_GRADE_LABEL: Record<EquipmentGrade, { en: string; short: string }> = {
  I: { en: "Grade I (Minor)", short: "I" },
  II: { en: "Grade II (Major)", short: "II" },
  III: { en: "Grade III (Relic)", short: "III" }
};

/** Which content family an equipment item belongs to (shop gating + naming). */
export type EquipmentPackage = "anime-xianxia" | "anime-isekai" | "shared";

/**
 * A CONTEXT another module must provide for an item to be worth buying. The
 * outfitter shop HIDES an item whose requirement is unmet (a never-dead-purchase
 * rule, CLAUDE.md §2) — e.g. the commander-only items vanish while WOG Commanders
 * is off, and Veteran's Standard vanishes while Unit Experience is off. The
 * engine predicate lives in `equipmentContextAvailable` (anime-equipment.ts).
 */
export type EquipmentContextRequirement = "wog.commanders" | "anime.unitExperience";

export type EquipmentDefinition = {
  id: string;
  slot: AnimeEquipmentSlot;
  /** One of three grades (I/II/III = minor/major/relic Artifact ladder). */
  grade: EquipmentGrade;
  name: { en: string; vi: string };
  /** Gold cost at an outfitter shop — always `EQUIPMENT_GRADE_COST[grade]`. */
  cost: number;
  package: EquipmentPackage;
  /** Exactly the wired behaviour (no flavour the engine does not run). */
  summary: string;
  /**
   * When set, the item is only OFFERED at a shop while this context is active
   * (its effect would otherwise be inert — a dead purchase). Enforced at the menu
   * build (`buildEquipmentShopStep`); the effect itself is also gated at its own
   * wiring site, so a hand-stamped item is simply a no-op with the context off.
   */
  requiresContext?: EquipmentContextRequirement;
};

// --- Item id constants (referenced by the engine wiring & tests) ------------
export const EQUIPMENT_IDS = {
  ironBloodSword: "anime.equip.iron_blood_sword",
  blackTortoiseMail: "anime.equip.black_tortoise_mail",
  cosmosPendant: "anime.equip.cosmos_pendant",
  adventurersBlade: "anime.equip.adventurers_blade",
  guildIssueMail: "anime.equip.guild_issue_mail",
  supplySatchel: "anime.equip.supply_satchel",
  // --- Wave 2 (2026-07): six new items + the mount slot --------------------
  marshalsWarHorn: "anime.equip.marshals_war_horn",
  veteransStandard: "anime.equip.veterans_standard",
  windriderSaddle: "anime.equip.windrider_saddle",
  spiritCraneMount: "anime.equip.spirit_crane_mount",
  bladeOfTheTrial: "anime.equip.blade_of_the_trial",
  alchemistsSatchel: "anime.equip.alchemists_satchel",
  // --- Miku / idol-themed isekai wave ----------------------------------------
  neonMicrophone: "anime.equip.neon_microphone",
  stageCostume: "anime.equip.stage_costume",
  twinTailRibbon: "anime.equip.twin_tail_ribbon",
  // --- Grade fill-out wave (3 grades proper) --------------------------------
  luckyCoin: "anime.equip.lucky_coin",
  spiritFocus: "anime.equip.spirit_focus",
  eternalSash: "anime.equip.eternal_sash"
} as const;

function equip(
  partial: Omit<EquipmentDefinition, "cost"> & { grade: EquipmentGrade }
): EquipmentDefinition {
  return { ...partial, cost: EQUIPMENT_GRADE_COST[partial.grade] };
}

/** The catalog — every effect a proven-seam reuse; every item has a grade. */
export const ANIME_EQUIPMENT_DEFINITIONS: Record<string, EquipmentDefinition> = {
  // ---- Grade I (minor, 4g) ------------------------------------------------
  [EQUIPMENT_IDS.ironBloodSword]: equip({
    id: EQUIPMENT_IDS.ironBloodSword,
    slot: "weapon",
    grade: "I",
    name: { en: "Iron-Blood Sword", vi: "Thiết Huyết Kiếm" },
    package: "anime-xianxia",
    summary:
      "Weapon · Grade I: your units' FIRST declared attack each combat gets +1 Attack (your main hero's fights; not on retaliations)."
  }),
  [EQUIPMENT_IDS.blackTortoiseMail]: equip({
    id: EQUIPMENT_IDS.blackTortoiseMail,
    slot: "armor",
    grade: "I",
    name: { en: "Black Tortoise Mail", vi: "Huyền Vũ Giáp" },
    package: "anime-xianxia",
    summary:
      "Armor · Grade I: the FIRST enemy attack declared against your units each combat resolves at −1 Attack (your main hero's fights; not vs retaliations)."
  }),
  [EQUIPMENT_IDS.adventurersBlade]: equip({
    id: EQUIPMENT_IDS.adventurersBlade,
    slot: "weapon",
    grade: "I",
    name: { en: "Adventurer's Blade", vi: "Kiếm Mạo Hiểm Giả" },
    package: "anime-isekai",
    summary: "Weapon · Grade I: gain +1 gold after each combat you win (stacks with Bounty Hunter's Eye / Lucky Coin)."
  }),
  [EQUIPMENT_IDS.guildIssueMail]: equip({
    id: EQUIPMENT_IDS.guildIssueMail,
    slot: "armor",
    grade: "I",
    name: { en: "Guild-Issue Mail", vi: "Giáp Công Hội" },
    package: "anime-isekai",
    summary: "Armor · Grade I: +1 hand limit (stacks with Cultivation Foundation, Deep Pockets, Twin-Tail Ribbon, Eternal Sash)."
  }),
  [EQUIPMENT_IDS.twinTailRibbon]: equip({
    id: EQUIPMENT_IDS.twinTailRibbon,
    slot: "accessory",
    grade: "I",
    name: { en: "Twin-Tail Ribbon", vi: "Ruy Băng Đôi" },
    package: "anime-isekai",
    summary: "Accessory · Grade I: +1 hand limit (stacks with Cultivation Foundation / Deep Pockets / Guild-Issue Mail (armor); shares the accessory slot with Eternal Sash — only one is worn)."
  }),
  [EQUIPMENT_IDS.luckyCoin]: equip({
    id: EQUIPMENT_IDS.luckyCoin,
    slot: "accessory",
    grade: "I",
    name: { en: "Lucky Coin", vi: "Đồng Xu May Mắn" },
    package: "shared",
    summary: "Accessory · Grade I: gain +1 gold after each combat you win (stacks with Adventurer's Blade / Alchemist's Satchel / Bounty Hunter's Eye)."
  }),

  // ---- Grade II (major, 6g) -----------------------------------------------
  [EQUIPMENT_IDS.cosmosPendant]: equip({
    id: EQUIPMENT_IDS.cosmosPendant,
    slot: "accessory",
    grade: "II",
    name: { en: "Cosmos Pendant", vi: "Càn Khôn Bội" },
    package: "anime-xianxia",
    summary: "Accessory · Grade II: +1 spell Power on your casts (stacks with Cultivation / Hero-Grade Power; the isekai Spirit Focus is its same-slot accessory twin — only one is worn)."
  }),
  [EQUIPMENT_IDS.supplySatchel]: equip({
    id: EQUIPMENT_IDS.supplySatchel,
    slot: "accessory",
    grade: "II",
    name: { en: "Supply Satchel", vi: "Túi Tiếp Tế" },
    package: "shared",
    summary: "Accessory · Grade II: +1 building materials at the start of each Resources round."
  }),
  [EQUIPMENT_IDS.windriderSaddle]: equip({
    id: EQUIPMENT_IDS.windriderSaddle,
    slot: "mount",
    grade: "II",
    name: { en: "Windrider Saddle", vi: "Yên Ngự Phong" },
    package: "shared",
    summary: "Mount · Grade II: +1 movement point to your main hero at each turn refresh (folded into the per-turn movement max)."
  }),
  [EQUIPMENT_IDS.bladeOfTheTrial]: equip({
    id: EQUIPMENT_IDS.bladeOfTheTrial,
    slot: "weapon",
    grade: "II",
    name: { en: "Blade of the Trial", vi: "Thí Luyện Kiếm" },
    package: "shared",
    summary:
      "Weapon · Grade II: +1 Attack on your units' declared attacks during combat ROUND 1 only (your main hero's fights; not on retaliations, gone from round 2)."
  }),
  [EQUIPMENT_IDS.veteransStandard]: equip({
    id: EQUIPMENT_IDS.veteransStandard,
    slot: "accessory",
    grade: "II",
    name: { en: "Veteran's Standard", vi: "Quân Kỳ Lão Binh" },
    package: "shared",
    requiresContext: "anime.unitExperience",
    summary:
      "Accessory · Grade II: your surviving units gain +1 EXTRA Unit-Experience XP per won combat (2 total). Needs the Unit Experience module; hidden at shops while it is off."
  }),
  [EQUIPMENT_IDS.neonMicrophone]: equip({
    id: EQUIPMENT_IDS.neonMicrophone,
    slot: "weapon",
    grade: "II",
    name: { en: "Neon Microphone", vi: "Micro Neon" },
    package: "anime-isekai",
    summary:
      "Weapon · Grade II: your FIRST Spell each combat is cast at +1 Power (your main hero's fights; one charge per combat)."
  }),
  [EQUIPMENT_IDS.stageCostume]: equip({
    id: EQUIPMENT_IDS.stageCostume,
    slot: "armor",
    grade: "II",
    name: { en: "Stage Costume", vi: "Trang Phục Sân Khấu" },
    package: "anime-isekai",
    summary:
      "Armor · Grade II: the FIRST time one of your units is attacked each combat, that unit gains a Defense token after the attack resolves (your main hero's fights)."
  }),
  [EQUIPMENT_IDS.spiritFocus]: equip({
    id: EQUIPMENT_IDS.spiritFocus,
    slot: "accessory",
    grade: "II",
    name: { en: "Spirit Focus", vi: "Tụ Linh Châu" },
    package: "anime-isekai",
    summary: "Accessory · Grade II: +1 spell Power on your casts (stacks with Cultivation / Hero-Grade Power; the xianxia Cosmos Pendant is its same-slot accessory twin — only one is worn)."
  }),

  // ---- Grade III (relic, 8g) ----------------------------------------------
  [EQUIPMENT_IDS.marshalsWarHorn]: equip({
    id: EQUIPMENT_IDS.marshalsWarHorn,
    slot: "accessory",
    grade: "III",
    name: { en: "Marshal's War Horn", vi: "Chiến Hào Nguyên Soái" },
    package: "shared",
    requiresContext: "wog.commanders",
    summary:
      "Accessory · Grade III: your Commander gains the pre-combat SORT window (reposition it in your deployment zone before round 1). Needs the WOG Commanders module + a commander in the fight; hidden at shops while Commanders is off."
  }),
  [EQUIPMENT_IDS.spiritCraneMount]: equip({
    id: EQUIPMENT_IDS.spiritCraneMount,
    slot: "mount",
    grade: "III",
    name: { en: "Spirit Crane Mount", vi: "Tiên Hạc Kỵ" },
    package: "shared",
    requiresContext: "wog.commanders",
    summary:
      "Mount · Grade III: if your Commander dies in a fight, it REVIVES FREE at combat end (no death, no revive gold) — same free-revive branch as the Helm of Immortality. Needs the WOG Commanders module; hidden at shops while Commanders is off."
  }),
  [EQUIPMENT_IDS.alchemistsSatchel]: equip({
    id: EQUIPMENT_IDS.alchemistsSatchel,
    slot: "armor",
    grade: "III",
    name: { en: "Alchemist's Satchel", vi: "Túi Luyện Kim" },
    package: "shared",
    summary:
      "Armor · Grade III: +1 gold at the start of each Resources round AND +1 gold after each combat you win (stacks with Adventurer's Blade / Lucky Coin / Bounty Hunter's Eye)."
  }),
  [EQUIPMENT_IDS.eternalSash]: equip({
    id: EQUIPMENT_IDS.eternalSash,
    slot: "accessory",
    grade: "III",
    name: { en: "Eternal Sash", vi: "Đới Trường Sinh" },
    package: "shared",
    summary:
      "Accessory · Grade III: +1 hand limit (stacks with Guild-Issue Mail (armor) / Cultivation Foundation / Deep Pockets; shares the accessory slot with Twin-Tail Ribbon — only one is worn)."
  })
};

/**
 * Equipment items that ship WITHOUT card/hex art yet (drop-art-later contract,
 * mirroring ANIME_ARTIFACT_ART_PLACEHOLDERS). Each MUST be a real equipment id;
 * a placeholder that already has art on disk, or a nonexistent id, fails the
 * hygiene test. When real art lands: add `public/assets/anime/equipment/<slug>.webp`
 * and remove the id here (the UI then draws it instead of the glyph fallback).
 */
export const ANIME_EQUIPMENT_ART_PLACEHOLDERS: ReadonlySet<string> = new Set([
  // EMPTY while Codex grade-fill wave art is on disk (lucky_coin / spirit_focus /
  // eternal_sash). A FUTURE art-less item must be declared here.
]);

/** Slot → emoji glyph (UI fallback while an item has no art). */
export const EQUIPMENT_SLOT_GLYPH: Record<AnimeEquipmentSlot, string> = {
  weapon: "⚔",
  armor: "🛡",
  accessory: "💍",
  mount: "🐎"
};

/** Art path for an equipment item (used once the placeholder is removed). */
export function equipmentArtPath(id: string): string {
  const slug = id.replace(/^anime\.equip\./, "");
  return `/assets/anime/equipment/${slug}.webp`;
}

/** Real art path for an item, or undefined while it is an art placeholder. */
export function equipmentImage(id: string): string | undefined {
  return ANIME_EQUIPMENT_ART_PLACEHOLDERS.has(id) ? undefined : equipmentArtPath(id);
}

export function getEquipmentDefinition(id: string): EquipmentDefinition | undefined {
  return ANIME_EQUIPMENT_DEFINITIONS[id];
}

export function listEquipmentDefinitions(): EquipmentDefinition[] {
  return Object.values(ANIME_EQUIPMENT_DEFINITIONS);
}

/**
 * The two outfitter Field Override / location ids and the items each sells.
 * The shared Supply Satchel is sold at BOTH. Consumed by the shop-append seam
 * (`beginFieldVisit`) and the AI policy. Runtime-gated on `anime.equipment` so a
 * module-off visit is byte-identical.
 */
const SHARED_BOTH_SHOPS = [
  EQUIPMENT_IDS.supplySatchel,
  EQUIPMENT_IDS.luckyCoin,
  EQUIPMENT_IDS.eternalSash,
  EQUIPMENT_IDS.marshalsWarHorn,
  EQUIPMENT_IDS.veteransStandard,
  EQUIPMENT_IDS.windriderSaddle,
  EQUIPMENT_IDS.spiritCraneMount,
  EQUIPMENT_IDS.bladeOfTheTrial,
  EQUIPMENT_IDS.alchemistsSatchel
] as const;

export const EQUIPMENT_SHOP_SALES: Record<string, readonly string[]> = {
  "anime.ren_binh_cac": [
    EQUIPMENT_IDS.ironBloodSword,
    EQUIPMENT_IDS.blackTortoiseMail,
    EQUIPMENT_IDS.cosmosPendant,
    ...SHARED_BOTH_SHOPS
  ],
  "anime.adventurer_outfitter": [
    EQUIPMENT_IDS.adventurersBlade,
    EQUIPMENT_IDS.guildIssueMail,
    EQUIPMENT_IDS.neonMicrophone,
    EQUIPMENT_IDS.stageCostume,
    EQUIPMENT_IDS.twinTailRibbon,
    EQUIPMENT_IDS.spiritFocus,
    ...SHARED_BOTH_SHOPS
  ]
};

/** The outfitter location ids (used by the shop-append seam gate). */
export const EQUIPMENT_SHOP_LOCATION_IDS: ReadonlySet<string> = new Set(Object.keys(EQUIPMENT_SHOP_SALES));

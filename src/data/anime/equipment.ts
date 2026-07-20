/**
 * Anime EQUIPMENT catalog (`anime.equipment`, plan §3.13 — a SHARED-spine
 * system for every hero, distinct from Artifact cards).
 *
 * Equipment is ALWAYS ON: an item sits in one of three hero slots
 * (weapon / armor / accessory) and its effect runs while equipped — it is never
 * in hand, never cast, never discarded. Buying into an occupied slot moves the
 * previous item into the equipment bag (no refund). Items are bought at two outfitter Field
 * Overrides (Rèn Binh Các / Adventurer Outfitter); they never join a deck.
 *
 * Every `summary` states EXACTLY the wired behaviour (CLAUDE.md §2) — no
 * display-only clauses. The engine reads each id in
 * `src/engine/anime-equipment.ts` and its consumers.
 *
 * Magnitudes are pegged to existing precedents (ONE power scale):
 *   • first-attack +1 Attack        → a single Bless/Bloodlust tier, one-shot
 *   • first-incoming −1 Attack       → the negative-morale attack-roll penalty
 *   • +1 spell Power                 → Pandora / Cultivation Nascent Soul / grade
 *   • +1 gold after a won combat     → grade Bounty Hunter's Eye (stacks to +2)
 *   • +1 hand limit                  → Pandora / Cultivation Foundation / grade
 *   • +1 building materials income   → Inexhaustible Cart of Ore / Pháp Bảo
 *
 * ART: all 12 items ship real icons (2026-07 wave 2) — square 512×512 webp,
 * transparent chroma-keyed background, painted HoMM3 artifact-icon style, under
 * `public/assets/anime/equipment/<slug>.webp`.
 * A future art-less item must be declared in `ANIME_EQUIPMENT_ART_PLACEHOLDERS`
 * (slot-glyph fallback). Pipeline: `scripts/place-anime-assets.mjs`; shopping
 * list history: `scripts/anime-art/ART-TODO.md`.
 */

import { ANIME_EQUIPMENT_SLOTS, type AnimeEquipmentSlot } from "@/engine/state";

export { ANIME_EQUIPMENT_SLOTS };
export type { AnimeEquipmentSlot };

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
  name: { en: string; vi: string };
  /** Gold cost at an outfitter shop. */
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
  twinTailRibbon: "anime.equip.twin_tail_ribbon"
} as const;

/** The catalog — 12 items, one effect each, every effect a proven-seam reuse. */
export const ANIME_EQUIPMENT_DEFINITIONS: Record<string, EquipmentDefinition> = {
  // ---- Xianxia (Rèn Binh Các / Blacksmith) --------------------------------
  [EQUIPMENT_IDS.ironBloodSword]: {
    id: EQUIPMENT_IDS.ironBloodSword,
    slot: "weapon",
    name: { en: "Iron-Blood Sword", vi: "Thiết Huyết Kiếm" },
    cost: 4,
    package: "anime-xianxia",
    summary:
      "Weapon: your units' FIRST declared attack each combat gets +1 Attack (your main hero's fights; not on retaliations)."
  },
  [EQUIPMENT_IDS.blackTortoiseMail]: {
    id: EQUIPMENT_IDS.blackTortoiseMail,
    slot: "armor",
    name: { en: "Black Tortoise Mail", vi: "Huyền Vũ Giáp" },
    cost: 4,
    package: "anime-xianxia",
    summary:
      "Armor: the FIRST enemy attack declared against your units each combat resolves at −1 Attack (your main hero's fights; not vs retaliations)."
  },
  [EQUIPMENT_IDS.cosmosPendant]: {
    id: EQUIPMENT_IDS.cosmosPendant,
    slot: "accessory",
    name: { en: "Cosmos Pendant", vi: "Càn Khôn Bội" },
    cost: 5,
    package: "anime-xianxia",
    summary: "Accessory: +1 spell Power on your casts (stacks with Cultivation / Hero-Grade Power)."
  },

  // ---- Isekai (Adventurer Outfitter) --------------------------------------
  [EQUIPMENT_IDS.adventurersBlade]: {
    id: EQUIPMENT_IDS.adventurersBlade,
    slot: "weapon",
    name: { en: "Adventurer's Blade", vi: "Kiếm Mạo Hiểm Giả" },
    cost: 4,
    package: "anime-isekai",
    summary: "Weapon: gain +1 gold after each combat you win (stacks with Bounty Hunter's Eye)."
  },
  [EQUIPMENT_IDS.guildIssueMail]: {
    id: EQUIPMENT_IDS.guildIssueMail,
    slot: "armor",
    name: { en: "Guild-Issue Mail", vi: "Giáp Công Hội" },
    cost: 4,
    package: "anime-isekai",
    summary: "Armor: +1 hand limit (stacks with Cultivation Foundation and Deep Pockets)."
  },

  // ---- Shared (both shops) -------------------------------------------------
  [EQUIPMENT_IDS.supplySatchel]: {
    id: EQUIPMENT_IDS.supplySatchel,
    slot: "accessory",
    name: { en: "Supply Satchel", vi: "Túi Tiếp Tế" },
    cost: 5,
    package: "shared",
    summary: "Accessory: +1 building materials at the start of each Resources round."
  },

  // ---- Wave 2 (shared — sold at BOTH outfitters) --------------------------
  [EQUIPMENT_IDS.marshalsWarHorn]: {
    id: EQUIPMENT_IDS.marshalsWarHorn,
    slot: "accessory",
    name: { en: "Marshal's War Horn", vi: "Chiến Hào Nguyên Soái" },
    cost: 6,
    package: "shared",
    requiresContext: "wog.commanders",
    summary:
      "Accessory: your Commander gains the pre-combat SORT window (reposition it in your deployment zone before round 1). Needs the WOG Commanders module + a commander in the fight; hidden at shops while Commanders is off."
  },
  [EQUIPMENT_IDS.veteransStandard]: {
    id: EQUIPMENT_IDS.veteransStandard,
    slot: "accessory",
    name: { en: "Veteran's Standard", vi: "Quân Kỳ Lão Binh" },
    cost: 5,
    package: "shared",
    requiresContext: "anime.unitExperience",
    summary:
      "Accessory: your surviving units gain +1 EXTRA Unit-Experience XP per won combat (2 total). Needs the Unit Experience module; hidden at shops while it is off."
  },
  [EQUIPMENT_IDS.windriderSaddle]: {
    id: EQUIPMENT_IDS.windriderSaddle,
    slot: "mount",
    name: { en: "Windrider Saddle", vi: "Yên Ngự Phong" },
    cost: 5,
    package: "shared",
    summary: "Mount: +1 movement point to your main hero at each turn refresh (folded into the per-turn movement max)."
  },
  [EQUIPMENT_IDS.spiritCraneMount]: {
    id: EQUIPMENT_IDS.spiritCraneMount,
    slot: "mount",
    name: { en: "Spirit Crane Mount", vi: "Tiên Hạc Kỵ" },
    cost: 6,
    package: "shared",
    requiresContext: "wog.commanders",
    summary:
      "Mount: if your Commander dies in a fight, it REVIVES FREE at combat end (no death, no revive gold) — same free-revive branch as the Helm of Immortality. Needs the WOG Commanders module; hidden at shops while Commanders is off."
  },
  [EQUIPMENT_IDS.bladeOfTheTrial]: {
    id: EQUIPMENT_IDS.bladeOfTheTrial,
    slot: "weapon",
    name: { en: "Blade of the Trial", vi: "Thí Luyện Kiếm" },
    cost: 5,
    package: "shared",
    summary:
      "Weapon: +1 Attack on your units' declared attacks during combat ROUND 1 only (your main hero's fights; not on retaliations, gone from round 2)."
  },
  [EQUIPMENT_IDS.alchemistsSatchel]: {
    id: EQUIPMENT_IDS.alchemistsSatchel,
    slot: "armor",
    name: { en: "Alchemist's Satchel", vi: "Túi Luyện Kim" },
    cost: 6,
    package: "shared",
    summary:
      "Armor: +1 gold at the start of each Resources round AND +1 gold after each combat you win (stacks with Adventurer's Blade / Bounty Hunter's Eye)."
  },

  // ---- Miku / Virtual Diva (isekai outfitter) ------------------------------
  [EQUIPMENT_IDS.neonMicrophone]: {
    id: EQUIPMENT_IDS.neonMicrophone,
    slot: "weapon",
    name: { en: "Neon Microphone", vi: "Micro Neon" },
    cost: 5,
    package: "anime-isekai",
    summary:
      "Weapon: your FIRST Spell each combat is cast at +1 Power (your main hero's fights; one charge per combat)."
  },
  [EQUIPMENT_IDS.stageCostume]: {
    id: EQUIPMENT_IDS.stageCostume,
    slot: "armor",
    name: { en: "Stage Costume", vi: "Trang Phục Sân Khấu" },
    cost: 5,
    package: "anime-isekai",
    summary:
      "Armor: the FIRST time one of your units is attacked each combat, that unit gains a Defense token after the attack resolves (your main hero's fights)."
  },
  [EQUIPMENT_IDS.twinTailRibbon]: {
    id: EQUIPMENT_IDS.twinTailRibbon,
    slot: "accessory",
    name: { en: "Twin-Tail Ribbon", vi: "Ruy Băng Đôi" },
    cost: 4,
    package: "anime-isekai",
    summary: "Accessory: +1 hand limit (stacks with Cultivation Foundation / Deep Pockets / Guild-Issue Mail)."
  }
};

/**
 * Equipment items that ship WITHOUT card/hex art yet (drop-art-later contract,
 * mirroring ANIME_ARTIFACT_ART_PLACEHOLDERS). Each MUST be a real equipment id;
 * a placeholder that already has art on disk, or a nonexistent id, fails the
 * hygiene test. When real art lands: add `public/assets/anime/equipment/<slug>.webp`
 * and remove the id here (the UI then draws it instead of the glyph fallback).
 */
export const ANIME_EQUIPMENT_ART_PLACEHOLDERS: ReadonlySet<string> = new Set([
  // EMPTY — all catalog items ship real 512×512 transparent webp icons under
  // public/assets/anime/equipment/ (incl. Miku-wave neon mic / stage costume /
  // twin-tail ribbon). A FUTURE art-less item must be declared here.
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
const WAVE_2_SHARED = [
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
    EQUIPMENT_IDS.supplySatchel,
    ...WAVE_2_SHARED
  ],
  "anime.adventurer_outfitter": [
    EQUIPMENT_IDS.adventurersBlade,
    EQUIPMENT_IDS.guildIssueMail,
    EQUIPMENT_IDS.supplySatchel,
    EQUIPMENT_IDS.neonMicrophone,
    EQUIPMENT_IDS.stageCostume,
    EQUIPMENT_IDS.twinTailRibbon,
    ...WAVE_2_SHARED
  ]
};

/** The outfitter location ids (used by the shop-append seam gate). */
export const EQUIPMENT_SHOP_LOCATION_IDS: ReadonlySet<string> = new Set(Object.keys(EQUIPMENT_SHOP_SALES));

/**
 * Anime EQUIPMENT catalog (`anime.equipment`, plan §3.13 — a SHARED-spine
 * system for every hero, distinct from Artifact cards).
 *
 * Equipment is ALWAYS ON: an item sits in one of three hero slots
 * (weapon / armor / accessory) and its effect runs while equipped — it is never
 * in hand, never cast, never discarded. Buying into an occupied slot REPLACES
 * the previous item (no refund). Items are bought at two outfitter Field
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
 * ART: none of these ship with a face yet. Each is declared in
 * `ANIME_EQUIPMENT_ART_PLACEHOLDERS`; the UI renders a slot glyph / initial
 * fallback until a real `.webp` lands under
 * `public/assets/anime/equipment/<slug>.webp` (drop the file, remove the id).
 * Art convention (the promote target): a square ITEM ICON, 512×512 webp,
 * transparent or subtle-frame background — a hero-board chip scale, register per
 * `package` (ink-wash xianxia vs anime-painterly isekai). The full art-TODO shop
 * list is `scripts/anime-art/ART-TODO.md`.
 */

import type { AnimeEquipmentSlot } from "@/engine/state";

export type { AnimeEquipmentSlot };

/** Which content family an equipment item belongs to (shop gating + naming). */
export type EquipmentPackage = "anime-xianxia" | "anime-isekai" | "shared";

export type EquipmentDefinition = {
  id: string;
  slot: AnimeEquipmentSlot;
  name: { en: string; vi: string };
  /** Gold cost at an outfitter shop. */
  cost: number;
  package: EquipmentPackage;
  /** Exactly the wired behaviour (no flavour the engine does not run). */
  summary: string;
};

// --- Item id constants (referenced by the engine wiring & tests) ------------
export const EQUIPMENT_IDS = {
  ironBloodSword: "anime.equip.iron_blood_sword",
  blackTortoiseMail: "anime.equip.black_tortoise_mail",
  cosmosPendant: "anime.equip.cosmos_pendant",
  adventurersBlade: "anime.equip.adventurers_blade",
  guildIssueMail: "anime.equip.guild_issue_mail",
  supplySatchel: "anime.equip.supply_satchel"
} as const;

/** The V1 catalog — 6 items, one effect each, every effect a proven-seam reuse. */
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
  EQUIPMENT_IDS.ironBloodSword,
  EQUIPMENT_IDS.blackTortoiseMail,
  EQUIPMENT_IDS.cosmosPendant,
  EQUIPMENT_IDS.adventurersBlade,
  EQUIPMENT_IDS.guildIssueMail,
  EQUIPMENT_IDS.supplySatchel
]);

/** Slot → emoji glyph (UI fallback while items have no art). */
export const EQUIPMENT_SLOT_GLYPH: Record<AnimeEquipmentSlot, string> = {
  weapon: "⚔",
  armor: "🛡",
  accessory: "💍"
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
export const EQUIPMENT_SHOP_SALES: Record<string, readonly string[]> = {
  "anime.ren_binh_cac": [
    EQUIPMENT_IDS.ironBloodSword,
    EQUIPMENT_IDS.blackTortoiseMail,
    EQUIPMENT_IDS.cosmosPendant,
    EQUIPMENT_IDS.supplySatchel
  ],
  "anime.adventurer_outfitter": [
    EQUIPMENT_IDS.adventurersBlade,
    EQUIPMENT_IDS.guildIssueMail,
    EQUIPMENT_IDS.supplySatchel
  ]
};

/** The outfitter location ids (used by the shop-append seam gate). */
export const EQUIPMENT_SHOP_LOCATION_IDS: ReadonlySet<string> = new Set(Object.keys(EQUIPMENT_SHOP_SALES));

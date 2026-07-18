/**
 * Ninefold Realms Field Override CONTENT — objects only.
 *
 * The Field Override *mechanism* is global (`src/data/map/field-overrides.ts` +
 * `src/engine/field-overrides.ts`). This file only registers anime/xianxia
 * hex objects into that catalog.
 */

import {
  registerFieldOverrideDefinitions,
  type FieldOverrideDefinition
} from "@/data/map/field-overrides";

const art = (slug: string) => `/assets/anime/field-overrides/${slug}.webp`;

/**
 * V1 Ninefold Realms override kinds. Teleportation Array carves as `monolith`
 * so it joins the real Monolith network with no new travel code.
 */
export const ANIME_FIELD_OVERRIDE_DEFINITIONS: Record<string, FieldOverrideDefinition> = {
  bi_canh: {
    id: "bi_canh",
    locationId: "anime.bi_canh",
    name: "Bí Cảnh (Secret Realm)",
    nameVi: "Bí Cảnh",
    package: "anime-xianxia",
    tileGroups: ["far", "near", "center"],
    terrain: "land",
    guard: 5,
    implementationStatus: "implemented",
    summary: "Guarded Secret Realm — defeat the guard for 2 Artifacts + 5 valuables.",
    image: art("bi_canh")
  },
  kiem_trung: {
    id: "kiem_trung",
    locationId: "anime.kiem_trung",
    name: "Kiếm Trủng (Sword Mound)",
    nameVi: "Kiếm Trủng",
    package: "anime-xianxia",
    tileGroups: ["far", "near"],
    terrain: "land",
    implementationStatus: "implemented",
    summary: "Draw 1 Artifact (Search 1); take −1 Morale from lingering sword intent.",
    image: art("kiem_trung")
  },
  linh_tuyen: {
    id: "linh_tuyen",
    locationId: "anime.linh_tuyen",
    name: "Linh Tuyền (Spirit Spring)",
    nameVi: "Linh Tuyền",
    package: "anime-xianxia",
    // NOT "starting": a home (Ⅰ) tile's fields materialize only at the opening
    // rotation and setup skips starting plans, so a starting pin never applies —
    // offering it in the designer would ship a silent no-op.
    tileGroups: ["far", "near"],
    terrain: "land",
    implementationStatus: "implemented",
    summary: "+1 Movement this round (cleanse of negative tokens: planned follow-up).",
    image: art("linh_tuyen")
  },
  ngo_dao_thach: {
    id: "ngo_dao_thach",
    locationId: "anime.ngo_dao_thach",
    name: "Ngộ Đạo Thạch (Enlightenment Stone)",
    nameVi: "Ngộ Đạo Thạch",
    package: "anime-xianxia",
    tileGroups: ["far", "near"],
    terrain: "land",
    implementationStatus: "implemented",
    summary: "Search (2) the Ability deck — keep 1, shuffle the rest back.",
    image: art("ngo_dao_thach")
  },
  /**
   * Teleportation Array — carves as its own location id with TOKEN_TELEPORT
   * (monolith network). The engine treats it as a Monolith network member
   * (see isMapTokenLocation / fieldIsTokenNetworkMember) so travel is real;
   * art is the Array hex, not the plain Monolith token.
   */
  tran_phap_truyen_tong: {
    id: "tran_phap_truyen_tong",
    locationId: "anime.tran_phap_truyen_tong",
    name: "Trận Pháp Truyền Tống (Teleportation Array)",
    nameVi: "Trận Pháp Truyền Tống",
    package: "anime-xianxia",
    tileGroups: ["far", "near", "center", "subterranean"],
    terrain: "land",
    implementationStatus: "implemented",
    summary: "Joins the Monolith teleport network (Array art + real Monolith travel).",
    image: art("tran_phap_truyen_tong")
  },

  // -------------------------------------------------------------------------
  // Wave 2 — xianxia (§5.5 / §5.8 "retained from earlier sketch"). Real hex art
  // shipped 2026-07 (`image`); the `glyph` stays as a text/icon fallback.
  // -------------------------------------------------------------------------
  /** Merchant Guild Post (§5.5) — the Trading Post as a xianxia guild stall. */
  thuong_hoi_tram: {
    id: "thuong_hoi_tram",
    locationId: "anime.thuong_hoi_tram",
    name: "Trạm Thương Hội (Merchant Guild Post)",
    nameVi: "Trạm Thương Hội",
    package: "anime-xianxia",
    tileGroups: ["far", "near"],
    terrain: "land",
    implementationStatus: "implemented",
    summary: "Revisitable Trading Post — trade resources at market rates any turn.",
    glyph: "🏪",
    image: art("thuong_hoi_tram")
  },
  /** Brotherhood Gambling Den (§5.5) — Crypt-cousin Attack-die gamble for a fee. */
  song_bac_quan: {
    id: "song_bac_quan",
    locationId: "anime.song_bac_quan",
    name: "Sòng Bạc Quán (Gambling Den)",
    nameVi: "Sòng Bạc Quán",
    package: "anime-xianxia",
    tileGroups: ["far", "near"],
    terrain: "land",
    implementationStatus: "implemented",
    summary: "Pay 2 gold to gamble on the Attack die: +1 wins 5 gold, 0 returns 2, −1 costs morale.",
    glyph: "🀄",
    image: art("song_bac_quan")
  },
  /**
   * Qi Refinement Platform. V1 REUSE reading (plan §0 rule 4): the original
   * sketch ("pay 1 MP → +1 Attack token for next combat") needs a NEW engine
   * arm, so V1 offers a Meditate/Breakthrough CHOOSE_ONE built from existing
   * vocabulary (morale vs an experience gamble). Documented at the location def.
   */
  dai_luyen_khi: {
    id: "dai_luyen_khi",
    locationId: "anime.dai_luyen_khi",
    name: "Đài Luyện Khí (Qi Refinement Platform)",
    nameVi: "Đài Luyện Khí",
    package: "anime-xianxia",
    tileGroups: ["far", "near"],
    terrain: "land",
    implementationStatus: "implemented",
    summary: "Choose: meditate for +1 morale, or gamble a breakthrough on the Attack die for experience.",
    glyph: "🧘",
    image: art("dai_luyen_khi")
  },

  // -------------------------------------------------------------------------
  // Wave 2 — isekai (first `anime-isekai` package content; source display names
  // per the plan's naming decision). Real hex art shipped 2026-07, glyph fallback kept.
  // -------------------------------------------------------------------------
  /** Capsule Corp Lab (Dragon Ball) — the War Machine Factory. */
  capsule_lab: {
    id: "capsule_lab",
    locationId: "anime.capsule_lab",
    name: "Capsule Corp Lab",
    package: "anime-isekai",
    tileGroups: ["far", "near", "center"],
    terrain: "land",
    implementationStatus: "implemented",
    summary: "Revisitable War Machine Factory — buy a war machine at the lower price any turn.",
    glyph: "🚀",
    image: art("capsule_lab")
  },
  /** Urahara's Shop (Bleach) — a paid curio counter + bargain bin. */
  urahara_shop: {
    id: "urahara_shop",
    locationId: "anime.urahara_shop",
    name: "Urahara's Shop",
    package: "anime-isekai",
    tileGroups: ["far", "near", "center"],
    terrain: "land",
    implementationStatus: "implemented",
    summary: "Revisitable: pay 3 gold to Search (1) an Artifact, or 1 gold for a Treasure-die roll.",
    glyph: "🏮",
    image: art("urahara_shop")
  },
  /** Hot Spring Inn / Onsen — Fountain-of-Youth twin without the youth. */
  onsen_ryokan: {
    id: "onsen_ryokan",
    locationId: "anime.onsen_ryokan",
    name: "Hot Spring Inn (Onsen)",
    package: "anime-isekai",
    tileGroups: ["far", "near"],
    terrain: "land",
    implementationStatus: "implemented",
    summary: "Choose: a long soak for +1 morale, or a quick dip for +1 movement this turn.",
    glyph: "♨",
    image: art("onsen_ryokan")
  },

  // -------------------------------------------------------------------------
  // Equipment outfitters (§3.13). Gated on `anime.equipment` via
  // `requiresModule` — with the module off they appear in NO pool / listing
  // (CONTROL-pinned). Real hex art shipped 2026-07, glyph fallback kept.
  // -------------------------------------------------------------------------
  /** Rèn Binh Các (Blacksmith) — sells the 3 xianxia items + the shared Satchel. */
  ren_binh_cac: {
    id: "ren_binh_cac",
    locationId: "anime.ren_binh_cac",
    name: "Rèn Binh Các (Blacksmith)",
    nameVi: "Rèn Binh Các",
    package: "anime-xianxia",
    requiresModule: "equipment",
    tileGroups: ["far", "near", "center"],
    terrain: "land",
    implementationStatus: "implemented",
    summary: "Outfitter: buy an always-on xianxia weapon/armor/accessory (or the shared Supply Satchel).",
    glyph: "⚒",
    image: art("ren_binh_cac")
  },
  /** Adventurer Outfitter — sells the 3 isekai items + the shared Satchel. */
  adventurer_outfitter: {
    id: "adventurer_outfitter",
    locationId: "anime.adventurer_outfitter",
    name: "Adventurer Outfitter",
    package: "anime-isekai",
    requiresModule: "equipment",
    tileGroups: ["far", "near", "center"],
    terrain: "land",
    implementationStatus: "implemented",
    summary: "Outfitter: buy an always-on isekai weapon/armor/accessory (or the shared Supply Satchel).",
    glyph: "🎒",
    image: art("adventurer_outfitter")
  }
};

/**
 * Kinds that ship WITHOUT hex art (drop-art-later contract). Each MUST be a
 * registered, implemented kind with NO `image` (a `glyph` fallback instead);
 * `field-overrides.test.ts` fails if a placeholder gains art, names a kind that
 * has art, or names a nonexistent kind — and if any registered kind is neither
 * art-on-disk nor a declared placeholder. When real art lands: add the .webp,
 * set `image: art("<id>")`, and remove the id from this set.
 */
export const FIELD_OVERRIDE_ART_PLACEHOLDERS: ReadonlySet<string> = new Set([
  // 2026-07: EMPTY — all 13 kinds now ship real 512×512 hex art (the 8 former
  // placeholders were generated + promoted; the 5 wave-1 hexes were regenerated
  // on-register — the earlier files were mismatched stock-like scenes). Any
  // FUTURE art-less kind must be declared here, keeping the glyph fallback.
]);

// Register into the global catalog at module load.
registerFieldOverrideDefinitions(ANIME_FIELD_OVERRIDE_DEFINITIONS);

// Re-export helpers so existing imports from this path keep working.
export {
  getFieldOverrideDefinition,
  listFieldOverrideDefinitions,
  isFieldOverrideKind,
  fieldOverrideImage,
  fieldOverrideGlyph,
  fieldOverrideKindRequiresAnime,
  type FieldOverrideDefinition,
  type FieldOverridePackage,
  type FieldOverrideTileGroup
} from "@/data/map/field-overrides";

/** @deprecated use isFieldOverrideKind / fieldOverrideKindIds from map/field-overrides */
export const FIELD_OVERRIDE_KIND_IDS = new Set(Object.keys(ANIME_FIELD_OVERRIDE_DEFINITIONS));

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
  }
};

// Register into the global catalog at module load.
registerFieldOverrideDefinitions(ANIME_FIELD_OVERRIDE_DEFINITIONS);

// Re-export helpers so existing imports from this path keep working.
export {
  getFieldOverrideDefinition,
  listFieldOverrideDefinitions,
  isFieldOverrideKind,
  fieldOverrideImage,
  fieldOverrideKindRequiresAnime,
  type FieldOverrideDefinition,
  type FieldOverridePackage,
  type FieldOverrideTileGroup
} from "@/data/map/field-overrides";

/** @deprecated use isFieldOverrideKind / fieldOverrideKindIds from map/field-overrides */
export const FIELD_OVERRIDE_KIND_IDS = new Set(Object.keys(ANIME_FIELD_OVERRIDE_DEFINITIONS));

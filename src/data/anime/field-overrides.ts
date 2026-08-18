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
  // FO redesign 2026-08-19: WAGER GUARD — no carve guard; the visitor picks the
  // trial depth and the reward scales with what they dared.
  bi_canh: {
    id: "bi_canh",
    locationId: "anime.bi_canh",
    name: "Bí Cảnh (Secret Realm)",
    nameVi: "Bí Cảnh",
    package: "anime-xianxia",
    tileGroups: ["far", "near", "center"],
    terrain: "land",
    implementationStatus: "implemented",
    summary:
      "Wager trial: choose depth Ⅲ–Ⅶ, fight it immediately. Deeper wins pay more — from Search (1) Artifact (Ⅲ) up to two Search (1) + a Search (3) of the Artifact deck (Ⅶ); Ⅵ adds a free Grade-II equipment pick (Equipment module). One clear, then the realm is spent.",
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
    summary:
      "Stake 1, 3 or 5 gold on the Attack die: +1 wins double the stake PLUS the house pot, 0 returns the stake, −1 feeds the stake into the pot (which waits on the hex for the next winner).",
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
  // Wave 3 — xianxia (WOG-parity objects; the same reusable machinery the Wake
  // of Gods New Objects gained — escalating re-guard fights via
  // `handleEscalatingFightVisit`, the commander-artifact reward helper). Real
  // 512×512 hex art shipped; no glyph placeholder (art wins).
  // -------------------------------------------------------------------------
  /**
   * Thí Luyện Tháp (Trial Tower) — a xianxia escalating repeatable fight, twin
   * of WoG's Adventure Cave (both drive the shared `handleEscalatingFightVisit`).
   * Guarded Ⅰ on first entry; each win re-guards one higher (Ⅰ→Ⅱ→Ⅲ) and pays a
   * xianxia reward ladder (win 1: +2 gold, win 2: Search (1) Spell, win 3: +1
   * hero XP — plus, with `anime.cultivation` on, one FEWER die on the hero's next
   * Heavenly Tribulation, and with the WOG Commanders module on a commander
   * artifact). Cleared after the 3rd win. Engine flow in `beginFieldVisit`.
   */
  thi_luyen_thap: {
    id: "thi_luyen_thap",
    locationId: "anime.thi_luyen_thap",
    name: "Thí Luyện Tháp (Trial Tower)",
    nameVi: "Thí Luyện Tháp",
    package: "anime-xianxia",
    tileGroups: ["far", "near", "center"],
    terrain: "land",
    guard: 1,
    implementationStatus: "implemented",
    summary:
      "Escalating fight (guarded Ⅰ→Ⅱ→Ⅲ). Each win pays a bigger reward (+2 gold, then Search (1) Spell, then +1 hero XP) and re-guards one higher; cleared after the 3rd win.",
    image: art("thi_luyen_thap")
  },
  /**
   * Linh Điền (Spirit Field) — a xianxia herb terrace. Revisitable: pay 1 gold,
   * then CHOOSE +1 building materials (harvest herbs) or +1 valuables (harvest
   * spirit-fruit). A pure static PAY_TO + CHOOSE_ONE (no new engine arm).
   */
  linh_dien: {
    id: "linh_dien",
    locationId: "anime.linh_dien",
    name: "Linh Điền (Spirit Field)",
    nameVi: "Linh Điền",
    package: "anime-xianxia",
    tileGroups: ["far", "near"],
    terrain: "land",
    implementationStatus: "implemented",
    summary:
      "Plant for 2 gold; harvest 3 rounds later for 3 valuables + 1 building materials. A rival visiting your crop may raid it for 1 valuables, trampling it. Revisitable.",
    image: art("linh_dien")
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
  // Wave 3 — isekai (WOG-parity objects). Real 512×512 hex art (no placeholder).
  // -------------------------------------------------------------------------
  // FO redesign 2026-08-19: WAGER GUARD — the isekai "dive deeper?" fantasy.
  dungeon_gate: {
    id: "dungeon_gate",
    locationId: "anime.dungeon_gate",
    name: "Dungeon Gate",
    package: "anime-isekai",
    tileGroups: ["far", "near", "center"],
    terrain: "land",
    implementationStatus: "implemented",
    summary:
      "Wager delve: choose floor Ⅰ–Ⅳ, fight it immediately. Rewards by floor: Ⅰ 2 gold · Ⅱ 1 Treasure die · Ⅲ Search (1) Artifact · Ⅳ a free Grade-II equipment pick (without the Equipment module: Search (1) Artifact + 2 gold). One clear, then the gate is spent.",
    image: art("dungeon_gate")
  },
  /**
   * Guild Bounty Board (isekai) — an adventurers' guild notice board.
   * Revisitable CHOOSE_ONE: claim the standing bounty (+2 gold — once per player
   * per game, a per-player latch on the field) or pay 2 gold to Search (1) the
   * Ability deck (repeatable). Dynamic menu (the bounty arm is absent once this
   * player has claimed it).
   */
  guild_bounty: {
    id: "guild_bounty",
    locationId: "anime.guild_bounty",
    name: "Guild Bounty Board",
    package: "anime-isekai",
    tileGroups: ["far", "near", "center"],
    terrain: "land",
    implementationStatus: "implemented",
    summary:
      "Claim the bounty for +2 gold (once per player, ever), or pay 2 gold to Search (1) the Ability deck.",
    image: art("guild_bounty")
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
    summary: "Outfitter: buy always-on hero equipment (weapon / armor / accessory / mount) — the xianxia items plus the shared wave-2 gear.",
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
    summary: "Outfitter: buy always-on hero equipment (weapon / armor / accessory / mount) — the isekai items plus the shared wave-2 gear.",
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

/**
 * The location ids the anime kinds carve. Used by the engine to gate the
 * dynamic-menu anime objects (Guild Bounty Board) in `beginFieldVisit`, mirroring
 * `WOG_FIELD_OVERRIDE_LOCATION_IDS`.
 */
export const ANIME_FIELD_OVERRIDE_LOCATION_IDS: ReadonlySet<string> = new Set(
  Object.values(ANIME_FIELD_OVERRIDE_DEFINITIONS).map((def) => def.locationId)
);

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

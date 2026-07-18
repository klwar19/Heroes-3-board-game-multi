/**
 * Ninefold Realms single-hex map locations.
 *
 * Registered into `locationDefinitions` so a Field Override carve always
 * resolves. Placement is gated by `anime.fieldOverrides` / designer pins
 * (see `src/data/anime/field-overrides.ts` and `docs/anime-mod-plan.md` §5.8).
 *
 * Engine readings are deliberate and named here — CLAUDE.md: ability/effect
 * text without a wired interaction is a stub.
 */

import type { LocationDefinition } from "@/data/map/types";

const animeCredit =
  "Ninefold Realms (Anime mod) — design in docs/anime-mod-plan.md §5.8. Engine readings are board-game adaptations of the brainstorm, not PC HoMM3 objects.";

function animeSource(slug: string) {
  return {
    product: "Heroes of Might and Magic III: The Board Game — Anime mod (Ninefold Realms)",
    credit: animeCredit,
    url: `anime-mod://locations/${slug}`
  };
}

/**
 * Xianxia location definitions. Keys are stable location ids used on
 * `MapFieldState.location` after a Field Override carve.
 */
export const animeLocationDefinitions: Record<string, LocationDefinition> = {
  /**
   * Bí Cảnh (*Secret Realm*) — Dragon Utopia lite as a single hex.
   * Guard difficulty is stamped by the Field Override definition (default 5),
   * not by this interaction. On visit (post-win): keep two Artifacts + 5 valuables.
   */
  "anime.bi_canh": {
    id: "anime.bi_canh",
    name: "Bí Cảnh (Secret Realm)",
    category: "visitable",
    interaction: {
      type: "SEQUENCE",
      interactions: [
        // times:2 → two independent Search(1) keeps → two Artifacts kept.
        { type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 1, times: 2 },
        { type: "GAIN_RESOURCES", valuables: 5 }
      ]
    },
    implementationStatus: "implemented",
    source: animeSource("bi_canh")
  },

  /**
   * Kiếm Trủng (*Sword Mound*) — Warrior's Tomb soft twin.
   * Free Search(1) Artifact + −1 morale (sword intent).
   */
  "anime.kiem_trung": {
    id: "anime.kiem_trung",
    name: "Kiếm Trủng (Sword Mound)",
    category: "visitable",
    interaction: {
      type: "SEQUENCE",
      interactions: [
        { type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 1 },
        { type: "GAIN_MORALE", amount: -1 }
      ]
    },
    implementationStatus: "implemented",
    source: animeSource("kiem_trung")
  },

  /**
   * Linh Tuyền (*Spirit Spring*) — Fountain of Youth twin.
   * V1 engine reading: +1 movement. Full "remove all negative status tokens
   * from the army" needs a dedicated cleanse step (map-side combat tokens do
   * not persist); negative morale discard is planned as a follow-up visit
   * step, not faked with +morale here.
   */
  "anime.linh_tuyen": {
    id: "anime.linh_tuyen",
    name: "Linh Tuyền (Spirit Spring)",
    category: "visitable",
    // engine: GAIN_MOVEMENT only for V1; cleanse of negative morale/tokens is
    // NOT wired yet (see docs/anime-mod-plan.md §5.8).
    interaction: { type: "GAIN_MOVEMENT", amount: 1 },
    implementationStatus: "implemented",
    source: animeSource("linh_tuyen")
  },

  /**
   * Ngộ Đạo Thạch (*Enlightenment Stone*) — Learning Stone / Scholar hybrid.
   * Search(2) Ability deck (look 2, keep 1) = sudden enlightenment.
   */
  "anime.ngo_dao_thach": {
    id: "anime.ngo_dao_thach",
    name: "Ngộ Đạo Thạch (Enlightenment Stone)",
    category: "visitable",
    interaction: { type: "SEARCH_SHARED_DECK", deckId: "abilities", count: 2 },
    implementationStatus: "implemented",
    source: animeSource("ngo_dao_thach")
  },

  /**
   * Trận Pháp Truyền Tống (*Teleportation Array*).
   * User brainstorm named Subterranean Gate; mechanics match the Two-Way
   * Monolith network. Carving uses location id `monolith` (see field-overrides
   * catalog) so travel is the existing TOKEN_TELEPORT path — no parallel
   * half-wired network. This definition exists for display / future separate
   * network stretch only; V1 override kind points at `monolith`.
   */
  "anime.tran_phap_truyen_tong": {
    id: "anime.tran_phap_truyen_tong",
    name: "Trận Pháp Truyền Tống (Teleportation Array)",
    category: "revisitable",
    interaction: { type: "TOKEN_TELEPORT", token: "monolith" },
    implementationStatus: "implemented",
    source: animeSource("tran_phap_truyen_tong")
  },

  // ===========================================================================
  // Wave 2 — 3 xianxia + 3 isekai single-hex objects. Every interaction below
  // is a PURE REUSE of the existing LocationInteraction vocabulary (no new
  // engine arm), so each is engine-executed the moment it carves. Effect tests:
  // src/engine/anime-locations.test.ts.
  // ===========================================================================

  /**
   * Trạm Thương Hội (*Merchant Guild Post*, §5.5) — the Trading Post reskinned
   * as a xianxia guild stall. Revisitable market (1 MP to reuse, no cube), so
   * it shares the `trading_post` behaviour verbatim: resource exchange at
   * TRADE_RATES plus the sell-a-card / war-machine options until the first
   * trade. NOT `tradesOnly` — a full Guild Post, unlike the Marketplace Event.
   */
  "anime.thuong_hoi_tram": {
    id: "anime.thuong_hoi_tram",
    name: "Trạm Thương Hội (Merchant Guild Post)",
    category: "revisitable",
    interaction: { type: "TRADING_POST" },
    implementationStatus: "implemented",
    source: animeSource("thuong_hoi_tram")
  },

  /**
   * Sòng Bạc Quán (*Gambling Den*, §5.5 Brotherhood Gambling Den) — a
   * Crypt-cousin Attack-die gamble gated behind a stake. Pay 2 gold, then roll
   * one Attack die: +1 → win 5 gold, 0 → get your 2 back (net even), −1 → lose
   * a morale token to the house. Declining (or a broke hero) pays nothing and
   * still cubes the field like any visitable pay-to site.
   */
  "anime.song_bac_quan": {
    id: "anime.song_bac_quan",
    name: "Sòng Bạc Quán (Gambling Den)",
    category: "visitable",
    interaction: {
      type: "PAY_TO",
      costOptions: [{ gold: 2 }],
      interaction: {
        type: "ATTACK_DIE_TABLE",
        plus: { type: "GAIN_RESOURCES", gold: 5 },
        zero: { type: "GAIN_RESOURCES", gold: 2 },
        minus: { type: "GAIN_MORALE", amount: -1 }
      }
    },
    implementationStatus: "implemented",
    source: animeSource("song_bac_quan")
  },

  /**
   * Đài Luyện Khí (*Qi Refinement Platform*).
   * V1 REUSE reading (docs/anime-mod-plan.md §0 rule 4 / §5.8): the earlier
   * sketch's "pay 1 MP → +1 Attack token for next combat" would need a NEW
   * engine arm (a persisted map-side combat token), so V1 does NOT ship that.
   * Instead it offers a CHOOSE_ONE built from existing vocabulary — meditate
   * for a morale token, or gamble a breakthrough on the Attack die for
   * experience (with a morale cost on a failed push). Swap to the token reading
   * only once that arm exists.
   */
  "anime.dai_luyen_khi": {
    id: "anime.dai_luyen_khi",
    name: "Đài Luyện Khí (Qi Refinement Platform)",
    category: "visitable",
    interaction: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Tĩnh tọa điều tức (Meditate) — gain 1 positive morale",
          interaction: { type: "GAIN_MORALE", amount: 1 }
        },
        {
          label: "Xung kích cảnh giới (Push a breakthrough) — gamble the Attack die",
          interaction: {
            type: "ATTACK_DIE_TABLE",
            plus: { type: "GAIN_EXPERIENCE", amount: 2 },
            zero: { type: "GAIN_EXPERIENCE", amount: 1 },
            minus: { type: "GAIN_MORALE", amount: -1 }
          }
        }
      ]
    },
    implementationStatus: "implemented",
    source: animeSource("dai_luyen_khi")
  },

  /**
   * Capsule Corp Lab (*Dragon Ball*) — the War Machine Factory reskinned.
   * Revisitable shop (no cube, 1 MP to reuse): buy a war machine at the lower
   * factory price, sharing `war_machine_factory` behaviour verbatim.
   */
  "anime.capsule_lab": {
    id: "anime.capsule_lab",
    name: "Capsule Corp Lab",
    category: "revisitable",
    interaction: { type: "WAR_MACHINE_SHOP" },
    implementationStatus: "implemented",
    source: animeSource("capsule_lab")
  },

  /**
   * Urahara's Shop (*Bleach*) — a paid curio counter. Revisitable (1 MP, no
   * cube): CHOOSE_ONE between a 3-gold Search(1) of the Artifact deck (the
   * curio) or a 1-gold single Treasure-die roll (the bargain bin). Both arms
   * are PAY_TO gates, so an unaffordable pick offers only Decline.
   */
  "anime.urahara_shop": {
    id: "anime.urahara_shop",
    name: "Urahara's Shop",
    category: "revisitable",
    interaction: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Buy a curio — pay 3 gold to Search (1) the Artifact deck",
          interaction: {
            type: "PAY_TO",
            costOptions: [{ gold: 3 }],
            interaction: { type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 1 }
          }
        },
        {
          label: "Bargain bin — pay 1 gold to roll 1 Treasure die",
          interaction: {
            type: "PAY_TO",
            costOptions: [{ gold: 1 }],
            interaction: { type: "ROLL_TREASURE_DICE", count: 1 }
          }
        }
      ]
    },
    implementationStatus: "implemented",
    source: animeSource("urahara_shop")
  },

  /**
   * Hot Spring Inn (*Onsen*) — a softer Fountain-of-Youth twin. Visitable
   * (cubes on visit): CHOOSE_ONE between a long soak (+1 morale token) and a
   * quick dip (+1 movement this turn). No "youth"/cleanse arm — pure reuse.
   */
  "anime.onsen_ryokan": {
    id: "anime.onsen_ryokan",
    name: "Hot Spring Inn (Onsen)",
    category: "visitable",
    interaction: {
      type: "CHOOSE_ONE",
      options: [
        { label: "Long soak — gain 1 positive morale", interaction: { type: "GAIN_MORALE", amount: 1 } },
        { label: "Quick dip — gain 1 movement this turn", interaction: { type: "GAIN_MOVEMENT", amount: 1 } }
      ]
    },
    implementationStatus: "implemented",
    source: animeSource("onsen_ryokan")
  },

  /**
   * Rèn Binh Các (*Blacksmith*, §3.13) — a xianxia equipment OUTFITTER.
   * Revisitable (1 MP, no cube). Its shop menu is NOT a static interaction: the
   * BUY_EQUIPMENT CHOOSE_ONE is built dynamically in `beginFieldVisit`'s
   * shop-append seam (per-hero — already-owned items are dropped, affordability
   * gated like PAY_TO), gated on `anime.equipment`. With the module off the
   * field carves as an inert revisitable hex (no steps), so no interaction is
   * declared here beyond NONE.
   */
  "anime.ren_binh_cac": {
    id: "anime.ren_binh_cac",
    name: "Rèn Binh Các (Blacksmith)",
    category: "revisitable",
    // engine: the equipment shop menu is appended at visit time (see
    // EQUIPMENT_SHOP_SALES + beginFieldVisit); there is no static interaction.
    interaction: { type: "NONE" },
    implementationStatus: "implemented",
    source: animeSource("ren_binh_cac")
  },

  /**
   * Adventurer Outfitter (§3.13) — an isekai equipment OUTFITTER. Same
   * dynamic-shop mechanism as Rèn Binh Các (see the note there).
   */
  "anime.adventurer_outfitter": {
    id: "anime.adventurer_outfitter",
    name: "Adventurer Outfitter",
    category: "revisitable",
    interaction: { type: "NONE" },
    implementationStatus: "implemented",
    source: animeSource("adventurer_outfitter")
  }
};

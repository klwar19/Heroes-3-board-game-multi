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
  }
};

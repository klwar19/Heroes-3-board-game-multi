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
   * Bí Cảnh (*Secret Realm*) — a WAGER GUARD trial (FO redesign 2026-08-19).
   * Carves UNGUARDED; the whole flow (depth pick Ⅲ–Ⅶ → immediate fight →
   * depth-keyed ladder reward → the site is spent, `field.wagerCleared`) is
   * engine code in `handleWagerObjectVisit` (adventure.ts) — no static
   * interaction. Ladder: docs/field-override-redesign-plan.md.
   */
  "anime.bi_canh": {
    id: "anime.bi_canh",
    name: "Bí Cảnh (Secret Realm)",
    category: "revisitable",
    // engine: the wager flow is handled in beginFieldVisit (handleWagerObjectVisit).
    interaction: { type: "NONE" },
    implementationStatus: "implemented",
    source: animeSource("bi_canh")
  },

  /**
   * Kiếm Trủng (*Sword Mound*) — Warrior's Tomb soft twin, GUARDED Ⅱ since the
   * FO redesign (2026-08-19): the mound's sword spirits must be beaten first
   * (`guard: 2` on the override def, stamped at carve; the generic Field
   * Override branch of `beginFieldVisit` clears the beaten guard on the win
   * visit). The win pays the static Search(1) Artifact below, and — with the
   * Unit Experience rule ON — `buildAnimeFieldVisitSteps` appends a CHOOSE_ONE
   * granting +2 unit XP to one chosen army unit card (arm absent with the rule
   * off). The old −1 morale forfeit is GONE.
   */
  "anime.kiem_trung": {
    id: "anime.kiem_trung",
    name: "Kiếm Trủng (Sword Mound)",
    category: "visitable",
    // engine: the printed Search runs from here; the Unit-Experience teaching
    // arm is appended at visit time (buildAnimeFieldVisitSteps).
    interaction: { type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 1 },
    implementationStatus: "implemented",
    source: animeSource("kiem_trung")
  },

  /**
   * Linh Tuyền (*Spirit Spring*) — Fountain of Youth twin. FO redesign
   * (2026-08-19): the cleanse is REAL now — CLEANSE_NEGATIVE_MORALE discards
   * EVERY negative morale token the visitor holds (morale < 0 → 0, one step at a
   * time through `changeMorale`, so each step is a MORALE_CHANGED event); with
   * nothing to cleanse it pays +1 morale instead. Then +1 movement, either way.
   * Visitable (takes a Black Cube). Combat status tokens are still out of scope:
   * they do not persist between combats, so there is nothing map-side to remove.
   */
  "anime.linh_tuyen": {
    id: "anime.linh_tuyen",
    name: "Linh Tuyền (Spirit Spring)",
    category: "visitable",
    interaction: {
      type: "SEQUENCE",
      interactions: [{ type: "CLEANSE_NEGATIVE_MORALE" }, { type: "GAIN_MOVEMENT", amount: 1 }]
    },
    implementationStatus: "implemented",
    source: animeSource("linh_tuyen")
  },

  /**
   * Ngộ Đạo Thạch (*Enlightenment Stone*) — Learning Stone / Scholar hybrid.
   * FO redesign (2026-08-19): the menu is built at visit time
   * (`buildAnimeFieldVisitSteps`) off the generic per-player once-ever latch
   * `field.fieldClaimedBy`. A player's FIRST visit is the sudden enlightenment —
   * Search (2) the Ability deck AND one Ability Empower token (the Creature-Bank
   * grant reused) — and latches; any later visit is a plain Search (1) Ability.
   * KNOWN LIMIT: the stone stays `visitable`, so its Black Cube normally means
   * only ONE visit ever happens; the "later visits" branch is reachable only
   * after a designer `clear_tile_cubes` timed event re-opens the hex.
   */
  "anime.ngo_dao_thach": {
    id: "anime.ngo_dao_thach",
    name: "Ngộ Đạo Thạch (Enlightenment Stone)",
    category: "visitable",
    // engine: the first-visit / later-visit branches are built at visit time.
    interaction: { type: "NONE" },
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
   *
   * FO redesign (2026-08-19): travel is UNCHANGED. A once-per-player-ever
   * "Attune" arm (+1 movement, latched on `field.fieldClaimedBy`) is UNSHIFTED
   * ahead of the TOKEN_TELEPORT step in `beginFieldVisit` — it must be answered
   * before travelling, because a resolved teleport moves the hero off this hex.
   * Once claimed the builder returns null and the visit is byte-identical to the
   * old pure-travel one.
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
   *
   * FO redesign (2026-08-19): the market is UNCHANGED; a "guild contract" arm is
   * APPENDED at visit time (`buildAnimeFieldVisitSteps`). Each game round the
   * post wants ONE resource kind — building materials or valuables, seeded off
   * the game seed + round, so every player sees the same want all round — and
   * once per player per round (`field.fieldRoundClaims`) they may sell 1 of it
   * for DOUBLE the market gold rate (`marketGoldValueOf`). Arm absent once
   * filled this round or with none of the wanted kind in hand.
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
    category: "revisitable",
    // engine (FO redesign 2026-08-19): choose-your-stake gamble with the
    // persistent HOUSE POT — the menu is built at visit time
    // (buildAnimeFieldVisitStep) because the payout table reads
    // field.denGoldPot. Revisitable: the den never cubes.
    interaction: { type: "NONE" },
    implementationStatus: "implemented",
    source: animeSource("song_bac_quan")
  },

  /**
   * Đài Luyện Khí (*Qi Refinement Platform*).
   * FO redesign (2026-08-19): the original sketch's "pay 1 MP → +1 Attack for the
   * next combat" NOW EXISTS as a real engine arm, so the Attack-die experience
   * gamble is retired. The menu is built at visit time
   * (`buildAnimeFieldVisitSteps`): "Meditate" (+1 morale, always) or "Temper the
   * body" — SPEND_HERO_MOVEMENT 1 → BANK_COMBAT_ATTACK_BOOST, i.e.
   * `PlayerState.pendingCombatAttackBoost`, consumed at this player's next combat
   * start where all their non-commander units gain +1 Attack for combat ROUND 1
   * only (`applyTemperedBodyAttackBoost`, adventure-reducer.ts). The temper arm is
   * absent with no movement left or one already banked.
   */
  "anime.dai_luyen_khi": {
    id: "anime.dai_luyen_khi",
    name: "Đài Luyện Khí (Qi Refinement Platform)",
    category: "visitable",
    // engine: the meditate / temper menu is built at visit time.
    interaction: { type: "NONE" },
    implementationStatus: "implemented",
    source: animeSource("dai_luyen_khi")
  },

  /**
   * Thí Luyện Tháp (*Trial Tower*) — a xianxia escalating repeatable fight, the
   * WOG Adventure Cave's twin. Guarded Ⅰ is stamped by the Field Override
   * definition; the reward ladder (FO redesign 2026-08-19 — win 1: +2 gold, win
   * 2: +3 unit XP to a chosen army unit card with Unit Experience ON, otherwise
   * the previous Search (1) Spell, win 3: +2 hero XP + optional
   * cultivation/commander riders) and the re-guard one
   * higher (Ⅰ→Ⅱ→Ⅲ, cleared after the 3rd win) are engine code in
   * `beginFieldVisit` (`handleAnimeTrialTowerVisit` → the shared
   * `handleEscalatingFightVisit`, keyed off `field.animeTrialWins`) — no static
   * interaction.
   */
  "anime.thi_luyen_thap": {
    id: "anime.thi_luyen_thap",
    name: "Thí Luyện Tháp (Trial Tower)",
    category: "revisitable",
    // engine: the escalating reward / re-guard is handled in beginFieldVisit.
    interaction: { type: "NONE" },
    implementationStatus: "implemented",
    source: animeSource("thi_luyen_thap")
  },

  /**
   * Linh Điền (*Spirit Field*) — a xianxia herb terrace. Revisitable (1 MP, no
   * cube): pay 1 gold, then CHOOSE the harvest — +1 building materials (spirit
   * herbs) or +1 valuables (spirit-fruit). Pure static PAY_TO + CHOOSE_ONE reuse.
   */
  "anime.linh_dien": {
    id: "anime.linh_dien",
    name: "Linh Điền (Spirit Field)",
    category: "revisitable",
    // engine (FO redesign 2026-08-19): PLANTED REWARD — plant 2 gold, harvest
    // ≥3 rounds later (+3 valuables +1 materials); a rival's visit may raid
    // (+1 valuables, crop trampled). Menu built at visit time
    // (buildAnimeFieldVisitStep) off field.plantedBy / field.plantedRound.
    interaction: { type: "NONE" },
    implementationStatus: "implemented",
    source: animeSource("linh_dien")
  },

  /**
   * Dungeon Gate (isekai) — a "gamble fight" delve. Guarded Ⅰ (stamped by the
   * Field Override definition); the visit runs only on the WIN, where a static
   * ATTACK_DIE_TABLE gambles the loot: +1 → a Treasure die, 0 → +2 gold, −1 →
   * +1 morale. Visitable (one delve, then a Black Cube). Board-adaptation of the
   * brainstorm's variable-difficulty die (a rolled-guard-then-reward flow cannot
   * be expressed in one visit — the fight resolves outside the visit), so the
   * guard is fixed Ⅰ and the die picks the reward tier (documented, plan §5.8).
   */
  "anime.dungeon_gate": {
    id: "anime.dungeon_gate",
    name: "Dungeon Gate",
    category: "revisitable",
    // engine (FO redesign 2026-08-19): a WAGER GUARD delve — pick your floor
    // Ⅰ–Ⅳ, fight it immediately, the win pays that floor's reward and spends
    // the gate (`field.wagerCleared`). Flow in handleWagerObjectVisit.
    interaction: { type: "NONE" },
    implementationStatus: "implemented",
    source: animeSource("dungeon_gate")
  },

  /**
   * Guild Bounty Board (isekai) — an adventurers' guild notice board.
   * Revisitable (1 MP, no cube). Its menu is NOT a static interaction: the
   * CHOOSE_ONE is built dynamically in `beginFieldVisit`
   * (`buildAnimeFieldVisitStep`) so the +2-gold bounty arm can be gated per
   * player — a once-ever claim tracked by the field's `animeBountyClaimedBy`
   * latch (mirrors `extraFlagOwnerIds`) — beside a repeatable pay-2-gold Search
   * (1) of the Ability deck. Carves as a NONE base (the menu is appended).
   */
  "anime.guild_bounty": {
    id: "anime.guild_bounty",
    name: "Guild Bounty Board",
    category: "revisitable",
    // engine: the bounty/search menu is built at visit time (buildAnimeFieldVisitStep);
    // the bounty arm is per-player once-latched on field.animeBountyClaimedBy.
    interaction: { type: "NONE" },
    implementationStatus: "implemented",
    source: animeSource("guild_bounty")
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
   *
   * FO redesign (2026-08-19): a REFORGE bench is appended beside the shop
   * (`buildEquipmentReforgeStep`, shared verbatim with the Adventurer Outfitter):
   * pay 2 gold, pick one owned item, then pick a DIFFERENT item of the SAME grade
   * — the traded-away item leaves the game (not bagged: it is a trade, not a
   * purchase). Absent with no owned item, too little gold, or no legal same-grade
   * replacement.
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

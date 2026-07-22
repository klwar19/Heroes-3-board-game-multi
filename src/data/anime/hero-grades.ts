/**
 * Hero Grades tree catalog, grade-name REGISTERS + the Training Manual item card
 * (`anime.heroGrades`, plan §3.11 — a SHARED-spine system for every hero).
 *
 * EXTENSIBILITY (plan §3.11): the whole system is DATA-driven so more tiers /
 * nodes are a pure content change:
 *   • `HERO_GRADE_MERIT_THRESHOLDS` is an ARRAY — its length IS the tier count
 *     and the grade cap (no literal "3" in engine logic);
 *   • the node catalog is grouped by `tier` with ANY number of nodes per tier;
 *   • each grade-name register is an array indexed by grade 0..N (length =
 *     tier count + 1);
 *   • one pick per tier (`HERO_GRADE_PICKS_PER_TIER`) — a future per-tier pick
 *     count is a single data change.
 * "Add a tier" recipe: append a threshold, add its nodes, and append ONE entry
 * to every register (a test pins register length === tier count + 1).
 *
 * Every node's `summary` states EXACTLY the wired behaviour (CLAUDE.md §2) — no
 * display-only clauses; the engine reads each node id in
 * `src/engine/anime-hero-grades.ts` and its consumers.
 *
 * Magnitudes are pegged to existing precedents (ONE power scale):
 *   • gold-after-win +1        → Brute Soul-Reformer (+2) softened
 *   • Resources-round +1 mats  → Inexhaustible Cart of Ore income
 *   • Resources-round +2 gold  → major-artifact income tier
 *   • +1 hand limit            → Pandora / Cultivation Foundation
 *   • +1 spell Power           → Pandora / Cultivation Nascent Soul
 *   • +1 Attack/Defense skill  → commander Precision/Shield reaction buffs
 *   • +1 movement skill        → Boots-of-Speed family (single point)
 */

import type { CardLibrary } from "@/engine/state";

const DECK_BACK = "/assets/player-deck-back.webp";

// ===========================================================================
// Tiers & thresholds (DATA — the tier count and grade cap derive from here)
// ===========================================================================

/**
 * Merit required to REACH each grade, indexed by grade-1. A widening ladder
 * (3 / +4 / +5) so early grades come from a couple of level-ups or hex visits
 * while grade 3 is a real investment. The ARRAY LENGTH is the tier count and the
 * grade cap — engine logic never hard-codes "3".
 */
export const HERO_GRADE_MERIT_THRESHOLDS: readonly number[] = [3, 7, 12];

/** Number of grade tiers = the grade cap (derived from the threshold array). */
export const HERO_GRADE_TIER_COUNT = HERO_GRADE_MERIT_THRESHOLDS.length;
/** Highest reachable grade (= tier count). */
export const HERO_GRADE_MAX = HERO_GRADE_TIER_COUNT;
/** Nodes a hero may pick per unlocked tier (pick-1-per-tier is the rule). */
export const HERO_GRADE_PICKS_PER_TIER = 1;

// ===========================================================================
// Grade-name REGISTERS (one mechanic, different NAMES per content family)
// ===========================================================================

export type GradeLabel = { en: string; vi: string };
export type GradeRegisterKey = "core" | "xianxia" | "isekai" | "kansen" | "modao";

/**
 * The bilingual grade-name registers, indexed by grade 0..N (length =
 * HERO_GRADE_TIER_COUNT + 1). Same mechanic, different titles per content family
 * (mirrors the plan §2 resource-subtitle rule). The engine picks ONE register
 * per hero (heroGradeRegisterKey) — mechanics/state never change with the label.
 */
export const HERO_GRADE_REGISTERS: Record<GradeRegisterKey, readonly GradeLabel[]> = {
  // Core / original — neutral heroic ranks (every current faction).
  core: [
    { en: "Recruit", vi: "Tân Binh" },
    { en: "Veteran", vi: "Cựu Binh" },
    { en: "Champion", vi: "Quán Quân" },
    { en: "Legend", vi: "Huyền Thoại" }
  ],
  // Ninefold Realms (xianxia) — martial-world titles.
  xianxia: [
    { en: "Martial Artist", vi: "Võ Giả" },
    { en: "Expert", vi: "Cao Thủ" },
    { en: "Grandmaster", vi: "Tông Sư" },
    { en: "Legendary", vi: "Truyền Kỳ" }
  ],
  // Otherworld Gate (isekai) — adventurer guild ranks.
  isekai: [
    { en: "Rank F", vi: "Hạng F" },
    { en: "Rank C", vi: "Hạng C" },
    { en: "Rank A", vi: "Hạng A" },
    { en: "Rank S", vi: "Hạng S" }
  ],
  // Azur Lane Naval Base (kansen) — the bespoke ship-rarity ladder. A NAMES-only
  // register: the mechanics/state are identical to every other family (this
  // faction shares the "anime" VISUAL register with Fuyuki — see
  // BESPOKE_FACTION_GRADE_REGISTERS below and factionVisualRegister).
  kansen: [
    { en: "Common", vi: "Thường" },
    { en: "Rare", vi: "Hiếm" },
    { en: "Elite", vi: "Tinh Nhuệ" },
    { en: "Super Rare", vi: "Siêu Hiếm" }
  ],
  // Heavenly Demon Palace (modao / Ma Đạo) — the bespoke demonic-path ladder. A
  // NAMES-only register: mechanics/state are identical to every other family.
  // This faction SHARES the "wuxia" VISUAL register with Azure Breeze Sect, so —
  // exactly like Azur Lane vs Fuyuki in the anime visual family — its explicit
  // faction mapping is what preserves distinct titles.
  modao: [
    { en: "Blood Adept", vi: "Huyết Đồ" },
    { en: "Demon General", vi: "Ma Tướng" },
    { en: "Demon King", vi: "Ma Vương" },
    { en: "Heavenly Demon", vi: "Thiên Ma" }
  ]
};

/**
 * Faction → grade-name register family (DATA). Labels follow the hero's faction
 * even on mixed-theme tables; enabling a content package never relabels another
 * faction. An unmapped faction defaults to "core".
 */
export const FACTION_GRADE_REGISTER: Record<string, GradeRegisterKey> = {
  castle: "core",
  rampart: "core",
  tower: "core",
  inferno: "core",
  necropolis: "core",
  dungeon: "core",
  stronghold: "core",
  fortress: "core",
  conflux: "core",
  factory: "core",
  cove: "core",
  bulwark: "core",
  fuyuki: "isekai",
  azure_breeze: "xianxia",
  hidden_leaf: "isekai",
  // Azur Lane uses its OWN bespoke ship-rarity register.
  azur_lane: "kansen",
  // Heavenly Demon Palace uses its OWN demonic register even though it shares
  // wuxia visual chrome with Azure Breeze.
  heavenly_demon: "modao"
};

/**
 * BESPOKE per-faction grade-name registers, resolved before the ordinary family
 * map in `heroGradeRegisterKey` (`src/engine/anime-hero-grades.ts`).
 *
 * WHY this exists: Azur Lane shares the "anime" visual family with Fuyuki /
 * Hidden Leaf, while Heavenly Demon shares "wuxia" with Azure Breeze. These
 * entries preserve the naval and demonic ladders without changing CSS themes.
 *
 * A faction NOT listed here falls through to the family resolution. The
 * bespoke register is NAMES-only: it never changes mechanics/state.
 */
export const BESPOKE_FACTION_GRADE_REGISTERS: Record<string, GradeRegisterKey> = {
  azur_lane: "kansen",
  // Heavenly Demon Palace shares the "wuxia" visual register with Azure Breeze
  // Sect. This explicit branch gives it the demonic "modao" ladder, exactly as
  // Azur Lane's "kansen" branch does inside the anime visual family.
  heavenly_demon: "modao"
};

/** The register family for a faction (defaults to core when unmapped). */
export function factionGradeRegister(factionId: string | undefined): GradeRegisterKey {
  return (factionId && FACTION_GRADE_REGISTER[factionId]) || "core";
}

// ===========================================================================
// Tree node catalog (3 tiers × 3 nodes — extend as pure data)
// ===========================================================================

/** How a "skill" node is used, and what it does — read by the engine dispatch. */
export type HeroGradeSkillSpec =
  | {
      /** Forced March: on your own map turn, +N movement, once per round. */
      mode: "map-active";
      effect: "movement";
      amount: number;
    }
  | {
      /**
       * War Cry: during your unit's combat activation, +N Attack this activation.
       * Encore: heal N damage on the active unit this activation.
       */
      mode: "combat-active";
      stat: "attack" | "heal";
      amount: number;
    }
  | {
      /**
       * Battle Focus (attacker/attack) / Iron Will (defender/defense): an instant
       * reaction inside an open attack window on your own unit, +N to the stat
       * for that attack. Harmony Ward: grant a Defense token on the defender.
       * Once per combat.
       */
      mode: "reaction";
      role: "attacker" | "defender";
      stat: "attack" | "defense" | "defense-token";
      amount: number;
    };

export type HeroGradeNode = {
  id: string;
  /** Tree tier (1..N); a node is pickable only at grade ≥ tier. */
  tier: number;
  /** Passives are always-on; skills are actives/reactions with cooldowns. */
  kind: "passive" | "skill";
  name: { en: string; vi: string };
  /** Exactly the wired behaviour (no flavour that the engine does not run). */
  summary: string;
  /** Present on skill nodes only — drives the active/reaction dispatch. */
  skill?: HeroGradeSkillSpec;
};

// --- Node id constants (referenced by the engine wiring & tests) ------------
export const HERO_GRADE_NODE_IDS = {
  bountyHuntersEye: "bounty-hunters-eye",
  provisioner: "provisioner",
  battleFocus: "battle-focus",
  deepPockets: "deep-pockets",
  ironWill: "iron-will",
  forcedMarch: "forced-march",
  arcaneInsight: "arcane-insight",
  warCry: "war-cry",
  tactician: "tactician",
  // Idol / song-themed creative nodes (shared tree — any hero may pick)
  encore: "encore",
  harmonyWard: "harmony-ward",
  standingOvation: "standing-ovation"
} as const;

/** The tree nodes, keyed by id. The `tier` field groups them (see HERO_GRADE_TREE). */
export const HERO_GRADE_NODES: Record<string, HeroGradeNode> = {
  // ---- Tier 1 --------------------------------------------------------------
  [HERO_GRADE_NODE_IDS.bountyHuntersEye]: {
    id: HERO_GRADE_NODE_IDS.bountyHuntersEye,
    tier: 1,
    kind: "passive",
    name: { en: "Bounty Hunter's Eye", vi: "Mắt Thợ Săn" },
    summary: "Passive: gain +1 gold after each combat you win."
  },
  [HERO_GRADE_NODE_IDS.provisioner]: {
    id: HERO_GRADE_NODE_IDS.provisioner,
    tier: 1,
    kind: "passive",
    name: { en: "Provisioner", vi: "Quân Nhu Quan" },
    summary: "Passive: gain +1 building materials at the start of each Resources round."
  },
  [HERO_GRADE_NODE_IDS.battleFocus]: {
    id: HERO_GRADE_NODE_IDS.battleFocus,
    tier: 1,
    kind: "skill",
    name: { en: "Battle Focus", vi: "Chiến Ý" },
    summary: "Skill (reaction): when your unit declares an attack, +1 Attack that attack. Once per combat.",
    skill: { mode: "reaction", role: "attacker", stat: "attack", amount: 1 }
  },

  // ---- Tier 2 --------------------------------------------------------------
  [HERO_GRADE_NODE_IDS.deepPockets]: {
    id: HERO_GRADE_NODE_IDS.deepPockets,
    tier: 2,
    kind: "passive",
    name: { en: "Deep Pockets", vi: "Túi Rộng" },
    summary: "Passive: +1 hand limit."
  },
  [HERO_GRADE_NODE_IDS.ironWill]: {
    id: HERO_GRADE_NODE_IDS.ironWill,
    tier: 2,
    kind: "skill",
    name: { en: "Iron Will", vi: "Ý Chí Sắt Đá" },
    summary: "Skill (reaction): when your unit is attacked, +1 Defense that attack. Once per combat.",
    skill: { mode: "reaction", role: "defender", stat: "defense", amount: 1 }
  },
  [HERO_GRADE_NODE_IDS.forcedMarch]: {
    id: HERO_GRADE_NODE_IDS.forcedMarch,
    tier: 2,
    kind: "skill",
    name: { en: "Forced March", vi: "Hành Quân Cấp Tốc" },
    summary: "Skill (active, your map turn): +1 movement point. Once per round.",
    skill: { mode: "map-active", effect: "movement", amount: 1 }
  },

  // ---- Tier 3 --------------------------------------------------------------
  [HERO_GRADE_NODE_IDS.arcaneInsight]: {
    id: HERO_GRADE_NODE_IDS.arcaneInsight,
    tier: 3,
    kind: "passive",
    name: { en: "Arcane Insight", vi: "Ngộ Tính" },
    summary: "Passive: +1 spell Power on your casts."
  },
  [HERO_GRADE_NODE_IDS.warCry]: {
    id: HERO_GRADE_NODE_IDS.warCry,
    tier: 3,
    kind: "skill",
    name: { en: "War Cry", vi: "Chiến Hống" },
    summary: "Skill (active, during your unit's activation): that unit gets +1 Attack this activation. Once per combat.",
    skill: { mode: "combat-active", stat: "attack", amount: 1 }
  },
  [HERO_GRADE_NODE_IDS.tactician]: {
    id: HERO_GRADE_NODE_IDS.tactician,
    tier: 3,
    kind: "passive",
    name: { en: "Tactician", vi: "Chiến Thuật Gia" },
    summary: "Passive: gain +2 gold at the start of each Resources round."
  },

  // ---- Idol / song-themed creative nodes -----------------------------------
  [HERO_GRADE_NODE_IDS.encore]: {
    id: HERO_GRADE_NODE_IDS.encore,
    tier: 1,
    kind: "skill",
    name: { en: "Encore", vi: "Điệp Khúc" },
    summary:
      "Skill (active, during your unit's activation): heal 1 damage on that unit. Once per combat.",
    skill: { mode: "combat-active", stat: "heal", amount: 1 }
  },
  [HERO_GRADE_NODE_IDS.harmonyWard]: {
    id: HERO_GRADE_NODE_IDS.harmonyWard,
    tier: 2,
    kind: "skill",
    name: { en: "Harmony Ward", vi: "Hộ Ca" },
    summary:
      "Skill (reaction): when your unit is attacked, it gains a Defense token after the attack resolves. Once per combat.",
    skill: { mode: "reaction", role: "defender", stat: "defense-token", amount: 1 }
  },
  [HERO_GRADE_NODE_IDS.standingOvation]: {
    id: HERO_GRADE_NODE_IDS.standingOvation,
    tier: 3,
    kind: "passive",
    name: { en: "Standing Ovation", vi: "Vỗ Tay Đứng" },
    summary: "Passive: gain +1 gold after each combat you win (stacks with Bounty Hunter's Eye / equipment)."
  }
};

/**
 * The tree grouped by tier (1..N), each tier in stable display order — derived
 * from the node catalog so ANY tier count / nodes-per-tier works with no code
 * change (extensibility).
 */
export const HERO_GRADE_TREE: Map<number, HeroGradeNode[]> = (() => {
  const byTier = new Map<number, HeroGradeNode[]>();
  for (const node of Object.values(HERO_GRADE_NODES)) {
    byTier.set(node.tier, [...(byTier.get(node.tier) ?? []), node]);
  }
  return byTier;
})();

// ===========================================================================
// Training Manual item card
// ===========================================================================
/** The one-time Training Manual purchasable at the guild shops. */
export const HERO_GRADE_TRAINING_MANUAL_CARD_ID = "anime.item.training_manual";

/**
 * The Training Manual (Học Vũ Kinh) — a one-time item. It lives in the card
 * library ALWAYS (lookups/hidden-info) but joins NO deck; it is bought for 2
 * gold at the two guild shops (Merchant Guild Post / Urahara's Shop) only when
 * `anime.heroGrades` is on. Playing it on the map grants +2 Merit and REMOVES
 * the card from the game (removeSelf convention), so it is truly single-use.
 * Modeled as a one-option CHOOSE_ONE so the removeSelf cost has an option to
 * ride, exactly like the Pháp Bảo remove sides.
 */
export const animeHeroGradeCards: CardLibrary = {
  [HERO_GRADE_TRAINING_MANUAL_CARD_ID]: {
    id: HERO_GRADE_TRAINING_MANUAL_CARD_ID,
    name: "Training Manual (Học Vũ Kinh)",
    kind: "artifact",
    timing: "instant",
    artifactTier: "minor",
    tags: [
      "artifact",
      "minor",
      "anime",
      "item",
      "hero-grades",
      "Remove this card: your Hero gains 2 Merit (grade progress)."
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Study the Training Manual: gain 2 Merit, then remove this card",
          mapOnly: true,
          cost: { removeSelf: true },
          effect: { type: "GAIN_GRADE_PROGRESS", amount: 2 }
        }
      ]
    },
    assets: { cardImage: DECK_BACK, imageAlt: "Training Manual item card" },
    implementationStatus: "implemented",
    source: {
      product: "Ninefold Realms (Anime mod) — Hero Grades shared system (docs/anime-mod-plan.md §3.11)",
      credit: "Original design for this repository. Printed text describes exactly the engine-wired behaviour.",
      url: "anime-mod://items/training_manual"
    }
  }
};

/**
 * Anime cards that live in `cardLibrary` but NEVER join a shared/starting deck
 * (distinct from `animeXianxiaArtifactCardIds`, which DO deck-join when the
 * module is on). The Training Manual is bought at a shop, never drawn, so it
 * must be excluded from the deck-coverage / combat-sandbox "every implemented
 * card is decked" invariants with this explicit, reviewable rationale.
 */
export const animeNeverDeckedCardIds: readonly string[] = [HERO_GRADE_TRAINING_MANUAL_CARD_ID];

/**
 * The two guild-shop location ids that sell the Training Manual when
 * `anime.heroGrades` is on (Merchant Guild Post + Urahara's Shop). Runtime-gated
 * at the visit-build seam so a module-off visit is byte-identical.
 */
export const HERO_GRADE_MANUAL_SHOP_LOCATION_IDS: ReadonlySet<string> = new Set([
  "anime.thuong_hoi_tram",
  "anime.urahara_shop"
]);

/**
 * The two "enlightenment" hex ids that grant +1 Merit IN ADDITION to their
 * printed reward when the module is on (runtime-gated so module-off is
 * byte-identical).
 */
export const HERO_GRADE_MERIT_HEX_LOCATION_IDS: ReadonlySet<string> = new Set([
  "anime.dai_luyen_khi",
  "anime.ngo_dao_thach"
]);

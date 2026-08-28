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
/** Each hero is dealt exactly four deterministic-random candidates per tier. */
export const HERO_GRADE_CHOICES_PER_TIER = 4;

// ===========================================================================
// Grade-name REGISTERS (one mechanic, different NAMES per content family)
// ===========================================================================

export type GradeLabel = { en: string; vi: string };
export type GradeRegisterKey = "core" | "xianxia" | "isekai" | "kansen" | "modao" | "seishun" | "mgq";

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
    { en: "Qi Refinement", vi: "Luyện Khí" },
    { en: "Foundation Establishment", vi: "Trúc Cơ" },
    { en: "Golden Core", vi: "Kim Đan" },
    { en: "Nascent Soul", vi: "Nguyên Anh" }
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
    { en: "Blood Refinement", vi: "Luyện Huyết" },
    { en: "Demon Foundation", vi: "Ma Cơ" },
    { en: "Demon Core", vi: "Ma Đan" },
    { en: "Demon Soul", vi: "Ma Anh" }
  ],
  // Little Busters (seishun / school-days) — also scales its town-exclusive battlefield hero.
  seishun: [
    { en: "Benchwarmer", vi: "Dự Bị" },
    { en: "Regular", vi: "Chính Thức" },
    { en: "Ace", vi: "Át Chủ Bài" },
    { en: "Strongest in the School", vi: "Mạnh Nhất Trường" }
  ],
  mgq: [
    { en: "Apprentice", vi: "Học Việc" },
    { en: "Journeyman", vi: "Hành Nghề" },
    { en: "Advanced Job", vi: "Nghề Cao Cấp" },
    { en: "Awakened", vi: "Thần Cấp" }
  ]
};

/** Bespoke grade emblems; other registers keep the existing Sparkles fallback. */
export const HERO_GRADE_ICONS: Partial<Record<GradeRegisterKey, readonly string[]>> = {
  xianxia: [
    "/assets/anime/icons/cultivation/qi-refinement.webp",
    "/assets/anime/icons/cultivation/foundation-establishment.webp",
    "/assets/anime/icons/cultivation/golden-core.webp",
    "/assets/anime/icons/cultivation/nascent-soul.webp"
  ],
  modao: [
    "/assets/anime/icons/cultivation/blood-refinement.webp",
    "/assets/anime/icons/cultivation/demon-foundation.webp",
    "/assets/anime/icons/cultivation/demon-core.webp",
    "/assets/anime/icons/cultivation/demon-soul.webp"
  ],
  seishun: [
    "/assets/anime/icons/little-busters/grade-benchwarmer.webp",
    "/assets/anime/icons/little-busters/grade-regular.webp",
    "/assets/anime/icons/little-busters/grade-ace.webp",
    "/assets/anime/icons/little-busters/grade-strongest-in-school.webp"
  ],
  mgq: [
    "/assets/anime/icons/mgq/grade-apprentice.webp",
    "/assets/anime/icons/mgq/grade-journeyman.webp",
    "/assets/anime/icons/mgq/grade-advanced-job.webp",
    "/assets/anime/icons/mgq/grade-awakened.webp"
  ]
};

export function heroGradeIconForFaction(factionId: string | undefined, grade: number): string | undefined {
  const register = factionGradeRegister(factionId);
  return HERO_GRADE_ICONS[register]?.[Math.max(0, Math.floor(grade))];
}

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
  heavenly_demon: "modao",
  little_busters: "seishun",
  mgq: "mgq"
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
  heavenly_demon: "modao",
  little_busters: "seishun",
  mgq: "mgq"
};

/** The register family for a faction (defaults to core when unmapped). */
export function factionGradeRegister(factionId: string | undefined): GradeRegisterKey {
  return (factionId && FACTION_GRADE_REGISTER[factionId]) || "core";
}

// ===========================================================================
// Tree node catalog (3 tiers with a varied node pool — extend as pure data)
// ===========================================================================

/** How a "skill" node is used, and what it does — read by the engine dispatch. */
export type HeroGradeSkillSpec =
  | {
      /** Reserved generic map-active movement skill shape for future nodes. */
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

/**
 * MGQ-only Awakened node contract. It stays outside the shared grade tree and
 * is appended only by the MGQ register catalog, so other factions never see or
 * pick a Job-system node they cannot use.
 */
export const MGQ_JOB_MASTERY_NODE = {
  id: "mgq-job-mastery",
  tier: 3,
  kind: "passive",
  name: { en: "Job Mastery", vi: "Tinh Thong Nghe Nghiep" },
  summary: "Passive: this hero's town Job assignments and reassignments cost 0 gold."
} as const satisfies HeroGradeNode;

export const XIANXIA_CULTIVATION_NODES = [
  {
    id: "xianxia-meridian-circulation", tier: 1, kind: "passive",
    name: { en: "Meridian Circulation", vi: "Chu Thiên Vận Khí" },
    summary: "Passive: begin each combat with 1 Sect Qi instead of 0."
  },
  {
    id: "xianxia-body-refinement", tier: 2, kind: "passive",
    name: { en: "Body Refinement", vi: "Luyện Thể" },
    summary: "Passive: Sect Qi capacity remains fixed at 2; this realm grants no extra Qi capacity."
  },
  {
    id: "xianxia-sword-domain", tier: 3, kind: "passive",
    name: { en: "Sword Domain", vi: "Kiếm Vực" },
    summary: "Passive: a Sword Intent hero releases Sword Intent after 2 damaging attacks instead of 3."
  }
] as const satisfies readonly HeroGradeNode[];

export const MODAO_CULTIVATION_NODES = [
  {
    id: "modao-blood-refinement", tier: 1, kind: "passive",
    name: { en: "Blood Refinement", vi: "Huyết Luyện" },
    summary: "Passive: begin each combat with 1 Blood Essence."
  },
  {
    id: "modao-corpse-furnace", tier: 2, kind: "passive",
    name: { en: "Corpse Furnace", vi: "Thi Lô" },
    summary: "Passive: your Blood Essence capacity increases from 4 to 5."
  },
  {
    id: "modao-forbidden-overreach", tier: 3, kind: "passive",
    name: { en: "Forbidden Overreach", vi: "Nghịch Thiên Cấm Thuật" },
    summary: "Passive: Blood Frenzy grants +2 Attack instead of +1 when it spends Essence."
  }
] as const satisfies readonly HeroGradeNode[];

// --- Node id constants (referenced by the engine wiring & tests) ------------
export const HERO_GRADE_NODE_IDS = {
  bountyHuntersEye: "bounty-hunters-eye",
  provisioner: "provisioner",
  battleFocus: "battle-focus",
  spiritCompanion: "spirit-companion",
  overflowingInsight: "overflowing-insight",
  oreDivination: "ore-divination",
  mineWindfall: "mine-windfall",
  volatileTreasury: "volatile-treasury",
  artifactBroker: "artifact-broker",
  spellSavant: "spell-savant",
  dualArcana: "dual-arcana",
  deepPockets: "deep-pockets",
  ironWill: "iron-will",
  forcedMarch: "forced-march",
  crystalDividend: "crystal-dividend",
  wanderingCurioDealer: "wandering-curio-dealer",
  firstBlood: "first-blood",
  resourceSacrifice: "resource-sacrifice",
  combatScholar: "combat-scholar",
  astrologersMorale: "astrologers-morale",
  resourceMastery: "resource-mastery",
  majorLegacy: "major-legacy",
  arcaneInsight: "arcane-insight",
  warCry: "war-cry",
  tactician: "tactician",
  fallingStar: "falling-star",
  veteranMentor: "veteran-mentor",
  inspiringPresence: "inspiring-presence",
  swiftHost: "swift-host",
  ancestralRecall: "ancestral-recall",
  relicDestiny: "relic-destiny",
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
  [HERO_GRADE_NODE_IDS.spiritCompanion]: {
    id: HERO_GRADE_NODE_IDS.spiritCompanion,
    tier: 1,
    kind: "passive",
    name: { en: "Spirit Companion", vi: "Linh Thú Đồng Hành" },
    summary: "Passive: during combat preparation, summon a sortable 2 Attack / 1 Defense / 2 Health / 8 Initiative Starwind Familiar for combat round 1."
  },
  [HERO_GRADE_NODE_IDS.overflowingInsight]: {
    id: HERO_GRADE_NODE_IDS.overflowingInsight,
    tier: 1,
    kind: "passive",
    name: { en: "Overflowing Insight", vi: "Linh Cảm Tràn Đầy" },
    summary: "Passive: during your start-of-turn hand refresh, draw 1 card over your hand limit, then discard back down to the limit."
  },
  [HERO_GRADE_NODE_IDS.oreDivination]: {
    id: HERO_GRADE_NODE_IDS.oreDivination,
    tier: 1,
    kind: "passive",
    name: { en: "Ore Divination", vi: "Bói Quặng" },
    summary: "Passive: gain +1 building material (ore) at the beginning of each Astrologers round."
  },
  [HERO_GRADE_NODE_IDS.mineWindfall]: {
    id: HERO_GRADE_NODE_IDS.mineWindfall, tier: 1, kind: "passive",
    name: { en: "Mine Windfall", vi: "Lộc Mỏ" },
    summary: "Passive: whenever you capture a Mine from another owner or the wild, immediately gain its printed production once as bonus resources."
  },
  [HERO_GRADE_NODE_IDS.volatileTreasury]: {
    id: HERO_GRADE_NODE_IDS.volatileTreasury, tier: 1, kind: "passive",
    name: { en: "Volatile Treasury", vi: "Ngân Khố Biến Động" },
    summary: "Passive: lose 3 gold each Resources round, then gain 6 gold each Astrologers round (loss floors at 0)."
  },
  [HERO_GRADE_NODE_IDS.artifactBroker]: {
    id: HERO_GRADE_NODE_IDS.artifactBroker, tier: 1, kind: "passive",
    name: { en: "Artifact Broker", vi: "Môi Giới Bảo Vật" },
    summary: "Passive: on your map turn, you may sell any Artifact in your hand for 4 gold; the sold card is removed."
  },
  [HERO_GRADE_NODE_IDS.spellSavant]: {
    id: HERO_GRADE_NODE_IDS.spellSavant, tier: 1, kind: "passive",
    name: { en: "Spell Savant", vi: "Kỳ Tài Pháp Thuật" },
    summary: "Passive: whenever you Search a Basic or Expert Spell deck, reveal 1 additional Spell."
  },
  [HERO_GRADE_NODE_IDS.dualArcana]: {
    id: HERO_GRADE_NODE_IDS.dualArcana, tier: 1, kind: "passive",
    name: { en: "Dual Arcana", vi: "Song Pháp" },
    summary: "One time when learned: gain 1 random Basic Spell and 1 random Expert Spell; if neither can be gained, gain 1 gold."
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
    kind: "passive",
    name: { en: "Forced March", vi: "Hành Quân Cấp Tốc" },
    summary: "Passive: your main hero gains +1 movement point at the beginning of each Resources round."
  },
  [HERO_GRADE_NODE_IDS.crystalDividend]: {
    id: HERO_GRADE_NODE_IDS.crystalDividend,
    tier: 2,
    kind: "passive",
    name: { en: "Crystal Dividend", vi: "Lợi Tức Pha Lê" },
    summary: "Passive: gain +1 valuable (crystal) at the beginning of each Resources round."
  },
  [HERO_GRADE_NODE_IDS.wanderingCurioDealer]: {
    id: HERO_GRADE_NODE_IDS.wanderingCurioDealer,
    tier: 2,
    kind: "passive",
    name: { en: "Wandering Curio Dealer", vi: "Thương Nhân Kỳ Vật" },
    summary: "Passive: at the beginning of each Astrologers round, you may pay 3 gold to reveal a random Minor Artifact and add it to your hand."
  },
  [HERO_GRADE_NODE_IDS.firstBlood]: {
    id: HERO_GRADE_NODE_IDS.firstBlood,
    tier: 2,
    kind: "passive",
    name: { en: "First Blood", vi: "Tiên Huyết" },
    summary: "Passive: the first declared attack by one of your units each combat gets +2 Attack."
  },
  [HERO_GRADE_NODE_IDS.resourceSacrifice]: {
    id: HERO_GRADE_NODE_IDS.resourceSacrifice, tier: 2, kind: "passive",
    name: { en: "Resource Sacrifice", vi: "Hiến Tế Tài Nguyên" },
    summary: "Passive: each Resources round, you may remove 1 card from your hand to gain 3 gold."
  },
  [HERO_GRADE_NODE_IDS.combatScholar]: {
    id: HERO_GRADE_NODE_IDS.combatScholar, tier: 2, kind: "passive",
    name: { en: "Combat Scholar", vi: "Học Giả Chiến Trận" },
    summary: "Passive: after each combat you win, every surviving deployed unit gains +1 bonus Unit Experience (when Unit Experience is enabled)."
  },
  [HERO_GRADE_NODE_IDS.astrologersMorale]: {
    id: HERO_GRADE_NODE_IDS.astrologersMorale, tier: 2, kind: "passive",
    name: { en: "Auspicious Stars", vi: "Cát Tinh" },
    summary: "Passive: gain +1 morale at the beginning of each Astrologers round."
  },
  [HERO_GRADE_NODE_IDS.resourceMastery]: {
    id: HERO_GRADE_NODE_IDS.resourceMastery, tier: 2, kind: "passive",
    name: { en: "Resource Mastery", vi: "Tinh Thông Tài Nguyên" },
    summary: "Passive: whenever you roll Resource dice, you may choose any printed face instead."
  },
  [HERO_GRADE_NODE_IDS.majorLegacy]: {
    id: HERO_GRADE_NODE_IDS.majorLegacy, tier: 2, kind: "passive",
    name: { en: "Major Legacy", vi: "Di Sản Cao Cấp" },
    summary: "One time when learned: gain 1 random Major Artifact."
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
  [HERO_GRADE_NODE_IDS.fallingStar]: {
    id: HERO_GRADE_NODE_IDS.fallingStar,
    tier: 3,
    kind: "passive",
    name: { en: "Falling Star", vi: "Sao Rơi" },
    summary: "Passive: at the beginning of each combat round, deal 1 effect damage to the slowest enemy unit. This is not a Ballista."
  },
  [HERO_GRADE_NODE_IDS.veteranMentor]: {
    id: HERO_GRADE_NODE_IDS.veteranMentor,
    tier: 3,
    kind: "passive",
    name: { en: "Veteran Mentor", vi: "Danh Sư Lão Luyện" },
    summary: "Passive: at the beginning of every game round, each unit card in your army gains +1 Unit Experience (when Unit Experience is enabled)."
  },
  [HERO_GRADE_NODE_IDS.inspiringPresence]: {
    id: HERO_GRADE_NODE_IDS.inspiringPresence, tier: 3, kind: "passive",
    name: { en: "Inspiring Presence", vi: "Khích Lệ" },
    summary: "Passive: gain +1 morale at the beginning of every game round."
  },
  [HERO_GRADE_NODE_IDS.swiftHost]: {
    id: HERO_GRADE_NODE_IDS.swiftHost, tier: 3, kind: "passive",
    name: { en: "Swift Host", vi: "Thần Tốc Quân" },
    summary: "Passive: all of your units gain +1 Initiative in combats led by your main hero."
  },
  [HERO_GRADE_NODE_IDS.ancestralRecall]: {
    id: HERO_GRADE_NODE_IDS.ancestralRecall, tier: 3, kind: "passive",
    name: { en: "Ancestral Recall", vi: "Hồi Ức Tổ Tiên" },
    summary: "Passive: each Resources round, you may choose 1 card from your discard pile and return it to your hand."
  },
  [HERO_GRADE_NODE_IDS.relicDestiny]: {
    id: HERO_GRADE_NODE_IDS.relicDestiny, tier: 3, kind: "passive",
    name: { en: "Relic Destiny", vi: "Thiên Mệnh Thánh Vật" },
    summary: "One time when learned: Search (5) the Relic Artifact deck and keep 1."
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
      "Skill (reaction): when your unit without a Defense token is attacked, it gains one for this attack and until its next activation. Once per combat.",
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
 * Register-owned additions to the shared tree. Job Mastery is deliberately
 * absent from HERO_GRADE_NODES: only the MGQ register receives it when the
 * engine builds that player's pickable catalog.
 */
export const HERO_GRADE_REGISTER_NODES: Partial<Record<GradeRegisterKey, readonly HeroGradeNode[]>> = {
  xianxia: XIANXIA_CULTIVATION_NODES,
  modao: MODAO_CULTIVATION_NODES,
  mgq: [MGQ_JOB_MASTERY_NODE]
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
 * library ALWAYS (lookups/hidden-info) but joins NO deck; it is bought for 5
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

/**
 * Anime EQUIPMENT catalog (`anime.equipment`, plan §3.13 — a SHARED-spine
 * system for every hero, distinct from Artifact cards).
 *
 * Equipment is ALWAYS ON: an item sits in one of three/four hero slots
 * (weapon / armor / accessory / mount) and its effect runs while equipped — it
 * is never in hand, never cast, never discarded. Buying into an occupied slot
 * moves the previous item into the equipment bag (no refund). Items are bought
 * at two outfitter Field Overrides (Rèn Binh Các / Adventurer Outfitter); they
 * never join a deck.
 *
 * GRADES (3 tiers, matching Artifact minor/major/relic):
 *   I   (minor)  — cost 5 gold, light standing bonuses
 *   II  (major)  — cost 7 gold, mid combat / economy
 *   III (relic)  — cost 10 gold, rare module-gated or dual-payoff items
 * Cost is derived from grade so shops and UI stay consistent.
 *
 * Every `summary` states EXACTLY the wired behaviour (CLAUDE.md §2) — no
 * display-only clauses. The engine reads each id in
 * `src/engine/anime-equipment.ts` and its consumers.
 *
 * ART: icons under `public/assets/anime/equipment/<slug>.webp` (512×512 webp).
 * A future art-less item must be declared in `ANIME_EQUIPMENT_ART_PLACEHOLDERS`.
 */

import { ANIME_EQUIPMENT_SLOTS, type AnimeEquipmentSlot, type ArtifactTier } from "@/engine/state";
import { factionVisualRegister } from "@/data/faction-theme";

export { ANIME_EQUIPMENT_SLOTS };
export type { AnimeEquipmentSlot };

/** Three equipment grades — same ladder as Artifact tiers (I=minor … III=relic). */
export type EquipmentGrade = "I" | "II" | "III";

/** Grade → Artifact-tier (for same-grade grant pairings / UI labels). */
export const EQUIPMENT_GRADE_TO_ARTIFACT_TIER: Record<EquipmentGrade, ArtifactTier> = {
  I: "minor",
  II: "major",
  III: "relic"
};

/** Canonical shop gold cost by grade. */
export const EQUIPMENT_GRADE_COST: Record<EquipmentGrade, number> = {
  I: 5,
  II: 7,
  III: 10
};

/** Roman / short labels for UI chips. */
export const EQUIPMENT_GRADE_LABEL: Record<EquipmentGrade, { en: string; short: string }> = {
  I: { en: "Grade I (Minor)", short: "I" },
  II: { en: "Grade II (Major)", short: "II" },
  III: { en: "Grade III (Relic)", short: "III" }
};

/**
 * Which content family an equipment item belongs to (shop gating + naming).
 * `classic` is the register line for the classic-chrome factions (Castle,
 * Rampart, …); `anime-xianxia` / `anime-isekai` are the two anime-town lines;
 * `shinobi` is Hidden Leaf Village's BESPOKE line, `kansen` is Azur Lane Naval
 * Base's BESPOKE line and `modao` is Heavenly Demon Palace's BESPOKE line (all
 * §3.13 FUTURE-TOWN RECIPE); `shared` items are sold at every outfitter.
 */
export type EquipmentPackage =
  | "anime-xianxia"
  | "anime-isekai"
  | "shared"
  | "classic"
  | "shinobi"
  | "kansen"
  | "modao"
  | "seishun"
  | "mgq";

/** Short flavour tag per package, for UI chips (paper-doll bag rows etc.). */
export const EQUIPMENT_PACKAGE_LABEL: Record<EquipmentPackage, string> = {
  "anime-xianxia": "xianxia",
  "anime-isekai": "isekai",
  shared: "shared",
  classic: "classic",
  shinobi: "shinobi",
  kansen: "kansen",
  modao: "modao",
  seishun: "seishun",
  mgq: "MGQ"
};

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
  /** One of three grades (I/II/III = minor/major/relic Artifact ladder). */
  grade: EquipmentGrade;
  name: { en: string; vi: string };
  /** Gold cost at an outfitter shop — always `EQUIPMENT_GRADE_COST[grade]`. */
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
  /** Faction birthright: exists as equipped rules data, but never enters shops or decks. */
  intrinsic?: boolean;
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
  twinTailRibbon: "anime.equip.twin_tail_ribbon",
  // --- Grade fill-out wave (3 grades proper) --------------------------------
  luckyCoin: "anime.equip.lucky_coin",
  spiritFocus: "anime.equip.spirit_focus",
  eternalSash: "anime.equip.eternal_sash",
  // --- Classic register line (2026-07): 6 items for classic-chrome factions.
  //     Every effect is a PURE reuse of an already-wired equipment seam (see
  //     src/engine/anime-equipment.ts); the two relics COMBINE two seams like
  //     Alchemist's Satchel. 2 per grade, spread across all four slots. --------
  crusadersPoleaxe: "anime.equip.crusaders_poleaxe",
  coinwardTalisman: "anime.equip.coinward_talisman",
  ironbarkCuirass: "anime.equip.ironbark_cuirass",
  coursersBarding: "anime.equip.coursers_barding",
  hornOfPlenty: "anime.equip.horn_of_plenty",
  wardensAegis: "anime.equip.wardens_aegis",
  // --- Hidden Leaf Village bespoke "shinobi" register line (§3.13 FUTURE-TOWN
  //     RECIPE): 3 items, each a PURE reuse of an already-wired equipment seam
  //     (src/engine/anime-equipment.ts). hidden_leaf's register line at BOTH
  //     outfitters via `equipmentPackagesForFaction`; never in EQUIPMENT_SHOP_SALES.
  shinobiKunaiPouch: "anime.equip.shinobi_kunai_pouch",
  bodyFlickerTabi: "anime.equip.body_flicker_tabi",
  sageChakraCharm: "anime.equip.sage_chakra_charm",
  // --- Azur Lane Naval Base bespoke "kansen" register line (§3.13 FUTURE-TOWN
  //     RECIPE): 6 items (2 per grade, all four slots), each a PURE reuse of an
  //     already-wired equipment seam (src/engine/anime-equipment.ts). azur_lane's
  //     register line at BOTH outfitters via `equipmentPackagesForFaction`; never
  //     in EQUIPMENT_SHOP_SALES.
  oxygenTorpedo: "anime.equip.oxygen_torpedo",
  repairToolkit: "anime.equip.repair_toolkit",
  sgRadar: "anime.equip.sg_radar",
  manjuuPiggyBank: "anime.equip.manjuu_piggy_bank",
  beaverSquadTag: "anime.equip.beaver_squad_tag",
  retrofitBlueprint: "anime.equip.retrofit_blueprint",
  // --- Heavenly Demon Palace bespoke "modao" register line (§3.13 FUTURE-TOWN
  //     RECIPE): 3 items (one per grade, distinct slots), each a PURE reuse of an
  //     already-wired equipment seam (src/engine/anime-equipment.ts). heavenly_demon's
  //     register line at BOTH outfitters via `equipmentPackagesForFaction`; never
  //     in EQUIPMENT_SHOP_SALES.
  demonBloodSaber: "anime.equip.demon_blood_saber",
  bonefiendPlate: "anime.equip.bonefiend_plate",
  demonHeartRelic: "anime.equip.demon_heart",
  soulBanner: "anime.equip.ten_thousand_souls_banner",
  littleBustersGlassMarbles: "anime.equip.little-busters-harukas-glass-marbles",
  littleBustersMissionLetter: "anime.equip.little-busters-lennons-mission-letter",
  littleBustersMiosParasol: "anime.equip.little-busters-mios-parasol",
  littleBustersFlightGoggles: "anime.equip.little-busters-kuds-flight-goggles",
  littleBustersPracticeBat: "anime.equip.little-busters-little-busters-practice-bat",
  pathfindersBoots: "anime.equip.pathfinders_boots",
  surveyorsLens: "anime.equip.surveyors_lens",
  hearthboundHorseshoe: "anime.equip.hearthbound_horseshoe",
  spellwardBrooch: "anime.equip.spellward_brooch",
  reactiveBuckler: "anime.equip.reactive_buckler",
  duelistInsignia: "anime.equip.duelist_insignia",
  clockworkSpurs: "anime.equip.clockwork_spurs",
  corrosionEdge: "anime.equip.corrosion_edge",
  wyvernNeedle: "anime.equip.wyvern_needle",
  fieldMedicKit: "anime.equip.field_medic_kit",
  foldedTacticsManual: "anime.equip.folded_tactics_manual",
  guardianMirror: "anime.equip.guardian_mirror",
  chronicleSpurs: "anime.equip.chronicle_spurs",
  littleBustersRevolutionWatch: "anime.equip.little-busters-school-revolution-watch",
  mgqAngelHalo: "anime.equip.mgq-angel-halo",
  mgqHeavenlyKnightsAegis: "anime.equip.mgq-heavenly-knights-aegis",
  mgqMonsterLordsRing: "anime.equip.mgq-monster-lords-ring"
} as const;

function equip(
  partial: Omit<EquipmentDefinition, "cost"> & { grade: EquipmentGrade }
): EquipmentDefinition {
  return { ...partial, cost: EQUIPMENT_GRADE_COST[partial.grade] };
}

/** The catalog — every effect a proven-seam reuse; every item has a grade. */
export const ANIME_EQUIPMENT_DEFINITIONS: Record<string, EquipmentDefinition> = {
  // ---- Grade I (minor, 4g) ------------------------------------------------
  [EQUIPMENT_IDS.ironBloodSword]: equip({
    id: EQUIPMENT_IDS.ironBloodSword,
    slot: "weapon",
    grade: "I",
    name: { en: "Iron-Blood Sword", vi: "Thiết Huyết Kiếm" },
    package: "anime-xianxia",
    summary:
      "Weapon · Grade I: your units' FIRST declared attack each combat gets +1 Attack (your main hero's fights; not on retaliations)."
  }),
  [EQUIPMENT_IDS.blackTortoiseMail]: equip({
    id: EQUIPMENT_IDS.blackTortoiseMail,
    slot: "armor",
    grade: "I",
    name: { en: "Black Tortoise Mail", vi: "Huyền Vũ Giáp" },
    package: "anime-xianxia",
    summary:
      "Armor · Grade I: the FIRST enemy attack declared against your units each combat resolves at −1 Attack (your main hero's fights; not vs retaliations)."
  }),
  [EQUIPMENT_IDS.adventurersBlade]: equip({
    id: EQUIPMENT_IDS.adventurersBlade,
    slot: "weapon",
    grade: "I",
    name: { en: "Adventurer's Blade", vi: "Kiếm Mạo Hiểm Giả" },
    package: "anime-isekai",
    summary: "Weapon · Grade I: gain +1 gold after each combat you win (stacks with Bounty Hunter's Eye / Lucky Coin)."
  }),
  [EQUIPMENT_IDS.guildIssueMail]: equip({
    id: EQUIPMENT_IDS.guildIssueMail,
    slot: "armor",
    grade: "I",
    name: { en: "Guild-Issue Mail", vi: "Giáp Công Hội" },
    package: "anime-isekai",
    summary: "Armor · Grade I: +1 hand limit and −1 movement point at each turn refresh."
  }),
  [EQUIPMENT_IDS.twinTailRibbon]: equip({
    id: EQUIPMENT_IDS.twinTailRibbon,
    slot: "accessory",
    grade: "I",
    name: { en: "Twin-Tail Ribbon", vi: "Ruy Băng Đôi" },
    package: "anime-isekai",
    summary: "Accessory · Grade I: +1 hand limit and −1 movement point at each turn refresh."
  }),
  [EQUIPMENT_IDS.luckyCoin]: equip({
    id: EQUIPMENT_IDS.luckyCoin,
    slot: "accessory",
    grade: "I",
    name: { en: "Lucky Coin", vi: "Đồng Xu May Mắn" },
    package: "shared",
    summary: "Accessory · Grade I: once per game round, reroll one Treasure die."
  }),

  // ---- Grade II (major, 6g) -----------------------------------------------
  [EQUIPMENT_IDS.cosmosPendant]: equip({
    id: EQUIPMENT_IDS.cosmosPendant,
    slot: "accessory",
    grade: "II",
    name: { en: "Cosmos Pendant", vi: "Càn Khôn Bội" },
    package: "anime-xianxia",
    summary: "Accessory · Grade II: +1 spell Power on your casts during combat round 1 only (your main hero's fights)."
  }),
  [EQUIPMENT_IDS.supplySatchel]: equip({
    id: EQUIPMENT_IDS.supplySatchel,
    slot: "accessory",
    grade: "II",
    name: { en: "Supply Satchel", vi: "Túi Tiếp Tế" },
    package: "shared",
    summary: "Accessory · Grade II: your Search (X) reveals one extra card; take cards using the normal Search rules."
  }),
  [EQUIPMENT_IDS.windriderSaddle]: equip({
    id: EQUIPMENT_IDS.windriderSaddle,
    slot: "mount",
    grade: "II",
    name: { en: "Windrider Saddle", vi: "Yên Ngự Phong" },
    package: "shared",
    summary: "Mount · Grade II: +1 movement point to your main hero at each turn refresh and −1 hand limit."
  }),
  [EQUIPMENT_IDS.bladeOfTheTrial]: equip({
    id: EQUIPMENT_IDS.bladeOfTheTrial,
    slot: "weapon",
    grade: "II",
    name: { en: "Blade of the Trial", vi: "Thí Luyện Kiếm" },
    package: "shared",
    summary:
      "Weapon · Grade II: +1 Attack on your units' declared attacks during combat round 1 (not retaliations); one seeded-random allied army unit cannot retaliate during round 1."
  }),
  [EQUIPMENT_IDS.veteransStandard]: equip({
    id: EQUIPMENT_IDS.veteransStandard,
    slot: "accessory",
    grade: "II",
    name: { en: "Veteran's Standard", vi: "Quân Kỳ Lão Binh" },
    package: "shared",
    requiresContext: "anime.unitExperience",
    summary:
      "Accessory · Grade II: an allied army card gains +1 Unit Experience whenever it defeats a real enemy unit. Needs the Unit Experience module; hidden at shops while it is off."
  }),
  [EQUIPMENT_IDS.neonMicrophone]: equip({
    id: EQUIPMENT_IDS.neonMicrophone,
    slot: "weapon",
    grade: "II",
    name: { en: "Neon Microphone", vi: "Micro Neon" },
    package: "anime-isekai",
    summary:
      "Weapon · Grade II: your FIRST Spell each combat is cast at +1 Power (your main hero's fights; one charge per combat)."
  }),
  [EQUIPMENT_IDS.stageCostume]: equip({
    id: EQUIPMENT_IDS.stageCostume,
    slot: "armor",
    grade: "II",
    name: { en: "Stage Costume", vi: "Trang Phục Sân Khấu" },
    package: "anime-isekai",
    summary:
      "Armor · Grade II: the FIRST time one of your units is attacked each combat, that unit gains a Defense token after the attack resolves (your main hero's fights)."
  }),
  [EQUIPMENT_IDS.spiritFocus]: equip({
    id: EQUIPMENT_IDS.spiritFocus,
    slot: "accessory",
    grade: "II",
    name: { en: "Spirit Focus", vi: "Tụ Linh Châu" },
    package: "anime-isekai",
    summary: "Accessory · Grade II: +1 spell Power on your casts during combat round 1 only (your main hero's fights)."
  }),

  // ---- Grade III (relic, 8g) ----------------------------------------------
  [EQUIPMENT_IDS.marshalsWarHorn]: equip({
    id: EQUIPMENT_IDS.marshalsWarHorn,
    slot: "accessory",
    grade: "III",
    name: { en: "Marshal's War Horn", vi: "Chiến Hào Nguyên Soái" },
    package: "shared",
    requiresContext: "wog.commanders",
    summary:
      "Accessory · Grade III: your Commander gains the pre-combat SORT window and +2 maximum Health, and — like the Vanguard Marshal specialty — while on your front line it has +2 Speed for the fight and +1 Attack during combat round 1. Needs the WOG Commanders module + a commander in the fight; hidden at shops while Commanders is off."
  }),
  [EQUIPMENT_IDS.spiritCraneMount]: equip({
    id: EQUIPMENT_IDS.spiritCraneMount,
    slot: "mount",
    grade: "III",
    name: { en: "Spirit Crane Mount", vi: "Tiên Hạc Kỵ" },
    package: "shared",
    requiresContext: "wog.commanders",
    summary:
      "Mount · Grade III: your Commander gets +2 Speed; if it dies, it revives free at combat end. Needs the WOG Commanders module; hidden at shops while Commanders is off."
  }),
  [EQUIPMENT_IDS.alchemistsSatchel]: equip({
    id: EQUIPMENT_IDS.alchemistsSatchel,
    slot: "armor",
    grade: "III",
    name: { en: "Alchemist's Satchel", vi: "Túi Luyện Kim" },
    package: "shared",
    summary:
      "Armor · Grade III: all allied units take 1 less Spell damage in your main hero's combats."
  }),
  [EQUIPMENT_IDS.eternalSash]: equip({
    id: EQUIPMENT_IDS.eternalSash,
    slot: "accessory",
    grade: "III",
    name: { en: "Eternal Sash", vi: "Đới Trường Sinh" },
    package: "shared",
    summary:
      "Accessory · Grade III: during combat round 1, every allied Attack roll has advantage (roll twice and resolve the higher result)."
  }),

  // ==== Classic register line (2026-07) ====================================
  // Balanced twins/combos of proven seams, flavoured for classic factions.
  // ---- Grade I (minor, 4g) ------------------------------------------------
  [EQUIPMENT_IDS.crusadersPoleaxe]: equip({
    id: EQUIPMENT_IDS.crusadersPoleaxe,
    slot: "weapon",
    grade: "I",
    name: { en: "Crusader's Poleaxe", vi: "Đại Kích Thánh Chiến" },
    package: "classic",
    // Seam: equipmentFirstAttackBonus (the Iron-Blood Sword fold).
    summary:
      "Weapon · Grade I: once per game round, reroll one Attack die."
  }),
  [EQUIPMENT_IDS.coinwardTalisman]: equip({
    id: EQUIPMENT_IDS.coinwardTalisman,
    slot: "accessory",
    grade: "I",
    name: { en: "Coinward Talisman", vi: "Bùa Chiêu Tài" },
    package: "classic",
    // Seam: equipmentWinGold (the Lucky Coin fold).
    summary:
      "Accessory · Grade I: once per game round, the gold-paid side of one market trade costs 1 less gold."
  }),

  // ---- Grade II (major, 6g) -----------------------------------------------
  [EQUIPMENT_IDS.ironbarkCuirass]: equip({
    id: EQUIPMENT_IDS.ironbarkCuirass,
    slot: "armor",
    grade: "II",
    name: { en: "Ironbark Cuirass", vi: "Giáp Thiết Mộc" },
    package: "classic",
    // Seam: applyEquipmentStageCostumeDefenseToken (the Stage Costume fold).
    summary:
      "Armor · Grade II: allied ground units standing on your back line gain +1 Defense."
  }),
  [EQUIPMENT_IDS.coursersBarding]: equip({
    id: EQUIPMENT_IDS.coursersBarding,
    slot: "mount",
    grade: "II",
    name: { en: "Courser's Barding", vi: "Giáp Chiến Mã" },
    package: "classic",
    // Seam: equipmentMovementBonus (the Windrider Saddle fold).
    summary:
      "Mount · Grade II: moving from land to sea does not end your main hero's movement."
  }),

  // ---- Grade III (relic, 8g) — each COMBINES two proven seams -------------
  [EQUIPMENT_IDS.hornOfPlenty]: equip({
    id: EQUIPMENT_IDS.hornOfPlenty,
    slot: "accessory",
    grade: "II",
    name: { en: "Horn of Plenty", vi: "Tù Và Sung Túc" },
    package: "classic",
    // Seams: equipmentWinGold + equipmentResourceRoundMaterials.
    summary:
      "Accessory · Grade II: recruiting or reinforcing one of your units costs 1 less gold."
  }),
  [EQUIPMENT_IDS.wardensAegis]: equip({
    id: EQUIPMENT_IDS.wardensAegis,
    slot: "armor",
    grade: "III",
    name: { en: "Warden's Aegis", vi: "Thuẫn Hộ Vệ" },
    package: "classic",
    // Seams: equipmentIncomingAttackPenalty + applyEquipmentStageCostumeDefenseToken.
    summary:
      "Armor · Grade III: the first incoming attack resolves at −1 Attack; its defender then gains a Defense token for the whole combat (main-hero fights; not retaliations)."
  }),

  // ==== Hidden Leaf Village bespoke "shinobi" register line (§3.13) =========
  // Hidden Leaf's own 3-item line (swarm/mobility/control), each a PURE reuse
  // of an already-wired equipment seam — the relic COMBINES two seams like
  // Sage Chakra Charm's spell-Power + hand-limit pair. Offered as hidden_leaf's
  // register line at BOTH outfitters (`equipmentPackagesForFaction`).
  // ---- Grade I (minor, 4g) ------------------------------------------------
  [EQUIPMENT_IDS.shinobiKunaiPouch]: equip({
    id: EQUIPMENT_IDS.shinobiKunaiPouch,
    slot: "weapon",
    grade: "I",
    name: { en: "Kunai Pouch", vi: "Túi Ám Khí" },
    package: "shinobi",
    // Seam: equipmentFirstAttackBonus (the Iron-Blood Sword fold).
    summary:
      "Weapon · Grade I: once per combat, one allied ranged unit ignores the adjacent-target ranged penalty."
  }),

  // ---- Grade II (major, 6g) -----------------------------------------------
  [EQUIPMENT_IDS.bodyFlickerTabi]: equip({
    id: EQUIPMENT_IDS.bodyFlickerTabi,
    slot: "mount",
    grade: "II",
    name: { en: "Body-Flicker Tabi", vi: "Hài Súc Địa" },
    package: "shinobi",
    // Seam: equipmentMovementBonus (the Windrider Saddle fold).
    summary:
      "Mount · Grade II: +1 movement point to your main hero at each turn refresh and −1 hand limit."
  }),

  // ---- Grade III (relic, 8g) — COMBINES two proven seams ------------------
  [EQUIPMENT_IDS.sageChakraCharm]: equip({
    id: EQUIPMENT_IDS.sageChakraCharm,
    slot: "accessory",
    grade: "III",
    name: { en: "Sage Chakra Charm", vi: "Linh Phù Tiên Nhân" },
    package: "shinobi",
    // Seams: equipmentSpellPowerBonus + equipmentHandLimitBonus (both accessory).
    summary:
      "Accessory · Grade III: +1 spell Power on your first Spell each combat AND +1 hand limit."
  }),

  // ==== Azur Lane Naval Base bespoke "kansen" register line (§3.13) =========
  // Azur Lane's own 6-item shipgirl line (2 per grade, all four slots), each a
  // PURE reuse of an already-wired equipment seam — the relics COMBINE two seams
  // like Sage Chakra Charm's spell-Power + hand-limit pair. Offered as azur_lane's
  // register line at BOTH outfitters (`equipmentPackagesForFaction`).
  // ---- Grade I (minor, 4g) ------------------------------------------------
  [EQUIPMENT_IDS.oxygenTorpedo]: equip({
    id: EQUIPMENT_IDS.oxygenTorpedo,
    slot: "weapon",
    grade: "I",
    name: { en: "Oxygen Torpedo", vi: "Ngư Lôi Dưỡng Khí" },
    package: "kansen",
    // Seam: equipmentFirstAttackBonus (the Iron-Blood Sword fold).
    summary:
      "Weapon · Grade I: in combat round 1, gain +1 Attack while attacking a unit that has already activated this round."
  }),

  // ---- Grade II (major, 6g) -----------------------------------------------
  [EQUIPMENT_IDS.repairToolkit]: equip({
    id: EQUIPMENT_IDS.repairToolkit,
    slot: "armor",
    grade: "II",
    name: { en: "Repair Toolkit", vi: "Bộ Dụng Cụ Sửa Chữa" },
    package: "kansen",
    // Seam: applyEquipmentStageCostumeDefenseToken (the Stage Costume / Ironbark
    // Cuirass first-incoming-hit Defense-token fold).
    summary:
      "Armor · Grade II: prevent the first point of damage your hero's army takes each combat."
  }),

  // ---- Grade III (relic, 8g) — COMBINES two proven seams ------------------
  [EQUIPMENT_IDS.sgRadar]: equip({
    id: EQUIPMENT_IDS.sgRadar,
    slot: "accessory",
    grade: "III",
    name: { en: "SG Radar", vi: "Ra-đa SG" },
    package: "kansen",
    // Seams: equipmentSpellPowerBonus + equipmentHandLimitBonus (both accessory).
    summary:
      "Accessory · Grade III: +1 spell Power on your first Spell each combat AND +1 hand limit."
  }),

  // ---- Grade I (minor, 4g) — accessory win-gold twin ----------------------
  [EQUIPMENT_IDS.manjuuPiggyBank]: equip({
    id: EQUIPMENT_IDS.manjuuPiggyBank,
    slot: "accessory",
    grade: "I",
    name: { en: "Manjuu Piggy Bank", vi: "Heo Đất Manjuu" },
    package: "kansen",
    // Seam: equipmentWinGold (the Lucky Coin fold).
    summary:
      "Accessory · Grade I: whenever one of your real army units is defeated, draw 1 card."
  }),

  // ---- Grade II (major, 6g) — mount movement twin -------------------------
  [EQUIPMENT_IDS.beaverSquadTag]: equip({
    id: EQUIPMENT_IDS.beaverSquadTag,
    slot: "mount",
    grade: "II",
    name: { en: "Beaver Squad Tag", vi: "Thẻ Đội Hải Ly" },
    package: "kansen",
    // Seam: equipmentMovementBonus (the Windrider Saddle fold).
    summary:
      "Mount · Grade II: +1 movement point to your main hero at each turn refresh and −1 hand limit."
  }),

  // ---- Grade III (relic, 8g) — weapon relic COMBINING two attack seams ----
  [EQUIPMENT_IDS.retrofitBlueprint]: equip({
    id: EQUIPMENT_IDS.retrofitBlueprint,
    slot: "weapon",
    grade: "III",
    name: { en: "Retrofit Blueprint", vi: "Bản Vẽ Cải Tạo" },
    package: "kansen",
    // Seams: equipmentFirstAttackBonus (Iron-Blood Sword) + equipmentRound1AttackBonus
    // (Blade of the Trial). Both weapon-slot folds, so the FIRST attack in round 1
    // stacks BOTH → +2; a same-slot weapon can never double either half.
    summary:
      "Weapon · Grade III: the first declared attack gets +1 Attack and all declared round-1 attacks get +1 Attack (not retaliations); one seeded-random allied army unit cannot retaliate during round 1."
  }),

  // ==== Heavenly Demon Palace bespoke "modao" register line (§3.13) =========
  // Heavenly Demon's own 3-item demonic-path line (one per grade, distinct slots
  // weapon / armor / accessory), each a PURE reuse of an already-wired equipment
  // seam — the relic COMBINES two seams like Sage Chakra Charm's spell-Power +
  // hand-limit pair. Offered as heavenly_demon's register line at BOTH outfitters
  // (`equipmentPackagesForFaction`).
  // ---- Grade I (minor, 4g) ------------------------------------------------
  [EQUIPMENT_IDS.demonBloodSaber]: equip({
    id: EQUIPMENT_IDS.demonBloodSaber,
    slot: "weapon",
    grade: "I",
    name: { en: "Blood Demon Saber", vi: "Huyết Ma Đao" },
    package: "modao",
    // Seam: equipmentFirstAttackBonus (the Iron-Blood Sword fold).
    summary:
      "Weapon · Grade I: once per combat, turn one −1 Attack-die result into +1."
  }),

  // ---- Grade II (major, 6g) -----------------------------------------------
  [EQUIPMENT_IDS.bonefiendPlate]: equip({
    id: EQUIPMENT_IDS.bonefiendPlate,
    slot: "armor",
    grade: "II",
    name: { en: "Bonefiend Plate", vi: "Cốt Ma Giáp" },
    package: "modao",
    // Seam: applyEquipmentStageCostumeDefenseToken (the Stage Costume / Ironbark
    // Cuirass / Repair Toolkit first-incoming-hit Defense-token fold).
    summary:
      "Armor · Grade II: allied ground units on your front line gain +1 Defense during combat round 1."
  }),

  // ---- Grade III (relic, 8g) — COMBINES two proven seams ------------------
  [EQUIPMENT_IDS.demonHeartRelic]: equip({
    id: EQUIPMENT_IDS.demonHeartRelic,
    slot: "accessory",
    grade: "III",
    name: { en: "Demon Heart", vi: "Ma Tâm" },
    package: "modao",
    // Seams: equipmentSpellPowerBonus + equipmentHandLimitBonus (both accessory).
    summary:
      "Accessory · Grade III: +1 spell Power on your first Spell each combat AND +1 hand limit."
  }),
  [EQUIPMENT_IDS.soulBanner]: equip({
    id: EQUIPMENT_IDS.soulBanner,
    slot: "accessory",
    grade: "III",
    name: { en: "Ten Thousand Souls Banner", vi: "Vạn Hồn Phiên" },
    package: "modao",
    intrinsic: true,
    summary:
      "Accessory · Grade III · intrinsic: Heavenly Demon Palace begins with this equipped. At each combat start, summon one temporary 2/0/2/8 flying Bound Soul for round 1; it ignores Retaliation Attacks."
  }),
  [EQUIPMENT_IDS.pathfindersBoots]: equip({
    id: EQUIPMENT_IDS.pathfindersBoots, slot: "mount", grade: "I",
    name: { en: "Pathfinder's Boots", vi: "Ủng Dẫn Lối" }, package: "shared",
    summary: "Mount · Grade I: once per game round, after ending your turn, you may move your main hero to an adjacent empty field."
  }),
  [EQUIPMENT_IDS.surveyorsLens]: equip({
    id: EQUIPMENT_IDS.surveyorsLens, slot: "accessory", grade: "I",
    name: { en: "Surveyor's Lens", vi: "Kính Trắc Địa" }, package: "shared",
    summary: "Accessory · Grade I: discovering an ordinary adjacent map tile costs no movement."
  }),
  [EQUIPMENT_IDS.hearthboundHorseshoe]: equip({
    id: EQUIPMENT_IDS.hearthboundHorseshoe, slot: "mount", grade: "I",
    name: { en: "Hearthbound Horseshoe", vi: "Móng Ngựa Hồi Hương" }, package: "shared",
    summary: "Mount · Grade I: +1 movement on a turn your main hero starts in your Town."
  }),
  [EQUIPMENT_IDS.spellwardBrooch]: equip({
    id: EQUIPMENT_IDS.spellwardBrooch, slot: "accessory", grade: "I",
    name: { en: "Spellward Brooch", vi: "Trâm Kháng Phép" }, package: "shared",
    summary: "Accessory · Grade I: the first enemy Spell each combat resolves at −1 Power against you."
  }),
  [EQUIPMENT_IDS.reactiveBuckler]: equip({
    id: EQUIPMENT_IDS.reactiveBuckler, slot: "armor", grade: "I",
    name: { en: "Reactive Buckler", vi: "Khiên Phản Ứng" }, package: "shared",
    summary: "Armor · Grade I: once per game round when your unit is attacked, give it +1 Defense for that attack."
  }),
  [EQUIPMENT_IDS.duelistInsignia]: equip({
    id: EQUIPMENT_IDS.duelistInsignia, slot: "accessory", grade: "II",
    name: { en: "Duelist Insignia", vi: "Huy Hiệu Đấu Sĩ" }, package: "shared",
    summary: "Accessory · Grade II: select one allied army unit in round 1; it gains +1 Attack for the whole combat."
  }),
  [EQUIPMENT_IDS.clockworkSpurs]: equip({
    id: EQUIPMENT_IDS.clockworkSpurs, slot: "mount", grade: "II",
    name: { en: "Clockwork Spurs", vi: "Đinh Thúc Cơ Khí" }, package: "shared",
    summary: "Mount · Grade II: select one allied army unit in round 1; it gains +2 Initiative for the whole combat."
  }),
  [EQUIPMENT_IDS.corrosionEdge]: equip({
    id: EQUIPMENT_IDS.corrosionEdge, slot: "weapon", grade: "II",
    name: { en: "Corrosion Edge", vi: "Lưỡi Kiếm Ăn Mòn" }, package: "shared",
    summary: "Weapon · Grade II: once per combat, one declared attack may place a Corrosion token on its surviving target."
  }),
  [EQUIPMENT_IDS.wyvernNeedle]: equip({
    id: EQUIPMENT_IDS.wyvernNeedle, slot: "weapon", grade: "II",
    name: { en: "Wyvern Needle", vi: "Kim Độc Wyvern" }, package: "shared",
    summary: "Weapon · Grade II: once per combat, one declared attack may place 1 poison cube on its surviving target."
  }),
  [EQUIPMENT_IDS.fieldMedicKit]: equip({
    id: EQUIPMENT_IDS.fieldMedicKit, slot: "armor", grade: "II",
    name: { en: "Field Medic Kit", vi: "Túi Quân Y" }, package: "shared",
    summary: "Armor · Grade II: once per combat, heal 1 damage on any allied unit as an instant reaction."
  }),
  [EQUIPMENT_IDS.foldedTacticsManual]: equip({
    id: EQUIPMENT_IDS.foldedTacticsManual, slot: "accessory", grade: "II",
    name: { en: "Folded Tactics Manual", vi: "Cẩm Nang Chiến Thuật Gấp" }, package: "shared",
    summary: "Accessory · Grade II: once per game round, when you resolve a card's draw rider, draw 1 extra card."
  }),
  [EQUIPMENT_IDS.guardianMirror]: equip({
    id: EQUIPMENT_IDS.guardianMirror, slot: "armor", grade: "III",
    name: { en: "Guardian Mirror", vi: "Gương Hộ Vệ" }, package: "shared",
    summary: "Armor · Grade III: once per combat, cancel all damage from one enemy attack; its defender cannot retaliate this round."
  }),
  [EQUIPMENT_IDS.chronicleSpurs]: equip({
    id: EQUIPMENT_IDS.chronicleSpurs, slot: "mount", grade: "III",
    name: { en: "Chronicle Spurs", vi: "Đinh Thúc Biên Niên" }, package: "shared",
    summary: "Mount · Grade III: once per game round after your main hero's turn ends, bank +1 movement for its next turn."
  }),
  [EQUIPMENT_IDS.littleBustersGlassMarbles]: equip({
    id: EQUIPMENT_IDS.littleBustersGlassMarbles, slot: "accessory", grade: "I",
    name: { en: "Haruka's Glass Marbles", vi: "Bi Thuy Tinh cua Haruka" }, package: "seishun",
    summary: "Accessory · Grade I: one Drill use per game round costs no gold or movement."
  }),
  [EQUIPMENT_IDS.littleBustersMissionLetter]: equip({
    id: EQUIPMENT_IDS.littleBustersMissionLetter, slot: "accessory", grade: "I",
    name: { en: "Lennon's Mission Letter", vi: "Thu Nhiem Vu cua Lennon" }, package: "seishun",
    summary: "Accessory · Grade I: +1 hand limit and −1 movement point at each turn refresh."
  }),
  [EQUIPMENT_IDS.littleBustersMiosParasol]: equip({
    id: EQUIPMENT_IDS.littleBustersMiosParasol, slot: "armor", grade: "II",
    name: { en: "Mio's Parasol", vi: "O cua Mio" }, package: "seishun",
    summary: "Armor · Grade II: whenever an allied unit defeats a real enemy unit, draw 1 card, maximum 2 per combat round."
  }),
  [EQUIPMENT_IDS.littleBustersFlightGoggles]: equip({
    id: EQUIPMENT_IDS.littleBustersFlightGoggles, slot: "accessory", grade: "II",
    name: { en: "Kud's Flight Goggles", vi: "Kinh Bay cua Kud" }, package: "seishun",
    summary: "Accessory · Grade II: +1 spell Power on your casts during combat round 1 only."
  }),
  [EQUIPMENT_IDS.littleBustersPracticeBat]: equip({
    id: EQUIPMENT_IDS.littleBustersPracticeBat, slot: "weapon", grade: "III",
    name: { en: "Little Busters Practice Bat", vi: "Gay Tap Little Busters" }, package: "seishun",
    summary: "Weapon · Grade III: the first declared attack each combat gets +1 Attack; during round 1, an Attack-die result of 0 paralyzes the target."
  }),
  [EQUIPMENT_IDS.mgqAngelHalo]: equip({
    id: EQUIPMENT_IDS.mgqAngelHalo,
    slot: "weapon",
    grade: "I",
    name: { en: "Angel Halo", vi: "Thien Than Quang Hoan" },
    package: "mgq",
    summary: "Weapon · Grade I: allied bronze units gain +2 Initiative."
  }),
  [EQUIPMENT_IDS.mgqHeavenlyKnightsAegis]: equip({
    id: EQUIPMENT_IDS.mgqHeavenlyKnightsAegis,
    slot: "armor",
    grade: "II",
    name: { en: "Heavenly Knight's Aegis", vi: "Thien Ky Si Thanh Khien" },
    package: "mgq",
    summary:
      "Armor · Grade II: once per game round, reroll any one die."
  }),
  [EQUIPMENT_IDS.mgqMonsterLordsRing]: equip({
    id: EQUIPMENT_IDS.mgqMonsterLordsRing,
    slot: "accessory",
    grade: "III",
    name: { en: "Monster Lord's Ring", vi: "Nhan Ma Vuong" },
    package: "mgq",
    summary: "Accessory · Grade III: +1 spell Power on your first Spell each combat and +1 hand limit."
  }),
  [EQUIPMENT_IDS.littleBustersRevolutionWatch]: equip({
    id: EQUIPMENT_IDS.littleBustersRevolutionWatch, slot: "accessory", grade: "III",
    name: { en: "School Revolution Watch", vi: "Dong Ho Cach Mang Hoc Duong" }, package: "seishun",
    summary: "Accessory · Grade III: +1 spell Power on your first Spell each combat and +1 hand limit."
  })
};

/**
 * Equipment items that ship WITHOUT card/hex art yet (drop-art-later contract,
 * mirroring ANIME_ARTIFACT_ART_PLACEHOLDERS). Each MUST be a real equipment id;
 * a placeholder that already has art on disk, or a nonexistent id, fails the
 * hygiene test. When real art lands: add `public/assets/anime/equipment/<slug>.webp`
 * and remove the id here (the UI then draws it instead of the glyph fallback).
 */
export const ANIME_EQUIPMENT_ART_PLACEHOLDERS: ReadonlySet<string> = new Set([
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
const SHARED_BOTH_SHOPS = [
  EQUIPMENT_IDS.supplySatchel,
  EQUIPMENT_IDS.luckyCoin,
  EQUIPMENT_IDS.eternalSash,
  EQUIPMENT_IDS.marshalsWarHorn,
  EQUIPMENT_IDS.veteransStandard,
  EQUIPMENT_IDS.windriderSaddle,
  EQUIPMENT_IDS.spiritCraneMount,
  EQUIPMENT_IDS.bladeOfTheTrial,
  EQUIPMENT_IDS.alchemistsSatchel,
  EQUIPMENT_IDS.pathfindersBoots,
  EQUIPMENT_IDS.surveyorsLens,
  EQUIPMENT_IDS.hearthboundHorseshoe,
  EQUIPMENT_IDS.spellwardBrooch,
  EQUIPMENT_IDS.reactiveBuckler,
  EQUIPMENT_IDS.duelistInsignia,
  EQUIPMENT_IDS.clockworkSpurs,
  EQUIPMENT_IDS.corrosionEdge,
  EQUIPMENT_IDS.wyvernNeedle,
  EQUIPMENT_IDS.fieldMedicKit,
  EQUIPMENT_IDS.foldedTacticsManual,
  EQUIPMENT_IDS.guardianMirror,
  EQUIPMENT_IDS.chronicleSpurs
] as const;

export const EQUIPMENT_SHOP_SALES: Record<string, readonly string[]> = {
  "anime.ren_binh_cac": [
    EQUIPMENT_IDS.ironBloodSword,
    EQUIPMENT_IDS.blackTortoiseMail,
    EQUIPMENT_IDS.cosmosPendant,
    ...SHARED_BOTH_SHOPS
  ],
  "anime.adventurer_outfitter": [
    EQUIPMENT_IDS.adventurersBlade,
    EQUIPMENT_IDS.guildIssueMail,
    EQUIPMENT_IDS.neonMicrophone,
    EQUIPMENT_IDS.stageCostume,
    EQUIPMENT_IDS.twinTailRibbon,
    EQUIPMENT_IDS.spiritFocus,
    ...SHARED_BOTH_SHOPS
  ]
};

/** The outfitter location ids (used by the shop-append seam gate). */
export const EQUIPMENT_SHOP_LOCATION_IDS: ReadonlySet<string> = new Set(Object.keys(EQUIPMENT_SHOP_SALES));

/**
 * REGISTER-AWARE SHOPS (§3.13): the equipment package LINE a visiting hero's
 * faction is ALSO offered at EITHER outfitter, on top of that shop's own
 * exclusives + shared gear (`EQUIPMENT_SHOP_SALES`). Keyed purely off the
 * faction's VISUAL REGISTER (`factionVisualRegister`, `src/data/faction-theme.ts`):
 *   - classic-chrome factions (Castle, Rampart, …) → the "classic" line,
 *   - a wuxia faction (azure_breeze)               → the "anime-xianxia" line,
 *   - an anime faction (fuyuki)                    → the "anime-isekai" line.
 * So a classic visitor sees the classic items at both shops; a wuxia visitor
 * sees the xianxia items (already the Blacksmith's exclusives) at BOTH shops;
 * an anime visitor sees the isekai items (the Outfitter's exclusives) at BOTH.
 *
 * FUTURE-TOWN RECIPE: a new town only needs a `factionVisualRegister` entry to
 * light up an existing register line at every outfitter — no shop edit. To give
 * it BESPOKE gear, add items in a new package and return that package here (and
 * teach `factionVisualRegister` the new register). No engine change is needed.
 *
 * Hidden Leaf Village, Azur Lane Naval Base and Heavenly Demon Palace are the
 * worked examples of the BESPOKE branch: Hidden Leaf / Azur Lane share the
 * "anime" visual register with Fuyuki, and Heavenly Demon shares the "wuxia"
 * visual register with Azure Breeze, so each is special-cased AHEAD of the
 * register switch to return its own line ("shinobi" / "kansen" / "modao") —
 * without this, each would fall through to its register's default line (the
 * anime register's isekai line, or the wuxia register's xianxia line) which the
 * sibling faction keeps.
 */
export function equipmentPackagesForFaction(factionId: string | undefined): EquipmentPackage[] {
  if (factionId === "hidden_leaf") {
    return ["shinobi"];
  }
  if (factionId === "azur_lane") {
    return ["kansen"];
  }
  if (factionId === "heavenly_demon") {
    return ["modao"];
  }
  if (factionId === "little_busters") {
    return ["seishun"];
  }
  if (factionId === "mgq") {
    return ["mgq"];
  }
  switch (factionVisualRegister(factionId)) {
    case "anime":
      return ["anime-isekai"];
    case "wuxia":
      return ["anime-xianxia"];
    default:
      return ["classic"];
  }
}

/** The item ids of a visiting faction's register line (register-aware shops). */
export function equipmentRegisterLineFor(factionId: string | undefined): string[] {
  const packages = new Set(equipmentPackagesForFaction(factionId));
  return listEquipmentDefinitions()
    .filter((def) => packages.has(def.package) && !def.intrinsic)
    .map((def) => def.id);
}

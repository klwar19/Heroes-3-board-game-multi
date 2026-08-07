import type { CardId, ResourceKind } from "@/engine/state";

/**
 * POLISH SET ARTIFACTS (optional house rule `polish-set-artifacts`, default OFF).
 *
 * Some Artifact cards belong to a SET. A player's piece count for a set is how
 * many DISTINCT member cards they still own anywhere in their card pool (deck,
 * hand, discard, and in-play permanents/ongoing cards — see
 * `artifactSetPieceCount`). At 2 pieces the set's FIRST listed effect switches
 * on; at 3 pieces the first AND second; and so on. Effects are cumulative and
 * simultaneous, never a choice.
 *
 * This module is DATA ONLY. Every tier below names exactly one engine effect
 * kind, and `src/engine/artifact-sets.ts` + its consumers are the only places
 * that run them. A tier whose effect kind the engine does not implement would be
 * a decorative stub — there are none: `artifact-sets.test.ts` drives every kind
 * in this file through a behaviour test.
 *
 * SOURCE: the mod author's "Cards - Balance changes.xlsx" sheet "NEW Art"
 * (column D = set membership; rows 94-145 = the per-piece-count effect lists).
 */

/** Every set's stable id. */
export type ArtifactSetId =
  | "angelic_alliance"
  | "power_of_the_dragon_father"
  | "titans_thunder"
  | "ironfist_of_the_ogre"
  | "armor_of_the_damned"
  | "pendant_of_reflection"
  | "wizards_well"
  | "diplomats_cloak"
  | "cornucopia"
  | "statue_of_legion"
  | "golden_goose";

/**
 * Who an activated tier aims at.
 *  - `selected-own` / `selected-enemy`: the unit picked by this set's OWN
 *    selection tier (`select-unit`). Unusable until that pick is made.
 *  - `own` / `enemy`: a free pick at use time (the set has no selection tier,
 *    or its printed text says "select" again — Ironfist's tier 3).
 *  - `none`: no unit target (economy / card tiers).
 */
export type ArtifactSetTargetKind = "selected-own" | "selected-enemy" | "own" | "enemy" | "none";

/** How often an activated tier may be used. */
export type ArtifactSetUseLimit =
  /** Passive/ongoing — no action, no charge. */
  | "passive"
  /** One use per combat, per set-tier. */
  | "combat"
  /** One use per GAME round, per set-tier. */
  | "game-round";

/**
 * The concrete engine effect a tier runs. Every kind here is wired; adding a new
 * kind means wiring it AND covering it, or the registry test fails.
 */
export type ArtifactSetTierEffect =
  /**
   * "At the beginning of the combat select 1 [of your / enemy] units. For this
   * combat it gains ±N initiative." Engine: `SELECT_ARTIFACT_SET_UNIT` stamps
   * the pick and creates a combat-duration INITIATIVE_BONUS active effect on it,
   * so the activation order really shifts.
   */
  | { kind: "select-unit"; side: "own" | "enemy"; initiative: number }
  /** "Rolls 2 dice and resolves the higher result" — ATTACK_ROLL_ADVANTAGE. */
  | { kind: "attack-roll-advantage" }
  /** "Rolls 2 dice and resolves the LOWER result" — ATTACK_ROLL_DISADVANTAGE. */
  | { kind: "attack-roll-disadvantage" }
  /** "Until its next activation the unit gains a Defense token." */
  | { kind: "defense-token" }
  /** "+N AT" (negative for the Armor of the Damned's enemy debuff). */
  | { kind: "attack-bonus"; amount: number }
  /** "+N Def". */
  | { kind: "defense-bonus"; amount: number }
  /** "When attacked by an adjacent unit, the attacker takes N DM" — FIRE_SHIELD. */
  | { kind: "fire-shield"; amount: number }
  /**
   * "Selected enemy unit suffers N DM from Spells." `maxGradeRank` is the tier
   * ceiling (0 = bronze, 1 = silver, …); `null` = any tier.
   */
  | { kind: "spell-zap"; damage: number; maxGradeRank: number | null }
  /** "All of your units suffer N less DM from Spells" (stacks across tiers). */
  | { kind: "spell-damage-reduction"; amount: number }
  /** "After your enemy casts a Spell, decrease its SP by N." */
  | { kind: "enemy-spell-power-drain"; amount: number }
  /** "Draw N cards from the M&M deck, then discard M." */
  | { kind: "draw-then-discard"; draw: number; discard: number }
  /** "Draw 1 Neutral Unit card; place it on the top or bottom of its deck." */
  | { kind: "neutral-scry" }
  /** "At the start of the [Resource / each] round: gain N <resource>." */
  | { kind: "income"; scope: "resource-round" | "every-round"; resource: ResourceKind; amount: number }
  /** "Reduce the Recruitment or Reinforcement cost of a unit by N gold." */
  | { kind: "recruit-discount"; gold: number };

export type ArtifactSetTier = {
  /** Piece count at which this tier switches on (2 for the first tier, then 3, 4, …). */
  threshold: number;
  /** The printed effect line, verbatim from the sheet. */
  text: string;
  target: ArtifactSetTargetKind;
  limit: ArtifactSetUseLimit;
  effect: ArtifactSetTierEffect;
};

export type ArtifactSetDefinition = {
  id: ArtifactSetId;
  name: string;
  /** The sheet's short code (AA, PofDF, TT, …) — handy for UI chips. */
  abbr: string;
  /** Member Artifact card ids, all resolving in `cardLibrary` to artifact cards. */
  members: readonly CardId[];
  /** Ordered effects; `tiers[i].threshold === i + 2` (contiguous from 2). */
  tiers: readonly ArtifactSetTier[];
};

/**
 * Spec members with NO card in this repository. EMPTY — every one of the 38
 * members named by the sheet resolves to a real Artifact card here (Titan's
 * Gladius and Ogre's Club of Havoc live in `sample.ts`, the rest in
 * `artifacts.ts`; both files feed `cardLibrary`).
 *
 * A future spec member without a card MUST be listed here rather than silently
 * dropped: a set's maximum reachable tier is capped by its in-game member count,
 * and a set left with fewer than 2 in-game members could never activate at all.
 * `artifact-sets.test.ts` pins that this registry stays hygienic (no id that
 * actually exists in the library, and every shipped set still reaching its top
 * tier).
 */
export const SET_ARTIFACT_MEMBERS_NOT_IN_GAME: readonly { setId: ArtifactSetId; name: string; reason: string }[] = [];

export const ARTIFACT_SETS: readonly ArtifactSetDefinition[] = [
  {
    id: "angelic_alliance",
    name: "Angelic Alliance",
    abbr: "AA",
    members: [
      "artifact.armor_of_wonder",
      "artifact.celestial_necklace_of_bliss",
      "artifact.sword_of_judgement",
      "artifact.lions_shield_of_courage",
      "artifact.sandals_of_the_saint",
      "artifact.helm_of_heavenly_enlightenment"
    ],
    tiers: [
      {
        threshold: 2,
        text: "At the beginning of the combat select 1 of your units. For this combat it gains +1 initiative.",
        target: "own",
        limit: "combat",
        effect: { kind: "select-unit", side: "own", initiative: 1 }
      },
      {
        threshold: 3,
        text: "Once per combat: your selected unit rolls 2 dice and resolves the higher result.",
        target: "selected-own",
        limit: "combat",
        effect: { kind: "attack-roll-advantage" }
      },
      {
        threshold: 4,
        text: "Once per combat: until its next activation your selected unit gains a Defense token.",
        target: "selected-own",
        limit: "combat",
        effect: { kind: "defense-token" }
      },
      {
        threshold: 5,
        text: "Once per combat: your selected unit gains +1 AT.",
        target: "selected-own",
        limit: "combat",
        effect: { kind: "attack-bonus", amount: 1 }
      },
      {
        threshold: 6,
        text: "Once per combat: your selected unit gains +1 Def.",
        target: "selected-own",
        limit: "combat",
        effect: { kind: "defense-bonus", amount: 1 }
      }
    ]
  },
  {
    id: "power_of_the_dragon_father",
    name: "Power of the Dragon Father",
    abbr: "PofDF",
    members: [
      "artifact.red_dragon_flame_tongue",
      "artifact.quiet_eye_of_the_dragon",
      "artifact.dragon_wing_tabard",
      "artifact.dragon_scale_shield",
      "artifact.necklace_of_dragonteeth",
      "artifact.dragon_scale_armor",
      "artifact.crown_of_dragontooth"
    ],
    tiers: [
      // PofDF prints NO selection tier of its own, so every "your selected unit"
      // clause here picks its target AT USE TIME (target: "own") — the reading
      // documented in CLAUDE.md. Angelic Alliance / Ironfist / Armor of the
      // Damned, which DO print a selection tier, instead bind to that pick.
      {
        threshold: 2,
        text: "Once per combat: your selected unit rolls 2 dice and resolves the higher result.",
        target: "own",
        limit: "combat",
        effect: { kind: "attack-roll-advantage" }
      },
      {
        threshold: 3,
        text: "Once per combat: until its next activation your selected unit gains a Defense token.",
        target: "own",
        limit: "combat",
        effect: { kind: "defense-token" }
      },
      {
        threshold: 4,
        text: "For this combat all of your units suffer 1 DM less from Spells.",
        target: "none",
        limit: "passive",
        effect: { kind: "spell-damage-reduction", amount: 1 }
      },
      {
        threshold: 5,
        text: "Once per combat: your selected unit gains +1 AT.",
        target: "own",
        limit: "combat",
        effect: { kind: "attack-bonus", amount: 1 }
      },
      {
        threshold: 6,
        text: "Once per combat: your selected unit gains +1 Def.",
        target: "own",
        limit: "combat",
        effect: { kind: "defense-bonus", amount: 1 }
      },
      {
        threshold: 7,
        text: "For this combat all of your units suffer 1 more DM less from Spells (2 in total).",
        target: "none",
        limit: "passive",
        effect: { kind: "spell-damage-reduction", amount: 1 }
      }
    ]
  },
  {
    id: "titans_thunder",
    name: "Titan's Thunder",
    abbr: "TT",
    members: [
      "artifact.titans_gladius",
      "artifact.sentinels_shield",
      "artifact.thunder_helmet",
      "artifact.titans_cuirass"
    ],
    tiers: [
      {
        threshold: 2,
        text: "Once per combat: a selected bronze-tier enemy unit suffers 1 DM from Spells.",
        target: "enemy",
        limit: "combat",
        effect: { kind: "spell-zap", damage: 1, maxGradeRank: 0 }
      },
      {
        threshold: 3,
        text: "Once per combat: a selected bronze- or silver-tier enemy unit suffers 1 DM from Spells.",
        target: "enemy",
        limit: "combat",
        effect: { kind: "spell-zap", damage: 1, maxGradeRank: 1 }
      },
      {
        threshold: 4,
        text: "Once per combat: a selected enemy unit of any tier suffers 1 DM from Spells.",
        target: "enemy",
        limit: "combat",
        effect: { kind: "spell-zap", damage: 1, maxGradeRank: null }
      }
    ]
  },
  {
    id: "ironfist_of_the_ogre",
    name: "Ironfist of the Ogre",
    abbr: "IotO",
    members: [
      "artifact.ogres_club_of_havoc",
      "artifact.targ_of_the_rampaging_ogre",
      "artifact.tunic_of_the_cyclops_king"
    ],
    tiers: [
      {
        threshold: 2,
        text: "At the start of the combat select 1 of your units. For this combat it gains +2 initiative.",
        target: "own",
        limit: "combat",
        effect: { kind: "select-unit", side: "own", initiative: 2 }
      },
      {
        // Printed text says "Select 1 of your units" again, so this tier picks
        // freely at use time rather than binding to the tier-2 selection.
        threshold: 3,
        text: "Once per combat, for this combat round: select 1 of your units — when it is attacked by an adjacent unit, the attacking unit takes 1 DM.",
        target: "own",
        limit: "combat",
        effect: { kind: "fire-shield", amount: 1 }
      }
    ]
  },
  {
    id: "armor_of_the_damned",
    name: "Armor of the Damned",
    abbr: "AotD",
    members: [
      "artifact.blackshard_of_the_dead_knight",
      "artifact.shield_of_the_yawning_dead",
      "artifact.rib_cage",
      "artifact.skull_helmet"
    ],
    tiers: [
      {
        threshold: 2,
        text: "At the start of the combat select 1 enemy unit. For this combat it suffers -1 initiative.",
        target: "enemy",
        limit: "combat",
        effect: { kind: "select-unit", side: "enemy", initiative: -1 }
      },
      {
        threshold: 3,
        text: "Once per combat: during an attack the selected enemy unit rolls 2 dice and resolves the lower result.",
        target: "selected-enemy",
        limit: "combat",
        effect: { kind: "attack-roll-disadvantage" }
      },
      {
        threshold: 4,
        text: "Once per combat: during an attack the selected enemy unit suffers -1 AT.",
        target: "selected-enemy",
        limit: "combat",
        effect: { kind: "attack-bonus", amount: -1 }
      }
    ]
  },
  {
    id: "pendant_of_reflection",
    name: "Pendant of Reflection",
    abbr: "PoR",
    members: ["artifact.surcoat_of_counterpoise", "artifact.boots_of_polarity"],
    tiers: [
      {
        // AUTO-applied to the first enemy cast each combat (the holder has no
        // meaningful decision — draining is never worse), the Magic-Mirror
        // "auto-USE" precedent. Documented in CLAUDE.md.
        threshold: 2,
        text: "Once per combat: after your enemy casts a Spell, decrease its SP by 1 (never below its weakest effect).",
        target: "none",
        limit: "combat",
        effect: { kind: "enemy-spell-power-drain", amount: 1 }
      }
    ]
  },
  {
    id: "wizards_well",
    name: "Wizard's Well",
    abbr: "WW",
    members: ["artifact.charm_of_mana", "artifact.mystic_orb_of_mana"],
    tiers: [
      {
        threshold: 2,
        text: "Once per round: draw 1 card from your M&M deck, then discard 1 card.",
        target: "none",
        limit: "game-round",
        effect: { kind: "draw-then-discard", draw: 1, discard: 1 }
      }
    ]
  },
  {
    id: "diplomats_cloak",
    name: "Diplomat's Cloak",
    abbr: "DC",
    members: ["artifact.diplomats_ring", "artifact.ambassadors_sash"],
    tiers: [
      {
        threshold: 2,
        text: "Once per turn: look at the top Neutral Unit card of a deck of your choice, then leave it on top or put it on the bottom.",
        target: "none",
        limit: "game-round",
        effect: { kind: "neutral-scry" }
      }
    ]
  },
  {
    id: "cornucopia",
    name: "Cornucopia",
    abbr: "Cor",
    members: [
      "artifact.eversmoking_ring_of_sulfur",
      "artifact.everpouring_vial_of_mercury",
      "artifact.everflowing_crystal_cloak"
    ],
    tiers: [
      {
        threshold: 2,
        text: "At the start of the Resource round: gain 2 building materials.",
        target: "none",
        limit: "passive",
        effect: { kind: "income", scope: "resource-round", resource: "buildingMaterials", amount: 2 }
      },
      {
        threshold: 3,
        text: "At the start of the Resource round: gain 1 valuable.",
        target: "none",
        limit: "passive",
        effect: { kind: "income", scope: "resource-round", resource: "valuables", amount: 1 }
      }
    ]
  },
  {
    id: "statue_of_legion",
    name: "Statue of Legion",
    abbr: "SoL",
    members: [
      "artifact.legs_of_legion",
      "artifact.loins_of_legion",
      "artifact.torso_of_legion",
      "artifact.arms_of_legion",
      "artifact.head_of_legion"
    ],
    tiers: [
      // Each active tier adds 1 gold to ONE once-per-round recruit/reinforce
      // discount (so 5 pieces = -4 gold once per round), summed in
      // `artifactSetRecruitGoldDiscount`.
      {
        threshold: 2,
        text: "Once per round: reduce the Recruitment or Reinforcement cost of a unit by 1 gold (min 0).",
        target: "none",
        limit: "game-round",
        effect: { kind: "recruit-discount", gold: 1 }
      },
      {
        threshold: 3,
        text: "The same discount is 1 gold larger.",
        target: "none",
        limit: "game-round",
        effect: { kind: "recruit-discount", gold: 1 }
      },
      {
        threshold: 4,
        text: "The same discount is 1 gold larger.",
        target: "none",
        limit: "game-round",
        effect: { kind: "recruit-discount", gold: 1 }
      },
      {
        threshold: 5,
        text: "The same discount is 1 gold larger.",
        target: "none",
        limit: "game-round",
        effect: { kind: "recruit-discount", gold: 1 }
      }
    ]
  },
  {
    id: "golden_goose",
    name: "Golden Goose",
    abbr: "GG",
    members: [
      "artifact.endless_purse_of_gold",
      "artifact.endless_bag_of_gold",
      "artifact.endless_sack_of_gold"
    ],
    tiers: [
      {
        threshold: 2,
        text: "At the start of each round: gain 2 gold.",
        target: "none",
        limit: "passive",
        effect: { kind: "income", scope: "every-round", resource: "gold", amount: 2 }
      },
      {
        threshold: 3,
        text: "At the start of each round: gain 2 more gold (4 in total).",
        target: "none",
        limit: "passive",
        effect: { kind: "income", scope: "every-round", resource: "gold", amount: 2 }
      }
    ]
  }
];

export const ARTIFACT_SET_BY_ID: Record<ArtifactSetId, ArtifactSetDefinition> = ARTIFACT_SETS.reduce(
  (map, set) => {
    map[set.id] = set;
    return map;
  },
  {} as Record<ArtifactSetId, ArtifactSetDefinition>
);

/** Member card id → its set id. No card belongs to two sets (pinned by test). */
export const ARTIFACT_SET_BY_MEMBER: Record<CardId, ArtifactSetId> = ARTIFACT_SETS.reduce(
  (map, set) => {
    for (const member of set.members) {
      map[member] = set.id;
    }
    return map;
  },
  {} as Record<CardId, ArtifactSetId>
);

/** Every card id that belongs to some set (for quick membership tests). */
export const ARTIFACT_SET_MEMBER_IDS: ReadonlySet<CardId> = new Set(Object.keys(ARTIFACT_SET_BY_MEMBER));

export function artifactSetDefinition(setId: string): ArtifactSetDefinition | undefined {
  return ARTIFACT_SET_BY_ID[setId as ArtifactSetId];
}

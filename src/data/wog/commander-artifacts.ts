/**
 * Wake of Gods COMMANDER ARTIFACTS (`wog.artifacts` + `wog.commanders`, Task 2).
 *
 * Commander artifacts (the original set plus the expanded Forge catalog) —
 * items worn by the commander, not the
 * hero — adapted to the board game as PERMANENT slot bindings. Each artifact
 * prints its slot ("weapon" | "armor" | "trinket")
 * and a grade (minor/major/relic); a card is acquired from the shared Artifact
 * decks like any other and then BOUND onto the player's commander
 * (BIND_COMMANDER_ARTIFACT). Binding is permanent — no unbind, no swap — and
 * survives the commander's death and revival. One artifact per slot. Binding
 * also grants one REGULAR (non-commander) Artifact of the same grade into hand.
 *
 * SINGLE SOURCE OF TRUTH: `COMMANDER_ARTIFACT_SPECS` (keyed by card id) carries
 * the slot AND the exact wired combat effect. The card definitions below are
 * GENERATED from it (so the card's BIND slot always matches the spec), and the
 * engine reads the SAME registry:
 *   - makeCommanderCombatUnit folds the flat stats (attack/defense/health/
 *     initiative) and appends the ability ids (Might die, line-attack);
 *   - commanderCastPower adds the cast-Power bonus (pendant);
 *   - finalizeCommandersAfterCombat honours the free-revive flag (helm).
 * Every field here is engine-consumed — no decorative data (CLAUDE.md §2).
 *
 * ADAPTATION / LIMITS (lead with these, CLAUDE.md §4):
 *   - WoG's per-victory INCREMENTAL bonuses are NOT modeled — each artifact grants
 *     a FIXED printed bonus.
 *   - Bow of Seeking and Slava's Ring of Power are NOT shipped (no clean engine
 *     arm for their WoG behaviours yet).
 *   - Binding is permanent by design; commander-scope rules (main-hero fights
 *     only) are unchanged.
 *
 * These join the shared Artifact deck(s) ONLY when ALL THREE of `wog.enabled`,
 * `wog.artifacts` and `wog.commanders` are on (dead cards without a commander) —
 * see `wogCommanderArtifact*Ids` consumed by `makeSharedDecks`. The definitions
 * live in the card library ALWAYS so lookups resolve.
 *
 * ART: every entry ships with a card face (`public/assets/wog/artifacts/<slug>.webp`)
 * and slot icons (`public/assets/wog/artifacts/icons/<slug>.webp`).
 * New grade-fill weapons (Iron Cudgel / Doomsday Blade) and the two Heavenly
 * Demon bespoke items (Blood Patriarch's Saber / Demon Heart Talisman) ship
 * dedicated illustrated faces and slot icons.
 */

import type { CardLibrary, CardDefinition, CommanderArtifactSlot } from "@/engine/state";
import { wogArtifactArtPath } from "./artifacts";

const wogCommanderArtifactSource = {
  product: "Heroes III: In the Wake of Gods (fan expansion) — board-game adaptation",
  credit:
    "Original board-game adaptation of the WoG COMMANDER artifacts (items worn by the commander). WoG's per-victory incremental bonuses are NOT modeled — each artifact grants the fixed printed bonus; the text describes exactly the engine-wired effect. Bow of Seeking and Slava's Ring of Power are not shipped.",
  url: "https://www.vault.acidcave.net/download.php?id=72"
} as const;

/** The wired per-artifact effect. All bonuses are folded/appended by the engine. */
export interface CommanderArtifactSpec {
  cardId: string;
  /** Art slug under public/assets/wog/artifacts. */
  slug: string;
  name: string;
  slot: CommanderArtifactSlot;
  tier: "minor" | "major" | "relic";
  /** Plain-words wired effect line (printed on the card AND the UI chip). */
  effectText: string;
  /** Flat stat bonuses folded into makeCommanderCombatUnit beside the grade values. */
  attack?: number;
  defense?: number;
  health?: number;
  initiative?: number;
  /**
   * Unit ability ids appended to the commander's combat unit (like the combos).
   * Sword → `commander-might-1` (rides the Damage-grade Might dice machinery);
   * Ring → `dragon-line-attack-3` (the Gold-Dragon / Factory-Mechanics line-attack arm).
   */
  abilityIds?: readonly string[];
  /** Command cast Power +N (pendant), added in commanderCastPower. */
  castPowerBonus?: number;
  /** Helm: a commander that dies in combat revives FREE at combat end. */
  reviveFree?: boolean;
  /** The commander's attacks roll two dice and keep the higher result. */
  attackRollAdvantage?: boolean;
  /** Floor applied to the commander's own Attack-die result. */
  /** Number of this artifact's added Might dice whose negative face is treated as 0. */
  nonNegativeMightDice?: number;
  /** Enemy attacks against the commander roll with disadvantage. */
  incomingAttackDisadvantage?: "round-1" | "combat";
  /** Lasting combat debuffs applied by the commander's own resolved attacks. */
  onAttackDefensePenalty?: number;
  onAttackAttackPenalty?: number;
  onAttackInitiativePenalty?: number;
  /** Heal the commander after its own attack deals damage. */
  healAfterDamagingAttack?: number;
  /** Ignore this much effective Defense on the commander's attacks. */
  defensePierce?: number;
  /** Once per combat, lethal damage leaves the commander at 1 Health. */
  combatRebirth?: boolean;
  /** Heal after the commander performs the named action. */
  healAfterMove?: number;
  healAfterDefend?: number;
  /** After an own attack, deal this effect damage to an enemy adjacent to the target. */
  cleaveDamage?: number;
  /** After taking attack damage, return this fixed amount of damage to the attacker. */
  reflectDamage?: number;
  /** At activation start, deal this damage to every adjacent unit. */
  activationAdjacentDamage?: number;
  /** Map reward paid after every combat won by this commander's main hero. */
  goldAfterWonCombat?: number;
}

export const COMMANDER_ARTIFACT_SPECS: Record<string, CommanderArtifactSpec> = {
  // ---- Weapon (all 3 grades) ---------------------------------------------
  "wog.artifact.iron_cudgel": {
    cardId: "wog.artifact.iron_cudgel",
    slug: "iron_cudgel",
    name: "Iron Cudgel",
    slot: "weapon",
    tier: "minor",
    effectText: "+1 Attack.",
    attack: 1
  },
  "wog.artifact.axe_of_smashing": {
    cardId: "wog.artifact.axe_of_smashing",
    slug: "axe_of_smashing",
    name: "Axe of Smashing",
    slot: "weapon",
    tier: "major",
    effectText: "+2 Attack.",
    attack: 2
  },
  "wog.artifact.sword_of_sharpness": {
    cardId: "wog.artifact.sword_of_sharpness",
    slug: "sword_of_sharpness_v2",
    name: "Sword of Sharpness",
    slot: "weapon",
    tier: "minor",
    effectText: "adds one Might die to every attack; its extra die can never resolve below 0.",
    abilityIds: ["commander-might-1"],
    nonNegativeMightDice: 1
  },
  "wog.artifact.doomsday_blade": {
    cardId: "wog.artifact.doomsday_blade",
    slug: "doomsday_blade_v2",
    name: "Doomsday Blade",
    slot: "weapon",
    tier: "relic",
    effectText: "+2 Attack and the commander's attacks roll with advantage.",
    attack: 2,
    attackRollAdvantage: true
  },
  // Heavenly Demon Palace bespoke weapon — a flat-Attack fold (the Iron Cudgel /
  // Axe / Doomsday Blade family), demonic-flavoured. No new engine arm.
  "wog.artifact.blood_patriarch_saber": {
    cardId: "wog.artifact.blood_patriarch_saber",
    slug: "blood_patriarch_saber_v2",
    name: "Blood Patriarch's Saber",
    slot: "weapon",
    tier: "major",
    effectText: "+1 Attack and the commander's attacks roll with advantage.",
    attack: 1,
    attackRollAdvantage: true
  },
  // ---- Armor -------------------------------------------------------------
  "wog.artifact.hardened_shield": {
    cardId: "wog.artifact.hardened_shield",
    slug: "hardened_shield_v2",
    name: "Hardened Shield",
    slot: "armor",
    tier: "relic",
    effectText: "+1 Defense.",
    defense: 1
  },
  "wog.artifact.mithril_mail": {
    cardId: "wog.artifact.mithril_mail",
    slug: "mithril_mail",
    name: "Mithril Mail",
    slot: "armor",
    tier: "major",
    effectText: "+2 Health.",
    health: 2
  },
  "wog.artifact.helm_of_immortality": {
    cardId: "wog.artifact.helm_of_immortality",
    slug: "helm_of_immortality",
    name: "Helm of Immortality",
    slot: "armor",
    tier: "relic",
    effectText: "if the commander dies in combat it revives FREE at combat end (death never persists, no gold).",
    reviveFree: true
  },
  // ---- Trinket -----------------------------------------------------------
  "wog.artifact.boots_of_haste": {
    cardId: "wog.artifact.boots_of_haste",
    slug: "boots_of_haste_v2",
    name: "Boots of Haste",
    slot: "trinket",
    tier: "minor",
    effectText: "+2 Initiative.",
    initiative: 2
  },
  "wog.artifact.pendant_of_sorcery": {
    cardId: "wog.artifact.pendant_of_sorcery",
    slug: "pendant_of_sorcery",
    name: "Pendant of Sorcery",
    slot: "trinket",
    tier: "major",
    effectText: "command cast Power +1.",
    castPowerBonus: 1
  },
  "wog.artifact.dragon_eye_ring": {
    cardId: "wog.artifact.dragon_eye_ring",
    slug: "dragon_eye_ring",
    name: "Dragon Eye Ring",
    slot: "trinket",
    tier: "major",
    // Reuses the Gold-Dragon / Factory-Mechanics SECOND_ATTACK_BEHIND_TARGET arm
    // (`dragon-line-attack-3`): after the commander's attack a full separate
    // attack at attack 3 strikes the unit directly behind the target.
    effectText: "the commander's attacks also strike the space directly behind the target (a separate attack 3 hit that never provokes retaliation).",
    abilityIds: ["dragon-line-attack-3"]
  },
  // Heavenly Demon Palace bespoke trinket — a relic COMBINING two flat folds the
  // engine already sums in `aggregateCommanderArtifactBonuses`: the Pendant of
  // Sorcery cast-Power fold + the Boots of Haste Initiative fold. No new engine arm.
  "wog.artifact.demon_heart_talisman": {
    cardId: "wog.artifact.demon_heart_talisman",
    slug: "demon_heart_talisman",
    name: "Demon Heart Talisman",
    slot: "trinket",
    tier: "relic",
    effectText: "command cast Power +1 AND +1 Initiative.",
    castPowerBonus: 1,
    initiative: 1
  },
  // ---- Expanded commander forge catalog ---------------------------------
  "wog.artifact.vitality_ring": {
    cardId: "wog.artifact.vitality_ring",
    slug: "vitality_ring",
    name: "Vitality Ring",
    slot: "trinket",
    tier: "minor",
    effectText: "+1 Health.",
    health: 1
  },
  "wog.artifact.duelist_guard": {
    cardId: "wog.artifact.duelist_guard",
    slug: "duelist_guard",
    name: "Duelist Guard",
    slot: "armor",
    tier: "minor",
    effectText: "enemy attacks against the commander roll with disadvantage during combat round 1.",
    incomingAttackDisadvantage: "round-1"
  },
  "wog.artifact.victors_coin": {
    cardId: "wog.artifact.victors_coin",
    slug: "victors_coin",
    name: "Victor's Coin",
    slot: "trinket",
    tier: "minor",
    effectText: "+1 gold after every combat won by this commander's main hero.",
    goldAfterWonCombat: 1
  },
  "wog.artifact.veil_of_dread": {
    cardId: "wog.artifact.veil_of_dread",
    slug: "veil_of_dread",
    name: "Veil of Dread",
    slot: "armor",
    tier: "major",
    effectText: "enemy attacks against the commander roll with disadvantage for the whole combat.",
    incomingAttackDisadvantage: "combat"
  },
  "wog.artifact.corrosive_edge": {
    cardId: "wog.artifact.corrosive_edge",
    slug: "corrosive_edge",
    name: "Corrosive Edge",
    slot: "weapon",
    tier: "major",
    effectText: "after the commander's own attack, the target gets −1 Defense for the whole combat (minimum 0).",
    onAttackDefensePenalty: 1
  },
  "wog.artifact.enfeebling_mace": {
    cardId: "wog.artifact.enfeebling_mace",
    slug: "enfeebling_mace",
    name: "Enfeebling Mace",
    slot: "weapon",
    tier: "major",
    effectText: "after the commander's own attack, the target gets −1 Attack for the whole combat.",
    onAttackAttackPenalty: 1
  },
  "wog.artifact.chrono_pike": {
    cardId: "wog.artifact.chrono_pike",
    slug: "chrono_pike",
    name: "Chrono Pike",
    slot: "weapon",
    tier: "major",
    effectText: "after the commander's own attack, the target gets −3 Initiative for the whole combat.",
    onAttackInitiativePenalty: 3
  },
  "wog.artifact.vampiric_fang": {
    cardId: "wog.artifact.vampiric_fang",
    slug: "vampiric_fang",
    name: "Vampiric Fang",
    slot: "weapon",
    tier: "major",
    effectText: "after the commander's own attack deals damage, heal 1 damage from the commander.",
    healAfterDamagingAttack: 1
  },
  "wog.artifact.piercing_lance": {
    cardId: "wog.artifact.piercing_lance",
    slug: "piercing_lance",
    name: "Piercing Lance",
    slot: "weapon",
    tier: "major",
    effectText: "the commander's attacks ignore 1 Defense (stacks with other Defense reduction).",
    defensePierce: 1
  },
  "wog.artifact.barbed_carapace": {
    cardId: "wog.artifact.barbed_carapace",
    slug: "barbed_carapace",
    name: "Barbed Carapace",
    slot: "armor",
    tier: "major",
    effectText: "Thorn Aura: after an attack damages the commander, return 2 damage to the attacker.",
    reflectDamage: 2
  },
  "wog.artifact.plague_censer": {
    cardId: "wog.artifact.plague_censer",
    slug: "plague_censer",
    name: "Plague Censer",
    slot: "trinket",
    tier: "major",
    effectText: "when the commander activates, deal 1 damage to every adjacent unit.",
    activationAdjacentDamage: 1
  },
  "wog.artifact.phoenix_plate": {
    cardId: "wog.artifact.phoenix_plate",
    slug: "phoenix_plate",
    name: "Phoenix Plate",
    slot: "armor",
    tier: "relic",
    effectText: "once per combat, when the commander reaches 0 Health, it revives immediately at 1 Health.",
    combatRebirth: true
  },
  "wog.artifact.travelers_salve": {
    cardId: "wog.artifact.travelers_salve",
    slug: "travelers_salve",
    name: "Traveler's Salve",
    slot: "trinket",
    tier: "relic",
    effectText: "+2 Initiative and after the commander moves, heal 1 damage from it.",
    initiative: 2,
    healAfterMove: 1
  },
  "wog.artifact.bastion_heart": {
    cardId: "wog.artifact.bastion_heart",
    slug: "bastion_heart",
    name: "Bastion Heart",
    slot: "armor",
    tier: "relic",
    effectText: "after the commander Defends, heal 2 damage from it.",
    healAfterDefend: 2
  },
  "wog.artifact.stormcleaver": {
    cardId: "wog.artifact.stormcleaver",
    slug: "stormcleaver",
    name: "Stormcleaver",
    slot: "weapon",
    tier: "relic",
    effectText: "+1 Attack and after the commander's own attack, deal 1 damage to one enemy adjacent to the target.",
    attack: 1,
    cleaveDamage: 1
  }
};

export const COMMANDER_ARTIFACT_SPEC_LIST: readonly CommanderArtifactSpec[] =
  Object.values(COMMANDER_ARTIFACT_SPECS);

const slotLabel: Record<CommanderArtifactSlot, string> = {
  weapon: "weapon",
  armor: "armor",
  trinket: "trinket"
};

/** Generate the card definition for one spec (single-source with the registry). */
function buildCommanderArtifactCard(spec: CommanderArtifactSpec): CardDefinition {
  return {
    id: spec.cardId,
    name: spec.name,
    kind: "artifact",
    timing: "instant",
    artifactTier: spec.tier,
    tags: [
      "artifact",
      spec.tier,
      "wog",
      `Commander artifact — ${slotLabel[spec.slot]} · ${spec.tier}. Bind permanently to your commander: ${spec.effectText} Binding removes this card from the game and grants you 1 regular (non-commander) Artifact of the same grade (${spec.tier}).`
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: `Bind to your commander — ${slotLabel[spec.slot]} slot (remove this card; gain 1 ${spec.tier} Artifact)`,
          mapOnly: true,
          cost: { removeSelf: true },
          effect: { type: "BIND_COMMANDER_ARTIFACT", slot: spec.slot }
        }
      ]
    },
    assets: {
      cardImage: wogArtifactArtPath(spec.slug),
      imageAlt: `${spec.name} commander artifact card`
    },
    implementationStatus: "implemented",
    source: wogCommanderArtifactSource
  };
}

export const wogCommanderArtifactCards: CardLibrary = Object.fromEntries(
  COMMANDER_ARTIFACT_SPEC_LIST.map((spec) => [spec.cardId, buildCommanderArtifactCard(spec)])
);

// ---------------------------------------------------------------------------
// Aggregation — the single reader for a commander's bound artifacts. Engine
// helpers (makeCommanderCombatUnit / commanderCastPower / the helm check) call
// this so the wired behaviour is derived in ONE place.
// ---------------------------------------------------------------------------

export interface CommanderArtifactBonuses {
  attack: number;
  defense: number;
  health: number;
  initiative: number;
  abilityIds: string[];
  castPowerBonus: number;
  reviveFree: boolean;
  attackRollAdvantage: boolean;
  nonNegativeMightDice: number;
  incomingAttackDisadvantage: "round-1" | "combat" | null;
  onAttackDefensePenalty: number;
  onAttackAttackPenalty: number;
  onAttackInitiativePenalty: number;
  healAfterDamagingAttack: number;
  defensePierce: number;
  combatRebirth: boolean;
  healAfterMove: number;
  healAfterDefend: number;
  cleaveDamage: number;
  reflectDamage: number;
  activationAdjacentDamage: number;
  goldAfterWonCombat: number;
}

/** Sum the wired bonuses of every artifact bound onto a commander. */
export function aggregateCommanderArtifactBonuses(
  artifacts: Partial<Record<CommanderArtifactSlot, string>> | undefined
): CommanderArtifactBonuses {
  const totals: CommanderArtifactBonuses = {
    attack: 0,
    defense: 0,
    health: 0,
    initiative: 0,
    abilityIds: [],
    castPowerBonus: 0,
    reviveFree: false,
    attackRollAdvantage: false,
    nonNegativeMightDice: 0,
    incomingAttackDisadvantage: null,
    onAttackDefensePenalty: 0,
    onAttackAttackPenalty: 0,
    onAttackInitiativePenalty: 0,
    healAfterDamagingAttack: 0,
    defensePierce: 0,
    combatRebirth: false,
    healAfterMove: 0,
    healAfterDefend: 0,
    cleaveDamage: 0,
    reflectDamage: 0,
    activationAdjacentDamage: 0,
    goldAfterWonCombat: 0
  };
  if (!artifacts) {
    return totals;
  }
  for (const cardId of Object.values(artifacts)) {
    if (!cardId) {
      continue;
    }
    const spec = COMMANDER_ARTIFACT_SPECS[cardId];
    if (!spec) {
      continue;
    }
    totals.attack += spec.attack ?? 0;
    totals.defense += spec.defense ?? 0;
    totals.health += spec.health ?? 0;
    totals.initiative += spec.initiative ?? 0;
    totals.castPowerBonus += spec.castPowerBonus ?? 0;
    if (spec.reviveFree) {
      totals.reviveFree = true;
    }
    totals.attackRollAdvantage ||= Boolean(spec.attackRollAdvantage);
    totals.nonNegativeMightDice += spec.nonNegativeMightDice ?? 0;
    if (spec.incomingAttackDisadvantage === "combat") totals.incomingAttackDisadvantage = "combat";
    else if (spec.incomingAttackDisadvantage === "round-1" && !totals.incomingAttackDisadvantage) {
      totals.incomingAttackDisadvantage = "round-1";
    }
    totals.onAttackDefensePenalty += spec.onAttackDefensePenalty ?? 0;
    totals.onAttackAttackPenalty += spec.onAttackAttackPenalty ?? 0;
    totals.onAttackInitiativePenalty += spec.onAttackInitiativePenalty ?? 0;
    totals.healAfterDamagingAttack += spec.healAfterDamagingAttack ?? 0;
    totals.defensePierce += spec.defensePierce ?? 0;
    totals.combatRebirth ||= Boolean(spec.combatRebirth);
    totals.healAfterMove += spec.healAfterMove ?? 0;
    totals.healAfterDefend += spec.healAfterDefend ?? 0;
    totals.cleaveDamage += spec.cleaveDamage ?? 0;
    totals.reflectDamage += spec.reflectDamage ?? 0;
    totals.activationAdjacentDamage += spec.activationAdjacentDamage ?? 0;
    totals.goldAfterWonCombat += spec.goldAfterWonCombat ?? 0;
    if (spec.abilityIds) {
      totals.abilityIds.push(...spec.abilityIds);
    }
  }
  return totals;
}

// ---------------------------------------------------------------------------
// Deck-join id lists by tier. `makeSharedDecks` appends these to the matching
// shared Artifact deck ONLY when `wog.enabled && wog.artifacts && wog.commanders`
// (mirroring the Task-1 join); the split-deck variants use the per-tier lists and
// the legacy single deck uses the combined list. Any OFF ⇒ byte-identical decks.
// ---------------------------------------------------------------------------

function idsForTier(tier: CommanderArtifactSpec["tier"]): string[] {
  return COMMANDER_ARTIFACT_SPEC_LIST.filter((spec) => spec.tier === tier).map((spec) => spec.cardId);
}

export const wogCommanderArtifactMinorIds: readonly string[] = idsForTier("minor");
export const wogCommanderArtifactMajorIds: readonly string[] = idsForTier("major");
export const wogCommanderArtifactRelicIds: readonly string[] = idsForTier("relic");

/** Every commander-artifact id, in tier order (legacy single-deck join). */
export const wogCommanderArtifactCardIds: readonly string[] = [
  ...wogCommanderArtifactMinorIds,
  ...wogCommanderArtifactMajorIds,
  ...wogCommanderArtifactRelicIds
];

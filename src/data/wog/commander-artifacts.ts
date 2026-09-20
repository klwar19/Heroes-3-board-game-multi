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
  /** Extra combat spaces for the equipped commander. */
  moveRangeBonus?: number;
  /** Additional live Attack in odd-numbered combat rounds. */
  oddRoundAttack?: number;
  /** Adjustment to the printed Attack in combat rounds after the first. */
  laterRoundAttack?: number;
  /** Extra Attack on retaliation only. */
  retaliationAttack?: number;
  /** Extra Attack when the target has at most this effective Defense. */
  lowDefenseAttack?: number;
  lowDefenseThreshold?: number;
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
  incomingAttackDisadvantage?: "round-1" | "odd-rounds" | "combat";
  /** Lasting combat debuffs applied by the commander's own resolved attacks. */
  onAttackDefensePenalty?: number;
  onAttackAttackPenalty?: number;
  onAttackInitiativePenalty?: number;
  onAttackMovePenalty?: number;
  /** Heal the commander after an attack or retaliation deals damage. */
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
  /** Draw cards whenever this commander's attack defeats a side or Stack layer. */
  drawAfterDefeatingLayer?: number;
  /** Gain building materials whenever this commander's attack defeats a side or Stack layer. */
  materialsAfterDefeatingLayer?: number;
  /** Heal the commander after an attack against it finishes resolving. */
  healAfterAttacked?: number;
  /** Shift up to this much incoming attack damage to the end of the current round, once per round. */
  delayedAttackDamagePerRound?: number;
  /** Gold paid at the start of every combat round while the commander is present. */
  goldPerCombatRound?: number;
  /** Discard this many random cards from the opposing player's hand at combat start. */
  enemyDiscardAtCombatStart?: number;
  /** At combat start choose one enemy whose attacks have disadvantage for the combat. */
  markEnemyAttackDisadvantage?: boolean;
  /** A free chosen-ally heal that refreshes every combat round. */
  healAllyPerCombatRound?: number;
  /** Combat-start artifact packages. */
  summonWeakSpiritAtCombatStart?: boolean;
  optionalFirePulseAtCombatStart?: number;
  forceFieldAtCombatStartRounds?: number;
  /** Commander-specific attack/defense reactions. */
  firstOwnAttackBonus?: number;
  rangedAttackerDamage?: number;
  firstIncomingAttackReduction?: number;
  activationPushAdjacentDamage?: number;
  /** Map reward paid after every combat won by this commander's main hero. */
  goldAfterWonCombat?: number;
  goldAfterCommanderLevel?: number;
}

export const COMMANDER_ARTIFACT_SPECS: Record<string, CommanderArtifactSpec> = {
  // ---- Weapon (all 3 grades) ---------------------------------------------
  "wog.artifact.iron_cudgel": {
    cardId: "wog.artifact.iron_cudgel",
    slug: "iron_cudgel",
    name: "Iron Cudgel",
    slot: "weapon",
    tier: "minor",
    effectText: "+1 Attack during odd-numbered combat rounds.",
    oddRoundAttack: 1
  },
  "wog.artifact.axe_of_smashing": {
    cardId: "wog.artifact.axe_of_smashing",
    slug: "axe_of_smashing",
    name: "Axe of Smashing",
    slot: "weapon",
    tier: "major",
    effectText: "+2 Attack in round 1; +1 Attack from round 2 onward.",
    attack: 2,
    laterRoundAttack: -1
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
    effectText: "+2 Attack in round 1, +1 from round 2 onward, and +1 more when retaliating. Commander attacks roll with advantage.",
    attack: 2,
    laterRoundAttack: -1,
    retaliationAttack: 1,
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
    effectText: "+2 Health. If killed in combat, revive free at combat end.",
    health: 2,
    reviveFree: true
  },
  // ---- Trinket -----------------------------------------------------------
  "wog.artifact.boots_of_haste": {
    cardId: "wog.artifact.boots_of_haste",
    slug: "boots_of_haste_v2",
    name: "Boots of Haste",
    slot: "trinket",
    tier: "minor",
    effectText: "+3 Initiative and move 1 more space.",
    initiative: 3,
    moveRangeBonus: 1
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
    // Reuses the Gold-Dragon / Factory-Mechanics SECOND_ATTACK_BEHIND_TARGET arm:
    // after the commander's attack a full separate Attack 4 strikes the unit
    // directly behind the target.
    effectText: "attacks also strike the space directly behind the target (a separate Attack 4 hit with no retaliation).",
    abilityIds: ["dragon-line-attack-4"]
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
    effectText: "enemy attacks against the commander roll with disadvantage during odd-numbered combat rounds.",
    incomingAttackDisadvantage: "odd-rounds"
  },
  "wog.artifact.victors_coin": {
    cardId: "wog.artifact.victors_coin",
    slug: "victors_coin",
    name: "Victor's Coin",
    slot: "trinket",
    tier: "minor",
    effectText: "+1 gold after every combat won by the commander's main hero and +1 gold each time the commander levels up.",
    goldAfterWonCombat: 1,
    goldAfterCommanderLevel: 1
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
    effectText: "own attacks give the target −3 Initiative for the combat and −1 movement space.",
    onAttackInitiativePenalty: 3,
    onAttackMovePenalty: 1
  },
  "wog.artifact.vampiric_fang": {
    cardId: "wog.artifact.vampiric_fang",
    slug: "vampiric_fang",
    name: "Vampiric Fang",
    slot: "weapon",
    tier: "major",
    effectText: "heal 2 after an attack or retaliation attack deals damage.",
    healAfterDamagingAttack: 2
  },
  "wog.artifact.piercing_lance": {
    cardId: "wog.artifact.piercing_lance",
    slug: "piercing_lance",
    name: "Piercing Lance",
    slot: "weapon",
    tier: "major",
    effectText: "attacks ignore 1 Defense; gain +1 Attack when the enemy has 1 or less Defense.",
    defensePierce: 1,
    lowDefenseAttack: 1,
    lowDefenseThreshold: 1
  },
  "wog.artifact.barbed_carapace": {
    cardId: "wog.artifact.barbed_carapace",
    slug: "barbed_carapace",
    name: "Barbed Carapace",
    slot: "armor",
    tier: "major",
    effectText: "Thorn Aura: after an attack damages the commander, return 2 damage to the attacker (never more than the damage taken).",
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
    effectText: "+5 Initiative, move 1 more space, and heal 1 after moving.",
    initiative: 5,
    moveRangeBonus: 1,
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
    effectText: "+1 Attack and after attacking, deal 2 damage to an enemy adjacent to the target.",
    attack: 1,
    cleaveDamage: 2
  },
  "wog.artifact.executioners_edge": {
    cardId: "wog.artifact.executioners_edge",
    slug: "executioners_edge",
    name: "Blood-Comet Seal",
    slot: "weapon",
    tier: "relic",
    effectText: "+1 Attack. At activation, choose any enemy unit and deal 1 damage to it; the commander may then act normally.",
    attack: 1,
    abilityIds: ["commander-artifact-executioners-edge"]
  },
  "wog.artifact.lanternroot_crook": {
    cardId: "wog.artifact.lanternroot_crook",
    slug: "lanternroot_crook",
    name: "Lanternroot Crook",
    slot: "weapon",
    tier: "minor",
    effectText: "at combat start, summon a weak Starwind spirit on any empty space; it vanishes after combat round 1.",
    summonWeakSpiritAtCombatStart: true
  },
  "wog.artifact.widows_courtesy": {
    cardId: "wog.artifact.widows_courtesy",
    slug: "widows_courtesy",
    name: "Widow's Courtesy",
    slot: "weapon",
    tier: "minor",
    effectText: "the commander's first own attack each combat gains +1 Attack; after a ranged enemy attacks the commander, that enemy suffers 1 damage.",
    firstOwnAttackBonus: 1,
    rangedAttackerDamage: 1
  },
  "wog.artifact.counterfeit_cataclysm": {
    cardId: "wog.artifact.counterfeit_cataclysm",
    slug: "counterfeit_cataclysm",
    name: "Counterfeit Cataclysm",
    slot: "weapon",
    tier: "relic",
    effectText: "+1 Attack. At combat start, you may deal 1 Fire Spell damage to every unit; Fire resistance and immunity apply.",
    attack: 1,
    optionalFirePulseAtCombatStart: 1
  },
  "wog.artifact.regenerators_mail": {
    cardId: "wog.artifact.regenerators_mail",
    slug: "regenerators_mail",
    name: "Second-Breath Chrysalis",
    slot: "armor",
    tier: "minor",
    effectText: "after the commander is attacked, heal 1 damage from it if it survived.",
    healAfterAttacked: 1
  },
  "wog.artifact.aegis_of_warding": {
    cardId: "wog.artifact.aegis_of_warding",
    slug: "aegis_of_warding",
    name: "The Quiet Orbit",
    slot: "armor",
    tier: "major",
    effectText: "the commander and every surrounding unit suffer 1 less damage from Spells and Hero Specialties.",
    abilityIds: ["commander-artifact-warding-aura"]
  },
  "wog.artifact.temporal_cuirass": {
    cardId: "wog.artifact.temporal_cuirass",
    slug: "temporal_cuirass",
    name: "Tomorrow's Grip",
    slot: "armor",
    tier: "major",
    effectText: "once per combat round, shift up to 4 incoming attack damage to the end of that round.",
    delayedAttackDamagePerRound: 4
  },
  "wog.artifact.hunters_quill": {
    cardId: "wog.artifact.hunters_quill",
    slug: "hunters_quill",
    name: "Hunter's Quill",
    slot: "trinket",
    tier: "minor",
    effectText: "draw 1 card whenever the commander defeats an enemy side or Stack layer (including Pack to Few).",
    drawAfterDefeatingLayer: 1
  },
  "wog.artifact.masons_token": {
    cardId: "wog.artifact.masons_token",
    slug: "masons_token",
    name: "Mason's Token",
    slot: "trinket",
    tier: "minor",
    effectText: "gain 1 building material whenever the commander defeats an enemy side or Stack layer (including Pack to Few).",
    materialsAfterDefeatingLayer: 1
  },
  "wog.artifact.mercenarys_hourglass": {
    cardId: "wog.artifact.mercenarys_hourglass",
    slug: "mercenarys_hourglass",
    name: "Mercenary's Hourglass",
    slot: "trinket",
    tier: "major",
    effectText: "gain 1 gold at the start of every combat round.",
    goldPerCombatRound: 1
  },
  "wog.artifact.eye_of_misfortune": {
    cardId: "wog.artifact.eye_of_misfortune",
    slug: "eye_of_misfortune",
    name: "Eye of Misfortune",
    slot: "trinket",
    tier: "relic",
    effectText: "at combat start, the enemy discards 1 random card; choose an enemy unit whose attacks roll with disadvantage for the whole combat.",
    enemyDiscardAtCombatStart: 1,
    markEnemyAttackDisadvantage: true
  },
  "wog.artifact.chalice_of_renewal": {
    cardId: "wog.artifact.chalice_of_renewal",
    slug: "chalice_of_renewal",
    name: "Chalice of Renewal",
    slot: "trinket",
    tier: "relic",
    effectText: "once every combat round, heal 1 damage from a chosen allied unit other than the commander.",
    healAllyPerCombatRound: 1
  },
  "wog.artifact.ring_of_the_sealed_horizon": {
    cardId: "wog.artifact.ring_of_the_sealed_horizon",
    slug: "ring_of_the_sealed_horizon",
    name: "Ring of the Sealed Horizon",
    slot: "trinket",
    tier: "major",
    effectText: "at combat start, create a Force Field on any empty space; it lasts through combat round 2.",
    forceFieldAtCombatStartRounds: 2
  },
  "wog.artifact.amulet_of_recoil": {
    cardId: "wog.artifact.amulet_of_recoil",
    slug: "amulet_of_recoil",
    name: "Amulet of Recoil",
    slot: "trinket",
    tier: "relic",
    effectText: "reduce damage from the first attack against the commander each combat by 2. At each activation, choose an adjacent enemy: deal 2 damage and push it back if possible.",
    firstIncomingAttackReduction: 2,
    activationPushAdjacentDamage: 2
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
  moveRangeBonus: number;
  oddRoundAttack: number;
  laterRoundAttack: number;
  retaliationAttack: number;
  lowDefenseAttack: number;
  lowDefenseThreshold: number;
  abilityIds: string[];
  castPowerBonus: number;
  reviveFree: boolean;
  attackRollAdvantage: boolean;
  nonNegativeMightDice: number;
  incomingAttackDisadvantage: "round-1" | "odd-rounds" | "combat" | null;
  onAttackDefensePenalty: number;
  onAttackAttackPenalty: number;
  onAttackInitiativePenalty: number;
  onAttackMovePenalty: number;
  healAfterDamagingAttack: number;
  defensePierce: number;
  combatRebirth: boolean;
  healAfterMove: number;
  healAfterDefend: number;
  cleaveDamage: number;
  reflectDamage: number;
  activationAdjacentDamage: number;
  drawAfterDefeatingLayer: number;
  materialsAfterDefeatingLayer: number;
  healAfterAttacked: number;
  delayedAttackDamagePerRound: number;
  goldPerCombatRound: number;
  enemyDiscardAtCombatStart: number;
  markEnemyAttackDisadvantage: boolean;
  healAllyPerCombatRound: number;
  summonWeakSpiritAtCombatStart: boolean;
  optionalFirePulseAtCombatStart: number;
  forceFieldAtCombatStartRounds: number;
  firstOwnAttackBonus: number;
  rangedAttackerDamage: number;
  firstIncomingAttackReduction: number;
  activationPushAdjacentDamage: number;
  goldAfterWonCombat: number;
  goldAfterCommanderLevel: number;
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
    moveRangeBonus: 0,
    oddRoundAttack: 0,
    laterRoundAttack: 0,
    retaliationAttack: 0,
    lowDefenseAttack: 0,
    lowDefenseThreshold: -1,
    abilityIds: [],
    castPowerBonus: 0,
    reviveFree: false,
    attackRollAdvantage: false,
    nonNegativeMightDice: 0,
    incomingAttackDisadvantage: null,
    onAttackDefensePenalty: 0,
    onAttackAttackPenalty: 0,
    onAttackInitiativePenalty: 0,
    onAttackMovePenalty: 0,
    healAfterDamagingAttack: 0,
    defensePierce: 0,
    combatRebirth: false,
    healAfterMove: 0,
    healAfterDefend: 0,
    cleaveDamage: 0,
    reflectDamage: 0,
    activationAdjacentDamage: 0,
    drawAfterDefeatingLayer: 0,
    materialsAfterDefeatingLayer: 0,
    healAfterAttacked: 0,
    delayedAttackDamagePerRound: 0,
    goldPerCombatRound: 0,
    enemyDiscardAtCombatStart: 0,
    markEnemyAttackDisadvantage: false,
    healAllyPerCombatRound: 0,
    summonWeakSpiritAtCombatStart: false,
    optionalFirePulseAtCombatStart: 0,
    forceFieldAtCombatStartRounds: 0,
    firstOwnAttackBonus: 0,
    rangedAttackerDamage: 0,
    firstIncomingAttackReduction: 0,
    activationPushAdjacentDamage: 0,
    goldAfterWonCombat: 0,
    goldAfterCommanderLevel: 0
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
    totals.moveRangeBonus += spec.moveRangeBonus ?? 0;
    totals.oddRoundAttack += spec.oddRoundAttack ?? 0;
    totals.laterRoundAttack += spec.laterRoundAttack ?? 0;
    totals.retaliationAttack += spec.retaliationAttack ?? 0;
    totals.lowDefenseAttack += spec.lowDefenseAttack ?? 0;
    if (spec.lowDefenseThreshold !== undefined) totals.lowDefenseThreshold = spec.lowDefenseThreshold;
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
    else if (spec.incomingAttackDisadvantage === "odd-rounds" && !totals.incomingAttackDisadvantage) {
      totals.incomingAttackDisadvantage = "odd-rounds";
    }
    totals.onAttackDefensePenalty += spec.onAttackDefensePenalty ?? 0;
    totals.onAttackAttackPenalty += spec.onAttackAttackPenalty ?? 0;
    totals.onAttackInitiativePenalty += spec.onAttackInitiativePenalty ?? 0;
    totals.onAttackMovePenalty += spec.onAttackMovePenalty ?? 0;
    totals.healAfterDamagingAttack += spec.healAfterDamagingAttack ?? 0;
    totals.defensePierce += spec.defensePierce ?? 0;
    totals.combatRebirth ||= Boolean(spec.combatRebirth);
    totals.healAfterMove += spec.healAfterMove ?? 0;
    totals.healAfterDefend += spec.healAfterDefend ?? 0;
    totals.cleaveDamage += spec.cleaveDamage ?? 0;
    totals.reflectDamage += spec.reflectDamage ?? 0;
    totals.activationAdjacentDamage += spec.activationAdjacentDamage ?? 0;
    totals.drawAfterDefeatingLayer += spec.drawAfterDefeatingLayer ?? 0;
    totals.materialsAfterDefeatingLayer += spec.materialsAfterDefeatingLayer ?? 0;
    totals.healAfterAttacked += spec.healAfterAttacked ?? 0;
    totals.delayedAttackDamagePerRound += spec.delayedAttackDamagePerRound ?? 0;
    totals.goldPerCombatRound += spec.goldPerCombatRound ?? 0;
    totals.enemyDiscardAtCombatStart += spec.enemyDiscardAtCombatStart ?? 0;
    totals.markEnemyAttackDisadvantage ||= Boolean(spec.markEnemyAttackDisadvantage);
    totals.healAllyPerCombatRound += spec.healAllyPerCombatRound ?? 0;
    totals.summonWeakSpiritAtCombatStart ||= Boolean(spec.summonWeakSpiritAtCombatStart);
    totals.optionalFirePulseAtCombatStart += spec.optionalFirePulseAtCombatStart ?? 0;
    totals.forceFieldAtCombatStartRounds = Math.max(totals.forceFieldAtCombatStartRounds, spec.forceFieldAtCombatStartRounds ?? 0);
    totals.firstOwnAttackBonus += spec.firstOwnAttackBonus ?? 0;
    totals.rangedAttackerDamage += spec.rangedAttackerDamage ?? 0;
    totals.firstIncomingAttackReduction += spec.firstIncomingAttackReduction ?? 0;
    totals.activationPushAdjacentDamage += spec.activationPushAdjacentDamage ?? 0;
    totals.goldAfterWonCombat += spec.goldAfterWonCombat ?? 0;
    totals.goldAfterCommanderLevel += spec.goldAfterCommanderLevel ?? 0;
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

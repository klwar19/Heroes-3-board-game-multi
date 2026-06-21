import type { UnitSideDefinition } from "@/data/factions/types";
import type { StackTokenStat } from "@/engine/state";
import type { LocationInteraction } from "./types";

export type { StackTokenStat };

/**
 * CREATURE BANKS (Naval Battles expansion, optional rule — rulebook p.66-67,
 * 84-85). A Creature Bank is a Visitable Field guarded by a fixed party of
 * Creature Bank unit cards. Beating them claims the bank's reward plus a bonus
 * scaled by the number of Stacked defenders.
 *
 * IMPORTANT (and the reason this file exists separately from `units.ts`):
 * Creature Bank unit cards are their OWN cards. They do NOT share the Few /
 * Pack / Neutral statistics of the matching unit, and they have NO tier
 * (bronze/silver/gold/azure), so tier-dependent effects never apply to them.
 * The stats and abilities below are transcribed from the "Creature Bank"
 * column of each unit's fan-wiki page (e.g. https://en.homm3bg.wiki/units/wraiths/
 * lists separate "Crypt" and "Shipwreck" columns).
 *
 * Per the project rules (CLAUDE.md): every `abilities` array below is the
 * COMPLETE, literal list of engine-wired effects on that bank card. Anything an
 * `abilityText` describes that is NOT in `abilities` is display-only and is
 * registered in DISPLAY_ONLY_BANK_ABILITIES (src/data/units/abilities.ts).
 */

export type CreatureBankId =
  | "imp_cache"
  | "crypt"
  | "dwarven_treasury"
  | "medusa_stores"
  | "dragon_fly_hive"
  | "shipwreck"
  | "derelict_ship"
  | "pyramid"
  | "griffin_conservatory"
  | "naga_bank"
  | "cyclops_stockpile"
  | "dragon_utopia";

/** Token pile a bank belongs to: Far = Map Tiles II-III, Near = Map Tiles IV-V. */
export type CreatureBankTier = "far" | "near";

/**
 * Bank unit cards, keyed by the underlying neutral unit definition id. Each is
 * a single fighting side (no Few/Pack flip, no recruitment cost). `cost: {}`
 * marks them as un-recruitable. Stats are the wiki "Creature Bank" column.
 */
export const CREATURE_BANK_UNIT_SIDES: Record<string, UnitSideDefinition> = {
  // --- Imp Cache ----------------------------------------------------------
  "neutral.familiars": {
    attack: 1,
    defense: 0,
    health: 2,
    initiative: 5,
    type: "ground",
    cost: {},
    // engine: while Stacked, reduce every enemy spell's Power by 1 (min 0).
    abilities: ["bank-familiar-power-drain"],
    abilityText:
      "[unit_passive] As long as this unit is Stacked, whenever the enemy casts a spell, reduce their [power] by 1 (to a minimum of 0)."
  },
  // --- Crypt --------------------------------------------------------------
  "neutral.skeletons": {
    attack: 1,
    defense: 0,
    health: 2,
    initiative: 4,
    type: "ground",
    cost: {},
    abilities: ["phoenix-rebirth"],
    abilityText: "[unit_passive] Once per Combat, when this unit's [health_points] drops to 0, set it to 1 instead."
  },
  "neutral.zombies": {
    attack: 1,
    defense: 0,
    health: 2,
    initiative: 3,
    type: "ground",
    cost: {},
    abilities: ["zombie-resilience-weak"],
    abilityText: '[unit_passive] If the attacker resolves a "+1" on the Attack die against this unit, gain +1 [defense].'
  },
  "neutral.wraiths": {
    attack: 2,
    defense: 0,
    health: 3,
    initiative: 5,
    type: "flying",
    cost: {},
    // engine: on this unit's own attack, the enemy discards 1 random card.
    abilities: ["bank-wraith-attack-discard"],
    abilityText: "[unit_passive] Whenever this unit attacks, the enemy must discard 1 card from hand (if possible)."
  },
  "neutral.vampires": {
    attack: 2,
    defense: 0,
    health: 3,
    initiative: 6,
    type: "flying",
    cost: {},
    abilities: ["bank-vampire-life-drain"],
    abilityText: "[unit_attack] After the attack, remove all [damage] from this unit."
  },
  // --- Dwarven Treasury ---------------------------------------------------
  "neutral.dwarves": {
    attack: 2,
    defense: 1,
    health: 3,
    initiative: 3,
    type: "ground",
    cost: {},
    // engine: while Stacked, this unit rolls the Defend die when attacked.
    abilities: ["bank-stacked-defense-token"],
    abilityText: "[unit_passive] As long as this unit is Stacked, it is treated as if it had a Defense token on it."
  },
  // --- Medusa Stores ------------------------------------------------------
  "neutral.medusas": {
    attack: 3,
    defense: 0,
    health: 3,
    initiative: 6,
    type: "ranged",
    cost: {},
    // engine: ignore-retaliation always; while Stacked, the attack also Paralyzes.
    abilities: ["ignores-retaliation", "bank-medusa-paralyze-stacked"],
    abilityText: "[unit_attack] Ignore the Retaliation Attack. If this unit is Stacked, the target gains [paralysis]."
  },
  // --- Dragon Fly Hive ----------------------------------------------------
  "neutral.dragon_flies": {
    attack: 3,
    defense: 0,
    health: 2,
    initiative: 8,
    type: "flying",
    cost: {},
    abilities: ["dragon-fly-retaliation-penalty-2"],
    abilityText: "[unit_attack] Retaliation Attacks against this unit suffer -2 [attack]."
  },
  // --- Shipwreck (re-uses the Wraiths bank card) --------------------------
  // Wraiths field both Crypt and Shipwreck with identical stats, so the single
  // "neutral.wraiths" entry above serves both banks.

  // --- Derelict Ship ------------------------------------------------------
  "neutral.water_elementals": {
    attack: 3,
    defense: 0,
    health: 5,
    initiative: 6,
    type: "ground",
    cost: {},
    abilities: ["magic-elemental-immunity"],
    abilityText: "[unit_passive] Immune to Magic Arrow."
  },
  // --- Pyramid ------------------------------------------------------------
  "neutral.gold_golems": {
    attack: 3,
    defense: 1,
    health: 4,
    initiative: 4,
    type: "ground",
    cost: {},
    abilities: ["reduce-spell-damage-2"],
    abilityText: "[unit_passive] This unit reduces any [damage] it takes from spells by 2 (to a minimum of 0)."
  },
  "neutral.diamond_golems": {
    attack: 3,
    defense: 1,
    health: 5,
    initiative: 5,
    type: "ground",
    cost: {},
    abilities: ["reduce-spell-damage-3"],
    abilityText: "[unit_passive] This unit reduces any [damage] it takes from spells by 3 (to a minimum of 0)."
  },
  // --- Griffin Conservatory ----------------------------------------------
  "neutral.griffins": {
    attack: 3,
    defense: 0,
    health: 4,
    initiative: 8,
    type: "flying",
    cost: {},
    abilities: ["unlimited-retaliation"],
    abilityText: "[unit_passive] This unit can perform an unlimited number of Retaliation Attacks."
  },
  // --- Naga Bank ----------------------------------------------------------
  "neutral.nagas": {
    attack: 4,
    defense: 1,
    health: 5,
    initiative: 6,
    type: "ground",
    cost: {},
    abilities: ["ignores-retaliation"],
    abilityText: "[unit_attack] Ignore Retaliation Attacks."
  },
  // --- Cyclops Stockpile --------------------------------------------------
  "neutral.cyclopes": {
    attack: 5,
    defense: 1,
    health: 5,
    initiative: 8,
    type: "ranged",
    cost: {},
    // The Cyclops Stockpile card prints no ability (wiki shows "-").
    abilities: []
  },
  // --- Dragon Utopia ------------------------------------------------------
  "neutral.black_dragons": {
    attack: 5,
    defense: 2,
    health: 5,
    initiative: 9,
    type: "flying",
    cost: {},
    // engine: while Stacked, +3 Attack on every attack and Retaliation Attack.
    abilities: ["bank-black-dragon-stacked-attack"],
    abilityText: "[unit_passive] As long as this unit is Stacked, its [attack] gains +3."
  },
  "neutral.gold_dragons": {
    attack: 5,
    defense: 2,
    health: 6,
    initiative: 10,
    type: "flying",
    cost: {},
    abilities: ["dragon-line-attack-3"],
    abilityText:
      "[unit_attack] Attack 2 spaces in a line. The first attack resolves normally, and the second has 3 [attack]."
  },
  "neutral.faerie_dragons": {
    attack: 4,
    defense: 2,
    health: 6,
    initiative: 15,
    type: "flying",
    cost: {},
    // engine: while Stacked, the enemy player cannot cast any spell.
    abilities: ["bank-faerie-dragon-spell-lock"],
    abilityText: "[unit_passive] As long as this unit is Stacked, the enemy cannot cast spells."
  },
  "neutral.crystal_dragons": {
    attack: 6,
    defense: 2,
    health: 6,
    initiative: 16,
    type: "ground",
    cost: {},
    // engine: while Stacked, this unit rolls the Defend die when attacked.
    abilities: ["bank-stacked-defense-token"],
    abilityText: "[unit_passive] As long as this unit is Stacked, it is treated as if it had a Defense token on it."
  }
};

/** Reward status, mirroring the card-implementation honesty rules in CLAUDE.md. */
export type CreatureBankRewardStatus = "implemented" | "partial" | "not-implemented";

export type CreatureBankDefinition = {
  id: CreatureBankId;
  name: string;
  tier: CreatureBankTier;
  /** Defending party as underlying neutral unit def ids (with repeats). */
  units: string[];
  /** Printed reward text (display/reference). */
  rewardText: string;
  rewardStatus: CreatureBankRewardStatus;
  /** What part of the reward, if any, is NOT engine-resolved yet. */
  rewardNote?: string;
  /**
   * Builds the engine reward for a win, given X = the number of Stacked
   * defenders. Returns a LocationInteraction resolved through the normal field
   * visit pipeline. `{ type: "NONE" }` when the reward is not yet implemented.
   */
  buildReward: (stackedCount: number) => LocationInteraction;
};

/** Search (count) the given shared deck — skipped when count <= 0. */
function search(deckId: "spells" | "abilities" | "artifacts", count: number): LocationInteraction {
  return count > 0 ? { type: "SEARCH_SHARED_DECK", deckId, count } : { type: "NONE" };
}

export const CREATURE_BANKS: Record<CreatureBankId, CreatureBankDefinition> = {
  // ----- Far Map Tiles (II-III) ------------------------------------------
  imp_cache: {
    id: "imp_cache",
    name: "Imp Cache",
    tier: "far",
    units: ["neutral.familiars", "neutral.familiars", "neutral.familiars", "neutral.familiars"],
    rewardText: "3 gold. Extra: +X gold.",
    rewardStatus: "implemented",
    buildReward: (x) => ({ type: "GAIN_RESOURCES", gold: 3 + x })
  },
  crypt: {
    id: "crypt",
    name: "Crypt",
    tier: "far",
    units: ["neutral.skeletons", "neutral.zombies", "neutral.wraiths", "neutral.vampires"],
    rewardText: "6 gold. Extra: +2X gold.",
    rewardStatus: "implemented",
    buildReward: (x) => ({ type: "GAIN_RESOURCES", gold: 6 + 2 * x })
  },
  dwarven_treasury: {
    id: "dwarven_treasury",
    name: "Dwarven Treasury",
    tier: "far",
    units: ["neutral.dwarves", "neutral.dwarves", "neutral.dwarves", "neutral.dwarves"],
    rewardText: "7 gold. Extra: +3X gold.",
    rewardStatus: "implemented",
    buildReward: (x) => ({ type: "GAIN_RESOURCES", gold: 7 + 3 * x })
  },
  medusa_stores: {
    id: "medusa_stores",
    name: "Medusa Stores",
    tier: "far",
    units: ["neutral.medusas", "neutral.medusas", "neutral.medusas", "neutral.medusas"],
    // Wiki: "6 gold and 1 valuables. 3 gold OR 1 valuables for every Stacked
    // unit." The per-Stack bonus is a CHOICE, not both (unlike the Naga Bank).
    rewardText: "6 gold, 1 valuables. Extra: per Stacked defender, choose +3 gold or +1 valuables.",
    rewardStatus: "implemented",
    buildReward: (x) => ({
      type: "SEQUENCE",
      interactions: [
        { type: "GAIN_RESOURCES", gold: 6, valuables: 1 },
        ...Array.from(
          { length: Math.max(0, x) },
          (): LocationInteraction => ({
            type: "CHOOSE_ONE",
            options: [
              { label: "Gain 3 gold", interaction: { type: "GAIN_RESOURCES", gold: 3 } },
              { label: "Gain 1 valuables", interaction: { type: "GAIN_RESOURCES", valuables: 1 } }
            ]
          })
        )
      ]
    })
  },
  dragon_fly_hive: {
    id: "dragon_fly_hive",
    name: "Dragon Fly Hive",
    tier: "far",
    units: ["neutral.dragon_flies", "neutral.dragon_flies", "neutral.dragon_flies", "neutral.dragon_flies"],
    rewardText: "Gain 1 Dragon Flies (a Stacked Pack if there were at least 2 Stacked defenders).",
    rewardStatus: "implemented",
    // Gain the recruitable Dragon Flies card: a Pack ("Stacked") when 2+ defenders
    // were Stacked, otherwise a Few. (The wiki notes the Stacked version needs at
    // least Normal difficulty — Easy rolls a single token, so X can never reach 2.)
    buildReward: (x) => ({ type: "GAIN_UNIT", unitDefId: "fortress.dragon_flies", side: x >= 2 ? "pack" : "few" })
  },
  shipwreck: {
    id: "shipwreck",
    name: "Shipwreck",
    tier: "far",
    units: ["neutral.wraiths", "neutral.wraiths", "neutral.wraiths", "neutral.wraiths"],
    // Wiki: "<morale_positive> and 5 gold." — a POSITIVE morale token, not a penalty.
    rewardText: "+1 morale and 5 gold. Extra: +2X gold and Search (X) the Artifact Deck.",
    rewardStatus: "implemented",
    buildReward: (x) => ({
      type: "SEQUENCE",
      interactions: [
        { type: "GAIN_MORALE", amount: 1 },
        { type: "GAIN_RESOURCES", gold: 5 + 2 * x },
        search("artifacts", x)
      ]
    })
  },
  // ----- Near Map Tiles (IV-V) -------------------------------------------
  derelict_ship: {
    id: "derelict_ship",
    name: "Derelict Ship",
    tier: "near",
    units: [
      "neutral.water_elementals",
      "neutral.water_elementals",
      "neutral.water_elementals",
      "neutral.water_elementals"
    ],
    // Wiki: "<morale_positive> and 7 gold." — a POSITIVE morale token, not a penalty.
    rewardText: "+1 morale and 7 gold. Extra: +2X gold and Search (X) the Spell Deck.",
    rewardStatus: "implemented",
    buildReward: (x) => ({
      type: "SEQUENCE",
      interactions: [
        { type: "GAIN_MORALE", amount: 1 },
        { type: "GAIN_RESOURCES", gold: 7 + 2 * x },
        search("spells", x)
      ]
    })
  },
  pyramid: {
    id: "pyramid",
    name: "Pyramid",
    tier: "near",
    units: ["neutral.gold_golems", "neutral.gold_golems", "neutral.diamond_golems", "neutral.diamond_golems"],
    rewardText:
      "Search (5) the Spell Deck. Extra: up to X times, remove 1 Spell/Ability/Artifact card from your hand or discard pile, then Search (5) the appropriate Deck.",
    rewardStatus: "partial",
    rewardNote:
      "Base Search (5) the Spell Deck is granted. The per-Stack 'remove a card then Search (5)' extra is not implemented yet.",
    buildReward: () => ({ type: "SEARCH_SHARED_DECK", deckId: "spells", count: 5 })
  },
  griffin_conservatory: {
    id: "griffin_conservatory",
    name: "Griffin Conservatory",
    tier: "near",
    units: ["neutral.griffins", "neutral.griffins", "neutral.griffins", "neutral.griffins"],
    rewardText: "Gain 1 Griffins (a Stacked Pack if there were at least 2 Stacked defenders).",
    rewardStatus: "implemented",
    // Gain the recruitable Griffins card: a Pack ("Stacked") when 2+ defenders were
    // Stacked, otherwise a Few.
    buildReward: (x) => ({ type: "GAIN_UNIT", unitDefId: "castle.griffins", side: x >= 2 ? "pack" : "few" })
  },
  naga_bank: {
    id: "naga_bank",
    name: "Naga Bank",
    tier: "near",
    units: ["neutral.nagas", "neutral.nagas", "neutral.nagas", "neutral.nagas"],
    rewardText: "6 gold, 2 valuables. Extra: +6X gold, +X valuables.",
    rewardStatus: "implemented",
    buildReward: (x) => ({ type: "GAIN_RESOURCES", gold: 6 + 6 * x, valuables: 2 + x })
  },
  cyclops_stockpile: {
    id: "cyclops_stockpile",
    name: "Cyclops Stockpile",
    tier: "near",
    units: ["neutral.cyclopes", "neutral.cyclopes", "neutral.cyclopes", "neutral.cyclopes"],
    rewardText: "8 building materials, 2 valuables. Extra: +2X building materials, +X valuables.",
    rewardStatus: "implemented",
    buildReward: (x) => ({ type: "GAIN_RESOURCES", buildingMaterials: 8 + 2 * x, valuables: 2 + x })
  },
  dragon_utopia: {
    id: "dragon_utopia",
    name: "Dragon Utopia",
    tier: "near",
    units: ["neutral.black_dragons", "neutral.gold_dragons", "neutral.faerie_dragons", "neutral.crystal_dragons"],
    rewardText: "40 gold and Search (3) the Artifact Deck. Extra: X times, Search (5) the Artifact or Spell Deck.",
    rewardStatus: "implemented",
    buildReward: (x) => ({
      type: "SEQUENCE",
      interactions: [
        { type: "GAIN_RESOURCES", gold: 40 },
        { type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 3 },
        ...Array.from(
          { length: Math.max(0, x) },
          (): LocationInteraction => ({
            type: "CHOOSE_ONE",
            options: [
              { label: "Search (5) the Artifact Deck", interaction: { type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 5 } },
              { label: "Search (5) the Spell Deck", interaction: { type: "SEARCH_SHARED_DECK", deckId: "spells", count: 5 } }
            ]
          })
        )
      ]
    })
  }
};

/**
 * Stack Tokens placed on the bank by Scenario Difficulty (rulebook p.66). This
 * is the number of token ROLLS, not the guaranteed number of Stacked defenders:
 * each candidate is only Stacked `STACK_TOKEN_PLACEMENT_PERCENT`% of the time
 * (see `buildCreatureBankCombatUnits`).
 */
export const STACK_TOKENS_BY_DIFFICULTY = {
  easy: 1,
  normal: 2,
  hard: 3,
  impossible: 4
} as const;

/**
 * Per-defender chance (percent) that a rolled Stack Token actually lands. A
 * token is rolled once for each of the difficulty's candidate defenders, so the
 * Stacked count is NOT fixed: even Impossible (4 rolls) can come up with all
 * four Stacked (every roll hit) or none at all (every roll missed).
 */
export const STACK_TOKEN_PLACEMENT_PERCENT = 77;

/** The four Stack Tokens, in their fixed pool order, with the stat delta each applies. */
export const STACK_TOKEN_STATS: readonly StackTokenStat[] = ["attack", "defense", "health", "initiative"];

/** +1 to attack/defense/health, +2 to initiative. */
export function stackTokenDelta(stat: StackTokenStat): number {
  return stat === "initiative" ? 2 : 1;
}

export function getCreatureBankUnitSide(unitDefId: string): UnitSideDefinition | undefined {
  return CREATURE_BANK_UNIT_SIDES[unitDefId];
}

export const CREATURE_BANK_IDS = Object.keys(CREATURE_BANKS) as CreatureBankId[];

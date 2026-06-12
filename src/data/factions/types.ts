import type { ResourceCost, UnitType } from "@/engine/state";

export type FactionId = "castle" | "rampart" | "inferno" | "necropolis" | "dungeon";
export type UnitTier = "bronze" | "silver" | "gold" | "azure";

export type UnitSideDefinition = {
  attack: number;
  defense: number;
  health: number;
  initiative: number;
  /** Few side: recruitment cost. Pack side: reinforcement cost. */
  cost: ResourceCost;
  /** Implemented engine ability tags (see src/data/units/abilities.ts). */
  abilities: string[];
  /** Printed rules text for display until the ability is implemented. */
  abilityText?: string;
  cardImage?: string;
};

export type UnitDefinition = {
  id: string;
  name: string;
  faction: FactionId | "neutral";
  tier: UnitTier;
  type: UnitType;
  few?: UnitSideDefinition;
  pack?: UnitSideDefinition;
  /** Neutral units are single sided. */
  neutral?: UnitSideDefinition;
  wikiUrl?: string;
  source: {
    product: string;
    credit: string;
    url?: string;
  };
};

export type HeroLevelEffect =
  | { type: "ABILITY_SEARCH"; count: number }
  | { type: "SPECIALTY"; cardId: string }
  | { type: "HAND_LIMIT"; limit: number }
  | { type: "EXPERT_USES"; limit: number };

export type HeroDefinition = {
  id: string;
  name: string;
  faction: FactionId;
  class: string;
  type: "might" | "magic";
  /** Statistic card counts of the starting deck. */
  startingStats: { attack: number; defense: number; power: number; knowledge: number };
  /** Card id of the printed starting ability. */
  startingAbilityCardId: string;
  /** Specialty card ids gained at levels I, IV and VI. */
  specialtyCardIds: { 1: string; 4: string; 6: string };
  portrait?: string;
  source: {
    product: string;
    credit: string;
    url?: string;
  };
};

export type TownBuildingEffect =
  | { type: "UNLOCK_RECRUIT_TIER"; tier: UnitTier }
  | { type: "UNLOCK_REINFORCE" }
  | { type: "MAGE_GUILD" }
  | { type: "RESOURCE_ROUND_CHOICE"; options: { label: string; gold?: number; buildingMaterials?: number; valuables?: number; movement?: number; reinforceBronzeFree?: boolean }[] }
  | { type: "RESOURCE_ROUND_MORALE" }
  | {
      /**
       * Blacksmith: once per turn, pay `searchCost` gold to Search (2) the
       * Artifact deck, or remove an Artifact card from hand for `sellGold`.
       * Owning it also counts as an "artifact source" for BINH deck gating.
       */
      type: "ARTIFACT_SMITH";
      searchCost: number;
      sellGold: number;
    }
  | { type: "NOT_IMPLEMENTED"; note: string };

export type TownBuildingDefinition = {
  id: string;
  name: string;
  faction: FactionId | "all";
  cost: ResourceCost;
  /** Dwellings must be built lowest tier first. */
  prerequisites?: string[];
  effect?: TownBuildingEffect;
  /** Gold the Spell Book token costs at this faction's Mage Guild. */
  spellBookCost?: number;
  implementationStatus: "implemented" | "not-implemented";
  /**
   * Art slots, ready for the real component scans: the building tile face
   * and an optional icon. The town panel renders them as soon as a URL or
   * /public path is filled in; everything works without them.
   */
  assets?: {
    image?: string;
    icon?: string;
  };
  source: {
    product: string;
    credit: string;
    url?: string;
  };
};

export type FactionDefinition = {
  id: FactionId;
  name: string;
  /** Player flag/cube color used on the map and hero pawns. */
  color: string;
  startingTileId: string;
  heroes: string[];
  buildings: string[];
  /** Unit definition ids recruitable by this faction. */
  units: string[];
  /** Necropolis ignores all morale effects. */
  ignoresMorale?: boolean;
  townImage?: string;
  source: {
    product: string;
    credit: string;
    url?: string;
  };
};

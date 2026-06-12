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
  /** Classic PC portrait (heroes.thelazy.net), hosted locally. */
  portrait?: string;
  /** Scan of the printed hero board (fan wiki), hosted locally. */
  boardScan?: string;
  source: {
    product: string;
    credit: string;
    url?: string;
  };
};

/** One pickable City Hall (resource/astrologers round) income option. */
export type CityHallOption = {
  label: string;
  gold?: number;
  buildingMaterials?: number;
  valuables?: number;
  movement?: number;
  reinforceBronzeFree?: boolean;
  /** Stronghold City Hall / Tower City Hall: draw cards from the M&M deck. */
  drawCards?: number;
};

export type TownBuildingEffect =
  | { type: "UNLOCK_RECRUIT_TIER"; tier: UnitTier }
  | { type: "UNLOCK_REINFORCE" }
  | { type: "MAGE_GUILD" }
  | { type: "RESOURCE_ROUND_CHOICE"; options: CityHallOption[] }
  | { type: "RESOURCE_ROUND_MORALE" }
  | {
      /** Mystic Pond: each Resource round, roll a Resource die and gain it. */
      type: "RESOURCE_ROUND_RESOURCE_DIE";
    }
  | {
      /**
       * Saplings: at the beginning of each Astrologers' round, reinforce one
       * unit of the listed tiers for half of the gold cost (other resources
       * unchanged).
       */
      type: "ASTROLOGERS_HALF_GOLD_REINFORCE";
      tiers: UnitTier[];
    }
  | {
      /**
       * Necromancy Amplifier: at the beginning of your turn, search the
       * Ability deck for a Necromancy card OR take a Specialty card from
       * your discard pile.
       */
      type: "TURN_START_NECROMANCY";
    }
  | {
      /**
       * Portal of Summoning: at the beginning of your turn, draw 1 Neutral
       * Unit card from a deck matching one of your built Dwellings and pay
       * its printed cost to recruit it.
       */
      type: "TURN_START_PORTAL_SUMMON";
    }
  | {
      /**
       * Mana Vortex: at the beginning of your turn, discard 1 card to shuffle
       * your discard pile into your deck, then Search(3) from it.
       */
      type: "TURN_START_MANA_VORTEX";
    }
  | {
      /**
       * Cover of Darkness: once per round — during your turn discard up to 2
       * cards to draw that many, OR at the beginning of a combat with an
       * enemy hero discard 1 random card from the enemy's hand.
       */
      type: "COVER_OF_DARKNESS";
    }
  | {
      /**
       * Castle Gate: during your turn — pay `discardCost` gold to discard 1
       * random card from an opponent's hand, OR move your hero from a town or
       * settlement you control to another one you control.
       */
      type: "CASTLE_GATE";
      discardCost: number;
    }
  | {
      /**
       * Cube buildings (Brimstone Stormclouds, Cage of Warlords): gain a
       * faction cube when built and at each `gainOn` round start (up to
       * `max`); spend cubes during combat for the printed bonus.
       */
      type: "COMBAT_CUBES";
      max: number;
      gainOn: "astrologers" | "resource";
      spend: "spell-power" | "attack-or-defense";
    }
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

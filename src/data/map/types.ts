import type { ResourceKind } from "@/engine/state";

export type TileGroup = "starting" | "far" | "near" | "center" | "sea" | "subterranean";

/** Which boxed product a tile ships in. Setup pools are gated by these. */
export type TileContent =
  | "core_game"
  | "rampart_expansion"
  | "fortress_expansion"
  | "inferno_expansion"
  | "tower_expansion"
  | "stronghold_expansion"
  | "conflux_expansion"
  | "cove_expansion"
  | "regular_stretch_goals";

export type TileFieldDefinition = {
  location: string;
  /** Roman numeral guard level printed on the field (I-VII). */
  difficulty?: number;
  /** Resource shown on the field (mines, windmills, ...). */
  resource?: ResourceKind;
  /** Immediate gain or income amount tied to `resource`. */
  amount?: number;
  /** Faction styling for towns and settlements. */
  faction?: string;
};

export type TileDefinition = {
  id: string;
  group: TileGroup;
  /** Product the tile ships in; setup pools only draw enabled content. */
  content: TileContent;
  terrain: string;
  /** Slot order: 0 = center, 1-6 = ring NE, E, SE, SW, W, NW (unrotated). */
  fields: TileFieldDefinition[];
  /**
   * Ring directions (NE, E, SE, SW, W, NW before rotation) whose outer tile
   * edge cannot be crossed: solid yellow border lines or blocked fields.
   * Scan-verified against every core/Rampart/Inferno tile: each marked
   * direction carries the printed yellow line on all three of its outer hex
   * edges (full arcs), so direction granularity is exact for these tiles.
   */
  outerImpassable: boolean[];
  /**
   * Printed yellow border lines between two fields of this tile, as
   * unrotated slot pairs (0 = center, 1-6 = ring). Movement may not cross
   * them without Fly/Pathfinding-style effects. Scan verification found no
   * internal passable-passable border on any core-box tile — blocked fields
   * are ringed, which the blocked location already enforces — but expansion
   * tiles can declare them here and the engine enforces them.
   */
  internalBorders?: [number, number][];
  source: {
    product: string;
    credit: string;
    url?: string;
  };
  assets?: {
    tileImage?: string;
  };
};

export type LocationCategory = "empty" | "blocked" | "visitable" | "flaggable" | "revisitable" | "town";

export type LocationInteraction =
  | { type: "NONE" }
  | { type: "GAIN_RESOURCES"; gold?: number; buildingMaterials?: number; valuables?: number }
  | { type: "GAIN_EXPERIENCE"; amount: number }
  | { type: "GAIN_MOVEMENT"; amount: number }
  | { type: "GAIN_MORALE"; amount: number }
  | { type: "ROLL_RESOURCE_DICE"; count: number }
  | { type: "ROLL_TREASURE_DICE"; count: number }
  | { type: "SEARCH_SHARED_DECK"; deckId: "spells" | "abilities" | "artifacts"; count: number; times?: number }
  | { type: "MINE_FLAG" }
  | { type: "SETTLEMENT_FLAG" }
  | { type: "TOWN_FLAG" }
  | {
      type: "CHOOSE_ONE";
      options: { label: string; interaction: LocationInteraction }[];
    }
  | {
      /** Optional cost gate: "You may pay X to ..." */
      type: "PAY_TO";
      costOptions: Partial<Record<ResourceKind, number>>[];
      interaction: LocationInteraction;
    }
  | {
      type: "SEQUENCE";
      interactions: LocationInteraction[];
    }
  | { type: "DISCOVER_ADJACENT_TILE" }
  | { type: "MAGIC_SPRING" }
  | { type: "WITCH_HUT" }
  | { type: "SCHOLAR" }
  | { type: "TRADING_POST" }
  | {
      /**
       * Roll one Attack die and resolve the matching branch (Sea Chest,
       * Jetsam and friends from the Cove expansion).
       */
      type: "ATTACK_DIE_TABLE";
      plus: LocationInteraction;
      zero: LocationInteraction;
      minus: LocationInteraction;
    }
  | {
      /**
       * Remove one card from hand (out of the game), then resolve `then`.
       * Trading Post / Witch Hut / Faerie Ring / Market of Time removals.
       */
      type: "REMOVE_HAND_CARD";
      prompt: string;
      /** Restrict which cards may be removed. */
      filter: "any" | "ability" | "statistic" | "removable";
      then: "none" | "gain-valuables" | "search-same-deck" | "choose-deck-search";
    }
  | {
      /** University: pick one of the top cards of a shared discard pile. */
      type: "SEARCH_DISCARD";
      deckId: "spells" | "abilities" | "artifacts";
      count: number;
    }
  | {
      /** Hill Fort: reinforce one Few unit, cost reduced by 3 gold (min 0). */
      type: "HILL_FORT";
    }
  | {
      /** Subterranean Gate: move to the linked gate on an adjacent tile. */
      type: "SUBTERRANEAN_GATE";
    }
  | { type: "NOT_IMPLEMENTED"; note: string };

export type LocationDefinition = {
  id: string;
  name: string;
  category: LocationCategory;
  /** What happens when a hero visits (or flags) the field. */
  interaction: LocationInteraction;
  /** Revisitable protection flags and other passive rules. */
  passive?: {
    /** Heroes standing here cannot be attacked by enemy heroes (Sanctuary). */
    protectsFromAttack?: boolean;
  };
  implementationStatus: "implemented" | "not-implemented";
  source: {
    product: string;
    credit: string;
    url?: string;
  };
};

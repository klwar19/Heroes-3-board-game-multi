import type { ResourceKind } from "@/engine/state";

export type TileGroup = "starting" | "far" | "near" | "center";

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
  terrain: string;
  /** Slot order: 0 = center, 1-6 = ring NE, E, SE, SW, W, NW (unrotated). */
  fields: TileFieldDefinition[];
  /**
   * Ring directions (NE, E, SE, SW, W, NW before rotation) whose outer tile
   * edge cannot be crossed: solid yellow border lines or blocked fields.
   */
  outerImpassable: boolean[];
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

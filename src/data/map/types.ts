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
  | "bulwark_expansion"
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
  /**
   * Per-hex terrain. A sea tile is NOT uniformly water — it mixes open ocean
   * with land islands (mines, towns, shrines, learning stones, witch huts,
   * gardens, warriors' tombs, trees of knowledge …) painted on the tile art —
   * so a hex's terrain is not the tile's. EVERY island hex on a water tile
   * therefore declares `terrain: "land"`, and (rarely) a water hex on a land
   * tile declares `terrain: "water"`. When omitted the hex inherits the tile
   * terrain (water tile -> water hex, anything else -> land hex). Read by
   * `isSeaField` to gate sea movement (coastline halt) and to pick the naval
   * battle board, so it must match the printed art, NOT the location name (the
   * same location — e.g. an `empty_field` or `pandoras_box` — is open water on
   * one sea tile and a dry island on another).
   */
  terrain?: "land" | "water";
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
  | {
      /**
       * Add a unit card to the visiting player's army for free (Creature Bank
       * "gain a unit" rewards). `side` is "pack" for a Stacked gain, "few"
       * otherwise — a Pack is the game's "Stacked" (bigger) version of the card.
       */
      type: "GAIN_UNIT";
      unitDefId: string;
      side: "few" | "pack";
    }
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
      /** War Machine Factory: buy a war machine at its lower price. */
      type: "WAR_MACHINE_SHOP";
    }
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
      /**
       * Pyramid (Creature Bank) per-Stack extra: up to `times`, remove one
       * Spell/Ability/Artifact card from your hand OR discard pile (out of the
       * game), then Search (`searchCount`) the deck that matches the removed
       * card. Each removal is optional, so the player may stop early.
       */
      type: "REMOVE_THEN_SEARCH_REPEAT";
      times: number;
      searchCount: number;
    }
  | {
      /**
       * Dragon Fly Hive / Griffin Conservatory (Creature Bank) bonus reward
       * (HOUSE RULE): choose one Ability card you own (hand or discard) and
       * Empower it permanently — its Expert side may then be played without
       * spending a crown for the rest of the game. No-op if you own no
       * non-Empowered ability.
       */
      type: "EMPOWER_ABILITY";
    }
  | {
      /** Hill Fort: reinforce one Few unit, cost reduced by 3 gold (min 0). */
      type: "HILL_FORT";
    }
  | {
      /** Subterranean Gate: move to the linked gate on an adjacent tile. */
      type: "SUBTERRANEAN_GATE";
    }
  | {
      /**
       * Monolith (Conflux) / Whirlpool (Cove) Location Token: entering the
       * field moves the hero to another token of the same kind (rulebook
       * p.35/83). Monoliths sit on land, Whirlpools on sea; a Whirlpool travel
       * also costs the traveller 1 unit card from their army. With fewer than
       * two tokens of the kind on the map the field does nothing.
       */
      type: "TOKEN_TELEPORT";
      token: "monolith" | "whirlpool";
    }
  | {
      /** Pandora's Box: draw the top card of the Pandora deck into hand. */
      type: "DRAW_PANDORA_CARD";
    }
  | {
      /**
       * Library of Enlightenment: pay 3 gold to remove a Statistic card from
       * hand or discard and replace it with any Statistic card, up to twice.
       */
      type: "LIBRARY_OF_ENLIGHTENMENT";
    }
  | {
      /**
       * Star Axis: remove a Statistic card from hand and replace it with the
       * Empowered version of the same type.
       */
      type: "STAR_AXIS";
    }
  | {
      /**
       * Obelisk (house rule): the first Hero to visit rolls the Attack die and
       * the face is locked on the Field forever. Every visitor (any player) then
       * receives that fixed reward without rerolling — -1: +1 positive morale,
       * 0: Search (2) the Artifact deck, +1: roll one Treasure die and one
       * Resource die. Resolved by the engine (handleObeliskVisit).
       */
      type: "OBELISK";
    }
  | {
      /**
       * Black Market: browse the top of the Artifact discard pile(s) and buy
       * one — 5 gold Minor, 7 gold Major, 10 gold Relic.
       */
      type: "BLACK_MARKET";
    }
  | {
      /**
       * Elemental Conflux: for every Dwelling (unlocked recruit tier) you have,
       * offer one Elementals card from that Neutral deck to recruit.
       */
      type: "ELEMENTAL_CONFLUX";
    }
  | {
      /**
       * Tavern: pay 7 gold to gain a Secondary Hero on this field, then choose
       * one enemy to discard 1 random card from their hand.
       */
      type: "TAVERN";
    }
  | {
      /**
       * Prison: gain a Secondary Hero on this field, or 3 gold if you already
       * have one.
       */
      type: "PRISON";
    }
  | {
      /**
       * Spell Scroll: take a scroll and draw 2 Spells into it (the visitor
       * picks the Basic or Expert Magic deck for each). The scroll's spells
       * are usable in combat at power 0 or sellable at the market.
       */
      type: "SPELL_SCROLL";
    }
  | {
      /**
       * Factory "shovel" dig (Factory expansion tiles): draw the top Artifact
       * card and reveal it, then CHOOSE to keep it (into hand) or discard it.
       * The draw skips cards the visitor cannot acquire, like any shared-deck
       * draw, and the discarded card goes to the Artifact discard pile.
       */
      type: "DIG_ARTIFACT";
    }
  | {
      /**
       * Airship Yard (Factory): grant HERO_MOVE_THROUGH for the rest of this
       * turn (Fly-style: may pass over blocked fields, never stop on them).
       * Composed with GAIN_MOVEMENT via SEQUENCE on the paid option.
       */
      type: "GRANT_MOVE_THROUGH";
    }
  | {
      /**
       * Watering Hole (Factory): immediately end movement this turn; next turn
       * the hero gains +1 movement for that turn only.
       */
      type: "WATERING_HOLE";
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

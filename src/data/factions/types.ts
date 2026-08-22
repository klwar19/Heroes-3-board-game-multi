import type { ResourceCost, UnitType } from "@/engine/state";

export type FactionId =
  | "castle"
  | "rampart"
  | "inferno"
  | "necropolis"
  | "dungeon"
  | "stronghold"
  | "fortress"
  | "tower"
  | "conflux"
  | "cove"
  | "bulwark"
  | "factory"
  | "fuyuki"
  | "azure_breeze"
  | "hidden_leaf"
  | "azur_lane"
  | "heavenly_demon"
  | "little_busters"
  | "mgq";
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
  /**
   * Per-side unit type override. A few units change type when reinforced
   * (Tower Gremlins/Titans go from ground to ranged on their Pack side). When
   * absent the combat unit uses the definition-level `type`.
   */
  type?: UnitType;
};

export type UnitDefinition = {
  id: string;
  name: string;
  faction: FactionId | "neutral";
  tier: UnitTier;
  type: UnitType;
  /** A faction-aligned form that can only enter play through a summon effect. */
  summonOnly?: boolean;
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
  /**
   * Specialty card ids gained at levels I, IV and VI. The whole object is
   * absent for stub/placeholder heroes (art-only factions); an implemented hero
   * always carries all three.
   */
  specialtyCardIds?: { 1: string; 4: string; 6: string };
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
  /** MGQ Pocket Castle Kitchen: waive the gold cost of one Job reassignment. */
  freeJobReassign?: boolean;
  /** Stronghold City Hall / Tower City Hall: draw cards from the M&M deck. */
  drawCards?: number;
  /** Fortress City Hall: open a Trading Post to exchange resources. */
  tradingPost?: boolean;
  /** Conflux City Hall: Search(N) the Spell deck and take 1 card to hand. */
  searchSpellDeck?: number;
  /** Cove City Hall: gain Hero experience (paired with removeArtifactFromHand). */
  experience?: number;
  /**
   * Cove City Hall: this option costs one Artifact card removed from hand. It is
   * only offered when the player holds an Artifact card; choosing it removes one.
   */
  removeArtifactFromHand?: boolean;
  /**
   * Bulwark City Hall ("combat focus", per Gamefound Update #3): forgo the gold
   * income to become Rune-Empowered. Until this player's next Resource round,
   * they start EVERY combat with this many extra Runes (added on top of the
   * Sieidi/Altar baseline). Stored on PlayerState.runeEmpoweredNextCombats and
   * cleared at the next Resource round.
   */
  runesNextCombats?: number;
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
       * Cove Pub, printed: "During each Astrologers' round, while Reinforcing
       * units you may reduce one unit's reinforce cost by `discount` gold (to a
       * minimum of 0)." NOT a round-start prompt (USER RULING 2026-08-22): the
       * Astrologers' round start BANKS a round-long ReinforcementDiscountBank
       * the owner may redeem at any point of their own turn, and the reinforce
       * arm needs the Citadel (no Citadel ⇒ no offer, never a forced upgrade).
       */
      type: "ASTROLOGERS_FLAT_GOLD_REINFORCE";
      discount: number;
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
       * Wall of Knowledge: at the beginning of each Astrologers' round, you
       * may take 1 Knowledge or 1 Power Statistic card from your discard pile
       * to your hand.
       */
      type: "ASTROLOGERS_TAKE_STATISTIC";
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
       * Hall of Valhalla: once per round, one of your units gains +1 attack
       * to a single attack (spent while the attack is waiting to resolve).
       */
      type: "HALL_OF_VALHALLA";
      amount: number;
    }
  | {
      /**
       * Freelancer's Guild: winning against Neutral Units pays `winGold`
       * gold, and Recruiting/Reinforcing may pay the gold cost with building
       * materials and valuables at MARKET rates (1 material = 1 gold,
       * 1 valuables = 3 gold).
       */
      type: "FREELANCERS_GUILD";
      winGold: number;
    }
  | {
      /**
       * Blood Obelisk (Fortress): at the beginning of each Resource round you
       * may Search(`count`) your own discard pile and take 1 card to hand.
       * (The printed card also offers the same Search instantly after your
       * Town is sieged; only the recurring Resource-round trigger is wired.)
       */
      type: "RESOURCE_ROUND_SEARCH_DISCARD";
      count: number;
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
  | {
      /**
       * Garden of Life (Conflux): at the beginning of each round, recruit a Few
       * of the listed unit, or reinforce a Few of it to a Pack — for free.
       */
      type: "ROUND_START_FREE_SPRITE";
      unitDefId: string;
    }
  | {
      /**
       * Magic University (Conflux): once per turn, choose a School of Magic and
       * discard cards from the top of your deck until you find a Spell of that
       * school, then take it to hand (the discarded cards stay discarded).
       */
      type: "MAGIC_UNIVERSITY";
    }
  | {
      /**
       * Thieves' Guild (Cove): once during your turn, choose any one deck in the
       * game — a shared deck OR any player's Might & Magic deck (your own or an
       * opponent's) — look at its top 2 cards, put one of them on that deck's
       * discard pile and the other back on top of the deck.
       */
      type: "THIEVES_GUILD";
    }
  | {
      /**
       * Bulwark Sieidi / Altar of the Runes (Gamefound Update #3). The Altar is
       * a same-tile upgrade of the Sieidi (prerequisite). Two fields, both read
       * by the Runes engine (src/engine/runes.ts):
       *  - `startingRunes`: extra Runes this player's Hero starts each combat
       *    with. The board's rune buildings are cap-raisers, not pre-chargers, so
       *    this is 0 — the climb to the unlocked level is EARNED by acting (the
       *    City Hall flag is the head-start path).
       *  - `levelCap`: the highest Rune Level reachable in combat while this
       *    building stands. Without any rune building a Bulwark player can still
       *    reach Level 1 (the base faction mechanic); Sieidi unlocks Level 2,
       *    the Altar unlocks Level 3.
       */
      type: "RUNE_ALTAR";
      startingRunes: number;
      levelCap: number;
    }
  | {
      /**
       * Monster Girl Quest: Paradox Spirit Shrine. At combat setup the owner
       * chooses one separately built spirit contract and receives its one-shot
       * round-1 effect. Runtime selection lives in the MGQ mechanics module.
       */
      type: "MGQ_SPIRIT_SHRINE";
    }
  | {
      /** A buildable rung in the Spirit Shrine's HoMM-guild-style ladder. */
      type: "MGQ_SPIRIT_CONTRACT";
      spirit: "sylph" | "gnome" | "undine" | "salamander";
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
  /**
   * Whether a seat may draft/roll and play this faction. Absent = playable.
   * Set `false` for a faction that is registered only for its art/data and is
   * not yet a complete, selectable town (no starting map tile, stub units /
   * buildings / heroes). Such a faction must never enter a real game — it would
   * crash on its missing tile and ship hollow mechanics.
   */
  playable?: boolean;
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

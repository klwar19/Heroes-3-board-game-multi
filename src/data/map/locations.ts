import type { LocationDefinition } from "./types";

const wikiCredit =
  "Effect text from the community rulebook rewrite (All Map Locations) and the fan wiki field pages. Verify against official components before final release.";

function source(slug: string) {
  return {
    product: "Heroes of Might and Magic III: The Board Game",
    credit: wikiCredit,
    url: `https://en.homm3bg.wiki/fields/${slug}/`
  };
}

/**
 * Every field type that appears on the core map tiles, with its visit
 * interaction. Categories follow the rulebook: Visitable fields get a black
 * cube after the visit (then count as empty), Flaggable fields take the
 * visiting player's faction cube, Revisitable fields may be revisited for
 * 1 MP and never receive cubes.
 */
export const locationDefinitions: Record<string, LocationDefinition> = {
  empty_field: {
    id: "empty_field",
    name: "Empty Field",
    category: "empty",
    interaction: { type: "NONE" },
    implementationStatus: "implemented",
    source: source("empty_field")
  },
  blocked_field: {
    id: "blocked_field",
    name: "Blocked Field",
    category: "blocked",
    interaction: { type: "NONE" },
    implementationStatus: "implemented",
    source: source("blocked_field")
  },
  town: {
    id: "town",
    name: "Town",
    category: "town",
    interaction: { type: "TOWN_FLAG" },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: wikiCredit,
      url: "https://en.homm3bg.wiki/towns/"
    }
  },
  random_town: {
    id: "random_town",
    name: "Random Town",
    category: "town",
    interaction: {
      type: "NOT_IMPLEMENTED",
      note: "Random Town (Inferno/Stretch Goals) needs an unused faction, defending packs, walls and gate."
    },
    implementationStatus: "not-implemented",
    source: source("random_town")
  },
  mine: {
    id: "mine",
    name: "Mine",
    category: "flaggable",
    interaction: { type: "MINE_FLAG" },
    implementationStatus: "implemented",
    source: source("mine")
  },
  settlement: {
    id: "settlement",
    name: "Settlement",
    category: "flaggable",
    interaction: { type: "SETTLEMENT_FLAG" },
    implementationStatus: "implemented",
    source: source("settlement")
  },
  resource_symbol: {
    id: "resource_symbol",
    name: "Resources",
    category: "visitable",
    interaction: { type: "ROLL_RESOURCE_DICE", count: 1 },
    implementationStatus: "implemented",
    source: source("resource_symbol")
  },
  treasure_symbol: {
    id: "treasure_symbol",
    name: "Treasure",
    category: "visitable",
    interaction: { type: "ROLL_TREASURE_DICE", count: 1 },
    implementationStatus: "implemented",
    source: source("treasure_symbol")
  },
  artifact_symbol: {
    id: "artifact_symbol",
    name: "Artifact",
    category: "visitable",
    interaction: { type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 2 },
    implementationStatus: "implemented",
    source: source("artifact_symbol")
  },
  windmill: {
    id: "windmill",
    name: "Windmill",
    category: "visitable",
    interaction: { type: "GAIN_RESOURCES", valuables: 1 },
    implementationStatus: "implemented",
    source: source("windmill")
  },
  water_wheel: {
    id: "water_wheel",
    name: "Water Wheel",
    category: "visitable",
    interaction: { type: "GAIN_RESOURCES", gold: 3 },
    implementationStatus: "implemented",
    source: source("water_wheel")
  },
  mystical_garden: {
    id: "mystical_garden",
    name: "Mystical Garden",
    category: "visitable",
    interaction: {
      type: "CHOOSE_ONE",
      options: [
        { label: "Gain 2 gold", interaction: { type: "GAIN_RESOURCES", gold: 2 } },
        { label: "Gain 1 valuables", interaction: { type: "GAIN_RESOURCES", valuables: 1 } }
      ]
    },
    implementationStatus: "implemented",
    source: source("mystical_garden")
  },
  learning_stone: {
    id: "learning_stone",
    name: "Learning Stone",
    category: "visitable",
    interaction: { type: "GAIN_EXPERIENCE", amount: 1 },
    implementationStatus: "implemented",
    source: source("learning_stone")
  },
  tree_of_knowledge: {
    id: "tree_of_knowledge",
    name: "Tree of Knowledge",
    category: "visitable",
    interaction: {
      type: "PAY_TO",
      costOptions: [{ valuables: 3 }, { gold: 10 }],
      interaction: { type: "GAIN_EXPERIENCE", amount: 2 }
    },
    implementationStatus: "implemented",
    source: source("tree_of_knowledge")
  },
  fountain_of_youth: {
    id: "fountain_of_youth",
    name: "Fountain of Youth",
    category: "visitable",
    interaction: {
      type: "SEQUENCE",
      interactions: [
        { type: "GAIN_MORALE", amount: 1 },
        { type: "GAIN_MOVEMENT", amount: 1 }
      ]
    },
    implementationStatus: "implemented",
    source: source("fountain_of_youth")
  },
  temple: {
    id: "temple",
    name: "Temple",
    category: "visitable",
    interaction: { type: "GAIN_MORALE", amount: 1 },
    implementationStatus: "implemented",
    source: source("temple")
  },
  warriors_tomb: {
    id: "warriors_tomb",
    name: "Warrior's Tomb",
    category: "visitable",
    interaction: {
      type: "SEQUENCE",
      interactions: [
        { type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 2, times: 2 },
        { type: "GAIN_MORALE", amount: -2 }
      ]
    },
    implementationStatus: "implemented",
    source: source("warriors_tomb")
  },
  shrine_of_magic_incantation: {
    id: "shrine_of_magic_incantation",
    name: "Shrine of Magic Incantation",
    category: "visitable",
    interaction: { type: "SEARCH_SHARED_DECK", deckId: "spells", count: 2 },
    implementationStatus: "implemented",
    source: source("shrine_of_magic_incantation")
  },
  shrine_of_magic_gesture: {
    id: "shrine_of_magic_gesture",
    name: "Shrine of Magic Gesture",
    category: "visitable",
    interaction: {
      type: "PAY_TO",
      costOptions: [{ gold: 3 }],
      interaction: { type: "SEARCH_SHARED_DECK", deckId: "spells", count: 2 }
    },
    implementationStatus: "implemented",
    source: source("shrine_of_magic_gesture")
  },
  magic_spring: {
    id: "magic_spring",
    name: "Magic Spring",
    category: "visitable",
    interaction: { type: "MAGIC_SPRING" },
    implementationStatus: "implemented",
    source: source("magic_spring")
  },
  witch_hut: {
    id: "witch_hut",
    name: "Witch Hut",
    category: "visitable",
    interaction: { type: "WITCH_HUT" },
    implementationStatus: "implemented",
    source: source("witch_hut")
  },
  scholar: {
    id: "scholar",
    name: "Scholar",
    category: "visitable",
    interaction: { type: "SCHOLAR" },
    implementationStatus: "implemented",
    source: source("scholar")
  },
  redwood_observatory: {
    id: "redwood_observatory",
    name: "Redwood Observatory",
    category: "visitable",
    interaction: { type: "DISCOVER_ADJACENT_TILE" },
    implementationStatus: "implemented",
    source: source("redwood_observatory")
  },
  pandoras_box: {
    id: "pandoras_box",
    name: "Pandora's Box",
    category: "visitable",
    interaction: {
      type: "CHOOSE_ONE",
      options: [
        { label: "Roll 2 Treasure dice, resolve one", interaction: { type: "ROLL_TREASURE_DICE", count: 2 } },
        { label: "Roll 2 Resource dice, resolve one", interaction: { type: "ROLL_RESOURCE_DICE", count: 2 } }
      ]
    },
    implementationStatus: "implemented",
    source: source("pandoras_box")
  },
  stables: {
    id: "stables",
    name: "Stables",
    category: "revisitable",
    interaction: { type: "GAIN_MOVEMENT", amount: 1 },
    implementationStatus: "implemented",
    source: source("stables")
  },
  sanctuary: {
    id: "sanctuary",
    name: "Sanctuary",
    category: "revisitable",
    interaction: { type: "NONE" },
    passive: { protectsFromAttack: true },
    implementationStatus: "implemented",
    source: source("sanctuary")
  },
  trading_post: {
    id: "trading_post",
    name: "Trading Post",
    category: "revisitable",
    interaction: { type: "TRADING_POST" },
    implementationStatus: "implemented",
    source: source("trading_post")
  },
  war_machine_factory: {
    id: "war_machine_factory",
    name: "War Machine Factory",
    category: "revisitable",
    interaction: {
      type: "NOT_IMPLEMENTED",
      note: "War Machine purchases need the war machine price list (Rampart expansion)."
    },
    implementationStatus: "not-implemented",
    source: source("war_machine_factory")
  },
  obelisk: {
    id: "obelisk",
    name: "Obelisk",
    category: "flaggable",
    interaction: {
      type: "NOT_IMPLEMENTED",
      note: "Obelisk effects depend on the Scenario. Flagging works; multiple players may flag the same Obelisk."
    },
    implementationStatus: "not-implemented",
    source: source("obelisk")
  },
  dragon_utopia: {
    id: "dragon_utopia",
    name: "Dragon Utopia",
    category: "flaggable",
    interaction: {
      type: "NOT_IMPLEMENTED",
      note: "Dragon Utopia effects depend on the Scenario."
    },
    implementationStatus: "not-implemented",
    source: source("dragon_utopia")
  },
  grail: {
    id: "grail",
    name: "Grail",
    category: "visitable",
    interaction: {
      type: "NOT_IMPLEMENTED",
      note: "Grail token effects are described per Scenario."
    },
    implementationStatus: "not-implemented",
    source: source("grail")
  },
  star_axis: {
    id: "star_axis",
    name: "Star Axis",
    category: "flaggable",
    interaction: {
      type: "NOT_IMPLEMENTED",
      note: "Star Axis swaps a Statistic card for an Empowered one (Inferno expansion cards not yet in the library)."
    },
    implementationStatus: "not-implemented",
    source: source("star_axis")
  }
};

export const TRADE_RATES: { sell: Partial<Record<"gold" | "buildingMaterials" | "valuables", number>>; buy: Partial<Record<"gold" | "buildingMaterials" | "valuables", number>>; label: string }[] = [
  { sell: { gold: 6 }, buy: { valuables: 1 }, label: "6 gold for 1 valuables" },
  { sell: { gold: 2 }, buy: { buildingMaterials: 1 }, label: "2 gold for 1 building materials" },
  { sell: { valuables: 1 }, buy: { gold: 3 }, label: "1 valuables for 3 gold" },
  { sell: { valuables: 1 }, buy: { buildingMaterials: 2 }, label: "1 valuables for 2 building materials" },
  { sell: { buildingMaterials: 1 }, buy: { gold: 1 }, label: "1 building materials for 1 gold" },
  { sell: { buildingMaterials: 3 }, buy: { valuables: 1 }, label: "3 building materials for 1 valuables" }
];

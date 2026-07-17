import type { LocationDefinition } from "./types";
import { animeLocationDefinitions } from "@/data/anime/locations";

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
    // Defended by an unused faction's Packs (1 bronze, 2 silver, 2 gold);
    // capturing it grants +10 gold income (and 10 gold on the first capture).
    // The defending faction and guards are built in the engine (drawGuardArmy).
    interaction: { type: "NONE" },
    implementationStatus: "implemented",
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
        // HOUSE RULE: the gold branch grants 3 gold (was 2).
        { label: "Gain 3 gold", interaction: { type: "GAIN_RESOURCES", gold: 3 } },
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
    // Wiki (https://en.homm3bg.wiki/fields/fountain_of_youth/): gain a positive
    // Morale token AND +1 movement for this turn.
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
    // Incantation is the PAID shrine: pay 3 gold to Search(2) the Spell deck.
    // The homm3bg wiki swaps the two shrines' costs (it lists the fee under
    // Gesture); the physical board game charges here at Incantation and is free
    // at Gesture, so the two interactions below are the corrected mapping.
    interaction: {
      type: "PAY_TO",
      costOptions: [{ gold: 3 }],
      interaction: { type: "SEARCH_SHARED_DECK", deckId: "spells", count: 2 }
    },
    implementationStatus: "implemented",
    source: source("shrine_of_magic_incantation")
  },
  shrine_of_magic_gesture: {
    id: "shrine_of_magic_gesture",
    name: "Shrine of Magic Gesture",
    category: "visitable",
    // Gesture is the FREE shrine: Search(2) the Spell deck at no cost.
    interaction: { type: "SEARCH_SHARED_DECK", deckId: "spells", count: 2 },
    implementationStatus: "implemented",
    source: source("shrine_of_magic_gesture")
  },
  magic_spring: {
    id: "magic_spring",
    name: "Magic Spring",
    category: "visitable",
    // Wiki (https://en.homm3bg.wiki/fields/magic_spring/): look at the top 3
    // cards of your discard pile and return one to your hand. MAGIC_SPRING is
    // the engine step that runs that discard-recovery logic.
    interaction: { type: "MAGIC_SPRING" },
    implementationStatus: "implemented",
    source: source("magic_spring")
  },
  witch_hut: {
    id: "witch_hut",
    name: "Witch Hut",
    category: "visitable",
    // Rulebook: "Choose one: Remove an Ability card from your hand OR look
    // at the top card of the Ability Deck and put that card into your hand
    // or into the Ability Deck Discard Pile."
    interaction: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Remove an Ability card from your hand",
          interaction: {
            type: "REMOVE_HAND_CARD",
            prompt: "Witch Hut: remove an Ability card",
            filter: "ability",
            then: "none"
          }
        },
        { label: "Look at the top Ability card", interaction: { type: "WITCH_HUT" } }
      ]
    },
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
        { label: "Roll 2 Resource dice, resolve one", interaction: { type: "ROLL_RESOURCE_DICE", count: 2 } },
        // Stretch-goal rule: "you may draw a card from the Pandora's Box
        // deck instead". The option only appears while the deck has cards.
        { label: "Draw a Pandora's Box card", interaction: { type: "DRAW_PANDORA_CARD" } }
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
    interaction: { type: "WAR_MACHINE_SHOP" },
    implementationStatus: "implemented",
    source: source("war_machine_factory")
  },
  obelisk: {
    id: "obelisk",
    name: "Obelisk",
    category: "flaggable",
    // House rule `obelisk-rewards` (BINH default ON; engine: handleObeliskVisit):
    // the first visitor rolls the Attack die and the face is locked on the Field
    // for the rest of the game. Every visitor (any player) flags it and gets the
    // same fixed reward, no reroll — -1: +1 positive morale; 0: Search (2) the
    // Artifact deck; +1: roll one Treasure die and one Resource die. Off: still
    // multi-flaggable, no die reward. Holy Grail always counts first visits
    // toward dig unlock (2 Obelisks), independent of this house rule. The
    // original Scenario puzzle-map reveal is intentionally NOT modelled.
    interaction: { type: "OBELISK" },
    implementationStatus: "implemented",
    source: source("obelisk")
  },
  dragon_utopia: {
    id: "dragon_utopia",
    name: "Dragon Utopia",
    category: "visitable",
    // A Lvl-VII creature bank guarded by four dragons (azure, rust, crystal,
    // faerie). The post-fight behavior is win-condition specific and handled
    // in the engine (handleDragonUtopiaVisit): a Grail Hunt win, a Dragon
    // Conqueror capture, or — in Conquest — 10 gold and a Relic artifact.
    interaction: { type: "NONE" },
    implementationStatus: "implemented",
    source: source("dragon_utopia")
  },
  grail: {
    id: "grail",
    name: "Grail",
    category: "visitable",
    // A Lvl-VII guard. In Grail Hunt the cleared field is dug for 1 MP to gain
    // the single Grail Token, which must be carried home to win; otherwise it
    // is a normal fight rewarding 10 gold and a Relic artifact. Handled in the
    // engine (handleGrailVisit).
    interaction: { type: "NONE" },
    implementationStatus: "implemented",
    source: source("grail")
  },
  star_axis: {
    id: "star_axis",
    name: "Star Axis",
    category: "flaggable",
    // Flaggable (multiple players may keep a cube here). On a player's first
    // visit they may remove a hand Statistic card and gain the Empowered
    // version of the same type. Handled in the engine (handleStarAxisVisit).
    interaction: { type: "STAR_AXIS" },
    implementationStatus: "implemented",
    source: source("star_axis")
  },
  creature_bank: {
    id: "creature_bank",
    name: "Creature Bank",
    category: "visitable",
    // Naval Battles optional rule (rulebook p.66-67, 84-85). A Creature Bank
    // token sits on a Tile's Blocked Field. Entering it starts a Creature Bank
    // Combat (no Field Difficulty: no Quick Combat, no Round limit, no MP to
    // extend, no experience) against the bank's fixed defenders. The specific
    // bank is stored on `field.bankId`; defenders, Stack Tokens and the scaled
    // win reward are resolved in the engine (revealCreatureBankArmy /
    // grantCreatureBankReward). The win reward is granted directly after combat,
    // so the visit itself carries no generic interaction.
    interaction: { type: "NONE" },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Naval Battles Expansion)",
      credit: wikiCredit,
      url: "https://en.homm3bg.wiki/fields/creature-bank/"
    }
  },

  // --- Cove expansion: sea fields -----------------------------------------
  // Effects from the community rulebook's Map Locations appendix and the fan
  // wiki field pages. Sea tiles only enter play through scenarios that
  // enable the Cove / stretch-goal content sets.
  flotsam: {
    id: "flotsam",
    name: "Flotsam",
    category: "visitable",
    interaction: { type: "GAIN_RESOURCES", buildingMaterials: 2 },
    implementationStatus: "implemented",
    source: source("flotsam")
  },
  jetsam: {
    id: "jetsam",
    name: "Jetsam",
    category: "visitable",
    // +1: roll and resolve 2 Resource dice; 0: one die; -1: nothing.
    interaction: {
      type: "ATTACK_DIE_TABLE",
      plus: {
        type: "SEQUENCE",
        interactions: [
          { type: "ROLL_RESOURCE_DICE", count: 1 },
          { type: "ROLL_RESOURCE_DICE", count: 1 }
        ]
      },
      zero: { type: "ROLL_RESOURCE_DICE", count: 1 },
      minus: { type: "NONE" }
    },
    implementationStatus: "implemented",
    source: source("jetsam")
  },
  sea_barrel: {
    id: "sea_barrel",
    name: "Sea Barrel",
    category: "visitable",
    interaction: { type: "ROLL_RESOURCE_DICE", count: 1 },
    implementationStatus: "implemented",
    source: source("sea_barrel")
  },
  sea_chest: {
    id: "sea_chest",
    name: "Sea Chest",
    category: "visitable",
    // +1: Search (1) the Artifact deck; 0: gain 5 gold; -1: nothing.
    interaction: {
      type: "ATTACK_DIE_TABLE",
      plus: { type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 1 },
      zero: { type: "GAIN_RESOURCES", gold: 5 },
      minus: { type: "NONE" }
    },
    implementationStatus: "implemented",
    source: source("sea_chest")
  },
  buoy: {
    id: "buoy",
    name: "Buoy",
    category: "visitable",
    interaction: { type: "GAIN_MORALE", amount: 1 },
    implementationStatus: "implemented",
    source: source("buoy")
  },
  mermaid: {
    id: "mermaid",
    name: "Mermaid",
    category: "visitable",
    interaction: {
      type: "SEQUENCE",
      interactions: [
        { type: "GAIN_MORALE", amount: 1 },
        { type: "GAIN_MOVEMENT", amount: 1 }
      ]
    },
    implementationStatus: "implemented",
    source: source("mermaid")
  },
  shipwreck: {
    id: "shipwreck",
    name: "Shipwreck",
    category: "visitable",
    interaction: {
      type: "SEQUENCE",
      interactions: [
        { type: "ROLL_RESOURCE_DICE", count: 1 },
        { type: "ROLL_RESOURCE_DICE", count: 1 }
      ]
    },
    implementationStatus: "implemented",
    source: source("shipwreck")
  },
  shipwreck_survivor: {
    id: "shipwreck_survivor",
    name: "Shipwreck Survivor",
    category: "visitable",
    interaction: { type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 2 },
    implementationStatus: "implemented",
    source: source("shipwreck_survivor")
  },
  derelict_ship: {
    id: "derelict_ship",
    name: "Derelict Ship",
    category: "visitable",
    // "You may Search (2) the Artifact deck. If you do so, you also gain 2 gold."
    interaction: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: "Search (2) the Artifact deck and gain 2 gold",
          interaction: {
            type: "SEQUENCE",
            interactions: [
              { type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 2 },
              { type: "GAIN_RESOURCES", gold: 2 }
            ]
          }
        },
        { label: "Decline", interaction: { type: "NONE" } }
      ]
    },
    implementationStatus: "implemented",
    source: source("derelict_ship")
  },
  temple_of_the_sea: {
    id: "temple_of_the_sea",
    name: "Temple of the Sea",
    category: "visitable",
    interaction: {
      type: "SEQUENCE",
      interactions: [
        { type: "GAIN_RESOURCES", gold: 10 },
        { type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 2, times: 2 }
      ]
    },
    implementationStatus: "implemented",
    source: source("temple_of_the_sea")
  },
  grave: {
    id: "grave",
    name: "Grave",
    category: "visitable",
    // Rulebook: negative morale, 3 gold and Search (1) Artifacts (the wiki
    // page says Search (2); the rulebook appendix wins).
    interaction: {
      type: "SEQUENCE",
      interactions: [
        { type: "GAIN_MORALE", amount: -1 },
        { type: "GAIN_RESOURCES", gold: 3 },
        { type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 1 }
      ]
    },
    implementationStatus: "implemented",
    source: source("grave")
  },

  // --- Tower expansion ------------------------------------------------------
  university: {
    id: "university",
    name: "University",
    category: "visitable",
    interaction: {
      type: "PAY_TO",
      costOptions: [{ gold: 6 }],
      interaction: { type: "SEARCH_DISCARD", deckId: "abilities", count: 4 }
    },
    implementationStatus: "implemented",
    source: source("university")
  },
  market_of_time: {
    id: "market_of_time",
    name: "Market of Time",
    category: "visitable",
    interaction: {
      type: "REMOVE_HAND_CARD",
      prompt: "Market of Time: remove a card, then search a deck",
      filter: "removable",
      then: "choose-deck-search"
    },
    implementationStatus: "implemented",
    source: source("market_of_time")
  },
  hill_fort: {
    id: "hill_fort",
    name: "Hill Fort",
    category: "visitable",
    interaction: { type: "HILL_FORT" },
    implementationStatus: "implemented",
    source: source("hill_fort")
  },
  library_of_enlightenment: {
    id: "library_of_enlightenment",
    name: "Library of Enlightenment",
    category: "revisitable",
    // Pay 3 gold to remove a Statistic card from hand or discard and gain any
    // Statistic card, up to twice per visit.
    interaction: { type: "LIBRARY_OF_ENLIGHTENMENT" },
    implementationStatus: "implemented",
    source: source("library_of_enlightenment")
  },
  black_market: {
    id: "black_market",
    name: "Black Market",
    category: "revisitable",
    // Browse the top of the Artifact discard pile(s) and buy one — 5 gold
    // Minor, 7 gold Major, 10 gold Relic.
    interaction: { type: "BLACK_MARKET" },
    implementationStatus: "implemented",
    source: source("black_market")
  },
  artifact_dig: {
    id: "artifact_dig",
    name: "Excavation",
    category: "visitable",
    // The Factory "shovel" field: dig up the top Artifact card, then keep it or
    // discard it.
    interaction: { type: "DIG_ARTIFACT" },
    implementationStatus: "implemented",
    source: source("artifact_dig")
  },

  // --- Factory expansion (locations from the Factory rulebook p.7–8) ---------
  // Cross-checked against the Factory rulebook art: Derrick / Prospector /
  // Warlock's Lab / Grave / Watering Hole / Trailblazer / Airship Yard. Timed-
  // event aliases (Derrick≡Water Wheel, Prospector≡Windmill) are documented
  // in the definitions; the engine effects match those equivalents.
  derrick: {
    id: "derrick",
    name: "Derrick",
    category: "visitable",
    // Factory rulebook: Gain 3 gold. For timed events, treat as a Water Wheel.
    interaction: { type: "GAIN_RESOURCES", gold: 3 },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Factory Expansion)",
      credit: "Factory rulebook p.7 — Gain 3 gold; treat as Water Wheel for timed events.",
      url: "https://raw.githubusercontent.com/qwrtln/Homm3BG-FactoryRulebook-build-artifacts/en/main_en.pdf"
    }
  },
  prospector: {
    id: "prospector",
    name: "Prospector",
    category: "visitable",
    // Factory rulebook: Gain 1 valuables. For timed events, treat as a Windmill.
    interaction: { type: "GAIN_RESOURCES", valuables: 1 },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Factory Expansion)",
      credit: "Factory rulebook p.7 — Gain 1 valuables; treat as Windmill for timed events.",
      url: "https://raw.githubusercontent.com/qwrtln/Homm3BG-FactoryRulebook-build-artifacts/en/main_en.pdf"
    }
  },
  warlock_lab: {
    id: "warlock_lab",
    name: "Warlock's Lab",
    category: "visitable",
    // Factory rulebook: Remove 1 card from your hand to gain 1 valuables.
    interaction: {
      type: "REMOVE_HAND_CARD",
      prompt: "Warlock's Lab: remove a card from hand to gain 1 valuables",
      filter: "any",
      then: "gain-valuables"
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Factory Expansion)",
      credit: "Factory rulebook p.7 — Remove 1 card from hand to gain 1 valuables.",
      url: "https://raw.githubusercontent.com/qwrtln/Homm3BG-FactoryRulebook-build-artifacts/en/main_en.pdf"
    }
  },
  factory_grave: {
    id: "factory_grave",
    name: "Grave",
    category: "visitable",
    // Factory rulebook p.7 (distinct from the Cove/wiki Grave): optional pay 1
    // valuables → Search(2) Artifacts and gain positive morale. Cove tiles keep
    // the separate `grave` id (negative morale + 3 gold + Search(1)).
    interaction: {
      type: "PAY_TO",
      costOptions: [{ valuables: 1 }],
      interaction: {
        type: "SEQUENCE",
        interactions: [
          { type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 2 },
          { type: "GAIN_MORALE", amount: 1 }
        ]
      }
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Factory Expansion)",
      credit: "Factory rulebook p.7 — You may pay 1 valuables to Search(2) Artifacts and gain positive morale.",
      url: "https://raw.githubusercontent.com/qwrtln/Homm3BG-FactoryRulebook-build-artifacts/en/main_en.pdf"
    }
  },
  watering_hole: {
    id: "watering_hole",
    name: "Watering Hole",
    category: "revisitable",
    // Factory rulebook p.8: end movement this turn; next turn gain +1 movement
    // for that turn only.
    interaction: { type: "WATERING_HOLE" },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Factory Expansion)",
      credit: "Factory rulebook p.8 — Immediately end your turn upon landing; next turn gain +1 movement for one turn.",
      url: "https://raw.githubusercontent.com/qwrtln/Homm3BG-FactoryRulebook-build-artifacts/en/main_en.pdf"
    }
  },
  trailblazer: {
    id: "trailblazer",
    name: "Trailblazer",
    category: "revisitable",
    // Factory rulebook p.8: Gain 1 movement. It lasts for only one Turn.
    // (Same mechanical effect as Stables; the teepee art is Trailblazer, not Stables.)
    interaction: { type: "GAIN_MOVEMENT", amount: 1 },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Factory Expansion)",
      credit: "Factory rulebook p.8 — Gain 1 movement for one turn (teepee art).",
      url: "https://raw.githubusercontent.com/qwrtln/Homm3BG-FactoryRulebook-build-artifacts/en/main_en.pdf"
    }
  },
  airship_yard: {
    id: "airship_yard",
    name: "Airship Yard",
    category: "revisitable",
    // Factory rulebook p.8: pay 3 gold → gain 2 movement; this turn may move
    // through blocked fields (never end movement on them).
    interaction: {
      type: "PAY_TO",
      costOptions: [{ gold: 3 }],
      interaction: {
        type: "SEQUENCE",
        interactions: [
          { type: "GAIN_MOVEMENT", amount: 2 },
          { type: "GRANT_MOVE_THROUGH" }
        ]
      }
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game (Factory Expansion)",
      credit: "Factory rulebook p.8 — Pay 3 gold to gain 2 movement and move through blocked fields this turn.",
      url: "https://raw.githubusercontent.com/qwrtln/Homm3BG-FactoryRulebook-build-artifacts/en/main_en.pdf"
    }
  },
  tavern: {
    id: "tavern",
    name: "Tavern",
    category: "revisitable",
    // "You can pay 7 gold to gain a Secondary Hero. Place their model on this
    // Field. Then, choose one enemy player to discard 1 random card from their
    // hand." Only available while you do not already field a Secondary Hero.
    interaction: { type: "TAVERN" },
    implementationStatus: "implemented",
    source: source("tavern")
  },
  prison: {
    id: "prison",
    name: "Prison",
    category: "visitable",
    // "Gain a Secondary Hero. Place their model on this Field. If you already
    // have a Secondary Hero, gain 3 gold instead."
    interaction: { type: "PRISON" },
    implementationStatus: "implemented",
    source: source("prison")
  },

  // --- Conflux expansion ----------------------------------------------------
  faerie_ring: {
    id: "faerie_ring",
    name: "Faerie Ring",
    category: "visitable",
    interaction: {
      type: "REMOVE_HAND_CARD",
      prompt: "Faerie Ring: remove a card, then search its deck",
      filter: "removable",
      then: "search-same-deck"
    },
    implementationStatus: "implemented",
    source: source("faerie_ring")
  },
  elemental_conflux: {
    id: "elemental_conflux",
    name: "Elemental Conflux",
    category: "visitable",
    // For every Dwelling (unlocked recruit tier) you have, an Elementals card
    // from that Neutral deck is offered to recruit; pick one or decline.
    interaction: { type: "ELEMENTAL_CONFLUX" },
    implementationStatus: "implemented",
    source: source("elemental_conflux")
  },

  // --- Stronghold expansion ---------------------------------------------------
  spell_scroll: {
    id: "spell_scroll",
    name: "Spell Scroll",
    category: "visitable",
    interaction: { type: "SPELL_SCROLL" },
    implementationStatus: "implemented",
    source: source("spell_scroll")
  },
  cyclops_stockpile: {
    id: "cyclops_stockpile",
    name: "Cyclops Stockpile",
    category: "visitable",
    // Reward per the wiki field page (https://en.homm3bg.wiki/fields/cyclops_stockpile/,
    // verbatim "roll and resolve 4 Resource dice"): four RESOURCE dice, each
    // resolved (a SEQUENCE of count:1, NOT count:2 — every die is gained, the
    // player does not pick one). A Resource die only ever yields resources, so —
    // unlike a Treasure die — this reward can never grant experience or an
    // Artifact search. (It previously rolled Treasure dice, which inflated the
    // reward with the experience/artifact faces; corrected to match the wiki and
    // the original HOMM3 Cyclops Stockpile, which drops only resources.) The
    // guard override (two golden Cyclopes added to the Neutral Army) is enforced
    // in the engine's guard-army builder (drawGuardArmy).
    interaction: {
      type: "SEQUENCE",
      interactions: [
        { type: "ROLL_RESOURCE_DICE", count: 1 },
        { type: "ROLL_RESOURCE_DICE", count: 1 },
        { type: "ROLL_RESOURCE_DICE", count: 1 },
        { type: "ROLL_RESOURCE_DICE", count: 1 }
      ]
    },
    implementationStatus: "implemented",
    source: source("cyclops_stockpile")
  },
  monolith: {
    id: "monolith",
    name: "Two-Way Monolith",
    // "Move your Hero to the corresponding Two-Way Monolith" (rulebook p.83,
    // category Revisitable). "revisitable" gives both halves of the printed
    // behaviour: movement always STOPS on the token (entering it teleports, so
    // it can never be walked through), and a hero standing on it may pay 1 MP
    // to travel again (the Revisit action). The teleport itself resolves in the
    // TOKEN_TELEPORT visit step; with fewer than 2 Monoliths on the map the
    // step is a no-op ("must have at least 2 to work").
    category: "revisitable",
    interaction: { type: "TOKEN_TELEPORT", token: "monolith" },
    implementationStatus: "implemented",
    source: source("two-way_monolith")
  },
  gate: {
    id: "gate",
    name: "Colored Gate",
    // Map-designer object (rulebook p.83, "corresponding Two-Way Monolith" read
    // as EXACT colored pairs). Entering (or Revisiting for 1 MP, like a Monolith)
    // teleports the hero to THE OTHER gate of the same colored pair — never a
    // choice, never another pair. The pair (1 red / 2 blue / 3 green / 4 yellow)
    // lives on the field (`MapFieldState.gatePair`), so one location serves all
    // four pairs. "revisitable" gives the always-STOP + pay-1-MP-to-re-travel
    // behaviour; the travel itself resolves in the GATE_TELEPORT visit step, a
    // no-op ("pair leads nowhere") until the pair's second gate is on the map.
    // Gates do NOT join the generic Monolith/Whirlpool network.
    category: "revisitable",
    interaction: { type: "GATE_TELEPORT" },
    implementationStatus: "implemented",
    source: source("two-way_monolith")
  },
  whirlpool: {
    id: "whirlpool",
    name: "Whirlpool",
    // "Move your Hero to another Whirlpool Token. If there are 3 Whirlpools,
    // roll an Attack Die to determine where your Hero goes, and reroll any Die
    // that shows the number of the Whirlpool your Hero is moving from. After
    // each Whirlpool travel, lose 1 unit from your unit Deck." (p.83, category
    // Revisitable). The printed tokens are numbered with the Attack-die faces
    // (-1 / 0 / +1) — `MapFieldState.whirlpoolNumber` carries the number.
    category: "revisitable",
    interaction: { type: "TOKEN_TELEPORT", token: "whirlpool" },
    implementationStatus: "implemented",
    source: source("whirlpool")
  },
  subterranean_gate: {
    id: "subterranean_gate",
    name: "Subterranean Gate",
    // "Otherwise treat a Subterranean Gate Token as an empty Field": the gate is
    // a free, walk-through field, not a stop. Its only effect — discovering the
    // tile on the other layer for free — fires automatically when a Hero ENTERS
    // it (beginFieldVisit runs the SUBTERRANEAN_GATE step on every arrival,
    // including the open empty fields), so the category stays "empty".
    category: "empty",
    interaction: { type: "SUBTERRANEAN_GATE" },
    implementationStatus: "implemented",
    source: source("subterranean_gate")
  },
  // Anime mod (Ninefold Realms) single-hex locations — always registered so a
  // Field Override carve resolves; placement is gated by anime.fieldOverrides.
  ...animeLocationDefinitions
};

/**
 * Market fields: a hero standing here may open the trade/shop panel for free,
 * any number of times, while parked (the panel itself keeps the rulebook's
 * one-action-per-visit rule). Both share the in-game Market panel UI.
 */
export const MARKET_LOCATION_IDS = ["trading_post", "war_machine_factory"] as const;

export function isMarketLocation(locationId: string | undefined): boolean {
  return locationId !== undefined && (MARKET_LOCATION_IDS as readonly string[]).includes(locationId);
}

export const TRADE_RATES: { sell: Partial<Record<"gold" | "buildingMaterials" | "valuables", number>>; buy: Partial<Record<"gold" | "buildingMaterials" | "valuables", number>>; label: string }[] = [
  { sell: { gold: 6 }, buy: { valuables: 1 }, label: "6 gold for 1 valuables" },
  { sell: { gold: 2 }, buy: { buildingMaterials: 1 }, label: "2 gold for 1 building materials" },
  { sell: { valuables: 1 }, buy: { gold: 3 }, label: "1 valuables for 3 gold" },
  { sell: { valuables: 1 }, buy: { buildingMaterials: 2 }, label: "1 valuables for 2 building materials" },
  { sell: { buildingMaterials: 1 }, buy: { gold: 1 }, label: "1 building materials for 1 gold" },
  { sell: { buildingMaterials: 3 }, buy: { valuables: 1 }, label: "3 building materials for 1 valuables" }
];

/**
 * The gold a single unit of `resource` fetches at the Trading Post — the market
 * sell rate for "1 <resource> → N gold". Single source of truth for any system
 * that converts a non-gold resource into gold value (e.g. the Freelancer's
 * Guild paying a unit's gold cost with materials/valuables at market rates).
 * Returns 1 (a 1:1 fallback) if the market has no such direct rate.
 */
export function marketGoldValueOf(resource: "buildingMaterials" | "valuables"): number {
  for (const rate of TRADE_RATES) {
    const sellKeys = Object.keys(rate.sell);
    if (sellKeys.length === 1 && rate.sell[resource] === 1 && typeof rate.buy.gold === "number") {
      return rate.buy.gold;
    }
  }
  return 1;
}

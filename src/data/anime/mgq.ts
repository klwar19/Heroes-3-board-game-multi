import type {
  FactionDefinition,
  HeroDefinition,
  TownBuildingDefinition,
  TownBuildingEffect,
  UnitDefinition,
  UnitSideDefinition,
  UnitTier
} from "@/data/factions/types";
import type { UnitType } from "@/engine/state";

/**
 * Monster Girl Quest: Paradox town data.
 *
 * Character provenance comes from the community companion catalog below. The
 * board-game stats, prices and ability conversions are the explicit MGQ town
 * contract supplied for this project; they are not inferred from RPG numbers.
 */
const source = {
  product: "Monster Girl Quest: Paradox RPG ﾃ・Heroes III Board Game adaptation",
  credit:
    "Monster Girl Quest character identities and races are credited to the MGQ community wiki. Board-game stats and mechanics are original conversion data supplied for this project.",
  url: "https://mgq.miraheze.org/wiki/Companions"
} as const;

type MgqCardTier = Exclude<UnitTier, "azure">;
type MgqSideStats = {
  attack: number;
  defense: number;
  health: number;
  initiative: number;
  gold: number;
  buildingMaterials?: number;
  valuables?: number;
};

const mgqCard = (tier: MgqCardTier, slug: string, face: "few" | "pack") =>
  `/assets/anime/units/mgq/units-mgq-${tier === "gold" ? "golden" : tier}-${slug}-${face}.webp`;

function mgqSide(
  tier: MgqCardTier,
  slug: string,
  face: "few" | "pack",
  stats: MgqSideStats,
  abilities: string[] = [],
  abilityText?: string
): UnitSideDefinition {
  return {
    attack: stats.attack,
    defense: stats.defense,
    health: stats.health,
    initiative: stats.initiative,
    cost: {
      gold: stats.gold,
      ...(stats.buildingMaterials ? { buildingMaterials: stats.buildingMaterials } : {}),
      ...(stats.valuables ? { valuables: stats.valuables } : {})
    },
    abilities,
    ...(abilityText ? { abilityText } : {}),
    cardImage: mgqCard(tier, slug, face)
  };
}

function mgqUnit(
  slug: string,
  name: string,
  tier: MgqCardTier,
  type: UnitType,
  few: UnitSideDefinition,
  pack: UnitSideDefinition
): UnitDefinition {
  return {
    id: `mgq.${slug}`,
    name,
    faction: "mgq",
    tier,
    type,
    few,
    pack,
    wikiUrl: source.url,
    source
  };
}

/** New ability ids whose effects are wired by the MGQ mechanics module. */
export const MGQ_NEW_ABILITY_IDS = [
  "mgq-pack-dig",
  "mgq-trance-pollen",
  "mgq-white-magic",
  "mgq-wild-hair",
  "mgq-devour",
  "mgq-confusion-club",
  "mgq-nightmares-embrace",
  "mgq-sleep-toxin",
  "mgq-slow-weave",
  "mgq-reaper-scythe",
  "mgq-slimed",
  "mgq-flower-fragrance",
  "mgq-love-arrow",
  "mgq-web-the-field",
  "mgq-sparkle",
  "mgq-lisa-growth",
  "mgq-maiden-certain-paralysis",
  "mgq-giga-regeneration",
  "mgq-carmilla-life-drain",
  "mgq-jessie-spear-wall",
  "mgq-undine-heal-1",
  "mgq-undine-heal-2"
] as const;

/** At game setup the MGQ Gold Contract exposes exactly three of its eight Gold cards. */
export const MGQ_GOLD_CONTRACT_PICK_COUNT = 3;

export const MGQ_UNIT_ORDER = [
  // Bronze (8)
  "mgq.pochi",
  "mgq.shesta",
  "mgq.gigi",
  "mgq.kamuro_kitsu",
  "mgq.fleesia",
  "mgq.sofia",
  "mgq.miyabi",
  "mgq.eater",
  // Silver (13)
  "mgq.hild",
  "mgq.chrome_frederica",
  "mgq.shizuku",
  "mgq.regina",
  "mgq.maiden",
  "mgq.seraphy",
  "mgq.lisa",
  "mgq.tama",
  "mgq.maya",
  "mgq.matis",
  "mgq.ooma",
  "mgq.jessie",
  "mgq.aria",
  // Gold (8)
  "mgq.carmilla",
  "mgq.giga",
  "mgq.lucretia",
  "mgq.cupi",
  "mgq.sphinx",
  "mgq.lucifina_chan",
  "mgq.spider_princess",
  "mgq.emily"
] as const;

const spiritCard = (slug: string, face: "few" | "pack") =>
  `/assets/anime/units/mgq/units-mgq-spirit-${slug}-${face}.webp`;

function spiritSide(
  slug: string,
  face: "few" | "pack",
  stats: Pick<UnitSideDefinition, "attack" | "defense" | "health" | "initiative">,
  abilities: string[],
  abilityText: string
): UnitSideDefinition {
  return { ...stats, cost: {}, abilities, abilityText, cardImage: spiritCard(slug, face) };
}

function spiritUnit(
  slug: string,
  name: string,
  type: UnitType,
  few: UnitSideDefinition,
  pack: UnitSideDefinition,
  wikiUrl: string
): UnitDefinition {
  return {
    id: `mgq.spirit_${slug}`,
    name,
    faction: "mgq",
    tier: "bronze",
    type,
    summonOnly: true,
    few,
    pack,
    wikiUrl,
    source: { ...source, url: wikiUrl }
  };
}

export const mgqUnitDefinitions: Record<string, UnitDefinition> = {
  "mgq.spirit_sylph": spiritUnit(
    "sylph",
    "Sylph",
    "flying",
    spiritSide("sylph", "few", { attack: 1, defense: 0, health: 3, initiative: 8 }, ["elemental-damage", "ignores-retaliation"], "Deals elemental damage. Sylph's attacks do not provoke Retaliation."),
    spiritSide("sylph", "pack", { attack: 2, defense: 0, health: 5, initiative: 15 }, ["elemental-damage", "ignores-retaliation"], "Deals elemental damage; no Retaliation. Your other troops gain +1 Initiative."),
    "https://mgq.miraheze.org/wiki/Sylph/Companion"
  ),
  "mgq.spirit_gnome": spiritUnit(
    "gnome",
    "Gnome",
    "ground",
    spiritSide("gnome", "few", { attack: 2, defense: 2, health: 2, initiative: 4 }, ["commander-defense-token"], "Always treated as having a Defense token: roll the Defend die when attacked."),
    spiritSide("gnome", "pack", { attack: 3, defense: 2, health: 4, initiative: 5 }, ["commander-defense-token", "halberdier-defense-aura"], "Always rolls the Defend die. Adjacent friendly units are treated as having a Defense token."),
    "https://mgq.miraheze.org/wiki/Gnome/Companion"
  ),
  "mgq.spirit_undine": spiritUnit(
    "undine",
    "Undine",
    "ground",
    spiritSide("undine", "few", { attack: 2, defense: 0, health: 4, initiative: 5 }, ["mgq-undine-heal-1"], "Before moving, heal 1 damage from another friendly unit."),
    spiritSide("undine", "pack", { attack: 3, defense: 0, health: 7, initiative: 6 }, ["mgq-undine-heal-2", "water-elemental-immunity"], "Before moving, heal 2 damage from another friendly unit. Immune to Magic Arrow and Water Magic spells."),
    "https://mgq.miraheze.org/wiki/Undine/Companion"
  ),
  "mgq.spirit_salamander": spiritUnit(
    "salamander",
    "Salamander",
    "ground",
    spiritSide("salamander", "few", { attack: 3, defense: 1, health: 3, initiative: 6 }, ["champion-reroll-minus"], "Reroll every -1 rolled by Salamander."),
    spiritSide("salamander", "pack", { attack: 4, defense: 1, health: 4, initiative: 7 }, ["champion-roll-two-dice", "champion-reroll-minus"], "On attacks, roll 2 Attack dice and apply both results. Reroll every -1."),
    "https://mgq.miraheze.org/wiki/Salamander/Companion"
  ),
  "mgq.pochi": mgqUnit(
    "pochi",
    "Pochi",
    "bronze",
    "ground",
    mgqSide("bronze", "pochi", "few", { attack: 2, defense: 0, health: 2, initiative: 6, gold: 2 }),
    mgqSide(
      "bronze",
      "pochi",
      "pack",
      { attack: 2, defense: 0, health: 3, initiative: 8, gold: 2 },
      ["mgq-pack-dig"],
      "Pack Dig — after moving or while stationary, instead of attacking place an obstacle in an adjacent empty cell."
    )
  ),
  "mgq.shesta": mgqUnit(
    "shesta",
    "Shesta",
    "bronze",
    "ground",
    mgqSide("bronze", "shesta", "few", { attack: 2, defense: 0, health: 3, initiative: 5, gold: 3 }),
    mgqSide(
      "bronze",
      "shesta",
      "pack",
      { attack: 3, defense: 0, health: 4, initiative: 6, gold: 5 },
      ["heavenly-demon-blood-siphon"],
      "Blood Siphon — after her own attack deals damage, heal 1 damage from Shesta."
    )
  ),
  "mgq.gigi": mgqUnit(
    "gigi",
    "Gigi",
    "bronze",
    "ground",
    mgqSide(
      "bronze",
      "gigi",
      "few",
      { attack: 2, defense: 1, health: 3, initiative: 4, gold: 3 },
      ["unlimited-retaliation"],
      "Counter-Discharge — may retaliate more than once each combat round."
    ),
    mgqSide(
      "bronze",
      "gigi",
      "pack",
      { attack: 3, defense: 1, health: 3, initiative: 5, gold: 5 },
      ["unlimited-retaliation"],
      "Counter-Discharge — may retaliate more than once each combat round."
    )
  ),
  "mgq.kamuro_kitsu": mgqUnit(
    "kamuro_kitsu",
    "Kamuro & Kitsu",
    "bronze",
    "ground",
    mgqSide(
      "bronze",
      "kamuro-kitsu",
      "few",
      { attack: 2, defense: 0, health: 4, initiative: 7, gold: 4 },
      ["teleport-move"],
      "Kitsu's Ninja Step — as a move, place this unit on any empty combat cell."
    ),
    mgqSide(
      "bronze",
      "kamuro-kitsu",
      "pack",
      { attack: 3, defense: 0, health: 4, initiative: 8, gold: 6 },
      ["teleport-move", "mgq-white-magic"],
      "Fox Duo — teleport-move; Kamuro's Taoism heals 1 damage from an adjacent ally or grants +1 Attack this round."
    )
  ),
  "mgq.fleesia": mgqUnit(
    "fleesia",
    "Fleesia",
    "bronze",
    "ground",
    mgqSide("bronze", "fleesia", "few", { attack: 2, defense: 1, health: 3, initiative: 3, gold: 2 }),
    mgqSide(
      "bronze",
      "fleesia",
      "pack",
      { attack: 2, defense: 2, health: 3, initiative: 4, gold: 4 },
      ["mgq-trance-pollen"],
      'Trance Pollen — a "+1" on Fleesia\'s Attack die also places 1 Temptation token on the target.'
    )
  ),
  "mgq.sofia": mgqUnit(
    "sofia",
    "Sofia",
    "bronze",
    "ground",
    mgqSide("bronze", "sofia", "few", { attack: 2, defense: 1, health: 3, initiative: 4, gold: 3 }),
    mgqSide(
      "bronze",
      "sofia",
      "pack",
      { attack: 3, defense: 1, health: 3, initiative: 5, gold: 5 },
      ["mgq-white-magic"],
      "White Magic — [activation] heal 1 damage from an adjacent ally or give that ally +1 Attack this round."
    )
  ),
  "mgq.miyabi": mgqUnit(
    "miyabi",
    "Miyabi",
    "bronze",
    "flying",
    mgqSide("bronze", "miyabi", "few", { attack: 2, defense: 1, health: 3, initiative: 4, gold: 1 }),
    mgqSide(
      "bronze",
      "miyabi",
      "pack",
      { attack: 3, defense: 1, health: 3, initiative: 5, gold: 5 },
      ["mgq-wild-hair"],
      "Wild Hair — +1 Attack while this side has any damage."
    )
  ),
  "mgq.eater": mgqUnit(
    "eater",
    "Eater",
    "bronze",
    "ground",
    mgqSide("bronze", "eater", "few", { attack: 2, defense: 1, health: 4, initiative: 2, gold: 3 }),
    mgqSide(
      "bronze",
      "eater",
      "pack",
      { attack: 3, defense: 1, health: 4, initiative: 3, gold: 6 },
      ["mgq-devour"],
      "Devour — when Eater's attack removes a Paralyzed or Tempted side, heal Eater to full."
    )
  ),

  "mgq.hild": mgqUnit(
    "hild",
    "Hild",
    "silver",
    "ranged",
    mgqSide(
      "silver",
      "hild",
      "few",
      { attack: 3, defense: 1, health: 4, initiative: 6, gold: 7 },
      ["ignore-combat-penalties"],
      "God's Eye — ignores the ranged penalty for attacking an adjacent unit."
    ),
    mgqSide(
      "silver",
      "hild",
      "pack",
      { attack: 4, defense: 1, health: 7, initiative: 10, gold: 7, valuables: 1 },
      ["ignore-combat-penalties", "attack-roll-advantage"],
      "God's Eye — ignores the adjacent ranged penalty and rolls two Attack dice, resolving the higher result."
    )
  ),
  "mgq.chrome_frederica": mgqUnit(
    "chrome_frederica",
    "Chrome & Frederica",
    "silver",
    "ground",
    mgqSide(
      "silver",
      "chrome-frederica",
      "few",
      { attack: 3, defense: 1, health: 5, initiative: 4, gold: 7 },
      ["phoenix-rebirth"],
      "Masterpiece Rebuilt — once per combat, Chrome re-stitches Frederica when this side would fall."
    ),
    mgqSide(
      "silver",
      "chrome-frederica",
      "pack",
      { attack: 4, defense: 1, health: 5, initiative: 5, gold: 11 },
      ["phoenix-rebirth"],
      "Masterpiece Rebuilt — once per combat, Chrome re-stitches Frederica when this side would fall."
    )
  ),
  "mgq.shizuku": mgqUnit(
    "shizuku",
    "Shizuku",
    "silver",
    "ground",
    mgqSide("silver", "shizuku", "few", { attack: 4, defense: 1, health: 5, initiative: 4, gold: 8 }),
    mgqSide(
      "silver",
      "shizuku",
      "pack",
      { attack: 5, defense: 1, health: 5, initiative: 5, gold: 13 },
      ["mgq-confusion-club"],
      'Confusion Club — a "+1" on Shizuku\'s Attack die also places a Weakness token on the target.'
    )
  ),
  "mgq.regina": mgqUnit(
    "regina",
    "Regina",
    "silver",
    "ground",
    mgqSide("silver", "regina", "few", { attack: 3, defense: 2, health: 4, initiative: 5, gold: 6 }),
    mgqSide(
      "silver",
      "regina",
      "pack",
      { attack: 4, defense: 2, health: 4, initiative: 6, gold: 11 },
      ["attack-die-reroll"],
      'Swordmaster — reroll every "0" on Regina\'s Attack die.'
    )
  ),
  "mgq.maiden": mgqUnit(
    "maiden",
    "Maiden",
    "silver",
    "ground",
    mgqSide(
      "silver",
      "maiden",
      "few",
      { attack: 3, defense: 1, health: 5, initiative: 5, gold: 7 },
      ["mgq-nightmares-embrace", "reduce-spell-and-specialty-damage-1"],
      'Nightmare\'s Embrace — a "+1" on Maiden\'s Attack die Paralyzes the target. Dream Ward — reduces Spell and Specialty damage taken by 1 (minimum 0).'
    ),
    mgqSide(
      "silver",
      "maiden",
      "pack",
      { attack: 4, defense: 1, health: 5, initiative: 6, gold: 10 },
      ["mgq-maiden-certain-paralysis", "reduce-spell-and-specialty-damage-1"],
      "Nightmare's Embrace — after Maiden attacks, Paralyze the target. Dream Ward — reduces Spell and Specialty damage taken by 1 (minimum 0)."
    )
  ),
  "mgq.seraphy": mgqUnit(
    "seraphy",
    "Seraphy",
    "silver",
    "ground",
    mgqSide("silver", "seraphy", "few", { attack: 3, defense: 1, health: 4, initiative: 5, gold: 5 }),
    mgqSide(
      "silver",
      "seraphy",
      "pack",
      { attack: 4, defense: 1, health: 4, initiative: 6, gold: 7 },
      ["mgq-sleep-toxin"],
      "Sleep Toxin — after Seraphy's own attack deals damage, place 1 Temptation token on the target."
    )
  ),
  "mgq.lisa": mgqUnit(
    "lisa",
    "Lisa",
    "silver",
    "flying",
    mgqSide(
      "silver",
      "lisa",
      "few",
      { attack: 3, defense: 1, health: 4, initiative: 6, gold: 5, buildingMaterials: 1 },
      ["mgq-lisa-growth"],
      "Soul Growth — when Lisa reduces a unit side or stack layer to 0 HP, she permanently gains +1 maximum Health (maximum +2)."
    ),
    mgqSide(
      "silver",
      "lisa",
      "pack",
      { attack: 3, defense: 1, health: 4, initiative: 7, gold: 6, buildingMaterials: 1 },
      ["mgq-lisa-growth", "ignores-retaliation"],
      "Soul Growth — gain permanent +1 maximum Health after reducing a side or stack layer to 0 HP (maximum +2); attacks provoke no Retaliation."
    )
  ),
  "mgq.tama": mgqUnit(
    "tama",
    "Tama",
    "silver",
    "ground",
    mgqSide("silver", "tama", "few", { attack: 3, defense: 0, health: 6, initiative: 7, gold: 7 }),
    mgqSide(
      "silver",
      "tama",
      "pack",
      { attack: 4, defense: 0, health: 6, initiative: 12, gold: 11 },
      ["dread-knight-death-blow"],
      'Critical Claws — a "0" or "+1" on Tama\'s Attack die adds another +1 Attack.'
    )
  ),
  "mgq.maya": mgqUnit(
    "maya",
    "Maya",
    "silver",
    "ranged",
    mgqSide("silver", "maya", "few", { attack: 3, defense: 1, health: 4, initiative: 5, gold: 7 }),
    mgqSide(
      "silver",
      "maya",
      "pack",
      { attack: 4, defense: 1, health: 4, initiative: 6, gold: 10 },
      ["mgq-slow-weave"],
      "Slow Weave — after Maya's attack hits, the target loses 1 Initiative for the current round."
    )
  ),
  "mgq.matis": mgqUnit(
    "matis",
    "Matis",
    "silver",
    "ground",
    mgqSide(
      "silver",
      "matis",
      "few",
      { attack: 3, defense: 1, health: 6, initiative: 6, gold: 8 },
      ["mgq-reaper-scythe"],
      "Reaper Scythe — +2 Attack against Paralyzed, Weakened or Tempted targets."
    ),
    mgqSide(
      "silver",
      "matis",
      "pack",
      { attack: 4, defense: 1, health: 6, initiative: 7, gold: 12 },
      ["mgq-reaper-scythe"],
      "Reaper Scythe — +2 Attack against Paralyzed, Weakened or Tempted targets."
    )
  ),
  "mgq.ooma": mgqUnit(
    "ooma",
    "Ooma",
    "silver",
    "ground",
    mgqSide("silver", "ooma", "few", { attack: 3, defense: 1, health: 5, initiative: 4, gold: 7 }),
    mgqSide(
      "silver",
      "ooma",
      "pack",
      { attack: 4, defense: 1, health: 5, initiative: 5, gold: 11 },
      ["mgq-slimed"],
      "Slimed — after Ooma's own attack deals damage, place 1 Corrosion token on the target (-1 Defense)."
    )
  ),
  "mgq.jessie": mgqUnit(
    "jessie",
    "Jessie",
    "silver",
    "ground",
    mgqSide("silver", "jessie", "few", { attack: 4, defense: 2, health: 5, initiative: 5, gold: 8 }),
    mgqSide(
      "silver",
      "jessie",
      "pack",
      { attack: 5, defense: 2, health: 6, initiative: 7, gold: 12, valuables: 1 },
      ["mgq-jessie-spear-wall"],
      "Spear Wall — attack the first unit normally, then deal 2 damage to the unit directly behind it."
    )
  ),
  "mgq.aria": mgqUnit(
    "aria",
    "Aria",
    "silver",
    "ground",
    mgqSide(
      "silver",
      "aria",
      "few",
      { attack: 3, defense: 2, health: 5, initiative: 4, gold: 7 },
      ["mgq-flower-fragrance"],
      "Flower Fragrance — Aria's Retaliation Attacks place 1 Temptation token on their target."
    ),
    mgqSide(
      "silver",
      "aria",
      "pack",
      { attack: 4, defense: 2, health: 5, initiative: 5, gold: 13 },
      ["mgq-flower-fragrance", "unlimited-retaliation"],
      "Flower Fragrance — Retaliation Attacks place Temptation; Aria may retaliate without a round limit."
    )
  ),

  "mgq.carmilla": mgqUnit(
    "carmilla",
    "Carmilla",
    "gold",
    "ground",
    mgqSide(
      "gold",
      "carmilla",
      "few",
      { attack: 5, defense: 2, health: 7, initiative: 8, gold: 13, valuables: 1 },
      ["mgq-carmilla-life-drain"],
      "Vampire Life-Drain — after Carmilla's attack deals damage, heal her by the amount of damage dealt."
    ),
    mgqSide(
      "gold",
      "carmilla",
      "pack",
      { attack: 6, defense: 2, health: 7, initiative: 9, gold: 21, valuables: 1 },
      ["mgq-carmilla-life-drain", "ignores-retaliation"],
      "Vampire Life-Drain — heal Carmilla by the damage her attack deals; her attacks do not provoke Retaliation."
    )
  ),
  "mgq.giga": mgqUnit(
    "giga",
    "Giga",
    "gold",
    "ground",
    mgqSide(
      "gold",
      "giga",
      "few",
      { attack: 5, defense: 2, health: 8, initiative: 5, gold: 14, valuables: 1 },
      ["mgq-giga-regeneration", "dragon-line-attack-2"],
      "Regeneration — heal 2 damage at the start of each activation. Leviathan Sweep hits behind the target at Attack 2."
    ),
    mgqSide(
      "gold",
      "giga",
      "pack",
      { attack: 6, defense: 2, health: 9, initiative: 6, gold: 20, valuables: 1 },
      ["mgq-giga-regeneration", "dragon-line-attack-3"],
      "Regeneration — heal 2 damage at the start of each activation. Leviathan Sweep hits behind the target at Attack 3."
    )
  ),
  "mgq.lucretia": mgqUnit(
    "lucretia",
    "Lucretia",
    "gold",
    "flying",
    mgqSide(
      "gold",
      "lucretia",
      "few",
      { attack: 5, defense: 2, health: 6, initiative: 10, gold: 13 },
      ["harpy-return"],
      "Queen Harpy — after attacking, Lucretia may return to the cell she attacked from."
    ),
    mgqSide(
      "gold",
      "lucretia",
      "pack",
      { attack: 6, defense: 2, health: 7, initiative: 12, gold: 21, valuables: 1 },
      ["harpy-return", "kansen-fleet-formation"],
      "War Dance — strike and return; adjacent allies gain +1 Attack on their own attacks."
    )
  ),
  "mgq.cupi": mgqUnit(
    "cupi",
    "Cupi",
    "gold",
    "ranged",
    mgqSide(
      "gold",
      "cupi",
      "few",
      { attack: 5, defense: 1, health: 6, initiative: 9, gold: 11 },
      ["teleport-move", "mgq-love-arrow"],
      'Flying Love Arrow — move to any empty cell; a "+1" places 2 Temptation tokens on the target.'
    ),
    mgqSide(
      "gold",
      "cupi",
      "pack",
      { attack: 6, defense: 1, health: 6, initiative: 11, gold: 17, valuables: 1 },
      ["teleport-move", "mgq-love-arrow"],
      'Flying Love Arrow — move to any empty cell; a "+1" places 2 Temptation tokens on the target.'
    )
  ),
  "mgq.sphinx": mgqUnit(
    "sphinx",
    "Sphinx",
    "gold",
    "ground",
    mgqSide(
      "gold",
      "sphinx",
      "few",
      { attack: 5, defense: 3, health: 8, initiative: 7, gold: 20, valuables: 1 },
      ["boss-fear"],
      "Riddle of the Sphinx — while Sphinx stands, the enemy cannot use Morale."
    ),
    mgqSide(
      "gold",
      "sphinx",
      "pack",
      { attack: 6, defense: 3, health: 8, initiative: 8, gold: 29, valuables: 2 },
      ["boss-fear"],
      "Riddle of the Sphinx — while Sphinx stands, the enemy cannot use Morale."
    )
  ),
  "mgq.lucifina_chan": mgqUnit(
    "lucifina_chan",
    "Lucifina-chan",
    "gold",
    "flying",
    mgqSide(
      "gold",
      "lucifina-chan",
      "few",
      { attack: 5, defense: 3, health: 7, initiative: 10, gold: 14, valuables: 1 },
      ["archangel-combat-start-draw"],
      "Seraphic Insight — draw 1 card when combat begins."
    ),
    mgqSide(
      "gold",
      "lucifina-chan",
      "pack",
      { attack: 6, defense: 3, health: 7, initiative: 12, gold: 22, valuables: 2 },
      ["archangel-lethal-save"],
      "Seraphic Salvation — once per combat, cancel a lethal attack against another friendly unit."
    )
  ),
  "mgq.spider_princess": mgqUnit(
    "spider_princess",
    "Spider Princess",
    "gold",
    "ground",
    mgqSide(
      "gold",
      "spider-princess",
      "few",
      { attack: 5, defense: 2, health: 7, initiative: 6, gold: 13, valuables: 1 },
      ["mgq-web-the-field"],
      "Web the Field — [activation] place Weakness on an adjacent enemy and gain a Defense token."
    ),
    mgqSide(
      "gold",
      "spider-princess",
      "pack",
      { attack: 6, defense: 3, health: 7, initiative: 7, gold: 21, valuables: 1 },
      ["mgq-web-the-field"],
      "Web the Field — [activation] place Weakness on an adjacent enemy and gain a Defense token."
    )
  ),
  "mgq.emily": mgqUnit(
    "emily",
    "Emily",
    "gold",
    "ground",
    mgqSide(
      "gold",
      "emily",
      "few",
      { attack: 4, defense: 1, health: 6, initiative: 9, gold: 10 },
      ["mgq-sparkle"],
      "Sparkle☆— at combat start, Emily's owner gains a positive Morale token."
    ),
    mgqSide(
      "gold",
      "emily",
      "pack",
      { attack: 5, defense: 1, health: 6, initiative: 11, gold: 15, valuables: 2 },
      ["mgq-sparkle", "elemental-damage"],
      "Sparkle☆— at combat start, Emily's owner gains a positive Morale token. Emily deals elemental damage."
    )
  )
};

export const mgqHeroDefinitions: Record<string, HeroDefinition> = {
  luka: {
    id: "luka",
    name: "Luka",
    faction: "mgq",
    class: "Hero of Ilias",
    type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.offense",
    specialtyCardIds: { 1: "specialty.luka.1", 4: "specialty.luka.4", 6: "specialty.luka.6" },
    portrait: "/assets/anime/heroes/mgq-luka.webp",
    source
  },
  alice: {
    id: "alice",
    name: "Alice",
    faction: "mgq",
    class: "Monster Lord",
    type: "magic",
    startingStats: { attack: 1, defense: 1, power: 2, knowledge: 2 },
    startingAbilityCardId: "ability.interference",
    specialtyCardIds: { 1: "specialty.alice.1", 4: "specialty.alice.4", 6: "specialty.alice.6" },
    portrait: "/assets/anime/heroes/mgq-alice.webp",
    source
  },
  ilias: {
    id: "ilias",
    name: "Ilias",
    faction: "mgq",
    class: "Goddess of Creation",
    type: "magic",
    startingStats: { attack: 1, defense: 1, power: 2, knowledge: 2 },
    startingAbilityCardId: "ability.wisdom",
    specialtyCardIds: { 1: "specialty.ilias.1", 4: "specialty.ilias.4", 6: "specialty.ilias.6" },
    portrait: "/assets/anime/heroes/mgq-ilias.webp",
    source
  },
  granberia: {
    id: "granberia",
    name: "Granberia",
    faction: "mgq",
    class: "Heavenly Knight of Fire",
    type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.leadership",
    specialtyCardIds: { 1: "specialty.granberia.1", 4: "specialty.granberia.4", 6: "specialty.granberia.6" },
    portrait: "/assets/anime/heroes/mgq-granberia.webp",
    source
  },
  promestein: {
    id: "promestein",
    name: "Promestein",
    faction: "mgq",
    class: "Mad Scientist",
    type: "magic",
    startingStats: { attack: 1, defense: 1, power: 2, knowledge: 2 },
    startingAbilityCardId: "ability.sorcery",
    specialtyCardIds: { 1: "specialty.promestein.1", 4: "specialty.promestein.4", 6: "specialty.promestein.6" },
    portrait: "/assets/anime/heroes/mgq-promestein.webp",
    source
  }
};

/** Seven physical bars; Four Spirits are now an innate hero summon mechanic. */
export const MGQ_TOWN_BOARD_BARS = [
  ["mgq.city_hall"],
  ["mgq.dwelling_bronze"],
  ["mgq.spirit_shrine"],
  ["mgq.dwelling_silver", "mgq.colosseum"],
  ["mgq.mage_guild"],
  ["mgq.citadel", "mgq.amiras_shop"],
  ["mgq.dwelling_gold"]
] as const;

function mgqBuilding(
  slug: string,
  name: string,
  cost: TownBuildingDefinition["cost"],
  effect: TownBuildingEffect,
  prerequisites?: string[]
): TownBuildingDefinition {
  const id = `mgq.${slug}`;
  const bar = MGQ_TOWN_BOARD_BARS.findIndex((entries) => (entries as readonly string[]).includes(id)) + 1;
  return {
    id,
    name,
    faction: "mgq",
    cost,
    ...(prerequisites ? { prerequisites } : {}),
    effect,
    implementationStatus: "implemented",
    assets: { image: `/assets/town-board/mgq-bar-${bar}.webp` },
    source
  };
}

export const mgqBuildingDefinitions: Record<string, TownBuildingDefinition> = {
  "mgq.city_hall": mgqBuilding(
    "city_hall",
    "Pocket Castle Kitchen",
    { gold: 10, buildingMaterials: 4 },
    {
      type: "RESOURCE_ROUND_CHOICE",
      options: [
        { label: "Pocket Castle provisions: gain 4 gold", gold: 4 },
        { label: "Job counseling: reassign one Job for free", freeJobReassign: true }
      ]
    }
  ),
  "mgq.citadel": mgqBuilding(
    "citadel",
    "Castle Walls",
    { gold: 8, buildingMaterials: 5, valuables: 1 },
    { type: "UNLOCK_REINFORCE" }
  ),
  "mgq.mage_guild": {
    ...mgqBuilding(
      "mage_guild",
      "Library of Ilias",
      { gold: 4, buildingMaterials: 2, valuables: 1 },
      { type: "MAGE_GUILD" }
    ),
    spellBookCost: 5
  },
  "mgq.dwelling_bronze": mgqBuilding(
    "dwelling_bronze",
    "Iliasville Companion House",
    { gold: 5, buildingMaterials: 3, valuables: 1 },
    { type: "UNLOCK_RECRUIT_TIER", tier: "bronze" }
  ),
  "mgq.dwelling_silver": mgqBuilding(
    "dwelling_silver",
    "Grand Noah Companion Guild",
    { gold: 8, buildingMaterials: 6, valuables: 3 },
    { type: "UNLOCK_RECRUIT_TIER", tier: "silver" },
    ["mgq.dwelling_bronze"]
  ),
  "mgq.dwelling_gold": mgqBuilding(
    "dwelling_gold",
    "Monster Lord's Castle",
    { gold: 10, buildingMaterials: 9, valuables: 4 },
    { type: "UNLOCK_RECRUIT_TIER", tier: "gold" },
    ["mgq.dwelling_silver"]
  ),
  "mgq.spirit_shrine": mgqBuilding(
    "spirit_shrine",
    "Spirit Shrine",
    { gold: 7, buildingMaterials: 4, valuables: 1 },
    { type: "RESOURCE_ROUND_RESOURCE_DIE" }
  ),
  "mgq.colosseum": mgqBuilding(
    "colosseum",
    "Colosseum",
    { gold: 7, buildingMaterials: 4 },
    { type: "HALL_OF_VALHALLA", amount: 1 }
  ),
  "mgq.amiras_shop": mgqBuilding(
    "amiras_shop",
    "Amira's Shop",
    { gold: 6, buildingMaterials: 4 },
    { type: "ARTIFACT_SMITH", searchCost: 5, sellGold: 3 }
  )
};

export const mgqFactionDefinitions: Record<"mgq", FactionDefinition> = {
  mgq: {
    id: "mgq",
    name: "Monster Girl Quest: Paradox",
    color: "#9b477e",
    startingTileId: "MGQ-S1",
    heroes: ["luka", "alice", "ilias", "granberia", "promestein"],
    buildings: Object.keys(mgqBuildingDefinitions),
    units: [...MGQ_UNIT_ORDER],
    townImage: "/assets/anime/towns/mgq-paradox-town-empty.webp",
    source
  }
};

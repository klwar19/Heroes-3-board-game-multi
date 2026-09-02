import type { FactionDefinition, HeroDefinition, TownBuildingDefinition, UnitDefinition } from "@/data/factions/types";

const source = {
  product: "Warhammer 40,000 — Imperium fan expansion for Heroes of Might and Magic III: The Board Game",
  credit: "Original, non-commercial board-game adaptation for this project. Warhammer 40,000 names and concepts belong to Games Workshop.",
  url: "https://warhammer40000.com/"
} as const;

const unitCard = (tier: "bronze" | "silver" | "golden", slug: string, side: "few" | "pack") =>
  `/assets/warhammer/units/units-imperium-${tier}-${slug}-${side}.webp`;

/**
 * Canonical seven-line progression requested for the faction: three Bronze,
 * two Silver, two Gold. Every listed ability is an existing engine mechanic;
 * no decorative ability text is used.
 */
export const imperiumUnitDefinitions: Record<string, UnitDefinition> = {
  "imperium.astra_militarum": {
    id: "imperium.astra_militarum", name: "Astra Militarum", faction: "imperium", tier: "bronze", type: "ranged",
    few: { attack: 2, defense: 0, health: 2, initiative: 4, cost: { gold: 3 }, abilities: ["imperium-vox-fire-mission-few"], abilityText: "[activation] Vox Fire Mission — once per round, mark an enemy within 2 spaces; the next friendly attack against it gains +1 Attack.", cardImage: unitCard("bronze", "astra-militarum", "few") },
    pack: { attack: 2, defense: 0, health: 3, initiative: 6, cost: { gold: 5 }, abilities: ["imperium-vox-fire-mission-pack"], abilityText: "[activation] Veteran Vox Net — once per round, mark an enemy within 3 spaces; the next friendly attack against it gains +1 Attack.", cardImage: unitCard("bronze", "astra-militarum", "pack") },
    source
  },
  "imperium.apothecary": {
    id: "imperium.apothecary", name: "Apothecary", faction: "imperium", tier: "bronze", type: "ground",
    few: { attack: 2, defense: 1, health: 3, initiative: 4, cost: { gold: 3 }, abilities: ["imperium-narthecium-few"], abilityText: "[activation] Narthecium Protocol — heal another ally 1 damage, or gain +1 Attack this round.", cardImage: unitCard("bronze", "apothecary", "few") },
    pack: { attack: 2, defense: 1, health: 4, initiative: 5, cost: { gold: 6 }, abilities: ["imperium-narthecium-pack"], abilityText: "[activation] Master Narthecium — heal another ally 2 damage, or gain +1 Attack this round.", cardImage: unitCard("bronze", "apothecary", "pack") },
    source
  },
  "imperium.space_marines": {
    id: "imperium.space_marines", name: "Assault Marines", faction: "imperium", tier: "bronze", type: "flying",
    few: { attack: 3, defense: 0, health: 3, initiative: 7, cost: { gold: 4 }, abilities: ["imperium-shock-assault"], abilityText: "[unit_attack] Shock Assault — after moving, gain +1 Attack.", cardImage: unitCard("bronze", "space-marines", "few") },
    pack: { attack: 3, defense: 1, health: 4, initiative: 9, cost: { gold: 7 }, abilities: ["imperium-shock-assault"], abilityText: "[unit_attack] Veteran Shock Assault — after moving, gain +1 Attack.", cardImage: unitCard("bronze", "space-marines", "pack") },
    source
  },
  "imperium.rhino": {
    id: "imperium.rhino", name: "Rhino", faction: "imperium", tier: "silver", type: "ground",
    few: { attack: 3, defense: 1, health: 5, initiative: 5, cost: { gold: 6 }, abilities: ["imperium-rhino-transport"], abilityText: "[movement] Armoured Transport — when this unit moves, it may carry one adjacent friendly unit and place it in an empty space adjacent to where this unit lands.", cardImage: unitCard("silver", "rhino", "few") },
    pack: { attack: 4, defense: 1, health: 6, initiative: 6, cost: { gold: 10 }, abilities: ["imperium-rhino-transport"], abilityText: "[movement] Armoured Transport — when this unit moves, it may carry one adjacent friendly unit and place it in an empty space adjacent to where this unit lands.", cardImage: unitCard("silver", "rhino", "pack") },
    source
  },
  "imperium.terminators": {
    id: "imperium.terminators", name: "Terminators", faction: "imperium", tier: "silver", type: "ground",
    few: { attack: 4, defense: 2, health: 4, initiative: 5, cost: { gold: 8 }, abilities: ["imperium-teleport-assault"], abilityText: "[unit_passive] Teleport Assault — this unit may move to any empty Combat space.", cardImage: unitCard("silver", "terminators", "few") },
    pack: { attack: 5, defense: 2, health: 4, initiative: 7, cost: { gold: 13 }, abilities: ["imperium-teleport-assault", "imperium-crux-terminatus"], abilityText: "[unit_passive] Crux Terminatus — teleport when moving; gain +1 Defense against the first attack each Combat.", cardImage: unitCard("silver", "terminators", "pack") },
    source
  },
  "imperium.dreadnought": {
    id: "imperium.dreadnought", name: "Dreadnought", faction: "imperium", tier: "gold", type: "ranged",
    few: { attack: 5, defense: 1, health: 7, initiative: 6, cost: { gold: 13 }, abilities: ["imperium-duty-eternal-few"], abilityText: "[unit_passive] Duty Eternal — once per Combat, reduce one damage assignment to this unit by 1.", cardImage: unitCard("golden", "dreadnought", "few") },
    pack: { attack: 5, defense: 1, health: 8, initiative: 8, cost: { gold: 21, valuables: 1 }, abilities: ["imperium-duty-eternal-pack", "imperium-target-acquisition"], abilityText: "1 [valuables] [unit_attack] Venerable Ancient — once per Combat, reduce one damage assignment by 2; +1 Attack against a damaged non-adjacent target.", cardImage: unitCard("golden", "dreadnought", "pack") },
    source
  },
  "imperium.titan": {
    id: "imperium.titan", name: "Titan", faction: "imperium", tier: "gold", type: "ground",
    few: { attack: 6, defense: 3, health: 9, initiative: 4, cost: { gold: 20, valuables: 1 }, abilities: ["imperium-god-engine-sweep-few"], abilityText: "1 [valuables] [unit_attack] God-Engine Sweep — after attacking, strike every adjacent enemy with 3 Attack.", cardImage: unitCard("golden", "titan", "few") },
    pack: { attack: 7, defense: 3, health: 10, initiative: 6, cost: { gold: 29, valuables: 2 }, abilities: ["imperium-god-engine-sweep-pack"], abilityText: "2 [valuables] [unit_attack] Exalted God-Engine — after attacking, strike every adjacent enemy with 4 Attack.", cardImage: unitCard("golden", "titan", "pack") },
    source
  }
};

const building = (
  id: string,
  name: string,
  cost: TownBuildingDefinition["cost"],
  effect: NonNullable<TownBuildingDefinition["effect"]>,
  prerequisites?: string[]
): TownBuildingDefinition => ({
  id, name, faction: "imperium", cost, effect, prerequisites,
  implementationStatus: "implemented",
  assets: { image: `/assets/warhammer/town-bars/imperium-built-bar-${IMPERIUM_BUILDING_BAR[id]}.webp` },
  source
});

export const IMPERIUM_BUILDING_BAR: Record<string, number> = {
  "imperium.city_hall": 1,
  "imperium.dwelling_bronze": 2,
  "imperium.armoury": 3,
  "imperium.dwelling_silver": 4,
  "imperium.apothecarion": 4,
  "imperium.mage_guild": 5,
  "imperium.citadel": 6,
  "imperium.dwelling_gold": 7
};

export const imperiumBuildingDefinitions: Record<string, TownBuildingDefinition> = {
  "imperium.city_hall": building("imperium.city_hall", "Strategium", { gold: 10, buildingMaterials: 4 }, { type: "RESOURCE_ROUND_CHOICE", options: [{ label: "Departmento Munitorum: gain 5 gold", gold: 5 }, { label: "Tactical intelligence: draw 2 cards", drawCards: 2 }] }),
  "imperium.dwelling_bronze": building("imperium.dwelling_bronze", "Muster Fields", { gold: 5, buildingMaterials: 3, valuables: 1 }, { type: "UNLOCK_RECRUIT_TIER", tier: "bronze" }),
  "imperium.armoury": building("imperium.armoury", "Chapter Armoury", { gold: 6, buildingMaterials: 4 }, { type: "ARTIFACT_SMITH", searchCost: 5, sellGold: 3 }),
  "imperium.dwelling_silver": building("imperium.dwelling_silver", "Armoured Reclusiam", { gold: 8, buildingMaterials: 6, valuables: 3 }, { type: "UNLOCK_RECRUIT_TIER", tier: "silver" }, ["imperium.dwelling_bronze"]),
  "imperium.apothecarion": building("imperium.apothecarion", "Apothecarion", { gold: 7, buildingMaterials: 4 }, { type: "HALL_OF_VALHALLA", amount: 1 }),
  "imperium.mage_guild": { ...building("imperium.mage_guild", "Librarius", { gold: 4, buildingMaterials: 2, valuables: 1 }, { type: "MAGE_GUILD" }), spellBookCost: 5 },
  "imperium.citadel": building("imperium.citadel", "Fortress-Monastery", { gold: 8, buildingMaterials: 5, valuables: 1 }, { type: "UNLOCK_REINFORCE" }),
  "imperium.dwelling_gold": building("imperium.dwelling_gold", "God-Engine Manufactorum", { gold: 10, buildingMaterials: 9, valuables: 4 }, { type: "UNLOCK_RECRUIT_TIER", tier: "gold" }, ["imperium.dwelling_silver"])
};

const hero = (
  id: string,
  name: string,
  heroClass: string,
  type: "might" | "magic",
  stats: HeroDefinition["startingStats"],
  ability: string,
  portrait: string
): HeroDefinition => ({
  id, name, faction: "imperium", class: heroClass, type,
  startingStats: stats,
  startingAbilityCardId: ability,
  specialtyCardIds: { 1: `specialty.${id}.1`, 4: `specialty.${id}.4`, 6: `specialty.${id}.6` },
  portrait,
  source
});

export const imperiumHeroDefinitions: Record<string, HeroDefinition> = {
  emperor_of_mankind: hero("emperor_of_mankind", "The Emperor", "Master of Mankind", "magic", { attack: 2, defense: 1, power: 2, knowledge: 1 }, "ability.wisdom", "/assets/warhammer/heroes/emperor-of-mankind.webp"),
  roboute_guilliman: hero("roboute_guilliman", "Roboute Guilliman", "Avenging Son", "might", { attack: 2, defense: 2, power: 1, knowledge: 1 }, "ability.leadership", "/assets/warhammer/heroes/roboute-guilliman.webp"),
  rogal_dorn: hero("rogal_dorn", "Rogal Dorn", "Praetorian of Terra", "might", { attack: 1, defense: 3, power: 1, knowledge: 1 }, "ability.armorer", "/assets/warhammer/heroes/rogal-dorn.webp"),
  sanguinius: hero("sanguinius", "Sanguinius", "The Great Angel", "magic", { attack: 1, defense: 1, power: 2, knowledge: 2 }, "ability.sorcery", "/assets/warhammer/heroes/sanguinius.webp")
};

export const imperiumFactionDefinition: FactionDefinition = {
  id: "imperium",
  name: "Imperium of Man",
  color: "#174c35",
  startingTileId: "IM-S1",
  heroes: Object.keys(imperiumHeroDefinitions),
  buildings: Object.keys(imperiumBuildingDefinitions),
  units: [
    "imperium.astra_militarum",
    "imperium.apothecary",
    "imperium.space_marines",
    "imperium.rhino",
    "imperium.terminators",
    "imperium.dreadnought",
    "imperium.titan"
  ],
  townImage: "/assets/warhammer/town/imperium-town-empty.webp",
  source
};

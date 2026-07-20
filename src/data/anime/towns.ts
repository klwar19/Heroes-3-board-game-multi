import type {
  FactionDefinition,
  HeroDefinition,
  TownBuildingDefinition,
  UnitDefinition
} from "@/data/factions/types";

const source = {
  product: "Anime Mod — Ninefold Realms × Otherworld Gate",
  credit:
    "Original board-game content for this project. Unit cards use the repository's commissioned anime/wuxia art suite; mechanics reuse implemented engine abilities."
} as const;

const fuyukiCard = (tier: "bronze" | "silver" | "golden", slug: string, side: "few" | "pack") =>
  `/assets/anime/units/fuyuki/units-fuyuki-${tier}-${slug}-${side}.webp`;
const azureCard = (tier: "bronze" | "silver" | "golden", slug: string, side: "few" | "pack") =>
  `/assets/anime/units/azure-breeze/units-azure-breeze-${tier}-${slug}-${side}.webp`;

/** Two complete seven-line faction rosters: one anime/isekai, one wuxia. */
export const animeTownUnitDefinitions: Record<string, UnitDefinition> = {
  "fuyuki.assassins": {
    id: "fuyuki.assassins", name: "Assassins", faction: "fuyuki", tier: "bronze", type: "ground",
    few: { attack: 2, defense: 1, health: 2, initiative: 7, cost: { gold: 2 }, abilities: [], cardImage: fuyukiCard("bronze", "assassins", "few") },
    pack: { attack: 2, defense: 2, health: 2, initiative: 7, cost: { gold: 3 }, abilities: ["ignores-retaliation"], abilityText: "Presence Concealment — attacks do not provoke Retaliation.", cardImage: fuyukiCard("bronze", "assassins", "pack") },
    source
  },
  "fuyuki.riders": {
    id: "fuyuki.riders", name: "Riders", faction: "fuyuki", tier: "bronze", type: "ground",
    few: { attack: 2, defense: 1, health: 2, initiative: 6, cost: { gold: 3 }, abilities: [], cardImage: fuyukiCard("bronze", "riders", "few") },
    pack: { attack: 3, defense: 1, health: 2, initiative: 7, cost: { gold: 4 }, abilities: ["basilisk-paralysis"], abilityText: "Trample — after attacking, roll a die; on 0 the target is Paralyzed.", cardImage: fuyukiCard("bronze", "riders", "pack") },
    source
  },
  "fuyuki.lancers": {
    id: "fuyuki.lancers", name: "Lancers", faction: "fuyuki", tier: "bronze", type: "ground",
    few: { attack: 2, defense: 1, health: 3, initiative: 5, cost: { gold: 4 }, abilities: ["mechanics-line-attack-1"], abilityText: "Gáe Bolg — strike through the target for a second Attack 1 hit.", cardImage: fuyukiCard("bronze", "lancers", "few") },
    pack: { attack: 3, defense: 1, health: 3, initiative: 6, cost: { gold: 5 }, abilities: ["mechanics-line-attack-2", "ignores-retaliation"], abilityText: "Gáe Bolg — strike behind the target at Attack 2; ignores Retaliation.", cardImage: fuyukiCard("bronze", "lancers", "pack") },
    source
  },
  "fuyuki.archers": {
    id: "fuyuki.archers", name: "Archers", faction: "fuyuki", tier: "silver", type: "ranged",
    few: { attack: 3, defense: 2, health: 3, initiative: 5, cost: { gold: 7 }, abilities: ["ignore-all-combat-penalties"], abilityText: "Hawkeye — ignores all ranged Combat penalties.", cardImage: fuyukiCard("silver", "archers", "few") },
    pack: { attack: 3, defense: 2, health: 3, initiative: 6, cost: { gold: 10 }, abilities: ["ignore-all-combat-penalties", "double-attack"], abilityText: "Hawkeye — ignores penalties and attacks a distant target twice.", cardImage: fuyukiCard("silver", "archers", "pack") },
    source
  },
  "fuyuki.casters": {
    id: "fuyuki.casters", name: "Casters", faction: "fuyuki", tier: "silver", type: "ranged",
    // engine: elemental-damage + casters-damage-cap (≤1 from each attack OR Spell)
    // + magi-power-boost. Pack no longer uses reduce-spell-damage-1 — the hard
    // cap is strictly stronger and covers attacks too.
    few: {
      attack: 2,
      defense: 2,
      health: 3,
      initiative: 4,
      cost: { gold: 7 },
      abilities: ["elemental-damage", "casters-damage-cap", "magi-power-boost"],
      abilityText:
        "Leycraft — deals elemental damage; cannot take more than 1 damage from a single attack or Spell; first Spell this round +1 Power.",
      cardImage: fuyukiCard("silver", "casters", "few")
    },
    pack: {
      attack: 3,
      defense: 2,
      health: 3,
      initiative: 5,
      cost: { gold: 11 },
      abilities: ["elemental-damage", "casters-damage-cap", "magi-power-boost"],
      abilityText:
        "Leycraft — deals elemental damage; cannot take more than 1 damage from a single attack or Spell; first Spell this round +1 Power.",
      cardImage: fuyukiCard("silver", "casters", "pack")
    },
    source
  },
  "fuyuki.sabers": {
    id: "fuyuki.sabers", name: "Sabers", faction: "fuyuki", tier: "gold", type: "ground",
    few: { attack: 5, defense: 3, health: 5, initiative: 6, cost: { gold: 13, valuables: 1 }, abilities: ["dragon-line-attack-2"], abilityText: "Excalibur — a second Attack 2 hit strikes behind the target.", cardImage: fuyukiCard("golden", "sabers", "few") },
    pack: { attack: 6, defense: 3, health: 6, initiative: 7, cost: { gold: 20, valuables: 2 }, abilities: ["dragon-line-attack-3", "commander-charge"], abilityText: "Excalibur — line strike at Attack 3; +1 Attack after moving.", cardImage: fuyukiCard("golden", "sabers", "pack") },
    source
  },
  "fuyuki.berserkers": {
    id: "fuyuki.berserkers", name: "Berserkers", faction: "fuyuki", tier: "gold", type: "ground",
    few: { attack: 6, defense: 2, health: 7, initiative: 4, cost: { gold: 14, valuables: 1 }, abilities: ["phoenix-rebirth"], abilityText: "God Hand — once per Combat, lethal damage leaves this unit at 1 Health.", cardImage: fuyukiCard("golden", "berserkers", "few") },
    pack: { attack: 7, defense: 2, health: 8, initiative: 4, cost: { gold: 22, valuables: 2 }, abilities: ["phoenix-rebirth", "immune-all-spells"], abilityText: "God Hand — rebirths once and is immune to all Spells.", cardImage: fuyukiCard("golden", "berserkers", "pack") },
    source
  },

  // Azure Breeze: classic 3 bronze / 2 silver / 2 gold. Gold stays True Inheritors
  // + Mountain Guardian (never demote the mountain tank). Spirit Crane is early flyer
  // (bronze); Core Formation Master is mid-tier formation support (silver).
  // --- BRONZE (3) ----------------------------------------------------------
  "azure_breeze.outer_disciples": {
    id: "azure_breeze.outer_disciples", name: "Outer Sect Disciples", faction: "azure_breeze", tier: "bronze", type: "ground",
    few: { attack: 2, defense: 1, health: 2, initiative: 5, cost: { gold: 2 }, abilities: [], cardImage: azureCard("bronze", "outer-sect-disciples", "few") },
    pack: { attack: 3, defense: 1, health: 2, initiative: 5, cost: { gold: 3 }, abilities: ["wog-attack-when-attacking-1"], abilityText: "Sword Array — gains +1 Attack on its own attacks.", cardImage: azureCard("bronze", "outer-sect-disciples", "pack") },
    source
  },
  "azure_breeze.inner_swordsmen": {
    id: "azure_breeze.inner_swordsmen", name: "Inner Sect Swordsmen", faction: "azure_breeze", tier: "bronze", type: "ground",
    few: { attack: 2, defense: 1, health: 2, initiative: 7, cost: { gold: 3 }, abilities: ["ignore-combat-penalties"], abilityText: "Flowing Step — ignores the adjacent Combat penalty.", cardImage: azureCard("bronze", "inner-sect-swordsmen", "few") },
    pack: { attack: 3, defense: 1, health: 2, initiative: 9, cost: { gold: 5 }, abilities: ["ignore-all-combat-penalties"], abilityText: "Flowing Step — ignores all Combat penalties.", cardImage: azureCard("bronze", "inner-sect-swordsmen", "pack") },
    source
  },
  // Early spirit flyer (bronze) — was silver when the roster had 3 golds.
  "azure_breeze.spirit_crane": {
    id: "azure_breeze.spirit_crane", name: "Spirit Crane", faction: "azure_breeze", tier: "bronze", type: "flying",
    few: { attack: 2, defense: 1, health: 2, initiative: 9, cost: { gold: 4 }, abilities: [], cardImage: azureCard("bronze", "spirit-crane", "few") },
    pack: { attack: 3, defense: 1, health: 3, initiative: 10, cost: { gold: 6 }, abilities: ["ignores-retaliation"], abilityText: "Wingbeat — attacks do not provoke Retaliation.", cardImage: azureCard("bronze", "spirit-crane", "pack") },
    source
  },
  // --- SILVER (2) ----------------------------------------------------------
  "azure_breeze.sect_protectors": {
    id: "azure_breeze.sect_protectors", name: "Sect Protectors", faction: "azure_breeze", tier: "silver", type: "ground",
    few: { attack: 3, defense: 2, health: 4, initiative: 4, cost: { gold: 8 }, abilities: ["commander-defense-token"], abilityText: "Iron Ward — always rolls the Defend die when attacked.", cardImage: azureCard("silver", "sect-protectors", "few") },
    pack: { attack: 4, defense: 2, health: 5, initiative: 4, cost: { gold: 12 }, abilities: ["unlimited-retaliation"], abilityText: "Unbroken Guard — may Retaliate any number of times each round.", cardImage: azureCard("silver", "sect-protectors", "pack") },
    source
  },
  // Mid-tier formation mage (was gold; demoted so Mountain Guardian can stay gold).
  "azure_breeze.core_master": {
    id: "azure_breeze.core_master", name: "Core Formation Master", faction: "azure_breeze", tier: "silver", type: "ranged",
    few: { attack: 3, defense: 2, health: 4, initiative: 5, cost: { gold: 9 }, abilities: ["ignore-all-combat-penalties", "magi-power-boost"], abilityText: "Talisman Arts — ignores penalties; first Spell +1 Power.", cardImage: azureCard("silver", "core-formation-master", "few") },
    pack: { attack: 4, defense: 2, health: 5, initiative: 5, cost: { gold: 13 }, abilities: ["ignore-all-combat-penalties", "magi-power-boost", "unicorn-spell-ward-aura"], abilityText: "Talisman Aura — first Spell +1 Power; protects adjacent allies from Spell damage.", cardImage: azureCard("silver", "core-formation-master", "pack") },
    source
  },
  // --- GOLD (2) — True Inheritors (Qingyun specialty) + Mountain Guardian tank
  "azure_breeze.true_inheritors": {
    id: "azure_breeze.true_inheritors", name: "True Inheritors", faction: "azure_breeze", tier: "gold", type: "ground",
    few: { attack: 5, defense: 2, health: 6, initiative: 7, cost: { gold: 13, valuables: 1 }, abilities: ["commander-charge"], abilityText: "Charge — +1 Attack after moving.", cardImage: azureCard("golden", "true-inheritors", "few") },
    pack: { attack: 6, defense: 2, health: 7, initiative: 8, cost: { gold: 20, valuables: 2 }, abilities: ["commander-charge", "ignores-retaliation"], abilityText: "Peerless Form — Charge; ignores Retaliation.", cardImage: azureCard("golden", "true-inheritors", "pack") },
    source
  },
  "azure_breeze.mountain_guardian": {
    id: "azure_breeze.mountain_guardian", name: "Mountain Guardian", faction: "azure_breeze", tier: "gold", type: "ground",
    few: { attack: 5, defense: 3, health: 8, initiative: 3, cost: { gold: 15, valuables: 1 }, abilities: ["wraith-heal-1"], abilityText: "Verdant Pulse — on activation, heal 1 damage.", cardImage: azureCard("golden", "mountain-guardian", "few") },
    pack: { attack: 6, defense: 3, health: 9, initiative: 3, cost: { gold: 23, valuables: 2 }, abilities: ["wraith-heal-2", "unlimited-retaliation"], abilityText: "Returning Earth — heal 2 on activation; unlimited Retaliation.", cardImage: azureCard("golden", "mountain-guardian", "pack") },
    source
  }
};

/** The seven contiguous panorama strips also serve as the real building-card art. */
const animeTownBuildingBar: Record<string, number> = {
  "fuyuki.city_hall": 1,
  "fuyuki.dwelling_bronze": 2,
  "fuyuki.summoning_circle": 3,
  "fuyuki.dwelling_silver": 4,
  "fuyuki.mystic_outfitter": 4,
  "fuyuki.mage_guild": 5,
  "fuyuki.citadel": 6,
  "fuyuki.dwelling_gold": 7,
  "azure_breeze.dwelling_bronze": 1,
  "azure_breeze.sword_pavilion": 2,
  "azure_breeze.dwelling_silver": 3,
  "azure_breeze.mage_guild": 4,
  "azure_breeze.alchemy_pavilion": 4,
  "azure_breeze.city_hall": 5,
  "azure_breeze.citadel": 6,
  "azure_breeze.dwelling_gold": 7
};

const building = (
  id: string,
  name: string,
  faction: "fuyuki" | "azure_breeze",
  cost: TownBuildingDefinition["cost"],
  effect: NonNullable<TownBuildingDefinition["effect"]>,
  prerequisites?: string[]
): TownBuildingDefinition => ({
  id,
  name,
  faction,
  cost,
  effect,
  prerequisites,
  implementationStatus: "implemented",
  assets: {
    image: `/assets/town-board/${faction === "azure_breeze" ? "azure-breeze" : faction}-bar-${animeTownBuildingBar[id]}.webp`
  },
  source
});

export const animeTownBuildingDefinitions: Record<string, TownBuildingDefinition> = {
  "fuyuki.city_hall": building("fuyuki.city_hall", "Moonlit City Hall", "fuyuki", { gold: 10, buildingMaterials: 4 }, { type: "RESOURCE_ROUND_CHOICE", options: [{ label: "Gain 6 gold", gold: 6 }, { label: "Draw 1 card", drawCards: 1 }] }),
  "fuyuki.citadel": building("fuyuki.citadel", "Command Citadel", "fuyuki", { gold: 8, buildingMaterials: 5, valuables: 1 }, { type: "UNLOCK_REINFORCE" }),
  "fuyuki.mage_guild": { ...building("fuyuki.mage_guild", "Leyline Workshop", "fuyuki", { gold: 4, buildingMaterials: 2, valuables: 1 }, { type: "MAGE_GUILD" }), spellBookCost: 5 },
  "fuyuki.dwelling_bronze": building("fuyuki.dwelling_bronze", "Spirit Barracks", "fuyuki", { gold: 5, buildingMaterials: 3, valuables: 1 }, { type: "UNLOCK_RECRUIT_TIER", tier: "bronze" }),
  "fuyuki.dwelling_silver": building("fuyuki.dwelling_silver", "Mooncell Academy", "fuyuki", { gold: 8, buildingMaterials: 6, valuables: 3 }, { type: "UNLOCK_RECRUIT_TIER", tier: "silver" }, ["fuyuki.dwelling_bronze"]),
  "fuyuki.dwelling_gold": building("fuyuki.dwelling_gold", "Throne of Heroes", "fuyuki", { gold: 10, buildingMaterials: 9, valuables: 4 }, { type: "UNLOCK_RECRUIT_TIER", tier: "gold" }, ["fuyuki.dwelling_silver"]),
  "fuyuki.summoning_circle": building("fuyuki.summoning_circle", "Grand Summoning Circle", "fuyuki", { gold: 7, buildingMaterials: 4, valuables: 1 }, { type: "TURN_START_PORTAL_SUMMON" }),
  "fuyuki.mystic_outfitter": building("fuyuki.mystic_outfitter", "Mystic Outfitter", "fuyuki", { gold: 6, buildingMaterials: 4 }, { type: "ARTIFACT_SMITH", searchCost: 5, sellGold: 3 }),

  "azure_breeze.city_hall": building("azure_breeze.city_hall", "Hall of Clear Intent", "azure_breeze", { gold: 10, buildingMaterials: 4 }, { type: "RESOURCE_ROUND_CHOICE", options: [{ label: "Gain 7 gold", gold: 7 }] }),
  "azure_breeze.citadel": building("azure_breeze.citadel", "Sect Protection Array", "azure_breeze", { gold: 8, buildingMaterials: 5, valuables: 1 }, { type: "UNLOCK_REINFORCE" }),
  "azure_breeze.mage_guild": { ...building("azure_breeze.mage_guild", "Scripture Pavilion", "azure_breeze", { gold: 4, buildingMaterials: 2, valuables: 1 }, { type: "MAGE_GUILD" }), spellBookCost: 5 },
  "azure_breeze.dwelling_bronze": building("azure_breeze.dwelling_bronze", "Outer Court", "azure_breeze", { gold: 5, buildingMaterials: 3, valuables: 1 }, { type: "UNLOCK_RECRUIT_TIER", tier: "bronze" }),
  "azure_breeze.dwelling_silver": building("azure_breeze.dwelling_silver", "Spirit Crane Peak", "azure_breeze", { gold: 8, buildingMaterials: 6, valuables: 3 }, { type: "UNLOCK_RECRUIT_TIER", tier: "silver" }, ["azure_breeze.dwelling_bronze"]),
  "azure_breeze.dwelling_gold": building("azure_breeze.dwelling_gold", "Golden Core Summit", "azure_breeze", { gold: 10, buildingMaterials: 9, valuables: 4 }, { type: "UNLOCK_RECRUIT_TIER", tier: "gold" }, ["azure_breeze.dwelling_silver"]),
  "azure_breeze.alchemy_pavilion": building("azure_breeze.alchemy_pavilion", "Alchemy Pavilion", "azure_breeze", { gold: 7, buildingMaterials: 4 }, { type: "RESOURCE_ROUND_RESOURCE_DIE" }),
  "azure_breeze.sword_pavilion": building("azure_breeze.sword_pavilion", "Sword Pavilion", "azure_breeze", { gold: 7, buildingMaterials: 4 }, { type: "HALL_OF_VALHALLA", amount: 1 })
};

export const animeTownHeroDefinitions: Record<string, HeroDefinition> = {
  bin: {
    id: "bin", name: "Bin", faction: "fuyuki", class: "Contractor", type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.leadership",
    specialtyCardIds: { 1: "specialty.bin.1", 4: "specialty.bin.4", 6: "specialty.bin.6" },
    portrait: "/assets/anime/heroes/bin.png", source
  },
  aoko: {
    id: "aoko", name: "Aoko", faction: "fuyuki", class: "Leyline Magus", type: "magic",
    startingStats: { attack: 1, defense: 1, power: 2, knowledge: 2 },
    startingAbilityCardId: "ability.sorcery",
    specialtyCardIds: { 1: "specialty.aoko.1", 4: "specialty.aoko.4", 6: "specialty.aoko.6" },
    portrait: "/assets/anime/heroes/aoko.png", source
  },
  qingyun: {
    id: "qingyun", name: "Qingyun", faction: "azure_breeze", class: "Sword Cultivator", type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.offense",
    specialtyCardIds: { 1: "specialty.qingyun.1", 4: "specialty.qingyun.4", 6: "specialty.qingyun.6" },
    portrait: "/assets/anime/heroes/qingyun.png", source
  },
  lingxi: {
    id: "lingxi", name: "Lingxi", faction: "azure_breeze", class: "Formation Sage", type: "magic",
    startingStats: { attack: 1, defense: 2, power: 2, knowledge: 1 },
    startingAbilityCardId: "ability.wisdom",
    specialtyCardIds: { 1: "specialty.lingxi.1", 4: "specialty.lingxi.4", 6: "specialty.lingxi.6" },
    portrait: "/assets/anime/heroes/lingxi.png", source
  }
};

export const animeTownFactionDefinitions: Record<string, FactionDefinition> = {
  fuyuki: {
    id: "fuyuki", name: "Fuyuki City", color: "#7256d8", startingTileId: "A-S1",
    heroes: ["bin", "aoko"],
    buildings: Object.values(animeTownBuildingDefinitions).filter((item) => item.faction === "fuyuki").map((item) => item.id),
    units: Object.values(animeTownUnitDefinitions).filter((item) => item.faction === "fuyuki").map((item) => item.id),
    townImage: "/assets/anime/towns/fuyuki-city-empty-v2.webp", source
  },
  azure_breeze: {
    id: "azure_breeze", name: "Azure Breeze Sect", color: "#27a9a0", startingTileId: "W-S1",
    heroes: ["qingyun", "lingxi"],
    buildings: Object.values(animeTownBuildingDefinitions).filter((item) => item.faction === "azure_breeze").map((item) => item.id),
    units: Object.values(animeTownUnitDefinitions).filter((item) => item.faction === "azure_breeze").map((item) => item.id),
    townImage: "/assets/anime/towns/azure-breeze-sect-empty-v2.webp", source
  }
};

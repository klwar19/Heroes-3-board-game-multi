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
const hiddenLeafCard = (tier: "bronze" | "silver" | "golden", slug: string, side: "few" | "pack") =>
  `/assets/anime/units/hidden-leaf/units-hidden-leaf-${tier}-${slug}-${side}.webp`;
const azurCard = (tier: "bronze" | "silver" | "golden", slug: string, side: "few" | "pack") =>
  `/assets/anime/units/azur-lane/units-azur-lane-${tier}-${slug}-${side}.webp`;

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

  // Azure Breeze printed levels (3 bronze / 2 silver / 2 gold) — CANONICAL order:
  // LV1 Outer · LV2 Inner · LV3 Spirit Crane (bronze) ·
  // LV4 Sect Protectors · LV5 True Inheritors (silver) ·
  // LV6 Core Formation Master · LV7 Mountain Guardian (gold).
  // Keep this object key order = recruit order. Do not reorder casually.
  // --- BRONZE (3) — LV 1–3 -------------------------------------------------
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
  // LV 3 bronze flyer.
  "azure_breeze.spirit_crane": {
    id: "azure_breeze.spirit_crane", name: "Spirit Crane", faction: "azure_breeze", tier: "bronze", type: "flying",
    few: { attack: 2, defense: 1, health: 2, initiative: 9, cost: { gold: 4 }, abilities: [], cardImage: azureCard("bronze", "spirit-crane", "few") },
    pack: { attack: 3, defense: 1, health: 3, initiative: 10, cost: { gold: 6 }, abilities: ["ignores-retaliation"], abilityText: "Wingbeat — attacks do not provoke Retaliation.", cardImage: azureCard("bronze", "spirit-crane", "pack") },
    source
  },
  // --- SILVER (2) — LV 4–5 -------------------------------------------------
  "azure_breeze.sect_protectors": {
    id: "azure_breeze.sect_protectors", name: "Sect Protectors", faction: "azure_breeze", tier: "silver", type: "ground",
    few: { attack: 3, defense: 2, health: 4, initiative: 4, cost: { gold: 8 }, abilities: ["commander-defense-token"], abilityText: "Iron Ward — always rolls the Defend die when attacked.", cardImage: azureCard("silver", "sect-protectors", "few") },
    pack: { attack: 4, defense: 2, health: 5, initiative: 4, cost: { gold: 12 }, abilities: ["unlimited-retaliation"], abilityText: "Unbroken Guard — may Retaliate any number of times each round.", cardImage: azureCard("silver", "sect-protectors", "pack") },
    source
  },
  // LV 5 silver — Qingyun specialty. Must sit ABOVE LV4 protectors and BELOW LV6 gold
  // (never reuse the old gold TI numbers 5/2/6/7 — those beat LV6).
  "azure_breeze.true_inheritors": {
    id: "azure_breeze.true_inheritors", name: "True Inheritors", faction: "azure_breeze", tier: "silver", type: "ground",
    few: { attack: 3, defense: 2, health: 4, initiative: 6, cost: { gold: 9 }, abilities: ["commander-charge"], abilityText: "Charge — +1 Attack after moving.", cardImage: azureCard("silver", "true-inheritors", "few") },
    pack: { attack: 4, defense: 2, health: 5, initiative: 7, cost: { gold: 13 }, abilities: ["commander-charge", "ignores-retaliation"], abilityText: "Peerless Form — Charge; ignores Retaliation.", cardImage: azureCard("silver", "true-inheritors", "pack") },
    source
  },
  // --- GOLD (2) — LV 6–7 ---------------------------------------------------
  // LV 6 gold formation mage — clearly above silver LV5 on raw stats + valuables cost.
  "azure_breeze.core_master": {
    id: "azure_breeze.core_master", name: "Core Formation Master", faction: "azure_breeze", tier: "gold", type: "ranged",
    few: { attack: 5, defense: 3, health: 6, initiative: 6, cost: { gold: 14, valuables: 1 }, abilities: ["ignore-all-combat-penalties", "magi-power-boost"], abilityText: "Talisman Arts — ignores penalties; first Spell +1 Power.", cardImage: azureCard("golden", "core-formation-master", "few") },
    pack: { attack: 6, defense: 3, health: 7, initiative: 6, cost: { gold: 22, valuables: 2 }, abilities: ["ignore-all-combat-penalties", "magi-power-boost", "unicorn-spell-ward-aura"], abilityText: "Talisman Aura — first Spell +1 Power; protects adjacent allies from Spell damage.", cardImage: azureCard("golden", "core-formation-master", "pack") },
    source
  },
  // LV 7 gold mountain tank.
  "azure_breeze.mountain_guardian": {
    id: "azure_breeze.mountain_guardian", name: "Mountain Guardian", faction: "azure_breeze", tier: "gold", type: "ground",
    few: { attack: 5, defense: 3, health: 8, initiative: 3, cost: { gold: 15, valuables: 1 }, abilities: ["wraith-heal-1"], abilityText: "Verdant Pulse — on activation, heal 1 damage.", cardImage: azureCard("golden", "mountain-guardian", "few") },
    pack: { attack: 6, defense: 3, health: 9, initiative: 3, cost: { gold: 23, valuables: 2 }, abilities: ["wraith-heal-2", "unlimited-retaliation"], abilityText: "Returning Earth — heal 2 on activation; unlimited Retaliation.", cardImage: azureCard("golden", "mountain-guardian", "pack") },
    source
  },

  // Hidden Leaf Village printed levels (3 bronze / 2 silver / 2 gold) — CANONICAL
  // recruit order = object key order (the faction derives `units` from this order
  // via a filter, exactly like Fuyuki). Swarm identity: fast + frail + cheap on
  // the bronze line, control/tank on silver, AoE/armored on gold. Every ability
  // tag resolves to an IMPLEMENTED unitAbilities entry; abilityText restates ONLY
  // what that arm runs, shinobi-flavored. A Few side listed [] carries no ability
  // and (per CLAUDE.md §2) no abilityText.
  // --- BRONZE (3) ----------------------------------------------------------
  "hidden_leaf.genin_squad": {
    id: "hidden_leaf.genin_squad", name: "Genin Squad", faction: "hidden_leaf", tier: "bronze", type: "ground",
    few: { attack: 2, defense: 1, health: 2, initiative: 7, cost: { gold: 2 }, abilities: [], cardImage: hiddenLeafCard("bronze", "genin-squad", "few") },
    // Genin Pack reuses the EXACT id Azure's Outer Sect Disciples Pack carries
    // (wog-attack-when-attacking-1 = OWN_ATTACK_FLAT_BONUS +1, own attacks only).
    pack: { attack: 2, defense: 1, health: 2, initiative: 8, cost: { gold: 3 }, abilities: ["wog-attack-when-attacking-1"], abilityText: "Teamwork Formation — this unit gains +1 Attack on its own attacks (never on a Retaliation Attack).", cardImage: hiddenLeafCard("bronze", "genin-squad", "pack") },
    source
  },
  "hidden_leaf.medical_nin": {
    id: "hidden_leaf.medical_nin", name: "Medical-Nin", faction: "hidden_leaf", tier: "bronze", type: "ground",
    few: { attack: 1, defense: 1, health: 2, initiative: 6, cost: { gold: 2 }, abilities: [], cardImage: hiddenLeafCard("bronze", "medical-nin", "few") },
    pack: { attack: 2, defense: 1, health: 3, initiative: 6, cost: { gold: 4 }, abilities: ["enchanter-heal-or-buff"], abilityText: "Mystical Palm — [activation] remove up to 2 damage from a chosen friendly unit; only if no friendly unit can be healed, instead gain +1 Attack for the combat round. It can not heal itself, and this does not end the activation.", cardImage: hiddenLeafCard("bronze", "medical-nin", "pack") },
    source
  },
  // LV3 bronze RANGED skirmisher.
  "hidden_leaf.anbu": {
    id: "hidden_leaf.anbu", name: "Anbu Black Ops", faction: "hidden_leaf", tier: "bronze", type: "ranged",
    few: { attack: 2, defense: 1, health: 2, initiative: 7, cost: { gold: 4 }, abilities: ["ignore-combat-penalties"], abilityText: "Shadow Step — ignores the Combat penalty for attacking an adjacent unit (the long-range / behind-wall penalty still applies).", cardImage: hiddenLeafCard("bronze", "anbu", "few") },
    pack: { attack: 3, defense: 1, health: 2, initiative: 8, cost: { gold: 5 }, abilities: ["ignore-combat-penalties", "teleport-move"], abilityText: "Body Flicker — ignores the adjacent-unit Combat penalty; as a regular move, may move to any empty space.", cardImage: hiddenLeafCard("bronze", "anbu", "pack") },
    source
  },
  // --- SILVER (2) ----------------------------------------------------------
  // LV4 silver RANGED elite.
  "hidden_leaf.jonin": {
    id: "hidden_leaf.jonin", name: "Jonin", faction: "hidden_leaf", tier: "silver", type: "ranged",
    few: { attack: 3, defense: 2, health: 3, initiative: 6, cost: { gold: 7 }, abilities: ["ignore-combat-penalties"], abilityText: "Kunai Barrage — ignores the Combat penalty for attacking an adjacent unit (the long-range / behind-wall penalty still applies).", cardImage: hiddenLeafCard("silver", "jonin", "few") },
    pack: { attack: 4, defense: 2, health: 4, initiative: 7, cost: { gold: 10 }, abilities: ["ignore-all-combat-penalties", "ignores-retaliation"], abilityText: "Jonin Mastery — ignores all ranged Combat penalties; its attacks never provoke a Retaliation Attack.", cardImage: hiddenLeafCard("silver", "jonin", "pack") },
    source
  },
  // LV5 silver ground TANK.
  "hidden_leaf.giant_toad": {
    id: "hidden_leaf.giant_toad", name: "Giant Toad", faction: "hidden_leaf", tier: "silver", type: "ground",
    few: { attack: 3, defense: 2, health: 4, initiative: 4, cost: { gold: 8 }, abilities: ["commander-defense-token"], abilityText: "Toad Hide — always treated as if it had a Defense token: it rolls the Defend die when attacked (a \"+1\" face gives +1 Defense).", cardImage: hiddenLeafCard("silver", "giant-toad", "few") },
    pack: { attack: 4, defense: 3, health: 5, initiative: 4, cost: { gold: 11 }, abilities: ["commander-defense-token", "automaton-detonate-1"], abilityText: "Toad Hide — always rolls the Defend die when attacked; Smoke Burst — when this unit is defeated, deal 1 damage to each adjacent unit.", cardImage: hiddenLeafCard("silver", "giant-toad", "pack") },
    source
  },
  // --- GOLD (2) ------------------------------------------------------------
  // LV6 gold AoE beast — Few splashes (Chakra Burst), Pack second-attacks all
  // adjacent enemies (the Few→Pack ability swap is the mutation control).
  "hidden_leaf.jinchuriki": {
    id: "hidden_leaf.jinchuriki", name: "Jinchuriki", faction: "hidden_leaf", tier: "gold", type: "ground",
    few: { attack: 5, defense: 2, health: 6, initiative: 6, cost: { gold: 14, valuables: 1 }, abilities: ["jinchuriki-chakra-burst"], abilityText: "Chakra Burst — after an attack made by this unit resolves, deal 1 damage to every other unit adjacent to it — friend AND foe. Not an attack: no Retaliation, not reduced by Defense, not subject to per-attack damage caps. Does not fire on a Retaliation Attack.", cardImage: hiddenLeafCard("golden", "jinchuriki", "few") },
    pack: { attack: 6, defense: 2, health: 7, initiative: 7, cost: { gold: 20, valuables: 2 }, abilities: ["magic-elemental-attack-all-enemies"], abilityText: "Tailed-Beast Cloak — after its attack, this unit makes a full separate attack against every other enemy unit adjacent to it. None of these follow-ups retaliates or chains.", cardImage: hiddenLeafCard("golden", "jinchuriki", "pack") },
    source
  },
  // LV7 gold armored avatar.
  "hidden_leaf.susanoo": {
    id: "hidden_leaf.susanoo", name: "Susanoo Avatar", faction: "hidden_leaf", tier: "gold", type: "ground",
    few: { attack: 5, defense: 3, health: 6, initiative: 4, cost: { gold: 15, valuables: 1 }, abilities: ["nix-damage-cap"], abilityText: "Ethereal Armor — this unit cannot take more than 4 damage from a single attack (Spell and ability damage are not capped).", cardImage: hiddenLeafCard("golden", "susanoo", "few") },
    pack: { attack: 6, defense: 3, health: 7, initiative: 4, cost: { gold: 22, valuables: 2 }, abilities: ["nix-damage-cap", "titan-ignore-ongoing"], abilityText: "Ethereal Armor — cannot take more than 4 damage from a single attack; Unbreakable Will — ignore any ongoing effects on this unit.", cardImage: hiddenLeafCard("golden", "susanoo", "pack") },
    source
  },

  // Azur Lane Naval Base printed levels (3 bronze / 2 silver / 2 gold) — one
  // NAMED shipgirl per unit. CANONICAL recruit order = object key order (the
  // faction derives `units` from this order via a filter, exactly like Fuyuki /
  // Hidden Leaf). Fleet identity: fast destroyer openers + a ranged light
  // cruiser on bronze; a carrier medic + a lucky destroyer on silver; an
  // unsinkable heavy cruiser + a glass-cannon submarine on gold. Every ability
  // tag resolves to an IMPLEMENTED unitAbilities entry; abilityText restates
  // ONLY what that arm runs, kansen-flavored. A Few side listed [] carries no
  // ability and (per CLAUDE.md §2) no abilityText.
  // --- BRONZE (3) ----------------------------------------------------------
  "azur_lane.laffey": {
    id: "azur_lane.laffey", name: "Laffey", faction: "azur_lane", tier: "bronze", type: "ground",
    few: { attack: 2, defense: 1, health: 2, initiative: 8, cost: { gold: 2 }, abilities: [], cardImage: azurCard("bronze", "laffey", "few") },
    // ignores-retaliation = its attacks never provoke a Retaliation Attack.
    pack: { attack: 3, defense: 1, health: 2, initiative: 9, cost: { gold: 4 }, abilities: ["ignores-retaliation"], abilityText: "White Demon of Solomon — attacks do not provoke a Retaliation Attack.", cardImage: azurCard("bronze", "laffey", "pack") },
    source
  },
  "azur_lane.javelin": {
    id: "azur_lane.javelin", name: "Javelin", faction: "azur_lane", tier: "bronze", type: "ground",
    few: { attack: 2, defense: 1, health: 2, initiative: 7, cost: { gold: 2 }, abilities: [], cardImage: azurCard("bronze", "javelin", "few") },
    // commander-charge = +1 Attack when it attacks after moving this activation.
    pack: { attack: 3, defense: 1, health: 2, initiative: 8, cost: { gold: 4 }, abilities: ["commander-charge"], abilityText: "Javelin Spiral — +1 Attack on its attack after this unit moves.", cardImage: azurCard("bronze", "javelin", "pack") },
    source
  },
  // LV3 bronze RANGED cruiser gunner.
  "azur_lane.honolulu": {
    id: "azur_lane.honolulu", name: "Honolulu", faction: "azur_lane", tier: "bronze", type: "ranged",
    few: { attack: 2, defense: 1, health: 2, initiative: 6, cost: { gold: 4 }, abilities: ["ignore-combat-penalties"], abilityText: "Rapid Fire — ignores the Combat penalty for attacking an adjacent unit (the long-range / behind-wall penalty still applies).", cardImage: azurCard("bronze", "honolulu", "few") },
    // wog-attack-when-attacking-1 = +1 Attack on its own attacks (proven on the
    // WoG Lava Sharpshooter, a RANGED unit).
    pack: { attack: 3, defense: 1, health: 3, initiative: 7, cost: { gold: 6 }, abilities: ["ignore-combat-penalties", "wog-attack-when-attacking-1"], abilityText: "Rapid Fire — ignores the adjacent-unit Combat penalty; +1 Attack on its own attacks (never on a Retaliation Attack).", cardImage: azurCard("bronze", "honolulu", "pack") },
    source
  },
  // --- SILVER (2) ----------------------------------------------------------
  // LV4 silver ground carrier MEDIC.
  "azur_lane.unicorn": {
    id: "azur_lane.unicorn", name: "Unicorn", faction: "azur_lane", tier: "silver", type: "ground",
    few: { attack: 3, defense: 2, health: 4, initiative: 5, cost: { gold: 7 }, abilities: ["enchanter-heal-or-buff"], abilityText: "Fairy Lullaby — [activation] remove up to 2 damage from a chosen friendly unit; only if no friendly unit can be healed, instead gain +1 Attack for the combat round. It can not heal itself, and this does not end the activation.", cardImage: azurCard("silver", "unicorn", "few") },
    // unicorn-spell-ward-aura = reduce spell damage to this + adjacent friendlies
    // by 1 (the azure_breeze.core_master Pack arm; the War-Unicorn aura on the
    // shipgirl Unicorn is deliberate).
    pack: { attack: 4, defense: 2, health: 5, initiative: 6, cost: { gold: 11 }, abilities: ["enchanter-heal-or-buff", "unicorn-spell-ward-aura"], abilityText: "Fairy Lullaby — [activation] remove up to 2 damage from a chosen friendly unit; only if no friendly unit can be healed, instead gain +1 Attack for the combat round. It can not heal itself, and this does not end the activation. Fairy Ward — protects this and adjacent allies from Spell damage (reduce spell damage by 1, min 0).", cardImage: azurCard("silver", "unicorn", "pack") },
    source
  },
  // LV5 silver ground lucky destroyer (fast).
  "azur_lane.yukikaze": {
    id: "azur_lane.yukikaze", name: "Yukikaze", faction: "azur_lane", tier: "silver", type: "ground",
    few: { attack: 3, defense: 2, health: 3, initiative: 7, cost: { gold: 8 }, abilities: ["commander-defense-token"], abilityText: "The Great Yukikaze — luck of the invincible ship: always rolls the Defend die when attacked (a \"+1\" face gives +1 Defense).", cardImage: azurCard("silver", "yukikaze", "few") },
    pack: { attack: 4, defense: 2, health: 4, initiative: 8, cost: { gold: 11 }, abilities: ["commander-defense-token", "ignores-retaliation"], abilityText: "The Great Yukikaze — always rolls the Defend die when attacked; Torpedo Run — its attacks do not provoke a Retaliation Attack.", cardImage: azurCard("silver", "yukikaze", "pack") },
    source
  },
  // --- GOLD (2) ------------------------------------------------------------
  // LV6 gold ground unsinkable heavy cruiser.
  "azur_lane.prinz_eugen": {
    id: "azur_lane.prinz_eugen", name: "Prinz Eugen", faction: "azur_lane", tier: "gold", type: "ground",
    few: { attack: 5, defense: 3, health: 7, initiative: 4, cost: { gold: 14, valuables: 1 }, abilities: ["nix-damage-cap"], abilityText: "Unsinkable — this unit cannot take more than 4 damage from a single attack (Spell and ability damage are not capped).", cardImage: azurCard("golden", "prinz-eugen", "few") },
    pack: { attack: 6, defense: 3, health: 8, initiative: 4, cost: { gold: 21, valuables: 2 }, abilities: ["nix-damage-cap", "unlimited-retaliation"], abilityText: "Unsinkable — cannot take more than 4 damage from a single attack; may Retaliate any number of times each round.", cardImage: azurCard("golden", "prinz-eugen", "pack") },
    source
  },
  // LV7 gold ground glass-cannon submarine (the Few→Pack ability ADD — the extra
  // strike arm — is the mutation control).
  "azur_lane.i19": {
    id: "azur_lane.i19", name: "I-19", faction: "azur_lane", tier: "gold", type: "ground",
    few: { attack: 6, defense: 2, health: 5, initiative: 6, cost: { gold: 14, valuables: 1 }, abilities: ["ignores-retaliation", "teleport-move"], abilityText: "Silent Hunter — attacks do not provoke Retaliation; as a regular move, may surface on any empty space.", cardImage: azurCard("golden", "i-19", "few") },
    // sandworm-strike-again = SECOND_ATTACK_SAME_TARGET_AFTER_RETALIATION — after
    // its first attack resolves it strikes the same target again (fires on
    // attacksThisActivation === 1, NOT gated on an actual retaliation, so it is a
    // live combo with ignores-retaliation, never a dead clause).
    pack: { attack: 7, defense: 2, health: 6, initiative: 7, cost: { gold: 21, valuables: 2 }, abilities: ["ignores-retaliation", "teleport-move", "sandworm-strike-again"], abilityText: "Silent Hunter — attacks do not provoke Retaliation; as a regular move, may surface on any empty space. Oxygen Torpedo Spread — after its attack resolves, it attacks that same target again (this second strike provokes no Retaliation).", cardImage: azurCard("golden", "i-19", "pack") },
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
  "azure_breeze.dwelling_gold": 7,
  // Hidden Leaf — mirrors Fuyuki's layout: the "extra" building (Chunin Arena)
  // shares the LV4 (dwelling_silver) bar; every other bar is a single building.
  "hidden_leaf.city_hall": 1,
  "hidden_leaf.dwelling_bronze": 2,
  "hidden_leaf.summoning_shrine": 3,
  "hidden_leaf.dwelling_silver": 4,
  "hidden_leaf.chunin_arena": 4,
  "hidden_leaf.mage_guild": 5,
  "hidden_leaf.citadel": 6,
  "hidden_leaf.dwelling_gold": 7,
  // Azur Lane — mirrors Fuyuki's layout: the "extra" building (Munitions
  // Workshop) shares the LV4 (dwelling_silver) bar; every other bar is a single
  // building.
  "azur_lane.city_hall": 1,
  "azur_lane.dwelling_bronze": 2,
  "azur_lane.munitions_workshop": 3,
  "azur_lane.dwelling_silver": 4,
  "azur_lane.exercise_waters": 4,
  "azur_lane.mage_guild": 5,
  "azur_lane.citadel": 6,
  "azur_lane.dwelling_gold": 7
};

/** The dashed art-file prefix for a faction's bar slices (id keeps the underscore). */
const barArtPrefix = (faction: "fuyuki" | "azure_breeze" | "hidden_leaf" | "azur_lane"): string =>
  faction === "azure_breeze"
    ? "azure-breeze"
    : faction === "hidden_leaf"
      ? "hidden-leaf"
      : faction === "azur_lane"
        ? "azur-lane"
        : faction;

const building = (
  id: string,
  name: string,
  faction: "fuyuki" | "azure_breeze" | "hidden_leaf" | "azur_lane",
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
    image: `/assets/town-board/${barArtPrefix(faction)}-bar-${animeTownBuildingBar[id]}.webp`
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
  // Silver dwelling unlocks LV4 Sect Protectors + LV5 True Inheritors (not the LV3 crane).
  "azure_breeze.dwelling_silver": building("azure_breeze.dwelling_silver", "Inheritance Pavilion", "azure_breeze", { gold: 8, buildingMaterials: 6, valuables: 3 }, { type: "UNLOCK_RECRUIT_TIER", tier: "silver" }, ["azure_breeze.dwelling_bronze"]),
  // Gold dwelling unlocks LV6 Core Formation Master + LV7 Mountain Guardian.
  "azure_breeze.dwelling_gold": building("azure_breeze.dwelling_gold", "Golden Core Summit", "azure_breeze", { gold: 10, buildingMaterials: 9, valuables: 4 }, { type: "UNLOCK_RECRUIT_TIER", tier: "gold" }, ["azure_breeze.dwelling_silver"]),
  "azure_breeze.alchemy_pavilion": building("azure_breeze.alchemy_pavilion", "Alchemy Pavilion", "azure_breeze", { gold: 7, buildingMaterials: 4 }, { type: "RESOURCE_ROUND_RESOURCE_DIE" }),
  "azure_breeze.sword_pavilion": building("azure_breeze.sword_pavilion", "Sword Pavilion", "azure_breeze", { gold: 7, buildingMaterials: 4 }, { type: "HALL_OF_VALHALLA", amount: 1 }),

  // Hidden Leaf — shared archetypes only (ZERO new TownBuildingEffect types),
  // costs mirroring the Fuyuki/Azure twins per archetype.
  "hidden_leaf.city_hall": building("hidden_leaf.city_hall", "Mission Board", "hidden_leaf", { gold: 10, buildingMaterials: 4 }, { type: "RESOURCE_ROUND_CHOICE", options: [{ label: "Gain 3 gold", gold: 3 }, { label: "Gain 1 valuables", valuables: 1 }] }),
  "hidden_leaf.citadel": building("hidden_leaf.citadel", "Village Walls", "hidden_leaf", { gold: 8, buildingMaterials: 5, valuables: 1 }, { type: "UNLOCK_REINFORCE" }),
  "hidden_leaf.mage_guild": { ...building("hidden_leaf.mage_guild", "Scroll Vault", "hidden_leaf", { gold: 4, buildingMaterials: 2, valuables: 1 }, { type: "MAGE_GUILD" }), spellBookCost: 5 },
  "hidden_leaf.dwelling_bronze": building("hidden_leaf.dwelling_bronze", "Ninja Academy", "hidden_leaf", { gold: 5, buildingMaterials: 3, valuables: 1 }, { type: "UNLOCK_RECRUIT_TIER", tier: "bronze" }),
  "hidden_leaf.dwelling_silver": building("hidden_leaf.dwelling_silver", "Forest of Death", "hidden_leaf", { gold: 8, buildingMaterials: 6, valuables: 3 }, { type: "UNLOCK_RECRUIT_TIER", tier: "silver" }, ["hidden_leaf.dwelling_bronze"]),
  "hidden_leaf.dwelling_gold": building("hidden_leaf.dwelling_gold", "Sanctum of the Tailed Beast", "hidden_leaf", { gold: 10, buildingMaterials: 9, valuables: 4 }, { type: "UNLOCK_RECRUIT_TIER", tier: "gold" }, ["hidden_leaf.dwelling_silver"]),
  "hidden_leaf.chunin_arena": building("hidden_leaf.chunin_arena", "Chunin Exam Arena", "hidden_leaf", { gold: 7, buildingMaterials: 4 }, { type: "HALL_OF_VALHALLA", amount: 1 }),
  "hidden_leaf.summoning_shrine": building("hidden_leaf.summoning_shrine", "Summoning Pact Shrine", "hidden_leaf", { gold: 7, buildingMaterials: 4, valuables: 1 }, { type: "TURN_START_PORTAL_SUMMON" }),

  // Azur Lane — shared archetypes only (ZERO new TownBuildingEffect types),
  // costs mirroring the Fuyuki/Azure/Hidden-Leaf twins per archetype.
  "azur_lane.city_hall": building("azur_lane.city_hall", "Naval Command HQ", "azur_lane", { gold: 10, buildingMaterials: 4 }, { type: "RESOURCE_ROUND_CHOICE", options: [{ label: "Gain 5 gold", gold: 5 }, { label: "Gain 1 valuables", valuables: 1 }] }),
  "azur_lane.citadel": building("azur_lane.citadel", "Fortified Anchorage", "azur_lane", { gold: 8, buildingMaterials: 5, valuables: 1 }, { type: "UNLOCK_REINFORCE" }),
  "azur_lane.mage_guild": { ...building("azur_lane.mage_guild", "Naval Research Academy", "azur_lane", { gold: 4, buildingMaterials: 2, valuables: 1 }, { type: "MAGE_GUILD" }), spellBookCost: 5 },
  "azur_lane.dwelling_bronze": building("azur_lane.dwelling_bronze", "Escort Docks", "azur_lane", { gold: 5, buildingMaterials: 3, valuables: 1 }, { type: "UNLOCK_RECRUIT_TIER", tier: "bronze" }),
  "azur_lane.dwelling_silver": building("azur_lane.dwelling_silver", "Cruiser Shipyard", "azur_lane", { gold: 8, buildingMaterials: 6, valuables: 3 }, { type: "UNLOCK_RECRUIT_TIER", tier: "silver" }, ["azur_lane.dwelling_bronze"]),
  "azur_lane.dwelling_gold": building("azur_lane.dwelling_gold", "Capital Ship Berth", "azur_lane", { gold: 10, buildingMaterials: 9, valuables: 4 }, { type: "UNLOCK_RECRUIT_TIER", tier: "gold" }, ["azur_lane.dwelling_silver"]),
  "azur_lane.munitions_workshop": building("azur_lane.munitions_workshop", "Munitions Workshop", "azur_lane", { gold: 6, buildingMaterials: 4 }, { type: "ARTIFACT_SMITH", searchCost: 5, sellGold: 3 }),
  "azur_lane.exercise_waters": building("azur_lane.exercise_waters", "Combat Exercise Waters", "azur_lane", { gold: 7, buildingMaterials: 4 }, { type: "HALL_OF_VALHALLA", amount: 1 })
};

export const animeTownHeroDefinitions: Record<string, HeroDefinition> = {
  bin: {
    id: "bin", name: "Bin", faction: "fuyuki", class: "Contractor", type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.leadership",
    specialtyCardIds: { 1: "specialty.bin.1", 4: "specialty.bin.4", 6: "specialty.bin.6" },
    portrait: "/assets/anime/heroes/bin.webp", source
  },
  aoko: {
    id: "aoko", name: "Aoko", faction: "fuyuki", class: "Leyline Magus", type: "magic",
    startingStats: { attack: 1, defense: 1, power: 2, knowledge: 2 },
    startingAbilityCardId: "ability.sorcery",
    specialtyCardIds: { 1: "specialty.aoko.1", 4: "specialty.aoko.4", 6: "specialty.aoko.6" },
    portrait: "/assets/anime/heroes/aoko.webp", source
  },
  miku: {
    id: "miku",
    name: "Miku",
    faction: "fuyuki",
    class: "Virtual Diva",
    type: "magic",
    startingStats: { attack: 1, defense: 1, power: 2, knowledge: 2 },
    startingAbilityCardId: "ability.interference",
    specialtyCardIds: { 1: "specialty.miku.1", 4: "specialty.miku.4", 6: "specialty.miku.6" },
    portrait: "/assets/anime/heroes/miku.webp",
    source
  },
  qingyun: {
    id: "qingyun", name: "Qingyun", faction: "azure_breeze", class: "Sword Cultivator", type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.offense",
    specialtyCardIds: { 1: "specialty.qingyun.1", 4: "specialty.qingyun.4", 6: "specialty.qingyun.6" },
    portrait: "/assets/anime/heroes/qingyun.webp", source
  },
  lingxi: {
    id: "lingxi", name: "Lingxi", faction: "azure_breeze", class: "Formation Sage", type: "magic",
    startingStats: { attack: 1, defense: 2, power: 2, knowledge: 1 },
    startingAbilityCardId: "ability.wisdom",
    specialtyCardIds: { 1: "specialty.lingxi.1", 4: "specialty.lingxi.4", 6: "specialty.lingxi.6" },
    portrait: "/assets/anime/heroes/lingxi.webp", source
  },
  naruto: {
    id: "naruto", name: "Naruto Uzumaki", faction: "hidden_leaf", class: "Jinchuriki", type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.leadership",
    specialtyCardIds: { 1: "specialty.naruto.1", 4: "specialty.naruto.4", 6: "specialty.naruto.6" },
    portrait: "/assets/anime/heroes/naruto.webp", source
  },
  sasuke: {
    id: "sasuke", name: "Sasuke Uchiha", faction: "hidden_leaf", class: "Uchiha Avenger", type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.offense",
    specialtyCardIds: { 1: "specialty.sasuke.1", 4: "specialty.sasuke.4", 6: "specialty.sasuke.6" },
    portrait: "/assets/anime/heroes/sasuke.webp", source
  },
  tsunade: {
    id: "tsunade", name: "Tsunade", faction: "hidden_leaf", class: "Legendary Medic", type: "magic",
    startingStats: { attack: 1, defense: 1, power: 2, knowledge: 2 },
    startingAbilityCardId: "ability.wisdom",
    specialtyCardIds: { 1: "specialty.tsunade.1", 4: "specialty.tsunade.4", 6: "specialty.tsunade.6" },
    portrait: "/assets/anime/heroes/tsunade.webp", source
  },
  enterprise: {
    id: "enterprise", name: "Enterprise", faction: "azur_lane", class: "Grey Ghost", type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.leadership",
    specialtyCardIds: { 1: "specialty.enterprise.1", 4: "specialty.enterprise.4", 6: "specialty.enterprise.6" },
    portrait: "/assets/anime/heroes/enterprise.webp", source
  },
  bismarck: {
    id: "bismarck", name: "Bismarck", faction: "azur_lane", class: "Iron Blood Flagship", type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.offense",
    specialtyCardIds: { 1: "specialty.bismarck.1", 4: "specialty.bismarck.4", 6: "specialty.bismarck.6" },
    portrait: "/assets/anime/heroes/bismarck.webp", source
  },
  nagato: {
    id: "nagato", name: "Nagato", faction: "azur_lane", class: "Big Seven Flagship", type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.tactics",
    specialtyCardIds: { 1: "specialty.nagato.1", 4: "specialty.nagato.4", 6: "specialty.nagato.6" },
    portrait: "/assets/anime/heroes/nagato.webp", source
  },
  akashi: {
    id: "akashi", name: "Akashi", faction: "azur_lane", class: "Chief Shipwright", type: "magic",
    startingStats: { attack: 1, defense: 1, power: 2, knowledge: 2 },
    startingAbilityCardId: "ability.wisdom",
    specialtyCardIds: { 1: "specialty.akashi.1", 4: "specialty.akashi.4", 6: "specialty.akashi.6" },
    portrait: "/assets/anime/heroes/akashi.webp", source
  },
  sirius: {
    id: "sirius", name: "Sirius", faction: "azur_lane", class: "Royal Maid Gunner", type: "magic",
    startingStats: { attack: 1, defense: 2, power: 2, knowledge: 1 },
    startingAbilityCardId: "ability.sorcery",
    specialtyCardIds: { 1: "specialty.sirius.1", 4: "specialty.sirius.4", 6: "specialty.sirius.6" },
    portrait: "/assets/anime/heroes/sirius.webp", source
  }
};

/** Fixed LV1→LV7 recruit order. Never derive this from ad-hoc Object.values. */
export const AZURE_BREEZE_UNIT_ORDER = [
  "azure_breeze.outer_disciples", // LV1 bronze
  "azure_breeze.inner_swordsmen", // LV2 bronze
  "azure_breeze.spirit_crane", // LV3 bronze
  "azure_breeze.sect_protectors", // LV4 silver
  "azure_breeze.true_inheritors", // LV5 silver (Qingyun specialty)
  "azure_breeze.core_master", // LV6 gold
  "azure_breeze.mountain_guardian" // LV7 gold
] as const;

export const animeTownFactionDefinitions: Record<string, FactionDefinition> = {
  fuyuki: {
    id: "fuyuki", name: "Fuyuki City", color: "#7256d8", startingTileId: "A-S1",
    heroes: ["bin", "aoko", "miku"],
    buildings: Object.values(animeTownBuildingDefinitions).filter((item) => item.faction === "fuyuki").map((item) => item.id),
    units: Object.values(animeTownUnitDefinitions).filter((item) => item.faction === "fuyuki").map((item) => item.id),
    townImage: "/assets/anime/towns/fuyuki-city-empty-v2.webp", source
  },
  azure_breeze: {
    id: "azure_breeze", name: "Azure Breeze Sect", color: "#27a9a0", startingTileId: "W-S1",
    heroes: ["qingyun", "lingxi"],
    buildings: Object.values(animeTownBuildingDefinitions).filter((item) => item.faction === "azure_breeze").map((item) => item.id),
    units: [...AZURE_BREEZE_UNIT_ORDER],
    townImage: "/assets/anime/towns/azure-breeze-sect-empty-v2.webp", source
  },
  hidden_leaf: {
    id: "hidden_leaf", name: "Hidden Leaf Village", color: "#4f9d45", startingTileId: "L-S1",
    heroes: ["naruto", "sasuke", "tsunade"],
    // `units` derives from the animeTownUnitDefinitions insertion order (bronze →
    // gold), exactly like Fuyuki — no explicit order array (nothing consumes one).
    buildings: Object.values(animeTownBuildingDefinitions).filter((item) => item.faction === "hidden_leaf").map((item) => item.id),
    units: Object.values(animeTownUnitDefinitions).filter((item) => item.faction === "hidden_leaf").map((item) => item.id),
    townImage: "/assets/anime/towns/hidden-leaf-village-empty.webp", source
  },
  azur_lane: {
    id: "azur_lane", name: "Azur Lane Naval Base", color: "#2f6fc1", startingTileId: "P-S1",
    heroes: ["enterprise", "bismarck", "nagato", "akashi", "sirius"],
    // `units` derives from the animeTownUnitDefinitions insertion order (bronze →
    // gold), exactly like Fuyuki / Hidden Leaf — no explicit order array.
    buildings: Object.values(animeTownBuildingDefinitions).filter((item) => item.faction === "azur_lane").map((item) => item.id),
    units: Object.values(animeTownUnitDefinitions).filter((item) => item.faction === "azur_lane").map((item) => item.id),
    townImage: "/assets/anime/towns/azur-lane-base-empty.webp", source
  }
};

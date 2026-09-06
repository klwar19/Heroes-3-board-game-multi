import type {
  FactionDefinition,
  HeroDefinition,
  TownBuildingDefinition,
  UnitDefinition
} from "@/data/factions/types";
import { blueArchiveCharacters } from "@/data/anime/blue-archive-content";
import { unitAbilities } from "@/data/units/abilities";

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
const demonCard = (tier: "bronze" | "silver" | "golden", slug: string, side: "few" | "pack") =>
  `/assets/anime/units/heavenly-demon/units-heavenly-demon-${tier}-${slug}-${side}.webp`;
const littleBustersCard = (tier: "bronze" | "silver" | "golden", slug: string, side: "few" | "pack") =>
  `/assets/anime/units/little-busters/units-little-busters-${tier}-${slug}-${side}.webp`;

/** Two complete seven-line faction rosters: one anime/isekai, one wuxia. */
const blueArchiveSource = {
  product: "Blue Archive — Kivotos Academy Domain",
  credit: "Character names and supplied reference art belong to NEXON Games / Yostar. Original board-game adaptation for this project.",
  url: "https://bluearchive.wiki/wiki/Characters"
} as const;

export const blueArchiveUnitDefinitions: Record<string, UnitDefinition> = Object.fromEntries(
  blueArchiveCharacters.map((unit) => {
    // Never substitute a nearby generic mechanic for the authored Kivotos
    // effect. A tag is live only after that exact ability is engine-wired and
    // behavior-tested; pending abilities remain visible in the reference text
    // but do not silently execute a different rule.
    const wired = (abilityId: string): string[] =>
      unitAbilities[abilityId]?.implementationStatus === "implemented" ? [abilityId] : [];
    const fewText = `${unit.few.abilityName} — ${unit.few.abilityText}`;
    const packText = `${fewText}\n${unit.pack.abilityName} — ${unit.pack.abilityText}`;
    return [unit.id, {
      id: unit.id,
      name: unit.name,
      faction: "blue_archive",
      tier: unit.tier,
      type: unit.type,
      few: {
        attack: unit.few.attack,
        defense: unit.few.defense,
        health: unit.few.health,
        initiative: unit.few.initiative,
        cost: { gold: unit.few.gold, ...(unit.few.materials ? { buildingMaterials: unit.few.materials } : {}), ...(unit.few.valuables ? { valuables: unit.few.valuables } : {}) },
        abilities: wired(unit.few.ability),
        abilityText: fewText,
        cardImage: unit.few.art
      },
      pack: {
        attack: unit.pack.attack,
        defense: unit.pack.defense,
        health: unit.pack.health,
        initiative: unit.pack.initiative,
        cost: { gold: unit.pack.gold, ...(unit.pack.materials ? { buildingMaterials: unit.pack.materials } : {}), ...(unit.pack.valuables ? { valuables: unit.pack.valuables } : {}) },
        abilities: [...wired(unit.few.ability), ...wired(unit.pack.ability)],
        abilityText: packText,
        cardImage: unit.pack.art
      },
      wikiUrl: `https://bluearchive.wiki/wiki/${encodeURIComponent(unit.name)}`,
      source: blueArchiveSource
    } satisfies UnitDefinition];
  })
);

export const animeTownUnitDefinitions: Record<string, UnitDefinition> = {
  ...blueArchiveUnitDefinitions,
  "fuyuki.assassins": {
    id: "fuyuki.assassins", name: "Sasaki Kojirō", faction: "fuyuki", tier: "bronze", type: "ground",
    few: { attack: 2, defense: 1, health: 2, initiative: 8, cost: { gold: 2 }, abilities: [], cardImage: fuyukiCard("bronze", "assassins", "few") },
    pack: { attack: 2, defense: 1, health: 2, initiative: 9, cost: { gold: 3 }, abilities: ["ignores-retaliation"], abilityText: "Presence Concealment — attacks do not provoke Retaliation.", cardImage: fuyukiCard("bronze", "assassins", "pack") },
    source
  },
  "fuyuki.riders": {
    id: "fuyuki.riders", name: "Medusa", faction: "fuyuki", tier: "bronze", type: "ground",
    few: { attack: 2, defense: 1, health: 2, initiative: 7, cost: { gold: 3 }, abilities: [], cardImage: fuyukiCard("bronze", "riders", "few") },
    pack: { attack: 3, defense: 1, health: 3, initiative: 8, cost: { gold: 5 }, abilities: ["basilisk-paralysis"], abilityText: "Mystic Eyes — after attacking, roll a die; on 0 the target is Paralyzed.", cardImage: fuyukiCard("bronze", "riders", "pack") },
    source
  },
  "fuyuki.lancers": {
    id: "fuyuki.lancers", name: "Cú Chulainn", faction: "fuyuki", tier: "bronze", type: "ground",
    few: { attack: 3, defense: 1, health: 3, initiative: 6, cost: { gold: 4 }, abilities: ["mechanics-line-attack-1"], abilityText: "Gáe Bolg — strike through the target for a second Attack 1 hit.", cardImage: fuyukiCard("bronze", "lancers", "few") },
    pack: { attack: 3, defense: 2, health: 3, initiative: 7, cost: { gold: 6 }, abilities: ["mechanics-line-attack-2"], abilityText: "Gáe Bolg — strike behind the target at Attack 2.", cardImage: fuyukiCard("bronze", "lancers", "pack") },
    source
  },
  "fuyuki.archers": {
    id: "fuyuki.archers", name: "EMIYA", faction: "fuyuki", tier: "silver", type: "ranged",
    few: { attack: 3, defense: 1, health: 4, initiative: 9, cost: { gold: 8 }, abilities: ["ignore-combat-penalties"], abilityText: "Hawkeye — ignores the adjacent ranged Combat penalty.", cardImage: fuyukiCard("silver", "archers", "few") },
    pack: { attack: 3, defense: 1, health: 4, initiative: 9, cost: { gold: 11 }, abilities: ["ignore-all-combat-penalties", "double-attack"], abilityText: "Unlimited Blade Works — ignores ranged penalties and attacks a distant target twice.", cardImage: fuyukiCard("silver", "archers", "pack") },
    source
  },
  "fuyuki.casters": {
    id: "fuyuki.casters", name: "Medea", faction: "fuyuki", tier: "silver", type: "ranged",
    // engine: elemental-damage + a once-per-combat-round 1-damage cap.
    // + magi-power-boost. Pack no longer uses reduce-spell-damage-1 — the hard
    // cap is strictly stronger and covers attacks too.
    few: {
      attack: 2,
      defense: 1,
      health: 3,
      initiative: 4,
      cost: { gold: 8 },
      abilities: ["elemental-damage", "casters-damage-cap", "fuyuki-caster-fixed-2"],
      abilityText:
        "Rule Breaker — always deals exactly 2 damage without an Attack die or buffs; once per Combat round cap one incoming attack or Spell at 1 damage.",
      cardImage: fuyukiCard("silver", "casters", "few")
    },
    pack: {
      attack: 3,
      defense: 1,
      health: 3,
      initiative: 6,
      cost: { gold: 13 },
      abilities: ["elemental-damage", "casters-damage-cap", "magi-power-boost", "fuyuki-caster-fixed-3"],
      abilityText:
        "High-Speed Divine Words — always deals exactly 3 damage without an Attack die or buffs; once per Combat round cap one incoming attack or Spell at 1 damage; first Spell this round +1 Power.",
      cardImage: fuyukiCard("silver", "casters", "pack")
    },
    source
  },
  "fuyuki.sabers": {
    id: "fuyuki.sabers", name: "Artoria Pendragon", faction: "fuyuki", tier: "gold", type: "ground",
    few: { attack: 5, defense: 2, health: 6, initiative: 6, cost: { gold: 14, valuables: 1 }, abilities: ["dragon-line-attack-2"], abilityText: "Excalibur — a second Attack 2 hit strikes behind the target.", cardImage: fuyukiCard("golden", "sabers", "few") },
    pack: { attack: 6, defense: 2, health: 7, initiative: 7, cost: { gold: 22, valuables: 2 }, abilities: ["dragon-line-attack-3", "commander-charge", "saber-first-attack-defense"], abilityText: "Excalibur — line strike at Attack 3; +1 Attack after moving. Avalon Guard — +1 Defense against the first attack of each Combat round only.", cardImage: fuyukiCard("golden", "sabers", "pack") },
    source
  },
  "fuyuki.berserkers": {
    id: "fuyuki.berserkers", name: "Heracles", faction: "fuyuki", tier: "gold", type: "ground",
    few: { attack: 6, defense: 2, health: 7, initiative: 7, cost: { gold: 15, valuables: 1 }, abilities: ["phoenix-rebirth"], abilityText: "God Hand — once per Combat, lethal damage leaves this unit at 1 Health.", cardImage: fuyukiCard("golden", "berserkers", "few") },
    pack: { attack: 7, defense: 2, health: 8, initiative: 7, cost: { gold: 24, valuables: 2 }, abilities: ["reduce-spell-damage-1"], abilityText: "God Hand — Spell damage against this unit is reduced by 1.", cardImage: fuyukiCard("golden", "berserkers", "pack") },
    source
  },

  // Azure Breeze printed levels (3 bronze / 2 silver / 2 gold) — CANONICAL order:
  // LV1 Outer · LV2 Inner · LV3 Spirit Crane (bronze) ·
  // LV4 Sect Formation Wardens · LV5 True Inheritors (silver) ·
  // LV6 Golden Core Elders · LV7 Mountain Guardian (gold).
  // Keep this object key order = recruit order. Do not reorder casually.
  // --- BRONZE (3) — LV 1–3 -------------------------------------------------
  "azure_breeze.outer_disciples": {
    id: "azure_breeze.outer_disciples", name: "Outer Sect Disciples", faction: "azure_breeze", tier: "bronze", type: "ground",
    few: { attack: 2, defense: 1, health: 2, initiative: 5, cost: { gold: 2 }, abilities: [], cardImage: azureCard("bronze", "outer-sect-disciples", "few") },
    pack: { attack: 2, defense: 1, health: 3, initiative: 6, cost: { gold: 4 }, abilities: ["azure-sword-array"], abilityText: "Sword Array — friendly units gain +1 Attack on their own attacks while adjacent to this unit.", cardImage: azureCard("bronze", "outer-sect-disciples", "pack") },
    source
  },
  "azure_breeze.inner_swordsmen": {
    id: "azure_breeze.inner_swordsmen", name: "Inner Sect Swordsmen", faction: "azure_breeze", tier: "bronze", type: "ground",
    few: { attack: 2, defense: 1, health: 2, initiative: 7, cost: { gold: 3 }, abilities: ["ignore-combat-penalties"], abilityText: "Flowing Step — ignores the adjacent Combat penalty.", cardImage: azureCard("bronze", "inner-sect-swordsmen", "few") },
    pack: { attack: 3, defense: 1, health: 3, initiative: 8, cost: { gold: 5 }, abilities: ["ignore-all-combat-penalties"], abilityText: "Flowing Step — ignores all Combat penalties.", cardImage: azureCard("bronze", "inner-sect-swordsmen", "pack") },
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
    id: "azure_breeze.sect_protectors", name: "Sect Formation Wardens", faction: "azure_breeze", tier: "silver", type: "ground",
    few: { attack: 3, defense: 2, health: 4, initiative: 4, cost: { gold: 8 }, abilities: ["commander-defense-token"], abilityText: "Iron Ward — always rolls the Defend die when attacked.", cardImage: azureCard("silver", "sect-protectors", "few") },
    pack: { attack: 4, defense: 2, health: 5, initiative: 4, cost: { gold: 13 }, abilities: ["unlimited-retaliation"], abilityText: "Unbroken Guard — may Retaliate any number of times each round.", cardImage: azureCard("silver", "sect-protectors", "pack") },
    source
  },
  // LV 5 silver sword heirs — fast martial line before the Golden Core elders.
  "azure_breeze.true_inheritors": {
    id: "azure_breeze.true_inheritors", name: "True Inheritors", faction: "azure_breeze", tier: "silver", type: "ground",
    few: { attack: 3, defense: 2, health: 4, initiative: 6, cost: { gold: 9 }, abilities: ["commander-charge"], abilityText: "Charge — +1 Attack after moving.", cardImage: azureCard("silver", "true-inheritors", "few") },
    pack: { attack: 4, defense: 2, health: 5, initiative: 7, cost: { gold: 13 }, abilities: ["commander-charge", "ignores-retaliation"], abilityText: "Peerless Form — Charge; ignores Retaliation.", cardImage: azureCard("silver", "true-inheritors", "pack") },
    source
  },
  // --- GOLD (2) — LV 6–7 ---------------------------------------------------
  // LV 6 gold ranged elders. The Pack deliberately costs only 1 valuable.
  "azure_breeze.core_master": {
    id: "azure_breeze.core_master", name: "Golden Core Elders", faction: "azure_breeze", tier: "gold", type: "ranged",
    few: { attack: 4, defense: 1, health: 6, initiative: 6, cost: { gold: 14, valuables: 1 }, abilities: ["ignore-all-combat-penalties", "magi-power-boost"], abilityText: "Talisman Arts — ignores penalties; first Spell +1 Power.", cardImage: azureCard("golden", "core-formation-master", "few") },
    pack: { attack: 5, defense: 1, health: 7, initiative: 6, cost: { gold: 22, valuables: 1 }, abilities: ["ignore-all-combat-penalties", "magi-power-boost", "unicorn-spell-ward-aura"], abilityText: "Talisman Aura — first Spell +1 Power; protects adjacent allies from Spell damage.", cardImage: azureCard("golden", "core-formation-master", "pack") },
    source
  },
  // LV 7 gold mountain tank.
  "azure_breeze.mountain_guardian": {
    id: "azure_breeze.mountain_guardian", name: "Mountain Guardian", faction: "azure_breeze", tier: "gold", type: "ground",
    few: { attack: 5, defense: 3, health: 8, initiative: 3, cost: { gold: 15, valuables: 1 }, abilities: ["wraith-heal-1"], abilityText: "Verdant Pulse — on activation, heal 1 damage.", cardImage: azureCard("golden", "mountain-guardian", "few") },
    pack: { attack: 6, defense: 3, health: 9, initiative: 3, cost: { gold: 23, valuables: 2 }, abilities: ["wraith-heal-1", "unlimited-retaliation"], abilityText: "Returning Earth — heal 1 on activation; unlimited Retaliation.", cardImage: azureCard("golden", "mountain-guardian", "pack") },
    source
  },

  // Hidden Leaf Village printed levels (3 bronze / 2 silver / 3 gold) — CANONICAL
  // recruit order = object key order (the faction derives `units` from this order
  // via a filter, exactly like Fuyuki). Swarm identity: fast + frail + cheap on
  // the bronze line, control/tank on silver, AoE/armored on gold. Every ability
  // tag resolves to an IMPLEMENTED unitAbilities entry; abilityText restates ONLY
  // what that arm runs, shinobi-flavored. A Few side listed [] carries no ability
  // and (per CLAUDE.md §2) no abilityText.
  // --- BRONZE (3) ----------------------------------------------------------
  "hidden_leaf.genin_squad": {
    id: "hidden_leaf.genin_squad", name: "Academy Genin", faction: "hidden_leaf", tier: "bronze", type: "ground",
    few: { attack: 2, defense: 1, health: 2, initiative: 7, cost: { gold: 2 }, abilities: [], cardImage: hiddenLeafCard("bronze", "genin-squad", "few") },
    // Genin Pack reuses the EXACT id Azure's Outer Sect Disciples Pack carries
    // (wog-attack-when-attacking-1 = OWN_ATTACK_FLAT_BONUS +1, own attacks only).
    pack: { attack: 2, defense: 1, health: 3, initiative: 8, cost: { gold: 4 }, abilities: ["wog-attack-when-attacking-1"], abilityText: "Shadow Clone Formation — this unit gains +1 Attack on its own attacks, never on Retaliation.", cardImage: hiddenLeafCard("bronze", "genin-squad", "pack") },
    source
  },
  "hidden_leaf.medical_nin": {
    id: "hidden_leaf.medical_nin", name: "Sakura's Medical Corps", faction: "hidden_leaf", tier: "bronze", type: "ground",
    few: { attack: 1, defense: 1, health: 3, initiative: 6, cost: { gold: 3 }, abilities: [], cardImage: hiddenLeafCard("bronze", "medical-nin", "few") },
    pack: { attack: 2, defense: 2, health: 3, initiative: 6, cost: { gold: 5 }, abilities: ["enchanter-heal-or-buff"], abilityText: "Mystical Palm — on activation, heal another friendly unit by 2; if none can be healed, gain +1 Attack this round.", cardImage: hiddenLeafCard("bronze", "medical-nin", "pack") },
    source
  },
  // LV3 bronze RANGED skirmisher.
  "hidden_leaf.anbu": {
    id: "hidden_leaf.anbu", name: "ANBU Black Ops", faction: "hidden_leaf", tier: "bronze", type: "ranged",
    few: { attack: 2, defense: 1, health: 2, initiative: 8, cost: { gold: 4 }, abilities: ["ignore-combat-penalties"], abilityText: "Shadow Step — ignores the adjacent ranged Combat penalty.", cardImage: hiddenLeafCard("bronze", "anbu", "few") },
    pack: { attack: 3, defense: 2, health: 3, initiative: 9, cost: { gold: 7 }, abilities: ["ignore-combat-penalties", "teleport-move"], abilityText: "Body Flicker — ignores the adjacent ranged penalty and may move to any empty space.", cardImage: hiddenLeafCard("bronze", "anbu", "pack") },
    source
  },
  // --- SILVER (2) ----------------------------------------------------------
  // LV4 silver RANGED elite.
  "hidden_leaf.jonin": {
    id: "hidden_leaf.jonin", name: "Leaf Jōnin", faction: "hidden_leaf", tier: "silver", type: "ranged",
    few: { attack: 3, defense: 2, health: 4, initiative: 6, cost: { gold: 8 }, abilities: ["ignore-combat-penalties"], abilityText: "Kunai Barrage — ignores the adjacent ranged Combat penalty.", cardImage: hiddenLeafCard("silver", "jonin", "few") },
    pack: { attack: 4, defense: 2, health: 4, initiative: 7, cost: { gold: 11 }, abilities: ["ignore-all-combat-penalties", "ignores-retaliation"], abilityText: "Jōnin Mastery — ignores all ranged penalties and never provokes Retaliation.", cardImage: hiddenLeafCard("silver", "jonin", "pack") },
    source
  },
  // LV5 silver ground TANK.
  "hidden_leaf.giant_toad": {
    id: "hidden_leaf.giant_toad", name: "Gamabunta", faction: "hidden_leaf", tier: "silver", type: "ground",
    few: { attack: 3, defense: 3, health: 5, initiative: 4, cost: { gold: 9 }, abilities: ["commander-defense-token"], abilityText: "Toad Hide — always rolls the Defend die when attacked.", cardImage: hiddenLeafCard("silver", "giant-toad", "few") },
    pack: { attack: 4, defense: 3, health: 6, initiative: 5, cost: { gold: 13 }, abilities: ["commander-defense-token", "automaton-detonate-1"], abilityText: "Toad Hide — always rolls the Defend die; Smoke Bomb deals 1 damage to every adjacent unit when defeated.", cardImage: hiddenLeafCard("silver", "giant-toad", "pack") },
    source
  },
  // --- GOLD (2) ------------------------------------------------------------
  // LV6 gold AoE beast — Few splashes (Chakra Burst), Pack second-attacks all
  // adjacent enemies (the Few→Pack ability swap is the mutation control).
  "hidden_leaf.jinchuriki": {
    id: "hidden_leaf.jinchuriki", name: "Nine-Tails Chakra Avatar", faction: "hidden_leaf", tier: "gold", type: "ground",
    few: { attack: 5, defense: 2, health: 6, initiative: 6, cost: { gold: 15, valuables: 1 }, abilities: ["jinchuriki-chakra-burst"], abilityText: "Chakra Burst — after an attack made by this unit resolves, deal 1 damage to every other unit adjacent to it — friend AND foe. Not an attack: no Retaliation, not reduced by Defense, not subject to per-attack damage caps. Does not fire on a Retaliation Attack.", cardImage: hiddenLeafCard("golden", "jinchuriki", "few") },
    pack: { attack: 6, defense: 3, health: 7, initiative: 8, cost: { gold: 24, valuables: 2 }, abilities: ["magic-elemental-attack-all-enemies"], abilityText: "Tailed-Beast Cloak — after attacking, make a separate non-chaining attack against every other adjacent enemy; these cannot Retaliate.", cardImage: hiddenLeafCard("golden", "jinchuriki", "pack") },
    source
  },
  // LV7 gold armored avatar.
  "hidden_leaf.susanoo": {
    id: "hidden_leaf.susanoo", name: "Perfect Susanoo", faction: "hidden_leaf", tier: "gold", type: "ground",
    few: { attack: 5, defense: 3, health: 7, initiative: 4, cost: { gold: 16, valuables: 1 }, abilities: ["nix-damage-cap"], abilityText: "Ethereal Armor — a single attack can deal at most 4 damage; Spell and ability damage are not capped.", cardImage: hiddenLeafCard("golden", "susanoo", "few") },
    pack: { attack: 6, defense: 4, health: 8, initiative: 5, cost: { gold: 25, valuables: 2 }, abilities: ["nix-damage-cap", "titan-ignore-ongoing"], abilityText: "Perfect Armor — attacks deal at most 4 damage; ignore ongoing effects on this unit.", cardImage: hiddenLeafCard("golden", "susanoo", "pack") },
    source
  },
  // Premium multi-character Gold formation. Hidden Leaf's combat rule allows
  // only two Gold cards at once, so this mobile guard competes directly with
  // Nine-Tails' area pressure and Susanoo's damage-cap tanking.
  "hidden_leaf.hokage_vanguard": {
    id: "hidden_leaf.hokage_vanguard", name: "Hokage Vanguard", faction: "hidden_leaf", tier: "gold", type: "ground",
    few: { attack: 5, defense: 2, health: 6, initiative: 7, cost: { gold: 13, valuables: 2 }, abilities: ["teleport-move"], abilityText: "Flying Raijin Formation — this unit may move to any empty space.", cardImage: hiddenLeafCard("golden", "hokage-vanguard", "few") },
    pack: { attack: 6, defense: 2, health: 8, initiative: 8, cost: { gold: 21, valuables: 3 }, abilities: ["teleport-move", "commander-defense-token"], abilityText: "Four Hokage Formation — may move to any empty space and always rolls the Defend die when attacked.", cardImage: hiddenLeafCard("golden", "hokage-vanguard", "pack") },
    source
  },

  // Azur Lane Naval Base printed levels (3 bronze / 3 silver / 3 gold, the
  // 2026-09-05 roster expansion added Ayanami and Akagi) — one
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
    few: { attack: 2, defense: 0, health: 3, initiative: 12, cost: { gold: 2 }, abilities: [], cardImage: azurCard("bronze", "laffey", "few") },
    // ignores-retaliation = its attacks never provoke a Retaliation Attack.
    pack: { attack: 3, defense: 0, health: 4, initiative: 12, cost: { gold: 4 }, abilities: ["ignores-retaliation"], abilityText: "White Demon of Solomon — attacks do not provoke a Retaliation Attack.", cardImage: azurCard("bronze", "laffey", "pack") },
    source
  },
  "azur_lane.javelin": {
    id: "azur_lane.javelin", name: "Javelin", faction: "azur_lane", tier: "bronze", type: "ground",
    few: { attack: 2, defense: 1, health: 2, initiative: 7, cost: { gold: 2 }, abilities: [], cardImage: azurCard("bronze", "javelin", "few") },
    // commander-charge = +1 Attack when it attacks after moving this activation.
    pack: { attack: 2, defense: 1, health: 2, initiative: 8, cost: { gold: 4 }, abilities: ["kansen-best-friends"], abilityText: "Best Friends — +1 Attack when Laffey is in the battlefield.", cardImage: azurCard("bronze", "javelin", "pack") },
    source
  },
  // LV3 bronze RANGED cruiser gunner.
  "azur_lane.honolulu": {
    id: "azur_lane.honolulu", name: "Honolulu", faction: "azur_lane", tier: "bronze", type: "ranged",
    few: { attack: 2, defense: 1, health: 2, initiative: 6, cost: { gold: 4 }, abilities: ["ignore-combat-penalties"], abilityText: "Rapid Fire — ignores the Combat penalty for attacking an adjacent unit (the long-range / behind-wall penalty still applies).", cardImage: azurCard("bronze", "honolulu", "few") },
    // kansen-full-barrage = the town's bespoke around-TARGET splash arm (2026-07
    // upgrade; was wog-attack-when-attacking-1): after her own attack resolves,
    // 1 effect damage to every OTHER enemy adjacent to the struck unit.
    pack: { attack: 3, defense: 1, health: 3, initiative: 7, cost: { gold: 6 }, abilities: ["ignore-combat-penalties", "kansen-full-barrage"], abilityText: "Rapid Fire — ignores the adjacent-unit Combat penalty. Full Barrage — after an attack made by this unit resolves, deal 1 damage to every other ENEMY unit adjacent to the attacked unit (not an attack: no Retaliation, not reduced by Defense, no damage caps; never on a Retaliation Attack).", cardImage: azurCard("bronze", "honolulu", "pack") },
    source
  },
  // --- SILVER (3) ----------------------------------------------------------
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
    pack: { attack: 4, defense: 2, health: 4, initiative: 8, cost: { gold: 11 }, abilities: ["commander-defense-token", "yukikaze-torpedo-run"], abilityText: "The Great Yukikaze — always rolls the Defend die when attacked; Torpedo Run — can reroll a \"-1\" on this unit's Attack die, once per attack.", cardImage: azurCard("silver", "yukikaze", "pack") },
    source
  },
  // LV6 silver ground special-type destroyer — the fleet's charge finisher.
  // Both sides are pure REUSES: commander-charge = +1 Attack when she attacks
  // after moving this activation; ignores-retaliation = her attacks never
  // provoke a Retaliation Attack.
  "azur_lane.ayanami": {
    id: "azur_lane.ayanami", name: "Ayanami", faction: "azur_lane", tier: "silver", type: "ground",
    few: { attack: 3, defense: 1, health: 3, initiative: 10, cost: { gold: 7 }, abilities: ["commander-charge"], abilityText: "Demon's Blade — +1 Attack when she attacks after moving this activation.", cardImage: azurCard("silver", "ayanami", "few") },
    pack: { attack: 4, defense: 1, health: 4, initiative: 11, cost: { gold: 10 }, abilities: ["commander-charge", "ayanami-retaliation-guard"], abilityText: "Demon's Blade — +1 Attack when she attacks after moving; Kamikaze Torpedoes — enemy Retaliation Attacks against her deal 2 less damage (minimum 0).", cardImage: azurCard("silver", "ayanami", "pack") },
    source
  },
  // --- GOLD (3) ------------------------------------------------------------
  // LV6 gold ground unsinkable heavy cruiser.
  "azur_lane.prinz_eugen": {
    id: "azur_lane.prinz_eugen", name: "Prinz Eugen", faction: "azur_lane", tier: "gold", type: "ground",
    few: { attack: 5, defense: 3, health: 7, initiative: 5, cost: { gold: 14, valuables: 1 }, abilities: ["nix-damage-cap"], abilityText: "Unsinkable — this unit cannot take more than 4 damage from a single attack (Spell and ability damage are not capped).", cardImage: azurCard("golden", "prinz-eugen", "few") },
    pack: { attack: 6, defense: 3, health: 8, initiative: 6, cost: { gold: 21, valuables: 2 }, abilities: ["nix-damage-cap", "unlimited-retaliation"], abilityText: "Unsinkable — cannot take more than 4 damage from a single attack; may Retaliate any number of times each round.", cardImage: azurCard("golden", "prinz-eugen", "pack") },
    source
  },
  // LV7 gold ground glass-cannon submarine (the Few→Pack ability ADD — the extra
  // strike arm — is the mutation control).
  "azur_lane.i19": {
    id: "azur_lane.i19", name: "I-19", faction: "azur_lane", tier: "gold", type: "ground",
    few: { attack: 6, defense: 2, health: 5, initiative: 6, cost: { gold: 14, valuables: 1 }, abilities: ["ignores-retaliation", "teleport-move"], abilityText: "Silent Hunter — attacks do not provoke Retaliation; as a regular move, may surface on any empty space.", cardImage: azurCard("golden", "i-19", "few") },
    // sandworm-strike-again = SECOND_ATTACK_SAME_TARGET_AFTER_RETALIATION — after
    // its first attack resolves it can strike the same target again at the
    // printed fixed Attack 4. The follow-up uses the existing same-target
    // after-retaliation sequence and does not provoke another retaliation.
    pack: { attack: 7, defense: 2, health: 6, initiative: 7, cost: { gold: 21, valuables: 2 }, abilities: ["ignores-retaliation", "teleport-move", "i19-oxygen-torpedo-spread"], abilityText: "Silent Hunter — attacks do not provoke Retaliation; as a regular move, may surface on any empty space. Oxygen Torpedo Spread — after its attack resolves, it can attack the same target again with Attack 4.", cardImage: azurCard("golden", "i-19", "pack") },
    source
  },
  // LV7 gold RANGED fleet carrier — the second Azur Lane shooter. Both sides are
  // REUSES: kansen-full-barrage = the town's around-TARGET salvo splash;
  // wog-fire-shield-1 = FIRE_SHIELD_DAMAGE, "an adjacent attacker takes 1 damage
  // after attacking this unit" (the Pack's Foxfire escort screen).
  "azur_lane.akagi": {
    id: "azur_lane.akagi", name: "Akagi", faction: "azur_lane", tier: "gold", type: "ranged",
    few: { attack: 5, defense: 1, health: 7, initiative: 6, cost: { gold: 15, valuables: 1 }, abilities: ["kansen-full-barrage"], abilityText: "Air Strike — after an attack made by this unit resolves, deal 1 damage to every other ENEMY unit adjacent to the attacked unit (not an attack: no Retaliation, not reduced by Defense, no damage caps; never on a Retaliation Attack).", cardImage: azurCard("golden", "akagi", "few") },
    pack: { attack: 6, defense: 1, health: 9, initiative: 7, cost: { gold: 22, valuables: 3 }, abilities: ["kansen-full-barrage", "wog-fire-shield-1"], abilityText: "Air Strike — after an attack made by this unit resolves, deal 1 damage to every other ENEMY unit adjacent to the attacked unit (not an attack: no Retaliation, not reduced by Defense, no damage caps; never on a Retaliation Attack). Foxfire — an adjacent attacker takes 1 damage after attacking Akagi.", cardImage: azurCard("golden", "akagi", "pack") },
    source
  },

  // Heavenly Demon Palace (Thiên Ma Cung) printed levels (3 bronze / 2 silver /
  // 2 gold) — the EVIL demonic-path sect: blood cultists, gu sorcery, ghosts,
  // corpse puppets. CANONICAL recruit order = object key order (the faction
  // derives `units` from this order via a filter, exactly like Fuyuki / Hidden
  // Leaf). Identity: blood-hungry bronze bodies (one RANGED Gu Witch), an
  // undead-tank silver line, and gold ghosts/avatars. Every ability tag resolves
  // to an IMPLEMENTED unitAbilities entry; abilityText restates ONLY what that arm
  // runs. TWO of the tags are the faction's dedicated NEW engine arms —
  // `heavenly-demon-blood-siphon` (Blood Disciples Pack) and `heavenly-demon-reap`
  // (Heavenly Demon Avatar both sides). A Few side listed [] carries no ability
  // and (per CLAUDE.md §2) no abilityText.
  // --- BRONZE (3) ----------------------------------------------------------
  "heavenly_demon.blood_disciples": {
    id: "heavenly_demon.blood_disciples", name: "Blood Disciples", faction: "heavenly_demon", tier: "bronze", type: "ground",
    few: { attack: 2, defense: 0, health: 3, initiative: 6, cost: { gold: 2 }, abilities: [], cardImage: demonCard("bronze", "blood-disciples", "few") },
    // NEW #1 — Blood Siphon: heal 1 after an OWN attack that DEALS damage.
    pack: { attack: 3, defense: 0, health: 3, initiative: 7, cost: { gold: 4 }, abilities: ["heavenly-demon-blood-siphon"], abilityText: "Blood Siphon — after this unit's attack deals damage, remove 1 damage from it. Never on Retaliation.", cardImage: demonCard("bronze", "blood-disciples", "pack") },
    source
  },
  // LV2 bronze RANGED gu sorceress.
  "heavenly_demon.gu_witches": {
    id: "heavenly_demon.gu_witches", name: "Gu Witches", faction: "heavenly_demon", tier: "bronze", type: "ranged",
    few: { attack: 2, defense: 1, health: 2, initiative: 5, cost: { gold: 4 }, abilities: ["ignore-combat-penalties"], abilityText: "Hex Darts — ignores the Combat penalty for attacking an adjacent unit (the long-range / behind-wall penalty still applies).", cardImage: demonCard("bronze", "gu-witches", "few") },
    pack: { attack: 3, defense: 1, health: 2, initiative: 6, cost: { gold: 6 }, abilities: ["ignore-combat-penalties", "basilisk-paralysis"], abilityText: "Hex Darts — ignores the adjacent-unit Combat penalty; Gu Curse — after attacking, roll a die; on 0 the target is Paralyzed.", cardImage: demonCard("bronze", "gu-witches", "pack") },
    source
  },
  // LV3 bronze ground shadow assassin.
  "heavenly_demon.shadow_wraiths": {
    id: "heavenly_demon.shadow_wraiths", name: "Shadow Sabre Disciples", faction: "heavenly_demon", tier: "bronze", type: "ground",
    few: { attack: 2, defense: 0, health: 2, initiative: 9, cost: { gold: 4 }, abilities: [], cardImage: demonCard("bronze", "shadow-wraiths", "few") },
    pack: { attack: 3, defense: 0, health: 3, initiative: 10, cost: { gold: 6 }, abilities: ["ignores-retaliation"], abilityText: "Umbral Step — attacks do not provoke a Retaliation Attack.", cardImage: demonCard("bronze", "shadow-wraiths", "pack") },
    source
  },
  // --- SILVER (2) ----------------------------------------------------------
  // LV4 silver ground undead tank.
  "heavenly_demon.corpse_puppets": {
    id: "heavenly_demon.corpse_puppets", name: "Corpse Puppets", faction: "heavenly_demon", tier: "silver", type: "ground",
    few: { attack: 2, defense: 2, health: 5, initiative: 2, cost: { gold: 9 }, abilities: ["commander-defense-token"], abilityText: "Grave Ward — always rolls the Defend die when attacked.", cardImage: demonCard("silver", "corpse-puppets", "few") },
    pack: { attack: 3, defense: 2, health: 6, initiative: 3, cost: { gold: 13 }, abilities: ["commander-defense-token", "automaton-detonate-1"], abilityText: "Grave Ward — always rolls the Defend die; Corpse Burst — on defeat, deal 1 damage to every adjacent unit.", cardImage: demonCard("silver", "corpse-puppets", "pack") },
    source
  },
  // LV5 silver ground bone raider (fast striker).
  "heavenly_demon.bone_reavers": {
    id: "heavenly_demon.bone_reavers", name: "Bone Reavers", faction: "heavenly_demon", tier: "silver", type: "ground",
    few: { attack: 4, defense: 1, health: 4, initiative: 7, cost: { gold: 9 }, abilities: ["commander-charge"], abilityText: "Reaping Charge — +1 Attack on its attack after this unit moves.", cardImage: demonCard("silver", "bone-reavers", "few") },
    pack: { attack: 5, defense: 1, health: 5, initiative: 8, cost: { gold: 14 }, abilities: ["commander-charge", "ignores-retaliation"], abilityText: "Reaping Charge — +1 Attack after moving; Ghost Blades — ignores Retaliation.", cardImage: demonCard("silver", "bone-reavers", "pack") },
    source
  },
  // --- GOLD (2) ------------------------------------------------------------
  // LV6 gold ranged spectral regenerator.
  "heavenly_demon.ghost_king": {
    id: "heavenly_demon.ghost_king", name: "Ghost King", faction: "heavenly_demon", tier: "gold", type: "ranged",
    few: { attack: 4, defense: 2, health: 7, initiative: 5, cost: { gold: 14, valuables: 1 }, abilities: ["ignore-combat-penalties"], abilityText: "Soulfire — ignores the adjacent ranged penalty.", cardImage: demonCard("golden", "ghost-king", "few") },
    pack: { attack: 5, defense: 2, health: 8, initiative: 6, cost: { gold: 22, valuables: 2 }, abilities: ["ignore-all-combat-penalties", "wraith-heal-1"], abilityText: "Royal Soulfire — ignores all Combat penalties; heal 1 on activation.", cardImage: demonCard("golden", "ghost-king", "pack") },
    source
  },
  // LV7 gold ground avatar — carries the faction's second NEW arm on BOTH sides;
  // the Pack ADDS ongoing-immunity ON TOP (the Few→Pack ADD is the mutation
  // control, mirroring Susanoo).
  "heavenly_demon.demon_avatar": {
    id: "heavenly_demon.demon_avatar", name: "Heavenly Demon Avatar", faction: "heavenly_demon", tier: "gold", type: "ground",
    // NEW #2 — Reap the Fallen: +1 Attack for the combat whenever an adjacent unit is removed.
    few: { attack: 6, defense: 2, health: 7, initiative: 6, cost: { gold: 16, valuables: 1 }, abilities: ["heavenly-demon-reap"], abilityText: "Reap the Fallen — gain +1 Attack when an adjacent unit is removed, maximum +2 this Combat.", cardImage: demonCard("golden", "demon-avatar", "few") },
    pack: { attack: 7, defense: 2, health: 8, initiative: 7, cost: { gold: 24, valuables: 2 }, abilities: ["heavenly-demon-reap", "titan-ignore-ongoing"], abilityText: "Reap the Fallen — gain up to +2 Attack from adjacent deaths; Immortal Will — ignore ongoing effects.", cardImage: demonCard("golden", "demon-avatar", "pack") },
    source
  },

  // Little Busters Campus — momentum/control roster. The printed numbers below
  // are the source of truth used by the physical card compositor as well as the
  // runtime. Every ability id is engine-implemented; there is no flavor-only arm.
  "little_busters.haruka": {
    id: "little_busters.haruka", name: "Haruka Saigusa", faction: "little_busters", tier: "bronze", type: "ground",
    few: { attack: 2, defense: 0, health: 3, initiative: 9, cost: { gold: 2 }, abilities: [], cardImage: littleBustersCard("bronze", "haruka-saigusa", "few") },
    pack: { attack: 3, defense: 0, health: 4, initiative: 10, cost: { gold: 4 }, abilities: ["haruka-prank-backfire"], abilityText: "Prank Backfire - when her own Attack die rolls -1, Paralyze the target after this attack.", cardImage: littleBustersCard("bronze", "haruka-saigusa", "pack") },
    source
  },
  "little_busters.rins_cats": {
    id: "little_busters.rins_cats", name: "Rin's Cats", faction: "little_busters", tier: "bronze", type: "ground",
    few: { attack: 2, defense: 1, health: 2, initiative: 10, cost: { gold: 3 }, abilities: ["teleport-move"], abilityText: "Cat Step - as a move, place this unit on any empty Combat space.", cardImage: littleBustersCard("bronze", "rins-cats", "few") },
    pack: { attack: 3, defense: 1, health: 3, initiative: 11, cost: { gold: 6 }, abilities: ["teleport-move", "ignores-retaliation"], abilityText: "Cat Step - move to any empty space; Pounce - attacks do not provoke Retaliation.", cardImage: littleBustersCard("bronze", "rins-cats", "pack") },
    source
  },
  "little_busters.disciplinary_committee": {
    id: "little_busters.disciplinary_committee", name: "Disciplinary Committee", faction: "little_busters", tier: "bronze", type: "ranged",
    few: { attack: 2, defense: 1, health: 3, initiative: 6, cost: { gold: 4 }, abilities: ["wog-nightmare-fear"], abilityText: "Disciplinary Pressure - when attacked, the attacker rolls 2 Attack dice and resolves the lower result.", cardImage: littleBustersCard("bronze", "disciplinary-committee", "few") },
    pack: { attack: 3, defense: 1, health: 3, initiative: 7, cost: { gold: 6 }, abilities: ["disciplinary-sanction"], abilityText: "Disciplinary Sanction - at the start of Combat, choose 1 enemy unit. It gets -1 Attack during round 1.", cardImage: littleBustersCard("bronze", "disciplinary-committee", "pack") },
    source
  },
  "little_busters.masato": {
    id: "little_busters.masato", name: "Masato the Wall", faction: "little_busters", tier: "silver", type: "ground",
    few: { attack: 3, defense: 2, health: 5, initiative: 4, cost: { gold: 8 }, abilities: ["commander-defense-token"], abilityText: "Muscle Wall - always rolls the Defend die when attacked.", cardImage: littleBustersCard("silver", "masato-the-wall", "few") },
    pack: { attack: 4, defense: 2, health: 5, initiative: 5, cost: { gold: 15 }, abilities: ["commander-defense-token", "masato-bodyguard-intercept"], abilityText: "Bodyguard - always rolls the Defend die; once per Combat round, redirect an attack on any adjacent ally to Masato, including Gold units and the battlefield hero.", cardImage: littleBustersCard("silver", "masato-the-wall", "pack") },
    source
  },
  "little_busters.softball_club": {
    id: "little_busters.softball_club", name: "Softball Club", faction: "little_busters", tier: "silver", type: "ranged",
    few: { attack: 3, defense: 1, health: 5, initiative: 7, cost: { gold: 8 }, abilities: ["ignore-combat-penalties"], abilityText: "Pitching Lane - ignores the adjacent-unit ranged penalty.", cardImage: littleBustersCard("silver", "softball-club", "few") },
    pack: { attack: 4, defense: 1, health: 5, initiative: 8, cost: { gold: 12 }, abilities: ["ignore-combat-penalties", "softball-power-pitch"], abilityText: "Pitching Lane - ignores the adjacent penalty; Power Pitch - when its own Attack die is -1 or 0, deal 1 additional damage.", cardImage: littleBustersCard("silver", "softball-club", "pack") },
    source
  },
  "little_busters.saya": {
    id: "little_busters.saya", name: "Saya Tokido", faction: "little_busters", tier: "gold", type: "ground",
    few: { attack: 6, defense: 2, health: 5, initiative: 8, cost: { gold: 14, valuables: 1 }, abilities: ["saya-infiltration", "ignores-retaliation"], abilityText: "Infiltration - as a move, place Saya on any empty Combat space; her attacks do not provoke Retaliation.", cardImage: littleBustersCard("golden", "saya-tokido", "few") },
    pack: { attack: 6, defense: 2, health: 7, initiative: 12, cost: { gold: 21, valuables: 2 }, abilities: ["saya-infiltration", "ignores-retaliation", "saya-armor-break"], abilityText: "Infiltration - move to any empty space and ignore Retaliation; Armor Break - only on a -1 on Saya's Attack die, place one non-stacking -1 Defense token (minimum 0) for the rest of Combat.", cardImage: littleBustersCard("golden", "saya-tokido", "pack") },
    source
  },
  "little_busters.mio": {
    id: "little_busters.mio", name: "Mio Nishizono", faction: "little_busters", tier: "gold", type: "ranged",
    few: { attack: 5, defense: 2, health: 6, initiative: 4, cost: { gold: 19 }, abilities: ["gargoyle-spell-ward", "ignore-all-combat-penalties"], abilityText: "White Parasol - takes 1 less Spell damage and ignores all ranged penalties.", cardImage: littleBustersCard("golden", "mio-nishizono", "few") },
    pack: { attack: 6, defense: 2, health: 8, initiative: 5, cost: { gold: 28, valuables: 2 }, abilities: ["gargoyle-spell-ward", "ignore-all-combat-penalties", "archangel-lethal-save"], abilityText: "Midori's Shadow - +1 Defense against the first attack each Combat round; spell ward and no ranged penalties; once per Combat, cancel lethal damage to another friendly unit.", cardImage: littleBustersCard("golden", "mio-nishizono", "pack") },
    source
  },
  // Rin Natsume's "Cat Corps" specialty (specialty.rin_natsume.*) summons these
  // two strays. They are SUMMON-ONLY, exactly like the Conflux Elementals and
  // the MGQ spirits: never recruitable, never in coreFactionDefinitions
  // .little_busters.units (that filter drops summonOnly), never in a deck. Each
  // has ONE side ("few") so it can never flip, no cost, and reuses the existing
  // Rin's Cats card face. The engine mints them with summoned+temporary set and
  // no armyUnitId (summonCampusCats in reducer.ts), so they vanish at combat end
  // and never reach the army, XP, rewards or the deployment limit.
  "little_busters.stray_cat": {
    id: "little_busters.stray_cat", name: "Stray Cat", faction: "little_busters", tier: "bronze", type: "ground",
    summonOnly: true,
    few: { attack: 1, defense: 0, health: 1, initiative: 10, cost: {}, abilities: ["teleport-move"], abilityText: "Cat Step - as a move, place this unit on any empty Combat space.", cardImage: littleBustersCard("bronze", "rins-cats", "few") },
    source
  },
  "little_busters.alley_cat": {
    id: "little_busters.alley_cat", name: "Alley Cat", faction: "little_busters", tier: "bronze", type: "ground",
    summonOnly: true,
    few: { attack: 1, defense: 0, health: 2, initiative: 10, cost: {}, abilities: ["teleport-move", "ignores-retaliation"], abilityText: "Cat Step - move to any empty space; Pounce - attacks do not provoke Retaliation.", cardImage: littleBustersCard("bronze", "rins-cats", "few") },
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
  "azur_lane.dwelling_gold": 7,
  // Heavenly Demon Palace — a DISTINCT bar order (shared bar in slot 3, not
  // slot 4 like the others): the Blood Summoning Altar (Portal Summon) shares the
  // bronze dwelling bar. Bar assignment MUST agree with townBoardSpecs.heavenly_demon
  // (src/data/towns/boards.ts) so each building's strip art matches its bar.
  "heavenly_demon.city_hall": 1,
  "heavenly_demon.citadel": 2,
  "heavenly_demon.dwelling_bronze": 3,
  "heavenly_demon.summoning_altar": 3,
  "heavenly_demon.dwelling_silver": 4,
  "heavenly_demon.mage_guild": 5,
  "heavenly_demon.demon_arena": 6,
  "heavenly_demon.dwelling_gold": 7,
  "little_busters.city_hall": 1,
  "little_busters.dwelling_bronze": 2,
  "little_busters.clubhouse": 3,
  "little_busters.dwelling_silver": 4,
  "little_busters.practice_field": 4,
  "little_busters.mage_guild": 5,
  "little_busters.citadel": 6,
  "little_busters.dwelling_gold": 7
  ,"blue_archive.city_hall": 1
  ,"blue_archive.dwelling_bronze": 2
  ,"blue_archive.research_workshop": 3
  ,"blue_archive.dwelling_silver": 4
  ,"blue_archive.training_ground": 4
  ,"blue_archive.mage_guild": 5
  ,"blue_archive.citadel": 6
  ,"blue_archive.dwelling_gold": 7
};

type AnimeTownFactionId = "fuyuki" | "azure_breeze" | "hidden_leaf" | "azur_lane" | "heavenly_demon" | "little_busters" | "blue_archive";

/** The dashed art-file prefix for a faction's bar slices (id keeps the underscore). */
const barArtPrefix = (faction: AnimeTownFactionId): string =>
  faction === "azure_breeze"
    ? "azure-breeze"
    : faction === "hidden_leaf"
      ? "hidden-leaf"
      : faction === "azur_lane"
        ? "azur-lane"
        : faction === "heavenly_demon"
          ? "heavenly-demon"
          : faction === "little_busters"
            ? "little-busters"
            : faction;

const building = (
  id: string,
  name: string,
  faction: AnimeTownFactionId,
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
  assets: { image: faction === "blue_archive"
    ? `/assets/anime/blue-archive/town-bars/blue-archive-built-bar-${animeTownBuildingBar[id]}.webp`
    : `/assets/town-board/${barArtPrefix(faction)}-bar-${animeTownBuildingBar[id]}.webp` },
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
  "azur_lane.exercise_waters": building("azur_lane.exercise_waters", "Combat Exercise Waters", "azur_lane", { gold: 7, buildingMaterials: 4 }, { type: "HALL_OF_VALHALLA", amount: 1 }),

  // Heavenly Demon Palace — shared archetypes only (ZERO new TownBuildingEffect
  // types), costs mirroring the Fuyuki/Azure/Hidden-Leaf/Azur twins per archetype.
  // The two SPECIAL buildings are Portal-Summon (Blood Summoning Altar) +
  // Hall-of-Valhalla (Arena of Ten Thousand Demons) — a different specials pair
  // than Azure Breeze's (Hall-of-Valhalla + resource-die).
  "heavenly_demon.city_hall": building("heavenly_demon.city_hall", "Throne of the Heavenly Demon", "heavenly_demon", { gold: 10, buildingMaterials: 4 }, { type: "RESOURCE_ROUND_CHOICE", options: [{ label: "Gain 5 gold", gold: 5 }, { label: "Reinforce 1 bronze unit for free", reinforceBronzeFree: true }] }),
  "heavenly_demon.citadel": building("heavenly_demon.citadel", "Obsidian Ramparts", "heavenly_demon", { gold: 8, buildingMaterials: 5, valuables: 1 }, { type: "UNLOCK_REINFORCE" }),
  "heavenly_demon.mage_guild": { ...building("heavenly_demon.mage_guild", "Grimoire Sanctum", "heavenly_demon", { gold: 4, buildingMaterials: 2, valuables: 1 }, { type: "MAGE_GUILD" }), spellBookCost: 5 },
  "heavenly_demon.dwelling_bronze": building("heavenly_demon.dwelling_bronze", "Blood Disciple Cloister", "heavenly_demon", { gold: 5, buildingMaterials: 3, valuables: 1 }, { type: "UNLOCK_RECRUIT_TIER", tier: "bronze" }),
  "heavenly_demon.dwelling_silver": building("heavenly_demon.dwelling_silver", "Corpse Puppet Workshop", "heavenly_demon", { gold: 8, buildingMaterials: 6, valuables: 3 }, { type: "UNLOCK_RECRUIT_TIER", tier: "silver" }, ["heavenly_demon.dwelling_bronze"]),
  "heavenly_demon.dwelling_gold": building("heavenly_demon.dwelling_gold", "Abyssal Throne Hall", "heavenly_demon", { gold: 10, buildingMaterials: 9, valuables: 4 }, { type: "UNLOCK_RECRUIT_TIER", tier: "gold" }, ["heavenly_demon.dwelling_silver"]),
  "heavenly_demon.summoning_altar": building("heavenly_demon.summoning_altar", "Blood Summoning Altar", "heavenly_demon", { gold: 7, buildingMaterials: 4, valuables: 1 }, { type: "TURN_START_PORTAL_SUMMON" }),
  "heavenly_demon.demon_arena": building("heavenly_demon.demon_arena", "Arena of Ten Thousand Demons", "heavenly_demon", { gold: 7, buildingMaterials: 4 }, { type: "HALL_OF_VALHALLA", amount: 1 }),

  // Little Busters — school-club economy plus training. All eight definitions
  // reuse established town effect arms, so every built strip changes gameplay.
  "little_busters.city_hall": building("little_busters.city_hall", "School Mission Board", "little_busters", { gold: 10, buildingMaterials: 4 }, { type: "RESOURCE_ROUND_CHOICE", options: [{ label: "Fund the clubs: gain 5 gold", gold: 5 }, { label: "Win the school contest: draw 1 card", drawCards: 1 }] }),
  "little_busters.citadel": building("little_busters.citadel", "Little Busters Clubhouse", "little_busters", { gold: 8, buildingMaterials: 5, valuables: 1 }, { type: "UNLOCK_REINFORCE" }),
  "little_busters.mage_guild": { ...building("little_busters.mage_guild", "Occult Research Room", "little_busters", { gold: 4, buildingMaterials: 2, valuables: 1 }, { type: "MAGE_GUILD" }), spellBookCost: 5 },
  "little_busters.dwelling_bronze": building("little_busters.dwelling_bronze", "First-Year Club Rooms", "little_busters", { gold: 5, buildingMaterials: 3, valuables: 1 }, { type: "UNLOCK_RECRUIT_TIER", tier: "bronze" }),
  "little_busters.dwelling_silver": building("little_busters.dwelling_silver", "Athletics Wing", "little_busters", { gold: 8, buildingMaterials: 6, valuables: 3 }, { type: "UNLOCK_RECRUIT_TIER", tier: "silver" }, ["little_busters.dwelling_bronze"]),
  "little_busters.dwelling_gold": building("little_busters.dwelling_gold", "Secret World Passage", "little_busters", { gold: 10, buildingMaterials: 9, valuables: 4 }, { type: "UNLOCK_RECRUIT_TIER", tier: "gold" }, ["little_busters.dwelling_silver"]),
  "little_busters.clubhouse": building("little_busters.clubhouse", "Cat & Baseball Clubhouse", "little_busters", { gold: 7, buildingMaterials: 4, valuables: 1 }, { type: "TURN_START_PORTAL_SUMMON" }),
  "little_busters.practice_field": building("little_busters.practice_field", "After-School Practice Field", "little_busters", { gold: 7, buildingMaterials: 4 }, { type: "HALL_OF_VALHALLA", amount: 1 })
  ,"blue_archive.city_hall": building("blue_archive.city_hall", "General Student Council", "blue_archive", { gold: 10, buildingMaterials: 4 }, { type: "RESOURCE_ROUND_CHOICE", options: [{ label: "Secure academy funding: gain 5 gold", gold: 5 }, { label: "Schale intelligence: draw 3 cards", drawCards: 3 }] })
  ,"blue_archive.citadel": building("blue_archive.citadel", "Sanctum Citadel", "blue_archive", { gold: 8, buildingMaterials: 5, valuables: 1 }, { type: "UNLOCK_REINFORCE" })
  ,"blue_archive.mage_guild": { ...building("blue_archive.mage_guild", "Halo Research Tower", "blue_archive", { gold: 4, buildingMaterials: 2, valuables: 1 }, { type: "MAGE_GUILD" }), spellBookCost: 5 }
  ,"blue_archive.dwelling_bronze": building("blue_archive.dwelling_bronze", "District Academy", "blue_archive", { gold: 5, buildingMaterials: 3, valuables: 1 }, { type: "UNLOCK_RECRUIT_TIER", tier: "bronze" })
  ,"blue_archive.dwelling_silver": building("blue_archive.dwelling_silver", "Advanced Academy", "blue_archive", { gold: 8, buildingMaterials: 6, valuables: 3 }, { type: "UNLOCK_RECRUIT_TIER", tier: "silver" }, ["blue_archive.dwelling_bronze"])
  ,"blue_archive.dwelling_gold": building("blue_archive.dwelling_gold", "Elite Sanctuary", "blue_archive", { gold: 10, buildingMaterials: 9, valuables: 4 }, { type: "UNLOCK_RECRUIT_TIER", tier: "gold" }, ["blue_archive.dwelling_silver"])
  ,"blue_archive.research_workshop": building("blue_archive.research_workshop", "Millennium Workshop", "blue_archive", { gold: 6, buildingMaterials: 4 }, { type: "ARTIFACT_SMITH", searchCost: 5, sellGold: 3 })
  ,"blue_archive.training_ground": building("blue_archive.training_ground", "Schale Training Ground", "blue_archive", { gold: 7, buildingMaterials: 4 }, { type: "HALL_OF_VALHALLA", amount: 0, trainingWinXp: 1, trainingWinGoldWhenXpOff: 2 })
};

export const animeTownHeroDefinitions: Record<string, HeroDefinition> = {
  mika_blue_archive: {
    id: "mika_blue_archive", name: "Mika", faction: "blue_archive", class: "Tea Party Enforcer", type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 }, startingAbilityCardId: "ability.offense",
    specialtyCardIds: { 1: "specialty.mika_blue_archive.1", 4: "specialty.mika_blue_archive.4", 6: "specialty.mika_blue_archive.6" },
    portrait: "/assets/anime/heroes/blue-archive-mika.webp", source: blueArchiveSource
  },
  yuuka_blue_archive: {
    id: "yuuka_blue_archive", name: "Yuuka", faction: "blue_archive", class: "Seminar Treasurer", type: "might",
    startingStats: { attack: 1, defense: 2, power: 1, knowledge: 2 }, startingAbilityCardId: "ability.armorer",
    specialtyCardIds: { 1: "specialty.yuuka_blue_archive.1", 4: "specialty.yuuka_blue_archive.4", 6: "specialty.yuuka_blue_archive.6" },
    portrait: "/assets/anime/heroes/blue-archive-yuuka.webp", source: blueArchiveSource
  },
  seia_blue_archive: {
    id: "seia_blue_archive", name: "Seia", faction: "blue_archive", class: "Prophetic Councilor", type: "magic",
    startingStats: { attack: 1, defense: 1, power: 2, knowledge: 2 }, startingAbilityCardId: "ability.wisdom",
    specialtyCardIds: { 1: "specialty.seia_blue_archive.1", 4: "specialty.seia_blue_archive.4", 6: "specialty.seia_blue_archive.6" },
    portrait: "/assets/anime/heroes/blue-archive-seia.webp", source: blueArchiveSource
  },
  chise_blue_archive: {
    id: "chise_blue_archive", name: "Chise", faction: "blue_archive", class: "Hyakkiyako Mystic", type: "magic",
    startingStats: { attack: 1, defense: 1, power: 2, knowledge: 2 }, startingAbilityCardId: "ability.sorcery",
    specialtyCardIds: { 1: "specialty.chise_blue_archive.1", 4: "specialty.chise_blue_archive.4", 6: "specialty.chise_blue_archive.6" },
    portrait: "/assets/anime/heroes/blue-archive-chise.webp", source: blueArchiveSource
  },
  kei_blue_archive: {
    id: "kei_blue_archive", name: "Kei", faction: "blue_archive", class: "Millennium System", type: "magic",
    startingStats: { attack: 1, defense: 2, power: 2, knowledge: 1 }, startingAbilityCardId: "ability.interference",
    specialtyCardIds: { 1: "specialty.kei_blue_archive.1", 4: "specialty.kei_blue_archive.4", 6: "specialty.kei_blue_archive.6" },
    portrait: "/assets/anime/heroes/blue-archive-kei.webp", source: blueArchiveSource
  },
  shirou_emiya: {
    id: "shirou_emiya", name: "Shirou Emiya", faction: "fuyuki", class: "Resolute Master", type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.leadership",
    specialtyCardIds: { 1: "specialty.shirou_emiya.1", 4: "specialty.shirou_emiya.4", 6: "specialty.shirou_emiya.6" },
    portrait: "/assets/anime/heroes/shirou-emiya.webp", source
  },
  rin_tohsaka: {
    id: "rin_tohsaka", name: "Rin Tohsaka", faction: "fuyuki", class: "Jewel Magus", type: "magic",
    startingStats: { attack: 1, defense: 1, power: 2, knowledge: 2 },
    startingAbilityCardId: "ability.sorcery",
    specialtyCardIds: { 1: "specialty.rin_tohsaka.1", 4: "specialty.rin_tohsaka.4", 6: "specialty.rin_tohsaka.6" },
    portrait: "/assets/anime/heroes/rin-tohsaka.webp", source
  },
  illyasviel: {
    id: "illyasviel", name: "Illyasviel von Einzbern", faction: "fuyuki", class: "Homunculus Master", type: "magic",
    startingStats: { attack: 1, defense: 1, power: 2, knowledge: 2 },
    startingAbilityCardId: "ability.wisdom",
    specialtyCardIds: { 1: "specialty.illyasviel.1", 4: "specialty.illyasviel.4", 6: "specialty.illyasviel.6" },
    portrait: "/assets/anime/heroes/illyasviel-von-einzbern.webp", source
  },
  kiritsugu_emiya: {
    id: "kiritsugu_emiya", name: "Kiritsugu Emiya", faction: "fuyuki", class: "Mage Killer", type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.tactics",
    specialtyCardIds: { 1: "specialty.kiritsugu_emiya.1", 4: "specialty.kiritsugu_emiya.4", 6: "specialty.kiritsugu_emiya.6" },
    portrait: "/assets/anime/heroes/kiritsugu-emiya.webp", source
  },
  kirei_kotomine: {
    id: "kirei_kotomine", name: "Kirei Kotomine", faction: "fuyuki", class: "Church Executor", type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.offense",
    specialtyCardIds: { 1: "specialty.kirei_kotomine.1", 4: "specialty.kirei_kotomine.4", 6: "specialty.kirei_kotomine.6" },
    portrait: "/assets/anime/heroes/kirei-kotomine.webp", source
  },
  sakura_matou: {
    id: "sakura_matou", name: "Sakura Matou", faction: "fuyuki", class: "Shadow Vessel", type: "magic",
    startingStats: { attack: 1, defense: 1, power: 2, knowledge: 2 },
    startingAbilityCardId: "ability.interference",
    specialtyCardIds: { 1: "specialty.sakura_matou.1", 4: "specialty.sakura_matou.4", 6: "specialty.sakura_matou.6" },
    portrait: "/assets/anime/heroes/sakura-matou.webp", source
  },
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
  jianxu: {
    id: "jianxu", name: "Jianxu", faction: "azure_breeze", class: "Sword-Array Architect", type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.tactics",
    specialtyCardIds: { 1: "specialty.jianxu.1", 4: "specialty.jianxu.4", 6: "specialty.jianxu.6" },
    portrait: "/assets/anime/heroes/jianxu.webp", source
  },
  yulian: {
    id: "yulian", name: "Yulian", faction: "azure_breeze", class: "Jade-Body Grandmaster", type: "might",
    startingStats: { attack: 1, defense: 3, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.armorer",
    specialtyCardIds: { 1: "specialty.yulian.1", 4: "specialty.yulian.4", 6: "specialty.yulian.6" },
    portrait: "/assets/anime/heroes/yulian.webp", source
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
  kakashi_hatake: {
    id: "kakashi_hatake", name: "Kakashi Hatake", faction: "hidden_leaf", class: "Copy Ninja", type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.tactics",
    specialtyCardIds: { 1: "specialty.kakashi_hatake.1", 4: "specialty.kakashi_hatake.4", 6: "specialty.kakashi_hatake.6" },
    portrait: "/assets/anime/heroes/kakashi-hatake.webp", source
  },
  shikamaru_nara: {
    id: "shikamaru_nara", name: "Shikamaru Nara", faction: "hidden_leaf", class: "Shadow Strategist", type: "magic",
    startingStats: { attack: 1, defense: 1, power: 2, knowledge: 2 },
    startingAbilityCardId: "ability.wisdom",
    specialtyCardIds: { 1: "specialty.shikamaru_nara.1", 4: "specialty.shikamaru_nara.4", 6: "specialty.shikamaru_nara.6" },
    portrait: "/assets/anime/heroes/shikamaru-nara.webp", source
  },
  jiraiya: {
    id: "jiraiya", name: "Jiraiya", faction: "hidden_leaf", class: "Toad Sage", type: "magic",
    startingStats: { attack: 1, defense: 1, power: 2, knowledge: 2 },
    startingAbilityCardId: "ability.sorcery",
    specialtyCardIds: { 1: "specialty.jiraiya.1", 4: "specialty.jiraiya.4", 6: "specialty.jiraiya.6" },
    portrait: "/assets/anime/heroes/jiraiya.webp", source
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
  },
  // Heavenly Demon Palace — three MIGHT heroes with DISTINCT redesigned sets
  // (2026-08-25: Xuedao → Blood Ripple, Guiyan → Ghostfire Coil, Xuanming →
  // Legion of Bones; rethemedSpecialty clones pinned in
  // anime-specialty-redesign.test.ts), plus two MAGIC medic clones
  // (rethemedSpecialty of the fully generic Gem / Rion sets). All face-less
  // (native specialty renderer, hero's own portrait).
  xuedao: {
    id: "xuedao", name: "Xuedao", faction: "heavenly_demon", class: "Blood Path Patriarch", type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.offense",
    specialtyCardIds: { 1: "specialty.xuedao.1", 4: "specialty.xuedao.4", 6: "specialty.xuedao.6" },
    portrait: "/assets/anime/heroes/xuedao.webp", source
  },
  guiyan: {
    id: "guiyan", name: "Guiyan", faction: "heavenly_demon", class: "Ghost Flame Sovereign", type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.leadership",
    specialtyCardIds: { 1: "specialty.guiyan.1", 4: "specialty.guiyan.4", 6: "specialty.guiyan.6" },
    portrait: "/assets/anime/heroes/guiyan.webp", source
  },
  xuanming: {
    id: "xuanming", name: "Xuanming", faction: "heavenly_demon", class: "Bone Reaver Marshal", type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.tactics",
    specialtyCardIds: { 1: "specialty.xuanming.1", 4: "specialty.xuanming.4", 6: "specialty.xuanming.6" },
    portrait: "/assets/anime/heroes/xuanming.webp", source
  },
  yaoji: {
    id: "yaoji", name: "Yaoji", faction: "heavenly_demon", class: "Blood Alchemist", type: "magic",
    startingStats: { attack: 1, defense: 1, power: 2, knowledge: 2 },
    startingAbilityCardId: "ability.wisdom",
    specialtyCardIds: { 1: "specialty.yaoji.1", 4: "specialty.yaoji.4", 6: "specialty.yaoji.6" },
    portrait: "/assets/anime/heroes/yaoji.webp", source
  },
  molian: {
    id: "molian", name: "Molian", faction: "heavenly_demon", class: "Corpse Weaver", type: "magic",
    startingStats: { attack: 1, defense: 2, power: 2, knowledge: 1 },
    startingAbilityCardId: "ability.sorcery",
    specialtyCardIds: { 1: "specialty.molian.1", 4: "specialty.molian.4", 6: "specialty.molian.6" },
    portrait: "/assets/anime/heroes/molian.webp", source
  },
  luohun: {
    id: "luohun", name: "Bai Luohun", faction: "heavenly_demon", class: "Soul Shepherd", type: "magic",
    startingStats: { attack: 1, defense: 1, power: 2, knowledge: 2 },
    startingAbilityCardId: "ability.wisdom",
    specialtyCardIds: { 1: "specialty.luohun.1", 4: "specialty.luohun.4", 6: "specialty.luohun.6" },
    portrait: "/assets/anime/heroes/luohun.webp", source
  },
  shiyan: {
    id: "shiyan", name: "Shiyan", faction: "heavenly_demon", class: "Corpse-Furnace Savant", type: "magic",
    startingStats: { attack: 1, defense: 2, power: 2, knowledge: 1 },
    startingAbilityCardId: "ability.sorcery",
    specialtyCardIds: { 1: "specialty.shiyan.1", 4: "specialty.shiyan.4", 6: "specialty.shiyan.6" },
    portrait: "/assets/anime/heroes/shiyan.webp", source
  },
  sasami_sasasegawa: {
    id: "sasami_sasasegawa", name: "Sasami Sasasegawa", faction: "little_busters", class: "Softball Captain", type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.leadership",
    specialtyCardIds: { 1: "specialty.sasami_sasasegawa.1", 4: "specialty.sasami_sasasegawa.4", 6: "specialty.sasami_sasasegawa.6" },
    portrait: "/assets/anime/heroes/little-busters-sasami-sasasegawa.webp", source
  },
  riki_naoe: {
    id: "riki_naoe", name: "Riki Naoe", faction: "little_busters", class: "Team Heart", type: "might",
    startingStats: { attack: 1, defense: 2, power: 1, knowledge: 2 },
    startingAbilityCardId: "ability.tactics",
    specialtyCardIds: { 1: "specialty.riki_naoe.1", 4: "specialty.riki_naoe.4", 6: "specialty.riki_naoe.6" },
    portrait: "/assets/anime/heroes/little-busters-riki-naoe.webp", source
  },
  rin_natsume: {
    id: "rin_natsume", name: "Rin Natsume", faction: "little_busters", class: "Cat Whisperer", type: "might",
    startingStats: { attack: 2, defense: 1, power: 1, knowledge: 2 },
    startingAbilityCardId: "ability.offense",
    specialtyCardIds: { 1: "specialty.rin_natsume.1", 4: "specialty.rin_natsume.4", 6: "specialty.rin_natsume.6" },
    portrait: "/assets/anime/heroes/little-busters-rin-natsume.webp", source
  },
  yuiko_kurugaya: {
    id: "yuiko_kurugaya", name: "Yuiko Kurugaya", faction: "little_busters", class: "Perfect Prefect", type: "might",
    startingStats: { attack: 2, defense: 2, power: 1, knowledge: 1 },
    startingAbilityCardId: "ability.interference",
    specialtyCardIds: { 1: "specialty.yuiko_kurugaya.1", 4: "specialty.yuiko_kurugaya.4", 6: "specialty.yuiko_kurugaya.6" },
    portrait: "/assets/anime/heroes/little-busters-yuiko-kurugaya.webp", source
  },
  kudryavka_noumi: {
    id: "kudryavka_noumi", name: "Kudryavka Noumi", faction: "little_busters", class: "Rocket Scientist", type: "magic",
    startingStats: { attack: 1, defense: 1, power: 2, knowledge: 2 },
    startingAbilityCardId: "ability.sorcery",
    specialtyCardIds: { 1: "specialty.kudryavka_noumi.1", 4: "specialty.kudryavka_noumi.4", 6: "specialty.kudryavka_noumi.6" },
    portrait: "/assets/anime/heroes/little-busters-kudryavka-noumi.webp", source
  },
  komari_kamikita: {
    id: "komari_kamikita", name: "Komari Kamikita", faction: "little_busters", class: "Smile Maker", type: "magic",
    startingStats: { attack: 1, defense: 1, power: 2, knowledge: 2 },
    startingAbilityCardId: "ability.wisdom",
    specialtyCardIds: { 1: "specialty.komari_kamikita.1", 4: "specialty.komari_kamikita.4", 6: "specialty.komari_kamikita.6" },
    portrait: "/assets/anime/heroes/little-busters-komari-kamikita.webp", source
  }
};

/** Fixed LV1→LV7 recruit order. Never derive this from ad-hoc Object.values. */
export const AZURE_BREEZE_UNIT_ORDER = [
  "azure_breeze.outer_disciples", // LV1 bronze
  "azure_breeze.inner_swordsmen", // LV2 bronze
  "azure_breeze.spirit_crane", // LV3 bronze
  "azure_breeze.sect_protectors", // LV4 silver
  "azure_breeze.true_inheritors", // LV5 silver
  "azure_breeze.core_master", // LV6 gold ranged
  "azure_breeze.mountain_guardian" // LV7 gold
] as const;

export const animeTownFactionDefinitions: Record<string, FactionDefinition> = {
  blue_archive: {
    id: "blue_archive", name: "Kivotos Academy Domain", color: "#63c8f2", startingTileId: "BA-S1",
    heroes: ["mika_blue_archive", "yuuka_blue_archive", "seia_blue_archive", "chise_blue_archive", "kei_blue_archive"],
    buildings: Object.values(animeTownBuildingDefinitions).filter((item) => item.faction === "blue_archive").map((item) => item.id),
    units: blueArchiveCharacters.map((unit) => unit.id),
    townImage: "/assets/anime/blue-archive/town/blue-archive-town-empty.webp", source: blueArchiveSource
  },
  fuyuki: {
    id: "fuyuki", name: "Fuyuki City", color: "#7256d8", startingTileId: "A-S1",
    heroes: ["shirou_emiya", "rin_tohsaka", "illyasviel", "kiritsugu_emiya", "kirei_kotomine", "sakura_matou"],
    buildings: Object.values(animeTownBuildingDefinitions).filter((item) => item.faction === "fuyuki").map((item) => item.id),
    units: Object.values(animeTownUnitDefinitions).filter((item) => item.faction === "fuyuki").map((item) => item.id),
    townImage: "/assets/anime/towns/fuyuki-city-empty-v2.webp", source
  },
  azure_breeze: {
    id: "azure_breeze", name: "Azure Breeze Sect", color: "#27a9a0", startingTileId: "W-S1",
    heroes: ["qingyun", "lingxi", "jianxu", "yulian"],
    buildings: Object.values(animeTownBuildingDefinitions).filter((item) => item.faction === "azure_breeze").map((item) => item.id),
    units: [...AZURE_BREEZE_UNIT_ORDER],
    townImage: "/assets/anime/towns/azure-breeze-sect-empty-v2.webp", source
  },
  hidden_leaf: {
    id: "hidden_leaf", name: "Hidden Leaf Village", color: "#4f9d45", startingTileId: "L-S1",
    heroes: ["naruto", "sasuke", "tsunade", "kakashi_hatake", "shikamaru_nara", "jiraiya"],
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
  },
  heavenly_demon: {
    id: "heavenly_demon", name: "Heavenly Demon Palace", color: "#8b1a2b", startingTileId: "D-S1",
    // Five heroes (three MIGHT unit specialists + two MAGIC medic clones), the
    // azur_lane roster shape.
    heroes: ["xuedao", "guiyan", "xuanming", "yaoji", "molian", "luohun", "shiyan"],
    // `units` derives from the animeTownUnitDefinitions insertion order (bronze →
    // gold), exactly like Fuyuki / Hidden Leaf / Azur Lane — no explicit order array.
    buildings: Object.values(animeTownBuildingDefinitions).filter((item) => item.faction === "heavenly_demon").map((item) => item.id),
    units: Object.values(animeTownUnitDefinitions).filter((item) => item.faction === "heavenly_demon").map((item) => item.id),
    townImage: "/assets/anime/towns/heavenly-demon-palace-empty.webp", source
  },
  little_busters: {
    id: "little_busters", name: "Little Busters Campus", color: "#c34f79", startingTileId: "LB-S1",
    heroes: ["sasami_sasasegawa", "riki_naoe", "rin_natsume", "yuiko_kurugaya", "kudryavka_noumi", "komari_kamikita"],
    buildings: Object.values(animeTownBuildingDefinitions).filter((item) => item.faction === "little_busters").map((item) => item.id),
    units: Object.values(animeTownUnitDefinitions)
      .filter((item) => item.faction === "little_busters" && !item.summonOnly)
      .map((item) => item.id),
    townImage: "/assets/anime/towns/little-busters-campus-empty.webp", source
  }
};

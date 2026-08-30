export type BlueArchiveTier = "bronze" | "silver" | "gold";
export type BlueArchiveUnitType = "ground" | "ranged" | "flying";

export interface BlueArchiveSide {
  attack: number; defense: number; health: number; initiative: number;
  gold: number; materials?: number; valuables?: number; art: string;
  ability: string; abilityName: string; abilityText: string;
}

export interface BlueArchiveCharacter {
  id: string; name: string; school: string; type: BlueArchiveUnitType;
  tier: BlueArchiveTier;
  few: BlueArchiveSide; pack: BlueArchiveSide;
}

const art = (file: string) => `/assets/anime/blue-archive/characters/${file}`;
const side = (
  attack: number, defense: number, health: number, initiative: number,
  gold: number, valuables: number | undefined, image: string,
  ability: string, abilityName: string, abilityText: string, materials?: number
): BlueArchiveSide => ({ attack, defense, health, initiative, gold, ...(materials ? { materials } : {}), ...(valuables ? { valuables } : {}), art: art(image), ability, abilityName, abilityText });

/**
 * User-authored Blue Archive roster. Pack faces inherit the Few ability when
 * converted to the engine's UnitDefinition in anime/towns.ts.
 */
export const blueArchiveCharacters: readonly BlueArchiveCharacter[] = [
  {
    id: "blue_archive.mika", name: "Mika", school: "Trinity", type: "ground", tier: "silver",
    few: side(4, 2, 5, 8, 10, undefined, "mika-few.png", "kivotos-piercing-judgment", "Piercing Judgment", "[unit_attack] If Mika moved before attacking, reroll one −1 Attack die."),
    pack: side(5, 2, 6, 10, 12, 1, "mika-pack.png", "kivotos-kyrie-eleison", "Kyrie Eleison", "Once per Combat after attacking, deal 1 damage to a second enemy adjacent to the target.")
  },
  {
    id: "blue_archive.seia", name: "Seia", school: "Trinity", type: "ground", tier: "gold",
    few: side(4, 2, 6, 10, 15, undefined, "seia.png", "kivotos-prophetic-dream", "Prophetic Dream", "[combat_start] Examine the top 3 cards of your deck, take 1 into your hand, then return the rest to the deck."),
    pack: side(5, 2, 6, 13, 20, 1, "seia-pack.png", "kivotos-future-sight", "Future Sight", "Once per Combat after any Attack die is rolled, you may force that die to be rerolled, whether an ally or enemy rolled it.")
  },
  {
    id: "blue_archive.nagisa", name: "Nagisa", school: "Trinity", type: "ranged", tier: "gold",
    few: side(5, 1, 7, 8, 14, 1, "nagisa.png", "kivotos-tea-party-order", "Tea Party Order", "The first time each Combat an adjacent ally is attacked, it gains +1 Defense for that attack."),
    pack: side(6, 2, 8, 10, 25, 1, "nagisa-pack.png", "kivotos-royal-artillery", "Royal Artillery", "[unit_attack] After attacking a non-adjacent target, attack one unit adjacent to it with 3 Attack.")
  },
  {
    id: "blue_archive.aris", name: "Aris", school: "Millennium", type: "ranged", tier: "silver",
    few: side(3, 1, 4, 5, 6, undefined, "aris-few.png", "kivotos-railgun-charge", "Railgun Charge", "[unit_attack] Gain +1 Attack when attacking an enemy that has already retaliated this round."),
    pack: side(4, 1, 5, 7, 13, undefined, "aris-pack.png", "kivotos-hero-mode", "Hero Mode", "[unit_passive] Ignore all ranged Combat penalties.")
  },
  {
    id: "blue_archive.kei", name: "Kei", school: "Millennium", type: "flying", tier: "bronze",
    few: side(2, 1, 4, 6, 2, undefined, "kei.png", "kivotos-system-intrusion", "System Intrusion", "When targeted by a Spell or Specialty, roll an Attack die; on +1, ignore its effect on Kei."),
    pack: side(3, 1, 4, 9, 6, undefined, "kei-pack.png", "kivotos-key-authority", "Key Authority", "Once per Combat, cancel an enemy activation ability as it triggers, then draw 1 card.")
  },
  {
    id: "blue_archive.hoshino", name: "Hoshino", school: "Abydos", type: "ground", tier: "silver",
    few: side(3, 2, 4, 6, 7, undefined, "hoshino.png", "kivotos-iron-horus", "Iron Horus", "The first time each round Hoshino takes damage, reduce that damage by 1."),
    pack: side(4, 2, 4, 7, 13, undefined, "hoshino-pack.png", "kivotos-abyssal-shield", "Abyssal Shield", "Hoshino and adjacent allies gain a Defense token against the first attack targeting them each round.")
  },
  {
    id: "blue_archive.shiroko", name: "Shiroko", school: "Abydos", type: "ranged", tier: "bronze",
    few: side(2, 0, 3, 7, 1, undefined, "shiroko.png", "kivotos-cycle-scout", "Cycle Scout", "[combat_start] After deployment, move Shiroko up to 2 spaces."),
    pack: side(3, 0, 4, 9, 5, undefined, "shiroko-pack.png", "kivotos-drone-support", "Drone Support", "Once per round, mark an enemy within 3 spaces; the next friendly attack against it gains +1 Attack.")
  },
  {
    id: "blue_archive.hina", name: "Hina", school: "Gehenna", type: "flying", tier: "gold",
    few: side(4, 1, 6, 9, 8, undefined, "hina-few.png", "kivotos-prefect-barrage", "Prefect Barrage", "[unit_attack] After Hina attacks, attack the same target again with 3 Attack.", 1),
    pack: side(5, 1, 9, 11, 22, 1, "hina-pack.png", "kivotos-end-of-vacation", "End of Vacation", "[unit_attack] On a 0 or +1 Attack-die result, ignore 1 Defense of the target.")
  },
  {
    id: "blue_archive.yuuka", name: "Yuuka", school: "Millennium", type: "ground", tier: "silver",
    few: side(3, 1, 4, 6, 4, undefined, "yuuka.png", "kivotos-calculated-cover", "Calculated Cover", "After Yuuka attacks, she may move 1 space."),
    pack: side(4, 1, 5, 7, 10, undefined, "yuuka-pack.png", "kivotos-perfect-balance", "Perfect Balance", "When Yuuka is attacked, discard 1 card to ignore the attacker's Attack-die result.")
  },
  {
    id: "blue_archive.aru", name: "Aru", school: "Gehenna", type: "ranged", tier: "bronze",
    few: side(2, 0, 3, 5, 3, undefined, "aru.png", "kivotos-outlaw-shot", "Outlaw Shot", "[unit_attack] On a +1 Attack-die result, deal 1 additional damage after the attack resolves."),
    pack: side(3, 1, 4, 7, 6, undefined, "aru-pack.png", "kivotos-hardboiled-boss", "Hardboiled Boss", "[unit_attack] Reroll a −1 result; if the reroll is also −1, draw 1 card.")
  },
  {
    id: "blue_archive.neru", name: "Neru", school: "Millennium", type: "ground", tier: "bronze",
    few: side(3, 0, 3, 8, 4, undefined, "neru.png", "kivotos-cleaner-rush", "Cleaner Rush", "[unit_attack] If Neru moved and then attacks, ignore Retaliation."),
    pack: side(3, 0, 4, 10, 6, undefined, "neru-pack.png", "kivotos-cqc-overdrive", "CQC Overdrive", "[unit_attack] On a 0 or −1 Attack-die result, Neru may attack the target again.")
  },
  {
    id: "blue_archive.toki", name: "Toki", school: "Millennium", type: "flying", tier: "silver",
    few: side(3, 1, 5, 8, 9, undefined, "toki.png", "kivotos-abi-eshuh", "Abi-Eshuh", "Once per Combat, Toki gains +1 Defense against the first attack targeting her."),
    pack: side(4, 1, 6, 10, 16, undefined, "toki-pack.png", "kivotos-mode-change", "Mode Change", "At activation, choose Attack Mode (+1 Attack) or Guard Mode (+1 Defense) until Toki's next activation.")
  },
  {
    id: "blue_archive.azusa", name: "Azusa", school: "Trinity", type: "ranged", tier: "bronze",
    few: side(2, 1, 2, 7, 3, undefined, "azusa.png", "kivotos-silent-faith", "Silent Faith", "[unit_attack] Against a non-adjacent target, reroll one −1 Attack-die result."),
    pack: side(3, 1, 3, 9, 6, undefined, "azusa-pack.png", "kivotos-sagitta-mortis", "Sagitta Mortis", "Once per Combat round, a non-adjacent attack ignores 1 Defense of the target.")
  },
  {
    id: "blue_archive.wakamo", name: "Wakamo", school: "Hyakkiyako", type: "ranged", tier: "gold",
    few: side(5, 3, 6, 9, 20, 1, "wakamo.png", "kivotos-foxfire-mark", "Foxfire Mark", "The first enemy Wakamo damages becomes marked. Wakamo gains +1 Attack against it for the rest of the Combat, beginning with her next attack."),
    pack: side(6, 3, 8, 11, 32, 2, "wakamo-pack.png", "kivotos-crimson-calamity", "Crimson Calamity", "When Wakamo damages her marked unit, deal 1 damage to one enemy adjacent to it.")
  },
  {
    id: "blue_archive.saori", name: "Saori", school: "Arius", type: "ground", tier: "silver",
    few: side(3, 2, 4, 8, 7, undefined, "saori.png", "kivotos-arius-ambush", "Arius Ambush", "[combat_start] After all units deploy, move Saori up to 2 spaces."),
    pack: side(3, 2, 5, 10, 12, undefined, "saori-pack.png", "kivotos-vanitas", "Vanitas", "[unit_attack] Against a unit that has not activated this round, gain +1 Attack and ignore Retaliation.")
  },
  {
    id: "blue_archive.iori", name: "Iori", school: "Gehenna", type: "ranged", tier: "bronze",
    few: side(2, 0, 3, 7, 2, undefined, "iori.png", "kivotos-prefect-snipe", "Prefect Snipe", "[unit_attack] Gain +1 Attack against a damaged non-adjacent target."),
    pack: side(3, 1, 3, 9, 6, undefined, "iori-pack.png", "kivotos-rapid-reposition", "Rapid Reposition", "[unit_passive] Ignore the adjacent ranged Combat penalty and all Retaliation Attacks.")
  },
  {
    id: "blue_archive.mutsuki", name: "Mutsuki", school: "Gehenna", type: "ranged", tier: "bronze",
    few: side(1, 0, 3, 6, 0, undefined, "mutsuki.png", "kivotos-trick-mine", "Trick Mine", "Once per Combat, before the first enemy attacks Mutsuki in melee, that enemy suffers 1 damage."),
    pack: side(2, 0, 4, 8, 5, undefined, "mutsuki-pack.png", "kivotos-explosive-prank", "Explosive Prank", "[activation] Place a mine adjacent to Mutsuki. Its first enemy suffers 2 damage and every enemy adjacent to it suffers 1 damage.")
  },
  {
    id: "blue_archive.miyo", name: "Miyo", school: "Wildhunt", type: "ground", tier: "gold",
    few: side(4, 3, 7, 5, 20, 1, "miyo.png", "kivotos-survey-route", "Survey Route", "[combat_start] Teleport 1 allied unit to an empty space at the beginning of Combat."),
    pack: side(5, 3, 10, 7, 30, 2, "miyo-pack.png", "kivotos-cartographers-plan", "Cartographer's Plan", "[activation] Before Miyo moves, teleport 1 other allied unit to an empty space.")
  },
  {
    id: "blue_archive.hasumi", name: "Hasumi", school: "Trinity", type: "flying", tier: "silver",
    few: side(3, 1, 5, 7, 7, undefined, "hasumi-few.png", "kivotos-eagle-eye", "Eagle Eye", "[unit_attack] When Hasumi moves and then attacks, gain +1 Attack."),
    pack: side(3, 1, 7, 9, 12, undefined, "hasumi-pack.png", "kivotos-winged-pursuit", "Winged Pursuit", "[unit_attack] On a 0 or +1 Attack-die result, deal 1 additional damage.")
  }
];

export const blueArchiveTown = {
  id: "blue_archive", name: "Kivotos Academy Domain", color: "#63c8f2",
  panoramaEmpty: "/assets/anime/blue-archive/town/blue-archive-town-empty.png",
  panoramaFull: "/assets/anime/blue-archive/town/blue-archive-town-full.png",
  emptyBars: Array.from({ length: 7 }, (_, i) => `/assets/anime/blue-archive/town-bars/blue-archive-empty-bar-${i + 1}.png`),
  builtBars: Array.from({ length: 7 }, (_, i) => `/assets/anime/blue-archive/town-bars/blue-archive-built-bar-${i + 1}.png`),
  buildings: [
    { id: "blue_archive.city_hall", name: "General Student Council", bar: 1, gold: 10, materials: 4, effect: "Choose 5 gold or draw 3 cards each resource round." },
    { id: "blue_archive.dwelling_bronze", name: "District Academy", bar: 2, gold: 5, materials: 3, effect: "Unlock bronze Kivotos students." },
    { id: "blue_archive.research_workshop", name: "Millennium Workshop", bar: 3, gold: 6, materials: 4, effect: "Upgrade or repair one deployed unit after combat." },
    { id: "blue_archive.dwelling_silver", name: "Advanced Academy", bar: 4, gold: 8, materials: 6, valuables: 3, effect: "Unlock silver Kivotos students." },
    { id: "blue_archive.training_ground", name: "Schale Training Ground", bar: 4, gold: 7, materials: 4, effect: "After each won combat: surviving units gain 1 experience, or gain 2 gold when Unit Experience is off." },
    { id: "blue_archive.mage_guild", name: "Halo Research Tower", bar: 5, gold: 4, materials: 2, valuables: 1, effect: "Unlock the spell book and advanced research." },
    { id: "blue_archive.citadel", name: "Sanctum Citadel", bar: 6, gold: 8, materials: 5, valuables: 1, effect: "Unlock fortification cards and reinforcing." },
    { id: "blue_archive.dwelling_gold", name: "Elite Sanctuary", bar: 7, gold: 10, materials: 9, valuables: 4, effect: "Unlock gold Kivotos students." }
  ]
} as const;

/**
 * Garrison Wars levels and mode presets. `buildConfig` turns a level plus the
 * player's choices (factions, cards) into the simulation's GarrisonConfig.
 */

import {
  ATK_SPELL_ORDER, CARDS, DEFENDERS, DEF_SPELL_ORDER, ENEMIES, FACTIONS, FACTION_ORDER, SPELLS, SPELL_CARD_IDS,
  factionCards, factionWarband, sec,
  type CardId, type DefKind, type EnemyKind, type Faction, type SpellId, type Terrain
} from "./content";
import type { GarrisonConfig, GarrisonMode } from "./sim";

export type GarrisonLevel = {
  id: string;
  mode: GarrisonMode;
  name: string;
  /** One-line briefing on the level card. */
  brief: string;
  terrain: Terrain;
  lanes: number[];
  waves: number;
  /** The attacking warband (wave pool). */
  enemies: EnemyKind[];
  /** Faction shown as the attacker (banner colour, crest). */
  foe?: Faction | "mixed";
  featured?: EnemyKind;
  difficulty: number;
  startGold: number;
  boss?: "dracolich";
  /** Marches at the head of every great (flag) assault. */
  herald?: EnemyKind;
  preset?: { kind: DefKind; lane: number; col: number }[];
  startMight?: number;
  atkCards?: EnemyKind[];
  conveyorPool?: CardId[];
  endless?: boolean;
};

const ALL = [0, 1, 2, 3, 4];
const TIDE = "tide-herald";

/**
 * The campaign: the Undead Tide rolls out of the graveyards, and every few
 * nights something else marches with it — Eeofol's demons, Nighon's raiders,
 * hired swords. Each level brings one new foe (`featured`: forced into wave 2
 * and every great assault, flagged "New" in the scouts' report).
 */
export const ADVENTURE: readonly GarrisonLevel[] = [
  { id: "a1", mode: "adventure", name: "The Gate at Dawn", terrain: "grass", lanes: [1, 2, 3], waves: 6, foe: "necropolis",
    brief: "Something shambles out of the old graveyard. Raise gold-makers first, then shooters to hold the road.",
    enemies: ["walking-dead"], difficulty: 0.6, startGold: 150 },
  { id: "a2", mode: "adventure", name: "Kettle Helms", terrain: "grass", lanes: [1, 2, 3], waves: 8, foe: "necropolis",
    brief: "The dead have raided the kitchens. An iron pot takes the first 400 damage — keep shooting and it falls off.",
    enemies: ["walking-dead", "pot-helm-zombie"], featured: "pot-helm-zombie", difficulty: 0.85, startGold: 150 },
  { id: "a3", mode: "adventure", name: "The Standard of the Tide", terrain: "grass", lanes: ALL, waves: 10, foe: "necropolis", herald: TIDE,
    brief: "All five roads now. When the Standard-Bearer's banner rises, a great assault marches behind it.",
    enemies: ["walking-dead", "pot-helm-zombie", "zombie", "skeleton"], featured: "skeleton", difficulty: 0.9, startGold: 150 },
  { id: "a4", mode: "adventure", name: "Coffin Lids", terrain: "grass", lanes: ALL, waves: 10, foe: "necropolis", herald: TIDE,
    brief: "Coffin lids stop arrows from the front. Pikes, mines and fire go around them.",
    enemies: ["walking-dead", "pot-helm-zombie", "zombie", "coffin-zombie"], featured: "coffin-zombie", difficulty: 0.95, startGold: 150 },
  { id: "a5", mode: "adventure", name: "Graveyard Shift", terrain: "graveyard", lanes: ALL, waves: 12, foe: "necropolis", herald: TIDE,
    brief: "Night: gold falls from the sky only half as often, so lean on your gold-makers. Gravediggers tunnel under everything and climb out behind your lines.",
    enemies: ["walking-dead", "zombie", "pot-helm-zombie", "coffin-zombie", "wight", "gravedigger"], featured: "gravedigger", difficulty: 0.95, startGold: 200 },
  { id: "a6", mode: "adventure", name: "Great Helms", terrain: "graveyard", lanes: ALL, waves: 12, foe: "necropolis", herald: TIDE,
    brief: "Plundered knights' helms take 1100 damage before the Zombie inside feels anything. Vampires flutter over your first line.",
    enemies: ["walking-dead", "zombie", "pot-helm-zombie", "great-helm-zombie", "vampire", "gravedigger", "skeleton"], featured: "great-helm-zombie",
    difficulty: 1, startGold: 200 },
  { id: "a7", mode: "adventure", name: "The Pact of Eeofol", terrain: "lava", lanes: ALL, waves: 15, foe: "mixed", herald: TIDE,
    brief: "Inferno marches with the Tide. Hell Hounds bite three lanes; Familiars drain your hero's mana.",
    enemies: ["walking-dead", "zombie", "pot-helm-zombie", "great-helm-zombie", "imp", "familiar", "demon", "hell-hound"], featured: "hell-hound",
    difficulty: 0.9, startGold: 150 },
  { id: "a8", mode: "adventure", name: "Brimstone Readers", terrain: "lava", lanes: ALL, waves: 15, foe: "mixed", herald: TIDE,
    brief: "Tome-reading Zombies: tear the book away and they fly into a rage. Gogs lob fire over your walls.",
    enemies: ["walking-dead", "zombie", "coffin-zombie", "tome-zombie", "imp", "gog", "horned-demon", "hell-hound"], featured: "tome-zombie",
    difficulty: 1.05, startGold: 150 },
  { id: "a9", mode: "adventure", name: "Under the Hill", terrain: "night", lanes: ALL, waves: 15, foe: "mixed", herald: TIDE,
    brief: "Nighon's raiders join the dead underground, where gold falls only half as often. Beholders shoot from the dark.",
    enemies: ["zombie", "pot-helm-zombie", "gravedigger", "troglodyte", "infernal-troglodyte", "harpy", "beholder"], featured: "beholder",
    difficulty: 1, startGold: 200 },
  { id: "d1", mode: "adventure", name: "Knee-Deep in the Dead", terrain: "hell", lanes: ALL, waves: 15, foe: "mixed", herald: TIDE,
    brief: "A rift tears open under the graveyard and another hell pours through: possessed Zombiemen shoot from range, Imps hurl fireballs, Pinkies charge.",
    enemies: ["walking-dead", "zombie", "pot-helm-zombie", "zombieman", "shotgun-guy", "doom-imp", "pinky", "lost-soul"], featured: "doom-imp",
    difficulty: 1, startGold: 150 },
  { id: "a10", mode: "adventure", name: "The Necromancer's Road", terrain: "night", lanes: ALL, waves: 18, foe: "mixed", herald: TIDE,
    brief: "Necromancers raise Skeletons in every lane around them. Medusas turn your troops to stone from range.",
    enemies: ["walking-dead", "zombie", "great-helm-zombie", "skeleton-warrior", "necromancer", "troglodyte", "medusa", "minotaur"], featured: "necromancer",
    difficulty: 1.05, startGold: 200 },
  { id: "a11", mode: "adventure", name: "Sellswords", terrain: "rough", lanes: ALL, waves: 18, foe: "mixed", herald: TIDE,
    brief: "The Tide pays in plunder. Rogues pocket your gold with every strike — slay them to get it back. Sharpshooters outrange your archers.",
    enemies: ["walking-dead", "zombie", "pot-helm-zombie", "tome-zombie", "rogue", "pirate", "nomad", "sharpshooter"], featured: "rogue",
    difficulty: 1.05, startGold: 150 },
  { id: "a12", mode: "adventure", name: "Powder and Bone", terrain: "rough", lanes: ALL, waves: 20, foe: "mixed", herald: TIDE,
    brief: "Powder-Keg Ghouls light their fuse the moment they reach your line. Frost holds the fuse — or kill them before they arrive.",
    enemies: ["zombie", "coffin-zombie", "great-helm-zombie", "keg-ghoul", "mummy", "rogue", "troll", "sharpshooter"], featured: "keg-ghoul",
    difficulty: 1.05, startGold: 150 },
  { id: "a13", mode: "adventure", name: "The Frozen Dead", terrain: "snow", lanes: ALL, waves: 18, foe: "mixed", herald: TIDE,
    brief: "Ghosts drift over your first line and shrug off frost; Werewolves go berserk when wounded; Wraiths drain your mana.",
    enemies: ["walking-dead", "zombie", "great-helm-zombie", "tome-zombie", "ghost", "werewolf", "wraith", "nomad"], featured: "werewolf",
    difficulty: 0.9, startGold: 150 },
  { id: "a14", mode: "adventure", name: "Swamp of Sorrows", terrain: "swamp", lanes: ALL, waves: 20, foe: "mixed", herald: TIDE,
    brief: "The Swamp Brood joins in: Wyverns poison, Basilisks petrify, Serpent Flies dissolve stone skin.",
    enemies: ["zombie", "pot-helm-zombie", "coffin-zombie", "keg-ghoul", "gnoll", "lizardman", "serpent-fly", "basilisk", "wyvern"], featured: "wyvern",
    difficulty: 1.1, startGold: 150 },
  { id: "d2", mode: "adventure", name: "The Shores of Hell", terrain: "hell", lanes: ALL, waves: 20, foe: "mixed", herald: TIDE,
    brief: "Cacodemons float in spitting plasma, Revenants' rockets curve over your walls, and the Mancubus fans fireballs across three lanes.",
    enemies: ["zombie", "great-helm-zombie", "keg-ghoul", "shotgun-guy", "doom-imp", "pinky", "cacodemon", "revenant", "hell-knight", "mancubus"],
    featured: "mancubus", difficulty: 1.1, startGold: 150 },
  { id: "a15", mode: "adventure", name: "The Abomination", terrain: "cursed", lanes: ALL, waves: 20, foe: "necropolis", herald: TIDE,
    brief: "A stitched giant flattens anything in one blow and, wounded, hurls its ghoul deep behind your lines. Liches cloud your ranks.",
    enemies: ["walking-dead", "zombie", "great-helm-zombie", "tome-zombie", "gravedigger", "lich", "vampire-lord", "black-knight", "abomination"], featured: "abomination",
    difficulty: 0.9, startGold: 150 },
  { id: "a16", mode: "adventure", name: "Devils at the Gate", terrain: "lava", lanes: ALL, waves: 20, foe: "mixed", herald: TIDE,
    brief: "Devils teleport to your gate and eat their way back out. Pit Lords raise demons; kegs and tomes march with them.",
    enemies: ["walking-dead", "imp", "zombie", "keg-ghoul", "tome-zombie", "demon", "magog", "cerberus", "efreet-sultan", "devil", "pit-lord"], featured: "devil",
    difficulty: 0.9, startGold: 150 },
  { id: "a17", mode: "adventure", name: "The Nighon Pact", terrain: "night", lanes: ALL, waves: 20, foe: "mixed", herald: TIDE,
    brief: "Scorpicores paralyse, Manticores leap in, Evil Eyes burn your line while Necromancers raise the dead.",
    enemies: ["troglodyte", "zombie", "great-helm-zombie", "coffin-zombie", "necromancer", "harpy-hag", "evil-eye", "minotaur-king", "manticore", "scorpicore"], featured: "scorpicore",
    difficulty: 0.9, startGold: 200 },
  { id: "a18", mode: "adventure", name: "The Black Legion", terrain: "graveyard", lanes: ALL, waves: 20, foe: "necropolis", herald: TIDE,
    brief: "Dread Knights ride with Power Liches and Vampire Lords. Every third Death Blow deals triple.",
    enemies: ["walking-dead", "zombie", "great-helm-zombie", "gravedigger", "keg-ghoul", "power-lich", "vampire-lord", "black-knight", "dread-knight", "abomination", "nomad"],
    featured: "dread-knight", difficulty: 0.9, startGold: 200 },
  { id: "a19", mode: "adventure", name: "Dragon Graveyard", terrain: "cursed", lanes: ALL, waves: 22, foe: "mixed", herald: TIDE,
    brief: "Everything that ever marched with the Tide — and the Bone Dragons that crush anything in one blow.",
    enemies: ["zombie", "great-helm-zombie", "coffin-zombie", "tome-zombie", "keg-ghoul", "necromancer", "lich", "devil", "troll", "sharpshooter", "cacodemon", "revenant", "abomination", "bone-dragon"],
    featured: "bone-dragon", difficulty: 0.9, startGold: 150 },
  { id: "a20", mode: "adventure", name: "The Dracolich", terrain: "cursed", lanes: ALL, waves: 0, foe: "necropolis",
    brief: "The master of the tide hovers at the far edge of one lane at a time. Only attacks that reach that edge — and spells — can hurt it.",
    enemies: [], difficulty: 1, startGold: 300, boss: "dracolich" }
];

/**
 * Other fronts: single-warband battles opened by campaign progress (`unlock`
 * = campaign levels cleared). They use the campaign's cards but do not
 * advance it.
 */
export const FRONTS: readonly (GarrisonLevel & { unlock: number })[] = [
  { id: "f1", unlock: 3, mode: "adventure", name: "Barbarians at the Gate", terrain: "rough", lanes: ALL, waves: 10, foe: "stronghold",
    brief: "Orcs stop four tiles out and throw axes at your line. Kill them before they settle in.",
    enemies: ["goblin", "hobgoblin", "orc", "wolf-rider"], featured: "orc", difficulty: 1, startGold: 150 },
  { id: "f2", unlock: 4, mode: "adventure", name: "Bloodlust", terrain: "rough", lanes: ALL, waves: 12, foe: "stronghold",
    brief: "Ogre Magi drive the horde faster; Rocs soar over your first defender.",
    enemies: ["goblin", "hobgoblin", "orc", "wolf-rider", "ogre", "ogre-mage", "roc"], featured: "ogre-mage", difficulty: 1, startGold: 150 },
  { id: "f3", unlock: 6, mode: "adventure", name: "The Wild Hunt", terrain: "grass", lanes: ALL, waves: 15, foe: "rampart",
    brief: "AvLee rides to war: Pegasi glide over walls, Unicorns blind what they strike, Dwarves shrug off spells.",
    enemies: ["centaur", "centaur-captain", "dwarf", "wood-elf", "pegasus", "unicorn"], featured: "pegasus", difficulty: 1, startGold: 150 },
  { id: "f4", unlock: 8, mode: "adventure", name: "Stone Gaze", terrain: "night", lanes: ALL, waves: 18, foe: "dungeon",
    brief: "Nighon alone: Medusas petrify your troops from range; Manticores leap in.",
    enemies: ["troglodyte", "infernal-troglodyte", "harpy", "harpy-hag", "beholder", "evil-eye", "medusa", "minotaur", "manticore"], featured: "medusa",
    difficulty: 1.05, startGold: 200 },
  { id: "f5", unlock: 9, mode: "adventure", name: "The Crusade", terrain: "grass", lanes: ALL, waves: 20, foe: "castle",
    brief: "Erathia marches on you. Shields soak arrows, Monks heal the line and Cavaliers joust for triple damage.",
    enemies: ["pikeman", "halberdier", "archer", "swordsman", "griffin", "monk", "cavalier"], featured: "cavalier", difficulty: 1.05, startGold: 150 },
  { id: "f6", unlock: 10, mode: "adventure", name: "Frozen Spires", terrain: "snow", lanes: ALL, waves: 20, foe: "tower",
    brief: "Mages' bolts sail over your walls to strike what hides behind them. Gargoyles cannot be chilled.",
    enemies: ["gremlin", "master-gremlin", "stone-gargoyle", "stone-golem", "mage", "genie", "naga"], featured: "mage", difficulty: 1.05, startGold: 150 },
  { id: "f7", unlock: 11, mode: "adventure", name: "Fires of Eeofol", terrain: "lava", lanes: ALL, waves: 20, foe: "inferno",
    brief: "Eeofol alone: Efreet ignore burning shots, Hell Hounds bite three lanes, Gogs lob fire from range.",
    enemies: ["imp", "familiar", "demon", "horned-demon", "gog", "hell-hound", "efreet"], featured: "efreet", difficulty: 0.9, startGold: 150 },
  { id: "f8", unlock: 13, mode: "adventure", name: "Swamp Brood", terrain: "swamp", lanes: ALL, waves: 25, foe: "fortress",
    brief: "Basilisks petrify, Wyverns poison, Serpent Flies dissolve stone skin and Hydras bite three lanes.",
    enemies: ["gnoll", "gnoll-marauder", "lizardman", "serpent-fly", "basilisk", "gorgon", "wyvern", "hydra"], featured: "basilisk", difficulty: 1.1, startGold: 150 },
  { id: "f9", unlock: 14, mode: "adventure", name: "Elemental Storm", terrain: "magic", lanes: ALL, waves: 25, foe: "conflux",
    brief: "Earth Elementals travel underground past your first line. Firebirds fly over it.",
    enemies: ["pixie", "air-elemental", "storm-elemental", "water-elemental", "fire-elemental", "earth-elemental", "psychic-elemental", "firebird"],
    featured: "earth-elemental", difficulty: 0.95, startGold: 150 },
  { id: "f10", unlock: 12, mode: "adventure", name: "Hell on Earth", terrain: "hell", lanes: ALL, waves: 20, foe: "doom",
    brief: "DOOM's demons alone: hitscan Zombiemen, Imps, Pinkies and Spectres that your arrows pass through, Cacodemons and Revenant rockets.",
    enemies: ["zombieman", "shotgun-guy", "doom-imp", "pinky", "spectre", "lost-soul", "cacodemon", "hell-knight", "revenant", "arachnotron"],
    featured: "revenant", difficulty: 1.1, startGold: 150 },
  { id: "f11", unlock: 18, mode: "adventure", name: "The Spider Mind", terrain: "hell", lanes: ALL, waves: 25, foe: "doom",
    brief: "The whole of Hell: Barons, Mancubi, Arch-viles raising the fallen, Pain Elementals full of Lost Souls — and the Spider Mastermind and the Cyberdemon.",
    enemies: ["chaingunner", "doom-imp", "spectre", "cacodemon", "pain-elemental", "baron", "arachnotron", "revenant", "mancubus", "arch-vile", "spider-mastermind", "cyberdemon"],
    featured: "spider-mastermind", difficulty: 1.15, startGold: 150 }
];

export const RAIDS: readonly GarrisonLevel[] = [
  { id: "r1", mode: "raid", name: "Raid the Larder", terrain: "grass", lanes: ALL, waves: 0, foe: "necropolis",
    brief: "Lead the Undead Tide against a Castle village. Break through the end of every lane. Eaten gold-makers give 75 Might.",
    enemies: [], difficulty: 1, startGold: 0, startMight: 250,
    atkCards: ["walking-dead", "skeleton", "zombie", "skeleton-warrior", "vampire"],
    preset: [
      ...ALL.map((lane) => ({ kind: "peasant", lane, col: 0 })),
      { kind: "archer", lane: 0, col: 1 }, { kind: "pikeman", lane: 0, col: 3 },
      { kind: "archer", lane: 1, col: 1 }, { kind: "griffin", lane: 1, col: 3 },
      { kind: "archer", lane: 2, col: 2 }, { kind: "peasant", lane: 2, col: 1 },
      { kind: "marksman", lane: 3, col: 1 },
      { kind: "archer", lane: 4, col: 1 }, { kind: "pikeman", lane: 4, col: 2 }
    ] },
  { id: "r2", mode: "raid", name: "Frost and Fire", terrain: "snow", lanes: ALL, waves: 0, foe: "stronghold",
    brief: "The Barbarian Horde against elves, gogs, a primed Land Mine and a hungry Basilisk. Choose your lanes.",
    enemies: [], difficulty: 1, startGold: 0, startMight: 325,
    atkCards: ["goblin", "hobgoblin", "orc", "ogre", "ogre-mage", "roc", "cyclops"],
    preset: [
      ...ALL.map((lane) => ({ kind: "leprechaun", lane, col: 0 })),
      { kind: "snow-elf", lane: 0, col: 1 }, { kind: "mine", lane: 0, col: 4 },
      { kind: "gog", lane: 1, col: 1 }, { kind: "wood-elf", lane: 1, col: 2 }, { kind: "dwarf", lane: 1, col: 4 },
      { kind: "basilisk", lane: 2, col: 3 }, { kind: "wood-elf", lane: 2, col: 1 },
      { kind: "gog", lane: 3, col: 2 }, { kind: "hell-hound", lane: 3, col: 4 },
      { kind: "snow-elf", lane: 4, col: 2 }, { kind: "pikeman", lane: 4, col: 4 }
    ] },
  { id: "r3", mode: "raid", name: "The Titan's Garden", terrain: "magic", lanes: ALL, waves: 0, foe: "mixed",
    brief: "Inferno and Dungeon together against a Titan, Magogs and iron walls. Devils come from behind; dragons leap the front.",
    enemies: [], difficulty: 1, startGold: 0, startMight: 475,
    atkCards: ["imp", "demon", "harpy", "efreet", "minotaur", "devil", "pit-lord", "red-dragon"],
    preset: [
      ...ALL.map((lane) => ({ kind: "gold-golem", lane, col: 0 })),
      { kind: "titan", lane: 0, col: 1 }, { kind: "iron-golem", lane: 0, col: 4 },
      { kind: "magog", lane: 1, col: 1 }, { kind: "marksman", lane: 1, col: 2 }, { kind: "mine", lane: 1, col: 5 },
      { kind: "halberdier", lane: 2, col: 4 }, { kind: "arctic-sharpshooter", lane: 2, col: 1 }, { kind: "basilisk", lane: 2, col: 3 },
      { kind: "magog", lane: 3, col: 2 }, { kind: "iron-golem", lane: 3, col: 5 }, { kind: "monk", lane: 3, col: 1 },
      { kind: "lava-sharpshooter", lane: 4, col: 1 }, { kind: "fire-elemental", lane: 4, col: 3 }, { kind: "stone-golem", lane: 4, col: 5 }
    ] }
];

const ALL_ATTACKERS: EnemyKind[] = FACTION_ORDER.flatMap((faction) => factionWarband(faction));

export const CONVEYOR_LEVEL: GarrisonLevel = {
  id: "conveyor", mode: "conveyor", name: "The Summoning Belt", terrain: "grass", lanes: ALL, waves: 20, foe: "mixed",
  brief: "No gold — the Summoning Belt hands you creatures of every town. Fuse what it gives you.",
  enemies: ["walking-dead", "zombie", "pot-helm-zombie", "tome-zombie", "keg-ghoul", "goblin", "orc", "harpy", "beholder", "swordsman", "cavalier", "mage", "efreet", "devil", "basilisk", "earth-elemental", "bone-dragon"],
  difficulty: 1.15, startGold: 0,
  conveyorPool: ["archer", "wood-elf", "snow-elf", "stone-golem", "gog", "fireball", "land-mine", "pikeman", "basilisk", "fire-elemental",
    "fire-wall", "hell-hound", "peasant", "gremlin", "orc", "monk", "harpy"]
};

export const ENDLESS_LEVEL: GarrisonLevel = {
  id: "endless", mode: "endless", name: "Endless Siege", terrain: "grass", lanes: ALL, waves: 0, endless: true, foe: "mixed",
  brief: "Every warband of Antagarich, wave after wave, forever. After every flag, choose one of three artifacts.",
  enemies: ALL_ATTACKERS, difficulty: 1, startGold: 150
};

export const VERSUS_LEVEL: GarrisonLevel = {
  id: "versus", mode: "versus", name: "Siege Duel", terrain: "grass", lanes: ALL, waves: 0,
  brief: "Defender: topple 3 war banners. Attacker: break through any lane.",
  enemies: [], difficulty: 1, startGold: 150, startMight: 150
};

// ---------------------------------------------------------------------------
// Adventure progress

/** Levels cleared in order = the stage that gates cards and spells. */
export function adventureStage(cleared: readonly string[]): number {
  let stage = 0;
  for (const level of ADVENTURE) {
    if (!cleared.includes(level.id)) break;
    stage += 1;
  }
  return stage;
}

export function slotsForStage(stage: number): number {
  return Math.min(10, 6 + Math.floor(stage / 3));
}

export type FactionChoice = Faction | "mixed";

/** Cards a player may take: one faction's garrison (or every faction's) plus the neutral spell cards, up to a stage. */
export function availableCards(choice: FactionChoice, stage = Number.MAX_SAFE_INTEGER): CardId[] {
  const factions = choice === "mixed" ? FACTION_ORDER : [choice];
  const units = factions.flatMap((faction) => factionCards(faction));
  return [...units, ...SPELL_CARD_IDS].filter((id) => (CARDS[id]?.stage ?? 99) <= stage);
}

export function availableSpells(stage = Number.MAX_SAFE_INTEGER): SpellId[] {
  return DEF_SPELL_ORDER.filter((id) => SPELLS[id].stage <= stage);
}

/** What reaching adventure `stage` newly unlocks, per faction choice. */
export function unlocksAtStage(choice: FactionChoice, stage: number): { cards: CardId[]; spells: SpellId[] } {
  const before = new Set(availableCards(choice, stage - 1));
  const spellsBefore = new Set(availableSpells(stage - 1));
  return {
    cards: availableCards(choice, stage).filter((id) => !before.has(id)),
    spells: availableSpells(stage).filter((id) => !spellsBefore.has(id))
  };
}

/** A sensible starting hand: cheapest gold-maker, then the rest in unlock order. */
export function defaultLoadout(choice: FactionChoice, stage: number, slots: number): CardId[] {
  const cards = availableCards(choice, stage);
  if (choice === "mixed") return mixedLoadout(cards, slots);
  const econ = cards.filter((id) => CARDS[id]?.places && isEconomy(id));
  const rest = cards.filter((id) => !econ.includes(id));
  return [...econ.slice(0, 2), ...rest].slice(0, slots);
}

/** Damage per second of a defender's own shot (volleys and three-lane bolts counted). */
function shotDps(kind: DefKind): number {
  const shot = DEFENDERS[kind]?.shot;
  return shot ? (shot.dmg * (1 + (shot.volley ?? 0)) * (shot.lanes === 3 ? 1.5 : 1)) / shot.every : 0;
}

/**
 * Mixed banners: a hand built by role from every town — two gold-makers, the
 * three most gold-efficient shooters (from different towns while it can), a
 * lobber for shields and lids, a sturdy wall, then the strongest of the rest
 * and the spell cards.
 */
function mixedLoadout(cards: CardId[], slots: number): CardId[] {
  const hand: CardId[] = [];
  const kindOf = (id: CardId) => CARDS[id]!.places!;
  const units = cards.filter((id) => CARDS[id]?.places && CARDS[id]!.places !== "mine");
  const take = (list: CardId[], count: number, spread = false) => {
    const towns = new Set<string>();
    for (const pass of spread ? [true, false] : [false]) {
      for (const id of list) {
        if (count <= 0 || hand.length >= slots) return;
        if (hand.includes(id) || (pass && towns.has(CARDS[id]!.faction))) continue;
        hand.push(id);
        towns.add(CARDS[id]!.faction);
        count -= 1;
      }
    }
  };
  take(units.filter((id) => isEconomy(id)).sort((a, b) => CARDS[a]!.cost - CARDS[b]!.cost), 2, true);
  const shooters = units.filter((id) => !isEconomy(id) && DEFENDERS[kindOf(id)]!.shot && !DEFENDERS[kindOf(id)]!.shot!.lob);
  take(shooters.sort((a, b) => shotDps(kindOf(b)) / CARDS[b]!.cost - shotDps(kindOf(a)) / CARDS[a]!.cost), 3, true);
  take(units.filter((id) => DEFENDERS[kindOf(id)]!.shot?.lob).sort((a, b) => CARDS[a]!.cost - CARDS[b]!.cost), 1);
  const walls = units.filter((id) => !DEFENDERS[kindOf(id)]!.shot && DEFENDERS[kindOf(id)]!.hp >= 1500);
  take(walls.sort((a, b) => DEFENDERS[kindOf(b)]!.hp / CARDS[b]!.cost - DEFENDERS[kindOf(a)]!.hp / CARDS[a]!.cost), 1);
  take([...units].sort((a, b) => CARDS[b]!.stage - CARDS[a]!.stage || CARDS[b]!.cost - CARDS[a]!.cost), slots, true);
  take(cards.filter((id) => !CARDS[id]?.places || CARDS[id]!.places === "mine"), slots);
  return hand.slice(0, slots);
}

function isEconomy(id: CardId): boolean {
  const kind = CARDS[id]?.places;
  return kind !== undefined && DEFENDERS[kind]?.produce !== undefined;
}

export function warbandCards(choice: FactionChoice): EnemyKind[] {
  const units = choice === "mixed" ? ALL_ATTACKERS : factionWarband(choice);
  return ["tent", ...units];
}

export function findLevel(id: string): GarrisonLevel | undefined {
  if (id === CONVEYOR_LEVEL.id) return CONVEYOR_LEVEL;
  if (id === ENDLESS_LEVEL.id) return ENDLESS_LEVEL;
  if (id === VERSUS_LEVEL.id) return VERSUS_LEVEL;
  return ADVENTURE.find((level) => level.id === id) ?? FRONTS.find((level) => level.id === id) ?? RAIDS.find((level) => level.id === id);
}

export type BuildOptions = {
  seed: number;
  cards: CardId[];
  spells: SpellId[];
  /** Versus: the attacker's chosen cards. */
  atkCards?: EnemyKind[];
  defFaction: FactionChoice;
  atkFaction?: FactionChoice;
  ai?: { def: boolean; atk: boolean };
};

const MIXED_COLOR = "#c9a24a";

export function buildConfig(level: GarrisonLevel, options: BuildOptions): GarrisonConfig {
  const versus = level.mode === "versus";
  const raid = level.mode === "raid";
  const defFaction = options.defFaction;
  const atkFaction = options.atkFaction ?? level.foe ?? "mixed";
  const atkCards = versus ? options.atkCards ?? warbandCards(atkFaction).slice(0, 10) : level.atkCards ?? [];
  return {
    mode: level.mode,
    levelId: level.id,
    title: level.name,
    seed: options.seed,
    lanes: [...level.lanes],
    terrain: level.terrain,
    cards: level.conveyorPool || raid ? [] : options.cards.filter((id) => CARDS[id]),
    spells: raid ? [] : options.spells.filter((id) => SPELLS[id]?.side === "def"),
    atkCards: atkCards.filter((id) => ENEMIES[id]),
    atkSpells: versus || raid ? [...ATK_SPELL_ORDER] : [],
    enemies: [...level.enemies],
    featured: level.featured,
    waves: level.waves,
    endless: level.endless,
    difficulty: level.difficulty,
    startGold: level.startGold,
    startMight: level.startMight ?? 0,
    startMana: level.endless ? 10 : 5,
    firstWaveAt: level.mode === "conveyor" ? sec(12) : sec(20),
    boss: level.boss,
    herald: level.herald,
    preset: level.preset ? level.preset.map((unit) => ({ ...unit })) : undefined,
    chargers: !raid,
    chargerSprite: defFaction === "mixed" ? FACTIONS.castle.charger : FACTIONS[defFaction].charger,
    bannerColor: atkFaction === "mixed" ? MIXED_COLOR : FACTIONS[atkFaction].color,
    defCols: versus ? [0, 5] : [0, 8],
    conveyorPool: level.conveyorPool ? [...level.conveyorPool] : undefined,
    atkMinX: raid ? 6 : undefined,
    ai: options.ai ?? { def: false, atk: false }
  };
}

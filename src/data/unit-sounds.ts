import soundManifest from "../../public/sounds/manifest.json";

/**
 * Creature voices: maps every unit in the roster (src/data/factions/units.ts)
 * onto its converted Heroes III sound set under /public/sounds/units.
 * Identifications and the non-obvious shared-audio pairings follow
 * docs/sound-mapping.md; src/data/unit-sounds.test.ts proves the whole
 * roster resolves to real manifest entries.
 */

export type UnitSoundAction = "attack" | "shoot" | "defend" | "hurt" | "death" | "move";

const soundLibrary = soundManifest as Record<string, { src?: string }>;

/**
 * Keyed by the unit's bare name (the definition id without its faction
 * prefix) because a faction unit and its neutral twin are the same creature:
 * castle.marksmen and neutral.marksmen both speak with the Archer's voice.
 */
const creatureVoices: Record<string, string> = {
  // Castle
  halberdiers: "halberdier",
  marksmen: "archer", // the original game shares the Archer files with Marksmen
  griffins: "griffin",
  crusaders: "crusader",
  zealots: "zealot",
  champions: "champion",
  archangels: "archangel",
  // Rampart
  centaurs: "centaur",
  dwarves: "dwarf",
  elves: "wood-elf",
  pegasi: "pegasus",
  dendroids: "dendroid-soldier",
  unicorns: "unicorn",
  gold_dragons: "gold-dragon",
  // Inferno
  familiars: "familiar",
  magogs: "magog",
  cerberi: "cerberus",
  demons: "demon",
  pit_lords: "pit-lord",
  efreet: "efreet",
  arch_devils: "arch-devil",
  // Stronghold
  goblins: "goblin",
  wolf_raiders: "goblin-wolf-rider",
  orcs: "orc",
  ogres: "ogre",
  thunderbirds: "thunderbird",
  cyclopes: "cyclops",
  behemoths: "behemoth",
  // Necropolis
  skeletons: "skeleton",
  zombies: "zombie-lord", // same files serve the base Walking Dead
  wraiths: "wraith",
  vampires: "vampire",
  liches: "lich",
  dread_knights: "dread-knight",
  ghost_dragons: "ghost-dragon",
  // Dungeon
  troglodytes: "troglodyte",
  harpies: "harpy",
  evil_eyes: "evil-eye",
  medusas: "medusa",
  minotaurs: "minotaur",
  manticores: "manticore",
  black_dragons: "black-dragon",
  // Neutral-only creatures
  boars: "boar",
  halflings: "halfling",
  peasants: "peasant",
  rogues: "rogue",
  mummies: "mummy",
  nomads: "nomad",
  sharpshooters: "sharpshooter",
  diamond_golems: "diamond-golem",
  enchanters: "enchanter",
  gold_golems: "gold-golem",
  trolls: "troll",
  azure_dragons: "azure-dragon",
  crystal_dragons: "crystal-dragon",
  faerie_dragons: "faerie-dragon",
  // Tower / Fortress / Conflux creatures that only appear as neutral guards.
  // Voices follow the original game's sound sets (docs/h3-sound-reference.csv):
  // Dragon Flies are the upgraded Serpent Fly, so they use the fire-dragon-fly set.
  gnolls: "gnoll",
  gremlins: "gremlin",
  gargoyles: "stone-gargoyle",
  lizardmen: "lizardman",
  iron_golems: "iron-golem",
  sprites: "sprite",
  dragon_flies: "fire-dragon-fly",
  air_elementals: "air-elemental",
  ice_elementals: "ice-elemental",
  storm_elementals: "storm-elemental",
  basilisks: "basilisk",
  gorgons: "gorgon",
  genies: "genie",
  magi: "mage",
  energy_elementals: "energy-elemental",
  fire_elementals: "fire-elemental",
  magma_elementals: "magma-elemental",
  // Gold / azure neutral guards. (gold_dragons already maps above, shared with
  // the Rampart Gold Dragons — the neutral twin reuses that voice.)
  nagas: "naga",
  wyverns: "wyvern",
  magic_elementals: "magic-elemental",
  titans: "titan",
  hydras: "hydra",
  phoenixes: "phoenix",
  rust_dragons: "rust-dragon"
};

/**
 * A handful of creatures only voice one kind of strike (Gog's shoot is its
 * attack), so melee and ranged cover for each other; every other action
 * plays its own clip or stays silent.
 */
const actionCandidates: Record<UnitSoundAction, string[]> = {
  attack: ["attack", "shoot"],
  shoot: ["shoot", "attack"],
  defend: ["defend"],
  hurt: ["hurt"],
  death: ["death"],
  move: ["move"]
};

/**
 * Manifest key of a creature action clip, e.g. ("castle.marksmen", "shoot")
 * -> "units/archer-shoot". Undefined when the unit or clip is unknown so
 * callers degrade to silence instead of requesting a missing file.
 */
export function unitSoundKey(unitDefId: string, action: UnitSoundAction): string | undefined {
  const bareName = unitDefId.split(".")[1] ?? unitDefId;
  const voice = creatureVoices[bareName];
  if (!voice) {
    return undefined;
  }

  for (const candidate of actionCandidates[action]) {
    const key = `units/${voice}-${candidate}`;
    if (soundLibrary[key]) {
      return key;
    }
  }

  return undefined;
}

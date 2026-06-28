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
  leprechaun: "leprechaun",
  satyrs: "satyr",
  fangarm: "fangarm",
  // Tower / Fortress / Conflux creatures that only appear as neutral guards.
  // Voices follow the original game's sound sets (docs/h3-sound-reference.csv):
  // Dragon Flies are the upgraded Serpent Fly, so they use the fire-dragon-fly set.
  gnolls: "gnoll",
  gremlins: "gremlin",
  gargoyles: "stone-gargoyle",
  lizardmen: "lizardman",
  iron_golems: "iron-golem",
  // Steel Golems are the Iron Golem's upgrade and reuse its voice set.
  steel_golems: "iron-golem",
  sprites: "sprite",
  dragon_flies: "fire-dragon-fly",
  air_elementals: "air-elemental",
  earth_elementals: "earth-elemental",
  water_elementals: "water-elemental",
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
  rust_dragons: "rust-dragon",
  // Cove (HotA): the converted Cove creature sound sets are already in the
  // manifest. Board-game names map onto their HotA voices — Oceanids = Nymph,
  // Seamen = Crew Mate, Sea Dogs = Pirate, Ayssids = Stormbird, Sorceresses =
  // Sea Witch, Haspids = Sea Serpent (Nix keep their own).
  oceanids: "nymph",
  seamen: "crew-mate",
  sea_dogs: "pirate",
  ayssids: "stormbird",
  sorceresses: "sea-witch",
  nix: "nix",
  haspids: "sea-serpent",
  // Bulwark (fan faction): the board-game creatures reuse base-game voice sets
  // until dedicated audio is converted (heroes.thelazy.net/Bulwark, placeholder).
  kobolds: "goblin",
  mountain_rams: "boar",
  snow_elves: "wood-elf",
  yetis: "ogre",
  shamans: "mage",
  mammoths: "behemoth",
  jotunns: "titan"
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
 * Creatures that do not walk: their `move` action plays a dedicated clip
 * instead of the generic `-move` footstep loop. The Arch Devil teleports, so
 * its movement is its teleport sound — EXT1 (vanish) then EXT2 (reappear),
 * sequenced in that order by `units/arch-devil-teleport`. Keyed by bare name,
 * so the Inferno and any neutral twin share it.
 */
const moveSoundOverrides: Record<string, string> = {
  arch_devils: "units/arch-devil-teleport"
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

  if (action === "move") {
    const override = moveSoundOverrides[bareName];
    if (override && soundLibrary[override]) {
      return override;
    }
  }

  for (const candidate of actionCandidates[action]) {
    const key = `units/${voice}-${candidate}`;
    if (soundLibrary[key]) {
      return key;
    }
  }

  return undefined;
}

/**
 * A few creatures strike with an extra magical flourish layered OVER their
 * melee voice clip. The Magic Elemental is a swirl of raw magic that deals
 * elemental damage (and is itself immune to Magic Arrows), so its blow carries
 * a magic zap on top of its grunt — its plain melee clip alone read as "not
 * enough" for a being made of pure magic. Keyed by the bare name (the conflux
 * and neutral twins are the same creature); undefined for ordinary creatures.
 */
const attackFlourishes: Record<string, string> = {
  magic_elementals: "spells/magic-arrow"
};

/**
 * The extra library clip (if any) to play alongside a unit's attack. Returns a
 * key only when it resolves to a real manifest entry, so callers never request
 * a missing file.
 */
export function unitAttackFlourish(unitDefId: string | undefined): string | undefined {
  if (!unitDefId) {
    return undefined;
  }
  const bareName = unitDefId.split(".")[1] ?? unitDefId;
  const key = attackFlourishes[bareName];
  return key && soundLibrary[key] ? key : undefined;
}

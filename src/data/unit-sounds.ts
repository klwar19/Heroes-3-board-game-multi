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
  jotunns: "titan",
  // Factory (HotA fan faction): reuse base-game voice sets until dedicated
  // audio is converted. halflings already maps above (neutral creature).
  mechanics: "gremlin",
  armadillos: "basilisk",
  automatons: "iron-golem",
  sandworms: "hydra",
  gunslingers: "sharpshooter",
  couatls: "wyvern",
  dreadnoughts: "behemoth",
  // Anime Realms: thematic reuse of complete Heroes III voice sets until a
  // dedicated voiced package is produced. Every mapping covers all actions.
  assassins: "rogue",
  riders: "goblin-wolf-rider",
  lancers: "champion",
  archers: "sharpshooter",
  casters: "mage",
  sabers: "swordsman",
  berserkers: "ogre",
  outer_disciples: "swordsman",
  inner_swordsmen: "crusader",
  spirit_crane: "pegasus",
  sect_protectors: "monk",
  true_inheritors: "swordsman",
  core_master: "mage",
  mountain_guardian: "dendroid-soldier",
  // Hidden Leaf Village — thematic reuse of complete Heroes III voice sets.
  // anbu/jonin are RANGED, so their sets resolve a real shoot clip.
  genin_squad: "rogue", // nimble young shinobi (shares the Assassin's Rogue set)
  medical_nin: "enchanter", // the support healer — literally the Enchanter voice
  anbu: "sharpshooter", // elite ranged assassins → precise Sharpshooter (has shoot)
  jonin: "mage", // ranged ninjutsu casters (has shoot)
  giant_toad: "behemoth", // huge summoned beast → the Behemoth's roar
  jinchuriki: "demon", // feral tailed-beast chakra → the Demon set
  susanoo: "titan", // colossal armored avatar → the Titan set
  // Azur Lane Naval Base — thematic reuse of complete Heroes III voice sets.
  // Honolulu is the only RANGED shipgirl, so her set resolves a real shoot clip
  // (sea-witch-shoot exists in the manifest).
  laffey: "rogue", // nimble "White Demon" destroyer → the stealthy Rogue set
  javelin: "pirate", // Royal Navy destroyer → the Cove Sea Dog's Pirate set
  honolulu: "sea-witch", // ranged cruiser gunner → the Sorceress/Sea Witch set (has shoot)
  unicorn: "enchanter", // the repair-fairy carrier medic → the Enchanter healer voice
  yukikaze: "crew-mate", // the lucky destroyer → the Cove Seamen set
  prinz_eugen: "titan", // the unsinkable armored heavy cruiser → the Titan set
  i19: "behemoth", // the lurking "Silent Hunter" submarine → the Behemoth's roar
  // Wake of Gods adaptation: requested H3 voice reuse.
  ghost: "wraith",
  air_messenger: "stone-golem",
  earth_messenger: "stone-golem",
  fire_messenger: "stone-golem",
  water_messenger: "stone-golem",
  war_zealot: "zealot",
  arctic_sharpshooter: "sharpshooter",
  lava_sharpshooter: "sharpshooter",
  sylvan_centaur: "centaur",
  werewolf: "demon",
  nightmare: "war-unicorn",
  hell_steed: "war-unicorn",
  gorynych: "hydra",
  santa_gremlin: "gremlin",
  dracolich: "ghost-dragon"
};

/**
 * Azur Lane's bespoke Japanese combat voices. The source game exposes one
 * short line per combat event rather than separate melee/ranged/defend clips,
 * so attack+shoot share Skill Activation and defend+hurt share Low HP.
 */
const azurLaneUnitVoices: Record<string, string> = {
  laffey: "laffey",
  javelin: "javelin",
  honolulu: "honolulu",
  unicorn: "unicorn",
  yukikaze: "yukikaze",
  prinz_eugen: "prinz_eugen",
  i19: "i19"
};

function azurLaneVoiceKey(slug: string, action: UnitSoundAction): string | undefined {
  const clip = action === "attack" || action === "shoot"
    ? "attack"
    : action === "defend" || action === "hurt"
      ? "hurt"
      : action;
  const key = `azur-lane/voices/${slug}/${clip}`;
  return soundLibrary[key] ? key : undefined;
}

/**
 * WOG commanders have no unit definition (they are tierless, army-card-less
 * champions), so their battlefield voices are keyed by commander slug (== the
 * faction) with a per-action creature-voice mapping, exactly as the user
 * specified. A commander combat unit carries no `unitDefId`; the table passes
 * `commander:<slug>` as its voice id (commanderVoiceId), and unitSoundKey routes
 * that to commanderSoundKey. "shoot" (only a Sharpshooter-combo commander ever
 * shoots) borrows the "attack" voice.
 */
export const COMMANDER_VOICE_PREFIX = "commander:";

type CommanderVoiceActions = Exclude<UnitSoundAction, "shoot">;

const commanderVoices: Record<string, Record<CommanderVoiceActions, string>> = {
  // Castle — Swordsman (user: "not Crusader").
  paladin: { attack: "swordsman", move: "swordsman", defend: "swordsman", hurt: "swordsman", death: "swordsman" },
  // Rampart — Monk (user: "not Zealot").
  hierophant: { attack: "monk", move: "monk", defend: "monk", hurt: "monk", death: "monk" },
  // Tower — "like sorceress": the only Sorceress voice set is the Cove
  // Sorceresses' Sea Witch clips.
  temple_guardian: { attack: "sea-witch", move: "sea-witch", defend: "sea-witch", hurt: "sea-witch", death: "sea-witch" },
  // Inferno — move: Gargoyle; hurt/death/defend: Pixie; attack: Magi (Mage).
  succubus: { attack: "mage", move: "stone-gargoyle", defend: "pixie", hurt: "pixie", death: "pixie" },
  // Dungeon — all Minotaur.
  brute: { attack: "minotaur", move: "minotaur", defend: "minotaur", hurt: "minotaur", death: "minotaur" },
  // Necropolis — move: Zombie; hurt/defend/death: Lich; attack: Lich melee
  // (the "attack" action resolves to lich-attack, not lich-shoot).
  soul_eater: { attack: "lich", move: "zombie-lord", defend: "lich", hurt: "lich", death: "lich" },
  // Stronghold — all Ogre.
  ogre_leader: { attack: "ogre", move: "ogre", defend: "ogre", hurt: "ogre", death: "ogre" },
  // Fortress — all Gnoll.
  shaman: { attack: "gnoll", move: "gnoll", defend: "gnoll", hurt: "gnoll", death: "gnoll" },
  // Conflux — hurt/death/defend: Pixie; move/attack: Inferno Efreet.
  astral_spirit: { attack: "efreet", move: "efreet", defend: "pixie", hurt: "pixie", death: "pixie" },
  // Cove — the Cove level-3 unit (Sea Dogs = Pirate voice).
  corsair: { attack: "pirate", move: "pirate", defend: "pirate", hurt: "pirate", death: "pirate" },
  // Factory — the Cove level-2 unit (Seamen = Crew Mate voice).
  factory: { attack: "crew-mate", move: "crew-mate", defend: "crew-mate", hurt: "crew-mate", death: "crew-mate" },
  // Bulwark — the Bulwark level-7 unit (Jotunns = Titan voice).
  bulwark: { attack: "titan", move: "titan", defend: "titan", hurt: "titan", death: "titan" },
  // Anime Realms — sword-bearing leaders with fully converted voice sets.
  ruler: { attack: "swordsman", move: "swordsman", defend: "swordsman", hurt: "swordsman", death: "swordsman" },
  sword_saint: { attack: "monk", move: "monk", defend: "monk", hurt: "monk", death: "monk" },
  // Hidden Leaf — Might Guy is a bare-fisted taijutsu master → the Monk voice.
  might_guy: { attack: "monk", move: "monk", defend: "monk", hurt: "monk", death: "monk" },
  // Azur Lane — Belfast's DOCUMENTED Sea Witch fallback (CLAUDE.md "Sea Witch
  // voice"). NOTE: this entry does NOT run — commanderSoundKey short-circuits
  // "belfast" to her bespoke Japanese Azur Lane clips (azurLaneVoiceKey) before
  // ever reading commanderVoices, so the Japanese voice supersedes it. Kept as
  // the reviewable fallback the Sea Witch line would resolve to if that
  // short-circuit were removed (the temple_guardian precedent proves it resolves).
  belfast: { attack: "sea-witch", move: "sea-witch", defend: "sea-witch", hurt: "sea-witch", death: "sea-witch" }
};

/** The voice id the table uses for a commander combat unit ("commander:<slug>"). */
export function commanderVoiceId(slug: string): string {
  return `${COMMANDER_VOICE_PREFIX}${slug}`;
}

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
  arch_devils: "units/arch-devil-teleport",
  gorynych: "units/black-dragon-move"
};

const actionSoundOverrides: Partial<Record<string, Partial<Record<UnitSoundAction, string>>>> = {
  dracolich: { shoot: "units/lich-shoot" }
};

/**
 * Manifest key of a WOG commander action clip from the per-slug voice map
 * ("commander:paladin", "attack") -> "units/swordsman-attack". "shoot" (a
 * Sharpshooter-combo commander) borrows the "attack" voice. Undefined for an
 * unknown slug / missing clip so callers degrade to silence.
 */
export function commanderSoundKey(slug: string, action: UnitSoundAction): string | undefined {
  if (slug === "belfast") {
    return azurLaneVoiceKey("belfast", action);
  }
  const voices = commanderVoices[slug];
  if (!voices) {
    return undefined;
  }
  const voice = action === "shoot" ? voices.attack : voices[action];
  for (const candidate of actionCandidates[action]) {
    const key = `units/${voice}-${candidate}`;
    if (soundLibrary[key]) {
      return key;
    }
  }
  return undefined;
}

/**
 * Manifest key of a creature action clip, e.g. ("castle.marksmen", "shoot")
 * -> "units/archer-shoot". A `commander:<slug>` voice id routes to the
 * commander voice map. Undefined when the unit or clip is unknown so
 * callers degrade to silence instead of requesting a missing file.
 */
export function unitSoundKey(unitDefId: string, action: UnitSoundAction): string | undefined {
  if (unitDefId.startsWith(COMMANDER_VOICE_PREFIX)) {
    return commanderSoundKey(unitDefId.slice(COMMANDER_VOICE_PREFIX.length), action);
  }
  const bareName = unitDefId.split(".")[1] ?? unitDefId;
  const azurLaneSlug = azurLaneUnitVoices[bareName];
  if (azurLaneSlug) {
    return azurLaneVoiceKey(azurLaneSlug, action);
  }
  const voice = creatureVoices[bareName];
  if (!voice) {
    return undefined;
  }

  const actionOverride = actionSoundOverrides[bareName]?.[action];
  if (actionOverride && soundLibrary[actionOverride]) {
    return actionOverride;
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
  magic_elementals: "spells/magic-arrow",
  // Layer naval weapon impacts beneath the spoken Azur Lane activation line.
  // Destroyers/cruisers use the converted cannon shot; I-19 gets the watery
  // scuttle impact and carrier Unicorn gets the ballista launch snap.
  laffey: "units/cannon-shoot",
  javelin: "units/cannon-shoot",
  honolulu: "units/cannon-shoot",
  unicorn: "units/ballista-shoot",
  yukikaze: "units/cannon-shoot",
  prinz_eugen: "units/cannon-shoot",
  i19: "spells/scuttle-boat",
  // The Hell Steed is a NORMAL melee attacker (no Magic Arrow), so its blow no
  // longer layers a magic-arrow zap — it just plays its war-unicorn strike voice.
  santa_gremlin: "spells/ice-bolt"
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
  const bareName = unitDefId === `${COMMANDER_VOICE_PREFIX}belfast`
    ? "belfast"
    : unitDefId.split(".")[1] ?? unitDefId;
  if (bareName === "belfast") {
    return soundLibrary["units/cannon-shoot"] ? "units/cannon-shoot" : undefined;
  }
  const key = attackFlourishes[bareName];
  return key && soundLibrary[key] ? key : undefined;
}

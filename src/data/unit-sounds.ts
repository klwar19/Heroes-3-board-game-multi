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
  // Doom neutral slice: reuse complete H3 clips until dedicated Doom audio exists.
  demon: "behemoth",
  former_human: "archer",
  former_human_sergeant: "sharpshooter",
  imp: "gog",
  lost_soul: "wraith",
  cacodemon: "gog",
  hell_knight: "behemoth",
  arachnotron: "titan",
  baron_of_hell: "behemoth",
  former_commando: "titan",
  revenant: "wraith",
  mancubus: "behemoth",
  pain_elemental: "hydra",
  arch_vile: "lich",
  spider_mastermind: "hydra",
  cyberdemon: "titan",
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
  // Fuyuki City fallbacks. unitSoundKey short-circuits fuyuki.* to the
  // Fate/unlimited codes package below; these complete H3 sets remain as a
  // defensive fallback if a bespoke manifest entry is ever absent.
  assassins: "rogue",
  riders: "goblin-wolf-rider",
  lancers: "champion",
  archers: "sharpshooter",
  casters: "mage",
  sabers: "swordsman",
  berserkers: "ogre",
  // Azure Breeze Sect: dedicated curated combat mixes (docs/anime-town-audio.md),
  // one clip per unit and action; the rendered assets retain fitting H3 creature
  // voices as baked-in layers. Pinned by exact-key tests in unit-sounds.test.ts.
  outer_disciples: "azure-breeze-outer-disciples",
  inner_swordsmen: "azure-breeze-inner-swordsmen",
  spirit_crane: "azure-breeze-spirit-crane",
  sect_protectors: "azure-breeze-sect-protectors",
  true_inheritors: "azure-breeze-true-inheritors",
  core_master: "azure-breeze-core-master", // ranged — dedicated shoot clip
  mountain_guardian: "azure-breeze-mountain-guardian",
  // Hidden Leaf Village: dedicated curated combat mixes (docs/anime-town-audio.md),
  // one clip per unit and action; rendered assets retain fitting H3 creature
  // voices as baked-in layers. Pinned by exact-key tests in unit-sounds.test.ts.
  genin_squad: "hidden-leaf-genin-squad",
  medical_nin: "hidden-leaf-medical-nin",
  anbu: "hidden-leaf-anbu", // ranged — dedicated shoot clip
  jonin: "hidden-leaf-jonin", // ranged — dedicated shoot clip
  giant_toad: "hidden-leaf-giant-toad",
  jinchuriki: "hidden-leaf-jinchuriki",
  susanoo: "hidden-leaf-susanoo",
  // Azur Lane Naval Base — NOTE: these H3 entries do NOT run. unitSoundKey
  // short-circuits every shipgirl to her bespoke Japanese clips
  // (azurLaneUnitVoices below) before ever reading creatureVoices — the same
  // pattern as the documented Belfast commander fallback. Kept as the
  // reviewable H3 voice each girl would resolve to if that short-circuit were
  // removed (Honolulu, the one RANGED shipgirl, maps to a set with a real
  // shoot clip: sea-witch-shoot exists in the manifest).
  laffey: "rogue", // nimble "White Demon" destroyer → the stealthy Rogue set
  javelin: "pirate", // Royal Navy destroyer → the Cove Sea Dog's Pirate set
  honolulu: "sea-witch", // ranged cruiser gunner → the Sorceress/Sea Witch set (has shoot)
  unicorn: "enchanter", // the repair-fairy carrier medic → the Enchanter healer voice
  yukikaze: "crew-mate", // the lucky destroyer → the Cove Seamen set
  prinz_eugen: "titan", // the unsinkable armored heavy cruiser → the Titan set
  i19: "behemoth", // the lurking "Silent Hunter" submarine → the Behemoth's roar
  // Heavenly Demon Palace: dedicated curated combat mixes (docs/anime-town-audio.md),
  // one clip per unit and action; rendered assets retain fitting H3 demonic/undead
  // voices as baked-in layers. Pinned by exact-key tests in unit-sounds.test.ts.
  blood_disciples: "heavenly-demon-blood-disciples",
  gu_witches: "heavenly-demon-gu-witches", // ranged — dedicated shoot clip
  shadow_wraiths: "heavenly-demon-shadow-wraiths",
  corpse_puppets: "heavenly-demon-corpse-puppets",
  bone_reavers: "heavenly-demon-bone-reavers",
  ghost_king: "heavenly-demon-ghost-king",
  demon_avatar: "heavenly-demon-avatar",
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
 * Raid Bosses & Dungeon-floor wardens (src/data/anime/bosses.ts). A boss combat
 * unit's `unitDefId` is `boss.<id>` (makeRaidBossCombatUnit), so it never
 * resolved through `creatureVoices` and fought SILENT. Each id reuses the
 * closest converted Heroes III creature voice set — no dedicated boss audio
 * exists yet — so a boss now roars, takes hits and dies audibly. Pinned by a
 * whole-roster sweep in unit-sounds.test.ts (every listAllBossDefinitions id
 * plus custom_boss resolves to a real attack clip). Every value here is a voice
 * base that already backs a shipped roster creature, so the clips are known to
 * exist on disk.
 */
const bossVoices: Record<string, string> = {
  goblin_king: "goblin",
  colossal_titan: "titan",
  abyss_kraken: "hydra",
  calamity_dragon: "black-dragon",
  avatar_of_erebos: "arch-devil",
  cyberdemon_prime: "titan",
  spider_overmind: "hydra",
  lich_archon: "lich",
  hydra_matriarch: "hydra",
  basilisk_queen: "basilisk",
  wailing_banshee: "ghost-dragon",
  archvile_ascendant: "efreet",
  mother_demon: "pit-lord",
  minotaur_of_the_depths: "minotaur",
  floor_wyrm: "wyvern",
  doom_baron_warden: "behemoth",
  doom_cyberdemon_tyrant: "titan",
  warden_gorgon_matron: "gorgon",
  warden_stone_choir: "stone-golem",
  warden_bone_colossus: "behemoth",
  doom_hell_knight_warden: "behemoth",
  doom_archvile_warden: "efreet",
  // Fallback face for a designer-authored boss ("THE NAMELESS").
  custom_boss: "arch-devil"
};

/**
 * Fate/unlimited codes voices and character sounds for Fuyuki City. Each unit
 * has its own five core actions; EMIYA and Medea also have a named ranged line.
 */
const fuyukiUnitVoices: Record<string, string> = {
  assassins: "assassins",
  riders: "riders",
  lancers: "lancers",
  archers: "archers",
  casters: "casters",
  sabers: "sabers",
  berserkers: "berserkers"
};

function fuyukiVoiceKey(slug: string, action: UnitSoundAction): string | undefined {
  const directKey = `fuyuki/voices/${slug}/${action}`;
  if (soundLibrary[directKey]) {
    return directKey;
  }

  // A melee unit can still be forced through a shoot-shaped combat event by
  // an ability. Borrow its attack clip rather than requesting a missing file.
  if (action === "shoot") {
    const attackKey = `fuyuki/voices/${slug}/attack`;
    return soundLibrary[attackKey] ? attackKey : undefined;
  }
  return undefined;
}

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
 * Monster Girl Quest uses curated female Rune Factory clips followed by a
 * unit-specific MGQ effect for attacks, forced shots, and movement. The four
 * summon-only spirits are explicit entries too; their bare names include the
 * `spirit_` prefix from mgq.ts.
 */
const mgqUnitVoices: Record<string, string> = {
  spirit_sylph: "spirit_sylph",
  spirit_gnome: "spirit_gnome",
  spirit_undine: "spirit_undine",
  spirit_salamander: "spirit_salamander",
  pochi: "pochi",
  shesta: "shesta",
  gigi: "gigi",
  kamuro_kitsu: "kamuro_kitsu",
  fleesia: "fleesia",
  sofia: "sofia",
  miyabi: "miyabi",
  eater: "eater",
  hild: "hild",
  chrome_frederica: "chrome_frederica",
  shizuku: "shizuku",
  regina: "regina",
  maiden: "maiden",
  seraphy: "seraphy",
  lisa: "lisa",
  tama: "tama",
  maya: "maya",
  matis: "matis",
  ooma: "ooma",
  jessie: "jessie",
  aria: "aria",
  carmilla: "carmilla",
  giga: "giga",
  lucretia: "lucretia",
  cupi: "cupi",
  sphinx: "sphinx",
  lucifina_chan: "lucifina_chan",
  spider_princess: "spider_princess",
  emily: "emily"
};

function mgqVoiceKey(slug: string, action: UnitSoundAction): string | undefined {
  const key = `mgq/voices/${slug}/${action}`;
  return soundLibrary[key] ? key : undefined;
}

/** Canonical Little Busters battle voices imported from the user's OGGPAKs. */
const littleBustersUnitVoices: Record<string, string> = {
  haruka: "haruka",
  rins_cats: "rins_cats",
  disciplinary_committee: "kanata",
  masato: "masato",
  softball_club: "sasami_goons",
  saya: "saya",
  mio: "mio"
};

/** The six Little Busters heroes also enter combat as real battlefield units. */
const littleBustersHeroVoices: Record<string, string> = {
  sasami_sasasegawa: "sasami",
  riki_naoe: "riki",
  rin_natsume: "rin",
  yuiko_kurugaya: "yuiko",
  kudryavka_noumi: "kud",
  komari_kamikita: "komari"
};

function littleBustersVoiceKey(slug: string, action: UnitSoundAction): string | undefined {
  const key = `little-busters/voices/${slug}/${action}`;
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
  belfast: { attack: "sea-witch", move: "sea-witch", defend: "sea-witch", hurt: "sea-witch", death: "sea-witch" },
  // Heavenly Demon Palace — the Demon Ancestor is a bestial blood-cultivation
  // fiend → the Dungeon Minotaur voice (the brute precedent proves the full set
  // resolves, and it ties to the reused Bloodlust cast).
  demon_ancestor: { attack: "minotaur", move: "minotaur", defend: "minotaur", hurt: "minotaur", death: "minotaur" }
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
/**
 * Classic DOOM neutral audio. The assignments intentionally reuse the
 * original shared lumps: zombie soldiers share their sight/pain/death set,
 * demon-family monsters share the active/pain sounds, and the shotgun sound
 * is shared by the Shotgun Guy, Heavy Weapon Dude, and Spider Mastermind.
 */
const doomActionSoundOverrides: Partial<Record<string, Partial<Record<UnitSoundAction, string>>>> = {
  demon: {
    attack: "units/doom-demon-attack",
    shoot: "units/doom-demon-attack",
    defend: "doom/dsdmact",
    hurt: "doom/dsdmpain",
    death: "doom/dssgtdth"
  },
  former_human: {
    attack: "doom/dspistol",
    shoot: "doom/dspistol",
    defend: "doom/dsposact",
    hurt: "doom/dspopain",
    death: "units/doom-former-human-death"
  },
  former_human_sergeant: {
    attack: "doom/dsshotgn",
    shoot: "doom/dsshotgn",
    defend: "doom/dsposact",
    hurt: "doom/dspopain",
    death: "units/doom-former-human-death"
  },
  imp: {
    attack: "units/doom-imp-attack",
    shoot: "units/doom-imp-attack",
    defend: "doom/dsbgact",
    hurt: "doom/dspopain",
    death: "units/doom-imp-death"
  },
  lost_soul: {
    attack: "doom/dssklatk",
    shoot: "doom/dssklatk",
    defend: "doom/dsdmact",
    hurt: "doom/dsdmpain",
    death: "doom/dsfirxpl"
  },
  cacodemon: {
    attack: "units/doom-cacodemon-attack",
    shoot: "units/doom-cacodemon-attack",
    defend: "doom/dsdmact",
    hurt: "doom/dsdmpain",
    death: "doom/dscacdth"
  },
  hell_knight: {
    attack: "units/doom-hell-knight-attack",
    shoot: "units/doom-hell-knight-attack",
    defend: "doom/dsdmact",
    hurt: "doom/dsdmpain",
    death: "doom/dskntdth"
  },
  arachnotron: {
    attack: "units/doom-arachnotron-attack",
    shoot: "units/doom-arachnotron-attack",
    defend: "doom/dsbspact",
    hurt: "doom/dsdmpain",
    death: "doom/dsbspdth"
  },
  former_commando: {
    attack: "units/doom-machinegun-attack",
    shoot: "units/doom-machinegun-attack",
    defend: "doom/dsposact",
    hurt: "doom/dspopain",
    death: "units/doom-former-human-death"
  },
  baron_of_hell: {
    attack: "units/doom-baron-attack",
    shoot: "units/doom-baron-attack",
    defend: "doom/dsdmact",
    hurt: "doom/dsdmpain",
    death: "doom/dsbrsdth"
  },
  revenant: {
    attack: "units/doom-revenant-attack",
    shoot: "units/doom-revenant-attack",
    defend: "doom/dsskeact",
    hurt: "doom/dspopain",
    death: "doom/dsskedth"
  },
  mancubus: {
    attack: "units/doom-mancubus-attack",
    shoot: "units/doom-mancubus-attack",
    defend: "doom/dsposact",
    hurt: "doom/dsmnpain",
    death: "doom/dsmandth"
  },
  pain_elemental: {
    attack: "doom/dssklatk",
    shoot: "doom/dssklatk",
    defend: "doom/dsdmact",
    hurt: "doom/dspepain",
    death: "doom/dspedth"
  },
  arch_vile: {
    attack: "units/doom-arch-vile-attack",
    shoot: "units/doom-arch-vile-attack",
    defend: "doom/dsvilact",
    hurt: "doom/dsvipain",
    death: "doom/dsvildth"
  },
  spider_mastermind: {
    attack: "units/doom-machinegun-attack",
    shoot: "units/doom-machinegun-attack",
    defend: "doom/dsdmact",
    hurt: "doom/dsdmpain",
    death: "doom/dsspidth"
  },
  cyberdemon: {
    attack: "units/doom-cyberdemon-attack",
    shoot: "units/doom-cyberdemon-attack",
    defend: "doom/dsdmact",
    hurt: "doom/dsdmpain",
    death: "doom/dscybdth"
  }
};

const doomMoveSoundOverrides: Record<string, string> = {
  demon: "units/doom-demon-move",
  former_human: "units/doom-former-human-move",
  former_human_sergeant: "units/doom-former-human-move",
  imp: "units/doom-imp-move",
  lost_soul: "units/doom-lost-soul-move",
  cacodemon: "units/doom-cacodemon-move",
  hell_knight: "units/doom-hell-knight-move",
  arachnotron: "units/doom-arachnotron-move",
  former_commando: "units/doom-former-human-move",
  baron_of_hell: "units/doom-baron-move",
  revenant: "units/doom-revenant-move",
  mancubus: "units/doom-mancubus-move",
  pain_elemental: "units/doom-pain-elemental-move",
  arch_vile: "units/doom-arch-vile-move",
  spider_mastermind: "units/doom-spider-mastermind-move",
  cyberdemon: "units/doom-cyberdemon-move"
};

const moveSoundOverrides: Record<string, string> = {
  ...doomMoveSoundOverrides,
  arch_devils: "units/arch-devil-teleport",
  gorynych: "units/black-dragon-move"
};

const actionSoundOverrides: Partial<Record<string, Partial<Record<UnitSoundAction, string>>>> = {
  ...doomActionSoundOverrides,
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
  if (slug === "sonya") {
    return mgqVoiceKey("sonya", action);
  }
  if (slug === "kyousuke_natsume") {
    return littleBustersVoiceKey("kyousuke", action);
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
  if (unitDefId.startsWith("little_busters.")) {
    const slug = littleBustersUnitVoices[bareName];
    return slug ? littleBustersVoiceKey(slug, action) : undefined;
  }
  const littleBustersHeroSlug = littleBustersHeroVoices[unitDefId];
  if (littleBustersHeroSlug) {
    return littleBustersVoiceKey(littleBustersHeroSlug, action);
  }
  if (unitDefId.startsWith("fuyuki.")) {
    const fuyukiSlug = fuyukiUnitVoices[bareName];
    const key = fuyukiSlug ? fuyukiVoiceKey(fuyukiSlug, action) : undefined;
    if (key) {
      return key;
    }
  }
  if (unitDefId.startsWith("mgq.")) {
    const mgqSlug = mgqUnitVoices[bareName];
    return mgqSlug ? mgqVoiceKey(mgqSlug, action) : undefined;
  }
  const azurLaneSlug = azurLaneUnitVoices[bareName];
  if (azurLaneSlug) {
    return azurLaneVoiceKey(azurLaneSlug, action);
  }
  // Raid/Dungeon bosses (unitDefId `boss.<id>`) borrow a converted H3 voice.
  const voice = unitDefId.startsWith("boss.")
    ? bossVoices[bareName]
    : creatureVoices[bareName];
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

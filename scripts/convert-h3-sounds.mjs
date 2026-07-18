/**
 * Convert Heroes 3 sound-archive WAVs (dropped in the repo root) into named,
 * web-ready MP3s under public/sounds/, then rebuild public/sounds/manifest.json.
 *
 * Usage:  node scripts/convert-h3-sounds.mjs        (requires ffmpeg)
 *
 * Identification comes from docs/h3-sound-reference.csv (extracted from the
 * VCMI engine's data files), so file names never need to be guessed:
 *   - creature rows ("creature:<town>") decode as <creature>-<action>
 *   - spell rows go to spells/, everything else to effects/ unless OVERRIDES
 *     places it in ui/, adventure/ or music/.
 * Unrecognized WAVs are reported at the end and left unconverted.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.join(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public/sounds");
// Drop raw H3 / HotA .wav files here (or in the repo root) and run the script.
// Scanned recursively, so the HotA sound-archive folder layout works as-is.
const INCOMING = path.join(ROOT, "sounds-incoming");

const ACTIONS = {
  ATTK: "attack", DFND: "defend", KILL: "death", MOVE: "move",
  WNCE: "hurt", SHOT: "shoot", EXT1: "special", EXT2: "special-2",
  DETH: "death-alt",
};

// Ambient loops (LOOPxxxx): [final name, what plays it on the adventure map].
// Object lists come from VCMI's config/objects/*.json "ambient" entries.
const AMBIENT = {
  LOOPAIR: ["air", "Air Elemental dwellings / Altar of Air"],
  LOOPANIM: ["labyrinth", "Labyrinth (minotaur dwelling)"],
  LOOPARCH: ["archers-tower", "Archers' Tower / Lizard Den"],
  LOOPAREN: ["arena", "Arena"],
  LOOPBEHE: ["behemoth-lair", "Behemoth Crag / Gorgon Lair"],
  LOOPBIRD: ["birds", "Cliff Nest (roc dwelling)"],
  LOOPBUOY: ["buoy", "Buoy"],
  LOOPCAMP: ["refugee-camp", "Refugee Camp"],
  LOOPCAVE: ["cave", "Cyclops Cave, Demon Gate, Pillar of Eyes, Warren"],
  LOOPCRYS: ["crystals", "Crystal Cavern"],
  LOOPCURS: ["cursed-ground", "Cursed Ground"],
  LOOPDEAD: ["undead", "Graveyard, Mausoleum, Tomb of Souls, Hall of Darkness"],
  LOOPDEN: ["den-of-thieves", "Den of Thieves"],
  LOOPDEVL: ["devils", "Forsaken Palace (devil dwelling)"],
  LOOPDOG: ["kennels", "Kennels (hell hound dwelling)"],
  LOOPDRAG: ["dragons", "dragon dwellings and caves"],
  LOOPDWAR: ["dwarves", "Dwarf Cottage / Dwarven Treasury"],
  LOOPEART: ["earth", "Earth Elemental dwellings / Altar of Earth"],
  LOOPELF: ["elves", "Homestead (elf dwelling)"],
  LOOPFACT: ["factory", "War Machine Factory"],
  LOOPFAER: ["faerie-ring", "Faerie Ring"],
  LOOPFALL: ["waterfall", "waterfalls"],
  LOOPFIRE: ["fire", "Hell Hole, Imp Crucible, Altar of Fire"],
  LOOPFLAG: ["flag", "flagged object / garrison (uncertain)"],
  LOOPFOUN: ["fountain", "fountains / Altar of Water"],
  LOOPGARD: ["garden", "Garden of Revelation / Dendroid Arches"],
  LOOPGATE: ["subterranean-gate", "Subterranean Gate"],
  LOOPGEMP: ["gem-pond", "Gem Pond"],
  LOOPGOBL: ["goblins", "Goblin Barracks"],
  LOOPGREM: ["gremlins", "Workshop (gremlin dwelling)"],
  LOOPGRIF: ["griffins", "Griffin Tower / Conservatory"],
  LOOPHARP: ["harpies", "Harpy Loft"],
  LOOPHORS: ["stables", "Centaur Stables / Training Grounds"],
  LOOPHYDR: ["hydras", "Hydra Pond"],
  LOOPLEAR: ["insects", "Dragon Fly / Serpent Fly Hive"],
  LOOPLEPR: ["leprechaun", "leprechaun-themed object (uncertain)"],
  LOOPLUMB: ["lumber-mill", "Sawmill"],
  LOOPMAGI: ["magic", "Mage Tower, Altar of Wishes, anti-magic garrison"],
  LOOPMANT: ["manticores", "Manticore Lair"],
  LOOPMARK: ["market", "marketplace (uncertain)"],
  LOOPMEDU: ["medusas", "Medusa Chapel / Store"],
  LOOPMERC: ["mercenary-camp", "Mercenary Camp"],
  LOOPMILL: ["mill", "Water Mill"],
  LOOPMINE: ["mine", "mines"],
  LOOPMON1: ["monolith-1", "one-way Monolith"],
  LOOPMON2: ["monolith-2", "two-way Monolith"],
  LOOPMONK: ["monastery", "Monastery (monk dwelling)"],
  LOOPMONS: ["monsters", "Basilisk Pit / Wyvern Nest"],
  LOOPNAGA: ["nagas", "Golden Pavilion / Naga Bank"],
  LOOPOCEA: ["ocean", "ocean / coast"],
  LOOPOGRE: ["ogres", "Ogre Fort"],
  LOOPORC: ["orcs", "Orc Tower / Gnoll Hut"],
  LOOPPEGA: ["pegasi", "Enchanted Spring (pegasus dwelling)"],
  LOOPPIKE: ["guardhouse", "Guardhouse (pikeman dwelling)"],
  LOOPSANC: ["sanctuary", "Sanctuary / Portal of Glory"],
  LOOPSHRIN: ["shrine", "Shrines of Magic"],
  LOOPSIRE: ["sirens", "Sirens"],
  LOOPSKEL: ["skeletons", "Cursed Temple (skeleton dwelling)"],
  LOOPSTAR: ["star-axis", "Star Axis"],
  LOOPSULF: ["sulfur-mine", "Sulfur Dune"],
  LOOPSWAR: ["swamp", "swamp ambience (uncertain)"],
  LOOPSWOR: ["swords", "military dwellings (uncertain)"],
  LOOPTAV: ["tavern", "Tavern"],
  LOOPTITA: ["titans", "Cloud Temple (titan dwelling)"],
  LOOPUNIC: ["unicorns", "Unicorn Glade"],
  LOOPVENT: ["fire-vents", "Fire Lake / Hall of Sins"],
  LOOPVOLC: ["volcano", "Volcano"],
  LOOPWHIR: ["whirlpool", "Whirlpool"],
  LOOPWIND: ["windmill", "Windmill"],
  LOOPWOLF: ["wolves", "Wolf Pen"],
  // --- HotA (Horn of the Abyss) Cove & Factory dwelling ambiences. Names from
  // the VCMI HotA port's dwellings.json (vcmi-mods/horn-of-the-abyss). The
  // Stormbird "Nest" reuses base LOOPBIRD, so it is not repeated here. ---
  LOOPWTFL: ["nymph-waterfall", "Nymph Waterfall (Cove nymph dwelling)"],
  LOOPMATR: ["cove-shack", "Shack (Cove crew mate dwelling)"],
  LOOPFRIG: ["frigate", "Frigate (Cove pirate dwelling)"],
  LOOPNIXF: ["nix-fort", "Nix Fort (Cove nix dwelling)"],
  LOOPHASP: ["maelstrom", "Maelstrom (Cove sea serpent dwelling)"],
  LOOPSORC: ["tower-of-the-seas", "Tower of the Seas (Cove sea witch dwelling)"],
  LOOPHALF: ["halfling-adobe", "Halfling Adobe (Factory halfling dwelling)"],
  LOOPGUNS: ["watchtower", "Watchtower (Factory gunslinger dwelling)"],
  LOOPCOTL: ["serpentarium", "Serpentarium (Factory couatl dwelling)"],
  // --- HotA map-object & dwelling ambiences (names from the VCMI HotA port's
  // mapObjects / heroes3DataPatch / highlands configs, branch vcmi-1.7). ---
  LOOPBASI: ["spit", "Spit (HotA map object)"],
  LOOPBEHD: ["ziggurat", "Ziggurat (HotA dwelling)"],
  LOOPCMTR: ["churchyard", "Churchyard (HotA map object)"],
  LOOPDRRK: ["derrick", "Derrick (HotA map object)"],
  LOOPEXSH: ["experimental-shop", "Experimental Shop (HotA map object)"],
  LOOPJUNK: ["junkman", "Junkman (HotA map object)"],
  LOOPMANS: ["mansion", "Mansion (HotA map object)"],
  LOOPPCAV: ["pirate-cavern", "Pirate Cavern (HotA map object)"],
  LOOPPICK: ["wolf-raider-picket", "Wolf Raider Picket (HotA map object)"],
  LOOPPROS: ["prospector", "Prospector (HotA map object)"],
  LOOPRUIN: ["ruins", "Ruins (HotA highlands object)"],
  LOOPSTPL: ["temple-of-the-sea", "Temple of the Sea (HotA map object)"],
  LOOPWATR: ["highlands-waterfall", "Waterfall (HotA highlands)"],
  LOOPMAMN: ["mammoth-dwelling", "Mammoth dwelling ambience (Bulwark)"],
  // base-dwelling ambiences re-specified by HotA's heroes3DataPatch (decode clear)
  LOOPMUMM: ["mummy-dwelling", "Mummy dwelling ambience"],
  LOOPPEAS: ["peasant-dwelling", "Peasant dwelling ambience"],
  LOOPTRLL: ["troll-dwelling", "Troll dwelling ambience"],
  // non-LOOP ambient object sounds
  BLCKTWRL: ["black-tower", "Black Tower ambience (HotA)"],
  IVORTWLO: ["ivory-tower", "Ivory Tower ambience (HotA)"],
  REDTWRLO: ["red-tower", "Red Tower ambience (HotA)"],
  WRHSCRST: ["warehouse-crystal", "Warehouse of Crystal (HotA)"],
  WRHSGEMS: ["warehouse-gems", "Warehouse of Gems (HotA)"],
  WRHSGOLD: ["warehouse-gold", "Warehouse of Gold (HotA)"],
  WRHSMERC: ["warehouse-mercury", "Warehouse of Mercury (HotA)"],
  WRHSOREM: ["warehouse-ore", "Warehouse of Ore (HotA)"],
  WRHSSULF: ["warehouse-sulfur", "Warehouse of Sulfur (HotA)"],
  WRHSWOOD: ["warehouse-wood", "Warehouse of Wood (HotA)"],
  // critter ambiences from the base archive (not in VCMI configs — best-effort)
  CHICK: ["chicken", "chicken ambience (uncertain)"],
  COCK: ["rooster", "rooster ambience (uncertain)"],
  FROGS01: ["frogs-1", "frog ambience (uncertain)"],
  FROGS02: ["frogs-2", "frog ambience (uncertain)"],
  PIGSND: ["pig", "pig ambience (uncertain)"],
  // genuinely unidentified ambiences (kept rather than dropped; flagged)
  LOOPHOGD: ["loophogd", "unidentified dwelling ambience (LOOPHOGD); uncertain"],
  LOOPELAL: ["loopelal", "unidentified ambience (LOOPELAL); uncertain"],
  LOOPMFOR: ["loopmfor", "unidentified ambience (LOOPMFOR); uncertain"],
};

// Re-home sounds whose derived destination lands in the wrong category,
// keyed by the destination the reference CSV produces.
const RELOCATE = {
  // adventure map events / object visits
  "effects/new-day": "adventure/new-day",
  "effects/new-week": "adventure/new-week",
  "effects/new-month": "adventure/new-month",
  "effects/treasure": "adventure/treasure",
  "effects/quest": "adventure/quest",
  "effects/obelisk": "adventure/obelisk",
  "effects/temple": "adventure/temple",
  "effects/store": "adventure/store",
  "effects/graveyard": "adventure/graveyard",
  "effects/lighthouse": "adventure/lighthouse",
  "effects/gazebo": "adventure/gazebo",
  "effects/flagmine": "adventure/flag-mine",
  "effects/getprotection": "adventure/get-protection",
  "effects/military": "adventure/military",
  "effects/mystery": "adventure/mystery",
  "effects/nomad": "adventure/nomad",
  "effects/rogue": "adventure/rogue",
  "effects/luck": "adventure/luck",
  "effects/morale": "adventure/morale",
  "effects/protect": "adventure/protect",
  "effects/ultimateartifact": "adventure/ultimate-artifact",
  "effects/hero-new-level": "adventure/hero-new-level",
  "effects/telein": "adventure/teleport",
  "effects/storm": "ambient/storm",
  // adventure spells and battle-spell extras
  "effects/quiksand": "spells/quicksand",
  "effects/view": "spells/view",
  "effects/visions": "spells/visions",
  "effects/scutboat": "spells/scuttle-boat",
  "effects/summboat": "spells/summon-boat",
  "effects/watrwalk": "spells/water-walk",
  "effects/flyspell": "spells/fly",
  "effects/landmine": "spells/land-mine",
  "effects/haste": "spells/haste-alt",
  "effects/fireball": "spells/fireball-hit",
  "effects/icerayex": "spells/ice-bolt-hit",
  "effects/sacrif2": "spells/sacrifice-2",
  "effects/telptin": "spells/teleport-in",
  // HotA Factory ability sounds (shipped under public/sounds/spells/)
  "effects/grenade": "spells/grenade",
  "effects/repair": "spells/repair",
  // multiplayer / interface
  "effects/playcome": "ui/player-joined",
  "effects/playexit": "ui/player-left",
  "effects/playturn": "ui/your-turn",
  "effects/sysmsg": "ui/system-message",
  "effects/time-over": "ui/time-over",
  // battle effects, properly named
  "effects/magicres": "effects/magic-resist",
  "effects/manadrai": "effects/mana-drain",
  "effects/regener": "effects/regeneration",
  "effects/rsbryfzl": "effects/spell-fizzle",
  "effects/mirrorim": "effects/mirror-image",
  "effects/wallhit": "effects/siege-wall-hit",
  "effects/wallmiss": "effects/siege-wall-miss",
  "effects/keepshot": "effects/siege-keep-shot",
  "effects/fireshie": "effects/fire-shield-hit",
  "effects/gogflame": "effects/gog-flame",
  "effects/goodluck": "effects/good-luck",
  "effects/goodmrle": "effects/good-morale",
  // creature/war-machine sounds that live outside the creature table
  "effects/genie": "units/genie-special",
  "effects/lichatk2": "units/lich-special",
  "effects/faidkill": "units/first-aid-tent-death",
  "effects/faidwnce": "units/first-aid-tent-hurt",
  "effects/mgogshot": "units/magog-shoot", // VCMI keeps it outside the creature table
};

// Sounds whose destination differs from what the reference CSV would derive.
const OVERRIDES = {
  BUTTON: "ui/button", CHAT: "ui/chat",
  BUILDTWN: "adventure/build-town", CHEST: "adventure/chest",
  CAVEHEAD: "adventure/cave-visit", // visit sound of subterranean gate / quest+border guards
  KILLFADE: "adventure/hero-defeated",
  CLIMAX: "effects/climax", // unused leftover in the original archive
  COLDRAY: "spells/cold-ray", COLDRING: "spells/cold-ring", // unused alternates of ice-bolt / frost-ring
  DIGSOUND: "adventure/dig", DISGUISE: "spells/disguise", EXPERNCE: "adventure/experience",
  FAERIE: "units/faerie-dragon-special",
  DRAINLIF: "effects/drain-life", DRAWBRG: "effects/drawbridge", DRGNSLAY: "effects/dragon-slayer",
  EVLIDETH: "units/evil-eye-death-alt", // EVLI prefix + DETH, not in VCMI's per-creature config
  SPONTCOMB: "spells/fireball", // fireball cast; VCMI also files it as the Magog's ability
  // war machines (not in the creature reference)
  BALLKILL: "units/ballista-death", BALLSHOT: "units/ballista-shoot", BALLWNCE: "units/ballista-hurt",
  CARTKILL: "units/ammo-cart-death", CARTWNCE: "units/ammo-cart-hurt",
  CATAKILL: "units/catapult-death", CATASHOT: "units/catapult-shoot", CATAWNCE: "units/catapult-hurt",

  // ---------------------------------------------------------------------------
  // HotA (Horn of the Abyss) batch — Cove / Factory / Bulwark / neutrals.
  // ---------------------------------------------------------------------------
  // Creature special-ability sounds. The .wav exists in the HotA archive, but
  // the VCMI port plays the ability via a spell config rather than a creature
  // sound slot, so these are not in the per-creature reference rows.
  ARMASPEC: "units/armadillo-special", AUTOSPEC: "units/automaton-special",
  GUNSSPEC: "units/gunslinger-special", WORMSPEC: "units/sandworm-special",
  SHAMSPEC: "units/shaman-special", PIRTABIL: "units/pirate-special",
  FNGRSUMM: "units/fangarm-special",
  // Movement-transition sounds (burrow / fly start+end). Named explicitly so
  // they read clearly and leave "-special" free for the ability sounds above.
  NIMPEXT1: "units/nymph-move-start", NIMPEXT2: "units/nymph-move-end",
  WORMEXT1: "units/sandworm-move-start", WORMEXT2: "units/sandworm-move-end",
  // Gold Golem alternate death (DETH suffix; GGLMKILL is the standard death).
  GGLMDETH: "units/gold-golem-death-alt",
  // HotA map-object VISIT sounds (the looped ambiences go in the AMBIENT table).
  ACADEMYV: "adventure/seafaring-academy", BLCKTWRS: "adventure/black-tower",
  BOTTLVIS: "adventure/vial-of-mana", CEMETRY: "adventure/churchyard",
  IVORYTOW: "adventure/ivory-tower", JUNKVIST: "adventure/junkman",
  LAMPVIST: "adventure/ancient-lamp", MANSIONV: "adventure/mansion",
  REDTWRVS: "adventure/red-tower", RUINSVIS: "adventure/ruins",
  SEATEMPL: "adventure/temple-of-the-sea", WERHOUSE: "adventure/warehouse",
  // Spell / effect sounds whose meaning decodes clearly.
  DEATHCLS: "spells/death-cloud-alt", // variant of DEATHCLD (spells/death-cloud)
  GOGFIREB: "effects/gog-fireball",   // Gog/Magog fireball (cf. GOGFLAME)
  // HotA horse-movement sounds for the new terrains; exact terrain id is
  // unverified, so they are named by index rather than asserting a terrain.
  HORSE11: "adventure/horse-11", HORSE30: "adventure/horse-penalty-30",
  HORSE31: "adventure/horse-penalty-31",
  // --- Best-effort names for sounds not found in any VCMI config (uncertain;
  // see NOTES). Kept so the files convert, flagged so no one trusts the label. ---
  FREEZE: "spells/freeze", RUNE: "effects/rune", MAGCBLTH: "effects/magcblth",
  ICEELMSH: "units/ice-elemental-special", STORMELM: "units/storm-elemental-special",
  EAGLEEYE: "effects/eagle-eye",
  HORN1: "effects/horn-1", HORN2: "effects/horn-2", HORN3: "effects/horn-3",
  HORN4: "effects/horn-4", HORN5: "effects/horn-5", HORNALTR: "effects/horn-altar",
  ROGER1: "effects/roger-1", ROGER2: "effects/roger-2", ROGER3: "effects/roger-3",
  ROGER4: "effects/roger-4",
  TERROR1: "effects/terror-1", TERROR2: "effects/terror-2", TERROR3: "effects/terror-3",
  TERROR4: "effects/terror-4", TERROR5: "effects/terror-5", TERROR6: "effects/terror-6",
  TERROR7: "effects/terror-7",
};

// VCMI entity ids that should not be kebab-cased mechanically.
const ENTITY_FIXES = {
  archAngel: "archangel", cyclop: "cyclops", cyclopKing: "cyclopsKing",
  fairieDragon: "faerieDragon", // VCMI typo
};

// Most -move clips are a short footstep/flap meant to LOOP for a full move
// (repeat: 2 = play twice back-to-back). A handful of creatures instead have a
// long, self-contained move clip — a continuous magical crackle / whoosh, an
// eye drone, a serpent slither — that already reads as the whole move; playing
// THOSE twice is a jarring echo, so they play exactly ONCE. This is curated by
// sound CHARACTER, not a duration cutoff: some equally-long clips (the Mammoth's
// ~1.85s footfalls, the Jotunn's ~1.8s tread) are genuine footstep loops and
// stay at repeat: 2. Keyed by the move-sound id.
const MOVE_PLAY_ONCE = new Set([
  "units/energy-elemental-move",
  "units/magic-elemental-move",
  "units/evil-eye-move",
  // The Evil Eye shares its exact move clip with the base Beholder (byte-for-byte
  // identical); flip both so the same sound is never doubled, whichever voice
  // ever plays it.
  "units/beholder-move",
  "units/sea-serpent-move", // Haspids speak with the Sea Serpent voice
  // The Harpy's move is a single self-contained wing-flap whoosh that already
  // reads as the whole flight; playing it twice is a jarring echo (the clip
  // sounds repeated), so it flaps exactly once.
  "units/harpy-move"
]);

// Manifest annotations. "repeat: 2" on every -move sound implements the rule
// that the movement sound is looped once for a full movement (except the
// MOVE_PLAY_ONCE clips above, which are long enough to play once).
const NOTES = {
  "units/centaur-shoot": "unused: centaurs are melee-only in the original game",
  "units/gremlin-shoot": "used by the Master Gremlin upgrade (base gremlin is melee)",
  "units/beholder-death-alt": "second death sound (BHDRDETH); BHDRKILL is the standard one",
  "spells/cold-ray": "unused alternate; the game uses ICERAY for ice-bolt",
  "spells/cold-ring": "unused alternate; the game uses FROSTING for frost-ring",
  "effects/climax": "unused leftover in the original archive, purpose unknown",
  "music/battle-00": "battle tracks 00-07: pick one at random per combat",
  "adventure/dig": "digging for the Grail",
  "adventure/experience": "experience gained",
  "effects/death-blow": "Death Blow battle effect (Dread Knight ability)",
  "effects/drawbridge": "siege drawbridge raising/lowering",
  "effects/drain-life": "likely Vampire Lord life drain; unreferenced in the engine",
  "effects/dragon-slayer": "unused; the Slayer spell uses SLAYER",
  "effects/dragon-hall": "dragon dwelling ambience; unreferenced in the engine",
  "effects/dipmagk": "unknown purpose, unreferenced in the engine",
  "units/evil-eye-death-alt": "second death sound (EVLIDETH); EVLIKILL is the standard one",
  "effects/danger": "Whirlpool visit (DANGER) — VCMI config/objects/generic.json whirlpool.sounds.visit",
  "effects/default": "generic fallback beep",
  "units/faerie-dragon-special": "Faerie Dragon spell-cast (FAERIE) — play when its turn-start magic damage triggers",
  "units/genie-special": "Genie/Master Genie spell-cast (GENIE) — play when it casts its ability",
  "spells/implosion": "original file is DECAY.wav",
  "units/lich-special": "Lich area-attack variant (LICHATK); regular shot is lich-shoot",
  "units/first-aid-tent-death": "war machine destroyed",
  "units/first-aid-tent-hurt": "war machine hit",
  "spells/fireball": "cast sound (SPONTCOMB); also the Magog's fireball ability",
  "spells/fireball-hit": "explosion/impact (FIREBALL)",
  "spells/ice-bolt-hit": "impact (ICERAYEX); cast is spells/ice-bolt",
  "spells/haste-alt": "unused alternate (HASTE); the game casts with TAILWIND",
  "spells/sacrifice-2": "second Sacrifice sound (SACRIF2)",
  "spells/teleport-in": "battle teleport arrival (TELPTIN); spells/teleport is TELPTOUT (cast + monolith/gate visit)",
  "spells/teleport": "TELPTOUT — Teleport spell cast AND monolith/two-way gate visit (VCMI moddables.json)",
  "spells/quicksand": "original file QUIKSAND",
  "spells/view": "View Air / View Earth",
  // TELEIN is a misc effect; VCMI monoliths use TELPTOUT (spells/teleport), NOT this.
  "adventure/teleport": "TELEIN misc effect — NOT the monolith visit (that is TELPTOUT → spells/teleport)",
  "adventure/pickup-01": "pickups 01-07: resource/artifact pickup, pick one at random",
  "adventure/luck": "luck bonus gained at a map object",
  "adventure/morale": "morale bonus gained at a map object",
  "adventure/protect": "protective buff at a map object (uncertain)",
  "adventure/get-protection": "protective buff at a map object (uncertain)",
  "adventure/military": "military object visit (uncertain)",
  "adventure/mystery": "mysterious object visit (uncertain)",
  "adventure/nomad": "nomad tent / desert object visit (uncertain)",
  "adventure/rogue": "Den of Thieves / rogue encounter (uncertain)",
  "adventure/store": "marketplace / storage visit (uncertain)",
  "adventure/gazebo": "Learning Stone (gazebo) visit",
  "adventure/treasure": "gold / treasure pickup",
  "adventure/ultimate-artifact": "Grail / ultimate artifact found",
  "effects/magic-resist": "spell resisted (MAGICRES)",
  "effects/mana-drain": "mana drained (MANADRAI)",
  "effects/regeneration": "Regeneration ability (troll, wight)",
  "effects/spell-fizzle": "spell fails / fizzles (RSBRYFZL)",
  "effects/mirror-image": "possibly Magic Mirror reflection (MIRRORIM); uncertain",
  "effects/siege-keep-shot": "arrow tower firing during siege",
  "effects/siege-wall-hit": "catapult hits the wall",
  "effects/siege-wall-miss": "catapult misses",
  "effects/fire-shield-hit": "Fire Shield retaliation damage (FIRESHIE)",
  "effects/gog-flame": "Gog/Magog fireball attack effect (GOGFLAME)",
  "effects/fear": "Fear ability (Azure Dragon)",
  "effects/fire-storm": "unknown/unused (FIRESTRM)",
  "effects/magcarow": "unknown (MAGCAROW); possibly magic-arrow impact",
  "effects/magchdrn": "unknown (MAGCHDRN); possibly mana drained at a magic well",
  "effects/magchfil": "unknown (MAGCHFIL); possibly mana refilled at a magic well",
  "effects/mnrdeath": "unknown (MNRDEATH)",
  "ambient/storm": "storm weather (uncertain)",
  // --- HotA additions ---
  "units/halfling-grenadier-shoot":
    "Halfling Grenadier ranged sound (HALGSHOT); its other actions reuse core HALF* files",
  "spells/grenade": "Grenade ability cast/explosion (GRENEXPL) — Halfling Grenadier / Bounty Hunter",
  "spells/repair": "Repair ability cast (REPAIR) — Factory mechanical-unit heal",
  // creature special-ability sounds (present in the HotA archive; VCMI plays
  // the ability via spell config, so they have no per-creature sound slot)
  "units/armadillo-special": "Armadillo special ability (ARMASPEC)",
  "units/automaton-special": "Automaton special ability (AUTOSPEC)",
  "units/gunslinger-special": "Gunslinger special ability (GUNSSPEC)",
  "units/sandworm-special": "Sandworm special attack (WORMSPEC)",
  "units/shaman-special": "Shaman special ability (SHAMSPEC)",
  "units/pirate-special": "Pirate/Corsair/Sea Dog special ability (PIRTABIL)",
  "units/fangarm-special": "Fangarm summon/resurrect (FNGRSUMM)",
  // movement-transition sounds
  "units/nymph-move-start": "Nymph/Oceanid move-start (NIMPEXT1)",
  "units/nymph-move-end": "Nymph/Oceanid move-end (NIMPEXT2)",
  "units/sandworm-move-start": "Sandworm burrow / move-start (WORMEXT1)",
  "units/sandworm-move-end": "Sandworm surface / move-end (WORMEXT2)",
  "units/gold-golem-death-alt": "Gold Golem alternate death (GGLMDETH); GGLMKILL is the standard one",
  // HotA map-object visit sounds
  "adventure/seafaring-academy": "Seafaring Academy visit (ACADEMYV)",
  "adventure/black-tower": "Black Tower visit (BLCKTWRS)",
  "adventure/vial-of-mana": "Vial of Mana pickup (BOTTLVIS)",
  "adventure/churchyard": "Churchyard visit (CEMETRY)",
  "adventure/ivory-tower": "Ivory Tower visit (IVORYTOW)",
  "adventure/junkman": "Junkman visit (JUNKVIST)",
  "adventure/ancient-lamp": "Ancient Lamp visit (LAMPVIST)",
  "adventure/mansion": "Mansion visit (MANSIONV)",
  "adventure/red-tower": "Red Tower visit (REDTWRVS)",
  "adventure/ruins": "Ruins visit (RUINSVIS)",
  "adventure/temple-of-the-sea": "Temple of the Sea visit (SEATEMPL)",
  "adventure/warehouse": "Warehouses visit (WERHOUSE)",
  "spells/death-cloud-alt": "death-cloud variant (DEATHCLS); spells/death-cloud is DEATHCLD",
  "effects/gog-fireball": "Gog/Magog fireball (GOGFIREB); cf. GOGFLAME",
  // uncertain — named best-effort; NOT found in any VCMI/HotA config
  "adventure/horse-11": "HotA horse-movement sound, terrain id 11 (HORSE11); terrain unverified",
  "adventure/horse-penalty-30": "HotA horse-movement penalty sound (HORSE30); terrain unverified",
  "adventure/horse-penalty-31": "HotA horse-movement penalty sound (HORSE31); terrain unverified",
  "spells/freeze": "FREEZE — likely a freeze/frost effect; uncertain, unverified in configs",
  "effects/rune": "RUNE — likely Bulwark rune magic; uncertain, unverified in configs",
  "effects/magcblth": "MAGCBLTH — unidentified; uncertain",
  "units/ice-elemental-special": "ICEELMSH — Ice Elemental extra/special sound; uncertain",
  "units/storm-elemental-special": "STORMELM — Storm Elemental extra/special sound; uncertain",
  "effects/eagle-eye": "EAGLEEYE — likely the Eagle Eye skill cue; uncertain",
  "effects/horn-1": "HORN1 — unidentified horn sound; uncertain",
  "effects/horn-2": "HORN2 — unidentified horn sound; uncertain",
  "effects/horn-3": "HORN3 — unidentified horn sound; uncertain",
  "effects/horn-4": "HORN4 — unidentified horn sound; uncertain",
  "effects/horn-5": "HORN5 — unidentified horn sound; uncertain",
  "effects/horn-altar": "HORNALTR — unidentified horn/altar sound; uncertain",
  "effects/roger-1": "ROGER1 — unidentified (likely Cove/pirate); uncertain",
  "effects/roger-2": "ROGER2 — unidentified (likely Cove/pirate); uncertain",
  "effects/roger-3": "ROGER3 — unidentified (likely Cove/pirate); uncertain",
  "effects/roger-4": "ROGER4 — unidentified (likely Cove/pirate); uncertain",
  "effects/terror-1": "TERROR1 — unidentified; uncertain",
  "effects/terror-2": "TERROR2 — unidentified; uncertain",
  "effects/terror-3": "TERROR3 — unidentified; uncertain",
  "effects/terror-4": "TERROR4 — unidentified; uncertain",
  "effects/terror-5": "TERROR5 — unidentified; uncertain",
  "effects/terror-6": "TERROR6 — unidentified; uncertain",
  "effects/terror-7": "TERROR7 — unidentified; uncertain",
};
for (const [name, [slug, desc]] of Object.entries(AMBIENT))
  NOTES[`ambient/${slug}`] = `${desc} (${name})`;

// Sounds that trigger a follow-up: the AoE explosion lands right after the
// attack sound (lich death cloud, magog fireball).
const CHAIN = {
  "units/lich-attack": "spells/death-cloud",
  "units/lich-shoot": "spells/death-cloud",
  "units/power-lich-attack": "spells/death-cloud",
  "units/power-lich-shoot": "spells/death-cloud",
  "units/magog-attack": "spells/fireball-hit",
  "units/magog-shoot": "spells/fireball-hit",
};

// Virtual ids for sounds with several versions: play one member at random.
const RANDOM_GROUPS = {
  "music/battle": /^music\/battle-\d+$/,
  "adventure/pickup": /^adventure\/pickup-\d+$/,
};

const kebab = (s) =>
  (ENTITY_FIXES[s] ?? s).replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

function loadReference() {
  const ref = {};
  const csv = fs.readFileSync(path.join(ROOT, "docs/h3-sound-reference.csv"), "utf8");
  for (const line of csv.trim().split("\n").slice(1)) {
    const [name, entity, category] = line.split(",");
    ref[name] = { entity, category };
  }
  return ref;
}

function destinationFor(base, ref) {
  if (OVERRIDES[base]) return OVERRIDES[base];
  if (AMBIENT[base]) return `ambient/${AMBIENT[base][0]}`;
  if (/^BATTLE\d\d$/.test(base)) return `music/battle-${base.slice(-2)}`;
  const pickup = base.match(/^PICKUP(\d+)$/);
  if (pickup) return `adventure/pickup-${pickup[1].padStart(2, "0")}`;
  const row = ref[base];
  if (!row) return null;
  let dest;
  if (row.category.startsWith("creature:")) {
    const action = ACTIONS[base.slice(-4)];
    dest = action ? `units/${kebab(row.entity)}-${action}` : null;
  } else if (row.category === "spell") {
    dest = `spells/${kebab(row.entity)}`;
  } else {
    dest = `effects/${kebab(row.entity)}`;
  }
  if (!dest) return null;
  if (dest.startsWith("effects/horse-")) dest = `adventure/${dest.slice(8)}`;
  return RELOCATE[dest] ?? dest;
}

function buildManifest() {
  const entries = {};
  for (const dir of fs.readdirSync(OUT)) {
    const full = path.join(OUT, dir);
    if (!fs.statSync(full).isDirectory()) continue;
    for (const f of fs.readdirSync(full).sort()) {
      if (!f.endsWith(".mp3")) continue;
      const id = `${dir}/${f.replace(/\.mp3$/, "")}`;
      const entry = { src: `/sounds/${dir}/${f}` };
      // loop once = play twice for a full move; the long self-contained clips
      // in MOVE_PLAY_ONCE play a single time so they don't echo.
      if (id.endsWith("-move")) entry.repeat = MOVE_PLAY_ONCE.has(id) ? 1 : 2;
      // ambience, battle music and map riding loop until stopped
      if (dir === "ambient" || dir === "music" || id.startsWith("adventure/horse-"))
        entry.loop = true;
      if (id.startsWith("adventure/horse-"))
        entry.note = "hero riding on this terrain; penalty variant = slowed movement";
      if (CHAIN[id]) entry.then = CHAIN[id]; // play this id right after, e.g. AoE impact
      if (NOTES[id]) entry.note = NOTES[id];
      entries[id] = entry;
    }
  }
  for (const [id, pattern] of Object.entries(RANDOM_GROUPS)) {
    const members = Object.keys(entries).filter((k) => pattern.test(k)).sort();
    entries[id] = { random: members, note: "play one member at random" };
  }
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(entries, null, 2) + "\n");
  return Object.keys(entries).length;
}

// Gather .wav files to convert: everything under sounds-incoming/ (recursively,
// so the HotA archive's nested folders work untouched) plus loose drops in the
// repo root. Returned as absolute paths, ordered by file name.
function collectWavs() {
  const found = [];
  const scan = (dir, recurse) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (recurse) scan(full, true); continue; }
      if (/\.wav$/i.test(e.name)) found.push(full);
    }
  };
  scan(INCOMING, true);
  scan(ROOT, false);
  return found.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

function main() {
  const ref = loadReference();
  const seen = {}; // content hash -> id, to drop byte-identical duplicates
  const unresolved = [];
  let converted = 0;

  for (const abs of collectWavs()) {
    const base = path.basename(abs).replace(/\.wav$/i, "").toUpperCase();
    const dest = destinationFor(base, ref);
    if (!dest) { unresolved.push(path.relative(ROOT, abs)); continue; }
    // Drop EXT2 only when byte-identical to its EXT1 (e.g. ADVLEXT2). Any other
    // duplication is kept: creatures share audio across prefixes (dread knight
    // reuses black knight files) and across actions (gog shoot == gog attack),
    // and every id should resolve without fallback logic in the app.
    const hash = createHash("md5").update(fs.readFileSync(abs)).digest("hex");
    if (base.endsWith("EXT2") && seen[hash] === base.slice(0, -1) + "1") {
      console.log(`skip ${path.relative(ROOT, abs)}: identical to ${seen[hash]}`);
      continue;
    }
    seen[hash] = base;
    const target = path.join(OUT, `${dest}.mp3`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
      "-i", abs, "-codec:a", "libmp3lame", "-q:a", "5", target]);
    converted++;
  }

  const total = buildManifest();
  console.log(`converted ${converted}, manifest entries ${total}`);
  if (unresolved.length) console.log("UNRESOLVED (left in place):\n" + unresolved.join("\n"));
}

// Pure mapping helpers are exported for unit tests; conversion only runs when
// the script is executed directly (so importing it never touches ffmpeg/disk).
export { destinationFor, loadReference, ACTIONS, AMBIENT, kebab };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

#!/usr/bin/env node
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

const ROOT = path.join(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public/sounds");

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
};

// VCMI entity ids that should not be kebab-cased mechanically.
const ENTITY_FIXES = {
  archAngel: "archangel", cyclop: "cyclops", cyclopKing: "cyclopsKing",
  fairieDragon: "faerieDragon", // VCMI typo
};

// Manifest annotations. "repeat: 2" on every -move sound implements the rule
// that the movement sound is looped once for a full movement.
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
  "effects/danger": "unknown/unused",
  "effects/default": "generic fallback beep",
  "units/faerie-dragon-special": "Faerie Dragon spell-cast (FAERIE)",
  "spells/implosion": "original file is DECAY.wav",
  "units/genie-special": "Genie/Master Genie spell-cast (GENIE)",
  "units/lich-special": "Lich area-attack variant (LICHATK); regular shot is lich-shoot",
  "units/first-aid-tent-death": "war machine destroyed",
  "units/first-aid-tent-hurt": "war machine hit",
  "spells/fireball": "cast sound (SPONTCOMB); also the Magog's fireball ability",
  "spells/fireball-hit": "explosion/impact (FIREBALL)",
  "spells/ice-bolt-hit": "impact (ICERAYEX); cast is spells/ice-bolt",
  "spells/haste-alt": "unused alternate (HASTE); the game casts with TAILWIND",
  "spells/sacrifice-2": "second Sacrifice sound (SACRIF2)",
  "spells/teleport-in": "battle teleport arrival (TELPTIN); spells/teleport is the cast",
  "spells/quicksand": "original file QUIKSAND",
  "spells/view": "View Air / View Earth",
  "adventure/teleport": "map teleporter / monolith travel (TELEIN)",
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
};
for (const [name, [slug, desc]] of Object.entries(AMBIENT))
  NOTES[`ambient/${slug}`] = `${desc} (${name})`;

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
      if (id.endsWith("-move")) entry.repeat = 2; // loop once = play twice for a full move
      // ambience, battle music and map riding loop until stopped
      if (dir === "ambient" || dir === "music" || id.startsWith("adventure/horse-"))
        entry.loop = true;
      if (id.startsWith("adventure/horse-"))
        entry.note = "hero riding on this terrain; penalty variant = slowed movement";
      if (NOTES[id]) entry.note = NOTES[id];
      entries[id] = entry;
    }
  }
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(entries, null, 2) + "\n");
  return Object.keys(entries).length;
}

const ref = loadReference();
const seen = {}; // content hash -> id, to drop byte-identical duplicates
const unresolved = [];
let converted = 0;

for (const f of fs.readdirSync(ROOT).filter((f) => f.endsWith(".wav")).sort()) {
  const base = f.replace(/\.wav$/, "").toUpperCase();
  const dest = destinationFor(base, ref);
  if (!dest) { unresolved.push(f); continue; }
  // Drop EXT2 only when byte-identical to its EXT1 (e.g. ADVLEXT2). Any other
  // duplication is kept: creatures share audio across prefixes (dread knight
  // reuses black knight files) and across actions (gog shoot == gog attack),
  // and every id should resolve without fallback logic in the app.
  const hash = createHash("md5").update(fs.readFileSync(path.join(ROOT, f))).digest("hex");
  if (base.endsWith("EXT2") && seen[hash] === base.slice(0, -1) + "1") {
    console.log(`skip ${f}: identical to ${seen[hash]}`);
    continue;
  }
  seen[hash] = base;
  const target = path.join(OUT, `${dest}.mp3`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
    "-i", path.join(ROOT, f), "-codec:a", "libmp3lame", "-q:a", "5", target]);
  converted++;
}

const total = buildManifest();
console.log(`converted ${converted}, manifest entries ${total}`);
if (unresolved.length) console.log("UNRESOLVED (left in place):\n" + unresolved.join("\n"));

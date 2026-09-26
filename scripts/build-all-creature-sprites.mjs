#!/usr/bin/env node
/**
 * Batch wrapper for scripts/build-creature-sprites.mjs: builds the Hex
 * Battlefield atlas of every H3 creature a unit card uses, from a folder of the
 * original .def files (H3sprite.lod extracts).
 *
 *   node scripts/build-all-creature-sprites.mjs <folder-with-defs> [more folders...] [--only slug,slug] [--anchor-only]
 *
 * --anchor-only re-anchors the existing atlases on the PC canvas point (see
 * build-creature-sprites.mjs) without re-encoding any image.
 *
 * The unit-id -> slug map lives in src/data/battle-hex/creature-sprites.ts;
 * this list only says which .def each slug is cut from. Both creatures of every
 * pair are built: a card's Few side shows the base creature, its Pack side the
 * upgrade, and Neutral cards the base. Missing .def files are reported and
 * skipped.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CREATURE_DEFS = {
  // Castle
  pikeman: "CPKMAN", halberdier: "chalbd", archer: "CLCBOW", marksman: "CHCBOW", griffin: "CGRIFF",
  "royal-griffin": "Crgrif", swordsman: "Csword", crusader: "Ccrusd", monk: "Cmonkk", zealot: "Czealt",
  cavalier: "CCAVLR", champion: "CCHAMP", angel: "cangel", archangel: "CRANGL",
  // Necropolis
  skeleton: "CSKELE", "skeleton-warrior": "CWSKEL", "walking-dead": "CZOMBI", zombie: "CZOMLO", wight: "CWIGHT",
  wraith: "CWRAIT", vampire: "CVAMP", "vampire-lord": "CNOSFE", lich: "CLICH", "power-lich": "CPLICH",
  "black-knight": "CBKNIG", "dread-knight": "CBLORD", "bone-dragon": "CNDRGN", "ghost-dragon": "CHDRGN",
  // Dungeon
  troglodyte: "Ctrogl", "infernal-troglodyte": "Citrog", harpy: "CHARPY", "harpy-hag": "CHARPH", beholder: "cbehol",
  "evil-eye": "Ceveye", medusa: "Cmedus", "medusa-queen": "Cmeduq", minotaur: "CMINOT", "minotaur-king": "Cminok",
  manticore: "CMCORE", scorpicore: "CCMCOR", "red-dragon": "CRDRGN", "black-dragon": "CBDRGN",
  // Rampart
  centaur: "CCENTR", "centaur-captain": "CECENT", dwarf: "CDWARF", "battle-dwarf": "CBDWAR", "wood-elf": "CELF",
  "grand-elf": "CGRELF", pegasus: "CPEGAS", "silver-pegasus": "CAPEGS", "dendroid-guard": "CTREE",
  "dendroid-soldier": "CBTREE", unicorn: "CUNICO", "war-unicorn": "CWUNIC", "green-dragon": "CGDRAG", "gold-dragon": "CDDRAG",
  // Inferno
  imp: "CIMP", familiar: "CFAMIL", gog: "CGOG", magog: "CMAGOG", "hell-hound": "CHHOUN", cerberus: "CCERBU",
  demon: "COHDEM", "horned-demon": "CTHDEM", "pit-fiend": "CPFIEN", "pit-lord": "CPFOE", efreet: "cefree",
  "efreet-sultan": "cefres", devil: "CDEVIL", "arch-devil": "CADEVL",
  // Stronghold
  goblin: "CGOBLI", hobgoblin: "CHGOBL", "wolf-rider": "CBWLFR", "wolf-raider": "CUWLFR", orc: "CORC",
  "orc-chieftain": "CORCCH", ogre: "COGRE", "ogre-mage": "COGMAG", roc: "CROC", thunderbird: "CTBIRD",
  cyclops: "CCYCLR", "cyclops-king": "CcyclLor", behemoth: "CYBEHE", "ancient-behemoth": "CABEHE",
  // Fortress
  gnoll: "CGNOLL", "gnoll-marauder": "CGNOLM", lizardman: "CPLIZA", "lizard-warrior": "CALIZA", "serpent-fly": "CDRFLY",
  "dragon-fly": "CDRFIR", basilisk: "CBASIL", "greater-basilisk": "CGBASI", gorgon: "Cbgog", "mighty-gorgon": "Ccgorg",
  wyvern: "CWYVER", "wyvern-monarch": "CWYVMN", hydra: "CHYDRA", "chaos-hydra": "cchydr",
  // Tower
  gremlin: "CGREMA", "master-gremlin": "CGREMM", "stone-gargoyle": "CGARGO", "obsidian-gargoyle": "COGARG",
  "stone-golem": "CSGOLE", "iron-golem": "CIGOLE", mage: "CMAGE", "arch-mage": "CAMAGE", genie: "CGENIE",
  "master-genie": "CSULTA", naga: "CNAGA", "naga-queen": "CNAGAG", giant: "CLTITA", titan: "CGTITA",
  // Conflux
  pixie: "Cpixie", sprite: "CSprite", "air-elemental": "CAELEM", "storm-elemental": "Cstorm", "water-elemental": "CWELEM",
  "ice-elemental": "Cicee", "fire-elemental": "CFELEM", "energy-elemental": "Cnrg", "earth-elemental": "CEELEM",
  "magma-elemental": "Cstone", "psychic-elemental": "Cpsyel", "magic-elemental": "Cmagel", firebird: "Cfbird", phoenix: "Cphx",
  // Neutral
  boar: "Cboar", halfling: "CHalf", peasant: "Cpeas", rogue: "Crogue", mummy: "Cmummy", nomad: "Cnomad",
  sharpshooter: "Csharp", "gold-golem": "CGGOLE", "diamond-golem": "CDGOLE", enchanter: "Cench", troll: "Ctroll",
  "azure-dragon": "CaDrgn", "crystal-dragon": "Ccdrgn", "faerie-dragon": "Cfdrgn", "rust-dragon": "CRsDgn",
  // Wake of Gods creatures (zm<creature id>.def)
  "wog-ghost": "zm159g", "wog-fire-messenger": "zm164gd", "wog-earth-messenger": "zm165gd",
  "wog-air-messenger": "zm166gd", "wog-water-messenger": "zm167gd", "wog-gorynych": "zm168dg",
  "wog-war-zealot": "zm169zl", "wog-arctic-sharpshooter": "zm170sw", "wog-lava-sharpshooter": "zm171sr",
  "wog-nightmare": "zm172n", "wog-santa-gremlin": "zm173m", "wog-sylvan-centaur": "zm192z",
  "wog-werewolf": "zm194z", "wog-hell-steed": "zm195z", "wog-dracolich": "zm196z",
  // Horn of the Abyss towns + neutrals (battle .defs from the VCMI HotA mod,
  // github.com/vcmi-mods/horn-of-the-abyss, sprites/hota/**/creatures/battle).
  // Cove
  nymph: "CNIMPH", oceanid: "COCEANID", "crew-mate": "CSEADOG", seaman: "CSWASH", pirate: "CPIRATE",
  "sea-dog": "CPR3UP", stormbird: "CASSID", ayssid: "CASSIDUP", "sea-witch": "CPRIEST", sorceress: "CSORCSS",
  nix: "CNIX", "nix-warrior": "CNIXWARR", "sea-serpent": "cserpent", haspid: "chaspid",
  // Factory (Sandworm / Olgoi-Khorkhoi / Dreadnought / Juggernaut ship as VCMI png
  // frame sets, not .defs — see scripts/build-creature-sprites.mjs <json>)
  "halfling-grenadier": "CHALFB", mechanic: "CMECHAN", engineer: "CENGINE", armadillo: "CARMADL",
  "bellwether-armadillo": "CBLWARM", automaton: "CAUTO", "sentinel-automaton": "CHAUTO", couatl: "COUATL",
  "crimson-couatl": "COUATR", sandworm: "CSANDWX.json", "olgoi-khorkhoi": "COLGOIX.json",
  dreadnought: "CDREAD.json", juggernaut: "CJUGGER.json",
  gunslinger: "CGNSLING", "bounty-hunter": "CBOUNTHT",
  // Bulwark
  kobold: "CKOBOLD", "kobold-foreman": "CFKOBLD", "mountain-ram": "CMTRAM", argali: "CARHAR", "snow-elf": "CSELF",
  "steel-elf": "CSTLF", yeti: "CYETI", "yeti-runemaster": "CMSPIR", shaman: "CSHAMN", "great-shaman": "CGSHMN",
  mammoth: "CMAMMTH", "war-mammoth": "CWMMTH", jotunn: "CJOTUN", "jotunn-warlord": "CWJOTN",
  // HotA neutrals
  fangarm: "CFANGARM", leprechaun: "CLEPRCHN", satyr: "CSATYR", "steel-golem": "cstlgole",
  // WoG town Commanders (the NPC commander sprites)
  "commander-paladin": "zm174npc", "commander-hierophant": "zm175npc", "commander-temple-guardian": "zm176npc",
  "commander-succubus": "zm177npc", "commander-soul-eater": "zm178npc", "commander-brute": "zm179npc",
  "commander-ogre-leader": "zm180npc", "commander-shaman": "zm181npc", "commander-astral-spirit": "zm182npc"
};

/**
 * Creatures that cast spells on the board: their atlas also keeps the H3
 * spell-casting groups (17/18/19), which the hex board plays for their casts.
 */
export const CASTER_SLUGS = new Set([
  "ogre-mage", "enchanter", "faerie-dragon", "master-genie", "pit-lord", "storm-elemental", "ice-elemental",
  "energy-elemental", "magma-elemental", "magic-elemental", "psychic-elemental",
  // HotA creatures whose .def carries the cast rows (17/18/19)
  "shaman", "great-shaman", "jotunn", "jotunn-warlord", "sea-witch", "sorceress", "automaton",
  "sentinel-automaton", "mechanic", "engineer", "couatl", "crimson-couatl", "satyr", "leprechaun"
]);

/**
 * PC two-hex creatures (VCMI config/creatures + the HotA mod's `doubleWide`; the
 * WoG ones by their canvas): their .def draws the body around the middle of its
 * two hexes, which becomes the atlas anchor (build-creature-sprites --double-wide).
 */
export const DOUBLE_WIDE_SLUGS = new Set([
  "griffin", "royal-griffin", "cavalier", "champion", "archangel", "black-knight", "dread-knight", "bone-dragon",
  "ghost-dragon", "medusa", "medusa-queen", "manticore", "scorpicore", "red-dragon", "black-dragon", "centaur",
  "centaur-captain", "pegasus", "silver-pegasus", "unicorn", "war-unicorn", "green-dragon", "gold-dragon", "hell-hound",
  "cerberus", "wolf-rider", "wolf-raider", "roc", "thunderbird", "behemoth", "ancient-behemoth", "basilisk",
  "greater-basilisk", "gorgon", "mighty-gorgon", "wyvern", "wyvern-monarch", "hydra", "chaos-hydra", "naga",
  "naga-queen", "water-elemental", "ice-elemental", "firebird", "phoenix", "boar", "nomad", "azure-dragon",
  "crystal-dragon", "faerie-dragon", "rust-dragon", "stormbird", "ayssid", "sea-serpent", "haspid", "armadillo",
  "bellwether-armadillo", "automaton", "sentinel-automaton", "couatl", "crimson-couatl", "sandworm", "olgoi-khorkhoi",
  "dreadnought", "juggernaut", "mountain-ram", "argali", "yeti", "yeti-runemaster", "mammoth", "war-mammoth", "jotunn",
  "jotunn-warlord",
  "wog-gorynych", "wog-nightmare", "wog-sylvan-centaur", "wog-hell-steed", "wog-dracolich"
]);

function main() {
  const args = process.argv.slice(2);
  // --anchor-only: re-anchor the existing atlases on the PC canvas point, images untouched.
  const anchorOnly = args.includes("--anchor-only");
  const onlyIndex = args.indexOf("--only");
  const only = onlyIndex >= 0 ? new Set((args[onlyIndex + 1] ?? "").split(",")) : null;
  const folders = (onlyIndex < 0 ? args : args.filter((_, index) => index !== onlyIndex && index !== onlyIndex + 1))
    .filter((arg) => arg !== "--anchor-only");
  if (folders.length === 0 || folders.some((folder) => !fs.existsSync(folder))) {
    console.error("usage: node scripts/build-all-creature-sprites.mjs <folder-with-defs> [more folders...] [--only slug,slug]");
    process.exit(1);
  }
  const files = new Map(
    folders.flatMap((folder) => fs.readdirSync(folder).map((name) => [name.toLowerCase(), path.join(folder, name)]))
  );
  const builder = path.join(path.dirname(fileURLToPath(import.meta.url)), "build-creature-sprites.mjs");
  const missing = [];
  for (const [slug, def] of Object.entries(CREATURE_DEFS)) {
    if (only && !only.has(slug)) continue;
    // A name with an extension (VCMI png-frame "*.json") is used as-is.
    const file = files.get(def.includes(".") ? def.toLowerCase() : `${def.toLowerCase()}.def`);
    if (!file) {
      missing.push(`${slug} (${def.includes(".") ? def : `${def}.def`})`);
      continue;
    }
    const run = spawnSync(
      process.execPath,
      [
        builder,
        file,
        slug,
        ...(CASTER_SLUGS.has(slug) ? ["--cast"] : []),
        ...(DOUBLE_WIDE_SLUGS.has(slug) ? ["--double-wide"] : []),
        ...(anchorOnly ? ["--anchor-only"] : [])
      ],
      { stdio: "inherit" }
    );
    if (run.status !== 0) {
      missing.push(`${slug} (${def}.def: build failed)`);
    }
  }
  if (missing.length > 0) {
    console.log(`Skipped ${missing.length}: ${missing.join(", ")}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

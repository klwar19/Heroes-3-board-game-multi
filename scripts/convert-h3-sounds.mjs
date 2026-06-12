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
  if (/^BATTLE\d\d$/.test(base)) return `music/battle-${base.slice(-2)}`;
  const row = ref[base];
  if (!row) return null;
  if (row.category.startsWith("creature:")) {
    const action = ACTIONS[base.slice(-4)];
    return action ? `units/${kebab(row.entity)}-${action}` : null;
  }
  if (row.category === "spell") return `spells/${kebab(row.entity)}`;
  return `effects/${kebab(row.entity)}`;
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
  // Drop byte-identical duplicates, but only within the same creature prefix
  // (e.g. ADVLEXT2 == ADVLEXT1). Different creatures may share audio (e.g.
  // dread knight reuses black knight files) and still need their own entry.
  const hash = createHash("md5").update(fs.readFileSync(path.join(ROOT, f))).digest("hex");
  if (seen[hash]?.startsWith(base.slice(0, 4))) {
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

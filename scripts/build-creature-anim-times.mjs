#!/usr/bin/env node
/**
 * Hex Battlefield animation pace table: each creature atlas's PC animation
 * times (H3 CRANIM.TXT "Walk Animation Time" / "Attack Animation Time"; the
 * HotA and WoG creatures carry the same values as VCMI `animationTime`).
 * VCMI plays a creature's walk frames at speed / walk and moves it
 * 2·speedFactor / walk hexes a second (client/battle/CreatureAnimation.cpp),
 * so a Zombie (1.30) shambles and a Wolf Rider (0.93) trots.
 *
 *   node scripts/build-creature-anim-times.mjs [path/to/H3bitmap.lod]
 *
 * Inputs: CRANIM.TXT out of the PC install's H3bitmap.lod (default
 * G:/games/HoMM 3 Complete/Data/H3bitmap.lod), the VCMI base creature configs
 * (creature index -> .def, for the CRANIM row), the VCMI HotA and WoG mod
 * creature configs (fetched once into tmp/vcmi-anim-config/). Rotoscoped
 * sprites (scripts/pose-sprite-manifest.json) take their donor creature's
 * times, since their frames trace its animation.
 *
 * Shooters also carry their PC shot data (CRANIM "Attack Climax Frame" and
 * the three "Missile Offset" pairs; VCMI graphics.missile): `climax` is the
 * 1-based shoot frame the projectile leaves on (VCMI ShootingAnimation) and
 * `missile` the launch point for an up / straight / down shot, PC pixels from
 * the creature's feet facing right (VCMI RangedAttackAnimation: canvas
 * (222-25+x, 265+y) with the feet at (196, 266)).
 *
 * `idle` is the standing loop's frame time (ms). H3 loops HOLDING at 10 fps,
 * which on a big modern board reads as trembling for the many creatures whose
 * idle is a slight breath (a Snow Elf's 7 frames = a 0.7 s "breath"); measured
 * from each atlas, a slight breath now takes about 2.2 s a cycle, a bigger idle
 * motion 1.5 s, and a lively one (flames, wings, swirling elementals) keeps
 * the PC's 10 fps.
 *
 * `gait` (rotoscoped sprites only) is the footstep clip of the donor whose walk
 * the sprite traces (units/<donor>-move): a voiced unit's "move" line plays
 * once as it sets off and these steps carry the rest of the walk.
 *
 * `fidget: false` marks an atlas whose mouse-over row is only a copy of its
 * standing loop (the pose importer's alias): replaying it as a "fidget" would
 * just run the same breath at 10 fps, a sudden twitch.
 *
 * Output: src/data/battle-hex/creature-anim-times.json
 * { slug: { walk, attack, climax?, missile?, idle?, gait? } }. Atlases with no source
 * (sheet-built war machines, the Forge Tank) get only `idle`; the board falls
 * back to a neutral 1.0 walk / attack.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { CREATURE_DEFS } from "./build-all-creature-sprites.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "tmp", "vcmi-anim-config");
const SOUNDS = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "sounds", "manifest.json"), "utf8"));
/**
 * The PC war machines' atlases (built straight from their H3 .defs, not by the
 * creature batch): their CRANIM rows give the Ballista's and Catapult's shot
 * (climax frame + missile offsets), so each shot leaves the machine on its PC
 * frame and point.
 */
const WAR_MACHINE_DEFS = {
  "war-ballista": "SMBAL",
  "war-catapult": "SMCATA",
  "war-first-aid-tent": "SMTENT",
  "war-ammo-cart": "SMCART",
  // HotA Cannon (the VCMI HotA mod's cannonCreature config: attack 0.5, climax 4).
  "war-cannon": "SMCANNON"
};
/** Donors without a move clip of their own walk like their base creature. */
const GAIT_FALLBACK = { sorceress: "sea-witch", "sea-dog": "pirate", "bounty-hunter": "gunslinger", zombie: "walking-dead" };
const OUT = path.join(ROOT, "src", "data", "battle-hex", "creature-anim-times.json");
const ATLASES = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "data", "battle-hex", "creature-sprite-atlases.json"), "utf8"));
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "pose-sprite-manifest.json"), "utf8"));

const VCMI_BASE = "https://raw.githubusercontent.com/vcmi/vcmi/develop/config/creatures/";
const BASE_FILES = ["castle", "rampart", "tower", "inferno", "necropolis", "dungeon", "stronghold", "fortress", "conflux", "neutral", "special"];
const MOD_TREES = [
  { repo: "vcmi-mods/horn-of-the-abyss", branch: "vcmi-1.7", match: /\/config\/.*creatures?.*\.json$/i },
  { repo: "vcmi-mods/wake-of-gods", branch: "vcmi-1.7", match: /\/config\/creatures\/.*\.json$/i }
];

/** Reads one file out of an H3 .lod archive. */
function lodFile(lodPath, wanted) {
  const fd = fs.openSync(lodPath, "r");
  try {
    const head = Buffer.alloc(12);
    fs.readSync(fd, head, 0, 12, 0);
    const count = head.readUInt32LE(8);
    const table = Buffer.alloc(count * 32);
    fs.readSync(fd, table, 0, count * 32, 92);
    for (let index = 0; index < count; index += 1) {
      const at = index * 32;
      const raw = table.subarray(at, at + 16);
      const end = raw.indexOf(0);
      const name = raw.subarray(0, end < 0 ? 16 : end).toString("latin1");
      if (name.toLowerCase() !== wanted.toLowerCase()) continue;
      const offset = table.readUInt32LE(at + 16);
      const size = table.readUInt32LE(at + 20);
      const packed = table.readUInt32LE(at + 28);
      const data = Buffer.alloc(packed || size);
      fs.readSync(fd, data, 0, data.length, offset);
      return packed ? zlib.inflateSync(data) : data;
    }
  } finally {
    fs.closeSync(fd);
  }
  throw new Error(`${wanted} not found in ${lodPath}`);
}

async function cached(url, name) {
  const file = path.join(CACHE, name.replace(/[\\/:]+/g, "_"));
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = await response.text();
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, text);
  return text;
}

/** VCMI configs are JSON with comments and trailing commas. */
function looseJson(text) {
  const stripped = text
    .replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (match, string) => string ?? "")
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(stripped);
}

const defKey = (def) => path.basename(String(def)).replace(/\.(def|json)$/i, "").toLowerCase();

/** Walk every creature object in a VCMI config (top level or nested mod patches). */
function* creatureEntries(node) {
  if (!node || typeof node !== "object") return;
  for (const value of Object.values(node)) {
    if (value && typeof value === "object" && value.graphics && typeof value.graphics === "object") yield value;
    else if (value && typeof value === "object") yield* creatureEntries(value);
  }
}

/** A shooter's climax frame + missile offsets (both absent when CRANIM has none). */
function shotData(climax, offsets) {
  const data = {};
  if (Number.isFinite(climax) && climax > 0) data.climax = climax;
  if (offsets.length === 6 && offsets.every(Number.isFinite) && offsets.some((value) => value !== 0)) {
    data.missile = { up: [offsets[0], offsets[1]], straight: [offsets[2], offsets[3]], down: [offsets[4], offsets[5]] };
  }
  return data;
}

/** Opaque body height (px) of an atlas's first standing frame (the H3 shadow is translucent). */
async function standingHeight(atlas) {
  const info = atlas.groups?.["2"] ?? atlas.groups?.["0"];
  const image = path.join(ROOT, "public", atlas.image);
  if (!info || !fs.existsSync(image)) return 1;
  const sharp = createRequire(import.meta.url)("sharp");
  const cell = info.start;
  const left = cell === undefined ? 0 : (cell % atlas.columns) * atlas.frameWidth;
  const top = cell === undefined ? info.row * atlas.frameHeight : Math.floor(cell / atlas.columns) * atlas.frameHeight;
  const { data } = await sharp(image).extract({ left, top, width: atlas.frameWidth, height: atlas.frameHeight })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let first = -1;
  let last = -1;
  for (let y = 0; y < atlas.frameHeight; y += 1) {
    for (let x = 0; x < atlas.frameWidth; x += 1) {
      if (data[(y * atlas.frameWidth + x) * 4 + 3] > 200) {
        if (first < 0) first = y;
        last = y;
        break;
      }
    }
  }
  return first < 0 ? 1 : last - first + 1;
}

/** Whether an atlas's mouse-over row (1) is a pixel copy of its standing row (2). */
async function fidgetCopiesIdle(atlas) {
  const over = atlas.groups?.["1"];
  const standing = atlas.groups?.["2"];
  if (!over || !standing || over.frames !== standing.frames) return false;
  const image = path.join(ROOT, "public", atlas.image);
  if (!fs.existsSync(image)) return false;
  const sharp = createRequire(import.meta.url)("sharp");
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cell = (group, index) => {
    const at = group.start === undefined ? null : group.start + index;
    return {
      left: at === null ? index * atlas.frameWidth : (at % atlas.columns) * atlas.frameWidth,
      top: at === null ? group.row * atlas.frameHeight : Math.floor(at / atlas.columns) * atlas.frameHeight
    };
  };
  for (let index = 0; index < over.frames; index += 1) {
    const a = cell(over, index);
    const b = cell(standing, index);
    for (let y = 0; y < atlas.frameHeight; y += 1) {
      const rowA = ((a.top + y) * info.width + a.left) * 4;
      const rowB = ((b.top + y) * info.width + b.left) * 4;
      if (Buffer.compare(data.subarray(rowA, rowA + atlas.frameWidth * 4), data.subarray(rowB, rowB + atlas.frameWidth * 4)) !== 0) return false;
    }
  }
  return true;
}

/** H3 HOLDING rate (VCMI idleAnimationTime 10 = 10 fps). */
const PC_IDLE_FRAME_MS = 100;

/**
 * The standing loop's calm frame time for one atlas: how much of the body
 * changes from frame to frame (share of opaque pixels whose coverage or colour
 * changes) sorts the idle into a slight breath (< 8%: ~2.2 s a cycle), a
 * bigger motion (< 15%: ~1.5 s) or a lively one (the PC's 10 fps).
 */
async function idleFrameMs(slug, atlas) {
  const info = atlas.groups?.["2"];
  if (!info || info.frames < 2) return undefined;
  const sharp = createRequire(import.meta.url)("sharp");
  const image = path.join(ROOT, "public", atlas.image);
  if (!fs.existsSync(image)) return undefined;
  const { data, info: size } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const frame = (index) => {
    const cell = info.start === undefined ? null : info.start + index;
    const left = cell === null ? index * atlas.frameWidth : (cell % atlas.columns) * atlas.frameWidth;
    const top = cell === null ? info.row * atlas.frameHeight : Math.floor(cell / atlas.columns) * atlas.frameHeight;
    return { left, top };
  };
  const frames = info.frames;
  let changedShare = 0;
  let pairs = 0;
  for (let index = 1; index < frames; index += 1) {
    const a = frame(index - 1);
    const b = frame(index);
    const outside = (at) => at.left + atlas.frameWidth > size.width || at.top + atlas.frameHeight > size.height;
    if (outside(a) || outside(b)) break;
    let changed = 0;
    let opaque = 0;
    for (let y = 0; y < atlas.frameHeight; y += 1) {
      for (let x = 0; x < atlas.frameWidth; x += 1) {
        const pa = ((a.top + y) * size.width + a.left + x) * 4;
        const pb = ((b.top + y) * size.width + b.left + x) * 4;
        const inA = data[pa + 3] > 200;
        const inB = data[pb + 3] > 200;
        if (!inA && !inB) continue;
        opaque += 1;
        if (inA !== inB || Math.abs(data[pa] - data[pb]) + Math.abs(data[pa + 1] - data[pb + 1]) + Math.abs(data[pa + 2] - data[pb + 2]) > 60) {
          changed += 1;
        }
      }
    }
    changedShare += changed / Math.max(1, opaque);
    pairs += 1;
  }
  if (pairs === 0) return undefined;
  const motion = changedShare / pairs;
  const loops = atlas.idlePingPong && frames > 2 ? frames * 2 - 2 : frames;
  const clamp = (value, low, high) => Math.round(Math.min(high, Math.max(low, value)));
  if (motion < 0.08) return clamp(2200 / loops, 150, 300);
  if (motion < 0.15) return clamp(1500 / loops, 120, 220);
  return PC_IDLE_FRAME_MS;
}

async function main() {
  const lod = process.argv[2] ?? "G:/games/HoMM 3 Complete/Data/H3bitmap.lod";
  const cranim = lodFile(lod, "CRANIM.TXT").toString("latin1").split(/\r?\n/).slice(2)
    .map((line) => line.split("\t"))
    .filter((cells) => cells.length > 20 && cells[1] !== "");

  const timesByDef = new Map();
  for (const file of BASE_FILES) {
    const config = looseJson(await cached(VCMI_BASE + file + ".json", `base-${file}.json`));
    for (const creature of creatureEntries(config)) {
      const row = cranim[creature.index];
      if (!row || !creature.graphics.animation) continue;
      timesByDef.set(defKey(creature.graphics.animation), {
        walk: Number(row[1]),
        attack: Number(row[2]),
        ...shotData(Number(row[23]), [row[4], row[5], row[6], row[7], row[8], row[9]].map(Number))
      });
    }
  }
  for (const tree of MOD_TREES) {
    const listing = JSON.parse(await cached(`https://api.github.com/repos/${tree.repo}/git/trees/${tree.branch}?recursive=1`, `${tree.repo}-tree.json`));
    for (const entry of listing.tree ?? []) {
      if (entry.type !== "blob" || !tree.match.test(entry.path)) continue;
      let config;
      try {
        config = looseJson(await cached(`https://raw.githubusercontent.com/${tree.repo}/${tree.branch}/${entry.path}`, `${tree.repo}-${entry.path}`));
      } catch {
        continue;
      }
      for (const creature of creatureEntries(config)) {
        const times = creature.graphics.animationTime;
        if (!creature.graphics.animation || !times || !(Number(times.walk) > 0)) continue;
        const missile = creature.graphics.missile;
        const offset = missile?.offset;
        timesByDef.set(defKey(creature.graphics.animation), {
          walk: Number(times.walk),
          attack: Number(times.attack) || 1,
          ...shotData(
            Number(missile?.attackClimaxFrame),
            offset ? [offset.upperX, offset.upperY, offset.middleX, offset.middleY, offset.lowerX, offset.lowerY].map(Number) : []
          )
        });
      }
    }
  }

  const out = {};
  for (const slug of Object.keys(ATLASES).sort()) {
    const def = CREATURE_DEFS[slug] ?? WAR_MACHINE_DEFS[slug];
    const times = def ? timesByDef.get(defKey(def)) : undefined;
    if (times) out[slug] = times;
  }
  // Rotoscoped sprites trace their donor's frames: same timing, and the
  // donor's launch points scaled to the repainted body's height.
  for (const [slug, entry] of Object.entries(MANIFEST.sprites)) {
    if (!ATLASES[slug] || !out[entry.donor]) continue;
    const times = { ...out[entry.donor] };
    if (times.missile) {
      const ratio = (await standingHeight(ATLASES[slug])) / Math.max(1, await standingHeight(ATLASES[entry.donor]));
      const scaled = ([x, y]) => [Math.round(x * ratio), Math.round(y * ratio)];
      times.missile = { up: scaled(times.missile.up), straight: scaled(times.missile.straight), down: scaled(times.missile.down) };
    }
    // A long shoot row reaches the repaint as an evenly picked subset of the
    // donor's frames (scripts/build-pose-guide.mjs keeps a one-shot group's
    // first and last frame): the shot leaves on the repainted frame tracing the
    // donor's climax frame, not on the donor's frame number (past the throw).
    const ownShoot = ATLASES[slug].groups?.["15"]?.frames ?? 0;
    const donorShoot = ATLASES[entry.donor].groups?.["15"]?.frames ?? 0;
    if (times.climax && ownShoot > 1 && donorShoot > ownShoot) {
      const picked = Array.from({ length: ownShoot }, (_, k) => Math.round((k * (donorShoot - 1)) / (ownShoot - 1)));
      const index = picked.findIndex((frame) => frame >= times.climax - 1);
      times.climax = (index < 0 ? ownShoot - 1 : index) + 1;
    }
    const gaitDonor = SOUNDS[`units/${entry.donor}-move`] ? entry.donor : GAIT_FALLBACK[entry.donor];
    if (gaitDonor && SOUNDS[`units/${gaitDonor}-move`]) times.gait = `units/${gaitDonor}-move`;
    out[slug] = times;
  }
  const missing = Object.keys(ATLASES).filter((slug) => !out[slug]);
  for (const slug of Object.keys(ATLASES)) {
    const idle = await idleFrameMs(slug, ATLASES[slug]);
    if (idle) out[slug] = { ...(out[slug] ?? {}), idle };
    if (await fidgetCopiesIdle(ATLASES[slug])) out[slug] = { ...(out[slug] ?? {}), fidget: false };
  }
  fs.writeFileSync(OUT, JSON.stringify(Object.fromEntries(Object.entries(out).sort()), null, 2) + "\n");
  console.log(`wrote ${path.relative(ROOT, OUT)}: ${Object.keys(out).length} creatures; no source (neutral 1.0): ${missing.join(" ") || "none"}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

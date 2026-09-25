#!/usr/bin/env node
/**
 * Hex Battlefield HERO figures: converts Heroes 3 hero battle sprites (CHxx.def,
 * type 0x49, 150x175: group 0 standing, 1 idle shuffle, 2 defeat, 3 victory,
 * 4 cast spell) and the battle flags (CMFLAGL/CMFLAGR.def, type 0x40) into
 * WebP atlases in the same format as the creature atlases.
 *
 *   node scripts/build-hero-sprites.mjs <HERO.def> <slug>
 *   node scripts/build-hero-sprites.mjs --flag <CMFLAGx.def> <slug>
 *   node scripts/build-hero-sprites.mjs --all <dir with CH00..CH17> <dir with CMFLAGL/R> [<HotA mods dir>]
 *
 * Output:
 *   public/assets/battle-hex/heroes/<slug>.webp     (media-managed: `npm run media:publish`)
 *   src/data/battle-hex/hero-sprite-atlases.json    (tracked metadata; Codex
 *     sheets imported with scripts/import-sprite-sheet.mjs --meta land here too)
 *
 * Heroes: every frame is cropped to the union box of all frames; the anchor is
 * the foot point of the standing frame (bottom of the body, centred on its
 * lowest band) like the creature atlases. Palette slots 0-7 are special only
 * while they still hold H3's key colours (VCMI's rule): HotA DEFs reuse 5-7 as
 * real colours. Key 0 is transparent, 5 the selection outline (dropped), the
 * rest shadow. The hero sprite itself is NOT player coloured (H3/VCMI only
 * recolour the flag). H3 heroes face RIGHT (the attacker's side).
 *
 * Flags: the whole 17x15 frame is kept (VCMI centres it); the player-colour
 * slots 224-255 become a white-to-grey luminance ramp with alpha, every other
 * body pixel its own colour, so the board tints the flag with the seat's
 * player colour (multiply) at runtime. Flag entries carry `"tint": true`.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { decodeDef } from "./build-creature-sprites.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public", "assets", "battle-hex", "heroes");
const META_FILE = path.join(ROOT, "src", "data", "battle-hex", "hero-sprite-atlases.json");

/** H3 key colours of palette slots 0-7 (a slot is special only while it holds its key). */
const KEY_COLOURS = [
  [0, 255, 255],
  [255, 150, 255],
  [255, 100, 255],
  [255, 50, 255],
  [255, 0, 255],
  [255, 255, 0],
  [180, 0, 255],
  [0, 255, 0]
];
const SHADOW_ALPHA = { 1: 64, 2: 96, 3: 96, 4: 128, 6: 64, 7: 128 };
/** Player-colour palette slots (H3 PLAYERS.PAL replaces these 32 per player). */
const PLAYER_SLOT_FIRST = 224;

/**
 * Battle sprite per hero class (VCMI config/heroClasses.json + the HotA mod's
 * heroClasses/*.json). H3 towns share one pair per town (both classes); HotA
 * towns have one pair per class. Note HotA Captain's "b" file is the MALE.
 */
const BATCH = [
  ["CH00.def", "hero-castle-male"],
  ["CH01.def", "hero-castle-female"],
  ["CH02.def", "hero-rampart-male"],
  ["CH03.def", "hero-rampart-female"],
  ["CH05.def", "hero-tower-male"],
  ["CH04.def", "hero-tower-female"],
  ["CH06.def", "hero-inferno-male"],
  ["CH07.def", "hero-inferno-female"],
  ["CH08.def", "hero-necropolis-male"],
  ["CH09.def", "hero-necropolis-female"],
  ["CH010.def", "hero-dungeon-male"],
  ["CH11.def", "hero-dungeon-female"],
  ["CH013.def", "hero-stronghold-male"],
  ["CH012.def", "hero-stronghold-female"],
  ["CH014.def", "hero-fortress-male"],
  ["CH015.def", "hero-fortress-female"],
  ["CH16.DEF", "hero-conflux-might"],
  ["CH17.DEF", "hero-conflux-magic"]
];
const HOTA_BATCH = [
  ["cove/Content/sprites/hota/cove/heroClasses/captain/battle/CH18b.DEF", "hero-cove-might-male"],
  ["cove/Content/sprites/hota/cove/heroClasses/captain/battle/CH18.DEF", "hero-cove-might-female"],
  ["cove/Content/sprites/hota/cove/heroClasses/navigator/battle/CH19.DEF", "hero-cove-magic-male"],
  ["cove/Content/sprites/hota/cove/heroClasses/navigator/battle/CH19b.DEF", "hero-cove-magic-female"],
  ["factory/content/sprites/hota/factory/heroClasses/mercenary/battle/CH20.DEF", "hero-factory-might-male"],
  ["factory/content/sprites/hota/factory/heroClasses/mercenary/battle/CH20b.def", "hero-factory-might-female"],
  ["factory/content/sprites/hota/factory/heroClasses/artificer/battle/CH21.def", "hero-factory-magic-male"],
  ["factory/content/sprites/hota/factory/heroClasses/artificer/battle/CH21b.def", "hero-factory-magic-female"],
  ["bulwark/content/sprites/hota/bulwark/heroClasses/chieftain/battle/CH22_08.def", "hero-bulwark-might-male"],
  ["bulwark/content/sprites/hota/bulwark/heroClasses/chieftain/battle/CH22b_08.def", "hero-bulwark-might-female"],
  ["bulwark/content/sprites/hota/bulwark/heroClasses/elder/battle/CH23_08.def", "hero-bulwark-magic-male"],
  ["bulwark/content/sprites/hota/bulwark/heroClasses/elder/battle/CH23b_08.def", "hero-bulwark-magic-female"]
];

function specialSlots(palette) {
  return KEY_COLOURS.map((key, index) => palette[index].every((channel, c) => channel === key[c]));
}

function writeAtlas(slug, rgba, width, height, entry) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `${slug}.webp`);
  return sharp(rgba, { raw: { width, height, channels: 4 } })
    .webp({ quality: 82, alphaQuality: 85, effort: 6, smartSubsample: true })
    .toFile(outFile)
    .then(() => {
      const meta = fs.existsSync(META_FILE) ? JSON.parse(fs.readFileSync(META_FILE, "utf8")) : {};
      meta[slug] = { image: `/assets/battle-hex/heroes/${slug}.webp`, ...entry };
      const sorted = Object.fromEntries(Object.keys(meta).sort().map((key) => [key, meta[key]]));
      fs.mkdirSync(path.dirname(META_FILE), { recursive: true });
      fs.writeFileSync(META_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
      console.log(`${slug}: ${entry.columns} cols, ${entry.frameWidth}x${entry.frameHeight}, anchor (${entry.anchorX}, ${entry.anchorY}) -> ${path.relative(ROOT, outFile)}`);
    });
}

function buildHero(defPath, slug) {
  const def = decodeDef(defPath, { types: [0x49] });
  const special = specialSlots(def.palette);
  const isSpecial = (v) => v < 8 && special[v];
  const isBody = (v) => v !== 0 && !isSpecial(v);
  const visible = (v) => !(v === 0 || (isSpecial(v) && v === 5));
  const groups = def.groups.filter((group) => group.id <= 4 && group.frames.length > 0);
  const frames = groups.flatMap((group) => group.frames);
  const { width: fullWidth, height: fullHeight } = frames[0];

  let minX = fullWidth, minY = fullHeight, maxX = -1, maxY = -1;
  for (const frame of frames) {
    for (let y = 0; y < fullHeight; y += 1) {
      for (let x = 0; x < fullWidth; x += 1) {
        if (!visible(frame.pixels[y * fullWidth + x])) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const cellWidth = maxX - minX + 1;
  const cellHeight = maxY - minY + 1;

  const standing = (groups.find((group) => group.id === 0) ?? groups[0]).frames[0];
  let bodyBottom = -1;
  for (let y = fullHeight - 1; y >= 0 && bodyBottom < 0; y -= 1) {
    for (let x = 0; x < fullWidth; x += 1) {
      if (isBody(standing.pixels[y * fullWidth + x])) {
        bodyBottom = y;
        break;
      }
    }
  }
  let footMin = fullWidth, footMax = -1;
  for (let y = Math.max(0, bodyBottom - 12); y <= bodyBottom; y += 1) {
    for (let x = 0; x < fullWidth; x += 1) {
      if (isBody(standing.pixels[y * fullWidth + x])) {
        footMin = Math.min(footMin, x);
        footMax = Math.max(footMax, x);
      }
    }
  }

  const columns = Math.max(...groups.map((group) => group.frames.length));
  const atlasWidth = columns * cellWidth;
  const atlas = Buffer.alloc(atlasWidth * groups.length * cellHeight * 4);
  groups.forEach((group, row) => {
    group.frames.forEach((frame, column) => {
      for (let y = 0; y < cellHeight; y += 1) {
        for (let x = 0; x < cellWidth; x += 1) {
          const v = frame.pixels[(y + minY) * fullWidth + x + minX];
          if (!visible(v)) continue;
          const o = ((row * cellHeight + y) * atlasWidth + column * cellWidth + x) * 4;
          if (isBody(v)) {
            const [r, g, b] = def.palette[v];
            atlas[o] = r;
            atlas[o + 1] = g;
            atlas[o + 2] = b;
            atlas[o + 3] = 255;
          } else {
            atlas[o + 3] = SHADOW_ALPHA[v] ?? 0;
          }
        }
      }
    });
  });
  return writeAtlas(slug, atlas, atlasWidth, groups.length * cellHeight, {
    frameWidth: cellWidth,
    frameHeight: cellHeight,
    columns,
    anchorX: Math.round((footMin + footMax) / 2) - minX,
    anchorY: bodyBottom - minY,
    // VCMI draws the full frame centred on the 64x136 hero box: this is that
    // centre in cell pixels (the flag hangs at origin + (+/-4, -41)).
    originX: Math.floor(fullWidth / 2) - minX,
    originY: Math.floor(fullHeight / 2) - minY,
    groups: Object.fromEntries(groups.map((group, row) => [String(group.id), { row, frames: group.frames.length }]))
  });
}

function buildFlag(defPath, slug) {
  const def = decodeDef(defPath, { types: [0x40] });
  const special = specialSlots(def.palette);
  const ramp = def.palette.slice(PLAYER_SLOT_FIRST);
  const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
  const brightest = Math.max(...ramp.map(luma));
  const frames = def.groups[0].frames;
  const { width, height } = frames[0];
  const atlasWidth = frames.length * width;
  const atlas = Buffer.alloc(atlasWidth * height * 4);
  frames.forEach((frame, column) => {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const v = frame.pixels[y * width + x];
        if (v === 0 || (v < 8 && special[v])) continue;
        const o = (y * atlasWidth + column * width + x) * 4;
        if (v >= PLAYER_SLOT_FIRST) {
          const grey = Math.round((luma(def.palette[v]) / brightest) * 255);
          atlas[o] = grey;
          atlas[o + 1] = grey;
          atlas[o + 2] = grey;
        } else {
          [atlas[o], atlas[o + 1], atlas[o + 2]] = def.palette[v];
        }
        atlas[o + 3] = 255;
      }
    }
  });
  return writeAtlas(slug, atlas, atlasWidth, height, {
    frameWidth: width,
    frameHeight: height,
    columns: frames.length,
    anchorX: Math.floor(width / 2),
    anchorY: Math.floor(height / 2),
    tint: true,
    groups: { 0: { row: 0, frames: frames.length } }
  });
}

function findCaseInsensitive(dir, name) {
  const match = fs.readdirSync(dir).find((file) => file.toLowerCase() === name.toLowerCase());
  return match ? path.join(dir, match) : null;
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--all") {
    const [, heroDir, flagDir, hotaDir] = args;
    for (const [file, slug] of BATCH) {
      const found = findCaseInsensitive(heroDir, file);
      if (found) await buildHero(found, slug);
      else console.warn(`missing ${file}`);
    }
    for (const [file, slug] of [["CMFLAGL.def", "flag-left"], ["CMFLAGR.def", "flag-right"]]) {
      const found = findCaseInsensitive(flagDir, file);
      if (found) await buildFlag(found, slug);
      else console.warn(`missing ${file}`);
    }
    if (hotaDir) {
      for (const [file, slug] of HOTA_BATCH) {
        const full = path.join(hotaDir, file);
        if (fs.existsSync(full)) await buildHero(full, slug);
        else console.warn(`missing ${full}`);
      }
    }
    return;
  }
  const flag = args[0] === "--flag";
  const [defPath, slug] = flag ? args.slice(1) : args;
  if (!defPath || !slug || !/^[a-z0-9-]+$/.test(slug)) {
    console.error("usage: node scripts/build-hero-sprites.mjs [--flag] <file.def> <slug: a-z0-9->  |  --all <heroDir> <flagDir> [<hotaModsDir>]");
    process.exit(1);
  }
  await (flag ? buildFlag(defPath, slug) : buildHero(defPath, slug));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

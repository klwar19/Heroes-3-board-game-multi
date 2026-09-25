#!/usr/bin/env node
/**
 * Hex Battlefield creature sprites: converts a Heroes 3 creature .def (type
 * 0x42, e.g. CADEVL.def from H3sprite.lod) into one WebP atlas plus frame
 * metadata the hex board animates from.
 *
 *   node scripts/build-creature-sprites.mjs <path/to/CREATURE.def> <slug> [--cast]
 *   node scripts/build-creature-sprites.mjs <path/to/CREATURE.json> <slug> [--cast]
 *
 * A .json input is a VCMI png-frame animation (`{ basepath, images: [{ group,
 * frame, file }] }`, frames beside it in the basepath's last folder), as some
 * HotA creatures ship: paletted full-canvas PNGs whose H3 special colours
 * (cyan transparent, magenta shadows, yellow selection) are mapped back to the
 * special palette slots, so they convert exactly like a .def.
 *
 * --cast also keeps the spell-casting groups 17/18/19 (cast up/straight/down)
 * for creatures that cast on the board (Ogre Magi, Enchanters, Faerie Dragons...).
 *
 * Output:
 *   public/assets/battle-hex/creatures/<slug>.webp          (media-managed: run
 *                                                            `npm run media:publish`)
 *   src/data/battle-hex/creature-sprite-atlases.json        (tracked metadata)
 * Then map the unit ids to <slug> in src/data/battle-hex/creature-sprites.ts.
 *
 * Every frame is cropped to the union bounding box of ALL frames, so the
 * creature's foot anchor is one constant point for the whole atlas (no
 * per-frame jitter). One atlas row per animation group; groups keep their H3
 * ids (0 move, 1 mouse-over, 2 standing, 3 getting hit, 4 defend, 5 death,
 * 7/8 turn, 11/12/13 attack up/straight/down, 14/15/16 shoot, 20/21 start/stop
 * moving); unused groups are not stored. Palette slots 0 (transparent) and 5 (selection outline) are dropped;
 * shadow slots become translucent black. H3 creatures face RIGHT.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public", "assets", "battle-hex", "creatures");
const META_FILE = path.join(ROOT, "src", "data", "battle-hex", "creature-sprite-atlases.json");

/**
 * Decodes a Heroes 3 .def into its palette and palette-indexed frames. Only
 * creature DEFs (0x42) are accepted unless `types` widens it (hero battle
 * sprites are 0x49, the battle flags CMFLAGL/R 0x40 — see build-hero-sprites.mjs).
 */
export function decodeDef(file, { types = [0x42] } = {}) {
  const b = fs.readFileSync(file);
  const type = b.readUInt32LE(0);
  if (!types.includes(type)) {
    throw new Error(`${file}: DEF type 0x${type.toString(16)} is not one of ${types.map((t) => `0x${t.toString(16)}`).join("/")}`);
  }
  const blocks = b.readUInt32LE(12);
  const palette = [];
  for (let i = 0; i < 256; i += 1) palette.push([b[16 + i * 3], b[17 + i * 3], b[18 + i * 3]]);
  let p = 16 + 768;
  const groups = [];
  for (let k = 0; k < blocks; k += 1) {
    const id = b.readUInt32LE(p);
    const count = b.readUInt32LE(p + 4);
    p += 16 + count * 13;
    const offsets = [];
    for (let i = 0; i < count; i += 1) {
      offsets.push(b.readUInt32LE(p));
      p += 4;
    }
    groups.push({ id, offsets });
  }

  const decodeFrame = (o) => {
    const format = b.readUInt32LE(o + 4);
    const fullWidth = b.readUInt32LE(o + 8);
    const fullHeight = b.readUInt32LE(o + 12);
    const w = b.readUInt32LE(o + 16);
    const h = b.readUInt32LE(o + 20);
    const left = b.readUInt32LE(o + 24);
    const top = b.readUInt32LE(o + 28);
    const d = o + 32;
    const pixels = new Uint8Array(fullWidth * fullHeight);
    const put = (x, y, v) => {
      pixels[(y + top) * fullWidth + x + left] = v;
    };
    if (format === 0) {
      for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) put(x, y, b[d + y * w + x]);
    } else if (format === 1) {
      for (let y = 0; y < h; y += 1) {
        let q = d + b.readUInt32LE(d + y * 4);
        for (let x = 0; x < w; ) {
          const code = b[q];
          const length = b[q + 1] + 1;
          q += 2;
          for (let i = 0; i < length; i += 1) put(x + i, y, code === 0xff ? b[q + i] : code);
          if (code === 0xff) q += length;
          x += length;
        }
      }
    } else if (format === 2 || format === 3) {
      for (let y = 0; y < h; y += 1) {
        const rowOffset = format === 2
          ? b.readUInt16LE(d + y * 2)
          : b.readUInt16LE(d + ((y * w) / 32) * 2);
        let q = d + rowOffset;
        for (let x = 0; x < w; ) {
          const segment = b[q++];
          const code = segment >> 5;
          const length = (segment & 31) + 1;
          for (let i = 0; i < length; i += 1) put(x + i, y, code === 7 ? b[q + i] : code);
          if (code === 7) q += length;
          x += length;
        }
      }
    } else {
      throw new Error(`${file}: unsupported frame format ${format}`);
    }
    return { width: fullWidth, height: fullHeight, pixels };
  };

  return {
    palette,
    groups: groups.map((group) => ({ id: group.id, frames: group.offsets.map(decodeFrame) }))
  };
}

/** The H3 special palette slots 0-7 by colour (VCMI png frames store them as RGB). */
const SPECIAL_COLOURS = new Map([
  ["0,255,255", 0],
  ["255,150,255", 1],
  ["255,100,255", 2],
  ["255,50,255", 3],
  ["255,0,255", 4],
  ["255,255,0", 5],
  ["180,0,255", 6],
  ["0,255,0", 7]
]);

async function decodeVcmiJson(file) {
  const text = fs.readFileSync(file, "utf8").replace(/\/\/.*$/gm, "");
  const meta = JSON.parse(text);
  const folder = path.join(path.dirname(file), String(meta.basepath ?? "").replace(/\/+$/, "").split("/").pop() ?? "");
  const palette = [];
  for (let i = 0; i < 8; i += 1) palette.push([0, 0, 0]);
  const colourIndex = new Map();
  const byGroup = new Map();
  for (const image of meta.images ?? []) {
    const { data, info } = await sharp(fs.readFileSync(path.join(folder, image.file)))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixels = new Uint16Array(info.width * info.height);
    for (let i = 0; i < pixels.length; i += 1) {
      const key = `${data[i * 3]},${data[i * 3 + 1]},${data[i * 3 + 2]}`;
      let index = SPECIAL_COLOURS.get(key);
      if (index === undefined) {
        index = colourIndex.get(key);
        if (index === undefined) {
          index = palette.length;
          palette.push([data[i * 3], data[i * 3 + 1], data[i * 3 + 2]]);
          colourIndex.set(key, index);
        }
      }
      pixels[i] = index;
    }
    if (!byGroup.has(image.group)) byGroup.set(image.group, []);
    byGroup.get(image.group)[image.frame] = { width: info.width, height: info.height, pixels };
  }
  return {
    palette,
    groups: [...byGroup.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([id, frames]) => ({ id, frames: frames.filter(Boolean) }))
  };
}

// 0 transparent, 5 selection outline: dropped. 1/6 faint shadow, 4/7 shadow, 2/3 shadow edge.
const SHADOW_ALPHA = { 1: 64, 2: 96, 3: 96, 4: 128, 6: 64, 7: 128 };

/** H3 groups the hex board animates: move, stand, hit, defend, death, turn L/R, attack x3, shoot x3, start/stop move. */
const USED_GROUPS = new Set([0, 2, 3, 4, 5, 7, 8, 11, 12, 13, 14, 15, 16, 20, 21]);
/** Spell-casting groups (cast up / straight / down), kept only with --cast. */
const CAST_GROUPS = [17, 18, 19];

function isBody(v) {
  return v > 7;
}

async function main() {
  const args = process.argv.slice(2);
  const defPath = args[0];
  const slug = args[1];
  if (!defPath || !slug || !/^[a-z0-9-]+$/.test(slug)) {
    console.error("usage: node scripts/build-creature-sprites.mjs <CREATURE.def> <slug: a-z0-9->");
    process.exit(1);
  }
  const decoded = defPath.toLowerCase().endsWith(".json") ? await decodeVcmiJson(defPath) : decodeDef(defPath);
  // Only the groups the hex board plays are kept (mouse-over, the alternate
  // turn pair and — unless --cast — spell-casting rows are dropped to keep the
  // atlas small).
  const used = new Set(USED_GROUPS);
  if (args.includes("--cast")) for (const id of CAST_GROUPS) used.add(id);
  const def = { ...decoded, groups: decoded.groups.filter((group) => used.has(group.id)) };
  const frames = def.groups.flatMap((group) => group.frames);
  const { width: fullWidth, height: fullHeight } = frames[0];

  // Union bounding box over every visible (body or shadow) pixel of every frame.
  let minX = fullWidth, minY = fullHeight, maxX = -1, maxY = -1;
  for (const frame of frames) {
    for (let y = 0; y < fullHeight; y += 1) {
      for (let x = 0; x < fullWidth; x += 1) {
        const v = frame.pixels[y * fullWidth + x];
        if (v !== 0 && v !== 5) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
  }
  const cellWidth = maxX - minX + 1;
  const cellHeight = maxY - minY + 1;

  // Foot anchor: bottom of the BODY in the first standing frame (group 2),
  // horizontally centred on the body's lowest band (its feet), so the unit
  // stands on its hex centre whatever its wings/weapon span.
  const standing = (def.groups.find((group) => group.id === 2) ?? def.groups[0]).frames[0];
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
  const anchorX = Math.round((footMin + footMax) / 2) - minX;
  const anchorY = bodyBottom - minY;

  const columns = Math.max(...def.groups.map((group) => group.frames.length));
  const rows = def.groups.length;
  const atlas = Buffer.alloc(columns * cellWidth * rows * cellHeight * 4);
  const atlasWidth = columns * cellWidth;
  def.groups.forEach((group, row) => {
    group.frames.forEach((frame, column) => {
      for (let y = 0; y < cellHeight; y += 1) {
        for (let x = 0; x < cellWidth; x += 1) {
          const v = frame.pixels[(y + minY) * fullWidth + x + minX];
          if (v === 0 || v === 5) continue;
          const o = ((row * cellHeight + y) * atlasWidth + column * cellWidth + x) * 4;
          if (isBody(v)) {
            const [r, g, bl] = def.palette[v];
            atlas[o] = r;
            atlas[o + 1] = g;
            atlas[o + 2] = bl;
            atlas[o + 3] = 255;
          } else {
            atlas[o + 3] = SHADOW_ALPHA[v] ?? 0;
          }
        }
      }
    });
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `${slug}.webp`);
  return sharp(atlas, { raw: { width: atlasWidth, height: rows * cellHeight, channels: 4 } })
    .webp({ quality: 78, alphaQuality: 80, effort: 6, smartSubsample: true })
    .toFile(outFile)
    .then(() => {
      const meta = fs.existsSync(META_FILE) ? JSON.parse(fs.readFileSync(META_FILE, "utf8")) : {};
      meta[slug] = {
        image: `/assets/battle-hex/creatures/${slug}.webp`,
        frameWidth: cellWidth,
        frameHeight: cellHeight,
        columns,
        anchorX,
        anchorY,
        groups: Object.fromEntries(def.groups.map((group, row) => [String(group.id), { row, frames: group.frames.length }]))
      };
      const sorted = Object.fromEntries(Object.keys(meta).sort().map((key) => [key, meta[key]]));
      fs.mkdirSync(path.dirname(META_FILE), { recursive: true });
      fs.writeFileSync(META_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
      console.log(`${slug}: ${columns}x${rows} frames of ${cellWidth}x${cellHeight}, anchor (${anchorX}, ${anchorY}) -> ${path.relative(ROOT, outFile)}`);
    });
}

// Run only as a CLI (build-hero-sprites.mjs imports decodeDef from here).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

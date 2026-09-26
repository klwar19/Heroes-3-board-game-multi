#!/usr/bin/env node
/**
 * Hex Battlefield: dense-pack the creature atlases too big for phones.
 *
 * build-creature-sprites.mjs lays an atlas out one row per H3 animation group,
 * as wide as its longest group, so a creature with one long clip (the Couatl's
 * 23-frame casts) leaves most cells empty: 20 MP (~80 MB decoded) and 5 800 px
 * wide — past the 4 096 px texture limit of many mobile GPUs and the ~16 MP
 * iOS image budget, which makes the board stall or garble that creature.
 *
 * This streams every group's frames into consecutive cells of a sheet at most
 * 4 096 px wide (no empty cells) and records each group's first cell as
 * `start` in src/data/battle-hex/creature-sprite-atlases.json; the board reads
 * frame k of a group at cell `start + k` (creature-sprites.ts spriteFrameOffset,
 * which treats an atlas without `start` exactly as before). Groups that share a
 * row (a sheet's attack-up/straight/down) keep sharing their frames.
 *
 *   node scripts/pack-creature-atlases.mjs [--max-mp 12] [--max-side 4096] [slug ...]
 *
 * Re-run after rebuilding a packed creature with build-creature-sprites.mjs
 * (it writes the one-row-per-group layout again). Then `npm run media:publish`.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
sharp.cache(false);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const META_FILE = path.join(ROOT, "src", "data", "battle-hex", "creature-sprite-atlases.json");

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? Number(args[index + 1]) : fallback;
};
const MAX_MP = option("max-mp", 12);
const MAX_SIDE = option("max-side", 4096);
const only = args.filter((arg, index) => !arg.startsWith("--") && !args[index - 1]?.startsWith("--"));

const meta = JSON.parse(fs.readFileSync(META_FILE, "utf8"));

function sheetSize(atlas) {
  const rows = Math.max(...Object.values(atlas.groups).map((group) => group.row)) + 1;
  return { width: atlas.frameWidth * atlas.columns, height: atlas.frameHeight * rows };
}

let changed = 0;
for (const [slug, atlas] of Object.entries(meta)) {
  if (only.length > 0 && !only.includes(slug)) continue;
  if (Object.values(atlas.groups).some((group) => group.start !== undefined)) continue; // already packed
  const { width, height } = sheetSize(atlas);
  if (only.length === 0 && width * height <= MAX_MP * 1e6 && width <= MAX_SIDE && height <= MAX_SIDE) continue;

  // One stream entry per sheet row (groups on one row share its frames).
  const rows = new Map();
  for (const group of Object.values(atlas.groups)) rows.set(group.row, Math.max(rows.get(group.row) ?? 0, group.frames));
  const columns = Math.max(1, Math.floor(MAX_SIDE / atlas.frameWidth));
  const startOfRow = new Map();
  let cursor = 0;
  for (const row of [...rows.keys()].sort((a, b) => a - b)) {
    startOfRow.set(row, cursor);
    cursor += rows.get(row);
  }
  const outRows = Math.ceil(cursor / columns);
  const outWidth = columns * atlas.frameWidth;
  const outHeight = outRows * atlas.frameHeight;
  if (outHeight > MAX_SIDE) {
    console.warn(`${slug}: packed sheet still ${outWidth}x${outHeight}; skipped`);
    continue;
  }

  const file = path.join(ROOT, "public", atlas.image);
  const { data, info } = await sharp(fs.readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(outWidth * outHeight * 4);
  const { frameWidth: fw, frameHeight: fh } = atlas;
  for (const [row, frames] of rows) {
    for (let k = 0; k < frames; k += 1) {
      const cell = startOfRow.get(row) + k;
      const dx = (cell % columns) * fw;
      const dy = Math.floor(cell / columns) * fh;
      const sx = k * fw;
      const sy = row * fh;
      for (let y = 0; y < fh; y += 1) {
        const from = ((sy + y) * info.width + sx) * 4;
        data.copy(out, ((dy + y) * outWidth + dx) * 4, from, from + fw * 4);
      }
    }
  }
  const encoded = await sharp(out, { raw: { width: outWidth, height: outHeight, channels: 4 } })
    .webp({ quality: 78, alphaQuality: 80, effort: 6, smartSubsample: true })
    .toBuffer();
  fs.writeFileSync(file, encoded);
  atlas.columns = columns;
  for (const group of Object.values(atlas.groups)) {
    group.start = startOfRow.get(group.row);
    group.row = Math.floor(group.start / columns);
  }
  changed += 1;
  console.log(
    `${slug}: ${width}x${height} (${((width * height) / 1e6).toFixed(1)} MP) -> ${outWidth}x${outHeight} (${((outWidth * outHeight) / 1e6).toFixed(1)} MP), ${(encoded.length / 1024).toFixed(0)} KB`
  );
}

if (changed > 0) {
  fs.writeFileSync(META_FILE, `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`packed ${changed} atlas(es); run npm run media:publish`);
} else {
  console.log("nothing to pack");
}

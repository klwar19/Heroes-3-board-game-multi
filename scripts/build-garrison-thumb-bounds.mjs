#!/usr/bin/env node
/**
 * Garrison / Order & Chaos card thumbnails: where each creature's body really
 * is inside its standing frame, so SpriteThumb can frame the whole body (heads
 * and wings included) instead of guessing from the frame size.
 *
 *   node scripts/build-garrison-thumb-bounds.mjs
 *
 * Reads the battle atlases (src/data/battle-hex/creature-sprite-atlases.json and
 * src/data/garrison/sprite-atlases.json) and their sheets under public/, and
 * writes src/data/garrison/thumb-bounds.json: slug -> [left, top, right, bottom]
 * of the opaque pixels of standing frame 0, in pixels of the frame cell.
 * Atlases whose sheet is not on disk are skipped (SpriteThumb keeps its old framing).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src", "data", "garrison", "thumb-bounds.json");
const STAND = "2";
const ALPHA = 24;

const atlases = {
  ...JSON.parse(fs.readFileSync(path.join(ROOT, "src", "data", "battle-hex", "creature-sprite-atlases.json"), "utf8")),
  ...JSON.parse(fs.readFileSync(path.join(ROOT, "src", "data", "garrison", "sprite-atlases.json"), "utf8"))
};

/** Same layout rule as spriteFrameOffset (src/data/battle-hex/creature-sprites.ts). */
function frameOffset(atlas, info, index) {
  const frame = Math.max(0, Math.min(index, info.frames - 1));
  if (info.start === undefined) return { x: frame * atlas.frameWidth, y: info.row * atlas.frameHeight };
  const cell = info.start + frame;
  return { x: (cell % atlas.columns) * atlas.frameWidth, y: Math.floor(cell / atlas.columns) * atlas.frameHeight };
}

const bounds = {};
let skipped = 0;
for (const [slug, atlas] of Object.entries(atlases).sort(([a], [b]) => a.localeCompare(b))) {
  if (!atlas || !atlas.image) continue;
  const file = path.join(ROOT, "public", atlas.image.replace(/^\//, ""));
  if (!fs.existsSync(file)) {
    skipped += 1;
    continue;
  }
  const info = atlas.groups[STAND] ?? Object.values(atlas.groups)[0];
  if (!info) continue;
  const { x, y } = frameOffset(atlas, info, 0);
  const meta = await sharp(file).metadata();
  const width = Math.min(atlas.frameWidth, meta.width - x);
  const height = Math.min(atlas.frameHeight, meta.height - y);
  if (width <= 0 || height <= 0) continue;
  const { data, info: raw } = await sharp(file).extract({ left: x, top: y, width, height }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = width, top = height, right = -1, bottom = -1;
  for (let py = 0; py < raw.height; py += 1) {
    for (let px = 0; px < raw.width; px += 1) {
      if (data[(py * raw.width + px) * 4 + 3] > ALPHA) {
        if (px < left) left = px;
        if (px > right) right = px;
        if (py < top) top = py;
        if (py > bottom) bottom = py;
      }
    }
  }
  if (right < 0) continue;
  bounds[slug] = [left, top, right + 1, bottom + 1];
}
fs.writeFileSync(OUT, `${JSON.stringify(bounds)}\n`);
console.log(`thumb bounds: ${Object.keys(bounds).length} atlases, ${skipped} without a local sheet -> ${path.relative(ROOT, OUT)}`);

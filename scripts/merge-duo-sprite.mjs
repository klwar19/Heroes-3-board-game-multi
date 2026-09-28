#!/usr/bin/env node
/**
 * Hex Battlefield: one figure for a DUO unit card (two characters on one card,
 * e.g. MGQ "Kamuro & Kitsu"). Each character is rotoscoped on its own from the
 * SAME donor animation (scripts/pose-sprite-manifest.json), then the two
 * atlases are drawn into one: the front character at `front` offset, the back
 * character at `back` offset (H3 px from the shared hex anchor; the back one
 * higher up the screen = further away), back first. Every group carries the
 * larger frame count of the two (the other's frames stretched evenly over it);
 * in the looping groups (walk, standing, mouse-over) the back character runs
 * half a cycle behind, so the pair do not step and breathe in lockstep.
 *
 *   node scripts/merge-duo-sprite.mjs <out-slug> <front-slug> <back-slug> [--front 8,3] [--back -10,-5]
 *     [--out-dir public/assets/battle-hex/creatures] [--meta src/data/battle-hex/creature-sprite-atlases.json]
 *
 * Reads/writes public/assets/battle-hex/creatures/<slug>.webp and
 * src/data/battle-hex/creature-sprite-atlases.json (one shared 256-colour
 * palette, lossless WebP, as scripts/import-pose-guided-sheet.mjs writes).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
sharp.cache(false);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOOPS = new Set([0, 1, 2]);

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const META_FILE = path.resolve(ROOT, option("meta", "src/data/battle-hex/creature-sprite-atlases.json"));
const OUT_DIR = path.resolve(ROOT, option("out-dir", "public/assets/battle-hex/creatures"));
const positional = args.filter((arg, index) => !arg.startsWith("--") && !args[index - 1]?.startsWith("--"));
const [outSlug, frontSlug, backSlug] = positional;
if (!outSlug || !frontSlug || !backSlug) {
  console.error("usage: node scripts/merge-duo-sprite.mjs <out-slug> <front-slug> <back-slug> [--front x,y] [--back x,y]");
  process.exit(1);
}
const offset = (text) => {
  const [x, y] = text.split(",").map(Number);
  return { x, y };
};

const meta = JSON.parse(fs.readFileSync(META_FILE, "utf8"));
const SOURCE_META = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "data", "battle-hex", "creature-sprite-atlases.json"), "utf8"));
const layers = [
  { slug: backSlug, off: offset(option("back", "-10,-5")), phase: true },
  { slug: frontSlug, off: offset(option("front", "8,3")), phase: false }
];
for (const layer of layers) {
  layer.atlas = meta[layer.slug] ?? SOURCE_META[layer.slug];
  if (!layer.atlas) throw new Error(`no atlas ${layer.slug}`);
  layer.image = await sharp(path.join(ROOT, "public", layer.atlas.image)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

// The merged frame box around the shared anchor.
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const { atlas, off } of layers) {
  minX = Math.min(minX, off.x - atlas.anchorX);
  minY = Math.min(minY, off.y - atlas.anchorY);
  maxX = Math.max(maxX, off.x - atlas.anchorX + atlas.frameWidth);
  maxY = Math.max(maxY, off.y - atlas.anchorY + atlas.frameHeight);
}
const frameWidth = maxX - minX;
const frameHeight = maxY - minY;
const anchorX = -minX;
const anchorY = -minY;

const groupIds = [...new Set(layers.flatMap(({ atlas }) => Object.keys(atlas.groups).map(Number)))].sort((a, b) => a - b);
const counts = groupIds.map((group) => Math.max(...layers.map(({ atlas }) => atlas.groups[group]?.frames ?? 0)));
const columns = Math.max(...counts);
const width = columns * frameWidth;
const height = groupIds.length * frameHeight;
const out = Buffer.alloc(width * height * 4);

/** Source pixel origin of frame `index` of `group` in an atlas (dense-packed groups carry `start`). */
function frameOrigin(atlas, group, index) {
  const info = atlas.groups[group];
  if (info.start !== undefined) {
    const cell = info.start + index;
    return { x: (cell % atlas.columns) * atlas.frameWidth, y: Math.floor(cell / atlas.columns) * atlas.frameHeight };
  }
  return { x: index * atlas.frameWidth, y: info.row * atlas.frameHeight };
}

const groups = {};
groupIds.forEach((group, row) => {
  const n = counts[row];
  groups[group] = { row, frames: n };
  for (let k = 0; k < n; k += 1) {
    for (const { atlas, image, off, phase } of layers) {
      // A group one character lacks borrows its standing frame.
      const own = atlas.groups[group] ? group : 2;
      const m = atlas.groups[own]?.frames ?? 0;
      if (!m) continue;
      let index = n > 1 ? Math.round((k * (m - 1)) / (n - 1)) : 0;
      if (LOOPS.has(group) && own === group) index = Math.floor((k * m) / n);
      if (phase && LOOPS.has(own)) index = (index + Math.floor(m / 2)) % m;
      if (own !== group) index = 0;
      const src = frameOrigin(atlas, own, index);
      const dx = k * frameWidth + anchorX + off.x - atlas.anchorX;
      const dy = row * frameHeight + anchorY + off.y - atlas.anchorY;
      for (let y = 0; y < atlas.frameHeight; y += 1) {
        for (let x = 0; x < atlas.frameWidth; x += 1) {
          const s = ((src.y + y) * image.info.width + src.x + x) * 4;
          const a = image.data[s + 3];
          if (!a) continue;
          const d = ((dy + y) * width + dx + x) * 4;
          // Source-over (the atlases are 1-bit bodies plus a translucent ground shadow).
          const da = out[d + 3];
          const outA = a + (da * (255 - a)) / 255;
          for (let c = 0; c < 3; c += 1) {
            out[d + c] = Math.round((image.data[s + c] * a + (out[d + c] * da * (255 - a)) / 255) / Math.max(1, outA));
          }
          out[d + 3] = Math.round(outA);
        }
      }
    }
  }
});

const png = await sharp(out, { raw: { width, height, channels: 4 } }).png({ palette: true, colours: 256, dither: 0, effort: 10 }).toBuffer();
const outFile = path.join(OUT_DIR, `${outSlug}.webp`);
await sharp(png).webp({ lossless: true, effort: 6 }).toFile(outFile);
meta[outSlug] = { image: `/assets/battle-hex/creatures/${outSlug}.webp`, frameWidth, frameHeight, columns, anchorX, anchorY, groups };
fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2) + "\n");
console.log(`wrote ${path.relative(ROOT, outFile)} ${frameWidth}x${frameHeight} anchor ${anchorX},${anchorY} groups ${groupIds.map((g) => `${g}:${groups[g].frames}`).join(" ")}`);

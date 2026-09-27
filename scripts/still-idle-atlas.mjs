#!/usr/bin/env node
/**
 * Hex Battlefield: steadies the standing loop of a SHEET-BUILT atlas (one made
 * by scripts/refit-sheet-sprites.mjs — the Forge Tank, war machines). Their
 * idle rows are separate paintings of the same pose, so the loop, which plays
 * all the time, shimmers on the spot. Every standing frame is replaced by the
 * one most like the others (the medoid), so the machine stands steady as the
 * PC's war machines do. Idempotent; rotoscoped sprites get the same treatment
 * inside scripts/import-pose-guided-sheet.mjs (STILL IDLE) instead.
 *
 *   node scripts/still-idle-atlas.mjs <slug> [slug...] [--dry]
 *
 * Rewrites public/assets/battle-hex/creatures/<slug>.webp in place (lossless;
 * media-managed: `npm run media:publish` before deploying). The atlas entry in
 * src/data/battle-hex/creature-sprite-atlases.json is unchanged.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
sharp.cache(false);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const META = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "data", "battle-hex", "creature-sprite-atlases.json"), "utf8"));
const STANDING = "2";

function cellOrigin(atlas, info, index) {
  if (info.start === undefined) return { x: index * atlas.frameWidth, y: info.row * atlas.frameHeight };
  const cell = info.start + index;
  return { x: (cell % atlas.columns) * atlas.frameWidth, y: Math.floor(cell / atlas.columns) * atlas.frameHeight };
}

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const slugs = args.filter((arg) => !arg.startsWith("--"));
if (!slugs.length) {
  console.error("usage: node scripts/still-idle-atlas.mjs <slug> [slug...] [--dry]");
  process.exit(1);
}
for (const slug of slugs) {
  const atlas = META[slug];
  const info = atlas?.groups[STANDING];
  if (!info || info.frames < 2) {
    console.log(`skip ${slug}: no standing loop`);
    continue;
  }
  const file = path.join(ROOT, "public", atlas.image.replace(/^\//, ""));
  const { data, info: image } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = image.width, fw = atlas.frameWidth, fh = atlas.frameHeight;
  const frame = (index) => {
    const { x, y } = cellOrigin(atlas, info, index);
    const out = Buffer.alloc(fw * fh * 4);
    for (let row = 0; row < fh; row += 1) data.copy(out, row * fw * 4, ((y + row) * W + x) * 4, ((y + row) * W + x + fw) * 4);
    return out;
  };
  const frames = Array.from({ length: info.frames }, (_, index) => frame(index));
  const distance = (a, b) => {
    let d = 0;
    for (let i = 0; i < a.length; i += 4) {
      const oa = a[i + 3] > 0, ob = b[i + 3] > 0;
      if (oa !== ob) d += 255;
      else if (oa) d += Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
    }
    return d;
  };
  let master = 0, best = Infinity;
  frames.forEach((candidate, index) => {
    const total = frames.reduce((sum, other, k) => sum + (k === index ? 0 : distance(candidate, other)), 0);
    if (total < best) { best = total; master = index; }
  });
  const already = frames.every((other) => distance(frames[master], other) === 0);
  console.log(`${slug}: ${info.frames} standing frames -> frame ${master}${already ? " (already steady)" : ""}`);
  if (already || dry) continue;
  for (let index = 0; index < info.frames; index += 1) {
    const { x, y } = cellOrigin(atlas, info, index);
    for (let row = 0; row < fh; row += 1) frames[master].copy(data, ((y + row) * W + x) * 4, row * fw * 4, (row + 1) * fw * 4);
  }
  const buffer = await sharp(data, { raw: { width: W, height: image.height, channels: 4 } }).webp({ lossless: true, effort: 6 }).toBuffer();
  fs.writeFileSync(file, buffer);
}

#!/usr/bin/env node
/**
 * Keys the flat backdrop out of a generated SPRITE SHEET before
 * scripts/import-sprite-sheet.mjs (which keeps a sheet's real alpha). The
 * importer's own flood fill follows any gentle gradient, so on a machine that
 * FIRES (a cannon's muzzle blast, a glow fading into the backdrop) it crawls
 * into the blast and leaves a hollow ring. Here the flood from each cell's
 * border only crosses BACKDROP-LIKE pixels — close to the backdrop grey in
 * colour, unsaturated, not much brighter or darker — so saturated fire, sparks
 * and the white-hot core stop it, while the soft grey smoke haze around them
 * still drops out.
 *
 *   node scripts/key-sheet-background.mjs <sheet.png> <out.png> --grid 6x4
 *     [--sat 26] [--dark 45] [--light 95] [--step 22] [--regrid 48]
 *
 * --sat    largest channel spread (max-min) a backdrop pixel may have
 * --dark / --light  how far below / above the backdrop luminance it may be
 * --step   largest RGB step between neighbouring backdrop pixels
 * The backdrop colour is the median of each cell's border pixels.
 * --regrid N  Codex does not keep its frames inside the grid exactly: a blast
 *          runs into the next cell, the next frame's wheel pokes back. Every
 *          connected piece (8-connected, after keying) is given to the cell its
 *          centre lies in and redrawn in cells N px wider on each side, so the
 *          importer (same --grid) cuts whole frames with no bleed.
 *
 * Cove Cannon (war_machine.cannon, no PC original):
 *   node scripts/key-sheet-background.mjs generated-session-art/battle-hex/war-machines/cannon-sheet.png
 *     generated-session-art/battle-hex/war-machines/cannon-sheet-alpha.png --grid 6x4 --regrid 48
 *   node scripts/import-sprite-sheet.mjs generated-session-art/battle-hex/war-machines/cannon-sheet-alpha.png war-cannon
 *     --grid 6x4 --rows "2:6;15:6;3:6;5:6" --copy "4=3,14=15,16=15" --ref war-ballista
 *   node scripts/refit-sheet-sprites.mjs war-cannon
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

function option(args, name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

const args = process.argv.slice(2);
const [input, output] = args;
const gridSpec = option(args, "grid");
if (!input || !output || !gridSpec) {
  console.error("usage: node scripts/key-sheet-background.mjs <sheet.png> <out.png> --grid 6x4 [--sat 26] [--dark 45] [--light 95] [--step 22]");
  process.exit(1);
}
const [gridColumns, gridRows] = gridSpec.split("x").map(Number);
const maxSat = Number(option(args, "sat", "26"));
const maxDark = Number(option(args, "dark", "45"));
const maxLight = Number(option(args, "light", "95"));
const maxStep = Number(option(args, "step", "22"));

const { data, info } = await sharp(fs.readFileSync(input)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
const cellWidth = Math.floor(width / gridColumns);
const cellHeight = Math.floor(height / gridRows);
const lum = (i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

let cleared = 0;
for (let row = 0; row < gridRows; row += 1) {
  for (let column = 0; column < gridColumns; column += 1) {
    const x0 = column * cellWidth;
    const y0 = row * cellHeight;
    const index = (x, y) => ((y0 + y) * width + x0 + x) * 4;
    const border = [];
    for (let x = 0; x < cellWidth; x += 1) border.push([x, 0], [x, cellHeight - 1]);
    for (let y = 1; y < cellHeight - 1; y += 1) border.push([0, y], [cellWidth - 1, y]);
    const lums = border.map(([x, y]) => lum(index(x, y))).sort((a, b) => a - b);
    const backdrop = lums[Math.floor(lums.length / 2)];
    const backdropLike = (i) => {
      const spread = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
      const l = lum(i);
      return spread <= maxSat && l >= backdrop - maxDark && l <= backdrop + maxLight;
    };
    const seen = new Uint8Array(cellWidth * cellHeight);
    const stack = [];
    for (const [x, y] of border) {
      const i = index(x, y);
      if (!seen[y * cellWidth + x] && backdropLike(i)) {
        seen[y * cellWidth + x] = 1;
        stack.push([x, y]);
      }
    }
    while (stack.length > 0) {
      const [x, y] = stack.pop();
      const here = index(x, y);
      data[here + 3] = 0;
      cleared += 1;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cellWidth || ny >= cellHeight || seen[ny * cellWidth + nx]) continue;
        const next = index(nx, ny);
        const step = Math.hypot(data[next] - data[here], data[next + 1] - data[here + 1], data[next + 2] - data[here + 2]);
        if (step > maxStep || !backdropLike(next)) continue;
        seen[ny * cellWidth + nx] = 1;
        stack.push([nx, ny]);
      }
    }
  }
}
const pad = Number(option(args, "regrid", "0"));
let out = data;
let outWidth = width;
let outHeight = height;
if (pad > 0) {
  const newCellWidth = cellWidth + pad * 2;
  const newCellHeight = cellHeight + pad * 2;
  outWidth = newCellWidth * gridColumns;
  outHeight = newCellHeight * gridRows;
  out = Buffer.alloc(outWidth * outHeight * 4);
  const label = new Int32Array(width * height).fill(-1);
  let moved = 0;
  let clipped = 0;
  for (let start = 0; start < width * height; start += 1) {
    if (label[start] >= 0 || data[start * 4 + 3] === 0) continue;
    const pixels = [start];
    label[start] = 1;
    let sumX = 0;
    let sumY = 0;
    for (let k = 0; k < pixels.length; k += 1) {
      const p = pixels[k];
      const x = p % width;
      const y = (p - x) / width;
      sumX += x;
      sumY += y;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const q = ny * width + nx;
          if (label[q] < 0 && data[q * 4 + 3] > 0) {
            label[q] = 1;
            pixels.push(q);
          }
        }
      }
    }
    const column = Math.min(gridColumns - 1, Math.floor(sumX / pixels.length / cellWidth));
    const row = Math.min(gridRows - 1, Math.floor(sumY / pixels.length / cellHeight));
    for (const p of pixels) {
      const x = p % width;
      const y = (p - x) / width;
      const cx = x - column * cellWidth + pad;
      const cy = y - row * cellHeight + pad;
      if (cx < 0 || cy < 0 || cx >= newCellWidth || cy >= newCellHeight) {
        clipped += 1;
        continue;
      }
      if (Math.floor(x / cellWidth) !== column || Math.floor(y / cellHeight) !== row) moved += 1;
      data.copy(out, ((row * newCellHeight + cy) * outWidth + column * newCellWidth + cx) * 4, p * 4, p * 4 + 4);
    }
  }
  console.log(`regrid: cells ${newCellWidth}x${newCellHeight}, ${moved} px moved back to their own frame, ${clipped} px clipped`);
}
await sharp(out, { raw: { width: outWidth, height: outHeight, channels: 4 } }).png().toFile(output);
console.log(`${output}: ${outWidth}x${outHeight}, ${gridColumns}x${gridRows} cells, cleared ${(cleared / (width * height) * 100).toFixed(1)}% as backdrop`);

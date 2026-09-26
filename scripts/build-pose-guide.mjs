#!/usr/bin/env node
/**
 * Hex Battlefield sprites by "rotoscoping" a real Heroes 3 creature: builds a
 * POSE GUIDE sheet from a donor creature atlas (an H3 / HotA .def creature
 * already in creature-sprite-atlases.json) for an image generator to repaint.
 *
 * Generated sprite sheets drawn from imagination animate stiffly (the frames of
 * a walk or a shot barely differ) and drift in shape from frame to frame. Here
 * every cell holds one REAL donor frame as grey clay, so the repainted creature
 * inherits the donor's motion, frame count, camera angle and proportions; the
 * generator only replaces its look. scripts/import-pose-guided-sheet.mjs cuts
 * the repainted sheet back into an atlas on the donor's own geometry.
 *
 *   node scripts/build-pose-guide.mjs <donor-slug> <out-base>
 *     [--grid 10x6 | auto] [--size 1536x1024] [--groups "2,0,15,12,3,4,5,7,8,20,21"] [--caps "4:6,5:7"]
 *
 * Writes <out-base>.png (the guide: flat #8a8a8a backdrop) and <out-base>.json
 * (the layout: which donor group/frame each cell holds and where).
 *
 * --groups  donor groups to carry, in sheet order (H3 ids: 0 walk, 2 standing,
 *           3 hit, 4 defend, 5 death, 7/8 turn, 11/12/13 strike, 14/15/16 shoot,
 *           17/18/19 cast, 20/21 start/stop moving). Missing ids are skipped.
 * --grid auto  the grid with the largest cells holding every wanted frame.
 * --max-scale  cap of that one scale (default 1.7).
 * --caps    most frames carried per group (defaults: DEFAULT_CAPS). When the
 *           grid is too small, 20/21 go first, then the largest groups shrink.
 *           Frames are picked evenly (loops: evenly over the cycle; one-shot
 *           groups keep their first and last frame).
 * Each frame's body (opaque pixels; the H3 shadow is dropped) is centred in its
 * cell at ONE scale for the whole sheet (the largest that fits every body).
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
const CREATURE_DIR = path.join(ROOT, "public", "assets", "battle-hex", "creatures");
const BACKDROP = "#8a8a8a";
const MARGIN = 7;
/** Largest guide scale (--max-scale): bigger clay = more detail in the repaint. */
const MAX_SCALE = 1.7;
/** Groups that loop (picked evenly over the cycle, no repeated seam frame). */
const LOOPS = new Set([0, 1, 2]);
const DEFAULT_CAPS = { 2: 10, 0: 10, 15: 9, 18: 9, 12: 9, 11: 6, 13: 6, 3: 7, 4: 6, 5: 9, 7: 3, 8: 3, 20: 2, 21: 2 };

function option(args, name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

const args = process.argv.slice(2);
const [donor, outBase] = args;
if (!donor || !outBase) {
  console.error("usage: node scripts/build-pose-guide.mjs <donor-slug> <out-base> [--grid 10x6] [--groups ...] [--caps ...]");
  process.exit(1);
}
const [width, height] = option(args, "size", "1536x1024").split("x").map(Number);
const atlas = JSON.parse(fs.readFileSync(META_FILE, "utf8"))[donor];
if (!atlas) throw new Error(`no atlas for donor ${donor}`);
const image = path.join(CREATURE_DIR, path.basename(atlas.image));

const order = option(args, "groups", "2,0,15,12,3,4,5,7,8,20,21").split(",").map(Number).filter((g) => atlas.groups[String(g)]);
const caps = Object.fromEntries(option(args, "caps", "").split(",").filter(Boolean).map((pair) => pair.split(":").map(Number)));
const want = Object.fromEntries(order.map((g) => [g, Math.min(atlas.groups[String(g)].frames, caps[g] ?? DEFAULT_CAPS[g] ?? 6)]));
// --grid auto: the grid with the largest cells that still holds every wanted frame.
function autoGrid(count) {
  let best = null;
  for (let c = 3; c <= 12; c += 1) {
    for (let r = 2; r <= 8; r += 1) {
      if (c * r < count) continue;
      const size = Math.min(width / c, height / r);
      if (!best || size > best.size || (size === best.size && c * r < best.c * best.r)) best = { c, r, size };
    }
  }
  return [best.c, best.r];
}
const gridOption = option(args, "grid", "10x6");
const [cols, rows] = gridOption === "auto"
  ? autoGrid(order.reduce((sum, g) => sum + want[g], 0))
  : gridOption.split("x").map(Number);
const cellW = width / cols;
const cellH = height / rows;
const budget = cols * rows;
const carried = () => order.reduce((sum, g) => sum + want[g], 0);
for (const g of [21, 20]) if (carried() > budget && want[g]) want[g] = 0;
while (carried() > budget) {
  const g = order.filter((id) => want[id] > 3).sort((a, b) => want[b] - want[a])[0];
  if (g === undefined) throw new Error("grid too small for the chosen groups");
  want[g] -= 1;
}

const picks = [];
for (const g of order) {
  const total = atlas.groups[String(g)].frames;
  const count = want[g];
  for (let k = 0; k < count; k += 1) {
    const frame = LOOPS.has(g) || count === 1 ? Math.floor((k * total) / count) : Math.round((k * (total - 1)) / (count - 1));
    picks.push({ group: g, frame });
  }
}

function frameOffset(group, index) {
  const info = atlas.groups[String(group)];
  if (info.start === undefined) return { x: index * atlas.frameWidth, y: info.row * atlas.frameHeight };
  const cell = info.start + index;
  return { x: (cell % atlas.columns) * atlas.frameWidth, y: Math.floor(cell / atlas.columns) * atlas.frameHeight };
}

// Grey clay of every picked frame (luminance only, lifted off the backdrop) + its body box.
for (const pick of picks) {
  const at = frameOffset(pick.group, pick.frame);
  const { data } = await sharp(image)
    .extract({ left: at.x, top: at.y, width: atlas.frameWidth, height: atlas.frameHeight })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < atlas.frameHeight; y += 1) {
    for (let x = 0; x < atlas.frameWidth; x += 1) {
      const i = (y * atlas.frameWidth + x) * 4;
      if (data[i + 3] < 200) {
        data[i + 3] = 0;
        continue;
      }
      const luminance = 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
      data[i] = data[i + 1] = data[i + 2] = Math.round(70 + luminance * 0.72);
      data[i + 3] = 255;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) throw new Error(`donor frame ${pick.group}:${pick.frame} is empty`);
  Object.assign(pick, { data, body: { x0, y0, x1, y1 } });
}

const scale = Number(option(args, "scale", String(Math.min(
  Number(option(args, "max-scale", String(MAX_SCALE))),
  ...picks.map((pick) => Math.min(
    (cellW - 2 * MARGIN) / (pick.body.x1 - pick.body.x0 + 1),
    (cellH - 2 * MARGIN) / (pick.body.y1 - pick.body.y0 + 1)
  ))
))));
const frameW = Math.round(atlas.frameWidth * scale);
const frameH = Math.round(atlas.frameHeight * scale);
const composites = [];
const cells = [];
for (let k = 0; k < picks.length; k += 1) {
  const pick = picks[k];
  const col = k % cols;
  const row = Math.floor(k / cols);
  const full = await sharp(pick.data, { raw: { width: atlas.frameWidth, height: atlas.frameHeight, channels: 4 } })
    .resize(frameW, frameH, { kernel: "lanczos3" })
    .png()
    .toBuffer();
  const bodyX = ((pick.body.x0 + pick.body.x1 + 1) / 2) * scale;
  const bodyY = ((pick.body.y0 + pick.body.y1 + 1) / 2) * scale;
  // Top-left of the whole (scaled) donor frame; only its part inside the cell is drawn.
  const left = Math.round(col * cellW + cellW / 2 - bodyX);
  const top = Math.round(row * cellH + cellH / 2 - bodyY);
  const cx0 = Math.round(col * cellW), cy0 = Math.round(row * cellH);
  const cx1 = Math.round((col + 1) * cellW), cy1 = Math.round((row + 1) * cellH);
  const ex = Math.max(0, cx0 - left), ey = Math.max(0, cy0 - top);
  const ew = Math.min(frameW, cx1 - left) - ex, eh = Math.min(frameH, cy1 - top) - ey;
  composites.push({ input: await sharp(full).extract({ left: ex, top: ey, width: ew, height: eh }).png().toBuffer(), left: left + ex, top: top + ey });
  cells.push({ col, row, group: pick.group, frame: pick.frame, left, top });
}

fs.mkdirSync(path.dirname(path.resolve(outBase)), { recursive: true });
await sharp({ create: { width, height, channels: 4, background: BACKDROP } })
  .composite(composites)
  .flatten({ background: BACKDROP })
  .png()
  .toFile(`${outBase}.png`);
const layout = {
  donor,
  cols,
  rows,
  width,
  height,
  cellW,
  cellH,
  scale,
  frameW,
  frameH,
  donorFrame: { width: atlas.frameWidth, height: atlas.frameHeight, anchorX: atlas.anchorX, anchorY: atlas.anchorY },
  groups: Object.fromEntries(Object.entries(atlas.groups).map(([g, info]) => [g, info.frames])),
  cells
};
fs.writeFileSync(`${outBase}.json`, JSON.stringify(layout, null, 1));
console.log(
  `guide ${outBase}: ${cells.length}/${budget} cells, scale ${scale.toFixed(3)} —`,
  order.filter((g) => want[g]).map((g) => `${g}:${want[g]}/${atlas.groups[String(g)].frames}`).join(" ")
);

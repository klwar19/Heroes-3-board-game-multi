#!/usr/bin/env node
/**
 * Hex Battlefield: cuts REPAINTED pose-guide sheets (scripts/build-pose-guide.mjs
 * → an image generator repaints every clay cell as the new creature) into a
 * creature atlas that stands and moves exactly like its H3 donor:
 *
 *  - KEY: each cell's flat backdrop is flooded in from the cell border (close
 *    to the border colour and a gentle step from pixel to pixel), backdrop
 *    holes enclosed by the figure go too, and the anti-aliased rim is UNMIXED
 *    (its coverage against the backdrop becomes alpha, the backdrop tint is
 *    taken out of its colour) — no grey fringe, no ragged light edges. Stray
 *    specks and pieces of neighbouring cells are dropped.
 *  - REGISTER: the cut figure is moved onto the donor frame's clay silhouette
 *    (the translation with the best overlap), so every frame sits where the
 *    donor's does — the motion is the donor's real H3 motion, not the
 *    generator's drift.
 *  - QA: a frame of a quiet group (idle, walk, turn, hit, defend...) is
 *    dropped from its group when the repaint slipped there: a muzzle flash /
 *    blast the others lack, a part far outside the donor pose (a weapon
 *    levelled where the donor's hangs), or a pose jump away from BOTH
 *    neighbouring frames.
 *  - STEADY colour: every frame's mean colour is pulled toward the idle
 *    frames' (flashes and sparks keep their light).
 *  - DONOR GEOMETRY: frames are cut on the donor frame box (padded for a
 *    longer weapon), scaled back to donor pixels, then uniformly so the
 *    standing body is --height H3 px tall; the anchor is the donor's (feet
 *    corrected by at most a few pixels to the generated standing feet).
 *  - H3 FINISH: 1-bit edges after the downscale, the H3 ground shadow cast
 *    from each frame's own silhouette (as scripts/refit-sheet-sprites.mjs),
 *    one shared 256-colour palette for the whole atlas (no colour shimmer).
 *  - SEVERAL SHEETS of the same donor (--also): each group is taken WHOLE from
 *    the sheet carrying most of its frames (a tie goes to the later sheet), so
 *    e.g. a full-frame idle/walk sheet joins the attack/hit/death sheet
 *    without mixing two renderings inside one animation.
 *  - GROUPS: every donor group carried, its frames in donor order; a group no
 *    sheet carried aliases a sibling (mouse-over = standing, strike/shot up
 *    and down = straight, turn-back = turn reversed, cast up/down = straight).
 *    --groups keeps only the listed ids.
 *
 *   node scripts/import-pose-guided-sheet.mjs --all [slug...]   (every scripts/pose-sprite-manifest.json
 *     entry whose sheets are in tmp/gen/pose-sheets: <name>.png + <name>.guide.png/.json)
 *   node scripts/import-pose-guided-sheet.mjs <sheet.png> <layout.json> <slug> --height 72
 *     [--also <sheet2.png>,<layout2.json>[,smooth]]... [--smooth] [--groups "0,1,2,3,4,5,7,8,11,12,13,20,21"]
 *     [--tolerance 34] [--step 16] [--pad 0.22]
 *     [--out-dir public/assets/battle-hex/creatures] [--meta src/data/battle-hex/creature-sprite-atlases.json]
 *     [--preview out.png] [--dry]
 *
 * smooth / --smooth (manifest "smooth": [sheet names]): that sheet's backdrop
 * is graded or glowing instead of flat, so it is flooded by gentle steps alone
 * (every sheet's rim is unmixed against the backdrop right next to it).
 * <layout.json> is the guide's layout (its .png, the guide itself, must sit
 * next to it). The first install of a slug keeps the atlas it replaces in
 * tmp/gen/pose-sprite-backups/ (<slug>.webp + <slug>.json; never overwritten).
 * Output webps are media-managed: run `npm run media:publish` before deploying.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
sharp.cache(false);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKUP_DIR = path.join(ROOT, "tmp", "gen", "pose-sprite-backups");
const SHEET_DIR = path.join(ROOT, "tmp", "gen", "pose-sheets");
const MANIFEST_FILE = path.join(ROOT, "scripts", "pose-sprite-manifest.json");
/** H3 shadow: silhouette flattened to this share of its height, leaning right by this share (refit-sheet-sprites). */
const SHADOW_FLATTEN = 0.26;
const SHADOW_LEAN = 0.2;
const SHADOW_ALPHA = 95;
/** The rim band (pixels this close to the flooded backdrop) whose colour is unmixed from it. */
const RIM_DEPTH = 2;
/** Largest pixel-to-pixel step followed into a smooth (graded / glowing) backdrop. */
const SMOOTH_STEP = 8;
/** An enclosed backdrop hole: at most this far from the backdrop colour, at least this many pixels. */
const HOLE_TOLERANCE = 10;
const HOLE_MIN_PIXELS = 16;
/** Largest registration shift tried, guide pixels. */
const SEARCH = 18;
/** Largest correction of the donor's feet row toward the generated feet, guide pixels. */
const MAX_FEET_FIX = 4;
/** A group no sheet carried → the sibling it reuses. */
const ALIAS = { 1: [2], 11: [12], 13: [12], 14: [15], 16: [15], 8: [7], 7: [8], 17: [18, 12], 18: [12], 19: [18, 12] };

function option(args, name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}
function options(args, name) {
  return args.flatMap((arg, index) => (arg === `--${name}` && args[index + 1] ? [args[index + 1]] : []));
}

const args = process.argv.slice(2);
if (args[0] === "--all") {
  // Every sprite of the manifest whose sheets are in tmp/gen/pose-sheets (or only the listed slugs).
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8")).sprites;
  const wanted = args.slice(1);
  for (const [slug, spec] of Object.entries(manifest)) {
    if (wanted.length && !wanted.includes(slug)) continue;
    const names = (spec.sheets ?? [slug]).filter((name) => fs.existsSync(path.join(SHEET_DIR, `${name}.png`)));
    if (!names.length) {
      console.log(`skip ${slug}: no sheet in ${path.relative(ROOT, SHEET_DIR)}`);
      continue;
    }
    const smooth = new Set(spec.smooth ?? []);
    const sheet = (name) => path.join(SHEET_DIR, `${name}.png`);
    const layout = (name) => path.join(SHEET_DIR, `${name}.guide.json`);
    const run = spawnSync(process.execPath, [
      fileURLToPath(import.meta.url), sheet(names[0]), layout(names[0]), slug,
      ...names.slice(1).flatMap((name) => ["--also", `${sheet(name)},${layout(name)}${smooth.has(name) ? ",smooth" : ""}`]),
      ...(smooth.has(names[0]) ? ["--smooth"] : []),
      "--height", String(spec.height), ...(spec.groups ? ["--groups", spec.groups] : [])
    ], { stdio: "inherit" });
    if (run.status !== 0) process.exit(run.status ?? 1);
  }
  process.exit(0);
}
const [firstSheet, firstLayout, slug] = args;
if (!firstSheet || !firstLayout || !slug) {
  console.error("usage: node scripts/import-pose-guided-sheet.mjs <sheet.png> <layout.json> <slug> --height <px> [--also sheet,layout]...");
  process.exit(1);
}
const targetHeight = Number(option(args, "height", "0"));
const outDir = path.resolve(ROOT, option(args, "out-dir", "public/assets/battle-hex/creatures"));
const metaFile = path.resolve(ROOT, option(args, "meta", "src/data/battle-hex/creature-sprite-atlases.json"));
const only = option(args, "groups") ? new Set(option(args, "groups").split(",").map(Number)) : null;
const bgTolerance = Number(option(args, "tolerance", "34"));
const stepTolerance = Number(option(args, "step", "16"));
const padShare = Number(option(args, "pad", "0.22"));
const dry = args.includes("--dry");
const preview = option(args, "preview", "");

async function readRaw(file, width, height) {
  const meta = await sharp(file).metadata();
  let image = sharp(file).ensureAlpha();
  if (meta.width !== width || meta.height !== height) image = image.resize(width, height, { fit: "fill", kernel: "lanczos3" });
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, label: `${path.basename(file)} (${meta.width}x${meta.height})` };
}

const colourDistance = (px, i, r, g, b) => Math.max(Math.abs(px[i] - r), Math.abs(px[i + 1] - g), Math.abs(px[i + 2] - b));

function cutCell(image, box) {
  const out = new Uint8ClampedArray(box.w * box.h * 4);
  for (let y = 0; y < box.h; y += 1) {
    const start = ((box.y0 + y) * image.width + box.x0) * 4;
    out.set(image.data.subarray(start, start + box.w * 4), y * box.w * 4);
  }
  return out;
}

function borderColour(px, w, h) {
  const channels = [[], [], []];
  const take = (x, y) => {
    const i = (y * w + x) * 4;
    for (let k = 0; k < 3; k += 1) channels[k].push(px[i + k]);
  };
  for (let x = 0; x < w; x += 2) { take(x, 0); take(x, h - 1); }
  for (let y = 0; y < h; y += 2) { take(0, y); take(w - 1, y); }
  return channels.map((values) => values.sort((a, b) => a - b)[values.length >> 1]);
}

const neighbours4 = (p, w, h) => {
  const x = p % w, y = (p / w) | 0;
  return [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
};

/**
 * The figure's alpha in a cell (0..255): the backdrop flooded in from the
 * border + enclosed backdrop holes are 0, the body 255, and the rim band's
 * coverage is unmixed against the backdrop colour (its pixels' colour is
 * corrected in `px` to the figure's own).
 */
function keyCell(px, w, h, smooth) {
  const backdrop = borderColour(px, w, h);
  const [r, g, b] = backdrop;
  const background = new Uint8Array(w * h);
  const queue = [];
  const visit = (p, from) => {
    if (p < 0 || background[p]) return;
    const i = p * 4;
    // A smooth (glowing / graded) backdrop is followed by its gentle steps alone.
    if (!smooth && colourDistance(px, i, r, g, b) > bgTolerance) return;
    if (from >= 0 && colourDistance(px, i, px[from], px[from + 1], px[from + 2]) > (smooth ? SMOOTH_STEP : stepTolerance)) return;
    background[p] = 1;
    queue.push(p);
  };
  for (let x = 0; x < w; x += 1) { visit(x, -1); visit((h - 1) * w + x, -1); }
  for (let y = 0; y < h; y += 1) { visit(y * w, -1); visit(y * w + w - 1, -1); }
  while (queue.length) {
    const p = queue.pop();
    for (const n of neighbours4(p, w, h)) visit(n, p * 4);
  }
  // Backdrop enclosed by the figure (between tentacles, under an arm): a patch of
  // at least HOLE_MIN_PIXELS almost exactly the backdrop colour is a hole, not paint.
  const seen = new Uint8Array(w * h);
  for (let start = 0; start < w * h && !smooth; start += 1) {
    if (background[start] || seen[start] || colourDistance(px, start * 4, r, g, b) > HOLE_TOLERANCE) continue;
    const patch = [start];
    seen[start] = 1;
    for (let k = 0; k < patch.length; k += 1) {
      for (const n of neighbours4(patch[k], w, h)) {
        if (n < 0 || background[n] || seen[n] || colourDistance(px, n * 4, r, g, b) > HOLE_TOLERANCE) continue;
        seen[n] = 1;
        patch.push(n);
      }
    }
    if (patch.length >= HOLE_MIN_PIXELS) for (const p of patch) background[p] = 1;
  }
  // Depth of every figure pixel from the backdrop (1 = touching it), up to RIM_DEPTH + 1.
  const depth = new Uint8Array(w * h);
  let front = [];
  for (let p = 0; p < w * h; p += 1) {
    if (background[p]) continue;
    if (neighbours4(p, w, h).some((n) => n >= 0 && background[n])) {
      depth[p] = 1;
      front.push(p);
    }
  }
  for (let d = 2; d <= RIM_DEPTH + 1; d += 1) {
    const next = [];
    for (const p of front) {
      for (const n of neighbours4(p, w, h)) {
        if (n < 0 || background[n] || depth[n]) continue;
        depth[n] = d;
        next.push(n);
      }
    }
    front = next;
  }
  const alpha = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p += 1) if (!background[p] && (depth[p] === 0 || depth[p] > RIM_DEPTH)) alpha[p] = 255;
  // Unmix the rim: coverage = how far the pixel sits from the backdrop toward the
  // figure colour just inside it (the mean of deeper pixels nearby).
  for (let p = 0; p < w * h; p += 1) {
    const d = depth[p];
    if (background[p] || d === 0 || d > RIM_DEPTH) continue;
    const x = p % w, y = (p / w) | 0, i = p * 4;
    const inside = [0, 0, 0];
    const around = [0, 0, 0];
    let n = 0, m = 0;
    for (let dy = -3; dy <= 3; dy += 1) {
      for (let dx = -3; dx <= 3; dx += 1) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (background[q]) {
          for (let k = 0; k < 3; k += 1) around[k] += px[q * 4 + k];
          m += 1;
          continue;
        }
        if (depth[q] !== 0 && depth[q] <= d) continue;
        for (let k = 0; k < 3; k += 1) inside[k] += px[q * 4 + k];
        n += 1;
      }
    }
    if (!n) {
      alpha[p] = colourDistance(px, i, r, g, b) > bgTolerance ? 255 : 0;
      continue;
    }
    const figure = inside.map((v) => v / n);
    // The backdrop right next to this pixel (a graded / glowing backdrop differs from the border colour).
    const local = m ? around.map((v) => v / m) : backdrop;
    const span = figure.map((v, k) => v - local[k]);
    const spanSq = span.reduce((s, v) => s + v * v, 0);
    let coverage;
    if (spanSq < 20 * 20) {
      // The figure is nearly the backdrop colour here: keep what differs from it at all.
      coverage = colourDistance(px, i, local[0], local[1], local[2]) > 12 ? 1 : 0;
    } else {
      coverage = span.reduce((s, v, k) => s + v * (px[i + k] - local[k]), 0) / spanSq;
      coverage = Math.max(0, Math.min(1, coverage));
    }
    alpha[p] = Math.round(coverage * 255);
    if (coverage > 0.02) {
      for (let k = 0; k < 3; k += 1) px[i + k] = Math.max(0, Math.min(255, local[k] + (px[i + k] - local[k]) / coverage));
    }
  }
  return alpha;
}

/** Keeps the body: the largest solid piece and solid pieces near it (+ their soft rim); specks and neighbours' bits cut by the cell edge go. */
function keepBody(alpha, w, h) {
  const label = new Int32Array(w * h).fill(-1);
  const pieces = [];
  for (let p = 0; p < w * h; p += 1) {
    if (alpha[p] < 128 || label[p] >= 0) continue;
    const id = pieces.length;
    const stack = [p];
    label[p] = id;
    const piece = { n: 0, x0: w, y0: h, x1: -1, y1: -1, edge: false };
    while (stack.length) {
      const q = stack.pop();
      const x = q % w, y = (q / w) | 0;
      piece.n += 1;
      piece.x0 = Math.min(piece.x0, x); piece.x1 = Math.max(piece.x1, x);
      piece.y0 = Math.min(piece.y0, y); piece.y1 = Math.max(piece.y1, y);
      if (x === 0 || x === w - 1 || y === 0 || y === h - 1) piece.edge = true;
      for (const n of neighbours4(q, w, h)) {
        if (n >= 0 && alpha[n] >= 128 && label[n] < 0) { label[n] = id; stack.push(n); }
      }
    }
    pieces.push(piece);
  }
  const out = new Uint8Array(w * h);
  if (pieces.length === 0) return out;
  const main = pieces.reduce((a, b) => (b.n > a.n ? b : a));
  const gap = (piece) => Math.max(0, piece.x0 - main.x1, main.x0 - piece.x1, piece.y0 - main.y1, main.y0 - piece.y1);
  const keep = pieces.map((piece) => piece === main ||
    (!piece.edge && piece.n >= 6 && gap(piece) <= 14) ||
    (!piece.edge && piece.n >= 60 && gap(piece) <= 40));
  for (let p = 0; p < w * h; p += 1) if (label[p] >= 0 && keep[label[p]]) out[p] = alpha[p];
  // The soft rim stays where it borders a kept solid pixel.
  for (let p = 0; p < w * h; p += 1) {
    if (alpha[p] === 0 || alpha[p] >= 128) continue;
    const x = p % w, y = (p / w) | 0;
    let near = false;
    for (let dy = -2; dy <= 2 && !near; dy += 1) {
      for (let dx = -2; dx <= 2 && !near; dx += 1) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        near = label[q] >= 0 && keep[label[q]];
      }
    }
    if (near) out[p] = alpha[p];
  }
  return out;
}

function bounds(mask, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!mask[y * w + x]) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** The shift laying the cut figure (alpha >= 128) over the donor's clay silhouette best (overlap / union). */
function register(alpha, donor, w, h) {
  const score = (dx, dy) => {
    let inter = 0, union = 0;
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const sx = x - dx, sy = y - dy;
        const f = sx >= 0 && sy >= 0 && sx < w && sy < h && alpha[sy * w + sx] >= 128;
        const d = donor[y * w + x];
        if (f && d) inter += 1;
        if (f || d) union += 1;
      }
    }
    return union ? inter / union : 0;
  };
  let best = { dx: 0, dy: 0, score: -1 };
  for (let dy = -SEARCH; dy <= SEARCH; dy += 2) {
    for (let dx = -SEARCH; dx <= SEARCH; dx += 2) {
      const s = score(dx, dy);
      if (s > best.score) best = { dx, dy, score: s };
    }
  }
  const coarse = best;
  for (let dy = coarse.dy - 1; dy <= coarse.dy + 1; dy += 1) {
    for (let dx = coarse.dx - 1; dx <= coarse.dx + 1; dx += 1) {
      const s = score(dx, dy);
      if (s > best.score) best = { dx, dy, score: s };
    }
  }
  return best;
}

// ---- sources: every sheet + its guide layout (one donor) ------------------------------------------
// "sheet,layout[,smooth]": smooth = the sheet's backdrop is graded / glowing, not flat.
const sourceSpecs = [[firstSheet, firstLayout, args.includes("--smooth") ? "smooth" : ""], ...options(args, "also").map((spec) => spec.split(","))];
const sources = [];
for (const [sheetPath, layoutPath, mode] of sourceSpecs) {
  const layout = JSON.parse(fs.readFileSync(layoutPath, "utf8"));
  if (sources.length && layout.donor !== sources[0].layout.donor) throw new Error(`${layoutPath}: donor ${layout.donor} is not ${sources[0].layout.donor}`);
  const sheet = await readRaw(sheetPath, layout.width, layout.height);
  const guide = await readRaw(layoutPath.replace(/\.json$/, ".png"), layout.width, layout.height);
  const pad = Math.round(padShare * Math.max(layout.frameW, layout.frameH));
  sources.push({ layout, sheet, guide, pad, boxW: layout.frameW + 2 * pad, boxH: layout.frameH + 2 * pad, smooth: mode === "smooth" });
}
const donorFrame = sources[0].layout.donorFrame;
const groupsOf = sources[0].layout.groups;

const all = [];
for (const source of sources) {
  const { layout, sheet, guide } = source;
  const scores = [];
  for (const cell of layout.cells) {
    const x0 = Math.round(cell.col * layout.cellW);
    const y0 = Math.round(cell.row * layout.cellH);
    const box = { x0, y0, w: Math.round((cell.col + 1) * layout.cellW) - x0, h: Math.round((cell.row + 1) * layout.cellH) - y0 };
    const px = cutCell(sheet, box);
    const alpha = keepBody(keyCell(px, box.w, box.h, source.smooth), box.w, box.h);
    const guidePx = cutCell(guide, box);
    const [gr, gg, gb] = borderColour(guidePx, box.w, box.h);
    const donor = new Uint8Array(box.w * box.h);
    for (let p = 0; p < donor.length; p += 1) donor[p] = colourDistance(guidePx, p * 4, gr, gg, gb) > 10 ? 1 : 0;
    const reg = register(alpha, donor, box.w, box.h);
    scores.push(reg.score);
    all.push({ ...cell, source, box, px, alpha, donor, reg, dropped: null });
  }
  scores.sort((a, b) => a - b);
  console.log(`${sheet.label}: ${layout.cells.length} frames, overlap with the donor median ${scores[scores.length >> 1].toFixed(2)}, lowest ${scores[0].toFixed(2)}`);
}

// ---- stray effects: a muzzle flash / blast painted into a frame of a group that has none --------------
// (idle, walk, turns, start/stop, hit, defend): that frame is dropped from its group.
const QUIET_GROUPS = new Set([0, 1, 2, 3, 4, 7, 8, 20, 21]);
const flashPixels = (cell) => {
  let n = 0;
  for (let p = 0; p < cell.alpha.length; p += 1) {
    if (cell.alpha[p] < 128) continue;
    const i = p * 4;
    const hi = Math.max(cell.px[i], cell.px[i + 1], cell.px[i + 2]);
    const lo = Math.min(cell.px[i], cell.px[i + 1], cell.px[i + 2]);
    if (hi > 235 && hi - lo > 40) n += 1;
  }
  return n;
};
/** Figure pixels farther than EXCESS_RADIUS from the donor's silhouette (a weapon levelled where the donor's hangs, a blast). */
const EXCESS_RADIUS = 6;
function excessPixels(cell) {
  const { w, h } = cell.box;
  // Donor silhouette grown by EXCESS_RADIUS (separable box max).
  const rows = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!cell.donor[y * w + x]) continue;
      for (let k = Math.max(0, x - EXCESS_RADIUS); k <= Math.min(w - 1, x + EXCESS_RADIUS); k += 1) rows[y * w + k] = 1;
    }
  }
  const grown = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!rows[y * w + x]) continue;
      for (let k = Math.max(0, y - EXCESS_RADIUS); k <= Math.min(h - 1, y + EXCESS_RADIUS); k += 1) grown[k * w + x] = 1;
    }
  }
  let n = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (cell.alpha[y * w + x] < 128) continue;
      const tx = x + cell.reg.dx, ty = y + cell.reg.dy;
      if (tx < 0 || ty < 0 || tx >= w || ty >= h || !grown[ty * w + tx]) n += 1;
    }
  }
  return n;
}
/** How far each frame of a group jumps from BOTH its neighbours (silhouette XOR on the donor box, every 2nd pixel). */
function jumps(members) {
  const ordered = [...members].sort((a, b) => a.frame - b.frame);
  const masks = ordered.map((cell) => {
    const rgba = figureOnBox(cell);
    const mask = new Uint8Array(rgba.length / 4);
    for (let p = 0; p < mask.length; p += 1) mask[p] = rgba[p * 4 + 3] >= 128 ? 1 : 0;
    return mask;
  });
  const xor = (a, b) => {
    let n = 0;
    for (let p = 0; p < a.length; p += 2) if (a[p] !== b[p]) n += 1;
    return n;
  };
  const byFrame = new Map();
  ordered.forEach((cell, k) => {
    const prev = masks[(k - 1 + masks.length) % masks.length];
    const next = masks[(k + 1) % masks.length];
    byFrame.set(cell, Math.min(xor(masks[k], prev), xor(masks[k], next)));
  });
  return members.map((cell) => byFrame.get(cell));
}
const median = (values) => [...values].sort((a, b) => a - b)[values.length >> 1];
for (const source of sources) {
  for (const group of QUIET_GROUPS) {
    const members = all.filter((cell) => cell.source === source && cell.group === group).sort((a, b) => a.frame - b.frame);
    if (members.length < 3) continue;
    const flash = members.map(flashPixels);
    const excess = members.map(excessPixels);
    const jump = jumps(members);
    if (process.env.POSE_DEBUG) console.log(`  ${source.sheet.label} group ${group} flash ${flash.join(" ")} excess ${excess.join(" ")} jump ${jump.join(" ")}`);
    const flashMedian = median(flash), excessMedian = median(excess), jumpMedian = median(jump);
    const drop = members.map((cell, k) => {
      if (flash[k] > Math.max(40, 4 * flashMedian + 20)) return `a stray flash (${flash[k]} lit pixels, group median ${flashMedian})`;
      if (excess[k] > 2 * excessMedian + 200) return `a part far outside the donor pose (${excess[k]} px, group median ${excessMedian})`;
      if (members.length >= 6) {
        const around = (jump[(k - 1 + members.length) % members.length] + jump[(k + 1) % members.length]) / 2;
        if (jump[k] > 2.4 * around && jump[k] > 1.5 * jumpMedian) return `a pose jump from both neighbours (${jump[k]} vs ${Math.round(around)})`;
      }
      return null;
    });
    // Never empty a group: when nearly every frame "fails", the repaint is simply unlike the donor there.
    if (drop.filter(Boolean).length >= members.length - 1) continue;
    members.forEach((cell, k) => { cell.dropped = drop[k]; });
  }
}

// Each group comes WHOLE from the sheet carrying most of its clean frames (a tie: the later sheet).
const chosen = new Map();
sources.forEach((source) => {
  const counts = new Map();
  for (const cell of all) if (cell.source === source && !cell.dropped) counts.set(cell.group, (counts.get(cell.group) ?? 0) + 1);
  for (const [group, count] of counts) if (!chosen.has(group) || count >= chosen.get(group).count) chosen.set(group, { source, count });
});
const cells = all.filter((cell) => chosen.get(cell.group)?.source === cell.source);
for (const cell of cells) if (cell.dropped) console.log(`  dropped group ${cell.group} frame ${cell.frame} (${cell.source.sheet.label}): ${cell.dropped}`);
cells.splice(0, cells.length, ...cells.filter((cell) => !cell.dropped));
for (const source of sources) {
  const groups = [...chosen].filter(([, pick]) => pick.source === source).map(([group]) => group);
  console.log(`  ${source.sheet.label} supplies groups ${groups.sort((a, b) => a - b).join(" ") || "none"}`);
}

// ---- colour: each frame's mean pulled toward the idle frames' -------------------------------------
const lit = (px, i) => Math.max(px[i], px[i + 1], px[i + 2]) > 235;
function meanColour(cell) {
  const sum = [0, 0, 0];
  let n = 0;
  for (let p = 0; p < cell.alpha.length; p += 1) {
    const i = p * 4;
    if (cell.alpha[p] < 128 || lit(cell.px, i)) continue;
    for (let k = 0; k < 3; k += 1) sum[k] += cell.px[i + k];
    n += 1;
  }
  return n ? sum.map((v) => v / n) : null;
}
const idleMeans = cells.filter((cell) => cell.group === 2).map(meanColour).filter(Boolean);
if (idleMeans.length) {
  const reference = [0, 1, 2].map((k) => idleMeans.map((m) => m[k]).sort((a, b) => a - b)[idleMeans.length >> 1]);
  for (const cell of cells) {
    const mean = meanColour(cell);
    if (!mean) continue;
    const shift = mean.map((v, k) => (reference[k] - v) * 0.8);
    for (let p = 0; p < cell.alpha.length; p += 1) {
      const i = p * 4;
      if (!cell.alpha[p] || lit(cell.px, i)) continue;
      for (let k = 0; k < 3; k += 1) cell.px[i + k] = Math.max(0, Math.min(255, cell.px[i + k] + shift[k]));
    }
  }
}

// ---- frames on the donor frame box ----------------------------------------------------------------
/** The registered figure of a cell on its sheet's padded donor frame box (guide pixels, RGBA). */
function figureOnBox(cell) {
  const { pad, boxW, boxH } = cell.source;
  const bx = cell.left - cell.box.x0 - pad;
  const by = cell.top - cell.box.y0 - pad;
  const out = new Uint8ClampedArray(boxW * boxH * 4);
  for (let y = 0; y < boxH; y += 1) {
    for (let x = 0; x < boxW; x += 1) {
      const sx = x + bx - cell.reg.dx, sy = y + by - cell.reg.dy;
      if (sx < 0 || sy < 0 || sx >= cell.box.w || sy >= cell.box.h) continue;
      const p = sy * cell.box.w + sx;
      if (!cell.alpha[p]) continue;
      const i = p * 4, o = (y * boxW + x) * 4;
      out[o] = cell.px[i]; out[o + 1] = cell.px[i + 1]; out[o + 2] = cell.px[i + 2]; out[o + 3] = cell.alpha[p];
    }
  }
  return out;
}

// The standing frame (first group-2 frame) sets the size and the feet.
const standingCell = cells.filter((cell) => cell.group === 2).sort((a, b) => a.frame - b.frame)[0] ?? cells[0];
const { pad: standingPad, boxW: standingBoxW, boxH: standingBoxH, layout: standingLayout } = standingCell.source;
const standing = figureOnBox(standingCell);
const standingMask = new Uint8Array(standingBoxW * standingBoxH);
for (let p = 0; p < standingMask.length; p += 1) standingMask[p] = standing[p * 4 + 3] >= 128 ? 1 : 0;
const standingBox = bounds(standingMask, standingBoxW, standingBoxH);
const donorStandingBox = bounds(standingCell.donor, standingCell.box.w, standingCell.box.h);
const bodyHeight = (standingBox.y1 - standingBox.y0 + 1) / standingLayout.scale;
const fit = targetHeight ? targetHeight / bodyHeight : 1;
// Generated feet below (+) / above (-) the donor's, in donor pixels.
const feetShift = (standingBox.y1 + (standingCell.top - standingCell.box.y0 - standingPad) - donorStandingBox.y1) / standingLayout.scale;
const feetFix = Math.max(-MAX_FEET_FIX, Math.min(MAX_FEET_FIX, feetShift * standingLayout.scale)) / standingLayout.scale;
// The padded box in donor pixels (the same for every sheet), then scaled by `fit`.
const donorPad = padShare * Math.max(donorFrame.width, donorFrame.height);
const frameW = Math.ceil((donorFrame.width + 2 * donorPad) * fit);
const frameH = Math.ceil((donorFrame.height + 2 * donorPad) * fit);
const anchorX = (donorFrame.anchorX + donorPad) * fit;
const anchorY = (donorFrame.anchorY + donorPad + feetFix) * fit;
console.log(`standing body ${bodyHeight.toFixed(1)} donor px -> x${fit.toFixed(3)} (${targetHeight || "donor"} px), feet ${feetShift >= 0 ? "+" : ""}${feetShift.toFixed(1)} donor px`);

async function finishFrame(cell) {
  const { boxW, boxH } = cell.source;
  // sharp premultiplies for the resize and hands back straight (un-premultiplied) colour.
  const small = await sharp(Buffer.from(figureOnBox(cell).buffer), { raw: { width: boxW, height: boxH, channels: 4 } })
    .resize(frameW, frameH, { kernel: "lanczos3", fit: "fill" })
    .raw()
    .toBuffer();
  const canvas = new Uint8ClampedArray(frameW * frameH * 4);
  for (let p = 0; p < frameW * frameH; p += 1) {
    const i = p * 4;
    // H3 creatures have 1-bit edges.
    if (small[i + 3] < 128) continue;
    canvas[i] = small[i]; canvas[i + 1] = small[i + 1]; canvas[i + 2] = small[i + 2]; canvas[i + 3] = 255;
  }
  // H3 ground shadow from this frame's silhouette, cast from the feet row (behind the body only).
  const groundY = Math.round(anchorY);
  const shadow = new Uint8Array(frameW * frameH);
  for (let y = 0; y < frameH; y += 1) {
    for (let x = 0; x < frameW; x += 1) {
      if (!canvas[(y * frameW + x) * 4 + 3]) continue;
      const rise = Math.max(0, groundY - y);
      const sx = Math.round(x + rise * SHADOW_LEAN);
      const sy = Math.round(groundY - rise * SHADOW_FLATTEN - (y > groundY ? groundY - y : 0));
      if (sx >= 0 && sx < frameW && sy >= 0 && sy < frameH) shadow[sy * frameW + sx] = 1;
    }
  }
  for (let p = 0; p < shadow.length; p += 1) if (shadow[p] && !canvas[p * 4 + 3]) canvas[p * 4 + 3] = SHADOW_ALPHA;
  return canvas;
}

// ---- groups ---------------------------------------------------------------------------------------
const carried = new Map();
for (const cell of cells) {
  if (!carried.has(cell.group)) carried.set(cell.group, new Map());
  carried.get(cell.group).set(cell.frame, await finishFrame(cell));
}
const groups = [];
for (const key of Object.keys(groupsOf)) {
  const group = Number(key);
  if (only && !only.has(group)) continue;
  let source = carried.get(group);
  let reversed = false;
  if (!source) {
    const sibling = (ALIAS[group] ?? []).find((id) => carried.has(id));
    if (sibling === undefined) continue;
    source = carried.get(sibling);
    reversed = (group === 8 && sibling === 7) || (group === 7 && sibling === 8);
  }
  // The carried frames in donor order: a subsampled group plays fewer, evenly spaced frames.
  const frames = [...source.keys()].sort((a, b) => a - b).map((frame) => source.get(frame));
  if (reversed) frames.reverse();
  groups.push({ group, frames });
}

// Crop every frame to the union box so the anchor stays one constant point.
let minX = frameW, minY = frameH, maxX = -1, maxY = -1;
for (const { frames } of groups) {
  for (const canvas of frames) {
    for (let y = 0; y < frameH; y += 1) {
      for (let x = 0; x < frameW; x += 1) {
        if (!canvas[(y * frameW + x) * 4 + 3]) continue;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
  }
}
minX = Math.max(0, minX - 1);
minY = Math.max(0, minY - 1);
maxX = Math.min(frameW - 1, maxX + 1);
maxY = Math.min(frameH - 1, Math.max(maxY, Math.ceil(anchorY)) + 1);
const cellWidth = maxX - minX + 1;
const cellHeight = maxY - minY + 1;
const columns = Math.max(...groups.map(({ frames }) => frames.length));
const atlasW = cellWidth * columns;
const atlasH = cellHeight * groups.length;
const atlas = new Uint8ClampedArray(atlasW * atlasH * 4);
groups.forEach(({ frames }, row) => frames.forEach((canvas, column) => {
  for (let y = 0; y < cellHeight; y += 1) {
    for (let x = 0; x < cellWidth; x += 1) {
      const s = ((y + minY) * frameW + x + minX) * 4;
      const o = ((row * cellHeight + y) * atlasW + column * cellWidth + x) * 4;
      atlas[o] = canvas[s]; atlas[o + 1] = canvas[s + 1]; atlas[o + 2] = canvas[s + 2]; atlas[o + 3] = canvas[s + 3];
    }
  }
}));
// One shared palette for every frame (the .def creatures are 256-colour).
const png = await sharp(Buffer.from(atlas.buffer), { raw: { width: atlasW, height: atlasH, channels: 4 } })
  .png({ palette: true, colours: 256, dither: Number(option(args, "dither", "0.35")), effort: 10 })
  .toBuffer();
const entry = {
  image: `/assets/battle-hex/creatures/${slug}.webp`,
  frameWidth: cellWidth,
  frameHeight: cellHeight,
  columns,
  anchorX: Math.round(anchorX - minX),
  anchorY: Math.round(anchorY - minY),
  groups: Object.fromEntries(groups.map(({ group, frames }, row) => [String(group), { row, frames: frames.length }]))
};
if (preview) await sharp(png).toFile(preview);
const summary = groups.map(({ group, frames }) => `${group}:${frames.length}`).join(" ");
if (dry) {
  console.log(`dry ${slug} ${cellWidth}x${cellHeight} anchor ${entry.anchorX},${entry.anchorY} groups ${summary}`);
  process.exit(0);
}

const outFile = path.join(outDir, `${slug}.webp`);
/** The shared tree sits on a drive that now and then refuses an open (UNKNOWN): retry briefly. */
function withRetry(action) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return action();
    } catch (error) {
      if (attempt >= 5 || error?.code !== "UNKNOWN") throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400 * attempt);
    }
  }
}
const meta = withRetry(() => JSON.parse(fs.readFileSync(metaFile, "utf8")));
// Only a real install (the default atlas + creature folder) keeps the replaced atlas.
const installing = !option(args, "out-dir") && !option(args, "meta");
const backupImage = path.join(BACKUP_DIR, `${slug}.webp`);
if (installing && meta[slug] && fs.existsSync(outFile) && !fs.existsSync(backupImage)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.copyFileSync(outFile, backupImage);
  fs.writeFileSync(path.join(BACKUP_DIR, `${slug}.json`), JSON.stringify(meta[slug], null, 2) + "\n");
}
await sharp(png).webp({ lossless: true, effort: 6 }).toFile(outFile);
meta[slug] = entry;
withRetry(() => fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2) + "\n"));
console.log(`wrote ${path.relative(ROOT, outFile)} ${cellWidth}x${cellHeight} anchor ${entry.anchorX},${entry.anchorY} groups ${summary}`);

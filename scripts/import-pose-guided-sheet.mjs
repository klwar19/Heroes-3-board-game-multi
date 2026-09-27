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
 *  - STILL IDLE (default; --idle sheet keeps the repainted loop): the standing
 *    loop plays all the time, and repainted idle cells differ everywhere (size,
 *    folds, face) — a figure that twitches on the spot. The loop is rebuilt
 *    from ONE standing frame (the one most like the others) breathing as H3
 *    creatures do: head and shoulders rise a pixel or two and settle, the feet
 *    and legs still.
 *  - PREFER (--prefer "0=name,4=name", manifest "prefer"): that group comes
 *    from the named sheet whenever it carries at least half its frames.
 *  - STEADY frames: a repaint redraws every cell a little differently, so a
 *    still arm or skirt shimmers ("boils") from frame to frame. After the
 *    downscale each frame is locked onto the frame before it (a group's first
 *    frame onto the standing frame): wherever a small window of the two
 *    matches — same silhouette, colours within --steady — the earlier pixels
 *    are kept exactly, so only what really moves changes. --steady 0 = off.
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
 *     [--tolerance 34] [--step 16] [--pad 0.22] [--steady 24] [--dither 0] [--idle still|sheet] [--prefer 0=<sheet name>]
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
/** A sheet painted this much bigger / smaller than the first one is rescaled to it. */
const SIZE_TOLERANCE = 0.03;
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
  // Options handed on to every import (a trial into a scratch folder, the steadiness, the dither).
  const PASS = ["out-dir", "meta", "steady", "dither"];
  const passed = PASS.flatMap((name) => (option(args, name) !== undefined ? [`--${name}`, option(args, name)] : []));
  if (args.includes("--dry")) passed.push("--dry");
  const wanted = args.slice(1).filter((arg, index, list) => !arg.startsWith("--") && !PASS.includes(list[index - 1]?.slice(2)));
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
      "--height", String(spec.height), ...(spec.groups ? ["--groups", spec.groups] : []),
      ...(spec.idle ? ["--idle", spec.idle] : []),
      ...(spec.prefer ? ["--prefer", Object.entries(spec.prefer).map(([group, name]) => `${group}=${name}`).join(",")] : []),
      ...passed
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
const steadyTolerance = Number(option(args, "steady", "24"));
const idleMode = option(args, "idle", "still");
const preferred = new Map((option(args, "prefer", "") || "").split(",").filter(Boolean).map((pair) => {
  const [group, name] = pair.split("=");
  return [Number(group), name.replace(/.png$/i, "")];
}));
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
  sources.push({ layout, sheet, guide, pad, boxW: layout.frameW + 2 * pad, boxH: layout.frameH + 2 * pad, smooth: mode === "smooth", name: path.basename(sheetPath).replace(/.png$/i, "") });
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

// ---- one size for every sheet ----------------------------------------------------------------------
/**
 * The height of a figure's BODY in a mask: the rows at least a quarter as wide
 * as its widest row, so a thin raised blade or staff does not count.
 */
function coreHeight(mask, w, h) {
  const widths = new Array(h).fill(0);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (mask[y * w + x]) widths[y] += 1;
  const floor = Math.max(...widths) * 0.25;
  let top = -1, bottom = -1;
  for (let y = 0; y < h; y += 1) if (widths[y] >= floor && widths[y] > 0) { if (top < 0) top = y; bottom = y; }
  return top < 0 ? 0 : bottom - top + 1;
}
/** How much bigger than its clay guide a sheet painted the creature (median over its cells). */
function sheetSize(source) {
  const ratios = all.filter((cell) => cell.source === source).map((cell) => {
    const body = coreHeight(cell.alpha.map((a) => (a >= 128 ? 1 : 0)), cell.box.w, cell.box.h);
    const clay = coreHeight(cell.donor, cell.box.w, cell.box.h);
    return body && clay ? body / clay : null;
  }).filter(Boolean);
  return ratios.length ? [...ratios].sort((x, y) => x - y)[ratios.length >> 1] : 1;
}
/** A cell's figure scaled by `k` about its feet (the bottom centre of its body), then registered again. */
function rescaleCell(cell, k) {
  const { w, h } = cell.box;
  const mask = cell.alpha.map((a) => (a >= 128 ? 1 : 0));
  const b = bounds(mask, w, h);
  if (!b) return;
  const fx = (b.x0 + b.x1) / 2, fy = b.y1;
  const px = new Uint8ClampedArray(w * h * 4), alpha = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const sx = (x - fx) / k + fx, sy = (y - fy) / k + fy;
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      let a = 0, r = 0, g = 0, bl = 0;
      for (const [ox, oy, wt] of [[0, 0, (1 - (sx - x0)) * (1 - (sy - y0))], [1, 0, (sx - x0) * (1 - (sy - y0))], [0, 1, (1 - (sx - x0)) * (sy - y0)], [1, 1, (sx - x0) * (sy - y0)]]) {
        const qx = x0 + ox, qy = y0 + oy;
        if (qx < 0 || qy < 0 || qx >= w || qy >= h || wt <= 0) continue;
        const q = qy * w + qx, qa = cell.alpha[q] * wt;
        a += qa; r += cell.px[q * 4] * qa; g += cell.px[q * 4 + 1] * qa; bl += cell.px[q * 4 + 2] * qa;
      }
      const p = y * w + x;
      alpha[p] = Math.round(a);
      if (a > 0) { px[p * 4] = r / a; px[p * 4 + 1] = g / a; px[p * 4 + 2] = bl / a; }
      px[p * 4 + 3] = 255;
    }
  }
  cell.px = px;
  cell.alpha = alpha;
  cell.reg = register(alpha, cell.donor, w, h);
}
{
  // Every sheet at the size of the first (the base sheet, which sets the standing size's family).
  const sizes = sources.map(sheetSize);
  sources.forEach((source, index) => {
    const k = sizes[0] / sizes[index];
    const note = Math.abs(k - 1) > SIZE_TOLERANCE ? `scaled x${k.toFixed(3)} to the first sheet's size` : "kept";
    console.log(`  ${source.sheet.label}: painted x${sizes[index].toFixed(3)} the clay body, ${note}`);
    if (Math.abs(k - 1) > SIZE_TOLERANCE) for (const cell of all) if (cell.source === source) rescaleCell(cell, k);
  });
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
for (const [group, name] of preferred) {
  const source = sources.find((candidate) => candidate.name === name);
  if (!source) throw new Error(`--prefer ${group}=${name}: no such sheet`);
  const carriedCount = all.filter((cell) => cell.source === source && cell.group === group).length;
  const clean = all.filter((cell) => cell.source === source && cell.group === group && !cell.dropped).length;
  if (clean > 0 && clean * 2 >= carriedCount) chosen.set(group, { source, count: clean });
  else console.log(`  --prefer ${group}=${name}: only ${clean} of ${carriedCount} frames clean, not preferred`);
}
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
  return canvas;
}

/** H3 ground shadow from a frame's silhouette, cast from the feet row (behind the body only). */
function castShadow(canvas) {
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

// ---- steady frames ---------------------------------------------------------------------------------
/** Half-width of the window two frames must match in to share pixels (5x5). */
const STEADY_RADIUS = 2;
/** Most silhouette disagreement a matching window may hold (share of its pixels). */
const STEADY_EDGE_SHARE = 0.12;
/** A frame is locked only when at least this share of it matches the frame before. */
const STEADY_MIN_SHARE = 0.4;
/**
 * `cur` locked onto `ref` (both frameW x frameH, 1-bit alpha): every pixel
 * whose window matches in both frames takes ref's pixel (colour and alpha).
 * A moving part differs in its window (colour or silhouette) and stays.
 */
function steadyFrame(ref, cur) {
  const W = frameW, H = frameH, R = STEADY_RADIUS;
  const IW = W + 1;
  const diff = new Float64Array(IW * (H + 1)), both = new Float64Array(IW * (H + 1)), edge = new Float64Array(IW * (H + 1));
  for (let y = 0; y < H; y += 1) {
    let rowDiff = 0, rowBoth = 0, rowEdge = 0;
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 4;
      const a = ref[i + 3] > 0, b = cur[i + 3] > 0;
      if (a && b) {
        rowBoth += 1;
        rowDiff += Math.max(Math.abs(ref[i] - cur[i]), Math.abs(ref[i + 1] - cur[i + 1]), Math.abs(ref[i + 2] - cur[i + 2]));
      } else if (a !== b) rowEdge += 1;
      const o = (y + 1) * IW + x + 1;
      diff[o] = diff[o - IW] + rowDiff; both[o] = both[o - IW] + rowBoth; edge[o] = edge[o - IW] + rowEdge;
    }
  }
  const sum = (table, x0, y0, x1, y1) => table[(y1 + 1) * IW + x1 + 1] - table[y0 * IW + x1 + 1] - table[(y1 + 1) * IW + x0] + table[y0 * IW + x0];
  const out = new Uint8ClampedArray(cur);
  let kept = 0, opaque = 0;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 4;
      if (!ref[i + 3] && !cur[i + 3]) continue;
      opaque += 1;
      const x0 = Math.max(0, x - R), y0 = Math.max(0, y - R), x1 = Math.min(W - 1, x + R), y1 = Math.min(H - 1, y + R);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const n = sum(both, x0, y0, x1, y1);
      if (n < area * 0.3) continue;
      if (sum(edge, x0, y0, x1, y1) > area * STEADY_EDGE_SHARE) continue;
      if (sum(diff, x0, y0, x1, y1) / n > steadyTolerance) continue;
      out[i] = ref[i]; out[i + 1] = ref[i + 1]; out[i + 2] = ref[i + 2]; out[i + 3] = ref[i + 3];
      kept += 1;
    }
  }
  return { canvas: out, share: opaque ? kept / opaque : 0 };
}

// ---- groups ---------------------------------------------------------------------------------------
const carried = new Map();
for (const cell of cells) {
  if (!carried.has(cell.group)) carried.set(cell.group, new Map());
  carried.get(cell.group).set(cell.frame, await finishFrame(cell));
}
/** The standing body's height in final pixels. */
const bodyPx = bodyHeight * fit;

// ---- loose pieces ----------------------------------------------------------------------------------
/**
 * A piece of a quiet frame smaller than this share of its body, standing apart
 * from it WHOLLY AT FOOT LEVEL, is a scrap (sheer hem cloth cut off by the
 * key) — unless the frames next to it carry nearly all of it too. Anything
 * higher (a halo, a floating part of the design, a spark) always stays.
 */
const SCRAP_SHARE = 0.04;
/** Share of a piece's pixels the neighbouring frames must also cover for it to stay. */
const SCRAP_KEEP_COVER = 0.8;
/** `canvas` without the small flickering pieces apart from its body (8-connected, final pixels). */
function dropScraps(canvas, neighbours) {
  const label = new Int32Array(frameW * frameH).fill(-1);
  const sizes = [], tops = [];
  // A small piece lying wholly at foot level is cloth cut off the hem, never a design part.
  const footBand = anchorY - 0.12 * bodyPx;
  for (let p = 0; p < label.length; p += 1) {
    if (!canvas[p * 4 + 3] || label[p] >= 0) continue;
    const id = sizes.length;
    const stack = [p];
    label[p] = id;
    let n = 0, top = frameH;
    while (stack.length) {
      const q = stack.pop();
      n += 1;
      const x = q % frameW, y = (q / frameW) | 0;
      top = Math.min(top, y);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= frameW || ny >= frameH) continue;
          const r = ny * frameW + nx;
          if (canvas[r * 4 + 3] && label[r] < 0) { label[r] = id; stack.push(r); }
        }
      }
    }
    sizes.push(n);
    tops.push(top);
  }
  if (sizes.length < 2) return 0;
  const floor = Math.max(...sizes) * SCRAP_SHARE;
  // Pixels of each small piece the neighbouring frames also cover.
  const covered = new Array(sizes.length).fill(0);
  for (let p = 0; p < label.length; p += 1) {
    if (label[p] < 0 || sizes[label[p]] >= floor) continue;
    if (neighbours.some((other) => other[p * 4 + 3] > 0)) covered[label[p]] += 1;
  }
  const scrap = sizes.map((n, id) => n < floor && tops[id] >= footBand && !(neighbours.length && covered[id] >= n * SCRAP_KEEP_COVER));
  let dropped = 0;
  for (let p = 0; p < label.length; p += 1) {
    if (label[p] >= 0 && scrap[label[p]]) { canvas[p * 4 + 3] = 0; dropped += 1; }
  }
  return dropped;
}
{
  let scraps = 0;
  for (const [group, framesOf] of carried) {
    if (!QUIET_GROUPS.has(group)) continue;
    const keys = [...framesOf.keys()].sort((a, b) => a - b);
    // Judge every frame against the ORIGINAL neighbours (before any piece is dropped).
    const originals = keys.map((key) => new Uint8ClampedArray(framesOf.get(key)));
    keys.forEach((key, k) => {
      const neighbours = [originals[k - 1], originals[k + 1]].filter(Boolean);
      scraps += dropScraps(framesOf.get(key), neighbours);
    });
  }
  if (scraps) console.log(`  loose scraps removed from the quiet groups: ${scraps} px`);
}

// ---- still idle ------------------------------------------------------------------------------------
/**
 * `canvas` breathing: rows above the waist rise by up to `lift` px (the
 * head and shoulders the full lift, easing to nothing at the waist), the legs
 * and feet untouched.
 */
function breathe(canvas, lift) {
  if (lift <= 0) return new Uint8ClampedArray(canvas);
  const waist = anchorY - 0.5 * bodyPx;
  const chest = anchorY - 0.75 * bodyPx;
  const out = new Uint8ClampedArray(canvas.length);
  for (let y = 0; y < frameH; y += 1) {
    const weight = y >= waist ? 0 : y <= chest ? 1 : (waist - y) / (waist - chest);
    const sy = Math.min(frameH - 1, Math.round(y + lift * weight));
    out.set(canvas.subarray(sy * frameW * 4, (sy + 1) * frameW * 4), y * frameW * 4);
  }
  return out;
}
const idleFrames = carried.get(2);
if (idleMode === "still" && idleFrames && idleFrames.size > 1) {
  const keys = [...idleFrames.keys()].sort((a, b) => a - b);
  const distance = (a, b) => {
    let d = 0;
    for (let i = 0; i < a.length; i += 4) {
      const oa = a[i + 3] > 0, ob = b[i + 3] > 0;
      if (oa !== ob) d += 255;
      else if (oa) d += Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
    }
    return d;
  };
  // The medoid: the idle frame most like all the others (the calmest rendering).
  let masterKey = keys[0], best = Infinity;
  for (const key of keys) {
    const total = keys.reduce((sum, other) => sum + (other === key ? 0 : distance(idleFrames.get(key), idleFrames.get(other))), 0);
    if (total < best) { best = total; masterKey = key; }
  }
  const master = idleFrames.get(masterKey);
  const maxLift = bodyPx >= 100 ? 2 : 1;
  const count = keys.length;
  keys.forEach((key, k) => {
    const rise = 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / count);
    idleFrames.set(key, breathe(master, Math.round(maxLift * rise - 0.01)));
  });
  console.log(`  still idle: ${count} frames from idle frame ${masterKey}, breathing up to ${maxLift} px`);
}

if (steadyTolerance > 0) {
  // The standing frame first (every clip starts from and returns to it), then each group in frame order.
  const standingFrames = carried.get(2);
  const standingKey = standingFrames ? Math.min(...standingFrames.keys()) : undefined;
  const base = standingKey === undefined ? null : standingFrames.get(standingKey);
  const report = [];
  for (const [group, framesOf] of [...carried].sort(([a], [b]) => a - b)) {
    const keys = [...framesOf.keys()].sort((a, b) => a - b);
    let previous = group === 2 ? null : base;
    const shares = [];
    for (const key of keys) {
      if (group === 2 && (key === standingKey || idleMode === "still")) {
        previous = framesOf.get(key);
        continue;
      }
      if (!previous) {
        previous = framesOf.get(key);
        continue;
      }
      const { canvas, share } = steadyFrame(previous, framesOf.get(key));
      // Only a frame mostly like the one before takes its pixels: patching a
      // wholly different rendering would mix two drawings in one frame.
      const alike = share >= STEADY_MIN_SHARE;
      if (alike) framesOf.set(key, canvas);
      previous = framesOf.get(key);
      shares.push(`${Math.round(share * 100)}${alike ? "" : "x"}`);
    }
    report.push(`${group}:${shares.join("/") || "-"}`);
  }
  console.log(`  steady (% of each frame kept from the one before): ${report.join(" ")}`);
}
for (const framesOf of carried.values()) for (const [key, canvas] of framesOf) framesOf.set(key, castShadow(canvas));
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
  .png({ palette: true, colours: 256, dither: Number(option(args, "dither", "0")), effort: 10 })
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

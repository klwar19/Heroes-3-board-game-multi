#!/usr/bin/env node
/**
 * Restia (single-player life-sim mode) art pipeline.
 *
 * Codex image_gen masters live in tmp/gen/restia/raw (git-ignored; regenerate them with
 * scripts/restia/codex-gen-batch.mjs from the prompts in scripts/restia/codex-jobs.json). This script turns them into the runtime webps under
 * public/assets/restia/ (gitignored; published to R2 with `npm run media:publish`):
 *
 *   node scripts/restia/build-restia-assets.mjs [--only tachie,bin,backdrops,buildings,sheets,cropSheets,battle,battleArt,feet]
 *     [--names hilda,bin]   (only those characters' tachie and battle sheets)
 *
 * Backgrounds are keyed by flood-filling from each cell's border over pixels
 * close to the border's median colour (Codex paints flat backdrops, not alpha).
 * hv13 portraits are painted on a green or magenta chroma screen instead, which
 * keyChroma removes everywhere, not only where it touches the border.
 * Battle sheets go through scripts/import-sprite-sheet.mjs (H3 atlas format)
 * into src/restia/data/battle-atlases.json.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
sharp.cache(false);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RAW = path.join(ROOT, "tmp", "gen", "restia", "raw");
const OUT = path.join(ROOT, "public", "assets", "restia");

const onlyArg = process.argv.indexOf("--only");
const ONLY = onlyArg >= 0 ? new Set(process.argv[onlyArg + 1].split(",")) : null;
const want = (step) => !ONLY || ONLY.has(step);
// --names hilda,bin: rebuild only those characters' tachie and battle sheets.
const namesArg = process.argv.indexOf("--names");
const NAMES = namesArg >= 0 ? new Set(process.argv[namesArg + 1].split(",")) : null;
const wantName = (name) => !NAMES || NAMES.has(name);

/** First master that exists (later passes first: hv5- portraits replace hv- drafts). */
function rawFirst(...names) {
  for (const name of names) {
    const file = path.join(RAW, `${name}.png`);
    if (fs.existsSync(file)) return file;
  }
  console.warn(`  (missing ${names.join(" / ")} - skipped)`);
  return null;
}

function raw(name) {
  const file = path.join(RAW, `${name}.png`);
  if (!fs.existsSync(file)) {
    console.warn(`  (missing ${name}.png - skipped)`);
    return null;
  }
  return file;
}

function out(rel) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return file;
}

async function rgba(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * Keys the backdrop of the rectangle [x0,y0,x1,y1) out of `img` in place.
 * `tol` = max colour distance from the border median; `step` = max colour step
 * between neighbouring backdrop pixels; `seedSides` limits which borders seed.
 */
function keyRect(img, x0, y0, x1, y1, { tol = 34, step = 20, seedSides = "tlrb", seedTol = tol } = {}) {
  const { data, width } = img;
  const idx = (x, y) => (y * width + x) * 4;
  const border = [];
  for (let x = x0; x < x1; x++) {
    border.push(idx(x, y0), idx(x, y1 - 1));
  }
  for (let y = y0; y < y1; y++) {
    border.push(idx(x0, y), idx(x1 - 1, y));
  }
  const channel = (c) => {
    const values = border.map((i) => data[i + c]).sort((a, b) => a - b);
    return values[values.length >> 1];
  };
  const bg = [channel(0), channel(1), channel(2)];
  const dist = (i, ref) => Math.hypot(data[i] - ref[0], data[i + 1] - ref[1], data[i + 2] - ref[2]);
  const w = x1 - x0;
  const h = y1 - y0;
  const seen = new Uint8Array(w * h);
  const stack = [];
  const seed = (x, y) => {
    const i = idx(x, y);
    const k = (y - y0) * w + (x - x0);
    if (!seen[k] && dist(i, bg) <= seedTol) {
      seen[k] = 1;
      stack.push(x, y);
    }
  };
  if (seedSides.includes("t")) for (let x = x0; x < x1; x++) seed(x, y0);
  if (seedSides.includes("b")) for (let x = x0; x < x1; x++) seed(x, y1 - 1);
  if (seedSides.includes("l")) for (let y = y0; y < y1; y++) seed(x0, y);
  if (seedSides.includes("r")) for (let y = y0; y < y1; y++) seed(x1 - 1, y);
  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    const i = idx(x, y);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < x0 || ny < y0 || nx >= x1 || ny >= y1) continue;
      const k = (ny - y0) * w + (nx - x0);
      if (seen[k]) continue;
      const j = idx(nx, ny);
      if (dist(j, bg) <= tol && Math.hypot(data[j] - data[i], data[j + 1] - data[i + 1], data[j + 2] - data[i + 2]) <= step) {
        seen[k] = 1;
        stack.push(nx, ny);
      }
    }
  }
  // Clear the backdrop, then soften the fringe that still carries backdrop colour.
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (seen[(y - y0) * w + (x - x0)]) data[idx(x, y) + 3] = 0;
    }
  }
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const k = (y - y0) * w + (x - x0);
      if (seen[k]) continue;
      let touches = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < x0 || ny < y0 || nx >= x1 || ny >= y1) continue;
        if (seen[(ny - y0) * w + (nx - x0)]) touches = true;
      }
      if (touches) {
        const i = idx(x, y);
        const d = dist(i, bg);
        data[i + 3] = Math.min(data[i + 3], Math.round(Math.min(1, d / (tol * 2.2)) * 255));
      }
    }
  }
}

/**
 * Clears enclosed backdrop pockets (e.g. between a spear and the body) that the
 * border flood cannot reach: connected regions of near-pure white larger than
 * `minSize` pixels. Small white highlights inside the art are kept.
 */
function keyEnclosedWhite(img, { threshold = 248, minSize = 350 } = {}) {
  const { data, width, height } = img;
  const white = (p) => data[p * 4 + 3] > 0 && data[p * 4] >= threshold && data[p * 4 + 1] >= threshold && data[p * 4 + 2] >= threshold;
  const seen = new Uint8Array(width * height);
  for (let start = 0; start < width * height; start++) {
    if (seen[start] || !white(start)) continue;
    const region = [start];
    seen[start] = 1;
    for (let k = 0; k < region.length; k++) {
      const p = region[k];
      const x = p % width;
      const y = (p - x) / width;
      const next = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1];
      for (const q of next) {
        if (q >= 0 && !seen[q] && white(q)) {
          seen[q] = 1;
          region.push(q);
        }
      }
    }
    if (region.length >= minSize) for (const p of region) data[p * 4 + 3] = 0;
  }
}

/**
 * Clears backdrop pockets trapped between hair strands (the border flood cannot reach
 * them, and a plain enclosed-white pass also eats white clothes). A pocket = connected
 * near-backdrop pixels still opaque after keyRect; it is cleared only when the ring
 * 3-6 px around it (opaque pixels only) is mostly this character's hair colour (`anchors`), so white
 * robes, aprons and hems (ringed by fabric) stay. Opt-in per character: see HAIR_POCKETS.
 */
function keyHairPockets(img, anchors, { tol = 60, minFrac = 0.4, minSize = 150, bgTol = 12, reach = 16, ignoreLight, sliver = true } = {}) {
  const { data, width, height } = img;
  const n = width * height;
  const border = [];
  for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) border.push(y * width, y * width + width - 1);
  const median = (c) => {
    const values = border.map((p) => data[p * 4 + c]).sort((a, b) => a - b);
    return values[values.length >> 1];
  };
  const bg = [median(0), median(1), median(2)];
  const dist = (p, ref) => Math.hypot(data[p * 4] - ref[0], data[p * 4 + 1] - ref[1], data[p * 4 + 2] - ref[2]);
  const around = (p) => {
    const x = p % width;
    const y = (p - x) / width;
    return [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1];
  };
  const candidate = (p) => data[p * 4 + 3] > 0 && dist(p, bg) <= bgTol;
  // Chamfer distance (px) to the keyed backdrop: a real hair pocket sits within `reach` of it,
  // eye whites and white collars lie deep inside the figure and are never touched.
  const far = new Float32Array(n).fill(1e9);
  for (let p = 0; p < n; p++) if (data[p * 4 + 3] === 0) far[p] = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x;
    if (x > 0) far[p] = Math.min(far[p], far[p - 1] + 1);
    if (y > 0) far[p] = Math.min(far[p], far[p - width] + 1, x > 0 ? far[p - width - 1] + 1.4 : 1e9, x < width - 1 ? far[p - width + 1] + 1.4 : 1e9);
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const p = y * width + x;
    if (x < width - 1) far[p] = Math.min(far[p], far[p + 1] + 1);
    if (y < height - 1) far[p] = Math.min(far[p], far[p + width] + 1, x < width - 1 ? far[p + width + 1] + 1.4 : 1e9, x > 0 ? far[p + width - 1] + 1.4 : 1e9);
  }
  const seen = new Uint8Array(n);
  const cleared = new Uint8Array(n);
  for (let start = 0; start < n; start++) {
    if (seen[start] || !candidate(start)) continue;
    const region = [start];
    seen[start] = 1;
    for (let k = 0; k < region.length; k++) {
      for (const q of around(region[k])) {
        if (q >= 0 && !seen[q] && candidate(q)) {
          seen[q] = 1;
          region.push(q);
        }
      }
    }
    // Below minSize only thin slivers (backdrop showing through a gap between two strands:
    // long and at most ~3 px thick) qualify; round specks such as eye whites never do.
    if (region.length < minSize) {
      if (!sliver || region.length < 12) continue;
      let x0 = width, x1 = 0, y0 = height, y1 = 0;
      for (const p of region) {
        const x = p % width;
        const y = (p - x) / width;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      const length = Math.hypot(x1 - x0 + 1, y1 - y0 + 1);
      if (length < 10 || region.length / length > 3) continue;
    }
    // Big pockets (between twin tails) may sit behind a thick strand; small ones (eye whites) may not.
    const limit = region.length >= 2500 ? reach * 8 : reach;
    if (!region.some((p) => far[p] <= limit)) continue;
    const depth = new Map(region.map((p) => [p, 0]));
    let frontier = region;
    let hair = 0;
    let total = 0;
    for (let d = 1; d <= 6; d++) {
      const next = [];
      for (const p of frontier) {
        for (const q of around(p)) {
          if (q < 0 || depth.has(q)) continue;
          depth.set(q, d);
          next.push(q);
          // Transparent pixels (already-keyed backdrop past a thin outer strand) don't vote.
          // `ignoreLight`: near-white anti-aliased fringe (every channel >= it) doesn't vote either.
          if (d >= 3 && data[q * 4 + 3] > 0 &&
              !(ignoreLight !== undefined && Math.min(data[q * 4], data[q * 4 + 1], data[q * 4 + 2]) >= ignoreLight)) {
            total++;
            if (anchors.some((a) => dist(q, a) <= tol)) hair++;
          }
        }
      }
      frontier = next;
    }
    if (hair / Math.max(1, total) < minFrac) continue;
    for (const p of region) {
      data[p * 4 + 3] = 0;
      cleared[p] = 1;
    }
  }
  // Soften the fringe around cleared pockets like keyRect does (tol 20 -> 44).
  for (let p = 0; p < n; p++) {
    if (cleared[p] || data[p * 4 + 3] === 0) continue;
    if (around(p).some((q) => q >= 0 && cleared[q])) {
      data[p * 4 + 3] = Math.min(data[p * 4 + 3], Math.round(Math.min(1, dist(p, bg) / 44) * 255));
    }
  }
}

/**
 * Characters whose white-backdrop portraits trap backdrop between hair strands, with
 * their hair colours (RGB). Jess (white hair), Mitia and Lysa (pale hair against white
 * robes/dress) are left out: the ring test cannot tell their hair from their clothes.
 * Senna needs the stricter 0.6 ring (white kimono highlights next to lavender hair).
 */
const HAIR_POCKETS = {
  // Peri: her twin-tail loops enclose pockets deep inside the hair (180+ px from the backdrop); no eye-white risk (galaxy eyes).
  peri: { anchors: [[40, 38, 60], [30, 30, 45], [50, 70, 190], [70, 110, 230], [60, 60, 110]], reach: 1e6 },
  // Luna: lighter strand highlights too; minSize 100 still spares the pearl earring.
  // hv12 redesign (ashy brown hair): the cool grey-brown strands and pockets up to ~130 px
  // inside the long hair need the extra anchors, a wider reach, and a ring vote that
  // skips the near-white strand fringe (her white top and cup keep a mostly non-hair ring).
  luna: { anchors: [[110, 85, 80], [80, 60, 55], [150, 120, 110], [60, 45, 45], [175, 150, 140], [195, 175, 165], [120, 110, 105], [95, 85, 82], [140, 128, 122], [75, 68, 66]], minSize: 100, reach: 150, ignoreLight: 215, minFrac: 0.5 },
  lily: { anchors: [[45, 45, 70], [70, 70, 110], [30, 30, 50]] },
  lingling: { anchors: [[30, 30, 45], [65, 68, 95], [15, 15, 25]] },
  frida: { anchors: [[25, 25, 35], [60, 60, 80], [10, 10, 20]] },
  senna: { anchors: [[170, 160, 220], [140, 130, 200], [200, 195, 235]], minFrac: 0.6 },
  meilin: { anchors: [[240, 200, 120], [220, 170, 90], [250, 225, 160]] },
  hilda: { anchors: [[60, 55, 45], [40, 38, 35], [85, 75, 60]] },
  // Zhao Kang (black hair) and Tessa (auburn): backdrop trapped in the hair crowns.
  zhaokang: { anchors: [[25, 25, 30], [50, 50, 60], [10, 10, 15], [75, 75, 85]], reach: 40 },
  tessa: { anchors: [[170, 70, 50], [200, 95, 70], [130, 50, 40], [220, 130, 100], [100, 40, 35]], reach: 40 }
};

function keyHairPocketsFor(img, name) {
  const config = HAIR_POCKETS[name.split("-")[0]];
  if (config) keyHairPockets(img, config.anchors, config);
}

function toSharp(img) {
  return sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } });
}

/** Opaque bounding box of a region (alpha > 24). */
function bbox(img, x0, y0, x1, y1) {
  let minX = x1;
  let minY = y1;
  let maxX = -1;
  let maxY = -1;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] > 24) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function cellsOf(file, cols, rows, keyOpts, skipKey = new Set()) {
  const img = await rgba(file);
  const cw = img.width / cols;
  const ch = img.height / rows;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = Math.round(c * cw);
      const y0 = Math.round(r * ch);
      const x1 = Math.round((c + 1) * cw);
      const y1 = Math.round((r + 1) * ch);
      if (!skipKey.has(r * cols + c)) keyRect(img, x0, y0, x1, y1, keyOpts);
      cells.push({ x0, y0, x1, y1 });
    }
  }
  return { img, cells };
}

/** Extract region -> PNG buffer. */
async function extract(img, box) {
  return toSharp(img).extract(box).png().toBuffer();
}

// ---------------------------------------------------------------------------

/** Haven cast standing art (Codex masters on a flat backdrop). Bin is handled by binFaces(). */
const TACHIE_NAMES = ["peri", "system", "garr", "bowy", "mitia", "lysa", "hilda", "senna", "mara", "frida", "tilde", "dain", "tessa", "lily", "luna", "leo", "meilin", "jake",
  // hv11: Earth-prologue side cast and the Eos tutorial villager.
  "lingling", "chad", "nurse", "oldzhou", "zhaokang", "gymbro", "repairman", "villager"];

/**
 * Removes the pale halo the keyed backdrop leaves on hair strands and other dark edges:
 * an edge pixel (within `maxFar` px of the keyed backdrop) that is a blend of the
 * backdrop and a darker pixel just inside it (the most backdrop-distant opaque pixel
 * `radius` px around, deeper than it) gets the matte solved from that pair
 * (obs = a*ink + (1-a)*backdrop) and its colour un-blended. Pale ink (white clothes,
 * white hair, holograms: under `minInk` from the backdrop) is left as it was, and a
 * white fill behind line art never qualifies because its deeper neighbours are pale too.
 */
function defringeBackdrop(img, { maxFar = 2.5, radius = 2, minInk = 80 } = {}) {
  const { data, width, height } = img;
  const n = width * height;
  const border = [];
  for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) border.push(y * width, y * width + width - 1);
  const median = (c) => {
    const values = border.map((p) => data[p * 4 + c]).sort((a, b) => a - b);
    return values[values.length >> 1];
  };
  const bg = [median(0), median(1), median(2)];
  const ink = (p) => Math.hypot(data[p * 4] - bg[0], data[p * 4 + 1] - bg[1], data[p * 4 + 2] - bg[2]);
  const far = new Float32Array(n).fill(1e9);
  for (let p = 0; p < n; p++) if (data[p * 4 + 3] === 0) far[p] = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x;
    if (x > 0) far[p] = Math.min(far[p], far[p - 1] + 1);
    if (y > 0) far[p] = Math.min(far[p], far[p - width] + 1, x > 0 ? far[p - width - 1] + 1.4 : 1e9, x < width - 1 ? far[p - width + 1] + 1.4 : 1e9);
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const p = y * width + x;
    if (x < width - 1) far[p] = Math.min(far[p], far[p + 1] + 1);
    if (y < height - 1) far[p] = Math.min(far[p], far[p + width] + 1, x < width - 1 ? far[p + width + 1] + 1.4 : 1e9, x > 0 ? far[p + width - 1] + 1.4 : 1e9);
  }
  const out = new Uint8ClampedArray(data);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x;
    if (data[p * 4 + 3] === 0 || far[p] > maxFar) continue;
    let best = -1;
    let bestInk = 0;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const qx = x + dx;
      const qy = y + dy;
      if (qx < 0 || qy < 0 || qx >= width || qy >= height) continue;
      const q = qy * width + qx;
      if (data[q * 4 + 3] < 255 || far[q] <= far[p]) continue;
      const k = ink(q);
      if (k > bestInk) { bestInk = k; best = q; }
    }
    if (best < 0 || bestInk < minInk || ink(p) >= bestInk * 0.92) continue;
    let dot = 0;
    for (let c = 0; c < 3; c++) dot += (bg[c] - data[p * 4 + c]) * (bg[c] - data[best * 4 + c]);
    const a = Math.max(0, Math.min(1, dot / (bestInk * bestInk)));
    for (let c = 0; c < 3; c++) {
      out[p * 4 + c] = a >= 0.08 ? (data[p * 4 + c] - (1 - a) * bg[c]) / a : data[best * 4 + c];
    }
    out[p * 4 + 3] = Math.min(data[p * 4 + 3], Math.round(a * 255));
  }
  data.set(out);
}

/**
 * Keys a flat chroma screen (pure green or magenta, read from the border median) out of
 * `img` in place. The screen colour never occurs in the art, so it is removed everywhere,
 * including gaps enclosed by hair strands, fingers and arms that a border flood cannot
 * reach. Pixels at least `core` of the screen's own key strength are backdrop; opaque
 * pixels within `band` px of the backdrop get their matte solved against the screen
 * (obs = a*ink + (1-a)*screen) and the screen spill removed. Deeper pixels at least
 * `sheer` strong are the screen showing through sheer fabric (a mesh sleeve) or darkened
 * behind overlapping hair: they become translucent. On green screens weaker green tints
 * deeper inside lose their green too. Each character is screened in a colour they do not
 * wear, so no drawn colour should be affected (checked against the white-backdrop
 * masters; Tilde's potion is real magenta, so her art passes `sheer: Infinity`).
 */
function keyChroma(img, { core = 0.55, band = 3, lo = 16, speck = 40, radius = 3, sheer } = {}) {
  const { data, width, height } = img;
  const n = width * height;
  const border = [];
  for (let x = 0; x < width; x++) border.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) border.push(y * width, y * width + width - 1);
  const median = (c) => {
    const values = border.map((p) => data[p * 4 + c]).sort((a, b) => a - b);
    return values[values.length >> 1];
  };
  const screen = [median(0), median(1), median(2)];
  const green = screen[1] > screen[0] && screen[1] > screen[2];
  const strength = (r, g, b) => (green ? g - Math.max(r, b) : Math.min(r, b) - g);
  const full = strength(...screen);
  if (full < 120) throw new Error(`keyChroma: border median ${screen} is not a chroma screen`);
  sheer ??= green ? 48 : 60;
  const src = Uint8Array.from(data);
  const keyOf = (p) => strength(src[p * 4], src[p * 4 + 1], src[p * 4 + 2]);
  const back = new Uint8Array(n);
  for (let p = 0; p < n; p++) if (keyOf(p) >= core * full) back[p] = 1;
  // Opaque specks floating in the screen (generation noise) join the backdrop.
  const seen = new Uint8Array(n);
  for (let start = 0; start < n; start++) {
    if (back[start] || seen[start]) continue;
    const island = [start];
    seen[start] = 1;
    for (let i = 0; i < island.length; i++) {
      const p = island[i];
      const x = p % width;
      for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) {
        if (q >= 0 && q < n && !back[q] && !seen[q]) {
          seen[q] = 1;
          island.push(q);
        }
      }
    }
    if (island.length <= speck) for (const p of island) back[p] = 1;
  }
  const far = new Float32Array(n).fill(1e9);
  for (let p = 0; p < n; p++) if (back[p]) far[p] = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x;
    if (x > 0) far[p] = Math.min(far[p], far[p - 1] + 1);
    if (y > 0) far[p] = Math.min(far[p], far[p - width] + 1, x > 0 ? far[p - width - 1] + 1.4 : 1e9, x < width - 1 ? far[p - width + 1] + 1.4 : 1e9);
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const p = y * width + x;
    if (x < width - 1) far[p] = Math.min(far[p], far[p + 1] + 1);
    if (y < height - 1) far[p] = Math.min(far[p], far[p + width] + 1, x < width - 1 ? far[p + width + 1] + 1.4 : 1e9, x > 0 ? far[p + width - 1] + 1.4 : 1e9);
  }
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    if (back[p]) {
      data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
      continue;
    }
    const k = keyOf(p);
    if (k <= lo) continue;
    if (far[p] > band) {
      if (k <= sheer) {
        if (green) data[i + 1] = Math.max(src[i], src[i + 2]);
        continue;
      }
      const a = Math.max(0, Math.min(1, 1 - (k - sheer) / (full - sheer)));
      const ink = [0, 1, 2].map((c) => Math.max(0, Math.min(255, (src[i + c] - (1 - a) * screen[c]) / Math.max(a, 0.04))));
      const spill = strength(...ink);
      if (spill > 0) {
        if (green) ink[1] -= spill;
        else {
          ink[0] -= spill;
          ink[2] -= spill;
        }
      }
      for (let c = 0; c < 3; c++) data[i + c] = Math.round(ink[c]);
      data[i + 3] = Math.round(a * 255);
      continue;
    }
    // Matte against the nearest clean pixel deeper inside the figure (obs = a*ink + (1-a)*screen);
    // without one, assume ink with no key colour in it.
    const x = p % width;
    const y = (p - x) / width;
    let ref = -1;
    let refDist = 1e9;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const qx = x + dx;
      const qy = y + dy;
      if (qx < 0 || qy < 0 || qx >= width || qy >= height) continue;
      const q = qy * width + qx;
      const dist = dx * dx + dy * dy;
      if (back[q] || far[q] <= far[p] || keyOf(q) > lo || dist >= refDist) continue;
      ref = q;
      refDist = dist;
    }
    let a;
    if (ref >= 0) {
      let dot = 0;
      let len = 0;
      for (let c = 0; c < 3; c++) {
        dot += (screen[c] - src[i + c]) * (screen[c] - src[ref * 4 + c]);
        len += (screen[c] - src[ref * 4 + c]) ** 2;
      }
      a = len > 0 ? Math.max(0, Math.min(1, dot / len)) : 1;
    } else a = Math.max(0, Math.min(1, 1 - (k - lo) / (full - lo)));
    if (a < 0.04) {
      data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
      continue;
    }
    const ink = [0, 1, 2].map((c) => Math.max(0, Math.min(255, (src[i + c] - (1 - a) * screen[c]) / a)));
    const spill = strength(...ink);
    if (spill > 0) {
      if (green) ink[1] -= spill;
      else {
        ink[0] -= spill;
        ink[2] -= spill;
      }
    }
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(ink[c]);
    data[i + 3] = Math.min(data[i + 3], Math.round(a * 255));
  }
}

/**
 * Codex sometimes returns a fresh (non-edit) image with real alpha instead of the asked-for
 * screen. Such a master keeps its alpha (its opaque pixels come back at 251-253, so they are
 * made solid); anything else is a chroma screen and goes through keyChroma.
 */
function keyChromaOrAlpha(img, options) {
  let clear = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] === 0) clear++;
  if (clear < img.width * img.height * 0.1) return keyChroma(img, options);
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] >= 248) img.data[i] = 255;
}

/** Tilde's potion is a drawn magenta: her art keeps it opaque. */
const chromaOptions = (name) => (name.split("-")[0] === "tilde" ? { sheer: Infinity } : {});

/** Runtime portraits written from hv13 masters in this run (the Bin step skips those). */
const builtHv13 = new Set();

/** An hv13 portrait master (chroma screen or real alpha) -> runtime tachie. */
async function writeHv13Tachie(file, name) {
  const img = await rgba(file);
  keyChromaOrAlpha(img, chromaOptions(name));
  await writeTachie(img, name, { defringe: false });
}

async function writeTachie(img, name, { defringe = true } = {}) {
  if (defringe) defringeBackdrop(img);
  const box = bbox(img, 0, 0, img.width, img.height);
  const buffer = await extract(img, box);
  await sharp(buffer).resize({ height: 1280, withoutEnlargement: true }).webp({ quality: 84, alphaQuality: 90 }).toFile(out(`tachie/${name}.webp`));
  console.log(`tachie ${name}`);
}

/**
 * hv12 portraits: tmp/gen/restia/raw/hv12-tachie-<name>[-vN].png, where <name> is the
 * runtime file name (<base>[-<outfit>][-<face>], e.g. luna-blush, peri-casual, bin-earth-blush);
 * the highest -vN wins. They replace a base portrait (peri, luna, leo, meilin redesigns)
 * or add a face/outfit variant (see scripts/restia/tachie-index.mjs).
 */
function hv12Masters() {
  const best = new Map();
  for (const file of fs.readdirSync(RAW)) {
    const match = file.match(/^hv12-tachie-(.+?)(?:-v(\d+))?\.png$/);
    if (!match) continue;
    const version = Number(match[2] ?? 1);
    if (!best.has(match[1]) || best.get(match[1]).version < version) best.set(match[1], { version, file: path.join(RAW, file) });
  }
  return new Map([...best].map(([name, { file }]) => [name, file]));
}

/** Outfit variants that reuse an older master (the school uniforms became outfits when Leo and Meilin got university defaults). */
const TACHIE_ALIASES = { "leo-school": "hv5-tachie-leo", "meilin-school": "hv5-tachie-meilin" };

/**
 * Like the base portraits, but flattened onto white first: Codex masters that come back
 * with alpha carry black RGB under the transparent pixels, which the border median then
 * took for the backdrop (Leo's dark trousers were keyed away).
 */
async function keyedTachie(file, name) {
  const img = await rgba(await sharp(file).flatten({ background: "#ffffff" }).png().toBuffer());
  keyRect(img, 0, 0, img.width, img.height, { tol: 20, step: 10, seedTol: 8 });
  keyHairPocketsFor(img, name);
  await writeTachie(img, name);
}

/**
 * hv13 portraits: tmp/gen/restia/raw/hv13-tachie-<name>[-vN].png, Codex redraws of the
 * portrait each runtime file was built from, on a chroma screen instead of white (the
 * white-backdrop keying left backdrop specks between hair strands and fingers). One
 * replaces every earlier master for that runtime name, Bin's Earth faces included.
 */
function hv13Masters() {
  const best = new Map();
  for (const file of fs.readdirSync(RAW)) {
    const match = file.match(/^hv13-tachie-(.+?)(?:-v(\d+))?\.png$/);
    if (!match) continue;
    const version = Number(match[2] ?? 1);
    if (!best.has(match[1]) || best.get(match[1]).version < version) best.set(match[1], { version, file: path.join(RAW, file) });
  }
  return new Map([...best].map(([name, { file }]) => [name, file]));
}

async function tachie() {
  const hv13 = hv13Masters();
  for (const [name, file] of hv13) {
    if (!(wantName(name) || wantName(name.split("-")[0]))) continue;
    await writeHv13Tachie(file, name);
    builtHv13.add(name);
  }
  const hv12 = hv12Masters();
  for (const name of TACHIE_NAMES) {
    if (!wantName(name) || hv13.has(name)) continue;
    if (hv12.has(name)) {
      await keyedTachie(hv12.get(name), name);
      continue;
    }
    // hv10 = a character redesign (Hilda 2026-09-30); it replaces every earlier pass.
    // hv11-...-v2 = a regenerated hv11 portrait (Ling Ling: skin at the cropped edge got keyed; Zhao Kang: low angle).
    const file = rawFirst(`hv11-tachie-${name}-v2`, `hv11-tachie-${name}`, `hv10-tachie-${name}`, `hv6-tachie-${name}`, `hv5-tachie-${name}`, `hv-tachie-${name}`);
    if (!file) continue;
    const img = await rgba(file);
    // Seed only from near-backdrop pixels so pale clothing on the cropped bottom edge survives.
    keyRect(img, 0, 0, img.width, img.height, { tol: 20, step: 10, seedTol: 8 });
    // No enclosed-white pass here: it ate white hair, aprons and robes. Only hair-ringed pockets go,
    // and only on flat-backdrop masters (an alpha master such as hv5 Peri is already clean).
    if (!(await sharp(file).metadata()).hasAlpha) keyHairPocketsFor(img, name);
    await writeTachie(img, name);
  }
  // Face and outfit variants (hv12), plus the aliased outfits.
  const variants = [
    ...Object.entries(TACHIE_ALIASES).map(([name, key]) => [name, raw(key)]),
    ...[...hv12].filter(([name]) => !TACHIE_NAMES.includes(name))
  ];
  for (const [name, file] of variants) {
    if (!file || hv13.has(name) || !(wantName(name) || wantName(name.split("-")[0]))) continue;
    await keyedTachie(file, name);
  }
}

/**
 * Bin's four expressions are the creator's own cutouts (user-bin-<face>.png).
 * Their keying punched a few holes inside the art (e.g. the open mouth); any
 * transparent pocket not connected to the image border is refilled from the
 * matching full-backdrop version (user-bin-<face>-vn.png, same size).
 */
async function binFaces() {
  const hv13 = hv13Masters();
  for (const face of ["normal", "happy", "angry", "sad"]) {
    // The 2026-09-30 redesign (hv13 portraits) replaces the creator's cutouts.
    const name = face === "normal" ? "bin" : `bin-${face}`;
    if (hv13.has(name)) {
      if (!builtHv13.has(name)) await writeHv13Tachie(hv13.get(name), name);
      continue;
    }
    const cut = raw(`user-bin-${face}`);
    const full = raw(`user-bin-${face}-vn`);
    if (!cut || !full) continue;
    const img = await rgba(cut);
    const src = await rgba(full);
    if (src.width !== img.width || src.height !== img.height) throw new Error(`bin ${face}: cutout and full art differ in size`);
    const { data, width, height } = img;
    const clear = (p) => data[p * 4 + 3] < 128;
    const outside = new Uint8Array(width * height);
    const stack = [];
    for (let x = 0; x < width; x++) for (const y of [0, height - 1]) if (clear(y * width + x)) stack.push(y * width + x);
    for (let y = 0; y < height; y++) for (const x of [0, width - 1]) if (clear(y * width + x)) stack.push(y * width + x);
    for (const p of stack) outside[p] = 1;
    while (stack.length) {
      const p = stack.pop();
      const x = p % width;
      const y = (p - x) / width;
      for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1]) {
        if (q >= 0 && !outside[q] && clear(q)) {
          outside[q] = 1;
          stack.push(q);
        }
      }
    }
    let filled = 0;
    for (let p = 0; p < width * height; p++) {
      // Only true holes; the soft (semi-transparent) outline stays as drawn.
      if (outside[p] || !clear(p)) continue;
      for (let c = 0; c < 3; c++) data[p * 4 + c] = src.data[p * 4 + c];
      data[p * 4 + 3] = 255;
      filled++;
    }
    await writeTachie(img, face === "normal" ? "bin" : `bin-${face}`);
    console.log(`  bin ${face}: refilled ${filled} interior pixels`);
  }
}

/** Bin in Earth clothes: Codex edits of the creator's four expressions (flat white backdrop). */
async function binEarth() {
  const hv13 = hv13Masters();
  for (const face of ["normal", "happy", "angry", "sad"]) {
    const name = face === "normal" ? "bin-earth" : `bin-earth-${face}`;
    if (hv13.has(name)) {
      if (!builtHv13.has(name)) await writeHv13Tachie(hv13.get(name), name);
      continue;
    }
    const file = raw(`hv6-bin-earth-${face}`);
    if (!file) continue;
    const img = await rgba(file);
    keyRect(img, 0, 0, img.width, img.height, { tol: 20, step: 10, seedTol: 8 });
    await writeTachie(img, face === "normal" ? "bin-earth" : `bin-earth-${face}`);
  }
}

async function backdrops() {
  const list = [
    // Pocket Haven (the farm) stays the original green map: it is a pocket dimension, no snow.
    ["map-farm", "maps/farm"],
    ["hv-map-village", "maps/village"],
    ["hv-map-forest", "maps/forest"],
    ["hv-bg-int-home", "bg/home"],
    ["hv-bg-int-guild", "bg/guild"],
    ["hv-bg-int-store", "bg/store"],
    ["hv-bg-int-smithy", "bg/smithy"],
    ["hv-bg-int-atelier", "bg/atelier"],
    ["hv-bg-int-inn", "bg/inn"],
    ["hv-bg-int-shrine", "bg/shrine"],
    ["hv-bg-int-barn", "bg/barn"],
    ["hv-bg-title", "bg/title"],
    ["hv-bg-earth-apartment", "bg/earth-apartment"],
    ["hv-bg-earth-campus", "bg/earth-campus"],
    ["hv-bg-earth-kfc", "bg/earth-kfc"],
    ["hv-bg-earth-hospital", "bg/earth-hospital"],
    ["hv-bg-earth-bookstore", "bg/earth-bookstore"],
    ["hv-bg-eos-meadow", "bg/eos-meadow"],
    ["hv11-bg-earth-cafeteria", "bg/earth-cafeteria"],
    ["hv11-bg-earth-gym", "bg/earth-gym"],
    ["hv11-bg-earth-library", "bg/earth-library"],
    ["hv11-bg-earth-street", "bg/earth-street"],
    ["hv11-bg-earth-school", "bg/earth-school"],
    ["hv11-bg-eos-village", "bg/eos-village"],
    ["hv11-bg-eos-cave", "bg/eos-cave"],
    ["hv-bg-haven-road", "bg/haven-road"],
    ["hv-bg-haven-gate", "bg/haven-gate"]
  ];
  for (const [name, target] of list) {
    const file = raw(name);
    if (!file) continue;
    await sharp(file).resize(1600, 900, { fit: "cover" }).webp({ quality: 80 }).toFile(out(`${target}.webp`));
    console.log(`backdrop ${target}`);
  }
  // A clean patch of the farm's bare soil, drawn where painted debris was cleared.
  const farm = raw("map-farm");
  if (farm) {
    const meta = await sharp(farm).metadata();
    const cw = meta.width / 32;
    const ch = meta.height / 18;
    await sharp(farm)
      .extract({ left: Math.round(18.1 * cw), top: Math.round(12.1 * ch), width: Math.round(cw * 0.9), height: Math.round(ch * 0.9) })
      .resize(64, 64)
      .webp({ quality: 85 })
      .toFile(out("farm/soil.webp"));
  }
}

async function buildings() {
  const sheets = [
    // Pocket Haven keeps the original farm buildings; the town notice board is the snowy one.
    ["bld-sheet-1", ["farmhouse", "barn", "shipping-bin", null]],
    ["hv-bld-1", [null, null, null, "notice-board"]],
    ["hv-bld-2", ["guild", "store", "smithy", "atelier"]],
    ["hv-bld-3", ["inn", "shrine-ruined", "shrine", "construction"]]
  ];
  for (const [sheet, names] of sheets) {
    const file = raw(sheet);
    if (!file) continue;
    const { img, cells } = await cellsOf(file, 2, 2, { tol: 36, step: 20 });
    for (let i = 0; i < 4; i++) {
      if (!names[i]) continue;
      const cell = cells[i];
      const box = bbox(img, cell.x0, cell.y0, cell.x1, cell.y1);
      if (!box) continue;
      await sharp(await extract(img, box)).resize({ width: 560, height: 560, fit: "inside", withoutEnlargement: true }).webp({ quality: 84, alphaQuality: 90 }).toFile(out(`buildings/${names[i]}.webp`));
      console.log(`building ${names[i]}`);
    }
  }
}

/** Grid sheet -> uniform grid of `size` cells, objects contained (bottom- or centre-anchored). */
async function regrid(file, cols, rows, size, target, { anchor = "center", fillCells = new Set(), keyOpts = {} } = {}) {
  const { img, cells } = await cellsOf(file, cols, rows, keyOpts, fillCells);
  const composites = [];
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (fillCells.has(i)) {
      const inset = Math.round((cell.x1 - cell.x0) * 0.06);
      const box = { left: cell.x0 + inset, top: cell.y0 + inset, width: cell.x1 - cell.x0 - inset * 2, height: cell.y1 - cell.y0 - inset * 2 };
      composites.push({ input: await sharp(await extract(img, box)).resize(size, size, { fit: "fill" }).png().toBuffer(), left: (i % cols) * size, top: Math.floor(i / cols) * size });
      continue;
    }
    const box = bbox(img, cell.x0, cell.y0, cell.x1, cell.y1);
    if (!box) continue;
    const fitted = await sharp(await extract(img, box)).resize(size - 4, size - 4, { fit: "inside" }).png().toBuffer();
    const m = await sharp(fitted).metadata();
    composites.push({
      input: fitted,
      left: (i % cols) * size + Math.round((size - m.width) / 2),
      top: Math.floor(i / cols) * size + (anchor === "bottom" ? size - m.height - 2 : Math.round((size - m.height) / 2))
    });
  }
  await sharp({ create: { width: cols * size, height: rows * size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites)
    .webp({ quality: 86, alphaQuality: 90 })
    .toFile(out(target));
  console.log(`sheet ${target}`);
}

async function sheets() {
  const farm = raw("farm-sheet");
  if (farm) await regrid(farm, 6, 6, 128, "farm/sheet.webp", { anchor: "bottom", keyOpts: { tol: 38, step: 20 } });
  for (const key of ["a", "b", "c"]) {
    const file = raw(`icons-${key}`);
    if (file) await regrid(file, 6, 6, 96, `icons/${key}.webp`, { keyOpts: { tol: 38, step: 20 } });
  }
  const dungeon = raw("dungeon-tiles");
  if (dungeon) await regrid(dungeon, 4, 4, 96, "dungeon/sheet.webp", { fillCells: new Set([0, 1, 2, 3, 4, 5]), keyOpts: { tol: 38, step: 20 } });
}

/**
 * Codex doesn't always keep a sheet's rows on the even grid (tall plants poke
 * above the line). Finds the emptiest background line near each nominal cell
 * boundary and re-lays the cells out on an even grid (same background), so
 * regrid() never slices a plant in two. Writes tmp/gen/restia/keyed/<name>.
 */
async function relayoutOnGutters(file, cols, rows, { tol = 30, reach = 0.3 } = {}) {
  const img = await rgba(file);
  const { data, width, height } = img;
  const bg = [data[0], data[1], data[2]];
  const busy = (x, y) => {
    const i = (y * width + x) * 4;
    return Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) > tol;
  };
  const cuts = (n, length, count) => {
    const cell = length / n;
    const at = [0];
    for (let k = 1; k < n; k++) {
      const nominal = Math.round(k * cell);
      let best = nominal;
      let bestCount = Infinity;
      for (let p = Math.round(nominal - cell * reach); p <= Math.round(nominal + cell * reach); p++) {
        const c = count(p);
        if (c < bestCount || (c === bestCount && Math.abs(p - nominal) < Math.abs(best - nominal))) {
          best = p;
          bestCount = c;
        }
      }
      at.push(best);
    }
    at.push(length);
    return at;
  };
  const ys = cuts(rows, height, (y) => {
    let c = 0;
    for (let x = 0; x < width; x++) if (busy(x, y)) c++;
    return c;
  });
  const cellW = Math.round(width / cols);
  const cellH = Math.round(height / rows);
  const composites = [];
  for (let r = 0; r < rows; r++) {
    // Columns are found per row band, so one row's wide plant can't move another row's cuts.
    const xs = cuts(cols, width, (x) => {
      let c = 0;
      for (let y = ys[r]; y < ys[r + 1]; y++) if (busy(x, y)) c++;
      return c;
    });
    for (let c = 0; c < cols; c++) {
      const box = { left: xs[c], top: ys[r], width: xs[c + 1] - xs[c], height: ys[r + 1] - ys[r] };
      const fit = await sharp(file).extract(box).resize(Math.min(box.width, cellW), Math.min(box.height, cellH), { fit: "inside" }).png().toBuffer();
      const m = await sharp(fit).metadata();
      composites.push({ input: fit, left: c * cellW + Math.round((cellW - m.width) / 2), top: r * cellH + Math.round((cellH - m.height) / 2) });
    }
  }
  const target = path.join(ROOT, "tmp", "gen", "restia", "keyed", path.basename(file));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  await sharp({ create: { width: cellW * cols, height: cellH * rows, channels: 3, background: { r: bg[0], g: bg[1], b: bg[2] } } })
    .composite(composites)
    .png()
    .toFile(target);
  return target;
}

/** hv14: second crop sheet (18 crops, growing + ripe) and its 6x3 produce/dish icons. */
async function cropSheets() {
  const farm2 = raw("hv14-farm-sheet-2");
  if (farm2) await regrid(await relayoutOnGutters(farm2, 6, 6), 6, 6, 128, "farm/sheet-2.webp", { anchor: "bottom", keyOpts: { tol: 38, step: 20 } });
  const iconsD = raw("hv14-icons-d");
  if (iconsD) await regrid(await relayoutOnGutters(iconsD, 6, 3), 6, 3, 96, "icons/d.webp", { keyOpts: { tol: 38, step: 20 } });
}

/**
 * Battle v2 art (hv7-*): impact effects and projectiles are 4x4 frame sheets
 * flattened onto black (the game draws them with screen blending), board props
 * are keyed like other sheets, battlefields are cropped to the 800x556 board.
 */
async function battleArt() {
  for (const file of fs.readdirSync(RAW).filter((name) => /^hv7-(fx|proj)-.+\.png$/.test(name))) {
    const [, kind, id] = file.match(/^hv7-(fx|proj)-(.+)\.png$/);
    const target = kind === "fx" ? `fx/${id}.webp` : `fx/proj-${id}.webp`;
    await sharp(path.join(RAW, file)).flatten({ background: "#000000" }).resize(512, 512, { fit: "fill" }).webp({ quality: 84 }).toFile(out(target));
    console.log(`fx ${target}`);
  }
  const props = raw("hv7-props");
  if (props) await regrid(props, 4, 4, 128, "battle/props.webp", { anchor: "bottom", keyOpts: { tol: 38, step: 20 } });
  for (const file of fs.readdirSync(RAW).filter((name) => /^hv7-bf-.+\.png$/.test(name))) {
    const id = file.slice("hv7-bf-".length, -4);
    await sharp(path.join(RAW, file)).flatten({ background: "#000000" }).resize(800, 556, { fit: "cover", position: "centre" }).webp({ quality: 84 }).toFile(out(`battlefields/${id}.webp`));
    console.log(`battlefield ${id}`);
  }
}

/**
 * Hill textures (hv8-tex-*): tiling tops and cliff sides of raised battle ground,
 * one set per biome group (see HILL_SET in ui/battle-view.tsx).
 */
/** hv8: battle action-bar icons (4x4 medallions) and objective markers (banners, shrines, caches; 4x2). */
async function hud() {
  const icons = raw("hv8-action-icons");
  if (icons) await regrid(icons, 4, 4, 128, "ui/battle-icons.webp", { anchor: "center", keyOpts: { tol: 38, step: 20 } });
  const objectives = raw("hv8-objectives");
  if (objectives) await regrid(objectives, 4, 2, 128, "battle/objectives.webp", { anchor: "bottom", keyOpts: { tol: 38, step: 20 } });
  // Farm sprinklers: 3 tiers idle (row 1) and spraying (row 2).
  const sprinklers = raw("hv9-sprinklers");
  if (sprinklers) await regrid(sprinklers, 3, 2, 192, "farm/sprinklers.webp", { anchor: "bottom", keyOpts: { tol: 38, step: 20 } });
}

async function terrain() {
  const sets = {
    grass: ["hv8-tex-grass-top", "hv8-tex-earth-side"],
    snow: ["hv8-tex-snow-top", "hv8-tex-icerock-side"],
    stone: ["hv8-tex-flagstone-top", "hv8-tex-masonry-side"],
    ash: ["hv8-tex-ash-top", "hv8-tex-basalt-side"],
    rift: ["hv8-tex-rift-top", "hv8-tex-rift-side"]
  };
  for (const [set, [top, side]] of Object.entries(sets)) {
    for (const [face, name] of [["top", top], ["side", side]]) {
      const file = raw(name);
      if (!file) continue;
      await sharp(file).resize(256, 256).webp({ quality: 82 }).toFile(out(`battle/terrain/${set}-${face}.webp`));
      console.log(`terrain ${set}-${face}`);
    }
  }
}

/**
 * The main characters' extra moves (hv8-skill-*, 8x4): row 1 = 4 idle frames
 * (scale reference, same --ref as their main sheet) + 4 victory, row 2 a jump,
 * rows 3-4 their two signature skills. Written as "<atlas>-sk" (groups 20-23).
 */
/**
 * A sprite sheet master: the hv13 chroma-screen redraw (hv13-<kind>-<name>) when there is one,
 * keyed to real alpha in tmp/gen/restia/keyed/ (import-sprite-sheet keeps a sheet's own alpha),
 * else the first existing older master.
 */
async function sheetMaster(kind, name, ...older) {
  const chroma = path.join(RAW, `hv13-${kind}-${name}.png`);
  if (!fs.existsSync(chroma)) return rawFirst(...older);
  const img = await rgba(chroma);
  // Small speck limit: sparkles and ice shards are separate little islands on a sheet.
  keyChromaOrAlpha(img, { speck: 6, ...chromaOptions(name) });
  const keyed = path.join(ROOT, "tmp", "gen", "restia", "keyed", `hv13-${kind}-${name}.png`);
  fs.mkdirSync(path.dirname(keyed), { recursive: true });
  await toSharp(img).png().toFile(keyed);
  return keyed;
}

/**
 * Each sheet step writes its atlas metadata to its own scratch file, merged into
 * battle-atlases.json once at the end: rewriting the shared file for every sheet hits
 * Windows file locks.
 */
function atlasScratch(step) {
  const scratch = path.join(ROOT, "tmp", "gen", "restia", `${step}-atlases.json`);
  fs.writeFileSync(scratch, "{}\n");
  return scratch;
}

/** Runs a sheet step against its scratch file and merges what it wrote even if it fails partway, so written images never keep stale metadata. */
async function withAtlasScratch(step, build) {
  const scratch = atlasScratch(step);
  try {
    await build(scratch);
  } finally {
    mergeAtlases(scratch);
  }
}

function mergeAtlases(scratch) {
  const target = path.join(ROOT, "src", "restia", "data", "battle-atlases.json");
  const added = JSON.parse(fs.readFileSync(scratch, "utf8"));
  const merged = { ...JSON.parse(fs.readFileSync(target, "utf8")), ...added };
  // Sorted, as import-sprite-sheet writes it.
  const sorted = Object.fromEntries(Object.keys(merged).sort().map((key) => [key, merged[key]]));
  fs.writeFileSync(target, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`merged ${Object.keys(added).length} atlases`);
}

async function skillSheets() {
  await withAtlasScratch("skill", skillSheetsInto);
}

async function skillSheetsInto(scratch) {
  for (const name of ["bin", "mitia", "bowy", "garr", "hilda", "senna"]) {
    if (!wantName(name)) continue;
    const file = await sheetMaster("skill", name, `hv10-skill-${name}`, `hv8-skill-${name}`);
    if (!file) continue;
    execFileSync(
      process.execPath,
      [
        path.join(ROOT, "scripts", "import-sprite-sheet.mjs"),
        file,
        `restia-${name}-sk`,
        "--grid", "8x4",
        "--rows", "2:4+20:4;21:8;22:8;23:8",
        "--ref", "swordsman",
        "--out-dir", path.join("public", "assets", "restia", "battle"),
        "--meta", scratch
      ],
      { cwd: ROOT, stdio: "inherit" }
    );
  }
}

/**
 * hv9: front and back three-quarter sheets ("<atlas>-front" / "-back", same H3
 * groups as the side sheet) and the main characters' extra moves ("<atlas>-x":
 * 30 fidget, 31 dodge, 32 get up, 33 critical strike, 34 power up, 35 potion).
 */
async function facingSheets() {
  await withAtlasScratch("facing", facingSheetsInto);
}

async function facingSheetsInto(scratch) {
  const scaleOf = (name) => (name === "frost-wolf" ? ["--ref", "boar"] : name === "frost-rat" ? ["--height", "42"] : ["--ref", "swordsman"]);
  const run = (file, slug, rows, extra) =>
    execFileSync(
      process.execPath,
      [
        path.join(ROOT, "scripts", "import-sprite-sheet.mjs"),
        file,
        slug,
        "--grid", "8x4",
        "--rows", rows,
        ...extra,
        "--out-dir", path.join("public", "assets", "restia", "battle"),
        // A scratch file per run, merged once below (rewriting the shared atlas file dozens of times hits file locks).
        "--meta", scratch
      ],
      { cwd: ROOT, stdio: "inherit" }
    );
  const names = ["bin", "mitia", "bowy", "garr", "hilda", "senna", "dain", "lysa", "mara", "frida", "tilde", "frost-wolf", "frost-rat"];
  for (const view of ["front", "back"]) {
    for (const name of names.filter(wantName)) {
      const file = await sheetMaster(view, name, `hv10-${view}-${name}`, `hv9-${view}-${name}`);
      if (file) run(file, `restia-${name}-${view}`, "2:8;0:8;12:8;3:4+18:4", ["--copy", "11=12,13=12,17=18,19=18", ...scaleOf(name)]);
    }
  }
  for (const name of names.slice(0, 6).filter(wantName)) {
    const file = await sheetMaster("extra", name, `hv10-extra-${name}`, `hv9-extra-${name}`);
    if (file) run(file, `restia-${name}-x`, "30:8;31:4+32:4;33:8;34:4+35:4", ["--standing", "30", ...scaleOf(name)]);
  }
}

/**
 * The Codex sheets don't draw every row on the same ground line (a wolf's walk
 * row sits higher in its frames than its standing row). Record each row's own
 * ground line (the lowest opaque pixel row over its frames) as `foot`, so the
 * game stands every row on the hex. Rows cut off by the frame edge are left alone.
 */
async function feet() {
  const target = path.join(ROOT, "src", "restia", "data", "battle-atlases.json");
  const atlases = JSON.parse(fs.readFileSync(target, "utf8"));
  let changed = 0;
  for (const [name, atlas] of Object.entries(atlases)) {
    if (!name.startsWith("restia-")) continue;
    const file = path.join(ROOT, "public", atlas.image.replace(/^\//, ""));
    if (!fs.existsSync(file)) continue;
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const bottomOf = (x0, y0) => {
      for (let y = atlas.frameHeight - 1; y >= 0; y--) {
        let solid = 0;
        for (let x = 0; x < atlas.frameWidth; x++) {
          const px = x0 + x;
          const py = y0 + y;
          if (px < info.width && py < info.height && data[(py * info.width + px) * 4 + 3] > 60) solid++;
        }
        // A couple of stray pixels aren't a foot.
        if (solid >= 3) return y;
      }
      return -1;
    };
    for (const group of Object.values(atlas.groups)) {
      let foot = -1;
      for (let frame = 0; frame < group.frames; frame++) {
        const cell = group.start === undefined ? null : group.start + frame;
        const x0 = (cell === null ? frame : cell % atlas.columns) * atlas.frameWidth;
        const y0 = (cell === null ? group.row : Math.floor(cell / atlas.columns)) * atlas.frameHeight;
        foot = Math.max(foot, bottomOf(x0, y0));
      }
      const before = group.foot;
      if (foot < 0 || foot >= atlas.frameHeight - 2 || Math.abs(foot - atlas.anchorY) < 2) delete group.foot;
      else group.foot = foot;
      if (before !== group.foot) changed++;
    }
  }
  fs.writeFileSync(target, JSON.stringify(atlases, null, 2) + "\n");
  console.log(`feet: ${changed} rows updated`);
}

async function battle() {
  await withAtlasScratch("battle", battleInto);
}

async function battleInto(scratch) {
  const rows ="2:8;0:8;12:8;3:4+4:4;5:8;7:4+18:4";
  // [name, scale option]: party and the rival match an H3 swordsman; the frost beasts are animals.
  const sheets = [
    ["bin", ["--ref", "swordsman"]],
    ["mitia", ["--ref", "swordsman"]],
    ["bowy", ["--ref", "swordsman"]],
    ["garr", ["--ref", "swordsman"]],
    ["hilda", ["--ref", "swordsman"]],
    // hv6 Senna sheet drew only 7 guard frames in row 4.
    ["senna", ["--ref", "swordsman"], "2:8;0:8;12:8;3:4+4:3+-:1;5:8;7:4+18:4"],
    ["dain", ["--ref", "swordsman"]],
    // Town NPCs: their sheets drive the overworld figures (standing/walk only in practice).
    ["lysa", ["--ref", "swordsman"]],
    ["mara", ["--ref", "swordsman"]],
    ["frida", ["--ref", "swordsman"], "2:8;0:8;12:8;3:4+4:3+-:1;5:7+-:1;7:4+18:4"],
    ["tilde", ["--ref", "swordsman"]],
    ["frost-wolf", ["--ref", "boar"]],
    ["frost-rat", ["--height", "42"]]
  ];
  for (const [name, scale, sheetRows = rows] of sheets) {
    if (!wantName(name)) continue;
    const file = await sheetMaster("battle", name, `hv10-battle-${name}`, `hv6-battle-${name}`, `hv-battle-${name}`);
    if (!file) continue;
    execFileSync(
      process.execPath,
      [
        path.join(ROOT, "scripts", "import-sprite-sheet.mjs"),
        file,
        `restia-${name}`,
        "--grid", "8x6",
        "--rows", sheetRows,
        "--reverse", "8=7",
        "--copy", "11=12,13=12,17=18,19=18",
        ...scale,
        "--out-dir", path.join("public", "assets", "restia", "battle"),
        "--meta", scratch
      ],
      { cwd: ROOT, stdio: "inherit" }
    );
  }
}

if (want("tachie")) await tachie();
if (want("bin")) await binFaces();
if (want("bin")) await binEarth();
if (want("backdrops")) await backdrops();
if (want("buildings")) await buildings();
if (want("sheets")) await sheets();
if (want("sheets") || want("cropSheets")) await cropSheets();
if (want("battle")) await battle();
if (want("battleArt")) await battleArt();
if (want("terrain")) await terrain();
if (want("hud")) await hud();
if (want("skillSheets")) await skillSheets();
if (want("facingSheets")) await facingSheets();
// Any rebuilt sheet gets its ground lines measured again.
if (want("feet") || want("battle") || want("skillSheets") || want("facingSheets")) await feet();
console.log("done");

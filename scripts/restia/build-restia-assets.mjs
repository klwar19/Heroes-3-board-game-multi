#!/usr/bin/env node
/**
 * Restia (single-player life-sim mode) art pipeline.
 *
 * Codex image_gen masters live in tmp/gen/restia/raw (git-ignored; regenerate them with
 * scripts/restia/codex-gen-batch.mjs from the prompts in scripts/restia/codex-jobs.json). This script turns them into the runtime webps under
 * public/assets/restia/ (gitignored; published to R2 with `npm run media:publish`):
 *
 *   node scripts/restia/build-restia-assets.mjs [--only tachie,bin,backdrops,buildings,sheets,battle,battleArt]
 *
 * Backgrounds are keyed by flood-filling from each cell's border over pixels
 * close to the border's median colour (Codex paints flat backdrops, not alpha).
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
const TACHIE_NAMES = ["peri", "system", "garr", "bowy", "mitia", "lysa", "hilda", "senna", "mara", "frida", "tilde", "dain", "tessa", "lily", "luna", "leo", "meilin", "jake"];

async function writeTachie(img, name) {
  const box = bbox(img, 0, 0, img.width, img.height);
  const buffer = await extract(img, box);
  await sharp(buffer).resize({ height: 1280, withoutEnlargement: true }).webp({ quality: 84, alphaQuality: 90 }).toFile(out(`tachie/${name}.webp`));
  console.log(`tachie ${name}`);
}

async function tachie() {
  for (const name of TACHIE_NAMES) {
    const file = rawFirst(`hv6-tachie-${name}`, `hv5-tachie-${name}`, `hv-tachie-${name}`);
    if (!file) continue;
    const img = await rgba(file);
    // Seed only from near-backdrop pixels so pale clothing on the cropped bottom edge survives.
    keyRect(img, 0, 0, img.width, img.height, { tol: 20, step: 10, seedTol: 8 });
    // No enclosed-white pass here: it ate white hair, aprons and robes.
    await writeTachie(img, name);
  }
}

/**
 * Bin's four expressions are the creator's own cutouts (user-bin-<face>.png).
 * Their keying punched a few holes inside the art (e.g. the open mouth); any
 * transparent pocket not connected to the image border is refilled from the
 * matching full-backdrop version (user-bin-<face>-vn.png, same size).
 */
async function binFaces() {
  for (const face of ["normal", "happy", "angry", "sad"]) {
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
  for (const face of ["normal", "happy", "angry", "sad"]) {
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

function battle() {
  const rows = "2:8;0:8;12:8;3:4+4:4;5:8;7:4+18:4";
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
    const file = rawFirst(`hv6-battle-${name}`, `hv-battle-${name}`);
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
        "--meta", path.join("src", "restia", "data", "battle-atlases.json")
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
if (want("battle")) battle();
if (want("battleArt")) await battleArt();
console.log("done");

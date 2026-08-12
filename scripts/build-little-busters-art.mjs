#!/usr/bin/env node
/** Production exports for the researched Little Busters art pack. */

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(ROOT, "scripts/anime-art/raw/little-busters");
const ASSETS = path.join(ROOT, "public/assets");
const SESSION = path.join(ROOT, "generated-session-art/little-busters");
const WEBP = { quality: 90, effort: 6 };
// The physical designed-board window is 2.916:1. Export at that exact shape so
// the browser never crops the campus vertically; seven equal 292 px inserts
// also meet without gaps or cumulative rounding drift.
const PANO = { width: 2044, height: 701 };
const BAR_WIDTHS = [292, 292, 292, 292, 292, 292, 292];

async function outWebp(input, rel, width, height, options = {}) {
  const out = path.join(ASSETS, rel);
  await mkdir(path.dirname(out), { recursive: true });
  await sharp(input)
    .resize(width, height, { fit: options.fit ?? "cover", position: options.position ?? "attention", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ ...WEBP, quality: options.quality ?? WEBP.quality })
    .toFile(out);
  return out;
}

async function scenery() {
  const empty = await outWebp(path.join(RAW, "scenery/campus-empty-master.png"), "anime/towns/little-busters-campus-empty.webp", PANO.width, PANO.height, { quality: 92 });
  const full = await outWebp(path.join(RAW, "scenery/campus-full-master.png"), "anime/towns/little-busters-campus-full.webp", PANO.width, PANO.height, { quality: 92 });
  const fullPng = await sharp(full).png().toBuffer();
  const barFiles = [];
  let left = 0;
  for (let i = 0; i < BAR_WIDTHS.length; i++) {
    const width = BAR_WIDTHS[i];
    const rel = `town-board/little-busters-bar-${i + 1}.webp`;
    const file = path.join(ASSETS, rel);
    await mkdir(path.dirname(file), { recursive: true });
    await sharp(fullPng).extract({ left, top: 0, width, height: PANO.height }).webp(WEBP).toFile(file);
    barFiles.push(file);
    left += width;
  }

  // QA sheet: the actual board mechanic, from empty through all seven inserted
  // tiles. This catches disconnected horizons/paths before the art ships.
  const barInputs = await Promise.all(barFiles.map((file) => sharp(file).png().toBuffer()));
  const reviewThumbs = [];
  for (let count = 0; count <= barFiles.length; count++) {
    let tileLeft = 0;
    const layers = barInputs.slice(0, count).map((input, index) => {
      const layer = { input, left: tileLeft, top: 0 };
      tileLeft += BAR_WIDTHS[index];
      return layer;
    });
    const progressive = await sharp(empty).composite(layers).png().toBuffer();
    reviewThumbs.push(await sharp(progressive).resize(410, 231, { fit: "fill" }).png().toBuffer());
  }
  const progressSheet = path.join(SESSION, "little-busters-town-progress-0-to-7.webp");
  await mkdir(path.dirname(progressSheet), { recursive: true });
  await sharp({ create: { width: 4 * 410 + 5 * 8, height: 2 * 231 + 3 * 8, channels: 4, background: "#101827" } })
    .composite(reviewThumbs.map((input, index) => ({ input, left: 8 + (index % 4) * 418, top: 8 + Math.floor(index / 4) * 239 })))
    .webp(WEBP)
    .toFile(progressSheet);

  const cropW = Math.round(PANO.height * (174 / 137));
  await sharp(full).extract({ left: Math.round((PANO.width - cropW) / 2), top: 0, width: cropW, height: PANO.height })
    .resize(174, 137, { fit: "fill" }).webp(WEBP).toFile(path.join(ASSETS, "town-icon-little_busters.webp"));
  return [empty, full, progressSheet];
}

async function tile() {
  const source = path.join(RAW, "tile/little-busters-s1-master.png");
  // Keep the painting geometry-free. Remove any export edge padding before
  // matching the canonical board mask; exact hex edges are rendered by SVG.
  const rgb = await sharp(source)
    .trim({ background: "#ffffff", threshold: 18 })
    .resize(1024, 985, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alpha = await sharp(path.join(ASSETS, "anime/tiles/a-s1.webp")).ensureAlpha().extractChannel("alpha").raw().toBuffer();
  const rgba = Buffer.alloc(rgb.info.width * rgb.info.height * 4);
  for (let i = 0; i < rgb.info.width * rgb.info.height; i++) {
    rgba[i * 4] = rgb.data[i * 3];
    rgba[i * 4 + 1] = rgb.data[i * 3 + 1];
    rgba[i * 4 + 2] = rgb.data[i * 3 + 2];
    rgba[i * 4 + 3] = alpha[i];
  }
  const out = path.join(ASSETS, "anime/tiles/lb-s1-v2.webp");
  await mkdir(path.dirname(out), { recursive: true });
  await sharp(rgba, { raw: { width: 1024, height: 985, channels: 4 } }).webp(WEBP).toFile(out);
  return out;
}

async function heroes() {
  const entries = [
    ["sasami-sasasegawa", "sasami-sasasegawa-master.png"], ["riki-naoe", "riki-naoe-master.png"],
    ["rin-natsume", "rin-natsume-master.png"], ["yuiko-kurugaya", "yuiko-kurugaya-master.png"],
    ["kudryavka-noumi", "kudryavka-noumi-master.png"], ["komari-kamikita", "komari-kamikita-master.png"]
  ];
  return Promise.all(entries.map(([slug, file]) => outWebp(path.join(RAW, "heroes", file), `anime/heroes/little-busters-${slug}.webp`, 1086, 1448, { quality: 90 })));
}

async function transparentIcons() {
  const equipment = [
    "harukas-glass-marbles", "lennons-mission-letter", "mios-parasol", "kuds-flight-goggles",
    "little-busters-practice-bat", "school-revolution-watch"
  ];
  const icons = [
    "rank-haruka", "rank-rins-cats", "rank-disciplinary-committee", "rank-masato", "rank-softball-club",
    "rank-saya", "rank-mio", "rank-shared", "grade-benchwarmer", "grade-regular", "grade-ace", "grade-strongest-in-school"
  ];
  const outputs = [];
  for (const slug of equipment) outputs.push(await outWebp(path.join(RAW, `equipment/${slug}-alpha.png`), `anime/equipment/little-busters-${slug}.webp`, 512, 512, { fit: "contain", quality: 92 }));
  for (const slug of icons) outputs.push(await outWebp(path.join(RAW, `icons/${slug}-alpha.png`), `anime/icons/little-busters/${slug}.webp`, 512, 512, { fit: "contain", quality: 92 }));
  return outputs;
}

async function reviewSheet(files, name, cols = 6) {
  const w = 220, h = 250, gap = 8, rows = Math.ceil(files.length / cols);
  const thumbs = await Promise.all(files.map((file) => sharp(file).resize(w, h, { fit: "contain", background: "#151d2d" }).png().toBuffer()));
  const out = path.join(SESSION, name);
  await mkdir(path.dirname(out), { recursive: true });
  await sharp({ create: { width: cols * w + (cols + 1) * gap, height: rows * h + (rows + 1) * gap, channels: 4, background: "#101827" } })
    .composite(thumbs.map((input, i) => ({ input, left: gap + (i % cols) * (w + gap), top: gap + Math.floor(i / cols) * (h + gap) })))
    .webp(WEBP).toFile(out);
  return out;
}

const requested = new Set(process.argv.slice(2));
const all = requested.size === 0;
const outputs = [];
if (all || requested.has("scenery")) outputs.push(...await scenery());
if (all || requested.has("tile")) outputs.push(await tile());
if (all || requested.has("heroes")) outputs.push(...await heroes());
if (all || requested.has("icons")) {
  const icons = await transparentIcons();
  outputs.push(...icons, await reviewSheet(icons, "little-busters-equipment-rank-grade-sheet.webp"));
}
for (const file of outputs) console.log(path.relative(ROOT, file));

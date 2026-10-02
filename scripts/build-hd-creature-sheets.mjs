// Builds 2x HD copies of creature atlas sheets with Real-ESRGAN, for the Order & Chaos lawn and
// the Hex Battlefield (both pick them up through creatureSheet() in
// src/data/battle-hex/creature-sprites.ts; card thumbnails keep the originals).
//
//   node scripts/build-hd-creature-sheets.mjs --esr <realesrgan-ncnn-vulkan.exe> slug [slug...]
//   node scripts/build-hd-creature-sheets.mjs --esr <exe> --list scripts/hd-creature-sheets.json
//
// Tool: realesrgan-ncnn-vulkan v0.2.5.0 (github.com/xinntao/Real-ESRGAN releases), model
// realesr-animevideov3 (keeps the H3 texture; x4plus-anime smooths it into a plastic look).
// Each sheet: the 4x model, then Lanczos to EXACTLY 2x, so every frame cell, anchor and the
// sheet grid map 1:1 onto the original's coordinates (drawn at half scale).
//  - RGB: transparent pixels first take their nearest visible colour (no dark fringes).
//  - Alpha: H3 sheets are a binary body (255) plus a soft ground shadow (128 core / 64 rim).
//    The body mask goes through ESRGAN (a crisp silhouette); the shadow is resampled smoothly
//    on its own (ESRGAN turns its soft bands into jagged dark edges). Under the body the
//    shadow layer takes the nearest shadow value (<= 3 px) so the two meet without a seam.
// Output: <sheet dir>-hd/<name>.webp beside the original, and the original-path -> HD map in
// src/data/battle-hex/creature-sprites-hd.json (merged; the original size is recorded so the
// CSS sprites can size the HD background back to the original's pixel grid).
// New files are media: run `npm run media:publish` so the CDN serves them (until then the
// game keeps drawing the originals — creatureSheet() only picks a published HD sheet).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v; };
const ESR = opt("esr");
const LIST = opt("list");
const MODEL = opt("model") ?? "realesr-animevideov3";
const slugs = [...args, ...(LIST ? JSON.parse(fs.readFileSync(LIST, "utf8")) : [])];
if (!ESR || !fs.existsSync(ESR) || !slugs.length) {
  console.error("usage: node scripts/build-hd-creature-sheets.mjs --esr <realesrgan-ncnn-vulkan.exe> [--list slugs.json] slug...");
  process.exit(1);
}

const HEX = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/battle-hex/creature-sprite-atlases.json"), "utf8"));
const GARRISON = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/garrison/sprite-atlases.json"), "utf8"));
const MAP_FILE = path.join(ROOT, "src/data/battle-hex/creature-sprites-hd.json");
const map = fs.existsSync(MAP_FILE) ? JSON.parse(fs.readFileSync(MAP_FILE, "utf8")) : {};
const work = fs.mkdtempSync(path.join(os.tmpdir(), "hd-sheets-"));

/** Multi-source BFS from visible pixels: every transparent pixel copies its nearest donor's RGB. */
function bleed(rgba, w, h) {
  const rgb = Buffer.alloc(w * h * 3);
  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < w * h; i += 1) {
    if (rgba[i * 4 + 3] > 8) {
      rgba.copy(rgb, i * 3, i * 4, i * 4 + 3);
      seen[i] = 1;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    const y = (i / w) | 0;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
      if (j < 0 || seen[j]) continue;
      seen[j] = 1;
      rgb.copy(rgb, j * 3, i * 3, i * 3 + 3);
      queue[tail++] = j;
    }
  }
  return rgb;
}

const esrgan = (input, output) => execFileSync(ESR, ["-i", input, "-o", output, "-n", MODEL, "-s", "4", "-t", "256", "-f", "png"], { stdio: "pipe" });

for (const slug of slugs) {
  const atlas = HEX[slug] ?? GARRISON[slug];
  if (!atlas) throw new Error(`no atlas for ${slug}`);
  const src = path.join(ROOT, "public", atlas.image);
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  if (w !== atlas.columns * atlas.frameWidth) throw new Error(`${slug}: sheet width ${w} is not columns x frameWidth`);
  const W = w * 2;
  const H = h * 2;
  if (W > 8192 || H > 8192) throw new Error(`${slug}: ${W}x${H} exceeds 8192 (GPU texture limit on low-end devices)`);

  const body = Buffer.alloc(w * h * 3);
  const shadow = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i += 1) {
    const a = data[i * 4 + 3];
    body.fill(a === 255 ? 255 : 0, i * 3, i * 3 + 3);
    shadow[i] = a === 255 ? 0 : a;
  }
  for (let pass = 0; pass < 3; pass += 1) {
    const prev = Buffer.from(shadow);
    for (let i = 0; i < w * h; i += 1) {
      if (data[i * 4 + 3] !== 255 || prev[i]) continue;
      const x = i % w;
      const y = (i / w) | 0;
      shadow[i] = Math.max(x > 0 ? prev[i - 1] : 0, x < w - 1 ? prev[i + 1] : 0, y > 0 ? prev[i - w] : 0, y < h - 1 ? prev[i + w] : 0);
    }
  }
  const tmp = (name) => path.join(work, `${slug}-${name}.png`);
  await sharp(bleed(data, w, h), { raw: { width: w, height: h, channels: 3 } }).png().toFile(tmp("rgb"));
  await sharp(body, { raw: { width: w, height: h, channels: 3 } }).png().toFile(tmp("body"));
  const started = Date.now();
  esrgan(tmp("rgb"), tmp("rgb4"));
  esrgan(tmp("body"), tmp("body4"));
  const rgb2 = await sharp(tmp("rgb4")).removeAlpha().resize(W, H, { kernel: "lanczos3" }).raw().toBuffer();
  const body2 = await sharp(tmp("body4")).removeAlpha().resize(W, H, { kernel: "lanczos3" }).extractChannel(0).raw().toBuffer();
  const shadow2 = await sharp(shadow, { raw: { width: w, height: h, channels: 1 } }).resize(W, H, { kernel: "mitchell" }).extractChannel(0).raw().toBuffer();
  const out = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i += 1) {
    rgb2.copy(out, i * 4, i * 3, i * 3 + 3);
    const b = body2[i] < 6 ? 0 : body2[i] > 249 ? 255 : body2[i];
    const a = Math.round(b + shadow2[i] * (1 - b / 255));
    out[i * 4 + 3] = a < 3 ? 0 : a;
  }
  const dir = path.posix.dirname(atlas.image);
  const hdPath = `${dir}-hd/${path.posix.basename(atlas.image, path.posix.extname(atlas.image))}.webp`;
  fs.mkdirSync(path.join(ROOT, "public", path.posix.dirname(hdPath)), { recursive: true });
  await sharp(out, { raw: { width: W, height: H, channels: 4 } }).webp({ quality: 82, alphaQuality: 100, effort: 5 }).toFile(path.join(ROOT, "public", hdPath));
  map[atlas.image] = { hd: hdPath, width: w, height: h };
  fs.writeFileSync(MAP_FILE, `${JSON.stringify(Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`);
  for (const name of ["rgb", "body", "rgb4", "body4"]) fs.rmSync(tmp(name), { force: true });
  console.log(`${slug}: ${w}x${h} -> ${W}x${H} in ${((Date.now() - started) / 1000).toFixed(1)} s -> ${hdPath}`);
}
fs.rmSync(work, { recursive: true, force: true });

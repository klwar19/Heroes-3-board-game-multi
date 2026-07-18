#!/usr/bin/env node

/**
 * Place codex-generated anime-mod art into the repo.
 *
 * Input: a directory of collected PNG masters named by category prefix:
 *   fo-<id>.png    → public/assets/anime/field-overrides/<id>.webp   (512×512 cover)
 *   eq-<slug>.png  → public/assets/anime/equipment/<slug>.webp       (chroma-keyed, 512×512 contain)
 *   sp-<slug>.png  → public/assets/story/sprites/<slug>.webp         (chroma-keyed cutout, ≤1280 tall)
 *   bg-<slug>.png  → public/assets/story/backgrounds/<slug>.webp     (16:9 center crop)
 *   cover-<slug>.png → public/assets/story/covers/<slug>.webp        (12:5 banner crop)
 *   art-<slug>.png / frame-artifact.png
 *                  → scripts/anime-art/raw/artifacts/<name>-master.png (compositor inputs, no direct public output)
 *
 * Chroma-key here is FIXED to pure #00ff00 (the prompts demand a flat key
 * backdrop), unlike scripts/chroma-key.mjs which border-samples — that variant
 * would mis-key subjects whose border is not background (e.g. the card frame).
 *
 * Run: node scripts/place-anime-assets.mjs <collectedDir>
 */

import { mkdir, readdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = process.argv[2];
if (!SRC) {
  console.error("usage: node scripts/place-anime-assets.mjs <collectedDir>");
  process.exit(1);
}

const OUT = {
  fieldOverrides: path.join(ROOT, "public", "assets", "anime", "field-overrides"),
  equipment: path.join(ROOT, "public", "assets", "anime", "equipment"),
  sprites: path.join(ROOT, "public", "assets", "story", "sprites"),
  backgrounds: path.join(ROOT, "public", "assets", "story", "backgrounds"),
  covers: path.join(ROOT, "public", "assets", "story", "covers"),
  rawArtifacts: path.join(ROOT, "scripts", "anime-art", "raw", "artifacts")
};

/** Fixed-key chroma → alpha for a flat pure-green backdrop, with despill. */
export async function keyPureGreen(inputPath, { t0 = 55, t1 = 150 } = {}) {
  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const out = Buffer.alloc(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    const i = p * channels;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const dist = Math.sqrt(r * r + (255 - g) * (255 - g) + b * b);
    let alpha = dist <= t0 ? 0 : dist >= t1 ? 255 : Math.round(((dist - t0) / (t1 - t0)) * 255);
    const o = p * 4;
    // despill: green may not exceed the other channels' ceiling near the key
    const spillCap = Math.max(r, b);
    const spill = alpha > 0 && alpha < 255 ? spillCap : g > spillCap && dist < t1 * 1.35 ? spillCap : null;
    out[o] = r;
    out[o + 1] = spill === null ? g : Math.min(g, Math.round(spillCap + (g - spillCap) * 0.25));
    out[o + 2] = b;
    out[o + 3] = alpha;
  }
  return sharp(out, { raw: { width, height, channels: 4 } });
}

/** Bounding box of non-transparent pixels (alpha > 8), with a small pad. */
async function alphaBBox(image, pad = 6) {
  const { data, info } = await image.clone().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { left: 0, top: 0, width, height };
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function placeHex(file, id) {
  await sharp(file).resize(512, 512, { fit: "cover" }).webp({ quality: 82, effort: 6 }).toFile(path.join(OUT.fieldOverrides, `${id}.webp`));
  console.log(`hex   ${id}`);
}

async function placeEquipment(file, slug) {
  const keyed = await keyPureGreen(file);
  const box = await alphaBBox(keyed);
  const buf = await keyed.extract(box).png().toBuffer();
  // contain on a transparent 512 canvas with a ~4% breathing margin
  await sharp(buf)
    .resize(472, 472, { fit: "inside" })
    .extend({ top: 20, bottom: 20, left: 20, right: 20, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 88, effort: 6 })
    .toFile(path.join(OUT.equipment, `${slug}.webp`));
  console.log(`equip ${slug}`);
}

async function placeSprite(file, slug) {
  const keyed = await keyPureGreen(file);
  const box = await alphaBBox(keyed, 4);
  let img = sharp(await keyed.extract(box).png().toBuffer());
  const meta = await img.metadata();
  if ((meta.height ?? 0) > 1280) img = img.resize({ height: 1280 });
  await img.webp({ quality: 88, effort: 6 }).toFile(path.join(OUT.sprites, `${slug}.webp`));
  console.log(`sprite ${slug}`);
}

async function placeBackground(file, slug) {
  const meta = await sharp(file).metadata();
  const w = meta.width ?? 1536;
  const targetH = Math.round((w * 9) / 16);
  await sharp(file)
    .resize(w, targetH, { fit: "cover" })
    .webp({ quality: 84, effort: 6 })
    .toFile(path.join(OUT.backgrounds, `${slug}.webp`));
  console.log(`bg    ${slug}`);
}

async function placeCover(file, slug) {
  const meta = await sharp(file).metadata();
  const w = meta.width ?? 1536;
  const targetH = Math.round((w * 5) / 12);
  await sharp(file)
    .resize(w, targetH, { fit: "cover" })
    .webp({ quality: 84, effort: 6 })
    .toFile(path.join(OUT.covers, `${slug}.webp`));
  console.log(`cover ${slug}`);
}

async function main() {
  await Promise.all(Object.values(OUT).map((dir) => mkdir(dir, { recursive: true })));
  const files = (await readdir(SRC)).filter((f) => f.endsWith(".png"));
  for (const f of files.sort()) {
    const full = path.join(SRC, f);
    const stem = f.replace(/\.png$/, "");
    if (stem.startsWith("fo-")) await placeHex(full, stem.slice(3));
    else if (stem.startsWith("cover-")) await placeCover(full, stem.slice(6));
    else if (stem.startsWith("eq-")) await placeEquipment(full, stem.slice(3));
    else if (stem.startsWith("sp-")) await placeSprite(full, stem.slice(3));
    else if (stem.startsWith("bg-")) await placeBackground(full, stem.slice(3));
    else if (stem.startsWith("art-") || stem === "frame-artifact") {
      const name = stem.startsWith("art-") ? `${stem.slice(4)}-master.png` : "frame-artifact-master.png";
      await copyFile(full, path.join(OUT.rawArtifacts, name));
      console.log(`raw   ${name}`);
    } else console.log(`skip  ${f}`);
  }
}

await main();

#!/usr/bin/env node
import fs from "node:fs";
import sharp from "sharp";

const SLOT = [
  { x: 0.5, y: 0.5 },
  { x: 0.667, y: 0.2 },
  { x: 0.833, y: 0.5 },
  { x: 0.667, y: 0.8 },
  { x: 0.333, y: 0.8 },
  { x: 0.167, y: 0.5 },
  { x: 0.333, y: 0.2 }
];

const path = process.argv[2] || "public/assets/anime/tiles/a-s1.webp";
const slots = (process.argv[3] || "4,5").split(",").map(Number);

const meta = await sharp(path).metadata();
const W = meta.width;
const H = meta.height;
const hexSize = Math.min(W, H) / 5;

async function badge(size) {
  const svg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs>
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#000" flood-opacity="0.75"/>
    </filter>
  </defs>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
    font-family="Georgia, 'Times New Roman', serif" font-size="${Math.round(size * 0.72)}"
    font-weight="700" fill="#f0d27a" stroke="#1a1006" stroke-width="${Math.max(2, size * 0.04)}"
    paint-order="stroke" filter="url(#s)">Ⅰ</text>
</svg>`);
  return sharp(svg).png().toBuffer();
}

const composites = [];
for (const slot of slots) {
  const { x: nx, y: ny } = SLOT[slot];
  const cx = Math.round(nx * W);
  const cy = Math.round(ny * H);
  const b = await badge(Math.round(hexSize * 0.32));
  const bm = await sharp(b).metadata();
  composites.push({
    input: b,
    left: Math.round(cx - bm.width / 2),
    top: Math.round(cy - hexSize * 0.42 - bm.height / 2)
  });
}

const tmp = path + ".new.webp";
await sharp(path).composite(composites).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(tmp);
fs.copyFileSync(tmp, path);
fs.unlinkSync(tmp);
console.log("I badges on slots", slots.join(","), "→", path, fs.statSync(path).size, "alpha=" + (await sharp(path).metadata()).hasAlpha);

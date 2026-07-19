/**
 * Convert generated colored-gate JPG art into hex-masked webp tokens
 * matching the board Monolith/Whirlpool token style.
 */
import sharp from "sharp";
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const size = 512;
const cx = size / 2;
const cy = size / 2;
const r = size * 0.48;
// Flat-top hex (pointy sides left/right) — matches most board hex tokens.
const pts = [];
for (let i = 0; i < 6; i++) {
  const a = (Math.PI / 180) * (60 * i);
  pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
}
const poly = pts.join(" ");

async function hexMask(inputPath, outputPath) {
  const mask = await sharp(
    Buffer.from(
      `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><polygon points="${poly}" fill="white"/></svg>`
    )
  )
    .png()
    .toBuffer();
  const border = await sharp(
    Buffer.from(
      `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><polygon points="${poly}" fill="none" stroke="#c9a24b" stroke-width="12"/></svg>`
    )
  )
    .png()
    .toBuffer();
  await sharp(inputPath)
    .resize(size, size, { fit: "cover" })
    .ensureAlpha()
    .composite([
      { input: mask, blend: "dest-in" },
      { input: border, blend: "over" }
    ])
    .webp({ quality: 85 })
    .toFile(outputPath);
  console.log("wrote", outputPath);
}

const sessionImages = resolve(
  "C:/Users/klwar/.grok/sessions/C%3A%5CUsers%5Cklwar%5CHeroes-3-board-game-multi/019f6df9-5a6d-7852-ab8e-bbd911c0f031/images"
);
const outDir = resolve("public/assets/board/tokens");

// Session generation order for this request: red=7, blue=8, green=9, yellow=6
const map = [
  ["7.jpg", "gate-red.webp"],
  ["8.jpg", "gate-blue.webp"],
  ["9.jpg", "gate-green.webp"],
  ["6.jpg", "gate-yellow.webp"]
];

for (const [from, to] of map) {
  await hexMask(join(sessionImages, from), join(outDir, to));
}

// One-shot: optimize the codex-generated ornate kit v2 (frame / column / rail /
// plaque) into public/assets/ui/ornate/. Usage: node scripts/place-ornate-kit2.mjs <srcDir>
import sharp from "sharp";
import path from "node:path";
import fs from "node:fs";

const src = process.argv[2]; // dir with the chroma-keyed source PNGs
const out = path.resolve("public/assets/ui/ornate"); // run from the repo root
fs.mkdirSync(out, { recursive: true });

const jobs = [
  // The frame keeps high resolution — it is sliced by border-image, so edge
  // crispness matters more than file size.
  { in: "frame-ornate.png", out: "frame-ornate.webp", width: 1024 },
  { in: "column-gold.png", out: "column-gold.webp", width: 276 },
  { in: "rail-divider.png", out: "rail-divider.webp", width: 1436 },
  { in: "plaque-title.png", out: "plaque-title.webp", width: 1200 }
];

for (const j of jobs) {
  const file = path.join(out, j.out);
  await sharp(path.join(src, j.in))
    .resize({ width: j.width, withoutEnlargement: true })
    .webp({ quality: 88 })
    .toFile(file);
  const kb = Math.round(fs.statSync(file).size / 1024);
  console.log(`OK ${j.out} (${kb} kb)`);
}

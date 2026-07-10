// One-shot: optimize the codex-generated creature/foliage chrome into
// public/assets/ui/ornate/ (second batch: vines, claws, dragons, angel,
// devil, skeleton). Same pipeline as place-ornate.mjs.
import sharp from "sharp";
import path from "node:path";
import fs from "node:fs";

const src = process.argv[2]; // dir with the chroma-keyed source PNGs
const out = path.resolve("public/assets/ui/ornate"); // run from the repo root
fs.mkdirSync(out, { recursive: true });

const jobs = [
  { in: "vine-tray.png", out: "vine-tray.webp", width: 1680 },
  { in: "dragon-claw.png", out: "claw-left.webp", width: 460 },
  { in: "dragon-claw.png", out: "claw-right.webp", width: 460, flop: true },
  { in: "dragon-behind.png", out: "dragon-behind.webp", width: 1400 },
  { in: "dragon-tail.png", out: "dragon-tail.webp", width: 520 },
  { in: "azure-dragon.png", out: "azure-dragon.webp", width: 1100 },
  { in: "crystal-dragon.png", out: "crystal-dragon.webp", width: 1100 },
  { in: "angel.png", out: "angel.webp", width: 820 },
  { in: "devil.png", out: "devil.webp", width: 820 },
  { in: "skeleton.png", out: "skeleton.webp", width: 760 }
];

for (const j of jobs) {
  let img = sharp(path.join(src, j.in)).resize({ width: j.width, withoutEnlargement: true });
  if (j.flip) img = img.flip();
  if (j.flop) img = img.flop();
  const file = path.join(out, j.out);
  await img.webp({ quality: 88 }).toFile(file);
  const kb = Math.round(fs.statSync(file).size / 1024);
  console.log(`OK ${j.out} (${kb} kb)`);
}

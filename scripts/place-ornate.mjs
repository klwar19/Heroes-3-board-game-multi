// One-shot: optimize the codex-generated ornate UI art into public/assets/ui/ornate/.
import sharp from "sharp";
import path from "node:path";
import fs from "node:fs";

const src = process.argv[2]; // dir with the chroma-keyed source PNGs
const out = path.resolve("public/assets/ui/ornate"); // run from the repo root
fs.mkdirSync(out, { recursive: true });

const jobs = [
  { in: "dragon-banner.png", out: "dragon-banner.webp", width: 1600 },
  { in: "button-plate.png", out: "button-plate.webp", width: 1024 },
  { in: "grimoire.png", out: "grimoire.webp", width: 1600 },
  { in: "seal-emblem.png", out: "seal-emblem.webp", width: 420 },
  { in: "parchment-raw.png", out: "parchment.webp", width: 1024 },
  { in: "leather-panel-raw.png", out: "leather-panel.webp", width: 1024 },
  { in: "corner-flourish.png", out: "corner-tl.webp", width: 460 },
  { in: "corner-flourish.png", out: "corner-tr.webp", width: 460, flop: true },
  { in: "corner-flourish.png", out: "corner-bl.webp", width: 460, flip: true },
  { in: "corner-flourish.png", out: "corner-br.webp", width: 460, flip: true, flop: true }
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

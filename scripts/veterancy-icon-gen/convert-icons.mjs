import fs from "node:fs"; import path from "node:path"; import sharp from "sharp";
const manifest = JSON.parse(fs.readFileSync("scripts/veterancy-icon-gen/manifest.json", "utf8"));
const out = "public/game-tokens/rank-ability/veterancy"; fs.mkdirSync(out, { recursive: true });
let done = 0, missing = [];
for (const key of Object.keys(manifest)) {
  const src = `tmp/gen/${key}.png`, dst = path.join(out, `${key}.webp`);
  if (!fs.existsSync(src)) { missing.push(key); continue; }
  if (fs.existsSync(dst) && fs.statSync(dst).mtimeMs > fs.statSync(src).mtimeMs) { done++; continue; }
  await sharp(src).resize(256, 256, { fit: "cover" }).webp({ quality: 88 }).toFile(dst); done++;
}
console.log(`converted/present ${done}, missing ${missing.length}: ${missing.join(" ")}`);

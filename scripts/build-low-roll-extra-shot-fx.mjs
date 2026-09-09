/** Build the ImageGen arrow into a compact, transparent animated WebP sheet.
 * Usage: node scripts/build-low-roll-extra-shot-fx.mjs [magenta-source.png]
 * This is an asset build only; it does not run combat or tests.
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const masterPath = path.join(root, "scripts/anime-art/raw/low-roll-extra-shot/arrow.webp");
const out = path.join(root, "public/assets/fx/low-roll-extra-shot-projectile.webp");
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
if (process.argv[2]) {
  const { data, info } = await sharp(process.argv[2]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // ImageGen's flat magenta export is a build-time matte, never game artwork.
  // Despill partial edge pixels before resizing to avoid a pink fringe.
  for (let i = 0; i < data.length; i += 4) {
    const spill = Math.max(0, Math.min(data[i], data[i + 2]) - data[i + 1]);
    const matte = Math.max(0, Math.min(1, (spill - 4) / 36));
    data[i + 3] = Math.round(255 * (1 - matte));
    if (matte > 0 && matte < 1) {
      data[i] = Math.min(data[i], data[i + 1] + 25);
      data[i + 2] = Math.min(data[i + 2], data[i + 1] + 25);
    }
  }
  await fs.mkdir(path.dirname(masterPath), { recursive: true });
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim().resize({ width: 1024, withoutEnlargement: true })
    .webp({ quality: 92, alphaQuality: 100, effort: 6 }).toFile(masterPath);
}

const frames = 8, width = 96, height = 24;
const layers = [];
for (let frame = 0; frame < frames; frame++) {
  const phase = Math.sin(frame / frames * Math.PI * 2);
  const body = await sharp(masterPath)
    .resize(width - 4, height - 4, { fit: "inside" })
    .modulate({ brightness: 1 + 0.07 * phase }).png().toBuffer();
  const meta = await sharp(body).metadata();
  layers.push({ input: body, left: frame * width + width - meta.width - 2,
    top: Math.round((height - meta.height) / 2) });
}
await fs.mkdir(path.dirname(out), { recursive: true });
await sharp({ create: { width: width * frames, height, channels: 4, background: transparent } })
  .composite(layers).webp({ quality: 82, alphaQuality: 100, effort: 6 }).toFile(out);
console.log(JSON.stringify({ out, bytes: (await fs.stat(out)).size, frames, width, height }));

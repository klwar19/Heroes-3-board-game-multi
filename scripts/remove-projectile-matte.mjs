import sharp from "sharp";
import { readdir, mkdir, writeFile } from "node:fs/promises";

// Extract alpha from the original black-matted artwork, before WebP compression.
// Glow RGB is unpremultiplied so translucent edges do not retain a black fringe.
const source = "artifacts/projectile-originals";
const physical = new Set(["arrow", "axe", "baseball", "crossbow", "kunai", "rocket", "spear", "stone"]);
await mkdir("artifacts/projectile-alpha-review", { recursive: true });
let total = 0;
for (const file of (await readdir(source)).filter((name) => name.endsWith("-shot-phases.png"))) {
  const name = file.replace("-shot-phases.png", "");
  const { data, info } = await sharp(`${source}/${file}`).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(info.width * info.height * 4);
  let transparent = 0;
  for (let p = 0; p < info.width * info.height; p++) {
    const i = p * 3, o = p * 4;
    const peak = Math.max(data[i], data[i + 1], data[i + 2]);
    // Tiny compression/background noise must be fully invisible. Physical
    // materials become opaque sooner; luminous trails retain graded alpha.
    const alpha = peak <= 5 ? 0 : Math.min(1, (peak - 5) / (physical.has(name) ? 35 : 250));
    rgba[o + 3] = Math.round(alpha * 255);
    if (!rgba[o + 3]) transparent++;
    for (let c = 0; c < 3; c++) rgba[o + c] = alpha ? Math.min(255, Math.round(data[i + c] / alpha)) : 0;
  }
  const raw = { width: info.width, height: info.height, channels: 4 };
  const output = await sharp(rgba, { raw }).webp({ quality: 85, alphaQuality: 100, effort: 6 }).toBuffer();
  const metadata = await sharp(output).metadata();
  if (!metadata.hasAlpha || transparent < info.width * info.height * 0.1) throw new Error(`No usable alpha: ${name}`);
  await writeFile(`public/fx/${name}-shot-phases-alpha.webp`, output);
  for (const [label, background] of [["light", "#eee8dc"], ["blue", "#385e83"]]) {
    await sharp(output).flatten({ background }).resize(752).png().toFile(`artifacts/projectile-alpha-review/${name}-${label}.png`);
  }
  total += output.length;
  console.log(`${name}: alpha confirmed, ${transparent} fully transparent pixels, ${output.length} bytes`);
}
console.log(`Total: ${total} bytes`);

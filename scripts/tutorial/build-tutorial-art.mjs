#!/usr/bin/env node
/**
 * Turn the Codex tutorial masters (tmp/gen/tutorial/raw/*.png, made by
 * codex-gen-tutorial.mjs) into the lightweight runtime webps:
 *
 *   Sandro mentor poses  -> public/assets/tutorial/sandro-<pose>.webp (480x640)
 *   welcome banner       -> public/assets/ui/menu/help/tutorial-welcome.webp (900 wide)
 *   menu icons           -> public/assets/ui/menu/help/<name>-icon.webp (128x128)
 *   chapter medals       -> public/assets/tutorial/medal-1..8.webp (sliced from one 4x2 sheet, round alpha)
 *   frame filigree       -> public/assets/tutorial/filigree.webp (gold on black keyed to alpha)
 *   victory certificate  -> public/assets/tutorial/certificate.webp
 *
 * Then `npm run media:publish` and commit the manifest files.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RAW = path.join(ROOT, "tmp", "gen", "tutorial", "raw");
const out = (...parts) => path.join(ROOT, "public", "assets", ...parts);

const jobs = [
  ...["teach", "cheer", "warn", "think"].map((pose) => ({
    raw: `sandro-${pose}.png`,
    target: out("tutorial", `sandro-${pose}.webp`),
    run: (image) => image.resize({ width: 480, height: 640, fit: "cover", position: "top" }).webp({ quality: 80, effort: 6 }),
  })),
  {
    raw: "sandro-welcome.png",
    target: out("ui", "menu", "help", "tutorial-welcome.webp"),
    run: (image) => image.resize({ width: 900 }).webp({ quality: 78, effort: 6 }),
  },
  ...["rulebook", "tutorial"].map((name) => ({
    raw: `icon-${name}.png`,
    target: out("ui", "menu", "help", `${name}-icon.webp`),
    run: (image) => image.resize({ width: 128, height: 128, fit: "cover" }).webp({ quality: 86, effort: 6 }),
  })),
];

// Gold filigree painted on pure black: alpha = brightness, colour un-premultiplied.
async function keyOnBlack(source) {
  const { data, info } = await sharp(source).trim({ threshold: 12 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const peak = Math.max(data[i], data[i + 1], data[i + 2]);
    const alpha = Math.min(255, Math.max(0, (peak - 10) * 1.6));
    if (alpha > 0) {
      const scale = 255 / Math.max(peak, 1);
      data[i] = Math.min(255, data[i] * scale);
      data[i + 1] = Math.min(255, data[i + 1] * scale);
      data[i + 2] = Math.min(255, data[i + 2] * scale);
    }
    data[i + 3] = alpha;
  }
  return sharp(data, { raw: info });
}

jobs.push({
  raw: "coach-filigree.png",
  target: out("tutorial", "filigree.webp"),
  custom: async (source, target) => (await keyOnBlack(source)).resize({ width: 240 }).webp({ quality: 88, alphaQuality: 90, effort: 6 }).toFile(target),
});
jobs.push({
  raw: "victory-certificate.png",
  target: out("tutorial", "certificate.webp"),
  run: (image) => image.resize({ width: 1100 }).webp({ quality: 78, effort: 6 }),
});
jobs.push({
  raw: "chapter-medals.png",
  target: out("tutorial", "medal-1.webp"),
  custom: async (source) => {
    const meta = await sharp(source).metadata();
    const cellW = meta.width / 4;
    const cellH = meta.height / 2;
    const size = Math.round(Math.min(cellW, cellH) * 0.9);
    // sharp composites after the resize, so the round mask is drawn at the output size.
    const mask = Buffer.from(`<svg width="128" height="128"><circle cx="64" cy="64" r="61" fill="#fff"/></svg>`);
    let total = 0;
    for (let n = 0; n < 8; n += 1) {
      const cx = (n % 4) * cellW + cellW / 2;
      const cy = Math.floor(n / 4) * cellH + cellH / 2;
      const info = await sharp(source)
        .extract({ left: Math.round(cx - size / 2), top: Math.round(cy - size / 2), width: size, height: size })
        .ensureAlpha()
        .composite([{ input: mask, blend: "dest-in" }])
        .resize({ width: 128, height: 128 })
        .webp({ quality: 86, alphaQuality: 90, effort: 6 })
        .toFile(out("tutorial", `medal-${n + 1}.webp`));
      total += info.size;
    }
    return { width: 128, height: 128, size: total };
  },
});

for (const job of jobs) {
  const source = path.join(RAW, job.raw);
  if (!fs.existsSync(source)) {
    console.warn(`missing ${job.raw} (run codex-gen-tutorial.mjs first)`);
    continue;
  }
  fs.mkdirSync(path.dirname(job.target), { recursive: true });
  const info = job.custom ? await job.custom(source, job.target) : await job.run(sharp(source)).toFile(job.target);
  console.log(`${path.relative(ROOT, job.target)} ${info.width}x${info.height} ${(info.size / 1024).toFixed(0)} KB`);
}

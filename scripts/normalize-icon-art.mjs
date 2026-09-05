#!/usr/bin/env node

// Normalizes a freshly generated icon to the repo's icon convention: 512x512
// WebP. The image_gen tool hands back a ~1024-1248 px master at 0.5-3 MB, which
// is 10-30x the size of every icon already in public/assets/anime/icons — this
// brings a new one into the same band without a second generation.
//
// Run: node scripts/normalize-icon-art.mjs <file> [file ...] [--size 512] [--quality 85]

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const argv = process.argv.slice(2);
const size = Number(argv[argv.indexOf("--size") + 1]) || 512;
const quality = Number(argv[argv.indexOf("--quality") + 1]) || 85;
const files = argv.filter((arg, i) => !arg.startsWith("--") && !argv[i - 1]?.startsWith("--"));

for (const file of files) {
  const before = readFileSync(file);
  const meta = await sharp(before).metadata();
  if (meta.width === size && meta.height === size && before.length < 120_000) {
    console.log(`skip ${path.basename(file)} (${meta.width}x${meta.height}, ${before.length} B)`);
    continue;
  }
  const out = await sharp(before)
    .resize(size, size, { fit: "cover", position: "attention" })
    .webp({ quality, effort: 6 })
    .toBuffer();
  writeFileSync(file, out);
  console.log(`${path.basename(file)}: ${meta.width}x${meta.height} ${before.length} B -> ${size}x${size} ${out.length} B`);
}

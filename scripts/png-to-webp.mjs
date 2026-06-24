#!/usr/bin/env node
// Convert finished card PNGs (downloaded from Gemini) into the .webp files the
// game expects, copying them over the placeholders in public/assets.
//
// Setup once:  npm install -D sharp
// Usage:       node scripts/png-to-webp.mjs out/bulwark public/assets
//
// For every <name>.png in <srcDir>, writes <name>.webp into <destDir>.

import sharp from "sharp";
import { readdir } from "node:fs/promises";
import { join, basename, extname } from "node:path";

const srcDir = process.argv[2] || "out/bulwark";
const destDir = process.argv[3] || "public/assets";

const files = (await readdir(srcDir)).filter(
  (f) => extname(f).toLowerCase() === ".png",
);

if (files.length === 0) {
  console.error(`no .png files found in ${srcDir}`);
  process.exit(1);
}

for (const f of files) {
  const name = basename(f, ".png");
  const out = join(destDir, name + ".webp");
  await sharp(join(srcDir, f))
    .webp({ quality: 92 })
    .toFile(out);
  console.log("wrote", out);
}

console.log(`\ndone: ${files.length} card(s) converted into ${destDir}`);

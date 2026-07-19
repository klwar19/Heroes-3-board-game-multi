#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetDir = path.join(root, "public", "assets", "anime", "tiles");

const tiles = [
  {
    slug: "a-s1",
    points: "626,14 1198,342 1198,909 626,1241 56,909 56,342"
  },
  {
    slug: "w-s1",
    points: "416,14 628,135 835,14 1044,135 1044,376 1253,496 1253,744 1044,866 1044,1108 835,1229 628,1108 416,1229 207,1108 207,866 0,744 0,496 207,376 207,135"
  }
];

for (const tile of tiles) {
  const input = path.join(assetDir, `${tile.slug}.png`);
  const output = path.join(assetDir, `${tile.slug}.webp`);
  const mask = Buffer.from(
    `<svg width="1254" height="1254" xmlns="http://www.w3.org/2000/svg"><polygon points="${tile.points}" fill="white"/></svg>`
  );
  await sharp(input)
    .resize(1254, 1254, { fit: "fill" })
    .composite([{ input: mask, blend: "dest-in" }])
    .webp({ quality: 88, alphaQuality: 100, effort: 6 })
    .toFile(output);
  console.log(path.relative(root, output));
}

#!/usr/bin/env node
// Forge Watchers' ranged attack: a light, plasma-toned twin of the Evil Eye's
// authored beam atlas (same 4x4 grid of 444x222 frames, same growth / pulse /
// dissipate timing). Only the colour changes: the teal psionic ray is shifted
// to a pale blue-white plasma and lifted in brightness; alpha is untouched so
// the sheet keeps the exact silhouette and frame registration.
//
//   node scripts/build-watcher-plasma-beam.mjs
import sharp from "sharp";

const SRC = "public/fx/evil-eye-beam-animated.webp";
const OUT = "public/fx/forge-watcher-plasma-beam.webp";

const input = sharp(SRC);
const meta = await input.metadata();
const alpha = await sharp(SRC).extractChannel("alpha").toBuffer();
const rgb = await sharp(SRC)
  .removeAlpha()
  .modulate({ hue: 32, saturation: 0.72, brightness: 1.28 })
  .toBuffer();
await sharp(rgb)
  .joinChannel(alpha)
  .webp({ quality: 85, alphaQuality: 90, effort: 6 })
  .toFile(OUT);
const out = await sharp(OUT).metadata();
if (out.width !== meta.width || out.height !== meta.height || !out.hasAlpha) {
  throw new Error(`frame grid drift: ${out.width}x${out.height} alpha=${out.hasAlpha}`);
}
console.log(`wrote ${OUT} ${out.width}x${out.height}`);

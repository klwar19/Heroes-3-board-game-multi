#!/usr/bin/env node
/**
 * Build the Blue Archive commander Ibuki "Sniper Shot" battle FX sprite sheets
 * from two codex image_gen masters (2026-09-04, NOT committed):
 *
 *   tmp/gen/sniper-tracer.png  — a horizontal bullet tracer, tip at the RIGHT,
 *                                streak trailing left, transparent background
 *   tmp/gen/sniper-impact.png  — a spark-burst impact flash, transparent bg
 *
 * Outputs (committed, referenced by src/data/fx-manifest.json):
 *   public/assets/fx/sniper-shot-projectile.webp  8 frames × 160×40, 24 fps
 *   public/assets/fx/sniper-shot-hit.webp        10 frames × 128×128, 24 fps
 *
 * The projectile keeps the arrow convention (tip right, the stage rotates it in
 * flight); frames shimmer the streak (length + brightness) so the tracer reads as
 * a live shot. The hit expands from a pin-point flash and fades out.
 *
 *   node scripts/build-sniper-shot-fx.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GEN = path.join(root, "tmp", "gen");
const OUT = path.join(root, "public", "assets", "fx");
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

async function trimmed(file) {
  // Crop to the alpha bounding box so the frames use the whole cell.
  return sharp(file).ensureAlpha().trim({ background: TRANSPARENT, threshold: 8 }).png().toBuffer();
}

async function buildProjectile() {
  const FRAMES = 8;
  const W = 160;
  const H = 40;
  const master = await trimmed(path.join(GEN, "sniper-tracer.png"));
  const frames = [];
  for (let i = 0; i < FRAMES; i++) {
    // Streak length breathes 100% → 86% → 100%; brightness pulses with it.
    const phase = Math.sin((i / FRAMES) * Math.PI * 2);
    const lengthScale = 0.93 + 0.07 * phase;
    const width = Math.max(8, Math.round(W * lengthScale));
    const body = await sharp(master)
      .resize(width, H, { fit: "inside", background: TRANSPARENT })
      .modulate({ brightness: 1 + 0.12 * phase })
      .png()
      .toBuffer();
    const meta = await sharp(body).metadata();
    // Anchor the bullet tip at the right edge of the cell.
    frames.push(
      await sharp({ create: { width: W, height: H, channels: 4, background: TRANSPARENT } })
        .composite([{ input: body, left: W - meta.width, top: Math.round((H - meta.height) / 2) }])
        .png()
        .toBuffer()
    );
  }
  const out = path.join(OUT, "sniper-shot-projectile.webp");
  await sharp({ create: { width: W * FRAMES, height: H, channels: 4, background: TRANSPARENT } })
    .composite(frames.map((input, i) => ({ input, left: i * W, top: 0 })))
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(out);
  return { out, frames: FRAMES, frameWidth: W, frameHeight: H };
}

async function buildHit() {
  const FRAMES = 10;
  const S = 128;
  const master = await trimmed(path.join(GEN, "sniper-impact.png"));
  const frames = [];
  for (let i = 0; i < FRAMES; i++) {
    const t = i / (FRAMES - 1);
    // Fast expansion (ease-out) from a pin-point flash, then a fade-out tail.
    const scale = 0.28 + 0.92 * (1 - Math.pow(1 - t, 2.2));
    const opacity = t < 0.3 ? 1 : Math.max(0, 1 - (t - 0.3) / 0.7);
    const size = Math.max(4, Math.round(S * Math.min(1, scale)));
    const burst = await sharp(master)
      .resize(size, size, { fit: "inside", background: TRANSPARENT })
      .ensureAlpha()
      .composite([{ input: Buffer.from([255, 255, 255, Math.round(255 * opacity)]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: "dest-in" }])
      .png()
      .toBuffer();
    const meta = await sharp(burst).metadata();
    frames.push(
      await sharp({ create: { width: S, height: S, channels: 4, background: TRANSPARENT } })
        .composite([{ input: burst, left: Math.round((S - meta.width) / 2), top: Math.round((S - meta.height) / 2) }])
        .png()
        .toBuffer()
    );
  }
  const out = path.join(OUT, "sniper-shot-hit.webp");
  await sharp({ create: { width: S * FRAMES, height: S, channels: 4, background: TRANSPARENT } })
    .composite(frames.map((input, i) => ({ input, left: i * S, top: 0 })))
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(out);
  return { out, frames: FRAMES, frameWidth: S, frameHeight: S };
}

const results = [await buildProjectile(), await buildHit()];
for (const r of results) {
  const meta = await sharp(r.out).metadata();
  console.log(path.relative(root, r.out), `${meta.width}x${meta.height}`, `${r.frames}f ${r.frameWidth}x${r.frameHeight}`);
}

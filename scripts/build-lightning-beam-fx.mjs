// Builds public/fx/lightning-beam-sheet.webp (LIGHTNING_BEAM_SHEET in
// src/data/fx.ts) from the Codex master generated-session-art/forge/fx/
// lightning-beam-master.png: four horizontal bolts on a dark background, one
// per band. Each bolt is re-centred in its own frame row and the background is
// keyed out to real alpha (brightness above the background level).
import sharp from "sharp";

const SRC = "generated-session-art/forge/fx/lightning-beam-master.png";
const OUT = "public/fx/lightning-beam-sheet.webp";
const FRAMES = 4;
const OUT_W = 1024;
const FRAME_H = 128;

const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const lum = (x, y) => {
  const i = (y * W + x) * 3;
  return Math.max(data[i], data[i + 1], data[i + 2]);
};
// Background level: a low percentile of brightness over the whole image.
const samples = [];
for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) samples.push(lum(x, y));
samples.sort((a, b) => a - b);
const bg = samples[Math.floor(samples.length * 0.5)];
// Bolt centre per band = the row with the most bright pixels.
const band = H / FRAMES;
const bandHalf = Math.round((band * 0.8) / 2);
const frames = [];
for (let f = 0; f < FRAMES; f += 1) {
  let bestY = 0, best = -1;
  for (let y = Math.round(f * band); y < Math.round((f + 1) * band); y += 1) {
    let s = 0;
    for (let x = 0; x < W; x += 2) if (lum(x, y) > 200) s += 1;
    if (s > best) { best = s; bestY = y; }
  }
  const top = Math.max(0, Math.min(H - 2 * bandHalf, bestY - bandHalf));
  const rgba = Buffer.alloc(W * 2 * bandHalf * 4);
  for (let y = 0; y < 2 * bandHalf; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = ((top + y) * W + x) * 3;
      const o = (y * W + x) * 4;
      const a = Math.max(0, Math.min(1, (lum(x, top + y) - bg - 6) / (255 - bg - 6)));
      rgba[o] = data[i]; rgba[o + 1] = data[i + 1]; rgba[o + 2] = data[i + 2];
      rgba[o + 3] = Math.round(255 * Math.pow(a, 0.8));
    }
  }
  frames.push(await sharp(rgba, { raw: { width: W, height: 2 * bandHalf, channels: 4 } })
    .resize(OUT_W, FRAME_H, { fit: "fill", kernel: "lanczos3" }).png().toBuffer());
}
await sharp({ create: { width: OUT_W, height: FRAME_H * FRAMES, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(frames.map((input, f) => ({ input, left: 0, top: f * FRAME_H })))
  .webp({ quality: 85, alphaQuality: 90, effort: 6 })
  .toFile(OUT);
console.log(`wrote ${OUT} (bg level ${bg})`);

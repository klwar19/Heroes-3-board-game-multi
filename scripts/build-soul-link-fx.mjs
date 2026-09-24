// Builds public/fx/soul-link-sheet.webp (SOUL_LINK_SHEET in src/data/fx.ts)
// from the Codex master tmp/gen/soul-link/soul-link-master.png: four horizontal
// spectral soul-chains on pure black, one per quarter-height band.
//
// Each chain is re-centred in its own frame row, made SEAMLESSLY TILEABLE along
// x (the last SEAM px of the crop are cross-faded into the first, so the strip
// can repeat-x along a tether of any length without stretching the links), and
// the black background is keyed out to real alpha (brightness). Deterministic:
// same master in, same sheet out.
import sharp from "sharp";

const SRC = "tmp/gen/soul-link/soul-link-master.png";
const OUT = "public/fx/soul-link-sheet.webp";
const FRAMES = 4;
const FRAME_H = 160;
const OUT_W = 960;
/** Cross-fade width (source px) that makes each row wrap seamlessly. */
const SEAM = 192;

const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const lum = (x, y) => {
  const i = (y * W + x) * 3;
  return Math.max(data[i], data[i + 1], data[i + 2]);
};
// Background level: median brightness (the master is mostly black).
const samples = [];
for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) samples.push(lum(x, y));
samples.sort((a, b) => a - b);
const bg = samples[Math.floor(samples.length * 0.5)];

const band = H / FRAMES;
const bandHalf = Math.round((band * 0.9) / 2);
const rowH = 2 * bandHalf;
const tileW = W - SEAM;
const frames = [];
for (let f = 0; f < FRAMES; f += 1) {
  // Chain centre per band = the row with the most bright (glowing core) pixels.
  let bestY = 0;
  let best = -1;
  for (let y = Math.round(f * band); y < Math.round((f + 1) * band); y += 1) {
    let s = 0;
    for (let x = 0; x < W; x += 2) if (lum(x, y) > 170) s += 1;
    if (s > best) { best = s; bestY = y; }
  }
  const top = Math.max(0, Math.min(H - rowH, bestY - bandHalf));
  const rgba = Buffer.alloc(tileW * rowH * 4);
  for (let y = 0; y < rowH; y += 1) {
    // Soften the band's top/bottom edge so a stray wisp never shows a hard cut.
    const edge = Math.min(y, rowH - 1 - y) / (rowH * 0.12);
    const vFade = Math.max(0, Math.min(1, edge));
    for (let x = 0; x < tileW; x += 1) {
      // x < SEAM: blend the column past the tile end (src[x + tileW]) into the
      // start (src[x]) so column tileW-1 flows into column 0 on wrap.
      const t = x < SEAM ? x / SEAM : 1;
      const a = ((top + y) * W + x) * 3;
      const b = ((top + y) * W + Math.min(W - 1, x + tileW)) * 3;
      const r = data[a] * t + data[b] * (1 - t);
      const g = data[a + 1] * t + data[b + 1] * (1 - t);
      const bl = data[a + 2] * t + data[b + 2] * (1 - t);
      const l = Math.max(r, g, bl);
      const alpha = Math.max(0, Math.min(1, (l - bg - 6) / (255 - bg - 6))) * vFade;
      const o = (y * tileW + x) * 4;
      rgba[o] = Math.round(r);
      rgba[o + 1] = Math.round(g);
      rgba[o + 2] = Math.round(bl);
      rgba[o + 3] = Math.round(255 * Math.pow(alpha, 0.8));
    }
  }
  frames.push(await sharp(rgba, { raw: { width: tileW, height: rowH, channels: 4 } })
    .resize(OUT_W, FRAME_H, { fit: "fill", kernel: "lanczos3" }).png().toBuffer());
}
await sharp({ create: { width: OUT_W, height: FRAME_H * FRAMES, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(frames.map((input, f) => ({ input, left: 0, top: f * FRAME_H })))
  .webp({ quality: 86, alphaQuality: 90, effort: 6 })
  .toFile(OUT);
console.log(`wrote ${OUT} ${OUT_W}x${FRAME_H * FRAMES} (bg level ${bg}, source row ${tileW}x${rowH})`);

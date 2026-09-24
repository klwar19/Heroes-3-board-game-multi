// Builds public/assets/specialty-card/icon-weakness.webp — Cuthbert's Weakness
// spell SYMBOL in the HoMM3 spell-icon format of icon-stone_skin.webp /
// icon-cure.webp (subject inside the tan scroll cartouche, transparent outside)
// from the Codex master tmp/gen/cuthbert-weakness/weakness-icon-master.png,
// which was painted on a flat chroma-green (#00FF00) background.
//
// Deterministic post-process: key the green out to real alpha (soft 1–2 px
// edge + green despill), trim to the cartouche, then fit it (contain, centred,
// transparent padding) into 640x458 — 2x the 320x229 icon aspect.
import sharp from "sharp";

const SRC = "tmp/gen/cuthbert-weakness/weakness-icon-master.png";
const OUT = "public/assets/specialty-card/icon-weakness.webp";
const OUT_W = 640;
const OUT_H = 458;
/** Green dominance (g - max(r, b)) at/above which a pixel is background. */
const KEY_HARD = 110;
/** Below this it is fully opaque; in between the edge is feathered. */
const KEY_SOFT = 45;

const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const rgba = Buffer.alloc(W * H * 4);
for (let p = 0; p < W * H; p += 1) {
  const r = data[p * 3];
  const g = data[p * 3 + 1];
  const b = data[p * 3 + 2];
  const dominance = g - Math.max(r, b);
  let alpha = 1;
  if (dominance >= KEY_HARD) alpha = 0;
  else if (dominance > KEY_SOFT) alpha = 1 - (dominance - KEY_SOFT) / (KEY_HARD - KEY_SOFT);
  // Despill: a pixel that leans green (the anti-aliased rim) is pulled back to
  // the cartouche's warm tan instead of keeping a green fringe.
  const gOut = dominance > 0 ? Math.max(r, b) : g;
  rgba[p * 4] = r;
  rgba[p * 4 + 1] = gOut;
  rgba[p * 4 + 2] = b;
  rgba[p * 4 + 3] = Math.round(alpha * 255);
}

const trimmed = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
  .trim({ threshold: 1 })
  .png()
  .toBuffer({ resolveWithObject: true });
await sharp(trimmed.data)
  .resize(OUT_W, OUT_H, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: "lanczos3" })
  .webp({ quality: 92, alphaQuality: 100, effort: 6 })
  .toFile(OUT);
console.log(`wrote ${OUT} ${OUT_W}x${OUT_H} (cartouche ${trimmed.info.width}x${trimmed.info.height})`);

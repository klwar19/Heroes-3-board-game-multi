// Chroma-key -> alpha for codex-generated UI art (green #00ff00 background).
// Usage: node chroma-key.mjs <in.png> <out.png> [--no-trim]
// - key color auto-sampled from border pixels (median)
// - soft matte between transparent/opaque thresholds
// - edge un-blend (removes the green contribution from antialiased edges)
// - trims transparent margins (keeps a small pad) unless --no-trim
import sharp from "sharp";

const [input, output, ...flags] = process.argv.slice(2);
const noTrim = flags.includes("--no-trim");

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;

// --- 1. key color = median of border pixels ---
const border = { r: [], g: [], b: [] };
const pushPx = (x, y) => {
  const i = (y * width + x) * channels;
  border.r.push(data[i]);
  border.g.push(data[i + 1]);
  border.b.push(data[i + 2]);
};
for (let x = 0; x < width; x += 4) {
  pushPx(x, 0);
  pushPx(x, height - 1);
}
for (let y = 0; y < height; y += 4) {
  pushPx(0, y);
  pushPx(width - 1, y);
}
const median = (arr) => arr.sort((a, b) => a - b)[Math.floor(arr.length / 2)];
const key = { r: median(border.r), g: median(border.g), b: median(border.b) };
console.log(`key color: rgb(${key.r},${key.g},${key.b})`);

// --- 2. soft matte + edge un-blend ---
const T0 = 26; // dist <= T0 -> fully transparent
const T1 = 150; // dist >= T1 -> fully opaque
const out = Buffer.alloc(width * height * 4);
for (let p = 0; p < width * height; p += 1) {
  const i = p * channels;
  const o = p * 4;
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const dist = Math.sqrt((r - key.r) ** 2 + (g - key.g) ** 2 + (b - key.b) ** 2);
  let a = (dist - T0) / (T1 - T0);
  a = Math.max(0, Math.min(1, a));
  let nr = r;
  let ng = g;
  let nb = b;
  if (a > 0.02 && a < 0.98) {
    // un-blend: P = S*a + K*(1-a)  =>  S = (P - K*(1-a)) / a
    nr = Math.max(0, Math.min(255, Math.round((r - key.r * (1 - a)) / a)));
    ng = Math.max(0, Math.min(255, Math.round((g - key.g * (1 - a)) / a)));
    nb = Math.max(0, Math.min(255, Math.round((b - key.b * (1 - a)) / a)));
  }
  // despill: any remaining green dominance near edges gets clamped
  if (a < 1 && ng > Math.max(nr, nb)) {
    ng = Math.max(nr, nb);
  }
  out[o] = nr;
  out[o + 1] = ng;
  out[o + 2] = nb;
  out[o + 3] = Math.round(a * 255);
}

// --- 3. bounding box of non-transparent content ---
let minX = width;
let minY = height;
let maxX = -1;
let maxY = -1;
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    if (out[(y * width + x) * 4 + 3] > 8) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
if (maxX < 0) {
  console.error("ERROR: everything keyed out — wrong key color?");
  process.exit(1);
}

let img = sharp(out, { raw: { width, height, channels: 4 } });
if (!noTrim) {
  const pad = 6;
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  img = img.extract({
    left,
    top,
    width: Math.min(width, maxX + pad + 1) - left,
    height: Math.min(height, maxY + pad + 1) - top
  });
}
await img.png().toFile(output);
const opaque = (() => {
  let n = 0;
  for (let p = 3; p < out.length; p += 4) {
    if (out[p] > 200) n += 1;
  }
  return ((100 * n) / (width * height)).toFixed(1);
})();
console.log(`OK ${output} — content ${minX},${minY}..${maxX},${maxY} (${opaque}% opaque)`);

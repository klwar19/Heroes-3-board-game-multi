#!/usr/bin/env node
/**
 * Rebuild the breath atlases (dragon fire, faerie rainbow, phoenix flame) from
 * their image-generated masters as one continuous animation.
 *
 * ImageGen paints every frame independently, so the raw sheets play as a
 * flicker: the mouth jumps around the cell, flame length pops from frame to
 * frame, tips bleed into neighbouring cells and bursts are clipped flat. This
 * keeps the painted frames and fixes the motion:
 *   - frames are located by their flame bodies (not the nominal grid), cleaned
 *     of fragments from neighbouring cells and registered to one fixed mouth;
 *   - consecutive keys cross-dissolve (union alpha, so no see-through holes)
 *     while stretching away from the mouth, so the fire streams outward;
 *   - optional ignition (noisy growing front) and cut-off (flame detaches from
 *     the mouth, cools and drifts on) wrap sheets that have no real timeline;
 *   - clipped borders are feathered so no frame ends in a straight edge.
 *
 * Masters are local-only (scripts/anime-art/raw is gitignored for PNGs):
 *   dragon-fire-breath-32f-master.png, faerie-rainbow-breath-32f-master.png
 *   (the original 4x8 ImageGen sheets) and phoenix-flame-breath-v2.png.
 *
 * Usage: node scripts/build-breath-fx.mjs [dragon] [faerie] [phoenix]
 */
import path from "node:path";
import { existsSync } from "node:fs";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const raw = (name) => path.join(root, "scripts", "anime-art", "raw", name);
const fx = (name) => path.join(root, "public", "fx", name);

// The dragon master holds 32 unordered takes; these eight share a full-length
// silhouette and are ordered so neighbouring keys dissolve into each other.
const dragonKeys = [0, 12, 20, 8, 16, 4, 21, 11];
const dragonBreath = {
  srcCols: 4, srcRows: 8, srcCellHeight: 160, keys: dragonKeys,
  cols: 4, rows: 8, cellWidth: 320, cellHeight: 160, frames: 32,
  mouthX: 16, mouthY: 80, bodyInset: 8, lengthScale: 1.04, flow: 0.09, dissolvePower: 1.6,
  ignite: 6, decay: 8, cone: true, trimLeft: true,
  nozzle: { length: 30, width: 5 },
  sourceFeather: { right: 34, vertical: 14 }, rightFeather: 22,
};
const presets = {
  dragon: { ...dragonBreath, source: raw("dragon-fire-breath-32f-master.png"), output: fx("dragon-fire-breath-32f.webp"), cool: [1, 0.8, 0.6] },
  // Same silhouettes, recoloured; identical timing keeps the two breaths in step.
  faerie: { ...dragonBreath, source: raw("faerie-rainbow-breath-32f-master.png"), output: fx("faerie-rainbow-breath-32f.webp"), cool: [0.85, 0.85, 0.95] },
  // A real 16-frame chronology (ignite, spread, burst, break-up) whose frames
  // drift ~50px within each row and sit in 235px bands; register and
  // interpolate it to 32 frames played at 64fps (same 0.5s runtime).
  phoenix: {
    source: raw("phoenix-flame-breath-v2.png"), output: fx("phoenix-flame-flow-animated.webp"),
    srcCols: 4, srcRows: 4, srcCellHeight: 235, alphaFloor: 32 / 255, autoSlice: true,
    keys: Array.from({ length: 16 }, (_, index) => index),
    cols: 4, rows: 8, cellWidth: 418, cellHeight: 168, frames: 32,
    mouthX: 24, mouthY: 84, bodyInset: 0, lengthScale: 1, flow: 0.05, dissolvePower: 1.3,
    ignite: 0, decay: 0, cone: false, trimLeft: false, nozzle: null, headSquash: 0.3,
    sourceFeather: { right: 20, vertical: 6 }, rightFeather: 30,
  },
};

const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function valueNoise(x, y) {
  const X = Math.floor(x), Y = Math.floor(y), fx = x - X, fy = y - Y, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hash(X, Y), hash(X + 1, Y), u), lerp(hash(X, Y + 1), hash(X + 1, Y + 1), u), v);
}
const fbm = (x, y) => valueNoise(x, y) * 0.55 + valueNoise(x * 2.1, y * 2.1) * 0.3 + valueNoise(x * 4.3, y * 4.3) * 0.15;

/** Premultiplied RGBA window at absolute sheet coordinates. */
function extractWindow(image, left, top, width, height, alphaFloor) {
  const { data, info } = image, frame = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = left + x, sy = top + y;
    if (sx < 0 || sy < 0 || sx >= info.width || sy >= info.height) continue;
    const i = (sy * info.width + sx) * 4, o = (y * width + x) * 4;
    const alpha = clamp((data[i + 3] / 255 - alphaFloor) / (1 - alphaFloor));
    frame[o] = data[i] / 255 * alpha; frame[o + 1] = data[i + 1] / 255 * alpha; frame[o + 2] = data[i + 2] / 255 * alpha; frame[o + 3] = alpha;
  }
  return frame;
}

/** Left edge of each row's flames, found as that row's largest solid bodies. */
function sliceByBodies(image, cols, rows, bandHeight) {
  const { data, info } = image, width = info.width, origins = [];
  for (let row = 0; row < rows; row++) {
    const top = row * bandHeight, label = new Int32Array(width * bandHeight).fill(-1), bodies = [];
    const solid = (x, y) => data[((top + y) * width + x) * 4 + 3] >= 90;
    for (let seed = 0; seed < width * bandHeight; seed++) {
      if (label[seed] >= 0 || !solid(seed % width, Math.floor(seed / width))) continue;
      const id = bodies.length, stack = [seed]; label[seed] = id; let mass = 0, left = width;
      while (stack.length) {
        const q = stack.pop(), x = q % width, y = (q - x) / width; mass++; left = Math.min(left, x);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= width || ny >= bandHeight) continue;
          const k = ny * width + nx; if (label[k] < 0 && solid(nx, ny)) { label[k] = id; stack.push(k); }
        }
      }
      bodies.push({ mass, left });
    }
    const flames = bodies.sort((a, b) => b.mass - a.mass).slice(0, cols).sort((a, b) => a.left - b.left);
    if (flames.length !== cols) throw new Error(`Row ${row}: found ${flames.length} flame bodies, expected ${cols}`);
    for (const flame of flames) origins.push([flame.left, top]);
  }
  return origins;
}

/** Keep the main flame and nearby embers; drop fragments bled in from other cells. */
function keepMainFlame(frame, width, height) {
  const label = new Int32Array(width * height).fill(-1), parts = [];
  for (let seed = 0; seed < width * height; seed++) {
    if (label[seed] >= 0 || frame[seed * 4 + 3] < 0.06) continue;
    const id = parts.length, stack = [seed]; label[seed] = id;
    let pixels = 0, mass = 0, x0 = width, x1 = 0, y0 = height, y1 = 0;
    while (stack.length) {
      const q = stack.pop(), x = q % width, y = (q - x) / width;
      pixels++; mass += frame[q * 4 + 3]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const k = ny * width + nx; if (label[k] < 0 && frame[k * 4 + 3] >= 0.06) { label[k] = id; stack.push(k); }
      }
    }
    parts.push({ pixels, mass, x0, x1, y0, y1 });
  }
  if (!parts.length) return;
  const main = parts.reduce((a, b) => b.mass > a.mass ? b : a);
  const keep = parts.map((part) => part === main || (part.pixels < 400 && part.x0 > main.x0 + 10 && part.x0 >= 2
    && part.x1 <= width - 3 && part.y0 > main.y0 - 25 && part.y1 < main.y1 + 25));
  for (let i = 0; i < width * height; i++) {
    if (label[i] < 0 || !keep[label[i]]) frame[i * 4] = frame[i * 4 + 1] = frame[i * 4 + 2] = frame[i * 4 + 3] = 0;
  }
}

/** Body start (first well-covered column) and the flame axis just behind it. */
function measureBody(frame, width, height) {
  const coverage = new Float32Array(width);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) coverage[x] += frame[(y * width + x) * 4 + 3];
  let bodyX = 0; while (bodyX < width - 1 && coverage[bodyX] < height * 0.1) bodyX++;
  let weighted = 0, total = 0;
  for (let x = bodyX; x < Math.min(width, bodyX + 40); x++) for (let y = 0; y < height; y++) {
    const alpha = frame[(y * width + x) * 4 + 3]; weighted += y * alpha; total += alpha;
  }
  return { bodyX, axisY: weighted / Math.max(1e-6, total) };
}

function sampleBilinear(frame, width, height, x, y, out) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  out[0] = out[1] = out[2] = out[3] = 0;
  for (const [sx, sy, k] of [[x0, y0, (1 - fx) * (1 - fy)], [x0 + 1, y0, fx * (1 - fy)], [x0, y0 + 1, (1 - fx) * fy], [x0 + 1, y0 + 1, fx * fy]]) {
    if (k === 0 || sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
    const i = (sy * width + sx) * 4;
    out[0] += frame[i] * k; out[1] += frame[i + 1] * k; out[2] += frame[i + 2] * k; out[3] += frame[i + 3] * k;
  }
}

async function build(preset) {
  if (!existsSync(preset.source)) throw new Error(`Missing master ${path.relative(root, preset.source)}`);
  const image = await sharp(preset.source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { cols, rows, cellWidth: w, cellHeight: h, frames, mouthX, mouthY, ignite, decay } = preset;
  const keyHeight = preset.srcCellHeight;
  const srcCellWidth = Math.round(image.info.width / preset.srcCols);
  const origins = preset.autoSlice
    ? sliceByBodies(image, preset.srcCols, preset.srcRows, keyHeight)
    : null;
  const keys = preset.keys.map((index) => {
    const frame = origins
      ? extractWindow(image, origins[index][0] - 16, origins[index][1], w, keyHeight, preset.alphaFloor ?? 0)
      : extractWindow(image, (index % preset.srcCols) * srcCellWidth, Math.floor(index / preset.srcCols) * keyHeight, w, keyHeight, preset.alphaFloor ?? 0);
    keepMainFlame(frame, w, keyHeight);
    const body = measureBody(frame, w, keyHeight);
    const { right, vertical } = preset.sourceFeather;
    for (let y = 0; y < keyHeight; y++) {
      let rowStart = 0; while (rowStart < w && frame[(y * w + rowStart) * 4 + 3] < 0.3) rowStart++;
      for (let x = 0; x < w; x++) {
        const left = preset.trimLeft ? smooth(body.bodyX + 2, body.bodyX + 14, x) * smooth(rowStart, rowStart + 12, x) : 1;
        const k = left * smooth(w - 1, w - right, x) * smooth(0, vertical, y) * smooth(keyHeight - 1, keyHeight - 1 - vertical, y);
        const i = (y * w + x) * 4; frame[i] *= k; frame[i + 1] *= k; frame[i + 2] *= k; frame[i + 3] *= k;
      }
    }
    return { frame, ...body };
  });

  const texel = new Float32Array(4);
  const sheet = Buffer.alloc(cols * w * rows * h * 4);
  for (let f = 0; f < frames; f++) {
    const timeline = f / (frames - 1) * (keys.length - 1);
    const weights = keys.map((_, index) => { const d = Math.abs(timeline - index); return d < 1 ? Math.pow(1 - d, preset.dissolvePower) : 0; });
    const maxWeight = Math.max(...weights);
    const colour = new Float32Array(w * h * 4), transparency = new Float32Array(w * h).fill(1);
    const igniteT = ignite > 0 ? clamp((f + 1) / (ignite + 1)) : 1;
    const decayT = decay > 0 ? clamp((f - (frames - decay)) / Math.max(1, decay - 1)) : 0;
    const front = mouthX + (w * 1.12 - mouthX) * (1 - Math.pow(1 - igniteT, 2));
    const tail = decayT > 0 ? mouthX + (w * 1.05 - mouthX) * Math.pow(decayT, 1.2) : -1;
    keys.forEach((key, index) => {
      const weight = weights[index]; if (weight <= 0) return;
      // Each key streams outward over its lifetime: stretch grows from the mouth.
      const stretch = preset.lengthScale * (1 + preset.flow * (timeline - index)) * (f < ignite ? lerp(0.82, 1, igniteT) : 1);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const squash = 1 - (preset.headSquash ?? 0) * smooth(w * 0.4, w * 0.9, x);
        const sx = (x - mouthX) / stretch + key.bodyX + preset.bodyInset;
        const sy = (y - mouthY) / (Math.sqrt(stretch) * squash) + key.axisY;
        sampleBilinear(key.frame, w, keyHeight, sx, sy, texel);
        if (texel[3] <= 0) continue;
        const i = y * w + x;
        colour[i * 4] += texel[0] * weight; colour[i * 4 + 1] += texel[1] * weight; colour[i * 4 + 2] += texel[2] * weight; colour[i * 4 + 3] += texel[3] * weight;
        transparency[i] *= Math.pow(1 - Math.min(0.999, texel[3]), weight / maxWeight);
      }
    });
    const ox = (f % cols) * w, oy = Math.floor(f / cols) * h, sheetWidth = cols * w;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, weightedAlpha = colour[i * 4 + 3];
      // Union alpha keeps dissolves solid; colour is the alpha-weighted blend.
      let a = 1 - transparency[i];
      let r = weightedAlpha > 0 ? colour[i * 4] / weightedAlpha * a : 0;
      let g = weightedAlpha > 0 ? colour[i * 4 + 1] / weightedAlpha * a : 0;
      let b = weightedAlpha > 0 ? colour[i * 4 + 2] / weightedAlpha * a : 0;
      let k = 1;
      if (preset.cone) { const halfHeight = 7 + Math.max(0, x - mouthX) * 0.62; k *= smooth(halfHeight + 10, halfHeight - 3, Math.abs(y - mouthY)); }
      const noise = fbm(x * 0.045 + 3, y * 0.06 + f * 0.35);
      if (f < ignite) { const edge = front + (noise - 0.5) * 70; k *= smooth(edge + 6, edge - 26, x); }
      let cool = [1, 1, 1];
      if (tail >= 0) {
        const edge = tail + (noise - 0.5) * 90;
        k *= smooth(edge - 12, edge + 30, x) * (1 - 0.55 * decayT);
        cool = preset.cool.map((c) => lerp(1, c, decayT));
      }
      k *= smooth(w, w - preset.rightFeather, x) * smooth(0, 5, y) * smooth(h, h - 5, y);
      r *= k * cool[0]; g *= k * cool[1]; b *= k * cool[2]; a *= k;
      if (preset.nozzle) {
        // One steady white-hot mouth glow shared by every frame.
        const dx = (x - mouthX + 4) / preset.nozzle.length;
        const dy = (y - mouthY) / (preset.nozzle.width + Math.max(0, x - mouthX + 4) * 0.28);
        const glow = Math.exp(-dx * dx * 1.5 - dy * dy * 2) * (x >= mouthX - 8 ? 1 : 0)
          * (1 - smooth(0, 0.3, decayT)) * igniteT * 0.95;
        if (glow > 0.002) { r = glow + r * (1 - glow); g = 0.93 * glow + g * (1 - glow); b = 0.7 * glow + b * (1 - glow); a = glow + a * (1 - glow); }
      }
      const o = ((oy + y) * sheetWidth + ox + x) * 4;
      if (a > 0.001) { sheet[o] = Math.min(255, r / a * 255); sheet[o + 1] = Math.min(255, g / a * 255); sheet[o + 2] = Math.min(255, b / a * 255); }
      sheet[o + 3] = Math.round(clamp(a) * 255);
    }
  }
  await sharp(sheet, { raw: { width: cols * w, height: rows * h, channels: 4 } })
    .webp({ quality: 82, alphaQuality: 90, effort: 6, smartSubsample: true })
    .toFile(preset.output);
  const meta = await sharp(preset.output).metadata();
  process.stdout.write(`${path.relative(root, preset.output)} ${meta.width}x${meta.height}, ${frames} frames at ${w}x${h}\n`);
}

const requested = process.argv.slice(2);
for (const name of requested.length ? requested : Object.keys(presets)) {
  if (!presets[name]) throw new Error(`Unknown breath preset "${name}" (expected ${Object.keys(presets).join(", ")})`);
  await build(presets[name]);
}
